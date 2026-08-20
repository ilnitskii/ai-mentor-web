from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from mentor_pipeline.errors import PipelineError

MAX_USERS = 10
MAX_EVENTS_PER_USER = 500
MAX_REVIEWS_PER_USER = 100


class PipelineConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supabase_url: str
    secret_key: SecretStr
    timeout_seconds: float = Field(default=20, ge=1, le=120)

    @field_validator("supabase_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urllib.parse.urlparse(value.rstrip("/"))
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("SUPABASE_URL must be an HTTPS project URL without credentials")
        return value.rstrip("/")

    @field_validator("secret_key")
    @classmethod
    def validate_key(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 20:
            raise ValueError("SUPABASE_SECRET_KEY is missing or invalid")
        return value

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> PipelineConfig:
        source = environ or os.environ
        try:
            return cls(
                supabase_url=source["SUPABASE_URL"],
                secret_key=SecretStr(source["SUPABASE_SECRET_KEY"]),
            )
        except (KeyError, ValueError) as error:
            raise PipelineError(
                "CONFIG_INVALID",
                "Supabase pipeline environment is incomplete or invalid",
            ) from error


class HttpTransport(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        query: Mapping[str, str] | None = None,
        rows: Any | None = None,
        timeout: float = 20,
    ) -> list[dict[str, Any]]: ...


class UrllibTransport:
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        query: Mapping[str, str] | None = None,
        rows: Any | None = None,
        timeout: float = 20,
    ) -> list[dict[str, Any]]:
        target = f"{url}?{urllib.parse.urlencode(query)}" if query else url
        payload = None if rows is None else json.dumps(rows, ensure_ascii=False).encode()
        request = urllib.request.Request(target, data=payload, headers=dict(headers), method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            raise PipelineError("DATABASE_ERROR", "Supabase Data API request failed") from error
        if not body:
            return []
        decoded = json.loads(body)
        if not isinstance(decoded, list):
            raise PipelineError("DATABASE_ERROR", "Supabase Data API returned invalid JSON")
        return decoded


class Cursor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    received_at: str = "1970-01-01T00:00:00Z"
    event_id: str = ""


class UserBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str
    profile: dict[str, Any]
    events: list[dict[str, Any]]
    pending_reviews: list[dict[str, Any]]
    next_cursor: Cursor


class PipelineAdapter(Protocol):
    def fetch_user_batches(self, cursors: Mapping[str, Cursor]) -> list[UserBatch]: ...

    def read_table(self, table: str) -> list[dict[str, Any]]: ...

    def upsert_rows(self, table: str, rows: list[dict[str, Any]]) -> None: ...

    def publish_bundle(
        self,
        *,
        run_id: str,
        user_id: str,
        report: dict[str, Any],
        assignment: dict[str, Any],
        reviews: list[dict[str, Any]],
        input_cursor: dict[str, Any],
    ) -> bool: ...


class SupabasePipelineAdapter:
    def __init__(
        self,
        config: PipelineConfig,
        transport: HttpTransport | None = None,
    ) -> None:
        self._config = config
        self._transport = transport or UrllibTransport()

    def _headers(self, *, write: bool = False) -> dict[str, str]:
        key = self._config.secret_key.get_secret_value()
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        }
        if write:
            headers.update(
                {
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                }
            )
        return headers

    def _request(
        self,
        table: str,
        *,
        query: Mapping[str, str] | None = None,
        rows: Any | None = None,
    ) -> list[dict[str, Any]]:
        return self._transport.request(
            "POST" if rows is not None else "GET",
            f"{self._config.supabase_url}/rest/v1/{table}",
            headers=self._headers(write=rows is not None),
            query=query,
            rows=rows,
            timeout=self._config.timeout_seconds,
        )

    def fetch_user_batches(self, cursors: Mapping[str, Cursor]) -> list[UserBatch]:
        profiles = self._request(
            "profiles",
            query={
                "select": "user_id,timezone,goal,level,learning_role",
                "limit": str(MAX_USERS + 1),
            },
        )
        if len(profiles) > MAX_USERS:
            raise PipelineError("BATCH_TOO_LARGE", "Too many profiles for one mentor run")
        batches = []
        for profile in sorted(profiles, key=lambda item: str(item["user_id"])):
            user_id = str(profile["user_id"])
            cursor = cursors.get(user_id, Cursor())
            events = self._request(
                "progress_events",
                query={
                    "select": (
                        "schema_version,event_id,user_id,device_id,profile_id,item_id,"
                        "event_type,occurred_at,timezone,payload,received_at"
                    ),
                    "user_id": f"eq.{user_id}",
                    "received_at": f"gte.{cursor.received_at}",
                    "order": "received_at.asc,event_id.asc",
                    "limit": str(MAX_EVENTS_PER_USER + 1),
                },
            )
            events = [
                item
                for item in events
                if (str(item["received_at"]), str(item["event_id"]))
                > (cursor.received_at, cursor.event_id)
            ]
            if len(events) > MAX_EVENTS_PER_USER:
                raise PipelineError("BATCH_TOO_LARGE", "User event batch exceeds safe bound")
            pending = self._request(
                "pending_reviews",
                query={
                    "select": (
                        "review_id,attempt_id,user_id,task_id,answer,status,submitted_at"
                    ),
                    "user_id": f"eq.{user_id}",
                    "status": "eq.pending_review",
                    "order": "submitted_at.asc,review_id.asc",
                    "limit": str(MAX_REVIEWS_PER_USER + 1),
                },
            )
            if len(pending) > MAX_REVIEWS_PER_USER:
                raise PipelineError("BATCH_TOO_LARGE", "Pending review batch exceeds safe bound")
            next_cursor = cursor
            if events:
                last = events[-1]
                next_cursor = Cursor(
                    received_at=str(last["received_at"]), event_id=str(last["event_id"])
                )
            batches.append(
                UserBatch(
                    user_id=user_id,
                    profile=profile,
                    events=events,
                    pending_reviews=pending,
                    next_cursor=next_cursor,
                )
            )
        return batches

    def read_table(self, table: str) -> list[dict[str, Any]]:
        if table not in {"weekly_reports", "assignments", "reviews"}:
            raise PipelineError("BACKUP_TABLE_DENIED", "Table is outside backup allowlist")
        return self._request(table, query={"select": "*", "limit": "1000"})

    def upsert_rows(self, table: str, rows: list[dict[str, Any]]) -> None:
        if table not in {"weekly_reports", "assignments", "reviews"}:
            raise PipelineError("BACKUP_TABLE_DENIED", "Table is outside restore allowlist")
        if rows:
            self._request(table, rows=rows)

    def publish_bundle(
        self,
        *,
        run_id: str,
        user_id: str,
        report: dict[str, Any],
        assignment: dict[str, Any],
        reviews: list[dict[str, Any]],
        input_cursor: dict[str, Any],
    ) -> bool:
        response = self._transport.request(
            "POST",
            f"{self._config.supabase_url}/rest/v1/rpc/publish_weekly_bundle",
            headers=self._headers(write=True),
            rows={
                "p_run_id": run_id,
                "p_user_id": user_id,
                "p_report": report,
                "p_assignment": assignment,
                "p_reviews": reviews,
                "p_input_cursor": input_cursor,
            },
            timeout=self._config.timeout_seconds,
        )
        return bool(response and response[0].get("published"))


@dataclass
class FakePipelineAdapter:
    profiles: list[dict[str, Any]]
    events: list[dict[str, Any]]
    pending_reviews: list[dict[str, Any]]
    tables: dict[str, list[dict[str, Any]]]
    fail_reads: bool = False
    fail_publish: bool = False
    published_run_ids: set[str] | None = None

    def fetch_user_batches(self, cursors: Mapping[str, Cursor]) -> list[UserBatch]:
        if self.fail_reads:
            raise PipelineError("DATABASE_ERROR", "Synthetic database failure")
        batches = []
        for profile in sorted(self.profiles, key=lambda item: str(item["user_id"])):
            user_id = str(profile["user_id"])
            cursor = cursors.get(user_id, Cursor())
            events = sorted(
                (
                    item
                    for item in self.events
                    if item["user_id"] == user_id
                    and (str(item["received_at"]), str(item["event_id"]))
                    > (cursor.received_at, cursor.event_id)
                ),
                key=lambda item: (str(item["received_at"]), str(item["event_id"])),
            )
            pending = [
                item
                for item in self.pending_reviews
                if item["user_id"] == user_id and item["status"] == "pending_review"
            ]
            next_cursor = cursor
            if events:
                next_cursor = Cursor(
                    received_at=str(events[-1]["received_at"]),
                    event_id=str(events[-1]["event_id"]),
                )
            batches.append(
                UserBatch(
                    user_id=user_id,
                    profile=deepcopy(profile),
                    events=deepcopy(events),
                    pending_reviews=deepcopy(pending),
                    next_cursor=next_cursor,
                )
            )
        return batches

    def read_table(self, table: str) -> list[dict[str, Any]]:
        if self.fail_reads:
            raise PipelineError("DATABASE_ERROR", "Synthetic database failure")
        return deepcopy(self.tables.get(table, []))

    def upsert_rows(self, table: str, rows: list[dict[str, Any]]) -> None:
        self.tables[table] = deepcopy(rows)

    def publish_bundle(
        self,
        *,
        run_id: str,
        user_id: str,
        report: dict[str, Any],
        assignment: dict[str, Any],
        reviews: list[dict[str, Any]],
        input_cursor: dict[str, Any],
    ) -> bool:
        del input_cursor
        if self.fail_publish:
            raise PipelineError("DATABASE_ERROR", "Synthetic publish failure")
        if self.published_run_ids is None:
            self.published_run_ids = set()
        if run_id in self.published_run_ids:
            return False
        self.published_run_ids.add(run_id)
        self.tables.setdefault("weekly_reports", []).append(
            {**deepcopy(report), "user_id": user_id}
        )
        self.tables.setdefault("assignments", []).append(
            {**deepcopy(assignment), "user_id": user_id}
        )
        self.tables.setdefault("reviews", []).extend(
            {**deepcopy(review), "user_id": user_id} for review in reviews
        )
        return True

import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { MentorDatabase } from "../data/mentorDatabase";
import type { OfflineStore } from "../data/offlineStore";
import { EventConflictError, SyncEngine } from "../data/syncEngine";
import { SyncContext, type SyncErrorCode } from "./syncContextValue";
import { useAuth } from "./useAuth";

interface SyncProviderProps extends PropsWithChildren {
  database: MentorDatabase;
  offline: OfflineStore;
}

const lastSyncKey = (userId: string) =>
  `ai-mentor:user:${userId}:last-successful-sync`;

function readLastSync(userId: string): string | null {
  try {
    return window.localStorage?.getItem(lastSyncKey(userId)) ?? null;
  } catch {
    return null;
  }
}

function writeLastSync(userId: string, value: string): void {
  try {
    window.localStorage?.setItem(lastSyncKey(userId), value);
  } catch {
    // Sync remains successful when optional UX metadata cannot be persisted.
  }
}

export function SyncProvider({
  database,
  offline,
  children,
}: SyncProviderProps) {
  const { user } = useAuth();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(
    null,
  );
  const [errorCode, setErrorCode] = useState<SyncErrorCode>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const engine = useMemo(
    () => new SyncEngine(database, offline),
    [database, offline],
  );

  const refreshPending = useCallback(async () => {
    setPendingCount(user ? await offline.pendingCount(user.id) : 0);
  }, [offline, user]);

  const syncNow = useCallback(async () => {
    if (!user) return;
    if (inFlight.current) return inFlight.current;

    const task = (async () => {
      await refreshPending();
      if (!navigator.onLine) {
        setOnline(false);
        setErrorCode("NETWORK_UNAVAILABLE");
        return;
      }

      setSyncing(true);
      setErrorCode(null);
      try {
        await engine.sync(user.id);
        const syncedAt = new Date().toISOString();
        writeLastSync(user.id, syncedAt);
        setLastSuccessfulSync(syncedAt);
      } catch (error) {
        setErrorCode(
          error instanceof EventConflictError
            ? "EVENT_CONFLICT"
            : "NETWORK_UNAVAILABLE",
        );
      } finally {
        setPendingCount(await offline.pendingCount(user.id));
        setSyncing(false);
      }
    })();

    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
    }
  }, [engine, offline, refreshPending, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.resolve(readLastSync(user.id)).then((value) => {
      if (active) setLastSuccessfulSync(value);
    });
    void syncNow();
    return () => {
      active = false;
    };
  }, [syncNow, user]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => {
      setOnline(false);
      setErrorCode("NETWORK_UNAVAILABLE");
      void refreshPending();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPending, syncNow]);

  const value = useMemo(
    () => ({
      online,
      syncing,
      pendingCount,
      lastSuccessfulSync,
      errorCode,
      syncNow,
      refreshPending,
    }),
    [
      errorCode,
      lastSuccessfulSync,
      online,
      pendingCount,
      refreshPending,
      syncNow,
      syncing,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

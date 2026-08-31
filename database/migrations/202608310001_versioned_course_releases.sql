begin;

create table if not exists public.course_releases (
  track_id text not null check (track_id ~ '^[a-z0-9][a-z0-9._-]{0,159}$'),
  release_version integer not null check (release_version > 0),
  schema_version smallint not null check (schema_version = 1),
  title text not null check (char_length(title) between 1 and 200),
  start_week smallint not null check (start_week > 0),
  end_week smallint not null check (end_week >= start_week),
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and content ->> 'track_id' = track_id
    and (content ->> 'release_version')::integer = release_version
    and (content ->> 'schema_version')::smallint = schema_version
    and jsonb_typeof(content -> 'weeks') = 'array'
    and jsonb_array_length(content -> 'weeks') = end_week - start_week + 1
  ),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('published', 'archived')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (track_id, release_version)
);

create unique index if not exists course_releases_one_published_track_idx
  on public.course_releases (track_id)
  where status = 'published';

alter table public.course_releases enable row level security;

drop policy if exists course_releases_read_published on public.course_releases;
create policy course_releases_read_published
on public.course_releases for select to anon, authenticated
using (status = 'published');

revoke all on table public.course_releases from anon, authenticated;
grant select on table public.course_releases to anon, authenticated;
grant select, insert, update, delete on table public.course_releases to service_role;

create or replace function public.publish_course_release(
  p_track_id text,
  p_release_version integer,
  p_schema_version smallint,
  p_title text,
  p_start_week smallint,
  p_end_week smallint,
  p_content jsonb,
  p_content_sha256 text
)
returns table (published boolean, track_id text, release_version integer, content_sha256 text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_hash text;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'COURSE_PUBLISH_FORBIDDEN' using errcode = '42501';
  end if;

  select cr.content_sha256 into existing_hash
  from public.course_releases cr
  where cr.track_id = p_track_id and cr.release_version = p_release_version
  for update;

  if existing_hash is not null and existing_hash <> p_content_sha256 then
    raise exception 'COURSE_RELEASE_IMMUTABLE' using errcode = '23505';
  end if;

  update public.course_releases cr
  set status = 'archived'
  where cr.track_id = p_track_id
    and cr.status = 'published'
    and cr.release_version <> p_release_version;

  insert into public.course_releases (
    track_id, release_version, schema_version, title, start_week, end_week,
    content, content_sha256, status
  ) values (
    p_track_id, p_release_version, p_schema_version, p_title, p_start_week, p_end_week,
    p_content, p_content_sha256, 'published'
  )
  on conflict (track_id, release_version) do update
  set status = 'published', published_at = now();

  return query select existing_hash is null, p_track_id, p_release_version, p_content_sha256;
end;
$$;

revoke all on function public.publish_course_release(text, integer, smallint, text, smallint, smallint, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_course_release(text, integer, smallint, text, smallint, smallint, jsonb, text) to service_role;

commit;

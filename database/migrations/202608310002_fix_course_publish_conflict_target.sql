begin;

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
  on conflict on constraint course_releases_pkey do update
  set status = 'published', published_at = now();

  return query select existing_hash is null, p_track_id, p_release_version, p_content_sha256;
end;
$$;

revoke all on function public.publish_course_release(text, integer, smallint, text, smallint, smallint, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_course_release(text, integer, smallint, text, smallint, smallint, jsonb, text) to service_role;

commit;

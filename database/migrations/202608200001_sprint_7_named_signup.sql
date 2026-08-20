begin;

alter table public.profiles
  add column if not exists display_name text not null default 'Ученик'
    check (char_length(display_name) between 1 and 80 and display_name !~ '[[:cntrl:]]'),
  add column if not exists username_key text;

update public.profiles
set username_key = user_id::text
where username_key is null;

alter table public.profiles
  alter column username_key set not null;

alter table public.profiles
  drop constraint if exists profiles_username_key_format;
alter table public.profiles
  add constraint profiles_username_key_format
  check (
    char_length(username_key) between 2 and 40
    and username_key !~ '[[:cntrl:]@]'
    and username_key ~ '^[[:alnum:]_. -]+$'
  );

create unique index if not exists profiles_username_key_unique_idx
  on public.profiles (username_key);

create or replace function public.set_profile_identity_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username_key is null then
    new.username_key := new.user_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_identity_defaults on public.profiles;
create trigger profiles_set_identity_defaults
before insert on public.profiles
for each row execute function public.set_profile_identity_defaults();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(regexp_replace(
    btrim(coalesce(new.raw_user_meta_data ->> 'username_key', '')),
    '[[:space:]]+', ' ', 'g'
  ));
  requested_display_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(requested_username) < 2
     or char_length(requested_username) > 40
     or requested_username !~ '^[[:alnum:]_. -]+$' then
    requested_username := new.id::text;
  end if;

  if char_length(requested_display_name) < 1
     or char_length(requested_display_name) > 80
     or requested_display_name ~ '[[:cntrl:]]' then
    requested_display_name := 'Ученик';
  end if;

  insert into public.profiles (user_id, username_key, display_name)
  values (new.id, requested_username, requested_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (user_id, username_key, display_name)
select
  users.id,
  case
    when char_length(lower(regexp_replace(btrim(coalesce(users.raw_user_meta_data ->> 'username_key', '')), '[[:space:]]+', ' ', 'g'))) between 2 and 40
      and lower(regexp_replace(btrim(coalesce(users.raw_user_meta_data ->> 'username_key', '')), '[[:space:]]+', ' ', 'g')) ~ '^[[:alnum:]_. -]+$'
    then lower(regexp_replace(btrim(users.raw_user_meta_data ->> 'username_key'), '[[:space:]]+', ' ', 'g'))
    else users.id::text
  end,
  case
    when char_length(btrim(coalesce(users.raw_user_meta_data ->> 'display_name', ''))) between 1 and 80
      and btrim(coalesce(users.raw_user_meta_data ->> 'display_name', '')) !~ '[[:cntrl:]]'
    then btrim(users.raw_user_meta_data ->> 'display_name')
    else 'Ученик'
  end
from auth.users as users
where not exists (
  select 1 from public.profiles as profiles where profiles.user_id = users.id
)
on conflict do nothing;

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.set_profile_identity_defaults() from public;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin, service_role;
grant execute on function public.set_profile_identity_defaults() to service_role;

commit;

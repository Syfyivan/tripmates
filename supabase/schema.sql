create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id text primary key,
  title text not null,
  destination text not null default '',
  date_range text not null default '',
  invite_code text not null unique,
  member_names text[] not null default '{}',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.city_members (
  city_id text not null references public.cities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (city_id, user_id)
);

create table if not exists public.city_entries (
  id text primary key,
  city_id text not null references public.cities(id) on delete cascade,
  kind text not null check (kind in ('idea', 'guide', 'plan', 'memory')),
  title text not null,
  note text not null,
  source_url text,
  ai_summary text,
  tag text not null,
  author_name text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  meta text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.codex_exports (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.city_members enable row level security;
alter table public.city_entries enable row level security;
alter table public.codex_exports enable row level security;

create index if not exists codex_exports_token_idx on public.codex_exports(token);
create index if not exists codex_exports_city_id_idx on public.codex_exports(city_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_cities_updated_at on public.cities;
create trigger touch_cities_updated_at
before update on public.cities
for each row execute function public.touch_updated_at();

drop trigger if exists touch_city_entries_updated_at on public.city_entries;
create trigger touch_city_entries_updated_at
before update on public.city_entries
for each row execute function public.touch_updated_at();

create or replace function public.add_city_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.city_members (city_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (city_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists add_city_owner_member on public.cities;
create trigger add_city_owner_member
after insert on public.cities
for each row execute function public.add_city_owner_member();

create or replace function public.is_city_member(city_id_input text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.city_members
    where city_members.city_id = city_id_input
      and city_members.user_id = auth.uid()
  );
$$;

create or replace function public.join_city_by_invite(invite_code_input text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_city_id text;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  select id
  into target_city_id
  from public.cities
  where invite_code = upper(trim(invite_code_input))
  limit 1;

  if target_city_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.city_members (city_id, user_id, role)
  values (target_city_id, auth.uid(), 'member')
  on conflict (city_id, user_id) do nothing;

  return target_city_id;
end;
$$;

grant execute on function public.join_city_by_invite(text) to authenticated;
grant execute on function public.is_city_member(text) to authenticated;

create or replace function public.create_codex_export(city_id_input text)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_token text;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if not public.is_city_member(city_id_input) then
    raise exception 'City membership required';
  end if;

  loop
    next_token := upper(encode(gen_random_bytes(8), 'hex'));

    begin
      return query
      insert into public.codex_exports (city_id, token, created_by, expires_at)
      values (city_id_input, next_token, auth.uid(), now() + interval '15 minutes')
      returning codex_exports.token, codex_exports.expires_at;

      return;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$;

create or replace function public.read_codex_export(token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  export_row public.codex_exports%rowtype;
  payload jsonb;
begin
  select *
  into export_row
  from public.codex_exports
  where token = upper(trim(token_input))
    and expires_at > now()
  limit 1;

  if export_row.id is null then
    raise exception 'Invalid or expired Codex export code';
  end if;

  update public.codex_exports
  set last_used_at = now()
  where id = export_row.id;

  select jsonb_build_object(
    'export', jsonb_build_object(
      'token', export_row.token,
      'expires_at', export_row.expires_at
    ),
    'city', jsonb_build_object(
      'id', cities.id,
      'title', cities.title,
      'destination', cities.destination,
      'date_range', cities.date_range,
      'invite_code', cities.invite_code,
      'member_names', cities.member_names
    ),
    'entries', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', city_entries.id,
          'kind', city_entries.kind,
          'title', city_entries.title,
          'note', city_entries.note,
          'source_url', city_entries.source_url,
          'ai_summary', city_entries.ai_summary,
          'tag', city_entries.tag,
          'author_name', city_entries.author_name,
          'meta', city_entries.meta,
          'created_at', city_entries.created_at,
          'updated_at', city_entries.updated_at
        )
        order by city_entries.created_at desc
      ) filter (where city_entries.id is not null),
      '[]'::jsonb
    )
  )
  into payload
  from public.cities
  left join public.city_entries on city_entries.city_id = cities.id
  where cities.id = export_row.city_id
  group by cities.id;

  return payload;
end;
$$;

grant execute on function public.create_codex_export(text) to authenticated;
grant execute on function public.read_codex_export(text) to anon, authenticated;

drop policy if exists "profiles are self readable" on public.profiles;
create policy "profiles are self readable"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles are self updatable" on public.profiles;
create policy "profiles are self updatable"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "cities are readable by members" on public.cities;
create policy "cities are readable by members"
on public.cities
for select
to authenticated
using (public.is_city_member(id));

drop policy if exists "city owners can create cities" on public.cities;
create policy "city owners can create cities"
on public.cities
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "city owners can update cities" on public.cities;
create policy "city owners can update cities"
on public.cities
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "members are readable by city members" on public.city_members;
create policy "members are readable by city members"
on public.city_members
for select
to authenticated
using (public.is_city_member(city_id));

drop policy if exists "entries are readable by city members" on public.city_entries;
create policy "entries are readable by city members"
on public.city_entries
for select
to authenticated
using (public.is_city_member(city_id));

drop policy if exists "entries are writable by city members" on public.city_entries;
create policy "entries are writable by city members"
on public.city_entries
for insert
to authenticated
with check (public.is_city_member(city_id));

drop policy if exists "entries are updatable by city members" on public.city_entries;
create policy "entries are updatable by city members"
on public.city_entries
for update
to authenticated
using (public.is_city_member(city_id))
with check (public.is_city_member(city_id));

drop policy if exists "entries are deletable by city members" on public.city_entries;
create policy "entries are deletable by city members"
on public.city_entries
for delete
to authenticated
using (public.is_city_member(city_id));

drop policy if exists "codex exports are readable by creators" on public.codex_exports;
create policy "codex exports are readable by creators"
on public.codex_exports
for select
to authenticated
using (created_by = auth.uid());

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
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

create table if not exists public.trip_members (
  trip_id text not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.trip_entries (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('idea', 'guide', 'plan', 'memory')),
  title text not null,
  note text not null,
  tag text not null,
  author_name text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  meta text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_entries enable row level security;

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

drop trigger if exists touch_trips_updated_at on public.trips;
create trigger touch_trips_updated_at
before update on public.trips
for each row execute function public.touch_updated_at();

drop trigger if exists touch_trip_entries_updated_at on public.trip_entries;
create trigger touch_trip_entries_updated_at
before update on public.trip_entries
for each row execute function public.touch_updated_at();

create or replace function public.add_trip_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists add_trip_owner_member on public.trips;
create trigger add_trip_owner_member
after insert on public.trips
for each row execute function public.add_trip_owner_member();

create or replace function public.join_trip_by_invite(invite_code_input text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trip_id text;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  select id
  into target_trip_id
  from public.trips
  where invite_code = upper(trim(invite_code_input))
  limit 1;

  if target_trip_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (target_trip_id, auth.uid(), 'member')
  on conflict (trip_id, user_id) do nothing;

  return target_trip_id;
end;
$$;

grant execute on function public.join_trip_by_invite(text) to authenticated;

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

drop policy if exists "trips are readable by members" on public.trips;
create policy "trips are readable by members"
on public.trips
for select
to authenticated
using (
  exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trips.id
      and trip_members.user_id = auth.uid()
  )
);

drop policy if exists "trip owners can create trips" on public.trips;
create policy "trip owners can create trips"
on public.trips
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "trip owners can update trips" on public.trips;
create policy "trip owners can update trips"
on public.trips
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "members are readable by trip members" on public.trip_members;
create policy "members are readable by trip members"
on public.trip_members
for select
to authenticated
using (
  exists (
    select 1 from public.trip_members viewer
    where viewer.trip_id = trip_members.trip_id
      and viewer.user_id = auth.uid()
  )
);

drop policy if exists "entries are readable by trip members" on public.trip_entries;
create policy "entries are readable by trip members"
on public.trip_entries
for select
to authenticated
using (
  exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_entries.trip_id
      and trip_members.user_id = auth.uid()
  )
);

drop policy if exists "entries are writable by trip members" on public.trip_entries;
create policy "entries are writable by trip members"
on public.trip_entries
for insert
to authenticated
with check (
  exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_entries.trip_id
      and trip_members.user_id = auth.uid()
  )
);

drop policy if exists "entries are updatable by trip members" on public.trip_entries;
create policy "entries are updatable by trip members"
on public.trip_entries
for update
to authenticated
using (
  exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_entries.trip_id
      and trip_members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_entries.trip_id
      and trip_members.user_id = auth.uid()
  )
);

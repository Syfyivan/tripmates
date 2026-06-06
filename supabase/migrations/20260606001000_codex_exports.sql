create extension if not exists pgcrypto;

create table if not exists public.codex_exports (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.codex_exports enable row level security;

create index if not exists codex_exports_token_idx on public.codex_exports(token);
create index if not exists codex_exports_city_id_idx on public.codex_exports(city_id);

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

drop policy if exists "codex exports are readable by creators" on public.codex_exports;
create policy "codex exports are readable by creators"
on public.codex_exports
for select
to authenticated
using (created_by = auth.uid());

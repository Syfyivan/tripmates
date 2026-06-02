alter table public.city_entries
add column if not exists source_url text,
add column if not exists ai_summary text;

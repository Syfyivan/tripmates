drop policy if exists "entries are deletable by city members" on public.city_entries;
create policy "entries are deletable by city members"
on public.city_entries
for delete
to authenticated
using (public.is_city_member(city_id));

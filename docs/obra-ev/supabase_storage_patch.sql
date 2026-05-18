insert into storage.buckets (id, name, public)
values ('obra-documentos', 'obra-documentos', false)
on conflict (id) do nothing;

drop policy if exists "admin read obra documentos storage" on storage.objects;
drop policy if exists "admin insert obra documentos storage" on storage.objects;
drop policy if exists "admin update obra documentos storage" on storage.objects;
drop policy if exists "admin delete obra documentos storage" on storage.objects;

create policy "admin read obra documentos storage"
on storage.objects for select to authenticated
using (bucket_id = 'obra-documentos' and public.is_admin());

create policy "admin insert obra documentos storage"
on storage.objects for insert to authenticated
with check (bucket_id = 'obra-documentos' and public.is_admin());

create policy "admin update obra documentos storage"
on storage.objects for update to authenticated
using (bucket_id = 'obra-documentos' and public.is_admin())
with check (bucket_id = 'obra-documentos' and public.is_admin());

create policy "admin delete obra documentos storage"
on storage.objects for delete to authenticated
using (bucket_id = 'obra-documentos' and public.is_admin());

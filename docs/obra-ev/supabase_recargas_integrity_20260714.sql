-- Applied to project csxafzuaqbbsbdatuhrd on 2026-07-14.
-- Restricts operational writes to application profiles and prevents profile escalation.

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_access_obra_app() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_access_obra_app() to authenticated, service_role;

drop policy if exists "Enable read for authenticated users only" on public.obra_recargas_base;
drop policy if exists "Enable insert for authenticated users only" on public.obra_recargas_base;
drop policy if exists "Enable update for authenticated users only" on public.obra_recargas_base;

create policy "recargas base leitura por perfil do app"
on public.obra_recargas_base for select to authenticated
using (public.can_access_obra_app());

create policy "recargas base insert por perfil do app"
on public.obra_recargas_base for insert to authenticated
with check (public.can_access_obra_app());

create policy "recargas base update por perfil do app"
on public.obra_recargas_base for update to authenticated
using (public.can_access_obra_app())
with check (public.can_access_obra_app());

drop policy if exists "historico recargas leitura autenticada" on public.obra_recargas_historico;
drop policy if exists "historico recargas insert autenticado" on public.obra_recargas_historico;

create policy "historico recargas leitura por perfil do app"
on public.obra_recargas_historico for select to authenticated
using (public.can_access_obra_app());

create policy "historico recargas insert por perfil do app"
on public.obra_recargas_historico for insert to authenticated
with check (
  public.can_access_obra_app()
  and (usuario_id is null or usuario_id = (select auth.uid()))
);

drop policy if exists "audit log leitura autenticada" on public.app_audit_log;
drop policy if exists "audit log insert autenticado" on public.app_audit_log;

create policy "audit log leitura por perfil do app"
on public.app_audit_log for select to authenticated
using (public.can_access_obra_app());

create policy "audit log insert por perfil do app"
on public.app_audit_log for insert to authenticated
with check (
  public.can_access_obra_app()
  and (usuario_id is null or usuario_id = (select auth.uid()))
);

drop policy if exists "admin all profiles" on public.profiles;

create policy "profiles leitura propria ou admin"
on public.profiles for select to authenticated
using (public.is_admin() or id = (select auth.uid()));

create policy "profiles insert admin"
on public.profiles for insert to authenticated
with check (public.is_admin());

create policy "profiles update admin"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles delete admin"
on public.profiles for delete to authenticated
using (public.is_admin());

drop policy if exists "obras leitura por perfil do app" on public.obras;
create policy "obras leitura por perfil do app"
on public.obras for select to authenticated
using (public.can_access_obra_app());

create index if not exists obra_analisadores_obra_id_idx
on public.obra_analisadores (obra_id);

create index if not exists planejamento_engenharia_obra_id_idx
on public.planejamento_engenharia (obra_id);

-- Keep helper functions out of the public API while retaining their RLS use.
drop policy if exists "admin all obras" on public.obras;

create policy "obras insert admin"
on public.obras for insert to authenticated
with check (public.is_admin());

create policy "obras update admin"
on public.obras for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "obras delete admin"
on public.obras for delete to authenticated
using (public.is_admin());

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_admin() set schema private;
alter function public.can_access_obra_app() set schema private;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.can_access_obra_app() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.can_access_obra_app() to authenticated, service_role;

-- Reject accidental empty replacements at the database boundary and keep the
-- summary count aligned with the authoritative recargas array.
create or replace function private.guard_recharge_base_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_count integer := 0;
  new_count integer := 0;
begin
  new_count := json_array_length(coalesce(new.recargas, '[]'::json));
  if tg_op = 'UPDATE' then
    old_count := json_array_length(coalesce(old.recargas, '[]'::json));
    if old_count > 0
       and new_count = 0
       and not (coalesce(new.resumo, '{}'::json)::jsonb ? 'clearedAt') then
      raise exception 'Accidental empty recharge overwrite blocked for work %', new.obra_id;
    end if;
  end if;
  new.resumo := jsonb_set(
    coalesce(new.resumo, '{}'::json)::jsonb,
    '{charges}',
    to_jsonb(new_count),
    true
  )::json;
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists guard_recharge_base_integrity on public.obra_recargas_base;
create trigger guard_recharge_base_integrity
before insert or update on public.obra_recargas_base
for each row execute function private.guard_recharge_base_integrity();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'obra_recargas_base_obra_id_fkey'
      and conrelid = 'public.obra_recargas_base'::regclass
  ) then
    alter table public.obra_recargas_base
      add constraint obra_recargas_base_obra_id_fkey
      foreign key (obra_id) references public.obras(id)
      on update cascade on delete restrict;
  end if;
end;
$$;

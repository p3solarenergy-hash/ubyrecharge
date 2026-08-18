-- UBY Recharge - acesso seguro ao cadastro geral de clientes
-- Projeto: csxafzuaqbbsbdatuhrd
-- Execute no Supabase SQL Editor depois de confirmar que public.profiles
-- contem os perfis autorizados (admin ou engenharia). Neste projeto a
-- verificacao de acesso fica no schema privado.

alter table public.recharge_customers enable row level security;

-- O cadastro tem dados pessoais; nunca deve ser acessivel pelo papel anon.
revoke all on table public.recharge_customers from anon;
grant select, insert, update on table public.recharge_customers to authenticated;
revoke delete on table public.recharge_customers from authenticated;

drop policy if exists "clientes recarga select por perfil do app" on public.recharge_customers;
drop policy if exists "clientes recarga insert por perfil do app" on public.recharge_customers;
drop policy if exists "clientes recarga update por perfil do app" on public.recharge_customers;

create policy "clientes recarga select por perfil do app"
on public.recharge_customers
for select
to authenticated
using (private.can_access_obra_app());

create policy "clientes recarga insert por perfil do app"
on public.recharge_customers
for insert
to authenticated
with check (private.can_access_obra_app());

create policy "clientes recarga update por perfil do app"
on public.recharge_customers
for update
to authenticated
using (private.can_access_obra_app())
with check (private.can_access_obra_app());

-- Validacao: deve retornar as tres politicas acima e grants para authenticated.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'recharge_customers'
order by policyname;

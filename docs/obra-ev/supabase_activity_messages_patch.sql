create table if not exists public.obra_atividade (
  id text primary key,
  obra_id text,
  obra_nome text,
  tipo text not null default 'update',
  titulo text,
  detalhe text,
  campo text,
  valor_anterior text,
  valor_novo text,
  usuario_id text,
  usuario_nome text,
  usuario_email text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at_client timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.obra_mensagens (
  id text primary key,
  obra_id text,
  obra_nome text,
  mensagem text not null,
  usuario_id text,
  usuario_nome text,
  usuario_email text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at_client timestamptz,
  created_at timestamptz not null default now()
);

alter table public.obra_atividade enable row level security;
alter table public.obra_mensagens enable row level security;

create or replace function public.can_access_obra_app()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and perfil in ('admin', 'engenharia')
  );
$$;

drop policy if exists "obra app all atividade" on public.obra_atividade;
drop policy if exists "obra app all mensagens" on public.obra_mensagens;

create policy "obra app all atividade"
on public.obra_atividade
for all to authenticated
using (public.can_access_obra_app())
with check (public.can_access_obra_app());

create policy "obra app all mensagens"
on public.obra_mensagens
for all to authenticated
using (public.can_access_obra_app())
with check (public.can_access_obra_app());

create table if not exists public.operational_tasks (
  id text primary key,
  titulo text not null,
  projeto text,
  responsavel text,
  prazo date,
  prioridade text,
  status text not null default 'Pendente',
  observacao text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operational_tasks enable row level security;

drop policy if exists "admin all operational tasks" on public.operational_tasks;

create policy "admin all operational tasks"
on public.operational_tasks
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

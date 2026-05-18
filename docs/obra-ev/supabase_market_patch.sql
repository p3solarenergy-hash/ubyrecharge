create table if not exists public.mercado_items (
  id text primary key,
  tipo text not null default 'indicador',
  titulo text not null,
  valor text,
  unidade text,
  segmento text,
  regiao text,
  status text,
  fonte text,
  url text,
  observacao text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mercado_items enable row level security;

drop policy if exists "obra app all mercado" on public.mercado_items;

create policy "obra app all mercado"
on public.mercado_items for all to authenticated
using (public.can_access_obra_app())
with check (public.can_access_obra_app());

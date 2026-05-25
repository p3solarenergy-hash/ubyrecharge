create table if not exists public.obra_recargas_base (
  obra_id text primary key references public.obras(id) on delete cascade,
  arquivos jsonb not null default '[]'::jsonb,
  recargas jsonb not null default '[]'::jsonb,
  resumo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.obra_recargas_base enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'obra_recargas_base'
      and policyname = 'Enable read for authenticated users only'
  ) then
    create policy "Enable read for authenticated users only"
    on public.obra_recargas_base
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'obra_recargas_base'
      and policyname = 'Enable insert for authenticated users only'
  ) then
    create policy "Enable insert for authenticated users only"
    on public.obra_recargas_base
    for insert
    to authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'obra_recargas_base'
      and policyname = 'Enable update for authenticated users only'
  ) then
    create policy "Enable update for authenticated users only"
    on public.obra_recargas_base
    for update
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

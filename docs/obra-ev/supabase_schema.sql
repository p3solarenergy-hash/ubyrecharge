create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  perfil text not null check (perfil in ('admin', 'engenharia')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obras (
  id text primary key,
  nome text not null,
  cliente text,
  local text,
  status_exec text,
  progresso numeric default 0,
  potencia_kw numeric default 0,
  carregadores text,
  criticas integer default 0,
  origem text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obra_fases (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obras(id) on delete cascade,
  nome text not null,
  responsavel text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, nome)
);

create table if not exists public.obra_tarefas (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obras(id) on delete cascade,
  fase text not null,
  titulo text not null,
  status text not null default 'pending',
  protocolo text,
  data_pedido date,
  data_prevista date,
  responsavel text,
  observacao text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, fase, titulo)
);

create table if not exists public.obra_documentos (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obras(id) on delete cascade,
  documento_id text not null,
  nome text not null,
  fase text,
  status text,
  responsavel text,
  prazo date,
  link text,
  storage_path text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, documento_id)
);

create table if not exists public.obra_analisadores (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obras(id) on delete cascade,
  titulo text,
  url text,
  pico_medido text,
  consumo_estimado text,
  potencia_ev text,
  status_tecnico text,
  acao_sugerida text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planejamento_engenharia (
  id uuid primary key default gen_random_uuid(),
  obra_id text references public.obras(id) on delete cascade,
  etapa text not null,
  responsavel text,
  data_prevista date,
  status text not null default 'Aberto',
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospeccao_areas (
  id text primary key,
  ponto text not null,
  cidade text,
  uf text,
  prioridade text,
  tipo text,
  status text,
  etapa text,
  contato text,
  potencia_kw numeric,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obra_snapshots (
  id uuid primary key default gen_random_uuid(),
  origin text,
  keys_count integer default 0,
  payload jsonb not null,
  created_at_client timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.obras enable row level security;
alter table public.obra_fases enable row level security;
alter table public.obra_tarefas enable row level security;
alter table public.obra_documentos enable row level security;
alter table public.obra_analisadores enable row level security;
alter table public.planejamento_engenharia enable row level security;
alter table public.prospeccao_areas enable row level security;
alter table public.obra_snapshots enable row level security;

drop policy if exists "admin all profiles" on public.profiles;
drop policy if exists "admin all obras" on public.obras;
drop policy if exists "admin all fases" on public.obra_fases;
drop policy if exists "admin all tarefas" on public.obra_tarefas;
drop policy if exists "admin all documentos" on public.obra_documentos;
drop policy if exists "admin all analisadores" on public.obra_analisadores;
drop policy if exists "admin all planejamento" on public.planejamento_engenharia;
drop policy if exists "admin all prospeccao" on public.prospeccao_areas;
drop policy if exists "admin all snapshots" on public.obra_snapshots;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and perfil = 'admin'
  );
$$;

create policy "admin all profiles" on public.profiles for all to authenticated using (public.is_admin() or id = auth.uid()) with check (public.is_admin() or id = auth.uid());
create policy "admin all obras" on public.obras for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all fases" on public.obra_fases for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all tarefas" on public.obra_tarefas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all documentos" on public.obra_documentos for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all analisadores" on public.obra_analisadores for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all planejamento" on public.planejamento_engenharia for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all prospeccao" on public.prospeccao_areas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all snapshots" on public.obra_snapshots for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Depois de criar seu usuario em Authentication > Users, rode uma vez:
-- insert into public.profiles (id, nome, perfil)
-- select id, email, 'admin'
-- from auth.users
-- where email = 'SEU_EMAIL_AQUI'
-- on conflict (id) do update set perfil = 'admin', updated_at = now();

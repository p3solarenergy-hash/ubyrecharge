create table if not exists public.obra_recargas_historico (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null,
  acao text not null default 'snapshot',
  origem text,
  arquivos jsonb not null default '[]'::jsonb,
  recargas jsonb not null default '[]'::jsonb,
  resumo jsonb not null default '{}'::jsonb,
  recargas_count integer not null default 0,
  arquivos_count integer not null default 0,
  usuario_id uuid,
  usuario_email text,
  base_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists obra_recargas_historico_obra_created_idx
  on public.obra_recargas_historico (obra_id, created_at desc);

create index if not exists obra_recargas_historico_acao_idx
  on public.obra_recargas_historico (acao, created_at desc);

alter table public.obra_recargas_historico enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'obra_recargas_historico'
      and policyname = 'historico recargas leitura autenticada'
  ) then
    create policy "historico recargas leitura autenticada"
    on public.obra_recargas_historico
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'obra_recargas_historico'
      and policyname = 'historico recargas insert autenticado'
  ) then
    create policy "historico recargas insert autenticado"
    on public.obra_recargas_historico
    for insert
    to authenticated
    with check (true);
  end if;
end $$;

create table if not exists public.app_audit_log (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  entidade_tipo text not null,
  entidade_id text,
  acao text not null,
  resumo jsonb not null default '{}'::jsonb,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

create index if not exists app_audit_log_entidade_idx
  on public.app_audit_log (entidade_tipo, entidade_id, created_at desc);

alter table public.app_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_audit_log'
      and policyname = 'audit log leitura autenticada'
  ) then
    create policy "audit log leitura autenticada"
    on public.app_audit_log
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_audit_log'
      and policyname = 'audit log insert autenticado'
  ) then
    create policy "audit log insert autenticado"
    on public.app_audit_log
    for insert
    to authenticated
    with check (true);
  end if;
end $$;

insert into public.obra_recargas_historico (
  obra_id,
  acao,
  origem,
  arquivos,
  recargas,
  resumo,
  recargas_count,
  arquivos_count,
  base_updated_at
)
select
  obra_id,
  'snapshot_inicial_migracao',
  'migration_recargas_history_and_audit',
  coalesce(arquivos::jsonb, '[]'::jsonb),
  coalesce(recargas::jsonb, '[]'::jsonb),
  coalesce(resumo::jsonb, '{}'::jsonb),
  jsonb_array_length(coalesce(recargas::jsonb, '[]'::jsonb)),
  jsonb_array_length(coalesce(arquivos::jsonb, '[]'::jsonb)),
  updated_at
from public.obra_recargas_base b
where not exists (
  select 1
  from public.obra_recargas_historico h
  where h.obra_id = b.obra_id
    and h.acao = 'snapshot_inicial_migracao'
);

insert into public.app_audit_log (modulo, entidade_tipo, entidade_id, acao, resumo)
values (
  'recargas',
  'sistema',
  'migration_recargas_history_and_audit',
  'snapshot_inicial_migracao',
  jsonb_build_object('descricao', 'Historico de recargas criado e bases atuais preservadas')
);

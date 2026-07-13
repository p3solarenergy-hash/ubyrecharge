-- Snapshot diario da estrutura operacional UBY.
-- As recargas permanecem protegidas por obra_recargas_historico.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.create_daily_uby_platform_snapshot()
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  snapshot_id uuid;
begin
  insert into public.obra_snapshots (origin, keys_count, payload, created_at_client)
  values (
    'automatic_daily_database_backup',
    6,
    jsonb_build_object(
      'version', 2,
      'captured_at', now(),
      'obras', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.obras x), '[]'::jsonb),
      'obra_fases', coalesce((select jsonb_agg(to_jsonb(x) order by x.obra_id, x.nome) from public.obra_fases x), '[]'::jsonb),
      'obra_tarefas', coalesce((select jsonb_agg(to_jsonb(x) order by x.obra_id, x.fase, x.titulo) from public.obra_tarefas x), '[]'::jsonb),
      'obra_documentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.obra_id, x.nome) from public.obra_documentos x), '[]'::jsonb),
      'obra_analisadores', coalesce((select jsonb_agg(to_jsonb(x) order by x.obra_id) from public.obra_analisadores x), '[]'::jsonb),
      'planejamento_engenharia', coalesce((select jsonb_agg(to_jsonb(x) order by x.obra_id, x.etapa) from public.planejamento_engenharia x), '[]'::jsonb)
    ),
    now()
  )
  returning id into snapshot_id;

  delete from public.obra_snapshots
  where origin = 'automatic_daily_database_backup'
    and created_at < now() - interval '60 days';

  return snapshot_id;
end;
$$;

revoke all on function public.create_daily_uby_platform_snapshot() from public, anon, authenticated;
grant execute on function public.create_daily_uby_platform_snapshot() to postgres;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'uby-platform-daily-backup'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'uby-platform-daily-backup',
    '30 3 * * *',
    'select public.create_daily_uby_platform_snapshot();'
  );
end;
$$;

-- Atomic recharge import: archive, normalize and save with one client request.
create or replace function public.save_recharge_base_atomic(
  p_obra_id text,
  p_files jsonb,
  p_charges jsonb,
  p_summary jsonb,
  p_mutation_intent text default 'save'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  previous public.obra_recargas_base%rowtype;
  existing_count integer := 0;
  inserted_count integer := 0;
  charge_count integer := 0;
  file_count integer := 0;
  explicit_empty boolean := false;
begin
  if auth.uid() is null or not private.can_access_obra_app() then
    raise exception 'Acesso negado';
  end if;
  if not exists (select 1 from public.obras where id = p_obra_id) then
    raise exception 'Obra inexistente: %', p_obra_id;
  end if;
  if jsonb_typeof(coalesce(p_charges, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_files, '[]'::jsonb)) <> 'array' then
    raise exception 'Carga invalida';
  end if;

  charge_count := jsonb_array_length(coalesce(p_charges, '[]'::jsonb));
  file_count := jsonb_array_length(coalesce(p_files, '[]'::jsonb));
  explicit_empty := coalesce(p_mutation_intent, 'save') in (
    'explicit_empty_replace', 'month_correction', 'undo_import', 'remove_file'
  );

  select * into previous
  from public.obra_recargas_base
  where obra_id = p_obra_id
  for update;

  if found then
    existing_count := case
      when json_typeof(coalesce(previous.recargas, '[]'::json)) = 'array'
        then json_array_length(coalesce(previous.recargas, '[]'::json))
      else 0
    end;
    if charge_count = 0 and existing_count > 0 and not explicit_empty then
      raise exception 'Gravacao vazia bloqueada: a base em nuvem possui % recarga(s).', existing_count;
    end if;

    insert into public.obra_recargas_historico(
      obra_id, acao, origem, arquivos, recargas, resumo,
      recargas_count, arquivos_count, usuario_id, usuario_email, base_updated_at
    )
    values (
      p_obra_id, 'before_upsert', 'saveRechargeBaseAtomic',
      coalesce(previous.arquivos, '[]'::jsonb),
      coalesce(previous.recargas::jsonb, '[]'::jsonb),
      coalesce(previous.resumo::jsonb, '{}'::jsonb),
      existing_count,
      case
        when jsonb_typeof(coalesce(previous.arquivos, '[]'::jsonb)) = 'array'
          then jsonb_array_length(coalesce(previous.arquivos, '[]'::jsonb))
        else 0
      end,
      auth.uid(),
      coalesce(auth.jwt() ->> 'email', ''),
      previous.updated_at
    );
  end if;

  inserted_count := public.replace_recharge_sessions(p_obra_id, coalesce(p_charges, '[]'::jsonb));

  insert into public.obra_recargas_base(obra_id, arquivos, recargas, resumo, updated_at)
  values (
    p_obra_id,
    coalesce(p_files, '[]'::jsonb),
    coalesce(p_charges, '[]'::jsonb)::json,
    coalesce(p_summary, '{}'::jsonb)::json,
    now()
  )
  on conflict (obra_id) do update set
    arquivos = excluded.arquivos,
    recargas = excluded.recargas,
    resumo = excluded.resumo,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'files', file_count,
    'charges', charge_count,
    'normalizedCharges', inserted_count,
    'history', previous.obra_id is not null
  );
end
$function$;

revoke all on function public.save_recharge_base_atomic(text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_recharge_base_atomic(text, jsonb, jsonb, jsonb, text) to authenticated;

create index if not exists recharge_sessions_started_at_idx
  on public.recharge_sessions(started_at desc)
  where started_at is not null;

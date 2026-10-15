-- Clube UBY — benefícios nos parceiros com QR fixo no balcão.
-- Usado pela função clube-beneficio (página pública nova/beneficio.html) e pela tela Clube UBY.
-- Aplicar uma vez no SQL Editor do Supabase. Pode ser reaplicado sem perda (if not exists / or replace).

-- Usos registrados quando o cliente toca "USAR AGORA" no caixa do parceiro.
create table if not exists public.club_partner_uses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  partner_id text not null,
  benefit_id text not null,
  description text not null,
  client_key text not null,          -- tel:<ddd+número> ou mail:<e-mail>
  client_name text,
  code text not null,
  status text not null default 'CONFIRMADO' check (status in ('CONFIRMADO', 'CANCELADO')),
  cancelled_at timestamptz,
  cancelled_by uuid
);
create index if not exists club_partner_uses_partner_client_idx on public.club_partner_uses (partner_id, client_key, created_at desc);
create index if not exists club_partner_uses_created_idx on public.club_partner_uses (created_at desc);

-- Celulares lembrados (o navegador guarda só um token aleatório; aqui fica o hash).
create table if not exists public.club_devices (
  token_hash text primary key,
  client_key text not null,
  client_phone text,
  client_email text,
  client_name text,
  status text not null default 'ATIVO',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists club_devices_client_idx on public.club_devices (client_key, status);

-- Tentativas de identificação erradas (bloqueio de 15 min após 5 erros).
create table if not exists public.club_identify_attempts (
  identifier_hash text primary key,
  failures integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.club_partner_uses enable row level security;
alter table public.club_devices enable row level security;
alter table public.club_identify_attempts enable row level security;

-- A equipe (mesmo acesso da plataforma: private.can_access_obra_app) lê os usos e pode cancelar um uso errado.
-- Aparelhos e tentativas não têm política: só a função (service role) acessa.
drop policy if exists "club uses admin select" on public.club_partner_uses;
create policy "club uses admin select" on public.club_partner_uses
  for select to authenticated using (private.can_access_obra_app());
drop policy if exists "club uses admin cancel" on public.club_partner_uses;
create policy "club uses admin cancel" on public.club_partner_uses
  for update to authenticated using (private.can_access_obra_app()) with check (private.can_access_obra_app());

-- Encontra o cliente nas sessões de recarga das estações UBY (qualquer cliente que recarregou).
-- p_phone: chave do celular = DDD + 8 últimos dígitos (mesma regra de normPhone na função):
-- ignora +55, zeros à esquerda e o 9 extra; número com dígitos a menos/a mais não casa.
-- p_email: minúsculo. Devolve o registro mais recente; client_phone volta como chave.
create or replace function public.club_find_client(p_phone text, p_email text, p_work_ids text[])
returns table (client_name text, client_phone text, client_email text, sessions bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (
    select user_name,
           ltrim(regexp_replace(coalesce(user_phone, ''), '\D', '', 'g'), '0') as d1,
           lower(trim(coalesce(user_email, ''))) as mail,
           started_at
    from public.recharge_sessions
    where obra_id = any(p_work_ids) and coalesce(revenue, 0) > 0
  ), n as (
    select *, case when length(d1) >= 12 and left(d1, 2) = '55' then ltrim(substr(d1, 3), '0') else d1 end as d2 from s
  ), k as (
    select *, case when length(d2) between 10 and 11 then left(d2, 2) || right(d2, 8) end as phone_key from n
  ), m as (
    select * from k
    where (length(coalesce(p_phone, '')) = 10 and phone_key = p_phone)
       or (coalesce(p_email, '') <> '' and mail = p_email)
  )
  select (array_agg(nullif(trim(user_name), '') order by started_at desc nulls last) filter (where coalesce(trim(user_name), '') <> ''))[1],
         (array_agg(phone_key order by started_at desc nulls last) filter (where phone_key is not null))[1],
         (array_agg(mail order by started_at desc nulls last) filter (where mail <> ''))[1],
         count(*)
  from m
  having count(*) > 0;
$$;

-- Registra o uso com trava por parceiro: toque duplo devolve o mesmo uso, e o limite
-- por período / lote é conferido de novo dentro da transação (duas pessoas ao mesmo tempo).
create or replace function public.club_register_use(
  p_partner_id text, p_benefit_id text, p_description text, p_client_key text, p_client_name text,
  p_period text, p_limit integer, p_lote integer, p_valid_minutes integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.club_partner_uses%rowtype;
  total integer;
  agora timestamp := now() at time zone 'America/Sao_Paulo';
begin
  perform pg_advisory_xact_lock(hashtext('club-partner:' || p_partner_id));

  select * into existing from public.club_partner_uses
   where partner_id = p_partner_id and client_key = p_client_key and status = 'CONFIRMADO'
     and created_at > now() - make_interval(mins => p_valid_minutes)
   order by created_at desc limit 1;
  if found then return jsonb_build_object('ok', true, 'reused', true, 'use', to_jsonb(existing)); end if;

  if coalesce(p_period, 'DIA') <> 'ILIMITADO' then
    select count(*) into total from public.club_partner_uses
     where partner_id = p_partner_id and client_key = p_client_key and status = 'CONFIRMADO'
       and (p_period = 'TOTAL'
         or (p_period = 'DIA' and (created_at at time zone 'America/Sao_Paulo')::date = agora::date)
         or (p_period = 'SEMANA' and date_trunc('week', created_at at time zone 'America/Sao_Paulo') = date_trunc('week', agora))
         or (p_period = 'MES' and date_trunc('month', created_at at time zone 'America/Sao_Paulo') = date_trunc('month', agora)));
    if total >= coalesce(p_limit, 0) then return jsonb_build_object('ok', false, 'reason', 'limite'); end if;
  end if;

  if p_lote is not null then
    select count(*) into total from public.club_partner_uses
     where partner_id = p_partner_id and benefit_id = p_benefit_id and status = 'CONFIRMADO';
    if total >= p_lote then return jsonb_build_object('ok', false, 'reason', 'esgotado'); end if;
  end if;

  insert into public.club_partner_uses (partner_id, benefit_id, description, client_key, client_name, code)
  values (p_partner_id, p_benefit_id, p_description, p_client_key, p_client_name, (1000 + floor(random() * 9000))::int::text)
  returning * into existing;
  return jsonb_build_object('ok', true, 'reused', false, 'use', to_jsonb(existing));
end $$;

revoke all on function public.club_find_client(text, text, text[]) from public, anon, authenticated;
revoke all on function public.club_register_use(text, text, text, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.club_find_client(text, text, text[]) to service_role;
grant execute on function public.club_register_use(text, text, text, text, text, text, integer, integer, integer) to service_role;

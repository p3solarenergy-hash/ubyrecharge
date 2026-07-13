-- Biblioteca duravel de relatorios financeiros por obra, ponto e periodo.
-- Fechamentos ficam imutaveis; correcoes geram uma nova versao.

create table if not exists public.obra_finance_reports (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obras(id) on update cascade on delete restrict,
  station_key text not null default '',
  station_name text not null default '',
  report_type text not null check (report_type in ('charger_financial', 'partner_area', 'investor')),
  period_key text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'partial' check (status in ('partial', 'closed')),
  version integer not null default 1 check (version > 0),
  payload jsonb not null default '{}'::jsonb,
  generated_by uuid references auth.users(id) on delete set null,
  generated_by_email text,
  generated_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint obra_finance_reports_period_check check (period_start <= period_end),
  constraint obra_finance_reports_version_unique unique (obra_id, station_key, report_type, period_key, version)
);

create index if not exists obra_finance_reports_work_period_idx
  on public.obra_finance_reports (obra_id, period_end desc, report_type, station_key);

create index if not exists obra_finance_reports_status_idx
  on public.obra_finance_reports (status, period_end desc);

create index if not exists obra_finance_reports_generated_by_idx
  on public.obra_finance_reports (generated_by)
  where generated_by is not null;

create or replace function public.guard_finance_report_updates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'closed' then
    raise exception 'Relatorio financeiro fechado e imutavel. Crie uma nova versao para corrigir.';
  end if;

  if new.status = 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_finance_report_updates_trigger on public.obra_finance_reports;
create trigger guard_finance_report_updates_trigger
before insert or update on public.obra_finance_reports
for each row execute function public.guard_finance_report_updates();

alter table public.obra_finance_reports enable row level security;

drop policy if exists "finance reports select por perfil do app" on public.obra_finance_reports;
drop policy if exists "finance reports insert por perfil do app" on public.obra_finance_reports;
drop policy if exists "finance reports update por perfil do app" on public.obra_finance_reports;

create policy "finance reports select por perfil do app"
on public.obra_finance_reports
for select
to authenticated
using (public.can_access_obra_app());

create policy "finance reports insert por perfil do app"
on public.obra_finance_reports
for insert
to authenticated
with check (public.can_access_obra_app());

create policy "finance reports update por perfil do app"
on public.obra_finance_reports
for update
to authenticated
using (public.can_access_obra_app())
with check (public.can_access_obra_app());

revoke all on table public.obra_finance_reports from anon;
revoke delete on table public.obra_finance_reports from authenticated;
grant select, insert, update on table public.obra_finance_reports to authenticated;
grant all on table public.obra_finance_reports to service_role;

revoke execute on function public.guard_finance_report_updates() from public, anon, authenticated;
grant execute on function public.guard_finance_report_updates() to postgres, service_role;

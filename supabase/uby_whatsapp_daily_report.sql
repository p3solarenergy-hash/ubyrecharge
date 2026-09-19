-- UBY WhatsApp daily report: execute once in the Supabase SQL Editor before
-- enabling delivery. Stores only hashed recipients and delivery state.
create table if not exists public.uby_whatsapp_delivery_log (
  id uuid primary key default gen_random_uuid(),
  competence_key date not null,
  template_name text not null,
  recipient_hash text not null,
  status text not null check (status in ('queued', 'sent', 'failed', 'uncertain')),
  graph_message_id text,
  graph_error_code text,
  graph_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uby_whatsapp_delivery_idempotency_idx
  on public.uby_whatsapp_delivery_log (competence_key, template_name, recipient_hash);

create index if not exists uby_whatsapp_delivery_status_idx
  on public.uby_whatsapp_delivery_log (status, created_at desc);

alter table public.uby_whatsapp_delivery_log enable row level security;

-- The table must remain inaccessible to browser roles even if the Data API is
-- configured to expose future public tables. The Edge Function uses service_role.
revoke all on table public.uby_whatsapp_delivery_log from anon, authenticated;
grant select, insert, update on table public.uby_whatsapp_delivery_log to service_role;

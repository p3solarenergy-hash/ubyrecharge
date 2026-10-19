-- UBY notificações no celular (Web Push): execute uma vez no SQL Editor do
-- Supabase antes de publicar a função uby-push. Guarda o endereço de entrega
-- de cada aparelho que tocou em "Ativar notificações".
create table if not exists public.uby_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz
);

create index if not exists uby_push_subscriptions_user_idx
  on public.uby_push_subscriptions (user_id);

alter table public.uby_push_subscriptions enable row level security;

-- Só a função uby-push (service_role) lê e grava: o navegador nunca acessa a
-- tabela direto, nem se a Data API passar a expor tabelas novas.
revoke all on table public.uby_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.uby_push_subscriptions to service_role;

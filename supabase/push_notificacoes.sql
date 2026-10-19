-- UBY notificações no celular (Web Push): execute uma vez no SQL Editor do
-- Supabase antes de publicar a função uby-push. Guarda o endereço de entrega
-- de cada aparelho que tocou em "Ativar notificações" e o par de chaves VAPID.
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

-- Par de chaves VAPID (uma linha só). A função uby-push gera e grava na
-- primeira chamada, então a chave privada nunca sai do banco. Se os segredos
-- VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY existirem na função, eles valem no lugar.
create table if not exists public.uby_push_vapid (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

alter table public.uby_push_vapid enable row level security;

revoke all on table public.uby_push_vapid from anon, authenticated;
grant select, insert on table public.uby_push_vapid to service_role;

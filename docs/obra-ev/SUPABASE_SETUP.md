# Setup Supabase - UBY Recharge

## 1. Criar tabelas

No Supabase, abra `SQL Editor` e rode o arquivo:

`docs/obra-ev/supabase_schema.sql`

## 2. Criar usuario admin

No Supabase, abra `Authentication > Users` e crie seu usuario com e-mail e senha.

Depois volte ao `SQL Editor` e rode:

```sql
insert into public.profiles (id, nome, perfil)
select id, email, 'admin'
from auth.users
where email = 'SEU_EMAIL_AQUI'
on conflict (id) do update set perfil = 'admin', updated_at = now();
```

## 3. Configurar o site

No arquivo `docs/obra-ev/supabase_config.js`, preencher:

```js
window.UBY_SUPABASE_CONFIG = {
  url: "SUA_PROJECT_URL",
  anonKey: "SUA_ANON_KEY",
  enabled: true
};
```

Use apenas a chave anon/publishable. Nunca coloque service_role no HTML.

## 4. Migrar dados locais

1. Abra o dashboard de obras.
2. Clique em `Login Supabase`.
3. Entre com seu usuario.
4. Volte ao dashboard.
5. Clique em `Ver status`.
6. Clique em `Migrar base local`.

Essa etapa copia os dados locais para a nuvem. Ela nao apaga a base local.

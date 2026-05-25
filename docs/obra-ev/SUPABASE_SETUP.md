# Setup Supabase - UBY Recharge

## 1. Criar tabelas

No Supabase, abra `SQL Editor` e rode o arquivo:

`docs/obra-ev/supabase_schema.sql`

Esse arquivo agora tambem cria as tabelas `operational_tasks`, `obra_atividade`, `obra_mensagens` e `obra_recargas_base`. Elas fazem tarefas, historico, mensagens e planilhas de recargas por obra virarem banco real.

Se voce ja rodou o schema antigo e quer aplicar apenas a mudanca nova, rode:

`docs/obra-ev/supabase_operational_tasks_patch.sql`

Depois rode tambem:

`docs/obra-ev/supabase_activity_messages_patch.sql`

Para liberar upload real de documentos da obra, rode tambem:

`docs/obra-ev/supabase_storage_patch.sql`

Para ativar a nova pagina de Mercado com banco real, rode tambem:

`docs/obra-ev/supabase_market_patch.sql`

Para salvar a ultima planilha de recargas por obra/projeto, rode tambem:

`docs/obra-ev/supabase_recargas_patch.sql`

Para garantir que a base principal apareca igual para todos os perfis, rode:

`docs/obra-ev/supabase_seed_core_works.sql`

Esse seed fixa as 4 obras principais no banco: Rio Beach EV, Posto Robert Koch R.K., Posto Duim e Posto Araguaia.

## 2. Criar usuario admin

No Supabase, abra `Authentication > Users` e crie os usuarios com e-mail e senha.

A senha fica somente no Supabase Auth. Nao coloque senha em arquivo do projeto.

Depois volte ao `SQL Editor`, edite os e-mails no arquivo abaixo e rode:

`docs/obra-ev/supabase_profiles_setup_template.sql`

Se quiser criar apenas um admin rapido, rode:

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
7. Clique em `Migrar prospeccao`.
8. Abra `Tarefas`; ao criar/alterar tarefas, elas passam a salvar em `operational_tasks`.
9. Abra a central ou uma obra, envie uma mensagem e altere um protocolo/status para validar `obra_mensagens` e `obra_atividade`.
10. Em uma obra, envie um arquivo em `Base de documentos da obra` para validar o bucket `obra-documentos`.

Essa etapa copia os dados locais para a nuvem. Ela nao apaga a base local.

## 5. Validar banco real

No `SQL Editor`, rode:

```sql
select count(*) from public.obras;
select count(*) from public.prospeccao_areas;
select count(*) from public.operational_tasks;
select count(*) from public.obra_atividade;
select count(*) from public.obra_mensagens;
select count(*) from public.mercado_items;
```

Para conferir a base principal:

```sql
select id, nome, status_exec, progresso, potencia_kw
from public.obras
where id in ('rio', 'malassise', 'prospect-1', 'prospect-29')
order by nome;
```

Se alguma consulta falhar, o schema novo ainda nao foi executado no projeto Supabase atual.

Para validar o armazenamento de documentos, confira em `Storage` se existe o bucket privado `obra-documentos`.

-- UBY Recharge - perfis de acesso
--
-- Como usar:
-- 1. No Supabase, crie os usuarios em Authentication > Users.
-- 2. Defina a senha de cada usuario na propria tela do Supabase.
-- 3. Edite apenas os e-mails, nomes e perfis abaixo.
-- 4. Rode este arquivo no SQL Editor.
--
-- Perfis aceitos:
-- - admin: acesso completo
-- - engenharia: acesso tecnico sem administracao geral

with desired_profiles(email, nome, perfil) as (
  values
    ('SEU_EMAIL_ADMIN@EXEMPLO.COM', 'Eduardo / Admin', 'admin'),
    ('EMAIL_P3_SOLAR@EXEMPLO.COM', 'P3 Solar / Admin', 'admin'),
    ('EMAIL_ENGENHARIA@EXEMPLO.COM', 'Alan / Engenharia', 'engenharia')
)
insert into public.profiles (id, nome, perfil)
select
  users.id,
  desired_profiles.nome,
  desired_profiles.perfil
from desired_profiles
join auth.users users
  on lower(users.email) = lower(desired_profiles.email)
on conflict (id)
do update set
  nome = excluded.nome,
  perfil = excluded.perfil,
  updated_at = now();

-- Conferencia: deve listar os perfis criados/atualizados.
select
  users.email,
  profiles.nome,
  profiles.perfil,
  profiles.updated_at
from public.profiles profiles
join auth.users users on users.id = profiles.id
order by profiles.perfil, users.email;

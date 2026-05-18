insert into public.obras (
  id,
  nome,
  cliente,
  local,
  status_exec,
  progresso,
  potencia_kw,
  carregadores,
  criticas,
  origem,
  raw_data,
  updated_at
)
values
  (
    'rio',
    'Rio Beach EV',
    'Rio Beach',
    'Rua Luiz Lerco 159',
    'Concluida',
    100,
    7,
    '1 x 7 kW',
    0,
    'seed-core',
    '{"id":"rio","nome":"Rio Beach EV","cliente":"Rio Beach","local":"Rua Luiz Lerco 159","status":"Concluida","kind":"ok","pct":100,"kw":7,"carregadores":"1 x 7 kW","crit":0,"flags":["Obra completa"],"link":"gestao_obra_ev_detalhe.html"}'::jsonb,
    now()
  ),
  (
    'malassise',
    'Posto Robert Koch R.K.',
    'Malassise Robert Koch',
    'Maringa - PR',
    'Projeto',
    42,
    60,
    '1 x 60 kW',
    4,
    'seed-core',
    '{"id":"malassise","nome":"Posto Robert Koch R.K.","cliente":"Malassise Robert Koch","local":"Maringa - PR","status":"Projeto","kind":"warn","pct":42,"kw":60,"carregadores":"1 x 60 kW","crit":4,"flags":["Aumento de carga","Trafo a validar","Orcamento civil"],"link":"gestao_obra_ev_detalhe.html?obra=malassise"}'::jsonb,
    now()
  ),
  (
    'prospect-1',
    'Posto Duim',
    'Posto Duim',
    'Av. Maringa, 241 - Londrina/PR',
    'Projeto',
    0,
    60,
    '1 x 60 kW',
    0,
    'seed-core',
    '{"id":"prospect-1","nome":"Posto Duim","cliente":"Posto Duim","local":"Av. Maringa, 241 - Londrina/PR","status":"Projeto","kind":"warn","pct":0,"kw":60,"carregadores":"1 x 60 kW","crit":0,"flags":["Obra real","Estudo realizado","DLM a validar"],"link":"gestao_obra_ev_detalhe.html?obra=prospect-1"}'::jsonb,
    now()
  ),
  (
    'prospect-29',
    'Posto Araguaia',
    'Malassise Araguaia',
    'Av Araguaia - Londrina/PR',
    'Projeto',
    0,
    60,
    '1 x 60 kW',
    0,
    'seed-core',
    '{"id":"prospect-29","nome":"Posto Araguaia","cliente":"Malassise Araguaia","local":"Av Araguaia - Londrina/PR","status":"Projeto","kind":"warn","pct":0,"kw":60,"carregadores":"1 x 60 kW","crit":0,"flags":["Obra real","Analise vinculada","DLM a validar"],"link":"gestao_obra_ev_detalhe.html?obra=prospect-29"}'::jsonb,
    now()
  )
on conflict (id)
do update set
  nome = excluded.nome,
  cliente = excluded.cliente,
  local = excluded.local,
  status_exec = excluded.status_exec,
  progresso = excluded.progresso,
  potencia_kw = excluded.potencia_kw,
  carregadores = excluded.carregadores,
  criticas = excluded.criticas,
  origem = excluded.origem,
  raw_data = public.obras.raw_data || excluded.raw_data,
  updated_at = now();

select id, nome, status_exec, progresso, potencia_kw
from public.obras
where id in ('rio', 'malassise', 'prospect-1', 'prospect-29')
order by case id
  when 'rio' then 1
  when 'malassise' then 2
  when 'prospect-1' then 3
  when 'prospect-29' then 4
  else 9
end;

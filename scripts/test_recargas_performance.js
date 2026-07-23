const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlDocument = fs.readFileSync(path.join(root, 'docs', 'obra-ev', 'recargas.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'docs', 'obra-ev', 'recargas_app.js'), 'utf8');
const html = `${htmlDocument}\n${app}`;
const bridge = fs.readFileSync(path.join(root, 'docs', 'obra-ev', 'supabase_bridge.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'docs', 'obra-ev', 'supabase_recargas_fast_save_20260723.sql'),
  'utf8'
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const refreshStart = html.indexOf('async function refreshGeneralRechargeBases');
const refreshEnd = html.indexOf('async function ensureAllOverviewSessionsLoaded', refreshStart);
const refreshBody = html.slice(refreshStart, refreshEnd);

assert(refreshStart > 0 && refreshEnd > refreshStart, 'Fluxo inicial de recargas nao encontrado.');
assert(
  /loadRechargeSessions\(\{[\s\S]*?from:\s*currentMonthStart/.test(refreshBody),
  'A abertura deve limitar sessoes ao mes atual.'
);
assert(
  !/loadRechargeSessions\(\{\s*limit:\s*(?:1000|OVERVIEW_PAGE_SIZE)\s*\}\)/.test(refreshBody),
  'A abertura nao pode baixar o historico completo.'
);
assert(
  html.includes('async function ensureAllOverviewSessionsLoaded'),
  'O historico completo deve existir como carregamento sob demanda.'
);
assert(
  htmlDocument.includes('recargas_app.js?v=20260723-performance1') &&
  htmlDocument.length < 180000,
  'O motor da pagina deve ficar em arquivo externo cacheavel.'
);
assert(
  html.includes("if (document.getElementById('generalViewMode')?.value === 'accumulated')"),
  'A visao acumulada deve hidratar o historico explicitamente.'
);
assert(
  bridge.includes('.rpc("save_recharge_base_atomic"'),
  'A importacao deve usar uma unica transacao RPC.'
);
assert(
  migration.includes('insert into public.obra_recargas_historico') &&
  migration.includes('replace_recharge_sessions') &&
  migration.includes('on conflict (obra_id) do update'),
  'A gravacao atomica deve preservar historico, normalizar e atualizar a base.'
);
assert(
  !/renderGeneralFinance\(sourceUnitData\)/.test(
    html.slice(html.indexOf('async function renderGeral'), html.indexOf('async function renderAll'))
  ),
  'O financeiro oculto nao deve renderizar junto com o painel geral.'
);

console.log('Recargas performance architecture checks passed.');

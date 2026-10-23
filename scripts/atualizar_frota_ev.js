// Eletrificados por município (Mercado EV · Eletrificados por cidade). Só elétricos, plug-in e
// híbridos: a frota a combustão não entra no arquivo.
// Junta duas fontes públicas e grava docs/nova/app/data/frota-ev.json:
//  - Senatran (RENAVAM): "Frota por UF, Município e Combustível", planilha mensal. Usa o mês mais
//    recente publicado e o mesmo mês do ano anterior (crescimento em 12 meses);
//  - IBGE (SIDRA, tabela 6579): população estimada de cada município.
// Roda sozinho pelo GitHub Actions (.github/workflows/atualizar-frota-ev.yml). Precisa do pacote
// xlsx (SheetJS). Sem novidade na Senatran, não regrava nada.
//
// Uso: node scripts/atualizar_frota_ev.js [--force] [--atual arq.xlsx --anterior arq.xlsx --mes AAAA-MM --pop pop.json]
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'nova', 'app', 'data', 'frota-ev.json');
const GOV = 'https://www.gov.br';
const PAGE = year => `${GOV}/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-${year}`;
const SIDRA = 'https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/last';
const UA = { 'User-Agent': 'Mozilla/5.0 (UBY Recharge; atualizacao mensal da frota EV)' };

// Categorias de combustível da Senatran. "Plug-in" (recarrega na tomada) = elétricos + híbridos plug-in.
// Parte dos híbridos plug-in é registrada como GASOLINA/ELETRICO, então o plug-in é um piso.
const BEV = ['ELETRICO/FONTE EXTERNA', 'ELETRICO'];
const PHEV = ['HIBRIDO PLUG-IN'];
const HYBRID = ['GASOLINA/ELETRICO', 'GASOLINA/ALCOOL/ELETRICO', 'ETANOL/ELETRICO', 'DIESEL/ELETRICO', 'HIBRIDO', 'ELETRICO/FONTE INTERNA', 'HIBRIDO/GAS NATURAL VEICULAR'];

const UF = { ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES',
  GOIAS: 'GO', MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR',
  PERNAMBUCO: 'PE', PIAUI: 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO' };
const MONTHS = { janeiro: 1, fevereiro: 2, marco: 3, maro: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

// Nome comparável: sem acento, maiúsculo, só letras e números ("D'Oeste" = "D OESTE").
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
// Grafias diferentes entre Senatran e IBGE (Lagedo × Lajedo, Mello × Melo, do × de, Teresinha × Terezinha,
// "D0" digitado com zero): compara sem preposições, sem letras dobradas e com J/G, S/Z, I/Y unificados.
const loose = s => norm(s).replace(/0/g, 'O').split(' ').filter(w => !['D', 'DE', 'DA', 'DO', 'DAS', 'DOS'].includes(w)).join(' ')
  .replace(/G(?=[EI])/g, 'J').replace(/Z/g, 'S').replace(/Y/g, 'I').replace(/(.)\1+/g, '$1');
// Municípios renomeados que a Senatran ainda lista com o nome antigo (UF|nome Senatran → nome IBGE).
const RENAMED = { 'PB|SANTAREM': 'Joca Claudino', 'PB|SAO DOMINGOS DE POMBAL': 'São Domingos', 'GO|BOM JESUS': 'Bom Jesus de Goiás', 'MG|QUELUZITA': 'Queluzito',
  'RJ|TRAJANO DE MORAIS': 'Trajano de Moraes', 'RN|BOA SAUDE': 'Januário Cicco', 'RN|LAGOA DANTA': "Lagoa d'Anta", 'RS|SANTANA DO LIVRAMENTO': "Sant'Ana do Livramento",
  'RR|SAO LUIZ': 'São Luiz do Anauá', 'TO|FORTALEZA DO TABOCAO': 'Tabocão', 'TO|SAO VALERIO DA NATIVIDADE': 'São Valério' };

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : '';
}

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : as === 'json' ? res.json() : res.text();
}

// Planilhas "D_Frota_por_UF_Municipio_COMBUSTIVEL_<Mês>_<Ano>.xlsx" das páginas do ano atual e do anterior.
// O nome do arquivo varia ("copy_of_", minúsculas, "Maro" sem o ç); o mês e o ano saem do próprio nome.
function listFiles(html) {
  const out = new Map();
  for (const m of html.matchAll(/href="([^"]*COMBUSTIVEL_([A-Za-zÀ-ÿ]+)_(\d{4})[^"]*\.xlsx[^"]*)"/gi)) {
    const month = MONTHS[norm(m[2]).toLowerCase()];
    if (!month) continue;
    const key = monthKey(Number(m[3]), month);
    if (!out.has(key)) out.set(key, m[1].startsWith('http') ? m[1] : GOV + m[1]);
  }
  return out;
}

async function discover() {
  const year = new Date().getFullYear();
  const files = new Map();
  for (const y of [year, year - 1, year - 2]) {
    try { listFiles(await get(PAGE(y))).forEach((url, key) => { if (!files.has(key)) files.set(key, url); }); }
    catch (err) { console.warn(`Página ${y}: ${err.message}`); }
  }
  const keys = [...files.keys()].sort();
  if (!keys.length) throw new Error('Nenhuma planilha de frota por combustível encontrada nas páginas da Senatran.');
  const month = keys.at(-1);
  const [y, m] = month.split('-').map(Number);
  const prevMonth = monthKey(y - 1, m);
  return { month, url: files.get(month), prevMonth: files.has(prevMonth) ? prevMonth : '', prevUrl: files.get(prevMonth) || '' };
}

// Planilha → Map("UF|MUNICÍPIO") com { uf, city, bev, phev, hybrid } (todo município, mesmo sem eletrificados).
function readFleet(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const head = rows.findIndex(r => r.some(c => /combust/i.test(String(c))) && r.some(c => /munic/i.test(String(c))));
  if (head < 0) throw new Error('Cabeçalho (UF, Município, Combustível, Qtd.) não encontrado na planilha.');
  const h = rows[head].map(c => norm(c));
  const col = re => h.findIndex(c => re.test(c));
  const cUf = col(/^UF$/), cCity = col(/MUNICIPIO/), cFuel = col(/COMBUSTIVEL/), cQty = col(/QTD|QUANTIDADE/);
  if ([cUf, cCity, cFuel, cQty].some(i => i < 0)) throw new Error(`Colunas inesperadas: ${rows[head].join(' | ')}`);
  const sets = { bev: new Set(BEV.map(norm)), phev: new Set(PHEV.map(norm)), hybrid: new Set(HYBRID.map(norm)) };
  const out = new Map();
  let unknownUf = 0, unknownPlugin = 0;
  for (const r of rows.slice(head + 1)) {
    const uf = UF[norm(r[cUf])];
    const city = norm(r[cCity]);
    const qty = Number(r[cQty]) || 0;
    if (!city || !qty) continue;
    if (!uf) {
      unknownUf += qty;
      if (sets.bev.has(norm(r[cFuel])) || sets.phev.has(norm(r[cFuel]))) unknownPlugin += qty;
      continue;
    }
    const key = `${uf}|${city}`;
    const c = out.get(key) || { uf, city, bev: 0, phev: 0, hybrid: 0 };
    const fuel = norm(r[cFuel]);
    for (const k of Object.keys(sets)) if (sets[k].has(fuel)) c[k] += qty;
    out.set(key, c);
  }
  if (unknownUf) console.warn(`${unknownPlugin} plug-in sem UF/município na planilha: ficam só no total do Brasil.`);
  out.unassignedPlugin = unknownPlugin;
  return out;
}

// SIDRA → busca por "UF|MUNICÍPIO" com { ibge, name, pop }, e o ano da estimativa.
function readPopulation(rows) {
  const exact = new Map(), fuzzy = new Map();
  let year = '';
  rows.slice(1).forEach(r => {
    const m = /^(.*) - ([A-Z]{2})$/.exec(String(r.D1N || ''));
    if (!m) return;
    year = year || String(r.D3N || '');
    const p = { ibge: Number(r.D1C) || 0, name: m[1], pop: Number(r.V) || 0 };
    exact.set(`${m[2]}|${norm(m[1])}`, p);
    const fk = `${m[2]}|${loose(m[1])}`;
    fuzzy.set(fk, fuzzy.has(fk) ? null : p); // dois municípios com a mesma chave solta: não arrisca
  });
  const find = (uf, city) => exact.get(`${uf}|${city}`)
    || (RENAMED[`${uf}|${city}`] && exact.get(`${uf}|${norm(RENAMED[`${uf}|${city}`])}`))
    || fuzzy.get(`${uf}|${loose(city)}`) || null;
  return { find, year };
}

async function main() {
  const force = process.argv.includes('--force');
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  let src;
  if (arg('atual')) src = { month: arg('mes'), url: arg('atual'), prevMonth: arg('anterior') ? arg('mes-anterior') : '', prevUrl: arg('anterior') };
  else src = await discover();
  if (!/^\d{4}-\d{2}$/.test(src.month)) throw new Error(`Mês da planilha inválido: ${src.month}`);
  if (old && old.month === src.month && !force) { console.log(`Sem novidade: a Senatran ainda está em ${src.month}.`); return; }
  console.log(`Senatran: ${src.month}${src.prevMonth ? ` (comparação: ${src.prevMonth})` : ' (sem o mesmo mês do ano anterior)'}`);

  const load = u => /^https?:/.test(u) ? get(u, 'buffer') : fs.readFileSync(u);
  const now = readFleet(await load(src.url));
  const prev = src.prevUrl ? readFleet(await load(src.prevUrl)) : new Map();
  const pop = readPopulation(arg('pop') ? JSON.parse(fs.readFileSync(arg('pop'), 'utf8')) : await get(SIDRA, 'json'));

  const rows = [];
  const unmatched = [];
  now.forEach((c, key) => {
    const p = pop.find(c.uf, c.city);
    if (!p) unmatched.push(key);
    const before = prev.get(key);
    rows.push([c.uf, p ? p.name : c.city, p ? p.ibge : 0, p ? p.pop : 0, c.bev, c.phev, c.hybrid, before ? before.bev + before.phev : null, before ? before.hybrid : null]);
  });
  rows.sort((a, b) => a[0].localeCompare(b[0]) || (b[4] + b[5]) - (a[4] + a[5]) || a[1].localeCompare(b[1], 'pt-BR'));
  if (rows.length < 5000) throw new Error(`Só ${rows.length} municípios lidos: a planilha da Senatran mudou de formato.`);
  if (unmatched.length) console.warn(`${unmatched.length} município(s) sem população do IBGE: ${unmatched.slice(0, 15).join(', ')}${unmatched.length > 15 ? '…' : ''}`);

  const data = {
    generatedAt: new Date().toISOString(),
    month: src.month,
    prevMonth: src.prevMonth || '',
    populationYear: pop.year,
    sources: {
      fleet: 'Senatran (RENAVAM) · Frota por UF, Município e Combustível',
      population: `IBGE · SIDRA tabela 6579 (população estimada ${pop.year})`
    },
    categories: { bev: BEV, phev: PHEV, hybrid: HYBRID },
    // Plug-in de veículos sem UF/município na Senatran (frotas sem endereço): entram só no total do Brasil.
    unassignedPlugin: now.unassignedPlugin || 0,
    unassignedPluginPrev: src.prevUrl ? prev.unassignedPlugin || 0 : null,
    columns: ['uf', 'city', 'ibge', 'pop', 'bev', 'phev', 'hybrid', 'pluginPrev', 'hybridPrev'],
    rows
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data) + '\n');
  const plug = rows.reduce((s, r) => s + r[4] + r[5], 0);
  console.log(`Gravado ${path.relative(process.cwd(), OUT)}: ${rows.length} municípios, ${plug} plug-in no Brasil.`);
}

if (require.main === module) main().catch(err => { console.error(err.message || err); process.exit(1); });
module.exports = { listFiles, loose, readPopulation };

// Índices do Banco Central (docs/nova/app/bcb.js): leitura da API, CDI composto e 12 meses.
const assert = require('assert');
require('../docs/nova/app/bcb.js');
const B = globalThis.UBY_BCB;

const cdi = B.parse([
  { data: '01/07/2026', valor: '1.22' }, { data: '01/08/2026', valor: '1.09' },
  { data: '01/09/2026', valor: '1.08' }, { data: '01/10/2026', valor: '0.71' },
  { data: 'lixo', valor: '9' }, { data: '01/06/2026', valor: 'x' }
]);
assert.deepStrictEqual(Object.keys(cdi), ['2026-07', '2026-08', '2026-09', '2026-10'], 'ignora data ou valor inválidos');
assert.strictEqual(cdi['2026-10'], 0.71);

// Composto: (1,0122 × 1,0109 × 1,0108 − 1) × 100
const q3 = B.compound(cdi, ['2026-07', '2026-08', '2026-09']);
assert.ok(Math.abs(q3 - (1.0122 * 1.0109 * 1.0108 - 1) * 100) < 1e-9);
assert.strictEqual(B.compound(cdi, ['2026-06', '2026-07']), null, 'mês sem índice não vira zero');
assert.strictEqual(B.compound(cdi, []), null);

// 12 meses: só meses fechados já publicados, sem o mês em andamento.
const year = {};
for (let m = 1; m <= 12; m++) year[`2025-${String(m).padStart(2, '0')}`] = 1;
year['2026-01'] = 1; year['2026-02'] = 1;
const l = B.last12(year, new Date(2026, 1, 15)); // 15/02/2026: fevereiro em andamento
assert.strictEqual(l.from, '2025-02');
assert.strictEqual(l.to, '2026-01');
assert.ok(Math.abs(l.pct - (Math.pow(1.01, 12) - 1) * 100) < 1e-9);
assert.strictEqual(B.last12({ '2026-01': 1 }, new Date(2026, 1, 15)), null, 'menos de 12 meses publicados');

// load(): duas séries, guarda no navegador e reaproveita na próxima chamada.
(async () => {
  const store = {}, calls = [];
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.fetch = async url => {
    calls.push(url);
    const rows = /sgs\.4391\//.test(url) ? [{ data: '01/09/2026', valor: '1.08' }] : [{ data: '01/09/2026', valor: '0.48' }];
    return { ok: true, json: async () => rows };
  };
  const d = await B.load();
  assert.strictEqual(d.cdi['2026-09'], 1.08);
  assert.strictEqual(d.ipca['2026-09'], 0.48);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls.every(u => /^https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(4391|433)\/dados\?formato=json&dataInicial=01\/01\/\d{4}&dataFinal=\d{2}\/\d{2}\/\d{4}$/.test(u)), calls.join('\n'));
  await B.load();
  assert.strictEqual(calls.length, 2, 'segunda chamada usa o que ficou guardado');

  // API fora do ar: a promessa falha (a tela mostra o aviso) e a próxima tentativa busca de novo.
  delete store['uby-nova-bcb-v1'];
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(B.load(), /HTTP 503/);
  console.log('test_bcb: ok');
})().catch(err => { console.error(err); process.exit(1); });

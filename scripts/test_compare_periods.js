// Comparação de períodos (docs/nova/app/analytics-core.js · comparePeriods).
const assert = require('assert');
require('../docs/nova/app/analytics-core.js');
const core = globalThis.UBY_ANALYTICS_CORE;

const s = (key, day, site, kwh, revenue, valid = true) => ({ key, name: key.toUpperCase(), phone: '', site, ref: `w1|${site}`, workId: 'w1', t: Date.parse(`${day}T12:00:00Z`), day, kwh, revenue, valid });
const sessions = [
  s('ana', '2026-06-10', 'JK', 20, 40),          // cliente antiga: some em julho, volta em setembro
  s('bia', '2026-07-02', 'JK', 30, 60),           // recarrega nos dois meses
  s('bia', '2026-09-03', 'JK', 50, 100),
  s('caio', '2026-07-05', 'JK', 10, 20),          // não volta em setembro
  s('ana', '2026-09-04', 'JK', 15, 30),
  s('duda', '2026-09-20', 'JK', 40, 80),          // nova em setembro, depois do dia 15
  s('eva', '2026-09-02', 'RK', 25, 45),           // outro carregador
  s('bia', '2026-09-05', 'JK', 99, 0, false),     // inválida: não conta
  s('caio', '2026-07-25', 'JK', 5, 10)
];
const jk = x => x.site === 'JK';
const jul = { from: '2026-07-01', to: '2026-07-31', match: jk }, sep = { from: '2026-09-01', to: '2026-09-30', match: jk };

const r = core.comparePeriods(sessions, jul, sep);
assert.strictEqual(r.lastDay, '2026-09-20');
assert.strictEqual(r.a.totals.revenue, 90);
assert.strictEqual(r.b.totals.revenue, 210);
assert.strictEqual(r.b.days, 20, 'setembro em andamento conta até a última recarga importada');
assert.ok(r.b.partial && !r.a.partial);
assert.strictEqual(r.deltas.revenue.diff, 120);
assert.ok(Math.abs(r.deltas.revenue.pct - (210 / 90 - 1) * 100) < 1e-9);
assert.strictEqual(r.b.totals.sessions, 3, 'inválida fica de fora');
assert.strictEqual(r.b.totals.newClients, 1);
assert.strictEqual(r.clients.kept.count, 1);
assert.strictEqual(r.clients.lost.count, 1);
assert.strictEqual(r.clients.returned.count, 1);
assert.strictEqual(r.clients.fresh.count, 1);
const br = r.clients.bridge;
assert.strictEqual(Math.round((br.a + br.kept + br.lost + br.returned + br.fresh) * 100) / 100, br.b, 'ponte fecha no faturamento de B');
assert.strictEqual(r.clients.losers[0].name, 'CAIO');
assert.deepStrictEqual(r.a.cumulative.slice(0, 5), [0, 60, 60, 60, 80]);

// Mesmos dias: julho cortado em 20 dias (perde a recarga do dia 25), setembro também 20.
const same = core.comparePeriods(sessions, jul, sep, { sameDays: true });
assert.strictEqual(same.a.days, 20);
assert.strictEqual(same.a.toUsed, '2026-07-20');
assert.strictEqual(same.a.totals.revenue, 80);
assert.ok(same.a.partial);

// Carregadores diferentes no mesmo mês.
const vs = core.comparePeriods(sessions, { ...sep, match: x => x.site === 'RK' }, sep);
assert.strictEqual(vs.a.totals.revenue, 45);
assert.strictEqual(vs.bySite.length, 2);

// Período sem nenhuma recarga não quebra.
const empty = core.comparePeriods(sessions, { from: '2026-01-01', to: '2026-01-31', match: jk }, sep);
assert.strictEqual(empty.a.totals.revenue, 0);
assert.strictEqual(empty.deltas.revenue.pct, null);

console.log('comparePeriods ok');

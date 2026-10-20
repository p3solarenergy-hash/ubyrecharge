// Rodada 1: 10 cotas (8 de investidores + 2 da REBP), valor cheio por cota.
// Cota 11 em diante: fica com 80% do valor por cota; 20% são a taxa da desenvolvedora (REBP), apurada à parte.
const assert = require('assert');
globalThis.UBY_CONFIG = { quotaValueDefault: 80000, distributionStartDefault: '2026-06' };
require('../docs/nova/app/finance-core.js');
const core = globalThis.UBY_FINANCE_CORE;

const investors = [
  ['Amanda Bufalo', 1, '2026-06'], ['Isabela Bufalo', 1, '2026-06'], ['Carlos Eduardo Garcia', 1, '2026-08'],
  ['Gabriel Z.', 1, '2026-08'], ['Michell Jabur', 1, '2026-09'], ['Willian Jabur', 1, '2026-09'],
  ['Renan Sanchez', 2, '2026-10'],
  ['R.EBP (11ª cota)', 1, '2026-10', 'new'],
  ['R.EBP', 2, '2026-11', 'founder']
].map(([name, quotas, eligibleFrom, kind]) => ({ name, quotas, eligibleFrom, founder: kind === 'founder', newQuota: kind === 'new' }));
// Pool dos cotistas de Out/2026 (print do usuário) e Nov/2026 com R$ 10.000.
const monthly = [['2026-10', 3112.72], ['2026-11', 10000]].map(([monthKey, v]) => ({ monthKey, ownedNet: v, royalties: 0 }));
const policy = { legalReservePct: 0, expansionReservePct: 0, investorPct: 100, investors };
const round = v => Math.round(v * 100) / 100;
const by = (net, name) => net.investors.find(i => i.name === name).allocations.map(round);
// Conferência: repasses dos cotistas + taxa da desenvolvedora = pool.
const closes = net => assert.ok(Math.abs(net.investors.reduce((s, i) => s + i.due, 0) + net.totals.developerFee - net.totals.investorPool) < 0.01, 'soma fecha com o pool');

const net = core.network(monthly, policy);
const [oct, nov] = net.months;
// Out/2026: 9 cotas; rodada 1 cheia, 11ª cota com 80% e a taxa à parte.
assert.strictEqual(round(oct.perQuota), 345.86);
assert.strictEqual(by(net, 'Willian Jabur')[0], 345.86);
assert.strictEqual(by(net, 'R.EBP (11ª cota)')[0], 276.69);
assert.strictEqual(round(oct.developerFee), 69.17);
assert.strictEqual(by(net, 'R.EBP')[0], 0, 'cotas da REBP na rodada 1 só a partir de Nov');
// Nov/2026: 11 cotas; as 2 cotas da REBP recebem o valor cheio, sem a taxa misturada.
assert.strictEqual(round(nov.perQuota), 909.09);
assert.strictEqual(by(net, 'R.EBP')[1], 1818.18);
assert.strictEqual(by(net, 'R.EBP (11ª cota)')[1], 727.27);
assert.strictEqual(round(nov.developerFee), 181.82);
closes(net);

// A taxa não depende de marcar as cotas da REBP (linha como investidor comum da rodada 1).
const unmarked = core.network(monthly, { ...policy, investors: investors.map(i => ({ ...i, founder: false })) });
assert.strictEqual(round(unmarked.months[0].developerFee), 69.17);
assert.strictEqual(by(unmarked, 'R.EBP (11ª cota)')[0], 276.69);
closes(unmarked);

// Rodada 2 (+3 cotas de terceiros): rodada 1 a 1/14 do pool, cotas novas a 80% disso, taxa de 20% sobre 4 cotas.
const r2 = core.network([monthly[1]], { ...policy, investors: [...investors, { name: 'Rodada 2', quotas: 3, eligibleFrom: '2026-11', newQuota: true }] });
assert.strictEqual(by(r2, 'Amanda Bufalo')[0], 714.29);
assert.strictEqual(by(r2, 'Rodada 2')[0], 1714.29);
assert.strictEqual(round(r2.months[0].developerFee), 571.43);
closes(r2);

// Sem cota 11+: nenhuma taxa.
const plain = core.network(monthly, { ...policy, investors: investors.map(i => ({ ...i, newQuota: false })) });
assert.strictEqual(plain.totals.developerFee, 0);
closes(plain);

// Percentual configurável.
const p25 = core.network([monthly[1]], { ...policy, founderPct: 25 });
assert.strictEqual(by(p25, 'R.EBP (11ª cota)')[0], 681.82);
closes(p25);

console.log('test_founder_block: ok');

// Bloco fundador: 20% fixos do pool desde a sua entrada, sem diluição; 80% entre as cotas dos investidores.
const assert = require('assert');
globalThis.UBY_CONFIG = { quotaValueDefault: 80000, distributionStartDefault: '2026-06' };
require('../docs/nova/app/finance-core.js');
const core = globalThis.UBY_FINANCE_CORE;

const investors = [
  ['Amanda Bufalo', 1, '2026-05'], ['Isabela Bufalo', 1, '2026-05'], ['Carlos Eduardo Garcia', 1, '2026-07'],
  ['Gabriel Z.', 1, '2026-08'], ['Michell Jabur', 1, '2026-08'], ['Willian Jabur', 1, '2026-06'],
  ['R.EBP (11ª cota)', 1, '2026-09'], ['Renan Sanchez', 2, '2026-09'], ['R.EBP', 2, '2026-11', true]
].map(([name, quotas, eligibleFrom, founder]) => ({ name, quotas, eligibleFrom, founder: !!founder }));
// Pool de R$ 10.000 por mês (sem reservas, 100% para cotistas).
const monthly = ['2026-10', '2026-11'].map(monthKey => ({ monthKey, ownedNet: 10000, royalties: 0 }));
const policy = { legalReservePct: 0, expansionReservePct: 0, investorPct: 100, investors };
const round = v => Math.round(v * 100) / 100;
const by = (net, name) => net.investors.find(i => i.name === name).allocations;

// Regra nova (padrão 20%).
const net = core.network(monthly, policy);
const [oct, nov] = net.months;
assert.strictEqual(oct.founderPool, 0, 'out: bloco fundador ainda não entra');
assert.strictEqual(round(oct.perQuota), round(10000 / 9));
assert.strictEqual(nov.founderPool, 2000);
assert.strictEqual(nov.eligibleQuotas, 9);
assert.strictEqual(round(nov.perQuota), 888.89);
assert.strictEqual(round(by(net, 'Amanda Bufalo')[1]), 888.89);
assert.strictEqual(round(by(net, 'R.EBP (11ª cota)')[1]), 888.89);
assert.strictEqual(round(by(net, 'Renan Sanchez')[1]), 1777.78);
assert.strictEqual(by(net, 'R.EBP')[1], 2000);
assert.strictEqual(by(net, 'R.EBP')[0], 0);
const allocated = net.investors.reduce((s, i) => s + i.due, 0);
assert.ok(Math.abs(allocated - 20000) < 0.01, 'soma fecha com o pool');

// Rodada 2 (+3 cotas): o bloco segue com 20%; cada cota cai para 6,67%.
const r2 = core.network([monthly[1]], { ...policy, investors: [...investors, { name: 'Rodada 2', quotas: 3, eligibleFrom: '2026-11' }] });
assert.strictEqual(r2.months[0].founderPool, 2000);
assert.strictEqual(round(r2.months[0].perQuota / 100), round(10000 * 0.8 / 12 / 100));

// Sem bloco marcado: regra antiga (divisão igual entre todas as cotas).
const old = core.network([monthly[1]], { ...policy, investors: investors.map(i => ({ ...i, founder: false })) });
assert.strictEqual(old.months[0].founderPool, 0);
assert.strictEqual(round(old.months[0].perQuota), 909.09);

// Percentual configurável.
const p25 = core.network([monthly[1]], { ...policy, founderPct: 25 });
assert.strictEqual(p25.months[0].founderPool, 2500);

console.log('test_founder_block: ok');

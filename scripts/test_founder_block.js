// Rodada 1: 10 cotas (8 de investidores + 2 da REBP, o bloco fundador), valor cheio por cota.
// Cota 11 em diante: fica com 80% do valor por cota; 20% vão para o bloco fundador (taxa da desenvolvedora).
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
// Pool de R$ 10.000 por mês (sem reservas, 100% para cotistas).
const monthly = ['2026-10', '2026-11'].map(monthKey => ({ monthKey, ownedNet: 10000, royalties: 0 }));
const policy = { legalReservePct: 0, expansionReservePct: 0, investorPct: 100, investors };
const round = v => Math.round(v * 100) / 100;
const by = (net, name) => net.investors.find(i => i.name === name).allocations.map(round);
const closes = net => assert.ok(Math.abs(net.investors.reduce((s, i) => s + i.due, 0) - net.totals.investorPool) < 0.01, 'soma fecha com o pool');

const net = core.network(monthly, policy);
const [oct, nov] = net.months;
// Out/2026: cotas do bloco ainda aguardam o carregador; 9 cotas habilitadas, a 11ª já paga a taxa.
assert.strictEqual(oct.eligibleQuotas, 9);
assert.strictEqual(round(oct.perQuota), 1111.11);
assert.strictEqual(by(net, 'R.EBP (11ª cota)')[0], 888.89);
assert.strictEqual(by(net, 'R.EBP')[0], 222.22);
// Nov/2026: 11 cotas; rodada 1 recebe o valor cheio, o bloco fica com exatamente 20%.
assert.strictEqual(nov.eligibleQuotas, 11);
assert.strictEqual(round(nov.perQuota), 909.09);
assert.strictEqual(by(net, 'Amanda Bufalo')[1], 909.09);
assert.strictEqual(by(net, 'Renan Sanchez')[1], 1818.18);
assert.strictEqual(by(net, 'R.EBP (11ª cota)')[1], 727.27);
assert.strictEqual(by(net, 'R.EBP')[1], 2000);
assert.strictEqual(round(nov.developerFee), 181.82);
// A REBP vê separado o que é das cotas da rodada 1 e o que é taxa da desenvolvedora.
const rebp = net.investors.find(i => i.name === 'R.EBP');
assert.deepStrictEqual(rebp.ownAllocations.map(round), [0, 1818.18]);
assert.deepStrictEqual(rebp.feeAllocations.map(round), [222.22, 181.82]);
assert.strictEqual(round(rebp.feeDue), 404.04);
assert.strictEqual(round(rebp.returnRate * 160000), 1818.18, 'retorno só sobre as cotas, sem a taxa');
closes(net);

// Rodada 2 (+3 cotas de terceiros): o bloco segue com 20%; rodada 1 a 1/14 do pool, cotas novas a 80% disso.
const r2 = core.network([monthly[1]], { ...policy, investors: [...investors, { name: 'Rodada 2', quotas: 3, eligibleFrom: '2026-11', newQuota: true }] });
assert.strictEqual(by(r2, 'R.EBP')[0], 2000);
assert.strictEqual(by(r2, 'Amanda Bufalo')[0], 714.29);
assert.strictEqual(by(r2, 'Rodada 2')[0], 1714.29);
closes(r2);

// Sem bloco fundador marcado: nenhuma taxa, divisão igual entre todas as cotas.
const plain = core.network([monthly[1]], { ...policy, investors: investors.map(i => ({ ...i, founder: false })) });
assert.strictEqual(plain.months[0].developerFee, 0);
assert.strictEqual(by(plain, 'R.EBP (11ª cota)')[0], 909.09);
closes(plain);

// Percentual configurável.
const p25 = core.network([monthly[1]], { ...policy, founderPct: 25 });
assert.strictEqual(by(p25, 'R.EBP (11ª cota)')[0], 681.82);
closes(p25);

console.log('test_founder_block: ok');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('docs/nova/app/motor-api.js', 'utf8');
const start = source.indexOf('  const nextMonth =');
const end = source.indexOf('  function areaAccount(workId', start);
assert.ok(start > 0 && end > start);
const cases = [
  ['ac', '2026-09', 990.33, 439.07], ['dc', '2026-09', 355.19, 157.48],
  ['ac', '2026-10', 3781.70, 1676.62], ['dc', '2026-10', 11226.02, 4977.06]
];
let sum = 0;
for (const [kind, mk, revenue, net] of cases) {
  const cfg = { dueDay: 10, splitAtSourceFrom: '2026-10', adjust: {
    [mk]: { total: net, dueDate: '2026-11-15', receivedByUby: true, note: '50% menos 11,33% de imposto' }
  } };
  const row = { workId: kind === 'ac' ? 'shopping-aurora' : 'aurora-dc', station: `SHOPPING AURORA ${kind.toUpperCase()}`, charges: [], fv2Id: kind, included: true };
  const context = vm.createContext({ cfg, row, ON: () => ({}), n0: v => Number(v) || 0,
    fv2AreaConfig: () => cfg, fv2RowMonths: () => [mk],
    fv2Month: () => ({ totalRevenue: revenue, energy: 0, areaParticipationCalc: revenue / 2, areaSharePct: 50 }),
    FV2: { rowMonths: new Map(), rows: [row] }, fv2Ensure: () => {}, fmtPctPlain: v => `${v}%`, workPowerById: () => 0, stationAvailabilityFor: () => null,
    monthLabel: v => v, rowFirstMonth: () => mk, isExecutedCharge: () => false,
    iso: d => d.toISOString().slice(0, 10), fv2EnergyFor: () => null
  });
  vm.runInContext(source.slice(start, end) + '\nresult = areaAccountRow(row); atSource = areaAtSourceIn(cfg, "2026-11");', context);
  const month = context.result.months[0];
  assert.equal(month.key, mk);
  assert.equal(month.total, net);
  assert.equal(month.due, '2026-11-15', 'both competences must be payable on November 15');
  assert.equal(month.atSource, false, 'UBY received these four settlements');
  assert.equal(context.atSource, true, 'future split rules stay unchanged');
  assert.equal(month.paidAt, '', 'scheduling does not mark a transfer as paid');
  assert.equal(month.areaPct, 50);
  const paymentsStart = source.indexOf('  function areaPaymentsByMonth()');
  const paymentsEnd = source.indexOf('  const areaPayments =', paymentsStart);
  vm.runInContext(source.slice(paymentsStart, paymentsEnd) + '\npayments = areaPaymentsByMonth();', context);
  const payment = context.payments.get('2026-11')[0];
  assert.equal(payment.competence, mk);
  assert.equal(payment.due, '2026-11-15');
  assert.equal(payment.dueDay, 15);
  assert.equal(payment.amount, net);
  assert.equal(payment.kind, 'area');
  assert.equal(context.payments.has('2026-10'), false, 'September must not remain overdue in October');
  const frozen = JSON.stringify(cfg);
  vm.runInContext('result = areaAccountRow(row)', context);
  assert.equal(JSON.stringify(cfg), frozen);
  sum += month.total;
  // Without a dated override, every other month keeps its original next-month due date.
  cfg.adjust[mk].dueDate = 'invalid';
  vm.runInContext('result = areaAccountRow(row)', context);
  assert.equal(context.result.months[0].due, mk === '2026-09' ? '2026-10-10' : '2026-11-10');
}
assert.equal(Math.round(sum * 100), 725023);
console.log('Aurora area settlement tests ok: four separate payments, 15/11/2026, total 7250.23');

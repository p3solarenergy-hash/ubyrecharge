const assert = require('assert');

require('../docs/nova/app/bank.js');

const B = globalThis.UBY_BANK;
const identity = c => ({ paymentLedger: {}, ...c });
const NOW = '2026-10-19T12:00:00.000Z';

// Recebido de outubro (caso real: R$ 15.449,03 da Spott em 14/10) + ruído que não entra na base.
const tx = [
  { id: 'a', date: '2026-10-14', type: 'PIX', description: 'SPOTT TECNOLOGIA LTDA', amount: 15449.03 },
  { id: 'b', date: '2026-10-15', type: 'PIX', description: 'JOAO DA SILVA', amount: 399.57 },
  { id: 'c', date: '2026-10-16', type: 'RENDIMENTO', description: 'rendimento aplicacao', amount: 3.1 },
  { id: 'd', date: '2026-09-20', type: 'PIX', description: 'SPOTT TECNOLOGIA LTDA', amount: 11943.66 },
  { id: 'e', date: '2026-10-20', type: 'TED', description: 'MOVE SOLUCOES EM ELETROMOBILIDADE', amount: -50 }
];
const plan = B.taxPlan(tx, {});
assert.strictEqual(plan.lines.length, 2, 'setembro fica de fora (guia real); outubro gera PIS/COFINS e IRPJ/CSLL');
const pc = plan.lines.find(l => l.kind === 'pc'), ic = plan.lines.find(l => l.kind === 'ic');
assert.strictEqual(pc.id, 'ptaxauto-pc-2026-10');
assert.strictEqual(pc.base, 15449.03);
assert.strictEqual(pc.amount, 563.89);
assert.strictEqual(pc.dueDate, '2026-11-25');
assert.strictEqual(ic.id, 'ptaxauto-ic-2026-Q4');
assert.strictEqual(ic.amount, 1186.48, 'arredonda IRPJ e CSLL separadamente, como a guia');
assert.strictEqual(ic.dueDate, '2027-01-29', '31/01/2027 é domingo: último dia útil anterior');

// Reclassificar uma entrada à mão ("Não é da UBY") tira da base.
const reclass = B.taxPlan(tx, { a: { source: 'Não é da UBY (devolver)' } });
assert.strictEqual(reclass.lines.length, 0);

// Vencimento que cai no fim de semana antecipa (25/10/2026 é domingo → 23/10).
const nov = B.taxPlan([{ id: 'n', date: '2026-09-10', type: 'PIX', description: 'SPOTT', amount: 1000 }], {}, { from: '2026-09' });
assert.strictEqual(nov.lines.find(l => l.kind === 'pc').dueDate, '2026-10-23');

// Trimestre com adicional de IRPJ (base presumida de 64.000 > R$ 60 mil).
const big = B.taxPlan([{ id: 'g', date: '2026-11-05', type: 'PIX', description: 'SPOTT', amount: 200000 }], {});
assert.strictEqual(big.lines.find(l => l.kind === 'ic').amount, 9600 + 400 + 5760, 'IRPJ 9.600 + adicional 400 + CSLL 5.760');
assert.strictEqual(big.warnings.length, 1);

// --- applyTaxPlan ---
const legacyPc = { id: 'ptaxspott2609', name: 'antigo', amount: 1750.38, startMonth: '2026-10', endMonth: '2026-10', dueDay: 10, scheduledPayment: true, notes: '', paymentLedger: {}, createdAt: 'c' };
const darf = { id: 'ptaxspott2608', name: 'DARF', amount: 841.4, scheduledPayment: true, paymentLedger: {} };

// 1) adota a linha antiga (mesma conta, id novo) e cria a do IRPJ/CSLL
let r = B.applyTaxPlan([darf, legacyPc], plan.lines, identity, NOW);
assert.ok(r.changed);
assert.ok(!r.costs.some(c => c.id === 'ptaxspott2609'), 'linha antiga adotada, não duplicada');
assert.strictEqual(r.costs.find(c => c.id === 'ptaxauto-pc-2026-10').amount, 563.89);
assert.strictEqual(r.costs.find(c => c.id === 'ptaxauto-pc-2026-10').createdAt, 'c');
assert.strictEqual(r.costs.find(c => c.id === 'ptaxauto-ic-2026-Q4').dueDay, 29);
assert.strictEqual(r.costs.find(c => c.id === 'ptaxspott2608').amount, 841.4, 'guia real anterior intocada');

// 2) rodar de novo não muda nada
const again = B.applyTaxPlan(r.costs, plan.lines, identity, NOW);
assert.ok(!again.changed);

// 3) valor editado à mão (guia real) fica travado; "force" volta à projeção
const edited = r.costs.map(c => c.id === 'ptaxauto-pc-2026-10' ? { ...c, amount: 560.0 } : c);
r = B.applyTaxPlan(edited, plan.lines, identity, NOW);
assert.deepStrictEqual(r.report.locked, ['ptaxauto-pc-2026-10']);
assert.strictEqual(r.costs.find(c => c.id === 'ptaxauto-pc-2026-10').amount, 560.0);
r = B.applyTaxPlan(edited, plan.lines, identity, NOW, ['ptaxauto-pc-2026-10']);
assert.strictEqual(r.costs.find(c => c.id === 'ptaxauto-pc-2026-10').amount, 563.89);

// 4) conta já paga não muda, mesmo com recebido novo
const paid = again.costs.map(c => c.id === 'ptaxauto-pc-2026-10' ? { ...c, paymentLedger: { '2026-11': { status: 'paid' } } } : c);
const more = B.taxPlan([...tx, { id: 'z', date: '2026-10-30', type: 'PIX', description: 'SPOTT', amount: 100 }], {});
r = B.applyTaxPlan(paid, more.lines, identity, NOW);
assert.deepStrictEqual(r.report.paid, ['ptaxauto-pc-2026-10']);
assert.strictEqual(r.costs.find(c => c.id === 'ptaxauto-pc-2026-10').amount, 563.89);
assert.ok(r.report.updated.includes('ptaxauto-ic-2026-Q4'), 'IRPJ/CSLL do trimestre acompanha o recebido');

// 5) sem recebido, a linha automática sem pagamento é removida; a paga e as manuais ficam
r = B.applyTaxPlan(paid, [], identity, NOW);
assert.ok(!r.costs.some(c => c.id === 'ptaxauto-ic-2026-Q4'));
assert.ok(r.costs.some(c => c.id === 'ptaxauto-pc-2026-10'), 'paga permanece');
assert.ok(r.costs.some(c => c.id === 'ptaxspott2608'));

console.log('test_tax_plan: ok');

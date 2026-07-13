const assert = require('assert');
const reports = require('../docs/obra-ev/finance_reports.js');

const areaModel = {
  report: { station: 'UBY RECHARGE - POSTO ROBERT KOCH', work: 'Posto Malassise R.K.', period: '08/06/2026 a 10/07/2026', status: 'closed', version: 1, generatedAt: '10/07/2026 10:00' },
  current: { revenue: 5139.53, energy: 3073.8, energyRate: 0.86, energyCost: 2643.47, transferMode: 'gross', sharePct: 10, shareBase: 5139.53, areaShare: 513.95, partnerTotal: 3157.42 },
  accumulated: { revenue: 5139.53, energy: 3073.8, energyCost: 2643.47, areaShare: 513.95, partnerTotal: 3157.42 },
  timeline: [{ label: '08/06/2026 a 10/07/2026', revenue: 5139.53, energy: 3073.8, energyRate: 0.86, sharePct: 10, areaShare: 513.95, partnerTotal: 3157.42 }]
};

const areaHtml = reports.areaReport(areaModel);
assert.ok(areaHtml.includes('Faturamento do periodo'));
assert.ok(areaHtml.includes('Tarifa de energia'));
assert.ok(areaHtml.includes('Percentual contratado'));
assert.ok(areaHtml.includes('Acumulado do ponto'));
assert.ok(areaHtml.includes('Linha do tempo mensal'));
assert.ok(areaHtml.includes('5.139,53'));

const investorEntry = {
  label: 'Jul/2026', occupancyPct: 18.4, targetOccPct: 15, revenue: 5000, extraRevenue: 200, totalRevenue: 5200,
  energy: 2800, charges: 140, clients: 45, totalOperatingCost: 3900, operationNet: 1300, operationMargin: 25,
  totalCostPerKWh: 1.392857, plannedTotalCostPerKWh: 1.48, investmentValue: 160000, roiMonthly: 0.8125,
  paybackMonths: 123.1, saRetention: 130, investorDistribution: 1170
};
const investorModel = {
  report: { station: 'Consolidado UBY', period: 'Jul/2026', status: 'partial', generatedAt: '13/07/2026 10:00' },
  current: investorEntry,
  accumulated: { ...investorEntry, totalRevenue: 9300, energy: 5100, totalOperatingCost: 7000, operationNet: 2300, occupancyPct: 16.2, operationMargin: 24.73, investorDistribution: 2070 },
  timeline: [
    { ...investorEntry, label: 'Jun/2026', totalRevenue: 4100, operationNet: 1000 },
    investorEntry
  ],
  units: [{ name: 'Robert Koch', type: 'DC', occupancyPct: 18.4, totalRevenue: 5200, energy: 2800, totalOperatingCost: 3900, operationNet: 1300 }],
  revenueItems: [{ label: 'Recargas', rule: 'Base importada', amount: 5000, plannedPerKWh: 1.79, actualPerKWh: 1.79 }],
  costItems: [
    { label: 'Energia eletrica', rule: 'R$ 0,86/kWh', amount: 2408, plannedPerKWh: 0.86, actualPerKWh: 0.86 },
    { label: 'Seguro', rule: 'Fixo mensal', amount: 178, plannedPerKWh: 0.02, actualPerKWh: 0.06357 }
  ]
};

const investorHtml = reports.investorReport(investorModel);
assert.ok(investorHtml.includes('Ocupacao do periodo'));
assert.ok(investorHtml.includes('Composicao financeira e custo diluido'));
assert.ok(investorHtml.includes('R$/kWh inicial'));
assert.ok(investorHtml.includes('R$/kWh atual'));
assert.ok(investorHtml.includes('Acumulado da operacao'));
assert.ok(investorHtml.includes('Linha do tempo mes a mes'));
assert.ok(investorHtml.includes('Resultado por ponto'));
assert.ok(investorHtml.includes('Seguro'));

console.log('finance report tests ok');

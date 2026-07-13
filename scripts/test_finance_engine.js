const assert = require('assert');

require('../docs/obra-ev/finance_engine.js');

const engine = globalThis.UBY_FINANCE_ENGINE;

const context = {
  energy: 5000,
  revenue: 8950,
  count: 250,
  planningKWh: 5000,
  planningRevenue: 8950,
  planningCharges: 250,
  salePricePerKWh: 1.79,
  averageEnergyPerCharge: 20
};

const insurance = engine.evaluateRules([
  { id: 'insurance', enabled: true, basis: 'fixed', value: 200 }
], context);
assert.strictEqual(insurance.actual, 200);
assert.strictEqual(insurance.details[0].actualPerKWh, 0.04);
assert.strictEqual(insurance.details[0].plannedPerKWh, 0.04);

const zeroStart = engine.evaluateRules([
  { id: 'insurance', enabled: true, basis: 'fixed', value: 200 }
], { ...context, energy: 0, revenue: 0, count: 0 });
assert.strictEqual(zeroStart.details[0].actualPerKWh, null);
assert.strictEqual(zeroStart.details[0].plannedPerKWh, 0.04);

const mixed = engine.evaluateRules([
  { id: 'insurance', enabled: true, basis: 'fixed', value: 200 },
  { id: 'maintenance', enabled: true, basis: 'per_kwh', value: 0.05 },
  { id: 'app', enabled: true, basis: 'revenue_pct', value: 9 },
  { id: 'payment', enabled: true, basis: 'per_charge', value: 0.30 }
], context);
assert.strictEqual(Number(mixed.actual.toFixed(2)), 1330.50);

const economics = engine.unitEconomics({
  energy: 5000,
  revenue: 8950,
  extraRevenue: 0,
  energyCost: 4300,
  extraCosts: 450,
  management: 447.5,
  platform: 805.5,
  planningKWh: 5000,
  plannedEnergyCost: 4300,
  plannedExtraCosts: 450,
  plannedManagement: 447.5,
  plannedPlatform: 805.5,
  variableRevenuePerKWh: 1.79,
  variableCostPerKWh: 1.11,
  fixedCosts: 200,
  fixedRevenue: 0
});
assert.strictEqual(Number(economics.totalCostPerKWh.toFixed(4)), 1.2006);
assert.strictEqual(Number(economics.operationNet.toFixed(2)), 2947);
assert.strictEqual(Number(economics.breakEvenKWh.toFixed(2)), 294.12);

const robertKochJuly = engine.unitEconomics({
  energy: 1718.30,
  revenue: 2920.95,
  extraRevenue: 0,
  energyCost: 1718.30 * 0.86,
  extraCosts: 243 + 2920.95 * 0.10,
  management: 2920.95 * 0.05,
  platform: 2920.95 * 0.09,
  planningKWh: 13392,
  plannedEnergyCost: 13392 * 0.86,
  plannedExtraCosts: 243 + 13392 * 1.79 * 0.10,
  plannedManagement: 13392 * 1.79 * 0.05,
  plannedPlatform: 13392 * 1.79 * 0.09,
  variableRevenuePerKWh: 1.79,
  variableCostPerKWh: 0.86 + 1.79 * 0.24,
  fixedCosts: 243,
  fixedRevenue: 0
});
assert.strictEqual(Number(robertKochJuly.operationNet.toFixed(2)), 499.18);
assert.strictEqual(Number(robertKochJuly.totalCostPerKWh.toFixed(4)), 1.4094);
assert.strictEqual(Number(robertKochJuly.plannedTotalCostPerKWh.toFixed(4)), 1.3077);
assert.strictEqual(Number(robertKochJuly.breakEvenKWh.toFixed(2)), 485.61);

const monthlyRoot = {
  default: { managementPct: 5, platformPct: 9, energyCostPerKWh: 0.86 },
  '2026-06': { managementPct: 5, platformPct: 9, energyCostPerKWh: 0.86 }
};
const monthlyCharger = {
  default: { insurance: 178 },
  '2026-06': { managementPct: 5, platformPct: 9, energyCostPerKWh: 0.86, insurance: 178 }
};

const inheritedJuly = engine.resolveMonthlySettings({}, monthlyRoot, monthlyCharger, '2026-07');
assert.strictEqual(inheritedJuly.exact, false);
assert.strictEqual(inheritedJuly.source, 'inherited');
assert.strictEqual(inheritedJuly.sourceMonth, '2026-06');
assert.strictEqual(inheritedJuly.settings.energyCostPerKWh, 0.86);
assert.strictEqual(inheritedJuly.settings.insurance, 178);

monthlyCharger['2026-07'] = { managementPct: 7, platformPct: 8, energyCostPerKWh: 0.92, insurance: 190 };
const savedJuly = engine.resolveMonthlySettings({}, monthlyRoot, monthlyCharger, '2026-07');
assert.strictEqual(savedJuly.exact, true);
assert.strictEqual(savedJuly.source, 'saved');
assert.strictEqual(savedJuly.settings.managementPct, 7);
assert.strictEqual(savedJuly.settings.energyCostPerKWh, 0.92);

const preservedJune = engine.resolveMonthlySettings({}, monthlyRoot, monthlyCharger, '2026-06');
assert.strictEqual(preservedJune.exact, true);
assert.strictEqual(preservedJune.settings.managementPct, 5);
assert.strictEqual(preservedJune.settings.energyCostPerKWh, 0.86);

const inheritedAugust = engine.resolveMonthlySettings({}, monthlyRoot, monthlyCharger, '2026-08');
assert.strictEqual(inheritedAugust.exact, false);
assert.strictEqual(inheritedAugust.sourceMonth, '2026-07');
assert.strictEqual(inheritedAugust.settings.managementPct, 7);
assert.strictEqual(inheritedAugust.settings.energyCostPerKWh, 0.92);

console.log('finance engine tests ok');

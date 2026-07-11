(function (global) {
  'use strict';

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function positive(value) {
    return Math.max(number(value), 0);
  }

  function ruleAmount(rule, context, planned) {
    if (!rule || rule.enabled === false) return 0;
    const value = positive(rule.value);
    const energy = planned ? positive(context.planningKWh) : positive(context.energy);
    const revenue = planned ? positive(context.planningRevenue) : positive(context.revenue);
    const count = planned ? positive(context.planningCharges) : positive(context.count);
    if (rule.basis === 'per_kwh') return value * energy;
    if (rule.basis === 'revenue_pct') return revenue * value / 100;
    if (rule.basis === 'per_charge') return value * count;
    return value;
  }

  function evaluateRules(rules, context) {
    const safeRules = Array.isArray(rules) ? rules : [];
    const safeContext = context || {};
    const details = safeRules.map(function (rule) {
      const actual = ruleAmount(rule, safeContext, false);
      const planned = ruleAmount(rule, safeContext, true);
      return Object.assign({}, rule, {
        actual: actual,
        planned: planned,
        actualPerKWh: positive(safeContext.energy) > 0 ? actual / positive(safeContext.energy) : null,
        plannedPerKWh: positive(safeContext.planningKWh) > 0 ? planned / positive(safeContext.planningKWh) : null
      });
    });
    return {
      details: details,
      actual: details.reduce(function (sum, item) { return sum + number(item.actual); }, 0),
      planned: details.reduce(function (sum, item) { return sum + number(item.planned); }, 0)
    };
  }

  function variablePerKWh(rules, context) {
    const safeContext = context || {};
    const price = positive(safeContext.salePricePerKWh);
    const averageEnergy = positive(safeContext.averageEnergyPerCharge);
    return (Array.isArray(rules) ? rules : []).filter(function (rule) {
      return rule && rule.enabled !== false;
    }).reduce(function (sum, rule) {
      const value = positive(rule.value);
      if (rule.basis === 'per_kwh') return sum + value;
      if (rule.basis === 'revenue_pct') return sum + price * value / 100;
      if (rule.basis === 'per_charge' && averageEnergy > 0) return sum + value / averageEnergy;
      return sum;
    }, 0);
  }

  function fixedTotal(rules) {
    return (Array.isArray(rules) ? rules : []).filter(function (rule) {
      return rule && rule.enabled !== false && (rule.basis === 'fixed' || rule.basis === 'one_off');
    }).reduce(function (sum, rule) { return sum + positive(rule.value); }, 0);
  }

  function unitEconomics(input) {
    const data = input || {};
    const energy = positive(data.energy);
    const revenue = number(data.revenue);
    const extraRevenue = number(data.extraRevenue);
    const totalRevenue = revenue + extraRevenue;
    const totalOperatingCost = positive(data.energyCost) + positive(data.extraCosts) + positive(data.management) + positive(data.platform);
    const operationNet = totalRevenue - totalOperatingCost;
    const planningKWh = positive(data.planningKWh);
    const plannedTotalCost = positive(data.plannedEnergyCost) + positive(data.plannedExtraCosts) + positive(data.plannedManagement) + positive(data.plannedPlatform);
    const contributionPerKWh = number(data.variableRevenuePerKWh) - number(data.variableCostPerKWh);
    const netFixedCost = Math.max(positive(data.fixedCosts) - positive(data.fixedRevenue), 0);
    return {
      totalRevenue: totalRevenue,
      totalOperatingCost: totalOperatingCost,
      operationNet: operationNet,
      totalCostPerKWh: energy > 0 ? totalOperatingCost / energy : null,
      plannedTotalCost: plannedTotalCost,
      plannedTotalCostPerKWh: planningKWh > 0 ? plannedTotalCost / planningKWh : null,
      resultPerKWh: energy > 0 ? operationNet / energy : null,
      operationMargin: totalRevenue !== 0 ? operationNet / totalRevenue * 100 : 0,
      contributionPerKWh: contributionPerKWh,
      breakEvenKWh: contributionPerKWh > 0 ? netFixedCost / contributionPerKWh : null
    };
  }

  global.UBY_FINANCE_ENGINE = Object.freeze({
    evaluateRules: evaluateRules,
    fixedTotal: fixedTotal,
    ruleAmount: ruleAmount,
    unitEconomics: unitEconomics,
    variablePerKWh: variablePerKWh
  });
})(typeof window !== 'undefined' ? window : globalThis);

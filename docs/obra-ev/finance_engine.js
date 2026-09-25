(function (global) {
  'use strict';

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function positive(value) {
    return Math.max(number(value), 0);
  }

  function calculateEnergyComposition(input) {
    const data = input || {};
    const mode = data.mode === 'copel_lease' ? 'copel_lease' : 'copel';
    const copelCost = positive(data.copelAmount);
    const creditedKWh = mode === 'copel_lease' ? positive(data.creditedKWh) : 0;
    const leaseRatePerKWh = mode === 'copel_lease' ? positive(data.leaseRatePerKWh) : 0;
    const leaseCost = creditedKWh * leaseRatePerKWh;
    const totalCost = copelCost + leaseCost;
    const baseKWh = positive(data.rateBaseKWh || data.copelKWh);
    return {
      mode: mode,
      copelCost: copelCost,
      copelKWh: positive(data.copelKWh),
      creditedKWh: creditedKWh,
      leaseRatePerKWh: leaseRatePerKWh,
      leaseCost: leaseCost,
      totalCost: totalCost,
      costPerKWh: baseKWh > 0 ? totalCost / baseKWh : 0
    };
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

  // Central costs are stored once. This helper only derives the auditable
  // allocation for their selected destinations and protects the total from
  // floating-point rounding drift.
  function allocateCentralCost(input) {
    const data = input || {};
    const amountInCents = Math.round(positive(data.amount) * 100);
    const targets = (Array.isArray(data.targets) ? data.targets : [])
      .filter(function (target) { return target && String(target.id || '').trim(); })
      .map(function (target) { return Object.assign({}, target, { id: String(target.id).trim() }); });
    if (!targets.length || amountInCents <= 0) return [];
    const custom = data.allocation === 'custom';
    const rawWeights = targets.map(function (target) { return custom ? positive(target.weight) : 1; });
    const totalWeight = rawWeights.reduce(function (sum, weight) { return sum + weight; }, 0);
    const weights = totalWeight > 0 ? rawWeights : targets.map(function () { return 1; });
    const denominator = weights.reduce(function (sum, weight) { return sum + weight; }, 0);
    const rawCents = weights.map(function (weight) { return amountInCents * weight / denominator; });
    const floorCents = rawCents.map(function (value) { return Math.floor(value); });
    let remainder = amountInCents - floorCents.reduce(function (sum, value) { return sum + value; }, 0);
    const rankedRemainders = rawCents.map(function (value, index) {
      return { index: index, fraction: value - floorCents[index] };
    }).sort(function (left, right) { return right.fraction - left.fraction || left.index - right.index; });
    const remainderIndexes = new Set(rankedRemainders.slice(0, remainder).map(function (entry) { return entry.index; }));
    return targets.map(function (target, index) {
      // Distribute residual cents by the largest fractional remainder. This
      // yields a deterministic allocation that always totals the source cost.
      const receivesRemainder = remainderIndexes.has(index);
      const cents = floorCents[index] + (receivesRemainder ? 1 : 0);
      return {
        id: target.id,
        amount: cents / 100,
        pct: Number((weights[index] / denominator * 100).toFixed(6))
      };
    });
  }

  function monthKeys(store) {
    return Object.keys(store || {}).filter(function (key) {
      return /^\d{4}-\d{2}$/.test(key);
    }).sort();
  }

  function latestMonthBefore(stores, targetMonth) {
    return Array.from(new Set((Array.isArray(stores) ? stores : [stores]).reduce(function (keys, store) {
      return keys.concat(monthKeys(store));
    }, []))).filter(function (key) {
      return !targetMonth || key < targetMonth;
    }).sort().pop() || '';
  }

  function resolveMonthlySettings(defaults, rootStore, scopedStore, targetMonth) {
    const root = rootStore || {};
    const scoped = scopedStore || {};
    const rootPrior = latestMonthBefore(root, targetMonth);
    const scopedPrior = latestMonthBefore(scoped, targetMonth);
    const previousMonth = [rootPrior, scopedPrior].filter(Boolean).sort().pop() || '';
    const rootExact = !!targetMonth && Object.prototype.hasOwnProperty.call(root, targetMonth);
    const scopedExact = !!targetMonth && Object.prototype.hasOwnProperty.call(scoped, targetMonth);
    const exact = rootExact || scopedExact;
    const settings = Object.assign(
      {},
      defaults || {},
      root.default || {},
      scoped.default || {},
      rootPrior ? root[rootPrior] || {} : {},
      scopedPrior ? scoped[scopedPrior] || {} : {},
      rootExact ? root[targetMonth] || {} : {},
      scopedExact ? scoped[targetMonth] || {} : {}
    );
    return {
      settings: settings,
      exact: exact,
      previousMonth: previousMonth,
      source: exact ? 'saved' : (previousMonth ? 'inherited' : 'default'),
      sourceMonth: exact ? targetMonth : previousMonth
    };
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
    allocateCentralCost: allocateCentralCost,
    calculateEnergyComposition: calculateEnergyComposition,
    evaluateRules: evaluateRules,
    fixedTotal: fixedTotal,
    latestMonthBefore: latestMonthBefore,
    monthKeys: monthKeys,
    resolveMonthlySettings: resolveMonthlySettings,
    ruleAmount: ruleAmount,
    unitEconomics: unitEconomics,
    variablePerKWh: variablePerKWh
  });
})(typeof window !== 'undefined' ? window : globalThis);

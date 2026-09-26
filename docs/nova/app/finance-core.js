/*
  UBY · Motor financeiro v2 (Nova Plataforma)
  ------------------------------------------------------------------
  Contas puras, sem DOM e sem Supabase: recebem os números já lidos pelo
  adaptador (app/motor-api.js) e devolvem o resultado. Reproduz a regra de
  financeForCharges() da plataforma original e acrescenta as correções
  aprovadas em 26/09/2026, cada uma com uma chave própria:

    aggregation     um só jeito de somar meses (payback/ROI pela média mensal,
                    margem sobre o faturamento total)                 [E1, E2]
    zeroSaleMonths  meses sem venda também entram (custos fixos, matriz) [E3]
    hybridMarketing divisão AC/DC do híbrido inclui marketing          [E4]
    courtesyInvoice cortesia absorvida pelo parceiro sai também da fatura [E5]
    monthScope      fatura/avulsos valem só na própria competência     [E6]
    matrixCents     rateio da matriz fecha ao centavo
    powerPerCharger peso "por potência" divide a potência do local
    lossCarry       prejuízo é compensado antes de distribuir

  Com todas as chaves desligadas (FIXES_OFF) o resultado é idêntico ao da
  plataforma original — é o que a auditoria compara centavo a centavo.
*/
(function (global) {
  "use strict";

  const FIXES = Object.freeze(["aggregation", "zeroSaleMonths", "hybridMarketing", "courtesyInvoice", "monthScope", "matrixCents", "powerPerCharger", "lossCarry"]);
  const FIXES_ON = Object.freeze(Object.fromEntries(FIXES.map(k => [k, true])));
  const FIXES_OFF = Object.freeze(Object.fromEntries(FIXES.map(k => [k, false])));

  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pos = v => Math.max(num(v), 0);

  // ---------- regras de custo/receita (mesma fórmula do finance_engine) ----------
  function ruleAmount(rule, ctx, planned) {
    if (!rule || rule.enabled === false) return 0;
    const value = pos(rule.value);
    const energy = planned ? pos(ctx.planningKWh) : pos(ctx.energy);
    const revenue = planned ? pos(ctx.planningRevenue) : pos(ctx.revenue);
    const count = planned ? pos(ctx.planningCharges) : pos(ctx.count);
    if (rule.basis === "per_kwh") return value * energy;
    if (rule.basis === "revenue_pct") return revenue * value / 100;
    if (rule.basis === "per_charge") return value * count;
    return value;
  }
  function evaluateRules(rules, ctx) {
    const details = (Array.isArray(rules) ? rules : []).map(rule => ({ ...rule, actual: ruleAmount(rule, ctx, false), planned: ruleAmount(rule, ctx, true) }));
    return { details, actual: details.reduce((s, d) => s + num(d.actual), 0), planned: details.reduce((s, d) => s + num(d.planned), 0) };
  }

  function energyComposition(cfg) {
    const mode = cfg.energyBillingMode === "copel_lease" ? "copel_lease" : "copel";
    const copelCost = pos(cfg.energyCopelAmount);
    const creditedKWh = mode === "copel_lease" ? pos(cfg.energyLeaseCreditedKWh) : 0;
    const leaseRate = mode === "copel_lease" ? pos(cfg.energyLeaseRatePerKWh) : 0;
    const leaseCost = creditedKWh * leaseRate;
    const totalCost = copelCost + leaseCost;
    const baseKWh = pos(cfg.energyCopelKWh);
    return { mode, copelCost, copelKWh: baseKWh, creditedKWh, leaseRatePerKWh: leaseRate, leaseCost, totalCost, costPerKWh: baseKWh > 0 ? totalCost / baseKWh : 0 };
  }

  // ---------- rateio ao centavo (maior resto) ----------
  function allocate(amount, weights) {
    const cents = Math.round(pos(amount) * 100);
    const w = (weights || []).map(pos);
    if (!w.length || cents <= 0) return w.map(() => 0);
    const total = w.reduce((s, x) => s + x, 0);
    const ws = total > 0 ? w : w.map(() => 1);
    const den = ws.reduce((s, x) => s + x, 0);
    const raw = ws.map(x => cents * x / den);
    const floor = raw.map(Math.floor);
    const rest = cents - floor.reduce((s, x) => s + x, 0);
    raw.map((x, i) => ({ i, f: x - floor[i] })).sort((a, b) => b.f - a.f || a.i - b.i).slice(0, rest).forEach(({ i }) => { floor[i] += 1; });
    return floor.map(c => c / 100);
  }

  /*
    Resultado de um carregador numa competência.
    input: { model, cfg (configuração já resolvida e normalizada), revenue, energy,
             acRevenue, dcRevenue, courtesy {treatment, energy, energyCost, commercialEnergy, charges, revenue},
             planning {energy, revenue, count, planningKWh, planningRevenue, planningCharges},
             matrixItems [{id,label,category,amount,cashAmount}], monthKey }
  */
  function computeMonth(input, fixes = FIXES_OFF) {
    const cfg = input.cfg || {};
    const model = input.model || "uby";
    const revenue = num(input.revenue);
    const energy = num(input.energy);
    const acRevenue = num(input.acRevenue), dcRevenue = num(input.dcRevenue);
    const unknownRevenue = Math.max(revenue - acRevenue - dcRevenue, 0);
    const courtesy = input.courtesy || { treatment: "operational", energy: 0, energyCost: 0, commercialEnergy: energy, charges: 0, revenue: 0 };
    const commercialEnergy = courtesy.treatment === "partner_absorbed" ? num(courtesy.commercialEnergy) : energy;

    const platform = revenue * num(cfg.platformPct) / 100;
    const ubyRoyalty = model === "third_party_management" ? revenue * num(cfg.ubyRoyaltyPct) / 100 : 0;
    const taxes = revenue * num(cfg.taxRatePct) / 100;
    const comp = energyComposition(cfg);
    let energyCost = comp.totalCost > 0 ? comp.totalCost : commercialEnergy * num(cfg.energyCostPerKWh);
    let courtesyInvoiceExcluded = 0;
    if (fixes.courtesyInvoice && comp.totalCost > 0 && courtesy.treatment === "partner_absorbed" && courtesy.energy > 0) {
      // A fatura cobre toda a energia do mês; a parte da cortesia absorvida pelo parceiro sai do custo UBY.
      const perKWh = energy > 0 ? comp.totalCost / energy : (comp.costPerKWh || num(cfg.energyCostPerKWh));
      courtesyInvoiceExcluded = Math.min(energyCost, courtesy.energy * perKWh);
      energyCost -= courtesyInvoiceExcluded;
    }

    const planning = input.planning || {};
    const costEval = evaluateRules(cfg.costRules, planning);
    const revEval = evaluateRules(cfg.revenueRules, planning);
    const marketingRevenue = revEval.details.filter(d => d.scope === "non_operational").reduce((s, d) => s + num(d.actual), 0);
    const extraRevenue = revEval.details.filter(d => d.scope !== "non_operational").reduce((s, d) => s + num(d.actual), 0);
    const matrixItems = (input.matrixItems || []).filter(i => num(i.amount) > 0);
    const matrizCost = matrixItems.reduce((s, i) => s + num(i.amount), 0);
    const matrizTaxCost = matrixItems.filter(i => /tribut|impost|taxa/i.test(`${i.category || ""} ${i.label || ""}`)).reduce((s, i) => s + num(i.amount), 0);
    const matrizCash = matrixItems.reduce((s, i) => s + num(i.cashAmount), 0);
    const localExtraCosts = costEval.actual;
    const extraCosts = localExtraCosts + matrizCost;

    const totalRevenue = revenue + extraRevenue + marketingRevenue;
    const management = totalRevenue * num(cfg.managementPct) / 100;
    const costs = energyCost + extraCosts + taxes;
    const preAreaNet = totalRevenue - management - platform - ubyRoyalty - costs;
    const areaEligible = model === "uby" || model === "hybrid";
    const areaSharePct = cfg.ownerTransferMode === "net" ? num(cfg.ownerNetProfitSharePct) : num(cfg.ownerRevenueSharePct);
    const areaParticipation = areaEligible ? totalRevenue * areaSharePct / 100 : 0;
    const operationNet = preAreaNet - areaParticipation;

    const splitNet = part => {
      const ratio = revenue > 0 ? part / revenue : 0;
      const extras = fixes.hybridMarketing ? extraRevenue + marketingRevenue : extraRevenue;
      return part + extras * ratio - management * ratio - platform * ratio - (fixes.hybridMarketing ? ubyRoyalty * ratio : 0) - (costs + areaParticipation) * ratio;
    };
    const acNet = splitNet(acRevenue), dcNet = splitNet(dcRevenue), unknownNet = splitNet(unknownRevenue);

    let ubyNet = 0, p3SocietyProfit = 0, partnerShare = 0;
    if (model === "p3_society") { p3SocietyProfit = operationNet * num(cfg.p3SocietyPct) / 100; partnerShare = operationNet - p3SocietyProfit; }
    else if (model === "management_only") { partnerShare = operationNet; }
    else if (model === "third_party_management") { partnerShare = operationNet; ubyNet = ubyRoyalty; }
    else if (model === "hybrid") {
      const acP3 = acNet * num(cfg.p3AcEquityPct) / 100, dcP3 = dcNet * num(cfg.p3DcEquityPct) / 100;
      p3SocietyProfit = acP3 + dcP3;
      if (num(cfg.p3AcEquityPct) > 0) partnerShare += acNet - acP3; else ubyNet += acNet;
      if (num(cfg.p3DcEquityPct) > 0) partnerShare += dcNet - dcP3; else ubyNet += dcNet;
      ubyNet += unknownNet;
    } else { ubyNet = operationNet; }

    const investmentValue = num(cfg.investmentValue);
    const p3InvestmentValue = model === "p3_society" ? Math.max(investmentValue * num(cfg.p3SocietyPct) / 100, 0) : investmentValue;
    const partnerInvestmentValue = model === "p3_society" ? Math.max(investmentValue - p3InvestmentValue, 0) : 0;
    const isUbyInvestorAsset = model === "uby" || model === "hybrid";
    const saRetention = Math.max(ubyNet, 0) * num(cfg.saRetentionPct) / 100;
    const ubyDistributable = Math.max(ubyNet - saRetention, 0);
    const investorDistribution = isUbyInvestorAsset ? ubyDistributable * num(cfg.investorQuotaPct) / 100 : 0;
    const direct = model === "p3_society" || model === "management_only" || model === "third_party_management";
    const partnerInvestorDistribution = direct ? Math.max(partnerShare, 0) : 0;
    const ubyRetained = Math.max(ubyNet - investorDistribution, 0);
    const p3OperationalResult = management + p3SocietyProfit;
    const ownResult = ubyNet + p3SocietyProfit;
    const paybackBase = model === "p3_society" ? p3SocietyProfit : (model === "management_only" || model === "third_party_management") ? p3OperationalResult : ownResult;
    const paybackInvestmentValue = model === "p3_society" ? p3InvestmentValue : (model === "management_only" || model === "third_party_management") ? 0 : investmentValue;
    const totalOperatingCost = energyCost + extraCosts + taxes + management + platform + ubyRoyalty + areaParticipation;

    return {
      monthKey: input.monthKey || "", operationModel: model,
      revenue, chargingRevenue: revenue, energy, commercialEnergy, acRevenue, dcRevenue,
      extraRevenue, marketingRevenue, totalRevenue,
      management, platform, ubyRoyalty, taxes, energyCost, energyComposition: comp, courtesyInvoiceExcluded,
      localExtraCosts, matrizCost, matrizTaxCost, matrizCash, extraCosts, areaSharePct, areaParticipation,
      preAreaNet, operationNet, acNet, dcNet, unknownNet,
      ubyNet, p3SocietyProfit, p3AcEquity: model === "hybrid" ? acNet * num(cfg.p3AcEquityPct) / 100 : 0, p3DcEquity: model === "hybrid" ? dcNet * num(cfg.p3DcEquityPct) / 100 : 0,
      partnerShare, p3Gross: management + p3SocietyProfit, p3OperationalResult, ownResult,
      investmentValue, p3InvestmentValue, partnerInvestmentValue, paybackInvestmentValue, paybackBase,
      paybackMonths: paybackInvestmentValue > 0 && paybackBase > 0 ? paybackInvestmentValue / paybackBase : 0,
      roiMonthly: paybackInvestmentValue > 0 ? paybackBase / paybackInvestmentValue * 100 : 0,
      margin: totalRevenue ? ownResult / totalRevenue * 100 : 0,
      saRetention, ubyDistributable, investorDistribution, partnerInvestorDistribution,
      finalDistribution: direct ? partnerInvestorDistribution : investorDistribution, ubyRetained,
      totalOperatingCost, totalCostPerKWh: commercialEnergy > 0 ? totalOperatingCost / commercialEnergy : null,
      operationMargin: totalRevenue ? operationNet / totalRevenue * 100 : 0,
      courtesyCharges: num(courtesy.charges), courtesyEnergy: num(courtesy.energy), courtesyEnergyCost: num(courtesy.energyCost),
      courtesyCostExcluded: courtesy.treatment === "partner_absorbed" ? num(courtesy.energyCost) : 0,
      costRuleDetails: costEval.details, revenueRuleDetails: revEval.details, matrixItems
    };
  }

  // Campos que somam entre meses/carregadores.
  const ADDITIVE = ["revenue", "chargingRevenue", "energy", "commercialEnergy", "acRevenue", "dcRevenue", "extraRevenue", "marketingRevenue", "totalRevenue",
    "management", "platform", "ubyRoyalty", "taxes", "energyCost", "courtesyInvoiceExcluded", "localExtraCosts", "matrizCost", "matrizTaxCost", "matrizCash", "extraCosts",
    "areaParticipation", "preAreaNet", "operationNet", "ubyNet", "p3SocietyProfit", "partnerShare", "p3Gross", "p3OperationalResult", "ownResult", "paybackBase",
    "saRetention", "ubyDistributable", "investorDistribution", "partnerInvestorDistribution", "finalDistribution", "ubyRetained", "totalOperatingCost",
    "courtesyCharges", "courtesyEnergy", "courtesyEnergyCost", "courtesyCostExcluded"];

  /*
    Um único jeito de somar resultados mensais (de um carregador ou de vários).
    Payback e ROI usam a média mensal: investimento ÷ resultado médio do mês.
    Com fixes.aggregation desligado, reproduz a soma antiga (investimento ÷ soma).
  */
  function aggregate(results, fixes = FIXES_OFF, opts = {}) {
    const list = results || [];
    const total = Object.fromEntries(ADDITIVE.map(k => [k, list.reduce((s, r) => s + num(r[k]), 0)]));
    const months = opts.months || new Set(list.map(r => r.monthKey)).size || 1;
    total.months = months;
    total.investmentValue = num(opts.investmentValue ?? list.reduce((m, r) => Math.max(m, num(r.investmentValue)), 0));
    total.paybackInvestmentValue = num(opts.paybackInvestmentValue ?? list.reduce((m, r) => Math.max(m, num(r.paybackInvestmentValue)), 0));
    const base = fixes.aggregation ? total.paybackBase / months : total.paybackBase;
    total.paybackMonths = total.paybackInvestmentValue > 0 && base > 0 ? total.paybackInvestmentValue / base : 0;
    total.roiMonthly = total.paybackInvestmentValue > 0 ? base / total.paybackInvestmentValue * 100 : 0;
    total.margin = fixes.aggregation ? (total.totalRevenue ? total.ownResult / total.totalRevenue * 100 : 0) : (total.revenue ? total.ownResult / total.revenue * 100 : 0);
    total.operationMargin = total.totalRevenue ? total.operationNet / total.totalRevenue * 100 : 0;
    total.totalCostPerKWh = total.commercialEnergy > 0 ? total.totalOperatingCost / total.commercialEnergy : null;
    total.resultPerKWh = total.energy > 0 ? total.operationNet / total.energy : null;
    total.operationModel = list.at(-1)?.operationModel || "uby";
    return total;
  }

  /*
    Resultado da rede por competência e distribuição aos cotistas.
    monthly: [{ monthKey, ownedNet, royalties }] em ordem.
    policy: { legalReservePct, expansionReservePct, investorPct, quotaValue, distributionStartMonth, investors[{name, quotas, eligibleFrom}] }
    Com lossCarry, o prejuízo acumulado é compensado antes de reserva e distribuição.
  */
  function network(monthly, policy = {}, fixes = FIXES_OFF) {
    const legalPct = num(policy.legalReservePct), expPct = num(policy.expansionReservePct), invPct = num(policy.investorPct);
    const start = policy.distributionStartMonth || "2026-06";
    const quotaValue = num(policy.quotaValue) || 80000;
    // Impostos da UBY sobre tudo o que foi faturado no mês (ativos próprios + royalties):
    // percentual da política ou valor exato lançado para a competência (guia paga).
    const taxPct = num(policy.taxRatePct);
    const taxByMonth = policy.taxByMonth && typeof policy.taxByMonth === "object" ? policy.taxByMonth : {};
    let carry = 0;
    const months = (monthly || []).map(m => {
      const taxBase = num(m.taxBase);
      const manual = taxByMonth[m.monthKey] !== undefined && taxByMonth[m.monthKey] !== null && taxByMonth[m.monthKey] !== "";
      const taxes = manual ? num(taxByMonth[m.monthKey]) : taxBase * taxPct / 100;
      const preTax = num(m.ownedNet) + num(m.royalties);
      const result = preTax - taxes;
      const carryIn = carry;
      let distributable;
      if (fixes.lossCarry) {
        const balance = carry + result;
        distributable = Math.max(balance, 0);
        carry = Math.min(balance, 0);
      } else {
        distributable = Math.max(result, 0);
      }
      const legalReserve = distributable * legalPct / 100, expansionReserve = distributable * expPct / 100;
      const investorPool = (distributable - legalReserve - expansionReserve) * invPct / 100;
      return { monthKey: m.monthKey, ownedNet: num(m.ownedNet), royalties: num(m.royalties), rows: m.rows || [], taxBase, taxes, taxSource: manual ? "valor lançado" : (taxPct ? `${taxPct}% do faturamento` : "sem imposto lançado"), preTax, result, carryIn, carryOut: carry, distributable, legalReserve, expansionReserve, investorPool, inDistribution: m.monthKey >= start };
    });
    const all = policy.investors || [];
    const investors = all.map(inv => {
      const allocations = months.map(mo => {
        if (!mo.inDistribution || mo.monthKey < inv.eligibleFrom) return 0;
        const eligibleQuotas = all.filter(x => x.eligibleFrom <= mo.monthKey).reduce((s, x) => s + num(x.quotas), 0);
        return eligibleQuotas && mo.investorPool > 0 ? mo.investorPool / eligibleQuotas * num(inv.quotas) : 0;
      });
      const due = allocations.reduce((s, x) => s + x, 0);
      const investment = num(inv.investment) || num(inv.quotas) * (num(inv.quotaValue) || quotaValue);
      const activeMonths = months.filter(mo => mo.inDistribution && mo.monthKey >= inv.eligibleFrom && mo.investorPool > 0).length;
      const returnRate = investment ? due / investment : 0;
      const annualized = activeMonths ? returnRate / activeMonths * 12 : 0;
      return { ...inv, allocations, due, investment, returnRate, annualized, paybackYears: annualized > 0 ? 1 / annualized : null };
    });
    const sum = k => months.reduce((s, m) => s + num(m[k]), 0);
    return { months, investors, quotaValue, distributionStartMonth: start,
      totals: { preTax: sum("preTax"), taxes: sum("taxes"), taxBase: sum("taxBase"), result: sum("result"), distributable: sum("distributable"), investorPool: sum("investorPool"), legalReserve: sum("legalReserve"), expansionReserve: sum("expansionReserve"), carryOut: carry } };
  }

  global.UBY_FINANCE_CORE = Object.freeze({ FIXES, FIXES_ON, FIXES_OFF, computeMonth, aggregate, network, allocate, evaluateRules, energyComposition, ADDITIVE });
})(typeof window !== "undefined" ? window : globalThis);

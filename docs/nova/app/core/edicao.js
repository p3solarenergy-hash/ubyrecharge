/*
  NOVA PLATAFORMA — edição financeira SEM TELA (Parâmetros e custos).

  Migração (fase 4, 13/11/2026): antes, a tela Parâmetros preenchia os formulários da
  página antiga escondida e mandava a página antiga gravar. Aqui as mesmas gravações
  recebem os valores direto — mesmas regras, mesmo formato no banco:
   - configuração do carregador por competência (financialSettings, como persistFinancialSettingsFromInputs)
   - custos da matriz e pagamentos programados (uby_financial_matrix, como addMatrizCost/addScheduledPayment)
   - horário, potência e operação UBY de cada local (stationAvailability/operationalPowerKw/overrides)
  Toda gravação passa por UBY_SUPABASE.comGravacao("parametros", ...): só vale na rota #/parametros.
*/
(function () {
  "use strict";
  const N = window.UBY_NUCLEO;
  const S = N.state;
  const CAMPOS = window.UBY_CAMPOS_FINANCEIROS || [];
  const ENGINE = () => window.UBY_FINANCE_ENGINE;
  const gravar = fn => window.UBY_SUPABASE.comGravacao("parametros", fn);
  const txt = s => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

  // ---------- carregador aberto ----------
  // Na moldura antiga o editor tinha um motor só dele. Aqui o motor é um só para a plataforma inteira,
  // então o "carregador aberto" do editor fica guardado à parte e só entra no motor durante cada
  // consulta/gravação do editor — e o estado anterior volta em seguida (as outras telas não mudam).
  const CORRENTE = ["currentWorkId", "currentWorkName", "currentStationReportName", "allCharges", "loadedFiles", "monthlyClosings",
    "financialSettings", "stationAvailability", "ubyOperationOverrides", "financeEditorCurrentSettings"];
  const guardar = () => Object.fromEntries(CORRENTE.map(k => [k, S[k]]));
  const repor = st => { CORRENTE.forEach(k => { S[k] = st[k]; }); N.setEditorMonth(""); };
  let aberto = null;
  function noCarregador(fn) {
    if (!aberto) throw new Error("Nenhum carregador aberto no editor.");
    const antes = guardar();
    repor(aberto.state);
    const fim = () => { aberto.state = guardar(); repor(antes); };
    let r;
    try { r = fn(); } catch (e) { fim(); throw e; }
    if (r && typeof r.then === "function") return r.finally(fim);
    fim();
    return r;
  }
  // openWorkReport sem tela: escolhe a obra/estação e carrega a base INTEIRA da obra
  // (um recorte parcial não pode virar a base gravada).
  async function abrir(workId, station = "") {
    workId = String(workId || "");
    const antes = guardar();
    try {
      S.currentWorkId = workId;
      S.currentStationReportName = N.shouldOpenFullRechargeWork(workId, station) ? "" : N.safeText(station).trim();
      S.currentWorkName = N.currentWork().nome || workId;
      await N.loadRechargeBase(workId);
      // As configurações chegam junto com a base; se a obra tem e ainda não vieram, espera.
      const temNaBase = () => { const r = S.allRechargeRecords[workId]; const fs = r && (r.financialSettings || (r.summary || {}).financialSettings); return fs ? Object.keys(fs).length : 0; };
      for (let i = 0; i < 30 && temNaBase() && (!S.financialSettings || !Object.keys(S.financialSettings).length); i++) await new Promise(r => setTimeout(r, 500));
      aberto = { workId, station: S.currentStationReportName, state: guardar() };
      return { workId, station: aberto.station, months: N.getMonths() };
    } finally { repor(antes); }
  }
  const atual = () => aberto ? { workId: aberto.workId, station: aberto.station } : null;
  const meses = () => N.getMonths();

  // ---------- valores do formulário ----------
  // applyFinanceSettingsToInputs sem tela: configuração → valor de cada campo (como a página antiga mostrava).
  function camposDe(settings = {}) {
    const def = N.defaultFinanceSettings();
    const merged = { ...def, ...settings };
    merged.operationModel = N.normalizeOperationModel(merged.operationModel);
    if (!settings.operationModel && (Number(settings.p3AcEquityPct || 0) > 0 || Number(settings.p3DcEquityPct || 0) > 0)) merged.operationModel = "hybrid";
    if (!settings.ownerTransferMode && Number(settings.ownerNetProfitSharePct || 0) > 0) merged.ownerTransferMode = "net";
    if (!Number(merged.ownerEnergyRate || 0) && Number(merged.energyCostPerKWh || 0) > 0) merged.ownerEnergyRate = merged.energyCostPerKWh;
    merged.costItems = { ...(settings.costItems || {}), ...(settings.extraCosts || {}) };
    if (Number(settings.otherCosts || 0) > 0 && !merged.costItems.otherCostsLegacy) merged.costItems.otherCostsLegacy = Number(settings.otherCosts || 0);
    merged.revenueItems = { ...(settings.revenueItems || {}), ...(settings.extraRevenue || {}) };
    merged.costRules = N.normalizeFinanceRules({ ...settings, costItems: merged.costItems }, "cost");
    merged.revenueRules = N.normalizeFinanceRules({ ...settings, revenueItems: merged.revenueItems }, "revenue");
    S.financeEditorCurrentSettings = merged;
    const raw = {
      financeOperationModel: merged.operationModel, financeMgmtPct: merged.managementPct, financeP3SocietyPct: merged.p3SocietyPct,
      financeP3AcEquityPct: merged.p3AcEquityPct, financeP3DcEquityPct: merged.p3DcEquityPct, financePlatformPct: merged.platformPct,
      financeUbyRoyaltyPct: merged.ubyRoyaltyPct, financeTaxRatePct: merged.taxRatePct, financeEnergyCost: merged.energyCostPerKWh,
      financeEnergyMode: merged.energyBillingMode, financeCopelAmount: merged.energyCopelAmount, financeCopelKWh: merged.energyCopelKWh,
      financeLeaseCreditedKWh: merged.energyLeaseCreditedKWh, financeLeaseRate: merged.energyLeaseRatePerKWh,
      financeCopelDueDay: merged.energyCopelDueDay, financeLeaseDueDay: merged.energyLeaseDueDay,
      financeInvestmentValue: merged.investmentValue, financeInvestorQuotaPct: merged.investorQuotaPct, financeSaRetentionPct: merged.saRetentionPct,
      financeTargetOccPct: merged.targetOccPct, financeTargetRevenuePerKWh: merged.targetRevenuePerKWh, financePlanningKWh: merged.costPlanningKWh,
      ownerEnergyRate: merged.ownerEnergyRate, ownerTransferMode: merged.ownerTransferMode,
      ownerRevenueSharePct: merged.ownerRevenueSharePct, ownerNetProfitSharePct: merged.ownerNetProfitSharePct
    };
    // Na página antiga só estes eram caixas de seleção; os demais eram campos numéricos (valor = Number(v || 0)).
    const SELECTS = { financeOperationModel: "operationModel", ownerTransferMode: "ownerTransferMode" };
    const fields = {};
    Object.entries(raw).forEach(([id, value]) => {
      if (SELECTS[id]) fields[id] = String(value || def[SELECTS[id]]);
      else if (id === "financeEnergyMode") fields[id] = String(value || "copel");
      else fields[id] = String(Number(value || 0));
    });
    return { fields, rules: { cost: merged.costRules, revenue: merged.revenueRules } };
  }

  // currentFinanceSettingsFromInputs sem tela: valores dos campos → configuração do mês.
  function configDe(fields, rules, mk) {
    const num = (id, fb = 0) => { const v = parseFloat(fields[id]); return Number.isFinite(v) ? v : fb; };
    const rulesOf = kind => {
      const list = rules && rules[kind];
      if (!Array.isArray(list) || !list.length) return N.normalizeFinanceRules(S.financeEditorCurrentSettings || {}, kind);
      return list.map(r => ({
        id: String(r.id || ""), label: N.safeText(r.label || ""), enabled: !!r.enabled, basis: r.basis || "fixed",
        value: Number(parseFloat(r.value) || 0),
        scope: kind === "revenue" && r.scope === "non_operational" ? "non_operational" : "operational",
        custom: r.custom === true || r.custom === "true"
      })).filter(r => r.id);
    };
    const comp = ENGINE().calculateEnergyComposition({
      mode: fields.financeEnergyMode || "copel", copelAmount: num("financeCopelAmount"), copelKWh: num("financeCopelKWh"),
      creditedKWh: num("financeLeaseCreditedKWh"), leaseRatePerKWh: num("financeLeaseRate")
    });
    const energyCostPerKWh = comp.costPerKWh || num("financeEnergyCost");
    const saved = N.financeSettingsForMonth(mk);
    const savedOwnerEnergyRate = Number(saved.ownerEnergyRate || 0);
    const costRules = rulesOf("cost"), revenueRules = rulesOf("revenue");
    return {
      operationModel: N.normalizeOperationModel(fields.financeOperationModel || "uby"),
      managementPct: num("financeMgmtPct", 5), p3SocietyPct: num("financeP3SocietyPct"), p3AcEquityPct: num("financeP3AcEquityPct"),
      p3DcEquityPct: num("financeP3DcEquityPct"), platformPct: num("financePlatformPct"), ubyRoyaltyPct: num("financeUbyRoyaltyPct"),
      taxRatePct: num("financeTaxRatePct"), energyCostPerKWh, energyBillingMode: comp.mode, energyCopelAmount: comp.copelCost,
      energyCopelKWh: comp.copelKWh, energyLeaseCreditedKWh: comp.creditedKWh, energyLeaseRatePerKWh: comp.leaseRatePerKWh,
      energyCopelDueDay: num("financeCopelDueDay"), energyLeaseDueDay: num("financeLeaseDueDay", 10),
      investmentValue: num("financeInvestmentValue"), investorQuotaPct: num("financeInvestorQuotaPct", 100),
      saRetentionPct: num("financeSaRetentionPct"), targetOccPct: num("financeTargetOccPct"), targetRevenuePerKWh: num("financeTargetRevenuePerKWh"),
      ownerEnergyRate: num("ownerEnergyRate", savedOwnerEnergyRate || energyCostPerKWh),
      ownerTransferMode: fields.ownerTransferMode || saved.ownerTransferMode || "gross",
      ownerRevenueSharePct: num("ownerRevenueSharePct", Number(saved.ownerRevenueSharePct || 0)),
      ownerNetProfitSharePct: num("ownerNetProfitSharePct", Number(saved.ownerNetProfitSharePct || 0)),
      costPlanningKWh: num("financePlanningKWh", Number(S.financeEditorCurrentSettings?.costPlanningKWh || 0)),
      costRules, revenueRules,
      costItems: N.financeLegacyValuesFromRules(costRules, "cost"), revenueItems: N.financeLegacyValuesFromRules(revenueRules, "revenue"),
      periodMeta: { ...(saved.periodMeta || {}) }
    };
  }

  function preparar(mk, edits = {}, rules = null) {
    N.setEditorMonth(mk);
    const base = camposDe(N.financeSettingsForMonth(mk));
    const fields = { ...base.fields, ...Object.fromEntries(Object.entries(edits || {}).map(([k, v]) => [k, String(v ?? "")])) };
    const settings = configDe(fields, rules || base.rules, mk);
    S.financeEditorCurrentSettings = settings;
    return { fields, settings };
  }

  // Formulário do carregador na competência: campos, anterior, situação, regras, resumo — o que a tela mostra.
  function formulario(mk, edits = {}, rules = null) {
    const { fields, settings } = preparar(mk, edits, rules);
    const resolution = N.financeMonthResolution(mk);
    const exact = N.financeExactSettingsForMonth(mk);
    const prev = resolution.previousMonth ? N.financeSettingsForMonth(resolution.previousMonth) : null;
    const meta = exact.periodMeta || settings.periodMeta || {};
    let versionSource, versionHelp;
    if (resolution.exact) {
      versionSource = meta.inheritedFrom ? N.monthLabel(meta.inheritedFrom) : "Valores proprios do mes";
      versionHelp = meta.inheritedFrom ? "base copiada e preservada nesta competencia" : "configuracao mensal ja registrada";
    } else if (resolution.previousMonth) {
      versionSource = N.monthLabel(resolution.previousMonth); versionHelp = "valores herdados; serao fixados automaticamente";
    } else { versionSource = "Configuracao inicial"; versionHelp = "primeira competencia financeira deste ponto"; }
    const rows = CAMPOS.map(c => {
      const cur = settings[c.key], before = prev ? prev[c.key] : undefined;
      const state = N.financeVersionStateInfo(N.financeSettingValuesEqual(cur, before), !!prev, resolution.exact);
      let previous;
      if (c.key === "energyCostPerKWh") {
        const comp = ENGINE().calculateEnergyComposition({ mode: settings.energyBillingMode, copelAmount: settings.energyCopelAmount, copelKWh: settings.energyCopelKWh, creditedKWh: settings.energyLeaseCreditedKWh, leaseRatePerKWh: settings.energyLeaseRatePerKWh });
        previous = `${N.fmtBRL(comp.costPerKWh)}/kWhcusto calculado | anterior: ${prev ? N.formatFinanceSettingValue(before, c.format) : "Sem base anterior"}`;
      } else previous = prev ? N.formatFinanceSettingValue(before, c.format) : "Sem base anterior";
      return { key: c.key, id: c.id, models: c.models, group: c.group, name: c.name, rule: c.rule, previous: txt(previous), state: state.label,
        controls: c.controls.map(ct => ({ ...ct, value: fields[ct.id] ?? "" })) };
    });
    const prevRules = kind => new Map((prev ? N.normalizeFinanceRules(prev, kind) : []).map(r => [String(r.id), r]));
    const ruleRows = kind => {
      const p = prevRules(kind);
      return (kind === "cost" ? settings.costRules : settings.revenueRules).map(r => ({ id: r.id, custom: !!r.custom, label: r.label, enabled: !!r.enabled, basis: r.basis || "fixed", value: Number(r.value || 0), scope: r.scope || "operational", previous: N.financeRuleDisplayValue(p.get(String(r.id))) }));
    };
    const charges = N.chargesForMonth(mk);
    const result = N.financeForCharges(charges, settings, { monthKey: mk, matrizCostItems: N.currentMatrizItems(mk) });
    const clients = new Set(charges.map(c => c.userEmail || c.userName).filter(Boolean)).size;
    const summary = [
      { label: "Receita", value: N.fmtBRL(result.totalRevenue || result.revenue || 0), sub: "" },
      { label: "Custos totais", value: N.fmtBRL(result.totalOperatingCost || 0), sub: "" },
      { label: "Resultado", value: N.fmtBRL(Number(result.operationNet || 0)), sub: "" },
      { label: "Operacao", value: `${charges.length} recargas`, sub: `${clients} cliente(s) | ${N.fmtKWh(result.energy || 0)}` }
    ];
    const n = id => parseFloat(fields[id]) || 0;
    const comp = ENGINE().calculateEnergyComposition({ mode: fields.financeEnergyMode, copelAmount: n("financeCopelAmount"), copelKWh: n("financeCopelKWh"), creditedKWh: n("financeLeaseCreditedKWh"), leaseRatePerKWh: n("financeLeaseRate") });
    const due = (id, fb) => { const v = parseFloat(fields[id]); return Number.isFinite(v) ? v : fb; };
    const payMonth = N.matrizAddMonths(mk, 1);
    const parts = [];
    if (comp.copelCost > 0 && due("financeCopelDueDay", 0) > 0) parts.push(`Copel: dia ${due("financeCopelDueDay", 0)}`);
    if (comp.leaseCost > 0 && due("financeLeaseDueDay", 10) > 0) parts.push(`arrendamento: dia ${due("financeLeaseDueDay", 10)}`);
    const plan = parts.length && payMonth ? `Pagamento programado em ${N.monthLabel(payMonth)} — ${parts.join(" | ")}` : "Informe os valores e vencimentos para criar os pagamentos do mês seguinte.";
    const energySummary = txt(`Copel: ${N.fmtBRL(comp.copelCost)} | Arrendamento: ${N.fmtBRL(comp.leaseCost)} | Total de energia no mês: ${N.fmtBRL(comp.totalCost)} | Custo calculado do mês: ${N.fmtBRL(comp.costPerKWh)}/kWh${plan}`);
    return { rows, cost: ruleRows("cost"), revenue: ruleRows("revenue"), summary, energySummary, versionSource, versionHelp, settings, fields, mode: comp.mode };
  }

  // ---------- gravações ----------
  // persistFinancialSettingsFromInputs + financeSaveSnapshot + commitPendingFinancialSettingsSave, sem tela.
  async function salvarCompetencia(mk, edits = {}, rules = null, inheritedFromOverride = "") {
    if (!mk || !S.currentWorkId) throw new Error("Carregador ou competência não escolhidos. Nada foi gravado.");
    const { settings } = preparar(mk, edits, rules);
    const resolutionBefore = N.financeMonthResolution(mk);
    const previousMeta = N.financeExactSettingsForMonth(mk).periodMeta || {};
    const now = new Date().toISOString();
    settings.periodMeta = { ...previousMeta, month: mk, inheritedFrom: inheritedFromOverride || previousMeta.inheritedFrom || resolutionBefore.previousMonth || "", createdAt: previousMeta.createdAt || now, updatedAt: now };
    const scopeKey = N.financeChargerStorageKey();
    let fs = S.financialSettings || {};
    if (scopeKey) {
      const chargers = { ...(fs.chargers || {}) };
      const scoped = { ...(chargers[scopeKey] || {}), [mk]: settings };
      const latest = ENGINE().monthKeys(scoped).at(-1) || mk;
      if (!scoped.default || mk === latest) scoped.default = settings;
      chargers[scopeKey] = scoped;
      fs = { ...fs, chargers };
    } else {
      const updated = { ...fs, [mk]: settings };
      const latest = ENGINE().monthKeys(updated).at(-1) || mk;
      if (!updated.default || mk === latest) updated.default = settings;
      fs = updated;
    }
    S.financialSettings = fs;
    S.financeEditorCurrentSettings = settings;
    const record = N.financeRecordWithCurrentSettings();
    record.metadataType = "financial_settings";
    const snapshot = { workId: String(S.currentWorkId), monthKey: mk, workName: S.currentWorkName, stationName: S.currentStationReportName, stationKey: scopeKey, settings: JSON.parse(JSON.stringify(settings)), record: JSON.parse(JSON.stringify(record)) };
    N.saveLocalRechargeRecordFor(snapshot.workId, snapshot.record);
    await gravar(async () => {
      await N.saveFinancialSettingsRecord(snapshot.workId, snapshot.record);
      await N.syncEnergyPaymentsFromFinanceSnapshot(snapshot);
      await S.matrizCostsSaveChain;
    });
    return `Financeiro de ${N.monthLabel(mk)} salvo para ${S.currentWorkName}.`;
  }

  // A gravação da matriz na nuvem é encadeada (persistMatrizCosts); um aviso de falha vira erro.
  async function esperarMatriz() {
    await S.matrizCostsSaveChain;
    const msg = window.UBY_NUCLEO.status().message || "";
    if (/pendente|erro|falha|bloquead|somente leitura/i.test(msg)) throw new Error(msg);
    return msg || "salvo";
  }
  // Grava a lista inteira da matriz (quem chama relê a nuvem antes).
  const salvarMatriz = list => gravar(async () => { N.saveMatrizCosts(list); return esperarMatriz(); });
  const salvarPolitica = distribution => gravar(async () => { N.saveNetworkDistribution(distribution); return esperarMatriz(); });

  // addMatrizCost sem tela. f = { name, amount, category, supplier, kind, installments, coverage, startMonth, endMonth,
  // dueDay, method, shares, documentRef, notes, targets: [scope...] } (targets vazio = todos os carregadores elegíveis).
  async function salvarCustoMatriz(f, mk, editingId = "") {
    N.setEditorMonth(mk);
    const name = N.safeText(f.name || "").trim();
    const amount = Math.max(0, Number(f.amount || 0));
    if (!name || !amount) throw new Error("Informe o nome e o valor de cada parcela ou competencia.");
    const targetRows = N.matrizEligibleRows(N.getGeneralUnitData(), N.financeMonthKey());
    const allTargets = targetRows.map(N.matrizScopeKey);
    const targetIds = (f.targets || []).length ? f.targets : allTargets;
    if (!targetIds.length) throw new Error("Selecione pelo menos um carregador de destino.");
    const list = N.loadMatrizCosts();
    const previous = list.find(item => item.id === editingId);
    const existingTargets = new Map((previous?.targets || []).map(t => [t.scope, t]));
    const existingFor = scope => {
      if (existingTargets.has(scope)) return existingTargets.get(scope);
      const currentRow = N.matrizResolveTargetRow(scope, targetRows);
      return (previous?.targets || []).find(t => { const priorRow = N.matrizResolveTargetRow(t, targetRows); return priorRow && currentRow && N.matrizRowsMatch(priorRow, currentRow); });
    };
    const shares = N.safeText(f.shares || "").split(/[;,]/).map(v => Math.max(0, Number(v.trim().replace(",", ".")) || 0));
    const startMonth = f.startMonth || N.financeMonthKey();
    const kind = f.kind || "recurring";
    const cost = N.matrizNormalizeCost({ ...previous, id: previous?.id || `m${Date.now().toString(36)}`, name, amount,
      category: f.category || "Outros custos", supplier: f.supplier || "", costKind: kind,
      installments: kind === "installment" ? (f.installments || 1) : 1,
      coverageMonths: kind === "installment" ? Math.max(1, Math.round(Number(f.coverage) || Number(f.installments) || 1)) : 1,
      startMonth, endMonth: f.endMonth || "", dueDay: f.dueDay || 1, allocation: f.method || "equal", documentRef: f.documentRef || "", notes: f.notes || "", enabled: true,
      targets: targetIds.map((scope, index) => {
        const existing = existingFor(scope);
        const row = N.matrizResolveTargetRow(scope, targetRows);
        return { ...N.matrizTargetIdentity(row || { workId: String(scope).split("::")[0], key: String(scope).split("::")[1] || "" }), scope, startMonth: existing?.startMonth || startMonth, share: shares[index] || existing?.share || 0 };
      }), updatedAt: new Date().toISOString() });
    if (previous) Object.assign(previous, cost); else list.push(cost);
    await salvarMatriz(list);
    return `Custo ${name} salvo. O rateio fica gravado por competencia e destino.`;
  }
  async function desativarCusto(id) {
    const list = N.loadMatrizCosts(); const item = list.find(c => c.id === id); if (!item) throw new Error("Custo não encontrado.");
    item.enabled = false; item.updatedAt = new Date().toISOString();
    await salvarMatriz(list);
    return "Custo desativado. O historico anterior permanece preservado.";
  }
  async function excluirCusto(id) {
    const item = N.loadMatrizCosts().find(c => c.id === id); if (!item) throw new Error("Custo não encontrado.");
    await salvarMatriz(N.loadMatrizCosts().filter(c => c.id !== id));
    return `Custo ${item.name} excluido definitivamente.`;
  }

  // Destinos das contas programadas (as opções do formulário antigo).
  function alvosPagamento() {
    const rows = N.getGeneralStationRows(N.getGeneralUnitData() || []);
    return rows.map(row => ({ value: `${row.workId}::${N.normalizeStationForCompare(row.stationName || row.station || row.workName)}`, text: `${row.stationName || row.station || row.workName} | ${row.workName || ""}`, station: row.stationName || row.station || row.workName || "", workName: row.workName || "" }));
  }
  // addScheduledPayment sem tela. p = { target, name, supplier, category, amount, dueDay, startMonth, endMonth }
  async function salvarPagamento(p, fallbackMonth) {
    const opt = alvosPagamento().find(o => o.value === p.target);
    const name = N.safeText(p.name || "").trim(), amount = Math.max(0, Number(p.amount || 0));
    const startMonth = p.startMonth || fallbackMonth || N.monthKey(new Date());
    if (!opt || !name || !amount || !/^\d{4}-\d{2}$/.test(startMonth)) throw new Error("Informe carregador, pagamento, valor e mês inicial.");
    const [workId] = String(opt.value).split("::");
    const item = N.matrizNormalizeCost({ id: `p${Date.now().toString(36)}`, name, amount, scheduledPayment: true, costKind: "recurring", installments: 1, coverageMonths: 1, category: p.category || "Outros custos", supplier: p.supplier || "", startMonth, endMonth: p.endMonth || "", dueDay: p.dueDay || 11, allocation: "equal", paymentLedger: {}, enabled: true, targets: [{ scope: opt.value, workId, station: opt.station, workName: opt.workName, startMonth, share: 100 }] });
    await salvarMatriz([...N.loadMatrizCosts(), item]);
    return "Pagamento programado salvo.";
  }
  async function situacaoPagamento(id, mk, status) {
    const list = N.loadMatrizCosts(); const item = list.find(c => c.id === id);
    if (!item || !/^\d{4}-\d{2}$/.test(mk || "")) throw new Error("Pagamento não encontrado.");
    item.paymentLedger = { ...(item.paymentLedger || {}), [mk]: { status: status === "paid" ? "paid" : "pending", paidAt: status === "paid" ? new Date().toISOString() : "", updatedAt: new Date().toISOString() } };
    item.updatedAt = new Date().toISOString();
    await salvarMatriz(list);
    return status === "paid" ? "pago" : "reaberto";
  }

  // saveStationLayoutConfiguration sem tela. f = campos do horário; dayHours = horário por dia (undefined = mantém o gravado).
  async function salvarHorario(workId, sourceName, f, dayHours) {
    const openDays = (f.openDays || []).map(Number);
    if (!workId || !sourceName || !openDays.length) throw new Error("Selecione ao menos um dia de funcionamento.");
    const config = {
      plantName: String(f.plantName || "").trim() || sourceName,
      acChargers: Math.max(0, Number(f.acChargers) || 0), acPlugs: Math.max(0, Number(f.acPlugs) || 0),
      dcChargers: Math.max(0, Number(f.dcChargers) || 0), dcPlugs: Math.max(0, Number(f.dcPlugs) || 0),
      operationStart: /^\d{4}-\d{2}-\d{2}$/.test(f.operationStart || "") ? f.operationStart : "",
      open24h: f.open24h !== false, openTime: f.openTime || "08:00", closeTime: f.closeTime || "22:00", openDays,
      referenceTariffPerKwh: Math.max(0, Number(f.referenceTariffPerKwh) || 0),
      courtesyTreatment: ["operational", "partner_absorbed", "uby_absorbed"].includes(f.courtesyTreatment) ? f.courtesyTreatment : "operational",
      courtesyResponsible: N.safeText(f.courtesyResponsible || "").trim(),
      courtesyUsers: N.safeText(f.courtesyUsersText || "").split(/[\n,;]/).map(v => v.trim()).filter(Boolean)
    };
    const source = S.allRechargeRecords[workId] || N.localRecord(workId) || N.rechargeMetadataSeed(workId);
    const availability = { ...(source.stationAvailability || source.summary?.stationAvailability || {}) };
    const previousDayHours = availability[N.stationAvailabilityKey(sourceName)]?.dayHours;
    const dh = dayHours !== undefined ? dayHours : previousDayHours;
    if (dh && typeof dh === "object" && Object.keys(dh).length) config.dayHours = dh;
    availability[N.stationAvailabilityKey(sourceName)] = config;
    const updatedAt = new Date().toISOString();
    const record = { ...source, stationAvailability: availability, summary: { ...(source.summary || {}), stationAvailability: availability, updatedAt }, updatedAt };
    S.allRechargeRecords[workId] = N.hydratedRechargeRecord(record, workId);
    if (workId === S.currentWorkId) S.stationAvailability = availability;
    const db = N.localRechargeDb(); db[workId] = N.compactRechargeRecord(record); N.writeJson(N.RECARGAS_LOCAL_KEY, db);
    N.markRechargeRecordsDirty();
    await gravar(() => window.UBY_SUPABASE.saveRechargeMetadata(workId, record));
    return `Horario operacional salvo para ${config.plantName}.`;
  }

  // saveOperationalPowerFromInputs sem tela.
  async function salvarPotencia(workId, value) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate) || candidate < 1 || candidate > 360) throw new Error("Informe uma potência operacional entre 1 e 360 kW.");
    const power = Math.round(candidate * 10) / 10;
    // Como a tela antiga (openWorkReport antes de gravar): relê a obra do banco, para não gravar por cima
    // de algo que mudou em outra aba. O "carregador aberto" do motor volta ao que era.
    const antes = guardar();
    try {
      S.currentWorkId = String(workId); S.currentStationReportName = ""; S.currentWorkName = N.currentWork().nome || workId;
      await N.loadRechargeBase(String(workId));
    } finally { repor(antes); }
    const source = S.allRechargeRecords[workId] || N.localRecord(workId) || N.rechargeMetadataSeed(workId);
    const updatedAt = new Date().toISOString();
    const record = { ...source, operationalPowerKw: power, summary: { ...(source.summary || {}), operationalPowerKw: power, updatedAt }, updatedAt };
    S.allRechargeRecords[workId] = N.hydratedRechargeRecord(record, workId);
    const db = N.localRechargeDb(); db[workId] = N.compactRechargeRecord(record); N.writeJson(N.RECARGAS_LOCAL_KEY, db);
    window.UBY_RECHARGE_RUNTIME?.cacheSet?.(`work:${workId}`, record).catch(() => {});
    N.markRechargeRecordsDirty();
    await gravar(() => window.UBY_SUPABASE.saveRechargeMetadata(workId, { ...record, metadataType: "operational_power" }));
    return `${power} kW`;
  }

  // toggleUbyOperation (regra sem tela): só precisa da permissão de gravar.
  const operacaoUby = (workId, key, on) => gravar(() => N.toggleUbyOperation(workId, key, on));
  // Gravação de metadados de uma obra (faturas, repasse à área…).
  const salvarMetadados = (workId, payload) => gravar(() => window.UBY_SUPABASE.saveRechargeMetadata(workId, payload));

  window.UBY_EDICAO = {
    abrir, atual, meses,
    formulario: (mk, edits, rules) => noCarregador(() => formulario(mk, edits, rules)),
    salvarCompetencia: (mk, edits, rules, inherited) => noCarregador(() => salvarCompetencia(mk, edits, rules, inherited)),
    camposDe, configDe,
    salvarMatriz, salvarPolitica, salvarCustoMatriz, desativarCusto, excluirCusto,
    alvosPagamento, salvarPagamento, situacaoPagamento,
    salvarHorario, salvarPotencia, operacaoUby, salvarMetadados, esperarMatriz, gravar
  };
})();

/*
  Parâmetros e custos — tela nova de edição financeira.
  Por baixo roda a plataforma original (recargas.html?nova_params=1) invisível,
  com gravação liberada só para: parâmetros por carregador (obra_recargas_base,
  update), matriz/pagamentos/cotas (uby_financial_matrix) e log de auditoria.
  Toda conta e toda gravação são as funções originais; aqui só a interface.
  Segurança: antes de gravar matriz/pagamentos/cotas, relê o bloco da nuvem —
  se a leitura falhar, nada é gravado (evita sobrescrever custos cadastrados).
*/
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const SRC = "legado/obra-ev/recargas.html?nova_params=1";
  const ui = { tab: "carregador", charger: "", month: "", edits: {}, rules: null, matrixMonth: "", editingCost: "", costForm: null, payMonth: new Date().toISOString().slice(0, 7), payForm: null, policyEdits: null, log: [] };
  let frame = null, readyPromise = null, busy = false;

  // ---------- motor original oculto ----------
  function engine() {
    if (readyPromise && frame && document.body.contains(frame)) return readyPromise;
    frame = document.createElement("iframe");
    frame.id = "paramsFrame";
    frame.title = "Motor de parâmetros";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:1200px;height:900px;left:-99999px;top:0;border:0;visibility:hidden";
    frame.src = SRC + "&t=" + Date.now();
    document.body.appendChild(frame);
    readyPromise = new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(async () => {
        try {
          const w = frame.contentWindow;
          const recs = w.eval("Object.keys(allRechargeRecords || {}).length");
          if (typeof w.renderFinanceiro === "function" && typeof w.addMatrizCost === "function" && recs > 0 && w.UBY_SUPABASE_CLIENT) {
            clearInterval(timer);
            try { await w.ensureMatrizCostsLoaded(); } catch (_) {}
            resolve(w);
            return;
          }
        } catch (_) {}
        if (Date.now() - t0 > 120000) { clearInterval(timer); reject(new Error("A plataforma original não respondeu em 120 s.")); }
      }, 500);
    });
    readyPromise.catch(() => { readyPromise = null; });
    return readyPromise;
  }
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/parametros") && frame) { frame.remove(); frame = null; readyPromise = null; }
  });
  const canWrite = w => w && w.UBY_WRITE_SCOPE === "parametros";
  const txt = el => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const log = (msg, cls = "ok") => { ui.log.unshift({ at: new Date().toISOString(), msg, cls }); ui.log = ui.log.slice(0, 30); };
  const refreshPanels = () => document.getElementById("refreshButton")?.click();

  // Relê matriz + política de cotas da nuvem antes de qualquer gravação desse bloco.
  async function resyncMatrix(w) {
    const remote = await w.UBY_SUPABASE.loadFinancialMatrix();
    if (!remote || !Array.isArray(remote.matrizCosts)) throw new Error("Não consegui ler a matriz de custos na nuvem. Nada foi gravado, para não sobrescrever o que já existe.");
    w.saveMatrizCosts(remote.matrizCosts, { remote: false });
    if (remote.networkDistribution && Object.keys(remote.networkDistribution).length) w.saveNetworkDistribution(remote.networkDistribution, { remote: false });
    return remote;
  }
  async function awaitMatrixSave(w) {
    await w.eval("matrizCostsSaveChain");
    const fb = txt(w.document.getElementById("matrizFeedback")) || txt(w.document.getElementById("storageState"));
    if (/pendente|erro|falha|bloquead|somente leitura/i.test(fb)) throw new Error(fb);
    return fb;
  }
  // Impostos sobre o recebido: relê extrato e matriz na nuvem, recalcula as linhas automáticas (PIS/COFINS
  // mensal, IRPJ/CSLL trimestral) e só grava se algo mudou. force = linhas que voltam à projeção.
  async function syncTaxLines(w, force = []) {
    const B = window.UBY_BANK;
    if (!B?.taxPlan) throw new Error("Cálculo de impostos indisponível.");
    const bank = (await w.UBY_SUPABASE.loadBankData()).payload || {};
    const plan = B.taxPlan(bank.transactions || [], bank.links || {});
    await resyncMatrix(w);
    const res = B.applyTaxPlan(w.loadMatrizCosts(), plan.lines, w.matrizNormalizeCost, new Date().toISOString(), force);
    if (!res.changed) return "impostos já estavam em dia";
    w.saveMatrizCosts(res.costs);
    await awaitMatrixSave(w);
    const r = res.report;
    return `impostos atualizados (${r.added.length} nova(s), ${r.updated.length} ajustada(s), ${r.removed.length} removida(s))`;
  }

  // ---------- leitura dos dados do motor ----------
  function chargers(w) {
    const rows = w.getUbyChargerRows(w.getGeneralUnitData());
    const latest = (w.getMonths?.() || []).at(-1) || "";
    return rows.map(r => {
      let model = "";
      try { model = r.included ? w.normalizeOperationModel(w.financeSettingsForUbyRow(r, latest).operationModel) : ""; } catch (_) {}
      return { key: `${r.workId}|${r.station}`, workId: String(r.workId), workName: r.workName, station: r.station, kind: r.kind, included: r.included, model };
    });
  }

  function resolveKey(list, key) {
    if (!key || list.some(c => c.key === key)) return key;
    const [wid, st] = String(key).split("|");
    const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^uby recharge\s*-\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
    const same = list.filter(c => c.workId === String(wid));
    const hit = same.find(c => norm(c.station) === norm(st)) || (same.length === 1 ? same[0] : null)
      || same.find(c => norm(c.station).includes(norm(st)) || norm(st).includes(norm(c.station)));
    return hit ? hit.key : key;
  }

  async function openCharger(w, key, month) {
    const [workId, station] = key.split("|");
    const wantStation = w.shouldOpenFullRechargeWork?.(workId, station) ? "" : station;
    // Na primeira abertura a plataforma original já "está" na primeira obra (ex.: Robert Koch) sem ter
    // carregado as configurações dela: o formulário vinha zerado (internet R$ 0 em vez de R$ 108,64) e
    // "Salvar competência" gravaria os zeros. Configuração vazia → abre a obra de novo.
    // As configurações de cada obra chegam depois da base de recargas: na primeira vez espera chegarem
    // (até 15 s) e reabre a obra, para o formulário não ler o padrão vazio.
    const recFs = () => w.eval(`(function(id){ const r = allRechargeRecords[id]; const fs = r && (r.financialSettings || (r.summary || {}).financialSettings); return fs ? Object.keys(fs).length : 0; })(${JSON.stringify(workId)})`);
    w.__novaFsReady = w.__novaFsReady || {};
    let first = false;
    if (!w.__novaFsReady[workId]) {
      for (let i = 0; i < 30 && !recFs(); i++) await new Promise(r => setTimeout(r, 500));
      w.__novaFsReady[workId] = true; first = true;
    }
    const empty = w.eval("!financialSettings || !Object.keys(financialSettings).length");
    if (first || empty || String(w.eval("currentWorkId")) !== workId || String(w.eval("currentStationReportName") || "") !== wantStation) {
      await w.openWorkReport(workId, "mensal", station);
    }
    // openWorkReport volta antes das configurações da obra entrarem na tela original: espera.
    if (recFs()) for (let i = 0; i < 30 && w.eval("!financialSettings || !Object.keys(financialSettings).length"); i++) await new Promise(r => setTimeout(r, 500));
    w.renderFinanceiro(true);
    const sel = w.document.getElementById("financeMonthSelector");
    const months = [...(sel?.options || [])].map(o => o.value);
    const mk = months.includes(month) ? month : (months.at(-1) || "");
    if (sel && mk) sel.value = mk;
    w.renderFinanceiro(true);
    return { months, mk };
  }

  function readForm(w) {
    const d = w.document;
    const labelOf = el => {
      const l = el.closest("label");
      if (!l) return "";
      return [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    };
    const rows = [...d.querySelectorAll("tr[data-finance-setting-key]")].map(tr => ({
      key: tr.dataset.financeSettingKey, id: tr.id || "", models: tr.classList.contains("finance-model-row") ? String(tr.dataset.models || "") : null,
      group: txt(tr.querySelector(".setting-group")), name: txt(tr.querySelector(".setting-name")), rule: txt(tr.querySelector(".setting-rule")),
      previous: txt(tr.querySelector("[data-finance-setting-previous]")), state: txt(tr.querySelector("[data-finance-setting-state]")),
      controls: [...tr.querySelectorAll(".setting-value input:not([type=hidden]), .setting-value select")].map(el => ({
        id: el.id, tag: el.tagName, type: el.type || "", value: el.value, min: el.min, max: el.max, step: el.step, placeholder: el.placeholder || "", label: labelOf(el),
        leaseOnly: !!el.closest("[data-energy-lease-field]"),
        options: el.tagName === "SELECT" ? [...el.options].map(o => ({ value: o.value, text: o.text })) : []
      })).filter(c => c.id)
    }));
    const rules = kind => [...d.querySelectorAll(`tr[data-finance-rule-kind="${kind}"]`)].map(tr => ({
      id: tr.dataset.ruleId, custom: tr.dataset.custom === "true",
      label: tr.querySelector('[data-rule-field="label"]')?.value || "", enabled: !!tr.querySelector('[data-rule-field="enabled"]')?.checked,
      basis: tr.querySelector('[data-rule-field="basis"]')?.value || "fixed", value: Number(tr.querySelector('[data-rule-field="value"]')?.value || 0),
      scope: tr.querySelector('[data-rule-field="scope"]')?.value || "operational", previous: txt(tr.querySelector("[data-rule-previous]"))
    }));
    const summary = [...d.querySelectorAll("#financeCommandSummary .finance-command-metric")].map(m => ({ label: txt(m.querySelector("span")), value: txt(m.querySelector("strong")), sub: txt(m.querySelectorAll("span")[1]) }));
    return {
      rows, cost: rules("cost"), revenue: rules("revenue"), summary,
      energySummary: txt(d.getElementById("financeEnergyCompositionSummary")),
      versionSource: txt(d.getElementById("financeVersionSource")), versionHelp: txt(d.getElementById("financeVersionSourceHelp"))
    };
  }

  // Aplica as edições da tela nos campos da plataforma original e recalcula (sem gravar).
  function applyToEngine(w) {
    const d = w.document;
    Object.entries(ui.edits).forEach(([id, value]) => { const el = d.getElementById(id); if (el) el.value = value; });
    if (ui.rules) {
      w.renderFinanceRuleInputs("financeCostRuleRows", ui.rules.cost, "cost");
      w.renderFinanceRuleInputs("financeRevenueRuleRows", ui.rules.revenue, "revenue");
    }
    w.updateFinanceModelVisibility(d.getElementById("financeOperationModel")?.value || "uby");
    w.updateOwnerTransferModeVisibility(d.getElementById("ownerTransferMode")?.value || "gross");
    try { w.updateEnergyCompositionSummary(); } catch (_) {}
    w.renderFinanceiro(false);
  }

  // ---------- telas ----------
  function modelVisible(row, model, transfer) {
    if (row.models !== null && !row.models.split(/\s+/).includes(model)) return false;
    if (row.id === "ownerRevenueShareRow" && transfer === "net") return false;
    if (row.id === "ownerNetProfitShareRow" && transfer !== "net") return false;
    return true;
  }
  const field = (label, inner) => `<label class="imp-field" style="min-width:0"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span>${inner}</label>`;
  function control(c, row) {
    const v = ui.edits[c.id] ?? c.value;
    const input = c.tag === "SELECT"
      ? `<select class="select" data-ctl="${esc(c.id)}">${c.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? "selected" : ""}>${esc(o.text)}</option>`).join("")}</select>`
      : `<input class="select" data-ctl="${esc(c.id)}" type="${esc(c.type || "number")}" value="${esc(v)}" ${c.min !== "" ? `min="${esc(c.min)}"` : ""} ${c.max !== "" ? `max="${esc(c.max)}"` : ""} ${c.step ? `step="${esc(c.step)}"` : ""} placeholder="${esc(c.placeholder)}" style="width:100%">`;
    return field(c.label || row.name, input);
  }

  // Retenção e % de cotas não são mais por carregador: o fundo de reserva (SCP, sem reserva legal) e a
  // parte dos cotistas valem sobre o resultado consolidado (Cotas, impostos e rodadas).
  const CENTRAL_KEYS = ["saRetentionPct", "investorQuotaPct"];
  function chargerTab(w, data) {
    const list = data.chargers;
    const groups = [["Operação UBY", c => c.included && ["uby", "hybrid"].includes(c.model)], ["Parceiros · royalty UBY", c => c.included && c.model === "third_party_management"],
      ["Só gestão P3", c => c.included && ["management_only", "p3_society"].includes(c.model)], ["Fora da operação UBY", c => !c.included]];
    const f = data.form;
    const ctl = id => f.rows.flatMap(r => r.controls).find(c => c.id === id)?.value;
    const model = ui.edits.financeOperationModel ?? ctl("financeOperationModel") ?? "uby";
    const transfer = ui.edits.ownerTransferMode ?? ctl("ownerTransferMode") ?? "gross";
    const energyMode = ui.edits.financeEnergyMode ?? ctl("financeEnergyMode") ?? "copel";
    const rules = ui.rules || { cost: f.cost, revenue: f.revenue };
    const dirty = Object.keys(ui.edits).length > 0 || !!ui.rules;
    // Números oficiais (motor v2: relatórios, financeiro e fechamentos) e faturas de energia.
    const [wid, st] = String(ui.charger || "|").split("|");
    const api = UBY.state.api;
    let off = null, inv = null;
    try { const s = api?.stationFinance?.(wid, st, ui.month); if (s && s.finance) off = { ...s, operating: s.monthKey === ui.month }; } catch (_) {}
    try { inv = api?.energyInvoices?.(wid, st) || null; } catch (_) {}
    const hasInv = !!(inv && (inv.stored || []).length);
    const invMonth = hasInv ? inv.months?.[ui.month] : null;
    const firstOp = off?.monthly?.[0]?.key || "";
    const mName = m => api?.monthName?.(m) || m;
    const officialCards = off && off.operating
      ? [kpi("Receita", fmt.brl(off.finance.totalRevenue || off.finance.revenue), "oficial desta competência"), kpi("Custos totais", fmt.brl(off.finance.totalOperatingCost), hasInv ? "energia pelas faturas por leitura" : ""),
         kpi("Resultado", fmt.brl(off.finance.operationNet), "o mesmo dos relatórios e fechamentos", "", "lead"), (() => { const op = f.summary.find(m => /opera/i.test(m.label)); return kpi("Operação", esc(op?.value || "—"), `${fmt.kwh(off.finance.energy)} entregues`); })()].join("")
      : [kpi("Receita", fmt.brl(0), "sem operação nesta competência"), kpi("Custos totais", fmt.brl(0), "não entram no resultado oficial"), kpi("Resultado", "fora do resultado", firstOp ? `operação começou em ${mName(firstOp)}` : "sem operação", "", "lead"), kpi("Operação", "0 recargas", "")].join("");
    const ruleRows = (kind, arr, keep = () => true) => arr.map((r, i) => !keep(r) ? "" : `<tr data-focus="rule:${esc(r.id || r.label)}" data-focus-alt="rule:${esc(r.label)}">
        <td><input type="checkbox" data-rule="${kind}|${i}|enabled" ${r.enabled ? "checked" : ""}></td>
        <td><input class="select" data-rule="${kind}|${i}|label" value="${esc(r.label)}" style="width:100%"></td>
        <td><select class="select" data-rule="${kind}|${i}|basis">${[["fixed", "Fixo mensal"], ["per_kwh", "Por kWh"], ["revenue_pct", "% do faturamento"], ["per_charge", "Por recarga"], ["one_off", "Avulso no mês"]].map(([v, l]) => `<option value="${v}" ${r.basis === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
        <td><input class="select" type="number" step="0.01" min="0" data-rule="${kind}|${i}|value" value="${esc(r.value)}" style="width:110px"></td>
        ${kind === "revenue" ? `<td><select class="select" data-rule="${kind}|${i}|scope"><option value="operational" ${r.scope !== "non_operational" ? "selected" : ""}>Operacional</option><option value="non_operational" ${r.scope === "non_operational" ? "selected" : ""}>Não operacional (marketing)</option></select></td>` : ""}
        <td><small>${esc(r.previous || "—")}</small></td>
        <td>${r.custom ? `<button class="btn ghost" data-rule-del="${kind}|${i}" type="button">✕</button>` : ""}</td></tr>`).join("");
    const visible = f.rows.filter(r => modelVisible(r, model, transfer) && r.controls.length && !CENTRAL_KEYS.includes(r.key));
    const rowHtml = r => `
        <section class="section" style="margin:0" data-focus="${esc(r.key)}"><div class="section-head" style="margin-bottom:8px"><div><p class="kicker">${esc(r.group)}</p><h2 style="font-size:14px">${esc(r.name)}</h2><p>${esc(r.rule)}</p></div>
          <div class="meta">anterior<br><strong>${esc(r.previous || "—")}</strong></div></div>
          <div class="grid ${r.controls.length > 2 ? "g3" : "g2"}" style="gap:8px">${r.controls.filter(c => !c.leaseOnly || energyMode === "copel_lease").map(c => control(c, r)).join("")}</div>
          ${r.key === "energyCostPerKWh" ? `<p class="source-line">${esc(f.energySummary)}</p>` : ""}</section>`;
    const toolbar = `
      <div class="toolbar cc-bar">
        <select class="select" id="pmCharger" style="min-width:280px" aria-label="Carregador">${groups.map(([label, test]) => { const g = list.filter(test); return g.length ? `<optgroup label="${esc(label)}">${g.map(c => `<option value="${esc(c.key)}" ${c.key === ui.charger ? "selected" : ""}>${esc(c.station)} · ${esc(c.workName)}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>
        <select class="select" id="pmMonth" aria-label="Competência">${data.months.slice().reverse().map(m => `<option value="${m}" ${m === ui.month ? "selected" : ""}>Competência ${esc(UBY.state.api?.monthName?.(m) || m)}</option>`).join("")}</select>
        <span class="spacer"></span>
        ${dirty ? `<span class="badge warn">contrato ou custos não salvos</span>` : ""}
        <button class="btn" id="pmSimulate" type="button" ${dirty ? "" : "disabled"}>Simular</button>
        <button class="btn" id="pmDiscard" type="button" ${dirty ? "" : "disabled"}>Descartar</button>
        <button class="btn primary" id="pmSave" type="button" ${dirty && canWrite(w) && !busy ? "" : "disabled"}>Salvar competência</button>
      </div>`;
    const cards = dirty
      ? `<div class="grid g5" style="margin-bottom:10px">${f.summary.map((m, i) => kpi(m.label, esc(m.value), esc(m.sub || ""), "", i === 2 ? "lead" : "")).join("")}${kpi("Base desta competência", esc(f.versionSource || "—"), esc(f.versionHelp || ""))}</div>
         <div class="note" style="margin-bottom:12px">Simulação das alterações ainda não salvas (conta da tela original${hasInv ? ", sem as faturas de energia por leitura" : ""}). Depois de salvar, os cartões voltam a mostrar o resultado oficial.</div>`
      : `<div class="grid g5" style="margin-bottom:10px">${officialCards}${kpi("Base desta competência", esc(f.versionSource || "—"), esc(f.versionHelp || ""))}</div>
         ${off && !off.operating ? `<div class="note" style="margin-bottom:12px">Este carregador ainda não operava em ${esc(mName(ui.month))}${firstOp ? ` (primeira competência com recarga: ${esc(mName(firstOp))})` : ""}. Os parâmetros abaixo ficam guardados, mas esta competência não entra no resultado oficial, nos relatórios nem na distribuição.</div>` : ""}`;
    return {
      toolbar, cards, rules, ruleRows, hasInv, model,
      contract: `<div class="grid g2" style="gap:14px">${visible.filter(r => r.key !== "energyCostPerKWh").map(rowHtml).join("")}</div>
        ${["uby", "hybrid"].includes(model) ? `<div class="note" style="margin-top:12px">Fundo de reserva e cotistas não são configurados por carregador: valem uma vez só sobre o resultado consolidado da rede, em <a href="#/parametros/cotas">Cotas, impostos e rodadas</a>.</div>` : ""}`,
      energyRow: hasInv ? "" : visible.filter(r => r.key === "energyCostPerKWh").map(rowHtml).join("")
    };
  }

  // ---------- centro de custos do carregador (uma página só) ----------
  // Usuário (14/10/2026): "unifique principalmente a aba de lançamento de custos por carregador".
  // Tudo do carregador numa tela: resultado, contrato e splits, energia, repasse à área, custos e
  // contas, operação e documentos. Cada bloco grava com as mesmas funções de antes.
  const normSt = v => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^uby recharge\s*-\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const CC_SECTIONS = [["resultado", "Resultado"], ["contrato", "Contrato e splits"], ["energia", "Energia"], ["area", "Repasse à área"], ["custos", "Custos e contas"], ["operacao", "Operação"], ["docs", "Documentos"]];
  const NC_CATS = ["Internet / dados", "Locação / aluguel", "Seguro", "Manutenção", "Licença / plataforma", "Energia", "Outros custos"];
  // Tipo do custo pelo nome/categoria: liga a linha do resultado à conta mensal do mesmo item mesmo com valor diferente.
  const COST_KINDS = [/internet|dados|chip|camera|câmera/i, /alug|loca|vaga/i, /segur/i, /manut/i, /limpez|conserva/i, /monitor|telemetr/i, /licen|software/i];
  const costKindOf = txt => COST_KINDS.findIndex(re => re.test(String(txt || "")));
  const BASES = [["fixed", "Fixo mensal"], ["per_kwh", "Por kWh"], ["revenue_pct", "% do faturamento"], ["per_charge", "Por recarga"], ["one_off", "Avulso no mês"]];
  function selectCharger(key) {
    if (key === ui.charger) return;
    ui.charger = key; ui.edits = {}; ui.rules = null;
    ui.enDraft = null; ui.enForm = null; ui.enRead = null; ui.enPendingFile = null; ui.enFiles = {};
    ui.arForm = null; ui.arPay = ""; ui.arAdjust = ""; ui.opForm = null; ui.piRead = null; ui.piFile = null;
    ui.payEditing = ""; ui.payForm = null; ui.nc = null; ui.docForm = null; ui.docCopel = null; ui.docFile = null;
  }
  // O carregador num alvo de custo da matriz / conta mensal (scope "obra::estação").
  function targetHits(w, c, list) {
    const sameWork = list.filter(x => x.workId === c.workId).length;
    let mine = "";
    try { mine = w.normalizeStationForCompare(w.canonicalStationNameForWork(c.workId, c.station, c.workName)); } catch (_) {}
    return t => {
      const [tw, ts] = String(t.scope || "").split("::");
      if (String(t.workId || tw || "") !== c.workId) return false;
      if (sameWork <= 1) return true;
      return !ts || ts === mine || normSt(t.station) === normSt(c.station);
    };
  }
  function payTargetFor(w, c) {
    w.renderScheduledPayments(w.getGeneralUnitData());
    const opts = [...(w.document.getElementById("scheduledPaymentTarget")?.options || [])].filter(o => o.value);
    const same = opts.filter(o => o.value.split("::")[0] === c.workId);
    const hit = same.find(o => normSt(o.dataset.station) === normSt(c.station)) || (same.length === 1 ? same[0] : null);
    return { value: hit?.value || "", options: opts.map(o => ({ value: o.value, text: o.text })) };
  }
  function matrixScopeFor(w, c, mk) {
    const rows = w.matrizEligibleRows(w.getGeneralUnitData(), mk).filter(r => String(r.workId) === c.workId);
    const r = rows.find(x => normSt(x.station || x.workName) === normSt(c.station)) || (rows.length === 1 ? rows[0] : null);
    return r ? w.matrizScopeKey(r) : "";
  }
  // Custos do carregador numa lista: regra do resultado + conta mensal do mesmo item ficam na mesma linha.
  function chargerCostItems(w, data, c, p) {
    const mk = ui.month;
    const hit = targetHits(w, c, data.chargers);
    const all = w.loadMatrizCosts();
    const sched = all.filter(i => i.scheduledPayment && i.enabled !== false && (i.targets || []).some(hit) && (w.scheduledPaymentApplies(i, mk) || (i.startMonth && i.startMonth > mk)));
    const matrix = all.filter(i => !i.scheduledPayment && i.enabled && (i.targets || []).some(hit) && w.matrizApplies(i, mk));
    const used = new Set();
    // Primeiro as contas que valem no mês; as que começam depois só se nada do mês servir.
    const cands = [...sched].sort((a, b) => Number(w.scheduledPaymentApplies(b, mk)) - Number(w.scheduledPaymentApplies(a, mk)));
    const free = i => !used.has(i.id);
    const rules = p.rules.cost.map((r, idx) => ({ r, idx, pair: null }));
    const live = rules.filter(x => x.r.basis === "fixed" && Number(x.r.value) > 0 && x.r.enabled !== false);
    const tries = [
      (x, i) => Math.abs(Number(i.amount) - Number(x.r.value)) < 0.01,
      (x, i) => normSt(i.name) && normSt(i.name) === normSt(x.r.label),
      (x, i) => { const k = costKindOf(`${x.r.id} ${x.r.label}`); return k >= 0 && k === costKindOf(`${i.name} ${i.category}`); }
    ];
    tries.forEach(t => live.forEach(x => { if (x.pair) return; const hit = cands.find(i => free(i) && t(x, i)); if (hit) { x.pair = hit; used.add(hit.id); } }));
    return { mk, rules, cashOnly: sched.filter(i => !used.has(i.id)), matrix, sched };
  }
  function payStatus(w, i, mk) {
    try { if (!w.scheduledPaymentApplies(i, mk)) return `<span class="badge neutral">começa em ${esc(UBY.state.api?.monthName?.(i.startMonth) || i.startMonth)}</span>`; const st = w.scheduledPaymentStatus(i, mk); return `<span class="badge ${st.key === "paid" ? "ok" : st.key === "overdue" ? "bad" : st.key === "pending" ? "neutral" : "warn"}">${esc(st.label)}</span>`; } catch (_) { return ""; }
  }
  function costsSection(w, data, c, p) {
    const it = chargerCostItems(w, data, c, p);
    const can = canWrite(w) && !busy ? "" : "disabled";
    const mName = m => UBY.state.api?.monthName?.(m) || m;
    const payCell = i => `<a class="edit-link" href="#/parametros/contas" title="Ver em Contas a pagar">conta mensal · dia ${esc(i.dueDay)}</a> ${payStatus(w, i, it.mk)} <button class="btn ghost" data-pay-edit="${esc(i.id)}" type="button">Editar conta</button>`;
    const ruleTr = ({ r, idx, pair }) => `<tr data-focus="rule:${esc(r.id || r.label)}" data-focus-alt="rule:${esc(r.label)}">
        <td><input type="checkbox" data-rule="cost|${idx}|enabled" ${r.enabled ? "checked" : ""} title="Usar no resultado"></td>
        <td><input class="select" data-rule="cost|${idx}|label" value="${esc(r.label)}" style="width:100%"><small>${esc(r.previous ? `anterior: ${r.previous}` : "")}</small></td>
        <td><select class="select" data-rule="cost|${idx}|basis">${BASES.map(([v, l]) => `<option value="${v}" ${r.basis === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
        <td class="num"><input class="select" type="number" step="0.01" min="0" data-rule="cost|${idx}|value" value="${esc(r.value)}" style="width:110px"></td>
        <td><span class="badge ok">no resultado</span></td>
        <td style="white-space:normal">${pair ? payCell(pair) + (Math.abs(Number(pair.amount) - Number(r.value)) >= 0.01 ? `<br><small style="color:var(--uby-amber)">conta ${fmt.brl(pair.amount)} × resultado ${fmt.brl(r.value)}</small> <button class="btn ghost" data-cc-sync="${idx}|${esc(pair.amount)}" type="button" ${can}>Usar ${fmt.brl(pair.amount)} no resultado</button>` : "") : r.basis === "fixed" && Number(r.value) > 0 ? `<small style="color:var(--uby-amber)">sem conta a pagar</small> <button class="btn ghost" data-cc-mkpay="${idx}" type="button" ${can}>Criar conta mensal</button>` : `<small>não gera conta (custo calculado)</small>`}</td>
        <td>${r.custom ? `<button class="btn ghost" data-rule-del="cost|${idx}" type="button" title="Tirar do resultado">✕</button>` : ""}</td></tr>`;
    const cashTr = i => `<tr data-focus-alt="pay:${esc(i.id)}">
        <td></td><td><strong>${esc(i.name)}</strong><small>${esc([i.supplier, i.category].filter(Boolean).join(" · "))}</small></td>
        <td>Conta mensal</td><td class="num">${fmt.brl(i.amount)}</td>
        <td><span class="badge warn">fora do resultado</span> <button class="btn ghost" data-cc-toresult="${esc(i.id)}" type="button" ${can}>Incluir no resultado</button></td>
        <td style="white-space:normal">${payCell(i)}</td><td></td></tr>`;
    const matTr = i => { const n = (i.targets || []).length; const excl = n === 1; return `<tr>
        <td></td><td><strong>${esc(i.name)}</strong><small>${esc([i.supplier, i.category].filter(Boolean).join(" · "))}</small></td>
        <td>${excl ? "Exclusivo deste carregador" : `Rateado entre ${n || "todos os"} carregadores`}<small>${esc(w.matrizKindLabel(i.costKind))}${i.costKind === "installment" ? ` · ${i.installments} parcela(s) em ${w.matrizCoverageMonths(i)} mês(es)` : ""}</small></td>
        <td class="num">${fmt.brl(w.matrizCompetencyAmount(i))}${excl ? "" : "<small>total; a parte deste carregador sai no rateio</small>"}</td>
        <td><span class="badge ok">no resultado</span></td>
        <td style="white-space:normal"><small>contas geradas pelo custo · dia ${esc(i.dueDay)}</small> <a class="btn ghost link-btn" href="#/parametros/matriz/-/${encodeURIComponent(`cost:${i.id}`)}/${esc(it.mk)}">Editar</a></td><td></td></tr>`; };
    // Conta mensal em edição (aberta pela lista ou por um link de Contas a pagar).
    const editing = ui.payEditing ? it.sched.find(i => i.id === ui.payEditing) || w.loadMatrizCosts().find(i => i.id === ui.payEditing && i.scheduledPayment) : null;
    let editBox = "";
    if (editing) {
      const tgt = payTargetFor(w, c);
      if (!ui.payForm) {
        const t0 = (editing.targets || [])[0] || {};
        const scope = tgt.options.some(t => t.value === t0.scope) ? t0.scope : (tgt.options.find(t => t.value.split("::")[0] === String(t0.workId || "")) || {}).value || tgt.value;
        ui.payForm = { target: scope, name: editing.name, supplier: editing.supplier || "", category: editing.category || "Outros custos", amount: editing.amount, dueDay: editing.dueDay, startMonth: editing.startMonth || "", endMonth: editing.endMonth || "" };
      }
      const pf = ui.payForm;
      const pinp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-pf="${k}" type="${type}" value="${esc(pf[k] ?? "")}" ${extra} style="width:100%">`);
      const paired = it.rules.find(x => x.pair && x.pair.id === editing.id);
      editBox = `<div class="note" data-focus="pay:${esc(editing.id)}" style="margin-top:12px;border-color:var(--uby-forest)"><strong>Editando a conta mensal: ${esc(editing.name)}</strong>
        <div class="grid g4" style="gap:8px;margin-top:8px">${pinp("name", "Conta")}${pinp("supplier", "Fornecedor")}
          ${field("Categoria", `<select class="select" data-pf="category">${NC_CATS.map(x => `<option ${pf.category === x ? "selected" : ""}>${x}</option>`).join("")}</select>`)}
          ${pinp("amount", "Valor mensal (R$)", "number", 'min="0" step="0.01"')}${pinp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}${pinp("startMonth", "Inicia em", "month")}${pinp("endMonth", "Termina em (opcional)", "month")}</div>
        <small>Vale para todos os meses desta conta.${paired ? ` Se mudar o valor, a linha "${esc(paired.r.label)}" do resultado é atualizada junto (a partir de ${esc(mName(it.mk))}).` : ""}</small>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="pmPayEditSave" type="button" ${can}>Salvar conta</button><button class="btn" id="pmPayEditCancel" type="button">Cancelar</button>
          <button class="btn ghost" data-pay-end="${esc(editing.id)}" data-month="${esc(it.mk)}" type="button" style="color:var(--uby-red)" ${can}>Encerrar a partir de ${esc(mName(it.mk))}</button></div></div>`;
    }
    // ＋ Novo custo: um formulário só; a plataforma escolhe onde gravar.
    const nc = ui.nc || (ui.nc = { kind: "monthly", name: "", supplier: "", category: "Internet / dados", amount: "", dueDay: 11, startMonth: it.mk, endMonth: "", basis: "fixed", costKind: "recurring", installments: 1, coverage: 12, payOnly: false });
    const ninp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-nc="${k}" type="${type}" value="${esc(nc[k] ?? "")}" ${extra} style="width:100%">`);
    const isUby = c.included && ["uby", "hybrid"].includes(c.model);
    const KINDS = [["monthly", "Conta mensal — entra no resultado e vira conta a pagar (internet, aluguel do ponto…)"], ["result", "Só no resultado — por kWh, % do faturamento, por recarga ou avulso no mês"], ...(isUby ? [["matrix", "Boleto próprio ou parcelado — seguro, equipamento, manutenção grande"]] : [])];
    const kindHelp = { monthly: "Cria a linha do resultado e a conta mensal com vencimento (Contas a pagar e conciliação), já ligadas.", result: "Entra só no resultado do carregador, sem gerar conta a pagar.", matrix: "Entra no resultado pelo período que cobre e gera cada parcela em Contas a pagar. Fica só neste carregador (não é rateado)." };
    const form = nc.kind === "monthly" ? `${ninp("name", "Nome (ex.: Internet do ponto)")}${ninp("supplier", "Fornecedor")}
        ${field("Categoria", `<select class="select" data-nc="category">${NC_CATS.map(x => `<option ${nc.category === x ? "selected" : ""}>${x}</option>`).join("")}</select>`)}
        ${ninp("amount", "Valor mensal (R$)", "number", 'min="0" step="0.01"')}${ninp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}${ninp("startMonth", "Começa em", "month")}${ninp("endMonth", "Termina em (opcional)", "month")}`
      : nc.kind === "result" ? `${ninp("name", "Nome do custo")}
        ${field("Como calcula", `<select class="select" data-nc="basis">${BASES.map(([v, l]) => `<option value="${v}" ${nc.basis === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${ninp("amount", nc.basis === "revenue_pct" ? "Percentual (%)" : nc.basis === "per_kwh" ? "R$ por kWh" : nc.basis === "per_charge" ? "R$ por recarga" : "Valor (R$)", "number", 'min="0" step="0.0001"')}`
      : `${ninp("name", "Nome do custo")}${ninp("supplier", "Fornecedor")}
        ${field("Categoria", `<select class="select" data-nc="category">${["Seguro", "Manutencao preventiva", "Manutencao corretiva", "Locacao / aluguel", "Licenca / plataforma", "Outros custos"].map(x => `<option ${nc.category === x ? "selected" : ""}>${x}</option>`).join("")}</select>`)}
        ${field("Tipo", `<select class="select" data-nc="costKind">${[["recurring", "Recorrente mensal"], ["installment", "Parcelado"], ["one_off", "Pontual"]].map(([v, l]) => `<option value="${v}" ${nc.costKind === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${ninp("amount", nc.costKind === "installment" ? "Valor da parcela (R$)" : "Valor (R$)", "number", 'min="0" step="0.01"')}
        ${nc.costKind === "installment" ? ninp("installments", "Parcelas (boletos)", "number", 'min="1" step="1"') + ninp("coverage", "Meses que o custo cobre", "number", 'min="1" step="1"') : ""}
        ${ninp("startMonth", "Primeira competência", "month")}${ninp("endMonth", "Fim (opcional)", "month")}${ninp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}
        ${nc.costKind === "installment" ? `<div class="note" id="ccNcCalc" style="margin:0;grid-column:1/-1">${installmentCalc({ amount: nc.amount, installments: nc.installments, coverage: nc.coverage, startMonth: nc.startMonth })}</div>` : ""}`;
    const hasVal = r => Number(r.value) > 0 || r.custom;
    const shownRules = it.rules.filter(x => hasVal(x.r) || ui.ccShowZero);
    const zeroCost = it.rules.length - it.rules.filter(x => hasVal(x.r)).length;
    const zeroRev = p.rules.revenue.filter(r => !hasVal(r)).length;
    const nTotal = shownRules.length + it.cashOnly.length + it.matrix.length;
    const zeroBtn = n => n ? `<button class="btn ghost" data-cc-zero type="button">${ui.ccShowZero ? "Esconder" : "Mostrar"} ${n} ite${n > 1 ? "ns" : "m"} padrão sem valor</button>` : "";
    return `
      <div class="table-wrap"><table><thead><tr><th title="Usar no resultado">Usar</th><th>Custo</th><th>Como entra</th><th class="num">Valor</th><th>Resultado</th><th>Conta a pagar</th><th></th></tr></thead>
        <tbody>${shownRules.map(ruleTr).join("")}${it.cashOnly.map(cashTr).join("")}${it.matrix.map(matTr).join("")}
          ${nTotal ? "" : `<tr><td colspan="7" class="empty">Nenhum custo lançado neste carregador.</td></tr>`}</tbody></table></div>
      ${zeroBtn(zeroCost)}
      <p class="source-line">Energia e repasse à área têm blocos próprios acima. Custos divididos entre todos (aluguel da sede, contador…) ficam em <a href="#/parametros/matriz">Custos centrais</a>. Mudanças nas linhas do resultado valem a partir de ${esc(mName(it.mk))} e gravam em "Salvar competência".</p>
      ${editBox}
      <details class="section" style="margin-top:12px" id="ccNewBox" data-focus="nc" ${ui.ncOpen ? "open" : ""}><summary style="cursor:pointer;font-weight:850;color:var(--uby-forest)">＋ Novo custo deste carregador</summary>
        ${field("Que tipo de custo é?", `<select class="select" data-nc="kind">${KINDS.map(([v, l]) => `<option value="${v}" ${nc.kind === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`)}
        <p class="source-line" style="margin:6px 0 8px">${nc.payOnly ? "A linha do resultado já existe: aqui só cria a conta mensal ligada a ela." : esc(kindHelp[nc.kind] || "")}</p>
        <div class="grid g4" style="gap:8px">${form}</div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="ccNewSave" type="button" ${can}>${nc.kind === "monthly" ? (nc.payOnly ? "Criar conta mensal" : "Lançar conta mensal") : "Lançar custo"}</button>${nc.payOnly ? `<button class="btn" id="ccNewReset" type="button">Cancelar</button>` : ""}</div>
      </details>
      <section class="section" style="margin-top:12px"><div class="section-head"><div><p class="kicker">Receitas extras</p><h2>Receitas além das recargas</h2><p>Ex.: marketing, mídia no ponto. Valem nesta competência.</p></div><button class="btn" data-rule-add="revenue" type="button">＋ Receita</button></div>
        <div class="table-wrap"><table><thead><tr><th>Usar</th><th>Item</th><th>Base</th><th>Valor</th><th>Classificação</th><th>Anterior</th><th></th></tr></thead><tbody>${p.ruleRows("revenue", p.rules.revenue, r => hasVal(r) || ui.ccShowZero) || `<tr><td colspan="7" class="empty">Nenhuma receita extra lançada.</td></tr>`}</tbody></table></div>
        ${zeroBtn(zeroRev)}
      </section>`;
  }
  function chargerPage(w, data) {
    const c = data.chargers.find(x => x.key === ui.charger);
    if (!c || !data.form) return `<div class="note">Nenhum carregador encontrado.</div>`;
    const p = chargerTab(w, data);
    const api = UBY.state.api;
    const head = (id, kicker, title, sub, extra = "") => `<div class="cc-head" id="cc-${id}" data-focus="sec:${id}"><div><p class="kicker">${kicker}</p><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${extra}</div>`;
    let area = null;
    try { area = c.included ? api.areaAccount(c.workId, c.station) : null; } catch (_) {}
    const reimburse = !!area?.config?.reimburseEnergy;
    const can = canWrite(w) && !busy ? "" : "disabled";
    const energy = (p.energyRow ? `<div class="grid g2" style="gap:14px;margin-bottom:14px">${p.energyRow}</div>` : "")
      + (reimburse ? `<div class="note" style="margin-bottom:12px">Este ponto usa a energia do local: o custo é o <strong>reembolso ao dono</strong> (kWh vendidos × tarifa do mês), pago junto do repasse à área. Quando tiver padrão próprio, desmarque o reembolso em Repasse à área e lance as faturas da Copel aqui.</div>${postoInvoiceBox(area, c.workId, c.station, can)}`
        : energyTab(w, data, true));
    return `${p.toolbar}
      <nav class="cc-jump" aria-label="Ir para">${CC_SECTIONS.map(([id, l]) => `<button type="button" data-jump="cc-${id}">${l}</button>`).join("")}</nav>
      ${head("resultado", "Resultado", `${esc(c.station)} · ${esc(UBY.state.api?.monthName?.(ui.month) || ui.month)}`, "", `<a class="btn ghost link-btn" href="#/financeiro/estacao/${encodeURIComponent(c.workId)}">DRE completo do carregador →</a>`)}
      ${p.cards}
      ${head("contrato", "Contrato", "Modelo, splits e investimento", "Gestão, plataforma, área, royalty e investimento desta competência. Grava em \"Salvar competência\".")}
      ${p.contract}
      ${head("energia", "Energia", reimburse ? "Reembolso de energia ao local" : "Faturas de energia", reimburse ? "" : "Copel + arrendamento, lidos do PDF da Copel ou lançados à mão.")}
      ${energy}
      ${head("area", "Área", "Repasse à área", "% do faturamento ao dono do local (e reembolso de energia, quando houver), com vencimento e baixa.")}
      ${c.included ? areaTab(w, data, true) : `<div class="note">Carregador fora da operação UBY: sem repasse à área por aqui.</div>`}
      ${head("custos", "Custos e contas", "Tudo que pesa neste carregador", "Uma linha por custo: se entra no resultado e se gera conta a pagar.", `<button class="btn primary" id="ccNewOpen" type="button">＋ Novo custo</button>`)}
      ${costsSection(w, data, c, p)}
      ${head("operacao", "Operação", "Horários, potência e cortesias", "Base da ocupação e do rateio por potência.")}
      ${operationTab(w, true)}
      ${head("docs", "Documentos", "NF, boletos, faturas e contratos", "Arquivos privados, só para quem está logado.")}
      ${docsTab(w, data, c)}`;
  }

  // Grava as regras de custo/receita do carregador numa competência (mesma gravação do "Salvar competência").
  async function saveChargerRules(w, c, month, mutate) {
    await resyncMatrix(w);
    const { months } = await openCharger(w, c.key, month);
    const form = readForm(w);
    const rules = { cost: form.cost.map(r => ({ ...r })), revenue: form.revenue.map(r => ({ ...r })) };
    mutate(rules);
    ui.edits = {}; ui.rules = rules;
    applyToEngine(w);
    w.scheduleFinancialSettingsSave();
    await w.commitPendingFinancialSettingsSave();
    ui.edits = {}; ui.rules = null;
    checkPending(w);
    return months.includes(month) ? month : "";
  }
  const newRule = (label, basis, value) => ({ id: `custom-cost-${Date.now()}`, label, enabled: true, basis, value: Number(value), scope: "operational", custom: true });
  async function addScheduled(w, p, fallbackMonth) {
    await resyncMatrix(w);
    w.renderScheduledPayments(w.getGeneralUnitData());
    const set = (id, v) => { const el = w.document.getElementById(id); if (el) el.value = v ?? ""; };
    set("scheduledPaymentTarget", p.target); set("scheduledPaymentName", p.name); set("scheduledPaymentSupplier", p.supplier); set("scheduledPaymentCategory", p.category);
    set("scheduledPaymentAmount", p.amount); set("scheduledPaymentDueDay", p.dueDay || 11); set("scheduledPaymentStartMonth", p.startMonth || fallbackMonth); set("scheduledPaymentEndMonth", p.endMonth);
    w.addScheduledPayment();
    return await awaitMatrixSave(w);
  }
  async function saveMatrixCost(w, f, mk, editingId) {
    await resyncMatrix(w);
    const monthSel = w.document.getElementById("financeMonthSelector");
    if (monthSel && [...monthSel.options].some(o => o.value === mk)) monthSel.value = mk;
    w.renderMatrizCosts(w.getGeneralUnitData());
    if (editingId) w.editMatrizCost(editingId); else w.resetMatrizCostForm();
    const set = (id, v) => { const el = w.document.getElementById(id); if (el) el.value = v ?? ""; };
    set("matrizNewName", f.name); set("matrizNewValue", f.amount); set("matrizCostCategory", f.category); set("matrizCostSupplier", f.supplier);
    set("matrizCostKind", f.kind); set("matrizCostInstallments", f.kind === "installment" ? f.installments || 1 : 1);
    // Sem isto o parcelado ficava com cobertura 1: todas as parcelas caíam no resultado do primeiro mês.
    // A tela original desta página não tem o campo; o motor lê pelo id, então ele é criado oculto.
    if (!w.document.getElementById("matrizCostCoverageMonths")) {
      const hidden = w.document.createElement("input");
      hidden.type = "hidden"; hidden.id = "matrizCostCoverageMonths";
      w.document.body.appendChild(hidden);
    }
    set("matrizCostCoverageMonths", f.kind === "installment" ? Math.max(1, Math.round(Number(f.coverage) || Number(f.installments) || 1)) : 1); set("matrizCostStartMonth", f.startMonth || new Date().toISOString().slice(0, 7)); set("matrizCostEndMonth", f.endMonth);
    set("matrizCostDueDay", f.dueDay || 1); set("matrizCostMethod", f.method); set("matrizCostCustomShares", f.shares); set("matrizCostDocument", f.documentRef); set("matrizCostNotes", f.notes);
    const tsel = w.document.getElementById("matrizCostTargets");
    if (tsel) [...tsel.options].forEach(o => { o.selected = f.targets.includes(o.value); });
    w.addMatrizCost();
    return await awaitMatrixSave(w);
  }

  // ---------- checklist do fechamento ----------
  // Uma tela só com o que falta no mês; cada item leva direto para onde se resolve.
  function checklistTab(extra = [], embedded = false) {
    const api = UBY.state.api;
    const months = (UBY.state.months || []).slice();
    const mk = months.includes(ui.ckMonth) ? ui.ckMonth : months.at(-1) || "";
    ui.ckMonth = mk;
    if (!mk || !api) return `<div class="note">Sem competências carregadas ainda. Abra esta aba de novo em alguns segundos.</div>`;
    const mName = m => api.monthName?.(m) || m;
    const enc = encodeURIComponent;
    const [yy, mm] = mk.split("-").map(Number);
    const nextMk = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
    const items = [];
    const add = (cat, status, title, detail, href, action) => items.push({ cat, status, title, detail, href, action });
    const safe = fn => { try { fn(); } catch (err) { add("Erro", "bad", "Não consegui conferir uma parte", err.message, "", ""); } };

    // 1. Recargas importadas até o fim do mês
    safe(() => {
      const endDay = new Date(yy, mm, 0);
      UBY.data("networkConfig").filter(r => UBY.isUbyModel(r.model) && r.included).forEach(r => {
        const last = r.lastDate ? new Date(r.lastDate) : null;
        if (last && last >= endDay) return;
        add("Recargas", "warn", `${r.station}: recargas importadas só até ${last ? fmt.date(last) : "—"}`, `Para fechar ${mName(mk)}, a planilha precisa ir até ${fmt.date(endDay)} (se o ponto não teve recarga nos últimos dias, pode ignorar).`,
          `#/importar/${enc(r.workId)}/${mk}`, "Importar planilha");
      });
    });
    // 2. Energia e custos por carregador
    safe(() => {
      UBY.data("financeStations").filter(s => UBY.isUbyModel(s.model) && s.model !== "third_party_management").forEach(s => {
        const sf = UBY.data("stationFinance", s.workId, s.station, mk);
        if (!sf || sf.monthKey !== mk || !sf.finance || !(sf.finance.energy > 0)) return;
        const f = sf.finance, ec = sf.energyComposition || {}, key = enc(`${s.workId}|${s.station}`);
        if (ec.estimatedCost > 0) add("Energia", "warn", `${s.station}: energia com estimativa de ${fmt.brl(ec.estimatedCost)}`, `Consumo de ${fmtDay(ec.estimatedFrom)} a ${fmtDay(ec.estimatedTo)} ainda sem fatura lançada. Acerta quando a fatura entrar.`,
          `#/parametros/energia/${key}/${enc("inv:new")}`, "Lançar fatura");
        else if (!(f.energyCost > 0) && !UBY.data("areaAccount", s.workId, s.station)?.config?.energyByHost) add("Energia", "bad", `${s.station}: energia sem custo`, `${fmt.kwh(f.energy)} vendidos e custo de energia R$ 0,00 — a margem fica inflada.`,
          `#/parametros/carregador/${key}/energyCostPerKWh/${mk}`, "Cadastrar energia");
        if (!(f.platform > 0)) add("Custos do carregador", "warn", `${s.station}: App / plataforma zerado`, "Nenhum percentual de plataforma nesta competência. Se o ponto paga app, cadastre.",
          `#/parametros/carregador/${key}/platformPct/${mk}`, "Conferir");
        if (!(f.management > 0)) add("Custos do carregador", "warn", `${s.station}: gestão P3 zerada`, "Nenhum percentual de gestão nesta competência.",
          `#/parametros/carregador/${key}/managementPct/${mk}`, "Conferir");
      });
    });
    // 3. Impostos
    safe(() => {
      const d = UBY.data("finance", mk).dre;
      if (!(d.taxesTotal > 0)) add("Impostos", "bad", "Impostos do mês não lançados", `Faturamento de ${fmt.brl(d.networkRevenue)} e imposto R$ 0,00: o pool dos cotistas sai maior do que deveria.`, "#/parametros/cotas", "Lançar impostos");
    });
    // 4. Custos da matriz sem destino
    safe(() => {
      const s = UBY.data("matrix", mk).summary;
      if (s.pending > 0.009) add("Custos da matriz", "warn", `${fmt.brl(s.pending)} de custos da matriz sem destino`, "Esse valor não está rateado para nenhum carregador.", `#/parametros/matriz/-//${mk}`, "Ajustar rateio");
    });
    // 5. Pagamentos: vencidos sem baixa e possíveis duplicidades (mês do fechamento e o seguinte)
    safe(() => {
      const bills = api.allBills();
      const overdue = bills.filter(b => !b.paid && b.status === "overdue").sort((a, b) => String(a.due).localeCompare(String(b.due)));
      if (overdue.length) add("Pagamentos", "bad", `${overdue.length} conta(s) vencida(s) sem baixa`, overdue.slice(0, 4).map(b => `${fmtDay(b.due)} · ${b.name} · ${fmt.brl(b.amount)}`).join(" · ") + (overdue.length > 4 ? " …" : ""),
        `#/parametros/pagamentos/-//${overdue[0].monthKey}`, "Dar baixa");
      const norm = v => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^uby recharge\s*-\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
      [mk, nextMk].forEach(m => {
        const rows = bills.filter(b => b.monthKey === m);
        const pairs = rows.filter((b, i) => rows.some((o, j) => j > i && Math.abs(o.amount - b.amount) < 0.01 && norm(o.station) === norm(b.station)));
        if (pairs.length) add("Pagamentos", "warn", `${pairs.length} possível(is) conta(s) em duplicidade em ${mName(m)}`, pairs.map(b => `${b.name} · ${fmt.brl(b.amount)}`).join(" · "), `#/parametros/pagamentos/-//${m}`, "Revisar");
      });
    });
    // 6. Fechamento dos cotistas
    safe(() => {
      const m = (UBY.data("investorDistribution").months || []).find(x => x.key === mk);
      if (m && !/aprovado|pago|paid/i.test(m.status || "")) add("Fechamento", "warn", `Fechamento de ${mName(mk)} ainda não aprovado`, `Pool dos cotistas ${fmt.brl(m.investorPool)} (${fmt.brl(m.perQuota)} por cota, ${m.eligibleQuotas} cotas). Aprove depois de resolver o resto da lista.`, "#/parametros/fechamentos", "Aprovar");
    });

    extra.forEach(i => add(i.cat, i.status, i.title, i.detail, i.href, i.action));
    const cats = ["Recargas", "Energia", "Custos do carregador", "Impostos", "Custos da matriz", "Pagamentos", "Recebidos", "Fechamento"];
    cats.filter(c => !items.some(i => i.cat === c)).forEach(c => add(c, "ok", `${c}: tudo certo`, "", "", ""));
    const order = { bad: 0, warn: 1, ok: 2 };
    items.sort((a, b) => order[a.status] - order[b.status] || cats.indexOf(a.cat) - cats.indexOf(b.cat));
    const open = items.filter(i => i.status !== "ok");
    const badge = { bad: ["bad", "resolver"], warn: ["warn", "conferir"], ok: ["ok", "ok"] };
    if (embedded) return { open: open.length, bad: items.filter(i => i.status === "bad").length, html: `
        <div class="table-wrap"><table><thead><tr><th>Situação</th><th>Item</th><th></th></tr></thead><tbody>
          ${items.map(i => `<tr><td><span class="badge ${badge[i.status][0]}">${badge[i.status][1]}</span><small>${esc(i.cat)}</small></td>
            <td style="white-space:normal"><strong>${esc(i.title)}</strong>${i.detail ? `<small>${esc(i.detail)}</small>` : ""}</td>
            <td style="white-space:nowrap">${!i.href ? "" : i.href.startsWith("#fc-") ? `<button class="btn" type="button" data-jump="${esc(i.href.slice(1))}">${esc(i.action)} ↓</button>` : `<a class="btn ${i.status === "bad" ? "primary" : ""} link-btn" href="${i.href}">${esc(i.action)} →</a>`}</td></tr>`).join("")}
        </tbody></table></div>` };
    return `
      <div class="toolbar"><label>Competência <select class="select" id="pmCkMonth">${months.slice().reverse().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${esc(mName(m))}</option>`).join("")}</select></label>
        <span class="spacer"></span><small>Recarregue a lista depois de resolver cada item</small></div>
      <div class="grid g3" style="margin-bottom:14px">${kpi("Pendências", fmt.int(open.length), open.length ? "clique em cada uma para resolver" : "pronto para aprovar", "", open.length ? "lead" : "lead")}${kpi("Para resolver", fmt.int(items.filter(i => i.status === "bad").length), "afetam o resultado ou o caixa", "", items.some(i => i.status === "bad") ? "bad" : "")}${kpi("Para conferir", fmt.int(items.filter(i => i.status === "warn").length), "podem estar certos, mas vale olhar")}</div>
      <section class="section"><div class="section-head"><div><p class="kicker">Fechamento de ${esc(mName(mk))}</p><h2>O que falta no mês</h2><p>Recargas, energia, custos, impostos, pagamentos e aprovação, numa lista só.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Situação</th><th>Item</th><th></th></tr></thead><tbody>
          ${items.map(i => `<tr><td><span class="badge ${badge[i.status][0]}">${badge[i.status][1]}</span><small>${esc(i.cat)}</small></td>
            <td style="white-space:normal"><strong>${esc(i.title)}</strong>${i.detail ? `<small>${esc(i.detail)}</small>` : ""}</td>
            <td style="white-space:nowrap">${i.href ? `<a class="btn ${i.status === "bad" ? "primary" : ""} link-btn" href="${i.href}">${esc(i.action)} →</a>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
      </section>`;
  }

  // Parcelado: o caixa paga as parcelas; o resultado reparte o total pelos meses que o custo cobre.
  function installmentCalc(f) {
    const amount = Number(f.amount) || 0, n = Math.max(1, Math.round(Number(f.installments) || 1)), cov = Math.max(1, Math.round(Number(f.coverage) || n));
    const total = amount * n;
    const addM = (m, k) => { if (!/^\d{4}-\d{2}$/.test(m || "")) return ""; const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
    const name = m => UBY.state.api?.monthName?.(m) || m;
    const s = f.startMonth;
    return `<strong>Total ${fmt.brl(total)}</strong> (${n} × ${fmt.brl(amount)})<br>
      Caixa: ${n} boleto(s) de ${fmt.brl(amount)}${s ? `, de ${esc(name(s))} a ${esc(name(addM(s, n - 1)))}` : ""}<br>
      Resultado: <strong>${fmt.brl(total / cov)} por mês</strong> durante ${cov} mês(es)${s ? `, de ${esc(name(s))} a ${esc(name(addM(s, cov - 1)))}` : ""}, rateado entre os destinos`;
  }

  function matrixTab(w, data) {
    const mk = ui.matrixMonth || data.months.at(-1) || "";
    const costs = w.loadMatrizCosts().filter(i => !i.scheduledPayment);
    const eligibleRows = w.matrizEligibleRows(w.getGeneralUnitData(), mk);
    const eligible = eligibleRows.map(r => ({ scope: w.matrizScopeKey(r), row: r, label: `${r.station || r.workName} · ${r.workName}` }));
    const editing = costs.find(c => c.id === ui.editingCost) || null;
    if (!ui.costForm) {
      ui.costForm = editing ? {
        name: editing.name, amount: editing.amount, category: editing.category, supplier: editing.supplier, kind: editing.costKind, installments: editing.installments,
        coverage: w.matrizCoverageMonths(editing), startMonth: editing.startMonth, endMonth: editing.endMonth, dueDay: editing.dueDay, method: editing.allocation, shares: (editing.targets || []).map(t => t.share || 0).join(", "),
        documentRef: editing.documentRef, notes: editing.notes,
        targets: eligible.filter(e => (editing.targets || []).some(t => { try { return w.matrizRowsMatch(w.matrizResolveTargetRow(t, eligibleRows), e.row); } catch (_) { return false; } })).map(e => e.scope)
      } : { name: "", amount: "", category: "Outros custos", supplier: "", kind: "recurring", installments: 1, coverage: 12, startMonth: new Date().toISOString().slice(0, 7), endMonth: "", dueDay: 1, method: "equal", shares: "", documentRef: "", notes: "", targets: [] };
    }
    const form = ui.costForm;
    const cats = ["Seguro", "Locacao / aluguel", "Internet / dados", "Manutencao preventiva", "Manutencao corretiva", "Licenca / plataforma", "Tributos corporativos / centralizados", "Marketing", "Administrativo", "Outros custos"];
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-cf="${k}" type="${type}" value="${esc(form[k] ?? "")}" ${extra} style="width:100%">`);
    const sel = (k, label, opts) => field(label, `<select class="select" data-cf="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(form[k]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`);
    return `
      <div class="toolbar"><label>Competência <select class="select" id="pmMatrixMonth">${data.months.slice().reverse().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${esc(UBY.state.api?.monthName?.(m) || m)}</option>`).join("")}</select></label>
        <span class="spacer"></span><small>${costs.length} custo(s) cadastrados · rateio só entre ativos UBY</small></div>
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Matriz UBY</p><h2>Custos centrais</h2></div></div>
          <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>Custo</th><th>Tipo</th><th class="num">Valor</th><th class="num">Nesta competência</th><th>Rateio</th><th></th></tr></thead>
            <tbody>${costs.map(c => { const on = w.matrizApplies(c, mk); return `<tr class="${c.enabled ? "" : "muted"}"><td><strong>${esc(c.name)}</strong><small>${esc(c.category)}${c.supplier ? ` · ${esc(c.supplier)}` : ""}${c.enabled ? "" : " · desativado"}</small></td>
              <td>${esc(w.matrizKindLabel(c.costKind))}${c.costKind === "installment" ? `<small>${c.installments} parcela(s) · resultado em ${w.matrizCoverageMonths(c)} mês(es)</small>` : ""}<small>${esc(c.startMonth || "")}${c.endMonth ? ` até ${esc(c.endMonth)}` : ""} · dia ${c.dueDay}</small></td>
              <td class="num">${fmt.brl(c.amount)}</td><td class="num">${on ? fmt.brl(w.matrizCompetencyAmount(c)) : "—"}</td><td>${esc(w.matrizMethodLabel(c.allocation))}<small>${(c.targets || []).length} destino(s)</small></td>
              <td style="white-space:nowrap"><button class="btn ghost" data-cost-edit="${esc(c.id)}" type="button">Editar</button>${c.enabled ? `<button class="btn ghost" data-cost-off="${esc(c.id)}" type="button" ${canWrite(w) && !busy ? "" : "disabled"}>Desativar</button>` : ""}<button class="btn ghost" data-cost-del="${esc(c.id)}" type="button" style="color:var(--uby-red)" ${canWrite(w) && !busy ? "" : "disabled"}>Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">Nenhum custo cadastrado.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">${editing ? "Editando" : "Novo custo"}</p><h2>${editing ? esc(editing.name) : "Adicionar custo da matriz"}</h2><p>${editing ? "Destinos novos passam a valer da competência escolhida em diante." : "O rateio fica gravado por competência e destino."}</p></div></div>
          <div class="grid g2" style="gap:8px">
            ${inp("name", "Nome do custo")}${inp("amount", "Valor por parcela ou competência (R$)", "number", 'step="0.01" min="0"')}
            ${sel("category", "Categoria", cats.map(c => [c, c]))}${inp("supplier", "Fornecedor")}
            ${sel("kind", "Tipo", [["recurring", "Recorrente mensal"], ["installment", "Parcelado"], ["one_off", "Pontual"]])}${form.kind === "installment" ? inp("installments", "Parcelas (boletos)", "number", 'min="1" step="1"') : "<span></span>"}
            ${form.kind === "installment" ? `${inp("coverage", "Meses que o custo cobre (resultado)", "number", 'min="1" step="1"')}<div class="note" id="pmCostCalc" style="margin:0">${installmentCalc(form)}</div>` : ""}
            ${inp("startMonth", "Início (primeira competência)", "month")}${inp("endMonth", "Fim (opcional)", "month")}
            ${form.startMonth && form.startMonth < new Date().toISOString().slice(0, 7) ? `<div class="note" style="grid-column:1/-1;border-color:var(--uby-amber)">Início em ${esc(UBY.state.api?.monthName?.(form.startMonth) || form.startMonth)}: este custo também entra nas competências passadas a partir desse mês e muda o resultado já apurado. Se ele só começou agora, use o mês atual.</div>` : ""}
            ${inp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}${sel("method", "Rateio", [["equal", "Rateio igual"], ["power", "Por potência instalada"], ["energy", "Por kWh vendido"], ["revenue", "Por faturamento"], ["custom", "Participação definida"]])}
            ${form.method === "custom" ? inp("shares", "Participações (na ordem dos destinos, ex.: 60, 40)") : ""}${inp("documentRef", "Documento / NF")}
          </div>
          ${inp("notes", "Observações")}
          <p style="margin:10px 0 4px;font-size:11px;font-weight:800">Destinos (vazio = todos os ativos UBY)</p>
          <div class="list" style="max-height:180px;overflow:auto">${eligible.map(e => `<label class="list-row" style="justify-content:flex-start;gap:8px"><input type="checkbox" data-cf-target="${esc(e.scope)}" ${form.targets.includes(e.scope) ? "checked" : ""}>${esc(e.label)}</label>`).join("") || `<div class="note">Nenhum ativo UBY elegível nesta competência.</div>`}</div>
          <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="pmCostSave" type="button" ${canWrite(w) && !busy ? "" : "disabled"}>${editing ? "Salvar alteração" : "Adicionar custo"}</button>${editing ? `<button class="btn" id="pmCostCancel" type="button">Cancelar edição</button>` : ""}</div>
        </section>
      </div>`;
  }

  function paymentsTab(w) {
    const mk = ui.payMonth;
    const items = w.loadMatrizCosts().filter(i => w.scheduledPaymentApplies(i, mk)).sort((a, b) => w.scheduledPaymentDueDate(a, mk) - w.scheduledPaymentDueDate(b, mk));
    const rows = items.map(i => {
      const st = w.scheduledPaymentStatus(i, mk), tg = w.scheduledPaymentTarget(i);
      const amount = i.scheduledPayment ? Number(i.amount || 0) : w.matrizCashAmount(i, mk);
      return { id: i.id, sched: !!i.scheduledPayment, name: i.name, category: i.category, supplier: i.supplier, source: i.scheduledPayment ? "" : "Custo da matriz", target: tg, due: w.scheduledPaymentDueDate(i, mk), dueDay: i.dueDay, amount, st };
    });
    const tot = rows.reduce((a, r) => { a.total += r.amount; if (r.st.key === "paid") a.paid += r.amount; else a.open += r.amount; if (r.st.key === "overdue") a.late += r.amount; return a; }, { total: 0, paid: 0, open: 0, late: 0 });
    w.renderScheduledPayments(w.getGeneralUnitData());
    const targets = [...(w.document.getElementById("scheduledPaymentTarget")?.options || [])].filter(o => o.value).map(o => ({ value: o.value, text: o.text }));
    const editing = ui.payEditing ? w.loadMatrizCosts().find(c => c.id === ui.payEditing && c.scheduledPayment) || null : null;
    if (ui.payEditing && !editing) ui.payEditing = "";
    if (editing && !ui.payForm) {
      const t0 = (editing.targets || [])[0] || {};
      const scope = targets.some(t => t.value === t0.scope) ? t0.scope : (targets.find(t => t.value.split("::")[0] === String(t0.workId || "")) || {}).value || "";
      ui.payForm = { target: scope, name: editing.name, supplier: editing.supplier || "", category: editing.category || "Outros custos", amount: editing.amount, dueDay: editing.dueDay, startMonth: editing.startMonth || "", endMonth: editing.endMonth || "" };
    }
    const pf = ui.payForm || (ui.payForm = { target: "", name: "", supplier: "", category: "Internet / dados", amount: "", dueDay: 11, startMonth: mk, endMonth: "" });
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-pf="${k}" type="${type}" value="${esc(pf[k] ?? "")}" ${extra} style="width:100%">`);
    const can = canWrite(w) && !busy ? "" : "disabled";
    return `
      <div class="toolbar"><label>Competência <input class="select" id="pmPayMonth" type="month" value="${esc(mk)}"></label></div>
      <div class="grid g4" style="margin-bottom:14px">${kpi("Programado no mês", fmt.brl(tot.total), `${rows.length} compromisso(s)`, "", "lead")}${kpi("Em aberto", fmt.brl(tot.open), "aguardando pagamento")}${kpi("Vencido", fmt.brl(tot.late), "exige tratamento", "", tot.late ? "bad" : "")}${kpi("Pago", fmt.brl(tot.paid), "nesta competência")}</div>
      <section class="section"><div class="section-head"><div><p class="kicker">Calendário de caixa</p><h2>Pagamentos da competência</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Pagamento</th><th>Carregador / obra</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${rows.map(r => `<tr><td><strong>${esc(r.name)}</strong><small>${r.source ? `${esc(r.source)} · ` : ""}${esc(r.category)}${r.supplier ? ` · ${esc(r.supplier)}` : ""}</small></td>
            <td>${r.target.workId && r.target.targetCount <= 1 ? UBY.stationLink(r.target.workId, r.target.station || r.target.workName || "Carregador") : esc(r.target.station || "Carregador não identificado")}<small>${esc(r.target.workName || (r.target.targetCount > 1 ? `rateado para ${r.target.targetCount} carregadores` : ""))}</small></td>
            <td>${r.due.toLocaleDateString("pt-BR")}<small>todo dia ${r.dueDay}</small></td><td class="num">${fmt.brl(r.amount)}</td>
            <td><span class="badge ${r.st.key === "paid" ? "ok" : r.st.key === "overdue" ? "bad" : r.st.key === "pending" ? "neutral" : "warn"}">${esc(r.st.label)}</span></td>
            <td style="white-space:nowrap">${r.st.key === "paid" ? `<button class="btn ghost" data-pay="${esc(r.id)}|pending" type="button" ${can}>Reabrir</button>` : `<button class="btn" data-pay="${esc(r.id)}|paid" type="button" ${can}>Marcar pago</button>`}
              ${r.sched ? `<button class="btn ghost" data-pay-edit="${esc(r.id)}" type="button">Editar</button>` : `<a class="btn ghost link-btn" href="#/parametros/matriz/-/${encodeURIComponent(`cost:${r.id}`)}/${esc(mk)}">Editar</a>`}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum pagamento programado nesta competência.</td></tr>`}</tbody></table></div>
      </section>
      <section class="section" data-focus="${editing ? `pay:${esc(editing.id)}` : "pay:new"}"><div class="section-head"><div><p class="kicker">${editing ? "Editando" : "Novo compromisso"}</p><h2>${editing ? esc(editing.name) : "Adicionar pagamento recorrente de um carregador"}</h2><p>${editing ? "A alteração vale para todos os meses deste pagamento, inclusive os já lançados. Para parar de cobrar, use \"Remover daqui em diante\": os meses anteriores e o que já foi pago continuam no histórico." : "Entra no calendário de caixa; não altera o DRE sem lançamento financeiro."}</p></div></div>
        <div class="grid g4" style="gap:8px">
          ${field("Carregador", `<select class="select" data-pf="target"><option value="">Selecione</option>${targets.map(t => `<option value="${esc(t.value)}" ${pf.target === t.value ? "selected" : ""}>${esc(t.text)}</option>`).join("")}</select>`)}
          ${inp("name", "Pagamento")}${inp("supplier", "Fornecedor")}
          ${field("Categoria", `<select class="select" data-pf="category">${["Internet / dados", "Energia", "Locação / aluguel", "Seguro", "Manutenção", "Licença / plataforma", "Outros custos"].map(c => `<option ${pf.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
          ${inp("amount", "Valor mensal (R$)", "number", 'min="0" step="0.01"')}${inp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}${inp("startMonth", "Inicia em", "month")}${inp("endMonth", "Termina em (opcional)", "month")}
        </div>
        ${editing ? `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="pmPayEditSave" type="button" ${can}>Salvar alteração</button><button class="btn" id="pmPayEditCancel" type="button">Cancelar</button><button class="btn ghost" data-pay-end="${esc(editing.id)}" type="button" style="color:var(--uby-red)" ${can}>Remover daqui em diante (a partir de ${esc(UBY.state.api?.monthName?.(mk) || mk)})</button></div>`
          : `<button class="btn primary" id="pmPayAdd" type="button" style="margin-top:12px" ${can}>Adicionar pagamento programado</button>`}
      </section>`;
  }

  // ---------- pagamentos (central) + extrato bancário ----------
  // Tudo que vence no mês numa lista só (matriz, programados, energia, repasses), com baixa na
  // própria linha, e a conferência com o extrato do banco (app/bank.js; dados em "bank-uby").
  const REC = {
    "conferido": ["ok", "Conferido no extrato"], "pago-nao-marcado": ["warn", "No banco, não marcado"], "diferenca": ["bad", "Valor diferente no extrato"],
    "sem-extrato": ["bad", "Pago, não achado no extrato"], "aberto": ["neutral", "Não achado no extrato"]
  };
  function bankState(data) {
    const B = window.UBY_BANK;
    const p = data.bank || { transactions: [], statements: [], links: {} };
    const tx = p.transactions || [];
    const from = (p.statements || []).map(s => s.from).filter(Boolean).sort()[0] || "";
    const to = (p.statements || []).map(s => s.to).filter(Boolean).sort().at(-1) || "";
    const bills = data.bills || [];
    const rec = B && tx.length ? B.reconcile(tx, bills, p.links || {}, p.rules || {}) : { bills: [], outflows: [], unmatched: [] };
    const byKey = new Map(rec.bills.map(b => [b.key, b]));
    // Só vale "não achado" para contas cujo vencimento/pagamento cai dentro do período dos extratos.
    const covered = b => from && to && (b.paidAt || b.due) >= from && (b.paidAt || b.due) <= to;
    return { p, tx, from, to, rec, byKey, covered, bills };
  }
  const billKindLabel = b => b.kind === "energia" ? "Energia" : b.kind === "area" ? "Repasse à área" : b.source || "Custo";
  const billSched = b => b.kind === "matriz" && b.source === "Pagamento programado";
  // Cada conta leva para onde ela é editada.
  const billEditHref = b => {
    const key = encodeURIComponent(`${b.workId || ""}|${b.station || ""}`);
    if (b.kind === "energia") return `#/parametros/energia/${key}/${encodeURIComponent(`inv:${b.invoiceId}`)}`;
    if (b.kind === "area") return `#/parametros/area/${key}`;
    if (billSched(b)) return `#/parametros/programados/-/${encodeURIComponent(`pay:${b.billId}`)}/${b.monthKey}`;
    return `#/parametros/matriz/-/${encodeURIComponent(`cost:${b.billId}`)}/${b.monthKey}`;
  };
  // Categoria (plano de contas simplificado) e centro de custo de cada conta.
  const billCategory = b => b.kind === "energia" ? "Energia" : b.kind === "area" ? "Repasse à área" : /impost|tribut/i.test(`${b.category} ${b.name}`) ? "Impostos" : (b.category || "Outros custos");
  const billCenter = b => b.station ? String(b.station).replace(/^UBY RECHARGE\s*-\s*/i, "") : "Rede UBY · central";

  // ---------- contas a pagar (estilo ERP) ----------
  // Todas as contas de todas as origens (programadas, matriz, energia, repasses, impostos) numa lista só,
  // com visões rápidas (vencidas, hoje, 7 dias, em aberto, do mês, pagas), filtros por categoria, centro
  // de custo e fornecedor, conferência com o extrato e baixa individual (com valor pago) ou em lote.
  function contasTab(w, data) {
    const can = canWrite(w) && !busy ? "" : "disabled";
    const today = new Date().toISOString().slice(0, 10);
    const plus = n => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const in7 = plus(7);
    const bs = bankState(data);
    const f = ui.cf || (ui.cf = { view: "abertas", month: today.slice(0, 7), cat: "", cc: "", sup: "", q: "" });
    const dueOf = b => String(b.due || "").slice(0, 10);
    const paidOf = b => String(b.paidAt || "").slice(0, 10);
    // Agendada no banco: não conta como vencida; passada a data, pede a confirmação pelo extrato (ou a baixa).
    const schedOf = b => (bs.p.scheduled || {})[b.key] || null;
    const sit = b => b.paid ? "paga" : schedOf(b) ? (schedOf(b).date <= today ? "debitar" : "agendada") : dueOf(b) < today ? "vencida" : dueOf(b) === today ? "hoje" : dueOf(b) <= in7 ? "7dias" : "aberta";
    const SIT = { paga: ["ok", "Paga"], vencida: ["bad", "Vencida"], hoje: ["warn", "Vence hoje"], "7dias": ["warn", "Próximos 7 dias"], aberta: ["neutral", "Em aberto"], agendada: ["dc", "Agendada no banco"], debitar: ["warn", "Agendada · confirme no extrato"] };
    // Documentos (boleto, NF) ligados à conta: pela marca "conta:<chave>" ou pelo custo da matriz + competência.
    const docsOf = b => (data.billDocs || []).filter(d => String(d.notes || "").includes(`conta:${b.key}`) || (b.kind === "matriz" && d.matrix_cost_id === b.billId && d.competence_key === b.monthKey));
    const all = bs.bills.filter(b => b.amount > 0);
    const VIEWS = [["vencidas", "Vencidas", b => sit(b) === "vencida" || sit(b) === "debitar"], ["hoje", "Vencem hoje", b => sit(b) === "hoje"], ["7dias", "Próximos 7 dias", b => !b.paid && dueOf(b) >= today && dueOf(b) <= in7],
      ["abertas", "Todas em aberto", b => !b.paid], ["mes", "Vencem no mês", b => dueOf(b).slice(0, 7) === f.month], ["pagas", "Pagas no mês", b => b.paid && paidOf(b).slice(0, 7) === f.month]];
    const view = VIEWS.find(v => v[0] === f.view) || VIEWS[3];
    const q = String(f.q || "").toLowerCase();
    const rows = all.filter(view[2]).filter(b => (!f.cat || billCategory(b) === f.cat) && (!f.cc || billCenter(b) === f.cc) && (!f.sup || (b.supplier || "—") === f.sup)
      && (!q || `${b.name} ${b.supplier} ${b.station} ${b.category}`.toLowerCase().includes(q)))
      .sort((a, b) => f.view === "pagas" ? paidOf(b).localeCompare(paidOf(a)) : dueOf(a).localeCompare(dueOf(b)));
    const sum = list => list.reduce((s, b) => s + b.amount, 0);
    const k = { late: all.filter(b => sit(b) === "vencida"), today: all.filter(b => sit(b) === "hoje"), week: all.filter(b => !b.paid && dueOf(b) > today && dueOf(b) <= in7),
      open: all.filter(b => !b.paid), paid: all.filter(b => b.paid && paidOf(b).slice(0, 7) === f.month) };
    const opts = (list, cur) => list.map(v => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
    const uniq = fn => [...new Set(all.map(fn))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const recOf = b => { const r = bs.byKey.get(b.key); if (!r || r.status === "aberto" || r.status === "sem-extrato") return bs.covered(b) && r ? r : null; return r; };
    const recTxt = b => { const r = recOf(b); if (!bs.tx.length || !r) return ""; const [cls, label] = REC[r.status]; return `<span class="badge ${cls}" style="font-size:10px">${label}</span>`; };
    const sel = ui.cfSel || (ui.cfSel = new Set());
    [...sel].forEach(key => { if (!rows.some(b => b.key === key && !b.paid)) sel.delete(key); });
    const panel = b => {
      const r = recOf(b);
      const isArea = b.kind === "area", isMatrix = b.kind === "matriz";
      const due = Number(b.dueAmount ?? b.amount);
      return `<tr><td colspan="9"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        ${field("Pago em", `<input class="select" type="date" data-c-date value="${esc(r?.bankDate || today)}" style="width:150px">`)}
        ${isArea || isMatrix ? field(`Valor pago (${isArea ? "devido" : "previsto"} ${fmt.brl(due)})`, `<input class="select" type="number" step="0.01" min="0" data-c-amount data-due="${esc(due.toFixed(2))}" value="${esc((r && !r.sharedWith.length && r.tx.length ? r.paidTotal : due).toFixed(2))}" style="width:150px">`) : `<small style="padding-bottom:8px">Valor: <strong>${fmt.brl(b.amount)}</strong> · para mudar, edite a fatura em Energia</small>`}
        ${isArea ? field("Se o valor pago for diferente", `<select class="select" data-c-diff style="width:240px"><option value="next">Levar a diferença para o mês seguinte</option><option value="drop">Zerar a diferença</option></select>`) : ""}
        <button class="btn primary" data-c-confirm="${esc(b.key)}" type="button" ${can}>Confirmar pagamento</button>
        <button class="btn ghost" data-c-cancel type="button">Cancelar</button></div></td></tr>`;
    };
    const selTotal = sum(rows.filter(b => sel.has(b.key)));
    // Impostos projetados sobre o recebido no extrato: uma linha por guia (PIS/COFINS no mês, IRPJ/CSLL no trimestre).
    const taxPanel = (() => {
      const B = window.UBY_BANK;
      if (!B?.taxPlan || !bs.tx.length) return "";
      let plan, res;
      try { plan = B.taxPlan(bs.tx, bs.p.links || {}); res = B.applyTaxPlan(w.loadMatrizCosts(), plan.lines, w.matrizNormalizeCost); } catch (_) { return ""; }
      if (!plan.lines.length && !res.report.removed.length) return "";
      const rp = res.report, pending = rp.added.length + rp.updated.length + rp.removed.length;
      const st = id => rp.added.includes(id) ? ["warn", "ainda não lançada"] : rp.updated.includes(id) ? ["warn", "desatualizada"] : rp.locked.includes(id) ? ["neutral", "guia real (valor travado)"] : rp.paid.includes(id) ? ["ok", "paga"] : ["ok", "em dia"];
      return `<section class="section"><div class="section-head"><div><p class="kicker">Impostos</p><h2>Guias projetadas sobre o recebido</h2>
          <p>Uma linha por guia, calculada sobre o que entrou na conta (Spott, Move e cartão): PIS/COFINS no mês (3,65%) e IRPJ/CSLL no trimestre (7,68%). Atualiza sozinha quando você anexa o extrato ou corrige a origem de uma entrada. Quando a guia real sair, edite o valor da linha: ele fica travado.</p></div>
          <div style="flex:none"><button class="btn primary" id="pmTaxSync" type="button" style="white-space:nowrap" ${can} ${pending ? "" : "disabled"}>Atualizar linhas de imposto${pending ? ` (${pending})` : ""}</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>Guia</th><th class="num">Recebido (base)</th><th class="num">Valor projetado</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>
          ${plan.lines.map(L => { const [cls, label] = st(L.id); return `<tr><td style="white-space:normal"><strong>${esc(L.name)}</strong></td><td class="num">${fmt.brl(L.base)}</td><td class="num"><strong>${fmt.brl(L.amount)}</strong></td><td>${fmtDay(L.dueDate)}</td>
            <td><span class="badge ${cls}">${esc(label)}</span>${rp.locked.includes(L.id) ? ` <button class="btn ghost" data-tax-force="${esc(L.id)}" type="button" ${can}>Voltar à projeção</button>` : ""}</td></tr>`; }).join("")}
          ${rp.removed.map(id => `<tr><td colspan="4"><small>${esc(id)}: sem recebido na base</small></td><td><span class="badge warn">será removida</span></td></tr>`).join("")}
        </tbody></table></div>
        ${plan.warnings.map(m => `<div class="note" style="border-color:var(--uby-amber,#c9962b);margin-top:8px">${esc(m)}</div>`).join("")}
        <p class="source-line">Base: entradas de Spott, Move e cartão, no mês do recebimento. "Rendimentos", "Outras entradas" e "Não é da UBY" ficam de fora. Antes de out/2026 valem as guias reais já emitidas. Vencimento que cai em fim de semana vai para o dia útil anterior (feriados não são considerados).</p>
      </section>`;
    })();
    const docPanel = b => {
      const sc = schedOf(b);
      return `<tr><td colspan="9"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
        ${b.paid ? "" : `<div class="note" style="margin:0"><strong>🏦 Pagamento agendado no banco</strong><br><small>Marque quando já deixou o pagamento autorizado para a data. A conta sai de "vencida"; quando o débito aparecer no extrato, confirme na conciliação.</small>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">${field("Débito agendado para", `<input class="select" type="date" data-c-sched-date value="${esc(sc?.date || dueOf(b) || today)}" style="width:160px">`)}
            <button class="btn primary" data-c-sched="${esc(b.key)}" type="button" ${can}>${sc ? "Atualizar agendamento" : "Marcar como agendado"}</button>
            ${sc ? `<button class="btn ghost" data-c-unsched="${esc(b.key)}" type="button" ${can}>Tirar agendamento</button>` : ""}</div>
          ${sc ? `<small>agendado em ${fmtDay(sc.at)}${sc.by ? ` por ${esc(sc.by)}` : ""}</small>` : ""}</div>`}
        <div class="note" style="margin:0"><strong>📎 Anexar boleto, NF ou comprovante</strong><br><small>Fica privado, ligado a esta conta (${esc(b.name)} · ${fmtDay(dueOf(b))}). PDF ou imagem até 15 MB.</small>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
            ${field("Tipo", `<select class="select" data-c-doc-type style="width:140px">${[["boleto", "Boleto"], ["nota_fiscal", "Nota fiscal"], ["fatura", "Fatura"], ["recibo", "Comprovante"], ["contrato", "Contrato"], ["outro", "Outro"]].map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`)}
            ${field("Número (opcional)", `<input class="select" data-c-doc-num style="width:150px">`)}
            ${field("Arquivo", `<input class="select" type="file" data-c-doc-file accept="application/pdf,image/jpeg,image/png,image/webp" style="width:230px;padding-top:6px">`)}
            <button class="btn primary" data-c-doc-save="${esc(b.key)}" type="button" ${can}>Anexar</button></div>
          ${docsOf(b).length ? `<small>Já anexado: ${docsOf(b).map(d => esc(d.file_name || d.document_type)).join(", ")}</small>` : ""}</div>
        </div><div style="margin-top:8px"><button class="btn ghost" data-c-doc-close type="button">Fechar</button></div></td></tr>`;
    };
    return `
      <div class="grid g5" style="margin-bottom:14px">
        ${kpi("Vencido", fmt.brl(sum(k.late)), `${fmt.int(k.late.length)} conta(s)`, "", k.late.length ? "bad" : "")}
        ${kpi("Vence hoje", fmt.brl(sum(k.today)), `${fmt.int(k.today.length)} conta(s)`, "", k.today.length ? "warn" : "")}
        ${kpi("Próximos 7 dias", fmt.brl(sum(k.week)), `${fmt.int(k.week.length)} conta(s)`)}
        ${kpi("Total em aberto", fmt.brl(sum(k.open)), `${fmt.int(k.open.length)} conta(s)`, "", "lead")}
        ${kpi(`Pago em ${esc(UBY.state.api?.monthName?.(f.month) || f.month)}`, fmt.brl(sum(k.paid)), `${fmt.int(k.paid.length)} conta(s)`)}
      </div>
      ${taxPanel}
      <section class="section"><div class="section-head"><div><p class="kicker">Financeiro</p><h2>Contas a pagar</h2><p>Todas as contas numa lista só: internet, aluguel, seguro, energia (Copel e arrendamento), repasses às áreas e impostos. Pague aqui (com o valor real, se teve desconto ou juros), em lote, ou concilie com o extrato.</p></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn primary" href="#/parametros/pagamentos">＋ Nova conta</a><a class="btn" href="#/parametros/pagamentos">🏦 Conciliar extrato</a></div></div>
        <div class="seg" id="cfView" style="margin-bottom:10px">${VIEWS.map(([v, l, fn]) => `<button type="button" data-v="${v}" class="${f.view === v ? "on" : ""}">${esc(l)}${["vencidas", "hoje", "7dias"].includes(v) ? ` <b>${all.filter(fn).length}</b>` : ""}</button>`).join("")}</div>
        <div class="toolbar" style="box-shadow:none;margin-bottom:10px">
          ${["mes", "pagas"].includes(f.view) ? `<input class="select" type="month" data-cff="month" value="${esc(f.month)}">` : ""}
          <select class="select" data-cff="cat"><option value="">Todas as categorias</option>${opts(uniq(billCategory), f.cat)}</select>
          <select class="select" data-cff="cc"><option value="">Todos os centros de custo</option>${opts(uniq(billCenter), f.cc)}</select>
          <select class="select" data-cff="sup"><option value="">Todos os fornecedores</option>${opts(uniq(b => b.supplier || "—"), f.sup)}</select>
          <input class="search" data-cff="q" placeholder="Buscar conta, fornecedor…" value="${esc(f.q)}">
          <span class="spacer"></span><small>${fmt.int(rows.length)} conta(s) · ${fmt.brl(sum(rows))}</small></div>
        ${sel.size ? `<div class="note" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><strong>${fmt.int(sel.size)} selecionada(s) · ${fmt.brl(selTotal)}</strong>
          pagas em <input class="select" type="date" id="cfBulkDate" value="${esc(today)}" style="width:150px">
          <button class="btn primary" id="cfBulkPay" type="button" ${can}>Marcar como pagas (valor previsto)</button><button class="btn ghost" id="cfBulkClear" type="button">Limpar seleção</button></div>` : ""}
        <div class="table-wrap"><table><thead><tr><th style="width:28px"><input type="checkbox" id="cfAll" ${rows.some(b => !b.paid) && rows.filter(b => !b.paid).every(b => sel.has(b.key)) ? "checked" : ""}></th><th>Vencimento</th><th>Conta</th><th>Centro de custo</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th>Extrato</th><th></th></tr></thead>
          <tbody>${rows.map(b => `<tr${sit(b) === "vencida" ? ' style="background:rgba(183,84,80,.06)"' : ""}>
            <td>${b.paid ? "" : `<input type="checkbox" data-cf-sel="${esc(b.key)}" ${sel.has(b.key) ? "checked" : ""}>`}</td>
            <td><strong>${fmtDay(dueOf(b))}</strong>${sit(b) === "vencida" ? `<small style="color:var(--uby-red)">há ${Math.round((new Date(`${today}T12:00:00`) - new Date(`${dueOf(b)}T12:00:00`)) / 86400000)} dia(s)</small>` : ""}</td>
            <td style="white-space:normal"><a class="edit-link" href="${billEditHref(b)}" title="Abrir onde esta conta é editada"><strong>${esc(b.name)}</strong><span aria-hidden="true"> ✎</span></a><small>${esc(billKindLabel(b))}${b.supplier ? ` · ${esc(b.supplier)}` : ""}</small>${docsOf(b).map(d => `<button class="btn ghost" data-doc-open="${esc(d.id)}" type="button" title="${esc(d.file_name || "documento")}" style="height:22px;padding:0 7px;font-size:11px;margin-top:3px">📄 ${esc({ boleto: "Boleto", nota_fiscal: "NF", fatura: "Fatura", recibo: "Comprovante", contrato: "Contrato" }[d.document_type] || "Documento")}</button>`).join(" ")}</td>
            <td>${b.workId ? UBY.stationLink(b.workId, billCenter(b)) : esc(billCenter(b))}</td>
            <td><small>${esc(billCategory(b))}</small></td>
            <td class="num"><strong>${fmt.brl(b.amount)}</strong>${b.paidAmount !== null && b.paidAmount !== undefined && Math.abs(b.paidAmount - b.dueAmount) > 0.009 ? `<small>${b.kind === "area" ? "devido" : "previsto"} ${fmt.brl(b.dueAmount)}</small>` : ""}</td>
            <td><span class="badge ${SIT[sit(b)][0]}">${SIT[sit(b)][1]}</span>${b.paid && paidOf(b) ? `<small>em ${fmtDay(paidOf(b))}</small>` : !b.paid && schedOf(b) ? `<small>débito em ${fmtDay(schedOf(b).date)}</small>` : ""}</td>
            <td>${recTxt(b)}</td>
            <td style="white-space:nowrap"><button class="btn ghost" data-c-doc="${esc(b.key)}" type="button" title="Anexar boleto/NF${b.paid ? "" : " e agendar no banco"}">📎${b.paid ? "" : " Agendar"}</button> ${b.paid ? `<button class="btn ghost" data-c-unpay="${esc(b.key)}" type="button" ${can}>Desfazer</button>` : `<button class="btn primary" data-c-pay="${esc(b.key)}" type="button" ${can}>Pagar</button>`}</td></tr>
            ${ui.cPay === b.key && !b.paid ? panel(b) : ""}${ui.cDoc === b.key ? docPanel(b) : ""}`).join("") || `<tr><td colspan="9" class="empty">Nenhuma conta nesta visão.</td></tr>`}</tbody>
          <tfoot><tr><td colspan="5">Total da visão</td><td class="num">${fmt.brl(sum(rows))}</td><td colspan="3"></td></tr></tfoot></table></div>
      </section>`;
  }

  function centralTab(w, data) {
    const mk = ui.payMonth;
    const can = canWrite(w) && !busy ? "" : "disabled";
    const today = new Date().toISOString().slice(0, 10);
    const bs = bankState(data);
    const rows = bs.bills.filter(b => b.monthKey === mk).sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const tot = rows.reduce((a, r) => { a.total += r.amount; if (r.paid) a.paid += r.amount; else a.open += r.amount; if (r.status === "overdue") a.late += r.amount; return a; }, { total: 0, paid: 0, open: 0, late: 0 });
    const recOf = b => { const r = bs.byKey.get(b.key); if (!r) return null; if (r.status === "aberto" || r.status === "sem-extrato") return bs.covered(b) ? r : null; return r; };
    const nRec = rows.map(recOf).filter(Boolean);
    const conf = nRec.filter(r => r.status === "conferido").length;
    const kindLabel = billKindLabel, sched = billSched, billHref = billEditHref;
    // Possível duplicidade: mesmo carregador e mesmo valor no mês (ex.: pagamento programado da Copel
    // e a fatura da Copel lançada em Energia). Só o programado pode ser removido daqui.
    const normSt = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^uby recharge\s*-\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
    const dupsOf = b => rows.filter(o => o.key !== b.key && Math.abs(o.amount - b.amount) < 0.01 && normSt(o.station) === normSt(b.station));
    const recCell = b => {
      const r = recOf(b);
      if (!bs.tx.length) return `<small style="color:var(--uby-muted)">sem extrato</small>`;
      if (!r) return `<small style="color:var(--uby-muted)">fora do período do extrato</small>`;
      const [cls, label] = REC[r.status];
      const txt = r.tx.length ? `${r.tx.map(t => `${fmtDay(t.date)} · ${fmt.brl(t.value)}`).join(" + ")}${r.sharedWith.length ? ` (junto com ${r.sharedWith.length} outra(s) conta(s))` : ""}${r.diff ? ` · diferença ${fmt.brl(r.diff)}` : ""}` : "";
      return `<span class="badge ${cls}">${label}</span>${txt ? `<small>${esc(txt)}</small>` : ""}${!b.paid && (r.status === "pago-nao-marcado" || r.status === "diferenca") ? `<button class="btn" data-c-paybank="${esc(b.key)}|${esc(r.bankDate)}|${r.sharedWith.length ? "" : r.paidTotal}" type="button" style="margin-top:4px" ${can}>Marcar pago em ${fmtDay(r.bankDate)}${b.kind === "area" && r.diff && !r.sharedWith.length ? ` com ${fmt.brl(r.paidTotal)} (diferença vai ao mês seguinte)` : b.kind === "matriz" && r.diff && !r.sharedWith.length ? ` com ${fmt.brl(r.paidTotal)}` : ""}</button>` : ""}`;
    };
    const payPanel = b => {
      const r = recOf(b);
      const date = r?.bankDate || today;
      const isArea = b.kind === "area", isMatrix = b.kind === "matriz";
      const due = isArea || isMatrix ? Number(b.dueAmount ?? b.amount) : b.amount;
      return `<tr><td colspan="7"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        ${field("Pago em", `<input class="select" type="date" data-c-date value="${esc(date)}" style="width:150px">`)}
        ${isArea ? `${field(`Valor pago (devido ${fmt.brl(due)})`, `<input class="select" type="number" step="0.01" data-c-amount data-due="${esc(due.toFixed(2))}" value="${esc((r && !r.sharedWith.length && r.tx.length ? r.paidTotal : due).toFixed(2))}" style="width:150px">`)}
          ${field("Se o valor pago for diferente do devido", `<select class="select" data-c-diff style="width:260px"><option value="next">Levar a diferença para o mês seguinte</option><option value="drop">Zerar a diferença</option></select>`)}`
        : isMatrix ? `${field(`Valor pago (previsto ${fmt.brl(due)})`, `<input class="select" type="number" step="0.01" min="0" data-c-amount data-due="${esc(due.toFixed(2))}" value="${esc((r && !r.sharedWith.length && r.tx.length ? r.paidTotal : due).toFixed(2))}" style="width:150px">`)}
          <small style="padding-bottom:8px">Desconto, juros ou mês proporcional: informe o valor do boleto pago. O previsto não muda para os próximos meses.</small>` : `<small style="padding-bottom:8px">Valor: <strong>${fmt.brl(b.amount)}</strong>${b.kind === "energia" ? " · para mudar o valor, edite a fatura em Energia" : " · para mudar o valor, edite o custo em Outros custos"}</small>`}
        <button class="btn primary" data-c-confirm="${esc(b.key)}" type="button" ${can}>Confirmar pagamento</button>
        <button class="btn ghost" data-c-cancel type="button">Cancelar</button></div></td></tr>`;
    };
    // Saídas do extrato no mês (para conferir e vincular à mão o que não casou sozinho).
    const outs = bs.rec.outflows.filter(t => t.date.slice(0, 7) === mk);
    const billName = k => { const b = bs.bills.find(x => x.key === k); return b ? `${b.name}${b.station ? ` · ${b.station}` : ""}` : k; };
    // Opções de vínculo com critério (como num conciliador): só contas em aberto e ainda sem lançamento
    // do banco, com valor parecido (até 30% ou R$ 10) e vencimento perto da data do pagamento; as mais
    // prováveis primeiro (valor, nome do fornecedor, data). "Ver todas" abre as demais contas em aberto.
    const linkedKeys = new Set(bs.rec.bills.filter(b => b.tx.length).map(b => b.key));
    const linkOptions = t => {
      const Bk = window.UBY_BANK;
      const who = Bk ? Bk.norm(t.description) : "";
      const ddays = b => Math.round((new Date(`${b.due}T12:00:00`) - new Date(`${t.date}T12:00:00`)) / 86400000);
      const like = b => !!who && Bk.norm(`${b.supplier} ${b.name}`).split(" ").some(x => x.length >= 4 && who.includes(x));
      const open = bs.bills.filter(b => !b.paid && !linkedKeys.has(b.key) && b.amount > 0 && !t.bills.includes(b.key));
      const tol = Math.max(t.value * 0.3, 10);
      const fit = open.filter(b => Math.abs(b.amount - t.value) <= tol && ddays(b) >= -45 && ddays(b) <= 60)
        .sort((a, b) => (Math.abs(a.amount - t.value) / t.value + Math.abs(ddays(a)) / 60 - (like(a) ? 0.5 : 0)) - (Math.abs(b.amount - t.value) / t.value + Math.abs(ddays(b)) / 60 - (like(b) ? 0.5 : 0)));
      const all = ui.bankAll === t.id;
      const rest = all ? open.filter(b => !fit.includes(b)).sort((a, b) => String(a.due).localeCompare(String(b.due))) : [];
      const where = b => String(b.station || b.workName || "").replace(/^UBY RECHARGE\s*-\s*/i, "");
      const opt = b => `<option value="${esc(b.key)}">${esc(fmtDay(b.due))} · ${esc(fmt.brl(b.amount))} · ${esc(b.name)}${where(b) ? ` · ${esc(where(b))}` : ""}${Math.abs(b.amount - t.value) > 0.009 ? ` (dif. ${esc(fmt.brl(t.value - b.amount))})` : ""}</option>`;
      // Conta já paga em parte (ex.: repasse da área num Pix e reembolso de energia em outro): o que falta.
      const missing = b => Math.round((Number(b.dueAmount) - Number(b.amount)) * 100) / 100;
      const parts = bs.bills.filter(b => b.paid && (b.kind === "area" || b.kind === "matriz") && b.dueAmount !== undefined && b.dueAmount !== null && missing(b) > 0.009
        && !t.bills.includes(b.key) && Math.abs(missing(b) - t.value) <= Math.max(missing(b) * 0.3, 10) && ddays(b) >= -45 && ddays(b) <= 60)
        .sort((a, b) => Math.abs(missing(a) - t.value) - Math.abs(missing(b) - t.value));
      const partOpt = b => `<option value="${esc(b.key)}">${esc(b.name)}${where(b) ? ` · ${esc(where(b))}` : ""} · pago ${esc(fmt.brl(b.amount))} de ${esc(fmt.brl(b.dueAmount))} · falta ${esc(fmt.brl(missing(b)))}${Math.abs(missing(b) - t.value) > 0.009 ? ` (dif. ${esc(fmt.brl(t.value - missing(b)))})` : ""}</option>`;
      return `<option value="">Vincular a uma conta…</option>
        ${parts.length ? `<optgroup label="Completar conta paga em partes">${parts.slice(0, 6).map(partOpt).join("")}</optgroup>` : ""}
        ${fit.length ? `<optgroup label="Mais prováveis (valor e data parecidos)">${fit.slice(0, 12).map(opt).join("")}</optgroup>` : `<option value="" disabled>Nenhuma conta em aberto com valor parecido</option>`}
        ${rest.length ? `<optgroup label="Outras contas em aberto">${rest.map(opt).join("")}</optgroup>` : ""}
        ${all ? "" : `<option value="__all">Ver todas as contas em aberto…</option>`}
        <option value="__new">＋ Lançar como conta nova (já paga)</option><option value="__ignore">Não é conta (transferência, retirada…)</option>`;
    };
    // Painel "lançar como conta nova": pagamento avulso do mês, já pago na data do banco.
    const targets = (() => { try { w.renderScheduledPayments(w.getGeneralUnitData()); return [...(w.document.getElementById("scheduledPaymentTarget")?.options || [])].filter(o => o.value).map(o => ({ value: o.value, text: o.text })); } catch (_) { return []; } })();
    const newPanel = t => {
      const f = ui.bankNewForm || {};
      return `<tr><td colspan="5"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        ${field("Carregador", `<select class="select" data-bn="target" style="width:260px"><option value="">Selecione</option>${targets.map(o => `<option value="${esc(o.value)}" ${f.target === o.value ? "selected" : ""}>${esc(o.text)}</option>`).join("")}</select>`)}
        ${field("Conta", `<input class="select" data-bn="name" value="${esc(f.name ?? t.description)}" style="width:200px">`)}
        ${field("Fornecedor", `<input class="select" data-bn="supplier" value="${esc(f.supplier ?? t.description)}" style="width:170px">`)}
        ${field("Categoria", `<select class="select" data-bn="category">${["Internet / dados", "Energia", "Locação / aluguel", "Seguro", "Manutenção", "Licença / plataforma", "Outros custos"].map(c => `<option ${(f.category || "Internet / dados") === c ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
        <small style="padding-bottom:8px">${fmt.brl(t.value)} · pago em ${fmtDay(t.date)}</small>
        <button class="btn primary" data-bank-new-save="${esc(t.id)}" type="button" ${can}>Lançar e vincular</button>
        <button class="btn ghost" data-bank-new-cancel type="button">Cancelar</button></div>
        <small class="source-line">Entra como pagamento avulso de ${esc(UBY.state.api?.monthName?.(t.date.slice(0, 7)) || t.date.slice(0, 7))} (calendário de caixa, já pago). Não muda o resultado: o custo do mês continua vindo das regras em Carregadores.</small></td></tr>`;
    };
    const infl = window.UBY_BANK ? window.UBY_BANK.inflows(bs.tx, bs.p.links || {}) : {};
    // Entradas do mês, com a origem corrigível à mão (fica guardada no extrato).
    const SRCS = ["Spott", "Move", "Cartão (vendas)", "Rendimentos", "Outras entradas", "Não é da UBY (devolver)"];
    const inMonth = bs.tx.filter(t => t.amount > 0 && t.date.slice(0, 7) === mk).sort((a, b) => a.date.localeCompare(b.date));
    const srcOf = t => (bs.p.links || {})[t.id]?.source || window.UBY_BANK.inflowSource(t);
    const inflMonths = Object.keys(infl).sort().reverse();
    const inflSrc = ["Spott", "Move", "Cartão (vendas)", "Rendimentos", "Outras entradas", "Não é da UBY (devolver)"].filter(s => inflMonths.some(m => infl[m][s]));
    return `
      <div class="toolbar"><label>Vencimentos de <input class="select" id="pmCentralMonth" type="month" value="${esc(mk)}"></label>
        <span class="spacer"></span><small>Energia, repasses às áreas, custos da matriz e pagamentos programados · para cotistas, veja Cotas e fechamentos</small></div>
      <div class="grid g5" style="margin-bottom:14px">${kpi("A pagar no mês", fmt.brl(tot.total), `${rows.length} conta(s)`, "", "lead")}${kpi("Em aberto", fmt.brl(tot.open))}${kpi("Vencido", fmt.brl(tot.late), "", "", tot.late ? "bad" : "")}${kpi("Pago", fmt.brl(tot.paid))}${kpi("Conferido no extrato", bs.tx.length ? `${conf} de ${nRec.length}` : "—", bs.tx.length ? `extratos de ${fmtDay(bs.from)} a ${fmtDay(bs.to)}` : "anexe o extrato abaixo")}</div>
      <section class="section"><div class="section-head"><div><p class="kicker">Contas do mês</p><h2>Pagamentos</h2><p>Marque como pago aqui mesmo. Quando houver extrato, a coluna Extrato mostra se o pagamento apareceu no banco, com a data e o valor.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Conta</th><th>De onde</th><th class="num">Valor</th><th>Situação</th><th>Extrato</th><th></th></tr></thead>
          <tbody>${rows.map(b => `<tr><td><strong>${fmtDay(b.due)}</strong></td>
            <td style="white-space:normal"><strong><a class="edit-link" href="${billHref(b)}" title="Abrir onde esta conta é editada">${esc(b.name)}<span aria-hidden="true"> ✎</span></a></strong><small>${esc(kindLabel(b))}${b.supplier ? ` · ${esc(b.supplier)}` : ""}</small>
              ${(() => { const d = dupsOf(b); if (!d.length) return ""; return `<div style="margin-top:4px"><span class="badge warn">possível duplicidade</span><small>mesmo carregador e mesmo valor que: ${d.map(o => `"${esc(o.name)}"`).join(", ")}${!sched(b) && d.some(sched) ? " · remova o pagamento programado e mantenha este" : ""}</small>
                ${sched(b) ? `<button class="btn ghost" data-pay-end="${esc(b.billId)}" data-month="${esc(mk)}" type="button" style="color:var(--uby-red);margin-top:4px" ${can}>Remover este (daqui em diante)</button>` : ""}</div>`; })()}</td>
            <td>${b.workId ? UBY.stationLink(b.workId, b.station || b.workName) : esc(b.station || "—")}${b.workName ? `<small>${esc(b.workName)}</small>` : ""}</td>
            <td class="num"><strong>${fmt.brl(b.amount)}</strong>${(b.kind === "area" || b.kind === "matriz") && b.paidAmount !== null && b.paidAmount !== undefined && Math.abs(b.paidAmount - b.dueAmount) > 0.009 ? `<small>${b.kind === "area" ? "devido" : "previsto"} ${fmt.brl(b.dueAmount)}</small>` : ""}</td>
            <td><span class="badge ${b.paid ? "ok" : b.status === "overdue" ? "bad" : "warn"}">${esc(b.statusLabel || (b.paid ? "Pago" : "A pagar"))}</span>${b.paidAt ? `<small>em ${fmtDay(b.paidAt)}</small>` : ""}</td>
            <td style="white-space:normal;min-width:200px">${recCell(b)}</td>
            <td style="white-space:nowrap">${b.paid ? `<button class="btn ghost" data-c-unpay="${esc(b.key)}" type="button" ${can}>Desfazer</button>` : `<button class="btn primary" data-c-pay="${esc(b.key)}" type="button" ${can}>Marcar pago</button>`}</td></tr>
            ${ui.cPay === b.key && !b.paid ? payPanel(b) : ""}`).join("") || `<tr><td colspan="7" class="empty">Nenhuma conta vence neste mês.</td></tr>`}</tbody></table></div>
      </section>
      ${(() => {
        // Lançar conta aqui mesmo (pagamento recorrente de um carregador), sem trocar de aba.
        if (ui.payEditing) { ui.payEditing = ""; ui.payForm = null; }
        const pf = ui.payForm || (ui.payForm = { target: "", name: "", supplier: "", category: "Internet / dados", amount: "", dueDay: 11, startMonth: mk, endMonth: "" });
        const pinp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-pf="${k}" type="${type}" value="${esc(pf[k] ?? "")}" ${extra} style="width:100%">`);
        return `<details class="section" ${ui.payAddOpen ? "open" : ""} id="pmPayAddBox"><summary style="cursor:pointer;font-weight:850;color:var(--uby-forest)">＋ Lançar conta nova de um carregador (internet, aluguel, manutenção…)</summary>
          <p style="margin:10px 0">Pagamento recorrente: entra aqui em Pagamentos todo mês, no dia do vencimento. Para custo dividido entre carregadores, parcelado ou seguro, use <a href="#/parametros/matriz">Custos da matriz</a>; para energia, <a href="#/parametros/energia">Faturas de energia</a>.</p>
          <div class="grid g4" style="gap:8px">
            ${field("Carregador", `<select class="select" data-pf="target"><option value="">Selecione</option>${targets.map(t => `<option value="${esc(t.value)}" ${pf.target === t.value ? "selected" : ""}>${esc(t.text)}</option>`).join("")}</select>`)}
            ${pinp("name", "Conta")}${pinp("supplier", "Fornecedor")}
            ${field("Categoria", `<select class="select" data-pf="category">${["Internet / dados", "Energia", "Locação / aluguel", "Seguro", "Manutenção", "Licença / plataforma", "Outros custos"].map(c => `<option ${pf.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
            ${pinp("amount", "Valor mensal (R$)", "number", 'min="0" step="0.01"')}${pinp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}${pinp("startMonth", "Inicia em", "month")}${pinp("endMonth", "Termina em (opcional)", "month")}
          </div>
          <button class="btn primary" id="pmPayAdd" type="button" style="margin-top:12px" ${can}>Lançar conta</button></details>`;
      })()}
      <section class="section"><div class="section-head"><div><p class="kicker">Conferência</p><h2>Extrato do banco</h2>
          <p>Anexe o extrato (Excel, CSV ou OFX; o do PagSeguro em Excel funciona direto). Pode anexar períodos que se sobrepõem: lançamentos repetidos não duplicam. As saídas são casadas com as contas pelo valor e pela data; o que não casar sozinho você vincula abaixo.</p></div></div>
        <label class="imp-field" style="display:block;border:1.5px dashed var(--uby-line, #c9d6cf);border-radius:10px;padding:10px 12px;margin-bottom:10px;cursor:pointer">
          <span style="font-size:12px;font-weight:800">🏦 Anexar extrato</span><small style="display:block;color:var(--uby-muted)">.xlsx, .xls, .csv ou .ofx</small>
          <input id="pmBankFile" type="file" accept=".xlsx,.xls,.csv,.ofx,.txt" style="margin-top:6px;width:100%" ${can}></label>
        ${data.bankError ? `<div class="note" style="border-color:var(--uby-red)">Não consegui ler os extratos guardados: ${esc(data.bankError)}</div>` : ""}
        ${(bs.p.statements || []).length ? `<div class="list" style="margin-bottom:12px">${bs.p.statements.slice().reverse().map(s => `<div class="list-row"><span><strong>${esc(s.fileName || "extrato")}</strong> · ${esc(s.bank || "")}${s.account ? ` · conta ${esc(s.account)}` : ""}<br><small>${fmtDay(s.from)} a ${fmtDay(s.to)} · ${fmt.int(s.count)} lançamento(s), ${fmt.int(s.added)} novo(s) · anexado ${esc(fmt.dt(s.importedAt))}</small></span><button class="btn ghost" data-bank-del-st="${esc(s.id)}" type="button" style="color:var(--uby-red)" ${can}>Remover</button></div>`).join("")}</div>` : ""}
        ${bs.tx.length ? `
          ${(() => {
            // Conciliação: cada saída do banco é conciliada (conta paga), sugestão a confirmar, sem conta ou "não é conta".
            const n = st => outs.filter(t => t.state === st).length;
            const exact = outs.filter(t => t.state === "confirmar" && Math.abs(t.diff) <= 0.009);
            const sugg = t => {
              const names = t.bills.map(k => `<strong>${esc(billName(k))}</strong>`).join("<br>");
              const why = t.how === "grupo" ? "soma de pagamentos" : Math.abs(t.diff) <= 0.009 ? "valor exato" : `previsto ${fmt.brl(t.expected)} · pago ${fmt.brl(t.value)} (${t.diff < 0 ? "desconto" : "acréscimo"} ${fmt.brl(Math.abs(t.diff))})`;
              return `${names}<small><span class="badge warn">é esta?</span> ${esc(why)}</small>`;
            };
            const hint = t => t.hint ? `<small style="display:block;margin-bottom:4px">Parece: <strong>${esc(t.hint.name)}</strong>${t.hint.supplier ? ` · ${esc(t.hint.supplier)}` : ""} (${esc(t.hint.station || "—")}, ${fmt.brl(t.hint.amount)}) — valor não bate. Se for de outro carregador, lance como conta nova.</small>` : "";
            const cell = t => t.state === "conciliado" ? `${t.bills.map(k => `<small>${esc(billName(k))}</small>`).join("")}<span class="badge ok">conciliado</span>${t.parts > 1 ? `<small>paga em ${t.parts} pagamentos · total ${fmt.brl(t.groupTotal)}${Math.abs(t.diff) > 0.009 ? ` · previsto ${fmt.brl(t.expected)}` : ""}</small>` : Math.abs(t.diff) > 0.009 ? `<small>pago ${fmt.brl(t.value)} · previsto ${fmt.brl(t.expected)}</small>` : ""}`
              : t.state === "confirmar" ? sugg(t)
              : t.state === "ignorado" ? `<span class="badge neutral">não é conta</span>${t.note ? `<small>${esc(t.note)}</small>` : ""}`
              : `${hint(t)}<select class="select" data-bank-link="${esc(t.id)}" style="max-width:360px" ${can}>${linkOptions(t)}</select>`;
            const act = t => t.state === "confirmar" ? `<button class="btn primary" data-bank-confirm="${esc(t.id)}" type="button" ${can}>Confirmar</button>
                <select class="select" data-bank-link="${esc(t.id)}" style="max-width:180px;margin-top:4px" ${can}>${linkOptions(t).replace("Vincular a uma conta…", "Não, é outra…")}</select>`
              : (bs.p.links || {})[t.id] ? `<button class="btn ghost" data-bank-unlink="${esc(t.id)}" type="button" ${can}>Desfazer</button>` : "";
            return `
          <h3 style="margin:14px 0 8px;font-size:13px">Conciliação · saídas do banco em ${esc(UBY.state.api?.monthName?.(mk) || mk)}</h3>
          <div class="toolbar" style="box-shadow:none;margin-bottom:8px">
            <span class="badge ok">${fmt.int(n("conciliado"))} conciliada(s)</span><span class="badge warn">${fmt.int(n("confirmar"))} a confirmar</span><span class="badge bad">${fmt.int(n("sem-conta"))} sem conta</span>${n("ignorado") ? `<span class="badge neutral">${fmt.int(n("ignorado"))} não é conta</span>` : ""}
            <span class="spacer"></span>
            ${exact.length ? `<button class="btn primary" id="pmBankConfirmExact" type="button" ${can}>Confirmar as ${exact.length} de valor exato</button>` : ""}</div>
          <div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição no extrato</th><th class="num">Valor</th><th>Conta</th><th></th></tr></thead><tbody>
            ${outs.map(t => `<tr${t.state === "confirmar" ? ' style="background:var(--uby-amber-soft,#fbf3e4)"' : ""}><td>${fmtDay(t.date)}</td><td>${esc(t.description)}<small>${esc(t.type || "")}</small></td><td class="num"><strong>${fmt.brl(t.value)}</strong></td>
              <td style="white-space:normal">${cell(t)}</td>
              <td style="white-space:nowrap">${act(t)}</td></tr>
              ${ui.bankNew === t.id && !t.bills.length ? newPanel(t) : ""}`).join("") || `<tr><td colspan="5" class="empty">Nenhuma saída no extrato neste mês.</td></tr>`}
          </tbody></table></div>
          <p class="source-line">Confirmar marca a conta como paga na data e no valor do banco (desconto ou juros ficam registrados) e ensina a plataforma: na próxima vez, o mesmo lançamento já vem sugerido para essa conta.</p>`;
          })()}
          <h3 style="margin:18px 0 8px;font-size:13px">Entradas por mês e origem</h3>
          <div class="table-wrap"><table><thead><tr><th>Mês</th>${inflSrc.map(s => `<th class="num">${esc(s)}</th>`).join("")}<th class="num">Total da UBY</th></tr></thead><tbody>
            ${inflMonths.map(m => `<tr><td><strong>${esc(UBY.state.api?.monthName?.(m) || m)}</strong></td>${inflSrc.map(s => `<td class="num">${infl[m][s] ? fmt.brl(infl[m][s]) : "—"}</td>`).join("")}<td class="num"><strong>${fmt.brl(Object.entries(infl[m]).filter(([k]) => k !== "Não é da UBY (devolver)").reduce((a, [, v]) => a + v, 0))}</strong></td></tr>`).join("")}
          </tbody></table></div>
          ${inMonth.length ? `<details style="margin-top:10px" ${inMonth.some(t => srcOf(t) === "Outras entradas") ? "open" : ""}><summary style="cursor:pointer;font-weight:800;font-size:12px">Entradas de ${esc(UBY.state.api?.monthName?.(mk) || mk)} (${inMonth.length}) · corrigir a origem</summary>
            <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Data</th><th>Descrição no extrato</th><th class="num">Valor</th><th>Origem</th></tr></thead><tbody>
              ${inMonth.map(t => `<tr><td>${fmtDay(t.date)}</td><td>${esc(t.description)}<small>${esc(t.type || "")}</small></td><td class="num"><strong>${fmt.brl(t.amount)}</strong></td>
                <td><select class="select" data-bank-src="${esc(t.id)}" ${can}>${SRCS.map(x => `<option ${srcOf(t) === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>${(bs.p.links || {})[t.id]?.source ? ' <small class="badge neutral">corrigida à mão</small>' : ""}</td></tr>`).join("")}
            </tbody></table></div></details>` : ""}
          <p class="source-line">Spott e Move repassam o faturamento das recargas; "Cartão (vendas)" são vendas no crédito que caem na conta. Os repasses chegam depois do mês das recargas, então comparar com o faturamento pede o mês seguinte.</p>` : ""}
      </section>`;
  }
  // Baixa (ou reabertura) de uma conta, pelo tipo: custo da matriz, fatura de energia ou repasse à área.
  async function setBillPaid(w, b, date, opts = {}) {
    if (b.kind === "matriz") {
      await resyncMatrix(w);
      const list = w.loadMatrizCosts();
      const item = list.find(i => i.id === b.costId);
      if (!item) throw new Error("Custo não encontrado na matriz. Nada foi gravado.");
      const now = new Date().toISOString();
      const paidAmount = opts.amount !== undefined && Math.abs(Number(opts.amount) - Number(opts.due ?? b.dueAmount ?? b.amount)) > 0.009 ? Math.round(Number(opts.amount) * 100) / 100 : undefined;
      item.paymentLedger = { ...(item.paymentLedger || {}), [b.monthKey]: date ? { status: "paid", paidAt: `${date}T12:00:00`, updatedAt: now, ...(paidAmount !== undefined ? { amount: paidAmount } : {}) } : { status: "pending", paidAt: "", updatedAt: now } };
      item.updatedAt = now;
      w.saveMatrizCosts(list);
      return await awaitMatrixSave(w);
    }
    if (b.kind === "energia") {
      const f = b.part === "copel" ? "paidAt" : "leasePaidAt";
      let found = false;
      await saveChargerField(w, b.workId, b.station, b.workName, "energyInvoices", cur => (cur || []).map(i => { if (i.id !== b.invoiceId) return i; found = true; return { ...i, [f]: date || "" }; }));
      if (!found) throw new Error("Fatura não encontrada na nuvem.");
      return "salvo";
    }
    if (b.kind === "area") {
      const mk = b.competence;
      await saveChargerField(w, b.workId, b.station, b.workName, "areaAccount", cur => {
        const c = { ...(cur || {}) }, paid = { ...(c.paid || {}) }, paidInfo = { ...(c.paidInfo || {}) };
        if (date) {
          paid[mk] = date;
          if (opts.amount !== undefined) { const due = Number(opts.due); const diff = Math.round((due - opts.amount) * 100) / 100; paidInfo[mk] = { amount: opts.amount, due, diff, diffMode: opts.diffMode === "drop" ? "drop" : "next" }; }
        } else { delete paid[mk]; delete paidInfo[mk]; }
        return { ...c, paid, paidInfo };
      });
      return "salvo";
    }
    throw new Error("Tipo de conta desconhecido.");
  }

  // ---------- operação: quem entra na UBY, potência, horários e cortesia ----------
  const DAYS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]];
  function checkPending(w) {
    const st = txt(w.document.getElementById("storageState"));
    if (/pendente/i.test(st)) throw new Error(`Não gravou na nuvem: ${st}`);
    return st;
  }
  function operationTab(w, embedded = false) {
    const rows = w.getUbyChargerRows(w.getGeneralUnitData());
    const key = r => `${r.workId}|${r.station}`;
    const sel = rows.find(r => key(r) === ui.opCharger) || null;
    if (sel && !ui.opForm) {
      const c = w.stationAvailabilityFor(sel.workId, sel.station, sel.workName);
      ui.opForm = { ...c, courtesyUsersText: (c.courtesyUsers || []).join("\n"), openDays: (c.openDays || [0, 1, 2, 3, 4, 5, 6]).map(String),
        dayHours: Object.fromEntries(Object.entries(c.dayHours || {}).map(([d, r]) => [String(d), { ...r }])) };
    }
    const f = ui.opForm || {};
    const can = canWrite(w) && !busy ? "" : "disabled";
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-of="${k}" type="${type}" value="${esc(f[k] ?? "")}" ${extra} style="width:100%">`);
    const works = [...new Set(rows.map(r => String(r.workId)))];
    if (embedded && !sel) return `<div class="note">Carregador não encontrado na lista de operação.</div>`;
    const head = embedded ? `<div class="toolbar">
        <label><input type="checkbox" data-op-toggle="${esc(`${sel.workId}|${sel.key}|${sel.station}`)}" ${sel.included ? "checked" : ""} ${can}> Na operação UBY (resultado, rateio da matriz e cotistas)</label>
        <label>Potência do local <input class="select" type="number" min="1" max="360" step="0.1" data-op-power="${esc(`${sel.workId}|${sel.station}`)}" value="${esc(w.workPowerById(sel.workId))}" style="width:90px" ${can}> kW</label>
        <span class="spacer"></span><small>${esc(sel.ruleSource || "")} · a potência vale para o local inteiro</small></div>` : "";
    if (embedded) return head + cfgBlock();
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Operação UBY</p><h2>Carregadores, inclusão e potência do local</h2>
          <p>Marque quem entra na operação UBY (resultado, rateio da matriz e cotistas). A potência é do local inteiro (ex.: 2 × 7 kW = 14 kW) e vale para ocupação e rateio por potência.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Carregador</th><th>Tipo</th><th>Regra atual</th><th>Na operação UBY</th><th class="num">Potência do local</th><th></th></tr></thead>
          <tbody>${rows.map(r => `<tr class="${r.included ? "" : "muted"}"><td><strong>${esc(r.station)}</strong><small>${esc(r.workName)}</small></td>
            <td><span class="badge ${r.kind === "ac" ? "ac" : "dc"}">${esc(String(r.kind || "").toUpperCase() || "—")}</span></td><td><small>${esc(r.ruleSource || "")}</small></td>
            <td><input type="checkbox" data-op-toggle="${esc(`${r.workId}|${r.key}|${r.station}`)}" ${r.included ? "checked" : ""} ${can}></td>
            <td class="num"><input class="select" type="number" min="1" max="360" step="0.1" data-op-power="${esc(`${r.workId}|${r.station}`)}" value="${esc(w.workPowerById(r.workId))}" style="width:90px" ${can}> kW</td>
            <td><button class="btn ghost" data-op-cfg="${esc(key(r))}" type="button">${ui.opCharger === key(r) ? "Editando ▾" : "Horários e cortesia"}</button></td></tr>`).join("")}</tbody></table></div>
        <p class="source-line">${works.length} local(is). A potência é salva por local: alterar num carregador altera todos do mesmo local.</p>
      </section>
      ${sel ? cfgBlock() : ""}`;
    function cfgBlock() {
      return `<section class="section"><div class="section-head"><div><p class="kicker">Configuração do carregador</p><h2>${esc(sel.station)}</h2><p>${esc(sel.workName)} · horários de funcionamento (base da ocupação), início da operação, conectores e cortesias.</p></div></div>
        <div class="grid g4" style="gap:8px">
          ${inp("plantName", "Nome de exibição")}${inp("operationStart", "Início da operação", "date")}
          ${inp("acChargers", "Carregadores AC", "number", 'min="0"')}${inp("acPlugs", "Conectores AC", "number", 'min="0"')}
          ${inp("dcChargers", "Carregadores DC", "number", 'min="0"')}${inp("dcPlugs", "Conectores DC", "number", 'min="0"')}
          ${field("Funcionamento", `<select class="select" data-of="open24h"><option value="1" ${f.open24h !== false ? "selected" : ""}>24 horas</option><option value="0" ${f.open24h === false ? "selected" : ""}>Horário definido</option></select>`)}
          ${f.open24h === false ? inp("openTime", "Abre às", "time") + inp("closeTime", "Fecha às", "time") : ""}
          ${inp("referenceTariffPerKwh", "Tarifa de referência (R$/kWh)", "number", 'min="0" step="0.01"')}
          ${field("Cortesias", `<select class="select" data-of="courtesyTreatment">${[["operational", "Operacional (custo da operação)"], ["partner_absorbed", "Absorvida pelo parceiro"], ["uby_absorbed", "Absorvida pela UBY"]].map(([v, l]) => `<option value="${v}" ${f.courtesyTreatment === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
          ${inp("courtesyResponsible", "Responsável pelas cortesias")}
        </div>
        <p style="margin:10px 0 4px;font-size:11px;font-weight:800">Dias de funcionamento</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${DAYS.map(([v, l]) => `<label style="display:flex;gap:4px;align-items:center;font-size:12px"><input type="checkbox" data-of-day="${v}" ${(f.openDays || []).includes(v) ? "checked" : ""}>${l}</label>`).join("")}</div>
        ${(() => { const closed = DAYS.filter(([v]) => !(f.openDays || []).includes(v)).map(([, l]) => l); return closed.length ? `<div class="note" id="pmOpClosedDays" style="margin-top:8px;border-color:var(--uby-red)"><strong>Fechado em: ${esc(closed.join(", "))}.</strong> Nesses dias o carregador conta como fechado: 0 hora disponível e ocupação zerada, mesmo que tenha recarga. Para um dia com horário diferente (ex.: domingo), deixe o dia marcado e use "Horário próprio" abaixo.</div>` : ""; })()}
        <p style="margin:12px 0 4px;font-size:11px;font-weight:800">Horário por dia da semana</p>
        <p class="source-line" style="margin:0 0 6px">Marque "Horário próprio" no dia que funciona diferente do horário geral (ex.: domingo das 10:00 às 18:00). Os demais dias seguem o horário geral acima.</p>
        <div class="table-wrap"><table><thead><tr><th>Dia</th><th>Horário próprio</th><th>Funcionamento</th><th>Abre</th><th>Fecha</th></tr></thead><tbody>
          ${DAYS.filter(([v]) => (f.openDays || []).includes(v)).map(([v, l]) => { const r = (f.dayHours || {})[v]; return `<tr>
            <td><strong>${l}</strong></td>
            <td><input type="checkbox" data-dh-on="${v}" ${r ? "checked" : ""}></td>
            <td>${r ? `<select class="select" data-dh="${v}|open24h"><option value="0" ${r.open24h === true ? "" : "selected"}>Horário definido</option><option value="1" ${r.open24h === true ? "selected" : ""}>24 horas</option></select>` : `<small>${f.open24h === false ? `${esc(f.openTime || "08:00")} às ${esc(f.closeTime || "22:00")}` : "24 horas"} (geral)</small>`}</td>
            <td>${r && r.open24h !== true ? `<input class="select" type="time" data-dh="${v}|openTime" value="${esc(r.openTime || "08:00")}">` : ""}</td>
            <td>${r && r.open24h !== true ? `<input class="select" type="time" data-dh="${v}|closeTime" value="${esc(r.closeTime || "22:00")}">` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>
        ${field("Usuários de cortesia (um por linha: e-mail, nome ou telefone)", `<textarea class="select" data-of="courtesyUsersText" rows="4" style="width:100%;height:auto;padding:8px">${esc(f.courtesyUsersText || "")}</textarea>`)}
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="pmOpSave" type="button" ${can}>Salvar horários e cortesia</button>${embedded ? "" : `<button class="btn" id="pmOpCancel" type="button">Fechar</button>`}</div>
      </section>`;
    }
  }

  // ---------- documentos financeiros (NF, boletos, faturas) ----------
  function docsTab(w, data, embedded = null) {
    const mk = ui.docMonth;
    const costs = w.loadMatrizCosts().filter(c => c.enabled !== false);
    const rows = w.getUbyChargerRows(w.getGeneralUnitData()).filter(r => r.included);
    const df = ui.docForm || (ui.docForm = { link: "", documentType: "boleto", supplier: "", category: "Outros custos", documentNumber: "", amount: "", dueDate: "", status: "pending", installmentNumber: "", installmentTotal: "", notes: "" });
    const can = canWrite(w) && !busy ? "" : "disabled";
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-df="${k}" type="${type}" value="${esc(df[k] ?? "")}" ${extra} style="width:100%">`);
    if (embedded) { ui.docMonth = ui.month; if (ui.docForm.link !== `work|${embedded.workId}`) ui.docForm = { ...df, link: `work|${embedded.workId}` }; }
    const docs = (embedded ? data.cdocs : data.docs) || [];
    const total = docs.reduce((s, d) => s + Number(d.amount || 0), 0);
    const paid = docs.filter(d => d.status === "paid").reduce((s, d) => s + Number(d.amount || 0), 0);
    if (embedded) {
      const d0 = ui.docForm;
      const einp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-df="${k}" type="${type}" value="${esc(d0[k] ?? "")}" ${extra} style="width:100%">`);
      return `${data.docsError ? `<div class="note">Não consegui ler os documentos: ${esc(data.docsError)}</div>` : ""}
        <div class="table-wrap" style="max-height:360px"><table><thead><tr><th>Competência</th><th>Fornecedor</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${docs.map(d => `<tr><td>${esc(UBY.state.api?.monthName?.(d.competence_key) || d.competence_key || "—")}</td>
            <td><strong>${esc(d.supplier || "Documento")}</strong><small>${esc([d.document_type, d.category, d.document_number, d.installment_number ? `parcela ${d.installment_number}${d.installment_total ? "/" + d.installment_total : ""}` : ""].filter(Boolean).join(" · "))}</small></td>
            <td>${d.due_date ? fmt.date(d.due_date + "T12:00:00") : "—"}</td><td class="num">${fmt.brl(d.amount)}</td>
            <td><span class="badge ${d.status === "paid" ? "ok" : d.status === "cancelled" ? "neutral" : "warn"}">${d.status === "paid" ? "Pago" : d.status === "cancelled" ? "Cancelado" : "Pendente"}</span></td>
            <td style="white-space:nowrap">${d.storage_path ? `<button class="btn ghost" data-doc-open="${esc(d.id)}" type="button">Abrir</button>` : "<small>sem arquivo</small>"}<button class="btn ghost" data-doc-del="${esc(d.id)}" type="button" style="color:var(--uby-red)" ${can}>Excluir</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum documento deste carregador.</td></tr>`}</tbody></table></div>
        <details class="section" style="margin-top:12px" ${ui.docOpen || ui.docCopel ? "open" : ""} id="ccDocBox"><summary style="cursor:pointer;font-weight:850;color:var(--uby-forest)">＋ Anexar NF, boleto, fatura ou contrato deste carregador (competência ${esc(UBY.state.api?.monthName?.(ui.month) || ui.month)})</summary>
          <div class="grid g4" style="gap:8px;margin-top:10px">
            ${field("Tipo", `<select class="select" data-df="documentType">${[["boleto", "Boleto"], ["nota_fiscal", "Nota fiscal"], ["fatura", "Fatura"], ["recibo", "Recibo"], ["contrato", "Contrato"], ["outro", "Outro"]].map(([v, l]) => `<option value="${v}" ${d0.documentType === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
            ${einp("supplier", "Fornecedor")}${einp("category", "Categoria")}${einp("documentNumber", "Número do documento")}
            ${einp("amount", "Valor (R$)", "number", 'min="0" step="0.01"')}${einp("dueDate", "Vencimento", "date")}
            ${field("Situação", `<select class="select" data-df="status"><option value="pending" ${d0.status === "pending" ? "selected" : ""}>Pendente</option><option value="paid" ${d0.status === "paid" ? "selected" : ""}>Pago</option><option value="cancelled" ${d0.status === "cancelled" ? "selected" : ""}>Cancelado</option></select>`)}
            ${einp("notes", "Observações")}
          </div>
          ${field("Arquivo (PDF, JPG, PNG ou WEBP até 15 MB · fica privado)", `<input class="select" id="pmDocFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style="width:100%;padding-top:6px">`)}
          ${ui.docCopel ? `<div class="note" style="margin-top:8px;border-color:var(--uby-green, #1f9d55)"><strong>É uma fatura da Copel</strong><br>${esc(ui.docCopel.summary)}<br><button class="btn primary" id="pmDocToEnergy" type="button" style="margin-top:8px">Lançar nas faturas de energia ↑</button> <small>ou salve aqui só como documento.</small></div>` : ""}
          <button class="btn primary" id="pmDocSave" type="button" style="margin-top:12px" ${can}>Salvar documento</button>
        </details>`;
    }
    return `
      <div class="toolbar"><label>Competência <select class="select" id="pmDocMonth">${data.months.slice().reverse().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${esc(UBY.state.api?.monthName?.(m) || m)}</option>`).join("")}</select></label>
        <span class="spacer"></span><small>${docs.length} documento(s) · ${fmt.brl(total)} · pagos ${fmt.brl(paid)}</small></div>
      ${data.docsError ? `<div class="note">Não consegui ler os documentos: ${esc(data.docsError)}</div>` : ""}
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Caixa</p><h2>Documentos da competência</h2></div></div>
          <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>Fornecedor</th><th>Vínculo</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
            <tbody>${docs.map(d => { const cost = costs.find(c => c.id === d.matrix_cost_id); const row = rows.find(r => String(r.workId) === String(d.work_id)); return `<tr>
              <td><strong>${esc(d.supplier || "Documento")}</strong><small>${esc([d.document_type, d.category, d.document_number, d.installment_number ? `parcela ${d.installment_number}${d.installment_total ? "/" + d.installment_total : ""}` : ""].filter(Boolean).join(" · "))}</small></td>
              <td><small>${esc(cost ? `Matriz · ${cost.name}` : row ? `Carregador · ${row.station}` : d.scope === "matrix" ? "Matriz UBY" : "—")}</small></td>
              <td>${d.due_date ? fmt.date(d.due_date + "T12:00:00") : "—"}</td><td class="num">${fmt.brl(d.amount)}</td>
              <td><span class="badge ${d.status === "paid" ? "ok" : d.status === "cancelled" ? "neutral" : "warn"}">${d.status === "paid" ? "Pago" : d.status === "cancelled" ? "Cancelado" : "Pendente"}</span></td>
              <td style="white-space:nowrap">${d.storage_path ? `<button class="btn ghost" data-doc-open="${esc(d.id)}" type="button">Abrir</button>` : "<small>sem arquivo</small>"}<button class="btn ghost" data-doc-del="${esc(d.id)}" type="button" style="color:var(--uby-red)" ${can}>Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">Nenhum documento nesta competência.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Novo documento</p><h2>Anexar NF, boleto ou fatura</h2><p>PDF, JPG, PNG ou WEBP de até 15 MB. O arquivo fica privado e só abre para quem está logado.</p></div></div>
          <div class="grid g2" style="gap:8px">
            ${field("Vínculo", `<select class="select" data-df="link"><option value="">Matriz UBY (geral)</option><optgroup label="Custos da matriz">${costs.map(c => `<option value="cost|${esc(c.id)}" ${df.link === `cost|${c.id}` ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup><optgroup label="Carregadores">${rows.map(r => `<option value="work|${esc(r.workId)}" ${df.link === `work|${r.workId}` ? "selected" : ""}>${esc(r.station)}</option>`).join("")}</optgroup></select>`)}
            ${field("Tipo", `<select class="select" data-df="documentType">${[["boleto", "Boleto"], ["nota_fiscal", "Nota fiscal"], ["fatura", "Fatura"], ["recibo", "Recibo"], ["contrato", "Contrato"], ["outro", "Outro"]].map(([v, l]) => `<option value="${v}" ${df.documentType === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
            ${inp("supplier", "Fornecedor")}${inp("category", "Categoria")}
            ${inp("documentNumber", "Número do documento")}${inp("amount", "Valor (R$)", "number", 'min="0" step="0.01"')}
            ${inp("dueDate", "Vencimento", "date")}
            ${field("Situação", `<select class="select" data-df="status"><option value="pending" ${df.status === "pending" ? "selected" : ""}>Pendente</option><option value="paid" ${df.status === "paid" ? "selected" : ""}>Pago</option><option value="cancelled" ${df.status === "cancelled" ? "selected" : ""}>Cancelado</option></select>`)}
            ${inp("installmentNumber", "Parcela nº (opcional)", "number", 'min="1"')}${inp("installmentTotal", "de (total de parcelas)", "number", 'min="1"')}
          </div>
          ${inp("notes", "Observações")}
          ${field("Arquivo", `<input class="select" id="pmDocFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style="width:100%;padding-top:6px">`)}
          ${ui.docCopel ? `<div class="note" style="margin-top:8px;border-color:var(--uby-green, #1f9d55)"><strong>É uma fatura da Copel</strong><br>${esc(ui.docCopel.summary)}<br><button class="btn primary" id="pmDocToEnergy" type="button" style="margin-top:8px">Lançar em Faturas de energia →</button> <small>ou salve aqui só como documento.</small></div>` : ""}
          <button class="btn primary" id="pmDocSave" type="button" style="margin-top:12px" ${can}>Salvar documento</button>
        </section>
      </div>`;
  }

  // ---------- faturas de energia por período de leitura ----------
  // Cada fatura (Copel + arrendamento) é lançada com as datas de leitura. O motor
  // divide kWh e valor pelos meses de consumo, na proporção da energia entregue
  // pelo carregador em cada dia; dias sem fatura entram como estimativa marcada.
  const fmtDay = d => d ? fmt.date(`${d}T12:00:00`) : "—";
  const addDay = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function blankInvoice(prev) {
    const start = prev?.end || "";
    return { id: "", ref: "", start, end: "", readingStart: prev?.readingEnd ?? "", readingEnd: "", multiplier: prev?.multiplier || 40, kwh: "", copelAmount: "", leaseAmount: "", leaseKWh: "", leaseRate: "", dueDate: "", leaseDueDate: "", paidAt: "", leasePaidAt: "", notes: "" };
  }
  const leaseOf = i => Number(i.leaseAmount) > 0 ? Math.round(Number(i.leaseAmount) * 100) / 100 : Math.round((Number(i.leaseKWh) || 0) * (Number(i.leaseRate) || 0) * 100) / 100;
  function cleanInvoice(f) {
    const n = v => (v === "" || v === null || v === undefined ? "" : Number(v));
    const kwh = n(f.kwh) !== "" ? Number(f.kwh) : (n(f.readingEnd) !== "" && n(f.readingStart) !== "" ? (Number(f.readingEnd) - Number(f.readingStart)) * (Number(f.multiplier) || 1) : 0);
    return { id: f.id || `energia-${f.ref || f.start}-${Date.now().toString(36)}`, ref: f.ref || "", start: f.start, end: f.end,
      readingStart: n(f.readingStart), readingEnd: n(f.readingEnd), multiplier: Number(f.multiplier) || 1, kwh: Math.max(0, kwh),
      copelAmount: Math.round((Number(f.copelAmount) || 0) * 100) / 100, leaseAmount: Math.round((Number(f.leaseAmount) || 0) * 100) / 100, leaseKWh: Number(f.leaseKWh) || 0, leaseRate: Number(f.leaseRate) || 0,
      dueDate: f.dueDate || "", leaseDueDate: f.leaseDueDate || "", paidAt: f.paidAt || "", leasePaidAt: f.leasePaidAt || "", notes: f.notes || "",
      chargerMeterKWh: Number(f.chargerMeterKWh) || 0,
      uc: f.uc || "", meter: f.meter || "", nfNumber: f.nfNumber || "", documentId: f.documentId || "" };
  }
  // Medidor da Copel × kWh vendido no período de leitura de cada fatura. O medidor mede a entrada e a venda é o
  // que chegou no carro: parte da diferença é perda do próprio carregador. Com o medidor do carregador lançado,
  // separa o que é consumo do local (cobrável) da perda do carregador.
  function meterDiffSection(rows, api) {
    const list = rows.filter(i => i.deliveredKWh > 0 && i.kwh > 0).sort((a, b) => String(b.start).localeCompare(String(a.start)));
    if (!list.length) return "";
    const sum = k => list.reduce((s, i) => s + (Number(i[k]) || 0), 0);
    const totK = sum("kwh"), totDiff = sum("diffKWh");
    return `<section class="section"><div class="section-head"><div><p class="kicker">Conferência</p><h2>Medidor × kWh vendido</h2>
        <p>Quanto a Copel mediu a mais do que o carregador vendeu no mesmo período, e quanto isso custou pelo custo médio do kWh medido. Lance o medidor do carregador na fatura para separar o consumo do local (cobrável) da perda do carregador.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Fatura</th><th class="num">Medidor Copel</th><th class="num">Vendido</th><th class="num">Diferença</th><th class="num">%</th><th class="num">Custo da diferença</th><th class="num">Medidor do carregador</th><th class="num">Consumo do local</th><th class="num">Perda do carregador</th></tr></thead>
        <tbody>${list.map(i => `<tr><td><strong>${esc(i.ref ? (api.monthName?.(i.ref) || i.ref) : "—")}</strong><small>${fmtDay(i.start)} a ${fmtDay(addDay(i.end, -1))}</small></td>
          <td class="num">${fmt.int(i.kwh)}</td><td class="num">${fmt.int(i.deliveredKWh)}</td><td class="num"><strong>${fmt.int(i.diffKWh)}</strong></td><td class="num">${fmt.pct1(i.diffPct)}</td><td class="num">${fmt.brl(i.diffCost)}</td>
          ${i.chargerMeterKWh > 0 ? `<td class="num">${fmt.int(i.chargerMeterKWh)}</td><td class="num"><strong>${fmt.int(i.outsideKWh)}</strong><small>${fmt.brl(i.outsideCost)}</small></td><td class="num">${fmt.int(i.chargerLossKWh)}<small>${fmt.pct1(i.chargerLossPct)}</small></td>` : `<td class="num" colspan="3" style="color:var(--uby-muted)">sem medidor do carregador</td>`}</tr>`).join("")}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${fmt.int(totK)}</td><td class="num">${fmt.int(sum("deliveredKWh"))}</td><td class="num">${fmt.int(totDiff)}</td><td class="num">${fmt.pct1(totK > 0 ? totDiff / totK * 100 : 0)}</td><td class="num">${fmt.brl(sum("diffCost"))}</td><td colspan="3"></td></tr></tfoot></table></div>
    </section>`;
  }
  // Fatura lida do PDF da Copel → formulário. Acha o carregador pela unidade
  // consumidora (UC) de faturas já lançadas; se a referência já existe, edita ela.
  function applyCopelRead(res, file, chargers) {
    const f = res.fields;
    const api = UBY.state.api;
    const all = chargers.map(c => ({ c, list: (() => { try { return api.energyInvoices(c.workId, c.station)?.stored || []; } catch (_) { return []; } })() }));
    const byUc = f.uc ? all.find(x => x.list.some(i => String(i.uc || "") === f.uc)) : null;
    if (byUc && byUc.c.key !== ui.enCharger && !ui.enDraft) { ui.enCharger = byUc.c.key; }
    const [wid, st] = (ui.enCharger || "|").split("|");
    const cur = ui.enDraft || (api.energyInvoices(wid, st)?.stored || []);
    const same = cur.find(i => i.ref === f.ref && (!i.uc || !f.uc || String(i.uc) === f.uc));
    const leased = cur.filter(i => Number(i.leaseAmount) > 0 && Number(i.leaseKWh) > 0).sort((a, b) => String(a.end).localeCompare(String(b.end)));
    const prevLease = leased.filter(i => i !== same).pop() || leased.pop();
    const rate = prevLease ? Number(prevLease.leaseAmount) / Number(prevLease.leaseKWh) : 0;
    const suggestedLease = f.compensatedKWh > 0 && rate > 0 ? Math.round(f.compensatedKWh * rate * 100) / 100 : "";
    // Reler a fatura mantém o arrendamento já lançado, salvo se ele foi calculado sobre outros kWh compensados.
    const keepLease = same && Number(same.leaseAmount) > 0 && !(f.compensatedKWh > 0 && suggestedLease !== "" && Number(same.leaseKWh) > 0 && Number(same.leaseKWh) !== f.compensatedKWh);
    const kwhTxt = v => Number(v).toLocaleString("pt-BR");
    const moneyTxt = v => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lines = f.compensatedLines || [];
    ui.enForm = {
      ...(same || blankInvoice()), id: same?.id || "",
      ref: f.ref, kwh: f.kwh, copelAmount: f.copelAmount, start: f.start, end: f.end, dueDate: f.dueDate,
      readingStart: f.readingStart ?? "", readingEnd: f.readingEnd ?? "", multiplier: f.multiplier || 40, leaseKWh: f.compensatedKWh || 0,
      leaseAmount: keepLease ? same.leaseAmount : suggestedLease,
      uc: f.uc || "", meter: f.meter || "", nfNumber: f.nfNumber || "", documentId: same?.documentId || ""
    };
    ui.enPendingFile = file || null;
    ui.enRead = {
      ok: true, file: file?.name || "",
      msg: `Fatura ${f.ref.slice(5)}/${f.ref.slice(0, 4)} · UC ${f.uc} · leitura ${f.start.split("-").reverse().join("/")} a ${f.end.split("-").reverse().join("/")} (${f.days} dias) · ${f.kwh} kWh · Copel R$ ${f.copelAmount.toFixed(2).replace(".", ",")} · vence ${f.dueDate.split("-").reverse().join("/")}${f.compensatedKWh ? ` · ${kwhTxt(f.compensatedKWh)} kWh compensados${lines.length > 1 ? ` (${lines.map(l => `${kwhTxt(l.kwh)} de ${l.period}`).join(" + ")})` : ""}${f.uncompensatedKWh ? ` · ${kwhTxt(f.uncompensatedKWh)} kWh sem compensar` : ""}` : " · sem compensação"}${f.creditBalance ? ` · saldo de créditos ${kwhTxt(f.creditBalance)} kWh` : ""}`,
      notes: [same ? "Esta referência já estava lançada: os campos foram atualizados com o PDF (confira e clique em Atualizar na lista)." : "",
        byUc && byUc.c.key === ui.enCharger ? `Carregador identificado pela UC: ${byUc.c.station}.` : f.uc ? "UC ainda não vinculada: confira se o carregador selecionado é o certo." : "",
        f.compensatedKWh ? (keepLease ? `Arrendamento mantido como estava: R$ ${moneyTxt(same.leaseAmount)}.` : suggestedLease !== "" ? `Arrendamento sugerido: ${kwhTxt(f.compensatedKWh)} kWh × R$ ${rate.toFixed(4).replace(".", ",")} (tarifa da última fatura) = R$ ${moneyTxt(suggestedLease)}${same && Number(same.leaseAmount) > 0 ? ` (estava R$ ${moneyTxt(same.leaseAmount)}, sobre ${kwhTxt(same.leaseKWh)} kWh)` : ""} — confira com o boleto do arrendamento.` : "Informe o valor do arrendamento (não vem na fatura da Copel).") : "",
        ...(res.warnings || [])].filter(Boolean)
    };
  }
  function invoiceProblems(inv, list) {
    const out = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inv.start) || !/^\d{4}-\d{2}-\d{2}$/.test(inv.end)) out.push("informe a leitura anterior e a leitura atual (datas)");
    else if (inv.end <= inv.start) out.push("a data da leitura atual precisa ser depois da anterior");
    if (!(inv.kwh > 0)) out.push("kWh consumido da fatura");
    if (!(inv.copelAmount > 0) && !(leaseOf(inv) > 0)) out.push("valor da Copel ou do arrendamento");
    const clash = list.find(o => o.id !== inv.id && o.start < inv.end && inv.start < o.end);
    if (clash) out.push(`período sobreposto à fatura ${clash.ref || clash.start}`);
    return out;
  }
  function energyTab(w, data, embedded = false) {
    const api = UBY.state.api;
    if (!api || typeof api.energyInvoices !== "function") return `<div class="note">O motor está recarregando. Abra esta aba de novo em alguns segundos.</div>`;
    const list = data.chargers.filter(c => c.included || c.model);
    if (!ui.enCharger) {
      const withInv = list.find(c => { try { return (api.energyInvoices(c.workId, c.station)?.stored || []).length; } catch (_) { return false; } });
      ui.enCharger = (withInv || list.find(c => c.included && ["uby", "hybrid"].includes(c.model)) || list[0] || {}).key || "";
    }
    const [workId, station] = (ui.enCharger || "|").split("|");
    let info = null;
    try { info = api.energyInvoices(workId, station, ui.enDraft || undefined); } catch (err) { return `<div class="note">Não consegui calcular: ${esc(err.message)}</div>`; }
    if (!info) return `<div class="note">Carregador não encontrado no motor.</div>`;
    const draft = ui.enDraft || info.stored;
    const dirty = !!ui.enDraft;
    // Link de Pagamentos (#/parametros/energia/<carregador>/inv:<id>): abre a fatura já em edição.
    if (ui.enEditId) { const it = draft.find(i => i.id === ui.enEditId); if (it) ui.enForm = { ...it }; else if (ui.enEditId === "new") ui.enForm = null; ui.enEditId = ""; }
    const f = ui.enForm || (ui.enForm = blankInvoice(draft.slice().sort((a, b) => String(a.end).localeCompare(String(b.end))).pop()));
    const preview = cleanInvoice(f);
    const can = canWrite(w) && !busy ? "" : "disabled";
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-ef="${k}" type="${type}" value="${esc(f[k] ?? "")}" ${extra} style="width:100%">`);
    const byId = new Map(info.invoices.map(i => [i.id, i]));
    const months = Object.keys(info.months).sort().reverse();
    const groups = [["Operação UBY", c => c.included && ["uby", "hybrid"].includes(c.model)], ["Parceiros", c => c.included && c.model === "third_party_management"], ["Só gestão P3", c => c.included && ["management_only", "p3_society"].includes(c.model)], ["Fora da operação UBY", c => !c.included]];
    return `
      <div class="toolbar">
        ${embedded ? `<strong style="font-size:12.5px">Faturas de energia deste carregador</strong>` : `<select class="select" id="pmEnCharger" style="min-width:280px">${groups.map(([label, test]) => { const g = list.filter(test); return g.length ? `<optgroup label="${esc(label)}">${g.map(c => `<option value="${esc(c.key)}" ${c.key === ui.enCharger ? "selected" : ""}>${esc(c.station)} · ${esc(c.workName)}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>`}
        <span class="spacer"></span>
        ${dirty ? `<button class="btn" id="pmEnDiscard" type="button">Descartar</button>` : ""}
        <button class="btn primary" id="pmEnSave" type="button" ${dirty ? can : "disabled"}>Salvar faturas</button>
      </div>
      ${info.fullHistory ? "" : `<div class="note" style="margin-bottom:12px">O histórico completo ainda está carregando: a divisão abaixo pode mudar. Aguarde alguns segundos e troque de aba.</div>`}
      ${dirty ? `<div class="note" style="margin-bottom:12px;border-color:var(--uby-amber)">Alterações ainda não salvas. A divisão por mês abaixo já mostra como vai ficar.</div>` : ""}
      ${embedded ? `<details class="note" style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:760">Como a energia entra no resultado</summary><p style="margin:8px 0 0">Lance cada fatura com o mês dela e as datas das leituras. O custo — Copel + arrendamento — entra <strong>inteiro no mês da fatura</strong> e o pagamento aparece em Contas a pagar no mês do vencimento. Mês com recargas e sem fatura entra como <strong>estimativa</strong> (kWh entregues × custo médio por kWh da fatura anterior, separado em Copel e arrendamento) até a fatura ser lançada.</p></details>` : ""}
      <section class="section"><div class="section-head"><div><p class="kicker">${embedded ? "Faturas lançadas" : "Como funciona"}</p><h2>${embedded ? "Copel e arrendamento" : "Cada fatura no mês dela"}</h2>
          ${embedded ? "" : `<p>Lance cada fatura com o mês dela e as datas da leitura anterior e da atual (o dia da leitura atual já pertence à próxima fatura). O custo — Copel + arrendamento — entra <strong>inteiro no mês da fatura</strong> (ex.: fatura Ago/2026 = custo de agosto) e o pagamento aparece no mês do vencimento (normalmente o seguinte). Mês com recargas e sem fatura lançada entra como <strong>estimativa</strong>: kWh entregues no mês × custo médio por kWh da fatura do mês anterior, separado em Copel e arrendamento, até a fatura do mês ser lançada. O vencimento aparece em Pagamentos no mês em que vence. Com faturas lançadas, os campos de energia por competência deste carregador deixam de ser usados pelo motor.</p>`}</div></div>
        <div class="table-wrap"><table><thead><tr><th>Fatura</th><th>Período de leitura</th><th class="num">kWh medidor</th><th class="num">kWh entregue</th><th class="num">Copel</th><th class="num">Arrendamento</th><th class="num">Total</th><th class="num">R$/kWh entregue</th><th>Vencimento</th><th></th></tr></thead>
          <tbody>${draft.slice().sort((a, b) => String(b.start).localeCompare(String(a.start))).map(i => { const c = byId.get(i.id) || {}; const lease = leaseOf(i); return `<tr>
            <td><strong>${esc(i.ref ? (api.monthName?.(i.ref) || i.ref) : "—")}</strong>${i.notes ? `<small>${esc(i.notes)}</small>` : ""}</td>
            <td>${fmtDay(i.start)} → ${fmtDay(i.end)}<small>${c.days || "—"} dia(s)${i.readingStart !== "" && i.readingEnd !== "" ? ` · leitura ${esc(i.readingStart)} → ${esc(i.readingEnd)} × ${esc(i.multiplier)}` : ""}</small></td>
            <td class="num">${fmt.int(i.kwh)}</td><td class="num">${c.deliveredKWh !== undefined ? fmt.int(c.deliveredKWh) : "—"}<small>${c.deliveredKWh > 0 ? `dif. ${fmt.pct1(c.diffPct)} do medidor` : ""}</small></td>
            <td class="num">${fmt.brl(i.copelAmount)}</td><td class="num">${lease ? `${fmt.brl(lease)}${i.kwh > 0 ? `<small>${fmt.brl(lease / i.kwh)}/kWh medido</small>` : ""}` : "—"}</td>
            <td class="num"><strong>${fmt.brl((Number(i.copelAmount) || 0) + lease)}</strong>${i.kwh > 0 ? `<small>${fmt.brl(((Number(i.copelAmount) || 0) + lease) / i.kwh)}/kWh medido</small>` : ""}</td><td class="num">${c.ratePerDelivered ? fmt.brl(c.ratePerDelivered) : "—"}</td>
            <td>${fmtDay(i.dueDate)}<small>${i.paidAt ? `Copel paga ${fmtDay(i.paidAt)}` : "Copel a pagar"}${lease ? ` · arrend. ${i.leasePaidAt ? `pago ${fmtDay(i.leasePaidAt)}` : `a pagar${i.leaseDueDate ? ` ${fmtDay(i.leaseDueDate)}` : ""}`}` : ""}</small></td>
            <td style="white-space:nowrap">${i.documentId ? `<button class="btn ghost" data-doc-open="${esc(i.documentId)}" type="button">PDF</button>` : ui.enFiles?.[i.id] ? `<small class="badge warn">PDF a enviar</small>` : ""}<button class="btn ghost" data-en-edit="${esc(i.id)}" type="button">Editar</button><button class="btn ghost" data-en-del="${esc(i.id)}" type="button" style="color:var(--uby-red)">Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="10" class="empty">Nenhuma fatura lançada para este carregador. Enquanto isso, vale o custo por kWh da competência.</td></tr>`}</tbody></table></div>
      </section>
      ${meterDiffSection(info.invoices, api)}
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Resultado</p><h2>Energia por competência de consumo</h2><p>O que entra no relatório de cada mês.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Competência</th><th>Origem</th><th class="num">kWh medidor</th><th class="num">Copel</th><th class="num">Arrendamento</th><th class="num">Estimativa</th><th class="num">Energia do mês</th></tr></thead>
            <tbody>${months.map(mk => { const m = info.months[mk]; return `<tr>
              <td><strong>${esc(api.monthName?.(mk) || mk)}</strong><small>${fmt.int(info.deliveredByMonth[mk] || 0)} kWh entregues</small></td>
              <td style="white-space:normal">${m.parts.map(p => `<small>fatura ${esc(p.ref ? (api.monthName?.(p.ref) || p.ref) : p.start)}: ${fmtDay(p.from)} a ${fmtDay(p.to)} · ${fmt.pct1(p.share * 100)} · ${fmt.brl(p.total)}</small>`).join("")}${m.estimatedCost ? `<small><span class="badge warn">estimativa</span> ${fmt.int(m.estimatedDeliveredKWh)} kWh entregues × custo médio da fatura ${esc(api.monthName?.(m.estimatedRef) || m.estimatedRef)} (Copel ${fmt.brl(m.estimatedCopelRate || 0)}/kWh${m.estimatedLeaseRate ? ` + arrendamento ${fmt.brl(m.estimatedLeaseRate)}/kWh` : ""}) · ${fmtDay(m.estimatedFrom)} a ${fmtDay(m.estimatedTo)} · até a fatura deste mês ser lançada</small>` : ""}</td>
              <td class="num">${fmt.int(m.kwh + m.estimatedKWh)}</td>
              <td class="num">${fmt.brl(m.copel + (m.estimatedCopel || 0))}${m.estimatedCopel ? "<small>estimado</small>" : ""}</td>
              <td class="num">${fmt.brl(m.lease + (m.estimatedLease || 0))}${m.estimatedLease ? "<small>estimado</small>" : ""}</td>
              <td class="num">${m.estimatedCost ? fmt.brl(m.estimatedCost) : "—"}</td>
              <td class="num"><strong>${fmt.brl(m.cost)}</strong></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">Sem faturas lançadas.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0" data-focus="${f.id ? `inv:${esc(f.id)}` : "inv:new"}"><div class="section-head"><div><p class="kicker">${f.id ? "Editando" : "Nova fatura"}</p><h2>${f.id ? `Fatura ${esc(f.ref || f.start)}` : "Lançar fatura de energia"}</h2><p>Lance o que veio na fatura: kWh consumido, valor da Copel, valor do arrendamento e as datas das leituras (a anterior já vem da última fatura). Médias por kWh e a divisão entre os meses são calculadas pela plataforma.</p></div></div>
          <label class="imp-field" style="display:block;border:1.5px dashed var(--uby-line, #c9d6cf);border-radius:10px;padding:10px 12px;margin-bottom:10px;cursor:pointer">
            <span style="font-size:12px;font-weight:800">📄 Ler fatura da Copel (PDF)</span>
            <small style="display:block;color:var(--uby-muted)">Escolha o PDF baixado do site/app da Copel: datas das leituras, kWh, valor, vencimento e leituras do medidor são preenchidos sozinhos. O PDF fica guardado junto da fatura ao salvar.</small>
            <input id="pmEnPdf" type="file" accept="application/pdf" style="margin-top:6px;width:100%">
          </label>
          ${ui.enRead ? `<div class="note" style="margin-bottom:10px;border-color:${ui.enRead.ok ? "var(--uby-green, #1f9d55)" : "var(--uby-red)"}"><strong>${ui.enRead.ok ? "Lido do PDF" : "Não consegui ler"}${ui.enRead.file ? ` · ${esc(ui.enRead.file)}` : ""}</strong><br>${esc(ui.enRead.msg || ui.enRead.error || "")}${(ui.enRead.notes || []).map(n => `<br>• ${esc(n)}`).join("")}</div>` : ""}
          <div class="grid g2" style="gap:8px">
            ${inp("ref", "Referência da fatura (mês)", "month")}${inp("kwh", `kWh consumido (da fatura)${f.readingStart !== "" && f.readingEnd !== "" && f.kwh === "" ? ` · pelas leituras: ${fmt.int(preview.kwh)}` : ""}`, "number", 'min="0" step="any"')}
            ${inp("copelAmount", "Valor da Copel (R$)", "number", 'min="0" step="0.01"')}${inp("leaseAmount", "Valor do arrendamento (R$)", "number", 'min="0" step="0.01"')}
            ${inp("start", "Leitura anterior em (data)", "date")}${inp("end", "Leitura atual em (data)", "date")}
            ${inp("dueDate", "Vencimento da Copel", "date")}${inp("leaseDueDate", "Vencimento do arrendamento", "date")}
          </div>
          <details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:760">Opcional: leituras do medidor, pagamento e observações</summary>
            <div class="grid g2" style="gap:8px;margin-top:8px">
              ${inp("readingStart", "Leitura anterior (medidor)", "number", 'step="any"')}${inp("readingEnd", "Leitura atual (medidor)", "number", 'step="any"')}
              ${inp("multiplier", "Constante do medidor", "number", 'min="1" step="any"')}${inp("leaseKWh", "kWh compensados (só informativo)", "number", 'min="0" step="any"')}
              ${inp("chargerMeterKWh", "kWh do medidor do carregador no período (quando instalado)", "number", 'min="0" step="any"')}
              ${inp("paidAt", "Copel paga em", "date")}${inp("leasePaidAt", "Arrendamento pago em", "date")}
            </div>
            ${inp("notes", "Observações")}
          </details>
          ${(() => { const tot = preview.copelAmount + leaseOf(preview); return `<p class="source-line">Total desta fatura: <strong>${fmt.brl(tot)}</strong> · ${fmt.int(preview.kwh)} kWh${preview.kwh > 0 && tot > 0 ? ` · média <strong>${fmt.brl(tot / preview.kwh)}/kWh</strong> (Copel ${fmt.brl(preview.copelAmount / preview.kwh)} + arrendamento ${fmt.brl(leaseOf(preview) / preview.kwh)})` : ""}${preview.start && preview.end > preview.start ? ` · consumo de ${fmtDay(preview.start)} a ${fmtDay(addDay(preview.end, -1))}` : ""}</p>`; })()}
          <div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="pmEnApply" type="button">${f.id ? "Atualizar na lista" : "Adicionar à lista"}</button>${f.id ? `<button class="btn" id="pmEnNew" type="button">Nova fatura</button>` : ""}</div>
        </section>
      </div>`;
  }
  // Grava só a lista de faturas do carregador: relê o registro na nuvem, troca
  // energyInvoices daquela estação e mantém todo o resto como está na nuvem.
  async function saveInvoices(w, workId, station, workName, list) {
    await saveChargerField(w, workId, station, workName, "energyInvoices", list);
    return `${list.length} fatura(s) de energia salvas para ${station}`;
  }
  // Grava um campo do carregador (faturas, repasse à área…) relendo a nuvem antes.
  async function saveChargerField(w, workId, station, workName, field, value) {
    const sb = w.UBY_SUPABASE.client();
    const { data: row, error } = await sb.from("obra_recargas_base").select("resumo").eq("obra_id", workId).maybeSingle();
    if (error || !row) throw new Error("Não consegui ler a configuração na nuvem. Nada foi gravado.");
    const fs = JSON.parse(JSON.stringify(row.resumo?.financialSettings || {}));
    const key = w.normalizeStationForCompare(w.canonicalStationNameForWork(workId, station, workName));
    if (!key) throw new Error("Carregador sem identificação. Nada foi gravado.");
    fs.chargers = fs.chargers || {};
    // value pode ser uma função (valor atual na nuvem → novo valor), para alterar só um item.
    fs.chargers[key] = { ...(fs.chargers[key] || {}), [field]: typeof value === "function" ? value(JSON.parse(JSON.stringify(fs.chargers[key]?.[field] ?? null))) : value };
    await w.UBY_SUPABASE.saveRechargeMetadata(workId, { workId, workName, financialSettings: fs });
    // Mantém a cópia em memória da plataforma oculta igual à nuvem, para que um
    // "Salvar competência" depois não grave uma versão sem as faturas.
    w.eval(`(function(fs, id){ const r = allRechargeRecords[id]; if (r) { r.financialSettings = fs; r.summary = { ...(r.summary || {}), financialSettings: fs }; } if (String(currentWorkId) === id) financialSettings = fs; })(${JSON.stringify(fs)}, ${JSON.stringify(String(workId))})`);
    return true;
  }

  // ---------- repasse à área (dono do local) ----------
  // Itens de uso que cada ponto escolhe mostrar na prestação de contas da área.
  const AR_SHOW = [["showSessions", "Número de recargas"], ["showAvgTime", "Tempo médio das recargas"], ["showClients", "Clientes"], ["showOccTime", "Ocupação por tempo"], ["showOccupancy", "Ocupação real (energia)"],
    ["showPeak", "Horários de pico e dias da semana (gráficos)"], ["showNewClients", "Novos clientes × recorrentes (gráfico)"], ["showDaily", "Recargas e energia dia a dia (gráfico)"]];
  // Participação da área sobre o faturamento e, quando o ponto ainda usa a energia
  // do local, o reembolso dos kWh vendidos × tarifa do mês (Por carregador · energia).
  // Ponto sem padrão próprio (reembolso ao dono do local): a fatura é a do posto inteiro. Dela sai só a
  // tarifa — preço unitário com tributos das linhas de energia consumida — e essa tarifa vale para o mês
  // fechado escolhido: reembolso = kWh que o carregador vendeu no mês × tarifa. As datas de leitura da
  // Copel não importam aqui (diferente de Faturas de energia, que é para ponto com padrão próprio).
  function postoInvoiceBox(a, workId, station, can) {
    const today = new Date();
    const closed = `${today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()}-${String(today.getMonth() === 0 ? 12 : today.getMonth()).padStart(2, "0")}`;
    const keys = a.months.map(m => m.key);
    if (!keys.includes(ui.piMonth)) ui.piMonth = keys.includes(closed) ? closed : keys.at(-1) || "";
    const m = a.months.find(x => x.key === ui.piMonth);
    const r = ui.piRead, f = r?.ok ? r.fields : null;
    const rate = f?.energyRate || 0;
    const newReimb = m ? Math.round(m.energy * rate * 100) / 100 : 0;
    return `<section class="section"><div class="section-head"><div><p class="kicker">Reembolso de energia</p><h2>Tarifa pela fatura do posto</h2>
        <p>Anexe a fatura da Copel do posto. A plataforma soma o preço do kWh com tributos só das linhas de energia consumida (consumo, uso do sistema e bandeira) — sem energia injetada e sem iluminação pública — e aplica ao kWh que o carregador vendeu no mês fechado que você escolher.</p></div></div>
      <div class="grid g2" style="gap:10px;align-items:end">
        <label class="imp-field" style="display:block;border:1.5px dashed var(--uby-line, #c9d6cf);border-radius:10px;padding:10px 12px;cursor:pointer">
          <span style="font-size:12px;font-weight:800">📄 Fatura da Copel do posto (PDF)</span><small style="display:block;color:var(--uby-muted)">${r?.file ? esc(r.file) : "baixe a 2ª via no site/app da Copel"}</small>
          <input id="pmPiPdf" type="file" accept="application/pdf" style="margin-top:6px;width:100%"></label>
        ${field("Aplicar no mês fechado", `<select class="select" id="pmPiMonth">${a.months.slice().reverse().map(x => `<option value="${esc(x.key)}" ${x.key === ui.piMonth ? "selected" : ""}>${esc(x.label)} · ${fmt.kwh(x.energy)} vendidos · tarifa atual R$ ${Number(x.rate || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}/kWh</option>`).join("")}</select>`)}
      </div>
      ${r && !r.ok ? `<div class="note" style="margin-top:10px;border-color:var(--uby-red)">Não consegui ler: ${esc(r.error || "")}</div>` : ""}
      ${f ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Item da fatura ${esc(f.ref ? (UBY.state.api?.monthName?.(f.ref) || f.ref) : "")}</th><th class="num">kWh</th><th class="num">Preço com tributos</th><th>Entra na tarifa</th></tr></thead><tbody>
          ${(f.items || []).map(i => { const on = (f.energyRateItems || []).some(e => e.desc === i.desc); return `<tr${on ? "" : ' style="color:var(--uby-muted)"'}><td>${esc(i.desc)}</td><td class="num">${i.unit === "UN" ? "—" : fmt.int(i.qty)}</td><td class="num">${i.unit === "UN" ? fmt.brl(i.price) : `R$ ${i.price.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`}</td><td>${on ? '<span class="badge ok">sim</span>' : "não"}</td></tr>`; }).join("")}
          </tbody><tfoot><tr><td colspan="2">Tarifa de energia com tributos</td><td class="num">R$ ${rate.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}/kWh</td><td></td></tr></tfoot></table></div>
        ${m && rate > 0 ? `<div class="note" style="margin-top:10px"><strong>${esc(m.label)}: ${fmt.kwh(m.energy)} vendidos × R$ ${rate.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 })} = ${fmt.brl(newReimb)} de reembolso de energia</strong><br>
          Hoje está ${fmt.brl(m.reimbursement)} (tarifa ${fmt.brl(m.rate)}/kWh) · diferença ${fmt.brl(newReimb - m.reimbursement)}. A tarifa também passa a valer nos meses seguintes até a próxima fatura.${m.paidAt ? `<br><span class="badge warn">atenção</span> o repasse de ${esc(m.label)} já foi marcado como pago em ${fmt.date(m.paidAt + "T12:00:00")}.` : ""}</div>
          <button class="btn primary" id="pmPiSave" type="button" style="margin-top:10px" ${can}>Gravar tarifa em ${esc(m.label)} e guardar a fatura</button>` : rate > 0 ? "" : `<div class="note" style="margin-top:10px">Não achei as linhas de energia nesta fatura. Lance a tarifa à mão em Por carregador.</div>`}` : ""}
    </section>`;
  }

  function areaTab(w, data, embedded = false) {
    const api = UBY.state.api;
    if (!api || typeof api.areaAccount !== "function") return `<div class="note">O motor está recarregando. Abra esta aba de novo em alguns segundos.</div>`;
    const list = data.chargers.filter(c => c.included);
    if (!ui.arCharger) ui.arCharger = (list.find(c => /malassise/.test(c.workId)) || list[0] || {}).key || "";
    const [workId, station] = (ui.arCharger || "|").split("|");
    const a = api.areaAccount(workId, station);
    if (!a) return `<div class="note">Carregador não encontrado no motor.</div>`;
    const f = ui.arForm || (ui.arForm = { reimburseEnergy: a.config.reimburseEnergy, payee: a.config.payee, payeeEmail: a.config.payeeEmail || "", dueDay: a.config.dueDay, splitAtSourceFrom: a.config.splitAtSourceFrom || "", showSessions: !!a.config.showSessions, showAvgTime: !!a.config.showAvgTime, showClients: !!a.config.showClients, showOccTime: !!a.config.showOccTime, showOccupancy: !!a.config.showOccupancy, showPeak: !!a.config.showPeak, showNewClients: !!a.config.showNewClients, showDaily: !!a.config.showDaily, energyByHost: !!a.config.energyByHost });
    const can = canWrite(w) && !busy ? "" : "disabled";
    const today = new Date().toISOString().slice(0, 10);
    const dirty = f.reimburseEnergy !== a.config.reimburseEnergy || f.payee !== a.config.payee || (f.payeeEmail || "") !== (a.config.payeeEmail || "") || Number(f.dueDay) !== Number(a.config.dueDay) || (f.splitAtSourceFrom || "") !== (a.config.splitAtSourceFrom || "") || AR_SHOW.some(([k]) => !!f[k] !== !!a.config[k]) || !!f.energyByHost !== !!a.config.energyByHost || !a.config.configured;
    const st = s => `<span class="badge ${s === "pago" || s === "na origem (Spott)" ? "ok" : s === "vencido" ? "bad" : s === "sem repasse" ? "neutral" : "warn"}">${esc(s)}</span>`;
    return `
      <div class="toolbar">${embedded ? `<strong style="font-size:12.5px">Repasse ao dono do local</strong>` : `<select class="select" id="pmArCharger" style="min-width:280px">${list.map(c => `<option value="${esc(c.key)}" ${c.key === ui.arCharger ? "selected" : ""}>${esc(c.station)} · ${esc(c.workName)}</option>`).join("")}</select>`}
        <span class="spacer"></span><button class="btn" id="pmArReport" type="button">Prestação de contas (relatório)</button></div>
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Regra do repasse</p><h2>${esc(a.station)}</h2>
            <p>Todo mês o dono do local recebe a participação da área sobre o faturamento bruto${f.reimburseEnergy ? " e o reembolso da energia: kWh vendidos × tarifa do mês" : ""}. O percentual de cada competência fica em ${embedded ? "Contrato e splits" : "\"Por carregador\""} e a tarifa em Energia.</p></div></div>
          <div class="grid g2" style="gap:8px">
            ${field("Quem recebe", `<input class="select" data-ar="payee" value="${esc(f.payee || "")}" style="width:100%">`)}
            ${field("Dia do vencimento (mês seguinte)", `<input class="select" type="number" min="1" max="28" data-ar="dueDay" value="${esc(f.dueDay)}" style="width:100%">`)}
            ${field("E-mail de quem recebe (acesso à prestação de contas)", `<input class="select" type="email" data-ar="payeeEmail" value="${esc(f.payeeEmail || "")}" placeholder="opcional" style="width:100%">`)}
          </div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12.5px"><input type="checkbox" data-ar="reimburseEnergy" ${f.reimburseEnergy ? "checked" : ""}> Reembolsar a energia ao dono do local (o ponto ainda usa o padrão/energia do local)</label>
          <p class="source-line">Quando o ponto tiver padrão próprio, desmarque: a energia passa a vir das Faturas de energia e o repasse fica só com a participação.</p>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">${field("Split na origem a partir de (a Spott paga a área direto ao local)", `<input class="select" type="month" data-ar="splitAtSourceFrom" value="${esc(f.splitAtSourceFrom || "")}" style="width:190px">`)}
            ${f.splitAtSourceFrom ? `<button class="btn ghost" type="button" data-ar-split-clear>Tirar</button>` : ""}</div>
          <div style="margin-top:10px;font-size:12.5px"><strong>Mostrar na prestação de contas (relatório da área):</strong>
            <div style="display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:6px">${AR_SHOW.map(([k, label]) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ar="${k}" ${f[k] ? "checked" : ""}> ${label}</label>`).join("")}</div></div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12.5px"><input type="checkbox" data-ar="energyByHost" ${f.energyByHost ? "checked" : ""}> Energia 100% paga pelo local (sem custo de energia para a UBY; o fechamento não cobra fatura)</label>
          <p class="source-line">Split na origem: a Spott deposita a parte do local direto na conta dele. A área continua no resultado do carregador, mas não vira conta a pagar da UBY e não entra na base do imposto (a UBY só recolhe sobre o que de fato recebe). Antes do split, a área entra na conta da UBY, paga imposto junto e é repassada no dia escolhido do mês seguinte.</p>
          <button class="btn primary" id="pmArSave" type="button" style="margin-top:8px" ${dirty ? can : "disabled"}>${a.config.configured ? "Salvar regra" : "Ativar repasse deste carregador"}</button>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Acumulado</p><h2>Do início da operação até hoje</h2></div></div>
          <div class="grid g2">${kpi("Faturamento", fmt.brl(a.totals.revenue), `${fmt.kwh(a.totals.energy)} vendidos`)}${kpi("Total para a área", fmt.brl(a.totals.total), `pago ${fmt.brl(a.totals.paid)}`, "", "lead")}
            ${kpi("Energia reembolsada", fmt.brl(a.totals.reimbursement), a.config.reimburseEnergy ? "kWh vendidos × tarifa" : "não reembolsa")}${kpi("Participação da área", fmt.brl(a.totals.area), "sobre o faturamento bruto")}</div>
        </section>
      </div>
      ${a.config.reimburseEnergy && !embedded ? postoInvoiceBox(a, workId, station, can) : ""}
      <section class="section"><div class="section-head"><div><p class="kicker">Por competência</p><h2>Repasses ao local</h2><p>${a.config.configured ? `Vence no dia ${a.config.dueDay} do mês seguinte e aparece em Contas a pagar.` : "Ative o repasse acima para ele aparecer em Contas a pagar."}</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Faturamento</th><th class="num">kWh vendidos</th><th class="num">Tarifa</th><th class="num">Reembolso energia</th><th class="num">% área</th><th class="num">Participação</th><th class="num">Total ao local</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead>
          <tbody>${a.months.slice().reverse().map(m => `<tr><td><strong>${esc(m.label)}</strong><small>${fmt.date(m.periodStart)} a ${fmt.date(m.periodEnd)}</small></td>
            <td class="num">${fmt.brl(m.revenue)}</td><td class="num">${fmt.kwh(m.energy)}</td><td class="num">${m.reimbursement ? `${fmt.brl(m.rate)}/kWh` : "—"}</td><td class="num">${m.reimbursement ? fmt.brl(m.reimbursement) : "—"}</td>
            <td class="num">${fmt.pct1(m.areaPct)}</td><td class="num">${fmt.brl(m.area)}</td><td class="num"><strong>${fmt.brl(m.total)}</strong>${m.adjusted ? `<small>ajustado · calculado ${fmt.brl(m.computedTotal)}${m.adjustNote ? ` · ${esc(m.adjustNote)}` : ""}</small>` : ""}${m.carryIn ? `<small>inclui diferença de ${esc(m.carryFromLabel)}: ${fmt.brl(m.carryIn)}</small>` : ""}${m.paidAmount !== null && m.paidDiff ? `<small>devido ${fmt.brl(m.dueAmount)} · diferença ${fmt.brl(m.paidDiff)} ${m.paidDiffMode === "next" ? "levada ao mês seguinte" : "zerada"}</small>` : ""}</td><td>${fmt.date(m.due + "T12:00:00")}</td>
            <td>${st(m.status)}${m.paidAt ? `<small>em ${fmt.date(m.paidAt + "T12:00:00")}</small>` : ""}</td>
            <td style="white-space:nowrap">${m.atSource ? `<small>paga pela Spott na origem</small> ` : a.config.configured ? (m.paidAt ? `<button class="btn ghost" data-ar-unpay="${esc(m.key)}" type="button" ${can}>Desfazer</button>` : `${m.total > 0 ? `<button class="btn primary" data-ar-pay-open="${esc(m.key)}" type="button" ${can}>Marcar pago</button> ` : ""}<button class="btn ghost" data-ar-adj="${esc(m.key)}" type="button" ${can}>Ajustar valor</button>`) : ""}
              <button class="btn ghost" data-ar-rep="${esc(m.key)}" type="button">Relatório</button></td></tr>
            ${ui.arPay === m.key && !m.paidAt ? `<tr><td colspan="11"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              ${field("Pago em", `<input class="select" type="date" data-ar-date="${esc(m.key)}" value="${today}" style="width:150px">`)}
              ${field(`Valor pago (devido ${fmt.brl(m.dueAmount)})`, `<input class="select" type="number" step="0.01" data-ar-pay-amount data-due="${esc(m.dueAmount.toFixed(2))}" value="${esc(m.dueAmount.toFixed(2))}" style="width:160px">`)}
              ${field("Se o valor pago for diferente do devido", `<select class="select" data-ar-pay-diff style="width:260px"><option value="next">Levar a diferença para o mês seguinte</option><option value="drop">Zerar a diferença</option></select>`)}
              <button class="btn primary" data-ar-pay="${esc(m.key)}" type="button" ${can}>Confirmar pagamento</button>
              <button class="btn ghost" data-ar-pay-cancel type="button">Cancelar</button></div></td></tr>` : ""}
            ${ui.arAdjust === m.key ? `<tr><td colspan="11"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              ${field(`Valor final a repassar em ${m.label} (R$)`, `<input class="select" type="number" step="0.01" data-ar-adj-total value="${esc(m.own.toFixed(2))}" style="width:160px">`)}
              ${field("Motivo do ajuste", `<input class="select" data-ar-adj-note value="${esc(m.adjustNote)}" placeholder="ex.: desconto combinado, arredondamento" style="width:300px">`)}
              <button class="btn primary" data-ar-adj-save="${esc(m.key)}" type="button" ${can}>Salvar ajuste</button>
              ${m.adjusted ? `<button class="btn ghost" data-ar-adj-clear="${esc(m.key)}" type="button" ${can}>Voltar ao calculado (${fmt.brl(m.computedTotal)})</button>` : ""}
              <button class="btn ghost" data-ar-adj-cancel type="button">Cancelar</button></div></td></tr>` : ""}`).join("") || `<tr><td colspan="11" class="empty">Sem competências com operação.</td></tr>`}</tbody></table></div>
        ${a.config.configured ? "" : `<div class="note" style="margin-top:10px">Para marcar pago ou ajustar o valor, clique primeiro em <strong>Ativar repasse deste carregador</strong> na regra acima.</div>`}
      </section>`;
  }

  // ---------- fechamentos: aprovar (congela os números), pagar, reabrir ----------
  const nz = v => Number(v || 0);
  function closingSnapshot(inv, idx) {
    const m = inv.months[idx];
    return {
      engine: "v2", savedAt: new Date().toISOString(),
      taxBase: nz(m.taxBase), taxes: nz(m.taxes), preTax: nz(m.preTax), result: nz(m.result), carryIn: nz(m.carryIn),
      distributable: nz(m.distributable), legalReserve: nz(m.legalReserve), expansionReserve: nz(m.expansionReserve),
      investorPool: nz(m.investorPool), eligibleQuotas: nz(m.eligibleQuotas), perQuota: nz(m.perQuota), founderPct: nz(m.founderPct), founderPool: nz(m.founderPool), developerFee: nz(m.developerFee),
      investors: inv.investors.filter(i => i.eligibleFrom <= m.key || Number(i.allocations[idx]) > 0).map(i => ({ name: i.name, quotas: nz(i.quotas), founder: !!i.founder, newQuota: !!i.newQuota, value: Math.round(nz(i.allocations[idx]) * 100) / 100 }))
    };
  }
  function closingDiff(inv, idx) {
    const m = inv.months[idx], snap = m.snapshot;
    if (!snap) return [];
    const out = [];
    [["result", "resultado"], ["taxes", "impostos"], ["investorPool", "pool dos cotistas"], ["perQuota", "valor por cota"]].forEach(([k, l]) => {
      if (Math.abs(nz(snap[k]) - nz(m[k])) > 0.009) out.push(`${l}: aprovado ${fmt.brl(snap[k])} · agora ${fmt.brl(m[k])}`);
    });
    const live = new Map(inv.investors.map(i => [i.name, nz(i.allocations[idx])]));
    (snap.investors || []).forEach(i => { if (Math.abs(nz(i.value) - nz(live.get(i.name))) > 0.009) out.push(`${i.name}: aprovado ${fmt.brl(i.value)} · agora ${fmt.brl(live.get(i.name))}`); });
    return out;
  }
  function closingsTab(w) {
    let inv;
    try { inv = UBY.data("investorDistribution"); } catch (_) { return `<div class="note">Atualizando os números… abra a aba de novo em alguns segundos.</div>`; }
    const can = canWrite(w) && !busy ? "" : "disabled";
    const today = new Date().toISOString().slice(0, 10);
    const badge = s => `<span class="badge ${s === "pago" ? "ok" : s === "aprovado" ? "dc" : "neutral"}">${esc(s)}</span>`;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Governança</p><h2>Fechamentos da distribuição</h2>
          <p>Aprovar uma competência congela os números daquele mês (resultado, impostos, reservas, pool e o repasse de cada cotista). Se a base mudar depois — planilha nova, parâmetro, custo —, a tela mostra a diferença entre o aprovado e o atual. Depois do pagamento, marque como pago com a data.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Resultado</th><th class="num">Impostos</th><th class="num">Pool cotistas</th><th class="num">Por cota</th><th>Situação</th><th>Aprovação</th><th>Documentos publicados</th><th></th></tr></thead>
          <tbody>${inv.months.map((m, idx) => { const diff = closingDiff(inv, idx); return `<tr>
            <td><strong>${esc(m.label)}</strong></td><td class="num">${fmt.brl(m.result)}</td><td class="num">${m.taxes ? fmt.brl(m.taxes) : `<span class="badge warn">sem imposto</span>`}</td>
            <td class="num">${fmt.brl(m.investorPool)}</td><td class="num">${fmt.brl(m.perQuota)}</td><td>${badge(m.status)}</td>
            <td style="white-space:normal;min-width:220px">${m.approvedAt ? `<small>aprovado ${fmt.dt(m.approvedAt)}${m.approvedBy ? ` por ${esc(m.approvedBy)}` : ""}${m.paidAt ? ` · pago em ${fmt.date(m.paidAt + "T12:00:00")}` : ""}</small>` : "<small>—</small>"}
              ${diff.length ? `<div class="note" style="margin-top:6px;border-color:var(--uby-red)"><strong>Mudou depois da aprovação</strong><br>${diff.map(esc).join("<br>")}</div>` : ""}</td>
            <td style="white-space:normal;min-width:170px">${docsCell(m.key)}</td>
            <td style="white-space:nowrap">
              <button class="btn ghost" data-close-report="${esc(m.key)}" type="button">Relatório</button>
              ${m.status !== "pendente" ? `<button class="btn" data-publish="${esc(m.key)}" type="button" ${can}>${(ui.docs || []).some(d => d.competencia === m.key && d.tipo === "fechamento" && !d.revogado_em) ? "Publicar nova versão" : "Publicar documentos"}</button>` : ""}
              ${m.status === "pendente" ? `<button class="btn primary" data-close="${esc(m.key)}|approve" type="button" ${can}>Aprovar</button>` : ""}
              ${m.status === "aprovado" ? `<input class="select" type="date" data-paid-date="${esc(m.key)}" value="${today}" style="width:140px"> <button class="btn primary" data-close="${esc(m.key)}|pay" type="button" ${can}>Marcar pago</button>` : ""}
              ${m.status === "aprovado" && diff.length ? `<button class="btn" data-close="${esc(m.key)}|approve" type="button" ${can}>Aprovar números atuais</button>` : ""}
              ${m.status !== "pendente" ? `<button class="btn ghost" data-close="${esc(m.key)}|reopen" type="button" ${can}>Reabrir</button>` : ""}
            </td></tr>`; }).join("") || `<tr><td colspan="9" class="empty">Nenhuma competência de distribuição.</td></tr>`}</tbody></table></div>
        <p class="source-line">Cada competência é dividida só entre as cotas habilitadas no primeiro dia do mês. Aprove em ordem: o prejuízo de um mês é compensado nos seguintes.</p>
        <p class="source-line">Publicar documentos guarda de forma definitiva o relatório do fechamento, o extrato de cada cotista com e-mail cadastrado e a prestação de contas de cada área com e-mail. Cotistas e áreas com acesso veem só os próprios documentos. Um documento publicado não muda: se o mês for reaprovado, publique uma nova versão. ${ui.docsError ? `<strong>${esc(ui.docsError)}</strong>` : ""}</p>
      </section>`;
  }
  // Documentos já publicados por competência (lidos da tabela uby_documentos).
  function docsCell(mk) {
    if (ui.docsError) return "<small>—</small>";
    if (!ui.docs) return "<small>lendo…</small>";
    const list = ui.docs.filter(d => d.competencia === mk && !d.revogado_em);
    if (!list.length) return "<small>nenhum</small>";
    const lastV = Math.max(...list.filter(d => d.tipo === "fechamento").map(d => d.versao), 0);
    const who = list.filter(d => d.tipo !== "fechamento").map(d => d.destinatario_nome || d.destinatario_email);
    return `<span class="badge ok">fechamento${lastV ? ` v${lastV}` : ""}</span>${who.length ? `<small>${esc([...new Set(who)].join(", "))}</small>` : ""}`;
  }
  async function loadDocs(w) {
    try { ui.docs = await w.UBY_SUPABASE.listDocuments({ limit: 300 }); ui.docsError = ""; }
    catch (err) { ui.docs = []; ui.docsError = err.code === "UBY_NO_DOCS_TABLE" ? err.message : `Não consegui ler os documentos publicados (${err.message}).`; }
  }
  async function publishClosing(w, mk) {
    const inv = UBY.data("investorDistribution");
    const m = inv.months.find(x => x.key === mk);
    if (!m || m.status === "pendente") throw new Error("Aprove a competência antes de publicar.");
    // O documento publicado é definitivo: só sai se os números de agora forem os aprovados.
    const diff = closingDiff(inv, inv.months.indexOf(m));
    if (!m.snapshot || diff.length) throw new Error(`Os números de ${m.label} mudaram depois da aprovação (${diff.join("; ") || "aprovação sem números guardados"}). Reaprove a competência e publique de novo, para o documento sair igual ao aprovado.`);
    const label = m.label;
    const snap = m.snapshot || null;
    const published = [];
    await w.UBY_SUPABASE.publishDocument({ tipo: "fechamento", competencia: mk, titulo: `Fechamento ${label}`, html: UBY.reports.build("unificado", { month: mk }),
      dados: { status: m.status, approvedAt: m.approvedAt, approvedBy: m.approvedBy, paidAt: m.paidAt, snapshot: snap } });
    published.push("fechamento");
    const policy = w.loadNetworkDistribution();
    for (const i of (policy.investors || []).filter(x => x.email && x.eligibleFrom <= mk)) {
      await w.UBY_SUPABASE.publishDocument({ tipo: "cotista", competencia: mk, titulo: `Extrato ${i.name} · ${label}`, destinatarioEmail: i.email, destinatarioNome: i.name,
        html: UBY.reports.build("cotista", { name: i.name }), dados: { quotas: i.quotas, value: (snap?.investors || []).find(x => x.name === i.name)?.value ?? null } });
      published.push(i.name);
    }
    for (const st of UBY.data("financeStations")) {
      const a = UBY.state.api.areaAccount(st.workId, st.station);
      if (!a?.config?.configured || !a.config.payeeEmail) continue;
      await w.UBY_SUPABASE.publishDocument({ tipo: "area", competencia: mk, titulo: `Prestação de contas ${a.station} · ${label}`, destinatarioEmail: a.config.payeeEmail, destinatarioNome: a.config.payee,
        html: UBY.reports.build("area", { workId: st.workId, station: st.station, month: mk }), dados: { station: a.station, workId: st.workId } });
      published.push(a.config.payee);
    }
    await loadDocs(w);
    return `${published.length} documento(s) publicado(s): ${published.join(", ")}`;
  }

  // Cotista: a partir da data do aporte e do valor investido, calcula cotas e o mês de entrada.
  const nextMonthKey = mk => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  function deriveInvestor(i, defaultQuota) {
    const quotaValue = Number(i.quotaValue) || Number(defaultQuota) || window.UBY_CONFIG.quotaValueDefault;
    const investedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(i.investedAt || "")) ? i.investedAt : "";
    const eligibleFrom = investedAt ? (investedAt.slice(8) === "01" ? investedAt.slice(0, 7) : nextMonthKey(investedAt.slice(0, 7))) : (i.eligibleFrom || "");
    const investment = Number(i.investment) > 0 ? Math.round(Number(i.investment) * 100) / 100 : Math.round(Number(i.quotas || 0) * quotaValue * 100) / 100;
    const quotas = Math.round(investment / quotaValue * 10000) / 10000;
    return { ...i, quotaValue, investedAt, investment, quotas, eligibleFrom };
  }

  // Lista de cotistas por modo de recebimento: rodada 1 (investidores), rodada 1 (REBP) e cotas 11+, separados por tracejado.
  function quotaGroups(order, investors, feePct) {
    if (!investors.some(i => i.founder || i.newQuota)) return [{ keys: order }];
    const round1 = order.filter(k => !investors[k].founder && !investors[k].newQuota), founders = order.filter(k => investors[k].founder);
    const later = order.filter(k => investors[k].newQuota && !investors[k].founder);
    return [
      { head: true, title: "Rodada 1 · investidores", note: "valor cheio por cota" }, { keys: round1 },
      ...(founders.length ? [{ head: true, sep: true, title: "Rodada 1 · REBP", note: "cotas da REBP na rodada 1, valor cheio por cota" }, { keys: founders }] : []),
      ...(later.length ? [{ head: true, sep: true, title: "Cotas 11 em diante", note: `cada cota recebe ${fmt.pct1(100 - feePct)} do valor por cota; ${fmt.pct1(feePct)} vão para a taxa da desenvolvedora (REBP), mostrada à parte em Financeiro → Investidores` }, { keys: later }] : [])
    ];
  }

  function quotasTab(w) {
    const p = w.loadNetworkDistribution();
    const e = ui.policyEdits || (ui.policyEdits = JSON.parse(JSON.stringify({
      quotaValue: p.quotaValue || window.UBY_CONFIG.quotaValueDefault, distributionStartMonth: p.distributionStartMonth || window.UBY_CONFIG.distributionStartDefault, legalReservePct: p.legalReservePct, expansionReservePct: p.expansionReservePct,
      investorPct: p.investorPct, founderPct: p.founderPct ?? 20, totalQuotas: p.totalQuotas, soldQuotas: p.soldQuotas, roundLabel: p.roundLabel, taxRatePct: p.taxRatePct || 0, taxRateFrom: { ...(p.taxRateFrom || {}) }, taxByMonth: { ...(p.taxByMonth || {}) },
      investors: (p.investors || []).map(i => {
        const qv = Number(i.quotaValue) || Number(p.quotaValue) || window.UBY_CONFIG.quotaValueDefault;
        return { ...i, quotaValue: qv, investedAt: i.investedAt || (i.eligibleFrom ? `${i.eligibleFrom}-01` : ""), investment: Number(i.investment) || Math.round(Number(i.quotas || 0) * qv * 100) / 100 };
      })
    })));
    const inp = (k, label, type = "number", extra = "") => field(label, `<input class="select" data-pol="${k}" type="${type}" value="${esc(e[k] ?? "")}" ${extra} style="width:100%">`);
    const derived = w.applyInvestorOperationStart(e.investors.map(i => deriveInvestor(i, e.quotaValue)));
    // A ordem só é recalculada ao abrir/salvar: reordenar a cada edição fazia a linha "fugir" e o vínculo caía no cotista errado.
    if (!ui.rowOrder || ui.rowOrder.length !== e.investors.length) {
      ui.rowOrder = ui.rowOrder && e.investors.length === ui.rowOrder.length + 1
        ? [...ui.rowOrder, e.investors.length - 1]
        : e.investors.map((i, k) => k).sort((a, b) => w.compareInvestorsByStart(derived[a], derived[b]));
    }
    const firstEligible = derived.map(d => d.eligibleFrom).filter(m => m && m < "2099").sort()[0] || "";
    const startWarn = firstEligible && e.distributionStartMonth && e.distributionStartMonth > firstEligible
      ? `<div class="note" style="margin:10px 0;border-color:#e0a4a0"><strong>Atenção:</strong> "Distribuição a partir de" está em ${esc(UBY.state.api?.monthName?.(e.distributionStartMonth) || e.distributionStartMonth)}, mas há cotas habilitadas desde ${esc(UBY.state.api?.monthName?.(firstEligible) || firstEligible)}. Os meses anteriores ao início da distribuição não aparecem no histórico nem na rentabilidade dos cotistas.</div>` : "";
    const stationNames = (w.getUbyChargerRows(w.getGeneralUnitData()) || []).filter(r => r.included).map(r => r.station || r.stationName || r.workName).filter(Boolean);
    const quotasSum = derived.reduce((s, i) => s + Number(i.quotas || 0), 0);
    const investedSum = derived.reduce((s, i) => s + Number(i.investment || 0), 0);
    const feePct = Number(e.founderPct ?? 20);
    const kindOf = i => i.founder ? "founder" : i.newQuota ? "new" : "round1";
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Política de distribuição</p><h2>Rodadas, valor da cota e fundo de reserva</h2><p>O valor padrão da cota vale para cotistas sem valor próprio. Cada cotista pode ter o valor da sua rodada (ex.: rodada 1 a R$ 80 mil, novas a R$ 100 mil). A distribuição por cota é igual para todas; o valor pago muda o investido, o retorno e o payback.</p></div></div>
        <div class="grid g4" style="gap:8px">
          ${inp("quotaValue", "Valor padrão da cota (R$)", "number", 'min="0" step="1000"')}${inp("distributionStartMonth", "Distribuição a partir de", "month")}
          ${inp("expansionReservePct", "Fundo de reserva (% do lucro líquido)", "number", 'min="0" max="100" step="0.1"')}
          ${inp("investorPct", "Parte dos cotistas após o fundo de reserva (%)", "number", 'min="0" max="100" step="0.1"')}${inp("totalQuotas", "Cotas da rodada atual", "number", 'min="1" step="1"')}
          ${inp("soldQuotas", "Cotas vendidas", "number", 'min="0" step="1"')}${inp("roundLabel", "Nome da rodada atual", "text")}
          ${inp("founderPct", "Taxa da desenvolvedora nas cotas 11+ (%)", "number", 'min="0" max="100" step="0.1"')}
        </div>
        <p class="meta" style="margin:10px 0 0">Rodada 1: 10 cotas (8 de investidores + 2 da REBP), todas recebendo o mesmo valor por cota. Da cota 11 em diante, cada cota fica com ${esc(fmt.pct1(100 - feePct))} do que recebe e ${esc(fmt.pct1(feePct))} vão para a REBP como taxa da desenvolvedora, mostrada à parte. Indique o tipo de cada cotista na coluna "Tipo da cota".</p>
      </section>
      ${startWarn}
      <section class="section"><div class="section-head"><div><p class="kicker">Impostos da UBY</p><h2>Impostos sobre o recebido</h2><p>Incidem sobre o que a UBY recebe no mês (faturamento dos ativos próprios menos Spott, P3 e a parte da área, mais royalties), não sobre o faturamento bruto, e saem do resultado antes do fundo de reserva e dos cotistas. Use o percentual e, quando a guia sair, lance o valor exato do mês — ele substitui o percentual naquela competência.</p></div></div>
        <div class="grid g4" style="gap:8px">${inp("taxRatePct", "Alíquota sobre o recebido pela UBY (%)", "number", 'min="0" max="100" step="0.01"')}</div>
        <p class="meta" style="margin:10px 0 6px">A alíquota sai do resultado de cada carregador próprio da UBY (e dos relatórios). Quando ela mudar, cadastre a nova "a partir de" um mês: os meses anteriores continuam com a antiga.</p>
        <div class="table-wrap"><table><thead><tr><th>A partir de</th><th class="num">Nova alíquota (%)</th><th></th></tr></thead><tbody>
          ${Object.keys(e.taxRateFrom || {}).sort().map(k => `<tr><td>${esc(UBY.state.api?.monthName?.(k) || k)}</td><td class="num"><input class="select" type="number" min="0" max="100" step="0.01" data-tax-from="${esc(k)}" value="${esc(e.taxRateFrom[k])}" style="width:120px"></td><td><button class="btn" type="button" data-tax-from-del="${esc(k)}">Remover</button></td></tr>`).join("")}
          <tr><td><input class="select" type="month" id="pmTaxFromMonth"></td><td class="num"><input class="select" type="number" min="0" max="100" step="0.01" id="pmTaxFromPct" placeholder="%" style="width:120px"></td><td><button class="btn" type="button" id="pmTaxFromAdd">＋ Adicionar mudança</button></td></tr>
        </tbody></table></div>
        <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Competência</th><th class="num">Valor exato do imposto (R$)</th><th>Uso</th></tr></thead>
          <tbody>${(UBY.state.months || []).slice().reverse().map(mk => { const v = e.taxByMonth[mk]; return `<tr><td>${esc(UBY.state.api?.monthName?.(mk) || mk)}</td><td class="num"><input class="select" type="number" min="0" step="0.01" data-tax-month="${esc(mk)}" value="${v === undefined ? "" : esc(v)}" placeholder="usar ${esc(e.taxRatePct || 0)}%" style="width:150px"></td><td><small>${v === undefined ? `alíquota de ${esc(e.taxRatePct || 0)}%` : "valor lançado"}</small></td></tr>`; }).join("")}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Cotistas</p><h2>Cotistas: data do aporte e valor investido</h2><p>Informe só a data do aporte e o valor investido. A plataforma calcula as cotas (valor ÷ valor da cota da rodada, fixado na entrada do cotista) e o mês em que ele passa a participar: aporte no dia 1º entra no próprio mês; em qualquer outro dia, entra no mês seguinte. Se a cota for vinculada a um carregador, o dividendo só começa depois do início da operação dele (vale o mês mais tardio entre o aporte e o mês em que o carregador entrou em operação); o vínculo não rateia faturamento, só define a data. ${fmt.n1(quotasSum)} cota(s) · ${fmt.brl(investedSum)} investidos${derived.some(i => i.founder) ? ` · ${fmt.n1(derived.filter(i => i.newQuota && !i.founder).reduce((s, i) => s + Number(i.quotas || 0), 0))} cota(s) 11+ com taxa de ${esc(fmt.pct1(feePct))}` : ""}.</p></div>
          <button class="btn" id="pmInvAdd" type="button">＋ Cotista</button></div>
        ${e.investors.some(i => i.newQuota) && !e.investors.some(i => i.founder) ? `<div class="note" style="margin:0 0 10px">Para mostrar as 2 cotas da REBP na rodada 1 em bloco separado, escolha "Rodada 1 · REBP (fundadora)" na linha delas. A taxa da desenvolvedora não depende dessa marcação.</div>` : ""}
        <datalist id="pmStationList">${stationNames.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <div class="table-wrap"><table><thead><tr><th>Cotista</th><th>E-mail (acesso aos extratos)</th><th>Data do aporte</th><th class="num">Valor investido (R$)</th><th class="num">Valor da cota</th><th class="num">Cotas</th><th>Tipo da cota</th><th>Carregador vinculado</th><th>Participa a partir de</th><th>Situação</th><th></th></tr></thead>
          <tbody>${quotaGroups(ui.rowOrder, e.investors, feePct).map(g => g.head ? `<tr><td colspan="11" style="${g.sep ? "border-top:2px dashed var(--uby-muted);" : ""}padding-top:${g.sep ? 14 : 6}px"><strong style="font-size:12px;letter-spacing:.04em;text-transform:uppercase">${esc(g.title)}</strong> <small style="display:inline;margin-left:6px">${esc(g.note)}</small></td></tr>` : g.keys.map(k => { const i = e.investors[k], d = derived[k]; return `<tr>
            <td><input class="select" data-inv="${k}|name" value="${esc(i.name)}" style="width:100%"></td>
            <td><input class="select" type="email" data-inv="${k}|email" value="${esc(i.email || "")}" placeholder="opcional" style="width:100%"></td>
            <td><input class="select" type="date" data-inv="${k}|investedAt" value="${esc(i.investedAt || "")}"></td>
            <td class="num"><input class="select" type="number" min="0" step="0.01" data-inv="${k}|investment" value="${esc(i.investment || "")}" style="width:140px"></td>
            <td class="num"><input class="select" type="number" min="0" step="1000" data-inv="${k}|quotaValue" value="${esc(d.quotaValue)}" style="width:120px"><small>${Number(i.quotaValue) > 0 ? "desta cota" : "padrão da rodada"}</small></td>
            <td class="num"><strong>${fmt.n1(d.quotas)}</strong></td>
            <td><select class="select" data-inv="${k}|kind">${[["round1", "Rodada 1 · investidor"], ["founder", "Rodada 1 · REBP (fundadora)"], ["new", `Cota 11+ (${fmt.pct1(feePct)} p/ desenvolvedora)`]].map(([v, l]) => `<option value="${v}" ${kindOf(i) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
            <td><input class="select" list="pmStationList" data-inv="${k}|linkedStation" value="${esc(i.linkedStation || "")}" placeholder="sem vínculo" style="width:190px"></td>
            <td>${d.waitingOperation ? `<strong>aguardando operação</strong><small>${esc(d.linkedStation)} ainda não iniciou</small>` : `<strong>${esc(d.eligibleFrom ? (UBY.state.api?.monthName?.(d.eligibleFrom) || d.eligibleFrom) : "—")}</strong>${d.operationFrom && d.operationFrom > d.baseEligibleFrom ? `<small>aguarda o início da operação (aporte: ${esc(UBY.state.api?.monthName?.(d.baseEligibleFrom) || d.baseEligibleFrom)})</small>` : (d.investedAt && d.investedAt.slice(8) !== "01" ? "<small>aporte após o dia 1º</small>" : "")}`}</td>
            <td><select class="select" data-inv="${k}|status">${["pendente", "aprovado", "pago"].map(s => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
            <td><button class="btn ghost" data-inv-del="${k}" type="button">✕</button></td></tr>`; }).join("")).join("") || `<tr><td colspan="11" class="empty">Nenhum cotista.</td></tr>`}</tbody></table></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="pmPolSave" type="button" ${canWrite(w) && !busy ? "" : "disabled"}>Salvar política e cotistas</button><button class="btn" id="pmPolReset" type="button">Descartar</button></div>
      </section>`;
  }

  // ---------- fechamento do mês (uma página só) ----------
  // Usuário (14/10/2026): fechamento aparecia em três lugares. Aqui, em ordem: o que falta → conferência
  // dos recebidos (UBY e P3 × o que caiu de fato) → aprovar e publicar → documentos publicados.
  // A Spott paga a competência M por volta do dia 10 de M+1, já sem os 8% e sem o split da P3: o
  // "recebido pela UBY" de M é conferido com as entradas da Spott no extrato de M+1. O split da P3 não
  // passa pela conta da UBY: o valor que a P3 recebeu é informado aqui (fica no extrato, em "received").
  function receivedRows(bank) {
    const api = UBY.state.api;
    const B = window.UBY_BANK;
    const tx = bank?.transactions || [];
    const infl = B && tx.length ? B.inflows(tx, bank.links || {}) : {};
    const lastTx = tx.map(t => t.date).sort().at(-1) || "";
    const rec = bank?.received || {};
    return (UBY.state.months || []).map(mk => {
      let d = null;
      try { d = UBY.data("finance", mk).dre; } catch (_) {}
      if (!d) return null;
      const nx = nextMonthKey(mk);
      const uby = Math.round((d.networkRevenue - d.platform - d.management - (d.areaAtSource || 0) + d.royalties) * 100) / 100;
      const p3 = Math.round((d.management + (d.partnerManagement || 0)) * 100) / 100;
      const got = infl[nx]?.Spott;
      const covered = lastTx >= `${nx}-15`;
      const ubyGot = rec[mk]?.uby != null ? Number(rec[mk].uby) : got != null ? got : null;
      const p3Got = rec[mk]?.p3 != null ? Number(rec[mk].p3) : null;
      return { mk, nx, uby, p3, ubyGot, ubyManual: rec[mk]?.uby != null, covered, p3Got, p3At: rec[mk]?.p3At || "", note: rec[mk]?.note || "",
        ubyDiff: ubyGot == null ? null : Math.round((ubyGot - uby) * 100) / 100, p3Diff: p3Got == null ? null : Math.round((p3Got - p3) * 100) / 100 };
    }).filter(Boolean);
  }
  const TOL = 0.05;
  // Conferência vale de set/2026 em diante (usuário: "o que ficou para trás pode deixar"; jun–ago era Move/transição).
  const RCV_FROM = "2026-09";
  function receivedItems(rows, mk) {
    const r = rows.find(x => x.mk === mk);
    if (!r || mk < RCV_FROM) return [];
    const mName = m => UBY.state.api?.monthName?.(m) || m;
    const out = [];
    if (r.ubyGot == null) out.push({ cat: "Recebidos", status: r.covered ? "bad" : "warn", title: r.covered ? `Repasse da Spott de ${mName(mk)} não achado no extrato` : `Repasse da Spott de ${mName(mk)} ainda não conferido`, detail: r.covered ? `Previsto ${fmt.brl(r.uby)} em ${mName(r.nx)}; nenhuma entrada da Spott nesse mês.` : `Previsto ${fmt.brl(r.uby)} por volta de 10/${r.nx.slice(5)}. Anexe o extrato de ${mName(r.nx)}.`, href: "#/parametros/pagamentos", action: r.covered ? "Ver extrato" : "Anexar extrato" });
    else if (Math.abs(r.ubyDiff) > TOL) out.push({ cat: "Recebidos", status: "bad", title: `Recebido pela UBY não bate: diferença de ${fmt.brl(r.ubyDiff)}`, detail: `Plataforma ${fmt.brl(r.uby)} × ${r.ubyManual ? "informado" : "extrato"} ${fmt.brl(r.ubyGot)}. Confira recargas, ajustes de fechamento da Spott e o split.`, href: "#fc-recebidos", action: "Conferir" });
    if (r.p3Got == null) out.push({ cat: "Recebidos", status: "warn", title: `Quanto a P3 recebeu em ${mName(mk)} não foi informado`, detail: `Previsto pela plataforma: ${fmt.brl(r.p3)}.`, href: "#fc-recebidos", action: "Informar" });
    else if (Math.abs(r.p3Diff) > TOL) out.push({ cat: "Recebidos", status: "bad", title: `Recebido pela P3 não bate: diferença de ${fmt.brl(r.p3Diff)}`, detail: `Plataforma ${fmt.brl(r.p3)} × informado ${fmt.brl(r.p3Got)}.`, href: "#fc-recebidos", action: "Conferir" });
    return out;
  }
  function closingPage(w, data) {
    const api = UBY.state.api;
    const months = (UBY.state.months || []).slice();
    if (!months.length || !api) return `<div class="note">Sem competências carregadas ainda. Abra esta aba de novo em alguns segundos.</div>`;
    if (!months.includes(ui.ckMonth)) ui.ckMonth = months.at(-1);
    const mk = ui.ckMonth;
    const mName = m => api.monthName?.(m) || m;
    const can = canWrite(w) && !busy ? "" : "disabled";
    const rows = receivedRows(data.bank);
    const cur = rows.find(r => r.mk === mk);
    const ck = checklistTab(receivedItems(rows, mk), true);
    let inv = null;
    try { inv = UBY.data("investorDistribution").months.find(x => x.key === mk) || null; } catch (_) {}
    const head = (id, kicker, title, sub, extra = "") => `<div class="cc-head" id="fc-${id}" data-focus="sec:${id}"><div><p class="kicker">${kicker}</p><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${extra}</div>`;
    const okBadge = (diff, got, m) => m < RCV_FROM ? `<span class="badge neutral">histórico</span>` : got == null ? `<span class="badge neutral">a conferir</span>` : Math.abs(diff) <= TOL ? `<span class="badge ok">bate</span>${diff ? `<small>${fmt.brl(diff)} (arredondamento)</small>` : ""}` : `<span class="badge bad">${fmt.brl(diff)}</span>`;
    const recTable = rows.slice().reverse().map(r => `<tr class="${r.mk === mk ? "on" : ""}" ${r.mk === mk ? 'style="background:var(--uby-green-soft)"' : ""}>
        <td><strong>${esc(mName(r.mk))}</strong></td>
        <td class="num">${fmt.brl(r.uby)}</td>
        <td class="num">${r.ubyGot == null ? `<small>${r.covered ? "sem entrada da Spott" : `extrato de ${esc(mName(r.nx))} pendente`}</small>` : `${fmt.brl(r.ubyGot)}<small>${r.ubyManual ? "informado" : `extrato · ${esc(mName(r.nx))}`}</small>`}</td>
        <td>${okBadge(r.ubyDiff, r.ubyGot, r.mk)}</td>
        <td class="num">${fmt.brl(r.p3)}</td>
        <td class="num"><input class="select" type="number" step="0.01" min="0" data-rcv-p3="${esc(r.mk)}" value="${r.p3Got == null ? "" : esc(r.p3Got.toFixed(2))}" placeholder="informar" style="width:110px" ${can}>${r.p3At ? `<small>em ${fmt.date(r.p3At + "T12:00:00")}</small>` : ""}</td>
        <td>${okBadge(r.p3Diff, r.p3Got, r.mk)}</td></tr>`).join("");
    return `
      <div class="toolbar cc-bar"><label>Competência <select class="select" id="pmCkMonth">${months.slice().reverse().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${esc(mName(m))}</option>`).join("")}</select></label>
        <span class="spacer"></span><small>Resolva de cima para baixo; a lista se atualiza depois de cada gravação</small></div>
      <div class="grid g4" style="margin-bottom:6px">
        ${kpi("Pendências", fmt.int(ck.open), ck.open ? `${fmt.int(ck.bad)} para resolver` : "pronto para aprovar", "", "lead")}
        ${kpi("Recebido pela UBY", cur ? fmt.brl(cur.uby) : "—", cur ? (cur.ubyGot == null ? "extrato a conferir" : Math.abs(cur.ubyDiff) <= TOL ? `bate com ${cur.ubyManual ? "o informado" : "o extrato"}` : `extrato ${fmt.brl(cur.ubyGot)} · diferença ${fmt.brl(cur.ubyDiff)}`) : "")}
        ${kpi("Recebido pela P3", cur ? fmt.brl(cur.p3) : "—", cur ? (cur.p3Got == null ? "informe quanto caiu" : Math.abs(cur.p3Diff) <= TOL ? "bate com o informado" : `informado ${fmt.brl(cur.p3Got)} · diferença ${fmt.brl(cur.p3Diff)}`) : "")}
        ${kpi("Fechamento", inv ? esc(inv.status) : "—", inv ? `pool ${fmt.brl(inv.investorPool)} · ${fmt.brl(inv.perQuota)} por cota` : "")}
      </div>
      <nav class="cc-jump" aria-label="Ir para">${[["falta", "1. O que falta"], ["recebidos", "2. Recebidos"], ["aprovar", "3. Aprovar e publicar"]].map(([id, l]) => `<button type="button" data-jump="fc-${id}">${l}</button>`).join("")}<a class="btn ghost link-btn" href="#/arquivo" style="height:28px">Documentos publicados →</a></nav>
      ${head("falta", "1 · Conferir", `O que falta em ${esc(mName(mk))}`, "Recargas, energia, custos, impostos, pagamentos e recebidos. Cada item leva para onde se resolve.")}
      ${ck.html}
      ${head("recebidos", "2 · Recebidos", "O que a plataforma calcula × o que caiu", "UBY: faturamento − Spott − P3 + royalties, conferido com a entrada da Spott no extrato do mês seguinte. P3: gestão dos ativos UBY + gestão de parceiros, conferida com o valor que você informa.")}
      ${data.bankError ? `<div class="note">Não consegui ler o extrato: ${esc(data.bankError)}</div>` : ""}
      <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">UBY · plataforma</th><th class="num">UBY · caiu</th><th>UBY</th><th class="num">P3 · plataforma</th><th class="num">P3 · recebeu</th><th>P3</th></tr></thead><tbody>${recTable}</tbody></table></div>
      <p class="source-line">A conferência vale de ${esc(mName(RCV_FROM))} em diante; os meses anteriores (Move e transição para a Spott) ficam como histórico, sem correção. Diferença de até ${fmt.brl(TOL)} é arredondamento. Valor da P3 é gravado ao sair do campo. Diferença no recebido da UBY? Se faltou algo nas planilhas da Spott, lance uma receita extra "Ajuste de fechamento Spott" (avulso) no carregador, em Por carregador › Receitas extras: ela entra como recarga, com a taxa da Spott e o split.</p>
      ${head("aprovar", "3 · Aprovar e publicar", "Fechamentos da distribuição", "Aprovar congela os números do mês; publicar guarda os documentos de forma definitiva.")}
      ${closingsTab(w)}`;
  }

  // ---------- render ----------
  // As abas ficam no topo do painel (shell.js · NAV); aqui só os ids. Energia, repasse à área,
  // operação e contas mensais viraram blocos da página do carregador: os links antigos
  // (#/parametros/energia/<carregador>/inv:<id>…) abrem o bloco certo dela.
  const GROUPS = [
    ["Contas a pagar", [["contas", "Contas a pagar"], ["pagamentos", "Conciliação e extrato"]]],
    ["Parâmetros e custos", [["carregador", "Por carregador"], ["matriz", "Custos centrais"], ["documentos", "Documentos"], ["cotas", "Cotas, impostos e rodadas"]]],
    ["Resultado e fechamento", [["fechamento", "Fechamento do mês"]]]
  ];
  const LEGACY = { energia: "energia", area: "area", operacao: "operacao", programados: "custos" };
  const TAB_IDS = [...GROUPS.flatMap(g => g[1].map(t => t[0])), "programados"];
  // "O que falta no mês" e "Fechamentos" viraram blocos do Fechamento do mês.
  const CLOSING_ALIAS = { checklist: "falta", fechamentos: "aprovar" };
  async function render(target, params = []) {
    if (!params[0]) { location.replace(`#/parametros/${TAB_IDS.includes(ui.tab) && ui.tab !== "programados" ? ui.tab : "carregador"}`); return; }
    if (LEGACY[params[0]]) {
      const ref = params[1] && params[1] !== "-" ? decodeURIComponent(params[1]) : "-";
      const month = /^\d{4}-\d{2}$/.test(params[3] || "") ? `/${params[3]}` : "";
      location.replace(`#/parametros/carregador/${encodeURIComponent(ref)}/${encodeURIComponent(params[2] || `sec:${LEGACY[params[0]]}`)}${month}`);
      return;
    }
    if (CLOSING_ALIAS[params[0]]) {
      const month = /^\d{4}-\d{2}$/.test(params[3] || "") ? `/${params[3]}` : "";
      location.replace(`#/parametros/fechamento/-/${encodeURIComponent(`sec:${CLOSING_ALIAS[params[0]]}`)}${month}`);
      return;
    }
    if (TAB_IDS.includes(params[0])) {
      ui.tab = params[0];
      const ref = params[1] && params[1] !== "-" ? decodeURIComponent(params[1]) : "";
      if (ref && ui.tab === "carregador") selectCharger(ref);
      // Links dos custos (#/parametros/<aba>/<carregador>/<campo>/<competência>): abre no mês e destaca o campo.
      const month = /^\d{4}-\d{2}$/.test(params[3] || "") ? params[3] : "";
      if (month && ui.tab === "carregador" && month !== ui.month) { ui.month = month; ui.edits = {}; ui.rules = null; }
      if (month && ui.tab === "matriz") ui.matrixMonth = month;
      ui.focus = params[2] || "";
      const costId = ui.tab === "matriz" && ui.focus.startsWith("cost:") ? ui.focus.slice(5) : "";
      if (costId) { ui.editingCost = costId; ui.costForm = null; }
      if (ui.tab === "carregador" && ui.focus.startsWith("inv:")) { ui.enEditId = ui.focus.slice(4); ui.enDraft = null; }
      // Conta mensal: o carregador sai do próprio pagamento (achado quando o motor abrir).
      if (ui.tab === "carregador" && ui.focus.startsWith("pay:")) { ui.payEditing = ui.focus.slice(4); ui.payForm = null; ui.payLookup = ref ? "" : ui.payEditing; }
      if (month && (ui.tab === "pagamentos" || ui.tab === "fechamento")) { if (ui.tab === "pagamentos") ui.payMonth = month; else ui.ckMonth = month; }
    }
    target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Abrindo parâmetros e custos</h2><p>Carregando a plataforma original com a base completa. Na primeira vez leva alguns segundos.</p></div>`;
    let w;
    try { w = await engine(); } catch (err) { target.innerHTML = `<div class="loading"><h2>Não foi possível abrir</h2><p>${esc(err.message)}</p></div>`; return; }
    if (!location.hash.startsWith("#/parametros")) return;
    await draw(target, w);
  }

  let drawSeq = 0;
  async function draw(target, w) {
    // Enquanto o motor recarrega, a tela antiga não pode ficar à mostra com outro carregador já
    // escolhido no seletor (parecia que o Robert Koch mostrava a regra do Central JK). Se demorar,
    // mostra "carregando"; e um desenho atrasado nunca cobre o mais novo.
    const seq = ++drawSeq;
    const slow = setTimeout(() => { if (seq === drawSeq) target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Atualizando</h2><p>Esperando o motor terminar de recalcular…</p></div>`; }, 400);
    try { await drawNow(target, w, seq); } finally { clearTimeout(slow); }
  }

  async function drawNow(target, w, seq) {
    const data = { chargers: chargers(w), months: [], form: null };
    // Links de outras telas usam o nome da estação das recargas (ex.: "UBY RECHARGE - CENTRAL JK");
    // aqui o carregador tem o nome da obra ("POSTO CENTRAL JK"). Acha o mesmo carregador pela obra.
    ["charger", "enCharger", "arCharger", "opCharger"].forEach(k => { ui[k] = resolveKey(data.chargers, ui[k]); });
    const writable = canWrite(w);
    // Link de uma conta mensal sem carregador no endereço: abre no carregador dela; conta central (sem carregador) abre na lista antiga.
    if (ui.payLookup) {
      const it = w.loadMatrizCosts().find(i => i.id === ui.payLookup);
      ui.payLookup = "";
      const t0 = (it?.targets || [])[0];
      const wid = String(t0?.workId || String(t0?.scope || "").split("::")[0] || "");
      const cand = data.chargers.filter(x => x.workId === wid);
      const hit = cand.find(x => normSt(x.station) === normSt(t0?.station)) || cand[0];
      if (hit) { const pe = ui.payEditing; selectCharger(hit.key); ui.payEditing = pe; ui.payForm = null; }
      else if (it) { ui.tab = "programados"; ui.payMonth = ui.month || ui.payMonth; }
    }
    if (ui.tab === "carregador") {
      // Resultado oficial por competência precisa do histórico completo no motor principal.
      for (let i = 0; i < 120 && !(UBY.state.api && UBY.state.status); i++) await new Promise(r => setTimeout(r, 500));
      try { await Promise.race([UBY.state.api.loadFull(), new Promise(r => setTimeout(r, 15000))]); } catch (_) {}
      if (!ui.charger) ui.charger = (data.chargers.find(c => c.included && ["uby", "hybrid"].includes(c.model)) || data.chargers[0] || {}).key || "";
      if (ui.charger) {
        const opened = await openCharger(w, ui.charger, ui.month);
        data.months = opened.months; ui.month = opened.mk;
        if (Object.keys(ui.edits).length || ui.rules) applyToEngine(w);
        data.form = readForm(w);
        ui.enCharger = ui.arCharger = ui.opCharger = ui.charger;
        ui.payMonth = ui.month;
        try { data.cdocs = await w.UBY_SUPABASE.loadFinanceDocuments({ scope: "charger", workId: ui.charger.split("|")[0], limit: 100 }); data.docsError = ""; }
        catch (err) { data.cdocs = []; data.docsError = err.message; }
      }
    } else {
      data.months = (UBY.state.months && UBY.state.months.length ? UBY.state.months : (w.getMonths?.() || [])).slice();
      if (ui.tab === "energia" || ui.tab === "area" || ui.tab === "pagamentos" || ui.tab === "contas" || ui.tab === "fechamento") {
        // Depois de gravar, o motor principal recarrega: espera ele voltar com o histórico completo.
        for (let i = 0; i < 120 && !(UBY.state.api && UBY.state.status); i++) await new Promise(r => setTimeout(r, 500));
        try { await Promise.race([UBY.state.api.loadFull(), new Promise(r => setTimeout(r, 15000))]); } catch (_) {}
      }
      if (ui.tab === "fechamento") {
        try { data.bank = (await w.UBY_SUPABASE.loadBankData()).payload || null; data.bankError = ""; }
        catch (err) { data.bank = null; data.bankError = err.message; }
      }
      if (ui.tab === "contas") {
        try { const [m, c] = await Promise.all([w.UBY_SUPABASE.loadFinanceDocuments({ limit: 200 }), w.UBY_SUPABASE.loadFinanceDocuments({ scope: "charger", limit: 200 })]); data.billDocs = [...(m || []), ...(c || [])]; }
        catch (_) { data.billDocs = []; }
      }
      if (ui.tab === "pagamentos" || ui.tab === "contas") {
        try { data.bills = UBY.state.api.allBills(); } catch (err) { data.bills = []; }
        try { data.bank = (await w.UBY_SUPABASE.loadBankData()).payload || null; data.bankError = ""; }
        catch (err) { data.bank = null; data.bankError = err.message; }
      }
      if (ui.tab === "documentos") {
        const mk = ui.docMonth || data.months.at(-1) || "";
        ui.docMonth = mk;
        try {
          const [matrixDocs, chargerDocs] = await Promise.all([w.UBY_SUPABASE.loadFinanceDocuments({ competenceKey: mk, limit: 200 }), w.UBY_SUPABASE.loadFinanceDocuments({ scope: "charger", competenceKey: mk, limit: 200 })]);
          data.docs = [...(matrixDocs || []), ...(chargerDocs || [])].sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
          data.docsError = "";
        }
        catch (err) { data.docs = []; data.docsError = err.message; }
      }
    }
    if (seq !== drawSeq) return;
    const c = data.chargers.find(x => x.key === ui.charger);
    const hero = {
      contas: ["Financeiro", "Contas a pagar", "Tudo o que a UBY tem a pagar, de todas as origens, numa lista só: vencidas, a vencer, pagas, por categoria, centro de custo e fornecedor."],
      pagamentos: ["Financeiro", "Conciliação bancária", "Anexe o extrato do banco: a plataforma sugere a conta de cada saída, você confirma, e a conta fica paga na data e no valor do banco."],
      carregador: ["Parâmetros e custos", "Centro de custos do carregador", "Tudo de um carregador numa página: resultado, contrato e splits, energia, repasse à área, custos e contas, operação e documentos."],
      matriz: ["Parâmetros e custos", "Custos centrais", "Custos divididos entre os carregadores UBY (aluguel da sede, contador, seguros gerais…), com o rateio gravado por competência."],
      programados: ["Parâmetros e custos", "Contas mensais", "Contas mensais da rede, por competência."],
      fechamento: ["Resultado e fechamento", "Fechamento do mês", "Tudo do fechamento numa página: o que falta, conferência dos recebidos da UBY e da P3, aprovação e documentos publicados."]
    }[ui.tab] || ["Parâmetros e custos", "Parâmetros e custos", "Documentos, fechamento do mês, cotas, impostos e rodadas. As contas e a gravação são as mesmas da plataforma original."];
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">${esc(hero[0])}</p><h1>${esc(hero[1])}</h1><p class="lead">${esc(hero[2])}</p></div>
        <div class="callout" style="${writable ? "border-left-color:var(--uby-red)" : ""}"><strong>${writable ? "Grava na base real" : "Somente leitura"}</strong><small>${writable ? "A mesma base da plataforma atual. Cada alteração fica no histórico por competência e no log de auditoria." : "A liberação de gravação desta tela não está ativa. Recarregue a página."}</small></div></div>
      ${ui.tab === "carregador" ? chargerPage(w, data) : ui.tab === "matriz" ? matrixTab(w, data) : ui.tab === "pagamentos" ? centralTab(w, data) : ui.tab === "contas" ? contasTab(w, data) : ui.tab === "programados" ? paymentsTab(w) : ui.tab === "documentos" ? docsTab(w, data) : ui.tab === "fechamento" ? closingPage(w, data) : quotasTab(w)}
      <section class="section"><div class="section-head"><div><p class="kicker">Registro</p><h2>O que foi feito nesta sessão</h2></div></div>
        <div class="list">${ui.log.map(l => `<div class="list-row" style="display:block;white-space:normal"><span class="badge ${l.cls}">${l.cls === "ok" ? "ok" : "atenção"}</span> <small>${new Date(l.at).toLocaleTimeString("pt-BR")}</small> ${esc(l.msg)}</div>`).join("") || `<div class="note">Nenhuma alteração ainda.${c ? ` Editando ${esc(c.station)}.` : ""}</div>`}</div></section>`;
    bind(target, w, data);
    applyFocus(target);
  }

  // Leva até o campo pedido pelo link do custo (uma vez só) e destaca por alguns segundos.
  function applyFocus(target) {
    const want = String(ui.focus || "").split(",").filter(Boolean);
    ui.focus = "";
    if (!want.length) return;
    const all = [...target.querySelectorAll("[data-focus]")];
    const el = want.map(k => all.find(x => x.dataset.focus === k) || all.find(x => x.dataset.focusAlt === k)).find(Boolean)
      || (want[0].startsWith("cost:") ? target.querySelector("#pmCostSave")?.closest("section") : null);
    if (!el) return;
    window.UBY_SCROLL_KEEP?.reset();
    el.scrollIntoView({ block: "center" });
    el.classList.add("focus-flash");
    const input = el.querySelector("input:not([type=checkbox]), select");
    if (input) input.focus({ preventScroll: true });
    setTimeout(() => el.classList.add("fade"), 2500);
    setTimeout(() => el.classList.remove("focus-flash", "fade"), 4000);
  }

  async function run(target, w, label, fn) {
    if (busy) return;
    busy = true;
    target.style.opacity = ".6";
    try { const msg = await fn(); log(`${label}: ${msg || "salvo"}`, "ok"); refreshPanels(); }
    catch (err) { log(`${label}: ${err.message}`, "bad"); }
    finally { busy = false; target.style.opacity = ""; }
    await draw(target, w);
  }

  function bind(target, w, data) {
    const $ = s => target.querySelector(s);
    const dirty = () => Object.keys(ui.edits).length || ui.rules;
    // --- pagamentos (central) + extrato ---
    const cBill = key => (data.bills || []).find(b => b.key === key);
    // Contas a pagar: visão rápida, filtros, seleção e baixa em lote.
    target.querySelectorAll("#cfView button").forEach(b => b.onclick = () => { ui.cf.view = b.dataset.v; ui.cPay = ""; draw(target, w); });
    target.querySelectorAll("select[data-cff], input[type=month][data-cff]").forEach(el => el.onchange = () => { ui.cf[el.dataset.cff] = el.value; draw(target, w); });
    target.querySelectorAll("input.search[data-cff]").forEach(el => el.oninput = () => { clearTimeout(el._t); el._t = setTimeout(() => { ui.cf.q = el.value; draw(target, w).then(() => { const n = target.querySelector("input.search[data-cff]"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 300); });
    target.querySelectorAll("[data-cf-sel]").forEach(cb => cb.onchange = () => { if (cb.checked) ui.cfSel.add(cb.dataset.cfSel); else ui.cfSel.delete(cb.dataset.cfSel); draw(target, w); });
    if ($("#cfAll")) $("#cfAll").onchange = e => { target.querySelectorAll("[data-cf-sel]").forEach(cb => { if (e.target.checked) ui.cfSel.add(cb.dataset.cfSel); else ui.cfSel.delete(cb.dataset.cfSel); }); draw(target, w); };
    if ($("#cfBulkClear")) $("#cfBulkClear").onclick = () => { ui.cfSel.clear(); draw(target, w); };
    if ($("#cfBulkPay")) $("#cfBulkPay").onclick = () => {
      const date = $("#cfBulkDate")?.value || new Date().toISOString().slice(0, 10);
      const list = [...ui.cfSel].map(cBill).filter(b => b && !b.paid);
      if (!list.length || !confirm(`Marcar ${list.length} conta(s) como pagas em ${fmtDay(date)}, com o valor previsto de cada uma (${fmt.brl(list.reduce((s, b) => s + b.amount, 0))})?`)) return;
      run(target, w, `${list.length} conta(s) pagas em ${fmtDay(date)}`, async () => { for (const b of list) await setBillPaid(w, b, date); ui.cfSel.clear(); return "salvo"; });
    };
    if ($("#pmCentralMonth")) $("#pmCentralMonth").onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { ui.payMonth = e.target.value; ui.cPay = ""; draw(target, w); } };
    target.querySelectorAll("[data-c-pay]").forEach(b => b.onclick = () => { ui.cPay = ui.cPay === b.dataset.cPay ? "" : b.dataset.cPay; draw(target, w); });
    target.querySelectorAll("[data-c-cancel]").forEach(b => b.onclick = () => { ui.cPay = ""; draw(target, w); });
    target.querySelectorAll("[data-c-doc]").forEach(b => b.onclick = () => { ui.cDoc = ui.cDoc === b.dataset.cDoc ? "" : b.dataset.cDoc; ui.cPay = ""; draw(target, w); });
    target.querySelectorAll("[data-c-doc-close]").forEach(b => b.onclick = () => { ui.cDoc = ""; draw(target, w); });
    const saveSched = (bill, value) => run(target, w, `${value ? "Agendada no banco" : "Agendamento retirado"} · ${bill.name}`, async () => {
      await w.UBY_SUPABASE.saveBankData(p => { const scheduled = { ...(p.scheduled || {}) }; if (value) scheduled[bill.key] = value; else delete scheduled[bill.key]; return { statements: [], transactions: [], ...p, scheduled }; },
        { acao: value ? "bill_scheduled" : "bill_unscheduled", conta: bill.key, data: value?.date || "" });
      ui.cDoc = "";
      return value ? `débito em ${fmtDay(value.date)}` : "retirado";
    });
    target.querySelectorAll("[data-c-sched]").forEach(btn => btn.onclick = () => {
      const bill = cBill(btn.dataset.cSched); const date = target.querySelector("[data-c-sched-date]")?.value;
      if (!bill || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) { alert("Informe a data do débito."); return; }
      saveSched(bill, { date, at: new Date().toISOString().slice(0, 10), by: UBY.state.status?.user?.email || "" });
    });
    target.querySelectorAll("[data-c-unsched]").forEach(btn => btn.onclick = () => { const bill = cBill(btn.dataset.cUnsched); if (bill) saveSched(bill, null); });
    target.querySelectorAll("[data-c-doc-save]").forEach(btn => btn.onclick = () => {
      const bill = cBill(btn.dataset.cDocSave); const file = target.querySelector("[data-c-doc-file]")?.files?.[0];
      if (!bill) return;
      if (!file) { alert("Escolha o arquivo (PDF ou imagem)."); return; }
      const type = target.querySelector("[data-c-doc-type]")?.value || "boleto", num = target.querySelector("[data-c-doc-num]")?.value || "";
      run(target, w, `Documento · ${bill.name}`, async () => {
        await w.UBY_SUPABASE.createFinanceDocument({
          scope: bill.workId ? "charger" : "matrix", workId: bill.workId || null, matrixCostId: bill.kind === "matriz" ? bill.billId : null, competenceKey: bill.monthKey,
          supplier: bill.supplier || bill.name, category: billCategory(bill), documentNumber: num, documentType: type, amount: Number(bill.amount) || 0, dueDate: bill.due || null,
          status: bill.paid ? "paid" : "pending", notes: `${bill.name} · conta:${bill.key}`
        }, file);
        return `${file.name} anexado`;
      });
    });
    target.querySelectorAll("[data-c-confirm]").forEach(btn => btn.onclick = () => {
      const bill = cBill(btn.dataset.cConfirm); if (!bill) return;
      const date = target.querySelector("[data-c-date]")?.value || new Date().toISOString().slice(0, 10);
      const opts = {};
      const amt = target.querySelector("[data-c-amount]");
      if (amt) {
        const v = Math.round(Number(String(amt.value).replace(",", ".")) * 100) / 100;
        if (!Number.isFinite(v) || v < 0) { alert("Informe o valor pago."); return; }
        opts.amount = v; opts.due = Number(amt.dataset.due); opts.diffMode = target.querySelector("[data-c-diff]")?.value;
      }
      ui.cPay = "";
      run(target, w, `${bill.name} pago em ${fmtDay(date)}`, () => setBillPaid(w, bill, date, opts));
    });
    target.querySelectorAll("[data-c-paybank]").forEach(btn => btn.onclick = () => {
      const [key, date, amount] = btn.dataset.cPaybank.split("|");
      const bill = cBill(key); if (!bill) return;
      const opts = (bill.kind === "area" || bill.kind === "matriz") && amount !== "" ? { amount: Number(amount), due: Number(bill.dueAmount ?? bill.amount), diffMode: "next" } : {};
      run(target, w, `${bill.name} pago em ${fmtDay(date)} (extrato)`, () => setBillPaid(w, bill, date, opts));
    });
    target.querySelectorAll("[data-c-unpay]").forEach(btn => btn.onclick = () => {
      const bill = cBill(btn.dataset.cUnpay); if (!bill) return;
      if (!confirm(`Desfazer o pagamento de "${bill.name}"?`)) return;
      run(target, w, `${bill.name} reaberto`, () => setBillPaid(w, bill, ""));
    });
    if ($("#pmBankFile")) $("#pmBankFile").onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      const B = window.UBY_BANK;
      let parsed;
      try {
        if (/\.(ofx|txt)$/i.test(file.name)) parsed = B.parseOFX(await file.text());
        else if (/\.csv$/i.test(file.name)) {
          // CSV lido aqui (vírgula decimal e dia/mês certos); acentos em UTF-8 ou Windows-1252.
          const buf = await file.arrayBuffer();
          let text = new TextDecoder("utf-8").decode(buf);
          if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
          parsed = B.parseCSV(text);
        } else {
          // A biblioteca de planilhas é carregada sob demanda pela plataforma original.
          let X = w.XLSX;
          if (!X && typeof w.ensureSpreadsheetLibrary === "function") { try { X = await w.ensureSpreadsheetLibrary(); } catch (_) {} X = X || w.XLSX; }
          if (!X) throw new Error("Não consegui carregar o leitor de planilhas (verifique a internet e tente de novo).");
          // Os bytes precisam ser do mesmo "window" da biblioteca (senão ela lê o arquivo como texto).
          const buf = await file.arrayBuffer();
          const bytes = new w.Uint8Array(buf.byteLength);
          bytes.set(new Uint8Array(buf));
          const wb = X.read(bytes, { type: "array" });
          const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
          parsed = B.parseRows(rows);
        }
      } catch (err) { log(`Extrato ${file.name}: ${err.message}`, "bad"); draw(target, w); return; }
      let res = null;
      run(target, w, `Extrato ${file.name}`, async () => {
        await w.UBY_SUPABASE.saveBankData(p => { res = B.merge(p, parsed, file.name); return res.payload; }, { acao: "import_statement", arquivo: file.name, de: parsed.meta.from, ate: parsed.meta.to });
        let tax = ""; try { tax = ` · ${await syncTaxLines(w)}`; } catch (err) { tax = ` · impostos não atualizados: ${err.message}`; }
        return `${res.total} lançamento(s) de ${fmtDay(parsed.meta.from)} a ${fmtDay(parsed.meta.to)}, ${res.added} novo(s)${tax}`;
      });
    };
    target.querySelectorAll("[data-bank-src]").forEach(sel => sel.onchange = () => {
      const id = sel.dataset.bankSrc, v = sel.value;
      saveLinks(`Entrada classificada como ${v}`, l => { l[id] = { ...(l[id] || {}), source: v }; }, () => syncTaxLines(w));
    });
    target.querySelectorAll("[data-bank-del-st]").forEach(btn => btn.onclick = () => {
      const st = (data.bank?.statements || []).find(s => s.id === btn.dataset.bankDelSt); if (!st) return;
      const n = (data.bank?.transactions || []).filter(t => t.statementId === st.id).length;
      if (!confirm(`Remover o extrato "${st.fileName || "extrato"}" (${fmtDay(st.from)} a ${fmtDay(st.to)}) e os ${n} lançamento(s) que ele trouxe? Contas já marcadas como pagas continuam pagas.`)) return;
      let removed = 0;
      run(target, w, `Extrato ${st.fileName || ""} removido`, async () => {
        await w.UBY_SUPABASE.saveBankData(p => { const r = window.UBY_BANK.removeStatement(p, st.id); removed = r.removed; return r.payload; }, { acao: "remove_statement", arquivo: st.fileName, de: st.from, ate: st.to });
        return `${removed} lançamento(s) removido(s)`;
      });
    });
    // after (opcional): roda depois de gravar o vínculo, ex. recalcular os impostos quando a origem de uma entrada muda.
    const saveLinks = (label, mutate, after) => run(target, w, label, async () => {
      await w.UBY_SUPABASE.saveBankData(p => { const links = { ...(p.links || {}) }; mutate(links); return { statements: [], transactions: [], ...p, links }; }, { acao: "bank_link" });
      if (!after) return "salvo";
      try { return `salvo · ${await after()}`; } catch (err) { return `salvo · impostos não atualizados: ${err.message}`; }
    });
    if ($("#pmTaxSync")) $("#pmTaxSync").onclick = () => run(target, w, "Impostos sobre o recebido", () => syncTaxLines(w));
    target.querySelectorAll("[data-tax-force]").forEach(b => b.onclick = () => run(target, w, "Imposto de volta à projeção", () => syncTaxLines(w, [b.dataset.taxForce])));
    // Conciliar: marca a(s) conta(s) como paga(s) na data e no valor do banco, guarda o vínculo e
    // aprende a regra (esta descrição do banco paga esta conta) para sugerir sozinho na próxima vez.
    const outRow = id => bankState(data).rec.outflows.find(t => t.id === id);
    const confirmTx = async (t, keys) => {
      const Bk = window.UBY_BANK;
      const list = keys.map(k => cBill(k)).filter(Boolean);
      if (!list.length) throw new Error("Conta não encontrada. Nada foi gravado.");
      for (const bill of list) {
        const partial = (bill.kind === "area" || bill.kind === "matriz") && list.length === 1;
        if (bill.paid) {
          // Complemento de conta paga em partes: o pago passa a ser a soma dos pagamentos.
          if (partial && bill.dueAmount !== undefined && Number(bill.dueAmount) - Number(bill.amount) > 0.009)
            await setBillPaid(w, bill, t.date > String(bill.paidAt || "").slice(0, 10) ? t.date : String(bill.paidAt).slice(0, 10), { amount: Math.round((Number(bill.amount) + t.value) * 100) / 100, due: Number(bill.dueAmount), diffMode: "next" });
          continue;
        }
        const opts = partial ? { amount: t.value, due: Number(bill.dueAmount ?? bill.amount), diffMode: "next" } : {};
        await setBillPaid(w, bill, t.date, opts);
      }
      await w.UBY_SUPABASE.saveBankData(p => {
        const links = { ...(p.links || {}) }, rules = { ...(p.rules || {}) };
        if (list.length === 1) links[t.id] = { bill: list[0].key };
        const k = Bk.norm(t.description);
        rules[k] = [...new Set([...(rules[k] || []), ...list.map(Bk.billBase)])].slice(-20);
        return { statements: [], transactions: [], ...p, links, rules };
      }, { acao: "bank_confirm", conta: list.map(b => b.name).join(" + "), valor: t.value, data: t.date });
      return `${list.map(b => b.name).join(" + ")} paga em ${fmtDay(t.date)} (${fmt.brl(t.value)})`;
    };
    target.querySelectorAll("[data-bank-confirm]").forEach(btn => btn.onclick = () => {
      const t = outRow(btn.dataset.bankConfirm); if (!t || !t.bills.length) return;
      run(target, w, "Conciliação", () => confirmTx(t, t.bills));
    });
    if ($("#pmBankConfirmExact")) $("#pmBankConfirmExact").onclick = () => {
      const list = bankState(data).rec.outflows.filter(t => t.date.slice(0, 7) === ui.payMonth && t.state === "confirmar" && Math.abs(t.diff) <= 0.009);
      if (!list.length || !confirm(`Confirmar ${list.length} pagamento(s) de valor exato? Cada conta fica paga na data do banco.`)) return;
      run(target, w, "Conciliação (valor exato)", async () => { const done = []; for (const t of list) done.push(await confirmTx(t, t.bills)); return `${done.length} conciliado(s)`; });
    };
    target.querySelectorAll("[data-bank-link]").forEach(sel => sel.onchange = () => {
      const id = sel.dataset.bankLink, v = sel.value;
      if (!v) return;
      if (v === "__all") { ui.bankAll = id; draw(target, w); return; }
      if (v === "__new") {
        // Conta nova já preenchida com a conta parecida (ex.: internet de outro carregador).
        const h = outRow(id)?.hint;
        ui.bankNew = id; ui.bankNewForm = h ? { name: h.name, supplier: h.supplier, category: h.category || "Outros custos" } : {};
        draw(target, w); return;
      }
      if (v === "__ignore") { const note = prompt("Motivo (opcional): ex.: transferência entre contas, retirada de sócio", "") ; if (note === null) { sel.value = ""; return; } saveLinks("Saída marcada como não sendo conta", l => { l[id] = { ignore: true, note: note.trim() }; }); }
      else { const t = outRow(id); if (!t) return; run(target, w, "Conciliação", () => confirmTx(t, [v])); }
    });
    target.querySelectorAll("[data-bn]").forEach(el => el.onchange = () => { ui.bankNewForm = { ...(ui.bankNewForm || {}), [el.dataset.bn]: el.value }; });
    target.querySelectorAll("[data-bank-new-cancel]").forEach(b => b.onclick = () => { ui.bankNew = ""; ui.bankNewForm = null; draw(target, w); });
    target.querySelectorAll("[data-bank-new-save]").forEach(btn => btn.onclick = () => {
      const tx = (data.bank?.transactions || []).find(t => t.id === btn.dataset.bankNewSave); if (!tx) return;
      const f = { category: "Internet / dados", name: tx.description, supplier: tx.description, ...(ui.bankNewForm || {}) };
      target.querySelectorAll("[data-bn]").forEach(el => { f[el.dataset.bn] = el.value; });
      const opt = [...(w.document.getElementById("scheduledPaymentTarget")?.options || [])].find(o => o.value === f.target);
      if (!opt || !String(f.name || "").trim()) { alert("Escolha o carregador e dê um nome à conta."); return; }
      const mk = tx.date.slice(0, 7), value = Math.round(-tx.amount * 100) / 100;
      ui.bankNew = ""; ui.bankNewForm = null;
      run(target, w, `Conta "${f.name}" lançada e vinculada (${fmt.brl(value)})`, async () => {
        await resyncMatrix(w);
        const [workId] = String(opt.value).split("::");
        const id = `p${Date.now().toString(36)}`;
        const item = w.matrizNormalizeCost({ id, name: String(f.name).trim(), amount: value, scheduledPayment: true, costKind: "recurring", installments: 1, coverageMonths: 1,
          category: f.category, supplier: String(f.supplier || "").trim(), startMonth: mk, endMonth: mk, dueDay: Number(tx.date.slice(8, 10)), allocation: "equal", enabled: true,
          paymentLedger: { [mk]: { status: "paid", paidAt: `${tx.date}T12:00:00`, updatedAt: new Date().toISOString() } },
          targets: [{ scope: opt.value, workId, station: opt.dataset.station || "", workName: opt.dataset.workName || "", startMonth: mk, share: 100 }] });
        w.saveMatrizCosts([...w.loadMatrizCosts(), item]);
        await awaitMatrixSave(w);
        // Vincula e aprende: a mesma descrição do banco vai sugerir esta conta nos próximos meses.
        const nk = window.UBY_BANK.norm(tx.description);
        await w.UBY_SUPABASE.saveBankData(p => ({ statements: [], transactions: [], ...p, links: { ...(p.links || {}), [tx.id]: { bill: `${id}|${mk}` } },
          rules: { ...(p.rules || {}), [nk]: [...new Set([...((p.rules || {})[nk] || []), id])].slice(-20) } }), { acao: "bank_new_bill" });
        return "salvo";
      });
    });
    target.querySelectorAll("[data-bank-unlink]").forEach(b => b.onclick = () => saveLinks("Vínculo desfeito", l => { delete l[b.dataset.bankUnlink]; }));
    // --- repasse à área ---
    if ($("#pmArCharger")) $("#pmArCharger").onchange = e => { ui.arCharger = e.target.value; ui.arForm = null; draw(target, w); };
    target.querySelectorAll("[data-ar]").forEach(el => el.onchange = () => { ui.arForm[el.dataset.ar] = el.type === "checkbox" ? el.checked : el.dataset.ar === "dueDay" ? Number(el.value || 10) : el.value; draw(target, w); });
    target.querySelectorAll("[data-ar-split-clear]").forEach(b => b.onclick = () => { ui.arForm.splitAtSourceFrom = ""; draw(target, w); });
    const arCtx = () => { const c = data.chargers.find(x => x.key === ui.arCharger); const a = UBY.state.api.areaAccount(c.workId, c.station); return { c, a }; };
    const arSave = (label, mutate) => { const { c, a } = arCtx(); const next = mutate({ reimburseEnergy: a.config.reimburseEnergy, payee: a.config.payee, payeeEmail: a.config.payeeEmail || "", dueDay: a.config.dueDay, splitAtSourceFrom: a.config.splitAtSourceFrom || "", showSessions: !!a.config.showSessions, showAvgTime: !!a.config.showAvgTime, showClients: !!a.config.showClients, showOccTime: !!a.config.showOccTime, showOccupancy: !!a.config.showOccupancy, showPeak: !!a.config.showPeak, showNewClients: !!a.config.showNewClients, showDaily: !!a.config.showDaily, energyByHost: !!a.config.energyByHost, paid: { ...(a.config.paid || {}) }, paidInfo: { ...(a.config.paidInfo || {}) }, adjust: { ...(a.config.adjust || {}) } });
      run(target, w, `${label} · ${c.station}`, async () => { await saveChargerField(w, c.workId, c.station, c.workName, "areaAccount", next); ui.arForm = null; return "salvo"; }); };
    // --- tarifa pela fatura do posto (reembolso) ---
    if ($("#pmPiPdf")) $("#pmPiPdf").onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      ui.piRead = { ok: false, error: "lendo…", file: file.name }; draw(target, w);
      const res = await window.UBY_COPEL.read(file);
      ui.piRead = { ...res, file: file.name }; ui.piFile = res.ok ? file : null;
      draw(target, w);
    };
    if ($("#pmPiMonth")) $("#pmPiMonth").onchange = e => { ui.piMonth = e.target.value; draw(target, w); };
    if ($("#pmPiSave")) $("#pmPiSave").onclick = () => {
      const { c } = arCtx();
      const f = ui.piRead?.fields, rate = Number(f?.energyRate) || 0, mk = ui.piMonth;
      if (!(rate > 0) || !/^\d{4}-\d{2}$/.test(mk || "")) return;
      if ((Object.keys(ui.edits).length || ui.rules) && !confirm("Há alterações não salvas em Por carregador. Descartar e gravar a tarifa da fatura?")) return;
      run(target, w, `Tarifa da fatura do posto · ${c.station} · ${mk}`, async () => {
        await resyncMatrix(w);
        await openCharger(w, c.key, mk);
        ui.edits = { financeEnergyCost: String(rate) }; ui.rules = null;
        applyToEngine(w);
        w.scheduleFinancialSettingsSave();
        await w.commitPendingFinancialSettingsSave();
        ui.edits = {}; ui.charger = c.key; ui.month = mk;
        let saved = "";
        if (ui.piFile) {
          const doc = await w.UBY_SUPABASE.createFinanceDocument({ scope: "charger", workId: c.workId, competenceKey: mk, supplier: "Copel", category: "Energia",
            documentNumber: f.nfNumber || "", documentType: "fatura", amount: Number(f.copelAmount) || 0, dueDate: f.dueDate || null, status: "pending",
            notes: `Fatura do posto ${f.ref || ""}${f.uc ? ` · UC ${f.uc}` : ""} · tarifa de energia com tributos R$ ${rate}/kWh aplicada em ${mk} (reembolso ao local)` }, ui.piFile);
          if (doc?.id) saved = " · fatura guardada em Documentos";
        }
        ui.piRead = null; ui.piFile = null;
        return `tarifa R$ ${rate.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}/kWh gravada em ${mk}${saved}`;
      });
    };
    if ($("#pmArSave")) $("#pmArSave").onclick = () => arSave("Regra do repasse à área", cfg => ({ ...cfg, reimburseEnergy: !!ui.arForm.reimburseEnergy, payee: String(ui.arForm.payee || "").trim() || cfg.payee, payeeEmail: String(ui.arForm.payeeEmail || "").trim().toLowerCase(), dueDay: Math.min(Math.max(Number(ui.arForm.dueDay) || 10, 1), 28), splitAtSourceFrom: /^\d{4}-\d{2}$/.test(ui.arForm.splitAtSourceFrom || "") ? ui.arForm.splitAtSourceFrom : "", showSessions: !!ui.arForm.showSessions, showAvgTime: !!ui.arForm.showAvgTime, showClients: !!ui.arForm.showClients, showOccTime: !!ui.arForm.showOccTime, showOccupancy: !!ui.arForm.showOccupancy, showPeak: !!ui.arForm.showPeak, showNewClients: !!ui.arForm.showNewClients, showDaily: !!ui.arForm.showDaily, energyByHost: !!ui.arForm.energyByHost }));
    target.querySelectorAll("[data-ar-pay-open]").forEach(b => b.onclick = () => { ui.arPay = ui.arPay === b.dataset.arPayOpen ? "" : b.dataset.arPayOpen; ui.arAdjust = ""; draw(target, w); });
    target.querySelectorAll("[data-ar-pay-cancel]").forEach(b => b.onclick = () => { ui.arPay = ""; draw(target, w); });
    target.querySelectorAll("[data-ar-pay]").forEach(b => b.onclick = () => {
      const mk = b.dataset.arPay;
      const d = target.querySelector(`[data-ar-date="${mk}"]`)?.value || new Date().toISOString().slice(0, 10);
      const input = target.querySelector("[data-ar-pay-amount]");
      const due = Number(input?.dataset.due || 0);
      const amount = Math.round(Number(String(input?.value || "").replace(",", ".")) * 100) / 100;
      if (!Number.isFinite(amount) || amount < 0) { alert("Informe o valor pago."); return; }
      const diff = Math.round((due - amount) * 100) / 100;
      const diffMode = target.querySelector("[data-ar-pay-diff]")?.value === "drop" ? "drop" : "next";
      ui.arPay = "";
      const label = diff ? `Repasse ${mk} pago ${fmt.brl(amount)} em ${d} · diferença ${fmt.brl(diff)} ${diffMode === "next" ? "para o mês seguinte" : "zerada"}` : `Repasse ${mk} pago em ${d}`;
      arSave(label, cfg => ({ ...cfg, paid: { ...cfg.paid, [mk]: d }, paidInfo: { ...cfg.paidInfo, [mk]: { amount, due, diff, diffMode } } }));
    });
    target.querySelectorAll("[data-ar-unpay]").forEach(b => b.onclick = () => { const mk = b.dataset.arUnpay; if (!confirm("Desfazer o pagamento deste repasse? A diferença levada ao mês seguinte também sai.")) return; arSave(`Repasse ${mk} reaberto`, cfg => { const paid = { ...cfg.paid }, paidInfo = { ...cfg.paidInfo }; delete paid[mk]; delete paidInfo[mk]; return { ...cfg, paid, paidInfo }; }); });
    target.querySelectorAll("[data-ar-adj]").forEach(b => b.onclick = () => { ui.arAdjust = ui.arAdjust === b.dataset.arAdj ? "" : b.dataset.arAdj; ui.arPay = ""; draw(target, w); });
    target.querySelectorAll("[data-ar-adj-cancel]").forEach(b => b.onclick = () => { ui.arAdjust = ""; draw(target, w); });
    target.querySelectorAll("[data-ar-adj-save]").forEach(b => b.onclick = () => {
      const mk = b.dataset.arAdjSave;
      const total = Number(String(target.querySelector("[data-ar-adj-total]")?.value || "").replace(",", "."));
      if (!Number.isFinite(total)) { alert("Informe um valor válido."); return; }
      const note = String(target.querySelector("[data-ar-adj-note]")?.value || "").trim();
      ui.arAdjust = "";
      arSave(`Repasse ${mk} ajustado para ${fmt.brl(total)}`, cfg => ({ ...cfg, adjust: { ...cfg.adjust, [mk]: { total: Math.round(total * 100) / 100, note } } }));
    });
    target.querySelectorAll("[data-ar-adj-clear]").forEach(b => b.onclick = () => { const mk = b.dataset.arAdjClear; ui.arAdjust = ""; arSave(`Repasse ${mk} voltou ao calculado`, cfg => { const adjust = { ...cfg.adjust }; delete adjust[mk]; return { ...cfg, adjust }; }); });
    const arReport = mk => { const { c } = arCtx(); UBY.reports.area(c.workId, c.station, mk); };
    if ($("#pmArReport")) $("#pmArReport").onclick = () => arReport("");
    target.querySelectorAll("[data-ar-rep]").forEach(b => b.onclick = () => arReport(b.dataset.arRep));
    // --- faturas de energia ---
    if ($("#pmEnCharger")) $("#pmEnCharger").onchange = e => { if (ui.enDraft && !confirm("Descartar as faturas não salvas?")) { e.target.value = ui.enCharger; return; } ui.enCharger = e.target.value; ui.enDraft = null; ui.enForm = null; ui.enRead = null; ui.enPendingFile = null; ui.enFiles = {}; draw(target, w); };
    const followEnCharger = () => {
      if (ui.tab !== "carregador" || !ui.enCharger || ui.enCharger === ui.charger) return;
      const keep = { enForm: ui.enForm, enRead: ui.enRead, enPendingFile: ui.enPendingFile }, k = ui.enCharger;
      selectCharger(k); Object.assign(ui, keep); ui.enCharger = k;
    };
    const enStored = () => { const [wid, st] = ui.enCharger.split("|"); return UBY.state.api.energyInvoices(wid, st)?.stored || []; };
    target.querySelectorAll("[data-ef]").forEach(el => el.onchange = () => { ui.enForm[el.dataset.ef] = el.value; draw(target, w); });
    target.querySelectorAll("[data-en-edit]").forEach(b => b.onclick = () => { const it = (ui.enDraft || enStored()).find(i => i.id === b.dataset.enEdit); if (it) { ui.enForm = { ...it }; draw(target, w); } });
    target.querySelectorAll("[data-en-del]").forEach(b => b.onclick = () => {
      const cur = ui.enDraft || enStored(); const it = cur.find(i => i.id === b.dataset.enDel);
      if (!it || !confirm(`Tirar a fatura ${it.ref || it.start} da lista? (só grava ao clicar em Salvar faturas)`)) return;
      ui.enDraft = cur.filter(i => i.id !== it.id); if (ui.enForm?.id === it.id) ui.enForm = null; draw(target, w);
    });
    if ($("#pmEnPdf")) $("#pmEnPdf").onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      ui.enRead = { ok: true, file: file.name, msg: "Lendo o PDF…" }; draw(target, w);
      const res = await window.UBY_COPEL.read(file);
      if (!res.ok) { ui.enRead = { ok: false, file: file.name, error: res.error }; draw(target, w); return; }
      applyCopelRead(res, file, data.chargers);
      followEnCharger();
      draw(target, w);
    };
    if ($("#pmEnNew")) $("#pmEnNew").onclick = () => { ui.enForm = null; ui.enRead = null; ui.enPendingFile = null; draw(target, w); };
    if ($("#pmEnDiscard")) $("#pmEnDiscard").onclick = () => { ui.enDraft = null; ui.enForm = null; ui.enRead = null; ui.enPendingFile = null; ui.enFiles = {}; draw(target, w); };
    if ($("#pmEnApply")) $("#pmEnApply").onclick = () => {
      const cur = (ui.enDraft || enStored()).slice();
      const inv = cleanInvoice(ui.enForm);
      const problems = invoiceProblems(inv, cur);
      if (problems.length) { alert(`Falta ou está errado:\n• ${problems.join("\n• ")}`); return; }
      const idx = cur.findIndex(i => i.id === inv.id);
      if (idx >= 0) cur[idx] = inv; else cur.push(inv);
      if (ui.enPendingFile) { ui.enFiles = { ...(ui.enFiles || {}), [inv.id]: ui.enPendingFile }; ui.enPendingFile = null; }
      ui.enDraft = cur.sort((a, b) => a.start.localeCompare(b.start)); ui.enForm = null; ui.enRead = null; draw(target, w);
    };
    if ($("#pmEnSave")) $("#pmEnSave").onclick = () => {
      const c = data.chargers.find(x => x.key === ui.enCharger); if (!c || !ui.enDraft) return;
      const list = ui.enDraft.map(i => ({ ...i }));
      const files = ui.enFiles || {};
      run(target, w, `Faturas de energia · ${c.station}`, async () => {
        // Primeiro guarda os PDFs (privados, em Documentos do carregador); depois a lista com o vínculo.
        let sent = 0;
        for (const inv of list) {
          const file = files[inv.id];
          if (!file) continue;
          const doc = await w.UBY_SUPABASE.createFinanceDocument({
            scope: "charger", workId: c.workId, competenceKey: inv.ref || String(inv.end).slice(0, 7), supplier: "Copel", category: "Energia",
            documentNumber: inv.nfNumber || "", documentType: "fatura", amount: Number(inv.copelAmount) || 0, dueDate: inv.dueDate || null,
            status: inv.paidAt ? "paid" : "pending", notes: `Fatura de energia ${inv.ref || ""} · ${c.station}${inv.uc ? ` · UC ${inv.uc}` : ""} · leitura ${inv.start} a ${inv.end}`
          }, file);
          inv.documentId = doc?.id || inv.documentId || "";
          sent++;
        }
        const msg = await saveInvoices(w, c.workId, c.station, c.workName, list);
        ui.enDraft = null; ui.enForm = null; ui.enFiles = {}; ui.enRead = null;
        return sent ? `${msg} · ${sent} PDF(s) guardado(s)` : msg;
      });
    };
    // --- por carregador ---
    if ($("#pmCharger")) $("#pmCharger").onchange = e => { if ((dirty() || ui.enDraft) && !confirm("Descartar as alterações não salvas?")) { e.target.value = ui.charger; return; } selectCharger(e.target.value); draw(target, w); };
    target.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => target.querySelector(`#${b.dataset.jump}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const ccCharger = () => data.chargers.find(x => x.key === ui.charger);
    if ($("#ccNewOpen")) $("#ccNewOpen").onclick = () => { ui.ncOpen = true; ui.focus = "nc"; draw(target, w); };
    if ($("#ccNewBox")) $("#ccNewBox").addEventListener("toggle", e => { ui.ncOpen = e.target.open; });
    if ($("#ccDocBox")) $("#ccDocBox").addEventListener("toggle", e => { ui.docOpen = e.target.open; });
    target.querySelectorAll("[data-nc]").forEach(el => {
      el.onchange = () => { ui.nc[el.dataset.nc] = el.value; if (["kind", "costKind", "basis"].includes(el.dataset.nc)) { if (el.dataset.nc === "kind") ui.nc.payOnly = false; draw(target, w); } };
      el.oninput = () => { ui.nc[el.dataset.nc] = el.value; const calc = $("#ccNcCalc"); if (calc) calc.innerHTML = installmentCalc({ amount: ui.nc.amount, installments: ui.nc.installments, coverage: ui.nc.coverage, startMonth: ui.nc.startMonth }); };
    });
    target.querySelectorAll("[data-cc-sync]").forEach(b => b.onclick = () => {
      const c = ccCharger(); const [idx, amount] = b.dataset.ccSync.split("|"); const r = data.form.cost[Number(idx)]; if (!c || !r) return;
      if (dirty()) { alert("Salve ou descarte antes as alterações do contrato e dos custos."); return; }
      if (!confirm(`Usar ${fmt.brl(Number(amount))} em "${r.label}" no resultado de ${c.station}, a partir de ${UBY.state.api?.monthName?.(ui.month) || ui.month}?`)) return;
      run(target, w, `${r.label} · ${c.station}`, async () => { await saveChargerRules(w, c, ui.month, x => { x.cost[Number(idx)].value = Number(amount); }); return `${fmt.brl(Number(amount))}/mês a partir de ${ui.month}`; });
    });
    target.querySelectorAll("[data-cc-zero]").forEach(b => b.onclick = () => { ui.ccShowZero = !ui.ccShowZero; draw(target, w); });
    if ($("#ccNewReset")) $("#ccNewReset").onclick = () => { ui.nc = null; ui.ncOpen = false; draw(target, w); };
    target.querySelectorAll("[data-cc-mkpay]").forEach(b => b.onclick = () => {
      const r = (ui.rules || data.form).cost[Number(b.dataset.ccMkpay)]; if (!r) return;
      ui.nc = { kind: "monthly", payOnly: true, name: r.label, supplier: "", category: /internet|dados|chip/i.test(r.label) ? "Internet / dados" : /alug|loca/i.test(r.label) ? "Locação / aluguel" : /segur/i.test(r.label) ? "Seguro" : /manut/i.test(r.label) ? "Manutenção" : "Outros custos", amount: r.value, dueDay: 11, startMonth: ui.month, endMonth: "", basis: "fixed", costKind: "recurring", installments: 1, coverage: 12 };
      ui.ncOpen = true; ui.focus = "nc"; draw(target, w);
    });
    target.querySelectorAll("[data-cc-toresult]").forEach(b => b.onclick = () => {
      const c = ccCharger(); const i = w.loadMatrizCosts().find(x => x.id === b.dataset.ccToresult); if (!c || !i) return;
      if (dirty()) { alert("Salve ou descarte antes as alterações do contrato e dos custos."); return; }
      if (!confirm(`Incluir "${i.name}" (${fmt.brl(i.amount)} por mês) no resultado de ${c.station} a partir de ${UBY.state.api?.monthName?.(ui.month) || ui.month}?`)) return;
      const k = costKindOf(`${i.name} ${i.category}`);
      run(target, w, `${i.name} no resultado · ${c.station}`, async () => {
        await saveChargerRules(w, c, ui.month, r => {
          const slot = k >= 0 ? r.cost.find(x => !(Number(x.value) > 0) && !x.custom && costKindOf(`${x.id} ${x.label}`) === k) : null;
          if (slot) Object.assign(slot, { enabled: true, basis: "fixed", value: Number(i.amount) }); else r.cost.push(newRule(i.name, "fixed", i.amount));
        });
        return `${fmt.brl(i.amount)}/mês a partir de ${ui.month}`;
      });
    });
    if ($("#ccNewSave")) $("#ccNewSave").onclick = () => {
      const c = ccCharger(), n = ui.nc; if (!c || !n) return;
      const name = String(n.name || "").trim(), amount = Number(String(n.amount).replace(",", "."));
      if (!name || !(amount > 0)) { alert("Informe o nome e o valor."); return; }
      if (dirty()) { alert("Salve ou descarte antes as alterações do contrato e dos custos (botões no topo)."); return; }
      const start = /^\d{4}-\d{2}$/.test(n.startMonth || "") ? n.startMonth : ui.month;
      if (n.kind === "monthly") {
        const payTarget = payTargetFor(w, c).value;
        if (!payTarget) { alert("Não achei este carregador na lista de contas mensais."); return; }
        run(target, w, `Conta mensal ${name} · ${c.station}`, async () => {
          const fb = await addScheduled(w, { target: payTarget, name, supplier: n.supplier, category: n.category, amount, dueDay: Number(n.dueDay) || 11, startMonth: start, endMonth: n.endMonth || "" }, ui.month);
          let res = "";
          if (!n.payOnly) { const m = data.months.includes(start) ? start : ui.month; await saveChargerRules(w, c, m, r => r.cost.push(newRule(name, "fixed", amount))); res = ` · no resultado a partir de ${m}`; }
          ui.nc = null; ui.ncOpen = false;
          return `${fb || "conta criada"}${res}`;
        });
      } else if (n.kind === "result") {
        run(target, w, `Custo ${name} · ${c.station}`, async () => { await saveChargerRules(w, c, ui.month, r => r.cost.push(newRule(name, n.basis || "fixed", amount))); ui.nc = null; ui.ncOpen = false; return `no resultado a partir de ${ui.month}`; });
      } else {
        const scope = matrixScopeFor(w, c, start);
        if (!scope) { alert("Este carregador não está entre os ativos UBY dessa competência: não dá para lançar boleto próprio nele."); return; }
        run(target, w, `Custo ${name} · ${c.station}`, async () => {
          const fb = await saveMatrixCost(w, { name, amount, category: n.category, supplier: n.supplier, kind: n.costKind, installments: n.installments, coverage: n.coverage, startMonth: start, endMonth: n.endMonth || "", dueDay: Number(n.dueDay) || 1, method: "equal", shares: "", documentRef: "", notes: `Exclusivo de ${c.station}`, targets: [scope] }, start, "");
          ui.nc = null; ui.ncOpen = false;
          return fb || "salvo";
        });
      }
    };
    if ($("#pmMonth")) $("#pmMonth").onchange = e => { if (dirty() && !confirm("Descartar as alterações não salvas?")) { e.target.value = ui.month; return; } ui.month = e.target.value; ui.edits = {}; ui.rules = null; draw(target, w); };
    target.querySelectorAll("[data-ctl]").forEach(el => el.onchange = () => { ui.edits[el.dataset.ctl] = el.value; draw(target, w); });
    const ensureRules = () => { if (!ui.rules) ui.rules = { cost: data.form.cost.map(r => ({ ...r })), revenue: data.form.revenue.map(r => ({ ...r })) }; };
    target.querySelectorAll("[data-rule]").forEach(el => el.onchange = () => { ensureRules(); const [kind, i, fieldName] = el.dataset.rule.split("|"); const r = ui.rules[kind][Number(i)]; r[fieldName] = fieldName === "enabled" ? el.checked : fieldName === "value" ? Number(el.value || 0) : el.value; draw(target, w); });
    target.querySelectorAll("[data-rule-add]").forEach(b => b.onclick = () => { ensureRules(); const kind = b.dataset.ruleAdd; ui.rules[kind].push({ id: `custom-${kind}-${Date.now()}`, label: kind === "revenue" ? "Nova receita" : "Novo custo", enabled: true, basis: "fixed", value: 0, scope: "operational", custom: true }); draw(target, w); });
    target.querySelectorAll("[data-rule-del]").forEach(b => b.onclick = () => { ensureRules(); const [kind, i] = b.dataset.ruleDel.split("|"); ui.rules[kind].splice(Number(i), 1); draw(target, w); });
    if ($("#pmSimulate")) $("#pmSimulate").onclick = () => draw(target, w);
    if ($("#pmDiscard")) $("#pmDiscard").onclick = () => { ui.edits = {}; ui.rules = null; w.renderFinanceiro(true); draw(target, w); };
    if ($("#pmSave")) $("#pmSave").onclick = () => run(target, w, `Parâmetros ${data.chargers.find(x => x.key === ui.charger)?.station || ""} · ${ui.month}`, async () => {
      await resyncMatrix(w); // a gravação também atualiza os pagamentos de energia da matriz
      applyToEngine(w);
      w.scheduleFinancialSettingsSave();
      await w.commitPendingFinancialSettingsSave();
      ui.edits = {}; ui.rules = null;
      return txt(w.document.getElementById("storageState")) || "competência salva";
    });
    // --- matriz ---
    if ($("#pmMatrixMonth")) $("#pmMatrixMonth").onchange = e => { ui.matrixMonth = e.target.value; ui.costForm = null; draw(target, w); };
    target.querySelectorAll("[data-cf]").forEach(el => {
      el.onchange = () => { ui.costForm[el.dataset.cf] = el.value; if (["method", "startMonth", "kind"].includes(el.dataset.cf)) draw(target, w); };
      // Conta do parcelado atualiza enquanto digita, sem redesenhar a tela.
      el.oninput = () => { ui.costForm[el.dataset.cf] = el.value; const calc = $("#pmCostCalc"); if (calc) calc.innerHTML = installmentCalc(ui.costForm); };
    });
    target.querySelectorAll("[data-cf-target]").forEach(el => el.onchange = () => { const s = el.dataset.cfTarget; ui.costForm.targets = el.checked ? [...new Set([...ui.costForm.targets, s])] : ui.costForm.targets.filter(x => x !== s); });
    target.querySelectorAll("[data-cost-edit]").forEach(b => b.onclick = () => { ui.editingCost = b.dataset.costEdit; ui.costForm = null; draw(target, w); });
    if ($("#pmCostCancel")) $("#pmCostCancel").onclick = () => { ui.editingCost = ""; ui.costForm = null; draw(target, w); };
    if ($("#pmCostSave")) $("#pmCostSave").onclick = () => {
      const f = ui.costForm;
      if (!String(f.name || "").trim() || !(Number(f.amount) > 0)) { log("Custo da matriz: informe nome e valor.", "bad"); draw(target, w); return; }
      run(target, w, `Custo da matriz ${f.name}`, async () => {
        const fb = await saveMatrixCost(w, f, ui.matrixMonth || data.months.at(-1) || "", ui.editingCost);
        ui.editingCost = ""; ui.costForm = null;
        return fb || "salvo na nuvem";
      });
    };
    target.querySelectorAll("[data-cost-off]").forEach(b => b.onclick = () => run(target, w, "Desativar custo", async () => { await resyncMatrix(w); w.removeMatrizCost(b.dataset.costOff); return await awaitMatrixSave(w); }));
    target.querySelectorAll("[data-cost-del]").forEach(b => b.onclick = () => {
      const item = w.loadMatrizCosts().find(c => c.id === b.dataset.costDel);
      if (!item || !confirm(`Excluir definitivamente o custo "${item.name}"? Ele sai do rateio de todas as competências. Para manter o histórico, use "Desativar".`)) return;
      run(target, w, `Excluir custo ${item.name}`, async () => { await resyncMatrix(w); const orig = w.confirm; w.confirm = () => true; try { w.deleteMatrizCost(item.id); } finally { w.confirm = orig; } return await awaitMatrixSave(w); });
    });
    // --- pagamentos ---
    if ($("#pmPayMonth")) $("#pmPayMonth").onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { ui.payMonth = e.target.value; draw(target, w); } };
    target.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { const [id, status] = b.dataset.pay.split("|"); run(target, w, status === "paid" ? "Marcar pago" : "Reabrir pagamento", async () => { await resyncMatrix(w); w.setScheduledPaymentStatus(id, ui.payMonth, status); return await awaitMatrixSave(w); }); });
    target.querySelectorAll("[data-pf]").forEach(el => el.onchange = () => { ui.payForm[el.dataset.pf] = el.value; });
    if ($("#pmPayAdd")) $("#pmPayAdd").onclick = () => {
      const p = ui.payForm;
      if (!p.target || !String(p.name || "").trim() || !(Number(p.amount) > 0)) { log("Pagamento: informe carregador, nome e valor.", "bad"); draw(target, w); return; }
      run(target, w, `Pagamento ${p.name}`, async () => {
        const fb = await addScheduled(w, p, ui.payMonth);
        ui.payForm = null;
        return fb || "pagamento programado salvo";
      });
    };
    if ($("#pmCkMonth")) $("#pmCkMonth").onchange = e => { ui.ckMonth = e.target.value; draw(target, w); };
    target.querySelectorAll("[data-rcv-p3]").forEach(el => el.onchange = () => {
      const mk = el.dataset.rcvP3, raw = String(el.value || "").replace(",", ".").trim();
      const v = raw === "" ? null : Math.round(Number(raw) * 100) / 100;
      if (v !== null && !(v >= 0)) { alert("Informe um valor válido."); return; }
      run(target, w, `Recebido pela P3 · ${UBY.state.api?.monthName?.(mk) || mk}`, async () => {
        await w.UBY_SUPABASE.saveBankData(p => {
          const received = { ...(p.received || {}) };
          const cur = { ...(received[mk] || {}) };
          if (v === null) { delete cur.p3; delete cur.p3At; } else { cur.p3 = v; cur.p3At = new Date().toISOString().slice(0, 10); }
          if (Object.keys(cur).length) received[mk] = cur; else delete received[mk];
          return { statements: [], transactions: [], ...p, received };
        }, { acao: "received_p3", competencia: mk, valor: v });
        return v === null ? "apagado" : fmt.brl(v);
      });
    });
    if ($("#pmPayAddBox")) $("#pmPayAddBox").addEventListener("toggle", e => { ui.payAddOpen = e.target.open; });
    target.querySelectorAll("[data-pay-edit]").forEach(b => b.onclick = () => { ui.payEditing = b.dataset.payEdit; ui.payForm = null; ui.focus = `pay:${b.dataset.payEdit}`; draw(target, w); });
    if ($("#pmPayEditCancel")) $("#pmPayEditCancel").onclick = () => { ui.payEditing = ""; ui.payForm = null; draw(target, w); };
    if ($("#pmPayEditSave")) $("#pmPayEditSave").onclick = () => {
      const p = ui.payForm, id = ui.payEditing;
      const cc = ui.tab === "carregador" ? data.chargers.find(x => x.key === ui.charger) : null;
      const before = w.loadMatrizCosts().find(c => c.id === id);
      const pairIdx = cc && before && data.form ? (() => { const live = r => r.basis === "fixed" && Number(r.value) > 0 && r.enabled !== false; const k = costKindOf(`${before.name} ${before.category}`);
        const byVal = data.form.cost.findIndex(r => live(r) && Math.abs(Number(r.value) - Number(before.amount)) < 0.01);
        return byVal >= 0 ? byVal : k >= 0 ? data.form.cost.findIndex(r => live(r) && costKindOf(`${r.id} ${r.label}`) === k) : -1; })() : -1;
      if (!p.target || !String(p.name || "").trim() || !(Number(p.amount) > 0) || !/^\d{4}-\d{2}$/.test(p.startMonth || "") || (p.endMonth && !/^\d{4}-\d{2}$/.test(p.endMonth))) { log("Pagamento: informe carregador, nome, valor e mês de início.", "bad"); draw(target, w); return; }
      run(target, w, `Pagamento ${p.name}`, async () => {
        await resyncMatrix(w);
        w.renderScheduledPayments(w.getGeneralUnitData());
        const opt = [...(w.document.getElementById("scheduledPaymentTarget")?.options || [])].find(o => o.value === p.target);
        const list = w.loadMatrizCosts();
        const idx = list.findIndex(c => c.id === id && c.scheduledPayment);
        if (idx < 0) throw new Error("Este pagamento não existe mais na nuvem (pode ter sido removido em outra aba). Nada foi gravado.");
        const it = list[idx], t0 = (it.targets || [])[0] || {};
        list[idx] = w.matrizNormalizeCost({ ...it, name: String(p.name).trim(), supplier: p.supplier || "", category: p.category || "Outros custos", amount: Number(p.amount), dueDay: Number(p.dueDay) || 1,
          startMonth: p.startMonth, endMonth: p.endMonth || "", updatedAt: new Date().toISOString(),
          targets: [{ ...t0, scope: p.target, workId: String(p.target).split("::")[0], station: opt?.dataset.station || t0.station || "", workName: opt?.dataset.workName || t0.workName || "", startMonth: t0.startMonth || p.startMonth, share: 100 }] });
        w.saveMatrizCosts(list);
        const fb = await awaitMatrixSave(w);
        ui.payEditing = ""; ui.payForm = null;
        if (pairIdx >= 0 && Math.abs(Number(p.amount) - Number(before.amount)) >= 0.01) {
          await saveChargerRules(w, cc, ui.month, r => { if (r.cost[pairIdx]) r.cost[pairIdx].value = Number(p.amount); });
          return `${fb || "pagamento atualizado"} · resultado atualizado para ${fmt.brl(Number(p.amount))} a partir de ${ui.month}`;
        }
        return fb || "pagamento atualizado";
      });
    };
    // "Remover daqui em diante": encerra no mês anterior (o histórico e o que foi pago ficam); se nunca valeu antes, apaga.
    target.querySelectorAll("[data-pay-end]").forEach(b => b.onclick = () => {
      const id = b.dataset.payEnd, mk = b.dataset.month || ui.payMonth;
      const it = w.loadMatrizCosts().find(c => c.id === id);
      if (!it || !confirm(`Remover "${it.name}" de ${UBY.state.api?.monthName?.(mk) || mk} em diante?\nOs meses anteriores e os pagamentos já marcados continuam no histórico.`)) return;
      run(target, w, `Remover ${it.name}`, async () => {
        await resyncMatrix(w);
        const list = w.loadMatrizCosts();
        const cur = list.find(c => c.id === id && c.scheduledPayment);
        if (!cur) throw new Error("Este pagamento não existe mais na nuvem. Nada foi gravado.");
        const [y, m] = mk.split("-").map(Number);
        const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
        const keep = !cur.startMonth || cur.startMonth < mk;
        w.saveMatrizCosts(keep ? list.map(c => c.id === id ? { ...c, endMonth: c.endMonth && c.endMonth < prev ? c.endMonth : prev, updatedAt: new Date().toISOString() } : c) : list.filter(c => c.id !== id));
        const fb = await awaitMatrixSave(w);
        if (ui.payEditing === id) { ui.payEditing = ""; ui.payForm = null; }
        return keep ? `encerrado em ${UBY.state.api?.monthName?.(prev) || prev}` : (fb || "removido");
      });
    });
    // --- operação ---
    target.querySelectorAll("[data-op-cfg]").forEach(b => b.onclick = () => { ui.opCharger = ui.opCharger === b.dataset.opCfg ? "" : b.dataset.opCfg; ui.opForm = null; draw(target, w); });
    if ($("#pmOpCancel")) $("#pmOpCancel").onclick = () => { ui.opCharger = ""; ui.opForm = null; draw(target, w); };
    target.querySelectorAll("[data-of]").forEach(el => el.onchange = () => { const k = el.dataset.of; ui.opForm[k] = k === "open24h" ? el.value === "1" : el.value; if (k === "open24h") draw(target, w); });
    target.querySelectorAll("[data-of-day]").forEach(el => el.onchange = () => { const d = el.dataset.ofDay; ui.opForm.openDays = el.checked ? [...new Set([...(ui.opForm.openDays || []), d])] : (ui.opForm.openDays || []).filter(x => x !== d); draw(target, w); });
    target.querySelectorAll("[data-dh-on]").forEach(el => el.onchange = () => {
      const d = el.dataset.dhOn; ui.opForm.dayHours = ui.opForm.dayHours || {};
      if (el.checked) ui.opForm.dayHours[d] = { open24h: false, openTime: ui.opForm.openTime || "08:00", closeTime: ui.opForm.closeTime || "22:00" };
      else delete ui.opForm.dayHours[d];
      draw(target, w);
    });
    target.querySelectorAll("[data-dh]").forEach(el => el.onchange = () => {
      const [d, k] = el.dataset.dh.split("|"); const r = ui.opForm.dayHours[d];
      r[k] = k === "open24h" ? el.value === "1" : el.value;
      if (k === "open24h") draw(target, w);
    });
    target.querySelectorAll("[data-op-toggle]").forEach(el => el.onchange = () => {
      const [workId, key, station] = el.dataset.opToggle.split("|");
      const on = el.checked;
      if (!confirm(`${on ? "Incluir" : "Retirar"} ${station} ${on ? "na" : "da"} operação UBY? Isso muda resultado, rateio da matriz e cotistas.`)) { el.checked = !on; return; }
      run(target, w, `Operação UBY · ${station}`, async () => { await w.toggleUbyOperation(workId, key, on); checkPending(w); return on ? "incluído na operação UBY" : "retirado da operação UBY"; });
    });
    target.querySelectorAll("[data-op-power]").forEach(el => el.onchange = () => {
      const [workId, station] = el.dataset.opPower.split("|");
      const kw = Number(el.value);
      if (!(kw >= 1 && kw <= 360)) { log("Potência: informe entre 1 e 360 kW.", "bad"); draw(target, w); return; }
      run(target, w, `Potência do local · ${station}`, async () => { await w.openWorkReport(workId, "mensal", station); await w.saveOperationalPowerFromInputs(kw); checkPending(w); return `${kw} kW`; });
    });
    if ($("#pmOpSave")) $("#pmOpSave").onclick = () => {
      const [workId, station] = ui.opCharger.split("|");
      const f = ui.opForm;
      if (!(f.openDays || []).length) { log("Horários: selecione ao menos um dia de funcionamento.", "bad"); draw(target, w); return; }
      const closedDays = DAYS.filter(([v]) => !(f.openDays || []).includes(v)).map(([, l]) => l);
      if (closedDays.length && !confirm(`${station} vai ficar FECHADO em: ${closedDays.join(", ")}.\n\nNesses dias a ocupação fica zerada, mesmo com recarga. Confirma?`)) return;
      run(target, w, `Horários e cortesia · ${station}`, async () => {
        try { w.openStationLayoutConfiguration(workId, station); } catch (_) { /* o modal pode não abrir na moldura invisível; os campos são preenchidos abaixo */ }
        const d = w.document;
        const set = (id, v) => { const el = d.getElementById(id); if (el) el.value = v ?? ""; };
        set("stationLayoutWorkId", workId); set("stationLayoutSourceName", station);
        set("stationLayoutPlantName", f.plantName); set("stationLayoutAcChargers", f.acChargers); set("stationLayoutAcPlugs", f.acPlugs);
        set("stationLayoutDcChargers", f.dcChargers); set("stationLayoutDcPlugs", f.dcPlugs); set("stationLayoutOperationStart", f.operationStart);
        const h24 = d.getElementById("stationLayoutOpen24h"); if (h24) h24.checked = f.open24h !== false;
        set("stationLayoutOpenTime", f.openTime || "08:00"); set("stationLayoutCloseTime", f.closeTime || "22:00");
        set("stationLayoutReferenceTariff", f.referenceTariffPerKwh); set("stationLayoutCourtesyTreatment", f.courtesyTreatment || "operational");
        set("stationLayoutCourtesyResponsible", f.courtesyResponsible); set("stationLayoutCourtesyUsers", f.courtesyUsersText);
        d.querySelectorAll(".station-open-day").forEach(i => { i.checked = (f.openDays || []).includes(String(i.value)); });
        const openSet = new Set((f.openDays || []).map(String));
        w.__novaDayHours = Object.fromEntries(Object.entries(f.dayHours || {}).filter(([d]) => openSet.has(String(d)))
          .map(([d, r]) => [d, r.open24h === true ? { open24h: true } : { open24h: false, openTime: r.openTime || "08:00", closeTime: r.closeTime || "22:00" }]));
        try { await w.saveStationLayoutConfiguration(); } finally { delete w.__novaDayHours; }
        try { d.getElementById("stationLayoutDialog")?.close(); } catch (_) {}
        checkPending(w);
        ui.opForm = null;
        return "configuração salva";
      });
    };
    // --- documentos ---
    if ($("#pmDocMonth")) $("#pmDocMonth").onchange = e => { ui.docMonth = e.target.value; draw(target, w); };
    target.querySelectorAll("[data-df]").forEach(el => el.onchange = () => { ui.docForm[el.dataset.df] = el.value; });
    target.querySelectorAll("[data-doc-open]").forEach(b => b.onclick = async () => {
      const win = window.open("", "_blank");
      try { const r = await w.UBY_SUPABASE.openFinanceDocument(b.dataset.docOpen); if (win) win.location.href = r.url; else window.location.assign(r.url); }
      catch (err) { if (win) win.close(); log(`Abrir documento: ${err.message}`, "bad"); draw(target, w); }
    });
    target.querySelectorAll("[data-doc-del]").forEach(b => b.onclick = () => {
      if (!confirm("Excluir este documento e o arquivo anexado? Não dá para desfazer.")) return;
      run(target, w, "Excluir documento", async () => { const r = await w.UBY_SUPABASE.deleteFinanceDocument(b.dataset.docDel); if (!r?.deleted) throw new Error("documento não encontrado"); return "documento excluído"; });
    });
    // Caixa de entrada: PDF da Copel é reconhecido e pode ir direto para Faturas de energia.
    if ($("#pmDocFile")) $("#pmDocFile").onchange = async e => {
      const file = e.target.files?.[0];
      ui.docFile = file || null; ui.docCopel = null;
      if (!file || !/pdf/i.test(file.type || file.name)) return;
      const res = await window.UBY_COPEL.read(file);
      if (!res.ok) return;
      const f = res.fields;
      const api = UBY.state.api;
      const match = data.chargers.find(c => { try { return (api.energyInvoices(c.workId, c.station)?.stored || []).some(i => String(i.uc || "") === f.uc); } catch (_) { return false; } });
      ui.docCopel = { res, file, summary: `Ref. ${f.ref.slice(5)}/${f.ref.slice(0, 4)} · UC ${f.uc}${match ? ` (${match.station})` : ""} · ${f.kwh} kWh · R$ ${f.copelAmount.toFixed(2).replace(".", ",")} · vence ${f.dueDate.split("-").reverse().join("/")}` };
      ui.docForm = { ...ui.docForm, supplier: "Copel", category: "Energia", documentType: "fatura", documentNumber: f.nfNumber || "", amount: f.copelAmount, dueDate: f.dueDate, link: match ? `work|${match.workId}` : ui.docForm.link };
      draw(target, w).then(() => { const inp = target.querySelector("#pmDocFile"); if (inp && ui.docFile) { try { const dt = new DataTransfer(); dt.items.add(ui.docFile); inp.files = dt.files; } catch (_) {} } });
    };
    if ($("#pmDocToEnergy")) $("#pmDocToEnergy").onclick = () => {
      const { res, file } = ui.docCopel;
      ui.docCopel = null; ui.docFile = null; ui.docForm = null;
      ui.tab = "carregador";
      applyCopelRead(res, file, data.chargers);
      followEnCharger();
      ui.focus = "sec:energia";
      draw(target, w);
    };
    if ($("#pmDocSave")) $("#pmDocSave").onclick = () => {
      const df = ui.docForm;
      const file = $("#pmDocFile")?.files?.[0] || ui.docFile || null;
      if (!String(df.supplier || "").trim() || !(Number(df.amount) > 0)) { log("Documento: informe fornecedor e valor.", "bad"); draw(target, w); return; }
      const [kind, ref] = String(df.link || "").split("|");
      run(target, w, `Documento ${df.supplier}`, async () => {
        await w.UBY_SUPABASE.createFinanceDocument({
          scope: kind === "work" ? "charger" : "matrix", workId: kind === "work" ? ref : null, matrixCostId: kind === "cost" ? ref : null,
          competenceKey: ui.docMonth, supplier: df.supplier, category: df.category, documentNumber: df.documentNumber, documentType: df.documentType,
          amount: Number(df.amount), dueDate: df.dueDate || null, status: df.status, installmentNumber: df.installmentNumber || null, installmentTotal: df.installmentTotal || null, notes: df.notes
        }, file);
        ui.docForm = null; ui.docFile = null; ui.docCopel = null;
        return file ? `salvo com o arquivo ${file.name}` : "salvo sem arquivo";
      });
    };
    // --- fechamentos ---
    target.querySelectorAll("[data-close-report]").forEach(b => b.onclick = () => UBY.reports.competencia(b.dataset.closeReport));
    if (ui.tab === "fechamento" && !ui.docs && !ui.docsLoading) { ui.docsLoading = true; loadDocs(w).finally(() => { ui.docsLoading = false; draw(target, w); }); }
    target.querySelectorAll("[data-publish]").forEach(b => b.onclick = () => {
      const mk = b.dataset.publish;
      if (!confirm(`Publicar os documentos de ${UBY.state.api.monthName(mk)}? Eles ficam guardados de forma definitiva (não podem ser alterados, só substituídos por uma nova versão).`)) return;
      run(target, w, `Documentos ${UBY.state.api.monthName(mk)}`, () => publishClosing(w, mk));
    });
    target.querySelectorAll("[data-close]").forEach(b => b.onclick = () => {
      const [mk, action] = b.dataset.close.split("|");
      let inv;
      try { inv = UBY.data("investorDistribution"); } catch (_) { log("Fechamento: aguarde os números atualizarem.", "bad"); return; }
      const idx = inv.months.findIndex(m => m.key === mk);
      const m = inv.months[idx];
      if (!m) return;
      if (action === "approve") {
        const earlier = inv.months.slice(0, idx).filter(x => x.status === "pendente").map(x => x.label);
        const msg = `Aprovar ${m.label}? Pool dos cotistas ${fmt.brl(m.investorPool)} (${fmt.brl(m.perQuota)} por cota).${m.taxes ? "" : "\n\nAtenção: não há imposto lançado para este mês."}${earlier.length ? `\n\nAinda pendentes antes deste: ${earlier.join(", ")}.` : ""}`;
        if (!confirm(msg)) return;
      }
      if (action === "reopen" && !confirm(`Reabrir ${m.label}? A aprovação e a data de pagamento são apagadas.`)) return;
      const paidAt = action === "pay" ? (target.querySelector(`[data-paid-date="${mk}"]`)?.value || new Date().toISOString().slice(0, 10)) : "";
      const email = UBY.state.status?.user?.email || "";
      run(target, w, `Fechamento ${m.label}`, async () => {
        await resyncMatrix(w);
        const cur = w.loadNetworkDistribution();
        const ledger = { ...(cur.paymentLedger || {}) };
        const prev = ledger[mk] || {};
        const now = new Date().toISOString();
        if (action === "approve") ledger[mk] = { ...prev, status: "aprovado", approvedAt: now, approvedBy: email, paidAt: "", snapshot: closingSnapshot(inv, idx), updatedAt: now };
        else if (action === "pay") ledger[mk] = { ...prev, status: "pago", paidAt, updatedAt: now };
        else ledger[mk] = { ...prev, status: "pendente", approvedAt: "", approvedBy: "", paidAt: "", snapshot: null, updatedAt: now };
        const saved = w.saveNetworkDistribution({ ...cur, paymentLedger: ledger });
        const fb = await awaitMatrixSave(w);
        if (saved.paymentLedger?.[mk]?.status !== ledger[mk].status) throw new Error("a situação não foi aceita pela plataforma original");
        if (action === "approve" && !saved.paymentLedger?.[mk]?.snapshot) throw new Error("os números aprovados não foram guardados");
        return action === "approve" ? `aprovado · pool ${fmt.brl(m.investorPool)}` : action === "pay" ? `pago em ${fmt.date(paidAt + "T12:00:00")}` : "reaberto";
      });
    });
    // --- cotas ---
    target.querySelectorAll("[data-pol]").forEach(el => el.onchange = () => { const k = el.dataset.pol; ui.policyEdits[k] = ["roundLabel", "distributionStartMonth"].includes(k) ? el.value : Number(el.value || 0); draw(target, w); });
    target.querySelectorAll("[data-tax-from]").forEach(el => el.onchange = () => { ui.policyEdits.taxRateFrom[el.dataset.taxFrom] = Math.max(0, Number(el.value || 0)); draw(target, w); });
    target.querySelectorAll("[data-tax-from-del]").forEach(b => b.onclick = () => { delete ui.policyEdits.taxRateFrom[b.dataset.taxFromDel]; draw(target, w); });
    if ($("#pmTaxFromAdd")) $("#pmTaxFromAdd").onclick = () => { const m = $("#pmTaxFromMonth").value, v = $("#pmTaxFromPct").value; if (!/^\d{4}-\d{2}$/.test(m) || v === "") return alert("Informe o mês e a nova alíquota."); ui.policyEdits.taxRateFrom[m] = Math.max(0, Number(v)); draw(target, w); };
    target.querySelectorAll("[data-tax-month]").forEach(el => el.onchange = () => { const k = el.dataset.taxMonth; if (el.value === "") delete ui.policyEdits.taxByMonth[k]; else ui.policyEdits.taxByMonth[k] = Math.max(0, Number(el.value)); draw(target, w); });
    target.querySelectorAll("[data-inv]").forEach(el => el.onchange = () => { const [i, k] = el.dataset.inv.split("|"); const inv = ui.policyEdits.investors[Number(i)]; if (k === "kind") { inv.founder = el.value === "founder"; inv.newQuota = el.value === "new"; } else inv[k] = ["investment", "quotaValue"].includes(k) ? Number(el.value || 0) : el.value; draw(target, w); });
    if ($("#pmInvAdd")) $("#pmInvAdd").onclick = () => { const qv = Number(ui.policyEdits.quotaValue) || window.UBY_CONFIG.quotaValueDefault; ui.policyEdits.investors.push({ name: "Novo cotista", investedAt: new Date().toISOString().slice(0, 10), investment: qv, quotaValue: qv, status: "pendente", newQuota: true }); draw(target, w); };
    target.querySelectorAll("[data-inv-del]").forEach(b => b.onclick = () => { const i = Number(b.dataset.invDel); if (confirm(`Remover ${ui.policyEdits.investors[i].name} da lista de cotistas?`)) { ui.policyEdits.investors.splice(i, 1); draw(target, w); } });
    if ($("#pmPolReset")) $("#pmPolReset").onclick = () => { ui.policyEdits = null; ui.rowOrder = null; draw(target, w); };
    if ($("#pmPolSave")) $("#pmPolSave").onclick = () => run(target, w, "Política de cotas", async () => {
      await resyncMatrix(w);
      const current = w.loadNetworkDistribution();
      const investors = ui.policyEdits.investors.map(i => deriveInvestor(i, ui.policyEdits.quotaValue)).filter(i => String(i.name || "").trim() && Number(i.quotas) > 0 && i.eligibleFrom);
      const next = { ...current, ...ui.policyEdits, investors };
      const saved = w.saveNetworkDistribution(next);
      const fb = await awaitMatrixSave(w);
      if (Number(saved.founderPct) !== Number(next.founderPct) || saved.investors.filter(i => i.founder).length !== investors.filter(i => i.founder).length || saved.investors.filter(i => i.newQuota).length !== investors.filter(i => i.newQuota).length) throw new Error("A política não foi aceita pela plataforma original (bloco fundador).");
      if (Number(saved.quotaValue) !== Number(next.quotaValue) || Number(saved.taxRatePct || 0) !== Number(next.taxRatePct || 0) || JSON.stringify(saved.taxRateFrom || {}) !== JSON.stringify(next.taxRateFrom || {})) throw new Error("A política não foi aceita pela plataforma original (valor da cota ou impostos).");
      ui.policyEdits = null; ui.rowOrder = null;
      return fb || "política salva na nuvem";
    });
  }

  UBY.register("parametros", { render, _test: { centralTab, bankState } });
})();

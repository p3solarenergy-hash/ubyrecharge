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

  async function openCharger(w, key, month) {
    const [workId, station] = key.split("|");
    const wantStation = w.shouldOpenFullRechargeWork?.(workId, station) ? "" : station;
    if (String(w.eval("currentWorkId")) !== workId || String(w.eval("currentStationReportName") || "") !== wantStation) {
      await w.openWorkReport(workId, "mensal", station);
    }
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
    const ruleRows = (kind, arr) => arr.map((r, i) => `<tr>
        <td><input type="checkbox" data-rule="${kind}|${i}|enabled" ${r.enabled ? "checked" : ""}></td>
        <td><input class="select" data-rule="${kind}|${i}|label" value="${esc(r.label)}" style="width:100%"></td>
        <td><select class="select" data-rule="${kind}|${i}|basis">${[["fixed", "Fixo mensal"], ["per_kwh", "Por kWh"], ["revenue_pct", "% do faturamento"], ["per_charge", "Por recarga"], ["one_off", "Avulso no mês"]].map(([v, l]) => `<option value="${v}" ${r.basis === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
        <td><input class="select" type="number" step="0.01" min="0" data-rule="${kind}|${i}|value" value="${esc(r.value)}" style="width:110px"></td>
        ${kind === "revenue" ? `<td><select class="select" data-rule="${kind}|${i}|scope"><option value="operational" ${r.scope !== "non_operational" ? "selected" : ""}>Operacional</option><option value="non_operational" ${r.scope === "non_operational" ? "selected" : ""}>Não operacional (marketing)</option></select></td>` : ""}
        <td><small>${esc(r.previous || "—")}</small></td>
        <td>${r.custom ? `<button class="btn ghost" data-rule-del="${kind}|${i}" type="button">✕</button>` : ""}</td></tr>`).join("");
    return `
      <div class="toolbar">
        <select class="select" id="pmCharger" style="min-width:280px">${groups.map(([label, test]) => { const g = list.filter(test); return g.length ? `<optgroup label="${esc(label)}">${g.map(c => `<option value="${esc(c.key)}" ${c.key === ui.charger ? "selected" : ""}>${esc(c.station)} · ${esc(c.workName)}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>
        <select class="select" id="pmMonth">${data.months.slice().reverse().map(m => `<option value="${m}" ${m === ui.month ? "selected" : ""}>Competência ${esc(UBY.state.api?.monthName?.(m) || m)}</option>`).join("")}</select>
        <span class="spacer"></span>
        <button class="btn" id="pmSimulate" type="button" ${dirty ? "" : "disabled"}>Simular resultado</button>
        <button class="btn" id="pmDiscard" type="button" ${dirty ? "" : "disabled"}>Descartar</button>
        <button class="btn primary" id="pmSave" type="button" ${dirty && canWrite(w) && !busy ? "" : "disabled"}>Salvar competência</button>
      </div>
      <div class="grid g5" style="margin-bottom:14px">${f.summary.map((m, i) => kpi(m.label, esc(m.value), esc(m.sub || ""), "", i === 2 ? "lead" : "")).join("")}${kpi("Base desta competência", esc(f.versionSource || "—"), esc(f.versionHelp || ""))}</div>
      ${dirty ? `<div class="note" style="margin-bottom:12px">Alterações ainda não salvas. "Simular resultado" recalcula os cartões acima com os valores novos, sem gravar.</div>` : ""}
      <div class="grid g2" style="gap:14px">${f.rows.filter(r => modelVisible(r, model, transfer) && r.controls.length).map(r => `
        <section class="section" style="margin:0"><div class="section-head" style="margin-bottom:8px"><div><p class="kicker">${esc(r.group)}</p><h2 style="font-size:14px">${esc(r.name)}</h2><p>${esc(r.rule)}</p></div>
          <div class="meta">anterior<br><strong>${esc(r.previous || "—")}</strong></div></div>
          <div class="grid ${r.controls.length > 2 ? "g3" : "g2"}" style="gap:8px">${r.controls.filter(c => !c.leaseOnly || energyMode === "copel_lease").map(c => control(c, r)).join("")}</div>
          ${r.key === "energyCostPerKWh" ? `<p class="source-line">${esc(f.energySummary)}</p>` : ""}</section>`).join("")}</div>
      <section class="section" style="margin-top:14px"><div class="section-head"><div><p class="kicker">Regras do carregador</p><h2>Custos e receitas adicionais</h2><p>Valem nesta competência. "Avulso no mês" não é reaproveitado nos meses seguintes pelo motor novo.</p></div>
          <div><button class="btn" data-rule-add="cost" type="button">＋ Custo</button> <button class="btn" data-rule-add="revenue" type="button">＋ Receita</button></div></div>
        <h3 style="margin:4px 0 6px">Custos</h3>
        <div class="table-wrap"><table><thead><tr><th>Usar</th><th>Item</th><th>Base</th><th>Valor</th><th>Anterior</th><th></th></tr></thead><tbody>${ruleRows("cost", rules.cost)}</tbody></table></div>
        <h3 style="margin:12px 0 6px">Receitas</h3>
        <div class="table-wrap"><table><thead><tr><th>Usar</th><th>Item</th><th>Base</th><th>Valor</th><th>Classificação</th><th>Anterior</th><th></th></tr></thead><tbody>${ruleRows("revenue", rules.revenue)}</tbody></table></div>
      </section>`;
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
        startMonth: editing.startMonth, endMonth: editing.endMonth, dueDay: editing.dueDay, method: editing.allocation, shares: (editing.targets || []).map(t => t.share || 0).join(", "),
        documentRef: editing.documentRef, notes: editing.notes,
        targets: eligible.filter(e => (editing.targets || []).some(t => { try { return w.matrizRowsMatch(w.matrizResolveTargetRow(t, eligibleRows), e.row); } catch (_) { return false; } })).map(e => e.scope)
      } : { name: "", amount: "", category: "Outros custos", supplier: "", kind: "recurring", installments: 1, startMonth: mk, endMonth: "", dueDay: 1, method: "equal", shares: "", documentRef: "", notes: "", targets: [] };
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
              <td>${esc(w.matrizKindLabel(c.costKind))}${c.costKind === "installment" ? `<small>${c.installments} parcela(s)</small>` : ""}<small>${esc(c.startMonth || "")}${c.endMonth ? ` até ${esc(c.endMonth)}` : ""} · dia ${c.dueDay}</small></td>
              <td class="num">${fmt.brl(c.amount)}</td><td class="num">${on ? fmt.brl(w.matrizCompetencyAmount(c)) : "—"}</td><td>${esc(w.matrizMethodLabel(c.allocation))}<small>${(c.targets || []).length} destino(s)</small></td>
              <td style="white-space:nowrap"><button class="btn ghost" data-cost-edit="${esc(c.id)}" type="button">Editar</button>${c.enabled ? `<button class="btn ghost" data-cost-off="${esc(c.id)}" type="button" ${canWrite(w) && !busy ? "" : "disabled"}>Desativar</button>` : ""}<button class="btn ghost" data-cost-del="${esc(c.id)}" type="button" style="color:var(--uby-red)" ${canWrite(w) && !busy ? "" : "disabled"}>Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">Nenhum custo cadastrado.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">${editing ? "Editando" : "Novo custo"}</p><h2>${editing ? esc(editing.name) : "Adicionar custo da matriz"}</h2><p>${editing ? "Destinos novos passam a valer da competência escolhida em diante." : "O rateio fica gravado por competência e destino."}</p></div></div>
          <div class="grid g2" style="gap:8px">
            ${inp("name", "Nome do custo")}${inp("amount", "Valor por parcela ou competência (R$)", "number", 'step="0.01" min="0"')}
            ${sel("category", "Categoria", cats.map(c => [c, c]))}${inp("supplier", "Fornecedor")}
            ${sel("kind", "Tipo", [["recurring", "Recorrente mensal"], ["installment", "Parcelado"], ["one_off", "Pontual"]])}${inp("installments", "Parcelas", "number", 'min="1" step="1"')}
            ${inp("startMonth", "Início", "month")}${inp("endMonth", "Fim (opcional)", "month")}
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
      return { id: i.id, name: i.name, category: i.category, supplier: i.supplier, source: i.scheduledPayment ? "" : "Custo da matriz", target: tg, due: w.scheduledPaymentDueDate(i, mk), dueDay: i.dueDay, amount, st };
    });
    const tot = rows.reduce((a, r) => { a.total += r.amount; if (r.st.key === "paid") a.paid += r.amount; else a.open += r.amount; if (r.st.key === "overdue") a.late += r.amount; return a; }, { total: 0, paid: 0, open: 0, late: 0 });
    w.renderScheduledPayments(w.getGeneralUnitData());
    const targets = [...(w.document.getElementById("scheduledPaymentTarget")?.options || [])].filter(o => o.value).map(o => ({ value: o.value, text: o.text }));
    const pf = ui.payForm || (ui.payForm = { target: "", name: "", supplier: "", category: "Internet / dados", amount: "", dueDay: 11, startMonth: mk, endMonth: "" });
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-pf="${k}" type="${type}" value="${esc(pf[k] ?? "")}" ${extra} style="width:100%">`);
    const can = canWrite(w) && !busy ? "" : "disabled";
    return `
      <div class="toolbar"><label>Competência <input class="select" id="pmPayMonth" type="month" value="${esc(mk)}"></label></div>
      <div class="grid g4" style="margin-bottom:14px">${kpi("Programado no mês", fmt.brl(tot.total), `${rows.length} compromisso(s)`, "", "lead")}${kpi("Em aberto", fmt.brl(tot.open), "aguardando pagamento")}${kpi("Vencido", fmt.brl(tot.late), "exige tratamento", "", tot.late ? "bad" : "")}${kpi("Pago", fmt.brl(tot.paid), "nesta competência")}</div>
      <section class="section"><div class="section-head"><div><p class="kicker">Calendário de caixa</p><h2>Pagamentos da competência</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Pagamento</th><th>Carregador / obra</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${rows.map(r => `<tr><td><strong>${esc(r.name)}</strong><small>${r.source ? `${esc(r.source)} · ` : ""}${esc(r.category)}${r.supplier ? ` · ${esc(r.supplier)}` : ""}</small></td>
            <td>${esc(r.target.station || "Carregador não identificado")}<small>${esc(r.target.workName || (r.target.targetCount > 1 ? `rateado para ${r.target.targetCount} carregadores` : ""))}</small></td>
            <td>${r.due.toLocaleDateString("pt-BR")}<small>todo dia ${r.dueDay}</small></td><td class="num">${fmt.brl(r.amount)}</td>
            <td><span class="badge ${r.st.key === "paid" ? "ok" : r.st.key === "overdue" ? "bad" : r.st.key === "pending" ? "neutral" : "warn"}">${esc(r.st.label)}</span></td>
            <td>${r.st.key === "paid" ? `<button class="btn ghost" data-pay="${esc(r.id)}|pending" type="button" ${can}>Reabrir</button>` : `<button class="btn" data-pay="${esc(r.id)}|paid" type="button" ${can}>Marcar pago</button>`}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum pagamento programado nesta competência.</td></tr>`}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Novo compromisso</p><h2>Adicionar pagamento recorrente de um carregador</h2><p>Entra no calendário de caixa; não altera o DRE sem lançamento financeiro.</p></div></div>
        <div class="grid g4" style="gap:8px">
          ${field("Carregador", `<select class="select" data-pf="target"><option value="">Selecione</option>${targets.map(t => `<option value="${esc(t.value)}" ${pf.target === t.value ? "selected" : ""}>${esc(t.text)}</option>`).join("")}</select>`)}
          ${inp("name", "Pagamento")}${inp("supplier", "Fornecedor")}
          ${field("Categoria", `<select class="select" data-pf="category">${["Internet / dados", "Energia", "Locação / aluguel", "Seguro", "Manutenção", "Licença / plataforma", "Outros custos"].map(c => `<option ${pf.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
          ${inp("amount", "Valor mensal (R$)", "number", 'min="0" step="0.01"')}${inp("dueDay", "Dia do vencimento", "number", 'min="1" max="31"')}${inp("startMonth", "Inicia em", "month")}${inp("endMonth", "Termina em (opcional)", "month")}
        </div>
        <button class="btn primary" id="pmPayAdd" type="button" style="margin-top:12px" ${can}>Adicionar pagamento programado</button>
      </section>`;
  }

  // ---------- operação: quem entra na UBY, potência, horários e cortesia ----------
  const DAYS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]];
  function checkPending(w) {
    const st = txt(w.document.getElementById("storageState"));
    if (/pendente/i.test(st)) throw new Error(`Não gravou na nuvem: ${st}`);
    return st;
  }
  function operationTab(w) {
    const rows = w.getUbyChargerRows(w.getGeneralUnitData());
    const key = r => `${r.workId}|${r.station}`;
    const sel = rows.find(r => key(r) === ui.opCharger) || null;
    if (sel && !ui.opForm) {
      const c = w.stationAvailabilityFor(sel.workId, sel.station, sel.workName);
      ui.opForm = { ...c, courtesyUsersText: (c.courtesyUsers || []).join("\n"), openDays: (c.openDays || [0, 1, 2, 3, 4, 5, 6]).map(String) };
    }
    const f = ui.opForm || {};
    const can = canWrite(w) && !busy ? "" : "disabled";
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-of="${k}" type="${type}" value="${esc(f[k] ?? "")}" ${extra} style="width:100%">`);
    const works = [...new Set(rows.map(r => String(r.workId)))];
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
      ${sel ? `<section class="section"><div class="section-head"><div><p class="kicker">Configuração do carregador</p><h2>${esc(sel.station)}</h2><p>${esc(sel.workName)} · horários de funcionamento (base da ocupação), início da operação, conectores e cortesias.</p></div></div>
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
        ${field("Usuários de cortesia (um por linha: e-mail, nome ou telefone)", `<textarea class="select" data-of="courtesyUsersText" rows="4" style="width:100%;height:auto;padding:8px">${esc(f.courtesyUsersText || "")}</textarea>`)}
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="pmOpSave" type="button" ${can}>Salvar configuração</button><button class="btn" id="pmOpCancel" type="button">Fechar</button></div>
      </section>` : ""}`;
  }

  // ---------- documentos financeiros (NF, boletos, faturas) ----------
  function docsTab(w, data) {
    const mk = ui.docMonth;
    const costs = w.loadMatrizCosts().filter(c => c.enabled !== false);
    const rows = w.getUbyChargerRows(w.getGeneralUnitData()).filter(r => r.included);
    const df = ui.docForm || (ui.docForm = { link: "", documentType: "boleto", supplier: "", category: "Outros custos", documentNumber: "", amount: "", dueDate: "", status: "pending", installmentNumber: "", installmentTotal: "", notes: "" });
    const can = canWrite(w) && !busy ? "" : "disabled";
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-df="${k}" type="${type}" value="${esc(df[k] ?? "")}" ${extra} style="width:100%">`);
    const docs = data.docs || [];
    const total = docs.reduce((s, d) => s + Number(d.amount || 0), 0);
    const paid = docs.filter(d => d.status === "paid").reduce((s, d) => s + Number(d.amount || 0), 0);
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
          <button class="btn primary" id="pmDocSave" type="button" style="margin-top:12px" ${can}>Salvar documento</button>
        </section>
      </div>`;
  }

  function quotasTab(w) {
    const p = w.loadNetworkDistribution();
    const e = ui.policyEdits || (ui.policyEdits = JSON.parse(JSON.stringify({
      quotaValue: p.quotaValue || 80000, distributionStartMonth: p.distributionStartMonth || "2026-06", legalReservePct: p.legalReservePct, expansionReservePct: p.expansionReservePct,
      investorPct: p.investorPct, totalQuotas: p.totalQuotas, soldQuotas: p.soldQuotas, roundLabel: p.roundLabel, taxRatePct: p.taxRatePct || 0, taxByMonth: { ...(p.taxByMonth || {}) },
      investors: (p.investors || []).map(i => ({ ...i, quotaValue: i.quotaValue || 0 }))
    })));
    const inp = (k, label, type = "number", extra = "") => field(label, `<input class="select" data-pol="${k}" type="${type}" value="${esc(e[k] ?? "")}" ${extra} style="width:100%">`);
    const quotasSum = e.investors.reduce((s, i) => s + Number(i.quotas || 0), 0);
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Política de distribuição</p><h2>Rodadas, valor da cota e reservas</h2><p>O valor padrão da cota vale para cotistas sem valor próprio. Cada cotista pode ter o valor da sua rodada (ex.: rodada 1 a R$ 80 mil, novas a R$ 100 mil). A distribuição por cota é igual para todas; o valor pago muda o investido, o retorno e o payback.</p></div></div>
        <div class="grid g4" style="gap:8px">
          ${inp("quotaValue", "Valor padrão da cota (R$)", "number", 'min="0" step="1000"')}${inp("distributionStartMonth", "Distribuição a partir de", "month")}
          ${inp("legalReservePct", "Reserva legal (%)", "number", 'min="0" max="100" step="0.1"')}${inp("expansionReservePct", "Fundo de expansão (%)", "number", 'min="0" max="100" step="0.1"')}
          ${inp("investorPct", "Parte dos cotistas após reservas (%)", "number", 'min="0" max="100" step="0.1"')}${inp("totalQuotas", "Cotas da rodada atual", "number", 'min="1" step="1"')}
          ${inp("soldQuotas", "Cotas vendidas", "number", 'min="0" step="1"')}${inp("roundLabel", "Nome da rodada atual", "text")}
        </div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Impostos da UBY</p><h2>Impostos sobre o faturamento</h2><p>Incidem sobre tudo o que a UBY faturou no mês (recargas e receitas dos ativos próprios + royalties) e saem do resultado antes das reservas e dos cotistas. Use o percentual e, quando a guia sair, lance o valor exato do mês — ele substitui o percentual naquela competência.</p></div></div>
        <div class="grid g4" style="gap:8px">${inp("taxRatePct", "Alíquota sobre o faturamento (%)", "number", 'min="0" max="100" step="0.01"')}</div>
        <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Competência</th><th class="num">Valor exato do imposto (R$)</th><th>Uso</th></tr></thead>
          <tbody>${(UBY.state.months || []).slice().reverse().map(mk => { const v = e.taxByMonth[mk]; return `<tr><td>${esc(UBY.state.api?.monthName?.(mk) || mk)}</td><td class="num"><input class="select" type="number" min="0" step="0.01" data-tax-month="${esc(mk)}" value="${v === undefined ? "" : esc(v)}" placeholder="usar ${esc(e.taxRatePct || 0)}%" style="width:150px"></td><td><small>${v === undefined ? `alíquota de ${esc(e.taxRatePct || 0)}%` : "valor lançado"}</small></td></tr>`; }).join("")}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Cotistas</p><h2>Cotistas e valor pago por cota</h2><p>${quotasSum} cota(s) cadastradas. "Habilitado a partir de" define o primeiro mês em que o cotista participa.</p></div>
          <button class="btn" id="pmInvAdd" type="button">＋ Cotista</button></div>
        <div class="table-wrap"><table><thead><tr><th>Cotista</th><th class="num">Cotas</th><th>Habilitado a partir de</th><th class="num">Valor pago por cota (R$)</th><th class="num">Investido</th><th>Situação</th><th></th></tr></thead>
          <tbody>${e.investors.map((i, k) => `<tr>
            <td><input class="select" data-inv="${k}|name" value="${esc(i.name)}" style="width:100%"></td>
            <td class="num"><input class="select" type="number" min="0" step="1" data-inv="${k}|quotas" value="${esc(i.quotas)}" style="width:80px"></td>
            <td><input class="select" type="month" data-inv="${k}|eligibleFrom" value="${esc(i.eligibleFrom)}"></td>
            <td class="num"><input class="select" type="number" min="0" step="1000" data-inv="${k}|quotaValue" value="${esc(i.quotaValue || "")}" placeholder="padrão ${esc(e.quotaValue)}" style="width:130px"></td>
            <td class="num">${fmt.brl(Number(i.quotas || 0) * (Number(i.quotaValue) || Number(e.quotaValue) || 0))}</td>
            <td><select class="select" data-inv="${k}|status">${["pendente", "aprovado", "pago"].map(s => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
            <td><button class="btn ghost" data-inv-del="${k}" type="button">✕</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum cotista.</td></tr>`}</tbody></table></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="pmPolSave" type="button" ${canWrite(w) && !busy ? "" : "disabled"}>Salvar política e cotistas</button><button class="btn" id="pmPolReset" type="button">Descartar</button></div>
      </section>`;
  }

  // ---------- render ----------
  async function render(target) {
    target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Abrindo parâmetros e custos</h2><p>Carregando a plataforma original com a base completa. Na primeira vez leva alguns segundos.</p></div>`;
    let w;
    try { w = await engine(); } catch (err) { target.innerHTML = `<div class="loading"><h2>Não foi possível abrir</h2><p>${esc(err.message)}</p></div>`; return; }
    if (!location.hash.startsWith("#/parametros")) return;
    await draw(target, w);
  }

  async function draw(target, w) {
    const data = { chargers: chargers(w), months: [], form: null };
    const writable = canWrite(w);
    if (ui.tab === "carregador") {
      if (!ui.charger) ui.charger = (data.chargers.find(c => c.included && ["uby", "hybrid"].includes(c.model)) || data.chargers[0] || {}).key || "";
      if (ui.charger) {
        const opened = await openCharger(w, ui.charger, ui.month);
        data.months = opened.months; ui.month = opened.mk;
        if (Object.keys(ui.edits).length || ui.rules) applyToEngine(w);
        data.form = readForm(w);
      }
    } else {
      data.months = (UBY.state.months && UBY.state.months.length ? UBY.state.months : (w.getMonths?.() || [])).slice();
      if (ui.tab === "documentos") {
        const mk = ui.docMonth || data.months.at(-1) || "";
        ui.docMonth = mk;
        try { data.docs = await w.UBY_SUPABASE.loadFinanceDocuments({ competenceKey: mk, limit: 200 }); data.docsError = ""; }
        catch (err) { data.docs = []; data.docsError = err.message; }
      }
    }
    const c = data.chargers.find(x => x.key === ui.charger);
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança · edição</p><h1>Parâmetros e custos</h1>
        <p class="lead">Modelo, splits, energia, capital, metas e regras de cada carregador por competência; custos centrais da matriz; calendário de pagamentos; rodadas e cotistas. As contas e a gravação são as mesmas da plataforma original.</p></div>
        <div class="callout" style="${writable ? "border-left-color:var(--uby-red)" : ""}"><strong>${writable ? "Grava na base real" : "Somente leitura"}</strong><small>${writable ? "A mesma base da plataforma atual. Cada alteração fica no histórico por competência e no log de auditoria." : "A liberação de gravação desta tela não está ativa. Recarregue a página."}</small></div></div>
      <div class="seg" id="pmTabs" style="margin-bottom:14px">${[["carregador", "Por carregador"], ["operacao", "Operação e carregadores"], ["matriz", "Custos da matriz"], ["pagamentos", "Pagamentos"], ["documentos", "Documentos"], ["cotas", "Cotas, impostos e rodadas"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.tab === v ? "on" : ""}">${l}</button>`).join("")}</div>
      ${ui.tab === "carregador" ? (data.form ? chargerTab(w, data) : `<div class="note">Nenhum carregador encontrado.</div>`) : ui.tab === "operacao" ? operationTab(w) : ui.tab === "matriz" ? matrixTab(w, data) : ui.tab === "pagamentos" ? paymentsTab(w) : ui.tab === "documentos" ? docsTab(w, data) : quotasTab(w)}
      <section class="section"><div class="section-head"><div><p class="kicker">Registro</p><h2>O que foi feito nesta sessão</h2></div></div>
        <div class="list">${ui.log.map(l => `<div class="list-row" style="display:block;white-space:normal"><span class="badge ${l.cls}">${l.cls === "ok" ? "ok" : "atenção"}</span> <small>${new Date(l.at).toLocaleTimeString("pt-BR")}</small> ${esc(l.msg)}</div>`).join("") || `<div class="note">Nenhuma alteração ainda.${c ? ` Editando ${esc(c.station)}.` : ""}</div>`}</div></section>`;
    bind(target, w, data);
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
    target.querySelectorAll("#pmTabs button").forEach(b => b.onclick = () => { ui.tab = b.dataset.v; draw(target, w); });
    // --- por carregador ---
    if ($("#pmCharger")) $("#pmCharger").onchange = e => { if (dirty() && !confirm("Descartar as alterações não salvas?")) { e.target.value = ui.charger; return; } ui.charger = e.target.value; ui.edits = {}; ui.rules = null; draw(target, w); };
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
    target.querySelectorAll("[data-cf]").forEach(el => el.onchange = () => { ui.costForm[el.dataset.cf] = el.value; if (el.dataset.cf === "method") draw(target, w); });
    target.querySelectorAll("[data-cf-target]").forEach(el => el.onchange = () => { const s = el.dataset.cfTarget; ui.costForm.targets = el.checked ? [...new Set([...ui.costForm.targets, s])] : ui.costForm.targets.filter(x => x !== s); });
    target.querySelectorAll("[data-cost-edit]").forEach(b => b.onclick = () => { ui.editingCost = b.dataset.costEdit; ui.costForm = null; draw(target, w); });
    if ($("#pmCostCancel")) $("#pmCostCancel").onclick = () => { ui.editingCost = ""; ui.costForm = null; draw(target, w); };
    if ($("#pmCostSave")) $("#pmCostSave").onclick = () => {
      const f = ui.costForm;
      if (!String(f.name || "").trim() || !(Number(f.amount) > 0)) { log("Custo da matriz: informe nome e valor.", "bad"); draw(target, w); return; }
      run(target, w, `Custo da matriz ${f.name}`, async () => {
        await resyncMatrix(w);
        const mk = ui.matrixMonth || data.months.at(-1) || "";
        const monthSel = w.document.getElementById("financeMonthSelector");
        if (monthSel && [...monthSel.options].some(o => o.value === mk)) monthSel.value = mk;
        w.renderMatrizCosts(w.getGeneralUnitData());
        if (ui.editingCost) w.editMatrizCost(ui.editingCost); else w.resetMatrizCostForm();
        const set = (id, v) => { const el = w.document.getElementById(id); if (el) el.value = v ?? ""; };
        set("matrizNewName", f.name); set("matrizNewValue", f.amount); set("matrizCostCategory", f.category); set("matrizCostSupplier", f.supplier);
        set("matrizCostKind", f.kind); set("matrizCostInstallments", f.installments || 1); set("matrizCostStartMonth", f.startMonth || mk); set("matrizCostEndMonth", f.endMonth);
        set("matrizCostDueDay", f.dueDay || 1); set("matrizCostMethod", f.method); set("matrizCostCustomShares", f.shares); set("matrizCostDocument", f.documentRef); set("matrizCostNotes", f.notes);
        const tsel = w.document.getElementById("matrizCostTargets");
        if (tsel) [...tsel.options].forEach(o => { o.selected = f.targets.includes(o.value); });
        w.addMatrizCost();
        const fb = await awaitMatrixSave(w);
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
        await resyncMatrix(w);
        w.renderScheduledPayments(w.getGeneralUnitData());
        const set = (id, v) => { const el = w.document.getElementById(id); if (el) el.value = v ?? ""; };
        set("scheduledPaymentTarget", p.target); set("scheduledPaymentName", p.name); set("scheduledPaymentSupplier", p.supplier); set("scheduledPaymentCategory", p.category);
        set("scheduledPaymentAmount", p.amount); set("scheduledPaymentDueDay", p.dueDay || 11); set("scheduledPaymentStartMonth", p.startMonth || ui.payMonth); set("scheduledPaymentEndMonth", p.endMonth);
        w.addScheduledPayment();
        const fb = await awaitMatrixSave(w);
        ui.payForm = null;
        return fb || "pagamento programado salvo";
      });
    };
    // --- operação ---
    target.querySelectorAll("[data-op-cfg]").forEach(b => b.onclick = () => { ui.opCharger = ui.opCharger === b.dataset.opCfg ? "" : b.dataset.opCfg; ui.opForm = null; draw(target, w); });
    if ($("#pmOpCancel")) $("#pmOpCancel").onclick = () => { ui.opCharger = ""; ui.opForm = null; draw(target, w); };
    target.querySelectorAll("[data-of]").forEach(el => el.onchange = () => { const k = el.dataset.of; ui.opForm[k] = k === "open24h" ? el.value === "1" : el.value; if (k === "open24h") draw(target, w); });
    target.querySelectorAll("[data-of-day]").forEach(el => el.onchange = () => { const d = el.dataset.ofDay; ui.opForm.openDays = el.checked ? [...new Set([...(ui.opForm.openDays || []), d])] : (ui.opForm.openDays || []).filter(x => x !== d); });
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
        await w.saveStationLayoutConfiguration();
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
    if ($("#pmDocSave")) $("#pmDocSave").onclick = () => {
      const df = ui.docForm;
      const file = $("#pmDocFile")?.files?.[0] || null;
      if (!String(df.supplier || "").trim() || !(Number(df.amount) > 0)) { log("Documento: informe fornecedor e valor.", "bad"); draw(target, w); return; }
      const [kind, ref] = String(df.link || "").split("|");
      run(target, w, `Documento ${df.supplier}`, async () => {
        await w.UBY_SUPABASE.createFinanceDocument({
          scope: kind === "work" ? "charger" : "matrix", workId: kind === "work" ? ref : null, matrixCostId: kind === "cost" ? ref : null,
          competenceKey: ui.docMonth, supplier: df.supplier, category: df.category, documentNumber: df.documentNumber, documentType: df.documentType,
          amount: Number(df.amount), dueDate: df.dueDate || null, status: df.status, installmentNumber: df.installmentNumber || null, installmentTotal: df.installmentTotal || null, notes: df.notes
        }, file);
        ui.docForm = null;
        return file ? `salvo com o arquivo ${file.name}` : "salvo sem arquivo";
      });
    };
    // --- cotas ---
    target.querySelectorAll("[data-pol]").forEach(el => el.onchange = () => { const k = el.dataset.pol; ui.policyEdits[k] = ["roundLabel", "distributionStartMonth"].includes(k) ? el.value : Number(el.value || 0); draw(target, w); });
    target.querySelectorAll("[data-tax-month]").forEach(el => el.onchange = () => { const k = el.dataset.taxMonth; if (el.value === "") delete ui.policyEdits.taxByMonth[k]; else ui.policyEdits.taxByMonth[k] = Math.max(0, Number(el.value)); draw(target, w); });
    target.querySelectorAll("[data-inv]").forEach(el => el.onchange = () => { const [i, k] = el.dataset.inv.split("|"); ui.policyEdits.investors[Number(i)][k] = ["quotas", "quotaValue"].includes(k) ? Number(el.value || 0) : el.value; draw(target, w); });
    if ($("#pmInvAdd")) $("#pmInvAdd").onclick = () => { ui.policyEdits.investors.push({ name: "Novo cotista", quotas: 1, eligibleFrom: new Date().toISOString().slice(0, 7), status: "pendente", quotaValue: ui.policyEdits.quotaValue }); draw(target, w); };
    target.querySelectorAll("[data-inv-del]").forEach(b => b.onclick = () => { const i = Number(b.dataset.invDel); if (confirm(`Remover ${ui.policyEdits.investors[i].name} da lista de cotistas?`)) { ui.policyEdits.investors.splice(i, 1); draw(target, w); } });
    if ($("#pmPolReset")) $("#pmPolReset").onclick = () => { ui.policyEdits = null; draw(target, w); };
    if ($("#pmPolSave")) $("#pmPolSave").onclick = () => run(target, w, "Política de cotas", async () => {
      await resyncMatrix(w);
      const current = w.loadNetworkDistribution();
      const next = { ...current, ...ui.policyEdits, investors: ui.policyEdits.investors.filter(i => String(i.name || "").trim() && Number(i.quotas) > 0) };
      const saved = w.saveNetworkDistribution(next);
      const fb = await awaitMatrixSave(w);
      if (Number(saved.quotaValue) !== Number(next.quotaValue) || Number(saved.taxRatePct || 0) !== Number(next.taxRatePct || 0)) throw new Error("A política não foi aceita pela plataforma original (valor da cota ou impostos).");
      ui.policyEdits = null;
      return fb || "política salva na nuvem";
    });
  }

  UBY.register("parametros", { render });
})();

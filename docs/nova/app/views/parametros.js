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
  const ui = { tab: "pagamentos", charger: "", month: "", edits: {}, rules: null, matrixMonth: "", editingCost: "", costForm: null, payMonth: new Date().toISOString().slice(0, 7), payForm: null, policyEdits: null, log: [] };
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
    const energyInvoiceBox = () => `<div class="note" style="border-color:var(--uby-green, #1f9d55)"><strong>Energia desta competência vem das Faturas de energia</strong>
        ${invMonth && (invMonth.parts.length || invMonth.estimatedCost) ? `<br>${invMonth.parts.map(p => `fatura ${esc(mName(p.ref) || p.start)}: consumo de ${fmtDay(p.from)} a ${fmtDay(p.to)} · Copel ${fmt.brl(p.copel)}${p.lease ? ` + arrendamento ${fmt.brl(p.lease)}` : ""}`).join("<br>")}
          ${invMonth.estimatedCost ? `<br><span class="badge warn">estimativa</span> ${fmtDay(invMonth.estimatedFrom)} a ${fmtDay(invMonth.estimatedTo)}: ${fmt.brl(invMonth.estimatedCost)} (até a próxima fatura ser lançada)` : ""}
          <br><strong>Energia do mês: ${fmt.brl(invMonth.cost)}</strong>` : `<br>Nenhum consumo deste carregador cai nesta competência.`}
        <br><small>Os campos de energia por competência deixam de ser usados para este carregador.</small>
        <br><a class="btn" href="#/parametros/energia/${encodeURIComponent(ui.charger)}" style="margin-top:8px;display:inline-flex">Abrir Faturas de energia →</a></div>`;
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
      ${dirty
        ? `<div class="grid g5" style="margin-bottom:14px">${f.summary.map((m, i) => kpi(m.label, esc(m.value), esc(m.sub || ""), "", i === 2 ? "lead" : "")).join("")}${kpi("Base desta competência", esc(f.versionSource || "—"), esc(f.versionHelp || ""))}</div>
           <div class="note" style="margin-bottom:12px">Simulação das alterações ainda não salvas (conta da tela original${hasInv ? ", sem as faturas de energia por leitura" : ""}). Depois de salvar, os cartões voltam a mostrar o resultado oficial.</div>`
        : `<div class="grid g5" style="margin-bottom:14px">${officialCards}${kpi("Base desta competência", esc(f.versionSource || "—"), esc(f.versionHelp || ""))}</div>
           ${off && !off.operating ? `<div class="note" style="margin-bottom:12px">Este carregador ainda não operava em ${esc(mName(ui.month))}${firstOp ? ` (primeira competência com recarga: ${esc(mName(firstOp))})` : ""}. Os parâmetros abaixo ficam guardados, mas esta competência não entra no resultado oficial, nos relatórios nem na distribuição.</div>` : ""}`}
      <div class="grid g2" style="gap:14px">${f.rows.filter(r => modelVisible(r, model, transfer) && r.controls.length).map(r => `
        <section class="section" style="margin:0"><div class="section-head" style="margin-bottom:8px"><div><p class="kicker">${esc(r.group)}</p><h2 style="font-size:14px">${esc(r.name)}</h2><p>${esc(r.key === "energyCostPerKWh" && hasInv ? "Custo de energia pelas faturas da Copel e do arrendamento, dividido pelo mês de consumo." : r.rule)}</p></div>
          ${r.key === "energyCostPerKWh" && hasInv ? "" : `<div class="meta">anterior<br><strong>${esc(r.previous || "—")}</strong></div>`}</div>
          ${r.key === "energyCostPerKWh" && hasInv ? energyInvoiceBox() : `<div class="grid ${r.controls.length > 2 ? "g3" : "g2"}" style="gap:8px">${r.controls.filter(c => !c.leaseOnly || energyMode === "copel_lease").map(c => control(c, r)).join("")}</div>
          ${r.key === "energyCostPerKWh" ? `<p class="source-line">${esc(f.energySummary)}</p>` : ""}`}</section>`).join("")}</div>
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
      } : { name: "", amount: "", category: "Outros custos", supplier: "", kind: "recurring", installments: 1, startMonth: new Date().toISOString().slice(0, 7), endMonth: "", dueDay: 1, method: "equal", shares: "", documentRef: "", notes: "", targets: [] };
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
    const rec = B && tx.length ? B.reconcile(tx, bills, p.links || {}) : { bills: [], outflows: [], unmatched: [] };
    const byKey = new Map(rec.bills.map(b => [b.key, b]));
    // Só vale "não achado" para contas cujo vencimento/pagamento cai dentro do período dos extratos.
    const covered = b => from && to && (b.paidAt || b.due) >= from && (b.paidAt || b.due) <= to;
    return { p, tx, from, to, rec, byKey, covered, bills };
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
    const kindLabel = b => b.kind === "energia" ? "Energia" : b.kind === "area" ? "Repasse à área" : b.source || "Custo";
    const recCell = b => {
      const r = recOf(b);
      if (!bs.tx.length) return `<small style="color:var(--uby-muted)">sem extrato</small>`;
      if (!r) return `<small style="color:var(--uby-muted)">fora do período do extrato</small>`;
      const [cls, label] = REC[r.status];
      const txt = r.tx.length ? `${r.tx.map(t => `${fmtDay(t.date)} · ${fmt.brl(t.value)}`).join(" + ")}${r.sharedWith.length ? ` (junto com ${r.sharedWith.length} outra(s) conta(s))` : ""}${r.diff ? ` · diferença ${fmt.brl(r.diff)}` : ""}` : "";
      return `<span class="badge ${cls}">${label}</span>${txt ? `<small>${esc(txt)}</small>` : ""}${!b.paid && (r.status === "pago-nao-marcado" || r.status === "diferenca") ? `<button class="btn" data-c-paybank="${esc(b.key)}|${esc(r.bankDate)}|${r.sharedWith.length ? "" : r.paidTotal}" type="button" style="margin-top:4px" ${can}>Marcar pago em ${fmtDay(r.bankDate)}${b.kind === "area" && r.diff && !r.sharedWith.length ? ` com ${fmt.brl(r.paidTotal)} (diferença vai ao mês seguinte)` : ""}</button>` : ""}`;
    };
    const payPanel = b => {
      const r = recOf(b);
      const date = r?.bankDate || today;
      const isArea = b.kind === "area";
      const due = isArea ? Number(b.dueAmount ?? b.amount) : b.amount;
      return `<tr><td colspan="7"><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        ${field("Pago em", `<input class="select" type="date" data-c-date value="${esc(date)}" style="width:150px">`)}
        ${isArea ? `${field(`Valor pago (devido ${fmt.brl(due)})`, `<input class="select" type="number" step="0.01" data-c-amount data-due="${esc(due.toFixed(2))}" value="${esc((r && !r.sharedWith.length && r.tx.length ? r.paidTotal : due).toFixed(2))}" style="width:150px">`)}
          ${field("Se o valor pago for diferente do devido", `<select class="select" data-c-diff style="width:260px"><option value="next">Levar a diferença para o mês seguinte</option><option value="drop">Zerar a diferença</option></select>`)}` : `<small style="padding-bottom:8px">Valor: <strong>${fmt.brl(b.amount)}</strong>${b.kind === "energia" ? " · para mudar o valor, edite a fatura em Energia" : " · para mudar o valor, edite o custo em Outros custos"}</small>`}
        <button class="btn primary" data-c-confirm="${esc(b.key)}" type="button" ${can}>Confirmar pagamento</button>
        <button class="btn ghost" data-c-cancel type="button">Cancelar</button></div></td></tr>`;
    };
    // Saídas do extrato no mês (para conferir e vincular à mão o que não casou sozinho).
    const outs = bs.rec.outflows.filter(t => t.date.slice(0, 7) === mk);
    const billName = k => { const b = bs.bills.find(x => x.key === k); return b ? `${b.name}${b.station ? ` · ${b.station}` : ""}` : k; };
    const linkOptions = t => {
      const near = bs.bills.filter(b => Math.abs((new Date(`${b.due}T12:00:00`) - new Date(`${t.date}T12:00:00`)) / 86400000) <= 75)
        .sort((a, b) => Math.abs(a.amount - t.value) - Math.abs(b.amount - t.value)).slice(0, 25);
      return `<option value="">Vincular a uma conta…</option>${near.map(b => `<option value="${esc(b.key)}">${esc(fmtDay(b.due))} · ${esc(fmt.brl(b.amount))} · ${esc(b.name)}</option>`).join("")}<option value="__new">＋ Lançar como conta nova (já paga)</option><option value="__ignore">Não é conta (transferência, retirada…)</option>`;
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
    const infl = window.UBY_BANK ? window.UBY_BANK.inflows(bs.tx) : {};
    const inflMonths = Object.keys(infl).sort().reverse();
    const inflSrc = ["Spott", "Move", "Cartão (vendas)", "Rendimentos", "Outras entradas"].filter(s => inflMonths.some(m => infl[m][s]));
    return `
      <div class="toolbar"><label>Vencimentos de <input class="select" id="pmCentralMonth" type="month" value="${esc(mk)}"></label>
        <span class="spacer"></span><small>Energia, repasses às áreas, custos da matriz e pagamentos programados · para cotistas, veja Cotas e fechamentos</small></div>
      <div class="grid g5" style="margin-bottom:14px">${kpi("A pagar no mês", fmt.brl(tot.total), `${rows.length} conta(s)`, "", "lead")}${kpi("Em aberto", fmt.brl(tot.open))}${kpi("Vencido", fmt.brl(tot.late), "", "", tot.late ? "bad" : "")}${kpi("Pago", fmt.brl(tot.paid))}${kpi("Conferido no extrato", bs.tx.length ? `${conf} de ${nRec.length}` : "—", bs.tx.length ? `extratos de ${fmtDay(bs.from)} a ${fmtDay(bs.to)}` : "anexe o extrato abaixo")}</div>
      <section class="section"><div class="section-head"><div><p class="kicker">Contas do mês</p><h2>Pagamentos</h2><p>Marque como pago aqui mesmo. Quando houver extrato, a coluna Extrato mostra se o pagamento apareceu no banco, com a data e o valor.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Conta</th><th>De onde</th><th class="num">Valor</th><th>Situação</th><th>Extrato</th><th></th></tr></thead>
          <tbody>${rows.map(b => `<tr><td><strong>${fmtDay(b.due)}</strong></td>
            <td><strong>${esc(b.name)}</strong><small>${esc(kindLabel(b))}${b.supplier ? ` · ${esc(b.supplier)}` : ""}</small></td>
            <td>${esc(b.station || "—")}${b.workName ? `<small>${esc(b.workName)}</small>` : ""}</td>
            <td class="num"><strong>${fmt.brl(b.amount)}</strong>${b.kind === "area" && b.paidAmount !== null && b.paidAmount !== undefined && Math.abs(b.paidAmount - b.dueAmount) > 0.009 ? `<small>devido ${fmt.brl(b.dueAmount)}</small>` : ""}</td>
            <td><span class="badge ${b.paid ? "ok" : b.status === "overdue" ? "bad" : "warn"}">${esc(b.statusLabel || (b.paid ? "Pago" : "A pagar"))}</span>${b.paidAt ? `<small>em ${fmtDay(b.paidAt)}</small>` : ""}</td>
            <td style="white-space:normal;min-width:200px">${recCell(b)}</td>
            <td style="white-space:nowrap">${b.paid ? `<button class="btn ghost" data-c-unpay="${esc(b.key)}" type="button" ${can}>Desfazer</button>` : `<button class="btn primary" data-c-pay="${esc(b.key)}" type="button" ${can}>Marcar pago</button>`}</td></tr>
            ${ui.cPay === b.key && !b.paid ? payPanel(b) : ""}`).join("") || `<tr><td colspan="7" class="empty">Nenhuma conta vence neste mês.</td></tr>`}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Conferência</p><h2>Extrato do banco</h2>
          <p>Anexe o extrato (Excel, CSV ou OFX; o do PagSeguro em Excel funciona direto). Pode anexar períodos que se sobrepõem: lançamentos repetidos não duplicam. As saídas são casadas com as contas pelo valor e pela data; o que não casar sozinho você vincula abaixo.</p></div></div>
        <label class="imp-field" style="display:block;border:1.5px dashed var(--uby-line, #c9d6cf);border-radius:10px;padding:10px 12px;margin-bottom:10px;cursor:pointer">
          <span style="font-size:12px;font-weight:800">🏦 Anexar extrato</span><small style="display:block;color:var(--uby-muted)">.xlsx, .xls, .csv ou .ofx</small>
          <input id="pmBankFile" type="file" accept=".xlsx,.xls,.csv,.ofx,.txt" style="margin-top:6px;width:100%" ${can}></label>
        ${data.bankError ? `<div class="note" style="border-color:var(--uby-red)">Não consegui ler os extratos guardados: ${esc(data.bankError)}</div>` : ""}
        ${(bs.p.statements || []).length ? `<div class="list" style="margin-bottom:12px">${bs.p.statements.slice().reverse().map(s => `<div class="list-row"><span><strong>${esc(s.fileName || "extrato")}</strong> · ${esc(s.bank || "")}${s.account ? ` · conta ${esc(s.account)}` : ""}<br><small>${fmtDay(s.from)} a ${fmtDay(s.to)} · ${fmt.int(s.count)} lançamento(s), ${fmt.int(s.added)} novo(s) · anexado ${esc(fmt.dt(s.importedAt))}</small></span></div>`).join("")}</div>` : ""}
        ${bs.tx.length ? `
          <h3 style="margin:14px 0 8px;font-size:13px">Saídas do banco em ${esc(UBY.state.api?.monthName?.(mk) || mk)} ${bs.rec.unmatched.length ? `<span class="badge warn">${fmt.int(bs.rec.unmatched.length)} sem conta no total</span>` : ""}</h3>
          <div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição no extrato</th><th class="num">Valor</th><th>Conta</th><th></th></tr></thead><tbody>
            ${outs.map(t => `<tr><td>${fmtDay(t.date)}</td><td>${esc(t.description)}<small>${esc(t.type || "")}</small></td><td class="num"><strong>${fmt.brl(t.value)}</strong></td>
              <td style="white-space:normal">${t.bills.length ? `${t.bills.map(k => `<small>${esc(billName(k))}</small>`).join("")}<span class="badge ${t.how === "manual" ? "neutral" : t.how === "aproximado" ? "warn" : "ok"}">${t.how === "manual" ? "vinculado à mão" : t.how === "grupo" ? "casado (soma)" : t.how === "aproximado" ? "casado (valor próximo)" : "casado"}</span>` : t.ignored ? `<span class="badge neutral">não é conta</span>${t.note ? `<small>${esc(t.note)}</small>` : ""}` : `<select class="select" data-bank-link="${esc(t.id)}" style="max-width:360px" ${can}>${linkOptions(t)}</select>`}</td>
              <td>${(bs.p.links || {})[t.id] ? `<button class="btn ghost" data-bank-unlink="${esc(t.id)}" type="button" ${can}>Desfazer</button>` : ""}</td></tr>
              ${ui.bankNew === t.id && !t.bills.length ? newPanel(t) : ""}`).join("") || `<tr><td colspan="5" class="empty">Nenhuma saída no extrato neste mês.</td></tr>`}
          </tbody></table></div>
          <h3 style="margin:18px 0 8px;font-size:13px">Entradas por mês e origem</h3>
          <div class="table-wrap"><table><thead><tr><th>Mês</th>${inflSrc.map(s => `<th class="num">${esc(s)}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
            ${inflMonths.map(m => `<tr><td><strong>${esc(UBY.state.api?.monthName?.(m) || m)}</strong></td>${inflSrc.map(s => `<td class="num">${infl[m][s] ? fmt.brl(infl[m][s]) : "—"}</td>`).join("")}<td class="num"><strong>${fmt.brl(Object.values(infl[m]).reduce((a, v) => a + v, 0))}</strong></td></tr>`).join("")}
          </tbody></table></div>
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
      item.paymentLedger = { ...(item.paymentLedger || {}), [b.monthKey]: date ? { status: "paid", paidAt: `${date}T12:00:00`, updatedAt: now } : { status: "pending", paidAt: "", updatedAt: now } };
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
  function operationTab(w) {
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
      uc: f.uc || "", meter: f.meter || "", nfNumber: f.nfNumber || "", documentId: f.documentId || "" };
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
    const prevLease = cur.filter(i => Number(i.leaseAmount) > 0 && Number(i.leaseKWh) > 0).sort((a, b) => String(a.end).localeCompare(String(b.end))).pop();
    const rate = prevLease ? Number(prevLease.leaseAmount) / Number(prevLease.leaseKWh) : 0;
    const suggestedLease = f.compensatedKWh > 0 && rate > 0 ? Math.round(f.compensatedKWh * rate * 100) / 100 : "";
    ui.enForm = {
      ...(same || blankInvoice()), id: same?.id || "",
      ref: f.ref, kwh: f.kwh, copelAmount: f.copelAmount, start: f.start, end: f.end, dueDate: f.dueDate,
      readingStart: f.readingStart ?? "", readingEnd: f.readingEnd ?? "", multiplier: f.multiplier || 40, leaseKWh: f.compensatedKWh || 0,
      leaseAmount: same && Number(same.leaseAmount) > 0 ? same.leaseAmount : suggestedLease,
      uc: f.uc || "", meter: f.meter || "", nfNumber: f.nfNumber || "", documentId: same?.documentId || ""
    };
    ui.enPendingFile = file || null;
    ui.enRead = {
      ok: true, file: file?.name || "",
      msg: `Fatura ${f.ref.slice(5)}/${f.ref.slice(0, 4)} · UC ${f.uc} · leitura ${f.start.split("-").reverse().join("/")} a ${f.end.split("-").reverse().join("/")} (${f.days} dias) · ${f.kwh} kWh · Copel R$ ${f.copelAmount.toFixed(2).replace(".", ",")} · vence ${f.dueDate.split("-").reverse().join("/")}${f.compensatedKWh ? ` · ${f.compensatedKWh} kWh compensados` : " · sem compensação"}${f.creditBalance ? ` · saldo de créditos ${f.creditBalance} kWh` : ""}`,
      notes: [same ? "Esta referência já estava lançada: os campos foram atualizados com o PDF (confira e clique em Atualizar na lista)." : "",
        byUc && byUc.c.key === ui.enCharger ? `Carregador identificado pela UC: ${byUc.c.station}.` : f.uc ? "UC ainda não vinculada: confira se o carregador selecionado é o certo." : "",
        f.compensatedKWh ? (same && Number(same.leaseAmount) > 0 ? `Arrendamento mantido como estava: R$ ${Number(same.leaseAmount).toFixed(2).replace(".", ",")}.` : suggestedLease !== "" ? `Arrendamento sugerido: ${f.compensatedKWh} kWh × R$ ${rate.toFixed(4).replace(".", ",")} (tarifa da última fatura) = R$ ${String(suggestedLease).replace(".", ",")} — confira com o boleto do arrendamento.` : "Informe o valor do arrendamento (não vem na fatura da Copel).") : "",
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
  function energyTab(w, data) {
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
    const f = ui.enForm || (ui.enForm = blankInvoice(draft.slice().sort((a, b) => String(a.end).localeCompare(String(b.end))).pop()));
    const preview = cleanInvoice(f);
    const can = canWrite(w) && !busy ? "" : "disabled";
    const inp = (k, label, type = "text", extra = "") => field(label, `<input class="select" data-ef="${k}" type="${type}" value="${esc(f[k] ?? "")}" ${extra} style="width:100%">`);
    const byId = new Map(info.invoices.map(i => [i.id, i]));
    const months = Object.keys(info.months).sort().reverse();
    const groups = [["Operação UBY", c => c.included && ["uby", "hybrid"].includes(c.model)], ["Parceiros", c => c.included && c.model === "third_party_management"], ["Só gestão P3", c => c.included && ["management_only", "p3_society"].includes(c.model)], ["Fora da operação UBY", c => !c.included]];
    return `
      <div class="toolbar">
        <select class="select" id="pmEnCharger" style="min-width:280px">${groups.map(([label, test]) => { const g = list.filter(test); return g.length ? `<optgroup label="${esc(label)}">${g.map(c => `<option value="${esc(c.key)}" ${c.key === ui.enCharger ? "selected" : ""}>${esc(c.station)} · ${esc(c.workName)}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>
        <span class="spacer"></span>
        ${dirty ? `<button class="btn" id="pmEnDiscard" type="button">Descartar</button>` : ""}
        <button class="btn primary" id="pmEnSave" type="button" ${dirty ? can : "disabled"}>Salvar faturas</button>
      </div>
      ${info.fullHistory ? "" : `<div class="note" style="margin-bottom:12px">O histórico completo ainda está carregando: a divisão abaixo pode mudar. Aguarde alguns segundos e troque de aba.</div>`}
      ${dirty ? `<div class="note" style="margin-bottom:12px;border-color:var(--uby-amber)">Alterações ainda não salvas. A divisão por mês abaixo já mostra como vai ficar.</div>` : ""}
      <section class="section"><div class="section-head"><div><p class="kicker">Como funciona</p><h2>Energia pela competência do consumo</h2>
          <p>Lance cada fatura com as datas da leitura anterior e da atual (o dia da leitura atual já pertence à próxima fatura). O custo — Copel + arrendamento — entra no relatório do mês em que a energia foi consumida, não no mês do pagamento: o período é dividido entre os meses pela energia que este carregador entregou em cada dia. Dias depois da última fatura entram como <strong>estimativa</strong> (tarifa por kWh entregue da última fatura) até a próxima fatura ser lançada. O vencimento aparece em Pagamentos no mês em que vence. Com faturas lançadas, os campos de energia por competência deste carregador deixam de ser usados pelo motor.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Fatura</th><th>Período de leitura</th><th class="num">kWh medidor</th><th class="num">kWh entregue</th><th class="num">Copel</th><th class="num">Arrendamento</th><th class="num">Total</th><th class="num">R$/kWh entregue</th><th>Vencimento</th><th></th></tr></thead>
          <tbody>${draft.slice().sort((a, b) => String(b.start).localeCompare(String(a.start))).map(i => { const c = byId.get(i.id) || {}; const lease = leaseOf(i); return `<tr>
            <td><strong>${esc(i.ref ? (api.monthName?.(i.ref) || i.ref) : "—")}</strong>${i.notes ? `<small>${esc(i.notes)}</small>` : ""}</td>
            <td>${fmtDay(i.start)} → ${fmtDay(i.end)}<small>${c.days || "—"} dia(s)${i.readingStart !== "" && i.readingEnd !== "" ? ` · leitura ${esc(i.readingStart)} → ${esc(i.readingEnd)} × ${esc(i.multiplier)}` : ""}</small></td>
            <td class="num">${fmt.int(i.kwh)}</td><td class="num">${c.deliveredKWh !== undefined ? fmt.int(c.deliveredKWh) : "—"}<small>${c.deliveredKWh > 0 ? `perda ${fmt.pct1((i.kwh / c.deliveredKWh - 1) * 100)}` : ""}</small></td>
            <td class="num">${fmt.brl(i.copelAmount)}</td><td class="num">${lease ? `${fmt.brl(lease)}${i.kwh > 0 ? `<small>${fmt.brl(lease / i.kwh)}/kWh medido</small>` : ""}` : "—"}</td>
            <td class="num"><strong>${fmt.brl((Number(i.copelAmount) || 0) + lease)}</strong>${i.kwh > 0 ? `<small>${fmt.brl(((Number(i.copelAmount) || 0) + lease) / i.kwh)}/kWh medido</small>` : ""}</td><td class="num">${c.ratePerDelivered ? fmt.brl(c.ratePerDelivered) : "—"}</td>
            <td>${fmtDay(i.dueDate)}<small>${i.paidAt ? `Copel paga ${fmtDay(i.paidAt)}` : "Copel a pagar"}${lease ? ` · arrend. ${i.leasePaidAt ? `pago ${fmtDay(i.leasePaidAt)}` : `a pagar${i.leaseDueDate ? ` ${fmtDay(i.leaseDueDate)}` : ""}`}` : ""}</small></td>
            <td style="white-space:nowrap">${i.documentId ? `<button class="btn ghost" data-doc-open="${esc(i.documentId)}" type="button">PDF</button>` : ui.enFiles?.[i.id] ? `<small class="badge warn">PDF a enviar</small>` : ""}<button class="btn ghost" data-en-edit="${esc(i.id)}" type="button">Editar</button><button class="btn ghost" data-en-del="${esc(i.id)}" type="button" style="color:var(--uby-red)">Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="10" class="empty">Nenhuma fatura lançada para este carregador. Enquanto isso, vale o custo por kWh da competência.</td></tr>`}</tbody></table></div>
      </section>
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Resultado</p><h2>Energia por competência de consumo</h2><p>O que entra no relatório de cada mês.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Competência</th><th>Origem</th><th class="num">kWh medidor</th><th class="num">Copel</th><th class="num">Arrendamento</th><th class="num">Estimativa</th><th class="num">Energia do mês</th></tr></thead>
            <tbody>${months.map(mk => { const m = info.months[mk]; return `<tr>
              <td><strong>${esc(api.monthName?.(mk) || mk)}</strong><small>${fmt.int(info.deliveredByMonth[mk] || 0)} kWh entregues</small></td>
              <td style="white-space:normal">${m.parts.map(p => `<small>fatura ${esc(p.ref ? (api.monthName?.(p.ref) || p.ref) : p.start)}: ${fmtDay(p.from)} a ${fmtDay(p.to)} · ${fmt.pct1(p.share * 100)} · ${fmt.brl(p.total)}</small>`).join("")}${m.estimatedCost ? `<small><span class="badge warn">estimativa</span> ${fmtDay(m.estimatedFrom)} a ${fmtDay(m.estimatedTo)} · ${fmt.int(m.estimatedDeliveredKWh)} kWh entregues</small>` : ""}</td>
              <td class="num">${fmt.int(m.kwh + m.estimatedKWh)}</td><td class="num">${fmt.brl(m.copel)}</td><td class="num">${fmt.brl(m.lease)}</td><td class="num">${m.estimatedCost ? fmt.brl(m.estimatedCost) : "—"}</td>
              <td class="num"><strong>${fmt.brl(m.cost)}</strong></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">Sem faturas lançadas.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">${f.id ? "Editando" : "Nova fatura"}</p><h2>${f.id ? `Fatura ${esc(f.ref || f.start)}` : "Lançar fatura de energia"}</h2><p>Lance o que veio na fatura: kWh consumido, valor da Copel, valor do arrendamento e as datas das leituras (a anterior já vem da última fatura). Médias por kWh e a divisão entre os meses são calculadas pela plataforma.</p></div></div>
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
  // Participação da área sobre o faturamento e, quando o ponto ainda usa a energia
  // do local, o reembolso dos kWh vendidos × tarifa do mês (Por carregador · energia).
  function areaTab(w, data) {
    const api = UBY.state.api;
    if (!api || typeof api.areaAccount !== "function") return `<div class="note">O motor está recarregando. Abra esta aba de novo em alguns segundos.</div>`;
    const list = data.chargers.filter(c => c.included);
    if (!ui.arCharger) ui.arCharger = (list.find(c => /malassise/.test(c.workId)) || list[0] || {}).key || "";
    const [workId, station] = (ui.arCharger || "|").split("|");
    const a = api.areaAccount(workId, station);
    if (!a) return `<div class="note">Carregador não encontrado no motor.</div>`;
    const f = ui.arForm || (ui.arForm = { reimburseEnergy: a.config.reimburseEnergy, payee: a.config.payee, payeeEmail: a.config.payeeEmail || "", dueDay: a.config.dueDay });
    const can = canWrite(w) && !busy ? "" : "disabled";
    const today = new Date().toISOString().slice(0, 10);
    const dirty = f.reimburseEnergy !== a.config.reimburseEnergy || f.payee !== a.config.payee || (f.payeeEmail || "") !== (a.config.payeeEmail || "") || Number(f.dueDay) !== Number(a.config.dueDay) || !a.config.configured;
    const st = s => `<span class="badge ${s === "pago" ? "ok" : s === "vencido" ? "bad" : s === "sem repasse" ? "neutral" : "warn"}">${esc(s)}</span>`;
    return `
      <div class="toolbar"><select class="select" id="pmArCharger" style="min-width:280px">${list.map(c => `<option value="${esc(c.key)}" ${c.key === ui.arCharger ? "selected" : ""}>${esc(c.station)} · ${esc(c.workName)}</option>`).join("")}</select>
        <span class="spacer"></span><button class="btn" id="pmArReport" type="button">Prestação de contas (relatório)</button></div>
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Regra do repasse</p><h2>${esc(a.station)}</h2>
            <p>Todo mês o dono do local recebe a participação da área sobre o faturamento bruto${f.reimburseEnergy ? " e o reembolso da energia: kWh vendidos × tarifa do mês" : ""}. O percentual e a tarifa de cada competência ficam em "Por carregador".</p></div></div>
          <div class="grid g2" style="gap:8px">
            ${field("Quem recebe", `<input class="select" data-ar="payee" value="${esc(f.payee || "")}" style="width:100%">`)}
            ${field("Dia do vencimento (mês seguinte)", `<input class="select" type="number" min="1" max="28" data-ar="dueDay" value="${esc(f.dueDay)}" style="width:100%">`)}
            ${field("E-mail de quem recebe (acesso à prestação de contas)", `<input class="select" type="email" data-ar="payeeEmail" value="${esc(f.payeeEmail || "")}" placeholder="opcional" style="width:100%">`)}
          </div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12.5px"><input type="checkbox" data-ar="reimburseEnergy" ${f.reimburseEnergy ? "checked" : ""}> Reembolsar a energia ao dono do local (o ponto ainda usa o padrão/energia do local)</label>
          <p class="source-line">Quando o ponto tiver padrão próprio, desmarque: a energia passa a vir das Faturas de energia e o repasse fica só com a participação.</p>
          <button class="btn primary" id="pmArSave" type="button" style="margin-top:8px" ${dirty ? can : "disabled"}>${a.config.configured ? "Salvar regra" : "Ativar repasse deste carregador"}</button>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Acumulado</p><h2>Do início da operação até hoje</h2></div></div>
          <div class="grid g2">${kpi("Faturamento", fmt.brl(a.totals.revenue), `${fmt.kwh(a.totals.energy)} vendidos`)}${kpi("Total para a área", fmt.brl(a.totals.total), `pago ${fmt.brl(a.totals.paid)}`, "", "lead")}
            ${kpi("Energia reembolsada", fmt.brl(a.totals.reimbursement), a.config.reimburseEnergy ? "kWh vendidos × tarifa" : "não reembolsa")}${kpi("Participação da área", fmt.brl(a.totals.area), "sobre o faturamento bruto")}</div>
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Por competência</p><h2>Repasses ao local</h2><p>${a.config.configured ? `Vence no dia ${a.config.dueDay} do mês seguinte e aparece em Pagamentos.` : "Ative o repasse acima para ele aparecer em Pagamentos."}</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Faturamento</th><th class="num">kWh vendidos</th><th class="num">Tarifa</th><th class="num">Reembolso energia</th><th class="num">% área</th><th class="num">Participação</th><th class="num">Total ao local</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead>
          <tbody>${a.months.slice().reverse().map(m => `<tr><td><strong>${esc(m.label)}</strong><small>${fmt.date(m.periodStart)} a ${fmt.date(m.periodEnd)}</small></td>
            <td class="num">${fmt.brl(m.revenue)}</td><td class="num">${fmt.kwh(m.energy)}</td><td class="num">${m.reimbursement ? `${fmt.brl(m.rate)}/kWh` : "—"}</td><td class="num">${m.reimbursement ? fmt.brl(m.reimbursement) : "—"}</td>
            <td class="num">${fmt.pct1(m.areaPct)}</td><td class="num">${fmt.brl(m.area)}</td><td class="num"><strong>${fmt.brl(m.total)}</strong>${m.adjusted ? `<small>ajustado · calculado ${fmt.brl(m.computedTotal)}${m.adjustNote ? ` · ${esc(m.adjustNote)}` : ""}</small>` : ""}${m.carryIn ? `<small>inclui diferença de ${esc(m.carryFromLabel)}: ${fmt.brl(m.carryIn)}</small>` : ""}${m.paidAmount !== null && m.paidDiff ? `<small>devido ${fmt.brl(m.dueAmount)} · diferença ${fmt.brl(m.paidDiff)} ${m.paidDiffMode === "next" ? "levada ao mês seguinte" : "zerada"}</small>` : ""}</td><td>${fmt.date(m.due + "T12:00:00")}</td>
            <td>${st(m.status)}${m.paidAt ? `<small>em ${fmt.date(m.paidAt + "T12:00:00")}</small>` : ""}</td>
            <td style="white-space:nowrap">${a.config.configured ? (m.paidAt ? `<button class="btn ghost" data-ar-unpay="${esc(m.key)}" type="button" ${can}>Desfazer</button>` : `${m.total > 0 ? `<button class="btn primary" data-ar-pay-open="${esc(m.key)}" type="button" ${can}>Marcar pago</button> ` : ""}<button class="btn ghost" data-ar-adj="${esc(m.key)}" type="button" ${can}>Ajustar valor</button>`) : ""}
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
      investorPool: nz(m.investorPool), eligibleQuotas: nz(m.eligibleQuotas), perQuota: nz(m.perQuota),
      investors: inv.investors.filter(i => i.eligibleFrom <= m.key).map(i => ({ name: i.name, quotas: nz(i.quotas), value: Math.round(nz(i.allocations[idx]) * 100) / 100 }))
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

  function quotasTab(w) {
    const p = w.loadNetworkDistribution();
    const e = ui.policyEdits || (ui.policyEdits = JSON.parse(JSON.stringify({
      quotaValue: p.quotaValue || window.UBY_CONFIG.quotaValueDefault, distributionStartMonth: p.distributionStartMonth || window.UBY_CONFIG.distributionStartDefault, legalReservePct: p.legalReservePct, expansionReservePct: p.expansionReservePct,
      investorPct: p.investorPct, totalQuotas: p.totalQuotas, soldQuotas: p.soldQuotas, roundLabel: p.roundLabel, taxRatePct: p.taxRatePct || 0, taxByMonth: { ...(p.taxByMonth || {}) },
      investors: (p.investors || []).map(i => {
        const qv = Number(i.quotaValue) || Number(p.quotaValue) || window.UBY_CONFIG.quotaValueDefault;
        return { ...i, quotaValue: qv, investedAt: i.investedAt || (i.eligibleFrom ? `${i.eligibleFrom}-01` : ""), investment: Number(i.investment) || Math.round(Number(i.quotas || 0) * qv * 100) / 100 };
      })
    })));
    const inp = (k, label, type = "number", extra = "") => field(label, `<input class="select" data-pol="${k}" type="${type}" value="${esc(e[k] ?? "")}" ${extra} style="width:100%">`);
    const derived = e.investors.map(i => deriveInvestor(i, e.quotaValue));
    const quotasSum = derived.reduce((s, i) => s + Number(i.quotas || 0), 0);
    const investedSum = derived.reduce((s, i) => s + Number(i.investment || 0), 0);
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
      <section class="section"><div class="section-head"><div><p class="kicker">Cotistas</p><h2>Cotistas: data do aporte e valor investido</h2><p>Informe só a data do aporte e o valor investido. A plataforma calcula as cotas (valor ÷ valor da cota da rodada, fixado na entrada do cotista) e o mês em que ele passa a participar: aporte no dia 1º entra no próprio mês; em qualquer outro dia, entra no mês seguinte. ${fmt.n1(quotasSum)} cota(s) · ${fmt.brl(investedSum)} investidos.</p></div>
          <button class="btn" id="pmInvAdd" type="button">＋ Cotista</button></div>
        <div class="table-wrap"><table><thead><tr><th>Cotista</th><th>E-mail (acesso aos extratos)</th><th>Data do aporte</th><th class="num">Valor investido (R$)</th><th class="num">Valor da cota</th><th class="num">Cotas</th><th>Participa a partir de</th><th>Situação</th><th></th></tr></thead>
          <tbody>${e.investors.map((i, k) => { const d = derived[k]; return `<tr>
            <td><input class="select" data-inv="${k}|name" value="${esc(i.name)}" style="width:100%"></td>
            <td><input class="select" type="email" data-inv="${k}|email" value="${esc(i.email || "")}" placeholder="opcional" style="width:100%"></td>
            <td><input class="select" type="date" data-inv="${k}|investedAt" value="${esc(i.investedAt || "")}"></td>
            <td class="num"><input class="select" type="number" min="0" step="0.01" data-inv="${k}|investment" value="${esc(i.investment || "")}" style="width:140px"></td>
            <td class="num">${fmt.brl(d.quotaValue)}<small>da rodada</small></td>
            <td class="num"><strong>${fmt.n1(d.quotas)}</strong></td>
            <td><strong>${esc(d.eligibleFrom ? (UBY.state.api?.monthName?.(d.eligibleFrom) || d.eligibleFrom) : "—")}</strong>${d.investedAt && d.investedAt.slice(8) !== "01" ? "<small>aporte após o dia 1º</small>" : ""}</td>
            <td><select class="select" data-inv="${k}|status">${["pendente", "aprovado", "pago"].map(s => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
            <td><button class="btn ghost" data-inv-del="${k}" type="button">✕</button></td></tr>`; }).join("") || `<tr><td colspan="9" class="empty">Nenhum cotista.</td></tr>`}</tbody></table></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="pmPolSave" type="button" ${canWrite(w) && !busy ? "" : "disabled"}>Salvar política e cotistas</button><button class="btn" id="pmPolReset" type="button">Descartar</button></div>
      </section>`;
  }

  // ---------- render ----------
  // 5 grupos (usuário: "muitas abas… tudo que for de energia em uma só, outros custos em outra");
  // as subabas continuam com os ids antigos para os links diretos (#/parametros/<id>/…).
  const GROUPS = [
    ["Pagamentos e extrato", [["pagamentos", "Pagamentos e extrato"]]],
    ["Energia", [["energia", "Faturas de energia"], ["area", "Repasse à área"]]],
    ["Outros custos", [["matriz", "Custos da matriz"], ["programados", "Pagamentos programados"], ["documentos", "Documentos"]]],
    ["Carregadores", [["carregador", "Por carregador"], ["operacao", "Operação e carregadores"]]],
    ["Cotas e fechamentos", [["cotas", "Cotas, impostos e rodadas"], ["fechamentos", "Fechamentos"]]]
  ];
  const TAB_IDS = GROUPS.flatMap(g => g[1].map(t => t[0]));
  const groupOf = id => GROUPS.find(g => g[1].some(t => t[0] === id)) || GROUPS[0];
  async function render(target, params = []) {
    if (TAB_IDS.includes(params[0])) {
      ui.tab = params[0];
      const ref = params[1] ? decodeURIComponent(params[1]) : "";
      if (ref && ui.tab === "carregador" && ref !== ui.charger) { ui.charger = ref; ui.edits = {}; ui.rules = null; }
      if (ref && ui.tab === "operacao") { ui.opCharger = ref; ui.opForm = null; }
      if (ref && ui.tab === "energia" && ref !== ui.enCharger) { ui.enCharger = ref; ui.enDraft = null; ui.enForm = null; }
    }
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
      // Resultado oficial por competência precisa do histórico completo no motor principal.
      for (let i = 0; i < 120 && !(UBY.state.api && UBY.state.status); i++) await new Promise(r => setTimeout(r, 500));
      try { await Promise.race([UBY.state.api.loadFull(), new Promise(r => setTimeout(r, 15000))]); } catch (_) {}
      if (!ui.charger) ui.charger = (data.chargers.find(c => c.included && ["uby", "hybrid"].includes(c.model)) || data.chargers[0] || {}).key || "";
      if (ui.charger) {
        const opened = await openCharger(w, ui.charger, ui.month);
        data.months = opened.months; ui.month = opened.mk;
        if (Object.keys(ui.edits).length || ui.rules) applyToEngine(w);
        data.form = readForm(w);
      }
    } else {
      data.months = (UBY.state.months && UBY.state.months.length ? UBY.state.months : (w.getMonths?.() || [])).slice();
      if (ui.tab === "energia" || ui.tab === "area" || ui.tab === "pagamentos") {
        // Depois de gravar, o motor principal recarrega: espera ele voltar com o histórico completo.
        for (let i = 0; i < 120 && !(UBY.state.api && UBY.state.status); i++) await new Promise(r => setTimeout(r, 500));
        try { await Promise.race([UBY.state.api.loadFull(), new Promise(r => setTimeout(r, 15000))]); } catch (_) {}
      }
      if (ui.tab === "pagamentos") {
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
    const c = data.chargers.find(x => x.key === ui.charger);
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança · edição</p><h1>Parâmetros e custos</h1>
        <p class="lead">Modelo, splits, energia, capital, metas e regras de cada carregador por competência; custos centrais da matriz; calendário de pagamentos; rodadas e cotistas. As contas e a gravação são as mesmas da plataforma original.</p></div>
        <div class="callout" style="${writable ? "border-left-color:var(--uby-red)" : ""}"><strong>${writable ? "Grava na base real" : "Somente leitura"}</strong><small>${writable ? "A mesma base da plataforma atual. Cada alteração fica no histórico por competência e no log de auditoria." : "A liberação de gravação desta tela não está ativa. Recarregue a página."}</small></div></div>
      <div class="seg" id="pmTabs" style="margin-bottom:${groupOf(ui.tab)[1].length > 1 ? 8 : 14}px">${GROUPS.map(g => `<button type="button" data-v="${g[1][0][0]}" data-group="${esc(g[0])}" class="${groupOf(ui.tab) === g ? "on" : ""}">${esc(g[0])}</button>`).join("")}</div>
      ${groupOf(ui.tab)[1].length > 1 ? `<div class="seg" id="pmSubTabs" style="margin-bottom:14px;font-size:12px">${groupOf(ui.tab)[1].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.tab === v ? "on" : ""}">${esc(l)}</button>`).join("")}</div>` : ""}
      ${ui.tab === "carregador" ? (data.form ? chargerTab(w, data) : `<div class="note">Nenhum carregador encontrado.</div>`) : ui.tab === "energia" ? energyTab(w, data) : ui.tab === "area" ? areaTab(w, data) : ui.tab === "operacao" ? operationTab(w) : ui.tab === "matriz" ? matrixTab(w, data) : ui.tab === "pagamentos" ? centralTab(w, data) : ui.tab === "programados" ? paymentsTab(w) : ui.tab === "documentos" ? docsTab(w, data) : ui.tab === "fechamentos" ? closingsTab(w) : quotasTab(w)}
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
    target.querySelectorAll("#pmTabs button").forEach(b => b.onclick = () => { const g = GROUPS.find(x => x[0] === b.dataset.group); ui.tab = g && g[1].some(t => t[0] === ui.lastSub?.[g[0]]) ? ui.lastSub[g[0]] : b.dataset.v; draw(target, w); });
    target.querySelectorAll("#pmSubTabs button").forEach(b => b.onclick = () => { ui.tab = b.dataset.v; ui.lastSub = { ...(ui.lastSub || {}), [groupOf(ui.tab)[0]]: ui.tab }; draw(target, w); });
    // --- pagamentos (central) + extrato ---
    const cBill = key => (data.bills || []).find(b => b.key === key);
    if ($("#pmCentralMonth")) $("#pmCentralMonth").onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { ui.payMonth = e.target.value; ui.cPay = ""; draw(target, w); } };
    target.querySelectorAll("[data-c-pay]").forEach(b => b.onclick = () => { ui.cPay = ui.cPay === b.dataset.cPay ? "" : b.dataset.cPay; draw(target, w); });
    target.querySelectorAll("[data-c-cancel]").forEach(b => b.onclick = () => { ui.cPay = ""; draw(target, w); });
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
      const opts = bill.kind === "area" && amount !== "" ? { amount: Number(amount), due: Number(bill.dueAmount ?? bill.amount), diffMode: "next" } : {};
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
        else {
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
        return `${res.total} lançamento(s) de ${fmtDay(parsed.meta.from)} a ${fmtDay(parsed.meta.to)}, ${res.added} novo(s)`;
      });
    };
    const saveLinks = (label, mutate) => run(target, w, label, async () => { await w.UBY_SUPABASE.saveBankData(p => { const links = { ...(p.links || {}) }; mutate(links); return { statements: [], transactions: [], ...p, links }; }, { acao: "bank_link" }); return "salvo"; });
    target.querySelectorAll("[data-bank-link]").forEach(sel => sel.onchange = () => {
      const id = sel.dataset.bankLink, v = sel.value;
      if (!v) return;
      if (v === "__new") { ui.bankNew = id; ui.bankNewForm = {}; draw(target, w); return; }
      if (v === "__ignore") { const note = prompt("Motivo (opcional): ex.: transferência entre contas, retirada de sócio", "") ; if (note === null) { sel.value = ""; return; } saveLinks("Saída marcada como não sendo conta", l => { l[id] = { ignore: true, note: note.trim() }; }); }
      else saveLinks("Saída vinculada à conta", l => { l[id] = { bill: v }; });
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
        await w.UBY_SUPABASE.saveBankData(p => ({ statements: [], transactions: [], ...p, links: { ...(p.links || {}), [tx.id]: { bill: `${id}|${mk}` } } }), { acao: "bank_new_bill" });
        return "salvo";
      });
    });
    target.querySelectorAll("[data-bank-unlink]").forEach(b => b.onclick = () => saveLinks("Vínculo desfeito", l => { delete l[b.dataset.bankUnlink]; }));
    // --- repasse à área ---
    if ($("#pmArCharger")) $("#pmArCharger").onchange = e => { ui.arCharger = e.target.value; ui.arForm = null; draw(target, w); };
    target.querySelectorAll("[data-ar]").forEach(el => el.onchange = () => { ui.arForm[el.dataset.ar] = el.type === "checkbox" ? el.checked : el.dataset.ar === "dueDay" ? Number(el.value || 10) : el.value; draw(target, w); });
    const arCtx = () => { const c = data.chargers.find(x => x.key === ui.arCharger); const a = UBY.state.api.areaAccount(c.workId, c.station); return { c, a }; };
    const arSave = (label, mutate) => { const { c, a } = arCtx(); const next = mutate({ reimburseEnergy: a.config.reimburseEnergy, payee: a.config.payee, payeeEmail: a.config.payeeEmail || "", dueDay: a.config.dueDay, paid: { ...(a.config.paid || {}) }, paidInfo: { ...(a.config.paidInfo || {}) }, adjust: { ...(a.config.adjust || {}) } });
      run(target, w, `${label} · ${c.station}`, async () => { await saveChargerField(w, c.workId, c.station, c.workName, "areaAccount", next); ui.arForm = null; return "salvo"; }); };
    if ($("#pmArSave")) $("#pmArSave").onclick = () => arSave("Regra do repasse à área", cfg => ({ ...cfg, reimburseEnergy: !!ui.arForm.reimburseEnergy, payee: String(ui.arForm.payee || "").trim() || cfg.payee, payeeEmail: String(ui.arForm.payeeEmail || "").trim().toLowerCase(), dueDay: Math.min(Math.max(Number(ui.arForm.dueDay) || 10, 1), 28) }));
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
    target.querySelectorAll("[data-cf]").forEach(el => el.onchange = () => { ui.costForm[el.dataset.cf] = el.value; if (["method", "startMonth"].includes(el.dataset.cf)) draw(target, w); });
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
        set("matrizCostKind", f.kind); set("matrizCostInstallments", f.installments || 1); set("matrizCostStartMonth", f.startMonth || new Date().toISOString().slice(0, 7)); set("matrizCostEndMonth", f.endMonth);
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
      ui.tab = "energia";
      applyCopelRead(res, file, data.chargers);
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
    if (ui.tab === "fechamentos" && !ui.docs && !ui.docsLoading) { ui.docsLoading = true; loadDocs(w).finally(() => { ui.docsLoading = false; draw(target, w); }); }
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
    target.querySelectorAll("[data-tax-month]").forEach(el => el.onchange = () => { const k = el.dataset.taxMonth; if (el.value === "") delete ui.policyEdits.taxByMonth[k]; else ui.policyEdits.taxByMonth[k] = Math.max(0, Number(el.value)); draw(target, w); });
    target.querySelectorAll("[data-inv]").forEach(el => el.onchange = () => { const [i, k] = el.dataset.inv.split("|"); ui.policyEdits.investors[Number(i)][k] = k === "investment" ? Number(el.value || 0) : el.value; draw(target, w); });
    if ($("#pmInvAdd")) $("#pmInvAdd").onclick = () => { const qv = Number(ui.policyEdits.quotaValue) || window.UBY_CONFIG.quotaValueDefault; ui.policyEdits.investors.push({ name: "Novo cotista", investedAt: new Date().toISOString().slice(0, 10), investment: qv, quotaValue: qv, status: "pendente" }); draw(target, w); };
    target.querySelectorAll("[data-inv-del]").forEach(b => b.onclick = () => { const i = Number(b.dataset.invDel); if (confirm(`Remover ${ui.policyEdits.investors[i].name} da lista de cotistas?`)) { ui.policyEdits.investors.splice(i, 1); draw(target, w); } });
    if ($("#pmPolReset")) $("#pmPolReset").onclick = () => { ui.policyEdits = null; draw(target, w); };
    if ($("#pmPolSave")) $("#pmPolSave").onclick = () => run(target, w, "Política de cotas", async () => {
      await resyncMatrix(w);
      const current = w.loadNetworkDistribution();
      const investors = ui.policyEdits.investors.map(i => deriveInvestor(i, ui.policyEdits.quotaValue)).filter(i => String(i.name || "").trim() && Number(i.quotas) > 0 && i.eligibleFrom);
      const next = { ...current, ...ui.policyEdits, investors };
      const saved = w.saveNetworkDistribution(next);
      const fb = await awaitMatrixSave(w);
      if (Number(saved.quotaValue) !== Number(next.quotaValue) || Number(saved.taxRatePct || 0) !== Number(next.taxRatePct || 0)) throw new Error("A política não foi aceita pela plataforma original (valor da cota ou impostos).");
      ui.policyEdits = null;
      return fb || "política salva na nuvem";
    });
  }

  UBY.register("parametros", { render, _test: { centralTab, bankState } });
})();

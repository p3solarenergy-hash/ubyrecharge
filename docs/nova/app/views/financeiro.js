/* Financeiro e fechamento por competência — leitura das mesmas regras de financeiro.html. */
(function () {
  "use strict";
  const { fmt, esc, kpi, mini } = UBY;
  const TABS = [["resultado", "Resultado"], ["estacao", "Por estação"], ["destinos", "Destinos do resultado"], ["dre", "DRE e fechamento"], ["matriz", "Custos centrais e rateio"],
    ["caixa", "Caixa e documentos"], ["investidores", "Investidores"], ["fechamentos", "Fechamentos arquivados"]];
  const docsCache = new Map();
  const ui = { station: "", reportsFilter: "all" };
  let reports = null, reportsKey = "";

  const paybackShort = m => !m || !Number.isFinite(m) ? "—" : m < 12 ? `${UBY.fmt.n1(m)} meses` : `${UBY.fmt.n1(m / 12)} anos`;
  const paybackLabel = m => !m || !Number.isFinite(m) ? "—" : m < 12 ? `${UBY.fmt.n1(m)} meses` : `${UBY.fmt.n1(m / 12)} anos (${Math.round(m)} meses)`;

  // ---------- Por estação ----------
  function estacao(mk) {
    const all = UBY.data("financeStations");
    const list = [...all.filter(s => UBY.isUbyModel(s.model)), ...all.filter(s => !UBY.isUbyModel(s.model))];
    if (!list.some(s => `${s.workId}|${s.station}` === ui.station)) ui.station = list[0] ? `${list[0].workId}|${list[0].station}` : "";
    const [workId, station] = ui.station.split("|");
    const s = UBY.data("stationFinance", workId, station, mk || UBY.state.months.at(-1));
    if (!s || !s.finance) return `<section class="section"><div class="note">Sem dados financeiros para esta estação no período.</div></section>`;
    const f = s.finance, st = s.settings;
    const partner = f.model === "third_party_management";
    const line = (label, value, note = "", cls = "") => `<tr class="${cls}"><td>${label}${note ? `<small>${esc(note)}</small>` : ""}</td><td class="num">${value}</td></tr>`;
    const pct = v => f.totalRevenue > 0 ? `<small>${fmt.pct1(v / f.totalRevenue * 100)} do faturamento</small>` : "";
    return `
      <div class="toolbar"><label>Estação <select class="select" id="finStation">
          <optgroup label="Ativos UBY">${list.filter(x => UBY.isUbyModel(x.model)).map(x => `<option value="${esc(`${x.workId}|${x.station}`)}" ${`${x.workId}|${x.station}` === ui.station ? "selected" : ""}>${esc(x.station)}${x.model === "third_party_management" ? " (parceiro)" : ""}</option>`).join("")}</optgroup>
          <optgroup label="Fora da UBY · só gestão P3">${list.filter(x => !UBY.isUbyModel(x.model)).map(x => `<option value="${esc(`${x.workId}|${x.station}`)}" ${`${x.workId}|${x.station}` === ui.station ? "selected" : ""}>${esc(x.station)}</option>`).join("")}</optgroup>
        </select></label>
        <span class="badge ${UBY.isUbyModel(f.model) ? (partner ? "partner" : "ok") : "neutral"}">${esc(UBY.modelLabel(f.model))}</span><span class="spacer"></span>
        <a class="btn primary link-btn" href="#/importar/${encodeURIComponent(workId)}/${mk || UBY.state.months.at(-1) || new Date().toISOString().slice(0, 7)}/${encodeURIComponent("#/financeiro/estacao")}/${encodeURIComponent(station)}">⇪ Importar planilha desta estação</a>
        <a class="btn link-btn" href="https://p3solarenergy-hash.github.io/ubyrecharge/obra-ev/recargas.html?obra=${encodeURIComponent(workId)}&openReport=financeiro&station=${encodeURIComponent(station)}" target="_blank" rel="noopener">Editar valores (publicada) ↗</a></div>

      <section class="section"><div class="section-head"><div><p class="kicker">${esc(s.label)} · ${esc(s.workName)}</p><h2>${esc(s.station)}</h2><p>Cálculo financeiro do carregador na competência. Custos da matriz entram já rateados.</p></div>
          <div class="meta">Gestão ${fmt.pct1(st.managementPct)} · plataforma ${fmt.pct1(st.platformPct)} · tributos ${fmt.pct1(st.taxRatePct)}${st.ubyRoyaltyPct ? ` · royalty ${fmt.pct1(st.ubyRoyaltyPct)}` : ""}<br>energia ${fmt.brl(f.energyRate)}/kWh · investimento ${fmt.brl(st.investmentValue)}</div></div>
        <div class="grid g6">
          ${kpi("Faturamento", fmt.brl(f.revenue), `total ${fmt.brl(f.totalRevenue)} · ${fmt.kwh0(f.energy)}`, "", "lead big")}
          ${kpi("Custo total", fmt.brl(f.totalOperatingCost), `${perKwh(f.totalCostPerKWh)} efetivo`)}
          ${kpi(partner ? "Resultado do parceiro" : "Resultado operacional", signed(f.operationNet), `margem ${fmt.pct(f.operationMargin)}`, "", f.operationNet >= 0 ? "" : "bad")}
          ${kpi("Ponto de equilíbrio", f.breakEvenKWh ? fmt.kwh(f.breakEvenKWh) : "—", `contribuição ${perKwh(f.contributionPerKWh)}`)}
          ${kpi("Payback", paybackShort(f.paybackMonths), `${f.paybackMonths ? `${Math.round(f.paybackMonths)} meses · ` : ""}retorno ${fmt.pct(f.roiMonthly)} ao mês`)}
          ${kpi(partner ? "Royalty UBY" : "Resultado UBY", fmt.brl(partner ? f.ubyRoyalty : f.ubyNet), partner ? "única receita da UBY neste ativo" : `investidores ${fmt.brl(f.investorDistribution)}`)}
        </div>
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section" style="padding:0;overflow:hidden"><div class="table-wrap" style="border:0;border-radius:0"><table><tbody>
          <tr><th colspan="2" style="position:static">Receitas</th></tr>
          ${line("Recargas (plataforma)", fmt.brl(f.revenue))}
          ${f.extraRevenue ? line("Receitas operacionais complementares", fmt.brl(f.extraRevenue)) : ""}
          ${f.marketingRevenue ? line("Marketing e contratos (só no fechamento)", fmt.brl(f.marketingRevenue)) : ""}
          ${s.revenueLines.map(r => line(`· ${esc(r.label)}`, fmt.brl(r.actual), r.rule)).join("")}
          </tbody><tfoot><tr><td>Faturamento total</td><td class="num">${fmt.brl(f.totalRevenue)}</td></tr></tfoot><tbody>
          <tr><th colspan="2" style="position:static">Custos</th></tr>
          ${line("Energia elétrica comercial", `${fmt.brl(f.energyCost)}${pct(f.energyCost)}`, `${fmt.brl(f.energyRate)}/kWh sobre ${fmt.kwh(f.commercialEnergy)} comercialmente elegíveis`)}
          ${s.costLines.map(c => line(c.matrix ? `Matriz · ${esc(c.label)}` : esc(c.label), `${fmt.brl(c.actual)}${pct(c.actual)}`, [c.rule, c.perKWh != null ? `${perKwh(c.perKWh)}` : ""].filter(Boolean).join(" · "))).join("")}
          ${line("Gestão P3", `${fmt.brl(f.management)}${pct(f.management)}`, "sobre o faturamento total")}
          ${line("App / plataforma", `${fmt.brl(f.platform)}${pct(f.platform)}`, "só sobre recargas e ociosidade")}
          ${f.ubyRoyalty ? line("Royalty UBY", `${fmt.brl(f.ubyRoyalty)}${pct(f.ubyRoyalty)}`, "uso da marca") : ""}
          ${line("Repasse da área", `${fmt.brl(f.areaParticipation)}${pct(f.areaParticipation)}`, f.areaSharePct ? `${fmt.pct1(f.areaSharePct)} do faturamento total` : "")}
          </tbody><tfoot><tr><td>Custo total</td><td class="num">${fmt.brl(f.totalOperatingCost)}</td></tr><tr><td>= ${partner ? "Resultado do parceiro" : "Resultado operacional"}</td><td class="num">${signed(f.operationNet)}</td></tr></tfoot>
        </table></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Economia da unidade</p><h2>Por kWh</h2></div></div>
          <div class="grid g2">
            ${mini("Preço médio vendido", perKwh(f.energy ? f.revenue / f.energy : null), "referência de venda")}
            ${mini("Custo efetivo real", perKwh(f.totalCostPerKWh), "custo total ÷ energia comercial")}
            ${mini("Custo direto", perKwh(f.directCostPerKWh), "energia, unidade, matriz, tributos, área")}
            ${mini("Custo total projetado", perKwh(f.plannedTotalCostPerKWh), s.planning ? `sobre ${fmt.kwh0(s.planning.planningKWh)} planejados` : "")}
            ${mini("Resultado por kWh", perKwh(f.resultPerKWh), "resultado ÷ energia vendida")}
            ${mini("Custo variável", perKwh(f.variableCostPerKWh), "por kWh adicional")}
          </div>
          ${f.courtesyCharges ? `<div class="note" style="margin-top:10px">Cortesia: ${fmt.kwh(f.courtesyEnergy)} em ${f.courtesyCharges} sessão(ões); ${fmt.brl(f.courtesyCostExcluded)} fora do resultado UBY.</div>` : ""}
          ${!partner ? `<h3 style="margin:14px 0 8px">Destino do resultado</h3><div class="list">
            <div class="list-row"><span>Retenção S.A.</span><strong>${fmt.brl(f.saRetention)}</strong></div>
            <div class="list-row"><span>Investidores (cotas)</span><strong>${fmt.brl(f.investorDistribution)}</strong></div>
            <div class="list-row"><span>UBY retido</span><strong>${fmt.brl(f.ubyRetained)}</strong></div>
            ${f.p3SocietyProfit ? `<div class="list-row"><span>Sociedade P3</span><strong>${fmt.brl(f.p3SocietyProfit)}</strong></div>` : ""}</div>` : ""}
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Histórico</p><h2>Mês a mês</h2><p>Cada competência com as configurações e custos vigentes naquele mês.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Faturamento</th><th class="num">Energia (custo)</th><th class="num">Matriz</th><th class="num">Gestão</th><th class="num">Plataforma</th><th class="num">Área</th><th class="num">Custo total</th><th class="num">Custo/kWh</th><th class="num">Resultado</th><th class="num">Margem</th><th class="num">Payback</th></tr></thead>
          <tbody>${s.monthly.slice().reverse().map(m => `<tr${m.key === s.monthKey ? ' style="background:var(--uby-green-soft)"' : ""}><td><strong>${esc(m.label)}</strong></td><td class="num">${fmt.brl(m.revenue)}</td><td class="num">${fmt.brl(m.energyCost)}</td><td class="num">${fmt.brl(m.matrizCost)}</td>
            <td class="num">${fmt.brl(m.management)}</td><td class="num">${fmt.brl(m.platform)}</td><td class="num">${fmt.brl(m.areaParticipation)}</td><td class="num">${fmt.brl(m.totalOperatingCost)}</td><td class="num">${perKwh(m.totalCostPerKWh)}</td>
            <td class="num"><strong>${signed(m.operationNet)}</strong></td><td class="num">${fmt.pct1(m.operationMargin)}</td><td class="num">${paybackLabel(m.paybackMonths)}</td></tr>`).join("")}</tbody></table></div>
        <div class="chart-box sm" style="margin-top:12px"><canvas id="chStationFin"></canvas></div>
      </section>`;
  }

  // ---------- Destinos ----------
  function destinos() {
    const d = UBY.data("destinations"), t = d.total, u = d.uby;
    const ubyUnits = d.units.filter(x => x.ubyAsset), outside = d.units.filter(x => !x.ubyAsset);
    const outsideIds = new Set(outside.map(x => String(x.workId)));
    const onlyUby = items => items.filter(i => !outsideIds.has(String(i.workId)));
    const onlyOutside = items => items.filter(i => outsideIds.has(String(i.workId)));
    const sum = items => items.reduce((s, i) => s + i.value, 0);
    const group = (title, cls, items, caption, empty) => `<article class="panel ${cls}"><div class="panel-head"><div><h2>${title}</h2><p>${caption}</p></div></div>
      <p style="margin:0 0 8px;font-size:22px;font-weight:850;color:var(--uby-forest)">${fmt.brl(sum(items))}</p>
      <div class="list">${items.slice().sort((a, b) => b.value - a.value).map(i => `<div class="list-row"><span>${esc(i.workName)}<small style="display:block;color:var(--uby-muted)">${esc(UBY.modelLabel(i.model))}</small></span><strong>${fmt.brl(i.value)}</strong></div>`).join("") || `<div class="note">${empty}</div>`}</div></article>`;
    const unitRows = list => list.map(x => `<tr><td><strong>${esc(x.workName)}</strong><small>${x.months} competência(s)</small></td><td>${esc(UBY.modelLabel(x.model))}</td><td class="num">${fmt.brl(x.revenue)}</td><td class="num">${fmt.brl(x.totalOperatingCost)}</td>
      <td>${signed(x.outcome)}<small>${esc(x.outcomeLabel)} → ${esc(x.destination)}</small></td><td class="num">${fmt.pct1(x.margin)}</td><td class="num">${x.investmentValue ? fmt.brl(x.investmentValue) : "—"}</td>
      <td class="num">${paybackLabel(x.paybackMonths)}</td><td class="num">${x.roiMonthly ? fmt.pct(x.roiMonthly) : "—"}</td></tr>`).join("");
    const unitHead = `<thead><tr><th>Unidade</th><th>Modelo</th><th class="num">Faturamento</th><th class="num">Custo total</th><th>Resultado</th><th class="num">Margem</th><th class="num">Investimento</th><th class="num">Payback</th><th class="num">Retorno/mês</th></tr></thead>`;
    const p3Uby = onlyUby(d.groups.p3);
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Ativos da UBY · acumulado</p><h2>Para onde vai o resultado da UBY</h2><p>Ativos próprios distribuem por cotas; parceiros com a marca geram royalty. A P3 aparece como prestadora de serviço (gestão), depois da UBY.</p></div>
          <div class="meta">${u.units} ativo(s) UBY · investimento ${fmt.brl(u.investmentValue)}</div></div>
        <div class="grid g5">
          ${kpi("Resultado UBY e royalties", signed(u.ubyNet), `royalties ${fmt.brl(u.ubyRoyalty)}`, "", "lead big")}
          ${kpi("Investidores UBY", fmt.brl(u.investorDistribution), "repasse por cotas")}
          ${kpi("Retenção S.A.", fmt.brl(u.saRetention), `UBY retido ${fmt.brl(u.ubyRetained)}`)}
          ${kpi("Payback dos ativos UBY", paybackShort(u.paybackMonths), `${u.paybackMonths ? `${Math.round(u.paybackMonths)} meses · ` : ""}retorno ${fmt.pct(u.roiMonthly)} ao mês`)}
          ${kpi("Faturamento dos ativos UBY", fmt.brl(u.revenue), `custo total ${fmt.brl(u.totalOperatingCost)}`)}
        </div>
      </section>
      <div class="grid g3" style="gap:14px;margin-bottom:18px">
        ${group("UBY", "dc", d.groups.uby, "Resultado dos ativos UBY e royalties de marca, antes da distribuição.", "Nenhuma unidade.")}
        ${group("Investidores UBY", "ac", d.groups.investors, "Distribuição por cotas dos ativos UBY, após a retenção.", "Nenhuma distribuição.")}
        ${group("P3 · gestão dos ativos UBY", "consolidated", p3Uby, "Prestação de serviço: gestão cobrada dos ativos UBY e de parceiros com a marca.", "Nenhuma gestão.")}
      </div>
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Por ativo UBY · acumulado</p><h2>Retorno de cada ativo</h2></div></div>
          <div class="table-wrap"><table>${unitHead}<tbody>${unitRows(ubyUnits)}</tbody></table></div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Por competência</p><h2>Royalties UBY e gestão P3</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Royalty UBY</th><th class="num">Gestão P3</th><th class="num">Sociedade P3</th></tr></thead>
            <tbody>${d.management.map(m => `<tr><td><strong>${esc(m.label)}</strong></td><td class="num">${fmt.brl(m.ubyRoyalty)}</td><td class="num">${fmt.brl(m.management)}</td><td class="num">${fmt.brl(m.p3SocietyProfit)}</td></tr>`).join("")}</tbody></table></div>
          <div class="list" style="margin-top:12px">
            <div class="list-row"><span>Plataforma de terceiros (ativos UBY)</span><strong>${fmt.brl(u.platform)}</strong></div>
            <div class="list-row"><span>Participação dos parceiros de área (ativos UBY)</span><strong>${fmt.brl(u.areaParticipation)}</strong></div>
            <div class="list-row"><span>Gestão P3 cobrada dos ativos UBY</span><strong>${fmt.brl(u.management)}</strong></div>
            ${t.courtesyEnergy ? `<div class="list-row"><span>Cortesia de parceiros</span><strong>${fmt.kwh(t.courtesyEnergy)} · ${fmt.brl(t.courtesyCostExcluded)}</strong></div>` : ""}
          </div>
          <p class="source-line">A tabela por competência soma todas as unidades com base, inclusive as só com gestão.</p>
        </section>
      </div>
      ${outside.length ? `<details class="section"><summary style="cursor:pointer;font-weight:850;color:var(--uby-forest)">Fora da UBY: ${outside.length} unidade(s) só com gestão ou sociedade P3 (${esc(outside.map(x => x.workName).join(", "))})</summary>
        <p style="margin:10px 0">Estes carregadores não são ativos da UBY: não entram no resultado nem na distribuição da UBY. Ficam aqui para conferência da gestão prestada.</p>
        <div class="grid g3" style="gap:14px;margin-bottom:12px">
          ${kpi("Gestão P3 nestas unidades", fmt.brl(sum(onlyOutside(d.groups.p3))), "prestação de serviço")}
          ${kpi("Repasse aos parceiros", fmt.brl(sum(d.groups.partners)), "lucro dos donos dos ativos")}
          ${kpi("Rede completa (todas as unidades)", fmt.brl(t.revenue), `P3 total ${fmt.brl(t.p3Gross)} · payback geral ${paybackShort(t.paybackMonths)}`)}
        </div>
        <div class="table-wrap"><table>${unitHead}<tbody>${unitRows(outside)}</tbody></table></div>
      </details>` : ""}`;
  }

  // ---------- Fechamentos ----------
  function fechamentos(target) {
    const key = UBY.state.status.loadedAt;
    if (reportsKey !== key) {
      reportsKey = key; reports = null;
      UBY.state.api.financeReports().then(r => { reports = r; }).catch(err => { reports = { error: err.message }; })
        .finally(() => { if (location.hash.startsWith("#/financeiro/fechamentos")) render(target, ["fechamentos"]); });
    }
    if (!reports) return `<section class="section"><div class="loading" style="min-height:180px"><div class="spinner"></div><p>Lendo obra_finance_reports…</p></div></section>`;
    if (reports.error) return `<section class="section"><div class="note">Não foi possível ler os fechamentos: ${esc(reports.error)}</div></section>`;
    const typeLabel = t => ({ charger_financial: "Financeiro do carregador", uby_partner: "Prestação de contas parceiro", uby_investor: "Relatório de investidores", network_unified: "Relatório unificado da rede" }[t] || t);
    // Fechamentos de carregadores só com gestão P3 ficam ocultos por padrão.
    const modelByWork = new Map(UBY.data("financeStations").map(s => [String(s.workId), s.model]));
    const isOutside = r => modelByWork.has(String(r.workId)) && !UBY.isUbyModel(modelByWork.get(String(r.workId)));
    const cloud = reports.filter(r => !r.local);
    const outsideCount = cloud.filter(isOutside).length;
    const official = ui.includeOutside ? cloud : cloud.filter(r => !isOutside(r));
    const localOnly = reports.length - cloud.length;
    const list = official.filter(r => ui.reportsFilter === "all" || r.status === ui.reportsFilter)
      .sort((a, b) => String(b.periodKey).localeCompare(String(a.periodKey)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const closed = official.filter(r => r.status === "closed").length;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Arquivo · obra_finance_reports</p><h2>Relatórios e fechamentos por competência</h2><p>Versões preservadas: um fechamento arquivado não é recalculado quando a configuração muda depois.</p></div>
          <div class="seg" id="repFilter">${[["all", `Todos (${official.length})`], ["closed", `Fechados (${closed})`], ["partial", `Parciais (${official.length - closed})`]].map(([v, l]) => `<button data-v="${v}" class="${ui.reportsFilter === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        ${outsideCount ? `<label style="display:flex;align-items:center;gap:6px;margin:0 0 10px;font-size:11.5px;color:var(--uby-muted)"><input type="checkbox" id="repOutside" ${ui.includeOutside ? "checked" : ""}> Incluir ${outsideCount} fechamento(s) de carregadores só com gestão P3 (fora da UBY)</label>` : ""}
        ${localOnly ? `<div class="note" style="margin-bottom:10px">${localOnly} rascunho(s) existem só neste navegador (criados ao abrir o relatório original nesta versão local, que não grava na base). Eles não aparecem aqui por não serem fechamentos oficiais.</div>` : ""}
        <div class="table-wrap" style="max-height:640px"><table><thead><tr><th>Competência</th><th>Estação / relatório</th><th>Tipo</th><th>Período</th><th class="num">Faturamento</th><th class="num">Resultado</th><th>Situação</th><th>Gerado</th></tr></thead>
          <tbody>${list.map(r => `<tr><td><strong>${esc(UBY.state.api.monthName(r.periodKey) || r.periodKey)}</strong></td><td>${esc(r.stationName || r.workId)}</td><td>${esc(typeLabel(r.reportType))}</td>
            <td>${r.periodStart ? fmt.date(r.periodStart + "T12:00:00") : "—"} a ${r.periodEnd ? fmt.date(r.periodEnd + "T12:00:00") : "—"}</td>
            <td class="num">${r.summary.revenue ? fmt.brl(r.summary.revenue) : "—"}</td><td class="num">${r.summary.revenue || r.summary.result ? signed(r.summary.result) : "—"}</td>
            <td><span class="badge ${r.status === "closed" ? "ok" : "warn"}">${r.status === "closed" ? "fechado" : "parcial"}</span>${r.version > 1 ? ` <small>v${r.version}</small>` : ""}</td>
            <td>${fmt.dt(r.closedAt || r.updatedAt || r.generatedAt)}<small>${esc(r.by)}</small></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum relatório.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  const perKwh = v => v == null || !Number.isFinite(v) ? "—" : `${fmt.brl(v)}/kWh`;
  const signed = v => `<span style="color:${v >= 0 ? "var(--uby-green)" : "var(--uby-red)"}">${fmt.brl(v)}</span>`;

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }

  function head(f, tab) {
    return `
      <div class="hero"><div><p class="eyebrow">Gestão e governança · ${esc(f.period.label)}</p><h1>Financeiro e fechamento</h1>
        <p class="lead">Resultado dos ativos UBY, DRE por competência, custos centrais com rateio, agenda de caixa e distribuição aos cotistas. Parceiros ficam fora da matriz: entram só os royalties.</p></div>
        <div class="callout"><strong>Leitura das regras da plataforma</strong><small>Mesmo motor de financeiro.html. Para editar custos, marcar pagamentos ou salvar a política da rodada, use <a href="#/financeiro-edicao">Financeiro · edição (clássico)</a>.</small></div></div>
      <div class="toolbar"><div class="seg" id="finTabs">${TABS.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? "on" : ""}">${label}</button>`).join("")}</div></div>`;
  }

  // ---------- Resultado ----------
  function resultado(f) {
    const t = f.total, d = f.distribution;
    const compTotal = f.composition.reduce((s, c) => s + c.value, 0);
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Ativos UBY</p><h2>Resultado da operação</h2><p>Parceiros com royalty não entram nestes custos nem no resultado.</p></div><div class="meta">${f.rows.length} carregador(es) no fechamento</div></div>
        <div class="grid g6">
          ${kpi("Faturamento recargas", fmt.brl(t.revenue), `total com complementares ${fmt.brl(t.totalRevenue)}`, "", "lead big")}
          ${kpi(`Custos operacionais${t.matrizCost > 0 ? " (inclui matriz)" : ""}`, fmt.brl(t.totalOperatingCost), "energia, gestão, plataforma, área, tributos")}
          ${kpi("Custos da matriz rateados", fmt.brl(t.matrizCost), "custos compartilhados atribuídos")}
          ${kpi("Custo efetivo por kWh", perKwh(t.totalCostPerKWh), t.plannedCostPerKWh ? `planejado ${perKwh(t.plannedCostPerKWh)}` : "custos ÷ energia comercial")}
          ${kpi("Royalties de parceiros", fmt.brl(t.partnerRoyalty), `${t.partnerCount} unidade(s) fora da matriz`)}
          ${kpi(`Resultado ativos UBY · ${fmt.pct1(t.margin)}`, signed(t.operationNet), "antes da distribuição", "", t.operationNet >= 0 ? "" : "bad")}
        </div>
        ${t.courtesyCharges ? `<div class="note" style="margin-top:10px">Cortesia de parceiros: ${fmt.kwh(t.courtesyEnergy)} em ${fmt.int(t.courtesyCharges)} sessão(ões). ${fmt.brl(t.courtesyCostExcluded)} ficam fora do resultado UBY.</div>` : ""}
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Evolução</p><h2>Receita, custos e resultado por mês</h2><p>Sempre todos os meses, independentemente do período selecionado.</p></div></div><div class="chart-box"><canvas id="chFinMonthly"></canvas></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Composição</p><h2>De onde vêm os custos</h2></div></div>
          <div class="list">${f.composition.map((c, i) => `<div class="list-row" style="display:grid;grid-template-columns:1fr auto;gap:4px"><span><strong style="color:var(--uby-ink)">${esc(c.label)}</strong><small style="display:block;color:var(--uby-muted)">${esc(c.detail)}</small></span><strong>${fmt.brl(c.value)}</strong>
            <div class="bar" style="grid-column:1/-1"><span style="width:${compTotal ? c.value / compTotal * 100 : 0}%;background:${UBY.PALETTE[i]}"></span></div></div>`).join("")}</div>
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Distribuição UBY</p><h2>Como o resultado UBY se divide</h2><p>${d.hasProfit ? "Retenção estatutária e repasse aos investidores por cotas, já com a matriz descontada." : "Sem destinação enquanto o resultado consolidado for prejuízo."}</p></div></div>
        <div class="grid g4">
          ${kpi("Resultado UBY", signed(d.ubyNet), "após custos e matriz", "", "lead")}
          ${kpi("Retenção S.A.", fmt.brl(d.saRetention), d.hasProfit ? "retenção estatutária" : "R$ 0,00 com prejuízo")}
          ${kpi(`Investidores (${fmt.pct1(d.quotaPct)})`, fmt.brl(d.investors), d.hasProfit ? "repasse por cotas" : "sem distribuição com prejuízo")}
          ${kpi("UBY retido", fmt.brl(d.retained), "fica na UBY")}
        </div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Por carregador</p><h2>Resultado por ativo</h2><p>Parceiros aparecem com o royalty UBY como única receita da marca.</p></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Carregador</th><th>Modelo</th><th class="num">Faturamento</th><th class="num">Energia (custo)</th><th class="num">Gestão P3</th><th class="num">Plataforma</th><th class="num">Área</th><th class="num">Tributos</th><th class="num">Matriz</th><th class="num">Custo/kWh</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead>
          <tbody>${f.rows.map(r => `<tr class="clickable" data-unit="${esc(r.workId)}" data-station="${esc(r.station)}">
            <td><strong>${esc(r.station)}</strong><small>${esc(r.workName)} · ${r.months} competência(s)</small></td>
            <td><span class="badge ${r.partner ? "partner" : r.kind}">${esc(UBY.modelLabel(r.model))}</span></td>
            <td class="num">${fmt.brl(r.revenue)}</td>
            ${r.partner ? `<td class="num">—</td><td class="num">${fmt.brl(r.management)}</td><td class="num">—</td><td class="num">—</td><td class="num">${fmt.brl(r.taxes)}</td><td class="num">—</td><td class="num">—</td><td class="num"><strong>${fmt.brl(r.ubyRoyalty)}</strong><small>royalty UBY</small></td><td class="num">—</td>`
              : `<td class="num">${fmt.brl(r.energyCost)}</td><td class="num">${fmt.brl(r.management)}</td><td class="num">${fmt.brl(r.platform)}</td><td class="num">${fmt.brl(r.areaParticipation)}</td><td class="num">${fmt.brl(r.taxes)}</td><td class="num">${fmt.brl(r.matrizCost)}</td><td class="num">${perKwh(r.totalCostPerKWh)}</td><td class="num"><strong>${signed(r.operationNet)}</strong></td><td class="num">${fmt.pct1(r.operationMargin)}</td>`}
          </tr>`).join("") || `<tr><td colspan="12" class="empty">Nenhum carregador UBY no período.</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  // ---------- DRE ----------
  function dre(f) {
    const d = f.dre, p = d.policy;
    const share = v => d.networkRevenue > 0 ? `<small>${fmt.pct1(v / d.networkRevenue * 100)} do faturamento</small>` : "";
    const line = (label, value, detail = "", cls = "") => `<tr class="${cls}"><td>${label}${detail ? `<small>${esc(detail)}</small>` : ""}</td><td class="num">${fmt.brl(value)}</td></tr>`;
    const cost = (label, value, detail) => `<tr><td>${label}<small>${esc(detail)}</small></td><td class="num">${fmt.brl(value)}${share(value)}</td></tr>`;
    const group = label => `<tr><th colspan="2" style="position:static">${label}</th></tr>`;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Fechamento por competência</p><h2>DRE consolidada da rede UBY</h2><p>${esc(f.period.label)}. Só ativos UBY; royalties entram como receita da marca e marketing só no fechamento, sem alterar as métricas de recarga.</p></div>
          <div class="meta">Prévia gerencial<br>${d.ownedCount} ativo(s) UBY · ${d.partnerCount} parceiro(s)</div></div>
        <div class="grid g4" style="margin-bottom:12px">
          ${kpi("Faturamento por competência", fmt.brl(d.networkRevenue), "recargas, complementares e marketing", "", "lead big")}
          ${kpi("Resultado da DRE", signed(d.networkResult), "antes da distribuição aos cotistas", "", d.networkResult >= 0 ? "" : "bad")}
          ${kpi("Margem de resultado", fmt.pct(d.margin), "resultado ÷ faturamento")}
          ${kpi("Energia reconhecida", fmt.brl(d.energyCost), "custo direto da operação", "", "warn")}
        </div>
        <div class="grid g3">
          ${kpi("Rateio central", fmt.brl(d.matrizCost), "custos corporativos atribuídos aos pontos")}
          ${kpi("Reservas e expansão", fmt.brl(d.reserve), `legal ${fmt.pct1(p.legalReservePct)} · expansão ${fmt.pct1(p.expansionReservePct)}`)}
          ${kpi("Pool dos cotistas", fmt.brl(d.investorPool), `${fmt.pct1(p.investorPct)} após reservas · ${d.soldQuotas} cotas · ${fmt.brl(d.perQuota)}/cota`)}
        </div>
      </section>
      <div class="split" style="margin-bottom:18px">
        <section class="section" style="padding:0;overflow:hidden"><div class="table-wrap" style="border:0;border-radius:0"><table><tbody>
          ${group("Receitas da rede")}
          ${line("Faturamento de recargas dos ativos UBY", d.rechargeRevenue)}
          ${line("Receitas operacionais complementares", d.extraRevenue)}
          ${line("Royalties de parceiros (fora da matriz operacional)", d.royalties)}
          ${line("Marketing e contratos reconhecidos no fechamento", d.marketing)}
          </tbody><tfoot><tr><td>Faturamento total (base gestão P3 e área)</td><td class="num">${fmt.brl(d.networkRevenue)}</td></tr></tfoot><tbody>
          ${group("Custos reconhecidos na rede")}
          ${cost("Energia", d.energyCost, "Fatura de energia vinculada às recargas dos ativos UBY.")}
          ${cost("Operação direta por ativo", d.directOperation, "Despesas próprias dos carregadores, sem tributos e sem rateio da matriz.")}
          ${cost("Tributos atribuíveis aos carregadores", d.taxes, "Impostos cadastrados na unidade.")}
          ${cost("Tributos corporativos centralizados", d.matrizTaxCost, "Impostos da matriz, distribuídos entre os destinos do rateio.")}
          ${cost("Demais custos centralizados da matriz", d.otherMatriz, "Seguro, aluguel, sistemas e outros custos compartilhados.")}
          ${cost("Gestão P3", d.management, "Percentual sobre o faturamento total conforme contrato.")}
          ${cost("App / plataforma", d.platform, "Somente sobre recargas e ociosidade; não incide sobre marketing ou royalties.")}
          ${cost("Participação de área", d.areaParticipation, "Repasse ao parceiro da área sobre o faturamento total.")}
          </tbody><tfoot><tr><td>Resultado operacional dos ativos UBY</td><td class="num">${fmt.brl(d.operationalResult)}</td></tr></tfoot><tbody>
          ${group("Resultado final da rede")}
          ${line("Resultado operacional UBY", d.operationalResult)}
          ${line("+ Royalties UBY", d.royalties)}
          </tbody><tfoot><tr><td>= Resultado consolidado antes da distribuição</td><td class="num">${signed(d.networkResult)}</td></tr></tfoot>
        </table></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Política da rodada</p><h2>${esc(p.roundLabel || "Rodada")}</h2><p>Parâmetros salvos na plataforma. Edição no modo clássico.</p></div></div>
          <div class="grid g2">
            ${mini("Cotas emitidas", fmt.int(p.totalQuotas))}${mini("Cotas vendidas", fmt.int(p.soldQuotas))}
            ${mini("% cotistas", fmt.pct1(p.investorPct))}${mini("% reserva legal S.A.", fmt.pct1(p.legalReservePct))}
            ${mini("% fundo expansão", fmt.pct1(p.expansionReservePct))}${mini("Valor por cota", fmt.brl(d.perQuota), "no período")}
          </div>
          <div class="note" style="margin-top:12px">Prévia gerencial: confirme documentos, impostos e aprovação do fechamento antes de pagar ou contabilizar distribuição.</div>
        </section>
      </div>`;
  }

  // ---------- Matriz ----------
  function matriz(m) {
    const s = m.summary;
    const max = Math.max(1, ...m.series.map(x => x.competency));
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Central de custos</p><h2>Compromissos da matriz · ${esc(m.label)}</h2><p>Custos compartilhados, rateados só entre os destinos definidos. A atribuição fica separada da eficiência do carregador.</p></div><div class="meta">Destinos: ${esc(m.destinations.join(" · ") || "nenhum")}</div></div>
        <div class="grid g5">
          ${kpi("Compromissos ativos", fmt.int(s.active), "nesta competência", "", "lead")}
          ${kpi("Custo central", fmt.brl(s.planned), "reconhecido no mês")}
          ${kpi("Rateado aos pontos", fmt.brl(s.allocated), "com destino definido")}
          ${kpi("Tributos centralizados", fmt.brl(s.centralTaxes), "incluídos na matriz")}
          ${kpi("Pendente de destino", fmt.brl(s.pending), s.pending > 0.009 ? "revise o rateio" : "rateio completo", "", s.pending > 0.009 ? "warn" : "")}
        </div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Cadastro</p><h2>Custos compartilhados</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Custo</th><th>Período</th><th>Rateio</th><th class="num">Competência</th><th class="num">Caixa</th><th class="num">Rateado</th></tr></thead>
          <tbody>${m.costs.map(c => `<tr class="${c.applies ? "" : "muted"}"><td><strong>${esc(c.name)}</strong><small>${esc([c.category, c.supplier, c.documentRef].filter(Boolean).join(" · "))}${c.enabled ? "" : " · desativado"}</small></td>
            <td>${esc(c.kindLabel)}<small>início ${esc(c.startMonth)} · venc. dia ${esc(c.dueDay)}</small></td>
            <td>${esc(c.method)}<small>${c.byUnit.length ? c.byUnit.map(u => `${esc(u.name)}: ${fmt.brl(u.amount)}`).join(" · ") : esc(c.targets.join(" · ") || "sem destino ativo")}</small></td>
            <td class="num">${c.applies ? fmt.brl(c.competency) : "fora da competência"}</td><td class="num">${c.applies ? fmt.brl(c.cash) : ""}</td><td class="num">${c.applies ? fmt.brl(c.allocated) : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum custo compartilhado cadastrado.</td></tr>`}</tbody>
          <tfoot><tr><td colspan="3">Programado em ${esc(m.label)}</td><td class="num">${fmt.brl(s.planned)}</td><td class="num"></td><td class="num">${fmt.brl(s.allocated)}</td></tr></tfoot></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">DRE mensal da matriz</p><h2>Competência, caixa e rateio</h2><p>A competência entra no resultado e no custo/kWh dos carregadores. O caixa mostra só as parcelas que vencem no mês e não altera o resultado contábil. Inclui 12 meses à frente.</p></div></div>
        <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Competência</th><th style="width:34%">Proporção</th><th class="num">Competência</th><th class="num">Caixa</th><th class="num">Rateado</th><th class="num">Pendente</th></tr></thead>
          <tbody>${m.series.map(x => `<tr${x.key === m.monthKey ? ' style="background:var(--uby-green-soft)"' : ""}><td><strong>${esc(x.label)}</strong></td><td><div class="bar"><span style="width:${x.competency / max * 100}%"></span></div></td>
            <td class="num">${fmt.brl(x.competency)}</td><td class="num">${fmt.brl(x.cash)}</td><td class="num">${fmt.brl(x.allocated)}</td><td class="num">${x.pending > 0.009 ? `<span class="badge warn">${fmt.brl(x.pending)}</span>` : "—"}</td></tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  // ---------- Caixa ----------
  function caixa(p, docs) {
    const t = p.totals;
    const badge = { paid: "ok", overdue: "bad", today: "warn", soon: "warn", pending: "neutral" };
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Calendário de caixa · ${esc(p.label)}</p><h2>Pagamentos programados por carregador</h2><p>Pagamentos recorrentes e parcelas da matriz com vencimento no mês. Marcar pago ou reabrir continua no modo de edição.</p></div></div>
        <div class="grid g4" style="margin-bottom:14px">
          ${kpi("Programado no mês", fmt.brl(t.total), `${p.list.length} compromisso(s)`, "", "lead")}
          ${kpi("Em aberto", fmt.brl(t.pending), "", "", t.pending ? "warn" : "")}
          ${kpi("Vencido", fmt.brl(t.overdue), "", "", t.overdue ? "bad" : "")}
          ${kpi("Pago", fmt.brl(t.paid))}
        </div>
        <div class="table-wrap"><table><thead><tr><th>Pagamento</th><th>Carregador / obra</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th></tr></thead>
          <tbody>${p.list.map(x => `<tr><td><strong>${esc(x.name)}</strong><small>${esc([x.source, x.category, x.supplier].filter(Boolean).join(" · "))}</small></td><td>${esc(x.station)}<small>${esc(x.workName)}</small></td>
            <td>${fmt.date(x.due)}<small>todo dia ${esc(x.dueDay)}</small></td><td class="num">${fmt.brl(x.amount)}</td><td><span class="badge ${badge[x.status] || "neutral"}">${esc(x.statusLabel)}</span>${x.paidAt ? `<small>em ${fmt.date(x.paidAt)}</small>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nenhum pagamento programado nesta competência.</td></tr>`}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Documentos</p><h2>Boletos e documentos da competência</h2><p>Metadados em uby_finance_documents; o arquivo privado só é baixado quando você pede.</p></div></div>
        ${docs === null ? `<div class="note">Carregando documentos…</div>` : docs.error ? `<div class="note">Não foi possível ler os documentos: ${esc(docs.error)}</div>` : `
        <div class="table-wrap"><table><thead><tr><th>Fornecedor</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th>Arquivo</th></tr></thead>
          <tbody>${docs.map(d => `<tr><td><strong>${esc(d.supplier || "Documento financeiro")}</strong><small>${esc([d.category, d.document_number, d.installment_number ? `parcela ${d.installment_number}${d.installment_total ? "/" + d.installment_total : ""}` : ""].filter(Boolean).join(" · "))}</small></td>
            <td>${d.due_date ? fmt.date(d.due_date + "T12:00:00") : "—"}</td><td class="num">${fmt.brl(d.amount)}</td><td><span class="badge ${d.status === "paid" ? "ok" : "warn"}">${d.status === "paid" ? "Pago" : "Pendente"}</span></td>
            <td>${d.storage_path ? `<button class="btn" data-doc="${esc(d.id)}">Abrir arquivo</button>` : '<small>sem arquivo</small>'}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nenhum documento nesta competência.</td></tr>`}</tbody></table></div>`}
      </section>`;
  }

  // ---------- Investidores ----------
  function investidores(inv) {
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Rodada 1 · apuração por competência</p><h2>Distribuição por período de aporte</h2><p>Cada mês é dividido só entre as cotas habilitadas no primeiro dia do mês, sem proporcionalidade retroativa.</p></div>
          <div class="meta">${inv.valid ? '<span class="badge ok">conferência fecha</span>' : '<span class="badge bad">conferência não fecha</span>'}<br>alocado ${fmt.brl(inv.totalAllocated)} · pool ${fmt.brl(inv.totalPool)}</div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Resultado</th><th class="num">Reserva legal S.A.</th><th class="num">Fundo expansão</th><th class="num">Pool cotistas</th><th class="num">Cotas habilitadas</th><th class="num">Por cota</th><th>Pagamento</th></tr></thead>
          <tbody>${inv.months.map(m => `<tr><td><strong>${esc(m.label)}</strong></td><td class="num">${signed(m.result)}</td><td class="num">${fmt.brl(m.legalReserve)}</td><td class="num">${fmt.brl(m.expansionReserve)}</td><td class="num">${fmt.brl(m.investorPool)}</td><td class="num">${m.eligibleQuotas}</td><td class="num">${fmt.brl(m.perQuota)}</td>
            <td><span class="badge ${m.status === "pago" || m.status === "paid" ? "ok" : m.status === "aprovado" ? "dc" : "neutral"}">${esc(m.status)}</span></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Sem competências apuradas.</td></tr>`}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Cotistas</p><h2>Apuração por cotista</h2><p>Cada cotista usa o valor da cota da própria rodada (padrão ${fmt.brl(inv.quotaValue || 80000)}); a distribuição por cota é igual para todas. Distribuição a partir de ${esc(UBY.state.api.monthName(inv.distributionStartMonth || "2026-06"))}. Payback indicativo pelo retorno anualizado.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Cotista</th><th class="num">Cotas</th><th class="num">Valor da cota</th><th class="num">Investido</th><th>Início</th>${inv.months.map(m => `<th class="num">${esc(m.label)}</th>`).join("")}<th class="num">Total devido</th><th class="num">Retorno acum.</th><th class="num">Payback</th><th>Situação</th></tr></thead>
          <tbody>${inv.investors.map(i => `<tr><td><strong>${esc(i.name)}</strong></td><td class="num">${i.quotas}</td><td class="num">${fmt.brl(i.quotaValue || inv.quotaValue || 80000)}</td><td class="num">${fmt.brl(i.investment)}</td><td>${esc(i.eligibleFrom ? UBY.state.api.monthName(i.eligibleFrom) : "—")}</td>${i.allocations.map(a => `<td class="num">${fmt.brl(a)}</td>`).join("")}
            <td class="num"><strong>${fmt.brl(i.due)}</strong></td><td class="num">${fmt.pct(i.returnRate * 100)}</td><td class="num">${i.paybackYears ? `${fmt.n1(i.paybackYears)} anos` : "—"}</td><td>${esc(i.status)}</td></tr>`).join("") || `<tr><td colspan="${9 + inv.months.length}" class="empty">Nenhum cotista cadastrado.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function render(target, params) {
    const tab = TABS.some(([id]) => id === params[0]) ? params[0] : "resultado";
    const mk = monthArg();
    const f = UBY.data("finance", mk);
    let body = "";
    if (tab === "resultado") body = resultado(f);
    else if (tab === "dre") body = dre(f);
    else if (tab === "matriz") body = matriz(UBY.data("matrix", mk || UBY.state.months.at(-1)));
    else if (tab === "caixa") {
      const cm = mk || UBY.state.months.at(-1);
      const key = `${cm}|${UBY.state.status.loadedAt}`;
      body = caixa(UBY.data("payments", cm), docsCache.has(key) ? docsCache.get(key) : null);
      if (!docsCache.has(key)) {
        docsCache.set(key, null);
        UBY.state.api.financeDocuments(cm).then(rows => docsCache.set(key, rows)).catch(err => docsCache.set(key, { error: err.message }))
          .finally(() => { if (location.hash.startsWith("#/financeiro/caixa") || location.hash === "#/financeiro") render(target, ["caixa"]); });
      }
    }
    else if (tab === "investidores") body = investidores(UBY.data("investorDistribution"));
    else if (tab === "estacao") body = estacao(mk);
    else if (tab === "destinos") body = destinos();
    else if (tab === "fechamentos") body = fechamentos(target);

    target.innerHTML = head(f, tab) + body;
    target.querySelectorAll("#finTabs button").forEach(b => b.onclick = () => UBY.go(`#/financeiro/${b.dataset.tab}`));
    target.querySelectorAll("tr[data-unit]").forEach(tr => tr.onclick = () => UBY.go(`#/unidades/${encodeURIComponent(tr.dataset.unit)}/${encodeURIComponent(tr.dataset.station)}`));
    target.querySelectorAll("[data-doc]").forEach(btn => btn.onclick = async () => {
      const win = window.open("", "_blank");
      try { const r = await UBY.state.api.openFinanceDocument(btn.dataset.doc); if (win) win.location.href = r.url; }
      catch (err) { if (win) win.close(); alert(err.message); }
    });

    const stSel = target.querySelector("#finStation"); if (stSel) stSel.onchange = e => { ui.station = e.target.value; render(target, ["estacao"]); };
    target.querySelectorAll("#repFilter button").forEach(b => b.onclick = () => { ui.reportsFilter = b.dataset.v; render(target, ["fechamentos"]); });
    const repOutside = target.querySelector("#repOutside"); if (repOutside) repOutside.onchange = e => { ui.includeOutside = e.target.checked; render(target, ["fechamentos"]); };
    if (tab === "estacao") {
      const [workId, station] = ui.station.split("|");
      const s = UBY.data("stationFinance", workId, station, mk || UBY.state.months.at(-1));
      if (s) UBY.chart("chStationFin", { type: "bar", data: { labels: s.monthly.map(x => x.label), datasets: [
        { label: "Faturamento", data: s.monthly.map(x => x.revenue), backgroundColor: "#187457", borderRadius: 4 },
        { label: "Custo total", data: s.monthly.map(x => x.totalOperatingCost), backgroundColor: "#b98527", borderRadius: 4 },
        { type: "line", label: "Resultado", data: s.monthly.map(x => x.operationNet), borderColor: "#173c30", backgroundColor: "#173c30", tension: .3 }
      ] }, options: UBY.baseChartOptions() });
    }
    if (tab === "resultado") {
      const m = f.monthly;
      UBY.chart("chFinMonthly", {
        type: "line",
        data: { labels: m.map(x => x.label), datasets: [
          { label: "Receita", data: m.map(x => x.revenue), borderColor: "#187457", backgroundColor: "rgba(24,116,87,.1)", fill: true, tension: .3 },
          { label: "Custos totais", data: m.map(x => x.cost), borderColor: "#b98527", backgroundColor: "#b98527", tension: .3 },
          { label: "Resultado UBY", data: m.map(x => x.result), borderColor: "#173c30", backgroundColor: "#173c30", borderDash: [5, 4], tension: .3 }
        ] },
        options: UBY.baseChartOptions()
      });
    }
  }

  UBY.register("financeiro", { render });
})();

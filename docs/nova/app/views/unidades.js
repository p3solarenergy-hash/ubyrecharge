/* Unidades e carregadores — lista de todas as estações e detalhe denso. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { filter: "uby", search: "", sessionFilter: "all" };
  const kindLabel = k => ({ dc: "DC", ac: "AC" }[k] || "—");
  const originOf = s => !s.included ? { cls: "neutral", label: "Fora da operação UBY" } : s.model === "third_party_management" ? { cls: "partner", label: "Parceiro" } : { cls: s.kind, label: `${kindLabel(s.kind)} próprio` };

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }

  function renderList(target) {
    const month = monthArg();
    const all = UBY.data("stations", month);
    const q = ui.search.trim().toLowerCase();
    const rows = all.filter(s => {
      if (ui.filter === "uby" && !s.included) return false;
      if (ui.filter === "dc" && !(s.included && s.kind === "dc" && s.model !== "third_party_management")) return false;
      if (ui.filter === "ac" && !(s.included && s.kind === "ac" && s.model !== "third_party_management")) return false;
      if (ui.filter === "partner" && !(s.included && s.model === "third_party_management")) return false;
      if (ui.filter === "out" && s.included) return false;
      return !q || `${s.station} ${s.workName}`.toLowerCase().includes(q);
    });
    const tot = rows.reduce((a, s) => ({ revenue: a.revenue + s.revenue, energy: a.energy + s.energy, sessions: a.sessions + s.sessions, failures: a.failures + s.failures }), { revenue: 0, energy: 0, sessions: 0, failures: 0 });
    const periodLabel = month ? UBY.state.api.monthName(month) : "Acumulado";

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas</p><h1>Unidades e carregadores</h1>
        <p class="lead">Todas as estações com base salva, inclusive as que ficam fora da operação UBY, com ocupação pela disponibilidade configurada de cada ponto.</p></div>
        <div class="callout"><strong>${esc(periodLabel)} · ${all.length} estação(ões)</strong><small>Ocupação = kWh ÷ (potência × horas disponíveis no período), a mesma regra do painel original.</small></div></div>

      <div class="toolbar">
        <div class="seg" id="unitFilter">${[["uby", "Operação UBY"], ["all", "Todas"], ["dc", "DC próprio"], ["ac", "AC próprio"], ["partner", "Parceiros"], ["out", "Fora da operação"]].map(([v, l]) => `<button data-v="${v}" class="${ui.filter === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span>
        <input class="search" id="unitSearch" placeholder="Buscar estação ou obra" value="${esc(ui.search)}">
      </div>

      <div class="grid g4" style="margin-bottom:16px">
        ${kpi("Faturamento", fmt.brl(tot.revenue), `${rows.length} estação(ões) no filtro`, "", "lead")}
        ${kpi("Recargas", fmt.int(tot.sessions), "todas as tentativas registradas")}
        ${kpi("Energia", fmt.kwh0(tot.energy), "", "", "warn")}
        ${kpi("Falhas", fmt.int(tot.failures), "com status de falha", "", tot.failures ? "bad" : "")}
      </div>

      <section class="section" style="padding:0;overflow:hidden">
        <div class="table-wrap" style="border:0;border-radius:0"><table>
          <thead><tr><th>Estação</th><th>Origem</th><th class="num">Faturamento</th><th class="num">Recargas</th><th class="num">Válidas</th><th class="num">Energia</th><th class="num">Clientes</th><th class="num">Ticket</th><th>Ocupação</th><th class="num">Disponib.</th><th class="num">Falhas</th><th>Última recarga</th></tr></thead>
          <tbody>${rows.map(s => { const o = originOf(s); return `<tr class="clickable" data-unit="${esc(s.workId)}" data-station="${esc(s.station)}">
            <td><strong>${esc(s.station)}</strong><small>${esc(s.workName)}${s.power ? ` · ${fmt.int(s.power)} kW` : ""}</small></td>
            <td><span class="badge ${o.cls}">${o.label}</span></td>
            <td class="num">${fmt.brl(s.revenue)}</td><td class="num">${fmt.int(s.sessions)}</td><td class="num">${fmt.int(s.valid)}</td><td class="num">${fmt.kwh0(s.energy)}</td>
            <td class="num">${fmt.int(s.clients)}</td><td class="num">${fmt.brl(s.avgTicket)}</td>
            <td><div style="display:flex;align-items:center;gap:8px;min-width:130px"><div class="bar ${s.bandClass}" style="flex:1"><span style="width:${Math.min(s.occupancy, 100)}%"></span></div><strong>${fmt.pct1(s.occupancy)}</strong></div></td>
            <td class="num">${s.sessions ? fmt.pct1(s.availability) : "—"}</td><td class="num">${s.failures ? `<span class="badge bad">${s.failures}</span>` : "0"}</td><td>${fmt.date(s.lastDate)}</td></tr>`; }).join("") || `<tr><td colspan="12" class="empty">Nenhuma estação neste filtro.</td></tr>`}</tbody>
        </table></div>
      </section>`;

    target.querySelectorAll("#unitFilter button").forEach(b => b.onclick = () => { ui.filter = b.dataset.v; renderList(target); });
    const search = target.querySelector("#unitSearch");
    search.oninput = () => { ui.search = search.value; clearTimeout(search._t); search._t = setTimeout(() => { renderList(target); const el = target.querySelector("#unitSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
    target.querySelectorAll("tr[data-unit]").forEach(tr => tr.onclick = () => UBY.go(`#/unidades/${encodeURIComponent(tr.dataset.unit)}/${encodeURIComponent(tr.dataset.station)}`));
  }

  function renderDetail(target, workId, station) {
    const month = monthArg();
    const d = UBY.data("stationDetail", workId, station, month);
    const periodLabel = month ? UBY.state.api.monthName(month) : "Acumulado";
    if (!d) {
      target.innerHTML = `<p><a href="#/unidades">← Unidades</a></p><div class="note">Estação sem dados em ${esc(periodLabel)}. Troque o período no topo.</div>`;
      return;
    }
    const m = d.metrics;
    const sessions = d.sessions.filter(s => ui.sessionFilter === "all" || (ui.sessionFilter === "valid" ? s.valid : !s.valid));
    const classicHref = `legado/obra-ev/recargas.html?obra=${encodeURIComponent(d.workId)}&openReport=mensal&station=${encodeURIComponent(d.station)}`;

    target.innerHTML = `
      <p style="margin:0 0 12px"><a href="#/unidades" style="font-weight:800;font-size:12px">← Unidades e carregadores</a></p>
      <div class="hero"><div><p class="eyebrow">Unidade operacional · ${esc(d.workName)}</p><h1>${esc(d.station)}</h1>
        <p class="lead">${d.power ? `${fmt.int(d.power)} kW · ` : ""}${esc(d.schedule || "disponibilidade padrão")}</p></div>
        <div class="callout"><strong>${esc(periodLabel)} · ocupação ${fmt.pct(d.occupancy)} (${esc(d.band)})</strong><small>${fmt.n1(d.hours)} h disponíveis no período. <a href="${classicHref}" target="_blank" rel="noopener">Abrir relatório completo da estação (clássico) ↗</a></small>
          <p style="margin:10px 0 0"><a class="btn primary link-btn" href="#/importar/${encodeURIComponent(d.workId)}/${month || new Date().toISOString().slice(0, 7)}/${encodeURIComponent(location.hash)}/${encodeURIComponent(d.station)}">⇪ Importar planilha desta estação</a></p></div></div>

      <div class="grid g6" style="margin-bottom:18px">
        ${kpi("Faturamento", fmt.brl(m.revenue), `R$/kWh ${fmt.brl(m.revenuePerKwh)}`, "", "lead big")}
        ${kpi("Recargas", fmt.int(m.sessions), `${fmt.int(m.valid)} válidas`)}
        ${kpi("Energia", fmt.kwh(m.energy), `${fmt.n1(m.avgKwh)} kWh/recarga válida`, "", "warn")}
        ${kpi("Clientes", fmt.int(m.clients), `ticket ${fmt.brl(m.avgTicket)}`)}
        ${kpi("Tempo médio", esc(m.avgDuration), `ociosidade ${fmt.brl(m.idleValue)}`)}
        ${kpi("Falhas", fmt.int(m.failed), `${fmt.int(m.shortOrZero)} curtas/zeradas`, "", m.failed ? "bad" : "")}
      </div>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Ritmo</p><h2>Série diária</h2></div></div><div class="chart-box"><canvas id="chUnitDaily"></canvas></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Histórico</p><h2>Mês a mês</h2></div></div>
          <div class="table-wrap" style="max-height:260px"><table><thead><tr><th>Mês</th><th class="num">Faturamento</th><th class="num">Recargas</th><th class="num">Energia</th></tr></thead>
          <tbody>${d.monthly.slice().reverse().map(x => `<tr><td>${esc(x.label)}</td><td class="num">${fmt.brl(x.revenue)}</td><td class="num">${fmt.int(x.sessions)}</td><td class="num">${fmt.kwh(x.energy)}</td></tr>`).join("")}</tbody></table></div>
          ${d.connectors.length ? `<h3 style="margin:14px 0 8px">Conectores DC</h3><div class="list">${d.connectors.map(c => `<div class="list-row"><span>${esc(c.label)} <small>· ${c.sessions} sessões · ${fmt.kwh0(c.energy)}${c.failures ? ` · ${c.failures} falhas` : ""}</small></span><strong>${fmt.brl(c.revenue)}</strong></div>`).join("")}</div>` : ""}
        </section>
      </div>

      <section class="section">
        <div class="section-head"><div><p class="kicker">Auditoria</p><h2>Sessões brutas (${d.sessions.length})</h2><p>Todas as linhas importadas, inclusive falhas e sessões curtas, com o motivo de exclusão das médias.</p></div>
          <div class="seg" id="sessFilter">${[["all", "Todas"], ["valid", "Válidas"], ["invalid", "Fora da regra"]].map(([v, l]) => `<button data-v="${v}" class="${ui.sessionFilter === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="table-wrap" style="max-height:520px"><table>
          <thead><tr><th>Início</th><th>Cliente</th><th>Conector</th><th>Duração</th><th class="num">Energia</th><th class="num">Valor</th><th class="num">Ociosidade</th><th>Pagamento</th><th>Situação</th></tr></thead>
          <tbody>${sessions.slice(0, 600).map(s => `<tr><td>${fmt.dt(s.start)}</td><td>${esc(s.client)}${s.vehicle ? `<small>${esc(s.vehicle)}</small>` : ""}</td><td>${esc(s.connector || "—")}</td><td>${esc(s.duration || "—")}</td>
            <td class="num">${fmt.kwh(s.energy)}</td><td class="num">${fmt.brl(s.revenue)}</td><td class="num">${s.idleValue ? fmt.brl(s.idleValue) : ""}</td><td>${esc(s.payment || "—")}</td>
            <td>${s.valid ? '<span class="badge ok">válida</span>' : `<span class="badge ${s.issue ? "bad" : "warn"}" title="${esc(s.issue)}">${esc(s.issue ? s.issue.slice(0, 38) : "curta/zerada")}</span>`}${s.courtesy ? ' <span class="badge neutral">cortesia</span>' : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="empty">Nenhuma sessão neste filtro.</td></tr>`}</tbody>
        </table></div>
        ${sessions.length > 600 ? `<p class="source-line">Exibindo as 600 mais recentes de ${sessions.length}. A lista completa está no relatório clássico.</p>` : ""}
      </section>`;

    target.querySelectorAll("#sessFilter button").forEach(b => b.onclick = () => { ui.sessionFilter = b.dataset.v; renderDetail(target, workId, station); });
    const opts = UBY.baseChartOptions;
    UBY.chart("chUnitDaily", {
      type: "bar",
      data: { labels: d.days.map(x => x.label), datasets: [
        { label: "Faturamento (R$)", data: d.days.map(x => x.revenue), backgroundColor: "#187457", borderRadius: 3, yAxisID: "y" },
        { type: "line", label: "Falhas", data: d.days.map(x => x.failures), borderColor: "#b75450", backgroundColor: "#b75450", pointRadius: 2, yAxisID: "y1" }
      ] },
      options: opts({ scales: { ...opts().scales, y1: { position: "right", grid: { display: false }, ticks: { precision: 0, font: { size: 10 }, color: "#b75450" } } } })
    });
  }

  UBY.register("unidades", {
    render(target, params) {
      if (params && params.length >= 2) {
        document.getElementById("crumbTitle").textContent = params[1];
        return renderDetail(target, params[0], params[1]);
      }
      return renderList(target);
    }
  });
})();

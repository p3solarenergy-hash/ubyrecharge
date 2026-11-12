/* Unidades e carregadores — lista de todas as estações e detalhe denso. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { filter: "uby", search: "", sessionFilter: "all", clientSearch: "", clientLimit: 200 };
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

      <div class="grid g5" style="margin-bottom:16px">
        ${(() => { const cap = rows.reduce((s, r) => s + (Number(r.power) || 0) * (Number(r.hours) || 0), 0); const used = rows.reduce((s, r) => s + (Number(r.occupancy) || 0) / 100 * (Number(r.power) || 0) * (Number(r.hours) || 0), 0);
          return kpi("Ocupação média", cap > 0 ? fmt.pct(used / cap * 100) : "—", "ponderada pela potência e horário de cada estação", "", "lead big"); })()}
        ${kpi("Faturamento", fmt.brl(tot.revenue), `${rows.length} estação(ões) no filtro`, "", "lead big")}
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

  // Comparar períodos já com este carregador: mês anterior × mês escolhido (ou os dois últimos meses no acumulado).
  function compareHref(workId, station, month) {
    const months = UBY.state.months, b = month || months.at(-1) || "";
    const a = months[months.indexOf(b) - 1] || b;
    if (!b) return "#/comparar";
    const range = mk => { const [y, m] = mk.split("-").map(Number); return [`${mk}-01`, `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`]; };
    const scope = `ref:${workId}|${station}`;
    return `#/comparar/${[scope, ...range(a), scope, ...range(b)].map(encodeURIComponent).join("/")}`;
  }

  // ---------------------------------------------------------------- clientes, tarifas e pagamentos
  // Usuário, 11/11/2026: por carregador, o kWh de cada cliente, as tarifas variáveis e os meios de pagamento.
  const pk = v => v === null || v === undefined || !Number.isFinite(v) ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`;
  const hh = h => `${String(h).padStart(2, "0")}h`;
  function hourStrip(hours) {
    const max = Math.max(1, ...hours);
    return `<div title="Recargas por hora de início (0h a 23h)" style="display:grid;grid-template-columns:repeat(24,1fr);gap:1px;align-items:end;height:18px;min-width:120px">${hours.map((n, h) =>
      `<span title="${hh(h)}: ${n} recarga(s)" style="display:block;height:${n ? Math.max(18, n / max * 100) : 6}%;background:${n ? "var(--uby-green, #187457)" : "rgba(127,127,127,.18)"};border-radius:1px"></span>`).join("")}</div>`;
  }
  function groupTable(title, rows, note) {
    if (!rows.length) return "";
    return `<div><h3 style="margin:0 0 8px">${esc(title)}</h3>${note ? `<p class="source-line" style="margin:-4px 0 8px">${note}</p>` : ""}
      <div class="table-wrap"><table><thead><tr><th>${esc(title)}</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Faturamento</th><th class="num">% fat.</th><th class="num">R$/kWh</th><th class="num">Clientes</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><strong>${esc(r.label)}</strong></td><td class="num">${fmt.int(r.sessions)}${r.lines !== r.sessions ? `<small>${fmt.int(r.lines)} linhas</small>` : ""}</td><td class="num">${fmt.kwh(r.energy)}</td><td class="num">${fmt.brl(r.revenue)}</td>
        <td class="num"><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end"><div class="bar" style="width:54px"><span style="width:${Math.min(r.shareRevenue, 100)}%"></span></div>${fmt.pct1(r.shareRevenue)}</div></td>
        <td class="num">${pk(r.perKwh)}</td><td class="num">${fmt.int(r.clients)}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  function clientsSection(b) {
    if (!b || !b.totals.lines) return "";
    const t = b.totals, priced = b.tariffs, top = priced[0];
    // Acima do preço padrão (o mais usado) é ociosidade: varia muito, então vira uma linha só (usuário, 12/11/2026).
    const isIdle = x => top && x.price > top.price + 0.005;
    const idle = priced.filter(isIdle), minDate = a => a.filter(Boolean).sort()[0] || null;
    const tariffRows = priced.filter(x => !isIdle(x));
    if (idle.length) tariffRows.push({ idle: true, n: idle.length, sessions: idle.reduce((s, x) => s + x.sessions, 0), energy: idle.reduce((s, x) => s + x.energy, 0),
      share: idle.reduce((s, x) => s + x.share, 0), min: Math.min(...idle.map(x => x.price)), max: Math.max(...idle.map(x => x.price)),
      first: minDate(idle.map(x => x.first)), last: idle.map(x => x.last).filter(Boolean).sort().at(-1) || null });
    const pe = priced.reduce((s, x) => s + x.energy, 0);
    const avg = pe > 0 ? priced.reduce((s, x) => s + x.revenue, 0) / pe : null;
    const min = priced.length ? Math.min(...priced.map(x => x.price)) : null, max = priced.length ? Math.max(...priced.map(x => x.price)) : null;
    const known = b.methods.filter(m => m.label !== "Não informado");
    const topMethod = known[0];
    const named = b.customers.filter(c => !c.anonymous).length;
    const q = ui.clientSearch.trim().toLowerCase();
    const list = b.customers.filter(c => !q || `${c.name} ${c.email} ${c.vehicle} ${c.methods.map(m => m.label).join(" ")}`.toLowerCase().includes(q));
    const shown = list.slice(0, ui.clientLimit);
    return `
      <section class="section" id="secClientes">
        <div class="section-head"><div><p class="kicker">Quem recarregou, a que preço e como pagou</p><h2>Clientes, tarifas e pagamentos</h2>
          <p>Energia e valor = soma de todas as linhas da planilha; recargas = só as válidas. Tarifa praticada = R$ ÷ kWh de cada recarga válida com 1 kWh ou mais (já com cupom).</p></div></div>
        <div class="grid g5" style="margin-bottom:14px">
          ${kpi("Tarifa média praticada", pk(avg), `${priced.length} preço(s) diferente(s) no período`, "", "lead big")}
          ${kpi("Faixa de preço", min === null ? "—" : `${pk(min)} a ${pk(max)}`, top ? `mais usado: ${pk(top.price)} (${fmt.pct1(top.share)} do kWh)` : "")}
          ${kpi("Clientes", fmt.int(named), named ? `${fmt.n1(t.sessions / named)} recargas por cliente` : "")}
          ${kpi("Meio mais usado", topMethod ? esc(topMethod.label) : "—", topMethod ? `${fmt.pct1(topMethod.shareRevenue)} do faturamento` : "sem a coluna nas planilhas deste período")}
          ${kpi("Sem forma de pagamento", fmt.int(t.unknownMethod), t.unknownMethod ? "linhas importadas antes da coluna existir" : "todas as linhas informadas", "", t.unknownMethod ? "warn" : "")}
        </div>
        ${t.unknownMethod && t.unknownMethod === t.lines ? `<div class="note" style="margin-bottom:12px"><strong>Forma de pagamento ainda não lida neste período.</strong> A planilha nova da Spott traz "Forma de pagamento" e "Acionamento"; a plataforma passou a ler essas colunas em 11/11/2026. Reimporte a planilha do mês para preencher.</div>` : ""}

        <div class="split" style="margin-bottom:16px">
          ${groupTable("Meio de pagamento", b.methods)}
          <div style="display:flex;flex-direction:column;gap:16px">
            ${groupTable("Acionamento", b.triggers.some(x => x.label !== "Não informado") ? b.triggers : [], "Como o cliente iniciou a recarga (App, QR Code, link).")}
            ${b.operators.length > 1 ? groupTable("Operadora", b.operators) : ""}
          </div>
        </div>

        <div class="split" style="margin-bottom:16px">
          <div><h3 style="margin:0 0 8px">Tarifas praticadas</h3>${top ? `<p class="source-line" style="margin:-4px 0 8px">Preço padrão = o mais usado (${pk(top.price)}). Abaixo dele é cupom: cada preço com o horário de uso. Acima é ociosidade: tudo somado numa linha só.</p>` : ""}
            <div class="table-wrap" style="max-height:340px"><table><thead><tr><th class="num">R$/kWh</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">% do kWh</th><th>Horário de uso</th><th>Cupom</th><th>Período</th></tr></thead>
            <tbody>${tariffRows.map(x => x.idle ? `<tr><td class="num"><strong>Com ociosidade</strong><small>${pk(x.min)} a ${pk(x.max)}</small></td><td class="num">${fmt.int(x.sessions)}</td><td class="num">${fmt.kwh(x.energy)}</td><td class="num">${fmt.pct1(x.share)}</td>
              <td><small>${fmt.int(x.n)} preço(s) acima de ${pk(top.price)}</small></td><td>—</td><td><small>${fmt.date(x.first)} a ${fmt.date(x.last)}</small></td></tr>` : `<tr><td class="num"><strong>${pk(x.price)}</strong></td><td class="num">${fmt.int(x.sessions)}</td><td class="num">${fmt.kwh(x.energy)}</td><td class="num">${fmt.pct1(x.share)}</td>
              <td>${hourStrip(x.hours)}</td><td>${esc(x.coupon || "—")}</td><td><small>${fmt.date(x.first)} a ${fmt.date(x.last)}</small></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Sem recargas válidas com valor.</td></tr>`}</tbody></table></div></div>
          <div><h3 style="margin:0 0 8px">R$/kWh médio por hora do dia</h3><div class="chart-box" style="height:300px"><canvas id="chTariffHour"></canvas></div></div>
        </div>

        <div class="section-head" style="margin-top:4px"><div><h3 style="margin:0">Clientes deste carregador (${fmt.int(list.length)})</h3><p class="source-line" style="margin:2px 0 0">Ordenados pelo kWh no período escolhido no topo.</p></div>
          <input class="search" id="cliSearch" placeholder="Buscar cliente, e-mail, veículo ou pagamento" value="${esc(ui.clientSearch)}"></div>
        <div class="table-wrap" style="max-height:560px"><table>
          <thead><tr><th>Cliente</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">% do kWh</th><th class="num">kWh/recarga</th><th class="num">Valor</th><th class="num">R$/kWh</th><th>Pagamento</th><th>Última</th></tr></thead>
          <tbody>${shown.map(c => `<tr><td><strong>${esc(c.name)}</strong>${c.vehicle || (c.email && !c.anonymous) ? `<small>${esc([c.vehicle, c.anonymous ? "" : c.email].filter(Boolean).join(" · "))}</small>` : ""}</td>
            <td class="num">${fmt.int(c.sessions)}${c.lines !== c.sessions ? `<small>${fmt.int(c.lines)} linhas</small>` : ""}</td><td class="num"><strong>${fmt.kwh(c.energy)}</strong></td><td class="num">${fmt.pct1(c.shareEnergy)}</td>
            <td class="num">${c.sessions ? fmt.n1(c.avgKwh) : "—"}</td><td class="num">${fmt.brl(c.revenue)}</td>
            <td class="num">${pk(c.perKwh)}${c.minPerKwh !== null && Math.abs(c.maxPerKwh - c.minPerKwh) >= 0.01 ? `<small>${pk(c.minPerKwh)} a ${pk(c.maxPerKwh)}</small>` : ""}${c.coupons.length ? `<small>cupom ${esc(c.coupons.join(", "))}</small>` : ""}</td>
            <td>${c.methods.map(m => `<span class="badge ${m.label === "Não informado" ? "neutral" : "ok"}" style="margin:0 3px 3px 0">${esc(m.label)}${c.methods.length > 1 ? ` ×${m.n}` : ""}</span>`).join("")}${c.operators.length > 1 ? `<small>${esc(c.operators.join(" + "))}</small>` : ""}</td>
            <td>${fmt.date(c.last)}</td></tr>`).join("") || `<tr><td colspan="9" class="empty">Nenhum cliente na busca.</td></tr>`}</tbody>
          <tfoot><tr><td><strong>Total do carregador</strong></td><td class="num">${fmt.int(t.sessions)}</td><td class="num"><strong>${fmt.kwh(t.energy)}</strong></td><td class="num">100%</td><td></td><td class="num"><strong>${fmt.brl(t.revenue)}</strong></td><td class="num">${t.energy > 0 ? pk(t.revenue / t.energy) : "—"}</td><td colspan="2"></td></tr></tfoot>
        </table></div>
        ${list.length > shown.length ? `<p style="margin:8px 0 0"><button class="btn" type="button" id="cliMore">Mostrar mais (${fmt.int(list.length - shown.length)} restantes)</button></p>` : ""}
      </section>`;
  }
  function bindClients(target, b, rerender) {
    if (!b || !b.totals.lines) return;
    const s = target.querySelector("#cliSearch");
    if (s) s.oninput = () => { ui.clientSearch = s.value; clearTimeout(s._t); s._t = setTimeout(() => { rerender(); const el = document.getElementById("cliSearch"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); };
    const more = target.querySelector("#cliMore");
    if (more) more.onclick = () => { ui.clientLimit += 200; rerender(); };
    const opts = UBY.baseChartOptions;
    const hrs = b.hourly;
    UBY.chart("chTariffHour", {
      type: "line",
      data: { labels: hrs.map(x => hh(x.hour)), datasets: [
        { label: "R$/kWh médio", data: hrs.map(x => x.perKwh === null ? null : Math.round(x.perKwh * 1000) / 1000), borderColor: "rgba(24,116,87,.95)", backgroundColor: "rgba(24,116,87,.16)", borderWidth: 2.4, fill: "origin", spanGaps: true, pointRadius: 2, pointHoverRadius: 4, cubicInterpolationMode: "monotone", yAxisID: "y" },
        { label: "kWh vendidos", data: hrs.map(x => Math.round(x.energy * 10) / 10), borderColor: "rgba(61,111,142,.6)", backgroundColor: "rgba(61,111,142,.10)", borderWidth: 1.4, fill: "origin", pointRadius: 0, cubicInterpolationMode: "monotone", yAxisID: "y1" }
      ] },
      options: opts({ plugins: { ...opts().plugins, tooltip: { ...(opts().plugins?.tooltip || {}), callbacks: {
          label: it => it.datasetIndex === 0 ? `R$/kWh: ${pk(it.raw)}` : `kWh: ${fmt.n1(it.raw)}`,
          footer: items => items.length ? `Recargas: ${fmt.int(hrs[items[0].dataIndex]?.sessions || 0)}` : "" } } },
        scales: { ...opts().scales, y: { ...opts().scales.y, ticks: { ...(opts().scales.y?.ticks || {}), callback: v => `R$ ${Number(v).toFixed(2).replace(".", ",")}` } },
          y1: { beginAtZero: true, position: "right", grid: { display: false }, ticks: { font: { size: 10 } } } } })
    });
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

    // Página única do carregador (usuário, 20/10/2026: "a análise de uso pode aparecer já dentro do carregador"):
    // painel do mês, ritmo, calendário, semana, horários, pagamentos, ociosidade, diagnóstico e sessões.
    const parts = UBY.usageParts;
    const u = parts ? UBY.data("usage", { kind: "station", workId: d.workId, station: d.station, monthKey: month }) : null;
    const hasUse = !!(u && u.kpis);
    const cmpHref = compareHref(d.workId, d.station, month);
    const jump = [["secResumo", "Resumo"], ["secRitmo", "Ritmo e histórico"], ...(u ? [["secCal", "Calendário"], ["secSemana", "Dia da semana"], ["secHorarios", "Horários e pagamentos"], ["secOcio", "Ociosidade e avaliações"], ["secTecnico", "Diagnóstico"]] : []), ...(d.breakdown?.totals.lines ? [["secClientes", "Clientes e pagamentos"]] : []), ["secSessoes", "Sessões"]];

    target.innerHTML = `
      <p style="margin:0 0 12px"><a href="#/unidades" style="font-weight:800;font-size:12px">← Unidades e carregadores</a></p>
      <div class="hero"><div><p class="eyebrow">Unidade operacional · ${esc(d.workName)}</p><h1>${esc(d.station)}</h1>
        <p class="lead">${d.power ? `${fmt.int(d.power)} kW · ` : ""}${esc(d.schedule || "disponibilidade padrão")}</p></div>
        <div class="callout"><strong>${esc(periodLabel)} · ocupação ${fmt.pct(d.occupancy)} (${esc(d.band)})</strong><small>${fmt.n1(d.hours)} h disponíveis no período. <a href="#/financeiro/estacao">Financeiro da estação</a> · <a href="#/parametros/carregador/${encodeURIComponent(`${d.workId}|${d.station}`)}">Editar valores</a> · <a href="#/parametros/operacao/${encodeURIComponent(`${d.workId}|${d.station}`)}">Horários e potência</a></small>
          <p style="margin:10px 0 0"><a class="btn primary link-btn" href="#/importar/${encodeURIComponent(d.workId)}/${month || new Date().toISOString().slice(0, 7)}/${encodeURIComponent(location.hash)}/${encodeURIComponent(d.station)}">⇪ Importar planilha desta estação</a></p></div></div>

      <nav class="unit-jump" aria-label="Partes desta página">${jump.map(([id, l]) => `<a href="#${id}" data-jump="${id}">${l}</a>`).join("")}<span class="spacer"></span><a class="btn primary link-btn" href="${cmpHref}">⇄ Comparar períodos</a></nav>

      <div id="secResumo">${hasUse ? parts.kpiBlock(u.kpis, `${d.station}`) : `
      <div class="grid g6" style="margin-bottom:18px">
        ${kpi("Ocupação", fmt.pct(d.occupancy), `${esc(d.band)} · ${fmt.n1(d.hours)} h disponíveis`, "", "lead big")}
        ${kpi("Faturamento", fmt.brl(m.revenue), `R$/kWh ${fmt.brl(m.revenuePerKwh)}`, "", "lead big")}
        ${kpi("Recargas", fmt.int(m.sessions), `${fmt.int(m.valid)} válidas · tempo médio ${esc(m.avgDuration)}`)}
        ${kpi("Energia", fmt.kwh(m.energy), `${fmt.n1(m.avgKwh)} kWh/recarga válida`, "", "warn")}
        ${kpi("Clientes", fmt.int(m.clients), `ticket ${fmt.brl(m.avgTicket)} · ociosidade ${fmt.brl(m.idleValue)}`)}
        ${kpi("Falhas", fmt.int(m.failed), `${fmt.int(m.shortOrZero)} curtas/zeradas`, "", m.failed ? "bad" : "")}
      </div>
      `}</div>
      ${hasUse ? `<p class="source-line" style="margin:-6px 0 16px">${fmt.int(m.valid)} recargas válidas de ${fmt.int(m.sessions)} · ${fmt.int(m.clients)} clientes · ${fmt.int(m.shortOrZero)} curtas/zeradas · tempo médio ${esc(m.avgDuration)}</p>` : ""}

      <div class="split" id="secRitmo" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Ritmo</p><h2>Série diária</h2></div></div><div class="chart-box"><canvas id="chUnitDaily"></canvas></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Histórico</p><h2>Mês a mês</h2></div></div>
          <div class="table-wrap" style="max-height:260px"><table><thead><tr><th>Mês</th><th class="num">Faturamento</th><th class="num">Recargas</th><th class="num">Energia</th></tr></thead>
          <tbody>${d.monthly.slice().reverse().map(x => `<tr><td>${esc(x.label)}</td><td class="num">${fmt.brl(x.revenue)}</td><td class="num">${fmt.int(x.sessions)}</td><td class="num">${fmt.kwh(x.energy)}</td></tr>`).join("")}</tbody></table></div>
          ${d.connectors.length ? `<h3 style="margin:14px 0 8px">Conectores DC</h3><div class="list">${d.connectors.map(c => `<div class="list-row"><span>${esc(c.label)} <small>· ${c.sessions} sessões · ${fmt.kwh0(c.energy)}${c.failures ? ` · ${c.failures} falhas` : ""}</small></span><strong>${fmt.brl(c.revenue)}</strong></div>`).join("")}</div>` : ""}
        </section>
      </div>

      ${u ? parts.details(u, d.station, true) : ""}

      ${clientsSection(d.breakdown)}

      <section class="section" id="secSessoes">
        <div class="section-head"><div><p class="kicker">Auditoria</p><h2>Sessões brutas (${d.sessions.length})</h2><p>Todas as linhas importadas, inclusive falhas e sessões curtas, com o motivo de exclusão das médias.</p></div>
          <div class="seg" id="sessFilter">${[["all", "Todas"], ["valid", "Válidas"], ["invalid", "Fora da regra"]].map(([v, l]) => `<button data-v="${v}" class="${ui.sessionFilter === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="table-wrap" style="max-height:520px"><table>
          <thead><tr><th>Início</th><th>Cliente</th><th>Conector</th><th>Duração</th><th class="num">Energia</th><th class="num">Valor</th><th class="num">Ociosidade</th><th class="num">R$/kWh</th><th>Pagamento</th><th>Situação</th></tr></thead>
          <tbody>${sessions.slice(0, 600).map(s => `<tr><td>${fmt.dt(s.start)}</td><td>${esc(s.client)}${s.vehicle ? `<small>${esc(s.vehicle)}</small>` : ""}</td><td>${esc(s.connector || "—")}</td><td>${esc(s.duration || "—")}</td>
            <td class="num">${fmt.kwh(s.energy)}</td><td class="num">${fmt.brl(s.revenue)}</td><td class="num">${s.idleValue ? fmt.brl(s.idleValue) : ""}</td><td class="num">${s.energy >= 1 && s.revenue > 0 ? pk(s.revenue / s.energy) : ""}</td><td>${esc(s.method && s.method !== "Não informado" ? s.method : s.payment || "—")}${s.method && s.method !== "Não informado" && s.payment ? `<small>${esc([s.payment, s.trigger].filter(Boolean).join(" · "))}</small>` : ""}</td>
            <td>${s.valid ? '<span class="badge ok">válida</span>' : `<span class="badge ${s.issue ? "bad" : "warn"}" title="${esc(s.issue)}">${esc(s.issue ? s.issue.slice(0, 38) : "curta/zerada")}</span>`}${s.courtesy ? ' <span class="badge neutral">cortesia</span>' : ""}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">Nenhuma sessão neste filtro.</td></tr>`}</tbody>
        </table></div>
        ${sessions.length > 600 ? `<p class="source-line">Exibindo as 600 mais recentes de ${sessions.length}. A lista completa está no relatório clássico.</p>` : ""}
      </section>`;

    target.querySelectorAll("#sessFilter button").forEach(b => b.onclick = () => { ui.sessionFilter = b.dataset.v; renderDetail(target, workId, station); });
    // Âncoras da página: rolam sem trocar a rota (o # da tela continua o mesmo).
    target.querySelectorAll("[data-jump]").forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    if (u) parts.bind(target, u, () => renderDetail(target, workId, station));
    bindClients(target, d.breakdown, () => { const y = window.scrollY; renderDetail(target, workId, station); window.scrollTo(0, y); });
    const opts = UBY.baseChartOptions;
    // Degradê vertical do faturamento: azul embaixo, verde no topo (cores do tema night quando ativo).
    const revGradient = (alphaLow, alphaHigh) => ({ chart }) => {
      const area = chart.chartArea;
      if (!area) return null;
      const night = document.documentElement.dataset.theme === "night";
      const g = chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
      g.addColorStop(0, night ? `rgba(0,229,255,${alphaLow})` : `rgba(61,111,142,${alphaLow})`);
      g.addColorStop(.7, night ? `rgba(0,224,122,${alphaHigh})` : `rgba(24,116,87,${alphaHigh})`);
      return g;
    };
    UBY.chart("chUnitDaily", {
      type: "line",
      data: { labels: d.days.map(x => x.label), datasets: [
        { label: "Faturamento (R$)", data: d.days.map(x => x.revenue), borderColor: revGradient(.9, 1), backgroundColor: revGradient(.02, .32), borderWidth: 2.4, fill: "origin", pointRadius: 0, pointHoverRadius: 4, cubicInterpolationMode: "monotone", yAxisID: "y" },
        { label: "Falhas", data: d.days.map(x => x.failures), borderColor: "rgba(183,84,80,.55)", backgroundColor: "rgba(183,84,80,.55)", borderWidth: 1.4, borderDash: [4, 3], pointRadius: 0, pointHoverRadius: 3, cubicInterpolationMode: "monotone", yAxisID: "y1" }
      ] },
      options: opts({ plugins: { ...opts().plugins, tooltip: { ...(opts().plugins?.tooltip || {}), callbacks: { footer: items => items.length ? `Recargas: ${fmt.int(d.days[items[0].dataIndex]?.sessions || 0)}` : "" } } },
        scales: { ...opts().scales, y: { ...opts().scales.y, beginAtZero: true }, y1: { beginAtZero: true, suggestedMax: Math.max(3, ...d.days.map(x => x.failures || 0)) * 3, position: "right", grid: { display: false }, ticks: { precision: 0, font: { size: 10 }, color: "rgba(183,84,80,.6)" } } } })
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

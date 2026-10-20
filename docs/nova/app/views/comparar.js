/* Comparar períodos — A × B: mesmo carregador em meses diferentes (julho da JK × setembro da JK),
   carregadores diferentes no mesmo mês, ou a rede inteira. Conta em app/analytics-core.js (comparePeriods).
   O link guarda a comparação: #/comparar/<escopoA>/<deA>/<atéA>/<escopoB>/<deB>/<atéB>/<mesmos dias 1|0>. */
(function () {
  "use strict";
  const { fmt, esc, kpi, delta } = UBY;

  const pad = n => String(n).padStart(2, "0");
  const monthRange = mk => { const [y, m] = mk.split("-").map(Number); return { from: `${mk}-01`, to: `${mk}-${pad(new Date(y, m, 0).getDate())}` }; };
  const monthOf = p => { const mk = p.from.slice(0, 7), r = monthRange(mk); return r.from === p.from && r.to === p.to ? mk : ""; };
  const br = d => d.split("-").reverse().join("/");
  const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

  function readParams(params) {
    const months = UBY.state.months;
    const last = months.at(-1) || new Date().toISOString().slice(0, 7), prev = months.at(-2) || last;
    const [sa, fa, ta, sb, fb, tb, same] = params || [];
    const a = okDay(fa) && okDay(ta) ? { scope: sa || "uby", from: fa, to: ta } : { scope: sa || "uby", ...monthRange(prev) };
    const b = okDay(fb) && okDay(tb) ? { scope: sb || a.scope, from: fb, to: tb } : { scope: sb || a.scope, ...monthRange(last) };
    return { a, b, same: same === undefined ? null : same === "1" };
  }
  // Link vindo da página do carregador: o nome da estação pode vir com outra grafia (acento, caixa, "UBY RECHARGE - ").
  const norm = v => String(v || "").replace(/^UBY RECHARGE\s*-\s*/i, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  function resolveScope(scope, opts) {
    if (!scope.startsWith("ref:") || opts.stations.some(x => x.ref === scope.slice(4))) return scope;
    const [workId, ...rest] = scope.slice(4).split("|"), name = norm(rest.join("|"));
    const hit = opts.stations.find(x => x.workId === workId && norm(x.station) === name) || opts.stations.find(x => norm(x.station) === name);
    return hit ? `ref:${hit.ref}` : scope;
  }
  const go = (a, b, same) => UBY.go(`#/comparar/${[a.scope, a.from, a.to, b.scope, b.from, b.to, same ? "1" : "0"].map(encodeURIComponent).join("/")}`);

  function scopeLabel(scope, opts) {
    if (scope === "all") return "Todos os carregadores";
    if (scope.startsWith("ref:")) { const s = opts.stations.find(x => x.ref === scope.slice(4)); return s ? UBY.shortStation(s.station) : scope.slice(4).split("|")[1] || "Carregador"; }
    if (scope.startsWith("work:")) { const w = opts.works.find(x => x.workId === scope.slice(5)); return w ? `${w.workName} (local)` : "Local"; }
    return "Rede UBY";
  }
  const periodLabel = p => { const mk = monthOf(p); return mk ? UBY.state.api.monthName(mk) : `${br(p.from)} a ${br(p.to)}`; };

  function sideControls(id, p, opts, title) {
    const mk = monthOf(p);
    const own = opts.stations.filter(s => s.own && !s.partner), other = opts.stations.filter(s => !(s.own && !s.partner));
    const opt = (v, l) => `<option value="${esc(v)}" ${p.scope === v ? "selected" : ""}>${esc(l)}</option>`;
    return `<div class="cmp-side" data-side="${id}">
      <p class="kicker">${title}</p>
      <select class="select" data-k="scope" aria-label="Carregador do período ${id.toUpperCase()}">
        ${opt("uby", "Rede UBY (sem parceiros)")}${opt("all", "Todos os carregadores")}
        <optgroup label="Carregadores UBY">${own.map(s => opt(`ref:${s.ref}`, UBY.shortStation(s.station))).join("")}</optgroup>
        ${other.length ? `<optgroup label="Parceiros e fora da operação">${other.map(s => opt(`ref:${s.ref}`, s.label)).join("")}</optgroup>` : ""}
        ${opts.works.length ? `<optgroup label="Local inteiro">${opts.works.map(w => opt(`work:${w.workId}`, `${w.workName} (${w.stations.length} carregadores)`)).join("")}</optgroup>` : ""}
      </select>
      <select class="select" data-k="month" aria-label="Mês do período ${id.toUpperCase()}">
        ${UBY.state.months.slice().reverse().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${esc(UBY.state.api.monthName(m))}</option>`).join("")}
        <option value="" ${mk ? "" : "selected"}>Datas personalizadas…</option>
      </select>
      <span class="cmp-dates" ${mk ? "hidden" : ""}><input class="select" type="date" data-k="from" value="${esc(p.from)}" aria-label="Início"> a <input class="select" type="date" data-k="to" value="${esc(p.to)}" aria-label="Fim"></span>
    </div>`;
  }

  // Indicador | A | B | diferença | variação
  const ROWS = [
    ["revenue", "Faturamento", v => fmt.brl(v)],
    ["kwh", "Energia", v => fmt.kwh0(v)],
    ["sessions", "Recargas válidas", v => fmt.int(v)],
    ["clients", "Clientes", v => fmt.int(v)],
    ["newClients", "Clientes novos", v => fmt.int(v), "primeira recarga na UBY dentro do período"],
    ["ticket", "Ticket médio", v => fmt.brl(v)],
    ["pricePerKwh", "R$/kWh médio", v => fmt.brl(v)],
    ["kwhPerSession", "kWh por recarga", v => fmt.n1(v)],
    ["sessionsPerClient", "Recargas por cliente", v => fmt.n1(v)],
    ["revenuePerDay", "Faturamento por dia", v => fmt.brl(v), "dias corridos, inclui dias sem venda"],
    ["kwhPerDay", "Energia por dia", v => fmt.kwh0(v)],
    ["sessionsPerDay", "Recargas por dia", v => fmt.n1(v)],
    ["activeDays", "Dias com venda", v => fmt.int(v)]
  ];
  const signed = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v));

  function render(target, params) {
    const opts = UBY.data("compareOptions");
    const { a, b, same } = readParams(params);
    a.scope = resolveScope(a.scope, opts); b.scope = resolveScope(b.scope, opts);
    // Mês em andamento contra mês fechado: por padrão compara os mesmos dias (1 a N de cada lado).
    const probe = UBY.data("compare", a, b, { sameDays: false });
    const sameDays = same === null ? probe.a.partial || probe.b.partial : same;
    const r = sameDays ? UBY.data("compare", a, b, { sameDays: true }) : probe;
    const la = `${scopeLabel(a.scope, opts)} · ${periodLabel(a)}`, lb = `${scopeLabel(b.scope, opts)} · ${periodLabel(b)}`;
    const dl = (k, inverse = false) => delta(r.deltas[k].b, r.deltas[k].a, { label: "vs A", inverse });
    const D = r.deltas, c = r.clients;
    const rangeText = P => `${br(P.from)} a ${br(P.toUsed)} · ${P.days} dia(s)${P.partial ? " (parcial)" : ""}`;
    const multiSite = r.bySite.length > 1;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas</p><h1>Comparar períodos</h1>
        <p class="lead">Escolha um carregador (ou a rede) e dois períodos para ver quanto subiu ou caiu: faturamento, energia, recargas e quais clientes explicam a diferença.</p></div>
        <div class="callout"><strong>A: ${esc(la)}<br>B: ${esc(lb)}</strong><small>A é a base; as variações mostram B contra A. Só recargas válidas e pagas contam (mesma regra de Clientes).</small></div></div>

      <section class="section cmp-controls">
        <div class="cmp-sides">${sideControls("a", a, opts, "Período A · base")}<button class="btn" id="cmpSwap" title="Trocar A e B">⇄</button>${sideControls("b", b, opts, "Período B · comparar")}</div>
        <div class="toolbar" style="margin:12px 0 0">
          <label class="cmp-check"><input type="checkbox" id="cmpSame" ${sameDays ? "checked" : ""}> Comparar só os mesmos dias</label>
          <span class="spacer"></span>
          <button class="btn" data-preset="prev">Mês anterior × atual</button>
          <button class="btn" data-preset="samePeriod">Mesmo período nos dois</button>
        </div>
        <p class="source-line" style="margin:8px 0 0">A: ${rangeText(r.a)} · B: ${rangeText(r.b)}${sameDays ? " · cortado no mesmo número de dias" : ""} · última recarga importada ${r.lastDay ? br(r.lastDay) : "—"}</p>
      </section>

      <div class="grid g4" style="margin:16px 0">
        ${kpi("Faturamento", fmt.brl(D.revenue.b), `A: ${fmt.brl(D.revenue.a)} · ${signed(D.revenue.diff, fmt.brl)}`, dl("revenue"), "lead big")}
        ${kpi("Energia", fmt.kwh0(D.kwh.b), `A: ${fmt.kwh0(D.kwh.a)} · ${signed(D.kwh.diff, fmt.kwh0)}`, dl("kwh"), "warn")}
        ${kpi("Recargas", fmt.int(D.sessions.b), `A: ${fmt.int(D.sessions.a)} · ${signed(D.sessions.diff, fmt.int)}`, dl("sessions"))}
        ${kpi("Clientes", fmt.int(D.clients.b), `A: ${fmt.int(D.clients.a)} · ${fmt.int(D.newClients.b)} novo(s) em B`, dl("clients"))}
      </div>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Indicadores</p><h2>A × B</h2></div></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Indicador</th><th class="num">A</th><th class="num">B</th><th class="num">Diferença</th><th class="num">Variação</th></tr></thead>
            <tbody>${ROWS.map(([k, label, f, hint]) => `<tr><td>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</td><td class="num">${f(D[k].a)}</td><td class="num"><strong>${f(D[k].b)}</strong></td>
              <td class="num">${signed(D[k].diff, f)}</td><td class="num">${dl(k)}</td></tr>`).join("")}</tbody>
          </table></div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Ritmo</p><h2>Faturamento acumulado dia a dia</h2><p>Dia 1 de cada período lado a lado.</p></div></div>
          <div class="chart-box"><canvas id="chCmpCum"></canvas></div>
        </section>
      </div>

      <section class="section" style="margin-bottom:18px">
        <div class="section-head"><div><p class="kicker">Clientes</p><h2>De onde veio a diferença</h2>
          <p>${fmt.brl(c.bridge.a)} em A ${signed(c.bridge.kept, fmt.brl)} de quem recarregou nos dois, − ${fmt.brl(-c.bridge.lost)} de quem não voltou, + ${fmt.brl(c.bridge.returned)} de quem voltou e + ${fmt.brl(c.bridge.fresh)} de clientes novos = ${fmt.brl(c.bridge.b)} em B.</p></div></div>
        <div class="grid g4" style="margin-bottom:14px">
          ${kpi("Recarregaram nos dois", fmt.int(c.kept.count), `${fmt.brl(c.kept.aRevenue)} → ${fmt.brl(c.kept.bRevenue)}`, delta(c.kept.bRevenue, c.kept.aRevenue, { label: "vs A" }))}
          ${kpi("Não voltaram em B", fmt.int(c.lost.count), `deixaram ${fmt.brl(c.lost.aRevenue)} em A`, "", c.lost.count ? "bad" : "")}
          ${kpi("Voltaram em B", fmt.int(c.returned.count), `já eram clientes, sem recarga em A · ${fmt.brl(c.returned.bRevenue)}`)}
          ${kpi("Novos em B", fmt.int(c.fresh.count), `primeira recarga na UBY · ${fmt.brl(c.fresh.bRevenue)}`, "", c.fresh.count ? "lead" : "")}
        </div>
        <div class="grid g2">
          ${clientTable("Maiores altas", c.gainers)}
          ${clientTable("Maiores quedas (inclui quem não voltou)", c.losers)}
        </div>
      </section>

      ${multiSite ? `<section class="section">
        <div class="section-head"><div><p class="kicker">Carregadores</p><h2>Por carregador</h2></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Carregador</th><th class="num">Faturamento A</th><th class="num">Faturamento B</th><th class="num">Variação</th><th class="num">Energia A</th><th class="num">Energia B</th><th class="num">Recargas A → B</th><th class="num">Clientes A → B</th></tr></thead>
          <tbody>${r.bySite.map(s => `<tr><td><strong>${esc(UBY.shortStation(s.ref.split("|").slice(1).join("|") || s.site))}</strong></td>
            <td class="num">${fmt.brl(s.a.revenue)}</td><td class="num">${fmt.brl(s.b.revenue)}</td><td class="num">${delta(s.b.revenue, s.a.revenue, { label: "" })}</td>
            <td class="num">${fmt.kwh0(s.a.kwh)}</td><td class="num">${fmt.kwh0(s.b.kwh)}</td><td class="num">${fmt.int(s.a.sessions)} → ${fmt.int(s.b.sessions)}</td><td class="num">${fmt.int(s.a.clients)} → ${fmt.int(s.b.clients)}</td></tr>`).join("")}</tbody>
        </table></div>
      </section>` : ""}`;

    // ---------- eventos ----------
    const read = id => {
      const box = target.querySelector(`.cmp-side[data-side="${id}"]`), cur = id === "a" ? a : b;
      const scope = box.querySelector('[data-k="scope"]').value, month = box.querySelector('[data-k="month"]').value;
      if (month) return { scope, ...monthRange(month) };
      const from = box.querySelector('[data-k="from"]').value, to = box.querySelector('[data-k="to"]').value;
      return { scope, from: okDay(from) ? from : cur.from, to: okDay(to) ? to : cur.to };
    };
    const apply = () => { const na = read("a"), nb = read("b"); if (na.from > na.to || nb.from > nb.to) return; go(na, nb, target.querySelector("#cmpSame").checked); };
    target.querySelectorAll(".cmp-side select, .cmp-side input").forEach(el => el.onchange = () => {
      if (el.dataset.k === "month" && !el.value) { el.closest(".cmp-side").querySelector(".cmp-dates").hidden = false; return; }
      apply();
    });
    target.querySelector("#cmpSame").onchange = apply;
    target.querySelector("#cmpSwap").onclick = () => go(b, a, sameDays);
    target.querySelectorAll("[data-preset]").forEach(btn => btn.onclick = () => {
      const months = UBY.state.months, last = months.at(-1), prev = months.at(-2) || last;
      if (btn.dataset.preset === "prev") go({ scope: a.scope, ...monthRange(prev) }, { scope: a.scope, ...monthRange(last) }, true);
      else go(a, { ...b, from: a.from, to: a.to }, false);
    });

    const opt = UBY.baseChartOptions;
    const n = Math.max(r.a.cumulative.length, r.b.cumulative.length);
    UBY.chart("chCmpCum", {
      type: "line",
      data: { labels: Array.from({ length: n }, (_, i) => `Dia ${i + 1}`), datasets: [
        { label: `A · ${la}`, data: r.a.cumulative, borderColor: "#9aa39c", backgroundColor: "#9aa39c", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 3 },
        { label: `B · ${lb}`, data: r.b.cumulative, borderColor: "#187457", backgroundColor: "rgba(24,116,87,.1)", borderWidth: 2.4, fill: "origin", pointRadius: 0, pointHoverRadius: 4 }
      ] },
      options: opt({ plugins: { ...opt().plugins, tooltip: { ...(opt().plugins?.tooltip || {}), callbacks: { label: it => `${it.dataset.label.split(" · ")[0]}: ${fmt.brl(it.parsed.y)}` } } },
        scales: { ...opt().scales, y: { ...opt().scales.y, beginAtZero: true, ticks: { ...opt().scales.y.ticks, callback: v => fmt.brl0(v) } } } })
    });
  }

  function clientTable(title, list) {
    return `<div><h3 style="margin:0 0 8px">${esc(title)}</h3>
      <div class="table-wrap" style="max-height:380px"><table>
        <thead><tr><th>Cliente</th><th class="num">A</th><th class="num">B</th><th class="num">Diferença</th></tr></thead>
        <tbody>${list.map(x => `<tr><td>${esc(x.name || "Cliente sem nome")}<small>${esc(UBY.shortStation(x.site))} · ${x.aSessions} → ${x.bSessions} recarga(s)</small></td>
          <td class="num">${fmt.brl(x.aRevenue)}</td><td class="num">${fmt.brl(x.bRevenue)}</td><td class="num"><strong>${signed(x.diff, fmt.brl)}</strong></td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nada nesta lista.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  UBY.register("comparar", { render });
})();

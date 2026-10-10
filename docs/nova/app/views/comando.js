/* Comando da rede — leitura densa com DC, AC e parceiros separados. */
(function () {
  "use strict";
  const { fmt, esc, delta, kpi, mini } = UBY;

  const kindLabel = k => ({ dc: "DC", ac: "AC" }[k] || "—");
  const modelLabel = m => m ? UBY.modelLabel(m) : "fora da operação";

  function originPanel(kind, title, subtitle, tag, b) {
    const c = b.comparison;
    const d = (cur, prev, opts = {}) => delta(cur, prev, { hasBase: c.hasBase, ...opts });
    const isDc = kind === "dc";
    return `
      <article class="panel ${kind} ${isDc ? "fill" : ""}">
        <div class="panel-head"><div><p class="kicker">Operação própria</p><h2>${title}</h2><p>${subtitle}</p></div><span class="tag ${kind}">${tag}</span></div>
        <div class="cmp-banner"><span><strong>Comparativo mensal</strong> · ${esc(c.label)}</span>
          <span>Faturamento ${c.hasBase ? pctText(c.current.revenue, c.previous.revenue) : "sem base"}</span>
          <span>Energia ${c.hasBase ? pctText(c.current.energy, c.previous.energy) : "sem base"}</span>
          <span>Recargas ${c.hasBase ? pctText(c.current.count, c.previous.count) : "sem base"}</span></div>
        ${b.sessions || b.chargers ? `<div class="grid ${isDc ? "g3" : "g4"}">
          ${mini(`Ocupação ${kindLabel(kind)}`, fmt.pct(b.occupancy), `${b.chargers} carregador(es) próprio(s)`, d(c.current.energy, c.previous.energy), "lead")}
          ${mini(`Faturamento ${kindLabel(kind)}`, fmt.brl(b.revenue), `${fmt.int(b.sessions)} recarga(s)`, d(c.current.revenue, c.previous.revenue), "lead")}
          ${mini(`Energia ${kindLabel(kind)}`, fmt.kwh(b.energy), "energia entregue", d(c.current.energy, c.previous.energy))}
          ${mini(`Clientes ${kindLabel(kind)}`, fmt.int(b.clients), "clientes atendidos", d(c.current.clients, c.previous.clients))}
          ${mini("R$ médio / recarga", fmt.brl(b.avgTicket), `${fmt.int(b.validSessions)} válida(s)`, d(c.current.avgTicket, c.previous.avgTicket))}
          ${mini("kWh médio / recarga", `${fmt.n1(b.avgKwh)} kWh`, "somente sessões válidas", d(c.current.avgKwh, c.previous.avgKwh))}
          ${mini("Tempo médio", esc(b.avgDurationLabel), `${fmt.int(b.durationSessions)} sessão(ões) com duração`, d(c.current.avgDuration, c.previous.avgDuration))}
          ${mini("Média por dia", fmt.n1(b.perDay), isDc ? esc(b.perDayByStation.slice(0, 3).map(r => `${r.station}: ${fmt.n1(r.perDay)}/dia`).join(" · ")) : "recargas por dia", d(c.current.perDay, c.previous.perDay))}
          ${mini("Disponibilidade real", fmt.pct(b.availability), `${fmt.int(b.validSessions)} de ${fmt.int(b.sessions)} tentativas viraram recarga`)}
          ${mini(`Falhas ${kindLabel(kind)}`, fmt.int(b.failures), `${fmt.pct(b.failureRate)} das tentativas`, d(c.current.failedCount, c.previous.failedCount, { inverse: true }))}
          ${mini("Melhor unidade", esc(b.best?.station || "—"), b.best ? fmt.brl(b.best.revenue) : "sem dados no período")}
          ${mini("Participação na rede", fmt.pct(b.revenueShare), `do faturamento · ${fmt.pct(b.networkShare)} das recargas do consolidado`)}
        </div>` : `<div class="note">Sem base ${kindLabel(kind)} própria neste período. O bloco continua visível para não misturar médias com outras origens.</div>`}
      </article>`;
  }

  // ---------- Resultado por carregador e por operação (barras, estilo painel Spott) ----------
  const co = { view: "carregador", mode: "mes", day: "", month: "", from: "", to: "", sort: "revenue", open: { uby: true } };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const brDate = s => s ? fromYmd(s).toLocaleDateString("pt-BR") : "—";
  const OP_BADGE = { uby: ["ok", "UBY"], partner: ["partner", "Parceiro"], p3: ["neutral", "Só gestão P3"], outside: ["neutral", "Fora da UBY"] };

  function companyRange(bounds) {
    const last = bounds?.last ? ymd(new Date(bounds.last)) : ymd(new Date());
    const ref = co.day || last;
    const refDate = fromYmd(ref);
    if (co.mode === "dia") return { start: ref, end: ref, label: refDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) };
    if (co.mode === "semana") {
      const monday = new Date(refDate); monday.setDate(refDate.getDate() - ((refDate.getDay() + 6) % 7));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { start: ymd(monday), end: ymd(sunday), label: `Semana de ${monday.toLocaleDateString("pt-BR")} a ${sunday.toLocaleDateString("pt-BR")}` };
    }
    if (co.mode === "personalizado") {
      let from = co.from || `${ref.slice(0, 8)}01`, to = co.to || ref;
      if (from > to) [from, to] = [to, from];
      return { start: from, end: to, label: `${brDate(from)} a ${brDate(to)}` };
    }
    const month = co.month || UBY.periodArg() || UBY.state.months.at(-1) || ref.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    return { start: `${month}-01`, end: ymd(new Date(y, m, 0)), label: UBY.state.api.monthName(month), month };
  }

  function companyBar(cls, value, max, text) {
    const w = max > 0 ? Math.max(value / max * 100, value > 0 ? 0.8 : 0) : 0;
    return `<div class="co-track"><span class="co-fill ${cls}" style="width:${Math.min(w, 100).toFixed(2)}%"></span></div><div class="co-val">${text}</div>`;
  }

  function drawCompany(box) {
    if (!box) return;
    const probe = UBY.data("companyResults", {});
    const rg = companyRange(probe.bounds);
    const res = UBY.data("companyResults", { start: rg.start, end: rg.end });
    const key = co.sort === "energy" ? "energy" : "revenue";
    const dd = (cur, prev) => delta(cur, prev, { hasBase: true, label: "vs período anterior" });
    const prevLabel = res.range ? `${new Date(res.range.prevStart).toLocaleDateString("pt-BR")} a ${new Date(res.range.prevEnd).toLocaleDateString("pt-BR")}` : "—";
    const withOp = res.groups.flatMap(g => g.units.map(u => ({ ...u, op: g.id })));
    const opBadge = id => `<span class="badge ${OP_BADGE[id][0]}">${OP_BADGE[id][1]}</span>`;
    const unitLink = u => `<a class="co-name" href="#/unidades/${encodeURIComponent(u.workId)}/${encodeURIComponent(u.station)}"><span class="badge ${u.kind === "ac" ? "ac" : "dc"}">${u.kind === "ac" ? "AC" : "DC"}</span> ${esc(u.station)} ${u.op ? opBadge(u.op) : ""} <small>${fmt.int(u.sessions)} recargas${u.failures ? ` · ${u.failures} falha(s)` : ""}</small></a>`;
    const unitRows = (u, maxRev, maxEn, share) => `<div class="co-row"><span class="co-lbl">Faturamento</span>${companyBar("rev", u.revenue, maxRev, `<strong>${fmt.brl(u.revenue)}</strong>${share ? ` <small>${maxRev ? fmt.pct1(u.revenue / maxRev * 100) : "—"}</small>` : dd(u.revenue, u.prevRevenue)}`)}</div>
      <div class="co-row"><span class="co-lbl">Energia</span>${companyBar("en", u.energy, maxEn, `<strong>${fmt.kwh(u.energy)}</strong>${share ? ` <small>${maxEn ? fmt.pct1(u.energy / maxEn * 100) : "—"}</small>` : dd(u.energy, u.prevEnergy)}`)}</div>`;

    let body = "";
    if (co.view === "carregador") {
      // Ranking de carregadores da operação UBY e parceiros; só gestão P3 e fora da UBY ficam no fim, fechados.
      const main = withOp.filter(u => u.op === "uby" || u.op === "partner").sort((a, b) => b[key] - a[key]);
      const others = withOp.filter(u => u.op === "p3" || u.op === "outside").sort((a, b) => b[key] - a[key]);
      // Régua única: R$ e kWh no mesmo eixo, para a energia aparecer proporcional ao faturamento.
      const scale = Math.max(...main.map(u => Math.max(u.revenue, u.energy)), 0);
      const oScale = Math.max(...others.map(u => Math.max(u.revenue, u.energy)), 0);
      body = `${main.map(u => `<div class="co-group co-single">${unitLink(u)}${unitRows(u, scale, scale)}</div>`).join("") || `<div class="note">Nenhum carregador da operação UBY ou de parceiros com recarga no recorte.</div>`}
        ${others.length ? `<div class="co-group co-muted"><button class="co-head" data-g="others" type="button"><span class="co-caret">${co.open.others ? "▾" : "▸"}</span><strong>Fora dos resultados UBY</strong><span class="badge neutral">${others.length} carregador(es)</span><small>só gestão P3 e não classificados · ${fmt.brl(others.reduce((s, u) => s + u.revenue, 0))}</small></button>
          ${co.open.others ? `<div class="co-units">${others.map(u => `<div class="co-unit">${unitLink(u)}${unitRows(u, oScale, oScale)}</div>`).join("")}</div>` : ""}</div>` : ""}
        <p class="source-line">Régua única: faturamento (R$) e energia (kWh) no mesmo eixo; 100% = maior valor do recorte. Assim a barra de energia fica proporcional ao preço cobrado (ex.: R$ 1,74/kWh → energia ≈ 57% do faturamento). Variação contra o período anterior de mesmo tamanho.</p>`;
    } else {
      const maxRev = Math.max(...res.groups.map(g => Math.max(g.revenue, g.energy)), 0), maxEn = maxRev;
      body = res.groups.map(g => {
        const open = !!co.open[g.id];
        const units = withOp.filter(u => u.op === g.id).sort((a, b) => b[key] - a[key]);
        return `<div class="co-group ${g.id === "p3" || g.id === "outside" ? "co-muted" : ""}">
          <button class="co-head" data-g="${g.id}" type="button"><span class="co-caret">${open ? "▾" : "▸"}</span><strong>${esc(g.label)}</strong><span class="badge neutral">${g.units.length} carregador(es)</span><small>${esc(g.note)} · ${fmt.int(g.sessions)} recargas</small></button>
          <div class="co-row"><span class="co-lbl">Faturamento</span>${companyBar("rev", g.revenue, maxRev, `<strong>${fmt.brl(g.revenue)}</strong>${dd(g.revenue, g.prevRevenue)}`)}</div>
          <div class="co-row"><span class="co-lbl">Energia</span>${companyBar("en", g.energy, maxEn, `<strong>${fmt.kwh(g.energy)}</strong>${dd(g.energy, g.prevEnergy)}`)}</div>
          ${open ? `<div class="co-units">${units.map(u => `<div class="co-unit">${unitLink({ ...u, op: "" })}${unitRows(u, g.revenue, g.energy, true)}</div>`).join("")}</div>` : ""}
        </div>`;
      }).join("") + `<p class="source-line">Barra da operação: régua única (R$ e kWh no mesmo eixo, 100% = maior valor). Barra do carregador: participação dentro da operação. Variação contra o período anterior de mesmo tamanho.</p>`;
      if (!res.groups.length) body = `<div class="note">Nenhuma recarga no recorte escolhido.</div>`;
    }

    box.innerHTML = `
      <div class="section-head"><div><p class="kicker">Por carregador e por operação</p><h2>Resultado em barras</h2>
          <p>Faturamento e energia de cada carregador ou de cada operação (UBY, parceiros, só gestão P3), em qualquer recorte. Mesma soma do motor original.</p></div>
        <div class="meta"><strong>${esc(rg.label)}</strong><br>comparado a ${esc(prevLabel)}</div></div>
      <div class="toolbar" style="margin-bottom:12px">
        <div class="seg" id="coView">${[["carregador", "Por carregador"], ["operacao", "Por operação"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${co.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="seg" id="coMode">${[["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["personalizado", "Personalizado"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${co.mode === v ? "on" : ""}">${l}</button>`).join("")}</div>
        ${co.mode === "dia" || co.mode === "semana" ? `<label>${co.mode === "dia" ? "Dia" : "Qualquer dia da semana"} <input class="select" type="date" id="coDay" value="${esc(co.day || rg.start)}"></label>` : ""}
        ${co.mode === "mes" ? `<select class="select" id="coMonth">${UBY.state.months.slice().reverse().map(m => `<option value="${m}" ${m === rg.month ? "selected" : ""}>${esc(UBY.state.api.monthName(m))}</option>`).join("")}</select>` : ""}
        ${co.mode === "personalizado" ? `<label>De <input class="select" type="date" id="coFrom" value="${esc(rg.start)}"></label><label>até <input class="select" type="date" id="coTo" value="${esc(rg.end)}"></label>` : ""}
        <span class="spacer"></span>
        <label>Ordenar <span class="seg" id="coSort">${[["revenue", "Faturamento"], ["energy", "Energia"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${co.sort === v ? "on" : ""}">${l}</button>`).join("")}</span></label>
      </div>
      ${UBY.state.full ? "" : `<div class="note" style="margin-bottom:10px">Histórico completo ainda carregando: recortes fora do mês atual se completam em instantes.</div>`}
      <div class="co-axis"><span></span><div class="co-scale"><span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div><span></span></div>
      ${body}`;

    const redraw = () => drawCompany(box);
    box.querySelectorAll("#coView button").forEach(b => b.onclick = () => { co.view = b.dataset.v; redraw(); });
    box.querySelectorAll("#coMode button").forEach(b => b.onclick = () => { co.mode = b.dataset.v; redraw(); });
    box.querySelectorAll("#coSort button").forEach(b => b.onclick = () => { co.sort = b.dataset.v; redraw(); });
    box.querySelectorAll(".co-head").forEach(b => b.onclick = () => { co.open[b.dataset.g] = !co.open[b.dataset.g]; redraw(); });
    const on = (id, fn) => { const el = box.querySelector(id); if (el) el.onchange = e => { if (e.target.value) { fn(e.target.value); redraw(); } }; };
    on("#coDay", v => { co.day = v; });
    on("#coMonth", v => { co.month = v; });
    on("#coFrom", v => { co.from = v; });
    on("#coTo", v => { co.to = v; });
  }

  function pctText(cur, prev) {
    if (!prev && !cur) return "—";
    if (!prev) return "nova base";
    const d = (cur - prev) / Math.abs(prev) * 100;
    return `<strong>${d >= 0 ? "+" : ""}${fmt.pct1(d)}</strong>`;
  }

  // ---------- Acompanhamento do dia por carregador (ondas de ocupação e faturamento) ----------
  const dt = { scope: "uby", day: "" };
  const hourLabel = h => `${String(h).padStart(2, "0")}h`;

  // Curva suave (Catmull-Rom → Bézier) presa entre o topo e a base do gráfico.
  function smoothPath(pts, top, base) {
    if (!pts.length) return "";
    const cl = v => Math.min(Math.max(v, top), base);
    let p = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cl(p1[1] + (p2[1] - p0[1]) / 6)];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, cl(p2[1] - (p3[1] - p1[1]) / 6)];
      p += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return p;
  }

  function dayWave(hourly, scale, nowHour, big) {
    const W = 240, H = big ? 64 : 44, top = 4, base = H - 2;
    const last = Math.min(24, Math.ceil(nowHour));
    const x = i => (i + 0.5) / 24 * W;
    const yRev = v => base - (scale.rev > 0 ? v / scale.rev : 0) * (base - top);
    const yOcc = v => base - Math.min(v, 100) / 100 * (base - top);
    const upto = hourly.slice(0, last);
    const revPts = [[0, base], ...upto.map((h, i) => [x(i), yRev(h.revenue)]), [last / 24 * W, upto.length ? yRev(upto.at(-1).revenue) : base]];
    const occPts = [[0, base], ...upto.map((h, i) => [x(i), yOcc(h.use)]), [last / 24 * W, upto.length ? yOcc(upto.at(-1).use) : base]];
    const rev = smoothPath(revPts, top, base), occ = smoothPath(occPts, top, base);
    const endX = (last / 24 * W).toFixed(1);
    const tips = hourly.map((h, i) => `<rect x="${(i / 24 * W).toFixed(1)}" y="0" width="${(W / 24).toFixed(2)}" height="${H}" fill="transparent"><title>${hourLabel(i)}–${hourLabel(i + 1)} · em uso ${fmt.pct(h.use)} da hora · ${fmt.brl(h.revenue)} · ${fmt.kwh(h.energy)}</title></rect>`).join("");
    return `<svg class="dt-wave ${big ? "big" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Ocupação e faturamento por hora">
      ${[6, 12, 18].map(h => `<line x1="${h / 24 * W}" x2="${h / 24 * W}" y1="${top}" y2="${base}" class="dt-gridline"/>`).join("")}
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="dt-base"/>
      ${rev ? `<path d="${rev} L${endX},${base} L0,${base} Z" class="dt-rev-area"/><path d="${rev}" class="dt-rev"/>` : ""}
      ${occ ? `<path d="${occ}" class="dt-occ"/>` : ""}
      ${last < 24 ? `<rect x="${endX}" y="${top}" width="${(W - last / 24 * W).toFixed(1)}" height="${base - top}" class="dt-future"/><line x1="${endX}" x2="${endX}" y1="${top}" y2="${base}" class="dt-now"/>` : ""}
      ${tips}</svg>
      <div class="dt-hours"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>`;
  }

  // Colunas conforme a quantidade: até 5 numa linha só; 6 ou mais em linhas de 4 (ou de 5 quando fecha certo).
  const dtCols = n => n <= 5 ? Math.max(n, 1) : (n % 5 === 0 ? 5 : 4);

  function drawDayTrack(box, defaultDay) {
    if (!box) return;
    const res = UBY.data("dayTracking", dt.day || defaultDay || "");
    if (!res.day) { box.innerHTML = `<div class="note">Nenhuma recarga registrada para acompanhar por dia.</div>`; return; }
    const day = res.day;
    const list = res.units.filter(u => dt.scope === "geral" || u.group === "uby" || u.group === "partner");
    // Comparação sempre com o dia anterior do calendário (mesma base dos cartões e da rede).
    const prevDate = fromYmd(day.key); prevDate.setDate(prevDate.getDate() - 1);
    const prevTxt = prevDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const dd = (cur, prev, opts = {}) => delta(cur, prev || 0, { hasBase: true, label: `vs ${prevTxt}`, ...opts });
    const net = res.network[dt.scope === "geral" ? "geral" : "uby"];
    const nd = net.day, np = net.previous || {};
    const sumH = (i, k) => list.reduce((s, u) => s + u.hourly[i][k], 0);
    // Rede: % dos carregadores em uso naquela hora (minutos ocupados ÷ carregadores × 60).
    const totalHourly = Array.from({ length: 24 }, (_, i) => ({ revenue: sumH(i, "revenue"), energy: sumH(i, "energy"),
      use: list.length ? sumH(i, "busyMin") / (list.length * 60) * 100 : 0 }));
    const tot = k => list.reduce((s, u) => s + Number(u[k] || 0), 0);
    const totOcc = tot("maxKWh") > 0 ? tot("energy") / tot("maxKWh") * 100 : 0;
    const totPrevOcc = tot("prevMaxKWh") > 0 ? tot("prevEnergy") / tot("prevMaxKWh") * 100 : 0;
    // Escala comum entre os carregadores: a onda mais alta é a do carregador que mais rendeu naquela hora.
    const scale = { rev: Math.max(...list.flatMap(u => u.hourly.map(h => h.revenue)), 0) };
    const tScale = { rev: Math.max(...totalHourly.map(h => h.revenue), 0) };
    const when = fromYmd(day.key);
    const badge = u => u.group === "partner" ? `<span class="badge partner">Parceiro</span>` : u.group === "p3" ? `<span class="badge neutral">Só gestão P3</span>` : u.group === "outside" ? `<span class="badge neutral">Fora da UBY</span>` : "";
    const lastTxt = u => u.lastStart ? `última às ${new Date(u.lastStart).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "sem recarga no dia";

    const card = u => `<article class="dt-card ${u.sessions ? "" : "dt-idle"}">
        <a class="dt-name" href="#/unidades/${encodeURIComponent(u.workId)}/${encodeURIComponent(u.station)}"><span class="badge ${u.kind === "ac" ? "ac" : "dc"}">${u.kind === "ac" ? "AC" : "DC"}</span> <strong>${esc(u.station)}</strong> ${badge(u)}</a>
        <div class="dt-nums">
          <div><small>Ocupação</small><strong class="dt-o">${fmt.pct1(u.occupancy)}</strong>${dd(u.occupancy, u.prevOccupancy)}</div>
          <div><small>Faturamento</small><strong class="dt-r">${fmt.brl(u.revenue)}</strong>${dd(u.revenue, u.prevRevenue)}</div>
          <div class="dt-span"><small>Recargas no dia</small><strong class="dt-c">${fmt.int(u.valid)}</strong>${dd(u.valid, u.prevValid)}</div>
        </div>
        ${dayWave(u.hourly, scale, day.nowHour, false)}
        <div class="dt-foot">${fmt.int(u.valid)} recarga(s) · ${fmt.kwh(u.energy)}${u.failures ? ` · <span class="dt-bad">${u.failures} falha(s)</span>` : ""} · ${lastTxt(u)}</div>
      </article>`;

    box.innerHTML = `
      <div class="section-head"><div><p class="kicker">Resultado do dia</p><h2>Resultado diário da rede</h2>
          <p>Números do dia e a curva hora a hora da rede; abaixo, cada carregador. Falhas contam à parte e não inflam recargas, faturamento ou energia.</p></div>
        <div class="meta">Regra: sessões válidas (isExecutedCharge)<br>${dt.scope === "uby" ? "Rede UBY: operação própria + parceiros" : "Geral: todos os carregadores"}</div></div>
      <div class="toolbar" style="margin-bottom:12px">
        <div class="seg" id="dtScope">${[["uby", "Rede UBY"], ["geral", "Geral"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${dt.scope === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="seg"><button type="button" id="dtPrev" ${day.prevKey ? "" : "disabled"} title="Dia anterior com recarga">‹</button><button type="button" id="dtNext" ${day.nextKey ? "" : "disabled"} title="Próximo dia com recarga">›</button></div>
        <input class="select" type="date" id="dtDay" value="${esc(day.key)}" min="${esc(res.dayKeys[0] || "")}" max="${esc(res.dayKeys.at(-1) || "")}">
        <span class="spacer"></span>
        <span class="dt-legend"><i class="dt-lg-rev"></i>Faturamento <i class="dt-lg-occ"></i>Em uso na hora</span>
      </div>
      <div class="daily-strip dt-strip">
        <div class="daily-date"><small>${esc(when.toLocaleDateString("pt-BR", { weekday: "long" }))}${day.isToday ? " · até agora" : ""}</small><strong>${esc(when.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }))}</strong><span>comparado a ${esc(prevTxt)}</span></div>
        ${kpi("Ocupação do dia", fmt.pct1(totOcc), `${fmt.int(list.filter(u => u.sessions).length)} de ${fmt.int(list.length)} carregador(es) com recarga`, dd(totOcc, totPrevOcc), "lead dt-kpi-occ")}
        ${kpi("Faturamento do dia", fmt.brl(nd.revenue), "", dd(nd.revenue, np.revenue), "lead")}
        ${kpi("Recargas válidas", fmt.int(nd.sessions), "", dd(nd.sessions, np.sessions))}
        ${kpi("Energia entregue", fmt.kwh(nd.energy), "", dd(nd.energy, np.energy), "warn")}
        ${kpi("Clientes", fmt.int(nd.clients), `${fmt.int(nd.newClients)} novo(s)`, dd(nd.clients, np.clients))}
        ${kpi("Falhas registradas", fmt.int(nd.failures), "tentativas com falha", dd(nd.failures, np.failures, { inverse: true }), nd.failures ? "bad" : "")}
      </div>
      ${list.length ? `<div class="dt-card dt-total">
          <div class="dt-name"><strong>${dt.scope === "uby" ? "Rede UBY" : "Todos os carregadores"} · hora a hora</strong> <small>faturamento somado e média de tempo em uso dos carregadores</small></div>
          <div class="dt-nums"><div class="dt-span"><small>Recargas no dia · ${dt.scope === "uby" ? "rede UBY" : "geral"}</small><strong class="dt-c">${fmt.int(tot("valid"))}</strong>${dd(tot("valid"), tot("prevValid"))}</div></div>
          <div class="dt-foot" style="white-space:normal">${list.filter(u => u.valid).map(u => `${esc(u.station)}: ${fmt.int(u.valid)}`).join(" · ") || "nenhuma recarga válida no dia"}</div>
          ${dayWave(totalHourly, tScale, day.nowHour, true)}
        </div>
        <h3 class="dt-sub">Por carregador <small>mesma escala em todos os cartões · clique no nome para abrir o carregador</small></h3>
        <div class="dt-grid ${dtCols(list.length) > 3 ? "dt-many" : ""}" style="--dt-cols:${dtCols(list.length)}">${list.map(card).join("")}</div>` : `<div class="note">Nenhum carregador ${dt.scope === "uby" ? "da rede UBY " : ""}com recarga neste dia ou no anterior.</div>`}
      <p class="source-line">Ocupação do dia = energia ÷ (potência × horas disponíveis da estação no dia${day.isToday ? ", até agora" : ""}), mesma regra do motor. Por hora: valor de cada recarga válida distribuído entre início e fim; linha = parte da hora com carro conectado (na rede, média dos carregadores). Passe o mouse no gráfico para ver cada hora. ${dt.scope === "uby" ? "“Geral” inclui também só gestão P3 e carregadores fora da UBY." : ""}</p>`;

    const redraw = () => drawDayTrack(box, defaultDay);
    box.querySelectorAll("#dtScope button").forEach(b => b.onclick = () => { dt.scope = b.dataset.v; redraw(); });
    const go = k => { if (k) { dt.day = k; redraw(); } };
    box.querySelector("#dtPrev").onclick = () => go(day.prevKey);
    box.querySelector("#dtNext").onclick = () => go(day.nextKey);
    box.querySelector("#dtDay").onchange = e => go(e.target.value);
  }

  function render(target) {
    const r = UBY.data("command", UBY.periodArg());
    const n = r.network, p = r.partners;
    const full = UBY.state.full;

    target.innerHTML = `
      <div class="hero">
        <div><p class="eyebrow">Centro de controle · dados reais</p><h1>Comando da rede</h1>
          <p class="lead">Receita, ocupação, falhas e qualidade da base em uma tela, sem misturar operação própria DC, AC e parceiros.</p></div>
        <div class="callout"><strong>${esc(r.period.label)} · ${fmt.date(r.period.start)} a ${fmt.dt(r.period.end)}</strong>
          <small>${fmt.int(n.chargers)} carregador(es) UBY em ${fmt.int(n.units)} unidade(s). DC entra por padrão; ajustes manuais da plataforma são respeitados.${full ? "" : " Histórico completo ainda carregando: comparativos podem mudar em instantes."}</small></div>
      </div>

      <section class="section" id="dayTrackSection"></section>

      <section class="section">
        <div class="section-head"><div><p class="kicker">Fechamento por origem</p><h2>Rede consolidada</h2><p>Consolidação não apaga a diferença entre operação própria e parceiros.</p></div>
          <div class="meta">AC ${fmt.int(n.acdc.acCharges)} recargas · DC ${fmt.int(n.acdc.dcCharges)} recargas</div></div>
        <div class="grid g6">
          ${kpi("Ocupação média", fmt.pct(n.occupancy), `faixa ${esc(n.occupancyBand)} (${esc(n.occupancyRange)})`, "", "lead big")}
          ${kpi("Faturamento consolidado", fmt.brl(n.revenue), "todas as operações visíveis", "", "lead big")}
          ${kpi("Faturamento próprio UBY", fmt.brl(n.ownRevenue), "DC + AC próprios")}
          ${kpi("Energia entregue", fmt.kwh0(n.energy), `${fmt.int(n.sessions)} recarga(s)`, "", "warn")}
          ${kpi("Clientes únicos", fmt.int(n.clients), "e-mail ou nome da sessão")}
          ${kpi("Projeção do mês", fmt.brl(n.projectedRevenue), n.projectionMonth ? `${esc(UBY.state.api.monthName(n.projectionMonth))} · ${n.projectionUnits} unidade(s)` : "sem base para projetar")}
        </div>
      </section>

      <div class="split cmd-split" style="margin-bottom:18px">
        ${originPanel("dc", "DC · rede rápida", "Ativos próprios UBY. Métricas que orientam a operação principal.", "Foco principal", r.dc)}
        <div class="grid" style="gap:18px;align-content:start">
          ${originPanel("ac", "AC · acompanhamento separado", "Não entra nas médias da rede rápida.", "AC", r.ac)}
          <article class="panel partner">
            <div class="panel-head"><div><p class="kicker">Terceiros</p><h2>Parceiros · royalties</h2><p>Fora dos custos e das métricas principais da matriz UBY.</p></div><span class="tag partner">Parceiros</span></div>
            <div class="grid g4">
              ${mini("Carregadores", fmt.int(p.chargers), "sob gestão de terceiros")}
              ${mini("Recargas", fmt.int(p.sessions), "leitura separada")}
              ${mini("Faturamento gerado", fmt.brl(p.revenue), "base dos parceiros")}
              ${mini("Royalty UBY estimado", fmt.brl(p.royalty), "regra de cada parceiro")}
            </div>
            ${p.rows.length ? `<div class="list" style="margin-top:10px">${p.rows.map(row => `<div class="list-row"><span>${esc(row.station)} <small>· ${fmt.int(row.sessions)} recargas · royalty ${fmt.pct1(row.royaltyPct)}</small></span><strong>${fmt.brl(row.revenue)}</strong></div>`).join("")}</div>` : ""}
          </article>
        </div>
      </div>

      <section class="section" id="companySection"></section>

      <section class="section">
        <div class="section-head"><div><p class="kicker">Comparativo DC</p><h2>Comparativo por carregador DC próprio</h2><p>Identidade exata de cada carregador; Central JK AC e DC nunca se juntam.</p></div><div class="meta">${esc(r.period.label)}<br>${r.dcComparison.length} carregador(es) DC</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Carregador</th><th class="num">Faturamento</th><th class="num">Ocupação</th><th class="num">Disponibilidade real</th><th class="num">Energia</th><th class="num">Recargas</th><th class="num">Clientes</th><th class="num">Ticket médio</th><th class="num">kWh / recarga</th><th class="num">Falhas</th></tr></thead>
          <tbody>${r.dcComparison.map(row => `<tr class="clickable" data-unit="${esc(row.workId)}" data-station="${esc(row.station)}">
            <td><strong>${esc(row.station)}</strong><small>${esc(row.workName)}</small></td><td class="num">${fmt.brl(row.revenue)}</td><td class="num">${fmt.pct(row.occupancy)}</td>
            <td class="num"><strong>${fmt.pct(row.availability)}</strong><small>${row.completed} de ${row.attempts}</small></td><td class="num">${fmt.kwh(row.energy)}</td><td class="num">${fmt.int(row.sessions)}</td>
            <td class="num">${fmt.int(row.clients)}</td><td class="num">${fmt.brl(row.avgTicket)}</td><td class="num">${fmt.kwh(row.avgKwh)}</td><td class="num">${row.failures ? `<span class="badge bad">${row.failures}</span>` : "0"}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">Sem recargas DC próprias no período.</td></tr>`}</tbody>
        </table></div>
        <div class="chart-box" style="margin-top:14px"><canvas id="chDcDaily"></canvas></div>
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Evolução e ritmo</p><h2>Série diária da operação UBY</h2><p>Receita e energia por dia (sessões válidas). O gráfico tem a tabela diária logo abaixo.</p></div></div>
          <div class="chart-box"><canvas id="chDaily"></canvas></div>
          <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:800;font-size:11.5px;color:var(--uby-forest)">Tabela diária auditável (${r.days.length} dias)</summary>
            <div class="table-wrap" style="max-height:320px;margin-top:8px"><table><thead><tr><th>Dia</th><th class="num">Faturamento</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Clientes</th><th class="num">Novos</th><th class="num">Falhas</th></tr></thead>
            <tbody>${r.days.slice().reverse().map(d => `<tr><td>${esc(d.label)}</td><td class="num">${fmt.brl(d.revenue)}</td><td class="num">${d.sessions}</td><td class="num">${fmt.kwh(d.energy)}</td><td class="num">${d.clients}</td><td class="num">${d.newClients}</td><td class="num">${d.failures || ""}</td></tr>`).join("")}</tbody></table></div></details>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Histórico</p><h2>Receita × energia por mês</h2><p>Toda a operação UBY incluída (própria + parceiros).</p></div></div>
          <div class="chart-box"><canvas id="chMonthly"></canvas></div>
          ${full ? "" : `<div class="note" style="margin-top:8px">Carregando meses anteriores…</div>`}
        </section>
      </div>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Unidades</p><h2>Ranking de unidades</h2><p>Clique para abrir o detalhe da estação.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Estação</th><th>Origem</th><th class="num">Faturamento</th><th class="num">Recargas</th><th class="num">Energia</th><th>Ocupação</th></tr></thead>
          <tbody>${r.units.map(u => `<tr class="clickable" data-unit="${esc(u.workId)}" data-station="${esc(u.station)}"><td><strong>${esc(u.station)}</strong><small>${esc(u.workName)} · ${u.clients} cliente(s)</small></td>
            <td><span class="badge ${u.model === "third_party_management" ? "partner" : u.kind}">${u.model === "third_party_management" ? "Parceiro" : kindLabel(u.kind)}</span></td>
            <td class="num">${fmt.brl(u.revenue)}</td><td class="num">${fmt.int(u.sessions)}</td><td class="num">${fmt.kwh0(u.energy)}</td>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="bar ${u.bandClass}" style="flex:1"><span style="width:${Math.min(u.occupancy, 100)}%"></span></div><strong style="min-width:52px;text-align:right">${fmt.pct(u.occupancy)}</strong></div></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhuma unidade UBY com recargas no período.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Saúde e auditoria</p><h2>Saúde operacional</h2><p>Sessões fora da regra seguem preservadas para auditoria.</p></div></div>
          <div class="grid g2">
            ${kpi("Tentativas", fmt.int(r.health.attempts), "todas as linhas importadas")}
            ${kpi("Sessões válidas", fmt.int(r.health.valid), `${fmt.pct(r.health.validPct)} das tentativas`)}
            ${kpi("Falhas informadas", fmt.int(r.health.failed), "status/pagamento com falha", "", r.health.failed ? "bad" : "")}
            ${kpi("Curtas ou zeradas", fmt.int(r.health.shortOrZero), "≤ 0,2 kWh ou < 5 min", "", r.health.shortOrZero ? "warn" : "")}
          </div>
          <h3 style="margin:14px 0 8px">Principais motivos</h3>
          <div class="list">${r.health.reasons.map(x => `<div class="list-row"><span>${esc(x.label)}</span><strong>${x.count}</strong></div>`).join("") || `<div class="note">Nenhuma falha no período.</div>`}</div>
          <p class="source-line">Critério de sessão válida: sem falha informada, energia &gt; 0,2 kWh, sem sessão &lt; 5 min com &lt; 1 kWh e com duração ou receita.</p>
        </section>
      </div>

      <section class="section">
        <div class="section-head"><div><p class="kicker">Classificação</p><h2>Carregadores e regra de inclusão na operação UBY</h2><p>Mostra por que cada carregador entra ou não no comando: DC automático, Aurora AC automático, ajuste manual ou fora por padrão. Para alterar: <a href="#/parametros/operacao">Parâmetros e custos → Operação e carregadores</a>.</p></div></div>
        <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Obra</th><th>Estação</th><th>Tipo</th><th>Na operação UBY</th><th>Regra</th><th>Modelo</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Faturamento</th></tr></thead>
          <tbody>${r.chargerTable.map(row => `<tr class="${row.included ? "" : "muted"}"><td>${esc(row.workName)}</td><td><strong>${esc(row.station)}</strong></td><td><span class="badge ${row.kind}">${kindLabel(row.kind)}</span></td>
            <td>${row.included ? '<span class="badge ok">sim</span>' : '<span class="badge neutral">não</span>'}</td><td>${esc(row.ruleSource)}</td><td>${esc(row.included ? modelLabel(row.model) : "—")}</td>
            <td class="num">${fmt.int(row.sessions)}</td><td class="num">${fmt.kwh(row.energy)}</td><td class="num">${fmt.brl(row.revenue)}</td></tr>`).join("")}</tbody></table></div>
        <p class="source-line">Fonte: <b>Supabase · recharge_sessions + obra_recargas_base</b> via motor original (recargas_app.js ${esc(UBY.state.status.version)}).</p>
      </section>`;

    target.querySelectorAll("tr[data-unit]").forEach(tr => tr.addEventListener("click", () => UBY.go(`#/unidades/${encodeURIComponent(tr.dataset.unit)}/${encodeURIComponent(tr.dataset.station)}`)));
    drawDayTrack(target.querySelector("#dayTrackSection"), r.daily.hasData ? r.daily.day.key : "");
    drawCompany(target.querySelector("#companySection"));
    drawCharts(r);
  }

  function drawCharts(r) {
    const opts = UBY.baseChartOptions;
    const days = r.days;
    UBY.chart("chDaily", {
      type: "bar",
      data: { labels: days.map(d => d.label), datasets: [
        { type: "bar", label: "Faturamento (R$)", data: days.map(d => d.revenue), backgroundColor: "#187457", borderRadius: 4, yAxisID: "y" },
        { type: "line", label: "Energia (kWh)", data: days.map(d => d.energy), borderColor: "#b98527", backgroundColor: "#b98527", pointRadius: 0, tension: .3, yAxisID: "y1" }
      ] },
      options: opts({ scales: { ...opts().scales, y1: { position: "right", grid: { display: false }, ticks: { font: { size: 10 }, color: "#b98527" } } } })
    });
    UBY.chart("chMonthly", {
      type: "bar",
      data: { labels: r.monthly.map(m => m.label), datasets: [
        { type: "bar", label: "Receita (R$)", data: r.monthly.map(m => m.revenue), backgroundColor: "#173c30", borderRadius: 4, yAxisID: "y" },
        { type: "line", label: "Energia (kWh)", data: r.monthly.map(m => m.energy), borderColor: "#c6d449", backgroundColor: "#c6d449", pointRadius: 3, tension: .3, yAxisID: "y1" }
      ] },
      options: opts({ scales: { ...opts().scales, y1: { position: "right", grid: { display: false }, ticks: { font: { size: 10 }, color: "#8a9630" } } } })
    });
    const keys = [...new Set(r.dcComparison.flatMap(row => row.daily.filter(d => d.sessions).map(d => d.key)))].sort();
    UBY.chart("chDcDaily", {
      type: "line",
      data: { labels: keys.map(k => `${k.slice(8, 10)}/${k.slice(5, 7)}`), datasets: r.dcComparison.map((row, i) => {
        const map = new Map(row.daily.map(d => [d.key, d.revenue]));
        return { label: row.station, data: keys.map(k => map.get(k) || 0), borderColor: UBY.PALETTE[i % UBY.PALETTE.length], backgroundColor: UBY.PALETTE[i % UBY.PALETTE.length], pointRadius: 0, tension: .25 };
      }) },
      options: opts({ plugins: { ...opts().plugins, title: { display: true, text: "Faturamento diário por carregador DC (R$)", font: { size: 11, family: "Inter", weight: "700" }, color: "#202821", align: "start" } } })
    });
  }

  UBY.register("comando", { render });
})();

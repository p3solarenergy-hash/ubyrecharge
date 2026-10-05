/* Locais com AC + DC no mesmo lugar (ex.: Shopping Aurora): os carregadores lado a lado e juntos.
   Só leitura: soma as mesmas contas de cada estação (motor oficial). As outras telas não mudam. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { place: "" };

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }
  const signed = v => `<span style="color:${v >= 0 ? "var(--uby-green)" : "var(--uby-red)"}">${fmt.brl(v)}</span>`;
  const perKwh = v => v == null || !Number.isFinite(v) ? "—" : `${fmt.brl(v)}/kWh`;
  const pctOf = (a, b) => b > 0 ? a / b * 100 : 0;
  const night = () => document.documentElement.dataset.theme === "night";
  // Cores fixas por carregador (o tema night troca pelas equivalentes nos gráficos).
  const CHART = ["#187457", "#3d6f8e", "#b98527"];
  const INLINE = () => night() ? ["#00E07A", "#00E5FF", "#FFB020"] : CHART;
  const FLOW = () => night() ? ["#FFB020", "#B79CFF", "#00E5FF", "#FF9E6B", "#8A95A5", "#00E07A"] : ["#b98527", "#77637d", "#3d6f8e", "#a0663f", "#68746b", "#187457"];
  // Modo apresentação da tela de Clientes vale aqui também.
  const masked = () => { try { return localStorage.getItem("uby-nova-mask") === "1"; } catch (_) { return false; } };
  const who = name => masked() ? String(name || "").split(/\s+/).map(p => p ? p[0] + "•••" : "").join(" ") : esc(name);
  const short = st => esc(String(st || "").replace(/^UBY RECHARGE\s*-\s*/i, ""));
  const hhmm = d => d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

  // Curva suave hora a hora (mesmo desenho do Resultado do dia no Comando).
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
  function wave(hourly, scale, nowHour, height = 44) {
    const W = 240, H = height, top = 4, base = H - 2;
    const last = Math.min(24, Math.ceil(nowHour));
    const x = i => (i + 0.5) / 24 * W;
    const yRev = v => base - (scale > 0 ? v / scale : 0) * (base - top);
    const yUse = v => base - Math.min(v, 100) / 100 * (base - top);
    const upto = hourly.slice(0, last);
    const rev = smoothPath([[0, base], ...upto.map((h, i) => [x(i), yRev(h.revenue)]), [last / 24 * W, upto.length ? yRev(upto.at(-1).revenue) : base]], top, base);
    const use = smoothPath([[0, base], ...upto.map((h, i) => [x(i), yUse(h.use)]), [last / 24 * W, upto.length ? yUse(upto.at(-1).use) : base]], top, base);
    const endX = (last / 24 * W).toFixed(1);
    const hl = h => `${String(h).padStart(2, "0")}h`;
    const tips = hourly.map((h, i) => `<rect x="${(i / 24 * W).toFixed(1)}" y="0" width="${(W / 24).toFixed(2)}" height="${H}" fill="transparent"><title>${hl(i)}–${hl(i + 1)} · em uso ${fmt.pct(h.use)} da hora · ${fmt.brl(h.revenue)} · ${fmt.kwh(h.energy)}</title></rect>`).join("");
    return `<svg class="dt-wave" style="height:${H}px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Faturamento e uso por hora">
      ${[6, 12, 18].map(h => `<line x1="${h / 24 * W}" x2="${h / 24 * W}" y1="${top}" y2="${base}" class="dt-gridline"/>`).join("")}
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="dt-base"/>
      ${rev ? `<path d="${rev} L${endX},${base} L0,${base} Z" class="dt-rev-area"/><path d="${rev}" class="dt-rev"/>` : ""}
      ${use ? `<path d="${use}" class="dt-occ"/>` : ""}
      ${last < 24 ? `<rect x="${endX}" y="${top}" width="${(W - last / 24 * W).toFixed(1)}" height="${base - top}" class="dt-future"/><line x1="${endX}" x2="${endX}" y1="${top}" y2="${base}" class="dt-now"/>` : ""}
      ${tips}</svg>
      <div class="dt-hours"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>`;
  }
  // Série de curva suave com área em degradê para os gráficos do período (no lugar das barras).
  const toRgba = (hex, a) => { const h = String(hex).replace("#", ""); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  function curve(label, data, color, extra = {}) {
    return { type: "line", label, data, borderColor: color, borderWidth: 2, tension: 0.42, cubicInterpolationMode: "monotone", pointRadius: 0, pointHoverRadius: 4, fill: "origin",
      backgroundColor: ctx => {
        const ch = ctx.chart, area = ch.chartArea, col = ctx.dataset.borderColor;
        if (!area) return toRgba(col, 0.12);
        const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, toRgba(col, 0.32)); g.addColorStop(1, toRgba(col, 0.02));
        return g;
      }, ...extra };
  }

  // Barra empilhada (divisão AC × DC e destino do faturamento).
  function stackBar(parts, total) {
    const ok = parts.filter(p => p.value > 0);
    return `<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--uby-line,#dde2d7)">${ok.map(p => `<span title="${esc(p.label)} ${fmt.pct1(pctOf(p.value, total))}" style="width:${pctOf(p.value, total)}%;background:${p.color}"></span>`).join("")}</div>`;
  }
  function shareRow(label, values, fmtv, colors) {
    const total = values.reduce((s, v) => s + v, 0);
    return `<div style="margin:12px 0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px"><strong>${label}</strong><small>${values.map((v, i) => `<span style="color:${colors[i]}">●</span> ${fmtv(v)} (${fmt.pct1(pctOf(v, total))})`).join(" &nbsp; ")}</small></div>
      ${stackBar(values.map((v, i) => ({ label: "", value: v, color: colors[i] })), total)}</div>`;
  }

  // Hoje (ou último dia com recarga) de cada carregador, com a mesma conta do Resultado do dia.
  function todayStrip(v) {
    if (!v.live) return "";
    let res;
    try { res = UBY.data("dayTracking", ""); } catch (_) { return ""; }
    if (!res || !res.day) return "";
    const units = v.members.map(m => res.units.find(u => String(u.workId) === String(m.workId) && String(u.station).toUpperCase() === String(m.station).toUpperCase()) || null);
    const when = new Date(res.day.date);
    const tot = k => units.reduce((s, u) => s + Number(u?.[k] || 0), 0);
    const occ = tot("maxKWh") > 0 ? tot("energy") / tot("maxKWh") * 100 : 0, prevOcc = tot("prevMaxKWh") > 0 ? tot("prevEnergy") / tot("prevMaxKWh") * 100 : 0;
    const dd = (a, b) => UBY.delta(a, b, { hasBase: true, label: "vs dia anterior" });
    const colors = INLINE();
    const have = units.filter(Boolean);
    const points = have.reduce((s, u) => s + Number(u.points || 1), 0) || 1;
    const joined = Array.from({ length: 24 }, (_, h) => {
      const sum = k => have.reduce((s, u) => s + Number(u.hourly?.[h]?.[k] || 0), 0);
      return { revenue: sum("revenue"), energy: sum("energy"), use: sum("busyMin") / (points * 60) * 100 };
    });
    const scale = Math.max(...have.flatMap(u => (u.hourly || []).map(h => h.revenue)), 0);
    const nowHour = res.day.nowHour;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">${res.day.isToday ? "Hoje · até agora" : "Último dia com recarga"}</p><h2>${esc(when.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }))}</h2></div>
          <div class="meta"><a href="#/comando">Resultado do dia da rede →</a></div></div>
        <div class="grid g4">
          ${kpi("Faturamento do dia", fmt.brl(tot("revenue")), `${fmt.int(tot("valid"))} recarga(s) · ${fmt.kwh(tot("energy"))}`, dd(tot("revenue"), tot("prevRevenue")), "lead")}
          ${kpi("Ocupação do dia", fmt.pct1(occ), "energia ÷ capacidade dos dois", dd(occ, prevOcc))}
          ${units.map((u, i) => kpi(`${v.members[i].kind} · ${short(v.members[i].station)}`, `<span style="color:${colors[i]}">${fmt.brl(u?.revenue || 0)}</span>`,
            u ? `${fmt.int(u.valid)} recarga(s) · ${fmt.kwh(u.energy)} · ocupação ${fmt.pct1(u.occupancy)}${u.lastStart ? ` · última às ${hhmm(u.lastStart)}` : ""}${u.failures ? ` · <span style="color:var(--uby-red)">${u.failures} falha(s)</span>` : ""}` : "sem recarga no dia",
            u ? dd(u.revenue, u.prevRevenue) : "")).join("")}
        </div>
        <div class="dt-card dt-total" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc(v.place.label)} · hora a hora</strong>
          <small class="dt-legend"><i class="dt-lg-rev"></i>Faturamento somado <i class="dt-lg-occ"></i>Em uso na hora</small></div>
          ${wave(joined, Math.max(...joined.map(h => h.revenue), 0), nowHour, 120)}</div>
        <div class="grid g${Math.max(Math.min(units.length, 4), 1)}" style="margin-top:12px">${units.map((u, i) => `<div class="dt-card ${u && u.sessions ? "" : "dt-idle"}">
          <div style="display:flex;justify-content:space-between;gap:8px"><strong><span style="color:${colors[i]}">●</span> ${esc(v.members[i].kind)} · ${short(v.members[i].station)}</strong><strong style="color:${colors[i]}">${fmt.brl(u?.revenue || 0)}</strong></div>
          ${wave(u?.hourly || Array.from({ length: 24 }, () => ({ revenue: 0, energy: 0, use: 0 })), scale, nowHour, 64)}
          <small>${u ? `${fmt.int(u.valid)} recarga(s) · ${fmt.kwh(u.energy)}${u.lastStart ? ` · última às ${hhmm(u.lastStart)}` : ""}` : "sem recarga no dia"}</small></div>`).join("")}</div>
      </section>`;
  }

  function render(target) {
    if (!ui.place) ui.place = (UBY.data("places").find(p => /aurora/i.test(p.label)) || {}).key || "";
    const v = UBY.data("placeView", ui.place, monthArg());
    if (!v.place) {
      target.innerHTML = `<div class="hero"><div><p class="eyebrow">Rede de recargas</p><h1>Locais AC + DC</h1></div></div><div class="note">Nenhum local com mais de um carregador na operação UBY.</div>`;
      return;
    }
    ui.place = v.place.key;
    const colors = INLINE();
    const health = v.health || v.members.map(() => ({ attempts: 0, failures: 0, rate: 0 }));
    const cols = [...v.members.map((m, i) => ({ i, head: `<span style="color:${colors[i]}">●</span> ${UBY.stationLink(m.workId, m.station, m.kind || m.station)}<small>${short(m.station)}</small>`, ops: m.ops, fin: m.fin, clients: m.clients, health: health[i] })),
      { head: `<strong>Juntos</strong><small>${esc(v.place.label)}</small>`, ops: v.total.ops, fin: v.total.fin, clients: v.total.ops.clients, total: true,
        health: (() => { const a = health.reduce((s, h) => s + h.attempts, 0), fl = health.reduce((s, h) => s + h.failures, 0); return { attempts: a, failures: fl, rate: pctOf(fl, a) }; })() }];
    const t = v.total, o = t.ops, f = t.fin, cmp = v.compare, pj = v.projection;
    const line = (label, fn) => `<tr><td>${label}</td>${cols.map(c => `<td class="num"${c.total ? ' style="font-weight:800"' : ""}>${fn(c)}</td>`).join("")}</tr>`;
    const group = label => `<tr><th colspan="${cols.length + 1}" style="position:static">${label}</th></tr>`;
    const otherCosts = c => c.fin.localExtraCosts + c.fin.taxes + c.fin.ubyRoyalty;
    const dd = (a, b) => cmp ? UBY.delta(a, b, { hasBase: true, label: `vs ${cmp.label}` }) : "";
    const cmpOf = (c, k) => c.total ? cmp[k] : cmp.perMember[c.i][k];

    // Para onde vai o faturamento dos dois juntos.
    const fc = FLOW();
    const flow = [
      { label: "Área (Shopping)", value: f.areaParticipation, color: fc[0] },
      { label: "Gestão P3", value: f.management, color: fc[1] },
      { label: "App / plataforma", value: f.platform, color: fc[2] },
      { label: "Energia", value: f.energyCost, color: fc[3] },
      { label: "Matriz, outros custos e impostos", value: f.matrizCost + f.localExtraCosts + f.taxes + f.ubyRoyalty, color: fc[4] },
      { label: "Resultado", value: Math.max(f.operationNet, 0), color: fc[5] }
    ];
    const c = v.clients;
    const bestDay = (v.daily || []).slice().sort((a, b) => b.revenue - a.revenue)[0];
    const hourTot = v.hourly.map(h => h.members.reduce((s, x) => s + x.sessions, 0)), hourMax = Math.max(...hourTot);
    const weekBest = v.weekday.slice().sort((a, b) => b.members.reduce((s, x) => s + x.revenue, 0) - a.members.reduce((s, x) => s + x.revenue, 0))[0];

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · ${esc(v.label)}</p><h1>${esc(v.place.label)} · AC + DC</h1>
        <p class="lead">Carregadores no mesmo local, que se complementam: cada um individualmente e os dois juntos, com as mesmas contas das outras telas.</p></div>
        <div class="callout"><strong>${v.live ? "Mês em andamento" : "Só leitura"}</strong><small>${v.live && pj ? `${fmt.n1(pj.elapsedDays)} de ${pj.days} dias. No ritmo atual o mês fecha em ${fmt.brl(pj.revenue)} e ${fmt.int(pj.sessions)} recargas.` : "Os números de cada carregador continuam iguais em todas as outras telas."} Para editar custos, clique no carregador (↗).</small></div></div>
      ${v.places.length > 1 ? `<div class="toolbar"><div class="seg" id="placeTabs">${v.places.map(p => `<button data-place="${esc(p.key)}" class="${p.key === v.place.key ? "on" : ""}">${esc(p.label)} (${p.members.map(m => esc(m.kind)).join(" + ")})</button>`).join("")}</div></div>` : ""}

      <section class="section"><div class="section-head"><div><p class="kicker">${esc(v.place.label)} · juntos</p><h2>${v.members.map(m => esc(m.kind)).join(" + ")} no mesmo local</h2>${cmp ? `<p>Setas: comparação com ${esc(cmp.label)}${v.live ? " (mesmos dias do mês anterior)" : ""}.</p>` : ""}</div>
          <div class="meta">${fmt.int(o.power)} kW instalados<br>${v.monthKey ? esc(v.label) : `acumulado de ${v.months.length} mês(es)`}</div></div>
        <div class="grid g6">
          ${kpi("Faturamento", fmt.brl(f.totalRevenue), pj ? `projeção do mês ${fmt.brl(pj.revenue)}` : `${fmt.brl(o.revenuePerKwh)}/kWh médio`, dd(o.revenue, cmp?.revenue), "lead big")}
          ${kpi("Ocupação", fmt.pct1(o.occupancy), "energia ÷ capacidade dos dois", "", "lead big")}
          ${kpi("Recargas", fmt.int(o.sessions), `${fmt.kwh0(o.energy)} entregues`, dd(o.sessions, cmp?.sessions))}
          ${kpi("Clientes", fmt.int(o.clients), `${fmt.int(c.newCount)} novo(s) no local · ${fmt.int(t.sharedClients)} usaram os dois`, dd(o.clients, cmp?.clients))}
          ${kpi("Resultado", signed(f.operationNet), `margem ${fmt.pct1(pctOf(f.operationNet, f.totalRevenue))}`, "", f.operationNet >= 0 ? "" : "bad")}
          ${kpi("% do investido", f.investment ? fmt.pct(pctOf(f.operationNet, f.investment)) : "—", f.investment ? `investimento ${fmt.brl(f.investment)}` : "sem investimento cadastrado")}
        </div>
      </section>

      ${todayStrip(v)}

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Complementares</p><h2>Quanto cada um responde</h2><p>Participação de cada carregador no período.</p></div></div>
          ${shareRow("Faturamento", v.members.map(m => m.fin.totalRevenue), fmt.brl, colors)}
          ${shareRow("Energia entregue", v.members.map(m => m.ops.energy), fmt.kwh0, colors)}
          ${shareRow("Recargas", v.members.map(m => m.ops.sessions), fmt.int, colors)}
          ${shareRow("Clientes", v.members.map(m => m.clients), fmt.int, colors)}
          ${shareRow("Potência instalada", v.members.map(m => m.ops.power), x => `${fmt.int(x)} kW`, colors)}
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Destino</p><h2>Para onde vai o faturamento</h2><p>${fmt.brl(f.totalRevenue)} dos dois juntos no período.</p></div></div>
          ${stackBar(flow, flow.reduce((s, x) => s + x.value, 0))}
          <div class="list" style="margin-top:12px">${flow.filter(x => x.value > 0 || x.label === "Resultado").map(x => `<div class="list-row"><span><span style="color:${x.color}">■</span> ${esc(x.label)}</span><span><strong>${fmt.brl(x.value)}</strong> <small>${fmt.pct1(pctOf(x.value, f.totalRevenue))}</small></span></div>`).join("")}
            ${f.operationNet < 0 ? `<div class="list-row"><span style="color:var(--uby-red)">Prejuízo do período</span><strong>${signed(f.operationNet)}</strong></div>` : ""}</div>
        </section>
      </div>

      ${(v.daily || []).length ? `<section class="section"><div class="section-head"><div><p class="kicker">Dia a dia · ${esc(v.label)}</p><h2>Faturamento de cada carregador e ocupação juntos</h2><p>Curvas: faturamento do dia de cada carregador. Tracejado: ocupação dos dois juntos (energia ÷ capacidade no horário de cada um).</p></div>
          <div class="meta">melhor dia ${bestDay && bestDay.revenue ? `${String(bestDay.day).padStart(2, "0")} · ${fmt.brl(bestDay.revenue)}` : "—"}<br>média ${fmt.brl(v.daily.reduce((s, d) => s + d.revenue, 0) / Math.max(v.daily.length, 1))}/dia</div></div>
        <div class="chart-box" style="height:280px"><canvas id="chPlaceDaily"></canvas></div></section>` : ""}

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Horários</p><h2>Recargas por hora de início</h2><p>Quando cada carregador é procurado no período.</p></div>
            <div class="meta">${hourMax ? `pico às ${hourTot.indexOf(hourMax)}h` : ""}</div></div>
          <div class="chart-box"><canvas id="chPlaceHour"></canvas></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Semana</p><h2>Faturamento por dia da semana</h2><p>Soma do período; passe o mouse para ver as recargas.</p></div>
            <div class="meta">${weekBest && weekBest.members.some(x => x.revenue) ? `mais forte: ${esc(weekBest.label)}` : ""}</div></div>
          <div class="chart-box"><canvas id="chPlaceWeek"></canvas></div></section>
      </div>

      <div class="split" style="margin-bottom:18px">
        <section class="section" style="padding:0;overflow:hidden"><div class="table-wrap" style="border:0;border-radius:0"><table>
          <thead><tr><th></th>${cols.map(c2 => `<th class="num">${c2.head}</th>`).join("")}</tr></thead><tbody>
          ${group("Operação")}
          ${line("Ocupação", c2 => fmt.pct1(c2.ops.occupancy))}
          ${line("Recargas", c2 => fmt.int(c2.ops.sessions))}
          ${cmp ? line(`<small>Recargas em ${esc(cmp.label)}</small>`, c2 => `<small>${fmt.int(cmpOf(c2, "sessions"))}</small>`) : ""}
          ${line("Clientes", c2 => fmt.int(c2.clients))}
          ${line("Energia entregue", c2 => fmt.kwh0(c2.ops.energy))}
          ${line("Energia por recarga", c2 => `${fmt.n1(c2.ops.avgKwh)} kWh`)}
          ${line("Tempo médio", c2 => esc(c2.ops.avgDuration || "—"))}
          ${line("Ticket médio", c2 => fmt.brl(c2.ops.avgTicket))}
          ${line("Preço médio", c2 => perKwh(c2.ops.revenuePerKwh))}
          ${line("Faturamento por kW instalado", c2 => c2.ops.power ? fmt.brl(c2.fin.totalRevenue / c2.ops.power) : "—")}
          ${line("Potência", c2 => `${fmt.int(c2.ops.power)} kW`)}
          ${line("Tentativas com falha", c2 => `${fmt.int(c2.health.failures)} <small>${fmt.pct1(c2.health.rate)}</small>`)}
          ${line("Participação no faturamento", c2 => fmt.pct1(pctOf(c2.fin.totalRevenue, f.totalRevenue)))}
          ${group("Resultado")}
          ${line("Faturamento", c2 => fmt.brl(c2.fin.totalRevenue))}
          ${cmp ? line(`<small>Faturamento em ${esc(cmp.label)}</small>`, c2 => `<small>${fmt.brl(cmpOf(c2, "revenue"))}</small>`) : ""}
          ${line("Energia", c2 => fmt.brl(c2.fin.energyCost))}
          ${line("Gestão P3", c2 => fmt.brl(c2.fin.management))}
          ${line("App / plataforma", c2 => fmt.brl(c2.fin.platform))}
          ${line("Repasse da área", c2 => fmt.brl(c2.fin.areaParticipation))}
          ${line("Matriz (rateio)", c2 => fmt.brl(c2.fin.matrizCost))}
          ${line("Outros custos e impostos", c2 => fmt.brl(otherCosts(c2)))}
          ${line("<strong>Custo total</strong>", c2 => fmt.brl(c2.fin.totalOperatingCost))}
          ${line("Custo por kWh", c2 => perKwh(c2.fin.energy > 0 ? c2.fin.totalOperatingCost / c2.fin.energy : null))}
          ${line("<strong>Resultado</strong>", c2 => signed(c2.fin.operationNet))}
          ${line("Margem", c2 => fmt.pct1(pctOf(c2.fin.operationNet, c2.fin.totalRevenue)))}
          ${line("Investimento", c2 => c2.fin.investment ? fmt.brl(c2.fin.investment) : "—")}
          ${line("% do investido", c2 => c2.fin.investment ? fmt.pct(pctOf(c2.fin.operationNet, c2.fin.investment)) : "—")}
          </tbody></table></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Evolução</p><h2>Faturamento de cada um e resultado juntos</h2></div></div>
          <div class="chart-box"><canvas id="chPlace"></canvas></div></section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Clientes do local · ${esc(v.label)}</p><h2>Quem carrega no ${esc(v.place.label)}</h2><p>Recargas válidas em cada carregador. "Novo" = primeira recarga no local neste período.</p></div>
          <div class="meta"><a href="#/clientes/ranking">Ranking completo →</a></div></div>
        <div class="grid g4" style="margin-bottom:12px">
          ${kpi("Clientes no período", fmt.int(c.total), `${fmt.int(c.recurring)} voltaram mais de uma vez`, "", "lead")}
          ${kpi("Novos no local", fmt.int(c.newCount), "primeira recarga aqui")}
          ${kpi("Usaram AC e DC", fmt.int(c.both), "complementaridade")}
          ${kpi("Peso dos 5 maiores", fmt.pct1(c.top5Share), "do faturamento do local")}
        </div>
        <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>#</th><th>Cliente</th>${v.members.map((m, i) => `<th class="num"><span style="color:${colors[i]}">●</span> ${esc(m.kind)}</th>`).join("")}<th class="num">Energia</th><th class="num">Faturamento</th><th>Última</th></tr></thead>
          <tbody>${c.list.map((x, i) => `<tr><td>${i + 1}</td><td><strong>${who(x.name)}</strong> ${x.isNew ? '<span class="badge ok">novo</span>' : ""}${x.both ? ' <span class="badge neutral">AC + DC</span>' : ""}</td>
            ${x.per.map(n => `<td class="num">${n || "—"}</td>`).join("")}<td class="num">${fmt.kwh(x.energy)}</td><td class="num"><strong>${fmt.brl(x.revenue)}</strong></td><td>${fmt.dt(x.last)}</td></tr>`).join("") || `<tr><td colspan="${v.members.length + 5}" class="empty">Sem clientes no período.</td></tr>`}</tbody></table></div>
        ${c.total > c.list.length ? `<p class="meta" style="margin-top:8px">Mostrando os ${c.list.length} maiores de ${c.total}.</p>` : ""}
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Mês a mês</p><h2>${esc(v.place.label)} juntos</h2><p>Clientes contados uma vez só quando usaram os dois carregadores no mês.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th>${v.members.map(m => `<th class="num">Faturamento ${esc(m.kind)}</th>`).join("")}<th class="num">Faturamento juntos</th><th class="num">Recargas</th><th class="num">Clientes</th><th class="num">Energia</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead>
          <tbody>${v.monthly.slice().reverse().map(m => `<tr${m.key === v.monthKey ? ' style="background:var(--uby-green-soft)"' : ""}><td><strong>${esc(m.label)}</strong></td>
            ${m.members.map(x => `<td class="num">${fmt.brl(x.revenue)}<small>${fmt.int(x.sessions)} recargas</small></td>`).join("")}
            <td class="num"><strong>${fmt.brl(m.revenue)}</strong></td><td class="num">${fmt.int(m.sessions)}</td><td class="num">${fmt.int(m.clients)}</td><td class="num">${fmt.kwh0(m.energy)}</td>
            <td class="num">${signed(m.result)}</td><td class="num">${fmt.pct1(pctOf(m.result, m.revenue))}</td></tr>`).join("") || `<tr><td colspan="${v.members.length + 7}" class="empty">Sem recargas.</td></tr>`}</tbody></table></div>
      </section>`;

    target.querySelectorAll("#placeTabs button").forEach(b => b.onclick = () => { ui.place = b.dataset.place; render(target); });
    const base = UBY.baseChartOptions();
    const lineOpts = (extra = {}) => ({ ...base, ...extra, scales: { ...(base.scales || {}), y: { ...(base.scales?.y || {}), beginAtZero: true }, ...(extra.scales || {}) } });
    UBY.chart("chPlace", { type: "line", data: { labels: v.monthly.map(m => m.label), datasets: [
      ...v.members.map((m, i) => curve(`Faturamento ${m.kind}`, v.monthly.map(x => x.members[i].revenue), CHART[i % CHART.length], { pointRadius: 3 })),
      curve("Resultado juntos", v.monthly.map(x => x.result), "#b98527", { fill: false, borderDash: [5, 4], pointRadius: 3 })
    ] }, options: lineOpts() });
    if ((v.daily || []).length) UBY.chart("chPlaceDaily", { type: "line", data: { labels: v.daily.map(d => String(d.day).padStart(2, "0")), datasets: [
      ...v.members.map((m, i) => curve(`Faturamento ${m.kind}`, v.daily.map(d => d.members[i].revenue), CHART[i % CHART.length], { yAxisID: "y" })),
      curve("Ocupação juntos (%)", v.daily.map(d => Math.round(d.occ * 10) / 10), "#b98527", { yAxisID: "y1", fill: false, borderDash: [4, 3], borderWidth: 1.6 })
    ] }, options: lineOpts({ scales: { y1: { position: "right", beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { callback: x => `${x}%`, font: { size: 10 } } } } }) });
    UBY.chart("chPlaceHour", { type: "line", data: { labels: v.hourly.map(h => `${h.hour}h`), datasets:
      v.members.map((m, i) => curve(m.kind, v.hourly.map(h => h.members[i].sessions), CHART[i % CHART.length])) },
      options: lineOpts({ scales: { y: { ...(base.scales?.y || {}), beginAtZero: true, ticks: { ...(base.scales?.y?.ticks || {}), precision: 0 } } } }) });
    UBY.chart("chPlaceWeek", { type: "line", data: { labels: v.weekday.map(w => w.label), datasets:
      v.members.map((m, i) => curve(m.kind, v.weekday.map(w => Math.round(w.members[i].revenue * 100) / 100), CHART[i % CHART.length], { sessions: v.weekday.map(w => w.members[i].sessions), pointRadius: 3 })) },
      options: lineOpts({ plugins: { ...(base.plugins || {}), tooltip: { ...(base.plugins?.tooltip || {}), callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt.brl(ctx.parsed.y)} · ${ctx.dataset.sessions[ctx.dataIndex]} recarga(s)` } } } }) });
  }

  UBY.register("locais", { render });
})();

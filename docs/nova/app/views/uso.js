/* Análise de uso — substitui a Geral de recargas e o Painel mensal por estação.
   Escopo: operação UBY, rede toda (inclui fora da operação) ou uma estação. */
(function () {
  "use strict";
  const { fmt, esc, kpi, delta } = UBY;
  const ui = { kind: "uby", station: "", calMode: "rev" };

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }

  function kpiBlock(k, label) {
    const has = k.comparison.hasPrevious;
    const d = (cur, prev, inverse = false) => delta(cur, prev, { hasBase: has, inverse, label: k.comparison.label });
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Painel mensal da estação</p><h2>${esc(label)}</h2>
          <p>Ocupação real = kWh ÷ (potência × horas disponíveis). ${fmt.kwh(k.occEnergy)} ÷ (${fmt.n1(k.occPower)} kW × ${fmt.n1(k.occHours)} h).</p></div>
          <div class="meta">${fmt.dt(k.window.start)} até ${fmt.dt(k.window.end)}${k.window.live ? "<br>leitura atualizada até agora" : ""}<br>comparação: ${esc(k.comparison.label)}</div></div>
        <div class="grid g6" style="margin-bottom:10px">
          ${kpi("Ocupação real", fmt.pct(k.occupancy), `anterior ${fmt.pct(k.prevOccupancy)}`, "", "lead big")}
          ${kpi("Faturamento", fmt.brl(k.revenue), `${fmt.int(k.sessions)} recarga(s)`, d(k.revenue, k.prev.revenue))}
          ${kpi("Energia", fmt.kwh(k.energy), `${fmt.int(k.clients)} cliente(s)`, d(k.energy, k.prev.energy), "warn")}
          ${kpi("Projeção do mês", fmt.brl(k.projection), `${fmt.kwh0(k.projectionEnergy)} no ritmo atual`, d(k.projection, k.prev.projection))}
          ${kpi("Ociosidade", fmt.brl(k.idleValue), "valor parado após recarga", d(k.idleValue, k.prev.idleValue, true))}
          ${kpi("Falhas", fmt.int(k.failed), k.sessions ? `${fmt.pct1(k.failed / k.sessions * 100)} das tentativas` : "", d(k.failed, k.prev.failedCount, true), k.failed ? "bad" : "")}
        </div>
        <div class="grid g6">
          ${kpi("Ticket médio", fmt.brl(k.avgTicket), `${fmt.n1(k.avgKwh)} kWh/sessão válida`, d(k.avgTicket, k.prev.avgTicket))}
          ${kpi("R$/kWh médio", fmt.brl(k.revPerKwh), "receita ÷ energia", d(k.revPerKwh, k.prev.revenuePerKwh))}
          ${kpi("Sessão válida média", `${fmt.n1(k.avgKwh)} kWh`, `${fmt.int(k.validSessions)} executada(s)`, d(k.avgKwh, k.prev.avgKwh))}
          ${kpi("Tempo médio", fmt.hours(k.avgDuration), "sessões válidas com duração", d(k.avgDuration, k.prev.avgDuration))}
          ${kpi("Faturamento por dia", fmt.brl(k.avgRevenueDay), `${k.calendarDays} dia(s), inclui dias sem venda`, d(k.avgRevenueDay, k.prev.avgRevenueDay))}
          ${kpi("Recargas por dia", fmt.n1(k.avgSessionsDay), `${fmt.int(k.sessions)} em ${k.calendarDays} dia(s)`, d(k.avgSessionsDay, k.prev.avgSessionsDay))}
        </div>
      </section>`;
  }

  // Calendário: cada dia com faturamento, recargas, energia, falhas e ocupação do dia
  // (mesma regra da ocupação por dia da semana, calculada no motor).
  function calendar(days) {
    if (!days.length) return `<div class="note">Sem dias no período.</div>`;
    const byOcc = ui.calMode === "occ";
    const metric = d => byOcc ? (d.occ || 0) : d.revenue;
    const max = Math.max(...days.map(metric), byOcc ? 0.1 : 1);
    const best = days.reduce((b, d) => (metric(d) > metric(b) ? d : b), days[0]);
    const maxOcc = Math.max(...days.map(d => d.occ || 0), 1);
    const pad = new Date(days[0].date).getDay();
    return `<div class="cal">
      ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => `<div class="cal-h">${d}</div>`).join("")}
      ${Array.from({ length: pad }, () => "<div></div>").join("")}
      ${days.map(d => {
        const a = metric(d) / max;
        const occ = d.occ == null ? null : d.occ;
        const cls = ["cal-d", a > 0.55 ? "hot" : "", d === best && metric(d) > 0 ? "best" : "", !d.sessions && !d.failures ? "empty-day" : ""].join(" ");
        return `<div class="${cls}" style="--a:${(0.06 + a * 0.62).toFixed(2)}" title="${esc(d.label)}: ${fmt.brl(d.revenue)} · ${d.sessions} recargas · ${fmt.kwh0(d.energy)}${occ != null ? ` · ocupação ${fmt.pct1(occ)} (${fmt.n1(d.occHours)} h disponíveis)` : ""}${d.failures ? ` · ${d.failures} falha(s)` : ""}">
          <div class="cal-top"><span>${esc(d.label)}</span>${d.failures ? `<span class="cal-fail">${d.failures}✕</span>` : ""}</div>
          <div class="cal-rev">${fmt.brl0(d.revenue)}</div>
          <div class="cal-sub">${d.sessions} rec. · ${fmt.kwh0(d.energy)}</div>
          <div class="cal-occ" title="Ocupação do dia">${occ != null ? `<div class="bar"><span style="width:${Math.min(occ / maxOcc * 100, 100)}%"></span></div>${fmt.pct1(occ)}` : `<span class="cal-sub">ocupação —</span>`}</div>
        </div>`; }).join("")}</div>`;
  }

  function calendarSummary(days) {
    const withOcc = days.filter(d => d.occ != null);
    const bestRev = days.reduce((b, d) => (d.revenue > (b?.revenue ?? -1) ? d : b), null);
    const bestOcc = withOcc.reduce((b, d) => (d.occ > (b?.occ ?? -1) ? d : b), null);
    const avgOcc = withOcc.length ? withOcc.reduce((s, d) => s + d.occ, 0) / withOcc.length : 0;
    return `<div class="cal-legend"><span class="cal-scale"></span><span>menos → mais ${ui.calMode === "occ" ? "ocupação" : "faturamento"}</span>
      <span>· contorno amarelo = ${ui.calMode === "occ" ? "maior ocupação" : "melhor faturamento"}</span>
      ${bestRev ? `<span>· melhor faturamento: <b>${esc(bestRev.label)}</b> ${fmt.brl(bestRev.revenue)}</span>` : ""}
      ${bestOcc ? `<span>· maior ocupação: <b>${esc(bestOcc.label)}</b> ${fmt.pct1(bestOcc.occ)}</span>` : ""}
      ${withOcc.length ? `<span>· média simples dos dias: <b>${fmt.pct1(avgOcc)}</b></span>` : ""}</div>`;
  }

  function weekdayCards(rows) {
    const maxOcc = Math.max(...rows.map(w => w.occ), 0.1);
    const best = rows.reduce((b, w) => (w.occ > b.occ ? w : b), rows[0] || { occ: 0 });
    return `<div class="wk">${rows.map(w => `<article class="wk-card ${w === best && w.occ > 0 ? "best" : ""}">
        <span class="wk-name">${esc(w.label)}${w === best && w.occ > 0 ? " · pico" : ""}</span>
        <strong class="wk-occ">${fmt.pct1(w.occ)}</strong>
        <div class="wk-meter" title="Ocupação ${fmt.pct1(w.occ)}"><span style="height:${Math.max(w.occ / maxOcc * 100, 3)}%"></span></div>
        <small><b>${fmt.brl(w.revenue)}</b> · ${fmt.brl(w.avgRevenue)}/dia</small>
        <small>${w.count} recargas${w.failed ? ` · <span style="color:var(--uby-red)">${w.failed} falha(s)</span>` : ""} · ${w.days} dia(s)</small>
        <small>${fmt.kwh0(w.energy)} · ticket ${fmt.brl(w.avgTicket)}</small>
      </article>`).join("")}</div>`;
  }

  function render(target) {
    const month = monthArg();
    const stationList = UBY.data("stations", "").filter(s => s.sessions > 0);
    if (ui.kind === "station" && !stationList.some(s => `${s.workId}|${s.station}` === ui.station)) ui.station = stationList[0] ? `${stationList[0].workId}|${stationList[0].station}` : "";
    const [workId, station] = ui.station.split("|");
    const u = UBY.data("usage", { kind: ui.kind, workId, station, monthKey: month });
    const t = u.totals;
    const scopeLabel = ui.kind === "uby" ? "Operação UBY" : ui.kind === "all" ? "Rede toda (inclui fora da operação UBY)" : station;
    const maxHour = Math.max(...u.hours.values, 1);
    const payTotal = u.payments.reduce((s, p) => s + p.count, 0) || 1;
    const couponTotal = u.coupons.reduce((s, c) => s + c.count, 0) || 1;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · ${esc(u.scope.label)}</p><h1>Análise de uso</h1>
        <p class="lead">Quando e como a rede é usada: dia da semana, horários, tempo de permanência, formas de pagamento, cupons, ociosidade, avaliações e desempenho técnico.</p></div>
        <div class="callout"><strong>${esc(scopeLabel)}</strong><small>${fmt.int(u.scope.stations)} estação(ões) · potência considerada ${fmt.int(u.scope.power)} kW${u.scope.bounds ? ` · ${fmt.dt(u.scope.bounds.start)} a ${fmt.dt(u.scope.bounds.end)}` : ""}</small></div></div>

      <div class="toolbar">
        <div class="seg" id="usoKind">${[["uby", "Operação UBY"], ["all", "Rede toda"], ["station", "Uma estação"]].map(([v, l]) => `<button data-v="${v}" class="${ui.kind === v ? "on" : ""}">${l}</button>`).join("")}</div>
        ${ui.kind === "station" ? `<select class="select" id="usoStation">${stationList.map(s => `<option value="${esc(`${s.workId}|${s.station}`)}" ${`${s.workId}|${s.station}` === ui.station ? "selected" : ""}>${esc(s.station)}</option>`).join("")}</select>` : ""}
        <span class="spacer"></span>
        ${ui.kind === "station" ? `<a class="btn" href="#/unidades/${encodeURIComponent(workId)}/${encodeURIComponent(station)}" style="display:inline-flex;align-items:center;text-decoration:none">Sessões da estação →</a>` : ""}
      </div>

      ${u.kpis ? kpiBlock(u.kpis, station) : ""}

      <section class="section"><div class="section-head"><div><p class="kicker">Volume do período</p><h2>${esc(scopeLabel)}</h2></div><div class="meta">AC ${fmt.int(t.acdc.acCharges)} recargas · DC ${fmt.int(t.acdc.dcCharges)} recargas</div></div>
        <div class="grid g5">
          ${kpi("Faturamento", fmt.brl(t.revenue), "", "", "lead")}
          ${kpi("Recargas", fmt.int(t.sessions), "todas as tentativas")}
          ${kpi("Energia", fmt.kwh0(t.energy), "", "", "warn")}
          ${kpi("Carregadores AC / DC", `${t.acdc.acChargers} / ${t.acdc.dcChargers}`, "conectores ou estações únicas")}
          ${kpi("Ociosidade", fmt.brl(t.idleValue), `${fmt.int(u.idleCount)} sessão(ões) com 1 min ou mais parado`)}
        </div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Calendário</p><h2>Faturamento e ocupação por dia</h2><p>Cada dia mostra faturamento, recargas, energia e a ocupação do dia (energia ÷ potência × horas disponíveis do dia). Passe o mouse para ver o detalhe.</p></div>
          <div class="seg" id="calMode">${[["rev", "Cor por faturamento"], ["occ", "Cor por ocupação"]].map(([v, l]) => `<button data-v="${v}" class="${ui.calMode === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        ${calendar(u.days)}${calendarSummary(u.days)}</section>

      <section class="section"><div class="section-head"><div><p class="kicker">Dinâmica semanal</p><h2>Ocupação por dia da semana</h2><p>Horas disponíveis de cada dia, recortadas ao período; hoje conta só as horas já passadas.</p></div></div>
        ${weekdayCards(u.weekday)}
        <div class="table-wrap"><table><thead><tr><th>Dia</th><th class="num">Dias</th><th class="num">Recargas</th><th class="num">Falhas</th><th class="num">Faturamento</th><th class="num">Média/dia</th><th class="num">Energia</th><th class="num">Ticket</th><th style="min-width:120px">Ocupação</th></tr></thead>
          <tbody>${u.weekday.map(w => `<tr><td><strong>${esc(w.label)}</strong></td><td class="num">${w.days}</td><td class="num">${w.count}</td><td class="num">${w.failed || ""}</td><td class="num">${fmt.brl(w.revenue)}</td>
            <td class="num">${fmt.brl(w.avgRevenue)}</td><td class="num">${fmt.kwh0(w.energy)}</td><td class="num">${fmt.brl(w.avgTicket)}</td>
            <td><div style="display:flex;align-items:center;gap:6px"><div class="bar" style="flex:1"><span style="width:${Math.min(w.occ * 3, 100)}%"></span></div><strong>${fmt.pct1(w.occ)}</strong></div></td></tr>`).join("")}</tbody></table></div>
      </section>

      <div class="grid g2" style="gap:18px;margin-bottom:18px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Últimos 7 dias do período</p><h2>Horários mais procurados</h2></div></div>
          <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;align-items:end;height:150px">${u.hours.values.map((v, h) => `<div title="${h}h: ${v} recarga(s)" style="height:${Math.max(v / maxHour * 100, 2)}%;background:${v === maxHour ? "var(--uby-forest)" : "var(--uby-green)"};border-radius:3px 3px 0 0;opacity:${v ? 1 : .25}"></div>`).join("")}</div>
          <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;font-size:9px;color:var(--uby-muted);text-align:center;margin-top:4px">${u.hours.labels.map(h => `<span>${Number(h) % 3 === 0 ? h : ""}</span>`).join("")}</div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Últimos 7 dias do período</p><h2>Tempo de permanência</h2></div></div><div class="chart-box sm"><canvas id="chStay"></canvas></div></section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Formas de pagamento</p><h2>Como os clientes pagam</h2></div></div>
          <div class="list">${u.payments.map(p => `<div class="list-row" style="display:grid;grid-template-columns:1fr auto;gap:4px"><span><strong style="color:var(--uby-ink)">${esc(p.label)}</strong> <small>· ${p.count} (${fmt.pct1(p.count / payTotal * 100)})</small></span><strong>${fmt.brl(p.revenue)}</strong>
            <div class="bar" style="grid-column:1/-1"><span style="width:${p.count / payTotal * 100}%"></span></div></div>`).join("") || `<div class="note">Sem dados.</div>`}</div></section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Cupons</p><h2>Uso de cupons no período</h2><p>Desconto estimado pelo percentual de cada cupom.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Cupom</th><th class="num">Usos</th><th class="num">Participação</th><th class="num">Faturamento</th><th class="num">Ticket</th><th class="num">Desconto est.</th></tr></thead>
            <tbody>${u.coupons.map(c => `<tr><td><strong>${esc(c.coupon)}</strong></td><td class="num">${c.count}</td><td class="num">${fmt.pct1(c.count / couponTotal * 100)}</td><td class="num">${fmt.brl(c.revenue)}</td><td class="num">${fmt.brl(c.count ? c.revenue / c.count : 0)}</td><td class="num">${c.discount ? fmt.brl(c.discount) : "—"}</td></tr>`).join("")}</tbody></table></div></section>
      </div>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Ociosidade</p><h2>Carros parados após a recarga (${u.idleCount})</h2><p>Sessões com 1 minuto ou mais de ociosidade, da maior para a menor.</p></div></div>
          <div class="table-wrap" style="max-height:360px"><table><thead><tr><th>Início</th><th>Cliente</th><th>Estação</th><th class="num">Energia</th><th class="num">Valor</th><th class="num">Parado</th><th class="num">Ociosidade (R$)</th></tr></thead>
            <tbody>${u.idle.map(i => `<tr><td>${fmt.dt(i.start)}</td><td>${esc(i.client)}</td><td>${esc(i.station)}</td><td class="num">${fmt.kwh(i.energy)}</td><td class="num">${fmt.brl(i.revenue)}</td><td class="num"><span class="badge ${i.idleMin >= 30 ? "bad" : "warn"}">${fmt.hours(i.idleMin / 60)}</span></td><td class="num">${fmt.brl(i.idleValue)}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum alerta relevante.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Qualidade percebida</p><h2>Avaliações</h2></div></div>
          <div class="grid g3" style="margin-bottom:10px">${kpi("Média", `${fmt.n1(u.reviews.avg)} ★`, `${u.reviews.rated} avaliação(ões)`, "", "lead")}${kpi("Comentários", fmt.int(u.reviews.comments), "preenchidos")}${kpi("Cobertura", fmt.pct1(u.reviews.coverage), "recargas avaliadas")}</div>
          <div class="list">${u.reviews.dist.map(r => `<div class="list-row"><span>${"★".repeat(r.stars)}</span><strong>${r.count}</strong></div>`).join("")}</div>
          ${u.reviews.latest.length ? `<h3 style="margin:12px 0 6px">Últimos comentários</h3><div class="list">${u.reviews.latest.slice(0, 6).map(r => `<div class="list-row" style="display:block"><small style="color:var(--uby-muted)">${fmt.dt(r.start)} · ${esc(r.client)}${r.value ? ` · ${r.value}★` : ""}</small><div style="white-space:normal">${esc(r.comment)}</div></div>`).join("")}</div>` : ""}
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Diagnóstico técnico</p><h2>Potência entregue e produtividade</h2><p>Potência média = kWh ÷ horas conectadas. Horas equivalentes = kWh ÷ potência instalada.</p></div></div>
        <div class="grid g6">
          ${kpi("Potência média", `${fmt.n1(u.tech.avgPower)} kW`, "todas as sessões")}
          ${kpi("Potência mediana", `${fmt.n1(u.tech.medPower)} kW`, "sessão típica")}
          ${kpi("Potência máxima", `${fmt.n1(u.tech.maxPower)} kW`, "maior sessão")}
          ${kpi("Horas conectadas", fmt.n1(u.tech.connectedHours), "soma das durações")}
          ${kpi("Horas equivalentes", fmt.n1(u.tech.equivHours), "em potência plena")}
          ${kpi("Receita por hora conectada", fmt.brl(u.tech.revPerHour), "")}
        </div>
      </section>`;

    target.querySelectorAll("#usoKind button").forEach(b => b.onclick = () => { ui.kind = b.dataset.v; render(target); });
    target.querySelectorAll("#calMode button").forEach(b => b.onclick = () => { ui.calMode = b.dataset.v; render(target); });
    const sel = target.querySelector("#usoStation"); if (sel) sel.onchange = e => { ui.station = e.target.value; render(target); };
    UBY.chart("chStay", { type: "bar", data: { labels: u.stay.labels, datasets: [{ label: "Sessões", data: u.stay.values, backgroundColor: "#3d6f8e", borderRadius: 4 }] },
      options: UBY.baseChartOptions({ plugins: { legend: { display: false } } }) });
  }

  UBY.register("uso", { render });
})();

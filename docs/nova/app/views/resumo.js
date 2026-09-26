/* Resumo executivo — decisão do dia em uma tela, com atalho para cada camada. */
(function () {
  "use strict";
  const { fmt, esc, kpi, delta } = UBY;
  let obrasSnap = null, obrasLoading = false;

  function render(target) {
    const r = UBY.data("command", UBY.periodArg());
    const n = r.network, dc = r.dc;
    // Obras vêm do mesmo motor do painel de obras (24 ativas, críticas
    // recalculadas pelo checklist), carregado sob demanda.
    if (!obrasSnap && !obrasLoading) {
      obrasLoading = true;
      UBY.obras().then(res => { obrasSnap = res.data; }).catch(() => {}).finally(() => { obrasLoading = false; if (location.hash.startsWith("#/resumo")) UBY.rerender(); });
    }
    const o = obrasSnap;
    const critical = o ? o.stats.crit : 0;
    const c = dc.comparison;

    // Alertas objetivos derivados das mesmas métricas do comando.
    const alerts = [];
    r.units.filter(u => u.bandClass === "occ-red" && u.sessions).forEach(u => alerts.push({ cls: "bad", text: `${u.station}: ocupação crítica (${fmt.pct1(u.occupancy)})` }));
    r.dcComparison.filter(x => x.attempts && x.availability < 85).forEach(x => alerts.push({ cls: "warn", text: `${x.station}: disponibilidade real ${fmt.pct1(x.availability)} (${x.failures} falhas)` }));
    if (r.daily.hasData && r.daily.day.failures) alerts.push({ cls: "warn", text: `${r.daily.day.failures} falha(s) em ${r.daily.day.label}` });
    if (o && o.stats.criticalAlerts) alerts.push({ cls: "bad", text: `${o.stats.criticalAlerts} alerta(s) de prazo em obras (${o.stats.lateTasks} tarefa(s) atrasada(s), ${o.stats.lateDeliveries} entrega(s) vencida(s))` });
    if (critical) alerts.push({ cls: "warn", text: `${critical} pendência(s) crítica(s) nos checklists das obras` });

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Visão executiva · ${esc(r.period.label)}</p><h1>Resumo executivo</h1>
        <p class="lead">O essencial da rede e das obras. Cada bloco leva à camada com o detalhe completo.</p></div>
        <div class="callout"><strong>Base real do Supabase</strong><small>${fmt.int(UBY.state.status.charges)} sessões carregadas · ${o ? `${o.stats.count} obras ativas` : "obras carregando"} · leitura atualizada às ${new Date(UBY.state.status.loadedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</small></div></div>

      <section class="section">
        <div class="section-head"><div><p class="kicker">Rede de recargas</p><h2>Resultado da operação UBY</h2></div><a class="btn" href="#/comando">Abrir comando da rede →</a></div>
        <div class="grid g5">
          ${kpi("Faturamento consolidado", fmt.brl(n.revenue), `próprio ${fmt.brl(n.ownRevenue)}`, "", "lead big")}
          ${kpi("Faturamento DC próprio", fmt.brl(dc.revenue), `${dc.chargers} carregador(es)`, delta(c.current.revenue, c.previous.revenue, { hasBase: c.hasBase }))}
          ${kpi("Ocupação DC", fmt.pct(dc.occupancy), "leitura principal da rede rápida", delta(c.current.energy, c.previous.energy, { hasBase: c.hasBase }))}
          ${kpi("Recargas", fmt.int(n.sessions), `${fmt.int(n.clients)} clientes`, "", "")}
          ${kpi("Projeção do mês", fmt.brl(n.projectedRevenue), `${n.projectionUnits} unidade(s) com base`)}
        </div>
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Atenção</p><h2>Pontos para decidir hoje</h2></div></div>
          <div class="list">${alerts.map(a => `<div class="list-row"><span>${esc(a.text)}</span><span class="badge ${a.cls}">${a.cls === "bad" ? "crítico" : "atenção"}</span></div>`).join("") || `<div class="note">Nenhum alerta pelas regras atuais.</div>`}</div>
          <h3 style="margin:16px 0 8px">Unidades que mais faturaram</h3>
          <div class="list">${r.units.slice(0, 5).map(u => `<a class="list-row" style="text-decoration:none;color:inherit" href="#/unidades/${encodeURIComponent(u.workId)}/${encodeURIComponent(u.station)}"><span><strong>${esc(u.station)}</strong> <small>· ${fmt.int(u.sessions)} recargas · ocupação ${fmt.pct1(u.occupancy)}</small></span><strong>${fmt.brl(u.revenue)}</strong></a>`).join("")}</div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Gestão de obras</p><h2>Portfólio</h2></div><a class="btn" href="#/obras">Abrir obras →</a></div>
          ${o ? `<div class="grid g3" style="margin-bottom:12px">
            ${kpi("Obras ativas", fmt.int(o.stats.count), `avanço médio ${o.stats.avgPct}% · ${fmt.int(o.stats.kw)} kW`, "", "lead")}
            ${kpi("Alertas de prazo", fmt.int(o.stats.criticalAlerts), "atrasos e entregas vencidas", "", o.stats.criticalAlerts ? "bad" : "")}
            ${kpi("Pendências críticas", fmt.int(critical), "concessionária, compras, materiais e obra elétrica", "", critical ? "warn" : "")}
          </div>
          <div class="list">${o.pipeline.map(p => `<div class="list-row"><span>${esc(p.stage)}</span><strong>${p.count}</strong></div>`).join("")}</div>`
          : `<div class="loading" style="min-height:160px"><div class="spinner"></div><p>Lendo obras…</p></div>`}
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Evolução</p><h2>Receita mensal da operação UBY</h2></div></div><div class="chart-box sm"><canvas id="chResumoMonthly"></canvas></div></section>`;

    UBY.chart("chResumoMonthly", {
      type: "bar",
      data: { labels: r.monthly.map(m => m.label), datasets: [
        { label: "Operação própria (R$)", data: r.monthly.map(m => m.ownRevenue), backgroundColor: "#187457", borderRadius: 4, stack: "r" },
        { label: "Parceiros (R$)", data: r.monthly.map(m => m.revenue - m.ownRevenue), backgroundColor: "#77637d", borderRadius: 4, stack: "r" }
      ] },
      options: UBY.baseChartOptions({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: "#eceee6" } } } })
    });
  }

  UBY.register("resumo", { render });
})();

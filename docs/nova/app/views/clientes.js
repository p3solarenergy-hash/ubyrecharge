/* Clientes — inteligência, ranking, recuperação, coortes, cadastro oficial e Clube UBY. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const TABS = [["visao", "Inteligência"], ["todos", "Todos os clientes"], ["alertas", "Alertas e risco"], ["ranking", "Ranking do período"], ["ausentes", "Recuperação"], ["coortes", "Coortes"], ["cadastro", "Cadastro oficial"]];
  const ui = { search: "", sort: "spent", mask: readMask(), rk: { station: "", from: "", to: "" }, al: { level: "", type: "", site: "", q: "" }, dir: { q: "", sort: "revenue", filter: "", site: "" } };
  let registry = null, registryKey = "";

  function readMask() { try { return localStorage.getItem("uby-nova-mask") === "1"; } catch (_) { return false; } }
  function writeMask(v) { try { localStorage.setItem("uby-nova-mask", v ? "1" : "0"); } catch (_) {} }
  // Modo apresentação: esconde nome, e-mail e telefone sem mudar os números.
  const who = name => ui.mask ? String(name || "").split(/\s+/).map(p => p ? p[0] + "•••" : "").join(" ") : esc(name);
  const contact = v => !v ? "—" : ui.mask ? "•••" : esc(v);

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }

  function head(label, tab, route = "clientes") {
    return `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · ${esc(label)}</p><h1>Clientes</h1>
        <p class="lead">Quem carrega, quem voltou, quem sumiu e quanto vale cada grupo. Só operação UBY; falhas e sessões próximas de zero não contam como cliente atendido.</p></div>
        <div class="callout"><strong>Dados pessoais</strong><small>Visíveis porque você entrou como ${esc(UBY.state.status.user?.role === "admin" ? "administrador" : "usuário autorizado")}. Use o modo apresentação para mostrar a tela sem identificar ninguém.</small></div></div>
      <div class="toolbar"><div class="seg" id="cliTabs">${TABS.map(([id, l]) => `<button data-tab="${id}" class="${tab === id ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span><label><input type="checkbox" id="maskToggle" ${ui.mask ? "checked" : ""}> Modo apresentação</label></div>`;
  }

  function visao(r) {
    const s = r.summary, g = r.signals;
    const signals = [];
    if (g.latest) signals.push({ cls: g.latest.growthPct >= 0 ? "ok" : "warn", t: "Ritmo mais recente", d: `${fmt.brl(g.latest.revenue)} em ${g.latest.label}; ${g.latest.growthPct >= 0 ? "+" : ""}${fmt.pct1(g.latest.growthPct)} frente ao dia anterior.` });
    signals.push(g.hasPrevWeek ? { cls: g.growth >= 0 ? "ok" : "warn", t: "Tendência de 7 dias", d: `${g.growth >= 0 ? "+" : ""}${fmt.pct1(g.growth)}: ${fmt.brl(g.seven)} nos últimos 7 dias contra ${fmt.brl(g.previous)} no período anterior.` }
      : { cls: "neutral", t: "Tendência de 7 dias", d: `${fmt.brl(g.seven)} nos últimos 7 dias. Sem histórico anterior confirmado para comparar.` });
    signals.push({ cls: s.recurrence.pct >= 30 ? "ok" : "neutral", t: "Recorrência", d: `${s.recurrence.recurring} de ${s.recurrence.total} clientes históricos voltaram (${fmt.pct1(s.recurrence.pct)}).` });
    if (g.spottAbsent) signals.push({ cls: "warn", t: "Recuperação de receita", d: `${g.spottAbsent} recorrente(s) Spott ausentes há 7+ dias. Veja a aba Recuperação.` });
    try {
      const w = UBY.data("customerWatch");
      if (w.counts.critico) signals.push({ cls: "warn", t: "Clientes importantes em risco", d: `${w.counts.critico} cliente(s) pesados reduziram ou pararam de carregar. Veja quem são na aba Alertas e risco.` });
    } catch (_) {}
    if (g.failures7) signals.push({ cls: "warn", t: "Operação", d: `${g.failures7} falha(s) nos últimos 7 dias. Confira antes de fazer campanhas.` });

    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Aquisição e retenção</p><h2>Clientes no período</h2></div><div class="meta">Chave do cliente: e-mail, telefone ou nome</div></div>
        <div class="grid g6">
          ${kpi("Clientes atendidos", fmt.int(s.clients), `${fmt.int(s.sessions)} recargas válidas`, "", "lead big")}
          ${kpi("Novos na rede UBY", fmt.int(s.newNetwork), "primeiro uso em toda a rede")}
          ${kpi("Novos nesta estação", fmt.int(s.newStation), "já eram clientes da rede")}
          ${kpi("Usam mais de uma estação", fmt.int(s.multiStation), "ativos do período")}
          ${kpi("Recorrência histórica", fmt.pct1(s.recurrence.pct), `${s.recurrence.recurring} de ${s.recurrence.total} voltaram`)}
          ${kpi("Recorrentes ausentes", fmt.int(s.absentOfficial), `regra Spott · +${s.absent - s.absentOfficial} só na Move para conferir`, "", s.absentOfficial ? "warn" : "")}
        </div>
      </section>
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Leitura automática</p><h2>Sinais da base</h2><p>Só dados registrados; não inventa previsão nem altera o financeiro.</p></div></div>
          <div class="list">${signals.map(x => `<div class="list-row"><span><strong style="color:var(--uby-ink)">${esc(x.t)}</strong><small style="display:block;color:var(--uby-muted);white-space:normal">${esc(x.d)}</small></span><span class="badge ${x.cls}">${x.cls === "warn" ? "ação" : "leitura"}</span></div>`).join("")}</div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Entradas</p><h2>Novos clientes (${r.newClients.length})</h2><p>Onde começou e por onde já passou.</p></div></div>
          <div class="table-wrap" style="max-height:340px"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Trilha</th><th>1ª recarga</th></tr></thead>
            <tbody>${r.newClients.map(n => `<tr><td><strong>${who(n.name)}</strong><small>${contact(n.phone)}</small></td><td><span class="badge ${n.type === "network" ? "ok" : "neutral"}">${n.type === "network" ? "novo na rede" : "novo na estação"}</span></td>
              <td style="white-space:normal">${n.type === "network" ? `começou em ${esc(n.startedAt)}` : `já usava ${esc(n.previous.join(" · ") || "a rede")}; começou em ${esc(n.startedAt)}`}<small>usa: ${esc(n.stations.join(" · "))}</small></td><td>${fmt.dt(n.firstDate)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nenhuma entrada no período.</td></tr>`}</tbody></table></div>
        </section>
      </div>`;
  }

  // Ranking por período (mês do seletor ou datas de/até) e por estação.
  function ranking(r) {
    const max = r.ranking[0]?.revenue || 1, sm = r.summary;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">${esc(r.label)} · ${esc(r.stationLabel)}</p><h2>Ranking de clientes (${r.ranking.length})</h2><p>Ordenado pelo faturamento. Recargas válidas; falhas ficam de fora.${r.byDates ? "" : " Sem datas, vale o mês do seletor no topo."}</p></div></div>
        <div class="toolbar" style="box-shadow:none">
          <select class="select" id="rkStation"><option value="">Rede UBY (sem parceiros)</option>${r.stations.map(x => `<option value="${esc(x.ref)}" ${x.ref === r.station ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
          <label>De <input class="select" type="date" id="rkFrom" value="${esc(ui.rk.from)}"></label>
          <label>Até <input class="select" type="date" id="rkTo" value="${esc(ui.rk.to)}"></label>
          ${ui.rk.from || ui.rk.to ? `<button class="btn" type="button" id="rkClear">Limpar datas</button>` : ""}
          <span class="spacer"></span><small>${fmt.int(sm.clients)} cliente(s) · ${fmt.int(sm.valid)} recargas · ${fmt.brl(sm.revenue)}</small></div>
        <div class="table-wrap" style="max-height:640px"><table><thead><tr><th>#</th><th>Cliente</th><th>Estações</th><th class="num">Recargas</th><th class="num">Histórico</th><th class="num">Energia</th><th>Faturamento</th><th class="num">Ticket</th><th class="num">R$/kWh</th><th>Última</th></tr></thead>
          <tbody>${r.ranking.map((c, i) => `<tr><td>${i + 1}</td><td><strong>${who(c.name)}</strong><small>${contact(c.email || c.phone)}</small></td><td>${esc(c.stations.join(" · "))}</td>
            <td class="num">${c.valid}</td><td class="num">${c.historySessions}${c.historySessions > 1 ? ' <span class="badge ok">recorrente</span>' : ""}</td><td class="num">${fmt.kwh(c.energy)}</td>
            <td style="min-width:170px"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${fmt.brl(c.revenue)}</strong><small>${fmt.pct1(c.share)}</small></div><div class="bar"><span style="width:${c.revenue / max * 100}%"></span></div></td>
            <td class="num">${fmt.brl(c.ticket)}</td><td class="num">${fmt.brl(c.perKwh)}</td><td>${fmt.dt(c.last)}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">Sem clientes no período.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function ausentes(r) {
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Recuperação de receita</p><h2>Recorrentes ausentes há 7+ dias</h2><p>Clientes com 2 ou mais recargas válidas que não voltam há pelo menos 7 dias, contados da última recarga da rede. Ordenados pelo faturamento histórico: é o valor em risco.</p></div>
          <div class="meta">${fmt.brl(r.summary.absentRevenue)} de histórico</div></div>
        <div class="grid g2" style="margin-bottom:12px">
          ${kpi("Regra oficial (somente Spott)", fmt.int(r.summary.absentOfficial), `${fmt.int(r.summary.spottSessions)} de ${fmt.int(r.summary.historySessions)} sessões reconhecidas como Spott`, "", "lead")}
          ${kpi("Só pela Move / outras plataformas", fmt.int(r.absent.length - r.summary.absentOfficial), "podem ser falso ausente: mesmo cliente com outro cadastro", "", "warn")}
        </div>
        ${r.summary.spottSessions === 0 && r.summary.historySessions ? `<div class="note" style="margin-bottom:12px"><strong>Atenção:</strong> a plataforma identifica o Spott pelos arquivos importados no próprio navegador. Com os dados lidos do Supabase essa informação não vem, então a regra oficial sempre dá 0, inclusive na plataforma publicada. A lista abaixo é a ampliada; confira duplicidades antes de acionar.</div>` : ""}
        <div class="table-wrap" style="max-height:640px"><table><thead><tr><th>Cliente</th><th>Estação</th><th class="num">Dias ausente</th><th class="num">Recargas</th><th class="num">Faturamento histórico</th><th class="num">Ticket médio</th><th class="num">kWh médio</th><th>Última recarga</th></tr></thead>
          <tbody>${r.absent.slice().sort((a, b) => (b.official - a.official)).map(a => `<tr class="${a.official ? "" : "muted"}"><td><strong>${who(a.name)}</strong>${a.official ? "" : ' <span class="badge warn">conferir</span>'}<small>${contact(a.email)}</small></td><td>${esc(a.station)}</td><td class="num"><span class="badge ${a.daysAbsent > 21 ? "bad" : "warn"}">${a.daysAbsent} dias</span></td>
            <td class="num">${a.sessions}</td><td class="num"><strong>${fmt.brl(a.revenue)}</strong></td><td class="num">${fmt.brl(a.avgTicket)}</td><td class="num">${fmt.n1(a.avgKwh)} kWh</td><td>${fmt.dt(a.lastDate)}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum recorrente ausente.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function coortes(r) {
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Coortes mensais</p><h2>Novos clientes e retorno por mês de entrada</h2><p>O cliente entra no mês da primeira recarga válida e vira recorrente quando faz outra recarga depois. Usa todo o histórico salvo, não só o filtro.</p></div></div>
        <div class="grid g2" style="gap:18px">
          <div class="table-wrap"><table><thead><tr><th>Mês de entrada</th><th class="num">Novos</th><th class="num">Voltaram</th><th>Taxa de retorno</th><th class="num">Sem retorno</th><th class="num">1ª recarga (R$)</th></tr></thead>
            <tbody>${r.cohorts.map(c => `<tr><td><strong>${esc(c.label)}</strong></td><td class="num">${c.newClients}</td><td class="num">${c.recurring}</td>
              <td style="min-width:150px"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><span style="width:${c.rate}%"></span></div><strong>${fmt.pct1(c.rate)}</strong></div></td>
              <td class="num">${c.newClients - c.recurring}</td><td class="num">${fmt.brl(c.firstRevenue)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Sem histórico suficiente.</td></tr>`}</tbody></table></div>
          <div class="chart-box"><canvas id="chCohorts"></canvas></div>
        </div>
      </section>`;
  }

  // ---------------------------------------------------------------------
  // Alertas e risco: quem reduziu ou parou de carregar, tendência por carregador,
  // segmentos e clientes-chave. Contas em app/analytics-core.js (motor: customerWatch).
  // O valor em risco é mostrado em receita E em margem: a margem por kWh muda muito de
  // um carregador para outro (energia, área, impostos), então o mesmo cliente vale
  // coisas bem diferentes dependendo de onde carrega.
  // ---------------------------------------------------------------------
  const SEG = { frequente: ["ok", "Frequente"], regular: ["neutral", "Regular"], ocasional: ["neutral", "Ocasional"], unico: ["neutral", "Único"] };
  const LV = { critico: ["bad", "Urgente"], atencao: ["warn", "Atenção"], info: ["neutral", "Informativo"] };
  const TYPE = { queda: "Consumo caiu", sumiu: "Sumiu", perdido: "Parado" };

  function watchData() {
    let w;
    try { w = UBY.data("customerWatch"); } catch (err) { return { error: err.message }; }
    let pb = null;
    try { pb = UBY.data("pricingBase"); } catch (_) {}
    const core = window.UBY_ANALYTICS_CORE, margin = {};
    (pb?.sites || []).forEach(s => { margin[s.site] = core.margin(s.params, s.params.price); });
    return { w, pb, margin };
  }
  const marginAtRisk = (a, margin) => margin[a.site] === undefined ? null : a.kwhAtRisk * margin[a.site];
  const filteredAlerts = (w) => w.alerts.filter(a => (!ui.al.level || a.level === ui.al.level) && (!ui.al.type || a.type === ui.al.type) && (!ui.al.site || a.site === ui.al.site)
    && (!ui.al.q || `${a.name} ${a.email} ${a.phone}`.toLowerCase().includes(ui.al.q.trim().toLowerCase())));

  function alertas(wd) {
    if (wd.error) return `<section class="section"><div class="note">Não foi possível calcular os alertas: ${esc(wd.error)}</div></section>`;
    const { w, margin } = wd;
    const list = filteredAlerts(w), act = w.alerts.filter(a => a.level !== "info" && a.type !== "perdido");
    const revRisk = act.reduce((s, a) => s + a.monthlyValue, 0);
    const marRisk = act.reduce((s, a) => { const m = marginAtRisk(a, margin); return s + (m === null ? 0 : m); }, 0);
    const sites = [...new Set(w.alerts.map(a => a.site))].sort();
    const c = w.settings;
    const sel = (id, label, opts, cur) => `<select class="select" id="${id}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const trend = p => p === null || p === undefined ? "—" : `<span class="badge ${p <= -25 ? "bad" : p <= -10 ? "warn" : p >= 10 ? "ok" : "neutral"}">${p >= 0 ? "+" : ""}${fmt.pct1(p)}</span>`;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Clientes e carregadores</p><h2>O que pede ação agora</h2>
          <p>Calculado sobre a última recarga importada (${esc(fmt.dt(w.asOf))}), não sobre o relógio: se a planilha atrasar, ninguém aparece como sumido por isso. Só operação UBY, sem parceiros.</p></div>
          <div class="meta">${fmt.int(w.totals.clients)} clientes · ${fmt.int(w.totals.active30)} ativos em 30 dias</div></div>
        <div class="grid g6">
          ${kpi("Urgentes", fmt.int(w.counts.critico), "clientes importantes que caíram ou sumiram", "", w.counts.critico ? "warn" : "lead")}
          ${kpi("Atenção", fmt.int(w.counts.atencao), "queda menor ou ausência moderada")}
          ${kpi("Receita mensal em risco", fmt.brl0(revRisk), "urgentes + atenção")}
          ${kpi("Margem mensal em risco", marRisk ? fmt.brl0(marRisk) : "—", "kWh em risco × margem do carregador", "", "")}
          ${kpi(`Top ${w.concentration.top} clientes`, fmt.pct1(w.concentration.pct), `da receita dos últimos 30 dias`, "", w.concentration.warn ? "warn" : "")}
          ${kpi("Novos sem 2ª recarga", fmt.int(w.totals.newNoReturn), "1ª recarga há 14 a 45 dias")}
        </div>
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Carregadores</p><h2>Energia vendida por semana</h2><p>Últimas 8 semanas até a última recarga importada.</p></div></div>
          <div class="chart-box" style="height:260px"><canvas id="chSiteWeekly"></canvas></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Tendência de 28 dias</p><h2>Cada carregador contra as 4 semanas anteriores</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Carregador</th><th class="num">kWh (28 d)</th><th class="num">Anteriores</th><th class="num">Variação</th><th>Leitura</th></tr></thead>
            <tbody>${w.sites.map(s => `<tr><td><strong>${esc(s.site)}</strong><small>${s.ageDays} dias de operação</small></td><td class="num">${fmt.kwh0(s.kwh28)}</td><td class="num">${fmt.kwh0(s.kwhPrev28)}</td><td class="num">${trend(s.changePct)}</td>
              <td>${!s.mature ? `<span class="badge neutral">novo · sem alerta</span>` : s.level === "critico" ? `<span class="badge bad">queda forte</span>` : s.level === "atencao" ? `<span class="badge warn">queda</span>` : `<span class="badge ok">estável ou subindo</span>`}</td></tr>`).join("")}</tbody></table></div>
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Lista de ação</p><h2>Clientes que reduziram ou pararam (${fmt.int(list.length)})</h2>
          <p><strong>Consumo caiu</strong>: carregou menos de ${100 - c.dropPct}% do que carregava nos 30 dias anteriores (queda de ${c.dropPct}% ou mais, com pelo menos ${c.dropMinBaseKwh} kWh antes). <strong>Sumiu</strong>: está ausente há mais de ${c.gapFactor}× o intervalo normal dele (mínimo ${c.gapMinDays} dias). Urgente = cliente pesado (${c.heavyKwh}+ kWh/mês) com queda de ${c.dropCriticalPct}% ou mais, ou R$ ${c.valueUrgent}+ por mês.</p></div></div>
        <div class="toolbar" style="box-shadow:none">
          ${sel("alLevel", "Todos os níveis", [["critico", "Urgente"], ["atencao", "Atenção"], ["info", "Informativo"]], ui.al.level)}
          ${sel("alType", "Todos os tipos", Object.entries(TYPE), ui.al.type)}
          ${sel("alSite", "Todos os carregadores", sites.map(s => [s, s]), ui.al.site)}
          <input class="search" id="alSearch" placeholder="Buscar nome, e-mail ou telefone" value="${esc(ui.al.q)}">
          <span class="spacer"></span><button class="btn" type="button" id="alCsv" ${list.length ? "" : "disabled"}>Baixar lista (CSV)</button></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Cliente</th><th>Carregador</th><th>Perfil</th><th>Situação</th><th>Última recarga</th><th class="num">Preço pago</th><th class="num">Receita/mês em risco</th><th class="num">Margem/mês em risco</th></tr></thead>
          <tbody>${list.slice(0, 120).map(a => { const m = marginAtRisk(a, margin); return `<tr><td><strong>${who(a.name)}</strong><small>${contact(a.phone || a.email)}</small></td><td>${esc(a.site)}</td>
            <td><span class="badge ${SEG[a.segment][0]}">${SEG[a.segment][1]}</span></td>
            <td style="white-space:normal;min-width:260px"><span class="badge ${LV[a.level][0]}">${LV[a.level][1]}</span> <strong>${esc(a.title)}</strong><small style="display:block;white-space:normal">${esc(a.reason)}</small><small style="display:block;white-space:normal">${esc(a.suggest)}</small></td>
            <td>${fmt.date(a.lastT)}<small>${a.daysSince} dia(s)</small></td><td class="num">${fmt.brl(a.pricePaid)}<small>${Math.round(a.voucherShare * 100)}% com cupom</small></td>
            <td class="num"><strong>${fmt.brl(a.monthlyValue)}</strong></td><td class="num">${m === null ? "—" : fmt.brl(m)}</td></tr>`; }).join("") || `<tr><td colspan="8" class="empty">Nenhum cliente com esse filtro.</td></tr>`}</tbody></table></div>
        ${list.length > 120 ? `<small>Mostrando 120 de ${list.length}; o CSV leva a lista inteira do filtro.</small>` : ""}
        <div class="note" style="margin-top:10px">A <strong>margem</strong> usa o resultado por kWh de cada carregador no último mês completo (energia, área, plataforma, gestão e impostos). Onde a margem é pequena, perder um cliente dói na receita mais do que no resultado: por isso a lista mostra as duas. Detalhes e simulações em <a href="#/precos">Estudos de preço</a>.</div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Segmentos</p><h2>Quem são e quanto valem</h2><p>Pelo histórico de recargas válidas: frequente ${c.frequentSessions}+, regular ${c.regularSessions}–${c.frequentSessions - 1}, ocasional ${c.occasionalSessions}–${c.regularSessions - 1}, único 1.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Perfil</th><th class="num">Clientes</th><th class="num">Ativos em 30 d</th><th class="num">% da receita</th><th class="num">R$/kWh pago</th><th class="num">Uso de cupom</th><th class="num">kWh 30 d</th><th class="num">kWh 30 d anteriores</th><th class="num">Variação</th></tr></thead>
          <tbody>${w.segments.map(s => `<tr><td><span class="badge ${SEG[s.id][0]}">${SEG[s.id][1]}</span></td><td class="num">${fmt.int(s.clients)}</td><td class="num">${fmt.int(s.active30)}</td><td class="num">${fmt.pct1(s.revenueShare)}</td>
            <td class="num">${fmt.brl(s.pricePaid)}</td><td class="num">${fmt.pct1(s.voucherShare)}</td><td class="num">${fmt.kwh0(s.kwh30)}</td><td class="num">${fmt.kwh0(s.kwhP30)}</td><td class="num">${trend(s.kwhP30 ? (s.kwh30 / s.kwhP30 - 1) * 100 : null)}</td></tr>`).join("")}</tbody></table></div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Clientes-chave</p><h2>Maiores receitas dos últimos 90 dias</h2><p>Mesmos critérios dos alertas; quem não aparece na lista acima está dentro do normal dele.</p></div></div>
        <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>#</th><th>Cliente</th><th>Carregador</th><th>Perfil</th><th class="num">Receita 90 d</th><th class="num">kWh 30 d</th><th class="num">Variação</th><th class="num">R$/kWh</th><th class="num">Cupom</th><th>Última</th></tr></thead>
          <tbody>${w.keyClients.map((k, i) => `<tr><td>${i + 1}</td><td><strong>${who(k.name)}</strong><small>${contact(k.phone || k.email)}</small></td><td>${esc(k.site)}</td><td><span class="badge ${SEG[k.segment][0]}">${SEG[k.segment][1]}</span></td>
            <td class="num"><strong>${fmt.brl(k.revenue90)}</strong></td><td class="num">${fmt.kwh0(k.kwh30)}</td><td class="num">${trend(k.trendPct)}</td><td class="num">${fmt.brl(k.pricePaid)}</td><td class="num">${fmt.pct1(k.voucherShare * 100)}</td><td>${k.daysSince} d</td></tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  function alertasCsv(wd) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Cliente", "Telefone", "E-mail", "Carregador", "Perfil", "Nível", "Situação", "Detalhe", "Última recarga", "Dias sem recarga", "R$/kWh pago", "Receita/mês em risco", "Margem/mês em risco"];
    const rows = filteredAlerts(wd.w).map(a => { const m = marginAtRisk(a, wd.margin);
      return [a.name, a.phone, a.email, a.site, SEG[a.segment][1], LV[a.level][1], a.title, a.reason, new Date(a.lastT).toLocaleDateString("pt-BR"), a.daysSince,
        a.pricePaid.toFixed(2).replace(".", ","), a.monthlyValue.toFixed(2).replace(".", ","), m === null ? "" : m.toFixed(2).replace(".", ",")]; });
    const blob = new Blob(["﻿" + [head, ...rows].map(r => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `alertas-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------------------------------------------------------------------
  // Todos os clientes: busca em toda a base e ficha detalhada de cada um.
  // Base: recargas importadas da operação UBY (sem parceiros), atualizadas a cada
  // importação (robô da Spott, Move, Raio ou planilha). Não depende do cadastro.
  // ---------------------------------------------------------------------
  const DIR_FILTERS = [["", "Todos"], ["ativos", "Ativos (30 dias)"], ["novos", "Novos (30 dias)"], ["queda", "Em queda"], ["parados", "Sem recarga há 30+ dias"], ["unico", "Só 1 recarga"]];
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const asOfMs = d => Date.parse(d.asOf || "") || Date.now();
  const trendBadge = p => p === null || p === undefined ? `<span class="badge neutral">sem base</span>` : `<span class="badge ${p <= -25 ? "bad" : p <= -10 ? "warn" : p >= 10 ? "ok" : "neutral"}">${p >= 0 ? "+" : ""}${fmt.pct1(p)}</span>`;
  const daysBadge = d => d === null ? "—" : `<span class="badge ${d <= 7 ? "ok" : d <= 21 ? "neutral" : d <= 45 ? "warn" : "bad"}">${d === 0 ? "hoje" : d === 1 ? "1 dia" : `${d} dias`}</span>`;

  function dirFiltered(d) {
    const q = ui.dir.q.trim().toLowerCase(), qd = q.replace(/\D/g, ""), now = asOfMs(d), f = ui.dir.filter;
    return d.list.filter(c => {
      if (q && !(`${c.name} ${c.email}`.toLowerCase().includes(q) || (qd.length >= 4 && String(c.phone || "").replace(/\D/g, "").includes(qd)))) return false;
      if (ui.dir.site && !c.sites.includes(ui.dir.site)) return false;
      if (f === "ativos") return c.n30 > 0;
      if (f === "novos") return c.first && now - Date.parse(c.first) < 30 * 86400000;
      if (f === "queda") return c.trendPct !== null && c.trendPct <= -25;
      if (f === "parados") return c.daysSince !== null && c.daysSince >= 30;
      if (f === "unico") return c.valid === 1;
      return true;
    }).sort((a, b) => ui.dir.sort === "name" ? String(a.name).localeCompare(String(b.name), "pt-BR")
      : ui.dir.sort === "last" ? String(b.last).localeCompare(String(a.last))
      : ui.dir.sort === "kwh30" ? b.kwh30 - a.kwh30 : ui.dir.sort === "valid" ? b.valid - a.valid : b.revenue - a.revenue);
  }

  function todos(d) {
    const list = dirFiltered(d), sites = [...new Set(d.list.flatMap(c => c.sites))].sort();
    const active = d.list.filter(c => c.n30 > 0).length, stopped = d.list.filter(c => c.daysSince !== null && c.daysSince >= 30).length;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Base completa · operação UBY</p><h2>Todos os clientes (${fmt.int(d.list.length)})</h2>
          <p>Busque qualquer cliente e clique para abrir a ficha: quando foi, onde carrega, como está o uso nos últimos dias, intervalo entre recargas e todas as recargas. Atualiza sozinho a cada importação de recargas (robô da Spott, Move, Raio ou planilha); o cadastro de motoristas só completa contato.</p></div>
          <div class="meta">última recarga importada ${esc(fmt.dt(d.asOf))}</div></div>
        <div class="grid g4" style="margin-bottom:12px">
          ${kpi("Clientes na base", fmt.int(d.list.length), "com pelo menos 1 recarga válida", "", "lead")}
          ${kpi("Ativos em 30 dias", fmt.int(active), `${fmt.pct1(d.list.length ? active / d.list.length * 100 : 0)} da base`)}
          ${kpi("Sem recarga há 30+ dias", fmt.int(stopped), "contando da última recarga importada", "", stopped ? "warn" : "")}
          ${kpi("Mostrando", fmt.int(list.length), "com a busca e os filtros")}
        </div>
        <div class="toolbar" style="box-shadow:none">
          <input class="search" id="dirSearch" placeholder="Buscar nome, e-mail ou telefone" value="${esc(ui.dir.q)}" style="min-width:240px">
          <select class="select" id="dirFilter">${DIR_FILTERS.map(([v, l]) => `<option value="${v}" ${ui.dir.filter === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <select class="select" id="dirSite"><option value="">Todos os carregadores</option>${sites.map(s => `<option value="${esc(s)}" ${ui.dir.site === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
          <select class="select" id="dirSort">${[["revenue", "Maior faturamento"], ["kwh30", "Mais kWh em 30 dias"], ["valid", "Mais recargas"], ["last", "Recarga mais recente"], ["name", "Nome"]].map(([v, l]) => `<option value="${v}" ${ui.dir.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        </div>
        <div class="table-wrap" style="max-height:680px"><table><thead><tr><th>Cliente</th><th>Carregadores</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Faturamento</th><th class="num">kWh 30 d</th><th class="num">vs 30 d antes</th><th>Última recarga</th></tr></thead>
          <tbody>${list.slice(0, 600).map(c => `<tr class="click-row" data-key="${esc(c.key)}" style="cursor:pointer" title="Abrir ficha do cliente"><td><strong>${who(c.name)}</strong><small>${contact(c.phone || c.email)}</small></td>
            <td>${esc(c.sites.join(" · ") || "—")}</td><td class="num">${fmt.int(c.valid)}</td><td class="num">${fmt.kwh(c.energy)}</td><td class="num"><strong>${fmt.brl(c.revenue)}</strong></td>
            <td class="num">${fmt.kwh0(c.kwh30)}<small>${c.n30} recarga(s)</small></td><td class="num">${trendBadge(c.trendPct)}</td><td>${fmt.dt(c.last)}<small>${daysBadge(c.daysSince)}</small></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum cliente com essa busca.</td></tr>`}</tbody></table></div>
        ${list.length > 600 ? `<small>Mostrando 600 de ${fmt.int(list.length)}. Refine a busca para achar quem falta.</small>` : ""}
      </section>`;
  }

  function ficha(p) {
    if (!p) return `<section class="section"><div class="note">Cliente não encontrado nas recargas da operação UBY. <a href="#/clientes/todos">Voltar para a lista</a></div></section>`;
    const t = p.totals, w = p.windows, now = Date.parse(p.asOf);
    const typical = p.interval.median;
    const nextT = typical && p.last ? Date.parse(p.last) + typical * 86400000 : null;
    const late = nextT && now > nextT ? Math.floor((now - nextT) / 86400000) : 0;
    const status = p.daysSince === null ? ["neutral", "Sem recarga válida"]
      : t.valid === 1 ? (p.daysSince <= 14 ? ["ok", "Novo, 1ª recarga"] : ["warn", "Fez só 1 recarga"])
      : typical && p.daysSince > Math.max(typical * 3, 14) ? ["bad", "Parou de carregar"]
      : typical && p.daysSince > Math.max(typical * 1.5, 7) ? ["warn", "Atrasado para o normal dele"]
      : ["ok", "Carregando no ritmo normal"];
    const al = p.watch?.alert;
    const chg = (a, b) => b > 0 ? (a / b - 1) * 100 : null;
    const day = iso => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
    const hourTop = p.hours.map((n, h) => [h, n]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${String(h).padStart(2, "0")}h`).join(", ");
    const dowTop = p.dows.map((n, i) => [i, n]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i]) => DOW[i]).join(" e ");
    return `
      <div class="toolbar" style="box-shadow:none;margin-bottom:10px"><button class="btn" id="fichaBack" type="button">← Todos os clientes</button><span class="spacer"></span><small>dados até a última recarga importada (${esc(fmt.dt(p.asOf))})</small></div>
      <section class="section"><div class="section-head"><div><p class="kicker">Ficha do cliente</p><h2>${who(p.name)}</h2>
          <p>${contact(p.phone)} · ${contact(p.email)}</p>
          <p><span class="badge ${status[0]}">${esc(status[1])}</span> ${al ? `<span class="badge ${al.level === "critico" ? "bad" : al.level === "atencao" ? "warn" : "neutral"}">${esc(al.title)}</span>` : ""} ${p.watch?.key ? `<span class="badge ok">cliente-chave (top 90 dias)</span>` : ""}</p>
          ${al ? `<p style="white-space:normal"><small>${esc(al.reason)} ${esc(al.suggest || "")}</small></p>` : ""}</div>
          <div class="meta">cliente desde ${day(p.first)}</div></div>
        <div class="grid g6">
          ${kpi("Última recarga", day(p.last), `${p.daysSince === 0 ? "hoje" : `há ${p.daysSince} dia(s)`} · ${esc(p.lastSite)}`, "", "lead big")}
          ${kpi("Intervalo típico", typical ? `${fmt.n1(typical)} dias` : "—", typical ? (late ? `devia ter voltado há ${late} dia(s)` : `próxima esperada ~${day(new Date(nextT).toISOString())}`) : "precisa de 2+ recargas", "", late > 3 ? "warn" : "")}
          ${kpi("Recargas válidas", fmt.int(t.valid), `${t.failed ? `${t.failed} falha(s) ou não concluída(s)` : "nenhuma falha"}`)}
          ${kpi("Energia total", fmt.kwh(t.energy), `${fmt.n1(t.kwhPerSession)} kWh por recarga`)}
          ${kpi("Faturamento total", fmt.brl(t.revenue), `ticket médio ${fmt.brl(t.ticket)}`)}
          ${kpi("R$/kWh médio pago", t.perKwh === null ? "—" : fmt.brl(t.perKwh), `${fmt.pct1(t.voucherShare * 100)} das recargas com cupom`)}
        </div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Uso recente</p><h2>Como está a utilização</h2><p>Janelas contadas a partir da última recarga importada da rede.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Janela</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Faturamento</th><th class="num">kWh por semana</th></tr></thead><tbody>
          ${[["Últimos 7 dias", w.d7, 7], ["Últimos 30 dias", w.d30, 30], ["30 dias anteriores (31 a 60)", w.p30, 30], ["Últimos 90 dias", w.d90, 90]].map(([l, x, n]) => `<tr><td><strong>${l}</strong></td><td class="num">${x.n}</td><td class="num">${fmt.kwh(x.kwh)}</td><td class="num">${fmt.brl(x.revenue)}</td><td class="num">${fmt.n1(x.kwh / n * 7)} kWh</td></tr>`).join("")}
          <tr><td><strong>Variação 30 dias × 30 anteriores</strong></td><td class="num">${trendBadge(chg(w.d30.n, w.p30.n))}</td><td class="num">${trendBadge(chg(w.d30.kwh, w.p30.kwh))}</td><td class="num">${trendBadge(chg(w.d30.revenue, w.p30.revenue))}</td><td></td></tr>
        </tbody></table></div>
        <div class="chart-box" style="height:240px;margin-top:14px"><canvas id="chCliDaily"></canvas></div>
        <small>Energia por dia nos últimos 90 dias. ${hourTop ? `Costuma carregar por volta de ${hourTop}` : ""}${dowTop ? `, mais em ${dowTop}` : ""}.</small>
      </section>
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Histórico</p><h2>Mês a mês</h2></div></div>
          <div class="chart-box" style="height:220px"><canvas id="chCliMonthly"></canvas></div>
          <div class="table-wrap" style="max-height:240px;margin-top:10px"><table><thead><tr><th>Mês</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Faturamento</th></tr></thead>
            <tbody>${p.monthly.slice().reverse().map(m => `<tr><td>${esc(m.label)}</td><td class="num">${m.n}</td><td class="num">${fmt.kwh(m.kwh)}</td><td class="num">${fmt.brl(m.revenue)}</td></tr>`).join("")}</tbody></table></div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Onde e como</p><h2>Carregadores, horários e pagamento</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Carregador</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Faturamento</th><th>Última</th></tr></thead>
            <tbody>${p.bySite.map(s => `<tr><td><strong>${esc(s.site)}</strong></td><td class="num">${s.n}</td><td class="num">${fmt.kwh(s.kwh)}</td><td class="num">${fmt.brl(s.revenue)}</td><td>${day(s.last)}</td></tr>`).join("")}</tbody></table></div>
          <div class="chart-box" style="height:170px;margin-top:12px"><canvas id="chCliHours"></canvas></div>
          <div class="list" style="margin-top:10px">
            <div class="list-row"><span>Forma de pagamento</span><span>${esc(p.methods.map(m => `${m.label} (${m.n})`).join(" · ") || "não informado")}</span></div>
            <div class="list-row"><span>Veículo</span><span>${esc(p.vehicles.map(v => `${v.label} (${v.n})`).join(" · ") || "não informado")}</span></div>
            <div class="list-row"><span>Dias da semana</span><span>${p.dows.map((n, i) => `${DOW[i]} ${n}`).join(" · ")}</span></div>
            <div class="list-row"><span>Tempo total carregando</span><span>${fmt.n1(t.hours)} h</span></div>
          </div>
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Recarga a recarga</p><h2>Todas as recargas (${fmt.int(p.sessionsTotal)})</h2></div></div>
        <div class="table-wrap" style="max-height:560px"><table><thead><tr><th>Data</th><th>Carregador</th><th>Duração</th><th class="num">Energia</th><th class="num">Valor</th><th class="num">R$/kWh</th><th>Pagamento</th><th>Cupom</th><th>Situação</th></tr></thead>
          <tbody>${p.sessions.map(s => `<tr class="${s.valid ? "" : "muted"}"><td>${fmt.dt(s.start)}</td><td>${esc(s.site)}${s.connector ? `<small>${esc(s.connector)}</small>` : ""}</td><td>${esc(s.duration || "—")}</td>
            <td class="num">${fmt.kwh(s.energy)}</td><td class="num">${fmt.brl(s.revenue)}</td><td class="num">${s.perKwh === null ? "—" : fmt.brl(s.perKwh)}</td>
            <td>${esc(s.method || s.app || "—")}${s.trigger ? `<small>${esc(s.trigger)}</small>` : ""}</td><td>${esc(s.voucher || "—")}</td><td>${s.valid ? `<span class="badge ok">válida</span>` : `<span class="badge warn">${esc(s.status || "não concluída")}</span>`}</td></tr>`).join("")}</tbody></table></div>
        ${p.sessionsTotal > p.sessions.length ? `<small>Mostrando as ${p.sessions.length} mais recentes.</small>` : ""}
      </section>`;
  }

  function fichaCharts(p) {
    if (!p) return;
    const green = UBY.PALETTE[0], blue = UBY.PALETTE[1];
    const lbl = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    UBY.chart("chCliDaily", { type: "line", data: { labels: p.daily.map(x => lbl(x.day)), datasets: [
      { label: "kWh no dia", data: p.daily.map(x => +x.kwh.toFixed(2)), borderColor: green, backgroundColor: green + "26", fill: true, tension: 0.42, pointRadius: 0, borderWidth: 2 }] },
      options: UBY.baseChartOptions({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { callback: v => `${v} kWh` } } } }) });
    UBY.chart("chCliMonthly", { type: "line", data: { labels: p.monthly.map(m => m.label), datasets: [
      { label: "kWh", data: p.monthly.map(m => +m.kwh.toFixed(1)), borderColor: green, backgroundColor: green + "26", fill: true, tension: 0.42, pointRadius: 3, borderWidth: 2, yAxisID: "y" },
      { label: "Recargas", data: p.monthly.map(m => m.n), borderColor: blue, backgroundColor: "transparent", tension: 0.42, pointRadius: 3, borderWidth: 2, yAxisID: "y1" }] },
      options: UBY.baseChartOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => `${v} kWh` } }, y1: { beginAtZero: true, position: "right", grid: { display: false }, ticks: { precision: 0 } } } }) });
    UBY.chart("chCliHours", { type: "line", data: { labels: p.hours.map((_, h) => `${String(h).padStart(2, "0")}h`), datasets: [
      { label: "Recargas por hora de início", data: p.hours, borderColor: blue, backgroundColor: blue + "26", fill: true, tension: 0.42, pointRadius: 0, borderWidth: 2 }] },
      options: UBY.baseChartOptions({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }) });
  }

  function cadastro(target) {
    if (!registry) return `<section class="section"><div class="loading" style="min-height:180px"><div class="spinner"></div><p>Lendo recharge_customers no Supabase…</p></div></section>`;
    if (registry.error) return `<section class="section"><div class="note">Não foi possível ler o cadastro: ${esc(registry.error)}</div></section>`;
    const q = ui.search.trim().toLowerCase();
    const rows = registry.rows.filter(r => !q || `${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(q)).sort((a, b) =>
      ui.sort === "name" ? String(a.name).localeCompare(String(b.name), "pt-BR") : Number(b[ui.sort] || 0) - Number(a[ui.sort] || 0));
    const live = registry.rows.filter(r => r.status !== "cadastro");
    const tot = live.reduce((a, r) => ({ transactions: a.transactions + r.transactions, energy: a.energy + r.energy, spent: a.spent + r.spent }), { transactions: 0, energy: 0, spent: 0 });
    const onlyReg = registry.rows.length - live.length, noReg = registry.rows.filter(r => r.status === "sem-cadastro").length;
    const united = (registry.rawRows || 0) - (registry.rows.length - noReg);
    const tag = r => r.status === "cadastro" ? ' <span class="badge neutral">só no cadastro</span>' : r.status === "sem-cadastro" ? ' <span class="badge warn">sem cadastro</span>' : "";
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Base oficial · recharge_customers</p><h2>Cadastro geral de clientes</h2><p>Uma linha por pessoa (cadastros repetidos por e-mail, telefone ou nome são unidos). Recargas, energia, tempo e gasto vêm das planilhas importadas da operação UBY, sem parceiros. Quem não tem recarga nelas mostra o retrato antigo do cadastro. Importações novas: <a href="#/importar">Importar planilhas</a>.</p></div><div class="meta">cadastro atualizado ${fmt.dt(registry.updatedAt)}</div></div>
        <div class="grid g4" style="margin-bottom:14px">
          ${kpi("Clientes", fmt.int(registry.rows.length), `${fmt.int(united)} linha(s) repetida(s) unida(s) · ${fmt.int(noReg)} sem cadastro`, "", "lead")}
          ${kpi("Recargas válidas", fmt.int(tot.transactions), `soma das planilhas · ${fmt.int(live.length)} clientes`)}
          ${kpi("Energia", fmt.kwh0(tot.energy), "soma das planilhas", "", "warn")}
          ${kpi("Total gasto", fmt.brl(tot.spent), `${fmt.int(onlyReg)} só no cadastro fora da soma`)}
        </div>
        <div class="toolbar" style="box-shadow:none"><input class="search" id="regSearch" placeholder="Buscar nome, e-mail ou telefone" value="${esc(ui.search)}">
          <select class="select" id="regSort">${[["spent", "Maior gasto"], ["transactions", "Mais transações"], ["energy", "Mais energia"], ["name", "Nome"]].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <span class="spacer"></span><small>${rows.length} de ${registry.rows.length}</small></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Carregadores</th><th class="num">Recargas</th><th class="num">Energia</th><th>Tempo</th><th class="num">Total gasto</th></tr></thead>
          <tbody>${rows.slice(0, 800).map(r => `<tr class="${r.status === "cadastro" ? "muted" : ""}"><td><strong>${who(r.name || "—")}</strong>${tag(r)}${r.complement ? `<small>${esc(r.complement)}</small>` : ""}</td><td>${contact(r.phoneDisplay || r.phone)}</td><td>${contact(r.email)}</td>
            <td>${esc((r.stations || []).join(" · ") || String(r.chargers || "—"))}${r.last ? `<small>última ${fmt.dt(r.last)}</small>` : ""}</td><td class="num">${r.transactions}</td><td class="num">${fmt.kwh(r.energy)}</td><td>${esc(r.chargeTime || "—")}</td><td class="num"><strong>${fmt.brl(r.spent)}</strong></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum cliente encontrado.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function render(target, params) {
    const tab = TABS.some(([id]) => id === params[0]) ? params[0] : "visao";
    // Busca geral (Ctrl+K): #/clientes/cadastro/<nome> abre o cadastro já filtrado.
    if (tab === "cadastro" && params[1] && params[1] !== ui.searchFrom) { ui.search = params[1]; ui.searchFrom = params[1]; }
    const r = UBY.data("clientIntelligence", monthArg());
    let body = "";
    let wd = null, prof = null;
    if (tab === "todos" && params[1]) { prof = UBY.data("customerProfile", params[1]); body = ficha(prof); }
    else if (tab === "todos") body = todos(UBY.data("customerDirectory"));
    else if (tab === "visao") body = visao(r);
    else if (tab === "alertas") { wd = watchData(); body = alertas(wd); }
    else if (tab === "ranking") body = ranking(UBY.data("clientRanking", monthArg(), ui.rk.from, ui.rk.to, ui.rk.station));
    else if (tab === "ausentes") body = ausentes(r);
    else if (tab === "coortes") body = coortes(r);
    else if (tab === "cadastro") {
      const key = UBY.state.status.loadedAt;
      if (registryKey !== key) {
        registryKey = key; registry = null;
        UBY.state.api.customerRegistry().then(res => { registry = res; }).catch(err => { registry = { error: err.message }; })
          .finally(() => { if (location.hash.startsWith("#/clientes/cadastro")) render(target, ["cadastro"]); });
      }
      body = cadastro(target);
    }
    target.innerHTML = head(r.period.label, tab) + body;
    target.querySelectorAll("#cliTabs button").forEach(b => b.onclick = () => UBY.go(`#/clientes/${b.dataset.tab}`));
    target.querySelector("#maskToggle").onchange = e => { ui.mask = e.target.checked; writeMask(ui.mask); render(target, params); };
    if (tab === "todos") {
      if (params[1]) {
        target.querySelector("#fichaBack")?.addEventListener("click", () => UBY.go("#/clientes/todos"));
        fichaCharts(prof);
      } else {
        target.querySelectorAll("tr[data-key]").forEach(tr => tr.onclick = () => UBY.go(`#/clientes/todos/${encodeURIComponent(tr.dataset.key)}`));
        const dir = (k, v) => { ui.dir[k] = v; render(target, ["todos"]); };
        target.querySelector("#dirFilter").onchange = e => dir("filter", e.target.value);
        target.querySelector("#dirSite").onchange = e => dir("site", e.target.value);
        target.querySelector("#dirSort").onchange = e => dir("sort", e.target.value);
        const s = target.querySelector("#dirSearch");
        s.oninput = () => { ui.dir.q = s.value; clearTimeout(s._t); s._t = setTimeout(() => { render(target, ["todos"]); const el = target.querySelector("#dirSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
      }
    }
    const rk = (k, v) => { ui.rk[k] = v; render(target, ["ranking"]); };
    target.querySelector("#rkStation")?.addEventListener("change", e => rk("station", e.target.value));
    target.querySelector("#rkFrom")?.addEventListener("change", e => rk("from", e.target.value));
    target.querySelector("#rkTo")?.addEventListener("change", e => rk("to", e.target.value));
    target.querySelector("#rkClear")?.addEventListener("click", () => { ui.rk.from = ui.rk.to = ""; render(target, ["ranking"]); });
    const search = target.querySelector("#regSearch");
    if (search) {
      search.oninput = () => { ui.search = search.value; clearTimeout(search._t); search._t = setTimeout(() => { render(target, ["cadastro"]); const el = target.querySelector("#regSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
      target.querySelector("#regSort").onchange = e => { ui.sort = e.target.value; render(target, ["cadastro"]); };
    }
    if (tab === "alertas" && wd && !wd.error) {
      const al = (k, v) => { ui.al[k] = v; render(target, ["alertas"]); };
      target.querySelector("#alLevel").onchange = e => al("level", e.target.value);
      target.querySelector("#alType").onchange = e => al("type", e.target.value);
      target.querySelector("#alSite").onchange = e => al("site", e.target.value);
      target.querySelector("#alCsv").onclick = () => alertasCsv(wd);
      const s = target.querySelector("#alSearch");
      s.oninput = () => { ui.al.q = s.value; clearTimeout(s._t); s._t = setTimeout(() => { render(target, ["alertas"]); const el = target.querySelector("#alSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
      // curva suave com área, como o hora a hora do Comando
      const labels = Array.from({ length: 8 }, (_, i) => { const d = new Date(wd.w.asOf - (7 - i) * 7 * 86400000); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; });
      UBY.chart("chSiteWeekly", { type: "line", data: { labels, datasets: wd.w.sites.map((s, i) => { const col = UBY.PALETTE[i % UBY.PALETTE.length];
        return { label: s.site, data: s.weekly.map(x => x.kwh), borderColor: col, backgroundColor: col + "26", fill: true, tension: 0.42, pointRadius: 0, borderWidth: 2 }; }) },
        options: UBY.baseChartOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => `${v} kWh` } } } }) });
    }
    if (tab === "coortes") {
      const c = r.cohorts.slice().reverse();
      UBY.chart("chCohorts", { type: "bar", data: { labels: c.map(x => x.label), datasets: [
        { label: "Voltaram", data: c.map(x => x.recurring), backgroundColor: "#187457", stack: "s", borderRadius: 3 },
        { label: "Sem retorno", data: c.map(x => x.newClients - x.recurring), backgroundColor: "#dde2d7", stack: "s", borderRadius: 3 }
      ] }, options: UBY.baseChartOptions({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } } }) });
    }
  }

  UBY.register("clientes", { render, mask: () => ui.mask, who, contact });
})();

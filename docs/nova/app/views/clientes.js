/* Clientes — inteligência, ranking, recuperação, coortes, cadastro oficial e Clube UBY. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const TABS = [["visao", "Inteligência"], ["ranking", "Ranking do período"], ["ausentes", "Recuperação"], ["coortes", "Coortes"], ["cadastro", "Cadastro oficial"]];
  const ui = { search: "", sort: "spent", mask: readMask() };
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

  function ranking(r) {
    const max = r.ranking[0]?.revenue || 1;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">${esc(r.period.label)}</p><h2>Ranking de clientes (${r.ranking.length})</h2><p>Todas as tentativas do período; a coluna Válidas mostra quantas viraram recarga.</p></div></div>
        <div class="table-wrap" style="max-height:640px"><table><thead><tr><th>#</th><th>Cliente</th><th>Estações</th><th class="num">Recargas</th><th class="num">Válidas</th><th class="num">Histórico</th><th class="num">Energia</th><th>Faturamento</th><th class="num">R$/kWh</th><th>Última</th></tr></thead>
          <tbody>${r.ranking.map((c, i) => `<tr><td>${i + 1}</td><td><strong>${who(c.name)}</strong><small>${contact(c.email || c.phone)}</small></td><td>${esc(c.stations.join(" · "))}</td>
            <td class="num">${c.sessions}</td><td class="num">${c.valid}</td><td class="num">${c.historySessions}${c.historySessions > 1 ? ' <span class="badge ok">recorrente</span>' : ""}</td><td class="num">${fmt.kwh(c.energy)}</td>
            <td style="min-width:170px"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${fmt.brl(c.revenue)}</strong><small>${fmt.pct1(c.share)}</small></div><div class="bar"><span style="width:${c.revenue / max * 100}%"></span></div></td>
            <td class="num">${fmt.brl(c.perKwh)}</td><td>${fmt.dt(c.last)}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">Sem clientes no período.</td></tr>`}</tbody></table></div>
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

  function cadastro(target) {
    if (!registry) return `<section class="section"><div class="loading" style="min-height:180px"><div class="spinner"></div><p>Lendo recharge_customers no Supabase…</p></div></section>`;
    if (registry.error) return `<section class="section"><div class="note">Não foi possível ler o cadastro: ${esc(registry.error)}</div></section>`;
    const q = ui.search.trim().toLowerCase();
    const rows = registry.rows.filter(r => !q || `${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(q)).sort((a, b) =>
      ui.sort === "name" ? String(a.name).localeCompare(String(b.name), "pt-BR") : Number(b[ui.sort] || 0) - Number(a[ui.sort] || 0));
    const tot = registry.rows.reduce((a, r) => ({ transactions: a.transactions + r.transactions, energy: a.energy + r.energy, spent: a.spent + r.spent }), { transactions: 0, energy: 0, spent: 0 });
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Base oficial · recharge_customers</p><h2>Cadastro geral de clientes</h2><p>Base consolidada importada das plataformas de recarga. Importações novas: <a href="#/importar">Importar planilhas</a>.</p></div><div class="meta">atualizada ${fmt.dt(registry.updatedAt)}</div></div>
        <div class="grid g4" style="margin-bottom:14px">
          ${kpi("Clientes", fmt.int(registry.rows.length), "cadastros únicos", "", "lead")}
          ${kpi("Transações", fmt.int(tot.transactions), "acumulado informado")}
          ${kpi("Energia", fmt.kwh0(tot.energy), "consumo acumulado", "", "warn")}
          ${kpi("Total gasto", fmt.brl(tot.spent), "faturamento informado")}
        </div>
        <div class="toolbar" style="box-shadow:none"><input class="search" id="regSearch" placeholder="Buscar nome, e-mail ou telefone" value="${esc(ui.search)}">
          <select class="select" id="regSort">${[["spent", "Maior gasto"], ["transactions", "Mais transações"], ["energy", "Mais energia"], ["name", "Nome"]].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <span class="spacer"></span><small>${rows.length} de ${registry.rows.length}</small></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th class="num">Carregadores</th><th class="num">Transações</th><th class="num">Energia</th><th>Tempo</th><th class="num">Total gasto</th></tr></thead>
          <tbody>${rows.slice(0, 800).map(r => `<tr><td><strong>${who(r.name || "—")}</strong>${r.complement ? `<small>${esc(r.complement)}</small>` : ""}</td><td>${contact(r.phoneDisplay || r.phone)}</td><td>${contact(r.email)}</td>
            <td class="num">${r.chargers}</td><td class="num">${r.transactions}</td><td class="num">${fmt.kwh(r.energy)}</td><td>${esc(r.chargeTime || "—")}</td><td class="num"><strong>${fmt.brl(r.spent)}</strong></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum cliente encontrado.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function render(target, params) {
    const tab = TABS.some(([id]) => id === params[0]) ? params[0] : "visao";
    const r = UBY.data("clientIntelligence", monthArg());
    let body = "";
    if (tab === "visao") body = visao(r);
    else if (tab === "ranking") body = ranking(r);
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
    target.querySelector("#maskToggle").onchange = e => { ui.mask = e.target.checked; writeMask(ui.mask); render(target, [tab]); };
    const search = target.querySelector("#regSearch");
    if (search) {
      search.oninput = () => { ui.search = search.value; clearTimeout(search._t); search._t = setTimeout(() => { render(target, ["cadastro"]); const el = target.querySelector("#regSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
      target.querySelector("#regSort").onchange = e => { ui.sort = e.target.value; render(target, ["cadastro"]); };
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

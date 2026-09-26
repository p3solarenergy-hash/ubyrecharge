/* Gestão de obras — portfólio, prazos e pendências, fases, prospecção e atividade. */
(function () {
  "use strict";
  const { fmt, esc, kpi, mini } = UBY;
  const TABS = [["portfolio", "Portfólio"], ["prazos", "Prazos e pendências"], ["fases", "Avanço por fase"], ["prospeccao", "Prospecção"], ["atividade", "Mensagens e histórico"]];
  const STAGES = ["Prospecção / Estudo", "Projeto", "Aguardando cliente", "Em obra", "Concluida"];
  const ui = { search: "", stage: "all" };
  let snap = null, error = null, loading = false;

  const detailSrc = id => `legado/obra-ev/gestao_obra_ev_detalhe.html?obra=${encodeURIComponent(id)}`;
  const tone = pct => pct >= 70 ? "ok" : pct >= 40 ? "warn" : "bad";
  const barColor = pct => pct >= 70 ? "var(--uby-green)" : pct >= 40 ? "var(--uby-amber)" : "var(--uby-red)";
  const dayBadge = d => d === null || d === undefined || d === 999 ? '<span class="badge neutral">sem prazo</span>'
    : d < 0 ? `<span class="badge bad">${Math.abs(d)} dia(s) atrasado</span>` : d === 0 ? '<span class="badge warn">hoje</span>'
    : d <= 7 ? `<span class="badge warn">em ${d} dia(s)</span>` : `<span class="badge neutral">em ${d} dias</span>`;

  function ensure(target, params) {
    if (snap || loading) return;
    loading = true;
    UBY.obras().then(r => { snap = r.data; error = null; }).catch(err => { error = err.message; })
      .finally(() => { loading = false; if (location.hash.startsWith("#/obras") && !location.hash.startsWith("#/obras-")) render(target, params); });
  }

  function head(tab) {
    const s = snap.stats;
    return `
      <div class="hero"><div><p class="eyebrow">Gestão de obras · base oficial</p><h1>Obras</h1>
        <p class="lead">Da prospecção ao comissionamento: avanço, potência, pendências críticas, prazos de entrega e tarefas da equipe. Clique em uma obra para abrir o detalhe completo.</p></div>
        <div class="callout"><strong>${fmt.int(s.criticalAlerts)} alerta(s) de prazo exigem ação</strong><small>${fmt.int(s.lateTasks)} tarefa(s) atrasada(s) e ${fmt.int(s.lateDeliveries)} entrega(s) vencida(s). Nova obra, fases e tarefas: <a href="#/obras-classico">Obras · cadastro e edição</a>.</small></div></div>
      <section class="section"><div class="grid g5">
        ${kpi("Obras ativas", fmt.int(s.count), "no painel (arquivadas fora)", "", "lead")}
        ${kpi("Avanço médio", `${s.avgPct}%`, "tarefas OK + N/A")}
        ${kpi("Pendências críticas", fmt.int(s.crit), "concessionária, compras, materiais, obra elétrica", "", s.crit ? "warn" : "")}
        ${kpi("Potência da carteira", `${fmt.int(s.kw)} kW`, "soma dos carregadores")}
        ${kpi("Alertas de prazo", fmt.int(s.criticalAlerts), "atrasos, entregas vencidas, alta prioridade", "", s.criticalAlerts ? "bad" : "")}
      </div></section>
      <div class="toolbar"><div class="seg" id="obTabs">${TABS.map(([id, l]) => `<button data-tab="${id}" class="${tab === id ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span><button class="btn" id="obRefresh" title="Reler obras e tarefas no Supabase">↻ Atualizar obras</button></div>`;
  }

  function portfolio() {
    const q = ui.search.trim().toLowerCase();
    const works = snap.works.filter(o => (ui.stage === "all" || o.stage === ui.stage) && (!q || [o.nome, o.cliente, o.local, o.status, ...o.flags].join(" ").toLowerCase().includes(q)));
    const total = snap.works.length || 1;
    return `
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Funil</p><h2>Obras por etapa</h2></div></div>
          <div class="list">${snap.pipeline.map(p => `<button class="list-row" data-stage="${esc(p.stage)}" style="cursor:pointer;display:grid;grid-template-columns:170px 1fr 30px;align-items:center;gap:10px;text-align:left;${ui.stage === p.stage ? "border-color:var(--uby-green);background:var(--uby-green-soft)" : ""}">
            <strong style="color:var(--uby-ink)">${esc(p.stage)}</strong><div class="bar"><span style="width:${p.count / total * 100}%;background:${p.stage === "Concluida" ? "var(--uby-green)" : p.stage === "Em obra" ? "var(--uby-amber)" : "var(--uby-blue)"}"></span></div><strong>${p.count}</strong></button>`).join("")}</div>
          ${ui.stage !== "all" ? `<p class="source-line"><a href="#" id="clearStage">Mostrar todas as etapas</a></p>` : ""}
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Leitura macro</p><h2>Onde focar</h2></div></div>
          <div class="list">${snap.macro.map(m => `<div class="list-row"><span><strong style="color:var(--uby-ink)">${esc(m.title)}</strong><small style="display:block;white-space:normal;color:var(--uby-muted)">${esc(m.text)}</small></span><span class="badge ${m.tone}">${m.tone === "bad" ? "crítico" : m.tone === "warn" ? "atenção" : "ok"}</span></div>`).join("")}</div>
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Carteira</p><h2>${works.length} obra(s)${ui.stage !== "all" ? ` · ${esc(ui.stage)}` : ""}</h2><p>Menor avanço primeiro dentro de cada etapa.</p></div>
          <input class="search" id="obSearch" placeholder="Buscar obra, cliente, local ou pendência" value="${esc(ui.search)}"></div>
        <div class="table-wrap"><table><thead><tr><th>Obra</th><th>Etapa</th><th>Fase atual</th><th style="min-width:150px">Avanço</th><th class="num">Potência</th><th class="num">Críticas</th><th>Entrega</th><th>Pontos de atenção</th></tr></thead>
          <tbody>${STAGES.flatMap(stage => works.filter(o => o.stage === stage).sort((a, b) => a.pct - b.pct || a.nome.localeCompare(b.nome))).map(o => `<tr class="clickable" data-obra="${esc(o.id)}" data-nome="${esc(o.nome)}">
            <td><strong>${esc(o.nome)}</strong><small>${esc(o.cliente)} · ${esc(o.local)}</small></td>
            <td><span class="badge ${o.stage === "Concluida" ? "ok" : o.stage === "Em obra" ? "warn" : "neutral"}">${esc(o.status)}</span></td>
            <td>${esc(o.currentPhase || "—")}${o.pending ? `<small>${o.pending} pendência(s) aberta(s)</small>` : ""}</td>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><span style="width:${o.pct}%;background:${barColor(o.pct)}"></span></div><strong>${o.pct}%</strong></div></td>
            <td class="num">${fmt.int(o.kw)} kW<small>${esc(o.carregadores)}</small></td><td class="num">${o.crit ? `<span class="badge bad">${o.crit}</span>` : "0"}</td>
            <td>${o.entrega ? `${fmt.date(o.entrega + "T12:00:00")}<br>${o.stage !== "Concluida" ? dayBadge(o.entregaDias) : ""}` : "—"}</td>
            <td style="white-space:normal;min-width:200px">${o.flags.slice(0, 3).map(f => `<span class="badge ${/pendente|aumento|trafo|concessionaria/i.test(f) ? "bad" : /projeto|materiais|orcamento/i.test(f) ? "warn" : "ok"}" style="margin:1px">${esc(f)}</span>`).join(" ")}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhuma obra encontrada.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function prazos() {
    const d = snap.deadlines, p = snap.pending;
    const taskTable = (rows, empty) => `<div class="table-wrap" style="max-height:300px"><table><thead><tr><th>Tarefa</th><th>Projeto</th><th>Responsável</th><th>Prazo</th></tr></thead><tbody>
      ${rows.map(t => `<tr><td><strong>${esc(t.title)}</strong>${t.priority === "Alta" ? ' <span class="badge bad">alta</span>' : ""}</td><td>${esc(t.project)}</td><td>${esc(t.owner || "sem responsável")}</td><td>${t.due ? fmt.date(t.due + "T12:00:00") : "—"} ${dayBadge(t.days)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
    const pendTable = (rows, empty) => `<div class="table-wrap" style="max-height:300px"><table><thead><tr><th>Pendência</th><th>Obra</th><th>Responsável</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>
      ${rows.map(i => `<tr class="clickable" data-obra="${esc(i.workId)}" data-nome="${esc(i.workName)}"><td><strong>${esc(i.title)}</strong></td><td>${esc(i.workName)}</td><td>${esc(i.owner || "sem responsável")}</td><td>${esc(i.waitingOn || i.status)}</td><td>${dayBadge(i.days)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
    return `
      <section class="section" style="border-top:3px solid ${d.critical.length ? "var(--uby-red)" : "var(--uby-green)"}"><div class="section-head"><div><p class="kicker">Central de prazos</p><h2>${d.critical.length ? `${d.critical.length} alerta(s) exigem ação imediata` : "Nenhum atraso crítico"}</h2><p>Tarefas vencidas, entregas de obra vencidas e tarefas de alta prioridade para hoje ou amanhã.</p></div></div>
        <div class="list">${d.critical.map(a => `<div class="list-row"><span><strong style="color:var(--uby-ink)">${esc(a.title)}</strong></span><span class="badge bad">${esc(a.meta)}</span></div>`).join("") || `<div class="note">Continue acompanhando os próximos prazos e complete os cadastros sem responsável ou data.</div>`}</div>
      </section>
      <div class="grid g2" style="gap:18px;margin-bottom:18px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Tarefas</p><h2>Atrasadas (${d.late.length})</h2></div></div>${taskTable(d.late, "Nenhuma tarefa vencida.")}</section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Tarefas</p><h2>Próximos 7 dias (${d.soon.length})</h2></div></div>${taskTable(d.soon, "Nenhum prazo nos próximos 7 dias.")}</section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Obras</p><h2>Entregas nos próximos 14 dias (${d.works.length})</h2></div></div>
          <div class="list">${d.works.map(w => `<div class="list-row clickable" data-obra="${esc(w.id)}" data-nome="${esc(w.nome)}" style="cursor:pointer"><span><strong style="color:var(--uby-ink)">${esc(w.nome)}</strong><small style="display:block;color:var(--uby-muted)">entrega ${fmt.date(w.delivery + "T12:00:00")}</small></span>${dayBadge(w.days)}</div>`).join("") || `<div class="note">Nenhuma entrega cadastrada para os próximos 14 dias.</div>`}</div></section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Qualidade do cadastro</p><h2>Sem prazo ou responsável (${d.hygiene.length})</h2></div></div>${taskTable(d.hygiene, "Todas as tarefas abertas têm prazo e responsável.")}</section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Pendências registradas nas obras</p><h2>${p.all.length} pendência(s) aberta(s)</h2><p>Itens criados dentro de cada obra. Clique para tratar no contexto do projeto.</p></div>
          <div class="meta">${p.late.length} atrasada(s) · ${p.soon.length} em 7 dias · ${p.waiting.length} aguardando terceiros</div></div>
        ${pendTable(p.all.slice().sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)), "Nenhuma pendência aberta nas obras.")}
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Semana</p><h2>Concluídas nos últimos 7 dias (${snap.tasks.doneWeek.length})</h2></div><div class="meta">${snap.tasks.open} tarefa(s) aberta(s) de ${snap.tasks.total}</div></div>
        <div class="list">${snap.tasks.doneWeek.map(t => `<div class="list-row"><span><strong style="color:var(--uby-ink)">${esc(t.title)}</strong><small style="display:block;color:var(--uby-muted)">${esc(t.project)} · ${esc(t.owner || "sem responsável")}</small></span><span class="badge ok">${fmt.date(t.completedAt)}</span></div>`).join("") || `<div class="note">As conclusões desta semana aparecerão aqui.</div>`}</div>
      </section>`;
  }

  function fases() {
    const withDetail = snap.works.filter(o => o.phases.length);
    const names = [...new Set(withDetail.flatMap(o => o.phases.map(p => p.name)))];
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Carteira</p><h2>Avanço geral por fase</h2><p>Média das obras em cada fase (tarefas OK + N/A). Obra sem checklist usa o próprio avanço; concluída conta 100%.</p></div></div>
        <div class="grid g5">${snap.phases.map(p => `<div class="mini"><span class="k">${esc(p.label)}</span><strong class="v">${p.pct}%</strong><div class="bar" style="margin-top:6px"><span style="width:${p.pct}%;background:${barColor(p.pct)}"></span></div>
          <span class="s" style="margin-top:4px">${p.pct >= 70 ? "Bem encaminhada" : p.pct >= 40 ? "Em andamento" : "Precisa atenção"}</span></div>`).join("")}</div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Matriz obra × fase</p><h2>Onde cada obra está travada</h2><p>${withDetail.length} obra(s) com checklist de fases.</p></div></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Obra</th>${names.map(n => `<th class="num" style="white-space:normal;min-width:80px">${esc(n)}</th>`).join("")}</tr></thead>
          <tbody>${withDetail.sort((a, b) => a.pct - b.pct).map(o => `<tr class="clickable" data-obra="${esc(o.id)}" data-nome="${esc(o.nome)}"><td><strong>${esc(o.nome)}</strong><small>${o.pct}% · ${esc(o.status)}</small></td>
            ${names.map(n => { const ph = o.phases.find(p => p.name === n); return ph ? `<td class="num" title="${ph.done} de ${ph.total}${ph.doing ? ` · ${ph.doing} em andamento` : ""}"><span class="badge ${ph.pct === 100 ? "ok" : ph.pct >= 40 ? "warn" : ph.doing ? "warn" : "neutral"}">${ph.pct}%</span></td>` : '<td class="num">—</td>'; }).join("")}</tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  function prospeccao() {
    const pr = snap.prospects;
    const kind = p => String(p.prioridade).startsWith("1.") ? "bad" : String(p.prioridade).startsWith("2.") ? "warn" : "ok";
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Base de prospecção</p><h2>${pr.length} ponto(s) em estudo</h2><p>Áreas candidatas (tabela prospeccao_areas). Prioridade 1 é o próximo corte para virar obra.</p></div>
          <div class="meta">${pr.filter(p => kind(p) === "bad").length} de prioridade 1</div></div>
        <div class="table-wrap" style="max-height:640px"><table><thead><tr><th>#</th><th>Ponto</th><th>Prioridade</th><th>Status</th><th>Etapa / ação</th><th class="num">kW</th><th>Infra</th></tr></thead>
          <tbody>${pr.map(p => `<tr><td>${esc(p.id)}</td><td><strong>${esc(p.ponto)}</strong><small>${esc(p.cidade)}/${esc(p.uf)} · ${esc(p.tipo)} · ${esc(p.contato || "sem contato")}</small></td>
            <td><span class="badge ${kind(p)}">${esc(String(p.prioridade).replace(/^[0-9]+\.\s*/, ""))}</span></td><td>${esc(p.status)}</td><td style="white-space:normal;min-width:220px">${esc(p.etapa || "sem etapa")}${p.acao ? ` · ${esc(p.acao)}` : ""}</td>
            <td class="num">${esc(p.kw || "—")}</td><td>${esc([p.trafo, p.disjuntor].filter(Boolean).join(" / ") || "—")}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Sem pontos de prospecção.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function atividade() {
    const item = a => `<div class="list-row" style="display:block"><small style="color:var(--uby-muted)">${fmt.dt(a.at)} · ${esc(a.user)}</small><strong style="display:block;color:var(--uby-ink)">${esc(a.work)}${a.title ? ` · ${esc(a.title)}` : ""}</strong><span style="white-space:normal">${esc(a.text || a.detail || "")}${a.after ? ` → ${esc(a.after)}` : ""}</span></div>`;
    return `
      <div class="grid g2" style="gap:18px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Equipe</p><h2>Mensagens gerais</h2></div></div><div class="list" style="max-height:600px;overflow:auto">${snap.messages.map(item).join("") || `<div class="note">Sem mensagens ainda.</div>`}</div></section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Auditoria</p><h2>Histórico recente</h2></div></div><div class="list" style="max-height:600px;overflow:auto">${snap.activity.map(item).join("") || `<div class="note">Nenhuma alteração registrada.</div>`}</div></section>
      </div>`;
  }

  // ---------- Detalhe de uma obra (#/obras/obra/<id>/<aba>) ----------
  const OBRA_TABS = [["geral", "Visão geral"], ["fases", "Fases e tarefas"], ["pendencias", "Pendências"], ["documentos", "Documentos"], ["prospeccao", "Prospecção e contrato"], ["historico", "Histórico e mensagens"]];
  const PUB = "https://p3solarenergy-hash.github.io/ubyrecharge/obra-ev/";
  const statusBadge = s => ({ done: "ok", na: "neutral", doing: "warn", pending: "bad" }[s] || "neutral");
  let obraCache = new Map();

  function obraView(target, id, tab) {
    if (!obraCache.has(id)) {
      obraCache.set(id, null);
      UBY.obras().then(r => { obraCache.set(id, r.api.obraDetail(id) || { missing: true }); }).catch(err => obraCache.set(id, { error: err.message }))
        .finally(() => { if (decodeURIComponent(location.hash).startsWith(`#/obras/obra/${id}`)) render(target, ["obra", id, tab]); });
    }
    const o = obraCache.get(id);
    if (!o) { target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Abrindo a obra</h2></div>`; return; }
    if (o.error || o.missing) { target.innerHTML = `<p><a href="#/obras">← Obras</a></p><div class="note">${o.error ? esc(o.error) : "Obra não encontrada entre as ativas."}</div>`; return; }
    document.getElementById("crumbTitle").textContent = o.nome;
    const s = o.stats;
    const dd = o.entregaDias;
    let body = "";
    if (tab === "geral") {
      body = `
        <div class="grid g6" style="margin-bottom:18px">
          ${kpi("Avanço", `${s.pct}%`, `${s.done} OK · ${s.na} N/A de ${s.total} tarefas`, "", "lead big")}
          ${kpi("Em andamento", fmt.int(s.doing), `${fmt.int(s.pending)} pendente(s)`, "", s.doing ? "warn" : "")}
          ${kpi("Pendências críticas", fmt.int(o.critical.length), "concessionária, compras, materiais, obra elétrica", "", o.critical.length ? "bad" : "")}
          ${kpi("Potência", `${fmt.int(o.totalKw)} kW`, `${o.qtd} × ${o.kw} kW`)}
          ${kpi("Entrega", o.entrega ? fmt.date(o.entrega + "T12:00:00") : "—", o.entrega && o.stage !== "Concluida" ? (dd < 0 ? `${Math.abs(dd)} dia(s) em atraso` : dd === 0 ? "hoje" : `em ${dd} dia(s)`) : "", "", o.entrega && o.stage !== "Concluida" && dd < 0 ? "bad" : "")}
          ${kpi("Documentos", `${o.docsOk} / ${o.documents.length}`, "recebidos ou N/A")}
        </div>
        <div class="split" style="margin-bottom:18px">
          <section class="section"><div class="section-head"><div><p class="kicker">Checklist</p><h2>Resumo de fases</h2><p>${o.worstPhase && s.pct < 100 ? `Gargalo atual: ${esc(o.worstPhase.name)} (${o.worstPhase.pct}%).` : "Obra operacionalmente completa."}</p></div></div>
            <div class="list">${o.phases.map(ph => `<div class="list-row" style="display:grid;grid-template-columns:1fr auto;gap:4px"><span><strong style="color:var(--uby-ink)">${esc(ph.name)}</strong>${ph.critical ? ' <span class="badge warn">crítica</span>' : ""}<small style="display:block;color:var(--uby-muted)">${esc(ph.owner)} · ${ph.stats.done + ph.stats.na}/${ph.stats.total}${ph.stats.doing ? ` · ${ph.stats.doing} em andamento` : ""}</small></span><strong>${ph.stats.pct}%</strong>
              <div class="bar" style="grid-column:1/-1"><span style="width:${ph.stats.pct}%;background:${barColor(ph.stats.pct)}"></span></div></div>`).join("") || `<div class="note">Esta obra ainda não tem checklist de fases.</div>`}</div>
          </section>
          <section class="section"><div class="section-head"><div><p class="kicker">Atenção</p><h2>Pendências críticas (${o.critical.length})</h2></div></div>
            <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Fase</th><th>Item</th><th>Situação</th><th>Protocolo / previsão</th></tr></thead>
              <tbody>${o.critical.map(c => `<tr><td>${esc(c.phase)}</td><td style="white-space:normal"><strong>${esc(c.title)}</strong></td><td><span class="badge ${c.status === "Em andamento" ? "warn" : "bad"}">${esc(c.status)}</span></td><td>${esc(c.protocol || "—")}${c.forecastDate ? `<small>prev. ${fmt.date(c.forecastDate + "T12:00:00")}</small>` : ""}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nenhuma pendência crítica.</td></tr>`}</tbody></table></div>
            ${o.analysis ? `<h3 style="margin:14px 0 8px">Análise de carga vinculada</h3><div class="list">
              <div class="list-row"><span>${esc(o.analysis.title)}</span>${o.analysis.url && o.analysis.url !== "#" && !/^(file|blob):/.test(o.analysis.url) ? `<a class="btn link-btn" href="legado/obra-ev/${esc(o.analysis.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : ""}</div>
              <div class="list-row"><span>Pico ${esc(o.analysis.peak)} · consumo ${esc(o.analysis.consumption)} · EV ${esc(o.analysis.ev)}</span><small>${esc(o.analysis.status)}</small></div>
              <div class="list-row" style="display:block;white-space:normal"><small style="color:var(--uby-muted)">Concessionária: ${esc(o.analysis.utility)}<br>Ação: ${esc(o.analysis.action)}</small></div></div>` : ""}
          </section>
        </div>`;
    } else if (tab === "fases") {
      body = o.phases.map(ph => `
        <section class="section"><div class="section-head"><div><p class="kicker">${esc(ph.owner)}</p><h2>${esc(ph.name)}${ph.critical ? ' <span class="badge warn">fase crítica</span>' : ""}</h2></div><div class="meta"><strong>${ph.stats.pct}%</strong> · ${ph.stats.done} OK · ${ph.stats.na} N/A · ${ph.stats.doing} em andamento · ${ph.stats.pending} pendente(s)</div></div>
          <div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Situação</th><th>Protocolo</th><th>Pedido</th><th>Previsão</th><th>Observação</th></tr></thead>
            <tbody>${ph.tasks.map(t => `<tr class="${t.status === "done" || t.status === "na" ? "muted" : ""}"><td style="white-space:normal"><strong>${esc(t.title)}</strong></td><td><span class="badge ${statusBadge(t.status)}">${esc(t.statusLabel)}</span></td>
              <td>${esc(t.protocol || "—")}</td><td>${t.requestDate ? fmt.date(t.requestDate + "T12:00:00") : "—"}</td><td>${t.forecastDate ? fmt.date(t.forecastDate + "T12:00:00") : "—"}</td><td style="white-space:normal;min-width:180px"><small style="color:var(--uby-muted)">${esc(t.note)}</small></td></tr>`).join("")}</tbody></table></div>
        </section>`).join("") || `<section class="section"><div class="note">Esta obra ainda não tem checklist de fases.</div></section>`;
    } else if (tab === "pendencias") {
      const open = o.pending.filter(i => i.status !== "Concluida"), done = o.pending.filter(i => i.status === "Concluida");
      const table = rows => `<div class="table-wrap"><table><thead><tr><th>Pendência</th><th>Responsável</th><th>Situação</th><th>Aguardando</th><th>Prazo</th></tr></thead><tbody>
        ${rows.map(i => `<tr><td style="white-space:normal"><strong>${esc(i.title)}</strong>${i.priority ? ` <span class="badge ${i.priority === "Alta" ? "bad" : "neutral"}">${esc(i.priority)}</span>` : ""}${i.note ? `<small>${esc(i.note)}</small>` : ""}</td><td>${esc(i.owner || "sem responsável")}</td>
          <td>${esc(i.status)}${i.completedAt ? `<small>${fmt.date(i.completedAt)}</small>` : ""}</td><td>${esc(i.waitingOn || "—")}</td><td>${i.status === "Concluida" ? "—" : dayBadge(i.days)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nada aqui.</td></tr>`}</tbody></table></div>`;
      body = `<section class="section"><div class="section-head"><div><p class="kicker">Operação da obra</p><h2>Pendências abertas (${open.length})</h2></div></div>${table(open.sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)))}</section>
        <details class="section"><summary style="cursor:pointer;font-weight:850;color:var(--uby-forest)">Concluídas (${done.length})</summary><div style="margin-top:10px">${table(done)}</div></details>`;
    } else if (tab === "documentos") {
      body = `<section class="section"><div class="section-head"><div><p class="kicker">Arquivos da obra</p><h2>Documentos (${o.docsOk} de ${o.documents.length} recebidos)</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Documento</th><th>Fase</th><th>Situação</th><th>Responsável</th><th>Validade / prazo</th><th>Link</th></tr></thead>
          <tbody>${o.documents.map(d => `<tr><td><strong>${esc(d.name)}</strong>${d.fileName ? `<small>${esc(d.fileName)}</small>` : ""}</td><td>${esc(d.phase)}</td><td><span class="badge ${statusBadge(d.status)}">${esc(d.statusLabel)}</span></td><td>${esc(d.owner || "—")}</td>
            <td>${d.due ? fmt.date(d.due + "T12:00:00") : "—"}</td><td>${/^https?:\/\//.test(d.link) ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">abrir ↗</a>` : esc(d.link || "—")}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum documento cadastrado.</td></tr>`}</tbody></table></div></section>`;
    } else if (tab === "prospeccao") {
      const pr = o.prospecting;
      body = `<div class="split"><section class="section"><div class="section-head"><div><p class="kicker">Comercial</p><h2>Prospecção</h2></div><div class="meta">${pr.contractClosed ? `<span class="badge ok">contrato fechado</span>${pr.contractClosedAt ? `<br>${fmt.date(pr.contractClosedAt)}` : ""}` : '<span class="badge neutral">contrato em aberto</span>'}</div></div>
          <div class="grid g2">${mini("Etapa", esc(pr.stage || "—"))}${mini("Responsável", esc(pr.responsible || "—"))}${mini("Contato", esc(pr.contactName || "—"), esc([pr.contactRole, pr.phone, pr.email].filter(Boolean).join(" · ")))}${mini("Próxima ação", esc(pr.nextAction || "—"), pr.nextActionDate ? fmt.date(pr.nextActionDate + "T12:00:00") : "")}</div>
          ${pr.notes ? `<div class="note" style="margin-top:10px;white-space:pre-wrap">${esc(pr.notes)}</div>` : ""}</section>
        <section class="section"><div class="section-head"><div><p class="kicker">Protocolos</p><h2>Protocolos e prazos (${pr.protocols.length})</h2></div><div class="meta">${pr.documents} documento(s) comerciais</div></div>
          <div class="table-wrap"><table><thead><tr><th>Protocolo</th><th>Número</th><th>Situação</th><th>Prazo</th></tr></thead><tbody>${pr.protocols.map(p => `<tr><td>${esc(p.name || "—")}<small>${esc(p.reference)}</small></td><td>${esc(p.number || "—")}</td><td>${esc(p.status || "—")}</td><td>${p.deadline ? fmt.date(p.deadline + "T12:00:00") : "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nenhum protocolo.</td></tr>`}</tbody></table></div></section></div>`;
    } else {
      const item = a => `<div class="list-row" style="display:block"><small style="color:var(--uby-muted)">${fmt.dt(a.at)} · ${esc(a.user)}</small><strong style="display:block;color:var(--uby-ink)">${esc(a.title || "")}</strong><span style="white-space:normal">${esc(a.text || a.detail || "")}${a.after ? ` → ${esc(a.after)}` : ""}</span></div>`;
      body = `<div class="grid g2" style="gap:18px"><section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Equipe</p><h2>Mensagens da obra</h2></div></div><div class="list" style="max-height:600px;overflow:auto">${o.messages.map(item).join("") || `<div class="note">Nenhuma mensagem nesta obra.</div>`}</div></section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Auditoria</p><h2>Quem alterou o quê</h2></div></div><div class="list" style="max-height:600px;overflow:auto">${o.activity.map(item).join("") || `<div class="note">Sem alterações registradas.</div>`}</div></section></div>`;
    }
    target.innerHTML = `
      <p style="margin:0 0 12px"><a href="#/obras" style="font-weight:800;font-size:12px">← Obras</a></p>
      <div class="hero"><div><p class="eyebrow">Obra · ${esc(o.stage)}</p><h1>${esc(o.nome)}</h1><p class="lead">${esc(o.cliente)} · ${esc(o.local)}</p></div>
        <div class="callout"><strong>${esc(o.status)} · ${s.pct}% concluída</strong><small>Para marcar tarefas, anexar documentos ou registrar pendências: <a href="${PUB}gestao_obra_ev_detalhe.html?obra=${encodeURIComponent(o.id)}" target="_blank" rel="noopener">editar na publicada ↗</a>${o.sheetUrl ? ` · <a href="${esc(o.sheetUrl)}" target="_blank" rel="noopener">planilha da obra ↗</a>` : ""} · <a href="#" id="openLegacyObra">ver página original</a></small></div></div>
      <div class="toolbar"><div class="seg" id="obraTabs">${OBRA_TABS.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${body}`;
    target.querySelectorAll("#obraTabs button").forEach(b => b.onclick = () => UBY.go(`#/obras/obra/${encodeURIComponent(id)}/${b.dataset.tab}`));
    target.querySelector("#openLegacyObra").onclick = e => { e.preventDefault(); UBY.openLegacy(detailSrc(id), `Obra · ${o.nome}`); };
  }

  function render(target, params = []) {
    if (params[0] === "obra" && params[1]) return obraView(target, params[1], OBRA_TABS.some(([k]) => k === params[2]) ? params[2] : "geral");
    const tab = TABS.some(([id]) => id === params[0]) ? params[0] : "portfolio";
    if (!snap) {
      ensure(target, params);
      target.innerHTML = error
        ? `<div class="loading"><h2>Não foi possível ler as obras</h2><p>${esc(error)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`
        : `<div class="loading"><div class="spinner"></div><h2>Lendo obras, tarefas e prospecção</h2><p>O painel de obras original está carregando a base oficial no Supabase.</p></div>`;
      return;
    }
    const body = { portfolio, prazos, fases, prospeccao, atividade }[tab]();
    target.innerHTML = head(tab) + body;
    target.querySelectorAll("#obTabs button").forEach(b => b.onclick = () => UBY.go(`#/obras/${b.dataset.tab}`));
    target.querySelector("#obRefresh").onclick = () => { snap = null; obraCache = new Map(); UBY.obras(true); render(target, params); };
    target.querySelectorAll("[data-obra]").forEach(el => el.onclick = () => UBY.go(`#/obras/obra/${encodeURIComponent(el.dataset.obra)}`));
    target.querySelectorAll("[data-stage]").forEach(el => el.onclick = () => { ui.stage = ui.stage === el.dataset.stage ? "all" : el.dataset.stage; render(target, params); });
    const clear = target.querySelector("#clearStage"); if (clear) clear.onclick = e => { e.preventDefault(); ui.stage = "all"; render(target, params); };
    const search = target.querySelector("#obSearch");
    if (search) search.oninput = () => { ui.search = search.value; clearTimeout(search._t); search._t = setTimeout(() => { render(target, params); const el = target.querySelector("#obSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
  }

  UBY.register("obras", { render });
})();

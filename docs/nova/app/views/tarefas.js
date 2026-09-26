/* Tarefas da equipe — mesmas regras de legado/tarefas/index.html (operational_tasks). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const STATUSES = ["Pendente", "Em andamento", "Aguardando terceiro", "Concluida"];
  const STATUS_LABEL = { Pendente: "Pendente", "Em andamento": "Em andamento", "Aguardando terceiro": "Aguardando terceiro", Concluida: "Concluída" };
  const PUB = "https://p3solarenergy-hash.github.io/ubyrecharge/tarefas/";
  const ui = { search: "", status: "", priority: "", project: "", owner: "", critical: false, view: "quadro", showDone: false };
  let tasks = null, error = null, loading = false;

  // Mesmas regras da página original.
  const daysTo = t => t.due ? t.days : 999;
  const dueText = t => { const d = daysTo(t); if (!t.due) return "Sem prazo"; if (d < 0) return `${Math.abs(d)} dia(s) atrasada`; if (d === 0) return "Hoje"; if (d === 1) return "Amanhã"; return `${d} dias`; };
  const dueBadge = t => t.status === "Concluida" ? "ok" : !t.due ? "neutral" : daysTo(t) < 0 ? "bad" : daysTo(t) <= 1 ? "warn" : "ok";
  const prioBadge = p => p === "Alta" ? "bad" : p === "Media" ? "warn" : "neutral";
  const isCritical = t => t.status !== "Concluida" && ((t.due && daysTo(t) <= 2) || t.priority === "Alta" || !t.due || !t.owner || /sem responsavel/i.test(t.owner));

  function ensure(target) {
    if (tasks || loading) return;
    loading = true;
    UBY.obras().then(r => { tasks = r.api.allTasks(); error = null; }).catch(err => { error = err.message; })
      .finally(() => { loading = false; if (location.hash.startsWith("#/tarefas")) render(target); });
  }

  function card(t) {
    const urgent = t.status !== "Concluida" && daysTo(t) < 0 ? "border-left:3px solid var(--uby-red)" : t.status !== "Concluida" && daysTo(t) === 0 ? "border-left:3px solid var(--uby-amber)" : "";
    return `<div class="mini" style="margin-bottom:8px;${urgent}"><strong style="display:block;font-size:12.5px;color:var(--uby-ink)">${esc(t.title)}</strong>
      <span class="s">${esc(t.project)} · ${esc(t.owner)}</span>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px"><span class="badge ${prioBadge(t.priority)}">${esc(t.priority === "Media" ? "Média" : t.priority)}</span><span class="badge ${dueBadge(t)}">${esc(t.status === "Concluida" && t.completedAt ? `concluída ${fmt.date(t.completedAt)}` : dueText(t))}</span></div>
      ${t.note ? `<span class="s" style="margin-top:6px;white-space:normal">${esc(t.note)}</span>` : ""}</div>`;
  }

  function render(target) {
    if (!tasks) {
      ensure(target);
      target.innerHTML = error ? `<div class="loading"><h2>Não foi possível ler as tarefas</h2><p>${esc(error)}</p></div>`
        : `<div class="loading"><div class="spinner"></div><h2>Lendo tarefas da equipe</h2></div>`;
      return;
    }
    const open = tasks.filter(t => t.status !== "Concluida");
    const late = open.filter(t => daysTo(t) < 0);
    const high = open.filter(t => t.priority === "Alta");
    const waiting = tasks.filter(t => t.status === "Aguardando terceiro");
    const byOwner = {}; open.forEach(t => byOwner[t.owner] = (byOwner[t.owner] || 0) + 1);
    const owners = Object.entries(byOwner).sort((a, b) => b[1] - a[1]);
    const insights = [];
    insights.push(late.length ? { cls: "bad", t: "Atraso exige corte diário", d: `${late.length} tarefa(s) vencidas. Primeira: ${late[0].title}.` } : { cls: "ok", t: "Sem atraso crítico", d: "Não há tarefa vencida na base atual." });
    if (high.length) insights.push({ cls: "warn", t: "Prioridade alta aberta", d: `${high.length} tarefa(s) de prioridade alta ainda abertas. Validar se travam obra ou compra.` });
    if (waiting.length) insights.push({ cls: "warn", t: "Dependência externa", d: `${waiting.length} tarefa(s) aguardando terceiro. Registrar cobrança, prazo e responsável externo.` });
    if (owners[0]) insights.push({ cls: "ok", t: "Carga por responsável", d: `${owners[0][0]} concentra ${owners[0][1]} tarefa(s) abertas. Pode precisar redistribuição.` });

    const q = ui.search.trim().toLowerCase();
    const list = tasks.filter(t => (!ui.status || t.status === ui.status) && (!ui.priority || t.priority === ui.priority) && (!ui.project || t.project === ui.project)
      && (!ui.owner || t.owner === ui.owner) && (!ui.critical || isCritical(t)) && [t.title, t.project, t.owner, t.note].join(" ").toLowerCase().includes(q));
    const projects = [...new Set(tasks.map(t => t.project))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const opt = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
    const doneCount = tasks.filter(t => t.status === "Concluida").length;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança · operational_tasks</p><h1>Tarefas</h1>
        <p class="lead">Central compartilhada de tarefas da equipe: prazos, responsáveis, prioridade e dependências externas.</p></div>
        <div class="callout"><strong>Só leitura nesta versão</strong><small>Para criar, mudar a situação ou excluir: <a href="${PUB}" target="_blank" rel="noopener">abrir Tarefas na publicada ↗</a> · <a href="#/tarefas-classico">ver tela original</a></small></div></div>
      <section class="section"><div class="grid g5">
        ${kpi("Abertas", fmt.int(open.length), `${tasks.length} no total`, "", "lead")}
        ${kpi("Atrasadas", fmt.int(late.length), "vencidas e não concluídas", "", late.length ? "bad" : "")}
        ${kpi("Vencem hoje", fmt.int(open.filter(t => daysTo(t) === 0).length), "", "", "warn")}
        ${kpi("Prioridade alta", fmt.int(high.length), "abertas")}
        ${kpi("Concluídas", fmt.int(doneCount), `${tasks.filter(t => t.status === "Concluida" && t.completedAt && Date.now() - new Date(t.completedAt).getTime() < 7 * 86400000).length} nos últimos 7 dias`)}
      </div></section>
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Leitura automática</p><h2>Sinais da equipe</h2></div></div>
          <div class="list">${insights.map(i => `<div class="list-row"><span><strong style="color:var(--uby-ink)">${esc(i.t)}</strong><small style="display:block;white-space:normal;color:var(--uby-muted)">${esc(i.d)}</small></span><span class="badge ${i.cls}">${i.cls === "bad" ? "crítico" : i.cls === "warn" ? "atenção" : "ok"}</span></div>`).join("")}</div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Carga</p><h2>Tarefas abertas por responsável</h2></div></div>
          <div class="list">${owners.map(([o, n]) => `<button class="list-row" data-owner="${esc(o)}" style="cursor:pointer;display:grid;grid-template-columns:160px 1fr 30px;gap:10px;align-items:center;text-align:left;${ui.owner === o ? "border-color:var(--uby-green);background:var(--uby-green-soft)" : ""}"><strong style="color:var(--uby-ink)">${esc(o)}</strong><div class="bar"><span style="width:${n / (owners[0][1] || 1) * 100}%"></span></div><strong>${n}</strong></button>`).join("") || `<div class="note">Nenhuma tarefa aberta.</div>`}</div></section>
      </div>
      <div class="toolbar">
        <input class="search" id="tkSearch" placeholder="Buscar tarefa, projeto, responsável ou nota" value="${esc(ui.search)}">
        <select class="select" id="tkStatus">${opt(STATUSES, ui.status, "Todas as situações")}</select>
        <select class="select" id="tkPriority">${opt(["Alta", "Media", "Baixa"], ui.priority, "Todas as prioridades")}</select>
        <select class="select" id="tkProject">${opt(projects, ui.project, "Todos os projetos")}</select>
        <label><input type="checkbox" id="tkCritical" ${ui.critical ? "checked" : ""}> Só críticas</label>
        <span class="spacer"></span>
        <div class="seg" id="tkView">${[["quadro", "Quadro"], ["lista", "Lista por prazo"]].map(([v, l]) => `<button data-v="${v}" class="${ui.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
      ${ui.owner ? `<p style="margin:-6px 0 12px;font-size:11.5px">Filtrando responsável <strong>${esc(ui.owner)}</strong> · <a href="#" id="tkClearOwner">limpar</a></p>` : ""}
      ${ui.view === "quadro" ? `<div class="grid g4" style="align-items:start">${STATUSES.map(s => {
        const items = list.filter(t => t.status === s).sort((a, b) => daysTo(a) - daysTo(b));
        const shown = s === "Concluida" && !ui.showDone ? items.slice(0, 6) : items;
        return `<section class="section" style="margin:0;padding:12px;background:var(--uby-surface-soft)"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong>${STATUS_LABEL[s]}</strong><span class="badge neutral">${items.length}</span></div>
          ${shown.map(card).join("") || `<small style="color:var(--uby-muted)">Sem tarefas</small>`}
          ${s === "Concluida" && items.length > 6 ? `<a href="#" id="tkShowDone" style="font-size:11px">${ui.showDone ? "mostrar menos" : `ver todas (${items.length})`}</a>` : ""}</section>`;
      }).join("")}</div>`
      : `<section class="section"><div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Projeto</th><th>Responsável</th><th>Situação</th><th>Prioridade</th><th>Prazo</th></tr></thead>
          <tbody>${list.slice().sort((a, b) => daysTo(a) - daysTo(b)).map(t => `<tr class="${t.status === "Concluida" ? "muted" : ""}"><td style="white-space:normal"><strong>${esc(t.title)}</strong>${t.note ? `<small>${esc(t.note)}</small>` : ""}</td><td>${esc(t.project)}</td><td>${esc(t.owner)}</td>
            <td>${esc(STATUS_LABEL[t.status] || t.status)}</td><td><span class="badge ${prioBadge(t.priority)}">${esc(t.priority === "Media" ? "Média" : t.priority)}</span></td><td><span class="badge ${dueBadge(t)}">${esc(dueText(t))}</span>${t.due ? `<small>${fmt.date(t.due + "T12:00:00")}</small>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhuma tarefa no filtro.</td></tr>`}</tbody></table></div></section>`}`;

    const rerun = () => render(target);
    const search = target.querySelector("#tkSearch");
    search.oninput = () => { ui.search = search.value; clearTimeout(search._t); search._t = setTimeout(() => { rerun(); const el = target.querySelector("#tkSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
    target.querySelector("#tkStatus").onchange = e => { ui.status = e.target.value; rerun(); };
    target.querySelector("#tkPriority").onchange = e => { ui.priority = e.target.value; rerun(); };
    target.querySelector("#tkProject").onchange = e => { ui.project = e.target.value; rerun(); };
    target.querySelector("#tkCritical").onchange = e => { ui.critical = e.target.checked; rerun(); };
    target.querySelectorAll("#tkView button").forEach(b => b.onclick = () => { ui.view = b.dataset.v; rerun(); });
    target.querySelectorAll("[data-owner]").forEach(b => b.onclick = () => { ui.owner = ui.owner === b.dataset.owner ? "" : b.dataset.owner; rerun(); });
    const clr = target.querySelector("#tkClearOwner"); if (clr) clr.onclick = e => { e.preventDefault(); ui.owner = ""; rerun(); };
    const sd = target.querySelector("#tkShowDone"); if (sd) sd.onclick = e => { e.preventDefault(); ui.showDone = !ui.showDone; rerun(); };
  }

  UBY.register("tarefas", { render });
})();

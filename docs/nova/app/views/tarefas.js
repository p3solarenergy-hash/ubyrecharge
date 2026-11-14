/* Tarefas da equipe — mesmas regras de legado/tarefas/index.html (operational_tasks). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const STATUSES = ["Pendente", "Em andamento", "Aguardando terceiro", "Concluida"];
  const STATUS_LABEL = { Pendente: "Pendente", "Em andamento": "Em andamento", "Aguardando terceiro": "Aguardando terceiro", Concluida: "Concluída" };
  const PUB = "https://ubyrecharge.net.br/tarefas/";
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

  // ---------- edição (antes só na página antiga legado/tarefas/index.html; mesmas regras) ----------
  // Relê a lista inteira do banco antes de gravar; se a leitura falhar, nada é gravado (a página
  // antiga avisava "as tarefas ainda nao foram lidas da base").
  const busy = { on: false, msg: "", bad: false };
  async function rawFromCloud() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem("uby-tarefas-v1")) || []; } catch (_) {}
    const cloud = await window.UBY_STORE.loadTasks(local);
    if (cloud === local || !Array.isArray(cloud)) throw new Error("As tarefas não foram lidas do banco agora. Nada foi gravado; tente de novo.");
    return cloud;
  }
  async function salvar(target, label, mutate) {
    if (busy.on) return;
    busy.on = true; busy.msg = `${label}…`; busy.bad = false; render(target);
    try {
      await window.UBY_SUPABASE.comGravacao("obras", async () => {
        const raw = await rawFromCloud();
        const next = await mutate(raw);
        localStorage.setItem("uby-tarefas-v1", JSON.stringify(next));
        await window.UBY_STORE.saveTasks(next);
      });
      busy.msg = `${label}: gravado.`;
      const r = await UBY.obras(true); tasks = r.api.allTasks();
    } catch (err) { busy.msg = `${label}: ${err.message}`; busy.bad = true; }
    busy.on = false;
    if (location.hash.startsWith("#/tarefas")) render(target);
  }
  const novaTarefa = f => raw => {
    const status = f.status || "Pendente", now = new Date().toISOString();
    return [{ id: "task-" + Date.now(), title: f.title, project: f.project, owner: f.owner || "Sem responsavel", due: f.due || "", priority: f.priority || "Alta", status, note: f.note || "", createdAt: now, ...(status === "Concluida" ? { completedAt: now } : {}) }, ...raw];
  };
  const mudarSituacao = (id, status) => raw => raw.map(t => {
    if (t.id !== id) return t;
    const n = { ...t, status };
    if (status === "Concluida" && t.status !== "Concluida") n.completedAt = new Date().toISOString();
    if (status !== "Concluida") delete n.completedAt;
    return n;
  });
  const excluir = id => async raw => { await window.UBY_STORE.deleteTask(id); return raw.filter(t => t.id !== id); };
  // Obras/áreas para o campo "Obra / área" (mesma lista da página antiga).
  function projetos() {
    const base = ["Administrativo", "Comercial", "Operacao", "Compras", "Concessionaria"];
    try { (JSON.parse(localStorage.getItem("uby-obras-dashboard-v1")) || []).forEach(o => base.push(o.nome)); } catch (_) {}
    return [...new Set(base)];
  }

  function card(t) {
    const urgent = t.status !== "Concluida" && daysTo(t) < 0 ? "border-left:3px solid var(--uby-red)" : t.status !== "Concluida" && daysTo(t) === 0 ? "border-left:3px solid var(--uby-amber)" : "";
    return `<div class="mini" style="margin-bottom:8px;${urgent}"><strong style="display:block;font-size:12.5px;color:var(--uby-ink)">${esc(t.title)}</strong>
      <span class="s">${esc(t.project)} · ${esc(t.owner)}</span>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px"><span class="badge ${prioBadge(t.priority)}">${esc(t.priority === "Media" ? "Média" : t.priority)}</span><span class="badge ${dueBadge(t)}">${esc(t.status === "Concluida" && t.completedAt ? `concluída ${fmt.date(t.completedAt)}` : dueText(t))}</span></div>
      ${t.note ? `<span class="s" style="margin-top:6px;white-space:normal">${esc(t.note)}</span>` : ""}
      <div style="display:flex;gap:6px;margin-top:8px"><select class="select" data-tk-status="${esc(t.id)}" style="flex:1;min-width:0" ${busy.on ? "disabled" : ""}>${STATUSES.map(s => `<option value="${s}" ${s === t.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select>
        <button class="btn" data-tk-del="${esc(t.id)}" title="Excluir tarefa" ${busy.on ? "disabled" : ""}>✕</button></div></div>`;
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
        <div class="callout"><strong>Grava na base real</strong><small>Crie, mude a situação ou exclua aqui mesmo. Antes de cada gravação a lista é relida do banco.</small></div></div>
      ${busy.msg ? `<div class="note" style="margin-bottom:12px;${busy.bad ? "border-color:var(--uby-red)" : ""}">${esc(busy.msg)}</div>` : ""}
      <section class="section"><details ${ui.newOpen ? "open" : ""} id="tkNewBox"><summary style="cursor:pointer;font-weight:800">＋ Nova tarefa</summary>
        <div class="imp-fields" style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
          <label class="imp-field"><span class="k">Tarefa</span><input class="select" id="tkNTitle" placeholder="Ex.: Cobrar protocolo da concessionária"></label>
          <label class="imp-field"><span class="k">Obra / área</span><select class="select" id="tkNProject">${projetos().map(p => `<option>${esc(p)}</option>`).join("")}</select></label>
          <label class="imp-field"><span class="k">Responsável</span><input class="select" id="tkNOwner" placeholder="Nome ou equipe"></label>
          <label class="imp-field"><span class="k">Prazo</span><input class="select" type="date" id="tkNDue"></label>
          <label class="imp-field"><span class="k">Prioridade</span><select class="select" id="tkNPriority"><option value="Alta">Alta</option><option value="Media">Média</option><option value="Baixa">Baixa</option></select></label>
          <label class="imp-field"><span class="k">Situação</span><select class="select" id="tkNStatus">${STATUSES.map(s => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("")}</select></label>
          <label class="imp-field" style="grid-column:1/-1"><span class="k">Observação</span><textarea class="select" id="tkNNote" rows="2" placeholder="Contexto, próxima ação, protocolo ou dependência"></textarea></label>
        </div>
        <button class="btn primary" id="tkNSave" style="margin-top:10px" ${busy.on ? "disabled" : ""}>Criar tarefa</button></details></section>
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
    const nb = target.querySelector("#tkNewBox"); if (nb) nb.ontoggle = () => { ui.newOpen = nb.open; };
    const ns = target.querySelector("#tkNSave");
    if (ns) ns.onclick = () => {
      const v = id => (target.querySelector(id)?.value || "").trim();
      const f = { title: v("#tkNTitle"), project: v("#tkNProject"), owner: v("#tkNOwner"), due: v("#tkNDue"), priority: v("#tkNPriority"), status: v("#tkNStatus"), note: v("#tkNNote") };
      if (!f.title) { alert("Informe a tarefa."); return; }
      ui.newOpen = false;
      salvar(target, `Nova tarefa "${f.title}"`, novaTarefa(f));
    };
    target.querySelectorAll("[data-tk-status]").forEach(el => el.onchange = () => {
      const t = tasks.find(x => x.id === el.dataset.tkStatus);
      salvar(target, `Situação de "${t?.title || "tarefa"}" → ${STATUS_LABEL[el.value]}`, mudarSituacao(el.dataset.tkStatus, el.value));
    });
    target.querySelectorAll("[data-tk-del]").forEach(el => el.onclick = () => {
      const t = tasks.find(x => x.id === el.dataset.tkDel);
      if (!confirm(`Excluir a tarefa "${t?.title || ""}"?`)) return;
      salvar(target, `Excluir "${t?.title || "tarefa"}"`, excluir(el.dataset.tkDel));
    });
  }

  UBY.register("tarefas", { render });
})();

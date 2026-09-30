/*
  NOVA PLATAFORMA — API do motor de obras.
  Roda DENTRO de legado/obra-ev/motor-obras.html (cópia do dashboard de obras
  original, index.html) e reaproveita o mesmo estado e as mesmas funções:
  obras, prospects, stageLabel, detailStats, phasePctFromDetail,
  workDeliveryRisks, deadlineAlertItems, taskDaysUntil, operationalTasks.
*/
(function () {
  "use strict";
  let readyPromise = null;

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      // Mesma sequência do initData() original, aguardada até o fim.
      try { await window.UBY_ACTIVITY?.refresh?.(); } catch (_) {}
      await refreshCloudData();
      await refreshOperationalTasks();
      return true;
    })();
    return readyPromise;
  }

  const detailOf = obra => {
    if (obra?.detail?.project) return obra.detail;
    try { return JSON.parse(localStorage.getItem(detailKey(obra.id)) || "null"); } catch (_) { return null; }
  };
  const daysLabel = d => d === 999 ? "sem prazo" : d < 0 ? `${Math.abs(d)} dia(s) em atraso` : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`;

  function snapshot() {
    const list = obras.map(o => {
      const detail = detailOf(o);
      const p = detail?.project || {};
      const phases = (detail?.phases || []).map(ph => {
        const tasks = ph.tasks || [];
        const ok = tasks.filter(t => t.status === "done" || t.status === "na").length;
        return { name: ph.name, owner: ph.owner || "", total: tasks.length, done: ok, doing: tasks.filter(t => t.status === "doing").length,
          pct: tasks.length ? Math.round(ok / tasks.length * 100) : 0 };
      });
      const current = phases.find(ph => ph.pct < 100);
      return {
        id: o.id, nome: o.nome, cliente: o.cliente, local: o.local, status: o.status, stage: stageLabel(o.status || ""), kind: o.kind,
        pct: Number(o.pct || 0), kw: Number(o.kw || 0), carregadores: o.carregadores || "", crit: Number(o.crit || 0), flags: o.flags || [],
        entrega: p.entrega || "", entregaDias: p.entrega ? taskDaysUntil(p.entrega) : null, currentPhase: current ? current.name : (phases.length ? "Concluída" : ""),
        phases, hasDetail: !!detail, structureGap: (() => { const m = missingOf(detail || {}); return m.phases + m.tasks + m.docs; })(), pending: (detail?.operation?.pendingItems || []).filter(i => i.status !== "Concluida").length,
        mapLocation: p.mapLocation || o.mapLocation || null
      };
    });

    // Avanço por fase: mesma fórmula de phaseProgress(), priorizando o detalhe
    // oficial da nuvem (o original lia só a cópia local do navegador).
    const phaseStats = phaseLabels.map(([label, needle]) => {
      const values = obras.map(obra => {
        const fallback = /conclu/i.test(obra.status) ? 100 : Number(obra.pct || 0);
        const detail = detailOf(obra);
        return detail ? phasePctFromDetail(detail, needle, fallback) : fallback;
      });
      return { label, pct: values.length ? Math.round(values.reduce((a, v) => a + v, 0) / values.length) : 0 };
    });

    const order = ["Prospecção / Estudo", "Projeto", "Aguardando cliente", "Em obra", "Concluida"];
    const pipeline = order.map(stage => ({ stage, count: obras.filter(o => stageLabel(o.status) === stage).length }));

    // Central de prazos (renderDeadlineCommand).
    const tasks = operationalTasks();
    const open = tasks.filter(t => t.status !== "Concluida");
    const taskRow = t => ({ id: t.id, title: t.title, project: t.project || "Geral", owner: t.owner || "", due: t.due || "", days: taskDaysUntil(t.due),
      priority: t.priority || "", status: t.status || "", completedAt: t.completedAt || "" });
    const late = open.filter(t => t.due && taskDaysUntil(t.due) < 0).sort((a, b) => taskDaysUntil(a.due) - taskDaysUntil(b.due)).map(taskRow);
    const soon = open.filter(t => t.due && taskDaysUntil(t.due) >= 0 && taskDaysUntil(t.due) <= 7).sort((a, b) => taskDaysUntil(a.due) - taskDaysUntil(b.due)).map(taskRow);
    const hygiene = open.filter(t => !t.due || !t.owner || /sem responsavel/i.test(t.owner)).map(taskRow);
    const workRisks = workDeliveryRisks().map(i => ({ id: i.obra.id, nome: i.obra.nome, delivery: i.delivery, days: i.days, label: daysLabel(i.days) }));
    const critical = deadlineAlertItems(tasks);
    const weekStart = Date.now() - 7 * 86400000;
    const doneWeek = tasks.filter(t => t.status === "Concluida" && t.completedAt && new Date(t.completedAt).getTime() >= weekStart)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).map(taskRow);

    // Pendências registradas dentro das obras (obras_pendencias_geral.js).
    const pend = obras.flatMap(work => {
      const detail = detailOf(work);
      return (detail?.operation?.pendingItems || []).filter(i => i.status !== "Concluida")
        .map(i => ({ title: i.title, owner: i.owner || "", status: i.status || "Pendente", waitingOn: i.waitingOn || "", due: i.due || "",
          days: i.due ? taskDaysUntil(i.due) : null, workId: work.id, workName: work.nome || detail?.project?.obraNome || "Obra" }));
    });

    // Leituras macro (renderMacro).
    const sorted = sortObras(obras);
    const low = sorted.filter(o => o.pct < 50);
    const highPower = [...obras].sort((a, b) => b.kw - a.kw)[0];
    const stuck = sorted.find(o => o.crit > 0) || low[0];
    const priority = (prospects || []).filter(p => String(p.prioridade || "").startsWith("1."));
    const macro = [];
    if (stuck) macro.push({ title: "Atenção operacional", text: `${stuck.nome} pede foco: ${stuck.pct}% de avanço, ${stuck.crit} crítica(s) e status ${stuck.status}.`, tone: stuck.crit ? "bad" : "warn" });
    if (highPower) macro.push({ title: "Maior impacto técnico", text: `${highPower.nome} concentra ${highPower.kw} kW. Antes de acelerar compras, validar demanda, DLM e concessionária.`, tone: highPower.kw >= 50 ? "warn" : "ok" });
    macro.push({ title: "Prospecção alimentando obras", text: `${priority.length} ponto(s) de prioridade 1 na base. Próximo corte: transformar estudo aprovado em obra vinculada.`, tone: "ok" });

    let messages = [], activity = [];
    try {
      messages = (window.UBY_ACTIVITY?.messages({ limit: 30 }) || []).map(m => ({ at: m.createdAt, user: m.user?.label || "Usuário", work: m.workName || "Geral", text: m.text }));
      activity = (window.UBY_ACTIVITY?.list({ limit: 35 }) || []).map(a => ({ at: a.createdAt, user: a.user?.label || "Usuário", work: a.workName || "Geral",
        title: a.title || window.UBY_ACTIVITY.summarize(a), detail: a.detail || "", after: a.after || "" }));
    } catch (_) {}

    return JSON.parse(JSON.stringify({
      stats: { count: obras.length, avgPct: obras.length ? Math.round(obras.reduce((a, o) => a + o.pct, 0) / obras.length) : 0,
        crit: obras.reduce((a, o) => a + o.crit, 0), kw: obras.reduce((a, o) => a + o.kw, 0), criticalAlerts: critical.length,
        lateTasks: late.length, lateDeliveries: workRisks.filter(i => i.days <= 0).length },
      works: list, phases: phaseStats, pipeline,
      deadlines: { late, soon, works: workRisks, hygiene, critical },
      tasks: { open: open.length, total: tasks.length, doneWeek, today: open.filter(t => taskDaysUntil(t.due) <= 0).map(taskRow),
        week: open.filter(t => { const d = taskDaysUntil(t.due); return d >= 1 && d <= 7; }).map(taskRow) },
      pending: { all: pend, late: pend.filter(i => i.days !== null && i.days < 0), soon: pend.filter(i => i.days !== null && i.days >= 0 && i.days <= 7),
        waiting: pend.filter(i => i.status === "Aguardando terceiro") },
      prospects: (prospects || []).map(p => ({ id: p.id, ponto: p.ponto, cidade: p.cidade, uf: p.uf, tipo: p.tipo, contato: p.contato || "", prioridade: p.prioridade || "",
        status: p.status || "", etapa: p.etapa || "", acao: p.acao || "", kw: p.kw || "", trafo: p.trafo || "", disjuntor: p.disjuntor || "" })),
      // "Sincronizado" só vale se a lista de obras veio mesmo da nuvem (UBY_WORKS_CLOUD, gravado por loadWorks).
      cloud: (() => { const t = String(document.getElementById("cloudStatus")?.textContent || ""); const w = window.UBY_WORKS_CLOUD;
        if (w && w.ok === false) return { text: `leitura das obras falhou: ${w.error}`, ok: false };
        return { text: t, ok: /^Sincronizado com a nuvem/i.test(t) && (!w || w.ok === true), count: w && w.count }; })(),
      macro, messages, activity, loadedAt: new Date().toISOString()
    }));
  }

  // Detalhe de uma obra — mesmas regras de gestao_obra_ev_detalhe.html:
  // avanço = (OK + N/A) ÷ tarefas; críticas = pendentes/em andamento nas fases
  // Concessionária, Orçamentos, Materiais e Obra elétrica.
  const CRITICAL_PHASES = ["Concessionaria", "Orcamentos e contratacoes", "Materiais e equipamentos", "Obra eletrica"];
  const STATUS_LABEL = { pending: "Pendente", doing: "Em andamento", done: "Concluído", na: "Não se aplica" };
  const taskStats = tasks => {
    const total = tasks.length, done = tasks.filter(t => t.status === "done").length, na = tasks.filter(t => t.status === "na").length;
    const doing = tasks.filter(t => t.status === "doing").length, pending = tasks.filter(t => t.status === "pending").length;
    return { total, done, na, doing, pending, pct: total ? Math.round((done + na) / total * 100) : 0 };
  };

  function obraDetail(id) {
    const obra = obras.find(o => String(o.id) === String(id));
    if (!obra) return null;
    const detail = detailOf(obra) || {};
    const p = detail.project || {};
    const phases = (detail.phases || []).map(ph => ({
      name: ph.name, owner: ph.owner || "", stats: taskStats(ph.tasks || []), critical: CRITICAL_PHASES.includes(ph.name),
      tasks: (ph.tasks || []).map(t => ({ id: t.id, title: t.title, status: t.status || "pending", statusLabel: STATUS_LABEL[t.status] || "Pendente",
        note: t.note || "", protocol: t.protocol || "", requestDate: t.requestDate || "", forecastDate: t.forecastDate || "" }))
    }));
    const allTasks = phases.flatMap(ph => ph.tasks.map(t => ({ ...t, phase: ph.name })));
    const crit = allTasks.filter(t => CRITICAL_PHASES.includes(t.phase) && ["pending", "doing"].includes(t.status));
    const docs = (detail.documents || []).map(d => ({ id: d.id, name: d.name, phase: d.phase || "", status: d.status || "pending", statusLabel: STATUS_LABEL[d.status] || "Pendente",
      owner: d.owner || "", due: d.due || "", link: d.link || "", fileName: d.fileName || d.file?.name || "" }));
    const pending = (detail.operation?.pendingItems || []).map(i => ({ id: i.id, title: i.title, owner: i.owner || "", status: i.status || "Pendente", waitingOn: i.waitingOn || "",
      due: i.due || "", days: i.due ? taskDaysUntil(i.due) : null, priority: i.priority || "", category: i.category || "", note: i.note || "", completedAt: i.completedAt || "" }));
    const pr = detail.prospecting || {};
    let activity = [], messages = [];
    try {
      activity = (window.UBY_ACTIVITY?.list({ workId: obra.id, limit: 40 }) || []).map(a => ({ at: a.createdAt, user: a.user?.label || "Usuário", title: a.title || window.UBY_ACTIVITY.summarize(a), detail: a.detail || "", after: a.after || "" }));
      messages = (window.UBY_ACTIVITY?.messages({ workId: obra.id, limit: 40 }) || []).map(m => ({ at: m.createdAt, user: m.user?.label || "Usuário", text: m.text }));
    } catch (_) {}
    const qtd = parseInt(p.qtdCarregadores, 10) || 0, kw = parseInt(p.potenciaCarregador, 10) || 0;
    const worst = phases.slice().sort((a, b) => a.stats.pct - b.stats.pct)[0];
    return JSON.parse(JSON.stringify({
      id: obra.id, nome: p.obraNome || obra.nome, cliente: p.cliente || obra.cliente, local: p.local || obra.local, status: p.statusExec || obra.status,
      stage: stageLabel(p.statusExec || obra.status || ""), qtd, kw, totalKw: qtd * kw, entrega: p.entrega || "", entregaDias: p.entrega ? taskDaysUntil(p.entrega) : null,
      sheetUrl: p.obraSheetUrl || obra.obraSheetUrl || "", mapLocation: p.mapLocation || obra.mapLocation || null, archived: !!(detail.archived || obra.archived),
      stats: taskStats(allTasks.map(t => ({ status: t.status }))), hasDetail: !!detail.project, worstPhase: worst ? { name: worst.name, pct: worst.stats.pct } : null,
      phases, critical: crit.map(t => ({ phase: t.phase, title: t.title, status: t.statusLabel, protocol: t.protocol, forecastDate: t.forecastDate, requestDate: t.requestDate })),
      structureMissing: missingOf(detail), documents: docs, docsOk: docs.filter(d => d.status === "done" || d.status === "na").length,
      pending, pendingOpen: pending.filter(i => i.status !== "Concluida").length,
      analysis: p.analysis ? { title: p.analysis.title || "", url: p.analysis.url || "", peak: p.analysis.peak || "", consumption: p.analysis.consumption || "",
        ev: p.analysis.ev || "", status: p.analysis.status || "", utility: p.analysis.utility || "", action: p.analysis.action || "" } : null,
      prospecting: { stage: pr.stage || "", responsible: pr.responsible || "", contactName: pr.contactName || "", contactRole: pr.contactRole || "", phone: pr.phone || "",
        email: pr.email || "", nextAction: pr.nextAction || "", nextActionDate: pr.nextActionDate || "", notes: pr.notes || "",
        protocols: (pr.protocols || []).map(x => ({ number: x.number || "", name: x.name || x.category || "", status: x.status || "", deadline: x.deadline || "", reference: x.reference || "" })),
        documents: (pr.documents || []).length, contractClosed: !!pr.contract?.closed, contractClosedAt: pr.contract?.closedAt || "" },
      activity, messages
    }));
  }

  // Tarefas da equipe (operational_tasks), já carregadas por refreshOperationalTasks().
  function allTasks() {
    return JSON.parse(JSON.stringify(operationalTasks().map(t => ({
      id: t.id, title: t.title || "", project: t.project || "Geral", owner: t.owner || "Sem responsavel", due: t.due || "",
      days: t.due ? taskDaysUntil(t.due) : null, priority: t.priority || "Media", status: t.status || "Pendente", note: t.note || "",
      createdAt: t.createdAt || "", completedAt: t.completedAt || ""
    }))));
  }

  // ---------------------------------------------------------------------
  // Edição de obras na Nova (27/09/2026, usuário: "desses arrume o obras").
  // Só grava no quadro de edição (#obrasEditFrame) — a ponte libera o escopo
  // "obras" apenas ali. Cada gravação RELÊ a obra na nuvem e aplica só a
  // alteração pedida (ops), para nunca sobrescrever o que outra pessoa gravou.
  // ---------------------------------------------------------------------
  const EDIT_CRITICAL = ["Concessionaria", "Orcamentos e contratacoes", "Materiais e equipamentos", "Obra eletrica"];
  const clone = v => JSON.parse(JSON.stringify(v));
  const matches = (item, sel) => item && typeof item === "object" && Object.entries(sel).every(([k, v]) => String(item[k]) === String(v));

  // Caminho: ["phases", {name: "Concessionaria"}, "tasks", {id: "x"}, "status"].
  function walk(root, path, create) {
    let node = root;
    for (let i = 0; i < path.length - 1; i += 1) {
      const step = path[i], next = path[i + 1];
      let child = typeof step === "object" ? (Array.isArray(node) ? node.find(it => matches(it, step)) : undefined) : node[step];
      if (child === undefined || child === null) {
        if (!create || typeof step === "object") throw new Error(`Item não encontrado na obra (${JSON.stringify(step)}). Recarregue e tente de novo.`);
        child = typeof next === "object" || next === undefined ? [] : {};
        node[step] = child;
      }
      node = child;
    }
    return { parent: node, key: path[path.length - 1] };
  }
  function applyOps(detail, ops) {
    ops.forEach(op => {
      if (op.set) {
        const { parent, key } = walk(detail, op.set, true);
        if (typeof key === "object") { const i = parent.findIndex(it => matches(it, key)); if (i < 0) throw new Error("Item não encontrado."); parent[i] = { ...parent[i], ...op.value }; }
        else parent[key] = op.value;
      } else if (op.push) {
        const { parent } = walk(detail, [...op.push, { __lista: 1 }], true); // o seletor final só força criar uma lista
        const list = parent;
        if (!Array.isArray(list)) throw new Error("Lista inválida.");
        list.push(op.value);
      } else if (op.remove) {
        const { parent, key } = walk(detail, op.remove, false);
        const i = Array.isArray(parent) ? parent.findIndex(it => matches(it, key)) : -1;
        if (i >= 0) parent.splice(i, 1);
      }
    });
    return detail;
  }
  function cardOf(id, detail, row = {}) {
    const p = detail.project || {};
    const tasks = (detail.phases || []).flatMap(ph => (ph.tasks || []).map(t => ({ ...t, phase: ph.name })));
    const done = tasks.filter(t => t.status === "done" || t.status === "na").length;
    const qtd = parseInt(p.qtdCarregadores, 10) || 1, kw = parseInt(p.potenciaCarregador, 10) || 60;
    return {
      id: String(id), nome: p.obraNome || row.nome || String(id), cliente: p.cliente || row.cliente || "", local: p.local || row.local || "",
      status: p.statusExec || row.status_exec || "Projeto",
      pct: tasks.length ? Math.round(done / tasks.length * 100) : Number(row.progresso || 0),
      kw: qtd * kw, carregadores: `${qtd} x ${kw} kW`,
      crit: tasks.filter(t => EDIT_CRITICAL.includes(t.phase) && ["pending", "doing"].includes(t.status)).length
    };
  }
  function requireWrite() {
    if (window.UBY_WRITE_SCOPE !== "obras") throw new Error("Gravação de obras indisponível nesta tela. Nada foi gravado.");
  }
  async function readRow(id) {
    const { data, error } = await window.UBY_SUPABASE.client().from("obras").select("id,nome,cliente,local,status_exec,progresso,potencia_kw,carregadores,criticas,raw_data").eq("id", String(id)).maybeSingle();
    if (error) throw new Error(`Não consegui ler a obra na nuvem (${error.message}). Nada foi gravado.`);
    return data;
  }
  function seedFor(row) {
    const [q, k] = String(row.carregadores || "1 x 60").split("x").map(s => parseInt(s, 10));
    return createDetailSeed({ nome: row.nome, cliente: row.cliente, local: row.local, status: row.status_exec || "Projeto" }, q || 1, k || Number(row.potencia_kw) || 60);
  }
  async function rawDetail(id) {
    const row = await readRow(id);
    if (!row) throw new Error("Obra não encontrada na nuvem.");
    return clone(row.raw_data?.project ? row.raw_data : seedFor(row));
  }
  // Estrutura padrão de toda obra (mesma do original): 10 fases com checklist + 7 documentos + prospecção.
  const DOC_DEFAULTS = [
    { id: "doc-contrato", name: "Contrato ou proposta aprovada", phase: "Documentacao", owner: "Cliente / UBY" },
    { id: "doc-art", name: "ART / TRT", phase: "Projeto", owner: "Responsavel tecnico" },
    { id: "doc-projeto", name: "Projeto eletrico executivo", phase: "Projeto", owner: "Engenharia" },
    { id: "doc-concessionaria", name: "Protocolo / aprovacao concessionaria", phase: "Concessionaria", owner: "UBY" },
    { id: "doc-orcamentos", name: "Orcamentos aprovados", phase: "Orcamentos", owner: "Compras" },
    { id: "doc-fotos", name: "Fotos antes, durante e entrega", phase: "Obra", owner: "Equipe de campo" },
    { id: "doc-comissionamento", name: "Teste e termo de entrega", phase: "Comissionamento", owner: "Tecnico UBY" }
  ].map(d => ({ ...d, status: "pending", due: "", link: "" }));
  const PROSPECT_DEFAULTS = { stage: "Triagem inicial", responsible: "", contactName: "", contactRole: "", phone: "", email: "", nextAction: "", nextActionDate: "", notes: "", protocols: [], documents: [] };
  const standardSeed = () => createDetailSeed({ nome: "", cliente: "", local: "", status: "Projeto" }, 1, 60);

  // Só ACRESCENTA o que falta (fases, tarefas por título, documentos por id, campos de prospecção); nunca altera nem apaga o que já existe.
  function completeDetail(detail) {
    const seed = standardSeed(), added = { phases: 0, tasks: 0, docs: 0 };
    detail.phases = Array.isArray(detail.phases) ? detail.phases : [];
    seed.phases.forEach(sp => {
      let ph = detail.phases.find(p => p.name === sp.name);
      if (!ph) { ph = { name: sp.name, owner: sp.owner, tasks: [] }; detail.phases.push(ph); added.phases += 1; }
      ph.tasks = Array.isArray(ph.tasks) ? ph.tasks : [];
      sp.tasks.forEach(st => { if (!ph.tasks.some(t => t.title === st.title)) { ph.tasks.push(clone(st)); added.tasks += 1; } });
    });
    detail.documents = Array.isArray(detail.documents) ? detail.documents : [];
    DOC_DEFAULTS.forEach(d => { if (!detail.documents.some(x => x.id === d.id)) { detail.documents.push(clone(d)); added.docs += 1; } });
    detail.prospecting = { ...clone(PROSPECT_DEFAULTS), ...(detail.prospecting || {}) };
    detail.prospecting.protocols = detail.prospecting.protocols || [];
    detail.prospecting.documents = detail.prospecting.documents || [];
    detail.operation = detail.operation || {};
    detail.operation.pendingItems = detail.operation.pendingItems || [];
    return added;
  }
  function missingOf(detail) {
    return completeDetail(clone(detail || {}));
  }
  // Completa uma obra com a estrutura padrão, gravando só o que faltava (relê a obra na nuvem antes).
  async function completeObra(id) {
    requireWrite();
    const row = await readRow(id);
    if (!row) throw new Error("Obra não encontrada na nuvem. Nada foi gravado."); // nunca cria/sobrescreve a partir de cópia local
    const detail = clone(row.raw_data?.project ? row.raw_data : seedFor(row));
    const added = completeDetail(detail);
    if (!added.phases && !added.tasks && !added.docs && row.raw_data?.project) return { id, added, changed: false };
    const card = cardOf(id, detail, row);
    const saved = await window.UBY_STORE.saveWork(card, detail);
    if (!saved?.cloud) throw new Error("Não consegui gravar na nuvem (sessão expirada?). Entre de novo e tente outra vez.");
    const check = await readRow(id);
    if (!(check?.raw_data?.phases || []).length) throw new Error("A gravação não confirmou na nuvem. Tente de novo.");
    try { window.UBY_ACTIVITY?.record({ workId: card.id, workName: card.nome, type: "update", title: "Estrutura padrão completada na Nova Plataforma", after: `+${added.phases} fase(s), +${added.tasks} tarefa(s), +${added.docs} documento(s)` }); } catch (_) {}
    return { id, added, changed: true };
  }
  async function completeAll(ids) {
    const out = [];
    for (const id of ids) { try { out.push(await completeObra(id)); } catch (err) { out.push({ id, error: err.message }); } }
    return out;
  }

  async function editObra(id, ops, note = {}) {
    requireWrite();
    const row = await readRow(id);
    if (!row) throw new Error("Obra não encontrada na nuvem. Nada foi gravado.");
    const detail = applyOps(clone(row.raw_data?.project ? row.raw_data : seedFor(row)), ops || []);
    if (!detail.project || !Array.isArray(detail.phases)) throw new Error("Detalhe da obra incompleto. Nada foi gravado.");
    const card = cardOf(id, detail, row);
    await window.UBY_STORE.saveWork(card, detail);
    try { window.UBY_ACTIVITY?.record({ workId: card.id, workName: card.nome, type: note.type || "project", title: note.title || "Obra atualizada na Nova Plataforma", detail: note.detail || "", field: note.field || "", before: note.before || "", after: note.after || "" }); } catch (_) {}
    return clone({ card, detail });
  }
  function slug(text) {
    return String(text || "obra").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "obra";
  }
  async function createObra(f) {
    requireWrite();
    if (!String(f.nome || "").trim()) throw new Error("Informe o nome da obra.");
    const base = slug(f.nome);
    let id = base;
    for (let n = 2; await readRow(id); n += 1) id = `${base}-${n}`;
    const qtd = parseInt(f.qtd, 10) || 1, pot = parseInt(f.kw, 10) || 60;
    const detail = createDetailSeed({ nome: f.nome.trim(), cliente: (f.cliente || f.nome).trim(), local: (f.local || "").trim(), status: f.status || "Prospecção / Estudo" }, qtd, pot);
    if (f.entrega) detail.project.entrega = f.entrega;
    const card = cardOf(id, detail, {});
    await window.UBY_STORE.saveWork(card, detail);
    try { window.UBY_ACTIVITY?.record({ workId: id, workName: card.nome, type: "project", title: "Obra criada na Nova Plataforma", after: `${card.status} · ${card.carregadores}` }); } catch (_) {}
    return clone({ id, card });
  }

  const missingByWork = () => obras.map(o => ({ id: o.id, nome: o.nome, missing: missingOf(detailOf(o) || {}) }));
  window.UBY_OBRAS_API = { ready, snapshot, obraDetail, allTasks, rawDetail, editObra, createObra, applyOps, cardOf, completeObra, completeAll, missingOf, missingByWork, completeDetail };
})();

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
        phases, hasDetail: !!detail, pending: (detail?.operation?.pendingItems || []).filter(i => i.status !== "Concluida").length,
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
      documents: docs, docsOk: docs.filter(d => d.status === "done" || d.status === "na").length,
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

  window.UBY_OBRAS_API = { ready, snapshot, obraDetail, allTasks };
})();

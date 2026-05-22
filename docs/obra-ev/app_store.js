(function () {
  const WORKS_KEY = "uby-obras-dashboard-v1";
  const TASKS_KEY = "uby-tarefas-v1";
  const ACTIVITY_KEY = "uby-activity-v1";
  const MESSAGE_KEY = "uby-messages-v1";
  const MARKET_KEY = "uby-mercado-v1";
  const CORE_WORK_IDS = new Set(["rio", "malassise", "prospect-1", "prospect-29"]);

  function available() {
    return Boolean(window.UBY_SUPABASE?.configured?.() && window.UBY_SUPABASE?.client?.());
  }

  async function requireUser() {
    if (!available()) return null;
    return await window.UBY_SUPABASE.currentUser();
  }

  function readLocal(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function workToRow(work, detail) {
    return {
      id: String(work.id),
      nome: work.nome,
      cliente: work.cliente || "",
      local: work.local || "",
      status_exec: work.status || work.status_exec || "Projeto",
      progresso: Number(work.pct ?? work.progresso ?? 0),
      potencia_kw: Number(work.kw ?? work.potencia_kw ?? 0),
      carregadores: work.carregadores || "",
      criticas: Number(work.crit ?? work.criticas ?? 0),
      origem: "app",
      raw_data: detail || work,
      updated_at: new Date().toISOString()
    };
  }

  function rowToWork(row) {
    const raw = row.raw_data || {};
    return {
      id: row.id,
      nome: row.nome,
      cliente: row.cliente || raw.cliente || row.nome,
      local: row.local || raw.local || "",
      status: row.status_exec || raw.status || "Projeto",
      kind: raw.kind || ((row.criticas || 0) ? "danger" : "warn"),
      pct: Number(row.progresso || 0),
      kw: Number(row.potencia_kw || 0),
      carregadores: row.carregadores || raw.carregadores || "",
      crit: Number(row.criticas || 0),
      flags: raw.flags || [],
      link: raw.link || (row.id === "rio" ? "gestao_obra_ev_detalhe.html" : `gestao_obra_ev_detalhe.html?obra=${row.id}`)
    };
  }

  function taskToRow(task) {
    return {
      id: String(task.id),
      titulo: task.title,
      projeto: task.project || "",
      responsavel: task.owner || "",
      prazo: task.due || null,
      prioridade: task.priority || "Media",
      status: task.status || "Pendente",
      observacao: task.note || "",
      raw_data: task,
      updated_at: new Date().toISOString()
    };
  }

  function rowToTask(row) {
    return {
      id: row.id,
      title: row.titulo,
      project: row.projeto || "",
      owner: row.responsavel || "",
      due: row.prazo || "",
      priority: row.prioridade || "Media",
      status: row.status || "Pendente",
      note: row.observacao || ""
    };
  }

  function activityToRow(item) {
    return {
      id: String(item.id),
      obra_id: item.workId || "geral",
      obra_nome: item.workName || "Geral",
      tipo: item.type || "update",
      titulo: item.title || "",
      detalhe: item.detail || "",
      campo: item.field || "",
      valor_anterior: item.before || "",
      valor_novo: item.after || "",
      usuario_id: item.user?.id || "",
      usuario_nome: item.user?.label || "",
      usuario_email: item.user?.email || "",
      raw_data: item,
      created_at_client: item.createdAt || new Date().toISOString()
    };
  }

  function rowToActivity(row) {
    const raw = row.raw_data || {};
    return {
      ...raw,
      id: row.id,
      createdAt: raw.createdAt || row.created_at_client || row.created_at,
      user: raw.user || {
        id: row.usuario_id || "",
        label: row.usuario_nome || row.usuario_email || "Usuario",
        email: row.usuario_email || ""
      },
      workId: row.obra_id || raw.workId || "geral",
      workName: row.obra_nome || raw.workName || "Geral",
      type: row.tipo || raw.type || "update",
      title: row.titulo || raw.title || "",
      detail: row.detalhe || raw.detail || "",
      field: row.campo || raw.field || "",
      before: row.valor_anterior || raw.before || "",
      after: row.valor_novo || raw.after || ""
    };
  }

  function messageToRow(item) {
    return {
      id: String(item.id),
      obra_id: item.workId || "geral",
      obra_nome: item.workName || "Geral",
      mensagem: item.text || "",
      usuario_id: item.user?.id || "",
      usuario_nome: item.user?.label || "",
      usuario_email: item.user?.email || "",
      raw_data: item,
      created_at_client: item.createdAt || new Date().toISOString()
    };
  }

  function marketToRow(item) {
    return {
      id: String(item.id),
      tipo: item.type || "indicador",
      titulo: item.title || "",
      valor: item.value || "",
      unidade: item.unit || "",
      segmento: item.segment || "",
      regiao: item.region || "",
      status: item.status || "",
      fonte: item.source || "",
      url: item.url || "",
      observacao: item.note || "",
      raw_data: item,
      updated_at: item.updatedAt || new Date().toISOString()
    };
  }

  function rowToMarket(row) {
    const raw = row.raw_data || {};
    return {
      ...raw,
      id: row.id,
      type: row.tipo || raw.type || "indicador",
      title: row.titulo || raw.title || "",
      value: row.valor || raw.value || "",
      unit: row.unidade || raw.unit || "",
      segment: row.segmento || raw.segment || "",
      region: row.regiao || raw.region || "",
      status: row.status || raw.status || "",
      source: row.fonte || raw.source || "",
      url: row.url || raw.url || "",
      note: row.observacao || raw.note || "",
      updatedAt: row.updated_at || raw.updatedAt || row.created_at
    };
  }

  function rowToMessage(row) {
    const raw = row.raw_data || {};
    return {
      ...raw,
      id: row.id,
      createdAt: raw.createdAt || row.created_at_client || row.created_at,
      user: raw.user || {
        id: row.usuario_id || "",
        label: row.usuario_nome || row.usuario_email || "Usuario",
        email: row.usuario_email || ""
      },
      workId: row.obra_id || raw.workId || "geral",
      workName: row.obra_nome || raw.workName || "Geral",
      text: row.mensagem || raw.text || ""
    };
  }

  function mergeById(localItems, cloudItems) {
    const map = new Map();
    [...cloudItems, ...localItems].forEach(item => {
      if (item?.id) map.set(item.id, item);
    });
    return [...map.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  async function cloudSelect(table, columns = "*") {
    const user = await requireUser();
    if (!user) return null;
    const { data, error } = await window.UBY_SUPABASE.client().from(table).select(columns);
    if (error) throw error;
    return data || [];
  }

  async function loadWorks(fallback) {
    try {
      const rows = await cloudSelect("obras");
      if (!rows) return fallback;
      const works = rows.map(rowToWork);
      const merged = mergeWorks(fallback, works);
      if (merged.length) writeLocal(WORKS_KEY, merged);
      return merged.length ? merged : fallback;
    } catch (err) {
      console.warn("Falha ao ler obras no Supabase:", err.message);
      return fallback;
    }
  }

  function mergeWorks(localItems = [], cloudItems = []) {
    const byId = new Map();
    localItems.forEach(item => {
      if (item?.id) byId.set(item.id, item);
    });
    cloudItems.forEach(item => {
      if (item?.id) byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
    });
    return [...byId.values()];
  }

  async function saveWork(work, detail) {
    writeLocal(WORKS_KEY, mergeLocalWork(work));
    const user = await requireUser();
    if (!user) return { cloud: false };
    const { error } = await window.UBY_SUPABASE.client().from("obras").upsert(workToRow(work, detail), { onConflict: "id" });
    if (error) throw error;
    return { cloud: true };
  }

  function mergeLocalWork(work) {
    const current = readLocal(WORKS_KEY, []);
    const idx = current.findIndex(item => item.id === work.id);
    if (idx >= 0) current[idx] = { ...current[idx], ...work };
    else current.unshift(work);
    return current;
  }

  async function deleteWork(id) {
    if (CORE_WORK_IDS.has(String(id))) {
      throw new Error("Esta obra faz parte da base principal e nao pode ser excluida.");
    }
    writeLocal(WORKS_KEY, readLocal(WORKS_KEY, []).filter(item => item.id !== id));
    const user = await requireUser();
    if (!user) return { cloud: false };
    const { error } = await window.UBY_SUPABASE.client().from("obras").delete().eq("id", id);
    if (error) throw error;
    return { cloud: true };
  }

  async function loadDetail(id, fallback) {
    try {
      const user = await requireUser();
      if (!user) return fallback;
      const { data, error } = await window.UBY_SUPABASE.client().from("obras").select("raw_data").eq("id", id).maybeSingle();
      if (error) throw error;
      return data?.raw_data?.project ? data.raw_data : fallback;
    } catch (err) {
      console.warn("Falha ao ler detalhe no Supabase:", err.message);
      return fallback;
    }
  }

  async function saveDetail(id, detail, card) {
    localStorage.setItem(`uby-obra-detalhe-${id}`, JSON.stringify(detail));
    return await saveWork(card, detail);
  }

  async function loadTasks(fallback) {
    try {
      const rows = await cloudSelect("operational_tasks");
      if (!rows) return fallback;
      const tasks = rows.map(rowToTask);
      if (tasks.length) writeLocal(TASKS_KEY, tasks);
      return tasks.length ? tasks : fallback;
    } catch (err) {
      console.warn("Falha ao ler tarefas no Supabase:", err.message);
      return fallback;
    }
  }

  async function saveTasks(tasks) {
    writeLocal(TASKS_KEY, tasks);
    const user = await requireUser();
    if (!user) return { cloud: false };
    const rows = tasks.map(taskToRow);
    if (rows.length) {
      const { error } = await window.UBY_SUPABASE.client().from("operational_tasks").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }
    return { cloud: true };
  }

  async function deleteTask(id) {
    const user = await requireUser();
    if (!user) return { cloud: false };
    const { error } = await window.UBY_SUPABASE.client().from("operational_tasks").delete().eq("id", id);
    if (error) throw error;
    return { cloud: true };
  }

  async function loadProspects(fallback) {
    try {
      const rows = await cloudSelect("prospeccao_areas");
      if (!rows || !rows.length) return fallback;
      return rows.map(row => ({
        ...(row.raw_data || {}),
        id: row.id,
        ponto: row.ponto,
        cidade: row.cidade,
        uf: row.uf,
        prioridade: row.prioridade,
        tipo: row.tipo,
        status: row.status,
        etapa: row.etapa,
        contato: row.contato,
        kw: row.potencia_kw ? String(row.potencia_kw) : row.raw_data?.kw || ""
      }));
    } catch (err) {
      console.warn("Falha ao ler prospeccao no Supabase:", err.message);
      return fallback;
    }
  }

  async function loadMarket(fallback = []) {
    try {
      const user = await requireUser();
      if (!user) return readLocal(MARKET_KEY, fallback);
      const { data, error } = await window.UBY_SUPABASE.client()
        .from("mercado_items")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const items = (data || []).map(rowToMarket);
      if (items.length) writeLocal(MARKET_KEY, items);
      return items.length ? items : readLocal(MARKET_KEY, fallback);
    } catch (err) {
      console.warn("Falha ao ler mercado no Supabase:", err.message);
      return readLocal(MARKET_KEY, fallback);
    }
  }

  async function saveMarket(items) {
    const stamped = items.map(item => ({ ...item, updatedAt: item.updatedAt || new Date().toISOString() }));
    writeLocal(MARKET_KEY, stamped);
    const user = await requireUser();
    if (!user) return { cloud: false };
    const rows = stamped.map(marketToRow);
    if (rows.length) {
      const { error } = await window.UBY_SUPABASE.client().from("mercado_items").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }
    return { cloud: true };
  }

  async function deleteMarketItem(id) {
    writeLocal(MARKET_KEY, readLocal(MARKET_KEY, []).filter(item => item.id !== id));
    const user = await requireUser();
    if (!user) return { cloud: false };
    const { error } = await window.UBY_SUPABASE.client().from("mercado_items").delete().eq("id", id);
    if (error) throw error;
    return { cloud: true };
  }

  async function saveActivity(item) {
    writeLocal(ACTIVITY_KEY, mergeById([item], readLocal(ACTIVITY_KEY, [])));
    const user = await requireUser();
    if (!user) return { cloud: false };
    const { error } = await window.UBY_SUPABASE.client().from("obra_atividade").upsert(activityToRow(item), { onConflict: "id" });
    if (error) throw error;
    return { cloud: true };
  }

  async function loadActivity(fallback = []) {
    try {
      const user = await requireUser();
      if (!user) return fallback;
      const { data, error } = await window.UBY_SUPABASE.client()
        .from("obra_atividade")
        .select("*")
        .order("created_at_client", { ascending: false })
        .limit(500);
      if (error) throw error;
      const items = mergeById(fallback, (data || []).map(rowToActivity));
      writeLocal(ACTIVITY_KEY, items);
      return items;
    } catch (err) {
      console.warn("Falha ao ler historico no Supabase:", err.message);
      return fallback;
    }
  }

  async function saveMessage(item) {
    writeLocal(MESSAGE_KEY, mergeById([item], readLocal(MESSAGE_KEY, [])));
    const user = await requireUser();
    if (!user) return { cloud: false };
    const { error } = await window.UBY_SUPABASE.client().from("obra_mensagens").upsert(messageToRow(item), { onConflict: "id" });
    if (error) throw error;
    return { cloud: true };
  }

  async function loadMessages(fallback = []) {
    try {
      const user = await requireUser();
      if (!user) return fallback;
      const { data, error } = await window.UBY_SUPABASE.client()
        .from("obra_mensagens")
        .select("*")
        .order("created_at_client", { ascending: false })
        .limit(500);
      if (error) throw error;
      const items = mergeById(fallback, (data || []).map(rowToMessage));
      writeLocal(MESSAGE_KEY, items);
      return items;
    } catch (err) {
      console.warn("Falha ao ler mensagens no Supabase:", err.message);
      return fallback;
    }
  }

  window.UBY_STORE = {
    available,
    loadWorks,
    saveWork,
    deleteWork,
    loadDetail,
    saveDetail,
    loadTasks,
    saveTasks,
    deleteTask,
    loadProspects,
    loadMarket,
    saveMarket,
    deleteMarketItem,
    saveActivity,
    loadActivity,
    saveMessage,
    loadMessages
  };
})();

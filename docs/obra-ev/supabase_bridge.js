(function () {
  const config = window.UBY_SUPABASE_CONFIG || {};
  const managedPrefixes = ["uby-obra-detalhe-", "uby-obras-dashboard", "uby-tarefas", "uby-auth-", "uby-engineering-", "uby-material-", "uby-activity", "uby-messages", "p3_obras_theme", "uby-sidebar"];

  function configured() {
    return Boolean(config.enabled && config.url && config.anonKey && window.supabase);
  }

  function client() {
    if (!configured()) return null;
    if (!window.UBY_SUPABASE_CLIENT) {
      window.UBY_SUPABASE_CLIENT = window.supabase.createClient(config.url, config.anonKey);
    }
    return window.UBY_SUPABASE_CLIENT;
  }

  function collectLocalState() {
    const data = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && managedPrefixes.some(prefix => key.startsWith(prefix))) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function collectWorks() {
    const works = [];
    const dashboard = readJson("uby-obras-dashboard-v1", []);
    dashboard.forEach(item => {
      if (item && item.id) works.push({ ...item, source: "dashboard" });
    });
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("uby-obra-detalhe-")) continue;
      const id = key.replace("uby-obra-detalhe-", "");
      const detail = readJson(key, null);
      if (!detail || !detail.project) continue;
      const project = detail.project;
      const qtd = parseInt(project.qtdCarregadores, 10) || 1;
      const kw = parseInt(project.potenciaCarregador, 10) || 60;
      const tasks = (detail.phases || []).flatMap(phase => (phase.tasks || []).map(task => ({ ...task, phase: phase.name })));
      const done = tasks.filter(task => task.status === "done" || task.status === "na").length;
      const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      works.push({
        id,
        nome: project.obraNome || id,
        cliente: project.cliente || project.obraNome || "Cliente",
        local: project.local || "",
        status: project.statusExec || "Projeto",
        pct,
        kw: qtd * kw,
        carregadores: `${qtd} x ${kw} kW`,
        crit: tasks.filter(task => ["Concessionaria", "Orcamentos e contratacoes", "Materiais e equipamentos", "Obra eletrica"].includes(task.phase) && ["pending", "doing"].includes(task.status)).length,
        source: "detail",
        detail
      });
    }
    const byId = new Map();
    works.forEach(work => byId.set(work.id, { ...(byId.get(work.id) || {}), ...work }));
    return [...byId.values()];
  }

  async function migrateLocalToCloud() {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado. Preencha supabase_config.js com URL e anonKey.");
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData.session) throw new Error("Entre com seu usuario Supabase antes de migrar.");
    const state = collectLocalState();
    const works = collectWorks();
    const snapshot = {
      origin: location.href,
      created_at_client: new Date().toISOString(),
      keys_count: Object.keys(state).length,
      payload: state
    };
    const { error: snapshotError } = await sb.from("obra_snapshots").insert(snapshot);
    if (snapshotError) throw snapshotError;
    for (const work of works) {
      const payload = {
        id: work.id,
        nome: work.nome,
        cliente: work.cliente,
        local: work.local,
        status_exec: work.status,
        progresso: work.pct || 0,
        potencia_kw: work.kw || 0,
        carregadores: work.carregadores || "",
        criticas: work.crit || 0,
        origem: work.source || "local",
        raw_data: work.detail || work,
        updated_at: new Date().toISOString()
      };
      const { error } = await sb.from("obras").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      const detail = work.detail;
      if (detail && Array.isArray(detail.phases)) {
        for (const phase of detail.phases) {
          const phasePayload = {
            obra_id: work.id,
            nome: phase.name,
            responsavel: phase.owner || "",
            raw_data: phase,
            updated_at: new Date().toISOString()
          };
          const { error: phaseError } = await sb.from("obra_fases").upsert(phasePayload, { onConflict: "obra_id,nome" });
          if (phaseError) throw phaseError;
          for (const task of phase.tasks || []) {
            const taskPayload = {
              obra_id: work.id,
              fase: phase.name,
              titulo: task.title,
              status: task.status || "pending",
              protocolo: task.protocol || "",
              data_pedido: task.requestDate || null,
              data_prevista: task.forecastDate || null,
              observacao: task.note || "",
              raw_data: task,
              updated_at: new Date().toISOString()
            };
            const { error: taskError } = await sb.from("obra_tarefas").upsert(taskPayload, { onConflict: "obra_id,fase,titulo" });
            if (taskError) throw taskError;
          }
        }
      }
      for (const doc of work.detail?.documents || []) {
        const { error: docError } = await sb.from("obra_documentos").upsert({
          obra_id: work.id,
          documento_id: doc.id,
          nome: doc.name,
          fase: doc.phase || "",
          status: doc.status || "pending",
          responsavel: doc.owner || "",
          prazo: doc.due || null,
          link: doc.link || "",
          raw_data: doc,
          updated_at: new Date().toISOString()
        }, { onConflict: "obra_id,documento_id" });
        if (docError) throw docError;
      }
    }
    return { works: works.length, keys: Object.keys(state).length };
  }

  async function cloudStatus() {
    const sb = client();
    if (!sb) return { configured: false, obras: 0 };
    const { count, error } = await sb.from("obras").select("id", { count: "exact", head: true });
    if (error) throw error;
    return { configured: true, obras: count || 0 };
  }

  async function signIn(email, password) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const sb = client();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }

  async function currentUser() {
    const sb = client();
    if (!sb) return null;
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function currentProfile() {
    const sb = client();
    if (!sb) return null;
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await sb
      .from("profiles")
      .select("id,nome,perfil")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...data, email: user.email } : null;
  }

  async function upsertProspects(items) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const payload = (items || []).map(item => ({
      id: String(item.id),
      ponto: item.ponto,
      cidade: item.cidade || "",
      uf: item.uf || "",
      prioridade: item.prioridade || "",
      tipo: item.tipo || "",
      status: item.status || "",
      etapa: item.etapa || "",
      contato: item.contato || "",
      potencia_kw: Number(item.kw || 0),
      raw_data: item,
      updated_at: new Date().toISOString()
    }));
    if (!payload.length) return { count: 0 };
    const { error } = await sb.from("prospeccao_areas").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    return { count: payload.length };
  }

  function safePathPart(value) {
    return String(value || "arquivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "arquivo";
  }

  async function uploadDocumentFile(workId, workName, docId, file) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de enviar arquivos.");
    const fileName = safePathPart(file.name);
    const path = `${safePathPart(workId)}/${safePathPart(docId)}/${Date.now()}-${fileName}`;
    const { error: uploadError } = await sb.storage
      .from("obra-documentos")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await sb.storage
      .from("obra-documentos")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signedError) throw signedError;
    const link = signed?.signedUrl || "";
    const { error: docError } = await sb.from("obra_documentos").upsert({
      obra_id: workId,
      documento_id: docId,
      nome: file.name,
      status: "done",
      link,
      storage_path: path,
      raw_data: { workName, fileName: file.name, mimeType: file.type || "", size: file.size || 0, storagePath: path },
      updated_at: new Date().toISOString()
    }, { onConflict: "obra_id,documento_id" });
    if (docError) throw docError;
    return { link, storagePath: path, fileName: file.name };
  }

  window.UBY_SUPABASE = {
    configured,
    client,
    collectLocalState,
    collectWorks,
    migrateLocalToCloud,
    cloudStatus,
    signIn,
    signOut,
    currentUser,
    currentProfile,
    upsertProspects,
    uploadDocumentFile
  };
})();

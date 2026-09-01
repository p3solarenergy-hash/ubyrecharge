(function () {
  const config = window.UBY_SUPABASE_CONFIG || {};
  const USER_CACHE_TTL_MS = 30000;
  let verifiedUserCache = null;
  let verifiedUserCachedAt = 0;
  const managedPrefixes = [
    "uby-obra-detalhe-",
    "uby-obras-dashboard",
    "uby-tarefas",
    "uby-auth-",
    "uby-engineering-",
    "uby-material-",
    "uby-activity",
    "uby-messages",
    "uby-recargas-",
    "uby-club-",
    "uby-calendar-",
    "p3_obras_theme",
    "uby-sidebar"
  ];

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
    verifiedUserCache = data?.user || null;
    verifiedUserCachedAt = Date.now();
    return data;
  }

  async function signOut() {
    const sb = client();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    verifiedUserCache = null;
    verifiedUserCachedAt = 0;
  }

  async function currentUser() {
    const sb = client();
    if (!sb) return null;
    if (verifiedUserCache && Date.now() - verifiedUserCachedAt < USER_CACHE_TTL_MS) {
      return verifiedUserCache;
    }
    const { data, error } = await sb.auth.getUser();
    if (error) {
      verifiedUserCache = null;
      verifiedUserCachedAt = 0;
      return null;
    }
    verifiedUserCache = data.user || null;
    verifiedUserCachedAt = Date.now();
    return verifiedUserCache;
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

  async function ensureCoreWorks(items) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre com seu usuario Supabase antes de sincronizar a base.");
    const core = (items || []).filter(item => item?.id);
    if (!core.length) return { inserted: 0, existing: 0, total: 0 };
    const { count: existingCount, error: readError } = await sb
      .from("obras")
      .select("id", { count: "exact", head: true });
    if (readError) throw readError;
    if (Number(existingCount || 0) > 0) {
      return { inserted: 0, existing: Number(existingCount || 0), total: core.length, seeded: false };
    }
    const payload = core.map(item => ({
      id: String(item.id),
      nome: item.nome,
      cliente: item.cliente || item.nome || "",
      local: item.local || "",
      status_exec: item.status || "Projeto",
      progresso: Number(item.pct || 0),
      potencia_kw: Number(item.kw || 0),
      carregadores: item.carregadores || "",
      criticas: Number(item.crit || 0),
      origem: "base-oficial-app",
      raw_data: item,
      updated_at: new Date().toISOString()
    }));
    const { error: insertError } = await sb.from("obras").insert(payload);
    if (insertError) throw insertError;
    return { inserted: payload.length, existing: 0, total: core.length, seeded: true };
  }

  async function loadRechargeWorks() {
    const sb = client();
    if (!sb) return [];
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await sb
      .from("obras")
      .select("id,nome,cliente,local,status_exec,progresso,potencia_kw,carregadores,criticas,raw_data,updated_at")
      .order("nome", { ascending: true });
    if (error) throw error;
    return (data || []).map(row => ({
      ...(row.raw_data || {}),
      id: row.id,
      nome: row.nome || row.id,
      cliente: row.cliente || "",
      local: row.local || "",
      status: row.status_exec || "",
      statusExec: row.status_exec || "",
      pct: Number(row.progresso || 0),
      kw: Number(row.potencia_kw || 0),
      carregadores: row.carregadores || "",
      crit: Number(row.criticas || 0),
      updatedAt: row.updated_at || "",
      source: "supabase"
    }));
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

  function jsonArrayLength(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  async function insertAuditLog(sb, user, item) {
    const { error } = await sb.from("app_audit_log").insert({
      modulo: item.modulo || "recargas",
      entidade_tipo: item.entidadeTipo || "obra_recargas_base",
      entidade_id: item.entidadeId || null,
      acao: item.acao || "update",
      resumo: item.resumo || {},
      usuario_id: user?.id || null,
      usuario_email: user?.email || null
    });
    if (error) throw error;
  }

  async function archiveExistingRechargeBase(sb, user, workId, action, origin, existingData = null) {
    const id = String(workId || "geral");
    let data = existingData;
    if (!data) {
      const result = await sb
        .from("obra_recargas_base")
        .select("obra_id,arquivos,recargas,resumo,updated_at")
        .eq("obra_id", id)
        .maybeSingle();
      if (result.error) throw result.error;
      data = result.data;
    }
    if (!data) return null;

    const files = data.arquivos || [];
    const charges = data.recargas || [];
    const summary = data.resumo || {};
    const { error: historyError } = await sb.from("obra_recargas_historico").insert({
      obra_id: id,
      acao: action,
      origem: origin,
      arquivos: files,
      recargas: charges,
      resumo: summary,
      recargas_count: jsonArrayLength(charges),
      arquivos_count: jsonArrayLength(files),
      usuario_id: user?.id || null,
      usuario_email: user?.email || null,
      base_updated_at: data.updated_at || null
    });
    if (historyError) throw historyError;
    return { files: jsonArrayLength(files), charges: jsonArrayLength(charges), updatedAt: data.updated_at };
  }

  async function saveRechargeBase(workId, payload) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de salvar recargas.");
    const files = Array.isArray(payload?.files) ? payload.files : [];
    const charges = Array.isArray(payload?.charges) ? payload.charges : [];
    const summary = {
      ...(payload?.summary || {}),
      monthlyClosings: payload?.monthlyClosings || payload?.summary?.monthlyClosings || {},
      financialSettings: payload?.financialSettings || payload?.summary?.financialSettings || {}
    };
    const id = String(workId || "geral");
    const mutationIntent = String(payload?.mutationIntent || "save");
    const { data: atomicResult, error: atomicError } = await sb.rpc("save_recharge_base_atomic", {
      p_obra_id: id,
      p_files: files,
      p_charges: charges,
      p_summary: summary,
      p_mutation_intent: mutationIntent
    });
    if (!atomicError) {
      return {
        cloud: true,
        files: Number(atomicResult?.files ?? files.length),
        charges: Number(atomicResult?.charges ?? charges.length),
        normalizedCharges: Number(atomicResult?.normalizedCharges ?? charges.length),
        history: Boolean(atomicResult?.history)
      };
    }
    // Keep compatibility while the database migration is being deployed.
    if (!/save_recharge_base_atomic|schema cache|function/i.test(String(atomicError.message || ""))) {
      throw atomicError;
    }
    const { data: existing, error: existingError } = await sb
      .from("obra_recargas_base")
      .select("obra_id,arquivos,recargas,resumo,updated_at")
      .eq("obra_id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    const existingCharges = jsonArrayLength(existing?.recargas);
    const explicitEmptyIntents = new Set(["explicit_empty_replace", "month_correction", "undo_import", "remove_file"]);
    if (!charges.length && existingCharges > 0 && !explicitEmptyIntents.has(mutationIntent)) {
      throw new Error(`Gravacao vazia bloqueada: a base em nuvem possui ${existingCharges} recarga(s).`);
    }
    const previous = await archiveExistingRechargeBase(sb, user, workId, "before_upsert", "saveRechargeBase", existing);
    const normalizedCharges = await replaceRechargeSessions(id, charges);
    const { error } = await sb.from("obra_recargas_base").upsert({
      obra_id: id,
      arquivos: files,
      recargas: charges,
      resumo: summary,
      updated_at: new Date().toISOString()
    }, { onConflict: "obra_id" });
    if (error) throw error;
    await insertAuditLog(sb, user, {
      entidadeId: String(workId || "geral"),
      acao: "save_recharge_base",
      resumo: {
        previous,
        next: { files: files.length, charges: charges.length },
        mutationIntent,
        workName: summary.workName || payload?.workName || ""
      }
    });
    return { cloud: true, files: files.length, charges: charges.length, normalizedCharges, history: Boolean(previous) };
  }

  async function saveRechargeMetadata(workId, payload = {}) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de salvar configuracoes de recargas.");
    const id = String(workId || "geral");
    const { data: existing, error: readError } = await sb
      .from("obra_recargas_base")
      .select("resumo,updated_at")
      .eq("obra_id", id)
      .maybeSingle();
    if (readError) throw readError;
    const existingSummary = existing?.resumo || {};
    const incomingSummary = payload?.summary || {};
    const summary = {
      ...existingSummary,
      workId: existingSummary.workId || payload?.workId || id,
      workName: existingSummary.workName || payload?.workName || incomingSummary.workName || "",
      monthlyClosings: payload?.monthlyClosings || incomingSummary.monthlyClosings || existingSummary.monthlyClosings || {},
      financialSettings: payload?.financialSettings || incomingSummary.financialSettings || existingSummary.financialSettings || {},
      matrizCosts: payload?.matrizCosts || incomingSummary.matrizCosts || existingSummary.matrizCosts || [],
      stationAvailability: payload?.stationAvailability || incomingSummary.stationAvailability || existingSummary.stationAvailability || {},
      operationalPowerKw: Number(payload?.operationalPowerKw || incomingSummary.operationalPowerKw || existingSummary.operationalPowerKw || 0),
      ubyOperationOverrides: payload?.ubyOperationOverrides || incomingSummary.ubyOperationOverrides || existingSummary.ubyOperationOverrides || {},
      ubyAreaAccounting: payload?.ubyAreaAccounting || incomingSummary.ubyAreaAccounting || existingSummary.ubyAreaAccounting || {},
      updatedAt: new Date().toISOString()
    };
    const updatedAt = new Date().toISOString();
    if (existing) {
      const { error: updateError } = await sb
        .from("obra_recargas_base")
        .update({ resumo: summary, updated_at: updatedAt })
        .eq("obra_id", id);
      if (updateError) throw updateError;
    } else {
      // Uma obra concluida pode receber configuracoes (horario, classificacao
      // UBY) antes da primeira importacao. Cria somente a casca vazia, sem
      // sessoes nem arquivos, para que a proxima planilha continue sendo a
      // fonte operacional da base.
      const { error: insertError } = await sb
        .from("obra_recargas_base")
        .upsert({ obra_id: id, arquivos: [], recargas: [], resumo: summary, updated_at: updatedAt }, { onConflict: "obra_id" });
      if (insertError) throw insertError;
    }
    await insertAuditLog(sb, user, {
      entidadeId: id,
      acao: "save_recharge_metadata",
      resumo: {
        workName: summary.workName || payload?.workName || "",
        metadataType: String(payload?.metadataType || "settings"),
        chargesPreserved: Number(summary.charges || 0)
      }
    });
    return { cloud: true, charges: Number(summary.charges || 0), metadataOnly: true };
  }

  // Custos compartilhados nao pertencem a uma obra especifica. Manter essa
  // matriz fora de obra_recargas_base evita violar a chave estrangeira de obras.
  async function loadFinancialMatrix() {
    const sb = client();
    if (!sb) return null;
    if (!(await currentUser())) return null;
    const { data, error } = await sb
      .from("uby_financial_matrix")
      .select("id,payload,updated_at")
      .eq("id", "shared-costs")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      matrizCosts: Array.isArray(data.payload?.matrizCosts) ? data.payload.matrizCosts : [],
      networkDistribution: data.payload?.networkDistribution && typeof data.payload.networkDistribution === 'object' ? data.payload.networkDistribution : {},
      updatedAt: data.updated_at
    };
  }

  async function saveFinancialMatrix(matrizCosts = [], networkDistribution) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de salvar a matriz financeira.");
    let resolvedDistribution = networkDistribution && typeof networkDistribution === 'object' ? networkDistribution : null;
    // Clientes com a versão anterior só enviam custos. Preserve a política de
    // cotas já salva em vez de sobrescrever o JSON compartilhado com vazio.
    if (!resolvedDistribution) {
      const { data: existing, error: existingError } = await sb
        .from("uby_financial_matrix")
        .select("payload")
        .eq("id", "shared-costs")
        .maybeSingle();
      if (existingError) throw existingError;
      resolvedDistribution = existing?.payload?.networkDistribution && typeof existing.payload.networkDistribution === 'object'
        ? existing.payload.networkDistribution : {};
    }
    const payload = {
      matrizCosts: Array.isArray(matrizCosts) ? matrizCosts : [],
      networkDistribution: resolvedDistribution
    };
    const { data, error } = await sb
      .from("uby_financial_matrix")
      .upsert({
        id: "shared-costs",
        payload,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" })
      .select("id,updated_at")
      .single();
    if (error) throw error;
    await insertAuditLog(sb, user, {
      entidadeTipo: "uby_financial_matrix",
      entidadeId: "shared-costs",
      acao: "save_financial_matrix",
      resumo: { costs: payload.matrizCosts.length, quotas: Number(payload.networkDistribution?.totalQuotas || 0) }
    });
    return { cloud: true, updatedAt: data?.updated_at || null };
  }

  // Documentos financeiros nao sao incluidos no payload da matriz: os metadados
  // ficam em tabela propria e o arquivo privado so e baixado quando solicitado.
  async function loadFinanceDocuments(options = {}) {
    const sb = client();
    if (!sb || !(await currentUser())) return [];
    const scope = String(options.scope || 'matrix');
    let query = sb
      .from('uby_finance_documents')
      .select('id,scope,work_id,matrix_cost_id,competence_key,supplier,category,document_number,document_type,amount,due_date,status,installment_number,installment_total,storage_path,file_name,mime_type,file_size,notes,created_by_email,created_at,updated_at')
      .eq('scope', scope)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(200, Math.max(1, Number(options.limit || 100))));
    if (options.competenceKey) query = query.eq('competence_key', String(options.competenceKey));
    if (options.workId) query = query.eq('work_id', String(options.workId));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function createFinanceDocument(record = {}, file = null) {
    const sb = client();
    if (!sb) throw new Error('Supabase ainda nao configurado.');
    const user = await currentUser();
    if (!user) throw new Error('Entre no Supabase antes de salvar o documento financeiro.');
    const fallbackUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const value = Math.floor(Math.random() * 16);
      return (char === 'x' ? value : ((value & 0x3) | 0x8)).toString(16);
    });
    const id = String(record.id || (window.crypto?.randomUUID ? window.crypto.randomUUID() : fallbackUuid()));
    let storagePath = '';
    try {
      if (file) {
        const permitted = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!permitted.includes(file.type)) throw new Error('Envie PDF, JPG, PNG ou WEBP.');
        if (Number(file.size || 0) > 15728640) throw new Error('O arquivo deve ter no maximo 15 MB.');
        const sanitized = String(file.name || 'documento').replace(/[^a-zA-Z0-9._-]/g, '_');
        storagePath = `${user.id}/${id}/${sanitized}`;
        const { error: uploadError } = await sb.storage.from('finance-documents').upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const payload = {
        id,
        scope: String(record.scope || 'matrix'),
        work_id: record.workId ? String(record.workId) : null,
        matrix_cost_id: record.matrixCostId ? String(record.matrixCostId) : null,
        competence_key: String(record.competenceKey || ''),
        supplier: String(record.supplier || ''),
        category: String(record.category || 'Outros custos'),
        document_number: String(record.documentNumber || ''),
        document_type: String(record.documentType || 'boleto'),
        amount: Math.max(0, Number(record.amount || 0)),
        due_date: record.dueDate || null,
        status: ['pending', 'paid', 'cancelled'].includes(record.status) ? record.status : 'pending',
        installment_number: record.installmentNumber ? Math.max(1, Number(record.installmentNumber)) : null,
        installment_total: record.installmentTotal ? Math.max(1, Number(record.installmentTotal)) : null,
        storage_path: storagePath || null,
        file_name: file?.name || null,
        mime_type: file?.type || null,
        file_size: file?.size || null,
        notes: String(record.notes || ''),
        created_by: user.id,
        created_by_email: user.email || '',
        updated_at: new Date().toISOString()
      };
      const { data, error } = await sb.from('uby_finance_documents').insert(payload).select().single();
      if (error) throw error;
      await insertAuditLog(sb, user, { entidadeTipo: 'uby_finance_documents', entidadeId: id, acao: 'create_finance_document', resumo: { scope: payload.scope, competence: payload.competence_key, amount: payload.amount, attached: !!storagePath } });
      return data;
    } catch (error) {
      if (storagePath) await sb.storage.from('finance-documents').remove([storagePath]).catch(() => {});
      throw error;
    }
  }

  async function openFinanceDocument(id) {
    const sb = client();
    if (!sb || !(await currentUser())) throw new Error('Entre no Supabase para abrir o documento.');
    const { data: row, error } = await sb.from('uby_finance_documents').select('storage_path,file_name').eq('id', String(id)).maybeSingle();
    if (error) throw error;
    if (!row?.storage_path) throw new Error('Este lancamento nao possui arquivo anexado.');
    const { data, error: signedError } = await sb.storage.from('finance-documents').createSignedUrl(row.storage_path, 60);
    if (signedError) throw signedError;
    return { url: data.signedUrl, fileName: row.file_name || 'documento' };
  }

  async function deleteFinanceDocument(id) {
    const sb = client();
    if (!sb) throw new Error('Supabase ainda nao configurado.');
    const user = await currentUser();
    if (!user) throw new Error('Entre no Supabase antes de excluir o documento.');
    const { data: row, error: readError } = await sb.from('uby_finance_documents').select('id,storage_path,scope,competence_key,amount').eq('id', String(id)).maybeSingle();
    if (readError) throw readError;
    if (!row) return { deleted: false };
    if (row.storage_path) {
      const { error: storageError } = await sb.storage.from('finance-documents').remove([row.storage_path]);
      if (storageError) throw storageError;
    }
    const { error } = await sb.from('uby_finance_documents').delete().eq('id', String(id));
    if (error) throw error;
    await insertAuditLog(sb, user, { entidadeTipo: 'uby_finance_documents', entidadeId: String(id), acao: 'delete_finance_document', resumo: { scope: row.scope, competence: row.competence_key, amount: row.amount } });
    return { deleted: true };
  }

  async function clearRechargeBase(workId) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de excluir recargas.");
    const previous = await archiveExistingRechargeBase(sb, user, workId, "before_clear", "clearRechargeBase");
    await replaceRechargeSessions(String(workId || "geral"), []);
    const { error } = await sb.from("obra_recargas_base").upsert({
      obra_id: String(workId || "geral"),
      arquivos: [],
      recargas: [],
      resumo: {
        workId: String(workId || "geral"),
        charges: 0,
        files: 0,
        clearedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    }, { onConflict: "obra_id" });
    if (error) throw error;
    await insertAuditLog(sb, user, {
      entidadeId: String(workId || "geral"),
      acao: "clear_recharge_base",
      resumo: { previous, next: { files: 0, charges: 0 } }
    });
    return { cloud: true, files: 0, charges: 0, history: Boolean(previous) };
  }

  async function loadRechargeBase(workId) {
    const sb = client();
    if (!sb) return null;
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await sb
      .from("obra_recargas_base")
      .select("obra_id,arquivos,recargas,resumo,updated_at")
      .eq("obra_id", String(workId || "geral"))
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      workId: data.obra_id,
      files: data.arquivos || [],
      charges: data.recargas || [],
      monthlyClosings: data.resumo?.monthlyClosings || {},
      financialSettings: data.resumo?.financialSettings || {},
      summary: data.resumo || {},
      updatedAt: data.updated_at
    };
  }

  async function loadAllRechargeBases() {
    const sb = client();
    if (!sb) return [];
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await sb
      .from("obra_recargas_base")
      .select("obra_id,arquivos,recargas,resumo,updated_at")
      .neq("obra_id", "__uby_matriz_financeira__")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(row => ({
      workId: row.obra_id,
      files: row.arquivos || [],
      charges: row.recargas || [],
      monthlyClosings: row.resumo?.monthlyClosings || {},
      financialSettings: row.resumo?.financialSettings || {},
      summary: row.resumo || {},
      updatedAt: row.updated_at
    }));
  }

  async function loadAllRechargeSummaries() {
    const sb = client();
    if (!sb) return [];
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await sb
      .from("obra_recargas_base")
      .select("obra_id,arquivos,resumo,updated_at")
      .neq("obra_id", "__uby_matriz_financeira__")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(row => ({
      workId: row.obra_id,
      files: row.arquivos || [],
      charges: [],
      summaryOnly: true,
      monthlyClosings: row.resumo?.monthlyClosings || {},
      financialSettings: row.resumo?.financialSettings || {},
      summary: row.resumo || {},
      updatedAt: row.updated_at
    }));
  }

  function normalizedSessionToCharge(row) {
    const raw = row?.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
    const durationSeconds = Number(row.duration_seconds || 0);
    const idleSeconds = Number(row.idle_seconds || 0);
    const durationText = `${String(Math.floor(durationSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((durationSeconds % 3600) / 60)).padStart(2, "0")}:${String(durationSeconds % 60).padStart(2, "0")}`;
    const idleText = `${String(Math.floor(idleSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((idleSeconds % 3600) / 60)).padStart(2, "0")}:${String(idleSeconds % 60).padStart(2, "0")}`;
    return {
      ...raw,
      id: raw.id || row.source_session_id || row.session_key,
      workId: row.obra_id,
      station: raw.station || row.station_name || "",
      _sourceStation: raw._sourceStation || row.source_station || "",
      connType: raw.connType || row.connector_type || "",
      startIso: raw.startIso || row.started_at || "",
      endIso: raw.endIso || row.ended_at || "",
      startStr: raw.startStr || row.started_at || "",
      endStr: raw.endStr || row.ended_at || "",
      _month: raw._month || String(row.month_key || "").slice(0, 7),
      duration: raw.duration || durationText,
      idleTime: raw.idleTime || idleText,
      energyKWh: Number(row.energy_kwh || 0),
      revenue: Number(row.revenue || 0),
      idleValue: Number(row.idle_value || 0),
      userName: raw.userName || row.user_name || "",
      userEmail: raw.userEmail || row.user_email || "",
      userPhone: raw.userPhone || row.user_phone || "",
      paymentType: raw.paymentType || row.payment_type || "",
      paymentStatus: raw.paymentStatus || row.payment_status || "",
      rawStatus: raw.rawStatus || row.raw_status || "",
      failureReason: raw.failureReason || row.failure_reason || "",
      vehicleBrand: raw.vehicleBrand || row.vehicle_brand || "",
      vehicleModel: raw.vehicleModel || row.vehicle_model || "",
      voucher: raw.voucher || row.voucher || "",
      rating: raw.rating || row.rating || "",
      reviewComment: raw.reviewComment || row.review_comment || "",
      _file: raw._file || row.source_file || "",
      _fileKey: raw._fileKey || row.source_file_key || ""
    };
  }

  async function loadRechargeSessions(filters = {}) {
    const sb = client();
    if (!sb || !(await currentUser())) return { rows: [], count: 0 };
    const limit = Math.min(Math.max(Number(filters.limit || 250), 1), 1000);
    const offset = Math.max(Number(filters.offset || 0), 0);
    let query = sb.from("recharge_sessions")
      .select("session_key,obra_id,source_session_id,station_name,source_station,connector_type,started_at,ended_at,month_key,duration_seconds,idle_seconds,energy_kwh,revenue,idle_value,payment_type,payment_status,raw_status,failure_reason,user_name,user_email,user_phone,vehicle_brand,vehicle_model,voucher,rating,review_comment,source_file,source_file_key", { count: "exact" })
      .order("started_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (filters.workId) query = query.eq("obra_id", String(filters.workId));
    if (filters.monthKey) query = query.eq("month_key", `${String(filters.monthKey).slice(0, 7)}-01`);
    if (filters.from) query = query.gte("started_at", filters.from);
    if (filters.to) query = query.lte("started_at", filters.to);
    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: (data || []).map(normalizedSessionToCharge), count: Number(count || 0) };
  }

  async function replaceRechargeSessions(workId, charges = []) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    if (!(await currentUser())) throw new Error("Entre no Supabase antes de salvar recargas.");
    const { data, error } = await sb.rpc("replace_recharge_sessions", {
      p_obra_id: String(workId || ""),
      p_charges: Array.isArray(charges) ? charges : []
    });
    if (error) throw error;
    return Number(data || 0);
  }

  async function loadRechargeMonthlySummaries(workIds = []) {
    const sb = client();
    if (!sb || !(await currentUser())) return [];
    let query = sb.from("recharge_monthly_summary").select("obra_id,month_key,sessions,valid_sessions,customers,energy_kwh,revenue,avg_kwh_valid_session,first_session_at,last_session_at").order("month_key", { ascending: true });
    if (Array.isArray(workIds) && workIds.length) query = query.in("obra_id", workIds.map(String));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function loadRechargeDailySummaries(filters = {}) {
    const sb = client();
    if (!sb || !(await currentUser())) return [];
    let query = sb.from("recharge_daily_summary").select("obra_id,session_date,sessions,valid_sessions,customers,energy_kwh,revenue,avg_kwh_valid_session,failures").order("session_date", { ascending: true });
    if (Array.isArray(filters.workIds) && filters.workIds.length) query = query.in("obra_id", filters.workIds.map(String));
    if (filters.from) query = query.gte("session_date", filters.from);
    if (filters.to) query = query.lte("session_date", filters.to);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function loadRechargeCustomers(filters = {}) {
    const sb = client();
    // "Sem conexao" nao e o mesmo que uma tabela sem clientes.  Quem chama
    // esta funcao usa essa distincao para nao apagar o cache local enquanto o
    // usuario ainda nao entrou no Supabase (ou esta trabalhando offline).
    if (!sb || !(await currentUser())) return { rows: [], count: 0, available: false };
    const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 500);
    const offset = Math.max(Number(filters.offset || 0), 0);
    let query = sb.from("recharge_customers")
      .select("customer_key,name,email,phone,complement,chargers_count,transactions_count,energy_kwh,charge_time_text,total_spent,source,raw_data,first_seen_at,last_seen_at,updated_at", { count: "exact" })
      .order("total_spent", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filters.search) query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], count: Number(count || 0), available: true };
  }

  async function upsertRechargeCustomers(rows = []) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    if (!(await currentUser())) throw new Error("Entre no Supabase antes de salvar clientes.");
    const payload = (Array.isArray(rows) ? rows : []).map((row, index) => ({
      customer_key: String(
        row.customerKey || row.customer_key || row.email || row.phone ||
        `name:${String(row.name || '').trim().toLowerCase() || `manual-${index}`}`
      ).toLowerCase(),
      name: row.name || "", email: row.email || null, phone: row.phone || null,
      complement: row.complement || "", chargers_count: Number(row.chargers || row.chargers_count || 0),
      transactions_count: Number(row.transactions || row.transactions_count || 0),
      energy_kwh: Number(row.energy || row.energy_kwh || 0), charge_time_text: row.chargeTime || row.charge_time_text || "",
      total_spent: Number(row.spent || row.total_spent || 0), source: row.source || "importacao manual",
      raw_data: row.raw_data || row, updated_at: new Date().toISOString()
    }));
    for (let index = 0; index < payload.length; index += 200) {
      const { error } = await sb.from("recharge_customers").upsert(payload.slice(index, index + 200), { onConflict: "customer_key" });
      if (error) throw error;
    }
    return payload.length;
  }

  function normalizeFinanceReportRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      workId: row.obra_id,
      stationKey: row.station_key || "",
      stationName: row.station_name || "",
      reportType: row.report_type,
      periodKey: row.period_key,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status || "partial",
      version: Number(row.version || 1),
      payload: row.payload || {},
      generatedAt: row.generated_at,
      closedAt: row.closed_at,
      updatedAt: row.updated_at,
      generatedByEmail: row.generated_by_email || ""
    };
  }

  async function loadFinanceReports(filters = {}) {
    const sb = client();
    if (!sb) return [];
    const user = await currentUser();
    if (!user) return [];
    let query = sb
      .from("obra_finance_reports")
      .select("id,obra_id,station_key,station_name,report_type,period_key,period_start,period_end,status,version,payload,generated_at,closed_at,updated_at,generated_by_email")
      .is("deleted_at", null)
      .order("period_end", { ascending: false })
      .order("version", { ascending: false });
    if (filters.workId) query = query.eq("obra_id", String(filters.workId));
    if (filters.stationKey !== undefined) query = query.eq("station_key", String(filters.stationKey || ""));
    if (filters.reportType) query = query.eq("report_type", String(filters.reportType));
    if (filters.periodKey) query = query.eq("period_key", String(filters.periodKey));
    if (filters.status) query = query.eq("status", String(filters.status));
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeFinanceReportRow).filter(Boolean);
  }

  function sameFinanceReportPayload(left, right) {
    try {
      return JSON.stringify(left || {}) === JSON.stringify(right || {});
    } catch (err) {
      return false;
    }
  }

  async function saveFinanceReport(report = {}) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de salvar relatorios financeiros.");
    const workId = String(report.workId || "").trim();
    const reportType = String(report.reportType || "").trim();
    const periodKey = String(report.periodKey || "").trim();
    const stationKey = String(report.stationKey || "").trim();
    const status = report.status === "closed" ? "closed" : "partial";
    if (!workId || !reportType || !periodKey || !report.periodStart || !report.periodEnd) {
      throw new Error("Relatorio incompleto: obra, tipo e periodo sao obrigatorios.");
    }

    const existing = await loadFinanceReports({ workId, stationKey, reportType, periodKey });
    const latest = existing[0] || null;
    if (latest?.status === "closed" && status === "closed" && sameFinanceReportPayload(latest.payload, report.payload)) {
      return { report: latest, unchanged: true };
    }

    const basePayload = {
      obra_id: workId,
      station_key: stationKey,
      station_name: String(report.stationName || ""),
      report_type: reportType,
      period_key: periodKey,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      status,
      payload: report.payload || {},
      generated_by: user.id,
      generated_by_email: user.email || null,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let data;
    let error;
    if (latest && latest.status !== "closed") {
      ({ data, error } = await sb
        .from("obra_finance_reports")
        .update({ ...basePayload, version: latest.version })
        .eq("id", latest.id)
        .select("id,obra_id,station_key,station_name,report_type,period_key,period_start,period_end,status,version,payload,generated_at,closed_at,updated_at,generated_by_email")
        .single());
    } else {
      ({ data, error } = await sb
        .from("obra_finance_reports")
        .insert({ ...basePayload, version: latest ? latest.version + 1 : 1 })
        .select("id,obra_id,station_key,station_name,report_type,period_key,period_start,period_end,status,version,payload,generated_at,closed_at,updated_at,generated_by_email")
        .single());
    }
    if (error) throw error;
    const saved = normalizeFinanceReportRow(data);
    await insertAuditLog(sb, user, {
      entidadeTipo: "obra_finance_reports",
      entidadeId: saved.id,
      acao: status === "closed" ? "close_finance_report" : "save_partial_finance_report",
      resumo: { workId, stationKey, reportType, periodKey, version: saved.version }
    });
    return { report: saved, unchanged: false };
  }

  async function deleteFinanceReport(reportId) {
    const sb = client();
    if (!sb) throw new Error("Supabase ainda nao configurado.");
    const user = await currentUser();
    if (!user) throw new Error("Entre no Supabase antes de excluir relatorios financeiros.");
    const id = String(reportId || "").trim();
    if (!id) throw new Error("Relatorio invalido.");

    const { data, error } = await sb
      .from("obra_finance_reports")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id,obra_id,station_key,report_type,period_key,version")
      .single();
    if (error) throw error;
    await insertAuditLog(sb, user, {
      entidadeTipo: "obra_finance_reports",
      entidadeId: id,
      acao: "archive_finance_report",
      resumo: { workId: data.obra_id, stationKey: data.station_key || "", reportType: data.report_type, periodKey: data.period_key, version: data.version }
    });
    return data;
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
    ensureCoreWorks,
    loadRechargeWorks,
    upsertProspects,
    uploadDocumentFile,
    saveRechargeBase,
    saveRechargeMetadata,
    loadFinancialMatrix,
    saveFinancialMatrix,
    loadFinanceDocuments,
    createFinanceDocument,
    openFinanceDocument,
    deleteFinanceDocument,
    clearRechargeBase,
    loadRechargeBase,
    loadAllRechargeBases,
    loadAllRechargeSummaries,
    loadRechargeSessions,
    replaceRechargeSessions,
    loadRechargeMonthlySummaries,
    loadRechargeDailySummaries,
    loadRechargeCustomers,
    upsertRechargeCustomers,
    loadFinanceReports,
    saveFinanceReport,
    deleteFinanceReport
  };
})();

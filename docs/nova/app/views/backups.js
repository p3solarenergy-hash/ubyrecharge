/* Backups e restauração — base de recargas (histórico por obra), matriz financeira
   (versões anteriores) e backup diário automático. Restaurar sempre guarda a
   versão atual antes (RPC atômica / gatilho do banco), então é reversível. */
(function () {
  "use strict";
  const { fmt, esc } = UBY;
  const ACTION = { before_upsert: "antes de uma importação/gravação", before_restore: "antes de uma restauração", before_clear: "antes de limpar a base", month_correction: "antes de corrigir mês", remove_file: "antes de remover planilha", undo_import: "antes de desfazer importação" };
  const ui = { tab: "recargas", work: "", busy: false, msg: "", err: "" };
  const cache = { history: new Map(), matrix: null, matrixErr: "", snaps: null, snapsErr: "" };
  const readBridge = () => document.getElementById("motorFrame").contentWindow.UBY_SUPABASE;

  let framePromise = null;
  function writer() {
    if (framePromise) return framePromise;
    framePromise = new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.id = "backupsFrame";
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden";
      frame.src = "legado/obra-ev/backups-gravacao.html?nova_backups=1&t=" + Date.now();
      document.body.appendChild(frame);
      const t0 = Date.now();
      const timer = setInterval(() => {
        const w = frame.contentWindow;
        if (w && w.UBY_SUPABASE?.client) {
          clearInterval(timer);
          w.UBY_SUPABASE.client();
          if (w.UBY_WRITE_SCOPE !== "backups") { reject(new Error("Restauração não liberada nesta tela.")); return; }
          resolve(w.UBY_SUPABASE);
        } else if (Date.now() - t0 > 60000) { clearInterval(timer); reject(new Error("O quadro de restauração não respondeu.")); }
      }, 200);
    });
    framePromise.catch(() => { framePromise = null; document.getElementById("backupsFrame")?.remove(); });
    return framePromise;
  }
  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/backups") && framePromise) { framePromise = null; document.getElementById("backupsFrame")?.remove(); } });

  const works = () => {
    const seen = new Map();
    UBY.data("financeStations").forEach(s => { if (!seen.has(s.workId)) seen.set(s.workId, s.workName); });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  };

  async function loadHistory(target, workId) {
    try {
      const { data, error } = await readBridge().client().from("obra_recargas_historico")
        .select("id,obra_id,acao,origem,recargas_count,arquivos_count,usuario_email,base_updated_at,created_at")
        .eq("obra_id", workId).order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      cache.history.set(workId, { rows: data || [] });
    } catch (err) { cache.history.set(workId, { rows: [], error: err.message }); }
    render(target);
  }
  async function loadMatrix(target) {
    try { cache.matrix = await readBridge().listMatrixHistory("shared-costs", 60); cache.matrixErr = ""; }
    catch (err) { cache.matrix = []; cache.matrixErr = err.message; }
    render(target);
  }
  async function loadSnaps(target) {
    try { cache.snaps = await readBridge().listPlatformSnapshots(40); cache.snapsErr = ""; }
    catch (err) { cache.snaps = []; cache.snapsErr = err.message; }
    render(target);
  }
  async function act(target, label, fn) {
    if (ui.busy) return;
    ui.busy = true; ui.err = ""; ui.msg = `${label}…`; render(target);
    try { ui.msg = await fn(); }
    catch (err) { ui.err = `${label}: ${err.message}`; ui.msg = ""; }
    ui.busy = false; render(target);
  }
  const download = (name, data) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const matrixSummary = p => {
    const nd = p?.networkDistribution || {};
    const ledger = Object.entries(nd.paymentLedger || {}).filter(([, v]) => v?.status && v.status !== "pendente").map(([k, v]) => `${k} ${v.status}`);
    return `${(p?.matrizCosts || []).length} custo(s) · ${(nd.investors || []).length} cotista(s) · cota ${fmt.brl(nd.quotaValue || 0)}${nd.taxRatePct ? ` · imposto ${nd.taxRatePct}%` : ""}${ledger.length ? ` · ${ledger.join(", ")}` : ""}`;
  };

  function recargasTab(target) {
    const list = works();
    if (!ui.work) ui.work = list[0]?.id || "";
    const h = cache.history.get(ui.work);
    if (!h) loadHistory(target, ui.work);
    return `<section class="section"><div class="section-head"><div><p class="kicker">Base de recargas</p><h2>Versões guardadas por obra</h2>
        <p>Toda importação, correção ou remoção guarda antes a versão anterior da base. Restaurar volta a base daquela obra exatamente como estava — e a versão atual também fica guardada, então dá para desfazer.</p></div>
        <select class="select" id="bkWork" style="min-width:260px">${list.map(w => `<option value="${esc(w.id)}" ${w.id === ui.work ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select></div>
      ${!h ? `<div class="loading"><div class="spinner"></div><h2>Lendo versões</h2></div>` : h.error ? `<div class="note">${esc(h.error)}</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Guardada em</th><th>Momento</th><th class="num">Recargas</th><th class="num">Planilhas</th><th>Quem</th><th></th></tr></thead><tbody>
        ${h.rows.map(r => `<tr><td><strong>${fmt.dt(r.created_at)}</strong></td><td>${esc(ACTION[r.acao] || r.acao)}<small>${esc(r.origem || "")}</small></td>
          <td class="num">${fmt.int(r.recargas_count)}</td><td class="num">${fmt.int(r.arquivos_count)}</td><td>${esc(r.usuario_email || "—")}</td>
          <td><button class="btn" type="button" data-restore="${esc(r.id)}" data-when="${esc(fmt.dt(r.created_at))}" data-n="${esc(r.recargas_count)}" ${ui.busy ? "disabled" : ""}>Restaurar esta versão</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhuma versão guardada para esta obra.</td></tr>`}
      </tbody></table></div>`}
    </section>`;
  }
  function matrixTab(target) {
    if (!cache.matrix) loadMatrix(target);
    return `<section class="section"><div class="section-head"><div><p class="kicker">Matriz financeira</p><h2>Versões anteriores de custos, cotas, impostos e fechamentos</h2>
        <p>Cada alteração guarda a versão anterior (até 400). Restaurar substitui a matriz atual pela versão escolhida; a atual vai para o histórico antes.</p></div></div>
      ${!cache.matrix ? `<div class="loading"><div class="spinner"></div><h2>Lendo versões</h2></div>` : cache.matrixErr ? `<div class="note">${esc(cache.matrixErr)}</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Guardada em</th><th>Conteúdo</th><th>Quem alterou depois</th><th></th></tr></thead><tbody>
        ${cache.matrix.map(v => `<tr><td><strong>${fmt.dt(v.created_at)}</strong><small>versão de ${fmt.dt(v.updated_at_anterior)}</small></td><td style="white-space:normal">${esc(matrixSummary(v.payload))}</td><td>${esc(v.usuario_email || "—")}</td>
          <td style="white-space:nowrap"><button class="btn ghost" type="button" data-mdown="${esc(v.id)}">Baixar</button> <button class="btn" type="button" data-mrestore="${esc(v.id)}" data-when="${esc(fmt.dt(v.created_at))}" ${ui.busy ? "disabled" : ""}>Restaurar</button></td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nenhuma versão anterior ainda.</td></tr>`}
      </tbody></table></div>`}
    </section>`;
  }
  function dailyTab(target) {
    if (!cache.snaps) loadSnaps(target);
    return `<section class="section"><div class="section-head"><div><p class="kicker">Backup diário automático</p><h2>Cópia completa da plataforma, todo dia às 03h30</h2>
        <p>Obras, fases, tarefas, documentos, matriz financeira, parâmetros dos carregadores e documentos financeiros. Guardado por 90 dias. Baixe o arquivo para guardar fora do Supabase.</p></div></div>
      ${!cache.snaps ? `<div class="loading"><div class="spinner"></div><h2>Lendo backups</h2></div>` : cache.snapsErr ? `<div class="note">${esc(cache.snapsErr)}</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Origem</th><th class="num">Partes</th><th></th></tr></thead><tbody>
        ${cache.snaps.map(s => `<tr><td><strong>${fmt.dt(s.created_at)}</strong></td><td>${esc(s.origin === "automatic_daily_database_backup" ? "Backup diário automático" : s.origin || "manual")}</td><td class="num">${fmt.int(s.keys_count)}</td>
          <td><button class="btn" type="button" data-sdown="${esc(s.id)}">Baixar cópia</button></td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nenhum backup diário encontrado. Rode banco/01_protecao_27092026.sql no Supabase para ligar.</td></tr>`}
      </tbody></table></div>`}
    </section>`;
  }

  function render(target) {
    if (!location.hash.startsWith("#/backups")) return;
    const TABS = [["recargas", "Base de recargas"], ["matriz", "Matriz financeira"], ["diario", "Backup diário"]];
    const body = ui.tab === "matriz" ? matrixTab(target) : ui.tab === "diario" ? dailyTab(target) : recargasTab(target);
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Entrada de dados · segurança</p><h1>Backups e restauração</h1>
        <p class="lead">Volte qualquer obra, a matriz financeira ou toda a plataforma para uma versão anterior, sem depender da plataforma antiga.</p></div>
        <div class="callout"><strong>Restaurar é reversível</strong><small>A versão atual sempre é guardada antes de restaurar.${ui.busy ? ' <span class="badge warn">trabalhando…</span>' : ui.err ? ` <span class="badge bad">${esc(ui.err)}</span>` : ui.msg ? ` <span class="badge ok">${esc(ui.msg)}</span>` : ""}</small></div></div>
      <div class="toolbar"><div class="seg" id="bkTabs">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}" class="${ui.tab === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${body}`;
    target.querySelectorAll("#bkTabs button").forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; render(target); });
    const sel = target.querySelector("#bkWork"); if (sel) sel.onchange = () => { ui.work = sel.value; render(target); };
    target.querySelectorAll("[data-restore]").forEach(b => b.onclick = () => {
      if (!confirm(`Restaurar a base de recargas desta obra para a versão de ${b.dataset.when} (${b.dataset.n} recargas)? A versão atual será guardada antes e poderá ser restaurada depois.`)) return;
      act(target, "Restauração da base", async () => {
        const w = await writer();
        const res = await w.restoreRechargeHistorySnapshot(ui.work, b.dataset.restore);
        cache.history.delete(ui.work);
        document.getElementById("refreshButton")?.click();
        return `Base restaurada: ${fmt.int(res.charges ?? 0)} recargas, ${fmt.int(res.files ?? 0)} planilhas. Os números estão sendo recalculados.`;
      });
    });
    target.querySelectorAll("[data-mrestore]").forEach(b => b.onclick = () => {
      if (!confirm(`Restaurar a matriz financeira (custos, cotas, impostos e fechamentos) para a versão de ${b.dataset.when}? A versão atual vai para o histórico antes.`)) return;
      act(target, "Restauração da matriz", async () => {
        const w = await writer();
        const res = await w.restoreMatrixVersion(b.dataset.mrestore);
        cache.matrix = null;
        document.getElementById("refreshButton")?.click();
        return `Matriz restaurada para ${fmt.dt(res.restoredFrom)}.`;
      });
    });
    target.querySelectorAll("[data-mdown]").forEach(b => b.onclick = () => { const v = cache.matrix.find(x => String(x.id) === b.dataset.mdown); download(`matriz-${String(v.created_at).slice(0, 16).replace(/[:T]/g, "-")}.json`, v.payload); });
    target.querySelectorAll("[data-sdown]").forEach(b => b.onclick = () => act(target, "Download do backup", async () => {
      const s = await readBridge().platformSnapshot(b.dataset.sdown);
      download(`backup-uby-${String(s.created_at).slice(0, 10)}.json`, s.payload);
      return "Arquivo baixado.";
    }));
  }

  UBY.register("backups", { render });
})();

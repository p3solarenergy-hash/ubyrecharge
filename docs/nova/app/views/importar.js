/*
  Importar planilhas — tela nova da plataforma. Por baixo usa o MESMO motor de
  importação da plataforma atual (recargas.html), rodando invisível com a
  liberação de gravação restrita à importação (ver supabase_bridge.js).
  Nada de regra nova: leitura Spott/Move/Go Grid, duplicadas, histórico e
  backup são os originais (handleFiles, handleCustomerRegistryFiles…).
*/
(function () {
  "use strict";
  const { fmt, esc } = UBY;
  const SRC = "legado/obra-ev/recargas.html?nova_import=1";
  const ui = { work: "", month: new Date().toISOString().slice(0, 7), mode: "merge", log: [] };
  let frame = null, readyPromise = null;

  function engine() {
    if (readyPromise && frame && document.body.contains(frame)) return readyPromise;
    frame = document.createElement("iframe");
    frame.id = "importFrame";
    frame.title = "Motor de importação";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden";
    frame.src = SRC + "&t=" + Date.now();
    document.body.appendChild(frame);
    readyPromise = new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        try {
          const w = frame.contentWindow;
          const sel = w.document.getElementById("workSelector");
          if (typeof w.handleFiles === "function" && sel && sel.options.length && w.UBY_WRITE_SCOPE === "importacao") { clearInterval(timer); resolve(w); return; }
          if (w.UBY_SUPABASE_CLIENT && w.UBY_WRITE_SCOPE !== "importacao") { clearInterval(timer); reject(new Error("A liberação de importação não ficou ativa. Recarregue a página.")); return; }
        } catch (_) {}
        if (Date.now() - t0 > 90000) { clearInterval(timer); reject(new Error("O motor de importação não respondeu em 90 s.")); }
      }, 400);
    });
    readyPromise.catch(() => { readyPromise = null; });
    return readyPromise;
  }

  // Ao sair da rota de importação, remove o motor que tem gravação liberada.
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/importar") && frame) { frame.remove(); frame = null; readyPromise = null; }
  });

  const text = (w, id) => (w.document.getElementById(id)?.innerText || "").trim();
  // Uma obra pedida pela rota precisa ser carregada de novo no motor.
  function w_loaded_reset() { try { if (frame?.contentWindow) frame.contentWindow.__novaWorkLoaded = false; } catch (_) {} }

  async function selectWork(w, id) {
    const sel = w.document.getElementById("workSelector");
    if (sel.value !== id) { sel.value = id; await sel.onchange?.(); }
  }

  function files(w) {
    let list = [];
    try { list = w.eval("loadedFiles") || []; } catch (_) {}
    return list.map(f => ({ name: f.name, month: f.month || "", mode: f.importMode || "merge", platform: f.sourcePlatform || "", station: f.station || "", importedAt: f.importedAt || "" }))
      .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  }

  function log(msg, cls = "neutral") { ui.log.unshift({ at: new Date().toISOString(), msg, cls }); ui.log = ui.log.slice(0, 20); }

  function paintStatus(target, w) {
    const box = target.querySelector("#impStatus");
    if (!box || !w) return;
    const fb = text(w, "uploadFeedback"), st = text(w, "storageState");
    box.innerHTML = `${fb ? `<div class="list-row" style="display:block;white-space:normal"><strong style="color:var(--uby-ink)">Importação</strong><br>${esc(fb)}</div>` : ""}
      ${st ? `<div class="list-row" style="display:block;white-space:normal"><strong style="color:var(--uby-ink)">Base desta obra</strong><br>${esc(st)}</div>` : ""}`;
  }

  // Aguarda o motor terminar (mensagem final no uploadFeedback, sem "carregando").
  async function waitIdle(w, target, ms = 120000) {
    const t0 = Date.now();
    let last = "";
    while (Date.now() - t0 < ms) {
      await new Promise(r => setTimeout(r, 800));
      const fb = text(w, "uploadFeedback");
      if (fb !== last) { last = fb; paintStatus(target, w); }
      const cls = w.document.getElementById("uploadFeedback")?.innerHTML || "";
      if (fb && !/up-loading/.test(cls) && !/(carregando|lendo|processando|salvando|importando)/i.test(fb)) return fb;
    }
    return text(w, "uploadFeedback") || "Tempo esgotado aguardando o motor.";
  }

  // Rota: #/importar/<obra>/<AAAA-MM>/<volta> (vinda do botão da página do carregador).
  async function render(target, params = []) {
    if (params[0]) { ui.work = params[0]; w_loaded_reset(); }
    if (/^\d{4}-\d{2}$/.test(params[1] || "")) ui.month = params[1];
    ui.returnTo = /^#\//.test(params[2] || "") ? params[2] : "";
    ui.returnLabel = params[3] || "";
    target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Preparando a importação</h2><p>Carregando o motor de importação e as obras.</p></div>`;
    let w;
    try { w = await engine(); }
    catch (err) { target.innerHTML = `<div class="loading"><h2>Não foi possível preparar a importação</h2><p>${esc(err.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`; return; }
    if (!location.hash.startsWith("#/importar")) return;
    const sel = w.document.getElementById("workSelector");
    const works = [...sel.options].map(o => ({ id: o.value, label: o.textContent }));
    ui.workNotFound = !!ui.work && !works.some(x => x.id === ui.work);
    if (!ui.work || ui.workNotFound) ui.work = sel.value || works[0]?.id || "";
    // Carrega a base completa da obra (mesmo passo de trocar a obra no original).
    if (sel.value !== ui.work || !w.__novaWorkLoaded) {
      target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Carregando a base da obra</h2></div>`;
      try { sel.value = ui.work; await sel.onchange?.(); w.__novaWorkLoaded = true; } catch (_) {}
    }
    if (!location.hash.startsWith("#/importar")) return;
    draw(target, w, works);
  }

  function draw(target, w, works) {
    const list = files(w);
    const undoVisible = w.document.getElementById("undoLastImportBtn")?.style.display !== "none";
    const monthVisible = w.document.getElementById("clearSelectedMonthBtn")?.style.display !== "none";
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Entrada de dados</p><h1>Importar planilhas</h1>
        <p class="lead">Planilhas de recargas (Spott, Move, Go Grid) e cadastro de clientes, direto na plataforma nova. Mesmo motor de importação da plataforma atual: elimina duplicadas, guarda histórico e permite desfazer.</p></div>
        <div class="callout" style="border-left-color:var(--uby-red);background:var(--uby-red-soft)"><strong>Grava na base real</strong><small>A mesma base da plataforma atual. ${ui.returnTo ? `Depois de importar, você volta para <a href="${esc(ui.returnTo)}">${esc(ui.returnLabel || "a página do carregador")}</a> com os números atualizados.` : `Depois de importar, clique em "Atualizar painéis" para ver os números novos no Comando, Unidades e Financeiro.`}</small></div></div>
      ${ui.returnTo ? `<p style="margin:-6px 0 14px"><a href="${esc(ui.returnTo)}" style="font-weight:800;font-size:12px">← Voltar para ${esc(ui.returnLabel || "a estação")}</a></p>` : ""}
      ${ui.workNotFound ? `<div class="note" style="margin-bottom:14px">A obra desta estação não aparece na lista de importação. Escolha a obra correta abaixo.</div>` : ""}

      <div class="split" style="margin-bottom:18px">
        <section class="section" style="margin:0">
          <div class="section-head"><div><p class="kicker">1 · Recargas</p><h2>Planilha de recargas</h2><p>Escolha a obra, o mês e o modo. Depois arraste ou selecione o arquivo.</p></div></div>
          <div class="imp-fields">
            <label class="mini imp-field"><span class="k">Obra / estação</span><select class="select" id="impWork" title="${esc(works.find(x => x.id === ui.work)?.label || "")}">${works.map(x => `<option value="${esc(x.id)}" ${x.id === ui.work ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
            <label class="mini imp-field"><span class="k">Mês da planilha</span><input class="select" type="month" id="impMonth" value="${esc(ui.month)}"></label>
            <label class="mini imp-field"><span class="k">Modo</span><select class="select" id="impMode"><option value="merge" ${ui.mode === "merge" ? "selected" : ""}>Consolidar no mês</option><option value="replace" ${ui.mode === "replace" ? "selected" : ""}>Substituir mês completo</option></select></label>
          </div>
          <label id="impDrop" style="display:grid;place-items:center;gap:6px;padding:34px 16px;border:2px dashed var(--uby-line-strong);border-radius:12px;background:var(--uby-surface-soft);cursor:pointer;text-align:center">
            <span style="font-size:26px">⇪</span>
            <strong>Arraste a planilha aqui ou clique para selecionar</strong>
            <small>.xlsx, .xls ou .csv exportado da plataforma de recarga. Consolidar soma vários carregadores no mês; substituir é para o fechamento completo.</small>
            <input type="file" id="impFile" accept=".xlsx,.xls,.csv" multiple hidden>
          </label>
          <div class="list" id="impStatus" style="margin-top:12px"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            ${undoVisible ? `<button class="btn" id="impUndo">Desfazer última planilha</button>` : ""}
            ${monthVisible ? `<button class="btn" id="impClearMonth">Excluir mês selecionado</button>` : ""}
            <a class="btn link-btn" href="#/importar-original">Histórico de backups e opções avançadas</a>
            <button class="btn primary" id="impRefresh">Atualizar painéis</button>
          </div>
        </section>
        <section class="section" style="margin:0">
          <div class="section-head"><div><p class="kicker">2 · Clientes</p><h2>Cadastro de clientes</h2><p>Planilha de clientes da plataforma de recarga. Só clientes novos entram; os existentes ficam preservados.</p></div></div>
          <label id="cliDrop" style="display:grid;place-items:center;gap:6px;padding:26px 16px;border:2px dashed var(--uby-line-strong);border-radius:12px;background:var(--uby-surface-soft);cursor:pointer;text-align:center">
            <span style="font-size:22px">⇪</span><strong>Arraste ou selecione a planilha de clientes</strong><small>.csv, .xlsx ou .xls</small>
            <input type="file" id="cliFile" accept=".csv,.xlsx,.xls" multiple hidden>
          </label>
          <h3 style="margin:16px 0 8px">Registro desta sessão</h3>
          <div class="list">${ui.log.map(l => `<div class="list-row" style="display:block;white-space:normal"><small style="color:var(--uby-muted)">${fmt.dt(l.at)}</small><div><span class="badge ${l.cls}">${l.cls === "ok" ? "ok" : l.cls === "bad" ? "atenção" : "info"}</span> ${esc(l.msg)}</div></div>`).join("") || `<div class="note">Nenhuma importação feita nesta sessão.</div>`}</div>
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Base desta obra</p><h2>Planilhas já importadas (${list.length})</h2></div></div>
        <div class="table-wrap" style="max-height:360px"><table><thead><tr><th>Arquivo</th><th>Mês</th><th>Modo</th><th>Plataforma</th><th>Estação</th><th>Importado em</th></tr></thead>
          <tbody>${list.map(f => `<tr><td><strong>${esc(f.name)}</strong></td><td>${esc(f.month || "—")}</td><td>${f.mode === "replace" ? "Substituir" : "Consolidar"}</td><td>${esc(f.platform || "—")}</td><td>${esc(f.station || "—")}</td><td>${f.importedAt ? fmt.dt(f.importedAt) : "—"}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhuma planilha registrada para esta obra.</td></tr>`}</tbody></table></div>
      </section>`;
    paintStatus(target, w);

    const $ = s => target.querySelector(s);
    $("#impWork").onchange = async e => { ui.work = e.target.value; $("#impStatus").innerHTML = `<div class="note">Carregando a base completa da obra…</div>`; await selectWork(w, ui.work); draw(target, w, works); };
    $("#impMonth").onchange = e => { ui.month = e.target.value; };
    $("#impMode").onchange = e => { ui.mode = e.target.value; };

    const runRecharge = async fileList => {
      const arr = [...fileList].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (!arr.length) { $("#impStatus").innerHTML = `<div class="note">Arquivo não reconhecido. Envie .xlsx, .xls ou .csv.</div>`; return; }
      if (!ui.month) { $("#impStatus").innerHTML = `<div class="note">Escolha o mês da planilha.</div>`; return; }
      if (ui.mode === "replace" && !confirm(`Substituir o mês ${ui.month} completo desta obra pela planilha "${arr[0].name}"?\n\nO mês atual fica salvo no histórico de backups.`)) return;
      w.document.getElementById("importMonth").value = ui.month;
      w.document.getElementById("importMode").value = ui.mode;
      $("#impDrop").style.opacity = ".5";
      $("#impStatus").innerHTML = `<div class="note">Importando ${esc(arr.map(f => f.name).join(", "))}…</div>`;
      try {
        await w.handleFiles(arr);
        const result = await waitIdle(w, target);
        const bad = /(bloquead|erro|falha|reconhecid)/i.test(result);
        log(`${arr.map(f => f.name).join(", ")} → ${result}`, bad ? "bad" : "ok");
        // Veio da página do carregador: atualiza os painéis e volta para ela.
        if (!bad && ui.returnTo) {
          const back = ui.returnTo;
          $("#impStatus").innerHTML = `<div class="note">Importação concluída: ${esc(result)}<br>Atualizando os painéis e voltando para ${esc(ui.returnLabel || "a estação")}…</div>`;
          setTimeout(() => { document.getElementById("refreshButton").click(); UBY.go(back); }, 1800);
          return;
        }
      } catch (err) { log(`${arr.map(f => f.name).join(", ")} → ${err.message}`, "bad"); }
      draw(target, w, works);
    };
    const drop = $("#impDrop");
    $("#impFile").onchange = e => runRecharge(e.target.files);
    drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = "var(--uby-green)"; };
    drop.ondragleave = () => { drop.style.borderColor = ""; };
    drop.ondrop = e => { e.preventDefault(); drop.style.borderColor = ""; runRecharge(e.dataTransfer.files); };

    const runClients = async fileList => {
      const arr = [...fileList].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (!arr.length) return;
      $("#cliDrop").style.opacity = ".5";
      try {
        await w.handleCustomerRegistryFiles(arr);
        const st = text(w, "customerRegistryStatus") || "Importação de clientes concluída.";
        log(`Clientes: ${st}`, /(pendente|nao executada|não executada|erro)/i.test(st) ? "bad" : "ok");
      } catch (err) { log(`Clientes: ${err.message}`, "bad"); }
      draw(target, w, works);
    };
    const cdrop = $("#cliDrop");
    $("#cliFile").onchange = e => runClients(e.target.files);
    cdrop.ondragover = e => { e.preventDefault(); cdrop.style.borderColor = "var(--uby-green)"; };
    cdrop.ondragleave = () => { cdrop.style.borderColor = ""; };
    cdrop.ondrop = e => { e.preventDefault(); cdrop.style.borderColor = ""; runClients(e.dataTransfer.files); };

    const undo = $("#impUndo");
    if (undo) undo.onclick = async () => { w.document.getElementById("undoLastImportBtn").click(); const r = await waitIdle(w, target, 60000); log(`Desfazer última planilha → ${r}`); draw(target, w, works); };
    const clr = $("#impClearMonth");
    if (clr) clr.onclick = async () => { w.document.getElementById("importMonth").value = ui.month; w.document.getElementById("clearSelectedMonthBtn").click(); const r = await waitIdle(w, target, 60000); log(`Excluir mês ${ui.month} → ${r}`); draw(target, w, works); };
    $("#impRefresh").onclick = () => document.getElementById("refreshButton").click();
  }

  UBY.register("importar", { render });
})();

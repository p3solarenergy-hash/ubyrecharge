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
          if (typeof w.handleFiles === "function" && sel && sel.options.length && w.UBY_WRITE_SCOPE === "importacao") {
            clearInterval(timer);
            // Motor antigo em cache juntaria recargas distintas: não deixa importar com ele.
            if (typeof w.markDistinctRepeatedRows !== "function") { reject(new Error("O motor de importação está desatualizado nesta aba. Recarregue a página (F5) antes de importar.")); return; }
            resolve(w); return;
          }
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

  // handleFiles() da plataforma original só enfileira a planilha e retorna na hora;
  // a leitura e a gravação no Supabase acontecem em rechargeImportQueue. Espera a
  // fila de verdade (inclui saveRechargeBase) antes de considerar a importação concluída.
  async function waitQueue(w, ms = 300000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { await w.eval("rechargeImportQueue"); } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
      let pending = 0;
      try { pending = Number(w.eval("queuedRechargeImports")) || 0; } catch (_) {}
      if (!pending) return true;
    }
    return false;
  }
  // Avisos sobre a qualidade das recargas (sessões curtas, possível falha) não são
  // problema de importação: ficam na Análise operacional, não aqui.
  const rechargeNotes = t => String(t || "").split(/(?<=\.)\s+/).filter(x => !/(poss[ií]vel falha|an[aá]lise operacional)/i.test(x)).join(" ").trim();
  function importOutcome(w) {
    const fb = rechargeNotes(text(w, "uploadFeedback")), st = rechargeNotes(text(w, "storageState"));
    const msg = [fb, st].filter(Boolean).join(" · ") || "Planilha importada e salva na base.";
    return { msg, bad: /(❌|bloquead|erro|falha ao|nao foi possivel|não foi possível|reconhecid)/i.test(`${fb} ${st}`) };
  }
  // Recarrega o motor da nova (mesmo efeito do F5 nos painéis) sem sair da tela.
  function refreshPanels() { document.getElementById("refreshButton")?.click(); }

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

  // ---- Importação automática Spott ----------------------------------------
  // Lê cada exportação da Spott com o MESMO leitor do motor (rechargeRowsFromFileBuffer,
  // detectRechargeLayout, parseDate/monthKey). Arquivo com um só Local e um só mês vai
  // inteiro; se misturar locais ou meses, é dividido em partes que o motor aceita.
  // Destino de cada Local: só é automático quando é CERTO — mapa oficial do motor
  // (SPOTT_REQUIRED_LOCAL_BY_WORK) e/ou histórico real (o Local já foi gravado em uma
  // única obra). Se as fontes discordarem, ou o Local for novo, a linha fica bloqueada
  // até alguém escolher. A gravação continua sendo handleFiles() em "Consolidar", que
  // elimina duplicadas e revalida o Local; depois conferimos que cada recarga chegou.
  ui.auto = { groups: [], errors: [], running: false };

  function localKey(w, v) { return w.normalizeStationForCompare(v || ""); }

  // Obras em que cada Local (nome bruto da planilha) já tem recargas gravadas.
  function localHistory(w) {
    const hist = new Map();
    let recs = {};
    try { recs = w.eval("allRechargeRecords") || {}; } catch (_) {}
    Object.entries(recs).forEach(([id, r]) => (r.charges || []).forEach(c => {
      const k = localKey(w, c.rawStation || c._sourceStation || "");
      if (!k) return;
      if (!hist.has(k)) hist.set(k, new Map());
      hist.get(k).set(id, (hist.get(k).get(id) || 0) + 1);
    }));
    return hist;
  }

  function routeLocal(w, local, hist, works) {
    let req = {};
    try { req = w.eval("SPOTT_REQUIRED_LOCAL_BY_WORK") || {}; } catch (_) {}
    const key = localKey(w, local);
    const official = Object.keys(req).find(id => localKey(w, req[id]) === key) || "";
    const seen = [...(hist.get(key)?.keys() || [])];
    const exists = id => works.some(x => x.id === id);
    if (!key) return { workId: "", how: "Planilha sem Local — escolha a obra." };
    if (official && seen.length && (seen.length > 1 || seen[0] !== official))
      return { workId: "", how: `Conflito: o mapa oficial indica ${official}, mas o histórico tem este Local em ${seen.join(", ")}. Confira antes de escolher.` };
    if (!official && seen.length > 1) return { workId: "", how: `Este Local já aparece em ${seen.length} obras (${seen.join(", ")}). Escolha a obra.` };
    const id = official || seen[0] || "";
    if (!id) return { workId: "", how: "Local novo, sem histórico. Escolha a obra." };
    if (!exists(id)) return { workId: "", how: `A obra ${id} não está disponível para importação. Escolha a obra.` };
    const n = hist.get(key)?.get(id) || 0;
    return { workId: id, auto: true, how: official && n ? "Mapa oficial do motor + histórico confirmam esta obra" : official ? "Mapa oficial do motor" : "Histórico: este Local só foi gravado nesta obra" };
  }

  async function analyzeSpott(w, file, works, hist) {
    const rows = await w.rechargeRowsFromFileBuffer(await file.arrayBuffer(), /\.csv$/i.test(file.name));
    const layout = w.detectRechargeLayout(rows || []);
    if (layout.type !== "spott") return { file: file.name, error: "não é uma lista de transações da Spott. Planilhas da Move/Go Grid continuam na área \"Planilha de recargas\" abaixo." };
    const c = layout.cols, head = rows.slice(0, layout.headerRow + 1), byKey = new Map();
    for (let i = layout.headerRow + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !w.rowHasData(r)) continue;
      const local = w.rowCellText(r, c.station);
      const mk = w.monthKey(w.parseDate(w.rowCellText(r, c.startLocal)));
      const k = local + "\u0000" + mk;
      if (!byKey.has(k)) byKey.set(k, { local, month: mk, rows: [], ids: new Set(), charges: 0, energy: 0, revenue: 0 });
      const g = byKey.get(k);
      g.rows.push(r); g.charges++;
      // Mesma regra do motor (markDistinctRepeatedRows): só é a mesma recarga se a linha
      // for idêntica em motorista, início, fim, carregador, energia, valor, status e duração.
      g.ids.add([c.email, c.driver, c.startLocal, c.endLocal, c.endCharge, c.charger, c.energy, c.totalValue, c.status, c.duration].map(i => w.rowCellText(r, i)).join("|"));
      g.energy += Number(w.parseNumber(w.readCell(r, c.energy))) || 0;
      g.revenue += Number(w.parseNumber(w.readCell(r, c.totalValue))) || 0;
    }
    // Linhas sem data seguem o único mês do mesmo Local (é o que o motor faz ao importar).
    let groups = [...byKey.values()];
    groups.filter(g => g.month === "unknown").forEach(u => {
      const same = groups.filter(g => g.local === u.local && g.month !== "unknown");
      if (same.length === 1) { const t = same[0]; t.rows.push(...u.rows); u.ids.forEach(x => t.ids.add(x)); t.charges += u.charges; t.energy += u.energy; t.revenue += u.revenue; u.merged = true; }
    });
    groups = groups.filter(g => !g.merged);
    if (!groups.length) return { file: file.name, error: "planilha sem recargas." };
    const whole = groups.length === 1;
    await w.ensureSpreadsheetLibrary();
    const X = w.XLSX, base = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
    return {
      file: file.name,
      groups: groups.map(g => {
        let part = file;
        if (!whole) {
          const wb = X.utils.book_new();
          X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([...head, ...g.rows]), "Recargas");
          const tag = `${g.local || "sem-local"} ${g.month}`.replace(/[\\/:*?"<>|]+/g, "-");
          part = new File([X.write(wb, { type: "array", bookType: "xlsx" })], `${base} (${tag}).xlsx`,
            { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        }
        return { source: file.name, local: g.local, month: g.month === "unknown" ? "" : g.month, charges: g.charges, unique: g.ids.size,
          energy: g.energy, revenue: g.revenue, ...routeLocal(w, g.local, hist, works), part, status: "pronto", msg: "" };
      })
    };
  }

  const monthName = mk => { const [y, m] = mk.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(". de ", "/").replace(" de ", "/"); };

  function autoSection(works) {
    const a = ui.auto, label = id => works.find(x => x.id === id)?.label || "";
    const badge = g => g.status === "ok" ? `<span class="badge ok">importado</span>`
      : g.status === "erro" ? `<span class="badge bad">atenção</span>`
      : g.status === "importando" ? `<span class="badge neutral">importando…</span>`
      : g.status === "ignorado" ? `<span class="badge neutral">ignorado</span>`
      : (!g.workId || !g.month) ? `<span class="badge bad">escolha</span>` : `<span class="badge neutral">pronto</span>`;
    const ready = a.groups.filter(g => g.status === "pronto" && g.workId && g.month).length;
    const rows = a.groups.map((g, i) => `<tr>
        <td><strong>${esc(g.local || "Local ausente")}</strong><br><small style="color:var(--uby-muted)">${esc(g.source)}</small></td>
        <td>${g.status === "pronto" ? `<select class="select" data-auto-work="${i}" style="min-width:180px"><option value="">— escolher obra —</option>${works.map(x => `<option value="${esc(x.id)}" ${x.id === g.workId ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>` : esc(label(g.workId) || "—")}${g.how ? `<br><small style="white-space:normal;color:${g.workId ? "var(--uby-muted)" : "var(--uby-red)"}">${g.auto ? "✓ " : ""}${esc(g.how)}</small>` : ""}</td>
        <td>${g.status === "pronto" && !g.month ? `<input class="select" type="month" data-auto-month="${i}">` : esc(g.month ? monthName(g.month) : "—")}</td>
        <td class="num">${g.charges}</td><td class="num">${fmt.kwh(g.energy)}</td><td class="num">${fmt.brl(g.revenue)}</td>
        <td>${badge(g)}${g.msg ? `<br><small style="white-space:normal">${esc(g.msg)}</small>` : ""}</td>
        <td>${g.status === "pronto" ? `<button class="btn" data-auto-skip="${i}" title="Não importar esta linha">✕</button>` : ""}</td></tr>`).join("");
    return `<section class="section" style="margin-bottom:18px">
      <div class="section-head"><div><p class="kicker">Automático · Spott</p><h2>Importação automática da Spott</h2>
        <p>Arraste de uma vez todas as listas de transações exportadas da Spott (um arquivo por local, de qualquer mês). A plataforma identifica a obra pelo Local e o mês pelas datas, mostra o resumo e importa tudo em "Consolidar" (sem duplicar recargas).</p></div></div>
      <label id="autoDrop" style="display:grid;place-items:center;gap:6px;padding:26px 16px;border:2px dashed var(--uby-green);border-radius:12px;background:var(--uby-surface-soft);cursor:pointer;text-align:center;${a.running ? "opacity:.5;pointer-events:none" : ""}">
        <span style="font-size:24px">⇪</span><strong>Arraste aqui os arquivos da Spott</strong><small>.xlsx, .xls ou .csv · pode soltar vários de uma vez</small>
        <input type="file" id="autoFile" accept=".xlsx,.xls,.csv" multiple hidden>
      </label>
      ${a.errors.map(e => `<div class="note" style="margin-top:10px">${esc(e)}</div>`).join("")}
      ${a.groups.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Local Spott</th><th>Obra</th><th>Mês</th><th class="num">Recargas</th><th class="num">Energia</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn primary" id="autoRun" ${ready && !a.running ? "" : "disabled"}>${a.running ? "Importando…" : `Importar ${ready} ${ready === 1 ? "planilha" : "planilhas"}`}</button>
          <button class="btn" id="autoClear" ${a.running ? "disabled" : ""}>Limpar lista</button>
        </div>` : ""}
    </section>`;
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

      ${autoSection(works)}

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
        const finished = await waitQueue(w);
        const { msg, bad } = finished ? importOutcome(w) : { msg: "A gravação ainda não terminou após 5 minutos. Confira a base antes de importar de novo.", bad: true };
        log(`${arr.map(f => f.name).join(", ")} → ${msg}`, bad ? "bad" : "ok");
        if (!bad) {
          // Gravação concluída no Supabase: atualiza os painéis já, sem precisar de F5.
          refreshPanels();
          if (ui.returnTo) {
            $("#impStatus").innerHTML = `<div class="note">Importação concluída: ${esc(msg)}<br>Painéis atualizando · voltando para ${esc(ui.returnLabel || "a estação")}…</div>`;
            UBY.go(ui.returnTo);
            return;
          }
          log("Painéis atualizados com a planilha nova (Comando, Unidades, Financeiro…).", "ok");
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
        const badCli = /(pendente|nao executada|não executada|erro)/i.test(st);
        log(`Clientes: ${st}`, badCli ? "bad" : "ok");
        if (!badCli) refreshPanels();
      } catch (err) { log(`Clientes: ${err.message}`, "bad"); }
      draw(target, w, works);
    };
    const cdrop = $("#cliDrop");
    $("#cliFile").onchange = e => runClients(e.target.files);
    cdrop.ondragover = e => { e.preventDefault(); cdrop.style.borderColor = "var(--uby-green)"; };
    cdrop.ondragleave = () => { cdrop.style.borderColor = ""; };
    cdrop.ondrop = e => { e.preventDefault(); cdrop.style.borderColor = ""; runClients(e.dataTransfer.files); };

    const undo = $("#impUndo");
    if (undo) undo.onclick = async () => { w.document.getElementById("undoLastImportBtn").click(); const r = await waitIdle(w, target, 60000); log(`Desfazer última planilha → ${r}`); refreshPanels(); draw(target, w, works); };
    const clr = $("#impClearMonth");
    if (clr) clr.onclick = async () => { w.document.getElementById("importMonth").value = ui.month; w.document.getElementById("clearSelectedMonthBtn").click(); const r = await waitIdle(w, target, 60000); log(`Excluir mês ${ui.month} → ${r}`); refreshPanels(); draw(target, w, works); };
    $("#impRefresh").onclick = () => document.getElementById("refreshButton").click();

    // Importação automática Spott
    const a = ui.auto, adrop = $("#autoDrop"), label = id => works.find(x => x.id === id)?.label || id;
    const addSpott = async fileList => {
      const arr = [...fileList].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (!arr.length) return;
      a.errors = [];
      adrop.innerHTML = `<div class="spinner"></div><strong>Lendo ${arr.length} ${arr.length === 1 ? "arquivo" : "arquivos"}…</strong>`;
      const hist = localHistory(w);
      for (const f of arr) {
        try {
          const r = await analyzeSpott(w, f, works, hist);
          if (r.error) a.errors.push(`${f.name}: ${r.error}`);
          else a.groups.push(...r.groups);
        } catch (err) { a.errors.push(`${f.name}: ${err.message}`); }
      }
      a.groups.sort((x, y) => String(x.workId).localeCompare(String(y.workId)) || String(x.month).localeCompare(String(y.month)));
      draw(target, w, works);
    };
    $("#autoFile").onchange = e => addSpott(e.target.files);
    adrop.ondragover = e => { e.preventDefault(); adrop.style.background = "var(--uby-green-soft)"; };
    adrop.ondragleave = () => { adrop.style.background = ""; };
    adrop.ondrop = e => { e.preventDefault(); adrop.style.background = ""; addSpott(e.dataTransfer.files); };
    target.querySelectorAll("[data-auto-work]").forEach(el => el.onchange = () => {
      const g = a.groups[+el.dataset.autoWork];
      if (el.value && !confirm(`Mandar as ${g.charges} recargas do Local "${g.local || "sem Local"}" para ${label(el.value)}?

O motor ainda confere o Local oficial de cada obra antes de gravar.`)) { el.value = g.workId; return; }
      g.workId = el.value; g.auto = false; g.how = el.value ? "Escolhido manualmente" : g.how; draw(target, w, works);
    });
    target.querySelectorAll("[data-auto-month]").forEach(el => el.onchange = () => { a.groups[+el.dataset.autoMonth].month = el.value; draw(target, w, works); });
    target.querySelectorAll("[data-auto-skip]").forEach(el => el.onclick = () => { a.groups[+el.dataset.autoSkip].status = "ignorado"; draw(target, w, works); });
    const aclear = $("#autoClear");
    if (aclear) aclear.onclick = () => { a.groups = []; a.errors = []; draw(target, w, works); };
    const arun = $("#autoRun");
    if (arun) arun.onclick = async () => {
      const todo = a.groups.filter(g => g.status === "pronto" && g.workId && g.month);
      if (!todo.length) return;
      const obras = new Set(todo.map(g => g.workId)).size;
      if (!confirm(`Importar ${todo.length} planilha(s) da Spott em ${obras} obra(s), no modo "Consolidar no mês"?\n\nRecargas que já estão na base são reconhecidas e não duplicam. Cada importação pode ser desfeita no histórico de backups.`)) return;
      a.running = true;
      let okCount = 0;
      for (const g of todo) {
        if (!frame || !document.body.contains(frame)) break;
        g.status = "importando"; draw(target, w, works);
        try {
          await selectWork(w, g.workId);
          ui.work = g.workId; w.__novaWorkLoaded = true;
          w.document.getElementById("uploadFeedback").innerHTML = "";
          w.document.getElementById("importMonth").value = g.month;
          w.document.getElementById("importMode").value = "merge";
          await w.handleFiles([g.part]);
          const finished = await waitQueue(w);
          let { msg, bad } = finished ? importOutcome(w) : { msg: "A gravação não terminou em 5 minutos. Confira a base antes de repetir.", bad: true };
          // Conferência: as recargas deste Local e mês precisam estar na obra de destino.
          if (!bad) {
            const k = localKey(w, g.local);
            let found = 0;
            try { found = (w.eval("allCharges") || []).filter(c => localKey(w, c.rawStation || c._sourceStation) === k && w.chargeMonthKey(c) === g.month).length; } catch (_) {}
            const dup = g.charges - g.unique, dupNote = dup ? ` A planilha repete ${dup} linha(s) idêntica(s) (mesmo horário, energia e valor); cada uma conta como uma recarga só.` : "";
            if (found < g.unique) { bad = true; msg = `Importação incompleta: a planilha tem ${g.unique} recargas distintas e a obra ficou com ${found} deste Local no mês. Recarregue a página (F5) e importe de novo; se continuar, me avise.${dupNote}`; }
            else msg = `✓ ${found} recargas de ${g.local} conferidas em ${label(g.workId)} (${g.month}).${dupNote} ${msg}`;
          }
          g.status = bad ? "erro" : "ok"; g.msg = msg;
          if (!bad) okCount++;
          log(`Spott ${g.local} ${g.month} → ${msg}`, bad ? "bad" : "ok");
        } catch (err) { g.status = "erro"; g.msg = err.message; log(`Spott ${g.local} ${g.month} → ${err.message}`, "bad"); }
      }
      a.running = false;
      if (okCount) { refreshPanels(); log(`Importação automática: ${okCount} de ${todo.length} planilha(s) gravadas. Painéis atualizados.`, "ok"); }
      if (location.hash.startsWith("#/importar")) draw(target, w, works);
    };
  }

  UBY.register("importar", { render });
})();

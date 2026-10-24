/*
  Clube UBY — ranking mensal (R$ 1 = 1 ponto), participantes, parceiros e cupons.
  A base do Clube fica na nuvem (uby_financial_matrix, linha "club-uby"): vale em
  qualquer computador/celular. Participantes do formulário vêm do Google Forms.
  Gravação: página mínima oculta (legado/obra-ev/clube-gravacao.html), liberada
  só na rota #/clube e só para a linha do Clube (ver supabase_bridge.js).
*/
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { tab: "ranking", month: "", partnerForm: null, search: "", msg: null, busy: false };
  const mask = () => { try { return localStorage.getItem("uby-nova-mask") === "1"; } catch (_) { return false; } };
  const who = n => mask() ? String(n || "").split(/\s+/).map(p => p ? p[0] + "•••" : "").join(" ") : esc(n);
  const priv = v => mask() ? "•••" : esc(v || "");
  const STATUS = { active: ["Ativo", "ok"], prospect: ["Em negociação", "warn"], paused: ["Pausado", "neutral"] };
  const PRIORITY = { high: "Alta", medium: "Média", low: "Baixa" };

  // Benefícios pelo QR fixo no balcão (página pública nova/beneficio.html + função clube-beneficio).
  const BENEFIT_URL = "https://p3solarenergy-hash.github.io/ubyrecharge/nova/beneficio.html";
  const AUDIENCE = [["TODOS", "Todos que recarregaram na UBY"], ["TOP_MES_ANTERIOR", "Top N do ranking do mês anterior"], ["PRIMEIRAS_COMPRAS", "N primeiras vezes de cada cliente"], ["LOTE", "Lote de N usos (ação)"]];
  const PERIOD = [["DIA", "por dia"], ["SEMANA", "por semana"], ["MES", "por mês"], ["TOTAL", "no total"], ["ILIMITADO", "sem limite"]];
  const newQrCode = () => [...crypto.getRandomValues(new Uint8Array(5))].map(b => b.toString(16).padStart(2, "0")).join("");
  const qrLink = p => `${BENEFIT_URL}?p=${encodeURIComponent(p.qrCode)}`;
  // Sem regras gravadas, a função usa o benefício geral para todos, 1 vez por dia (mesmo padrão aqui).
  const rulesOf = p => Array.isArray(p.rules) && p.rules.length ? p.rules
    : (p.benefit ? [{ id: "geral", description: p.benefit, audience: "TODOS", n: "", period: "DIA", limit: 1, priority: 1, active: true }] : []);
  const spMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const nextMonth = mk => { const [y, m] = mk.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
  const uses = { month: "", rows: null, error: "", loading: false };
  // Relatório de usos (usuário, 19/10/2026: "relatório, filtro por data, por parceiro, exportar planilha e relatório").
  const spDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const addDay = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const rep = { from: `${spMonth()}-01`, to: spDay(), partner: "", status: "CONFIRMADO", q: "", rows: null, key: "", error: "", loading: false };

  // ---------- gravação (quadro oculto) ----------
  let frame = null, ready = null;
  function writer() {
    if (ready && frame && document.body.contains(frame)) return ready;
    frame = document.createElement("iframe");
    frame.id = "clubFrame"; frame.title = "Gravação do Clube"; frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:10px;height:10px;left:-99999px;top:0;border:0;visibility:hidden";
    frame.src = "legado/obra-ev/clube-gravacao.html?t=" + Date.now();
    document.body.appendChild(frame);
    ready = new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        try {
          const w = frame.contentWindow;
          if (w.UBY_SUPABASE && w.supabase) { w.UBY_SUPABASE.client(); if (w.UBY_WRITE_SCOPE === "clube") { clearInterval(timer); resolve(w); return; } }
        } catch (_) {}
        if (Date.now() - t0 > 30000) { clearInterval(timer); reject(new Error("A gravação do Clube não ficou disponível. Recarregue a página.")); }
      }, 300);
    });
    ready.catch(() => { ready = null; });
    return ready;
  }
  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/clube") && frame) { frame.remove(); frame = null; ready = null; } });

  async function save(label, mutate, summary) {
    if (ui.busy) return;
    ui.busy = true; ui.msg = { ok: true, text: `${label}: gravando…` }; paint();
    try {
      const w = await writer();
      await w.UBY_SUPABASE.saveClubData(mutate, { acao: summary || label });
      ui.msg = { ok: true, text: `${label}: salvo na nuvem.` };
      await load(true);
    } catch (err) { ui.msg = { ok: false, text: `${label}: ${err.message || err}` }; }
    finally { ui.busy = false; paint(); }
  }

  // ---------- dados ----------
  let data = null, target = null;
  async function load(force) {
    data = await UBY.state.api.clubData(ui.month || undefined, force);
    ui.month = data.monthKey;
  }
  function legacyLocal() {
    const read = k => { try { return JSON.parse(window.__novaLegacyRead?.(k) || "null"); } catch (_) { return null; } };
    const partners = read("uby-club-partners-v1");
    const coupons = read("uby-club-coupon-control-v1");
    const participants = read("uby-club-participants-v1");
    const out = {
      partners: Array.isArray(partners) ? partners : [],
      coupons: Array.isArray(coupons) ? coupons : Array.isArray(coupons?.rows) ? coupons.rows : [],
      participants: Array.isArray(participants) ? participants : Array.isArray(participants?.rows) ? participants.rows : []
    };
    out.any = out.partners.length + out.coupons.length + out.participants.length > 0;
    return out;
  }
  const mergeBy = (current, incoming, keyOf) => { const m = new Map((current || []).map(r => [keyOf(r), r])); (incoming || []).forEach(r => m.set(keyOf(r), { ...(m.get(keyOf(r)) || {}), ...r })); return [...m.values()]; };
  const partnerKey = p => p.id || String(p.name || "").toLowerCase();
  const couponKey = r => r.key || [r.dateKey, r.coupon, r.name, r.email, r.phone, Number(r.value || 0).toFixed(2)].join("|");
  const participantKey = r => r.key || [String(r.email || "").toLowerCase(), String(r.phone || "").replace(/\D/g, ""), String(r.name || "").toLowerCase()].join("|");
  const defaultPartners = () => [
    { id: "partner-muffatao", name: "Muffatão Autocenter", category: "Auto center", status: "active", benefit: "10% de desconto em todos os serviços da rede Muffatão Autocenter.", rule: "Válido para participantes do Clube UBY mediante comprovação no atendimento.", coupon: "CLUBEUBY", contact: "", validity: "Sem prazo", priority: "high", usageCount: 0, notes: "Benefício geral para todos os participantes do Clube UBY." },
    { id: "partner-bancouros", name: "Bancouros", category: "Parceiro comercial", status: "prospect", benefit: "Benefício a definir.", rule: "Definir regra comercial, público elegível e forma de comprovação.", coupon: "", contact: "", validity: "A definir", priority: "medium", usageCount: 0, notes: "" },
    { id: "partner-lava-cars", name: "Lava Cars", category: "Lavagem / estética", status: "prospect", benefit: "Benefício a definir para lavagem, higienização ou estética automotiva.", rule: "Definir regra comercial, unidades participantes e comprovação.", coupon: "", contact: "", validity: "A definir", priority: "medium", usageCount: 0, notes: "" }
  ];

  // Usos pelo QR no mês (lidos pela página de gravação do Clube, que já tem a sessão).
  async function loadUses(mk, force) {
    if (!mk || (!force && uses.month === mk)) return;   // já lido (ou com erro) neste mês: só recarrega no botão
    Object.assign(uses, { month: mk, rows: null, error: "", loading: true });
    try {
      const w = await writer();
      uses.rows = await w.UBY_SUPABASE.loadClubPartnerUses(`${mk}-01T00:00:00-03:00`, `${nextMonth(mk)}-01T00:00:00-03:00`);
    } catch (err) {
      uses.error = /club_partner_uses|does not exist|relation/i.test(String(err.message || err))
        ? "A tabela de usos ainda não existe no Supabase (aplique supabase/clube_beneficios.sql)." : String(err.message || err);
    } finally { uses.loading = false; if (ui.tab === "parceiros") paint(); }
  }

  async function loadRep(force) {
    const key = `${rep.from}|${rep.to}`;
    if (!rep.from || !rep.to || (!force && rep.key === key)) return;
    Object.assign(rep, { key, rows: null, error: "", loading: true });
    try {
      const w = await writer();
      rep.rows = await w.UBY_SUPABASE.loadClubPartnerUses(`${rep.from}T00:00:00-03:00`, `${addDay(rep.to, 1)}T00:00:00-03:00`);
    } catch (err) {
      rep.error = /club_partner_uses|does not exist|relation/i.test(String(err.message || err))
        ? "A tabela de usos ainda não existe no Supabase (aplique supabase/clube_beneficios.sql)." : String(err.message || err);
    } finally { rep.loading = false; if (ui.tab === "relatorio") paint(); }
  }
  // Linhas do relatório com os filtros da tela (parceiro, situação, cliente).
  const fold = v => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function repRows(c, anyStatus = false) {
    const names = new Map(c.partners.map(p => [p.id, p.name]));
    const q = fold(rep.q).trim();
    return (rep.rows || []).map(u => ({ ...u, partner: names.get(u.partner_id) || u.partner_id, contact: String(u.client_key || "").replace(/^(tel|mail):/, "") }))
      .filter(u => (!rep.partner || u.partner_id === rep.partner) && (anyStatus || rep.status === "TODOS" || u.status === rep.status)
        && (!q || fold(`${u.client_name} ${u.contact} ${u.code}`).includes(q)));
  }
  // Cancelados contam no período/parceiro/cliente, independente do filtro de situação.
  function repSummary(list, all = list) {
    const conf = list.filter(u => u.status === "CONFIRMADO");
    const group = (arr, keyOf) => {
      const m = new Map();
      arr.forEach(u => {
        const k = keyOf(u);
        const g = m.get(k) || { key: k, n: 0, clients: new Set(), partners: new Set(), first: u.created_at, last: u.created_at, sample: u };
        g.n++; g.clients.add(u.client_key); g.partners.add(u.partner);
        if (u.created_at < g.first) g.first = u.created_at;
        if (u.created_at > g.last) g.last = u.created_at;
        m.set(k, g);
      });
      return [...m.values()].sort((a, b) => b.n - a.n);
    };
    return { conf, cancelled: all.filter(u => u.status !== "CONFIRMADO"), byPartner: group(conf, u => u.partner), byClient: group(conf, u => u.client_key) };
  }
  const periodLabel = () => `${rep.from.split("-").reverse().join("/")} a ${rep.to.split("-").reverse().join("/")}`;
  function reportTab(c) {
    const list = repRows(c), s = repSummary(list, repRows(c, true));
    const partners = c.partners.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    const shown = list.slice(0, 500);
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Clube UBY · usos pelo QR</p><h2>Relatório de usos</h2><p>Filtre por período, parceiro, situação ou cliente. A planilha e o PDF saem exatamente com os filtros da tela.</p></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="clubRepXlsx" type="button" ${rep.rows ? "" : "disabled"}>⇩ Planilha (Excel)</button><button class="btn primary" id="clubRepPdf" type="button" ${rep.rows ? "" : "disabled"}>⇩ Relatório (PDF)</button></div></div>
        <div class="toolbar" style="box-shadow:none">
          <label>De <input class="select" type="date" id="clubRepFrom" value="${esc(rep.from)}"></label>
          <label>Até <input class="select" type="date" id="clubRepTo" value="${esc(rep.to)}"></label>
          <span class="seg" id="clubRepQuick">${[["mes", "Este mês"], ["ant", "Mês passado"], ["30", "30 dias"], ["ano", "Ano"]].map(([v, l]) => `<button type="button" data-q="${v}">${l}</button>`).join("")}</span>
          <select class="select" id="clubRepPartner"><option value="">Todos os parceiros</option>${partners.map(p => `<option value="${esc(p.id)}" ${rep.partner === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <select class="select" id="clubRepStatus">${[["CONFIRMADO", "Confirmados"], ["CANCELADO", "Cancelados"], ["TODOS", "Todos"]].map(([v, l]) => `<option value="${v}" ${rep.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <input class="search" id="clubRepQ" placeholder="Cliente, contato ou código" value="${esc(rep.q)}">
          <button class="btn ghost" id="clubRepReload" type="button" title="Ler de novo">↻</button>
        </div>
        ${rep.error ? `<div class="note" style="border-color:var(--uby-amber)">${esc(rep.error)}</div>` : ""}
        ${rep.loading || !rep.rows ? (rep.error ? "" : `<div class="note">Lendo os usos de ${esc(periodLabel())}…</div>`) : `
        <div class="grid g4" style="margin:6px 0 14px">
          ${kpi("Usos confirmados", fmt.int(s.conf.length), esc(periodLabel()), "", "lead")}
          ${kpi("Clientes atendidos", fmt.int(s.byClient.length), "pessoas diferentes")}
          ${kpi("Parceiros com uso", fmt.int(s.byPartner.length), `${fmt.int(partners.filter(p => p.status === "active").length)} ativos no Clube`)}
          ${kpi("Cancelados", fmt.int(s.cancelled.length), "usos desfeitos no caixa")}
        </div>
        <div class="split" style="margin-bottom:14px">
          <div><h3 style="margin:0 0 6px">Por parceiro</h3><div class="table-wrap"><table><thead><tr><th>Parceiro</th><th class="num">Usos</th><th class="num">Clientes</th><th>Primeiro</th><th>Último</th></tr></thead>
            <tbody>${s.byPartner.map(g => `<tr><td><strong>${esc(g.key)}</strong></td><td class="num">${fmt.int(g.n)}</td><td class="num">${fmt.int(g.clients.size)}</td><td><small>${fmt.dt(g.first)}</small></td><td><small>${fmt.dt(g.last)}</small></td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nenhum uso confirmado no filtro.</td></tr>`}</tbody></table></div></div>
          <div><h3 style="margin:0 0 6px">Clientes que mais usaram</h3><div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="num">Usos</th><th>Parceiros</th><th>Último</th></tr></thead>
            <tbody>${s.byClient.slice(0, 15).map(g => `<tr><td>${who(g.sample.client_name || "—")}<small>${priv(g.sample.contact)}</small></td><td class="num">${fmt.int(g.n)}</td><td><small>${esc([...g.partners].join(", "))}</small></td><td><small>${fmt.dt(g.last)}</small></td></tr>`).join("") || `<tr><td colspan="4" class="empty">—</td></tr>`}</tbody></table></div></div>
        </div>
        <h3 style="margin:0 0 6px">Usos (${fmt.int(list.length)})</h3>
        <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>Data</th><th>Parceiro</th><th>Benefício</th><th>Cliente</th><th>Código</th><th>Situação</th></tr></thead>
          <tbody>${shown.map(u => `<tr><td>${fmt.dt(u.created_at)}</td><td>${esc(u.partner)}</td><td><small>${esc(u.description)}</small></td><td>${who(u.client_name || "—")}<small>${priv(u.contact)}</small></td><td>${esc(u.code)}</td>
            <td><span class="badge ${u.status === "CONFIRMADO" ? "ok" : "neutral"}">${u.status === "CONFIRMADO" ? "confirmado" : "cancelado"}</span></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum uso neste filtro.</td></tr>`}</tbody></table></div>
        ${list.length > shown.length ? `<p class="source-line">Mostrando os ${fmt.int(shown.length)} mais recentes; a planilha e o PDF trazem todos os ${fmt.int(list.length)}.</p>` : ""}`}
      </section>`;
  }
  const repTitle = c => `Clube UBY - usos ${rep.from.split("-").reverse().join("-")} a ${rep.to.split("-").reverse().join("-")}${rep.partner ? ` - ${String((c.partners.find(p => p.id === rep.partner) || {}).name || "").replace(/[\\/:*?"<>|]+/g, "-")}` : ""}`;
  // Planilha (.xlsx) com três abas: usos, por parceiro e por cliente.
  async function exportXlsx(c) {
    const XLSX = await document.getElementById("motorFrame").contentWindow.ensureSpreadsheetLibrary();
    const list = repRows(c), s = repSummary(list);
    const dt = iso => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(list.map(u => ({ "Data": dt(u.created_at), "Parceiro": u.partner, "Benefício": u.description, "Cliente": u.client_name || "", "Contato": u.contact, "Código": u.code, "Situação": u.status === "CONFIRMADO" ? "confirmado" : "cancelado" }))), "Usos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.byPartner.map(g => ({ "Parceiro": g.key, "Usos confirmados": g.n, "Clientes": g.clients.size, "Primeiro uso": dt(g.first), "Último uso": dt(g.last) }))), "Por parceiro");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.byClient.map(g => ({ "Cliente": g.sample.client_name || "", "Contato": g.sample.contact, "Usos confirmados": g.n, "Parceiros": [...g.partners].join(", "), "Último uso": dt(g.last) }))), "Por cliente");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `${repTitle(c)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  // Relatório para imprimir / salvar em PDF (mesmo modelo dos relatórios da plataforma).
  function exportPdf(c) {
    const list = repRows(c), s = repSummary(list, repRows(c, true));
    const partnerName = rep.partner ? (c.partners.find(p => p.id === rep.partner) || {}).name || "" : "Todos os parceiros";
    const st = { CONFIRMADO: "confirmados", CANCELADO: "cancelados", TODOS: "todos" }[rep.status];
    const dt = iso => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const k = (l, v) => `<div class="kpi"><b>${v}</b><span>${esc(l)}</span></div>`;
    const html = `<div class="top"><div><div class="brand">UBY <b>Recharge</b> · Clube UBY</div><h1>Relatório de usos dos benefícios</h1>
        <div class="sub">${esc(periodLabel())} · ${esc(partnerName)} · usos ${esc(st)}${rep.q ? ` · cliente: ${esc(rep.q)}` : ""}</div></div><span class="badge">QR do balcão</span></div>
      <div class="kpis">${k("Usos confirmados", fmt.int(s.conf.length))}${k("Clientes atendidos", fmt.int(s.byClient.length))}${k("Parceiros com uso", fmt.int(s.byPartner.length))}${k("Cancelados", fmt.int(s.cancelled.length))}</div>
      <h2>Por parceiro</h2><table><thead><tr><th>Parceiro</th><th class="n">Usos</th><th class="n">Clientes</th><th>Primeiro uso</th><th>Último uso</th></tr></thead>
        <tbody>${s.byPartner.map(g => `<tr><td>${esc(g.key)}</td><td class="n">${g.n}</td><td class="n">${g.clients.size}</td><td>${dt(g.first)}</td><td>${dt(g.last)}</td></tr>`).join("") || `<tr><td colspan="5">Nenhum uso confirmado.</td></tr>`}</tbody></table>
      <h2>Usos</h2><table><thead><tr><th>Data</th><th>Parceiro</th><th>Cliente</th><th>Benefício</th><th>Código</th><th>Situação</th></tr></thead>
        <tbody>${list.map(u => `<tr><td>${dt(u.created_at)}</td><td>${esc(u.partner)}</td><td>${esc(u.client_name || "—")}</td><td>${esc(u.description)}</td><td>${esc(u.code)}</td><td>${u.status === "CONFIRMADO" ? "confirmado" : "cancelado"}</td></tr>`).join("") || `<tr><td colspan="6">Nenhum uso no filtro.</td></tr>`}</tbody></table>
      <div class="foot">Gerado em ${new Date().toLocaleString("pt-BR")} pela Nova Plataforma UBY · usos registrados quando o cliente toca USAR AGORA no balcão do parceiro.</div>`;
    UBY.reports.page(`UBY Recharge — ${repTitle(c)}`, html);
  }

  // Display de balcão (A5, 300 dpi) com o QR fixo do parceiro, gerado no navegador.
  let qrLib = null;
  function ensureQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return qrLib || (qrLib = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
      s.onload = () => resolve(window.qrcode); s.onerror = () => { qrLib = null; reject(new Error("Não carreguei o gerador de QR. Confira a internet.")); };
      document.head.appendChild(s);
    }));
  }
  // Identidade UBY Recharge: azul-marinho, verde e raio em degradê verde → turquesa (Poppins).
  const BRAND = { navy: "#0a1628", navy2: "#111f38", green: "#00ff85", teal: "#00e5c8", soft: "#9fb0c8" };
  async function ensurePoppins() {
    if (!document.querySelector("link[data-poppins]")) {
      const l = document.createElement("link"); l.rel = "stylesheet"; l.dataset.poppins = "1";
      l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&display=swap";
      document.head.appendChild(l);
      await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000); });
    }
    try { await Promise.all(["500", "600", "700", "800"].map(w => document.fonts.load(`${w} 80px Poppins`))); } catch (_) {}
  }
  // Raio do logo (contorno medido do arquivo oficial), desenhado com altura h a partir de (x, y).
  function drawBolt(g, x, y, h, fill) {
    const s = h / 181, P = [[215, 99], [142, 203], [186, 203], [165, 280], [237, 177], [197, 177]];
    g.beginPath(); P.forEach(([px, py], i) => g[i ? "lineTo" : "moveTo"](x + (px - 142) * s, y + (py - 99) * s)); g.closePath();
    g.fillStyle = fill; g.fill();
  }
  function roundRect(g, x, y, w, h, r, fill) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); }
  function loadImg(src) { return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error("Não consegui abrir a imagem.")); im.src = src; }); }
  // A logo fica guardada no próprio cadastro do parceiro: reduzida a no máximo 480px
  // (WebP; PNG no navegador que não grava WebP) para não pesar a página do QR.
  async function logoDataUrl(file) {
    if (!/^image\//.test(file.type)) throw new Error("Escolha uma imagem (PNG, JPG, WebP ou SVG).");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url), MAX = 480;
      const w0 = img.naturalWidth || MAX, h0 = img.naturalHeight || MAX, k = Math.min(1, MAX / Math.max(w0, h0));
      const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const webp = cv.toDataURL("image/webp", 0.9);
      return webp.startsWith("data:image/webp") ? webp : cv.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  }
  async function downloadDisplay(p) {
    const [qrcode] = await Promise.all([ensureQrLib(), ensurePoppins()]);
    const logo = p.logo ? await loadImg(p.logo).catch(() => null) : null;
    const qr = qrcode(0, "M"); qr.addData(qrLink(p)); qr.make();
    const W = 1748, H = 2480, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const font = (px, w = 700) => `${w} ${px}px Poppins, Arial, sans-serif`;
    const grad = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, BRAND.green); gr.addColorStop(1, BRAND.teal); return gr; };
    const center = (t, y, px, w, color, spacing = "0px") => { g.font = font(px, w); g.letterSpacing = spacing; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(t, W / 2, y); g.letterSpacing = "0px"; };
    const fit = (t, px, max) => {
      const out = []; g.font = font(px, 800);
      t.split(/\r?\n/).forEach(par => {
        let line = "";
        par.split(/\s+/).filter(Boolean).forEach(w => { const s2 = (line + " " + w).trim(); if (g.measureText(s2).width <= max) line = s2; else { if (line) out.push(line); line = w; } });
        out.push(line);
      });
      return out;
    };

    // fundo azul-marinho com brilho verde discreto no topo
    g.fillStyle = BRAND.navy; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, 260, 40, W / 2, 260, 900); glow.addColorStop(0, "#00ff8522"); glow.addColorStop(1, "#00ff8500");
    g.fillStyle = glow; g.fillRect(0, 0, W, 1100);

    // logo oficial (mesmo desenho da página do cliente: app/uby-logo.js)
    const S = 260; window.UBYLogo.draw(g, (W - window.UBYLogo.WIDTH * S) / 2, 130, S);

    // chamada
    center("CLIENTE DA REDE UBY?", 560, 60, 700, BRAND.green, "8px");
    const chamada = String(p.headline || rulesOf(p).find(r => r.audience === "TODOS")?.description || "Benefício exclusivo").trim();
    // Sem Enter: até 2 linhas. Com Enter: cabe quantas linhas forem, diminuindo a letra até
    // o bloco caber acima do QR sem empurrar os passos para cima do rodapé.
    const quebras = /\n/.test(chamada), ALTURA_MAX = logo ? 330 : 360;
    let px = 140, lines = fit(chamada, px, W - 220);
    while (((!quebras && lines.length > 2) || lines.length * (px + 18) > ALTURA_MAX) && px > 40) { px -= 4; lines = fit(chamada, px, W - 220); }
    let y = 650; lines.forEach(l => { center(l, y, px, 800, "#fff"); y += px + 18; });

    // QR num cartão branco com moldura verde
    const card = 860, cx = (W - card) / 2, top = Math.max(y + 40, 990);
    roundRect(g, cx - 14, top - 14, card + 28, card + 28, 70, grad(cx, top, cx + card, top + card));
    roundRect(g, cx, top, card, card, 58, "#fff");
    const n = qr.getModuleCount(), side = 740, cell = side / n, qx = cx + (card - side) / 2, qy = top + (card - side) / 2;
    g.fillStyle = BRAND.navy;
    for (let r = 0; r < n; r++) for (let c2 = 0; c2 < n; c2++) if (qr.isDark(r, c2)) g.fillRect(Math.floor(qx + c2 * cell), Math.floor(qy + r * cell), Math.ceil(cell), Math.ceil(cell));
    // selo do raio no centro do QR (correção M aguenta)
    roundRect(g, W / 2 - 66, top + card / 2 - 66, 132, 132, 32, BRAND.navy);
    drawBolt(g, W / 2 - 26, top + card / 2 - 46, 92, BRAND.green);

    // passos
    y = top + card + 64;
    ["Aponte a câmera do celular", "No caixa, toque em USAR AGORA", "Mostre a tela verde ao atendente"].forEach((t, i) => {
      g.font = font(58, 500); const w = g.measureText(t).width, bx = (W - (w + 110)) / 2;
      g.beginPath(); g.arc(bx + 34, y + 34, 34, 0, Math.PI * 2); g.fillStyle = BRAND.green; g.fill();
      g.font = font(44, 800); g.fillStyle = BRAND.navy; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), bx + 34, y + 36);
      g.font = font(58, 500); g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(t, bx + 100, y + 36);
      y += 92;
    });

    // rodapé com o parceiro
    if (logo) {
      // logo do parceiro num cartão branco, no lugar do nome
      g.fillStyle = grad(0, H - 260, W, H); g.fillRect(0, H - 260, W, 260);
      const lh = 120, lw = Math.min(W - 360, lh * (logo.naturalWidth || 1) / (logo.naturalHeight || 1)), dh = lw * (logo.naturalHeight || 1) / (logo.naturalWidth || 1);
      roundRect(g, (W - lw) / 2 - 36, H - 245, lw + 72, 150, 36, "#fff");
      g.drawImage(logo, (W - lw) / 2, H - 245 + (150 - dh) / 2, lw, dh);
      center("PARCEIRO DO CLUBE UBY", H - 76, 38, 600, BRAND.navy, "10px");
    } else {
      g.fillStyle = grad(0, H - 210, W, H); g.fillRect(0, H - 210, W, 210);
      center(String(p.name || "").toUpperCase(), H - 170, 64, 800, BRAND.navy, "2px");
      center("PARCEIRO DO CLUBE UBY", H - 82, 38, 600, BRAND.navy, "10px");
    }
    const a = document.createElement("a");
    a.download = `display-${String(p.name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.png`;
    a.href = cv.toDataURL("image/png"); a.click();
  }

  // ---------- telas ----------
  function rankingTab(c) {
    const s = c.summary, f = c.form, top = c.rows.slice(0, 3), medal = ["#c6a13a", "#9aa39c", "#a0663f"];
    const pub = c.partnerProgram?.topByMonth?.[c.monthKey], closed = c.monthKey && c.monthKey < spMonth();
    const validLabel = c.monthKey ? (c.months.find(m => m.key === nextMonth(c.monthKey))?.label || nextMonth(c.monthKey).split("-").reverse().join("/")) : "";
    const publishLine = !closed ? `<p style="margin:6px 0 0"><small>Mês em andamento: o Top 3 vale nos parceiros a partir do mês seguinte, depois de publicado.</small></p>`
      : `<p style="margin:6px 0 0"><small>${pub ? `Publicado para os parceiros em ${fmt.dt(pub.publishedAt)} — vale durante ${esc(validLabel)}.` : `<strong style="color:var(--uby-red)">Ainda não publicado</strong> — publique para o benefício do Top 3 valer em ${esc(validLabel)}.`}</small></p>`;
    return `
      <section class="section"><div class="grid g5">
        ${kpi("Participantes no mês", fmt.int(s.participants), `consumo pago em ${esc(c.label)}`, "", "lead")}
        ${kpi("Pontos do mês", fmt.int(s.points), "1 ponto por real gasto")}
        ${kpi("Receita do mês", fmt.brl(s.revenue), "base do ranking")}
        ${kpi("Com telefone", fmt.int(s.withPhone), s.participants ? `${fmt.pct1(s.withPhone / s.participants * 100)} dos participantes` : "")}
        ${kpi("Cadastro no formulário", fmt.int(s.registered), s.participants ? `${fmt.pct1(s.registered / s.participants * 100)} do ranking` : "")}
      </div></section>
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Pódio · ${esc(c.label)}</p><h2>Top 3</h2>${publishLine}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${closed && top.length ? `<button class="btn ${pub ? "" : "primary"}" id="clubPublishTop" type="button" ${ui.busy ? "disabled" : ""}>${pub ? "Publicar de novo" : "Publicar Top 3 para os parceiros"}</button>` : ""}<button class="btn" id="copyNotice" type="button">Copiar aviso dos vencedores</button></div></div>
          <div class="grid g3">${top.map((r, i) => `<div class="panel" style="border-top:3px solid ${medal[i]}"><p class="kicker" style="color:${medal[i]}">${i + 1}º lugar</p><h3 style="font-size:15px">${who(r.name)}</h3>
            <p style="margin:6px 0 0;font-size:22px;font-weight:850;color:var(--uby-forest)">${fmt.int(r.points)} pts</p><small>${fmt.brl(r.revenue)} · ${r.sessions} recarga(s)</small><br>
            <span class="badge ${r.registered ? "ok" : "warn"}" style="margin-top:6px">${r.registered ? "cadastro ok" : "sem cadastro"}</span></div>`).join("") || `<div class="note">Ainda sem pontuação no mês.</div>`}</div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Formulário do Clube</p><h2>Cadastros</h2><p>${f.endpoint ? "Formulário conectado." : "Formulário não conectado."} ${f.updatedAt ? `Última leitura ${fmt.dt(f.updatedAt)}.` : ""}</p></div></div>
          <div class="grid g2">${kpi("Cadastrados", fmt.int(f.total), "respostas do formulário + importados")}${kpi("Com LGPD", fmt.int(f.lgpd), f.total ? fmt.pct1(f.lgpd / f.total * 100) : "")}
            ${kpi("Com veículo", fmt.int(f.withVehicle), "marca, modelo ou placa")}${kpi("Com consumo UBY", fmt.int(f.matched), "no ranking do mês")}</div>
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Ranking completo</p><h2>${esc(c.label)} · ${c.rows.length} participante(s)</h2></div></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>#</th><th>Cliente</th><th class="num">Pontos do mês</th><th class="num">Pontos acumulados</th><th class="num">Faturamento</th><th class="num">Energia</th><th class="num">Recargas</th><th>Cadastro</th><th>Benefício</th></tr></thead>
          <tbody>${c.rows.map(r => `<tr><td>${r.position}</td><td><strong>${who(r.name)}</strong><small>${priv(r.phone || r.email)}</small></td><td class="num"><strong>${fmt.int(r.points)}</strong></td><td class="num">${fmt.int(r.accumulatedPoints)}</td>
            <td class="num">${fmt.brl(r.revenue)}</td><td class="num">${fmt.kwh(r.energy)}</td><td class="num">${r.sessions}</td><td><span class="badge ${r.registered ? "ok" : "neutral"}">${r.registered ? "sim" : "não"}</span></td><td style="white-space:normal;min-width:220px"><small>${esc(r.benefit)}</small></td></tr>`).join("") || `<tr><td colspan="9" class="empty">Sem participantes.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function participantsTab(c) {
    const q = ui.search.trim().toLowerCase();
    const list = c.participantsList.filter(p => !q || [p.name, p.email, p.phone, p.plate, p.vehicle].join(" ").toLowerCase().includes(q))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Participantes</p><h2>${fmt.int(c.participantsList.length)} cadastro(s)</h2>
          <p>Vêm do formulário do Clube (Google Forms) e de planilhas importadas. As importações ficam guardadas na nuvem (${fmt.int(c.manualParticipants)} registro(s)); o formulário é lido direto do Google.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="clubSync" type="button">↻ Ler formulário agora</button>
            <label class="btn" style="cursor:pointer">⇪ Importar planilha (CSV/Excel)<input id="clubPartImport" type="file" accept=".csv,.xlsx,.xls" hidden></label></div></div>
        <div class="toolbar"><input class="select" id="clubSearch" placeholder="Buscar por nome, e-mail, telefone ou placa" value="${esc(ui.search)}" style="min-width:320px"><span class="spacer"></span><small>${list.length} exibido(s)</small></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Participante</th><th>Contato</th><th>Veículo</th><th>LGPD</th><th>Regulamento</th><th>Consome na UBY</th><th>Benefício desejado</th><th>Cadastro</th></tr></thead>
          <tbody>${list.slice(0, 400).map(p => `<tr><td><strong>${who(p.name)}</strong></td><td><small>${priv(p.phone)}<br>${priv(p.email)}</small></td><td><small>${esc(p.vehicle || "—")}${p.plate ? ` · ${priv(p.plate)}` : ""}</small></td>
            <td><span class="badge ${p.lgpd ? "ok" : "warn"}">${p.lgpd ? "sim" : "não"}</span></td><td><span class="badge ${p.regulation ? "ok" : "warn"}">${p.regulation ? "sim" : "não"}</span></td>
            <td><span class="badge ${p.consumes ? "ok" : "neutral"}">${p.consumes ? "sim" : "ainda não"}</span></td><td style="white-space:normal;min-width:180px"><small>${esc(p.desiredBenefit || "—")}</small></td><td><small>${p.createdAt ? fmt.date(p.createdAt) : "—"}</small></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum participante${q ? " com essa busca" : ""}.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function partnersTab(c) {
    const partners = c.partners.slice().sort((a, b) => ({ active: 0, prospect: 1, paused: 2 }[a.status] ?? 3) - ({ active: 0, prospect: 1, paused: 2 }[b.status] ?? 3) || String(a.name).localeCompare(String(b.name), "pt-BR"));
    const f = ui.partnerForm || (ui.partnerForm = { id: "", name: "", category: "", status: "active", benefit: "", headline: "", rule: "", coupon: "", contact: "", validity: "", priority: "medium", notes: "", rules: [] });
    if (!Array.isArray(f.rules) || !f.rules.length) f.rules = rulesOf(f).map(r => ({ ...r }));
    const inp = (k, label, type = "text", extra = "") => `<label class="imp-field" style="min-width:0"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span><input class="select" data-pf="${k}" type="${type}" value="${esc(f[k] ?? "")}" ${extra} style="width:100%"></label>`;
    // Textos longos: Enter pula linha, e a quebra aparece no display e na tela verde.
    const TA_STYLE = "width:100%;height:auto;padding:8px;line-height:1.35;white-space:pre-wrap;overflow:auto;resize:vertical;cursor:text";
    const ta = (k, label, rows = 3) => `<label class="imp-field" style="min-width:0"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span><textarea class="select" data-pf="${k}" rows="${rows}" style="${TA_STYLE}">${esc(f[k] ?? "")}</textarea></label>`;
    const sel = (k, label, opts) => `<label class="imp-field" style="min-width:0"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span><select class="select" data-pf="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[k]) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    const rsel = (i, k, opts, v) => `<select class="select" data-rf="${i}:${k}">${opts.map(([o, l]) => `<option value="${o}" ${String(v) === o ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const confirmed = (uses.rows || []).filter(u => u.status === "CONFIRMADO");
    const usesOf = id => confirmed.filter(u => u.partner_id === id).length;
    const ruleText = r => `${esc(r.description)} <em>· ${esc((AUDIENCE.find(a => a[0] === r.audience) || AUDIENCE[0])[1].replace(" N ", ` ${r.n || "N"} `))}${r.period === "ILIMITADO" ? "" : ` · ${r.limit || 0} ${esc((PERIOD.find(x => x[0] === r.period) || PERIOD[0])[1])}`}</em>`;
    const names = new Map(partners.map(p => [p.id, p.name]));
    const mk = data.monthKey;
    return `
      <section class="section"><div class="grid g4">
        ${kpi("Parceiros", fmt.int(partners.length), "base de parcerias do clube", "", "lead")}${kpi("Ativos", fmt.int(partners.filter(p => p.status === "active").length), `${partners.filter(p => p.status === "prospect").length} em negociação`)}
        ${kpi("Usos pelo QR", uses.rows ? fmt.int(confirmed.length) : "—", `em ${esc(data.label)} · registrados sozinhos`)}${kpi("Clientes atendidos", uses.rows ? fmt.int(new Set(confirmed.map(u => u.client_key)).size) : "—", "pessoas diferentes no mês")}
      </div></section>
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Parcerias</p><h2>Benefícios do Clube</h2><p>Parceiro ativo ganha um QR fixo para o balcão. O cliente escaneia, toca USAR AGORA e mostra a tela verde; o uso entra aqui sozinho.</p></div>${!partners.length ? `<button class="btn" id="clubDefaults" type="button">Criar parceiros iniciais</button>` : ""}</div>
          <div class="table-wrap"><table><thead><tr><th>Parceiro · QR do balcão</th><th>Situação</th><th>Benefícios (regras)</th><th class="num">Usos no mês</th><th></th></tr></thead>
            <tbody>${partners.map(p => { const st = STATUS[p.status] || STATUS.prospect; return `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.category || "—")} · prioridade ${esc(PRIORITY[p.priority] || "—")}</small>
              <div style="margin-top:4px;white-space:nowrap">${p.status === "active" && p.qrCode ? `<button class="btn ghost" data-p-display="${esc(p.id)}" type="button">⇩ Display</button><button class="btn ghost" data-p-link="${esc(p.id)}" type="button">Link</button>` : `<small>${p.status === "active" ? "QR: salve o parceiro para gerar" : "QR só para parceiro ativo"}</small>`}</div></td>
              <td><span class="badge ${st[1]}">${st[0]}</span></td><td style="white-space:normal;min-width:240px"><small>${rulesOf(p).filter(r => r.active !== false).map(ruleText).join("<br>") || "—"}</small></td>
              <td class="num">${uses.rows ? fmt.int(usesOf(p.id)) : "—"}</td>
              <td style="white-space:nowrap"><button class="btn ghost" data-p-edit="${esc(p.id)}" type="button">Editar</button><button class="btn ghost" data-p-del="${esc(p.id)}" type="button" style="color:var(--uby-red)">Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="empty">Nenhuma parceria na nuvem ainda.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">${f.id ? "Editando" : "Nova parceria"}</p><h2>${f.id ? esc(f.name) : "Cadastrar parceiro"}</h2></div></div>
          <div class="grid g2" style="gap:8px">
            ${inp("name", "Nome do parceiro")}${inp("category", "Categoria")}
            ${sel("status", "Situação", [["active", "Ativo"], ["prospect", "Em negociação"], ["paused", "Pausado"]])}${sel("priority", "Prioridade", [["high", "Alta"], ["medium", "Média"], ["low", "Baixa"]])}
            ${inp("contact", "Contato")}${inp("validity", "Validade (texto)")}
          </div>
          <div class="imp-field" style="min-width:0;margin-top:8px"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">Logo do parceiro (vai no display e na página do QR)</span>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
              ${f.logo ? `<img src="${esc(f.logo)}" alt="Logo de ${esc(f.name || "parceiro")}" style="height:56px;max-width:160px;object-fit:contain;background:#fff;border-radius:8px;padding:4px">` : ""}
              <label class="btn" style="cursor:pointer;display:inline-flex;align-items:center">${f.logo ? "Trocar logo" : "Enviar logo"}<input id="clubLogoFile" type="file" accept="image/*" hidden></label>
              ${f.logo ? `<button class="btn ghost" id="clubLogoDel" type="button">Remover logo</button>` : ""}
            </div></div>
          ${ta("headline", "Frase grande do display (ex.: 10% no almoço) · Enter pula linha")}${ta("benefit", "Descrição do benefício")}${ta("notes", "Observações", 2)}
          <p class="kicker" style="margin:14px 0 6px">Regras do QR · o cliente vê a de maior prioridade a que tem direito</p>
          ${f.rules.map((r, i) => `<div class="panel" style="padding:10px;margin-bottom:8px">
            <div class="grid g2" style="gap:6px"><textarea class="select" data-rf="${i}:description" rows="3" placeholder="O que aparece na tela verde (ex.: 10% em todos os serviços) · Enter pula linha" style="grid-column:1/-1;${TA_STYLE}">${esc(r.description || "")}</textarea>
              ${rsel(i, "audience", AUDIENCE, r.audience || "TODOS")}<input class="select" data-rf="${i}:n" type="number" min="0" step="1" value="${esc(r.n ?? "")}" placeholder="N (Top N, primeiras N, lote N)">
              <span style="display:flex;gap:6px"><input class="select" data-rf="${i}:limit" type="number" min="0" step="1" value="${esc(r.limit ?? "")}" placeholder="Limite" style="width:90px">${rsel(i, "period", PERIOD, r.period || "DIA")}</span>
              <span style="display:flex;gap:6px;align-items:center"><input class="select" data-rf="${i}:priority" type="number" step="1" value="${esc(r.priority ?? "")}" placeholder="Prioridade" style="width:100px">
                <label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-rf="${i}:active" ${r.active !== false ? "checked" : ""}> ativa</label>
                <button class="btn ghost" data-r-del="${i}" type="button" style="color:var(--uby-red)">✕</button></span></div></div>`).join("")}
          <button class="btn" id="clubRuleAdd" type="button">+ Regra</button>
          <p style="margin:8px 0 0"><small>Limite vale por cliente neste parceiro, somando todas as regras (ex.: 1 por dia = um desconto por dia).</small></p>
          <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="clubPartnerSave" type="button" ${ui.busy ? "disabled" : ""}>${f.id ? "Salvar alterações" : "Cadastrar parceiro"}</button>${f.id ? `<button class="btn" id="clubPartnerNew" type="button">Novo</button>` : ""}</div>
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Usos pelo QR · ${esc(data.label)}</p><h2>Registros automáticos</h2><p>Gravados no momento em que o cliente toca USAR AGORA no caixa. Cancele um uso feito por engano (o cliente volta a poder usar).</p></div>
          <button class="btn" id="clubUsesReload" type="button">↻ Atualizar</button></div>
        ${uses.error ? `<div class="note" style="border-color:var(--uby-amber)">${esc(uses.error)}</div>` : ""}
        <div class="table-wrap" style="max-height:480px"><table><thead><tr><th>Data</th><th>Parceiro</th><th>Benefício</th><th>Cliente</th><th>Código</th><th>Situação</th><th></th></tr></thead>
          <tbody>${uses.loading || (!uses.rows && !uses.error && mk) ? `<tr><td colspan="7" class="empty">Carregando…</td></tr>` : (uses.rows || []).map(u => `<tr><td>${fmt.dt(u.created_at)}</td><td>${esc(names.get(u.partner_id) || u.partner_id)}</td><td><small>${esc(u.description)}</small></td>
            <td>${who(u.client_name || "—")}<small>${priv(String(u.client_key).replace(/^(tel|mail):/, ""))}</small></td><td>${esc(u.code)}</td>
            <td><span class="badge ${u.status === "CONFIRMADO" ? "ok" : "neutral"}">${u.status === "CONFIRMADO" ? "confirmado" : "cancelado"}</span></td>
            <td>${u.status === "CONFIRMADO" ? `<button class="btn ghost" data-u-cancel="${esc(u.id)}" type="button" style="color:var(--uby-red)">Cancelar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum uso pelo QR neste mês.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function couponsTab(c) {
    const k = c.coupons;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Cupons · ${esc(c.label)}</p><h2>Controle de usos de cupons</h2>
          <p>Base independente: importe a planilha de usos (relatório da Spott ou do parceiro). Reenviar a mesma planilha não duplica. ${c.couponsMeta.updatedAt ? `Última importação ${fmt.dt(c.couponsMeta.updatedAt)}${c.couponsMeta.source ? ` · ${esc(c.couponsMeta.source)}` : ""}.` : "Nenhuma importação na nuvem ainda."} ${k.total} registro(s) no total${k.undated ? `, ${k.undated} sem data (fora do recorte mensal)` : ""}.</p></div>
          <label class="btn primary" style="cursor:pointer">⇪ Importar planilha de usos<input id="clubCouponImport" type="file" accept=".csv,.xlsx,.xls" multiple hidden></label></div>
        <div class="grid g5">
          ${kpi("Usos no mês", fmt.int(k.uses), "lançamentos da base de cupons", "", "lead")}${kpi("Cruzados com o Clube", fmt.int(k.clubMatches), k.uses ? `${fmt.pct1(k.clubMatches / k.uses * 100)} com cadastro` : "")}
          ${kpi("Valor final com cupom", fmt.brl(k.value), "valor cobrado")}${kpi("Descontos", fmt.brl(k.discount), "pela porcentagem do cupom")}
          ${kpi("Faturamento dos clientes cruzados", fmt.brl(k.clientsRevenue), "todas as recargas no mês")}
        </div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Por cupom</p><h2>Resumo do mês</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Cupom</th><th class="num">Usos</th><th class="num">Com cadastro</th><th class="num">Clientes que recarregaram</th><th class="num">Valor final</th><th class="num">Desconto</th><th class="num">Faturamento dos clientes</th></tr></thead>
          <tbody>${k.groups.map(g => `<tr><td><strong>${esc(g.coupon)}</strong></td><td class="num">${g.uses}</td><td class="num">${g.clubMatches}</td><td class="num">${g.clients}</td><td class="num">${fmt.brl(g.value)}</td><td class="num">${fmt.brl(g.discount)}</td><td class="num"><strong>${fmt.brl(g.revenue)}</strong></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum uso de cupom neste mês.</td></tr>`}</tbody></table></div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Lançamentos</p><h2>Usos do mês</h2></div></div>
        <div class="table-wrap" style="max-height:480px"><table><thead><tr><th>Data</th><th>Cupom</th><th>Cliente</th><th>Parceiro</th><th class="num">Valor</th><th class="num">Desconto</th><th></th></tr></thead>
          <tbody>${k.rows.map(r => `<tr><td>${r.dateKey ? fmt.date(r.dateKey + "T12:00:00") : "—"}</td><td>${esc(r.coupon || "—")}</td><td>${who(r.name)}<small>${priv(r.phone || r.email)}</small></td><td>${esc(r.partner || "—")}</td><td class="num">${fmt.brl(r.value)}</td><td class="num">${fmt.brl(r.discount)}</td>
            <td><button class="btn ghost" data-c-del="${esc(r.key)}" type="button" style="color:var(--uby-red)">✕</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Sem lançamentos.</td></tr>`}</tbody></table></div></section>`;
  }

  function paint() {
    if (!target || !data || !location.hash.startsWith("#/clube")) return;
    const c = data;
    const legacy = legacyLocal();
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · Clube UBY</p><h1>Clube UBY</h1>
        <p class="lead">Competição mensal: cada R$ 1 gasto em carregador da operação UBY vale 1 ponto. Top 3 ganham 30% em alinhamento e balanceamento; todos têm 10% na rede Muffatão Autocenter.</p></div>
        <div class="callout" style="border-left-color:var(--uby-red)"><strong>Grava na nuvem</strong><small>Parceiros, cupons e importações ficam na base (linha própria do Clube), iguais em qualquer computador. Nunca alteram receita, pontos ou a base de recargas.</small></div></div>
      ${c.cloud.error ? `<div class="note" style="border-color:var(--uby-red);margin-bottom:12px">Não consegui ler o Clube na nuvem: ${esc(c.cloud.error)}</div>` : ""}
      ${legacy.any && c.cloud.legacyImportedAt ? `<p class="source-line" style="margin:0 0 10px">Dados deste navegador já importados para a nuvem em ${fmt.dt(c.cloud.legacyImportedAt)}. <a href="#" id="clubLegacyImport">Importar de novo</a> (junta, não duplica).</p>` : ""}
      ${legacy.any && !c.cloud.legacyImportedAt ? `<div class="note" style="margin-bottom:12px;border-color:var(--uby-amber)"><strong>Dados do Clube encontrados neste navegador (plataforma atual)</strong><br>${legacy.partners.length} parceiro(s), ${legacy.coupons.length} uso(s) de cupom e ${legacy.participants.length} participante(s) guardados só neste computador. Importe para a nuvem para não perder e usar em qualquer lugar (junta com o que já existe, sem apagar nada). <button class="btn primary" id="clubLegacyImport" type="button" style="margin-left:6px" ${ui.busy ? "disabled" : ""}>Importar para a nuvem</button></div>` : ""}
      ${ui.msg ? `<div class="note" style="margin-bottom:12px;border-color:${ui.msg.ok ? "var(--uby-green, #1f9d55)" : "var(--uby-red)"}">${esc(ui.msg.text)}</div>` : ""}
      <div class="toolbar">
        <div class="seg" id="clubTabs">${[["ranking", "Ranking"], ["participantes", "Participantes"], ["parceiros", "Parceiros"], ["relatorio", "Relatório de usos"], ["cupons", "Cupons"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.tab === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span>
        ${ui.tab === "ranking" || ui.tab === "cupons" || ui.tab === "parceiros" ? `<label>Competição <select class="select" id="clubMonth">${c.months.slice().reverse().map(m => `<option value="${m.key}" ${m.key === c.monthKey ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>` : ""}
      </div>
      ${ui.tab === "participantes" ? participantsTab(c) : ui.tab === "parceiros" ? partnersTab(c) : ui.tab === "relatorio" ? reportTab(c) : ui.tab === "cupons" ? couponsTab(c) : rankingTab(c)}`;
    bind();
    if (ui.tab === "parceiros") loadUses(c.monthKey);
    if (ui.tab === "relatorio") loadRep(false);
  }

  function bind() {
    const $ = s => target.querySelector(s);
    target.querySelectorAll("#clubTabs button").forEach(b => b.onclick = () => { ui.tab = b.dataset.v; ui.msg = null; paint(); });
    if ($("#clubMonth")) $("#clubMonth").onchange = async e => { ui.month = e.target.value; await load(false); paint(); };
    if ($("#copyNotice")) $("#copyNotice").onclick = async () => {
      try { await navigator.clipboard.writeText(data.notice); alert("Aviso copiado. Valide grupo e cadastro antes de enviar."); }
      catch (_) { window.prompt("Copie o aviso abaixo:", data.notice); }
    };
    // participantes
    if ($("#clubSearch")) $("#clubSearch").oninput = e => { ui.search = e.target.value; clearTimeout(bind.t); bind.t = setTimeout(() => { paint(); const el = target.querySelector("#clubSearch"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); };
    if ($("#clubSync")) $("#clubSync").onclick = async () => {
      ui.msg = { ok: true, text: "Lendo o formulário…" }; paint();
      try { const r = await UBY.state.api.clubSyncForm(); ui.msg = { ok: true, text: `Formulário lido: ${r.total} participante(s) no cadastro.` }; await load(false); }
      catch (err) { ui.msg = { ok: false, text: `Formulário: ${err.message || err}` }; }
      paint();
    };
    if ($("#clubPartImport")) $("#clubPartImport").onchange = async e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      try {
        let rows = [];
        for (const f of files) rows = rows.concat(await UBY.state.api.clubParseSheet(f, "participants"));
        if (!rows.length) { ui.msg = { ok: false, text: "Não encontrei participantes na planilha (precisa da coluna Nome completo, E-mail ou WhatsApp)." }; paint(); return; }
        await save(`Importação de ${rows.length} participante(s)`, p => { p.participants = { rows: mergeBy(p.participants?.rows, rows, participantKey), updatedAt: new Date().toISOString(), source: files.map(f => f.name).join(", ") }; return p; }, "import_participants");
      } catch (err) { ui.msg = { ok: false, text: `Importação: ${err.message || err}` }; paint(); }
    };
    // ranking: Top 3 do mês fechado vale nos parceiros durante o mês seguinte
    if ($("#clubPublishTop")) $("#clubPublishTop").onclick = () => {
      const mk = data.monthKey, top = data.rows.slice(0, 3).map(r => ({ position: r.position, name: r.name, phone: r.phone || "", email: r.email || "" }));
      const semContato = top.filter(t => !t.phone && !t.email).map(t => t.name);
      if (semContato.length && !confirm(`Sem celular nem e-mail: ${semContato.join(", ")}. Essa pessoa não vai conseguir usar o benefício do Top 3. Publicar mesmo assim?`)) return;
      if (!confirm(`Publicar o Top 3 de ${data.label} (${top.map(t => t.name).join(", ")})? Vale nos parceiros durante o mês seguinte.`)) return;
      save(`Top 3 de ${data.label} publicado`, d => {
        d.partnerProgram = d.partnerProgram || {};
        d.partnerProgram.topByMonth = { ...(d.partnerProgram.topByMonth || {}), [mk]: { entries: top, publishedAt: new Date().toISOString() } };
        return d;
      }, "publish_top3");
    };
    // parceiros
    const readForm = () => {
      target.querySelectorAll("[data-pf]").forEach(el => { ui.partnerForm[el.dataset.pf] = el.value; });
      target.querySelectorAll("[data-rf]").forEach(el => {
        const [i, k] = el.dataset.rf.split(":"), r = ui.partnerForm.rules[Number(i)];
        if (r) r[k] = el.type === "checkbox" ? el.checked : el.value;
      });
    };
    target.querySelectorAll("[data-pf],[data-rf]").forEach(el => el.onchange = readForm);
    if ($("#clubRuleAdd")) $("#clubRuleAdd").onclick = () => { readForm(); ui.partnerForm.rules.push({ id: "", description: "", audience: "TODOS", n: "", period: "DIA", limit: 1, priority: 1, active: true }); paint(); };
    target.querySelectorAll("[data-r-del]").forEach(b => b.onclick = () => { readForm(); ui.partnerForm.rules.splice(Number(b.dataset.rDel), 1); paint(); });
    target.querySelectorAll("[data-p-edit]").forEach(b => b.onclick = () => { const p = data.partners.find(x => x.id === b.dataset.pEdit); if (p) { ui.partnerForm = { ...p, rules: rulesOf(p).map(r => ({ ...r })) }; paint(); } });
    target.querySelectorAll("[data-p-display]").forEach(b => b.onclick = async () => {
      const p = data.partners.find(x => x.id === b.dataset.pDisplay);
      try { await downloadDisplay(p); } catch (err) { ui.msg = { ok: false, text: `Display: ${err.message || err}` }; paint(); }
    });
    target.querySelectorAll("[data-p-link]").forEach(b => b.onclick = async () => {
      const link = qrLink(data.partners.find(x => x.id === b.dataset.pLink));
      try { await navigator.clipboard.writeText(link); alert(`Link copiado:\n${link}`); } catch (_) { window.prompt("Link do QR:", link); }
    });
    if ($("#clubPartnerNew")) $("#clubPartnerNew").onclick = () => { ui.partnerForm = null; paint(); };
    if ($("#clubLogoFile")) $("#clubLogoFile").onchange = async e => {
      readForm();
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try { ui.partnerForm.logo = await logoDataUrl(file); ui.msg = { ok: true, text: "Logo carregada. Clique em salvar para gravar." }; }
      catch (err) { ui.msg = { ok: false, text: `Logo: ${err.message || err}` }; }
      paint();
    };
    if ($("#clubLogoDel")) $("#clubLogoDel").onclick = () => { readForm(); ui.partnerForm.logo = ""; paint(); };
    if ($("#clubPartnerSave")) $("#clubPartnerSave").onclick = () => {
      readForm();
      const f = { ...ui.partnerForm, name: String(ui.partnerForm.name || "").trim() };
      if (!f.name) { ui.msg = { ok: false, text: "Informe o nome do parceiro." }; paint(); return; }
      const ids = new Set();
      f.rules = (f.rules || []).filter(r => String(r.description || "").trim()).map((r, i) => {
        let id = String(r.id || "").trim() || `regra-${Date.now().toString(36)}-${i}`;
        while (ids.has(id)) id += "x";
        ids.add(id);
        const num = v => v === "" || v == null ? "" : Number(v);
        return { id, description: String(r.description).trim(), audience: r.audience || "TODOS", n: num(r.n), period: r.period || "DIA", limit: num(r.limit), priority: num(r.priority), active: r.active !== false };
      });
      const semN = f.rules.find(r => r.audience !== "TODOS" && !(r.n > 0));
      if (semN) { ui.msg = { ok: false, text: `Regra "${semN.description}": informe o N (quantos do Top, quantas vezes ou o tamanho do lote).` }; paint(); return; }
      const semLimite = f.rules.find(r => r.period !== "ILIMITADO" && !(r.limit > 0));
      if (semLimite) { ui.msg = { ok: false, text: `Regra "${semLimite.description}": informe o limite (ex.: 1 por dia) ou escolha "sem limite".` }; paint(); return; }
      f.id = f.id || `partner-${Date.now().toString(36)}`; f.updatedAt = new Date().toISOString();
      if (f.status === "active" && !f.qrCode) f.qrCode = newQrCode();
      ui.partnerForm = null;
      save(`Parceiro ${f.name}`, p => { p.partners = (p.partners || []).filter(x => x.id !== f.id).concat(f); return p; }, "save_partner");
    };
    if ($("#clubUsesReload")) $("#clubUsesReload").onclick = () => loadUses(data.monthKey, true);
    // --- relatório de usos ---
    const repDates = (from, to) => { rep.from = from; rep.to = to; loadRep(false); paint(); };
    if ($("#clubRepFrom")) $("#clubRepFrom").onchange = e => { if (e.target.value) repDates(e.target.value, rep.to < e.target.value ? e.target.value : rep.to); };
    if ($("#clubRepTo")) $("#clubRepTo").onchange = e => { if (e.target.value) repDates(rep.from > e.target.value ? e.target.value : rep.from, e.target.value); };
    target.querySelectorAll("#clubRepQuick [data-q]").forEach(b => b.onclick = () => {
      const today = spDay(), mk = spMonth();
      const [y, m] = mk.split("-").map(Number); const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
      ({ mes: () => repDates(`${mk}-01`, today), ant: () => repDates(`${prev}-01`, addDay(`${mk}-01`, -1)), "30": () => repDates(addDay(today, -29), today), ano: () => repDates(`${y}-01-01`, today) })[b.dataset.q]();
    });
    if ($("#clubRepPartner")) $("#clubRepPartner").onchange = e => { rep.partner = e.target.value; paint(); };
    if ($("#clubRepStatus")) $("#clubRepStatus").onchange = e => { rep.status = e.target.value; paint(); };
    if ($("#clubRepQ")) $("#clubRepQ").oninput = e => { clearTimeout(e.target._t); e.target._t = setTimeout(() => { rep.q = e.target.value; paint(); const n = target.querySelector("#clubRepQ"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
    if ($("#clubRepReload")) $("#clubRepReload").onclick = () => { loadRep(true); paint(); };
    if ($("#clubRepXlsx")) $("#clubRepXlsx").onclick = () => exportXlsx(data).catch(err => alert(`Não consegui gerar a planilha: ${err.message || err}`));
    if ($("#clubRepPdf")) $("#clubRepPdf").onclick = () => exportPdf(data);
    target.querySelectorAll("[data-u-cancel]").forEach(b => b.onclick = async () => {
      if (!confirm("Cancelar este uso? O cliente volta a poder usar o benefício no período.")) return;
      try { const w = await writer(); await w.UBY_SUPABASE.cancelClubPartnerUse(b.dataset.uCancel); ui.msg = { ok: true, text: "Uso cancelado." }; await loadUses(data.monthKey, true); }
      catch (err) { ui.msg = { ok: false, text: `Cancelar uso: ${err.message || err}` }; paint(); }
    });
    target.querySelectorAll("[data-p-del]").forEach(b => b.onclick = () => {
      const p = data.partners.find(x => x.id === b.dataset.pDel);
      if (!p || !confirm(`Excluir a parceria ${p.name}?`)) return;
      save(`Parceiro ${p.name} excluído`, d => { d.partners = (d.partners || []).filter(x => x.id !== p.id); return d; }, "delete_partner");
    });
    if ($("#clubDefaults")) $("#clubDefaults").onclick = () => save("Parceiros iniciais", d => { d.partners = mergeBy(d.partners, defaultPartners().map(x => ({ ...x, updatedAt: new Date().toISOString() })), partnerKey); return d; }, "default_partners");
    // cupons
    if ($("#clubCouponImport")) $("#clubCouponImport").onchange = async e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      try {
        let rows = [];
        for (const f of files) rows = rows.concat(await UBY.state.api.clubParseSheet(f, "coupons"));
        if (!rows.length) { ui.msg = { ok: false, text: "Não encontrei usos de cupom na planilha (precisa da coluna Cupom/Código)." }; paint(); return; }
        await save(`Importação de ${rows.length} uso(s) de cupom`, d => { d.coupons = { rows: mergeBy(d.coupons?.rows, rows, couponKey), updatedAt: new Date().toISOString(), source: files.map(f => f.name).join(", ") }; return d; }, "import_coupons");
      } catch (err) { ui.msg = { ok: false, text: `Importação: ${err.message || err}` }; paint(); }
    };
    target.querySelectorAll("[data-c-del]").forEach(b => b.onclick = () => {
      if (!confirm("Remover este uso de cupom da base?")) return;
      const key = b.dataset.cDel;
      save("Uso de cupom removido", d => { d.coupons = { ...(d.coupons || {}), rows: (d.coupons?.rows || []).filter(r => couponKey(r) !== key) }; return d; }, "delete_coupon_use");
    });
    // importação do navegador (plataforma atual)
    if ($("#clubLegacyImport")) $("#clubLegacyImport").onclick = () => {
      const l = legacyLocal();
      if (!confirm(`Importar para a nuvem ${l.partners.length} parceiro(s), ${l.coupons.length} uso(s) de cupom e ${l.participants.length} participante(s) deste navegador? Junta com o que já existe; nada é apagado.`)) return;
      save("Importação do navegador", d => {
        d.partners = mergeBy(d.partners, l.partners, partnerKey);
        d.coupons = { rows: mergeBy(d.coupons?.rows, l.coupons, couponKey), updatedAt: new Date().toISOString(), source: "importado do navegador (plataforma atual)" };
        d.participants = { rows: mergeBy(d.participants?.rows, l.participants, participantKey), updatedAt: new Date().toISOString(), source: "importado do navegador (plataforma atual)" };
        d.legacyImportedAt = new Date().toISOString();
        return d;
      }, "import_legacy_browser");
    };
  }

  async function render(el) {
    target = el;
    el.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Abrindo o Clube UBY</h2><p>Lendo ranking, participantes, parceiros e cupons.</p></div>`;
    try { await load(false); } catch (err) { el.innerHTML = `<div class="loading"><h2>Não foi possível abrir o Clube</h2><p>${esc(err.message || err)}</p></div>`; return; }
    paint();
    writer().catch(() => {});
  }

  UBY.register("clube", { render });
})();

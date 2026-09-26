/* NOVA PLATAFORMA UBY — moldura, rotas e conexão com o motor original. */
(function () {
  "use strict";

  const LEGACY = "legado/obra-ev/";

  // Camadas da plataforma nova. type 'view' = tela nova; 'classic' = tela
  // original embutida (todas as funções preservadas) até ser migrada.
  const GROUPS = [
    { label: "ENTRADA DE DADOS", items: [
      { id: "lancamentos", icon: "＋", label: "Central de lançamentos", type: "view" },
      // Única área com gravação liberada: importações (ver supabase_bridge.js).
      { id: "importar", icon: "⇪", label: "Importar planilhas", type: "view" },
      { id: "importar-original", icon: "⟲", label: "Importação · backups e opções avançadas", type: "classic", src: LEGACY + "recargas.html?nova_import=1", tab: "detalhes", writes: true }
    ] },
    { label: "VISÃO E ESTRUTURA", items: [
      { id: "resumo", icon: "⌂", label: "Resumo executivo", type: "view", period: true },
      { id: "modelo", icon: "◇", label: "Modelo operacional", type: "view" }
    ] },
    { label: "REDE DE RECARGAS", items: [
      { id: "comando", icon: "▦", label: "Comando da rede", type: "view", period: true },
      { id: "unidades", icon: "▤", label: "Unidades e carregadores", type: "view", period: true },
      { id: "uso", icon: "◔", label: "Análise de uso", type: "view", period: true },
      { id: "clientes", icon: "◎", label: "Clientes", type: "view", period: true },
      { id: "clube", icon: "✦", label: "Clube UBY", type: "view" },
      { id: "clube-classico", icon: "✧", label: "Clube · participantes e cupons", type: "classic", src: LEGACY + "recargas.html", tab: "clube" },
      { id: "sessoes", icon: "✓", label: "Sessões importadas (consulta)", type: "classic", src: LEGACY + "recargas.html", tab: "detalhes" },
      { id: "recargas", icon: "⌁", label: "Recargas · tela original", type: "classic", src: LEGACY + "recargas.html", tab: "geral" }
    ] },
    { label: "GESTÃO DE OBRAS", items: [
      { id: "obras", icon: "⌑", label: "Obras, prazos e pendências", type: "view" },
      { id: "obras-classico", icon: "✎", label: "Obras · cadastro e edição", type: "classic", src: LEGACY + "index.html" },
      { id: "mapa", icon: "⌖", label: "Mapa de implantação", type: "view" },
      { id: "mapa-classico", icon: "✎", label: "Mapa · vínculos (edição)", type: "classic", src: LEGACY + "mapa-implantacao.html" },
      { id: "engenharia", icon: "⚡", label: "Engenharia e concessionária", type: "classic", src: LEGACY + "engenharia.html" },
      { id: "analisadores", icon: "∿", label: "Analisadores de energia", type: "view" },
      { id: "mercado", icon: "◌", label: "Mercado EV", type: "view" }
    ] },
    { label: "GESTÃO E GOVERNANÇA", items: [
      { id: "financeiro", icon: "R$", label: "Financeiro e fechamento", type: "view", period: true },
      { id: "configuracao", icon: "⚙", label: "Configuração da rede", type: "view" },
      { id: "parametros", icon: "✎", label: "Parâmetros e custos", type: "view" },
      { id: "auditoria", icon: "✓", label: "Auditoria do motor financeiro", type: "view" },
      { id: "operacao-uby", icon: "◆", label: "Relatórios antigos (consulta)", type: "classic", src: LEGACY + "recargas.html", tab: "uby" },
      { id: "tarefas", icon: "☰", label: "Tarefas", type: "view" },
      { id: "tarefas-classico", icon: "✎", label: "Tarefas · edição", type: "classic", src: "legado/tarefas/index.html" }
    ] }
  ];
  const ROUTES = Object.fromEntries(GROUPS.flatMap(g => g.items.map(item => [item.id, { ...item, group: g.label }])));
  const VIEWS = {};

  const state = { api: null, status: null, full: false, period: undefined, months: [], cache: new Map(), route: null, params: [], charts: [] };
  const $ = sel => document.querySelector(sel);

  // ---------- formatação ----------
  const nf = (d = 0) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = {
    // Mesmo arredondamento do fmtBRL() original (toFixed), para bater ao centavo.
    brl: v => {
      const n = Number(v) || 0;
      const [int, dec] = Math.abs(n).toFixed(2).split(".");
      return `${n < 0 && Number(`${int}.${dec}`) !== 0 ? "-" : ""}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
    },
    brl0: v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v) || 0),
    kwh: v => `${nf(2).format(Number(v) || 0)} kWh`,
    kwh0: v => `${nf(0).format(Number(v) || 0)} kWh`,
    pct: v => `${nf(2).format(Number(v) || 0)}%`,
    pct1: v => `${nf(1).format(Number(v) || 0)}%`,
    int: v => nf(0).format(Number(v) || 0),
    n1: v => nf(1).format(Number(v) || 0),
    date: v => v ? new Date(v).toLocaleDateString("pt-BR") : "—",
    dt: v => v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
    hours: v => { const h = Number(v) || 0; const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${hh}h${String(mm).padStart(2, "0")}`; }
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Variação percentual com a mesma leitura do painel original.
  function delta(current, previous, { hasBase = true, inverse = false, label = "vs mês anterior" } = {}) {
    if (!hasBase) return `<span class="delta flat">• <small>sem base anterior</small></span>`;
    if (!previous && !current) return `<span class="delta flat">• <small>sem movimento</small></span>`;
    if (!previous) return `<span class="delta up">↗ nova base <small>${esc(label)}</small></span>`;
    const d = (current - previous) / Math.abs(previous) * 100;
    const good = inverse ? d <= 0 : d >= 0;
    const cls = d === 0 ? "flat" : (good ? "up" : "down");
    return `<span class="delta ${cls}">${d > 0 ? "↗" : d < 0 ? "↘" : "•"} ${d >= 0 ? "+" : ""}${nf(1).format(d)}% <small>${esc(label)}</small></span>`;
  }

  function kpi(label, value, sub = "", extra = "", cls = "") {
    return `<article class="kpi ${cls}"><span class="k">${esc(label)}</span><strong class="v" title="${esc(String(value).replace(/<[^>]+>/g, ""))}">${value}</strong>${sub ? `<span class="s">${sub}</span>` : ""}${extra}</article>`;
  }
  function mini(label, value, sub = "", extra = "") {
    return `<div class="mini"><span class="k">${esc(label)}</span><strong class="v" title="${esc(String(value).replace(/<[^>]+>/g, ""))}">${value}</strong>${sub ? `<span class="s">${sub}</span>` : ""}${extra}</div>`;
  }

  // ---------- gráficos ----------
  const PALETTE = ["#187457", "#3d6f8e", "#b98527", "#77637d", "#b75450", "#8fa13a", "#2e8c8c", "#a0663f"];

  // ---------- tema: claro (padrão) ou night (manual de marca: Midnight + Volt/Solar/Cyan) ----------
  const THEME_KEY = "uby-theme-v1";
  const NIGHT_COLORS = {
    "#187457": "#00E07A", "#173c30": "#00FF85", "#3d6f8e": "#00E5FF", "#b98527": "#FFB020", "#77637d": "#B79CFF",
    "#b75450": "#FF6B6B", "#c6d449": "#FFD600", "#8fa13a": "#B8E986", "#2e8c8c": "#2FD3C8", "#a0663f": "#FF9E6B",
    "#68746b": "#8A95A5", "#465249": "#C9D2DE", "#202821": "#F5F7FA", "#eceee6": "rgba(138,149,165,.16)", "#dde2d7": "#1E3456",
    "#fffefa": "#0F1F38", "#fff": "#0F1F38", "#ffffff": "#0F1F38", "#8a9690": "#6F7E94", "#9aa39c": "#5F6B7C",
    "#c6a13a": "#FFD600", "#8a9630": "#D4E157", "rgba(24,116,87,.1)": "rgba(0,255,133,.12)"
  };
  const isNight = () => document.documentElement.dataset.theme === "night";
  // Troca as cores fixas das telas pelas equivalentes do tema night (só strings de cor exatas).
  function nightify(value) {
    if (typeof value === "string") return NIGHT_COLORS[value.toLowerCase()] || value;
    if (Array.isArray(value)) return value.map(nightify);
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      const out = {};
      Object.keys(value).forEach(k => { out[k] = k === "labels" && Array.isArray(value[k]) ? value[k] : nightify(value[k]); });
      return out;
    }
    return value;
  }
  function applyTheme(theme, persist = true) {
    const night = theme === "night";
    if (night) document.documentElement.dataset.theme = "night"; else delete document.documentElement.dataset.theme;
    const brand = document.querySelector(".brand img");
    if (brand) brand.src = night ? "assets/brand-night.svg" : "assets/brand.svg";
    const btn = document.getElementById("themeButton");
    if (btn) { btn.textContent = night ? "☀" : "☾"; btn.title = night ? "Voltar ao tema claro" : "Ver a versão night (azul escuro)"; }
    if (window.Chart) { Chart.defaults.color = night ? "#AEB8C6" : "#666"; Chart.defaults.borderColor = night ? "rgba(138,149,165,.16)" : "rgba(0,0,0,.1)"; }
    if (persist) { try { localStorage.setItem(THEME_KEY, night ? "night" : "light"); } catch (_) {} }
  }

  function chart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    const instance = new Chart(canvas, isNight() ? nightify(config) : config);
    state.charts.push(instance);
    return instance;
  }
  function baseChartOptions(extra = {}) {
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 11, family: "Inter" }, color: "#465249" } }, tooltip: { titleFont: { family: "Inter" }, bodyFont: { family: "Inter" } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10, family: "Inter" }, color: "#68746b", maxRotation: 0, autoSkip: true } },
        y: { grid: { color: "#eceee6" }, border: { display: false }, ticks: { font: { size: 10, family: "Inter" }, color: "#68746b" } }
      },
      ...extra
    };
  }
  function clearCharts() { state.charts.forEach(c => { try { c.destroy(); } catch (_) {} }); state.charts = []; }

  // ---------- motor ----------
  function setStatus(text, cls = "") {
    const el = $("#dataStatus");
    el.className = `pill hide-sm ${cls}`;
    el.querySelector("span").textContent = text;
  }

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

  function bootMotor() {
    const frame = $("#motorFrame");
    setStatus("Carregando motor…", "warn");
    frame.src = LEGACY + "motor.html?t=" + Date.now();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        let api = null;
        try { api = frame.contentWindow && frame.contentWindow.UBY_MOTOR_API; } catch (_) {}
        if (api) { clearInterval(timer); resolve(api); }
        else if (Date.now() - started > 90000) { clearInterval(timer); reject(new Error("O motor não respondeu em 90 s.")); }
      }, 250);
    });
  }

  async function connect() {
    try {
      const api = await bootMotor();
      state.api = api;
      setStatus("Lendo Supabase…", "warn");
      await api.waitForReady();
      refreshMeta();
      setStatus(`Mês atual carregado · ${fmt.int(state.status.charges)} sessões`, "warn");
      rerender();
      setStatus("Carregando histórico completo…", "warn");
      await api.loadFull();
      state.full = true;
      state.cache.clear();
      refreshMeta();
      setStatus(`Dados reais · ${fmt.int(state.status.charges)} sessões · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, "");
      rerender();
    } catch (err) {
      console.error(err);
      setStatus("Falha ao ler dados", "err");
      renderError(err);
    }
  }

  function refreshMeta() {
    state.status = clone(state.api.status());
    state.months = clone(state.api.months()) || [];
    const user = state.status.user || JSON.parse(localStorage.getItem("uby-auth-session-v1") || "{}");
    $("#userName").textContent = user.label || user.email || "Usuário";
    $("#userRole").textContent = user.role === "admin" ? "Administrador" : user.role === "engineering" ? "Engenharia" : (user.email || "");
    $("#userAvatar").textContent = String(user.label || user.email || "U").trim().charAt(0).toUpperCase();
    fillPeriod();
  }

  function fillPeriod() {
    const select = $("#periodSelect");
    const months = state.months.slice().reverse();
    const latest = months[0];
    const monthLabel = key => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", ""); };
    select.innerHTML = months.map(key => `<option value="${key}">${key === latest ? `Mês atual (${monthLabel(key)})` : monthLabel(key)}</option>`).join("")
      + `<option value="__acc__">Acumulado${state.full ? "" : " (aguardando histórico)"}</option>`;
    const current = state.period === undefined ? latest : (state.period === "" ? "__acc__" : state.period);
    select.value = [...select.options].some(o => o.value === current) ? current : (latest || "__acc__");
  }

  // Resultado memorizado por período: o motor calcula uma vez por troca de filtro.
  function data(method, ...args) {
    const key = `${method}|${JSON.stringify(args)}|${state.full}`;
    if (!state.cache.has(key)) state.cache.set(key, clone(state.api[method](...args)));
    return state.cache.get(key);
  }
  function periodArg() { return state.period; }

  // ---------- motor de obras (carregado sob demanda) ----------
  let obrasPromise = null;
  function obras(force = false) {
    if (force) obrasPromise = null;
    if (obrasPromise) return obrasPromise;
    obrasPromise = new Promise((resolve, reject) => {
      let frame = document.getElementById("obrasFrame");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "obrasFrame";
        frame.title = "Motor de obras";
        frame.setAttribute("aria-hidden", "true");
        frame.tabIndex = -1;
        frame.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden";
        document.body.appendChild(frame);
      }
      frame.src = LEGACY + "motor-obras.html?t=" + Date.now();
      const started = Date.now();
      const timer = setInterval(async () => {
        let api = null;
        try { api = frame.contentWindow && frame.contentWindow.UBY_OBRAS_API; } catch (_) {}
        if (api) {
          clearInterval(timer);
          try { await api.ready(); resolve({ api, data: api.snapshot() }); } catch (err) { reject(err); }
        } else if (Date.now() - started > 90000) { clearInterval(timer); reject(new Error("O motor de obras não respondeu em 90 s.")); }
      }, 250);
    });
    obrasPromise.catch(() => { obrasPromise = null; });
    return obrasPromise;
  }

  // Lê dados prontos de uma página original (abre invisível, executa `reader`
  // no contexto dela, devolve uma cópia e fecha). Usado por Analisadores e Mercado.
  function legacyRead(src, reader, settleMs = 1500) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:absolute;width:1200px;height:900px;left:-99999px;top:0;border:0;visibility:hidden";
      frame.src = src;
      const done = (fn, v) => { clearTimeout(timeout); frame.remove(); fn(v); };
      const timeout = setTimeout(() => done(reject, new Error("A página original não respondeu em 45 s.")), 45000);
      frame.onload = () => setTimeout(() => {
        try { done(resolve, JSON.parse(JSON.stringify(reader(frame.contentWindow)))); } catch (err) { done(reject, err); }
      }, settleMs);
      document.body.appendChild(frame);
    });
  }

  function openLegacy(src, label, group = "GESTÃO DE OBRAS", tab = "") {
    location.hash = `#/abrir/${encodeURIComponent(src)}/${encodeURIComponent(tab)}/${encodeURIComponent(label)}/${encodeURIComponent(group)}`;
  }

  // ---------- rotas ----------
  function parseHash() {
    const parts = (location.hash.replace(/^#\/?/, "") || "comando").split("/").map(decodeURIComponent);
    return { id: parts[0], params: parts.slice(1) };
  }

  function renderNav() {
    $("#nav").innerHTML = GROUPS.map(group => `
      <section class="nav-group"><p class="nav-title">${group.label}</p>
        ${group.items.map(item => `<a class="nav-item" data-route="${item.id}" href="#/${item.id}"><i>${item.icon}</i><span>${item.label}</span><b class="${item.type === "view" ? "new" : "classic"}">${item.type === "view" ? "NOVO" : "ORIGINAL"}</b></a>`).join("")}
      </section>`).join("");
  }

  function route() {
    const { id, params } = parseHash();
    let def = ROUTES[id] || ROUTES.comando;
    // Página original específica (ex.: detalhe de uma obra). Só aceita páginas
    // da pasta legado/, sem subir diretórios.
    if (id === "abrir" && /^legado\/[\w\-./?=&%]+$/.test(params[0] || "") && !params[0].includes("..")) {
      def = { id: "abrir", type: "classic", src: params[0], tab: params[1] || "", label: params[2] || "Tela original", group: params[3] || "GESTÃO DE OBRAS" };
    }
    state.route = def; state.params = params;
    document.body.classList.remove("menu-open");
    document.querySelectorAll(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.route === def.id));
    $("#crumbGroup").textContent = `UBY Recharge / ${def.group.charAt(0) + def.group.slice(1).toLowerCase()}`;
    $("#crumbTitle").textContent = def.label;
    $("#periodWrap").hidden = !(def.type === "view" && def.period);
    if (def.type === "classic") return openClassic(def);
    $("#classicWrap").classList.remove("on");
    $("#view").hidden = false;
    window.scrollTo({ top: 0 });
    rerender();
  }

  function rerender() {
    const def = state.route;
    if (!def || def.type !== "view") return;
    clearCharts();
    const view = VIEWS[def.id];
    const target = $("#view");
    if (!state.api || !state.status) { target.innerHTML = loadingMarkup(); return; }
    // Recortes grandes (acumulado, detalhe com todas as sessões) levam alguns
    // segundos no motor: mostra o aviso antes de bloquear a tela no cálculo.
    const ticket = (state.renderTicket = (state.renderTicket || 0) + 1);
    target.style.opacity = ".45";
    target.insertAdjacentHTML("afterbegin", '<div class="pill warn" id="calcBadge" style="position:fixed;top:78px;right:28px;z-index:30"><i class="dot"></i><span>Calculando…</span></div>');
    setTimeout(() => {
      if (ticket !== state.renderTicket) return;
      try {
        view.render(target, state.params);
      } catch (err) {
        console.error(err);
        renderError(err);
      }
      target.style.opacity = "";
      document.getElementById("calcBadge")?.remove();
    }, 30);
  }

  function loadingMarkup() {
    return `<div class="loading"><div class="spinner"></div><h2>Conectando à base real</h2>
      <p>O motor de cálculo original está lendo obras, sessões e resumos no Supabase. Na primeira abertura isso leva alguns segundos; depois o mês atual fica em cache.</p></div>`;
  }

  function renderError(err) {
    $("#view").innerHTML = `<div class="loading"><h2>Não foi possível ler os dados</h2><p>${esc(err.message || err)}</p>
      <p>Confira a conexão com a internet e se o login ainda é válido.</p><div><a class="btn primary" href="login.html">Entrar novamente</a> <button class="btn" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }

  // ---------- visão clássica ----------
  let classicSrc = "";
  function openClassic(def) {
    $("#view").hidden = true;
    $("#classicWrap").classList.add("on");
    // Barra informa quando a tela grava na base real (só importações).
    $("#classicWrap").querySelector(".classic-bar span").innerHTML = def.writes
      ? `<strong style="color:var(--uby-red)">Gravação ligada</strong> · <strong>${esc(def.label)}</strong> · importar, desfazer, corrigir mês e restaurar backup gravam na base real (a mesma da plataforma atual). Todas as outras telas continuam só leitura.`
      : `Tela original · <strong>${esc(def.label)}</strong> · todas as funções e cálculos da plataforma, com as cores da nova. Gravações bloqueadas nesta versão local.`;
    const frame = $("#classicFrame");
    const src = def.src;
    $("#classicOpen").href = src;
    if (classicSrc !== src) {
      classicSrc = src;
      frame.src = src;
      frame.onload = () => selectClassicTab(frame, state.route.tab);
    } else {
      selectClassicTab(frame, def.tab);
    }
  }

  function selectClassicTab(frame, tab) {
    if (!tab) return;
    const win = frame.contentWindow;
    const apply = () => {
      try {
        const btn = win.document.querySelector(`[onclick*="switchTab('${tab}'"]`);
        if (typeof win.switchTab === "function" && btn) { win.document.getElementById("tabsBar").style.display = "flex"; win.switchTab(tab, btn); return true; }
      } catch (err) { console.warn("aba clássica:", err.message); }
      return false;
    };
    let tries = 0;
    const onReady = () => setTimeout(apply, 50);
    try { win.document.addEventListener("uby:recharge-ready", onReady, { once: true }); } catch (_) {}
    const timer = setInterval(() => {
      tries += 1;
      let ready = false;
      try { ready = win.document.readyState === "complete" && typeof win.switchTab === "function"; } catch (_) {}
      if (ready && tries > 6) { clearInterval(timer); apply(); }
      if (tries > 80) clearInterval(timer);
    }, 250);
  }

  // ---------- início ----------
  function start() {
    renderNav();
    const chip = document.querySelector(".brand .chip");
    if (chip) chip.textContent = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) ? "LOCAL" : "NOVA";
    let savedTheme = "light";
    try { savedTheme = localStorage.getItem(THEME_KEY) || "light"; } catch (_) {}
    $("#refreshButton").insertAdjacentHTML("beforebegin", '<button class="btn theme-toggle" id="themeButton" type="button"></button>');
    applyTheme(savedTheme, false);
    $("#themeButton").onclick = () => {
      applyTheme(isNight() ? "light" : "night");
      rerender();
    };
    $("#menuButton").onclick = () => document.body.classList.toggle("menu-open");
    $("#logoutButton").onclick = () => {
      localStorage.removeItem("uby-auth-session-v1");
      localStorage.removeItem("uby-auth-profile-v1");
      try { $("#motorFrame").contentWindow.UBY_SUPABASE?.signOut?.(); } catch (_) {}
      setTimeout(() => location.replace("login.html"), 300);
    };
    $("#refreshButton").onclick = () => { state.cache.clear(); state.full = false; state.api = null; state.status = null; obrasPromise = null; rerender(); connect(); };
    $("#periodSelect").onchange = event => {
      const value = event.target.value;
      state.period = value === "__acc__" ? "" : (value === state.months.at(-1) ? undefined : value);
      rerender();
    };
    window.addEventListener("hashchange", route);
    route();
    connect();
  }

  // O painel é da UBY: modelos nomeados com a UBY na frente e a P3 como
  // prestadora de serviço (gestora). Ativos só com gestão P3 ficam fora da UBY.
  const UBY_MODELS = ["uby", "hybrid", "third_party_management"];
  const MODEL_LABELS = {
    uby: "Ativo UBY",
    hybrid: "Ativo UBY híbrido",
    third_party_management: "Parceiro · royalty UBY (gestão P3)",
    management_only: "Só gestão P3 · fora da UBY",
    p3_society: "Sociedade P3 · fora da UBY"
  };
  const modelLabel = model => MODEL_LABELS[model] || "Ativo UBY";
  const isUbyModel = model => UBY_MODELS.includes(model || "uby");

  window.UBY = { start, state, fmt, esc, delta, kpi, mini, chart, baseChartOptions, PALETTE, data, periodArg, obras, openLegacy, legacyRead, rerender, modelLabel, isUbyModel,
    register: (id, view) => { VIEWS[id] = view; }, go: hash => { location.hash = hash; }, ROUTES };
})();

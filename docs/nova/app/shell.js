/* NOVA PLATAFORMA UBY — moldura, rotas e conexão com o motor (app/core). */
(function () {
  "use strict";

  // Camadas da plataforma nova (todas as telas são type 'view').
  const GROUPS = [
    { label: "ENTRADA DE DADOS", items: [
      { id: "lancamentos", icon: "＋", label: "Central de lançamentos", type: "view" },
      // Única área com gravação liberada: importações (ver supabase_bridge.js).
      { id: "importar", icon: "⇪", label: "Importar planilhas", type: "view" },
      { id: "backups", icon: "⛁", label: "Backups e restauração", type: "view" }
    ] },
    { label: "VISÃO E ESTRUTURA", items: [
      { id: "avisos", icon: "🔔", label: "Avisos e contas a vencer", type: "view" },
      { id: "resumo", icon: "⌂", label: "Resumo executivo", type: "view", period: true },
      { id: "modelo", icon: "◇", label: "Modelo operacional", type: "view" }
    ] },
    { label: "REDE DE RECARGAS", items: [
      { id: "comando", icon: "▦", label: "Comando da rede", type: "view", period: true },
      { id: "unidades", icon: "▤", label: "Unidades e carregadores", type: "view", period: true },
      { id: "locais", icon: "⧉", label: "Shopping Aurora (AC + DC)", type: "view", period: true },
      { id: "uso", icon: "◔", label: "Análise de uso", type: "view", period: true },
      { id: "comparar", icon: "⇄", label: "Comparar períodos", type: "view" },
      { id: "clientes", icon: "◎", label: "Clientes", type: "view", period: true },
      { id: "precos", icon: "⇅", label: "Estudos de preço", type: "view" },
      { id: "clube", icon: "✦", label: "Clube UBY", type: "view" },
      { id: "envios", icon: "✉", label: "Envios WhatsApp", type: "view" }
    ] },
    { label: "GESTÃO DE OBRAS", items: [
      { id: "obras", icon: "⌑", label: "Obras, prazos e pendências", type: "view" },
      { id: "mapa", icon: "⌖", label: "Mapa de implantação", type: "view" },
      { id: "engenharia", icon: "⚡", label: "Engenharia e concessionária", type: "view" },
      { id: "analisadores", icon: "∿", label: "Analisadores de energia", type: "view" },
      { id: "mercado", icon: "◌", label: "Mercado EV", type: "view" }
    ] },
    // Financeiro no modelo de ERP (Conta Azul): contas a pagar, conciliação e o resultado por competência.
    // Itens com href abrem a aba certa de Parâmetros (onde a gravação é liberada).
    { label: "FINANCEIRO", items: [
      { id: "fin-pagar", icon: "⇣", label: "Contas a pagar", type: "view", href: "#/parametros/contas" },
      { id: "fin-conciliar", icon: "🏦", label: "Conciliação bancária", type: "view", href: "#/parametros/pagamentos" },
      { id: "financeiro", icon: "R$", label: "Resultado e fechamento", type: "view", period: true }
    ] },
    { label: "GESTÃO E GOVERNANÇA", items: [
      { id: "relatorios", icon: "▤", label: "Gerador de relatórios", type: "view" },
      { id: "arquivo", icon: "🗄", label: "Arquivo de fechamentos", type: "view" },
      { id: "configuracao", icon: "⚙", label: "Configuração da rede", type: "view" },
      { id: "parametros", icon: "✎", label: "Parâmetros e custos", type: "view" },
      { id: "auditoria", icon: "✓", label: "Auditoria do motor financeiro", type: "view" },
      { id: "tarefas", icon: "☰", label: "Tarefas", type: "view" }
    ] },
    // A P3 é prestadora de serviço da UBY: sempre depois da UBY.
    { label: "P3 · PRESTADORA", items: [
      { id: "p3", icon: "◈", label: "P3 Solar · gestão", type: "view" }
    ] },
    { label: "AJUSTES", items: [
      { id: "ajustes", icon: "⚙", label: "Ajustes", type: "view" }
    ] }
  ];
  const ROUTES = Object.fromEntries(GROUPS.flatMap(g => g.items.map(item => [item.id, { ...item, group: g.label }])));
  // Menu enxuto (usuário, 14/10/2026: "menos abas, mais centralizado"): cada item do menu é um painel
  // com abas no topo para as telas relacionadas. As rotas não mudam (links antigos continuam valendo).
  // Aba = id de rota ou um caminho "#/..." (ex.: abas de Parâmetros).
  const NAV = [
    { label: "VISÃO GERAL", items: [
      { icon: "▦", label: "Comando da rede", tabs: [["comando", "Comando da rede"], ["resumo", "Resumo executivo"], ["modelo", "Modelo operacional"], ["avisos", "Avisos e contas a vencer"]] }
    ] },
    { label: "REDE DE RECARGAS", items: [
      { icon: "▤", label: "Carregadores e uso", tabs: [["unidades", "Unidades e carregadores"], ["uso", "Análise de uso"], ["comparar", "Comparar períodos"], ["locais", "Shopping Aurora (AC + DC)"], ["precos", "Estudos de preço"]] },
      { icon: "◎", label: "Clientes e Clube", tabs: [["clientes", "Clientes"], ["clube", "Clube UBY"], ["envios", "Envios WhatsApp"]] }
    ] },
    { label: "FINANCEIRO", items: [
      { icon: "⇣", label: "Contas a pagar", tabs: [["#/parametros/contas", "Contas a pagar"], ["#/parametros/boleto", "Lançar boleto"], ["#/parametros/pagamentos", "Conciliação bancária"]] },
      { icon: "R$", label: "Resultado e fechamento", tabs: [["financeiro", "Resultado"], ["#/parametros/fechamento", "Fechamento do mês"], ["relatorios", "Relatórios"], ["arquivo", "Documentos publicados"]] },
      { icon: "✎", label: "Parâmetros e custos", tabs: [["#/parametros/carregador", "Por carregador"], ["#/parametros/matriz", "Custos centrais"], ["#/parametros/documentos", "Documentos"], ["#/parametros/cotas", "Cotas e impostos"], ["auditoria", "Auditoria do motor"]] }
    ] },
    { label: "OBRAS", items: [
      { icon: "⌑", label: "Obras e implantação", tabs: [["obras", "Obras e pendências"], ["tarefas", "Tarefas"], ["mapa", "Mapa de implantação"], ["engenharia", "Engenharia e concessionária"], ["analisadores", "Analisadores de energia"], ["mercado", "Mercado EV"]] }
    ] },
    { label: "DADOS", items: [
      { icon: "⇪", label: "Importar e lançar", tabs: [["importar", "Importar planilhas"], ["lancamentos", "Central de lançamentos"], ["backups", "Backups e restauração"]] }
    ] },
    // A P3 é prestadora de serviço da UBY: sempre depois da UBY.
    { label: "P3 · PRESTADORA", items: [
      { icon: "◈", label: "P3 Solar · gestão", tabs: [["p3", "P3 Solar · gestão"]] }
    ] },
    // Preferências do aparelho (notificações): no fim do menu, fora do caminho do dia a dia.
    { label: "AJUSTES", items: [
      { icon: "⚙", label: "Ajustes", tabs: [["ajustes", "Ajustes · notificações no celular"]] }
    ] }
  ];
  const tabHref = t => (t[0].startsWith("#/") ? t[0] : `#/${t[0]}`);
  // Painel (item do menu) da tela atual: primeiro pelos caminhos "#/..." (abas de Parâmetros), depois pelo id da rota.
  function hubOf(id) {
    for (const g of NAV) for (let k = 0; k < g.items.length; k++) {
      const t = g.items[k].tabs.find(x => x[0].startsWith("#/") && location.hash.startsWith(x[0]));
      if (t) return { hub: g.items[k], tab: t, key: `${g.label}|${k}` };
    }
    for (const g of NAV) for (let k = 0; k < g.items.length; k++) {
      const t = g.items[k].tabs.find(x => x[0] === id);
      if (t) return { hub: g.items[k], tab: t, key: `${g.label}|${k}` };
    }
    return null;
  }
  // Abas do painel no topo da tela (some quando o painel tem uma tela só).
  function renderHubTabs(id) {
    let bar = document.getElementById("hubTabs");
    if (!bar) { bar = document.createElement("nav"); bar.id = "hubTabs"; bar.className = "hub-tabs"; bar.setAttribute("aria-label", "Telas deste painel"); document.querySelector("main .topbar").after(bar); }
    const h = hubOf(id);
    if (!h || h.hub.tabs.length < 2) { bar.hidden = true; bar.innerHTML = ""; return h; }
    bar.hidden = false;
    bar.innerHTML = h.hub.tabs.map(t => `<a href="${tabHref(t)}" class="${t === h.tab ? "on" : ""}">${t[1]}</a>`).join("");
    return h;
  }
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
  function mini(label, value, sub = "", extra = "", cls = "") {
    return `<div class="mini ${cls}"><span class="k">${esc(label)}</span><strong class="v" title="${esc(String(value).replace(/<[^>]+>/g, ""))}">${value}</strong>${sub ? `<span class="s">${sub}</span>` : ""}${extra}</div>`;
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
    // Logo: as duas versões oficiais estão na página; o CSS mostra a do tema (app.css · .uby-logo).
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
      // Gráficos crescem e desenham ao abrir (sem animação com "reduzir movimento").
      responsive: true, maintainAspectRatio: false, animation: window.UBY_FX?.reduced?.() ? false : { duration: 750, easing: "easeOutQuart" },
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

  // Motor na janela principal (migração 13/11/2026): o núcleo das regras (app/core/nucleo-recargas.js)
  // e a API (app/motor-api.js) já vêm carregados no index.html — nada de página antiga escondida.
  // "Atualizar" depois da primeira carga relê tudo do banco sem recarregar a página (recarregar()).
  let motorBooted = false;
  function bootMotor() {
    setStatus("Carregando motor…", "warn");
    if (motorBooted && window.UBY_MOTOR_API?.recarregar) {
      window.UBY_MOTOR_API.recarregar().catch(err => { console.error("[núcleo]", err); setStatus("Falha ao ler o banco: " + err.message, "err"); });
      return Promise.resolve(window.UBY_MOTOR_API);
    }
    motorBooted = true;
    if (!window.UBY_NUCLEO || !window.UBY_MOTOR_API) return Promise.reject(new Error("O motor não carregou (app/core)."));
    window.UBY_NUCLEO.iniciar().catch(err => { console.error("[núcleo]", err); setStatus("Falha ao ler o banco: " + err.message, "err"); });
    return Promise.resolve(window.UBY_MOTOR_API);
  }

  // Sem sessão no banco as leituras voltam vazias (sem erro) e a tela mostra só a cópia local do mês:
  // avisa em vez de exibir números parciais como se fossem completos.
  async function checkCloudSession() {
    const old = document.getElementById("sessionBanner");
    try {
      const sb = window.UBY_SUPABASE?.client?.();
      if (!sb) return;
      const { data, error } = await sb.auth.getUser();
      if (data?.user) { if (old) old.remove(); return; }
      if (error && !/auth|jwt|session|token/i.test(error.message || "")) return; // sem rede: não é sessão expirada
    } catch (_) { return; }
    if (old) return;
    const bar = document.createElement("div");
    bar.id = "sessionBanner";
    bar.setAttribute("role", "alert");
    bar.style.cssText = "position:sticky;top:0;z-index:50;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 16px;background:#fdf0ef;color:#8a2f2a;border-bottom:1px solid #e0a4a0;font-weight:600";
    // Sessão guardada mas ilegível = o navegador ficou sem espaço (a biblioteca do banco testa a gravação antes de ler).
    let cheio = false;
    try { cheio = !!localStorage.getItem("sb-csxafzuaqbbsbdatuhrd-auth-token"); } catch (_) {}
    const msg = cheio
      ? "O armazenamento do navegador está cheio e a plataforma não consegue ler a sua sessão: o que aparece é só uma cópia parcial (mês atual) e não vale para fechamentos."
      : "Sua sessão com o banco expirou: o que aparece é só uma cópia parcial (mês atual) e não vale para fechamentos.";
    bar.innerHTML = `<span>${msg}</span><button type="button" class="btn" style="font-weight:700">${cheio ? "Liberar espaço e recarregar" : "Sair e entrar de novo"}</button>`;
    bar.querySelector("button").onclick = () => {
      if (!cheio) return $("#logoutButton").click();
      // Só o cache de recargas da Nova (refeito a partir da nuvem); nada da plataforma antiga, nem desfazer importação, nem dados lançados.
      ["uby-recargas-db-v1"].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
      location.reload();
    };
    document.body.prepend(bar);
  }

  async function connect() {
    try {
      const mark = n => { try { performance.mark("uby:" + n); } catch (_) {} };
      const api = await bootMotor();
      mark("motor");
      state.api = api;
      setStatus("Lendo Supabase…", "warn");
      await api.waitForReady();
      mark("pronto");
      checkCloudSession();
      refreshMeta();
      setStatus(`Mês atual carregado · ${fmt.int(state.status.charges)} sessões`, "warn");
      rerender();
      mark("tela1");
      setStatus("Carregando histórico completo…", "warn");
      await api.loadFull();
      mark("historico");
      state.full = true;
      state.cache.clear();
      refreshMeta();
      const realStatus = () => setStatus(`Dados reais · ${fmt.int(state.status.charges)} sessões · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, "");
      // Aberto com o histórico guardado no aparelho: confere com a nuvem em segundo plano e atualiza a tela se mudou.
      if (state.status?.fromCache && api.onHistoryUpdated) {
        setStatus(`Histórico do aparelho · conferindo com a nuvem…`, "warn");
        api.onHistoryUpdated(detail => {
          state.cache.clear();
          refreshMeta();
          if (detail.error) setStatus("Não consegui conferir com a nuvem; mostrando o histórico do aparelho", "warn"); else realStatus();
          if (detail.changed && !String(location.hash).startsWith("#/parametros")) rerender();
          updateBell();
          mark("conferido");
        });
      } else realStatus();
      rerender();
      mark("tela2");
      updateBell();
      loadBankScheduled();
    } catch (err) {
      console.error(err);
      setStatus("Falha ao ler dados", "err");
      renderError(err);
    }
  }

  // Sino do topo: número de avisos urgentes + atenção (contas vencidas, que vencem
  // em até 7 dias, carregadores parados, fechamentos). Clique abre #/avisos.
  // Contas já agendadas no banco (Contas a pagar · 📎 Agendar): o motor tira das vencidas nos avisos e no sino.
  async function loadBankScheduled() {
    try {
      const mw = window;
      const r = await mw?.UBY_SUPABASE?.loadBankData?.();
      if (!mw) return;
      mw.__UBY_BANK_SCHEDULED = r?.payload?.scheduled || {};
      state.cache.clear();
      updateBell();
      if (state.route?.id === "avisos") rerender();
    } catch (err) { console.warn("[agendamentos]", err.message); }
  }
  function updateBell() {
    const bell = document.getElementById("alertBell");
    if (!bell || !state.api?.alerts) return;
    try {
      const a = data("alerts");
      const n = a.counts.critico + a.counts.atencao;
      const badge = bell.querySelector("b");
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = !n;
      bell.classList.toggle("urgent", a.counts.critico > 0);
      bell.title = `${a.counts.critico} urgente(s) · ${a.counts.atencao} de atenção${a.nextBill ? ` · próxima conta ${a.nextBill.dueDate.split("-").reverse().join("/")}` : ""}`;
    } catch (err) { console.warn("[avisos]", err.message); }
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
    if (!state.cache.has(key)) {
      const t0 = performance.now();
      state.cache.set(key, clone(state.api[method](...args)));
      const ms = performance.now() - t0;
      (state.timings = state.timings || []).push({ method, ms: Math.round(ms) });
    }
    return state.cache.get(key);
  }
  function periodArg() { return state.period; }

  // ---------- motor de obras (núcleo da janela principal) ----------
  // Migração (14/11/2026): sem página antiga escondida. app/core/nucleo-obras.js tem as regras
  // e a API (window.UBY_OBRAS_API); "forçar" relê tudo da nuvem.
  let obrasPromise = null;
  function obras(force = false) {
    if (force) obrasPromise = null;
    if (obrasPromise) return obrasPromise;
    obrasPromise = (async () => {
      const api = window.UBY_OBRAS_API;
      if (!api) throw new Error("O motor de obras não carregou.");
      await (force && api.recarregar ? api.recarregar() : api.ready());
      return { api, data: api.snapshot() };
    })();
    obrasPromise.catch(() => { obrasPromise = null; });
    return obrasPromise;
  }

  // Gravação de obras: só na tela Obras (escopo "obras" de UBY_SUPABASE.comGravacao).
  const OBRAS_WRITES = ["editObra", "createObra", "completeObra", "completeAll"];
  function obrasEdit() {
    if (!/^#\/obras(\/|$)/.test(location.hash)) return Promise.reject(new Error("A edição de obras só funciona na tela Obras."));
    const api = window.UBY_OBRAS_API;
    if (!api) return Promise.reject(new Error("O motor de obras não carregou."));
    const wrapped = Object.assign({}, api);
    OBRAS_WRITES.forEach(k => { if (typeof api[k] === "function") wrapped[k] = (...a) => window.UBY_SUPABASE.comGravacao("obras", () => api[k](...a)); });
    return api.ready().then(() => wrapped);
  }

  async function sha1(text) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // ---------- rotas ----------
  function parseHash() {
    const parts = (location.hash.replace(/^#\/?/, "") || "comando").split("/").map(decodeURIComponent);
    return { id: parts[0], params: parts.slice(1) };
  }

  function renderNav() {
    $("#nav").innerHTML = NAV.map(group => `
      <section class="nav-group"><p class="nav-title">${group.label}</p>
        ${group.items.map((item, k) => `<a class="nav-item" data-hub="${group.label}|${k}" href="${tabHref(item.tabs[0])}"><i>${item.icon}</i><span>${item.label}</span>${item.tabs.length > 1 ? `<b class="new">${item.tabs.length}</b>` : ""}</a>`).join("")}
      </section>`).join("");
  }

  function route() {
    const { id, params } = parseHash();
    let def = ROUTES[id] || ROUTES.comando;
    // Atalho de menu (ex.: #/fin-pagar) leva para a tela de verdade.
    if (def.href && id === def.id) { location.replace(def.href); return; }
    state.route = def; state.params = params;
    document.body.classList.remove("menu-open");
    // Menu: fica ativo o painel da tela atual; as telas irmãs aparecem como abas no topo.
    const hub = renderHubTabs(def.id);
    document.querySelectorAll(".nav-item").forEach(a => a.classList.toggle("active", !!hub && a.dataset.hub === hub.key));
    $("#crumbGroup").textContent = `UBY Recharge / ${def.group.charAt(0) + def.group.slice(1).toLowerCase()}`;
    $("#crumbTitle").textContent = def.label;
    $("#periodWrap").hidden = !(def.type === "view" && def.period);
    $("#view").hidden = false;
    window.UBY_SCROLL_KEEP?.reset();
    window.scrollTo({ top: 0 });
    rerender();
  }

  function rerender() {
    const def = state.route;
    if (!def || def.type !== "view") return;
    clearCharts();
    const view = VIEWS[def.id];
    const target = $("#view");
    // Arquivo da tela não carregou (rede instável ou publicação em andamento):
    // busca de novo sozinho, em vez de derrubar a tela.
    if (!view) { healView(def.id, target); return; }
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
        // Tela nova (outra rota ou outros parâmetros) entra com fade e leve deslize; recálculo da mesma tela não.
        const routeKey = `${def.id}|${(state.params || []).join("/")}`;
        if (routeKey !== state.fxRoute) { state.fxRoute = routeKey; window.UBY_FX?.enter?.(target); }
      } catch (err) {
        console.error(err);
        renderError(err);
      }
      target.style.opacity = "";
      document.getElementById("calcBadge")?.remove();
    }, 30);
  }

  const healTries = {};
  function healView(id, target) {
    const n = (healTries[id] = (healTries[id] || 0) + 1);
    if (n > 4) { renderError(new Error("Esta tela não carregou. Confira a internet e toque em Tentar de novo.")); return; }
    target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Carregando a tela…</h2><p>Buscando os arquivos novamente (tentativa ${n}).</p></div>`;
    const s = document.createElement("script");
    s.src = `app/views/${encodeURIComponent(id)}.js?r=${Date.now()}`;
    s.onload = () => { if (VIEWS[id]) healTries[id] = 0; rerender(); };
    s.onerror = () => setTimeout(rerender, 1500 * n);
    document.body.appendChild(s);
  }

  function loadingMarkup() {
    return `<div class="loading"><div class="spinner"></div><h2>Conectando à base real</h2>
      <p>O motor de cálculo está lendo obras, sessões e resumos no Supabase. Na primeira abertura isso leva alguns segundos; depois o mês atual fica em cache.</p></div>`;
  }

  function renderError(err) {
    $("#view").innerHTML = `<div class="loading"><h2>Não foi possível ler os dados</h2><p>${esc(err.message || err)}</p>
      <p>Confira a conexão com a internet e se o login ainda é válido.</p><div><a class="btn primary" href="login.html">Entrar novamente</a> <button class="btn" onclick="location.reload()">Tentar de novo</button></div></div>`;
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
      try { window.UBY_SUPABASE?.signOut?.(); } catch (_) {}
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
  // Centro de custos de um carregador (Financeiro › Por estação). O nome da estação pode vir da obra
  // ("POSTO CENTRAL JK") ou das recargas ("UBY RECHARGE - CENTRAL JK"): a tela acha pelo workId.
  // Nome curto do carregador para cartões pequenos (usuário, 19/10/2026: "abrevia, coloca JK, RK ou Aurora").
  const shortStation = name => {
    const s = String(name || "").replace(/^UBY RECHARGE\s*-\s*/i, "").trim();
    const n = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/robert\s*koch|malassise/.test(n)) return "RK";
    if (/central\s*jk/.test(n)) return /\bac\b/.test(n) ? "JK AC" : "JK";
    if (/aurora/.test(n)) return /\bac\b/.test(n) ? "Aurora AC" : /\bdc\b/.test(n) ? "Aurora DC" : "Aurora";
    return s.replace(/^(posto|shopping|mercado)\s+/i, "") || s;
  };
  const stationHref = (workId, station) => workId || station ? `#/financeiro/estacao/${encodeURIComponent(`${workId || ""}|${station || ""}`)}` : "";
  const stationLink = (workId, station, label = station) => {
    const href = stationHref(workId, station);
    return href ? `<a class="edit-link" href="${href}" title="Abrir o centro de custos deste carregador">${esc(label)}<span aria-hidden="true"> ↗</span></a>` : esc(label);
  };

  window.UBY = { nav: NAV, routes: ROUTES, shortStation, start, checkCloudSession, state, fmt, esc, delta, kpi, mini, chart, baseChartOptions, PALETTE, data, periodArg, obras, obrasEdit, sha1, rerender, modelLabel, isUbyModel, stationHref, stationLink,
    register: (id, view) => { VIEWS[id] = view; }, go: hash => { location.hash = hash; }, ROUTES };
})();

(function () {
  const inAnalyzers = location.pathname.includes("/analisadores/");
  const inPrototypes = location.pathname.includes("/outputs/prototipos/");
  const inTasks = location.pathname.includes("/tarefas/");
  const inObras = location.pathname.includes("/obra-ev/") || inPrototypes;
  const inRoot = !inAnalyzers && !inTasks && !inObras;
  const base = inAnalyzers ? "../" : inTasks ? "../obra-ev/" : inRoot ? "obra-ev/" : "./";
  const home = inAnalyzers ? "../../" : inPrototypes ? "../../docs/" : inTasks ? "../" : inRoot ? "./" : "../";
  const dashboardHref = inPrototypes ? "gestao_obra_ev.html" : base + "index.html";
  const engineeringHref = inPrototypes ? "../../docs/obra-ev/engenharia.html" : base + "engenharia.html";
  const analyzersHref = inPrototypes ? "../../docs/obra-ev/analisadores/dashboard.html" : base + "analisadores/dashboard.html";
  const marketHref = inPrototypes ? "../../docs/obra-ev/mercado.html" : base + "mercado.html";
  const recargasHref = inPrototypes ? "../../docs/obra-ev/recargas.html" : base + "recargas.html";
  const tasksHref = inAnalyzers ? "../../tarefas/" : inTasks ? "./" : inRoot ? "tarefas/" : "../tarefas/";
  const loginHref = inAnalyzers ? "../login.html" : inPrototypes ? "../../docs/obra-ev/login.html" : inTasks ? "../obra-ev/login.html" : inRoot ? "obra-ev/login.html" : "login.html";
  const current = location.pathname.split("/").pop() || "index.html";
  const isDetail = current === "gestao_obra_ev_detalhe.html";
  const isEngineering = current === "engenharia.html";
  const isMarket = current === "mercado.html";
  const isRecargas = current === "recargas.html";
  const isLogin = current === "login.html";
  const isAnalyzer = inAnalyzers;
  const isDashboard = (current === "index.html" && inObras && !inAnalyzers) || current === "gestao_obra_ev.html";
  const isTasks = inTasks;
  const isHome = inRoot;
  const collapsed = localStorage.getItem("uby-sidebar-collapsed") === "1";
  const profile = readProfile();
  const isAdmin = profile?.role === "admin";

  function readProfile() {
    try {
      return JSON.parse(localStorage.getItem("uby-auth-session-v1") || localStorage.getItem("uby-auth-profile-v1") || "null");
    } catch (err) {
      return null;
    }
  }

  function allowed(module) {
    if (module === "recargas" && ["admin", "engineering"].includes(profile?.role)) return true;
    return isAdmin || module === "login" || (profile?.modules || []).includes(module);
  }

  const currentModule = isLogin ? "login" : isTasks ? "tasks" : isAnalyzer ? "analyzers" : isEngineering ? "engineering" : isMarket ? "market" : isRecargas ? "recargas" : isDetail ? "detail" : isDashboard ? "dashboard" : isHome ? "home" : "home";
  if (!profile && currentModule !== "login") {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    location.href = `${loginHref}?next=${next}`;
    return;
  }
  if (!allowed(currentModule)) {
    location.href = engineeringHref;
    return;
  }

  const links = [
    {
      title: "Base",
      items: [
        ["Pagina inicial", home, "P", isHome, "home"],
        ["Dashboard obras", dashboardHref, "O", isDashboard && !isHome, "dashboard"],
        ["Mercado", marketHref, "M", isMarket, "market"],
        ["Recargas", recargasHref, "G", isRecargas, "recargas"],
        ["Portal engenharia", engineeringHref, "E", isEngineering, "engineering"]
      ]
    },
    {
      title: "Gestao de obra",
      items: [
        ["Controle de obras", dashboardHref, "C", isDashboard && !isHome, "dashboard"],
        ["Concessionaria", engineeringHref, "K", isEngineering, "utility"],
        ["Orcamentos", dashboardHref + "#obras", "R", false, "budgets"],
        ["Operacao de recargas", recargasHref, "G", isRecargas, "recargas"],
        ["Analisadores", analyzersHref, "A", isAnalyzer, "analyzers"]
      ]
    },
    {
      title: "Administracao",
      items: [
        ["Tarefas", tasksHref, "T", isTasks, "tasks"],
        ["Backup e restauracao", base + "index.html#backup", "B", false, "backup"],
        ["Perfil e acesso", loginHref, "L", isLogin, "login"]
      ]
    }
  ];

  function navSection(section) {
    const items = section.items.filter(([, , , , module]) => allowed(module));
    if (!items.length) return "";
    return `<div class="uby-section"><div class="uby-section-title">${section.title}</div>${items.map(([label, href, mark, active]) => `<a class="uby-link ${active ? "active" : ""}" href="${href}"><span class="uby-link-mark">${mark}</span><span class="uby-link-text">${label}</span></a>`).join("")}</div>`;
  }

  function ensureBrandAssets() {
    if (!document.querySelector('link[data-uby-brand="css"]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = base + "brand.css";
      css.dataset.ubyBrand = "css";
      document.head.appendChild(css);
    }
    if (!document.querySelector('link[rel="icon"]')) {
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.type = "image/svg+xml";
      icon.href = base + "assets/brand/04_simbolo_badge.svg";
      document.head.appendChild(icon);
    }
  }

  ensureBrandAssets();

  const shell = document.createElement("div");
  shell.innerHTML = `
    <aside class="uby-sidebar">
      <div class="uby-brand">
        <a class="uby-brand-mark" href="${home}" aria-label="UBY Recharge"><img src="${base}assets/brand/04_simbolo_badge.svg" alt=""></a>
        <div class="uby-brand-divider"></div>
        <div class="uby-brand-title">UBY Recharge</div>
        <button class="uby-collapse" type="button" aria-label="Recolher menu">&lt;&lt;</button>
      </div>
      <nav class="uby-nav">${links.map(navSection).join("")}</nav>
    </aside>
    <div class="uby-topbar">
      <span class="uby-brand-mark" aria-hidden="true"><img src="${base}assets/brand/04_simbolo_badge.svg" alt=""></span>
      <div class="uby-topbar-divider"></div>
      <strong>UBY Recharge</strong>
      <span>|</span>
      <span class="uby-recharge">Central de opera&ccedil;&atilde;o EV</span>
      <a class="uby-profile-pill" href="${loginHref}">${profile?.label || "Entrar"}</a>
    </div>
  `;
  document.body.prepend(shell);
  document.body.classList.add("uby-shell");
  if (collapsed) document.body.classList.add("uby-collapsed");

  const button = document.querySelector(".uby-collapse");
  button.addEventListener("click", () => {
    const next = !document.body.classList.contains("uby-collapsed");
    document.body.classList.toggle("uby-collapsed", next);
    localStorage.setItem("uby-sidebar-collapsed", next ? "1" : "0");
  });
})();

(function () {
  const inAnalyzers = location.pathname.includes("/analisadores/");
  const base = inAnalyzers ? "../" : "./";
  const home = inAnalyzers ? "../../" : "../";
  const current = location.pathname.split("/").pop() || "index.html";
  const isDetail = current === "gestao_obra_ev_detalhe.html";
  const isEngineering = current === "engenharia.html";
  const isAnalyzer = inAnalyzers;
  const isDashboard = current === "index.html" && !inAnalyzers;
  const collapsed = localStorage.getItem("uby-sidebar-collapsed") === "1";

  const links = [
    {
      title: "Base",
      items: [
        ["Pagina inicial", home, "P", false],
        ["Dashboard obras", base + "index.html", "O", isDashboard],
        ["Portal engenharia", base + "engenharia.html", "E", isEngineering]
      ]
    },
    {
      title: "Gestao de obra",
      items: [
        ["Controle de obra", base + "gestao_obra_ev_detalhe.html", "C", isDetail],
        ["Concessionaria", base + "engenharia.html", "K", isEngineering],
        ["Orcamentos", base + "index.html#obras", "R", false],
        ["Documentos", base + "gestao_obra_ev_detalhe.html#documentos", "D", false],
        ["Analisadores", base + "analisadores/dashboard.html", "A", isAnalyzer]
      ]
    },
    {
      title: "Administracao",
      items: [
        ["Tarefas", home + "tarefas/", "T", false],
        ["Backup e restauracao", base + "index.html#backup", "B", false]
      ]
    }
  ];

  function navSection(section) {
    return `<div class="uby-section"><div class="uby-section-title">${section.title}</div>${section.items.map(([label, href, mark, active]) => `<a class="uby-link ${active ? "active" : ""}" href="${href}"><span class="uby-link-mark">${mark}</span><span class="uby-link-text">${label}</span></a>`).join("")}</div>`;
  }

  const shell = document.createElement("div");
  shell.innerHTML = `
    <aside class="uby-sidebar">
      <div class="uby-brand">
        <div class="uby-grid-icon" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="uby-brand-divider"></div>
        <div class="uby-brand-title">P3 Energy - Central</div>
        <button class="uby-collapse" type="button" aria-label="Recolher menu">&lt;&lt;</button>
      </div>
      <nav class="uby-nav">${links.map(navSection).join("")}</nav>
    </aside>
    <div class="uby-topbar">
      <div class="uby-grid-icon" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="uby-topbar-divider"></div>
      <strong>P3 Energy - Central</strong>
      <span>|</span>
      <span class="uby-recharge">UBY Recharge</span>
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

/*
  Busca geral da plataforma (usuário, 19/10/2026: "às vezes demoro pra achar as coisas").
  Ctrl+K (ou "/") abre; acha telas e abas (com sinônimos), ações, carregadores, contas a pagar e
  clientes. Setas escolhem, Enter abre, Esc fecha. Só lê dados que o motor já tem carregados.
*/
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const brl = v => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const day = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "";
  const cleanSt = s => String(s || "").replace(/^UBY RECHARGE\s*-\s*/i, "");

  // Atalhos e sinônimos: o que a pessoa digita × onde aquilo fica.
  const ACTIONS = [
    ["Contas a pagar", "#/parametros/contas", "boleto pagar pagamento vencida vencido vencimento conta fornecedor agendar agendado baixa", "Financeiro"],
    ["Conciliação bancária (extrato)", "#/parametros/pagamentos", "extrato banco conciliar conciliacao pagseguro ofx csv entradas saidas spott repasse recebido", "Financeiro"],
    ["Lançar fatura de energia (Copel)", "#/parametros/carregador/-/sec%3Aenergia", "copel fatura energia arrendamento pdf leitura kwh conta de luz", "Ação"],
    ["Novo custo de um carregador", "#/parametros/carregador/-/nc", "novo custo internet aluguel seguro manutencao camera despesa lancar custo", "Ação"],
    ["Repasse à área (dono do local)", "#/parametros/carregador/-/sec%3Aarea", "area repasse posto dono local reembolso participacao", "Carregador"],
    ["Contrato e splits do carregador", "#/parametros/carregador/-/sec%3Acontrato", "gestao p3 plataforma spott split royalty investimento contrato percentual", "Carregador"],
    ["Horários, potência e cortesias", "#/parametros/carregador/-/sec%3Aoperacao", "horario funcionamento potencia kw cortesia aberto fechado", "Carregador"],
    ["Fechamento do mês", "#/parametros/fechamento", "fechar fechamento aprovar publicar recebidos conferencia mes falta checklist", "Financeiro"],
    ["Conferência dos recebidos (UBY e P3)", "#/parametros/fechamento/-/sec%3Arecebidos", "recebido recebidos uby p3 bate conferir spott extrato split", "Financeiro"],
    ["Cotas, impostos e rodadas", "#/parametros/cotas", "imposto impostos cotista cotistas cota rodada aliquota reserva expansao", "Financeiro"],
    ["Custos centrais (matriz)", "#/parametros/matriz", "matriz rateio aluguel sede contador custo central parcelado", "Financeiro"],
    ["Documentos (NF, boletos, faturas)", "#/parametros/documentos", "nota fiscal nf documento anexar arquivo pdf comprovante", "Financeiro"],
    ["Resultado e DRE", "#/financeiro", "resultado dre lucro margem prejuizo financeiro", "Financeiro"],
    ["Relatórios (PDF)", "#/relatorios", "relatorio relatorios pdf cotista area prestacao de contas unificado imprimir", "Relatórios"],
    ["Importar planilhas da Spott", "#/importar", "importar planilha spott recargas xlsx robo atualizar dados", "Dados"],
    ["Avisos e contas a vencer", "#/avisos", "aviso avisos alerta sino vencer", "Visão geral"],
    ["Clientes · ranking do período", "#/clientes/ranking", "cliente clientes ranking motorista maiores", "Clientes"],
    ["Clientes · alertas e risco", "#/clientes/alertas", "cliente sumiu parou risco alerta churn", "Clientes"],
    ["Ocupação e análise de uso", "#/uso", "ocupacao uso horario pico hora dia semana", "Rede"],
    ["Estudos de preço", "#/precos", "preco tarifa kwh concorrencia reajuste cupom", "Rede"],
    ["Clube UBY (parceiros e cupons)", "#/clube", "clube parceiros cupom desconto beneficio qr", "Clientes"],
    ["Obras e pendências", "#/obras", "obra obras implantacao pendencia prazo", "Obras"],
    ["Mercado EV · eletrificados por cidade", "#/mercado/pfrota", "eletrificados eletricos plug-in hibridos frota carros cidade municipio senatran ibge prospeccao expansao", "Obras"],
    ["Backups e restauração", "#/backups", "backup restaurar versao historico", "Dados"]
  ];

  let index = null;
  function build() {
    const out = [];
    const add = (group, title, sub, href, words = "", extra = []) => out.push({ group, title, sub, href, extra, hay: norm(`${title} ${sub} ${words}`), t: norm(title) });
    ACTIONS.forEach(([t, h, w, g]) => add(g, t, "", h, w));
    // Telas e abas do menu.
    (window.UBY?.nav || []).forEach(g => g.items.forEach(item => item.tabs.forEach(([ref, label]) => {
      const href = ref.startsWith("#/") ? ref : `#/${ref}`;
      if (!out.some(o => o.href === href)) add("Telas", label, item.label === label ? g.label.toLowerCase() : item.label, href, `${item.label} ${g.label}`);
    })));
    const api = window.UBY?.state?.api;
    if (!api) return out;
    // Carregadores: página, centro de custos e financeiro.
    try {
      (window.UBY.data("networkConfig") || []).forEach(r => {
        const key = encodeURIComponent(`${r.workId}|${r.station}`);
        add("Carregadores", cleanSt(r.station), `${r.workName}${r.included ? "" : " · fora da operação UBY"}`, `#/parametros/carregador/${key}`, `${r.workId} ${r.kind || ""} carregador estacao ponto`,
          [["Custos", `#/parametros/carregador/${key}`], ["Financeiro", window.UBY.stationHref(r.workId, r.station)], ["Energia", `#/parametros/carregador/${key}/sec%3Aenergia`]]);
      });
    } catch (_) {}
    // Contas: as abertas e as pagas nos últimos 2 meses.
    try {
      const lim = new Date(); lim.setMonth(lim.getMonth() - 2); const from = lim.toISOString().slice(0, 10);
      api.allBills().filter(b => b.amount > 0 && (!b.paid || (b.paidAt || "") >= from)).forEach(b => {
        add("Contas", b.name, `${brl(b.amount)} · ${b.paid ? `paga ${day(b.paidAt)}` : `vence ${day(b.due)}`} · ${cleanSt(b.station) || "Rede UBY"}`, "#/parametros/contas",
          `${b.supplier} ${b.category} ${b.station} ${brl(b.amount)} ${String(b.amount).replace(".", ",")} ${b.amount}`);
      });
    } catch (_) {}
    // Clientes (todos com recarga): abre o cadastro já filtrado.
    try {
      (window.UBY.data("clientRanking", "", "", "", "")?.ranking || []).forEach(c => {
        if (!c.name && !c.email) return;
        add("Clientes", c.name || c.email, `${c.sessions} recarga(s) · ${brl(c.revenue)}`, `#/clientes/cadastro/${encodeURIComponent(c.name || c.email)}`, `${c.email} ${c.phone}`);
      });
    } catch (_) {}
    return out;
  }

  const ORDER = ["Ação", "Telas", "Financeiro", "Carregador", "Carregadores", "Contas", "Clientes", "Relatórios", "Rede", "Dados", "Obras", "Visão geral"];
  function search(q) {
    const terms = norm(q).split(" ").filter(Boolean);
    if (!terms.length) return index.filter(i => ["Ação", "Financeiro"].includes(i.group)).slice(0, 9);
    const hits = [];
    index.forEach(i => {
      if (!terms.every(t => i.hay.includes(t))) return;
      let score = 0;
      if (i.t.startsWith(terms[0])) score += 40; else if (i.t.includes(terms[0])) score += 25;
      if (terms.every(t => i.t.includes(t))) score += 20;
      if (i.group === "Carregadores") score += 18;
      else if (["Ação", "Telas", "Financeiro", "Carregador"].includes(i.group)) score += 12;
      hits.push([score, i]);
    });
    hits.sort((a, b) => b[0] - a[0] || ORDER.indexOf(a[1].group) - ORDER.indexOf(b[1].group));
    // No máximo 6 por grupo, 30 no total.
    const per = {}; const out = [];
    hits.forEach(([, i]) => { per[i.group] = (per[i.group] || 0) + 1; if (per[i.group] <= 6 && out.length < 30) out.push(i); });
    return out;
  }

  let box = null, list = [], active = 0;
  function open() {
    index = build();
    if (!box) {
      box = document.createElement("div");
      box.className = "sx";
      box.innerHTML = `<div class="sx-panel" role="dialog" aria-label="Buscar na plataforma">
        <div class="sx-top"><span aria-hidden="true">⌕</span><input id="sxInput" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar tela, carregador, conta, cliente, ação…"><kbd>Esc</kbd></div>
        <div class="sx-list" id="sxList" role="listbox"></div>
        <div class="sx-foot"><span><kbd>↑</kbd><kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> buscar de qualquer tela</span></div></div>`;
      document.body.appendChild(box);
      box.addEventListener("pointerdown", e => { if (e.target === box) close(); });
      const input = box.querySelector("#sxInput");
      input.addEventListener("input", () => { active = 0; paint(input.value); });
      input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, list.length - 1); mark(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); mark(); }
        else if (e.key === "Enter") { e.preventDefault(); go(list[active]?.href); }
        else if (e.key === "Escape") { e.preventDefault(); close(); }
      });
      box.querySelector("#sxList").addEventListener("click", e => {
        const a = e.target.closest("[data-go]"); if (a) { e.preventDefault(); go(a.dataset.go); }
      });
    }
    box.classList.add("on");
    const input = box.querySelector("#sxInput");
    input.value = ""; active = 0; paint("");
    setTimeout(() => input.focus(), 20);
  }
  function close() { box?.classList.remove("on"); }
  function go(href) { if (!href) return; close(); if (location.hash === href) window.UBY?.rerender?.(); else location.hash = href; }
  function paint(q) {
    list = search(q);
    const el = box.querySelector("#sxList");
    if (!list.length) { el.innerHTML = `<div class="sx-empty">Nada encontrado para "${esc(q)}". Tente outra palavra (ex.: boleto, copel, imposto, nome do carregador ou do cliente).</div>`; return; }
    let last = "";
    el.innerHTML = list.map((i, k) => {
      const head = i.group !== last ? `<p class="sx-group">${esc(i.group)}</p>` : "";
      last = i.group;
      return `${head}<a class="sx-item" role="option" data-i="${k}" data-go="${esc(i.href)}" href="${esc(i.href)}"><span class="sx-t">${esc(i.title)}</span>${i.sub ? `<span class="sx-s">${esc(i.sub)}</span>` : ""}
        ${i.extra.length ? `<span class="sx-x">${i.extra.filter(x => x[1]).map(([l, h]) => `<span data-go="${esc(h)}">${esc(l)}</span>`).join("")}</span>` : ""}</a>`;
    }).join("");
    el.querySelectorAll(".sx-item").forEach(a => a.addEventListener("mousemove", () => { active = Number(a.dataset.i); mark(false); }));
    mark();
  }
  function mark(scroll = true) {
    box.querySelectorAll(".sx-item").forEach(a => a.classList.toggle("on", Number(a.dataset.i) === active));
    if (scroll) box.querySelector(`.sx-item[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }

  document.addEventListener("keydown", e => {
    const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); box?.classList.contains("on") ? close() : open(); }
    else if (e.key === "/" && !typing && !box?.classList.contains("on")) { e.preventDefault(); open(); }
  });
  // Botão no topo.
  function button() {
    const bar = document.querySelector(".top-actions");
    if (!bar || bar.querySelector(".sx-btn")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn sx-btn"; b.title = "Buscar na plataforma (Ctrl+K)";
    b.innerHTML = `<span aria-hidden="true">⌕</span><span class="hide-sm">Buscar</span><kbd class="hide-sm">Ctrl K</kbd>`;
    b.onclick = open;
    bar.prepend(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", button); else button();
  window.UBY_SEARCH = Object.freeze({ open, close });
})();

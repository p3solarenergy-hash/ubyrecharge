/* Mercado EV Brasil — conteúdo lido da página original (abas, indicadores, gráficos, rankings, ESTADOS). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const SRC = "legado/obra-ev/mercado.html";
  const ui = { tab: "p2026", uf: "PR", sort: "eletropostos", fUf: "PR", fSort: "plug", fq: "" };
  let data = null, error = null, loading = false;
  // Aba própria (não vem da página original): frota por município, de app/data/frota-ev.json
  // (Senatran + IBGE, atualizado pelo scripts/atualizar_frota_ev.js).
  const FROTA = { id: "pfrota", label: "🚗 Frota por cidade" };
  const frota = { data: null, error: "", loading: false };

  // Executa dentro da página original e devolve só dados (texto e números).
  function reader(w) {
    const d = w.document;
    const txt = el => (el?.textContent || "").replace(/\s+/g, " ").trim();
    const html = el => (el?.innerHTML || "").replace(/\s+/g, " ").trim();
    const charts = {};
    Object.values(w.Chart?.instances || {}).forEach(c => {
      charts[c.canvas.id] = { type: c.config.type, indexAxis: c.options?.indexAxis || "x", labels: (c.data.labels || []).map(String),
        datasets: (c.data.datasets || []).map(s => ({ label: s.label || "", type: s.type || "", yAxisID: s.yAxisID || "", data: (s.data || []).map(v => v && typeof v === "object" ? (v.y ?? v.x ?? 0) : v) })) };
    });
    const alert = a => ({ icon: txt(a.querySelector(".ai")), title: txt(a.querySelector(".at")), body: html(a.querySelector(".ab")) });
    const pages = [...d.querySelectorAll(".tabs .tab")].map(tab => {
      const id = (tab.getAttribute("onclick") || "").match(/show\('([^']+)'/)?.[1];
      const page = d.getElementById(id);
      if (!page) return null;
      return {
        id, label: txt(tab).replace(/NOVO$/, "").trim(),
        kpis: [...page.querySelectorAll(".kpi")].map(k => ({ label: txt(k.querySelector(".kpi-lbl")), value: Number(k.querySelector("[data-count]")?.dataset.count), fmt: k.querySelector("[data-count]")?.dataset.fmt || "n", note: txt(k.querySelector(".kpi-note")) })),
        insights: [...page.querySelectorAll(".ins")].map(i => ({ icon: txt(i.querySelector(".ins-icon")), value: txt(i.querySelector(".ins-val")), label: txt(i.querySelector(".ins-lbl")), note: txt(i.querySelector(".ins-note")) })),
        alerts: [...page.querySelectorAll(".alert")].filter(a => !a.closest(".card")).map(alert),
        cards: [...page.querySelectorAll(".card")].filter(c => !c.querySelector("#cEstado") && !c.parentElement.closest(".card")).map(c => ({
          title: txt(c.querySelector(".ct")), sub: txt(c.querySelector(".cs")),
          chart: [...c.querySelectorAll("canvas")].map(cv => cv.id).find(i => charts[i]) || "",
          legend: [...c.querySelectorAll(".li")].map(li => ({ label: txt(li.querySelector(".ll")), value: txt(li.querySelector(".lv")), extra: txt(li.querySelector(".lp")) })),
          bars: [...c.querySelectorAll(".pw")].map(p => ({ label: txt(p.querySelector(".pl")), value: txt(p.querySelector(".pv")), pct: parseFloat(p.querySelector(".pf")?.style.width) || 0 })),
          table: c.querySelector("table") ? { head: [...c.querySelectorAll("thead th")].map(txt), rows: [...c.querySelectorAll("tbody tr")].map(tr => [...tr.children].map(txt)) } : null,
          alerts: [...c.querySelectorAll(".alert")].map(alert),
          source: txt(c.querySelector(".src"))
        })).filter(c => c.title || c.chart || c.table),
        sources: [...page.querySelectorAll(".src")].filter(s => !s.closest(".card")).map(txt)
      };
    }).filter(Boolean);
    return { pages, charts, updated: txt(d.querySelector(".hmeta")), estados: w.eval("ESTADOS"), nacional: w.eval("MERCADO_NACIONAL") };
  }

  // Dados prontos em app/data/mercado.json (gerados desta mesma leitura). Valem
  // enquanto a página original não mudar (mesma impressão digital); se mudar,
  // lê a página como antes.
  async function load() {
    try {
      const [snap, html] = await Promise.all([
        fetch("app/data/mercado.json", { cache: "no-cache" }).then(r => (r.ok ? r.json() : null)),
        fetch(SRC, { cache: "no-cache" }).then(r => r.text())
      ]);
      if (snap && snap.sourceHash && snap.sourceHash === await UBY.sha1(html) && snap.data?.pages?.length) return snap.data;
    } catch (_) {}
    return UBY.legacyRead(SRC, reader, 2500);
  }
  UBY.mercadoReader = reader;

  const rich = s => esc(s).replace(/&lt;(\/?)(strong|em|b)&gt;/g, "<$1$2>");
  const richBody = s => rich(String(s).replace(/<(?!\/?(strong|em|b)>)[^>]+>/g, ""));
  const fmtKpi = k => k.fmt === "p" ? `${fmt.int(k.value)}%` : k.fmt === "r" ? fmt.n1(k.value) : fmt.int(k.value);
  const PAL = ["#187457", "#3d6f8e", "#b98527", "#77637d", "#b75450", "#8fa13a", "#2e8c8c", "#a0663f", "#173c30", "#c6d449"];
  const alertBox = a => `<div class="note" style="margin-bottom:10px"><strong>${esc(a.icon)} ${esc(a.title)}</strong><br>${richBody(a.body)}</div>`;

  function cardHtml(c, i) {
    return `<section class="section" style="margin:0">
      <div class="section-head"><div><h2>${esc(c.title)}</h2>${c.sub ? `<p>${esc(c.sub)}</p>` : ""}</div></div>
      ${c.chart ? `<div class="chart-box${c.legend.length ? " sm" : ""}"><canvas id="mk_${i}"></canvas></div>` : ""}
      ${c.legend.length ? `<div class="list" style="margin-top:8px">${c.legend.map((l, k) => `<div class="list-row"><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${PAL[k % PAL.length]};margin-right:6px"></i>${esc(l.label)}</span><strong>${esc(l.value)} <small>${esc(l.extra)}</small></strong></div>`).join("")}</div>` : ""}
      ${c.bars.map(b => `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${esc(b.label)}</span><strong>${esc(b.value)}</strong></div><div style="height:7px;border-radius:4px;background:var(--uby-line);overflow:hidden"><div style="height:100%;width:${Math.min(100, b.pct)}%;background:var(--uby-green)"></div></div></div>`).join("")}
      ${c.table ? `<div class="table-wrap"><table><thead><tr>${c.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${c.table.rows.map(r => `<tr>${r.map((v, k) => `<td class="${k && /^[\d.,%+\-−R$\s]+$/.test(v) ? "num" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${c.alerts.map(alertBox).join("")}
      ${c.source ? `<p class="source-line">${esc(c.source)}</p>` : ""}
    </section>`;
  }

  function statesHtml() {
    const n = data.nacional || {};
    const states = Object.entries(data.estados || {}).map(([uf, e]) => ({ uf, ...e, bev2025: e.bev?.[2025] || 0 }));
    const sorted = states.slice().sort((a, b) => ui.sort === "ratio" ? (a.ratio || 1e9) - (b.ratio || 1e9) : (b[ui.sort] || 0) - (a[ui.sort] || 0));
    if (!data.estados?.[ui.uf]) ui.uf = sorted[0]?.uf;
    const e = data.estados?.[ui.uf];
    return `<div class="split" style="margin-bottom:18px">
      <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Por estado</p><h2>Ranking dos estados</h2><p>Clique num estado para ver os destaques.</p></div>
          <select class="select" id="mkSort">${[["eletropostos", "Mais eletropostos"], ["bev2025", "Mais BEVs em 2025"], ["eletrif2025", "Mais eletrificados em 2025"], ["ratio", "Menos veículos por carregador"]].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="table-wrap" style="max-height:600px"><table><thead><tr><th>Estado</th><th>Região</th><th class="num">Eletropostos</th><th class="num">BEVs 2025</th><th class="num">Eletrificados 2025</th><th class="num">Veíc./carregador</th><th class="num">Municípios</th></tr></thead>
          <tbody>${sorted.map(s => `<tr class="clickable" data-uf="${esc(s.uf)}" ${s.uf === ui.uf ? 'style="background:var(--uby-green-soft)"' : ""}><td><strong>${esc(s.uf)}</strong> <small>${esc(s.name || "")}</small></td><td>${esc(s.region || "")}</td><td class="num">${fmt.int(s.eletropostos)}</td><td class="num">${fmt.int(s.bev2025)}</td><td class="num">${s.eletrif2025 ? fmt.int(s.eletrif2025) : "—"}</td><td class="num">${s.ratio ? fmt.n1(s.ratio) : "—"}</td><td class="num">${fmt.int(s.municipiosCom)}/${fmt.int(s.municipiosTotal)}</td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="section" style="margin:0">${e ? `<p class="kicker">${esc(e.region || "")}${e.rankNac ? ` · ${e.rankNac}º no ranking nacional` : ""}</p><h2>${esc(e.flag || "")} ${esc(e.name || ui.uf)}</h2>
        <div class="grid g2" style="margin:10px 0">
          ${kpi("Eletropostos", fmt.int(e.eletropostos), e.eletropostos2025 ? `${fmt.int(e.eletropostos2025)} na base anterior` : "")}
          ${kpi("Veículos por carregador", e.ratio ? fmt.n1(e.ratio) : "—", `nacional ${fmt.n1(n.ratio)}`, "", e.ratio > n.ratio ? "warn" : "")}
          ${kpi("Municípios com recarga", e.municipiosTotal ? fmt.pct1(e.municipiosCom / e.municipiosTotal * 100) : "—", `${fmt.int(e.municipiosCom)} de ${fmt.int(e.municipiosTotal)}`)}
          ${kpi("Capital", e.capitalEletro ? `${fmt.int(e.capitalEletro)} eletropostos` : "—", esc(e.capital || ""))}
          ${kpi("Eletrificados 2025", e.eletrif2025 ? fmt.int(e.eletrif2025) : "—", "vendas totais no estado")}
          ${kpi("Jan–jun 2026", e.janjun2026 ? fmt.int(e.janjun2026) : "—", "referência parcial")}
        </div>
        <p class="kicker">BEVs emplacados por ano</p><div class="chart-box sm"><canvas id="mkState"></canvas></div>
        <div class="list" style="margin-top:12px">${(e.destaques || []).map(x => `<div class="list-row" style="display:block;white-space:normal">${esc(x.icon || "")} ${rich(x.text || "")}</div>`).join("")}</div>` : `<div class="note">Escolha um estado.</div>`}
      </section>
    </div>`;
  }

  function loadFrota(target) {
    if (frota.data || frota.loading || frota.error) return;
    frota.loading = true;
    fetch("app/data/frota-ev.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { const c = d.columns; frota.data = { ...d, list: d.rows.map(r => Object.fromEntries(c.map((k, i) => [k, r[i]]))) }; })
      .catch(err => { frota.error = err.message; })
      .finally(() => { frota.loading = false; if (location.hash.startsWith("#/mercado") && ui.tab === FROTA.id) render(target); });
  }

  const plugOf = c => c.bev + c.phev;
  // Crescimento em 12 meses só com base mínima (cidade com 2 → 6 carros não é "+200%" que interesse).
  const growthOf = c => c.pluginPrev >= 20 ? (plugOf(c) / c.pluginPrev - 1) * 100 : null;
  const perMil = c => c.total >= 1000 ? plugOf(c) / c.total * 1000 : null;
  const per10k = c => c.pop >= 5000 ? plugOf(c) / c.pop * 10000 : null;
  const FSORT = [["plug", "Mais carros plug-in", plugOf], ["growth", "Mais crescimento em 12 meses", growthOf], ["share", "Mais plug-in por mil veículos", perMil], ["capita", "Mais plug-in por 10 mil habitantes", per10k]];
  const monthLong = mk => { const [y, m] = String(mk).split("-").map(Number); return y ? new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—"; };
  const growthCell = c => { const g = growthOf(c); return g === null ? (c.pluginPrev ? `<small>${fmt.int(c.pluginPrev)} há 12 meses</small>` : "—") : `<strong style="color:${g >= 0 ? "var(--uby-green)" : "var(--uby-red)"}">${g >= 0 ? "+" : ""}${fmt.pct1(g)}</strong><small>${fmt.int(c.pluginPrev)} há 12 meses</small>`; };

  function frotaRows() {
    const f = frota.data, sort = FSORT.find(x => x[0] === ui.fSort) || FSORT[0];
    const term = ui.fq.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const list = f.list.filter(c => c.uf === ui.fUf && (!term || c.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(term)))
      .sort((a, b) => (sort[2](b) ?? -1) - (sort[2](a) ?? -1) || plugOf(b) - plugOf(a));
    return list.map((c, i) => `<tr><td class="num"><small>${i + 1}</small></td><td><strong>${esc(c.city)}</strong></td><td class="num">${c.pop ? fmt.int(c.pop) : "—"}</td>
      <td class="num"><strong>${fmt.int(plugOf(c))}</strong><small>${fmt.int(c.bev)} elétricos + ${fmt.int(c.phev)} híbridos plug-in</small></td><td class="num">${growthCell(c)}</td>
      <td class="num">${perMil(c) === null ? "—" : fmt.n1(perMil(c))}</td><td class="num">${per10k(c) === null ? "—" : fmt.n1(per10k(c))}</td><td class="num">${fmt.int(c.hybrid)}</td><td class="num">${fmt.int(c.total)}</td></tr>`).join("")
      || `<tr><td colspan="9" class="empty">Nenhum município encontrado.</td></tr>`;
  }

  function frotaHtml(target) {
    loadFrota(target);
    if (!frota.data) return frota.error ? `<div class="note">Não foi possível carregar a frota por cidade (${esc(frota.error)}).</div>` : `<div class="loading"><div class="spinner"></div><h2>Carregando a frota por município</h2></div>`;
    const f = frota.data, ufs = [...new Set(f.list.map(c => c.uf))].sort();
    if (!ufs.includes(ui.fUf)) ui.fUf = "PR";
    const inUf = f.list.filter(c => c.uf === ui.fUf);
    const sum = (list, fn) => list.reduce((s, c) => s + (fn(c) || 0), 0);
    const plug = sum(inUf, plugOf), prev = sum(inUf, c => c.pluginPrev), withPlug = inUf.filter(c => plugOf(c) > 0).length;
    const top = inUf.slice().sort((a, b) => plugOf(b) - plugOf(a))[0];
    const br = sum(f.list, plugOf) + (f.unassignedPlugin || 0), brPrev = f.unassignedPluginPrev === null ? 0 : sum(f.list, c => c.pluginPrev) + (f.unassignedPluginPrev || 0);
    const ufName = uf => data.estados?.[uf]?.name || uf;
    return `<section class="section"><div class="section-head"><div><p class="kicker">Frota registrada · ${esc(monthLong(f.month))}</p><h2>Carros que recarregam na tomada, por município</h2>
        <p>Plug-in = 100% elétricos + híbridos plug-in registrados na cidade (Senatran). Onde a frota cresce mais rápido do que a oferta de recarga está a próxima estação. É um piso: parte dos híbridos plug-in é registrada como "gasolina/elétrico" e entra em Híbridos.</p></div>
        <div class="toolbar" style="gap:8px;flex-wrap:wrap"><select class="select" id="mkFUf">${ufs.map(uf => `<option value="${esc(uf)}" ${uf === ui.fUf ? "selected" : ""}>${esc(uf)} · ${esc(ufName(uf))}</option>`).join("")}</select>
          <select class="select" id="mkFSort">${FSORT.map(([v, l]) => `<option value="${v}" ${ui.fSort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          <input class="select" id="mkFq" type="search" placeholder="Buscar município" value="${esc(ui.fq)}" style="min-width:180px"></div></div>
      <div class="grid g4" style="margin-bottom:12px">
        ${kpi(`Plug-in em ${ui.fUf}`, fmt.int(plug), prev ? `${fmt.int(prev)} em ${esc(monthLong(f.prevMonth))}` : "", "", "lead")}
        ${kpi("Crescimento em 12 meses", prev ? `${plug >= prev ? "+" : ""}${fmt.pct1((plug / prev - 1) * 100)}` : "—", f.prevMonth ? `de ${esc(monthLong(f.prevMonth))} a ${esc(monthLong(f.month))}` : "sem a base do ano anterior")}
        ${kpi("Municípios com plug-in", `${fmt.int(withPlug)} de ${fmt.int(inUf.length)}`, top ? `líder: ${esc(top.city)} (${fmt.int(plugOf(top))})` : "")}
        ${kpi("Brasil", fmt.int(br), brPrev ? `${br >= brPrev ? "+" : ""}${fmt.pct1((br / brPrev - 1) * 100)} em 12 meses · ${fmt.int(f.unassignedPlugin || 0)} sem município` : `${fmt.int(f.unassignedPlugin || 0)} sem município informado`)}
      </div>
      <div class="table-wrap" style="max-height:640px"><table><thead><tr><th class="num">#</th><th>Município</th><th class="num">População</th><th class="num">Plug-in</th><th class="num">12 meses</th><th class="num">Por mil veículos</th><th class="num">Por 10 mil hab.</th><th class="num">Híbridos</th><th class="num">Frota total</th></tr></thead>
        <tbody id="mkFBody">${frotaRows()}</tbody></table></div>
      <p class="source-line">Fontes: ${esc(f.sources?.fleet || "Senatran")} (${esc(monthLong(f.month))}${f.prevMonth ? `, comparado com ${esc(monthLong(f.prevMonth))}` : ""}); ${esc(f.sources?.population || "IBGE")}. "12 meses" só para cidades com 20+ plug-in na base anterior; "por mil veículos" e "por 10 mil hab." só para cidades com 1.000+ veículos e 5.000+ habitantes. Atualizado sozinho quando a Senatran publica um mês novo.</p>
    </section>`;
  }

  function render(target, params = []) {
    // #/mercado/pfrota abre direto a frota por cidade (só enquanto o endereço for esse: a troca de aba o reescreve).
    if (params[0] === FROTA.id && location.hash.startsWith("#/mercado/pfrota")) ui.tab = FROTA.id;
    if (!data && !error) {
      target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Lendo o painel de mercado</h2></div>`;
      if (!loading) {
        loading = true;
        load().then(d => { data = d; }).catch(err => { error = err.message; })
          .finally(() => { loading = false; if (location.hash.startsWith("#/mercado")) render(target); });
      }
      return;
    }
    if (error || !data.pages?.length) { target.innerHTML = `<div class="loading"><h2>Não foi possível ler o painel de mercado</h2><p>${esc(error || "Página original sem conteúdo (sessão expirada?).")}</p></div>`; return; }

    const n = data.nacional || {};
    const isFrota = ui.tab === FROTA.id;
    const page = isFrota ? null : data.pages.find(p => p.id === ui.tab) || data.pages[0];
    if (page) ui.tab = page.id;
    const isState = page?.id === "pestado";

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão de obras · inteligência de mercado</p><h1>Mercado EV Brasil</h1>
        <p class="lead">Vendas de elétricos, infraestrutura de recarga e leitura por estado, para orientar a expansão da rede UBY.</p></div>
        <div class="callout"><strong>${esc(data.updated || "Painel de mercado")}</strong><small>Infraestrutura nacional (base ${esc(n.baseInfra || "—")}): ${fmt.int(n.eletropostos)} eletropostos em ${fmt.int(n.municipiosCom)} de ${fmt.int(n.municipiosTotal)} municípios · ${fmt.n1(n.ratio)} veículos plug-in por carregador.</small></div></div>
      <div class="seg" role="tablist" style="margin-bottom:16px;flex-wrap:wrap">${[...data.pages, FROTA].map(p => `<button class="${p.id === ui.tab ? "on" : ""}" data-tab="${esc(p.id)}" type="button">${esc(p.label)}</button>`).join("")}</div>
      ${isFrota ? frotaHtml(target) : `
      ${page.alerts.map(alertBox).join("")}
      ${page.kpis.length ? `<section class="section"><div class="grid g4">${page.kpis.map((k, i) => kpi(k.label, fmtKpi(k), esc(k.note), "", i === 0 ? "lead" : "")).join("")}</div></section>` : ""}
      ${page.insights.length ? `<div class="grid g3" style="margin-bottom:18px">${page.insights.map(x => `<div class="mini"><span class="k">${esc(x.icon)} ${esc(x.label)}</span><strong class="v">${esc(x.value)}</strong><span class="s">${esc(x.note)}</span></div>`).join("")}</div>` : ""}
      ${isState ? statesHtml() : `<div class="grid g2" style="gap:16px;margin-bottom:18px">${page.cards.map(cardHtml).join("")}</div>`}
      ${page.sources.map(s => `<p class="source-line">${esc(s)}</p>`).join("")}
      <p class="source-line">Fonte: painel Mercado EV original (legado/obra-ev/mercado.html). Mesmos números da página original.</p>`}`;

    if (isFrota && frota.data) {
      target.querySelector("#mkFUf").onchange = ev => { ui.fUf = ev.target.value; render(target); };
      target.querySelector("#mkFSort").onchange = ev => { ui.fSort = ev.target.value; render(target); };
      // Busca sem redesenhar a tela (o campo não perde o foco).
      target.querySelector("#mkFq").oninput = ev => { ui.fq = ev.target.value; target.querySelector("#mkFBody").innerHTML = frotaRows(); };
    }
    if (page && !isState) page.cards.forEach((c, i) => {
      const ch = data.charts[c.chart];
      if (!ch) return;
      const round = ["doughnut", "pie", "polarArea"].includes(ch.type);
      const axes = [...new Set(ch.datasets.map(s => s.yAxisID).filter(Boolean))];
      const opts = round ? { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: !c.legend.length, position: "right", labels: { boxWidth: 10, font: { size: 11, family: "Inter" } } } } }
        : UBY.baseChartOptions({ indexAxis: ch.indexAxis });
      if (!round && axes.length > 1) axes.slice(1).forEach(a => { opts.scales[a] = { position: "right", grid: { display: false }, ticks: { font: { size: 10, family: "Inter" }, color: "#68746b" } }; });
      UBY.chart(`mk_${i}`, { type: ch.type, data: { labels: ch.labels, datasets: ch.datasets.map((s, j) => {
        const line = (s.type || ch.type) === "line";
        return { label: s.label, type: s.type || undefined, yAxisID: s.yAxisID || undefined, data: s.data,
          backgroundColor: round ? ch.labels.map((_, k) => PAL[k % PAL.length]) : PAL[j % PAL.length],
          borderColor: round ? "#fffefa" : PAL[j % PAL.length], borderWidth: round ? 2 : line ? 2 : 0,
          borderRadius: round ? 0 : 3, tension: .3, pointRadius: 2, fill: false, order: line ? 0 : 1 };
      }) }, options: opts });
    });
    if (isState) {
      const e = data.estados?.[ui.uf];
      if (e?.bev) UBY.chart("mkState", { type: "bar", data: { labels: Object.keys(e.bev), datasets: [{ label: "BEVs emplacados", data: Object.values(e.bev), backgroundColor: "#187457", borderRadius: 4 }] }, options: UBY.baseChartOptions({ plugins: { legend: { display: false } } }) });
      target.querySelectorAll("tr[data-uf]").forEach(tr => tr.onclick = () => { ui.uf = tr.dataset.uf; render(target); });
      target.querySelector("#mkSort").onchange = ev => { ui.sort = ev.target.value; render(target); };
    }
    target.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
      ui.tab = b.dataset.tab;
      // O endereço acompanha a aba da frota (link direto), sem disparar nova navegação.
      history.replaceState(null, "", ui.tab === FROTA.id ? "#/mercado/pfrota" : "#/mercado");
      render(target);
    });
  }

  UBY.register("mercado", { render });
})();

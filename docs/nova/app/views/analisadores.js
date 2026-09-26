/* Analisadores de energia — relatórios de carga lidos da página original (RELATORIOS). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const BASE = "legado/obra-ev/analisadores/";
  const ui = { search: "" };
  let data = null, error = null, loading = false;

  // Mesmas regras de updateStats() da página original.
  const isComplete = r => !(r.flags || []).some(f => /parciais|estimado/i.test(f));
  const needsAttention = r => r.status !== "ok" || r.fp < 0.92 || (r.flags || []).some(f => /parciais|estimado|baixo|desequil/i.test(f));
  const monthlyMWh = r => r.consumo_dias ? r.consumo_kwh / r.consumo_dias * 30 / 1000 : 0;
  const flagCls = f => /baixo|crítico|critico/i.test(f) ? "bad" : /elevad|desequil|parcia|estimad|necess/i.test(f) ? "warn" : "ok";

  function render(target) {
    if (!data && !error) {
      target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Lendo relatórios dos analisadores</h2></div>`;
      if (!loading) {
        loading = true;
        UBY.legacyRead(BASE + "dashboard.html", w => w.eval("RELATORIOS"), 600)
          .then(d => { data = d; }).catch(err => { error = err.message; })
          .finally(() => { loading = false; if (location.hash.startsWith("#/analisadores")) render(target); });
      }
      return;
    }
    if (error) { target.innerHTML = `<div class="loading"><h2>Não foi possível ler os relatórios</h2><p>${esc(error)}</p></div>`; return; }

    const q = ui.search.trim().toLowerCase();
    const list = data.filter(r => !q || [r.title, r.cliente, r.cidade, ...(r.flags || [])].join(" ").toLowerCase().includes(q));
    const best = data.reduce((b, r) => Math.max(b, r.fp || 0), 0);
    const attention = data.filter(needsAttention);
    const link = (file, label) => file ? `<a class="btn link-btn" href="${BASE}${esc(file)}" target="_blank" rel="noopener">${label} ↗</a>` : "";

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão de obras · engenharia</p><h1>Analisadores de energia</h1>
        <p class="lead">Medições de carga de cada local antes da instalação: pico, fator de potência, demanda, consumo, padrão de entrada atual e proposto e a potência de EV pretendida.</p></div>
        <div class="callout"><strong>${data.length} relatório(s) de análise de carga</strong><small>Cada cartão abre os relatórios completos (carga, elétrico, carregador e resumo técnico).</small></div></div>
      <section class="section"><div class="grid g4">
        ${kpi("Locais analisados", fmt.int(data.length), "relatórios de carga", "", "lead")}
        ${kpi("Relatórios completos", fmt.int(data.filter(isComplete).length), "sem dados parciais ou estimados")}
        ${kpi("Pedem atenção", fmt.int(attention.length), "status, FP < 0,92 ou alertas", "", attention.length ? "warn" : "")}
        ${kpi("Melhor fator de potência", best ? `${fmt.n1(best * 100)}%` : "—", "entre os locais medidos")}
      </div></section>
      <div class="grid g2" style="gap:16px;margin-bottom:18px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Leitura geral</p><h2>Pico medido, demanda e EV pretendido (kW)</h2></div></div><div class="chart-box"><canvas id="chAnal"></canvas></div></section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Leitura geral</p><h2>Fator de potência medido</h2><p>Linha tracejada: mínimo recomendado de 92%.</p></div></div><div class="chart-box"><canvas id="chAnalFp"></canvas></div></section>
      </div>
      <div class="toolbar"><input class="search" id="anSearch" placeholder="Buscar local, cliente, cidade ou alerta" value="${esc(ui.search)}"><button class="btn" id="anNew" type="button">＋ Nova análise</button></div>
      <div class="note" id="anNewHelp" hidden style="margin-bottom:14px"><strong>Para gerar um novo relatório:</strong> anexe o PDF do analisador na conversa do Claude e informe o nome do cliente e a potência do EV. São gerados 3 arquivos — Completo (uso interno), Elétrico (para o dono do imóvel) e Carregador (para o cliente do EV) — e esta tela passa a mostrar o novo local.</div>
      <div class="grid g2" style="gap:16px">
        ${list.map(r => `<article class="panel ${r.status === "ok" ? "dc" : r.status === "danger" ? "partner" : "consolidated"}">
          <div class="panel-head"><div><p class="kicker">${esc(r.cidade)} · ${esc(r.data)}</p><h2>${esc(r.title)}</h2><p>${esc(r.cliente)}</p></div><span class="badge ${r.status === "ok" ? "ok" : r.status === "danger" ? "bad" : "warn"}">${esc(r.statusLabel || r.status)}</span></div>
          <div class="grid g3">
            <div class="mini"><span class="k">Pico</span><strong class="v">${fmt.n1(r.pico_kw)} kW</strong><span class="s">${fmt.n1(r.pico_kva)} kVA</span></div>
            <div class="mini"><span class="k">Fator de potência</span><strong class="v" style="color:${r.fp < 0.92 ? "var(--uby-red)" : "var(--uby-forest)"}">${fmt.n1(r.fp * 100)}%</strong><span class="s">mínimo recomendado 92%</span></div>
            <div class="mini"><span class="k">Demanda</span><strong class="v">${fmt.n1(r.demanda_kw)} kW</strong><span class="s">EV pretendido ${fmt.int(r.ev_kw)} kW</span></div>
            <div class="mini"><span class="k">Consumo</span><strong class="v">${fmt.n1(monthlyMWh(r))} MWh/mês</strong><span class="s">${fmt.kwh0(r.consumo_kwh)} em ${r.consumo_dias} dia(s)</span></div>
            <div class="mini"><span class="k">Padrão de entrada</span><strong class="v">${r.padrao_atual} A → ${r.padrao_proposto} A</strong><span class="s">${r.padrao_proposto > r.padrao_atual ? "aumento necessário" : "sem aumento"}</span></div>
            <div class="mini"><span class="k">Carga com EV</span><strong class="v">${fmt.int((r.pico_kw || 0) + (r.ev_kw || 0))} kW</strong><span class="s">pico atual + EV</span></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin:10px 0">${(r.flags || []).map(f => `<span class="badge ${flagCls(f)}">${esc(f)}</span>`).join("")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${link(r.arquivo, "Completo")}${link(r.arquivo_eletrico, "Elétrico")}${link(r.arquivo_carregador, "Carregador")}${link(r.arquivo_resumo, "Diagnóstico PDF")}</div>
        </article>`).join("") || `<div class="note">Nenhum relatório no filtro.</div>`}
      </div>
      <p class="source-line">Fonte: página original dos analisadores (lista RELATORIOS). Relatórios completos em legado/obra-ev/analisadores/.</p>`;

    const s = target.querySelector("#anSearch");
    s.oninput = () => { ui.search = s.value; clearTimeout(s._t); s._t = setTimeout(() => { render(target); const el = target.querySelector("#anSearch"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
    UBY.chart("chAnal", { type: "bar", data: { labels: data.map(r => r.title), datasets: [
      { label: "Pico medido (kW)", data: data.map(r => r.pico_kw), backgroundColor: "#173c30", borderRadius: 4 },
      { label: "Demanda (kW)", data: data.map(r => r.demanda_kw), backgroundColor: "#3d6f8e", borderRadius: 4 },
      { label: "EV pretendido (kW)", data: data.map(r => r.ev_kw), backgroundColor: "#c6d449", borderRadius: 4 }
    ] }, options: UBY.baseChartOptions() });
    UBY.chart("chAnalFp", { type: "bar", data: { labels: data.map(r => r.title), datasets: [
      { label: "Fator de potência (%)", data: data.map(r => +(r.fp * 100).toFixed(1)), backgroundColor: data.map(r => r.fp < 0.92 ? "#b75450" : "#187457"), borderRadius: 4 },
      { label: "Mínimo recomendado (92%)", type: "line", data: data.map(() => 92), borderColor: "#b98527", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false }
    ] }, options: UBY.baseChartOptions({ scales: { x: { grid: { display: false }, ticks: { font: { size: 10, family: "Inter" }, color: "#68746b", maxRotation: 0, autoSkip: true } }, y: { min: 60, max: 100, ticks: { callback: v => `${v}%`, font: { size: 10, family: "Inter" }, color: "#68746b" } } } }) });
    target.querySelector("#anNew").onclick = () => { const h = target.querySelector("#anNewHelp"); h.hidden = !h.hidden; };
  }

  UBY.register("analisadores", { render });
})();

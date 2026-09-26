/* Gerador de relatórios — Gestão e governança.
   Camada 1: unificado da operação (rede e cotistas). Camada 2: individual por carregador.
   Mais extratos dos cotistas. Prévia na própria tela; abrir em outra aba / imprimir / PDF. */
(function () {
  "use strict";
  const { esc } = UBY;
  const ui = { kind: "unificado", month: "", station: "", investor: "", includeOutside: false, html: "" };

  const TYPES = [
    ["unificado", "Unificado da operação", "Rede inteira: operação por carregador, DRE, impostos, reservas, compensação de prejuízo e repasse de cada cotista."],
    ["carregador", "Individual por carregador", "Um ponto: operação, resultado detalhado (energia, custos, matriz, gestão, área) e destinação conforme o modelo — UBY, parceiro, só gestão ou sociedade."],
    ["todos", "Todos os carregadores", "Um relatório individual por carregador, todos no mesmo documento (uma página cada)."],
    ["cotista", "Extrato do cotista", "Mês a mês de um cotista: pool, cotas habilitadas, valor por cota, repasse, retorno e payback."],
    ["cotistas", "Extratos de todos os cotistas", "Um extrato por cotista no mesmo documento."]
  ];

  function render(target) {
    const months = (UBY.state.months || []).slice().reverse();
    const stations = UBY.data("financeStations");
    const inv = UBY.data("investorDistribution");
    if (!ui.month && ui.kind !== "unificado") ui.month = months[0] || "";
    if (!ui.station && stations.length) { const first = stations.find(s => UBY.isUbyModel(s.model)) || stations[0]; ui.station = `${first.workId}|${first.station}`; }
    if (!ui.investor && inv.investors.length) ui.investor = inv.investors[0].name;
    const needsMonth = ["unificado", "carregador", "todos"].includes(ui.kind);
    const allowAcc = ui.kind === "unificado";
    const type = TYPES.find(t => t[0] === ui.kind);

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança</p><h1>Gerador de relatórios</h1>
        <p class="lead">Relatórios oficiais a partir do motor financeiro auditado: o unificado da operação para a rede e os cotistas, e o individual de cada carregador para acompanhar o ponto ou prestar contas ao parceiro e à área.</p></div>
        <div class="callout"><strong>Prévia para aprovação</strong><small>Os relatórios saem marcados como prévia até a competência ser aprovada/paga. Lance os impostos em Parâmetros e custos antes dos repasses.</small></div></div>
      <div class="toolbar" style="flex-wrap:wrap;gap:10px">
        <div class="seg" id="repKind">${TYPES.map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.kind === v ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">${esc(type[1])}</p><h2>O que entra</h2><p>${esc(type[2])}</p></div></div>
        <div class="toolbar" style="margin:0;flex-wrap:wrap;gap:10px">
          ${needsMonth ? `<label>Competência <select class="select" id="repMonth">${allowAcc ? `<option value="" ${ui.month === "" ? "selected" : ""}>Acumulado</option>` : ""}${months.map(m => `<option value="${m}" ${m === ui.month ? "selected" : ""}>${esc(UBY.state.api.monthName(m))}</option>`).join("")}</select></label>` : ""}
          ${ui.kind === "carregador" ? `<label>Carregador <select class="select" id="repStation">
            <optgroup label="Operação UBY e parceiros">${stations.filter(s => UBY.isUbyModel(s.model)).map(s => `<option value="${esc(`${s.workId}|${s.station}`)}" ${ui.station === `${s.workId}|${s.station}` ? "selected" : ""}>${esc(s.station)}</option>`).join("")}</optgroup>
            <optgroup label="Fora da UBY (só gestão P3 / sociedade)">${stations.filter(s => !UBY.isUbyModel(s.model)).map(s => `<option value="${esc(`${s.workId}|${s.station}`)}" ${ui.station === `${s.workId}|${s.station}` ? "selected" : ""}>${esc(s.station)}</option>`).join("")}</optgroup></select></label>` : ""}
          ${ui.kind === "todos" ? `<label><input type="checkbox" id="repOutside" ${ui.includeOutside ? "checked" : ""}> incluir carregadores fora da UBY</label>` : ""}
          ${ui.kind === "cotista" ? `<label>Cotista <select class="select" id="repInvestor">${inv.investors.map(i => `<option ${ui.investor === i.name ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></label>` : ""}
          <span class="spacer"></span>
          <button class="btn primary" id="repGen" type="button">Gerar prévia</button>
          <button class="btn" id="repOpen" type="button" ${ui.html ? "" : "disabled"}>Abrir em nova aba</button>
          <button class="btn" id="repPrint" type="button" ${ui.html ? "" : "disabled"}>Imprimir / PDF</button>
        </div>
      </section>
      <section class="section" style="padding:0;overflow:hidden">
        ${ui.html ? `<iframe id="repFrame" title="Prévia do relatório" style="width:100%;height:1100px;border:0;background:#eef1ec"></iframe>` : `<div class="note" style="margin:18px">Escolha o tipo e clique em "Gerar prévia".</div>`}
      </section>`;

    const $ = s => target.querySelector(s);
    target.querySelectorAll("#repKind button").forEach(b => b.onclick = () => { ui.kind = b.dataset.v; ui.html = ""; if (ui.kind !== "unificado" && ui.month === "") ui.month = months[0] || ""; render(target); });
    if ($("#repMonth")) $("#repMonth").onchange = e => { ui.month = e.target.value; ui.html = ""; render(target); };
    if ($("#repStation")) $("#repStation").onchange = e => { ui.station = e.target.value; ui.html = ""; render(target); };
    if ($("#repInvestor")) $("#repInvestor").onchange = e => { ui.investor = e.target.value; ui.html = ""; render(target); };
    if ($("#repOutside")) $("#repOutside").onchange = e => { ui.includeOutside = e.target.checked; ui.html = ""; };
    $("#repGen").onclick = () => {
      const [workId, station] = ui.station.split("|");
      try {
        ui.html = UBY.reports.build(ui.kind, { month: ui.month, workId, station, name: ui.investor, includeOutside: ui.includeOutside });
      } catch (err) { ui.html = `<p style="font-family:Inter,Arial;padding:24px">Não foi possível gerar: ${esc(err.message)}</p>`; }
      render(target);
    };
    if ($("#repOpen")) $("#repOpen").onclick = () => UBY.reports.open(ui.html);
    const frame = $("#repFrame");
    if (frame) {
      frame.srcdoc = ui.html;
      frame.onload = () => { try { frame.style.height = Math.max(800, frame.contentDocument.documentElement.scrollHeight + 20) + "px"; } catch (_) {} };
      $("#repPrint").onclick = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) { UBY.reports.open(ui.html); } };
    }
  }

  UBY.register("relatorios", { render });
})();

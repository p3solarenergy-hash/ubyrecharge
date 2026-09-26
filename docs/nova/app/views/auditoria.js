/* Auditoria do motor financeiro — v2 × plataforma original, antes de qualquer número oficial mudar. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { open: "" };

  const signed = v => `${v > 0 ? "+" : ""}${fmt.brl(v)}`;
  const cls = v => (Math.abs(v) < 0.005 ? "neutral" : v > 0 ? "ok" : "bad");
  const pb = m => (m > 0 ? `${fmt.n1(m)} meses` : "—");
  const FLAG_LABEL = {
    "fatura-copiada": "Fatura Copel igual à do mês de origem (copiada ao abrir o mês) — não entra como fatura do mês",
    "fatura-herdada": "Mês sem configuração própria: fatura antiga não é reaproveitada",
    "avulso-herdado": "Custo/receita avulso de outro mês não é reaproveitado",
    "antes-da-primeira-config": "Mês anterior à primeira configuração salva: usa a primeira, não a mais recente"
  };

  function render(target) {
    const full = UBY.state.full;
    const parity = UBY.data("financeV2Parity");
    const impact = UBY.data("financeV2Impact");
    const speed = parity.v2Ms > 0 ? parity.legacyMs / parity.v2Ms : 0;
    const netSpeed = parity.v2NetMs > 0 ? parity.legacyNetMs / parity.v2NetMs : 0;
    const d = impact.all.delta;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança · motor financeiro v2</p><h1>Auditoria do motor financeiro</h1>
        <p class="lead">O motor novo refaz todas as contas da plataforma original. Primeiro prova que chega aos mesmos centavos com a regra antiga; depois mostra, correção por correção, quanto cada ajuste muda o resultado. Nada aqui altera números oficiais nem grava na base.</p></div>
        <div class="callout"><strong>${parity.diffCount === 0 && !parity.netDiffs.length ? "Paridade total com a plataforma original" : "Há diferenças de paridade para revisar"}</strong>
          <small>${fmt.int(parity.checked)} combinações carregador × mês · ${parity.fields} campos cada · ${parity.netMonths} competências da rede${full ? "" : " · histórico completo ainda carregando"}</small></div></div>

      <section class="section"><div class="section-head"><div><p class="kicker">1 · Paridade</p><h2>Motor novo com a regra antiga = plataforma original?</h2>
          <p>Todas as correções desligadas; cada campo comparado ao centavo com financeForCharges() e com o resultado mensal da rede.</p></div></div>
        <div class="grid g4">
          ${kpi("Divergências por carregador", fmt.int(parity.diffCount), parity.diffCount ? "campos acima de R$ 0,005" : "idêntico ao centavo", "", parity.diffCount ? "bad" : "lead")}
          ${kpi("Divergências na rede", fmt.int(parity.netDiffs.length), `${parity.netMonths} competências comparadas`, "", parity.netDiffs.length ? "bad" : "")}
          ${kpi("Velocidade por carregador", speed ? `${fmt.n1(speed)}× mais rápido` : "—", `${fmt.int(parity.legacyMs)} ms → ${fmt.int(parity.v2Ms)} ms`)}
          ${kpi("Velocidade da rede mensal", netSpeed ? `${fmt.n1(netSpeed)}× mais rápido` : "—", `${fmt.int(parity.legacyNetMs)} ms → ${fmt.int(parity.v2NetMs)} ms`)}
        </div>
        ${parity.diffCount ? `<div class="table-wrap" style="margin-top:12px;max-height:280px"><table><thead><tr><th>Carregador</th><th>Mês</th><th>Campo</th><th class="num">Original</th><th class="num">v2</th></tr></thead>
          <tbody>${parity.diffs.map(x => `<tr><td>${esc(x.station)}</td><td>${esc(x.monthKey)}</td><td>${esc(x.field)}</td><td class="num">${fmt.brl(x.legacy)}</td><td class="num">${fmt.brl(x.v2)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${parity.netDiffs.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Competência</th><th class="num">Rede original</th><th class="num">Rede v2</th></tr></thead><tbody>${parity.netDiffs.map(x => `<tr><td>${esc(x.monthKey)}</td><td class="num">${fmt.brl(x.legacy)}</td><td class="num">${fmt.brl(x.v2)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">2 · Impacto total</p><h2>Todas as correções juntas × regra original</h2><p>Acumulado de todas as competências.</p></div></div>
        <div class="grid g5">
          ${[["Resultado da rede", "result"], ["Resultado distribuível", "distributable"], ["Pool dos cotistas", "investorPool"], ["Resultado dos ativos UBY", "ownedNet"], ["Resultado UBY + royalties", "ubyNet"]]
            .map(([l, k]) => kpi(l, fmt.brl(impact.base[k] + d[k]), `original ${fmt.brl(impact.base[k])} · <span class="badge ${cls(d[k])}">${signed(d[k])}</span>`)).join("")}
        </div>
        ${stationTable(impact.stationsAll)}
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">3 · Correção por correção</p><h2>O que cada ajuste muda</h2><p>Cada correção ligada sozinha. Clique para ver os carregadores afetados.</p></div></div>
        <div class="list">${impact.each.map(fx => {
          const dd = fx.delta;
          const moved = Object.values(dd).some(v => Math.abs(v) > 0.005) || fx.stations.length;
          return `<div class="list-row" style="display:block;white-space:normal">
            <button class="btn ghost" data-fix="${esc(fx.key)}" type="button" style="width:100%;display:flex;justify-content:space-between;align-items:center;height:auto;padding:6px 0;border:0;text-align:left">
              <span><strong style="color:var(--uby-ink)">${esc(fx.label)}</strong><br><small>${moved ? `${fx.stations.length} carregador(es) com mudança` : "sem efeito nos dados atuais"}</small></span>
              <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                <span class="badge ${cls(dd.result)}">rede ${signed(dd.result)}</span>
                <span class="badge ${cls(dd.investorPool)}">cotistas ${signed(dd.investorPool)}</span>
                <span class="badge ${cls(dd.ubyNet)}">UBY ${signed(dd.ubyNet)}</span></span></button>
            ${ui.open === fx.key ? stationTable(fx.stations) : ""}</div>`;
        }).join("")}</div>
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">4 · Distribuição</p><h2>Resultado da rede por competência</h2>
            <p>Com a correção, prejuízo acumulado é compensado antes de reservas e cotistas. Início da distribuição: ${esc(impact.distributionStartMonth)} · cota R$ ${fmt.int(impact.quotaValue)} (agora configuráveis).</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Competência</th><th class="num">Resultado</th><th class="num">Prejuízo a compensar</th><th class="num">Distribuível antes</th><th class="num">Distribuível agora</th><th class="num">Cotistas antes</th><th class="num">Cotistas agora</th></tr></thead>
            <tbody>${impact.networkMonths.after.map((m, i) => { const b = impact.networkMonths.before[i] || {}; return `<tr><td>${esc(UBY.state.api.monthName(m.monthKey))}</td><td class="num">${fmt.brl(m.result)}</td><td class="num">${m.carryIn < 0 ? fmt.brl(m.carryIn) : "—"}</td>
              <td class="num">${fmt.brl(b.distributable || 0)}</td><td class="num"><strong>${fmt.brl(m.distributable)}</strong></td><td class="num">${fmt.brl(b.investorPool || 0)}</td><td class="num"><strong>${fmt.brl(m.investorPool)}</strong></td></tr>`; }).join("")}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">5 · Pontos para conferir</p><h2>Alertas encontrados na base</h2></div></div>
          ${impact.flags.length ? `<div class="list" style="max-height:300px;overflow:auto">${impact.flags.map(f => `<div class="list-row" style="display:block;white-space:normal"><strong style="color:var(--uby-ink)">${esc(f.station)}</strong> <small>${esc(UBY.state.api.monthName(f.monthKey))}</small><br>${f.flags.map(x => `<small>• ${esc(FLAG_LABEL[x] || x)}</small>`).join("<br>")}</div>`).join("")}</div>` : `<div class="note">Nenhuma fatura ou avulso reaproveitado de outro mês.</div>`}
          <h3 style="margin:14px 0 6px">Locais com mais de um carregador</h3>
          <p class="source-line" style="margin-top:0">O peso "por potência" divide a potência cadastrada do local entre os carregadores UBY dele. Confira se a potência abaixo é o total do local (ex.: 2 × 7 kW = 14 kW).</p>
          ${impact.multiChargerSites.length ? `<div class="list">${impact.multiChargerSites.map(w => `<div class="list-row" style="display:block;white-space:normal"><strong style="color:var(--uby-ink)">${esc(w.workName)}</strong> · potência cadastrada <strong>${fmt.n1(w.power)} kW</strong><br><small>${w.chargers.map(c => `${esc(c.station)} (${esc(String(c.kind).toUpperCase())}${c.included ? "" : ", fora da UBY"})`).join(" · ")}</small></div>`).join("")}</div>` : `<div class="note">Nenhum local com mais de um carregador.</div>`}
        </section>
      </div>
      <p class="source-line">Motor v2: app/finance-core.js (contas puras) + adaptador em app/motor-api.js (cache por carregador × mês). Regra original: financeForCharges(), matrizCostItemsForRow() e networkUnifiedReportModel() de recargas_app.js.</p>`;

    target.querySelectorAll("[data-fix]").forEach(b => b.onclick = () => { ui.open = ui.open === b.dataset.fix ? "" : b.dataset.fix; render(target); });
  }

  function stationTable(rows) {
    if (!rows.length) return `<div class="note" style="margin-top:10px">Nenhum carregador muda.</div>`;
    const cell = ([a, b], money = true) => { const f = money ? fmt.brl : pb; const dl = b - a; return `<td class="num">${f(a)}${Math.abs(dl) > 0.005 ? `<br><strong>${f(b)}</strong>` : ""}</td>`; };
    return `<div class="table-wrap" style="margin-top:12px;max-height:360px"><table><thead><tr><th>Carregador</th><th class="num">Resultado operação</th><th class="num">Resultado UBY</th><th class="num">Energia</th><th class="num">Matriz</th><th class="num">Payback</th><th class="num">ROI mensal</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><strong>${esc(r.station)}</strong><small>${esc(r.workName || "")} · ${esc(UBY.modelLabel(r.model))}</small></td>${cell(r.operationNet)}${cell(r.ubyNet)}${cell(r.energyCost)}${cell(r.matrizCost)}${cell(r.paybackMonths, false)}
        <td class="num">${fmt.pct1(r.roiMonthly[0])}${Math.abs(r.roiMonthly[1] - r.roiMonthly[0]) > 0.005 ? `<br><strong>${fmt.pct1(r.roiMonthly[1])}</strong>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="source-line">Em cada célula: valor original em cima e, quando muda, o valor corrigido em negrito.</p>`;
  }

  UBY.register("auditoria", { render });
})();

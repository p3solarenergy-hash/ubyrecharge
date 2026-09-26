/* Configuração da rede — todos os carregadores e seus parâmetros vigentes, em uma tabela. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const PUB = "https://p3solarenergy-hash.github.io/ubyrecharge/obra-ev/";
  const basisLabel = b => ({ fixed: "R$/mês", per_kwh: "R$/kWh", revenue_pct: "% fat.", per_session: "R$/recarga" }[b] || b);

  function rulesText(rules) {
    return rules.filter(r => r.value).map(r => `${r.label}: ${r.basis === "revenue_pct" ? fmt.pct1(r.value) : fmt.brl(r.value)}${r.basis && r.basis !== "revenue_pct" ? ` ${basisLabel(r.basis)}` : ""}`).join(" · ");
  }

  function table(rows) {
    return `<div class="table-wrap" style="max-height:none"><table>
      <thead><tr><th>Carregador</th><th>Operação UBY</th><th>Modelo</th><th class="num">Potência</th><th>Funcionamento</th><th class="num">Gestão P3</th><th class="num">Plataforma</th><th class="num">Área</th><th class="num">Royalty UBY</th><th class="num">Tributos</th><th class="num">Energia</th><th class="num">Investimento</th><th>Custos e receitas fixos</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><strong>${esc(r.station)}</strong><small>${esc(r.workName)} · ${esc((r.kind || "").toUpperCase())} · ${fmt.int(r.sessions)} sessões${r.lastDate ? ` · última ${fmt.date(r.lastDate)}` : ""}</small></td>
        <td>${r.included ? '<span class="badge ok">dentro</span>' : '<span class="badge neutral">fora</span>'}<small>${esc(r.ruleSource)}</small></td>
        <td><span class="badge ${UBY.isUbyModel(r.model) ? (r.model === "third_party_management" ? "partner" : "dc") : "neutral"}">${esc(UBY.modelLabel(r.model))}</span></td>
        <td class="num">${r.power ? `${fmt.int(r.power)} kW` : "—"}<small>${[r.layout.dcChargers ? `${r.layout.dcChargers} DC/${r.layout.dcPlugs} plug` : "", r.layout.acChargers ? `${r.layout.acChargers} AC/${r.layout.acPlugs} plug` : ""].filter(Boolean).join(" · ")}</small></td>
        <td style="white-space:normal;min-width:140px">${esc(r.schedule)}${r.operationStart ? `<small>em operação desde ${fmt.date(r.operationStart + "T12:00:00")}</small>` : ""}</td>
        <td class="num">${fmt.pct1(r.managementPct)}</td><td class="num">${fmt.pct1(r.platformPct)}</td>
        <td class="num">${fmt.pct1(r.areaPct)}<small>${r.areaMode === "net" ? "do lucro" : "do faturamento"}</small></td>
        <td class="num">${r.ubyRoyaltyPct ? fmt.pct1(r.ubyRoyaltyPct) : "—"}</td><td class="num">${fmt.pct1(r.taxRatePct)}</td>
        <td class="num">${r.energyCostPerKWh ? `${fmt.brl(r.energyCostPerKWh)}/kWh` : "—"}<small>${esc(r.energyBillingMode)}</small></td>
        <td class="num">${r.investmentValue ? fmt.brl(r.investmentValue) : "—"}${r.investmentValue ? `<small>cotas ${fmt.pct1(r.investorQuotaPct)} · retenção ${fmt.pct1(r.saRetentionPct)}</small>` : ""}</td>
        <td style="white-space:normal;min-width:200px"><small style="color:var(--uby-muted)">${esc(rulesText(r.costRules) || "sem custos fixos")}${r.revenueRules.some(x => x.value) ? `<br>Receitas: ${esc(rulesText(r.revenueRules))}` : ""}</small></td>
        <td><a class="btn link-btn" target="_blank" rel="noopener" href="${PUB}recargas.html?obra=${encodeURIComponent(r.workId)}&openReport=financeiro&station=${encodeURIComponent(r.station)}">Editar ↗</a></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function render(target) {
    const all = UBY.data("networkConfig");
    const uby = all.filter(r => UBY.isUbyModel(r.model) && (r.included || r.sessions));
    const outside = all.filter(r => !uby.includes(r));
    const inOp = uby.filter(r => r.included);
    const month = all[0]?.month;
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança</p><h1>Configuração da rede</h1>
        <p class="lead">Todos os carregadores e os parâmetros que a plataforma usa nos cálculos: inclusão na operação UBY, modelo, horário, percentuais, energia, investimento e custos fixos.</p></div>
        <div class="callout"><strong>Valores vigentes${month ? ` em ${esc(UBY.state.api.monthName(month))}` : ""}</strong><small>Só leitura. Para alterar, use "Editar ↗" na linha do carregador (abre o financeiro da estação na plataforma publicada). Inclusão na operação UBY e horários ficam na aba UBY e na aba Geral da publicada.</small></div></div>

      <section class="section"><div class="grid g4">
        ${kpi("Na operação UBY", fmt.int(inOp.length), `${inOp.filter(r => r.kind === "dc").length} DC · ${inOp.filter(r => r.kind === "ac").length} AC`, "", "lead")}
        ${kpi("Potência instalada UBY", `${fmt.int(inOp.reduce((s, r) => s + r.power, 0))} kW`, "soma por obra dos carregadores na operação")}
        ${kpi("Investimento cadastrado", fmt.brl(uby.reduce((s, r) => s + r.investmentValue, 0)), "ativos UBY")}
        ${kpi("Fora da UBY", fmt.int(outside.length), "só gestão P3, sociedades ou sem base")}
      </div></section>

      <section class="section" style="padding:0;overflow:hidden"><div class="section-head" style="padding:16px 18px 0"><div><p class="kicker">Ativos UBY</p><h2>Carregadores da UBY (${uby.length})</h2></div></div>
        <div style="padding:0 0 4px">${table(uby)}</div></section>

      ${outside.length ? `<details class="section"><summary style="cursor:pointer;font-weight:850;color:var(--uby-forest)">Fora da UBY: ${outside.length} carregador(es) (${esc(outside.map(r => r.station).join(", "))})</summary>
        <p style="margin:10px 0">Carregadores só com gestão P3, sociedades P3 ou sem base de recargas. Ficam aqui para conferência dos parâmetros.</p>${table(outside)}</details>` : ""}

      <p class="source-line">Fonte: configurações financeiras salvas por carregador (obra_recargas_base) e horários de disponibilidade, lidas pelo motor original. Gestão P3, plataforma e área em % do faturamento total; plataforma só sobre recargas e ociosidade.</p>`;
  }

  UBY.register("configuracao", { render });
})();

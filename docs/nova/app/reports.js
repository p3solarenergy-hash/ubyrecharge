/*
  Relatórios de repasse — gerados pelo motor financeiro v2 (números oficiais da nova).
  UBY.reports.competencia("AAAA-MM")  → relatório da competência (DRE, carregadores, impostos, reservas, cotistas)
  UBY.reports.cotista("Nome")         → extrato do cotista (mês a mês, investido, retorno)
  Abrem numa página própria, pronta para imprimir ou salvar em PDF. Nada é gravado.
*/
(function () {
  "use strict";
  const { fmt, esc } = UBY;
  const now = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const signed = v => `${v < 0 ? "−" : ""}${fmt.brl(Math.abs(v))}`;
  const monthName = mk => UBY.state.api.monthName(mk);

  const CSS = `
    *{box-sizing:border-box} body{margin:0;background:#eef1ec;font-family:Inter,Arial,sans-serif;color:#1d2a22;font-size:12.5px}
    .page{max-width:900px;margin:24px auto;background:#fff;border-radius:14px;padding:34px 38px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #00c46a;padding-bottom:16px;margin-bottom:18px}
    .brand{font-weight:900;letter-spacing:.08em;font-size:11px;color:#0a1628;text-transform:uppercase}.brand b{color:#00a85a}
    h1{font-size:22px;margin:6px 0 4px;color:#0a1628} h2{font-size:14px;margin:22px 0 8px;color:#0a1628;text-transform:uppercase;letter-spacing:.05em}
    .sub{color:#5f6b62;font-size:11.5px;line-height:1.5} .badge{display:inline-block;border:1px solid #00a85a;color:#007a44;border-radius:99px;padding:5px 11px;font-weight:800;font-size:11px}
    .badge.draft{border-color:#c98a1b;color:#9a6512}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
    .kpi{border:1px solid #dfe6e0;border-radius:10px;padding:11px 12px;background:#f8faf7}.kpi b{display:block;font-size:17px;color:#0a1628;margin-bottom:3px}.kpi span{font-size:10.5px;color:#5f6b62;text-transform:uppercase;letter-spacing:.03em}
    .kpi.hl{background:#eafaf1;border-color:#9fe0bd}.kpi.hl b{color:#007a44}
    table{width:100%;border-collapse:collapse;margin:4px 0 6px} th{background:#f0f4f1;text-align:left;font-size:10.5px;padding:8px 9px;color:#3d4a41;text-transform:uppercase;letter-spacing:.03em}
    td{padding:8px 9px;border-bottom:1px solid #e6ebe7} td.n,th.n{text-align:right;white-space:nowrap} tr.t td{font-weight:800;background:#f4faf6} tr.s td{color:#5f6b62}
    tr.g td{font-weight:800;padding-top:12px;border-bottom:0;color:#0a1628}
    .note{margin-top:16px;padding:12px 14px;border-radius:10px;background:#fbf7ec;border:1px solid #eedcad;color:#6b5217;font-size:11.5px;line-height:1.5}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:46px}.sign div{border-top:1px solid #9aa59d;padding-top:6px;font-size:11px;color:#5f6b62;text-align:center}
    .foot{margin-top:24px;font-size:10px;color:#8a958c;text-align:center}
    .actions{max-width:900px;margin:18px auto 0;display:flex;gap:8px;justify-content:flex-end}.actions button{border:0;border-radius:8px;padding:9px 14px;font-weight:800;cursor:pointer;background:#0a1628;color:#fff}
    @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;border-radius:0;padding:14mm}.actions{display:none}}`;

  function open(title, body) {
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
      <div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div><div class="page">${body}</div></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const win = window.open(url, "_blank");
    if (!win) alert("O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const header = (title, sub, status) => `<div class="top"><div><div class="brand">UBY <b>Recharge</b> · Relatório financeiro</div><h1>${esc(title)}</h1><div class="sub">${sub}</div></div>
    <span class="badge ${status === "pago" || status === "aprovado" ? "" : "draft"}">${esc(status === "pago" ? "Pago" : status === "aprovado" ? "Aprovado" : "Prévia para aprovação")}</span></div>`;
  const foot = () => `<div class="foot">Gerado em ${now()} pela Nova Plataforma UBY · motor financeiro v2 (regras auditadas em 26/09/2026). Valores em reais.</div>`;

  // ---------- Relatório de repasse da competência ----------
  function competencia(mk) {
    const f = UBY.data("finance", mk), inv = UBY.data("investorDistribution");
    const d = f.dre, p = d.policy;
    const idx = inv.months.findIndex(x => x.key === mk);
    const m = idx >= 0 ? inv.months[idx] : null;
    const row = (label, value, cls = "", note = "") => `<tr class="${cls}"><td>${label}${note ? `<div class="sub">${esc(note)}</div>` : ""}</td><td class="n">${signed(value)}</td></tr>`;
    const investors = inv.investors.filter(i => i.eligibleFrom <= mk).map(i => ({ ...i, value: idx >= 0 ? i.allocations[idx] || 0 : 0 }));
    const body = `${header(`Repasse aos cotistas · ${monthName(mk)}`, `Competência ${esc(monthName(mk))} · ${d.ownedCount} ativo(s) UBY e ${d.partnerCount} parceiro(s) com royalty · ${esc(p.roundLabel || "")}`, m?.status || "pendente")}
      <div class="kpis">
        <div class="kpi"><b>${fmt.brl(d.networkRevenue + d.royalties)}</b><span>Faturamento UBY</span></div>
        <div class="kpi"><b>${signed(d.networkResult)}</b><span>Resultado após impostos</span></div>
        <div class="kpi"><b>${fmt.brl(d.reserve)}</b><span>Reservas</span></div>
        <div class="kpi hl"><b>${fmt.brl(d.investorPool)}</b><span>Pool dos cotistas</span></div>
      </div>
      <h2>Demonstração do resultado</h2>
      <table><tbody>
        <tr class="g"><td colspan="2">Receitas</td></tr>
        ${row("Recargas dos ativos UBY", d.rechargeRevenue)}${d.extraRevenue ? row("Receitas operacionais complementares", d.extraRevenue) : ""}${d.marketing ? row("Marketing e contratos", d.marketing) : ""}${row("Royalties de parceiros", d.royalties)}
        ${row("Faturamento UBY", d.networkRevenue + d.royalties, "t")}
        <tr class="g"><td colspan="2">Custos</td></tr>
        ${row("Energia", -d.energyCost)}${d.directOperation ? row("Operação direta dos carregadores", -d.directOperation) : ""}${d.matrizCost ? row("Custos centrais da matriz (rateio)", -d.matrizCost) : ""}
        ${d.taxes ? row("Tributos por carregador", -d.taxes) : ""}${row("Gestão P3", -d.management)}${d.platform ? row("App / plataforma", -d.platform) : ""}${d.areaParticipation ? row("Participação da área", -d.areaParticipation) : ""}
        ${row("Resultado operacional + royalties", d.operationalResult + d.royalties, "t")}
        ${row(`Impostos sobre o faturamento${m?.taxSource ? ` (${m.taxSource})` : ""}`, -(d.networkTaxes || 0), "", d.networkTaxes ? `base de cálculo: ${fmt.brl(d.networkTaxBase || 0)}` : "nenhum imposto lançado para esta competência")}
        ${row("Resultado após impostos", d.networkResult, "t")}
        <tr class="g"><td colspan="2">Destinação</td></tr>
        ${m && m.carryIn < 0 ? row("Compensação de prejuízo de meses anteriores", m.carryIn, "s") : ""}
        ${row("Resultado distribuível", d.distributable || 0)}
        ${row(`Reserva legal S.A. (${fmt.pct1(p.legalReservePct)})`, -d.legalReserve)}${row(`Fundo de expansão (${fmt.pct1(p.expansionReservePct)})`, -d.expansionReserve)}
        ${row(`Pool dos cotistas (${fmt.pct1(p.investorPct)} após reservas)`, d.investorPool, "t")}
      </tbody></table>
      <h2>Resultado por carregador</h2>
      <table><thead><tr><th>Carregador</th><th>Modelo</th><th class="n">Faturamento</th><th class="n">Custos</th><th class="n">Resultado</th></tr></thead><tbody>
        ${f.rows.map(s => `<tr><td>${esc(s.station)}<div class="sub">${esc(s.workName || "")}</div></td><td>${esc(s.modelLabel)}</td><td class="n">${fmt.brl(s.revenue)}</td><td class="n">${s.partner ? "—" : fmt.brl(s.totalOperatingCost)}</td><td class="n">${s.partner ? `${fmt.brl(s.ubyRoyalty)}<div class="sub">royalty UBY</div>` : signed(s.operationNet)}</td></tr>`).join("") || `<tr><td colspan="5">Sem carregadores com operação na competência.</td></tr>`}
      </tbody></table>
      <h2>Repasse por cotista</h2>
      <table><thead><tr><th>Cotista</th><th class="n">Cotas</th><th class="n">Por cota</th><th class="n">Valor do repasse</th></tr></thead><tbody>
        ${investors.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${i.quotas}</td><td class="n">${fmt.brl(m?.perQuota || 0)}</td><td class="n"><strong>${fmt.brl(i.value)}</strong></td></tr>`).join("") || `<tr><td colspan="4">Nenhum cotista habilitado nesta competência.</td></tr>`}
        <tr class="t"><td>Total</td><td class="n">${m?.eligibleQuotas || 0}</td><td></td><td class="n">${fmt.brl(investors.reduce((s, i) => s + i.value, 0))}</td></tr>
      </tbody></table>
      <div class="note">Cada competência é dividida somente entre as cotas habilitadas no primeiro dia do mês. O lucro só é distribuído depois de cobrir prejuízos de meses anteriores. ${d.networkTaxes ? "" : "<strong>Atenção: não há imposto lançado para esta competência.</strong> "}Confira documentos e aprove antes de pagar.</div>
      <div class="sign"><div>Responsável financeiro · UBY Recharge</div><div>Aprovação</div></div>${foot()}`;
    open(`Repasse ${monthName(mk)}`, body);
  }

  // ---------- Extrato do cotista ----------
  function cotista(name) {
    const inv = UBY.data("investorDistribution");
    const i = inv.investors.find(x => x.name === name);
    if (!i) { alert("Cotista não encontrado."); return; }
    const rows = inv.months.map((m, k) => ({ m, value: i.allocations[k] || 0 })).filter(r => r.m.key >= i.eligibleFrom);
    const body = `${header(`Extrato do cotista · ${i.name}`, `${i.quotas} cota(s) a ${fmt.brl(i.quotaValue)} · investido ${fmt.brl(i.investment)} · habilitado desde ${esc(monthName(i.eligibleFrom))}`, i.status)}
      <div class="kpis">
        <div class="kpi"><b>${fmt.brl(i.investment)}</b><span>Investido</span></div>
        <div class="kpi hl"><b>${fmt.brl(i.due)}</b><span>Total a receber</span></div>
        <div class="kpi"><b>${fmt.pct(i.returnRate * 100)}</b><span>Retorno acumulado</span></div>
        <div class="kpi"><b>${i.annualized ? fmt.pct(i.annualized * 100) : "—"}</b><span>Retorno anualizado</span></div>
      </div>
      <h2>Mês a mês</h2>
      <table><thead><tr><th>Competência</th><th class="n">Resultado da rede</th><th class="n">Pool dos cotistas</th><th class="n">Cotas habilitadas</th><th class="n">Valor por cota</th><th class="n">Seu repasse</th><th>Situação</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.m.label)}</td><td class="n">${signed(r.m.result)}</td><td class="n">${fmt.brl(r.m.investorPool)}</td><td class="n">${r.m.eligibleQuotas}</td><td class="n">${fmt.brl(r.m.perQuota)}</td><td class="n"><strong>${fmt.brl(r.value)}</strong></td><td>${esc(r.m.status)}</td></tr>`).join("") || `<tr><td colspan="7">Sem competências desde a habilitação.</td></tr>`}
        <tr class="t"><td>Total</td><td></td><td></td><td></td><td></td><td class="n">${fmt.brl(i.due)}</td><td></td></tr>
      </tbody></table>
      <div class="note">O resultado da rede já considera energia, custos dos carregadores, custos centrais, gestão, impostos sobre o faturamento e a compensação de prejuízos anteriores. Reserva legal e fundo de expansão são descontados antes do pool dos cotistas.${i.paybackYears ? ` Payback indicativo no ritmo atual: ${fmt.n1(i.paybackYears)} anos.` : ""}</div>${foot()}`;
    open(`Extrato ${i.name}`, body);
  }

  UBY.reports = { competencia, cotista };
})();

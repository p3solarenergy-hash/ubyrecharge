/*
  Gerador de relatórios — números do motor financeiro v2 (oficiais da nova).
  Duas camadas:
    • Unificado da operação: rede inteira, todos os carregadores e cotistas (mês ou acumulado).
    • Individual por carregador: operação, resultado e destinação conforme o modelo do ponto.
  Mais o extrato do cotista. Tudo só leitura; a página sai pronta para imprimir/PDF.

  UBY.reports.build(tipo, opções) → HTML completo  (tipo: "unificado" | "carregador" | "todos" | "cotista")
  UBY.reports.unificado(mês) · carregador(obra, estação, mês) · todosCarregadores(mês) · cotista(nome)
  UBY.reports.competencia(mês) continua existindo (= unificado do mês).
*/
(function () {
  "use strict";
  const { fmt, esc } = UBY;
  const now = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const signed = v => `${v < 0 ? "−" : ""}${fmt.brl(Math.abs(v || 0))}`;
  const monthName = mk => (mk ? UBY.state.api.monthName(mk) : "Acumulado");
  const n = v => Number(v || 0);

  const CSS = `
    *{box-sizing:border-box} body{margin:0;background:#eef1ec;font-family:Inter,Arial,sans-serif;color:#1d2a22;font-size:12.5px}
    .page{max-width:900px;margin:24px auto;background:#fff;border-radius:14px;padding:34px 38px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #00c46a;padding-bottom:16px;margin-bottom:18px}
    .brand{font-weight:900;letter-spacing:.08em;font-size:11px;color:#0a1628;text-transform:uppercase}.brand b{color:#00a85a}
    h1{font-size:22px;margin:6px 0 4px;color:#0a1628} h2{font-size:13.5px;margin:22px 0 8px;color:#0a1628;text-transform:uppercase;letter-spacing:.05em}
    .sub{color:#5f6b62;font-size:11.5px;line-height:1.5} .badge{display:inline-block;border:1px solid #00a85a;color:#007a44;border-radius:99px;padding:5px 11px;font-weight:800;font-size:11px;white-space:nowrap}
    .badge.draft{border-color:#c98a1b;color:#9a6512}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
    .kpi{border:1px solid #dfe6e0;border-radius:10px;padding:11px 12px;background:#f8faf7}.kpi b{display:block;font-size:16.5px;color:#0a1628;margin-bottom:3px}.kpi span{font-size:10.5px;color:#5f6b62;text-transform:uppercase;letter-spacing:.03em}
    .kpi small{display:block;color:#5f6b62;font-size:10.5px;margin-top:2px}
    .kpi.hl{background:#eafaf1;border-color:#9fe0bd}.kpi.hl b{color:#007a44}
    table{width:100%;border-collapse:collapse;margin:4px 0 6px} th{background:#f0f4f1;text-align:left;font-size:10px;padding:8px 8px;color:#3d4a41;text-transform:uppercase;letter-spacing:.03em}
    td{padding:7px 8px;border-bottom:1px solid #e6ebe7;vertical-align:top} td.n,th.n{text-align:right;white-space:nowrap} tr.t td{font-weight:800;background:#f4faf6} tr.s td{color:#5f6b62}
    tr.g td{font-weight:800;padding-top:12px;border-bottom:0;color:#0a1628}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .note{margin-top:16px;padding:12px 14px;border-radius:10px;background:#fbf7ec;border:1px solid #eedcad;color:#6b5217;font-size:11.5px;line-height:1.5}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:46px}.sign div{border-top:1px solid #9aa59d;padding-top:6px;font-size:11px;color:#5f6b62;text-align:center}
    .foot{margin-top:24px;font-size:10px;color:#8a958c;text-align:center}
    .actions{max-width:900px;margin:18px auto 0;display:flex;gap:8px;justify-content:flex-end}.actions button{border:0;border-radius:8px;padding:9px 14px;font-weight:800;cursor:pointer;background:#0a1628;color:#fff}
    @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;border-radius:0;padding:12mm;break-after:page}.page:last-child{break-after:auto}.actions{display:none}}`;

  // O título vira o nome do arquivo ao salvar em PDF: "Relatório - CENTRAL JK - Set-2026".
  // Sem "UBY RECHARGE - " repetido e sem "/" (o navegador cortava o nome na barra do mês).
  // Padrão: "UBY Recharge — Prestação de contas - Central JK - 09-26" (tipo, local, mês-ano).
  const placeName = s => String(s || "").replace(/^\s*UBY RECHARGE\s*-\s*/i, "").trim().toLowerCase()
    .replace(/(^|\s)(\S+)/g, (m, sp, w) => sp + (w.replace(/\./g, "").length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)));
  const mmYY = mk => /^\d{4}-\d{2}$/.test(mk || "") ? `${mk.slice(5, 7)}-${mk.slice(2, 4)}` : "Acumulado";
  const fileTitle = (type, place, mk) => [`UBY Recharge — ${type}`, place ? placeName(place) : "", mmYY(mk)].filter(Boolean).map(p => p.replace(/[\\/:*?"<>|]+/g, "-")).join(" - ");
  function doc(title, pages) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
      <div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div>${pages.map(p => `<div class="page">${p}</div>`).join("")}</body></html>`;
  }
  function open(html) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const win = window.open(url, "_blank");
    if (!win) alert("O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.");
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  const header = (title, sub, status) => `<div class="top"><div><div class="brand">UBY <b>Recharge</b> · Relatório</div><h1>${esc(title)}</h1><div class="sub">${sub}</div></div>
    <span class="badge ${status === "pago" || status === "aprovado" ? "" : "draft"}">${esc(status === "pago" ? "Pago" : status === "aprovado" ? "Aprovado" : "Prévia para aprovação")}</span></div>`;
  const foot = () => `<div class="foot">Gerado em ${now()} pela Nova Plataforma UBY · motor financeiro v2 (regras auditadas em 26/09/2026). Valores em reais.</div>`;
  const kpi = (label, value, small = "", hl = false) => `<div class="kpi ${hl ? "hl" : ""}"><b>${value}</b><span>${esc(label)}</span>${small ? `<small>${small}</small>` : ""}</div>`;
  const row = (label, value, cls = "", note = "") => `<tr class="${cls}"><td>${label}${note ? `<div class="sub">${esc(note)}</div>` : ""}</td><td class="n">${signed(value)}</td></tr>`;

  // ---------------------------------------------------------------- unificado
  function pageUnificado(mk, until) {
    const acc = !mk;
    // Consolidado "do início até o fechamento de X": o motor calcula só até X (teto de competência).
    const capped = until && acc ? UBY.state.api.withUntil(until, () => ({ f: UBY.state.api.finance(""), inv: UBY.state.api.investorDistribution(), cmd: UBY.state.api.command("") })) : null;
    const f = capped ? capped.f : UBY.data("finance", mk || ""), inv = capped ? capped.inv : UBY.data("investorDistribution"), cmd = capped ? capped.cmd : UBY.data("command", mk || "");
    const d = f.dre, p = d.policy;
    const idx = acc ? -1 : inv.months.findIndex(x => x.key === mk);
    const m = idx >= 0 ? inv.months[idx] : null;
    const units = cmd.units || [];
    const sessions = units.reduce((s, u) => s + n(u.sessions), 0), energy = units.reduce((s, u) => s + n(u.energy), 0);
    const cotistas = acc ? inv.investors.map(i => ({ ...i, value: i.due })) : inv.investors.filter(i => i.eligibleFrom <= mk).map(i => ({ ...i, value: idx >= 0 ? i.allocations[idx] || 0 : 0 }));
    const monthsRows = inv.months.filter(x => acc || x.key === mk);
    const status = acc ? "pendente" : (m?.status || "pendente");
    const approval = !acc && m?.approvedAt ? ` · aprovado em ${fmt.dt(m.approvedAt)}${m.approvedBy ? ` por ${esc(m.approvedBy)}` : ""}${m.paidAt ? ` · pago em ${fmt.date(m.paidAt + "T12:00:00")}` : ""}` : "";
    const changed = !acc && m?.snapshot && (Math.abs(n(m.snapshot.investorPool) - n(m.investorPool)) > 0.009 || Math.abs(n(m.snapshot.result) - n(m.result)) > 0.009);
    return `${header(`Relatório unificado da operação · ${capped ? `consolidado do início até o fechamento de ${monthName(until)}` : monthName(mk)}`,`${d.ownedCount} ativo(s) UBY e ${d.partnerCount} parceiro(s) com royalty · ${inv.investors.length} cotista(s) · ${esc(p.roundLabel || "")}${acc ? ` · ${inv.months.length} competência(s) de distribuição` : ""}${approval}`, status)}
      ${changed ? `<div class="note" style="border-color:#e0a4a0;background:#fdf0ef;color:#8a2f2a"><strong>Os números mudaram depois da aprovação.</strong> Aprovado: resultado ${signed(m.snapshot.result)} · pool ${fmt.brl(m.snapshot.investorPool)} (${fmt.brl(m.snapshot.perQuota)} por cota). Agora: resultado ${signed(m.result)} · pool ${fmt.brl(m.investorPool)}. Revise em Parâmetros e custos → Fechamentos.</div>` : ""}
      <div class="kpis">
        ${kpi("Faturamento UBY", fmt.brl(d.networkRevenue + d.royalties), `${fmt.int(sessions)} recargas · ${fmt.kwh0(energy)}`)}
        ${kpi("Resultado após impostos", signed(d.networkResult), d.taxesTotal ? `impostos do período ${fmt.brl(d.taxesTotal)}` : "sem imposto lançado")}
        ${kpi("Reservas", fmt.brl(d.reserve), `legal ${fmt.pct1(p.legalReservePct)} · expansão ${fmt.pct1(p.expansionReservePct)}`)}
        ${kpi("Pool dos cotistas", fmt.brl(d.investorPool), acc ? "soma das competências" : `${fmt.brl(m?.perQuota || 0)} por cota`, true)}
      </div>
      <h2>Operação por carregador</h2>
      <table><thead><tr><th>Carregador</th><th>Modelo</th><th class="n">Recargas</th><th class="n">Clientes</th><th class="n">Energia</th><th class="n">Faturamento</th><th class="n">Ocupação</th></tr></thead><tbody>
        ${units.map(u => `<tr><td>${esc(u.station)}<div class="sub">${esc(u.workName || "")}</div></td><td>${esc(UBY.modelLabel(u.model))}</td><td class="n">${fmt.int(u.sessions)}</td><td class="n">${fmt.int(u.clients)}</td><td class="n">${fmt.kwh0(u.energy)}</td><td class="n">${fmt.brl(u.revenue)}</td><td class="n">${fmt.pct1(u.occupancy)}</td></tr>`).join("") || `<tr><td colspan="7">Sem operação no período.</td></tr>`}
        <tr class="t"><td>Total</td><td></td><td class="n">${fmt.int(sessions)}</td><td></td><td class="n">${fmt.kwh0(energy)}</td><td class="n">${fmt.brl(units.reduce((s, u) => s + n(u.revenue), 0))}</td><td></td></tr>
      </tbody></table>
      <h2>Demonstração do resultado da rede</h2>
      <table><tbody>
        <tr class="g"><td colspan="2">Receitas</td></tr>
        ${row("Recargas dos ativos UBY", d.rechargeRevenue)}${d.extraRevenue ? row("Receitas operacionais complementares", d.extraRevenue) : ""}${d.marketing ? row("Marketing e contratos", d.marketing) : ""}${row("Royalties de parceiros", d.royalties)}
        ${row("Faturamento UBY", d.networkRevenue + d.royalties, "t")}
        <tr class="g"><td colspan="2">Custos</td></tr>
        ${row("Energia", -d.energyCost)}${d.directOperation ? row("Operação direta dos carregadores", -d.directOperation) : ""}${d.matrizCost ? row("Custos centrais da matriz (rateio)", -d.matrizCost) : ""}
        ${d.taxes ? row("Tributos por carregador", -d.taxes) : ""}${row("Gestão P3", -d.management)}${d.platform ? row("App / plataforma", -d.platform) : ""}${d.areaParticipation ? row("Participação da área", -d.areaParticipation) : ""}
        ${row("Resultado operacional + royalties", d.operationalResult + d.royalties, "t")}
        ${row(d.taxes ? "Impostos restantes (royalties e ajuste à guia)" : `Impostos sobre o faturamento${m?.taxSource ? ` (${m.taxSource})` : ""}`, -(d.networkTaxes || 0), "",
          d.taxesTotal ? `total de impostos do período: ${fmt.brl(d.taxesTotal)}${m?.taxSource ? ` (${m.taxSource})` : ""} sobre ${fmt.brl(d.networkTaxBase || 0)} faturados${d.taxes ? ` · ${fmt.brl(d.taxes)} já descontados em "Tributos por carregador"` : ""}` : "nenhum imposto lançado no período")}
        ${row("Resultado após impostos", d.networkResult, "t")}
        <tr class="g"><td colspan="2">Destinação</td></tr>
        ${!acc && m && m.carryIn < 0 ? row("Compensação de prejuízo de meses anteriores", m.carryIn, "s") : ""}
        ${row("Resultado distribuível", d.distributable || 0)}
        ${row(`Reserva legal S.A. (${fmt.pct1(p.legalReservePct)})`, -d.legalReserve)}${row(`Fundo de expansão (${fmt.pct1(p.expansionReservePct)})`, -d.expansionReserve)}
        ${row(`Pool dos cotistas (${fmt.pct1(p.investorPct)} após reservas)`, d.investorPool, "t")}
      </tbody></table>
      <h2>Resultado por carregador</h2>
      <table><thead><tr><th>Carregador</th><th>Modelo</th><th class="n">Faturamento</th><th class="n">Custos</th><th class="n">Resultado</th><th class="n">Margem</th></tr></thead><tbody>
        ${f.rows.map(s => `<tr><td>${esc(s.station)}</td><td>${esc(s.modelLabel)}</td><td class="n">${fmt.brl(s.revenue)}</td><td class="n">${s.partner ? "—" : fmt.brl(s.totalOperatingCost)}</td><td class="n">${s.partner ? `${fmt.brl(s.ubyRoyalty)}<div class="sub">royalty UBY</div>` : signed(s.operationNet)}</td><td class="n">${s.partner ? "—" : fmt.pct1(s.operationMargin)}</td></tr>`).join("") || `<tr><td colspan="6">Sem carregadores no período.</td></tr>`}
      </tbody></table>
      <h2>${acc ? "Evolução por competência" : "Competência"}</h2>
      <table><thead><tr><th>Competência</th><th class="n">Antes dos impostos</th><th class="n">Impostos</th><th class="n">Resultado</th><th class="n">Prejuízo compensado</th><th class="n">Pool cotistas</th><th class="n">Cotas</th><th class="n">Por cota</th><th>Situação</th></tr></thead><tbody>
        ${monthsRows.map(x => `<tr><td>${esc(x.label)}</td><td class="n">${signed(x.preTax ?? x.result)}</td><td class="n">${x.taxes ? fmt.brl(x.taxes) : "—"}</td><td class="n">${signed(x.result)}</td><td class="n">${x.carryIn < 0 ? signed(x.carryIn) : "—"}</td><td class="n">${fmt.brl(x.investorPool)}</td><td class="n">${x.eligibleQuotas}</td><td class="n">${fmt.brl(x.perQuota)}</td><td>${esc(x.status)}</td></tr>`).join("") || `<tr><td colspan="9">Competência fora do período de distribuição (a partir de ${esc(monthName(inv.distributionStartMonth))}).</td></tr>`}
      </tbody></table>
      <h2>Repasse por cotista</h2>
      <table><thead><tr><th>Cotista</th><th class="n">Cotas</th><th class="n">Valor da cota</th><th class="n">Investido</th>${acc ? `<th class="n">Retorno acum.</th>` : `<th class="n">Por cota</th>`}<th class="n">${acc ? "Total a receber" : "Repasse do mês"}</th></tr></thead><tbody>
        ${cotistas.map(i => `<tr><td>${esc(i.name)}<div class="sub">${i.waitingOperation ? "aguardando operação de "+esc(i.linkedStation) : "desde "+esc(monthName(i.eligibleFrom))}</div></td><td class="n">${i.quotas}</td><td class="n">${fmt.brl(i.quotaValue)}</td><td class="n">${fmt.brl(i.investment)}</td><td class="n">${acc ? fmt.pct(i.returnRate * 100) : fmt.brl(m?.perQuota || 0)}</td><td class="n"><strong>${fmt.brl(i.value)}</strong></td></tr>`).join("") || `<tr><td colspan="6">Nenhum cotista habilitado.</td></tr>`}
        <tr class="t"><td>Total</td><td class="n">${cotistas.reduce((s, i) => s + n(i.quotas), 0)}</td><td></td><td class="n">${fmt.brl(cotistas.reduce((s, i) => s + n(i.investment), 0))}</td><td></td><td class="n">${fmt.brl(cotistas.reduce((s, i) => s + n(i.value), 0))}</td></tr>
      </tbody></table>
      <div class="note">Cada competência é dividida somente entre as cotas habilitadas no primeiro dia do mês. O lucro só é distribuído depois de cobrir prejuízos de meses anteriores. Carregadores só de gestão P3 ficam fora do resultado da UBY; parceiros entram apenas pelo royalty. ${d.taxesTotal ? "" : "<strong>Atenção: não há imposto lançado no período.</strong> "}Confira documentos e aprove antes de pagar.</div>
      <div class="sign"><div>Responsável financeiro · UBY Recharge</div><div>Aprovação</div></div>${foot()}`;
  }

  // ---------------------------------------------------------------- individual
  function pageCarregador(workId, station, mk) {
    const s = UBY.data("stationFinance", workId, station, mk);
    if (!s || !s.finance) return `${header(`Relatório do carregador · ${station}`, "Sem competência com operação para este carregador.", "pendente")}${foot()}`;
    const f = s.finance, st = s.settings || {};
    let u = null;
    try { u = UBY.data("usage", { kind: "station", workId, station, monthKey: s.monthKey }).kpis; } catch (_) {}
    const model = f.model;
    const opRevenue = s.revenueLines.filter(l => l.scope !== "non_operational"), mkt = s.revenueLines.filter(l => l.scope === "non_operational");
    // Custo lançado na matriz para um carregador só (ex.: seguro) aparece como custo dele, não como rateio.
    const localCosts = s.costLines.filter(l => !l.matrix || l.dedicated), matrix = s.costLines.filter(l => l.matrix && !l.dedicated);
    const dest = {
      uby: () => row("Resultado do ponto para a UBY", f.ubyNet, "t"),
      hybrid: () => dest.uby() + (f.p3SocietyProfit ? row("Participação P3 (sociedade AC/DC)", f.p3SocietyProfit) : ""),
      third_party_management: () => `${row("Royalty de marca UBY", f.ubyRoyalty)}${row("Gestão P3", f.management)}${row("Resultado do parceiro (repasse)", f.partnerShare, "t")}`,
      management_only: () => `${row("Gestão P3", f.management)}${row("Resultado do parceiro (repasse)", f.partnerShare, "t")}`,
      p3_society: () => `${row("Gestão P3", f.management)}${row("Participação P3 na sociedade", f.p3SocietyProfit)}${row("Participação do sócio (repasse)", f.partnerShare, "t")}`
    };
    return `${header(`Relatório do carregador · ${s.station}`, `${esc(s.workName)} · ${esc(s.modelLabel)} · competência ${esc(monthName(s.monthKey))}`, "pendente")}
      <div class="kpis">
        ${kpi("Faturamento", fmt.brl(f.totalRevenue || f.revenue), `${fmt.int(u?.validSessions ?? u?.sessions ?? 0)} recargas · ${fmt.int(u?.clients ?? 0)} clientes`)}
        ${kpi("Energia entregue", fmt.kwh0(f.energy), u ? `ocupação ${fmt.pct1(u.occupancy)}` : "")}
        ${kpi("Custos totais", fmt.brl(f.totalOperatingCost), f.totalCostPerKWh ? `${fmt.brl(f.totalCostPerKWh)}/kWh` : "")}
        ${kpi(model === "third_party_management" ? "Repasse ao parceiro" : "Resultado do ponto", signed(model === "third_party_management" || model === "management_only" ? f.partnerShare : f.operationNet), f.operationMargin ? `margem ${fmt.pct1(f.operationMargin)}` : "", true)}
      </div>
      ${u ? `<h2>Operação</h2><div class="two"><table><tbody>
          <tr><td>Recargas</td><td class="n">${fmt.int(u.validSessions)}</td></tr><tr><td>Clientes</td><td class="n">${fmt.int(u.clients)}</td></tr>
          <tr><td>Energia por recarga</td><td class="n">${fmt.n1(u.avgKwh)} kWh</td></tr></tbody></table>
        <table><tbody>
          <tr><td>Ocupação real</td><td class="n">${fmt.pct1(u.occupancy)}</td></tr><tr><td>Ticket médio</td><td class="n">${fmt.brl(u.avgTicket)}</td></tr>
          <tr><td>Preço médio</td><td class="n">${fmt.brl(u.revPerKwh)}/kWh</td></tr><tr><td>Tempo médio</td><td class="n">${fmt.hours(u.avgDuration)}</td></tr>
          <tr><td>Ociosidade cobrada</td><td class="n">${fmt.brl(u.idleValue)}</td></tr></tbody></table></div>` : ""}
      <h2>Demonstração do resultado do ponto</h2>
      <table><tbody>
        <tr class="g"><td colspan="2">Receitas</td></tr>
        ${row("Recargas", f.revenue)}${opRevenue.map(l => row(esc(l.label), l.actual)).join("")}${mkt.map(l => row(`${esc(l.label)} (marketing)`, l.actual)).join("")}
        ${row("Faturamento total", f.totalRevenue || f.revenue, "t")}
        <tr class="g"><td colspan="2">Custos</td></tr>
        ${row("Energia", -f.energyCost)}
        ${localCosts.map(l => row(esc(l.label), -l.actual)).join("")}
        ${matrix.map(l => row(`${esc(l.label)} (matriz)`, -l.actual, "", l.rule)).join("")}
        ${f.taxes ? row(`Impostos (${(f.revenue ? f.taxes / f.revenue * 100 : st.taxRatePct).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`, -f.taxes) : ""}
        ${row(`Gestão P3 (${fmt.pct1(st.managementPct)}${model === "third_party_management" || model === "management_only" ? " do líquido" : ""})`, -f.management)}${f.platform ? row(`App / plataforma (${fmt.pct1(st.platformPct)})`, -f.platform) : ""}
        ${f.areaParticipation ? row(`Participação da área (${fmt.pct1(f.areaSharePct)})`, -f.areaParticipation) : ""}${f.ubyRoyalty ? row(`Royalty de marca UBY (${fmt.pct1(st.ubyRoyaltyPct)} do líquido)`, -f.ubyRoyalty) : ""}
        ${row("Resultado operacional do ponto", f.operationNet, "t")}
        <tr class="g"><td colspan="2">Destinação</td></tr>
        ${(dest[model] || dest.uby)()}
      </tbody></table>
      ${(() => {
        // Evolução até a competência do relatório; % = resultado ÷ valor investido (no mês e no acumulado).
        const inv = n(s.returns?.investment || f.investmentValue);
        const list = s.monthly.filter(x => x.key <= s.monthKey);
        const sum = k => list.reduce((a, x) => a + n(x[k]), 0);
        const pct = v => inv > 0 ? fmt.pct(v / inv * 100) : "—";
        const accResult = sum("paybackBase");
        return `${inv ? `<h2>Valor investido</h2><table><tbody><tr><td>Investimento no ponto</td><td class="n">${fmt.brl(inv)}</td></tr></tbody></table>` : ""}
      <h2>Evolução mensal do ponto</h2>
      <table><thead><tr><th>Competência</th><th class="n">Energia</th><th class="n">Faturamento</th><th class="n">Custos</th><th class="n">Resultado</th>${inv ? `<th class="n">% do investido</th>` : ""}</tr></thead><tbody>
        ${list.map(x => `<tr class="${x.key === s.monthKey ? "t" : ""}"><td>${esc(x.label)}</td><td class="n">${fmt.kwh0(x.energy)}</td><td class="n">${fmt.brl(x.totalRevenue || x.revenue)}</td><td class="n">${fmt.brl(x.totalOperatingCost)}</td><td class="n">${signed(x.operationNet)}</td>${inv ? `<td class="n">${pct(n(x.paybackBase))}</td>` : ""}</tr>`).join("")}
        <tr class="t"><td>Acumulado</td><td class="n">${fmt.kwh0(sum("energy"))}</td><td class="n">${fmt.brl(list.reduce((a, x) => a + n(x.totalRevenue || x.revenue), 0))}</td><td class="n">${fmt.brl(sum("totalOperatingCost"))}</td><td class="n">${signed(sum("operationNet"))}</td>${inv ? `<td class="n">${pct(accResult)}</td>` : ""}</tr>
      </tbody></table>`;
      })()}
      ${(s.flags || []).includes("fatura-copiada") ? `<div class="note">A fatura de energia desta competência era cópia do mês anterior; o custo foi calculado por kWh × tarifa até a fatura real ser lançada.</div>` : ""}
      <div class="sign"><div>Responsável · UBY Recharge</div><div>${model === "third_party_management" || model === "management_only" || model === "p3_society" ? "Parceiro" : "Aprovação"}</div></div>${foot()}`;
  }

  // ---------------------------------------------------------------- cotista
  function pageCotista(name) {
    const inv = UBY.data("investorDistribution");
    const i = inv.investors.find(x => x.name === name);
    if (!i) return `${header("Extrato do cotista", "Cotista não encontrado.", "pendente")}${foot()}`;
    const rows = inv.months.map((m, k) => ({ m, value: i.allocations[k] || 0 })).filter(r => r.m.key >= i.eligibleFrom);
    return `${header(`Extrato do cotista · ${i.name}`, `${i.quotas} cota(s) a ${fmt.brl(i.quotaValue)} · investido ${fmt.brl(i.investment)} · ${i.waitingOperation ? "aguardando início da operação de "+esc(i.linkedStation) : "habilitado desde "+esc(monthName(i.eligibleFrom))}`, i.status)}
      <div class="kpis">
        ${kpi("Investido", fmt.brl(i.investment))}${kpi("Total a receber", fmt.brl(i.due), "", true)}
        ${kpi("Retorno acumulado", fmt.pct(i.returnRate * 100))}${kpi("Retorno anualizado", i.annualized ? fmt.pct(i.annualized * 100) : "—")}
      </div>
      <h2>Mês a mês</h2>
      <table><thead><tr><th>Competência</th><th class="n">Resultado da rede</th><th class="n">Pool dos cotistas</th><th class="n">Cotas habilitadas</th><th class="n">Valor por cota</th><th class="n">Seu repasse</th><th>Situação</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.m.label)}</td><td class="n">${signed(r.m.result)}</td><td class="n">${fmt.brl(r.m.investorPool)}</td><td class="n">${r.m.eligibleQuotas}</td><td class="n">${fmt.brl(r.m.perQuota)}</td><td class="n"><strong>${fmt.brl(r.value)}</strong></td><td>${esc(r.m.status)}</td></tr>`).join("") || `<tr><td colspan="7">Sem competências desde a habilitação.</td></tr>`}
        <tr class="t"><td>Total</td><td></td><td></td><td></td><td></td><td class="n">${fmt.brl(i.due)}</td><td></td></tr>
      </tbody></table>
      <div class="note">O resultado da rede já considera energia, custos dos carregadores, custos centrais, gestão, impostos sobre o faturamento e a compensação de prejuízos anteriores. Reserva legal e fundo de expansão são descontados antes do pool dos cotistas.${i.paybackYears ? ` Payback indicativo no ritmo atual: ${fmt.n1(i.paybackYears)} anos.` : ""}</div>${foot()}`;
  }

  // ---------------------------------------------------------------- área (dono do local)
  // Prestação de contas ao parceiro da área: reembolso da energia (kWh vendidos ×
  // tarifa, quando o ponto usa a energia do local) + participação sobre o faturamento.
  function pageArea(workId, station, mk) {
    const a = UBY.state.api.areaAccount(workId, station);
    if (!a || !a.months.length) return `${header("Prestação de contas do ponto", "Sem competência com operação para este ponto.", "pendente")}${foot()}`;
    const m = a.months.find(x => x.key === mk) || a.months[a.months.length - 1];
    const upTo = a.months.filter(x => x.key <= m.key);
    // Acumulado pela soma dos valores exatos, arredondada uma vez (como nos relatórios já enviados).
    const sum = k => { const exact = { reimbursement: "reimbursementExact", area: "areaExact" }[k]; return Math.round(upTo.reduce((s, x) => s + n(exact && x[exact] !== undefined ? x[exact] : x[k]), 0) * 100) / 100; };
    const d = iso => iso ? fmt.date(iso) : "—";
    return `<div class="sub" style="margin-bottom:10px"><strong>UBY RECHARGE LTDA</strong> · CNPJ 66.737.561/0001-86 · Londrina - PR</div>
      ${header("Prestação de contas do ponto", `${esc(a.workName)} · parceiro da área: <strong>${esc(a.config.payee)}</strong><br>Período do relatório: <strong>${d(m.periodStart)} a ${d(m.periodEnd)}</strong> · competência ${esc(m.label)}`, m.paidAt ? "pago" : "aprovado")}
      <div class="kpis">
        ${kpi("Faturamento do período", fmt.brl(m.revenue))}${kpi(a.config.reimburseEnergy ? "Energia vendida" : "Energia entregue", fmt.kwh(m.energy))}
        ${kpi("Reembolso de energia", m.reimbursement ? fmt.brl(m.reimbursement) : "—", a.config.reimburseEnergy ? "" : "ponto com padrão próprio")}${kpi("Total para a área", fmt.brl(m.total), m.paidAt ? `pago em ${fmt.date(m.paidAt + "T12:00:00")}` : `vence em ${fmt.date(m.due + "T12:00:00")}`, true)}
      </div>
      <h2>Composição do fechamento</h2>
      <table><tbody>
        ${a.config.reimburseEnergy ? `<tr class="g"><td colspan="2">Energia</td></tr>
        <tr><td>Energia vendida no período</td><td class="n">${fmt.kwh(m.energy)}</td></tr>
        <tr><td>Tarifa de energia</td><td class="n">${fmt.brl(m.rate)}/kWh</td></tr>
        <tr class="t"><td>Reembolso de energia</td><td class="n">${fmt.brl(m.reimbursement)}</td></tr>` : ""}
        <tr class="g"><td colspan="2">Participação da área</td></tr>
        <tr><td>Regra de repasse</td><td class="n">Faturamento bruto</td></tr>
        <tr><td>Percentual contratado</td><td class="n">${fmt.pct(m.areaPct)}</td></tr>
        <tr><td>Base do percentual</td><td class="n">${fmt.brl(m.revenue)}</td></tr>
        <tr class="t"><td>Participação</td><td class="n">${fmt.brl(m.area)}</td></tr>
        ${m.adjusted && m.adjustment ? `<tr><td>Ajuste${m.adjustNote ? ` · ${esc(m.adjustNote)}` : ""}</td><td class="n">${fmt.brl(m.adjustment)}</td></tr>` : ""}
        ${m.carryIn ? `<tr><td>Diferença do pagamento de ${esc(m.carryFromLabel)}</td><td class="n">${fmt.brl(m.carryIn)}</td></tr>` : ""}
        ${m.paidAmount !== null && m.paidAmount !== undefined && m.paidDiff ? `<tr><td>Devido ${fmt.brl(m.dueAmount)} · diferença ${m.paidDiffMode === "next" ? "levada ao mês seguinte" : "zerada"}</td><td class="n">${fmt.brl(-m.paidDiff)}</td></tr>` : ""}
        <tr class="t"><td>Total a repassar no período</td><td class="n">${fmt.brl(m.total)}</td></tr>
      </tbody></table>
      <h2>Acumulado do ponto</h2>
      <div class="sub">Do início da operação até este fechamento</div>
      <div class="kpis">${kpi("Faturamento acumulado", fmt.brl(sum("revenue")))}${kpi("Energia acumulada", fmt.kwh(sum("energy")))}${kpi("Energia reembolsada", fmt.brl(sum("reimbursement")))}${kpi("Total acumulado para a área", fmt.brl(sum("total")), "", true)}</div>
      <h2>Linha do tempo mensal</h2>
      <table><thead><tr><th>Período</th><th class="n">Faturamento</th><th class="n">Energia</th><th class="n">R$/kWh</th><th class="n">% área</th><th class="n">Participação</th><th class="n">Total área</th><th>Situação</th></tr></thead><tbody>
        ${upTo.map(x => `<tr class="${x.key === m.key ? "t" : ""}"><td>${esc(x.label)}</td><td class="n">${fmt.brl(x.revenue)}</td><td class="n">${fmt.kwh(x.energy)}</td><td class="n">${x.reimbursement ? `${fmt.brl(x.rate)}/kWh` : "—"}</td><td class="n">${fmt.pct(x.areaPct)}</td><td class="n">${fmt.brl(x.area)}</td><td class="n">${fmt.brl(x.total)}</td><td>${x.paidAt ? `pago ${fmt.date(x.paidAt + "T12:00:00")}` : esc(x.status)}</td></tr>`).join("")}
      </tbody></table>
      <div class="note">Relatório destinado ao parceiro da área. ${a.config.reimburseEnergy ? "O reembolso de energia corresponde aos kWh vendidos no ponto multiplicados pela tarifa de energia do mês. " : ""}Conferir tarifa de energia, percentual contratual e documentos fiscais antes do envio final.</div>
      <div class="sign"><div>Responsável · UBY Recharge</div><div>${esc(a.config.payee)}</div></div>${foot()}`;
  }

  function build(kind, o = {}) {
    const latest = UBY.state.months.at(-1) || "";
    if (kind === "area") return doc(fileTitle("Prestação de contas", o.station, o.month || latest), [pageArea(o.workId, o.station, o.month)]);
    if (kind === "unificado" && o.until) return doc(`UBY Recharge — Consolidado até ${mmYY(o.until)}`, [pageUnificado("", o.until)]);
    if (kind === "unificado") return doc(fileTitle("Relatório unificado", "", o.month), [pageUnificado(o.month)]);
    if (kind === "carregador") {
      const s = UBY.data("stationFinance", o.workId, o.station, o.month);
      return doc(fileTitle("Relatório", s?.station || o.station, s?.monthKey || o.month || latest), [pageCarregador(o.workId, o.station, o.month)]);
    }
    if (kind === "todos") {
      const list = UBY.data("financeStations").filter(s => o.includeOutside || UBY.isUbyModel(s.model));
      return doc(fileTitle("Relatórios dos carregadores", "", o.month || latest), list.map(s => pageCarregador(s.workId, s.station, o.month)));
    }
    if (kind === "cotista") return doc(fileTitle("Extrato", o.name, latest), [pageCotista(o.name)]);
    if (kind === "cotistas") return doc(fileTitle("Extratos dos cotistas", "", latest), UBY.data("investorDistribution").investors.map(i => pageCotista(i.name)));
    throw new Error(`Tipo de relatório desconhecido: ${kind}`);
  }

  UBY.reports = {
    build, open,
    unificado: mk => open(build("unificado", { month: mk })),
    competencia: mk => open(build("unificado", { month: mk })),
    carregador: (workId, station, mk) => open(build("carregador", { workId, station, month: mk })),
    todosCarregadores: mk => open(build("todos", { month: mk })),
    cotista: name => open(build("cotista", { name })),
    area: (workId, station, mk) => open(build("area", { workId, station, month: mk }))
  };
})();

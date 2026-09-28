/* Central de avisos — contas a vencer em destaque; depois operação e fechamentos (motor alerts()). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { bucket: "", paidMonth: "", paidCat: "" };
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const monthName = mk => { const [y, m] = String(mk).split("-"); return `${MONTHS[Number(m) - 1] || m} de ${y}`; };
  const catOf = p => /energia/i.test(p.category) ? "Energia" : /área/i.test(p.category) ? "Repasse à área" : /cotista/i.test(p.category) ? "Cotistas" : "Custos e pagamentos";
  const BUCKETS = [
    ["vencida", "Vencidas", "bad"], ["hoje", "Vencem hoje", "bad"], ["3dias", "Próximos 3 dias", "warn"],
    ["7dias", "Próximos 7 dias", "warn"], ["mes", "Resto do mês", ""], ["proximo", "Próximo mês", ""]
  ];
  const LEVEL = { critico: ["bad", "Urgente"], atencao: ["warn", "Atenção"], info: ["neutral", "Informativo"] };
  const when = d => d < 0 ? `venceu há ${Math.abs(d)} dia${Math.abs(d) > 1 ? "s" : ""}` : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `em ${d} dias`;
  const payLink = b => /energia/i.test(b.category) ? "#/parametros/energia" : /área/i.test(b.category) ? "#/parametros/area" : "#/parametros/pagamentos";
  const fmtDay = s => { const [y, m, d] = String(s).split("-"); return `${d}/${m}/${y}`; };

  // Contas pagas: lista geral para controle (data, conta, origem, valor), filtrável por mês do pagamento e tipo.
  function paidSection() {
    let p;
    try { p = UBY.data("paidBills"); } catch (_) { return `<section class="section"><div class="note">Contas pagas: atualizando os números…</div></section>`; }
    const months = [...new Set(p.list.map(x => String(x.paidAt).slice(0, 7)).filter(Boolean))].sort().reverse();
    const cats = ["Custos e pagamentos", "Energia", "Repasse à área", "Cotistas"].filter(c => p.list.some(x => catOf(x) === c));
    const list = p.list.filter(x => (!ui.paidMonth || String(x.paidAt).startsWith(ui.paidMonth)) && (!ui.paidCat || catOf(x) === ui.paidCat));
    const total = list.reduce((s, x) => s + x.amount, 0);
    const byCat = cats.map(c => [c, list.filter(x => catOf(x) === c).reduce((s, x) => s + x.amount, 0)]).filter(([, v]) => v);
    return `<section class="section"><div class="section-head"><div><p class="kicker">Controle</p><h2>Contas pagas</h2>
        <p>Tudo o que foi marcado como pago: custos da matriz e pagamentos programados, faturas de energia (Copel e arrendamento), repasses às áreas e distribuição aos cotistas.</p></div></div>
      <div class="toolbar"><select class="select" id="avPaidMonth"><option value="">Todos os meses</option>${months.map(m => `<option value="${m}" ${ui.paidMonth === m ? "selected" : ""}>Pagas em ${esc(monthName(m))}</option>`).join("")}</select>
        <select class="select" id="avPaidCat"><option value="">Todos os tipos</option>${cats.map(c => `<option ${ui.paidCat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <span class="spacer"></span><small>${fmt.int(list.length)} pagamento(s) · <strong>${fmt.brl(total)}</strong></small></div>
      ${byCat.length > 1 ? `<div class="grid g4" style="margin-bottom:10px">${byCat.map(([c, v]) => kpi(c, fmt.brl(v))).join("")}</div>` : ""}
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Pago em</th><th>Conta</th><th>Pago a</th><th>De onde</th><th>Competência</th><th class="num">Valor</th></tr></thead><tbody>
        ${list.map(x => `<tr><td><strong>${x.paidAt ? esc(fmtDay(x.paidAt)) : "—"}</strong>${x.due ? `<br><small>venc. ${esc(fmtDay(x.due))}</small>` : ""}</td>
          <td>${esc(x.name)}<br><small>${esc(catOf(x))}${x.source ? ` · ${esc(x.source)}` : ""}</small></td><td>${esc(x.supplier || "—")}</td>
          <td>${esc(x.station || "—")}${x.workName ? `<br><small>${esc(x.workName)}</small>` : ""}</td><td>${esc(monthName(x.monthKey))}</td>
          <td class="num"><strong>${fmt.brl(x.amount)}</strong></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="note">Nenhuma conta paga ${ui.paidMonth || ui.paidCat ? "com esse filtro" : "registrada ainda"}.</div>`}
    </section>`;
  }

  function render(target) {
    const a = UBY.data("alerts");
    const t = a.totals;
    const bills = a.bills.filter(b => !ui.bucket || b.bucket === ui.bucket);
    const urgentTotal = t.vencida.amount + t.hoje.amount;
    const weekTotal = urgentTotal + t["3dias"].amount + t["7dias"].amount;
    const groups = BUCKETS.map(([id, label, cls]) => ({ id, label, cls, list: bills.filter(b => b.bucket === id) })).filter(g => g.list.length);

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Central de avisos · atualizada ${esc(fmt.dt(a.generatedAt))}</p><h1>Avisos e contas a vencer</h1>
        <p class="lead">Tudo o que precisa de ação: contas vencidas e a vencer, repasses, faturas de energia, pagamento aos cotistas, fechamentos e carregadores sem recarga.</p></div>
        <div class="callout"><strong>${a.nextBill ? `Próxima conta: ${esc(fmtDay(a.nextBill.dueDate))}` : "Nenhuma conta a vencer"}</strong><small>${a.nextBill ? `${esc(a.nextBill.name)} · ${fmt.brl(a.nextBill.amount)}` : "Contas marcadas como pagas saem desta lista."}</small></div></div>

      <section class="section"><div class="section-head"><div><p class="kicker">Contas a pagar</p><h2>Por prazo</h2>
        <p>Custos da matriz, pagamentos programados, faturas de energia (Copel e arrendamento) e repasses às áreas que ainda não foram marcados como pagos. Clique num prazo para filtrar.</p></div></div>
        <div class="grid g6" id="avBuckets">
          ${BUCKETS.map(([id, label, cls]) => `<button type="button" class="kpi ${t[id].count ? cls : ""} ${ui.bucket === id ? "lead" : ""}" data-b="${id}" style="text-align:left;cursor:pointer;font:inherit">
            <span class="k">${esc(label)}</span><strong class="v">${fmt.brl(t[id].amount)}</strong><span class="s">${fmt.int(t[id].count)} conta(s)</span></button>`).join("")}
        </div>
        <div class="grid g3" style="margin-top:10px">
          ${kpi("Para pagar até hoje", fmt.brl(urgentTotal), "vencidas + hoje", "", urgentTotal > 0 ? "bad" : "")}
          ${kpi("Próximos 7 dias (com as vencidas)", fmt.brl(weekTotal), "para separar o caixa da semana", "", weekTotal > 0 ? "warn" : "")}
          ${kpi("Última recarga recebida", a.lastRecharge ? esc(fmt.dt(a.lastRecharge)) : "—", "confirma se as importações estão em dia")}
        </div>
        ${ui.bucket ? `<p style="margin-top:10px"><button class="btn" id="avAll" type="button">Mostrar todos os prazos</button></p>` : ""}
        ${groups.length ? groups.map(g => `
          <h3 style="margin:18px 0 8px;font-size:13px"><span class="badge ${g.cls || "neutral"}">${esc(g.label)}</span> <small style="color:var(--uby-muted)">${fmt.int(g.list.length)} · ${fmt.brl(g.list.reduce((s, b) => s + b.amount, 0))}</small></h3>
          <div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Conta</th><th>Fornecedor</th><th>Carregador / origem</th><th class="num">Valor</th><th></th></tr></thead><tbody>
            ${g.list.map(b => `<tr><td><strong>${esc(fmtDay(b.dueDate))}</strong><br><small>${esc(when(b.days))}</small></td>
              <td>${esc(b.name)}<br><small>${esc(b.category || "")}</small></td><td>${esc(b.supplier || "—")}</td>
              <td>${esc(b.station || "")}${b.workName ? `<br><small>${esc(b.workName)}</small>` : ""}</td>
              <td class="num"><strong>${fmt.brl(b.amount)}</strong></td>
              <td><a class="btn" href="${payLink(b)}">Marcar pago →</a></td></tr>`).join("")}
          </tbody></table></div>`).join("")
        : `<div class="note" style="margin-top:12px">Nenhuma conta ${ui.bucket ? "neste prazo" : "em aberto"}.</div>`}
        <p class="source-line">Para marcar como paga: Parâmetros e custos → Pagamentos (faturas de energia e repasses têm abas próprias). Contas de até 3 meses atrás não pagas continuam aparecendo como vencidas.</p>
      </section>

      ${paidSection()}

      <section class="section"><div class="section-head"><div><p class="kicker">Operação e fechamentos</p><h2>Outros avisos</h2></div></div>
        ${a.items.length ? `<div class="list">${a.items.slice().sort((x, y) => ["critico", "atencao", "info"].indexOf(x.level) - ["critico", "atencao", "info"].indexOf(y.level)).map(i => `
          <div class="list-row" style="align-items:center;white-space:normal"><span><span class="badge ${LEVEL[i.level][0]}">${LEVEL[i.level][1]}</span> <strong>${esc(i.title)}</strong>${i.amount ? ` · ${fmt.brl(i.amount)}` : ""}<br><small>${esc(i.detail)}</small></span>
            ${i.link ? `<a class="btn" href="${esc(i.link)}">Abrir →</a>` : ""}</div>`).join("")}</div>`
        : `<div class="note">Sem avisos de operação: importações em dia, carregadores com recargas recentes e fechamentos em ordem.</div>`}
      </section>`;

    const pm = target.querySelector("#avPaidMonth"), pc = target.querySelector("#avPaidCat");
    if (pm) pm.onchange = () => { ui.paidMonth = pm.value; render(target); };
    if (pc) pc.onchange = () => { ui.paidCat = pc.value; render(target); };
    target.querySelectorAll("#avBuckets [data-b]").forEach(btn => { btn.onclick = () => { ui.bucket = ui.bucket === btn.dataset.b ? "" : btn.dataset.b; render(target); }; });
    const all = target.querySelector("#avAll");
    if (all) all.onclick = () => { ui.bucket = ""; render(target); };
  }

  UBY.register("avisos", { render });
})();

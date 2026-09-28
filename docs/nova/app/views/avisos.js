/* Central de avisos — contas a vencer em destaque; depois operação e fechamentos (motor alerts()). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { bucket: "" };
  const BUCKETS = [
    ["vencida", "Vencidas", "bad"], ["hoje", "Vencem hoje", "bad"], ["3dias", "Próximos 3 dias", "warn"],
    ["7dias", "Próximos 7 dias", "warn"], ["mes", "Resto do mês", ""], ["proximo", "Próximo mês", ""]
  ];
  const LEVEL = { critico: ["bad", "Urgente"], atencao: ["warn", "Atenção"], info: ["neutral", "Informativo"] };
  const when = d => d < 0 ? `venceu há ${Math.abs(d)} dia${Math.abs(d) > 1 ? "s" : ""}` : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `em ${d} dias`;
  const payLink = b => /energia/i.test(b.category) ? "#/parametros/energia" : /área/i.test(b.category) ? "#/parametros/area" : "#/parametros/pagamentos";
  const fmtDay = s => { const [y, m, d] = String(s).split("-"); return `${d}/${m}/${y}`; };

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

      <section class="section"><div class="section-head"><div><p class="kicker">Operação e fechamentos</p><h2>Outros avisos</h2></div></div>
        ${a.items.length ? `<div class="list">${a.items.slice().sort((x, y) => ["critico", "atencao", "info"].indexOf(x.level) - ["critico", "atencao", "info"].indexOf(y.level)).map(i => `
          <div class="list-row" style="align-items:center;white-space:normal"><span><span class="badge ${LEVEL[i.level][0]}">${LEVEL[i.level][1]}</span> <strong>${esc(i.title)}</strong>${i.amount ? ` · ${fmt.brl(i.amount)}` : ""}<br><small>${esc(i.detail)}</small></span>
            ${i.link ? `<a class="btn" href="${esc(i.link)}">Abrir →</a>` : ""}</div>`).join("")}</div>`
        : `<div class="note">Sem avisos de operação: importações em dia, carregadores com recargas recentes e fechamentos em ordem.</div>`}
      </section>`;

    target.querySelectorAll("#avBuckets [data-b]").forEach(btn => { btn.onclick = () => { ui.bucket = ui.bucket === btn.dataset.b ? "" : btn.dataset.b; render(target); }; });
    const all = target.querySelector("#avAll");
    if (all) all.onclick = () => { ui.bucket = ""; render(target); };
  }

  UBY.register("avisos", { render });
})();

/* Locais com AC + DC no mesmo lugar (ex.: Shopping Aurora): os carregadores lado a lado e juntos.
   Só leitura: soma as mesmas contas de cada estação (motor oficial). As outras telas não mudam. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { place: "" };

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }
  const signed = v => `<span style="color:${v >= 0 ? "var(--uby-green)" : "var(--uby-red)"}">${fmt.brl(v)}</span>`;
  const perKwh = v => v == null || !Number.isFinite(v) ? "—" : `${fmt.brl(v)}/kWh`;
  const pctOf = (a, b) => b > 0 ? a / b * 100 : 0;

  function render(target) {
    if (!ui.place) ui.place = (UBY.data("places").find(p => /aurora/i.test(p.label)) || {}).key || "";
    const v = UBY.data("placeView", ui.place, monthArg());
    if (!v.place) {
      target.innerHTML = `<div class="hero"><div><p class="eyebrow">Rede de recargas</p><h1>Locais AC + DC</h1></div></div><div class="note">Nenhum local com mais de um carregador na operação UBY.</div>`;
      return;
    }
    ui.place = v.place.key;
    const cols = [...v.members.map(m => ({ head: `${UBY.stationLink(m.workId, m.station, m.kind || m.station)}<small>${esc(m.station.replace(/^UBY RECHARGE\s*-\s*/i, ""))}</small>`, ops: m.ops, fin: m.fin, clients: m.clients })),
      { head: `<strong>Juntos</strong><small>${esc(v.place.label)}</small>`, ops: v.total.ops, fin: v.total.fin, clients: v.total.ops.clients, total: true }];
    const t = v.total, o = t.ops, f = t.fin;
    const line = (label, fn) => `<tr><td>${label}</td>${cols.map(c => `<td class="num"${c.total ? ' style="font-weight:800"' : ""}>${fn(c)}</td>`).join("")}</tr>`;
    const group = label => `<tr><th colspan="${cols.length + 1}" style="position:static">${label}</th></tr>`;
    const otherCosts = c => c.fin.localExtraCosts + c.fin.taxes + c.fin.ubyRoyalty;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · ${esc(v.label)}</p><h1>${esc(v.place.label)} · AC + DC</h1>
        <p class="lead">Carregadores no mesmo local, que se complementam: cada um individualmente e os dois juntos, com as mesmas contas das outras telas.</p></div>
        <div class="callout"><strong>Só leitura</strong><small>Os números de cada carregador continuam iguais em todas as outras telas. Para editar custos, clique no carregador (↗) e use o centro de custos dele.</small></div></div>
      ${v.places.length > 1 ? `<div class="toolbar"><div class="seg" id="placeTabs">${v.places.map(p => `<button data-place="${esc(p.key)}" class="${p.key === v.place.key ? "on" : ""}">${esc(p.label)} (${p.members.map(m => esc(m.kind)).join(" + ")})</button>`).join("")}</div></div>` : ""}

      <section class="section"><div class="section-head"><div><p class="kicker">${esc(v.place.label)} · juntos</p><h2>${v.members.map(m => esc(m.kind)).join(" + ")} no mesmo local</h2></div>
          <div class="meta">${fmt.int(o.power)} kW instalados<br>${v.monthKey ? esc(v.label) : `acumulado de ${v.months.length} mês(es)`}</div></div>
        <div class="grid g6">
          ${kpi("Ocupação", fmt.pct1(o.occupancy), "energia ÷ capacidade dos dois", "", "lead big")}
          ${kpi("Faturamento", fmt.brl(f.totalRevenue), `${fmt.brl(o.revenuePerKwh)}/kWh médio`, "", "lead big")}
          ${kpi("Recargas", fmt.int(o.sessions), `${fmt.kwh0(o.energy)} entregues`)}
          ${kpi("Clientes", fmt.int(o.clients), t.sharedClients ? `${fmt.int(t.sharedClients)} usaram os dois` : "nenhum usou os dois")}
          ${kpi("Resultado", signed(f.operationNet), `margem ${fmt.pct1(pctOf(f.operationNet, f.totalRevenue))}`, "", f.operationNet >= 0 ? "" : "bad")}
          ${kpi("% do investido", f.investment ? fmt.pct(pctOf(f.operationNet, f.investment)) : "—", f.investment ? `investimento ${fmt.brl(f.investment)}` : "sem investimento cadastrado")}
        </div>
      </section>

      <div class="split" style="margin-bottom:18px">
        <section class="section" style="padding:0;overflow:hidden"><div class="table-wrap" style="border:0;border-radius:0"><table>
          <thead><tr><th></th>${cols.map(c => `<th class="num">${c.head}</th>`).join("")}</tr></thead><tbody>
          ${group("Operação")}
          ${line("Ocupação", c => fmt.pct1(c.ops.occupancy))}
          ${line("Recargas", c => fmt.int(c.ops.sessions))}
          ${line("Clientes", c => fmt.int(c.clients))}
          ${line("Energia entregue", c => fmt.kwh0(c.ops.energy))}
          ${line("Energia por recarga", c => `${fmt.n1(c.ops.avgKwh)} kWh`)}
          ${line("Tempo médio", c => esc(c.ops.avgDuration || "—"))}
          ${line("Ticket médio", c => fmt.brl(c.ops.avgTicket))}
          ${line("Preço médio", c => perKwh(c.ops.revenuePerKwh))}
          ${line("Potência", c => `${fmt.int(c.ops.power)} kW`)}
          ${line("Participação no faturamento", c => fmt.pct1(pctOf(c.fin.totalRevenue, f.totalRevenue)))}
          ${group("Resultado")}
          ${line("Faturamento", c => fmt.brl(c.fin.totalRevenue))}
          ${line("Energia", c => fmt.brl(c.fin.energyCost))}
          ${line("Gestão P3", c => fmt.brl(c.fin.management))}
          ${line("App / plataforma", c => fmt.brl(c.fin.platform))}
          ${line("Repasse da área", c => fmt.brl(c.fin.areaParticipation))}
          ${line("Matriz (rateio)", c => fmt.brl(c.fin.matrizCost))}
          ${line("Outros custos e impostos", c => fmt.brl(otherCosts(c)))}
          ${line("<strong>Custo total</strong>", c => fmt.brl(c.fin.totalOperatingCost))}
          ${line("Custo por kWh", c => perKwh(c.fin.energy > 0 ? c.fin.totalOperatingCost / c.fin.energy : null))}
          ${line("<strong>Resultado</strong>", c => signed(c.fin.operationNet))}
          ${line("Margem", c => fmt.pct1(pctOf(c.fin.operationNet, c.fin.totalRevenue)))}
          ${line("Investimento", c => c.fin.investment ? fmt.brl(c.fin.investment) : "—")}
          ${line("% do investido", c => c.fin.investment ? fmt.pct(pctOf(c.fin.operationNet, c.fin.investment)) : "—")}
          </tbody></table></div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Evolução</p><h2>Faturamento de cada um e resultado juntos</h2></div></div>
          <div class="chart-box"><canvas id="chPlace"></canvas></div></section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Mês a mês</p><h2>${esc(v.place.label)} juntos</h2><p>Clientes contados uma vez só quando usaram os dois carregadores no mês.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Competência</th>${v.members.map(m => `<th class="num">Faturamento ${esc(m.kind)}</th>`).join("")}<th class="num">Faturamento juntos</th><th class="num">Recargas</th><th class="num">Clientes</th><th class="num">Energia</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead>
          <tbody>${v.monthly.slice().reverse().map(m => `<tr${m.key === v.monthKey ? ' style="background:var(--uby-green-soft)"' : ""}><td><strong>${esc(m.label)}</strong></td>
            ${m.members.map(x => `<td class="num">${fmt.brl(x.revenue)}<small>${fmt.int(x.sessions)} recargas</small></td>`).join("")}
            <td class="num"><strong>${fmt.brl(m.revenue)}</strong></td><td class="num">${fmt.int(m.sessions)}</td><td class="num">${fmt.int(m.clients)}</td><td class="num">${fmt.kwh0(m.energy)}</td>
            <td class="num">${signed(m.result)}</td><td class="num">${fmt.pct1(pctOf(m.result, m.revenue))}</td></tr>`).join("") || `<tr><td colspan="${v.members.length + 7}" class="empty">Sem recargas.</td></tr>`}</tbody></table></div>
      </section>`;

    target.querySelectorAll("#placeTabs button").forEach(b => b.onclick = () => { ui.place = b.dataset.place; render(target); });
    const colors = ["#187457", "#2f7fd8", "#b98527"];
    const base = UBY.baseChartOptions();
    UBY.chart("chPlace", { type: "bar", data: { labels: v.monthly.map(m => m.label), datasets: [
      ...v.members.map((m, i) => ({ label: `Faturamento ${m.kind}`, data: v.monthly.map(x => x.members[i].revenue), backgroundColor: colors[i % colors.length], borderRadius: 4, stack: "fat" })),
      { type: "line", label: "Resultado juntos", data: v.monthly.map(x => x.result), borderColor: "#173c30", backgroundColor: "#173c30", tension: .3 }
    ] }, options: { ...base, scales: { ...(base.scales || {}), x: { ...(base.scales?.x || {}), stacked: true }, y: { ...(base.scales?.y || {}), stacked: true } } } });
  }

  UBY.register("locais", { render });
})();

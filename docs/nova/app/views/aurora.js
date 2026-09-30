/* Shopping Aurora — AC e DC na mesma localização, cada um com seu painel de visão,
   mais o total do ponto e os relatórios (individual de cada lado e conjunto). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const isAurora = s => /aurora/i.test(`${s.station} ${s.workName}`);

  function monthArg() { const p = UBY.periodArg(); return p === undefined ? UBY.state.months.at(-1) || "" : p; }

  function panel(label, s, month) {
    if (!s) return `<section class="section"><div class="section-head"><div><p class="kicker">${label}</p><h2>Sem carregador ${label} cadastrado</h2></div></div><div class="note">Nenhuma estação ${label} do Shopping Aurora tem base salva neste período.</div></section>`;
    const href = `#/unidades/${encodeURIComponent(s.workId)}/${encodeURIComponent(s.station)}`;
    return `<section class="section">
      <div class="section-head"><div><p class="kicker">${label}${s.power ? ` · ${fmt.int(s.power)} kW` : ""}</p><h2>${esc(s.station)}</h2><p>${esc(s.workName)}${s.included ? "" : " · fora da operação UBY"}</p></div>
        <div><a class="btn link-btn" href="${href}">Detalhe da unidade</a></div></div>
      <div class="grid g3" style="margin-bottom:12px">
        ${kpi("Faturamento", fmt.brl(s.revenue), `${fmt.int(s.sessions)} recargas · ${fmt.int(s.clients)} clientes`, "", "lead big")}
        ${kpi("Energia", fmt.kwh0(s.energy), `ticket ${fmt.brl(s.avgTicket)}`, "", "warn")}
        ${kpi("Ocupação", fmt.pct1(s.occupancy), `disponibilidade ${s.sessions ? fmt.pct1(s.availability) : "—"}`)}
      </div>
      <div class="bar ${s.bandClass}"><span style="width:${Math.min(s.occupancy || 0, 100)}%"></span></div>
      <p class="source-line">${s.failures ? `${fmt.int(s.failures)} falha(s) · ` : ""}última recarga ${fmt.date(s.lastDate)}</p>
      <p style="margin:10px 0 0"><button class="btn" data-rep="${esc(s.workId)}|${esc(s.station)}" type="button">Relatório individual ${label}</button></p>
    </section>`;
  }

  function render(target) {
    const month = monthArg();
    const all = UBY.data("stations", month).filter(isAurora);
    const ac = all.find(s => s.kind === "ac");
    const dc = all.find(s => s.kind === "dc");
    const parts = [["AC", ac], ["DC", dc]].filter(([, s]) => s).map(([label, s]) => ({ label, workId: s.workId, station: s.station }));
    const tot = all.reduce((a, s) => ({ revenue: a.revenue + s.revenue, energy: a.energy + s.energy, sessions: a.sessions + s.sessions, failures: a.failures + s.failures }), { revenue: 0, energy: 0, sessions: 0, failures: 0 });
    const periodLabel = month ? UBY.state.api.monthName(month) : "Acumulado";

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas</p><h1>Shopping Aurora · AC e DC</h1>
        <p class="lead">Dois carregadores na mesma localização, cada um com seu painel de visão. O total do ponto e o relatório conjunto ficam abaixo.</p></div>
        <div class="callout"><strong>${esc(periodLabel)}</strong><small>Troque o período no topo. Os valores seguem o mesmo motor da tela Unidades e carregadores.</small></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        ${kpi("Faturamento do ponto", fmt.brl(tot.revenue), "AC + DC", "", "lead big")}
        ${kpi("Energia do ponto", fmt.kwh0(tot.energy), "AC + DC", "", "warn")}
        ${kpi("Recargas", fmt.int(tot.sessions), "AC + DC")}
        ${kpi("Falhas", fmt.int(tot.failures), "AC + DC", "", tot.failures ? "bad" : "")}
      </div>
      <div class="split" style="margin-bottom:16px">${panel("AC", ac, month)}${panel("DC", dc, month)}</div>
      <section class="section"><div class="section-head"><div><p class="kicker">Relatórios</p><h2>Individual e conjunto</h2>
        <p>O conjunto traz um resumo AC × DC e, em seguida, uma página individual de cada carregador.</p></div></div>
        <div class="toolbar" style="margin:0"><button class="btn primary" id="auRepBoth" type="button" ${parts.length ? "" : "disabled"}>Relatório conjunto AC + DC</button></div>
      </section>`;

    const open = (kind, o) => { try { UBY.reports.open(UBY.reports.build(kind, { month, ...o })); } catch (err) { alert(`Não foi possível gerar: ${err.message}`); } };
    target.querySelectorAll("[data-rep]").forEach(b => b.onclick = () => { const [workId, station] = b.dataset.rep.split("|"); open("carregador", { workId, station }); });
    const both = target.querySelector("#auRepBoth");
    if (both) both.onclick = () => open("aurora", { parts });
  }

  UBY.register("aurora", { render });
})();

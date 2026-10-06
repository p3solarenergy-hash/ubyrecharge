/* P3 Solar · gestão — a P3 como prestadora de serviço da UBY (sempre depois da UBY).
   Receita da P3 = taxa de gestão de cada carregador (UBY, parceiros e só gestão)
   + lucro da sociedade P3. Mesmos números do motor v2 (stationFinance/destinations). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const GROUPS = [
    ["uby", "Gestão da operação UBY", m => ["uby", "hybrid"].includes(m)],
    ["parceiro", "Gestão de parceiros UBY", m => m === "third_party_management"],
    ["so_gestao", "Carregadores só gestão P3", m => m === "management_only"],
    ["sociedade", "Sociedade P3", m => m === "p3_society"]
  ];
  const groupOf = model => (GROUPS.find(([, , t]) => t(model)) || GROUPS[0])[0];

  function model() {
    const api = UBY.state.api;
    const stations = UBY.data("financeStations");
    const byMonth = new Map();
    const rows = stations.map(s => {
      const sf = api.stationFinance(s.workId, s.station, "");
      const monthly = (sf?.monthly || []).map(m => ({ key: m.key, label: m.label, revenue: Number(m.revenue) || 0, management: Number(m.management) || 0, society: Number(m.p3SocietyProfit) || 0, model: m.model || s.model }));
      const group = groupOf(s.model);
      monthly.forEach(m => {
        const cur = byMonth.get(m.key) || { key: m.key, label: m.label, uby: 0, parceiro: 0, so_gestao: 0, sociedade: 0, total: 0, revenue: 0 };
        const g = m.model === "p3_society" ? "sociedade" : group;
        const value = m.management + m.society;
        cur[g] += value; cur.total += value; cur.revenue += m.revenue;
        byMonth.set(m.key, cur);
      });
      const management = monthly.reduce((t, m) => t + m.management, 0), society = monthly.reduce((t, m) => t + m.society, 0);
      return { ...s, group, modelLabel: UBY.modelLabel(s.model), revenue: monthly.reduce((t, m) => t + m.revenue, 0), management, society, total: management + society, months: monthly.length };
    });
    const months = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
    const total = rows.reduce((t, r) => t + r.total, 0);
    let check = null;
    try { check = Number(UBY.data("destinations").total.p3Gross) || null; } catch (_) {}
    return { rows, months, total, check };
  }

  function render(target) {
    const d = model();
    const last = d.months.at(-1) || { total: 0, label: "—", uby: 0, parceiro: 0, so_gestao: 0, sociedade: 0 };
    const prev = d.months.at(-2);
    const sum = g => d.rows.filter(r => r.group === g).reduce((t, r) => t + r.total, 0);
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Prestadora de serviço da UBY · gestão e engenharia</p><h1>P3 Solar · gestão</h1>
        <p class="lead">O que a P3 recebe pela gestão da rede: a taxa de gestão de cada carregador operado para a UBY e parceiros, a gestão dos carregadores que são só da P3 e o resultado da sociedade P3. Os números da UBY continuam nas telas da UBY; aqui é a visão da prestadora.</p></div>
        <div class="callout"><strong>${fmt.brl(d.total)} devidos à P3 no acumulado</strong><small>Calculado por competência (o que a P3 tem a receber), não o que já entrou na conta. ${d.check !== null ? (Math.abs(d.check - d.total) < 0.05 ? "Confere com o motor financeiro (Destinos do resultado)." : `Atenção: Destinos do resultado mostra ${fmt.brl(d.check)}.`) : ""}</small></div></div>
      <section class="section"><div class="grid g5">
        ${kpi(`Receita P3 · ${esc(last.label)}`, fmt.brl(last.total), prev ? UBY.delta(last.total, prev.total) : "", "", "lead")}
        ${kpi("Gestão da operação UBY", fmt.brl(sum("uby")), "acumulado · taxa sobre os ativos UBY")}
        ${kpi("Gestão de parceiros UBY", fmt.brl(sum("parceiro")), "acumulado")}
        ${kpi("Só gestão P3", fmt.brl(sum("so_gestao")), "acumulado · fora da UBY")}
        ${kpi("Sociedade P3", fmt.brl(sum("sociedade")), "acumulado · lucro da sociedade")}
      </div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Mês a mês</p><h2>Receita da P3 por origem</h2></div></div>
        <div class="chart-box"><canvas id="chP3"></canvas></div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Competência</th>${GROUPS.map(([, l]) => `<th class="num">${esc(l)}</th>`).join("")}<th class="num">Total P3</th><th class="num">Faturamento dos pontos</th><th class="num">% do faturamento</th></tr></thead>
          <tbody>${d.months.slice().reverse().map(m => `<tr><td><strong>${esc(m.label)}</strong></td>${GROUPS.map(([g]) => `<td class="num">${fmt.brl(m[g])}</td>`).join("")}<td class="num"><strong>${fmt.brl(m.total)}</strong></td><td class="num">${fmt.brl(m.revenue)}</td><td class="num">${m.revenue ? fmt.pct1(m.total / m.revenue * 100) : "—"}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Sem meses com operação.</td></tr>`}</tbody></table></div>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Por carregador</p><h2>De onde vem a receita da P3</h2><p>Acumulado desde o início de cada operação. Ordem: operação UBY primeiro, depois parceiros, só gestão e sociedade P3.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Carregador</th><th>Modelo</th><th class="num">Meses</th><th class="num">Faturamento</th><th class="num">Taxa de gestão</th><th class="num">Sociedade P3</th><th class="num">Total P3</th></tr></thead>
          <tbody>${GROUPS.flatMap(([g]) => d.rows.filter(r => r.group === g).sort((a, b) => b.total - a.total)).map(r => `<tr class="clickable" data-go="#/unidades/${encodeURIComponent(r.workId)}/${encodeURIComponent(r.station)}">
            <td><strong>${esc(r.station)}</strong><small>${esc(r.workName)}</small></td><td><span class="badge ${UBY.isUbyModel(r.model) ? "ok" : "neutral"}">${esc(r.modelLabel)}</span></td>
            <td class="num">${fmt.int(r.months)}</td><td class="num">${fmt.brl(r.revenue)}</td><td class="num">${fmt.brl(r.management)}</td><td class="num">${r.society ? fmt.brl(r.society) : "—"}</td><td class="num"><strong>${fmt.brl(r.total)}</strong></td></tr>`).join("")}</tbody></table></div>
        <p class="source-line">A taxa de gestão e o percentual de cada ponto ficam em Parâmetros e custos → Por carregador. Obras e engenharia executadas pela P3 estão em Gestão de obras.</p>
      </section>`;
    target.querySelectorAll("[data-go]").forEach(el => el.onclick = () => UBY.go(el.dataset.go));
    const colors = ["#187457", "#3d6f8e", "#b98527", "#77637d"];
    UBY.chart("chP3", { type: "bar", data: { labels: d.months.map(m => m.label), datasets: GROUPS.map(([g, l], i) => ({ label: l, data: d.months.map(m => Math.round(m[g] * 100) / 100), backgroundColor: colors[i], stack: "p3" })) },
      options: (() => { const o = UBY.baseChartOptions(); o.scales.x.stacked = true; o.scales.y.stacked = true; return o; })() });
  }

  UBY.register("p3", { render });
})();

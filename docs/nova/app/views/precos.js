/* Estudos de preço — simulador de margem por carregador, concorrência, reajustes já feitos e capacidade.
   Contas em app/analytics-core.js; parâmetros lidos do financeiro v2 (motor: pricingBase). Só leitura:
   os campos do simulador são editáveis apenas aqui, para testar cenários, e nada é gravado no financeiro. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const core = () => window.UBY_ANALYTICS_CORE;
  const TABS = [["simulador", "Simulador de preço"], ["concorrencia", "Concorrência"], ["reajustes", "Reajustes e sensibilidade"], ["carga", "Horários e capacidade"]];
  const COMP_KEY = "uby-nova-competitors-v1";
  const ui = { site: "", edits: {}, el: [-1, -1.8, -3], tier: { price: 1.49, retainedPct: 20, extra: 0 }, off: { from: 21, to: 8, price: 1.39, extra: 30 }, comp: readComp(), chart: null };

  function readComp() { try { const v = JSON.parse(localStorage.getItem(COMP_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function writeComp() { try { localStorage.setItem(COMP_KEY, JSON.stringify(ui.comp)); } catch (_) {} }
  const num = v => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const brl2 = v => fmt.brl(v);
  const sign = v => `${v >= 0 ? "+" : ""}${fmt.pct1(v)}`;
  const field = (label, inner) => `<label style="min-width:0;display:flex;flex-direction:column;gap:3px"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span>${inner}</label>`;
  const inp = (key, label, value, step = "0.01", extra = "") => field(label, `<input class="select" data-k="${key}" type="number" step="${step}" value="${esc(value)}" ${extra} style="width:100%">`);
  const floorTxt = v => v === null ? "—" : v < 0.01 ? "sem piso" : `R$ ${v.toFixed(2).replace(".", ",")}`;
  const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
  const resBadge = (v, now) => `<strong style="color:${v < 0 ? "var(--uby-bad, #b75450)" : v >= now - 0.5 ? "var(--uby-green, #187457)" : "inherit"}">${brl2(v)}</strong>`;

  function head(tab, pb) {
    return `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · base até ${esc(fmt.dt(pb.asOf))}</p><h1>Estudos de preço</h1>
        <p class="lead">Quanto cada carregador ganha por kWh, até onde dá para baixar o preço e quanto volume a mais seria preciso. Os custos vêm do financeiro (último mês completo de cada carregador); aqui você só testa cenários, nada é gravado.</p></div>
        <div class="callout"><strong>Como ler</strong><small>Margem por kWh = preço × (1 − área − plataforma − gestão − impostos) − energia. Custos fixos (matriz, internet) entram no resultado do mês.</small></div></div>
      <div class="toolbar"><div class="seg" id="prTabs">${TABS.map(([id, l]) => `<button data-tab="${id}" class="${tab === id ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
  }

  const siteOf = pb => pb.sites.find(s => s.ref === ui.site) || pb.sites[0];
  const paramsOf = s => ({ ...s.params, ...(ui.edits[s.ref] || {}) });
  const siteSelect = pb => `<select class="select" id="prSite">${pb.sites.map(s => `<option value="${esc(s.ref)}" ${s.ref === ui.site ? "selected" : ""}>${esc(s.site)}${s.short ? " (base curta)" : ""}</option>`).join("")}</select>`;
  const editLink = s => `#/parametros/carregador/${encodeURIComponent(s.ref)}`;

  // ---------------------------------------------------------------- simulador
  function simulador(pb) {
    const s = siteOf(pb), p = paramsOf(s), edited = !!ui.edits[s.ref] && Object.keys(ui.edits[s.ref]).length;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Parâmetros de ${esc(s.site)} · ${esc(s.monthLabel)}</p><h2>Ponto de partida</h2>
          <p>Lidos do financeiro. Mude qualquer campo para testar (por exemplo, o custo de energia caindo para o do JK). O valor oficial se edita em <a href="${editLink(s)}">Parâmetros → Por carregador</a>.</p></div></div>
        <div class="toolbar" style="box-shadow:none">${siteSelect(pb)}<span class="spacer"></span><button class="btn" type="button" id="prReset" ${edited ? "" : "hidden"}>Voltar aos valores do financeiro</button><small id="prFromFin" ${edited ? "hidden" : ""}>valores do financeiro</small></div>
        ${s.short ? `<div class="note" style="margin-bottom:10px"><strong>Base curta:</strong> este carregador tem ${s.ageDays} dias de operação; volume, custos e preço ainda não estabilizaram. Trate o resultado como estimativa.</div>` : ""}
        <div class="grid g6" id="prParams">
          ${inp("kwh", "Volume (kWh/mês)", Math.round(p.kwh), "1")}
          ${inp("price", "Preço efetivo (R$/kWh)", p.price.toFixed(3), "0.01")}
          ${inp("listNow", "Preço de lista hoje", p.listNow.toFixed(2), "0.01")}
          ${inp("energyPerKwh", "Energia (R$/kWh)", p.energyPerKwh.toFixed(3), "0.01")}
          ${inp("pctCost", "Área+plataforma+gestão+impostos (%)", (p.pctCost * 100).toFixed(2), "0.1")}
          ${inp("fixedMonth", "Custos fixos (R$/mês)", p.fixedMonth.toFixed(2), "1")}
        </div>
        <small style="display:block;margin-top:6px">Efetivo × lista: o efetivo já inclui cupons (Clube 10%, Parceiro 15%); ao mudar a lista, o efetivo muda na mesma proporção.</small>
      </section>
      <div id="prOut"></div>`;
  }

  function simOut(pb) {
    const A = core(), s = siteOf(pb), p = paramsOf(s), E = ui.el;
    const lists = [...new Set([p.listNow, 2.09, 1.99, 1.89, 1.79, 1.69, 1.59, 1.49, 1.39, 1.29, 1.19, ...ui.comp.map(c => num(c.price))].map(v => Math.round(v * 100) / 100).filter(v => v > 0))].sort((a, b) => b - a);
    const now = A.scenario(p, p.listNow, -1);
    const be = A.breakeven(p), ratio = p.listNow > 0 ? p.price / p.listNow : 1;
    const beList = v => v === null ? null : v / ratio;
    const m0 = A.margin(p, p.price);
    // ocupação = kWh ÷ (potência × horas disponíveis do mês), a mesma da plataforma
    const occOf = kwh => s.capacityKwh > 0 ? kwh / s.capacityKwh * 100 : null;
    const occTxt = v => v === null ? "—" : `${fmt.pct1(v)}`;
    const occNow = occOf(p.kwh), peak = s.profile.peakUtil * 100;
    // coluna principal: ocupação que o carregador precisa ter, em cada preço, para manter o resultado de hoje.
    // Cor pela distância do que ele faz hoje: até 1,5× verde, até 2,5× âmbar, acima disso vermelho.
    const occCell = (need, isNow) => {
      if (need === null || need > 10) return `<div style="font-weight:800;font-size:15px;color:var(--uby-bad, #b75450)">não compensa</div><small>nenhum volume paga este preço</small>`;
      const v = isNow ? occNow : occOf(need * p.kwh);
      if (v === null) return "—";
      if (isNow) return `<div style="font-weight:800;font-size:20px">${occTxt(v)}</div><small>ocupação de hoje</small>`;
      const r = occNow > 0 ? v / occNow : 1;
      // preço mais alto: o carregador pode ter ocupação MENOR e ainda manter o resultado (piso de ocupação)
      if (v < occNow) return `<div style="font-weight:800;font-size:20px;color:var(--uby-green, #187457)">${occTxt(v)}</div><small>pode cair até aqui · ${fmt.n1(occNow - v)} pontos a menos (${r.toFixed(2).replace(".", ",")}× o de hoje)</small>`;
      const col = v > 100 ? "var(--uby-bad, #b75450)" : r <= 1.5 ? "var(--uby-green, #187457)" : r <= 2.5 ? "#b98527" : "var(--uby-bad, #b75450)";
      return `<div style="font-weight:800;font-size:20px;color:${col}">${v > 100 ? "acima de 100%" : occTxt(v)}</div><small>${v > 100 ? "impossível" : `+${fmt.n1(v - occNow)} pontos · ${r.toFixed(1).replace(".", ",")}× o de hoje`}</small>`;
    };
    const rows = lists.map(l => {
      const sc = E.map(e => A.scenario(p, l, e)), first = sc[0], need = first.volumeNeeded, isNow = Math.abs(l - p.listNow) < 0.005;
      return `<tr><td><strong>R$ ${l.toFixed(2).replace(".", ",")}</strong>${isNow ? ` ${badge("neutral", "hoje")}` : ""}</td>
        <td class="num" style="background:rgba(185,133,39,.07);min-width:150px">${occCell(need, isNow)}</td>
        <td class="num">${need === null || need > 10 ? "—" : isNow ? "—" : `${need.toFixed(2).replace(".", ",")}× <small>(${sign((need - 1) * 100)})</small>`}</td>
        <td class="num">${brl2(first.price)}</td><td class="num">${first.marginPerKwh < 0 ? `<span class="badge bad">${brl2(first.marginPerKwh)}</span>` : brl2(first.marginPerKwh)}</td>
        ${sc.map(x => `<td class="num">${resBadge(x.result, now.resultNow)}<small>${sign(x.volumePct)} volume · ocup. ${occTxt(occOf(x.kwh))}</small></td>`).join("")}</tr>`;
    }).join("");
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Resultado e equilíbrio</p><h2>${esc(s.site)}</h2></div>
          <div class="meta">oficial em ${esc(s.monthLabel)}: ${brl2(s.result.operationNet)} (${fmt.pct1(s.result.margin)})</div></div>
        <div class="grid g6">
          ${kpi("Ocupação de hoje", occTxt(occNow), s.capacityKwh > 0 ? `${fmt.kwh0(p.kwh)} de ${fmt.kwh0(s.capacityKwh)} possíveis no mês` : "capacidade não disponível")}
          ${kpi("Resultado de hoje (simulado)", brl2(now.resultNow), "com os parâmetros acima", "", now.resultNow < 0 ? "warn" : "lead")}
          ${kpi("Margem por kWh", brl2(m0), `${fmt.pct1(p.price > 0 ? m0 / p.price * 100 : 0)} do preço efetivo`, "", m0 <= 0 ? "warn" : "")}
          ${kpi("Lista mínima (variável)", floorTxt(beList(be.priceVariable)), be.priceVariable !== null && be.priceVariable < 0.01 ? "sem custo de energia: nenhum preço dá prejuízo por kWh" : "abaixo disso cada kWh dá prejuízo")}
          ${kpi("Lista mínima (com fixos)", be.priceFull === null ? "—" : `R$ ${beList(be.priceFull).toFixed(2).replace(".", ",")}`, "para o carregador empatar no mês")}
          ${kpi("Folga sobre a lista", be.priceFull === null ? "—" : sign((p.listNow / beList(be.priceFull) - 1) * 100), "lista de hoje contra o empate")}
        </div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Cenários</p><h2>Se mudarmos a lista, para baixo ou para cima, o que acontece?</h2>
          <p>Cada coluna de resultado supõe uma sensibilidade do volume ao preço (elasticidade): <strong>−${Math.abs(E[0])}</strong> = cada 10% a menos no preço traz ~${Math.round(Math.abs(E[0]) * 10)}% a mais de volume. A coluna "volume necessário" é quanto o volume precisa multiplicar para manter o resultado de hoje. <strong>Acima do preço de hoje</strong> a leitura se inverte: o volume pode cair (abaixo de 1×) e a ocupação pode ficar menor, e o resultado só se mantém se a queda real não passar desse piso.</p></div></div>
        <div class="toolbar" style="box-shadow:none"><small>Sensibilidades:</small>
          ${E.map((e, i) => `<input class="select" type="number" step="0.1" data-el="${i}" value="${e}" style="width:78px" title="elasticidade ${i + 1}">`).join("")}
          <span class="spacer"></span><small>Os preços dos concorrentes registrados na aba Concorrência entram na tabela.</small></div>
        <div class="table-wrap"><table><thead><tr><th>Preço de lista</th><th class="num" style="background:rgba(185,133,39,.12)">Ocupação necessária<small style="display:block;font-weight:500">para manter o resultado de hoje</small></th><th class="num">Volume necessário</th><th class="num">Preço efetivo</th><th class="num">Margem/kWh</th>${E.map(e => `<th class="num">Resultado/mês · ε ${String(e).replace(".", ",")}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="note" style="margin-top:10px"><strong>Ocupação</strong> = kWh vendidos ÷ (potência × horas disponíveis no mês). Hoje o carregador está em ${occTxt(occNow)} e, nas horas mais cheias, chega a ${fmt.pct1(peak)} da potência. A "ocupação necessária" é a que o carregador precisaria ter, naquele preço, para manter o resultado de hoje. <span style="color:var(--uby-green,#187457)"><strong>Verde</strong></span>: até 1,5× o que ele faz hoje (alcançável); <span style="color:#b98527"><strong>âmbar</strong></span>: até 2,5×; <span style="color:var(--uby-bad,#b75450)"><strong>vermelho</strong></span>: mais que isso ou impossível.</div>
        <div class="chart-box" style="height:280px;margin-top:14px"><canvas id="chSim"></canvas></div>
      </section>
      ${tierCards(s, p)}`;
  }

  // Tarifa seletiva: clientes frequentes e janela fora do pico.
  function tierCards(s, p) {
    const A = core(), f = s.freq, t = ui.tier, o = ui.off;
    const hours = []; for (let h = o.from; hours.length < 24 && h !== o.to; h = (h + 1) % 24) hours.push(h);
    const offBase = A.kwhInHours(s.profile, hours) * 30;
    const tierRes = A.segmentScenario(p, { baseKwh: f.kwh30, priceNow: f.price30 || p.price, priceNew: t.price, retainedKwh: f.kwh30 * t.retainedPct / 100, extraKwhPct: t.extra });
    const offRes = A.segmentScenario(p, { baseKwh: offBase, priceNow: p.price, priceNew: o.price, extraKwhPct: o.extra });
    const out = (r, base) => `<div class="grid g3" style="margin-top:10px">
        ${kpi("Margem por kWh", `${brl2(r.marginNow)} → ${brl2(r.marginNew)}`, r.marginNew <= 0 ? "preço abaixo do custo: não compensa" : "antes → depois", "", r.marginNew <= 0 ? "warn" : "")}
        ${kpi("Efeito no resultado/mês", brl2(r.delta), "com as hipóteses acima", "", r.delta < 0 ? "warn" : "lead")}
        ${kpi("Volume extra para empatar", r.extraKwhNeeded === null ? "impossível" : `${fmt.kwh0(r.extraKwhNeeded)}`, r.extraNeededPct === null ? "" : `${fmt.pct1(r.extraNeededPct)} sobre ${fmt.kwh0(base)}`)}</div>`;
    return `
      <div class="split" style="margin-top:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Tarifa seletiva</p><h2>Clientes frequentes</h2>
            <p>Só para quem tem ${A.DEFAULTS.frequentSessions}+ recargas neste carregador: ${fmt.int(f.clients)} cliente(s), ${fmt.int(f.active)} ativo(s), ${fmt.kwh0(f.kwh30)} nos últimos 30 dias a ${brl2(f.price30 || p.price)}/kWh (já com cupons).</p></div></div>
          ${f.clients ? `<div class="grid g3" id="prTier">
            ${inp("tierPrice", "Preço do frequente (R$/kWh)", t.price, "0.01")}
            ${inp("tierRetained", "kWh que sairiam sem a oferta (% do volume)", t.retainedPct, "1")}
            ${inp("tierExtra", "Volume novo atraído (%)", t.extra, "1")}</div>${out(tierRes, f.kwh30)}
            <small style="display:block;margin-top:6px">"Sairiam sem a oferta" é hipótese sua: nos últimos 30 dias o grupo mudou ${sign(f.kwhP30 ? (f.kwh30 / f.kwhP30 - 1) * 100 : 0)} contra os 30 anteriores.</small>` : `<div class="note">Ainda não há clientes frequentes neste carregador.</div>`}
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Tarifa seletiva</p><h2>Janela fora do pico</h2>
            <p>${hours.length} hora(s) por dia (${String(o.from).padStart(2, "0")}h às ${String(o.to).padStart(2, "0")}h) vendem hoje ${fmt.kwh0(offBase)} por mês neste carregador.</p></div></div>
          <div class="grid g4" id="prOff">
            ${inp("offFrom", "Das (hora)", o.from, "1", 'min="0" max="23"')}${inp("offTo", "Até (hora)", o.to, "1", 'min="0" max="23"')}
            ${inp("offPrice", "Preço na janela (R$/kWh)", o.price, "0.01")}${inp("offExtra", "Volume novo (% do atual)", o.extra, "1")}</div>${out(offRes, offBase)}
          <small style="display:block;margin-top:6px">Janela ociosa: quase todo o kWh vendido ali é novo; o risco é migrar cliente do horário cheio para o barato.</small>
        </section>
      </div>`;
  }

  function drawSim(pb) {
    const A = core(), s = siteOf(pb), p = paramsOf(s), E = ui.el;
    const xs = []; for (let l = 2.2; l >= 1.1 - 1e-9; l -= 0.05) xs.push(Math.round(l * 100) / 100);
    const PAL = UBY.PALETTE, base = Math.round(A.scenario(p, p.listNow, -1).resultNow);
    if (ui.chart) { try { ui.chart.destroy(); } catch (_) {} ui.chart = null; }
    ui.chart = UBY.chart("chSim", { type: "line", data: { labels: xs.map(x => x.toFixed(2).replace(".", ",")), datasets: [
      ...E.map((e, i) => ({ label: `ε ${String(e).replace(".", ",")}`, data: xs.map(l => Math.round(A.scenario(p, l, e).result)), borderColor: PAL[i % PAL.length], backgroundColor: PAL[i % PAL.length] + "20", fill: i === 0, tension: 0.42, pointRadius: 0, borderWidth: 2 })),
      { label: "Resultado de hoje", data: xs.map(() => base), borderColor: "#68746b", borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, fill: false }
    ] }, options: UBY.baseChartOptions({ scales: { x: { grid: { display: false }, title: { display: true, text: "preço de lista (R$/kWh)", font: { size: 10 } } }, y: { ticks: { callback: v => `R$ ${v}` } } } }) });
  }

  // ---------------------------------------------------------------- concorrência
  function concorrencia(pb) {
    const A = core(), refs = [1.19, 1.29, 1.39, 1.49, 1.59, 1.69, 1.79];
    const ourList = kind => { const l = pb.sites.filter(s => s.kind === kind).map(s => s.params.listNow).sort((a, b) => a - b); return l.length ? l[Math.floor(l.length / 2)] : 0; };
    const matrix = pb.sites.map(s => {
      const p = s.params, ratio = p.listNow > 0 ? p.price / p.listNow : 1, be = A.breakeven(p);
      return `<tr><td><strong>${esc(s.site)}</strong><small>${s.kind === "ac" ? "AC" : "DC"} · lista R$ ${p.listNow.toFixed(2).replace(".", ",")}${s.short ? " · base curta" : ""}</small></td>
        ${refs.map(r => { const m = A.margin(p, p.price * r / p.listNow); return `<td class="num">${m <= 0 ? `<span class="badge bad">${brl2(m)}</span>` : brl2(m)}</td>`; }).join("")}
        <td class="num"><strong>${floorTxt(be.priceVariable === null ? null : be.priceVariable / ratio)}</strong></td></tr>`;
    }).join("");
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Se igualássemos o preço de lista</p><h2>Margem por kWh em cada carregador</h2>
          <p>Cada coluna é um preço de lista possível (os cupons seguem na mesma proporção de hoje). Em vermelho, o kWh daria prejuízo só com os custos variáveis, antes dos custos fixos.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Carregador</th>${refs.map(r => `<th class="num">R$ ${r.toFixed(2).replace(".", ",")}</th>`).join("")}<th class="num">Lista mínima</th></tr></thead><tbody>${matrix}</tbody></table></div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Levantamento de mercado</p><h2>Preços dos concorrentes (${ui.comp.length})</h2>
          <p>Registre o que você vê na rua (aplicativo do concorrente, placa, cliente). Eles entram no simulador como pontos de comparação. <strong>Ficam salvos só neste navegador</strong>; para virar histórico compartilhado, a gravação em nuvem precisa ser liberada.</p></div></div>
        <div class="grid g6" id="prCompForm" style="align-items:end">
          ${field("Concorrente", `<input class="select" data-c="name" placeholder="nome" style="width:100%">`)}
          ${field("Onde", `<input class="select" data-c="place" placeholder="bairro / posto" style="width:100%">`)}
          ${field("Tipo", `<select class="select" data-c="type" style="width:100%"><option>DC</option><option>AC</option></select>`)}
          ${field("Preço (R$/kWh)", `<input class="select" data-c="price" type="number" step="0.01" placeholder="1,29" style="width:100%">`)}
          ${field("Observação", `<input class="select" data-c="note" placeholder="promoção, horário…" style="width:100%">`)}
          <button class="btn primary" type="button" id="prCompAdd">Adicionar</button></div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Concorrente</th><th>Onde</th><th>Tipo</th><th class="num">Preço</th><th class="num">Contra nossa lista</th><th>Visto em</th><th>Obs.</th><th></th></tr></thead>
          <tbody>${ui.comp.map(c => { const ours = ourList(c.type === "AC" ? "ac" : "dc"), d = ours ? (num(c.price) / ours - 1) * 100 : null;
            return `<tr><td><strong>${esc(c.name || "—")}</strong></td><td>${esc(c.place || "—")}</td><td>${esc(c.type)}</td><td class="num"><strong>${brl2(num(c.price))}</strong></td>
              <td class="num">${d === null ? "—" : badge(d <= -20 ? "bad" : d < 0 ? "warn" : "ok", sign(d))}<small>nossa lista ${ours ? brl2(ours) : "—"}</small></td><td>${esc(c.date || "")}</td><td style="white-space:normal">${esc(c.note || "")}</td>
              <td><button class="btn ghost" type="button" data-del="${esc(c.id)}">Remover</button></td></tr>`; }).join("") || `<tr><td colspan="8" class="empty">Nenhum preço registrado ainda. Os R$ 1,19 e R$ 1,29 já aparecem na tabela acima.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  // ---------------------------------------------------------------- reajustes
  function reajustes(pb) {
    const ev = pb.events;
    const conf = { media: ["warn", "média"], baixa: ["bad", "baixa"], insuficiente: ["neutral", "insuficiente"] };
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">O que já aconteceu</p><h2>Reajustes de preço de lista detectados (${ev.length})</h2>
          <p>Achados nos dados: o preço sem cupom mudou de patamar e ficou. Compara os kWh por semana antes e depois e calcula a sensibilidade implícita. <strong>Confira a confiança de cada caso</strong>: reajustes feitos nas primeiras semanas de um carregador novo se misturam com o crescimento natural do volume, então a sensibilidade fica pouco confiável.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Carregador</th><th>Data</th><th class="num">Preço</th><th class="num">kWh/semana</th><th class="num">Volume</th><th class="num">Sensibilidade</th><th>Confiança</th><th>Observação</th></tr></thead>
          <tbody>${ev.map(e => `<tr><td><strong>${esc(e.site)}</strong>${e.own ? "" : `<small>gestão P3 · fora da operação UBY</small>`}</td><td>${esc(e.date.split("-").reverse().join("/"))}</td>
            <td class="num">${brl2(e.priceFrom)} → ${brl2(e.priceTo)}<small>${sign(e.pricePct)}</small></td><td class="num">${fmt.kwh0(e.kwhWeekBefore)} → ${fmt.kwh0(e.kwhWeekAfter)}<small>${e.daysBefore} d antes · ${e.daysAfter} d depois</small></td>
            <td class="num">${e.volumePct === null ? "—" : sign(e.volumePct)}</td><td class="num">${e.elasticity === null ? "—" : e.elasticity.toFixed(1).replace(".", ",")}</td>
            <td>${badge(conf[e.confidence][0], conf[e.confidence][1])}</td><td style="white-space:normal">${esc(e.note)}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum reajuste de lista encontrado.</td></tr>`}</tbody></table></div>
        <div class="note" style="margin-top:10px">Para um preço mais baixo compensar, o volume precisa responder bem mais do que o observado: veja a coluna "volume necessário" no Simulador. Um teste de 4 semanas num carregador maduro, com cupom rastreável, é o jeito de medir de verdade.</div>
      </section>

      <section class="section"><div class="section-head"><div><p class="kicker">Escada de preços · últimos 90 dias</p><h2>Quanto cada patamar vendeu</h2><p>Patamares com 5+ recargas de 3 kWh ou mais. O preço de lista é o mais usado sem cupom; os demais são cupons (Clube UBY 10%, Parceiro UBY 15%).</p></div></div>
        <div class="grid g2" style="gap:18px">${pb.sites.map(s => `<div><strong>${esc(s.site)}</strong><div class="table-wrap" style="margin-top:6px"><table><thead><tr><th class="num">R$/kWh</th><th class="num">Recargas</th><th class="num">kWh</th><th>Cupom</th></tr></thead>
          <tbody>${s.ladder.slice(0, 8).map(t => `<tr><td class="num"><strong>${brl2(t.price)}</strong>${Math.abs(t.price - s.params.listNow) < 0.005 ? ` ${badge("neutral", "lista")}` : ""}</td><td class="num">${t.n}</td><td class="num">${fmt.kwh0(t.kwh)}</td>
            <td>${t.voucherN ? esc(Object.entries(t.vouchers).sort((a, b) => b[1] - a[1])[0][0]) : "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Sem patamares.</td></tr>`}</tbody></table></div></div>`).join("")}</div>
      </section>`;
  }

  // ---------------------------------------------------------------- capacidade
  function idleRanges(util, thr) {
    const out = []; let start = null;
    for (let h = 0; h <= 24; h += 1) {
      const idle = h < 24 && util[h] < thr;
      if (idle && start === null) start = h;
      if (!idle && start !== null) { out.push([start, h - 1]); start = null; }
    }
    return out.map(([a, b]) => a === b ? `${String(a).padStart(2, "0")}h` : `${String(a).padStart(2, "0")}h–${String(b).padStart(2, "0")}h`).join(" · ") || "—";
  }
  function carga(pb) {
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Últimas 8 semanas</p><h2>Energia vendida por hora do dia</h2><p>Média de kWh por dia em cada hora. A utilização é esse kWh dividido pela potência do carregador: mostra quanto da capacidade fica parada.</p></div></div>
        <div class="chart-box" style="height:300px"><canvas id="chLoad"></canvas></div>
        <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Carregador</th><th class="num">Potência</th><th class="num">kWh/dia</th><th class="num">Utilização média</th><th class="num">Pico (hora cheia)</th><th>Horas com menos de 5% de uso</th></tr></thead>
          <tbody>${pb.sites.map(s => { const pr = s.profile, pk = pr.util.indexOf(pr.peakUtil);
            return `<tr><td><strong>${esc(s.site)}</strong>${s.short ? "<small>base curta</small>" : ""}</td><td class="num">${fmt.n1(s.power)} kW</td><td class="num">${fmt.kwh0(pr.totalPerDay)}</td><td class="num">${fmt.pct1(pr.avgUtil * 100)}</td>
              <td class="num">${fmt.pct1(pr.peakUtil * 100)}<small>às ${String(pk).padStart(2, "0")}h</small></td><td style="white-space:normal">${esc(idleRanges(pr.util, 0.05))}</td></tr>`; }).join("")}</tbody></table></div>
        <div class="note" style="margin-top:10px">Utilização baixa em todas as horas significa que capacidade não é o problema: preço promocional só faz sentido onde cada kWh extra deixa margem positiva (veja a aba Concorrência). Fila só passaria a existir se o volume multiplicasse por 2 ou 3 nas horas de pico.</div>
      </section>`;
  }
  function drawLoad(pb) {
    const PAL = UBY.PALETTE;
    UBY.chart("chLoad", { type: "line", data: { labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}h`), datasets: pb.sites.map((s, i) => ({ label: s.site, data: s.profile.kwhPerDay.map(v => Math.round(v * 10) / 10),
      borderColor: PAL[i % PAL.length], backgroundColor: PAL[i % PAL.length] + "26", fill: true, tension: 0.42, pointRadius: 0, borderWidth: 2 })) },
      options: UBY.baseChartOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => `${v} kWh` } } } }) });
  }

  // ---------------------------------------------------------------- render
  function render(target, params) {
    const tab = TABS.some(([id]) => id === params[0]) ? params[0] : "simulador";
    let pb;
    try { pb = UBY.data("pricingBase"); } catch (err) { target.innerHTML = `<section class="section"><div class="note">Não foi possível ler os dados de preço: ${esc(err.message)}</div></section>`; return; }
    if (!pb.sites.length) { target.innerHTML = `<section class="section"><div class="note">Sem carregador próprio com financeiro calculado para simular.</div></section>`; return; }
    if (!pb.sites.some(s => s.ref === ui.site)) ui.site = (pb.sites.find(s => !s.short) || pb.sites[0]).ref;
    const body = tab === "simulador" ? simulador(pb) : tab === "concorrencia" ? concorrencia(pb) : tab === "reajustes" ? reajustes(pb) : carga(pb);
    target.innerHTML = head(tab, pb) + body;
    target.querySelectorAll("#prTabs button").forEach(b => b.onclick = () => UBY.go(`#/precos/${b.dataset.tab}`));

    if (tab === "simulador") {
      const out = target.querySelector("#prOut");
      const bindOut = () => {
        out.querySelectorAll("[data-el]").forEach(el => el.onchange = () => { const i = Number(el.dataset.el); ui.el[i] = num(el.value) || ui.el[i]; refresh(); });
        const bindGroup = (id, map) => out.querySelectorAll(`#${id} input`).forEach(el => el.oninput = () => { map[el.dataset.k](num(el.value)); clearTimeout(el._t); el._t = setTimeout(refresh, 350); });
        bindGroup("prTier", { tierPrice: v => { ui.tier.price = v; }, tierRetained: v => { ui.tier.retainedPct = v; }, tierExtra: v => { ui.tier.extra = v; } });
        bindGroup("prOff", { offFrom: v => { ui.off.from = Math.max(0, Math.min(23, Math.round(v))); }, offTo: v => { ui.off.to = Math.max(0, Math.min(23, Math.round(v))); }, offPrice: v => { ui.off.price = v; }, offExtra: v => { ui.off.extra = v; } });
      };
      const refresh = () => { out.innerHTML = simOut(pb); drawSim(pb); bindOut(); };
      refresh();
      target.querySelector("#prSite").onchange = e => { ui.site = e.target.value; render(target, ["simulador"]); };
      target.querySelector("#prReset")?.addEventListener("click", () => { delete ui.edits[ui.site]; render(target, ["simulador"]); });
      target.querySelectorAll("#prParams input").forEach(el => el.oninput = () => {
        const k = el.dataset.k, v = num(el.value);
        (ui.edits[ui.site] = ui.edits[ui.site] || {})[k] = k === "pctCost" ? v / 100 : v;
        target.querySelector("#prReset").hidden = false; target.querySelector("#prFromFin").hidden = true;
        clearTimeout(el._t); el._t = setTimeout(refresh, 300);
      });
    }
    if (tab === "concorrencia") {
      target.querySelector("#prCompAdd").onclick = () => {
        const get = k => target.querySelector(`#prCompForm [data-c="${k}"]`).value.trim();
        const price = num(get("price"));
        if (!(price > 0)) { alert("Informe o preço por kWh."); return; }
        ui.comp.push({ id: `c${Date.now()}`, name: get("name"), place: get("place"), type: get("type"), price, note: get("note"), date: new Date().toLocaleDateString("pt-BR") });
        writeComp(); render(target, ["concorrencia"]);
      };
      target.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { ui.comp = ui.comp.filter(c => c.id !== b.dataset.del); writeComp(); render(target, ["concorrencia"]); });
    }
    if (tab === "carga") drawLoad(pb);
  }

  UBY.register("precos", { render });
})();

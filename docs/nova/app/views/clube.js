/* Clube UBY — ranking mensal de pontos (R$ 1 = 1 ponto), benefícios e cadastro do formulário. */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  let selected = "";
  const mask = () => { try { return localStorage.getItem("uby-nova-mask") === "1"; } catch (_) { return false; } };
  const who = n => mask() ? String(n || "").split(/\s+/).map(p => p ? p[0] + "•••" : "").join(" ") : esc(n);

  function render(target) {
    const c = UBY.data("club", selected || undefined);
    const s = c.summary, f = c.form;
    const top = c.rows.slice(0, 3);
    const medal = ["#c6a13a", "#9aa39c", "#a0663f"];
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · Clube UBY</p><h1>Clube UBY</h1>
        <p class="lead">Competição mensal: cada R$ 1 gasto em carregador da operação UBY vale 1 ponto. Top 3 ganham 30% em alinhamento e balanceamento; todos têm 10% na rede Muffatão Autocenter.</p></div>
        <div class="callout"><strong>Prêmio exige grupo Clube UBY + cadastro preenchido</strong><small>O cruzamento com o formulário é só leitura: nunca altera receita, pontos ou a base de recargas.</small></div></div>
      <div class="toolbar"><label>Competição <select class="select" id="clubMonth">${c.months.slice().reverse().map(m => `<option value="${m.key}" ${m.key === c.monthKey ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>
        <span class="spacer"></span><button class="btn" id="copyNotice">Copiar aviso dos vencedores</button></div>

      <section class="section"><div class="grid g5">
        ${kpi("Participantes no mês", fmt.int(s.participants), `consumo pago em ${esc(c.label)}`, "", "lead")}
        ${kpi("Pontos do mês", fmt.int(s.points), "1 ponto por real gasto")}
        ${kpi("Receita do mês", fmt.brl(s.revenue), "base do ranking")}
        ${kpi("Com telefone", fmt.int(s.withPhone), s.participants ? `${fmt.pct1(s.withPhone / s.participants * 100)} dos participantes` : "")}
        ${kpi("Cadastro no formulário", fmt.int(s.registered), s.participants ? `${fmt.pct1(s.registered / s.participants * 100)} do ranking` : "")}
      </div></section>

      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Pódio · ${esc(c.label)}</p><h2>Top 3</h2></div></div>
          <div class="grid g3">${top.map((r, i) => `<div class="panel" style="border-top:3px solid ${medal[i]}"><p class="kicker" style="color:${medal[i]}">${i + 1}º lugar</p><h3 style="font-size:15px">${who(r.name)}</h3>
            <p style="margin:6px 0 0;font-size:22px;font-weight:850;color:var(--uby-forest)">${fmt.int(r.points)} pts</p><small>${fmt.brl(r.revenue)} · ${r.sessions} recarga(s)</small><br>
            <span class="badge ${r.registered ? "ok" : "warn"}" style="margin-top:6px">${r.registered ? "cadastro ok" : "sem cadastro"}</span></div>`).join("") || `<div class="note">Ainda sem pontuação no mês.</div>`}</div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Formulário do Clube</p><h2>Cadastros</h2><p>${f.endpoint ? "Endpoint seguro configurado." : "Endpoint seguro não configurado."} ${f.updatedAt ? `Última sincronização ${fmt.dt(f.updatedAt)}.` : "Sem sincronização neste navegador ainda."}</p></div></div>
          <div class="grid g2">${kpi("Cadastrados", fmt.int(f.total), "respostas do formulário")}${kpi("Com LGPD", fmt.int(f.lgpd), f.total ? fmt.pct1(f.lgpd / f.total * 100) : "")}
            ${kpi("Com veículo", fmt.int(f.withVehicle), "marca, modelo ou placa")}${kpi("Com consumo UBY", fmt.int(f.matched), "cruzados com o ranking")}</div>
          <p class="source-line">Lista completa de participantes, parceiros e cupons: <a href="#/clube-classico">Clube UBY · clássico</a>.</p>
        </section>
      </div>

      <section class="section"><div class="section-head"><div><p class="kicker">Ranking completo</p><h2>${esc(c.label)} · ${c.rows.length} participante(s)</h2></div></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>#</th><th>Cliente</th><th class="num">Pontos do mês</th><th class="num">Pontos acumulados</th><th class="num">Faturamento</th><th class="num">Energia</th><th class="num">Recargas</th><th>Cadastro</th><th>Benefício</th></tr></thead>
          <tbody>${c.rows.map(r => `<tr><td>${r.position}</td><td><strong>${who(r.name)}</strong><small>${mask() ? "•••" : esc(r.phone || r.email || "")}</small></td><td class="num"><strong>${fmt.int(r.points)}</strong></td><td class="num">${fmt.int(r.accumulatedPoints)}</td>
            <td class="num">${fmt.brl(r.revenue)}</td><td class="num">${fmt.kwh(r.energy)}</td><td class="num">${r.sessions}</td><td><span class="badge ${r.registered ? "ok" : "neutral"}">${r.registered ? "sim" : "não"}</span></td><td style="white-space:normal;min-width:220px"><small>${esc(r.benefit)}</small></td></tr>`).join("") || `<tr><td colspan="9" class="empty">Sem participantes.</td></tr>`}</tbody></table></div>
      </section>`;

    target.querySelector("#clubMonth").onchange = e => { selected = e.target.value; render(target); };
    target.querySelector("#copyNotice").onclick = async () => {
      try { await navigator.clipboard.writeText(c.notice); alert("Aviso copiado. Valide grupo e cadastro antes de enviar."); }
      catch (_) { window.prompt("Copie o aviso abaixo:", c.notice); }
    };
  }

  UBY.register("clube", { render });
})();

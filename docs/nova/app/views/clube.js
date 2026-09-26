/*
  Clube UBY — ranking mensal (R$ 1 = 1 ponto), participantes, parceiros e cupons.
  A base do Clube fica na nuvem (uby_financial_matrix, linha "club-uby"): vale em
  qualquer computador/celular. Participantes do formulário vêm do Google Forms.
  Gravação: página mínima oculta (legado/obra-ev/clube-gravacao.html), liberada
  só na rota #/clube e só para a linha do Clube (ver supabase_bridge.js).
*/
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const ui = { tab: "ranking", month: "", partnerForm: null, search: "", msg: null, busy: false };
  const mask = () => { try { return localStorage.getItem("uby-nova-mask") === "1"; } catch (_) { return false; } };
  const who = n => mask() ? String(n || "").split(/\s+/).map(p => p ? p[0] + "•••" : "").join(" ") : esc(n);
  const priv = v => mask() ? "•••" : esc(v || "");
  const STATUS = { active: ["Ativo", "ok"], prospect: ["Em negociação", "warn"], paused: ["Pausado", "neutral"] };
  const PRIORITY = { high: "Alta", medium: "Média", low: "Baixa" };

  // ---------- gravação (quadro oculto) ----------
  let frame = null, ready = null;
  function writer() {
    if (ready && frame && document.body.contains(frame)) return ready;
    frame = document.createElement("iframe");
    frame.id = "clubFrame"; frame.title = "Gravação do Clube"; frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:10px;height:10px;left:-99999px;top:0;border:0;visibility:hidden";
    frame.src = "legado/obra-ev/clube-gravacao.html?t=" + Date.now();
    document.body.appendChild(frame);
    ready = new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        try {
          const w = frame.contentWindow;
          if (w.UBY_SUPABASE && w.supabase) { w.UBY_SUPABASE.client(); if (w.UBY_WRITE_SCOPE === "clube") { clearInterval(timer); resolve(w); return; } }
        } catch (_) {}
        if (Date.now() - t0 > 30000) { clearInterval(timer); reject(new Error("A gravação do Clube não ficou disponível. Recarregue a página.")); }
      }, 300);
    });
    ready.catch(() => { ready = null; });
    return ready;
  }
  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/clube") && frame) { frame.remove(); frame = null; ready = null; } });

  async function save(label, mutate, summary) {
    if (ui.busy) return;
    ui.busy = true; ui.msg = { ok: true, text: `${label}: gravando…` }; paint();
    try {
      const w = await writer();
      await w.UBY_SUPABASE.saveClubData(mutate, { acao: summary || label });
      ui.msg = { ok: true, text: `${label}: salvo na nuvem.` };
      await load(true);
    } catch (err) { ui.msg = { ok: false, text: `${label}: ${err.message || err}` }; }
    finally { ui.busy = false; paint(); }
  }

  // ---------- dados ----------
  let data = null, target = null;
  async function load(force) {
    data = await UBY.state.api.clubData(ui.month || undefined, force);
    ui.month = data.monthKey;
  }
  function legacyLocal() {
    const read = k => { try { return JSON.parse(window.__novaLegacyRead?.(k) || "null"); } catch (_) { return null; } };
    const partners = read("uby-club-partners-v1");
    const coupons = read("uby-club-coupon-control-v1");
    const participants = read("uby-club-participants-v1");
    const out = {
      partners: Array.isArray(partners) ? partners : [],
      coupons: Array.isArray(coupons) ? coupons : Array.isArray(coupons?.rows) ? coupons.rows : [],
      participants: Array.isArray(participants) ? participants : Array.isArray(participants?.rows) ? participants.rows : []
    };
    out.any = out.partners.length + out.coupons.length + out.participants.length > 0;
    return out;
  }
  const mergeBy = (current, incoming, keyOf) => { const m = new Map((current || []).map(r => [keyOf(r), r])); (incoming || []).forEach(r => m.set(keyOf(r), { ...(m.get(keyOf(r)) || {}), ...r })); return [...m.values()]; };
  const partnerKey = p => p.id || String(p.name || "").toLowerCase();
  const couponKey = r => r.key || [r.dateKey, r.coupon, r.name, r.email, r.phone, Number(r.value || 0).toFixed(2)].join("|");
  const participantKey = r => r.key || [String(r.email || "").toLowerCase(), String(r.phone || "").replace(/\D/g, ""), String(r.name || "").toLowerCase()].join("|");
  const defaultPartners = () => [
    { id: "partner-muffatao", name: "Muffatão Autocenter", category: "Auto center", status: "active", benefit: "10% de desconto em todos os serviços da rede Muffatão Autocenter.", rule: "Válido para participantes do Clube UBY mediante comprovação no atendimento.", coupon: "CLUBEUBY", contact: "", validity: "Sem prazo", priority: "high", usageCount: 0, notes: "Benefício geral para todos os participantes do Clube UBY." },
    { id: "partner-bancouros", name: "Bancouros", category: "Parceiro comercial", status: "prospect", benefit: "Benefício a definir.", rule: "Definir regra comercial, público elegível e forma de comprovação.", coupon: "", contact: "", validity: "A definir", priority: "medium", usageCount: 0, notes: "" },
    { id: "partner-lava-cars", name: "Lava Cars", category: "Lavagem / estética", status: "prospect", benefit: "Benefício a definir para lavagem, higienização ou estética automotiva.", rule: "Definir regra comercial, unidades participantes e comprovação.", coupon: "", contact: "", validity: "A definir", priority: "medium", usageCount: 0, notes: "" }
  ];

  // ---------- telas ----------
  function rankingTab(c) {
    const s = c.summary, f = c.form, top = c.rows.slice(0, 3), medal = ["#c6a13a", "#9aa39c", "#a0663f"];
    return `
      <section class="section"><div class="grid g5">
        ${kpi("Participantes no mês", fmt.int(s.participants), `consumo pago em ${esc(c.label)}`, "", "lead")}
        ${kpi("Pontos do mês", fmt.int(s.points), "1 ponto por real gasto")}
        ${kpi("Receita do mês", fmt.brl(s.revenue), "base do ranking")}
        ${kpi("Com telefone", fmt.int(s.withPhone), s.participants ? `${fmt.pct1(s.withPhone / s.participants * 100)} dos participantes` : "")}
        ${kpi("Cadastro no formulário", fmt.int(s.registered), s.participants ? `${fmt.pct1(s.registered / s.participants * 100)} do ranking` : "")}
      </div></section>
      <div class="split" style="margin-bottom:18px">
        <section class="section"><div class="section-head"><div><p class="kicker">Pódio · ${esc(c.label)}</p><h2>Top 3</h2></div><button class="btn" id="copyNotice" type="button">Copiar aviso dos vencedores</button></div>
          <div class="grid g3">${top.map((r, i) => `<div class="panel" style="border-top:3px solid ${medal[i]}"><p class="kicker" style="color:${medal[i]}">${i + 1}º lugar</p><h3 style="font-size:15px">${who(r.name)}</h3>
            <p style="margin:6px 0 0;font-size:22px;font-weight:850;color:var(--uby-forest)">${fmt.int(r.points)} pts</p><small>${fmt.brl(r.revenue)} · ${r.sessions} recarga(s)</small><br>
            <span class="badge ${r.registered ? "ok" : "warn"}" style="margin-top:6px">${r.registered ? "cadastro ok" : "sem cadastro"}</span></div>`).join("") || `<div class="note">Ainda sem pontuação no mês.</div>`}</div>
        </section>
        <section class="section"><div class="section-head"><div><p class="kicker">Formulário do Clube</p><h2>Cadastros</h2><p>${f.endpoint ? "Formulário conectado." : "Formulário não conectado."} ${f.updatedAt ? `Última leitura ${fmt.dt(f.updatedAt)}.` : ""}</p></div></div>
          <div class="grid g2">${kpi("Cadastrados", fmt.int(f.total), "respostas do formulário + importados")}${kpi("Com LGPD", fmt.int(f.lgpd), f.total ? fmt.pct1(f.lgpd / f.total * 100) : "")}
            ${kpi("Com veículo", fmt.int(f.withVehicle), "marca, modelo ou placa")}${kpi("Com consumo UBY", fmt.int(f.matched), "no ranking do mês")}</div>
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Ranking completo</p><h2>${esc(c.label)} · ${c.rows.length} participante(s)</h2></div></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>#</th><th>Cliente</th><th class="num">Pontos do mês</th><th class="num">Pontos acumulados</th><th class="num">Faturamento</th><th class="num">Energia</th><th class="num">Recargas</th><th>Cadastro</th><th>Benefício</th></tr></thead>
          <tbody>${c.rows.map(r => `<tr><td>${r.position}</td><td><strong>${who(r.name)}</strong><small>${priv(r.phone || r.email)}</small></td><td class="num"><strong>${fmt.int(r.points)}</strong></td><td class="num">${fmt.int(r.accumulatedPoints)}</td>
            <td class="num">${fmt.brl(r.revenue)}</td><td class="num">${fmt.kwh(r.energy)}</td><td class="num">${r.sessions}</td><td><span class="badge ${r.registered ? "ok" : "neutral"}">${r.registered ? "sim" : "não"}</span></td><td style="white-space:normal;min-width:220px"><small>${esc(r.benefit)}</small></td></tr>`).join("") || `<tr><td colspan="9" class="empty">Sem participantes.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function participantsTab(c) {
    const q = ui.search.trim().toLowerCase();
    const list = c.participantsList.filter(p => !q || [p.name, p.email, p.phone, p.plate, p.vehicle].join(" ").toLowerCase().includes(q))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Participantes</p><h2>${fmt.int(c.participantsList.length)} cadastro(s)</h2>
          <p>Vêm do formulário do Clube (Google Forms) e de planilhas importadas. As importações ficam guardadas na nuvem (${fmt.int(c.manualParticipants)} registro(s)); o formulário é lido direto do Google.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="clubSync" type="button">↻ Ler formulário agora</button>
            <label class="btn" style="cursor:pointer">⇪ Importar planilha (CSV/Excel)<input id="clubPartImport" type="file" accept=".csv,.xlsx,.xls" hidden></label></div></div>
        <div class="toolbar"><input class="select" id="clubSearch" placeholder="Buscar por nome, e-mail, telefone ou placa" value="${esc(ui.search)}" style="min-width:320px"><span class="spacer"></span><small>${list.length} exibido(s)</small></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Participante</th><th>Contato</th><th>Veículo</th><th>LGPD</th><th>Regulamento</th><th>Consome na UBY</th><th>Benefício desejado</th><th>Cadastro</th></tr></thead>
          <tbody>${list.slice(0, 400).map(p => `<tr><td><strong>${who(p.name)}</strong></td><td><small>${priv(p.phone)}<br>${priv(p.email)}</small></td><td><small>${esc(p.vehicle || "—")}${p.plate ? ` · ${priv(p.plate)}` : ""}</small></td>
            <td><span class="badge ${p.lgpd ? "ok" : "warn"}">${p.lgpd ? "sim" : "não"}</span></td><td><span class="badge ${p.regulation ? "ok" : "warn"}">${p.regulation ? "sim" : "não"}</span></td>
            <td><span class="badge ${p.consumes ? "ok" : "neutral"}">${p.consumes ? "sim" : "ainda não"}</span></td><td style="white-space:normal;min-width:180px"><small>${esc(p.desiredBenefit || "—")}</small></td><td><small>${p.createdAt ? fmt.date(p.createdAt) : "—"}</small></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum participante${q ? " com essa busca" : ""}.</td></tr>`}</tbody></table></div>
      </section>`;
  }

  function partnersTab(c) {
    const partners = c.partners.slice().sort((a, b) => ({ active: 0, prospect: 1, paused: 2 }[a.status] ?? 3) - ({ active: 0, prospect: 1, paused: 2 }[b.status] ?? 3) || String(a.name).localeCompare(String(b.name), "pt-BR"));
    const f = ui.partnerForm || (ui.partnerForm = { id: "", name: "", category: "", status: "active", benefit: "", rule: "", coupon: "", contact: "", validity: "", priority: "medium", usageCount: 0, notes: "" });
    const inp = (k, label, type = "text", extra = "") => `<label class="imp-field" style="min-width:0"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span><input class="select" data-pf="${k}" type="${type}" value="${esc(f[k] ?? "")}" ${extra} style="width:100%"></label>`;
    const sel = (k, label, opts) => `<label class="imp-field" style="min-width:0"><span style="font-size:10.5px;color:var(--uby-muted);font-weight:760">${esc(label)}</span><select class="select" data-pf="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[k]) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    return `
      <section class="section"><div class="grid g4">
        ${kpi("Parceiros", fmt.int(partners.length), "base de parcerias do clube", "", "lead")}${kpi("Ativos", fmt.int(partners.filter(p => p.status === "active").length), `${partners.filter(p => p.status === "prospect").length} em negociação`)}
        ${kpi("Usos registrados", fmt.int(partners.reduce((s, p) => s + Number(p.usageCount || 0), 0)), "controle manual de benefícios")}${kpi("Prioridade alta", fmt.int(partners.filter(p => p.priority === "high").length), "acompanhar de perto")}
      </div></section>
      <div class="split" style="margin-bottom:14px">
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">Parcerias</p><h2>Benefícios do Clube</h2></div>${!partners.length ? `<button class="btn" id="clubDefaults" type="button">Criar parceiros iniciais</button>` : ""}</div>
          <div class="table-wrap"><table><thead><tr><th>Parceiro</th><th>Situação</th><th>Benefício</th><th>Cupom</th><th class="num">Usos</th><th>Validade</th><th></th></tr></thead>
            <tbody>${partners.map(p => { const st = STATUS[p.status] || STATUS.prospect; return `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.category || "—")} · prioridade ${esc(PRIORITY[p.priority] || "—")}</small></td>
              <td><span class="badge ${st[1]}">${st[0]}</span></td><td style="white-space:normal;min-width:220px"><small>${esc(p.benefit || "—")}${p.rule ? `<br><em>${esc(p.rule)}</em>` : ""}</small></td><td>${esc(p.coupon || "—")}</td><td class="num">${fmt.int(p.usageCount || 0)}</td><td><small>${esc(p.validity || "—")}</small></td>
              <td style="white-space:nowrap"><button class="btn ghost" data-p-edit="${esc(p.id)}" type="button">Editar</button><button class="btn ghost" data-p-del="${esc(p.id)}" type="button" style="color:var(--uby-red)">Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">Nenhuma parceria na nuvem ainda.</td></tr>`}</tbody></table></div>
        </section>
        <section class="section" style="margin:0"><div class="section-head"><div><p class="kicker">${f.id ? "Editando" : "Nova parceria"}</p><h2>${f.id ? esc(f.name) : "Cadastrar parceiro"}</h2></div></div>
          <div class="grid g2" style="gap:8px">
            ${inp("name", "Nome do parceiro")}${inp("category", "Categoria")}
            ${sel("status", "Situação", [["active", "Ativo"], ["prospect", "Em negociação"], ["paused", "Pausado"]])}${sel("priority", "Prioridade", [["high", "Alta"], ["medium", "Média"], ["low", "Baixa"]])}
            ${inp("coupon", "Cupom")}${inp("validity", "Validade")}
            ${inp("contact", "Contato")}${inp("usageCount", "Usos registrados", "number", 'min="0" step="1"')}
          </div>
          ${inp("benefit", "Benefício")}${inp("rule", "Regra / comprovação")}${inp("notes", "Observações")}
          <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="clubPartnerSave" type="button" ${ui.busy ? "disabled" : ""}>${f.id ? "Salvar alterações" : "Cadastrar parceiro"}</button>${f.id ? `<button class="btn" id="clubPartnerNew" type="button">Novo</button>` : ""}</div>
        </section>
      </div>`;
  }

  function couponsTab(c) {
    const k = c.coupons;
    return `
      <section class="section"><div class="section-head"><div><p class="kicker">Cupons · ${esc(c.label)}</p><h2>Controle de usos de cupons</h2>
          <p>Base independente: importe a planilha de usos (relatório da Spott ou do parceiro). Reenviar a mesma planilha não duplica. ${c.couponsMeta.updatedAt ? `Última importação ${fmt.dt(c.couponsMeta.updatedAt)}${c.couponsMeta.source ? ` · ${esc(c.couponsMeta.source)}` : ""}.` : "Nenhuma importação na nuvem ainda."} ${k.total} registro(s) no total${k.undated ? `, ${k.undated} sem data (fora do recorte mensal)` : ""}.</p></div>
          <label class="btn primary" style="cursor:pointer">⇪ Importar planilha de usos<input id="clubCouponImport" type="file" accept=".csv,.xlsx,.xls" multiple hidden></label></div>
        <div class="grid g5">
          ${kpi("Usos no mês", fmt.int(k.uses), "lançamentos da base de cupons", "", "lead")}${kpi("Cruzados com o Clube", fmt.int(k.clubMatches), k.uses ? `${fmt.pct1(k.clubMatches / k.uses * 100)} com cadastro` : "")}
          ${kpi("Valor final com cupom", fmt.brl(k.value), "valor cobrado")}${kpi("Descontos", fmt.brl(k.discount), "pela porcentagem do cupom")}
          ${kpi("Faturamento dos clientes cruzados", fmt.brl(k.clientsRevenue), "todas as recargas no mês")}
        </div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Por cupom</p><h2>Resumo do mês</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Cupom</th><th class="num">Usos</th><th class="num">Com cadastro</th><th class="num">Clientes que recarregaram</th><th class="num">Valor final</th><th class="num">Desconto</th><th class="num">Faturamento dos clientes</th></tr></thead>
          <tbody>${k.groups.map(g => `<tr><td><strong>${esc(g.coupon)}</strong></td><td class="num">${g.uses}</td><td class="num">${g.clubMatches}</td><td class="num">${g.clients}</td><td class="num">${fmt.brl(g.value)}</td><td class="num">${fmt.brl(g.discount)}</td><td class="num"><strong>${fmt.brl(g.revenue)}</strong></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum uso de cupom neste mês.</td></tr>`}</tbody></table></div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Lançamentos</p><h2>Usos do mês</h2></div></div>
        <div class="table-wrap" style="max-height:480px"><table><thead><tr><th>Data</th><th>Cupom</th><th>Cliente</th><th>Parceiro</th><th class="num">Valor</th><th class="num">Desconto</th><th></th></tr></thead>
          <tbody>${k.rows.map(r => `<tr><td>${r.dateKey ? fmt.date(r.dateKey + "T12:00:00") : "—"}</td><td>${esc(r.coupon || "—")}</td><td>${who(r.name)}<small>${priv(r.phone || r.email)}</small></td><td>${esc(r.partner || "—")}</td><td class="num">${fmt.brl(r.value)}</td><td class="num">${fmt.brl(r.discount)}</td>
            <td><button class="btn ghost" data-c-del="${esc(r.key)}" type="button" style="color:var(--uby-red)">✕</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Sem lançamentos.</td></tr>`}</tbody></table></div></section>`;
  }

  function paint() {
    if (!target || !data || !location.hash.startsWith("#/clube")) return;
    const c = data;
    const legacy = legacyLocal();
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Rede de recargas · Clube UBY</p><h1>Clube UBY</h1>
        <p class="lead">Competição mensal: cada R$ 1 gasto em carregador da operação UBY vale 1 ponto. Top 3 ganham 30% em alinhamento e balanceamento; todos têm 10% na rede Muffatão Autocenter.</p></div>
        <div class="callout" style="border-left-color:var(--uby-red)"><strong>Grava na nuvem</strong><small>Parceiros, cupons e importações ficam na base (linha própria do Clube), iguais em qualquer computador. Nunca alteram receita, pontos ou a base de recargas.</small></div></div>
      ${c.cloud.error ? `<div class="note" style="border-color:var(--uby-red);margin-bottom:12px">Não consegui ler o Clube na nuvem: ${esc(c.cloud.error)}</div>` : ""}
      ${legacy.any && c.cloud.legacyImportedAt ? `<p class="source-line" style="margin:0 0 10px">Dados deste navegador já importados para a nuvem em ${fmt.dt(c.cloud.legacyImportedAt)}. <a href="#" id="clubLegacyImport">Importar de novo</a> (junta, não duplica).</p>` : ""}
      ${legacy.any && !c.cloud.legacyImportedAt ? `<div class="note" style="margin-bottom:12px;border-color:var(--uby-amber)"><strong>Dados do Clube encontrados neste navegador (plataforma atual)</strong><br>${legacy.partners.length} parceiro(s), ${legacy.coupons.length} uso(s) de cupom e ${legacy.participants.length} participante(s) guardados só neste computador. Importe para a nuvem para não perder e usar em qualquer lugar (junta com o que já existe, sem apagar nada). <button class="btn primary" id="clubLegacyImport" type="button" style="margin-left:6px" ${ui.busy ? "disabled" : ""}>Importar para a nuvem</button></div>` : ""}
      ${ui.msg ? `<div class="note" style="margin-bottom:12px;border-color:${ui.msg.ok ? "var(--uby-green, #1f9d55)" : "var(--uby-red)"}">${esc(ui.msg.text)}</div>` : ""}
      <div class="toolbar">
        <div class="seg" id="clubTabs">${[["ranking", "Ranking"], ["participantes", "Participantes"], ["parceiros", "Parceiros"], ["cupons", "Cupons"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.tab === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="spacer"></span>
        ${ui.tab === "ranking" || ui.tab === "cupons" ? `<label>Competição <select class="select" id="clubMonth">${c.months.slice().reverse().map(m => `<option value="${m.key}" ${m.key === c.monthKey ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>` : ""}
      </div>
      ${ui.tab === "participantes" ? participantsTab(c) : ui.tab === "parceiros" ? partnersTab(c) : ui.tab === "cupons" ? couponsTab(c) : rankingTab(c)}`;
    bind();
  }

  function bind() {
    const $ = s => target.querySelector(s);
    target.querySelectorAll("#clubTabs button").forEach(b => b.onclick = () => { ui.tab = b.dataset.v; ui.msg = null; paint(); });
    if ($("#clubMonth")) $("#clubMonth").onchange = async e => { ui.month = e.target.value; await load(false); paint(); };
    if ($("#copyNotice")) $("#copyNotice").onclick = async () => {
      try { await navigator.clipboard.writeText(data.notice); alert("Aviso copiado. Valide grupo e cadastro antes de enviar."); }
      catch (_) { window.prompt("Copie o aviso abaixo:", data.notice); }
    };
    // participantes
    if ($("#clubSearch")) $("#clubSearch").oninput = e => { ui.search = e.target.value; clearTimeout(bind.t); bind.t = setTimeout(() => { paint(); const el = target.querySelector("#clubSearch"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); };
    if ($("#clubSync")) $("#clubSync").onclick = async () => {
      ui.msg = { ok: true, text: "Lendo o formulário…" }; paint();
      try { const r = await UBY.state.api.clubSyncForm(); ui.msg = { ok: true, text: `Formulário lido: ${r.total} participante(s) no cadastro.` }; await load(false); }
      catch (err) { ui.msg = { ok: false, text: `Formulário: ${err.message || err}` }; }
      paint();
    };
    if ($("#clubPartImport")) $("#clubPartImport").onchange = async e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      try {
        let rows = [];
        for (const f of files) rows = rows.concat(await UBY.state.api.clubParseSheet(f, "participants"));
        if (!rows.length) { ui.msg = { ok: false, text: "Não encontrei participantes na planilha (precisa da coluna Nome completo, E-mail ou WhatsApp)." }; paint(); return; }
        await save(`Importação de ${rows.length} participante(s)`, p => { p.participants = { rows: mergeBy(p.participants?.rows, rows, participantKey), updatedAt: new Date().toISOString(), source: files.map(f => f.name).join(", ") }; return p; }, "import_participants");
      } catch (err) { ui.msg = { ok: false, text: `Importação: ${err.message || err}` }; paint(); }
    };
    // parceiros
    target.querySelectorAll("[data-pf]").forEach(el => el.onchange = () => { ui.partnerForm[el.dataset.pf] = el.dataset.pf === "usageCount" ? Number(el.value || 0) : el.value; });
    target.querySelectorAll("[data-p-edit]").forEach(b => b.onclick = () => { const p = data.partners.find(x => x.id === b.dataset.pEdit); if (p) { ui.partnerForm = { ...p }; paint(); } });
    if ($("#clubPartnerNew")) $("#clubPartnerNew").onclick = () => { ui.partnerForm = null; paint(); };
    if ($("#clubPartnerSave")) $("#clubPartnerSave").onclick = () => {
      target.querySelectorAll("[data-pf]").forEach(el => { ui.partnerForm[el.dataset.pf] = el.dataset.pf === "usageCount" ? Number(el.value || 0) : el.value; });
      const f = { ...ui.partnerForm, name: String(ui.partnerForm.name || "").trim() };
      if (!f.name) { ui.msg = { ok: false, text: "Informe o nome do parceiro." }; paint(); return; }
      f.id = f.id || `partner-${Date.now().toString(36)}`; f.updatedAt = new Date().toISOString();
      ui.partnerForm = null;
      save(`Parceiro ${f.name}`, p => { p.partners = (p.partners || []).filter(x => x.id !== f.id).concat(f); return p; }, "save_partner");
    };
    target.querySelectorAll("[data-p-del]").forEach(b => b.onclick = () => {
      const p = data.partners.find(x => x.id === b.dataset.pDel);
      if (!p || !confirm(`Excluir a parceria ${p.name}?`)) return;
      save(`Parceiro ${p.name} excluído`, d => { d.partners = (d.partners || []).filter(x => x.id !== p.id); return d; }, "delete_partner");
    });
    if ($("#clubDefaults")) $("#clubDefaults").onclick = () => save("Parceiros iniciais", d => { d.partners = mergeBy(d.partners, defaultPartners().map(x => ({ ...x, updatedAt: new Date().toISOString() })), partnerKey); return d; }, "default_partners");
    // cupons
    if ($("#clubCouponImport")) $("#clubCouponImport").onchange = async e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      try {
        let rows = [];
        for (const f of files) rows = rows.concat(await UBY.state.api.clubParseSheet(f, "coupons"));
        if (!rows.length) { ui.msg = { ok: false, text: "Não encontrei usos de cupom na planilha (precisa da coluna Cupom/Código)." }; paint(); return; }
        await save(`Importação de ${rows.length} uso(s) de cupom`, d => { d.coupons = { rows: mergeBy(d.coupons?.rows, rows, couponKey), updatedAt: new Date().toISOString(), source: files.map(f => f.name).join(", ") }; return d; }, "import_coupons");
      } catch (err) { ui.msg = { ok: false, text: `Importação: ${err.message || err}` }; paint(); }
    };
    target.querySelectorAll("[data-c-del]").forEach(b => b.onclick = () => {
      if (!confirm("Remover este uso de cupom da base?")) return;
      const key = b.dataset.cDel;
      save("Uso de cupom removido", d => { d.coupons = { ...(d.coupons || {}), rows: (d.coupons?.rows || []).filter(r => couponKey(r) !== key) }; return d; }, "delete_coupon_use");
    });
    // importação do navegador (plataforma atual)
    if ($("#clubLegacyImport")) $("#clubLegacyImport").onclick = () => {
      const l = legacyLocal();
      if (!confirm(`Importar para a nuvem ${l.partners.length} parceiro(s), ${l.coupons.length} uso(s) de cupom e ${l.participants.length} participante(s) deste navegador? Junta com o que já existe; nada é apagado.`)) return;
      save("Importação do navegador", d => {
        d.partners = mergeBy(d.partners, l.partners, partnerKey);
        d.coupons = { rows: mergeBy(d.coupons?.rows, l.coupons, couponKey), updatedAt: new Date().toISOString(), source: "importado do navegador (plataforma atual)" };
        d.participants = { rows: mergeBy(d.participants?.rows, l.participants, participantKey), updatedAt: new Date().toISOString(), source: "importado do navegador (plataforma atual)" };
        d.legacyImportedAt = new Date().toISOString();
        return d;
      }, "import_legacy_browser");
    };
  }

  async function render(el) {
    target = el;
    el.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Abrindo o Clube UBY</h2><p>Lendo ranking, participantes, parceiros e cupons.</p></div>`;
    try { await load(false); } catch (err) { el.innerHTML = `<div class="loading"><h2>Não foi possível abrir o Clube</h2><p>${esc(err.message || err)}</p></div>`; return; }
    paint();
    writer().catch(() => {});
  }

  UBY.register("clube", { render });
})();

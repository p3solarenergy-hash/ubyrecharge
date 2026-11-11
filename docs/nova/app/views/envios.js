/*
  Envios WhatsApp (#/envios) — comando das campanhas de mensagem aos clientes.
  Usuário (09/11/2026): "quero que vc coloque uma pagina dentro da plataforma para acompanharmos esse
  processo de envio e recebimento das msgs, pra que eu possa comandar por la isso".
  Tudo passa pela função wa-painel do Supabase (exige login de admin); a tela não lê nem grava as
  tabelas wa_* direto. O envio em si continua no agendamento (wa-disparo, 1 por minuto no máximo).
*/
(function () {
  "use strict";
  const { esc, fmt } = UBY;
  const IMG_PADRAO = "https://ubyrecharge.net.br/nova/assets/clube/beneficio-liberado.jpg";
  const MSG_PADRAO = [
    "Olá, {nome}! ⚡",
    "Você já recarregou com a UBY, então já faz parte do *Clube UBY*: sem cadastro e sem custo.",
    "",
    "🍽️ *R2 Choperia*: 10% no almoço (pesagem)",
    "🍤 *Rio Beach*: 10% em qualquer porção",
    "🔧 *Muffatão Autocenter*: 10% em todos os serviços",
    "🚗 *Bancouros*: volante e capas de banco com preço especial",
    "",
    "Para usar: no caixa do parceiro, aponte a câmera para o QR da UBY e toque em *USAR AGORA*.",
    "Todos os benefícios: {link}",
    "",
    "_Responda SAIR para não receber mais avisos._"
  ].join("\n");
  const STATUS = { pendente: ["Na fila", "warn"], processando: ["Enviando", "warn"], enviado: ["Enviada", "ok"], pulado: ["Pulada", ""], erro: ["Erro", "bad"] };
  const FILTROS = [["", "Todos"], ["pendente", "Na fila"], ["enviado", "Enviadas"], ["nao_lidos", "Enviadas e não lidas"], ["lidos", "Lidas"], ["cliques", "Clicaram no link"], ["pulado", "Puladas"], ["erro", "Com erro"]];

  const ui = { tab: "painel", camp: "", msg: null, busy: false, estado: null, envios: null, envFiltro: "", envBusca: "", respostas: null, publico: null, aberto: "", draft: null, nova: null };
  let target = null, timer = null;

  // ---------- conexão (sessão do motor já aberto na plataforma) ----------
  async function client() {
    for (let i = 0; i < 100; i++) {
      try {
        const sb = document.getElementById("motorFrame")?.contentWindow?.UBY_SUPABASE?.client?.();
        if (sb) return sb;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error("A conexão com o banco não abriu. Recarregue a página.");
  }
  async function api(acao, body = {}) {
    const sb = await client();
    const { data, error } = await sb.functions.invoke("wa-painel", { body: { acao, ...body } });
    if (error) {
      let m = error.message || String(error);
      try { const j = await error.context.json(); m = j.mensagem || j.message || j.msg || m; } catch (_) {}
      if (/401|jwt|unauthor/i.test(m)) m = "Sua sessão expirou. Entre de novo na plataforma.";
      throw new Error(m);
    }
    if (!data?.ok) throw new Error(data?.mensagem || "Não deu certo. Tente de novo.");
    return data;
  }

  // ---------- utilidades ----------
  const dt = v => v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : "—";
  const telFmt = t => { const d = String(t || "").replace(/\D/g, "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t || ""; };
  const camp = () => (ui.estado?.campanhas || []).find(c => c.campanha === ui.camp) || null;
  // Prévia como no WhatsApp: *negrito*, _itálico_, {nome} e {link}
  function whats(texto, nome = "Maria") {
    const t = esc(String(texto || "").replaceAll("{nome}", nome).replaceAll("{link}", "ubyrecharge.net.br/nova/beneficio.html?c=…"));
    return t.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>").replace(/(^|\s)_([^_\n]+)_/g, "$1<em>$2</em>").replace(/\n/g, "<br>");
  }
  function bubble(texto, imagem) {
    return `<div style="max-width:340px;background:#e7f8dc;border-radius:12px;padding:6px;box-shadow:0 1px 2px rgba(0,0,0,.15);font-size:12.5px;line-height:1.45;color:#111">
      ${imagem ? `<img src="${esc(imagem)}" alt="Imagem da mensagem" style="width:100%;border-radius:9px;display:block;margin-bottom:6px" onerror="this.replaceWith(Object.assign(document.createElement('div'),{textContent:'(imagem ainda não publicada neste endereço)',style:'font-size:11px;color:#8b6419;padding:6px'}))">` : ""}
      <div style="padding:2px 6px 4px">${whats(texto)}</div></div>`;
  }
  function note(m) {
    if (!m) return "";
    return `<div class="note" style="margin-bottom:12px;border-color:${m.ok ? "var(--uby-green, #1f9d55)" : "var(--uby-red)"}">${esc(m.text)}</div>`;
  }
  async function act(fn, okText) {
    if (ui.busy) return;
    ui.busy = true; ui.msg = null; paint();
    try { const r = await fn(); ui.msg = okText ? { ok: true, text: typeof okText === "function" ? okText(r) : okText } : null; }
    catch (err) { ui.msg = { ok: false, text: err.message || String(err) }; }
    finally { ui.busy = false; }
    paint();
  }
  async function loadEstado() {
    ui.estado = await api("estado");
    const ids = ui.estado.campanhas.map(c => c.campanha);
    if (!ids.includes(ui.camp)) ui.camp = ui.estado.config.campanha && ids.includes(ui.estado.config.campanha) ? ui.estado.config.campanha : ids[0] || "";
  }

  // ---------- cabeçalho ----------
  function header() {
    const e = ui.estado, cfg = e.config, w = e.whatsapp || {};
    const ativa = e.campanhas.find(c => c.campanha === cfg.campanha);
    const pendAtiva = ativa?.resumo?.pendentes || 0;
    const wpill = w.conectado === true ? `<span class="pill"><span class="dot"></span>WhatsApp conectado</span>`
      : w.conectado === false ? `<span class="pill err"><span class="dot"></span>WhatsApp desconectado</span>` : `<span class="pill warn"><span class="dot"></span>WhatsApp sem resposta</span>`;
    const epill = cfg.ativo ? `<span class="pill"><span class="dot"></span>Envio ligado</span>` : `<span class="pill warn"><span class="dot"></span>Envio pausado</span>`;
    return `<section class="section"><div class="section-head"><div><p class="kicker">Clube UBY · WhatsApp</p><h2>Envios WhatsApp</h2>
        <p>Campanha ativa: <strong>${esc(ativa?.titulo || cfg.campanha || "nenhuma")}</strong> · ${fmt.int(pendAtiva)} na fila · até ${fmt.int(cfg.limite_dia)} por dia, das ${cfg.hora_inicio}h às ${cfg.hora_fim}h, uma a cada ${Math.round(cfg.intervalo_min_seg / 60)}–${Math.round((cfg.intervalo_min_seg + cfg.intervalo_extra_seg) / 60)} min.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${wpill}${epill}
          ${cfg.ativo ? `<button class="btn" id="waPausar" type="button" ${ui.busy ? "disabled" : ""}>Pausar envio</button>`
            : `<button class="btn primary" id="waLigar" type="button" ${ui.busy || !pendAtiva ? "disabled" : ""} title="${pendAtiva ? "" : "A campanha ativa não tem ninguém na fila"}">Ligar envio</button>`}
          <button class="btn" id="waAtualizar" type="button" ${ui.busy ? "disabled" : ""}>Atualizar</button></div></div>
      ${cfg.erros_seguidos >= 3 ? `<div class="note" style="border-color:var(--uby-red)">O envio parou sozinho depois de 3 erros seguidos. Veja a aba Envios → "Com erro" antes de ligar de novo.</div>` : ""}
      ${!e.statusAtivo ? `<div class="callout" style="margin-top:10px"><strong>Entregue e lido ainda não são registrados</strong><small>Falta ligar na Z-API o aviso de status das mensagens. Sem ele a tela mostra enviadas, cliques, respostas e usos, mas não quem leu. <button class="btn" id="waLigarStatus" type="button" style="margin-left:6px" ${ui.busy ? "disabled" : ""}>Ligar aviso de entregue/lido</button></small></div>` : ""}
    </section>`;
  }

  // ---------- Painel ----------
  function funil(r) {
    const env = r.enviados || 0;
    const linhas = [["Enviadas", env, ""], ["Entregues", r.entregues, pct(r.entregues, env)], ["Lidas", r.lidos, pct(r.lidos, env)], ["Clicaram no link", r.cliques, pct(r.cliques, env)],
      ["Responderam", r.respostas, pct(r.respostas, env)], ["Usaram um benefício", r.usaram, pct(r.usaram, env)], ["Pediram para sair", r.sairam, pct(r.sairam, env)]];
    const max = Math.max(env, 1);
    return `<div style="display:grid;gap:7px">${linhas.map(([l, v, p], i) => `<div style="display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;font-size:12px">
      <span>${l}</span><span style="height:12px;border-radius:6px;background:var(--uby-line);overflow:hidden"><span style="display:block;height:100%;width:${Math.max(v ? 2 : 0, v / max * 100)}%;background:${i === 6 ? "var(--uby-red)" : i === 5 ? "var(--uby-citrus, #b9c52b)" : "var(--uby-green)"};border-radius:6px"></span></span>
      <strong style="text-align:right">${fmt.int(v || 0)} <small style="color:var(--uby-muted);font-weight:600">${p}</small></strong></div>`).join("")}</div>`;
  }
  function painelTab() {
    const c = camp(), cfg = ui.estado.config;
    if (!c) return `<section class="section"><p>Nenhuma campanha ainda. Crie a primeira na aba <strong>Nova campanha</strong>.</p></section>`;
    const r = c.resumo || {}, ativa = c.campanha === cfg.campanha;
    const d = ui.draft && ui.draft.campanha === c.campanha ? ui.draft : (ui.draft = { campanha: c.campanha, titulo: c.titulo || "", mensagem: c.mensagem, imagem_url: c.imagem_url || "" });
    const semLeitura = !ui.estado.statusAtivo && r.enviados > 0;
    return `<section class="section">
        <div class="section-head"><div><p class="kicker">${ativa ? "Campanha ativa" : "Campanha"} · criada em ${dt(c.criada_em)}</p><h2>${esc(c.titulo || c.campanha)}</h2>
          <p>${r.primeiro_envio ? `Envios de ${dt(r.primeiro_envio)} a ${dt(r.ultimo_envio)}.` : "Nenhuma mensagem enviada ainda."} ${fmt.int(r.total || 0)} contato(s) na campanha.</p></div>
          ${ativa ? `<span class="pill"><span class="dot"></span>É a campanha que o envio usa</span>` : `<button class="btn primary" id="waAtivar" type="button" ${ui.busy ? "disabled" : ""}>Usar esta campanha no envio</button>`}</div>
        <div class="kpis">
          ${UBY.kpi("Na fila", fmt.int(r.pendentes || 0), `${fmt.int(r.pulados || 0)} pulada(s) · ${fmt.int(r.erros || 0)} com erro`)}
          ${UBY.kpi("Enviadas", fmt.int(r.enviados || 0), r.total ? `${pct(r.enviados, r.total)} da campanha` : "")}
          ${UBY.kpi("Lidas", semLeitura && !r.lidos ? "—" : fmt.int(r.lidos || 0), semLeitura && !r.lidos ? "aviso de lido desligado" : `${pct(r.lidos, r.enviados)} das enviadas`)}
          ${UBY.kpi("Clicaram no link", fmt.int(r.cliques || 0), `${pct(r.cliques, r.enviados)} das enviadas`)}
          ${UBY.kpi("Usaram benefício", fmt.int(r.usaram || 0), "uso confirmado no QR depois de receber")}
        </div>
        <div style="margin-top:14px">${funil(r)}</div>
        <p class="source-line" style="margin-top:8px">Respostas não contam o "SAIR". "Usaram benefício" = uso confirmado no QR de um parceiro depois de receber a mensagem (pelo celular ou e-mail do cliente). Cliques só existem nas mensagens com {link}.</p>
      </section>
      <section class="section"><div class="section-head"><div><p class="kicker">Mensagem desta campanha</p><h2>Texto e imagem</h2>
          <p>Use <strong>{nome}</strong> para o primeiro nome e <strong>{link}</strong> para o link pessoal (conta o clique). *negrito* e _itálico_ como no WhatsApp. Mudanças valem para as próximas mensagens.</p></div></div>
        <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px">
          <div style="display:grid;gap:8px">
            <label class="imp-field">Nome da campanha <input class="select" style="cursor:text;width:100%" id="waTitulo" value="${esc(d.titulo)}" maxlength="80"></label>
            <label class="imp-field">Mensagem <textarea class="select" id="waMensagem" rows="15" style="width:100%;height:auto;padding:8px;white-space:pre-wrap;overflow:auto;resize:vertical;cursor:text;font-family:inherit;line-height:1.45">${esc(d.mensagem)}</textarea></label>
            ${imagemCampos("waImg", d.imagem_url)}
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="waSalvar" type="button" ${ui.busy ? "disabled" : ""}>Salvar mensagem</button></div>
            <div style="border-top:1px solid var(--uby-line);padding-top:10px;display:grid;gap:6px">
              <strong style="font-size:12px">Enviar um teste agora</strong>
              <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="select" id="waTesteTel" placeholder="Seu celular com DDD" style="cursor:text;max-width:200px"><input class="select" id="waTesteNome" placeholder="Nome no teste (opcional)" style="cursor:text;max-width:200px">
              <button class="btn" id="waTeste" type="button" ${ui.busy ? "disabled" : ""}>Enviar teste</button></div>
              <small style="color:var(--uby-muted)">Manda o texto e a imagem que estão na tela (mesmo sem salvar). O teste não entra na fila nem nos números.</small>
            </div>
          </div>
          <div><p class="kicker" style="margin-bottom:6px">Prévia</p><div id="waPrevia" style="background:#efe7dd;border-radius:12px;padding:14px">${bubble(d.mensagem, d.imagem_url)}</div></div>
        </div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Mais gente nesta campanha</p><h2>Adicionar público</h2><p>Coloca na fila quem se encaixa e ainda não está nesta campanha. Quem pediu para sair nunca entra.</p></div></div>
        ${publicoCampos("waAdd")}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" id="waAddCalc" type="button" ${ui.busy ? "disabled" : ""}>Calcular</button><button class="btn primary" id="waAddFila" type="button" ${ui.busy ? "disabled" : ""}>Adicionar à fila</button></div>
        ${ui.publico?.para === "add" ? publicoResultado() : ""}
      </section>`;
  }
  function imagemCampos(id, url) {
    return `<div style="display:grid;gap:6px"><label class="imp-field">Imagem (endereço público) <input class="select" style="cursor:text;width:100%" id="${id}" value="${esc(url || "")}" placeholder="Sem imagem: só texto"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label class="btn" style="cursor:pointer">Escolher imagem do computador<input type="file" accept="image/jpeg,image/png,image/webp" id="${id}Arq" hidden></label>
      <button class="btn" type="button" data-img-padrao="${id}">Usar a arte "Benefício liberado"</button><button class="btn" type="button" data-img-limpa="${id}">Sem imagem</button></div></div>`;
  }
  function publicoCampos(p) {
    const outras = (ui.estado.campanhas || []).map(c => `<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-excluir="${p}" value="${esc(c.campanha)}"> já recebeu "${esc(c.titulo || c.campanha)}"</label>`).join("");
    return `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
        <label class="imp-field">Recargas pagas, no mínimo <select class="select" id="${p}Min">${[1, 2, 3, 5, 10].map(n => `<option value="${n}" ${n === 2 ? "selected" : ""}>${n === 1 ? "1 (todos)" : n}</option>`).join("")}</select></label>
        <label class="imp-field">Recarregou nos últimos <select class="select" id="${p}Dias"><option value="">qualquer época</option>${[30, 60, 90, 180].map(n => `<option value="${n}" ${n === 90 ? "selected" : ""}>${n} dias</option>`).join("")}</select></label></div>
      ${outras ? `<div style="margin-top:8px"><small style="color:var(--uby-muted)">Deixar de fora quem…</small><div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">${outras}</div></div>` : ""}`;
  }
  function lerPublico(p) {
    return { min: Number(target.querySelector(`#${p}Min`)?.value || 1), dias: Number(target.querySelector(`#${p}Dias`)?.value || 0) || null,
      excluir: [...target.querySelectorAll(`[data-excluir="${p}"]:checked`)].map(i => i.value) };
  }
  function publicoResultado() {
    const r = ui.publico;
    return `<div class="note" style="margin-top:10px"><strong>${fmt.int(r.total)} cliente(s)</strong> com celular nesse público · ${fmt.int(r.frequentes)} com 5+ recargas · ${fmt.int(r.recentes30)} recarregaram nos últimos 30 dias.
      ${r.total ? `<div class="table-wrap" style="margin-top:8px;max-height:260px"><table><thead><tr><th>Cliente (amostra, maiores primeiro)</th><th class="num">Recargas</th><th class="num">Gasto</th><th>Última</th></tr></thead><tbody>
        ${r.amostra.map(a => `<tr><td>${esc(a.nome || "(sem nome)")}</td><td class="num">${fmt.int(a.recargas)}</td><td class="num">${fmt.brl(a.gasto)}</td><td>${dt(a.ultima)}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>`;
  }

  // ---------- Nova campanha ----------
  function novaTab() {
    const n = ui.nova || (ui.nova = { titulo: "", mensagem: MSG_PADRAO, imagem_url: IMG_PADRAO });
    return `<section class="section"><div class="section-head"><div><p class="kicker">Nova campanha</p><h2>Mensagem, imagem e público</h2>
        <p>Criar a campanha só monta a fila: nada é enviado até você escolher "Usar esta campanha no envio" e ligar o envio. Faça um teste no seu celular antes.</p></div></div>
      <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px">
        <div style="display:grid;gap:8px">
          <label class="imp-field">Nome da campanha <input class="select" style="cursor:text;width:100%" id="waNovaTitulo" value="${esc(n.titulo)}" placeholder="Ex.: Clube UBY · todos os parceiros · nov/2026" maxlength="80"></label>
          <label class="imp-field">Mensagem <textarea class="select" id="waNovaMensagem" rows="15" style="width:100%;height:auto;padding:8px;white-space:pre-wrap;overflow:auto;resize:vertical;cursor:text;font-family:inherit;line-height:1.45">${esc(n.mensagem)}</textarea></label>
          ${imagemCampos("waNovaImg", n.imagem_url)}
        </div>
        <div><p class="kicker" style="margin-bottom:6px">Prévia</p><div id="waNovaPrevia" style="background:#efe7dd;border-radius:12px;padding:14px">${bubble(n.mensagem, n.imagem_url)}</div></div>
      </div></section>
      <section class="section"><div class="section-head"><div><p class="kicker">Para quem</p><h2>Público</h2><p>Clientes com recarga paga na rede UBY e celular no cadastro, um por número, dos que mais gastaram para os que menos gastaram. Quem pediu para sair nunca entra.</p></div></div>
        ${publicoCampos("waNova")}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="waNovaCalc" type="button" ${ui.busy ? "disabled" : ""}>Calcular público</button>
          <button class="btn primary" id="waNovaCriar" type="button" ${ui.busy ? "disabled" : ""}>Criar campanha e montar a fila</button></div>
        ${ui.publico?.para === "nova" ? publicoResultado() : ""}
      </section>`;
  }

  // ---------- Envios ----------
  function enviosTab() {
    const camps = ui.estado.campanhas;
    const e = ui.envios;
    return `<section class="section"><div class="section-head"><div><p class="kicker">Mensagem por mensagem</p><h2>Envios</h2><p>Quem está na fila, quem recebeu, leu e clicou. Dá para tirar alguém da fila (pular) ou devolver.</p></div></div>
      <div class="toolbar" style="flex-wrap:wrap;gap:8px">
        <select class="select" id="waEnvCamp">${camps.map(c => `<option value="${esc(c.campanha)}" ${c.campanha === ui.camp ? "selected" : ""}>${esc(c.titulo || c.campanha)}</option>`).join("")}</select>
        <select class="select" id="waEnvFiltro">${FILTROS.map(([v, l]) => `<option value="${v}" ${v === ui.envFiltro ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="select" id="waEnvBusca" placeholder="Buscar nome ou celular" value="${esc(ui.envBusca)}" style="cursor:text;max-width:220px">
        <button class="btn" id="waEnvIr" type="button">Buscar</button>
        <span class="spacer"></span>${e ? `<small>${fmt.int(e.total || 0)} contato(s)${e.linhas.length < (e.total || 0) ? `, mostrando ${fmt.int(e.linhas.length)}` : ""}</small>` : ""}
      </div>
      ${!e ? `<p>Carregando…</p>` : !e.linhas.length ? `<p>Ninguém com esse filtro.</p>` : `<div class="table-wrap" style="max-height:560px"><table><thead><tr><th class="num">#</th><th>Cliente</th><th>Celular</th><th>Situação</th><th>Enviada</th><th>Entregue</th><th>Lida</th><th>Clicou</th><th></th></tr></thead><tbody>
        ${e.linhas.map(l => { const [lab, cls] = STATUS[l.status] || [l.status, ""]; return `<tr><td class="num">${l.ordem}</td><td>${esc(l.nome || "")}</td><td>${esc(telFmt(l.telefone))}</td>
          <td><span class="badge ${cls}" title="${esc(l.erro || "")}">${lab}</span>${l.erro && l.status !== "enviado" ? `<br><small style="color:var(--uby-muted)">${esc(String(l.erro).slice(0, 60))}</small>` : ""}</td>
          <td>${dt(l.enviado_em)}</td><td>${dt(l.entregue_em)}</td><td>${dt(l.lido_em)}</td><td>${dt(l.clicou_em)}</td>
          <td>${l.status === "pendente" ? `<button class="btn" data-pular="${l.id}" type="button">Pular</button>` : l.status === "pulado" && l.erro !== "pediu para sair" ? `<button class="btn" data-voltar="${l.id}" type="button">Voltar à fila</button>` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>
        ${e.linhas.length < (e.total || 0) ? `<button class="btn" id="waEnvMais" type="button" style="margin-top:8px">Mostrar mais</button>` : ""}`}
    </section>`;
  }

  // ---------- Respostas ----------
  function respostasTab() {
    const rs = ui.respostas;
    if (!rs) return `<section class="section"><p>Carregando respostas…</p></section>`;
    const conv = new Map();
    rs.forEach(r => { const k = String(r.telefone).replace(/\D/g, "").slice(-8); if (!conv.has(k)) conv.set(k, { tel: r.telefone, cliente: r.cliente, nome: r.nome, campanha: r.campanha, msgs: [] }); const c = conv.get(k); c.msgs.push(r); if (!c.cliente && r.cliente) c.cliente = r.cliente; if ((!c.nome || c.nome === "UBY") && !r.de_nos) c.nome = r.nome; });
    const lista = [...conv.values()];
    const titulo = c => { const camp = ui.estado.campanhas.find(x => x.campanha === c.campanha); return camp ? camp.titulo || camp.campanha : c.campanha; };
    return `<section class="section"><div class="section-head"><div><p class="kicker">O que os clientes responderam</p><h2>Respostas</h2>
        <p>${fmt.int(lista.length)} conversa(s), da mais recente para a mais antiga. Respostas automáticas de empresas também aparecem aqui. Quem escreveu SAIR já saiu da lista sozinho.</p></div></div>
      ${!lista.length ? `<p>Nenhuma resposta ainda.</p>` : `<div style="display:grid;gap:8px">${lista.map(c => {
        const k = String(c.tel).replace(/\D/g, "").slice(-8), ultima = c.msgs[0], aberto = ui.aberto === k, sair = c.msgs.some(m => m.pediu_sair);
        const nossa = ultima.de_nos;
        return `<div style="border:1px solid var(--uby-line);border-radius:12px;padding:10px 12px;background:var(--uby-surface)">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;cursor:pointer" data-conv="${k}">
            <strong>${esc(c.cliente || c.nome || "Sem nome")}</strong><small style="color:var(--uby-muted)">${esc(telFmt(c.tel))}${c.campanha ? ` · ${esc(titulo(c))}` : ""}</small>
            ${sair ? `<span class="badge bad">Pediu para sair</span>` : nossa ? `<span class="badge ok">Respondida</span>` : `<span class="badge warn">Aguardando</span>`}
            <span class="spacer" style="flex:1"></span><small style="color:var(--uby-muted)">${dt(ultima.recebido_em)}</small></div>
          <div style="font-size:12px;margin-top:4px;color:var(--uby-ink, #233)">${nossa ? "<em>Você:</em> " : ""}${esc(String(ultima.texto || "").slice(0, 160))}</div>
          ${aberto ? `<div style="margin-top:10px;display:grid;gap:6px;max-height:320px;overflow:auto">${c.msgs.slice().reverse().map(m => `<div style="justify-self:${m.de_nos ? "end" : "start"};max-width:80%;background:${m.de_nos ? "#e7f8dc" : "#f2f4f3"};border-radius:10px;padding:6px 9px;font-size:12px;white-space:pre-wrap">${esc(m.texto || "")}<div style="font-size:10px;color:var(--uby-muted);margin-top:2px">${dt(m.recebido_em)}</div></div>`).join("")}</div>
            ${sair ? "" : `<div style="display:flex;gap:8px;margin-top:8px"><textarea class="select" id="waResp-${k}" rows="2" placeholder="Escreva a resposta" style="width:100%;height:auto;padding:8px;white-space:pre-wrap;overflow:auto;resize:vertical;cursor:text;flex:1;font-family:inherit"></textarea><button class="btn primary" data-responder="${k}" data-tel="${esc(c.tel)}" type="button" ${ui.busy ? "disabled" : ""}>Enviar</button></div>`}` : ""}
        </div>`; }).join("")}</div>`}
    </section>`;
  }

  // ---------- Ajustes ----------
  function ajustesTab() {
    const c = ui.estado.config;
    const campo = (id, label, v, min, max, suf) => `<label class="imp-field">${label} <span style="display:flex;gap:6px;align-items:center"><input class="select" type="number" id="${id}" value="${v}" min="${min}" max="${max}" style="cursor:text;max-width:110px">${suf}</span></label>`;
    return `<section class="section"><div class="section-head"><div><p class="kicker">Ritmo do envio</p><h2>Ajustes</h2>
        <p>Mandar devagar protege o número contra bloqueio do WhatsApp. O agendamento roda a cada minuto e manda no máximo uma mensagem por vez, respeitando estes limites.</p></div></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:end">
        ${campo("waCfgLimite", "Limite por dia", c.limite_dia, 1, 200, "mensagens")}
        ${campo("waCfgIni", "Começa às", c.hora_inicio, 6, 21, "h")}
        ${campo("waCfgFim", "Para às", c.hora_fim, 7, 22, "h")}
        ${campo("waCfgMin", "Intervalo mínimo", Math.round(c.intervalo_min_seg / 60), 1, 60, "min")}
        ${campo("waCfgExtra", "+ até (sorteado)", Math.round(c.intervalo_extra_seg / 60), 0, 60, "min")}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="waCfgSalvar" type="button" ${ui.busy ? "disabled" : ""}>Salvar ajustes</button>
        <button class="btn" id="waLigarStatus2" type="button" ${ui.busy ? "disabled" : ""}>Ligar (de novo) o aviso de entregue/lido na Z-API</button></div>
      <p class="source-line" style="margin-top:10px">Os textos sempre terminam com "Responda SAIR…": quem responde SAIR, PARAR ou STOP sai de todas as campanhas na hora.</p>
    </section>`;
  }

  // ---------- desenho ----------
  // A área das telas é a mesma para todas: fora de #/envios esta tela não pode se redesenhar
  // (usuário, 11/11/2026: a cada atualização ela aparecia por cima da tela que ele estava vendo).
  const naTela = () => /^#\/envios(\/|$|\?)/.test(location.hash);
  function paint() {
    if (!target || !naTela()) return;
    if (!ui.estado) return;
    const sel = ui.estado.campanhas.length > 1 && ui.tab === "painel"
      ? `<label class="imp-field">Campanha <select class="select" id="waCamp">${ui.estado.campanhas.map(c => `<option value="${esc(c.campanha)}" ${c.campanha === ui.camp ? "selected" : ""}>${esc(c.titulo || c.campanha)}${c.campanha === ui.estado.config.campanha ? " (ativa)" : ""}</option>`).join("")}</select></label>` : "";
    target.innerHTML = `${header()}${note(ui.msg)}
      <div class="toolbar"><div class="seg" id="waTabs">${[["painel", "Painel"], ["nova", "Nova campanha"], ["envios", "Envios"], ["respostas", "Respostas"], ["ajustes", "Ajustes"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.tab === v ? "on" : ""}">${l}</button>`).join("")}</div><span class="spacer"></span>${sel}</div>
      ${ui.tab === "nova" ? novaTab() : ui.tab === "envios" ? enviosTab() : ui.tab === "respostas" ? respostasTab() : ui.tab === "ajustes" ? ajustesTab() : painelTab()}`;
    bind();
  }

  async function loadEnvios(mais) {
    const off = mais && ui.envios ? ui.envios.linhas.length : 0;
    const r = await api("envios", { campanha: ui.camp, status: ui.envFiltro, busca: ui.envBusca, offset: off });
    ui.envios = mais && ui.envios ? { total: r.total, linhas: ui.envios.linhas.concat(r.linhas) } : { total: r.total, linhas: r.linhas };
  }
  async function loadRespostas() { ui.respostas = (await api("respostas")).linhas; }
  function lerArquivo(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(new Error("Não consegui ler a imagem.")); fr.readAsDataURL(file); });
  }

  function bind() {
    const $ = s => target.querySelector(s);
    target.querySelectorAll("#waTabs button").forEach(b => b.onclick = async () => {
      ui.tab = b.dataset.v; ui.msg = null; ui.publico = null; paint();
      try {
        if (ui.tab === "envios") { ui.envios = null; paint(); await loadEnvios(); paint(); }
        if (ui.tab === "respostas") { await loadRespostas(); paint(); }
      } catch (err) { ui.msg = { ok: false, text: err.message }; paint(); }
    });
    if ($("#waCamp")) $("#waCamp").onchange = e => { ui.camp = e.target.value; ui.draft = null; ui.publico = null; paint(); };
    if ($("#waAtualizar")) $("#waAtualizar").onclick = () => act(async () => { await loadEstado(); if (ui.tab === "envios") await loadEnvios(); if (ui.tab === "respostas") await loadRespostas(); });
    if ($("#waLigar")) $("#waLigar").onclick = () => {
      const c = ui.estado.campanhas.find(x => x.campanha === ui.estado.config.campanha);
      if (!confirm(`Ligar o envio da campanha "${c?.titulo || ui.estado.config.campanha}"? ${fmt.int(c?.resumo?.pendentes || 0)} pessoa(s) na fila, até ${ui.estado.config.limite_dia} por dia.`)) return;
      act(async () => { await api("ligar", { ativo: true }); await loadEstado(); }, "Envio ligado. As mensagens saem no ritmo dos ajustes, só no horário permitido.");
    };
    if ($("#waPausar")) $("#waPausar").onclick = () => act(async () => { await api("ligar", { ativo: false }); await loadEstado(); }, "Envio pausado. Quem está na fila continua lá.");
    ["#waLigarStatus", "#waLigarStatus2"].forEach(id => { if ($(id)) $(id).onclick = () => act(async () => { await api("ligar_status"); await loadEstado(); }, "Aviso de entregue/lido ligado na Z-API. Vale para as próximas mensagens."); });
    if ($("#waAtivar")) $("#waAtivar").onclick = () => {
      if (ui.estado.config.ativo && !confirm("O envio está ligado. Trocar a campanha faz as próximas mensagens saírem desta. Continuar?")) return;
      act(async () => { await api("ativar", { campanha: ui.camp }); await loadEstado(); }, "Pronto: esta é a campanha do envio. Ligue o envio quando quiser começar.");
    };

    // imagem (painel e nova campanha)
    const preview = () => {
      if ($("#waMensagem") && $("#waPrevia")) { ui.draft = { campanha: ui.camp, titulo: $("#waTitulo").value, mensagem: $("#waMensagem").value, imagem_url: $("#waImg").value.trim() }; $("#waPrevia").innerHTML = bubble(ui.draft.mensagem, ui.draft.imagem_url); }
      if ($("#waNovaMensagem") && $("#waNovaPrevia")) { ui.nova = { titulo: $("#waNovaTitulo").value, mensagem: $("#waNovaMensagem").value, imagem_url: $("#waNovaImg").value.trim() }; $("#waNovaPrevia").innerHTML = bubble(ui.nova.mensagem, ui.nova.imagem_url); }
    };
    ["#waTitulo", "#waMensagem", "#waImg", "#waNovaTitulo", "#waNovaMensagem", "#waNovaImg"].forEach(id => { if ($(id)) $(id).oninput = preview; });
    target.querySelectorAll("[data-img-padrao]").forEach(b => b.onclick = () => { $(`#${b.dataset.imgPadrao}`).value = IMG_PADRAO; preview(); });
    target.querySelectorAll("[data-img-limpa]").forEach(b => b.onclick = () => { $(`#${b.dataset.imgLimpa}`).value = ""; preview(); });
    ["waImg", "waNovaImg"].forEach(id => { const f = $(`#${id}Arq`); if (f) f.onchange = async () => {
      const file = f.files?.[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { ui.msg = { ok: false, text: "Imagem maior que 5 MB." }; paint(); return; }
      preview();
      await act(async () => { const r = await api("imagem", { nome: file.name.replace(/\.[^.]+$/, ""), tipo: file.type, base64: await lerArquivo(file) });
        if (id === "waImg") ui.draft = { ...ui.draft, imagem_url: r.url }; else ui.nova = { ...ui.nova, imagem_url: r.url }; }, "Imagem enviada. Salve a mensagem para valer.");
    }; });

    if ($("#waSalvar")) $("#waSalvar").onclick = () => { preview(); act(async () => { await api("salvar_campanha", ui.draft); await loadEstado(); ui.draft = null; }, "Mensagem salva. Vale para as próximas mensagens desta campanha."); };
    if ($("#waTeste")) $("#waTeste").onclick = () => { preview(); const tel = $("#waTesteTel").value, nome = $("#waTesteNome").value;
      act(() => api("teste", { campanha: ui.camp, telefone: tel, nome, mensagem: ui.draft.mensagem, imagem_url: ui.draft.imagem_url }), "Teste enviado. Confira no WhatsApp."); };

    // público
    const calc = (p, para) => act(async () => { ui.publico = { ...(await api("publico", { publico: lerPublico(p) })), para }; });
    if ($("#waAddCalc")) $("#waAddCalc").onclick = () => calc("waAdd", "add");
    if ($("#waAddFila")) $("#waAddFila").onclick = () => { const p = lerPublico("waAdd");
      if (!confirm("Adicionar à fila desta campanha quem se encaixa nesse público e ainda não está nela?")) return;
      act(async () => { const r = await api("adicionar_publico", { campanha: ui.camp, publico: p }); ui.publico = null; await loadEstado(); return r; }, r => `${fmt.int(r.naFila)} pessoa(s) adicionada(s) à fila.`); };
    if ($("#waNovaCalc")) $("#waNovaCalc").onclick = () => { preview(); calc("waNova", "nova"); };
    if ($("#waNovaCriar")) $("#waNovaCriar").onclick = () => { preview(); const p = lerPublico("waNova"), n = ui.nova;
      if (!n.titulo.trim()) { ui.msg = { ok: false, text: "Dê um nome para a campanha." }; paint(); return; }
      if (!confirm(`Criar a campanha "${n.titulo}" e montar a fila com esse público? Nada será enviado ainda.`)) return;
      act(async () => { const r = await api("criar_campanha", { titulo: n.titulo, mensagem: n.mensagem, imagem_url: n.imagem_url, publico: p });
        ui.nova = null; ui.publico = null; await loadEstado(); ui.camp = r.campanha; ui.draft = null; ui.tab = "painel"; return r; },
        r => `Campanha criada com ${fmt.int(r.naFila)} pessoa(s) na fila. Mande um teste para você e, se estiver bom, clique em "Usar esta campanha no envio" e depois em "Ligar envio".`); };

    // envios
    const buscar = () => { ui.envFiltro = $("#waEnvFiltro").value; ui.envBusca = $("#waEnvBusca").value; ui.camp = $("#waEnvCamp").value; act(() => loadEnvios()); };
    if ($("#waEnvIr")) { $("#waEnvIr").onclick = buscar; $("#waEnvFiltro").onchange = buscar; $("#waEnvCamp").onchange = buscar; $("#waEnvBusca").onkeydown = e => { if (e.key === "Enter") buscar(); }; }
    if ($("#waEnvMais")) $("#waEnvMais").onclick = () => act(() => loadEnvios(true));
    target.querySelectorAll("[data-pular]").forEach(b => b.onclick = () => act(async () => { await api("pular", { id: b.dataset.pular }); await loadEnvios(); }, "Tirado da fila."));
    target.querySelectorAll("[data-voltar]").forEach(b => b.onclick = () => act(async () => { await api("voltar", { id: b.dataset.voltar }); await loadEnvios(); }, "De volta à fila."));

    // respostas
    target.querySelectorAll("[data-conv]").forEach(d => d.onclick = () => { ui.aberto = ui.aberto === d.dataset.conv ? "" : d.dataset.conv; paint(); });
    target.querySelectorAll("[data-responder]").forEach(b => b.onclick = () => {
      const texto = $(`#waResp-${b.dataset.responder}`).value.trim();
      if (!texto) return;
      act(async () => { await api("responder", { telefone: b.dataset.tel, texto }); await loadRespostas(); }, "Resposta enviada.");
    });

    // ajustes
    if ($("#waCfgSalvar")) $("#waCfgSalvar").onclick = () => act(async () => {
      await api("config", { limite_dia: $("#waCfgLimite").value, hora_inicio: $("#waCfgIni").value, hora_fim: $("#waCfgFim").value,
        intervalo_min_seg: Number($("#waCfgMin").value) * 60, intervalo_extra_seg: Number($("#waCfgExtra").value) * 60 });
      await loadEstado();
    }, "Ajustes salvos.");
  }

  async function render(el) {
    target = el;
    clearInterval(timer);
    el.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Abrindo os envios do WhatsApp</h2><p>Lendo campanhas, fila e respostas.</p></div>`;
    try { await loadEstado(); }
    catch (err) { if (naTela()) el.innerHTML = `<div class="loading"><h2>Não foi possível abrir os envios</h2><p>${esc(err.message || err)}</p></div>`; return; }
    if (!naTela()) return;
    paint();
    // Atualiza os números sozinho a cada 2 min no Painel (sem mexer no que está sendo digitado).
    timer = setInterval(async () => {
      if (!document.body.contains(el) || !naTela()) { clearInterval(timer); return; }
      if (document.hidden || ui.busy || ui.tab !== "painel" || el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      try { await loadEstado(); paint(); } catch (_) {}
    }, 120000);
  }

  UBY.register("envios", { render });
})();

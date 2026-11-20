/*
  Contato com o cliente pelo WhatsApp, a partir de Clientes › Alertas e risco, da ficha do cliente
  e das Respostas do Envios WhatsApp.
  Usuário (20/11/2026): "quero que tenhamos mais desenvoltura na parte de contato com os nossos clientes".

  Tudo passa pela função wa-painel do Supabase (exige administrador). Nada é enviado sozinho: cada
  mensagem sai só quando alguém clica em Enviar. Quem respondeu SAIR fica bloqueado (na tela e na função).
  As mensagens-modelo não falam de preço, cupom nem "condição especial": isso depende das decisões do Clube.
*/
(function () {
  "use strict";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dia = v => v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "";
  const dh = v => v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const diasDesde = v => v ? Math.floor((Date.now() - Date.parse(v)) / 86400000) : null;
  const telFmt = t => { const d = String(t || "").replace(/\D/g, "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t || ""; };
  const primeiro = nome => { const n = String(nome || "").trim(); if (!n || n.includes("@")) return ""; const p = n.split(/\s+/)[0]; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };

  const MODELOS = [
    ["sumiu", "Sentimos sua falta", "Oi, {nome}! Aqui é da UBY Recharge ⚡\nVi que faz um tempinho que você não carrega com a gente. Aconteceu alguma coisa? Teve algum problema no carregador ou no app?\nSe puder me contar, me ajuda muito a melhorar."],
    ["caiu", "Algum problema?", "Oi, {nome}! Aqui é da UBY Recharge ⚡\nPercebi que você tem carregado menos com a gente. Está tudo certo com os carregadores? Se algo não funcionou bem, me conta que eu resolvo."],
    ["obrigado", "Agradecer", "Oi, {nome}! Aqui é da UBY Recharge ⚡\nObrigado por carregar com a gente! Qualquer coisa que precisar nos carregadores, é só chamar aqui."],
  ];

  const isAdmin = () => window.UBY?.state?.status?.user?.role === "admin";

  async function client() {
    for (let i = 0; i < 100; i++) {
      try { const sb = window.UBY_SUPABASE?.client?.(); if (sb) return sb; } catch (_) {}
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error("A conexão com o banco não abriu. Recarregue a página.");
  }
  async function api(acao, body = {}) {
    const sb = await client();
    const { data, error } = await sb.functions.invoke("wa-painel", { body: { acao, ...body } });
    if (error) {
      let m = error.message || String(error);
      try { const j = await error.context.json(); m = j.mensagem || j.message || m; } catch (_) {}
      if (/401|jwt|unauthor/i.test(m)) m = "Sua sessão expirou. Entre de novo na plataforma.";
      throw new Error(m);
    }
    if (!data?.ok) throw new Error(data?.mensagem || "Não deu certo. Tente de novo.");
    return data;
  }

  // ---------- situação de contato de uma lista (Alertas e risco) ----------
  // Guarda a promessa por cliente: se a tela redesenhar no meio da leitura, não pede de novo.
  const cache = new Map(); let cacheEm = 0;
  async function contatos(lista) {
    if (!isAdmin()) return {};
    if (Date.now() - cacheEm > 120000) { cache.clear(); cacheEm = Date.now(); }
    const falta = lista.filter(c => c.key && !cache.has(c.key));
    if (falta.length) {
      const p = api("contatos", { clientes: falta.map(c => ({ k: c.key, email: c.email || "", phone: c.phone || "" })) }).then(r => r.contatos);
      falta.forEach(c => cache.set(c.key, p.then(m => m[c.key] || null)));
      p.catch(() => falta.forEach(c => cache.delete(c.key)));
    }
    const pares = await Promise.all(lista.filter(c => c.key).map(async c => [c.key, await cache.get(c.key)]));
    return Object.fromEntries(pares);
  }
  const esquecer = key => cache.delete(key);

  // Célula curta: "contatado 18/11 · respondeu" / "pediu para sair" / "sem celular"
  function celula(s, mask) {
    if (s === undefined) return `<small style="color:var(--uby-muted)">…</small>`;
    if (!s || !s.tel) return `<span class="badge neutral" title="Sem celular nas recargas nem no cadastro">sem celular</span>`;
    if (s.optout) return `<span class="badge bad" title="Respondeu SAIR em ${esc(dia(s.optoutEm))}">pediu para sair</span>`;
    const u = s.ultimoEnvio, r = s.ultimaResposta;
    const linhas = [];
    if (u) { const d = diasDesde(u.quando); linhas.push(`<span class="badge ${d <= 7 ? "ok" : "neutral"}" title="${esc(u.tipo === "campanha" ? `Campanha: ${u.texto}` : u.texto)}">${u.tipo === "campanha" ? "campanha" : "mensagem"} ${esc(dia(u.quando))}</span>`); }
    else linhas.push(`<span class="badge warn">nunca contatado</span>`);
    if (r) linhas.push(`<small style="display:block;white-space:normal" title="${esc(r.texto)}">respondeu ${esc(dia(r.quando))}: “${esc(mask ? "•••" : String(r.texto).slice(0, 40))}”</small>`);
    if (s.nota) linhas.push(`<small style="display:block;white-space:normal;color:var(--uby-muted)" title="${esc(s.nota.texto)}">📝 ${esc(mask ? "•••" : String(s.nota.texto).slice(0, 50))}</small>`);
    return linhas.join("");
  }

  // Rascunhos por cliente: a tela pode ser redesenhada (dados chegando da nuvem) com texto digitado.
  const rascunhos = new Map();

  // ---------- painel completo de um cliente (ficha e janela) ----------
  // cli = { key, name, email, phone, situacao: "sumiu" | "caiu" | "" }, opts = { mask, onChange }
  async function painel(el, cli, opts = {}) {
    if (!isAdmin()) { el.innerHTML = `<p class="source-line">O contato pelo WhatsApp é só para administradores.</p>`; return; }
    const rk = cli.key || cli.email || cli.phone || "";
    const rasc = rascunhos.get(rk) || {};
    const st = { f: null, msg: null, busy: false, texto: null, nota: rasc.nota || "" };
    const guardar = () => rascunhos.set(rk, { texto: st.texto, nota: st.nota });
    const modelo = id => (MODELOS.find(m => m[0] === id) || MODELOS[0])[2];
    const montar = t => { const n = primeiro(cli.name); return n ? t.replaceAll("{nome}", n) : t.replace(/,?\s*\{nome\}/g, ""); };
    st.texto = rasc.texto ?? montar(modelo(cli.situacao === "caiu" ? "caiu" : cli.situacao === "sumiu" ? "sumiu" : "obrigado"));

    async function carregar() { st.f = await api("ficha_contato", { email: cli.email || "", phone: cli.phone || "" }); }
    function bolha(h) {
      const cor = h.tipo === "nota" ? "var(--uby-amber-soft)" : h.de_nos ? "var(--uby-green-soft)" : "var(--uby-surface-soft)";
      const rot = h.tipo === "campanha" ? "Campanha" : h.tipo === "nota" ? `Anotação${h.autor ? ` · ${String(h.autor).split("@")[0]}` : ""}` : h.tipo === "sair" ? "Pediu para sair" : h.de_nos ? "UBY" : "Cliente";
      const extra = h.tipo === "campanha" ? [h.lido ? "lida" : "", h.clicou ? "clicou no link" : ""].filter(Boolean).join(" · ") : "";
      return `<div style="justify-self:${h.de_nos ? "end" : "start"};max-width:82%;background:${cor};color:var(--uby-ink);border:1px solid var(--uby-line);border-radius:10px;padding:6px 9px;font-size:12px;white-space:pre-wrap">${opts.mask && h.tipo !== "campanha" ? "•••" : esc(h.texto || "")}
        <div style="font-size:10px;color:var(--uby-muted);margin-top:3px;display:flex;gap:8px;align-items:center">${esc(rot)} · ${esc(dh(h.quando))}${extra ? ` · ${esc(extra)}` : ""}${h.tipo === "nota" && h.id ? `<button type="button" class="link-btn" data-apagar-nota="${h.id}" style="border:0;background:none;color:var(--uby-muted);cursor:pointer;font-size:10px;text-decoration:underline">apagar</button>` : ""}</div></div>`;
    }
    function paint() {
      const f = st.f;
      if (!f) { el.innerHTML = `<p class="source-line">${st.msg ? esc(st.msg.text) : "Lendo o histórico de contato…"}</p>`; return; }
      const podeEnviar = f.tel && !f.optout;
      el.innerHTML = `
        ${st.msg ? `<div class="note" style="margin-bottom:10px;border-color:${st.msg.ok ? "var(--uby-green)" : "var(--uby-red)"}">${esc(st.msg.text)}</div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          ${f.tel ? `<span class="pill"><span class="dot"></span>WhatsApp ${opts.mask ? "•••" : esc(telFmt(f.tel))}</span>` : `<span class="badge warn">Sem celular nas recargas nem no cadastro</span>`}
          ${f.optout ? `<span class="badge bad">Pediu para sair em ${esc(dia(f.optoutEm))}: não recebe mensagens</span>` : ""}
          ${f.ultimoEnvio ? `<small style="color:var(--uby-muted)">Último contato nosso: ${esc(dh(f.ultimoEnvio.quando))} (${f.ultimoEnvio.tipo === "campanha" ? "campanha" : "mensagem"})</small>` : `<small style="color:var(--uby-muted)">Nunca recebeu mensagem nossa.</small>`}
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px" class="contato-grid">
          <div><p class="kicker" style="margin-bottom:6px">Histórico</p>
            <div style="display:grid;gap:6px;max-height:340px;overflow:auto;padding:8px;border:1px solid var(--uby-line);border-radius:12px;background:var(--uby-surface)" data-hist>
              ${f.historico.length ? f.historico.map(bolha).join("") : `<small style="color:var(--uby-muted)">Nada ainda: nenhuma campanha, conversa ou anotação.</small>`}</div></div>
          <div style="display:grid;gap:10px;align-content:start">
            ${podeEnviar ? `<div style="display:grid;gap:6px"><p class="kicker">Mensagem pelo WhatsApp</p>
              <div style="display:flex;gap:6px;flex-wrap:wrap">${MODELOS.map(([id, l]) => `<button type="button" class="btn" data-modelo="${id}" style="padding:4px 9px;font-size:11px">${esc(l)}</button>`).join("")}</div>
              <textarea class="select" data-texto rows="6" style="width:100%;height:auto;padding:8px;white-space:pre-wrap;resize:vertical;cursor:text;font-family:inherit;line-height:1.45">${esc(st.texto)}</textarea>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn primary" data-enviar ${st.busy ? "disabled" : ""}>Enviar pelo WhatsApp</button>
              <small style="color:var(--uby-muted)">Sai do número da UBY na hora. A resposta aparece aqui e em Envios › Respostas.</small></div></div>`
            : `<div class="note">${f.optout ? "Este cliente pediu para sair: a plataforma não envia mensagem para ele." : "Sem celular não dá para mandar WhatsApp. Anote abaixo se falou com ele de outro jeito."}</div>`}
            <div style="display:grid;gap:6px"><p class="kicker">Anotação</p>
              <textarea class="select" data-nota rows="2" placeholder="Ex.: liguei, disse que mudou de cidade" style="width:100%;height:auto;padding:8px;resize:vertical;cursor:text;font-family:inherit">${esc(st.nota)}</textarea>
              <div><button type="button" class="btn" data-anotar ${st.busy || !f.chaveNota ? "disabled" : ""}>Salvar anotação</button></div></div>
          </div>
        </div>`;
      const hist = el.querySelector("[data-hist]"); if (hist) hist.scrollTop = hist.scrollHeight;
      const $ = s => el.querySelector(s);
      if ($("[data-texto]")) $("[data-texto]").oninput = e => { st.texto = e.target.value; guardar(); };
      $("[data-nota]").oninput = e => { st.nota = e.target.value; guardar(); };
      el.querySelectorAll("[data-modelo]").forEach(b => b.onclick = () => { st.texto = montar(modelo(b.dataset.modelo)); guardar(); paint(); });
      if ($("[data-enviar]")) $("[data-enviar]").onclick = () => {
        const t = String(st.texto || "").trim();
        if (t.length < 2) { st.msg = { ok: false, text: "Escreva a mensagem." }; paint(); return; }
        if (!confirm(`Enviar esta mensagem pelo WhatsApp da UBY para ${cli.name || "o cliente"}?`)) return;
        agir(async () => { await api("enviar_cliente", { telefone: f.tel, texto: t }); st.texto = ""; guardar(); }, "Mensagem enviada.");
      };
      $("[data-anotar]").onclick = () => {
        const t = String(st.nota || "").trim(); if (t.length < 2) return;
        agir(async () => { await api("nota", { chave: f.chaveNota, cliente: cli.name || "", texto: t }); st.nota = ""; guardar(); }, "Anotação salva.");
      };
      el.querySelectorAll("[data-apagar-nota]").forEach(b => b.onclick = () => { if (confirm("Apagar esta anotação?")) agir(() => api("apagar_nota", { id: b.dataset.apagarNota }), "Anotação apagada."); });
    }
    async function agir(fn, ok) {
      if (st.busy) return;
      st.busy = true; st.msg = null; paint();
      try { await fn(); st.msg = { ok: true, text: ok }; esquecer(cli.key); await carregar(); opts.onChange?.(); }
      catch (err) { st.msg = { ok: false, text: err.message || String(err) }; }
      finally { st.busy = false; paint(); }
    }
    paint();
    try { await carregar(); } catch (err) { st.msg = { ok: false, text: `Não foi possível ler o histórico: ${err.message}` }; }
    if (el.isConnected) paint();
  }

  // Janela sobre a tela (lista de Alertas e risco)
  function abrir(cli, opts = {}) {
    document.getElementById("contatoModal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "contatoModal";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(10,20,15,.45);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto";
    wrap.innerHTML = `<div style="background:var(--uby-canvas);color:var(--uby-ink);border-radius:16px;max-width:920px;width:100%;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="display:flex;gap:10px;align-items:start;margin-bottom:10px"><div style="flex:1"><p class="kicker">Contato com o cliente</p><h2 style="margin:2px 0">${esc(opts.mask ? "•••" : cli.name || "Cliente")}</h2>
        ${cli.resumo ? `<small style="color:var(--uby-muted);white-space:normal">${esc(cli.resumo)}</small>` : ""}</div>
        ${cli.key ? `<a class="btn" href="#/clientes/todos/${encodeURIComponent(cli.key)}" data-fechar>Abrir ficha</a>` : ""}<button type="button" class="btn" data-fechar aria-label="Fechar">Fechar</button></div>
      <div data-corpo></div></div>`;
    document.body.appendChild(wrap);
    const fechar = () => { wrap.remove(); document.removeEventListener("keydown", tecla); opts.onClose?.(); };
    const tecla = e => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", tecla);
    wrap.addEventListener("click", e => { if (e.target === wrap || e.target.closest("[data-fechar]")) fechar(); });
    painel(wrap.querySelector("[data-corpo]"), cli, opts);
  }

  window.UBY_CONTATO = Object.freeze({ api, contatos, celula, painel, abrir, esquecer, isAdmin });
})();

/* NOVA PLATAFORMA UBY — notificações no celular (Web Push).
   O aparelho se inscreve pelo service worker (sw.js) e a função uby-push do
   Supabase guarda a inscrição e envia os avisos. A seção aparece na tela Ajustes. */
(function () {
  "use strict";
  const FN = "uby-push";

  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const client = () => { try { return window.UBY_SUPABASE?.client?.() || null; } catch (_) { return null; } };

  async function call(action, extra) {
    const sb = client();
    if (!sb) throw new Error("O banco ainda não conectou. Espere a tela carregar e tente de novo.");
    const { data, error } = await sb.functions.invoke(FN, { body: { action, ...extra } });
    if (error) {
      let msg = error.message;
      try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (_) {}
      throw new Error(msg);
    }
    if (data && data.ok === false) throw new Error(data.error || "Não deu certo.");
    return data || {};
  }

  const bytes = b64 => {
    const s = (b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  };
  const sameKey = (sub, publicKey) => {
    const a = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    const b = bytes(publicKey);
    return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
  };
  const deviceLabel = () => { const ua = navigator.userAgent; return /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Aparelho"; };
  const current = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm === "denied") throw new Error("As notificações estão bloqueadas para este site. Libere no cadeado da barra de endereço (ou em Configurações do app → Notificações) e tente de novo.");
    if (perm !== "granted") throw new Error("Permissão não concedida.");
    const { publicKey } = await call("config");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Chave trocada no Supabase: a inscrição antiga não recebe mais nada.
    if (sub && !sameKey(sub, publicKey)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
    await call("subscribe", { subscription: sub.toJSON(), label: deviceLabel() });
  }

  async function disable() {
    const sub = await current();
    if (!sub) return;
    await call("unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }

  async function state() {
    if (!supported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return Notification.permission === "granted" && await current() ? "on" : "off";
  }

  const ui = { busy: false, msg: null };

  async function mount(el) {
    if (!el) return;
    const s = await state().catch(() => "off");
    const badge = { on: '<span class="badge ok">Ativas</span>', off: '<span class="badge neutral">Desligadas</span>', denied: '<span class="badge bad">Bloqueadas</span>', unsupported: '<span class="badge neutral">Indisponível</span>' }[s];
    const hint = {
      on: "Este aparelho recebe os avisos da UBY mesmo com o app fechado.",
      off: "Toque em Ativar para receber os avisos da UBY na tela do celular, mesmo com o app fechado.",
      denied: "As notificações foram bloqueadas para este site. Libere no cadeado da barra de endereço (ou em Configurações do app → Notificações) e recarregue a página.",
      unsupported: "Este navegador não recebe notificações. No Android, use o Chrome. No iPhone, só funciona com o app instalado na tela inicial (iOS 16.4 ou mais novo)."
    }[s];
    const dis = ui.busy ? "disabled" : "";
    el.innerHTML = `<section class="section"><div class="section-head"><div><p class="kicker">Celular</p><h2>Notificações neste aparelho ${badge}</h2><p>${hint}</p></div></div>
      <div class="toolbar">
        ${s === "off" ? `<button type="button" class="btn primary" data-push="enable" ${dis}>Ativar notificações</button>` : ""}
        ${s !== "on" ? `<button type="button" class="btn ghost" data-push="test" ${dis}>Enviar teste aos meus aparelhos</button>` : ""}
        ${s === "on" ? `<button type="button" class="btn primary" data-push="test" ${dis}>Enviar notificação de teste</button><button type="button" class="btn ghost" data-push="disable" ${dis}>Desativar neste aparelho</button>` : ""}
        ${ui.busy ? "<small>Aguarde…</small>" : ""}
      </div>
      ${ui.msg ? `<div class="note" style="margin-top:10px${ui.msg.ok ? "" : ";color:var(--uby-red)"}">${UBY.esc(ui.msg.text)}</div>` : ""}</section>`;
    el.querySelectorAll("[data-push]").forEach(btn => {
      btn.onclick = async () => {
        const act = btn.dataset.push;
        ui.busy = true; ui.msg = null; mount(el);
        try {
          if (act === "enable") { await enable(); ui.msg = { ok: true, text: "Pronto: notificações ativadas. Toque em \"Enviar notificação de teste\" para conferir." }; }
          if (act === "disable") { await disable(); ui.msg = { ok: true, text: "Notificações desativadas neste aparelho." }; }
          if (act === "test") { const r = await call("test"); ui.msg = { ok: true, text: `Teste enviado para ${r.sent} aparelho(s) desta conta. Deve chegar em alguns segundos.` }; }
        } catch (e) { ui.msg = { ok: false, text: e.message || String(e) }; }
        ui.busy = false; mount(el);
      };
    });
  }

  // Guarda no servidor as contas a vencer e os avisos urgentes calculados pela tela; o
  // agendamento diário (8h de Brasília) monta o resumo e manda aos aparelhos inscritos.
  // Só manda de novo se algo mudou ou a cada 6 h, para o servidor ter a lista do dia.
  const AGENDA_KEY = "uby-push-agenda-v1";
  let agendaTimer = null;
  function publishAgenda(alerts) {
    if (!alerts || !Array.isArray(alerts.bills)) return;
    clearTimeout(agendaTimer);
    agendaTimer = setTimeout(async () => {
      const agenda = {
        generatedAt: alerts.generatedAt,
        bills: alerts.bills.filter(b => !["mes", "proximo"].includes(b.bucket) || b.days <= 10)
          .map(b => ({ name: b.name, amount: b.amount, dueDate: b.dueDate, scheduledDate: b.scheduledDate || "", station: b.station || "" })),
        items: (alerts.items || []).filter(i => i.level === "critico").map(i => ({ level: i.level, title: i.title }))
      };
      // Assinatura curta (o armazenamento do navegador já anda cheio).
      const json = JSON.stringify([agenda.bills, agenda.items]);
      let h = 0;
      for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
      const sig = `${json.length}:${h}`;
      let last = {};
      try { last = JSON.parse(localStorage.getItem(AGENDA_KEY) || "{}"); } catch (_) {}
      if (last.sig === sig && Date.now() - (last.at || 0) < 6 * 3600000) return;
      try {
        await call("agenda", { agenda });
        try { localStorage.setItem(AGENDA_KEY, JSON.stringify({ sig, at: Date.now() })); } catch (_) {}
      } catch (e) { console.warn("[avisos no celular]", e.message); }
    }, 3000);
  }

  UBY.push = { mount, publishAgenda };
})();

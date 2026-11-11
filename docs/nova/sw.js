/* NOVA PLATAFORMA UBY — service worker do app instalado (celular/computador).
   Dados sempre vêm da rede (Supabase). Os arquivos da plataforma usam
   "rede primeiro": a versão nova entra na hora; o cache só serve se estiver
   sem internet, para o app abrir e avisar em vez de mostrar erro do navegador. */
const CACHE = "uby-nova-v6";
// Arquivos recebidos pelo "Compartilhar" do celular, até serem lançados (tela Lançar boleto).
const SHARED = "uby-nova-compartilhado";
// O endereço (github.io) é compartilhado com outros sites: só mexe nos caches deste app.
const OWN = "uby-nova-";
const SHELL = ["./", "index.html", "login.html", "offline.html", "app/app.css", "app/storage-ns.js", "app/shell.js", "assets/brand.svg", "assets/brand-night.svg", "assets/pwa/icon-192.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(OWN) && k !== CACHE && k !== SHARED).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Lê só do cache deste app (nunca de caches de outros sites do mesmo endereço).
const fromOwn = (req, opts) => caches.open(CACHE).then(cache => cache.match(req, opts));

// "Compartilhar → UBY": guarda os arquivos e abre a tela de lançamento (o login continua valendo).
async function receiveShared(req) {
  const form = await req.formData();
  const cache = await caches.open(SHARED);
  const now = Date.now();
  const text = String(form.get("text") || form.get("title") || "").slice(0, 500);
  const got = [];
  let i = 0;
  for (const f of form.getAll("arquivos")) {
    if (!f || typeof f === "string") continue;
    got.push({ name: f.name || "", type: f.type || "", size: f.size || 0 });
    if (!f.size) continue;
    await cache.put(new Request(`./compartilhado/${now}-${i++}`), new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "X-Nome": encodeURIComponent(f.name || "documento"), "X-Texto": encodeURIComponent(text) } }));
  }
  // Sem arquivo (ex.: compartilhou o e-mail ou um link, não o anexo): guarda o texto para a tela avisar.
  if (!i && text) await cache.put(new Request(`./compartilhado/${now}-texto`), new Response(text, { headers: { "Content-Type": "text/plain", "X-Somente-Texto": "1" } }));
  await cache.put(new Request("./compartilhado/ultimo"), new Response(JSON.stringify({ at: new Date(now).toISOString(), files: got, text: text.slice(0, 200) }), { headers: { "Content-Type": "application/json" } }));
  return Response.redirect("./index.html#/parametros/boleto", 303);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  const shareUrl = new URL(req.url);
  if (req.method === "POST" && shareUrl.origin === self.location.origin && shareUrl.pathname.endsWith("/compartilhar")) { event.respondWith(receiveShared(req)); return; }
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Só arquivos da própria plataforma; Supabase, CDNs e fontes passam direto.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    // "no-cache": sempre confere com o servidor. Sem isso o GitHub Pages deixa o
    // aparelho usar a cópia antiga por até 10 minutos depois de cada publicação.
    fetch(req, { cache: "no-cache" }).then(async res => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        return res;
      }
      // Durante uma publicação o GitHub Pages responde 404/5xx por alguns segundos:
      // usa a última cópia boa do arquivo em vez de repassar o erro.
      if (res.status === 404 || res.status >= 500) {
        const hit = await fromOwn(req, { ignoreSearch: true });
        if (hit) return hit;
      }
      return res;
    }).catch(async () => {
      const hit = await fromOwn(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return fromOwn("offline.html");
      return Response.error();
    })
  );
});

// Notificações no celular (ver app/push.js e supabase/functions/uby-push).
const HOME = "./index.html#/avisos";
self.addEventListener("push", event => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch (_) { msg = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(msg.title || "UBY Recharge", {
    body: msg.body || "",
    icon: "assets/pwa/icon-192.png",
    tag: msg.tag || undefined,
    lang: "pt-BR",
    data: { url: msg.url || HOME }
  }));
});

// Toque na notificação: se o app já está aberto, somente o traz para frente.
// O processamento do WhatsApp já é feito no servidor; trocar a rota de quem
// está trabalhando no painel para a tela de Envios é uma interrupção indevida.
// A rota do aviso continua sendo usada apenas para abrir o app que estava fechado.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const scope = self.registration.scope;
  let url = new URL((event.notification.data && event.notification.data.url) || HOME, scope).href;
  if (!url.startsWith(scope)) url = new URL(HOME, scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(scope) && "focus" in c);
    if (!open) return self.clients.openWindow(url);
    return open.focus();
  }));
});

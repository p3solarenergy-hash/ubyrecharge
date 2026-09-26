/* NOVA PLATAFORMA UBY — service worker do app instalado (celular/computador).
   Dados sempre vêm da rede (Supabase). Os arquivos da plataforma usam
   "rede primeiro": a versão nova entra na hora; o cache só serve se estiver
   sem internet, para o app abrir e avisar em vez de mostrar erro do navegador. */
const CACHE = "uby-nova-v2";
const SHELL = ["./", "index.html", "login.html", "offline.html", "app/app.css", "app/storage-ns.js", "app/shell.js", "assets/brand.svg", "assets/brand-night.svg", "assets/pwa/icon-192.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Só arquivos da própria plataforma; Supabase, CDNs e fontes passam direto.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    // "no-cache": sempre confere com o servidor. Sem isso o GitHub Pages deixa o
    // aparelho usar a cópia antiga por até 10 minutos depois de cada publicação.
    fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return caches.match("offline.html");
      return Response.error();
    })
  );
});

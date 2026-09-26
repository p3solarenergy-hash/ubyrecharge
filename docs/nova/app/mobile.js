/* NOVA PLATAFORMA UBY — celular e app instalado (PWA).
   Barra de abas no rodapé, fundo escuro atrás do menu, botão "Instalar app"
   e registro do service worker. Não mexe em cálculo nenhum. */
(function () {
  "use strict";

  const TABS = [
    { id: "comando", icon: "▦", label: "Comando" },
    { id: "unidades", icon: "▤", label: "Unidades" },
    { id: "financeiro", icon: "R$", label: "Financeiro" },
    { id: "relatorios", icon: "▧", label: "Relatórios" }
  ];
  const DISMISS_KEY = "uby-install-dismissed-v1";

  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (standalone()) document.documentElement.classList.add("is-app");

  // ---------- fundo atrás do menu lateral ----------
  const backdrop = document.createElement("div");
  backdrop.className = "menu-backdrop";
  backdrop.onclick = () => document.body.classList.remove("menu-open");
  document.body.appendChild(backdrop);
  document.addEventListener("keydown", e => { if (e.key === "Escape") document.body.classList.remove("menu-open"); });

  // ---------- barra de abas (só aparece no celular, via CSS) ----------
  const bar = document.createElement("nav");
  bar.className = "tabbar";
  bar.setAttribute("aria-label", "Atalhos");
  bar.innerHTML = TABS.map(t => `<a href="#/${t.id}" data-tab="${t.id}"><i>${t.icon}</i><span>${t.label}</span></a>`).join("")
    + `<button type="button" data-tab="menu"><i>☰</i><span>Menu</span></button>`;
  bar.querySelector('[data-tab="menu"]').onclick = () => document.body.classList.toggle("menu-open");
  document.body.appendChild(bar);

  function markTab() {
    const id = (location.hash.replace(/^#\/?/, "") || "comando").split("/")[0];
    const hit = TABS.some(t => t.id === id);
    bar.querySelectorAll("[data-tab]").forEach(a => a.classList.toggle("on", hit ? a.dataset.tab === id : a.dataset.tab === "menu"));
  }
  window.addEventListener("hashchange", markTab);
  markTab();

  // ---------- instalar como app ----------
  let deferred = null;
  const foot = document.querySelector(".sidebar-foot");
  const installBtn = document.createElement("button");
  installBtn.type = "button";
  installBtn.className = "btn install-btn";
  installBtn.textContent = "⬇ Instalar app no aparelho";
  installBtn.hidden = true;
  if (foot) foot.insertBefore(installBtn, foot.firstChild);

  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.hidden = true;
  document.body.appendChild(banner);

  function dismissed() { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (_) { return false; } }
  function showBanner(html) {
    if (standalone() || dismissed() || window.innerWidth > 860) return;
    banner.innerHTML = `<img src="assets/pwa/icon-192.png" alt=""><div>${html}</div><button type="button" class="btn ghost" aria-label="Fechar">✕</button>`;
    banner.querySelector("button[aria-label]").onclick = () => { banner.hidden = true; try { localStorage.setItem(DISMISS_KEY, "1"); } catch (_) {} };
    const go = banner.querySelector("[data-install]");
    if (go) go.onclick = install;
    banner.hidden = false;
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (_) {}
      deferred = null;
      installBtn.hidden = true;
      banner.hidden = true;
      return;
    }
    if (isIos()) {
      alert("No iPhone/iPad (Safari):\n\n1. Toque em Compartilhar (quadrado com a seta para cima)\n2. Escolha \"Adicionar à Tela de Início\"\n3. Toque em Adicionar\n\nO ícone UBY aparece na tela inicial e abre como app, sem App Store.");
    } else {
      alert("No Android (Chrome):\n\n1. Toque nos três pontinhos ⋮ no canto de cima\n2. Escolha \"Instalar app\" ou \"Adicionar à tela inicial\"\n\nO ícone UBY aparece na tela inicial e abre como app, sem Play Store.");
    }
  }
  installBtn.onclick = install;

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
    showBanner(`<strong>Instale a plataforma UBY</strong><small>Abre em tela cheia, com ícone na tela inicial. Sem loja de apps.</small><button type="button" class="btn primary" data-install>Instalar</button>`);
  });
  window.addEventListener("appinstalled", () => { installBtn.hidden = true; banner.hidden = true; });

  if (!standalone()) {
    if (isIos()) {
      installBtn.hidden = false;
      showBanner(`<strong>Instale no iPhone</strong><small>Toque em <b>Compartilhar</b> <span aria-hidden="true">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>.</small>`);
    } else if (/android/i.test(navigator.userAgent)) {
      installBtn.hidden = false; // sem o aviso automático do Chrome, mostra as instruções
    }
  }
})();

/*
  Medição de visitas do site público da UBY Recharge.
  - Só entra nas páginas públicas (docs/index.html e linktree.html).
  - NUNCA incluir este arquivo na plataforma (docs/nova, docs/obra-ev): lá há login e dados de clientes.
  - Nada é carregado antes do visitante aceitar o aviso de cookies (LGPD).
  - Para ativar: preencher os dois IDs abaixo. Com ambos vazios, o arquivo não faz nada.
*/
(function () {
  "use strict";

  var CONFIG = {
    ga4: "",      // ID de medição do Google Analytics 4, formato G-XXXXXXXXXX
    clarity: ""   // ID do projeto no Microsoft Clarity, ex.: abcd1234ef
  };

  var KEY = "uby-cookie-consent-v1";
  if (!CONFIG.ga4 && !CONFIG.clarity) return;

  function readConsent() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function saveConsent(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* sem armazenamento: pergunta de novo na próxima visita */ }
  }

  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  function loadGa4() {
    if (!CONFIG.ga4) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", CONFIG.ga4, { anonymize_ip: true });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CONFIG.ga4);
    document.head.appendChild(s);
  }

  function loadClarity() {
    if (!CONFIG.clarity) return;
    (function (c, l, a, r, i) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      var t = l.createElement(r);
      t.async = 1;
      t.src = "https://www.clarity.ms/tag/" + i;
      var y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CONFIG.clarity);
  }

  var EVENTS = [
    { test: /wa\.me\//i, name: "click_whatsapp" },
    { test: /instagram\.com\/uby\.recharge/i, name: "click_instagram" },
    { test: /docs\.google\.com\/forms/i, name: "click_formulario" },
    { test: /google\.[a-z.]+\/maps|maps\.app\.goo\.gl/i, name: "click_mapa" },
    { test: /apps\.apple\.com|play\.google\.com/i, name: "click_baixar_app" },
    { test: /beneficio\.html/i, name: "click_clube_beneficios" }
  ];

  function watchClicks() {
    document.addEventListener("click", function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!el) return;
      var href = el.getAttribute("href") || "";
      for (var i = 0; i < EVENTS.length; i++) {
        if (EVENTS[i].test.test(href)) {
          track(EVENTS[i].name, {
            link_text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
            link_url: href.slice(0, 200)
          });
          break;
        }
      }
    }, true);
  }

  function start() {
    loadGa4();
    loadClarity();
    watchClicks();
  }

  function showBanner() {
    var bar = document.createElement("div");
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Aviso de cookies");
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:640px;margin:0 auto;" +
      "background:#0A1628;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:14px 16px;" +
      "font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)";
    bar.innerHTML =
      "<div style=\"margin-bottom:10px\">Usamos cookies de medição (Google Analytics e Microsoft Clarity) para entender como o site é usado e melhorar o atendimento. " +
      "Não coletamos nome, e-mail ou telefone por eles. Você pode aceitar ou recusar.</div>" +
      "<div style=\"display:flex;gap:8px;justify-content:flex-end\">" +
      "<button type=\"button\" data-uby=\"no\" style=\"background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:10px;padding:8px 14px;font:inherit;cursor:pointer\">Recusar</button>" +
      "<button type=\"button\" data-uby=\"yes\" style=\"background:#00FF85;color:#0A1628;border:0;border-radius:10px;padding:8px 16px;font:inherit;font-weight:700;cursor:pointer\">Aceitar</button>" +
      "</div>";
    bar.addEventListener("click", function (ev) {
      var choice = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-uby") : null;
      if (!choice) return;
      saveConsent(choice);
      bar.parentNode.removeChild(bar);
      if (choice === "yes") start();
    });
    document.body.appendChild(bar);
  }

  function init() {
    var consent = readConsent();
    if (consent === "yes") start();
    else if (consent !== "no") showBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

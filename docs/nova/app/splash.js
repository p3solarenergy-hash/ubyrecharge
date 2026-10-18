/*
  Abertura animada do logo UBY (usuário, 18/10/2026: "quando abro o app do celular e até a abertura da
  plataforma quero uma arte do logo da uby surgindo… toda vez que abrir a tela inicial a primeira vez").
  - Uma vez por sessão: abrir o app (ou uma aba nova) mostra; trocar de tela ou recarregar não repete.
  - Fica na tela até a plataforma estar pronta (data-wait="data": motor conectado; senão, página carregada),
    com tempo mínimo para a animação terminar e limite para nunca prender a pessoa.
  - Precisa vir logo depois de <body>, para cobrir a tela antes de qualquer outra coisa pintar.
*/
(function () {
  "use strict";
  const KEY = "uby-splash-v1";
  try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, "1"); } catch (_) { return; }

  const script = document.currentScript;
  const waitData = script && script.dataset.wait === "data";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN = reduced ? 600 : 2100, MAX = 7000;
  const t0 = Date.now();

  const el = document.createElement("div");
  el.className = "uby-splash";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Abrindo a plataforma UBY Recharge");
  el.innerHTML = `
    <div class="sp-mark">
      <i class="sp-glow"></i>
      <svg class="sp-badge" viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="spBolt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00ff85"/><stop offset="1" stop-color="#00e5ff"/></linearGradient></defs>
        <rect class="sp-sq" x="2" y="2" width="96" height="96" rx="22"/>
        <path class="sp-bolt" pathLength="1" transform="translate(50 50) scale(.6) translate(-49.15 -49.7)"
          d="M60.2 9.1 L51.7 43.8 L70.5 44.9 L38.6 90.3 L47.2 55.7 L27.8 55.7Z"/>
      </svg>
    </div>
    <div class="sp-word"><span>uby</span></div>
    <i class="sp-line"></i>
    <div class="sp-sub">RECHARGE</div>
    <i class="sp-wait"></i>`;
  document.body.appendChild(el);
  document.documentElement.classList.add("splash-on");

  // Começa quando a fonte da marca chegar (ou em 700 ms), para "uby" não surgir em outra fonte.
  const go = () => el.classList.add("go");
  try { Promise.race([document.fonts.load("700 64px Poppins"), new Promise(r => setTimeout(r, 700))]).then(go, go); } catch (_) { go(); }

  function ready() {
    if (!waitData) return document.readyState === "complete";
    const s = window.UBY && window.UBY.state;
    return !!(s && s.api && s.status);
  }
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    el.classList.add("out");
    document.documentElement.classList.remove("splash-on");
    setTimeout(() => el.remove(), 600);
  }
  const timer = setInterval(() => {
    const t = Date.now() - t0;
    if (t >= MAX || (t >= MIN && ready())) { clearInterval(timer); close(); }
    else if (t >= MIN) el.classList.add("waiting");
  }, 120);
  el.addEventListener("click", () => { if (Date.now() - t0 >= MIN) close(); });
})();

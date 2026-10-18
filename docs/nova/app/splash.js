/*
  Abertura animada do logo UBY (usuário, 18/10/2026: "quando abro o app do celular e até a abertura da
  plataforma quero uma arte do logo da uby surgindo… toda vez que abrir a tela inicial a primeira vez").
  - Uma vez por sessão: abrir o app (ou uma aba nova) mostra; trocar de tela ou recarregar não repete.
  - Fica na tela até a plataforma estar pronta (data-wait="data": motor conectado; senão, página carregada),
    com tempo mínimo para a animação terminar e limite para nunca prender a pessoa.
  - Precisa vir logo depois de <body>, para cobrir a tela antes de qualquer outra coisa pintar.
  - No app instalado o Android mostra antes a própria tela (ícone grande no centro, fundo do manifesto). A
    animação começa idêntica a ela (mesmo formato, tamanho e posição, medidos numa gravação do aparelho) e
    segue dali, para parecer uma transição só e não "logo parado e depois outra abertura".
*/
(function () {
  "use strict";
  const KEY = "uby-splash-v1";
  try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, "1"); } catch (_) { return; }

  const script = document.currentScript;
  const waitData = script && script.dataset.wait === "data";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN = reduced ? 600 : 1900, MAX = 7000;
  const t0 = Date.now();
  // Superelipse (expoente 2,7) = formato do ícone na abertura do Android; ícone ocupa 57% da largura da tela.
  const SQUIRCLE = (() => {
    const n = 2.7, pts = [];
    for (let k = 0; k < 96; k++) {
      const t = 2 * Math.PI * k / 96, c = Math.cos(t), s = Math.sin(t);
      pts.push(`${(50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(1)} ${(50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(1)}`);
    }
    return `M${pts.join(" L")}Z`;
  })();

  const el = document.createElement("div");
  el.className = "uby-splash";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Abrindo a plataforma UBY Recharge");
  el.innerHTML = `
    <div class="sp-mark">
      <i class="sp-glow"></i>
      <svg class="sp-badge" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="spBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1d38"/><stop offset="1" stop-color="#0c1830"/></linearGradient>
          <linearGradient id="spBolt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00ff85"/><stop offset="1" stop-color="#00e5ff"/></linearGradient>
        </defs>
        <path class="sp-sq" d="${SQUIRCLE}"/>
        <path class="sp-bolt" d="M59.9 17.9 L53.4 45.0 L68.1 46.2 L43.0 82.1 L49.5 54.9 L34.5 54.6Z"/>
      </svg>
    </div>
    <div class="sp-word"><span>uby</span></div>
    <i class="sp-line"></i>
    <div class="sp-sub">RECHARGE</div>
    <i class="sp-wait"></i>`;
  document.body.appendChild(el);
  document.documentElement.classList.add("splash-on");

  // Primeiro quadro = ícone grande no centro da tela (como o Android deixou); daí encolhe e sobe para o lugar.
  const mark = el.querySelector(".sp-mark");
  const start = Math.min(window.innerWidth * 0.5713, 260);
  el.style.setProperty("--sp-s0", (start / mark.offsetWidth).toFixed(3));
  // A tela do Android centraliza na tela física; no app instalado a página começa abaixo da barra de status.
  const bar = window.matchMedia("(display-mode: standalone)").matches ? screen.height - window.innerHeight : 0;
  const centerY = bar > 0 && bar < 120 ? (window.innerHeight - bar) / 2 : window.innerHeight / 2;
  el.style.setProperty("--sp-dy", `${Math.round(centerY - (mark.offsetTop + mark.offsetHeight / 2))}px`);
  requestAnimationFrame(() => el.classList.add("go"));
  // "uby" entra quando o selo chega (~0,75 s), esperando a fonte da marca no máximo até 1,3 s.
  const fonts = (() => { try { return document.fonts.load("700 64px Poppins"); } catch (_) { return Promise.resolve(); } })();
  Promise.all([new Promise(r => setTimeout(r, 750)), Promise.race([fonts, new Promise(r => setTimeout(r, 1300))])])
    .then(() => el.classList.add("word"), () => el.classList.add("word"));

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

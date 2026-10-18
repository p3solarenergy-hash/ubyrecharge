/*
  Efeitos de interface, visual high-tech (usuário, 18/10/2026: "as coisas se iluminam ao clicar, de forma
  suave"; depois: "iluminar o quadro todo, não perto do mouse; deixar tudo mais hightech").
  - Passar o mouse: o cartão/botão inteiro acende (só CSS, :hover em app.css).
  - Clique: pulso neon na borda do elemento clicado e um ping fino no ponto, como radar.
  - Troca de tela: a tela nova entra com fade e leve deslize (UBY_FX.enter, chamado pelo shell).
  Tudo some com "reduzir movimento" do sistema. Um elemento por clique, removido ao terminar.
*/
(function () {
  "use strict";
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PRESS = ".btn, .seg button, .hub-tabs a, .nav-item, .kpi, .cc-jump button, .mini, .link-btn";

  function ping(x, y) {
    const el = document.createElement("span");
    el.className = "fx-ping";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    el.addEventListener("animationend", e => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 900);
  }

  function press(host) {
    host.classList.remove("fx-press");
    void host.offsetWidth;
    host.classList.add("fx-press");
    setTimeout(() => host.classList.remove("fx-press"), 700);
  }

  document.addEventListener("pointerdown", e => {
    if (reduced() || e.button > 0) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest("input, select, textarea, canvas, iframe, .fx-off")) return;
    const host = t && t.closest(PRESS);
    if (host && !host.disabled) press(host);
    ping(e.clientX, e.clientY);
  }, { passive: true });

  // Fundo vivo (usuário: "como se fosse um mar… energia passando ao fundo"; depois: "algo mais como névoa,
  // areia, não tão definido"): três auras de luz que derivam devagar, duas camadas de névoa e areia fina.
  function background() {
    if (document.querySelector(".fx-bg")) return;
    const bg = document.createElement("div");
    bg.className = "fx-bg";
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = `<i></i><i></i><i></i><b class="fx-mist"></b><b class="fx-mist m2"></b><b class="fx-sand"></b>`;
    document.body.prepend(bg);
  }
  if (document.body) background(); else document.addEventListener("DOMContentLoaded", background);

  // Entrada de tela: reinicia a animação no conteúdo.
  function enter(el) {
    if (!el || reduced()) return;
    el.classList.remove("fx-enter");
    void el.offsetWidth;
    el.classList.add("fx-enter");
  }
  window.UBY_FX = Object.freeze({ enter, reduced });
})();

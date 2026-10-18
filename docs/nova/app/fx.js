/*
  Efeitos de interface (usuário, 18/10/2026: "transições fluidas, as coisas se iluminam ao clicar,
  o fundo gera um efeito de luz em onda").
  - Clique: brilho suave que nasce no ponto do clique dentro de botões, abas, cartões e itens do menu,
    e uma onda de luz que se espalha pelo fundo da página.
  - Passar o mouse: botões e cartões acendem levemente onde está o cursor.
  - Troca de tela: a tela nova entra com fade e leve deslize (UBY_FX.enter, chamado pelo shell).
  Tudo some com "reduzir movimento" do sistema. Só CSS + um elemento por clique (removido ao terminar).
*/
(function () {
  "use strict";
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GLOW = ".btn, .seg button, .hub-tabs a, .nav-item, .kpi, .cc-jump button, .list-row, .link-btn, .mini";
  const HOVER = ".btn, .kpi, .nav-item, .seg button, .hub-tabs a, .cc-jump button, .mini";

  function wave(x, y) {
    const el = document.createElement("span");
    el.className = "fx-wave";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 1600);
  }

  function glow(host, x, y) {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (getComputedStyle(host).position === "static") host.classList.add("fx-host");
    const size = Math.max(r.width, r.height) * 2.2;
    // Moldura própria (inset 0, cantos do elemento) recorta o brilho sem mexer no overflow do elemento
    // (ex.: o número do sino fica para fora do botão).
    const clip = document.createElement("span");
    clip.className = "fx-clip";
    const el = document.createElement("span");
    el.className = "fx-glow";
    el.style.width = el.style.height = `${size}px`;
    el.style.left = `${x - r.left - size / 2}px`;
    el.style.top = `${y - r.top - size / 2}px`;
    clip.appendChild(el);
    host.appendChild(clip);
    el.addEventListener("animationend", () => clip.remove(), { once: true });
    setTimeout(() => clip.remove(), 1200);
  }

  document.addEventListener("pointerdown", e => {
    if (reduced() || e.button > 0) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest("input, select, textarea, canvas, iframe, .fx-off")) { wave(e.clientX, e.clientY); return; }
    const host = t.closest(GLOW);
    if (host && !host.disabled) glow(host, e.clientX, e.clientY);
    wave(e.clientX, e.clientY);
  }, { passive: true });

  // Luz que acompanha o cursor (variáveis --mx/--my lidas pelo CSS).
  let last = null;
  document.addEventListener("pointermove", e => {
    if (reduced() || e.pointerType === "touch") return;
    const t = e.target instanceof Element ? e.target.closest(HOVER) : null;
    if (last && last !== t) last.classList.remove("fx-lit");
    last = t;
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty("--mx", `${e.clientX - r.left}px`);
    t.style.setProperty("--my", `${e.clientY - r.top}px`);
    t.classList.add("fx-lit");
  }, { passive: true });

  // Entrada de tela: reinicia a animação no conteúdo.
  function enter(el) {
    if (!el || reduced()) return;
    el.classList.remove("fx-enter");
    void el.offsetWidth;
    el.classList.add("fx-enter");
  }
  window.UBY_FX = Object.freeze({ enter, reduced });
})();

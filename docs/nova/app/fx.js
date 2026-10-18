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
  // As máscaras da névoa/areia são geradas aqui, uma vez, em canvas (PNG que repete sem emenda). Antes eram
  // SVG com feTurbulence, que o Chrome do celular rasteriza em blocos: a névoa aparecia em retângulos
  // sobrepostos, com bordas retas.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Névoa: manchas radiais suaves espalhadas no ladrilho, cada uma desenhada também nas bordas opostas
  // para repetir sem emenda. Nada de grade: as formas ficam redondas e o contorno some aos poucos.
  const FALLOFF = [[0, 1], [0.2, 0.86], [0.4, 0.58], [0.6, 0.29], [0.8, 0.09], [1, 0]]; // ~gaussiana
  function mistTile(size, count, rMin, rMax, seed) {
    const rand = rng(seed);
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    for (let i = 0; i < count; i++) {
      const x = rand() * size, y = rand() * size, r = rMin + (rMax - rMin) * rand(), a = 0.35 + 0.45 * rand();
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const cx = x + ox, cy = y + oy;
          if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          for (const [t, k] of FALLOFF) g.addColorStop(t, `rgba(255,255,255,${a * k})`);
          ctx.fillStyle = g;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      }
    }
    return `url(${cv.toDataURL("image/png")})`;
  }

  // Areia: grãos esparsos, cada um com brilho próprio.
  function sandTile(size, seed) {
    const rand = rng(seed);
    return paint(size, () => (rand() < 0.014 ? 0.35 + 0.65 * rand() : 0));
  }

  function paint(size, alpha) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(alpha(i) * 255);
    }
    ctx.putImageData(img, 0, 0);
    return `url(${cv.toDataURL("image/png")})`;
  }

  function background() {
    if (document.querySelector(".fx-bg")) return;
    const bg = document.createElement("div");
    bg.className = "fx-bg";
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = `<i></i><i></i><i></i><b class="fx-mist"></b><b class="fx-mist m2"></b><b class="fx-sand"></b>`;
    try {
      bg.style.setProperty("--fx-mist-a", mistTile(300, 13, 40, 110, 7));
      bg.style.setProperty("--fx-mist-b", mistTile(300, 8, 60, 140, 23));
      bg.style.setProperty("--fx-sand-m", sandTile(320, 3));
    } catch (e) { /* sem canvas: fica só a aura de luz */ }
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

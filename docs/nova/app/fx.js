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

  // Ruído de valor periódico (várias oitavas), remapeado para 0..1 e cortado em nuvens: alfa = k·n − c.
  function mistTile(size, cells, seed, k, c) {
    const rand = rng(seed);
    const grids = cells.map(n => ({ n, v: Array.from({ length: n * n }, rand) }));
    const field = new Float32Array(size * size);
    let min = Infinity, max = -Infinity;
    const smooth = t => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0, amp = 1;
        for (const { n, v } of grids) {
          const gx = x / size * n, gy = y / size * n;
          const x0 = Math.floor(gx), y0 = Math.floor(gy);
          const tx = smooth(gx - x0), ty = smooth(gy - y0);
          const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
          const a = v[y0 * n + x0] + (v[y0 * n + x1] - v[y0 * n + x0]) * tx;
          const b = v[y1 * n + x0] + (v[y1 * n + x1] - v[y1 * n + x0]) * tx;
          sum += (a + (b - a) * ty) * amp;
          amp *= 0.5;
        }
        field[y * size + x] = sum;
        if (sum < min) min = sum;
        if (sum > max) max = sum;
      }
    }
    return paint(size, i => Math.min(1, Math.max(0, k * (field[i] - min) / (max - min) - c)));
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
      bg.style.setProperty("--fx-mist-a", mistTile(256, [4, 8, 16, 32], 7, 1.5, 0.62));
      bg.style.setProperty("--fx-mist-b", mistTile(256, [3, 6, 12, 24], 23, 1.5, 0.62));
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

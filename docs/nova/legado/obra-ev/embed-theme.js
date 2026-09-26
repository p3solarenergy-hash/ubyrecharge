/*
  NOVA PLATAFORMA — ajuste de cores das telas originais dentro da moldura nova.
  Muitas telas antigas têm cores escuras fixas em classes próprias. Este script
  roda só quando a página está embutida (sidebar.js) e troca, no navegador,
  fundos escuros pela cor clara equivalente da paleta nova e textos claros
  demais por texto escuro. Não altera dados, regras, gráficos ou imagens.
*/
(function () {
  "use strict";
  if (window.self === window.top || window.__UBY_EMBED_RECOLOR__) return;
  // Motores de cálculo rodam em molduras invisíveis: não precisam de cor.
  try { if (["motorFrame", "obrasFrame", "importFrame"].includes(window.frameElement?.id)) return; } catch (_) {}
  window.__UBY_EMBED_RECOLOR__ = true;

  const SKIP = new Set(["CANVAS", "SVG", "IMG", "VIDEO", "PICTURE", "IFRAME", "PATH", "SCRIPT", "STYLE", "LINK", "META"]);
  const PALETTE = {
    surface: "#fffefa", soft: "#f0f2ea", ink: "#202821", muted: "#68746b", line: "#dde2d7",
    green: ["#e8f2e9", "#187457"], blue: ["#e7eff4", "#3d6f8e"], amber: ["#fbf3e4", "#8b6419"], red: ["#faece9", "#b75450"], purple: ["#f1ecf2", "#77637d"]
  };

  function parse(color) {
    const m = String(color).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  }
  const lum = c => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  function hueFamily(c) {
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    if (max - min < 14) return null;
    let h;
    if (max === c.r) h = ((c.g - c.b) / (max - min)) % 6; else if (max === c.g) h = (c.b - c.r) / (max - min) + 2; else h = (c.r - c.g) / (max - min) + 4;
    h = (h * 60 + 360) % 360;
    if (h < 20 || h >= 330) return "red";
    if (h < 65) return "amber";
    if (h < 170) return "green";
    if (h < 255) return "blue";
    return "purple";
  }

  function effectiveBackground(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.35) return bg;
      node = node.parentElement;
    }
    return parse("rgb(246,246,240)");
  }

  function fix(el) {
    if (!el || el.nodeType !== 1 || SKIP.has(el.tagName.toUpperCase()) || el.closest("svg")) return;
    if (el.classList.contains("uby-sidebar") || el.classList.contains("uby-topbar")) return;
    const cs = getComputedStyle(el);
    let bg = parse(cs.backgroundColor);
    let darkBg = false;
    // Degradês escuros (cartões de KPI com imagem de fundo): remove a imagem e usa a superfície clara.
    if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) {
      const first = parse(cs.backgroundImage);
      if (first && lum(first) < 0.32) {
        el.style.setProperty("background-image", "none", "important");
        bg = { ...first, a: 1 };
      }
    }
    // Cinzas neutros intermediários (caixas de fórmula) também viram superfície suave.
    if (bg && bg.a > 0.35 && !hueFamily(bg) && lum(bg) >= 0.32 && lum(bg) < 0.8) {
      el.style.setProperty("background-color", PALETTE.soft, "important");
      bg = null;
    }
    if (bg && bg.a > 0.35 && lum(bg) < 0.32) {
      darkBg = true;
      const fam = hueFamily(bg);
      // Fundos neutros escuros viram superfície; tons (badges, faixas) viram a versão clara da mesma cor.
      const tinted = fam && (Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b)) > 22;
      el.style.setProperty("background-color", tinted ? PALETTE[fam][0] : (lum(bg) < 0.1 ? PALETTE.surface : PALETTE.soft), "important");
      if (tinted) el.style.setProperty("color", PALETTE[fam][1], "important");
      const border = parse(cs.borderTopColor);
      if (border && lum(border) < 0.35 && parseFloat(cs.borderTopWidth) > 0) el.style.setProperty("border-color", PALETTE.line, "important");
    }
    const fg = parse(cs.color);
    if (fg && !el.style.getPropertyValue("color")) {
      const effBg = darkBg ? null : effectiveBackground(el);
      if (lum(fg) > 0.78 && (!effBg || lum(effBg) > 0.6)) el.style.setProperty("color", lum(fg) > 0.9 ? PALETTE.ink : PALETTE.muted, "important");
    }
    if (el.tagName === "BUTTON" && el.id === "themeToggle") el.style.setProperty("display", "none", "important");
  }

  function sweep(root) {
    fix(root);
    if (root.querySelectorAll) root.querySelectorAll("*").forEach(fix);
  }

  let pending = new Set(), scheduled = false;
  function schedule(node) {
    pending.add(node);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      const nodes = [...pending]; pending = new Set(); scheduled = false;
      nodes.forEach(n => { if (n.isConnected) sweep(n); });
    }, 120);
  }

  function start() {
    sweep(document.body);
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) schedule(n); })))
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 50)); else setTimeout(start, 50);
})();

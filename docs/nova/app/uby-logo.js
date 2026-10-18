/*
  Logo UBY Recharge (versão para fundo escuro), desenhado em canvas a partir das
  medidas do arquivo oficial. Unidade S = lado do ícone. Medidas no oficial (ícone 88 px):
    ícone      0,0 → S×S, cantos 0,20·S, verde #00ff85; raio azul 0,76·S de altura, topo a 0,114·S
    "uby"      de x 1,25·S a 2,807·S; topo do "b" a 0,023·S; fim da perna do "y" a 0,864·S
    linha      x 1,216·S, largura 1,307·S, topo 0,92·S, espessura 0,023·S (fica ABAIXO do "y", sem cruzar)
    RECHARGE   mesma largura da linha; maiúsculas de 1,034·S a 1,148·S
  Largura total 2,818·S; altura total 1,148·S.
  Usado pela página do cliente (beneficio.html) e pelo display do balcão (Clube UBY).
*/
(function (global) {
  "use strict";
  const NAVY = "#0a1628", GREEN = "#00ff85";
  // Contorno do raio medido do logo oficial (caixa 142..237 × 99..280).
  const BOLT = [[215, 99], [142, 203], [186, 203], [165, 280], [237, 177], [197, 177]];

  function bolt(g, x, y, h, fill) {
    const s = h / 181;
    g.beginPath();
    BOLT.forEach(([px, py], i) => g[i ? "lineTo" : "moveTo"](x + (px - 142) * s, y + (py - 99) * s));
    g.closePath(); g.fillStyle = fill; g.fill();
  }

  // Ajusta tamanho e espaçamento para o texto ocupar exatamente a caixa (largura × altura visível).
  function fitText(g, text, weight, family, boxW, boxH, useCaps) {
    let size = 100;
    g.letterSpacing = "0px";
    g.font = `${weight} ${size}px ${family}`;
    let m = g.measureText(text);
    const h = useCaps ? m.actualBoundingBoxAscent : m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    size = size * boxH / h;
    g.font = `${weight} ${size}px ${family}`;
    m = g.measureText(text);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const spacing = (boxW - w) / Math.max(1, text.length - 1);
    return { size, spacing, ascent: m.actualBoundingBoxAscent, left: m.actualBoundingBoxLeft };
  }

  function draw(g, x, y, S, opts = {}) {
    const text = opts.text || "#ffffff", family = opts.family || "Poppins, Arial, sans-serif";
    g.save();
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    // ícone
    g.beginPath(); g.roundRect(x, y, S, S, 0.2 * S); g.fillStyle = GREEN; g.fill();
    const bh = 0.76 * S, bw = bh * 95 / 181;
    bolt(g, x + (S - bw) / 2, y + 0.114 * S, bh, NAVY);
    // "uby"
    const t = fitText(g, "uby", 800, family, 1.557 * S, 0.841 * S, false);
    g.font = `800 ${t.size}px ${family}`; g.letterSpacing = `${t.spacing}px`; g.fillStyle = text;
    g.fillText("uby", x + 1.25 * S + t.left, y + 0.023 * S + t.ascent);
    // linha (abaixo do "y")
    g.letterSpacing = "0px"; g.fillStyle = GREEN;
    g.fillRect(x + 1.216 * S, y + 0.92 * S, 1.307 * S, Math.max(1, 0.023 * S));
    // RECHARGE
    const r = fitText(g, "RECHARGE", 500, family, 1.307 * S, 0.114 * S, true);
    g.font = `500 ${r.size}px ${family}`; g.letterSpacing = `${r.spacing}px`; g.fillStyle = GREEN;
    g.fillText("RECHARGE", x + 1.216 * S + r.left, y + 1.034 * S + r.ascent);
    g.restore();
  }

  global.UBYLogo = { draw, bolt, WIDTH: 2.818, HEIGHT: 1.148, NAVY, GREEN };
})(typeof window !== "undefined" ? window : globalThis);

/*
  Leitor de boletos, faturas e comprovantes (PDF ou foto) — roda só no aparelho.
  PDF: texto pelo pdf.js (o mesmo carregador do leitor da Copel); PDF escaneado ou
  foto: OCR (tesseract, carregado só quando precisa). Da linha digitável saem o
  valor e o vencimento exatos; sem ela, procura no texto. Não grava nada: devolve
  os campos para a tela "Lançar boleto" conferir.
*/
(function (global) {
  "use strict";
  const OCR_JS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const OCR_LANG = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int";
  const plain = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const brNum = v => { let s = String(v || "").replace(/[R$\s]/g, ""); if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", "."); const x = Number(s); return Number.isFinite(x) ? x : 0; };
  const isPdf = f => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
  const pad = n => String(n).padStart(2, "0");
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isoDMY = (d, m, a) => { a = Number(a); if (a < 100) a += 2000; d = Number(d); m = Number(m); return d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 2015 && a <= 2099 ? `${a}-${pad(m)}-${pad(d)}` : ""; };

  // ───────── linha digitável ─────────
  // Boleto bancário (47 dígitos): campo livre + DV + fator de vencimento (4) + valor (10, em centavos).
  // O fator reiniciou em 1000 no dia 22/02/2025; escolhe a data (base antiga ou nova) mais perto de hoje.
  function dueFromFactor(f, today = new Date()) {
    if (!(f > 0)) return "";
    const day = 86400000, cands = [];
    cands.push(new Date(Date.UTC(1997, 9, 7) + f * day));
    if (f >= 1000) cands.push(new Date(Date.UTC(2025, 1, 22) + (f - 1000) * day));
    const best = cands.sort((a, b) => Math.abs(a - today) - Math.abs(b - today))[0];
    return `${best.getUTCFullYear()}-${pad(best.getUTCMonth() + 1)}-${pad(best.getUTCDate())}`;
  }
  function decodeLine(digits, today) {
    const d = String(digits || "").replace(/\D/g, "");
    if (d.length === 47) {
      const value = Number(d.slice(37, 47)) / 100;
      return { kind: "boleto", line: d, value, due: dueFromFactor(Number(d.slice(33, 37)), today) };
    }
    if (d.length === 44 && d[0] !== "8") {
      return { kind: "boleto", line: d, value: Number(d.slice(9, 19)) / 100, due: dueFromFactor(Number(d.slice(5, 9)), today) };
    }
    // Arrecadação (concessionárias, impostos): começa com 8; valor real se o 3º dígito for 6 ou 8.
    if ((d.length === 48 || d.length === 44) && d[0] === "8") {
      const bar = d.length === 48 ? d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47) : d;
      return { kind: "arrecadacao", line: d, value: /[68]/.test(bar[2]) ? Number(bar.slice(4, 15)) / 100 : 0, due: "" };
    }
    return null;
  }
  // Dígitos verificadores (FEBRABAN): módulo 10 nos campos do boleto; 10 ou 11 nos blocos de arrecadação.
  const mod10 = s => { let sum = 0; [...s].reverse().forEach((c, i) => { let v = Number(c) * (i % 2 === 0 ? 2 : 1); sum += v > 9 ? v - 9 : v; }); return (10 - sum % 10) % 10; };
  const mod11 = s => { let sum = 0, w = 2; [...s].reverse().forEach(c => { sum += Number(c) * w; w = w === 9 ? 2 : w + 1; }); const r = sum % 11; return r === 0 || r === 1 ? 0 : 11 - r; };
  // Código de barras de boleto (44): DV geral na 5ª posição, módulo 11 (resto 0, 1 ou 10 → 1).
  const dvBar = s => { let sum = 0, w = 2; [...s].reverse().forEach(c => { sum += Number(c) * w; w = w === 9 ? 2 : w + 1; }); const r = 11 - sum % 11; return r === 0 || r === 10 || r === 11 ? 1 : r; };
  function validLine(d) {
    // Boleto bancário: 4º dígito é a moeda (9 = real).
    if ((d.length === 47 || d.length === 44) && d[0] !== "8" && d[3] !== "9") return false;
    if (d.length === 47) return [[0, 9], [10, 20], [21, 31]].every(([a, b]) => mod10(d.slice(a, b)) === Number(d[b]));
    if (d.length === 48 && d[0] === "8") { const f = /[67]/.test(d[2]) ? mod10 : mod11; return [0, 12, 24, 36].every(a => f(d.slice(a, a + 11)) === Number(d[a + 11])); }
    if (d.length === 44 && d[0] !== "8") return dvBar(d.slice(0, 4) + d.slice(5)) === Number(d[4]);
    if (d.length === 44 && d[0] === "8") return (/[67]/.test(d[2]) ? mod10 : mod11)(d.slice(0, 3) + d.slice(4)) === Number(d[3]);
    return false;
  }
  function findLine(text, today) {
    // No texto do PDF a linha digitável às vezes vem partida em duas linhas: tenta também com elas juntas.
    // Só vale a sequência com os dígitos verificadores certos (descarta chave de NF-e, protocolos etc.).
    const src = String(text || ""), joined = src.replace(/(\d)[ \t]*\n[ \t]*(?=\d)/g, "$1 ");
    // Linha digitável completa (47/48) tem prioridade sobre um código de barras de 44 solto.
    for (const len of [47, 48, 44]) {
      for (const t of [src, joined]) {
        for (const r of t.match(/\d[\d. \t-]{42,70}\d/g) || []) {
          const digits = r.replace(/\D/g, "");
          for (let i = 0; i + len <= digits.length; i++) {
            const piece = digits.slice(i, i + len);
            if (!validLine(piece)) continue;
            const hit = decodeLine(piece, today);
            if (hit && hit.value > 0) return hit;
          }
        }
      }
    }
    return null;
  }

  // ───────── texto ─────────
  function dateNear(t, labels) {
    const lines = String(t || "").split(/\n/);
    const re = new RegExp(labels, "i");
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(plain(lines[i]))) continue;
      for (let j = i; j < Math.min(lines.length, i + 3); j++) { const m = lines[j].match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/); if (m) { const r = isoDMY(m[1], m[2], m[3]); if (r) return r; } }
    }
    return "";
  }
  function moneyNear(t, labels) {
    const lines = String(t || "").split(/\n/);
    const re = new RegExp(labels, "i"), money = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(plain(lines[i]))) continue;
      for (let j = i; j < Math.min(lines.length, i + 3); j++) { const m = lines[j].match(money); if (m && brNum(m[1]) > 0) return brNum(m[1]); }
    }
    return 0;
  }
  // Rótulo forte (beneficiário, cedente…) pode ter texto depois; "para"/"destino" só valem sozinhos ou com dois-pontos.
  function nameNear(t, labels) {
    const L = String(t || "").split(/\n/).map(x => x.trim()).filter(Boolean);
    const re = new RegExp(`^(?:(?:${labels})\\b[^:]*:?|(?:para|destino|de)\\s*:)\\s*(.*)$|^(?:para|destino)\\s*$()`, "i");
    const bad = v => !v || v.length < 3 || /^(cpf|cnpj|ag[eê]ncia|c[oó]digo|nosso|data|vencimento|valor|endere)/i.test(v) || /^\d[\d./-]*$/.test(v);
    for (let i = 0; i < L.length; i++) {
      const m = plain(L[i]).match(re); if (!m) continue;
      const rest = m[1] ?? m[2] ?? "";
      let v = rest ? L[i].slice(L[i].length - rest.length).trim() : "";
      for (let j = i + 1; bad(v) && j < Math.min(L.length, i + 3); j++) v = L[j];
      if (!bad(v)) return v.replace(/\s*(?:-\s*)?(?:CNPJ|CPF)[:\s].*$/i, "").replace(/\s{2,}/g, " ").slice(0, 80);
    }
    return "";
  }

  function interpret(text, fileName = "", today = new Date()) {
    const s = plain(text);
    const line = findLine(text, today);
    const receipt = /comprovante|pagamento (efetuado|realizado)|transacao (efetuada|realizada)|pix (enviado|realizado)|autenticacao/.test(s) && !/pagavel (em|preferencialmente)/.test(s);
    const kind = line ? (line.kind === "arrecadacao" ? "fatura" : "boleto") : /nota fiscal|nf-?e|danfe/.test(s) ? "nota_fiscal" : /fatura/.test(s) ? "fatura" : receipt ? "recibo" : "outro";
    const value = (line && line.value) || moneyNear(text, "valor (do documento|cobrado|a pagar|total)|total a pagar|valor pago|valor:|^valor\\b|total") || 0;
    const due = (line && line.due) || dateNear(text, "vencimento|vence em|data de vencimento");
    const paidAt = receipt ? (dateNear(text, "data (do pagamento|da transacao|de pagamento)|pago em|realizad|efetuad") || dateNear(text, "data")) : "";
    const issuer = /copel distribui/.test(s) ? "Copel" : /sanepar/.test(s) ? "Sanepar" : "";
    const supplier = issuer || nameNear(text, "beneficiario|cedente|favorecido|recebedor|razao social|emitente") || "";
    return { kind, value: Math.round(value * 100) / 100, due, paid: receipt, paidAt, supplier, line: line ? line.line : "",
      description: supplier || String(fileName || "Documento").replace(/\.[a-z0-9]+$/i, "") };
  }

  // ───────── leitura do arquivo ─────────
  let ocr = null;
  const script = src => new Promise((ok, fail) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => fail(new Error("sem internet para carregar o leitor de fotos")); document.head.appendChild(el); });
  async function ocrImage(img, onStep) {
    if (!ocr) ocr = (async () => {
      if (!global.Tesseract) await script(OCR_JS);
      return global.Tesseract.createWorker("por", 1, { langPath: OCR_LANG, logger: m => { if (m.status === "recognizing text") onStep?.(`Lendo a foto… ${Math.round(m.progress * 100)}%`); else if (/load|initializ/i.test(m.status)) onStep?.("Preparando o leitor de fotos (só demora na primeira vez)…"); } });
    })().catch(e => { ocr = null; throw e; });
    const { data } = await (await ocr).recognize(img);
    return data.text || "";
  }
  async function sniffPdf(file) { try { return new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) === "%PDF-"; } catch (_) { return false; } }
  async function read(file, onStep) {
    const pdf = isPdf(file) || (!/^image\//.test(file.type || "") && await sniffPdf(file));
    if (!pdf && !/^image\//.test(file.type || "") && !/\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(file.name || "")) throw new Error(`arquivo ${file.type || "sem tipo"} não é PDF nem foto`);
    if (!pdf) return ocrImage(file, onStep);
    onStep?.("Lendo o PDF…");
    const text = await global.UBY_COPEL.extractText(file);
    if (text.replace(/\s/g, "").length > 30) return text;
    // PDF escaneado (só imagem): desenha a 1ª página e lê como foto.
    const doc = await global.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pg = await doc.getPage(1), vp = pg.getViewport({ scale: 2 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    return ocrImage(c, onStep);
  }

  global.UBY_BOLETO = { read, interpret, decodeLine, findLine, dueFromFactor, isPdf, isoOf };
})(typeof window !== "undefined" ? window : globalThis);

/*
  Leitor de fatura Copel (DANF3E em PDF) — roda só no navegador.
  Extrai o texto com pdf.js e lê: referência, datas das leituras, dias,
  unidade consumidora, vencimento, total, kWh consumido, kWh compensados
  (injeção/arrendamento), leituras do medidor e constante. Não grava nada:
  devolve os campos para a tela de Faturas de energia conferir e lançar.
*/
(function () {
  "use strict";
  const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  let loading = null;

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; resolve(window.pdfjsLib); };
      s.onerror = () => { loading = null; reject(new Error("Não consegui carregar o leitor de PDF. Confira a internet e tente de novo.")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function extractText(file) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push(tc.items.map(i => i.str).filter(s => s && s.trim()).join("\n"));
    }
    return pages.join("\n");
  }

  const isoDate = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
  const brNum = s => Number(String(s || "").replace(/\./g, "").replace(",", ".")) || 0;

  // "Itens de fatura": o PDF traz as colunas em blocos — N descrições, N unidades, N quantidades,
  // N preços unitários com tributos, N valores. O bloco de unidades (kWh/UN) diz quantos itens são.
  function parseItems(t) {
    const L = String(t || "").split("\n").map(s => s.trim());
    const isUnit = s => /^(kWh|kW|UN|kVArh|kVAr)$/i.test(s || "");
    const u0 = L.findIndex((s, i) => isUnit(s) && i > 0 && /[A-Za-z]{3}/.test(L[i - 1]) && !isUnit(L[i - 1]));
    if (u0 < 0) return [];
    let n = 0;
    while (isUnit(L[u0 + n])) n++;
    const num = s => /^-?[\d.]+(,\d+)?$/.test(s || "");
    const units = L.slice(u0, u0 + n), desc = L.slice(u0 - n, u0);
    // A coluna de quantidade não traz linha para itens em "UN" (ex.: iluminação pública): só para os demais.
    const nq = units.filter(u => !/^UN$/i.test(u)).length;
    let p = u0 + n;
    const qty = L.slice(p, p += nq), price = L.slice(p, p += n), value = L.slice(p, p += n);
    if (desc.length !== n || ![...qty, ...price, ...value].every(num)) return [];
    let qi = 0;
    return desc.map((d, i) => ({ desc: d, unit: units[i], qty: /^UN$/i.test(units[i]) ? 1 : brNum(qty[qi++]), price: brNum(price[i]), value: brNum(value[i]) }));
  }

  function parse(text) {
    const t = String(text || "");
    const warnings = [];
    if (!/copel/i.test(t) || !/DANF3E|NOTA FISCAL ELETR/i.test(t)) return { ok: false, error: "Este PDF não parece uma fatura da Copel (DANF3E)." };
    const D = "(\\d{2}\\/\\d{2}\\/\\d{4})";
    // Cabeçalho: leitura anterior, leitura atual, nº de dias, próxima leitura, UC, referência, vencimento, total.
    const head = new RegExp(`${D}\\s+${D}\\s+(\\d{1,3})\\s+${D}\\s+(\\d{6,})\\s+(\\d{2})\\/(\\d{4})\\s+${D}\\s+R\\$\\s*([\\d.]+,\\d{2})`).exec(t);
    if (!head) return { ok: false, error: "Não encontrei o cabeçalho da fatura (datas de leitura, referência, vencimento e total)." };
    const f = {
      start: isoDate(head[1]), end: isoDate(head[2]), days: Number(head[3]), next: isoDate(head[4]), uc: head[5].replace(/^0+/, ""),
      ref: `${head[7]}-${head[6]}`, dueDate: isoDate(head[8]), copelAmount: brNum(head[9])
    };
    // Quantidades faturadas (logo após a coluna de unidades): 1ª positiva = consumo; 1ª negativa = compensada.
    const q = /\bUN\b\s+([\s\S]*?)(?:\n-?[\d.]+,\d)/.exec(t);
    const qty = q ? q[1].split(/\s+/).filter(x => /^-?[\d.]+$/.test(x)).map(brNum) : [];
    f.kwh = qty.find(x => x > 0) || 0;
    f.compensatedKWh = Math.abs(qty.find(x => x < 0) || 0);
    // Medidor: nº, leituras anterior/atual e constante.
    const m = /(\d{8,})\s+(\d{8,})\s+CONSUMO kWh\s+\S+\s+kWh\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i.exec(t);
    if (m) {
      f.meter = m[1]; f.readingStart = Number(m[3]); f.readingEnd = Number(m[5]); f.multiplier = Number(m[7]);
      const byReading = (f.readingEnd - f.readingStart) * f.multiplier;
      if (!f.kwh) f.kwh = Number(m[9]) || byReading;
      if (byReading && f.kwh && Math.abs(byReading - f.kwh) > 1) warnings.push(`Consumo da fatura (${f.kwh} kWh) difere das leituras × constante (${byReading} kWh).`);
    } else warnings.push("Não li as leituras do medidor (campos opcionais).");
    const nf = /NOTA FISCAL No\.\s*(\d+)/i.exec(t); if (nf) f.nfNumber = nf[1];
    const name = /Nome:\s*([^\n]+)(?:\n(?!Endere)([^\n:]+))?/.exec(t); if (name) f.holder = [name[1], name[2]].filter(Boolean).join(" ").trim();
    const addr = /Endereço:\s*([^\n]+)/.exec(t); if (addr) f.address = addr[1].trim();
    const bal = /Todos os Per[ií]odos\s+(\d+);/.exec(t); if (bal) f.creditBalance = Number(bal[1]);
    const total = /\bTOTAL\s+([\d.]+,\d{2})/.exec(t);
    if (total && Math.abs(brNum(total[1]) - f.copelAmount) > 0.01) warnings.push(`Total do rodapé (R$ ${total[1]}) difere do cabeçalho.`);
    // Itens da fatura e tarifa de energia com tributos (para reembolso de ponto sem padrão próprio):
    // soma dos preços unitários com tributos das linhas de energia consumida (TE, TUSD/uso do sistema,
    // bandeira). Fica de fora: energia injetada (créditos do gerador do local) e iluminação pública.
    f.items = parseItems(t);
    const energyItems = f.items.filter(i => /^kWh$/i.test(i.unit) && i.qty > 0 && /ENERGIA/i.test(i.desc) && !/INJ/i.test(i.desc));
    f.energyRateItems = energyItems;
    f.energyRate = Math.round(energyItems.reduce((s, i) => s + i.price, 0) * 1e6) / 1e6;
    if (!energyItems.length) warnings.push("Não li os itens da fatura (preço do kWh com tributos).");
    if (!f.kwh) warnings.push("Não encontrei o kWh consumido: preencha à mão.");
    if (f.end <= f.start) warnings.push("Datas de leitura fora de ordem.");
    return { ok: true, fields: f, warnings };
  }

  async function read(file) {
    if (!file) return { ok: false, error: "Nenhum arquivo." };
    if (!/pdf$/i.test(file.type || "") && !/\.pdf$/i.test(file.name || "")) return { ok: false, error: "Envie o PDF da fatura." };
    let text = "";
    try { text = await extractText(file); } catch (err) { return { ok: false, error: err.message || String(err) }; }
    if (!text.trim()) return { ok: false, error: "O PDF não tem texto (é imagem escaneada). Baixe a 2ª via no site da Copel." };
    return parse(text);
  }

  window.UBY_COPEL = { read, parse, extractText };
})();

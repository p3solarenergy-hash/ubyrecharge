/*
  Índices do Banco Central (SGS, API pública e sem chave): CDI e IPCA de cada mês, em % ao mês.
  Usado em Financeiro → Investidores para comparar o retorno das cotas com o CDI dos mesmos meses.
  Guarda por 12 h no navegador; sem internet ou com a API fora do ar, a tela segue sem a comparação.
  O mês em andamento vem parcial do próprio Banco Central (CDI até o último dia útil).
*/
(function (global) {
  "use strict";
  const SERIES = Object.freeze({ cdi: 4391, ipca: 433 });
  const CACHE_KEY = "uby-nova-bcb-v1";
  const TTL = 12 * 3600000;
  let pending = null;

  // "01/09/2026" → "2026-09"
  const monthKey = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || "")); return m ? `${m[3]}-${m[2]}` : ""; };

  // Resposta da API → { "AAAA-MM": % no mês }
  function parse(rows) {
    const out = {};
    (Array.isArray(rows) ? rows : []).forEach(r => {
      const k = monthKey(r && r.data), v = Number(String(r && r.valor).replace(",", "."));
      if (k && Number.isFinite(v)) out[k] = v;
    });
    return out;
  }

  // Acumulado composto (%) dos meses pedidos; null se faltar algum mês.
  function compound(series, keys) {
    if (!series || !keys || !keys.length) return null;
    let f = 1;
    for (const k of keys) {
      if (!(k in series)) return null;
      f *= 1 + series[k] / 100;
    }
    return (f - 1) * 100;
  }

  // Últimos 12 meses fechados já publicados (sem o mês em andamento; o IPCA do mês anterior
  // só sai por volta do dia 10). null se a série ainda não tiver 12 meses.
  function last12(series, today = new Date()) {
    const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const keys = Object.keys(series || {}).filter(k => k < now).sort().slice(-12);
    return keys.length === 12 ? { from: keys[0], to: keys[11], pct: compound(series, keys) } : null;
  }

  function readCache() {
    try {
      const c = JSON.parse(global.localStorage.getItem(CACHE_KEY) || "null");
      return c && Date.now() - c.at < TTL && c.cdi && c.ipca ? c : null;
    } catch (_) { return null; }
  }

  async function fetchSeries(code, fromYear) {
    const today = new Date();
    const end = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=01/01/${fromYear}&dataFinal=${end}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Banco Central respondeu HTTP ${res.status}`);
    return parse(await res.json());
  }

  // { cdi, ipca, at } desde janeiro de 3 anos atrás (cobre a rodada 1 e os 12 meses de comparação).
  function load() {
    const cached = readCache();
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    const fromYear = new Date().getFullYear() - 3;
    pending = Promise.all([fetchSeries(SERIES.cdi, fromYear), fetchSeries(SERIES.ipca, fromYear)])
      .then(([cdi, ipca]) => {
        const data = { cdi, ipca, at: Date.now() };
        try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) {}
        return data;
      })
      .finally(() => { pending = null; });
    return pending;
  }

  global.UBY_BCB = Object.freeze({ SERIES, parse, compound, last12, load });
})(typeof window !== "undefined" ? window : globalThis);

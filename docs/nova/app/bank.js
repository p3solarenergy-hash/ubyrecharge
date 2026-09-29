/*
  Extrato bancário: leitura (planilha/CSV em linhas, ou OFX) e conferência com as contas.
  Puro (sem DOM, sem gravação) — usado pela aba Parâmetros · Pagamentos e pelos testes.

  Transação: { id, date "AAAA-MM-DD", type, description, amount (negativo = saída) }.
  Conta: { key, name, supplier, category, amount, due, paidAt, paid, station }.
  links: { [transação]: { bill: key } | { ignore: true, note } } — vínculos feitos à mão.
*/
(function (global) {
  "use strict";
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/�/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const DAY = 86400000;
  const toDate = iso => new Date(`${iso}T12:00:00`);
  const days = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY);

  // "1.234,56", "-R$ 1.234,56", 1234.56 → número
  function num(v) {
    if (typeof v === "number") return v;
    let s = String(v ?? "").replace(/\s|R\$| /g, "");
    if (!s) return NaN;
    const neg = /^-|^\(.*\)$|-$/.test(s);
    s = s.replace(/[()\-+]/g, "");
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }
  // "16/06/2026", "2026-06-16", serial do Excel → "AAAA-MM-DD"
  function isoDate(v) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * DAY)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }
    const s = String(v ?? "").trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }

  // Ids estáveis: data|valor|descrição|ordem entre iguais no mesmo arquivo (reimportar não duplica).
  function withIds(list) {
    const seen = new Map();
    return list.map(t => {
      const base = `${t.date}|${t.amount.toFixed(2)}|${norm(t.description).slice(0, 40)}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return { ...t, id: `${base}|${n}` };
    });
  }

  // Planilha/CSV em linhas (array de arrays). Acha o cabeçalho (Data + Entradas/Saídas ou Valor).
  function parseRows(rows) {
    const meta = {};
    let head = -1, col = {};
    const cellText = (row, re) => String((row || []).find(c => re.test(String(c || ""))) || "");
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
      const cells = (rows[i] || []).map(c => norm(c));
      const line = cells.join(" | ");
      if (!meta.bank && /\bbanco\b/.test(line)) meta.bank = cellText(rows[i], /banco/i).replace(/^.*?:\s*/, "");
      if (!meta.account && /\bconta\s*\d/.test(line)) meta.account = cellText(rows[i], /conta/i).replace(/^conta\s*:?\s*/i, "");
      if (!meta.holder && /titular/.test(line)) meta.holder = cellText(rows[i], /titular/i).replace(/^.*?:\s*/, "");
      const idx = re => cells.findIndex(c => re.test(c));
      const d = idx(/^data( do lancamento| lancamento| movimento)?$/);
      if (d < 0) continue;
      const ent = idx(/^(entradas?|creditos?|valor credito)$/), sai = idx(/^(saidas?|debitos?|valor debito)$/), val = idx(/^valor( r)?$|^montante$/);
      if (ent < 0 && sai < 0 && val < 0) continue;
      head = i;
      col = { date: d, type: idx(/^tipo/), desc: idx(/descri|histori|lancamento|detalhe|memo/), ent, sai, val };
      break;
    }
    if (head < 0) throw new Error("Não achei o cabeçalho do extrato (coluna Data e Entradas/Saídas ou Valor).");
    const out = [];
    for (let i = head + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const date = isoDate(r[col.date]);
      if (!date) continue;
      const type = col.type >= 0 ? String(r[col.type] ?? "").trim() : "";
      const rawDesc = col.desc >= 0 ? String(r[col.desc] ?? "") : "";
      if (/saldo/i.test(type) || /^saldo/i.test(rawDesc)) continue;
      let amount = NaN;
      if (col.val >= 0) amount = num(r[col.val]);
      else {
        const e = col.ent >= 0 ? num(r[col.ent]) : NaN, s = col.sai >= 0 ? num(r[col.sai]) : NaN;
        if (Number.isFinite(e) && e !== 0) amount = Math.abs(e);
        else if (Number.isFinite(s) && s !== 0) amount = -Math.abs(s);
      }
      if (!Number.isFinite(amount) || amount === 0) continue;
      const description = rawDesc.replace(/�/g, "").trim() || type;
      out.push({ date, type, description, amount: r2(amount) });
    }
    if (!out.length) throw new Error("O extrato não tem lançamentos reconhecíveis.");
    const dates = out.map(t => t.date).sort();
    return { meta: { ...meta, from: dates[0], to: dates.at(-1) }, transactions: withIds(out) };
  }

  function parseOFX(text) {
    const tag = (blk, t) => ((blk.match(new RegExp(`<${t}>([^<\\r\\n]*)`, "i")) || [])[1] || "").trim();
    const out = [...String(text).matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].map(m => {
      const b = m[1];
      return { date: isoDate(tag(b, "DTPOSTED").slice(0, 8)), type: tag(b, "TRNTYPE"), description: tag(b, "MEMO") || tag(b, "NAME"), amount: r2(num(tag(b, "TRNAMT").replace(",", "."))) };
    }).filter(t => t.date && Number.isFinite(t.amount) && t.amount !== 0);
    if (!out.length) throw new Error("O arquivo OFX não tem lançamentos.");
    const dates = out.map(t => t.date).sort();
    return { meta: { bank: tag(text, "ORG") || tag(text, "BANKID"), account: tag(text, "ACCTID"), from: dates[0], to: dates.at(-1) }, transactions: withIds(out) };
  }

  // Junta um extrato novo aos já guardados (sem duplicar lançamentos de períodos sobrepostos).
  function merge(payload, parsed, fileName) {
    const p = { statements: [], transactions: [], links: {}, ...(payload || {}) };
    const id = `st-${Date.now().toString(36)}`;
    const have = new Set(p.transactions.map(t => t.id));
    const fresh = parsed.transactions.filter(t => !have.has(t.id)).map(t => ({ ...t, statementId: id }));
    p.transactions = p.transactions.concat(fresh).sort((a, b) => a.date.localeCompare(b.date));
    p.statements = p.statements.concat({ id, fileName: fileName || "", bank: parsed.meta.bank || "", account: parsed.meta.account || "", from: parsed.meta.from, to: parsed.meta.to, importedAt: new Date().toISOString(), count: parsed.transactions.length, added: fresh.length });
    return { payload: p, added: fresh.length, total: parsed.transactions.length };
  }

  // Origem das entradas (para o resumo de recebimentos).
  function inflowSource(t) {
    const d = norm(`${t.type} ${t.description}`);
    if (/move solu/.test(d)) return "Move";
    if (/spott/.test(d)) return "Spott";
    if (/credito (visa|master|elo|amex|hiper)|debito (visa|master|elo)|vendas/.test(d)) return "Cartão (vendas)";
    if (/rendimento/.test(d)) return "Rendimentos";
    return "Outras entradas";
  }

  // Conferência. Casa cada saída (ou grupo de saídas ao mesmo favorecido em até 3 dias) com
  // uma conta (ou com contas do mesmo fornecedor que somam o mesmo valor), por valor e data.
  function reconcile(transactions, bills, links = {}) {
    const outs = transactions.filter(t => t.amount < 0).map(t => ({ ...t, value: r2(-t.amount), who: norm(t.description) }));
    const byKey = new Map(bills.map(b => [b.key, b]));
    const billTx = new Map(), txBill = new Map(), ignored = new Map();
    const link = (txs, keys, how) => {
      keys.forEach(k => billTx.set(k, (billTx.get(k) || []).concat(txs.map(t => t.id))));
      txs.forEach(t => txBill.set(t.id, { keys, how }));
    };
    // 1) vínculos manuais
    outs.forEach(t => {
      const l = links[t.id];
      if (!l) return;
      if (l.ignore) ignored.set(t.id, l.note || "");
      else if (l.bill && byKey.has(l.bill)) link([t], [l.bill], "manual");
    });
    const freeTx = () => outs.filter(t => !txBill.has(t.id) && !ignored.has(t.id));
    const freeBills = () => bills.filter(b => !billTx.has(b.key) && b.amount > 0);
    const ref = b => b.paidAt || b.due;
    const near = (t, b) => { const d = days(t.date, ref(b)); return b.paidAt ? Math.abs(d) <= 10 : d >= -20 && d <= 45; };
    const similar = (t, b) => norm(`${b.supplier} ${b.name}`).split(" ").filter(x => x.length >= 4).some(x => t.who.includes(x));
    const score = (t, b) => Math.abs(days(t.date, ref(b))) - (similar(t, b) ? 30 : 0);
    // 2) uma saída = uma conta (valor exato, até 2 centavos)
    freeBills().slice().sort((a, b) => b.amount - a.amount).forEach(b => {
      const c = freeTx().filter(t => Math.abs(t.value - b.amount) <= 0.02 && near(t, b)).sort((x, y) => score(x, b) - score(y, b))[0];
      if (c) link([c], [b.key], "auto");
    });
    // 2b) valor próximo (até 2% ou R$ 5) com nome parecido (ex.: pagou 482,03 de 483,04 ao "Posto Central")
    freeBills().slice().sort((a, b) => b.amount - a.amount).forEach(b => {
      const tol = Math.max(Math.min(b.amount * 0.02, 5), 0.02);
      const c = freeTx().filter(t => Math.abs(t.value - b.amount) <= tol && near(t, b) && similar(t, b)).sort((x, y) => Math.abs(x.value - b.amount) - Math.abs(y.value - b.amount))[0];
      if (c) link([c], [b.key], "aproximado");
    });
    // 3) grupos de saídas ao mesmo favorecido (até 3 dias) = uma conta ou contas do mesmo fornecedor
    const groups = [];
    freeTx().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      const g = groups.find(x => x.who === t.who && days(t.date, x.list[0].date) <= 3);
      if (g) g.list.push(t); else groups.push({ who: t.who, list: [t] });
    });
    groups.filter(g => g.list.length > 1).forEach(g => {
      const total = r2(g.list.reduce((s, t) => s + t.value, 0));
      const first = g.list[0];
      const cands = freeBills().filter(b => near(first, b) || near(g.list.at(-1), b) || (b.due && days(first.date, b.due) >= 0 && days(first.date, b.due) <= 75));
      const one = cands.filter(b => Math.abs(b.amount - total) <= 0.02).sort((x, y) => score(first, x) - score(first, y))[0];
      if (one) { link(g.list, [one.key], "grupo"); return; }
      const bySupplier = new Map();
      cands.forEach(b => { const k = norm(b.supplier || b.name); bySupplier.set(k, (bySupplier.get(k) || []).concat(b)); });
      for (const list of bySupplier.values()) {
        const L = list.slice(0, 8);
        for (let mask = 3; mask < (1 << L.length); mask++) {
          if ((mask & (mask - 1)) === 0) continue;
          const pick = L.filter((_, i) => mask & (1 << i));
          if (pick.length > 3) continue;
          if (Math.abs(r2(pick.reduce((s, b) => s + b.amount, 0)) - total) <= 0.02) { link(g.list, pick.map(b => b.key), "grupo"); return; }
        }
      }
    });
    // Resultado por conta
    const txById = new Map(outs.map(t => [t.id, t]));
    const billRows = bills.map(b => {
      const tx = (billTx.get(b.key) || []).map(id => txById.get(id));
      const sharedWith = tx.length ? (txBill.get(tx[0].id)?.keys || []).filter(k => k !== b.key) : [];
      const paidTotal = r2(tx.reduce((s, t) => s + t.value, 0));
      const expected = r2([b.key, ...sharedWith].map(k => byKey.get(k)).filter(Boolean).reduce((s, x) => s + x.amount, 0));
      const diff = tx.length ? r2(paidTotal - expected) : 0;
      const status = !tx.length ? (b.paid ? "sem-extrato" : "aberto") : Math.abs(diff) > 0.009 ? "diferenca" : b.paid ? "conferido" : "pago-nao-marcado";
      return { ...b, status, tx, paidTotal, diff, sharedWith, bankDate: tx.map(t => t.date).sort().at(-1) || "", how: tx.length ? txBill.get(tx[0].id).how : "" };
    });
    const txRows = outs.map(t => ({ ...t, bills: txBill.get(t.id)?.keys || [], how: txBill.get(t.id)?.how || "", ignored: ignored.has(t.id), note: ignored.get(t.id) || "" }));
    return { bills: billRows, outflows: txRows, unmatched: txRows.filter(t => !t.bills.length && !t.ignored) };
  }

  // Entradas por mês e origem.
  function inflows(transactions) {
    const out = {};
    transactions.filter(t => t.amount > 0).forEach(t => {
      const mk = t.date.slice(0, 7), src = inflowSource(t);
      out[mk] = out[mk] || {};
      out[mk][src] = r2((out[mk][src] || 0) + t.amount);
    });
    return out;
  }

  global.UBY_BANK = Object.freeze({ parseRows, parseOFX, merge, reconcile, inflows, inflowSource, isoDate, num, norm });
})(typeof window !== "undefined" ? window : globalThis);

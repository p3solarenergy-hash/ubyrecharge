/*
  UBY · Base de cálculo de clientes e preço (Nova Plataforma)
  ------------------------------------------------------------------
  Contas puras, sem DOM e sem Supabase (mesmo desenho do finance-core.js):
  recebem sessões já normalizadas pelo adaptador (app/motor-api.js) e devolvem
  alertas de clientes, tendência por carregador, escada de preços, eventos de
  reajuste e simulações de margem. Nada aqui altera o financeiro.

  Sessão de entrada (apenas recargas válidas contam, `valid`):
    { key, name, email, phone, site, t (ms), day ("AAAA-MM-DD" local), hour (0-23),
      dow (0-6), kwh, revenue, valid, voucher }

  Referência de tempo (`asOf`): a ÚLTIMA recarga importada, não o relógio — se a
  importação atrasa, ninguém vira "sumido" por falta de planilha.

  Estudo de 06/10/2026 que originou as regras (ver memória estudo-preco-concorrencia):
    - custo variável = % (área + plataforma + gestão + imposto) × preço + energia/kWh
    - RK no ponto de equilíbrio; JK com folga; clientes frequentes concentram a receita
*/
(function (global) {
  "use strict";

  const DAY = 86400000;
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const r2 = v => Math.round(v * 100) / 100;
  const dayIndex = day => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY);
  const median = list => {
    if (!list.length) return null;
    const s = list.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const DEFAULTS = Object.freeze({
    windowDays: 30,          // janela "atual" e "anterior" para comparar consumo
    dropMinBaseKwh: 100,     // só vale alerta de queda se o cliente consumia isso na janela anterior
    dropPct: 50,             // queda mínima (%) para avisar
    dropCriticalPct: 70,     // queda (%) que vira urgente quando o cliente é pesado
    heavyKwh: 200,           // kWh na janela anterior que torna o cliente "pesado"
    minSessionsGap: 4,       // histórico mínimo para a regra de sumiço
    gapFactor: 3,            // sumiu = ausente há mais de 3× o intervalo típico dele
    gapMinDays: 10,          // ...e nunca menos que isto
    lostAfterDays: 90,       // depois disso vira "perdido" (só contagem/lista informativa)
    valueUrgent: 400,        // R$/mês de um cliente que sumiu para ser urgente
    valueAttention: 150,
    frequentSessions: 10,    // segmentos pelo histórico de recargas válidas
    regularSessions: 4,
    occasionalSessions: 2,
    concentrationTop: 10,
    concentrationWarnPct: 40,
    siteDropAttentionPct: 15,
    siteDropCriticalPct: 25,
    siteMinAgeDays: 56       // carregador mais novo que isto não gera alerta de tendência
  });
  const opt = o => Object.assign({}, DEFAULTS, o || {});

  // ------------------------------------------------------------------
  // Clientes
  // ------------------------------------------------------------------
  function customerProfiles(sessions, asOf, o) {
    const c = opt(o), W = c.windowDays * DAY;
    const map = new Map();
    sessions.forEach(s => {
      if (!s.valid || !s.key) return;
      let p = map.get(s.key);
      if (!p) { p = { key: s.key, name: s.name || "", email: s.email || "", phone: s.phone || "", n: 0, kwh: 0, revenue: 0, firstT: Infinity, lastT: 0,
        sites: {}, voucherN: 0, days: new Set(), kwh30: 0, rev30: 0, n30: 0, kwhP30: 0, revP30: 0, nP30: 0, list: [] }; map.set(s.key, p); }
      p.n += 1; p.kwh += num(s.kwh); p.revenue += num(s.revenue);
      p.list.push([s.t, num(s.revenue), num(s.kwh)]);
      if (!p.name && s.name) p.name = s.name;
      if (!p.phone && s.phone) p.phone = s.phone;
      if (s.t < p.firstT) p.firstT = s.t;
      if (s.t > p.lastT) p.lastT = s.t;
      p.sites[s.site] = (p.sites[s.site] || 0) + num(s.kwh);
      if (s.voucher) p.voucherN += 1;
      if (s.day) p.days.add(dayIndex(s.day));
      const age = asOf - s.t;
      if (age >= 0 && age < W) { p.kwh30 += num(s.kwh); p.rev30 += num(s.revenue); p.n30 += 1; }
      else if (age >= W && age < 2 * W) { p.kwhP30 += num(s.kwh); p.revP30 += num(s.revenue); p.nP30 += 1; }
    });
    return [...map.values()].map(p => {
      const idx = [...p.days].sort((a, b) => a - b);
      const gaps = idx.slice(1).map((d, i) => d - idx[i]);
      const spanDays = Math.max(1, (p.lastT - p.firstT) / DAY);
      // R$/mês que o cliente costumava gerar: últimos 60 dias antes da última recarga dele.
      const rev60 = p.list.reduce((s, [t, v]) => p.lastT - t < 60 * DAY ? s + v : s, 0);
      const kwh60 = p.list.reduce((s, [t, , k]) => p.lastT - t < 60 * DAY ? s + k : s, 0);
      const monthlyValue = spanDays >= 60 ? rev60 / 2 : p.revenue * 30 / Math.max(spanDays, 30);
      const monthlyKwh = spanDays >= 60 ? kwh60 / 2 : p.kwh * 30 / Math.max(spanDays, 30);
      const mainSite = Object.entries(p.sites).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const { days, list, ...rest } = p;
      return { ...rest, daysSince: Math.floor((asOf - p.lastT) / DAY), medianGap: median(gaps), monthlyValue: r2(monthlyValue), monthlyKwh: r2(monthlyKwh), mainSite,
        pricePaid: p.kwh ? p.revenue / p.kwh : 0, voucherShare: p.n ? p.voucherN / p.n : 0, spanDays: Math.round(spanDays), activeDays: idx.length };
    });
  }

  function segmentOf(p, c) {
    return p.n >= c.frequentSessions ? "frequente" : p.n >= c.regularSessions ? "regular" : p.n >= c.occasionalSessions ? "ocasional" : "unico";
  }

  // Alertas por cliente. Cada item: { id, level, type, key, name, ..., monthlyValue, suggest }.
  function customerAlerts(profiles, asOf, o) {
    const c = opt(o), items = [];
    profiles.forEach(p => {
      const seg = segmentOf(p, c);
      const base = { key: p.key, name: p.name, email: p.email, phone: p.phone, site: p.mainSite, segment: seg, lastT: p.lastT, daysSince: p.daysSince,
        sessions: p.n, pricePaid: p.pricePaid, voucherShare: p.voucherShare, kwh30: p.kwh30, kwhP30: p.kwhP30 };
      // 1) Queda de consumo (ainda aparece, mas bem menos).
      if (p.kwh30 > 0 && p.kwhP30 >= c.dropMinBaseKwh) {
        const drop = (1 - p.kwh30 / p.kwhP30) * 100;
        if (drop >= c.dropPct) {
          const critical = drop >= c.dropCriticalPct && p.kwhP30 >= c.heavyKwh;
          items.push({ ...base, id: `queda-${p.key}`, type: "queda", level: critical ? "critico" : "atencao", dropPct: drop,
            monthlyValue: r2(Math.max(0, p.revP30 - p.rev30)), kwhAtRisk: r2(Math.max(0, p.kwhP30 - p.kwh30)),
            title: `Consumo caiu ${Math.round(drop)}%`, reason: `${Math.round(p.kwhP30)} kWh na janela anterior contra ${Math.round(p.kwh30)} kWh nos últimos ${c.windowDays} dias.`,
            suggest: "Falar com o cliente; avaliar tarifa do clube onde a margem permite." });
          return;
        }
      }
      // 2) Sumiu: ausente há bem mais que o intervalo típico dele.
      if (p.n >= c.minSessionsGap) {
        const typical = Math.max(c.gapMinDays, c.gapFactor * (p.medianGap || 0));
        if (p.daysSince > typical && p.daysSince <= c.lostAfterDays) {
          const v = p.monthlyValue;
          items.push({ ...base, id: `sumiu-${p.key}`, type: "sumiu", level: v >= c.valueUrgent ? "critico" : v >= c.valueAttention ? "atencao" : "info", monthlyValue: v, kwhAtRisk: p.monthlyKwh,
            title: `Sem recarga há ${p.daysSince} dias`, reason: `Costumava voltar a cada ${p.medianGap != null ? Math.max(1, Math.round(p.medianGap)) : "—"} dia(s); ${p.n} recargas no histórico.`,
            suggest: "Mensagem de reativação; conferir se não trocou de cadastro." });
        } else if (p.daysSince > c.lostAfterDays && p.monthlyValue >= c.valueAttention) {
          items.push({ ...base, id: `perdido-${p.key}`, type: "perdido", level: "info", monthlyValue: p.monthlyValue, kwhAtRisk: p.monthlyKwh,
            title: `Parado há ${p.daysSince} dias`, reason: `Era um cliente ${seg}; ${p.n} recargas.`, suggest: "Campanha de retorno, não alerta individual." });
        }
      }
    });
    const order = { critico: 0, atencao: 1, info: 2 };
    return items.sort((a, b) => order[a.level] - order[b.level] || b.monthlyValue - a.monthlyValue);
  }

  function segmentSummary(profiles, asOf, o) {
    const c = opt(o), out = {};
    ["frequente", "regular", "ocasional", "unico"].forEach(id => { out[id] = { id, clients: 0, active30: 0, revenue: 0, kwh: 0, rev30: 0, kwh30: 0, kwhP30: 0, voucherSessions: 0, sessions: 0 }; });
    profiles.forEach(p => {
      const s = out[segmentOf(p, c)];
      s.clients += 1; s.revenue += p.revenue; s.kwh += p.kwh; s.sessions += p.n; s.voucherSessions += p.voucherN;
      if (p.n30 > 0) s.active30 += 1;
      s.rev30 += p.rev30; s.kwh30 += p.kwh30; s.kwhP30 += p.kwhP30;
    });
    const totalRev = profiles.reduce((s, p) => s + p.revenue, 0) || 1;
    return Object.values(out).map(s => ({ ...s, revenueShare: s.revenue / totalRev * 100, pricePaid: s.kwh ? s.revenue / s.kwh : 0, voucherShare: s.sessions ? s.voucherSessions / s.sessions * 100 : 0 }));
  }

  function concentration(profiles, o) {
    const c = opt(o);
    const rev = profiles.filter(p => p.rev30 > 0).map(p => p.rev30).sort((a, b) => b - a);
    const total = rev.reduce((s, v) => s + v, 0);
    const top = rev.slice(0, c.concentrationTop).reduce((s, v) => s + v, 0);
    const pct = total ? top / total * 100 : 0;
    return { top: c.concentrationTop, clients: rev.length, total, topRevenue: top, pct, warn: pct >= c.concentrationWarnPct };
  }

  // Clientes-chave: maiores receitas dos últimos 90 dias, com a leitura de cada um.
  function keyClients(profiles, sessions, asOf, limit, o) {
    const c = opt(o), since = asOf - 90 * DAY, rev = new Map();
    sessions.forEach(s => { if (s.valid && s.t >= since) rev.set(s.key, (rev.get(s.key) || 0) + num(s.revenue)); });
    return profiles.filter(p => rev.has(p.key)).map(p => ({ key: p.key, name: p.name, email: p.email, phone: p.phone, site: p.mainSite, segment: segmentOf(p, c), revenue90: rev.get(p.key),
      kwh30: p.kwh30, kwhP30: p.kwhP30, daysSince: p.daysSince, pricePaid: p.pricePaid, voucherShare: p.voucherShare, sessions: p.n,
      trendPct: p.kwhP30 ? (p.kwh30 / p.kwhP30 - 1) * 100 : null }))
      .sort((a, b) => b.revenue90 - a.revenue90).slice(0, limit || 20);
  }

  // ------------------------------------------------------------------
  // Carregadores: tendência semanal e perfil de carga
  // ------------------------------------------------------------------
  function siteTrend(sessions, asOf, o) {
    const c = opt(o), W = 7 * DAY, bySite = {};
    sessions.forEach(s => { if (s.valid) (bySite[s.site] = bySite[s.site] || []).push(s); });
    return Object.entries(bySite).map(([site, list]) => {
      const first = list.reduce((m, s) => Math.min(m, s.t), Infinity);
      const weeks = Array.from({ length: 8 }, () => ({ kwh: 0, n: 0, clients: new Set() }));
      list.forEach(s => { const age = asOf - s.t; if (age < 0 || age >= 8 * W) return; const w = weeks[7 - Math.floor(age / W)]; w.kwh += num(s.kwh); w.n += 1; w.clients.add(s.key); });
      const cur = weeks.slice(4).reduce((s, w) => s + w.kwh, 0), prev = weeks.slice(0, 4).reduce((s, w) => s + w.kwh, 0);
      const ageDays = (asOf - first) / DAY, mature = ageDays >= c.siteMinAgeDays;
      const changePct = prev > 0 ? (cur / prev - 1) * 100 : null;
      const level = !mature || changePct === null ? "info" : changePct <= -c.siteDropCriticalPct ? "critico" : changePct <= -c.siteDropAttentionPct ? "atencao" : "ok";
      return { site, ageDays: Math.round(ageDays), mature, kwh28: cur, kwhPrev28: prev, changePct, level,
        weekly: weeks.map(w => ({ kwh: r2(w.kwh), sessions: w.n, clients: w.clients.size })) };
    }).sort((a, b) => b.kwh28 - a.kwh28);
  }

  // kWh por hora do dia (média por dia), no horário local fornecido pelo adaptador.
  function loadProfile(sessions, asOf, powerKw, days) {
    const span = days || 56, since = asOf - span * DAY;
    const list = sessions.filter(s => s.valid && s.t >= since && s.t <= asOf);
    const hours = Array(24).fill(0), counts = Array(24).fill(0), dows = Array(7).fill(0);
    list.forEach(s => { hours[s.hour] += num(s.kwh); counts[s.hour] += 1; dows[s.dow] += num(s.kwh); });
    // dias corridos da primeira à última recarga da janela (limitado à janela)
    const idx = list.map(s => dayIndex(s.day));
    const nDays = idx.length ? Math.max(1, Math.min(span, idx.reduce((m, v) => Math.max(m, v), -Infinity) - idx.reduce((m, v) => Math.min(m, v), Infinity) + 1)) : 1;
    const kwhPerDay = hours.map(v => v / nDays);
    const util = powerKw > 0 ? kwhPerDay.map(v => v / powerKw) : kwhPerDay.map(() => 0);
    const total = kwhPerDay.reduce((s, v) => s + v, 0);
    return { days: nDays, kwhPerDay, sessionsPerDay: counts.map(v => v / nDays), util, peakUtil: Math.max(...util), avgUtil: powerKw > 0 ? total / (powerKw * 24) : 0,
      totalPerDay: total, kwhByDow: dows.map(v => v / Math.max(1, nDays / 7)) };
  }
  const kwhInHours = (profile, hours) => hours.reduce((s, h) => s + (profile.kwhPerDay[h] || 0), 0);

  // ------------------------------------------------------------------
  // Preço: escada, preço de lista, eventos de reajuste
  // ------------------------------------------------------------------
  function priceLadder(sessions, o) {
    const minN = (o && o.minSessions) || 5, tiers = new Map();
    sessions.forEach(s => {
      if (!s.valid || num(s.kwh) < 3) return;
      const price = Math.round(num(s.revenue) / num(s.kwh) * 100) / 100;
      let t = tiers.get(price);
      if (!t) { t = { price, n: 0, kwh: 0, voucherN: 0, vouchers: {}, first: s.day, last: s.day }; tiers.set(price, t); }
      t.n += 1; t.kwh += num(s.kwh);
      if (s.voucher) { t.voucherN += 1; t.vouchers[s.voucher] = (t.vouchers[s.voucher] || 0) + 1; }
      if (s.day < t.first) t.first = s.day;
      if (s.day > t.last) t.last = s.day;
    });
    return [...tiers.values()].filter(t => t.n >= minN).sort((a, b) => b.n - a.n);
  }

  // Preço de lista = moda do preço por kWh das recargas SEM cupom nos últimos 60 dias.
  function listPrice(sessions, asOf) {
    const counts = new Map();
    sessions.forEach(s => {
      if (!s.valid || s.voucher || num(s.kwh) < 3 || asOf - s.t > 60 * DAY) return;
      const p = Math.round(num(s.revenue) / num(s.kwh) * 100) / 100;
      counts.set(p, (counts.get(p) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  }

  // Detecta reajustes de lista por carregador. Usa só recargas sem cupom e 3+ kWh e olha o preço
  // por kWh: quando a mediana das N recargas seguintes difere ≥ 4,5% da das N anteriores (e a
  // maioria de cada lado fica perto da própria mediana), acha o melhor ponto de corte de dois
  // níveis na janela. Tolera ruído real (promoções sem cupom, taxa de ociosidade, arredondamento).
  // Mede os kWh/semana antes e depois e a sensibilidade implícita.
  function priceEvents(sessions, asOf, o) {
    const N = (o && o.run) || 6, bySite = {}, events = [];
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    const share = (arr, m) => arr.filter(v => Math.abs(v - m) <= 0.05 * m).length / arr.length;
    sessions.forEach(s => { if (s.valid) (bySite[s.site] = bySite[s.site] || []).push(s); });
    Object.entries(bySite).forEach(([site, all]) => {
      all.sort((a, b) => a.t - b.t);
      const list = all.filter(s => !s.voucher && num(s.kwh) >= 3).map(s => ({ t: s.t, day: s.day, p: num(s.revenue) / num(s.kwh) }));
      const firstT = all[0].t;
      let lastEvent = -Infinity, i = N;
      while (i + N <= list.length) {
        const before = list.slice(i - N, i).map(x => x.p), after = list.slice(i, i + N).map(x => x.p);
        const mb = median(before), ma = median(after);
        if (Math.abs(ma - mb) / mb < 0.045 || share(before, mb) < 0.6 || share(after, ma) < 0.6) { i += 1; continue; }
        const win = list.slice(i - N, i + N).map(x => x.p);
        let best = null;
        for (let k = 3; k <= win.length - 3; k++) {
          const L = win.slice(0, k), R = win.slice(k), ml = mean(L), mr = mean(R);
          const sse = L.reduce((s, v) => s + (v - ml) ** 2, 0) + R.reduce((s, v) => s + (v - mr) ** 2, 0);
          if (!best || sse < best.sse) best = { k, sse };
        }
        const idx = i - N + best.k, t0 = list[idx].t;
        i = idx + N;
        if (t0 - lastEvent < 14 * DAY) continue;
        lastEvent = t0;
        const p0 = median(win.slice(0, best.k)), p1 = median(win.slice(best.k));
        const sum = (from, to) => all.reduce((s, x) => x.t >= from && x.t < to ? s + num(x.kwh) : s, 0);
        const bDays = Math.min(42, (t0 - firstT) / DAY), aDays = Math.min(42, (asOf - t0) / DAY);
        const enough = bDays >= 21 && aDays >= 21;
        const rateB = bDays > 0 ? sum(t0 - bDays * DAY, t0) / (bDays / 7) : 0, rateA = aDays > 0 ? sum(t0, t0 + aDays * DAY) / (aDays / 7) : 0;
        const ageDays = (t0 - firstT) / DAY;
        const lowVolume = enough && Math.min(rateB, rateA) < 60; // ~3 recargas/semana: o acaso pesa mais que o preço
        events.push({ site, date: list[idx].day, priceFrom: r2(p0), priceTo: r2(p1), pricePct: (p1 / p0 - 1) * 100,
          kwhWeekBefore: rateB, kwhWeekAfter: rateA, volumePct: rateB > 0 ? (rateA / rateB - 1) * 100 : null, daysBefore: Math.round(bDays), daysAfter: Math.round(aDays),
          elasticity: enough && rateB > 0 && rateA > 0 ? Math.log(rateA / rateB) / Math.log(p1 / p0) : null,
          confidence: !enough ? "insuficiente" : ageDays < 56 || lowVolume ? "baixa" : "media",
          note: !enough ? "Menos de 3 semanas de dados de um dos lados." : ageDays < 56 ? "Carregador novo: a curva de lançamento se mistura com o efeito do preço."
            : lowVolume ? "Volume pequeno (menos de 60 kWh por semana): a variação ao acaso esconde o efeito do preço." : "" });
      }
    });
    return events.sort((a, b) => b.date.localeCompare(a.date));
  }

  // ------------------------------------------------------------------
  // Margem e cenários
  // ------------------------------------------------------------------
  // site: { kwh, price, energyPerKwh, pctCost (0-1: área+plataforma+gestão+imposto), fixedMonth, listNow }
  const margin = (site, price) => price * (1 - num(site.pctCost)) - num(site.energyPerKwh);

  function breakeven(site) {
    const keep = 1 - num(site.pctCost);
    if (keep <= 0) return { priceVariable: null, priceFull: null };
    const fixedPerKwh = site.kwh > 0 ? num(site.fixedMonth) / site.kwh : 0;
    return { priceVariable: num(site.energyPerKwh) / keep, priceFull: (num(site.energyPerKwh) + fixedPerKwh) / keep };
  }

  // Preço de lista novo e sensibilidade do volume ao preço (elasticidade, negativa).
  function scenario(site, newList, elasticity) {
    const listNow = num(site.listNow) || num(site.price);
    const ratio = listNow > 0 ? newList / listNow : 1;
    const price = site.price * ratio;
    const volMult = Math.pow(ratio, elasticity);
    const kwh = site.kwh * volMult;
    const m = margin(site, price);
    const res = kwh * m - num(site.fixedMonth);
    const m0 = margin(site, site.price), res0 = site.kwh * m0 - num(site.fixedMonth);
    return { list: newList, price, kwh, volumePct: (volMult - 1) * 100, marginPerKwh: m, revenue: kwh * price, result: res, resultNow: res0, delta: res - res0,
      // volume (múltiplo do atual) para manter o resultado de hoje; null se a margem por kWh não é positiva
      volumeNeeded: m > 0 && site.kwh > 0 ? (res0 + num(site.fixedMonth)) / (m * site.kwh) : null };
  }
  function sweep(site, lists, elasticities) {
    return lists.map(l => ({ list: l, byElasticity: Object.fromEntries(elasticities.map(e => [e, scenario(site, l, e)])), needed: scenario(site, l, -1).volumeNeeded }));
  }

  // Desconto para um segmento (clientes frequentes, janela fora do pico...).
  // baseKwh: kWh/mês do segmento hoje; extraKwhPct: volume novo atraído; retainedKwh: kWh que sairiam e ficam.
  function segmentScenario(site, { baseKwh, priceNow, priceNew, extraKwhPct = 0, retainedKwh = 0 }) {
    const m0 = margin(site, priceNow), m1 = margin(site, priceNew);
    const now = baseKwh * m0;
    const after = (baseKwh + retainedKwh) * m1 + (baseKwh * extraKwhPct / 100) * m1;
    // volume extra (kWh/mês) que paga o desconto: (base+ret+extra)*m1 = now
    const extraNeeded = m1 > 0 ? Math.max(0, now / m1 - baseKwh - retainedKwh) : null;
    return { marginNow: m0, marginNew: m1, resultNow: now, resultAfter: after, delta: after - now, extraKwhNeeded: extraNeeded,
      extraNeededPct: extraNeeded !== null && baseKwh > 0 ? extraNeeded / baseKwh * 100 : null };
  }

  // ------------------------------------------------------------------
  // Pacote completo para a tela de Clientes
  // ------------------------------------------------------------------
  function customerWatch(sessions, o) {
    const valid = sessions.filter(s => s.valid && s.key);
    const asOf = valid.reduce((t, s) => Math.max(t, s.t), 0);
    const profiles = customerProfiles(valid, asOf, o);
    const alerts = customerAlerts(profiles, asOf, o);
    const counts = { critico: 0, atencao: 0, info: 0 };
    alerts.forEach(a => { counts[a.level] += 1; });
    const c = opt(o);
    const newNoReturn = profiles.filter(p => p.n === 1 && asOf - p.lastT >= 14 * DAY && asOf - p.lastT < 45 * DAY).length;
    return { asOf, settings: c, alerts, counts, segments: segmentSummary(profiles, asOf, o), concentration: concentration(profiles, o),
      keyClients: keyClients(profiles, valid, asOf, 20, o), sites: siteTrend(valid, asOf, o),
      totals: { clients: profiles.length, active30: profiles.filter(p => p.n30 > 0).length, newNoReturn,
        atRiskMonthly: alerts.filter(a => a.level !== "info" && a.type !== "perdido").reduce((s, a) => s + a.monthlyValue, 0) } };
  }

  global.UBY_ANALYTICS_CORE = Object.freeze({ DEFAULTS, customerProfiles, customerAlerts, segmentSummary, concentration, keyClients, siteTrend, loadProfile, kwhInHours,
    priceLadder, listPrice, priceEvents, margin, breakeven, scenario, sweep, segmentScenario, customerWatch });
})(typeof window !== "undefined" ? window : globalThis);

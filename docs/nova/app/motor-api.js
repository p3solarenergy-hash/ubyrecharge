/*
  NOVA PLATAFORMA — API do motor.

  Este arquivo roda DENTRO da pagina original de recargas (legado/obra-ev/motor.html),
  depois de recargas_app.js. Por ser um script classico no mesmo escopo global,
  ele enxerga as mesmas funcoes e o mesmo estado do motor original e apenas
  reorganiza os resultados em objetos simples para as telas novas.

  Regra: nenhuma formula nova. Cada numero abaixo reaproveita as funcoes do motor
  (getUbyChargerRows, cleanOperationStats, occByInterval, stationOccupancyForMonths,
  financeSettingsForUbyRow, dailyOperationalRows...). Os blocos mais longos sao
  transcricoes diretas de renderUbyOperation() sem a parte de HTML.
*/
(function () {
  "use strict";

  let readyPromise = null;
  let fullPromise = null;

  const iso = date => (date instanceof Date && !Number.isNaN(date.getTime())) ? date.toISOString() : null;
  const sumBy = (list, fn) => list.reduce((sum, item) => sum + Number(fn(item) || 0), 0);
  const clientsOf = charges => new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;

  function waitForReady() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      document.addEventListener("uby:recharge-ready", finish, { once: true });
      // Seguranca: se o evento ja passou, verifica o estado periodicamente.
      const timer = setInterval(() => {
        if (Object.keys(allRechargeRecords || {}).length) { clearInterval(timer); setTimeout(finish, 300); }
      }, 400);
      setTimeout(() => { clearInterval(timer); finish(); }, 60000);
    });
    return readyPromise;
  }

  // Historico completo + matriz financeira: necessarios para comparativos,
  // acumulado e classificacao DC propria x parceiros.
  function loadFull() {
    if (fullPromise) return fullPromise;
    fullPromise = (async () => {
      await waitForReady();
      await ensureAllOverviewSessionsLoaded();
      try { await ensureMatrizCostsLoaded(); } catch (err) { console.warn("[motor-api] matriz:", err.message); }
      return status();
    })();
    return fullPromise;
  }

  function status() {
    const profile = window.UBY_AUTH?.current?.() || null;
    return {
      version: typeof UBY_APP_VERSION !== "undefined" ? UBY_APP_VERSION : "",
      works: (cloudRechargeWorks || []).length,
      records: Object.keys(allRechargeRecords || {}).length,
      charges: countDetailedCharges(),
      fullHistory: !!overviewSessionsFullyHydrated,
      readOnly: window.UBY_READ_ONLY !== false,
      user: profile ? { label: profile.label, email: profile.email, role: profile.role } : null,
      loadedAt: new Date().toISOString()
    };
  }

  function months() {
    const rows = getUbyChargerRows(getGeneralUnitData()).filter(row => row.included);
    return [...new Set(rows.flatMap(row => row.charges).map(chargeMonthKey).filter(key => key !== "unknown"))]
      .filter(isPlausibleMonthKey).sort();
  }

  function monthName(key) { return key ? monthLabel(key) : "Acumulado"; }

  // ---------------------------------------------------------------------
  // Comando da rede — transcricao de renderUbyOperation() sem HTML.
  // monthKey: 'YYYY-MM' para um mes, '' para acumulado, undefined = mes mais recente.
  // ---------------------------------------------------------------------
  function command(requestedMonth) {
    const sourceUnitData = getGeneralUnitData();
    const sourceRows = getUbyChargerRows(sourceUnitData);
    const sourceIncluded = sourceRows.filter(row => row.included);
    const sourceUbyCharges = sourceIncluded.flatMap(row => row.charges);
    const sourceMonths = [...new Set(sourceUbyCharges.map(chargeMonthKey).filter(key => key !== "unknown"))].filter(isPlausibleMonthKey).sort();
    const latestMonth = sourceMonths.at(-1) || "";
    const currentGeneralMonth = requestedMonth === undefined ? latestMonth : (sourceMonths.includes(requestedMonth) ? requestedMonth : "");
    let isMonthView = !!currentGeneralMonth;

    let visibleRows = sourceRows.map(row => summarizeUbyChargerRow(
      row,
      isMonthView ? row.charges.filter(charge => chargeMonthKey(charge) === currentGeneralMonth) : row.charges
    ));
    let included = visibleRows.filter(row => row.included && row.count > 0);
    const monthFallbackToAccumulated = isMonthView && !included.length && sourceUbyCharges.length;
    if (monthFallbackToAccumulated) {
      isMonthView = false;
      visibleRows = sourceRows.map(row => summarizeUbyChargerRow(row, row.charges));
      included = visibleRows.filter(row => row.included && row.count > 0);
    }
    included.sort((a, b) => b.revenue - a.revenue);
    const allUbyCharges = included.flatMap(row => row.charges);
    const financeScopeMonth = currentGeneralMonth || latestMonth;
    const modelOf = row => normalizeOperationModel(financeSettingsForUbyRow(row, financeScopeMonth).operationModel);
    const isOwnedUbyRow = row => ["uby", "hybrid"].includes(modelOf(row));

    const primaryDcRows = included.filter(row => row.kind === "dc" && isOwnedUbyRow(row));
    const primaryAcRows = included.filter(row => row.kind === "ac" && isOwnedUbyRow(row));
    const partnerRows = included.filter(row => modelOf(row) === "third_party_management");
    const primaryDcCharges = primaryDcRows.flatMap(row => row.charges);
    const primaryAcCharges = primaryAcRows.flatMap(row => row.charges);
    const partnerCharges = partnerRows.flatMap(row => row.charges);
    const revenue = sumBy(included, row => row.revenue);
    const energy = sumBy(included, row => row.energy);
    const totalCharges = allUbyCharges.length;

    const dailyAverage = rows => {
      const list = rows.map(row => {
        const dates = row.charges.map(charge => charge.startDate).filter(date => date && !Number.isNaN(date.getTime()));
        const firstDay = dates.length ? dateOnly(new Date(Math.min(...dates))) : null;
        const lastDay = dates.length ? dateOnly(new Date(Math.max(...dates))) : null;
        const days = firstDay && lastDay ? Math.round((lastDay - firstDay) / 86_400_000) + 1 : 0;
        return { station: row.stationName || row.workName || "Carregador", perDay: days ? row.count / days : 0 };
      });
      return { list, avg: list.length ? list.reduce((s, r) => s + r.perDay, 0) / list.length : 0 };
    };

    const months = [...new Set(allUbyCharges.map(chargeMonthKey).filter(key => key !== "unknown"))].sort();
    const windows = [];
    const maxKWhFor = rows => {
      let max = 0;
      rows.forEach(row => {
        const operationStart = operationStartForCharges(row.charges, row);
        months.forEach(mk => {
          const monthCharges = row.charges.filter(charge => chargeMonthKey(charge) === mk);
          if (!monthCharges.length) return;
          const window = periodWindow(monthCharges, mk, "mtd", operationStart);
          if (rows === included) windows.push(window);
          max += occByInterval(monthCharges, workPowerById(row.workId), window, row).maxKWh;
        });
      });
      return max;
    };
    const totalMaxKWh = maxKWhFor(included);
    const totalOcc = totalMaxKWh > 0 ? energy / totalMaxKWh * 100 : 0;

    const monthlyPanelComparison = (historyCharges = []) => {
      const scopeMonth = isMonthView && currentGeneralMonth ? currentGeneralMonth : latestMonth;
      const scoped = historyCharges.filter(charge => chargeMonthKey(charge) === scopeMonth && isExecutedCharge(charge));
      const lastScopedDate = scoped.reduce((last, charge) => !last || charge.startDate > last ? charge.startDate : last, null);
      if (!scopeMonth || !lastScopedDate) return { hasBase: false, label: "sem base mensal", current: summaryMetrics([]), previous: summaryMetrics([]) };
      const [year, month] = scopeMonth.split("-").map(Number);
      const currentStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const previousStart = shiftToPreviousMonth(currentStart);
      const previousEnd = shiftToPreviousMonth(lastScopedDate);
      const previousCharges = historyCharges.filter(charge => isExecutedCharge(charge) && charge?.startDate >= previousStart && charge.startDate <= previousEnd);
      const previousMonthKey = `${previousEnd.getFullYear()}-${String(previousEnd.getMonth() + 1).padStart(2, "0")}`;
      return {
        hasBase: previousCharges.length > 0,
        label: `${monthLabel(scopeMonth)} vs ${monthLabel(previousMonthKey)} (1-${previousEnd.getDate()})`,
        current: summaryMetrics(scoped),
        previous: summaryMetrics(previousCharges)
      };
    };
    const daysCovered = charges => {
      const dates = charges.map(charge => charge?.startDate).filter(date => date && !Number.isNaN(date.getTime()));
      if (!dates.length) return 0;
      return Math.max(1, Math.round((dateOnly(new Date(Math.max(...dates))) - dateOnly(new Date(Math.min(...dates)))) / 86_400_000) + 1);
    };
    const plainComparison = cmp => {
      const pick = m => ({ revenue: m.revenue, energy: m.energy, count: m.count, clients: m.clients, avgTicket: m.avgTicket, avgKwh: m.avgKwh, avgDuration: m.avgDuration, failedCount: m.failedCount,
        perDay: m.count / daysCovered(m.clean?.executed || []) || 0 });
      return { hasBase: cmp.hasBase, label: cmp.label, current: pick(cmp.current), previous: pick(cmp.previous) };
    };

    const block = (rows, charges, sourceChargesForComparison) => {
      const clean = cleanOperationStats(charges);
      const durations = clean.executed.map(charge => durToHours(charge.duration)).filter(h => h > 0);
      const blockEnergy = sumBy(charges, c => c.energyKWh);
      const maxKWh = maxKWhFor(rows);
      const perDay = dailyAverage(rows);
      const best = rows.slice().sort((a, b) => b.revenue - a.revenue)[0];
      return {
        chargers: rows.length,
        occupancy: maxKWh > 0 ? blockEnergy / maxKWh * 100 : 0,
        revenue: sumBy(rows, row => row.revenue),
        energy: blockEnergy,
        sessions: charges.length,
        clients: clientsOf(charges),
        validSessions: clean.executed.length,
        avgTicket: clean.avgTicket,
        avgKwh: clean.avgKwh,
        avgDurationHours: durations.length ? durations.reduce((s, h) => s + h, 0) / durations.length : 0,
        avgDurationLabel: formatRechargeDuration(durations.length ? durations.reduce((s, h) => s + h, 0) / durations.length : 0),
        durationSessions: durations.length,
        perDay: perDay.avg,
        perDayByStation: perDay.list,
        availability: charges.length ? clean.executed.length / charges.length * 100 : 0,
        failures: clean.failed.length,
        failureRate: charges.length ? clean.failed.length / charges.length * 100 : 0,
        shortOrZero: clean.shortOrZero.length,
        best: best ? { station: best.stationName, revenue: best.revenue } : null,
        comparison: plainComparison(monthlyPanelComparison(sourceChargesForComparison))
      };
    };

    const dc = block(primaryDcRows, primaryDcCharges, sourceIncluded.filter(row => row.kind === "dc" && isOwnedUbyRow(row)).flatMap(row => row.charges));
    const ac = block(primaryAcRows, primaryAcCharges, sourceIncluded.filter(row => row.kind === "ac" && isOwnedUbyRow(row)).flatMap(row => row.charges));
    ac.networkShare = totalCharges ? primaryAcCharges.length / totalCharges * 100 : 0;
    dc.networkShare = totalCharges ? primaryDcCharges.length / totalCharges * 100 : 0;
    dc.revenueShare = revenue ? dc.revenue / revenue * 100 : 0;
    ac.revenueShare = revenue ? ac.revenue / revenue * 100 : 0;

    const partnerRevenue = sumBy(partnerRows, row => row.revenue);
    const partnerRoyalty = partnerRows.reduce((sum, row) => sum + Number(row.revenue || 0) * Number(financeSettingsForUbyRow(row, financeScopeMonth).ubyRoyaltyPct || 0) / 100, 0);

    const projectionMonth = isMonthView && currentGeneralMonth ? currentGeneralMonth : latestMonth;
    const forecasts = sourceIncluded.map(row => ubyNetworkProjectionForRow(row, projectionMonth)).filter(f => f.coveredDays > 0);

    // Comparativo DC por carregador (periodo do painel), mesma regra do painel original.
    const dcMonthKeys = isMonthView && currentGeneralMonth ? [currentGeneralMonth] : sourceMonths;
    const dcComparison = sourceIncluded.filter(row => row.kind === "dc" && isOwnedUbyRow(row)).map(sourceRow => {
      const row = summarizeUbyChargerRow(sourceRow, sourceRow.charges.filter(charge => dcMonthKeys.includes(chargeMonthKey(charge))));
      const occupancy = stationOccupancyForMonths(row, dcMonthKeys, "mtd");
      const clean = cleanOperationStats(row.charges);
      return {
        key: dcComparisonRowKey(row), station: row.stationName || row.workName, workId: row.workId, workName: row.workName,
        revenue: row.revenue, occupancy: occupancy.pct, availability: clean.total ? clean.executed.length / clean.total * 100 : 0,
        completed: clean.executed.length, attempts: clean.total, energy: row.energy, sessions: row.count, clients: row.clients,
        avgTicket: row.avgTicket, avgKwh: row.count ? row.energy / row.count : 0, failures: clean.failed.length,
        daily: dailySeries(row.charges)
      };
    }).sort((a, b) => b.revenue - a.revenue || String(a.station).localeCompare(String(b.station), "pt-BR"));

    // Todas as linhas (incluidas ou nao) com origem da regra, para auditoria.
    const chargerTable = visibleRows.map(row => ({
      workId: row.workId, workName: row.workName, station: row.station, kind: row.kind, included: row.included,
      ruleSource: row.ruleSource, model: row.included ? modelOf(row) : "", sessions: row.count, energy: row.energy,
      revenue: row.revenue, clients: row.clients
    }));

    // Ranking de unidades com ocupacao (unitOccupancyMarkup do original).
    const accessMonthKeys = isMonthView && currentGeneralMonth ? [currentGeneralMonth] : sourceMonths;
    const units = visibleRows.filter(row => row.included)
      .sort((a, b) => b.revenue - a.revenue || String(a.stationName || a.workName).localeCompare(String(b.stationName || b.workName), "pt-BR"))
      .map(unit => {
        const occ = stationOccupancyForMonths(unit, accessMonthKeys, "mtd");
        const band = occupationBand(occ.pct);
        return { workId: unit.workId, workName: unit.workName, station: unit.stationName || unit.workName, kind: unit.kind, model: modelOf(unit),
          revenue: unit.revenue, sessions: unit.count, energy: unit.energy, clients: unit.clients, occupancy: occ.pct, occupancyHours: occ.hours,
          band: band.label, bandClass: band.className, lastDate: iso(unit.lastDate) };
      });

    const monthly = sourceMonths.map(mk => {
      const monthCharges = sourceUbyCharges.filter(charge => chargeMonthKey(charge) === mk);
      const own = sourceIncluded.filter(isOwnedUbyRow).flatMap(r => r.charges).filter(charge => chargeMonthKey(charge) === mk);
      return { key: mk, label: monthLabel(mk), revenue: sumBy(monthCharges, c => c.revenue), energy: sumBy(monthCharges, c => c.energyKWh),
        sessions: monthCharges.length, ownRevenue: sumBy(own, c => c.revenue) };
    });

    const days = dailySeries(allUbyCharges, sourceUbyCharges);
    const dates = allUbyCharges.map(charge => charge.startDate).filter(Boolean);
    const firstPeriod = windows.length ? new Date(Math.min(...windows.map(w => w.start).filter(Boolean))) : (dates.length ? new Date(Math.min(...dates)) : null);
    const lastPeriod = windows.length ? new Date(Math.max(...windows.map(w => w.end).filter(Boolean))) : (dates.length ? new Date(Math.max(...dates)) : null);
    const occBand = occupationBand(totalOcc);

    return {
      period: {
        monthKey: isMonthView ? currentGeneralMonth : "",
        label: monthFallbackToAccumulated ? `Acumulado (sem recargas em ${monthLabel(currentGeneralMonth)})` : (isMonthView ? monthLabel(currentGeneralMonth) : "Acumulado"),
        isLatest: isMonthView && currentGeneralMonth === latestMonth,
        start: iso(firstPeriod), end: iso(lastPeriod), months: sourceMonths, latestMonth
      },
      network: {
        revenue, energy, sessions: totalCharges, clients: clientsOf(allUbyCharges), chargers: included.length,
        units: new Set(included.map(row => row.workId)).size, occupancy: totalOcc, occupancyBand: occBand.label, occupancyRange: occBand.range,
        ownRevenue: dc.revenue + ac.revenue, projectedRevenue: sumBy(forecasts, f => f.projectedRevenue),
        projectedEnergy: sumBy(forecasts, f => f.projectedEnergy), projectionUnits: forecasts.length, projectionMonth,
        acdc: generalAcDcStats(allUbyCharges)
      },
      daily: dailyResult(days),
      dc, ac,
      partners: { chargers: partnerRows.length, sessions: partnerCharges.length, revenue: partnerRevenue, royalty: partnerRoyalty,
        rows: partnerRows.map(row => ({ station: row.stationName, workName: row.workName, revenue: row.revenue, sessions: row.count,
          royaltyPct: Number(financeSettingsForUbyRow(row, financeScopeMonth).ubyRoyaltyPct || 0) })) },
      dcComparison, chargerTable, units, monthly, days, health: health(allUbyCharges)
    };
  }

  // ---------------------------------------------------------------------
  // Resultado por carregador e por operação (barras, estilo painel Spott) para qualquer intervalo.
  // range: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } inclusivo, horário local.
  // Soma com summarizeUbyChargerRow (mesma regra do comando) e compara com o
  // período imediatamente anterior de mesmo tamanho. Ordem: UBY primeiro,
  // parceiros, depois P3 (só gestão / sociedade) e o que está fora da UBY.
  // ---------------------------------------------------------------------
  function companyResults(range = {}) {
    const parse = (value, endOfDay) => {
      const [y, m, d] = String(value || "").split("-").map(Number);
      return y && m && d ? (endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0)) : null;
    };
    const rows = getUbyChargerRows(getGeneralUnitData());
    const dates = rows.flatMap(row => row.charges || []).map(c => c.startDate).filter(d => d instanceof Date && !Number.isNaN(d.getTime()));
    const bounds = dates.length ? { first: iso(new Date(Math.min(...dates))), last: iso(new Date(Math.max(...dates))) } : null;
    const start = parse(range.start, false), end = parse(range.end, true);
    if (!start || !end || end < start) return { bounds, groups: [], range: null };
    const span = end.getTime() - start.getTime() + 1;
    const prevStart = new Date(start.getTime() - span), prevEnd = new Date(start.getTime() - 1);
    const monthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
    const inRange = (c, a, b) => c.startDate instanceof Date && c.startDate >= a && c.startDate <= b;

    const units = rows.map(row => {
      const cur = summarizeUbyChargerRow(row, (row.charges || []).filter(c => inRange(c, start, end)));
      const prev = summarizeUbyChargerRow(row, (row.charges || []).filter(c => inRange(c, prevStart, prevEnd)));
      const clean = cleanOperationStats(cur.charges);
      const model = row.included ? normalizeOperationModel(financeSettingsForUbyRow(row, monthKey).operationModel) : "";
      return { workId: row.workId, workName: row.workName, station: row.station, kind: row.kind, included: row.included, model,
        revenue: cur.revenue, energy: cur.energy, sessions: cur.count, valid: clean.executed.length, failures: clean.failed.length, clients: cur.clients,
        prevRevenue: prev.revenue, prevEnergy: prev.energy, prevSessions: prev.count };
    }).filter(u => u.sessions || u.prevSessions);

    const GROUPS = [
      { id: "uby", label: "Operação UBY", note: "ativos próprios UBY", test: u => u.included && !["third_party_management", "management_only", "p3_society"].includes(u.model) },
      { id: "partner", label: "Parceiros", note: "modelo parceria · royalty UBY", test: u => u.included && u.model === "third_party_management" },
      { id: "p3", label: "Só gestão P3", note: "gestão ou sociedade P3 · fora da UBY", test: u => u.included && ["management_only", "p3_society"].includes(u.model) },
      { id: "outside", label: "Fora da operação UBY", note: "carregadores não classificados na UBY", test: u => !u.included }
    ];
    const groups = GROUPS.map(g => {
      const list = units.filter(g.test).sort((a, b) => b.revenue - a.revenue);
      const sum = key => list.reduce((s, u) => s + Number(u[key] || 0), 0);
      return { id: g.id, label: g.label, note: g.note, units: list, revenue: sum("revenue"), energy: sum("energy"), sessions: sum("sessions"),
        failures: sum("failures"), prevRevenue: sum("prevRevenue"), prevEnergy: sum("prevEnergy"), prevSessions: sum("prevSessions") };
    }).filter(g => g.units.length);
    return { bounds, groups, range: { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd) } };
  }

  // Serie diaria com a mesma regra de dailyOperationalRows (falhas separadas).
  function dailySeries(charges, history = charges) {
    return dailyOperationalRows(charges, history).map(row => ({
      key: row.key, label: row.label, date: iso(row.date), revenue: row.revenue, energy: row.energy,
      sessions: row.count, clients: row.clientCount, newClients: row.newClientCount, failures: row.failed
    }));
  }

  function dailyResult(days) {
    const withMovement = days.filter(d => d.sessions > 0 || d.failures > 0);
    const last = withMovement.at(-1) || null;
    if (!last) return { hasData: false };
    const index = days.findIndex(d => d.key === last.key);
    const previous = index > 0 ? days[index - 1] : null;
    return { hasData: true, day: last, previous };
  }

  // Saude operacional: tentativas, falhas, sessoes curtas/zeradas e motivos.
  function health(charges) {
    const clean = cleanOperationStats(charges);
    const reasons = new Map();
    charges.forEach(charge => {
      const issue = rechargeControlIssue(charge);
      if (!issue) return;
      const label = issue.type === "near_zero" ? "Energia e faturamento próximos de zero" : String(issue.label || "Falha").slice(0, 80);
      reasons.set(label, (reasons.get(label) || 0) + 1);
    });
    return {
      attempts: clean.total, valid: clean.executed.length, failed: clean.failed.length, shortOrZero: clean.shortOrZero.length,
      validPct: clean.validPct, avgPower: clean.avgPower,
      reasons: [...reasons.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8)
    };
  }

  // ---------------------------------------------------------------------
  // Unidades: todas as estacoes (inclusive fora da operacao UBY), por periodo.
  // ---------------------------------------------------------------------
  function stations(monthKey) {
    const unitData = getGeneralUnitData();
    const rows = getGeneralStationRows(monthKey ? filterGeneralUnitDataByMonth(unitData, monthKey, true) : unitData);
    const monthKeys = monthKey ? [monthKey] : [...new Set(getAllGeneralCharges(unitData).map(chargeMonthKey).filter(k => k !== "unknown"))].sort();
    const uby = getUbyChargerRows(unitData);
    return rows.map(row => {
      const occ = stationOccupancyForMonths(row, monthKeys, "mtd");
      const clean = cleanOperationStats(row.charges || []);
      const match = uby.find(u => String(u.workId) === String(row.workId) && normalizeStationForCompare(u.station) === normalizeStationForCompare(row.stationName));
      const kinds = [...new Set((row.charges || []).map(chargerKind))];
      return {
        workId: row.workId, workName: row.workName, station: row.stationName, revenue: row.revenue, energy: row.energy,
        sessions: row.count, clients: row.clients, avgTicket: row.avgTicket, occupancy: occ.pct, power: occ.power,
        hours: occ.hours, band: occupationBand(occ.pct).label, bandClass: occupationBand(occ.pct).className,
        valid: clean.executed.length, failures: clean.failed.length, availability: clean.total ? clean.executed.length / clean.total * 100 : 0,
        kind: match?.kind || (kinds.includes("dc") ? "dc" : kinds[0] || "unknown"), included: match ? !!match.included : false,
        model: match ? normalizeOperationModel(financeSettingsForUbyRow(match, monthKey || "").operationModel) : "",
        lastDate: iso(row.lastDate), files: (row.files || []).length
      };
    });
  }

  function stationDetail(workId, stationName, monthKey) {
    const unitData = getGeneralUnitData();
    const scoped = monthKey ? filterGeneralUnitDataByMonth(unitData, monthKey, true) : unitData;
    const row = getGeneralStationRows(scoped).find(r => String(r.workId) === String(workId) && normalizeStationForCompare(r.stationName) === normalizeStationForCompare(stationName));
    if (!row) return null;
    const history = getGeneralStationRows(unitData).find(r => String(r.workId) === String(workId) && normalizeStationForCompare(r.stationName) === normalizeStationForCompare(stationName));
    const charges = row.charges || [];
    const metrics = summaryMetrics(charges);
    const monthKeys = monthKey ? [monthKey] : [...new Set((history?.charges || []).map(chargeMonthKey).filter(k => k !== "unknown"))].sort();
    const occ = stationOccupancyForMonths(row, monthKeys, "mtd");
    const config = stationAvailabilityFor(row.workId, row.stationName, row.workName);
    const connectors = dcConnectorGroups(charges).map(g => ({ label: g.label, sessions: g.charges?.length || g.count || 0,
      energy: g.energy ?? sumBy(g.charges || [], c => c.energyKWh), revenue: g.revenue ?? sumBy(g.charges || [], c => c.revenue),
      failures: (g.charges || []).filter(isFailedCharge).length }));
    const histMonths = [...new Set((history?.charges || []).map(chargeMonthKey).filter(k => k !== "unknown"))].sort();
    return {
      workId: row.workId, workName: row.workName, station: row.stationName, power: occ.power, schedule: stationScheduleLabel(config),
      occupancy: occ.pct, hours: occ.hours, band: occupationBand(occ.pct).label,
      metrics: { revenue: metrics.revenue, energy: metrics.energy, sessions: metrics.count, clients: metrics.clients, avgTicket: metrics.avgTicket,
        revenuePerKwh: metrics.revenuePerKwh, avgKwh: metrics.avgKwh, avgDuration: formatRechargeDuration(metrics.avgDuration),
        idleValue: metrics.idleValue, failed: metrics.failedCount, valid: metrics.clean.executed.length, shortOrZero: metrics.clean.shortOrZero.length },
      connectors, days: dailySeries(charges, history?.charges || charges), health: health(charges),
      monthly: histMonths.map(mk => { const c = (history?.charges || []).filter(ch => chargeMonthKey(ch) === mk); return { key: mk, label: monthLabel(mk), revenue: sumBy(c, x => x.revenue), energy: sumBy(c, x => x.energyKWh), sessions: c.length }; }),
      sessions: charges.slice().sort((a, b) => (b.startDate || 0) - (a.startDate || 0)).map(sessionRow)
    };
  }

  function sessionRow(charge) {
    const issue = rechargeControlIssue(charge);
    return {
      id: charge.id, start: iso(charge.startDate), station: charge.station, connector: charge.connType, duration: charge.duration,
      energy: Number(charge.energyKWh || 0), revenue: Number(charge.revenue || 0), idleValue: Number(charge.idleValue || 0),
      client: clientDisplayName(charge), payment: charge.paymentType || "", status: charge.rawStatus || charge.paymentStatus || "",
      valid: isExecutedCharge(charge), issue: issue ? issue.label : "", courtesy: typeof isCourtesyCharge === "function" ? isCourtesyCharge(charge) : false,
      vehicle: [charge.vehicleBrand, charge.vehicleModel].filter(Boolean).join(" "), file: charge._file || ""
    };
  }

  // ---------------------------------------------------------------------
  // Obras (cadastro na nuvem) para o resumo executivo.
  // ---------------------------------------------------------------------
  function works() {
    return (cloudRechargeWorks || []).map(work => ({
      id: work.id, nome: work.nome, cliente: work.cliente, local: work.local, status: work.statusExec || work.status || "",
      progresso: Number(work.pct || 0), potencia: Number(work.kw || 0), carregadores: work.carregadores || "", criticas: Number(work.crit || 0),
      updatedAt: work.updatedAt || ""
    }));
  }

  // ---------------------------------------------------------------------
  // Financeiro — mesmas funções de financeiro.html (renderUbyFinancialOverview,
  // renderNetworkDre, networkInvestorDistributionModel, renderMatrizCosts e
  // renderScheduledPayments), sem o HTML.
  // monthKey: 'YYYY-MM' ou '' para acumulado.
  // ---------------------------------------------------------------------
  const FINANCE_FIELDS = ["revenue", "extraRevenue", "marketingRevenue", "totalRevenue", "energy", "commercialEnergy", "courtesyCharges", "courtesyEnergy",
    "courtesyEnergyCost", "courtesyCostExcluded", "energyCost", "extraCosts", "taxes", "matrizCost", "matrizTaxCost", "areaParticipation", "management",
    "platform", "ubyRoyalty", "totalOperatingCost", "operationNet", "plannedTotalCost", "planningKWh", "ubyNet", "saRetention", "investorDistribution", "ubyRetained"];

  function financeContext() {
    const unitData = getGeneralUnitData();
    const ubyRows = getUbyChargerRows(unitData);
    const includedRows = ubyRows.filter(row => row.included);
    const sourceMonths = [...new Set(includedRows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(k => k !== "unknown"))].sort();
    return { unitData, ubyRows, includedRows, sourceMonths };
  }

  function financeMonths() { return financeContext().sourceMonths; }

  function financeLegacy(monthKey) {
    const { includedRows, sourceMonths } = financeContext();
    const isMonthView = !!monthKey && sourceMonths.includes(monthKey);
    const mk = isMonthView ? monthKey : "";
    const rows = includedRows.map(row => aggregateUbyFinanceRow(row, sourceMonths, isMonthView, mk))
      .sort((a, b) => Number(b.finance.operationNet || 0) - Number(a.finance.operationNet || 0));
    const isPartner = row => normalizeOperationModel(row.finance?.operationModel) === "third_party_management";
    const partnerRows = rows.filter(isPartner);
    const ownRows = rows.filter(row => !isPartner(row));
    const total = Object.fromEntries(FINANCE_FIELDS.map(f => [f, sumBy(ownRows, row => row.finance?.[f])]));
    const partnerRoyalty = sumBy(partnerRows, row => row.finance?.ubyRoyalty);
    const totalCostPerKWh = total.commercialEnergy > 0 ? total.totalOperatingCost / total.commercialEnergy : null;
    const plannedCostPerKWh = total.planningKWh > 0 ? total.plannedTotalCost / total.planningKWh : null;
    const margin = total.totalRevenue > 0 ? total.operationNet / total.totalRevenue * 100 : 0;

    // Distribuição UBY (renderUbyDistribution): sem destinação enquanto houver prejuízo.
    const ubyNet = Number(total.ubyNet || 0);
    const profit = ubyNet > 0;
    const saRet = profit ? Math.max(0, Number(total.saRetention || 0)) : 0;
    const investor = profit ? Math.max(0, Number(total.investorDistribution || 0)) : 0;
    const distribution = { ubyNet, hasProfit: profit, saRetention: saRet, investors: investor, retained: profit ? Math.max(0, Number(total.ubyRetained || 0)) : 0,
      quotaPct: (ubyNet - saRet) > 0 ? investor / (ubyNet - saRet) * 100 : 0 };

    // DRE consolidada (renderNetworkDre).
    const dreRows = includedRows.map(row => aggregateUbyFinanceRow(row, sourceMonths, isMonthView, mk));
    const ownedDre = dreRows.filter(row => ["uby", "hybrid"].includes(normalizeOperationModel(row.finance?.operationModel)));
    const partnerDre = dreRows.filter(isPartner);
    const dreFields = ["revenue", "extraRevenue", "marketingRevenue", "energyCost", "extraCosts", "matrizCost", "matrizTaxCost", "taxes", "areaParticipation", "management", "platform", "operationNet", "ubyRoyalty"];
    const owned = networkFinanceSum(ownedDre, dreFields);
    const partners = networkFinanceSum(partnerDre, dreFields);
    const policy = loadNetworkDistribution();
    const royalties = Number(partners.ubyRoyalty || 0);
    const operationalResult = Number(owned.operationNet || 0);
    const networkResult = operationalResult + royalties;
    const positive = Math.max(networkResult, 0);
    const legalReserve = positive * Number(policy.legalReservePct || 0) / 100;
    const expansionReserve = positive * Number(policy.expansionReservePct || 0) / 100;
    const investorPool = (positive - legalReserve - expansionReserve) * Number(policy.investorPct || 0) / 100;
    const soldQuotas = Math.min(Number(policy.soldQuotas || 0), Number(policy.totalQuotas || 1));
    const networkRevenue = Number(owned.revenue || 0) + Number(owned.extraRevenue || 0) + Number(owned.marketingRevenue || 0);
    const dre = {
      ownedCount: ownedDre.length, partnerCount: partnerDre.length,
      rechargeRevenue: Number(owned.revenue || 0), extraRevenue: Number(owned.extraRevenue || 0), royalties, marketing: Number(owned.marketingRevenue || 0),
      networkRevenue, energyCost: Number(owned.energyCost || 0),
      directOperation: Math.max(0, Number(owned.extraCosts || 0) - Number(owned.matrizCost || 0)),
      taxes: Number(owned.taxes || 0), matrizTaxCost: Number(owned.matrizTaxCost || 0),
      otherMatriz: Math.max(0, Number(owned.matrizCost || 0) - Number(owned.matrizTaxCost || 0)), matrizCost: Number(owned.matrizCost || 0),
      management: Number(owned.management || 0), platform: Number(owned.platform || 0), areaParticipation: Number(owned.areaParticipation || 0),
      operationalResult, networkResult, margin: networkRevenue ? networkResult / networkRevenue * 100 : 0,
      legalReserve, expansionReserve, reserve: legalReserve + expansionReserve, investorPool, soldQuotas, perQuota: soldQuotas > 0 ? investorPool / soldQuotas : 0,
      policy: { roundLabel: policy.roundLabel, totalQuotas: Number(policy.totalQuotas || 0), soldQuotas, investorPct: Number(policy.investorPct || 0),
        legalReservePct: Number(policy.legalReservePct || 0), expansionReservePct: Number(policy.expansionReservePct || 0) }
    };

    const monthly = buildUbyMonthlySeries(ownRows, sourceMonths).map(m => ({ key: m.mk, label: m.label, revenue: m.revenue, cost: m.totalOperatingCost,
      result: m.operationNet, matrizCost: m.matrizCost, energy: m.energy, costPerKWh: m.commercialEnergy > 0 ? m.totalOperatingCost / m.commercialEnergy : null }));

    return {
      period: { monthKey: mk, label: isMonthView ? monthLabel(mk) : "Acumulado", months: sourceMonths },
      total: { ...total, totalCostPerKWh, plannedCostPerKWh, margin, partnerRoyalty, partnerCount: partnerRows.length },
      composition: [
        { label: "Energia", value: total.energyCost, detail: "faturas de energia vinculadas às recargas" },
        { label: "Gestão e plataforma", value: total.management + total.platform, detail: "gestão P3 e tecnologia da operação" },
        { label: "Operação por carregador", value: Math.max(total.extraCosts - total.matrizCost, 0), detail: "despesas próprias dos ativos, sem matriz" },
        { label: "Custos da matriz rateados", value: total.matrizCost, detail: "custos compartilhados distribuídos aos destinos" }
      ],
      distribution, dre, monthly,
      rows: rows.map(row => {
        const f = row.finance;
        return {
          workId: row.workId, workName: row.workName, station: row.stationName || row.station, kind: row.kind, partner: isPartner(row),
          model: normalizeOperationModel(f.operationModel), modelLabel: operationModelLabel(f.operationModel), months: row.financeMonths.length,
          revenue: f.revenue, extraRevenue: f.extraRevenue, marketingRevenue: f.marketingRevenue, totalRevenue: f.totalRevenue, energy: f.energy,
          energyCost: f.energyCost, extraCosts: f.extraCosts, matrizCost: f.matrizCost, taxes: f.taxes, management: f.management, platform: f.platform,
          areaParticipation: f.areaParticipation, ubyRoyalty: f.ubyRoyalty, totalOperatingCost: f.totalOperatingCost, operationNet: f.operationNet,
          operationMargin: f.operationMargin, totalCostPerKWh: f.totalCostPerKWh, resultPerKWh: f.resultPerKWh,
          courtesyCharges: f.courtesyCharges, courtesyEnergy: f.courtesyEnergy, courtesyCostExcluded: f.courtesyCostExcluded
        };
      })
    };
  }

  function investorDistributionLegacy() {
    const d = networkInvestorDistributionModel();
    return {
      valid: d.valid, totalAllocated: d.totalAllocated, totalPool: d.totalPool,
      months: d.months.map(m => ({ key: m.monthKey, label: monthLabel(m.monthKey), result: m.result, legalReserve: m.legalReserve, expansionReserve: m.expansionReserve,
        investorPool: m.investorPool, eligibleQuotas: m.eligibleQuotas, perQuota: m.valuePerQuota, status: m.payment?.status || "pendente" })),
      quotaValue: Number(loadNetworkDistribution().quotaValue) || 80000, distributionStartMonth: loadNetworkDistribution().distributionStartMonth || "2026-06",
      investors: d.investors.map(i => ({ name: i.name, quotas: i.quotas, eligibleFrom: i.eligibleFrom, status: i.status, allocations: i.allocations, due: i.due,
        quotaValue: Number(i.quotaValue) || Number(loadNetworkDistribution().quotaValue) || 80000,
        investment: i.investment, returnRate: i.returnRate, annualized: i.annualized, paybackYears: i.paybackYears }))
    };
  }

  // Custos centrais da matriz e rateio (renderMatrizCosts + renderMatrizMonthlyDre).
  function matrix(monthKey) {
    const { unitData, includedRows } = financeContext();
    const mk = monthKey || months().at(-1) || "";
    const rows = matrizEligibleRows(unitData, mk);
    const costs = loadMatrizCosts().filter(item => !item.scheduledPayment);
    const allocFor = row => matrizCostItemsForRow(row, mk, unitData);
    const rowAllocations = rows.map(row => ({ row, items: allocFor(row) }));
    const planned = costs.filter(item => matrizApplies(item, mk)).reduce((s, item) => s + matrizCompetencyAmount(item), 0);
    const allocated = rowAllocations.reduce((s, r) => s + sumBy(r.items, i => i.amount), 0);
    const centralTaxes = costs.filter(item => matrizApplies(item, mk) && /tribut|impost|taxa/i.test(`${item.category || ""} ${item.name || ""}`))
      .reduce((s, item) => s + matrizCompetencyAmount(item), 0);

    const list = costs.map(item => {
      const parcel = matrizMonthOffset(item.startMonth, mk) + 1;
      const activeTargets = (item.targets || []).filter(t => !t.startMonth || t.startMonth <= mk);
      const byUnit = rowAllocations.map(r => { const a = r.items.find(c => c.id === item.id); return a ? { name: r.row.station || r.row.workName, amount: Number(a.amount || 0), cash: Number(a.cashAmount || 0) } : null; }).filter(Boolean);
      return {
        id: item.id, name: item.name, category: item.category, supplier: item.supplier || "", documentRef: item.documentRef || "", enabled: !!item.enabled,
        kind: item.costKind, kindLabel: item.costKind === "installment" ? `parcela ${Math.max(1, parcel)} de ${item.installments} · cobertura ${matrizCoverageMonths(item)} mês(es)` : item.costKind === "one_off" ? "lançamento único" : "recorrente mensal",
        startMonth: item.startMonth ? monthLabel(item.startMonth) : "—", dueDay: item.dueDay, method: matrizMethodLabel(item.allocation),
        targets: activeTargets.map(t => matrizResolveTargetRow(t, rows)?.station || t.station || "").filter(Boolean),
        applies: matrizApplies(item, mk), competency: matrizCompetencyAmount(item), cash: matrizCashAmount(item, mk),
        allocated: sumBy(byUnit, a => a.amount), byUnit
      };
    });

    // Série mensal da matriz: histórico + 12 competências à frente.
    const chargeMonths = includedRows.flatMap(row => (row.charges || []).map(chargeMonthKey)).filter(k => k !== "unknown");
    const starts = costs.map(item => item.startMonth).filter(k => /^\d{4}-\d{2}$/.test(k));
    const coverageEnds = costs.filter(item => item.costKind === "installment" && item.startMonth).map(item => matrizAddMonths(item.startMonth, matrizCoverageMonths(item) - 1));
    const candidates = [...new Set([...chargeMonths, ...starts, ...coverageEnds, mk].filter(k => /^\d{4}-\d{2}$/.test(k)))].sort();
    let series = [];
    if (candidates.length) {
      const horizonEnd = [candidates.at(-1), matrizAddMonths(mk, 11)].sort().at(-1);
      series = matrizMonthSequence(candidates[0], horizonEnd).map(m => {
        const competency = costs.filter(item => matrizApplies(item, m)).reduce((s, item) => s + matrizCompetencyAmount(item), 0);
        const cash = costs.reduce((s, item) => s + matrizCashAmount(item, m), 0);
        const alloc = includedRows.reduce((s, row) => s + sumBy(matrizCostItemsForRow(row, m), i => i.amount), 0);
        return { key: m, label: monthLabel(m), competency, cash, allocated: alloc, pending: Math.max(competency - alloc, 0) };
      });
    }
    return {
      monthKey: mk, label: mk ? monthLabel(mk) : "—",
      summary: { active: costs.filter(item => matrizApplies(item, mk)).length, planned, allocated, centralTaxes, pending: Math.max(planned - allocated, 0) },
      destinations: rows.map(row => row.station || row.workName), costs: list, series
    };
  }

  // Agenda de pagamentos (renderScheduledPayments).
  function payments(monthKeyValue) {
    const mk = monthKeyValue || monthKey(new Date());
    const list = loadMatrizCosts().filter(item => scheduledPaymentApplies(item, mk))
      .sort((a, b) => scheduledPaymentDueDate(a, mk) - scheduledPaymentDueDate(b, mk))
      .map(item => {
        const target = scheduledPaymentTarget(item);
        const status = scheduledPaymentStatus(item, mk);
        const amount = item.scheduledPayment ? Number(item.amount || 0) : matrizCashAmount(item, mk);
        return { id: item.id, name: item.name, category: item.category, supplier: item.supplier || "", source: item.scheduledPayment ? "Pagamento programado" : "Custo da matriz",
          station: target.station || "Carregador não identificado", workName: target.workName || (target.targetCount > 1 ? `rateado para ${target.targetCount} carregadores` : ""),
          due: iso(scheduledPaymentDueDate(item, mk)), dueDay: item.dueDay, amount, status: status.key, statusLabel: status.label,
          paidAt: item.paymentLedger?.[mk]?.paidAt || "" };
      });
    const totals = list.reduce((acc, p) => { acc.total += p.amount; if (p.status === "paid") acc.paid += p.amount; else acc.pending += p.amount; if (p.status === "overdue") acc.overdue += p.amount; return acc; }, { total: 0, paid: 0, pending: 0, overdue: 0 });
    return { monthKey: mk, label: monthLabel(mk), list, totals };
  }

  async function financeDocuments(monthKeyValue) {
    if (!window.UBY_SUPABASE?.loadFinanceDocuments) return [];
    const rows = await window.UBY_SUPABASE.loadFinanceDocuments({ scope: "matrix", competenceKey: monthKeyValue, limit: 200 });
    return JSON.parse(JSON.stringify(rows || []));
  }

  async function openFinanceDocument(id) {
    return window.UBY_SUPABASE?.openFinanceDocument?.(id);
  }

  // ---------------------------------------------------------------------
  // Clientes — cadastro oficial (recharge_customers), inteligência calculada
  // sobre as sessões da operação UBY e Clube UBY.
  // ---------------------------------------------------------------------
  async function customerRegistry() {
    // Leitura direta: não usa loadCustomerRegistry(), que tenta sincronizar a
    // cópia local de volta para a nuvem.
    const official = await readCustomerRegistryCloud();
    if (!official) return { rows: [], total: 0 };
    return JSON.parse(JSON.stringify({ rows: customerRegistryRowsFromCloud(official.rows), total: official.total,
      updatedAt: official.rows.reduce((max, r) => (r.updated_at || "") > max ? r.updated_at : max, "") }));
  }

  function clientIntelligence(monthKey) {
    // Mesmos conjuntos do painel Operação UBY: sourceUbyCharges (histórico) e
    // allUbyCharges (período, via summarizeUbyChargerRow).
    const unitData = getGeneralUnitData();
    const sourceIncluded = getUbyChargerRows(unitData).filter(row => row.included);
    const history = sourceIncluded.flatMap(row => row.charges);
    const monthKeys = [...new Set(history.map(chargeMonthKey).filter(k => k !== "unknown"))].filter(isPlausibleMonthKey).sort();
    const mk = monthKey === "" ? "" : (monthKeys.includes(monthKey) ? monthKey : monthKeys.at(-1) || "");
    const period = sourceIncluded
      .map(row => summarizeUbyChargerRow(row, mk ? row.charges.filter(c => chargeMonthKey(c) === mk) : row.charges))
      .filter(row => row.count > 0)
      // Mesma ordem do painel original (included.sort por faturamento): o
      // newClientInsights usa a primeira sessão encontrada de cada cliente.
      .sort((a, b) => b.revenue - a.revenue)
      .flatMap(row => row.charges);
    const valid = period.filter(isExecutedCharge);
    const networkHistory = networkHistoryCharges(history);

    // Novos clientes (renderNewClients).
    const insight = newClientInsights(period, history, networkHistory);
    const newRows = [
      ...insight.newNetwork.map(row => ({ ...row, type: "network" })),
      ...insight.newStationExisting.map(row => ({ ...row, type: "station" }))
    ].map(row => ({ type: row.type, name: row.name, phone: row.phone || "", firstDate: iso(row.firstDate),
      startedAt: abbreviatedStationLabel(row.startedAt), stations: (row.allStations || []).map(abbreviatedStationLabel),
      previous: (row.previousStations || []).map(abbreviatedStationLabel) }));

    // Ranking do período (renderClientsTable) com recorrência.
    const byUser = {};
    period.forEach(c => {
      const name = c.userName || c.userEmail || "Cliente sem nome";
      const key = clientKeyFromCharge(c) || clientIdentityKey(name);
      if (!byUser[key]) byUser[key] = { key, name, email: c.userEmail || "", phone: c.userPhone || "", sessions: 0, valid: 0, energy: 0, revenue: 0, last: null, stations: new Set() };
      const u = byUser[key];
      u.sessions += 1; if (isExecutedCharge(c)) u.valid += 1;
      u.energy += Number(c.energyKWh || 0); u.revenue += Number(c.revenue || 0);
      if (c.startDate && (!u.last || c.startDate > u.last)) u.last = c.startDate;
      if (c.station) u.stations.add(abbreviatedStationLabel(canonicalStationNameForWork(c.workId, c.station, c.workName)));
      if (!u.phone && c.userPhone) u.phone = c.userPhone;
    });
    const historyCount = {};
    history.filter(isExecutedCharge).forEach(c => { const k = clientKeyFromCharge(c); if (k) historyCount[k] = (historyCount[k] || 0) + 1; });
    const totalRevenue = Object.values(byUser).reduce((s, u) => s + u.revenue, 0);
    const ranking = Object.values(byUser).sort((a, b) => b.revenue - a.revenue).map(u => ({
      name: u.name, email: u.email, phone: u.phone, sessions: u.sessions, valid: u.valid, energy: u.energy, revenue: u.revenue,
      share: totalRevenue ? u.revenue / totalRevenue * 100 : 0, perKwh: u.energy ? u.revenue / u.energy : 0, last: iso(u.last),
      stations: [...u.stations], historySessions: historyCount[u.key] || 0
    }));

    const recurrence = clientRecurrenceStats(history.filter(isExecutedCharge));
    const periodRecurrence = clientRecurrenceStats(valid);
    // Regra oficial: só planilhas Spott (evita falso ausente por cadastro duplicado
    // na Move). A lista ampliada usa todas as plataformas e fica sinalizada.
    const spottHistory = history.filter(isSpottRecharge);
    const officialList = recurringAbsentClients(spottHistory, 7, 2);
    const absentOfficial = officialList.length;
    const officialKeys = new Set(officialList.map(a => a.key));
    const absent = recurringAbsentClients(history, 7, 2).map(a => ({ official: officialKeys.has(a.key), name: a.name, email: a.email, station: abbreviatedStationLabel(a.station),
      sessions: a.count, energy: a.energy, revenue: a.revenue, lastDate: iso(a.lastDate), daysAbsent: a.daysAbsent, avgTicket: a.avgTicket, avgKwh: a.avgKwh }));
    const cohorts = monthlyClientCohorts(history).map(c => ({ key: c.key, label: monthLabel(c.key), newClients: c.newClients, recurring: c.recurring,
      rate: c.newClients ? c.recurring / c.newClients * 100 : 0, firstRevenue: c.firstRevenue }));

    // Leituras automáticas (renderNetworkIntelligence).
    const rows = continuousOperationalRows(period, history, 14);
    const seven = rangeRevenue(rows, 7, 0), previous = rangeRevenue(rows, 7, 7);
    const hasPrevWeek = previous.count > 0 || previous.revenue > 0;
    const latest = rows.at(-1);
    const spottAbsent = recurringAbsentClients(history.filter(isSpottRecharge), 7, 2).length;
    const failures7 = recentCharges(period, 7).charges.filter(isFailedCharge).length;

    return {
      period: { monthKey: mk, label: mk ? monthLabel(mk) : "Acumulado", months: monthKeys },
      summary: { clients: new Set(valid.map(clientKeyFromCharge).filter(Boolean)).size, sessions: valid.length, revenue: sumBy(valid, c => c.revenue),
        newNetwork: insight.newNetwork.length, newStation: insight.newStationExisting.length, multiStation: insight.multiStation,
        withPhone: newRows.filter(r => r.phone).length, recurrence, periodRecurrence, absent: absent.length,
        absentRevenue: sumBy(absent, a => a.revenue), absentOfficial, spottSessions: spottHistory.length, historySessions: history.length },
      signals: {
        latest: latest ? { label: latest.label, revenue: latest.revenue, growthPct: latest.growthPct } : null,
        seven: seven.revenue, previous: previous.revenue, hasPrevWeek, growth: hasPrevWeek ? pctChange(seven.revenue, previous.revenue) : 0,
        spottAbsent, failures7
      },
      newClients: newRows, ranking, absent, cohorts
    };
  }

  function club(monthKey) {
    try { ensureClubParticipantsAutoSync(); } catch (_) {}
    const unitData = getGeneralUnitData();
    const charges = getUbyOperationCharges(unitData).filter(c => Number(c.revenue || 0) > 0);
    const monthsList = clubCompetitionMonths(charges);
    const mk = monthsList.includes(monthKey) ? monthKey : monthsList.at(-1) || "";
    const monthCharges = mk ? charges.filter(c => chargeMonthKey(c) === mk) : [];
    const participants = clubParticipantsStore().rows;
    const accumulated = enrichClubClientRows(clubClientRows(charges), participants);
    const accByKey = new Map();
    accumulated.forEach(row => clubParticipantKeys(row).forEach(key => accByKey.set(key, row)));
    const rows = enrichClubClientRows(clubClientRows(monthCharges), participants).map((row, index) => {
      const acc = clubParticipantKeys(row).map(key => accByKey.get(key)).find(Boolean);
      return { position: index + 1, name: row.name, email: row.email, phone: row.phone, points: row.points, revenue: row.revenue, energy: row.energy,
        sessions: row.count, registered: !!row.registered, lastDate: iso(row.lastDate), accumulatedPoints: acc?.points || row.points,
        benefit: clubBenefitForPosition(index + 1) };
    });
    const rankKeys = new Map();
    enrichClubClientRows(clubClientRows(monthCharges), participants).forEach(row => clubParticipantKeys(row).forEach(k => rankKeys.set(k, row)));
    const store = clubParticipantsStore();
    return {
      monthKey: mk, label: mk ? monthLabel(mk) : "—", months: monthsList.map(k => ({ key: k, label: monthLabel(k) })),
      summary: { participants: rows.length, points: sumBy(rows, r => r.points), revenue: sumBy(rows, r => r.revenue),
        withPhone: rows.filter(r => r.phone).length, registered: rows.filter(r => r.registered).length },
      rows,
      form: {
        total: participants.length, updatedAt: store.updatedAt || "", source: store.source || "", endpoint: !!clubFormEndpointUrl(),
        lgpd: participants.filter(p => p.acceptedLgpd).length,
        withVehicle: participants.filter(p => p.vehicleBrand || p.vehicleModel || p.vehiclePlate).length,
        matched: participants.filter(p => clubParticipantKeys(p).some(k => rankKeys.has(k))).length
      },
      notice: clubWinnerNotice(enrichClubClientRows(clubClientRows(monthCharges), participants), mk)
    };
  }

  // ---------------------------------------------------------------------
  // Análise de uso (Geral de recargas + Painel mensal por estação):
  // horários, permanência, dia da semana, cupons, pagamentos, ociosidade,
  // avaliações e diagnóstico técnico. scope: { kind: 'uby'|'all'|'station',
  // workId, station, monthKey ('' = acumulado) }.
  // ---------------------------------------------------------------------
  function usage(scope = {}) {
    const kind = scope.kind || "uby";
    const unitData = getGeneralUnitData();
    let rows = [];
    if (kind === "station") {
      rows = getGeneralStationRows(unitData).filter(r => String(r.workId) === String(scope.workId) && normalizeStationForCompare(r.stationName) === normalizeStationForCompare(scope.station));
    } else if (kind === "all") {
      rows = getGeneralStationRows(unitData).filter(r => (r.charges || []).length);
    } else {
      rows = getUbyChargerRows(unitData).filter(r => r.included).map(r => ({ ...r, stationName: r.station }));
    }
    const history = rows.flatMap(r => r.charges || []);
    const monthList = [...new Set(history.map(chargeMonthKey).filter(k => k !== "unknown"))].filter(isPlausibleMonthKey).sort();
    const mk = scope.monthKey === "" ? "" : (monthList.includes(scope.monthKey) ? scope.monthKey : monthList.at(-1) || "");
    const inMonth = c => !mk || chargeMonthKey(c) === mk;
    const charges = history.filter(inMonth);

    // Janela do período: mesma periodWindow('mtd') de cada estação/mês.
    const windows = [];
    rows.forEach(r => {
      const opStart = operationStartForCharges(r.charges || [], r);
      (mk ? [mk] : monthList).forEach(m => {
        const mc = (r.charges || []).filter(c => chargeMonthKey(c) === m);
        if (mc.length) windows.push(periodWindow(mc, m, "mtd", opStart));
      });
    });
    const bounds = windows.length ? { start: new Date(Math.min(...windows.map(w => w.start))), end: new Date(Math.max(...windows.map(w => w.end))) } : null;
    const power = kind === "station" ? Number(workPowerById(scope.workId) || 0)
      : rows.filter(r => (r.charges || []).some(inMonth)).reduce((s, r) => s + Number(workPowerById(r.workId) || 0), 0);

    // Para uma estação, o painel mensal usa a estação "aberta" (currentWorkId...).
    const saved = { id: currentWorkId, name: currentWorkName, station: currentStationReportName };
    let weekday = [], kpis = null, days = [];
    try {
      if (kind === "station" && rows[0]) {
        currentWorkId = String(rows[0].workId); currentWorkName = rows[0].workName || ""; currentStationReportName = rows[0].stationName || "";
      }
      weekday = weekdayOccupancyRows(charges, power, bounds).map(w => ({ label: w.label, days: w.days, count: w.count, valid: w.validCount, failed: w.failed,
        revenue: w.revenue, energy: w.energy, clients: w.clientCount, occ: w.occ, avgRevenue: w.avgRevenue, avgKwh: w.avgKwh, avgTicket: w.avgTicket }));

      // Ocupação de cada dia do calendário: mesma regra de weekdayOccupancyRows
      // (horas disponíveis do dia recortadas ao período; hoje só as horas já passadas).
      const availability = availabilityForCurrentCharges(charges);
      days = dailySeries(charges, history).map(d => {
        const ref = new Date(d.date);
        if (!bounds || !(power > 0) || Number.isNaN(ref.getTime())) return { ...d, occ: null, occHours: 0 };
        const dayStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
        const start = Math.max(dayStart.getTime(), bounds.start.getTime()), end = Math.min(dayEnd.getTime(), bounds.end.getTime());
        const hours = end > start ? stationAvailableHours(availability, new Date(start), new Date(end)) : 0;
        return { ...d, occ: hours > 0 ? d.energy / (power * hours) * 100 : null, occHours: hours };
      });

      if (kind === "station" && mk && rows[0] && charges.length) {
        // renderKPIs() do painel mensal.
        const row = rows[0];
        const window = periodWindow(charges, mk, "mtd", operationStartForCharges(row.charges, row));
        const inWindow = filterChargesByWindow(charges, window);
        const ctx = { workId: row.workId, workName: row.workName, stationName: row.stationName };
        const occ = occByInterval(inWindow, power, window, ctx);
        const clean = cleanOperationStats(inWindow);
        const durations = clean.executed.map(c => durToHours(c.duration)).filter(h => h > 0);
        const energy = sumBy(inWindow, c => c.energyKWh), rev = sumBy(inWindow, c => c.revenue);
        const days = Math.max(window.hours / 24, 1);
        const dMonth = daysInMonth(mk.split("-")[0], mk.split("-")[1]);
        const calendarDays = Math.max(calendarDayCount(window.start, window.end), 1);
        const cmp = monthlyEquivalentComparison(inWindow, row.charges, window, occ, occ.power);
        const prev = cmp.metrics;
        const prevDays = Math.max(calendarDayCount(cmp.previousStart, cmp.previousEnd), 1);
        kpis = {
          window: { start: iso(window.start), end: iso(window.end), hours: window.hours, live: window.mode === "mtd" && isCurrentMonthKey(mk) },
          occupancy: occ.pct, occEnergy: occ.energy, occPower: occ.power, occHours: occ.hours, prevOccupancy: cmp.occupation,
          comparison: { hasPrevious: cmp.hasPrevious, label: cmp.label },
          revenue: rev, energy, sessions: inWindow.length, clients: new Set(inWindow.map(c => c.userEmail || c.userName)).size,
          avgTicket: inWindow.length ? rev / inWindow.length : 0, revPerKwh: energy > 0 ? rev / energy : 0, avgKwh: clean.avgKwh, validSessions: clean.executed.length,
          avgDuration: durations.length ? durations.reduce((s, h) => s + h, 0) / durations.length : 0, projection: rev * dMonth / Math.max(days, 1),
          projectionEnergy: energy * dMonth / Math.max(days, 1), idleValue: sumBy(inWindow, c => c.idleValue), failed: inWindow.filter(isFailedCharge).length,
          avgRevenueDay: rev / calendarDays, avgSessionsDay: inWindow.length / calendarDays, calendarDays,
          prev: { revenue: prev.revenue, energy: prev.energy, count: prev.count, clients: prev.clients, avgTicket: prev.avgTicket, revenuePerKwh: prev.revenuePerKwh,
            avgKwh: prev.avgKwh, avgDuration: prev.avgDuration, idleValue: prev.idleValue, failedCount: prev.failedCount,
            projection: prev.revenue * dMonth / prevDays, avgRevenueDay: prev.revenue / prevDays, avgSessionsDay: prev.count / prevDays }
        };
      }
    } finally {
      currentWorkId = saved.id; currentWorkName = saved.name; currentStationReportName = saved.station;
    }

    const series = usageSeries(charges);
    const payments = {};
    charges.forEach(c => { const k = c.paymentType || "Não informado"; (payments[k] ||= { label: k, count: 0, revenue: 0 }); payments[k].count++; payments[k].revenue += Number(c.revenue || 0); });
    const idle = charges.map(c => ({ c, min: idleToMin(c.idleTime) })).filter(x => x.min >= 1).sort((a, b) => b.min - a.min)
      .map(({ c, min }) => ({ start: iso(c.startDate), client: clientDisplayName(c), station: abbreviatedStationLabel(c.station), energy: Number(c.energyKWh || 0),
        revenue: Number(c.revenue || 0), idleMin: min, idleValue: Number(c.idleValue || 0) }));
    const rated = charges.map(c => ({ value: parseRatingValue(c.rating), comment: safeText(c.reviewComment).trim(), start: iso(c.startDate), client: clientDisplayName(c) }))
      .filter(x => x.value > 0 || x.comment);
    const onlyRated = rated.filter(x => x.value > 0);
    const powers = charges.filter(c => durToHours(c.duration) > 0).map(c => c.energyKWh / durToHours(c.duration)).sort((a, b) => a - b);
    const totalH = sumBy(charges, c => durToHours(c.duration));

    return {
      scope: { kind, workId: scope.workId || "", station: scope.station || "", monthKey: mk, label: mk ? monthLabel(mk) : "Acumulado", months: monthList,
        power, bounds: bounds ? { start: iso(bounds.start), end: iso(bounds.end) } : null, stations: rows.length },
      totals: { sessions: charges.length, revenue: sumBy(charges, c => c.revenue), energy: sumBy(charges, c => c.energyKWh), idleValue: sumBy(charges, c => c.idleValue),
        acdc: generalAcDcStats(charges) },
      kpis, weekday,
      recent: { labels: series.labels, count: series.count, energy: series.energy, revenue: series.revenue, idleValue: series.idleValue },
      hours: { labels: series.hourLabels, values: series.hourValues },
      stay: { labels: series.stayLabels, values: series.stayValues },
      coupons: series.couponDetails.map(x => ({ coupon: x.coupon, count: x.count, energy: x.energy, revenue: x.revenue, discount: x.discount })),
      payments: Object.values(payments).sort((a, b) => b.count - a.count),
      idle: idle.slice(0, 80), idleCount: idle.length,
      reviews: { avg: onlyRated.length ? onlyRated.reduce((s, x) => s + x.value, 0) / onlyRated.length : 0, rated: onlyRated.length, comments: rated.filter(x => x.comment).length,
        coverage: charges.length ? onlyRated.length / charges.length * 100 : 0,
        dist: [5, 4, 3, 2, 1].map(st => ({ stars: st, count: onlyRated.filter(x => Math.round(x.value) === st).length })),
        latest: rated.filter(x => x.comment).sort((a, b) => String(b.start).localeCompare(String(a.start))).slice(0, 20) },
      tech: { avgPower: totalH > 0 ? sumBy(charges, c => c.energyKWh) / totalH : 0, medPower: powers.length ? powers[Math.floor(powers.length / 2)] : 0,
        maxPower: powers.length ? Math.max(...powers) : 0, equivHours: power > 0 ? sumBy(charges, c => c.energyKWh) / power : 0,
        revPerHour: totalH > 0 ? sumBy(charges, c => c.revenue) / totalH : 0, connectedHours: totalH },
      days
    };
  }

  // ---------------------------------------------------------------------
  // Financeiro por estação — mesmo cálculo de aggregateUbyFinanceRow(), mês a
  // mês, com o detalhe completo do financeForCharges() do mês escolhido.
  // ---------------------------------------------------------------------
  function financeStations() {
    return getUbyChargerRows(getGeneralUnitData()).filter(r => (r.charges || []).length).map(r => ({
      workId: r.workId, workName: r.workName, station: r.station, kind: r.kind, included: r.included,
      model: normalizeOperationModel(financeSettingsForUbyRow(r, months().at(-1) || "").operationModel)
    }));
  }

  function financeForRowMonth(row, mk) {
    const monthCharges = (row.charges || []).filter(c => chargeMonthKey(c) === mk);
    const settings = financeSettingsForUbyRow(row, mk);
    const matrizCostItems = matrizCostItemsForRow(row, mk);
    const result = financeForCharges(monthCharges, settings, { monthKey: mk, historyCharges: row.charges || [], power: workPowerById(row.workId), matrizCostItems,
      workId: row.workId, workName: row.workName, stationName: row.stationName || row.station,
      courtesyConfig: stationAvailabilityFor(row.workId, row.stationName || row.station, row.workName) });
    return { result, settings, matrizCostItems };
  }

  const pickFinance = r => ({
    model: r.operationModel, revenue: r.revenue, extraRevenue: r.extraRevenue, marketingRevenue: r.marketingRevenue, totalRevenue: r.totalRevenue,
    energy: r.energy, commercialEnergy: r.commercialEnergy, energyCost: r.energyCost, energyRate: r.energyRate, taxes: r.taxes, taxRatePct: r.taxRatePct,
    localExtraCosts: r.localExtraCosts, matrizCost: r.matrizCost, matrizTaxCost: r.matrizTaxCost, matrizCash: r.matrizCash, management: r.management,
    platform: r.platform, ubyRoyalty: r.ubyRoyalty, areaParticipation: r.areaParticipation, areaSharePct: r.areaSharePct, totalOperatingCost: r.totalOperatingCost,
    operationNet: r.operationNet, operationMargin: r.operationMargin, totalCostPerKWh: r.totalCostPerKWh, directCostPerKWh: r.directCostPerKWh,
    resultPerKWh: r.resultPerKWh, contributionPerKWh: r.contributionPerKWh, breakEvenKWh: r.breakEvenKWh, variableCostPerKWh: r.variableCostPerKWh,
    plannedTotalCost: r.plannedTotalCost, plannedTotalCostPerKWh: r.plannedTotalCostPerKWh, ubyNet: r.ubyNet, p3OperationalResult: r.p3OperationalResult,
    p3SocietyProfit: r.p3SocietyProfit, partnerShare: r.partnerShare, saRetention: r.saRetention, investorDistribution: r.investorDistribution,
    partnerInvestorDistribution: r.partnerInvestorDistribution, ubyRetained: r.ubyRetained, investmentValue: r.investmentValue,
    paybackInvestmentValue: r.paybackInvestmentValue, paybackBase: r.paybackBase, paybackMonths: r.paybackMonths, roiMonthly: r.roiMonthly,
    courtesyCharges: r.courtesyCharges, courtesyEnergy: r.courtesyEnergy, courtesyCostExcluded: r.courtesyCostExcluded
  });

  function stationFinanceLegacy(workId, station, monthKey) {
    const row = getUbyChargerRows(getGeneralUnitData()).find(r => String(r.workId) === String(workId) && normalizeStationForCompare(r.station) === normalizeStationForCompare(station));
    if (!row) return null;
    const rowMonths = [...new Set((row.charges || []).map(chargeMonthKey).filter(k => k !== "unknown"))].filter(isPlausibleMonthKey).sort();
    const mk = rowMonths.includes(monthKey) ? monthKey : rowMonths.at(-1) || "";
    const monthly = rowMonths.map(m => { const { result } = financeForRowMonth(row, m); return { key: m, label: monthLabel(m), ...pickFinance(result) }; });
    const detail = mk ? financeForRowMonth(row, mk) : null;
    const r = detail?.result;
    const cfg = detail ? { ...defaultFinanceSettings(), ...detail.settings } : {};
    return {
      workId: row.workId, workName: row.workName, station: row.station, kind: row.kind, included: row.included, monthKey: mk, label: mk ? monthLabel(mk) : "—",
      months: rowMonths.map(m => ({ key: m, label: monthLabel(m) })), modelLabel: r ? operationModelLabel(r.operationModel) : "",
      finance: r ? pickFinance(r) : null,
      settings: detail ? { managementPct: Number(cfg.managementPct || 0), platformPct: Number(cfg.platformPct || 0), taxRatePct: Number(cfg.taxRatePct || 0),
        ubyRoyaltyPct: Number(cfg.ubyRoyaltyPct || 0), energyCostPerKWh: Number(cfg.energyCostPerKWh || 0), investmentValue: Number(cfg.investmentValue || 0),
        saRetentionPct: Number(cfg.saRetentionPct || 0), investorQuotaPct: Number(cfg.investorQuotaPct || 0), p3SocietyPct: Number(cfg.p3SocietyPct || 0),
        energyBillingMode: cfg.energyBillingMode || "" } : null,
      energyComposition: r?.energyComposition ? JSON.parse(JSON.stringify(r.energyComposition)) : null,
      costLines: r ? r.costRuleDetails.filter(d => d.enabled !== false && (Number(d.actual || 0) || Number(d.planned || 0))).map(d => ({ label: d.label, rule: d.displayRule || "",
        actual: Number(d.actual || 0), planned: Number(d.planned || 0), perKWh: d.actualPerKWh, matrix: !!d.isMatrix })) : [],
      revenueLines: r ? r.revenueRuleDetails.filter(d => d.enabled !== false && (Number(d.actual || 0) || Number(d.planned || 0))).map(d => ({ label: d.label, rule: d.displayRule || "",
        actual: Number(d.actual || 0), planned: Number(d.planned || 0), scope: d.scope || "" })) : [],
      planning: r?.planning ? { planningKWh: r.planning.planningKWh, planningRevenue: r.planning.planningRevenue, salePricePerKWh: r.planning.salePricePerKWh,
        targetOccPct: r.planning.targetOccPct, realOccPct: r.planning.realOccPct } : null,
      monthly
    };
  }

  // Destinos do resultado (renderGeneralFinance + renderGeneralFinanceOverview).
  function destinationsLegacy() {
    const unitData = getGeneralUnitData();
    const active = unitData.filter(u => Array.isArray(u.charges) && u.charges.length && (Number(u.count) > 0 || Number(u.energy) > 0 || Number(u.revenue) > 0));
    const rows = generalFinanceByUnit(active).sort((a, b) => {
      const d = financeUnitOutcome(b.finance).value - financeUnitOutcome(a.finance).value;
      return Math.abs(d) > 0.009 ? d : (Number(b.finance?.revenue) || 0) - (Number(a.finance?.revenue) || 0);
    });
    // Mesma soma do renderGeneralFinance(); aplicada à rede toda e, separadamente,
    // só aos ativos da UBY (próprios, híbridos e parceiros com royalty).
    const sumRows = list => {
      const t = list.reduce((acc, row) => { Object.entries(row.finance || {}).forEach(([k, v]) => { if (!["margin", "paybackMonths", "roiMonthly"].includes(k) && Number.isFinite(v)) acc[k] = (acc[k] || 0) + v; }); return acc; }, {});
      t.margin = t.revenue ? t.ownResult / t.revenue * 100 : 0;
      t.paybackMonths = t.paybackInvestmentValue > 0 && t.paybackBase > 0 ? t.paybackInvestmentValue / t.paybackBase : 0;
      t.roiMonthly = t.paybackInvestmentValue > 0 ? t.paybackBase / t.paybackInvestmentValue * 100 : 0;
      return t;
    };
    const m = row => normalizeOperationModel(row.finance?.operationModel);
    const UBY_MODELS = ["uby", "hybrid", "third_party_management"];
    const total = sumRows(rows);
    const ubyTotal = sumRows(rows.filter(r => UBY_MODELS.includes(m(r))));
    const ownTotal = sumRows(rows.filter(r => ["uby", "hybrid"].includes(m(r))));
    const unit = (row, value) => ({ workId: row.workId, workName: row.workName, station: row.stationName || row.workName, model: m(row), modelLabel: operationModelLabel(row.finance?.operationModel), value: Number(value || 0) });
    const byMonth = new Map();
    rows.forEach(row => (row.financeMonths || []).forEach(({ monthKey: mk, result }) => {
      const item = byMonth.get(mk) || { key: mk, label: monthLabel(mk), management: 0, ubyRoyalty: 0, p3SocietyProfit: 0 };
      item.management += Number(result.management || 0); item.ubyRoyalty += Number(result.ubyRoyalty || 0); item.p3SocietyProfit += Number(result.p3SocietyProfit || 0);
      byMonth.set(mk, item);
    }));
    return {
      total: { revenue: total.revenue || 0, extraRevenue: total.extraRevenue || 0, platform: total.platform || 0, ubyRoyalty: total.ubyRoyalty || 0, costs: total.costs || 0,
        areaParticipation: total.areaParticipation || 0, totalOperatingCost: total.totalOperatingCost || 0, management: total.management || 0, p3SocietyProfit: total.p3SocietyProfit || 0,
        p3Gross: total.p3Gross || 0, ubyNet: total.ubyNet || 0, saRetention: total.saRetention || 0, investorDistribution: total.investorDistribution || 0,
        partnerInvestorDistribution: total.partnerInvestorDistribution || 0, ubyRetained: total.ubyRetained || 0, investmentValue: total.investmentValue || 0,
        paybackMonths: total.paybackMonths, roiMonthly: total.roiMonthly, margin: total.margin, courtesyEnergy: total.courtesyEnergy || 0, courtesyCostExcluded: total.courtesyCostExcluded || 0 },
      uby: { revenue: ubyTotal.revenue || 0, totalOperatingCost: ubyTotal.totalOperatingCost || 0, ubyNet: ubyTotal.ubyNet || 0, ubyRoyalty: ubyTotal.ubyRoyalty || 0,
        saRetention: ubyTotal.saRetention || 0, investorDistribution: ubyTotal.investorDistribution || 0, ubyRetained: ubyTotal.ubyRetained || 0,
        management: ubyTotal.management || 0, platform: ubyTotal.platform || 0, areaParticipation: ubyTotal.areaParticipation || 0,
        investmentValue: ownTotal.investmentValue || 0, paybackMonths: ownTotal.paybackMonths, roiMonthly: ownTotal.roiMonthly,
        units: rows.filter(r => UBY_MODELS.includes(m(r))).length },
      groups: {
        uby: rows.filter(r => ["uby", "hybrid", "third_party_management"].includes(m(r))).map(r => unit(r, r.finance?.ubyNet)),
        p3: rows.filter(r => Number(r.finance?.p3OperationalResult || 0) > 0).map(r => unit(r, r.finance?.p3OperationalResult)),
        investors: rows.filter(r => ["uby", "hybrid"].includes(m(r)) && Number(r.finance?.investorDistribution || 0) > 0).map(r => unit(r, r.finance?.investorDistribution)),
        partners: rows.filter(r => ["p3_society", "management_only", "third_party_management"].includes(m(r)) && Number(r.finance?.partnerInvestorDistribution || 0) > 0).map(r => unit(r, r.finance?.partnerInvestorDistribution))
      },
      units: rows.map(r => { const f = r.finance || {}; const o = financeUnitOutcome(f); return { workId: r.workId, workName: r.workName, station: r.stationName || r.workName,
        model: m(r), ubyAsset: UBY_MODELS.includes(m(r)), modelLabel: operationModelLabel(f.operationModel), revenue: f.revenue || 0, totalOperatingCost: f.totalOperatingCost || 0, outcomeLabel: o.label, outcome: o.value,
        destination: o.destination, investmentValue: f.investmentValue || 0, paybackMonths: f.paybackMonths || 0, roiMonthly: f.roiMonthly || 0, margin: f.margin || 0,
        months: (r.financeMonths || []).length }; }),
      management: [...byMonth.values()].sort((a, b) => b.key.localeCompare(a.key))
    };
  }

  async function financeReports() {
    const list = await loadFinanceReportArchive(true);
    // "local-*" são rascunhos que existem só neste navegador (a tela original
    // salva uma cópia ao abrir o relatório; a nuvem está bloqueada aqui).
    return JSON.parse(JSON.stringify((list || []).map(r => ({ id: r.id, local: String(r.id || "").startsWith("local-"), workId: r.workId, stationName: r.stationName || r.stationKey || "", reportType: r.reportType,
      periodKey: r.periodKey, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, version: r.version, generatedAt: r.generatedAt, closedAt: r.closedAt,
      updatedAt: r.updatedAt, by: r.generatedByEmail || "",
      summary: (() => { const p = r.payload || {}; const f = p.finance || p.result || p.totals || p; return { revenue: Number(f.revenue || f.totalRevenue || 0), result: Number(f.operationNet ?? f.ubyNet ?? f.result ?? 0) }; })() }))));
  }

  // ---------------------------------------------------------------------
  // Configuração da rede — parâmetros vigentes de cada carregador (competência
  // mais recente), inclusão na operação UBY, horário e arranjo físico.
  // ---------------------------------------------------------------------
  function networkConfig() {
    const latest = months().at(-1) || "";
    const unitData = getGeneralUnitData();
    return getUbyChargerRows(unitData).map(row => {
      const station = row.station || row.stationName || row.workName;
      const cfg = { ...defaultFinanceSettings(), ...financeSettingsForUbyRow({ ...row, stationName: station }, latest) };
      const model = normalizeOperationModel(cfg.operationModel);
      const avail = stationAvailabilityFor(row.workId, station, row.workName);
      const rules = kind => { try { return normalizeFinanceRules(cfg, kind).filter(r => r.enabled !== false).map(r => ({ label: r.label || r.name || "", basis: r.basis || "", value: Number(r.value || 0), scope: r.scope || "" })); } catch (_) { return []; } };
      const dates = (row.charges || []).map(c => c.startDate).filter(Boolean);
      return {
        workId: row.workId, workName: row.workName, station, kind: row.kind, included: !!row.included, ruleSource: row.ruleSource || "", model,
        sessions: (row.charges || []).length, lastDate: dates.length ? iso(new Date(Math.max(...dates))) : null,
        power: Number(workPowerById(row.workId) || 0),
        schedule: stationScheduleLabel(avail), open24h: avail.open24h !== false, operationStart: avail.operationStart || "",
        layout: { acChargers: avail.acChargers, acPlugs: avail.acPlugs, dcChargers: avail.dcChargers, dcPlugs: avail.dcPlugs },
        managementPct: Number(cfg.managementPct || 0), platformPct: Number(cfg.platformPct || 0), taxRatePct: Number(cfg.taxRatePct || 0),
        ubyRoyaltyPct: Number(cfg.ubyRoyaltyPct || 0), p3SocietyPct: Number(cfg.p3SocietyPct || 0),
        areaMode: cfg.ownerTransferMode || "gross", areaPct: cfg.ownerTransferMode === "net" ? Number(cfg.ownerNetProfitSharePct || 0) : Number(cfg.ownerRevenueSharePct || 0),
        energyCostPerKWh: Number(cfg.energyCostPerKWh || 0), energyBillingMode: cfg.energyBillingMode || "",
        investmentValue: Number(cfg.investmentValue || 0), investorQuotaPct: Number(cfg.investorQuotaPct || 0), saRetentionPct: Number(cfg.saRetentionPct || 0),
        targetOccPct: Number(cfg.targetOccPct || 0), costRules: rules("cost"), revenueRules: rules("revenue"), month: latest
      };
    });
  }

  // =====================================================================
  // Motor financeiro v2 — adaptador.
  // Lê a base uma vez (carregadores, sessões por mês, configurações, matriz),
  // guarda em cache e entrega as contas ao núcleo puro (app/finance-core.js).
  // Nada aqui grava: é leitura e cálculo.
  // =====================================================================
  const CORE = () => window.UBY_FINANCE_CORE;
  const n0 = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const FV2 = { stamp: "", rows: null, unitData: null, months: [], rowMonths: new Map(), eligible: new Map(), matrix: new Map(), results: new Map() };
  const FIX_LABELS = {
    aggregation: "Payback, ROI e margem pela média mensal (E1/E2)",
    zeroSaleMonths: "Meses sem venda e período ativo do carregador (E3/E7)",
    hybridMarketing: "Híbrido: marketing na divisão AC/DC (E4)",
    courtesyInvoice: "Cortesia do parceiro fora da fatura de energia (E5)",
    monthScope: "Fatura e avulsos só na própria competência (E6)",
    matrixCents: "Rateio da matriz fechando ao centavo",
    powerPerCharger: "Peso por potência dividido no local",
    lossCarry: "Prejuízo compensado antes de distribuir"
  };
  const MONTH_SPECIFIC = ["energyCopelAmount", "energyCopelKWh", "energyLeaseCreditedKWh"];

  function fv2Stamp() {
    let charges = 0, updated = "";
    Object.values(allRechargeRecords || {}).forEach(r => {
      charges += Array.isArray(r?.charges) ? r.charges.length : 0;
      const u = String(r?.updatedAt || r?.summary?.updatedAt || "");
      if (u > updated) updated = u;
    });
    let matrix = 0;
    try { matrix = (loadMatrizCosts() || []).length; } catch (_) {}
    return `${Object.keys(allRechargeRecords || {}).length}|${charges}|${updated}|${matrix}`;
  }
  function fv2Ensure() {
    const stamp = fv2Stamp();
    if (FV2.rows && FV2.stamp === stamp) return;
    FV2.stamp = stamp;
    FV2.rowMonths.clear(); FV2.eligible.clear(); FV2.matrix.clear(); FV2.results.clear();
    FV2.unitData = getGeneralUnitData();
    FV2.rows = getUbyChargerRows(FV2.unitData).map((row, i) => ({ ...row, stationName: row.station, fv2Id: `${row.workId}::${normalizeStationForCompare(row.station || row.workName || "")}::${i}` }));
    FV2.rows.forEach(row => {
      const by = new Map();
      (row.charges || []).forEach(c => { const mk = chargeMonthKey(c); if (mk === "unknown") return; if (!by.has(mk)) by.set(mk, []); by.get(mk).push(c); });
      FV2.rowMonths.set(row.fv2Id, by);
    });
    FV2.months = [...new Set(FV2.rows.filter(r => r.included).flatMap(r => [...FV2.rowMonths.get(r.fv2Id).keys()]))].filter(isPlausibleMonthKey).sort();
  }
  function fv2Fixes(spec) {
    if (spec === "on" || spec === true) return CORE().FIXES_ON;
    if (!spec || spec === "off") return CORE().FIXES_OFF;
    return Object.fromEntries(CORE().FIXES.map(k => [k, !!spec[k]]));
  }
  const fixKey = fixes => CORE().FIXES.map(k => (fixes[k] ? 1 : 0)).join("");
  const rowFirstMonth = row => [...(FV2.rowMonths.get(row.fv2Id)?.keys() || [])].filter(isPlausibleMonthKey).sort()[0] || "";

  // Configuração da competência. Com monthScope: fatura e avulsos nunca herdam
  // de mês antigo, e mês anterior à primeira configuração não herda a mais recente.
  function fv2Settings(row, mk, fixes) {
    const rec = allRechargeRecords[row.workId] || {};
    const root = rec.financialSettings || rec.summary?.financialSettings || {};
    const stationName = row.stationName || row.station || row.workName || "";
    const key = normalizeStationForCompare(canonicalStationNameForWork(row.workId, stationName, row.workName));
    const scoped = root?.chargers?.[key] || {};
    const E = window.UBY_FINANCE_ENGINE;
    const res = E.resolveMonthlySettings(defaultFinanceSettings(), root, scoped, mk);
    let settings = res.settings;
    const flags = [];
    if (fixes.monthScope) {
      const saved = [...new Set([...E.monthKeys(root), ...E.monthKeys(scoped)])].sort();
      if (!res.exact && !res.previousMonth && saved.length) {
        const first = saved[0];
        settings = { ...defaultFinanceSettings(), ...(root[first] || {}), ...(scoped[first] || {}) };
        flags.push("antes-da-primeira-config");
      }
      let inherited = !res.exact;
      const src = res.exact ? settings.periodMeta?.inheritedFrom : "";
      if (src && src !== mk && n0(settings.energyCopelAmount) > 0) {
        const prior = E.resolveMonthlySettings(defaultFinanceSettings(), root, scoped, src).settings;
        if (MONTH_SPECIFIC.every(f => n0(settings[f]) === n0(prior[f]))) { inherited = true; flags.push("fatura-copiada"); }
      }
      if (inherited) {
        if (!flags.includes("fatura-copiada") && (n0(settings.energyCopelAmount) > 0 || n0(settings.energyLeaseCreditedKWh) > 0)) flags.push("fatura-herdada");
        settings = { ...settings };
        MONTH_SPECIFIC.forEach(f => { settings[f] = 0; });
        ["costRules", "revenueRules"].forEach(k => {
          if (Array.isArray(settings[k]) && settings[k].some(r => r?.basis === "one_off" && r.enabled !== false)) {
            settings[k] = settings[k].map(r => (r?.basis === "one_off" ? { ...r, enabled: false } : r));
            flags.push("avulso-herdado");
          }
        });
      }
    }
    return { settings, flags, exact: res.exact, sourceMonth: res.sourceMonth };
  }
  // Mesma preparação do início de financeForCharges().
  function fv2Cfg(settings) {
    const cfg = { ...defaultFinanceSettings(), ...settings };
    if (!settings.operationModel && (n0(settings.p3AcEquityPct) > 0 || n0(settings.p3DcEquityPct) > 0)) cfg.operationModel = "hybrid";
    cfg.costItems = { ...(settings.costItems || {}), ...(settings.extraCosts || {}) };
    if (n0(settings.otherCosts) > 0 && !cfg.costItems.otherCostsLegacy) cfg.costItems.otherCostsLegacy = n0(settings.otherCosts);
    cfg.revenueItems = { ...(settings.revenueItems || {}), ...(settings.extraRevenue || {}) };
    cfg.costRules = normalizeFinanceRules({ ...settings, costItems: cfg.costItems }, "cost");
    cfg.revenueRules = normalizeFinanceRules({ ...settings, revenueItems: cfg.revenueItems }, "revenue");
    cfg.operationModel = normalizeOperationModel(cfg.operationModel);
    return cfg;
  }

  // Com zeroSaleMonths, o rateio da matriz só considera carregadores já em operação
  // na competência: a parte de quem ainda não operava vai para quem operava.
  function fv2Eligible(mk, fixes = CORE().FIXES_OFF) {
    const k = `${mk}|${fixes.zeroSaleMonths ? 1 : 0}`;
    if (!FV2.eligible.has(k)) FV2.eligible.set(k, FV2.rows.filter(r => matrizEligibleRow(r, mk) && (!fixes.zeroSaleMonths || (rowFirstMonth(r) && mk >= rowFirstMonth(r)))));
    return FV2.eligible.get(k);
  }
  // Rateio de um custo da matriz entre todos os destinos da competência (calculado uma vez).
  function fv2MatrixAlloc(item, mk, fixes) {
    const k = `${item.id}|${mk}|${fixes.matrixCents ? 1 : 0}${fixes.powerPerCharger ? 1 : 0}${fixes.zeroSaleMonths ? 1 : 0}`;
    if (FV2.matrix.has(k)) return FV2.matrix.get(k);
    const rows = fv2Eligible(mk, fixes);
    const targets = (item.targets || []).filter(t => !t.startMonth || t.startMonth <= mk)
      .map(t => ({ target: t, row: matrizResolveTargetRow(t, rows) || rows.find(c => matrizTargetMatchesRow(t, c)) || null }));
    const byScope = new Map();
    targets.filter(e => e.row).forEach(e => { const s = matrizStationScope(e.row) || matrizScopeKey(e.row); if (!byScope.has(s)) byScope.set(s, e); });
    const active = [...byScope.values()];
    const weights = active.map(e => {
      if (item.allocation === "power" && fixes.powerPerCharger) {
        const sameLocal = rows.filter(r => String(r.workId) === String(e.row.workId)).length || 1;
        return Math.max(0, n0(workPowerById(e.row.workId))) / sameLocal;
      }
      return matrizWeight(e.row, e.target, item, mk);
    });
    const comp = matrizCompetencyAmount(item), cash = matrizCashAmount(item, mk);
    let shares, cashShares;
    if (fixes.matrixCents) { shares = CORE().allocate(comp, weights); cashShares = CORE().allocate(cash, weights); }
    else {
      const tw = weights.reduce((s, w) => s + w, 0);
      shares = weights.map(w => (tw > 0 ? comp * w / tw : comp / weights.length));
      cashShares = weights.map(w => (tw > 0 ? cash * w / tw : cash / weights.length));
    }
    const out = { active, shares, cashShares };
    FV2.matrix.set(k, out);
    return out;
  }
  function fv2MatrixItems(row, mk, fixes) {
    if (!fixes.matrixCents && !fixes.powerPerCharger && !fixes.zeroSaleMonths) return matrizCostItemsForRow(row, mk, FV2.unitData);
    if (!fv2Eligible(mk, fixes).some(r => r.fv2Id === row.fv2Id)) return [];
    return loadMatrizCosts().filter(item => matrizApplies(item, mk)).flatMap(item => {
      const { active, shares, cashShares } = fv2MatrixAlloc(item, mk, fixes);
      if (!active.length) return [];
      let idx = active.findIndex(e => matrizRowsMatch(e.row, row));
      if (idx < 0) {
        const same = active.map((e, i) => [e, i]).filter(([e]) => String(e.row.workId || "") === String(row.workId || ""));
        if (same.length === 1) idx = same[0][1];
      }
      if (idx < 0 || !(shares[idx] > 0)) return [];
      return [{ id: item.id, label: item.name, category: item.category || "Outros custos", amount: shares[idx], cashAmount: cashShares[idx],
        coverageMonths: matrizCoverageMonths(item), rule: `${matrizMethodLabel(item.allocation)} | ${active.length} destino(s)` }];
    });
  }

  function fv2Month(row, mk, fixes) {
    const k = `${row.fv2Id}|${mk}|${fixKey(fixes)}`;
    if (FV2.results.has(k)) return FV2.results.get(k);
    const charges = FV2.rowMonths.get(row.fv2Id)?.get(mk) || [];
    const { settings, flags } = fv2Settings(row, mk, fixes);
    const cfg = fv2Cfg(settings);
    const stationName = row.stationName || row.station;
    const courtesy = courtesyFinanceBreakdown(charges, stationAvailabilityFor(row.workId, stationName, row.workName), cfg.energyCostPerKWh);
    const planning = financePlanningContext(charges, mk, cfg, row.charges || [], workPowerById(row.workId));
    const result = CORE().computeMonth({
      monthKey: mk, model: cfg.operationModel, cfg,
      revenue: charges.reduce((s, c) => s + c.revenue, 0), energy: charges.reduce((s, c) => s + c.energyKWh, 0),
      acRevenue: charges.filter(c => chargerKind(c) === "ac").reduce((s, c) => s + c.revenue, 0),
      dcRevenue: charges.filter(c => chargerKind(c) === "dc").reduce((s, c) => s + c.revenue, 0),
      courtesy: { treatment: courtesy.treatment, energy: courtesy.energy, energyCost: courtesy.energyCost, commercialEnergy: courtesy.commercialEnergy, charges: courtesy.charges, revenue: courtesy.revenue },
      planning, matrixItems: fv2MatrixItems(row, mk, fixes)
    }, fixes);
    result.flags = flags;
    result.sessions = charges.length;
    FV2.results.set(k, result);
    return result;
  }
  // Meses que entram para o carregador: com zeroSaleMonths, do primeiro mês com
  // venda em diante (com ou sem venda); sem a correção, como a plataforma original.
  function fv2RowMonths(row, fixes, monthKey) {
    const own = [...(FV2.rowMonths.get(row.fv2Id)?.keys() || [])].filter(isPlausibleMonthKey).sort();
    if (monthKey) return fixes.zeroSaleMonths ? (own[0] && monthKey >= own[0] ? [monthKey] : []) : [monthKey];
    return fixes.zeroSaleMonths ? FV2.months.filter(m => own[0] && m >= own[0]) : own;
  }
  function fv2Policy() {
    const p = loadNetworkDistribution();
    return { legalReservePct: p.legalReservePct, expansionReservePct: p.expansionReservePct, investorPct: p.investorPct,
      quotaValue: p.quotaValue, distributionStartMonth: p.distributionStartMonth, investors: normalizeNetworkInvestors(p.investors),
      taxRatePct: p.taxRatePct || 0, taxByMonth: p.taxByMonth || {}, paymentLedger: p.paymentLedger || {} };
  }
  function fv2NetworkMonthly(fixes) {
    const included = FV2.rows.filter(r => r.included);
    return FV2.months.map(mk => {
      let ownedNet = 0, royalties = 0, taxBase = 0;
      const rows = [];
      included.forEach(row => {
        const active = !!(rowFirstMonth(row) && mk >= rowFirstMonth(row));
        if (fixes.zeroSaleMonths && !active) return;
        const r = fv2Month(row, mk, fixes);
        const owned = r.operationModel === "uby" || r.operationModel === "hybrid";
        if (owned) { ownedNet += r.operationNet; taxBase += r.totalRevenue; }
        else if (r.operationModel === "third_party_management") { royalties += r.ubyRoyalty; taxBase += r.ubyRoyalty; }
        if (owned || r.operationModel === "third_party_management") rows.push({ station: row.stationName, active, model: r.operationModel, revenue: r.revenue, energyCost: r.energyCost,
          localExtraCosts: r.localExtraCosts, matrizCost: r.matrizCost, taxes: r.taxes, operationNet: r.operationNet, royalty: r.ubyRoyalty, flags: r.flags });
      });
      return { monthKey: mk, ownedNet, royalties, taxBase, rows };
    });
  }

  // Resultado único com óticas: por carregador (acumulado ou mês), rede por mês e distribuição.
  function financeV2(opts = {}) {
    fv2Ensure();
    const fixes = fv2Fixes(opts.fixes ?? "on");
    const monthKey = opts.monthKey || "";
    const stations = FV2.rows.filter(r => r.included).map(row => {
      const months = fv2RowMonths(row, fixes, monthKey);
      const results = months.map(mk => fv2Month(row, mk, fixes));
      const total = CORE().aggregate(results, fixes, { months: results.length || 1 });
      return { workId: row.workId, workName: row.workName, station: row.stationName, kind: row.kind, model: total.operationModel,
        firstMonth: rowFirstMonth(row), months: results.map(r => ({ monthKey: r.monthKey, revenue: r.revenue, operationNet: r.operationNet, ubyNet: r.ubyNet, energyCost: r.energyCost, matrizCost: r.matrizCost, flags: r.flags })),
        finance: total, flags: [...new Set(results.flatMap(r => r.flags || []))] };
    });
    const net = CORE().network(fv2NetworkMonthly(fixes), fv2Policy(), fixes);
    return { fixes, months: FV2.months, stations, network: net };
  }

  // Paridade: v2 com correções desligadas contra financeForCharges() original, carregador × mês.
  function financeV2Parity() {
    fv2Ensure();
    const OFF = CORE().FIXES_OFF;
    const fields = ["revenue", "totalRevenue", "energyCost", "localExtraCosts", "matrizCost", "extraCosts", "taxes", "management", "platform", "ubyRoyalty",
      "areaParticipation", "operationNet", "ubyNet", "p3SocietyProfit", "partnerShare", "saRetention", "investorDistribution", "partnerInvestorDistribution", "paybackBase", "totalOperatingCost"];
    const included = FV2.rows.filter(r => r.included);
    const t0 = performance.now();
    const legacy = new Map();
    included.forEach(row => FV2.months.forEach(mk => {
      const charges = FV2.rowMonths.get(row.fv2Id)?.get(mk) || [];
      const stationName = row.stationName || row.station;
      legacy.set(`${row.fv2Id}|${mk}`, financeForCharges(charges, financeSettingsForUbyRow(row, mk), { monthKey: mk, historyCharges: row.charges || [], power: workPowerById(row.workId),
        matrizCostItems: matrizCostItemsForRow(row, mk), workId: row.workId, workName: row.workName, stationName, courtesyConfig: stationAvailabilityFor(row.workId, stationName, row.workName) }));
    }));
    const legacyMs = performance.now() - t0;
    FV2.results.clear(); FV2.matrix.clear(); FV2.eligible.clear();
    const t1 = performance.now();
    let checked = 0;
    const diffs = [];
    included.forEach(row => FV2.months.forEach(mk => {
      const v = fv2Month(row, mk, OFF), l = legacy.get(`${row.fv2Id}|${mk}`);
      checked += 1;
      fields.forEach(f => {
        const a = n0(l[f]), b = n0(v[f]);
        if (Math.abs(a - b) > 0.005) diffs.push({ station: row.stationName, monthKey: mk, field: f, legacy: a, v2: b });
      });
    }));
    const v2Ms = performance.now() - t1;
    // Rede por mês: networkUnifiedReportModel original × v2 sem correções.
    const t2 = performance.now();
    const legacyNet = FV2.months.map(mk => ({ monthKey: mk, result: n0(networkUnifiedReportModel({ monthKey: mk }).result) }));
    const legacyNetMs = performance.now() - t2;
    const t3 = performance.now();
    const v2Net = CORE().network(fv2NetworkMonthly(OFF), { ...fv2Policy(), taxRatePct: 0, taxByMonth: {} }, OFF).months;
    const v2NetMs = performance.now() - t3;
    const netDiffs = legacyNet.map((m, i) => ({ monthKey: m.monthKey, legacy: m.result, v2: v2Net[i]?.result || 0 })).filter(m => Math.abs(m.legacy - m.v2) > 0.005);
    return { checked, fields: fields.length, diffs: diffs.slice(0, 200), diffCount: diffs.length, legacyMs, v2Ms, legacyNetMs, v2NetMs, netMonths: legacyNet.length, netDiffs };
  }

  // Impacto de cada correção sozinha e de todas juntas, contra a regra original.
  function financeV2Impact() {
    fv2Ensure();
    const base = financeV2({ fixes: "off" });
    const summarize = r => ({ result: r.network.totals.result, distributable: r.network.totals.distributable, investorPool: r.network.totals.investorPool,
      ownedNet: r.stations.filter(s => s.model === "uby" || s.model === "hybrid").reduce((s, x) => s + x.finance.operationNet, 0),
      ubyNet: r.stations.reduce((s, x) => s + x.finance.ubyNet, 0) });
    const b = summarize(base);
    const compare = run => run.stations.map(s => {
      const o = base.stations.find(x => x.workId === s.workId && x.station === s.station)?.finance || {};
      const f = s.finance;
      return { station: s.station, workName: s.workName, model: s.model,
        operationNet: [n0(o.operationNet), n0(f.operationNet)], ubyNet: [n0(o.ubyNet), n0(f.ubyNet)], matrizCost: [n0(o.matrizCost), n0(f.matrizCost)],
        energyCost: [n0(o.energyCost), n0(f.energyCost)], paybackMonths: [n0(o.paybackMonths), n0(f.paybackMonths)], roiMonthly: [n0(o.roiMonthly), n0(f.roiMonthly)], margin: [n0(o.margin), n0(f.margin)] };
    }).filter(r => ["operationNet", "ubyNet", "matrizCost", "energyCost", "paybackMonths", "roiMonthly", "margin"].some(k => Math.abs(r[k][0] - r[k][1]) > 0.005));
    const each = CORE().FIXES.map(key => {
      const run = financeV2({ fixes: { [key]: true } });
      const s = summarize(run);
      return { key, label: FIX_LABELS[key], delta: Object.fromEntries(Object.keys(b).map(k => [k, s[k] - b[k]])), stations: compare(run) };
    });
    const allRun = financeV2({ fixes: "on" });
    const flags = allRun.stations.flatMap(s => s.months.filter(m => (m.flags || []).length).map(m => ({ station: s.station, monthKey: m.monthKey, flags: m.flags })));
    const multi = [...new Set(FV2.rows.map(r => r.workId))].map(workId => {
      const rows = FV2.rows.filter(r => String(r.workId) === String(workId));
      return { workId, workName: rows[0]?.workName || workId, power: workPowerById(workId), chargers: rows.map(r => ({ station: r.stationName, kind: r.kind, included: r.included })) };
    }).filter(w => w.chargers.length > 1);
    return { base: b, all: { ...summarize(allRun), delta: Object.fromEntries(Object.keys(b).map(k => [k, summarize(allRun)[k] - b[k]])) }, each, flags,
      multiChargerSites: multi, stationsAll: compare(allRun), quotaValue: allRun.network.quotaValue, distributionStartMonth: allRun.network.distributionStartMonth,
      networkMonths: { before: base.network.months, after: allRun.network.months }, investors: { before: base.network.investors, after: allRun.network.investors } };
  }

  // =====================================================================
  // Financeiro oficial da nova — motor v2 com as correções aprovadas em
  // 26/09/2026 ("se você tiver certeza que agora estão corretos pode seguir").
  // Mesmo formato de saída das versões originais (…Legacy), para as telas.
  // =====================================================================
  const ON = () => CORE().FIXES_ON;
  function fv2RowAgg(row, monthKey = "") {
    const fixes = ON();
    const months = fv2RowMonths(row, fixes, monthKey);
    const results = months.map(mk => fv2Month(row, mk, fixes));
    const f = CORE().aggregate(results, fixes, { months: results.length || 1 });
    f.costs = f.energyCost + f.extraCosts + f.taxes;
    return { row, months, results, f };
  }
  // Soma de vários carregadores: investimento soma; payback = investimento ÷ resultado médio mensal da carteira.
  function fv2SumRows(list) {
    const t = Object.fromEntries(CORE().ADDITIVE.map(k => [k, list.reduce((s, x) => s + n0(x.f[k]), 0)]));
    t.investmentValue = list.reduce((s, x) => s + n0(x.f.investmentValue), 0);
    t.paybackInvestmentValue = list.reduce((s, x) => s + n0(x.f.paybackInvestmentValue), 0);
    const months = new Set(list.flatMap(x => x.months)).size || 1;
    const base = t.paybackBase / months;
    t.paybackMonths = t.paybackInvestmentValue > 0 && base > 0 ? t.paybackInvestmentValue / base : 0;
    t.roiMonthly = t.paybackInvestmentValue > 0 ? base / t.paybackInvestmentValue * 100 : 0;
    t.margin = t.totalRevenue ? t.ownResult / t.totalRevenue * 100 : 0;
    t.costs = t.energyCost + t.extraCosts + t.taxes;
    return t;
  }
  function fv2Network() { return CORE().network(fv2NetworkMonthly(ON()), fv2Policy(), ON()); }

  function finance(monthKey) {
    fv2Ensure();
    const sourceMonths = FV2.months;
    const isMonthView = !!monthKey && sourceMonths.includes(monthKey);
    const mk = isMonthView ? monthKey : "";
    const aggs = FV2.rows.filter(r => r.included).map(r => fv2RowAgg(r, mk)).filter(x => x.results.length)
      .sort((a, b) => n0(b.f.operationNet) - n0(a.f.operationNet));
    const isPartner = x => x.f.operationModel === "third_party_management";
    const partnerRows = aggs.filter(isPartner), ownRows = aggs.filter(x => !isPartner(x));
    const total = Object.fromEntries(FINANCE_FIELDS.map(f => [f, ownRows.reduce((s, x) => s + n0(x.f[f]), 0)]));
    const partnerRoyalty = partnerRows.reduce((s, x) => s + n0(x.f.ubyRoyalty), 0);
    const totalCostPerKWh = total.commercialEnergy > 0 ? total.totalOperatingCost / total.commercialEnergy : null;
    const margin = total.totalRevenue > 0 ? total.operationNet / total.totalRevenue * 100 : 0;
    const ubyNet = n0(total.ubyNet), profit = ubyNet > 0;
    const saRet = profit ? Math.max(0, n0(total.saRetention)) : 0, investor = profit ? Math.max(0, n0(total.investorDistribution)) : 0;
    const distribution = { ubyNet, hasProfit: profit, saRetention: saRet, investors: investor, retained: profit ? Math.max(0, n0(total.ubyRetained)) : 0,
      quotaPct: (ubyNet - saRet) > 0 ? investor / (ubyNet - saRet) * 100 : 0 };

    // DRE consolidada da rede: ativos UBY + royalties − impostos, com reservas e cotistas pela regra corrigida.
    const ownedDre = aggs.filter(x => ["uby", "hybrid"].includes(x.f.operationModel));
    const sumF = (list, k) => list.reduce((s, x) => s + n0(x.f[k]), 0);
    const owned = Object.fromEntries(["revenue", "extraRevenue", "marketingRevenue", "energyCost", "extraCosts", "matrizCost", "matrizTaxCost", "taxes", "areaParticipation", "management", "platform", "operationNet", "ubyRoyalty"].map(k => [k, sumF(ownedDre, k)]));
    const net = fv2Network();
    const policy = loadNetworkDistribution();
    const nm = isMonthView ? (net.months.find(m => m.monthKey === mk) || {}) : null;
    const pick = k => (isMonthView ? n0(nm[k]) : n0(net.totals[k]));
    const royalties = partnerRoyalty;
    const operationalResult = n0(owned.operationNet);
    const networkTaxes = pick("taxes");
    const networkResult = operationalResult + royalties - networkTaxes;
    const legalReserve = pick("legalReserve"), expansionReserve = pick("expansionReserve"), investorPool = pick("investorPool");
    const soldQuotas = Math.min(n0(policy.soldQuotas), n0(policy.totalQuotas) || 1);
    const networkRevenue = n0(owned.revenue) + n0(owned.extraRevenue) + n0(owned.marketingRevenue);
    const dre = {
      ownedCount: ownedDre.length, partnerCount: partnerRows.length,
      rechargeRevenue: n0(owned.revenue), extraRevenue: n0(owned.extraRevenue), royalties, marketing: n0(owned.marketingRevenue),
      networkRevenue, energyCost: n0(owned.energyCost), directOperation: Math.max(0, n0(owned.extraCosts) - n0(owned.matrizCost)),
      taxes: n0(owned.taxes), matrizTaxCost: n0(owned.matrizTaxCost), otherMatriz: Math.max(0, n0(owned.matrizCost) - n0(owned.matrizTaxCost)), matrizCost: n0(owned.matrizCost),
      management: n0(owned.management), platform: n0(owned.platform), areaParticipation: n0(owned.areaParticipation),
      networkTaxes, networkTaxBase: pick("taxBase"), taxRatePct: n0(policy.taxRatePct),
      operationalResult, networkResult, margin: networkRevenue ? networkResult / networkRevenue * 100 : 0,
      distributable: pick("distributable"), lossCarried: isMonthView ? n0(nm.carryIn) : n0(net.totals.carryOut),
      legalReserve, expansionReserve, reserve: legalReserve + expansionReserve, investorPool, soldQuotas, perQuota: soldQuotas > 0 ? investorPool / soldQuotas : 0,
      policy: { roundLabel: policy.roundLabel, totalQuotas: n0(policy.totalQuotas), soldQuotas, investorPct: n0(policy.investorPct),
        legalReservePct: n0(policy.legalReservePct), expansionReservePct: n0(policy.expansionReservePct), taxRatePct: n0(policy.taxRatePct) }
    };
    const accAggs = isMonthView ? FV2.rows.filter(r => r.included).map(r => fv2RowAgg(r, "")).filter(x => x.results.length && x.f.operationModel !== "third_party_management") : ownRows;
    const monthly = sourceMonths.map(m => {
      const rs = accAggs.flatMap(x => x.results.filter(r => r.monthKey === m));
      const g = k => rs.reduce((s, r) => s + n0(r[k]), 0);
      return { key: m, label: monthLabel(m), revenue: g("revenue"), cost: g("totalOperatingCost"), result: g("operationNet"), matrizCost: g("matrizCost"), energy: g("energy"),
        costPerKWh: g("commercialEnergy") > 0 ? g("totalOperatingCost") / g("commercialEnergy") : null };
    });
    return {
      engine: "v2", period: { monthKey: mk, label: isMonthView ? monthLabel(mk) : "Acumulado", months: sourceMonths },
      total: { ...total, totalCostPerKWh, plannedCostPerKWh: null, margin, partnerRoyalty, partnerCount: partnerRows.length },
      composition: [
        { label: "Energia", value: total.energyCost, detail: "faturas de energia vinculadas às recargas" },
        { label: "Gestão e plataforma", value: total.management + total.platform, detail: "gestão P3 e tecnologia da operação" },
        { label: "Operação por carregador", value: Math.max(total.extraCosts - total.matrizCost, 0), detail: "despesas próprias dos ativos, sem matriz" },
        { label: "Custos da matriz rateados", value: total.matrizCost, detail: "custos compartilhados distribuídos aos destinos" }
      ],
      distribution, dre, monthly,
      rows: aggs.map(x => {
        const f = x.f, row = x.row;
        return { workId: row.workId, workName: row.workName, station: row.stationName || row.station, kind: row.kind, partner: isPartner(x),
          model: f.operationModel, modelLabel: operationModelLabel(f.operationModel), months: x.results.length,
          revenue: f.revenue, extraRevenue: f.extraRevenue, marketingRevenue: f.marketingRevenue, totalRevenue: f.totalRevenue, energy: f.energy,
          energyCost: f.energyCost, extraCosts: f.extraCosts, matrizCost: f.matrizCost, taxes: f.taxes, management: f.management, platform: f.platform,
          areaParticipation: f.areaParticipation, ubyRoyalty: f.ubyRoyalty, totalOperatingCost: f.totalOperatingCost, operationNet: f.operationNet,
          operationMargin: f.operationMargin, totalCostPerKWh: f.totalCostPerKWh, resultPerKWh: f.resultPerKWh,
          courtesyCharges: f.courtesyCharges, courtesyEnergy: f.courtesyEnergy, courtesyCostExcluded: f.courtesyCostExcluded };
      })
    };
  }

  function investorDistribution() {
    fv2Ensure();
    const net = fv2Network();
    const policy = fv2Policy();
    const idx = net.months.map((m, i) => (m.inDistribution ? i : -1)).filter(i => i >= 0);
    const months = idx.map(i => {
      const m = net.months[i];
      const eligibleQuotas = policy.investors.filter(inv => inv.eligibleFrom <= m.monthKey).reduce((s, inv) => s + n0(inv.quotas), 0);
      return { key: m.monthKey, label: monthLabel(m.monthKey), taxBase: m.taxBase, taxes: m.taxes, taxSource: m.taxSource, preTax: m.preTax, result: m.result,
        carryIn: m.carryIn, carryOut: m.carryOut, distributable: m.distributable, legalReserve: m.legalReserve, expansionReserve: m.expansionReserve,
        investorPool: m.investorPool, eligibleQuotas, perQuota: eligibleQuotas && m.investorPool > 0 ? m.investorPool / eligibleQuotas : 0,
        status: policy.paymentLedger?.[m.monthKey]?.status || "pendente" };
    });
    const investors = net.investors.map(inv => ({ name: inv.name, quotas: inv.quotas, eligibleFrom: inv.eligibleFrom, status: inv.status,
      allocations: idx.map(i => inv.allocations[i]), due: inv.due, quotaValue: n0(inv.quotaValue) || net.quotaValue,
      investment: inv.investment, returnRate: inv.returnRate, annualized: inv.annualized, paybackYears: inv.paybackYears }));
    const totalAllocated = investors.reduce((s, i) => s + i.due, 0);
    const totalPool = months.filter(m => m.eligibleQuotas > 0).reduce((s, m) => s + m.investorPool, 0);
    return { engine: "v2", valid: Math.abs(totalAllocated - totalPool) < 0.02, totalAllocated, totalPool, months, investors,
      quotaValue: net.quotaValue, distributionStartMonth: net.distributionStartMonth, taxRatePct: n0(policy.taxRatePct),
      totals: { taxes: months.reduce((s, m) => s + m.taxes, 0), preTax: months.reduce((s, m) => s + m.preTax, 0), result: months.reduce((s, m) => s + m.result, 0) } };
  }

  function stationFinance(workId, station, monthKey) {
    fv2Ensure();
    const row = FV2.rows.find(r => String(r.workId) === String(workId) && normalizeStationForCompare(r.station) === normalizeStationForCompare(station));
    if (!row) return null;
    const fixes = ON();
    const rowMonths = fv2RowMonths(row, fixes, "");
    const mk = rowMonths.includes(monthKey) ? monthKey : rowMonths.at(-1) || "";
    const v2Pick = r => ({ model: r.operationModel, revenue: r.revenue, extraRevenue: r.extraRevenue, marketingRevenue: r.marketingRevenue, totalRevenue: r.totalRevenue,
      energy: r.energy, commercialEnergy: r.commercialEnergy, energyCost: r.energyCost, taxes: r.taxes, localExtraCosts: r.localExtraCosts, matrizCost: r.matrizCost,
      matrizTaxCost: r.matrizTaxCost, matrizCash: r.matrizCash, management: r.management, platform: r.platform, ubyRoyalty: r.ubyRoyalty, areaParticipation: r.areaParticipation,
      areaSharePct: r.areaSharePct, totalOperatingCost: r.totalOperatingCost, operationNet: r.operationNet, operationMargin: r.operationMargin, totalCostPerKWh: r.totalCostPerKWh,
      resultPerKWh: r.energy > 0 ? r.operationNet / r.energy : null, ubyNet: r.ubyNet, p3OperationalResult: r.p3OperationalResult, p3SocietyProfit: r.p3SocietyProfit,
      partnerShare: r.partnerShare, saRetention: r.saRetention, investorDistribution: r.investorDistribution, partnerInvestorDistribution: r.partnerInvestorDistribution,
      ubyRetained: r.ubyRetained, investmentValue: r.investmentValue, paybackInvestmentValue: r.paybackInvestmentValue, paybackBase: r.paybackBase,
      courtesyCharges: r.courtesyCharges, courtesyEnergy: r.courtesyEnergy, courtesyCostExcluded: r.courtesyCostExcluded });
    const monthly = rowMonths.map(m => ({ key: m, label: monthLabel(m), ...v2Pick(fv2Month(row, m, fixes)) }));
    const v = mk ? fv2Month(row, mk, fixes) : null;
    const legacy = mk ? financeForRowMonth(row, mk).result : null; // só métricas de planejamento (break-even, custo variável, meta)
    const acc = CORE().aggregate(rowMonths.map(m => fv2Month(row, m, fixes)), fixes, { months: rowMonths.length || 1 });
    const cfg = mk ? { ...defaultFinanceSettings(), ...fv2Settings(row, mk, fixes).settings } : {};
    const finance = v ? { ...(legacy ? pickFinance(legacy) : {}), ...v2Pick(v), paybackMonths: acc.paybackMonths, roiMonthly: acc.roiMonthly, energyRate: legacy?.energyRate, taxRatePct: n0(cfg.taxRatePct) } : null;
    return {
      engine: "v2", workId: row.workId, workName: row.workName, station: row.station, kind: row.kind, included: row.included, monthKey: mk, label: mk ? monthLabel(mk) : "—",
      months: rowMonths.map(m => ({ key: m, label: monthLabel(m) })), modelLabel: v ? operationModelLabel(v.operationModel) : "",
      flags: v ? v.flags || [] : [], finance,
      settings: v ? { managementPct: n0(cfg.managementPct), platformPct: n0(cfg.platformPct), taxRatePct: n0(cfg.taxRatePct), ubyRoyaltyPct: n0(cfg.ubyRoyaltyPct),
        energyCostPerKWh: n0(cfg.energyCostPerKWh), investmentValue: n0(cfg.investmentValue), saRetentionPct: n0(cfg.saRetentionPct), investorQuotaPct: n0(cfg.investorQuotaPct),
        p3SocietyPct: n0(cfg.p3SocietyPct), energyBillingMode: cfg.energyBillingMode || "" } : null,
      energyComposition: v?.energyComposition ? JSON.parse(JSON.stringify(v.energyComposition)) : null,
      costLines: v ? [
        ...v.costRuleDetails.filter(d => d.enabled !== false && (n0(d.actual) || n0(d.planned))).map(d => ({ label: d.label, rule: d.displayRule || "", actual: n0(d.actual), planned: n0(d.planned), perKWh: v.energy > 0 ? n0(d.actual) / v.energy : null, matrix: false })),
        ...v.matrixItems.map(i => ({ label: /tribut|impost|taxa/i.test(`${i.category || ""} ${i.label || ""}`) ? `Tributo centralizado — ${i.label}` : i.label, rule: i.rule || "Rateio da matriz", actual: n0(i.amount), planned: n0(i.amount), perKWh: v.energy > 0 ? n0(i.amount) / v.energy : null, matrix: true }))
      ] : [],
      revenueLines: v ? v.revenueRuleDetails.filter(d => d.enabled !== false && (n0(d.actual) || n0(d.planned))).map(d => ({ label: d.label, rule: d.displayRule || "", actual: n0(d.actual), planned: n0(d.planned), scope: d.scope || "" })) : [],
      planning: legacy?.planning ? { planningKWh: legacy.planning.planningKWh, planningRevenue: legacy.planning.planningRevenue, salePricePerKWh: legacy.planning.salePricePerKWh,
        targetOccPct: legacy.planning.targetOccPct, realOccPct: legacy.planning.realOccPct } : null,
      monthly
    };
  }

  function destinations() {
    fv2Ensure();
    const aggs = FV2.rows.filter(r => (r.charges || []).length).map(r => fv2RowAgg(r, "")).filter(x => x.results.length)
      .map(x => ({ ...x, outcome: financeUnitOutcome(x.f) }))
      .sort((a, b) => (Math.abs(b.outcome.value - a.outcome.value) > 0.009 ? b.outcome.value - a.outcome.value : n0(b.f.revenue) - n0(a.f.revenue)));
    const m = x => x.f.operationModel;
    const UBY_MODELS = ["uby", "hybrid", "third_party_management"];
    const total = fv2SumRows(aggs), ubyTotal = fv2SumRows(aggs.filter(x => UBY_MODELS.includes(m(x)))), ownTotal = fv2SumRows(aggs.filter(x => ["uby", "hybrid"].includes(m(x))));
    const unit = (x, value) => ({ workId: x.row.workId, workName: x.row.workName, station: x.row.stationName || x.row.workName, model: m(x), modelLabel: operationModelLabel(m(x)), value: n0(value) });
    const byMonth = new Map();
    aggs.forEach(x => x.results.forEach(r => {
      const item = byMonth.get(r.monthKey) || { key: r.monthKey, label: monthLabel(r.monthKey), management: 0, ubyRoyalty: 0, p3SocietyProfit: 0 };
      item.management += n0(r.management); item.ubyRoyalty += n0(r.ubyRoyalty); item.p3SocietyProfit += n0(r.p3SocietyProfit);
      byMonth.set(r.monthKey, item);
    }));
    return {
      engine: "v2",
      total: { revenue: total.revenue, extraRevenue: total.extraRevenue, platform: total.platform, ubyRoyalty: total.ubyRoyalty, costs: total.costs, areaParticipation: total.areaParticipation,
        totalOperatingCost: total.totalOperatingCost, management: total.management, p3SocietyProfit: total.p3SocietyProfit, p3Gross: total.p3Gross, ubyNet: total.ubyNet,
        saRetention: total.saRetention, investorDistribution: total.investorDistribution, partnerInvestorDistribution: total.partnerInvestorDistribution, ubyRetained: total.ubyRetained,
        investmentValue: total.investmentValue, paybackMonths: total.paybackMonths, roiMonthly: total.roiMonthly, margin: total.margin, courtesyEnergy: total.courtesyEnergy, courtesyCostExcluded: total.courtesyCostExcluded },
      uby: { revenue: ubyTotal.revenue, totalOperatingCost: ubyTotal.totalOperatingCost, ubyNet: ubyTotal.ubyNet, ubyRoyalty: ubyTotal.ubyRoyalty, saRetention: ubyTotal.saRetention,
        investorDistribution: ubyTotal.investorDistribution, ubyRetained: ubyTotal.ubyRetained, management: ubyTotal.management, platform: ubyTotal.platform, areaParticipation: ubyTotal.areaParticipation,
        investmentValue: ownTotal.investmentValue, paybackMonths: ownTotal.paybackMonths, roiMonthly: ownTotal.roiMonthly, units: aggs.filter(x => UBY_MODELS.includes(m(x))).length },
      groups: {
        uby: aggs.filter(x => UBY_MODELS.includes(m(x))).map(x => unit(x, x.f.ubyNet)),
        p3: aggs.filter(x => n0(x.f.p3OperationalResult) > 0).map(x => unit(x, x.f.p3OperationalResult)),
        investors: aggs.filter(x => ["uby", "hybrid"].includes(m(x)) && n0(x.f.investorDistribution) > 0).map(x => unit(x, x.f.investorDistribution)),
        partners: aggs.filter(x => ["p3_society", "management_only", "third_party_management"].includes(m(x)) && n0(x.f.partnerInvestorDistribution) > 0).map(x => unit(x, x.f.partnerInvestorDistribution))
      },
      units: aggs.map(x => ({ workId: x.row.workId, workName: x.row.workName, station: x.row.stationName || x.row.workName, model: m(x), ubyAsset: UBY_MODELS.includes(m(x)),
        modelLabel: operationModelLabel(m(x)), revenue: x.f.revenue, totalOperatingCost: x.f.totalOperatingCost, outcomeLabel: x.outcome.label, outcome: x.outcome.value,
        destination: x.outcome.destination, investmentValue: x.f.investmentValue, paybackMonths: x.f.paybackMonths, roiMonthly: x.f.roiMonthly, margin: x.f.margin, months: x.results.length })),
      management: [...byMonth.values()].sort((a, b) => b.key.localeCompare(a.key))
    };
  }

  window.UBY_MOTOR_API = { waitForReady, loadFull, status, months, monthName, command, companyResults, stations, stationDetail, works, usage, networkConfig,
    financeStations, stationFinance, destinations, financeReports,
    finance, financeMonths, investorDistribution, matrix, payments, financeDocuments, openFinanceDocument,
    customerRegistry, clientIntelligence, club, financeV2, financeV2Parity, financeV2Impact,
    financeLegacy, investorDistributionLegacy, stationFinanceLegacy, destinationsLegacy };
  document.dispatchEvent(new CustomEvent("uby:motor-api-ready"));
})();

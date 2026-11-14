/*
  NOVA PLATAFORMA — núcleo das recargas (regras de negócio).

  Gerado em 2026-11-14 por ferramentas/extrair-nucleo.js a partir das regras do
  motor antigo (legado/obra-ev/recargas_app.js), SEM nada de tela: nenhuma página antiga,
  nenhuma moldura escondida. Conferido número a número pelo gabarito (tests/gerar-gabarito.js).
  A partir da migração este arquivo é a fonte da verdade das regras.

  Exporta window.UBY_NUCLEO: as funções de regra e .state (estado vivo: base de recargas,
  configurações financeiras, obra/estação corrente usadas por alguns cálculos).
*/
(function () {
const NUCLEO_STATUS = { message: "", isError: false, at: 0 };
// Regras trocáveis em tempo de execução (ver TROCAVEIS em ferramentas/extrair-nucleo.js).
let getUbyChargerRows = __base_getUbyChargerRows;
let clientKeyFromCharge = __base_clientKeyFromCharge;

let allCharges  = [];

let loadedFiles = [];

let allRechargeRecords = {};

let cloudRechargeWorks = [];

let monthlyClosings = {};

let financialSettings = {};

let stationAvailability = {};

let ubyOperationOverrides = {};

let rechargeRecordsVersion = 0;

let generalUnitDataCache = null;

let networkHistoryCache = null;

let networkHistoryCacheVersion = -1;

let localRechargeDbSignature = '';

let financeReportArchive = [];

let financeReportArchiveLoaded = false;

let financeReportArchivePromise = null;

let rechargeLoadSequence = 0;

let generalRefreshSequence = 0;

let overviewInsightsTimers = { geral: null, uby: null };

let overviewSessionsFullyHydrated = false;

let overviewSessionsHydrationPromise = null;

let fullRechargeWorkIds = new Set();

let rechargeFullLoadPromises = new Map();

const RECARGAS_LOCAL_KEY = 'uby-recargas-db-v1';

const FINANCE_REPORTS_LOCAL_KEY = 'uby-finance-reports-v1';

const XLSX_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

const CLUB_PARTICIPANTS_LOCAL_KEY = 'uby-club-participants-v1';

const OVERVIEW_PAGE_SIZE = 1000;

const CLUB_FORM_SHEET_ID = '19iPeYks-8P0Fd3henDoTYFPN5hQ6dconJgsQOl30Qws';

const CLUB_FORM_GID = '1124525277';

const CLUB_FORM_CSV_URL = `https://docs.google.com/spreadsheets/d/${CLUB_FORM_SHEET_ID}/export?format=csv&gid=${CLUB_FORM_GID}`;

const CLUB_FORM_AUTO_SYNC_MAX_AGE_MS = 10 * 60 * 1000;

let clubParticipantsSyncPromise = null;

let clubParticipantsAutoSyncAttempted = false;

const FINANCE_COST_ITEMS = [
  ['fixedRent', 'Aluguel fixo / vaga'],
  ['insurance', 'Seguranca'],
  ['internet', 'Internet / dados'],
  ['preventiveMaintenance', 'Manutencao preventiva'],
  ['correctiveMaintenance', 'Manutencao corretiva (provisao)'],
  ['softwareLicense', 'Licenca software / plataforma'],
  ['security', 'Seguro'],
  ['marketing', 'Marketing'],
  ['accounting', 'Contabilidade / administrativo'],
  ['demandCost', 'Custo demanda Grupo A (c/ impostos)'],
  ['cleaning', 'Limpeza / conservacao'],
  ['monitoring', 'Monitoramento / telemetria'],
  ['taxes', 'Tributos e taxas fixas'],
  ['financing', 'Leasing / financiamento'],
  ['depreciation', 'Depreciacao do ativo'],
  ['paymentFees', 'Taxas de pagamento'],
  ['otherCostsLegacy', 'Outros custos']
];

const FINANCE_EXTRA_REVENUE_ITEMS = [
  ['subscription', 'Assinatura / mensalidade'],
  ['parking', 'Estacionamento'],
  ['advertising', 'Publicidade (OOH / midia)'],
  ['activationFee', 'Taxa de ativacao / cadastro'],
  ['convenienceFee', 'Taxa de conveniencia'],
  ['accessorySales', 'Venda de acessorios'],
  ['partnerCommission', 'Comissao de parceiros'],
  ['spaceRental', 'Aluguel de espaco (vending/loja)'],
  ['localServices', 'Servicos no local (lavagem/cafe)'],
  ['otherRevenue', 'Outros']
];

const FINANCE_RULE_BASIS = [
  ['fixed', 'Fixo mensal'],
  ['per_kwh', 'Por kWh'],
  ['revenue_pct', '% do faturamento'],
  ['per_charge', 'Por recarga'],
  ['one_off', 'Avulso no ciclo']
];

const appData = window.UBY_APP_DATA || {};

let currentWorkId = new URLSearchParams(location.search).get('obra') || localStorage.getItem('uby-recargas-current-work') || 'rio';

let currentWorkName = '';

let currentStationReportName = '';

let spreadsheetLibraryPromise = null;

const RECHARGE_STATION_BLOCKLIST_BY_WORK = {
  malassise: ['posto prata', 'prata cambe', 'prata cambé', 'cambe', 'cambé']
};
// Obras sincronizadas pela Spott: não há confirmação manual para exceções.
// O CSV precisa conter somente o Local oficial da obra de destino. Assim uma
// seleção equivocada nunca consegue gravar dados em outra base.

const RECHARGE_WORK_BLOCKLIST_TERMS = ['go grid', 'gogrid'];

function workExcludedFromRecharge(...names) {
  const hay = normalizeStationForCompare(names.filter(Boolean).join(' '));
  if (!hay) return false;
  return RECHARGE_WORK_BLOCKLIST_TERMS.some(term => hay.includes(normalizeStationForCompare(term)));
}

const DEFAULT_STATION_PHYSICAL_LAYOUTS = [
  { terms: ['robert koch', 'malassise r k', 'liv 000199'], acChargers: 0, acPlugs: 0, dcChargers: 1, dcPlugs: 2 },
  { terms: ['rio beach'], acChargers: 1, acPlugs: 1, dcChargers: 0, dcPlugs: 0 },
  { terms: ['santarem ev jardins', 'santarem jardins'], acChargers: 1, acPlugs: 1, dcChargers: 0, dcPlugs: 0 },
  { terms: ['santarem ev sabara', 'santarem sabara'], acChargers: 2, acPlugs: 2, dcChargers: 0, dcPlugs: 0 }
];

function stationAvailabilityKey(stationName) {
  return normalizeStationForCompare(stationName || 'estacao') || 'estacao';
}

// Regra visual: nomes de estações são sempre apresentados em caixa alta.
// O valor original não é alterado, preservando a identificação armazenada.

function dcComparisonRowKey(row = {}) {
  return `${row.workId || 'obra'}|${row.key || normalizeStationForCompare(row.stationName || row.station || row.workName || '')}`;
}

function defaultPhysicalLayout(stationName = '', workName = '') {
  const normalized = normalizeStationForCompare(`${stationName} ${workName}`);
  return DEFAULT_STATION_PHYSICAL_LAYOUTS.find(layout => layout.terms.some(term => normalized.includes(normalizeStationForCompare(term)))) || {
    acChargers: 0, acPlugs: 0, dcChargers: 0, dcPlugs: 0
  };
}

function stationAvailabilityFor(workId, stationName, workName = '') {
  const record = allRechargeRecords[workId] || localRecord(workId) || {};
  const stored = record.stationAvailability || record.summary?.stationAvailability || {};
  const key = stationAvailabilityKey(stationName);
  const physical = defaultPhysicalLayout(stationName, workName);
  return {
    plantName: stationName || workName || '',
    acChargers: Number(physical.acChargers || 0),
    acPlugs: Number(physical.acPlugs || 0),
    dcChargers: Number(physical.dcChargers || 0),
    dcPlugs: Number(physical.dcPlugs || 0),
    operationStart: '',
    open24h: true,
    openTime: '08:00',
    closeTime: '22:00',
    openDays: [0,1,2,3,4,5,6],
    ...(stored[key] || {})
  };
}

function timeMinutes(value, fallback = 0) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : fallback;
}

function stationAvailableHours(config, start, end) {
  if (!start || !end || end <= start) return 0;
  const openDays = new Set((config?.openDays || [0,1,2,3,4,5,6]).map(Number));
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const finalDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let milliseconds = 0;
  let guard = 0;
  while (cursor <= finalDay && guard < 4000) {
    guard++;
    if (openDays.has(cursor.getDay())) {
      let availableStart = new Date(cursor);
      let availableEnd = new Date(cursor);
      // NOVA PLATAFORMA: exceção de horário por dia da semana (ex.: domingo diferente).
      const dayRule = config?.dayHours?.[cursor.getDay()] || config?.dayHours?.[String(cursor.getDay())] || null;
      const is24h = dayRule ? dayRule.open24h === true : config?.open24h !== false;
      const openAt = dayRule ? dayRule.openTime : config?.openTime;
      const closeAt = dayRule ? dayRule.closeTime : config?.closeTime;
      if (is24h) {
        availableEnd.setDate(availableEnd.getDate() + 1);
      } else {
        availableStart.setMinutes(timeMinutes(openAt, 0));
        availableEnd.setMinutes(timeMinutes(closeAt, 24 * 60));
        if (availableEnd <= availableStart) availableEnd.setDate(availableEnd.getDate() + 1);
      }
      const overlapStart = Math.max(start.getTime(), availableStart.getTime());
      const overlapEnd = Math.min(end.getTime(), availableEnd.getTime());
      if (overlapEnd > overlapStart) milliseconds += overlapEnd - overlapStart;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return milliseconds / 3_600_000;
}

function stationScheduleLabel(config) {
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  const days = (config.openDays || []).map(day => dayNames[Number(day)]).join(', ');
  const base = `${days || 'Sem dias'} - ${config.open24h !== false ? '24 horas' : `${config.openTime} as ${config.closeTime}`}`;
  const exceptions = Object.entries(config.dayHours || {})
    .filter(([day]) => (config.openDays || []).map(Number).includes(Number(day)))
    .map(([day, rule]) => `${dayNames[Number(day)]}: ${rule.open24h === true ? '24 horas' : `${rule.openTime} as ${rule.closeTime}`}`);
  return exceptions.length ? `${base} (exceto ${exceptions.join('; ')})` : base;
}

function markRechargeRecordsDirty() {
  rechargeRecordsVersion += 1;
  generalUnitDataCache = null;
}

function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error(`Nao foi possivel carregar ${src}`));
    document.head.appendChild(script);
  });
}

function ensureSpreadsheetLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  spreadsheetLibraryPromise = spreadsheetLibraryPromise || loadScriptOnce(XLSX_CDN_URL, 'XLSX');
  return spreadsheetLibraryPromise;
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
  catch { return fallback; }
}

function storageQuotaExceeded(err) {
  return err?.name === 'QuotaExceededError' || /quota|exceeded/i.test(String(err?.message || ''));
}

function tryWriteJson(key, value) {
  try {
    const payload = JSON.stringify(value);
    localStorage.setItem(key, payload);
    return { ok: true, size: payload.length };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function writeJson(key, value) {
  const result = tryWriteJson(key, value);
  if (!result.ok && !storageQuotaExceeded(result.error)) throw result.error;
  return result.ok;
}

function rechargeRecordHasData(record = {}) {
  const summary = record.summary || {};
  return Boolean(
    (Array.isArray(record.charges) && record.charges.length) ||
    (Array.isArray(record.files) && record.files.length) ||
    Number(summary.charges || summary.totalCharges || summary.recharges || 0) > 0 ||
    Number(summary.energy || summary.energyKWh || 0) > 0 ||
    Number(summary.revenue || 0) > 0
  );
}

function workHasRechargeHistory(workId) {
  const id = String(workId || '').trim();
  if (!id) return false;
  const db = readJson(RECARGAS_LOCAL_KEY, {});
  return rechargeRecordHasData(db[id]) || rechargeRecordHasData(allRechargeRecords[id]);
}

function completedWorkStatus(work = {}) {
  const text = normalizeTextForInsight([
    work.status,
    work.status_exec,
    work.statusExec,
    work.projectStatus,
    work.etapa,
    work.kind
  ].filter(Boolean).join(' '));
  const pct = Number(work.pct ?? work.progresso ?? work.progress ?? work.percentual ?? 0);
  return (
    work.concluida === true ||
    work.completed === true ||
    pct >= 100 ||
    text.includes('concluida') ||
    text.includes('concluido') ||
    text.includes('finalizada') ||
    text.includes('finalizado') ||
    text.includes('operacao') ||
    text.includes('operacional')
  );
}

function rechargeEligibleWork(work = {}) {
  if (workExcludedFromRecharge(work.nome, work.id)) return false;
  return completedWorkStatus(work) || workHasRechargeHistory(work.id);
}

// workOptions() fazia JSON.parse da base inteira de recargas + varredura de
// todo o localStorage a CADA chamada, e era chamada centenas de vezes por
// render (uma por recarga, via canonicalStationNameForWork/workNameById).
// Isso sozinho custava ~10s no render. Agora o resultado é memoizado e só
// recalculado quando uma assinatura barata (sem parse) muda.

let _workOptionsCache = null;

let _workOptionsSig = null;

function workOptionsSignature() {
  let recLen = 0, dashLen = 0, lsLen = 0;
  try { recLen = (localStorage.getItem(RECARGAS_LOCAL_KEY) || '').length; } catch (_) {}
  try { dashLen = (localStorage.getItem('uby-obras-dashboard-v1') || '').length; } catch (_) {}
  try { lsLen = localStorage.length; } catch (_) {}
  return `${rechargeRecordsVersion}|${cloudRechargeWorks.length}|${lsLen}|${recLen}|${dashLen}|${Object.keys(allRechargeRecords || {}).length}`;
}

function workOptions() {
  const sig = workOptionsSignature();
  if (_workOptionsCache && _workOptionsSig === sig) return _workOptionsCache;
  const result = workOptionsUncached();
  _workOptionsCache = result;
  _workOptionsSig = sig;
  return result;
}

function workOptionsUncached() {
  const byId = new Map();
  (appData.baseObras || []).forEach(work => byId.set(work.id, work));
  readJson('uby-obras-dashboard-v1', []).forEach(work => {
    if (work?.id) byId.set(work.id, { ...(byId.get(work.id) || {}), ...work });
  });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('uby-obra-detalhe-')) continue;
    const id = key.replace('uby-obra-detalhe-', '');
    const detail = readJson(key, null);
    if (detail?.project) {
      byId.set(id, {
        ...(byId.get(id) || {}),
        id,
        nome: detail.project.obraNome || id,
        cliente: detail.project.cliente || '',
        local: detail.project.local || '',
        status: detail.project.statusExec || detail.project.status || '',
        statusExec: detail.project.statusExec || detail.project.status || '',
        cidade: detail.project.cidade || '',
        uf: detail.project.uf || '',
        weatherLat: detail.project.weatherLat || detail.project.latitude || detail.project.lat || '',
        weatherLon: detail.project.weatherLon || detail.project.longitude || detail.project.lng || detail.project.lon || '',
        kw: Number(detail.project.qtdCarregadores || 1) * Number(detail.project.potenciaCarregador || 60)
      });
    }
  }
  cloudRechargeWorks.forEach(work => {
    if (!work?.id) return;
    byId.set(work.id, { ...(byId.get(work.id) || {}), ...work });
  });
  const rechargeSources = { ...readJson(RECARGAS_LOCAL_KEY, {}), ...allRechargeRecords };
  Object.entries(rechargeSources).forEach(([workId, record]) => {
    if (!workId || byId.has(workId) || !rechargeRecordHasData(record)) return;
    byId.set(workId, {
      id: workId,
      nome: record.workName || record.summary?.workName || workId,
      cliente: record.summary?.cliente || '',
      status: 'Concluida',
      statusExec: 'Concluida',
      kw: Number(record.summary?.powerKw || record.summary?.kw || 0)
    });
  });
  if (!byId.has('malassise')) {
    byId.set('malassise', { id: 'malassise', nome: 'Posto Robert Koch R.K.', cliente: 'Malassise Robert Koch', status: 'Concluida', statusExec: 'Concluida', kw: 60 });
  } else {
    byId.set('malassise', { ...byId.get('malassise'), status: 'Concluida', statusExec: 'Concluida' });
  }
  return [...byId.values()]
    .filter(rechargeEligibleWork)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
}

function currentWork() {
  return workOptions().find(work => work.id === currentWorkId) || workOptions()[0] || { id: 'rio', nome: 'Rio Beach EV', kw: 7 };
}

function workNameById(workId, fallback = '') {
  const work = workOptions().find(item => item.id === workId);
  return work?.nome || fallback || workId || 'Unidade';
}

function workPowerById(workId) {
  const work = workOptions().find(item => item.id === workId);
  const record = allRechargeRecords[workId] || localRecord(workId) || {};
  const operationalPower = Number(record.operationalPowerKw || record.summary?.operationalPowerKw || 0);
  if (operationalPower >= 1 && operationalPower <= 360) return operationalPower;
  const power = Number(work?.kw || 0);
  return power > 0 ? power : 7;
}

function selectorChargesForWork(workId = '') {
  const record = allRechargeRecords[String(workId || '')] || localRecord(workId) || {};
  return Array.isArray(record?.charges) ? record.charges.map(hydrateCharge) : [];
}

function workSelectorStationName(work = {}) {
  const charges = selectorChargesForWork(work.id);
  const stations = [...new Set(charges
    .map(charge => canonicalStationNameForWork(work.id, charge.station, work.nome || charge.workName))
    .filter(Boolean))];
  if (stations.length === 1) return stations[0];
  const record = allRechargeRecords[String(work.id || '')] || localRecord(work.id) || {};
  const summaryStation = safeText(record?.summary?.stationName || record?.summary?.station || record?.stationName).trim();
  return canonicalStationNameForWork(work.id, summaryStation || work.nome || work.id, work.nome || work.id);
}

function workSelectorKinds(work = {}) {
  const charges = selectorChargesForWork(work.id);
  const kinds = new Set(charges.map(chargerKind).filter(kind => kind === 'dc' || kind === 'ac'));
  if (!kinds.size) {
    const record = allRechargeRecords[String(work.id || '')] || localRecord(work.id) || {};
    const nominalPower = Number(record?.operationalPowerKw || record?.summary?.operationalPowerKw || record?.summary?.powerKw || work.kw || 0);
    const label = `${workSelectorStationName(work)} ${work.nome || ''}`.toUpperCase();
    if (/\bDC\b|\bCCS\b|\b60\s*KW\b|\b80\s*KW\b/.test(label)) kinds.add('dc');
    else if (/\bAC\b|TYPE\s*2|\b7\s*KW\b|\b22\s*KW\b/.test(label)) kinds.add('ac');
    else if (nominalPower >= 40) kinds.add('dc');
    else if (nominalPower > 0) kinds.add('ac');
  }
  return ['dc', 'ac'].filter(kind => kinds.has(kind));
}

function workSelectorLabel(work = {}) {
  const types = workSelectorKinds(work).map(kind => kind.toUpperCase()).join(' / ');
  const station = workSelectorStationName(work);
  return `${types ? `${types} - ` : ''}${station || work.id || 'ESTACAO'}`.toLocaleUpperCase('pt-BR');
}

function workSelectorOrder(a = {}, b = {}) {
  const rank = work => {
    const kinds = workSelectorKinds(work);
    if (kinds.includes('dc')) return 0;
    if (kinds.includes('ac')) return 1;
    return 2;
  };
  return rank(a) - rank(b) || workSelectorLabel(a).localeCompare(workSelectorLabel(b), 'pt-BR');
}

function workSelectorDataScore(work = {}) {
  const record = allRechargeRecords[String(work.id || '')] || localRecord(work.id) || {};
  const charges = Array.isArray(record?.charges) ? record.charges.length : Number(record?.summary?.charges || 0);
  const files = Array.isArray(record?.files) ? record.files.length : Number(record?.summary?.files || 0);
  const updatedAt = Date.parse(record?.updatedAt || record?.summary?.updatedAt || '') || 0;
  // O histórico é o primeiro critério: uma obra duplicada e vazia nunca pode
  // substituir a estação que já possui recargas salvas.
  return (charges * 1000000) + (files * 1000) + Math.min(updatedAt, 999);
}

function selectorWorksWithoutDuplicateStations(works = []) {
  const byStation = new Map();
  works.forEach(work => {
    const label = workSelectorLabel(work);
    const key = normalizeStationForCompare(label);
    const previous = byStation.get(key);
    if (!previous || workSelectorDataScore(work) > workSelectorDataScore(previous)) {
      byStation.set(key, work);
    }
  });
  return [...byStation.values()];
}

function safeText(value) {
  return String(value ?? '');
}

function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return safeText(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function canonicalClientName(value = '') {
  const tokens = normalizeTextForInsight(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // Alguns exportadores repetem o ultimo sobrenome (ex.: "Oliveira Oliveira").
  // A chave preserva a ordem e elimina apenas a duplicacao literal.
  return [...new Set(tokens)].join(' ');
}

function clientIdentityKey(name = '', email = '', phone = '') {
  const canonicalName = canonicalClientName(name);
  // O nome normalizado vem primeiro porque planilhas diferentes frequentemente
  // trazem e-mail vazio ou abreviado para o mesmo motorista. Telefone/e-mail
  // continuam sendo o desempate para registros sem nome aproveitavel.
  if (canonicalName.split(' ').length >= 2) return `name:${canonicalName}`;
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  const normalizedEmail = safeText(email).trim().toLowerCase();
  return normalizedEmail ? `email:${normalizedEmail}` : '';
}

function __base_clientKeyFromCharge(charge = {}) {
  return clientIdentityKey(charge.userName, charge.userEmail, charge.userPhone);
}

function hydrateCharge(charge) {
  let startDate = charge.startIso ? new Date(charge.startIso) : parseDate(charge.startStr);
  let endDate = charge.endIso ? new Date(charge.endIso) : parseDate(charge.endStr);
  // Correção central: uma data corrompida (ex.: ano 3000 por erro de planilha)
  // inflava os intervalos de dia/mês e travava a página. Descartar aqui, na
  // entrada, mantém a recarga nos totais gerais mas a remove de todo cálculo
  // baseado em data (o código já trata startDate/endDate nulos).
  if (startDate && !isPlausibleChargeDate(startDate)) startDate = null;
  if (endDate && !isPlausibleChargeDate(endDate)) endDate = null;
  // Recargas do Shopping Aurora DC foram gravadas como "AURORA AC" pela regra
  // antiga (qualquer "shopping aurora" virava AC). O nome original fica em
  // rawStation (ou _sourceStation, nas sessões): quando ele é DC, a estação
  // volta a ser a original.
  let station = charge.station;
  const raw = safeText(charge.rawStation || charge._sourceStation || '').trim();
  if (raw && isUnifiedAuroraAcStation(station) && !isAuroraAcCandidateText(raw)) station = raw;
  return { ...charge, station, startDate, endDate };
}

function localRechargeDb() {
  return readJson(RECARGAS_LOCAL_KEY, {});
}

function updatedAtMs(record) {
  const raw = record?.updatedAt || record?.summary?.updatedAt || record?.updated_at || '';
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isCloudRecordNewer(local, cloud) {
  if (!local) return true;
  return updatedAtMs(cloud) >= updatedAtMs(local);
}

function hydratedRechargeRecord(record, workId = '') {
  const id = String(workId || record?.workId || record?.summary?.workId || '').trim();
  return {
    ...record,
    workId: id,
    workName: record.workName || record.summary?.workName || workNameById(id),
    files: Array.isArray(record.files) ? record.files : [],
    charges: Array.isArray(record.charges) ? dedupeChargesByUniqueKey(record.charges.map(hydrateCharge)) : [],
    financialSettings: record.financialSettings || record.summary?.financialSettings || {},
    ubyOperationOverrides: record.ubyOperationOverrides || record.summary?.ubyOperationOverrides || {},
    ubyAreaAccounting: record.ubyAreaAccounting || record.summary?.ubyAreaAccounting || {},
    updatedAt: record.updatedAt || record.summary?.updatedAt || ''
  };
}

function expectedRechargeCount(record = {}) {
  const summary = record.summary || {};
  return Math.max(
    Array.isArray(record.charges) ? record.charges.length : 0,
    Number(summary.charges || summary.totalCharges || summary.recharges || 0)
  );
}

function recordHasFullRechargeDetails(record = {}) {
  return Boolean(
    record &&
    Array.isArray(record.charges) &&
    !record.summaryOnly &&
    !record.localCompact &&
    !record.partialDetails
  );
}

function mergeRechargeRecord(existing, incoming, source = 'local') {
  if (!existing) return hydratedRechargeRecord(incoming, incoming?.workId);
  if (!incoming) return hydratedRechargeRecord(existing, existing?.workId);
  const workId = String(incoming.workId || existing.workId || '').trim();
  const current = hydratedRechargeRecord(existing, workId);
  const next = hydratedRechargeRecord(incoming, workId);
  const currentHasDetails = current.charges.length > 0;
  const nextHasDetails = next.charges.length > 0;
  const nextIsPartial = Boolean(incoming.summaryOnly || incoming.localCompact || incoming.partialDetails);
  const currentIsNewer = updatedAtMs(current) > updatedAtMs(next);
  const currentSyncPending = Boolean(existing.cloudSyncPending || current.cloudSyncPending);

  if (nextIsPartial && currentHasDetails) {
    return {
      ...current,
      ...next,
      summary: { ...(current.summary || {}), ...(next.summary || {}) },
      charges: current.charges,
      files: next.files.length ? next.files : current.files,
      localCompact: false,
      summaryOnly: false
    };
  }
  if (source === 'cloud' && nextHasDetails) {
    const currentIsFullLocal = recordHasFullRechargeDetails(existing);
    return currentIsFullLocal && currentIsNewer && currentSyncPending ? current : next;
  }
  if (currentHasDetails && !nextHasDetails && (currentIsNewer || expectedRechargeCount(next) > 0)) {
    return {
      ...current,
      ...next,
      summary: { ...(current.summary || {}), ...(next.summary || {}) },
      charges: current.charges,
      files: next.files.length ? next.files : current.files,
      localCompact: false,
      summaryOnly: false
    };
  }
  return next;
}

function syncGeneralRecordsFromLocal() {
  const db = localRechargeDb();
  const entries = Object.entries(db);
  if (!entries.length) return;
  const signature = entries
    .map(([workId, record]) => `${workId}:${record?.updatedAt || record?.summary?.updatedAt || ''}:${record?.summary?.charges ?? record?.charges?.length ?? 0}:${record?.summary?.revenue ?? ''}`)
    .sort()
    .join('|');
  if (signature && signature === localRechargeDbSignature) return;
  const nextRecords = { ...allRechargeRecords };
  entries.forEach(([workId, record]) => {
    if (!record) return;
    const existing = allRechargeRecords[workId];
    const hydrated = hydratedRechargeRecord(record, workId);
    nextRecords[workId] = mergeRechargeRecord(existing, hydrated, 'local');
  });
  allRechargeRecords = nextRecords;
  localRechargeDbSignature = signature;
  markRechargeRecordsDirty();
}

function mergeCloudRechargeRecords(records) {
  if (!Array.isArray(records) || !records.length) return;
  const db = localRechargeDb();
  records.forEach(record => {
    const workId = String(record?.workId || record?.summary?.workId || '').trim();
    if (!workId) return;
    const normalized = {
      ...record,
      workId,
      workName: record.summary?.workName || record.workName || workNameById(workId),
      files: Array.isArray(record.files) ? record.files : [],
      charges: Array.isArray(record.charges) ? record.charges : [],
      financialSettings: record.financialSettings || record.summary?.financialSettings || {},
      stationAvailability: record.stationAvailability || record.summary?.stationAvailability || {},
      ubyOperationOverrides: record.ubyOperationOverrides || record.summary?.ubyOperationOverrides || {},
      ubyAreaAccounting: record.ubyAreaAccounting || record.summary?.ubyAreaAccounting || {},
      updatedAt: record.updatedAt || record.summary?.updatedAt || new Date().toISOString()
    };
    const existing = allRechargeRecords[workId] || db[workId];
    const merged = mergeRechargeRecord(existing, normalized, (record.summaryOnly || record.partialDetails) ? 'cloud-summary' : 'cloud');
    allRechargeRecords[workId] = hydratedRechargeRecord(merged, workId);
    db[workId] = compactRechargeRecord(merged);
  });
  markRechargeRecordsDirty();
  if (!writeJson(RECARGAS_LOCAL_KEY, db)) window.UBY_BACKUP?.releaseStorage?.();
}

function localRecord(workId = currentWorkId) {
  return localRechargeDb()[workId] || null;
}

// Configuracoes operacionais tambem precisam existir antes da primeira
// planilha. Este registro vazio preserva horario e classificacao UBY sem
// inventar recargas ou alterar o historico da obra.

function compactRechargeRecord(record) {
  if (!record) return record;
  const summary = record.summary || {};
  return {
    ...record,
    charges: [],
    localCompact: true,
    summary: {
      ...summary,
      charges: summary.charges ?? (Array.isArray(record.charges) ? record.charges.length : 0),
      files: summary.files ?? (Array.isArray(record.files) ? record.files.length : 0),
      energyKWh: summary.energyKWh ?? 0,
      revenue: summary.revenue ?? 0,
      updatedAt: summary.updatedAt || record.updatedAt || new Date().toISOString(),
      localCompact: true
    }
  };
}

function normalizeStationForCompare(value) {
  return normalizeTextForInsight(safeText(value)).replace(/[^a-z0-9]+/g, ' ').trim();
}

function sameStationName(a, b) {
  const left = normalizeStationForCompare(a);
  const right = normalizeStationForCompare(b);
  return !!left && !!right && left === right;
}

function isRobertKochWorkId(workId) {
  return String(workId || '').trim().toLowerCase() === 'malassise';
}

function isRobertKochCandidateText(value = '') {
  const text = normalizeStationForCompare(value);
  return text.includes('robert koch') ||
    text.includes('robert kock') ||
    text.includes('posto robert') ||
    text.includes('malassise r k') ||
    text.includes('malassise rk') ||
    text.includes('liv 000199') ||
    text.includes('liv000199');
}

function dcStationIdentity(value = '') {
  const text = normalizeStationForCompare(value);
  if (!text) return '';
  if (isRobertKochCandidateText(text)) return 'robert-koch';
  // A Central JK AC é uma base independente. Esta condição precisa vir antes
  // da Central JK DC porque ambas compartilham a expressão "central jk".
  if (text.includes('central jk ac') || text.includes('ac posto central jk')) return 'central-jk-ac';
  if (text.includes('central jk') || text.includes('posto central jk')) return 'central-jk';
  return '';
}

function dcWorkIdentity(workId = '', workName = '') {
  if (isRobertKochWorkId(workId) || isRobertKochCandidateText(`${workId} ${workName}`)) return 'robert-koch';
  if (String(workId || '').trim().toLowerCase() === 'ac-posto-central-jk') return 'central-jk-ac';
  return dcStationIdentity(`${workId} ${workName}`);
}

function canonicalStationNameForWork(workId, stationName, fallbackName = '') {
  const raw = safeText(stationName || fallbackName).trim();
  const normalized = normalizeStationForCompare(raw);
  const work = workOptions().find(item => String(item.id) === String(workId));
  const workName = work?.nome || fallbackName || raw;
  // As duas bases Aurora AC representam os dois conectores da mesma unidade.
  // A origem segue preservada em cada recarga, mas a leitura operacional usa
  // uma única identidade para não apresentar dois carregadores AC fictícios.
  if (isAuroraAcCandidateText(`${raw} ${workName}`)) {
    return 'UBY RECHARGE - SHOPPING AURORA AC';
  }
  if (String(workId) === 'rio' || normalizeStationForCompare(workName).includes('rio beach') || normalized.includes('rio beach')) {
    return 'Rio Beach EV';
  }
  if (isRobertKochWorkId(workId) || isRobertKochCandidateText(`${raw} ${workName}`)) {
    return 'UBY RECHARGE - POSTO ROBERT KOCH';
  }
  if (normalized.includes('sabara')) {
    return 'SANTAREM EV SABARÁ';
  }
  // O provedor criou duas obras para o mesmo carregador do Mercado Santarém
  // ("Jardins" e "Jardins 2"). Elas são uma única estação operacional: os
  // nomes diferentes continuam preservados nos registros de origem, mas toda
  // leitura do painel usa esta identidade canônica.
  if (normalized.includes('santarem') && normalized.includes('jardins')) {
    return 'SANTAREM EV JARDINS';
  }
  return raw || workName || 'Estacao';
}

function isAuroraAcCandidateText(value = '') {
  const text = normalizeStationForCompare(value);
  // O Shopping Aurora também tem carregador DC (obra própria): nome com "DC"
  // nunca é o Aurora AC, senão os dois viram um carregador só.
  if (/(^|[^a-z0-9])dc([^a-z0-9]|$)/.test(text)) return false;
  return text.includes('aurora') && (text.includes('ac') || text.includes('shopping'));
}

function isUnifiedAuroraAcStation(stationName = '') {
  return normalizeStationForCompare(stationName) === normalizeStationForCompare('UBY RECHARGE - SHOPPING AURORA AC');
}

function isUnifiedJardinsStation(stationName = '') {
  return normalizeStationForCompare(stationName) === normalizeStationForCompare('SANTAREM EV JARDINS');
}

function unifiedJardinsRecordForView(primaryRecord = {}, primaryWorkId = '') {
  const primary = hydratedRechargeRecord(primaryRecord, primaryWorkId);
  const primaryIsJardins = (primary.charges || []).some(charge => isUnifiedJardinsStation(
    canonicalStationNameForWork(primaryWorkId, charge.station, primary.workName)
  )) || isUnifiedJardinsStation(canonicalStationNameForWork(
    primaryWorkId,
    primary.summary?.stationName || primary.stationName || primary.workName,
    primary.workName
  ));
  if (!primaryIsJardins) return primary;

  const candidates = Object.entries({ ...localRechargeDb(), ...allRechargeRecords })
    .map(([workId, record]) => hydratedRechargeRecord(record, workId))
    .filter(record => record?.workId && isUnifiedJardinsStation(canonicalStationNameForWork(
      record.workId,
      record.summary?.stationName || record.stationName || record.charges?.[0]?.station || record.workName,
      record.workName
    )));
  if (!candidates.some(record => String(record.workId) === String(primaryWorkId))) candidates.unshift(primary);
  if (candidates.length < 2) return primary;

  const charges = dedupeChargesByUniqueKey(candidates.flatMap(record => (record.charges || []).map(charge => ({
    ...charge,
    workId: charge.workId || record.workId,
    workName: charge.workName || record.workName,
    station: canonicalStationNameForWork(record.workId, charge.station, record.workName)
  }))));
  const files = candidates.flatMap(record => record.files || []).filter((file, index, list) =>
    list.findIndex(candidate => (candidate.fileKey || candidate.name) === (file.fileKey || file.name)) === index
  );
  return {
    ...primary,
    charges,
    files,
    summary: { ...(primary.summary || {}), stationName: 'SANTAREM EV JARDINS' },
    unifiedSourceWorkIds: [...new Set(candidates.map(record => String(record.workId)))],
    virtualUnifiedStation: true
  };
}

function stationBlockedForWork(workId, stationName) {
  const sourceDc = dcStationIdentity(stationName);
  const targetDc = dcWorkIdentity(workId, workNameById(workId));
  // Central JK e Robert Koch compartilham o nome UBY Recharge. A coincidência
  // genérica não pode permitir que uma exportação DC seja salva na outra obra.
  if (sourceDc || targetDc) return sourceDc !== targetDc;
  const blockedTerms = RECHARGE_STATION_BLOCKLIST_BY_WORK[String(workId || '')] || [];
  if (!blockedTerms.length) return false;
  const stationText = normalizeStationForCompare(stationName);
  return blockedTerms.some(term => stationText.includes(normalizeStationForCompare(term)));
}

function stationLooksRelatedToWork(station, workName) {
  const stationText = normalizeStationForCompare(station);
  const workText = normalizeStationForCompare(workName);
  if (!stationText || !workText) return true;
  const sourceDc = dcStationIdentity(stationText);
  const targetDc = dcWorkIdentity('', workText);
  if (sourceDc || targetDc) return !!sourceDc && sourceDc === targetDc;
  if (isRobertKochCandidateText(`${stationText} ${workText}`) && (workText.includes('malassise') || isRobertKochCandidateText(workText))) return true;
  if (stationText.includes('santarem') && workText.includes('santarem')) return true;
  if (stationText.includes('jardins') && (workText.includes('centro') || workText.includes('santarem'))) return true;
  if (stationText.includes('centro') && (workText.includes('jardins') || workText.includes('santarem'))) return true;
  if (stationText.includes('rio beach') && workText.includes('rio beach')) return true;
  if (stationText.includes('araguaia') && workText.includes('araguaia')) return true;
  if (stationText.includes('duim') && workText.includes('duim')) return true;
  if (stationText.includes(workText) || workText.includes(stationText)) return true;
  const workTokens = new Set(workText.split(' ').filter(token => token.length >= 4));
  const stationTokens = stationText.split(' ').filter(token => token.length >= 4);
  return stationTokens.some(token => workTokens.has(token));
}

function chargeBelongsToWork(charge = {}, workId = '', workName = '') {
  const station = canonicalStationNameForWork(workId || charge.workId, charge.station, workName || charge.workName);
  return stationLooksRelatedToWork(station, workName || workNameById(workId || charge.workId));
}

function stationMismatchMessage() {
  if (currentStationReportName || !allCharges.length) return '';
  const stations = [...new Set(allCharges.map(charge => safeText(charge.station).trim()).filter(Boolean))];
  if (stations.length !== 1) return '';
  const station = stations[0];
  if (stationLooksRelatedToWork(station, currentWorkName)) return '';
  return ` Atencao: a base salva nesta obra parece ser da estacao <strong>${station}</strong>. Se nao for este projeto, exclua esta base e importe a planilha no projeto correto.`;
}

function applyStationReportFilter() {
  if (!currentStationReportName) return;
  const stationName = currentStationReportName;
  const originalCharges = [...allCharges];
  const originalFiles = [...loadedFiles];
  const originalClosings = { ...(monthlyClosings || {}) };
  allCharges = allCharges.filter(charge =>
    sameStationName(charge.station, stationName) ||
    sameStationName(canonicalStationNameForWork(currentWorkId, charge.station, currentWorkName), stationName)
  );
  loadedFiles = loadedFiles.filter(file =>
    !file.station ||
    sameStationName(file.station, stationName) ||
    sameStationName(canonicalStationNameForWork(currentWorkId, file.station, currentWorkName), stationName)
  );
  monthlyClosings = Object.fromEntries(Object.entries(monthlyClosings || {}).filter(([, closing]) => {
    const stations = Array.isArray(closing?.stations) ? closing.stations : [];
    return !stations.length || stations.some(station =>
      sameStationName(station, stationName) ||
      sameStationName(canonicalStationNameForWork(currentWorkId, station, currentWorkName), stationName)
    );
  }));
  if (!allCharges.length && originalCharges.length) {
    allCharges = originalCharges;
    loadedFiles = originalFiles;
    monthlyClosings = originalClosings;
    currentStationReportName = '';
    setStorageState(`Filtro de estacao ignorado para preservar a base completa de <strong>${currentWorkName}</strong>.`, true);
  }
}

async function loadRechargeBase(workId = currentWorkId, options = {}) {
  const targetWorkId = String(workId || currentWorkId);
  const requestSequence = ++rechargeLoadSequence;
  if (currentWorkId !== targetWorkId) currentWorkId = targetWorkId;
  currentWorkName = workNameById(targetWorkId, targetWorkId);
  const local = localRecord(targetWorkId);
  const memory = allRechargeRecords[targetWorkId];
  let cached = null;
  try {
    cached = await window.UBY_RECHARGE_RUNTIME?.cacheGet?.(`work:${targetWorkId}`, 24 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('Cache integral indisponivel:', err.message);
  }
  const initialCandidates = [memory, cached, local].filter(Boolean);
  const initial = initialCandidates.find(recordHasFullRechargeDetails) || initialCandidates[0] || null;
  if (recordHasFullRechargeDetails(initial)) fullRechargeWorkIds.add(targetWorkId);
  if (initial && (!initial.localCompact || initial.charges?.length)) {
    applyRechargeRecord(unifiedJardinsRecordForView(initial, targetWorkId), cached === initial ? 'cache integral' : 'base local');
  }
  else applyRechargeRecord(null, 'base local');
  if (options.skipCloud && recordHasFullRechargeDetails(initial)) return initial;
  if (!window.UBY_SUPABASE?.loadRechargeBase) {
    if (options.requireCloud) throw new Error('Supabase indisponivel. A importacao foi bloqueada para preservar o historico.');
    return initial;
  }
  try {
    let cloudPromise = rechargeFullLoadPromises.get(targetWorkId);
    if (!cloudPromise) {
      cloudPromise = window.UBY_SUPABASE.loadRechargeBase(targetWorkId)
        .finally(() => rechargeFullLoadPromises.delete(targetWorkId));
      rechargeFullLoadPromises.set(targetWorkId, cloudPromise);
    }
    const cloud = await cloudPromise;
    if (requestSequence !== rechargeLoadSequence || currentWorkId !== targetWorkId) return;
    if (cloud) {
      const currentLocal = localRecord(targetWorkId);
      if (currentLocal && !currentLocal.localCompact && !isCloudRecordNewer(currentLocal, cloud)) {
        setStorageState(`Base local mais recente preservada para <strong>${currentWorkName}</strong>. Reenvie a planilha para atualizar o banco, se necessario.`);
        return;
      }
      const merged = mergeRechargeRecord(allRechargeRecords[targetWorkId] || currentLocal, cloud, 'cloud');
      merged.summaryOnly = false;
      merged.localCompact = false;
      merged.partialDetails = false;
      const db = localRechargeDb();
      db[targetWorkId] = compactRechargeRecord({ ...merged, workName: cloud.summary?.workName || currentWorkName });
      if (!writeJson(RECARGAS_LOCAL_KEY, db)) window.UBY_BACKUP?.releaseStorage?.();
      allRechargeRecords[targetWorkId] = hydratedRechargeRecord(merged, targetWorkId);
      fullRechargeWorkIds.add(targetWorkId);
      window.UBY_RECHARGE_RUNTIME?.cacheSet?.(`work:${targetWorkId}`, merged).catch(() => {});
      markRechargeRecordsDirty();
      const viewRecord = unifiedJardinsRecordForView(merged, targetWorkId);
      applyRechargeRecord(viewRecord, 'Supabase');
      return viewRecord;
    }
    if (expectedRechargeCount(memory || local || {}) > 0) {
      throw new Error('O banco informa recargas existentes, mas nao retornou a base integral.');
    }
    const emptyRecord = hydratedRechargeRecord({
      workId: targetWorkId,
      workName: currentWorkName,
      files: [],
      charges: [],
      summaryOnly: false,
      localCompact: false,
      partialDetails: false
    }, targetWorkId);
    allRechargeRecords[targetWorkId] = emptyRecord;
    fullRechargeWorkIds.add(targetWorkId);
    return emptyRecord;
  } catch (err) {
    if (requestSequence !== rechargeLoadSequence || currentWorkId !== targetWorkId) return;
    setStorageState(`Base local preservada para <strong>${currentWorkName}</strong>. Supabase pendente: ${err.message}`, true);
    if (options.requireCloud) throw err;
    return initial;
  }
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let cleaned = raw.replace(/[^\d,.-]/g, '');
  const hasComma = cleaned.includes(',');
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (hasComma) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (dotCount > 1) {
    const lastDot = cleaned.lastIndexOf('.');
    cleaned = cleaned.slice(0, lastDot).replace(/\./g, '') + cleaned.slice(lastDot);
  }
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCouponCode(value = '') {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function couponLabelFromDiscountPct(pct = 0) {
  if (Math.abs(pct - 10) <= 1.2) return 'CLUBEUBY 10%';
  if (Math.abs(pct - 15) <= 1.2) return 'PARCEIROUBY 15%';
  return '';
}

function normalizedCouponLabel(rawCoupon = '', charge = {}) {
  const raw = safeText(rawCoupon).trim();
  if (!raw || raw === '---' || /^-+$/.test(raw)) return '';
  const code = normalizeCouponCode(raw);
  if (code === 'UBY10' || code === 'UBY15' || code === 'UBY8' || code === 'UBY5') return code;
  if (code.includes('CLUBEUBY') || code === 'CLUBE10') return 'CLUBEUBY 10%';
  if (code.includes('PARCEIROUBY') || code === 'PARCEIRO15') return 'PARCEIROUBY 15%';
  if (code === '10' || code === '10PERCENT' || code === '10PORCENTO') return 'CLUBEUBY 10%';
  if (code === '15' || code === '15PERCENT' || code === '15PORCENTO') return 'PARCEIROUBY 15%';

  const numeric = parseNumber(raw);
  const revenue = Number(charge.revenue || 0);
  if (numeric > 0 && revenue > 0) {
    const discountPct = numeric / (revenue + numeric) * 100;
    const inferred = couponLabelFromDiscountPct(discountPct);
    if (inferred) return inferred;
    return `Cupom fora da regra (${fmtPct(discountPct)})`;
  }
  if (code) return 'Cupom fora da regra';
  return '';
}

function couponLabelForCharge(charge = {}) {
  return normalizedCouponLabel(charge.voucher || charge.coupon || charge.couponCode, charge);
}

function couponDiscountPct(label = '') {
  const code = normalizeCouponCode(label);
  if (code.includes('CLUBEUBY') || code === 'UBY10' || code === 'CLUBE10') return 10;
  if (code.includes('PARCEIROUBY') || code === 'UBY15' || code === 'PARCEIRO15') return 15;
  if (code === 'UBY8') return 8;
  if (code === 'UBY5') return 5;
  return 0;
}

function estimatedCouponDiscount(charge = {}, label = couponLabelForCharge(charge)) {
  const pct = couponDiscountPct(label);
  const revenue = Number(charge.revenue || 0);
  return pct > 0 && revenue > 0 ? revenue * pct / (100 - pct) : 0;
}

function normalizeHeaderName(value) {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function fileSourceKey(month = '', name = '', station = '') {
  const clean = value => safeText(value).trim().toLowerCase();
  return [clean(month), clean(name), clean(station)].join('|');
}

function rechargePersonIdentity(charge = {}) {
  const nameTokens = normalizeStationForCompare(charge.userName || '').split(/\s+/).filter(Boolean);
  const name = [...new Set(nameTokens)].join(' ');
  return name ||
    normalizeHeaderName(charge.userEmail || '') ||
    normalizePhone(charge.userPhone || '') ||
    normalizeHeaderName(`${charge.vehicleBrand || ''} ${charge.vehicleModel || ''}`);
}

function rechargeUniqueKey(charge = {}) {
  const workId = safeText(charge.workId || currentWorkId).trim().toLowerCase();
  const station = canonicalStationNameForWork(workId, charge.station, charge.workName);
  const startDate = charge.startDate && typeof charge.startDate.getTime === 'function'
    ? charge.startDate
    : (charge.startIso ? new Date(charge.startIso) : parseDate(charge.startStr));
  const startMinute = startDate && !Number.isNaN(startDate.getTime())
    ? String(Math.floor(startDate.getTime() / 60000))
    : '';
  const person = rechargePersonIdentity(charge);
  // Linha repetida na MESMA planilha, mas com fim/energia/valor diferentes, é outra
  // recarga (ver markDistinctRepeatedRows). As demais mantêm a chave de sempre.
  const repeat = safeText(charge._repeatSeq).trim();
  if (startMinute) {
    return [
      'session',
      workId || normalizeHeaderName(station),
      normalizeHeaderName(station),
      startMinute,
      person
    ].concat(repeat ? [repeat] : []).join('|');
  }
  const id = safeText(charge.id).trim();
  const platform = normalizeStationForCompare(charge.sourcePlatform || charge.platform || '');
  if (id) return `id:${platform}:${id}`;
  return [
    'fallback',
    workId,
    normalizeHeaderName(station || charge.station),
    normalizeHeaderName(charge.connType),
    person,
    Number(charge.energyKWh || 0).toFixed(3)
  ].join('|');
}

// Nova plataforma (26/09/2026): a mesma exportação nunca lista a mesma recarga
// duas vezes. Linhas com a mesma chave (mesmo minuto de início e mesmo motorista)
// só são a mesma recarga se forem idênticas; se o fim, a energia, o valor, o
// carregador ou o status mudarem, são tentativas/recargas distintas. A versão que
// o motor sempre preferiu (preferredRechargeVersion) fica com a chave original,
// para continuar casando com o que já está gravado; as outras recebem _repeatSeq
// e um id próprio (source_session_id único no Supabase). Entre planilhas
// diferentes nada muda: reexportar a mesma recarga continua consolidando.

function markDistinctRepeatedRows(charges = []) {
  const groups = new Map();
  charges.forEach(charge => {
    const key = rechargeUniqueKey(charge);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(charge);
  });
  let marked = 0;
  groups.forEach(list => {
    if (list.length < 2) return;
    const signature = charge => [
      safeText(charge.endStr).trim(), Number(charge.energyKWh || 0).toFixed(3), Number(charge.revenue || 0).toFixed(2),
      normalizeHeaderName(charge.connType), normalizeHeaderName(charge.paymentStatus), safeText(charge.duration).trim()
    ].join('|');
    const distinct = new Map();
    list.forEach(charge => { if (!distinct.has(signature(charge))) distinct.set(signature(charge), charge); });
    if (distinct.size < 2) return;
    // Ordem estável: o resultado não depende da ordem das linhas no arquivo.
    const versions = [...distinct.values()].sort((a, b) => signature(a).localeCompare(signature(b)));
    const primary = versions.reduce((best, charge) => preferredRechargeVersion(best, charge) === charge ? charge : best);
    const suffixBySignature = new Map();
    versions.filter(v => v !== primary).forEach(v => {
      const end = safeText(v.endStr).trim();
      const sameEnd = versions.filter(o => o !== primary && safeText(o.endStr).trim() === end);
      suffixBySignature.set(signature(v), `fim:${end || 'sem-fim'}` + (sameEnd.length > 1 ? `#${sameEnd.indexOf(v) + 1}` : ''));
    });
    list.forEach(charge => {
      const suffix = suffixBySignature.get(signature(charge));
      if (!suffix) return;
      charge._repeatSeq = suffix;
      charge.id = `${safeText(charge.id).trim()}|${suffix}`;
      marked++;
    });
  });
  return marked;
}

function preferredRechargeVersion(current = {}, candidate = {}) {
  const currentEnergy = Number(current.energyKWh || 0);
  const candidateEnergy = Number(candidate.energyKWh || 0);
  if (Math.abs(candidateEnergy - currentEnergy) > 0.01) {
    return candidateEnergy > currentEnergy ? candidate : current;
  }
  const currentEnd = current.endDate && typeof current.endDate.getTime === 'function'
    ? current.endDate
    : (current.endIso ? new Date(current.endIso) : parseDate(current.endStr));
  const candidateEnd = candidate.endDate && typeof candidate.endDate.getTime === 'function'
    ? candidate.endDate
    : (candidate.endIso ? new Date(candidate.endIso) : parseDate(candidate.endStr));
  const currentEndMs = currentEnd && !Number.isNaN(currentEnd.getTime()) ? currentEnd.getTime() : 0;
  const candidateEndMs = candidateEnd && !Number.isNaN(candidateEnd.getTime()) ? candidateEnd.getTime() : 0;
  if (candidateEndMs !== currentEndMs) return candidateEndMs > currentEndMs ? candidate : current;
  const detailScore = charge => [
    charge.userEmail,
    charge.userPhone,
    charge.vehicleBrand,
    charge.vehicleModel,
    charge.voucher,
    charge.paymentStatus,
    charge.sourcePlatform
  ].filter(value => safeText(value).trim()).length;
  const currentDetails = detailScore(current);
  const candidateDetails = detailScore(candidate);
  if (candidateDetails !== currentDetails) return candidateDetails > currentDetails ? candidate : current;
  return candidate;
}

function dedupeChargesByUniqueKey(charges = []) {
  const byKey = new Map();
  charges.forEach(charge => {
    const key = rechargeUniqueKey(charge);
    if (!key) return;
    const current = byKey.get(key);
    byKey.set(key, current ? preferredRechargeVersion(current, charge) : charge);
  });
  return [...byKey.values()];
}

function excelSerialToDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (window.XLSX?.SSF?.parse_date_code) {
    const parsed = window.XLSX.SSF.parse_date_code(n);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
  }
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function rowHasData(row = []) {
  return row.some(value => String(value ?? '').trim() !== '');
}

function parseCsvRows(text = '') {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(value);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (typeof s === 'number') return excelSerialToDate(s);
  const raw = String(s).trim();
  let m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6] || 0));
  m = raw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6] || 0));
  m = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (/^\d+(\.\d+)?$/.test(raw)) return excelSerialToDate(raw);
  return null;
}

function durToHours(d) {
  if (!d) return 0;
  const raw = String(d).trim();
  const verbose = raw.match(/(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+(?:[.,]\d+)?)\s*m)?\s*(?:(\d+(?:[.,]\d+)?)\s*s)?/i);
  if (verbose && (verbose[1] || verbose[2] || verbose[3])) {
    return parseNumber(verbose[1]) + parseNumber(verbose[2]) / 60 + parseNumber(verbose[3]) / 3600;
  }
  const p = raw.split(':');
  return (+p[0]||0) + (+p[1]||0)/60 + (+p[2]||0)/3600;
}

function formatRechargeDuration(hours = 0) {
  const totalMinutes = Math.round(Number(hours || 0) * 60);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '—';
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return wholeHours ? `${wholeHours}h ${String(minutes).padStart(2, '0')}min` : `${minutes}min`;
}

function idleToMin(s) {
  if (!s) return 0;
  const raw = String(s).trim();
  const verbose = raw.match(/(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+(?:[.,]\d+)?)\s*m)?\s*(?:(\d+(?:[.,]\d+)?)\s*s)?/i);
  if (verbose && (verbose[1] || verbose[2] || verbose[3])) {
    return parseNumber(verbose[1]) * 60 + parseNumber(verbose[2]) + parseNumber(verbose[3]) / 60;
  }
  const p = raw.split(':');
  return (+p[0]||0)*60 + (+p[1]||0) + (+p[2]||0)/60;
}

// ── Helpers de mês ────────────────────────────────────────

function monthKey(date) {
  if (!date) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function monthCanBeClosed(mk, now = new Date()) {
  if (!mk || mk === 'unknown') return false;
  const currentMk = monthKey(now);
  if (mk < currentMk) return true;
  if (mk > currentMk) return false;
  return now.getDate() >= daysInMonth(now.getFullYear(), now.getMonth() + 1);
}

function monthHasEffectiveClosing(mk) {
  return monthCanBeClosed(mk) && !!monthlyClosings?.[mk] && closingMatchesMonth(monthlyClosings[mk], mk);
}
// Um mês só é válido de 2015 até o ano que vem. Impede que uma data
// corrompida (ex.: ano 3000) gere um mês fantasma tipo "3000-01" que
// depois faz as séries mensais iterarem milhares de meses e congelarem.

function isPlausibleMonthKey(mk) {
  if (!/^\d{4}-\d{2}$/.test(String(mk || ''))) return false;
  const year = Number(String(mk).slice(0, 4));
  return year >= 2015 && year <= new Date().getFullYear() + 1;
}

function resolveChargeMonthKey(charge) {
  const realMonth = monthKey(charge?.startDate);
  if (realMonth !== 'unknown' && isPlausibleMonthKey(realMonth)) return realMonth;
  // startDate ausente ou corrompida: usa o mês do arquivo importado, se válido.
  if (isPlausibleMonthKey(charge?._month)) return charge._month;
  return 'unknown';
}

function chargeMonthKey(charge) {
  if (!charge || typeof charge !== 'object') return resolveChargeMonthKey(charge);
  // Cache preso à própria função (em vez de um `const` de módulo) para nunca
  // esbarrar em temporal dead zone, não importa a ordem/momento de chamada.
  const cache = chargeMonthKey._cache || (chargeMonthKey._cache = new WeakMap());
  const cached = cache.get(charge);
  if (cached !== undefined) return cached;
  const mk = resolveChargeMonthKey(charge);
  cache.set(charge, mk);
  return mk;
}

// Índice de recargas por mês, reconstruído só quando `allCharges` muda de
// referência (ela é sempre reatribuída, nunca mutada in-place). Substitui os
// `chargesForMonth(mk)` que rodavam dentro de
// loops sobre os meses (custo O(meses × recargas)). Devolve sempre uma cópia
// nova, com a mesma ordem do filter original, para preservar o comportamento.

let _chargesByMonthIndex = null;

let _chargesByMonthSrc = null;

function chargesForMonth(mk) {
  if (_chargesByMonthSrc !== allCharges || !_chargesByMonthIndex) {
    const idx = new Map();
    for (const charge of allCharges) {
      const key = chargeMonthKey(charge);
      let bucket = idx.get(key);
      if (!bucket) { bucket = []; idx.set(key, bucket); }
      bucket.push(charge);
    }
    _chargesByMonthIndex = idx;
    _chargesByMonthSrc = allCharges;
  }
  const bucket = _chargesByMonthIndex.get(mk);
  return bucket ? bucket.slice() : [];
}

function monthLabel(key) {
  const n = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const [y, m] = key.split('-');
  return `${n[+m-1]}/${y}`;
}

function daysInMonth(y, m) { return new Date(+y, +m, 0).getDate(); }

function getMonths() {
  const validClosings = Object.keys(monthlyClosings || {}).filter(monthHasEffectiveClosing);
  const current = new Date();
  const currentMk = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
  const financeMonths = [...new Set([
    ...Object.keys(financialSettings || {}),
    ...Object.keys(financeStoreForScope())
  ])].filter(mk => /^\d{4}-\d{2}$/.test(mk));
  return [...new Set([
    ...allCharges.map(chargeMonthKey),
    ...validClosings,
    ...financeMonths,
    ...(currentWorkId ? [currentMk] : [])
  ])]
    .filter(isPlausibleMonthKey).sort();
}

// ── Formatadores ──────────────────────────────────────────

function fmtPct(v)  { return (+v).toFixed(2).replace('.', ',') + '%'; }

function buildMonthClosing(mk) {
  const charges = chargesForMonth(mk);
  if (!charges.length) return null;
  const users = new Set(charges.map(c => c.userEmail || c.userName).filter(Boolean));
  const energy = charges.reduce((sum, c) => sum + c.energyKWh, 0);
  const revenue = charges.reduce((sum, c) => sum + c.revenue, 0);
  const dates = charges.map(c => c.startDate).filter(Boolean).sort((a, b) => a - b);
  const files = [...new Set(charges.map(c => c._file).filter(Boolean))];
  const stations = [...new Set(charges.map(c => c.station).filter(Boolean))];
  const power = getPower();
  const monthToDateWindow = periodWindow(charges, mk, 'mtd');
  const occInterval = occByInterval(charges, power, monthToDateWindow);
  const occFull = occByFullMonth(charges, mk);
  return {
    month: mk,
    workId: currentWorkId,
    workName: currentWorkName,
    closedAt: new Date().toISOString(),
    source: 'latest_upload',
    charges: charges.length,
    clients: users.size,
    energyKWh: energy,
    revenue,
    averageTicket: charges.length ? revenue / charges.length : 0,
    occupancyIntervalPct: occInterval.pct,
    occupancyFullMonthPct: occFull.pct,
    power,
    firstDate: dates[0] ? dates[0].toISOString() : '',
    lastDate: dates[dates.length - 1] ? dates[dates.length - 1].toISOString() : '',
    intervalHours: monthToDateWindow.hours,
    stations,
    files
  };
}

function monthLiveSummary(mk, power = getPower()) {
  const charges = chargesForMonth(mk);
  if (!charges.length) return null;
  const rev = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const occI = occByInterval(charges, power, periodWindow(charges, mk, 'mtd'));
  const occF = occByFullMonth(charges, mk);
  const clients = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  return {
    label: monthLabel(mk), mk, rev, energy,
    occI: occI.pct, occF: occF.pct,
    count: charges.length, clients,
    avgTkt: charges.length ? rev / charges.length : 0
  };
}

function closingMatchesLiveSummary(closing, summary) {
  if (!closing || !summary) return false;
  const sameRevenue = Math.round(Number(closing.revenue || 0) * 100) === Math.round(Number(summary.rev || 0) * 100);
  const sameEnergy = Math.round(Number(closing.energyKWh || 0) * 1000) === Math.round(Number(summary.energy || 0) * 1000);
  return Number(closing.charges || 0) === Number(summary.count || 0)
    && Number(closing.clients || 0) === Number(summary.clients || 0)
    && sameRevenue && sameEnergy;
}

function reconcileMonthlyClosingsWithCharges() {
  let changed = false;
  const next = { ...(monthlyClosings || {}) };
  Object.entries(next).forEach(([mk, closing]) => {
    if (!monthCanBeClosed(mk) || !closingMatchesMonth(closing, mk)) return;
    const live = monthLiveSummary(mk);
    if (!live || closingMatchesLiveSummary(closing, live)) return;
    const refreshed = buildMonthClosing(mk);
    if (!refreshed) return;
    next[mk] = {
      ...refreshed,
      source: closing.source === 'manual' || closing.source === 'manual-reconciled' ? 'manual-reconciled' : 'latest_upload',
      closedAt: closing.closedAt || refreshed.closedAt,
      originalClosedAt: closing.originalClosedAt || closing.closedAt || '',
      reconciledAt: new Date().toISOString()
    };
    changed = true;
  });
  if (changed) monthlyClosings = next;
  return changed;
}

function closingMatchesMonth(closing, mk = closing?.month) {
  if (!closing || !mk) return false;
  const first = parseDate(closing.firstDate);
  const last = parseDate(closing.lastDate);
  if (!first && !last) return false;
  const firstMonth = first ? monthKey(first) : '';
  const lastMonth = last ? monthKey(last) : '';
  if (firstMonth && firstMonth !== mk) return false;
  if (lastMonth && lastMonth !== mk) return false;
  return true;
}

function defaultFinanceSettings() {
  return {
    operationModel: 'uby',
    managementPct: 5,
    p3SocietyPct: 0,
    p3AcEquityPct: 0,
    p3DcEquityPct: 0,
    platformPct: 0,
    ubyRoyaltyPct: 0,
    taxRatePct: 0,
    energyCostPerKWh: 0,
    energyBillingMode: 'copel',
    energyCopelAmount: 0,
    energyCopelKWh: 0,
    energyLeaseCreditedKWh: 0,
    energyLeaseRatePerKWh: 0,
    energyCopelDueDay: 0,
    energyLeaseDueDay: 10,
    investmentValue: 0,
    investorQuotaPct: 100,
    saRetentionPct: 0,
    targetOccPct: 0,
    targetRevenuePerKWh: 0,
    ownerEnergyRate: 0,
    ownerTransferMode: 'gross',
    ownerRevenueSharePct: 0,
    ownerNetProfitSharePct: 0,
    costPlanningKWh: 0,
    costItems: {},
    revenueItems: {},
    costRules: [],
    revenueRules: []
  };
}

function financeRuleField(kind = 'cost') {
  return kind === 'revenue' ? 'revenueRules' : 'costRules';
}

function financeRuleCatalog(kind = 'cost') {
  return kind === 'revenue' ? FINANCE_EXTRA_REVENUE_ITEMS : FINANCE_COST_ITEMS;
}

function financeRuleLegacyField(kind = 'cost') {
  return kind === 'revenue' ? 'revenueItems' : 'costItems';
}

function normalizeFinanceRules(settings = {}, kind = 'cost') {
  const field = financeRuleField(kind);
  const legacyField = financeRuleLegacyField(kind);
  const catalog = financeRuleCatalog(kind);
  const saved = Array.isArray(settings?.[field]) ? settings[field] : [];
  const legacy = settings?.[legacyField] || {};
  const savedById = new Map(saved.map(rule => [String(rule?.id || ''), rule]).filter(([id]) => id));
  const catalogIds = new Set(catalog.map(([id]) => String(id)));
  const normalized = catalog.map(([id, defaultLabel]) => {
    const stored = savedById.get(String(id));
    const legacyValue = Number(legacy?.[id] || 0);
    return {
      id: String(id),
      label: safeText(stored?.label || defaultLabel),
      enabled: stored ? stored.enabled !== false : legacyValue > 0,
      basis: FINANCE_RULE_BASIS.some(([basis]) => basis === stored?.basis) ? stored.basis : 'fixed',
      value: Number(stored?.value ?? legacyValue ?? 0) || 0,
      scope: kind === 'revenue' && (stored?.scope === 'non_operational' || (!stored && id === 'advertising')) ? 'non_operational' : 'operational',
      custom: false
    };
  });
  saved.forEach((rule, index) => {
    const id = String(rule?.id || `custom-${kind}-${index}`);
    if (!id || catalogIds.has(id)) return;
    normalized.push({
      id,
      label: safeText(rule?.label || (kind === 'revenue' ? 'Receita personalizada' : 'Custo personalizado')),
      enabled: rule?.enabled !== false,
      basis: FINANCE_RULE_BASIS.some(([basis]) => basis === rule?.basis) ? rule.basis : 'fixed',
      value: Number(rule?.value || 0),
      scope: kind === 'revenue' && rule?.scope === 'non_operational' ? 'non_operational' : 'operational',
      custom: true
    });
  });
  return normalized;
}

function financeChargerStorageKey(stationName = currentStationReportName) {
  const station = safeText(stationName).trim();
  return station ? normalizeStationForCompare(canonicalStationNameForWork(currentWorkId, station, currentWorkName)) : '';
}

function financeStoreForScope(root = financialSettings, stationName = currentStationReportName) {
  const key = financeChargerStorageKey(stationName);
  if (!key) return root || {};
  return root?.chargers?.[key] || {};
}

function financeSettingsForUbyRow(row = {}, mk = '') {
  const root = allRechargeRecords[row.workId]?.financialSettings || allRechargeRecords[row.workId]?.summary?.financialSettings || {};
  const stationName = row.stationName || row.station || row.workName || '';
  const key = normalizeStationForCompare(canonicalStationNameForWork(row.workId, stationName, row.workName));
  const scoped = root?.chargers?.[key] || {};
  return window.UBY_FINANCE_ENGINE.resolveMonthlySettings(defaultFinanceSettings(), root, scoped, mk).settings;
}

function financeReportTuple(report = {}) {
  return [report.workId, report.stationKey || '', report.reportType, report.periodKey, Number(report.version || 1)].join('|');
}

function sortFinanceReports(items = []) {
  return [...items].sort((a, b) => String(b.periodEnd || '').localeCompare(String(a.periodEnd || '')) || Number(b.version || 1) - Number(a.version || 1));
}

function readLocalFinanceReports() {
  const stored = readJson(FINANCE_REPORTS_LOCAL_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function writeLocalFinanceReports(items = financeReportArchive) {
  // Cópia local é só cache (a base guarda tudo): mantém os 30 mais recentes, todos os de área e, sem limite,
  // os que só existem aqui (ids "local-…"), para o navegador não lotar e derrubar a sessão do banco.
  const sorted = sortFinanceReports(items);
  const keepAlways = item => /^local-/.test(String(item?.id || '')) || item?.reportType === 'partner_area';
  const recent = sorted.filter(item => !keepAlways(item)).slice(0, 30);
  writeJson(FINANCE_REPORTS_LOCAL_KEY, sortFinanceReports([...sorted.filter(keepAlways), ...recent]));
}

function isLegacyCrossMonthAreaReport(report = {}) {
  if (report.reportType !== 'partner_area') return false;
  const start = String(report.periodStart || report.payload?.period?.start || '');
  const end = String(report.periodEnd || report.payload?.period?.end || '');
  const legacyDatedKey = /^\d{4}-\d{2}-\d{2}$/.test(String(report.periodKey || ''));
  return legacyDatedKey || (
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    start.slice(0, 7) !== end.slice(0, 7)
  );
}

function mergeFinanceReportArchive(...collections) {
  const merged = new Map();
  collections.flat().filter(report => report && !isLegacyCrossMonthAreaReport(report)).forEach(report => {
    const key = financeReportTuple(report);
    const current = merged.get(key);
    if (!current || (!String(report.id || '').startsWith('local-') && String(current.id || '').startsWith('local-'))) merged.set(key, report);
  });
  financeReportArchive = sortFinanceReports([...merged.values()]);
  return financeReportArchive;
}

async function loadFinanceReportArchive(force = false) {
  if (financeReportArchiveLoaded && !force) return financeReportArchive;
  if (financeReportArchivePromise && !force) return financeReportArchivePromise;
  financeReportArchivePromise = (async () => {
    const local = readLocalFinanceReports();
    let cloud = [];
    let cloudLoaded = false;
    if (window.UBY_SUPABASE?.loadFinanceReports) {
      try {
        cloud = await window.UBY_SUPABASE.loadFinanceReports();
        cloudLoaded = true;
      } catch (err) {
        console.warn('Historico financeiro em nuvem indisponivel:', err);
      }
    }
    // Quando a nuvem responde, ela e a fonte de verdade para relatorios ja sincronizados.
    // Mantemos apenas rascunhos locais ainda sem ID remoto, evitando que um cache antigo
    // reintroduza um relatorio excluido em outro navegador.
    const localFallback = cloudLoaded
      ? local.filter(report => String(report?.id || '').startsWith('local-'))
      : local;
    mergeFinanceReportArchive(localFallback, cloud);
    writeLocalFinanceReports(financeReportArchive);
    financeReportArchiveLoaded = true;
    return financeReportArchive;
  })().finally(() => { financeReportArchivePromise = null; });
  return financeReportArchivePromise;
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function previousMonthEnergyForFinance(mk = '', charges = allCharges) {
  const months = [...new Set((charges || []).map(chargeMonthKey).filter(key => key !== 'unknown' && key < mk))].sort();
  const previous = months.at(-1);
  if (!previous) return 0;
  return (charges || []).filter(charge => chargeMonthKey(charge) === previous).reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
}

function financePlanningContext(charges = [], mk = '', settings = {}, historyCharges = charges, powerOverride = null) {
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const revenue = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const validCharges = charges.filter(charge => Number(charge.energyKWh || 0) > 0);
  const averageEnergyPerCharge = validCharges.length ? validCharges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0) / validCharges.length : 0;
  const target = mk ? targetOccupationMetrics(charges, mk, settings) : { fullMonthTargetEnergy: 0, targetRevenuePerKWh: 0 };
  const manualKWh = Math.max(Number(settings.costPlanningKWh || 0), 0);
  const [targetYear, targetMonth] = String(mk || '').split('-').map(Number);
  const targetPower = Number(powerOverride);
  const targetKWhByPower = Number.isFinite(targetPower) && targetPower > 0 && targetYear && targetMonth
    ? targetPower * daysInMonth(targetYear, targetMonth) * 24 * Math.max(Number(settings.targetOccPct || 0), 0) / 100
    : 0;
  const targetKWh = Math.max(targetKWhByPower || Number(target.fullMonthTargetEnergy || 0), 0);
  const previousKWh = Math.max(previousMonthEnergyForFinance(mk, historyCharges), 0);
  const currentKWh = Math.max(energy, 0);
  let planningKWh = manualKWh;
  let source = 'Base informada manualmente';
  if (!planningKWh && targetKWh) {
    planningKWh = targetKWh;
    source = 'Meta mensal de ocupacao';
  } else if (!planningKWh && previousKWh) {
    planningKWh = previousKWh;
    source = 'Energia do mes anterior';
  } else if (!planningKWh && currentKWh) {
    planningKWh = currentKWh;
    source = 'Volume atual do periodo';
  } else if (!planningKWh) {
    source = 'Defina a base inicial de kWh';
  }
  const realSalePrice = energy > 0 ? revenue / energy : 0;
  const targetSalePrice = Math.max(Number(settings.targetRevenuePerKWh || target.targetRevenuePerKWh || 0), 0);
  const salePricePerKWh = realSalePrice || targetSalePrice;
  const planningRevenue = planningKWh * salePricePerKWh;
  const planningCharges = averageEnergyPerCharge > 0 ? planningKWh / averageEnergyPerCharge : 0;
  return {
    mk,
    energy,
    revenue,
    count: charges.length,
    averageEnergyPerCharge,
    planningKWh,
    planningRevenue,
    planningCharges,
    salePricePerKWh,
    realSalePrice,
    targetSalePrice,
    source
  };
}

function evaluateFinanceRules(rules = [], context = {}) {
  return window.UBY_FINANCE_ENGINE.evaluateRules(rules, context);
}

function financeVariableCostPerKWh(rules = [], context = {}) {
  return window.UBY_FINANCE_ENGINE.variablePerKWh(rules, context);
}

function financeFixedRuleTotal(rules = []) {
  return window.UBY_FINANCE_ENGINE.fixedTotal(rules);
}

function targetOccupationMetrics(charges, mk, settings = {}) {
  const targetOccPct = Number(settings.targetOccPct || 0);
  const window = periodWindow(charges, mk, 'mtd');
  const fullMonthWindow = periodWindow(charges, mk, 'closed');
  const occ = occByInterval(charges, undefined, window);
  const fullMonthOcc = occByInterval(charges, undefined, fullMonthWindow);
  const revenue = charges.reduce((sum, charge) => sum + charge.revenue, 0);
  const energy = charges.reduce((sum, charge) => sum + charge.energyKWh, 0);
  const avgKWh = charges.length ? energy / charges.length : 0;
  const realRevenuePerKWh = energy > 0 ? revenue / energy : 0;
  const targetRevenuePerKWh = Number(settings.targetRevenuePerKWh || 0) > 0 ? Number(settings.targetRevenuePerKWh || 0) : realRevenuePerKWh;
  const targetEnergy = occ.maxKWh * targetOccPct / 100;
  const targetRevenue = targetEnergy * targetRevenuePerKWh;
  const targetCharges = avgKWh > 0 ? targetEnergy / avgKWh : 0;
  const fullMonthTargetEnergy = fullMonthOcc.maxKWh * targetOccPct / 100;
  const fullMonthTargetRevenue = fullMonthTargetEnergy * targetRevenuePerKWh;
  const fullMonthTargetCharges = avgKWh > 0 ? fullMonthTargetEnergy / avgKWh : 0;
  return {
    targetOccPct,
    realOccPct: occ.pct,
    maxKWh: occ.maxKWh,
    power: occ.power,
    hours: occ.hours,
    fullMonthHours: fullMonthOcc.hours,
    fullMonthMaxKWh: fullMonthOcc.maxKWh,
    targetEnergy,
    targetRevenue,
    targetCharges,
    fullMonthTargetEnergy,
    fullMonthTargetRevenue,
    fullMonthTargetCharges,
    targetRevenuePerKWh,
    energyGap: targetEnergy - energy,
    revenueGap: targetRevenue - revenue,
    chargeGap: targetCharges - charges.length
  };
}

function normalizeOperationModel(model) {
  const raw = String(model || 'uby').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (['management_only', 'management', 'gestao', 'gestao_p3', 'p3_management', 'p3_gestao'].includes(raw)) return 'management_only';
  if (['third_party_management', 'gestao_royalty', 'gestao_com_royalty', 'gestao_p3_uby', 'terceiro_com_marca_uby'].includes(raw)) return 'third_party_management';
  if (['p3_society', 'p3society', 'p3_parceria', 'parceria', 'sociedade', 'ativo_p3'].includes(raw)) return 'p3_society';
  if (['hybrid', 'hibrido', 'hibrido_ac_dc'].includes(raw)) return 'hybrid';
  return 'uby';
}

function operationModelLabel(model) {
  return {
    uby: 'Ativo UBY',
    p3_society: 'Parceria P3',
    hybrid: 'Ativo UBY hibrido',
    management_only: 'Gestao P3 (sem UBY)',
    third_party_management: 'Gestao P3 + royalty UBY'
  }[normalizeOperationModel(model)] || 'Ativo UBY';
}

function financeForCharges(charges, settings = {}, options = {}) {
  const cfg = { ...defaultFinanceSettings(), ...settings };
  if (!settings.operationModel && (Number(settings.p3AcEquityPct || 0) > 0 || Number(settings.p3DcEquityPct || 0) > 0)) cfg.operationModel = 'hybrid';
  cfg.costItems = { ...(settings.costItems || {}), ...(settings.extraCosts || {}) };
  if (Number(settings.otherCosts || 0) > 0 && !cfg.costItems.otherCostsLegacy) cfg.costItems.otherCostsLegacy = Number(settings.otherCosts || 0);
  cfg.revenueItems = { ...(settings.revenueItems || {}), ...(settings.extraRevenue || {}) };
  cfg.costRules = normalizeFinanceRules({ ...settings, costItems: cfg.costItems }, 'cost');
  cfg.revenueRules = normalizeFinanceRules({ ...settings, revenueItems: cfg.revenueItems }, 'revenue');
  const revenue = charges.reduce((sum, c) => sum + c.revenue, 0);
  const energy = charges.reduce((sum, c) => sum + c.energyKWh, 0);
  const stationName = options.stationName || currentStationReportName || charges[0]?.station || currentWorkName;
  const courtesyConfig = options.courtesyConfig || stationAvailabilityFor(options.workId || currentWorkId, stationName, options.workName || currentWorkName);
  const courtesy = courtesyFinanceBreakdown(charges, courtesyConfig, cfg.energyCostPerKWh);
  const commercialEnergy = courtesy.treatment === 'partner_absorbed' ? courtesy.commercialEnergy : energy;
  const acRevenue = charges.filter(c => chargerKind(c) === 'ac').reduce((sum, c) => sum + c.revenue, 0);
  const dcRevenue = charges.filter(c => chargerKind(c) === 'dc').reduce((sum, c) => sum + c.revenue, 0);
  const unknownRevenue = Math.max(revenue - acRevenue - dcRevenue, 0);
  const model = normalizeOperationModel(cfg.operationModel);
  cfg.operationModel = model;
  // A receita importada das plataformas representa exclusivamente a operação de
  // carregamento (recargas e eventuais cobranças de ociosidade já trazidas no
  // valor da sessão). A retenção de plataforma incide somente sobre essa base.
  const chargingRevenue = revenue;
  const platform = chargingRevenue * cfg.platformPct / 100;
  const ubyRoyalty = model === 'third_party_management' ? revenue * cfg.ubyRoyaltyPct / 100 : 0;
  const taxes = revenue * cfg.taxRatePct / 100;
  const energyComposition = window.UBY_FINANCE_ENGINE.calculateEnergyComposition({
    mode: cfg.energyBillingMode, copelAmount: cfg.energyCopelAmount, copelKWh: cfg.energyCopelKWh,
    creditedKWh: cfg.energyLeaseCreditedKWh, leaseRatePerKWh: cfg.energyLeaseRatePerKWh
  });
  // Quando há fatura mensal, o DRE usa o desembolso real da competência. A
  // tarifa calculada permanece disponível para leitura, comparação e projeção.
  const energyCost = energyComposition.totalCost > 0 ? energyComposition.totalCost : commercialEnergy * cfg.energyCostPerKWh;
  const mk = options.monthKey || chargeMonthKey(charges[0] || {}) || financeMonthKey();
  const planning = financePlanningContext(charges, mk === 'unknown' ? financeMonthKey() : mk, cfg, options.historyCharges || charges, options.power);
  const costEvaluation = evaluateFinanceRules(cfg.costRules, planning);
  const revenueEvaluation = evaluateFinanceRules(cfg.revenueRules, planning);
  // Marketing e contratos entram somente no fechamento financeiro. Eles não
  // representam demanda de recarga e, portanto, não podem alterar R$/kWh,
  // ocupação, break-even ou qualquer projeção da operação de recargas.
  const marketingRuleDetails = revenueEvaluation.details.filter(item => item.scope === 'non_operational');
  const operationalRevenueRuleDetails = revenueEvaluation.details.filter(item => item.scope !== 'non_operational');
  const marketingRevenue = marketingRuleDetails.reduce((sum, item) => sum + Number(item.actual || 0), 0);
  const marketingPlanned = marketingRuleDetails.reduce((sum, item) => sum + Number(item.planned || 0), 0);
  const operationalExtraRevenue = operationalRevenueRuleDetails.reduce((sum, item) => sum + Number(item.actual || 0), 0);
  const plannedOperationalExtraRevenue = operationalRevenueRuleDetails.reduce((sum, item) => sum + Number(item.planned || 0), 0);
  // Custos compartilhados da matriz chegam jÃ¡ rateados para este carregador.
  // Eles nÃ£o entram em costRules porque a matriz tem vigÃªncia e rateio prÃ³prios.
  const matrizCostItems = (Array.isArray(options.matrizCostItems) ? options.matrizCostItems : [])
    .map(item => ({
      id: String(item?.id || `matriz-${Math.random().toString(36).slice(2)}`),
      label: safeText(item?.label || item?.name || 'Custo da matriz'),
      category: safeText(item?.category || ''),
      amount: Math.max(0, Number(item?.amount || 0)),
      cashAmount: Math.max(0, Number(item?.cashAmount || 0)),
      coverageMonths: Math.max(1, Number(item?.coverageMonths || 1)),
      rule: safeText(item?.rule || 'Rateio da matriz')
    }))
    .filter(item => item.amount > 0);
  const matrizCost = matrizCostItems.reduce((sum, item) => sum + item.amount, 0);
  const matrizTaxCost = matrizCostItems
    .filter(item => /tribut|impost|taxa/i.test(`${item.category || ''} ${item.label || ''}`))
    .reduce((sum, item) => sum + item.amount, 0);
  const matrizCash = matrizCostItems.reduce((sum, item) => sum + item.cashAmount, 0);
  const matrizCostDetails = matrizCostItems.map(item => ({
    id: `matriz-${item.id}`,
    label: /tribut|impost|taxa/i.test(`${item.category || ''} ${item.label || ''}`) ? `Tributo centralizado — ${item.label}` : item.label,
    enabled: true,
    basis: 'fixed',
    value: item.amount,
    actual: item.amount,
    planned: item.amount,
    cashAmount: item.cashAmount,
    coverageMonths: item.coverageMonths,
    actualPerKWh: planning.energy > 0 ? item.amount / planning.energy : null,
    plannedPerKWh: planning.planningKWh > 0 ? item.amount / planning.planningKWh : null,
    displayRule: item.rule,
    isMatrix: true
  }));
  const localExtraCosts = costEvaluation.actual;
  const extraCosts = localExtraCosts + matrizCost;
  const extraRevenue = operationalExtraRevenue;
  // Marketing, mídia, patrocínios e demais receitas não operacionais não
  // alteram ocupação, ticket ou projeção de recargas. Financeiramente, porém,
  // compõem o faturamento total sobre o qual incidem gestão P3 e área.
  const totalRevenue = chargingRevenue + extraRevenue + marketingRevenue;
  const management = totalRevenue * cfg.managementPct / 100;
  const costs = energyCost + extraCosts + taxes;
  const preAreaNet = totalRevenue - management - platform - ubyRoyalty - costs;
  const areaEligible = model === 'uby' || model === 'hybrid';
  const areaSharePct = cfg.ownerTransferMode === 'net' ? Number(cfg.ownerNetProfitSharePct || 0) : Number(cfg.ownerRevenueSharePct || 0);
  // A regra vigente é percentual sobre todo o faturamento. Mantemos a escolha
  // legada apenas para identificar qual percentual já salvo deve ser usado.
  const areaShareBase = totalRevenue;
  const areaParticipation = areaEligible ? areaShareBase * areaSharePct / 100 : 0;
  const operationNet = preAreaNet - areaParticipation;
  const splitNet = partRevenue => {
    const ratio = revenue > 0 ? partRevenue / revenue : 0;
    return {
      revenue: partRevenue,
      net: partRevenue + extraRevenue * ratio - management * ratio - platform * ratio - (costs + areaParticipation) * ratio
    };
  };
  const ac = splitNet(acRevenue);
  const dc = splitNet(dcRevenue);
  const unknown = splitNet(unknownRevenue);
  let ubyNet = 0;
  let p3SocietyProfit = 0;
  let partnerShare = 0;

  if (model === 'p3_society') {
    p3SocietyProfit = operationNet * cfg.p3SocietyPct / 100;
    partnerShare = operationNet - p3SocietyProfit;
  } else if (model === 'management_only') {
    partnerShare = operationNet;
  } else if (model === 'third_party_management') {
    // O ponto continua sendo do parceiro. P3 recebe a gestao e UBY recebe
    // apenas o royalty de marca, ambos separados do custo de plataforma.
    partnerShare = operationNet;
    ubyNet = ubyRoyalty;
  } else if (model === 'hybrid') {
    const acP3 = ac.net * cfg.p3AcEquityPct / 100;
    const dcP3 = dc.net * cfg.p3DcEquityPct / 100;
    p3SocietyProfit = acP3 + dcP3;
    if (cfg.p3AcEquityPct > 0) partnerShare += ac.net - acP3; else ubyNet += ac.net;
    if (cfg.p3DcEquityPct > 0) partnerShare += dc.net - dcP3; else ubyNet += dc.net;
    ubyNet += unknown.net;
  } else {
    ubyNet = operationNet;
  }

  const p3AcEquity = model === 'hybrid' ? ac.net * cfg.p3AcEquityPct / 100 : 0;
  const p3DcEquity = model === 'hybrid' ? dc.net * cfg.p3DcEquityPct / 100 : 0;
  const p3Gross = management + p3SocietyProfit;
  // Em sociedade externa, o investimento informado e o capital total do ponto.
  // O payback da P3 deve considerar apenas o capital que ela efetivamente aportou.
  const p3InvestmentValue = model === 'p3_society'
    ? Math.max(cfg.investmentValue * cfg.p3SocietyPct / 100, 0)
    : cfg.investmentValue;
  const partnerInvestmentValue = model === 'p3_society'
    ? Math.max(cfg.investmentValue - p3InvestmentValue, 0)
    : 0;
  const isUbyInvestorAsset = model === 'uby' || model === 'hybrid';
  const saRetention = Math.max(ubyNet, 0) * cfg.saRetentionPct / 100;
  const ubyDistributable = Math.max(ubyNet - saRetention, 0);
  // Cotistas UBY participam apenas dos ativos da UBY. Em gestao de terceiros,
  // o royalty continua receita da marca, mas nao vira distribuicao de cotas.
  const investorDistribution = isUbyInvestorAsset ? ubyDistributable * cfg.investorQuotaPct / 100 : 0;
  // Em sociedade e em operacao somente de gestao, o parceiro recebe o lucro
  // liquido diretamente. Isso e uma distribuicao real do periodo, ainda que
  // nao passe pela estrutura de cotas da UBY.
  const directPartnerDistribution = model === 'p3_society' || model === 'management_only' || model === 'third_party_management';
  const partnerInvestorDistribution = directPartnerDistribution ? Math.max(partnerShare, 0) : 0;
  const finalDistribution = directPartnerDistribution ? partnerInvestorDistribution : investorDistribution;
  // Resultado negativo permanece registrado como prejuízo operacional, mas não
  // gera retenção nem distribuição. "Retido" é uma destinação de lucro, nunca
  // um saldo negativo a ser apresentado como se fosse retenção da UBY.
  const ubyRetained = Math.max(ubyNet - investorDistribution, 0);
  const p3OperationalResult = management + p3SocietyProfit;
  const ownResult = ubyNet + p3SocietyProfit;
  const paybackBase = model === 'p3_society' ? p3SocietyProfit : ((model === 'management_only' || model === 'third_party_management') ? p3OperationalResult : ownResult);
  // Em gestao de ativo de terceiro nao ha capital UBY a recuperar. O retorno
  // acompanha a receita P3, mas nao deve fingir um payback da UBY.
  const paybackInvestmentValue = model === 'p3_society'
    ? p3InvestmentValue
    : ((model === 'management_only' || model === 'third_party_management') ? 0 : cfg.investmentValue);
  const paybackMonths = paybackInvestmentValue > 0 && paybackBase > 0 ? paybackInvestmentValue / paybackBase : 0;
  const roiMonthly = paybackInvestmentValue > 0 ? paybackBase / paybackInvestmentValue * 100 : 0;
  const margin = totalRevenue ? ownResult / totalRevenue * 100 : 0;
  const financialResult = operationNet;
  const totalOperatingCost = energyCost + extraCosts + taxes + management + platform + ubyRoyalty + areaParticipation;
  const matrizCostPerKWh = commercialEnergy > 0 ? matrizCost / commercialEnergy : null;
  const plannedMatrizCostPerKWh = planning.planningKWh > 0 ? matrizCost / planning.planningKWh : null;
  const matrizCostRevenuePct = revenue > 0 ? matrizCost / revenue * 100 : 0;
  const directCostPerKWh = commercialEnergy > 0 ? (energyCost + extraCosts + taxes + areaParticipation) / commercialEnergy : null;
  const totalCostPerKWh = commercialEnergy > 0 ? totalOperatingCost / commercialEnergy : null;
  const extraRevenuePerKWh = commercialEnergy > 0 ? extraRevenue / commercialEnergy : null;
  const plannedEnergyCost = planning.planningKWh * cfg.energyCostPerKWh;
  const plannedTotalRevenue = planning.planningRevenue + plannedOperationalExtraRevenue + marketingPlanned;
  const plannedManagement = plannedTotalRevenue * cfg.managementPct / 100;
  const plannedPlatform = planning.planningRevenue * cfg.platformPct / 100;
  const plannedUbyRoyalty = model === 'third_party_management' ? planning.planningRevenue * cfg.ubyRoyaltyPct / 100 : 0;
  const plannedTaxes = planning.planningRevenue * cfg.taxRatePct / 100;
  const plannedPreAreaNet = plannedTotalRevenue - plannedManagement - plannedPlatform - plannedUbyRoyalty - plannedTaxes - plannedEnergyCost - costEvaluation.planned - matrizCost;
  const plannedAreaShareBase = plannedTotalRevenue;
  const plannedAreaParticipation = areaEligible ? plannedAreaShareBase * areaSharePct / 100 : 0;
  const plannedDirectCost = plannedEnergyCost + costEvaluation.planned + matrizCost + plannedTaxes + plannedAreaParticipation;
  const plannedTotalCost = plannedDirectCost + plannedManagement + plannedPlatform + plannedUbyRoyalty;
  const plannedDirectCostPerKWh = planning.planningKWh > 0 ? plannedDirectCost / planning.planningKWh : null;
  const plannedExtraRevenuePerKWh = planning.planningKWh > 0 ? plannedOperationalExtraRevenue / planning.planningKWh : null;
  const managementVariable = planning.salePricePerKWh * cfg.managementPct / 100;
  const platformVariable = planning.salePricePerKWh * cfg.platformPct / 100;
  const areaVariable = areaEligible ? planning.salePricePerKWh * areaSharePct / 100 : 0;
  const royaltyVariable = model === 'third_party_management' ? planning.salePricePerKWh * cfg.ubyRoyaltyPct / 100 : 0;
  const taxVariable = planning.salePricePerKWh * cfg.taxRatePct / 100;
  const variableCostPerKWh = cfg.energyCostPerKWh + managementVariable + platformVariable + royaltyVariable + taxVariable + areaVariable + financeVariableCostPerKWh(cfg.costRules, planning);
  const variableRevenuePerKWh = planning.salePricePerKWh + financeVariableCostPerKWh(cfg.revenueRules.filter(rule => rule.scope !== 'non_operational'), planning);
  const economics = window.UBY_FINANCE_ENGINE.unitEconomics({
    energy: commercialEnergy,
    revenue,
    extraRevenue,
    energyCost,
    extraCosts: extraCosts + taxes + areaParticipation + ubyRoyalty,
    management,
    platform,
    planningKWh: planning.planningKWh,
    plannedEnergyCost,
    plannedExtraCosts: costEvaluation.planned + matrizCost + plannedTaxes + plannedAreaParticipation + plannedUbyRoyalty,
    plannedManagement,
    plannedPlatform,
    plannedUbyRoyalty,
    variableRevenuePerKWh,
    variableCostPerKWh,
    fixedCosts: financeFixedRuleTotal(cfg.costRules) + matrizCost,
    fixedRevenue: financeFixedRuleTotal(cfg.revenueRules.filter(rule => rule.scope !== 'non_operational'))
  });
  const { plannedTotalCostPerKWh, resultPerKWh, operationMargin, contributionPerKWh, breakEvenKWh } = economics;
  return {
    operationModel: model,
    revenue,
    chargingRevenue,
    energy,
    commercialEnergy,
    courtesyCharges: courtesy.charges,
    courtesyEnergy: courtesy.energy,
    courtesyRevenue: courtesy.revenue,
    courtesyEnergyCost: courtesy.energyCost,
    courtesyCostExcluded: courtesy.excludedFromUby,
    courtesyTreatment: courtesy.treatment,
    courtesyResponsible: courtesy.responsible,
    physicalOperationNet: operationNet - courtesy.excludedFromUby,
    acRevenue,
    dcRevenue,
    management,
    platform,
    p3AcEquity,
    p3DcEquity,
    p3SocietyProfit,
    p3OperationalResult,
    partnerShare,
    ownResult,
    energyCost,
    energyComposition,
    energyRate: Number(cfg.energyCostPerKWh || 0),
    taxes,
    taxRatePct: Number(cfg.taxRatePct || 0),
    extraCosts,
    localExtraCosts,
    matrizCost,
    matrizTaxCost,
    matrizCash,
    matrizCostPerKWh,
    plannedMatrizCostPerKWh,
    matrizCostRevenuePct,
    extraRevenue,
    marketingRevenue,
    marketingPlanned,
    financialResult,
    preAreaNet,
    areaEligible,
    areaSharePct,
    areaShareBase,
    areaParticipation,
    plannedAreaParticipation,
    plannedTotalRevenue,
    costRules: cfg.costRules,
    revenueRules: cfg.revenueRules,
    costRuleDetails: [...costEvaluation.details, {
      id: 'tax-rate', label: 'Tributos diretamente atribuiveis ao carregador', enabled: Number(cfg.taxRatePct || 0) > 0,
      basis: 'revenue_pct', value: Number(cfg.taxRatePct || 0), actual: taxes, planned: plannedTaxes,
      actualPerKWh: energy > 0 ? taxes / energy : null,
      plannedPerKWh: planning.planningKWh > 0 ? plannedTaxes / planning.planningKWh : null,
      displayRule: `${Number(cfg.taxRatePct || 0).toFixed(2).replace('.', ',')}% do faturamento`
    }, ...matrizCostDetails],
    revenueRuleDetails: revenueEvaluation.details,
    costs,
    taxes,
    totalRevenue,
    totalOperatingCost,
    directCostPerKWh,
    totalCostPerKWh,
    extraRevenuePerKWh,
    plannedDirectCost,
    plannedTotalCost,
    plannedDirectCostPerKWh,
    plannedTotalCostPerKWh,
    plannedExtraRevenuePerKWh,
    resultPerKWh,
    operationMargin,
    variableCostPerKWh,
    contributionPerKWh,
    breakEvenKWh,
    planning,
    p3Gross,
    ubyRoyalty,
    operationNet,
    ubyNet,
    saRetention,
    ubyDistributable,
    investorDistribution,
    partnerInvestorDistribution,
    finalDistribution,
    ubyRetained,
    paybackBase,
    paybackMonths,
    roiMonthly,
    margin,
    investmentValue: cfg.investmentValue,
    paybackInvestmentValue,
    p3InvestmentValue,
    partnerInvestmentValue
  };
}

// ── Custos da matriz UBY (compartilhados, rateio igual) ───────────────────────
// Camada nova, separada do engine financeiro: cadastra custos da matriz e os
// divide igualmente entre os carregadores UBY que tiveram recarga no mês.

const MATRIZ_LEGACY_COSTS_KEY = 'uby-matriz-costs-v1';

function loadMatrizCostsLegacy() {
  try {
    const arr = JSON.parse(localStorage.getItem(MATRIZ_LEGACY_COSTS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

const MATRIZ_COSTS_KEY = 'uby-matriz-costs-v2';

const NETWORK_DISTRIBUTION_KEY = 'uby-network-distribution-v1';

let matrizCostsState = [];

let matrizCostsLoaded = false;

let networkDistributionState = null;

function defaultNetworkInvestors() {
  return [
    ['Isabela Bufalo', 1, '2026-05'], ['Amanda Bufalo', 1, '2026-05'], ['R.EBP', 2, '2026-05'],
    ['Willian Jabur', 1, '2026-06'], ['Carlos Eduardo Garcia', 1, '2026-07'],
    ['Michell Jabur', 1, '2026-08'], ['Gabriel Z.', 1, '2026-08'], ['Renan Sanchez', 2, '2026-09']
  ].map(([name, quotas, eligibleFrom]) => ({ name, quotas, eligibleFrom, status: 'pendente' }));
}

function normalizeNetworkInvestors(raw) {
  const fallback = defaultNetworkInvestors();
  if (!Array.isArray(raw) || !raw.length) return fallback;
  return raw.map((item, index) => ({
    name: safeText(item?.name || fallback[index]?.name || `Cotista ${index + 1}`).slice(0, 120),
    // NOVA PLATAFORMA: cotas podem ser fracionadas (valor investido ÷ valor da cota).
    quotas: Math.max(0, Math.round(Number(item?.quotas ?? fallback[index]?.quotas ?? 0) * 10000) / 10000),
    eligibleFrom: /^\d{4}-\d{2}$/.test(String(item?.eligibleFrom || '')) ? String(item.eligibleFrom) : (fallback[index]?.eligibleFrom || '2099-12'),
    status: ['pendente', 'aprovado', 'pago'].includes(item?.status) ? item.status : 'pendente',
    quotaValue: Number(item?.quotaValue) > 0 ? Number(item.quotaValue) : (Number(fallback[index]?.quotaValue) > 0 ? Number(fallback[index].quotaValue) : 0),
    // Data do aporte e valor investido informados na tela nova; o resto é calculado.
    investedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.investedAt || '')) ? String(item.investedAt) : '',
    investment: Number(item?.investment) > 0 ? Math.round(Number(item.investment) * 100) / 100 : 0,
    // E-mail de acesso do cotista aos próprios extratos (documentos publicados).
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(item?.email || '').trim()) ? String(item.email).trim().toLowerCase() : '',
    // Carregador cuja entrada em operação libera o dividendo desta cota (não é rateio de faturamento).
    linkedStation: safeText(item?.linkedStation || '').slice(0, 120),
    // Bloco fundador: as 2 cotas da REBP na rodada 1; recebe também founderPct% das cotas 11 em diante.
    founder: item?.founder === true,
    // Cota 11 em diante: fica com 100% − founderPct do que a cota recebe.
    newQuota: item?.newQuota === true && item?.founder !== true
  })).filter(item => item.name && item.quotas > 0);
}

// Mês em que a cota passa a receber: o maior entre o mês do aporte (eligibleFrom guardado) e o mês
// de início da operação do carregador vinculado (a operação vale desde o próprio mês em que começou).

function investorOperationMonth(station) {
  if (!station) return '';
  try {
    const key = normalizeStationForCompare(station);
    const row = getUbyChargerRows(getGeneralUnitData()).find(r => normalizeStationForCompare(r.station || r.stationName || r.workName || '') === key);
    if (!row) return '';
    const start = operationStartForCharges(row.charges || [], { ...row, stationName: row.station || row.stationName });
    if (!start || Number.isNaN(start.getTime())) return '';
    // Vale o mês em que o carregador entrou em operação, qualquer que seja o dia.
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  } catch (_) { return ''; }
}

// Ordem uniforme em toda a plataforma e nos relatórios: por início do recebimento, depois data do
// aporte e nome; quem aguarda operação vai para o fim.

function compareInvestorsByStart(a, b) {
  return String(a.eligibleFrom || '9999-99').localeCompare(String(b.eligibleFrom || '9999-99'))
    || String(a.investedAt || a.baseEligibleFrom || '9999').localeCompare(String(b.investedAt || b.baseEligibleFrom || '9999'))
    || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
}

function applyInvestorOperationStart(investors) {
  const cache = new Map();
  return investors.map(inv => {
    if (!inv.linkedStation) return { ...inv, baseEligibleFrom: inv.eligibleFrom, operationFrom: '' };
    if (!cache.has(inv.linkedStation)) cache.set(inv.linkedStation, investorOperationMonth(inv.linkedStation));
    const operationFrom = cache.get(inv.linkedStation);
    // Carregador vinculado ainda sem operação (ou não cadastrado): a cota aguarda, sem dividendo.
    if (!operationFrom) return { ...inv, baseEligibleFrom: inv.eligibleFrom, operationFrom: '', waitingOperation: true, eligibleFrom: '2099-12' };
    return { ...inv, baseEligibleFrom: inv.eligibleFrom, operationFrom, eligibleFrom: operationFrom > inv.eligibleFrom ? operationFrom : inv.eligibleFrom };
  });
}

function normalizeDistributionLedger(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.entries(raw).reduce((ledger, [monthKey, item]) => {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return ledger;
    ledger[monthKey] = {
      status: ['pendente', 'aprovado', 'pago'].includes(item?.status) ? item.status : 'pendente',
      updatedAt: item?.updatedAt || '', note: safeText(item?.note || '').slice(0, 300),
      // NOVA PLATAFORMA: fechamento aprovado guarda quem aprovou, quando pagou e a
      // foto dos números aprovados (para acusar divergência se a base mudar depois).
      approvedAt: String(item?.approvedAt || ''), approvedBy: safeText(item?.approvedBy || '').slice(0, 120),
      paidAt: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.paidAt || '')) ? String(item.paidAt) : '',
      snapshot: item?.snapshot && typeof item.snapshot === 'object' && !Array.isArray(item.snapshot) ? item.snapshot : null
    };
    return ledger;
  }, {});
}

function defaultNetworkDistribution() {
  return {
    roundLabel: 'Rodada 1', totalQuotas: 10, soldQuotas: 10, investorPct: 100,
    legalReservePct: 5, expansionReservePct: 10, policyVersion: 3,
    // NOVA PLATAFORMA: valor de referência da cota e início da distribuição
    // passam a ser configuração (antes fixos no cálculo). Cada cotista pode
    // ter o valor da própria rodada (quotaValue no cotista).
    quotaValue: 80000, distributionStartMonth: '2026-06',
    legalReservePurpose: 'Reserva legal obrigatória da S.A.',
    expansionReservePurpose: 'Fundo de reserva e expansão',
    investors: defaultNetworkInvestors(), paymentLedger: {}
  };
}

function normalizeNetworkDistribution(raw = {}) {
  const base = defaultNetworkDistribution();
  // A versão anterior armazenava apenas reservePct (10%), que agora é o
  // fundo de expansão. A reserva legal de 5% é adicional e nunca substitui
  // o fundo de expansão.
  const legacyExpansionPct = raw.expansionReservePct ?? raw.reservePct ?? base.expansionReservePct;
  return {
    roundLabel: safeText(raw.roundLabel || base.roundLabel).slice(0, 80) || base.roundLabel,
    totalQuotas: Math.max(1, Math.round(Number(raw.totalQuotas || base.totalQuotas))),
    soldQuotas: Math.max(0, Math.round(Number(raw.soldQuotas ?? base.soldQuotas))),
    investorPct: Math.min(100, Math.max(0, Number(raw.investorPct ?? base.investorPct))),
    legalReservePct: Math.min(100, Math.max(0, Number(raw.legalReservePct ?? base.legalReservePct))),
    expansionReservePct: Math.min(100, Math.max(0, Number(legacyExpansionPct))),
    policyVersion: base.policyVersion,
    quotaValue: Number(raw.quotaValue) > 0 ? Number(raw.quotaValue) : base.quotaValue,
    distributionStartMonth: /^\d{4}-\d{2}$/.test(String(raw.distributionStartMonth || '')) ? String(raw.distributionStartMonth) : base.distributionStartMonth,
    // Impostos da UBY sobre o faturamento: percentual e valores exatos por competência.
    taxRatePct: Math.min(100, Math.max(0, Number(raw.taxRatePct || 0))),
    // NOVA PLATAFORMA (20/10/2026): fatia fixa do pool para o bloco fundador, sem diluição.
    founderPct: raw.founderPct === undefined || raw.founderPct === null || raw.founderPct === '' ? 20 : Math.min(100, Math.max(0, Number(raw.founderPct) || 0)),
    // NOVA PLATAFORMA (05/10/2026): alíquota que passa a valer a partir de uma competência ({ 'AAAA-MM': % }).
    taxRateFrom: raw.taxRateFrom && typeof raw.taxRateFrom === 'object' && !Array.isArray(raw.taxRateFrom) ? Object.fromEntries(Object.entries(raw.taxRateFrom).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && v !== '' && v !== null && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.min(100, Math.max(0, Number(v)))])) : {},
    taxByMonth: raw.taxByMonth && typeof raw.taxByMonth === 'object' && !Array.isArray(raw.taxByMonth) ? Object.fromEntries(Object.entries(raw.taxByMonth).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && v !== '' && v !== null && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.max(0, Number(v))])) : {},
    legalReservePurpose: base.legalReservePurpose,
    expansionReservePurpose: base.expansionReservePurpose,
    investors: normalizeNetworkInvestors(raw.investors),
    paymentLedger: normalizeDistributionLedger(raw.paymentLedger)
  };
}

function loadNetworkDistribution() {
  if (networkDistributionState) return networkDistributionState;
  try { networkDistributionState = normalizeNetworkDistribution(JSON.parse(localStorage.getItem(NETWORK_DISTRIBUTION_KEY) || '{}')); }
  catch (_) { networkDistributionState = defaultNetworkDistribution(); }
  return networkDistributionState;
}

let matrizCostsLoadPromise = null;

let matrizCostsSaveChain = Promise.resolve();

function matrizScopeKey(row = {}) { return `${String(row.workId || '')}::${String(row.key || normalizeStationForCompare(row.station || row.workName || ''))}`; }

function matrizStationScope(row = {}) { return `${String(row.workId || '')}::${normalizeStationForCompare(row.station || row.stationName || row.workName || '')}`; }

function matrizTargetCandidates(target = {}) {
  const raw = typeof target === 'string' ? { scope: target } : (target || {});
  const workId = String(raw.workId || String(raw.scope || '').split('::')[0] || '');
  const stationKey = normalizeStationForCompare(raw.station || raw.stationName || raw.stationKey || '');
  return [...new Set([
    String(raw.scope || ''),
    workId && stationKey ? `${workId}::${stationKey}` : '',
    stationKey
  ].filter(Boolean))];
}

function matrizScopeCandidates(row = {}) {
  return [...new Set([matrizScopeKey(row), matrizStationScope(row)].filter(scope => scope && scope !== '::'))];
}

function matrizRowsMatch(left = {}, right = {}) {
  if (left === right) return true;
  if (String(left.workId || '') !== String(right.workId || '')) return false;
  if (matrizScopeCandidates(left).some(scope => matrizScopeCandidates(right).includes(scope))) return true;
  // A chave do plug pode mudar entre plataformas/importacoes. A estacao
  // canonica da mesma obra continua sendo o identificador do rateio.
  const leftStation = normalizeStationForCompare(left.station || left.stationName || '');
  const rightStation = normalizeStationForCompare(right.station || right.stationName || '');
  return !!leftStation && leftStation === rightStation;
}

function matrizResolveTargetRow(target, rows = []) {
  const targetData = typeof target === 'string' ? { scope: target } : (target || {});
  const candidates = matrizTargetCandidates(targetData);
  const exact = rows.find(row => matrizScopeCandidates(row).some(scope => candidates.includes(scope)));
  if (exact) return exact;
  const workId = String(targetData.workId || String(targetData.scope || '').split('::')[0] || '');
  const stationKey = normalizeStationForCompare(targetData.station || targetData.stationName || targetData.stationKey || '');
  const sameStation = rows.find(row => String(row.workId || '') === workId && stationKey && normalizeStationForCompare(row.station || row.stationName || '') === stationKey);
  if (sameStation) return sameStation;
  const sameWork = rows.filter(row => String(row.workId || '') === workId);
  // Old records could identify a connector instead of the station. If there is
  // only one current UBY station in the work, it remains the correct target.
  return sameWork.length === 1 ? sameWork[0] : null;
}

function matrizTargetMatchesRow(target, row = {}) {
  if (!target || !row) return false;
  const targetData = typeof target === 'string' ? { scope: target } : target;
  const resolved = matrizResolveTargetRow(targetData, [row]);
  if (resolved && matrizRowsMatch(resolved, row)) return true;

  // O cadastro da matriz pode ter sido salvo antes de uma troca de plataforma
  // ou de conector. Estacao + obra continuam sendo a identidade operacional
  // correta para custos compartilhados, mesmo se a chave do plug mudou.
  const targetStation = normalizeStationForCompare(targetData.station || targetData.stationName || targetData.stationKey || '');
  const rowStation = normalizeStationForCompare(row.station || row.stationName || '');
  if (targetStation && rowStation && targetStation === rowStation) return true;

  const targetWorkId = String(targetData.workId || String(targetData.scope || '').split('::')[0] || '');
  return !!targetWorkId && targetWorkId === String(row.workId || '') && !targetStation;
}

function matrizMonthOffset(start, target) {
  if (!/^\d{4}-\d{2}$/.test(String(start || '')) || !/^\d{4}-\d{2}$/.test(String(target || ''))) return -1;
  return (Number(target.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(target.slice(5, 7)) - Number(start.slice(5, 7));
}

function matrizAddMonths(mk, amount = 0) {
  if (!/^\d{4}-\d{2}$/.test(String(mk || ''))) return '';
  const index = Number(mk.slice(0, 4)) * 12 + Number(mk.slice(5, 7)) - 1 + Number(amount || 0);
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

function matrizMethodLabel(method) { return ({ equal: 'Rateio igual', power: 'Por potencia', energy: 'Por kWh', revenue: 'Por faturamento', custom: 'Participacao definida' })[method] || 'Rateio igual'; }

function matrizKindLabel(kind) { return ({ recurring: 'Recorrente', installment: 'Parcelado', one_off: 'Pontual' })[kind] || 'Recorrente'; }

function matrizNormalizeCost(raw = {}) {
  const costKind = ['recurring', 'installment', 'one_off'].includes(raw.costKind) ? raw.costKind : 'recurring';
  const installments = Math.max(1, Number(raw.installments || 1));
  // Custos parcelados podem cobrir mais meses do que parcelas. A competencia
  // reconhece o total contratado durante a cobertura; o caixa segue as parcelas.
  const coverageMonths = Math.max(1, Number(raw.coverageMonths || raw.competenceMonths || (costKind === 'installment' ? installments : 1)));
  const oldTargets = Array.isArray(raw.targetIds) ? raw.targetIds : [];
  const targets = Array.isArray(raw.targets) && raw.targets.length ? raw.targets : oldTargets.map(scope => ({ scope, startMonth: raw.startMonth || '', share: raw.customShares?.[scope] || 0 }));
  return {
    id: String(raw.id || `m${Date.now().toString(36)}`), name: safeText(raw.name || raw.nome || 'Custo sem nome'),
    category: safeText(raw.category || 'Outros custos'), supplier: safeText(raw.supplier || ''),
    costKind,
    amount: Math.max(0, Number(raw.amount ?? raw.valor ?? 0)), installments, coverageMonths,
    startMonth: String(raw.startMonth || raw.effectiveMonth || ''), endMonth: String(raw.endMonth || ''), dueDay: Math.min(31, Math.max(1, Number(raw.dueDay || 1))),
    allocation: ['equal', 'power', 'energy', 'revenue', 'custom'].includes(raw.allocation) ? raw.allocation : 'equal',
    targets: targets.map(target => ({ scope: String(target.scope || ''), workId: String(target.workId || String(target.scope || '').split('::')[0] || ''), station: safeText(target.station || target.stationName || ''), stationKey: normalizeStationForCompare(target.stationKey || target.station || target.stationName || ''), workName: safeText(target.workName || ''), startMonth: String(target.startMonth || raw.startMonth || ''), share: Math.max(0, Number(target.share || 0)) })).filter(target => target.scope || (target.workId && target.stationKey)),
    documentRef: safeText(raw.documentRef || ''), notes: safeText(raw.notes || ''),
    // Compromissos de caixa por carregador ficam no mesmo cofre sincronizado
    // da matriz, mas não entram no DRE sem lançamento financeiro explícito.
    scheduledPayment: raw.scheduledPayment === true,
    derivedEnergyPayment: raw.derivedEnergyPayment === true,
    sourceCompetenceMonth: /^\d{4}-\d{2}$/.test(String(raw.sourceCompetenceMonth || '')) ? String(raw.sourceCompetenceMonth) : '',
    energyPaymentType: ['copel', 'lease'].includes(String(raw.energyPaymentType || '')) ? String(raw.energyPaymentType) : '',
    paymentLedger: raw.paymentLedger && typeof raw.paymentLedger === 'object' && !Array.isArray(raw.paymentLedger)
      ? Object.entries(raw.paymentLedger).reduce((ledger, [monthKeyValue, entry]) => {
        if (!/^\d{4}-\d{2}$/.test(monthKeyValue)) return ledger;
        ledger[monthKeyValue] = {
          status: entry?.status === 'paid' ? 'paid' : 'pending',
          paidAt: String(entry?.paidAt || ''), updatedAt: String(entry?.updatedAt || ''),
          // NOVA PLATAFORMA (13/10/2026): valor efetivamente pago (desconto, juros, mês proporcional).
          ...(entry?.status === 'paid' && entry?.amount !== undefined && entry?.amount !== null && entry?.amount !== '' && Number.isFinite(Number(entry.amount)) ? { amount: Math.max(0, Number(entry.amount)) } : {}),
          // NOVA PLATAFORMA (05/11/2026): valor do boleto deste mês quando difere do cadastro (vale só no mês).
          ...(entry?.billAmount !== undefined && entry?.billAmount !== null && entry?.billAmount !== '' && Number.isFinite(Number(entry.billAmount)) ? { billAmount: Math.max(0, Number(entry.billAmount)) } : {})
        };
        return ledger;
      }, {}) : {},
    // Evita reaplicar migrações automáticas quando o usuário editar o custo.
    accrualVersion: Math.max(0, Number(raw.accrualVersion || 0)), enabled: raw.enabled !== false && raw.ativo !== false,
    createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

function matrizApplyLegacyCoveragePolicy(list = []) {
  let changed = false;
  const costs = list.map(matrizNormalizeCost).map(item => {
    const normalizedName = String(item.name || '').trim().toLocaleLowerCase('pt-BR');
    // Cadastro criado antes do controle de competência: quatro boletos do seguro
    // cobrem doze meses e não devem pesar integralmente nos primeiros quatro.
    const isLegacyInsurance = normalizedName === 'seguro carregadores'
      && item.accrualVersion < 1
      && item.costKind === 'recurring'
      && Math.abs(Number(item.amount || 0) - 526.24) < 0.02;
    if (!isLegacyInsurance) return item;
    changed = true;
    return {
      ...item,
      costKind: 'installment',
      installments: 4,
      coverageMonths: 12,
      accrualVersion: 1,
      updatedAt: new Date().toISOString()
    };
  });
  return { costs, changed };
}

function loadMatrizCosts() {
  if (matrizCostsState.length) return matrizCostsState;
  try { matrizCostsState = (JSON.parse(localStorage.getItem(MATRIZ_COSTS_KEY) || '[]') || []).map(matrizNormalizeCost); } catch (_) { matrizCostsState = []; }
  if (!matrizCostsState.length) matrizCostsState = loadMatrizCostsLegacy().map(matrizNormalizeCost);
  const migration = matrizApplyLegacyCoveragePolicy(matrizCostsState);
  matrizCostsState = migration.costs;
  if (migration.changed) {
    try { localStorage.setItem(MATRIZ_COSTS_KEY, JSON.stringify(matrizCostsState)); } catch (_) {}
  }
  return matrizCostsState;
}

function saveMatrizCosts(list, options = {}) {
  const migration = matrizApplyLegacyCoveragePolicy(Array.isArray(list) ? list : []);
  matrizCostsState = migration.costs;
  try { localStorage.setItem(MATRIZ_COSTS_KEY, JSON.stringify(matrizCostsState)); } catch (_) {}
  if (options.remote !== false || migration.changed) persistMatrizCosts().catch(err => {
    console.warn('[matriz-save]', err);
    setMatrizFeedback(`Salvo neste navegador. Nuvem pendente: ${err?.message || 'erro de sincronizacao'}`, true);
  }).then(result => {
    if (result?.cloud) setMatrizFeedback('Matriz salva na nuvem e neste navegador.', false);
  });
  return matrizCostsState;
}

async function ensureMatrizCostsLoaded() {
  if (matrizCostsLoaded) return loadMatrizCosts();
  if (matrizCostsLoadPromise) return matrizCostsLoadPromise;
  matrizCostsLoadPromise = (async () => {
    loadMatrizCosts();
    loadNetworkDistribution();
    try {
      if (window.UBY_SUPABASE?.loadFinancialMatrix) {
        const remote = await window.UBY_SUPABASE.loadFinancialMatrix();
        if (remote && Array.isArray(remote.matrizCosts)) {
          saveMatrizCosts(remote.matrizCosts, { remote: false });
          if (remote.networkDistribution) {
            const needsPolicyMigration = Number(remote.networkDistribution.policyVersion || 0) < defaultNetworkDistribution().policyVersion;
            saveNetworkDistribution(remote.networkDistribution, { remote: false });
            // Persiste uma única vez a migração da reserva da Rodada 1, sem
            // alterar os custos centralizados existentes.
            if (needsPolicyMigration) await persistMatrizCosts();
          }
        } else if (matrizCostsState.length) {
          // A primeira abertura apos a migracao promove a copia local para a nuvem.
          await persistMatrizCosts();
        }
      }
    } catch (err) { console.warn('[matriz-load]', err); }
    matrizCostsLoaded = true;
    return matrizCostsState;
  })().finally(() => { matrizCostsLoadPromise = null; });
  return matrizCostsLoadPromise;
}

function persistMatrizCosts() {
  if (!window.UBY_SUPABASE?.saveFinancialMatrix) return Promise.reject(new Error('Sincronizacao da matriz financeira indisponivel.'));
  const snapshot = matrizCostsState.map(matrizNormalizeCost);
  const distribution = loadNetworkDistribution();
  matrizCostsSaveChain = matrizCostsSaveChain.catch(() => {}).then(() => window.UBY_SUPABASE.saveFinancialMatrix(snapshot, distribution));
  return matrizCostsSaveChain;
}

function matrizCoverageMonths(item = {}) {
  return Math.max(1, Number(item.coverageMonths || (item.costKind === 'installment' ? item.installments : 1)));
}

function matrizCompetencyAmount(item = {}) {
  if (item.costKind === 'installment') {
    return Math.max(0, Number(item.amount || 0)) * Math.max(1, Number(item.installments || 1)) / matrizCoverageMonths(item);
  }
  return Math.max(0, Number(item.amount || 0));
}

function matrizCashAmount(item = {}, mk = '') {
  if (item.scheduledPayment) return 0;
  const offset = matrizMonthOffset(item.startMonth || mk, mk);
  if (offset < 0) return 0;
  if (item.costKind === 'one_off') return offset === 0 ? Math.max(0, Number(item.amount || 0)) : 0;
  if (item.costKind === 'installment') return offset < Math.max(1, Number(item.installments || 1)) ? Math.max(0, Number(item.amount || 0)) : 0;
  return (!item.endMonth || mk <= item.endMonth) ? Math.max(0, Number(item.amount || 0)) : 0;
}

function matrizApplies(item, mk) {
  if (!item?.enabled || item.scheduledPayment || !mk) return false;
  const offset = matrizMonthOffset(item.startMonth || mk, mk);
  if (offset < 0 || (item.endMonth && mk > item.endMonth)) return false;
  if (item.costKind === 'one_off') return offset === 0;
  return item.costKind !== 'installment' || offset < matrizCoverageMonths(item);
}

function matrizWeight(row, target, item, mk) {
  if (item.allocation === 'custom') return Number(target.share || 0);
  if (item.allocation === 'power') return Math.max(0, Number(workPowerById(row.workId) || 0));
  const charges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
  if (item.allocation === 'energy') return charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  if (item.allocation === 'revenue') return charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  return 1;
}
// Somente ativos da UBY participam da matriz. O parceiro com gestão P3 e
// royalty UBY continua no painel operacional, mas não absorve custos da matriz
// nem compõe a distribuição de investidores UBY.

function matrizEligibleRow(row, mk = financeMonthKey()) {
  if (!row?.included) return false;
  const settings = financeSettingsForUbyRow(row, mk);
  return ['uby', 'hybrid'].includes(normalizeOperationModel(settings?.operationModel));
}

function matrizEligibleRows(unitData = getGeneralUnitData(), mk = financeMonthKey()) {
  return getUbyChargerRows(unitData).filter(row => matrizEligibleRow(row, mk));
}

function matrizCostItemsForRow(row, mk, unitData = getGeneralUnitData()) {
  if (!matrizEligibleRow(row, mk)) return [];
  const rows = matrizEligibleRows(unitData, mk);
  return loadMatrizCosts().filter(item => matrizApplies(item, mk)).flatMap(item => {
    const targets = (item.targets || [])
      .filter(target => !target.startMonth || target.startMonth <= mk)
      .map(target => ({
        target,
        row: matrizResolveTargetRow(target, rows) || rows.find(candidate => matrizTargetMatchesRow(target, candidate)) || null
      }));
    // Evita que aliases antigos de conector contem duas vezes no denominador.
    // A identidade economica do custo e a estacao na obra, nao o plug exportado.
    const activeByScope = new Map();
    targets.filter(entry => entry.row).forEach(entry => {
      const scope = matrizStationScope(entry.row) || matrizScopeKey(entry.row);
      if (!activeByScope.has(scope)) activeByScope.set(scope, entry);
    });
    const activeTargets = [...activeByScope.values()];
    const direct = activeTargets.find(entry => matrizRowsMatch(entry.row, row));
    // Algumas plataformas trocam o identificador do conector entre exportacoes.
    // Quando ha somente um destino UBY na mesma obra, o rateio continua sendo
    // inequivoco mesmo se a chave antiga do conector nao existir mais.
    const sameWorkTargets = activeTargets.filter(entry => String(entry.row.workId || '') === String(row.workId || ''));
    const own = direct || (sameWorkTargets.length === 1 ? sameWorkTargets[0] : null);
    if (!own || !activeTargets.length) return [];
    const weighted = activeTargets.map(entry => ({ ...entry, weight: matrizWeight(entry.row, entry.target, item, mk) }));
    if (!weighted.length) return [];
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    const ownWeight = own.row ? matrizWeight(own.row, own.target, item, mk) : matrizWeight(row, own.target, item, mk);
    const competencyAmount = matrizCompetencyAmount(item);
    const cashAmount = matrizCashAmount(item, mk);
    const amount = totalWeight > 0 ? competencyAmount * ownWeight / totalWeight : competencyAmount / weighted.length;
    const cashShare = totalWeight > 0 ? cashAmount * ownWeight / totalWeight : cashAmount / weighted.length;
    const coverage = item.costKind === 'installment'
      ? `${item.installments} parcela(s) | cobertura ${matrizCoverageMonths(item)} mes(es)`
      : matrizKindLabel(item.costKind);
    return amount > 0 ? [{ id: item.id, label: item.name, category: item.category || 'Outros custos', amount, cashAmount: cashShare, coverageMonths: matrizCoverageMonths(item), rule: `${coverage} | ${matrizMethodLabel(item.allocation)} | ${weighted.length} destino(s)` }] : [];
  });
}

function matrizRowForUnit(unit = {}, unitData = getGeneralUnitData(), mk = financeMonthKey()) {
  const candidates = matrizEligibleRows(unitData, mk)
    .filter(row => String(row.workId || '') === String(unit.workId || ''));
  if (!candidates.length) return null;
  const station = safeText(unit.stationName || unit.station || unit.workName || '');
  const direct = candidates.find(row => normalizeStationForCompare(row.station || row.stationName || '') === normalizeStationForCompare(station));
  if (direct) return direct;
  const matched = candidates.find(row => matrizTargetMatchesRow({ workId: unit.workId, station }, row));
  return matched || (candidates.length === 1 ? candidates[0] : null);
}

function matrizMonthSequence(from, to) {
  if (!/^\d{4}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}$/.test(to || '') || from > to) return [];
  const values = [];
  let cursor = from;
  while (cursor <= to && values.length < 48) {
    values.push(cursor);
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    cursor = `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
  }
  return values;
}

function generalFinanceByUnit(unitData) {
  return unitData.map(unit => {
    const byMonth = {};
    unit.charges.forEach(charge => {
      const mk = chargeMonthKey(charge);
      if (mk === 'unknown') return;
      (byMonth[mk] ||= []).push(charge);
    });
    const monthly = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([mk, charges]) => {
      // A configuracao pode ser diferente por carregador. Usar somente a raiz
      // da obra fazia o geral voltar para o modelo padrao e ignorar a escolha
      // salva para Sabara, Central JK e qualquer outra estacao individual.
      const settings = financeSettingsForUbyRow(unit, mk);
      const matrixRow = matrizRowForUnit(unit, unitData, mk);
      const matrizCostItems = matrixRow ? matrizCostItemsForRow(matrixRow, mk, unitData) : [];
      const result = financeForCharges(charges, settings, { monthKey: mk, historyCharges: unit.charges, power: workPowerById(unit.workId), matrizCostItems, workId: unit.workId, workName: unit.workName, stationName: unit.stationName || unit.station, courtesyConfig: stationAvailabilityFor(unit.workId, unit.stationName || unit.station, unit.workName) });
      return { monthKey: mk, result };
    });
    const total = monthly.reduce((acc, { result }) => {
      Object.entries(result).forEach(([key, value]) => {
        if (['operationModel', 'margin', 'paybackMonths', 'roiMonthly', 'investmentValue', 'paybackInvestmentValue', 'p3InvestmentValue', 'partnerInvestmentValue'].includes(key) || !Number.isFinite(value)) return;
        acc[key] = (acc[key] || 0) + value;
      });
      acc.investmentValue = Math.max(acc.investmentValue || 0, result.investmentValue || 0);
      acc.paybackInvestmentValue = Math.max(acc.paybackInvestmentValue || 0, result.paybackInvestmentValue || result.investmentValue || 0);
      acc.p3InvestmentValue = Math.max(acc.p3InvestmentValue || 0, result.p3InvestmentValue || 0);
      acc.partnerInvestmentValue = Math.max(acc.partnerInvestmentValue || 0, result.partnerInvestmentValue || 0);
      return acc;
    }, {});
    total.margin = total.revenue ? total.ownResult / total.revenue * 100 : 0;
    total.totalCostPerKWh = total.commercialEnergy > 0 ? total.totalOperatingCost / total.commercialEnergy : null;
    total.paybackMonths = total.paybackInvestmentValue > 0 && total.paybackBase > 0 ? total.paybackInvestmentValue / total.paybackBase : 0;
    total.roiMonthly = total.paybackInvestmentValue > 0 ? total.paybackBase / total.paybackInvestmentValue * 100 : 0;
    total.operationModel = monthly.at(-1)?.result?.operationModel || 'uby';
    return { ...unit, finance: total, financeMonths: monthly };
  });
}

// Página dedicada só ao financeiro (financeiro.html): reaproveita o mesmo
// motor, renderizando apenas as seções financeiras.

function countDetailedCharges() {
  return Object.values(allRechargeRecords || {}).reduce((sum, record) => sum + (Array.isArray(record?.charges) ? record.charges.length : 0), 0);
}

function financeUnitOutcome(finance = {}) {
  const model = normalizeOperationModel(finance.operationModel);
  if (model === 'management_only') {
    return { label: 'Receita P3 de gestao', value: Number(finance.p3OperationalResult || 0), destination: 'P3' };
  }
  if (model === 'third_party_management') {
    return { label: 'P3 + royalty UBY', value: Number(finance.p3OperationalResult || 0) + Number(finance.ubyRoyalty || 0), destination: 'P3 e UBY' };
  }
  if (model === 'p3_society') {
    return { label: 'Resultado P3 na parceria', value: Number(finance.p3OperationalResult || 0), destination: 'P3' };
  }
  return { label: 'Resultado UBY', value: Number(finance.ubyNet || 0), destination: 'UBY' };
}

function scheduledPaymentApplies(item, monthKeyValue) {
  if (!item?.enabled || !/^\d{4}-\d{2}$/.test(monthKeyValue || '')) return false;
  if (item.scheduledPayment) return (!item.startMonth || item.startMonth <= monthKeyValue) && (!item.endMonth || item.endMonth >= monthKeyValue);
  return matrizCashAmount(item, monthKeyValue) > 0;
}

function scheduledPaymentDueDate(item, monthKeyValue) {
  const [year, month] = String(monthKeyValue).split('-').map(Number);
  const day = Math.min(Math.max(1, Number(item.dueDay || 1)), new Date(year, month, 0).getDate());
  return new Date(year, month - 1, day, 12, 0, 0);
}

function scheduledPaymentTarget(item) {
  const target = item?.targets?.[0] || {};
  const targets = Array.isArray(item?.targets) ? item.targets : [];
  return { workId: String(target.workId || String(target.scope || '').split('::')[0] || ''), station: target.station || (item?.scheduledPayment ? '' : 'Matriz UBY'), workName: target.workName || '', targetCount: targets.length };
}

function scheduledPaymentStatus(item, monthKeyValue, now = new Date()) {
  if (item.paymentLedger?.[monthKeyValue]?.status === 'paid') return { key: 'paid', label: 'Pago', className: 'positive' };
  const due = scheduledPaymentDueDate(item, monthKeyValue);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
  if (dueDay < today) return { key: 'overdue', label: 'Vencido', className: 'negative' };
  if (dueDay.getTime() === today.getTime()) return { key: 'today', label: 'Vence hoje', className: 'warn' };
  if (dueDay <= nextWeek) return { key: 'soon', label: 'Próximos 7 dias', className: 'warn' };
  return { key: 'pending', label: 'Programado', className: '' };
}

function fileDate(file) {
  if (!file) return null;
  if (Number(file.lastModified) > 0) return new Date(Number(file.lastModified));
  if (file.importedAt) {
    const imported = new Date(file.importedAt);
    if (!Number.isNaN(imported.getTime())) return imported;
  }
  return null;
}

function reportEndForCharges(charges) {
  const dates = charges.map(c => c.startDate).filter(Boolean);
  const endDates = charges.map(c => c.endDate).filter(Boolean);
  const lastChargeEnd = endDates.length ? new Date(Math.max(...endDates)) : (dates.length ? new Date(Math.max(...dates)) : null);
  const files = new Set(charges.map(c => c._file).filter(Boolean));
  const fileDates = loadedFiles
    .filter(file => files.has(file?.name))
    .map(fileDate)
    .filter(Boolean);
  const reportEnd = fileDates.length ? new Date(Math.max(...fileDates)) : lastChargeEnd;
  if (lastChargeEnd && reportEnd && reportEnd < lastChargeEnd) return lastChargeEnd;
  return reportEnd || lastChargeEnd;
}

function isCurrentMonthKey(mk = '', now = new Date()) {
  return String(mk || '') === monthKey(now);
}

function livePeriodEndForMonth(mk = '', mode = selectedPeriodMode(), importedEnd = null, now = new Date()) {
  if (mode === 'closed' || !isCurrentMonthKey(mk, now)) return importedEnd;
  const monthEnd = monthEndDate(mk);
  // The live reading uses the current clock instead of freezing at import time.
  return now > monthEnd ? monthEnd : now;
}

function periodBounds(charges) {
  const dates = charges.map(c => c.startDate).filter(Boolean);
  if (!dates.length) return { start: null, end: null, hours: 0 };
  const minD = new Date(Math.min(...dates));
  const start = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
  const end = reportEndForCharges(charges);
  const hours = end ? Math.max((end - start) / 3_600_000, 0) : 0;
  return { start, end, hours };
}

function monthStartDate(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0);
}

function monthEndDate(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59);
}

function effectiveMonthStart(mk, operationStart = null) {
  const monthStart = monthStartDate(mk);
  const firstOperation = operationStart && typeof operationStart.getTime === 'function'
    ? new Date(operationStart)
    : parseDate(operationStart);
  if (!firstOperation || Number.isNaN(firstOperation.getTime())) return monthStart;
  const operationDay = new Date(firstOperation.getFullYear(), firstOperation.getMonth(), firstOperation.getDate(), 0, 0, 0);
  return operationDay > monthStart ? operationDay : monthStart;
}

function periodWindow(monthCharges, mk, mode = selectedPeriodMode(), operationStart = null) {
  const monthStart = monthStartDate(mk);
  const monthEnd = monthEndDate(mk);
  const importedEnd = reportEndForCharges(monthCharges);
  let end = mode === 'closed' ? monthEnd : (livePeriodEndForMonth(mk, mode, importedEnd) || importedEnd || monthEnd);
  if (end > monthEnd) end = monthEnd;
  const activeStart = effectiveMonthStart(mk, operationStart || (currentWorkId ? currentWorkOperationStart() : null));
  if (activeStart >= monthEnd) return { start: activeStart, end: activeStart, hours: 0, mode, monthKey: mk };
  let start = activeStart;
  const days = Number(mode);
  if (Number.isFinite(days) && days > 0) {
    start = new Date(end.getTime() - days * 86_400_000);
    if (start < activeStart) start = activeStart;
  }
  const hours = Math.max((end - start) / 3_600_000, 0);
  return { start, end, hours, mode, monthKey: mk };
}

function filterChargesByWindow(charges, window) {
  if (!window?.start || !window?.end) return charges;
  return charges.filter(charge => {
    if ((window.mode === 'mtd' || window.mode === 'closed') && chargeMonthKey(charge) === window.monthKey) return true;
    return charge.startDate && charge.startDate >= window.start && charge.startDate <= window.end;
  });
}

function occByInterval(charges, powerOverride, boundsOverride, context = {}) {
  const power = Number.isFinite(Number(powerOverride)) ? Number(powerOverride) : getPower();
  const bounds = boundsOverride || periodBounds(charges);
  if (!bounds.start || !bounds.end || !bounds.hours) return { pct: 0, hours: 0, maxKWh: 0, energy: 0, power };
  const workId = String(context.workId || currentWorkId || '');
  const workName = context.workName || currentWorkName;
  const stationName = context.stationName || currentStationReportName || canonicalStationNameForWork(
    workId,
    charges[0]?.station || workName,
    workName
  );
  const config = stationAvailabilityFor(workId, stationName, workName);
  const hours = stationAvailableHours(config, bounds.start, bounds.end);
  const maxKWh = power * hours;
  const energy = charges.reduce((s, c) => s + c.energyKWh, 0);
  return { pct: maxKWh > 0 ? energy / maxKWh * 100 : 0, hours, maxKWh, energy, power };
}

function availabilityForCurrentCharges(charges = []) {
  const stationName = currentStationReportName || canonicalStationNameForWork(
    currentWorkId,
    charges[0]?.station || currentWorkName,
    currentWorkName
  );
  return stationAvailabilityFor(currentWorkId, stationName, currentWorkName);
}

function courtesyIdentityCandidates(value = '') {
  const text = safeText(value).trim();
  if (!text) return [];
  const phone = normalizePhone(text);
  const email = text.includes('@') ? text.toLowerCase() : '';
  const name = canonicalClientName(text);
  return [
    phone ? `phone:${phone}` : '',
    email ? `email:${email}` : '',
    name.split(' ').length >= 2 ? `name:${name}` : ''
  ].filter(Boolean);
}

function isCourtesyCharge(charge = {}, config = {}) {
  const candidates = new Set([
    clientKeyFromCharge(charge),
    ...courtesyIdentityCandidates(charge.userName),
    ...courtesyIdentityCandidates(charge.userEmail),
    ...courtesyIdentityCandidates(charge.userPhone)
  ].filter(Boolean));
  return (config.courtesyUsers || []).some(person =>
    courtesyIdentityCandidates(person).some(key => candidates.has(key))
  );
}

function courtesyFinanceBreakdown(charges = [], config = {}, energyCostPerKWh = 0) {
  const valid = charges.filter(isExecutedCharge);
  const courtesy = valid.filter(charge => isCourtesyCharge(charge, config));
  const courtesyEnergy = courtesy.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const courtesyRevenue = courtesy.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const treatment = ['operational', 'partner_absorbed', 'uby_absorbed'].includes(config.courtesyTreatment)
    ? config.courtesyTreatment : 'operational';
  const energyCost = courtesyEnergy * Math.max(0, Number(energyCostPerKWh || 0));
  return {
    treatment,
    responsible: safeText(config.courtesyResponsible || '').trim(),
    charges: courtesy.length,
    energy: courtesyEnergy,
    revenue: courtesyRevenue,
    energyCost,
    excludedFromUby: treatment === 'partner_absorbed' ? energyCost : 0,
    commercialEnergy: Math.max(charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0) - courtesyEnergy, 0)
  };
}

function occByFullMonth(charges, mk) {
  const [y, m] = mk.split('-');
  const power  = getPower();
  const start = monthStartDate(mk);
  const end = new Date(Number(y), Number(m), 1, 0, 0, 0);
  const stationName = currentStationReportName || canonicalStationNameForWork(
    currentWorkId,
    charges[0]?.station || currentWorkName,
    currentWorkName
  );
  const hours = stationAvailableHours(stationAvailabilityFor(currentWorkId, stationName, currentWorkName), start, end);
  const maxKWh = power * hours;
  const energy = charges.reduce((s, c) => s + c.energyKWh, 0);
  return { pct: maxKWh > 0 ? energy / maxKWh * 100 : 0, hours, maxKWh, energy, power, days: daysInMonth(y, m) };
}

// ── Destroy chart ─────────────────────────────────────────

function recentCharges(charges = [], days = 7) {
  const dated = charges.filter(c => c.startDate && !Number.isNaN(c.startDate.getTime()));
  if (!dated.length) return { charges: [], labels: [] };
  const maxDate = new Date(Math.max(...dated.map(c => c.startDate)));
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  const labels = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  });
  return { charges: dated.filter(c => c.startDate >= start && c.startDate <= end), labels, start, end };
}

function chargeDayLabel(charge) {
  const d = charge.startDate;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function dayLabelFromDate(date) {
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Uma única recarga com data corrompida (ex.: ano errado numa planilha
// importada) fazia os laços dia-a-dia abaixo iterarem por milhares de anos,
// criando milhões de objetos Date e congelando a página inteira — mesmo com
// pouquíssimos registros. Este limite considera plausível apenas datas de
// 2015 até o ano que vem.

function isPlausibleChargeDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= 2015 && year <= new Date().getFullYear() + 1;
}

// Teto de segurança absoluto: nenhuma série diária real passa de ~11 anos.
// Se algo escapar da sanitização, o laço para em vez de travar o navegador.

const MAX_DAILY_RANGE_DAYS = 4000;

function eachDateInRange(start, end) {
  if (!start || !end) return [];
  const rows = [];
  const cursor = dateOnly(start);
  const limit = dateOnly(end);
  let guard = 0;
  while (cursor <= limit && guard < MAX_DAILY_RANGE_DAYS) {
    rows.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return rows;
}

function calendarDayCount(start, end) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return 0;
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return 0;
  return eachDateInRange(start, end).length;
}

function dailySeriesBounds(dated = []) {
  if (!dated.length) return null;
  // Ignora datas implausíveis (corrompidas) para não estourar o intervalo.
  const plausible = dated.filter(charge => isPlausibleChargeDate(charge.startDate));
  if (!plausible.length) return null;
  dated = plausible;
  const minDate = new Date(Math.min(...dated.map(charge => charge.startDate)));
  const maxDate = new Date(Math.max(...dated.map(charge => charge.startDate)));
  const sameMonth = dated.every(charge =>
    charge.startDate.getFullYear() === minDate.getFullYear() &&
    charge.startDate.getMonth() === minDate.getMonth()
  );
  if (!sameMonth) return { start: minDate, end: maxDate };
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const today = new Date();
  const monthEnd = new Date(minDate.getFullYear(), minDate.getMonth() + 1, 0);
  const end = today.getFullYear() === minDate.getFullYear() && today.getMonth() === minDate.getMonth()
    ? new Date(Math.min(today, monthEnd))
    : monthEnd;
  return { start, end: maxDate > end ? maxDate : end };
}

function chargeDayKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function firstClientDayMap(charges = []) {
  const firstClientDay = {};
  charges
    .filter(c => c.startDate && !Number.isNaN(c.startDate.getTime()))
    .slice()
    .sort((a, b) => a.startDate - b.startDate)
    .forEach(charge => {
      const client = clientKeyFromCharge(charge);
      if (!client) return;
      firstClientDay[client] ||= chargeDayKeyFromDate(charge.startDate);
    });
  return firstClientDay;
}

function dailyOperationalRows(charges = [], historyCharges = charges) {
  // A leitura diária precisa usar a mesma regra de sessão executada do
  // fechamento/exportação. Falhas continuam aparecendo no contador próprio,
  // mas não inflam recargas, faturamento, energia ou clientes atendidos.
  const dated = charges.filter(c => c.startDate && !Number.isNaN(c.startDate.getTime()));
  if (!dated.length) return [];
  const history = (historyCharges?.length ? historyCharges : charges)
    .filter(c => c.startDate && !Number.isNaN(c.startDate.getTime()))
    .filter(isExecutedCharge);
  const firstClientDay = firstClientDayMap(history);
  const byDay = {};
  const bounds = dailySeriesBounds(dated);
  eachDateInRange(bounds.start, bounds.end).forEach(date => {
    const key = chargeDayKeyFromDate(date);
    byDay[key] = { key, date, label: dayLabelFromDate(date), revenue: 0, energy: 0, count: 0, clients: new Set(), newClients: new Set(), failed: 0 };
  });
  dated.forEach(charge => {
    const key = chargeDayKeyFromDate(charge.startDate);
    if (!byDay[key]) {
      const date = dateOnly(charge.startDate);
      byDay[key] = { key, date, label: chargeDayLabel(charge), revenue: 0, energy: 0, count: 0, clients: new Set(), newClients: new Set(), failed: 0 };
    }
    if (isFailedCharge(charge)) byDay[key].failed += 1;
    if (!isExecutedCharge(charge)) return;
    const client = clientKeyFromCharge(charge);
    byDay[key].revenue += Number(charge.revenue || 0);
    byDay[key].energy += Number(charge.energyKWh || 0);
    byDay[key].count += 1;
    if (client) byDay[key].clients.add(client);
    if (client && firstClientDay[client] === key) byDay[key].newClients.add(client);
  });
  const rows = Object.values(byDay).sort((a, b) => a.date - b.date);
  rows.forEach((row, index) => {
    const prev = rows[index - 1]?.revenue || 0;
    row.growthPct = prev > 0 ? (row.revenue - prev) / prev * 100 : (row.revenue > 0 ? 100 : 0);
    row.clientCount = row.clients.size;
    row.newClientCount = row.newClients.size;
  });
  return rows;
}

// Métricas de curto prazo não podem reiniciar no dia 1. A referência é o
// último dia do filtro atual, mas as recargas vêm do histórico contínuo para
// que os 7 dias anteriores atravessem corretamente a virada de mês.

function continuousOperationalRows(charges = [], historyCharges = charges, days = 14) {
  const selected = charges.filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()));
  const history = (historyCharges?.length ? historyCharges : charges)
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()));
  if (!selected.length || !history.length) return [];
  const end = new Date(Math.max(...selected.map(charge => charge.startDate)));
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (Math.max(14, days) - 1));
  start.setHours(0, 0, 0, 0);
  return dailyOperationalRows(history.filter(charge => charge.startDate >= start && charge.startDate <= end), history);
}

const WEEKDAY_LABELS_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const WEEKDAY_ORDER_BR = [1, 2, 3, 4, 5, 6, 0];

function shiftToPreviousMonth(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth() - 1;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(date.getDate(), lastDay), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

function summaryMetrics(charges = []) {
  const clean = cleanOperationStats(charges);
  const validDurations = clean.executed.map(charge => durToHours(charge.duration)).filter(hours => hours > 0);
  const revenue = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const count = charges.length;
  return {
    revenue,
    energy,
    count,
    clients: new Set(charges.map(charge => clientKeyFromCharge(charge)).filter(Boolean)).size,
    clean,
    avgTicket: count ? revenue / count : 0,
    revenuePerKwh: energy ? revenue / energy : 0,
    avgKwh: clean.avgKwh,
    avgDuration: validDurations.length
      ? validDurations.reduce((sum, hours) => sum + hours, 0) / validDurations.length
      : 0,
    idleValue: charges.reduce((sum, charge) => sum + Number(charge.idleValue || 0), 0),
    failedCount: charges.filter(charge => isFailedCharge(charge)).length
  };
}

function monthlyEquivalentComparison(charges = [], historyCharges = charges, bounds, occ, power) {
  const dated = (historyCharges || []).filter(charge => isPlausibleChargeDate(charge?.startDate));
  const fallbackEnd = dated.reduce((latest, charge) => !latest || charge.startDate > latest ? charge.startDate : latest, null);
  const end = bounds?.end instanceof Date && !Number.isNaN(bounds.end.getTime()) ? new Date(bounds.end) : fallbackEnd;
  if (!end) return { hasPrevious: false, label: 'sem base', metrics: summaryMetrics([]), occupation: 0 };

  const start = bounds?.start instanceof Date && !Number.isNaN(bounds.start.getTime())
    ? new Date(bounds.start)
    : new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
  const previousStart = shiftToPreviousMonth(start);
  const previousEnd = shiftToPreviousMonth(end);
  if (!previousStart || !previousEnd || previousEnd < previousStart) {
    return { hasPrevious: false, label: 'sem base', metrics: summaryMetrics([]), occupation: 0 };
  }

  const previousCharges = dated.filter(charge => charge.startDate >= previousStart && charge.startDate <= previousEnd);
  const metrics = summaryMetrics(previousCharges);
  const previousMonthKey = `${previousEnd.getFullYear()}-${String(previousEnd.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  const coversWholeMonth = start.getDate() === 1 && end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  const label = coversWholeMonth
    ? `vs ${monthLabel(previousMonthKey)}`
    : `vs ${monthLabel(previousMonthKey)} (1-${previousEnd.getDate()})`;

  let occupation = 0;
  const exactCapacity = Number(occ?.maxKWh || 0);
  if (exactCapacity > 0) {
    occupation = occByInterval(previousCharges, power, {
      start: previousStart,
      end: previousEnd,
      hours: Math.max((previousEnd - previousStart) / 3_600_000, 0),
      monthKey: previousMonthKey
    }).pct;
  } else {
    const currentEnergy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
    occupation = currentEnergy > 0 ? Number(occ?.pct || 0) * metrics.energy / currentEnergy : 0;
  }

  return {
    hasPrevious: previousCharges.length > 0,
    label,
    metrics,
    occupation,
    currentMonthKey,
    previousStart,
    previousEnd
  };
}

function occupationBand(value = 0) {
  const pct = Math.max(0, Number(value) || 0);
  if (pct <= 5) return { className: 'occ-red', label: 'critica', range: 'ate 5%' };
  if (pct <= 10) return { className: 'occ-yellow', label: 'atencao', range: 'de 5% a 10%' };
  if (pct <= 20) return { className: 'occ-blue', label: 'em evolucao', range: 'de 10% a 20%' };
  return { className: 'occ-green', label: 'forte', range: 'acima de 20%' };
}

function weekdayOccupancyRows(charges = [], power = getPower(), bounds = null) {
  const groups = {};
  WEEKDAY_ORDER_BR.forEach(idx => {
    groups[idx] = { idx, label: WEEKDAY_LABELS_BR[idx], dates: new Set(), revenue: 0, energy: 0, count: 0, clients: new Set(), failed: 0 };
  });
  const validDates = charges
    .map(charge => charge.startDate)
    .filter(date => isPlausibleChargeDate(date));
  const startBound = bounds?.start || (validDates.length ? new Date(Math.min(...validDates)) : null);
  const endBound = bounds?.end || (validDates.length ? new Date(Math.max(...validDates)) : null);
  const availability = availabilityForCurrentCharges(charges);
  if (startBound && endBound) {
    const cursor = new Date(startBound.getFullYear(), startBound.getMonth(), startBound.getDate(), 0, 0, 0);
    const endDay = new Date(endBound.getFullYear(), endBound.getMonth(), endBound.getDate(), 0, 0, 0);
    let guard = 0;
    while (cursor <= endDay && guard < MAX_DAILY_RANGE_DAYS) {
      const idx = cursor.getDay();
      groups[idx].dates.add(dateKeyLocal(cursor));
      // Recorta as horas disponíveis desse dia ao intervalo real [startBound,
      // endBound] — o dia de hoje (ainda em andamento) conta só as horas já
      // passadas, igual ao card "Ocupação do período" (occByInterval /
      // stationAvailableHours). Sem isso, o dia corrente era contado com 24h
      // fixas aqui mas com horas reais lá, gerando dois % de ocupação
      // diferentes pro mesmo dia.
      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const overlapStart = Math.max(dayStart.getTime(), startBound.getTime());
      const overlapEnd = Math.min(dayEnd.getTime(), endBound.getTime());
      groups[idx].hours = (groups[idx].hours || 0) + stationAvailableHours(
        availability,
        new Date(overlapStart),
        new Date(overlapEnd)
      );
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
  }
  charges
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()))
    .forEach(charge => {
      const idx = charge.startDate.getDay();
      const group = groups[idx] || (groups[idx] = { idx, label: WEEKDAY_LABELS_BR[idx], dates: new Set(), revenue: 0, energy: 0, count: 0, clients: new Set(), failed: 0 });
      const client = clientKeyFromCharge(charge);
      group.dates.add(chargeDayKeyFromDate(charge.startDate));
      group.revenue += Number(charge.revenue || 0);
      group.energy += Number(charge.energyKWh || 0);
      group.count += 1;
      if (client) group.clients.add(client);
      if (isFailedCharge(charge)) group.failed += 1;
    });
  return WEEKDAY_ORDER_BR.map(idx => {
    const row = groups[idx];
    const days = row.dates.size || 0;
    const validCount = Math.max(0, row.count - row.failed);
    const maxKWh = Math.max(Number(power) || 0, 0) * (row.hours || 0);
    const occ = maxKWh > 0 ? row.energy / maxKWh * 100 : 0;
    return {
      ...row,
      days,
      clientCount: row.clients.size,
      validCount,
      occ,
      avgRevenue: days ? row.revenue / days : 0,
      avgKwh: validCount ? row.energy / validCount : 0,
      avgTicket: validCount ? row.revenue / validCount : 0
    };
  });
}

function rangeRevenue(rows = [], days = 1, offsetDays = 0) {
  if (!rows.length) return { revenue: 0, count: 0, newClients: 0 };
  const last = rows[rows.length - 1].date;
  const end = new Date(last);
  end.setDate(end.getDate() - offsetDays);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  const selected = rows.filter(row => row.date >= start && row.date <= end);
  return {
    revenue: selected.reduce((sum, row) => sum + row.revenue, 0),
    count: selected.reduce((sum, row) => sum + row.count, 0),
    newClients: selected.reduce((sum, row) => sum + row.newClientCount, 0)
  };
}

function dateKeyLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function pctChange(current = 0, previous = 0) {
  if (previous > 0) return (current - previous) / previous * 100;
  return current > 0 ? 100 : 0;
}

function rechargeControlIssue(charge = {}) {
  const text = normalizeTextForInsight([
    charge.rawStatus,
    charge.paymentStatus,
    charge.paymentType,
    charge.failureReason
  ].filter(Boolean).join(' '));
  if (/(falha|erro|cancel|recus|negad|expir|timeout|interromp|incomplet|nao conclu|sem sucesso|failed|declin|invalid|invalido)/.test(text)) {
    return { type: 'reported', label: safeText(charge.failureReason || charge.rawStatus || charge.paymentStatus || 'falha informada pela plataforma').trim() };
  }
  const energy = Number(charge.energyKWh || 0);
  const revenue = Number(charge.revenue || 0);
  if (energy <= 0.25 && revenue <= 1) {
    return { type: 'near_zero', label: 'energia e faturamento proximos de zero (sinalizado pela importacao)' };
  }
  return null;
}

function isFailedCharge(charge = {}) {
  return Boolean(rechargeControlIssue(charge));
}

function isExecutedCharge(charge = {}) {
  const energy = Number(charge.energyKWh || 0);
  const revenue = Number(charge.revenue || 0);
  const durationHours = durToHours(charge.duration);
  if (isFailedCharge(charge)) return false;
  if (energy <= 0.2) return false;
  if (durationHours > 0 && durationHours < 0.08 && energy < 1) return false;
  if (durationHours <= 0 && revenue <= 0) return false;
  return true;
}

function cleanOperationStats(charges = []) {
  const executed = charges.filter(isExecutedCharge);
  const removed = charges.filter(charge => !isExecutedCharge(charge));
  const energy = executed.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const revenue = executed.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const duration = executed.reduce((sum, charge) => sum + durToHours(charge.duration), 0);
  const failed = charges.filter(isFailedCharge);
  const shortOrZero = removed.filter(charge => !isFailedCharge(charge));
  return {
    total: charges.length,
    executed,
    removed,
    failed,
    shortOrZero,
    energy,
    revenue,
    duration,
    avgKwh: executed.length ? energy / executed.length : 0,
    avgTicket: executed.length ? revenue / executed.length : 0,
    avgPower: duration > 0 ? energy / duration : 0,
    validPct: charges.length ? executed.length / charges.length * 100 : 0
  };
}

function clientDisplayName(charge = {}) {
  return safeText(charge.userName || charge.userEmail || 'Cliente sem nome').trim();
}

function rechargeSourcePlatform(charge = {}) {
  const direct = safeText(charge.sourcePlatform || charge.platform).trim();
  if (direct) return direct;

  const fileKey = safeText(charge._fileKey).trim();
  const fileName = safeText(charge._file).trim();
  const importedFile = loadedFiles.find(file =>
    (fileKey && file?.fileKey === fileKey) ||
    (!fileKey && fileName && file?.name === fileName)
  );
  const fromFile = safeText(importedFile?.sourcePlatform).trim();
  if (fromFile) return fromFile;
  // NOVA PLATAFORMA (25/09/2026): sessões lidas do Supabase não trazem a
  // plataforma e loadedFiles fica vazio, o que zerava a regra Spott. O layout
  // Spott grava a coluna "Aplicativo" em paymentType ("Spott") e os arquivos
  // exportados pelo Spott se chamam "lista-de-transacoes".
  if (normalizeHeaderName(charge.paymentType) === 'spott' || /lista-de-transacoes/i.test(fileName)) return 'Spott';
  if (normalizeHeaderName(charge.paymentType) === 'raio') return 'Raio';
  return '';
}

function isSpottRecharge(charge = {}) {
  return normalizeHeaderName(rechargeSourcePlatform(charge)) === 'spott';
}

function recurringAbsentClients(charges = [], recentDays = 7, minSessions = 2) {
  const valid = charges
    .filter(isExecutedCharge)
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()));
  if (!valid.length) return [];
  const maxDate = new Date(Math.max(...valid.map(charge => charge.startDate)));
  const cutoff = new Date(maxDate);
  cutoff.setDate(cutoff.getDate() - recentDays);
  cutoff.setHours(0, 0, 0, 0);
  const byClient = {};
  valid.forEach(charge => {
    const key = clientKeyFromCharge(charge);
    if (!key) return;
    if (!byClient[key]) {
      byClient[key] = {
        key,
        name: clientDisplayName(charge),
        email: charge.userEmail || '',
        station: charge.station || charge.workName || '',
        count: 0,
        energy: 0,
        revenue: 0,
        lastDate: null,
        dates: []
      };
    }
    const item = byClient[key];
    item.count += 1;
    item.energy += Number(charge.energyKWh || 0);
    item.revenue += Number(charge.revenue || 0);
    item.dates.push(charge.startDate);
    if (!item.lastDate || charge.startDate > item.lastDate) item.lastDate = charge.startDate;
  });
  return Object.values(byClient)
    .filter(item => item.count >= minSessions && item.lastDate && item.lastDate < cutoff)
    .map(item => {
      item.daysAbsent = Math.max(0, Math.floor((maxDate - item.lastDate) / 86_400_000));
      item.avgKwh = item.count ? item.energy / item.count : 0;
      item.avgTicket = item.count ? item.revenue / item.count : 0;
      return item;
    })
    // Quem mais faturou historicamente vem primeiro: é a ausência com maior valor em risco.
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count || b.daysAbsent - a.daysAbsent);
}

function networkHistoryCharges(fallback = []) {
  if (networkHistoryCache && networkHistoryCacheVersion === rechargeRecordsVersion) {
    return networkHistoryCache;
  }
  try {
    const rows = getAllGeneralCharges(getGeneralUnitData());
    networkHistoryCache = rows.length ? rows : fallback;
    networkHistoryCacheVersion = rechargeRecordsVersion;
    return networkHistoryCache;
  } catch (_) {
    return fallback;
  }
}

function clientStationKey(charge = {}) {
  const workId = safeText(charge.workId || '').trim().toLowerCase();
  const station = canonicalStationNameForWork(workId, charge.station, charge.workName);
  return `${workId || normalizeStationForCompare(station)}|${normalizeStationForCompare(station)}`;
}

function clientStationLabel(charge = {}) {
  return safeText(canonicalStationNameForWork(charge.workId, charge.station, charge.workName) || charge.station || charge.workName || 'ESTAÇÃO').trim().toUpperCase();
}

function abbreviatedStationLabel(label = '') {
  const normalized = safeText(label).trim().toUpperCase()
    .replace(/^UBY\s+RECHARGE\s*-?\s*/, '')
    .replace(/^POSTO\s+/, '');
  return normalized.length > 20 ? `${normalized.slice(0, 18).trim()}…` : (normalized || 'ESTAÇÃO');
}

function uniqueClientStationLabels(charges = [], client = '') {
  return [...new Set(charges
    .filter(charge => clientKeyFromCharge(charge) === client)
    .map(clientStationLabel)
    .filter(Boolean))];
}

function firstChargeByClient(charges = [], byStation = false) {
  const first = {};
  charges
    .filter(isExecutedCharge)
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()))
    .slice()
    .sort((a, b) => a.startDate - b.startDate)
    .forEach(charge => {
      const client = clientKeyFromCharge(charge);
      if (!client) return;
      const key = byStation ? `${client}|${clientStationKey(charge)}` : client;
      if (!first[key]) first[key] = charge;
    });
  return first;
}

function newClientInsights(charges = [], stationHistory = charges, networkHistory = stationHistory) {
  const validPeriod = charges.filter(isExecutedCharge);
  const periodKeys = new Set(validPeriod.map(clientKeyFromCharge).filter(Boolean));
  const globalHistory = networkHistory?.length ? networkHistory : stationHistory;
  const globalFirst = firstChargeByClient(globalHistory);
  const stationFirst = firstChargeByClient(stationHistory?.length ? stationHistory : charges, true);
  const stationsByClient = {};
  globalHistory.filter(isExecutedCharge).forEach(charge => {
    const client = clientKeyFromCharge(charge);
    if (client) (stationsByClient[client] ||= new Set()).add(clientStationKey(charge));
  });
  const firstInPeriod = (firstCharge, client) => firstCharge && periodKeys.has(client) && validPeriod.some(charge =>
    clientKeyFromCharge(charge) === client && rechargeUniqueKey(charge) === rechargeUniqueKey(firstCharge)
  );
  const newNetwork = [];
  const newStationExisting = [];
  const multiStation = new Set();
  periodKeys.forEach(client => {
    const representative = validPeriod.find(charge => clientKeyFromCharge(charge) === client);
    const firstNetworkCharge = globalFirst[client];
    const firstStationCharge = stationFirst[`${client}|${clientStationKey(representative || firstNetworkCharge || {})}`];
    if (firstInPeriod(firstNetworkCharge, client)) newNetwork.push(firstNetworkCharge);
    else if (firstInPeriod(firstStationCharge, client)) newStationExisting.push(firstStationCharge);
    if ((stationsByClient[client]?.size || 0) > 1) multiStation.add(client);
  });
  const toRow = charge => {
    const client = clientKeyFromCharge(charge);
    const startedAt = clientStationLabel(charge);
    const allStations = uniqueClientStationLabels(globalHistory, client);
    const previousStations = [...new Set(globalHistory
      .filter(item => clientKeyFromCharge(item) === client && item.startDate && item.startDate < charge.startDate)
      .map(clientStationLabel)
      .filter(label => label && label !== startedAt))];
    return {
      name: charge.userName || charge.userEmail || 'Cliente sem nome',
      phone: charge.userPhone || '',
      email: charge.userEmail || '',
      firstDate: charge.startDate,
      revenue: Number(charge.revenue || 0),
      energy: Number(charge.energyKWh || 0),
      startedAt,
      previousStations,
      allStations
    };
  };
  return {
    newNetwork: newNetwork.map(toRow).sort((a, b) => b.firstDate - a.firstDate),
    newStationExisting: newStationExisting.map(toRow).sort((a, b) => b.firstDate - a.firstDate),
    multiStation: multiStation.size
  };
}

function monthlyClientCohorts(historyCharges = []) {
  const byClient = {};
  historyCharges
    .filter(isExecutedCharge)
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()))
    .slice()
    .sort((a, b) => a.startDate - b.startDate)
    .forEach(charge => {
      const client = clientKeyFromCharge(charge);
      if (client) (byClient[client] ||= []).push(charge);
    });
  const cohorts = {};
  Object.values(byClient).forEach(clientCharges => {
    const first = clientCharges[0];
    const key = monthKey(first.startDate);
    if (!key || key === 'unknown') return;
    const cohort = cohorts[key] ||= { key, newClients: 0, recurring: 0, firstRevenue: 0 };
    cohort.newClients += 1;
    cohort.firstRevenue += Number(first.revenue || 0);
    if (clientCharges.some(charge => rechargeUniqueKey(charge) !== rechargeUniqueKey(first) && charge.startDate > first.startDate)) cohort.recurring += 1;
  });
  return Object.values(cohorts).sort((a, b) => b.key.localeCompare(a.key));
}

function clientRecurrenceStats(charges = []) {
  const byClient = {};
  charges.forEach(charge => {
    const key = clientKeyFromCharge(charge);
    if (!key) return;
    byClient[key] = (byClient[key] || 0) + 1;
  });
  const total = Object.keys(byClient).length;
  const recurring = Object.values(byClient).filter(count => count > 1).length;
  return { total, recurring, pct: total ? recurring / total * 100 : 0 };
}

function usageSeries(charges = []) {
  const recent = recentCharges(charges, 7);
  const byDay = Object.fromEntries(recent.labels.map(label => [label, { duration: 0, count: 0, energy: 0, revenue: 0, idleValue: 0 }]));
  const stayBuckets = {
    '<10min': 0,
    '10-20min': 0,
    '20-30min': 0,
    '30-40min': 0,
    '40min-1h': 0,
    '1-2h': 0,
    '2-4h': 0,
    '4-6h+': 0
  };
  const byHour = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), 0]));
  const byCoupon = {};
  const noCoupon = { coupon: 'Sem cupom', count: 0, energy: 0, revenue: 0, discount: 0 };

  recent.charges.forEach(charge => {
    const label = chargeDayLabel(charge);
    const duration = durToHours(charge.duration);
    const energy = Number(charge.energyKWh || 0);
    const revenue = Number(charge.revenue || 0);
    const idleValue = Number(charge.idleValue || 0);
    if (byDay[label]) {
      byDay[label].duration += duration;
      byDay[label].count += 1;
      byDay[label].energy += energy;
      byDay[label].revenue += revenue;
      byDay[label].idleValue += idleValue;
    }
    const durationMin = duration * 60;
    if (durationMin < 10) stayBuckets['<10min'] += 1;
    else if (durationMin < 20) stayBuckets['10-20min'] += 1;
    else if (durationMin < 30) stayBuckets['20-30min'] += 1;
    else if (durationMin < 40) stayBuckets['30-40min'] += 1;
    else if (durationMin < 60) stayBuckets['40min-1h'] += 1;
    else if (duration < 2) stayBuckets['1-2h'] += 1;
    else if (duration < 4) stayBuckets['2-4h'] += 1;
    else stayBuckets['4-6h+'] += 1;
    byHour[String(charge.startDate.getHours())] += 1;
  });
  charges.forEach(charge => {
    const energy = Number(charge.energyKWh || 0);
    const revenue = Number(charge.revenue || 0);
    const coupon = couponLabelForCharge(charge);
    if (coupon) {
      if (!byCoupon[coupon]) byCoupon[coupon] = { coupon, count: 0, energy: 0, revenue: 0, discount: 0 };
      byCoupon[coupon].count += 1;
      byCoupon[coupon].energy += energy;
      byCoupon[coupon].revenue += revenue;
      byCoupon[coupon].discount += estimatedCouponDiscount(charge, coupon);
    } else {
      noCoupon.count += 1;
      noCoupon.energy += energy;
      noCoupon.revenue += revenue;
    }
  });
  const couponDetails = [noCoupon, ...Object.values(byCoupon)]
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

  return {
    labels: recent.labels,
    duration: recent.labels.map(label => byDay[label].duration),
    count: recent.labels.map(label => byDay[label].count),
    energy: recent.labels.map(label => byDay[label].energy),
    revenue: recent.labels.map(label => byDay[label].revenue),
    idleValue: recent.labels.map(label => byDay[label].idleValue),
    stayLabels: Object.keys(stayBuckets),
    stayValues: Object.values(stayBuckets),
    hourLabels: Object.keys(byHour),
    hourValues: Object.values(byHour),
    couponDetails,
    couponLabels: couponDetails.length ? couponDetails.map(item => item.coupon) : ['Sem cupom'],
    couponValues: couponDetails.length ? couponDetails.map(item => item.count) : [0],
    couponRevenueValues: couponDetails.length ? couponDetails.map(item => item.revenue) : [0]
  };
}

function chargerKind(charge = {}) {
  const raw = `${charge.connType || ''} ${charge.station || ''} ${charge.charger || ''} ${charge.workName || ''}`.toUpperCase();
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const powerMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*KW/);
  const power = powerMatch ? Number(powerMatch[1].replace(',', '.')) : NaN;
  if (/\bDC\b|\bCCS\b|CHADEMO|FAST|RAPID|RAPID[OA]/.test(normalized)) return 'dc';
  if (/\bAC\b|TYPE\s*2|TIPO\s*2/.test(normalized)) return 'ac';
  const station = normalizeStationForCompare(canonicalStationNameForWork(charge.workId, charge.station, charge.workName));
  if (station.includes('robert koch') || isRobertKochWorkId(charge.workId) || isRobertKochCandidateText(raw)) return 'dc';
  if (station.includes('rio beach') || station.includes('santarem')) return 'ac';
  if (Number.isFinite(power)) return power > 30 ? 'dc' : 'ac';
  return 'unknown';
}

// Alguns equipamentos fisicos exportam uma linha por plug/conector. Nestes
// pontos conhecidos, o painel deve contar o carregador uma vez e somar os plugs.

function isSinglePhysicalChargerStation(workId, stationName, workName = '') {
  const station = normalizeStationForCompare(canonicalStationNameForWork(workId, stationName, workName));
  const context = normalizeStationForCompare(`${stationName || ''} ${workName || ''}`);
  return station.includes('robert koch') ||
    station.includes('rio beach') ||
    isUnifiedAuroraAcStation(station) ||
    // Shopping Aurora DC: 5 × 30 kW no mesmo ponto — um carregador só para a operação.
    station.includes('shopping aurora dc') ||
    context.includes('central jk') ||
    context.includes('posto central jk');
}

function chargerKey(charge = {}) {
  const station = canonicalStationNameForWork(charge.workId, charge.station, charge.workName);
  if (isSinglePhysicalChargerStation(charge.workId, station, charge.workName)) {
    return `${station || charge.station || ''}|carregador`.trim().toLowerCase();
  }
  const key = `${station || charge.station || ''}|${charge.connType || ''}`.trim().toLowerCase();
  return key || `${charge.workId || ''}|sem-identificacao`;
}

function ubyOperationKey(charge = {}) {
  return chargerKey(charge);
}

// Chave estavel da unidade. Ela permite marcar uma estacao como UBY antes da
// primeira exportacao e manter essa decisao quando o conector chegar na base.

function stationUbyOperationKey(workId, stationName, workName = '') {
  const station = canonicalStationNameForWork(workId, stationName, workName);
  return `${String(workId || '').trim()}|${normalizeStationForCompare(station)}|station`;
}

function isUbyOperationCharge(charge = {}, overrides = ubyOperationOverrides) {
  const key = ubyOperationKey(charge);
  if (Object.prototype.hasOwnProperty.call(overrides || {}, key)) return !!overrides[key];
  return chargerKind(charge) === 'dc';
}

function isUbyOperationGroup(group = {}, overrides = ubyOperationOverrides) {
  const keys = [group.key, group.stationOverrideKey].filter(Boolean);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides || {}, key)) return !!overrides[key];
  }
  if (isUnifiedAuroraAcStation(group.station)) return true;
  if (group.kind === 'dc') return true;
  return (group.charges || []).some(charge => isUbyOperationCharge(charge, overrides));
}

function ubyOperationRuleSource(group = {}, hasOverride = false, included = false) {
  if (hasOverride) return 'manual';
  if (isUnifiedAuroraAcStation(group.station)) return 'Aurora AC automatico';
  return included ? 'DC automatico' : 'fora por padrao';
}

function generalAcDcStats(charges = []) {
  const stats = {
    acCharges: 0,
    dcCharges: 0,
    unknownCharges: 0,
    acEnergy: 0,
    dcEnergy: 0,
    unknownEnergy: 0,
    acRevenue: 0,
    dcRevenue: 0,
    unknownRevenue: 0,
    acChargers: 0,
    dcChargers: 0
  };
  const acKeys = new Set();
  const dcKeys = new Set();

  charges.forEach(charge => {
    const kind = chargerKind(charge);
    const energy = Number(charge.energyKWh || 0);
    const revenue = Number(charge.revenue || 0);
    if (kind === 'dc') {
      stats.dcCharges += 1;
      stats.dcEnergy += energy;
      stats.dcRevenue += revenue;
      dcKeys.add(chargerKey(charge));
      return;
    }
    if (kind === 'ac') {
      stats.acCharges += 1;
      stats.acEnergy += energy;
      stats.acRevenue += revenue;
      acKeys.add(chargerKey(charge));
      return;
    }
    stats.unknownCharges += 1;
    stats.unknownEnergy += energy;
    stats.unknownRevenue += revenue;
  });

  stats.acChargers = acKeys.size || (stats.acCharges ? 1 : 0);
  stats.dcChargers = dcKeys.size || (stats.dcCharges ? 1 : 0);
  return stats;
}

function getGeneralUnitData() {
  syncGeneralRecordsFromLocal();
  if (generalUnitDataCache?.version === rechargeRecordsVersion) {
    return generalUnitDataCache.data;
  }
  const data = Object.values(allRechargeRecords)
    .map(record => {
      const charges = (record.charges || [])
        .map(hydrateCharge)
        .filter(charge => !stationBlockedForWork(record.workId, charge.station))
        .filter(charge => chargeBelongsToWork(charge, record.workId, record.workName || workNameById(record.workId)));
      const summary = record.summary || {};
      const summaryCount = Number(summary.charges || 0);
      const hasDetailCharges = charges.length > 0;
      const energy = hasDetailCharges ? charges.reduce((sum, charge) => sum + charge.energyKWh, 0) : Number(summary.energyKWh || 0);
      const revenue = hasDetailCharges ? charges.reduce((sum, charge) => sum + charge.revenue, 0) : Number(summary.revenue || 0);
      const clients = hasDetailCharges ? new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size : Number(summary.clients || 0);
      const dates = hasDetailCharges
        ? charges.map(charge => charge.startDate).filter(Boolean)
        : [summary.firstDate ? new Date(summary.firstDate) : null, summary.lastDate ? new Date(summary.lastDate) : null].filter(Boolean);
      const stations = [...new Set(charges.map(charge => canonicalStationNameForWork(record.workId, charge.station, record.workName || workNameById(record.workId))).filter(Boolean))];
      const acdc = generalAcDcStats(charges);
      return {
        workId: record.workId,
        workName: record.workName || workNameById(record.workId),
        stationName: stations[0] || record.workName || workNameById(record.workId),
        stations,
        files: record.files || [],
        charges,
        ubyOperationOverrides: record.ubyOperationOverrides || record.summary?.ubyOperationOverrides || {},
        count: hasDetailCharges ? charges.length : summaryCount,
        energy,
        revenue,
        clients,
        avgTicket: (hasDetailCharges ? charges.length : summaryCount) ? revenue / (hasDetailCharges ? charges.length : summaryCount) : 0,
        lastDate: dates.length ? new Date(Math.max(...dates)) : null,
        acdc,
        updatedAt: record.updatedAt || ''
      };
    })
    .filter(unit => unit.count > 0)
    .filter(unit => !workExcludedFromRecharge(unit.workName, unit.stationName, ...(unit.stations || [])))
    .sort((a, b) => b.revenue - a.revenue);
  generalUnitDataCache = { version: rechargeRecordsVersion, data };
  return data;
}

function summarizeGeneralUnit(unit, charges) {
  const hydrated = (charges || []).map(hydrateCharge);
  const energy = hydrated.reduce((sum, charge) => sum + charge.energyKWh, 0);
  const revenue = hydrated.reduce((sum, charge) => sum + charge.revenue, 0);
  const clients = new Set(hydrated.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const dates = hydrated.map(charge => charge.startDate).filter(Boolean);
  const stations = [...new Set(hydrated.map(charge => canonicalStationNameForWork(unit.workId, charge.station, unit.workName)).filter(Boolean))];
  return {
    ...unit,
    stationName: stations[0] || unit.stationName || unit.workName,
    stations: stations.length ? stations : (unit.stations || []),
    charges: hydrated,
    count: hydrated.length,
    energy,
    revenue,
    clients,
    avgTicket: hydrated.length ? revenue / hydrated.length : 0,
    lastDate: dates.length ? new Date(Math.max(...dates)) : null,
    acdc: generalAcDcStats(hydrated)
  };
}

function filterGeneralUnitDataByMonth(unitData, monthKeyValue, keepEmpty = false) {
  if (!monthKeyValue) return unitData;
  const filtered = unitData.map(unit => summarizeGeneralUnit(
      unit,
      unit.charges.filter(charge => chargeMonthKey(charge) === monthKeyValue)
    ));
  return (keepEmpty ? filtered : filtered.filter(unit => unit.count > 0))
    .sort((a, b) => b.revenue - a.revenue);
}

function getAllGeneralCharges(unitData) {
  return unitData.flatMap(unit => unit.charges.map(charge => ({
    ...charge,
    workId: charge.workId || unit.workId,
    workName: charge.workName || unit.workName
  })));
}

function getUbyOperationCharges(unitData = getGeneralUnitData()) {
  return getUbyChargerRows(unitData)
    .filter(row => row.included)
    .flatMap(row => row.charges.map(charge => ({
      ...charge,
      workId: charge.workId || row.workId,
      workName: charge.workName || row.workName,
      station: charge.station || row.station
    })));
}

function getGeneralStationRows(unitData) {
  const stationRows = [];
  unitData.forEach(unit => {
    const byStation = new Map();
    unit.charges.forEach(charge => {
      const stationName = canonicalStationNameForWork(unit.workId, charge.station || unit.stationName || unit.workName, unit.workName);
      if (!byStation.has(stationName)) byStation.set(stationName, []);
      byStation.get(stationName).push(charge);
    });
    if (!byStation.size) {
      stationRows.push({
        ...unit,
        charges: [],
        stationName: unit.stationName || unit.workName,
        stations: unit.stations || [],
        files: unit.files || []
      });
    }
    byStation.forEach((charges, stationName) => {
      const summary = summarizeGeneralUnit(unit, charges);
      stationRows.push({
        ...summary,
        stationName,
        stations: [stationName],
        files: (unit.files || []).filter(file =>
          !file.station ||
          sameStationName(file.station, stationName) ||
          sameStationName(canonicalStationNameForWork(unit.workId, file.station, unit.workName), stationName)
        )
      });
    });
  });

  const workIdsWithData = new Set(stationRows.map(row => row.workId));
  const stationNamesWithData = new Set(stationRows.map(row => normalizeStationForCompare(row.stationName)));
  workOptions().forEach(work => {
    if (workIdsWithData.has(work.id)) return;
    const canonicalName = canonicalStationNameForWork(work.id, work.nome || work.id, work.nome || work.id);
    // Evita linha fantasma vazia duplicando uma estação que já tem dados
    // (ex.: uma "Rio Beach EV" zerada além da que já aparece com recargas).
    if (stationNamesWithData.has(normalizeStationForCompare(canonicalName))) return;
    stationNamesWithData.add(normalizeStationForCompare(canonicalName));
    stationRows.push({
      workId: work.id,
      workName: work.nome || work.id,
      stationName: canonicalName,
      stations: [],
      files: [],
      charges: [],
      ubyOperationOverrides: {},
      count: 0,
      energy: 0,
      revenue: 0,
      clients: 0,
      avgTicket: 0,
      lastDate: null,
      acdc: generalAcDcStats([]),
      updatedAt: ''
    });
  });

  // Consolida somente a duplicidade conhecida Jardins/Jardins 2. Outras
  // estações com o mesmo texto continuam separadas por obra, como antes.
  const unifiedJardins = stationRows.filter(row => isUnifiedJardinsStation(row.stationName));
  if (unifiedJardins.length > 1) {
    const primary = [...unifiedJardins].sort((a, b) =>
      Number(b.count || 0) - Number(a.count || 0) || Number(b.revenue || 0) - Number(a.revenue || 0)
    )[0];
    const charges = dedupeChargesByUniqueKey(unifiedJardins.flatMap(row => row.charges || []).map(charge => ({
      ...charge,
      workId: charge.workId || row.workId,
      workName: charge.workName || row.workName,
      station: 'SANTAREM EV JARDINS'
    })));
    const summary = summarizeGeneralUnit(primary, charges);
    const files = unifiedJardins.flatMap(row => row.files || []).filter((file, index, list) =>
      list.findIndex(candidate => (candidate.fileKey || candidate.name) === (file.fileKey || file.name)) === index
    );
    const mergedRow = {
      ...summary,
      stationName: 'SANTAREM EV JARDINS',
      stations: ['SANTAREM EV JARDINS'],
      files,
      sourceWorkIds: [...new Set(unifiedJardins.map(row => String(row.workId)))],
      workName: primary.workName
    };
    stationRows.splice(0, stationRows.length, ...stationRows.filter(row => !isUnifiedJardinsStation(row.stationName)), mergedRow);
  }

  return stationRows.sort((a, b) => {
    const revenueDiff = (Number(b.revenue) || 0) - (Number(a.revenue) || 0);
    if (Math.abs(revenueDiff) > 0.009) return revenueDiff;
    const countDiff = (Number(b.count) || 0) - (Number(a.count) || 0);
    if (countDiff) return countDiff;
    const energyDiff = (Number(b.energy) || 0) - (Number(a.energy) || 0);
    if (Math.abs(energyDiff) > 0.009) return energyDiff;
    return String(a.stationName).localeCompare(String(b.stationName));
  });
}

function stationOccupancyForMonths(row, monthKeys, mode = 'mtd') {
  const config = stationAvailabilityFor(row.workId, row.stationName, row.workName);
  const power = Number(workPowerById(row.workId) || 0);
  const operationStart = operationStartForCharges(row.charges, row);
  let energy = 0;
  let hours = 0;
  (monthKeys || []).forEach(monthKeyValue => {
    const monthCharges = row.charges.filter(charge => chargeMonthKey(charge) === monthKeyValue);
    const window = periodWindow(monthCharges, monthKeyValue, mode, operationStart);
    energy += monthCharges.reduce((sum, charge) => sum + charge.energyKWh, 0);
    hours += stationAvailableHours(config, window.start, window.end);
  });
  const maxKWh = power * hours;
  return { config, power, energy, hours, maxKWh, operationStart, pct: maxKWh > 0 ? energy / maxKWh * 100 : 0 };
}

function unitOccupancyMarkup(unit, monthKeys) {
  const occupancy = stationOccupancyForMonths(unit, monthKeys, 'mtd');
  const band = occupationBand(occupancy.pct);
  return `<div class="unit-occupancy ${band.className}"><div class="unit-value">${fmtPct(occupancy.pct)}</div><div class="unit-sub">ocupacao · ${occupancy.hours.toFixed(1).replace('.', ',')} h</div><div class="unit-occupancy-bar"><span style="width:${Math.min(occupancy.pct, 100).toFixed(1)}%"></span></div></div>`;
}

function __base_getUbyChargerRows(unitData = getGeneralUnitData()) {
  const rows = [];
  unitData.forEach(unit => {
    const groups = new Map();
    unit.charges.forEach(charge => {
      const stationName = canonicalStationNameForWork(unit.workId, charge.station || unit.stationName || unit.workName, unit.workName);
      const stationKey = normalizeStationForCompare(stationName);
      const groupAsSingleCharger = isSinglePhysicalChargerStation(unit.workId, stationName, unit.workName);
      const key = groupAsSingleCharger
        ? stationKey
        : ubyOperationKey(charge);
      if (!groups.has(key)) {
        groups.set(key, {
          workId: unit.workId,
          workName: unit.workName,
          key,
          stationOverrideKey: stationUbyOperationKey(unit.workId, stationName, unit.workName),
          station: stationName,
          connType: charge.connType || '',
          connTypes: new Set(),
          kind: chargerKind(charge),
          charges: [],
          energy: 0,
          revenue: 0,
          clients: new Set()
        });
      }
      const group = groups.get(key);
      group.charges.push(charge);
      group.energy += Number(charge.energyKWh || 0);
      group.revenue += Number(charge.revenue || 0);
      if (charge.connType) group.connTypes.add(charge.connType);
      const detectedKind = chargerKind(charge);
      if (detectedKind === 'dc' || (group.kind === 'unknown' && detectedKind !== 'unknown')) group.kind = detectedKind;
      const client = charge.userEmail || charge.userName;
      if (client) group.clients.add(client);
    });

    groups.forEach(group => {
      const hasOverride = [group.key, group.stationOverrideKey]
        .some(key => Object.prototype.hasOwnProperty.call(unit.ubyOperationOverrides || {}, key));
      const included = isUbyOperationGroup(group, unit.ubyOperationOverrides);
      rows.push({
        ...group,
        connType: group.connTypes?.size ? [...group.connTypes].join(' + ') : group.connType,
        connTypes: undefined,
        clients: group.clients.size,
        included,
        ruleSource: ubyOperationRuleSource(group, hasOverride, included)
      });
    });
  });

  // A classificacao e um cadastro operacional: toda obra concluida deve
  // aparecer mesmo antes de importar a primeira planilha. Assim a decisao de
  // entrar ou nao na UBY nao depende de haver recargas no mes.
  const existingStations = new Set(rows.map(row => `${row.workId}|${normalizeStationForCompare(row.station)}`));
  getGeneralStationRows(unitData).forEach(unit => {
    const stationName = canonicalStationNameForWork(unit.workId, unit.stationName || unit.workName, unit.workName);
    const identity = `${unit.workId}|${normalizeStationForCompare(stationName)}`;
    if (existingStations.has(identity)) return;
    const stationOverrideKey = stationUbyOperationKey(unit.workId, stationName, unit.workName);
    const overrides = unit.ubyOperationOverrides || allRechargeRecords[unit.workId]?.ubyOperationOverrides || allRechargeRecords[unit.workId]?.summary?.ubyOperationOverrides || {};
    const kind = chargerKind({ workId: unit.workId, workName: unit.workName, station: stationName });
    const group = {
      workId: unit.workId,
      workName: unit.workName,
      key: stationOverrideKey,
      stationOverrideKey,
      station: stationName,
      kind,
      charges: []
    };
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, stationOverrideKey);
    rows.push({
      ...group,
      connType: 'Sem planilha importada',
      clients: 0,
      energy: 0,
      revenue: 0,
      included: isUbyOperationGroup(group, overrides),
      ruleSource: ubyOperationRuleSource(group, hasOverride, group.included)
    });
    existingStations.add(identity);
  });
  return mergeUnifiedAuroraAcUbyRows(rows)
    .sort((a, b) => Number(b.included) - Number(a.included) || b.revenue - a.revenue);
}

function mergeUnifiedAuroraAcUbyRows(rows = []) {
  const auroraRows = rows.filter(row => isUnifiedAuroraAcStation(row.station));
  if (!auroraRows.length) return [...rows];
  const remainingRows = rows.filter(row => !isUnifiedAuroraAcStation(row.station));
  const primary = [...auroraRows].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  const charges = dedupeChargesByUniqueKey(auroraRows.flatMap(row => row.charges || []));
  const connTypes = [...new Set(auroraRows.flatMap(row => String(row.connType || '').split(' + ')).filter(Boolean))];
  const clientKeys = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean));
  const sourceWorkIds = [...new Set(auroraRows.map(row => String(row.workId)).filter(Boolean))];
  const sourceWorkNames = [...new Set(auroraRows.map(row => row.workName).filter(Boolean))];
  const merged = {
    ...primary,
    key: 'uby-recharge-shopping-aurora-ac|carregador',
    stationOverrideKey: 'uby-recharge-shopping-aurora-ac|station',
    station: 'UBY RECHARGE - SHOPPING AURORA AC',
    kind: 'ac',
    charges,
    connType: connTypes.join(' + ') || primary.connType,
    energy: charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0),
    revenue: charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0),
    clients: clientKeys.size || auroraRows.reduce((sum, row) => sum + Number(row.clients || 0), 0),
    included: true,
    ruleSource: 'Aurora AC automatico',
    sourceWorkIds,
    sourceWorkNames,
    virtualUnifiedStation: auroraRows.length > 1
  };
  return [...remainingRows, merged];
}

function normalizePhone(value = '') {
  return safeText(value).replace(/\D+/g, '');
}

function customerRegistryNumber(value = '') {
  const clean = safeText(value).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return Number(clean) || 0;
}

function customerRegistryIdentityKeys(row = {}) {
  const email = safeText(row.email).trim().toLowerCase();
  const phone = normalizePhone(row.phone);
  const cpf = safeText(row.cpf).replace(/\D/g, '');
  const name = normalizeHeaderName(row.name || '');
  const verified = [
    cpf ? `cpf:${cpf}` : '',
    email ? `email:${email}` : '',
    phone ? `phone:${phone}` : ''
  ].filter(Boolean);
  // Nome sozinho so e usado quando a planilha nao trouxe nenhum identificador
  // verificavel. Assim duas pessoas com o mesmo nome nao sao fundidas por
  // engano, mas uma linha totalmente sem contato tambem nao duplica a cada
  // importacao.
  return verified.length ? verified : (name ? [`name:${name}`] : []);
}

function consolidateCustomerRegistryRows(incoming = []) {
  const groups = [];
  const mergeInto = (target, row) => {
    target.keys = new Set([...target.keys, ...customerRegistryIdentityKeys(row)]);
    target.name = target.name || row.name || '';
    target.complement = target.complement || row.complement || '';
    target.email = target.email || row.email || '';
    target.cpf = target.cpf || row.cpf || '';
    target.phone = target.phone || row.phone || '';
    target.phoneDisplay = target.phoneDisplay || row.phoneDisplay || '';
    target.chargers = Math.max(target.chargers, Number(row.chargers || 0));
    // Os arquivos de clientes sao retratos acumulados. A mesma pessoa pode
    // aparecer em mais de uma linha/arquivo, portanto usar soma aqui dobra
    // transacoes, energia e faturamento a cada importacao. Mantemos o maior
    // acumulado observado em vez de criar outro saldo artificial.
    target.transactions = Math.max(target.transactions, Number(row.transactions || 0));
    target.energy = Math.max(target.energy, Number(row.energy || 0));
    target.spent = Math.max(target.spent, Number(row.spent || 0));
    target.durationHours = Math.max(target.durationHours, durToHours(row.chargeTime));
    (Array.isArray(row.locations) ? row.locations : []).forEach(location => {
      const clean = safeText(location).trim();
      if (clean) target.locations.add(clean);
    });
  };
  (Array.isArray(incoming) ? incoming : []).forEach(row => {
    const keys = customerRegistryIdentityKeys(row);
    let matches = groups.filter(group => keys.some(key => group.keys.has(key)));
    const target = matches.shift() || {
      keys: new Set(), name: '', complement: '', email: '', cpf: '', phone: '', phoneDisplay: '',
      chargers: 0, transactions: 0, energy: 0, spent: 0, durationHours: 0, locations: new Set()
    };
    if (!groups.includes(target)) groups.push(target);
    mergeInto(target, row);
    // Um registro pode unir grupos antes separados (por exemplo, uma linha
    // com CPF e outra com e-mail). Junta-los evita duplicar o motorista.
    matches.forEach(group => {
      mergeInto(target, {
        ...group,
        locations: [...group.locations],
        chargeTime: String(group.durationHours || 0) + 'h'
      });
      const index = groups.indexOf(group);
      if (index >= 0) groups.splice(index, 1);
    });
  });
  return groups.map(group => ({
    name: group.name, complement: group.complement, email: group.email, cpf: group.cpf,
    phone: group.phone, phoneDisplay: group.phoneDisplay || group.phone,
    chargers: group.locations.size || group.chargers || 0, transactions: group.transactions, energy: group.energy,
    chargeTime: formatRechargeDuration(group.durationHours), spent: group.spent,
    locations: [...group.locations].sort()
  }));
}

async function readCustomerRegistryCloud() {
  if (!window.UBY_SUPABASE?.loadRechargeCustomers) return null;
  const firstPage = await window.UBY_SUPABASE.loadRechargeCustomers({ limit: 500 });
  if (!firstPage?.available) throw new Error('Entre novamente para confirmar a base oficial na nuvem.');
  const cloudRows = [...(firstPage.rows || [])];
  const total = Number(firstPage.count || cloudRows.length);
  for (let offset = cloudRows.length; offset < total; offset += 500) {
    const page = await window.UBY_SUPABASE.loadRechargeCustomers({ limit: 500, offset });
    if (!page?.available) throw new Error('A conexao com a base de clientes foi interrompida.');
    cloudRows.push(...(page.rows || []));
  }
  return { rows: cloudRows, total: Number(firstPage.count || cloudRows.length) };
}

function customerRegistryRowsFromCloud(cloudRows = []) {
  return cloudRows.map(row => ({
    customerKey: row.customer_key, name: row.name || '', email: row.email || '', phone: row.phone || '',
    complement: row.complement || '', cpf: row.raw_data?.cpf || '', phoneDisplay: row.raw_data?.phoneDisplay || row.phone || '',
    locations: Array.isArray(row.raw_data?.locations) ? row.raw_data.locations : [], chargers: Number(row.chargers_count || 0),
    transactions: Number(row.transactions_count || 0), energy: Number(row.energy_kwh || 0),
    chargeTime: row.charge_time_text || '', spent: Number(row.total_spent || 0), source: row.source || 'banco online'
  }));
}

function clubParticipantKey(participant = {}) {
  const email = normalizeClubEmail(participant.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(participant.phone);
  if (phone) return `phone:${phone}`;
  const canonicalName = canonicalClubPersonName(participant.name || '');
  return canonicalName ? `person:${canonicalName}` : `name:${normalizeHeaderName(participant.name || '')}`;
}

function clubParticipantKeys(participant = {}) {
  const email = normalizeClubEmail(participant.email);
  const phone = normalizePhone(participant.phone);
  const exactName = normalizeHeaderName(participant.name || '');
  const canonicalName = canonicalClubPersonName(participant.name || '');
  return [
    email ? `email:${email}` : '',
    phone ? `phone:${phone}` : '',
    exactName ? `name:${exactName}` : '',
    canonicalName ? `person:${canonicalName}` : ''
  ].filter(Boolean);
}

function normalizeClubEmail(value = '') {
  const raw = safeText(value).trim().toLowerCase().replace(/\s+/g, '');
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(raw)) return '';
  const at = raw.lastIndexOf('@');
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const domainAliases = {
    'hormail.com': 'hotmail.com'
  };
  return `${local}@${domainAliases[domain] || domain}`;
}

function clubPersonTokens(value = '') {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function canonicalClubPersonName(value = '') {
  const tokens = clubPersonTokens(value);
  if (tokens.length < 3) return '';
  const uniqueTokens = [];
  const seen = new Set();
  tokens.forEach(token => {
    if (!seen.has(token)) {
      seen.add(token);
      uniqueTokens.push(token);
    }
  });
  return uniqueTokens.join(' ');
}

function clubParticipantsStore() {
  const data = readJson(CLUB_PARTICIPANTS_LOCAL_KEY, { rows: [], updatedAt: '', source: '' });
  if (Array.isArray(data)) return { rows: data, updatedAt: '', source: 'cache antigo' };
  return { rows: Array.isArray(data?.rows) ? data.rows : [], updatedAt: data?.updatedAt || '', source: data?.source || '' };
}

function writeClubParticipantsStore(rows = [], source = 'manual') {
  const clean = rows
    .filter(row => row && (row.name || row.email || row.phone))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) || safeText(a.name).localeCompare(safeText(b.name), 'pt-BR'));
  writeJson(CLUB_PARTICIPANTS_LOCAL_KEY, { rows: clean, updatedAt: new Date().toISOString(), source });
}

function headerValue(row = [], headers = [], aliases = []) {
  const normalizedHeaders = headers.map(normalizeHeaderName);
  const wanted = aliases.map(normalizeHeaderName);
  let idx = normalizedHeaders.findIndex(header => wanted.includes(header));
  if (idx < 0) idx = normalizedHeaders.findIndex(header => wanted.some(alias => header.includes(alias)));
  return idx >= 0 ? safeText(row[idx]).trim() : '';
}

function yesLike(value = '') {
  return /^(sim|li|aceito|concordo|ok|yes|aceita|autorizo)/i.test(safeText(value).trim());
}

function clubParticipantFromFormRow(row = [], headers = []) {
  const createdRaw = headerValue(row, headers, ['Carimbo de data/hora', 'Data', 'Timestamp']);
  const createdAt = parseDate(createdRaw);
  const participant = {
    createdRaw,
    createdAtMs: createdAt ? createdAt.getTime() : 0,
    name: headerValue(row, headers, ['Nome completo', 'Nome']),
    phone: headerValue(row, headers, ['WhatsApp (com DDD)', 'Whatsapp', 'WhatsApp', 'Telefone']),
    email: headerValue(row, headers, ['E-mail', 'Email']),
    score: headerValue(row, headers, ['Pontuacao', 'Pontuação', 'Score']),
    vehicleBrand: headerValue(row, headers, ['Marca do veiculo', 'Marca do veículo', 'Marca do veculo', 'Marca', 'Fabricante']),
    vehicleModel: headerValue(row, headers, ['Modelo do veiculo', 'Modelo do veículo', 'Modelo do veculo', 'Veiculo', 'Veículo', 'Veculo']),
    vehiclePlate: headerValue(row, headers, ['Placa do veiculo', 'Placa do veículo', 'Placa do veculo', 'Placa']),
    attraction: headerValue(row, headers, ['O que mais te atrai em participar do Clube UBY?']),
    desiredBenefit: headerValue(row, headers, ['Qual beneficio voce considera mais importante?', 'Qual benefício você considera mais importante?', 'Qual benefcio voc considera mais importante?']),
    wantsRanking: headerValue(row, headers, ['Voce teria interesse em um ranking mensal de pontos do Clube UBY?', 'Você teria interesse em um ranking mensal de pontos do Clube UBY?']),
    regionInterest: headerValue(row, headers, ['Em quais regioes voce gostaria que a UBY tivesse mais pontos de recarga?', 'Em quais regiões você gostaria que a UBY tivesse mais pontos de recarga?']),
    indication: headerValue(row, headers, ['Voce indicaria algum comercio, condominio, empresa ou estacionamento para receber um ponto UBY?', 'Você indicaria algum comércio, condomínio, empresa ou estacionamento para receber um ponto UBY?']),
    indicationContact: headerValue(row, headers, ['Se respondeu sim ou talvez, informe o local ou contato indicado.']),
    regulation: headerValue(row, headers, ['Regulamento e participacao no Clube UBY', 'Regulamento e participação no Clube UBY']),
    lgpd: headerValue(row, headers, ['Autorizacao de uso de dados (LGPD)', 'Autorização de uso de dados (LGPD)', 'Autorizaao de uso de dados (LGPD)', 'Autorizao de uso de dados (LGPD)', 'autorizaodeusodedadoslgpd'])
  };
  participant.acceptedRegulation = yesLike(participant.regulation);
  participant.acceptedLgpd = yesLike(participant.lgpd);
  participant.key = clubParticipantKey(participant);
  return participant;
}

function clubParticipantsFromRows(rows = []) {
  const firstHeader = rows.findIndex(row => Array.isArray(row) && row.some(cell => normalizeHeaderName(cell).includes('nomecompleto')));
  const headerIndex = firstHeader >= 0 ? firstHeader : 0;
  const headers = rows[headerIndex] || [];
  return rows.slice(headerIndex + 1)
    .filter(rowHasData)
    .map(row => clubParticipantFromFormRow(row, headers))
    .filter(row => row.name || row.email || row.phone);
}

function mergeClubParticipants(incoming = [], source = 'manual') {
  const current = clubParticipantsStore().rows;
  const byKey = new Map(current.map(row => [clubParticipantKey(row), row]));
  incoming.forEach(row => {
    const key = clubParticipantKey(row);
    const previous = byKey.get(key);
    if (!previous || Number(row.createdAtMs || 0) >= Number(previous.createdAtMs || 0)) {
      byKey.set(key, { ...(previous || {}), ...row, key });
    }
  });
  const rows = [...byKey.values()];
  writeClubParticipantsStore(rows, source);
  return rows;
}

function couponControlPercentFromCode(coupon = '') {
  const values = [...safeText(coupon).matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
    .map(match => Number(match[1].replace(',', '.')))
    .filter(value => Number.isFinite(value) && value > 0 && value < 100);
  return values.length ? values[values.length - 1] / 100 : 0;
}

function couponControlCalculatedDiscount(finalValue = 0, coupon = '') {
  const rate = couponControlPercentFromCode(coupon);
  const paid = Number(finalValue || 0);
  return rate && paid > 0 ? paid * rate / (1 - rate) : 0;
}

function couponControlNumber(value = '') {
  return customerRegistryNumber(value);
}

function couponControlDateKey(value = '') {
  // Relatórios Spott usam o formato "14/09/2026 às 17:37". A base de
  // recargas já entende dia/mês/hora; aqui removemos apenas o conector textual.
  const date = parseDate(safeText(value).replace(/\s+às\s+/i, ' '));
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function couponControlIdentityKey(row = {}) {
  const date = couponControlDateKey(row.dateRaw || row.dateKey || '');
  return [
    date,
    normalizeHeaderName(row.coupon || ''),
    normalizeHeaderName(row.name || ''),
    normalizeClubEmail(row.email || ''),
    normalizePhone(row.phone || ''),
    Number(row.value || 0).toFixed(2)
  ].join('|');
}

function couponControlRow(row = [], headers = []) {
  const dateRaw = headerValue(row, headers, ['Data', 'Data de uso', 'Data do uso', 'Data da compra', 'Data utilizacao', 'Data utilização']);
  const coupon = headerValue(row, headers, ['Cupom', 'Codigo', 'Código', 'Voucher', 'Codigo do cupom', 'Código do cupom']);
  const value = couponControlNumber(headerValue(row, headers, ['Valor Final', 'Valor', 'Valor do beneficio', 'Valor do benefício', 'Valor utilizado', 'Valor da compra', 'Total']));
  const informedDiscount = couponControlNumber(headerValue(row, headers, ['Desconto', 'Valor do desconto', 'Desconto concedido']));
  const item = {
    dateRaw,
    dateKey: couponControlDateKey(dateRaw),
    coupon,
    name: headerValue(row, headers, ['Cliente', 'Nome', 'Nome do cliente', 'Beneficiario', 'Beneficiário', 'Usuario', 'Usuário', 'User']),
    email: normalizeClubEmail(headerValue(row, headers, ['Email', 'E-mail'])),
    phone: normalizePhone(headerValue(row, headers, ['Telefone', 'WhatsApp', 'Whatsapp', 'Celular'])),
    // "Empresa" nos relatórios Spott identifica a UBY, não o parceiro do cupom.
    partner: headerValue(row, headers, ['Parceiro', 'Parceiro comercial', 'Estabelecimento parceiro', 'Loja']),
    energy: couponControlNumber(headerValue(row, headers, ['Energia', 'kWh', 'Kwh'])),
    value,
    discount: informedDiscount || couponControlCalculatedDiscount(value, coupon),
    status: headerValue(row, headers, ['Status', 'Situacao', 'Situação'])
  };
  item.key = couponControlIdentityKey(item);
  return item;
}

function couponControlRowsFromSheet(rows = []) {
  const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => /cupom|codigo|código|voucher/i.test(safeText(cell))));
  const index = headerIndex >= 0 ? headerIndex : 0;
  const headers = rows[index] || [];
  return rows.slice(index + 1).filter(rowHasData)
    .map(row => couponControlRow(row, headers))
    .filter(row => row.coupon || row.name || row.email || row.phone);
}

function clubFormEndpointUrl() {
  return safeText(window.UBY_CLUBE_FORM_ENDPOINT || localStorage.getItem('uby-club-form-endpoint') || '').trim();
}

function clubParticipantLookup(participants = []) {
  const map = new Map();
  participants.forEach(participant => {
    clubParticipantKeys(participant).forEach(key => {
      if (!map.has(key)) map.set(key, participant);
    });
  });
  return map;
}

function enrichClubClientRows(rows = [], participants = []) {
  const byKey = clubParticipantLookup(participants);
  return rows.map(row => {
    const participant = clubParticipantKeys(row).map(key => byKey.get(key)).find(Boolean);
    if (!participant) return { ...row, participant: null, registered: false };
    const merged = {
      ...row,
      participant,
      registered: true,
      name: participant.name || row.name,
      email: row.email || participant.email || '',
      phone: row.phone || participant.phone || '',
      vehicleBrand: participant.vehicleBrand || '',
      vehicleModel: participant.vehicleModel || '',
      vehiclePlate: participant.vehiclePlate || '',
      desiredBenefit: participant.desiredBenefit || '',
      acceptedLgpd: !!participant.acceptedLgpd,
      createdAtMs: participant.createdAtMs || 0
    };
    return merged;
  });
}

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `ubyClubFormCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const sep = url.includes('?') ? '&' : '?';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('tempo esgotado ao chamar endpoint'));
    }, 15000);
    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
    window[callback] = payload => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('endpoint bloqueado ou indisponivel'));
    };
    script.src = `${url}${sep}callback=${encodeURIComponent(callback)}&t=${Date.now()}`;
    document.head.appendChild(script);
  });
}

async function fetchClubFormEndpoint(url) {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`endpoint retornou ${response.status}`);
    return await response.json();
  } catch (err) {
    return fetchJsonp(url);
  }
}

function normalizeClubParticipantObject(item = {}) {
  const createdRaw = item.createdRaw || item.createdAt || item.timestamp || item.carimbo || '';
  const createdAt = parseDate(createdRaw);
  const participant = {
    createdRaw,
    createdAtMs: item.createdAtMs || (createdAt ? createdAt.getTime() : 0),
    name: item.name || item.nome || '',
    phone: item.phone || item.whatsapp || item.telefone || '',
    email: item.email || item.mail || '',
    score: item.score || item.pontuacao || item['pontuação'] || '',
    vehicleBrand: item.vehicleBrand || item.marca || item.fabricante || '',
    vehicleModel: item.vehicleModel || item.veiculo || item.modelo || '',
    vehiclePlate: item.vehiclePlate || item.placa || '',
    attraction: item.attraction || item.atrativo || '',
    desiredBenefit: item.desiredBenefit || item.beneficio || '',
    wantsRanking: item.wantsRanking || item.ranking || '',
    regionInterest: item.regionInterest || item.regioes || '',
    indication: item.indication || item.indicacao || '',
    indicationContact: item.indicationContact || item.contatoIndicado || '',
    regulation: item.regulation || item.regulamento || '',
    lgpd: item.lgpd || item.autorizacaoLgpd || ''
  };
  participant.acceptedRegulation = item.acceptedRegulation ?? yesLike(participant.regulation);
  participant.acceptedLgpd = item.acceptedLgpd ?? yesLike(participant.lgpd);
  participant.key = clubParticipantKey(participant);
  return participant;
}

function clubParticipantsFromEndpointPayload(payload) {
  const data = Array.isArray(payload) ? payload : (payload?.participants || payload?.rows || []);
  if (!Array.isArray(data)) return [];
  if (data.length && Array.isArray(data[0])) return clubParticipantsFromRows(data);
  return data.map(normalizeClubParticipantObject).filter(row => row.name || row.email || row.phone);
}

function ensureClubParticipantsAutoSync(force = false) {
  const endpoint = clubFormEndpointUrl();
  if (!endpoint) return;
  const store = clubParticipantsStore();
  const updatedAtMs = store.updatedAt ? new Date(store.updatedAt).getTime() : 0;
  const stale = !updatedAtMs || (Date.now() - updatedAtMs) > CLUB_FORM_AUTO_SYNC_MAX_AGE_MS;
  const shouldSync = force || !store.rows.length || stale;
  if (!shouldSync || clubParticipantsSyncPromise) return;
  if (!force && clubParticipantsAutoSyncAttempted && store.rows.length) return;
  clubParticipantsAutoSyncAttempted = true;
  syncClubParticipantsFromSheet({ silent: true }).catch(() => {});
}

function clubClientRows(charges = []) {
  const byClient = new Map();
  const identityIndex = new Map();
  charges.forEach(charge => {
    const identity = {
      name: charge.userName || charge.userEmail || 'Cliente sem nome',
      email: charge.userEmail || '',
      phone: charge.userPhone || ''
    };
    const keys = clubParticipantKeys(identity);
    const key = keys.map(item => identityIndex.get(item)).find(Boolean)
      || keys[0]
      || clientKeyFromCharge(charge);
    if (!key) return;
    if (!byClient.has(key)) {
      byClient.set(key, {
        key,
        name: identity.name,
        email: normalizeClubEmail(identity.email) || identity.email,
        phone: charge.userPhone || '',
        revenue: 0,
        energy: 0,
        count: 0,
        lastDate: null
      });
    }
    keys.forEach(item => identityIndex.set(item, key));
    const row = byClient.get(key);
    if (!row.phone && charge.userPhone) row.phone = charge.userPhone;
    if (!row.email && charge.userEmail) row.email = normalizeClubEmail(charge.userEmail) || charge.userEmail;
    const currentNameTokens = clubPersonTokens(row.name);
    const nextNameTokens = clubPersonTokens(charge.userName);
    if (
      charge.userName &&
      canonicalClubPersonName(row.name) === canonicalClubPersonName(charge.userName) &&
      nextNameTokens.length < currentNameTokens.length
    ) {
      row.name = charge.userName;
    }
    if ((!row.name || row.name === 'Cliente sem nome') && (charge.userName || charge.userEmail)) row.name = charge.userName || charge.userEmail;
    row.revenue += Number(charge.revenue || 0);
    row.energy += Number(charge.energyKWh || 0);
    row.count += 1;
    if (!row.lastDate || (charge.startDate && charge.startDate > row.lastDate)) row.lastDate = charge.startDate;
  });
  return [...byClient.values()]
    .map(row => ({ ...row, points: Math.floor(Math.max(0, row.revenue)) }))
    .sort((a, b) => b.revenue - a.revenue || b.energy - a.energy || b.count - a.count);
}

function clubBenefitForPosition(position) {
  if (position <= 3) return 'Top 3: 30% em alinhamento e balanceamento + 10% Muffatão';
  return '10% em todos os serviços da rede Muffatão Autocenter';
}

function clubCompetitionMonths(charges = []) {
  return [...new Set(charges.map(chargeMonthKey).filter(key => key && key !== 'unknown'))].sort();
}

function clubWinnerNotice(rows = [], month = '') {
  const ranking = rows.slice(0, 3).length
    ? rows.slice(0, 3).map((row, index) => `${index + 1}º lugar: ${row.name} - ${row.points.toLocaleString('pt-BR')} pontos`).join('\n')
    : 'Ainda não houve pontuação suficiente para definir vencedores.';
  return `RESULTADO CLUBE UBY - ${monthLabel(month || monthKey(new Date()))}\n\n${ranking}\n\nParabéns aos vencedores do mês! Os três primeiros colocados recebem 30% de desconto em alinhamento e balanceamento. Todos os participantes do Clube UBY têm 10% de desconto nos serviços da rede Muffatão Autocenter.\n\nCada R$ 1 gasto nas recargas UBY gera 1 ponto. O próximo ranking começa no primeiro dia do próximo mês.`;
}

function summarizeUbyChargerRow(row, charges = row.charges || []) {
  const hydrated = (charges || []).map(hydrateCharge);
  const energy = hydrated.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const revenue = hydrated.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const clients = new Set(hydrated.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const dates = hydrated.map(charge => charge.startDate).filter(Boolean);
  return {
    ...row,
    stationName: row.station,
    charges: hydrated,
    count: hydrated.length,
    energy,
    revenue,
    clients,
    avgTicket: hydrated.length ? revenue / hydrated.length : 0,
    lastDate: dates.length ? new Date(Math.max(...dates)) : null,
    acdc: generalAcDcStats(hydrated)
  };
}

function operationStartForCharges(charges = [], context = {}) {
  const workId = String(context.workId || currentWorkId || '');
  const stationName = context.stationName || context.station || context.workName || currentStationReportName || currentWorkName;
  const configured = stationAvailabilityFor(workId, stationName, context.workName || currentWorkName).operationStart;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(configured || ''))) {
    const [year, month, day] = configured.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0);
  }
  const label = normalizeStationForCompare([
    context.stationName,
    context.station,
    context.workName
  ].filter(Boolean).join(' '));
  if (label.includes('robert koch')) return new Date(2026, 5, 8, 0, 0, 0);
  const dates = (charges || []).map(charge => {
    if (charge?.startDate && typeof charge.startDate.getTime === 'function') return new Date(charge.startDate);
    return parseDate(charge?.startIso || charge?.startStr);
  }).filter(date => date && !Number.isNaN(date.getTime()));
  if (!dates.length) return null;
  const first = new Date(Math.min(...dates.map(date => date.getTime())));
  return new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0);
}

function currentWorkOperationStart() {
  return operationStartForCharges(allCharges, {
    stationName: currentStationReportName,
    workName: currentWorkName
  });
}

function ubyFinanceMonthsForRow(row = {}, sourceMonths = [], isMonthView = true, currentMonth = '') {
  if (isMonthView) return currentMonth ? [currentMonth] : [];
  const rowMonths = [...new Set((row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const firstMonth = rowMonths[0] || sourceMonths[0] || '';
  return (sourceMonths || []).filter(mk => !firstMonth || mk >= firstMonth);
}

function aggregateUbyFinanceRow(row = {}, sourceMonths = [], isMonthView = true, currentMonth = '') {
  const months = ubyFinanceMonthsForRow(row, sourceMonths, isMonthView, currentMonth);
  let matrizCostTotal = 0;
  const results = months.map(mk => {
    const monthCharges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
    const settings = financeSettingsForUbyRow(row, mk);
    const matrizCostItems = matrizCostItemsForRow(row, mk);
    matrizCostTotal += matrizCostItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return financeForCharges(monthCharges, settings, { monthKey: mk, historyCharges: row.charges || [], power: workPowerById(row.workId), matrizCostItems, workId: row.workId, workName: row.workName, stationName: row.stationName || row.station, courtesyConfig: stationAvailabilityFor(row.workId, row.stationName || row.station, row.workName) });
  });
  const totals = results.reduce((acc, result) => {
    ['revenue','extraRevenue','marketingRevenue','totalRevenue','energy','commercialEnergy','courtesyCharges','courtesyEnergy','courtesyEnergyCost','courtesyCostExcluded','energyCost','extraCosts','taxes','matrizTaxCost','areaParticipation','management','platform','ubyRoyalty','totalOperatingCost','operationNet','plannedTotalCost','ubyNet','saRetention','investorDistribution','ubyRetained'].forEach(key => {
      acc[key] += Number(result[key] || 0);
    });
    acc.planningKWh += Number(result.planning?.planningKWh || 0);
    return acc;
  }, { revenue:0, extraRevenue:0, marketingRevenue:0, totalRevenue:0, energy:0, commercialEnergy:0, courtesyCharges:0, courtesyEnergy:0, courtesyEnergyCost:0, courtesyCostExcluded:0, energyCost:0, extraCosts:0, taxes:0, matrizTaxCost:0, areaParticipation:0, management:0, platform:0, ubyRoyalty:0, totalOperatingCost:0, operationNet:0, plannedTotalCost:0, planningKWh:0, ubyNet:0, saRetention:0, investorDistribution:0, ubyRetained:0 });
  // A visão acumulada precisa manter a titularidade do carregador. Sem isso,
  // um parceiro com royalty UBY volta a ser apresentado como ativo próprio.
  totals.operationModel = results.at(-1)?.operationModel || 'uby';
  totals.matrizCost = matrizCostTotal;
  totals.totalCostPerKWh = totals.commercialEnergy > 0 ? totals.totalOperatingCost / totals.commercialEnergy : null;
  totals.plannedTotalCostPerKWh = totals.planningKWh > 0 ? totals.plannedTotalCost / totals.planningKWh : null;
  totals.resultPerKWh = totals.energy > 0 ? totals.operationNet / totals.energy : null;
  totals.operationMargin = totals.totalRevenue > 0 ? totals.operationNet / totals.totalRevenue * 100 : 0;
  return { ...row, financeMonths: months, finance: totals };
}

// Série mensal financeira da operação UBY (todos os carregadores somados por
// mês), pro gráfico de evolução e pra tendência dos KPIs. Sempre pega o
// histórico completo de cada carregador (ignora o toggle "Visão" da página),
// já que uma evolução mensal não faz sentido presa a 1 mês só.

function buildUbyMonthlySeries(includedRows = [], sourceMonths = []) {
  const byMonth = new Map(sourceMonths.map(mk => [mk, {
    mk, label: monthLabel(mk), revenue: 0, totalOperatingCost: 0, operationNet: 0, matrizCost: 0, energy: 0, commercialEnergy: 0
  }]));
  includedRows.forEach(row => {
    const months = ubyFinanceMonthsForRow(row, sourceMonths, false, '');
    months.forEach(mk => {
      const bucket = byMonth.get(mk);
      if (!bucket) return;
      const monthCharges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
      const settings = financeSettingsForUbyRow(row, mk);
      const matrizCostItems = matrizCostItemsForRow(row, mk);
      bucket.matrizCost += matrizCostItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const result = financeForCharges(monthCharges, settings, { monthKey: mk, historyCharges: row.charges || [], power: workPowerById(row.workId), matrizCostItems, workId: row.workId, workName: row.workName, stationName: row.stationName || row.station, courtesyConfig: stationAvailabilityFor(row.workId, row.stationName || row.station, row.workName) });
      bucket.revenue += Number(result.revenue || 0);
      bucket.totalOperatingCost += Number(result.totalOperatingCost || 0);
      bucket.operationNet += Number(result.operationNet || 0);
      bucket.energy += Number(result.energy || 0);
      bucket.commercialEnergy += Number(result.commercialEnergy || result.energy || 0);
    });
  });
  return sourceMonths.map(mk => byMonth.get(mk));
}

// Árvore visual: raiz = custos da matriz, ramos = carregadores UBY com seus custos.

function networkFinanceSum(rows = [], fields = []) {
  return rows.reduce((total, row) => {
    fields.forEach(field => { total[field] = Number(total[field] || 0) + Number(row.finance?.[field] || 0); });
    return total;
  }, Object.fromEntries(fields.map(field => [field, 0])));
}

function networkUnifiedReportModel(options = {}) {
  const sourceRows = getUbyChargerRows(getGeneralUnitData()).filter(row => row.included);
  const sourceMonths = [...new Set(sourceRows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const periodSelection = options.accumulated
    ? { monthKey: '', isMonthView: false, label: 'Acumulado da rede' }
    : options.monthKey
      ? { monthKey: options.monthKey, isMonthView: true, label: monthLabel(options.monthKey) }
    : selectedFinanceOnlyPeriod(sourceMonths);
  const rows = sourceRows.map(row => aggregateUbyFinanceRow(row, sourceMonths, periodSelection.isMonthView, periodSelection.monthKey));
  const ownedRows = rows.filter(row => ['uby', 'hybrid'].includes(normalizeOperationModel(row.finance?.operationModel)));
  const partnerRows = rows.filter(row => normalizeOperationModel(row.finance?.operationModel) === 'third_party_management');
  const fields = ['revenue','extraRevenue','marketingRevenue','energyCost','extraCosts','matrizCost','matrizTaxCost','taxes','areaParticipation','management','platform','operationNet','ubyRoyalty'];
  const owned = networkFinanceSum(ownedRows, fields);
  const partners = networkFinanceSum(partnerRows, fields);
  const policy = loadNetworkDistribution();
  const operationalResult = Number(owned.operationNet || 0);
  const royalties = Number(partners.ubyRoyalty || 0);
  const marketing = Number(owned.marketingRevenue || 0);
  const result = operationalResult + royalties;
  const distributable = Math.max(result, 0);
  const legalReserve = distributable * Number(policy.legalReservePct || 0) / 100;
  const expansionReserve = distributable * Number(policy.expansionReservePct || 0) / 100;
  const reserve = legalReserve + expansionReserve;
  const investorPool = (distributable - reserve) * Number(policy.investorPct || 0) / 100;
  const soldQuotas = Math.min(Number(policy.soldQuotas || 0), Number(policy.totalQuotas || 1));
  return { rows, ownedRows, partnerRows, owned, partners, policy, operationalResult, royalties, marketing, result, distributable, legalReserve, expansionReserve, reserve, investorPool, soldQuotas, perQuota: soldQuotas ? investorPool / soldQuotas : 0, period: periodSelection.label, sourceMonths, periodSelection };
}

function networkInvestorDistributionModel() {
  const accumulated = networkUnifiedReportModel({ accumulated: true });
  const sourceMonths = [...new Set(accumulated.rows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => /^\d{4}-\d{2}$/.test(key) && key >= (accumulated.policy.distributionStartMonth || '2026-06')))].sort();
  const investors = applyInvestorOperationStart(normalizeNetworkInvestors(accumulated.policy.investors)).sort(compareInvestorsByStart);
  const months = sourceMonths.map(monthKey => {
    const finance = networkUnifiedReportModel({ monthKey });
    const eligible = investors.filter(investor => investor.eligibleFrom <= monthKey);
    const eligibleQuotas = eligible.reduce((sum, investor) => sum + investor.quotas, 0);
    const valuePerQuota = eligibleQuotas && finance.result > 0 ? finance.investorPool / eligibleQuotas : 0;
    const payment = accumulated.policy.paymentLedger?.[monthKey] || { status: 'pendente' };
    return { monthKey, result: finance.result, legalReserve: finance.legalReserve, expansionReserve: finance.expansionReserve, investorPool: finance.investorPool, eligibleQuotas, valuePerQuota, payment };
  });
  const byInvestor = investors.map(investor => {
    const allocations = months.map(month => month.monthKey >= investor.eligibleFrom ? month.valuePerQuota * investor.quotas : 0);
    const due = allocations.reduce((sum, value) => sum + value, 0);
    const investment = investor.quotas * (Number(investor.quotaValue) || Number(accumulated.policy.quotaValue) || 80000);
    const activeMonths = months.filter(month => month.monthKey >= investor.eligibleFrom && month.result > 0).length;
    const returnRate = investment ? due / investment : 0;
    const annualized = activeMonths ? returnRate / activeMonths * 12 : 0;
    return { ...investor, allocations, due, investment, returnRate, annualized, paybackYears: annualized > 0 ? 1 / annualized : null };
  });
  const totalAllocated = byInvestor.reduce((sum, investor) => sum + investor.due, 0);
  const totalPool = months.reduce((sum, month) => sum + month.investorPool, 0);
  return { investors: byInvestor, months, totalAllocated, totalPool, valid: Math.abs(totalAllocated - totalPool) < 0.02 };
}

function ubyNetworkProjectionForRow(row = {}, monthKey = '') {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey))) {
    return { revenue: 0, energy: 0, projectedRevenue: 0, projectedEnergy: 0, coveredDays: 0 };
  }
  const monthCharges = (row.charges || []).filter(charge => chargeMonthKey(charge) === monthKey);
  const revenue = monthCharges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const energy = monthCharges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  if (!monthCharges.length) {
    return { revenue, energy, projectedRevenue: 0, projectedEnergy: 0, coveredDays: 0 };
  }
  // Keep the network forecast aligned with each station's own monthly KPI window.
  const operationStart = operationStartForCharges(row.charges || [], row);
  const window = periodWindow(monthCharges, monthKey, 'mtd', operationStart);
  const coveredDays = Math.max(Number(window?.hours || 0) / 24, 1);
  const totalDays = daysInMonth(monthKey.slice(0, 4), monthKey.slice(5, 7));
  const multiplier = totalDays / coveredDays;
  return {
    revenue,
    energy,
    projectedRevenue: revenue * multiplier,
    projectedEnergy: energy * multiplier,
    coveredDays
  };
}

async function loadRechargeWorksFromCloud() {
  if (!window.UBY_SUPABASE?.loadRechargeWorks) return cloudRechargeWorks;
  try {
    const works = await window.UBY_SUPABASE.loadRechargeWorks();
    if (Array.isArray(works)) cloudRechargeWorks = works;
  } catch (err) {
    setStorageState(`Cadastro local de obras preservado. Obras na nuvem pendentes: ${err.message}`, true);
  }
  return cloudRechargeWorks;
}

async function refreshGeneralRechargeBases(forceCloud = false) {
  const refreshSequence = ++generalRefreshSequence;
  syncGeneralRecordsFromLocal();
  try {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const cachedRecords = await window.UBY_RECHARGE_RUNTIME?.cacheGet?.(`general-records:${currentMonthKey}`, 24 * 60 * 60 * 1000);
    if (Array.isArray(cachedRecords) && cachedRecords.length) {
      mergeCloudRechargeRecords(cachedRecords.map(record => ({
        ...record,
        summaryOnly: false,
        partialDetails: true
      })));
      await renderVisibleOverviewViews();
      await yieldToBrowser();
    }
  } catch (err) {
    console.warn('Cache rapido indisponivel:', err.message);
  }
  showGeneralWhenCurrentWorkIsEmpty();
  if (!window.UBY_SUPABASE?.loadRechargeBase) {
    await renderVisibleOverviewViews();
    return;
  }
  try {
    let summaries = [];
    if (window.UBY_SUPABASE.loadAllRechargeSummaries) {
      summaries = await window.UBY_SUPABASE.loadAllRechargeSummaries();
      if (refreshSequence !== generalRefreshSequence) return;
      if (summaries?.length) {
        mergeCloudRechargeRecords(summaries);
        initWorkSelector();
        showGeneralWhenCurrentWorkIsEmpty();
      }
    }
    const ids = (summaries || []).map(record => String(record.workId || '')).filter(Boolean);
    let hydratedCount = 0;
    if (window.UBY_SUPABASE.loadRechargeSessions && ids.length) {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstPage = await window.UBY_SUPABASE.loadRechargeSessions({
        limit: OVERVIEW_PAGE_SIZE,
        from: currentMonthStart
      });
      const normalizedRows = [...(firstPage.rows || [])];
      for (let offset = normalizedRows.length; offset < firstPage.count; offset += OVERVIEW_PAGE_SIZE) {
        const nextPage = await window.UBY_SUPABASE.loadRechargeSessions({
          limit: OVERVIEW_PAGE_SIZE,
          offset,
          from: currentMonthStart
        });
        normalizedRows.push(...(nextPage.rows || []));
        await yieldToBrowser();
      }
      if (refreshSequence !== generalRefreshSequence) return;
      // O carregamento rápido traz somente o mês atual. Se o histórico completo
      // chegou enquanto esta consulta estava em andamento, nunca podemos trocar
      // a base completa por esse recorte — isso apagaria a comparação com o mês
      // anterior até o próximo refresh.
      if (!overviewSessionsFullyHydrated) {
        const chargesByWork = new Map(ids.map(id => [id, []]));
        normalizedRows.forEach(charge => {
          const id = String(charge.workId || '');
          if (!chargesByWork.has(id)) chargesByWork.set(id, []);
          chargesByWork.get(id).push(charge);
        });
        const compactRecords = (summaries || []).map(record => ({
          ...record,
          charges: chargesByWork.get(String(record.workId || '')) || [],
          summaryOnly: false,
          partialDetails: true,
          normalized: true
        }));
        mergeCloudRechargeRecords(compactRecords);
        window.UBY_RECHARGE_RUNTIME?.cacheSet?.(`general-records:${currentMonthStart.slice(0, 7)}`, compactRecords).catch(() => {});
        hydratedCount = compactRecords.length;
        overviewSessionsFullyHydrated = false;
      }
      await yieldToBrowser();
    }
    if (refreshSequence !== generalRefreshSequence) return;
    initWorkSelector();
    showGeneralWhenCurrentWorkIsEmpty();
    await renderVisibleOverviewViews();
    if (forceCloud) setStorageState(`Painel geral atualizado com ${hydratedCount} base(s) do Supabase.`);
  } catch (err) {
    await renderVisibleOverviewViews();
    if (forceCloud) setStorageState(`Painel geral local preservado. Supabase pendente: ${err.message}`, true);
  }
}

// NOVA PLATAFORMA (05/11/2026): abre com as recargas guardadas no aparelho e confere com a nuvem em segundo
// plano (como Gmail e apps de banco). Só as recargas vêm do aparelho; resumos e configurações financeiras são
// sempre os da nuvem. A cópia de gravação (UBY_WRITE_SCOPE) nunca usa o aparelho.

const OVERVIEW_CACHE_KEY = 'overview-charges:v1';

const OVERVIEW_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let overviewBackgroundRefresh = null;

function overviewSignature(rows) {
  let revenue = 0, energy = 0, last = '';
  rows.forEach(c => { revenue += Number(c.revenue || 0); energy += Number(c.energyKWh || 0); const s = String(c.startIso || ''); if (s > last) last = s; });
  return `${rows.length}|${Math.round(revenue * 100)}|${Math.round(energy * 100)}|${last}`;
}

function applyOverviewRecords(records) {
  mergeCloudRechargeRecords(records);
  records.forEach(record => fullRechargeWorkIds.add(String(record.workId || '')));
  overviewSessionsFullyHydrated = true;
  // Versão dos dados: o motor da Nova refaz os cálculos mesmo quando a quantidade de recargas não muda.
  window.UBY_RECORDS_VERSION = (window.UBY_RECORDS_VERSION || 0) + 1;
  markRechargeRecordsDirty();
}

async function fetchOverviewFromCloud() {
    // Resumos e 1ª página juntos; com o total em mãos, as demais páginas descem em paralelo (na ordem).
    const summariesPromise = window.UBY_SUPABASE.loadAllRechargeSummaries
      ? window.UBY_SUPABASE.loadAllRechargeSummaries()
      : Promise.resolve(Object.values(allRechargeRecords));
    const firstPage = await window.UBY_SUPABASE.loadRechargeSessions({ limit: OVERVIEW_PAGE_SIZE });
    const rows = [...(firstPage.rows || [])];
    const offsets = [];
    for (let offset = rows.length; offset < firstPage.count; offset += OVERVIEW_PAGE_SIZE) offsets.push(offset);
    const pages = await Promise.all(offsets.map(offset => window.UBY_SUPABASE.loadRechargeSessions({ limit: OVERVIEW_PAGE_SIZE, offset })));
    pages.forEach(page => rows.push(...(page.rows || [])));
    await yieldToBrowser();
    const summaries = await summariesPromise;
    const byWork = new Map();
    rows.forEach(charge => {
      const workId = String(charge.workId || '');
      if (!byWork.has(workId)) byWork.set(workId, []);
      byWork.get(workId).push(charge);
    });
    const records = summaries.map(record => ({
      ...record,
      charges: byWork.get(String(record.workId || '')) || [],
      summaryOnly: false,
      partialDetails: false,
      normalized: true
    }));
    const sig = overviewSignature(rows);
    window.UBY_RECHARGE_RUNTIME?.cacheSet?.(OVERVIEW_CACHE_KEY, { byWork: Object.fromEntries(byWork), sig }).catch(() => {});
    return { rows, records, sig };
}

async function ensureAllOverviewSessionsLoaded() {
  if (overviewSessionsFullyHydrated || !window.UBY_SUPABASE?.loadRechargeSessions) return;
  if (overviewSessionsHydrationPromise) return overviewSessionsHydrationPromise;
  overviewSessionsHydrationPromise = (async () => {
    if (!window.UBY_WRITE_SCOPE) {
      let cached = null;
      try { cached = await window.UBY_RECHARGE_RUNTIME?.cacheGet?.(OVERVIEW_CACHE_KEY, OVERVIEW_CACHE_MAX_AGE); } catch (_) {}
      const current = Object.values(allRechargeRecords || {});
      if (cached?.byWork && cached.sig && current.length) {
        applyOverviewRecords(current.map(record => ({ ...record, charges: cached.byWork[String(record.workId || '')] || [], summaryOnly: false, partialDetails: false, normalized: true })));
        window.UBY_OVERVIEW_FROM_CACHE = true;
        setStorageState('Historico do aparelho; conferindo com a nuvem...');
        overviewBackgroundRefresh = fetchOverviewFromCloud()
          .then(fresh => { applyOverviewRecords(fresh.records); window.UBY_OVERVIEW_FROM_CACHE = false; setStorageState(`Historico completo conferido: ${fresh.rows.length} recarga(s).`); window.dispatchEvent(new CustomEvent('uby:history-updated', { detail: { changed: fresh.sig !== cached.sig } })); })
          .catch(err => { console.warn('Conferencia do historico:', err.message); window.dispatchEvent(new CustomEvent('uby:history-updated', { detail: { changed: false, error: err.message } })); })
          .finally(() => { overviewBackgroundRefresh = null; });
        return;
      }
    }
    setStorageState('Carregando historico completo sob demanda...');
    const fresh = await fetchOverviewFromCloud();
    applyOverviewRecords(fresh.records);
    window.UBY_OVERVIEW_FROM_CACHE = false;
    setStorageState(`Historico completo carregado: ${fresh.rows.length} recarga(s).`);
  })().finally(() => {
    overviewSessionsHydrationPromise = null;
  });
  return overviewSessionsHydrationPromise;
}

function dcConnectorLabel(charge = {}) {
  const raw = safeText(charge.connType || charge.connectorType || charge.connector || '').trim();
  if (!raw) return '';
  const normalized = normalizeStationForCompare(raw).replace(/\s+/g, '');
  const ccsMatch = normalized.match(/CCS(?:2)?([AB])?\b/);
  if (ccsMatch?.[1]) return `CCS2 ${ccsMatch[1]}`;
  // Mantem o identificador fornecido pela plataforma quando ela usa outra
  // convencao (por exemplo, "Plug 1" ou "DC 60 kW - 2").
  return raw.toLocaleUpperCase('pt-BR');
}

function dcConnectorKey(charge = {}) {
  return normalizeStationForCompare(dcConnectorLabel(charge));
}

function dcConnectorGroups(charges = []) {
  const groups = new Map();
  charges.filter(charge => chargerKind(charge) === 'dc').forEach(charge => {
    const label = dcConnectorLabel(charge);
    if (!label) return;
    const key = dcConnectorKey(charge);
    if (!groups.has(key)) groups.set(key, { key, label, charges: [] });
    groups.get(key).charges.push(charge);
  });
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function parseRatingValue(value) {
  const raw = safeText(value).trim();
  if (!raw) return 0;
  const match = raw.match(/(\d+(?:[,.]\d+)?)/);
  if (!match) return 0;
  const rating = Number(match[1].replace(',', '.'));
  return Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
}

function median(values = []) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function normalizeTextForInsight(value) {
  return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const UBY_APP_VERSION = '20260903-unified-jardins1';

async function __perf(label, fn) {
  const t0 = performance.now();
  try { return await fn(); }
  finally { console.log(`[UBY-PERF] ${label}: ${(performance.now() - t0).toFixed(0)} ms`); }
}

// ---- substitutos sem tela ----
function getPower() {
  // Sem os campos de potência da página antiga: a potência vem do cadastro da obra
  // (era o que syncOperationalPowerInputs punha nesses campos).
  return workPowerById(currentWorkId);
}

function syncOperationalPowerInputs(workId = currentWorkId) {
  return workPowerById(workId);
}

function selectedPeriodMode() {
  return 'mtd';
}

function financeMonthKey() {
  return getMonths().at(-1) || '';
}

function selectedFinanceOnlyPeriod(sourceMonths = []) {
  return { monthKey: '', isMonthView: false, label: 'Acumulado' };
}

async function syncClubParticipantsFromSheet(options = {}) {
  const force = !!options.force;
  if (clubParticipantsSyncPromise && !force) return clubParticipantsSyncPromise;
  const endpoint = clubFormEndpointUrl();
  clubParticipantsSyncPromise = (async () => {
    let participants = [];
    let source = 'Google Sheets';
    if (endpoint) {
      const payload = await fetchClubFormEndpoint(endpoint);
      if (payload?.ok === false) throw new Error(payload.error || 'endpoint recusou a leitura');
      participants = clubParticipantsFromEndpointPayload(payload);
      source = payload?.source || 'Apps Script seguro';
    } else {
      const response = await fetch(`${CLUB_FORM_CSV_URL}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Google retornou ${response.status}`);
      participants = clubParticipantsFromRows(parseCsvRows(await response.text()));
    }
    return mergeClubParticipants(participants, source);
  })();
  try {
    return await clubParticipantsSyncPromise;
  } finally {
    clubParticipantsSyncPromise = null;
  }
}

function setStorageState(message, isError = false) {
  // Antes escrevia num elemento da página antiga; agora fica no estado do núcleo.
  NUCLEO_STATUS.message = String(message || "").replace(/<[^>]*>/g, "");
  NUCLEO_STATUS.isError = !!isError;
  NUCLEO_STATUS.at = Date.now();
  try { window.dispatchEvent(new CustomEvent("uby:nucleo-status", { detail: { ...NUCLEO_STATUS } })); } catch (_) {}
}

function saveNetworkDistribution(settings, options = {}) {
  networkDistributionState = normalizeNetworkDistribution(settings);
  try { localStorage.setItem(NETWORK_DISTRIBUTION_KEY, JSON.stringify(networkDistributionState)); } catch (_) {}
  if (options.remote !== false) persistMatrizCosts().catch(error => {
    console.warn('[network-distribution-save]', error);
    setStorageState(`Salvo neste navegador; nuvem pendente: ${error?.message || 'erro de sincronização'}.`, true);
  });
  return networkDistributionState;
}

function setMatrizFeedback(msg, isError) {
  if (msg) setStorageState(msg, !!isError);
}

function applyRechargeRecord(record, sourceLabel) {
  syncGeneralRecordsFromLocal();
  allCharges = dedupeChargesByUniqueKey((record?.charges || [])
    .map(hydrateCharge)
    .filter(charge => !stationBlockedForWork(currentWorkId, charge.station))
    .filter(charge => chargeBelongsToWork(charge, currentWorkId, currentWorkName)));
  monthlyClosings = record?.monthlyClosings || record?.summary?.monthlyClosings || {};
  reconcileMonthlyClosingsWithCharges();
  financialSettings = record?.financialSettings || record?.summary?.financialSettings || {};
  stationAvailability = record?.stationAvailability || record?.summary?.stationAvailability || {};
  syncOperationalPowerInputs(currentWorkId);
  ubyOperationOverrides = record?.ubyOperationOverrides || record?.summary?.ubyOperationOverrides || {};
  loadedFiles = (record?.files || []).filter(file => file && file.name).map(file => ({
    fileKey: file.fileKey || fileSourceKey(file.month, file.name, file.station || ''),
    name: file.name,
    station: file.station || '',
    size: file.size || 0,
    lastModified: file.lastModified || 0,
    month: file.month || '',
    importMode: file.importMode || 'merge',
    importedAt: file.importedAt || record.updatedAt || new Date().toISOString()
  }));
  applyStationReportFilter();
  const targetName = currentStationReportName || currentWorkName;
  if (!allCharges.length) {
    setStorageState(`Sem planilha salva para <strong>${targetName}</strong>. O Painel Geral continua disponivel.`);
    return;
  }
  const updated = record.updatedAt ? new Date(record.updatedAt).toLocaleString('pt-BR') : 'agora';
  const filterNote = currentStationReportName ? ' Visualizacao filtrada por estacao; a base completa permanece preservada.' : stationMismatchMessage();
  setStorageState(`Carregado de ${sourceLabel} para <strong>${targetName}</strong>: ${loadedFiles.length} arquivo(s), ${allCharges.length} recarga(s). Ultima atualizacao: ${updated}.${filterNote}`);
}

async function initializeRechargePage() {
  await loadRechargeWorksFromCloud();
  await refreshGeneralRechargeBases();
  window.UBY_RECHARGE_RUNTIME?.markReady?.({ records: Object.keys(allRechargeRecords || {}).length });
}

// ---- funções de tela da página antiga que as regras chamam: aqui não desenham nada ----
function initWorkSelector() {} // tela antiga: não desenhar
function loadCustomerRegistry() {} // tela antiga: não desenhar
function mountUbyFinanceWorkspace() {} // tela antiga: não desenhar
function openGeneralFinanceView() {} // tela antiga: não desenhar
function renderClientsTable() {} // tela antiga: não desenhar
function renderFinanceOnly() {} // tela antiga: não desenhar
function renderGeneralFinance() {} // tela antiga: não desenhar
function renderGeneralFinanceOverview() {} // tela antiga: não desenhar
function renderKPIs() {} // tela antiga: não desenhar
function renderMatrizCosts() {} // tela antiga: não desenhar
function renderMatrizMonthlyDre() {} // tela antiga: não desenhar
function renderNetworkDre() {} // tela antiga: não desenhar
function renderNetworkIntelligence() {} // tela antiga: não desenhar
function renderNewClients() {} // tela antiga: não desenhar
function renderScheduledPayments() {} // tela antiga: não desenhar
function renderUbyDistribution() {} // tela antiga: não desenhar
function renderUbyFinancialOverview() {} // tela antiga: não desenhar
function renderUbyOperation() {} // tela antiga: não desenhar
function renderVisibleOverviewViews() {} // tela antiga: não desenhar
function scheduleLiveOccupationRefresh() {} // tela antiga: não desenhar
function showGeneralWhenCurrentWorkIsEmpty() {} // tela antiga: não desenhar
function showTab() {} // tela antiga: não desenhar

window.UBY_NUCLEO = {
  status: () => ({ ...NUCLEO_STATUS }),
  iniciar: initializeRechargePage,
  state: {
    get allCharges() { return allCharges; }, set allCharges(v) { allCharges = v; },
    get loadedFiles() { return loadedFiles; }, set loadedFiles(v) { loadedFiles = v; },
    get allRechargeRecords() { return allRechargeRecords; }, set allRechargeRecords(v) { allRechargeRecords = v; },
    get cloudRechargeWorks() { return cloudRechargeWorks; }, set cloudRechargeWorks(v) { cloudRechargeWorks = v; },
    get monthlyClosings() { return monthlyClosings; }, set monthlyClosings(v) { monthlyClosings = v; },
    get financialSettings() { return financialSettings; }, set financialSettings(v) { financialSettings = v; },
    get stationAvailability() { return stationAvailability; }, set stationAvailability(v) { stationAvailability = v; },
    get ubyOperationOverrides() { return ubyOperationOverrides; }, set ubyOperationOverrides(v) { ubyOperationOverrides = v; },
    get rechargeRecordsVersion() { return rechargeRecordsVersion; }, set rechargeRecordsVersion(v) { rechargeRecordsVersion = v; },
    get generalUnitDataCache() { return generalUnitDataCache; }, set generalUnitDataCache(v) { generalUnitDataCache = v; },
    get networkHistoryCache() { return networkHistoryCache; }, set networkHistoryCache(v) { networkHistoryCache = v; },
    get networkHistoryCacheVersion() { return networkHistoryCacheVersion; }, set networkHistoryCacheVersion(v) { networkHistoryCacheVersion = v; },
    get localRechargeDbSignature() { return localRechargeDbSignature; }, set localRechargeDbSignature(v) { localRechargeDbSignature = v; },
    get financeReportArchive() { return financeReportArchive; }, set financeReportArchive(v) { financeReportArchive = v; },
    get financeReportArchiveLoaded() { return financeReportArchiveLoaded; }, set financeReportArchiveLoaded(v) { financeReportArchiveLoaded = v; },
    get financeReportArchivePromise() { return financeReportArchivePromise; }, set financeReportArchivePromise(v) { financeReportArchivePromise = v; },
    get rechargeLoadSequence() { return rechargeLoadSequence; }, set rechargeLoadSequence(v) { rechargeLoadSequence = v; },
    get generalRefreshSequence() { return generalRefreshSequence; }, set generalRefreshSequence(v) { generalRefreshSequence = v; },
    get overviewInsightsTimers() { return overviewInsightsTimers; }, set overviewInsightsTimers(v) { overviewInsightsTimers = v; },
    get uby() { return uby; }, set uby(v) { uby = v; },
    get overviewSessionsFullyHydrated() { return overviewSessionsFullyHydrated; }, set overviewSessionsFullyHydrated(v) { overviewSessionsFullyHydrated = v; },
    get overviewSessionsHydrationPromise() { return overviewSessionsHydrationPromise; }, set overviewSessionsHydrationPromise(v) { overviewSessionsHydrationPromise = v; },
    get fullRechargeWorkIds() { return fullRechargeWorkIds; }, set fullRechargeWorkIds(v) { fullRechargeWorkIds = v; },
    get rechargeFullLoadPromises() { return rechargeFullLoadPromises; }, set rechargeFullLoadPromises(v) { rechargeFullLoadPromises = v; },
    get clubParticipantsSyncPromise() { return clubParticipantsSyncPromise; }, set clubParticipantsSyncPromise(v) { clubParticipantsSyncPromise = v; },
    get clubParticipantsAutoSyncAttempted() { return clubParticipantsAutoSyncAttempted; }, set clubParticipantsAutoSyncAttempted(v) { clubParticipantsAutoSyncAttempted = v; },
    get currentWorkId() { return currentWorkId; }, set currentWorkId(v) { currentWorkId = v; },
    get currentWorkName() { return currentWorkName; }, set currentWorkName(v) { currentWorkName = v; },
    get currentStationReportName() { return currentStationReportName; }, set currentStationReportName(v) { currentStationReportName = v; },
    get spreadsheetLibraryPromise() { return spreadsheetLibraryPromise; }, set spreadsheetLibraryPromise(v) { spreadsheetLibraryPromise = v; },
    get _workOptionsCache() { return _workOptionsCache; }, set _workOptionsCache(v) { _workOptionsCache = v; },
    get _workOptionsSig() { return _workOptionsSig; }, set _workOptionsSig(v) { _workOptionsSig = v; },
    get _chargesByMonthIndex() { return _chargesByMonthIndex; }, set _chargesByMonthIndex(v) { _chargesByMonthIndex = v; },
    get _chargesByMonthSrc() { return _chargesByMonthSrc; }, set _chargesByMonthSrc(v) { _chargesByMonthSrc = v; },
    get matrizCostsState() { return matrizCostsState; }, set matrizCostsState(v) { matrizCostsState = v; },
    get matrizCostsLoaded() { return matrizCostsLoaded; }, set matrizCostsLoaded(v) { matrizCostsLoaded = v; },
    get networkDistributionState() { return networkDistributionState; }, set networkDistributionState(v) { networkDistributionState = v; },
    get matrizCostsLoadPromise() { return matrizCostsLoadPromise; }, set matrizCostsLoadPromise(v) { matrizCostsLoadPromise = v; },
    get matrizCostsSaveChain() { return matrizCostsSaveChain; }, set matrizCostsSaveChain(v) { matrizCostsSaveChain = v; },
    get overviewBackgroundRefresh() { return overviewBackgroundRefresh; }, set overviewBackgroundRefresh(v) { overviewBackgroundRefresh = v; },
    get getUbyChargerRows() { return getUbyChargerRows; }, set getUbyChargerRows(v) { getUbyChargerRows = v; },
    get clientKeyFromCharge() { return clientKeyFromCharge; }, set clientKeyFromCharge(v) { clientKeyFromCharge = v; }
  },
  __perf,
  abbreviatedStationLabel,
  aggregateUbyFinanceRow,
  applyInvestorOperationStart,
  applyOverviewRecords,
  applyRechargeRecord,
  applyStationReportFilter,
  availabilityForCurrentCharges,
  buildMonthClosing,
  buildUbyMonthlySeries,
  calendarDayCount,
  canonicalClientName,
  canonicalClubPersonName,
  canonicalStationNameForWork,
  chargeBelongsToWork,
  chargeDayKeyFromDate,
  chargeDayLabel,
  chargeMonthKey,
  chargerKey,
  chargerKind,
  chargesForMonth,
  cleanOperationStats,
  clientDisplayName,
  clientIdentityKey,
  clientRecurrenceStats,
  clientStationKey,
  clientStationLabel,
  closingMatchesLiveSummary,
  closingMatchesMonth,
  clubBenefitForPosition,
  clubClientRows,
  clubCompetitionMonths,
  clubFormEndpointUrl,
  clubParticipantFromFormRow,
  clubParticipantKey,
  clubParticipantKeys,
  clubParticipantLookup,
  clubParticipantsFromEndpointPayload,
  clubParticipantsFromRows,
  clubParticipantsStore,
  clubPersonTokens,
  clubWinnerNotice,
  compactRechargeRecord,
  compareInvestorsByStart,
  completedWorkStatus,
  consolidateCustomerRegistryRows,
  continuousOperationalRows,
  countDetailedCharges,
  couponControlCalculatedDiscount,
  couponControlDateKey,
  couponControlIdentityKey,
  couponControlNumber,
  couponControlPercentFromCode,
  couponControlRow,
  couponControlRowsFromSheet,
  couponDiscountPct,
  couponLabelForCharge,
  couponLabelFromDiscountPct,
  courtesyFinanceBreakdown,
  courtesyIdentityCandidates,
  currentWork,
  currentWorkOperationStart,
  customerRegistryIdentityKeys,
  customerRegistryNumber,
  customerRegistryRowsFromCloud,
  dailyOperationalRows,
  dailySeriesBounds,
  dateKeyLocal,
  dateOnly,
  dayLabelFromDate,
  daysInMonth,
  dcComparisonRowKey,
  dcConnectorGroups,
  dcConnectorKey,
  dcConnectorLabel,
  dcStationIdentity,
  dcWorkIdentity,
  dedupeChargesByUniqueKey,
  defaultFinanceSettings,
  defaultNetworkDistribution,
  defaultNetworkInvestors,
  defaultPhysicalLayout,
  durToHours,
  eachDateInRange,
  effectiveMonthStart,
  enrichClubClientRows,
  ensureAllOverviewSessionsLoaded,
  ensureClubParticipantsAutoSync,
  ensureMatrizCostsLoaded,
  ensureSpreadsheetLibrary,
  escapeAttr,
  escapeHtml,
  estimatedCouponDiscount,
  evaluateFinanceRules,
  excelSerialToDate,
  expectedRechargeCount,
  fetchClubFormEndpoint,
  fetchJsonp,
  fetchOverviewFromCloud,
  fileDate,
  fileSourceKey,
  filterChargesByWindow,
  filterGeneralUnitDataByMonth,
  financeChargerStorageKey,
  financeFixedRuleTotal,
  financeForCharges,
  financeMonthKey,
  financePlanningContext,
  financeReportTuple,
  financeRuleCatalog,
  financeRuleField,
  financeRuleLegacyField,
  financeSettingsForUbyRow,
  financeStoreForScope,
  financeUnitOutcome,
  financeVariableCostPerKWh,
  firstChargeByClient,
  firstClientDayMap,
  fmtPct,
  formatRechargeDuration,
  generalAcDcStats,
  generalFinanceByUnit,
  getAllGeneralCharges,
  getGeneralStationRows,
  getGeneralUnitData,
  getMonths,
  getPower,
  getUbyOperationCharges,
  headerValue,
  hydrateCharge,
  hydratedRechargeRecord,
  idleToMin,
  initializeRechargePage,
  investorOperationMonth,
  isAuroraAcCandidateText,
  isCloudRecordNewer,
  isCourtesyCharge,
  isCurrentMonthKey,
  isExecutedCharge,
  isFailedCharge,
  isLegacyCrossMonthAreaReport,
  isPlausibleChargeDate,
  isPlausibleMonthKey,
  isRobertKochCandidateText,
  isRobertKochWorkId,
  isSinglePhysicalChargerStation,
  isSpottRecharge,
  isUbyOperationCharge,
  isUbyOperationGroup,
  isUnifiedAuroraAcStation,
  isUnifiedJardinsStation,
  livePeriodEndForMonth,
  loadFinanceReportArchive,
  loadMatrizCosts,
  loadMatrizCostsLegacy,
  loadNetworkDistribution,
  loadRechargeBase,
  loadRechargeWorksFromCloud,
  loadScriptOnce,
  localRechargeDb,
  localRecord,
  markDistinctRepeatedRows,
  markRechargeRecordsDirty,
  matrizAddMonths,
  matrizApplies,
  matrizApplyLegacyCoveragePolicy,
  matrizCashAmount,
  matrizCompetencyAmount,
  matrizCostItemsForRow,
  matrizCoverageMonths,
  matrizEligibleRow,
  matrizEligibleRows,
  matrizKindLabel,
  matrizMethodLabel,
  matrizMonthOffset,
  matrizMonthSequence,
  matrizNormalizeCost,
  matrizResolveTargetRow,
  matrizRowForUnit,
  matrizRowsMatch,
  matrizScopeCandidates,
  matrizScopeKey,
  matrizStationScope,
  matrizTargetCandidates,
  matrizTargetMatchesRow,
  matrizWeight,
  median,
  mergeCloudRechargeRecords,
  mergeClubParticipants,
  mergeFinanceReportArchive,
  mergeRechargeRecord,
  mergeUnifiedAuroraAcUbyRows,
  monthCanBeClosed,
  monthEndDate,
  monthHasEffectiveClosing,
  monthKey,
  monthLabel,
  monthLiveSummary,
  monthStartDate,
  monthlyClientCohorts,
  monthlyEquivalentComparison,
  networkFinanceSum,
  networkHistoryCharges,
  networkInvestorDistributionModel,
  networkUnifiedReportModel,
  newClientInsights,
  normalizeClubEmail,
  normalizeClubParticipantObject,
  normalizeCouponCode,
  normalizeDistributionLedger,
  normalizeFinanceRules,
  normalizeHeaderName,
  normalizeNetworkDistribution,
  normalizeNetworkInvestors,
  normalizeOperationModel,
  normalizePhone,
  normalizeStationForCompare,
  normalizeTextForInsight,
  normalizedCouponLabel,
  occByFullMonth,
  occByInterval,
  occupationBand,
  operationModelLabel,
  operationStartForCharges,
  overviewSignature,
  parseCsvRows,
  parseDate,
  parseNumber,
  parseRatingValue,
  pctChange,
  periodBounds,
  periodWindow,
  persistMatrizCosts,
  preferredRechargeVersion,
  previousMonthEnergyForFinance,
  rangeRevenue,
  readCustomerRegistryCloud,
  readJson,
  readLocalFinanceReports,
  recentCharges,
  rechargeControlIssue,
  rechargeEligibleWork,
  rechargePersonIdentity,
  rechargeRecordHasData,
  rechargeSourcePlatform,
  rechargeUniqueKey,
  reconcileMonthlyClosingsWithCharges,
  recordHasFullRechargeDetails,
  recurringAbsentClients,
  refreshGeneralRechargeBases,
  reportEndForCharges,
  resolveChargeMonthKey,
  rowHasData,
  safeText,
  sameStationName,
  saveMatrizCosts,
  saveNetworkDistribution,
  scheduledPaymentApplies,
  scheduledPaymentDueDate,
  scheduledPaymentStatus,
  scheduledPaymentTarget,
  selectedFinanceOnlyPeriod,
  selectedPeriodMode,
  selectorChargesForWork,
  selectorWorksWithoutDuplicateStations,
  setMatrizFeedback,
  setStorageState,
  shiftToPreviousMonth,
  sortFinanceReports,
  stationAvailabilityFor,
  stationAvailabilityKey,
  stationAvailableHours,
  stationBlockedForWork,
  stationLooksRelatedToWork,
  stationMismatchMessage,
  stationOccupancyForMonths,
  stationScheduleLabel,
  stationUbyOperationKey,
  storageQuotaExceeded,
  summarizeGeneralUnit,
  summarizeUbyChargerRow,
  summaryMetrics,
  syncClubParticipantsFromSheet,
  syncGeneralRecordsFromLocal,
  syncOperationalPowerInputs,
  targetOccupationMetrics,
  timeMinutes,
  tryWriteJson,
  ubyFinanceMonthsForRow,
  ubyNetworkProjectionForRow,
  ubyOperationKey,
  ubyOperationRuleSource,
  unifiedJardinsRecordForView,
  uniqueClientStationLabels,
  unitOccupancyMarkup,
  updatedAtMs,
  usageSeries,
  weekdayOccupancyRows,
  workExcludedFromRecharge,
  workHasRechargeHistory,
  workNameById,
  workOptions,
  workOptionsSignature,
  workOptionsUncached,
  workPowerById,
  workSelectorDataScore,
  workSelectorKinds,
  workSelectorLabel,
  workSelectorOrder,
  workSelectorStationName,
  writeClubParticipantsStore,
  writeJson,
  writeLocalFinanceReports,
  yesLike,
  yieldToBrowser,
  __base_getUbyChargerRows,
  __base_clientKeyFromCharge,
  RECARGAS_LOCAL_KEY,
  FINANCE_REPORTS_LOCAL_KEY,
  XLSX_CDN_URL,
  CLUB_PARTICIPANTS_LOCAL_KEY,
  OVERVIEW_PAGE_SIZE,
  CLUB_FORM_SHEET_ID,
  CLUB_FORM_GID,
  CLUB_FORM_CSV_URL,
  CLUB_FORM_AUTO_SYNC_MAX_AGE_MS,
  FINANCE_COST_ITEMS,
  FINANCE_EXTRA_REVENUE_ITEMS,
  FINANCE_RULE_BASIS,
  appData,
  RECHARGE_STATION_BLOCKLIST_BY_WORK,
  RECHARGE_WORK_BLOCKLIST_TERMS,
  DEFAULT_STATION_PHYSICAL_LAYOUTS,
  MATRIZ_LEGACY_COSTS_KEY,
  MATRIZ_COSTS_KEY,
  NETWORK_DISTRIBUTION_KEY,
  MAX_DAILY_RANGE_DAYS,
  WEEKDAY_LABELS_BR,
  WEEKDAY_ORDER_BR,
  OVERVIEW_CACHE_KEY,
  OVERVIEW_CACHE_MAX_AGE,
  UBY_APP_VERSION
};
})();

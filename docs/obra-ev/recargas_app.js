UBY_AUTH.require('recargas');
/* ============================================================
   UBY Recharge — Painel de Recargas v2.0
   Upload dinâmico .xlsx · Mensal · Acumulado · Detalhes
   Cálculo de ocupação: kWh ÷ (potência × horas do período)
============================================================ */

let allCharges  = [];
let loadedFiles = [];
const DETAIL_PAGE_SIZE = 300;
let detailRenderLimit = DETAIL_PAGE_SIZE;
let charts      = {};
// Dashboard data can rebuild several charts at once. Animations add no value on
// refresh and can monopolize the browser main thread on lower-powered devices.
if (window.Chart) {
  Chart.defaults.animation = false;
  Chart.defaults.responsive = true;
}
let allRechargeRecords = {};
let cloudRechargeWorks = [];
let openingWorkReport = false;
let openWorkReportInFlight = false;
let monthlyClosings = {};
let financialSettings = {};
let stationAvailability = {};
let financeSaveTimer = null;
let financePendingSave = null;
let financeSaveInFlight = Promise.resolve();
let liveOccupationRefreshTimer = null;
let financeEditorCurrentSettings = null;
let ubyOperationOverrides = {};
let rechargeRecordsVersion = 0;
let generalUnitDataCache = null;
let networkHistoryCache = null;
let networkHistoryCacheVersion = -1;
let localRechargeDbSignature = '';
let financeReportArchive = [];
let financeReportArchiveLoaded = false;
let financeReportArchivePromise = null;
let financeHistorySyncPromise = null;
let ubyAreaReportSyncPromise = null;
let ubyInvestorReportSyncPromise = null;
let ubyReportsRequested = false;
let pendingUbyAccountingRows = [];
let rechargeLoadSequence = 0;
let generalRefreshSequence = 0;
let rechargeImportQueue = Promise.resolve();
let queuedRechargeImports = 0;
let monthlyRenderSequence = 0;
let monthlyInsightsTimer = null;
let overviewRenderState = { geral: '', uby: '', financeiroGeral: '' };
let overviewRenderSequence = { geral: 0, uby: 0, financeiroGeral: 0 };
let overviewInsightsTimers = { geral: null, uby: null };
let overviewSessionsFullyHydrated = false;
let overviewSessionsHydrationPromise = null;
let fullRechargeWorkIds = new Set();
let rechargeFullLoadPromises = new Map();
let operationalPowerSaveInFlight = false;

const COLORS = ['#57B7FF','#246BFE','#FFD66B','#38D4FF','#F2A93D','#8BD7A8','#EF6C6C','#B39DDB'];
const RECARGAS_LOCAL_KEY = 'uby-recargas-db-v1';
const RECARGAS_IMPORT_UNDO_KEY = 'uby-recargas-import-undo-v1';
const UBY_AREA_ACCOUNTING_KEY = 'uby-area-accounting-v1';
const FINANCE_REPORTS_LOCAL_KEY = 'uby-finance-reports-v1';
const XLSX_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const CLUB_PARTICIPANTS_LOCAL_KEY = 'uby-club-participants-v1';
const CLUB_PARTNERS_LOCAL_KEY = 'uby-club-partners-v1';
const CUSTOMER_REGISTRY_LOCAL_KEY = 'uby-customer-registry-v1';
const CUSTOMER_REGISTRY_CLOUD_ID = '__customer_registry__';
const OVERVIEW_PAGE_SIZE = 1000;
const CLUB_FORM_ID = '1OqvX0LKcrdKe8VPvkrSX6fxGhM0T1JZNExfuCHRddvM';
const CLUB_FORM_RESPONSES_URL = `https://docs.google.com/forms/d/${CLUB_FORM_ID}/edit#responses`;
const CLUB_FORM_SHEET_ID = '19iPeYks-8P0Fd3henDoTYFPN5hQ6dconJgsQOl30Qws';
const CLUB_FORM_GID = '1124525277';
const CLUB_FORM_CSV_URL = `https://docs.google.com/spreadsheets/d/${CLUB_FORM_SHEET_ID}/export?format=csv&gid=${CLUB_FORM_GID}`;
const CLUB_FORM_AUTO_SYNC_MAX_AGE_MS = 10 * 60 * 1000;
let clubParticipantsSyncPromise = null;
let clubParticipantsAutoSyncAttempted = false;
const CALENDAR_CONTEXT_CACHE_KEY = 'uby-recargas-calendar-context-v1';
const CALENDAR_CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WEATHER_LOCATIONS = [
  { key: 'londrina', name: 'Londrina', lat: -23.3045, lon: -51.1696, aliases: ['londrina', 'rio beach', 'santarem', 'sabar', 'araguaia'] },
  { key: 'cambe', name: 'Cambé', lat: -23.2758, lon: -51.2784, aliases: ['cambe', 'cambé', 'prata'] },
  { key: 'maringa', name: 'Maringá', lat: -23.4205, lon: -51.9333, aliases: ['maringa', 'maringá', 'robert koch', 'malassise r k', 'rk'] },
  { key: 'cascavel', name: 'Cascavel', lat: -24.9555, lon: -53.4552, aliases: ['cascavel'] },
  { key: 'curitiba', name: 'Curitiba', lat: -25.4284, lon: -49.2733, aliases: ['curitiba'] },
  { key: 'sao-paulo', name: 'São Paulo', lat: -23.5505, lon: -46.6333, aliases: ['sao paulo', 'são paulo', 'sp'] }
];
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
const FINANCE_REVENUE_SCOPE = [
  ['operational', 'Operacional / complementar'],
  ['non_operational', 'Nao operacional / fechamento mensal']
];
const appData = window.UBY_APP_DATA || {};
let currentWorkId = new URLSearchParams(location.search).get('obra') || localStorage.getItem('uby-recargas-current-work') || 'rio';
let currentWorkName = '';
let currentStationReportName = '';
let spreadsheetLibraryPromise = null;
const RECHARGE_STATION_BLOCKLIST_BY_WORK = {
  malassise: ['posto prata', 'prata cambe', 'prata cambé', 'cambe', 'cambé']
};
// Obras/estações removidas do painel de recargas (não aparecem em nenhuma
// visão nem entram nos totais). Não apaga dados no Supabase — é só filtro.
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

function toggleStationScheduleInputs() {
  const open24h = document.getElementById('stationLayoutOpen24h')?.checked;
  ['stationLayoutOpenTime', 'stationLayoutCloseTime'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.disabled = open24h;
  });
}

function openStationLayoutConfiguration(workId, stationName) {
  const workName = workNameById(workId, workId);
  const config = stationAvailabilityFor(workId, stationName, workName);
  document.getElementById('stationLayoutWorkId').value = workId;
  document.getElementById('stationLayoutSourceName').value = stationName;
  document.getElementById('stationLayoutPlantName').value = config.plantName || stationName;
  document.getElementById('stationLayoutAcChargers').value = config.acChargers || 0;
  document.getElementById('stationLayoutAcPlugs').value = config.acPlugs || 0;
  document.getElementById('stationLayoutDcChargers').value = config.dcChargers || 0;
  document.getElementById('stationLayoutDcPlugs').value = config.dcPlugs || 0;
  document.getElementById('stationLayoutOperationStart').value = /^\d{4}-\d{2}-\d{2}$/.test(String(config.operationStart || '')) ? config.operationStart : '';
  document.getElementById('stationLayoutOpen24h').checked = config.open24h !== false;
  document.getElementById('stationLayoutOpenTime').value = config.openTime || '08:00';
  document.getElementById('stationLayoutCloseTime').value = config.closeTime || '22:00';
  document.getElementById('stationLayoutReferenceTariff').value = Number(config.referenceTariffPerKwh || 0) || '';
  document.getElementById('stationLayoutCourtesyTreatment').value = config.courtesyTreatment || 'operational';
  document.getElementById('stationLayoutCourtesyResponsible').value = config.courtesyResponsible || '';
  document.getElementById('stationLayoutCourtesyUsers').value = (config.courtesyUsers || []).join('\n');
  const openDays = new Set((config.openDays || [0,1,2,3,4,5,6]).map(Number));
  document.querySelectorAll('.station-open-day').forEach(input => { input.checked = openDays.has(Number(input.value)); });
  toggleStationScheduleInputs();
  document.getElementById('stationLayoutDialog').showModal();
}

async function saveStationLayoutConfiguration() {
  const workId = document.getElementById('stationLayoutWorkId').value;
  const sourceName = document.getElementById('stationLayoutSourceName').value;
  const openDays = [...document.querySelectorAll('.station-open-day:checked')].map(input => Number(input.value));
  if (!workId || !sourceName || !openDays.length) {
    alert('Selecione ao menos um dia de funcionamento.');
    return;
  }
  const config = {
    plantName: document.getElementById('stationLayoutPlantName').value.trim() || sourceName,
    acChargers: Math.max(0, Number(document.getElementById('stationLayoutAcChargers').value) || 0),
    acPlugs: Math.max(0, Number(document.getElementById('stationLayoutAcPlugs').value) || 0),
    dcChargers: Math.max(0, Number(document.getElementById('stationLayoutDcChargers').value) || 0),
    dcPlugs: Math.max(0, Number(document.getElementById('stationLayoutDcPlugs').value) || 0),
    operationStart: /^\d{4}-\d{2}-\d{2}$/.test(document.getElementById('stationLayoutOperationStart').value || '') ? document.getElementById('stationLayoutOperationStart').value : '',
    open24h: document.getElementById('stationLayoutOpen24h').checked,
    openTime: document.getElementById('stationLayoutOpenTime').value || '08:00',
    closeTime: document.getElementById('stationLayoutCloseTime').value || '22:00',
    openDays,
    referenceTariffPerKwh: Math.max(0, Number(document.getElementById('stationLayoutReferenceTariff').value) || 0),
    courtesyTreatment: ['operational', 'partner_absorbed', 'uby_absorbed'].includes(document.getElementById('stationLayoutCourtesyTreatment').value)
      ? document.getElementById('stationLayoutCourtesyTreatment').value : 'operational',
    courtesyResponsible: safeText(document.getElementById('stationLayoutCourtesyResponsible').value).trim(),
    courtesyUsers: safeText(document.getElementById('stationLayoutCourtesyUsers').value)
      .split(/[\n,;]/)
      .map(value => value.trim())
      .filter(Boolean)
  };
  const source = allRechargeRecords[workId] || localRecord(workId) || rechargeMetadataSeed(workId);
  const availability = { ...(source.stationAvailability || source.summary?.stationAvailability || {}) };
  availability[stationAvailabilityKey(sourceName)] = config;
  const updatedAt = new Date().toISOString();
  const record = {
    ...source,
    stationAvailability: availability,
    summary: { ...(source.summary || {}), stationAvailability: availability, updatedAt },
    updatedAt
  };
  allRechargeRecords[workId] = hydratedRechargeRecord(record, workId);
  if (workId === currentWorkId) stationAvailability = availability;
  const db = localRechargeDb();
  db[workId] = compactRechargeRecord(record);
  writeJson(RECARGAS_LOCAL_KEY, db);
  markRechargeRecordsDirty();
  try {
    if (window.UBY_SUPABASE?.saveRechargeMetadata) await window.UBY_SUPABASE.saveRechargeMetadata(workId, record);
    document.getElementById('stationLayoutDialog').close();
    await renderGeral();
    setStorageState(`Horario operacional salvo para <strong>${config.plantName}</strong>.`);
  } catch (err) {
    setStorageState(`Configuracao preservada localmente. Banco pendente: ${err.message}`, true);
  }
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
      if (config?.open24h !== false) {
        availableEnd.setDate(availableEnd.getDate() + 1);
      } else {
        availableStart.setMinutes(timeMinutes(config.openTime, 0));
        availableEnd.setMinutes(timeMinutes(config.closeTime, 24 * 60));
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
  return `${days || 'Sem dias'} - ${config.open24h !== false ? '24 horas' : `${config.openTime} as ${config.closeTime}`}`;
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

function syncOperationalPowerInputs(workId = currentWorkId) {
  const power = workPowerById(workId);
  ['chargerPower', 'chargerPowerAcc'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = power;
  });
  return power;
}

async function saveOperationalPowerFromInputs(value = null) {
  if (operationalPowerSaveInFlight) return;
  const primary = document.getElementById('chargerPower');
  const accumulated = document.getElementById('chargerPowerAcc');
  const candidate = Number(value ?? primary?.value ?? accumulated?.value ?? 0);
  if (!Number.isFinite(candidate) || candidate < 1 || candidate > 360) {
    setStorageState('Informe uma potência operacional entre 1 e 360 kW.', true);
    syncOperationalPowerInputs();
    return;
  }

  const power = Math.round(candidate * 10) / 10;
  const workId = currentWorkId;
  const source = allRechargeRecords[workId] || localRecord(workId) || rechargeMetadataSeed(workId);
  const updatedAt = new Date().toISOString();
  const record = {
    ...source,
    operationalPowerKw: power,
    summary: {
      ...(source.summary || {}),
      operationalPowerKw: power,
      updatedAt
    },
    updatedAt
  };

  operationalPowerSaveInFlight = true;
  allRechargeRecords[workId] = hydratedRechargeRecord(record, workId);
  const db = localRechargeDb();
  db[workId] = compactRechargeRecord(record);
  writeJson(RECARGAS_LOCAL_KEY, db);
  window.UBY_RECHARGE_RUNTIME?.cacheSet?.(`work:${workId}`, record).catch(() => {});
  markRechargeRecordsDirty();
  syncOperationalPowerInputs(workId);

  try {
    if (window.UBY_SUPABASE?.saveRechargeMetadata) {
      await window.UBY_SUPABASE.saveRechargeMetadata(workId, {
        ...record,
        metadataType: 'operational_power'
      });
    }
    setStorageState(`Potência operacional de <strong>${currentWorkName}</strong> salva em <strong>${power.toLocaleString('pt-BR')} kW</strong>. Indicadores recalculados.`);
  } catch (err) {
    setStorageState(`Potência operacional salva neste navegador. Banco pendente: ${err.message}`, true);
  } finally {
    operationalPowerSaveInFlight = false;
  }

  await renderAll();
}

function currentWorkPartnerName() {
  const work = currentWork();
  return String(work?.cliente || work?.nome || 'Parceiro').trim() || 'Parceiro';
}

function setStorageState(message, isError = false) {
  const el = document.getElementById('storageState');
  if (!el) return;
  el.style.color = isError ? 'var(--p3-warn)' : 'var(--p3-muted)';
  el.innerHTML = message;
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

function clientKeyFromCharge(charge = {}) {
  return clientIdentityKey(charge.userName, charge.userEmail, charge.userPhone);
}

function serializeCharge(charge) {
  return {
    ...charge,
    startIso: charge.startDate ? charge.startDate.toISOString() : '',
    endIso: charge.endDate ? charge.endDate.toISOString() : '',
    startDate: undefined,
    endDate: undefined
  };
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
  return { ...charge, startDate, endDate };
}

function chargeDateKey(charge) {
  const date = charge?.startDate || parseDate(charge?.startStr || '');
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
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
function rechargeMetadataSeed(workId) {
  const id = String(workId || '').trim();
  const workName = workNameById(id, id);
  const updatedAt = new Date().toISOString();
  return hydratedRechargeRecord({
    workId: id,
    workName,
    files: [],
    charges: [],
    summary: {
      workId: id,
      workName,
      charges: 0,
      files: 0,
      clients: 0,
      energyKWh: 0,
      revenue: 0,
      updatedAt
    },
    updatedAt,
    metadataOnly: true
  }, id);
}

function rechargeSummary() {
  const energy = allCharges.reduce((sum, charge) => sum + charge.energyKWh, 0);
  const revenue = allCharges.reduce((sum, charge) => sum + charge.revenue, 0);
  const dates = allCharges.map(charge => charge.startDate).filter(Boolean);
  const clients = new Set(allCharges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  return {
    workId: currentWorkId,
    workName: currentWorkName,
    charges: allCharges.length,
    files: loadedFiles.length,
    clients,
    monthlyClosings,
    financialSettings,
    stationAvailability,
    operationalPowerKw: workPowerById(currentWorkId),
    ubyOperationOverrides,
    ubyAreaAccounting: readUbyAreaAccounting(),
    energyKWh: energy,
    revenue,
    firstDate: dates.length ? new Date(Math.min(...dates)).toISOString() : '',
    lastDate: dates.length ? new Date(Math.max(...dates)).toISOString() : '',
    updatedAt: new Date().toISOString()
  };
}

function buildRechargeRecord() {
  // Fechamentos registram a auditoria do mês, mas não podem permanecer
  // divergentes depois que uma importação complementar corrige a base.
  reconcileMonthlyClosingsWithCharges();
  const updatedAt = new Date().toISOString();
  return {
    workId: currentWorkId,
    workName: currentWorkName,
    files: loadedFiles.map(file => ({
      fileKey: file.fileKey || fileSourceKey(file.month, file.name, file.station || ''),
      name: file.name,
      station: file.station || '',
      size: file.size || 0,
      lastModified: file.lastModified || 0,
      month: file.month || '',
      importMode: file.importMode || 'merge',
      importedAt: file.importedAt || updatedAt,
      rows: allCharges.filter(charge => (file.fileKey && charge._fileKey === file.fileKey) || (!file.fileKey && charge._file === file.name)).length
    })),
    charges: allCharges.map(serializeCharge),
    monthlyClosings,
    financialSettings,
    stationAvailability,
    operationalPowerKw: workPowerById(currentWorkId),
    ubyOperationOverrides,
    ubyAreaAccounting: readUbyAreaAccounting(),
    summary: rechargeSummary(),
    updatedAt
  };
}

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

function compactRechargeDb(db, preferredWorkId = '') {
  return Object.fromEntries(Object.entries(db || {}).map(([workId, record]) => {
    return [workId, workId === preferredWorkId ? compactRechargeRecord(record) : compactRechargeRecord(record)];
  }));
}

function saveLocalRechargeBase(record = null, options = {}) {
  const db = localRechargeDb();
  if (!allCharges.length && !loadedFiles.length && !record) {
    if (!options.allowDelete) return { mode: 'skipped-empty' };
    delete db[currentWorkId];
    writeJson(RECARGAS_LOCAL_KEY, db);
    delete allRechargeRecords[currentWorkId];
    syncGeneralRecordsFromLocal();
    return { mode: 'deleted' };
  }
  const fullRecord = record || buildRechargeRecord();
  window.UBY_RECHARGE_RUNTIME?.cacheSet?.(`work:${currentWorkId}`, fullRecord).catch(() => {});
  db[currentWorkId] = compactRechargeRecord(fullRecord);
  const fullSave = tryWriteJson(RECARGAS_LOCAL_KEY, compactRechargeDb(db, currentWorkId));
  if (!fullSave.ok) return { mode: 'none', error: fullSave.error };
  syncGeneralRecordsFromLocal();
  return { mode: 'indexeddb', size: fullSave.size };
}

// Financial edits must survive immediately, even when the user changes an
// obra or tab before the cloud synchronization finishes.
function saveLocalRechargeRecordFor(workId, record) {
  const targetWorkId = String(workId || record?.workId || currentWorkId || '');
  if (!targetWorkId || !record) return { mode: 'skipped-empty' };
  const fullRecord = { ...record, workId: targetWorkId };
  const db = localRechargeDb();
  window.UBY_RECHARGE_RUNTIME?.cacheSet?.(`work:${targetWorkId}`, fullRecord).catch(() => {});
  db[targetWorkId] = compactRechargeRecord(fullRecord);
  const fullSave = tryWriteJson(RECARGAS_LOCAL_KEY, compactRechargeDb(db, targetWorkId));
  if (!fullSave.ok) return { mode: 'none', error: fullSave.error };
  allRechargeRecords[targetWorkId] = hydratedRechargeRecord(fullRecord, targetWorkId);
  markRechargeRecordsDirty();
  return { mode: 'indexeddb', size: fullSave.size };
}

async function clearCloudRechargeBase() {
  if (!window.UBY_SUPABASE?.clearRechargeBase) return false;
  await window.UBY_SUPABASE.clearRechargeBase(currentWorkId);
  return true;
}

async function saveRechargeBase(options = {}) {
  if (currentStationReportName) {
    setStorageState(`Visualizacao filtrada por estacao: <strong>${currentStationReportName}</strong>. A base completa nao foi sobrescrita.`, true);
    return;
  }
  if (!allCharges.length && !loadedFiles.length) {
    if (!options.allowEmpty) {
      setStorageState(`Gravacao vazia bloqueada para <strong>${currentWorkName}</strong>. Use a exclusao confirmada para apagar uma base.`, true);
      return;
    }
    const emptyRecord = buildRechargeRecord();
    emptyRecord.mutationIntent = options.mutationIntent || 'explicit_empty_replace';
    emptyRecord.summary = {
      ...(emptyRecord.summary || {}),
      clearedAt: new Date().toISOString(),
      clearReason: emptyRecord.mutationIntent
    };
    emptyRecord.cloudSyncPending = true;
    saveLocalRechargeBase(emptyRecord);
    allRechargeRecords[currentWorkId] = hydratedRechargeRecord(emptyRecord, currentWorkId);
    markRechargeRecordsDirty();
    if (window.UBY_SUPABASE?.saveRechargeBase) {
      await window.UBY_SUPABASE.saveRechargeBase(currentWorkId, emptyRecord);
      emptyRecord.cloudSyncPending = false;
      emptyRecord.cloudSyncedAt = new Date().toISOString();
      saveLocalRechargeBase(emptyRecord);
      allRechargeRecords[currentWorkId] = hydratedRechargeRecord(emptyRecord, currentWorkId);
      markRechargeRecordsDirty();
    }
    return;
  }
  const record = buildRechargeRecord();
  record.partialDetails = false;
  record.mutationIntent = options.mutationIntent || 'save';
  record.cloudSyncPending = true;
  const localSave = saveLocalRechargeBase(record);
  allRechargeRecords[currentWorkId] = hydratedRechargeRecord(record, currentWorkId);
  markRechargeRecordsDirty();
  if (!record) return;
  if (!window.UBY_SUPABASE?.saveRechargeBase) {
    const localMode = localSave?.mode === 'compact' ? ' Cache local leve por limite do navegador.' : '';
    setStorageState(`Salvo neste navegador para <strong>${currentWorkName}</strong>. Banco ainda nao carregado.${localMode}`);
    return;
  }
  try {
    const result = await window.UBY_SUPABASE.saveRechargeBase(currentWorkId, record);
    record.cloudSyncPending = false;
    record.cloudSyncedAt = new Date().toISOString();
    fullRechargeWorkIds.add(String(currentWorkId));
    saveLocalRechargeBase(record);
    allRechargeRecords[currentWorkId] = hydratedRechargeRecord(record, currentWorkId);
    markRechargeRecordsDirty();
    const localMode = localSave?.mode === 'compact' ? ' Cache local leve por limite do navegador.' : '';
    setStorageState(`Banco atualizado para <strong>${currentWorkName}</strong>: ${result.files} arquivo(s), ${result.charges} recarga(s).${localMode}`);
  } catch (err) {
    const localMode = localSave?.mode === 'compact' ? ' Cache local leve por limite do navegador.' : '';
    setStorageState(`Salvo neste navegador para <strong>${currentWorkName}</strong>. Supabase pendente: ${err.message}.${localMode}`, true);
  }
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

function canonicalStationNameForWork(workId, stationName, fallbackName = '') {
  const raw = safeText(stationName || fallbackName).trim();
  const normalized = normalizeStationForCompare(raw);
  const work = workOptions().find(item => String(item.id) === String(workId));
  const workName = work?.nome || fallbackName || raw;
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
  const blockedTerms = RECHARGE_STATION_BLOCKLIST_BY_WORK[String(workId || '')] || [];
  if (!blockedTerms.length) return false;
  const stationText = normalizeStationForCompare(stationName);
  return blockedTerms.some(term => stationText.includes(normalizeStationForCompare(term)));
}

function stationLooksRelatedToWork(station, workName) {
  const stationText = normalizeStationForCompare(station);
  const workText = normalizeStationForCompare(workName);
  if (!stationText || !workText) return true;
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

function applyRechargeRecord(record, sourceLabel) {
  syncGeneralRecordsFromLocal();
  allCharges = dedupeChargesByUniqueKey((record?.charges || [])
    .map(hydrateCharge)
    .filter(charge => !stationBlockedForWork(currentWorkId, charge.station))
    .filter(charge => chargeBelongsToWork(charge, currentWorkId, currentWorkName)));
  monthlyClosings = record?.monthlyClosings || record?.summary?.monthlyClosings || {};
  // Corrige em memória snapshots antigos antes de qualquer indicador ser
  // renderizado. A persistência ocorre na próxima alteração salva da obra.
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
  if (!allCharges.length) {
    uploadZone.classList.remove('compact');
    updateChips();
    updateCorrectionButtons();
    document.getElementById('tabsBar').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    const targetName = currentStationReportName || currentWorkName;
    setStorageState(`Sem planilha salva para <strong>${targetName}</strong>. O Painel Geral continua disponivel.`);
    if (openingWorkReport) return;
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    showTab('uby');
    renderUbyOperation();
    return;
  }
  uploadZone.classList.add('compact');
  updateChips();
  updateCorrectionButtons();
  document.getElementById('tabsBar').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  if (!openingWorkReport) renderAll();
  const updated = record.updatedAt ? new Date(record.updatedAt).toLocaleString('pt-BR') : 'agora';
  const targetName = currentStationReportName || currentWorkName;
  const filterNote = currentStationReportName ? ' Visualizacao filtrada por estacao; a base completa permanece preservada.' : stationMismatchMessage();
  setStorageState(`Carregado de ${sourceLabel} para <strong>${targetName}</strong>: ${loadedFiles.length} arquivo(s), ${allCharges.length} recarga(s). Ultima atualizacao: ${updated}.${filterNote}`);
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

function initWorkSelector() {
  const selector = document.getElementById('workSelector');
  if (!selector) return;
  const sourceWorks = workOptions();
  const works = selectorWorksWithoutDuplicateStations(sourceWorks).sort(workSelectorOrder);
  if (!works.some(work => work.id === currentWorkId)) {
    const requestedWork = sourceWorks.find(work => String(work.id) === String(currentWorkId));
    const requestedStation = requestedWork && normalizeStationForCompare(workSelectorLabel(requestedWork));
    const retainedWork = requestedStation && works.find(work => normalizeStationForCompare(workSelectorLabel(work)) === requestedStation);
    currentWorkId = retainedWork?.id || works[0]?.id || 'rio';
  }
  selector.innerHTML = works.map(work => `<option value="${escapeAttr(work.id)}">${escapeHtml(workSelectorLabel(work))}</option>`).join('');
  selector.value = currentWorkId;
  currentWorkName = currentWork().nome || currentWorkId;
  syncOperationalPowerInputs(currentWorkId);
  selector.onchange = async () => {
    await flushPendingFinancialSettingsSave();
    currentStationReportName = '';
    currentWorkId = selector.value;
    localStorage.setItem('uby-recargas-current-work', currentWorkId);
    currentWorkName = currentWork().nome || currentWorkId;
    syncOperationalPowerInputs(currentWorkId);
    await loadRechargeBase(currentWorkId);
  };
}

function shouldOpenFullRechargeWork(workId, stationName = '') {
  const workName = workNameById(workId);
  const text = normalizeStationForCompare(`${workId || ''} ${stationName || ''} ${workName || ''}`);
  return String(workId) === 'malassise' || text.includes('robert koch') || text.includes('malassise');
}

async function openWorkReport(workId, target = 'mensal', stationName = '') {
  if (openWorkReportInFlight) return;
  openWorkReportInFlight = true;
  overviewRenderSequence.uby += 1;
  overviewRenderSequence.geral += 1;
  clearTimeout(overviewInsightsTimers.uby);
  clearTimeout(overviewInsightsTimers.geral);
  const selector = document.getElementById('workSelector');
  try {
    await flushPendingFinancialSettingsSave();
    currentWorkId = String(workId || currentWorkId);
    currentStationReportName = shouldOpenFullRechargeWork(currentWorkId, stationName) ? '' : safeText(stationName).trim();
    localStorage.setItem('uby-recargas-current-work', currentWorkId);
    if (selector) selector.value = currentWorkId;
    currentWorkName = currentWork().nome || currentWorkId;
    syncOperationalPowerInputs(currentWorkId);

    document.getElementById('tabsBar').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('workReportTabs').style.display = 'flex';
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.report-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${target}'`)));
    showTab(target);
    window.scrollTo({ top: 0, behavior: 'auto' });
    await yieldToBrowser();

    openingWorkReport = true;
    // A tela geral usa apenas o mes atual. Antes de abrir uma estacao, carregue
    // a base integral para impedir que um recorte parcial substitua o historico.
    await loadRechargeBase(currentWorkId);
    openingWorkReport = false;

    updateCorrectionButtons();
    if (!allCharges.length) {
      uploadZone.classList.remove('compact');
      updateChips();
      setStorageState(`Sem planilha salva para <strong>${currentWorkName}</strong>. Escolha o mes e carregue a planilha desta estacao.`);
    }
    if (target === 'mensal') await renderMensal();
    else if (target === 'acumulado') renderAcumulado();
    else if (target === 'detalhes') renderDetalhes();
    else if (target === 'financeiro') await handleFinanceMonthChange();
  } finally {
    openingWorkReport = false;
    openWorkReportInFlight = false;
  }
}

// ── Prevenção de drop fora da zona ────────────────────────
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop',     e => e.preventDefault());

// ── Upload zone ───────────────────────────────────────────
// Não existe na página financeira dedicada (financeiro.html, sem a parte
// operacional) — sem essa guarda, addEventListener em null travava a
// execução do restante do script inteiro, inclusive a inicialização
// automática da página (initializeRechargePage nunca rodava sozinha).
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');

if (uploadZone && fileInput) {
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault(); e.stopPropagation();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', e => {
    if (!uploadZone.contains(e.relatedTarget)) uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    uploadZone.classList.remove('dragover');
    handleFiles(Array.from(e.dataTransfer.files));
  });
  fileInput.addEventListener('change', e => {
    handleFiles(Array.from(e.target.files));
    fileInput.value = '';
  });
}

async function ensureCurrentWorkBaseReadyForImport() {
  const targetWorkId = String(currentWorkId || '');
  setFeedback('Carregando o historico completo antes de importar...', 'up-loading');
  const record = await loadRechargeBase(targetWorkId, { requireCloud: true });
  if (String(currentWorkId || '') !== targetWorkId) {
    throw new Error('A obra selecionada mudou durante a leitura. Selecione novamente o arquivo.');
  }
  const fullRecord = allRechargeRecords[targetWorkId] || record;
  if (!recordHasFullRechargeDetails(fullRecord) || !fullRechargeWorkIds.has(targetWorkId)) {
    throw new Error('Nao foi possivel confirmar a base integral. A importacao foi bloqueada para preservar o acumulado.');
  }
  applyRechargeRecord(fullRecord, 'Supabase');
  return fullRecord;
}

async function handleFiles(files) {
  currentStationReportName = '';
  const selectedMonth = document.getElementById('importMonth')?.value || '';
  const importMode = document.getElementById('importMode')?.value || 'merge';
  if (!selectedMonth) {
    setFeedback('Escolha o mes da planilha antes de subir o arquivo.', 'up-error');
    return;
  }
  const acceptedFiles = Array.from(files || [])
    .filter(f => f?.name && /\.(xlsx|xls|csv)$/i.test(String(f.name)));
  if (!acceptedFiles.length) {
    setFeedback('Arquivo nao reconhecido. Envie .xlsx, .xls ou .csv exportado da plataforma.', 'up-error');
    return;
  }
  try {
    await ensureCurrentWorkBaseReadyForImport();
  } catch (err) {
    setFeedback('Importacao bloqueada: ' + err.message, 'up-error');
    return;
  }
  acceptedFiles.forEach(f => {
    f.month = selectedMonth;
    f.importMode = importMode;
    loadedFiles.push(f);
    queuedRechargeImports += 1;
    rechargeImportQueue = rechargeImportQueue
      .then(() => readFile(f))
      .finally(() => {
        queuedRechargeImports = Math.max(0, queuedRechargeImports - 1);
      });
  });
}

async function removeFile(fileKey, name = '') {
  const legacyName = name || fileKey;
  const removeByKey = Boolean(name);
  loadedFiles = loadedFiles.filter(f => {
    const key = f?.fileKey || fileSourceKey(f?.month, f?.name, f?.station || '');
    return removeByKey ? key !== fileKey : f?.name !== legacyName;
  });
  allCharges = allCharges.filter(c => {
    return removeByKey ? c._fileKey !== fileKey : c._file !== legacyName;
  });
  updateChips();
  if (!allCharges.length) {
    uploadZone.classList.remove('compact');
    document.getElementById('tabsBar').style.display    = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    updateCorrectionButtons();
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    showTab('uby');
    renderUbyOperation();
  } else {
    renderAll();
    updateCorrectionButtons();
  }
  await saveRechargeBase({ allowEmpty: true, mutationIntent: 'remove_file' });
}

function updateCorrectionButtons() {
  const hasData = allCharges.length || loadedFiles.length;
  const undo = readJson(RECARGAS_IMPORT_UNDO_KEY, null);
  const undoBtn = document.getElementById('undoLastImportBtn');
  const monthBtn = document.getElementById('clearSelectedMonthBtn');
  const baseBtn = document.getElementById('clearRechargeBaseBtn');
  if (undoBtn) undoBtn.style.display = undo?.workId === currentWorkId ? 'inline-flex' : 'none';
  if (monthBtn) monthBtn.style.display = hasData ? 'inline-flex' : 'none';
  if (baseBtn) baseBtn.style.display = hasData ? 'inline-flex' : 'none';
}

function storeImportUndo(label = 'última importação') {
  tryWriteJson(RECARGAS_IMPORT_UNDO_KEY, {
    workId: currentWorkId,
    workName: currentWorkName,
    label,
    createdAt: new Date().toISOString(),
    record: buildRechargeRecord()
  });
  updateCorrectionButtons();
}

function pruneLoadedFilesWithoutCharges() {
  loadedFiles = loadedFiles.filter(fileItem => {
    const fileMonth = fileItem?.month || '';
    const fileKey = fileItem?.fileKey || fileSourceKey(fileMonth, fileItem?.name, fileItem?.station || '');
    return allCharges.some(charge =>
      ((charge._fileKey && charge._fileKey === fileKey) || (!charge._fileKey && charge._file === fileItem?.name)) && (!fileMonth || chargeMonthKey(charge) === fileMonth)
    );
  });
}

async function persistCorrection(message) {
  pruneLoadedFilesWithoutCharges();
  updateChips();
  if (!allCharges.length) {
    uploadZone.classList.remove('compact');
    document.getElementById('tabsBar').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    showTab('uby');
    renderUbyOperation();
  } else {
    uploadZone.classList.add('compact');
    renderAll();
  }
  updateCorrectionButtons();
  setStorageState(`${message} Salvando no banco...`);
  await saveRechargeBase({ allowEmpty: true, mutationIntent: 'month_correction' });
}

async function undoLastImport() {
  const undo = readJson(RECARGAS_IMPORT_UNDO_KEY, null);
  if (!undo || undo.workId !== currentWorkId) {
    alert('Não há importação recente para desfazer nesta obra.');
    return;
  }
  const when = undo.createdAt ? new Date(undo.createdAt).toLocaleString('pt-BR') : 'agora';
  if (!confirm(`Desfazer a última importação de ${currentWorkName}? O estado voltará para antes de ${when}.`)) return;
  localStorage.removeItem(RECARGAS_IMPORT_UNDO_KEY);
  applyRechargeRecord(undo.record, 'restauração');
  updateCorrectionButtons();
  setStorageState(`Última importação desfeita para <strong>${currentWorkName}</strong>. Salvando no banco...`);
  await saveRechargeBase({ allowEmpty: true, mutationIntent: 'undo_import' });
}

async function clearSelectedMonth() {
  const mk = document.getElementById('monthSelector')?.value || document.getElementById('importMonth')?.value || '';
  if (!mk) {
    alert('Escolha o mês que deseja excluir.');
    return;
  }
  const monthCharges = chargesForMonth(mk);
  if (!monthCharges.length) {
    alert(`Não há recargas salvas em ${monthLabel(mk)} para esta obra.`);
    return;
  }
  if (!confirm(`Excluir somente ${monthLabel(mk)} de ${currentWorkName}? Serão removidas ${monthCharges.length} recarga(s), mantendo os outros meses.`)) return;
  storeImportUndo(`exclusão de ${monthLabel(mk)}`);
  allCharges = allCharges.filter(charge => chargeMonthKey(charge) !== mk);
  monthlyClosings = { ...monthlyClosings };
  delete monthlyClosings[mk];
  await persistCorrection(`Mês ${monthLabel(mk)} excluído de <strong>${currentWorkName}</strong>.`);
}

async function clearRechargeBase() {
  if (!confirm(`Excluir a base de recargas salva para ${currentWorkName}?`)) return;
  storeImportUndo('exclusão da base completa');
  allCharges = [];
  loadedFiles = [];
  monthlyClosings = {};
  financialSettings = {};
  ubyOperationOverrides = {};
  saveLocalRechargeBase(null, { allowDelete: true });
  try {
    await clearCloudRechargeBase();
    setStorageState(`Base de recargas excluida para <strong>${currentWorkName}</strong>.`);
  } catch (err) {
    setStorageState(`Base excluida neste navegador. Supabase pendente: ${err.message}`, true);
  }
  uploadZone.classList.remove('compact');
  document.getElementById('tabsBar').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('clearRechargeBaseBtn').style.display = 'none';
  updateChips();
  updateCorrectionButtons();
  renderGeral();
  renderUbyOperation();
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  showTab('uby');
}

function updateChips() {
  const persistedFiles = loadedFiles.filter(f => f?.name);
  const knownKeys = new Set(persistedFiles.map(f => f.fileKey || fileSourceKey(f.month, f.name, f.station || '')));
  const derivedFiles = new Map();
  allCharges.forEach(charge => {
    if (!charge?._file) return;
    const month = chargeMonthKey(charge) === 'unknown' ? '' : chargeMonthKey(charge);
    const key = charge._fileKey || fileSourceKey(month, charge._file, charge._sourceStation || charge.station || '');
    const current = derivedFiles.get(key) || {
      fileKey: key,
      name: charge._file,
      month,
      station: '',
      stations: new Set(),
      sourcePlatform: charge.sourcePlatform || '',
      derived: true,
      charges: 0
    };
    const station = safeText(charge.rawStation || charge.station || '').trim();
    if (station) current.stations.add(station);
    current.station = [...current.stations].join(' + ');
    current.charges += 1;
    derivedFiles.set(key, current);
  });
  const derivedFileValues = [...derivedFiles.values()].map(({ stations, ...file }) => file);
  const derivedByKey = new Map(derivedFileValues.map(file => [file.fileKey, file]));
  loadedFiles = [
    ...persistedFiles.map(file => {
      const key = file.fileKey || fileSourceKey(file.month, file.name, file.station || '');
      const derived = derivedByKey.get(key);
      return derived ? { ...file, station: derived.station || file.station, charges: derived.charges } : file;
    }),
    ...derivedFileValues.filter(file => !knownKeys.has(file.fileKey))
  ];
  document.getElementById('fileChips').innerHTML = loadedFiles.map(f => {
    const name = safeText(f.name);
    const nameHtml = escapeHtml(name);
    const fileKey = f.fileKey || fileSourceKey(f.month, f.name, f.station || '');
    const month = f.month ? ` · ${monthLabel(f.month)}` : '';
    const station = f.station ? ` · ${safeText(f.station)}` : '';
    const stationHtml = station ? escapeHtml(station) : '';
    const count = Number(f.charges || 0) ? ` · ${Number(f.charges)} recarga(s)` : '';
    return `<div class="file-chip" title="${escapeAttr(`${name}${station}${month}${count}`)}">📄 ${nameHtml}<span>${stationHtml}${month}${count}</span>
       <button class="file-chip-remove"
         onclick="event.preventDefault();removeFile('${escapeAttr(fileKey)}','${escapeAttr(name)}')">×</button>
     </div>`;
  }).join('');
}

function setFeedback(msg, cls) {
  const el = document.getElementById('uploadFeedback');
  el.className = 'upload-feedback ' + (cls || '');
  el.textContent = msg;
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

function findColumnIndex(headers = [], names = [], fallbackIndex = -1) {
  const wanted = names.map(normalizeHeaderName);
  const found = headers.findIndex(header => wanted.includes(normalizeHeaderName(header)));
  return found >= 0 ? found : fallbackIndex;
}

function readCell(row = [], index = -1) {
  return index >= 0 ? row[index] : '';
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
  if (startMinute) {
    return [
      'session',
      workId || normalizeHeaderName(station),
      normalizeHeaderName(station),
      startMinute,
      person
    ].join('|');
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

function dateToInputText(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function splitDateRange(value, fallbackEnd = '') {
  if (value instanceof Date) return [dateToInputText(value), fallbackEnd instanceof Date ? dateToInputText(fallbackEnd) : String(fallbackEnd || '')];
  if (typeof value === 'number') return [dateToInputText(excelSerialToDate(value)), fallbackEnd instanceof Date ? dateToInputText(fallbackEnd) : String(fallbackEnd || '')];
  const raw = String(value || '').trim();
  const parts = raw.split(/\s+(?:-|–|—)\s+/);
  if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join(' - ').trim()];
  return [raw, fallbackEnd instanceof Date ? dateToInputText(fallbackEnd) : String(fallbackEnd || '')];
}

function hasHeader(headers = [], names = []) {
  const normalized = headers.map(normalizeHeaderName);
  return names.some(name => normalized.includes(normalizeHeaderName(name)));
}

function rechargeSheetRows(workbook) {
  const preferred = workbook.Sheets['Recargas'];
  const sheetName = preferred ? 'Recargas' : workbook.SheetNames[0];
  const ws = preferred || workbook.Sheets[sheetName];
  if (!ws) throw new Error('Nenhuma aba encontrada no arquivo.');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (rows.length < 2) throw new Error('Planilha sem dados de recargas.');
  return { rows, sheetName };
}

function detectRechargeLayout(rows = []) {
  const scanRows = rows.slice(0, 12);
  for (let rowIndex = 0; rowIndex < scanRows.length; rowIndex++) {
    const headers = scanRows[rowIndex] || [];
    if (
      hasHeader(headers, ['Aplicativo']) &&
      hasHeader(headers, ['Motorista']) &&
      hasHeader(headers, ['E-mail do motorista']) &&
      hasHeader(headers, ['Início da Transação', 'Inicio da Transacao'])
    ) {
      return {
        type: 'spott',
        platform: 'Spott',
        headerRow: rowIndex,
        allowMultiMonth: false,
        cols: {
          date: findColumnIndex(headers, ['Data']),
          station: findColumnIndex(headers, ['Local']),
          company: findColumnIndex(headers, ['Empresa']),
          app: findColumnIndex(headers, ['Aplicativo']),
          driver: findColumnIndex(headers, ['Motorista']),
          email: findColumnIndex(headers, ['E-mail do motorista', 'Email do motorista', 'E-mail']),
          charger: findColumnIndex(headers, ['Carregador']),
          energy: findColumnIndex(headers, ['Energia']),
          totalValue: findColumnIndex(headers, ['Valor']),
          vehicle: findColumnIndex(headers, ['Veículo', 'Veiculo']),
          startLocal: findColumnIndex(headers, ['Início da Transação', 'Inicio da Transacao']),
          endCharge: findColumnIndex(headers, ['Fim do Carregamento']),
          endLocal: findColumnIndex(headers, ['Fim da Transação', 'Fim da Transacao']),
          voucher: findColumnIndex(headers, ['Cupom']),
          sponsor: findColumnIndex(headers, ['Patrocinador']),
          duration: findColumnIndex(headers, ['Duração', 'Duracao']),
          status: findColumnIndex(headers, ['Recargas', 'Status']),
          phone: findColumnIndex(headers, ['Telefone', 'Celular', 'Telefone celular', 'Phone', 'Mobile', 'WhatsApp', 'Whatsapp'])
        }
      };
    }
    if (
      hasHeader(headers, ['E-mail']) &&
      hasHeader(headers, ['Estacao', 'Estação']) &&
      hasHeader(headers, ['ID da Transacao', 'ID da Transação']) &&
      hasHeader(headers, ['Energia em kWh']) &&
      hasHeader(headers, ['Inicio (Horario Local)', 'Início (Horário Local)'])
    ) {
      return {
        type: 'gogrid',
        platform: 'Go Grid',
        headerRow: rowIndex,
        allowMultiMonth: true,
        cols: {
          email: findColumnIndex(headers, ['E-mail']),
          station: findColumnIndex(headers, ['Estacao', 'Estação']),
          plug: findColumnIndex(headers, ['Plug']),
          transactionId: findColumnIndex(headers, ['ID da Transacao', 'ID da Transação']),
          energy: findColumnIndex(headers, ['Energia em kWh']),
          totalValue: findColumnIndex(headers, ['Valor Total']),
          energyValue: findColumnIndex(headers, ['Valor da Energia']),
          paymentType: findColumnIndex(headers, ['Forma de Pagamento']),
          phone: findColumnIndex(headers, ['Telefone', 'Celular', 'Telefone celular', 'Phone', 'Mobile', 'WhatsApp', 'Whatsapp']),
          startLocal: findColumnIndex(headers, ['Inicio (Horario Local)', 'Início (Horário Local)']),
          endLocal: findColumnIndex(headers, ['Fim (Horario Local)', 'Fim (Horário Local)']),
          duration: findColumnIndex(headers, ['Duracao', 'Duração']),
          couponValue: findColumnIndex(headers, ['Valor do Cupom']),
          couponBenefit: findColumnIndex(headers, ['Beneficio do Cupom', 'Benefício do Cupom']),
          idleValue: findColumnIndex(headers, ['Taxa de Ociosidade']),
          socInitial: findColumnIndex(headers, ['SoC inicial']),
          socFinal: findColumnIndex(headers, ['SoC final']),
          vehicleBrand: findColumnIndex(headers, ['Marca', 'Marca do Veiculo', 'Marca do Veículo', 'Fabricante']),
          vehicleModel: findColumnIndex(headers, ['Modelo', 'Modelo do Veiculo', 'Modelo do Veículo', 'Veiculo', 'Veículo']),
          status: findColumnIndex(headers, ['Status', 'Status da Recarga', 'Status da Carga']),
          failureReason: findColumnIndex(headers, ['Motivo', 'Motivo da Falha', 'Erro', 'Falha'])
        }
      };
    }
  }
  const headers = rows[0] || [];
  return {
    type: 'uby',
    platform: 'Padrao UBY',
    headerRow: 0,
    allowMultiMonth: false,
    cols: {
      voucher: findColumnIndex(headers, ['Voucher utilizado', 'Voucher'], 26),
      phone: findColumnIndex(headers, ['Telefone', 'Celular', 'Telefone celular', 'Phone', 'Mobile', 'WhatsApp', 'Whatsapp']),
      rating: findColumnIndex(headers, ['AvaliaÃ§Ã£o', 'Avaliacao'], 27),
      reviewComment: findColumnIndex(headers, ['ComentÃ¡rio', 'Comentario', 'ComentÃ¡rios', 'Comentarios', 'ComentÃ¡rio da avaliaÃ§Ã£o', 'Comentario da avaliacao'], -1),
      vehicleBrand: findColumnIndex(headers, ['Marca', 'Marca do Veiculo', 'Marca do Veículo', 'Fabricante']),
      vehicleModel: findColumnIndex(headers, ['Modelo', 'Modelo do Veiculo', 'Modelo do Veículo', 'Veiculo', 'Veículo']),
      status: findColumnIndex(headers, ['Status', 'Status da Recarga', 'Status da Carga']),
      failureReason: findColumnIndex(headers, ['Motivo', 'Motivo da Falha', 'Erro', 'Falha'])
    }
  };
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

function rowCellText(row = [], index = -1) {
  return String(readCell(row, index) || '').trim();
}

function couponLabelFromGoGrid(row = [], cols = {}) {
  const benefit = rowCellText(row, cols.couponBenefit);
  const value = parseNumber(readCell(row, cols.couponValue));
  if (benefit && benefit !== '---') return benefit;
  return value > 0 ? 'Cupom' : '';
}

function normalizeGoGridStation(value = '') {
  const raw = String(value || '').replace(/\s+-\s+/g, ' | ').replace(/\s+/g, ' ').trim();
  if (normalizeHeaderName(raw).includes('postopratacambe')) return 'Go Grid | Posto Prata Cambe (DC)';
  return raw;
}

function parseRechargeRow(row = [], layout = {}, file = {}) {
  if (layout.type === 'spott') {
    const cols = layout.cols || {};
    const email = rowCellText(row, cols.email);
    const driver = rowCellText(row, cols.driver);
    const rawStation = rowCellText(row, cols.station);
    const station = canonicalStationNameForWork(currentWorkId, rawStation, currentWorkName);
    const charger = rowCellText(row, cols.charger);
    const startStr = rowCellText(row, cols.startLocal);
    const endStr = rowCellText(row, cols.endLocal) || rowCellText(row, cols.endCharge);
    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);
    const energy = parseNumber(readCell(row, cols.energy));
    const revenue = parseNumber(readCell(row, cols.totalValue));
    const vehicle = rowCellText(row, cols.vehicle);
    if (!station && !driver && !email && !startStr && !energy && !revenue) return null;
    const vehicleParts = vehicle.split(/\s+/).filter(Boolean);
    return {
      workId:        currentWorkId,
      workName:      currentWorkName,
      _file:         file.name,
      sourcePlatform:'Spott',
      id:            [station, charger, email || driver, startStr].filter(Boolean).join('|'),
      station,
      rawStation,
      connType:      charger,
      userName:      driver || (email ? email.split('@')[0] : ''),
      userEmail:     email,
      userPhone:     rowCellText(row, cols.phone),
      startStr,
      endStr,
      startDate,
      endDate,
      duration:      rowCellText(row, cols.duration),
      energyKWh:     energy,
      revenue,
      paymentType:   rowCellText(row, cols.app),
      paymentStatus: rowCellText(row, cols.status),
      idleTime:      '',
      idleValue:     0,
      voucher:       normalizedCouponLabel(rowCellText(row, cols.voucher), { revenue }),
      rating:        '',
      reviewComment: '',
      vehicleBrand:  vehicleParts[0] || '',
      vehicleModel:  vehicleParts.slice(1).join(' '),
      failureReason: '',
      rawStatus:     rowCellText(row, cols.status)
    };
  }

  if (layout.type === 'gogrid') {
    const cols = layout.cols || {};
    const id = rowCellText(row, cols.transactionId);
    const email = rowCellText(row, cols.email);
    const station = normalizeGoGridStation(rowCellText(row, cols.station));
    const startStr = rowCellText(row, cols.startLocal);
    const endStr = rowCellText(row, cols.endLocal);
    const paymentType = rowCellText(row, cols.paymentType);
    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);
    const energy = parseNumber(readCell(row, cols.energy));
    const revenue = parseNumber(readCell(row, cols.totalValue) || readCell(row, cols.energyValue));
    if (!id && !station && !email && !startStr && !energy && !revenue) return null;
    return {
      workId:        currentWorkId,
      workName:      currentWorkName,
      _file:         file.name,
      sourcePlatform:'Go Grid',
      id,
      station,
      connType:      rowCellText(row, cols.plug) ? `Plug ${rowCellText(row, cols.plug)}` : '',
      userName:      email ? email.split('@')[0] : '',
      userEmail:     email,
      userPhone:     rowCellText(row, cols.phone),
      startStr,
      endStr,
      startDate,
      endDate,
      duration:      rowCellText(row, cols.duration),
      energyKWh:     energy,
      revenue,
      paymentType,
      paymentStatus: /andamento/i.test(paymentType) ? 'Carga em andamento' : (paymentType ? 'Pago' : ''),
      idleTime:      '',
      idleValue:     parseNumber(readCell(row, cols.idleValue)),
      voucher:       normalizedCouponLabel(couponLabelFromGoGrid(row, cols), { revenue }),
      rating:        '',
      reviewComment: '',
      socInitial:    rowCellText(row, cols.socInitial),
      socFinal:      rowCellText(row, cols.socFinal),
      vehicleBrand:  rowCellText(row, cols.vehicleBrand),
      vehicleModel:  rowCellText(row, cols.vehicleModel),
      failureReason: rowCellText(row, cols.failureReason),
      rawStatus:     rowCellText(row, cols.status)
    };
  }

  const cols = layout.cols || {};
  const [startStr, endStr] = splitDateRange(row[12], row[13]);
  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr);
  return {
    workId:        currentWorkId,
    workName:      currentWorkName,
    _file:         file.name,
    id:            row[0],
    station:       String(row[1] || '').trim(),
    connType:      String(row[3] || '').trim(),
    userName:      String(row[4] || '').trim(),
    userEmail:     String(row[5] || '').trim(),
    userPhone:     String(readCell(row, cols.phone) || '').trim(),
    startStr, endStr,
    startDate,
    endDate,
    duration:      String(row[13] || ''),
    energyKWh:     parseNumber(row[14]),
    revenue:       parseNumber(row[18]),
    paymentType:   String(row[20] || '').trim(),
    paymentStatus: String(row[21] || '').trim(),
    idleTime:      String(row[24] || ''),
    idleValue:     parseNumber(row[25]),
    voucher:       normalizedCouponLabel(readCell(row, cols.voucher), { revenue: parseNumber(row[18]) }),
    rating:        String(readCell(row, cols.rating) || '').trim(),
    reviewComment: String(readCell(row, cols.reviewComment) || '').trim(),
    vehicleBrand:  String(readCell(row, cols.vehicleBrand) || '').trim(),
    vehicleModel:  String(readCell(row, cols.vehicleModel) || '').trim(),
    failureReason: String(readCell(row, cols.failureReason) || '').trim(),
    rawStatus:     String(readCell(row, cols.status) || '').trim()
  };
}

function rechargeImportStationProfile(charges = []) {
  const profile = new Map();
  charges.forEach(charge => {
    const station = safeText(charge.rawStation || charge.station || '').trim() || '(estacao nao informada)';
    const current = profile.get(station) || { station, charges: 0, energy: 0, revenue: 0 };
    current.charges += 1;
    current.energy += Number(charge.energyKWh || 0);
    current.revenue += Number(charge.revenue || 0);
    profile.set(station, current);
  });
  return [...profile.values()].sort((a, b) => b.charges - a.charges);
}

function confirmRechargeStationMismatch(charges = [], layout = {}, file = {}) {
  const profile = rechargeImportStationProfile(charges);
  const mismatches = profile.filter(item =>
    stationBlockedForWork(currentWorkId, item.station) || !stationLooksRelatedToWork(item.station, currentWorkName)
  );
  if (!mismatches.length) return true;
  const details = profile.map(item =>
    `- ${item.station}: ${item.charges} recarga(s), ${fmtKWh(item.energy)}, ${fmtBRL(item.revenue)}`
  ).join('\n');
  return window.confirm(
    `ATENCAO: a planilha nao corresponde integralmente ao destino selecionado.\n\n` +
    `Arquivo: ${file.name || '-'}\nPlataforma: ${layout.platform || '-'}\nDestino: ${currentWorkName}\n\n` +
    `Conteudo identificado:\n${details}\n\n` +
    `Fora do padrao: ${mismatches.map(item => item.station).join(', ')}\n\n` +
    `Deseja confirmar a importacao mesmo assim? Os dados destacados serao anexados a ${currentWorkName}.`
  );
}

async function readFile(file) {
  const queueNote = queuedRechargeImports > 1 ? ` (${queuedRechargeImports} arquivos na fila)` : '';
  setFeedback(`⏳ Lendo planilha${queueNote}...`, 'up-loading');
  const isCsvFile = /\.csv$/i.test(String(file?.name || ''));
  try {
      const buffer = await file.arrayBuffer();
      const rows = await rechargeRowsFromFileBuffer(buffer, isCsvFile);
      if (rows.length < 2) throw new Error('Planilha sem dados de recargas.');

      const layout = detectRechargeLayout(rows);
      const headers = rows[0] || [];
      const voucherCol = findColumnIndex(headers, ['Voucher utilizado', 'Voucher'], 26);
      const ratingCol = findColumnIndex(headers, ['Avaliação', 'Avaliacao'], 27);
      const reviewCommentCol = findColumnIndex(headers, ['Comentário', 'Comentario', 'Comentários', 'Comentarios', 'Comentário da avaliação', 'Comentario da avaliacao'], -1);
      const selectedMonth = file.month || document.getElementById('importMonth')?.value || '';
      const importedCharges = [];
      if (layout.type === 'gogrid' || layout.type === 'spott') {
        for (let i = layout.headerRow + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !rowHasData(r)) continue;
          const charge = parseRechargeRow(r, layout, file);
          if (charge) importedCharges.push(charge);
          if (i % 250 === 0) await yieldToBrowser();
        }
      } else {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[0] == null) continue;
        const charge = parseRechargeRow(r, layout, file);
        if (charge) importedCharges.push(charge);
        if (i % 250 === 0) await yieldToBrowser();
      }
      }
      if (!importedCharges.length) throw new Error('Planilha sem linhas validas de recargas.');
      const importControlIssues = importedCharges.filter(rechargeControlIssue);

      const dateMonths = [...new Set(importedCharges.map(charge => monthKey(charge.startDate)).filter(k => k && k !== 'unknown'))];
      const wrongMonths = dateMonths.filter(k => k !== selectedMonth);
      if (selectedMonth && wrongMonths.length && !layout.allowMultiMonth) {
        throw new Error(`O mes escolhido foi ${monthLabel(selectedMonth)}, mas a planilha tem recargas de ${dateMonths.map(monthLabel).join(', ')}. Escolha o mes correto antes de subir.`);
      }

      const importMode = file.importMode || document.getElementById('importMode')?.value || 'merge';
      const sourceStation = rechargeImportStationProfile(importedCharges).map(item => item.station).join(' + ');
      if (!confirmRechargeStationMismatch(importedCharges, layout, file)) {
        throw new Error('Importacao cancelada: a estacao da planilha nao corresponde ao destino selecionado.');
      }
      const sourceKey = fileSourceKey(selectedMonth, file.name, sourceStation);
      storeImportUndo(`${file.name} em ${monthLabel(selectedMonth)}`);
      file.fileKey = sourceKey;
      file.station = sourceStation;
      const fileMonth = dateMonths.length === 1 ? (dateMonths[0] || selectedMonth) : '';
      importedCharges.forEach(charge => {
        charge._month = layout.allowMultiMonth ? monthKey(charge.startDate) : (selectedMonth || monthKey(charge.startDate));
        charge._fileKey = sourceKey;
        charge._sourceStation = sourceStation;
      });
      const importedMonths = new Set(importedCharges.map(chargeMonthKey).filter(Boolean));
      let replacedCount = 0;
      let duplicateCount = 0;
      if (importMode === 'replace') {
        replacedCount = allCharges.filter(charge => importedMonths.has(chargeMonthKey(charge))).length;
        allCharges = allCharges.filter(charge => !importedMonths.has(chargeMonthKey(charge)));
      } else {
        const importedKeys = new Set(importedCharges.map(rechargeUniqueKey));
        const before = allCharges.length;
        allCharges = allCharges.filter(charge => {
          const sameImportedMonth = importedMonths.has(chargeMonthKey(charge));
          const sameFileMonth = sameImportedMonth && ((charge._fileKey && charge._fileKey === sourceKey) || (!charge._fileKey && charge._file === file.name));
          const duplicateCharge = sameImportedMonth && importedKeys.has(rechargeUniqueKey(charge));
          return !sameFileMonth && !duplicateCharge;
        });
        duplicateCount = before - allCharges.length;
      }
      allCharges = dedupeChargesByUniqueKey([...allCharges, ...importedCharges]);
      importedMonths.forEach(mk => {
        if (monthlyClosings?.[mk]?.source === 'manual') return;
        const closing = buildMonthClosing(mk);
        if (closing) monthlyClosings = { ...monthlyClosings, [mk]: closing };
      });
      loadedFiles = loadedFiles.filter(fileItem => {
        const fileMonth = fileItem?.month || '';
        const fileKey = fileItem?.fileKey || fileSourceKey(fileMonth, fileItem?.name, fileItem?.station || '');
        const isCurrentFile = fileKey === sourceKey;
        const stillHasCharges = allCharges.some(charge =>
          ((charge._fileKey && charge._fileKey === fileKey) || (!charge._fileKey && charge._file === fileItem?.name)) && (!fileMonth || chargeMonthKey(charge) === fileMonth)
        );
        return isCurrentFile || stillHasCharges;
      });

      setFeedback('', '');
      uploadZone.classList.add('compact');
      loadedFiles = loadedFiles.map(item => item === file || (item.fileKey && item.fileKey === sourceKey) ? { ...item, fileKey: sourceKey, station: sourceStation, month: fileMonth, importMode, importedAt: new Date().toISOString(), sourcePlatform: layout.platform } : item);
      updateChips();
      document.getElementById('tabsBar').style.display    = 'flex';
      document.getElementById('emptyState').style.display = 'none';
      updateCorrectionButtons();
      const controlNote = importControlIssues.length
        ? ` <strong>${importControlIssues.length} sessão(ões) próxima(s) de zero foi(ram) sinalizada(s) para conferência.</strong>`
        : '';
      setStorageState(`Planilha importada para <strong>${currentWorkName}</strong>: ${importedCharges.length} recarga(s), ${fmtKWh(importedCharges.reduce((s,c)=>s+c.energyKWh,0))}, ${fmtBRL(importedCharges.reduce((s,c)=>s+c.revenue,0))}. Salvando no banco...${controlNote}`);
      await yieldToBrowser();
      await saveRechargeBase();
      await renderAll();
      if (importControlIssues.length) {
        setFeedback(`${importControlIssues.length} sessão(ões) com até 0,25 kWh e R$ 1,00 foram sinalizadas como possível falha. Confira Análise operacional.`, 'up-error');
      } else if (replacedCount > 0) {
        setFeedback(`${replacedCount} recarga(s) do mês foram substituidas.`, 'up-loading');
      } else if (duplicateCount > 0) {
        setFeedback(`${duplicateCount} recarga(s) duplicada(s) foram atualizadas. As demais foram consolidadas no mês.`, 'up-loading');
      }

  } catch (err) {
      setFeedback('❌ ' + err.message, 'up-error');
      loadedFiles = loadedFiles.filter(f => f !== file);
      updateChips();
  }
}

// ── Helpers de data / tempo ────────────────────────────────
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
function fmtBRL(v) {
  return 'R$ ' + (+v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtKWh(v) { return (+v).toFixed(2).replace('.', ',') + ' kWh'; }
function fmtPct(v)  { return (+v).toFixed(2).replace('.', ',') + '%'; }
function fmtChartMoneyTick(v) {
  const amount = Number(v) || 0;
  return amount >= 1000
    ? `R$ ${(amount / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : fmtBRL(amount);
}
function fmtChartEnergyTick(v) {
  return `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kWh`;
}

function renderMonthlyRevenueEnergyChart(canvasId, monthData, revenueLabel, energyLabel) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: monthData.map(item => item.label),
      datasets: [
        {
          type: 'bar', label: revenueLabel, data: monthData.map(item => +item.revenue.toFixed(2)),
          yAxisID: 'yRevenue', backgroundColor: 'rgba(87,183,255,.34)', borderColor: '#57B7FF',
          borderWidth: 1.5, borderRadius: 6, maxBarThickness: 58, order: 2
        },
        {
          type: 'line', label: energyLabel, data: monthData.map(item => +item.energy.toFixed(2)),
          yAxisID: 'yEnergy', borderColor: '#2DBBD3', backgroundColor: '#2DBBD3',
          borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#0B1524',
          pointBorderWidth: 2, tension: .28, fill: false, order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#B7C7C0', usePointStyle: true, padding: 18 } },
        tooltip: {
          callbacks: {
            label: context => context.dataset.yAxisID === 'yRevenue'
              ? `${context.dataset.label}: ${fmtBRL(context.parsed.y)}`
              : `${context.dataset.label}: ${fmtKWh(context.parsed.y)}`
          }
        }
      },
      scales: {
        yRevenue: {
          beginAtZero: true, position: 'left',
          title: { display: true, text: 'Receita (R$)', color: '#83C7FF', font: { weight: '700' } },
          ticks: { color: '#83C7FF', maxTicksLimit: 5, callback: fmtChartMoneyTick },
          grid: { color: '#24364E' }
        },
        yEnergy: {
          beginAtZero: true, position: 'right',
          title: { display: true, text: 'Energia (kWh)', color: '#63D8E5', font: { weight: '700' } },
          ticks: { color: '#63D8E5', maxTicksLimit: 5, callback: fmtChartEnergyTick },
          grid: { drawOnChartArea: false }
        },
        x: { ticks: { color: '#B7C7C0' }, grid: { display: false } }
      }
    }
  });
}
function fmtDT(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtDateOnly(value) {
  const d = value instanceof Date ? value : (value ? new Date(value) : null);
  if (!d || Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

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

function monthSummaryFromClosing(closing) {
  if (!closing) return null;
  if (!closingMatchesMonth(closing, closing.month)) return null;
  const occupancy = occupancyFromClosing(closing);
  return {
    label: monthLabel(closing.month),
    mk: closing.month,
    rev: Number(closing.revenue) || 0,
    energy: Number(closing.energyKWh) || 0,
    occI: occupancy.intervalPct,
    occF: occupancy.fullMonthPct,
    count: Number(closing.charges) || 0,
    clients: Number(closing.clients) || 0,
    avgTkt: Number(closing.averageTicket) || 0,
    source: closing.source || 'latest_upload',
    fromClosing: true
  };
}

// Atalho usado pelo financeiro geral. Mantem a mesma abertura segura do painel
// individual e evita duplicar navegacao ou estado da obra no HTML do resumo.
async function openFinanceUnit(workId, stationName = '') {
  await openWorkReport(workId, 'financeiro', stationName);
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

function occupancyFromClosing(closing = {}) {
  const energy = Number(closing.energyKWh || 0);
  const power = Number(closing.power || getPower());
  const mk = closing.month || '';
  const last = parseDate(closing.lastDate);
  if (!energy || !power || !mk) {
    return {
      intervalPct: Number(closing.occupancyIntervalPct) || 0,
      fullMonthPct: Number(closing.occupancyFullMonthPct) || 0
    };
  }
  const monthStart = monthStartDate(mk);
  const monthEnd = monthEndDate(mk);
  const end = last && last < monthEnd ? last : monthEnd;
  const intervalHours = Math.max((end - monthStart) / 3_600_000, 0);
  const [y, m] = mk.split('-');
  const fullMonthHours = daysInMonth(y, m) * 24;
  return {
    intervalPct: intervalHours > 0 ? energy / (power * intervalHours) * 100 : 0,
    fullMonthPct: fullMonthHours > 0 ? energy / (power * fullMonthHours) * 100 : 0
  };
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

function monthSummaryForMonth(mk, power = getPower()) {
  const closedSummary = monthHasEffectiveClosing(mk) ? monthSummaryFromClosing(monthlyClosings?.[mk]) : null;
  const liveSummary = monthLiveSummary(mk, power);
  if (liveSummary) {
    // A base consolidada é a fonte operacional. O snapshot de fechamento
    // é preservado para auditoria, mas não pode esconder recargas posteriores.
    const matchesClosing = Boolean(closedSummary && closingMatchesLiveSummary(monthlyClosings?.[mk], liveSummary));
    return {
      ...liveSummary,
      fromClosing: matchesClosing,
      closed: monthCanBeClosed(mk),
      closingNeedsRefresh: Boolean(closedSummary && !matchesClosing)
    };
  }
  return closedSummary;
}

function monthClosingBadge(summary) {
  if (!summary?.closed && !summary?.fromClosing) return '';
  if (summary.closingNeedsRefresh) {
    return ' <span style="color:var(--p3-warn);font-size:11px">(fechado; base atualizada)</span>';
  }
  return ' <span style="color:var(--p3-muted);font-size:11px">(fechado)</span>';
}

function renderMonthClosing(mk) {
  const closing = monthlyClosings?.[mk];
  const status = document.getElementById('monthClosingStatus');
  const table = document.getElementById('monthClosingTable');
  if (!status || !table) return;
  if (!monthCanBeClosed(mk)) {
    status.textContent = `${monthLabel(mk)} esta em andamento.`;
    table.innerHTML = `<tr><td colspan="9" style="color:var(--p3-muted)">Fechamento liberado somente no ultimo dia de ${monthLabel(mk)}. Os dados atuais continuam como parcial.</td></tr>`;
    return;
  }
  if (!closing) {
    status.textContent = `Ainda nao fechado para ${monthLabel(mk)}.`;
    table.innerHTML = `<tr><td colspan="9" style="color:var(--p3-muted)">Clique em Fechar mes para salvar o fechamento de ${monthLabel(mk)}.</td></tr>`;
    return;
  }
  const live = monthLiveSummary(mk);
  const needsRefresh = Boolean(live && !closingMatchesLiveSummary(closing, live));
  status.textContent = needsRefresh
    ? `A base de ${monthLabel(mk)} foi atualizada depois do fechamento. Os indicadores usam a base consolidada; o snapshot sera reconciliado no proximo salvamento.`
    : `${closing.source === 'manual' || closing.source === 'manual-reconciled' ? 'Fechamento manual' : 'Ultima base do mes'} salva para ${monthLabel(mk)}.`;
  table.innerHTML = `<tr>
    <td>${monthLabel(closing.month)}</td>
    <td>${closing.charges}</td>
    <td>${closing.clients}</td>
    <td>${fmtKWh(closing.energyKWh)}</td>
    <td>${fmtBRL(closing.revenue)}</td>
    <td>${fmtBRL(closing.averageTicket)}</td>
    <td>${fmtDateOnly(closing.firstDate)}</td>
    <td>${fmtDateOnly(closing.lastDate)}</td>
    <td>${new Date(closing.closedAt).toLocaleString('pt-BR')}</td>
  </tr>`;
}

async function closeSelectedMonth() {
  const mk = document.getElementById('monthSelector').value;
  if (!mk) return;
  if (!monthCanBeClosed(mk)) {
    setFeedback(`${monthLabel(mk)} ainda esta em andamento. O fechamento sera liberado no ultimo dia do mes.`, 'up-error');
    renderMonthClosing(mk);
    return;
  }
  const closing = buildMonthClosing(mk);
  if (!closing) {
    setFeedback(`Nao ha recargas em ${monthLabel(mk)} para fechar.`, 'up-error');
    return;
  }
  if (monthlyClosings[mk] && !confirm(`Substituir o fechamento ja salvo de ${monthLabel(mk)}?`)) return;
  monthlyClosings = { ...monthlyClosings, [mk]: { ...closing, source: 'manual' } };
  renderMonthClosing(mk);
  setFeedback(`Fechamento de ${monthLabel(mk)} salvo.`, 'up-loading');
  await saveRechargeBase();
}

function numberInputValue(id, fallback = 0) {
  const value = parseFloat(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
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

function financeItemValues(items, prefix) {
  const values = {};
  items.forEach(([key]) => {
    const el = document.getElementById(`${prefix}-${key}`);
    values[key] = el ? Number(parseFloat(el.value) || 0) : 0;
  });
  return values;
}

function sumFinanceItems(values = {}) {
  return Object.values(values || {}).reduce((sum, value) => sum + Number(value || 0), 0);
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

function financeRulesFromInputs(kind = 'cost') {
  const rows = [...document.querySelectorAll(`tr[data-finance-rule-kind="${kind}"]`)];
  if (!rows.length) return normalizeFinanceRules(financeEditorCurrentSettings || {}, kind);
  return rows.map(row => ({
    id: String(row.dataset.ruleId || ''),
    label: safeText(row.querySelector('[data-rule-field="label"]')?.value || ''),
    enabled: !!row.querySelector('[data-rule-field="enabled"]')?.checked,
    basis: row.querySelector('[data-rule-field="basis"]')?.value || 'fixed',
    value: Number(parseFloat(row.querySelector('[data-rule-field="value"]')?.value) || 0),
    scope: kind === 'revenue' && row.querySelector('[data-rule-field="scope"]')?.value === 'non_operational' ? 'non_operational' : 'operational',
    custom: row.dataset.custom === 'true'
  })).filter(rule => rule.id);
}

function financeLegacyValuesFromRules(rules = [], kind = 'cost') {
  const catalogIds = new Set(financeRuleCatalog(kind).map(([id]) => String(id)));
  return Object.fromEntries(rules
    .filter(rule => catalogIds.has(String(rule.id)))
    .map(rule => [rule.id, rule.enabled && ['fixed','one_off'].includes(rule.basis) ? Number(rule.value || 0) : 0]));
}

function currentFinanceSettingsFromInputs() {
  const energyCostPerKWh = numberInputValue('financeEnergyCost', 0);
  const savedScopeSettings = financeSettingsForMonth(financeMonthKey());
  const savedOwnerEnergyRate = Number(savedScopeSettings.ownerEnergyRate || 0);
  const costRules = financeRulesFromInputs('cost');
  const revenueRules = financeRulesFromInputs('revenue');
  return {
    operationModel: normalizeOperationModel(document.getElementById('financeOperationModel')?.value || 'uby'),
    managementPct: numberInputValue('financeMgmtPct', 5),
    p3SocietyPct: numberInputValue('financeP3SocietyPct', 0),
    p3AcEquityPct: numberInputValue('financeP3AcEquityPct', 0),
    p3DcEquityPct: numberInputValue('financeP3DcEquityPct', 0),
    platformPct: numberInputValue('financePlatformPct', 0),
    ubyRoyaltyPct: numberInputValue('financeUbyRoyaltyPct', 0),
    taxRatePct: numberInputValue('financeTaxRatePct', 0),
    energyCostPerKWh,
    investmentValue: numberInputValue('financeInvestmentValue', 0),
    investorQuotaPct: numberInputValue('financeInvestorQuotaPct', 100),
    saRetentionPct: numberInputValue('financeSaRetentionPct', 0),
    targetOccPct: numberInputValue('financeTargetOccPct', 0),
    targetRevenuePerKWh: numberInputValue('financeTargetRevenuePerKWh', 0),
    ownerEnergyRate: numberInputValue('ownerEnergyRate', savedOwnerEnergyRate || energyCostPerKWh),
    ownerTransferMode: document.getElementById('ownerTransferMode')?.value || savedScopeSettings.ownerTransferMode || 'gross',
    ownerRevenueSharePct: numberInputValue('ownerRevenueSharePct', Number(savedScopeSettings.ownerRevenueSharePct || 0)),
    ownerNetProfitSharePct: numberInputValue('ownerNetProfitSharePct', Number(savedScopeSettings.ownerNetProfitSharePct || 0)),
    costPlanningKWh: numberInputValue('financePlanningKWh', Number(financeEditorCurrentSettings?.costPlanningKWh || 0)),
    costRules,
    revenueRules,
    costItems: financeLegacyValuesFromRules(costRules, 'cost'),
    revenueItems: financeLegacyValuesFromRules(revenueRules, 'revenue'),
    periodMeta: { ...(savedScopeSettings.periodMeta || {}) }
  };
}

function financeRuleBasisOptions(selected = 'fixed') {
  return FINANCE_RULE_BASIS.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function financeRevenueScopeOptions(selected = 'operational') {
  return FINANCE_REVENUE_SCOPE.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function financeRuleValueHint(basis = 'fixed') {
  return {
    fixed: 'R$ por mes',
    per_kwh: 'R$ por kWh',
    revenue_pct: 'percentual',
    per_charge: 'R$ por recarga',
    one_off: 'R$ neste ciclo'
  }[basis] || 'valor';
}

function financeRuleDisplayValue(rule) {
  if (!rule) return 'Sem base anterior';
  if (rule.displayRule) return safeText(rule.displayRule);
  if (rule.enabled === false) return 'Nao utilizado';
  const value = Number(rule.value || 0);
  if (rule.basis === 'revenue_pct') return `${value.toFixed(2).replace('.', ',')}% do faturamento`;
  if (rule.basis === 'per_kwh') return `${fmtBRL(value)}/kWh`;
  if (rule.basis === 'per_charge') return `${fmtBRL(value)}/recarga`;
  if (rule.basis === 'one_off') return `${fmtBRL(value)} no ciclo`;
  return `${fmtBRL(value)}/mes`;
}

function financeRuleSignature(rule) {
  if (!rule) return '';
  return JSON.stringify({
    enabled: rule.enabled !== false,
    label: safeText(rule.label),
    basis: rule.basis || 'fixed',
    value: Number(rule.value || 0),
    scope: rule.scope || 'operational'
  });
}

function financeVersionStateInfo(equal, hasPrevious, exact) {
  if (!hasPrevious) return { label: 'Novo', className: 'new' };
  if (!exact) return { label: 'Herdado', className: 'inherited' };
  return equal
    ? { label: 'Mantido', className: 'inherited' }
    : { label: 'Alterado', className: 'changed' };
}

function updateFinanceRuleVersionState() {
  const mk = financeMonthKey();
  if (!mk) return;
  const resolution = financeMonthResolution(mk);
  const previousSettings = resolution.previousMonth ? financeSettingsForMonth(resolution.previousMonth) : null;
  ['cost', 'revenue'].forEach(kind => {
    const currentRules = financeRulesFromInputs(kind);
    const previousRules = previousSettings ? normalizeFinanceRules(previousSettings, kind) : [];
    const previousById = new Map(previousRules.map(rule => [String(rule.id), rule]));
    currentRules.forEach(rule => {
      const row = [...document.querySelectorAll(`tr[data-finance-rule-kind="${kind}"]`)].find(candidate => String(candidate.dataset.ruleId || '') === String(rule.id));
      if (!row) return;
      const previous = previousById.get(String(rule.id));
      const previousCell = row.querySelector('[data-rule-previous]');
      const state = financeVersionStateInfo(financeRuleSignature(rule) === financeRuleSignature(previous), !!previous, resolution.exact);
      if (previousCell) previousCell.textContent = financeRuleDisplayValue(previous);
      const stateEl = row.querySelector('[data-rule-state]');
      if (stateEl) {
        stateEl.textContent = state.label;
        stateEl.className = `finance-setting-state ${state.className}`;
      }
    });
  });
  const currentEnergy = numberInputValue('financeEnergyCost', 0);
  const previousEnergy = previousSettings ? Number(previousSettings.energyCostPerKWh || 0) : null;
  const energyPrevious = document.querySelector('[data-finance-energy-previous]');
  if (energyPrevious) energyPrevious.textContent = previousSettings ? `${fmtBRL(previousEnergy)}/kWh` : 'Sem base anterior';
  const energyState = financeVersionStateInfo(previousSettings ? Math.abs(currentEnergy - previousEnergy) < 0.000001 : false, !!previousSettings, resolution.exact);
  const energyStateEl = document.querySelector('[data-finance-energy-state]');
  if (energyStateEl) {
    energyStateEl.textContent = energyState.label;
    energyStateEl.className = `finance-setting-state ${energyState.className}`;
  }
}

function renderFinanceRuleInputs(containerId, rules = [], kind = 'cost') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const energyRow = kind === 'cost' ? `
    <tr class="finance-energy-row" data-finance-energy-row="true">
      <td class="rule-enabled">Ativo</td>
      <td class="rule-name"><strong>Energia eletrica</strong><div class="sub">Tarifa definida nos parametros do ponto</div></td>
      <td class="rule-basis">Por kWh</td>
      <td class="rule-value" id="financeEnergyRuleValue">${fmtBRL(numberInputValue('financeEnergyCost', 0))}/kWh</td>
      <td class="rule-output" data-finance-energy-actual>${fmtBRL(0)}</td>
      <td class="rule-output primary" data-finance-energy-planned-kwh>${fmtBRL(numberInputValue('financeEnergyCost', 0))}</td>
      <td class="rule-output primary" data-finance-energy-actual-kwh>${fmtBRL(numberInputValue('financeEnergyCost', 0))}</td>
      <td class="rule-previous" data-finance-energy-previous>-</td>
      <td class="rule-state"><span class="finance-setting-state" data-finance-energy-state>-</span></td>
      <td class="rule-actions"></td>
    </tr>
  ` : '';
  container.innerHTML = energyRow + rules.map(rule => `
    <tr class="${rule.enabled ? '' : 'rule-disabled'}" data-finance-rule-kind="${kind}" data-rule-id="${escapeAttr(rule.id)}" data-custom="${rule.custom ? 'true' : 'false'}">
      <td class="rule-enabled"><input type="checkbox" data-rule-field="enabled" ${rule.enabled ? 'checked' : ''} onchange="handleFinanceRuleEditorChange()" aria-label="Usar ${escapeAttr(rule.label)}"></td>
      <td class="rule-name"><input class="ctl-input" data-rule-field="label" value="${escapeAttr(rule.label)}" oninput="handleFinanceRuleEditorChange()" aria-label="Nome do item">${kind === 'revenue' ? `<select class="ctl-select" data-rule-field="scope" onchange="handleFinanceRuleEditorChange()" aria-label="Classificacao da receita">${financeRevenueScopeOptions(rule.scope)}</select>` : ''}</td>
      <td class="rule-basis"><select class="ctl-select" data-rule-field="basis" onchange="handleFinanceRuleEditorChange()">${financeRuleBasisOptions(rule.basis)}</select></td>
      <td class="rule-value"><input class="ctl-input" data-rule-field="value" type="number" min="0" step="0.01" value="${Number(rule.value || 0)}" oninput="handleFinanceRuleEditorChange()"><small data-rule-value-hint>${financeRuleValueHint(rule.basis)}</small></td>
      <td class="rule-output" data-rule-output="actual">${fmtBRL(0)}</td>
      <td class="rule-output primary" data-rule-output="planned-kwh">-</td>
      <td class="rule-output primary" data-rule-output="actual-kwh">-</td>
      <td class="rule-previous" data-rule-previous>-</td>
      <td class="rule-state"><span class="finance-setting-state" data-rule-state>-</span></td>
      <td class="rule-actions">${rule.custom ? `<button class="finance-rule-remove" type="button" title="Excluir item" onclick="removeFinanceRule(this)">&times;</button>` : ''}</td>
    </tr>
  `).join('');
}

function addFinanceRule(kind = 'cost') {
  const settings = currentFinanceSettingsFromInputs();
  const field = financeRuleField(kind);
  const rules = normalizeFinanceRules(settings, kind);
  rules.push({
    id: `custom-${kind}-${Date.now()}`,
    label: kind === 'revenue' ? 'Nova receita' : 'Novo custo',
    enabled: true,
    basis: 'fixed',
    value: 0,
    scope: kind === 'revenue' ? 'operational' : undefined,
    custom: true
  });
  settings[field] = rules;
  financeEditorCurrentSettings = settings;
  renderFinanceRuleInputs(kind === 'revenue' ? 'financeRevenueRuleRows' : 'financeCostRuleRows', rules, kind);
  handleFinanceRuleEditorChange();
  const last = document.querySelector(`tr[data-finance-rule-kind="${kind}"]:last-child [data-rule-field="label"]`);
  last?.focus();
  last?.select();
}

function removeFinanceRule(button) {
  const row = button?.closest('tr[data-finance-rule-kind]');
  if (!row || row.dataset.custom !== 'true') return;
  row.remove();
  handleFinanceRuleEditorChange();
}

function handleFinanceRuleEditorChange() {
  document.querySelectorAll('tr[data-finance-rule-kind]').forEach(row => {
    row.classList.toggle('rule-disabled', !row.querySelector('[data-rule-field="enabled"]')?.checked);
    const hint = row.querySelector('[data-rule-value-hint]');
    if (hint) hint.textContent = financeRuleValueHint(row.querySelector('[data-rule-field="basis"]')?.value || 'fixed');
  });
  renderFinanceiro(false);
  updateFinanceRuleVersionState();
  scheduleFinancialSettingsSave();
}

function handleFinanceSettingChange() {
  const model = document.getElementById('financeOperationModel')?.value || 'uby';
  const transferMode = document.getElementById('ownerTransferMode')?.value || 'gross';
  updateFinanceModelVisibility(model);
  updateOwnerTransferModeVisibility(transferMode);
  renderFinanceiro(false);
  scheduleFinancialSettingsSave();
}

function handleFinanceEnergySettingChange() {
  const priorEnergy = Number(financeEditorCurrentSettings?.energyCostPerKWh || 0);
  const ownerRate = numberInputValue('ownerEnergyRate', 0);
  syncOwnerEnergyRateFromCost(!ownerRate || Math.abs(ownerRate - priorEnergy) < 0.000001);
  handleFinanceSettingChange();
}

function formatFinanceSettingValue(value, format = '') {
  if (format === 'model') return operationModelLabel(value);
  if (format === 'transfer') return value === 'net' ? 'Lucro liquido' : 'Faturamento bruto';
  if (format === 'pct') return fmtPct(Number(value || 0));
  if (format === 'brl_kwh') return `${fmtBRL(Number(value || 0))}/kWh`;
  if (format === 'brl') return fmtBRL(Number(value || 0));
  return String(value ?? '-');
}

function financeSettingValuesEqual(current, previous) {
  if (typeof current === 'number' || typeof previous === 'number') {
    return Math.abs(Number(current || 0) - Number(previous || 0)) < 0.000001;
  }
  return String(current ?? '') === String(previous ?? '');
}

function financeRuleChangeCount(currentSettings = {}, previousSettings = null) {
  if (!previousSettings) return 0;
  return ['cost', 'revenue'].reduce((total, kind) => {
    const current = normalizeFinanceRules(currentSettings, kind);
    const previous = normalizeFinanceRules(previousSettings, kind);
    const previousById = new Map(previous.map(rule => [String(rule.id), rule]));
    return total + current.reduce((count, rule) => count + (financeRuleSignature(rule) === financeRuleSignature(previousById.get(String(rule.id))) ? 0 : 1), 0);
  }, 0);
}

function renderFinanceMonthVersionState(settings = currentFinanceSettingsFromInputs()) {
  const mk = financeMonthKey();
  if (!mk) return;
  const resolution = financeMonthResolution(mk);
  const exactSettings = financeExactSettingsForMonth(mk);
  const previousSettings = resolution.previousMonth ? financeSettingsForMonth(resolution.previousMonth) : null;
  const periodMeta = exactSettings.periodMeta || settings.periodMeta || {};
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('financeVersionMonth', monthLabel(mk));
  if (resolution.exact) {
    setText('financeVersionSource', periodMeta.inheritedFrom ? monthLabel(periodMeta.inheritedFrom) : 'Valores proprios do mes');
    setText('financeVersionSourceHelp', periodMeta.inheritedFrom ? 'base copiada e preservada nesta competencia' : 'configuracao mensal ja registrada');
  } else if (resolution.previousMonth) {
    setText('financeVersionSource', monthLabel(resolution.previousMonth));
    setText('financeVersionSourceHelp', 'valores herdados; serao fixados automaticamente');
  } else {
    setText('financeVersionSource', 'Configuracao inicial');
    setText('financeVersionSourceHelp', 'primeira competencia financeira deste ponto');
  }

  let changed = 0;
  document.querySelectorAll('[data-finance-setting-key]').forEach(row => {
    const key = row.dataset.financeSettingKey;
    const format = row.dataset.financeSettingFormat || '';
    const currentValue = settings?.[key];
    const previousValue = previousSettings?.[key];
    const hasPrevious = !!previousSettings;
    const state = financeVersionStateInfo(financeSettingValuesEqual(currentValue, previousValue), hasPrevious, resolution.exact);
    if (hasPrevious && !financeSettingValuesEqual(currentValue, previousValue)) changed += 1;
    const previousEl = row.querySelector('[data-finance-setting-previous]');
    if (previousEl) previousEl.textContent = hasPrevious ? formatFinanceSettingValue(previousValue, format) : 'Sem base anterior';
    const stateEl = row.querySelector('[data-finance-setting-state]');
    if (stateEl) {
      stateEl.textContent = state.label;
      stateEl.className = `finance-setting-state ${state.className}`;
    }
  });
  changed += financeRuleChangeCount(settings, previousSettings);
  const stateCard = document.getElementById('financeVersionStateCard');
  const stateLabel = !resolution.exact ? 'Herdado e protegido' : (changed ? 'Atualizado no mes' : 'Valores mantidos');
  setText('financeVersionState', stateLabel);
  setText('financeVersionChanges', changed ? `${changed} variavel(is) diferente(s) da base anterior` : 'sem diferencas em relacao a base anterior');
  if (stateCard) stateCard.className = `finance-month-status ${changed ? 'warn' : 'good'}`;
  setText('financeVersionSaved', resolution.exact ? 'Salvo' : 'Preparando copia');
  setText('financeVersionSavedAt', periodMeta.updatedAt ? `ultima gravacao ${new Date(periodMeta.updatedAt).toLocaleString('pt-BR')}` : 'banco e copia local');
  updateFinanceRuleVersionState();
}

async function handleFinanceMonthChange() {
  await flushPendingFinancialSettingsSave();
  const mk = financeMonthKey();
  if (!mk) return;
  const resolution = financeMonthResolution(mk);
  renderFinanceiro(true);
  if (!resolution.exact && currentWorkId) {
    persistFinancialSettingsFromInputs(mk);
    saveLocalRechargeBase();
    try {
      await saveFinancialSettingsRecord();
      renderFinanceiro(false);
      setStorageState(`Valores de ${monthLabel(resolution.previousMonth || mk)} mantidos como base de <strong>${monthLabel(mk)}</strong>.`);
    } catch (err) {
      setStorageState(`Base mensal salva localmente. Falha ao sincronizar: ${err.message}`, true);
    }
  }
}

async function confirmFinanceMonthValues() {
  await flushPendingFinancialSettingsSave();
  const mk = financeMonthKey();
  if (!mk) return;
  persistFinancialSettingsFromInputs(mk);
  renderFinanceiro(false);
  setFeedback(`Valores de ${monthLabel(mk)} confirmados para ${currentWorkName}.`, 'up-loading');
  await saveFinancialSettingsRecord();
  renderFinanceiro(false);
}

async function restoreFinancePreviousMonth() {
  await flushPendingFinancialSettingsSave();
  const mk = financeMonthKey();
  const resolution = financeMonthResolution(mk);
  const previousMonth = resolution.previousMonth;
  if (!previousMonth) {
    alert('Nao existe um mes financeiro anterior para restaurar.');
    return;
  }
  if (resolution.exact && !confirm(`Restaurar em ${monthLabel(mk)} todos os valores de ${monthLabel(previousMonth)}?`)) return;
  const previous = { ...financeSettingsForMonth(previousMonth), periodMeta: {} };
  applyFinanceSettingsToInputs(previous);
  persistFinancialSettingsFromInputs(mk, previousMonth);
  renderFinanceiro(false);
  await saveFinancialSettingsRecord();
  setStorageState(`Valores de <strong>${monthLabel(previousMonth)}</strong> restaurados em ${monthLabel(mk)}.`);
}

function applyFinanceSettingsToInputs(settings = {}) {
  const merged = { ...defaultFinanceSettings(), ...settings };
  merged.operationModel = normalizeOperationModel(merged.operationModel);
  if (!settings.operationModel && (Number(settings.p3AcEquityPct || 0) > 0 || Number(settings.p3DcEquityPct || 0) > 0)) merged.operationModel = 'hybrid';
  if (!settings.ownerTransferMode && Number(settings.ownerNetProfitSharePct || 0) > 0) merged.ownerTransferMode = 'net';
  if (!Number(merged.ownerEnergyRate || 0) && Number(merged.energyCostPerKWh || 0) > 0) merged.ownerEnergyRate = merged.energyCostPerKWh;
  merged.costItems = { ...(settings.costItems || {}), ...(settings.extraCosts || {}) };
  if (Number(settings.otherCosts || 0) > 0 && !merged.costItems.otherCostsLegacy) merged.costItems.otherCostsLegacy = Number(settings.otherCosts || 0);
  merged.revenueItems = { ...(settings.revenueItems || {}), ...(settings.extraRevenue || {}) };
  merged.costRules = normalizeFinanceRules({ ...settings, costItems: merged.costItems }, 'cost');
  merged.revenueRules = normalizeFinanceRules({ ...settings, revenueItems: merged.revenueItems }, 'revenue');
  financeEditorCurrentSettings = merged;
  const fields = {
    financeOperationModel: merged.operationModel,
    financeMgmtPct: merged.managementPct,
    financeP3SocietyPct: merged.p3SocietyPct,
    financeP3AcEquityPct: merged.p3AcEquityPct,
    financeP3DcEquityPct: merged.p3DcEquityPct,
    financePlatformPct: merged.platformPct,
    financeUbyRoyaltyPct: merged.ubyRoyaltyPct,
    financeTaxRatePct: merged.taxRatePct,
    financeEnergyCost: merged.energyCostPerKWh,
    financeInvestmentValue: merged.investmentValue,
    financeInvestorQuotaPct: merged.investorQuotaPct,
    financeSaRetentionPct: merged.saRetentionPct,
    financeTargetOccPct: merged.targetOccPct,
    financeTargetRevenuePerKWh: merged.targetRevenuePerKWh,
    financePlanningKWh: merged.costPlanningKWh,
    ownerEnergyRate: merged.ownerEnergyRate,
    ownerTransferMode: merged.ownerTransferMode,
    ownerRevenueSharePct: merged.ownerRevenueSharePct,
    ownerNetProfitSharePct: merged.ownerNetProfitSharePct
  };
  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = String(value || defaultFinanceSettings()[id === 'ownerTransferMode' ? 'ownerTransferMode' : 'operationModel']);
    } else {
      el.value = Number(value || 0);
    }
  });
  renderFinanceRuleInputs('financeCostRuleRows', merged.costRules, 'cost');
  renderFinanceRuleInputs('financeRevenueRuleRows', merged.revenueRules, 'revenue');
}

function syncOwnerEnergyRateFromCost(force = false) {
  const ownerInput = document.getElementById('ownerEnergyRate');
  const costInput = document.getElementById('financeEnergyCost');
  if (!ownerInput || !costInput) return;
  const cost = Number(parseFloat(costInput.value) || 0);
  const current = Number(parseFloat(ownerInput.value) || 0);
  if (force || !current) ownerInput.value = cost;
}

function populateFinanceWorkSelector() {
  const target = document.getElementById('financeWorkSelector');
  const source = document.getElementById('workSelector');
  if (!target || !source) return;
  const options = [...source.options].filter(option => option.value);
  target.innerHTML = options.map(option => `<option value="${escapeAttr(option.value)}">${escapeHtml(option.textContent || option.value)}</option>`).join('');
  if (currentWorkId && options.some(option => option.value === currentWorkId)) target.value = currentWorkId;
}

async function handleFinanceWorkChange(workId) {
  if (!workId || String(workId) === String(currentWorkId)) return;
  await openWorkReport(workId, 'financeiro');
}

function showFinancePanel(panel = '') {
  const selector = document.getElementById('financePanelSelector');
  const active = panel || selector?.value || 'overview';
  if (selector && selector.value !== active) selector.value = active;
  document.querySelectorAll('[data-finance-panel]').forEach(section => {
    section.classList.toggle('finance-panel-hidden', active !== 'all' && section.dataset.financePanel !== active);
  });
  if (active === 'reports') renderIndividualFinanceReportLibrary();
}

function updateFinanceCommandSummary(result = {}, charges = [], clients = 0) {
  const target = document.getElementById('financeCommandSummary');
  if (!target) return;
  const net = Number(result.operationNet || 0);
  target.innerHTML = `
    <div class="finance-command-metric"><span>Receita</span><strong>${fmtBRL(result.totalRevenue || result.revenue || 0)}</strong></div>
    <div class="finance-command-metric"><span>Custos totais</span><strong>${fmtBRL(result.totalOperatingCost || 0)}</strong></div>
    <div class="finance-command-metric ${net >= 0 ? 'positive' : 'negative'}"><span>Resultado</span><strong>${fmtBRL(net)}</strong></div>
    <div class="finance-command-metric"><span>Operacao</span><strong>${charges.length} recargas</strong><span>${clients} cliente(s) | ${fmtKWh(result.energy || 0)}</span></div>
  `;
}

function financeMonthKey() {
  return document.getElementById('financeMonthSelector')?.value || document.getElementById('monthSelector')?.value || getMonths().at(-1) || '';
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

function financeMonthResolution(mk, root = financialSettings, stationName = currentStationReportName) {
  const base = root || {};
  const key = financeChargerStorageKey(stationName);
  const scoped = key ? (base?.chargers?.[key] || {}) : {};
  return window.UBY_FINANCE_ENGINE.resolveMonthlySettings(defaultFinanceSettings(), base, scoped, mk);
}

function financeSettingsForMonth(mk, root = financialSettings, stationName = currentStationReportName) {
  return financeMonthResolution(mk, root, stationName).settings;
}

function financeExactSettingsForMonth(mk, root = financialSettings, stationName = currentStationReportName) {
  const base = root || {};
  const key = financeChargerStorageKey(stationName);
  const scoped = key ? (base?.chargers?.[key] || {}) : {};
  return { ...(base?.[mk] || {}), ...(scoped?.[mk] || {}) };
}

function financeSettingsForUbyRow(row = {}, mk = '') {
  const root = allRechargeRecords[row.workId]?.financialSettings || allRechargeRecords[row.workId]?.summary?.financialSettings || {};
  const stationName = row.stationName || row.station || row.workName || '';
  const key = normalizeStationForCompare(canonicalStationNameForWork(row.workId, stationName, row.workName));
  const scoped = root?.chargers?.[key] || {};
  return window.UBY_FINANCE_ENGINE.resolveMonthlySettings(defaultFinanceSettings(), root, scoped, mk).settings;
}

function ownerAreaSettingsForMonth(mk, useInputs = false) {
  const saved = financeSettingsForMonth(mk);
  if (!useInputs) return saved;
  return { ...saved, ...currentFinanceSettingsFromInputs() };
}

function applyOwnerAreaSettingsToInputs(mk) {
  const settings = ownerAreaSettingsForMonth(mk);
  const fields = {
    ownerEnergyRate: settings.ownerEnergyRate,
    ownerTransferMode: settings.ownerTransferMode,
    ownerRevenueSharePct: settings.ownerRevenueSharePct,
    ownerNetProfitSharePct: settings.ownerNetProfitSharePct
  };
  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = el.tagName === 'SELECT' ? String(value || defaultFinanceSettings().ownerTransferMode) : Number(value || 0);
  });
}

function ownerAreaReportForSummary(summary, settings = {}, charges = []) {
  const energy = Number(summary?.energy || 0);
  const revenue = Number(summary?.rev || 0);
  const energyRate = Number(settings.ownerEnergyRate || 0);
  const transferMode = settings.ownerTransferMode || 'gross';
  const sharePct = Number(settings.ownerRevenueSharePct || 0);
  const netProfitSharePct = Number(settings.ownerNetProfitSharePct || 0);
  const finance = financeForCharges(charges || [], settings);
  const netProfit = charges?.length ? Number(finance.preAreaNet || 0) : Math.max(revenue - energy * energyRate, 0);
  const energyReimbursement = energy * energyRate;
  const revenueShare = revenue * sharePct / 100;
  const netProfitShare = Math.max(netProfit, 0) * netProfitSharePct / 100;
  const selectedShare = transferMode === 'net' ? netProfitShare : revenueShare;
  const selectedSharePct = transferMode === 'net' ? netProfitSharePct : sharePct;
  const selectedShareBase = transferMode === 'net' ? netProfit : revenue;
  const selectedShareLabel = transferMode === 'net' ? 'Repasse sobre lucro liquido' : 'Repasse sobre faturamento';
  return {
    energy,
    revenue,
    energyRate,
    transferMode,
    sharePct,
    netProfit,
    netProfitSharePct,
    energyReimbursement,
    revenueShare,
    netProfitShare,
    selectedShare,
    selectedSharePct,
    selectedShareBase,
    selectedShareLabel,
    ownerTotal: energyReimbursement + selectedShare
  };
}

function renderOwnerAreaReportForCurrentMonth() {
  const financeVisible = document.getElementById('tabFinanceiro')?.style.display === 'block';
  const mk = (financeVisible ? document.getElementById('financeMonthSelector')?.value : document.getElementById('monthSelector')?.value) || financeMonthKey();
  if (!mk) return;
  const currentSummary = monthSummaryForMonth(mk);
  const currentSettings = ownerAreaSettingsForMonth(mk, true);
  const currentCharges = chargesForMonth(mk);
  const current = ownerAreaReportForSummary(currentSummary, currentSettings, currentCharges);
  const accumulated = getMonths().filter(monthKeyValue => monthKeyValue <= mk).reduce((acc, monthKeyValue) => {
    const settings = monthKeyValue === mk ? currentSettings : ownerAreaSettingsForMonth(monthKeyValue);
    const charges = chargesForMonth(monthKeyValue);
    const report = ownerAreaReportForSummary(monthSummaryForMonth(monthKeyValue), settings, charges);
    acc.energy += report.energy;
    acc.revenue += report.revenue;
    acc.netProfit += report.netProfit;
    acc.energyReimbursement += report.energyReimbursement;
    acc.revenueShare += report.revenueShare;
    acc.netProfitShare += report.netProfitShare;
    acc.selectedShare += report.selectedShare;
    acc.ownerTotal += report.ownerTotal;
    return acc;
  }, { energy: 0, revenue: 0, netProfit: 0, energyReimbursement: 0, revenueShare: 0, netProfitShare: 0, selectedShare: 0, ownerTotal: 0 });

  const table = document.getElementById('ownerAreaReportTable');
  if (!table) return;
  updateOwnerTransferModeVisibility(current.transferMode);
  table.innerHTML = `
    <tr><td colspan="3"><strong>Mes atual - ${monthLabel(mk)}</strong></td></tr>
    <tr><td>Energia consumida</td><td>${fmtKWh(current.energy)}</td><td>${fmtBRL(current.energyRate)} / kWh</td></tr>
    <tr><td>Reembolso de energia</td><td>${fmtBRL(current.energyReimbursement)}</td><td>kWh x valor definido</td></tr>
    <tr><td>${current.transferMode === 'net' ? 'Lucro liquido base' : 'Faturamento bruto'}</td><td>${fmtBRL(current.selectedShareBase)}</td><td>${fmtPct(current.selectedSharePct)} de repasse</td></tr>
    <tr><td>${current.selectedShareLabel}</td><td>${fmtBRL(current.selectedShare)}</td><td>${current.transferMode === 'net' ? 'lucro liquido x percentual' : 'receita x percentual'}</td></tr>
    <tr><td><strong>Total para dono da area</strong></td><td><strong>${fmtBRL(current.ownerTotal)}</strong></td><td>energia + repasse escolhido</td></tr>
    <tr><td colspan="3"><strong>Acumulado da unidade</strong></td></tr>
    <tr><td>Energia acumulada</td><td>${fmtKWh(accumulated.energy)}</td><td>todos os meses salvos</td></tr>
    <tr><td>Reembolso energia acumulado</td><td>${fmtBRL(accumulated.energyReimbursement)}</td><td>por valor mensal salvo</td></tr>
    <tr><td>${current.transferMode === 'net' ? 'Lucro liquido acumulado' : 'Faturamento acumulado'}</td><td>${fmtBRL(current.transferMode === 'net' ? accumulated.netProfit : accumulated.revenue)}</td><td>todos os meses salvos</td></tr>
    <tr><td>${current.transferMode === 'net' ? 'Repasse lucro liquido acumulado' : 'Repasse faturamento acumulado'}</td><td>${fmtBRL(accumulated.selectedShare)}</td><td>por modo mensal salvo</td></tr>
    <tr><td><strong>Total acumulado para dono</strong></td><td><strong>${fmtBRL(accumulated.ownerTotal)}</strong></td><td>energia + repasse escolhido</td></tr>
  `;
}

function cleanFinanceReportPayload(value) {
  return JSON.parse(JSON.stringify(value || {}, (key, item) => typeof item === 'number' && !Number.isFinite(item) ? null : item));
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
  writeJson(FINANCE_REPORTS_LOCAL_KEY, sortFinanceReports(items).slice(0, 600));
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

function saveFinanceReportLocal(report = {}) {
  const related = sortFinanceReports(financeReportArchive.filter(item =>
    item.workId === report.workId && (item.stationKey || '') === (report.stationKey || '') && item.reportType === report.reportType && item.periodKey === report.periodKey
  ));
  const latest = related[0] || null;
  const now = new Date().toISOString();
  let saved;
  if (latest && latest.status !== 'closed') {
    saved = { ...latest, ...report, version: latest.version || 1, updatedAt: now, closedAt: report.status === 'closed' ? now : null };
    financeReportArchive = financeReportArchive.filter(item => item.id !== latest.id);
  } else {
    saved = { ...report, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, version: latest ? Number(latest.version || 1) + 1 : 1, generatedAt: now, updatedAt: now, closedAt: report.status === 'closed' ? now : null };
  }
  financeReportArchive.push(saved);
  financeReportArchive = sortFinanceReports(financeReportArchive);
  writeLocalFinanceReports(financeReportArchive);
  return saved;
}

async function persistFinanceReport(report = {}) {
  const prepared = { ...report, payload: cleanFinanceReportPayload(report.payload), status: report.status === 'closed' ? 'closed' : 'partial' };
  let saved = null;
  if (window.UBY_SUPABASE?.saveFinanceReport) {
    try {
      const response = await window.UBY_SUPABASE.saveFinanceReport(prepared);
      saved = response?.report || null;
    } catch (err) {
      console.warn('Relatorio salvo somente na copia local:', err);
    }
  }
  if (!saved) saved = saveFinanceReportLocal(prepared);
  mergeFinanceReportArchive(financeReportArchive.filter(item => financeReportTuple(item) !== financeReportTuple(saved)), saved);
  writeLocalFinanceReports(financeReportArchive);
  return saved;
}

function financeReportPeriod(mk = '', operationStart = currentWorkOperationStart(), reference = new Date()) {
  const [year, month] = String(mk).split('-').map(Number);
  let start = new Date(year, month - 1, 1);
  const firstOperation = operationStart && typeof operationStart.getTime === 'function'
    ? new Date(operationStart)
    : parseDate(operationStart);
  if (
    firstOperation &&
    !Number.isNaN(firstOperation.getTime()) &&
    firstOperation.getFullYear() === year &&
    firstOperation.getMonth() === month - 1
  ) {
    start = new Date(year, month - 1, firstOperation.getDate());
  }
  const monthEnd = new Date(year, month, 0);
  const today = reference && typeof reference.getTime === 'function' ? new Date(reference) : new Date();
  const end = year === today.getFullYear() && month === today.getMonth() + 1 ? today : monthEnd;
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { key: mk, label: monthLabel(mk), start: iso(start), end: iso(end) };
}

const MAX_FINANCE_MONTHS = 600; // ~50 anos: nenhuma série real chega perto.
function financeMonthSeries(firstMonth = '', lastMonth = '') {
  if (!/^\d{4}-\d{2}$/.test(firstMonth) || !/^\d{4}-\d{2}$/.test(lastMonth) || firstMonth > lastMonth) return [];
  if (!isPlausibleMonthKey(firstMonth) || !isPlausibleMonthKey(lastMonth)) return [];
  const [startYear, startMonth] = firstMonth.split('-').map(Number);
  const [endYear, endMonth] = lastMonth.split('-').map(Number);
  const rows = [];
  let cursor = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  while (cursor <= end && rows.length < MAX_FINANCE_MONTHS) {
    rows.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return rows;
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function overviewRenderSignature(name) {
  const view = document.getElementById('generalViewMode')?.value || 'month';
  return `${name}:${rechargeRecordsVersion}:${view}`;
}

function overviewMonthKeys() {
  return [...new Set(getAllGeneralCharges(getGeneralUnitData())
    .map(chargeMonthKey)
    .filter(key => key !== 'unknown'))].sort();
}

function syncOverviewMonthOptions(sourceMonths = overviewMonthKeys()) {
  const select = document.getElementById('generalViewMode');
  if (!select) return;
  const months = [...new Set(sourceMonths || [])].filter(isPlausibleMonthKey).sort();
  const previous = select.value || 'month';
  const latestMonth = months[months.length - 1] || '';
  const options = [
    { value: 'month', label: latestMonth ? `Mês atual (${monthLabel(latestMonth)})` : 'Mês atual' },
    ...months.slice(0, -1).reverse().map(monthKey => ({ value: `month:${monthKey}`, label: monthLabel(monthKey) })),
    { value: 'accumulated', label: 'Acumulado' }
  ];
  const signature = options.map(option => `${option.value}:${option.label}`).join('|');
  if (select.dataset.optionsSignature !== signature) {
    select.innerHTML = options.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
    select.dataset.optionsSignature = signature;
  }
  select.value = options.some(option => option.value === previous) ? previous : 'month';
}

function selectedOverviewPeriod(sourceMonths = overviewMonthKeys()) {
  const months = [...new Set(sourceMonths || [])].filter(isPlausibleMonthKey).sort();
  const latestMonth = months[months.length - 1] || '';
  const view = document.getElementById('generalViewMode')?.value || 'month';
  const requestedMonth = view.startsWith('month:') ? view.slice('month:'.length) : latestMonth;
  const monthKey = months.includes(requestedMonth) ? requestedMonth : latestMonth;
  const isAccumulated = view === 'accumulated';
  const isMonthView = !isAccumulated && !!monthKey;
  return {
    monthKey,
    latestMonth,
    isMonthView,
    isCurrentMonth: isMonthView && monthKey === latestMonth,
    label: isMonthView ? (monthKey === latestMonth ? `Mês atual (${monthLabel(monthKey)})` : monthLabel(monthKey)) : 'Acumulado'
  };
}

function syncFinanceOnlyMonthOptions(sourceMonths = []) {
  const select = document.getElementById('financeViewMode');
  if (!select) return;
  const months = [...new Set(sourceMonths || [])].filter(isPlausibleMonthKey).sort();
  const previous = select.value || 'accumulated';
  const options = [
    { value: 'accumulated', label: 'Acumulado' },
    ...months.slice().reverse().map(monthKey => ({ value: `month:${monthKey}`, label: monthLabel(monthKey) }))
  ];
  const signature = options.map(option => `${option.value}:${option.label}`).join('|');
  if (select.dataset.optionsSignature !== signature) {
    select.innerHTML = options.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
    select.dataset.optionsSignature = signature;
  }
  select.value = options.some(option => option.value === previous) ? previous : 'accumulated';
}

function selectedFinanceOnlyPeriod(sourceMonths = []) {
  const months = [...new Set(sourceMonths || [])].filter(isPlausibleMonthKey).sort();
  const view = document.getElementById('financeViewMode')?.value || 'accumulated';
  const requestedMonth = view.startsWith('month:') ? view.slice('month:'.length) : '';
  const monthKey = months.includes(requestedMonth) ? requestedMonth : '';
  const isMonthView = !!monthKey;
  return { monthKey, isMonthView, label: isMonthView ? monthLabel(monthKey) : 'Acumulado' };
}

function overviewNeedsRender(name) {
  return overviewRenderState[name] !== overviewRenderSignature(name);
}

function markOverviewRendered(name) {
  overviewRenderState[name] = overviewRenderSignature(name);
}

function scheduleOverviewInsights(name, callback) {
  clearTimeout(overviewInsightsTimers[name]);
  const signature = overviewRenderSignature(name);
  overviewInsightsTimers[name] = setTimeout(async () => {
    if (overviewRenderSignature(name) !== signature) return;
    try { await callback(); }
    catch (error) { console.warn(`Analise secundaria ${name} pendente:`, error); }
  }, 180);
}

function parseRechargeRowsInWorker(arrayBuffer, isCsvFile) {
  if (!window.Worker || !window.Blob || !window.URL?.createObjectURL) {
    return Promise.reject(new Error('Processamento em segundo plano indisponivel.'));
  }
  const workerSource = `
    function parseCsvRows(text) {
      const rows = []; let row = []; let value = ''; let quoted = false;
      const input = String(text || '').replace(/^\\uFEFF/, '');
      for (let i = 0; i < input.length; i++) {
        const char = input[i]; const next = input[i + 1];
        if (char === '"') {
          if (quoted && next === '"') { value += '"'; i++; }
          else quoted = !quoted;
        } else if (char === ',' && !quoted) { row.push(value); value = ''; }
        else if ((char === '\\n' || char === '\\r') && !quoted) {
          if (char === '\\r' && next === '\\n') i++;
          row.push(value);
          if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
          row = []; value = '';
        } else value += char;
      }
      row.push(value);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      return rows;
    }
    self.onmessage = event => {
      try {
        const { buffer, csv, xlsxUrl } = event.data;
        let rows;
        if (csv) rows = parseCsvRows(new TextDecoder('utf-8').decode(buffer));
        else {
          importScripts(xlsxUrl);
          const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
          const sheet = workbook.Sheets.Recargas || workbook.Sheets[workbook.SheetNames[0]];
          if (!sheet) throw new Error('Nenhuma aba encontrada no arquivo.');
          rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        }
        self.postMessage({ ok: true, rows });
      } catch (error) {
        self.postMessage({ ok: false, error: error?.message || String(error) });
      }
    };
  `;
  return new Promise((resolve, reject) => {
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const timeout = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error('A leitura da planilha excedeu o tempo esperado.'));
    }, 90000);
    const finish = (callback, value) => {
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      callback(value);
    };
    worker.onmessage = event => {
      if (event.data?.ok) finish(resolve, event.data.rows || []);
      else finish(reject, new Error(event.data?.error || 'Falha ao processar a planilha.'));
    };
    worker.onerror = event => finish(reject, new Error(event.message || 'Falha no leitor em segundo plano.'));
    const transferable = arrayBuffer.slice(0);
    worker.postMessage({ buffer: transferable, csv: isCsvFile, xlsxUrl: XLSX_CDN_URL }, [transferable]);
  });
}

async function rechargeRowsFromFileBuffer(arrayBuffer, isCsvFile) {
  try {
    return await parseRechargeRowsInWorker(arrayBuffer, isCsvFile);
  } catch (workerError) {
    if (isCsvFile) return parseCsvRows(new TextDecoder('utf-8').decode(arrayBuffer));
    await ensureSpreadsheetLibrary();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    return rechargeSheetRows(workbook).rows;
  }
}

function financeMonthOccupancy(charges = [], mk = '', powerOverride = 0, operationStart = currentWorkOperationStart()) {
  if (!/^\d{4}-\d{2}$/.test(mk)) return { pct: 0, maxKWh: 0, energy: 0, hours: 0 };
  const [year, month] = mk.split('-').map(Number);
  const start = effectiveMonthStart(mk, operationStart);
  const monthAfter = new Date(year, month, 1, 0, 0, 0);
  if (start >= monthAfter) return { pct: 0, maxKWh: 0, energy: 0, hours: 0, power: Number(powerOverride || 0) };
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const chargeDates = charges.flatMap(charge => [charge.endDate, charge.startDate]).filter(Boolean).map(date => new Date(date)).filter(date => !Number.isNaN(date.getTime()));
  const importedEnd = chargeDates.length ? new Date(Math.max(...chargeDates)) : null;
  let end = mk === currentMonth ? (importedEnd || now) : monthAfter;
  if (end < start) end = start;
  if (end > monthAfter) end = monthAfter;
  const hours = Math.max((end - start) / 3_600_000, 0);
  const power = Number(powerOverride || 0);
  const maxKWh = power * hours;
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  return { pct: maxKWh > 0 ? energy / maxKWh * 100 : 0, maxKWh, energy, hours, power };
}

function financeRuleReportItems(result = {}, settings = {}, type = 'cost') {
  const energy = Number(result.energy || 0);
  const planningKWh = Number(result.planning?.planningKWh || 0);
  const details = type === 'cost' ? (result.costRuleDetails || []) : (result.revenueRuleDetails || []);
  const items = details.filter(item => item.enabled !== false).map(item => ({
    id: item.id,
    label: item.isMatrix ? `Matriz UBY - ${item.label || item.id || 'Custo compartilhado'}` : (item.label || item.id || 'Item'),
    rule: financeRuleDisplayValue(item),
    amount: Number(item.actual || 0),
    plannedAmount: Number(item.planned || 0),
    actualPerKWh: energy > 0 ? Number(item.actual || 0) / energy : null,
    plannedPerKWh: planningKWh > 0 ? Number(item.planned || 0) / planningKWh : null
  }));
  if (type === 'revenue') {
    items.unshift({
      id: 'chargingRevenue', label: 'Recargas', rule: 'Base importada', amount: Number(result.revenue || 0),
      plannedAmount: Number(result.planning?.planningRevenue || 0),
      actualPerKWh: energy > 0 ? Number(result.revenue || 0) / energy : null,
      plannedPerKWh: planningKWh > 0 ? Number(result.planning?.planningRevenue || 0) / planningKWh : null
    });
    return items;
  }
  items.unshift({
    id: 'energy', label: 'Energia eletrica', rule: `${fmtBRL(settings.energyCostPerKWh || 0)}/kWh`, amount: Number(result.energyCost || 0),
    plannedAmount: planningKWh * Number(settings.energyCostPerKWh || 0),
    actualPerKWh: Number(settings.energyCostPerKWh || 0), plannedPerKWh: Number(settings.energyCostPerKWh || 0)
  });
  items.push({
    id: 'management', label: 'Gestao P3', rule: `${fmtPct(settings.managementPct || 0)} do faturamento`, amount: Number(result.management || 0),
    plannedAmount: Number(result.planning?.planningRevenue || 0) * Number(settings.managementPct || 0) / 100,
    actualPerKWh: energy > 0 ? Number(result.management || 0) / energy : null,
    plannedPerKWh: planningKWh > 0 ? Number(result.planning?.planningRevenue || 0) * Number(settings.managementPct || 0) / 100 / planningKWh : null
  });
  items.push({
    id: 'platform', label: 'App / plataforma', rule: `${fmtPct(settings.platformPct || 0)} do faturamento`, amount: Number(result.platform || 0),
    plannedAmount: Number(result.planning?.planningRevenue || 0) * Number(settings.platformPct || 0) / 100,
    actualPerKWh: energy > 0 ? Number(result.platform || 0) / energy : null,
    plannedPerKWh: planningKWh > 0 ? Number(result.planning?.planningRevenue || 0) * Number(settings.platformPct || 0) / 100 / planningKWh : null
  });
  if (Number(result.ubyRoyalty || 0) || Number(settings.ubyRoyaltyPct || 0)) {
    items.push({
      id: 'ubyRoyalty', label: 'Royalty de marca UBY', rule: `${fmtPct(settings.ubyRoyaltyPct || 0)} do faturamento`, amount: Number(result.ubyRoyalty || 0),
      plannedAmount: Number(result.planning?.planningRevenue || 0) * Number(settings.ubyRoyaltyPct || 0) / 100,
      actualPerKWh: energy > 0 ? Number(result.ubyRoyalty || 0) / energy : null,
      plannedPerKWh: planningKWh > 0 ? Number(result.planning?.planningRevenue || 0) * Number(settings.ubyRoyaltyPct || 0) / 100 / planningKWh : null
    });
  }
  if (result.areaEligible && (Number(result.areaParticipation || 0) || Number(result.plannedAreaParticipation || 0))) {
    items.push({
      id: 'area', label: 'Parceiro da area', rule: `${fmtPct(result.areaSharePct || 0)} sobre ${settings.ownerTransferMode === 'net' ? 'lucro liquido' : 'faturamento'}`,
      amount: Number(result.areaParticipation || 0), plannedAmount: Number(result.plannedAreaParticipation || 0),
      actualPerKWh: energy > 0 ? Number(result.areaParticipation || 0) / energy : null,
      plannedPerKWh: planningKWh > 0 ? Number(result.plannedAreaParticipation || 0) / planningKWh : null
    });
  }
  return items;
}

function financeInvestorEntry(charges = [], settings = {}, mk = '', options = {}) {
  const result = financeForCharges(charges, settings, { monthKey: mk, historyCharges: options.historyCharges || charges, power: options.power, matrizCostItems: options.matrizCostItems || currentMatrizItems(mk) });
  const occupancy = financeMonthOccupancy(charges, mk, options.power, options.operationStart);
  const clients = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  return {
    key: mk,
    label: monthLabel(mk),
    revenue: Number(result.revenue || 0),
    extraRevenue: Number(result.extraRevenue || 0),
    totalRevenue: Number(result.totalRevenue || 0),
    energy: Number(result.energy || 0),
    charges: charges.length,
    clients,
    maxKWh: occupancy.maxKWh,
    occupancyPct: occupancy.pct,
    targetOccPct: Number(settings.targetOccPct || 0),
    planningKWh: Number(result.planning?.planningKWh || 0),
    totalOperatingCost: Number(result.totalOperatingCost || 0),
    localExtraCosts: Number(result.localExtraCosts || 0),
    matrizCost: Number(result.matrizCost || 0),
    matrizCash: Number(result.matrizCash || 0),
    matrizCostPerKWh: result.matrizCostPerKWh,
    management: Number(result.management || 0),
    ubyRoyalty: Number(result.ubyRoyalty || 0),
    operationNet: Number(result.operationNet || 0),
    operationMargin: Number(result.operationMargin || 0),
    totalCostPerKWh: result.totalCostPerKWh,
    plannedDirectCostPerKWh: result.plannedDirectCostPerKWh,
    plannedTotalCostPerKWh: result.plannedTotalCostPerKWh,
    investmentValue: Number(result.investmentValue || 0),
    paybackInvestmentValue: Number(result.paybackInvestmentValue || result.investmentValue || 0),
    paybackBase: Number(result.paybackBase || 0),
    roiMonthly: Number(result.roiMonthly || 0),
    paybackMonths: Number(result.paybackMonths || 0),
    saRetention: Number(result.saRetention || 0),
    investorDistribution: Number(result.investorDistribution || 0),
    partnerInvestorDistribution: Number(result.partnerInvestorDistribution || 0),
    finalDistribution: Number(result.finalDistribution || result.investorDistribution || 0),
    p3InvestmentValue: Number(result.p3InvestmentValue || 0),
    partnerInvestmentValue: Number(result.partnerInvestmentValue || 0),
    operationModel: result.operationModel || settings.operationModel || 'uby',
    ubyRetained: Number(result.ubyRetained || 0),
    revenueItems: financeRuleReportItems(result, settings, 'revenue'),
    costItems: financeRuleReportItems(result, settings, 'cost'),
    result,
    settings
  };
}

function aggregateInvestorEntries(entries = [], investmentValue = null) {
  const numeric = ['revenue','extraRevenue','totalRevenue','energy','charges','clients','maxKWh','totalOperatingCost','management','ubyRoyalty','operationNet','paybackBase','saRetention','investorDistribution','partnerInvestorDistribution','finalDistribution','ubyRetained','localExtraCosts','matrizCost','matrizCash'];
  const total = numeric.reduce((acc, key) => ({ ...acc, [key]: entries.reduce((sum, entry) => sum + Number(entry[key] || 0), 0) }), {});
  total.occupancyPct = total.maxKWh > 0 ? total.energy / total.maxKWh * 100 : 0;
  total.totalCostPerKWh = total.energy > 0 ? total.totalOperatingCost / total.energy : null;
  total.matrizCostPerKWh = total.energy > 0 ? total.matrizCost / total.energy : null;
  total.operationMargin = total.totalRevenue > 0 ? total.operationNet / total.totalRevenue * 100 : 0;
  total.investmentValue = investmentValue == null ? Number(entries.at(-1)?.investmentValue || 0) : Number(investmentValue || 0);
  total.paybackInvestmentValue = Number(entries.at(-1)?.paybackInvestmentValue || total.investmentValue || 0);
  total.p3InvestmentValue = Number(entries.at(-1)?.p3InvestmentValue || 0);
  total.partnerInvestmentValue = Number(entries.at(-1)?.partnerInvestmentValue || 0);
  total.operationModel = entries.at(-1)?.operationModel || 'uby';
  total.roiMonthly = total.paybackInvestmentValue > 0 ? total.paybackBase / total.paybackInvestmentValue * 100 : 0;
  const averageMonthlyResult = entries.length ? total.paybackBase / entries.length : 0;
  total.paybackMonths = total.paybackInvestmentValue > 0 && averageMonthlyResult > 0 ? total.paybackInvestmentValue / averageMonthlyResult : 0;
  return total;
}

function currentWorkInvestorTimeline(uptoMonth = financeMonthKey(), selectedSettings = null) {
  const available = [...new Set(allCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const firstMonth = available.find(key => key <= uptoMonth) || uptoMonth;
  const operationStart = currentWorkOperationStart();
  return financeMonthSeries(firstMonth, uptoMonth).map(mk => {
    const charges = chargesForMonth(mk);
    const settings = mk === uptoMonth && selectedSettings ? selectedSettings : financeSettingsForMonth(mk);
    return financeInvestorEntry(charges, settings, mk, { historyCharges: allCharges, power: workPowerById(currentWorkId), operationStart });
  });
}

function currentWorkInvestorReportModel(mk = financeMonthKey(), settingsOverride = null) {
  const settings = settingsOverride || currentFinanceSettingsFromInputs();
  const period = financeReportPeriod(mk);
  const timeline = currentWorkInvestorTimeline(mk, settings);
  const current = timeline.find(entry => entry.key === mk) || financeInvestorEntry([], settings, mk, { power: workPowerById(currentWorkId), operationStart: currentWorkOperationStart() });
  const accumulated = aggregateInvestorEntries(timeline, current.investmentValue);
  return {
    report: {
      station: currentStationReportName || currentWorkName,
      work: currentWorkName,
      partnerName: currentWorkPartnerName(),
      period: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      status: monthCanBeClosed(mk) ? 'closed' : 'partial',
      generatedAt: new Date().toLocaleString('pt-BR')
    },
    current,
    accumulated,
    timeline,
    units: [],
    revenueItems: current.revenueItems,
    costItems: current.costItems
  };
}

function ownerAreaEntryForMonth(mk = '', settings = {}) {
  const charges = chargesForMonth(mk);
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const revenue = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const report = ownerAreaReportForSummary({ energy, rev: revenue }, settings, charges);
  return {
    key: mk,
    label: monthLabel(mk),
    revenue: report.revenue,
    energy: report.energy,
    charges: charges.length,
    energyRate: report.energyRate,
    energyCost: report.energyReimbursement,
    transferMode: report.transferMode,
    sharePct: report.selectedSharePct,
    shareBase: report.selectedShareBase,
    areaShare: report.selectedShare,
    partnerTotal: report.ownerTotal,
    notes: settings.ownerAreaNotes || ''
  };
}

function currentWorkOwnerAreaReportModel(mk = financeMonthKey(), settingsOverride = null) {
  const period = financeReportPeriod(mk);
  const available = [...new Set(allCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const firstMonth = available.find(key => key <= mk) || mk;
  const timeline = financeMonthSeries(firstMonth, mk).map(monthKeyValue => ownerAreaEntryForMonth(
    monthKeyValue,
    monthKeyValue === mk && settingsOverride ? settingsOverride : financeSettingsForMonth(monthKeyValue)
  ));
  const current = timeline.find(entry => entry.key === mk) || ownerAreaEntryForMonth(mk, settingsOverride || financeSettingsForMonth(mk));
  const accumulated = timeline.reduce((acc, entry) => {
    ['revenue','energy','charges','energyCost','areaShare','partnerTotal'].forEach(key => { acc[key] = (acc[key] || 0) + Number(entry[key] || 0); });
    return acc;
  }, {});
  return {
    report: {
      station: currentStationReportName || currentWorkName,
      work: currentWorkName,
      period: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      status: monthCanBeClosed(mk) ? 'closed' : 'partial',
      generatedAt: new Date().toLocaleString('pt-BR')
    },
    current,
    accumulated,
    timeline
  };
}

function openFinanceReportDocument(html) {
  if (!window.UBY_FINANCE_REPORTS) return alert('O gerador visual de relatorios nao foi carregado. Atualize a pagina e tente novamente.');
  const popup = window.open('', '_blank');
  if (!popup) return alert('O navegador bloqueou a janela do relatorio. Libere pop-ups para visualizar ou gerar o PDF.');
  popup.document.write(html);
  popup.document.close();
}

function buildFinanceMonthReportSnapshot(mk = financeMonthKey(), settingsOverride = null) {
  const settings = settingsOverride || currentFinanceSettingsFromInputs();
  const charges = chargesForMonth(mk);
  const result = financeForCharges(charges, settings, { monthKey: mk, matrizCostItems: currentMatrizItems(mk) });
  const occupancy = financeMonthOccupancy(charges, mk, workPowerById(currentWorkId), currentWorkOperationStart());
  const summary = monthSummaryForMonth(mk);
  const owner = ownerAreaReportForSummary(summary, settings, charges);
  const clients = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const period = financeReportPeriod(mk);
  return cleanFinanceReportPayload({
    schemaVersion: 2,
    work: { id: currentWorkId, name: currentWorkName, stationName: currentStationReportName || currentWorkName, stationKey: financeChargerStorageKey() },
    period,
    settings,
    metrics: { charges: charges.length, clients, energy: result.energy || 0, revenue: result.totalRevenue || result.revenue || 0, occupancyPct: occupancy.pct, maxKWh: occupancy.maxKWh },
    result,
    owner,
    investorModel: currentWorkInvestorReportModel(mk, settings)
  });
}

function financeMonthReportRecord(mk, status = 'partial', settingsOverride = null) {
  const payload = buildFinanceMonthReportSnapshot(mk, settingsOverride);
  return {
    workId: currentWorkId,
    stationKey: financeChargerStorageKey(),
    stationName: currentStationReportName || currentWorkName,
    reportType: 'charger_financial',
    periodKey: mk,
    periodStart: payload.period.start,
    periodEnd: payload.period.end,
    status,
    payload
  };
}

async function saveCurrentFinanceReport(status = 'partial') {
  const mk = financeMonthKey();
  if (!mk || !currentWorkId) return;
  if (status === 'closed' && !confirm(`Fechar e arquivar o relatorio de ${monthLabel(mk)}? O fechamento preserva esta versao.`)) return;
  persistFinancialSettingsFromInputs(mk);
  await saveFinancialSettingsRecord();
  const saved = await persistFinanceReport(financeMonthReportRecord(mk, status));
  renderIndividualFinanceReportLibrary();
  renderUbyPartnerReportLibrary();
  setStorageState(`${status === 'closed' ? 'Fechamento' : 'Parcial'} de <strong>${monthLabel(mk)}</strong> salvo no historico (versao ${saved.version || 1}).`);
}

async function syncHistoricFinanceReportsForCurrentWork() {
  if (financeHistorySyncPromise || !currentWorkId || !allCharges.length) return financeHistorySyncPromise;
  const contextWorkId = currentWorkId;
  const contextStationKey = financeChargerStorageKey();
  financeHistorySyncPromise = (async () => {
    await loadFinanceReportArchive();
    const todayMonth = new Date().toISOString().slice(0, 7);
    for (const mk of getMonths()) {
      if (currentWorkId !== contextWorkId || financeChargerStorageKey() !== contextStationKey) return;
      const shouldClose = mk < todayMonth || Boolean(monthlyClosings?.[mk]);
      if (!shouldClose) continue;
      const exists = financeReportArchive.some(item => item.workId === contextWorkId && (item.stationKey || '') === contextStationKey && item.reportType === 'charger_financial' && item.periodKey === mk && item.status === 'closed' && Number(item.payload?.schemaVersion || 0) >= 2);
      if (!exists) await persistFinanceReport(financeMonthReportRecord(mk, 'closed', financeSettingsForMonth(mk)));
    }
    renderIndividualFinanceReportLibrary();
  })().catch(err => console.warn('Nao foi possivel completar o historico financeiro:', err)).finally(() => { financeHistorySyncPromise = null; });
  return financeHistorySyncPromise;
}

function reportStatusLabel(status = '') {
  return status === 'closed' ? 'Fechado' : 'Parcial';
}

function financeReportTypeLabel(type = '') {
  if (type === 'partner_area') return 'Dono da area';
  if (type === 'investor') return 'Investidores UBY';
  return 'Financeiro / investidor';
}

function latestReportsByPeriod(rows = []) {
  const byPeriod = new Map();
  sortFinanceReports(rows).forEach(report => {
    const current = byPeriod.get(report.periodKey);
    const preferredType = report.reportType === 'investor' && current?.reportType === 'charger_financial';
    if (!current || preferredType || (report.status === 'closed' && current.status !== 'closed') || (report.status === current.status && report.reportType === current.reportType && Number(report.version || 1) > Number(current.version || 1))) {
      byPeriod.set(report.periodKey, report);
    }
  });
  return [...byPeriod.values()].sort((a, b) => String(a.periodKey).localeCompare(String(b.periodKey)));
}

function latestReportsByTypeAndPeriod(rows = []) {
  const byIdentity = new Map();
  sortFinanceReports(rows).forEach(report => {
    const key = [report.workId, report.stationKey || '', report.reportType, report.periodKey].join('|');
    const current = byIdentity.get(key);
    if (!current || (report.status === 'closed' && current.status !== 'closed') || (report.status === current.status && Number(report.version || 1) > Number(current.version || 1))) {
      byIdentity.set(key, report);
    }
  });
  return sortFinanceReports([...byIdentity.values()]);
}

function partnerAreaArchiveEntry(report = {}) {
  const payload = report.payload || {};
  const result = payload.result || {};
  const settings = payload.settings || {};
  return {
    key: report.periodKey,
    label: payload.period?.label || payload.cycle?.label || report.periodKey,
    revenue: Number(result.revenue || payload.metrics?.revenue || 0),
    energy: Number(result.energy || payload.metrics?.energy || 0),
    charges: Number(result.count || payload.metrics?.charges || 0),
    energyRate: Number(settings.energyRate || settings.ownerEnergyRate || 0),
    energyCost: Number(result.energyCost || result.energyReimbursement || 0),
    transferMode: settings.transferMode || settings.ownerTransferMode || 'gross',
    sharePct: Number(settings.areaSharePct ?? result.selectedSharePct ?? 0),
    shareBase: Number(result.shareBase ?? result.selectedShareBase ?? result.revenue ?? 0),
    areaShare: Number(result.areaShare ?? result.selectedShare ?? 0),
    partnerTotal: Number(result.partnerTotal ?? result.ownerTotal ?? 0),
    notes: settings.notes || ''
  };
}

function archivedPartnerAreaModel(report = {}) {
  const related = latestReportsByPeriod(financeReportArchive.filter(item =>
    item.reportType === 'partner_area' && item.workId === report.workId && (item.stationKey || '') === (report.stationKey || '') && item.periodKey <= report.periodKey
  ));
  if (!related.some(item => String(item.id) === String(report.id))) related.push(report);
  const timeline = latestReportsByPeriod(related).map(partnerAreaArchiveEntry);
  const current = partnerAreaArchiveEntry(report);
  const accumulated = timeline.reduce((acc, entry) => {
    ['revenue','energy','charges','energyCost','areaShare','partnerTotal'].forEach(key => { acc[key] = (acc[key] || 0) + Number(entry[key] || 0); });
    return acc;
  }, {});
  return {
    report: {
      station: report.stationName || report.payload?.work?.stationName || '-',
      work: report.payload?.work?.name || '',
      period: report.payload?.period?.label || report.payload?.cycle?.label || report.periodKey,
      periodStart: report.payload?.period?.start || report.periodStart || '',
      periodEnd: report.payload?.period?.end || report.periodEnd || '',
      status: report.status,
      version: report.version,
      generatedAt: new Date(report.generatedAt || report.updatedAt || Date.now()).toLocaleString('pt-BR')
    },
    current,
    accumulated,
    timeline
  };
}

function investorEntryFromArchivedPayload(report = {}) {
  const payload = report.payload || {};
  if (payload.investorModel?.current) return { ...payload.investorModel.current, key: report.periodKey, label: payload.investorModel.current.label || monthLabel(report.periodKey) };
  const result = payload.result || {};
  const settings = payload.settings || {};
  const metrics = payload.metrics || {};
  const energy = Number(result.energy ?? metrics.energy ?? 0);
  const totalCost = Number(result.totalOperatingCost || 0);
  const totalRevenue = Number(result.totalRevenue ?? metrics.revenue ?? result.revenue ?? 0);
  return {
    key: report.periodKey,
    label: payload.period?.label || monthLabel(report.periodKey),
    revenue: Number(result.revenue ?? metrics.revenue ?? 0),
    extraRevenue: Number(result.extraRevenue || 0),
    totalRevenue,
    energy,
    charges: Number(metrics.charges || 0),
    clients: Number(metrics.clients || 0),
    maxKWh: Number(metrics.maxKWh || 0),
    occupancyPct: Number(metrics.occupancyPct || 0),
    targetOccPct: Number(settings.targetOccPct || 0),
    totalOperatingCost: totalCost,
    operationNet: Number(result.operationNet || 0),
    operationMargin: Number(result.operationMargin ?? (totalRevenue ? Number(result.operationNet || 0) / totalRevenue * 100 : 0)),
    totalCostPerKWh: result.totalCostPerKWh ?? (energy > 0 ? totalCost / energy : null),
    plannedDirectCostPerKWh: result.plannedDirectCostPerKWh,
    plannedTotalCostPerKWh: result.plannedTotalCostPerKWh,
    investmentValue: Number(result.investmentValue ?? settings.investmentValue ?? 0),
    roiMonthly: Number(result.roiMonthly || 0),
    paybackMonths: Number(result.paybackMonths || 0),
    saRetention: Number(result.saRetention || 0),
    investorDistribution: Number(result.investorDistribution || 0),
    ubyRetained: Number(result.ubyRetained || 0),
    revenueItems: financeRuleReportItems(result, settings, 'revenue'),
    costItems: financeRuleReportItems(result, settings, 'cost')
  };
}

function archivedInvestorModel(report = {}) {
  if (report.payload?.investorModel) {
    return {
      ...report.payload.investorModel,
      report: {
        ...(report.payload.investorModel.report || {}),
        station: report.stationName || report.payload?.work?.stationName || report.payload.investorModel.report?.station || '-',
        work: report.payload?.work?.name || report.payload.investorModel.report?.work || '',
        period: report.payload?.period?.label || report.payload.investorModel.report?.period || monthLabel(report.periodKey),
        periodStart: report.payload?.period?.start || report.periodStart || report.payload.investorModel.report?.periodStart || '',
        periodEnd: report.payload?.period?.end || report.periodEnd || report.payload.investorModel.report?.periodEnd || '',
        status: report.status,
        version: report.version,
        generatedAt: new Date(report.generatedAt || report.updatedAt || Date.now()).toLocaleString('pt-BR')
      }
    };
  }
  const relatedTypes = report.reportType === 'investor' ? ['investor'] : ['charger_financial'];
  const related = latestReportsByPeriod(financeReportArchive.filter(item =>
    relatedTypes.includes(item.reportType) && item.workId === report.workId && (item.stationKey || '') === (report.stationKey || '') && item.periodKey <= report.periodKey
  ));
  const timeline = related.map(investorEntryFromArchivedPayload);
  const current = investorEntryFromArchivedPayload(report);
  const accumulated = aggregateInvestorEntries(timeline, current.investmentValue);
  return {
    report: {
      station: report.stationName || report.payload?.work?.stationName || '-',
      work: report.payload?.work?.name || '',
      period: report.payload?.period?.label || monthLabel(report.periodKey),
      periodStart: report.payload?.period?.start || report.periodStart || '',
      periodEnd: report.payload?.period?.end || report.periodEnd || '',
      status: report.status,
      version: report.version,
      generatedAt: new Date(report.generatedAt || report.updatedAt || Date.now()).toLocaleString('pt-BR')
    },
    current,
    accumulated,
    timeline,
    units: report.payload?.units || [],
    revenueItems: current.revenueItems || [],
    costItems: current.costItems || []
  };
}

function reportLibraryCard(report = {}) {
  const payload = report.payload || {};
  const metrics = payload.metrics || payload.result || {};
  const stationName = report.stationName || payload.work?.stationName || payload.work?.name || '-';
  const label = payload.period?.label || payload.cycle?.label || (report.reportType === 'charger_financial' ? monthLabel(report.periodKey) : report.periodKey);
  const revenue = Number(metrics.revenue ?? metrics.totalRevenue ?? payload.result?.revenue ?? 0);
  const energy = Number(metrics.energy ?? payload.result?.energy ?? 0);
  const count = Number(metrics.charges ?? metrics.count ?? payload.result?.count ?? 0);
  const resultValue = report.reportType === 'partner_area' ? Number(payload.result?.partnerTotal || 0) : Number(payload.result?.operationNet ?? payload.investorModel?.current?.operationNet ?? 0);
  const resultLabel = report.reportType === 'partner_area' ? 'Total area' : 'Resultado';
  return `<div class="report-library-card">
    <div class="report-library-main"><strong>${escapeHtml(stationName)}</strong><span>${financeReportTypeLabel(report.reportType)} | ${escapeHtml(label)} | versao ${Number(report.version || 1)}</span><span class="report-status ${report.status}">${reportStatusLabel(report.status)}</span></div>
    <div class="report-library-value"><b>${fmtBRL(revenue)}</b><span>Receita</span></div>
    <div class="report-library-value"><b>${fmtKWh(energy)}</b><span>Energia</span></div>
    <div class="report-library-value optional"><b>${count}</b><span>Recargas</span></div>
    <div class="report-library-value optional"><b>${fmtBRL(resultValue)}</b><span>${resultLabel}</span></div>
    <div class="report-library-actions"><button class="btn-recalc" type="button" onclick="openFinanceReportArchive('${escapeAttr(report.id)}',false)">Visualizar</button><button class="btn-recalc" type="button" onclick="openFinanceReportArchive('${escapeAttr(report.id)}',true)">PDF</button><button class="btn-danger" type="button" onclick="deleteFinanceReportArchive('${escapeAttr(report.id)}')">Excluir</button></div>
  </div>`;
}

function renderIndividualFinanceReportLibrary() {
  const container = document.getElementById('financeReportLibrary');
  if (!container) return;
  if (!financeReportArchiveLoaded) {
    container.innerHTML = '<div class="report-library-empty">Carregando historico financeiro...</div>';
    loadFinanceReportArchive().then(renderIndividualFinanceReportLibrary);
    return;
  }
  const status = document.getElementById('financeReportStatusFilter')?.value || '';
  const stationKey = financeChargerStorageKey();
  const candidates = financeReportArchive.filter(report => ['charger_financial','partner_area','investor'].includes(report.reportType) && report.workId === currentWorkId && (!stationKey || (report.stationKey || '') === stationKey) && (!status || report.status === status));
  const rows = latestReportsByTypeAndPeriod(candidates);
  container.innerHTML = rows.length ? rows.map(reportLibraryCard).join('') : '<div class="report-library-empty">Nenhum relatorio arquivado para esta obra. Os meses anteriores serao preservados automaticamente.</div>';
}

function renderUbyPartnerReportLibrary() {
  const container = document.getElementById('ubyPartnerReportLibrary');
  if (!container) return;
  if (!financeReportArchiveLoaded) {
    container.innerHTML = '<div class="report-library-empty">Carregando historico financeiro...</div>';
    loadFinanceReportArchive().then(renderUbyPartnerReportLibrary);
    return;
  }
  const unitFilter = document.getElementById('ubyReportUnitFilter');
  const status = document.getElementById('ubyReportStatusFilter')?.value || '';
  const type = document.getElementById('ubyReportTypeFilter')?.value || '';
  const allRows = financeReportArchive.filter(report => ['partner_area','investor'].includes(report.reportType));
  if (unitFilter) {
    const current = unitFilter.value;
    const units = [...new Map(allRows.map(report => [report.workId, report.stationName || report.payload?.work?.stationName || report.workId])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
    unitFilter.innerHTML = '<option value="">Todas as unidades</option>' + units.map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join('');
    unitFilter.value = units.some(([id]) => id === current) ? current : '';
  }
  const workId = unitFilter?.value || '';
  const rows = latestReportsByTypeAndPeriod(allRows.filter(report => (!type || report.reportType === type) && (!workId || report.workId === workId) && (!status || report.status === status)));
  container.innerHTML = rows.length ? rows.map(reportLibraryCard).join('') : '<div class="report-library-empty">Ainda nao ha fechamento arquivado com estes filtros.</div>';
}

function openFinanceReportArchive(reportId, printAfter = false) {
  const report = financeReportArchive.find(item => String(item.id) === String(reportId));
  if (!report) return alert('Relatorio nao encontrado no historico carregado.');
  const options = { printAfter };
  const html = report.reportType === 'partner_area'
    ? window.UBY_FINANCE_REPORTS.areaReport(archivedPartnerAreaModel(report), options)
    : window.UBY_FINANCE_REPORTS.investorReport(archivedInvestorModel(report), options);
  openFinanceReportDocument(html);
}

async function deleteFinanceReportArchive(reportId) {
  const report = financeReportArchive.find(item => String(item.id) === String(reportId));
  if (!report) return alert('Relatorio nao encontrado no historico carregado.');
  const confirmed = confirm(`Excluir o relatorio ${financeReportTypeLabel(report.reportType)} de ${report.stationName || 'esta unidade'} (${report.periodKey})?\n\nSomente este relatorio sera removido. Recargas, custos e fechamentos mensais nao serao alterados.`);
  if (!confirmed) return;

  try {
    if (String(report.id || '').startsWith('local-')) {
      financeReportArchive = financeReportArchive.filter(item => String(item.id) !== String(report.id));
      writeLocalFinanceReports(financeReportArchive);
    } else {
      if (!window.UBY_SUPABASE?.deleteFinanceReport) throw new Error('Exclusao de relatorios ainda nao esta disponivel na nuvem. Atualize a pagina e tente novamente.');
      await window.UBY_SUPABASE.deleteFinanceReport(report.id);
      financeReportArchive = financeReportArchive.filter(item => String(item.id) !== String(report.id));
      writeLocalFinanceReports(financeReportArchive);
    }
    renderIndividualFinanceReportLibrary();
    renderUbyPartnerReportLibrary();
    setStorageState('Relatorio removido. Recargas, custos e fechamentos permaneceram preservados.', false);
  } catch (err) {
    console.error('Falha ao excluir relatorio financeiro', err);
    alert(`Nao foi possivel excluir o relatorio: ${err.message || err}`);
  }
}

function financeReportRuleRows(details = [], emptyLabel = 'Nenhum item adicional') {
  const enabled = (details || []).filter(item => item.enabled !== false && Number(item.actual || 0) !== 0);
  if (!enabled.length) return `<tr><td>${emptyLabel}</td><td>-</td><td>${fmtBRL(0)}</td><td>-</td></tr>`;
  return enabled.map(item => `<tr><td>${escapeHtml(item.label || item.id)}</td><td>${escapeHtml(financeRuleDisplayValue(item))}</td><td>${fmtBRL(item.actual || 0)}</td><td>${fmtPerKWh(item.actualPerKWh)}</td></tr>`).join('');
}

function generateCurrentOwnerAreaReport() {
  const mk = financeMonthKey();
  if (!mk) return;
  const settings = currentFinanceSettingsFromInputs();
  persistFinancialSettingsFromInputs(mk);
  saveFinancialSettingsRecord().catch(err => setStorageState(`Relatorio gerado, mas a sincronizacao financeira falhou: ${err.message}`, true));
  const model = currentWorkOwnerAreaReportModel(mk, settings);
  openFinanceReportDocument(window.UBY_FINANCE_REPORTS.areaReport(model, { printAfter: true }));
}

function generateCurrentFinanceReport() {
  const mk = financeMonthKey();
  if (!mk) return;
  const settings = currentFinanceSettingsFromInputs();
  persistFinancialSettingsFromInputs(mk);
  saveFinancialSettingsRecord().catch(err => setStorageState(`Relatorio gerado, mas a sincronizacao financeira falhou: ${err.message}`, true));
  const model = currentWorkInvestorReportModel(mk, settings);
  openFinanceReportDocument(window.UBY_FINANCE_REPORTS.investorReport(model, { printAfter: true }));
}

function generateCurrentFinanceReportLegacy() {
  const mk = financeMonthKey();
  if (!mk) return;
  const popup = window.open('', '_blank');
  if (!popup) {
    alert('O navegador bloqueou a janela do relatorio. Libere pop-ups para gerar o PDF.');
    return;
  }
  const settings = currentFinanceSettingsFromInputs();
  const charges = chargesForMonth(mk);
  const result = financeForCharges(charges, settings, { monthKey: mk, matrizCostItems: currentMatrizItems(mk) });
  const summary = monthSummaryForMonth(mk);
  const owner = ownerAreaReportForSummary(summary, settings, charges);
  const clients = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const resolution = financeMonthResolution(mk);
  const sourceText = resolution.previousMonth ? `Base iniciada a partir de ${monthLabel(resolution.previousMonth)}` : 'Primeira configuracao financeira do ponto';
  persistFinancialSettingsFromInputs(mk);
  saveFinancialSettingsRecord().catch(err => setStorageState(`Relatorio gerado, mas a sincronizacao financeira falhou: ${err.message}`, true));
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Financeiro ${escapeHtml(currentWorkName)} - ${monthLabel(mk)}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#10233b;margin:24px;background:#fff;font-size:12px}h1{font-size:24px;margin:0;color:#0b1d33}h2{font-size:15px;margin:24px 0 8px;color:#1566c0;border-bottom:2px solid #d8e8fa;padding-bottom:7px}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2d7ff9;padding-bottom:16px}.meta{line-height:1.55;color:#496078}.badge{display:inline-block;border:1px solid #8dbcf5;border-radius:999px;padding:5px 9px;color:#1566c0;font-weight:700}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}.metric{background:#f3f7fc;border:1px solid #dbe7f4;border-radius:8px;padding:12px}.metric b{display:block;color:#2d7ff9;font-size:18px}.metric span{display:block;margin-top:4px;color:#5d7188;font-size:9px;text-transform:uppercase}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #dce6f0;text-align:left}th{background:#eaf2fb;color:#1d4f82;text-transform:uppercase;font-size:9px}.total{font-size:18px;font-weight:800;color:#0b1d33;margin-top:16px;padding:12px;background:#eaf2fb;border-left:4px solid #2d7ff9}.note{margin-top:14px;color:#5d7188;line-height:1.5}.actions{margin:16px 0}button{border:0;border-radius:6px;background:#2d7ff9;color:#fff;padding:9px 14px;font-weight:700}@media print{body{margin:12mm}.actions{display:none}.head,.metrics,.metric,tr{break-inside:avoid}}
  </style></head><body>
    <div class="actions"><button onclick="window.print()">Salvar como PDF / imprimir</button></div>
    <div class="head"><div><h1>Relatorio financeiro do carregador</h1><div class="meta"><strong>${escapeHtml(currentStationReportName || currentWorkName)}</strong><br>Obra: ${escapeHtml(currentWorkName)}<br>Competencia: ${monthLabel(mk)}<br>Gerado em ${new Date().toLocaleString('pt-BR')}</div></div><div><span class="badge">${escapeHtml(operationModelLabel(settings.operationModel))}</span><div class="meta" style="margin-top:8px;text-align:right">${escapeHtml(sourceText)}</div></div></div>
    <div class="metrics"><div class="metric"><b>${fmtBRL(result.totalRevenue)}</b><span>Receitas totais</span></div><div class="metric"><b>${fmtKWh(result.energy)}</b><span>Energia vendida</span></div><div class="metric"><b>${charges.length}</b><span>Recargas</span></div><div class="metric"><b>${clients}</b><span>Clientes</span></div></div>
    <h2>Premissas da competencia</h2><table><tbody>
      <tr><td>Custo de energia</td><td>${fmtBRL(settings.energyCostPerKWh)}/kWh</td><td>Gestao P3</td><td>${fmtPct(settings.managementPct)}</td></tr>
      <tr><td>App / plataforma</td><td>${fmtPct(settings.platformPct)}</td><td>Meta de ocupacao</td><td>${fmtPct(settings.targetOccPct)}</td></tr>
      <tr><td>Repasse da area</td><td>${settings.ownerTransferMode === 'net' ? 'Lucro liquido' : 'Faturamento bruto'}</td><td>Percentual da area</td><td>${fmtPct(result.areaSharePct || 0)}</td></tr>
      <tr><td>Base inicial de diluicao</td><td>${fmtKWh(result.planning?.planningKWh || 0)}</td><td>Preco medio vendido</td><td>${fmtPerKWh(result.planning?.salePricePerKWh || 0)}</td></tr>
    </tbody></table>
    <h2>Receitas</h2><table><thead><tr><th>Item</th><th>Regra</th><th>Valor do mes</th><th>R$/kWh</th></tr></thead><tbody>
      <tr><td>Recargas</td><td>Base importada</td><td>${fmtBRL(result.revenue)}</td><td>${fmtPerKWh(result.energy > 0 ? result.revenue / result.energy : null)}</td></tr>${financeReportRuleRows(result.revenueRuleDetails, 'Sem receitas adicionais')}
      <tr><td><strong>Total de receitas</strong></td><td></td><td><strong>${fmtBRL(result.totalRevenue)}</strong></td><td></td></tr>
    </tbody></table>
    <h2>Custos</h2><table><thead><tr><th>Item</th><th>Regra</th><th>Valor do mes</th><th>R$/kWh</th></tr></thead><tbody>
      <tr><td>Energia eletrica</td><td>${fmtBRL(settings.energyCostPerKWh)}/kWh</td><td>${fmtBRL(result.energyCost)}</td><td>${fmtPerKWh(settings.energyCostPerKWh)}</td></tr>${financeReportRuleRows(result.costRuleDetails, 'Sem custos adicionais')}
      <tr><td>Custos da matriz UBY</td><td>Competencia compartilhada</td><td>${fmtBRL(result.matrizCost || 0)}</td><td>${fmtPerKWh(result.matrizCostPerKWh)}</td></tr>
      <tr><td>Parcelas da matriz no caixa</td><td>Pagamento programado</td><td>${fmtBRL(result.matrizCash || 0)}</td><td><small>nao altera a competencia</small></td></tr>
      <tr><td>Gestao P3</td><td>${fmtPct(settings.managementPct)} do faturamento</td><td>${fmtBRL(result.management)}</td><td>${fmtPerKWh(result.energy > 0 ? result.management / result.energy : null)}</td></tr>
      <tr><td>App / plataforma</td><td>${fmtPct(settings.platformPct)} do faturamento</td><td>${fmtBRL(result.platform)}</td><td>${fmtPerKWh(result.energy > 0 ? result.platform / result.energy : null)}</td></tr>
      ${result.areaEligible ? `<tr><td>Participacao da area</td><td>${fmtPct(result.areaSharePct)} sobre ${settings.ownerTransferMode === 'net' ? 'lucro liquido' : 'faturamento'}</td><td>${fmtBRL(result.areaParticipation)}</td><td>${fmtPerKWh(result.energy > 0 ? result.areaParticipation / result.energy : null)}</td></tr>` : ''}
      <tr><td><strong>Total de custos</strong></td><td></td><td><strong>${fmtBRL(result.totalOperatingCost)}</strong></td><td><strong>${fmtPerKWh(result.totalCostPerKWh)}</strong></td></tr>
    </tbody></table>
    <h2>Resultado e prestacao da area</h2><table><tbody>
      <tr><td>Resultado operacional</td><td>${fmtBRL(result.operationNet)}</td><td>Margem operacional</td><td>${fmtPct(result.operationMargin)}</td></tr>
      <tr><td>Custo base planejado por kWh</td><td>${fmtPerKWh(result.plannedDirectCostPerKWh)}</td><td>Custo total projetado por kWh</td><td>${fmtPerKWh(result.plannedTotalCostPerKWh)}</td></tr>
      <tr><td>Custo efetivo por kWh</td><td>${fmtPerKWh(result.totalCostPerKWh)}</td><td></td><td></td></tr>
      <tr><td>Ponto de equilibrio</td><td>${Number.isFinite(result.breakEvenKWh) ? fmtKWh(result.breakEvenKWh) : '-'}</td><td>Resultado por kWh</td><td>${fmtPerKWh(result.resultPerKWh)}</td></tr>
      <tr><td>Reembolso de energia ao parceiro</td><td>${fmtBRL(owner.energyReimbursement)}</td><td>${owner.selectedShareLabel}</td><td>${fmtBRL(owner.selectedShare)}</td></tr>
    </tbody></table>
    <div class="total">Total para o parceiro da area: ${fmtBRL(owner.ownerTotal)}</div>
    <div class="note">Relatorio calculado com os valores salvos especificamente para ${monthLabel(mk)}. Alteracoes em meses futuros nao modificam esta competencia.</div>
    <script>setTimeout(()=>window.print(),350)<\/script>
  </body></html>`);
  popup.document.close();
}

function updateOwnerTransferModeVisibility(mode = 'gross') {
  const isNet = mode === 'net';
  const grossRow = document.getElementById('ownerRevenueShareRow');
  const netRow = document.getElementById('ownerNetProfitShareRow');
  if (grossRow) grossRow.style.display = isNet ? 'none' : '';
  if (netRow) netRow.style.display = isNet ? '' : 'none';
}

function renderFinanceiro(applySaved = true) {
  if (!matrizCostsLoaded) ensureMatrizCostsLoaded().then(() => renderFinanceiro(false)).catch(() => {});
  populateFinanceWorkSelector();
  const months = getMonths();
  const selector = document.getElementById('financeMonthSelector');
  if (selector) {
    const current = selector.value || document.getElementById('monthSelector')?.value || months.at(-1) || '';
    selector.innerHTML = months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    selector.value = months.includes(current) ? current : (months.at(-1) || '');
  }
  const mk = financeMonthKey();
  if (!mk) return;
  if (applySaved) applyFinanceSettingsToInputs(financeSettingsForMonth(mk));
  const settings = currentFinanceSettingsFromInputs();
  financeEditorCurrentSettings = settings;
  updateFinanceModelVisibility(settings.operationModel);
  const charges = chargesForMonth(mk);
  const result = financeForCharges(charges, settings, { monthKey: mk, matrizCostItems: currentMatrizItems(mk) });
  const { revenue, energy, courtesyCharges, courtesyEnergy, courtesyEnergyCost, courtesyCostExcluded, courtesyTreatment, courtesyResponsible, acRevenue, dcRevenue, management, platform, ubyRoyalty, energyCost, extraCosts, extraRevenue, p3AcEquity, p3DcEquity, p3SocietyProfit, p3Gross, operationNet, ubyNet, saRetention, ubyDistributable, investorDistribution, partnerInvestorDistribution, ubyRetained, partnerShare, ownResult, paybackBase, paybackMonths, roiMonthly, margin, p3InvestmentValue, partnerInvestmentValue } = result;
  const target = targetOccupationMetrics(charges, mk, settings);
  const clients = new Set(charges.map(c => c.userEmail || c.userName).filter(Boolean)).size;
  const p3TakePct = revenue ? p3Gross / revenue * 100 : 0;
  const isUbyModel = settings.operationModel === 'uby' || settings.operationModel === 'hybrid';
  const hasP3Society = settings.operationModel === 'p3_society' || settings.operationModel === 'hybrid';
  const isExternalSociety = settings.operationModel === 'p3_society';
  const hasUbyRoyalty = settings.operationModel === 'third_party_management';
  const isDirectPartnerModel = isExternalSociety || settings.operationModel === 'management_only' || hasUbyRoyalty;
  const partnerName = currentWorkPartnerName();
  updateFinanceCommandSummary(result, charges, clients);

  document.getElementById('financeHeroMeta').innerHTML =
    `Ponto: <strong>${currentWorkName}</strong><br>Mes: <strong>${monthLabel(mk)}</strong><br>${charges.length} recarga(s), ${clients} cliente(s), ${fmtKWh(energy)}${courtesyCharges ? `<br><span style="color:#FFD66B">${courtesyCharges} cortesia(s): ${fmtKWh(courtesyEnergy)}</span>` : ''}`;
  document.getElementById('financeFormula').innerHTML =
    `<strong>${operationModelLabel(settings.operationModel)}</strong><br>P3: gestao ${settings.managementPct}%${hasUbyRoyalty ? ` | UBY: royalty de marca ${settings.ubyRoyaltyPct}%` : ''}. App/plataforma de terceiros ${settings.platformPct}%.<br>Meta ocupacao: ${fmtPct(target.targetOccPct)} | real ${fmtPct(target.realOccPct)}<br><strong style="color:#57B7FF">Payback: ${formatPaybackMonths(paybackMonths)}</strong>`;

  document.getElementById('financeKpis').innerHTML = [
    `<div class="card"><div class="label">Receita do mes</div><div class="value">${fmtBRL(revenue)}</div><div class="sub">${charges.length} recarga(s)</div></div>`,
    courtesyCharges ? `<div class="card"><div class="label">Beneficio do parceiro</div><div class="value">${fmtKWh(courtesyEnergy)}</div><div class="sub">${courtesyCostExcluded ? `${fmtBRL(courtesyCostExcluded)} absorvido por ${escapeHtml(courtesyResponsible || 'parceiro local')}` : 'registrado sem alterar o resultado'}</div></div>` : '',
    `<div class="card"><div class="label">Receita P3</div><div class="value">${fmtBRL(p3Gross)}</div><div class="sub">gestao${hasP3Society ? ' + sociedades' : ''}</div></div>`,
    hasUbyRoyalty ? `<div class="card"><div class="label">Royalty UBY</div><div class="value">${fmtBRL(ubyRoyalty)}</div><div class="sub">${settings.ubyRoyaltyPct}% pela utilizacao da marca</div></div>` : '',
    isUbyModel ? `<div class="card"><div class="label">Resultado UBY</div><div class="value">${fmtBRL(ubyNet)}</div><div class="sub">apos energia, custos e P3</div></div>` : '',
    hasP3Society ? `<div class="card"><div class="label">Resultado P3 na sociedade</div><div class="value">${fmtBRL(p3SocietyProfit)}</div><div class="sub">${isExternalSociety ? `${settings.p3SocietyPct}% do resultado da parceria` : 'participacao configurada em AC/DC'}</div></div>` : '',
    isDirectPartnerModel ? `<div class="card"><div class="label">${(settings.operationModel === 'management_only' || hasUbyRoyalty) ? `Lucro distribuido ${partnerName}` : `Distribuicao ${partnerName}`}</div><div class="value">${fmtBRL(partnerInvestorDistribution)}</div><div class="sub">${(settings.operationModel === 'management_only' || hasUbyRoyalty) ? 'resultado liquido pago diretamente ao parceiro' : `${Math.max(100 - Number(settings.p3SocietyPct || 0), 0)}% do resultado da parceria`}</div></div>` : '',
    isUbyModel ? `<div class="card"><div class="label">Retencao S.A.</div><div class="value">${fmtBRL(saRetention)}</div><div class="sub">${settings.saRetentionPct}% do lucro liquido UBY</div></div>` : '',
    isUbyModel ? `<div class="card"><div class="label">Investidores UBY</div><div class="value">${fmtBRL(investorDistribution)}</div><div class="sub">${settings.investorQuotaPct}% de ${fmtBRL(ubyDistributable)}</div></div>` : '',
    `<div class="card"><div class="label">Payback</div><div class="value">${formatPaybackMonths(paybackMonths)}</div><div class="sub">investimento / resultado proprio</div></div>`,
    `<div class="card"><div class="label">ROI mensal</div><div class="value">${fmtPct(roiMonthly)}</div><div class="bar"><span style="width:${Math.min(Math.max(roiMonthly,0),100).toFixed(1)}%"></span></div><div class="sub">resultado proprio / investimento</div></div>`,
    `<div class="card"><div class="label">Meta ocupacao</div><div class="value">${fmtPct(target.targetOccPct)}</div><div class="sub">real ${fmtPct(target.realOccPct)} | falta ${fmtPct(target.targetOccPct - target.realOccPct)}</div></div>`,
    `<div class="card"><div class="label">Faturamento pretendido</div><div class="value">${fmtBRL(target.targetRevenue)}</div><div class="sub">periodo atual | mes cheio ${fmtBRL(target.fullMonthTargetRevenue)}</div></div>`
  ].filter(Boolean).join('');
  document.getElementById('financeDistributionTable').innerHTML = [
    `<tr><td>Modelo da operacao</td><td>${operationModelLabel(settings.operationModel)}</td></tr>`,
    `<tr><td>Receita total</td><td>${fmtBRL(revenue)}</td></tr>`,
    `<tr><td>Receita AC</td><td>${fmtBRL(acRevenue)}</td></tr>`,
    `<tr><td>Receita DC</td><td>${fmtBRL(dcRevenue)}</td></tr>`,
    courtesyCharges ? `<tr><td>Cortesia ${courtesyResponsible ? `— ${escapeHtml(courtesyResponsible)}` : 'do parceiro'}</td><td>${fmtKWh(courtesyEnergy)}${courtesyCostExcluded ? ` · ${fmtBRL(courtesyCostExcluded)} fora do resultado UBY` : ''}</td></tr>` : '',
    `<tr><td>Gestao P3 (${settings.managementPct}%)</td><td>${fmtBRL(management)}</td></tr>`,
    hasUbyRoyalty ? `<tr><td>Royalty de marca UBY (${settings.ubyRoyaltyPct}%)</td><td>${fmtBRL(ubyRoyalty)}</td></tr>` : '',
    `<tr><td>App/plataforma terceiros (${settings.platformPct}%)</td><td>${fmtBRL(platform)}</td></tr>`,
    result.areaEligible ? `<tr><td>Participacao da area (${result.areaSharePct}%)</td><td>${fmtBRL(result.areaParticipation)}</td></tr>` : '',
    settings.operationModel === 'hybrid' ? `<tr><td>Sociedade P3 em AC (${settings.p3AcEquityPct}%)</td><td>${fmtBRL(p3AcEquity)}</td></tr>` : '',
    settings.operationModel === 'hybrid' ? `<tr><td>Sociedade P3 em DC (${settings.p3DcEquityPct}%)</td><td>${fmtBRL(p3DcEquity)}</td></tr>` : '',
    settings.operationModel === 'p3_society' ? `<tr><td>Resultado P3 na sociedade (${settings.p3SocietyPct}%)</td><td>${fmtBRL(p3SocietyProfit)}</td></tr>` : '',
    isDirectPartnerModel ? `<tr><td>${(settings.operationModel === 'management_only' || hasUbyRoyalty) ? `Lucro distribuido diretamente ao parceiro ${partnerName}` : `Distribuicao ao socio investidor ${partnerName} (${Math.max(100 - Number(settings.p3SocietyPct || 0), 0)}%)`}</td><td>${fmtBRL(partnerInvestorDistribution)}</td></tr>` : '',
    `<tr><td>Receitas extras</td><td>${fmtBRL(extraRevenue)}</td></tr>`,
    `<tr><td>Resultado operacional apos custos</td><td>${fmtBRL(operationNet)}</td></tr>`,
    `<tr><td>Percentual P3 bruto</td><td>${fmtPct(p3TakePct)}</td></tr>`,
    `<tr><td>Ocupacao real x objetivo</td><td>${fmtPct(target.realOccPct)} / ${fmtPct(target.targetOccPct)}</td></tr>`,
    `<tr><td>kWh pretendido ate o periodo</td><td>${fmtKWh(target.targetEnergy)}</td></tr>`,
    `<tr><td>Faturamento pretendido ate o periodo</td><td>${fmtBRL(target.targetRevenue)}</td></tr>`,
    `<tr><td>Recargas pretendidas ate o periodo</td><td>${target.targetCharges.toFixed(1).replace('.', ',')}</td></tr>`,
    `<tr><td>kWh pretendido mes completo</td><td>${fmtKWh(target.fullMonthTargetEnergy)}</td></tr>`,
    `<tr><td>Faturamento pretendido mes completo</td><td>${fmtBRL(target.fullMonthTargetRevenue)}</td></tr>`,
    `<tr><td>Recargas pretendidas mes completo</td><td>${target.fullMonthTargetCharges.toFixed(1).replace('.', ',')}</td></tr>`
  ].filter(Boolean).join('');
  document.getElementById('financeResultTable').innerHTML = [
    `<tr><td>Investimento total no ponto</td><td>${fmtBRL(settings.investmentValue)}</td></tr>`,
    isExternalSociety ? `<tr><td>Aporte P3 (${settings.p3SocietyPct}%)</td><td>${fmtBRL(p3InvestmentValue)}</td></tr>` : '',
    isExternalSociety ? `<tr><td>Aporte ${partnerName} (${Math.max(100 - Number(settings.p3SocietyPct || 0), 0)}%)</td><td>${fmtBRL(partnerInvestmentValue)}</td></tr>` : '',
    `<tr><td>Receita P3</td><td>${fmtBRL(p3Gross)}</td></tr>`,
    hasUbyRoyalty ? `<tr><td>Royalty de marca UBY</td><td>${fmtBRL(ubyRoyalty)}</td></tr>` : '',
    `<tr><td>App/plataforma terceiros</td><td>${fmtBRL(platform)}</td></tr>`,
    `<tr><td>Custo de energia</td><td>${fmtBRL(energyCost)}</td></tr>`,
    courtesyCharges ? `<tr><td>Energia de cortesia (memória)</td><td>${fmtKWh(courtesyEnergy)} · ${fmtBRL(courtesyEnergyCost)}${courtesyTreatment === 'partner_absorbed' ? ' — absorvida pelo parceiro, fora do resultado UBY' : ''}</td></tr>` : '',
    result.areaEligible ? `<tr><td>Participacao do parceiro da area</td><td>${fmtBRL(result.areaParticipation)}</td></tr>` : '',
    `<tr><td>Custos operacionais cadastrados</td><td>${fmtBRL(extraCosts)}</td></tr>`,
    `<tr><td>Custo operacional total</td><td>${fmtBRL(result.totalOperatingCost)}</td></tr>`,
    `<tr><td>Custo base planejado por kWh</td><td>${fmtPerKWh(result.plannedDirectCostPerKWh)}</td></tr>`,
    `<tr><td>Custo total projetado por kWh</td><td>${fmtPerKWh(result.plannedTotalCostPerKWh)}</td></tr>`,
    `<tr><td>Custo efetivo por kWh</td><td>${fmtPerKWh(result.totalCostPerKWh)}</td></tr>`,
    `<tr><td>Ponto de equilibrio</td><td>${Number.isFinite(result.breakEvenKWh) ? fmtKWh(result.breakEvenKWh) : '-'}</td></tr>`,
    hasP3Society ? `<tr><td>Resultado P3 na sociedade</td><td>${fmtBRL(p3SocietyProfit)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Resultado liquido UBY</td><td>${fmtBRL(ubyNet)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Retencao obrigatoria S.A.</td><td>${fmtBRL(saRetention)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Base distribuivel UBY</td><td>${fmtBRL(ubyDistributable)}</td></tr>` : '',
    partnerShare ? `<tr><td>Resultado socio/local</td><td>${fmtBRL(partnerShare)}</td></tr>` : '',
    isDirectPartnerModel ? `<tr><td>${(settings.operationModel === 'management_only' || hasUbyRoyalty) ? `Lucro distribuido diretamente ao parceiro ${partnerName}` : `Distribuicao ao socio investidor ${partnerName}`}</td><td>${fmtBRL(partnerInvestorDistribution)}</td></tr>` : '',
    `<tr><td>Resultado proprio para payback</td><td>${fmtBRL(paybackBase)}</td></tr>`,
    `<tr><td>Resultado proprio total</td><td>${fmtBRL(ownResult)}</td></tr>`,
    isUbyModel ? `<tr><td>Repasse investidores</td><td>${fmtBRL(investorDistribution)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Retido UBY</td><td>${fmtBRL(ubyRetained)}</td></tr>` : '',
    `<tr><td>Payback estimado</td><td>${formatPaybackMonths(paybackMonths)}</td></tr>`,
    isUbyModel ? `<tr><td>Margem UBY</td><td>${fmtPct(margin)}</td></tr>` : ''
  ].filter(Boolean).join('');
  document.getElementById('financeNote').innerHTML =
    isUbyModel
      ? `Neste modelo, a P3 recebe ${fmtBRL(p3Gross)} no mes. O app/plataforma fica separado como servico de terceiros (${fmtBRL(platform)}) e o parceiro da area recebe ${fmtBRL(result.areaParticipation)} conforme a regra cadastrada. A UBY fica com ${fmtBRL(ubyNet)} antes da retencao S.A.; ${fmtBRL(saRetention)} ficam retidos por estatuto e ${fmtBRL(investorDistribution)} sao distribuiveis aos investidores. Meta ate o periodo: ${fmtKWh(target.targetEnergy)} e ${fmtBRL(target.targetRevenue)}. Meta mes completo: ${fmtKWh(target.fullMonthTargetEnergy)} e ${fmtBRL(target.fullMonthTargetRevenue)}.`
      : settings.operationModel === 'management_only'
        ? `Neste modelo, a P3 recebe ${fmtBRL(p3Gross)} pela gestao. Depois de energia, plataforma e demais custos, o lucro liquido de ${fmtBRL(partnerInvestorDistribution)} e distribuido diretamente para ${partnerName}. Esse pagamento e registrado como distribuicao do parceiro; o payback da P3 continua baseado somente na sua receita de gestao.`
        : hasUbyRoyalty
          ? `Neste ativo de terceiro, a P3 recebe ${fmtBRL(management)} pela gestao (${settings.managementPct}%) e a UBY recebe ${fmtBRL(ubyRoyalty)} pelo uso da marca (${settings.ubyRoyaltyPct}%). Depois de energia, plataforma e demais custos, ${fmtBRL(partnerInvestorDistribution)} sao distribuidos diretamente para ${partnerName}. A plataforma de terceiros permanece separada em ${fmtBRL(platform)}.`
        : `Nesta parceria, o investimento total e ${fmtBRL(settings.investmentValue)}: P3 aportou ${fmtBRL(p3InvestmentValue)} (${settings.p3SocietyPct}%) e ${partnerName} aportou ${fmtBRL(partnerInvestmentValue)} (${Math.max(100 - Number(settings.p3SocietyPct || 0), 0)}%). O resultado apos custos e dividido na mesma proporcao: P3 recebe ${fmtBRL(p3SocietyProfit)} e ${partnerName} recebe ${fmtBRL(partnerInvestorDistribution)} como distribuicao do periodo. O payback considera somente o aporte da P3. Meta ate o periodo: ${fmtKWh(target.targetEnergy)} e ${fmtBRL(target.targetRevenue)}. Meta mes completo: ${fmtKWh(target.fullMonthTargetEnergy)} e ${fmtBRL(target.fullMonthTargetRevenue)}.`;
  updateFinanceRuleOutputs(result);
  renderFinanceOperationalResults(result);
  renderOwnerAreaReportForCurrentMonth();
  renderFinanceMonthVersionState(settings);
  showFinancePanel(document.getElementById('financePanelSelector')?.value || 'overview');
  renderIndividualFinanceReportLibrary();
  syncHistoricFinanceReportsForCurrentWork();
}

function updateFinanceModelVisibility(model = 'uby') {
  document.querySelectorAll('.finance-model-row').forEach(row => {
    const models = String(row.dataset.models || '').split(/\s+/).filter(Boolean);
    row.style.display = models.includes(model) ? '' : 'none';
  });
}

async function saveFinancialSettings() {
  await flushPendingFinancialSettingsSave();
  const mk = financeMonthKey();
  if (!mk) return;
  persistFinancialSettingsFromInputs(mk);
  renderFinanceiro(false);
  setFeedback(`Financeiro de ${monthLabel(mk)} salvo para ${currentWorkName}.`, 'up-loading');
  await saveFinancialSettingsRecord();
}

function persistFinancialSettingsFromInputs(mk = financeMonthKey(), inheritedFromOverride = '') {
  if (!mk) return null;
  const resolutionBeforeSave = financeMonthResolution(mk);
  const exactBeforeSave = financeExactSettingsForMonth(mk);
  const previousMeta = exactBeforeSave.periodMeta || {};
  const now = new Date().toISOString();
  const settings = currentFinanceSettingsFromInputs();
  settings.periodMeta = {
    ...previousMeta,
    month: mk,
    inheritedFrom: inheritedFromOverride || previousMeta.inheritedFrom || resolutionBeforeSave.previousMonth || '',
    createdAt: previousMeta.createdAt || now,
    updatedAt: now
  };
  const scopeKey = financeChargerStorageKey();
  if (scopeKey) {
    const chargers = { ...(financialSettings.chargers || {}) };
    const scoped = { ...(chargers[scopeKey] || {}), [mk]: settings };
    const latestMonth = window.UBY_FINANCE_ENGINE.monthKeys(scoped).at(-1) || mk;
    if (!scoped.default || mk === latestMonth) scoped.default = settings;
    chargers[scopeKey] = scoped;
    financialSettings = { ...financialSettings, chargers };
  } else {
    const updated = { ...financialSettings, [mk]: settings };
    const latestMonth = window.UBY_FINANCE_ENGINE.monthKeys(updated).at(-1) || mk;
    if (!updated.default || mk === latestMonth) updated.default = settings;
    financialSettings = updated;
  }
  financeEditorCurrentSettings = settings;
  return settings;
}

function financeRecordWithCurrentSettings() {
  const source = allRechargeRecords[currentWorkId] || localRecord();
  const sourceHasFullCharges = Array.isArray(source?.charges) && source.charges.length > 0;
  const sourceExpectedCharges = Number(source?.summary?.charges || 0);
  if (currentStationReportName && sourceExpectedCharges > 0 && !sourceHasFullCharges) {
    throw new Error('A base completa da obra ainda nao terminou de carregar. Aguarde e tente novamente.');
  }
  if (!currentStationReportName && (!source || (!sourceHasFullCharges && allCharges.length))) {
    return buildRechargeRecord();
  }
  if (!source) return buildRechargeRecord();
  const updatedAt = new Date().toISOString();
  return {
    ...source,
    workId: currentWorkId,
    workName: source.workName || currentWorkName,
    financialSettings,
    summary: {
      ...(source.summary || {}),
      workId: currentWorkId,
      workName: source.summary?.workName || source.workName || currentWorkName,
      financialSettings,
      updatedAt
    },
    updatedAt,
    localCompact: false
  };
}

async function saveFinancialSettingsRecord(workId = currentWorkId, recordOverride = null) {
  const targetWorkId = String(workId || currentWorkId || '');
  const record = recordOverride || financeRecordWithCurrentSettings();
  if (!targetWorkId || !record) return { mode: 'skipped-empty' };
  record.workId = targetWorkId;
  record.metadataType = 'financial_settings';
  record.summary = {
    ...(record.summary || {}),
    workId: targetWorkId,
    financialSettings: record.financialSettings || financialSettings,
    updatedAt: record.updatedAt || new Date().toISOString()
  };
  const localSave = saveLocalRechargeRecordFor(targetWorkId, record);
  if (window.UBY_SUPABASE?.saveRechargeMetadata) {
    await window.UBY_SUPABASE.saveRechargeMetadata(targetWorkId, record);
  }
  return localSave;
}

function financeSaveSnapshot(monthKey = financeMonthKey()) {
  const targetWorkId = String(currentWorkId || '');
  if (!targetWorkId || !monthKey) return null;
  persistFinancialSettingsFromInputs(monthKey);
  const record = financeRecordWithCurrentSettings();
  record.metadataType = 'financial_settings';
  return {
    workId: targetWorkId,
    monthKey,
    workName: currentWorkName,
    record: JSON.parse(JSON.stringify(record))
  };
}

function queueFinancialSettingsSave(snapshot) {
  if (!snapshot?.workId || !snapshot?.record) return financeSaveInFlight;
  financeSaveInFlight = financeSaveInFlight
    .catch(() => null)
    .then(() => saveFinancialSettingsRecord(snapshot.workId, snapshot.record));
  return financeSaveInFlight;
}

async function commitPendingFinancialSettingsSave() {
  if (financeSaveTimer) {
    clearTimeout(financeSaveTimer);
    financeSaveTimer = null;
  }
  const snapshot = financePendingSave;
  financePendingSave = null;
  if (!snapshot) return financeSaveInFlight;
  try {
    await queueFinancialSettingsSave(snapshot);
    if (String(currentWorkId) === String(snapshot.workId)) {
      setStorageState(`Financeiro de ${monthLabel(snapshot.monthKey)} salvo automaticamente para <strong>${snapshot.workName}</strong>.`);
      renderFinanceMonthVersionState(financeEditorCurrentSettings);
      renderGeneralFinance(getGeneralUnitData());
    }
  } catch (err) {
    setStorageState(`Financeiro local salvo. Falha ao sincronizar: ${err.message}`, true);
    throw err;
  }
}

async function flushPendingFinancialSettingsSave() {
  try {
    await commitPendingFinancialSettingsSave();
  } catch (_) {
    // The immediate local snapshot remains available; navigation must not lock.
  }
}

function scheduleFinancialSettingsSave() {
  const mk = financeMonthKey();
  if (!mk || !currentWorkId) return;
  let snapshot;
  try {
    snapshot = financeSaveSnapshot(mk);
  } catch (err) {
    setStorageState(`Nao foi possivel salvar agora: ${err.message}`, true);
    return;
  }
  if (!snapshot) return;
  const settings = financeEditorCurrentSettings;
  // Local persistence is synchronous from the user's perspective. Cloud sync
  // is queued after the short debounce and cannot be redirected to another obra.
  saveLocalRechargeRecordFor(snapshot.workId, snapshot.record);
  financePendingSave = snapshot;
  renderFinanceMonthVersionState(settings);
  const savedLabel = document.getElementById('financeVersionSaved');
  if (savedLabel) savedLabel.textContent = 'Salvando...';
  clearTimeout(financeSaveTimer);
  financeSaveTimer = setTimeout(() => { commitPendingFinancialSettingsSave(); }, 500);
}

function formatPaybackMonths(months) {
  if (!Number.isFinite(months) || months <= 0) return '-';
  if (months >= 1200) return '> 100 anos';
  return `${months.toFixed(1).replace('.', ',')} meses`;
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

function financeRuleAmount(rule = {}, context = {}, planned = false) {
  return window.UBY_FINANCE_ENGINE.ruleAmount(rule, context, planned);
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

function fmtPerKWh(value) {
  return Number.isFinite(value) ? `${fmtBRL(value)}/kWh` : '-';
}

function updateFinanceRuleOutputs(result = {}) {
  const planning = result.planning || {};
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('financePlanningKWhResolved', fmtKWh(planning.planningKWh || 0));
  setText('financePlanningKWhSource', planning.source || 'Defina uma base planejada.');
  setText('financeSalePriceKWh', fmtPerKWh(planning.salePricePerKWh || 0));
  setText('financeActualKWh', fmtKWh(planning.energy || 0));
  setText('financeEnergyRuleValue', `${fmtBRL(result.energyRate || 0)}/kWh`);

  const energyActual = document.querySelector('[data-finance-energy-actual]');
  const energyPlanned = document.querySelector('[data-finance-energy-planned-kwh]');
  const energyPerKWh = document.querySelector('[data-finance-energy-actual-kwh]');
  if (energyActual) energyActual.textContent = fmtBRL(result.energyCost || 0);
  if (energyPlanned) energyPlanned.textContent = fmtPerKWh(result.energyRate || 0);
  if (energyPerKWh) energyPerKWh.textContent = fmtPerKWh(result.energyRate || 0);

  const renderDetails = (kind, details = []) => {
    const byId = new Map(details.map(item => [String(item.id), item]));
    document.querySelectorAll(`tr[data-finance-rule-kind="${kind}"]`).forEach(row => {
      const item = byId.get(String(row.dataset.ruleId || ''));
      if (!item) return;
      const actual = row.querySelector('[data-rule-output="actual"]');
      const planned = row.querySelector('[data-rule-output="planned-kwh"]');
      const actualKWh = row.querySelector('[data-rule-output="actual-kwh"]');
      if (actual) actual.textContent = fmtBRL(item.actual || 0);
      if (planned) planned.textContent = item.scope === 'non_operational' ? '—' : fmtPerKWh(item.plannedPerKWh);
      if (actualKWh) actualKWh.textContent = item.scope === 'non_operational' ? '—' : fmtPerKWh(item.actualPerKWh);
    });
  };
  renderDetails('cost', result.costRuleDetails);
  renderDetails('revenue', result.revenueRuleDetails);

  const costTotal = document.getElementById('financeCostRuleTotals');
  if (costTotal) {
    const localCost = Number(result.energyCost || 0) + Number(result.localExtraCosts || 0);
    const localPerKWh = Number(result.energy || 0) > 0 ? localCost / Number(result.energy || 0) : null;
    costTotal.innerHTML = `
      <tr><td colspan="4">Custos diretos locais (energia + itens)</td><td>${fmtBRL(localCost)}</td><td>-</td><td>${fmtPerKWh(localPerKWh)}</td><td></td><td></td><td></td></tr>
      <tr class="finance-matrix-total"><td colspan="4">Rateio da matriz UBY (competencia${Number(result.matrizCash || 0) ? ` | caixa ${fmtBRL(result.matrizCash)}` : ''})</td><td>${fmtBRL(result.matrizCost || 0)}</td><td>${fmtPerKWh(result.plannedMatrizCostPerKWh)}</td><td>${fmtPerKWh(result.matrizCostPerKWh)}</td><td></td><td></td><td></td></tr>
      <tr><td colspan="4">Custos diretos totais</td><td>${fmtBRL(localCost + Number(result.matrizCost || 0))}</td><td>${fmtPerKWh(result.plannedDirectCostPerKWh)}</td><td>${fmtPerKWh(result.directCostPerKWh)}</td><td></td><td></td><td></td></tr>`;
  }
  const revenueTotal = document.getElementById('financeRevenueRuleTotals');
  if (revenueTotal) revenueTotal.innerHTML = `
    <tr><td colspan="4">Receitas operacionais complementares</td><td>${fmtBRL(result.extraRevenue || 0)}</td><td>${fmtPerKWh(result.plannedExtraRevenuePerKWh)}</td><td>${fmtPerKWh(result.extraRevenuePerKWh)}</td><td></td><td></td><td></td></tr>
    <tr class="finance-matrix-total"><td colspan="4">Marketing / contratos (fechamento mensal; fora das métricas de recarga)</td><td>${fmtBRL(result.marketingRevenue || 0)}</td><td>—</td><td>—</td><td></td><td></td><td></td></tr>`;

  const guidance = document.getElementById('financePlanningGuidance');
  if (guidance) {
    guidance.style.display = planning.planningKWh > 0 ? 'none' : 'block';
    guidance.textContent = 'Informe a base inicial de kWh ou defina a meta de ocupacao para calcular o custo de partida antes da primeira venda.';
  }
}

function renderFinanceOperationalResults(result = {}) {
  const container = document.getElementById('financeOperationalResults');
  if (!container) return;
  if (normalizeOperationModel(result.operationModel) === 'third_party_management') {
    container.classList.add('finance-result-stages');
    container.innerHTML = `
      <section class="finance-result-stage finance-result-stage--actual">
        <div class="finance-result-stage-head"><h3>Operação parceira · prestação de contas</h3><p>Este ativo não compõe custos, margem, payback ou resultado da matriz UBY.</p></div>
        <div class="finance-result-stage-grid">
          <div class="finance-result-card"><span>Faturamento do parceiro</span><strong>${fmtBRL(result.revenue || 0)}</strong><small>referência operacional do ponto</small></div>
          <div class="finance-result-card"><span>Gestão P3</span><strong>${fmtBRL(result.management || 0)}</strong><small>receita de gestão contratada</small></div>
          <div class="finance-result-card good is-primary"><span>Receita UBY · royalty</span><strong>${fmtBRL(result.ubyRoyalty || 0)}</strong><small>única receita da UBY neste ativo</small></div>
          <div class="finance-result-card is-reference"><span>Resultado UBY</span><strong>Não aplicável</strong><small>custos e consumo, inclusive cortesias, pertencem ao parceiro</small></div>
        </div>
      </section>`;
    return;
  }
  const resultClass = result.operationNet > 0 ? 'good' : (result.operationNet < 0 ? 'bad' : 'warn');
  const marginClass = result.margin >= 20 ? 'good' : (result.margin >= 0 ? 'warn' : 'bad');
  const energyCost = Number(result.energyCost || 0);
  const localCosts = Number(result.localExtraCosts || 0);
  const matrixCost = Number(result.matrizCost || 0);
  const management = Number(result.management || 0);
  const platform = Number(result.platform || 0);
  const royalty = Number(result.ubyRoyalty || 0);
  const areaParticipation = Number(result.areaParticipation || 0);
  const directBaseCost = energyCost + localCosts + matrixCost;
  const distributionCost = management + platform + royalty + areaParticipation;
  const matrizDetails = (result.costRuleDetails || [])
    .filter(item => (item?.isMatrix || String(item?.id || '').startsWith('matriz-')) && Number(item?.actual || 0) > 0)
    .map(item => `${item.label}: ${fmtBRL(item.actual)} (${fmtPerKWh(item.actualPerKWh)})`);
  const matrizSub = matrizDetails.length
    ? matrizDetails.join(' | ')
    : 'nenhum custo compartilhado rateado nesta competencia';
  container.classList.add('finance-result-stages');
  container.innerHTML = `
    <section class="finance-result-stage">
      <div class="finance-result-stage-head"><h3>1. Custos base da operacao</h3><p>Energia, custos da unidade e rateio da matriz.</p></div>
      <div class="finance-result-stage-grid">
        <div class="finance-result-card"><span>Energia eletrica comercial</span><strong>${fmtBRL(energyCost)}</strong><small>${fmtPerKWh(result.energyRate || 0)} aplicado aos ${fmtKWh(result.commercialEnergy || result.energy || 0)} comercialmente elegíveis</small></div>
        ${result.courtesyCharges ? `<div class="finance-result-card is-reference"><span>Benefício do parceiro</span><strong>${fmtKWh(result.courtesyEnergy)}</strong><small>${fmtBRL(result.courtesyEnergyCost)} de energia de cortesia${result.courtesyCostExcluded ? ' fora do resultado UBY' : ''}</small></div>` : ''}
        <div class="finance-result-card"><span>Custos da unidade</span><strong>${fmtBRL(localCosts)}</strong><small>itens operacionais exclusivos deste carregador</small></div>
        <div class="finance-result-card"><span>Custos da matriz UBY</span><strong>${fmtBRL(matrixCost)}</strong><small>${fmtPerKWh(result.matrizCostPerKWh)} do custo por kWh | ${fmtPct(result.matrizCostRevenuePct || 0)} da receita</small><small>${escapeHtml(matrizSub)}</small></div>
        <div class="finance-result-card is-reference"><span>Base planejada por kWh</span><strong>${fmtPerKWh(result.plannedDirectCostPerKWh)}</strong><small>energia, unidade e matriz sobre ${fmtKWh(result.planning?.planningKWh || 0)} planejados</small></div>
      </div>
    </section>
    <section class="finance-result-stage">
      <div class="finance-result-stage-head"><h3>2. Gestao, plataforma e repasses</h3><p>Custos e distribuicoes calculados sobre a regra comercial do ponto.</p></div>
      <div class="finance-result-stage-grid">
        <div class="finance-result-card"><span>Gestao P3</span><strong>${fmtBRL(management)}</strong><small>percentual de gestao sobre o faturamento</small></div>
        <div class="finance-result-card"><span>App / plataforma</span><strong>${fmtBRL(platform)}</strong><small>servico de terceiros sobre o faturamento</small></div>
        ${royalty > 0 ? `<div class="finance-result-card"><span>Royalty de marca UBY</span><strong>${fmtBRL(royalty)}</strong><small>uso da marca no modelo comercial selecionado</small></div>` : ''}
        ${result.areaEligible || areaParticipation > 0 ? `<div class="finance-result-card"><span>Repasse da area</span><strong>${fmtBRL(areaParticipation)}</strong><small>participacao definida para o parceiro/local</small></div>` : ''}
        <div class="finance-result-card is-reference"><span>Custo total projetado por kWh</span><strong>${fmtPerKWh(result.plannedTotalCostPerKWh)}</strong><small>base + gestao, plataforma, royalties e repasses</small></div>
      </div>
    </section>
    <section class="finance-result-stage finance-result-stage--actual">
      <div class="finance-result-stage-head"><h3>3. Resultado real da competencia</h3><p>Leitura final sobre as vendas efetivamente registradas no periodo.</p></div>
      <div class="finance-result-stage-grid">
        <div class="finance-result-card is-primary"><span>Custo efetivo real por kWh</span><strong>${fmtPerKWh(result.totalCostPerKWh)}</strong><small>${fmtBRL(result.totalOperatingCost || 0)} de custo total, diluído pelos ${fmtKWh(result.commercialEnergy || result.energy || 0)} comercialmente elegíveis</small></div>
        <div class="finance-result-card"><span>Preco medio vendido</span><strong>${fmtPerKWh(result.planning?.salePricePerKWh || 0)}</strong><small>referencia para comparar com o custo efetivo</small></div>
        <div class="finance-result-card warn"><span>Ponto de equilibrio</span><strong>${Number.isFinite(result.breakEvenKWh) ? fmtKWh(result.breakEvenKWh) : '-'}</strong><small>${result.contributionPerKWh > 0 ? `${fmtPerKWh(result.contributionPerKWh)} de contribuicao` : 'preco de venda nao cobre os custos variaveis'}</small></div>
        <div class="finance-result-card ${resultClass} is-primary"><span>Resultado operacional real</span><strong>${fmtBRL(result.operationNet || 0)}</strong><small>receitas menos ${fmtBRL(directBaseCost)} de base e ${fmtBRL(distributionCost)} de gestao, plataforma e repasses</small></div>
        <div class="finance-result-card ${resultClass}"><span>Resultado por kWh</span><strong>${fmtPerKWh(result.resultPerKWh)}</strong><small>resultado diluido pela energia vendida</small></div>
        <div class="finance-result-card ${marginClass}"><span>Margem operacional</span><strong>${fmtPct(result.operationMargin || 0)}</strong><small>resultado operacional / receitas totais</small></div>
        ${Number(result.marketingRevenue || 0) > 0 ? `<div class="finance-result-card good is-primary"><span>Marketing / contratos do mês</span><strong>${fmtBRL(result.marketingRevenue)}</strong><small>registrado no fechamento; fora da ocupação, R$/kWh e projeções de recarga</small></div><div class="finance-result-card good"><span>Resultado financeiro após fechamento</span><strong>${fmtBRL(result.financialResult || 0)}</strong><small>resultado operacional + receitas não operacionais reconhecidas</small></div>` : ''}
      </div>
    </section>
  `;
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
  const management = revenue * cfg.managementPct / 100;
  const platform = revenue * cfg.platformPct / 100;
  const ubyRoyalty = model === 'third_party_management' ? revenue * cfg.ubyRoyaltyPct / 100 : 0;
  const taxes = revenue * cfg.taxRatePct / 100;
  const energyCost = commercialEnergy * cfg.energyCostPerKWh;
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
  const costs = energyCost + extraCosts + taxes;
  const preAreaNet = revenue + extraRevenue - management - platform - ubyRoyalty - costs;
  const areaEligible = model === 'uby' || model === 'hybrid';
  const areaSharePct = cfg.ownerTransferMode === 'net' ? Number(cfg.ownerNetProfitSharePct || 0) : Number(cfg.ownerRevenueSharePct || 0);
  const areaShareBase = cfg.ownerTransferMode === 'net' ? Math.max(preAreaNet, 0) : revenue;
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
  const margin = revenue ? ownResult / revenue * 100 : 0;
  const totalRevenue = revenue + extraRevenue + marketingRevenue;
  const financialResult = operationNet + marketingRevenue;
  const totalOperatingCost = energyCost + extraCosts + taxes + management + platform + ubyRoyalty + areaParticipation;
  const matrizCostPerKWh = commercialEnergy > 0 ? matrizCost / commercialEnergy : null;
  const plannedMatrizCostPerKWh = planning.planningKWh > 0 ? matrizCost / planning.planningKWh : null;
  const matrizCostRevenuePct = revenue > 0 ? matrizCost / revenue * 100 : 0;
  const directCostPerKWh = commercialEnergy > 0 ? (energyCost + extraCosts + taxes + areaParticipation) / commercialEnergy : null;
  const totalCostPerKWh = commercialEnergy > 0 ? totalOperatingCost / commercialEnergy : null;
  const extraRevenuePerKWh = commercialEnergy > 0 ? extraRevenue / commercialEnergy : null;
  const plannedEnergyCost = planning.planningKWh * cfg.energyCostPerKWh;
  const plannedManagement = planning.planningRevenue * cfg.managementPct / 100;
  const plannedPlatform = planning.planningRevenue * cfg.platformPct / 100;
  const plannedUbyRoyalty = model === 'third_party_management' ? planning.planningRevenue * cfg.ubyRoyaltyPct / 100 : 0;
  const plannedTaxes = planning.planningRevenue * cfg.taxRatePct / 100;
  const plannedPreAreaNet = planning.planningRevenue + plannedOperationalExtraRevenue - plannedManagement - plannedPlatform - plannedUbyRoyalty - plannedTaxes - plannedEnergyCost - costEvaluation.planned - matrizCost;
  const plannedAreaShareBase = cfg.ownerTransferMode === 'net' ? Math.max(plannedPreAreaNet, 0) : planning.planningRevenue;
  const plannedAreaParticipation = areaEligible ? plannedAreaShareBase * areaSharePct / 100 : 0;
  const plannedDirectCost = plannedEnergyCost + costEvaluation.planned + matrizCost + plannedTaxes + plannedAreaParticipation;
  const plannedTotalCost = plannedDirectCost + plannedManagement + plannedPlatform + plannedUbyRoyalty;
  const plannedDirectCostPerKWh = planning.planningKWh > 0 ? plannedDirectCost / planning.planningKWh : null;
  const plannedExtraRevenuePerKWh = planning.planningKWh > 0 ? plannedOperationalExtraRevenue / planning.planningKWh : null;
  const managementVariable = planning.salePricePerKWh * cfg.managementPct / 100;
  const platformVariable = planning.salePricePerKWh * cfg.platformPct / 100;
  const areaVariable = areaEligible && cfg.ownerTransferMode !== 'net' ? planning.salePricePerKWh * areaSharePct / 100 : 0;
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
function saveMatrizCostsLegacy(list) {
  try { localStorage.setItem(MATRIZ_LEGACY_COSTS_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch (_) {}
}
function setMatrizFeedback(msg, isError) {
  const el = document.getElementById('matrizFeedback');
  if (el) {
    el.textContent = msg || '';
    el.style.color = isError ? 'var(--p3-danger)' : 'var(--p3-primary)';
  }
  // Mantém também o storageState como fallback (páginas antigas sem o elemento).
  if (msg) setStorageState(msg, !!isError);
}
function addMatrizCostLegacy() {
  try {
    const nameEl = document.getElementById('matrizNewName');
    const valEl = document.getElementById('matrizNewValue');
    const nome = (nameEl?.value || '').trim();
    const valor = Math.max(0, parseFloat(valEl?.value) || 0);
    if (!nome || valor <= 0) {
      setMatrizFeedback('Informe o nome e um valor maior que zero para o custo da matriz.', true);
      return;
    }
    const list = loadMatrizCostsLegacy();
    list.push({ id: 'm' + Date.now().toString(36), nome, valor, ativo: true });
    saveMatrizCostsLegacy(list);
    if (nameEl) nameEl.value = '';
    if (valEl) valEl.value = '';
    renderMatrizCostsLegacy(getGeneralUnitData());
    setMatrizFeedback(`Custo "${nome}" adicionado (${fmtBRL(valor)}).`, false);
  } catch (e) {
    console.error('[fin-matriz-add]', e);
    setMatrizFeedback('Não foi possível adicionar o custo agora. Recarregue a página e tente novamente.', true);
  }
}
function removeMatrizCostLegacy(id) {
  try {
    saveMatrizCostsLegacy(loadMatrizCostsLegacy().filter(c => c.id !== id));
    renderMatrizCostsLegacy(getGeneralUnitData());
    setMatrizFeedback('Custo removido.', false);
  } catch (e) {
    console.error('[fin-matriz-remove]', e);
    setMatrizFeedback('Não foi possível remover o custo agora. Recarregue a página e tente novamente.', true);
  }
}

// Carregadores UBY (incluídos na operação UBY) com pelo menos 1 recarga no mês mk.
function ubyChargersWithRechargeInMonth(unitData, mk) {
  return getUbyChargerRows(unitData)
    .filter(row => row.included)
    .filter(row => (row.charges || []).some(charge => chargeMonthKey(charge) === mk));
}

function renderMatrizCostsLegacy(unitData) {
  const listEl = document.getElementById('matrizCostList');
  if (!listEl) return;
  const costs = loadMatrizCostsLegacy();

  // Mês de referência: o mais recente com recargas UBY.
  const ubyRows = getUbyChargerRows(unitData).filter(row => row.included);
  const ubyCharges = ubyRows.flatMap(row => row.charges || []);
  const months = [...new Set(ubyCharges.map(chargeMonthKey).filter(m => m !== 'unknown'))].sort();
  const mk = months[months.length - 1] || '';
  const activeChargers = mk ? ubyChargersWithRechargeInMonth(unitData, mk) : [];
  const n = activeChargers.length;

  const monthEl = document.getElementById('matrizMonthLabel');
  if (monthEl) monthEl.textContent = mk ? `rateio de ${monthLabel(mk)} · ${n} carregador(es) UBY com recarga` : 'sem recargas UBY neste período';

  const activeCosts = costs.filter(c => c.ativo !== false);
  const total = activeCosts.reduce((s, c) => s + Number(c.valor || 0), 0);
  const perCharger = n > 0 ? total / n : 0;

  listEl.innerHTML = costs.length ? costs.map(c => `
    <tr>
      <td>${escapeHtml(c.nome)}</td>
      <td style="text-align:right" class="num">${fmtBRL(Number(c.valor || 0))}</td>
      <td style="text-align:right;color:var(--p3-primary);font-weight:600" class="num">${n > 0 ? fmtBRL(Number(c.valor || 0) / n) : '—'}</td>
      <td style="text-align:right"><button class="btn-open" type="button" onclick="removeMatrizCost('${c.id}')">Remover</button></td>
    </tr>`).join('') : '<tr><td colspan="4" style="color:var(--p3-muted);text-align:center;padding:16px">Nenhum custo da matriz cadastrado. Adicione abaixo (ex.: Aluguel matriz — R$ 349,36).</td></tr>';

  const footEl = document.getElementById('matrizCostFoot');
  if (footEl) footEl.innerHTML = costs.length ? `
    <tr style="border-top:2px solid var(--p3-border);font-weight:700">
      <td>Total da matriz</td>
      <td style="text-align:right" class="num">${fmtBRL(total)}</td>
      <td style="text-align:right;color:var(--p3-primary)" class="num">${n > 0 ? fmtBRL(perCharger) : '—'}</td>
      <td></td>
    </tr>` : '';

  const rateioEl = document.getElementById('matrizRateio');
  if (!rateioEl) return;
  if (!costs.length || n === 0) { rateioEl.innerHTML = ''; return; }
  rateioEl.innerHTML = `
    <div style="color:var(--p3-muted);font-size:12px;margin-bottom:8px">Fatia da matriz por carregador UBY em ${monthLabel(mk)} (cada um paga o mesmo):</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${activeChargers.map(row => `
        <div class="card" style="padding:10px 14px;min-width:180px;margin:0">
          <div style="font-size:12px;color:var(--p3-muted)">${escapeHtml(row.station || row.workName || 'Carregador')}</div>
          <div style="font-weight:700;color:var(--p3-danger)">− ${fmtBRL(perCharger)}</div>
        </div>`).join('')}
    </div>`;
}

// Shared-cost matrix v2. It preserves historical allocations by keeping each
// selected target and its effective month on the cost record itself.
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
    quotas: Math.max(0, Math.round(Number(item?.quotas ?? fallback[index]?.quotas ?? 0))),
    eligibleFrom: /^\d{4}-\d{2}$/.test(String(item?.eligibleFrom || '')) ? String(item.eligibleFrom) : (fallback[index]?.eligibleFrom || '2099-12'),
    status: ['pendente', 'aprovado', 'pago'].includes(item?.status) ? item.status : 'pendente'
  })).filter(item => item.name && item.quotas > 0);
}

function normalizeDistributionLedger(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.entries(raw).reduce((ledger, [monthKey, item]) => {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return ledger;
    ledger[monthKey] = {
      status: ['pendente', 'aprovado', 'pago'].includes(item?.status) ? item.status : 'pendente',
      updatedAt: item?.updatedAt || '', note: safeText(item?.note || '').slice(0, 300)
    };
    return ledger;
  }, {});
}

function defaultNetworkDistribution() {
  return {
    roundLabel: 'Rodada 1', totalQuotas: 10, soldQuotas: 10, investorPct: 100,
    legalReservePct: 5, expansionReservePct: 10, policyVersion: 3,
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

function saveNetworkDistribution(settings, options = {}) {
  networkDistributionState = normalizeNetworkDistribution(settings);
  try { localStorage.setItem(NETWORK_DISTRIBUTION_KEY, JSON.stringify(networkDistributionState)); } catch (_) {}
  if (options.remote !== false) persistMatrizCosts().catch(error => {
    console.warn('[network-distribution-save]', error);
    const feedback = document.getElementById('networkDreFeedback');
    if (feedback) feedback.textContent = `Salvo neste navegador; nuvem pendente: ${error?.message || 'erro de sincronização'}.`;
  });
  return networkDistributionState;
}
let matrizCostsLoadPromise = null;
let matrizCostsSaveChain = Promise.resolve();
let matrizEditingId = '';
let matrizDocumentsState = [];
let matrizDocumentsLoadedKey = '';
let matrizDocumentsLoadPromise = null;

function matrizDocumentDate(value) {
  const raw = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split('-').reverse().join('/') : 'Sem vencimento';
}
function matrizDocumentStatusLabel(status) {
  return ({ pending: 'Pendente', paid: 'Pago', cancelled: 'Cancelado' })[status] || 'Pendente';
}
function setMatrizDocumentFeedback(message, isError = false) {
  const el = matrizInput('matrizDocumentFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? 'var(--p3-danger)' : 'var(--p3-ok)';
}
async function ensureMatrizDocumentsLoaded(mk) {
  if (!mk || matrizDocumentsLoadedKey === mk) return matrizDocumentsState;
  if (matrizDocumentsLoadPromise) return matrizDocumentsLoadPromise;
  matrizDocumentsLoadPromise = (async () => {
    try {
      if (!window.UBY_SUPABASE?.loadFinanceDocuments) throw new Error('Sincronizacao de documentos indisponivel.');
      matrizDocumentsState = await window.UBY_SUPABASE.loadFinanceDocuments({ scope: 'matrix', competenceKey: mk, limit: 100 });
      matrizDocumentsLoadedKey = mk;
    } catch (error) {
      matrizDocumentsState = [];
      matrizDocumentsLoadedKey = mk;
      setMatrizDocumentFeedback(`Documentos indisponiveis: ${error?.message || 'erro de acesso'}`, true);
    } finally {
      matrizDocumentsLoadPromise = null;
      renderMatrizDocuments(mk);
    }
    return matrizDocumentsState;
  })();
  return matrizDocumentsLoadPromise;
}
function renderMatrizDocuments(mk = financeMonthKey()) {
  const host = matrizInput('matrizDocumentsList');
  if (!host || !mk) return;
  const total = matrizDocumentsState.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = matrizDocumentsState.filter(item => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pending = matrizDocumentsState.filter(item => item.status === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalEl = matrizInput('matrizDocumentsTotal'); if (totalEl) totalEl.textContent = fmtBRL(total);
  const paidEl = matrizInput('matrizDocumentsPaid'); if (paidEl) paidEl.textContent = fmtBRL(paid);
  const pendingEl = matrizInput('matrizDocumentsPending'); if (pendingEl) pendingEl.textContent = fmtBRL(pending);
  const costSelect = matrizInput('matrizDocumentCost');
  if (costSelect && !costSelect.dataset.ready) {
    const costs = loadMatrizCosts();
    costSelect.innerHTML = `<option value="">Sem vinculo com custo da matriz</option>${costs.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;
    costSelect.dataset.ready = '1';
  }
  host.innerHTML = matrizDocumentsState.length ? matrizDocumentsState.map(item => {
    const cost = loadMatrizCosts().find(entry => entry.id === item.matrix_cost_id);
    const installment = item.installment_number ? ` | parcela ${item.installment_number}${item.installment_total ? `/${item.installment_total}` : ''}` : '';
    const file = item.storage_path ? `<button class="btn-open" type="button" onclick="openMatrizDocument('${escapeAttr(item.id)}')">Abrir arquivo</button>` : '<span class="sub">Sem arquivo</span>';
    return `<tr><td><strong>${escapeHtml(item.supplier || 'Documento financeiro')}</strong><div class="sub">${escapeHtml(item.category || 'Outros custos')}${item.document_number ? ` | ${escapeHtml(item.document_number)}` : ''}</div></td><td>${matrizDocumentDate(item.due_date)}<div class="sub">${escapeHtml(matrizDocumentStatusLabel(item.status))}${installment}</div></td><td>${cost ? escapeHtml(cost.name) : '<span class="sub">Nao vinculado</span>'}</td><td class="num" style="text-align:right">${fmtBRL(item.amount)}</td><td style="text-align:right">${file} <button class="btn-danger" type="button" onclick="deleteMatrizDocument('${escapeAttr(item.id)}')">Excluir</button></td></tr>`;
  }).join('') : '<tr><td colspan="5" style="color:var(--p3-muted);text-align:center;padding:16px">Nenhum boleto ou documento cadastrado nesta competencia.</td></tr>';
  if (!matrizDocumentsLoadedKey || matrizDocumentsLoadedKey !== mk) ensureMatrizDocumentsLoaded(mk);
}
async function saveMatrizDocument() {
  const mk = financeMonthKey();
  const supplier = safeText(matrizInput('matrizDocumentSupplier')?.value || '').trim();
  const amount = Math.max(0, Number(matrizInput('matrizDocumentAmount')?.value || 0));
  if (!mk || !supplier || !amount) { setMatrizDocumentFeedback('Informe fornecedor, valor e competencia.', true); return; }
  const button = matrizInput('matrizDocumentSave');
  if (button) { button.disabled = true; button.textContent = 'Salvando...'; }
  try {
    const file = matrizInput('matrizDocumentFile')?.files?.[0] || null;
    await window.UBY_SUPABASE.createFinanceDocument({
      scope: 'matrix', competenceKey: mk, supplier,
      category: matrizInput('matrizDocumentCategory')?.value || 'Outros custos',
      documentNumber: matrizInput('matrizDocumentNumber')?.value || '',
      documentType: matrizInput('matrizDocumentType')?.value || 'boleto',
      amount, dueDate: matrizInput('matrizDocumentDueDate')?.value || null,
      status: matrizInput('matrizDocumentStatus')?.value || 'pending',
      installmentNumber: matrizInput('matrizDocumentInstallment')?.value || null,
      installmentTotal: matrizInput('matrizDocumentInstallments')?.value || null,
      matrixCostId: matrizInput('matrizDocumentCost')?.value || null,
      notes: matrizInput('matrizDocumentNotes')?.value || ''
    }, file);
    ['matrizDocumentSupplier','matrizDocumentNumber','matrizDocumentAmount','matrizDocumentDueDate','matrizDocumentInstallment','matrizDocumentInstallments','matrizDocumentNotes'].forEach(id => { const input = matrizInput(id); if (input) input.value = ''; });
    const fileInput = matrizInput('matrizDocumentFile'); if (fileInput) fileInput.value = '';
    matrizDocumentsLoadedKey = '';
    await ensureMatrizDocumentsLoaded(mk);
    setMatrizDocumentFeedback('Documento salvo na nuvem. O custo continua sendo calculado somente pela regra vinculada da matriz.', false);
  } catch (error) {
    setMatrizDocumentFeedback(error?.message || 'Nao foi possivel salvar o documento.', true);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Salvar documento'; }
  }
}
async function openMatrizDocument(id) {
  try {
    const result = await window.UBY_SUPABASE.openFinanceDocument(id);
    window.open(result.url, '_blank', 'noopener');
  } catch (error) { setMatrizDocumentFeedback(error?.message || 'Nao foi possivel abrir o arquivo.', true); }
}
async function deleteMatrizDocument(id) {
  if (!window.confirm('Excluir este documento e o arquivo privado anexado? Esta acao nao altera o custo da matriz.')) return;
  try {
    await window.UBY_SUPABASE.deleteFinanceDocument(id);
    matrizDocumentsLoadedKey = '';
    await ensureMatrizDocumentsLoaded(financeMonthKey());
    setMatrizDocumentFeedback('Documento excluido.', false);
  } catch (error) { setMatrizDocumentFeedback(error?.message || 'Nao foi possivel excluir o documento.', true); }
}

function matrizScopeKey(row = {}) { return `${String(row.workId || '')}::${String(row.key || normalizeStationForCompare(row.station || row.workName || ''))}`; }
function matrizStationScope(row = {}) { return `${String(row.workId || '')}::${normalizeStationForCompare(row.station || row.stationName || row.workName || '')}`; }
function matrizTargetIdentity(row = {}) {
  return {
    scope: matrizScopeKey(row),
    workId: String(row.workId || ''),
    station: safeText(row.station || row.stationName || row.workName || ''),
    stationKey: normalizeStationForCompare(row.station || row.stationName || row.workName || ''),
    workName: safeText(row.workName || '')
  };
}
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
function matrizInput(id) { return document.getElementById(id); }
function matrizSelectedTargets() { return [...(matrizInput('matrizCostTargets')?.selectedOptions || [])].map(option => option.value).filter(Boolean); }
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
  const offset = matrizMonthOffset(item.startMonth || mk, mk);
  if (offset < 0) return 0;
  if (item.costKind === 'one_off') return offset === 0 ? Math.max(0, Number(item.amount || 0)) : 0;
  if (item.costKind === 'installment') return offset < Math.max(1, Number(item.installments || 1)) ? Math.max(0, Number(item.amount || 0)) : 0;
  return (!item.endMonth || mk <= item.endMonth) ? Math.max(0, Number(item.amount || 0)) : 0;
}
function matrizApplies(item, mk) {
  if (!item?.enabled || !mk) return false;
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
function currentMatrizItems(mk = financeMonthKey()) {
  const current = matrizRowForUnit({ workId: currentWorkId, stationName: currentStationReportName || '' }, getGeneralUnitData(), mk);
  return current ? matrizCostItemsForRow(current, mk) : [];
}
function resetMatrizCostForm() {
  matrizEditingId = '';
  ['matrizNewName','matrizCostSupplier','matrizNewValue','matrizCostEndMonth','matrizCostDocument','matrizCostNotes','matrizCostCustomShares'].forEach(id => { const el = matrizInput(id); if (el) el.value = ''; });
  const start = matrizInput('matrizCostStartMonth'); if (start) start.value = financeMonthKey() || getMonths().at(-1) || '';
  const kind = matrizInput('matrizCostKind'); if (kind) kind.value = 'recurring';
  const method = matrizInput('matrizCostMethod'); if (method) method.value = 'equal';
  const installments = matrizInput('matrizCostInstallments'); if (installments) installments.value = 1;
  const coverage = matrizInput('matrizCostCoverageMonths'); if (coverage) coverage.value = 1;
  const due = matrizInput('matrizCostDueDay'); if (due) due.value = 1;
  const button = matrizInput('matrizSaveButton'); if (button) button.textContent = 'Adicionar custo';
}
function addMatrizCost() {
  const name = safeText(matrizInput('matrizNewName')?.value || '').trim();
  const amount = Math.max(0, Number(matrizInput('matrizNewValue')?.value || 0));
  if (!name || !amount) { setMatrizFeedback('Informe o nome e o valor de cada parcela ou competencia.', true); return; }
  const targetRows = matrizEligibleRows(getGeneralUnitData(), financeMonthKey());
  const allTargets = targetRows.map(matrizScopeKey);
  const targetIds = matrizSelectedTargets().length ? matrizSelectedTargets() : allTargets;
  if (!targetIds.length) { setMatrizFeedback('Selecione pelo menos um carregador de destino.', true); return; }
  const list = loadMatrizCosts();
  const previous = list.find(item => item.id === matrizEditingId);
  const existingTargets = new Map((previous?.targets || []).map(target => [target.scope, target]));
  const existingTargetForScope = scope => {
    if (existingTargets.has(scope)) return existingTargets.get(scope);
    const currentRow = matrizResolveTargetRow(scope, targetRows);
    return (previous?.targets || []).find(target => {
      const priorRow = matrizResolveTargetRow(target, targetRows);
      return priorRow && currentRow && matrizRowsMatch(priorRow, currentRow);
    });
  };
  const shares = safeText(matrizInput('matrizCostCustomShares')?.value || '').split(/[;,]/).map(value => Math.max(0, Number(value.trim().replace(',', '.')) || 0));
  const startMonth = matrizInput('matrizCostStartMonth')?.value || financeMonthKey();
  const cost = matrizNormalizeCost({ ...previous, id: previous?.id || `m${Date.now().toString(36)}`, name, amount,
    category: matrizInput('matrizCostCategory')?.value || 'Outros custos', supplier: matrizInput('matrizCostSupplier')?.value || '', costKind: matrizInput('matrizCostKind')?.value || 'recurring', installments: matrizInput('matrizCostInstallments')?.value || 1, coverageMonths: matrizInput('matrizCostCoverageMonths')?.value || 1, startMonth, endMonth: matrizInput('matrizCostEndMonth')?.value || '', dueDay: matrizInput('matrizCostDueDay')?.value || 1, allocation: matrizInput('matrizCostMethod')?.value || 'equal', documentRef: matrizInput('matrizCostDocument')?.value || '', notes: matrizInput('matrizCostNotes')?.value || '', enabled: true,
    targets: targetIds.map((scope, index) => {
      const existing = existingTargetForScope(scope);
      const row = matrizResolveTargetRow(scope, targetRows);
      return { ...matrizTargetIdentity(row || { workId: String(scope).split('::')[0], key: String(scope).split('::')[1] || '' }), scope, startMonth: existing?.startMonth || startMonth, share: shares[index] || existing?.share || 0 };
    }), updatedAt: new Date().toISOString() });
  if (previous) Object.assign(previous, cost); else list.push(cost);
  saveMatrizCosts(list); resetMatrizCostForm(); renderMatrizCosts(getGeneralUnitData());
  setMatrizFeedback(`Custo ${name} salvo. O rateio fica gravado por competencia e destino.`, false);
}
function editMatrizCost(id) {
  const item = loadMatrizCosts().find(cost => cost.id === id); if (!item) return;
  matrizEditingId = id;
  const values = { matrizNewName:item.name, matrizCostCategory:item.category, matrizCostSupplier:item.supplier, matrizCostKind:item.costKind, matrizNewValue:item.amount, matrizCostInstallments:item.installments, matrizCostCoverageMonths:matrizCoverageMonths(item), matrizCostStartMonth:item.startMonth, matrizCostEndMonth:item.endMonth, matrizCostDueDay:item.dueDay, matrizCostMethod:item.allocation, matrizCostDocument:item.documentRef, matrizCostNotes:item.notes, matrizCostCustomShares:item.targets.map(target => target.share || 0).join(', ') };
  Object.entries(values).forEach(([idValue, value]) => { const el = matrizInput(idValue); if (el) el.value = value ?? ''; });
  const targets = matrizInput('matrizCostTargets'); if (targets) {
    const rows = matrizEligibleRows(getGeneralUnitData(), financeMonthKey());
    [...targets.options].forEach(option => {
      const row = matrizResolveTargetRow(option.value, rows);
      option.selected = item.targets.some(target => matrizRowsMatch(matrizResolveTargetRow(target, rows), row));
    });
  }
  const button = matrizInput('matrizSaveButton'); if (button) button.textContent = 'Salvar alteracao';
  setMatrizFeedback(`Editando ${item.name}. Destinos novos passam a valer da competencia atual para frente.`, false);
}
function removeMatrizCost(id) {
  const item = loadMatrizCosts().find(cost => cost.id === id); if (!item) return;
  item.enabled = false; item.updatedAt = new Date().toISOString(); saveMatrizCosts(loadMatrizCosts()); renderMatrizCosts(getGeneralUnitData());
  setMatrizFeedback('Custo desativado. O historico anterior permanece preservado.', false);
}
function deleteMatrizCost(id) {
  const item = loadMatrizCosts().find(cost => cost.id === id); if (!item) return;
  if (!window.confirm(`Excluir definitivamente o custo "${item.name}"? Esta acao remove o cadastro e o rateio dele de todas as competencias.`)) return;
  const next = loadMatrizCosts().filter(cost => cost.id !== id);
  if (matrizEditingId === id) resetMatrizCostForm();
  saveMatrizCosts(next); renderMatrizCosts(getGeneralUnitData());
  setMatrizFeedback(`Custo ${item.name} excluido definitivamente.`, false);
}
function ensureMatrizCostEditor() {
  if (matrizInput('matrizCostCategory')) return;
  const list = matrizInput('matrizCostList');
  const card = list?.closest('.card');
  if (!card) return;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0">Custos da matriz UBY</h2>
      <span id="matrizMonthLabel" style="color:var(--p3-muted);font-size:12px"></span>
    </div>
    <p style="color:var(--p3-muted);font-size:13px;margin:6px 0 16px;max-width:78ch">Cadastre despesas compartilhadas uma vez, defina parcelas, carregadores atendidos e a regra de rateio. Os destinos e a vigencia ficam guardados por competencia; adicionar um carregador novo nao reescreve meses anteriores.</p>
    <div style="overflow-x:auto"><table><thead><tr><th>Despesa</th><th>Competencia</th><th>Rateio e destinos</th><th style="text-align:right">Valor desta competencia</th><th style="text-align:right">Acao</th></tr></thead><tbody id="matrizCostList"></tbody><tfoot id="matrizCostFoot"></tfoot></table></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:16px">
      <label class="sub">NOME DO CUSTO<input id="matrizNewName" type="text" placeholder="Ex.: Seguro carregadores" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">CATEGORIA<select id="matrizCostCategory" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><option>Seguro</option><option>Locacao / aluguel</option><option>Internet / dados</option><option>Manutencao preventiva</option><option>Manutencao corretiva</option><option>Licenca / plataforma</option><option>Tributos corporativos / centralizados</option><option>Marketing</option><option>Administrativo</option><option>Outros custos</option></select></label>
      <label class="sub">FORNECEDOR OU DOCUMENTO<input id="matrizCostSupplier" type="text" placeholder="Ex.: Seguradora / boleto" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">TIPO DE COBRANCA<select id="matrizCostKind" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><option value="recurring">Recorrente mensal</option><option value="installment">Parcelado</option><option value="one_off">Pontual</option></select></label>
      <label class="sub">VALOR DE CADA PARCELA (R$)<input id="matrizNewValue" type="number" step="0.01" min="0" placeholder="Ex.: 526,24" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">NUMERO DE PARCELAS<input id="matrizCostInstallments" type="number" min="1" step="1" value="1" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">MESES DE COBERTURA (DRE)<input id="matrizCostCoverageMonths" type="number" min="1" step="1" value="1" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">MES INICIAL<input id="matrizCostStartMonth" type="month" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">MES FINAL (OPCIONAL)<input id="matrizCostEndMonth" type="month" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">DIA DE VENCIMENTO<input id="matrizCostDueDay" type="number" min="1" max="31" value="1" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <label class="sub">CRITERIO DE RATEIO<select id="matrizCostMethod" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><option value="equal">Rateio igual</option><option value="power">Por potencia instalada</option><option value="energy">Por kWh vendido</option><option value="revenue">Por faturamento</option><option value="custom">Participacao definida</option></select></label>
    </div>
    <div style="display:grid;grid-template-columns:minmax(260px,1fr) minmax(220px,1fr);gap:10px;margin-top:10px">
      <label class="sub">CARREGADORES DE DESTINO (PODE SELECIONAR MAIS DE UM)<select id="matrizCostTargets" multiple size="5" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:8px;font:inherit"></select></label>
      <div><input id="matrizCostCustomShares" type="text" placeholder="Participacoes: 50, 30, 20" style="width:100%;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><div class="sub" style="margin-top:6px">Use participacao definida somente se quiser percentuais personalizados na mesma ordem dos destinos. Nos outros metodos este campo e ignorado.</div><input id="matrizCostDocument" type="text" placeholder="Referencia do boleto ou documento" style="width:100%;margin-top:10px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><input id="matrizCostNotes" type="text" placeholder="Observacao" style="width:100%;margin-top:10px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></div>
    </div>
    <div class="sub" style="margin-top:12px;max-width:88ch">Tributos sobre o faturamento de cada carregador devem ser configurados no financeiro daquela unidade. Use <b>Tributos corporativos / centralizados</b> somente para obrigações sem vínculo direto e rateie entre os carregadores beneficiados. Para um seguro pago em 4 parcelas que cobre 12 meses, informe <b>4 parcelas</b> e <b>12 meses de cobertura</b>.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px"><button id="matrizSaveButton" class="btn-open" type="button" onclick="addMatrizCost()">Adicionar custo</button><button class="btn-open" type="button" onclick="resetMatrizCostForm();renderMatrizCosts(getGeneralUnitData())">Limpar</button><span id="matrizFeedback" class="sub"></span></div>
    <div id="matrizRateio" style="margin-top:18px"></div>
    <section style="margin-top:24px;padding-top:20px;border-top:1px solid var(--p3-border)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h3 style="margin:0">Boletos e documentos da matriz</h3><span class="sub">PDF ou imagem privada, carregada somente ao abrir</span></div>
      <p class="sub" style="margin:6px 0 14px;max-width:82ch">Use este cadastro para organizar comprovantes, boletos e vencimentos. Vincule ao custo da matriz quando existir; o valor do documento nao soma custo novamente, pois a DRE continua usando a regra financeira cadastrada acima.</p>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;margin-bottom:14px">
        <div class="finance-result-card"><span>Documentos da competencia</span><strong id="matrizDocumentsTotal">R$ 0,00</strong><small>valor registrado</small></div>
        <div class="finance-result-card"><span>Pagos</span><strong id="matrizDocumentsPaid" style="color:var(--p3-ok)">R$ 0,00</strong><small>controle de caixa</small></div>
        <div class="finance-result-card"><span>Pendentes</span><strong id="matrizDocumentsPending" style="color:var(--p3-warn)">R$ 0,00</strong><small>acompanhar vencimentos</small></div>
      </div>
      <div style="overflow-x:auto"><table><thead><tr><th>Documento</th><th>Vencimento e status</th><th>Custo vinculado</th><th style="text-align:right">Valor</th><th style="text-align:right">Acao</th></tr></thead><tbody id="matrizDocumentsList"><tr><td colspan="5" class="sub">Carregando documentos...</td></tr></tbody></table></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:16px">
        <label class="sub">FORNECEDOR OU EMISSOR<input id="matrizDocumentSupplier" type="text" placeholder="Ex.: Seguradora" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
        <label class="sub">CATEGORIA<select id="matrizDocumentCategory" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><option>Seguro</option><option>Locacao / aluguel</option><option>Internet / dados</option><option>Manutencao</option><option>Licenca / plataforma</option><option>Administrativo</option><option>Outros custos</option></select></label>
        <label class="sub">VALOR DO DOCUMENTO (R$)<input id="matrizDocumentAmount" type="number" min="0" step="0.01" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
        <label class="sub">VENCIMENTO<input id="matrizDocumentDueDate" type="date" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
        <label class="sub">SITUACAO<select id="matrizDocumentStatus" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><option value="pending">Pendente</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option></select></label>
        <label class="sub">TIPO<select id="matrizDocumentType" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"><option value="boleto">Boleto</option><option value="nota_fiscal">Nota fiscal</option><option value="contrato">Contrato</option><option value="comprovante">Comprovante</option><option value="outro">Outro</option></select></label>
        <label class="sub">NUMERO / REFERENCIA<input id="matrizDocumentNumber" type="text" placeholder="Nosso numero, NF, contrato" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
        <label class="sub">CUSTO DA MATRIZ VINCULADO<select id="matrizDocumentCost" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></select></label>
        <label class="sub">PARCELA<input id="matrizDocumentInstallment" type="number" min="1" step="1" placeholder="Ex.: 1" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
        <label class="sub">TOTAL DE PARCELAS<input id="matrizDocumentInstallments" type="number" min="1" step="1" placeholder="Ex.: 4" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
        <label class="sub">ARQUIVO PRIVADO (PDF, JPG, PNG OU WEBP)<input id="matrizDocumentFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style="display:block;width:100%;margin-top:5px;color:var(--p3-text);font:inherit"></label>
      </div>
      <label class="sub" style="display:block;margin-top:10px">OBSERVACAO<input id="matrizDocumentNotes" type="text" placeholder="Observacao interna" style="display:block;width:100%;margin-top:5px;background:var(--p3-card-soft);border:1px solid var(--p3-border);color:var(--p3-text);border-radius:8px;padding:9px 12px;font:inherit"></label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px"><button id="matrizDocumentSave" class="btn-open" type="button" onclick="saveMatrizDocument()">Salvar documento</button><span id="matrizDocumentFeedback" class="sub"></span></div>
    </section>`;
}
function renderMatrizCosts(unitData) {
  ensureMatrizCostEditor();
  const listEl = matrizInput('matrizCostList'); if (!listEl) return;
  const mk = financeMonthKey() || getMonths().at(-1) || '';
  const allIncludedRows = getUbyChargerRows(unitData).filter(row => row.included);
  const rows = matrizEligibleRows(unitData, mk);
  const costs = loadMatrizCosts();
  const planned = costs.filter(item => matrizApplies(item, mk)).reduce((sum, item) => sum + matrizCompetencyAmount(item), 0);
  const monthEl = matrizInput('matrizMonthLabel'); if (monthEl) monthEl.textContent = mk ? `competencia ${monthLabel(mk)} | cadastro salvo separadamente das recargas` : 'selecione a competencia';
  listEl.innerHTML = costs.length ? costs.map(item => {
    const parcel = matrizMonthOffset(item.startMonth, mk) + 1;
    const period = item.costKind === 'installment' ? `parcela ${Math.max(1, parcel)} de ${item.installments} | cobertura ${matrizCoverageMonths(item)} mes(es)` : item.costKind === 'one_off' ? 'lancamento unico' : 'recorrente mensal';
    const activeTargets = item.targets.filter(target => !target.startMonth || target.startMonth <= mk);
    const targetNames = activeTargets.map(target => matrizResolveTargetRow(target, rows)?.station || target.station || '').filter(Boolean);
    const allocations = rows.flatMap(row => matrizCostItemsForRow(row, mk, unitData).filter(cost => cost.id === item.id));
    const allocated = allocations.reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
    const cashAllocated = allocations.reduce((sum, cost) => sum + Number(cost.cashAmount || 0), 0);
    const competency = matrizCompetencyAmount(item);
    const cash = matrizCashAmount(item, mk);
    return `<tr><td><strong>${escapeHtml(item.name)}</strong><div class="sub">${escapeHtml(item.category)}${item.supplier ? ` | ${escapeHtml(item.supplier)}` : ''}${item.documentRef ? ` | ${escapeHtml(item.documentRef)}` : ''}</div></td><td>${escapeHtml(period)}<div class="sub">inicio ${item.startMonth ? monthLabel(item.startMonth) : '-'} | venc. dia ${item.dueDay}</div></td><td>${matrizMethodLabel(item.allocation)}<div class="sub">${targetNames.length ? escapeHtml(targetNames.join(' | ')) : `${activeTargets.length} destino(s) sem base ativa`}</div></td><td class="num" style="text-align:right">${matrizApplies(item, mk) ? `competencia: ${fmtBRL(competency)}<div class="sub">caixa: ${fmtBRL(cash)} | rateado: ${fmtBRL(allocated)}${cashAllocated ? ` | caixa rateado: ${fmtBRL(cashAllocated)}` : ''}</div>` : 'fora da competencia'}</td><td style="text-align:right"><button class="btn-open" type="button" onclick="editMatrizCost('${escapeAttr(item.id)}')">Editar</button> <button class="btn-open" type="button" onclick="removeMatrizCost('${escapeAttr(item.id)}')">Desativar</button> <button class="btn-danger" type="button" onclick="deleteMatrizCost('${escapeAttr(item.id)}')">Excluir</button></td></tr>`;
  }).join('') : '<tr><td colspan="5" style="color:var(--p3-muted);text-align:center;padding:16px">Nenhum custo compartilhado cadastrado.</td></tr>';
  const foot = matrizInput('matrizCostFoot'); if (foot) foot.innerHTML = `<tr style="font-weight:700"><td colspan="3">Programado em ${mk ? monthLabel(mk) : '-'}</td><td class="num" style="text-align:right">${fmtBRL(planned)}</td><td></td></tr>`;
  const targets = matrizInput('matrizCostTargets');
  if (targets && !matrizEditingId) targets.innerHTML = rows.map(row => `<option value="${escapeAttr(matrizScopeKey(row))}" selected>${escapeHtml(row.station || row.workName)} | ${escapeHtml(row.workName)}</option>`).join('');
  const rateio = matrizInput('matrizRateio'); if (rateio) rateio.textContent = rows.length ? `Destinos ativos: ${rows.map(row => row.station || row.workName).join(' | ')}.` : '';
  renderMatrizMonthlyDre(allIncludedRows, mk);
  renderMatrizDocuments(mk);
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

function renderMatrizMonthlyDre(rows = [], activeMonth = '') {
  // O DRE da matriz pertence a pagina financeira dedicada. A pagina de
  // recargas continua leve e mostra somente o custo rateado de cada estacao.
  if (!window.UBY_FINANCE_ONLY) return;
  const anchor = matrizInput('matrizCostList')?.closest('.card');
  if (!anchor) return;
  let host = document.getElementById('matrizMonthlyDre');
  if (!host) {
    host = document.createElement('section');
    host.id = 'matrizMonthlyDre';
    host.className = 'card';
    host.style.marginTop = '18px';
    anchor.insertAdjacentElement('afterend', host);
  }
  const costs = loadMatrizCosts();
  const chargeMonths = rows.flatMap(row => (row.charges || []).map(chargeMonthKey)).filter(mk => mk !== 'unknown');
  const starts = costs.map(item => item.startMonth).filter(mk => /^\d{4}-\d{2}$/.test(mk));
  // Mantem visiveis todos os meses de cobertura do custo parcelado, inclusive
  // depois que a ultima parcela sair do caixa.
  const coverageEnds = costs
    .filter(item => item.costKind === 'installment' && item.startMonth)
    .map(item => matrizAddMonths(item.startMonth, matrizCoverageMonths(item) - 1));
  const candidates = [...new Set([...chargeMonths, ...starts, ...coverageEnds, activeMonth].filter(mk => /^\d{4}-\d{2}$/.test(mk)))].sort();
  if (!candidates.length) {
    host.innerHTML = '<h2 style="margin:0 0 6px">DRE mensal da matriz</h2><p class="sub">Cadastre um custo da matriz ou selecione uma competencia para visualizar o rateio mensal.</p>';
    return;
  }
  // Mantem o historico ja reconhecido e abre, no minimo, doze competencias a
  // partir do mes selecionado. Assim a DRE antecipa a cobertura contratada e
  // as parcelas de caixa sem regravar nem alterar os meses fechados.
  const horizonStart = /^\d{4}-\d{2}$/.test(activeMonth) ? activeMonth : candidates[candidates.length - 1];
  const minimumHorizonEnd = matrizAddMonths(horizonStart, 11);
  const latestKnownMonth = candidates[candidates.length - 1];
  const horizonEnd = latestKnownMonth > minimumHorizonEnd ? latestKnownMonth : minimumHorizonEnd;
  const months = matrizMonthSequence(candidates[0], horizonEnd);
  const series = months.map(mk => {
    const competency = costs.filter(item => matrizApplies(item, mk)).reduce((sum, item) => sum + matrizCompetencyAmount(item), 0);
    const cash = costs.reduce((sum, item) => sum + matrizCashAmount(item, mk), 0);
    const allocated = rows.reduce((sum, row) => sum + matrizCostItemsForRow(row, mk).reduce((partial, item) => partial + Number(item.amount || 0), 0), 0);
    return { mk, competency, cash, allocated, pending: Math.max(competency - allocated, 0) };
  });
  const totals = series.reduce((sum, row) => ({ competency: sum.competency + row.competency, cash: sum.cash + row.cash, allocated: sum.allocated + row.allocated, pending: sum.pending + row.pending }), { competency: 0, cash: 0, allocated: 0, pending: 0 });
  const max = Math.max(1, ...series.map(row => row.competency));
  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h2 style="margin:0">DRE mensal da matriz</h2><span class="sub">${escapeHtml(monthLabel(horizonStart))} a ${escapeHtml(monthLabel(horizonEnd))} | competencia, caixa, rateio e pendencias</span></div>
    <p class="sub" style="margin:6px 0 16px;max-width:78ch">A competencia entra no resultado e no custo por kWh dos carregadores. O caixa mostra somente as parcelas com vencimento no mes; ele nao altera o resultado contabil da competencia.</p>
    <div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-bottom:16px">
      <div class="finance-result-card"><span>Competencia reconhecida</span><strong>${fmtBRL(totals.competency)}</strong><small>soma dos custos pelo periodo de cobertura</small></div>
      <div class="finance-result-card"><span>Rateado aos carregadores</span><strong style="color:var(--p3-ok)">${fmtBRL(totals.allocated)}</strong><small>incluido nos custos individuais</small></div>
      <div class="finance-result-card"><span>Caixa programado</span><strong style="color:var(--p3-primary)">${fmtBRL(totals.cash)}</strong><small>parcelas com vencimento nas competencias</small></div>
      <div class="finance-result-card"><span>Pendente de rateio</span><strong style="color:${totals.pending > 0 ? 'var(--p3-warn)' : 'var(--p3-ok)'}">${fmtBRL(totals.pending)}</strong><small>${totals.pending > 0 ? 'revise os destinos do custo' : 'todos os custos possuem destino'}</small></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px">
      ${series.map(row => {
        const width = Math.max(3, row.competency / max * 100);
        const allocatedWidth = row.competency ? row.allocated / row.competency * 100 : 0;
        return `<article style="background:var(--p3-card-soft);border:1px solid var(--p3-border);border-radius:8px;padding:14px"><strong>${escapeHtml(monthLabel(row.mk))}</strong><div style="display:flex;justify-content:space-between;gap:8px;margin-top:10px"><span class="sub">Competencia</span><b>${fmtBRL(row.competency)}</b></div><div style="height:7px;background:var(--p3-track);border-radius:999px;margin:7px 0 11px"><span style="display:block;height:100%;width:${width.toFixed(1)}%;background:var(--p3-primary);border-radius:inherit"></span></div><div style="display:flex;justify-content:space-between;gap:8px"><span class="sub">Caixa (parcelas)</span><b style="color:var(--p3-primary)">${fmtBRL(row.cash)}</b></div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span class="sub">Rateado</span><b style="color:var(--p3-ok)">${fmtBRL(row.allocated)}</b></div><div class="sub" style="margin-top:6px;color:${row.pending > 0 ? 'var(--p3-warn)' : 'var(--p3-muted)'}">${row.pending > 0 ? `Pendente: ${fmtBRL(row.pending)} (${fmtPct(100 - allocatedWidth)})` : 'Rateio completo'}</div></article>`;
      }).join('')}
    </div>`;
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

async function renderFinanceOnly() {
  await ensureMatrizCostsLoaded();
  const unitData = getGeneralUnitData();
  const ubyRows = getUbyChargerRows(unitData);
  const includedRows = ubyRows.filter(r => r.included);
  const nRec = Object.keys(allRechargeRecords || {}).length;
  const nDetail = countDetailedCharges();
  console.log(`[fin] registros=${nRec} recargasDetalhadas=${nDetail} unidades=${unitData.length} carregadores=${ubyRows.length} carregadoresUBY=${includedRows.length}`);
  // O cadastro de custos da matriz é independente dos dados de recarga: ele
  // sempre renderiza, para que a pessoa possa cadastrar custos mesmo antes de
  // qualquer carregador ter recarga no período (o rateio aparece quando houver).
  try { renderMatrizCosts(unitData); } catch (e) { console.error('[fin-matriz]', e); }
  if (!includedRows.length) {
    let msg;
    if (nRec === 0) {
      msg = 'Nenhum dado carregado ainda. Se você não estiver logado, entre pela página de login e volte — os dados do financeiro vêm do mesmo banco do painel.';
    } else if (nDetail === 0) {
      msg = `Encontrei ${nRec} obra(s) cadastrada(s), mas o histórico detalhado de recargas ainda não carregou (só o resumo). Aguarde alguns segundos e clique em "Atualizar" — se persistir, pode ser bloqueio de acesso (RLS) no Supabase para as sessões detalhadas.`;
    } else if (unitData.length === 0) {
      msg = `Há ${nDetail} recarga(s) detalhada(s) carregada(s), mas nenhuma ficou associada a uma obra válida (podem ter sido filtradas por nome de obra/estação bloqueada).`;
    } else if (ubyRows.length === 0) {
      msg = `Há ${unitData.length} unidade(s) com recarga, mas nenhuma teve carregador agrupado neste período.`;
    } else {
      msg = `Há ${ubyRows.length} carregador(es) identificado(s), mas nenhum está marcado como operação UBY. Marque ao menos um carregador como UBY no painel principal.`;
    }
    setStorageState(msg, true);
    const sumEl = document.getElementById('ubyFinanceSummary');
    if (sumEl) sumEl.innerHTML = `<div class="note" style="padding:16px;color:var(--p3-warn)">${msg} <br><span style="color:var(--p3-muted);font-size:12px">(diagnóstico: registros=${nRec}, recargasDetalhadas=${nDetail}, unidades=${unitData.length}, carregadores=${ubyRows.length}, marcados como UBY=${includedRows.length})</span></div>`;
    const rowsEl = document.getElementById('ubyFinanceRows'); if (rowsEl) rowsEl.innerHTML = '';
    const treeEl = document.getElementById('costTree'); if (treeEl) treeEl.innerHTML = '';
    return;
  }
  const ubyCharges = includedRows.flatMap(r => r.charges || []);
  const sourceMonths = [...new Set(ubyCharges.map(chargeMonthKey).filter(k => k !== 'unknown'))].sort();
  syncFinanceOnlyMonthOptions(sourceMonths);
  const period = selectedFinanceOnlyPeriod(sourceMonths);
  try { renderUbyFinancialOverview(ubyRows, sourceMonths, period.isMonthView, period.monthKey, period.label); } catch (e) { console.error('[fin-uby]', e); }
  try { renderNetworkDre(ubyRows, sourceMonths, period.isMonthView, period.monthKey); } catch (e) { console.error('[fin-network-dre]', e); }
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

function financeUnitOpenButton(row) {
  const station = row.stationName || row.station || '';
  return `<button class="btn-open" type="button" onclick="openFinanceUnit('${escapeAttr(row.workId)}','${escapeAttr(station)}')">Abrir</button>`;
}

function renderGeneralFinanceOverview(rows = []) {
  const target = document.getElementById('generalFinanceOverview');
  if (!target) return;
  const ubyRows = rows.filter(row => ['uby', 'hybrid', 'third_party_management'].includes(normalizeOperationModel(row.finance?.operationModel)));
  // P3 must include its management fee from UBY assets as well as P3-only partnerships.
  const p3Rows = rows.filter(row => Number(row.finance?.p3OperationalResult || 0) > 0);
  const ubyInvestorRows = rows.filter(row =>
    ['uby', 'hybrid'].includes(normalizeOperationModel(row.finance?.operationModel)) &&
    Number(row.finance?.investorDistribution || 0) > 0
  );
  const partnerRows = rows.filter(row =>
    ['p3_society', 'management_only', 'third_party_management'].includes(normalizeOperationModel(row.finance?.operationModel)) &&
    Number(row.finance?.partnerInvestorDistribution || 0) > 0
  );
  const sum = (items, selector) => items.reduce((total, item) => total + Number(selector(item) || 0), 0);
  const ubyTotal = sum(ubyRows, row => row.finance?.ubyNet);
  const p3Total = sum(p3Rows, row => row.finance?.p3OperationalResult);
  const ubyInvestorTotal = sum(ubyInvestorRows, row => row.finance?.investorDistribution);
  const partnerTotal = sum(partnerRows, row => row.finance?.partnerInvestorDistribution);
  const list = (items, metric, emptyText = 'Nenhuma unidade neste modelo.') => items.length
    ? items.slice().sort((a, b) => Number(metric(b) || 0) - Number(metric(a) || 0)).map(row => `
      <div class="finance-overview-row">
        <div><strong>${escapeHtml(row.workName)}</strong><span>${escapeHtml(operationModelLabel(row.finance?.operationModel))}</span></div>
        <b>${fmtBRL(metric(row))}</b>
        ${financeUnitOpenButton(row)}
      </div>`).join('')
    : `<div class="finance-overview-empty">${emptyText}</div>`;
  target.innerHTML = `
    <article class="finance-overview-panel uby">
      <h2>UBY</h2>
      <strong class="finance-overview-total">${fmtBRL(ubyTotal)}</strong>
      <span class="finance-overview-caption">Resultado de ativos UBY e royalties de marca, antes da distribuicao.</span>
      <div class="finance-overview-list">${list(ubyRows, row => row.finance?.ubyNet)}</div>
    </article>
    <article class="finance-overview-panel p3">
      <h2>P3</h2>
      <strong class="finance-overview-total">${fmtBRL(p3Total)}</strong>
      <span class="finance-overview-caption">Gestao de todos os ativos, mais resultados de sociedades P3.</span>
      <div class="finance-overview-list">${list(p3Rows, row => row.finance?.p3OperationalResult)}</div>
    </article>
    <article class="finance-overview-panel partners">
      <h2>Investidores UBY</h2>
      <strong class="finance-overview-total">${fmtBRL(ubyInvestorTotal)}</strong>
      <span class="finance-overview-caption">Distribuicao por cotas dos ativos UBY, apos a retencao estatutaria.</span>
      <div class="finance-overview-list">${list(ubyInvestorRows, row => row.finance?.investorDistribution, 'Nenhuma distribuicao UBY registrada.')}</div>
    </article>
    <article class="finance-overview-panel investors">
      <h2>Parceiros</h2>
      <strong class="finance-overview-total">${fmtBRL(partnerTotal)}</strong>
      <span class="finance-overview-caption">Lucro liquido distribuido diretamente em sociedades e ativos de parceiros.</span>
      <div class="finance-overview-list">${list(partnerRows, row => row.finance?.partnerInvestorDistribution, 'Nenhum repasse direto a parceiro registrado.')}</div>
    </article>
  `;
}

function renderGeneralFinance(unitData) {
  const activeUnits = (unitData || []).filter(unit =>
    Array.isArray(unit.charges) && unit.charges.length > 0 &&
    (Number(unit.count) > 0 || Number(unit.energy) > 0 || Number(unit.revenue) > 0)
  );
  const rows = generalFinanceByUnit(activeUnits).sort((a, b) => {
    const ownDiff = financeUnitOutcome(b.finance).value - financeUnitOutcome(a.finance).value;
    if (Math.abs(ownDiff) > 0.009) return ownDiff;
    return (Number(b.finance?.revenue) || 0) - (Number(a.finance?.revenue) || 0);
  });
  const total = rows.reduce((acc, row) => {
    Object.entries(row.finance || {}).forEach(([key, value]) => {
      if (!['margin', 'paybackMonths', 'roiMonthly'].includes(key) && Number.isFinite(value)) acc[key] = (acc[key] || 0) + value;
    });
    return acc;
  }, {});
  total.margin = total.revenue ? total.ownResult / total.revenue * 100 : 0;
  total.paybackMonths = total.paybackInvestmentValue > 0 && total.paybackBase > 0 ? total.paybackInvestmentValue / total.paybackBase : 0;
  total.roiMonthly = total.paybackInvestmentValue > 0 ? total.paybackBase / total.paybackInvestmentValue * 100 : 0;
  const best = [...rows].sort((a, b) => financeUnitOutcome(b.finance).value - financeUnitOutcome(a.finance).value)[0];
  renderGeneralFinanceOverview(rows);
  renderUbyFinanceWorkspace(unitData);
  const managementByMonth = new Map();
  rows.forEach(row => (row.financeMonths || []).forEach(({ monthKey, result }) => {
    if (!monthKey) return;
    const item = managementByMonth.get(monthKey) || { monthKey, management: 0, ubyRoyalty: 0, p3SocietyProfit: 0, units: new Set() };
    item.management += Number(result.management || 0);
    item.ubyRoyalty += Number(result.ubyRoyalty || 0);
    item.p3SocietyProfit += Number(result.p3SocietyProfit || 0);
    item.units.add(row.workId || row.workName || row.station || monthKey);
    managementByMonth.set(monthKey, item);
  }));
  const managementRows = [...managementByMonth.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  document.getElementById('generalFinanceHeroMeta').innerHTML =
    `Unidades com base: <strong>${rows.length}</strong><br>Investimento cadastrado: <strong>${fmtBRL(total.investmentValue || 0)}</strong><br>Resultado UBY e royalties: <strong>${fmtBRL(total.ubyNet || 0)}</strong>`;
  document.getElementById('generalFinanceHeroFormula').innerHTML =
    `<strong>Modelo financeiro</strong><br>P3 recebe gestao e sociedades configuradas. Plataforma de terceiros e royalty de marca UBY ficam em linhas separadas.<br>Ativos UBY distribuem por cotas; ativos de terceiros preservam o lucro do parceiro apos os percentuais contratados.`;
  document.getElementById('kpiGeneralFinance').innerHTML = `
    <div class="card"><div class="label">Receita financeira</div><div class="value">${fmtBRL(total.revenue || 0)}</div><div class="sub">base das recargas</div></div>
    <div class="card"><div class="label">Receita P3 total</div><div class="value">${fmtBRL(total.p3Gross || 0)}</div><div class="sub">gestao + sociedades</div></div>
    <div class="card"><div class="label">Sociedades P3</div><div class="value">${fmtBRL(total.p3SocietyProfit || 0)}</div><div class="sub">fora da UBY quando configurado</div></div>
    <div class="card"><div class="label">Royalties UBY</div><div class="value">${fmtBRL(total.ubyRoyalty || 0)}</div><div class="sub">marca em ativos de terceiros</div></div>
    ${total.courtesyCharges ? `<div class="card"><div class="label">Cortesia de parceiros</div><div class="value">${fmtKWh(total.courtesyEnergy || 0)}</div><div class="sub">${fmtBRL(total.courtesyCostExcluded || 0)} fora do resultado UBY</div></div>` : ''}
    <div class="card"><div class="label">Resultado UBY e royalties</div><div class="value">${fmtBRL(total.ubyNet || 0)}</div><div class="sub">ativos UBY + uso de marca</div></div>
    <div class="card"><div class="label">Retencao S.A.</div><div class="value">${fmtBRL(total.saRetention || 0)}</div><div class="sub">retencao estatutaria</div></div>
    <div class="card"><div class="label">Investidores</div><div class="value">${fmtBRL(total.investorDistribution || 0)}</div><div class="sub">repasses por cotas</div></div>
    <div class="card"><div class="label">Payback geral</div><div class="value">${formatPaybackMonths(total.paybackMonths || 0)}</div><div class="sub">investimento / resultado proprio</div></div>
  `;
  document.getElementById('generalFinanceTable').innerHTML = `
    <tr class="finance-group-row"><th colspan="2">Operacao</th></tr>
    <tr><td>Faturamento bruto das recargas</td><td>${fmtBRL(total.revenue || 0)}</td></tr>
    <tr><td>Receitas extras</td><td>${fmtBRL(total.extraRevenue || 0)}</td></tr>
    <tr><td>App e plataforma de terceiros</td><td>${fmtBRL(total.platform || 0)}</td></tr>
    <tr><td>Royalty de marca UBY</td><td>${fmtBRL(total.ubyRoyalty || 0)}</td></tr>
    ${total.courtesyCharges ? `<tr><td>Uso de cortesia de parceiros (memória)</td><td>${fmtKWh(total.courtesyEnergy || 0)} · ${fmtBRL(total.courtesyCostExcluded || 0)} fora do resultado UBY</td></tr>` : ''}
    <tr><td>Demais custos configurados</td><td>${fmtBRL(total.costs || 0)}</td></tr>
    <tr><td>Participacao dos parceiros de area</td><td>${fmtBRL(total.areaParticipation || 0)}</td></tr>
    <tr class="finance-total-row"><td>Custo operacional total</td><td>${fmtBRL(total.totalOperatingCost || 0)}</td></tr>
    <tr class="finance-group-row"><th colspan="2">Distribuicao do resultado</th></tr>
    <tr><td>Gestao P3</td><td>${fmtBRL(total.management || 0)}</td></tr>
    <tr><td>Sociedade P3</td><td>${fmtBRL(total.p3SocietyProfit || 0)}</td></tr>
    <tr><td>Resultado UBY e royalties antes da retencao</td><td>${fmtBRL(total.ubyNet || 0)}</td></tr>
    <tr><td>Retencao obrigatoria S.A.</td><td>${fmtBRL(total.saRetention || 0)}</td></tr>
    <tr><td>Repasse aos investidores</td><td>${fmtBRL(total.investorDistribution || 0)}</td></tr>
    <tr><td>Valor retido pela UBY</td><td>${fmtBRL(total.ubyRetained || 0)}</td></tr>
    <tr><td>Resultado do socio ou local</td><td>${fmtBRL(total.partnerShare || 0)}</td></tr>
    <tr><td>Lucro distribuido diretamente ao parceiro</td><td>${fmtBRL(total.partnerInvestorDistribution || 0)}</td></tr>
    <tr class="finance-group-row"><th colspan="2">Retorno</th></tr>
    <tr><td>Investimento cadastrado</td><td>${fmtBRL(total.investmentValue || 0)}</td></tr>
    <tr><td>Payback estimado</td><td>${formatPaybackMonths(total.paybackMonths || 0)}</td></tr>
    <tr><td>ROI mensal</td><td>${fmtPct(total.roiMonthly || 0)}</td></tr>
    <tr><td>Margem sobre o faturamento</td><td>${fmtPct(total.margin || 0)}</td></tr>
    <tr><td>Melhor unidade financeira</td><td>${best ? `${best.workName} - ${fmtBRL(financeUnitOutcome(best.finance).value)}` : '-'}</td></tr>
  `;
  document.getElementById('generalFinanceUnitTable').innerHTML = rows.length ? rows.map(row => `
    <tr data-operation-model="${normalizeOperationModel(row.finance.operationModel)}">
      <td>${row.workName}</td>
      <td>${operationModelLabel(row.finance.operationModel || 'uby')}</td>
      <td>${fmtBRL(row.finance.revenue || 0)}</td>
      <td>${fmtBRL(row.finance.totalOperatingCost || 0)}</td>
      <td>${fmtBRL(row.finance.management || 0)}</td>
      <td>${fmtBRL(row.finance.ubyRoyalty || 0)}</td>
      <td>${fmtBRL(row.finance.p3OperationalResult || 0)}</td>
      <td>${normalizeOperationModel(row.finance.operationModel) === 'management_only' ? '—' : fmtBRL(row.finance.ubyNet || 0)}</td>
      <td>${fmtBRL(row.finance.partnerShare || 0)}</td>
      <td>${formatPaybackMonths(row.finance.paybackMonths || 0)}</td>
      <td>${financeUnitOpenButton(row)}</td>
    </tr>
  `).join('') : '<tr><td colspan="11" style="color:var(--p3-muted);text-align:center;padding:20px">Sem bases financeiras para consolidar</td></tr>';
  const managementTable = document.getElementById('generalP3ManagementTable');
  if (managementTable) managementTable.innerHTML = managementRows.length ? managementRows.map(item => {
    const p3Total = item.management + item.p3SocietyProfit;
    return `<tr><td>${monthLabel(item.monthKey)}</td><td>${fmtBRL(item.management)}</td><td>${fmtBRL(item.ubyRoyalty)}</td><td>${fmtBRL(item.p3SocietyProfit)}</td><td>${fmtBRL(p3Total)}</td><td>${item.units.size}</td></tr>`;
  }).join('') : '<tr><td colspan="6" style="color:var(--p3-muted);text-align:center;padding:20px">Sem competencias financeiras registradas</td></tr>';
  markOverviewRendered('financeiroGeral');
}

// Mantem a operacao UBY leve: controles de custos compartilhados e leitura
// financeira ficam montados somente na aba Financeiro UBY.
function mountUbyFinanceWorkspace() {
  const mount = document.getElementById('ubyFinanceWorkspaceMount');
  const overview = document.getElementById('ubyFinanceOverview');
  const distribution = document.getElementById('ubyDistribution');
  const matrixList = document.getElementById('matrizCostList');
  if (!mount || !overview || !distribution || !matrixList) return false;
  const blocks = [overview, distribution.closest('section'), matrixList.closest('section')].filter(Boolean);
  blocks.forEach(block => {
    if (block.parentElement !== mount) mount.appendChild(block);
  });
  return true;
}

function renderUbyFinanceWorkspace(unitData) {
  if (!mountUbyFinanceWorkspace()) return;
  const sourceRows = getUbyChargerRows(unitData || []);
  const includedRows = sourceRows.filter(row => row.included);
  const sourceMonths = [...new Set(includedRows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const period = selectedOverviewPeriod(sourceMonths);
  const label = period.isMonthView ? period.label : 'Acumulado UBY';
  renderUbyFinancialOverview(sourceRows, sourceMonths, period.isMonthView, period.monthKey, label);
  renderMatrizCosts(unitData || []);
}

// ── Potência ──────────────────────────────────────────────
function getPower() {
  // Os inputs de potência só existem na página operacional (recargas.html);
  // na página financeira dedicada (financeiro.html) eles não existem, então
  // cai no padrão de 7 kW em vez de travar lendo `.value` de null.
  const chargerPowerEl = document.getElementById('chargerPower');
  const chargerPowerAccEl = document.getElementById('chargerPowerAcc');
  if (!chargerPowerEl && !chargerPowerAccEl) return workPowerById(currentWorkId);
  const v = parseFloat(chargerPowerEl?.value);
  const v2 = parseFloat(chargerPowerAccEl?.value);
  // Sincroniza ambos os inputs
  if (!isNaN(v) && chargerPowerAccEl) chargerPowerAccEl.value = v;
  if (!isNaN(v2) && isNaN(v) && chargerPowerEl) chargerPowerEl.value = v2;
  return isNaN(v) ? (isNaN(v2) ? workPowerById(currentWorkId) : v2) : v;
}

// ── Cálculo de ocupação ───────────────────────────────────
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

function selectedPeriodMode() {
  return document.getElementById('periodMode')?.value || 'mtd';
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

function periodModeLabel(mode = selectedPeriodMode(), mk = '') {
  if (mode === 'closed') return 'mes fechado';
  if (mode === 'mtd') return isCurrentMonthKey(mk) ? 'mes ate agora' : 'mes ate a planilha';
  return `ultimos ${mode} dia${String(mode) === '1' ? '' : 's'}`;
}

function occByInterval(charges, powerOverride, boundsOverride) {
  const power = Number.isFinite(Number(powerOverride)) ? Number(powerOverride) : getPower();
  const bounds = boundsOverride || periodBounds(charges);
  if (!bounds.start || !bounds.end || !bounds.hours) return { pct: 0, hours: 0, maxKWh: 0, energy: 0, power };
  const stationName = currentStationReportName || canonicalStationNameForWork(
    currentWorkId,
    charges[0]?.station || currentWorkName,
    currentWorkName
  );
  const config = stationAvailabilityFor(currentWorkId, stationName, currentWorkName);
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

function commercialOccupancyStats(charges = [], bounds = null) {
  const config = availabilityForCurrentCharges(charges);
  const operational = occByInterval(charges, undefined, bounds);
  const valid = charges.filter(isExecutedCharge);
  const referenceTariff = Math.max(0, Number(config.referenceTariffPerKwh || 0));
  const courtesy = valid.filter(charge => isCourtesyCharge(charge, config));
  const courtesyEnergy = courtesy.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const courtesyRevenue = courtesy.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const revenue = valid.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const potentialRevenue = referenceTariff > 0 ? operational.energy * referenceTariff : 0;
  const commercialEquivalentEnergy = referenceTariff > 0 ? revenue / referenceTariff : 0;
  const commercialPct = operational.maxKWh > 0 && referenceTariff > 0
    ? commercialEquivalentEnergy / operational.maxKWh * 100
    : 0;
  const courtesyPotential = referenceTariff > 0 ? courtesyEnergy * referenceTariff : 0;
  const captureRate = potentialRevenue > 0 ? revenue / potentialRevenue * 100 : 0;
  return {
    config,
    configured: (config.courtesyUsers || []).length > 0 || referenceTariff > 0,
    referenceTariff,
    operational,
    commercialPct,
    commercialEquivalentEnergy,
    courtesy,
    courtesyEnergy,
    courtesyRevenue,
    courtesyPotential,
    captureRate,
    revenue
  };
}

function renderCommercialOccupancyPanel(charges = [], bounds = null) {
  const el = document.getElementById('commercialOccupancyPanel');
  if (!el) return;
  const stats = commercialOccupancyStats(charges, bounds);
  if (!stats.configured) {
    el.innerHTML = '';
    return;
  }
  if (!stats.referenceTariff) {
    el.innerHTML = `<div class="card"><h2>Uso cortesia e ocupacao comercial</h2><div class="note">Cadastre uma tarifa comercial de referencia na configuracao da estacao para separar a ocupacao operacional da comercial.</div></div>`;
    return;
  }
  const band = occupationBand(stats.commercialPct);
  el.innerHTML = `
    <div class="card ${band.className}">
      <h2>Ocupacao comercial e uso cortesia</h2>
      <div class="metric-strip">
        <div class="metric-mini"><span>Ocupacao operacional</span><strong>${fmtPct(stats.operational.pct)}</strong><span>${fmtKWh(stats.operational.energy)} entregues</span></div>
        <div class="metric-mini ${band.className}"><span>Ocupacao comercial</span><strong>${fmtPct(stats.commercialPct)}</strong><span>receita convertida pela tarifa de referencia</span></div>
        <div class="metric-mini ${stats.courtesy.length ? 'warn' : 'good'}"><span>Uso cortesia</span><strong>${stats.courtesy.length} recarga(s)</strong><span>${fmtKWh(stats.courtesyEnergy)} sem receita comercial</span></div>
        <div class="metric-mini ${stats.courtesyPotential ? 'warn' : ''}"><span>Receita potencial nao faturada</span><strong>${fmtBRL(Math.max(0, stats.courtesyPotential - stats.courtesyRevenue))}</strong><span>${fmtBRL(stats.referenceTariff)}/kWh de referencia</span></div>
        <div class="metric-mini"><span>Captura de receita</span><strong>${fmtPct(stats.captureRate)}</strong><span>${fmtBRL(stats.revenue)} de ${fmtBRL(stats.operational.energy * stats.referenceTariff)} potencial</span></div>
      </div>
    <div class="note">A ocupacao operacional mede energia entregue. A comercial converte somente a receita efetiva em kWh pela tarifa de referencia, evitando que recargas gratuitas mascarem o resultado financeiro.</div>
    </div>`;
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
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function chartAxisOptions(unit = '') {
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { color: '#8FA39A', callback: v => unit ? `${v}${unit}` : v }, grid: { color: '#24364E' } },
      x: { ticks: { color: '#8FA39A', font: { size: 10 } }, grid: { color: '#24364E' } }
    }
  };
}

function renderBarChart(id, labels, values, color = '#57B7FF', unit = '') {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values.map(v => +Number(v || 0).toFixed(2)), backgroundColor: color, borderRadius: 4 }] },
    options: chartAxisOptions(unit)
  });
}

function renderSmoothLineChart(id, labels, values, color = '#57B7FF', unit = '') {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values.map(v => +Number(v || 0).toFixed(2)),
        borderColor: color,
        backgroundColor: `${color}22`,
        pointBackgroundColor: color,
        pointBorderColor: '#0E1B2D',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        tension: 0.38,
        fill: true
      }]
    },
    options: chartAxisOptions(unit)
  });
}

function renderPieChart(id, labels, values) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: COLORS, borderColor: '#0E1B2D', borderWidth: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { color: '#8FA39A', font: { size: 11 } } } } }
  });
}

function renderCouponDonutChart(id, labels, values, unit = '') {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const numericValues = values.map(value => +Number(value || 0).toFixed(2));
  const total = numericValues.reduce((sum, value) => sum + Number(value || 0), 0);
  const displayLabels = labels.map((label, index) => `${label} ${fmtPct(total ? numericValues[index] / total * 100 : 0)}`);
  const hasData = numericValues.some(value => Number(value || 0) > 0);
  charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: displayLabels,
      datasets: [{
        data: numericValues,
        backgroundColor: hasData ? COLORS : ['#20344F'],
        borderColor: '#0E1B2D',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#BFD4CC', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: context => {
              const label = context.label || 'Cupom';
              const value = Number(context.raw || 0);
              const total = context.dataset.data.reduce((sum, item) => sum + Number(item || 0), 0);
              const pct = total ? value / total * 100 : 0;
              const formatted = unit === ' R$' ? fmtBRL(value) : `${value.toLocaleString('pt-BR')} uso(s)`;
              return `${label}: ${formatted} (${fmtPct(pct)})`;
            }
          }
        }
      }
    }
  });
}

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

function chargeDisplayDay(charge = {}) {
  return charge?.startDate && !Number.isNaN(charge.startDate.getTime()) ? chargeDayLabel(charge) : 'Sem data';
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

function dailyFinancialSeries(charges = []) {
  const dated = charges.filter(c => c.startDate && !Number.isNaN(c.startDate.getTime()));
  if (!dated.length) return { labels: [], revenue: [], idleValue: [] };

  const byDay = {};
  const bounds = dailySeriesBounds(dated);
  eachDateInRange(bounds.start, bounds.end).forEach(date => {
    const label = dayLabelFromDate(date);
    byDay[label] = { date, revenue: 0, idleValue: 0 };
  });
  dated.forEach(charge => {
    const label = chargeDayLabel(charge);
    if (!byDay[label]) {
      byDay[label] = {
        date: dateOnly(charge.startDate),
        revenue: 0,
        idleValue: 0
      };
    }
    byDay[label].revenue += Number(charge.revenue || 0);
    byDay[label].idleValue += Number(charge.idleValue || 0);
  });

  const rows = Object.entries(byDay).sort((a, b) => a[1].date - b[1].date);
  return {
    labels: rows.map(([label]) => label),
    revenue: rows.map(([, day]) => day.revenue),
    idleValue: rows.map(([, day]) => day.idleValue)
  };
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
  const dated = charges.filter(c => c.startDate && !Number.isNaN(c.startDate.getTime()));
  if (!dated.length) return [];
  const firstClientDay = firstClientDayMap(historyCharges?.length ? historyCharges : charges);
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
    const client = clientKeyFromCharge(charge);
    byDay[key].revenue += Number(charge.revenue || 0);
    byDay[key].energy += Number(charge.energyKWh || 0);
    byDay[key].count += 1;
    if (client) byDay[key].clients.add(client);
    if (client && firstClientDay[client] === key) byDay[key].newClients.add(client);
    if (isFailedCharge(charge)) byDay[key].failed += 1;
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

const WEEKDAY_LABELS_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const WEEKDAY_ORDER_BR = [1, 2, 3, 4, 5, 6, 0];

function signedMoney(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? '+' : '-'}${fmtBRL(Math.abs(n))}`;
}

function signedNumber(value, suffix = '') {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace('.', ',');
  return `${n >= 0 ? '+' : '-'}${formatted}${suffix}`;
}

function trendInfo(value, formatter = signedNumber) {
  const n = Number(value || 0);
  const cls = n > 0.009 ? 'up' : (n < -0.009 ? 'down' : 'flat');
  const arrow = cls === 'up' ? '&#8593;' : (cls === 'down' ? '&#8595;' : '&#8594;');
  return { cls, arrow, text: formatter(n) };
}

function periodChangeBadge(current = 0, previous = 0, hasPrevious = true, formatter = signedNumber) {
  if (!hasPrevious) return { cls: 'flat', arrow: '&#8594;', text: 'Sem base' };
  const now = Number(current || 0);
  const before = Number(previous || 0);
  if (Math.abs(before) < 0.0001) {
    if (Math.abs(now) < 0.0001) return { cls: 'flat', arrow: '&#8594;', text: formatter(0) };
    return { cls: 'up', arrow: '&#8599;', text: 'Novo' };
  }
  const change = now - before;
  const cls = change > 0.009 ? 'up' : (change < -0.009 ? 'down' : 'flat');
  const arrow = cls === 'up' ? '&#8599;' : (cls === 'down' ? '&#8600;' : '&#8594;');
  return { cls, arrow, text: formatter(change) };
}

function signedDuration(value = 0) {
  const n = Number(value || 0);
  const sign = n > 0.009 ? '+' : (n < -0.009 ? '-' : '');
  return `${sign}${formatRechargeDuration(Math.abs(n))}`;
}

function metricPeriodTrend(current, previous, comparison, formatter = signedNumber, inverse = false) {
  const badge = periodChangeBadge(current, previous, comparison?.hasPrevious, formatter);
  const cls = inverse && badge.cls !== 'flat'
    ? (badge.cls === 'up' ? 'down' : 'up')
    : badge.cls;
  const label = comparison?.label || 'sem base';
  return `<div class="metric-period-trend ${cls}">
    <span class="metric-period-arrow">${badge.arrow}</span>
    <span><strong>${badge.text}</strong><small>${label}</small></span>
  </div>`;
}

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

function dailyOccupationPct(energy = 0, date, availability, power) {
  if (!date || Number.isNaN(date.getTime())) return 0;
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const hours = stationAvailableHours(availability, dayStart, dayEnd);
  const capacity = Math.max(Number(power) || 0, 0) * hours;
  return capacity > 0 ? Number(energy || 0) / capacity * 100 : 0;
}

// Faixa visual unica para todos os indicadores de ocupacao.
function occupationBand(value = 0) {
  const pct = Math.max(0, Number(value) || 0);
  if (pct <= 5) return { className: 'occ-red', label: 'critica', range: 'ate 5%' };
  if (pct <= 10) return { className: 'occ-yellow', label: 'atencao', range: 'de 5% a 10%' };
  if (pct <= 20) return { className: 'occ-blue', label: 'em evolucao', range: 'de 10% a 20%' };
  return { className: 'occ-green', label: 'forte', range: 'acima de 20%' };
}

function kpiDayTrend(charges = [], metric = 'revenue', historyCharges = charges) {
  const rows = dailyOperationalRows(charges, historyCharges);
  if (rows.length < 2) return '';
  const last = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const current = Number(last?.[metric] || 0);
  const before = Number(previous?.[metric] || 0);
  const diff = current - before;
  const formatter = metric === 'revenue' ? signedMoney : (metric === 'energy' ? value => signedNumber(value, ' kWh') : value => signedNumber(value));
  const trend = trendInfo(diff, formatter);
  return `<span class="kpi-trend ${trend.cls}">${trend.arrow} ${trend.text} vs ${previous.label}</span>`;
}

function renderVisualSummary(elId, charges = [], options = {}) {
  const el = document.getElementById(elId);
  if (!el) return;
  const current = summaryMetrics(charges);
  const total = current.count;
  const revenue = current.revenue;
  const energy = current.energy;
  const clients = current.clients;
  const occ = options.occ || occByInterval(charges, options.power, options.bounds);
  const power = Number(occ.power || options.power || getPower() || 0);
  const comparison = options.showMonthComparison === false
    ? { hasPrevious: false, label: 'sem comparacao', metrics: summaryMetrics([]), occupation: 0 }
    : monthlyEquivalentComparison(charges, options.historyCharges || charges, options.bounds, occ, power);
  const previous = comparison.metrics;
  const occBand = occupationBand(occ.pct);
  const imgBolt = "url('assets/brand/v2/09_sobre_midnight.png')";
  const imgBadge = "url('assets/brand/v2/09_sobre_midnight.png')";
  const cards = [
    { title: 'Ocupacao do periodo', value: fmtPct(occ.pct), sub: `faixa ${occBand.label}: ${occBand.range}`, badge: periodChangeBadge(occ.pct, comparison.occupation, comparison.hasPrevious, value => `${value >= 0 ? '+' : '-'}${fmtPct(Math.abs(value))} p.p.`), cls: occBand.className, img: imgBolt },
    { title: 'Faturamento', value: fmtBRL(revenue), sub: 'acumulado no periodo selecionado', badge: periodChangeBadge(revenue, previous.revenue, comparison.hasPrevious, signedMoney), cls: '', img: imgBadge },
    { title: 'Consumo de energia', value: fmtKWh(energy), sub: 'energia entregue no periodo', badge: periodChangeBadge(energy, previous.energy, comparison.hasPrevious, value => signedNumber(value, ' kWh')), cls: 'warn', img: imgBolt },
    { title: 'Clientes atendidos', value: String(clients), sub: `${current.clean.avgKwh.toFixed(1).replace('.', ',')} kWh/sessao valida`, badge: periodChangeBadge(clients, previous.clients, comparison.hasPrevious, signedNumber), cls: '', img: imgBadge },
    { title: 'Total de transacoes', value: String(total), sub: 'recargas no periodo selecionado', badge: periodChangeBadge(total, previous.count, comparison.hasPrevious, signedNumber), cls: 'warn', img: imgBolt }
  ];
  el.innerHTML = cards.map((card, index) => `
    <div class="visual-card ${index < 2 ? 'feature main' : ''} ${card.cls || ''}" style="--visual-img:${card.img}">
      <div class="visual-title">${card.title}</div>
      <div class="visual-content">
        <div class="visual-value">${card.value}</div>
      </div>
      <div class="visual-footer">
        <div class="visual-sub">${card.sub}</div>
        <div class="visual-period-trend ${card.badge.cls}" title="Comparacao com o mesmo corte do mes anterior">
          <span class="visual-period-arrow">${card.badge.arrow}</span>
          <span><strong>${card.badge.text}</strong><small>${comparison.label}</small></span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderDayComparison(prefix = 'usage', charges = [], historyCharges = charges) {
  const el = document.getElementById(`${prefix}DayCompare`);
  if (!el) return;
  const rows = dailyOperationalRows(charges, historyCharges);
  if (!rows.length) {
    el.innerHTML = '';
    return;
  }
  const last = rows[rows.length - 1];
  const previous = rows[rows.length - 2] || { label: 'dia anterior', revenue: 0, count: 0, energy: 0, clientCount: 0, failed: 0 };
  const metrics = [
    { label: 'Faturamento do dia', value: fmtBRL(last.revenue), diff: last.revenue - previous.revenue, formatter: signedMoney, sub: `${last.label} vs ${previous.label}` },
    { label: 'Transacoes', value: String(last.count), diff: last.count - previous.count, formatter: value => signedNumber(value), sub: `${last.newClientCount || 0} cliente(s) novo(s)` },
    { label: 'Energia entregue', value: fmtKWh(last.energy), diff: last.energy - previous.energy, formatter: value => signedNumber(value, ' kWh'), sub: `${last.clientCount || 0} cliente(s) no dia`, tone: 'is-warning' },
    { label: 'Falhas do dia', value: String(last.failed || 0), diff: (last.failed || 0) - (previous.failed || 0), formatter: value => signedNumber(value), sub: 'queda em falhas e melhor', tone: (last.failed || 0) > 0 ? 'is-danger' : '' }
  ];
  el.innerHTML = metrics.map(metric => {
    const trend = trendInfo(metric.diff, metric.formatter);
    const trendClass = metric.label === 'Falhas do dia'
      ? (metric.diff < 0 ? 'up' : (metric.diff > 0 ? 'down' : 'flat'))
      : trend.cls;
    return `
      <div class="day-kpi-card ${metric.tone || ''}" style="--day-visual-img:url('assets/brand/v2/09_sobre_midnight.png')">
        <div class="label">${metric.label}</div>
        <strong>${metric.value}</strong>
        <div class="day-footer"><small>${metric.sub}</small><span class="trend-badge ${trendClass}"><span>${trend.arrow}</span><span><strong>${trend.text}</strong><small>vs ${previous.label}</small></span></span></div>
      </div>
    `;
  }).join('');
}

function weekdayReportRows(charges = [], historyCharges = charges) {
  const firstClientDay = firstClientDayMap(historyCharges?.length ? historyCharges : charges);
  const groups = {};
  WEEKDAY_ORDER_BR.forEach(idx => {
    groups[idx] = { idx, label: WEEKDAY_LABELS_BR[idx], dates: new Set(), revenue: 0, energy: 0, count: 0, clients: new Set(), newClients: new Set(), failed: 0 };
  });
  charges
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()))
    .forEach(charge => {
      const idx = charge.startDate.getDay();
      const group = groups[idx] || (groups[idx] = { idx, label: WEEKDAY_LABELS_BR[idx], dates: new Set(), revenue: 0, energy: 0, count: 0, clients: new Set(), newClients: new Set(), failed: 0 });
      const key = chargeDayKeyFromDate(charge.startDate);
      const client = clientKeyFromCharge(charge);
      group.dates.add(key);
      group.revenue += Number(charge.revenue || 0);
      group.energy += Number(charge.energyKWh || 0);
      group.count += 1;
      if (client) group.clients.add(client);
      if (client && firstClientDay[client] === key) group.newClients.add(client);
      if (isFailedCharge(charge)) group.failed += 1;
    });
  return WEEKDAY_ORDER_BR.map(idx => {
    const row = groups[idx];
    const days = row.dates.size || 0;
    const validCount = Math.max(0, row.count - row.failed);
    return {
      ...row,
      days,
      clientCount: row.clients.size,
      newClientCount: row.newClients.size,
      avgRevenue: days ? row.revenue / days : 0,
      avgTicket: validCount ? row.revenue / validCount : 0
    };
  });
}

function renderWeekdayReport(prefix = 'usage', charges = [], historyCharges = charges) {
  const el = document.getElementById(`${prefix}WeekdayReport`);
  if (!el) return;
  const rows = weekdayReportRows(charges, historyCharges);
  const activeRows = rows.filter(row => row.count || row.revenue || row.energy);
  if (!activeRows.length) {
    el.innerHTML = '';
    return;
  }
  const best = activeRows.slice().sort((a, b) => b.avgRevenue - a.avgRevenue)[0];
  const maxRevenue = Math.max(...activeRows.map(row => row.avgRevenue), 1);
  const bars = rows.map(row => {
    const pct = Math.max(2, Math.min(100, row.avgRevenue / maxRevenue * 100));
    return `
      <div class="weekday-bar">
        <strong>${row.label}</strong>
        <span class="track"><i style="width:${pct}%"></i></span>
        <span>${fmtBRL(row.avgRevenue)}</span>
      </div>
    `;
  }).join('');
  const tableRows = rows.map(row => `
    <tr class="${row.idx === best.idx ? 'best-day' : ''}">
      <td>${row.label}</td>
      <td>${row.days}</td>
      <td>${row.count}</td>
      <td>${row.clientCount}</td>
      <td>${fmtKWh(row.energy)}</td>
      <td>${fmtBRL(row.revenue)}</td>
      <td>${fmtBRL(row.avgRevenue)}</td>
      <td>${fmtBRL(row.avgTicket)}</td>
    </tr>
  `).join('');
  el.innerHTML = `
    <div class="card">
      <h2>Dinamica por dia da semana</h2>
      <div class="weekday-bars">${bars}</div>
      <div class="weekday-best">
        <strong>Melhor dia medio: ${best.label}</strong>
        <span>${fmtBRL(best.avgRevenue)} por dia com movimento, ${best.count} recarga(s) no periodo.</span>
      </div>
    </div>
    <div class="card">
      <h2>Relatorio do dia da semana</h2>
      <div style="overflow-x:auto">
        <table class="weekday-table">
          <thead><tr><th>Dia</th><th>Dias</th><th>Recargas</th><th>Clientes</th><th>kWh</th><th>Receita</th><th>Media/dia</th><th>Ticket</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;
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

function occClassForPct(pct = 0) {
  return occupationBand(pct).className;
}

function renderWeekdayOccupancyReport(elId, charges = [], power = getPower(), title = 'Dinamica semanal de ocupacao', bounds = null) {
  const el = document.getElementById(elId);
  if (!el) return;
  const rows = weekdayOccupancyRows(charges, power, bounds);
  const activeRows = rows.filter(row => row.days || row.count || row.energy || row.revenue);
  if (!activeRows.length) {
    el.innerHTML = '';
    return;
  }
  const best = activeRows.slice().sort((a, b) => b.occ - a.occ || b.revenue - a.revenue)[0];
  const worst = activeRows.slice().sort((a, b) => a.occ - b.occ || a.revenue - b.revenue)[0];
  const maxOcc = Math.max(...activeRows.map(row => row.occ), 1);
  const bars = rows.map(row => {
    const width = row.days ? Math.max(2, Math.min(100, row.occ / maxOcc * 100)) : 0;
    return `
      <div class="weekday-bar">
        <strong>${row.label}</strong>
        <span class="track"><i class="${occClassForPct(row.occ)}" style="width:${width.toFixed(1)}%"></i></span>
        <span>${fmtPct(row.occ)} · ${row.count} rec.</span>
      </div>
    `;
  }).join('');
  const tableRows = rows.map(row => `
    <tr class="${row.idx === best.idx ? 'best-day' : ''}">
      <td>${row.label}</td>
      <td>${row.days}</td>
      <td><strong>${fmtPct(row.occ)}</strong><small>${fmtKWh(row.energy)}</small></td>
      <td>${row.count}</td>
      <td>${row.clientCount}</td>
      <td>${fmtBRL(row.revenue)}</td>
      <td>${fmtBRL(row.avgRevenue)}</td>
      <td>${fmtBRL(row.avgTicket)}</td>
    </tr>
  `).join('');
  el.innerHTML = `
    <div class="card">
      <h2>${title}</h2>
      <div class="weekday-bars">${bars}</div>
      <div class="weekday-best">
        <strong>Melhor ocupacao: ${best.label} (${fmtPct(best.occ)})</strong>
        <span>Pior dia: ${worst.label} (${fmtPct(worst.occ)}). A leitura usa todos os dias do periodo selecionado.</span>
      </div>
    </div>
    <div class="card">
      <h2>Relatorio semanal</h2>
      <div style="overflow-x:auto">
        <table class="weekday-table">
          <thead><tr><th>Dia</th><th>Dias</th><th>Ocupacao</th><th>Recargas</th><th>Clientes</th><th>Receita</th><th>Media/dia</th><th>Ticket</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;
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

function parseLocalDateKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function sameDayPreviousMonth(date) {
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const day = Math.min(date.getDate(), daysInMonth(prev.getFullYear(), prev.getMonth() + 1));
  prev.setDate(day);
  return prev;
}

function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function contextTagsForDate(date, external = {}) {
  const tags = [];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const weekday = date.getDay();
  const dateKey = dateKeyLocal(date);
  const apiHoliday = external.holidays?.[dateKey];
  if (apiHoliday) tags.push({ text: apiHoliday, type: 'warn' });
  const fixed = {
    '1-1': 'Confraternização',
    '4-21': 'Tiradentes',
    '5-1': 'Dia do Trabalho',
    '6-12': 'Dia dos Namorados',
    '7-9': 'Feriado SP',
    '9-7': 'Independência',
    '10-12': 'N. Sra. Aparecida',
    '11-2': 'Finados',
    '11-15': 'República',
    '11-20': 'Consciência Negra',
    '12-25': 'Natal'
  };
  const fixedLabel = fixed[`${month}-${day}`];
  if (fixedLabel && !apiHoliday) tags.push({ text: fixedLabel, type: 'warn' });
  const easter = easterDate(date.getFullYear());
  const movable = new Map([
    [dateKeyLocal(addDays(easter, -48)), 'Carnaval'],
    [dateKeyLocal(addDays(easter, -47)), 'Carnaval'],
    [dateKeyLocal(addDays(easter, -2)), 'Sexta-feira Santa'],
    [dateKeyLocal(easter), 'Páscoa'],
    [dateKeyLocal(addDays(easter, 60)), 'Corpus Christi']
  ]);
  const movableLabel = movable.get(dateKeyLocal(date));
  if (movableLabel) tags.push({ text: movableLabel, type: 'warn' });
  if (weekday === 0 || weekday === 6) tags.push({ text: 'Fim de semana', type: 'muted' });
  if (day >= 1 && day <= 7) tags.push({ text: 'Janela salário', type: 'muted' });
  if (day >= 20 && day <= 25) tags.push({ text: 'Fim de mês', type: 'muted' });
  if (day >= 10 && day <= 15) tags.push({ text: 'Vale/adiantamento', type: 'muted' });
  const weather = external.weather?.[dateKey];
  if (weather) {
    const rain = Number(weather.rain || 0);
    if (rain >= 1) tags.push({ text: `Chuva ${rain.toFixed(1).replace('.', ',')}mm`, type: 'warn' });
    else if (rain > 0) tags.push({ text: `Chuva leve ${rain.toFixed(1).replace('.', ',')}mm`, type: 'muted' });
    else tags.push({ text: 'Sem chuva', type: 'muted' });
  } else if (external.loading) {
    tags.push({ text: 'Chuva carregando', type: 'muted' });
  } else {
    tags.push({ text: 'Chuva indisponivel', type: 'muted' });
  }
  return tags.slice(0, 6);
}

function calendarContextCache() {
  return readJson(CALENDAR_CONTEXT_CACHE_KEY, {});
}

function writeCalendarContextCache(cache) {
  tryWriteJson(CALENDAR_CONTEXT_CACHE_KEY, cache);
}

async function cachedFetchJson(cacheKey, url, ttl = CALENDAR_CONTEXT_TTL_MS) {
  const cache = calendarContextCache();
  const hit = cache[cacheKey];
  if (hit?.updatedAt && Date.now() - hit.updatedAt < ttl) return hit.data;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha API ${response.status}`);
  const data = await response.json();
  cache[cacheKey] = { updatedAt: Date.now(), data };
  writeCalendarContextCache(cache);
  return data;
}

function weatherCodeLabel(code) {
  const n = Number(code);
  if ([0].includes(n)) return 'Céu limpo';
  if ([1, 2, 3].includes(n)) return 'Nublado';
  if ([45, 48].includes(n)) return 'Neblina';
  if ([51, 53, 55, 56, 57].includes(n)) return 'Garoa';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return 'Chuva';
  if ([95, 96, 99].includes(n)) return 'Temporal';
  return 'Clima normal';
}

async function fetchBrazilHolidays(year) {
  try {
    const url = `https://date.nager.at/api/v4/Holidays/BR/${year}`;
    const rows = await cachedFetchJson(`holidays-BR-${year}`, url, 30 * 24 * 60 * 60 * 1000);
    const map = {};
    (rows || []).forEach(item => {
      if (!item?.date) return;
      map[item.date] = item.localName || item.name || 'Feriado';
    });
    return map;
  } catch (err) {
    return {};
  }
}

function parseWeatherDailyResponse(data = {}, location = {}) {
  const map = {};
  const daily = data?.daily || {};
  (daily.time || []).forEach((date, index) => {
    const rain = Number(daily.precipitation_sum?.[index] || 0);
    const code = daily.weather_code?.[index];
    map[date] = {
      location: location.name,
      rain,
      code,
      label: weatherCodeLabel(code),
      tMax: Number(daily.temperature_2m_max?.[index]),
      tMin: Number(daily.temperature_2m_min?.[index])
    };
  });
  return map;
}

function validCoordinate(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function workWeatherLocation(work = currentWork()) {
  const lat = validCoordinate(work?.weatherLat ?? work?.latitude ?? work?.lat);
  const lon = validCoordinate(work?.weatherLon ?? work?.longitude ?? work?.lng ?? work?.lon);
  if (lat !== null && lon !== null) {
    return {
      key: `custom-${work?.id || 'obra'}-${lat.toFixed(4)}-${lon.toFixed(4)}`,
      name: work?.cidade || work?.local || work?.nome || 'Local da obra',
      lat,
      lon,
      source: 'obra'
    };
  }
  return null;
}

function calendarLocationForCharges(charges = []) {
  const custom = workWeatherLocation();
  if (custom) return custom;
  const scores = WEATHER_LOCATIONS.map(location => ({ ...location, score: 0 }));
  const work = currentWork();
  const workText = safeText(`${currentWorkName} ${work?.local || ''} ${work?.cidade || ''} ${work?.uf || ''} ${work?.cliente || ''}`);
  charges.forEach(charge => {
    const haystack = normalizeTextForInsight(`${charge.station || ''} ${charge.workName || ''} ${workText}`);
    scores.forEach(location => {
      if (location.aliases.some(alias => haystack.includes(normalizeTextForInsight(alias)))) location.score += 1;
    });
  });
  const best = scores.sort((a, b) => b.score - a.score)[0];
  return best?.score > 0 ? best : WEATHER_LOCATIONS[0];
}

async function fetchWeatherContext(charges = [], startDate, endDate) {
  const location = calendarLocationForCharges(charges);
  // Sem coordenadas válidas (obra sem lat/lon) a API responde 400. Pula a
  // busca de clima em vez de disparar requisições que sempre falham.
  const _lat = validCoordinate(location?.lat);
  const _lon = validCoordinate(location?.lon);
  if (_lat === null || _lon === null || (_lat === 0 && _lon === 0)) {
    return { map: {}, location: location || {} };
  }
  try {
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      start_date: dateKeyLocal(startDate),
      end_date: dateKeyLocal(endDate),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      timezone: 'America/Sao_Paulo'
    });
    const url = `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
    const data = await cachedFetchJson(`weather-${location.key}-${dateKeyLocal(startDate)}-${dateKeyLocal(endDate)}`, url);
    const map = parseWeatherDailyResponse(data, location);
    if (Object.keys(map).length) return { map, location };
    throw new Error('Sem dados historicos de clima para o periodo');
  } catch (err) {
    try {
      const today = new Date();
      const diffDays = Math.max(1, Math.ceil((today - startDate) / 86400000) + 2);
      const params = new URLSearchParams({
        latitude: String(location.lat),
        longitude: String(location.lon),
        past_days: String(Math.min(Math.max(diffDays, 1), 92)),
        forecast_days: '16',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
        timezone: 'America/Sao_Paulo'
      });
      const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
      const data = await cachedFetchJson(`weather-forecast-${location.key}-${dateKeyLocal(startDate)}-${dateKeyLocal(endDate)}`, url, 6 * 60 * 60 * 1000);
      return { map: parseWeatherDailyResponse(data, location), location, fallback: true };
    } catch (fallbackErr) {
      return { map: {}, location, error: `${err.message}; ${fallbackErr.message}` };
    }
  }
}

function calendarBoundsFromCharges(charges = []) {
  const dated = charges.filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()));
  if (!dated.length) return null;
  const maxDate = new Date(Math.max(...dated.map(charge => charge.startDate)));
  return {
    year: maxDate.getFullYear(),
    month: maxDate.getMonth()
  };
}

function dailyMapForCalendar(charges = [], historyCharges = charges) {
  const map = {};
  const firstClientDay = firstClientDayMap(historyCharges?.length ? historyCharges : charges);
  charges.forEach(charge => {
    if (!charge.startDate || Number.isNaN(charge.startDate.getTime())) return;
    const key = dateKeyLocal(charge.startDate);
    if (!map[key]) map[key] = { revenue: 0, count: 0, energy: 0, failed: 0, newClients: new Set() };
    const client = clientKeyFromCharge(charge);
    map[key].revenue += Number(charge.revenue || 0);
    map[key].count += 1;
    map[key].energy += Number(charge.energyKWh || 0);
    if (client && firstClientDay[client] === key) map[key].newClients.add(client);
    if (isFailedCharge(charge)) map[key].failed += 1;
  });
  Object.values(map).forEach(day => {
    day.newClientCount = day.newClients?.size || 0;
  });
  return map;
}

function dailyMapForCalendarByDayOfMonth(charges = [], historyCharges = charges) {
  const map = {};
  const firstClientDay = firstClientDayMap(historyCharges?.length ? historyCharges : charges);
  charges.forEach(charge => {
    if (!charge.startDate || Number.isNaN(charge.startDate.getTime())) return;
    const day = charge.startDate.getDate();
    if (!map[day]) map[day] = { revenue: 0, count: 0, energy: 0, failed: 0, newClients: new Set(), months: new Set() };
    const client = clientKeyFromCharge(charge);
    map[day].revenue += Number(charge.revenue || 0);
    map[day].count += 1;
    map[day].energy += Number(charge.energyKWh || 0);
    map[day].months.add(chargeMonthKey(charge));
    if (client && firstClientDay[client] === dateKeyLocal(charge.startDate)) map[day].newClients.add(client);
    if (isFailedCharge(charge)) map[day].failed += 1;
  });
  Object.values(map).forEach(day => {
    day.newClientCount = day.newClients?.size || 0;
    day.monthCount = [...(day.months || [])].filter(month => month !== 'unknown').length;
  });
  return map;
}

function weatherTagsForDayOfMonth(day, external = {}) {
  const rows = Object.entries(external.weather || {})
    .filter(([key]) => {
      const date = parseLocalDateKey(key);
      return date && date.getDate() === day;
    })
    .map(([, weather]) => weather);
  if (!rows.length) {
    if (external.loading) return [{ text: 'Chuva carregando', type: 'muted' }];
    return [{ text: 'Chuva indisponivel', type: 'muted' }];
  }
  const rainy = rows.filter(weather => Number(weather.rain || 0) > 0);
  const rainTotal = rainy.reduce((sum, weather) => sum + Number(weather.rain || 0), 0);
  if (!rainy.length) return [{ text: 'Sem chuva nos dias', type: 'muted' }];
  return [{ text: `Chuva em ${rainy.length} dia(s): ${rainTotal.toFixed(1).replace('.', ',')}mm`, type: rainTotal >= 5 ? 'warn' : 'muted' }];
}

function renderOperationalCalendar(prefix = 'usage', charges = [], historyCharges = charges, options = {}) {
  const el = document.getElementById(`${prefix}Calendar`);
  if (!el) return;
  const bounds = calendarBoundsFromCharges(charges);
  if (!bounds) {
    el.innerHTML = '<div class="note">Sem datas validas para montar o calendario operacional.</div>';
    return;
  }
  const calendarMode = options.mode || 'month';
  const isDayOfMonthAccumulated = calendarMode === 'dayOfMonthAccumulated';
  const monthCharges = charges.filter(charge => charge.startDate && charge.startDate.getFullYear() === bounds.year && charge.startDate.getMonth() === bounds.month);
  const currentMap = dailyMapForCalendar(monthCharges, historyCharges);
  const dayOfMonthMap = dailyMapForCalendarByDayOfMonth(charges, historyCharges);
  const historyMap = dailyMapForCalendar(historyCharges, historyCharges);
  const first = new Date(bounds.year, bounds.month, 1);
  const totalDays = daysInMonth(bounds.year, bounds.month + 1);
  const firstDay = new Date(bounds.year, bounds.month, 1);
  const lastDay = new Date(bounds.year, bounds.month, totalDays);
  const dated = charges.filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()));
  // Usa os mesmos limites do card "Ocupação do período" e do relatório
  // semanal (options.bounds, vindo de reportEndForCharges/periodWindow —
  // baseado no fim real da última recarga) quando disponíveis, em vez de
  // recalcular com base só no início da última recarga: isso já causava uma
  // divergência mesmo antes de considerar o recorte de horas do dia.
  const periodStart = options.bounds?.start || (dated.length ? new Date(Math.min(...dated.map(charge => charge.startDate))) : firstDay);
  const periodEnd = options.bounds?.end || (dated.length ? new Date(Math.max(...dated.map(charge => charge.startDate))) : lastDay);
  const calendarPower = Math.max(Number(options.power || getPower() || 0), 0);
  const availability = availabilityForCurrentCharges(charges);
  // Cada dia usa a mesma agenda operacional configurada para a estação. Em
  // estações com expediente reduzido, 08:00-21:00 significa 13h disponíveis,
  // nunca 24h. O intervalo é recortado no primeiro e último dia parcial.
  const dayOccupation = (energy = 0, dates = [], clampToPeriod = true) => {
    const hours = dates.reduce((total, date) => {
      if (!date || Number.isNaN(date.getTime())) return total;
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const startMs = clampToPeriod ? Math.max(dayStart.getTime(), periodStart.getTime()) : dayStart.getTime();
      const endMs = clampToPeriod ? Math.min(dayEnd.getTime(), periodEnd.getTime()) : dayEnd.getTime();
      if (endMs <= startMs) return total;
      return total + stationAvailableHours(availability, new Date(startMs), new Date(endMs));
    }, 0);
    const maxKWh = calendarPower * hours;
    const pct = maxKWh > 0 ? Number(energy || 0) / maxKWh * 100 : 0;
    const cls = occupationBand(pct).className;
    return { pct, cls };
  };
  const build = (external = {}) => {
    const weekHeads = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'].map(day => `<div class="calendar-head">${day}</div>`).join('');
    const locationLabel = external.location?.name
      ? `<div class="note" style="margin-bottom:10px">Chuva via Open-Meteo: ${escapeHtml(external.location.name)}${external.fallback ? ' (fonte forecast)' : ''}. ${isDayOfMonthAccumulated ? 'Calendario acumulado por dia do mes.' : 'Feriados via Nager.Date Brasil.'}</div>`
      : '';

    if (isDayOfMonthAccumulated) {
      const dayHeads = ['Dia','Receita','Recargas','kWh','Contexto'].map(day => `<div class="calendar-head">${day}</div>`).join('');
      const days = Array.from({ length: 31 }, (_, index) => {
        const day = index + 1;
        const item = dayOfMonthMap[day] || { revenue: 0, count: 0, energy: 0, failed: 0, newClientCount: 0, monthCount: 0 };
        const hasMovement = item.count > 0 || item.revenue > 0;
        const avgDayRevenue = item.monthCount ? item.revenue / item.monthCount : 0;
        const dayDates = [...(item.months || [])]
          .filter(monthKey => monthKey && monthKey !== 'unknown')
          .map(monthKey => {
            const [year, month] = String(monthKey).split('-').map(Number);
            return Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month - 1, day) : null;
          })
          .filter(Boolean);
        const occ = dayOccupation(item.energy, dayDates, false);
        const cls = !hasMovement ? '' : (avgDayRevenue >= 150 ? 'good' : (avgDayRevenue <= 30 ? 'down' : 'warn'));
        const tags = weatherTagsForDayOfMonth(day, external).map(tag => `<span class="calendar-tag ${tag.type || ''}">${escapeHtml(tag.text)}</span>`).join('');
        return `<div class="calendar-day ${cls}">
          <div class="day-num"><span>Dia ${day}</span><span>${item.failed ? `${item.failed} erro(s)` : ''}</span></div>
          <div class="day-main">${fmtBRL(item.revenue)}</div>
          <div class="day-sub">${item.count} recarga(s) - ${fmtKWh(item.energy)}</div>
          <div class="day-occ ${occ.cls}">Ocup. media/dia: ${fmtPct(occ.pct)}</div>
          <div class="day-sub">${item.monthCount || 0} mes(es) com movimento</div>
          <div class="day-sub">${item.newClientCount ? `${item.newClientCount} cliente(s) novo(s)` : 'sem cliente novo'}</div>
          <div class="calendar-tags">${tags}</div>
        </div>`;
      }).join('');
      el.innerHTML = `${locationLabel}<div class="calendar-grid">${dayHeads}${days}</div>`;
      return;
    }

    const blanks = Array.from({ length: first.getDay() }, () => '<div class="calendar-day empty"></div>').join('');
    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(bounds.year, bounds.month, index + 1);
      const key = dateKeyLocal(date);
      const item = currentMap[key] || { revenue: 0, count: 0, energy: 0, failed: 0, newClientCount: 0 };
      const prevDate = sameDayPreviousMonth(date);
      const prev = historyMap[dateKeyLocal(prevDate)] || { revenue: 0, count: 0, energy: 0, failed: 0 };
      const change = pctChange(item.revenue, prev.revenue);
      const hasMovement = item.count > 0 || item.revenue > 0;
      const occ = dayOccupation(item.energy, [date]);
      const cls = !hasMovement ? '' : (change >= 10 ? 'good' : (change <= -10 ? 'down' : 'warn'));
      const changeText = prev.revenue > 0 || item.revenue > 0 ? `${change >= 0 ? '+' : ''}${fmtPct(change)} vs ${String(prevDate.getDate()).padStart(2,'0')}/${String(prevDate.getMonth()+1).padStart(2,'0')}` : 'sem base mes anterior';
      const tags = contextTagsForDate(date, external).map(tag => `<span class="calendar-tag ${tag.type || ''}">${escapeHtml(tag.text)}</span>`).join('');
      return `<div class="calendar-day ${cls}">
        <div class="day-num"><span>${index + 1}</span><span>${item.failed ? `${item.failed} erro(s)` : ''}</span></div>
        <div class="day-main">${fmtBRL(item.revenue)}</div>
        <div class="day-sub">${item.count} recarga(s) - ${fmtKWh(item.energy)}</div>
        <div class="day-occ ${occ.cls}">Ocup. dia: ${fmtPct(occ.pct)}</div>
        <div class="day-sub">${item.newClientCount ? `${item.newClientCount} cliente(s) novo(s)` : 'sem cliente novo'}</div>
        <div class="day-sub">${changeText}</div>
        <div class="calendar-tags">${tags}</div>
      </div>`;
    }).join('');
    el.innerHTML = `${locationLabel}<div class="calendar-grid">${weekHeads}${blanks}${days}</div>`;
  };
  build({ loading: true });
  Promise.all([
    fetchBrazilHolidays(bounds.year),
    fetchWeatherContext(charges, isDayOfMonthAccumulated ? periodStart : firstDay, isDayOfMonthAccumulated ? periodEnd : lastDay)
  ]).then(([holidays, weather]) => {
    build({ holidays, weather: weather.map, location: weather.location, fallback: weather.fallback });
  }).catch(() => {
    build({});
  });
}
function pctChange(current = 0, previous = 0) {
  if (previous > 0) return (current - previous) / previous * 100;
  return current > 0 ? 100 : 0;
}

function vehicleLabel(charge = {}) {
  return safeText(`${charge.vehicleBrand || ''} ${charge.vehicleModel || ''}`).replace(/\s+/g, ' ').trim();
}

function isKwidCharge(charge = {}) {
  return /kwid/.test(normalizeTextForInsight(vehicleLabel(charge)));
}

// Spott may omit an explicit failure status. Preserve every imported row, but
// flag near-zero sessions so they do not look like completed recharges.
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
  return safeText(importedFile?.sourcePlatform).trim();
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
    .sort((a, b) => b.count - a.count || b.daysAbsent - a.daysAbsent || b.revenue - a.revenue);
}

function renderOperationQuality(prefix = 'usage', charges = []) {
  const el = document.getElementById(`${prefix}OperationQuality`);
  if (!el) return;
  const stats = cleanOperationStats(charges);
  const removedShare = stats.total ? stats.removed.length / stats.total * 100 : 0;
  const qualityClass = removedShare > 15 ? 'warn' : 'good';
  const removedLines = stats.removed.slice(0, 6).map(charge => {
    const issue = rechargeControlIssue(charge);
    const reason = issue
      ? issue.label
      : 'baixo tempo, energia zerada ou sessão não executada';
    return `<div class="metric-line"><strong>${chargeDisplayDay(charge)}</strong><span>${escapeHtml(clientDisplayName(charge))} · ${escapeHtml(reason)}</span><b class="warn">${fmtKWh(charge.energyKWh || 0)}</b></div>`;
  }).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini good"><span>kWh médio válido</span><strong>${stats.avgKwh.toFixed(1).replace('.', ',')} kWh</strong><span>${stats.executed.length} sessão(ões) executada(s)</span></div>
      <div class="metric-mini ${qualityClass}"><span>Falhas e sessões suspeitas</span><strong>${stats.removed.length}</strong><span>${fmtPct(removedShare)} da base removida do cálculo</span></div>
      <div class="metric-mini"><span>Ticket válido</span><strong>${fmtBRL(stats.avgTicket)}</strong><span>somente recargas executadas</span></div>
      <div class="metric-mini"><span>Potência média válida</span><strong>${stats.avgPower.toFixed(1).replace('.', ',')} kW</strong><span>kWh / horas conectadas válidas</span></div>
    </div>
    <div class="note">A média de kWh ignora falhas declaradas e sessões com até 0,25 kWh e R$ 1,00. Essas sessões seguem salvas para auditoria, mas entram como alerta operacional.</div>
    <div class="metric-lines">${removedLines || '<div class="metric-line"><strong>OK</strong><span>Nenhuma tentativa removida da média limpa.</span><b class="good">100%</b></div>'}</div>
  `;
}

function renderAbsentClientAlerts(prefix = 'usage', charges = []) {
  const el = document.getElementById(`${prefix}AbsentClients`);
  if (!el) return;
  const spottCharges = charges.filter(isSpottRecharge);
  const absent = recurringAbsentClients(spottCharges, 7, 2);
  const activeRecurring = clientRecurrenceStats(spottCharges.filter(isExecutedCharge));
  const topLines = absent.slice(0, 8).map(client => `
    <div class="metric-line">
      <strong>${escapeHtml(client.name.split(' ').slice(0, 2).join(' '))}</strong>
      <span>${client.count} recarga(s), ${fmtKWh(client.energy)}, ticket ${fmtBRL(client.avgTicket)} · última ${fmtDateOnly(client.lastDate)}${client.station ? ` · ${escapeHtml(client.station)}` : ''}</span>
      <b class="warn">${client.daysAbsent}d</b>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${absent.length ? 'warn' : 'good'}"><span>Recorrentes ausentes</span><strong>${absent.length}</strong><span>clientes Spott sem uso nos últimos 7 dias</span></div>
      <div class="metric-mini"><span>Base recorrente Spott</span><strong>${activeRecurring.recurring}</strong><span>${fmtPct(activeRecurring.pct)} dos clientes já voltaram</span></div>
      <div class="metric-mini"><span>Critério</span><strong>2+</strong><span>recargas Spott válidas no histórico</span></div>
    </div>
    <div class="note">${spottCharges.length ? (absent.length ? 'Lista calculada somente pelas planilhas Spott para evitar falso ausente quando o mesmo cliente aparece com outro cadastro na Move.' : 'Nenhum cliente recorrente da base Spott deixou de aparecer nos últimos 7 dias.') : 'Ainda não há recargas Spott no histórico para calcular ausências.'}</div>
    <div class="metric-lines">${topLines || '<div class="metric-line"><strong>OK</strong><span>Clientes recorrentes Spott continuam aparecendo no período recente.</span><b class="good">0</b></div>'}</div>
  `;
}

function legacyNewClientRows(charges = [], historyCharges = charges) {
  const firstByClient = {};
  (historyCharges?.length ? historyCharges : charges)
    .filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()))
    .slice()
    .sort((a, b) => a.startDate - b.startDate)
    .forEach(charge => {
      const key = clientKeyFromCharge(charge);
      if (!key || firstByClient[key]) return;
      firstByClient[key] = charge;
    });
  const periodKeys = new Set(charges.map(clientKeyFromCharge).filter(Boolean));
  return Object.entries(firstByClient)
    .filter(([key, charge]) => periodKeys.has(key) && charges.some(item => item === charge || rechargeUniqueKey(item) === rechargeUniqueKey(charge)))
    .map(([, charge]) => ({
      name: charge.userName || charge.userEmail || 'Cliente sem nome',
      phone: charge.userPhone || '',
      email: charge.userEmail || '',
      firstDate: charge.startDate,
      revenue: Number(charge.revenue || 0),
      energy: Number(charge.energyKWh || 0)
    }))
    .sort((a, b) => b.firstDate - a.firstDate);
}

function legacyRenderNewClients(prefix = 'usage', charges = [], historyCharges = charges) {
  const el = document.getElementById(`${prefix}NewClients`);
  if (!el) return;
  const rows = legacyNewClientRows(charges, historyCharges);
  const withPhone = rows.filter(row => row.phone).length;
  const topLines = rows.slice(0, 12).map(row => `
    <div class="metric-line">
      <strong>${escapeHtml(row.name)}</strong>
      <span>${row.phone ? `Tel: ${escapeHtml(row.phone)}` : 'Telefone não informado'}${row.email ? ` · ${escapeHtml(row.email)}` : ''}</span>
      <b>${fmtDT(row.firstDate)}</b>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${rows.length ? 'good' : ''}"><span>Novos no período</span><strong>${rows.length}</strong><span>primeira recarga registrada</span></div>
      <div class="metric-mini"><span>Com telefone</span><strong>${withPhone}</strong><span>${rows.length ? fmtPct(withPhone / rows.length * 100) : '0,00%'} da lista</span></div>
      <div class="metric-mini"><span>Receita inicial</span><strong>${fmtBRL(rows.reduce((sum, row) => sum + row.revenue, 0))}</strong><span>${fmtKWh(rows.reduce((sum, row) => sum + row.energy, 0))}</span></div>
    </div>
    <div class="metric-lines">${topLines || '<div class="metric-line"><strong>Sem novos clientes</strong><span>Nenhum primeiro uso identificado neste período.</span><b>0</b></div>'}</div>
  `;
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
  const toRow = charge => ({
    name: charge.userName || charge.userEmail || 'Cliente sem nome',
    phone: charge.userPhone || '',
    email: charge.userEmail || '',
    firstDate: charge.startDate,
    revenue: Number(charge.revenue || 0),
    energy: Number(charge.energyKWh || 0)
  });
  return {
    newNetwork: newNetwork.map(toRow).sort((a, b) => b.firstDate - a.firstDate),
    newStationExisting: newStationExisting.map(toRow).sort((a, b) => b.firstDate - a.firstDate),
    multiStation: multiStation.size
  };
}

function renderNewClients(prefix = 'usage', charges = [], historyCharges = charges, networkHistory = historyCharges) {
  const el = document.getElementById(`${prefix}NewClients`);
  if (!el) return;
  const insight = newClientInsights(charges, historyCharges, networkHistory);
  const rows = [
    ...insight.newNetwork.map(row => ({ ...row, type: 'Novo na rede UBY' })),
    ...insight.newStationExisting.map(row => ({ ...row, type: 'Novo nesta estacao' }))
  ];
  const withPhone = rows.filter(row => row.phone).length;
  const topLines = rows.slice(0, 12).map(row => `
    <div class="metric-line">
      <strong>${escapeHtml(row.name)}</strong>
      <span>${escapeHtml(row.type)}${row.type === 'Novo nesta estacao' ? ' · ja usava a rede' : ''}${row.phone ? ` · Tel: ${escapeHtml(row.phone)}` : ''}</span>
      <b>${fmtDT(row.firstDate)}</b>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${insight.newNetwork.length ? 'good' : ''}"><span>Novos na rede UBY</span><strong>${insight.newNetwork.length}</strong><span>primeiro uso em toda a rede</span></div>
      <div class="metric-mini"><span>Novos nesta estacao</span><strong>${insight.newStationExisting.length}</strong><span>ja eram clientes da rede</span></div>
      <div class="metric-mini"><span>Usam mais de uma estacao</span><strong>${insight.multiStation}</strong><span>ativos do periodo</span></div>
      <div class="metric-mini"><span>Com telefone</span><strong>${withPhone}</strong><span>${rows.length ? fmtPct(withPhone / rows.length * 100) : '0,00%'} das entradas</span></div>
    </div>
    <div class="note">Falhas e sessoes proximas de zero nao entram em aquisicao. “Novo nesta estacao” indica expansao ou migracao de uso, nao aquisicao nova da rede.</div>
    <div class="metric-lines">${topLines || '<div class="metric-line"><strong>Sem novas entradas</strong><span>Nenhum primeiro uso de rede ou de estacao identificado neste periodo.</span><b>0</b></div>'}</div>
  `;
}

function renderDailyOperationalMetrics(prefix = 'usage', charges = [], historyCharges = charges) {
  const el = document.getElementById(`${prefix}DailyMetrics`);
  if (!el) return;
  const rows = dailyOperationalRows(charges, historyCharges);
  if (!rows.length) {
    el.innerHTML = '<div class="note">Sem datas validas para calcular ritmo diario.</div>';
    return;
  }
  const last = rows[rows.length - 1];
  const r3 = rangeRevenue(rows, 3, 0);
  const p3 = rangeRevenue(rows, 3, 3);
  const r7 = rangeRevenue(rows, 7, 0);
  const p7 = rangeRevenue(rows, 7, 7);
  const r30 = rangeRevenue(rows, 30, 0);
  const p30 = rangeRevenue(rows, 30, 30);
  const growth1 = last.growthPct || 0;
  const growth3 = pctChange(r3.revenue, p3.revenue);
  const growth7 = pctChange(r7.revenue, p7.revenue);
  const growth30 = pctChange(r30.revenue, p30.revenue);
  const growthClass = value => value >= 0 ? 'good' : 'warn';
  const growthText = value => `${value >= 0 ? '+' : ''}${fmtPct(value)}`;
  const recentLines = rows.slice(-7).reverse().map(row => `
    <div class="metric-line">
      <strong>${row.label}</strong>
      <span>${row.count} recarga(s), ${row.newClientCount} cliente(s) novo(s), ${row.failed} falha(s)</span>
      <b class="${growthClass(row.growthPct)}">${fmtBRL(row.revenue)} · ${growthText(row.growthPct)}</b>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${growthClass(growth1)}"><span>Ultimo dia (${last.label})</span><strong>${fmtBRL(last.revenue)}</strong><span>${growthText(growth1)} vs dia anterior · ${last.newClientCount} novo(s)</span></div>
      <div class="metric-mini ${growthClass(growth3)}"><span>Ultimos 3 dias</span><strong>${fmtBRL(r3.revenue)}</strong><span>${growthText(growth3)} vs 3 dias anteriores · ${r3.newClients} novo(s)</span></div>
      <div class="metric-mini ${growthClass(growth7)}"><span>Ultimos 7 dias</span><strong>${fmtBRL(r7.revenue)}</strong><span>${growthText(growth7)} vs 7 dias anteriores · ${r7.newClients} novo(s)</span></div>
      <div class="metric-mini ${growthClass(growth30)}"><span>Ultimos 30 dias</span><strong>${fmtBRL(r30.revenue)}</strong><span>${growthText(growth30)} vs 30 dias anteriores · ${r30.newClients} novo(s)</span></div>
    </div>
    <div class="metric-lines">${recentLines}</div>
  `;
}

function renderRecentFailureDiagnostics(prefix = 'usage', charges = []) {
  const el = document.getElementById(`${prefix}RecentOps`);
  if (!el) return;
  const recent = recentCharges(charges, 7).charges.sort((a, b) => (b.startDate || 0) - (a.startDate || 0));
  const failed = recent.filter(isFailedCharge);
  const inferredIssues = failed.filter(charge => rechargeControlIssue(charge)?.type === 'near_zero');
  const reasonMap = {};
  failed.forEach(charge => {
    const reason = rechargeControlIssue(charge)?.label || 'Sem motivo na planilha';
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  });
  const topReason = topEntries(reasonMap, 1)[0];
  const failedLines = failed.slice(0, 7).map(charge => {
    const reason = rechargeControlIssue(charge)?.label || 'Sem motivo';
    const station = safeText(charge.station || charge.workName || 'Unidade').trim();
    return `<div class="metric-line"><strong>${chargeDayLabel(charge)}</strong><span>${escapeHtml(station)} · ${escapeHtml(reason)}</span><b>${fmtKWh(charge.energyKWh || 0)}</b></div>`;
  }).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${failed.length ? 'warn' : 'good'}"><span>Falhas 7 dias</span><strong>${failed.length}</strong><span>${recent.length} tentativa(s) recentes</span></div>
      <div class="metric-mini ${inferredIssues.length ? 'warn' : 'good'}"><span>Alertas por dados</span><strong>${inferredIssues.length}</strong><span>até 0,25 kWh e R$ 1,00</span></div>
      <div class="metric-mini ${failed.length ? 'warn' : 'good'}"><span>Taxa de erro</span><strong>${recent.length ? fmtPct(failed.length / recent.length * 100) : '0,00%'}</strong><span>falhas / tentativas recentes</span></div>
      <div class="metric-mini"><span>Principal motivo</span><strong style="font-size:14px;white-space:normal">${escapeHtml(topReason?.[0] || '-')}</strong><span>${topReason ? `${topReason[1]} ocorrencia(s)` : 'sem falhas'}</span></div>
    </div>
    <div class="note">${failed.length ? `${inferredIssues.length ? `${inferredIssues.length} alerta(s) foram inferidos por energia e faturamento próximos de zero. ` : ''}Priorize os motivos mais repetidos antes de analisar campanha ou crescimento.` : 'Nenhuma falha detectada nos últimos 7 dias.'}</div>
    <div class="metric-lines">${failedLines || '<div class="metric-line"><strong>OK</strong><span>Nenhuma falha recente para listar.</span><b class="good">0</b></div>'}</div>
  `;
}

function renderOperationalHealth(prefix = 'usage', charges = []) {
  const el = document.getElementById(`${prefix}OperationalHealth`);
  if (!el) return;
  const stats = cleanOperationStats(charges);
  const removedShare = stats.total ? stats.removed.length / stats.total * 100 : 0;
  const qualityClass = removedShare > 15 ? 'warn' : 'good';
  const recent = recentCharges(charges, 7).charges.sort((a, b) => (b.startDate || 0) - (a.startDate || 0));
  const failed = recent.filter(isFailedCharge);
  const inferredIssues = failed.filter(charge => rechargeControlIssue(charge)?.type === 'near_zero');
  const reasonMap = {};
  failed.forEach(charge => {
    const reason = rechargeControlIssue(charge)?.label || 'Sem motivo na planilha';
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  });
  const topReason = topEntries(reasonMap, 1)[0];
  const alertLines = failed.slice(0, 7).map(charge => {
    const reason = rechargeControlIssue(charge)?.label || 'Sem motivo';
    const station = safeText(charge.station || charge.workName || 'Unidade').trim();
    return `<div class="metric-line"><strong>${chargeDayLabel(charge)}</strong><span>${escapeHtml(station)} · ${escapeHtml(reason)}</span><b class="warn">${fmtKWh(charge.energyKWh || 0)}</b></div>`;
  }).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${failed.length ? 'warn' : 'good'}"><span>Falhas 7 dias</span><strong>${failed.length}</strong><span>${recent.length} tentativa(s) recentes</span></div>
      <div class="metric-mini ${inferredIssues.length ? 'warn' : 'good'}"><span>Alertas por dados</span><strong>${inferredIssues.length}</strong><span>até 0,25 kWh e R$ 1,00</span></div>
      <div class="metric-mini ${failed.length ? 'warn' : 'good'}"><span>Taxa de erro</span><strong>${recent.length ? fmtPct(failed.length / recent.length * 100) : '0,00%'}</strong><span>falhas / tentativas recentes</span></div>
      <div class="metric-mini"><span>Principal motivo</span><strong style="font-size:14px;white-space:normal">${escapeHtml(topReason?.[0] || '-')}</strong><span>${topReason ? `${topReason[1]} ocorrência(s)` : 'sem falhas'}</span></div>
      <div class="metric-mini good"><span>kWh médio válido</span><strong>${stats.avgKwh.toFixed(1).replace('.', ',')} kWh</strong><span>${stats.executed.length} sessão(ões) executada(s)</span></div>
      <div class="metric-mini ${qualityClass}"><span>Sessões excluídas da média</span><strong>${stats.removed.length}</strong><span>${fmtPct(removedShare)} da base filtrada</span></div>
      <div class="metric-mini"><span>Ticket válido</span><strong>${fmtBRL(stats.avgTicket)}</strong><span>somente recargas executadas</span></div>
      <div class="metric-mini"><span>Potência média válida</span><strong>${stats.avgPower.toFixed(1).replace('.', ',')} kW</strong><span>kWh / horas conectadas válidas</span></div>
    </div>
    <div class="note">A média válida ignora falhas declaradas e sessões com até 0,25 kWh e R$ 1,00. Elas seguem salvas para auditoria e são listadas abaixo uma única vez; priorize o motivo recorrente antes de analisar campanhas ou crescimento.</div>
    <div class="metric-lines">${alertLines || '<div class="metric-line"><strong>OK</strong><span>Nenhuma falha recente para listar. A filtragem de qualidade do período continua aplicada nas métricas válidas.</span><b class="good">0</b></div>'}</div>
  `;
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

function unitMomentum(unit = {}) {
  const rows = dailyOperationalRows(unit.charges || []);
  const r7 = rangeRevenue(rows, 7, 0);
  const p7 = rangeRevenue(rows, 7, 7);
  const growth7 = pctChange(r7.revenue, p7.revenue);
  const recent = recentCharges(unit.charges || [], 7).charges;
  const failures = recent.filter(isFailedCharge).length;
  const clients = clientRecurrenceStats(unit.charges || []);
  const lastRevenue = rows[rows.length - 1]?.revenue || 0;
  return { rows, r7, p7, growth7, failures, clients, lastRevenue };
}

function actionForUnit(unit = {}, momentum = unitMomentum(unit)) {
  if (!unit.count) return { level: 'warn', label: 'Sem base ativa', detail: 'Subir ou atualizar planilha antes de avaliar.' };
  if (momentum.failures > 0) return { level: 'warn', label: 'Falhas recentes', detail: `${momentum.failures} falha(s) nos últimos 7 dias. Ver status/modelo antes de campanha.` };
  if (momentum.growth7 < -20) return { level: 'warn', label: 'Queda de receita', detail: `Receita 7d caiu ${fmtPct(Math.abs(momentum.growth7))}. Conferir demanda, cupom e disponibilidade.` };
  if ((unit.revenue || 0) > 0 && (unit.count || 0) <= 3) return { level: 'warn', label: 'Baixa frequência', detail: 'Poucas sessões no período. Buscar clientes recorrentes no entorno.' };
  if (momentum.growth7 > 20) return { level: 'good', label: 'Acelerar aquisição', detail: `Crescimento 7d de ${fmtPct(momentum.growth7)}. Vale reforçar divulgação local.` };
  return { level: 'priority', label: 'Manter ritmo', detail: 'Operação estável. Monitorar recorrência e ticket médio.' };
}

function renderDecisionCockpit(cockpitId, growthId, actionId, unitData = [], charges = [], stationRows = [], emptyMessage = 'Suba as planilhas das unidades para o painel gerar decisao por crescimento, alerta e recorrencia.') {
  const cockpit = document.getElementById(cockpitId);
  const growthEl = document.getElementById(growthId);
  const actionEl = document.getElementById(actionId);
  if (!cockpit || !growthEl || !actionEl) return;
  const activeUnits = stationRows.filter(unit => unit.count > 0 || unit.revenue > 0);
  if (!charges.length) {
    cockpit.innerHTML = `<div class="decision-card warn" style="grid-column:1/-1"><div class="label">Cockpit</div><strong>Sem base consolidada</strong><p>${emptyMessage}</p></div>`;
    growthEl.innerHTML = '<div class="note">Sem dados para ranking de crescimento.</div>';
    actionEl.innerHTML = '<div class="note">Sem alertas enquanto não houver recargas salvas.</div>';
    return;
  }
  const rows = dailyOperationalRows(charges);
  const r3 = rangeRevenue(rows, 3, 0);
  const p3 = rangeRevenue(rows, 3, 3);
  const r7 = rangeRevenue(rows, 7, 0);
  const p7 = rangeRevenue(rows, 7, 7);
  const growth3 = pctChange(r3.revenue, p3.revenue);
  const growth7 = pctChange(r7.revenue, p7.revenue);
  const recurrence = clientRecurrenceStats(charges);
  const failed7 = recentCharges(charges, 7).charges.filter(isFailedCharge).length;
  const unitScores = activeUnits.map(unit => {
    const momentum = unitMomentum(unit);
    return { unit, momentum, action: actionForUnit(unit, momentum) };
  });
  const bestGrowth = [...unitScores].sort((a, b) => b.momentum.growth7 - a.momentum.growth7)[0];
  const actionPriority = [...unitScores].sort((a, b) => {
    const weight = { warn: 2, priority: 1, good: 0 };
    return (weight[b.action.level] || 0) - (weight[a.action.level] || 0) || b.unit.revenue - a.unit.revenue;
  });
  const growthClass = value => value >= 0 ? 'good' : 'warn';
  const growthText = value => `${value >= 0 ? '+' : ''}${fmtPct(value)}`;
  const primaryAction = actionPriority[0];
  cockpit.innerHTML = `
    <div class="decision-card ${growthClass(growth7)}">
      <div class="label">Ritmo da rede</div>
      <strong>${growthText(growth7)} em 7 dias</strong>
      <p>${fmtBRL(r7.revenue)} nos últimos 7 dias contra ${fmtBRL(p7.revenue)} nos 7 dias anteriores.</p>
    </div>
    <div class="decision-card ${growthClass(growth3)}">
      <div class="label">Curto prazo</div>
      <strong>${growthText(growth3)} em 3 dias</strong>
      <p>${fmtBRL(r3.revenue)} nos últimos 3 dias. Bom para ver reação rápida a campanhas e falhas.</p>
    </div>
    <div class="decision-card priority">
      <div class="label">Clientes</div>
      <strong>${r7.newClients} novos em 7 dias</strong>
      <p>Recorrência geral de ${fmtPct(recurrence.pct)} (${recurrence.recurring} de ${recurrence.total} clientes voltaram).</p>
    </div>
    <div class="decision-card ${failed7 ? 'warn' : 'good'}">
      <div class="label">Ação agora</div>
      <strong>${primaryAction ? primaryAction.action.label : 'Sem alerta'}</strong>
      <p>${primaryAction ? `${primaryAction.unit.workName}: ${primaryAction.action.detail}` : `${failed7} falha(s) recentes detectadas.`}</p>
    </div>
  `;
  growthEl.innerHTML = unitScores
    .slice()
    .sort((a, b) => b.momentum.growth7 - a.momentum.growth7)
    .slice(0, 8)
    .map(({ unit, momentum }) => `
      <div class="action-row">
        <div><strong>${escapeHtml(unit.workName)}</strong><span>${fmtBRL(momentum.r7.revenue)} nos ultimos 7 dias vs ${fmtBRL(momentum.p7.revenue)} nos 7 dias anteriores · ${momentum.r7.count} recarga(s)</span></div>
        <b class="${growthClass(momentum.growth7)}">${growthText(momentum.growth7)}</b>
      </div>
    `).join('');
  actionEl.innerHTML = actionPriority.slice(0, 8).map(({ unit, action, momentum }) => `
    <div class="action-row">
      <div><strong>${escapeHtml(unit.workName)}</strong><span>${escapeHtml(action.detail)}</span></div>
      <b class="${action.level === 'warn' ? 'warn' : action.level === 'good' ? 'good' : ''}">${escapeHtml(action.label)}</b>
    </div>
  `).join('');
}

function renderGeneralDecisionCockpit(unitData = [], charges = [], stationRows = []) {
  renderDecisionCockpit('generalDecisionCockpit', 'generalGrowthRank', 'generalActionRank', unitData, charges, stationRows);
}

function renderUbyDecisionCockpit(unitData = [], charges = [], stationRows = []) {
  renderDecisionCockpit(
    'ubyDecisionCockpit',
    'ubyGrowthRank',
    'ubyActionRank',
    unitData,
    charges,
    stationRows,
    'Marque carregadores UBY ou suba as planilhas das unidades UBY para gerar decisao por crescimento, alerta e recorrencia.'
  );
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

function renderCouponSummary(id, details = []) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!details.length) {
    el.innerHTML = '<div class="note" style="padding:10px 12px">Sem recargas neste periodo para calcular participacao de cupons.</div>';
    return;
  }
  const totalCount = details.reduce((sum, item) => sum + Number(item.count || 0), 0);
  el.innerHTML = details.slice(0, 6).map(item => {
    const avgTicket = item.count ? item.revenue / item.count : 0;
    const share = totalCount ? item.count / totalCount * 100 : 0;
    const discount = Number(item.discount || 0);
    const discountText = discount > 0 ? `desc. ${fmtBRL(discount)}` : 'sem desconto';
    return `<div class="coupon-row">
      <strong>${escapeHtml(item.coupon)}</strong>
      <span>${item.count} uso(s) Â· ${fmtPct(share)}</span>
      <span>${fmtKWh(item.energy)}</span>
      <span>${discountText}</span>
      <span>${fmtBRL(item.revenue)} · ticket ${fmtBRL(avgTicket)}</span>
    </div>`;
  }).join('');
}

async function renderUsageInsights(charges = [], prefix = 'usage', historyCharges = charges, options = {}) {
  const data = usageSeries(charges);
  const daily = dailyFinancialSeries(charges);
  const weekdayPower = options.weekdayPower || options.calendar?.power || getPower();
  const weekdayBounds = options.weekdayBounds || options.bounds || null;
  renderSmoothLineChart(`${prefix}RevenueDaily`, daily.labels, daily.revenue, '#57B7FF', ' R$');
  renderBarChart(`${prefix}IdleValueDaily`, daily.labels, daily.idleValue, '#F2A93D', ' R$');
  renderDayComparison(prefix, charges, historyCharges);
  renderWeekdayOccupancyReport(`${prefix}WeekdayReport`, charges, weekdayPower, 'Dinamica semanal de ocupacao', weekdayBounds);
  renderDailyOperationalMetrics(prefix, charges, historyCharges);
  await yieldToBrowser();
  renderOperationalHealth(prefix, charges);
  renderNewClients(prefix, charges, historyCharges, options.networkHistory || networkHistoryCharges(historyCharges));
  renderAbsentClientAlerts(prefix, historyCharges);
  await yieldToBrowser();
  renderOperationalCalendar(prefix, charges, historyCharges, { ...(options.calendar || {}), bounds: weekdayBounds });
  renderBarChart(`${prefix}Duration7`, data.labels, data.duration, '#3B32D0', 'h');
  renderBarChart(`${prefix}Count7`, data.labels, data.count, '#2D8CE0');
  renderBarChart(`${prefix}Energy7`, data.labels, data.energy, '#2DBBD3', ' kWh');
  await yieldToBrowser();
  renderBarChart(`${prefix}StayBuckets`, data.stayLabels, data.stayValues, '#3B32D0');
  renderCouponDonutChart(`${prefix}Coupons`, data.couponLabels, data.couponValues);
  renderCouponDonutChart(`${prefix}CouponRevenue`, data.couponLabels, data.couponRevenueValues, ' R$');
  renderCouponSummary(`${prefix}CouponSummary`, data.couponDetails);
  renderBarChart(`${prefix}PopularHours`, data.hourLabels, data.hourValues, '#AEE33F');
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
  if (group.kind === 'dc') return true;
  return (group.charges || []).some(charge => isUbyOperationCharge(charge, overrides));
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

function renderGeneralStationOccupancy(rows) {
  const target = document.getElementById('generalStationOccupancy');
  if (!target) return;
  const configured = [...rows].sort((a, b) => String(a.stationName).localeCompare(String(b.stationName), 'pt-BR'));
  target.innerHTML = configured.length ? configured.map(row => {
    const config = stationAvailabilityFor(row.workId, row.stationName, row.workName);
    return `
    <div class="station-schedule-row">
      <div class="station-occupancy-name"><strong>${row.stationName}</strong><span>${row.workName}</span></div>
      <div class="station-occupancy-meta">${stationScheduleLabel(config)}</div>
      <button class="btn-open" type="button" onclick="openStationLayoutConfiguration('${escapeAttr(row.workId)}','${escapeAttr(row.stationName)}')">Configurar horario</button>
    </div>
  `;
  }).join('') : '<div class="note">Nenhum eletroposto concluido disponivel para configurar.</div>';
}

function unitOccupancyMarkup(unit, monthKeys) {
  const occupancy = stationOccupancyForMonths(unit, monthKeys, 'mtd');
  const band = occupationBand(occupancy.pct);
  return `<div class="unit-occupancy ${band.className}"><div class="unit-value">${fmtPct(occupancy.pct)}</div><div class="unit-sub">ocupacao · ${occupancy.hours.toFixed(1).replace('.', ',')} h</div><div class="unit-occupancy-bar"><span style="width:${Math.min(occupancy.pct, 100).toFixed(1)}%"></span></div></div>`;
}

function getUbyChargerRows(unitData = getGeneralUnitData()) {
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
        ruleSource: hasOverride ? 'manual' : included ? 'DC automatico' : 'fora por padrao'
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
      ruleSource: hasOverride ? 'manual' : group.included ? 'DC automatico' : 'fora por padrao'
    });
    existingStations.add(identity);
  });
  return rows.sort((a, b) => Number(b.included) - Number(a.included) || b.revenue - a.revenue);
}

function normalizePhone(value = '') {
  return safeText(value).replace(/\D+/g, '');
}

function customerRegistryStore() {
  const data = readJson(CUSTOMER_REGISTRY_LOCAL_KEY, { rows: [], updatedAt: '', source: '' });
  return { rows: Array.isArray(data?.rows) ? data.rows : [], updatedAt: data?.updatedAt || '', source: data?.source || '' };
}

function customerRegistryNumber(value = '') {
  const clean = safeText(value).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return Number(clean) || 0;
}

function customerRegistryRow(row = [], headers = []) {
  const email = headerValue(row, headers, ['Email', 'E-mail']).trim().toLowerCase();
  const phoneRaw = headerValue(row, headers, ['Telefone', 'WhatsApp', 'Whatsapp']);
  const local = headerValue(row, headers, ['Local', 'Estacao', 'Estação']).trim();
  return {
    name: headerValue(row, headers, ['Nome', 'Motorista']),
    complement: headerValue(row, headers, ['Complemento']),
    email,
    cpf: headerValue(row, headers, ['CPF']).replace(/\D/g, ''),
    phone: normalizePhone(phoneRaw),
    phoneDisplay: phoneRaw,
    // A exportacao da Spott nao traz uma coluna "Carregadores". O valor
    // correto para esse relatorio e a quantidade de locais distintos onde o
    // motorista aparece, calculada na consolidacao abaixo.
    chargers: customerRegistryNumber(headerValue(row, headers, ['Carregadores'])),
    transactions: customerRegistryNumber(headerValue(row, headers, ['Total de transacoes', 'Total de transações', 'Transacoes', 'Transações'])),
    energy: customerRegistryNumber(headerValue(row, headers, ['Total de kWh', 'kWh'])),
    chargeTime: headerValue(row, headers, ['Tempo total de recarga', 'Tempo de recarga']),
    spent: customerRegistryNumber(headerValue(row, headers, ['Total gasto', 'Faturamento', 'Receita'])),
    locations: local ? [local] : []
  };
}

function customerRegistryRowsFromSheet(rows = []) {
  const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => ['nome','motorista'].includes(normalizeHeaderName(cell))));
  const index = headerIndex >= 0 ? headerIndex : 0;
  const headers = rows[index] || [];
  return rows.slice(index + 1).filter(rowHasData).map(row => customerRegistryRow(row, headers)).filter(row => row.name || row.email || row.phone);
}

function customerRegistryIdentityKeys(row = {}) {
  const email = safeText(row.email).trim().toLowerCase();
  const phone = normalizePhone(row.phone);
  const cpf = safeText(row.cpf).replace(/\D/g, '');
  const name = normalizeHeaderName(row.name || '');
  return [
    cpf ? `cpf:${cpf}` : '',
    email ? `email:${email}` : '',
    phone ? `phone:${phone}` : '',
    name ? `name:${name}` : ''
  ].filter(Boolean);
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
    target.transactions += Number(row.transactions || 0);
    target.energy += Number(row.energy || 0);
    target.spent += Number(row.spent || 0);
    target.durationHours += durToHours(row.chargeTime);
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

function mergeCustomerRegistry(incoming = [], source = 'importacao manual') {
  const current = customerRegistryStore().rows;
  const rows = [...current];
  consolidateCustomerRegistryRows(incoming).forEach(next => {
    const keys = new Set(customerRegistryIdentityKeys(next));
    const index = rows.findIndex(existing => customerRegistryIdentityKeys(existing).some(key => keys.has(key)));
    if (index >= 0) rows[index] = { ...rows[index], ...next };
    else rows.push(next);
  });
  const payload = { rows, updatedAt: new Date().toISOString(), source };
  writeJson(CUSTOMER_REGISTRY_LOCAL_KEY, payload);
  return payload;
}

async function saveCustomerRegistryCloud(payload) {
  if (!window.UBY_SUPABASE?.upsertRechargeCustomers) return false;
  await window.UBY_SUPABASE.upsertRechargeCustomers(payload?.rows || []);
  return true;
}

async function loadCustomerRegistry() {
  try {
    const local = customerRegistryStore();
    if (!window.UBY_SUPABASE?.loadRechargeCustomers) return;
    const firstPage = await window.UBY_SUPABASE.loadRechargeCustomers({ limit: 500 });
    // Nunca substitua a base local por um resultado vazio que apenas indica
    // que o Supabase nao esta configurado ou que a sessao expirou.
    if (!firstPage?.available) return;

    const cloudRows = [...(firstPage.rows || [])];
    const total = Number(firstPage.count || cloudRows.length);
    for (let offset = cloudRows.length; offset < total; offset += 500) {
      const page = await window.UBY_SUPABASE.loadRechargeCustomers({ limit: 500, offset });
      if (!page?.available) throw new Error('A conexao com a base de clientes foi interrompida.');
      cloudRows.push(...(page.rows || []));
    }

    // Uma importacao acaba de atualizar o cache local antes de tentar a
    // sincronizacao online. Nunca deixe uma copia mais antiga da nuvem
    // (por exemplo, os 80 clientes anteriores) apagar esses registros ao
    // alternar de aba.
    const cloudUpdatedAt = cloudRows.reduce((latest, row) => {
      const timestamp = Date.parse(row?.updated_at || '');
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
    const localUpdatedAt = Date.parse(local.updatedAt || '') || 0;
    if (local.rows.length && localUpdatedAt >= cloudUpdatedAt) {
      const status = document.getElementById('customerRegistryStatus');
      if (status && cloudUpdatedAt) status.textContent = 'Base local mais recente preservada; sincronizacao online pendente.';
      return;
    }

    if (Array.isArray(cloudRows)) {
      const rows = cloudRows.map(row => ({
        customerKey: row.customer_key, name: row.name || '', email: row.email || '', phone: row.phone || '',
        complement: row.complement || '', chargers: Number(row.chargers_count || 0),
        transactions: Number(row.transactions_count || 0), energy: Number(row.energy_kwh || 0),
        chargeTime: row.charge_time_text || '', spent: Number(row.total_spent || 0), source: row.source || 'banco online'
      }));
      writeJson(CUSTOMER_REGISTRY_LOCAL_KEY, { rows, total, updatedAt: new Date().toISOString(), source: 'Supabase normalizado' });
    }
  } catch (err) {
    console.warn('Base de clientes mantida no cache local:', err.message);
  }
}

async function handleCustomerRegistryFiles(files = []) {
  if (!files.length) return;
  const imported = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    let rows;
    if (/\.csv$/i.test(file.name) || /csv/i.test(file.type || '')) rows = parseCsvRows(new TextDecoder('utf-8').decode(buffer));
    else {
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, blankrows: false });
    }
    imported.push(...customerRegistryRowsFromSheet(rows));
  }
  const payload = mergeCustomerRegistry(imported, files.map(file => file.name).join(', '));
  const status = document.getElementById('customerRegistryStatus');
  try {
    await saveCustomerRegistryCloud(payload);
    if (status) status.textContent = `${imported.length} registro(s) importado(s) e salvo(s) online.`;
  } catch (err) {
    if (status) status.textContent = `${imported.length} registro(s) preservado(s) localmente; banco pendente: ${err.message}`;
  }
  renderCustomerRegistry();
}

function renderCustomerRegistry() {
  const store = customerRegistryStore();
  const query = normalizeHeaderName(document.getElementById('customerRegistrySearch')?.value || '');
  const sort = document.getElementById('customerRegistrySort')?.value || 'spent';
  const all = store.rows;
  const rows = all.filter(row => !query || normalizeHeaderName(`${row.name} ${row.email} ${row.phone}`).includes(query)).sort((a, b) => {
    if (sort === 'name') return safeText(a.name).localeCompare(safeText(b.name), 'pt-BR');
    const field = sort === 'energy' ? 'energy' : sort === 'transactions' ? 'transactions' : 'spent';
    return Number(b[field] || 0) - Number(a[field] || 0);
  });
  const totals = all.reduce((acc, row) => ({ transactions: acc.transactions + Number(row.transactions || 0), energy: acc.energy + Number(row.energy || 0), spent: acc.spent + Number(row.spent || 0) }), { transactions: 0, energy: 0, spent: 0 });
  const hero = document.getElementById('customerRegistryHero');
  if (hero) hero.textContent = `${all.length} cliente(s) cadastrados - base atualizada ${store.updatedAt ? new Date(store.updatedAt).toLocaleString('pt-BR') : 'ainda nao importada'}.`;
  const source = document.getElementById('customerRegistrySource');
  if (source) source.textContent = store.source ? `Ultima fonte: ${store.source}` : 'Nenhum arquivo importado.';
  const kpis = document.getElementById('customerRegistryKpis');
  if (kpis) kpis.innerHTML = `
    <div class="card"><div class="label">Clientes</div><div class="value">${all.length}</div><div class="sub">cadastros unicos</div></div>
    <div class="card"><div class="label">Transacoes</div><div class="value">${totals.transactions}</div><div class="sub">acumulado informado</div></div>
    <div class="card"><div class="label">Energia</div><div class="value">${fmtKWh(totals.energy)}</div><div class="sub">consumo acumulado</div></div>
    <div class="card"><div class="label">Total gasto</div><div class="value">${fmtBRL(totals.spent)}</div><div class="sub">faturamento informado</div></div>`;
  const table = document.getElementById('customerRegistryTable');
  if (table) table.innerHTML = rows.length ? rows.map(row => `<tr><td><strong>${escapeHtml(row.name || '-')}</strong>${row.complement ? `<br><span class="sub">${escapeHtml(row.complement)}</span>` : ''}</td><td>${escapeHtml(row.phoneDisplay || row.phone || '-')}</td><td>${escapeHtml(row.email || '-')}</td><td>${Number(row.chargers || 0)}</td><td>${Number(row.transactions || 0)}</td><td>${Number(row.energy || 0).toFixed(2).replace('.', ',')}</td><td>${escapeHtml(row.chargeTime || '-')}</td><td><strong>${fmtBRL(row.spent || 0)}</strong></td></tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:20px">Nenhum cliente encontrado.</td></tr>';
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

function clubFormEndpointUrl() {
  return safeText(window.UBY_CLUBE_FORM_ENDPOINT || localStorage.getItem('uby-club-form-endpoint') || '').trim();
}

function configureClubFormEndpoint() {
  const current = clubFormEndpointUrl();
  const next = prompt('Cole aqui a URL /exec do Google Apps Script publicado na planilha de respostas do Forms do Clube UBY:', current);
  if (next === null) return;
  const clean = safeText(next).trim();
  if (clean) {
    localStorage.setItem('uby-club-form-endpoint', clean);
  } else {
    localStorage.removeItem('uby-club-form-endpoint');
  }
  renderClub();
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

async function syncClubParticipantsFromSheet(options = {}) {
  const silent = !!options.silent;
  const force = !!options.force;
  if (clubParticipantsSyncPromise && !force) return clubParticipantsSyncPromise;
  const status = document.getElementById('clubParticipantsStatus');
  if (status && !silent) status.textContent = 'Sincronizando respostas do formulario...';
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
      const text = await response.text();
      participants = clubParticipantsFromRows(parseCsvRows(text));
    }
    const merged = mergeClubParticipants(participants, source);
    if (status) status.textContent = `${participants.length} resposta(s) lida(s) via ${source}. ${merged.length} participante(s) salvo(s) no Clube UBY.`;
    renderClub();
    return merged;
  })();
  try {
    return await clubParticipantsSyncPromise;
  } catch (err) {
    if (status) status.textContent = endpoint
      ? `Nao consegui ler o endpoint seguro (${err.message}). Revise a publicacao do Apps Script ou importe CSV/Excel.`
      : `Nao consegui ler a planilha direto (${err.message}). Configure o endpoint seguro ou importe CSV/Excel.`;
    throw err;
  } finally {
    clubParticipantsSyncPromise = null;
  }
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

function defaultClubPartners() {
  return [
    {
      id: 'partner-muffatao',
      name: 'Muffatao Autocenter',
      category: 'Auto center',
      status: 'active',
      benefit: '10% de desconto em todos os servicos da rede Muffatao Autocenter.',
      rule: 'Valido para participantes do Clube UBY mediante comprovacao no atendimento.',
      coupon: 'CLUBEUBY',
      contact: '',
      validity: 'Sem prazo',
      priority: 'high',
      usageCount: 0,
      notes: 'Beneficio geral para todos os participantes do Clube UBY.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'partner-bancouros',
      name: 'Bancouros',
      category: 'Parceiro comercial',
      status: 'prospect',
      benefit: 'Beneficio a definir.',
      rule: 'Definir regra comercial, publico elegivel e forma de comprovacao.',
      coupon: '',
      contact: '',
      validity: 'A definir',
      priority: 'medium',
      usageCount: 0,
      notes: '',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'partner-lava-cars',
      name: 'Lava Cars',
      category: 'Lavagem / estetica',
      status: 'prospect',
      benefit: 'Beneficio a definir para lavagem, higienizacao ou estetica automotiva.',
      rule: 'Definir regra comercial, unidades participantes e comprovacao.',
      coupon: '',
      contact: '',
      validity: 'A definir',
      priority: 'medium',
      usageCount: 0,
      notes: '',
      updatedAt: new Date().toISOString()
    }
  ];
}

function clubPartnersStore() {
  const stored = readJson(CLUB_PARTNERS_LOCAL_KEY, null);
  if (Array.isArray(stored) && stored.length) return stored;
  const defaults = defaultClubPartners();
  writeJson(CLUB_PARTNERS_LOCAL_KEY, defaults);
  return defaults;
}

function writeClubPartnersStore(partners = []) {
  const clean = partners
    .filter(partner => partner && safeText(partner.name).trim())
    .map(partner => ({
      id: partner.id || `partner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: safeText(partner.name).trim(),
      category: safeText(partner.category).trim(),
      status: partner.status || 'prospect',
      benefit: safeText(partner.benefit).trim(),
      rule: safeText(partner.rule).trim(),
      coupon: safeText(partner.coupon).trim(),
      contact: safeText(partner.contact).trim(),
      validity: safeText(partner.validity).trim(),
      priority: partner.priority || 'medium',
      usageCount: Math.max(0, Math.round(Number(partner.usageCount || 0))),
      notes: safeText(partner.notes).trim(),
      updatedAt: partner.updatedAt || new Date().toISOString()
    }))
    .sort((a, b) => partnerStatusOrder(a.status) - partnerStatusOrder(b.status) || partnerPriorityOrder(a.priority) - partnerPriorityOrder(b.priority) || a.name.localeCompare(b.name, 'pt-BR'));
  writeJson(CLUB_PARTNERS_LOCAL_KEY, clean);
  return clean;
}

function partnerStatusOrder(status = '') {
  return { active: 0, prospect: 1, paused: 2 }[status] ?? 3;
}

function partnerPriorityOrder(priority = '') {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}

function partnerStatusInfo(status = '') {
  if (status === 'active') return { label: 'Ativo', cls: 'good' };
  if (status === 'paused') return { label: 'Pausado', cls: 'muted' };
  return { label: 'Em negociacao', cls: 'warn' };
}

function resetClubPartnerForm() {
  ['partnerId','partnerName','partnerCategory','partnerBenefit','partnerRule','partnerCoupon','partnerContact','partnerValidity','partnerNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const status = document.getElementById('partnerStatus');
  if (status) status.value = 'active';
  const priority = document.getElementById('partnerPriority');
  if (priority) priority.value = 'medium';
  const usage = document.getElementById('partnerUsageCount');
  if (usage) usage.value = 0;
  const info = document.getElementById('clubPartnerStatus');
  if (info) info.textContent = 'Nova parceria pronta para cadastro.';
}

function partnerFromInputs() {
  return {
    id: document.getElementById('partnerId')?.value || '',
    name: document.getElementById('partnerName')?.value || '',
    category: document.getElementById('partnerCategory')?.value || '',
    status: document.getElementById('partnerStatus')?.value || 'prospect',
    benefit: document.getElementById('partnerBenefit')?.value || '',
    rule: document.getElementById('partnerRule')?.value || '',
    coupon: document.getElementById('partnerCoupon')?.value || '',
    contact: document.getElementById('partnerContact')?.value || '',
    validity: document.getElementById('partnerValidity')?.value || '',
    priority: document.getElementById('partnerPriority')?.value || 'medium',
    usageCount: Number(document.getElementById('partnerUsageCount')?.value || 0),
    notes: document.getElementById('partnerNotes')?.value || '',
    updatedAt: new Date().toISOString()
  };
}

function saveClubPartner() {
  const partner = partnerFromInputs();
  const status = document.getElementById('clubPartnerStatus');
  if (!safeText(partner.name).trim()) {
    if (status) status.textContent = 'Informe o nome do parceiro antes de salvar.';
    return;
  }
  const partners = clubPartnersStore();
  const id = partner.id || `partner-${Date.now()}`;
  const next = partners.filter(item => item.id !== id);
  next.push({ ...partner, id });
  writeClubPartnersStore(next);
  if (status) status.textContent = `Parceria ${partner.name} salva.`;
  resetClubPartnerForm();
  renderClubPartners();
}

function editClubPartner(id) {
  const partner = clubPartnersStore().find(item => item.id === id);
  if (!partner) return;
  const set = (field, value) => {
    const el = document.getElementById(field);
    if (el) el.value = value || '';
  };
  set('partnerId', partner.id);
  set('partnerName', partner.name);
  set('partnerCategory', partner.category);
  set('partnerBenefit', partner.benefit);
  set('partnerRule', partner.rule);
  set('partnerCoupon', partner.coupon);
  set('partnerContact', partner.contact);
  set('partnerValidity', partner.validity);
  set('partnerNotes', partner.notes);
  set('partnerUsageCount', partner.usageCount || 0);
  set('partnerStatus', partner.status || 'prospect');
  set('partnerPriority', partner.priority || 'medium');
  const status = document.getElementById('clubPartnerStatus');
  if (status) status.textContent = `Editando ${partner.name}.`;
}

function deleteClubPartner(id) {
  const partner = clubPartnersStore().find(item => item.id === id);
  if (!partner) return;
  if (!confirm(`Excluir parceria ${partner.name}?`)) return;
  writeClubPartnersStore(clubPartnersStore().filter(item => item.id !== id));
  const status = document.getElementById('clubPartnerStatus');
  if (status) status.textContent = `Parceria ${partner.name} excluida.`;
  renderClubPartners();
}

function renderClubPartners() {
  const partners = clubPartnersStore();
  const active = partners.filter(item => item.status === 'active').length;
  const prospects = partners.filter(item => item.status === 'prospect').length;
  const uses = partners.reduce((sum, item) => sum + Number(item.usageCount || 0), 0);
  const high = partners.filter(item => item.priority === 'high').length;
  const kpis = document.getElementById('clubPartnerKpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="card"><div class="label">Parceiros</div><div class="value">${partners.length}</div><div class="sub">base de parcerias do clube</div></div>
      <div class="card"><div class="label">Ativos</div><div class="value">${active}</div><div class="sub">${prospects} em negociacao</div></div>
      <div class="card"><div class="label">Usos registrados</div><div class="value">${uses}</div><div class="sub">controle manual de beneficios</div></div>
      <div class="card"><div class="label">Prioridade alta</div><div class="value">${high}</div><div class="sub">parcerias para acompanhar de perto</div></div>
    `;
  }
  const table = document.getElementById('clubPartnerTable');
  if (!table) return;
  table.innerHTML = partners.length ? partners.map(partner => {
    const status = partnerStatusInfo(partner.status);
    return `<tr>
      <td><strong>${escapeHtml(partner.name)}</strong><br><span style="color:var(--p3-muted);font-size:11px">${escapeHtml(partner.category || '-')}</span></td>
      <td><span class="club-status-pill ${status.cls}">${status.label}</span></td>
      <td>${escapeHtml(partner.benefit || '-')}</td>
      <td>${escapeHtml(partner.rule || '-')}</td>
      <td>${escapeHtml(partner.coupon || '-')}</td>
      <td>${Number(partner.usageCount || 0)}</td>
      <td>${escapeHtml(partner.contact || '-')}</td>
      <td>${escapeHtml(partner.validity || '-')}</td>
      <td><div class="partner-table-actions"><button class="btn-recalc" onclick="editClubPartner('${escapeAttr(partner.id)}')">Editar</button><button class="btn-danger" onclick="deleteClubPartner('${escapeAttr(partner.id)}')">Excluir</button></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" style="color:var(--p3-muted);text-align:center;padding:20px">Nenhuma parceria cadastrada.</td></tr>';
}

async function handleClubParticipantFiles(files = []) {
  if (!files.length) return;
  const imported = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    let rows = [];
    if (/\.csv$/i.test(file.name) || /csv/i.test(file.type || '')) {
      rows = parseCsvRows(new TextDecoder('utf-8').decode(buffer));
    } else {
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, blankrows: false });
    }
    imported.push(...clubParticipantsFromRows(rows));
  }
  const merged = mergeClubParticipants(imported, 'importacao manual');
  const status = document.getElementById('clubParticipantsStatus');
  if (status) status.textContent = `${imported.length} participante(s) importado(s). Base do Clube UBY agora tem ${merged.length} cadastro(s).`;
  renderClub();
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

function clubCompetitionScope() {
  const unitData = getGeneralUnitData();
  const charges = getUbyOperationCharges(unitData).filter(charge => Number(charge.revenue || 0) > 0);
  const months = clubCompetitionMonths(charges);
  const selector = document.getElementById('clubMonthSelector');
  const selectedMonth = months.includes(selector?.value) ? selector.value : (months.at(-1) || '');
  if (selector) {
    selector.innerHTML = months.map(month => `<option value="${month}">${monthLabel(month)}</option>`).join('') || '<option value="">Sem mês com recargas</option>';
    selector.value = selectedMonth;
  }
  return { charges, months, selectedMonth };
}

function handleClubMonthChange() {
  renderClub();
}

function clubWinnerNotice(rows = [], month = '') {
  const ranking = rows.slice(0, 3).length
    ? rows.slice(0, 3).map((row, index) => `${index + 1}º lugar: ${row.name} - ${row.points.toLocaleString('pt-BR')} pontos`).join('\n')
    : 'Ainda não houve pontuação suficiente para definir vencedores.';
  return `RESULTADO CLUBE UBY - ${monthLabel(month || monthKey(new Date()))}\n\n${ranking}\n\nParabéns aos vencedores do mês! Os três primeiros colocados recebem 30% de desconto em alinhamento e balanceamento. Todos os participantes do Clube UBY têm 10% de desconto nos serviços da rede Muffatão Autocenter.\n\nIMPORTANTE: a premiação é validada somente para quem estiver no grupo Clube UBY e com o cadastro do Clube preenchido. Caso uma dessas condições não seja atendida, não haverá direito ao prêmio.\n\nCada R$ 1 gasto nas recargas UBY gera 1 ponto. O próximo ranking começa no primeiro dia do próximo mês.`;
}

async function copyClubWinnerNotice() {
  const scope = clubCompetitionScope();
  const rows = enrichClubClientRows(
    clubClientRows(scope.charges.filter(charge => chargeMonthKey(charge) === scope.selectedMonth)),
    clubParticipantsStore().rows
  );
  const notice = clubWinnerNotice(rows, scope.selectedMonth);
  try {
    await navigator.clipboard.writeText(notice);
    alert('Aviso mensal copiado. Valide grupo e cadastro antes de enviar.');
  } catch (_) {
    window.prompt('Copie o aviso mensal abaixo:', notice);
  }
}

function renderClub() {
  ensureClubParticipantsAutoSync();
  const scope = clubCompetitionScope();
  const charges = scope.charges;
  const monthCharges = scope.selectedMonth ? charges.filter(charge => chargeMonthKey(charge) === scope.selectedMonth) : [];
  const participantStore = clubParticipantsStore();
  const participants = participantStore.rows;
  const accumulatedRows = enrichClubClientRows(clubClientRows(charges), participants);
  const accumulatedByKey = new Map();
  accumulatedRows.forEach(row => clubParticipantKeys(row).forEach(key => accumulatedByKey.set(key, row)));
  const rows = enrichClubClientRows(clubClientRows(monthCharges), participants).map(row => {
    const accumulated = clubParticipantKeys(row).map(key => accumulatedByKey.get(key)).find(Boolean);
    return {
      ...row,
      accumulatedPoints: accumulated?.points || row.points,
      accumulatedRevenue: accumulated?.revenue || row.revenue
    };
  });
  const competitionLabel = scope.selectedMonth ? monthLabel(scope.selectedMonth) : 'sem mês com recargas';
  const rankByKey = new Map();
  rows.forEach(row => clubParticipantKeys(row).forEach(key => rankByKey.set(key, row)));
  const matchedParticipants = participants.filter(participant => clubParticipantKeys(participant).some(key => rankByKey.has(key)));
  const acceptedLgpd = participants.filter(participant => participant.acceptedLgpd).length;
  const withVehicle = participants.filter(participant => participant.vehicleBrand || participant.vehicleModel || participant.vehiclePlate).length;
  const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const withPhone = rows.filter(row => row.phone).length;
  const registeredRows = rows.filter(row => row.registered).length;
  const top3 = rows.slice(0, 3);

  document.getElementById('clubHeroMeta').innerHTML = rows.length
    ? `<strong>${competitionLabel}</strong>: ${rows.length} participante(s) UBY com consumo pago<br>${fmtBRL(totalRevenue)} em faturamento no mês<br>${totalPoints.toLocaleString('pt-BR')} ponto(s) mensais`
    : `Nenhum cliente UBY com faturamento pago em ${competitionLabel} para pontuar ainda.`;
  document.getElementById('clubHeroFormula').innerHTML =
    `<strong>Competição mensal: ${competitionLabel}</strong><br>Somente carregadores marcados como operação UBY entram no clube.<br>R$ 1 gasto = 1 ponto no Clube UBY.<br>Top 3 ganham 30% em alinhamento e balanceamento.<br>Prêmio válido somente para quem estiver no grupo e com cadastro preenchido.`;

  document.getElementById('clubKpis').innerHTML = `
    <div class="card"><div class="label">Participantes no mês</div><div class="value">${rows.length}</div><div class="sub">clientes com faturamento pago em ${competitionLabel}</div></div>
    <div class="card"><div class="label">Pontos do mês</div><div class="value">${totalPoints.toLocaleString('pt-BR')}</div><div class="sub">1 ponto por real gasto</div></div>
    <div class="card"><div class="label">Receita do mês</div><div class="value">${fmtBRL(totalRevenue)}</div><div class="sub">base mensal do ranking</div></div>
    <div class="card"><div class="label">Com telefone</div><div class="value">${withPhone}</div><div class="sub">${rows.length ? fmtPct(withPhone / rows.length * 100) : '0,00%'} dos participantes</div></div>
    <div class="card"><div class="label">Cadastro Forms</div><div class="value">${registeredRows}</div><div class="sub">${rows.length ? fmtPct(registeredRows / rows.length * 100) : '0,00%'} do ranking cruzado</div></div>
  `;

  document.getElementById('clubRewards').innerHTML = `
    <div class="action-row"><div><strong>Top 3 mensal</strong><span>30% de desconto em alinhamento e balanceamento. Validação exige grupo Clube UBY e cadastro preenchido.</span></div><b class="good">Ativo</b></div>
    <div class="action-row"><div><strong>Todos os participantes</strong><span>10% de desconto em todos os serviços da rede Muffatão Autocenter.</span></div><b class="good">Ativo</b></div>
  `;
  renderClubPartners();

  const statusEl = document.getElementById('clubParticipantsStatus');
  const sourceEl = document.getElementById('clubParticipantsSource');
  if (statusEl) {
    const updatedAt = participantStore.updatedAt ? fmtDT(new Date(participantStore.updatedAt)) : 'sem sincronizacao ainda';
    const endpointMode = clubFormEndpointUrl() ? 'Endpoint seguro configurado.' : 'Endpoint seguro ainda nao configurado.';
    statusEl.textContent = participants.length
      ? `${participants.length} cadastro(s) carregado(s). Ultima atualizacao: ${updatedAt}. ${endpointMode}`
      : `Sem participantes cadastrados ainda. ${endpointMode} Sincronize o formulario ou importe CSV/Excel.`;
  }
  if (sourceEl) {
    sourceEl.textContent = participantStore.source ? `Fonte: ${participantStore.source}` : (clubFormEndpointUrl() ? 'Fonte: endpoint seguro' : 'Fonte: formulario');
    sourceEl.className = `club-status-pill ${participants.length ? 'good' : 'muted'}`;
  }
  document.getElementById('clubParticipantsKpis').innerHTML = `
    <div class="card"><div class="label">Cadastrados</div><div class="value">${participants.length}</div><div class="sub">respostas do formulario</div></div>
    <div class="card"><div class="label">Com LGPD</div><div class="value">${acceptedLgpd}</div><div class="sub">${participants.length ? fmtPct(acceptedLgpd / participants.length * 100) : '0,00%'} da base</div></div>
    <div class="card"><div class="label">Com veiculo</div><div class="value">${withVehicle}</div><div class="sub">marca, modelo ou placa preenchida</div></div>
    <div class="card"><div class="label">Com consumo UBY</div><div class="value">${matchedParticipants.length}</div><div class="sub">cruzados com ranking de pontos</div></div>
  `;
  document.getElementById('clubParticipantsTable').innerHTML = participants.length ? participants.map(participant => {
    const rank = clubParticipantKeys(participant).map(key => rankByKey.get(key)).find(Boolean);
    const status = !participant.acceptedLgpd ? { label: 'LGPD pendente', cls: 'warn' }
      : rank ? { label: 'Ativo com consumo', cls: 'good' }
      : { label: 'Cadastrado sem consumo', cls: 'muted' };
    const vehicle = [participant.vehicleBrand, participant.vehicleModel].filter(Boolean).join(' ') || participant.vehiclePlate || '-';
    const created = participant.createdAtMs ? fmtDT(new Date(participant.createdAtMs)) : (participant.createdRaw || '-');
    return `<tr>
      <td>${escapeHtml(participant.name || '-')}</td>
      <td>${participant.phone ? escapeHtml(participant.phone) : '-'}</td>
      <td>${participant.email ? escapeHtml(participant.email) : '-'}</td>
      <td>${escapeHtml(vehicle)}</td>
      <td>${participant.vehiclePlate ? escapeHtml(participant.vehiclePlate) : '-'}</td>
      <td><span class="club-status-pill ${status.cls}">${status.label}</span></td>
      <td>${rank ? rank.points.toLocaleString('pt-BR') : '0'}</td>
      <td>${rank ? fmtBRL(rank.revenue) : fmtBRL(0)}</td>
      <td>${participant.desiredBenefit ? escapeHtml(participant.desiredBenefit) : '-'}</td>
      <td>${escapeHtml(created)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" style="color:var(--p3-muted);text-align:center;padding:20px">Sem cadastros do formulario carregados.</td></tr>';

  const podiumRankLabel = position => `<span class="podium-ordinal">${position}&ordm;</span><span>Lugar</span>`;
  const podiumOrder = [
    { row: top3[1], position: 2 },
    { row: top3[0], position: 1 },
    { row: top3[2], position: 3 }
  ];
  document.getElementById('clubPrintMeta').innerHTML = rows.length
    ? `${competitionLabel}<br>${rows.length} participante(s) UBY<br>${fmtBRL(totalRevenue)} no mês<br>${totalPoints.toLocaleString('pt-BR')} ponto(s) mensais`
    : `Sem participantes UBY em ${competitionLabel} ainda`;
  document.getElementById('clubPodium').innerHTML = podiumOrder.map(slot => {
    if (!slot.row) {
      return `<div class="podium-place rank-${slot.position}">
        <div class="podium-content">
          <div>
            <div class="podium-rank">${podiumRankLabel(slot.position)}</div>
            <div class="podium-medal">#${slot.position}</div>
            <div class="podium-name">Aguardando cliente</div>
          </div>
          <div class="podium-detail">Sem faturamento elegivel para esta posicao.</div>
        </div>
        <div class="podium-step">${slot.position}</div>
      </div>`;
    }
    return `<div class="podium-place rank-${slot.position}">
      <div class="podium-content">
        <div>
          <div class="podium-rank">${podiumRankLabel(slot.position)}</div>
          <div class="podium-medal">#${slot.position}</div>
          <div class="podium-name">${escapeHtml(slot.row.name)}</div>
          <div class="podium-points">${slot.row.points.toLocaleString('pt-BR')} pts</div>
          <div class="podium-stats">
            <div class="podium-stat"><strong>${fmtBRL(slot.row.revenue)}</strong><span>${competitionLabel}</span></div>
            <div class="podium-stat"><strong>${slot.row.count}</strong><span>recargas</span></div>
            <div class="podium-stat"><strong>${slot.row.energy.toFixed(1).replace('.', ',')} kWh</strong><span>energia</span></div>
          </div>
          ${slot.row.phone ? `<div class="podium-phone">Tel: ${escapeHtml(slot.row.phone)}</div>` : ''}
        </div>
        <div class="podium-benefit">30% em alinhamento e balanceamento</div>
      </div>
      <div class="podium-step">${slot.position}</div>
    </div>`;
  }).join('');

  document.getElementById('clubTop3').innerHTML = top3.length ? top3.map((row, index) => `
    <div class="action-row">
      <div><strong>${index + 1}. ${escapeHtml(row.name)}</strong><span>${row.points.toLocaleString('pt-BR')} ponto(s) · ${fmtBRL(row.revenue)} · ${row.phone ? `Tel: ${escapeHtml(row.phone)}` : 'sem telefone'}</span></div>
      <b class="good">30%</b>
    </div>
  `).join('') : '<div class="note">Sem participantes elegíveis ainda.</div>';

  document.getElementById('clubRankingTable').innerHTML = rows.length ? rows.map((row, index) => {
    const position = index + 1;
    const registerStatus = row.registered
      ? (row.acceptedLgpd ? 'Forms + LGPD' : 'Forms sem LGPD')
      : 'Sem cadastro';
    const vehicle = [row.vehicleBrand, row.vehicleModel].filter(Boolean).join(' ') || row.vehiclePlate || '-';
    return `<tr>
      <td>${position}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><span class="club-status-pill ${row.registered ? (row.acceptedLgpd ? 'good' : 'warn') : 'muted'}">${registerStatus}</span></td>
      <td>${row.phone ? escapeHtml(row.phone) : '-'}</td>
      <td>${row.email ? escapeHtml(row.email) : '-'}</td>
      <td>${escapeHtml(vehicle)}</td>
      <td>${row.points.toLocaleString('pt-BR')}</td>
      <td>${fmtBRL(row.revenue)}</td>
      <td>${row.energy.toFixed(2).replace('.', ',')}</td>
      <td>${row.count}</td>
      <td>${row.accumulatedPoints.toLocaleString('pt-BR')}</td>
      <td>${fmtBRL(row.accumulatedRevenue)}</td>
      <td>${fmtDT(row.lastDate)}</td>
      <td>${escapeHtml(clubBenefitForPosition(position))}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="14" style="color:var(--p3-muted);text-align:center;padding:20px">Sem clientes elegíveis no clube neste mês.</td></tr>';
}
async function toggleUbyOperation(workId, key, checked) {
  syncGeneralRecordsFromLocal();
  const db = localRechargeDb();
  const record = allRechargeRecords[workId] || db[workId] || rechargeMetadataSeed(workId);
  const overrides = { ...(record.ubyOperationOverrides || record.summary?.ubyOperationOverrides || {}) };
  overrides[key] = !!checked;
  record.ubyOperationOverrides = overrides;
  record.summary = { ...(record.summary || {}), ubyOperationOverrides: overrides, updatedAt: new Date().toISOString() };
  record.updatedAt = new Date().toISOString();
  record.metadataType = 'uby_operation';
  db[workId] = compactRechargeRecord(record);
  writeJson(RECARGAS_LOCAL_KEY, db);
  allRechargeRecords[workId] = record;
  markRechargeRecordsDirty();

  if (workId === currentWorkId) {
    ubyOperationOverrides = overrides;
    saveLocalRechargeBase(record);
    try {
      if (window.UBY_SUPABASE?.saveRechargeMetadata) {
        await window.UBY_SUPABASE.saveRechargeMetadata(workId, record);
      }
    } catch (err) {
      setStorageState(`Marcacao UBY salva neste navegador. Supabase pendente: ${err.message}`, true);
    }
  } else if (window.UBY_SUPABASE?.saveRechargeMetadata) {
    try {
      await window.UBY_SUPABASE.saveRechargeMetadata(workId, record);
    } catch (err) {
      setStorageState(`Marcacao UBY salva neste navegador. Supabase pendente: ${err.message}`, true);
    }
  }
  renderUbyOperation();
  renderGeral();
  renderClub();
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

function readUbyAreaAccounting() {
  const local = readJson(UBY_AREA_ACCOUNTING_KEY, {});
  Object.values(allRechargeRecords || {}).forEach(record => {
    const cloud = record?.ubyAreaAccounting || record?.summary?.ubyAreaAccounting || {};
    Object.assign(local, cloud);
  });
  return local;
}

function writeUbyAreaAccounting(data) {
  writeJson(UBY_AREA_ACCOUNTING_KEY, data || {});
}

function ubyAreaRowKey(row = {}) {
  return `${row.workId || 'obra'}|${normalizeStationForCompare(row.stationName || row.station || row.workName || '')}`;
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

function ubyAreaOperationStart(row = {}) {
  return operationStartForCharges(row.charges, row) || new Date();
}

function ubyAreaCurrentCycle(row = {}, reference = new Date()) {
  const operationStart = ubyAreaOperationStart(row);
  const target = reference < operationStart ? operationStart : reference;
  const close = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);
  const sameOpeningMonth = operationStart.getFullYear() === close.getFullYear() && operationStart.getMonth() === close.getMonth();
  const periodStart = sameOpeningMonth ? new Date(operationStart) : new Date(close.getFullYear(), close.getMonth(), 1, 0, 0, 0);
  return {
    start: periodStart,
    end: close,
    key: `${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, '0')}`,
    label: `${fmtDateOnly(periodStart)} a ${fmtDateOnly(close)}`,
    first: periodStart.getTime() === operationStart.getTime()
  };
}

function ubyAreaSettingsForRow(row = {}, cycle = {}) {
  const saved = readUbyAreaAccounting();
  const rowKey = ubyAreaRowKey(row);
  const savedRow = saved[rowKey] || {};
  const legacyCycleKey = /^\d{4}-\d{2}$/.test(cycle.key || '') ? `${cycle.key}-10` : '';
  const latestSavedCycle = Object.keys(savedRow).sort().reverse().map(key => savedRow[key]).find(Boolean) || {};
  const savedCycle = savedRow[cycle.key] || savedRow[legacyCycleKey] || latestSavedCycle;
  const latestMonth = [...new Set((row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort().at(-1) || '';
  const finance = financeSettingsForUbyRow(row, latestMonth);
  const defaultShare = Number(finance.ownerRevenueSharePct || finance.ownerNetProfitSharePct || 0);
  return {
    energyRate: Number(savedCycle.energyRate ?? finance.ownerEnergyRate ?? finance.energyCostPerKWh ?? 0),
    transferMode: savedCycle.transferMode || finance.ownerTransferMode || 'net',
    areaSharePct: Number(savedCycle.areaSharePct ?? defaultShare ?? 0),
    extraRevenue: Number(savedCycle.extraRevenue ?? 0),
    otherCosts: Number(savedCycle.otherCosts ?? 0),
    notes: savedCycle.notes || ''
  };
}

async function saveUbyAreaSetting(rowKey, cycleKey, field, value) {
  const saved = readUbyAreaAccounting();
  const row = saved[rowKey] || {};
  const current = row[cycleKey] || {};
  const numericFields = new Set(['energyRate', 'areaSharePct', 'extraRevenue', 'otherCosts']);
  current[field] = numericFields.has(field) ? Number(parseFloat(value) || 0) : String(value || '');
  saved[rowKey] = { ...row, [cycleKey]: current };
  writeUbyAreaAccounting(saved);
  renderUbyOperation();
  const workId = String(rowKey || '').split('|')[0] || '';
  const perWork = Object.fromEntries(Object.entries(saved).filter(([key]) => key.startsWith(`${workId}|`)));
  const record = allRechargeRecords[workId];
  if (record) {
    record.ubyAreaAccounting = perWork;
    record.summary = { ...(record.summary || {}), ubyAreaAccounting: perWork };
    record.metadataType = 'uby_area_accounting';
    const localDb = readJson(RECARGAS_LOCAL_KEY, {});
    localDb[workId] = compactRechargeRecord({ ...(localDb[workId] || {}), ...record, summary: record.summary });
    writeJson(RECARGAS_LOCAL_KEY, localDb);
    if (window.UBY_SUPABASE?.saveRechargeMetadata) {
      try {
        await window.UBY_SUPABASE.saveRechargeMetadata(workId, record);
        setStorageState('Prestacao de contas UBY salva no banco.');
      } catch (err) {
        setStorageState(`Prestacao salva neste navegador. Supabase pendente: ${err.message}`, true);
      }
      return;
    }
  }
  setStorageState('Prestacao de contas UBY salva neste navegador.');
}

function calculateUbyAreaReport(row = {}, cycle = {}, settings = {}) {
  const charges = (row.charges || []).filter(charge => {
    const d = charge.startDate;
    return d && d >= cycle.start && d <= cycle.end;
  });
  const revenue = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const clients = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const energyCost = energy * Number(settings.energyRate || 0);
  const extraRevenue = Number(settings.extraRevenue || 0);
  const otherCosts = Number(settings.otherCosts || 0);
  const netBeforeArea = revenue + extraRevenue - energyCost - otherCosts;
  const shareBase = settings.transferMode === 'gross' ? revenue : Math.max(netBeforeArea, 0);
  const areaShare = shareBase * Number(settings.areaSharePct || 0) / 100;
  const ubyResult = netBeforeArea - areaShare;
  const partnerTotal = energyCost + areaShare;
  return { charges, count: charges.length, revenue, energy, clients, energyCost, extraRevenue, otherCosts, netBeforeArea, shareBase, areaShare, partnerTotal, ubyResult };
}

function ubyAreaCyclesUntil(row = {}, currentCycle = ubyAreaCurrentCycle(row)) {
  const operationStart = ubyAreaOperationStart(row);
  const cycles = [];
  let periodStart = new Date(operationStart);
  while (periodStart <= currentCycle.end && cycles.length < MAX_FINANCE_MONTHS) {
    const close = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);
    cycles.push({
      start: new Date(periodStart),
      end: new Date(close),
      key: `${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, '0')}`,
      label: `${fmtDateOnly(periodStart)} a ${fmtDateOnly(close)}`,
      first: periodStart.getTime() === operationStart.getTime()
    });
    periodStart = new Date(close.getFullYear(), close.getMonth() + 1, 1, 0, 0, 0);
  }
  return cycles;
}

function sumUbyAreaReports(items = []) {
  return items.reduce((acc, item) => {
    Object.entries(item.result || item).forEach(([key, value]) => {
      if (typeof value === 'number') acc[key] = (acc[key] || 0) + value;
    });
    return acc;
  }, {});
}

function ubyAreaReportRecord(row = {}, cycle = {}, status = 'partial') {
  const settings = ubyAreaSettingsForRow(row, cycle);
  const calculated = calculateUbyAreaReport(row, cycle, settings);
  const result = { ...calculated };
  delete result.charges;
  const stationName = row.stationName || row.station || row.workName || '';
  const dateOnly = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    workId: row.workId,
    stationKey: normalizeStationForCompare(canonicalStationNameForWork(row.workId, stationName, row.workName)),
    stationName,
    reportType: 'partner_area',
    periodKey: cycle.key,
    periodStart: dateOnly(cycle.start),
    periodEnd: dateOnly(cycle.end),
    status,
    payload: cleanFinanceReportPayload({
      schemaVersion: 2,
      work: { id: row.workId, name: row.workName, stationName },
      cycle: { key: cycle.key, label: cycle.label, first: cycle.first },
      period: { key: cycle.key, label: cycle.label, start: dateOnly(cycle.start), end: dateOnly(cycle.end) },
      settings,
      metrics: { revenue: result.revenue, energy: result.energy, charges: result.count, clients: result.clients },
      result
    })
  };
}

function findUbyAreaRow(rowKey) {
  return getUbyChargerRows(getGeneralUnitData())
    .map(item => summarizeUbyChargerRow(item, item.charges))
    .find(item => ubyAreaRowKey(item) === rowKey);
}

async function saveCurrentUbyAreaReport(rowKey, status = 'partial') {
  const row = findUbyAreaRow(rowKey);
  if (!row) return alert('Nao encontrei a base completa desta unidade UBY.');
  const cycle = ubyAreaCurrentCycle(row);
  const saved = await persistFinanceReport(ubyAreaReportRecord(row, cycle, status));
  renderUbyPartnerReportLibrary();
  setStorageState(`${status === 'closed' ? 'Fechamento' : 'Parcial'} UBY de <strong>${cycle.label}</strong> salvo (versao ${saved.version || 1}).`);
}

async function syncCompletedUbyAreaReports(rows = []) {
  if (ubyAreaReportSyncPromise || !rows.length) return ubyAreaReportSyncPromise;
  ubyAreaReportSyncPromise = (async () => {
    await loadFinanceReportArchive();
    const now = new Date();
    for (const row of rows) {
      const currentCycle = ubyAreaCurrentCycle(row);
      for (const cycle of ubyAreaCyclesUntil(row, currentCycle)) {
        if (cycle.end > now) continue;
        const stationKey = normalizeStationForCompare(canonicalStationNameForWork(row.workId, row.stationName || row.station || row.workName, row.workName));
        const exists = financeReportArchive.some(item => item.workId === row.workId && (item.stationKey || '') === stationKey && item.reportType === 'partner_area' && item.periodKey === cycle.key && item.status === 'closed' && Number(item.payload?.schemaVersion || 0) >= 2);
        if (!exists) await persistFinanceReport(ubyAreaReportRecord(row, cycle, 'closed'));
      }
    }
    renderUbyPartnerReportLibrary();
  })().catch(err => console.warn('Nao foi possivel arquivar os fechamentos UBY:', err)).finally(() => { ubyAreaReportSyncPromise = null; });
  return ubyAreaReportSyncPromise;
}

function buildUbyAreaReportModel(row = {}, cycle = ubyAreaCurrentCycle(row)) {
  const cycleReports = ubyAreaCyclesUntil(row, cycle).map(itemCycle => {
    const settings = ubyAreaSettingsForRow(row, itemCycle);
    const result = calculateUbyAreaReport(row, itemCycle, settings);
    return {
      key: itemCycle.key,
      label: itemCycle.label,
      revenue: result.revenue,
      energy: result.energy,
      charges: result.count,
      clients: result.clients,
      energyRate: settings.energyRate,
      energyCost: result.energyCost,
      transferMode: settings.transferMode,
      sharePct: settings.areaSharePct,
      shareBase: result.shareBase,
      areaShare: result.areaShare,
      partnerTotal: result.partnerTotal,
      notes: settings.notes || ''
    };
  });
  const current = cycleReports.find(item => item.key === cycle.key) || cycleReports.at(-1) || {};
  const accumulated = cycleReports.reduce((acc, entry) => {
    ['revenue','energy','charges','clients','energyCost','areaShare','partnerTotal'].forEach(key => { acc[key] = (acc[key] || 0) + Number(entry[key] || 0); });
    return acc;
  }, {});
  return {
    report: {
      station: row.stationName || row.station || row.workName,
      work: row.workName,
      period: cycle.label,
      status: cycle.end <= new Date() ? 'closed' : 'partial',
      generatedAt: new Date().toLocaleString('pt-BR')
    },
    current,
    accumulated,
    timeline: cycleReports
  };
}

function generateUbyAreaReportPdf(rowKey) {
  const row = findUbyAreaRow(rowKey);
  if (!row) return alert('Nao encontrei a base deste ponto para gerar o relatorio.');
  const model = buildUbyAreaReportModel(row, ubyAreaCurrentCycle(row));
  openFinanceReportDocument(window.UBY_FINANCE_REPORTS.areaReport(model, { printAfter: true }));
}

function generateUbyAreaReportPdfLegacy(rowKey) {
  const row = getUbyChargerRows(getGeneralUnitData())
    .map(item => summarizeUbyChargerRow(item, item.charges))
    .find(item => ubyAreaRowKey(item) === rowKey);
  if (!row) {
    alert('Nao encontrei a base deste ponto para gerar o relatorio.');
    return;
  }
  const cycle = ubyAreaCurrentCycle(row);
  const settings = ubyAreaSettingsForRow(row, cycle);
  const result = calculateUbyAreaReport(row, cycle, settings);
  const modeLabel = settings.transferMode === 'gross' ? 'Faturamento bruto' : 'Lucro liquido';
  const cycleReports = ubyAreaCyclesUntil(row, cycle).map(itemCycle => {
    const itemSettings = ubyAreaSettingsForRow(row, itemCycle);
    return { cycle: itemCycle, settings: itemSettings, result: calculateUbyAreaReport(row, itemCycle, itemSettings) };
  });
  const accumulated = sumUbyAreaReports(cycleReports);
  const rows = [
    ['Unidade', row.stationName || row.station || row.workName],
    ['Obra', row.workName],
    ['Periodo', cycle.label],
    ['Receita do periodo', fmtBRL(result.revenue)],
    ['Energia consumida', fmtKWh(result.energy)],
    ['Recargas', String(result.count)],
    ['Clientes atendidos', String(result.clients)],
    ['Custo energia', `${fmtKWh(result.energy)} x ${fmtBRL(settings.energyRate)} = ${fmtBRL(result.energyCost)}`],
    ['Receitas extras', fmtBRL(result.extraRevenue)],
    ['Outros custos', fmtBRL(result.otherCosts)],
    ['Tipo de repasse', modeLabel],
    ['Base do repasse', fmtBRL(result.shareBase)],
    ['Participacao da area', `${fmtPct(settings.areaSharePct)} = ${fmtBRL(result.areaShare)}`],
    ['Total para area no periodo', `${fmtBRL(result.energyCost)} + ${fmtBRL(result.areaShare)} = ${fmtBRL(result.partnerTotal)}`],
    ['Observacao', settings.notes || '-']
  ];
  const accumulatedRows = [
    ['Receita acumulada', fmtBRL(accumulated.revenue || 0)],
    ['Energia acumulada', fmtKWh(accumulated.energy || 0)],
    ['Recargas acumuladas', String(accumulated.count || 0)],
    ['Reembolso energia acumulado', fmtBRL(accumulated.energyCost || 0)],
    ['Participacao area acumulada', fmtBRL(accumulated.areaShare || 0)],
    ['Total acumulado para area', fmtBRL(accumulated.partnerTotal || 0)]
  ];
  const cycleRows = cycleReports.map(item => `
    <tr>
      <td>${escapeHtml(item.cycle.label)}</td>
      <td>${fmtBRL(item.result.revenue)}</td>
      <td>${fmtKWh(item.result.energy)}</td>
      <td>${item.result.count}</td>
      <td>${fmtBRL(item.result.energyCost)}</td>
      <td>${fmtBRL(item.result.areaShare)}</td>
      <td><strong>${fmtBRL(item.result.partnerTotal)}</strong></td>
    </tr>
  `).join('');
  const printable = window.open('', '_blank');
  if (!printable) {
    alert('O navegador bloqueou a janela do relatorio. Libere pop-ups para gerar o PDF.');
    return;
  }
  printable.document.write(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Prestacao de contas UBY - ${escapeHtml(row.stationName || row.workName)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0b1524;margin:32px;background:#fff}
        .head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2D7FF9;padding-bottom:18px;margin-bottom:24px}
        h1{font-size:24px;margin:0 0 8px;color:#0b1524}
        .sub{color:#425466;font-size:13px;line-height:1.45}
        .badge{border:1px solid #2D7FF9;color:#2D7FF9;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;height:max-content}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
        .kpi{border:1px solid #d8e3f0;border-radius:10px;padding:12px;background:#f6f9fc}
        .kpi b{display:block;color:#2D7FF9;font-size:20px}
        .kpi span{display:block;color:#425466;font-size:11px;text-transform:uppercase;margin-top:4px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{background:#f6f9fc;border-bottom:1px solid #d8e3f0;padding:10px 8px;font-size:12px;text-align:left;color:#24364e}
        td{border-bottom:1px solid #d8e3f0;padding:11px 8px;font-size:13px}
        td:first-child{font-weight:700;color:#24364e;width:32%}
        .total{font-size:18px;font-weight:800;color:#0b1524}
        .section-title{font-size:16px;font-weight:800;margin:24px 0 8px;color:#0b1524}
        .foot{margin-top:22px;color:#66788a;font-size:11px}
        @media print{button{display:none}body{margin:18mm}.head{break-inside:avoid}}
      </style>
    </head>
    <body>
      <div class="head">
        <div>
          <h1>Prestacao de contas UBY</h1>
          <div class="sub">${escapeHtml(row.stationName || row.workName)}<br>Periodo: ${escapeHtml(cycle.label)}<br>Gerado em ${fmtDT(new Date())}</div>
        </div>
        <div class="badge">Fechamento mensal</div>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${fmtBRL(result.revenue)}</b><span>Receita</span></div>
        <div class="kpi"><b>${fmtKWh(result.energy)}</b><span>Energia</span></div>
        <div class="kpi"><b>${result.count}</b><span>Recargas</span></div>
        <div class="kpi"><b>${result.clients}</b><span>Clientes</span></div>
      </div>
      <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
      <p class="total">Total para area no periodo: ${fmtBRL(result.partnerTotal)}</p>
      <div class="section-title">Acumulado do ponto</div>
      <table>${accumulatedRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
      <div class="section-title">Historico por fechamento</div>
      <table>
        <thead><tr><th>Periodo</th><th>Receita</th><th>Energia</th><th>Recargas</th><th>Energia R$</th><th>Participacao</th><th>Total area</th></tr></thead>
        <tbody>${cycleRows}</tbody>
      </table>
      <div class="foot">Relatorio operacional gerado pelo painel UBY Recharge. Conferir notas fiscais, tarifa de energia e ajustes manuais antes do envio final.</div>
      <script>setTimeout(()=>window.print(),350)<\/script>
    </body>
    </html>
  `);
  printable.document.close();
}

function mergeInvestorReportItems(entries = [], property = 'costItems') {
  const merged = new Map();
  entries.forEach(entry => (entry[property] || []).forEach(item => {
    const key = item.id || normalizeStationForCompare(item.label || 'item');
    const current = merged.get(key) || { id: key, label: item.label || key, rules: new Set(), amount: 0, plannedAmount: 0 };
    if (item.rule) current.rules.add(item.rule);
    current.amount += Number(item.amount || 0);
    current.plannedAmount += Number(item.plannedAmount || 0);
    merged.set(key, current);
  }));
  const energy = entries.reduce((sum, entry) => sum + Number(entry.energy || 0), 0);
  const planningKWh = entries.reduce((sum, entry) => sum + Number(entry.planningKWh || 0), 0);
  return [...merged.values()].map(item => ({
    id: item.id,
    label: item.label,
    rule: item.rules.size === 1 ? [...item.rules][0] : 'Configuracao por ponto',
    amount: item.amount,
    plannedAmount: item.plannedAmount,
    actualPerKWh: energy > 0 ? item.amount / energy : null,
    plannedPerKWh: planningKWh > 0 ? item.plannedAmount / planningKWh : null
  }));
}

function ubyInvestorSourceRows() {
  return getUbyChargerRows(getGeneralUnitData())
    .filter(row => row.included)
    .map(row => summarizeUbyChargerRow(row, row.charges));
}

function ubyInvestorLatestMonth(rows = ubyInvestorSourceRows()) {
  return [...new Set(rows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort().at(-1) || '';
}

function ubyInvestorMonthEntry(rows = [], mk = '') {
  const [year, month] = String(mk).split('-').map(Number);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const unitEntries = rows.filter(row => ubyAreaOperationStart(row) <= monthEnd).map(row => {
    const operationStart = ubyAreaOperationStart(row);
    const charges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
    const settings = financeSettingsForUbyRow(row, mk);
    const entry = financeInvestorEntry(charges, settings, mk, {
      historyCharges: row.charges,
      power: workPowerById(row.workId),
      operationStart
    });
    return {
      ...entry,
      workId: row.workId,
      stationKey: normalizeStationForCompare(canonicalStationNameForWork(row.workId, row.stationName || row.station || row.workName, row.workName)),
      name: row.stationName || row.station || row.workName,
      workName: row.workName,
      type: String(row.kind || 'unknown').toUpperCase()
    };
  });
  const investmentValue = unitEntries.reduce((sum, entry) => sum + Number(entry.investmentValue || 0), 0);
  const total = aggregateInvestorEntries(unitEntries, investmentValue);
  total.paybackInvestmentValue = unitEntries.reduce((sum, entry) => sum + Number(entry.paybackInvestmentValue || 0), 0);
  total.p3InvestmentValue = unitEntries.reduce((sum, entry) => sum + Number(entry.p3InvestmentValue || 0), 0);
  total.partnerInvestmentValue = unitEntries.reduce((sum, entry) => sum + Number(entry.partnerInvestmentValue || 0), 0);
  const monthCharges = rows.flatMap(row => (row.charges || []).filter(charge => chargeMonthKey(charge) === mk));
  total.clients = new Set(monthCharges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  total.charges = monthCharges.length;
  total.targetOccPct = total.maxKWh > 0 ? unitEntries.reduce((sum, entry) => sum + Number(entry.targetOccPct || 0) * Number(entry.maxKWh || 0), 0) / total.maxKWh : 0;
  total.key = mk;
  total.label = monthLabel(mk);
  total.units = unitEntries.map(entry => ({
    name: entry.name,
    workName: entry.workName,
    type: entry.type,
    occupancyPct: entry.occupancyPct,
    totalRevenue: entry.totalRevenue,
    energy: entry.energy,
    totalOperatingCost: entry.totalOperatingCost,
    operationNet: entry.operationNet
  }));
  total.revenueItems = mergeInvestorReportItems(unitEntries, 'revenueItems');
  total.costItems = mergeInvestorReportItems(unitEntries, 'costItems');
  return total;
}

function buildUbyInvestorReportModel(mk = ubyInvestorLatestMonth(), rows = ubyInvestorSourceRows()) {
  const starts = rows.map(row => ubyAreaOperationStart(row)).filter(date => date && !Number.isNaN(date.getTime()));
  const firstDate = starts.length ? new Date(Math.min(...starts)) : new Date();
  const period = financeReportPeriod(mk, firstDate);
  const firstMonth = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`;
  const timeline = financeMonthSeries(firstMonth <= mk ? firstMonth : mk, mk).map(monthKeyValue => ubyInvestorMonthEntry(rows, monthKeyValue));
  const current = timeline.find(entry => entry.key === mk) || ubyInvestorMonthEntry(rows, mk);
  const accumulatedInvestment = current.investmentValue;
  const accumulated = aggregateInvestorEntries(timeline, accumulatedInvestment);
  accumulated.clients = new Set(rows.flatMap(row => row.charges || []).filter(charge => chargeMonthKey(charge) <= mk).map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  return {
    report: {
      scope: 'Rede de carregadores UBY',
      station: 'Consolidado UBY',
      period: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      status: monthCanBeClosed(mk) ? 'closed' : 'partial',
      generatedAt: new Date().toLocaleString('pt-BR')
    },
    current,
    accumulated,
    timeline,
    units: current.units || [],
    revenueItems: current.revenueItems || [],
    costItems: current.costItems || []
  };
}

function ubyInvestorReportRecord(row = {}, mk = '', status = 'partial') {
  const settings = financeSettingsForUbyRow(row, mk);
  const start = ubyAreaOperationStart(row);
  const period = financeReportPeriod(mk, start);
  const charges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
  const entry = financeInvestorEntry(charges, settings, mk, {
    historyCharges: row.charges,
    power: workPowerById(row.workId),
    operationStart: start
  });
  const firstMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const timeline = financeMonthSeries(firstMonth <= mk ? firstMonth : mk, mk).map(monthKeyValue => {
    const monthCharges = (row.charges || []).filter(charge => chargeMonthKey(charge) === monthKeyValue);
    return financeInvestorEntry(monthCharges, financeSettingsForUbyRow(row, monthKeyValue), monthKeyValue, {
      historyCharges: row.charges,
      power: workPowerById(row.workId),
      operationStart: start
    });
  });
  const model = {
    report: {
      station: row.stationName || row.station || row.workName,
      work: row.workName,
      period: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      status,
      generatedAt: new Date().toLocaleString('pt-BR')
    },
    current: entry,
    accumulated: aggregateInvestorEntries(timeline, entry.investmentValue),
    timeline,
    units: [],
    revenueItems: entry.revenueItems,
    costItems: entry.costItems
  };
  const stationName = row.stationName || row.station || row.workName || '';
  return {
    workId: row.workId,
    stationKey: normalizeStationForCompare(canonicalStationNameForWork(row.workId, stationName, row.workName)),
    stationName,
    reportType: 'investor',
    periodKey: mk,
    periodStart: period.start,
    periodEnd: period.end,
    status,
    payload: cleanFinanceReportPayload({
      schemaVersion: 2,
      work: { id: row.workId, name: row.workName, stationName },
      period,
      settings,
      metrics: { revenue: entry.totalRevenue, energy: entry.energy, charges: entry.charges, clients: entry.clients, occupancyPct: entry.occupancyPct, maxKWh: entry.maxKWh },
      result: entry,
      investorModel: model
    })
  };
}

async function saveCurrentUbyInvestorReport(status = 'partial') {
  const rows = ubyInvestorSourceRows();
  const mk = document.getElementById('ubyInvestorMonthSelector')?.value || ubyInvestorLatestMonth(rows);
  if (!rows.length || !mk) return alert('Nao ha carregadores UBY com dados para gerar o relatorio de investidores.');
  if (status === 'closed' && !confirm(`Fechar e arquivar os relatorios de investidores de ${monthLabel(mk)}?`)) return;
  const saved = [];
  for (const row of rows) saved.push(await persistFinanceReport(ubyInvestorReportRecord(row, mk, status)));
  renderUbyPartnerReportLibrary();
  setStorageState(`${status === 'closed' ? 'Fechamento' : 'Parcial'} dos investidores de <strong>${monthLabel(mk)}</strong> salvo para ${saved.length} ponto(s).`);
}

function generateUbyInvestorReportPdf(mk = '') {
  const rows = ubyInvestorSourceRows();
  const monthKeyValue = mk || document.getElementById('ubyInvestorMonthSelector')?.value || ubyInvestorLatestMonth(rows);
  if (!rows.length || !monthKeyValue) return alert('Nao ha carregadores UBY com dados para gerar o relatorio de investidores.');
  openFinanceReportDocument(window.UBY_FINANCE_REPORTS.investorReport(buildUbyInvestorReportModel(monthKeyValue, rows), { printAfter: true }));
}

async function syncHistoricUbyInvestorReports(rows = []) {
  if (ubyInvestorReportSyncPromise || !rows.length) return ubyInvestorReportSyncPromise;
  ubyInvestorReportSyncPromise = (async () => {
    await loadFinanceReportArchive();
    const currentMonth = new Date().toISOString().slice(0, 7);
    for (const row of rows) {
      const start = ubyAreaOperationStart(row);
      const firstMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      for (const mk of financeMonthSeries(firstMonth, currentMonth)) {
        if (mk >= currentMonth) continue;
        const stationName = row.stationName || row.station || row.workName || '';
        const stationKey = normalizeStationForCompare(canonicalStationNameForWork(row.workId, stationName, row.workName));
        const exists = financeReportArchive.some(item => item.workId === row.workId && (item.stationKey || '') === stationKey && item.reportType === 'investor' && item.periodKey === mk && item.status === 'closed' && Number(item.payload?.schemaVersion || 0) >= 2);
        if (!exists) await persistFinanceReport(ubyInvestorReportRecord(row, mk, 'closed'));
      }
    }
    renderUbyPartnerReportLibrary();
  })().catch(err => console.warn('Nao foi possivel arquivar os relatorios de investidores:', err)).finally(() => { ubyInvestorReportSyncPromise = null; });
  return ubyInvestorReportSyncPromise;
}

function renderUbyPartnerReports(rows = []) {
  const container = document.getElementById('ubyPartnerReports');
  const investor = document.getElementById('ubyInvestorPreview');
  if (!container || !investor) return;
  if (!rows.length) {
    container.innerHTML = '<div class="note">Nenhum carregador UBY com recargas para gerar prestacao de contas.</div>';
    investor.textContent = 'O resumo para investidores sera montado automaticamente quando houver dados UBY no periodo.';
    return;
  }
  const reports = rows.map(row => {
    const cycle = ubyAreaCurrentCycle(row);
    const settings = ubyAreaSettingsForRow(row, cycle);
    const result = calculateUbyAreaReport(row, cycle, settings);
    return { row, cycle, settings, result, rowKey: ubyAreaRowKey(row) };
  }).sort((a, b) => b.result.revenue - a.result.revenue);
  const investorMonthSelector = document.getElementById('ubyInvestorMonthSelector');
  if (investorMonthSelector) {
    const previous = investorMonthSelector.value;
    const investorMonths = [...new Set(rows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort().reverse();
    investorMonthSelector.innerHTML = investorMonths.map(mk => `<option value="${escapeAttr(mk)}">Investidores - ${monthLabel(mk)}</option>`).join('');
    investorMonthSelector.value = investorMonths.includes(previous) ? previous : (investorMonths[0] || '');
  }
  container.innerHTML = reports.map(({ row, cycle, settings, result, rowKey }) => {
    const modeLabel = settings.transferMode === 'gross' ? 'Bruto' : 'Lucro liquido';
    return `
      <div class="accountability-card">
        <div class="accountability-title">
          <div>
            <strong>${escapeHtml(row.stationName || row.station || row.workName)}</strong>
            <span>Obra: ${escapeHtml(row.workName)} | ciclo ${cycle.label}${cycle.first ? ' | primeiro fechamento' : ''}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <span class="report-status partial">Parcial atual</span>
            <span class="accountability-pill">${modeLabel}</span>
            <button class="btn-recalc" type="button" onclick="saveCurrentUbyAreaReport('${escapeAttr(rowKey)}','partial')">Salvar parcial</button>
            <button class="btn-recalc" type="button" onclick="generateUbyAreaReportPdf('${escapeAttr(rowKey)}')">Gerar PDF</button>
          </div>
        </div>
        <div class="accountability-metrics">
          <div class="accountability-metric"><b>${fmtBRL(result.revenue)}</b><span>Receita</span></div>
          <div class="accountability-metric"><b>${fmtKWh(result.energy)}</b><span>Energia</span></div>
          <div class="accountability-metric"><b>${result.count}</b><span>Recargas</span></div>
          <div class="accountability-metric"><b>${result.clients}</b><span>Clientes</span></div>
        </div>
        <div class="accountability-controls">
          <label>Energia R$/kWh
            <input class="ctl-input" type="number" min="0" step="0.01" value="${settings.energyRate}" onchange="saveUbyAreaSetting('${escapeAttr(rowKey)}','${escapeAttr(cycle.key)}','energyRate',this.value)">
          </label>
          <label>Tipo repasse
            <select class="ctl-select" onchange="saveUbyAreaSetting('${escapeAttr(rowKey)}','${escapeAttr(cycle.key)}','transferMode',this.value)">
              <option value="net" ${settings.transferMode === 'net' ? 'selected' : ''}>Lucro liquido</option>
              <option value="gross" ${settings.transferMode === 'gross' ? 'selected' : ''}>Faturamento bruto</option>
            </select>
          </label>
          <label>% area
            <input class="ctl-input" type="number" min="0" max="100" step="0.1" value="${settings.areaSharePct}" onchange="saveUbyAreaSetting('${escapeAttr(rowKey)}','${escapeAttr(cycle.key)}','areaSharePct',this.value)">
          </label>
          <label>Receitas extras
            <input class="ctl-input" type="number" min="0" step="0.01" value="${settings.extraRevenue}" onchange="saveUbyAreaSetting('${escapeAttr(rowKey)}','${escapeAttr(cycle.key)}','extraRevenue',this.value)">
          </label>
          <label>Outros custos
            <input class="ctl-input" type="number" min="0" step="0.01" value="${settings.otherCosts}" onchange="saveUbyAreaSetting('${escapeAttr(rowKey)}','${escapeAttr(cycle.key)}','otherCosts',this.value)">
          </label>
          <label class="wide">Observacao
            <input class="ctl-input" value="${escapeAttr(settings.notes)}" onchange="saveUbyAreaSetting('${escapeAttr(rowKey)}','${escapeAttr(cycle.key)}','notes',this.value)" placeholder="energia, aluguel, acerto com area">
          </label>
        </div>
        <div class="accountability-result">
          <table>
            <tbody>
              <tr><td>Reembolso energia</td><td>${fmtBRL(result.energyCost)}</td><td>${fmtKWh(result.energy)} x ${fmtBRL(settings.energyRate)}</td></tr>
              <tr><td>Base do repasse</td><td>${fmtBRL(result.shareBase)}</td><td>${modeLabel}</td></tr>
              <tr><td>Participacao da area</td><td>${fmtBRL(result.areaShare)}</td><td>${fmtPct(settings.areaSharePct)}</td></tr>
              <tr><td>Total para area</td><td>${fmtBRL(result.partnerTotal)}</td><td>energia + participacao</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  const investorMonth = investorMonthSelector?.value || ubyInvestorLatestMonth(rows);
  const investorModel = investorMonth ? buildUbyInvestorReportModel(investorMonth, rows) : null;
  const investorCurrent = investorModel?.current || {};
  investor.innerHTML = `
    <strong>Previa do relatorio completo de investidores - ${monthLabel(investorMonth)}:</strong>
    <div class="investor-preview">
      <div class="accountability-metric"><b>${fmtPct(investorCurrent.occupancyPct || 0)}</b><span>Ocupacao</span></div>
      <div class="accountability-metric"><b>${fmtBRL(investorCurrent.totalRevenue || 0)}</b><span>Receitas totais</span></div>
      <div class="accountability-metric"><b>${fmtBRL(investorCurrent.totalOperatingCost || 0)}</b><span>Todos os custos</span></div>
      <div class="accountability-metric"><b>${fmtPerKWh(investorCurrent.totalCostPerKWh)}</b><span>Custo por kWh</span></div>
      <div class="accountability-metric"><b>${fmtBRL(investorCurrent.operationNet || 0)}</b><span>Resultado operacional</span></div>
    </div>
  `;
  renderUbyPartnerReportLibrary();
  syncCompletedUbyAreaReports(rows);
  syncHistoricUbyInvestorReports(rows);
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
function renderCostTree(rows, matrizTotal) {
  const el = document.getElementById('costTree');
  if (!el) return;
  const matrixRows = (rows || []).filter(row => matrizEligibleRow(row, financeMonthKey()));
  const partnerRows = (rows || []).filter(row => normalizeOperationModel(row.finance?.operationModel) === 'third_party_management');
  if (!matrixRows.length && !partnerRows.length) { el.innerHTML = ''; return; }
  const n = matrixRows.length;
  const line = (label, value, cls) =>
    `<div class="tree-line ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;
  el.innerHTML = `
    ${matrixRows.length ? `<div class="cost-tree">
      <div class="tree-root-wrap">
        <div class="tree-node root">
          <div class="tn-tag">◆ Matriz UBY</div>
          <div class="tn-title">Custos da matriz</div>
          <div class="tn-big">${fmtBRL(matrizTotal)}<small> no período</small></div>
          <div class="tn-sub">rateado conforme regra e destinos cadastrados em ${n} carregador(es) UBY</div>
        </div>
      </div>
      <div class="tree-branches">
        ${matrixRows.map(r => {
          const f = r.finance || {};
          const ops = Number(f.management || 0) + Math.max(0, Number(f.extraCosts || 0) - Number(f.matrizCost || 0));
          const matrizShare = Number(f.matrizCost || 0);
          const matrizImpact = matrizShare > 0
            ? `${fmtBRL(matrizShare)} | ${fmtPerKWh(f.matrizCostPerKWh)}`
            : fmtBRL(0);
          const res = Number(f.operationNet || 0);
          return `
          <div class="tree-branch">
            <div class="tree-node charger">
              <div class="tn-title">${escapeHtml(r.stationName || r.station || r.workName)}</div>
              <div class="tn-workname">${escapeHtml(r.workName || '')}</div>
              ${line('Faturamento', fmtBRL(Number(f.revenue || 0)), 'in')}
              ${line('− Energia', fmtBRL(Number(f.energyCost || 0)), 'out')}
              ${line('− Gestão / operação', fmtBRL(ops), 'out')}
              ${line('− Fatia da matriz', matrizImpact, 'out matriz')}
              ${line('= Resultado', fmtBRL(res), 'total ' + (res >= 0 ? 'pos' : 'neg'))}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
    ${partnerRows.length ? `<section class="card" style="margin-top:18px;border-color:#1f6e63;background:linear-gradient(135deg,rgba(19,92,77,.18),rgba(11,28,50,.96))">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap"><div><div class="tn-tag" style="color:#42df9a">◆ Operação parceira</div><h3 style="margin:4px 0">Gestão P3 + royalty UBY — fora da matriz</h3></div><span class="sub">não recebe custos nem distribuição de cotas da matriz UBY</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:14px">${partnerRows.map(r => {
        const f = r.finance || {};
        const result = Number(f.partnerShare ?? f.operationNet ?? 0);
        return `<div class="tree-node charger" style="min-height:0"><div class="tn-title">${escapeHtml(r.stationName || r.station || r.workName)}</div><div class="tn-workname">${escapeHtml(r.workName || '')}</div>${line('Faturamento', fmtBRL(Number(f.revenue || 0)), 'in')}${line('− Gestão P3', fmtBRL(Number(f.management || 0)), 'out')}${line('− Royalty UBY', fmtBRL(Number(f.ubyRoyalty || 0)), 'out')}${line('− Impostos', fmtBRL(Number(f.taxes || 0)), 'out')}${line('= Resultado do parceiro', fmtBRL(result), 'total ' + (result >= 0 ? 'pos' : 'neg'))}<div class="tn-sub" style="margin-top:8px">P3: ${fmtBRL(Number(f.p3OperationalResult || 0))} · UBY (royalty): ${fmtBRL(Number(f.ubyRoyalty || 0))}</div></div>`;
      }).join('')}</div>
    </section>` : ''}`;
}

function networkFinanceSum(rows = [], fields = []) {
  return rows.reduce((total, row) => {
    fields.forEach(field => { total[field] = Number(total[field] || 0) + Number(row.finance?.[field] || 0); });
    return total;
  }, Object.fromEntries(fields.map(field => [field, 0])));
}

function saveNetworkDistributionFromInputs() {
  const current = loadNetworkDistribution();
  const next = {
    ...current,
    roundLabel: document.getElementById('networkRoundLabel')?.value || current.roundLabel,
    totalQuotas: document.getElementById('networkTotalQuotas')?.value,
    soldQuotas: document.getElementById('networkSoldQuotas')?.value,
    investorPct: document.getElementById('networkInvestorPct')?.value,
    legalReservePct: document.getElementById('networkLegalReservePct')?.value,
    expansionReservePct: document.getElementById('networkExpansionReservePct')?.value
  };
  saveNetworkDistribution(next);
  const feedback = document.getElementById('networkDreFeedback');
  if (feedback) feedback.textContent = 'Política da rodada salva e sincronizando com a nuvem.';
  if (window.UBY_FINANCE_ONLY) renderFinanceOnly(); else renderGeneralFinance(getGeneralUnitData());
}

function saveNetworkInvestorsFromInputs() {
  const current = loadNetworkDistribution();
  const investors = [...document.querySelectorAll('[data-network-investor-row]')].map(row => ({
    name: row.querySelector('[data-investor-name]')?.value || '',
    quotas: row.querySelector('[data-investor-quotas]')?.value || 0,
    eligibleFrom: row.querySelector('[data-investor-start]')?.value || '',
    status: row.querySelector('[data-investor-status]')?.value || 'pendente'
  }));
  const normalized = normalizeNetworkInvestors(investors);
  const total = normalized.reduce((sum, investor) => sum + investor.quotas, 0);
  if (total !== Number(current.totalQuotas || 0)) return alert(`As cotas cadastradas somam ${total}. A Rodada 1 precisa fechar em ${current.totalQuotas} cotas antes de salvar.`);
  saveNetworkDistribution({ ...current, investors: normalized });
  if (window.UBY_FINANCE_ONLY) renderFinanceOnly(); else renderGeneralFinance(getGeneralUnitData());
}

function updateNetworkDistributionMonthStatus(monthKey, status) {
  const current = loadNetworkDistribution();
  const model = networkInvestorDistributionModel();
  if (!model.valid) return alert('A distribuição não fecha. Corrija as cotas e os valores antes de aprovar esta competência.');
  if (!model.months.some(month => month.monthKey === monthKey)) return;
  const paymentLedger = { ...current.paymentLedger, [monthKey]: { status, updatedAt: new Date().toISOString() } };
  saveNetworkDistribution({ ...current, paymentLedger });
  if (window.UBY_FINANCE_ONLY) renderFinanceOnly(); else renderGeneralFinance(getGeneralUnitData());
}

function renderNetworkDre(sourceRows = [], sourceMonths = [], isMonthView = true, currentMonth = '') {
  const target = document.getElementById('networkDre');
  if (!target) return;
  const rows = sourceRows.filter(row => row.included)
    .map(row => aggregateUbyFinanceRow(row, sourceMonths, isMonthView, currentMonth));
  const ownedRows = rows.filter(row => ['uby', 'hybrid'].includes(normalizeOperationModel(row.finance?.operationModel)));
  const partnerRows = rows.filter(row => normalizeOperationModel(row.finance?.operationModel) === 'third_party_management');
  const fields = ['revenue','extraRevenue','marketingRevenue','energyCost','extraCosts','matrizCost','matrizTaxCost','taxes','areaParticipation','management','platform','operationNet','ubyRoyalty'];
  const owned = networkFinanceSum(ownedRows, fields);
  const partners = networkFinanceSum(partnerRows, fields);
  const policy = loadNetworkDistribution();
  const rechargeRevenue = Number(owned.revenue || 0);
  const operationalExtras = Number(owned.extraRevenue || 0);
  const royalties = Number(partners.ubyRoyalty || 0);
  const marketing = Number(owned.marketingRevenue || 0);
  const operationalResult = Number(owned.operationNet || 0);
  const networkResult = operationalResult + royalties + marketing;
  const positiveResult = Math.max(networkResult, 0);
  const legalReserve = positiveResult * Number(policy.legalReservePct || 0) / 100;
  const expansionReserve = positiveResult * Number(policy.expansionReservePct || 0) / 100;
  const reserve = legalReserve + expansionReserve;
  const afterReserve = positiveResult - reserve;
  const investorPool = afterReserve * Number(policy.investorPct || 0) / 100;
  const ubyRetained = positiveResult - investorPool;
  const soldQuotas = Math.min(Number(policy.soldQuotas || 0), Number(policy.totalQuotas || 1));
  const perQuota = soldQuotas > 0 ? investorPool / soldQuotas : 0;
  const period = isMonthView ? monthLabel(currentMonth) : 'Acumulado';
  const resultLabel = isMonthView ? `Resultado mensal · ${period}` : 'Resultado acumulado da rede';
  const line = (label, value, cls = '') => `<tr class="${cls}"><td>${label}</td><td style="text-align:right">${value}</td></tr>`;
  target.innerHTML = `
    <section class="card" style="border-color:rgba(66,223,154,.36);background:linear-gradient(135deg,rgba(16,72,61,.2),var(--p3-card-soft));margin-top:18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap">
        <div><div class="tn-tag">◆ Fechamento consolidado</div><h2 style="margin:4px 0">DRE da rede UBY</h2><p class="sub" style="max-width:78ch;margin:0">${escapeHtml(period)}. Consolida somente ativos UBY; royalties entram como receita da marca e marketing somente no fechamento, sem alterar as métricas de recarga.</p></div>
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><span class="accountability-pill">${ownedRows.length} ativo(s) UBY · ${partnerRows.length} parceiro(s)</span><button class="btn-open" type="button" onclick="generateNetworkUnifiedReport()">Gerar relatório unificado</button></div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.85fr);gap:18px;margin-top:18px">
        <div style="overflow:auto"><table><tbody>
          <tr class="finance-group-row"><th colspan="2">Receitas da rede</th></tr>
          ${line('Faturamento de recargas dos ativos UBY', fmtBRL(rechargeRevenue))}
          ${line('Receitas operacionais complementares', fmtBRL(operationalExtras))}
          ${line('Royalties de parceiros (fora da matriz operacional)', fmtBRL(royalties))}
          ${line('Marketing e contratos reconhecidos no fechamento', fmtBRL(marketing))}
          ${line('Receita operacional de recargas', fmtBRL(rechargeRevenue + operationalExtras), 'finance-total-row')}
          <tr class="finance-group-row"><th colspan="2">Custos já reconhecidos na rede</th></tr>
          ${line('Energia', fmtBRL(owned.energyCost))}
          ${line('Operação direta por ativo', fmtBRL(Math.max(0, Number(owned.extraCosts || 0) - Number(owned.matrizCost || 0))))}
          ${line('Tributos diretamente atribuíveis aos carregadores', fmtBRL(owned.taxes))}
          ${line('Tributos corporativos centralizados (dentro do rateio)', fmtBRL(owned.matrizTaxCost))}
          ${line('Demais custos centralizados da matriz (rateados)', fmtBRL(Math.max(0, Number(owned.matrizCost || 0) - Number(owned.matrizTaxCost || 0))))}
          ${line('Gestão P3', fmtBRL(owned.management))}
          ${line('App / plataforma', fmtBRL(owned.platform))}
          ${line('Participação de área', fmtBRL(owned.areaParticipation))}
          ${line('Resultado operacional dos ativos UBY', fmtBRL(operationalResult), 'finance-total-row')}
          <tr class="finance-group-row"><th colspan="2">Resultado final da rede</th></tr>
          ${line('Resultado operacional UBY', fmtBRL(operationalResult))}
          ${line('+ Royalties UBY', fmtBRL(royalties))}
          ${line('+ Marketing / contratos no fechamento', fmtBRL(marketing))}
          ${line('= Resultado consolidado antes da distribuição', fmtBRL(networkResult), 'finance-total-row')}
        </tbody></table></div>
        <aside style="display:grid;gap:10px;align-content:start">
          <div class="finance-result-card ${networkResult >= 0 ? 'good' : 'bad'} is-primary"><span>${resultLabel}</span><strong>${fmtBRL(networkResult)}</strong><small>${isMonthView ? 'resultado da competência selecionada' : 'soma de todas as competências carregadas'}</small></div>
          <div class="finance-result-card ${networkResult >= 0 ? 'good' : 'bad'}"><span>Base distribuível ${isMonthView ? 'do mês' : 'acumulada'}</span><strong>${fmtBRL(positiveResult)}</strong><small>${networkResult < 0 ? 'sem distribuição enquanto a rede estiver negativa' : 'base após receitas, custos e fechamentos'}</small></div>
          <div class="finance-result-card good"><span>Pool dos cotistas</span><strong>${fmtBRL(investorPool)}</strong><small>${policy.investorPct}% após reservas de ${policy.legalReservePct}% + ${policy.expansionReservePct}%</small></div>
          <div class="finance-result-card is-reference"><span>Apuração por aporte</span><strong>Mensal</strong><small>cada competência usa somente as cotas habilitadas; veja o quadro da Rodada 1 abaixo</small></div>
          <div class="finance-result-card"><span>Reservas retidas na UBY</span><strong>${fmtBRL(ubyRetained)}</strong><small>S.A.: ${fmtBRL(legalReserve)} (${policy.legalReservePct}%) · expansão: ${fmtBRL(expansionReserve)} (${policy.expansionReservePct}%)</small></div>
        </aside>
      </div>
      <div style="display:grid;grid-template-columns:1.5fr repeat(5,minmax(105px,.6fr)) auto;gap:9px;align-items:end;margin-top:18px;padding-top:16px;border-top:1px solid var(--p3-border)">
        <label class="sub">Rodada<input class="ctl-input" id="networkRoundLabel" value="${escapeAttr(policy.roundLabel)}"></label>
        <label class="sub">Cotas emitidas<input class="ctl-input" id="networkTotalQuotas" type="number" min="1" step="1" value="${policy.totalQuotas}"></label>
        <label class="sub">Cotas vendidas<input class="ctl-input" id="networkSoldQuotas" type="number" min="0" step="1" value="${soldQuotas}"></label>
        <label class="sub">% cotistas<input class="ctl-input" id="networkInvestorPct" type="number" min="0" max="100" step="0.01" value="${policy.investorPct}"></label>
        <label class="sub">% reserva legal S.A.<input class="ctl-input" id="networkLegalReservePct" type="number" min="0" max="100" step="0.01" value="${policy.legalReservePct}"></label>
        <label class="sub">% fundo expansão<input class="ctl-input" id="networkExpansionReservePct" type="number" min="0" max="100" step="0.01" value="${policy.expansionReservePct}"></label>
        <button class="btn-open" type="button" onclick="saveNetworkDistributionFromInputs()">Salvar política</button>
      </div>
      <div id="networkDreFeedback" class="sub" style="margin-top:8px">Prévia gerencial: confirme documentos, impostos e aprovação do fechamento antes de pagar ou contabilizar distribuição.</div>
    </section>`;
  const distribution = networkInvestorDistributionModel();
  const monthHeaders = distribution.months.map(month => `<th>${escapeHtml(monthLabel(month.monthKey))}</th>`).join('');
  const monthRows = distribution.months.map(month => `<tr><td>${escapeHtml(monthLabel(month.monthKey))}</td><td>${fmtBRL(month.result)}</td><td>${fmtBRL(month.legalReserve)}</td><td>${fmtBRL(month.expansionReserve)}</td><td>${month.eligibleQuotas}</td><td>${fmtBRL(month.valuePerQuota)}</td><td><select class="ctl-input" style="min-width:110px" onchange="updateNetworkDistributionMonthStatus('${month.monthKey}',this.value)"><option value="pendente" ${month.payment.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="aprovado" ${month.payment.status === 'aprovado' ? 'selected' : ''}>Aprovado</option><option value="pago" ${month.payment.status === 'pago' ? 'selected' : ''}>Pago</option></select></td></tr>`).join('') || '<tr><td colspan="7">Ainda não há competência financeira a apurar.</td></tr>';
  const investorRows = distribution.investors.map(investor => `<tr data-network-investor-row><td><input class="ctl-input" data-investor-name value="${escapeAttr(investor.name)}"></td><td><input class="ctl-input" data-investor-quotas type="number" min="1" step="1" value="${investor.quotas}" style="width:66px"></td><td><input class="ctl-input" data-investor-start type="month" value="${escapeAttr(investor.eligibleFrom)}"></td>${investor.allocations.map(value => `<td>${fmtBRL(value)}</td>`).join('')}<td>${fmtBRL(investor.due)}</td><td>${(investor.returnRate * 100).toLocaleString('pt-BR',{maximumFractionDigits:3})}%</td><td>${investor.paybackYears ? `${investor.paybackYears.toLocaleString('pt-BR',{maximumFractionDigits:1})} anos` : 'não disponível'}</td><td><select class="ctl-input" data-investor-status><option value="pendente" ${investor.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="aprovado" ${investor.status === 'aprovado' ? 'selected' : ''}>Aprovado</option><option value="pago" ${investor.status === 'pago' ? 'selected' : ''}>Pago</option></select></td></tr>`).join('');
  target.insertAdjacentHTML('beforeend', `
    <section class="card" style="margin-top:14px"><div class="tn-tag">◆ Rodada 1 · apuração por competência</div><h3 style="margin:4px 0 10px">Distribuição por período de aporte</h3><p class="sub">Cada mês é dividido somente entre as cotas habilitadas no primeiro dia do mês. Não há proporcionalização por dias nem divisão retroativa para quem entrou depois.</p>
      <div style="overflow:auto"><table><thead><tr><th>Competência</th><th>Resultado</th><th>Reserva legal S.A.</th><th>Fundo expansão</th><th>Cotas habilitadas</th><th>Por cota</th><th>Pagamento</th></tr></thead><tbody>${monthRows}</tbody></table></div>
      <div style="overflow:auto;margin-top:14px"><table><thead><tr><th>Cotista</th><th>Cotas</th><th>Início</th>${monthHeaders}<th>Total devido</th><th>Retorno acum.</th><th>Payback indicativo</th><th>Situação</th></tr></thead><tbody>${investorRows}</tbody></table></div>
      <button class="btn-open" type="button" style="margin-top:10px" onclick="saveNetworkInvestorsFromInputs()">Salvar cotistas da Rodada 1</button>
      <p class="sub" style="margin:10px 0 0">Controles: ${distribution.valid ? '✓' : '⚠'} soma individual ${fmtBRL(distribution.totalAllocated)} · pool por competência ${fmtBRL(distribution.totalPool)}. Uma competência é registrada uma única vez no controle de pagamento; aprovação é bloqueada se a conferência não fechar.</p>
    </section>`);
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
  const result = operationalResult + royalties + marketing;
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
  const sourceMonths = [...new Set(accumulated.rows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => /^\d{4}-\d{2}$/.test(key) && key >= '2026-06'))].sort();
  const investors = normalizeNetworkInvestors(accumulated.policy.investors);
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
    const investment = investor.quotas * 80000;
    const activeMonths = months.filter(month => month.monthKey >= investor.eligibleFrom && month.result > 0).length;
    const returnRate = investment ? due / investment : 0;
    const annualized = activeMonths ? returnRate / activeMonths * 12 : 0;
    return { ...investor, allocations, due, investment, returnRate, annualized, paybackYears: annualized > 0 ? 1 / annualized : null };
  });
  const totalAllocated = byInvestor.reduce((sum, investor) => sum + investor.due, 0);
  const totalPool = months.reduce((sum, month) => sum + month.investorPool, 0);
  return { investors: byInvestor, months, totalAllocated, totalPool, valid: Math.abs(totalAllocated - totalPool) < 0.02 };
}

function generateNetworkUnifiedReport() {
  const model = networkUnifiedReportModel();
  const distribution = networkInvestorDistributionModel();
  const selectedSettlement = model.periodSelection?.isMonthView
    ? distribution.months.find(month => month.monthKey === model.periodSelection.monthKey)
    : null;
  const cotistasAmount = selectedSettlement ? Number(selectedSettlement.investorPool || 0) : Number(distribution.totalAllocated || 0);
  const cotistasLabel = selectedSettlement ? 'Pool dos cotistas da competência' : 'Total devido aos cotistas';
  const monthlyResults = (model.sourceMonths || []).map(monthKey => networkUnifiedReportModel({ monthKey }));
  const occupancyCards = model.rows.map(row => {
    const occupancy = stationOccupancyForMonths(row, row.financeMonths || [], 'closed');
    const rawPct = Math.max(0, Number(occupancy.pct || 0));
    const pct = Math.min(rawPct, 100);
    const partner = normalizeOperationModel(row.finance?.operationModel) === 'third_party_management';
    return {
      name: row.stationName || row.workName,
      workName: row.workName || '',
      pct, rawPct, energy: Number(occupancy.energy || 0), maxKWh: Number(occupancy.maxKWh || 0),
      hours: Number(occupancy.hours || 0), operationStart: occupancy.operationStart, partner
    };
  }).sort((a, b) => b.rawPct - a.rawPct || a.name.localeCompare(b.name, 'pt-BR'));
  const operationalExtras = Number(model.owned.extraRevenue || 0);
  const directOperation = Math.max(0, Number(model.owned.extraCosts || 0) - Number(model.owned.matrizCost || 0));
  const stationRows = model.rows.map(row => {
    const finance = row.finance || {};
    const partner = normalizeOperationModel(finance.operationModel) === 'third_party_management';
    return `<tr><td><strong>${escapeHtml(row.stationName || row.workName)}</strong><br><small>${partner ? 'Parceiro UBY · royalties' : 'Ativo UBY'}</small></td><td>${fmtBRL(finance.revenue || 0)}</td><td>${partner ? fmtBRL(finance.ubyRoyalty || 0) : fmtBRL(finance.totalOperatingCost || 0)}</td><td class="${partner || Number(finance.operationNet || 0) >= 0 ? 'positive' : 'negative'}">${partner ? fmtBRL(finance.ubyRoyalty || 0) : fmtBRL(finance.operationNet || 0)}</td></tr>`;
  }).join('') || '<tr><td colspan="4">Sem ativos incluídos no período.</td></tr>';
  const dre = [
    ['Faturamento de recargas dos ativos UBY', model.owned.revenue],
    ['Receitas operacionais complementares', operationalExtras],
    ['Resultado operacional dos ativos UBY', model.operationalResult],
    ['Royalties de parceiros (fora da matriz operacional)', model.royalties],
    ['Marketing e contratos reconhecidos no fechamento', model.marketing],
    ['Resultado consolidado da rede', model.result]
  ];
  const costs = [
    ['Energia', model.owned.energyCost],
    ['Operação direta por ativo', directOperation],
    ['Tributos diretamente atribuíveis aos carregadores', model.owned.taxes],
    ['Tributos corporativos centralizados (dentro do rateio)', model.owned.matrizTaxCost],
    ['Demais custos centralizados da matriz', Math.max(0, Number(model.owned.matrizCost || 0) - Number(model.owned.matrizTaxCost || 0))],
    ['Gestão P3', model.owned.management],
    ['App / plataforma', model.owned.platform],
    ['Participação de área', model.owned.areaParticipation]
  ];
  const printable = window.open('', '_blank');
  if (!printable) return alert('O navegador bloqueou a janela do relatório. Libere pop-ups para gerar o PDF.');
  printable.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório unificado UBY - ${escapeHtml(model.period)}</title><style>
    *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#17283c;margin:32px;background:#fff}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #00b879;padding-bottom:18px}.brand{color:#00885a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{font-size:27px;margin:5px 0 8px}.sub,small{color:#607287;font-size:12px;line-height:1.45}.badge{border:1px solid #00a86b;border-radius:999px;padding:7px 12px;color:#00794f;font-weight:700;font-size:12px;height:max-content}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.kpi{border:1px solid #d8e3ef;border-radius:10px;padding:13px;background:#f7fbfa}.kpi b{display:block;color:#087cb7;font-size:20px}.kpi.positive b{color:#008c5a}.kpi span{display:block;font-size:11px;color:#607287;margin-top:5px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#edf5f9;color:#213c55;text-align:left;font-size:12px;padding:10px}td{border-bottom:1px solid #dce6ed;padding:10px;font-size:13px}td:not(:first-child){text-align:right}.total td{font-weight:800;background:#eefaf5}.positive{color:#008c5a;font-weight:800}.negative{color:#c83744;font-weight:800}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}.occupancy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:12px}.occupancy-card{border:1px solid #d8e3ef;border-radius:12px;padding:13px;background:linear-gradient(145deg,#fff,#f5fbff);break-inside:avoid}.occupancy-top{display:flex;align-items:center;gap:13px}.pie{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;position:relative;flex:0 0 auto;background:conic-gradient(#09a77a calc(var(--pct) * 1%),#e4edf3 0)}.pie::after{content:'';width:53px;height:53px;background:#fff;border-radius:50%;position:absolute}.pie b{z-index:1;font-size:12px;color:#0a7659}.occupancy-name{font-weight:800;font-size:13px;line-height:1.25}.occupancy-meta{font-size:11px;color:#607287;margin-top:8px}.occupancy-bar{height:5px;border-radius:99px;background:#e4edf3;margin-top:10px;overflow:hidden}.occupancy-bar span{display:block;height:100%;background:#00a879;border-radius:inherit}@media print{body{margin:16mm}.head{break-inside:avoid}}
  </style></head><body><div class="head"><div><div class="brand">UBY Recharge · Central UBY</div><h1>Relatório financeiro unificado da rede</h1><div class="sub">Competência: <strong>${escapeHtml(model.period)}</strong><br>Gerado em ${fmtDT(new Date())}</div></div><div class="badge">Prévia de fechamento</div></div>
  <div class="kpis"><div class="kpi"><b>${fmtBRL(model.owned.revenue || 0)}</b><span>Faturamento de recargas</span></div><div class="kpi"><b>${fmtBRL(model.royalties)}</b><span>Royalties UBY</span></div><div class="kpi ${model.result >= 0 ? 'positive' : ''}"><b>${fmtBRL(model.result)}</b><span>${model.periodSelection?.isMonthView ? 'Resultado mensal da rede' : 'Resultado acumulado da rede'}</span></div><div class="kpi positive"><b>${fmtBRL(cotistasAmount)}</b><span>${cotistasLabel}</span></div></div>
  <section><h2>Ocupação da rede por carregador</h2><div class="sub">Energia entregue em relação à capacidade disponível no período. O denominador começa na data real de entrada em operação; se ela ainda não foi cadastrada, usa a primeira recarga importada como referência provisória. As operações parceiras aparecem para leitura operacional, mas não alteram a matriz de custos UBY.</div><div class="occupancy-grid">${occupancyCards.map(card => `<article class="occupancy-card"><div class="occupancy-top"><div class="pie" style="--pct:${card.pct.toFixed(2)}"><b>${fmtPct(card.rawPct)}</b></div><div><div class="occupancy-name">${escapeHtml(card.name)}</div><small>${escapeHtml(card.workName)}${card.partner ? ' · Parceiro UBY' : ''}</small></div></div><div class="occupancy-meta">${fmtKWh(card.energy)} entregues de ${fmtKWh(card.maxKWh)} disponíveis · ${card.hours.toFixed(0)} h${card.operationStart ? ` · operação desde ${escapeHtml(fmtDateOnly(card.operationStart))}` : ''}</div><div class="occupancy-bar"><span style="width:${card.pct.toFixed(2)}%"></span></div></article>`).join('') || '<div class="sub">Sem base de ocupação disponível.</div>'}</div></section>
  <div class="grid"><section><h2>Receitas e resultado</h2><table><tbody>${dre.map(([label,value], index) => `<tr class="${index === dre.length - 1 ? 'total' : ''}"><td>${escapeHtml(label)}</td><td>${fmtBRL(value || 0)}</td></tr>`).join('')}</tbody></table></section><section><h2>Custos reconhecidos</h2><table><tbody>${costs.map(([label,value]) => `<tr><td>${escapeHtml(label)}</td><td>${fmtBRL(value || 0)}</td></tr>`).join('')}</tbody></table></section></div>
  <section><h2>Resultado mensal da rede</h2><div class="sub">Histórico por competência: cada linha considera somente as receitas e os custos reconhecidos naquele mês.</div><table><thead><tr><th>Competência</th><th>Recargas UBY</th><th>Royalties</th><th>Marketing</th><th>Resultado operacional</th><th>Resultado da rede</th></tr></thead><tbody>${monthlyResults.map(item => `<tr class="${item.periodSelection?.monthKey === model.periodSelection?.monthKey ? 'total' : ''}"><td>${escapeHtml(item.period)}</td><td>${fmtBRL(item.owned.revenue || 0)}</td><td>${fmtBRL(item.royalties || 0)}</td><td>${fmtBRL(item.marketing || 0)}</td><td>${fmtBRL(item.operationalResult || 0)}</td><td class="${item.result >= 0 ? 'positive' : 'negative'}">${fmtBRL(item.result || 0)}</td></tr>`).join('') || '<tr><td colspan="6">Ainda não há competências financeiras.</td></tr>'}</tbody></table></section>
  <section><h2>Consolidação por carregador e parceiro</h2><table><thead><tr><th>Unidade</th><th>Faturamento</th><th>Custos / repasse</th><th>Resultado UBY</th></tr></thead><tbody>${stationRows}</tbody></table></section>
  <section><h2>Distribuição de resultados · ${escapeHtml(model.policy.roundLabel)}</h2><table><tbody><tr><td>Resultado distribuível</td><td>${fmtBRL(model.distributable)}</td></tr><tr><td>Retenção — Reserva legal obrigatória da S.A. (${model.policy.legalReservePct}%)</td><td>${fmtBRL(model.legalReserve)}</td></tr><tr><td>Retenção — Fundo de reserva e expansão (${model.policy.expansionReservePct}%)</td><td>${fmtBRL(model.expansionReserve)}</td></tr><tr class="total"><td>${cotistasLabel}</td><td>${fmtBRL(cotistasAmount)}</td></tr></tbody></table></section>
  <section><h2>Apuração por aporte</h2><table><thead><tr><th>Cotista</th><th>Cotas</th><th>Início</th><th>Total devido</th><th>Situação</th></tr></thead><tbody>${distribution.investors.map(investor => `<tr><td>${escapeHtml(investor.name)}</td><td>${investor.quotas}</td><td>${escapeHtml(monthLabel(investor.eligibleFrom))}</td><td>${fmtBRL(investor.due)}</td><td>${escapeHtml(investor.status)}</td></tr>`).join('')}</tbody></table><div class="sub">Cada competência é dividida apenas entre as cotas habilitadas naquele mês. Conferência: ${distribution.valid ? 'fechada' : 'pendente de ajuste'}.</div></section>
  <div class="note">Marketing e contratos entram somente no fechamento financeiro; não compõem ocupação, média de recargas, projeção operacional nem faturamento principal de recargas. Parceiros ficam fora da matriz de custos UBY: somente os royalties devidos à UBY são reconhecidos neste relatório. Conferir notas fiscais, impostos e aprovação do fechamento antes de contabilizar ou realizar pagamentos.</div><script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
  printable.document.close();
}

function ubyExportSheet(XLSX, rows = [], columns = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = columns.map(width => ({ wch: width }));
  if (rows.length) sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Math.max(columns.length - 1, 0))}${rows.length}` };
  return sheet;
}

async function exportUbyNetworkFinanceXlsx() {
  const XLSX = await ensureSpreadsheetLibrary();
  const sourceRows = getUbyChargerRows(getGeneralUnitData()).filter(row => row.included);
  const sourceMonths = [...new Set(sourceRows.flatMap(row => row.charges || []).map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  if (!sourceMonths.length) return alert('Não há recargas financeiras carregadas para exportar. Clique em Atualizar e tente novamente.');
  const selected = networkUnifiedReportModel();
  const monthly = sourceMonths.map(monthKey => {
    const rows = sourceRows.map(row => aggregateUbyFinanceRow(row, sourceMonths, true, monthKey));
    const ownedRows = rows.filter(row => ['uby', 'hybrid'].includes(normalizeOperationModel(row.finance?.operationModel)));
    const partnerRows = rows.filter(row => normalizeOperationModel(row.finance?.operationModel) === 'third_party_management');
    const fields = ['revenue','extraRevenue','marketingRevenue','energy','energyCost','extraCosts','matrizCost','matrizTaxCost','taxes','areaParticipation','management','platform','operationNet','ubyRoyalty'];
    const owned = networkFinanceSum(ownedRows, fields);
    const royalties = Number(networkFinanceSum(partnerRows, fields).ubyRoyalty || 0);
    const result = Number(owned.operationNet || 0) + royalties + Number(owned.marketingRevenue || 0);
    return { monthKey, owned, royalties, result };
  });
  const workbook = XLSX.utils.book_new();
  const policy = selected.policy;
  const distribution = networkInvestorDistributionModel();
  const summaryRows = [
    ['RELATÓRIO FINANCEIRO COMPLETO — REDE UBY'],
    ['Gerado em', fmtDT(new Date())],
    ['Competência exibida', selected.period],
    [],
    ['INDICADOR', 'VALOR'],
    ['Faturamento de recargas UBY', Number(selected.owned.revenue || 0)],
    ['Receitas operacionais complementares', Number(selected.owned.extraRevenue || 0)],
    ['Royalties de parceiros', Number(selected.royalties || 0)],
    ['Marketing e contratos', Number(selected.marketing || 0)],
    ['Energia', Number(selected.owned.energyCost || 0)],
    ['Tributos diretamente atribuíveis aos carregadores', Number(selected.owned.taxes || 0)],
    ['Tributos corporativos centralizados (dentro do rateio)', Number(selected.owned.matrizTaxCost || 0)],
    ['Demais custos centralizados da matriz', Math.max(0, Number(selected.owned.matrizCost || 0) - Number(selected.owned.matrizTaxCost || 0))],
    ['Gestão P3', Number(selected.owned.management || 0)],
    ['App / plataforma', Number(selected.owned.platform || 0)],
    ['Participação de área', Number(selected.owned.areaParticipation || 0)],
    ['Resultado operacional UBY', Number(selected.operationalResult || 0)],
    ['Resultado consolidado da rede', Number(selected.result || 0)],
    ['Resultado distribuível', Number(selected.distributable || 0)],
    ['Retenção — Reserva legal obrigatória da S.A.', Number(selected.legalReserve || 0)],
    ['Retenção — Fundo de reserva e expansão', Number(selected.expansionReserve || 0)],
    ['Pool dos cotistas', Number(selected.investorPool || 0)],
    ['Total devido aos cotistas (por competência)', Number(distribution.totalAllocated || 0)],
    [],
    ['POLÍTICA DE DISTRIBUIÇÃO', 'VALOR'],
    ['Rodada', policy.roundLabel],
    ['Cotas emitidas', Number(policy.totalQuotas || 0)],
    ['Cotas vendidas', Number(selected.soldQuotas || 0)],
    ['Percentual dos cotistas', Number(policy.investorPct || 0) / 100],
    ['Retenção — Reserva legal obrigatória da S.A.', Number(policy.legalReservePct || 0) / 100],
    ['Retenção — Fundo de reserva e expansão', Number(policy.expansionReservePct || 0) / 100]
  ];
  const monthlyRows = [['MÊS', 'FATURAMENTO RECARGAS', 'ENERGIA kWh', 'CUSTO ENERGIA', 'MATRIZ RATEADA', 'TRIBUTOS DIRETOS', 'TRIBUTOS CENTRALIZADOS', 'GESTÃO P3', 'APP / PLATAFORMA', 'PARTICIPAÇÃO DE ÁREA', 'ROYALTIES', 'MARKETING', 'RESULTADO OPERACIONAL', 'RESULTADO REDE']];
  monthly.forEach(item => monthlyRows.push([
    monthLabel(item.monthKey), Number(item.owned.revenue || 0), Number(item.owned.energy || 0), Number(item.owned.energyCost || 0), Number(item.owned.matrizCost || 0), Number(item.owned.taxes || 0), Number(item.owned.matrizTaxCost || 0), Number(item.owned.management || 0), Number(item.owned.platform || 0), Number(item.owned.areaParticipation || 0), Number(item.royalties || 0), Number(item.owned.marketingRevenue || 0), Number(item.owned.operationNet || 0), Number(item.result || 0)
  ]));
  const unitsRows = [['UNIDADE', 'OBRA', 'MODELO', 'PERÍODOS', 'FATURAMENTO', 'ENERGIA kWh', 'CUSTO TOTAL', 'MATRIZ RATEADA', 'IMPOSTOS', 'ROYALTY UBY', 'RESULTADO UBY']];
  sourceRows.map(row => aggregateUbyFinanceRow(row, sourceMonths, false, '')).forEach(row => {
    const finance = row.finance || {};
    unitsRows.push([row.stationName || row.station || row.workName, row.workName || '', operationModelLabel(finance.operationModel), row.financeMonths.length, Number(finance.revenue || 0), Number(finance.energy || 0), Number(finance.totalOperatingCost || 0), Number(finance.matrizCost || 0), Number(finance.taxes || 0), Number(finance.ubyRoyalty || 0), normalizeOperationModel(finance.operationModel) === 'third_party_management' ? Number(finance.ubyRoyalty || 0) : Number(finance.operationNet || 0)]);
  });
  const matrixRows = [['CUSTO CENTRALIZADO', 'VALOR MENSAL', 'REGRA / OBSERVAÇÃO']];
  (matrizCostsState || []).forEach(item => matrixRows.push([item.name || item.label || 'Custo', Number(item.amount ?? item.value ?? 0), item.rule || item.notes || 'Rateado entre ativos elegíveis']));
  const rechargeRows = [['DATA/HORA', 'MÊS', 'UNIDADE', 'OBRA', 'CLIENTE', 'ENERGIA kWh', 'RECEITA', 'DURAÇÃO', 'STATUS']];
  sourceRows.forEach(row => (row.charges || []).forEach(charge => rechargeRows.push([
    charge.startDate instanceof Date ? fmtDT(charge.startDate) : (charge.startStr || charge.startIso || ''), chargeMonthKey(charge), row.stationName || row.station || row.workName, row.workName || '', charge.client || charge.customer || charge.user || '', Number(charge.energyKWh || charge.energy || 0), Number(charge.revenue || charge.amount || 0), charge.duration || '', charge.status || ''
  ])));
  const distributionRows = [['COMPETÊNCIA', 'RESULTADO', 'RESERVA LEGAL S.A.', 'FUNDO EXPANSÃO', 'POOL COTISTAS', 'COTAS HABILITADAS', 'VALOR POR COTA', 'SITUAÇÃO']];
  distribution.months.forEach(month => distributionRows.push([monthLabel(month.monthKey), Number(month.result || 0), Number(month.legalReserve || 0), Number(month.expansionReserve || 0), Number(month.investorPool || 0), month.eligibleQuotas, Number(month.valuePerQuota || 0), month.payment.status]));
  distributionRows.push([]);
  distributionRows.push(['COTISTA', 'COTAS', 'INÍCIO', ...distribution.months.map(month => monthLabel(month.monthKey)), 'TOTAL DEVIDO', 'APORTE', 'RETORNO ACUMULADO', 'ANUALIZADO SIMPLES', 'PAYBACK INDICATIVO', 'SITUAÇÃO']);
  distribution.investors.forEach(investor => distributionRows.push([investor.name, investor.quotas, monthLabel(investor.eligibleFrom), ...investor.allocations.map(value => Number(value || 0)), Number(investor.due || 0), Number(investor.investment || 0), Number(investor.returnRate || 0), Number(investor.annualized || 0), investor.paybackYears || '', investor.status]));
  XLSX.utils.book_append_sheet(workbook, ubyExportSheet(XLSX, summaryRows, [42, 22]), 'Resumo e DRE');
  XLSX.utils.book_append_sheet(workbook, ubyExportSheet(XLSX, monthlyRows, [16, 20, 16, 17, 17, 17, 20, 16, 18, 20, 15, 15, 22, 20]), 'Histórico mensal');
  XLSX.utils.book_append_sheet(workbook, ubyExportSheet(XLSX, unitsRows, [31, 25, 22, 10, 16, 15, 16, 17, 13, 15, 16]), 'Por unidade');
  XLSX.utils.book_append_sheet(workbook, ubyExportSheet(XLSX, matrixRows, [34, 18, 42]), 'Custos matriz');
  XLSX.utils.book_append_sheet(workbook, ubyExportSheet(XLSX, distributionRows, [28, 12, 16, ...distribution.months.map(() => 16), 18, 18, 18, 20, 20, 14]), 'Distribuição Rodada 1');
  XLSX.utils.book_append_sheet(workbook, ubyExportSheet(XLSX, rechargeRows, [20, 12, 30, 24, 28, 14, 15, 15, 16]), 'Recargas detalhadas');
  XLSX.writeFile(workbook, `UBY_Rede_Financeiro_Completo_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function renderUbyDistribution(total) {
  const el = document.getElementById('ubyDistribution');
  if (!el) return;
  const ubyNet = Number(total.ubyNet || 0);
  const hasDistributableProfit = ubyNet > 0;
  // Mesmo para históricos já calculados pela regra antiga, a tela não pode
  // mostrar destinações de lucro se o resultado consolidado é prejuízo.
  const saRet = hasDistributableProfit ? Math.max(0, Number(total.saRetention || 0)) : 0;
  const investor = hasDistributableProfit ? Math.max(0, Number(total.investorDistribution || 0)) : 0;
  const retained = hasDistributableProfit ? Math.max(0, Number(total.ubyRetained || 0)) : 0;
  if (ubyNet === 0 && investor === 0 && saRet === 0) { el.innerHTML = ''; return; }
  const quotaPct = (ubyNet - saRet) > 0 ? investor / (ubyNet - saRet) * 100 : 0;
  const card = (label, value, sub, color) =>
    `<div class="card" style="margin:0;padding:14px"><div style="font-size:12px;color:var(--p3-muted)">${label}</div><div style="font-weight:700;font-size:20px${color ? ';color:' + color : ''}">${fmtBRL(value)}</div><div style="font-size:11px;color:var(--p3-muted)">${sub}</div></div>`;
  el.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 4px">Distribuição UBY</h2>
      <p style="color:var(--p3-muted);font-size:13px;margin:6px 0 16px;max-width:70ch">${hasDistributableProfit ? 'Como o resultado UBY (já com os custos da matriz descontados) se divide entre a retenção estatutária e o repasse aos investidores por cotas.' : 'Esta competência está em prejuízo. O prejuízo permanece no resultado operacional, mas não há retenção, repasse aos cotistas nem valor retido para distribuir.'}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        ${card('Resultado UBY', ubyNet, 'após custos e matriz', ubyNet >= 0 ? 'var(--p3-ok)' : 'var(--p3-danger)')}
        ${card('Retenção S.A.', saRet, hasDistributableProfit ? 'retenção estatutária' : 'R$ 0,00 enquanto houver prejuízo', '')}
        ${card(`Investidores (${fmtPct(quotaPct)})`, investor, hasDistributableProfit ? 'repasse por cotas' : 'sem distribuição enquanto houver prejuízo', 'var(--p3-primary)')}
        ${card('UBY retido', retained, hasDistributableProfit ? 'fica na UBY' : 'sem retenção enquanto houver prejuízo', '')}
      </div>
    </div>`;
}

// Evolução mensal de Receita, Custos totais e Resultado UBY — sempre mostra
// todos os meses disponíveis, independente do seletor "Visão" da página.
function renderUbyFinanceMonthlyChart(monthlySeries = []) {
  destroyChart('chartUbyFinanceMonthly');
  const ctx = document.getElementById('chartUbyFinanceMonthly');
  if (!ctx) return;
  charts['chartUbyFinanceMonthly'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthlySeries.map(row => row.label),
      datasets: [
        { label: 'Receita', data: monthlySeries.map(row => +row.revenue.toFixed(2)), borderColor: '#57B7FF', backgroundColor: 'rgba(87,183,255,.12)', tension: .35, fill: true },
        { label: 'Custos totais', data: monthlySeries.map(row => +row.totalOperatingCost.toFixed(2)), borderColor: '#F2A93D', backgroundColor: 'rgba(242,169,61,.10)', tension: .35 },
        { label: 'Resultado UBY', data: monthlySeries.map(row => +row.operationNet.toFixed(2)), borderColor: '#38C96F', backgroundColor: 'rgba(56,201,111,.10)', tension: .35 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8FA39A' } },
        tooltip: { callbacks: { label: context => `${context.dataset.label}: ${fmtBRL(context.raw)}` } }
      },
      scales: {
        y: { ticks: { color: '#8FA39A', callback: value => fmtBRL(value) }, grid: { color: '#24364E' } },
        x: { ticks: { color: '#8FA39A' }, grid: { color: '#24364E' } }
      }
    }
  });
}

// Tendência de uma métrica vs. o mês anterior, a partir da série mensal.
// `invert` = true pra métricas onde cair é bom (custos): sobe -> vermelho.
function ubyKpiTrendFromSeries(monthlySeries, valueFn, opts = {}) {
  const dataMonths = (monthlySeries || []).filter(m => m.revenue || m.totalOperatingCost || m.operationNet);
  if (dataMonths.length < 2) return null;
  const curr = valueFn(dataMonths[dataMonths.length - 1]);
  const prior = valueFn(dataMonths[dataMonths.length - 2]);
  if (curr == null || prior == null || !Number.isFinite(curr) || !Number.isFinite(prior)) return null;
  const pct = prior !== 0 ? (curr - prior) / Math.abs(prior) * 100 : (curr !== 0 ? 100 : 0);
  let cls = 'flat';
  if (Math.abs(pct) >= 1) {
    const rising = pct > 0;
    const good = opts.invert ? !rising : rising;
    cls = good ? 'up' : 'down';
  }
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '■';
  return { pct, cls, arrow };
}
function ubyKpiTrendBadge(trend) {
  return trend ? `<div class="kpi-trend ${trend.cls}">${trend.arrow} ${fmtPct(Math.abs(trend.pct))}</div>` : '';
}

function renderUbyFinancialOverview(sourceRows = [], sourceMonths = [], isMonthView = true, currentMonth = '', viewLabel = '') {
  const summary = document.getElementById('ubyFinanceSummary');
  const rowsEl = document.getElementById('ubyFinanceRows');
  const periodLabel = document.getElementById('ubyFinancePeriodLabel');
  if (!summary || !rowsEl) return;
  const includedRows = sourceRows.filter(row => row.included);
  const rows = includedRows
    .map(row => aggregateUbyFinanceRow(row, sourceMonths, isMonthView, currentMonth))
    .sort((a, b) => Number(b.finance.operationNet || 0) - Number(a.finance.operationNet || 0));
  const partnerRows = rows.filter(row => normalizeOperationModel(row.finance?.operationModel) === 'third_party_management');
  const ubyOperationRows = rows.filter(row => normalizeOperationModel(row.finance?.operationModel) !== 'third_party_management');
  const sumFinance = (items, seed) => items.reduce((acc, row) => {
    Object.keys(acc).forEach(key => { acc[key] += Number(row.finance?.[key] || 0); });
    return acc;
  }, seed);
  const total = sumFinance(ubyOperationRows, { revenue:0, totalRevenue:0, energy:0, commercialEnergy:0, courtesyCharges:0, courtesyEnergy:0, courtesyEnergyCost:0, courtesyCostExcluded:0, energyCost:0, extraCosts:0, management:0, platform:0, totalOperatingCost:0, operationNet:0, planningKWh:0, plannedTotalCost:0, matrizCost:0, ubyNet:0, saRetention:0, investorDistribution:0, ubyRetained:0 });
  const partnerRoyalty = partnerRows.reduce((sum, row) => sum + Number(row.finance?.ubyRoyalty || 0), 0);
  const totalCostPerKWh = total.commercialEnergy > 0 ? total.totalOperatingCost / total.commercialEnergy : null;
  const plannedCostPerKWh = total.planningKWh > 0 ? total.plannedTotalCost / total.planningKWh : null;
  const margin = total.totalRevenue > 0 ? total.operationNet / total.totalRevenue * 100 : 0;
  if (periodLabel) periodLabel.textContent = viewLabel || (isMonthView ? monthLabel(currentMonth) : 'Acumulado');
  // Série mensal só é calculada na página financeira dedicada (evita custo
  // extra de recalcular por mês na aba operacional, que não usa isso).
  const monthlySeries = window.UBY_FINANCE_ONLY ? buildUbyMonthlySeries(ubyOperationRows, sourceMonths) : null;
  if (window.UBY_FINANCE_ONLY) {
    const revenueTrend = ubyKpiTrendBadge(ubyKpiTrendFromSeries(monthlySeries, m => m.revenue));
    const costTrend = ubyKpiTrendBadge(ubyKpiTrendFromSeries(monthlySeries, m => m.totalOperatingCost, { invert: true }));
    const perKWhTrend = ubyKpiTrendBadge(ubyKpiTrendFromSeries(monthlySeries, m => m.commercialEnergy > 0 ? m.totalOperatingCost / m.commercialEnergy : null, { invert: true }));
    const netTrend = ubyKpiTrendBadge(ubyKpiTrendFromSeries(monthlySeries, m => m.operationNet));
    summary.innerHTML = `
      <div class="card kpi-feature revenue-card"><div class="label">Faturamento recargas</div><div class="value">${fmtBRL(total.revenue)}</div>${revenueTrend}</div>
      <div class="card kpi-feature"><div class="label">Custos operacionais${total.matrizCost > 0 ? ' (inclui matriz)' : ''}</div><div class="value">${fmtBRL(total.totalOperatingCost)}</div>${costTrend}</div>
      ${total.matrizCost > 0 ? `<div class="card kpi-feature"><div class="label">Custos da matriz (rateados)</div><div class="value">${fmtBRL(total.matrizCost)}</div></div>` : ''}
      <div class="card kpi-feature"><div class="label">Custo efetivo por kWh</div><div class="value">${fmtPerKWh(totalCostPerKWh)}</div>${perKWhTrend}</div>
      ${total.courtesyCharges ? `<div class="card kpi-feature"><div class="label">Cortesia de parceiros</div><div class="value">${fmtKWh(total.courtesyEnergy)}</div><div class="sub">${fmtBRL(total.courtesyCostExcluded)} fora do resultado UBY</div></div>` : ''}
      ${partnerRows.length ? `<div class="card kpi-feature"><div class="label">Royalties de parceiros</div><div class="value" style="color:#42DF9A">${fmtBRL(partnerRoyalty)}</div><div class="sub">${partnerRows.length} unidade(s) parceira(s) fora da matriz</div></div>` : ''}
      <div class="card kpi-feature ${total.operationNet >= 0 ? 'occ-green' : 'occ-red'}"><div class="label">Resultado dos ativos UBY ${fmtPct(margin)}</div><div class="value">${fmtBRL(total.operationNet)}</div>${netTrend}</div>
    `;
  } else {
    summary.innerHTML = `
      <div class="accountability-metric"><b>${fmtBRL(total.revenue)}</b><span>Faturamento recargas</span></div>
      <div class="accountability-metric"><b>${fmtBRL(total.totalOperatingCost)}</b><span>Custos operacionais${total.matrizCost > 0 ? ' (inclui matriz)' : ''}</span></div>
      ${total.matrizCost > 0 ? `<div class="accountability-metric"><b>${fmtBRL(total.matrizCost)}</b><span>Custos da matriz (rateados)</span></div>` : ''}
      <div class="accountability-metric"><b>${fmtPerKWh(totalCostPerKWh)}</b><span>Custo efetivo por kWh</span></div>
      ${total.courtesyCharges ? `<div class="accountability-metric"><b>${fmtKWh(total.courtesyEnergy)}</b><span>Cortesia de parceiros · ${fmtBRL(total.courtesyCostExcluded)} fora do resultado UBY</span></div>` : ''}
      ${partnerRows.length ? `<div class="accountability-metric"><b style="color:#42DF9A">${fmtBRL(partnerRoyalty)}</b><span>Royalties de parceiros · fora da matriz UBY</span></div>` : ''}
      <div class="accountability-metric"><b>${fmtBRL(total.operationNet)}</b><span>Resultado dos ativos UBY ${fmtPct(margin)}</span></div>
    `;
  }
  renderUbyDistribution(total);
  if (window.UBY_FINANCE_ONLY) {
    try {
      const opsCost = Math.max(total.extraCosts - total.matrizCost, 0);
      renderCouponDonutChart('costCompositionPie',
        ['Energia', 'Gestão / plataforma', 'Operação por carregador', 'Custos da matriz (rateados)'],
        [total.energyCost, total.management + total.platform, opsCost, total.matrizCost],
        ' R$');
    } catch (e) { console.error('[fin-cost-pie]', e); }
  }
  rowsEl.innerHTML = rows.length ? rows.map(row => {
    const finance = row.finance;
    const isRoyaltyPartner = normalizeOperationModel(finance.operationModel) === 'third_party_management';
    const resultClass = finance.operationNet >= 0 ? 'result-positive' : 'result-negative';
    const stationName = row.stationName || row.station || '';
    // Na página financeira dedicada (sem a parte operacional) não existem as
    // abas/elementos que openWorkReport() manipula direto no DOM — em vez de
    // travar silenciosamente, navega para a página operacional já com o
    // relatório financeiro dessa estação aberto.
    const openAction = window.UBY_FINANCE_ONLY
      ? `location.href='recargas.html?obra=${encodeURIComponent(row.workId)}&openReport=financeiro&station=${encodeURIComponent(stationName)}'`
      : `openWorkReport('${escapeAttr(row.workId)}','financeiro','${escapeAttr(stationName)}')`;
    return `<div class="uby-finance-row${isRoyaltyPartner ? ' uby-finance-row--partner' : ''}">
      <div>${isRoyaltyPartner ? '<span class="uby-partner-pill">◆ Parceiro UBY · somente royalties</span>' : ''}<strong>${escapeHtml(stationName || row.workName)}</strong><span>${escapeHtml(row.workName)} | ${row.financeMonths.length} periodo(s) calculado(s)${finance.courtesyCharges ? ` | ${fmtKWh(finance.courtesyEnergy)} de cortesia fora do resultado UBY` : ''}</span></div>
      <div class="uby-finance-cell"><b>${fmtBRL(finance.revenue)}</b><em>${isRoyaltyPartner ? 'faturamento do parceiro' : 'faturamento'}</em></div>
      <div class="uby-finance-cell"><b>${fmtBRL(finance.management)}</b><em>${isRoyaltyPartner ? 'gestão P3' : 'custos totais'}</em></div>
      <div class="uby-finance-cell${isRoyaltyPartner ? ' uby-finance-cell--royalty' : ''}"><b>${isRoyaltyPartner ? fmtBRL(finance.ubyRoyalty) : fmtPerKWh(finance.totalCostPerKWh)}</b><em>${isRoyaltyPartner ? 'receita UBY · royalty' : 'custo atual'}</em></div>
      <div class="uby-finance-cell ${resultClass}"><b>${isRoyaltyPartner ? 'Fora da matriz' : fmtBRL(finance.operationNet)}</b><em>${isRoyaltyPartner ? 'sem custo ou resultado UBY' : `resultado | ${fmtPct(finance.operationMargin)}`}</em></div>
      <div class="unit-actions"><button class="btn-open" type="button" onclick="${openAction}">Abrir financeiro</button></div>
    </div>`;
  }).join('') : '<div class="note">Nenhum carregador UBY marcado para o periodo.</div>';
  if (rows.length && !Number.isFinite(totalCostPerKWh) && Number.isFinite(plannedCostPerKWh)) {
    rowsEl.insertAdjacentHTML('beforeend', `<div class="finance-empty-guidance">Ainda nao houve venda de energia neste periodo. O custo inicial planejado da operacao esta em <strong>${fmtPerKWh(plannedCostPerKWh)}</strong>.</div>`);
  }
  try { renderCostTree(rows, total.matrizCost || 0); } catch (e) { console.error('[fin-tree]', e); }
  if (monthlySeries) { try { renderUbyFinanceMonthlyChart(monthlySeries); } catch (e) { console.error('[fin-monthly-chart]', e); } }
}

// Dispara (uma vez) o carregamento do histórico completo em segundo plano e
// re-renderiza a aba quando ele chega. O painel abre já com o mês atual (rápido)
// e o gráfico de evolução mensal preenche os meses anteriores em seguida.
function ensureOverviewHistoryThenRerender(tabId, rerender) {
  if (overviewSessionsFullyHydrated || overviewSessionsHydrationPromise) return;
  if (!window.UBY_SUPABASE?.loadRechargeSessions) return;
  ensureAllOverviewSessionsLoaded()
    .then(() => {
      if (document.getElementById(tabId)?.style.display !== 'none') rerender();
    })
    .catch(() => {});
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

async function renderUbyOperation() {
  const __t0 = performance.now();
  const renderSequence = ++overviewRenderSequence.uby;
  ensureOverviewHistoryThenRerender('tabUby', renderUbyOperation);
  const sourceUnitData = getGeneralUnitData();
  const sourceRows = getUbyChargerRows(sourceUnitData);
  const sourceIncluded = sourceRows.filter(row => row.included);
  const sourceUbyCharges = sourceIncluded.flatMap(row => row.charges);
  const sourceMonths = [...new Set(sourceUbyCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  syncOverviewMonthOptions(overviewMonthKeys());
  const selectedPeriod = selectedOverviewPeriod(sourceMonths);
  const currentGeneralMonth = selectedPeriod.monthKey;
  let isMonthView = selectedPeriod.isMonthView;
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
  const revenue = included.reduce((sum, row) => sum + row.revenue, 0);
  const energy = included.reduce((sum, row) => sum + row.energy, 0);
  const clients = new Set(allUbyCharges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const acdc = generalAcDcStats(allUbyCharges);
  const dcChargesOnly = allUbyCharges.filter(charge => chargerKind(charge) === 'dc');
  const acChargesOnly = allUbyCharges.filter(charge => chargerKind(charge) === 'ac');
  const dcCleanStats = cleanOperationStats(dcChargesOnly);
  const acCleanStats = cleanOperationStats(acChargesOnly);
  const dcCount = included.filter(row => row.kind === 'dc').length;
  const acCount = included.filter(row => row.kind === 'ac').length;
  const totalCharges = allUbyCharges.length;
  const dailyAveragesForRows = rows => rows.map(row => {
    const dates = row.charges.map(charge => charge.startDate).filter(date => date && !Number.isNaN(date.getTime()));
    const firstDay = dates.length ? dateOnly(new Date(Math.min(...dates))) : null;
    const lastDay = dates.length ? dateOnly(new Date(Math.max(...dates))) : null;
    const daysWithData = firstDay && lastDay ? Math.round((lastDay - firstDay) / 86_400_000) + 1 : 0;
    return { stationName: row.stationName || row.workName || 'Carregador', dailyAverage: daysWithData ? row.count / daysWithData : 0 };
  });
  const dailyNetworkAverages = dailyAveragesForRows(included);
  const dailyDcAverages = dailyAveragesForRows(included.filter(row => row.kind === 'dc'));
  const averageNetworkCharges = dailyNetworkAverages.length
    ? dailyNetworkAverages.reduce((sum, row) => sum + row.dailyAverage, 0) / dailyNetworkAverages.length
    : 0;
  const averageDcCharges = dailyDcAverages.length
    ? dailyDcAverages.reduce((sum, row) => sum + row.dailyAverage, 0) / dailyDcAverages.length
    : 0;
  const dailyDcBreakdown = dailyDcAverages.slice(0, 3)
    .map(row => `${row.stationName}: ${row.dailyAverage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia`)
    .join(' · ');
  const dcValidDurations = dcCleanStats.executed
    .map(charge => durToHours(charge.duration))
    .filter(hours => hours > 0);
  const dcAvgDuration = dcValidDurations.length
    ? dcValidDurations.reduce((sum, hours) => sum + hours, 0) / dcValidDurations.length
    : 0;
  const bestDcUnit = included.filter(row => row.kind === 'dc').sort((a, b) => b.revenue - a.revenue)[0];
  const projectionMonth = isMonthView && currentGeneralMonth ? currentGeneralMonth : (sourceMonths.at(-1) || '');
  const unitForecasts = sourceIncluded
    .map(row => ubyNetworkProjectionForRow(row, projectionMonth))
    .filter(forecast => forecast.coveredDays > 0);
  const networkProjectedRevenue = unitForecasts.reduce((sum, forecast) => sum + forecast.projectedRevenue, 0);
  const networkProjectedEnergy = unitForecasts.reduce((sum, forecast) => sum + forecast.projectedEnergy, 0);
  const calendarPower = included.reduce((sum, row) => sum + Number(workPowerById(row.workId) || 0), 0) || getPower();
  const trendRevenue = kpiDayTrend(allUbyCharges, 'revenue', sourceUbyCharges);
  const trendCharges = kpiDayTrend(allUbyCharges, 'count', sourceUbyCharges);
  const trendEnergy = kpiDayTrend(allUbyCharges, 'energy', sourceUbyCharges);
  const dates = allUbyCharges.map(charge => charge.startDate).filter(Boolean);
  const firstDate = dates.length ? new Date(Math.min(...dates)) : null;
  const lastDate = dates.length ? new Date(Math.max(...dates)) : null;
  const months = [...new Set(allUbyCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  let totalMaxKWh = 0;
  const windows = [];
  included.forEach(row => {
    const operationStart = operationStartForCharges(row.charges, row);
    months.forEach(mk => {
      const monthCharges = row.charges.filter(charge => chargeMonthKey(charge) === mk);
      if (!monthCharges.length) return;
      const window = periodWindow(monthCharges, mk, 'mtd', operationStart);
      windows.push(window);
      totalMaxKWh += occByInterval(monthCharges, workPowerById(row.workId), window).maxKWh;
    });
  });
  const totalOcc = totalMaxKWh > 0 ? energy / totalMaxKWh * 100 : 0;
  const firstPeriod = windows.length ? new Date(Math.min(...windows.map(window => window.start).filter(Boolean))) : firstDate;
  const lastPeriod = windows.length ? new Date(Math.max(...windows.map(window => window.end).filter(Boolean))) : lastDate;
  const viewLabel = monthFallbackToAccumulated
    ? `Acumulado UBY (sem recargas em ${monthLabel(currentGeneralMonth)})`
    : (isMonthView ? selectedPeriod.label : 'Acumulado UBY');
  const occBand = occupationBand(totalOcc);
  const occClass = occBand.className;
  const occStatus = `${occBand.label}: ${occBand.range}`;

  document.getElementById('generalSourceLabel').textContent = totalCharges
    ? `${viewLabel}: ${included.length} carregador(es) UBY ativo(s)`
    : 'Operacao UBY sem recargas no periodo selecionado';
  document.getElementById('ubyHeroMeta').innerHTML = included.length
    ? `Visao: <strong>${viewLabel}</strong><br>${included.length} carregador(es) UBY em ${new Set(included.map(row => row.workId)).size} unidade(s)<br>Periodo: <strong>${fmtDT(firstPeriod)}</strong> ate <strong>${fmtDT(lastPeriod)}</strong><br>DC entra por padrao; ajustes manuais ficam salvos.`
    : 'Nenhum carregador UBY com recargas no periodo selecionado.';
  document.getElementById('ubyHeroFormula').innerHTML = totalCharges
    ? `<strong>${viewLabel}</strong><br>${fmtBRL(revenue)} de receita UBY<br>${fmtKWh(energy)} entregues<br><strong style="color:#57B7FF">${totalCharges} recarga(s) em ${included.length} carregador(es)</strong><br>AC: ${acdc.acCharges} recargas / DC: ${acdc.dcCharges}<br><span style="color:#A8C8BC">foco principal do negocio</span>`
    : 'Marque carregadores UBY ou suba planilhas das unidades UBY para iniciar o painel.';

  document.getElementById('kpiUby').innerHTML = `
    <div class="dc-kpi-heading"><span>Indicadores DC · rede rápida</span><small>médias calculadas somente nas recargas DC</small></div>
    <div class="card dc-metric-card"><div class="label">R$ médio por recarga DC</div><div class="value">${fmtBRL(dcCleanStats.avgTicket)}</div><div class="sub">${dcCleanStats.executed.length} recarga(s) válida(s) DC</div></div>
    <div class="card dc-metric-card"><div class="label">kWh médio por recarga DC</div><div class="value">${dcCleanStats.avgKwh.toFixed(1).replace('.', ',')} kWh</div><div class="sub">energia das recargas válidas DC</div></div>
    <div class="card dc-metric-card"><div class="label">Tempo médio de recarga DC</div><div class="value">${formatRechargeDuration(dcAvgDuration)}</div><div class="sub">${dcValidDurations.length} sessão(ões) DC com duração</div></div>
    <div class="card dc-metric-card"><div class="label">Média de recargas DC por dia</div><div class="value">${averageDcCharges.toLocaleString('pt-BR',{maximumFractionDigits:1})}</div><div class="sub">média dos ${dcCount} carregador(es) DC${dailyDcBreakdown ? `<br>${dailyDcBreakdown}` : ''}</div></div>
    <div class="card dc-metric-card"><div class="label">Falhas DC no período</div><div class="value">${dcCleanStats.failed.length}</div><div class="sub">${dcChargesOnly.length ? fmtPct(dcCleanStats.failed.length / dcChargesOnly.length * 100) : '0,00%'} das tentativas DC</div></div>
    <div class="dc-kpi-heading"><span>Visão consolidada da rede</span><small>totais AC + DC para gestão comercial</small></div>
    <div class="card"><div class="label">Projeção de faturamento da rede</div><div class="value">${fmtBRL(networkProjectedRevenue)}</div><div class="sub">${projectionMonth ? `${monthLabel(projectionMonth)} | ${unitForecasts.length} unidade(s), soma das projeções individuais` : 'sem base para projetar'}${unitForecasts.length ? `<br>${fmtKWh(networkProjectedEnergy)} projetados` : ''}</div></div>
    <div class="card"><div class="label">Total DC</div><div class="value">${acdc.dcCharges}</div><div class="sub">${fmtKWh(acdc.dcEnergy)} · ${fmtBRL(acdc.dcRevenue)}</div></div>
    <div class="card"><div class="label">Carregadores DC</div><div class="value">${dcCount}</div><div class="sub">dos ${included.length} carregadores UBY incluídos</div></div>
    <div class="card"><div class="label">Média da rede por dia</div><div class="value">${averageNetworkCharges.toLocaleString('pt-BR',{maximumFractionDigits:1})}</div><div class="sub">todas as unidades AC + DC</div></div>
    <div class="card"><div class="label">Melhor unidade DC</div><div class="value" style="font-size:18px;white-space:normal">${bestDcUnit?.stationName || '-'}</div><div class="sub">${bestDcUnit ? fmtBRL(bestDcUnit.revenue) : 'sem dados DC'}</div></div>
    <div class="card ac-context-card"><div class="ac-title"><strong>AC · acompanhamento separado</strong><span>Não entra nas médias de performance DC.</span></div><div class="ac-mini"><b>${acdc.acCharges}</b><span>recargas AC</span></div><div class="ac-mini"><b>${fmtKWh(acdc.acEnergy)}</b><span>energia AC</span></div><div class="ac-mini"><b>${fmtBRL(acCleanStats.avgTicket)}</b><span>ticket médio AC</span></div></div>
  `;

  renderVisualSummary('ubyVisualSummary', allUbyCharges, { occ: { pct: totalOcc, energy, power: getPower(), hours: 0, maxKWh: 0 }, historyCharges: sourceUbyCharges });
  renderUbyDecisionCockpit([], allUbyCharges, included);
  scheduleOverviewInsights('uby', () => renderUsageInsights(allUbyCharges, 'usageUby', sourceUbyCharges, {
    calendar: { mode: isMonthView ? 'month' : 'dayOfMonthAccumulated', power: calendarPower },
    weekdayPower: calendarPower,
    weekdayBounds: { start: firstPeriod, end: lastPeriod }
  }));

  const chartRows = [...included].sort((a, b) => b.revenue - a.revenue);
  const accessRows = [...visibleRows.filter(row => row.included)]
    .sort((a, b) => b.revenue - a.revenue || String(a.stationName || a.workName).localeCompare(String(b.stationName || b.workName), 'pt-BR'));
  await yieldToBrowser();
  if (renderSequence !== overviewRenderSequence.uby || document.getElementById('tabUby').style.display === 'none') return;
  const chartLabels = chartRows.map(row => {
    const label = row.stationName || row.workName || '-';
    return label.length > 24 ? label.slice(0, 24) + '...' : label;
  });
  renderBarChart('chartUbyRevenueUnit', chartLabels, chartRows.map(row => row.revenue), '#57B7FF', ' R$');
  renderBarChart('chartUbyEnergyUnit', chartLabels, chartRows.map(row => row.energy), '#2DBBD3', ' kWh');

  const accessMonthKeys = isMonthView && currentGeneralMonth ? [currentGeneralMonth] : sourceMonths;
  document.getElementById('ubyUnitRank').innerHTML = accessRows.length ? accessRows.slice(0, 12).map(unit => `
    <div class="unit-card">
      <div><strong>${escapeHtml(unit.stationName || unit.workName)}</strong><span>Obra: ${escapeHtml(unit.workName)} - ${unit.clients} cliente(s)</span></div>
      <div><div class="unit-value">${fmtBRL(unit.revenue)}</div><div class="unit-sub">${unit.count} recargas</div></div>
      <div><div class="unit-value">${fmtKWh(unit.energy)}</div><div class="unit-sub">${unit.kind.toUpperCase()} - ${unit.connType || 'sem conector'}</div></div>
      ${unitOccupancyMarkup(unit, accessMonthKeys)}
      <div class="unit-actions"><button class="btn-open" onclick="openWorkReport('${escapeAttr(unit.workId)}','mensal','${escapeAttr(unit.stationName)}')">Abrir estacao</button></div>
    </div>
  `).join('') : '<div class="note">Nenhuma unidade marcada como UBY.</div>';
  const accountingRows = sourceIncluded
    .map(row => summarizeUbyChargerRow(row, row.charges))
    .filter(row => row.count > 0);
  pendingUbyAccountingRows = accountingRows;
  if (ubyReportsRequested) {
    renderUbyPartnerReports(accountingRows);
  } else {
    const reports = document.getElementById('ubyPartnerReports');
    const investor = document.getElementById('ubyInvestorPreview');
    if (reports) reports.innerHTML = '<div class="note">Abra a aba Relatorios para carregar a prestacao de contas e o historico.</div>';
    if (investor) investor.textContent = 'Os relatorios financeiros sao carregados somente quando solicitados para manter o painel rapido.';
  }
  await yieldToBrowser();
  if (renderSequence !== overviewRenderSequence.uby || document.getElementById('tabUby').style.display === 'none') return;

  const monthData = sourceMonths.map(mk => {
    const monthCharges = sourceUbyCharges.filter(charge => chargeMonthKey(charge) === mk);
    return {
      label: monthLabel(mk),
      revenue: monthCharges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0),
      energy: monthCharges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0)
    };
  });
  renderMonthlyRevenueEnergyChart('chartUbyMonth', monthData, 'Receita UBY', 'Energia UBY');

  document.getElementById('ubyChargerTable').innerHTML = visibleRows.length ? visibleRows.map(row => `
    <tr>
      <td><input type="checkbox" ${row.included ? 'checked' : ''} onchange="toggleUbyOperation('${escapeAttr(row.workId)}','${escapeAttr(row.key)}',this.checked)"></td>
      <td>${escapeHtml(row.workName)}</td>
      <td>${escapeHtml(row.station)}<br><span style="color:var(--p3-muted)">${escapeHtml(row.connType || 'Sem conector')}</span></td>
      <td>${row.kind.toUpperCase()}</td>
      <td>${row.count}</td>
      <td>${row.energy.toFixed(2).replace('.', ',')}</td>
      <td>${fmtBRL(row.revenue)}</td>
      <td>${row.ruleSource}</td>
      <td><button class="btn-open" onclick="openWorkReport('${escapeAttr(row.workId)}','mensal','${escapeAttr(row.station)}')">Abrir</button></td>
    </tr>
  `).join('') : '<tr><td colspan="9" style="color:var(--p3-muted);text-align:center;padding:20px">Sem carregadores com base salva.</td></tr>';
  markOverviewRendered('uby');
  console.log(`[UBY-PERF] renderUbyOperation: ${(performance.now() - __t0).toFixed(0)} ms (${totalCharges} recargas, ${included.length} carregadores)`);
}

function showGeneralWhenCurrentWorkIsEmpty() {
  if (window.UBY_FINANCE_ONLY) return;
  if (allCharges.length) return;
  document.getElementById('tabsBar').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  showTab('uby');
}

async function renderVisibleOverviewViews() {
  if (window.UBY_FINANCE_ONLY) return renderFinanceOnly();
  const visible = id => document.getElementById(id)?.style.display !== 'none';
  if (visible('tabUby')) {
    await renderUbyOperation();
    return;
  }
  if (visible('tabGeral')) {
    await renderGeral();
    return;
  }
  if (visible('tabClube')) {
    renderClub();
    return;
  }
  if (visible('tabFinanceiroGeral')) {
    renderGeneralFinance(getGeneralUnitData());
  }
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

async function ensureAllOverviewSessionsLoaded() {
  if (overviewSessionsFullyHydrated || !window.UBY_SUPABASE?.loadRechargeSessions) return;
  if (overviewSessionsHydrationPromise) return overviewSessionsHydrationPromise;
  overviewSessionsHydrationPromise = (async () => {
    setStorageState('Carregando historico completo sob demanda...');
    const firstPage = await window.UBY_SUPABASE.loadRechargeSessions({ limit: OVERVIEW_PAGE_SIZE });
    const rows = [...(firstPage.rows || [])];
    for (let offset = rows.length; offset < firstPage.count; offset += OVERVIEW_PAGE_SIZE) {
      const page = await window.UBY_SUPABASE.loadRechargeSessions({ limit: OVERVIEW_PAGE_SIZE, offset });
      rows.push(...(page.rows || []));
      await yieldToBrowser();
    }
    const summaries = window.UBY_SUPABASE.loadAllRechargeSummaries
      ? await window.UBY_SUPABASE.loadAllRechargeSummaries()
      : Object.values(allRechargeRecords);
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
    mergeCloudRechargeRecords(records);
    records.forEach(record => fullRechargeWorkIds.add(String(record.workId || '')));
    overviewSessionsFullyHydrated = true;
    markRechargeRecordsDirty();
    window.UBY_RECHARGE_RUNTIME?.cacheSet?.('general-records:all', records).catch(() => {});
    setStorageState(`Historico completo carregado: ${rows.length} recarga(s).`);
  })().finally(() => {
    overviewSessionsHydrationPromise = null;
  });
  return overviewSessionsHydrationPromise;
}

async function handleGeneralViewModeChange() {
  const view = document.getElementById('generalViewMode')?.value || 'month';
  if (document.getElementById('generalViewMode')?.value === 'accumulated') {
    await ensureAllOverviewSessionsLoaded();
  } else if (view.startsWith('month:')) {
    await ensureAllOverviewSessionsLoaded();
  }
  syncOverviewMonthOptions();
  await renderVisibleOverviewViews();
}

async function renderGeral() {
  ensureOverviewHistoryThenRerender('tabGeral', renderGeral);
  const sourceUnitData = getGeneralUnitData();
  const sourceCharges = getAllGeneralCharges(sourceUnitData);
  const sourceMonths = [...new Set(sourceCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  syncOverviewMonthOptions(sourceMonths);
  const selectedPeriod = selectedOverviewPeriod(sourceMonths);
  const currentGeneralMonth = selectedPeriod.monthKey;
  let isGeneralMonthView = selectedPeriod.isMonthView;
  let unitData = isGeneralMonthView ? filterGeneralUnitDataByMonth(sourceUnitData, currentGeneralMonth) : sourceUnitData;
  const generalMonthFallbackToAccumulated = isGeneralMonthView && !getAllGeneralCharges(unitData).length && sourceCharges.length;
  if (generalMonthFallbackToAccumulated) {
    isGeneralMonthView = false;
    unitData = sourceUnitData;
  }
  const stationRows = getGeneralStationRows(unitData);
  const rankingUnitData = currentGeneralMonth ? filterGeneralUnitDataByMonth(sourceUnitData, currentGeneralMonth, true) : sourceUnitData;
  const rankingStationRows = getGeneralStationRows(rankingUnitData);
  const accumulatedStationRows = getGeneralStationRows(sourceUnitData);
  const charges = getAllGeneralCharges(unitData);
  const acdc = generalAcDcStats(charges);
  const units = unitData.length;
  const totalCharges = charges.length;
  const energy = charges.reduce((sum, charge) => sum + charge.energyKWh, 0);
  const revenue = charges.reduce((sum, charge) => sum + charge.revenue, 0);
  const clients = new Set(charges.map(charge => charge.userEmail || charge.userName).filter(Boolean)).size;
  const months = [...new Set(charges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const dates = charges.map(charge => charge.startDate).filter(Boolean);
  const firstDate = dates.length ? new Date(Math.min(...dates)) : null;
  const lastDate = dates.length ? new Date(Math.max(...dates)) : null;
  const avgTicket = totalCharges ? revenue / totalCharges : 0;
  const cleanStats = cleanOperationStats(charges);
  const calendarPower = stationRows
    .filter(row => row.count > 0)
    .reduce((sum, row) => sum + Number(workPowerById(row.workId) || 0), 0) || getPower();
  const trendRevenue = kpiDayTrend(charges, 'revenue', sourceCharges);
  const trendCharges = kpiDayTrend(charges, 'count', sourceCharges);
  const trendEnergy = kpiDayTrend(charges, 'energy', sourceCharges);
  let totalMaxKWh = 0;
  const generalWindows = [];
  stationRows.filter(row => row.count > 0).forEach(row => {
    months.forEach(mk => {
      const monthCharges = row.charges.filter(charge => chargeMonthKey(charge) === mk);
      if (!monthCharges.length) return;
      const window = periodWindow(monthCharges, mk, 'mtd');
      generalWindows.push(window);
      const config = stationAvailabilityFor(row.workId, row.stationName, row.workName);
      totalMaxKWh += Number(workPowerById(row.workId) || 0) * stationAvailableHours(config, window.start, window.end);
    });
  });
  const totalOcc = totalMaxKWh > 0 ? energy / totalMaxKWh * 100 : 0;
  const firstPeriod = generalWindows.length ? new Date(Math.min(...generalWindows.map(window => window.start).filter(Boolean))) : firstDate;
  const lastPeriod = generalWindows.length ? new Date(Math.max(...generalWindows.map(window => window.end).filter(Boolean))) : lastDate;
  const viewLabel = generalMonthFallbackToAccumulated
    ? `Acumulado (sem recargas em ${monthLabel(currentGeneralMonth)})`
    : (isGeneralMonthView ? selectedPeriod.label : 'Acumulado');
  const viewDetail = isGeneralMonthView
    ? `ocupação calculada somente sobre ${selectedPeriod.isCurrentMonth ? 'o mês atual' : monthLabel(currentGeneralMonth)}`
    : 'histórico completo das bases salvas';

  document.getElementById('generalHeroMeta').innerHTML = totalCharges
    ? `Visão: <strong>${viewLabel}</strong><br>Unidades com base: <strong>${units}</strong><br>Periodo: <strong>${fmtDT(firstPeriod)}</strong> ate <strong>${fmtDT(lastPeriod)}</strong><br>Meses consolidados: <strong>${isGeneralMonthView ? 1 : months.length}</strong>`
    : 'Nenhuma unidade com base de recargas salva ainda.';
  document.getElementById('generalHeroFormula').innerHTML = totalCharges
    ? `<strong>${viewLabel}</strong><br>${fmtBRL(revenue)} em receita<br>${fmtKWh(energy)} entregues<br><strong style="color:#57B7FF">${totalCharges} recargas em ${units} unidade(s)</strong><br>AC: ${acdc.acCharges} recargas / DC: ${acdc.dcCharges}<br><span style="color:#A8C8BC">${viewDetail}</span>`
    : 'Suba a planilha em cada unidade para o painel geral acumular tudo.';
  document.getElementById('generalSourceLabel').textContent = totalCharges
    ? `${viewLabel}: ${units} estação(ões) com base salva - escolha uma para abrir`
    : 'Sem bases salvas para consolidar';
  const occBand = occupationBand(totalOcc);
  const occClass = occBand.className;
  const occStatus = `${occBand.label}: ${occBand.range}`;
  document.getElementById('kpiGeneral').innerHTML = `
    <div class="card"><div class="label">Ticket medio geral</div><div class="value">${fmtBRL(avgTicket)}</div><div class="sub">receita / recargas</div></div>
    <div class="card"><div class="label">Melhor unidade</div><div class="value" style="font-size:18px;white-space:normal">${stationRows[0]?.stationName || '-'}</div><div class="sub">${stationRows[0] ? fmtBRL(stationRows[0].revenue) : 'sem dados'}</div></div>
    <div class="card"><div class="label">Total AC</div><div class="value">${acdc.acCharges}</div><div class="sub">${fmtKWh(acdc.acEnergy)} - ${fmtBRL(acdc.acRevenue)}</div></div>
    <div class="card"><div class="label">Total DC</div><div class="value">${acdc.dcCharges}</div><div class="sub">${fmtKWh(acdc.dcEnergy)} - ${fmtBRL(acdc.dcRevenue)}</div></div>
    <div class="card"><div class="label">Carregadores AC</div><div class="value">${acdc.acChargers}</div><div class="sub">conectores/estacoes unicas</div></div>
    <div class="card"><div class="label">Carregadores DC</div><div class="value">${acdc.dcChargers}</div><div class="sub">conectores/estacoes unicas</div></div>
  `;
  renderVisualSummary('generalVisualSummary', charges, { occ: { pct: totalOcc, energy, power: getPower(), hours: 0, maxKWh: 0 }, historyCharges: sourceCharges });
  renderGeneralStationOccupancy(accumulatedStationRows);
  renderGeneralDecisionCockpit(unitData, charges, stationRows);
  scheduleOverviewInsights('geral', () => renderUsageInsights(charges, 'usageGeneral', sourceCharges, { calendar: { power: calendarPower }, weekdayPower: calendarPower, weekdayBounds: { start: firstPeriod, end: lastPeriod } }));

  const rankingMonthKeys = currentGeneralMonth ? [currentGeneralMonth] : months;
  document.getElementById('generalUnitRank').innerHTML = rankingStationRows.length ? rankingStationRows.slice(0, 12).map(unit => `
    <div class="unit-card">
      <div><strong>${unit.stationName}</strong><span>Obra: ${unit.workName} - ${monthLabel(currentGeneralMonth) || 'mês atual'} - ${unit.clients} cliente(s)</span></div>
      <div><div class="unit-value">${fmtBRL(unit.revenue)}</div><div class="unit-sub">${unit.count} recargas</div></div>
      <div><div class="unit-value">${fmtKWh(unit.energy)}</div><div class="unit-sub">AC ${unit.acdc.acCharges} / DC ${unit.acdc.dcCharges}</div></div>
      ${unitOccupancyMarkup(unit, rankingMonthKeys)}
      <div class="unit-actions"><button class="btn-open" onclick="openWorkReport('${escapeAttr(unit.workId)}','mensal','${escapeAttr(unit.stationName)}')">Abrir estação</button></div>
    </div>
  `).join('') : '<div class="note">Nenhuma obra cadastrada para abrir.</div>';

  document.getElementById('generalUnitTable').innerHTML = accumulatedStationRows.length ? accumulatedStationRows.map(unit => `
    <tr>
      <td>${unit.stationName}</td><td>${unit.workName}</td><td>${unit.files.length}</td><td>${unit.count}</td><td>${unit.clients}</td>
      <td>${unit.energy.toFixed(2).replace('.', ',')}</td><td>${fmtBRL(unit.revenue)}</td><td>${unit.acdc.acCharges}</td><td>${unit.acdc.dcCharges}</td><td>${unit.acdc.acChargers}</td><td>${unit.acdc.dcChargers}</td><td>${fmtBRL(unit.avgTicket)}</td><td>${fmtDT(unit.lastDate)}</td><td><button class="btn-open" onclick="openWorkReport('${escapeAttr(unit.workId)}','mensal','${escapeAttr(unit.stationName)}')">Abrir</button></td>
    </tr>
  `).join('') : '<tr><td colspan="14" style="color:var(--p3-muted);text-align:center;padding:20px">Sem obras para abrir</td></tr>';

  function simpleBar(id, labels, values, label, color) {
    destroyChart(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label, data: values.map(value => +value.toFixed(2)), backgroundColor: color, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#8FA39A' }, grid: { color: '#24364E' } },
          x: { ticks: { color: '#8FA39A', font: { size: 11 } }, grid: { color: '#24364E' } }
        }
      }
    });
  }

  const rankedUnits = rankingStationRows.filter(unit => unit.count > 0 || unit.revenue > 0);
  const unitLabels = rankedUnits.map(unit => {
    const label = unit.stationName || unit.workName || '-';
    return label.length > 24 ? label.slice(0, 24) + '...' : label;
  });
  simpleBar('chartGeneralRevenueUnit', unitLabels, rankedUnits.map(unit => unit.revenue), 'Receita', '#57B7FF');
  simpleBar('chartGeneralEnergyUnit', unitLabels, rankedUnits.map(unit => unit.energy), 'kWh', '#246BFE');

  const monthData = months.map(mk => {
    const monthCharges = charges.filter(charge => chargeMonthKey(charge) === mk);
    return {
      label: monthLabel(mk),
      revenue: monthCharges.reduce((sum, charge) => sum + charge.revenue, 0),
      energy: monthCharges.reduce((sum, charge) => sum + charge.energyKWh, 0)
    };
  });
  renderMonthlyRevenueEnergyChart('chartGeneralMonth', monthData, 'Receita geral', 'Energia geral');
  markOverviewRendered('geral');
}

// ── Render All ────────────────────────────────────────────
async function renderAll() {
  const visibleTab =
    document.getElementById('tabFinanceiroGeral').style.display === 'block' ? 'financeiroGeral' :
    document.getElementById('tabClube').style.display === 'block' ? 'clube' :
    document.getElementById('tabUby').style.display === 'block' ? 'uby' :
    document.getElementById('tabMensal').style.display === 'block' ? 'mensal' :
    document.getElementById('tabAcumulado').style.display === 'block' ? 'acumulado' :
    document.getElementById('tabFinanceiro').style.display === 'block' ? 'financeiro' :
    document.getElementById('tabDetalhes').style.display === 'block' ? 'detalhes' :
    'uby';

  // Sincroniza inputs de potência
  getPower();

  // Atualiza selector de mês
  const months = getMonths();
  const sel    = document.getElementById('monthSelector');
  const cur    = sel.value;
  sel.innerHTML = months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  if (months.includes(cur)) sel.value = cur;
  else sel.value = months[months.length - 1] || '';

  document.querySelectorAll('.tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${visibleTab}'`)));
  showTab(visibleTab);
  if (visibleTab === 'mensal') await renderMensal();
  else if (visibleTab === 'acumulado') renderAcumulado();
  else if (visibleTab === 'financeiro') handleFinanceMonthChange();
  else if (visibleTab === 'detalhes') renderDetalhes();
  else if (visibleTab === 'geral') await renderGeral();
  else if (visibleTab === 'uby') await renderUbyOperation();
  else if (visibleTab === 'clube') renderClub();
  else if (visibleTab === 'financeiroGeral') renderGeneralFinance(getGeneralUnitData());
}

function scheduleLiveOccupationRefresh() {
  clearTimeout(liveOccupationRefreshTimer);
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 2, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  const wait = Math.max(nextHour.getTime() - now.getTime(), 60_000);
  liveOccupationRefreshTimer = setTimeout(async () => {
    try {
      const monthlyVisible = document.getElementById('tabMensal')?.style.display === 'block';
      const mk = document.getElementById('monthSelector')?.value || '';
      if (monthlyVisible && document.visibilityState === 'visible' && isCurrentMonthKey(mk) && selectedPeriodMode() === 'mtd') {
        await renderMensal();
      }
    } finally {
      scheduleLiveOccupationRefresh();
    }
  }, wait);
}

// ══════════════════════════════════════════════════════════
//  TAB MENSAL
// ══════════════════════════════════════════════════════════
async function renderMensal() {
  const renderSequence = ++monthlyRenderSequence;
  clearTimeout(monthlyInsightsTimer);
  const selEl = document.getElementById('monthSelector');
  let mk = selEl?.value;
  // Auto-cura: se o seletor está vazio (corrida de carregamento) mas há meses
  // disponíveis, repopula e usa o mês mais recente em vez de deixar em branco.
  if (!mk) {
    const availableMonths = getMonths();
    mk = availableMonths[availableMonths.length - 1] || '';
    if (mk && selEl) {
      selEl.innerHTML = availableMonths.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
      selEl.value = mk;
    }
  }
  if (!mk) return;
  const monthCharges = chargesForMonth(mk);
  const window = periodWindow(monthCharges, mk);
  const charges = filterChargesByWindow(monthCharges, window);
  if (!charges.length) {
    renderDayComparison('usage', [], allCharges);
    renderVisualSummary('monthlyVisualSummary', [], { historyCharges: allCharges });
    renderCommercialOccupancyPanel([], window);
    renderWeekdayOccupancyReport('weekdayOccupancyMensal', [], getPower(), `Dinamica semanal - ${monthLabel(mk)}`, window);
    setStorageState(`Sem recargas em ${periodModeLabel(window.mode, mk)} para <strong>${currentWorkName}</strong>.`);
    renderMonthClosing(mk);
    return;
  }

  renderHero(charges, mk, window);
  renderDayComparison('usage', charges, allCharges);
  renderVisualSummary('monthlyVisualSummary', charges, { bounds: window, historyCharges: allCharges });
  renderCommercialOccupancyPanel(charges, window);
  renderKPIs(charges, mk, window, allCharges);
  enhanceIndividualKpis();
  renderWeekdayOccupancyReport('weekdayOccupancyMensal', charges, getPower(), `Dinamica semanal - ${monthLabel(mk)}`, window);
  await yieldToBrowser();
  if (renderSequence !== monthlyRenderSequence) return;
  renderPaymentChart(charges);
  renderUserPieChart(charges);
  renderUserBars(charges, 'userBars');
  renderFinancialNote(charges);
  await yieldToBrowser();
  if (renderSequence !== monthlyRenderSequence) return;
  renderMonthlyTable();
  renderBaseTable(charges, mk, window);
  renderMonthClosing(mk);
  renderClientsTable(charges);
  renderIdleAlerts(charges);
  await yieldToBrowser();
  if (renderSequence !== monthlyRenderSequence) return;
  renderReviews(charges);
  renderTechDiagnostic(charges);
  monthlyInsightsTimer = setTimeout(async () => {
    if (renderSequence !== monthlyRenderSequence || document.getElementById('tabMensal').style.display === 'none') return;
    await renderUsageInsights(monthCharges, 'usage', allCharges, { weekdayPower: getPower(), weekdayBounds: window });
  }, 80);
}

function renderHero(charges, mk, window) {
  const stations = [...new Set(charges.map(c => c.station).filter(Boolean))];
  const minDate  = window.start;
  const lastEnd  = window.end;
  const occ      = occByInterval(charges, undefined, window);
  const liveReading = window.mode === 'mtd' && isCurrentMonthKey(mk);

  document.getElementById('heroMeta').innerHTML =
    `Estação: <strong>${stations.join(' · ') || '—'}</strong><br>
     Período: <strong>${fmtDT(minDate)}</strong> até <strong>${fmtDT(lastEnd)}</strong><br>
     Mês: <strong>${monthLabel(mk)}</strong>`;

  if (liveReading) document.getElementById('heroMeta').insertAdjacentHTML('beforeend', '<br><span style="color:#57B7FF">Leitura atualizada ate agora</span>');

  document.getElementById('heroFormula').innerHTML =
    `<strong>Ocupação real</strong><br>
     kWh carregados ÷ (potência × horas do período)<br>
     ${fmtKWh(occ.energy)} ÷ (${occ.power.toFixed(1)} kW × ${occ.hours.toFixed(1)} h)<br>
     <strong style="color:#57B7FF">= ${fmtPct(occ.pct)}</strong>`;
}

function renderKPIs(charges, mk, window, historyCharges = charges) {
  const energy  = charges.reduce((s, c) => s + c.energyKWh, 0);
  const rev     = charges.reduce((s, c) => s + c.revenue, 0);
  const avgTkt  = charges.length ? rev / charges.length : 0;
  const cleanStats = cleanOperationStats(charges);
  const avgKwh  = cleanStats.avgKwh;
  const validDurations = cleanStats.executed.map(charge => durToHours(charge.duration)).filter(hours => hours > 0);
  const avgDuration = validDurations.length
    ? validDurations.reduce((sum, hours) => sum + hours, 0) / validDurations.length
    : 0;
  const revKwh  = energy > 0 ? rev / energy : 0;
  const clients = new Set(charges.map(c => c.userEmail || c.userName)).size;
  const occ     = occByInterval(charges, undefined, window);
  const occFull = occByFullMonth(charges, mk);
  const days    = Math.max(window.hours / 24, 1);
  const dMonth  = daysInMonth(mk.split('-')[0], mk.split('-')[1]);
  const proj    = dMonth / Math.max(days, 1);
  const occBand = occupationBand(occ.pct);
  const occClass = occBand.className;
  const occStatus = `${occBand.label}: ${occBand.range}`;
  const idleValue = charges.reduce((sum, charge) => sum + Number(charge.idleValue || 0), 0);
  const failedCount = charges.filter(charge => isFailedCharge(charge)).length;
  const calendarDays = Math.max(calendarDayCount(window.start, window.end), 1);
  const avgRevenueDay = rev / calendarDays;
  const avgChargesDay = charges.length / calendarDays;
  const comparison = monthlyEquivalentComparison(charges, historyCharges, window, occ, occ.power);
  const previous = comparison.metrics;
  const previousDays = Math.max(calendarDayCount(comparison.previousStart, comparison.previousEnd), 1);
  const previousProjection = previous.revenue * (dMonth / previousDays);
  const metricCard = (label, value, sub, trend = '') => `
    <div class="card metric-card"><div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>${trend}</div>`;

  document.getElementById('kpiGrid').innerHTML = `
    ${metricCard('Ticket médio', fmtBRL(avgTkt), `${avgKwh.toFixed(1).replace('.', ',')} kWh por sessão válida`, metricPeriodTrend(avgTkt, previous.avgTicket, comparison, signedMoney))}
    ${metricCard('R$/kWh médio', fmtBRL(revKwh), 'receita ÷ energia', metricPeriodTrend(revKwh, previous.revenuePerKwh, comparison, signedMoney))}
    ${metricCard('Sessão válida média', `${avgKwh.toFixed(1).replace('.', ',')} kWh`, `${cleanStats.executed.length} recarga(s) executada(s)`, metricPeriodTrend(avgKwh, previous.avgKwh, comparison, value => signedNumber(value, ' kWh')))}
    ${metricCard('Tempo médio de recarga', formatRechargeDuration(avgDuration), `${validDurations.length} sessão(ões) válida(s) com duração`, metricPeriodTrend(avgDuration, previous.avgDuration, comparison, signedDuration))}
    ${metricCard('Projeção mês', fmtBRL(rev * proj), `${fmtKWh(energy * proj)} se mantiver o ritmo`, metricPeriodTrend(rev * proj, previousProjection, comparison, signedMoney))}
    ${metricCard('Ociosidade', fmtBRL(idleValue), 'valor estimado parado após recarga', metricPeriodTrend(idleValue, previous.idleValue, comparison, signedMoney, true))}
    ${metricCard('Falhas no período', failedCount, `${charges.length ? fmtPct(failedCount / charges.length * 100) : '0,00%'} das tentativas`, metricPeriodTrend(failedCount, previous.failedCount, comparison, signedNumber, true))}
    ${metricCard('Média de faturamento por dia', fmtBRL(avgRevenueDay), `${calendarDays} dia(s), incluindo dias sem faturamento`, metricPeriodTrend(avgRevenueDay, previous.revenue / previousDays, comparison, signedMoney))}
    ${metricCard('Média de recargas por dia', avgChargesDay.toFixed(2).replace('.', ','), `${charges.length} recarga(s) em ${calendarDays} dia(s)`, metricPeriodTrend(avgChargesDay, previous.count / previousDays, comparison))}
  `;
}

function enhanceIndividualKpis() {
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;
  const cards = [...grid.children];
  const byLabel = text => cards.find(card => normalizeTextForInsight(card.querySelector('.label')?.textContent || '').includes(text));
  const occCard = byLabel('ocupacao');
  const revenueCard = byLabel('receita total');
  if (!occCard && !revenueCard) return;
  const ticketCard = byLabel('ticket');
  const revKwhCard = byLabel('kwh medio');
  const countCard = byLabel('total recargas');
  const energyCard = byLabel('energia entregue');
  if (occCard) {
    const occValue = parseNumber(occCard.querySelector('.value')?.textContent || 0);
    const occBand = occupationBand(occValue);
    const occClass = occBand.className;
    const occStatus = `${occBand.label}: ${occBand.range}`;
    occCard.className = `card kpi-feature ${occClass}`;
    const sub = occCard.querySelector('.sub');
    if (sub) sub.textContent = `Faixa de ocupacao ${occStatus}`;
  }
  if (revenueCard) revenueCard.className = 'card kpi-feature revenue-card';
  [occCard, ticketCard, revKwhCard, countCard, energyCard, revenueCard]
    .filter(Boolean)
    .forEach(card => grid.appendChild(card));
}

function renderPaymentChart(charges) {
  const byPay  = {};
  charges.forEach(c => { const k = c.paymentType || 'Outro'; byPay[k] = (byPay[k]||0)+1; });
  const entries = Object.entries(byPay).sort((a,b) => b[1]-a[1]);
  const total   = entries.reduce((s,[,v]) => s+v, 0);

  destroyChart('paymentPie');
  const ctx = document.getElementById('paymentPie');
  if (!ctx) return;
  charts['paymentPie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([,v]) => v), backgroundColor: COLORS, borderColor: '#0E1B2D', borderWidth: 3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: '#8FA39A', font:{size:11} } } } }
  });

  document.getElementById('payGrid').innerHTML = entries.map(([k,v]) =>
    `<div class="pay-chip"><strong>${k}</strong><span>${v} recargas · ${(v/total*100).toFixed(2)}%</span></div>`
  ).join('');
}

function renderUserPieChart(charges) {
  const byUser  = {};
  charges.forEach(c => { byUser[c.userName] = (byUser[c.userName]||0)+c.revenue; });
  const entries = Object.entries(byUser).sort((a,b) => b[1]-a[1]);

  destroyChart('userPie');
  const ctx = document.getElementById('userPie');
  if (!ctx) return;
  charts['userPie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([n]) => (n||'Cliente').split(' ')[0]),
      datasets: [{ data: entries.map(([,v]) => +v.toFixed(2)), backgroundColor: COLORS, borderColor: '#0E1B2D', borderWidth: 3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { color: '#8FA39A', font:{size:11} } } } }
  });
}

function renderUserBars(charges, elId) {
  const byUser = {};
  charges.forEach(c => { byUser[c.userName] = (byUser[c.userName]||0)+c.revenue; });
  const sorted = Object.entries(byUser).sort((a,b) => b[1]-a[1]);
  const max    = sorted[0]?.[1] || 1;

  document.getElementById(elId).innerHTML = sorted.map(([name, rev]) =>
    `<div class="user-row">
       <span>${(name||'').split(' ').slice(0,2).join(' ')}</span>
       <div class="track"><i style="width:${(rev/max*100).toFixed(1)}%"></i></div>
       <strong>${fmtBRL(rev)}</strong>
     </div>`
  ).join('');
}

function renderFinancialNote(charges) {
  const byUser = {};
  charges.forEach(c => { byUser[c.userName] = (byUser[c.userName]||0)+c.revenue; });
  const sorted  = Object.entries(byUser).sort((a,b) => b[1]-a[1]);
  const rev     = charges.reduce((s,c) => s+c.revenue, 0);
  const top2    = sorted.slice(0,2).reduce((s,[,v]) => s+v, 0);
  const top2pct = rev > 0 ? (top2/rev*100).toFixed(2) : '0';
  const clients = new Set(charges.map(c => c.userEmail||c.userName)).size;

  document.getElementById('financialNote').innerHTML =
    `O painel recalcula automaticamente quando a nova planilha for anexada.
     ${clients > 1 ? `Neste período, os dois maiores usuários concentram <strong>${top2pct}%</strong> da receita.` : ''}
     Isso torna o acompanhamento de recorrência e retenção tão importante quanto o volume total.`;
}

function renderMonthlyTable() {
  document.getElementById('monthlyTable').innerHTML = getMonths().map(mk => {
    const summary = monthSummaryForMonth(mk);
    return `<tr>
      <td>${mk}${monthClosingBadge(summary)}</td><td>${summary?.count || 0}</td><td>${summary?.clients || 0}</td>
      <td>${(summary?.energy || 0).toFixed(2).replace('.',',')}</td>
      <td>${fmtBRL(summary?.rev || 0)}</td><td>${fmtBRL(summary?.avgTkt || 0)}</td>
      <td>${fmtPct(summary?.occI || 0)}</td><td>${fmtPct(summary?.occF || 0)}</td>
    </tr>`;
  }).join('');
}

function renderBaseTable(charges, mk, window) {
  const stations = [...new Set(charges.map(c => c.station).filter(Boolean))];
  const minDate  = window.start;
  const lastEnd  = window.end;
  const hours    = window.hours;
  const power    = getPower();

  document.getElementById('baseTable').innerHTML = `
    <tr><td>Estação</td><td>${stations.join(', ') || '—'}</td></tr>
    <tr><td>Período exportado</td><td>${fmtDT(minDate)} a ${fmtDT(lastEnd)}</td></tr>
    <tr><td>Dias cobertos</td><td>${(hours/24).toFixed(1)} dias</td></tr>
    <tr><td>Potência nominal usada</td><td>${power.toFixed(1)} kW</td></tr>
    <tr><td>Tipo de leitura</td><td>${getMonths().length > 1 ? 'Múltiplos meses, acumulado' : 'Parcial, atualizável na virada do mês'}</td></tr>
  `;
}

function renderClientsTable(charges) {
  const byUser = {};
  charges.forEach(c => {
    const name = c.userName || c.userEmail || 'Cliente sem nome';
    const key = clientKeyFromCharge(c) || clientIdentityKey(name);
    if (!byUser[key]) byUser[key] = { name, key, n:0, kwh:0, rev:0, last:null };
    byUser[key].n++;
    byUser[key].kwh += c.energyKWh;
    byUser[key].rev += c.revenue;
    if (!byUser[key].last || (c.startDate && c.startDate > byUser[key].last))
      byUser[key].last = c.startDate;
  });
  document.getElementById('clientsTable').innerHTML = Object.entries(byUser)
    .sort((a,b) => b[1].rev - a[1].rev)
    .map(([, d]) => {
      const avgKwh = d.kwh > 0 ? d.rev / d.kwh : 0;
      return (
      `<tr>
         <td>${escapeHtml(d.name)}</td><td>${d.n}</td>
         <td>${d.kwh.toFixed(2).replace('.',',')}</td>
         <td>${fmtBRL(d.rev)}</td>
         <td>${fmtBRL(avgKwh)}</td>
         <td>${fmtDT(d.last)}</td>
       </tr>`);
    }).join('');
}

function renderIdleAlerts(charges) {
  const withIdle = charges
    .map(c => ({ ...c, idleMin: idleToMin(c.idleTime) }))
    .filter(c => c.idleMin >= 1)
    .sort((a,b) => b.idleMin - a.idleMin);

  document.getElementById('idleTable').innerHTML = withIdle.length
    ? withIdle.map(c => {
        const h = Math.floor(c.idleMin/60);
        const m = Math.round(c.idleMin%60);
        return `<tr>
          <td>${c.id}</td>
          <td>${c.userName.split(' ').slice(0,2).join(' ')}</td>
          <td style="white-space:nowrap;font-size:12px">${c.startStr||'—'}</td>
          <td>${c.energyKWh.toFixed(2)}</td>
          <td>${fmtBRL(c.revenue)}</td>
          <td style="color:var(--p3-warn)">${h}h ${m}min</td>
          <td>${fmtBRL(c.idleValue || 0)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" style="color:var(--p3-muted);text-align:center;padding:20px">Nenhum alerta relevante</td></tr>';
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

function dominantBenchmarkKind(charges = []) {
  const counts = { ac: 0, dc: 0 };
  charges.forEach(charge => {
    const kind = chargerKind(charge);
    if (kind === 'ac' || kind === 'dc') counts[kind] += 1;
  });
  if (!counts.ac && !counts.dc) return 'unknown';
  return counts.dc > counts.ac ? 'dc' : 'ac';
}

function benchmarkKindLabel(kind) {
  if (kind === 'ac') return 'AC';
  if (kind === 'dc') return 'DC';
  return 'geral';
}

function normalizeTextForInsight(value) {
  return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function topEntries(map = {}, limit = 1) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function reviewInsightCard(title, evidence, action, type = '') {
  return `<div class="ai-card ${type}">
    <strong>${escapeHtml(title)}</strong>
    <p>${evidence}</p>
    <div class="action">${action}</div>
  </div>`;
}

function buildReviewAiInsights(charges, reviewData = {}) {
  const total = charges.length;
  const revenue = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const avgTicket = total ? revenue / total : 0;
  const avgKwh = total ? energy / total : 0;
  const mk = chargeMonthKey(charges[0] || {});
  const window = mk && mk !== 'unknown' ? periodWindow(charges, mk, 'mtd') : periodBounds(charges);
  const occ = occByInterval(charges, undefined, window);
  const idleCount = charges.filter(charge => idleToMin(charge.idleTime) >= 10).length;
  const couponCharges = charges.filter(charge => couponLabelForCharge(charge));
  const couponRevenue = couponCharges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const paymentIssues = charges.filter(charge => {
    const status = normalizeTextForInsight(charge.paymentStatus);
    return status && !/(aprov|pago|paid|approved|success|conclu)/.test(status);
  }).length;
  const byHour = {};
  charges.forEach(charge => {
    if (!charge.startDate || Number.isNaN(charge.startDate.getTime())) return;
    const hour = String(charge.startDate.getHours()).padStart(2, '0') + 'h';
    byHour[hour] = (byHour[hour] || 0) + 1;
  });
  const peak = topEntries(byHour, 1)[0];
  const comments = reviewData.comments || [];
  const avgRating = reviewData.avg || 0;
  const onlyRated = reviewData.onlyRated || [];
  const lowRated = onlyRated.filter(charge => charge.ratingValue && charge.ratingValue < 4);
  const allCommentText = normalizeTextForInsight(comments.map(charge => charge.comment).join(' '));
  const themes = [
    [/(caro|preco|valor|tarifa|custo)/, 'preço'],
    [/(pagamento|cartao|pix|wallet|app|aplicativo|cobranca)/, 'pagamento/app'],
    [/(lento|demora|rapido|velocidade|potencia)/, 'velocidade de carga'],
    [/(vaga|bloqueado|fila|ocupado|entrada|sinalizacao|localizacao)/, 'acesso e vaga'],
    [/(erro|falha|travou|indisponivel|nao funcionou|problema)/, 'falha operacional']
  ].filter(([regex]) => regex.test(allCommentText)).map(([, label]) => label);
  const benchmarkKind = dominantBenchmarkKind(charges);
  const benchmarkCharges = benchmarkKind === 'unknown' ? charges : charges.filter(charge => chargerKind(charge) === benchmarkKind);
  const benchmarkTotal = benchmarkCharges.length || total;
  const benchmarkRevenue = benchmarkCharges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const benchmarkEnergy = benchmarkCharges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const benchmarkAvgTicket = benchmarkTotal ? benchmarkRevenue / benchmarkTotal : avgTicket;
  const benchmarkAvgKwh = benchmarkTotal ? benchmarkEnergy / benchmarkTotal : avgKwh;
  const benchmarkLabel = benchmarkKindLabel(benchmarkKind);
  const peers = getGeneralUnitData()
    .filter(unit => unit.workId !== currentWorkId)
    .map(unit => {
      const monthCharges = mk && mk !== 'unknown' ? unit.charges.filter(charge => chargeMonthKey(charge) === mk) : unit.charges;
      const comparableCharges = benchmarkKind === 'unknown' ? monthCharges : monthCharges.filter(charge => chargerKind(charge) === benchmarkKind);
      const rev = comparableCharges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
      const kwh = comparableCharges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
      return {
        count: comparableCharges.length,
        ticket: comparableCharges.length ? rev / comparableCharges.length : 0,
        kwhSession: comparableCharges.length ? kwh / comparableCharges.length : 0
      };
    })
    .filter(unit => unit.count > 0);
  const peerTicket = median(peers.map(unit => unit.ticket));
  const peerKwh = median(peers.map(unit => unit.kwhSession));
  const insights = [];

  if (!total) {
    return reviewInsightCard('Sem base para IA operacional', 'Ainda não há recargas no período selecionado para cruzar avaliações, uso e receita.', 'Suba a planilha do mês para gerar recomendações específicas.', 'warn');
  }
  if (onlyRated.length < Math.max(3, total * 0.12)) {
    insights.push(reviewInsightCard('Amostra de avaliação fraca', `Só ${onlyRated.length} de ${total} recargas têm avaliação (${fmtPct(total ? onlyRated.length / total * 100 : 0)}). A decisão por nota ainda tem baixa confiança.`, 'Adicionar QR/link pós-recarga no ponto e conferir se a plataforma está pedindo avaliação.', 'warn'));
  } else if (avgRating >= 4.5) {
    insights.push(reviewInsightCard('Experiência validada pelo cliente', `Nota média ${avgRating.toFixed(1).replace('.', ',')} com ${onlyRated.length} avaliações. A experiência não parece ser o gargalo principal.`, 'Priorizar aquisição: divulgação local e cupom em horário ocioso.', 'good'));
  } else if (avgRating > 0) {
    insights.push(reviewInsightCard('Nota pede intervenção operacional', `Nota média ${avgRating.toFixed(1).replace('.', ',')} e ${lowRated.length} avaliação(ões) abaixo de 4 estrelas.`, themes.length ? `Atacar primeiro: ${themes.slice(0, 2).join(' e ')}.` : 'Auditar ativação, pagamento, conexão e sinalização no local.', 'warn'));
  }
  if (themes.length) {
    insights.push(reviewInsightCard('Tema recorrente dos comentários', `${comments.length} comentário(s) citam sinais ligados a ${themes.slice(0, 3).join(', ')}.`, 'Abrir tarefa operacional para o tema mais citado e comparar a nota após a próxima semana.', 'warn'));
  }
  if (peerTicket && benchmarkAvgTicket < peerTicket * 0.85) {
    insights.push(reviewInsightCard('Ticket abaixo do benchmark interno', `Ticket ${benchmarkLabel} ${fmtBRL(benchmarkAvgTicket)} contra mediana interna ${fmtBRL(peerTicket)} nas unidades comparaveis.`, 'Avaliar tarifa, permanencia e comunicacao para aumentar sessoes de maior valor.', 'warn'));
  } else if (peerTicket && benchmarkAvgTicket > peerTicket * 1.15) {
    insights.push(reviewInsightCard('Ticket acima do benchmark interno', `Ticket ${benchmarkLabel} ${fmtBRL(benchmarkAvgTicket)} contra mediana interna ${fmtBRL(peerTicket)} nas unidades comparaveis.`, 'Replicar posicionamento comercial deste ponto nos carregadores similares.', 'good'));
  }
  if (peerKwh && benchmarkAvgKwh < peerKwh * 0.8) {
    insights.push(reviewInsightCard('Sessoes curtas versus mercado interno', `Media ${benchmarkLabel} de ${benchmarkAvgKwh.toFixed(1).replace('.', ',')} kWh/sessao contra ${peerKwh.toFixed(1).replace('.', ',')} kWh/sessao nas unidades comparaveis.`, 'Testar convenio local ou comunicacao de permanencia para aumentar kWh por sessao.', 'warn'));
  }
  if (occ.pct < 5 && total >= 5) {
    insights.push(reviewInsightCard('Demanda baixa para o ativo', `Ocupação real ${fmtPct(occ.pct)} com ${total} recargas. Há capacidade ociosa relevante.`, peak ? `Concentrar campanha fora do pico ${peak[0]}, evitando desconto onde já existe demanda.` : 'Criar ação local de aquisição antes de mexer em preço.', 'warn'));
  } else if (occ.pct >= 12) {
    insights.push(reviewInsightCard('Uso começa a justificar expansão', `Ocupação ${fmtPct(occ.pct)} e ${fmtKWh(energy)} entregues no período.`, 'Monitorar fila/ociosidade e avaliar segundo conector se a nota se mantiver alta.', 'good'));
  }
  if (couponCharges.length) {
    insights.push(reviewInsightCard('Cupom com impacto mensurável', `${couponCharges.length} recarga(s) com voucher geraram ${fmtBRL(couponRevenue)} (${fmtPct(revenue ? couponRevenue / revenue * 100 : 0)} da receita).`, couponRevenue / Math.max(revenue, 1) > 0.35 ? 'Medir recompra sem desconto para evitar dependência de cupom.' : 'Manter cupom como aquisição e medir recompra no mês seguinte.'));
  }
  if (paymentIssues > 0) {
    insights.push(reviewInsightCard('Atrito de pagamento detectado', `${paymentIssues} recarga(s) têm status de pagamento fora do padrão aprovado/pago.`, 'Conferir gateway/app antes de investir em mídia.', 'warn'));
  }
  if (idleCount >= Math.max(2, total * 0.15)) {
    insights.push(reviewInsightCard('Ociosidade afeta giro da vaga', `${idleCount} recarga(s) tiveram mais de 10 minutos de ociosidade registrada.`, 'Ajustar alerta de retirada e regra de tolerância para liberar o carregador mais rápido.', 'warn'));
  }
  if (insights.length < 3) {
    insights.push(reviewInsightCard('Próxima melhor decisão', `Base atual: ${total} recargas, ${fmtBRL(revenue)} de receita, ${fmtKWh(energy)} e ticket ${fmtBRL(avgTicket)}.`, 'Aumentar volume de avaliações e revisar os insights após nova importação do mês.'));
  }
  return insights.slice(0, 6).join('');
}

function renderReviews(charges) {
  const rated = charges
    .map(charge => ({ ...charge, ratingValue: parseRatingValue(charge.rating), comment: safeText(charge.reviewComment).trim() }))
    .filter(charge => charge.ratingValue > 0 || charge.comment);
  const onlyRated = rated.filter(charge => charge.ratingValue > 0);
  const comments = rated.filter(charge => charge.comment);
  const avg = onlyRated.length ? onlyRated.reduce((sum, charge) => sum + charge.ratingValue, 0) / onlyRated.length : 0;
  document.getElementById('reviewKpis').innerHTML = `
    <div class="card"><div class="label">Média</div><div class="value">${avg ? avg.toFixed(1).replace('.', ',') : '0,0'} ★</div><div class="sub">${onlyRated.length} avaliação(ões)</div></div>
    <div class="card"><div class="label">Comentários</div><div class="value">${comments.length}</div><div class="sub">comentários preenchidos</div></div>
    <div class="card"><div class="label">Cobertura</div><div class="value">${charges.length ? fmtPct(onlyRated.length / charges.length * 100) : '0,00%'}</div><div class="sub">recargas com avaliação</div></div>
  `;

  const rows = [5, 4, 3, 2, 1].map(stars => {
    const group = onlyRated.filter(charge => Math.round(charge.ratingValue) === stars);
    const pct = onlyRated.length ? group.length / onlyRated.length * 100 : 0;
    const groupComments = comments
      .filter(charge => Math.round(charge.ratingValue) === stars)
      .slice(0, 3)
      .map(charge => escapeHtml(charge.comment))
      .join('<br>');
    return `<tr>
      <td>${stars} estrela${stars === 1 ? '' : 's'}</td>
      <td>${group.length}</td>
      <td>${fmtPct(pct)}</td>
      <td>${groupComments || '<span style="color:var(--p3-muted)">Sem comentários</span>'}</td>
    </tr>`;
  }).join('');
  const commentsWithoutRating = comments.filter(charge => !charge.ratingValue);
  const unratedRow = commentsWithoutRating.length ? `<tr>
    <td>Sem estrela</td>
    <td>0</td>
    <td>-</td>
    <td>${commentsWithoutRating.slice(0, 3).map(charge => escapeHtml(charge.comment)).join('<br>')}</td>
  </tr>` : '';

  document.getElementById('reviewsTable').innerHTML = onlyRated.length || comments.length
    ? rows + unratedRow
    : '<tr><td colspan="4" style="color:var(--p3-muted);text-align:center;padding:20px">Nenhuma avaliação encontrada na planilha.</td></tr>';
  document.getElementById('reviewAiInsights').innerHTML = buildReviewAiInsights(charges, { onlyRated, comments, avg });
}

function renderTechDiagnostic(charges) {
  if (!charges.length) return;
  const cleanStats = cleanOperationStats(charges);
  const energy     = charges.reduce((s,c) => s+c.energyKWh, 0);
  const rev        = charges.reduce((s,c) => s+c.revenue, 0);
  const power      = getPower();
  const totalH     = charges.reduce((s,c) => s+durToHours(c.duration), 0);
  const avgPower   = totalH > 0 ? energy/totalH : 0;
  const powers     = charges.filter(c => durToHours(c.duration)>0)
                            .map(c => c.energyKWh/durToHours(c.duration))
                            .sort((a,b) => a-b);
  const medPower   = powers.length ? powers[Math.floor(powers.length/2)] : 0;
  const maxPower   = powers.length ? Math.max(...powers) : 0;
  const equivH     = power > 0 ? energy/power : 0;
  const revPerH    = totalH > 0 ? rev/totalH : 0;
  const dates      = charges.map(c => c.startDate).filter(Boolean);
  const minD       = new Date(Math.min(...dates));
  const maxD       = new Date(Math.max(...dates));
  const days       = Math.max((maxD-minD)/86_400_000, 1);
  const rate       = charges.length/days;

  document.getElementById('techTable').innerHTML = `
    <tr><td>Potência nominal configurada</td><td>${power.toFixed(1)} kW</td><td>Base do cálculo de ocupação</td></tr>
    <tr><td>Potência real média entregue</td><td>${avgPower.toFixed(2)} kW</td><td>kWh total dividido pelas horas conectadas</td></tr>
    <tr><td>Potência real mediana</td><td>${medPower.toFixed(2)} kW</td><td>Sessão típica, menos afetada por extremos</td></tr>
    <tr><td>Maior potência média em sessão</td><td>${maxPower.toFixed(2)} kW</td><td>Melhor sessão do arquivo</td></tr>
    <tr><td>Entrega vs nominal</td><td>${power>0 ? (avgPower/power*100).toFixed(2) : '—'}%</td><td>Potência real média comparada aos ${power.toFixed(1)} kW</td></tr>
    <tr><td>Horas equivalentes a plena carga</td><td>${equivH.toFixed(1)} h</td><td>Energia vendida convertida em horas a ${power.toFixed(1)} kW</td></tr>
    <tr><td>Receita por hora conectada</td><td>${fmtBRL(revPerH)}</td><td>Receita bruta dividida por duração total</td></tr>
    <tr><td>Ritmo de uso</td><td>${rate.toFixed(2)} recargas/dia</td><td>Média no período exportado</td></tr>
    <tr><td>kWh médio limpo</td><td>${cleanStats.avgKwh.toFixed(2).replace('.', ',')} kWh</td><td>Remove falhas, energia zerada e sessões muito curtas</td></tr>
    <tr><td>Sessões válidas para média</td><td>${cleanStats.executed.length} de ${cleanStats.total}</td><td>${cleanStats.removed.length} tentativa(s) fora da média operacional</td></tr>
  `;
}

// ══════════════════════════════════════════════════════════
//  TAB ACUMULADO
// ══════════════════════════════════════════════════════════
function renderAccumulatedFinanceCharts(rows = [], investmentValue = 0) {
  const labels = rows.map(row => row.label);
  const axis = {
    x: { ticks: { color: '#8FA39A', font: { size: 11 } }, grid: { color: '#24364E' } },
    y: { beginAtZero: true, ticks: { color: '#8FA39A', font: { size: 11 } }, grid: { color: '#24364E' } }
  };
  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    normalized: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#B7C9D9', boxWidth: 12 } },
      tooltip: { callbacks: { label: context => `${context.dataset.label}: ${fmtBRL(context.raw || 0)}` } }
    },
    scales: {
      x: axis.x,
      y: { ...axis.y, ticks: { ...axis.y.ticks, callback: value => fmtBRL(value) } }
    }
  };
  const paybackCtx = document.getElementById('chartPaybackAccumulated');
  destroyChart('chartPaybackAccumulated');
  if (paybackCtx) {
    charts.chartPaybackAccumulated = new Chart(paybackCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Resultado recuperado',
            data: rows.map(row => row.cumulativePayback),
            borderColor: '#38C96F', backgroundColor: 'rgba(56,201,111,.14)',
            pointBackgroundColor: '#38C96F', borderWidth: 3, tension: .28, fill: true
          },
          {
            label: 'Investimento cadastrado',
            data: rows.map(() => investmentValue),
            borderColor: '#57B7FF', pointRadius: 0, borderWidth: 2, borderDash: [7, 5], tension: 0, fill: false
          }
        ]
      },
      options: lineOptions
    });
  }
  const resultCtx = document.getElementById('chartAccumulatedResult');
  destroyChart('chartAccumulatedResult');
  if (resultCtx) {
    charts.chartAccumulatedResult = new Chart(resultCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Resultado operacional acumulado',
          data: rows.map(row => row.cumulativeOperationNet),
          borderColor: '#57B7FF', backgroundColor: 'rgba(87,183,255,.13)',
          pointBackgroundColor: '#57B7FF', borderWidth: 3, tension: .28, fill: true
        }]
      },
      options: lineOptions
    });
  }
}

function renderAcumulado() {
  const months = getMonths();
  const power  = getPower();
  const md = months.map(mk => monthSummaryForMonth(mk, power)).filter(Boolean);

  // KPIs acumulados
  const energy  = md.reduce((s,d) => s+d.energy, 0);
  const rev     = md.reduce((s,d) => s+d.rev, 0);
  const totalCharges = md.reduce((s,d) => s+d.count, 0);
  const avgTkt  = totalCharges ? rev/totalCharges : 0;
  const avgRevenuePerKWh = energy > 0 ? rev/energy : 0;
  const clients = md.reduce((s,d) => s+d.clients, 0);
  const totalMaxKWh = md.reduce((s,d) => s + (d.occI > 0 ? d.energy/(d.occI/100) : 0), 0);
  const totalOcc = totalMaxKWh > 0 ? energy/totalMaxKWh*100 : 0;
  const datedCharges = allCharges.filter(charge => charge.startDate && !Number.isNaN(charge.startDate.getTime()));
  const accumulatedBounds = datedCharges.length ? {
    start: new Date(Math.min(...datedCharges.map(charge => charge.startDate))),
    end: new Date(Math.max(...datedCharges.map(charge => charge.startDate)))
  } : null;
  const calendarDays = accumulatedBounds
    ? Math.max(calendarDayCount(accumulatedBounds.start, accumulatedBounds.end), 1)
    : 1;
  const avgRevenueDay = rev / calendarDays;
  const avgChargesDay = totalCharges / calendarDays;
  const validDurations = cleanOperationStats(allCharges).executed
    .map(charge => durToHours(charge.duration))
    .filter(hours => hours > 0);
  const avgDuration = validDurations.length
    ? validDurations.reduce((sum, hours) => sum + hours, 0) / validDurations.length
    : 0;

  document.getElementById('kpiAcc').innerHTML = `
    <div class="card"><div class="label">Total recargas</div>
      <div class="value">${totalCharges}</div>
      <div class="sub">${months.length} ${months.length===1?'mês':'meses'} · ${clients} clientes</div></div>
    <div class="card"><div class="label">Receita acumulada</div>
      <div class="value">${fmtBRL(rev)}</div>
      <div class="sub">Ticket médio ${fmtBRL(avgTkt)}</div></div>
    <div class="card"><div class="label">Energia total</div>
      <div class="value">${fmtKWh(energy)}</div>
      <div class="sub">${(energy/Math.max(totalCharges,1)).toFixed(1)} kWh/sessão</div></div>
    <div class="card"><div class="label">R$/kWh medio</div>
      <div class="value">${fmtBRL(avgRevenuePerKWh)}</div>
      <div class="sub">receita / energia acumulada</div></div>
    <div class="card"><div class="label">Ocupação média</div>
      <div class="value">${fmtPct(totalOcc)}</div>
      <div class="bar"><span style="width:${Math.min(totalOcc,100).toFixed(1)}%"></span></div>
      <div class="sub">base mês completo por mês</div></div>
    <div class="card"><div class="label">Média de faturamento por dia</div>
      <div class="value">${fmtBRL(avgRevenueDay)}</div>
      <div class="sub">${calendarDays} dia(s), incluindo dias sem faturamento</div></div>
    <div class="card"><div class="label">Média de recargas por dia</div>
      <div class="value">${avgChargesDay.toFixed(2).replace('.', ',')}</div>
      <div class="sub">${totalCharges} recarga(s) em ${calendarDays} dia(s)</div></div>
    <div class="card"><div class="label">Tempo médio de recarga</div>
      <div class="value">${formatRechargeDuration(avgDuration)}</div>
      <div class="sub">${validDurations.length} sessão(ões) válida(s) com duração</div></div>
  `;

  // Cada linha usa as regras financeiras salvas no proprio mes. Assim, uma
  // mudanca de tarifa, plataforma ou custo fixo hoje nao reescreve o historico.
  const financeLastMonth = months.at(-1) || financeMonthKey();
  const financeTimeline = financeLastMonth ? currentWorkInvestorTimeline(financeLastMonth) : [];
  const financeTotal = aggregateInvestorEntries(financeTimeline);
  const investmentValue = Number(financeTotal.investmentValue || 0);
  let cumulativeOperationNet = 0;
  let cumulativePayback = 0;
  const financeRows = financeTimeline.map(entry => {
    cumulativeOperationNet += Number(entry.operationNet || 0);
    cumulativePayback += Number(entry.result?.paybackBase || 0);
    return {
      ...entry,
      cumulativeOperationNet,
      cumulativePayback,
      remainingInvestment: investmentValue > 0 ? Math.max(investmentValue - cumulativePayback, 0) : 0
    };
  });
  const recoveredPct = investmentValue > 0 ? cumulativePayback / investmentValue * 100 : 0;
  const monthlyPaybackBase = financeRows.length ? cumulativePayback / financeRows.length : 0;
  const estimatedPaybackMonths = investmentValue > 0 && monthlyPaybackBase > 0 ? investmentValue / monthlyPaybackBase : 0;
  const financialKpis = document.getElementById('accFinancialKpis');
  if (financialKpis) financialKpis.innerHTML = `
    <div class="finance-result-card"><span>Receita financeira acumulada</span><strong>${fmtBRL(financeTotal.totalRevenue || 0)}</strong><small>recargas e receitas extras</small></div>
    <div class="finance-result-card warn"><span>Custos operacionais acumulados</span><strong>${fmtBRL(financeTotal.totalOperatingCost || 0)}</strong><small>${fmtBRL(financeTotal.totalCostPerKWh || 0)}/kWh no acumulado</small></div>
    <div class="finance-result-card ${(financeTotal.operationNet || 0) >= 0 ? 'good' : 'bad'}"><span>Resultado operacional acumulado</span><strong>${fmtBRL(financeTotal.operationNet || 0)}</strong><small>margem ${fmtPct(financeTotal.operationMargin || 0)}</small></div>
    <div class="finance-result-card ${(cumulativePayback || 0) >= 0 ? 'good' : 'bad'}"><span>Resultado para payback</span><strong>${fmtBRL(cumulativePayback)}</strong><small>resultado proprio recuperavel</small></div>
    <div class="finance-result-card"><span>Investimento cadastrado</span><strong>${investmentValue > 0 ? fmtBRL(investmentValue) : '-'}</strong><small>${investmentValue > 0 ? `${fmtPct(recoveredPct)} recuperado` : 'informe no financeiro para calcular'}</small></div>
    <div class="finance-result-card ${investmentValue > 0 && cumulativePayback >= investmentValue ? 'good' : 'warn'}"><span>Saldo a recuperar</span><strong>${investmentValue > 0 ? fmtBRL(Math.max(investmentValue - cumulativePayback, 0)) : '-'}</strong><small>${investmentValue > 0 ? formatPaybackMonths(estimatedPaybackMonths) : 'payback indisponivel'}</small></div>
  `;
  const financeTable = document.getElementById('accFinancialTable');
  if (financeTable) financeTable.innerHTML = financeRows.length ? financeRows.map(row => `
    <tr>
      <td>${row.label}</td>
      <td>${fmtBRL(row.totalRevenue || 0)}</td>
      <td>${fmtBRL(row.totalOperatingCost || 0)}</td>
      <td style="color:${row.operationNet >= 0 ? 'var(--p3-accent)' : 'var(--p3-danger)'};font-weight:700">${fmtBRL(row.operationNet || 0)}</td>
      <td style="color:${row.cumulativeOperationNet >= 0 ? 'var(--p3-primary)' : 'var(--p3-danger)'};font-weight:700">${fmtBRL(row.cumulativeOperationNet)}</td>
      <td style="color:${row.cumulativePayback >= 0 ? 'var(--p3-accent)' : 'var(--p3-danger)'};font-weight:700">${fmtBRL(row.cumulativePayback)}</td>
      <td>${investmentValue > 0 ? fmtBRL(row.remainingInvestment) : '-'}</td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--p3-muted)">Sem meses financeiros para consolidar.</td></tr>';

  renderVisualSummary('accVisualSummary', allCharges, { occ: { pct: totalOcc, energy, power, hours: 0, maxKWh: 0 }, historyCharges: allCharges });

  // Gráficos simples
  renderWeekdayOccupancyReport('weekdayOccupancyAcc', allCharges, power, 'Dinamica semanal acumulada');

  const axBase = {
    x: { ticks:{color:'#8FA39A',font:{size:11}}, grid:{color:'#24364E'} },
    y: { beginAtZero:true, ticks:{color:'#8FA39A',font:{size:11}}, grid:{color:'#24364E'} }
  };

  renderAccumulatedFinanceCharts(financeRows, investmentValue);

  function mkBarChart(id, labels, values, unit, color) {
    destroyChart(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: values.map(v=>+v.toFixed(2)), backgroundColor: color, borderRadius: 4, label: unit }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          ...axBase,
          y: { ...axBase.y, ticks: { ...axBase.y.ticks, callback: v => unit==='R$' ? 'R$'+v : v+(unit||'') } }
        }
      }
    });
  }

  mkBarChart('chartRevMonth',    md.map(d=>d.label), md.map(d=>d.rev),    'R$',  '#57B7FF');
  mkBarChart('chartEnergyMonth', md.map(d=>d.label), md.map(d=>d.energy), ' kWh','#246BFE');
  mkBarChart('chartCountMonth',  md.map(d=>d.label), md.map(d=>d.count),  '',    '#FFD66B');

  // Ocupação com cores condicionais
  destroyChart('chartOccMonth');
  const oCtx = document.getElementById('chartOccMonth');
  if (oCtx) {
    charts['chartOccMonth'] = new Chart(oCtx, {
      type: 'bar',
      data: {
        labels: md.map(d => d.label),
        datasets: [{
          data: md.map(d => +d.occF.toFixed(2)),
          backgroundColor: md.map(d => d.occF>=30?'#57B7FF':d.occF>=12?'#FFD66B':'#EF6C6C'),
          borderRadius: 4,
          label: '%'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: axBase.x,
          y: { ...axBase.y, max: 100, ticks: { ...axBase.y.ticks, callback: v => v+'%' } }
        }
      }
    });
  }

  // Tabela histórica
  document.getElementById('accMonthTable').innerHTML = md.map(d =>
    `<tr>
       <td>${d.label}${monthClosingBadge(d)}</td><td>${d.count}</td><td>${d.clients}</td>
       <td>${d.energy.toFixed(2).replace('.',',')}</td>
       <td>${fmtBRL(d.rev)}</td><td>${fmtBRL(d.avgTkt)}</td>
       <td>${fmtPct(d.occI)}</td><td>${fmtPct(d.occF)}</td>
     </tr>`
  ).join('');

  // Ranking acumulado de usuários
  const byUserAcc = {};
  allCharges.forEach(c => {
    const name = c.userName || c.userEmail || 'Cliente sem nome';
    const key = clientKeyFromCharge(c) || clientIdentityKey(name);
    if (!byUserAcc[key]) byUserAcc[key] = { name, revenue: 0, count: 0 };
    byUserAcc[key].revenue += Number(c.revenue || 0);
    byUserAcc[key].count += 1;
  });
  const sortedAcc = Object.values(byUserAcc).sort((a,b) => b.revenue - a.revenue);
  const maxAcc    = sortedAcc[0]?.revenue || 1;
  document.getElementById('userBarsAcc').innerHTML = sortedAcc.map(user =>
    `<div class="user-row">
       <span>${escapeHtml((user.name||'').split(' ').slice(0,2).join(' '))}</span>
       <div class="track"><i style="width:${(user.revenue/maxAcc*100).toFixed(1)}%"></i></div>
       <strong>${fmtBRL(user.revenue)} <small style="color:var(--p3-muted);font-weight:600">· ${user.count} recarga(s)</small></strong>
     </div>`
  ).join('');
}

// ══════════════════════════════════════════════════════════
//  TAB DETALHES
// ══════════════════════════════════════════════════════════
function showMoreDetalhes() {
  detailRenderLimit += DETAIL_PAGE_SIZE;
  renderDetalhes();
}

function renderDetalhes() {
  const sorted = [...allCharges].sort((a,b) => (b.startDate||0)-(a.startDate||0));
  const total = sorted.length;
  if (detailRenderLimit > total) detailRenderLimit = Math.max(DETAIL_PAGE_SIZE, total);
  const limit = Math.min(detailRenderLimit, total);
  const visible = sorted.slice(0, limit);
  document.getElementById('detailCount').textContent =
    limit < total ? `${total} registros (mostrando ${limit})` : `${total} registros`;
  document.getElementById('detailTable').innerHTML = visible.map(c =>
    `<tr>
       <td style="color:var(--p3-muted);font-size:11px">#${c.id}</td>
       <td style="font-size:12px">${c.station}</td>
       <td style="white-space:nowrap;font-size:12px">${c.startStr||'—'}</td>
       <td>${c.userName.split(' ').slice(0,2).join(' ')}</td>
       <td style="white-space:nowrap;font-size:12px">${c.duration||'—'}</td>
       <td style="white-space:nowrap">${c.energyKWh.toFixed(3)} kWh</td>
       <td style="white-space:nowrap;color:var(--p3-primary);font-weight:600">${fmtBRL(c.revenue)}</td>
       <td><span style="background:rgba(63,182,107,.13);color:var(--p3-accent);padding:2px 8px;border-radius:12px;font-size:11px">${c.paymentType||'—'}</span></td>
       <td style="color:${idleToMin(c.idleTime)>=1?'var(--p3-warn)':'var(--p3-muted)'};font-size:12px">${c.idleTime||'—'}</td>
       <td style="color:#FFD66B;font-size:12px">${c.rating||'—'}</td>
     </tr>`
  ).join('');
  const wrap = document.getElementById('detailLoadMoreWrap');
  if (wrap) wrap.style.display = limit < total ? 'flex' : 'none';
}

// ── Navegação de abas ─────────────────────────────────────
function showTab(name) {
  if (window.UBY_FINANCE_ONLY) return; // página financeira dedicada não usa as abas operacionais
  // Mantém a matriz e o consolidado fora do painel operacional desde a primeira abertura.
  mountUbyFinanceWorkspace();
  const isGeneral = name === 'geral';
  const isUby = name === 'uby';
  const isCustomers = name === 'clientes';
  const isClub = name === 'clube';
  const isGeneralFinance = name === 'financeiroGeral';
  const isWorkReport = !isGeneral && !isUby && !isCustomers && !isClub && !isGeneralFinance && name !== 'none';
  document.getElementById('tabGeral').style.display     = name === 'geral'     ? 'block' : 'none';
  document.getElementById('tabUby').style.display       = name === 'uby'       ? 'block' : 'none';
  document.getElementById('tabClientes').style.display  = name === 'clientes'  ? 'block' : 'none';
  document.getElementById('tabClube').style.display     = name === 'clube'     ? 'block' : 'none';
  document.getElementById('tabFinanceiroGeral').style.display = name === 'financeiroGeral' ? 'block' : 'none';
  document.getElementById('tabMensal').style.display    = name === 'mensal'    ? 'block' : 'none';
  document.getElementById('tabAcumulado').style.display = name === 'acumulado' ? 'block' : 'none';
  document.getElementById('tabFinanceiro').style.display = name === 'financeiro' ? 'block' : 'none';
  document.getElementById('tabDetalhes').style.display  = name === 'detalhes'  ? 'block' : 'none';
  document.getElementById('ctrlGeral').style.display    = (isGeneral || isUby) ? 'flex'  : 'none';
  document.getElementById('ctrlClientes').style.display = isCustomers ? 'flex' : 'none';
  document.getElementById('ctrlClube').style.display    = isClub ? 'flex' : 'none';
  document.getElementById('ctrlFinanceiroGeral').style.display = name === 'financeiroGeral' ? 'flex' : 'none';
  document.getElementById('ctrlMensal').style.display   = name === 'mensal'    ? 'flex'  : 'none';
  document.getElementById('ctrlAcc').style.display      = name === 'acumulado' ? 'flex'  : 'none';
  document.getElementById('ctrlFinanceiro').style.display = name === 'financeiro' ? 'flex' : 'none';
  document.getElementById('workReportTabs').style.display = isWorkReport ? 'flex' : 'none';
  document.querySelector('.project-bar').style.display   = (isGeneral || isUby || isCustomers || isClub || isGeneralFinance) ? 'none' : '';
  document.getElementById('uploadZone').style.display    = (isGeneral || isUby || isCustomers || isClub || isGeneralFinance) ? 'none' : '';
}

function hideAllTabs() { showTab('none'); }

async function switchTab(name, btn) {
  const financeVisible = document.getElementById('tabFinanceiro')?.style.display === 'block';
  if (financeVisible && name !== 'financeiro') await flushPendingFinancialSettingsSave();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  showTab(name);
  if (name === 'mensal') await renderMensal();
  else if (name === 'acumulado') renderAcumulado();
  else if (name === 'geral' && overviewNeedsRender('geral')) await renderGeral();
  else if (name === 'uby') {
    ubyReportsRequested = false;
    await ensureMatrizCostsLoaded();
    if (overviewNeedsRender('uby')) await renderUbyOperation();
  }
  else if (name === 'clientes') {
    await loadCustomerRegistry();
    renderCustomerRegistry();
  }
  else if (name === 'clube') {
    await ensureAllOverviewSessionsLoaded();
    renderClub();
  }
  else if (name === 'financeiroGeral') {
    await ensureAllOverviewSessionsLoaded();
    await ensureMatrizCostsLoaded();
    renderGeneralFinance(getGeneralUnitData());
  }
  else if (name === 'detalhes') renderDetalhes();
  else if (name === 'financeiro') handleFinanceMonthChange();
}

async function openUbyReports(btn) {
  document.querySelectorAll('#tabsBar .tab').forEach(tab => tab.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ubyReportsRequested = true;
  showTab('uby');
  await renderUbyOperation();
  await yieldToBrowser();
  document.getElementById('ubyReportsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openGeneralFinanceView() {
  if (new URLSearchParams(location.search).get('view') !== 'financeiro') return;
  document.getElementById('tabsBar').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('onclick')?.includes("'financeiroGeral'")));
  showTab('financeiroGeral');
  renderGeneralFinance(getGeneralUnitData());
}

const UBY_APP_VERSION = '20260903-unified-jardins1';
async function __perf(label, fn) {
  const t0 = performance.now();
  try { return await fn(); }
  finally { console.log(`[UBY-PERF] ${label}: ${(performance.now() - t0).toFixed(0)} ms`); }
}

async function initializeRechargePage() {
  console.log(`[UBY-PERF] versao carregada: ${UBY_APP_VERSION}`);
  const bootStart = performance.now();
  const params = new URLSearchParams(location.search);
  const requestedWorkId = String(params.get('obra') || '').trim();
  if (requestedWorkId) currentWorkId = requestedWorkId;
  if (window.UBY_FINANCE_ONLY) {
    console.log('[fin] modo financeiro iniciando…');
    try {
      const u = await window.UBY_SUPABASE?.currentUser?.();
      console.log('[fin] usuário:', u?.email || 'NÃO AUTENTICADO (dados não carregam sem login)');
    } catch (e) { console.log('[fin] erro currentUser:', e.message); }
    try { await loadRechargeWorksFromCloud(); } catch (e) { console.error('[fin] loadWorks:', e.message); }
    console.log('[fin] obras na nuvem:', cloudRechargeWorks.length);
    try { await refreshGeneralRechargeBases(); } catch (e) { console.error('[fin] refresh:', e.message); }
    console.log('[fin] após refresh, registros:', Object.keys(allRechargeRecords || {}).length, '· recargas detalhadas:', countDetailedCharges());
    try { await ensureAllOverviewSessionsLoaded(); } catch (e) { console.error('[fin] histórico:', e.message); }
    console.log('[fin] após histórico completo, registros:', Object.keys(allRechargeRecords || {}).length, '· recargas detalhadas:', countDetailedCharges());
    try { await renderFinanceOnly(); } catch (e) { console.error('[fin] render:', e.message, e.stack); }
    console.log(`[UBY-PERF] BOOT TOTAL (financeiro): ${(performance.now() - bootStart).toFixed(0)} ms`);
    window.UBY_RECHARGE_RUNTIME?.markReady?.({ finance: true });
    return;
  }
  await __perf('loadRechargeWorksFromCloud', () => loadRechargeWorksFromCloud());
  await __perf('refreshGeneralRechargeBases', () => refreshGeneralRechargeBases());
  initWorkSelector();
  let workBaseLoaded = false;
  if (requestedWorkId && workOptions().some(work => work.id === requestedWorkId)) {
    currentWorkId = requestedWorkId;
    document.getElementById('workSelector').value = requestedWorkId;
    currentWorkName = workNameById(requestedWorkId, requestedWorkId);
    await __perf('loadRechargeBase', () => loadRechargeBase(requestedWorkId));
    workBaseLoaded = true;
  }
  // Vindo do botão "Abrir financeiro" da página financeira dedicada
  // (financeiro.html?...&openReport=financeiro&station=...): abre direto o
  // relatório daquela estação, em vez do fluxo padrão (openGeneralFinanceView).
  const openReport = params.get('openReport');
  if (workBaseLoaded && openReport) {
    await openWorkReport(requestedWorkId, openReport, params.get('station') || '');
  } else {
    openGeneralFinanceView();
  }
  console.log(`[UBY-PERF] BOOT TOTAL: ${(performance.now() - bootStart).toFixed(0)} ms`);
  window.UBY_RECHARGE_RUNTIME?.markReady?.({ records: Object.keys(allRechargeRecords || {}).length });
}

window.addEventListener('error', (e) => {
  console.error('[UBY-PERF] ERRO NAO TRATADO:', e.message, 'em', e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UBY-PERF] PROMISE REJEITADA:', e.reason?.message || e.reason);
});

const _importMonthEl = document.getElementById('importMonth');
if (_importMonthEl) _importMonthEl.value = new Date().toISOString().slice(0, 7);
document.getElementById('undoLastImportBtn')?.addEventListener('click', undoLastImport);
document.getElementById('clearSelectedMonthBtn')?.addEventListener('click', clearSelectedMonth);
document.getElementById('clearRechargeBaseBtn')?.addEventListener('click', clearRechargeBase);
initializeRechargePage();
scheduleLiveOccupationRefresh();

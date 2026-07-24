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
let financeEditorCurrentSettings = null;
let ubyOperationOverrides = {};
let rechargeRecordsVersion = 0;
let generalUnitDataCache = null;
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
const appData = window.UBY_APP_DATA || {};
let currentWorkId = new URLSearchParams(location.search).get('obra') || localStorage.getItem('uby-recargas-current-work') || 'rio';
let currentWorkName = '';
let currentStationReportName = '';
let spreadsheetLibraryPromise = null;
const RECHARGE_STATION_BLOCKLIST_BY_WORK = {
  malassise: ['posto prata', 'prata cambe', 'prata cambé', 'cambe', 'cambé']
};
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
  document.getElementById('stationLayoutOpen24h').checked = config.open24h !== false;
  document.getElementById('stationLayoutOpenTime').value = config.openTime || '08:00';
  document.getElementById('stationLayoutCloseTime').value = config.closeTime || '22:00';
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
    open24h: document.getElementById('stationLayoutOpen24h').checked,
    openTime: document.getElementById('stationLayoutOpenTime').value || '08:00',
    closeTime: document.getElementById('stationLayoutCloseTime').value || '22:00',
    openDays
  };
  const source = allRechargeRecords[workId] || localRecord(workId);
  if (!source) {
    alert('A base desta obra ainda nao foi carregada.');
    return;
  }
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
  return completedWorkStatus(work) || workHasRechargeHistory(work.id);
}

function workOptions() {
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
  const power = Number(work?.kw || 0);
  return power > 0 ? power : 7;
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

function clientIdentityKey(name = '', email = '') {
  return safeText(email || name).trim().toLowerCase();
}

function clientKeyFromCharge(charge = {}) {
  return clientIdentityKey(charge.userName, charge.userEmail);
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
    charges: Array.isArray(record.charges) ? record.charges.map(hydrateCharge) : [],
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

function mergeRechargeRecord(existing, incoming, source = 'local') {
  if (!existing) return hydratedRechargeRecord(incoming, incoming?.workId);
  if (!incoming) return hydratedRechargeRecord(existing, existing?.workId);
  const workId = String(incoming.workId || existing.workId || '').trim();
  const current = hydratedRechargeRecord(existing, workId);
  const next = hydratedRechargeRecord(incoming, workId);
  const currentHasDetails = current.charges.length > 0;
  const nextHasDetails = next.charges.length > 0;
  const nextIsPartial = Boolean(incoming.summaryOnly || incoming.localCompact);
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
    const currentIsFullLocal = currentHasDetails && !existing.localCompact && !existing.summaryOnly;
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
    const merged = mergeRechargeRecord(existing, normalized, record.summaryOnly ? 'cloud-summary' : 'cloud');
    allRechargeRecords[workId] = hydratedRechargeRecord(merged, workId);
    db[workId] = compactRechargeRecord(merged);
  });
  markRechargeRecordsDirty();
  if (!writeJson(RECARGAS_LOCAL_KEY, db)) window.UBY_BACKUP?.releaseStorage?.();
}

function localRecord(workId = currentWorkId) {
  return localRechargeDb()[workId] || null;
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
  return raw || workName || 'Estacao';
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
  financialSettings = record?.financialSettings || record?.summary?.financialSettings || {};
  stationAvailability = record?.stationAvailability || record?.summary?.stationAvailability || {};
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
  const initial = memory?.charges?.length ? memory : local;
  if (initial && (!initial.localCompact || initial.charges?.length)) applyRechargeRecord(initial, 'base local');
  else applyRechargeRecord(null, 'base local');
  if (options.skipCloud) return;
  if (!window.UBY_SUPABASE?.loadRechargeBase) return;
  try {
    const cloud = await window.UBY_SUPABASE.loadRechargeBase(targetWorkId);
    if (requestSequence !== rechargeLoadSequence || currentWorkId !== targetWorkId) return;
    if (cloud) {
      const currentLocal = localRecord(targetWorkId);
      if (currentLocal && !currentLocal.localCompact && !isCloudRecordNewer(currentLocal, cloud)) {
        setStorageState(`Base local mais recente preservada para <strong>${currentWorkName}</strong>. Reenvie a planilha para atualizar o banco, se necessario.`);
        return;
      }
      const merged = mergeRechargeRecord(allRechargeRecords[targetWorkId] || currentLocal, cloud, 'cloud');
      const db = localRechargeDb();
      db[targetWorkId] = compactRechargeRecord({ ...merged, workName: cloud.summary?.workName || currentWorkName });
      if (!writeJson(RECARGAS_LOCAL_KEY, db)) window.UBY_BACKUP?.releaseStorage?.();
      allRechargeRecords[targetWorkId] = hydratedRechargeRecord(merged, targetWorkId);
      markRechargeRecordsDirty();
      applyRechargeRecord(merged, 'Supabase');
    }
  } catch (err) {
    if (requestSequence !== rechargeLoadSequence || currentWorkId !== targetWorkId) return;
    setStorageState(`Base local preservada para <strong>${currentWorkName}</strong>. Supabase pendente: ${err.message}`, true);
  }
}

function initWorkSelector() {
  const selector = document.getElementById('workSelector');
  if (!selector) return;
  const works = workOptions();
  if (!works.some(work => work.id === currentWorkId)) currentWorkId = works[0]?.id || 'rio';
  selector.innerHTML = works.map(work => `<option value="${work.id}">${work.nome || work.id}${work.cliente ? ' - ' + work.cliente : ''}</option>`).join('');
  selector.value = currentWorkId;
  currentWorkName = currentWork().nome || currentWorkId;
  const power = Number(currentWork().kw || 0);
  if (power > 0) {
    document.getElementById('chargerPower').value = power;
    document.getElementById('chargerPowerAcc').value = power;
  }
  selector.onchange = async () => {
    currentStationReportName = '';
    currentWorkId = selector.value;
    localStorage.setItem('uby-recargas-current-work', currentWorkId);
    currentWorkName = currentWork().nome || currentWorkId;
    const nextPower = Number(currentWork().kw || 0);
    if (nextPower > 0) {
      document.getElementById('chargerPower').value = nextPower;
      document.getElementById('chargerPowerAcc').value = nextPower;
    }
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
    currentWorkId = String(workId || currentWorkId);
    currentStationReportName = shouldOpenFullRechargeWork(currentWorkId, stationName) ? '' : safeText(stationName).trim();
    localStorage.setItem('uby-recargas-current-work', currentWorkId);
    if (selector) selector.value = currentWorkId;
    currentWorkName = currentWork().nome || currentWorkId;
    const nextPower = Number(currentWork().kw || 0);
    if (nextPower > 0) {
      document.getElementById('chargerPower').value = nextPower;
      document.getElementById('chargerPowerAcc').value = nextPower;
    }

    document.getElementById('tabsBar').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('workReportTabs').style.display = 'flex';
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.report-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${target}'`)));
    showTab(target);
    window.scrollTo({ top: 0, behavior: 'auto' });
    await yieldToBrowser();

    openingWorkReport = true;
    // A base geral ja foi sincronizada na entrada. Abrir uma estacao deve usar
    // a copia em memoria imediatamente, sem bloquear a interface aguardando rede.
    await loadRechargeBase(currentWorkId, { skipCloud: true });
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
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');

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

function handleFiles(files) {
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

function rechargeUniqueKey(charge = {}) {
  const id = safeText(charge.id).trim();
  const platform = normalizeStationForCompare(charge.sourcePlatform || charge.platform || '');
  if (id && platform !== 'spott' && !id.includes('|')) return `id:${id}`;
  const station = canonicalStationNameForWork(charge.workId, charge.station, charge.workName);
  return [
    'fallback',
    platform === 'spott' ? 'spott' : safeText(station || charge.station).trim().toLowerCase(),
    platform === 'spott' ? '' : safeText(charge.connType).trim().toLowerCase(),
    safeText(charge.startStr || charge.startIso || charge.startDate?.toISOString?.()).trim(),
    safeText(charge.userEmail || charge.userName).trim().toLowerCase(),
    Number(charge.energyKWh || 0).toFixed(3),
    Number(charge.revenue || 0).toFixed(2)
  ].join('|');
}

function dedupeChargesByUniqueKey(charges = []) {
  const byKey = new Map();
  charges.forEach(charge => {
    const key = rechargeUniqueKey(charge);
    if (!key) return;
    byKey.set(key, charge);
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
      setStorageState(`Planilha importada para <strong>${currentWorkName}</strong>: ${importedCharges.length} recarga(s), ${fmtKWh(importedCharges.reduce((s,c)=>s+c.energyKWh,0))}, ${fmtBRL(importedCharges.reduce((s,c)=>s+c.revenue,0))}. Salvando no banco...`);
      await yieldToBrowser();
      await saveRechargeBase();
      await renderAll();
      if (replacedCount > 0) {
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

const _chargeMonthKeyCache = new WeakMap();
function chargeMonthKey(charge) {
  if (!charge || typeof charge !== 'object') return resolveChargeMonthKey(charge);
  const cached = _chargeMonthKeyCache.get(charge);
  if (cached !== undefined) return cached;
  const mk = resolveChargeMonthKey(charge);
  _chargeMonthKeyCache.set(charge, mk);
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
  if (closedSummary?.source === 'manual') return closedSummary;
  const ch = chargesForMonth(mk);
  if (ch.length) {
    const revM = ch.reduce((s,c) => s+c.revenue, 0);
    const enerM = ch.reduce((s,c) => s+c.energyKWh, 0);
    const occI = occByInterval(ch, power, periodWindow(ch, mk, 'mtd'));
    const occF = occByFullMonth(ch, mk);
    const cln = new Set(ch.map(c => c.userEmail||c.userName)).size;
    return { label: monthLabel(mk), mk, rev: revM, energy: enerM, occI: occI.pct, occF: occF.pct, count: ch.length, clients: cln, avgTkt: ch.length ? revM/ch.length : 0, fromClosing: false };
  }
  return closedSummary;
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
  status.textContent = `${closing.source === 'manual' ? 'Fechamento manual' : 'Ultima base do mes'} salva para ${monthLabel(mk)}.`;
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
    operationModel: document.getElementById('financeOperationModel')?.value || 'uby',
    managementPct: numberInputValue('financeMgmtPct', 5),
    p3SocietyPct: numberInputValue('financeP3SocietyPct', 0),
    p3AcEquityPct: numberInputValue('financeP3AcEquityPct', 0),
    p3DcEquityPct: numberInputValue('financeP3DcEquityPct', 0),
    platformPct: numberInputValue('financePlatformPct', 0),
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
    value: Number(rule.value || 0)
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
      <td class="rule-name"><input class="ctl-input" data-rule-field="label" value="${escapeAttr(rule.label)}" oninput="handleFinanceRuleEditorChange()" aria-label="Nome do item"></td>
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
  clearTimeout(financeSaveTimer);
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
  const mk = financeMonthKey();
  if (!mk) return;
  persistFinancialSettingsFromInputs(mk);
  renderFinanceiro(false);
  setFeedback(`Valores de ${monthLabel(mk)} confirmados para ${currentWorkName}.`, 'up-loading');
  await saveFinancialSettingsRecord();
  renderFinanceiro(false);
}

async function restoreFinancePreviousMonth() {
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

function mergeFinanceReportArchive(...collections) {
  const merged = new Map();
  collections.flat().filter(Boolean).forEach(report => {
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
    if (window.UBY_SUPABASE?.loadFinanceReports) {
      try {
        cloud = await window.UBY_SUPABASE.loadFinanceReports();
      } catch (err) {
        console.warn('Historico financeiro em nuvem indisponivel:', err);
      }
    }
    mergeFinanceReportArchive(local, cloud);
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

function financeReportPeriod(mk = '') {
  const [year, month] = String(mk).split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const today = new Date();
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

function financeMonthOccupancy(charges = [], mk = '', powerOverride = 0) {
  if (!/^\d{4}-\d{2}$/.test(mk)) return { pct: 0, maxKWh: 0, energy: 0, hours: 0 };
  const [year, month] = mk.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const monthAfter = new Date(year, month, 1, 0, 0, 0);
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
    label: item.label || item.id || 'Item',
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
  const result = financeForCharges(charges, settings, { monthKey: mk, historyCharges: options.historyCharges || charges, power: options.power });
  const occupancy = financeMonthOccupancy(charges, mk, options.power);
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
    operationNet: Number(result.operationNet || 0),
    operationMargin: Number(result.operationMargin || 0),
    totalCostPerKWh: result.totalCostPerKWh,
    plannedTotalCostPerKWh: result.plannedTotalCostPerKWh,
    investmentValue: Number(result.investmentValue || 0),
    roiMonthly: Number(result.roiMonthly || 0),
    paybackMonths: Number(result.paybackMonths || 0),
    saRetention: Number(result.saRetention || 0),
    investorDistribution: Number(result.investorDistribution || 0),
    ubyRetained: Number(result.ubyRetained || 0),
    revenueItems: financeRuleReportItems(result, settings, 'revenue'),
    costItems: financeRuleReportItems(result, settings, 'cost'),
    result,
    settings
  };
}

function aggregateInvestorEntries(entries = [], investmentValue = null) {
  const numeric = ['revenue','extraRevenue','totalRevenue','energy','charges','clients','maxKWh','totalOperatingCost','operationNet','saRetention','investorDistribution','ubyRetained'];
  const total = numeric.reduce((acc, key) => ({ ...acc, [key]: entries.reduce((sum, entry) => sum + Number(entry[key] || 0), 0) }), {});
  total.occupancyPct = total.maxKWh > 0 ? total.energy / total.maxKWh * 100 : 0;
  total.totalCostPerKWh = total.energy > 0 ? total.totalOperatingCost / total.energy : null;
  total.operationMargin = total.totalRevenue > 0 ? total.operationNet / total.totalRevenue * 100 : 0;
  total.investmentValue = investmentValue == null ? Number(entries.at(-1)?.investmentValue || 0) : Number(investmentValue || 0);
  total.roiMonthly = total.investmentValue > 0 ? total.operationNet / total.investmentValue * 100 : 0;
  const averageMonthlyResult = entries.length ? total.operationNet / entries.length : 0;
  total.paybackMonths = total.investmentValue > 0 && averageMonthlyResult > 0 ? total.investmentValue / averageMonthlyResult : 0;
  return total;
}

function currentWorkInvestorTimeline(uptoMonth = financeMonthKey(), selectedSettings = null) {
  const available = [...new Set(allCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const firstMonth = available.find(key => key <= uptoMonth) || uptoMonth;
  return financeMonthSeries(firstMonth, uptoMonth).map(mk => {
    const charges = chargesForMonth(mk);
    const settings = mk === uptoMonth && selectedSettings ? selectedSettings : financeSettingsForMonth(mk);
    return financeInvestorEntry(charges, settings, mk, { historyCharges: allCharges, power: workPowerById(currentWorkId) });
  });
}

function currentWorkInvestorReportModel(mk = financeMonthKey(), settingsOverride = null) {
  const settings = settingsOverride || currentFinanceSettingsFromInputs();
  const period = financeReportPeriod(mk);
  const timeline = currentWorkInvestorTimeline(mk, settings);
  const current = timeline.find(entry => entry.key === mk) || financeInvestorEntry([], settings, mk, { power: workPowerById(currentWorkId) });
  const accumulated = aggregateInvestorEntries(timeline, current.investmentValue);
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
  const result = financeForCharges(charges, settings, { monthKey: mk });
  const occupancy = financeMonthOccupancy(charges, mk, workPowerById(currentWorkId));
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
    <div class="report-library-actions"><button class="btn-recalc" type="button" onclick="openFinanceReportArchive('${escapeAttr(report.id)}',false)">Visualizar</button><button class="btn-recalc" type="button" onclick="openFinanceReportArchive('${escapeAttr(report.id)}',true)">PDF</button></div>
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
  const result = financeForCharges(charges, settings, { monthKey: mk });
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
      <tr><td>Gestao P3</td><td>${fmtPct(settings.managementPct)} do faturamento</td><td>${fmtBRL(result.management)}</td><td>${fmtPerKWh(result.energy > 0 ? result.management / result.energy : null)}</td></tr>
      <tr><td>App / plataforma</td><td>${fmtPct(settings.platformPct)} do faturamento</td><td>${fmtBRL(result.platform)}</td><td>${fmtPerKWh(result.energy > 0 ? result.platform / result.energy : null)}</td></tr>
      ${result.areaEligible ? `<tr><td>Participacao da area</td><td>${fmtPct(result.areaSharePct)} sobre ${settings.ownerTransferMode === 'net' ? 'lucro liquido' : 'faturamento'}</td><td>${fmtBRL(result.areaParticipation)}</td><td>${fmtPerKWh(result.energy > 0 ? result.areaParticipation / result.energy : null)}</td></tr>` : ''}
      <tr><td><strong>Total de custos</strong></td><td></td><td><strong>${fmtBRL(result.totalOperatingCost)}</strong></td><td><strong>${fmtPerKWh(result.totalCostPerKWh)}</strong></td></tr>
    </tbody></table>
    <h2>Resultado e prestacao da area</h2><table><tbody>
      <tr><td>Resultado operacional</td><td>${fmtBRL(result.operationNet)}</td><td>Margem operacional</td><td>${fmtPct(result.operationMargin)}</td></tr>
      <tr><td>Custo inicial por kWh</td><td>${fmtPerKWh(result.plannedTotalCostPerKWh)}</td><td>Custo efetivo por kWh</td><td>${fmtPerKWh(result.totalCostPerKWh)}</td></tr>
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
  const result = financeForCharges(charges, settings, { monthKey: mk });
  const { revenue, energy, acRevenue, dcRevenue, management, platform, energyCost, extraCosts, extraRevenue, p3AcEquity, p3DcEquity, p3SocietyProfit, p3Gross, operationNet, ubyNet, saRetention, ubyDistributable, investorDistribution, ubyRetained, partnerShare, ownResult, paybackBase, paybackMonths, roiMonthly, margin } = result;
  const target = targetOccupationMetrics(charges, mk, settings);
  const clients = new Set(charges.map(c => c.userEmail || c.userName).filter(Boolean)).size;
  const p3TakePct = revenue ? p3Gross / revenue * 100 : 0;
  const isUbyModel = settings.operationModel === 'uby' || settings.operationModel === 'hybrid';
  const hasP3Society = settings.operationModel === 'p3_society' || settings.operationModel === 'hybrid';
  updateFinanceCommandSummary(result, charges, clients);

  document.getElementById('financeHeroMeta').innerHTML =
    `Ponto: <strong>${currentWorkName}</strong><br>Mes: <strong>${monthLabel(mk)}</strong><br>${charges.length} recarga(s), ${clients} cliente(s), ${fmtKWh(energy)}`;
  document.getElementById('financeFormula').innerHTML =
    `<strong>${operationModelLabel(settings.operationModel)}</strong><br>P3: gestao ${settings.managementPct}% + sociedade configurada. App/plataforma ${settings.platformPct}% e servico de terceiros.<br>Meta ocupacao: ${fmtPct(target.targetOccPct)} | real ${fmtPct(target.realOccPct)}<br><strong style="color:#57B7FF">Payback: ${formatPaybackMonths(paybackMonths)}</strong>`;

  document.getElementById('financeKpis').innerHTML = [
    `<div class="card"><div class="label">Receita do mes</div><div class="value">${fmtBRL(revenue)}</div><div class="sub">${charges.length} recarga(s)</div></div>`,
    `<div class="card"><div class="label">Receita P3</div><div class="value">${fmtBRL(p3Gross)}</div><div class="sub">gestao${hasP3Society ? ' + sociedades' : ''}</div></div>`,
    isUbyModel ? `<div class="card"><div class="label">Resultado UBY</div><div class="value">${fmtBRL(ubyNet)}</div><div class="sub">apos energia, custos e P3</div></div>` : '',
    hasP3Society ? `<div class="card"><div class="label">Sociedade P3</div><div class="value">${fmtBRL(p3SocietyProfit)}</div><div class="sub">fora da UBY quando aplicavel</div></div>` : '',
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
    `<tr><td>Gestao P3 (${settings.managementPct}%)</td><td>${fmtBRL(management)}</td></tr>`,
    `<tr><td>App/plataforma terceiros (${settings.platformPct}%)</td><td>${fmtBRL(platform)}</td></tr>`,
    result.areaEligible ? `<tr><td>Participacao da area (${result.areaSharePct}%)</td><td>${fmtBRL(result.areaParticipation)}</td></tr>` : '',
    settings.operationModel === 'hybrid' ? `<tr><td>Sociedade P3 em AC (${settings.p3AcEquityPct}%)</td><td>${fmtBRL(p3AcEquity)}</td></tr>` : '',
    settings.operationModel === 'hybrid' ? `<tr><td>Sociedade P3 em DC (${settings.p3DcEquityPct}%)</td><td>${fmtBRL(p3DcEquity)}</td></tr>` : '',
    settings.operationModel === 'p3_society' ? `<tr><td>Sociedade P3 geral (${settings.p3SocietyPct}%)</td><td>${fmtBRL(p3SocietyProfit)}</td></tr>` : '',
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
    `<tr><td>Investimento no ponto</td><td>${fmtBRL(settings.investmentValue)}</td></tr>`,
    `<tr><td>Receita P3</td><td>${fmtBRL(p3Gross)}</td></tr>`,
    `<tr><td>App/plataforma terceiros</td><td>${fmtBRL(platform)}</td></tr>`,
    `<tr><td>Custo de energia</td><td>${fmtBRL(energyCost)}</td></tr>`,
    result.areaEligible ? `<tr><td>Participacao do parceiro da area</td><td>${fmtBRL(result.areaParticipation)}</td></tr>` : '',
    `<tr><td>Custos operacionais cadastrados</td><td>${fmtBRL(extraCosts)}</td></tr>`,
    `<tr><td>Custo operacional total</td><td>${fmtBRL(result.totalOperatingCost)}</td></tr>`,
    `<tr><td>Custo efetivo por kWh</td><td>${fmtPerKWh(result.totalCostPerKWh)}</td></tr>`,
    `<tr><td>Custo inicial por kWh</td><td>${fmtPerKWh(result.plannedTotalCostPerKWh)}</td></tr>`,
    `<tr><td>Ponto de equilibrio</td><td>${Number.isFinite(result.breakEvenKWh) ? fmtKWh(result.breakEvenKWh) : '-'}</td></tr>`,
    hasP3Society ? `<tr><td>Lucro sociedade P3</td><td>${fmtBRL(p3SocietyProfit)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Resultado liquido UBY</td><td>${fmtBRL(ubyNet)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Retencao obrigatoria S.A.</td><td>${fmtBRL(saRetention)}</td></tr>` : '',
    isUbyModel ? `<tr><td>Base distribuivel UBY</td><td>${fmtBRL(ubyDistributable)}</td></tr>` : '',
    partnerShare ? `<tr><td>Resultado socio/local</td><td>${fmtBRL(partnerShare)}</td></tr>` : '',
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
      : `Neste modelo, a P3 recebe ${fmtBRL(p3Gross)} no mes. O app/plataforma fica separado como servico de terceiros (${fmtBRL(platform)}). O socio/local fica com ${fmtBRL(partnerShare)} conforme o modelo escolhido. Meta ate o periodo: ${fmtKWh(target.targetEnergy)} e ${fmtBRL(target.targetRevenue)}. Meta mes completo: ${fmtKWh(target.fullMonthTargetEnergy)} e ${fmtBRL(target.fullMonthTargetRevenue)}.`;
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

async function saveFinancialSettingsRecord() {
  const record = financeRecordWithCurrentSettings();
  record.metadataType = 'financial_settings';
  const localSave = saveLocalRechargeBase(record);
  allRechargeRecords[currentWorkId] = hydratedRechargeRecord(record, currentWorkId);
  markRechargeRecordsDirty();
  if (window.UBY_SUPABASE?.saveRechargeMetadata) {
    await window.UBY_SUPABASE.saveRechargeMetadata(currentWorkId, record);
  }
  return localSave;
}

function scheduleFinancialSettingsSave() {
  const mk = financeMonthKey();
  if (!mk || !currentWorkId) return;
  const settings = persistFinancialSettingsFromInputs(mk);
  renderFinanceMonthVersionState(settings);
  const savedLabel = document.getElementById('financeVersionSaved');
  if (savedLabel) savedLabel.textContent = 'Salvando...';
  clearTimeout(financeSaveTimer);
  financeSaveTimer = setTimeout(async () => {
    try {
      await saveFinancialSettingsRecord();
      setStorageState(`Financeiro de ${monthLabel(mk)} salvo automaticamente para <strong>${currentWorkName}</strong>.`);
      renderFinanceMonthVersionState(financeEditorCurrentSettings);
      renderGeneralFinance(getGeneralUnitData());
    } catch (err) {
      setStorageState(`Financeiro local salvo. Falha ao sincronizar: ${err.message}`, true);
    }
  }, 900);
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
      if (planned) planned.textContent = fmtPerKWh(item.plannedPerKWh);
      if (actualKWh) actualKWh.textContent = fmtPerKWh(item.actualPerKWh);
    });
  };
  renderDetails('cost', result.costRuleDetails);
  renderDetails('revenue', result.revenueRuleDetails);

  const costTotal = document.getElementById('financeCostRuleTotals');
  if (costTotal) costTotal.innerHTML = `<tr><td colspan="4">Custos diretos</td><td>${fmtBRL((result.energyCost || 0) + (result.extraCosts || 0))}</td><td>${fmtPerKWh(result.plannedDirectCostPerKWh)}</td><td>${fmtPerKWh(result.directCostPerKWh)}</td><td></td><td></td><td></td></tr>`;
  const revenueTotal = document.getElementById('financeRevenueRuleTotals');
  if (revenueTotal) revenueTotal.innerHTML = `<tr><td colspan="4">Receitas adicionais</td><td>${fmtBRL(result.extraRevenue || 0)}</td><td>${fmtPerKWh(result.plannedExtraRevenuePerKWh)}</td><td>${fmtPerKWh(result.extraRevenuePerKWh)}</td><td></td><td></td><td></td></tr>`;

  const guidance = document.getElementById('financePlanningGuidance');
  if (guidance) {
    guidance.style.display = planning.planningKWh > 0 ? 'none' : 'block';
    guidance.textContent = 'Informe a base inicial de kWh ou defina a meta de ocupacao para calcular o custo de partida antes da primeira venda.';
  }
}

function renderFinanceOperationalResults(result = {}) {
  const container = document.getElementById('financeOperationalResults');
  if (!container) return;
  const resultClass = result.operationNet > 0 ? 'good' : (result.operationNet < 0 ? 'bad' : 'warn');
  const marginClass = result.margin >= 20 ? 'good' : (result.margin >= 0 ? 'warn' : 'bad');
  container.innerHTML = `
    <div class="finance-result-card"><span>Custo operacional total</span><strong>${fmtBRL(result.totalOperatingCost || 0)}</strong><small>energia + itens + gestao P3 + plataforma</small></div>
    <div class="finance-result-card"><span>Custo efetivo por kWh</span><strong>${fmtPerKWh(result.totalCostPerKWh)}</strong><small>diluido pelos ${fmtKWh(result.energy || 0)} vendidos</small></div>
    <div class="finance-result-card"><span>Custo inicial por kWh</span><strong>${fmtPerKWh(result.plannedTotalCostPerKWh)}</strong><small>base: ${fmtKWh(result.planning?.planningKWh || 0)}</small></div>
    <div class="finance-result-card warn"><span>Ponto de equilibrio</span><strong>${Number.isFinite(result.breakEvenKWh) ? fmtKWh(result.breakEvenKWh) : '-'}</strong><small>${result.contributionPerKWh > 0 ? `${fmtPerKWh(result.contributionPerKWh)} de contribuicao` : 'preco de venda nao cobre os custos variaveis'}</small></div>
    <div class="finance-result-card ${resultClass}"><span>Resultado operacional</span><strong>${fmtBRL(result.operationNet || 0)}</strong><small>receitas totais menos todos os custos</small></div>
    <div class="finance-result-card ${resultClass}"><span>Resultado por kWh</span><strong>${fmtPerKWh(result.resultPerKWh)}</strong><small>resultado diluido pela energia vendida</small></div>
    <div class="finance-result-card ${marginClass}"><span>Margem operacional</span><strong>${fmtPct(result.operationMargin || 0)}</strong><small>resultado / receitas totais</small></div>
    <div class="finance-result-card"><span>Preco medio vendido</span><strong>${fmtPerKWh(result.planning?.salePricePerKWh || 0)}</strong><small>comparar com custo efetivo e custo inicial</small></div>
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

function operationModelLabel(model) {
  return {
    uby: 'UBY - ativo proprio',
    p3_society: 'P3 sociedade fora da UBY',
    hybrid: 'Hibrido AC/DC',
    management_only: 'Somente gestao'
  }[model] || 'UBY - ativo proprio';
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
  const acRevenue = charges.filter(c => chargerKind(c) === 'ac').reduce((sum, c) => sum + c.revenue, 0);
  const dcRevenue = charges.filter(c => chargerKind(c) === 'dc').reduce((sum, c) => sum + c.revenue, 0);
  const unknownRevenue = Math.max(revenue - acRevenue - dcRevenue, 0);
  const model = cfg.operationModel || 'uby';
  const management = revenue * cfg.managementPct / 100;
  const platform = revenue * cfg.platformPct / 100;
  const energyCost = energy * cfg.energyCostPerKWh;
  const mk = options.monthKey || chargeMonthKey(charges[0] || {}) || financeMonthKey();
  const planning = financePlanningContext(charges, mk === 'unknown' ? financeMonthKey() : mk, cfg, options.historyCharges || charges, options.power);
  const costEvaluation = evaluateFinanceRules(cfg.costRules, planning);
  const revenueEvaluation = evaluateFinanceRules(cfg.revenueRules, planning);
  const extraCosts = costEvaluation.actual;
  const extraRevenue = revenueEvaluation.actual;
  const costs = energyCost + extraCosts;
  const preAreaNet = revenue + extraRevenue - management - platform - costs;
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
  const saRetention = Math.max(ubyNet, 0) * cfg.saRetentionPct / 100;
  const ubyDistributable = Math.max(ubyNet - saRetention, 0);
  const investorDistribution = ubyDistributable * cfg.investorQuotaPct / 100;
  const ubyRetained = ubyNet - investorDistribution;
  const p3OperationalResult = management + p3SocietyProfit;
  const ownResult = ubyNet + p3SocietyProfit;
  const paybackBase = model === 'p3_society' ? p3SocietyProfit : (model === 'management_only' ? p3OperationalResult : ownResult);
  const paybackMonths = cfg.investmentValue > 0 && paybackBase > 0 ? cfg.investmentValue / paybackBase : 0;
  const roiMonthly = cfg.investmentValue > 0 ? paybackBase / cfg.investmentValue * 100 : 0;
  const margin = revenue ? ownResult / revenue * 100 : 0;
  const totalRevenue = revenue + extraRevenue;
  const totalOperatingCost = energyCost + extraCosts + management + platform + areaParticipation;
  const directCostPerKWh = energy > 0 ? (energyCost + extraCosts + areaParticipation) / energy : null;
  const totalCostPerKWh = energy > 0 ? totalOperatingCost / energy : null;
  const extraRevenuePerKWh = energy > 0 ? extraRevenue / energy : null;
  const plannedEnergyCost = planning.planningKWh * cfg.energyCostPerKWh;
  const plannedManagement = planning.planningRevenue * cfg.managementPct / 100;
  const plannedPlatform = planning.planningRevenue * cfg.platformPct / 100;
  const plannedPreAreaNet = planning.planningRevenue + revenueEvaluation.planned - plannedManagement - plannedPlatform - plannedEnergyCost - costEvaluation.planned;
  const plannedAreaShareBase = cfg.ownerTransferMode === 'net' ? Math.max(plannedPreAreaNet, 0) : planning.planningRevenue;
  const plannedAreaParticipation = areaEligible ? plannedAreaShareBase * areaSharePct / 100 : 0;
  const plannedDirectCost = plannedEnergyCost + costEvaluation.planned + plannedAreaParticipation;
  const plannedTotalCost = plannedDirectCost + plannedManagement + plannedPlatform;
  const plannedDirectCostPerKWh = planning.planningKWh > 0 ? plannedDirectCost / planning.planningKWh : null;
  const plannedExtraRevenuePerKWh = planning.planningKWh > 0 ? revenueEvaluation.planned / planning.planningKWh : null;
  const managementVariable = planning.salePricePerKWh * cfg.managementPct / 100;
  const platformVariable = planning.salePricePerKWh * cfg.platformPct / 100;
  const areaVariable = areaEligible && cfg.ownerTransferMode !== 'net' ? planning.salePricePerKWh * areaSharePct / 100 : 0;
  const variableCostPerKWh = cfg.energyCostPerKWh + managementVariable + platformVariable + areaVariable + financeVariableCostPerKWh(cfg.costRules, planning);
  const variableRevenuePerKWh = planning.salePricePerKWh + financeVariableCostPerKWh(cfg.revenueRules, planning);
  const economics = window.UBY_FINANCE_ENGINE.unitEconomics({
    energy,
    revenue,
    extraRevenue,
    energyCost,
    extraCosts: extraCosts + areaParticipation,
    management,
    platform,
    planningKWh: planning.planningKWh,
    plannedEnergyCost,
    plannedExtraCosts: costEvaluation.planned + plannedAreaParticipation,
    plannedManagement,
    plannedPlatform,
    variableRevenuePerKWh,
    variableCostPerKWh,
    fixedCosts: financeFixedRuleTotal(cfg.costRules),
    fixedRevenue: financeFixedRuleTotal(cfg.revenueRules)
  });
  const { plannedTotalCostPerKWh, resultPerKWh, operationMargin, contributionPerKWh, breakEvenKWh } = economics;
  return {
    operationModel: model,
    revenue,
    energy,
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
    extraCosts,
    extraRevenue,
    preAreaNet,
    areaEligible,
    areaSharePct,
    areaShareBase,
    areaParticipation,
    plannedAreaParticipation,
    costRules: cfg.costRules,
    revenueRules: cfg.revenueRules,
    costRuleDetails: costEvaluation.details,
    revenueRuleDetails: revenueEvaluation.details,
    costs,
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
    operationNet,
    ubyNet,
    saRetention,
    ubyDistributable,
    investorDistribution,
    ubyRetained,
    paybackBase,
    paybackMonths,
    roiMonthly,
    margin,
    investmentValue: cfg.investmentValue
  };
}

function generalFinanceByUnit(unitData) {
  return unitData.map(unit => {
    const byMonth = {};
    unit.charges.forEach(charge => {
      const mk = chargeMonthKey(charge);
      if (mk === 'unknown') return;
      (byMonth[mk] ||= []).push(charge);
    });
    const settings = allRechargeRecords[unit.workId]?.financialSettings || {};
    const total = Object.entries(byMonth).reduce((acc, [mk, charges]) => {
      const result = financeForCharges(charges, settings[mk] || settings.default || defaultFinanceSettings(), { monthKey: mk, historyCharges: unit.charges, power: workPowerById(unit.workId) });
      Object.entries(result).forEach(([key, value]) => {
        if (['operationModel', 'margin', 'paybackMonths', 'roiMonthly', 'investmentValue'].includes(key) || !Number.isFinite(value)) return;
        acc[key] = (acc[key] || 0) + value;
      });
      acc.investmentValue = Math.max(acc.investmentValue || 0, result.investmentValue || 0);
      return acc;
    }, {});
    total.margin = total.revenue ? total.ownResult / total.revenue * 100 : 0;
    total.paybackMonths = total.investmentValue > 0 && total.paybackBase > 0 ? total.investmentValue / total.paybackBase : 0;
    total.roiMonthly = total.investmentValue > 0 ? total.paybackBase / total.investmentValue * 100 : 0;
    return { ...unit, finance: total };
  });
}

function renderGeneralFinance(unitData) {
  const activeUnits = (unitData || []).filter(unit =>
    Array.isArray(unit.charges) && unit.charges.length > 0 &&
    (Number(unit.count) > 0 || Number(unit.energy) > 0 || Number(unit.revenue) > 0)
  );
  const rows = generalFinanceByUnit(activeUnits).sort((a, b) => {
    const ownDiff = (Number(b.finance?.ownResult) || 0) - (Number(a.finance?.ownResult) || 0);
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
  total.paybackMonths = total.investmentValue > 0 && total.paybackBase > 0 ? total.investmentValue / total.paybackBase : 0;
  total.roiMonthly = total.investmentValue > 0 ? total.paybackBase / total.investmentValue * 100 : 0;
  const best = [...rows].sort((a, b) => (b.finance?.ownResult || 0) - (a.finance?.ownResult || 0))[0];
  document.getElementById('generalFinanceHeroMeta').innerHTML =
    `Unidades com base: <strong>${rows.length}</strong><br>Investimento cadastrado: <strong>${fmtBRL(total.investmentValue || 0)}</strong><br>Resultado UBY consolidado: <strong>${fmtBRL(total.ubyNet || 0)}</strong>`;
  document.getElementById('generalFinanceHeroFormula').innerHTML =
    `<strong>Modelo financeiro</strong><br>P3 recebe gestao e sociedades configuradas. App/plataforma e servico de terceiros.<br>UBY recebe apenas ativos UBY e distribui aos investidores por cotas. Sociedades fora da UBY ficam separadas.`;
  document.getElementById('kpiGeneralFinance').innerHTML = `
    <div class="card"><div class="label">Receita financeira</div><div class="value">${fmtBRL(total.revenue || 0)}</div><div class="sub">base das recargas</div></div>
    <div class="card"><div class="label">Receita P3 total</div><div class="value">${fmtBRL(total.p3Gross || 0)}</div><div class="sub">gestao + sociedades</div></div>
    <div class="card"><div class="label">Sociedades P3</div><div class="value">${fmtBRL(total.p3SocietyProfit || 0)}</div><div class="sub">fora da UBY quando configurado</div></div>
    <div class="card"><div class="label">Resultado UBY</div><div class="value">${fmtBRL(total.ubyNet || 0)}</div><div class="sub">apos custos e P3</div></div>
    <div class="card"><div class="label">Retencao S.A.</div><div class="value">${fmtBRL(total.saRetention || 0)}</div><div class="sub">retencao estatutaria</div></div>
    <div class="card"><div class="label">Investidores</div><div class="value">${fmtBRL(total.investorDistribution || 0)}</div><div class="sub">repasses por cotas</div></div>
    <div class="card"><div class="label">Payback geral</div><div class="value">${formatPaybackMonths(total.paybackMonths || 0)}</div><div class="sub">investimento / resultado proprio</div></div>
  `;
  document.getElementById('generalFinanceTable').innerHTML = `
    <tr class="finance-group-row"><th colspan="2">Operacao</th></tr>
    <tr><td>Faturamento bruto das recargas</td><td>${fmtBRL(total.revenue || 0)}</td></tr>
    <tr><td>Receitas extras</td><td>${fmtBRL(total.extraRevenue || 0)}</td></tr>
    <tr><td>App e plataforma de terceiros</td><td>${fmtBRL(total.platform || 0)}</td></tr>
    <tr><td>Demais custos configurados</td><td>${fmtBRL(total.costs || 0)}</td></tr>
    <tr><td>Participacao dos parceiros de area</td><td>${fmtBRL(total.areaParticipation || 0)}</td></tr>
    <tr class="finance-total-row"><td>Custo operacional total</td><td>${fmtBRL(total.totalOperatingCost || 0)}</td></tr>
    <tr class="finance-group-row"><th colspan="2">Distribuicao do resultado</th></tr>
    <tr><td>Gestao P3</td><td>${fmtBRL(total.management || 0)}</td></tr>
    <tr><td>Sociedade P3</td><td>${fmtBRL(total.p3SocietyProfit || 0)}</td></tr>
    <tr><td>Resultado UBY antes da retencao</td><td>${fmtBRL(total.ubyNet || 0)}</td></tr>
    <tr><td>Retencao obrigatoria S.A.</td><td>${fmtBRL(total.saRetention || 0)}</td></tr>
    <tr><td>Repasse aos investidores</td><td>${fmtBRL(total.investorDistribution || 0)}</td></tr>
    <tr><td>Valor retido pela UBY</td><td>${fmtBRL(total.ubyRetained || 0)}</td></tr>
    <tr><td>Resultado do socio ou local</td><td>${fmtBRL(total.partnerShare || 0)}</td></tr>
    <tr class="finance-group-row"><th colspan="2">Retorno</th></tr>
    <tr><td>Investimento cadastrado</td><td>${fmtBRL(total.investmentValue || 0)}</td></tr>
    <tr><td>Payback estimado</td><td>${formatPaybackMonths(total.paybackMonths || 0)}</td></tr>
    <tr><td>ROI mensal</td><td>${fmtPct(total.roiMonthly || 0)}</td></tr>
    <tr><td>Margem sobre o faturamento</td><td>${fmtPct(total.margin || 0)}</td></tr>
    <tr><td>Melhor unidade financeira</td><td>${best ? `${best.workName} - ${fmtBRL(best.finance.ownResult || 0)}` : '-'}</td></tr>
  `;
  document.getElementById('generalFinanceUnitTable').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td>${row.workName}</td>
      <td>${fmtBRL(row.finance.revenue || 0)}</td>
      <td>${fmtBRL(row.finance.totalOperatingCost || 0)}</td>
      <td>${fmtBRL(row.finance.management || 0)}</td>
      <td>${fmtBRL(row.finance.p3SocietyProfit || 0)}</td>
      <td>${fmtBRL(row.finance.ubyNet || 0)}</td>
      <td>${fmtBRL(row.finance.investorDistribution || 0)}</td>
      <td>${fmtBRL(row.finance.partnerShare || 0)}</td>
      <td>${formatPaybackMonths(row.finance.paybackMonths || 0)}</td>
      <td>${fmtPct(row.finance.margin || 0)}</td>
    </tr>
  `).join('') : '<tr><td colspan="10" style="color:var(--p3-muted);text-align:center;padding:20px">Sem bases financeiras para consolidar</td></tr>';
  markOverviewRendered('financeiroGeral');
}

// ── Potência ──────────────────────────────────────────────
function getPower() {
  const v = parseFloat(document.getElementById('chargerPower').value);
  const v2 = parseFloat(document.getElementById('chargerPowerAcc').value);
  // Sincroniza ambos os inputs
  if (!isNaN(v))  document.getElementById('chargerPowerAcc').value = v;
  if (!isNaN(v2) && isNaN(v)) document.getElementById('chargerPower').value = v2;
  return isNaN(v) ? (isNaN(v2) ? 7 : v2) : v;
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

function periodWindow(monthCharges, mk, mode = selectedPeriodMode()) {
  const monthStart = monthStartDate(mk);
  const monthEnd = monthEndDate(mk);
  let end = mode === 'closed' ? monthEnd : (reportEndForCharges(monthCharges) || monthEnd);
  if (end > monthEnd) end = monthEnd;
  let start = monthStart;
  const days = Number(mode);
  if (Number.isFinite(days) && days > 0) {
    start = new Date(end.getTime() - days * 86_400_000);
    if (start < monthStart) start = monthStart;
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

function periodModeLabel(mode = selectedPeriodMode()) {
  if (mode === 'closed') return 'mes fechado';
  if (mode === 'mtd') return 'mes ate a planilha';
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
  const total = charges.length;
  const revenue = charges.reduce((sum, charge) => sum + Number(charge.revenue || 0), 0);
  const energy = charges.reduce((sum, charge) => sum + Number(charge.energyKWh || 0), 0);
  const clients = new Set(charges.map(charge => clientKeyFromCharge(charge)).filter(Boolean)).size;
  const occ = options.occ || occByInterval(charges, options.power, options.bounds);
  const cleanStats = cleanOperationStats(charges);
  const rows = dailyOperationalRows(charges, options.historyCharges || charges);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2] || {};
  const revenueDiff = Number(last.revenue || 0) - Number(prev.revenue || 0);
  const countDiff = Number(last.count || 0) - Number(prev.count || 0);
  const energyDiff = Number(last.energy || 0) - Number(prev.energy || 0);
  const occState = occ.pct < 15 ? 'bad' : (occ.pct < 30 ? 'warn' : '');
  const trendGlyph = value => value > 0 ? '&#8599;' : (value < 0 ? '&#8600;' : '&#8594;');
  const imgBolt = "url('assets/brand/v2/09_sobre_midnight.png')";
  const imgBadge = "url('assets/brand/v2/09_sobre_midnight.png')";
  const cards = [
    { title: 'Ocupacao do periodo', value: fmtPct(occ.pct), sub: 'base do periodo selecionado', trend: trendGlyph(occ.pct - 15), cls: occState, img: imgBolt },
    { title: 'Faturamento', value: fmtBRL(revenue), sub: `${signedMoney(revenueDiff)} vs dia anterior`, trend: trendGlyph(revenueDiff), cls: revenueDiff < 0 ? 'bad' : '', img: imgBadge },
    { title: 'Consumo de energia', value: fmtKWh(energy), sub: `${signedNumber(energyDiff, ' kWh')} vs dia anterior`, trend: trendGlyph(energyDiff), cls: energyDiff < 0 ? 'warn' : '', img: imgBolt },
    { title: 'Clientes atendidos', value: String(clients), sub: `${cleanStats.avgKwh.toFixed(1).replace('.', ',')} kWh/sessao valida`, trend: trendGlyph(clients), cls: '', img: imgBadge },
    { title: 'Total de transacoes', value: String(total), sub: `${signedNumber(countDiff)} vs dia anterior`, trend: trendGlyph(countDiff), cls: countDiff < 0 ? 'warn' : '', img: imgBolt }
  ];
  el.innerHTML = cards.map((card, index) => `
    <div class="visual-card ${index < 2 ? 'feature main' : ''} ${card.cls || ''}" style="--visual-img:${card.img}">
      <div class="visual-title">${card.title}</div>
      <div>
        <div class="visual-value">${card.value}</div>
        <div class="visual-sub">${card.sub}</div>
      </div>
      <div class="visual-trend">${card.trend}</div>
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
    { label: 'Energia entregue', value: fmtKWh(last.energy), diff: last.energy - previous.energy, formatter: value => signedNumber(value, ' kWh'), sub: `${last.clientCount || 0} cliente(s) no dia` },
    { label: 'Falhas do dia', value: String(last.failed || 0), diff: (last.failed || 0) - (previous.failed || 0), formatter: value => signedNumber(value), sub: 'queda em falhas e melhor' }
  ];
  el.innerHTML = metrics.map(metric => {
    const trend = trendInfo(metric.diff, metric.formatter);
    const trendClass = metric.label === 'Falhas do dia'
      ? (metric.diff < 0 ? 'up' : (metric.diff > 0 ? 'down' : 'flat'))
      : trend.cls;
    return `
      <div class="day-kpi-card">
        <div class="label">${metric.label}</div>
        <strong>${metric.value}</strong>
        <small>${metric.sub}</small>
        <span class="trend-badge ${trendClass}">${trend.arrow} ${trend.text}</span>
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
  if (startBound && endBound) {
    const cursor = new Date(startBound.getFullYear(), startBound.getMonth(), startBound.getDate(), 0, 0, 0);
    const endDay = new Date(endBound.getFullYear(), endBound.getMonth(), endBound.getDate(), 0, 0, 0);
    let guard = 0;
    while (cursor <= endDay && guard < MAX_DAILY_RANGE_DAYS) {
      const idx = cursor.getDay();
      groups[idx].dates.add(dateKeyLocal(cursor));
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
    const maxKWh = Math.max(Number(power) || 0, 0) * 24 * days;
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
  return pct < 15 ? 'occ-red' : (pct < 30 ? 'occ-yellow' : 'occ-green');
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
  const periodStart = dated.length ? new Date(Math.min(...dated.map(charge => charge.startDate))) : firstDay;
  const periodEnd = dated.length ? new Date(Math.max(...dated.map(charge => charge.startDate))) : lastDay;
  const calendarPower = Math.max(Number(options.power || getPower() || 0), 0);
  const dayOccupation = (energy = 0, dayCount = 1) => {
    const days = Math.max(Number(dayCount || 1), 1);
    const maxKWh = calendarPower * 24 * days;
    const pct = maxKWh > 0 ? Number(energy || 0) / maxKWh * 100 : 0;
    const cls = pct < 15 ? 'low' : (pct < 30 ? 'mid' : 'good');
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
        const occ = dayOccupation(item.energy, item.monthCount || 1);
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
      const occ = dayOccupation(item.energy);
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

function isFailedCharge(charge = {}) {
  const text = normalizeTextForInsight([
    charge.rawStatus,
    charge.paymentStatus,
    charge.paymentType,
    charge.failureReason
  ].filter(Boolean).join(' '));
  if (/(falha|erro|cancel|recus|negad|expir|timeout|interromp|incomplet|nao conclu|sem sucesso|failed|declin|invalid|invalido)/.test(text)) return true;
  if (/(aprov|pago|paid|approved|success|conclu|finaliz|complet)/.test(text)) return false;
  return Number(charge.energyKWh || 0) <= 0 && Number(charge.revenue || 0) <= 0;
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
    const reason = isFailedCharge(charge)
      ? safeText(charge.failureReason || charge.rawStatus || charge.paymentStatus || charge.paymentType || 'falha/erro').trim()
      : 'baixo tempo, energia zerada ou sessão não executada';
    return `<div class="metric-line"><strong>${chargeDisplayDay(charge)}</strong><span>${escapeHtml(clientDisplayName(charge))} · ${escapeHtml(reason)}</span><b class="warn">${fmtKWh(charge.energyKWh || 0)}</b></div>`;
  }).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini good"><span>kWh médio válido</span><strong>${stats.avgKwh.toFixed(1).replace('.', ',')} kWh</strong><span>${stats.executed.length} sessão(ões) executada(s)</span></div>
      <div class="metric-mini ${qualityClass}"><span>Tentativas fora da média</span><strong>${stats.removed.length}</strong><span>${fmtPct(removedShare)} da base removida do cálculo</span></div>
      <div class="metric-mini"><span>Ticket válido</span><strong>${fmtBRL(stats.avgTicket)}</strong><span>somente recargas executadas</span></div>
      <div class="metric-mini"><span>Potência média válida</span><strong>${stats.avgPower.toFixed(1).replace('.', ',')} kW</strong><span>kWh / horas conectadas válidas</span></div>
    </div>
    <div class="note">A média de kWh ignora falhas, sessões com energia zerada e tentativas muito curtas que distorcem a leitura operacional.</div>
    <div class="metric-lines">${removedLines || '<div class="metric-line"><strong>OK</strong><span>Nenhuma tentativa removida da média limpa.</span><b class="good">100%</b></div>'}</div>
  `;
}

function renderAbsentClientAlerts(prefix = 'usage', charges = []) {
  const el = document.getElementById(`${prefix}AbsentClients`);
  if (!el) return;
  const absent = recurringAbsentClients(charges, 7, 2);
  const activeRecurring = clientRecurrenceStats(charges.filter(isExecutedCharge));
  const topLines = absent.slice(0, 8).map(client => `
    <div class="metric-line">
      <strong>${escapeHtml(client.name.split(' ').slice(0, 2).join(' '))}</strong>
      <span>${client.count} recarga(s), ${fmtKWh(client.energy)}, ticket ${fmtBRL(client.avgTicket)} · última ${fmtDateOnly(client.lastDate)}${client.station ? ` · ${escapeHtml(client.station)}` : ''}</span>
      <b class="warn">${client.daysAbsent}d</b>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${absent.length ? 'warn' : 'good'}"><span>Recorrentes ausentes</span><strong>${absent.length}</strong><span>clientes sem uso nos últimos 7 dias</span></div>
      <div class="metric-mini"><span>Base recorrente</span><strong>${activeRecurring.recurring}</strong><span>${fmtPct(activeRecurring.pct)} dos clientes já voltaram</span></div>
      <div class="metric-mini"><span>Critério</span><strong>2+</strong><span>recargas válidas no histórico</span></div>
    </div>
    <div class="note">${absent.length ? 'Use esta lista para acionar clientes que já tinham hábito de uso e pararam recentemente.' : 'Nenhum cliente recorrente relevante sumiu nos últimos 7 dias da base.'}</div>
    <div class="metric-lines">${topLines || '<div class="metric-line"><strong>OK</strong><span>Clientes recorrentes continuam aparecendo no período recente.</span><b class="good">0</b></div>'}</div>
  `;
}

function newClientRows(charges = [], historyCharges = charges) {
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

function renderNewClients(prefix = 'usage', charges = [], historyCharges = charges) {
  const el = document.getElementById(`${prefix}NewClients`);
  if (!el) return;
  const rows = newClientRows(charges, historyCharges);
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
  const reasonMap = {};
  failed.forEach(charge => {
    const reason = safeText(charge.failureReason || charge.rawStatus || charge.paymentStatus || charge.paymentType || 'Sem motivo na planilha').trim();
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  });
  const topReason = topEntries(reasonMap, 1)[0];
  const failedLines = failed.slice(0, 7).map(charge => {
    const reason = safeText(charge.failureReason || charge.rawStatus || charge.paymentStatus || charge.paymentType || 'Sem motivo').trim();
    const station = safeText(charge.station || charge.workName || 'Unidade').trim();
    return `<div class="metric-line"><strong>${chargeDayLabel(charge)}</strong><span>${escapeHtml(station)} · ${escapeHtml(reason)}</span><b>${fmtKWh(charge.energyKWh || 0)}</b></div>`;
  }).join('');
  el.innerHTML = `
    <div class="metric-strip">
      <div class="metric-mini ${failed.length ? 'warn' : 'good'}"><span>Falhas 7 dias</span><strong>${failed.length}</strong><span>${recent.length} tentativa(s) recentes</span></div>
      <div class="metric-mini ${failed.length ? 'warn' : 'good'}"><span>Taxa de erro</span><strong>${recent.length ? fmtPct(failed.length / recent.length * 100) : '0,00%'}</strong><span>falhas / tentativas recentes</span></div>
      <div class="metric-mini"><span>Principal motivo</span><strong style="font-size:14px;white-space:normal">${escapeHtml(topReason?.[0] || '-')}</strong><span>${topReason ? `${topReason[1]} ocorrencia(s)` : 'sem falhas'}</span></div>
    </div>
    <div class="note">${failed.length ? 'Priorize os motivos mais repetidos antes de analisar campanha ou crescimento.' : 'Nenhuma falha detectada nos últimos 7 dias.'}</div>
    <div class="metric-lines">${failedLines || '<div class="metric-line"><strong>OK</strong><span>Nenhuma falha recente para listar.</span><b class="good">0</b></div>'}</div>
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
  renderRecentFailureDiagnostics(prefix, charges);
  renderOperationQuality(prefix, charges);
  renderNewClients(prefix, charges, historyCharges);
  renderAbsentClientAlerts(prefix, historyCharges);
  await yieldToBrowser();
  renderOperationalCalendar(prefix, charges, historyCharges, options.calendar || {});
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

function chargerKey(charge = {}) {
  const station = canonicalStationNameForWork(charge.workId, charge.station, charge.workName);
  const key = `${station || charge.station || ''}|${charge.connType || ''}`.trim().toLowerCase();
  return key || `${charge.workId || ''}|sem-identificacao`;
}

function ubyOperationKey(charge = {}) {
  return chargerKey(charge);
}

function isUbyOperationCharge(charge = {}, overrides = ubyOperationOverrides) {
  const key = ubyOperationKey(charge);
  if (Object.prototype.hasOwnProperty.call(overrides || {}, key)) return !!overrides[key];
  return chargerKind(charge) === 'dc';
}

function isUbyOperationGroup(group = {}, overrides = ubyOperationOverrides) {
  if (Object.prototype.hasOwnProperty.call(overrides || {}, group.key)) return !!overrides[group.key];
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
  workOptions().forEach(work => {
    if (workIdsWithData.has(work.id)) return;
    stationRows.push({
      workId: work.id,
      workName: work.nome || work.id,
      stationName: work.nome || work.id,
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
  let energy = 0;
  let hours = 0;
  (monthKeys || []).forEach(monthKeyValue => {
    const monthCharges = row.charges.filter(charge => chargeMonthKey(charge) === monthKeyValue);
    if (!monthCharges.length) return;
    const window = periodWindow(monthCharges, monthKeyValue, mode);
    energy += monthCharges.reduce((sum, charge) => sum + charge.energyKWh, 0);
    hours += stationAvailableHours(config, window.start, window.end);
  });
  const maxKWh = power * hours;
  return { config, power, energy, hours, maxKWh, pct: maxKWh > 0 ? energy / maxKWh * 100 : 0 };
}

function renderGeneralStationOccupancy(rows, monthKeys) {
  const target = document.getElementById('generalStationOccupancy');
  if (!target) return;
  const occupied = rows.filter(row => row.count > 0)
    .map(row => ({ row, occupancy: stationOccupancyForMonths(row, monthKeys, 'mtd') }))
    .sort((a, b) => b.occupancy.pct - a.occupancy.pct);
  target.innerHTML = occupied.length ? occupied.map(({ row, occupancy }) => `
    <div class="station-occupancy-row">
      <div class="station-occupancy-name"><strong>${row.stationName}</strong><span>${row.workName}</span></div>
      <div><div class="station-occupancy-value">${fmtPct(occupancy.pct)}</div><div class="station-occupancy-bar"><span style="width:${Math.min(occupancy.pct,100).toFixed(1)}%"></span></div></div>
      <div class="station-occupancy-meta">${occupancy.hours.toFixed(1).replace('.', ',')} h disponiveis<br>${stationScheduleLabel(occupancy.config)}</div>
      <button class="btn-open" type="button" onclick="openStationLayoutConfiguration('${escapeAttr(row.workId)}','${escapeAttr(row.stationName)}')">Configurar horario</button>
    </div>
  `).join('') : '<div class="note">Nenhum eletroposto com recargas no periodo.</div>';
}

function getUbyChargerRows(unitData = getGeneralUnitData()) {
  const rows = [];
  unitData.forEach(unit => {
    const groups = new Map();
    unit.charges.forEach(charge => {
      const stationName = canonicalStationNameForWork(unit.workId, charge.station || unit.stationName || unit.workName, unit.workName);
      const stationKey = normalizeStationForCompare(stationName);
      const groupAsSingleCharger = stationKey.includes('robert koch') || stationKey.includes('rio beach');
      const key = groupAsSingleCharger
        ? stationKey
        : String(unit.workId) === 'rio'
        ? `${normalizeStationForCompare(stationName)}|${safeText(charge.connType || '').trim().toLowerCase()}`
        : ubyOperationKey(charge);
      if (!groups.has(key)) {
        groups.set(key, {
          workId: unit.workId,
          workName: unit.workName,
          key,
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
      const hasOverride = Object.prototype.hasOwnProperty.call(unit.ubyOperationOverrides || {}, group.key);
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
  return {
    name: headerValue(row, headers, ['Nome', 'Motorista']),
    complement: headerValue(row, headers, ['Complemento']),
    email,
    phone: normalizePhone(phoneRaw),
    phoneDisplay: phoneRaw,
    chargers: customerRegistryNumber(headerValue(row, headers, ['Carregadores'])),
    transactions: customerRegistryNumber(headerValue(row, headers, ['Total de transacoes', 'Total de transações', 'Transacoes', 'Transações'])),
    energy: customerRegistryNumber(headerValue(row, headers, ['Total de kWh', 'kWh'])),
    chargeTime: headerValue(row, headers, ['Tempo total de recarga', 'Tempo de recarga']),
    spent: customerRegistryNumber(headerValue(row, headers, ['Total gasto', 'Faturamento', 'Receita']))
  };
}

function customerRegistryRowsFromSheet(rows = []) {
  const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => ['nome','motorista'].includes(normalizeHeaderName(cell))));
  const index = headerIndex >= 0 ? headerIndex : 0;
  const headers = rows[index] || [];
  return rows.slice(index + 1).filter(rowHasData).map(row => customerRegistryRow(row, headers)).filter(row => row.name || row.email || row.phone);
}

function customerRegistryIdentityKeys(row = {}) {
  return [row.email ? `email:${row.email}` : '', row.phone ? `phone:${normalizePhone(row.phone)}` : ''].filter(Boolean);
}

function mergeCustomerRegistry(incoming = [], source = 'importacao manual') {
  const current = customerRegistryStore().rows;
  const rows = [...current];
  incoming.forEach(next => {
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
    const cloud = await window.UBY_SUPABASE?.loadRechargeCustomers?.({ limit: 500 });
    if (Array.isArray(cloud?.rows)) {
      const rows = cloud.rows.map(row => ({
        customerKey: row.customer_key, name: row.name || '', email: row.email || '', phone: row.phone || '',
        complement: row.complement || '', chargers: Number(row.chargers_count || 0),
        transactions: Number(row.transactions_count || 0), energy: Number(row.energy_kwh || 0),
        chargeTime: row.charge_time_text || '', spent: Number(row.total_spent || 0), source: row.source || 'banco online'
      }));
      writeJson(CUSTOMER_REGISTRY_LOCAL_KEY, { rows, total: cloud.count, updatedAt: new Date().toISOString(), source: 'Supabase normalizado' });
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
  const email = safeText(participant.email).trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = normalizePhone(participant.phone);
  if (phone) return `phone:${phone}`;
  return `name:${normalizeHeaderName(participant.name || '')}`;
}

function clubParticipantKeys(participant = {}) {
  const canonicalName = canonicalClubPersonName(participant.name || '');
  return [
    safeText(participant.email).trim().toLowerCase(),
    normalizePhone(participant.phone),
    normalizeHeaderName(participant.name || ''),
    canonicalName ? `person:${canonicalName}` : ''
  ].filter(Boolean);
}

function canonicalClubPersonName(value = '') {
  const tokens = normalizeHeaderName(value).split(/\s+/).filter(Boolean);
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
  charges.forEach(charge => {
    const key = clientKeyFromCharge(charge);
    if (!key) return;
    if (!byClient.has(key)) {
      byClient.set(key, {
        key,
        name: charge.userName || charge.userEmail || 'Cliente sem nome',
        email: charge.userEmail || '',
        phone: charge.userPhone || '',
        revenue: 0,
        energy: 0,
        count: 0,
        lastDate: null
      });
    }
    const row = byClient.get(key);
    if (!row.phone && charge.userPhone) row.phone = charge.userPhone;
    if (!row.email && charge.userEmail) row.email = charge.userEmail;
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

function renderClub() {
  ensureClubParticipantsAutoSync();
  const unitData = getGeneralUnitData();
  const charges = getUbyOperationCharges(unitData).filter(charge => Number(charge.revenue || 0) > 0);
  const participantStore = clubParticipantsStore();
  const participants = participantStore.rows;
  const rows = enrichClubClientRows(clubClientRows(charges), participants);
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
    ? `<strong>${rows.length}</strong> participante(s) UBY com consumo pago<br>${fmtBRL(totalRevenue)} em faturamento elegivel<br>${totalPoints.toLocaleString('pt-BR')} ponto(s) gerados`
    : 'Nenhum cliente UBY com faturamento pago para pontuar ainda.';
  document.getElementById('clubHeroFormula').innerHTML =
    '<strong>Regra atual</strong><br>Somente carregadores marcados como operacao UBY entram no clube.<br>R$ 1 gasto = 1 ponto no Clube UBY.<br>Top 3 ganham 30% de desconto em alinhamento e balanceamento.<br>Todos os participantes ganham 10% em servicos da rede Muffatao Autocenter.';

  document.getElementById('clubKpis').innerHTML = `
    <div class="card"><div class="label">Participantes UBY</div><div class="value">${rows.length}</div><div class="sub">clientes com faturamento pago na operacao UBY</div></div>
    <div class="card"><div class="label">Pontos emitidos</div><div class="value">${totalPoints.toLocaleString('pt-BR')}</div><div class="sub">1 ponto por real gasto</div></div>
    <div class="card"><div class="label">Receita elegível</div><div class="value">${fmtBRL(totalRevenue)}</div><div class="sub">base do ranking</div></div>
    <div class="card"><div class="label">Com telefone</div><div class="value">${withPhone}</div><div class="sub">${rows.length ? fmtPct(withPhone / rows.length * 100) : '0,00%'} dos participantes</div></div>
    <div class="card"><div class="label">Cadastro Forms</div><div class="value">${registeredRows}</div><div class="sub">${rows.length ? fmtPct(registeredRows / rows.length * 100) : '0,00%'} do ranking cruzado</div></div>
  `;

  document.getElementById('clubRewards').innerHTML = `
    <div class="action-row"><div><strong>Top 3</strong><span>30% de desconto em alinhamento e balanceamento.</span></div><b class="good">Ativo</b></div>
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
    ? `${rows.length} participante(s) UBY<br>${fmtBRL(totalRevenue)} elegiveis<br>${totalPoints.toLocaleString('pt-BR')} ponto(s)`
    : 'Sem participantes UBY elegiveis ainda';
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
            <div class="podium-stat"><strong>${fmtBRL(slot.row.revenue)}</strong><span>periodo</span></div>
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
      <td>${fmtDT(row.lastDate)}</td>
      <td>${escapeHtml(clubBenefitForPosition(position))}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="12" style="color:var(--p3-muted);text-align:center;padding:20px">Sem clientes elegiveis no clube.</td></tr>';
}
async function toggleUbyOperation(workId, key, checked) {
  syncGeneralRecordsFromLocal();
  const db = localRechargeDb();
  const record = allRechargeRecords[workId] || db[workId];
  if (!record) return;
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

function ubyAreaOperationStart(row = {}) {
  const label = normalizeStationForCompare([row.stationName, row.station, row.workName].filter(Boolean).join(' '));
  if (label.includes('robert koch')) return new Date(2026, 5, 8, 0, 0, 0);
  const dates = (row.charges || []).map(charge => charge.startDate).filter(Boolean);
  return dates.length ? new Date(Math.min(...dates)) : new Date();
}

function ubyAreaFirstClosingDate(start) {
  if (!start || Number.isNaN(start.getTime())) return new Date();
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
}

function ubyAreaLatestClosedReport(row = {}) {
  const stationKey = normalizeStationForCompare(canonicalStationNameForWork(
    row.workId,
    row.stationName || row.station || row.workName,
    row.workName
  ));
  const reports = [...financeReportArchive, ...readLocalFinanceReports()]
    .filter(item => item?.reportType === 'partner_area'
      && item?.status === 'closed'
      && item?.workId === row.workId
      && (item?.stationKey || '') === stationKey
      && (item?.periodEnd || item?.payload?.period?.end));
  return sortFinanceReports(reports)[0] || null;
}

function ubyAreaNextOpenDate(row = {}) {
  const latest = ubyAreaLatestClosedReport(row);
  const closedEnd = parseDate(latest?.periodEnd || latest?.payload?.period?.end);
  if (closedEnd && !Number.isNaN(closedEnd.getTime())) {
    return new Date(closedEnd.getFullYear(), closedEnd.getMonth(), closedEnd.getDate() + 1, 0, 0, 0);
  }
  return ubyAreaOperationStart(row);
}

function ubyAreaCurrentCycle(row = {}, reference = new Date()) {
  const operationStart = ubyAreaOperationStart(row);
  const nextOpen = ubyAreaNextOpenDate(row);
  const target = reference < nextOpen ? nextOpen : reference;
  const close = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);
  const sameOpeningMonth = nextOpen.getFullYear() === close.getFullYear() && nextOpen.getMonth() === close.getMonth();
  const periodStart = sameOpeningMonth ? new Date(nextOpen) : new Date(close.getFullYear(), close.getMonth(), 1, 0, 0, 0);
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
  const start = ubyAreaNextOpenDate(row);
  const firstClose = ubyAreaFirstClosingDate(start);
  const cycles = [];
  let close = new Date(firstClose);
  while (close <= currentCycle.end && cycles.length < MAX_FINANCE_MONTHS) {
    const periodStart = close.getTime() === firstClose.getTime()
      ? new Date(start)
      : new Date(close.getFullYear(), close.getMonth(), 1, 0, 0, 0);
    cycles.push({
      start: periodStart,
      end: new Date(close),
      key: `${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, '0')}`,
      label: `${fmtDateOnly(periodStart)} a ${fmtDateOnly(close)}`,
      first: periodStart.getTime() === operationStart.getTime()
    });
    close = new Date(close.getFullYear(), close.getMonth() + 2, 0, 23, 59, 59);
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
    const charges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
    const settings = financeSettingsForUbyRow(row, mk);
    const entry = financeInvestorEntry(charges, settings, mk, { historyCharges: row.charges, power: workPowerById(row.workId) });
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
  const period = financeReportPeriod(mk);
  const starts = rows.map(row => ubyAreaOperationStart(row)).filter(date => date && !Number.isNaN(date.getTime()));
  const firstDate = starts.length ? new Date(Math.min(...starts)) : new Date();
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
  const period = financeReportPeriod(mk);
  const charges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
  const entry = financeInvestorEntry(charges, settings, mk, { historyCharges: row.charges, power: workPowerById(row.workId) });
  const start = ubyAreaOperationStart(row);
  const firstMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const timeline = financeMonthSeries(firstMonth <= mk ? firstMonth : mk, mk).map(monthKeyValue => {
    const monthCharges = (row.charges || []).filter(charge => chargeMonthKey(charge) === monthKeyValue);
    return financeInvestorEntry(monthCharges, financeSettingsForUbyRow(row, monthKeyValue), monthKeyValue, { historyCharges: row.charges, power: workPowerById(row.workId) });
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
  const results = months.map(mk => {
    const monthCharges = (row.charges || []).filter(charge => chargeMonthKey(charge) === mk);
    const settings = financeSettingsForUbyRow(row, mk);
    return financeForCharges(monthCharges, settings, { monthKey: mk, historyCharges: row.charges || [], power: workPowerById(row.workId) });
  });
  const totals = results.reduce((acc, result) => {
    ['revenue','extraRevenue','totalRevenue','energy','energyCost','extraCosts','management','platform','totalOperatingCost','operationNet','plannedTotalCost'].forEach(key => {
      acc[key] += Number(result[key] || 0);
    });
    acc.planningKWh += Number(result.planning?.planningKWh || 0);
    return acc;
  }, { revenue:0, extraRevenue:0, totalRevenue:0, energy:0, energyCost:0, extraCosts:0, management:0, platform:0, totalOperatingCost:0, operationNet:0, plannedTotalCost:0, planningKWh:0 });
  totals.totalCostPerKWh = totals.energy > 0 ? totals.totalOperatingCost / totals.energy : null;
  totals.plannedTotalCostPerKWh = totals.planningKWh > 0 ? totals.plannedTotalCost / totals.planningKWh : null;
  totals.resultPerKWh = totals.energy > 0 ? totals.operationNet / totals.energy : null;
  totals.operationMargin = totals.totalRevenue > 0 ? totals.operationNet / totals.totalRevenue * 100 : 0;
  return { ...row, financeMonths: months, finance: totals };
}

function renderUbyFinancialOverview(sourceRows = [], sourceMonths = [], isMonthView = true, currentMonth = '', viewLabel = '') {
  const summary = document.getElementById('ubyFinanceSummary');
  const rowsEl = document.getElementById('ubyFinanceRows');
  const periodLabel = document.getElementById('ubyFinancePeriodLabel');
  if (!summary || !rowsEl) return;
  const rows = sourceRows
    .filter(row => row.included)
    .map(row => aggregateUbyFinanceRow(row, sourceMonths, isMonthView, currentMonth))
    .sort((a, b) => Number(b.finance.operationNet || 0) - Number(a.finance.operationNet || 0));
  const total = rows.reduce((acc, row) => {
    Object.keys(acc).forEach(key => { acc[key] += Number(row.finance?.[key] || 0); });
    return acc;
  }, { revenue:0, totalRevenue:0, energy:0, totalOperatingCost:0, operationNet:0, planningKWh:0, plannedTotalCost:0 });
  const totalCostPerKWh = total.energy > 0 ? total.totalOperatingCost / total.energy : null;
  const plannedCostPerKWh = total.planningKWh > 0 ? total.plannedTotalCost / total.planningKWh : null;
  const margin = total.totalRevenue > 0 ? total.operationNet / total.totalRevenue * 100 : 0;
  if (periodLabel) periodLabel.textContent = viewLabel || (isMonthView ? monthLabel(currentMonth) : 'Acumulado');
  summary.innerHTML = `
    <div class="accountability-metric"><b>${fmtBRL(total.revenue)}</b><span>Faturamento recargas</span></div>
    <div class="accountability-metric"><b>${fmtBRL(total.totalOperatingCost)}</b><span>Custos operacionais</span></div>
    <div class="accountability-metric"><b>${fmtPerKWh(totalCostPerKWh)}</b><span>Custo efetivo por kWh</span></div>
    <div class="accountability-metric"><b>${fmtBRL(total.operationNet)}</b><span>Resultado UBY ${fmtPct(margin)}</span></div>
  `;
  rowsEl.innerHTML = rows.length ? rows.map(row => {
    const finance = row.finance;
    const resultClass = finance.operationNet >= 0 ? 'result-positive' : 'result-negative';
    return `<div class="uby-finance-row">
      <div><strong>${escapeHtml(row.stationName || row.station || row.workName)}</strong><span>${escapeHtml(row.workName)} | ${row.financeMonths.length} periodo(s) calculado(s)</span></div>
      <div class="uby-finance-cell"><b>${fmtBRL(finance.revenue)}</b><em>faturamento</em></div>
      <div class="uby-finance-cell"><b>${fmtBRL(finance.totalOperatingCost)}</b><em>custos totais</em></div>
      <div class="uby-finance-cell"><b>${fmtPerKWh(finance.totalCostPerKWh)}</b><em>custo atual</em></div>
      <div class="uby-finance-cell ${resultClass}"><b>${fmtBRL(finance.operationNet)}</b><em>resultado | ${fmtPct(finance.operationMargin)}</em></div>
      <div class="unit-actions"><button class="btn-open" type="button" onclick="openWorkReport('${escapeAttr(row.workId)}','financeiro','${escapeAttr(row.stationName || row.station)}')">Abrir financeiro</button></div>
    </div>`;
  }).join('') : '<div class="note">Nenhum carregador UBY marcado para o periodo.</div>';
  if (rows.length && !Number.isFinite(totalCostPerKWh) && Number.isFinite(plannedCostPerKWh)) {
    rowsEl.insertAdjacentHTML('beforeend', `<div class="finance-empty-guidance">Ainda nao houve venda de energia neste periodo. O custo inicial planejado da operacao esta em <strong>${fmtPerKWh(plannedCostPerKWh)}</strong>.</div>`);
  }
}

async function renderUbyOperation() {
  const renderSequence = ++overviewRenderSequence.uby;
  const sourceUnitData = getGeneralUnitData();
  const sourceRows = getUbyChargerRows(sourceUnitData);
  const sourceIncluded = sourceRows.filter(row => row.included);
  const sourceUbyCharges = sourceIncluded.flatMap(row => row.charges);
  const sourceMonths = [...new Set(sourceUbyCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const currentGeneralMonth = sourceMonths[sourceMonths.length - 1] || '';
  const generalViewMode = document.getElementById('generalViewMode')?.value || 'month';
  let isMonthView = generalViewMode !== 'accumulated' && !!currentGeneralMonth;
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
  const dcCount = included.filter(row => row.kind === 'dc').length;
  const acCount = included.filter(row => row.kind === 'ac').length;
  const totalCharges = allUbyCharges.length;
  const avgTicket = totalCharges ? revenue / totalCharges : 0;
  const cleanStats = cleanOperationStats(allUbyCharges);
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
    months.forEach(mk => {
      const monthCharges = row.charges.filter(charge => chargeMonthKey(charge) === mk);
      if (!monthCharges.length) return;
      const window = periodWindow(monthCharges, mk, 'mtd');
      windows.push(window);
      totalMaxKWh += occByInterval(monthCharges, workPowerById(row.workId), window).maxKWh;
    });
  });
  const totalOcc = totalMaxKWh > 0 ? energy / totalMaxKWh * 100 : 0;
  const firstPeriod = windows.length ? new Date(Math.min(...windows.map(window => window.start).filter(Boolean))) : firstDate;
  const lastPeriod = windows.length ? new Date(Math.max(...windows.map(window => window.end).filter(Boolean))) : lastDate;
  const viewLabel = monthFallbackToAccumulated
    ? `Acumulado UBY (sem recargas em ${monthLabel(currentGeneralMonth)})`
    : (isMonthView ? `Mes atual (${monthLabel(currentGeneralMonth)})` : 'Acumulado UBY');
  const occClass = totalOcc < 15 ? 'occ-red' : (totalOcc < 30 ? 'occ-yellow' : 'occ-green');
  const occStatus = totalOcc < 15 ? 'abaixo do objetivo minimo de 15%' : (totalOcc < 30 ? 'entre 15% e 30%, em evolucao' : 'acima de 30%, saudavel');

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
    <div class="card"><div class="label">Ticket medio UBY</div><div class="value">${fmtBRL(avgTicket)}</div><div class="sub">receita / recargas UBY</div></div>
    <div class="card"><div class="label">Total AC</div><div class="value">${acdc.acCharges}</div><div class="sub">${fmtKWh(acdc.acEnergy)} - ${fmtBRL(acdc.acRevenue)}</div></div>
    <div class="card"><div class="label">Total DC</div><div class="value">${acdc.dcCharges}</div><div class="sub">${fmtKWh(acdc.dcEnergy)} - ${fmtBRL(acdc.dcRevenue)}</div></div>
    <div class="card"><div class="label">Carregadores UBY</div><div class="value">${included.length}</div><div class="sub">${dcCount} DC / ${acCount} AC incluidos</div></div>
    <div class="card"><div class="label">Melhor unidade UBY</div><div class="value" style="font-size:18px;white-space:normal">${included[0]?.stationName || '-'}</div><div class="sub">${included[0] ? fmtBRL(included[0].revenue) : 'sem dados'}</div></div>
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
  renderUbyFinancialOverview(sourceRows, sourceMonths, isMonthView, currentGeneralMonth, viewLabel);
  await yieldToBrowser();
  if (renderSequence !== overviewRenderSequence.uby || document.getElementById('tabUby').style.display === 'none') return;
  const chartLabels = chartRows.map(row => {
    const label = row.stationName || row.workName || '-';
    return label.length > 24 ? label.slice(0, 24) + '...' : label;
  });
  renderBarChart('chartUbyRevenueUnit', chartLabels, chartRows.map(row => row.revenue), '#57B7FF', ' R$');
  renderBarChart('chartUbyEnergyUnit', chartLabels, chartRows.map(row => row.energy), '#2DBBD3', ' kWh');

  document.getElementById('ubyUnitRank').innerHTML = accessRows.length ? accessRows.slice(0, 12).map(unit => `
    <div class="unit-card">
      <div><strong>${escapeHtml(unit.stationName || unit.workName)}</strong><span>Obra: ${escapeHtml(unit.workName)} - ${unit.clients} cliente(s)</span></div>
      <div><div class="unit-value">${fmtBRL(unit.revenue)}</div><div class="unit-sub">${unit.count} recargas</div></div>
      <div><div class="unit-value">${fmtKWh(unit.energy)}</div><div class="unit-sub">${unit.kind.toUpperCase()} - ${unit.connType || 'sem conector'}</div></div>
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
  destroyChart('chartUbyMonth');
  const monthCtx = document.getElementById('chartUbyMonth');
  if (monthCtx) {
    charts['chartUbyMonth'] = new Chart(monthCtx, {
      type: 'line',
      data: {
        labels: monthData.map(row => row.label),
        datasets: [
          { label: 'Receita UBY', data: monthData.map(row => +row.revenue.toFixed(2)), borderColor: '#57B7FF', backgroundColor: 'rgba(87,183,255,.12)', tension: .35, fill: true, yAxisID: 'y' },
          { label: 'kWh UBY', data: monthData.map(row => +row.energy.toFixed(2)), borderColor: '#2DBBD3', backgroundColor: 'rgba(45,187,211,.08)', tension: .35, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8FA39A' } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#8FA39A' }, grid: { color: '#24364E' } },
          y1: { beginAtZero: true, position: 'right', ticks: { color: '#8FA39A' }, grid: { drawOnChartArea: false } },
          x: { ticks: { color: '#8FA39A' }, grid: { color: '#24364E' } }
        }
      }
    });
  }

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
}

function showGeneralWhenCurrentWorkIsEmpty() {
  if (allCharges.length) return;
  document.getElementById('tabsBar').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  showTab('uby');
}

async function renderVisibleOverviewViews() {
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
      mergeCloudRechargeRecords(cachedRecords);
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
      normalized: true
    }));
    mergeCloudRechargeRecords(records);
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
  if (document.getElementById('generalViewMode')?.value === 'accumulated') {
    await ensureAllOverviewSessionsLoaded();
  }
  await renderVisibleOverviewViews();
}

async function renderGeral() {
  const sourceUnitData = getGeneralUnitData();
  const sourceCharges = getAllGeneralCharges(sourceUnitData);
  const sourceMonths = [...new Set(sourceCharges.map(chargeMonthKey).filter(key => key !== 'unknown'))].sort();
  const currentGeneralMonth = sourceMonths[sourceMonths.length - 1] || '';
  const generalViewMode = document.getElementById('generalViewMode')?.value || 'month';
  let isGeneralMonthView = generalViewMode !== 'accumulated' && !!currentGeneralMonth;
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
    : (isGeneralMonthView ? `Mês atual (${monthLabel(currentGeneralMonth)})` : 'Acumulado');
  const viewDetail = isGeneralMonthView ? 'ocupação calculada somente sobre o mês atual' : 'histórico completo das bases salvas';

  document.getElementById('generalHeroMeta').innerHTML = totalCharges
    ? `Visão: <strong>${viewLabel}</strong><br>Unidades com base: <strong>${units}</strong><br>Periodo: <strong>${fmtDT(firstPeriod)}</strong> ate <strong>${fmtDT(lastPeriod)}</strong><br>Meses consolidados: <strong>${isGeneralMonthView ? 1 : months.length}</strong>`
    : 'Nenhuma unidade com base de recargas salva ainda.';
  document.getElementById('generalHeroFormula').innerHTML = totalCharges
    ? `<strong>${viewLabel}</strong><br>${fmtBRL(revenue)} em receita<br>${fmtKWh(energy)} entregues<br><strong style="color:#57B7FF">${totalCharges} recargas em ${units} unidade(s)</strong><br>AC: ${acdc.acCharges} recargas / DC: ${acdc.dcCharges}<br><span style="color:#A8C8BC">${viewDetail}</span>`
    : 'Suba a planilha em cada unidade para o painel geral acumular tudo.';
  document.getElementById('generalSourceLabel').textContent = totalCharges
    ? `${viewLabel}: ${units} estação(ões) com base salva - escolha uma para abrir`
    : 'Sem bases salvas para consolidar';
  const occClass = totalOcc < 15 ? 'occ-red' : (totalOcc < 30 ? 'occ-yellow' : 'occ-green');
  const occStatus = totalOcc < 15 ? 'abaixo do objetivo minimo de 15%' : (totalOcc < 30 ? 'entre 15% e 30%, em evolucao' : 'acima de 30%, saudavel');
  document.getElementById('kpiGeneral').innerHTML = `
    <div class="card"><div class="label">Ticket medio geral</div><div class="value">${fmtBRL(avgTicket)}</div><div class="sub">receita / recargas</div></div>
    <div class="card"><div class="label">Melhor unidade</div><div class="value" style="font-size:18px;white-space:normal">${stationRows[0]?.stationName || '-'}</div><div class="sub">${stationRows[0] ? fmtBRL(stationRows[0].revenue) : 'sem dados'}</div></div>
    <div class="card"><div class="label">Total AC</div><div class="value">${acdc.acCharges}</div><div class="sub">${fmtKWh(acdc.acEnergy)} - ${fmtBRL(acdc.acRevenue)}</div></div>
    <div class="card"><div class="label">Total DC</div><div class="value">${acdc.dcCharges}</div><div class="sub">${fmtKWh(acdc.dcEnergy)} - ${fmtBRL(acdc.dcRevenue)}</div></div>
    <div class="card"><div class="label">Carregadores AC</div><div class="value">${acdc.acChargers}</div><div class="sub">conectores/estacoes unicas</div></div>
    <div class="card"><div class="label">Carregadores DC</div><div class="value">${acdc.dcChargers}</div><div class="sub">conectores/estacoes unicas</div></div>
  `;
  renderVisualSummary('generalVisualSummary', charges, { occ: { pct: totalOcc, energy, power: getPower(), hours: 0, maxKWh: 0 }, historyCharges: sourceCharges });
  renderGeneralStationOccupancy(stationRows, months);
  renderGeneralDecisionCockpit(unitData, charges, stationRows);
  scheduleOverviewInsights('geral', () => renderUsageInsights(charges, 'usageGeneral', sourceCharges, { calendar: { power: calendarPower }, weekdayPower: calendarPower, weekdayBounds: { start: firstPeriod, end: lastPeriod } }));

  document.getElementById('generalUnitRank').innerHTML = rankingStationRows.length ? rankingStationRows.slice(0, 12).map(unit => `
    <div class="unit-card">
      <div><strong>${unit.stationName}</strong><span>Obra: ${unit.workName} - ${monthLabel(currentGeneralMonth) || 'mês atual'} - ${unit.clients} cliente(s)</span></div>
      <div><div class="unit-value">${fmtBRL(unit.revenue)}</div><div class="unit-sub">${unit.count} recargas</div></div>
      <div><div class="unit-value">${fmtKWh(unit.energy)}</div><div class="unit-sub">AC ${unit.acdc.acCharges} / DC ${unit.acdc.dcCharges}</div></div>
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
  destroyChart('chartGeneralMonth');
  const monthCtx = document.getElementById('chartGeneralMonth');
  if (monthCtx) {
    charts['chartGeneralMonth'] = new Chart(monthCtx, {
      type: 'line',
      data: {
        labels: monthData.map(item => item.label),
        datasets: [
          { label: 'Receita', data: monthData.map(item => +item.revenue.toFixed(2)), borderColor: '#57B7FF', backgroundColor: 'rgba(87,183,255,.12)', tension: .25, fill: true },
          { label: 'kWh', data: monthData.map(item => +item.energy.toFixed(2)), borderColor: '#FFD66B', backgroundColor: 'rgba(255,214,107,.10)', tension: .25, fill: true, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#8FA39A' } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#8FA39A' }, grid: { color: '#24364E' } },
          y1: { beginAtZero: true, position: 'right', ticks: { color: '#8FA39A' }, grid: { drawOnChartArea: false } },
          x: { ticks: { color: '#8FA39A' }, grid: { color: '#24364E' } }
        }
      }
    });
  }
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

// ══════════════════════════════════════════════════════════
//  TAB MENSAL
// ══════════════════════════════════════════════════════════
async function renderMensal() {
  const renderSequence = ++monthlyRenderSequence;
  clearTimeout(monthlyInsightsTimer);
  const mk      = document.getElementById('monthSelector').value;
  if (!mk) return;
  const monthCharges = chargesForMonth(mk);
  const window = periodWindow(monthCharges, mk);
  const charges = filterChargesByWindow(monthCharges, window);
  if (!charges.length) {
    renderVisualSummary('monthlyVisualSummary', [], { historyCharges: allCharges });
    renderWeekdayOccupancyReport('weekdayOccupancyMensal', [], getPower(), `Dinamica semanal - ${monthLabel(mk)}`, window);
    setStorageState(`Sem recargas em ${periodModeLabel(window.mode)} para <strong>${currentWorkName}</strong>.`);
    renderMonthClosing(mk);
    return;
  }

  renderHero(charges, mk, window);
  renderVisualSummary('monthlyVisualSummary', charges, { bounds: window, historyCharges: allCharges });
  renderKPIs(charges, mk, window);
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

  document.getElementById('heroMeta').innerHTML =
    `Estação: <strong>${stations.join(' · ') || '—'}</strong><br>
     Período: <strong>${fmtDT(minDate)}</strong> até <strong>${fmtDT(lastEnd)}</strong><br>
     Mês: <strong>${monthLabel(mk)}</strong>`;

  document.getElementById('heroFormula').innerHTML =
    `<strong>Ocupação real</strong><br>
     kWh carregados ÷ (potência × horas do período)<br>
     ${fmtKWh(occ.energy)} ÷ (${occ.power.toFixed(1)} kW × ${occ.hours.toFixed(1)} h)<br>
     <strong style="color:#57B7FF">= ${fmtPct(occ.pct)}</strong>`;
}

function renderKPIs(charges, mk, window) {
  const energy  = charges.reduce((s, c) => s + c.energyKWh, 0);
  const rev     = charges.reduce((s, c) => s + c.revenue, 0);
  const avgTkt  = charges.length ? rev / charges.length : 0;
  const cleanStats = cleanOperationStats(charges);
  const avgKwh  = cleanStats.avgKwh;
  const revKwh  = energy > 0 ? rev / energy : 0;
  const clients = new Set(charges.map(c => c.userEmail || c.userName)).size;
  const occ     = occByInterval(charges, undefined, window);
  const occFull = occByFullMonth(charges, mk);
  const days    = Math.max(window.hours / 24, 1);
  const dMonth  = daysInMonth(mk.split('-')[0], mk.split('-')[1]);
  const proj    = dMonth / Math.max(days, 1);
  const occClass = occ.pct < 15 ? 'occ-red' : (occ.pct < 30 ? 'occ-yellow' : 'occ-green');
  const occStatus = occ.pct < 15 ? 'abaixo do objetivo minimo de 15%' : (occ.pct < 30 ? 'entre 15% e 30%, em evolucao' : 'acima de 30%, saudavel');
  const idleValue = charges.reduce((sum, charge) => sum + Number(charge.idleValue || 0), 0);
  const failedCount = charges.filter(charge => isFailedCharge(charge)).length;
  const calendarDays = Math.max(calendarDayCount(window.start, window.end), 1);
  const avgRevenueDay = rev / calendarDays;
  const avgChargesDay = charges.length / calendarDays;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="card"><div class="label">Ticket médio</div>
      <div class="value">${fmtBRL(avgTkt)}</div>
      <div class="sub">${avgKwh.toFixed(1).replace('.',',')} kWh por sessão válida</div></div>
    <div class="card"><div class="label">R$/kWh médio</div>
      <div class="value">${fmtBRL(revKwh)}</div>
      <div class="sub">receita ÷ energia</div></div>
    <div class="card"><div class="label">Sessão válida média</div>
      <div class="value">${avgKwh.toFixed(1).replace('.',',')} kWh</div>
      <div class="sub">${cleanStats.executed.length} recarga(s) executada(s)</div></div>
    <div class="card"><div class="label">Projeção mês</div>
      <div class="value">${fmtBRL(rev * proj)}</div>
      <div class="sub">${fmtKWh(energy * proj)} se mantiver o ritmo</div></div>
    <div class="card"><div class="label">Ociosidade</div>
      <div class="value">${fmtBRL(idleValue)}</div>
      <div class="sub">valor estimado parado após recarga</div></div>
    <div class="card"><div class="label">Falhas no período</div>
      <div class="value">${failedCount}</div>
      <div class="sub">${charges.length ? fmtPct(failedCount / charges.length * 100) : '0,00%'} das tentativas</div></div>
    <div class="card"><div class="label">Média de faturamento por dia</div>
      <div class="value">${fmtBRL(avgRevenueDay)}</div>
      <div class="sub">${calendarDays} dia(s), incluindo dias sem faturamento</div></div>
    <div class="card"><div class="label">Média de recargas por dia</div>
      <div class="value">${avgChargesDay.toFixed(2).replace('.', ',')}</div>
      <div class="sub">${charges.length} recarga(s) em ${calendarDays} dia(s)</div></div>
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
    const occClass = occValue < 15 ? 'occ-red' : (occValue < 30 ? 'occ-yellow' : 'occ-green');
    const occStatus = occValue < 15 ? 'abaixo do objetivo minimo de 15%' : (occValue < 30 ? 'entre 15% e 30%, em evolucao' : 'acima de 30%, saudavel');
    occCard.className = `card kpi-feature ${occClass}`;
    const sub = occCard.querySelector('.sub');
    if (sub) sub.textContent = `${occStatus} · meta: 15% minimo / 30% ideal`;
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
      <td>${mk}${summary?.fromClosing ? ' <span style="color:var(--p3-muted);font-size:11px">(fechado)</span>' : ''}</td><td>${summary?.count || 0}</td><td>${summary?.clients || 0}</td>
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
  `;

  renderVisualSummary('accVisualSummary', allCharges, { occ: { pct: totalOcc, energy, power, hours: 0, maxKWh: 0 }, historyCharges: allCharges });

  // Gráficos simples
  renderWeekdayOccupancyReport('weekdayOccupancyAcc', allCharges, power, 'Dinamica semanal acumulada');

  const axBase = {
    x: { ticks:{color:'#8FA39A',font:{size:11}}, grid:{color:'#24364E'} },
    y: { beginAtZero:true, ticks:{color:'#8FA39A',font:{size:11}}, grid:{color:'#24364E'} }
  };

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
       <td>${d.label}${d.fromClosing ? ' <span style="color:var(--p3-muted);font-size:11px">(fechado)</span>' : ''}</td><td>${d.count}</td><td>${d.clients}</td>
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
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  showTab(name);
  if (name === 'mensal') await renderMensal();
  else if (name === 'acumulado') renderAcumulado();
  else if (name === 'geral' && overviewNeedsRender('geral')) await renderGeral();
  else if (name === 'uby') {
    ubyReportsRequested = false;
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

async function initializeRechargePage() {
  const params = new URLSearchParams(location.search);
  const requestedWorkId = String(params.get('obra') || '').trim();
  if (requestedWorkId) currentWorkId = requestedWorkId;
  await loadRechargeWorksFromCloud();
  await refreshGeneralRechargeBases();
  initWorkSelector();
  if (requestedWorkId && workOptions().some(work => work.id === requestedWorkId)) {
    currentWorkId = requestedWorkId;
    document.getElementById('workSelector').value = requestedWorkId;
    currentWorkName = workNameById(requestedWorkId, requestedWorkId);
    await loadRechargeBase(requestedWorkId);
  }
  openGeneralFinanceView();
  window.UBY_RECHARGE_RUNTIME?.markReady?.({ records: Object.keys(allRechargeRecords || {}).length });
}

document.getElementById('importMonth').value = new Date().toISOString().slice(0, 7);
document.getElementById('undoLastImportBtn').addEventListener('click', undoLastImport);
document.getElementById('clearSelectedMonthBtn').addEventListener('click', clearSelectedMonth);
document.getElementById('clearRechargeBaseBtn').addEventListener('click', clearRechargeBase);
initializeRechargePage();

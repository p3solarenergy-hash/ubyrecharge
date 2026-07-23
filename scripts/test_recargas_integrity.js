const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'obra-ev', 'recargas.html');
const bridgePath = path.join(root, 'docs', 'obra-ev', 'supabase_bridge.js');
const backupPath = path.join(root, 'docs', 'obra-ev', 'backup_guard.js');
const migrationPath = path.join(root, 'docs', 'obra-ev', 'supabase_recargas_integrity_20260714.sql');
const html = [
  fs.readFileSync(htmlPath, 'utf8'),
  fs.readFileSync(path.join(root, 'docs', 'obra-ev', 'recargas_app.js'), 'utf8')
].join('\n');
const bridge = fs.readFileSync(bridgePath, 'utf8');
const backup = fs.readFileSync(backupPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `function ${name} not found`);
  const signatureEnd = source.indexOf(') {', start);
  assert(signatureEnd >= 0, `function signature ${name} not found`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const context = {
  hydrateCharge: charge => ({ ...charge }),
  workNameById: id => id,
  normalizeHeaderName: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  console
};
vm.createContext(context);
vm.runInContext([
  extractFunction(html, 'monthKey'),
  extractFunction(html, 'daysInMonth'),
  extractFunction(html, 'monthCanBeClosed'),
  extractFunction(html, 'rechargeRecordHasData'),
  extractFunction(html, 'updatedAtMs'),
  extractFunction(html, 'hydratedRechargeRecord'),
  extractFunction(html, 'expectedRechargeCount'),
  extractFunction(html, 'mergeRechargeRecord'),
  extractFunction(html, 'canonicalClubPersonName')
].join('\n'), context);

assert.strictEqual(context.monthCanBeClosed('2026-07', new Date(2026, 6, 18)), false, 'current month must remain partial before its last day');
assert.strictEqual(context.monthCanBeClosed('2026-07', new Date(2026, 6, 31)), true, 'current month may close on its last day');
assert.strictEqual(context.monthCanBeClosed('2026-06', new Date(2026, 6, 18)), true, 'past months may be closed');
assert.strictEqual(context.monthCanBeClosed('2026-08', new Date(2026, 6, 18)), false, 'future months must not be closed');

assert.strictEqual(
  context.canonicalClubPersonName('Douglas Hugo De Oliveira Oliveira'),
  context.canonicalClubPersonName('Douglas Hugo de Oliveira'),
  'a repeated surname from the platform must still match the same club participant'
);

assert.strictEqual(
  context.rechargeRecordHasData({ summary: { charges: 36 } }),
  true,
  'a cloud summary count must keep the work eligible before details finish loading'
);

const charges = Array.from({ length: 36 }, (_, index) => ({ id: index + 1 }));
const fullCloud = {
  workId: 'mercado-santarem-centro',
  charges,
  files: [{ name: 'jardins.xlsx' }],
  summary: { charges: 36, revenue: 447.8 },
  updatedAt: '2026-07-13T19:06:00Z'
};
const compactLocal = {
  workId: 'mercado-santarem-centro',
  charges: [],
  files: [],
  localCompact: true,
  summary: { charges: 36, revenue: 447.8 },
  updatedAt: '2026-07-13T20:00:00Z'
};

let merged = context.mergeRechargeRecord(fullCloud, compactLocal, 'local');
assert.strictEqual(merged.charges.length, 36, 'compact local cache must not erase cloud details');

merged = context.mergeRechargeRecord(compactLocal, fullCloud, 'cloud');
assert.strictEqual(merged.charges.length, 36, 'full cloud base must replace compact cache');

const unsyncedLocal = {
  ...fullCloud,
  charges: [...charges, { id: 37 }],
  summary: { charges: 37, revenue: 460 },
  cloudSyncPending: true,
  updatedAt: '2026-07-13T21:00:00Z'
};
merged = context.mergeRechargeRecord(unsyncedLocal, fullCloud, 'cloud');
assert.strictEqual(merged.charges.length, 37, 'a newer full local base must survive until it can be synchronized');

const legacyLocal = { ...unsyncedLocal, cloudSyncPending: false };
merged = context.mergeRechargeRecord(legacyLocal, fullCloud, 'cloud');
assert.strictEqual(merged.charges.length, 36, 'cloud must replace a stale legacy cache that has no pending write');

const summaryOnly = { ...compactLocal, summaryOnly: true, localCompact: false };
merged = context.mergeRechargeRecord(fullCloud, summaryOnly, 'cloud-summary');
assert.strictEqual(merged.charges.length, 36, 'summary refresh must preserve detailed charges');

const clearedCloud = {
  workId: 'mercado-santarem-centro',
  charges: [],
  files: [],
  summary: { charges: 0, clearedAt: '2026-07-14T00:00:00Z' },
  updatedAt: '2026-07-14T00:00:00Z'
};
merged = context.mergeRechargeRecord(fullCloud, clearedCloud, 'cloud');
assert.strictEqual(merged.charges.length, 0, 'newer explicit cloud clear must remain authoritative');

assert(html.includes('const nextRecords = { ...allRechargeRecords };'), 'local sync must merge instead of replace');
assert(!html.includes("selector.addEventListener('change'"), 'work selector must not accumulate handlers');
assert(html.includes('selector.onchange = async () =>'), 'work selector must use one idempotent handler');
assert.strictEqual((html.match(/allRechargeRecords = \{\};/g) || []).length, 1, 'quota fallback must not erase in-memory cloud bases');
assert(html.includes('Gravacao vazia bloqueada'), 'ordinary empty saves must be blocked');
assert(html.includes('record.cloudSyncPending = true;'), 'local writes must be marked pending before cloud synchronization');
assert(html.includes('record.cloudSyncPending = false;'), 'successful cloud writes must clear the pending marker');
assert(html.includes('clearReason: emptyRecord.mutationIntent'), 'explicit empty saves must carry a server-verifiable reason');
assert(html.includes("mutationIntent: 'remove_file'"), 'file removal must be an explicit audited mutation');
assert(html.includes("removeFile('${escapeAttr(fileKey)}','${escapeAttr(name)}')"), 'file chips must remove one import by its stable key');
assert(html.includes('rechargeImportStationProfile'), 'imports must summarize source stations before saving');
assert(html.includes('confirmRechargeStationMismatch'), 'station mismatches must require explicit user confirmation');
assert(html.includes('charge.rawStation || charge.station'), 'station validation must prefer the original platform station name');
assert(html.includes('derivedFiles = new Map()'), 'legacy bases must rebuild visible attached-file metadata from charges');
assert(bridge.includes('existingCharges > 0 && !explicitEmptyIntents.has(mutationIntent)'), 'cloud must reject accidental empty overwrite');
assert(bridge.includes('"remove_file"'), 'cloud must allow an explicit last-file removal');
assert(!bridge.includes('...(existing.resumo || {}),\n      ...incomingSummary'), 'metadata saves must not replace operational summary fields');
assert(bridge.includes('const existingSummary = existing.resumo || {};'), 'metadata saves must start from the authoritative cloud summary');
assert(bridge.includes('stationAvailability: payload?.stationAvailability'), 'station schedules must persist in cloud metadata');
assert(!html.includes('duplicateGeneralLabels'), 'the general dashboard must not create duplicated KPI cards');
assert(html.includes('stationAvailableHours(config, window.start, window.end)'), 'general occupancy must use station availability windows');
assert(html.indexOf('id="generalUnitRank"') < html.indexOf('id="usageGeneralDayCompare"'), 'unit ranking must stay near the top of the general dashboard');
assert(html.indexOf('id="generalStationOccupancy"') > html.indexOf('id="generalUnitTable"'), 'station schedule configuration must stay at the end of the general dashboard');
assert(!html.includes('await window.UBY_SUPABASE.loadAllRechargeBases()'), 'startup must not download every full base in one response');
assert(html.includes('limit: OVERVIEW_PAGE_SIZE'), 'normalized sessions must load in bounded pages');
assert(html.includes('from: currentMonthStart'), 'startup must limit normalized sessions to the current month');
assert(bridge.includes('replace_recharge_sessions'), 'normalized session replacement must be transactional');
assert(html.includes('canonicalClubPersonName'), 'club participants must support conservative normalized-name matching');
assert(html.includes('person:${canonicalName}'), 'club identity keys must include the canonical participant name');
assert(html.includes('monthlyInsightsTimer = setTimeout'), 'monthly secondary insights must not block the primary dashboard');
assert(!html.includes('else await window.UBY_SUPABASE.saveRechargeBase(workId, record)'), 'metadata updates must never fall back to a full recharge overwrite');
assert(!html.includes('else if (window.UBY_SUPABASE?.saveRechargeBase)'), 'financial settings must never fall back to a full recharge overwrite');
assert(bridge.includes('async function loadRechargeWorks()'), 'works must be loaded from the shared database');
assert(backup.includes('const MAX_BACKUPS = 5;'), 'browser backups must be bounded');
assert(backup.includes('"uby-recargas-db-v1"'), 'heavy cloud-backed recharge cache must be excluded from automatic browser backups');
assert(migration.includes('guard_recharge_base_integrity'), 'database migration must reject accidental empty overwrites');
assert(migration.includes('obra_recargas_base_obra_id_fkey'), 'recharge bases must remain linked to an existing work');

console.log('recargas integrity tests ok');

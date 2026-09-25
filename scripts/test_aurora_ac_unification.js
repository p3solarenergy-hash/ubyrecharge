const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'obra-ev', 'recargas_app.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist`);
  const bodyStart = source.indexOf(') {', start) + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} must be complete`);
}

const context = {
  safeText: value => String(value == null ? '' : value),
  normalizeStationForCompare: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  normalizeHeaderName: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
  workOptions: () => [],
  isRobertKochWorkId: () => false,
  isRobertKochCandidateText: () => false,
  normalizePhone: value => String(value || '').replace(/\D+/g, ''),
  parseDate: value => value ? new Date(value) : null,
  currentWorkId: '',
  currentWorkName: ''
};
vm.createContext(context);
vm.runInContext([
  extractFunction('isAuroraAcCandidateText'),
  extractFunction('isUnifiedAuroraAcStation'),
  extractFunction('canonicalStationNameForWork'),
  extractFunction('rechargePersonIdentity'),
  extractFunction('rechargeUniqueKey'),
  extractFunction('preferredRechargeVersion'),
  extractFunction('dedupeChargesByUniqueKey'),
  extractFunction('mergeUnifiedAuroraAcUbyRows')
].join('\n'), context);

const canonical = context.canonicalStationNameForWork('aurora-a', 'AURORA AC', 'Shopping Aurora');
assert.strictEqual(canonical, 'UBY RECHARGE - SHOPPING AURORA AC');

const rows = [
  {
    workId: 'aurora-a', workName: 'AURORA AC', station: canonical, connType: 'AC Type 2',
    charges: [{ id: 'aurora-1', station: canonical, workId: 'aurora-a', startDate: new Date('2026-09-01T10:00:00-03:00'), energyKWh: 9.09, revenue: 16.27, userEmail: 'a@uby.com' }],
    energy: 9.09, revenue: 16.27, clients: 1, included: false
  },
  {
    workId: 'aurora-b', workName: 'AURORA AC', station: canonical, connType: 'AC Type 2',
    charges: [{ id: 'aurora-2', station: canonical, workId: 'aurora-b', startDate: new Date('2026-09-01T11:00:00-03:00'), energyKWh: 1.6, revenue: 2.87, userEmail: 'b@uby.com' }],
    energy: 1.6, revenue: 2.87, clients: 1, included: false
  }
];
const merged = context.mergeUnifiedAuroraAcUbyRows(rows);
assert.strictEqual(merged.length, 1, 'two Aurora source rows must render as one UBY AC charger');
assert.strictEqual(merged[0].included, true, 'Aurora AC must be inside the UBY operation by default');
assert.strictEqual(merged[0].kind, 'ac', 'the unified Aurora charger must remain AC');
assert.strictEqual(merged[0].charges.length, 2, 'both source charges must remain visible in the unified row');
assert.strictEqual(Number(merged[0].energy.toFixed(2)), 10.69, 'Aurora energy must be summed');
assert.strictEqual(Number(merged[0].revenue.toFixed(2)), 19.14, 'Aurora revenue must be summed');

console.log('Aurora AC unification tests ok');

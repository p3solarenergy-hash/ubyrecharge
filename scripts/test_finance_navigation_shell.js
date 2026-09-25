const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'docs', 'obra-ev', 'financeiro.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'docs', 'obra-ev', 'recargas_app.js'), 'utf8');

// The dedicated financial page must expose independent views. The underlying
// financial rules remain shared; only their rendering is deferred by view.
['result', 'commitments', 'cash', 'investors'].forEach(view => {
  assert(page.includes(`data-finance-view="${view}"`), `missing ${view} navigation`);
  assert(page.includes(`id="financeView-${view}"`), `missing ${view} workspace`);
});

assert(app.includes('function activateFinanceView'), 'missing finance view controller');
assert(app.includes('function bindFinanceNavigation'), 'missing finance navigation binding');
assert(app.includes('function renderFinanceView'), 'missing deferred finance view renderer');

// The consolidated DRE must stay compact: investor information belongs in the
// top KPI strip, while cost composition is rendered as a readable breakdown
// rather than a large donut chart.
assert(page.includes('id="costCompositionSummary"'), 'missing cost composition summary');
assert(!page.includes('id="costCompositionPie"'), 'legacy donut chart is still present');
assert(app.includes('function renderFinanceCostComposition'), 'missing cost composition renderer');
assert(app.includes('POOL DOS COTISTAS'), 'missing investor pool KPI');
assert(!app.includes('Apuração por aporte</span><strong>Mensal</strong>'), 'legacy duplicated DRE sidebar is still present');
assert(app.includes('finance-cost-share'), 'missing cost share of revenue indicator');

console.log('finance navigation shell tests ok');

(function (global) {
  'use strict';

  var locale = 'pt-BR';
  var company = {
    legalName: 'UBY RECHARGE LTDA',
    cnpj: '66.737.561/0001-86',
    location: 'Londrina - PR'
  };
  var reportAssetBase = (function () {
    if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
      return document.currentScript.src.replace(/[^/]+(?:\?.*)?$/, '');
    }
    return 'https://p3solarenergy-hash.github.io/ubyrecharge/obra-ev/';
  })();

  function num(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function brl(value) {
    return num(value).toLocaleString(locale, { style: 'currency', currency: 'BRL' });
  }

  function decimal(value, digits) {
    return num(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function kwh(value) {
    return decimal(value, 2) + ' kWh';
  }

  function pct(value) {
    return decimal(value, 2) + '%';
  }

  function perKwh(value) {
    return value == null || !Number.isFinite(Number(value)) ? '-' : brl(value) + '/kWh';
  }

  function count(value) {
    return Math.round(num(value)).toLocaleString(locale);
  }

  function payback(value) {
    var months = num(value);
    if (!months) return '-';
    if (months < 12) return decimal(months, 1) + ' meses';
    return decimal(months / 12, 1) + ' anos';
  }

  function statusLabel(status) {
    return status === 'closed' ? 'Fechado' : 'Parcial';
  }

  function reportDate(value) {
    var text = String(value == null ? '' : value).trim();
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    var br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return br[1] + '/' + br[2] + '/' + br[3];
    return text;
  }

  function reportPeriod(meta) {
    var start = reportDate(meta && meta.periodStart);
    var end = reportDate(meta && meta.periodEnd);
    if (start && end) return start === end ? start : start + ' a ' + end;
    return String(meta && meta.period || '-');
  }

  function reportCss() {
    return `
      @page{size:A4;margin:12mm}
      *{box-sizing:border-box}
      body{margin:0;background:#fff;color:#10233b;font:11px/1.45 Arial,Helvetica,sans-serif}
      .toolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;padding:10px 0;background:#fff}
      .toolbar button{border:0;border-radius:6px;background:#2d7ff9;color:#fff;padding:9px 14px;font-weight:800;cursor:pointer}
      .report{max-width:1080px;margin:0 auto}
      .header{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;padding:22px 24px;background:#0a1628;color:#fff;border-bottom:5px solid #00ff85}
      .company-brand{display:flex;align-items:center;gap:14px;margin-bottom:17px}
      .brand-logo-crop{position:relative;width:176px;height:56px;overflow:hidden;flex:0 0 auto}
      .brand-logo-crop img{position:absolute;width:252px;max-width:none;height:auto;left:-3px;top:50%;transform:translateY(-50%)}
      .company-data{display:grid;gap:2px;color:#d9e3ef;font-size:8px;line-height:1.35}
      .company-data strong{color:#fff;font-size:10px;letter-spacing:.06em}
      .company-data span:first-of-type{color:#00ff85;font-weight:800}
      .eyebrow{color:#00e5ff;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}
      h1{margin:6px 0 8px;font-size:25px;line-height:1.12}
      .meta{color:#c9d9e9;line-height:1.55}
      .badge{border:1px solid #00ff85;border-radius:999px;padding:6px 10px;color:#00ff85;font-weight:800;white-space:nowrap}
      .period-banner{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:11px 22px;background:#e9fff5;border:1px solid #8ce8bd;border-top:0;color:#12613d}
      .period-banner span{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      .period-banner strong{font-size:14px;color:#0c2440}
      .section{padding:18px 22px 0}
      .section-title{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:0 0 10px;padding-bottom:7px;border-bottom:2px solid #dce9f6}
      .section-title h2{margin:0;color:#0c2440;font-size:15px}
      .section-title span{color:#63788e;font-size:9px;text-align:right}
      .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:18px 22px 0}
      .metric{min-height:70px;padding:11px 12px;border:1px solid #d9e5f1;border-radius:8px;background:#f3f7fb}
      .metric b{display:block;color:#1976dc;font-size:18px;line-height:1.12}
      .metric span{display:block;margin-top:5px;color:#5f7488;font-size:8px;font-weight:800;text-transform:uppercase}
      .metric.highlight{background:#eaf4ff;border-color:#9ccfff}
      .metric.positive b{color:#0a9c5b}.metric.negative b{color:#d13f4f}
      .split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .panel{border:1px solid #dce6f0;border-radius:8px;overflow:hidden}
      .panel h3{margin:0;padding:10px 12px;background:#edf4fb;color:#174f82;font-size:11px;text-transform:uppercase}
      table{width:100%;border-collapse:collapse}
      th{padding:8px;background:#edf4fb;color:#28577f;font-size:8px;text-align:left;text-transform:uppercase}
      td{padding:8px;border-bottom:1px solid #e0e8f1;vertical-align:top}
      tbody tr:last-child td{border-bottom:0}
      td.value{text-align:right;font-weight:800;white-space:nowrap}
      .total-row td{background:#f3f7fb;font-weight:900;color:#123d66}
      .grand-total{display:flex;justify-content:space-between;gap:20px;margin:14px 22px 0;padding:14px 16px;background:#eaf4ff;border-left:5px solid #2d7ff9;font-size:16px;font-weight:900}
      .timeline-bars{display:grid;gap:7px;margin-bottom:12px}
      .timeline-bar{display:grid;grid-template-columns:78px 1fr 90px;gap:8px;align-items:center}
      .timeline-bar span{font-size:9px;color:#536b82}
      .track{height:8px;border-radius:999px;background:#e2ebf4;overflow:hidden}
      .fill{height:100%;border-radius:999px;background:#2d7ff9}
      .timeline-bar b{text-align:right;color:#174f82;font-size:9px}
      .note{margin:14px 22px 0;padding:10px 12px;border-left:4px solid #f0a528;background:#fff7e3;color:#664d13}
      .foot{margin:18px 22px 0;padding:12px 0;border-top:1px solid #dce6f0;color:#6a7d90;font-size:8px}
      .foot-company{display:block;margin-bottom:4px;color:#0a1628;font-weight:900;letter-spacing:.04em}
      .page-break{break-before:page;page-break-before:always}
      .avoid{break-inside:avoid;page-break-inside:avoid}
      @media(max-width:760px){.header{grid-template-columns:1fr}.company-brand{align-items:flex-start;flex-direction:column}.metrics{grid-template-columns:1fr 1fr}.split{grid-template-columns:1fr}.section{overflow-x:auto}}
      @media print{.toolbar{display:none}.report{max-width:none}.header{grid-template-columns:1fr auto}.company-brand{align-items:center;flex-direction:row}.split{grid-template-columns:1fr 1fr}.header,.period-banner,.metric,.panel,.grand-total,.timeline-bar{break-inside:avoid;page-break-inside:avoid}.section{padding-left:0;padding-right:0}.metrics{padding-left:0;padding-right:0}.grand-total,.note,.foot{margin-left:0;margin-right:0}}
    `;
  }

  function shell(title, body, options) {
    var settings = options || {};
    var printScript = settings.printAfter ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script>' : '';
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + reportCss() + '</style></head><body><div class="toolbar"><button onclick="window.print()">Salvar como PDF / imprimir</button></div>' + body + printScript + '</body></html>';
  }

  function companyIdentity() {
    return '<div class="company-brand"><div class="brand-logo-crop"><img src="' + esc(reportAssetBase + 'assets/brand/v2/02_versao_dark.png') + '" alt="UBY Recharge"></div><div class="company-data"><strong>' + esc(company.legalName) + '</strong><span>CNPJ ' + esc(company.cnpj) + '</span><span>' + esc(company.location) + '</span></div></div>';
  }

  function reportFoot(text) {
    return '<div class="foot"><span class="foot-company">' + esc(company.legalName) + ' | CNPJ ' + esc(company.cnpj) + ' | ' + esc(company.location) + '</span>' + esc(text) + '</div>';
  }

  function header(model, eyebrow, title) {
    var meta = model.report || {};
    return '<div class="header"><div>' + companyIdentity() + '<div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1><div class="meta"><strong>' + esc(meta.station || meta.scope || '-') + '</strong><br>' + (meta.work ? 'Obra: ' + esc(meta.work) + '<br>' : '') + 'Gerado em ' + esc(meta.generatedAt || '-') + '</div></div><div class="badge">' + esc(statusLabel(meta.status)) + (meta.version ? ' - versao ' + esc(meta.version) : '') + '</div></div><div class="period-banner"><span>Periodo do relatorio</span><strong>' + esc(reportPeriod(meta)) + '</strong></div>';
  }

  function metrics(items) {
    return '<div class="metrics">' + (items || []).map(function (item) {
      return '<div class="metric ' + esc(item.className || '') + '"><b>' + esc(item.value) + '</b><span>' + esc(item.label) + '</span></div>';
    }).join('') + '</div>';
  }

  function rows(items, columns) {
    return (items || []).map(function (item) {
      return '<tr>' + columns.map(function (column) {
        var value = typeof column.value === 'function' ? column.value(item) : item[column.value];
        return '<td class="' + esc(column.className || '') + '">' + (column.raw ? String(value == null ? '' : value) : esc(value == null ? '-' : value)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function timelineBars(items, valueKey, formatter) {
    var max = Math.max.apply(Math, [1].concat((items || []).map(function (item) { return Math.abs(num(item[valueKey])); })));
    return '<div class="timeline-bars">' + (items || []).map(function (item) {
      var width = Math.max(Math.abs(num(item[valueKey])) / max * 100, num(item[valueKey]) ? 3 : 0);
      return '<div class="timeline-bar"><span>' + esc(item.label || item.period || '-') + '</span><div class="track"><div class="fill" style="width:' + width.toFixed(2) + '%"></div></div><b>' + esc(formatter(num(item[valueKey]))) + '</b></div>';
    }).join('') + '</div>';
  }

  function areaReport(model, options) {
    var current = model.current || {};
    var accumulated = model.accumulated || {};
    var timeline = model.timeline || [];
    var mode = current.transferMode === 'net' ? 'Lucro liquido' : 'Faturamento bruto';
    var body = '<div class="report">' + header(model, 'UBY Recharge - parceiro da area', 'Prestacao de contas do ponto') +
      metrics([
        { value: brl(current.revenue), label: 'Faturamento do periodo', className: 'highlight' },
        { value: kwh(current.energy), label: 'Energia consumida' },
        { value: brl(current.energyCost), label: 'Reembolso de energia' },
        { value: brl(current.partnerTotal), label: 'Total para a area', className: 'positive' }
      ]) +
      '<div class="section"><div class="section-title"><h2>Composicao do fechamento</h2><span>Valores do periodo selecionado</span></div><div class="split"><div class="panel"><h3>Energia</h3><table><tbody>' +
      '<tr><td>Energia consumida</td><td class="value">' + esc(kwh(current.energy)) + '</td></tr>' +
      '<tr><td>Tarifa de energia</td><td class="value">' + esc(perKwh(current.energyRate)) + '</td></tr>' +
      '<tr class="total-row"><td>Custo / reembolso</td><td class="value">' + esc(brl(current.energyCost)) + '</td></tr>' +
      '</tbody></table></div><div class="panel"><h3>Participacao da area</h3><table><tbody>' +
      '<tr><td>Regra de repasse</td><td class="value">' + esc(mode) + '</td></tr>' +
      '<tr><td>Percentual contratado</td><td class="value">' + esc(pct(current.sharePct)) + '</td></tr>' +
      '<tr><td>Base do percentual</td><td class="value">' + esc(brl(current.shareBase)) + '</td></tr>' +
      '<tr class="total-row"><td>Participacao</td><td class="value">' + esc(brl(current.areaShare)) + '</td></tr>' +
      '</tbody></table></div></div></div>' +
      '<div class="grand-total"><span>Total a repassar no periodo</span><span>' + esc(brl(current.partnerTotal)) + '</span></div>' +
      '<div class="section avoid"><div class="section-title"><h2>Acumulado do ponto</h2><span>Do inicio da operacao ate este fechamento</span></div>' + metrics([
        { value: brl(accumulated.revenue), label: 'Faturamento acumulado' },
        { value: kwh(accumulated.energy), label: 'Energia acumulada' },
        { value: brl(accumulated.energyCost), label: 'Energia reembolsada' },
        { value: brl(accumulated.partnerTotal), label: 'Total acumulado para area', className: 'positive' }
      ]) + '</div>' +
      '<div class="section avoid"><div class="section-title"><h2>Linha do tempo mensal</h2><span>Fechamentos preservados por competencia</span></div>' + timelineBars(timeline, 'partnerTotal', brl) +
      '<table><thead><tr><th>Periodo</th><th>Faturamento</th><th>Energia</th><th>R$/kWh</th><th>% area</th><th>Participacao</th><th>Total area</th></tr></thead><tbody>' + rows(timeline, [
        { value: 'label' }, { value: function (item) { return brl(item.revenue); }, className: 'value' },
        { value: function (item) { return kwh(item.energy); }, className: 'value' },
        { value: function (item) { return perKwh(item.energyRate); }, className: 'value' },
        { value: function (item) { return pct(item.sharePct); }, className: 'value' },
        { value: function (item) { return brl(item.areaShare); }, className: 'value' },
        { value: function (item) { return brl(item.partnerTotal); }, className: 'value' }
      ]) + '</tbody></table></div>' +
      (current.notes ? '<div class="note"><strong>Observacao:</strong> ' + esc(current.notes) + '</div>' : '') +
      reportFoot('Relatorio destinado ao parceiro da area. Conferir tarifa de energia, percentual contratual e documentos fiscais antes do envio final.') + '</div>';
    return shell('Prestacao de contas - ' + (model.report && model.report.station || 'UBY'), body, options);
  }

  function itemTable(title, items, total, totalLabel) {
    return '<div class="panel"><h3>' + esc(title) + '</h3><table><thead><tr><th>Item</th><th>Regra</th><th>Valor</th><th>R$/kWh efetivo</th></tr></thead><tbody>' + rows(items || [], [
      { value: 'label' }, { value: 'rule' },
      { value: function (item) { return brl(item.amount); }, className: 'value' },
      { value: function (item) { return perKwh(item.actualPerKWh); }, className: 'value' }
    ]) + '<tr class="total-row"><td colspan="2">' + esc(totalLabel) + '</td><td class="value">' + esc(brl(total)) + '</td><td></td></tr></tbody></table></div>';
  }

  function investorCapitalTimeline(timeline, accumulated) {
    var investment = num(accumulated && (accumulated.paybackInvestmentValue != null ? accumulated.paybackInvestmentValue : accumulated.investmentValue));
    var recovered = 0;
    var distribution = 0;
    var rows = (timeline || []).map(function (item) {
      var paybackBase = num(item && (item.paybackBase != null ? item.paybackBase : item.result && item.result.paybackBase));
      var investorDistribution = num(item && (item.finalDistribution != null ? item.finalDistribution : item.investorDistribution));
      recovered += paybackBase;
      distribution += investorDistribution;
      return {
        label: item && item.label || '-',
        paybackBase: paybackBase,
        investorDistribution: investorDistribution,
        cumulativePayback: recovered,
        cumulativeDistribution: distribution,
        remainingInvestment: investment > 0 ? Math.max(investment - recovered, 0) : 0
      };
    });
    var averagePayback = rows.length ? recovered / rows.length : 0;
    return {
      investment: investment,
      recovered: recovered,
      distribution: distribution,
      remainingInvestment: investment > 0 ? Math.max(investment - recovered, 0) : 0,
      recoveredPct: investment > 0 ? recovered / investment * 100 : 0,
      roiAccumulated: investment > 0 ? recovered / investment * 100 : 0,
      paybackMonths: investment > 0 && averagePayback > 0 ? investment / averagePayback : 0,
      rows: rows
    };
  }

  function investorReport(model, options) {
    var current = model.current || {};
    var accumulated = model.accumulated || {};
    var timeline = model.timeline || [];
    var units = model.units || [];
    var costItems = model.costItems || [];
    var revenueItems = model.revenueItems || [];
    var capital = investorCapitalTimeline(timeline, accumulated);
    var externalSociety = current.operationModel === 'p3_society';
    var thirdPartyManagement = current.operationModel === 'third_party_management';
    var directPartnerModel = externalSociety || current.operationModel === 'management_only' || thirdPartyManagement;
    var partnerName = model.report && model.report.partnerName || 'socio investidor';
    var partnerPct = Math.max(100 - num(current.settings && current.settings.p3SocietyPct), 0);
    var distributionLabel = externalSociety
      ? 'Distribuicao ao socio investidor ' + partnerName
      : current.operationModel === 'management_only'
        ? 'Lucro distribuido diretamente ao parceiro ' + partnerName
        : thirdPartyManagement
          ? 'Lucro distribuido diretamente ao parceiro ' + partnerName
        : 'Distribuicao final aos investidores';
    var paybackCapitalLabel = externalSociety ? 'Aporte P3 considerado no payback' : 'Investimento considerado';
    var reportAudience = externalSociety ? 'UBY Recharge - parceria' : ((current.operationModel === 'management_only' || thirdPartyManagement) ? 'P3 gestao e UBY Recharge' : 'UBY Recharge - investidores');
    var body = '<div class="report">' + header(model, reportAudience, 'Relatorio de desempenho e resultado') +
      metrics([
        { value: pct(current.occupancyPct), label: 'Ocupacao do periodo', className: current.occupancyPct >= num(current.targetOccPct) ? 'positive' : 'negative' },
        { value: brl(current.totalRevenue), label: 'Receitas totais', className: 'highlight' },
        { value: kwh(current.energy), label: 'Energia vendida' },
        { value: brl(current.operationNet), label: 'Resultado operacional', className: current.operationNet >= 0 ? 'positive' : 'negative' },
        { value: count(current.charges), label: 'Recargas' },
        { value: count(current.clients), label: 'Clientes' },
        { value: perKwh(current.totalCostPerKWh), label: 'Custo efetivo por kWh' },
        { value: pct(current.operationMargin), label: 'Margem operacional', className: current.operationMargin >= 0 ? 'positive' : 'negative' }
      ]) +
      '<div class="section"><div class="section-title"><h2>Resultado do periodo</h2><span>Receitas, custos e distribuicao</span></div><div class="split"><div class="panel"><h3>Demonstrativo</h3><table><tbody>' +
      '<tr><td>Faturamento das recargas</td><td class="value">' + esc(brl(current.revenue)) + '</td></tr>' +
      '<tr><td>Receitas adicionais</td><td class="value">' + esc(brl(current.extraRevenue)) + '</td></tr>' +
      '<tr class="total-row"><td>Receitas totais</td><td class="value">' + esc(brl(current.totalRevenue)) + '</td></tr>' +
      '<tr><td>Gestao P3</td><td class="value">' + esc(brl(current.management)) + '</td></tr>' +
      (thirdPartyManagement ? '<tr><td>Royalty de marca UBY</td><td class="value">' + esc(brl(current.ubyRoyalty)) + '</td></tr>' : '') +
      '<tr><td>Custos operacionais</td><td class="value">' + esc(brl(current.totalOperatingCost)) + '</td></tr>' +
      '<tr class="total-row"><td>Resultado operacional</td><td class="value">' + esc(brl(current.operationNet)) + '</td></tr>' +
      '</tbody></table></div><div class="panel"><h3>Indicadores de capital</h3><table><tbody>' +
      (externalSociety ? '<tr><td>Investimento total da parceria</td><td class="value">' + esc(brl(current.investmentValue)) + '</td></tr>' +
        '<tr><td>Aporte P3 (' + esc(pct(num(current.settings && current.settings.p3SocietyPct))) + ')</td><td class="value">' + esc(brl(current.p3InvestmentValue)) + '</td></tr>' +
        '<tr><td>Aporte ' + esc(partnerName) + ' (' + esc(pct(partnerPct)) + ')</td><td class="value">' + esc(brl(current.partnerInvestmentValue)) + '</td></tr>' : '') +
      '<tr><td>' + esc(paybackCapitalLabel) + '</td><td class="value">' + esc(brl(current.paybackInvestmentValue != null ? current.paybackInvestmentValue : current.investmentValue)) + '</td></tr>' +
      '<tr><td>ROI do periodo</td><td class="value">' + esc(pct(current.roiMonthly)) + '</td></tr>' +
      '<tr><td>Payback estimado</td><td class="value">' + esc(payback(current.paybackMonths)) + '</td></tr>' +
      (externalSociety ? '<tr><td>Resultado P3 no periodo</td><td class="value">' + esc(brl(current.paybackBase)) + '</td></tr>' : '<tr><td>Retencao S.A.</td><td class="value">' + esc(brl(current.saRetention)) + '</td></tr>') +
      '<tr class="total-row"><td>' + esc(distributionLabel) + '</td><td class="value">' + esc(brl(current.finalDistribution != null ? current.finalDistribution : current.investorDistribution)) + '</td></tr>' +
      '</tbody></table></div></div></div>' +
      '<div class="section page-break"><div class="section-title"><h2>Composicao financeira e custo diluido</h2><span>Quanto cada item representa por kWh</span></div><div class="split">' +
      itemTable('Receitas', revenueItems, current.totalRevenue, 'Total de receitas') +
      itemTable('Custos', costItems, current.totalOperatingCost, 'Total de custos') +
      '</div></div>' +
      '<div class="section"><div class="section-title"><h2>Acumulado da operacao</h2><span>Do inicio ate a competencia selecionada</span></div>' + metrics([
        { value: brl(accumulated.totalRevenue), label: 'Receita acumulada' },
        { value: kwh(accumulated.energy), label: 'Energia acumulada' },
        { value: brl(accumulated.totalOperatingCost), label: 'Custos acumulados' },
        { value: brl(accumulated.operationNet), label: 'Resultado acumulado', className: accumulated.operationNet >= 0 ? 'positive' : 'negative' },
        { value: pct(accumulated.occupancyPct), label: 'Ocupacao media ponderada' },
        { value: perKwh(accumulated.totalCostPerKWh), label: 'Custo medio acumulado' },
        { value: pct(accumulated.operationMargin), label: 'Margem acumulada' },
        { value: brl(capital.distribution), label: externalSociety ? 'Distribuicao acumulada ao socio investidor' : ((current.operationModel === 'management_only' || thirdPartyManagement) ? 'Lucro acumulado distribuido ao parceiro' : 'Distribuicao acumulada aos investidores'), className: capital.distribution >= 0 ? 'positive' : 'negative' },
        { value: brl(capital.recovered), label: 'Resultado recuperado no payback', className: capital.recovered >= 0 ? 'positive' : 'negative' },
        { value: brl(capital.remainingInvestment), label: 'Saldo a recuperar' },
        { value: pct(capital.roiAccumulated), label: 'ROI acumulado' },
        { value: payback(capital.paybackMonths), label: 'Payback estimado acumulado' }
      ]) + '</div>' +
      '<div class="section avoid"><div class="section-title"><h2>Evolucao do payback</h2><span>Resultado acumulado versus investimento considerado</span></div>' +
      timelineBars(capital.rows, 'cumulativePayback', brl) +
      '<table><thead><tr><th>Mes</th><th>Resultado para payback</th><th>Recuperado acumulado</th><th>' + esc(externalSociety ? 'Distribuicao socio investidor' : ((current.operationModel === 'management_only' || thirdPartyManagement) ? 'Lucro distribuido ao parceiro' : 'Distribuicao investidores')) + '</th><th>Saldo a recuperar</th></tr></thead><tbody>' + rows(capital.rows, [
        { value: 'label' },
        { value: function (item) { return brl(item.paybackBase); }, className: 'value' },
        { value: function (item) { return brl(item.cumulativePayback); }, className: 'value' },
        { value: function (item) { return brl(item.investorDistribution); }, className: 'value' },
        { value: function (item) { return capital.investment > 0 ? brl(item.remainingInvestment) : '-'; }, className: 'value' }
      ]) + '</tbody></table></div>' +
      '<div class="section avoid"><div class="section-title"><h2>Linha do tempo mes a mes</h2><span>Evolucao do faturamento e resultado</span></div>' + timelineBars(timeline, 'totalRevenue', brl) +
      '<table><thead><tr><th>Mes</th><th>Ocupacao</th><th>Receita</th><th>kWh</th><th>Custos</th><th>Resultado</th><th>Margem</th></tr></thead><tbody>' + rows(timeline, [
        { value: 'label' }, { value: function (item) { return pct(item.occupancyPct); }, className: 'value' },
        { value: function (item) { return brl(item.totalRevenue); }, className: 'value' },
        { value: function (item) { return kwh(item.energy); }, className: 'value' },
        { value: function (item) { return brl(item.totalOperatingCost); }, className: 'value' },
        { value: function (item) { return brl(item.operationNet); }, className: 'value' },
        { value: function (item) { return pct(item.operationMargin); }, className: 'value' }
      ]) + '</tbody></table></div>' +
      (units.length ? '<div class="section avoid"><div class="section-title"><h2>Resultado por ponto</h2><span>Composicao da rede UBY</span></div><table><thead><tr><th>Unidade</th><th>Tipo</th><th>Ocupacao</th><th>Receita</th><th>Energia</th><th>Custos</th><th>Resultado</th></tr></thead><tbody>' + rows(units, [
        { value: 'name' }, { value: 'type' }, { value: function (item) { return pct(item.occupancyPct); }, className: 'value' },
        { value: function (item) { return brl(item.totalRevenue); }, className: 'value' },
        { value: function (item) { return kwh(item.energy); }, className: 'value' },
        { value: function (item) { return brl(item.totalOperatingCost); }, className: 'value' },
        { value: function (item) { return brl(item.operationNet); }, className: 'value' }
      ]) + '</tbody></table></div>' : '') +
      reportFoot(externalSociety
        ? 'Relatorio da parceria. O investimento total e dividido entre P3 e o socio investidor conforme a participacao cadastrada. O payback usa somente o aporte da P3; a distribuicao mostra a parcela do socio investidor apos os custos da operacao. Conferir documentos fiscais e ajustes extraordinarios antes da aprovacao do fechamento.'
        : current.operationModel === 'management_only'
          ? 'Relatorio de prestacao de gestao. O lucro distribuido mostra o valor liquido pago diretamente ao parceiro apos energia, plataforma e demais custos. O payback da P3 considera somente a remuneracao de gestao. Conferir documentos fiscais e ajustes extraordinarios antes da aprovacao do fechamento.'
          : thirdPartyManagement
            ? 'Relatorio de gestao com marca UBY. A P3 recebe a remuneracao de gestao e a UBY recebe o royalty de marca configurado. O lucro distribuido mostra o valor liquido pago diretamente ao parceiro apos energia, plataforma e demais custos. Conferir documentos fiscais e ajustes extraordinarios antes da aprovacao do fechamento.'
          : 'Relatorio gerencial para investidores. A distribuicao final corresponde ao valor liquido para os cotistas apos a retencao estatutaria e o percentual de cotas configurado. Conferir documentos fiscais e ajustes extraordinarios antes da aprovacao do fechamento.') + '</div>';
    return shell((directPartnerModel ? 'Relatorio da parceria - ' : 'Relatorio de investidores - ') + (model.report && (model.report.station || model.report.scope) || 'UBY'), body, options);
  }

  var api = {
    areaReport: areaReport,
    investorReport: investorReport,
    format: { brl: brl, kwh: kwh, pct: pct, perKwh: perKwh }
  };

  global.UBY_FINANCE_REPORTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

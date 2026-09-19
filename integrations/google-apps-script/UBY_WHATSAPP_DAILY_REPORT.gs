/*
 * Gatilho opcional e independente do PC para a Edge Function UBY WhatsApp.
 * Cole este arquivo em um projeto Apps Script separado somente após configurar
 * as propriedades listadas abaixo. Ele não guarda token da Meta.
 *
 * Propriedades do script:
 * - UBY_WHATSAPP_REPORT_URL
 * - UBY_WHATSAPP_JOB_SECRET
 */

function enviarRelatorioWhatsAppUBY() {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty('UBY_WHATSAPP_REPORT_URL') || '').trim();
  const secret = String(properties.getProperty('UBY_WHATSAPP_JOB_SECRET') || '').trim();
  if (!url || !secret) throw new Error('Defina UBY_WHATSAPP_REPORT_URL e UBY_WHATSAPP_JOB_SECRET nas propriedades do script.');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-uby-whatsapp-job-secret': secret },
    payload: JSON.stringify({ mode: 'send' }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Edge Function respondeu ' + code + ': ' + body);
  return JSON.parse(body);
}

function testarPreviewRelatorioWhatsAppUBY() {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty('UBY_WHATSAPP_REPORT_URL') || '').trim();
  const secret = String(properties.getProperty('UBY_WHATSAPP_JOB_SECRET') || '').trim();
  if (!url || !secret) throw new Error('Defina UBY_WHATSAPP_REPORT_URL e UBY_WHATSAPP_JOB_SECRET nas propriedades do script.');
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-uby-whatsapp-job-secret': secret },
    payload: JSON.stringify({ mode: 'preview' }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error(response.getContentText());
  return JSON.parse(response.getContentText());
}

// Execute manualmente apenas depois do preview e do envio controlado estarem
// conferidos. O Apps Script roda na nuvem; não depende de computador ligado.
function instalarAgendamentoRelatorioWhatsAppUBY() {
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return trigger.getHandlerFunction() === 'enviarRelatorioWhatsAppUBY'; })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('enviarRelatorioWhatsAppUBY')
    .timeBased()
    .atHour(5)
    .nearMinute(5)
    .everyDays(1)
    .inTimezone('America/Sao_Paulo')
    .create();
}

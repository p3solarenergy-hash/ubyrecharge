const CONFIG = {
  ROOT_FOLDER_ID: '1jSvPzSwJOHBc8GkV1qbzxYWOkJIreO2f',
  PROSPECTION_SPREADSHEET_ID: '1IiUqtF8xobzwmMkRqJiNXcT1CFW6tskEybT6GWgvvPs',
  WORKS_SHEET: 'OBRAS_EV',
  DOCUMENTS_SHEET: 'DOCUMENTOS_EV',
  LOG_SHEET: 'LOG_EV'
};

function doGet(e) {
  const action = (e.parameter.action || 'health').trim();
  if (action === 'health') return json({ ok: true, service: 'UBY Obras EV' });
  if (action === 'listWorks') return json({ ok: true, works: listRows_(CONFIG.WORKS_SHEET) });
  if (action === 'listDocuments') return json({ ok: true, documents: listRows_(CONFIG.DOCUMENTS_SHEET) });
  if (action === 'listProspects') return json({ ok: true, prospects: readProspects_() });
  return json({ ok: false, error: 'Acao nao reconhecida: ' + action });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'upsertWork') return json(upsertWork_(body));
    if (body.action === 'createWorkFromProspect') return json(createWorkFromProspect_(body));
    if (body.action === 'ensureWorkFolder') return json(ensureWorkFolder_(body));
    if (body.action === 'uploadFile') return json(uploadFile_(body));
    return json({ ok: false, error: 'Acao nao reconhecida: ' + body.action });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function upsertWork_(body) {
  const workId = String(body.workId || body.id || slug_(body.workName || body.nome || 'obra'));
  const folder = ensureFolder_(workId, body.workName || body.nome || workId, body.folderId);
  const row = {
    workId,
    nome: body.workName || body.nome || '',
    cliente: body.cliente || '',
    local: body.local || '',
    status: body.status || '',
    potenciaKw: body.potenciaKw || '',
    progresso: body.progresso || '',
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    updatedAt: new Date().toISOString()
  };
  upsertRow_(CONFIG.WORKS_SHEET, 'workId', row);
  log_('upsertWork', workId, row.nome);
  return { ok: true, work: row };
}

function createWorkFromProspect_(body) {
  const result = upsertWork_(body);
  if (body.prospectId) {
    const work = result.work;
    work.prospectId = body.prospectId;
    upsertRow_(CONFIG.WORKS_SHEET, 'workId', work);
  }
  return result;
}

function ensureWorkFolder_(body) {
  const folder = ensureFolder_(body.workId || slug_(body.workName || 'obra'), body.workName || body.nome || body.workId, body.folderId);
  return { ok: true, folderId: folder.getId(), folderUrl: folder.getUrl(), webViewLink: folder.getUrl() };
}

function uploadFile_(body) {
  if (!body.fileName || !body.base64) throw new Error('Arquivo sem nome ou conteudo.');
  const folder = ensureFolder_(body.workId || slug_(body.workName || 'obra'), body.workName || body.workId || 'obra', body.folderId);
  const bytes = Utilities.base64Decode(body.base64);
  const blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.fileName);
  const file = folder.createFile(blob);
  const row = {
    workId: body.workId || '',
    workName: body.workName || '',
    documentId: body.documentId || '',
    fileName: body.fileName,
    mimeType: body.mimeType || '',
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    folderId: folder.getId(),
    createdAt: new Date().toISOString()
  };
  appendRow_(CONFIG.DOCUMENTS_SHEET, row);
  log_('uploadFile', row.workId, row.fileName);
  return { ok: true, fileId: file.getId(), webViewLink: file.getUrl(), folderId: folder.getId() };
}

function readProspects_() {
  const ss = SpreadsheetApp.openById(CONFIG.PROSPECTION_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('02_PONTOS_CRM') || ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(Boolean)).map(row => {
    const item = {};
    headers.forEach((h, i) => item[slugHeader_(h)] = row[i]);
    return item;
  });
}

function listRows_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(Boolean)).map(row => {
    const item = {};
    headers.forEach((h, i) => item[h] = row[i]);
    return item;
  });
}

function upsertRow_(sheetName, keyName, row) {
  const sheet = getSheet_(sheetName);
  const headers = ensureHeaders_(sheet, Object.keys(row));
  const keyCol = headers.indexOf(keyName) + 1;
  const values = sheet.getDataRange().getValues();
  let targetRow = 0;
  for (let r = 2; r <= values.length; r++) {
    if (String(values[r - 1][keyCol - 1]) === String(row[keyName])) {
      targetRow = r;
      break;
    }
  }
  const output = headers.map(h => row[h] === undefined ? '' : row[h]);
  if (targetRow) sheet.getRange(targetRow, 1, 1, headers.length).setValues([output]);
  else sheet.appendRow(output);
}

function appendRow_(sheetName, row) {
  const sheet = getSheet_(sheetName);
  const headers = ensureHeaders_(sheet, Object.keys(row));
  sheet.appendRow(headers.map(h => row[h] === undefined ? '' : row[h]));
}

function ensureHeaders_(sheet, wanted) {
  let headers = sheet.getLastRow() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].filter(String) : [];
  wanted.forEach(h => {
    if (headers.indexOf(h) === -1) headers.push(h);
  });
  if (headers.length) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return headers;
}

function getSheet_(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.PROSPECTION_SPREADSHEET_ID);
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function ensureFolder_(workId, workName, folderId) {
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (err) {}
  }
  const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const safeName = String(workName || workId).trim();
  const existing = root.getFoldersByName(safeName);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(safeName);
}

function log_(action, id, detail) {
  appendRow_(CONFIG.LOG_SHEET, { action, id, detail, at: new Date().toISOString() });
}

function slug_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || String(Date.now());
}

function slugHeader_(value) {
  return slug_(value).replace(/-/g, '_');
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

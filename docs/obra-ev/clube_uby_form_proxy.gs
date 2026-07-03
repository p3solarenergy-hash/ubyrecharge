// Se este script estiver colado dentro da planilha de respostas do Forms,
// ele usa a planilha ativa automaticamente. O ID abaixo fica como fallback.
const SPREADSHEET_ID = "19iPeYks-8P0Fd3henDoTYFPN5hQ6dconJgsQOl30Qws";
const SHEET_GID = 1124525277;
const SHEET_NAME = "Respostas ao formulario 1";

function doGet(event) {
  return handleRequest_(event);
}

function doPost(event) {
  return handleRequest_(event);
}

function handleRequest_(event) {
  try {
    const sheet = findResponseSheet_();
    const participants = readParticipants_(sheet);
    return output_({
      ok: true,
      source: "Apps Script seguro - Clube UBY",
      spreadsheetId: SPREADSHEET_ID,
      sheetName: sheet.getName(),
      sheetId: sheet.getSheetId(),
      updatedAt: new Date().toISOString(),
      total: participants.length,
      participants
    }, event);
  } catch (err) {
    return output_({
      ok: false,
      source: "Apps Script seguro - Clube UBY",
      error: err && err.message ? err.message : String(err)
    }, event);
  }
}

function findResponseSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();
  const byId = sheets.find(sheet => Number(sheet.getSheetId()) === Number(SHEET_GID));
  if (byId) return byId;

  const wantedName = normalizeHeader_(SHEET_NAME);
  const byName = sheets.find(sheet => normalizeHeader_(sheet.getName()) === wantedName);
  if (byName) return byName;

  if (sheets.length === 1) return sheets[0];
  throw new Error("Aba de respostas nao encontrada. GID esperado: " + SHEET_GID);
}

function readParticipants_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader_);
  return values.slice(1)
    .filter(row => row.some(cell => String(cell || "").trim()))
    .map(row => {
      const participant = {
        createdRaw: get_(row, headers, ["carimbodedatahora", "timestamp", "data"]),
        score: get_(row, headers, ["pontuacao", "score"]),
        name: get_(row, headers, ["nomecompleto", "nome"]),
        phone: get_(row, headers, ["whatsappcomddd", "whatsapp", "telefone", "celular"]),
        email: get_(row, headers, ["email", "emailaddress", "e-mail"]),
        vehicleBrand: get_(row, headers, ["marcadoveiculo", "marcadoveculo", "marca", "fabricante"]),
        vehicleModel: get_(row, headers, ["modelodoveiculo", "modelodoveculo", "veiculo", "veculo", "modelo"]),
        vehiclePlate: get_(row, headers, ["placadoveiculo", "placadoveculo", "placa"]),
        attraction: getContains_(row, headers, ["maisteatrai", "clubeuby"]),
        desiredBenefit: getContains_(row, headers, ["beneficio", "consideramaisimportante"]),
        wantsRanking: getContains_(row, headers, ["rankingmensal", "pontosdoclubeuby"]),
        regionInterest: getContains_(row, headers, ["regioes", "pontosderecarga"]),
        indication: getContains_(row, headers, ["indicaria", "pontouby"]),
        indicationContact: getContains_(row, headers, ["localoucontatoindicado"]),
        regulation: getContains_(row, headers, ["regulamento", "participacao", "clubeuby"]),
        lgpd: getContains_(row, headers, ["autorizacao", "lgpd"])
      };
      participant.acceptedRegulation = yesLike_(participant.regulation);
      participant.acceptedLgpd = yesLike_(participant.lgpd);
      return participant;
    })
    .filter(item => item.name || item.email || item.phone);
}

function output_(payload, event) {
  const callback = event && event.parameter && event.parameter.callback;
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function get_(row, headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader_);
  const index = headers.findIndex(header => normalizedAliases.includes(header));
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function getContains_(row, headers, pieces) {
  const normalizedPieces = pieces.map(normalizeHeader_);
  const index = headers.findIndex(header => normalizedPieces.every(piece => header.indexOf(piece) >= 0));
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function yesLike_(value) {
  return /^(sim|li|aceito|concordo|ok|yes|autorizo)/i.test(String(value || "").trim());
}

function normalizeHeader_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

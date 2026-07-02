const SPREADSHEET_ID = "19iPeYks-8P0Fd3henDoTYFPN5hQ6dconJgsQOl30Qws";
const SHEET_NAME = "Respostas ao formulário 1";

function doGet(event) {
  try {
    const participants = readParticipants_();
    return output_({
      ok: true,
      source: "Apps Script seguro",
      updatedAt: new Date().toISOString(),
      participants
    }, event);
  } catch (err) {
    return output_({
      ok: false,
      source: "Apps Script seguro",
      error: err && err.message ? err.message : String(err)
    }, event);
  }
}

function readParticipants_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Aba nao encontrada: " + SHEET_NAME);

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader_);
  return values.slice(1)
    .filter(row => row.some(cell => String(cell || "").trim()))
    .map(row => ({
      createdRaw: get_(row, headers, ["carimbodedatahora", "timestamp", "data"]),
      name: get_(row, headers, ["nomecompleto", "nome"]),
      phone: get_(row, headers, ["whatsappcomddd", "whatsapp", "telefone"]),
      email: get_(row, headers, ["email", "e-mail"]),
      vehicleModel: get_(row, headers, ["modelodoveiculo", "modelodoveculo", "veiculo", "veculo"]),
      vehiclePlate: get_(row, headers, ["placadoveiculo", "placadoveculo", "placa"]),
      attraction: getContains_(row, headers, ["maisteatrai", "participardoclubeuby"]),
      desiredBenefit: getContains_(row, headers, ["beneficio", "consideramaisimportante"]),
      wantsRanking: getContains_(row, headers, ["rankingmensal", "pontosdoclubeuby"]),
      regionInterest: getContains_(row, headers, ["regioes", "pontosderecarga"]),
      indication: getContains_(row, headers, ["indicaria", "receberumpontouby"]),
      indicationContact: getContains_(row, headers, ["localoucontatoindicado"]),
      regulation: getContains_(row, headers, ["regulamento", "clubeuby"]),
      lgpd: getContains_(row, headers, ["lgpd"])
    }))
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

function normalizeHeader_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

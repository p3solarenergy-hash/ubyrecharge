const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const obraDir = path.join(root, "docs", "obra-ev");

const jsFiles = [
  "auth.js",
  "backup_guard.js",
  "finance_engine.js",
  "supabase_bridge.js",
  "app_store.js",
  "sidebar.js"
].map(file => path.join(obraDir, file));

const htmlWithInlineScripts = [
  "recargas.html",
  "index.html",
  "engenharia.html",
  "gestao_obra_ev_detalhe.html",
  "login.html"
].map(file => path.join(obraDir, file));

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function checkScript(source, label) {
  new vm.Script(source, { filename: label });
}

function inlineScriptsFromHtml(file) {
  const html = read(file);
  const scripts = [];
  const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) scripts.push(match[1]);
  return scripts;
}

function assertNoFrontendSecrets(file) {
  const source = read(file);
  const forbidden = [/service_role/i, /service[_-]?key/i, /SUPABASE_SERVICE/i];
  forbidden.forEach(pattern => {
    if (pattern.test(source)) {
      throw new Error(`Possivel segredo exposto em ${path.relative(root, file)}: ${pattern}`);
    }
  });
}

function assertUniqueHtmlIds(file) {
  const source = read(file);
  const ids = Array.from(source.matchAll(/\sid="([^"]+)"/g), match => match[1]);
  const duplicates = Array.from(new Set(ids.filter((id, index) => ids.indexOf(id) !== index)));
  if (duplicates.length) {
    throw new Error(`IDs HTML duplicados em ${path.relative(root, file)}: ${duplicates.join(", ")}`);
  }
}

function assertWorkDetailSafety() {
  const detail = read(path.join(obraDir, "gestao_obra_ev_detalhe.html"));
  const index = read(path.join(obraDir, "index.html"));
  const store = read(path.join(obraDir, "app_store.js"));

  if (/params\.get\(["']obra["']\)\s*\|\|\s*["']rio["']/.test(detail)) {
    throw new Error("A pagina de detalhe nao pode assumir Rio quando o ID da obra estiver ausente.");
  }
  if (!detail.includes("__UBY_DETAIL_LOADING_ID__")) {
    throw new Error("A pagina de detalhe precisa bloquear gravacao antes de carregar a obra da nuvem.");
  }
  if (!index.includes("workDetailLink(o.id)")) {
    throw new Error("Os cartoes de obras precisam gerar o link a partir do ID canonico.");
  }
  if (store.includes("link: raw.link ||")) {
    throw new Error("Links antigos salvos no raw_data nao podem decidir qual obra sera aberta.");
  }
  if (!store.includes("A gravacao provisoria foi bloqueada")) {
    throw new Error("A camada de persistencia precisa bloquear a gravacao provisoria.");
  }
}

function assertRechargeRenderSafety() {
  const recargas = read(path.join(obraDir, "recargas.html"));
  if (/renderMensal\(\);\s*renderAcumulado\(\);\s*renderFinanceiro\(\);\s*renderGeral\(\);/.test(recargas)) {
    throw new Error("O painel de recargas nao pode renderizar todas as abas em uma unica atualizacao.");
  }
  if (!recargas.includes("if (name === 'mensal') await renderMensal();") ||
      !recargas.includes("else if (name === 'acumulado') renderAcumulado();")) {
    throw new Error("As abas mensal e acumulado precisam ser renderizadas sob demanda.");
  }
  if (!recargas.includes("Chart.defaults.animation = false")) {
    throw new Error("Os graficos do painel precisam manter animacoes desativadas durante atualizacoes.");
  }
  if (!recargas.includes("parseRechargeRowsInWorker") || !recargas.includes("rechargeImportQueue")) {
    throw new Error("A importacao de planilhas precisa usar processamento em segundo plano e fila serial.");
  }
  if (!recargas.includes("ubyReportsRequested") || !recargas.includes("Abra a aba Relatorios para carregar")) {
    throw new Error("A prestacao de contas deve ser carregada sob demanda para nao bloquear o painel operacional.");
  }
  if (!recargas.includes("ubyAreaLatestClosedReport") || !recargas.includes("ubyAreaNextOpenDate")) {
    throw new Error("O proximo ciclo financeiro deve partir do ultimo relatorio fechado.");
  }
  if (!recargas.includes("getMonth() + 1, 0, 23, 59, 59") || recargas.includes("Fechamento dia 10")) {
    throw new Error("Os novos ciclos de prestacao de contas devem fechar no ultimo dia do mes.");
  }
  if (!recargas.includes('stationAvailableHours') || !recargas.includes('generalStationOccupancy')) {
    throw new Error('A ocupacao precisa respeitar o horario disponivel de cada eletroposto.');
  }
  if (!recargas.includes('saveStationLayoutConfiguration') || !recargas.includes('saveRechargeMetadata(workId, record)')) {
    throw new Error('A configuracao operacional da estacao precisa ser salva como metadado seguro.');
  }
  if (recargas.includes('await window.UBY_SUPABASE.loadAllRechargeBases()')) {
    throw new Error('A abertura nao pode baixar todas as bases completas em uma unica resposta.');
  }
  if (!recargas.includes('for (const workId of prioritizedIds)') || !recargas.includes('await yieldToBrowser();')) {
    throw new Error('As bases completas precisam ser hidratadas progressivamente sem bloquear a tela.');
  }
  if (!recargas.includes('monthlyInsightsTimer = setTimeout')) {
    throw new Error('As analises secundarias mensais precisam renderizar depois dos indicadores principais.');
  }
  const workerSource = recargas.match(/const workerSource = `([\s\S]*?)`;\s*return new Promise/);
  if (!workerSource) throw new Error("O leitor em segundo plano da planilha nao foi encontrado.");
  checkScript(workerSource[1], "recargas-import-worker.js");
}

function main() {
  jsFiles.forEach(file => {
    checkScript(read(file), path.relative(root, file));
    assertNoFrontendSecrets(file);
  });

  htmlWithInlineScripts.forEach(file => {
    inlineScriptsFromHtml(file).forEach((script, index) => {
      checkScript(script, `${path.relative(root, file)}#inline-${index + 1}`);
    });
    assertNoFrontendSecrets(file);
    assertUniqueHtmlIds(file);
  });

  assertWorkDetailSafety();
  assertRechargeRenderSafety();

  console.log("obra-ev validation ok");
}

main();

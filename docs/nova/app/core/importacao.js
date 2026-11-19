/*
  NOVA PLATAFORMA — importação SEM TELA (planilhas de recargas e cadastro de clientes).

  Migração (fase 5, 14/11/2026): antes, a tela Importar trocava a obra e o mês nos campos da
  página antiga escondida (recargas.html?nova_import=1), soltava os arquivos no handleFiles dela
  e apertava os botões antigos de desfazer/excluir mês. Aqui as mesmas regras (leitura Spott/Move/
  Raio/Go Grid, duplicadas, conferência do Local, histórico, backup, gravação atômica) rodam no
  núcleo, recebendo obra, mês e modo direto.
  A obra aberta da importação fica guardada à parte e só entra no motor durante cada operação
  (o motor é um só para a plataforma inteira). Gravação: UBY_SUPABASE.comGravacao("importacao"),
  que só vale com a tela Importar aberta.
*/
(function () {
  "use strict";
  const N = window.UBY_NUCLEO;
  const S = N.state;
  const gravar = fn => window.UBY_SUPABASE.comGravacao("importacao", fn);

  const CORRENTE = ["currentWorkId", "currentWorkName", "currentStationReportName", "allCharges", "loadedFiles", "monthlyClosings",
    "financialSettings", "stationAvailability", "ubyOperationOverrides", "financeEditorCurrentSettings"];
  const guardar = () => Object.fromEntries(CORRENTE.map(k => [k, S[k]]));
  const repor = st => { CORRENTE.forEach(k => { S[k] = st[k]; }); };
  let aberta = null;
  function naObra(fn) {
    if (!aberta) throw new Error("Nenhuma obra aberta na importação.");
    const antes = guardar();
    repor(aberta.state);
    const fim = () => { aberta.state = guardar(); repor(antes); };
    let r;
    try { r = fn(); } catch (e) { fim(); throw e; }
    if (r && typeof r.then === "function") return r.finally(fim);
    fim();
    return r;
  }

  // Lista de obras da importação (as opções do seletor antigo: sem estações repetidas, na mesma ordem).
  function obras() {
    const works = N.selectorWorksWithoutDuplicateStations(N.workOptions()).sort(N.workSelectorOrder);
    return works.map(w => ({ id: String(w.id), label: N.workSelectorLabel(w) }));
  }

  // Trocar a obra no seletor antigo: carrega a base completa dela.
  async function abrir(workId) {
    workId = String(workId || "");
    const antes = guardar();
    try {
      S.currentStationReportName = "";
      S.currentWorkId = workId;
      try { localStorage.setItem("uby-recargas-current-work", workId); } catch (_) {}
      S.currentWorkName = N.currentWork().nome || workId;
      await N.loadRechargeBase(workId);
      aberta = { workId, state: guardar() };
      return { workId };
    } finally { repor(antes); }
  }
  const atual = () => aberta ? aberta.workId : "";

  const status = () => window.UBY_NUCLEO.status();
  function estadoAgora() {
    const st = status();
    return { feedback: st.feedback?.msg || "", feedbackClass: st.feedback?.cls || "", storage: st.message || "" };
  }
  function estado() {
    if (!aberta) return { feedback: "", feedbackClass: "", storage: "", undo: false, hasData: false };
    return naObra(() => {
      const undo = N.readJson(N.RECARGAS_IMPORT_UNDO_KEY, null);
      return { ...estadoAgora(), undo: undo?.workId === S.currentWorkId, hasData: !!(S.allCharges.length || S.loadedFiles.length) };
    });
  }
  const limparAviso = () => N.setFeedback("", "");
  const arquivos = () => aberta ? naObra(() => [...(S.loadedFiles || [])]) : [];
  const recargas = () => aberta ? naObra(() => [...(S.allCharges || [])]) : [];

  // handleFiles sem tela: mês e modo vêm por parâmetro. Lê e grava arquivo por arquivo (a página antiga
  // enfileirava e devolvia na hora; aqui a promessa só termina com tudo gravado).
  async function importar(files, { month, mode = "merge" } = {}) {
    return naObra(async () => {
      S.currentStationReportName = "";
      if (!month) { N.setFeedback("Escolha o mes da planilha antes de subir o arquivo.", "up-error"); return estadoAgora(); }
      const accepted = Array.from(files || []).filter(f => f?.name && /\.(xlsx|xls|csv)$/i.test(String(f.name)));
      if (!accepted.length) { N.setFeedback("Arquivo nao reconhecido. Envie .xlsx, .xls ou .csv exportado da plataforma.", "up-error"); return estadoAgora(); }
      await gravar(async () => {
        try { await N.ensureCurrentWorkBaseReadyForImport(); }
        catch (err) { N.setFeedback("Importacao bloqueada: " + err.message, "up-error"); return; }
        for (const f of accepted) {
          f.month = month;
          f.importMode = mode;
          S.loadedFiles.push(f);
          await N.readFile(f);
        }
      });
      return estadoAgora();
    });
  }

  // undoLastImport sem tela (a pergunta de confirmação fica na tela nova).
  async function desfazer() {
    return naObra(async () => {
      const undo = N.readJson(N.RECARGAS_IMPORT_UNDO_KEY, null);
      if (!undo || undo.workId !== S.currentWorkId) throw new Error("Não há importação recente para desfazer nesta obra.");
      localStorage.removeItem(N.RECARGAS_IMPORT_UNDO_KEY);
      N.applyRechargeRecord(undo.record, "restauração");
      N.setStorageState(`Última importação desfeita para <strong>${S.currentWorkName}</strong>. Salvando no banco...`);
      await gravar(() => N.saveRechargeBase({ allowEmpty: true, mutationIntent: "undo_import" }));
      return estadoAgora();
    });
  }
  function infoDesfazer() {
    if (!aberta) return null;
    return naObra(() => {
      const undo = N.readJson(N.RECARGAS_IMPORT_UNDO_KEY, null);
      return undo && undo.workId === S.currentWorkId ? { createdAt: undo.createdAt || "", workName: S.currentWorkName } : null;
    });
  }

  // clearSelectedMonth sem tela.
  const recargasDoMes = mk => aberta ? naObra(() => N.chargesForMonth(mk).length) : 0;
  async function excluirMes(mk) {
    return naObra(async () => {
      if (!mk) throw new Error("Escolha o mês que deseja excluir.");
      if (!N.chargesForMonth(mk).length) throw new Error(`Não há recargas salvas em ${N.monthLabel(mk)} para esta obra.`);
      N.storeImportUndo(`exclusão de ${N.monthLabel(mk)}`);
      S.allCharges = S.allCharges.filter(c => N.chargeMonthKey(c) !== mk);
      const closings = { ...S.monthlyClosings };
      delete closings[mk];
      S.monthlyClosings = closings;
      await gravar(() => N.persistCorrection(`Mês ${N.monthLabel(mk)} excluído de <strong>${S.currentWorkName}</strong>.`));
      return estadoAgora();
    });
  }

  // handleCustomerRegistryFiles sem tela: devolve o texto que ia para o aviso da página antiga.
  async function clientes(files = []) {
    if (!files.length) return "";
    return gravar(async () => {
      try {
        const official = await N.readCustomerRegistryCloud();
        if (!official) throw new Error("Base oficial indisponivel. Nenhum arquivo foi importado para evitar duplicidade.");
        N.writeJson(N.CUSTOMER_REGISTRY_LOCAL_KEY, { rows: N.customerRegistryRowsFromCloud(official.rows), total: official.total, updatedAt: new Date().toISOString(), source: "Supabase conferido antes da importacao" });
      } catch (err) { return `Importacao nao executada: ${err.message}`; }
      const imported = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        let rows;
        if (/\.csv$/i.test(file.name) || /csv/i.test(file.type || "")) rows = N.parseCsvRows(new TextDecoder("utf-8").decode(buffer));
        else {
          await N.ensureSpreadsheetLibrary();
          const workbook = window.XLSX.read(new Uint8Array(buffer), { type: "array" });
          rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, blankrows: false });
        }
        imported.push(...N.customerRegistryRowsFromSheet(rows));
      }
      const consolidated = N.consolidateCustomerRegistryRows(imported);
      const merged = N.mergeCustomerRegistry(consolidated, files.map(f => f.name).join(", "));
      try {
        if (merged.added.length) await N.saveCustomerRegistryCloud({ rows: merged.added });
        const confirmed = await N.confirmCustomerRegistryCloud(merged.added);
        return `${imported.length} linha(s) lidas: ${merged.added.length} cliente(s) novo(s), ${merged.retained.length} ja existente(s) preservado(s). Base oficial: ${confirmed.total} cliente(s).`;
      } catch (err) {
        return `${imported.length} linha(s) lidas: ${merged.added.length} novo(s), ${merged.retained.length} ja existente(s) preservado(s). Banco pendente: ${err.message}`;
      }
    });
  }

  // Fila única do motor: a importação pode seguir em segundo plano enquanto outra tela edita (dados.js).
  const fila = fn => (window.UBY_MOTOR_EXCLUSIVO ? window.UBY_MOTOR_EXCLUSIVO(fn) : fn());
  window.UBY_IMPORTACAO = {
    obras, abrir: id => fila(() => abrir(id)), atual, estado, limparAviso, arquivos, recargas,
    importar: (files, opts) => fila(() => importar(files, opts)), desfazer: () => fila(() => desfazer()), infoDesfazer, recargasDoMes,
    excluirMes: mk => fila(() => excluirMes(mk)), clientes, gravar
  };
})();

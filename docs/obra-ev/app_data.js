(function () {
  const prospectSheetUrl = "https://docs.google.com/spreadsheets/d/1IiUqtF8xobzwmMkRqJiNXcT1CFW6tskEybT6GWgvvPs/edit?gid=2137351283";

  const baseWorks = [
    { id: "rio", nome: "Rio Beach EV", status: "Concluida", pct: 100, kw: 7, crit: 0 },
    { id: "malassise", nome: "Posto Robert Koch R.K.", status: "Projeto", pct: 42, kw: 60, crit: 4 },
    { id: "prospect-1", nome: "Posto Duim", status: "Projeto", pct: 0, kw: 60, crit: 0 },
    { id: "prospect-29", nome: "Posto Araguaia", status: "Projeto", pct: 0, kw: 60, crit: 0 }
  ];

  const baseObras = [
    { id: "rio", nome: "Rio Beach EV", cliente: "Rio Beach", local: "Rua Luiz Lerco 159", status: "Concluida", kind: "ok", pct: 100, kw: 7, carregadores: "1 x 7 kW", crit: 0, flags: ["Obra completa"], link: "gestao_obra_ev_detalhe.html" },
    { id: "malassise", nome: "Posto Robert Koch R.K.", cliente: "Malassise Robert Koch", local: "Maringa - PR", status: "Projeto", kind: "warn", pct: 42, kw: 60, carregadores: "1 x 60 kW", crit: 4, flags: ["Aumento de carga", "Trafo a validar", "Orcamento civil"], link: "gestao_obra_ev_detalhe.html?obra=malassise" },
    { id: "prospect-1", nome: "Posto Duim", cliente: "Posto Duim", local: "Av. Maringa, 241 - Londrina/PR", status: "Projeto", kind: "warn", pct: 0, kw: 60, carregadores: "1 x 60 kW", crit: 0, flags: ["Obra real", "Estudo realizado", "DLM a validar"], link: "gestao_obra_ev_detalhe.html?obra=prospect-1" },
    { id: "prospect-29", nome: "Posto Araguaia", cliente: "Malassise Araguaia", local: "Av Araguaia - Londrina/PR", status: "Projeto", kind: "warn", pct: 0, kw: 60, carregadores: "1 x 60 kW", crit: 0, flags: ["Obra real", "Analise vinculada", "DLM a validar"], link: "gestao_obra_ev_detalhe.html?obra=prospect-29" }
  ];

  const baseTasks = [
    { id: "t1", title: "Validar protocolo de aumento de carga", project: "Posto Robert Koch R.K.", owner: "UBY Recharge", dueOffset: 2, priority: "Alta", status: "Em andamento", note: "Conferir retorno da concessionaria e refletir no checklist da obra." },
    { id: "t2", title: "Enviar orcamento civil revisado", project: "Posto Araguaia", owner: "Equipe civil", dueOffset: 4, priority: "Media", status: "Pendente", note: "Separar base, recomposicao e protecao mecanica." },
    { id: "t3", title: "Arquivar fotos finais da Rio Beach", project: "Rio Beach EV", owner: "Campo", dueOffset: 0, priority: "Baixa", status: "Pendente", note: "Subir fotos no documento da obra." },
    { id: "t4", title: "Definir padrao de documentos para cada obra", project: "Administrativo", owner: "UBY Recharge", dueOffset: 7, priority: "Media", status: "Aguardando terceiro", note: "Base para Drive e historico." }
  ];

  const prospects = [
    { id: "1", ponto: "POSTO DUIM", cidade: "LONDRINA", uf: "PR", prioridade: "1. PRIORIDADE", tipo: "POSTO", status: "Aguardando aprovacao", etapa: "Estudo realizado", acao: "", contato: "OSVALDO", trafo: "", disjuntor: "", kw: "60" },
    { id: "20", ponto: "POSTO MARINGA", cidade: "MARINGA", uf: "PR", prioridade: "1. PRIORIDADE", tipo: "POSTO", status: "Aguardando aprovacao", etapa: "Estudo realizado", acao: "", contato: "THIAGO SANTAELLA", trafo: "", disjuntor: "600 A", kw: "60" },
    { id: "28", ponto: "POSTO ROBERT KOCK", cidade: "LONDRINA", uf: "PR", prioridade: "1. PRIORIDADE", tipo: "POSTO", status: "Aguardando aprovacao", etapa: "Estudo realizado", acao: "", contato: "RAFA", trafo: "", disjuntor: "150 A", kw: "60" },
    { id: "29", ponto: "POSTO ARAGUAIA", cidade: "LONDRINA", uf: "PR", prioridade: "1. PRIORIDADE", tipo: "MERCADO", status: "Aguardando aprovacao", etapa: "Estudo realizado", acao: "", contato: "RAFA", trafo: "", disjuntor: "150 A", kw: "60" },
    { id: "19", ponto: "SHOPPING AURORA", cidade: "LONDRINA", uf: "PR", prioridade: "1. PRIORIDADE", tipo: "SHOPPING", status: "Em negociacao", etapa: "Visita tecnica", acao: "", contato: "DANTON", trafo: "500 kVA", disjuntor: "800 A", kw: "150" },
    { id: "5", ponto: "MUFATTAO AUTOCENTER CASCAVEL", cidade: "CASCAVEL", uf: "PR", prioridade: "2. ALTA", tipo: "COMERCIO", status: "Aguardando autorizacao", etapa: "Implantar analisador", acao: "Implantar analisador", contato: "CHAD", trafo: "", disjuntor: "", kw: "60" },
    { id: "18", ponto: "SOCIEDADE RURAL DO PARANA", cidade: "LONDRINA", uf: "PR", prioridade: "2. ALTA", tipo: "RODOVIA", status: "Em negociacao", etapa: "", acao: "", contato: "DAVI", trafo: "", disjuntor: "", kw: "90" },
    { id: "21", ponto: "POSTO RODOVIARIA", cidade: "LONDRINA", uf: "PR", prioridade: "2. ALTA", tipo: "POSTO", status: "Em negociacao", etapa: "Pedir padrao dedicado", acao: "Pedir padrao dedicado", contato: "THIAGO SANTAELLA", trafo: "75 kVA", disjuntor: "200 A", kw: "60" },
    { id: "3", ponto: "VISCARDI HIGIENOPOLIS", cidade: "LONDRINA", uf: "PR", prioridade: "2. ALTA", tipo: "MERCADO", status: "Aguardando aprovacao", etapa: "Estudo realizado", acao: "", contato: "ADOLFO", trafo: "", disjuntor: "", kw: "120" },
    { id: "2", ponto: "VISCARDI ALPHAVILLE", cidade: "LONDRINA", uf: "PR", prioridade: "3. NORMAL", tipo: "MERCADO", status: "Aguardando aprovacao", etapa: "Estudo realizado", acao: "", contato: "ADOLFO", trafo: "", disjuntor: "", kw: "120" },
    { id: "22", ponto: "POSTO ALPHAVILLE", cidade: "LONDRINA", uf: "PR", prioridade: "3. NORMAL", tipo: "POSTO", status: "Liberado para estudo", etapa: "Pedir padrao dedicado", acao: "Pedir padrao dedicado", contato: "THIAGO SANTAELLA", trafo: "", disjuntor: "", kw: "60" }
  ];

  const recentFiles = [
    { name: "RELATORIOS BASE", type: "folder", when: "Pasta principal", url: "https://drive.google.com/drive/folders/1jSvPzSwJOHBc8GkV1qbzxYWOkJIreO2f" },
    { name: "POSTO ROBERT KOCH", type: "folder", when: "Pasta da obra", url: "https://drive.google.com/drive/folders/17qtw1l9OHRRcjkiuK8jIROgCupKeBdPb" },
    { name: "POSTO ARAGUAIA", type: "folder", when: "Pasta da obra", url: "https://drive.google.com/drive/folders/1BQcfreo6D_FswiKjgBYe3zccR2UpUE2r" },
    { name: "CONTROLE DE PROSPECCAO - AREAS EV", type: "sheet", when: "Base comercial", url: prospectSheetUrl },
    { name: "ARAGUAIA EV - V12", type: "sheet", when: "Analisador", url: "https://docs.google.com/spreadsheets/d/1XbMc4FoHhq0B-ZEFUBsWJc01ObyJK13xMsVNZR8iKac/edit" },
    { name: "ROBERT KOCH EV - V12", type: "sheet", when: "Analisador", url: "https://docs.google.com/spreadsheets/d/1NWXav-JMnshFaa0jTcj2kOggDDk-T2YqSctX4MP0q2k/edit" },
    { name: "RIO BEACH EV - V12", type: "sheet", when: "Analisador", url: "https://docs.google.com/spreadsheets/d/14giw1FZcQX8zaRYe6H_NUDvZBG2DFyrQuhBxecJr5nw/edit" }
  ];

  window.UBY_APP_DATA = {
    baseWorks,
    baseObras,
    baseTasks,
    prospects,
    prospectSheetUrl,
    recentFiles
  };
})();

/* Central de lançamentos — onde cada informação entra.
   Tudo o que é financeiro e de operação é editado aqui na nova (Importar e
   Parâmetros e custos). Obras, mapa, engenharia, tarefas e clube ainda usam a
   tela original, aberta dentro da nova e identificada como tal. */
(function () {
  "use strict";
  const { esc } = UBY;
  const P = tab => `#/parametros/${tab}`;

  const GROUPS = [
    { title: "Rede de recargas", items: [
      { t: "Planilhas de recargas", d: "Spott (lista-de-transacoes .csv), Move (relatorio-recargas .xlsx) e Go Grid. Escolha a obra e o mês e carregue o arquivo. A importação elimina duplicadas e guarda histórico para desfazer.", freq: "diário ou semanal", route: "#/importar", where: "Importar planilhas" },
      { t: "Cadastro geral de clientes", d: "Planilha de clientes exportada da plataforma de recarga (.csv/.xlsx). Só clientes novos são enviados; os existentes ficam preservados.", freq: "mensal", route: "#/importar", where: "Importar planilhas · cadastro de clientes" },
      { t: "Carregadores na operação UBY", d: "Marca quais carregadores entram na operação UBY (resultado, rateio da matriz e cotistas).", freq: "quando um ponto entra ou sai", route: P("operacao"), where: "Parâmetros e custos · Operação e carregadores" },
      { t: "Horário e disponibilidade das estações", d: "Base do cálculo de ocupação: dias e horas de funcionamento, início da operação e conectores.", freq: "quando mudar o funcionamento", route: P("operacao"), where: "Parâmetros e custos · Operação e carregadores · Horários e cortesia" },
      { t: "Potência do local", d: "Potência total do local (ex.: 2 × 7 kW = 14 kW), usada na ocupação e no rateio por potência.", freq: "quando mudar o equipamento", route: P("operacao"), where: "Parâmetros e custos · Operação e carregadores" },
      { t: "Cortesias", d: "Quem recarrega de cortesia e quem absorve o custo (operação, parceiro ou UBY).", freq: "quando mudar", route: P("operacao"), where: "Parâmetros e custos · Operação e carregadores · Horários e cortesia" },
      { t: "Clube UBY", d: "Sincronizar o formulário de cadastro, participantes, cupons e parcerias.", freq: "mensal", route: "#/clube-classico", original: true, where: "Clube · tela original (migração em andamento)" }
    ] },
    { title: "Financeiro", items: [
      { t: "Configuração financeira de cada carregador", d: "Modelo (UBY, parceiro, P3), % gestão, plataforma, área e royalty, energia e fatura Copel/arrendamento, investimento, metas, receitas e custos extras, por competência. Escolha a estação:", freq: "mensal (fechamento)", stations: true, where: "Parâmetros e custos · Por carregador" },
      { t: "Custos centrais da matriz", d: "Aluguel, seguro, sistemas, tributos corporativos: recorrente, parcelado ou pontual, com a regra de rateio.", freq: "quando surgir um custo", route: P("matriz"), where: "Parâmetros e custos · Custos da matriz" },
      { t: "Pagamentos programados e baixa", d: "Calendário do mês, pagamentos recorrentes por carregador e Marcar pago / Reabrir.", freq: "a cada pagamento", route: P("pagamentos"), where: "Parâmetros e custos · Pagamentos" },
      { t: "Boletos, notas e documentos", d: "Anexar boleto, nota fiscal, fatura ou contrato à competência (arquivo privado).", freq: "a cada documento", route: P("documentos"), where: "Parâmetros e custos · Documentos" },
      { t: "Cotas, rodadas e cotistas", d: "Valor da cota por rodada, cotistas, reservas legal e de expansão, e percentual dos cotistas.", freq: "a cada mudança", route: P("cotas"), where: "Parâmetros e custos · Cotas, impostos e rodadas" },
      { t: "Impostos sobre o faturamento", d: "Alíquota sobre tudo o que a UBY faturou e valor exato de cada mês quando a guia sair. Sai do resultado antes das reservas e dos cotistas.", freq: "mensal", route: P("cotas"), where: "Parâmetros e custos · Cotas, impostos e rodadas" }
    ] },
    { title: "Gestão de obras", items: [
      { t: "Obras, fases e tarefas", d: "Nova obra, avanço das fases, protocolos, responsáveis e prazos.", freq: "contínuo", route: "#/obras-classico", original: true, where: "Obras · tela original (migração em andamento)" },
      { t: "Vínculos do mapa", d: "Ligar um ponto do mapa a uma obra ou criar obra a partir do ponto.", freq: "quando surgir um ponto", route: "#/mapa-classico", original: true, where: "Mapa · tela original (migração em andamento)" },
      { t: "Concessionária e orçamentos", d: "Protocolos, pareceres de acesso, projetos e orçamentos de engenharia.", freq: "contínuo", route: "#/engenharia", original: true, where: "Engenharia · tela original (migração em andamento)" },
      { t: "Tarefas da equipe", d: "Central compartilhada de tarefas e responsáveis.", freq: "contínuo", route: "#/tarefas-classico", original: true, where: "Tarefas · tela original (migração em andamento)" }
    ] }
  ];

  function render(target) {
    let stations = [];
    try { stations = UBY.data("financeStations"); } catch (_) {}
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Entrada de dados</p><h1>Central de lançamentos</h1>
        <p class="lead">Tudo o que entra na plataforma, em um lugar. Recargas, clientes, operação e todo o financeiro são lançados aqui na nova. Obras, mapa, engenharia, tarefas e clube ainda abrem a tela original dentro da nova, até a migração terminar.</p></div>
        <div class="callout"><strong>Grava na base real</strong><small>A mesma base da plataforma atual, com histórico por competência e log de auditoria. Depois de lançar, os painéis se atualizam sozinhos; se não, use ↻ no topo.</small></div></div>
      ${GROUPS.map(g => `
        <section class="section"><div class="section-head"><div><p class="kicker">${esc(g.title)}</p><h2>O que lançar em ${esc(g.title.toLowerCase())}</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Informação</th><th>Como entra</th><th>Onde fica</th><th>Frequência</th><th></th></tr></thead><tbody>
            ${g.items.map(it => `<tr><td><strong>${esc(it.t)}</strong></td><td style="white-space:normal;min-width:300px">${esc(it.d)}
              ${it.stations ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${stations.map(s => `<a class="btn link-btn" href="#/parametros/carregador/${encodeURIComponent(`${s.workId}|${s.station}`)}">${esc(s.station)}</a>`).join("") || "<small>Nenhuma estação carregada ainda.</small>"}</div>` : ""}</td>
              <td style="white-space:normal">${esc(it.where)}${it.original ? ` <span class="badge neutral">original</span>` : ""}</td><td>${esc(it.freq)}</td>
              <td class="num">${it.route ? `<a class="btn ${it.original ? "" : "primary"} link-btn" href="${esc(it.route)}">${it.original ? "Abrir →" : "Lançar →"}</a>` : ""}</td></tr>`).join("")}
          </tbody></table></div>
        </section>`).join("")}`;
  }

  UBY.register("lancamentos", { render });
})();

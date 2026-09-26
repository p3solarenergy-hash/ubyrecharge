/* Central de lançamentos — mapa de onde cada informação nova entra.
   A versão local é somente leitura: os botões abrem a tela correspondente
   na plataforma publicada, que é onde a gravação acontece hoje. */
(function () {
  "use strict";
  const { esc } = UBY;
  const PUB = "https://p3solarenergy-hash.github.io/ubyrecharge/";
  const O = PUB + "obra-ev/";

  const GROUPS = [
    { title: "Rede de recargas", items: [
      { t: "Planilhas de recargas", d: "Spott (lista-de-transacoes .csv), Move (relatorio-recargas .xlsx) e Go Grid. Escolha a obra e o mês e carregue o arquivo. A importação elimina duplicadas e guarda histórico para desfazer.", freq: "diário ou semanal", route: "#/importar", where: "Aqui na nova · Importar planilhas de recargas" },
      { t: "Cadastro geral de clientes", d: "Planilha de clientes exportada da plataforma de recarga (.csv/.xlsx). Só clientes novos são enviados; os existentes ficam preservados.", freq: "mensal", route: "#/importar", where: "Aqui na nova · Importar planilhas (cadastro de clientes)" },
      { t: "Carregadores na operação UBY", d: "Marca quais carregadores entram no comando da rede (DC entra por padrão).", freq: "quando um ponto entra ou sai", url: O + "recargas.html", where: "Recargas · aba UBY · tabela de carregadores" },
      { t: "Horário e disponibilidade das estações", d: "Base do cálculo de ocupação: horas em que cada estação fica disponível.", freq: "quando mudar o funcionamento", url: O + "recargas.html", where: "Recargas · aba Geral · Configurar horário" },
      { t: "Clube UBY", d: "Sincronizar o formulário de cadastro, importar participantes, cupons e parcerias.", freq: "mensal", url: O + "recargas.html", where: "Recargas · aba Clube UBY" }
    ] },
    { title: "Financeiro", items: [
      { t: "Custos centrais da matriz", d: "Aluguel, seguro, sistemas, tributos corporativos: recorrente, parcelado ou pontual, com a regra de rateio.", freq: "quando surgir um custo", url: O + "financeiro.html", where: "Financeiro · aba Compromissos" },
      { t: "Pagamentos programados e baixa", d: "Pagamentos recorrentes por carregador e os botões Marcar pago / Reabrir.", freq: "a cada pagamento", url: O + "financeiro.html", where: "Financeiro · aba Caixa e documentos" },
      { t: "Boletos e documentos", d: "Anexar boleto, nota ou contrato à competência (arquivo privado).", freq: "a cada documento", url: O + "financeiro.html", where: "Financeiro · aba Caixa e documentos" },
      { t: "Política da rodada e cotistas", d: "Cotas emitidas e vendidas, percentuais de reserva, cotistas da Rodada 1 e aprovação do pagamento por competência.", freq: "a cada mudança", url: O + "financeiro.html", where: "Financeiro · aba Investidores" },
      { t: "Configuração financeira de cada carregador", d: "Custo de energia, modelo (UBY, parceiro, P3), % gestão, plataforma, área e royalty, receitas e custos extras, e Fechar e arquivar a competência. Escolha a estação:", freq: "mensal (fechamento)", stations: true }
    ] },
    { title: "Gestão de obras", items: [
      { t: "Obras, fases e tarefas", d: "Nova obra, avanço das fases, protocolos, responsáveis e prazos. O detalhe de cada obra abre a partir do portfólio.", freq: "contínuo", url: O + "index.html", where: "Dashboard de obras" },
      { t: "Concessionária e orçamentos", d: "Protocolos, pareceres de acesso, projetos e orçamentos de engenharia.", freq: "contínuo", url: O + "engenharia.html", where: "Portal engenharia" },
      { t: "Tarefas da equipe", d: "Central compartilhada de tarefas e responsáveis.", freq: "contínuo", url: PUB + "tarefas/", where: "Tarefas" },
      { t: "Mercado EV", d: "Itens e referências de mercado usados nas análises.", freq: "quando atualizar", url: O + "mercado.html", where: "Mercado" }
    ] }
  ];

  function render(target) {
    let stations = [];
    try { stations = UBY.data("finance", "").rows; } catch (_) {}
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Entrada de dados</p><h1>Central de lançamentos</h1>
        <p class="lead">Tudo o que entra na plataforma, em um lugar. As importações de planilhas já são feitas aqui na nova; os demais lançamentos ainda abrem na plataforma publicada. Depois de lançar, clique em ↻ no topo para atualizar.</p></div>
        <div class="callout"><strong>Importações liberadas aqui</strong><small>Planilhas de recargas e cadastro de clientes gravam direto na base real, com as mesmas regras de deduplicação, histórico e backup da plataforma atual. Todo o resto continua só leitura na nova.</small></div></div>
      ${GROUPS.map(g => `
        <section class="section"><div class="section-head"><div><p class="kicker">${esc(g.title)}</p><h2>O que lançar em ${esc(g.title.toLowerCase())}</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Informação</th><th>Como entra</th><th>Onde fica</th><th>Frequência</th><th></th></tr></thead><tbody>
            ${g.items.map(it => `<tr><td><strong>${esc(it.t)}</strong></td><td style="white-space:normal;min-width:300px">${esc(it.d)}
              ${it.stations ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${stations.map(s => `<a class="btn" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none" href="${esc(`${O}recargas.html?obra=${encodeURIComponent(s.workId)}&openReport=financeiro&station=${encodeURIComponent(s.station)}`)}">${esc(s.station)} ↗</a>`).join("") || "<small>Nenhuma estação UBY carregada ainda.</small>"}</div>` : ""}</td>
              <td style="white-space:normal">${esc(it.where || "relatório financeiro da estação")}</td><td>${esc(it.freq)}</td>
              <td class="num">${it.route ? `<a class="btn primary link-btn" href="${esc(it.route)}">Importar aqui →</a>` : it.url ? `<a class="btn primary" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none" href="${esc(it.url)}">Abrir ↗</a>` : ""}</td></tr>`).join("")}
          </tbody></table></div>
        </section>`).join("")}`;
  }

  UBY.register("lancamentos", { render });
})();

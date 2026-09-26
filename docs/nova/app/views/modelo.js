/* Modelo operacional — a cadeia Obra → Unidade → Carregador → Sessão → Consolidação, com contagens reais. */
(function () {
  "use strict";
  const { fmt, esc } = UBY;
  let obrasSnap = null, obrasLoading = false;

  function render(target) {
    if (!obrasSnap && !obrasLoading) {
      obrasLoading = true;
      UBY.obras().then(res => { obrasSnap = res.data; }).catch(() => {}).finally(() => { obrasLoading = false; if (location.hash.startsWith("#/modelo")) UBY.rerender(); });
    }
    const stations = UBY.data("stations", "");
    const cmd = UBY.data("command", "");
    const included = cmd.chargerTable.filter(r => r.included);
    const sessions = stations.reduce((s, x) => s + x.sessions, 0);
    const valid = stations.reduce((s, x) => s + x.valid, 0);

    const step = (i, title, big, sub) => `<div class="flow-step"><span class="n">${i}</span><strong>${title}</strong><span class="big">${big}</span><small>${sub}</small></div>`;
    const link = (href, icon, title, sub) => `<a class="hub-link" href="${href}"><i>${icon}</i><span><strong>${title}</strong><small>${sub}</small></span><span>→</span></a>`;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Visão e estrutura</p><h1>Modelo operacional</h1>
        <p class="lead">Cada painel é um recorte da mesma trilha. A passagem de obra para operação não apaga a obra nem cria uma base paralela.</p></div>
        <div class="callout"><strong>Regra de preservação</strong><small>Nenhum indicador, separação de base, histórico ou ação existente sai da plataforma por causa do novo visual. Telas marcadas como CLÁSSICO no menu continuam com as funções originais até a migração.</small></div></div>

      <section class="section"><div class="section-head"><div><p class="kicker">Cadeia principal · acumulado real</p><h2>Da obra à decisão</h2></div></div>
        <div class="flow">
          ${step(1, "Obra", obrasSnap ? fmt.int(obrasSnap.stats.count) : "…", obrasSnap ? `ativas · ${obrasSnap.pipeline.find(p => p.stage === "Concluida")?.count || 0} concluídas · fases, documentos e custos` : "lendo obras…")}
          ${step(2, "Unidade / estação", fmt.int(stations.length), "estações com base salva por obra")}
          ${step(3, "Carregador", fmt.int(cmd.chargerTable.length), `${included.length} na operação UBY · DC entra por padrão`)}
          ${step(4, "Sessão", fmt.int(sessions), `${fmt.int(valid)} válidas · falhas preservadas para auditoria`)}
          ${step(5, "Consolidação", fmt.brl0(cmd.network.revenue), "DC, AC e parceiros separados; fechamento por competência")}
        </div>
      </section>

      <div class="grid g2" style="gap:18px">
        <section class="section" style="border-top:3px solid var(--uby-citrus)"><p class="kicker">Núcleo 1</p><h2>Gestão de obras</h2><p>Da prospecção ao comissionamento: prazos, etapas, concessionária, energia e documentos.</p>
          <div class="hub-links" style="margin-top:12px">
            ${link("#/obras", "⌑", "Portfólio de obras", "status, fases, pendências e detalhe de cada obra")}
            ${link("#/mapa", "⌖", "Mapa de implantação", "localização e situação das unidades")}
            ${link("#/engenharia", "⚡", "Engenharia e concessionária", "protocolos, projetos e orçamentos")}
            ${link("#/analisadores", "∿", "Analisadores de energia", "relatórios elétricos por ponto")}
          </div></section>
        <section class="section" style="border-top:3px solid var(--uby-green)"><p class="kicker">Núcleo 2</p><h2>Rede de recargas</h2><p>Depois da ativação: sessões, ocupação, falhas, clientes e resultado por origem.</p>
          <div class="hub-links" style="margin-top:12px">
            ${link("#/comando", "▦", "Comando da rede", "resultado diário, DC, AC e parceiros separados")}
            ${link("#/unidades", "▤", "Unidades e carregadores", "ocupação, disponibilidade e sessões brutas")}
            ${link("#/clientes", "◎", "Clientes", "cadastro, recorrência e receita por cliente")}
            ${link("#/financeiro", "R$", "Financeiro e fechamento", "DRE, competência, custos, rateio e distribuição")}
          </div></section>
      </div>`;
  }

  UBY.register("modelo", { render });
})();

/* Arquivo de documentos publicados — fechamentos, extratos de cotista e prestações de contas (tabela uby_documentos). */
(function () {
  "use strict";
  const { fmt, esc, kpi } = UBY;
  const TYPE = { fechamento: "Fechamento da rede", cotista: "Extrato do cotista", area: "Prestação de contas à área" };
  let docs = null, error = "", loading = false;
  const bridge = () => document.getElementById("motorFrame").contentWindow.UBY_SUPABASE;

  function load(target) {
    if (loading) return;
    loading = true;
    bridge().listDocuments({ limit: 500 }).then(r => { docs = r; error = ""; }).catch(err => { docs = []; error = err.message; })
      .finally(() => { loading = false; if (location.hash.startsWith("#/arquivo")) render(target); });
  }

  function render(target) {
    if (!docs) {
      target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Lendo o arquivo de documentos</h2></div>`;
      load(target);
      return;
    }
    const active = docs.filter(d => !d.revogado_em);
    const months = [...new Set(active.map(d => d.competencia))].sort().reverse();
    const people = new Set(active.filter(d => d.destinatario_email).map(d => d.destinatario_email));
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão e governança · documentos publicados</p><h1>Arquivo de fechamentos</h1>
        <p class="lead">Versões finais publicadas a partir de Parâmetros → Fechamentos. Não podem ser alteradas nem apagadas; um mês reaprovado ganha uma nova versão e as anteriores continuam guardadas.</p></div>
        <div class="callout"><strong>Publicar um mês</strong><small>Aprove em <a href="#/parametros/fechamentos">Parâmetros → Fechamentos</a> e clique em "Publicar documentos".</small></div></div>
      ${error ? `<div class="note" style="margin-bottom:14px">${esc(error)}</div>` : ""}
      <section class="section"><div class="grid g4">
        ${kpi("Documentos ativos", fmt.int(active.length), `${fmt.int(docs.length - active.length)} revogado(s)`, "", "lead")}
        ${kpi("Competências publicadas", fmt.int(months.length), months[0] ? `última: ${esc(UBY.state.api.monthName(months[0]))}` : "")}
        ${kpi("Cotistas e áreas com acesso", fmt.int(people.size), "e-mails que recebem documentos")}
        ${kpi("Fechamentos da rede", fmt.int(active.filter(d => d.tipo === "fechamento").length), "incluindo versões")}
      </div></section>
      ${months.map(mk => `<section class="section"><div class="section-head"><div><p class="kicker">Competência</p><h2>${esc(UBY.state.api.monthName(mk))}</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Destinatário</th><th class="num">Versão</th><th>Publicado</th><th></th></tr></thead><tbody>
          ${docs.filter(d => d.competencia === mk).sort((a, b) => (a.tipo === "fechamento" ? -1 : 1) - (b.tipo === "fechamento" ? -1 : 1) || b.versao - a.versao).map(d => `<tr class="${d.revogado_em ? "muted" : ""}">
            <td><strong>${esc(d.titulo)}</strong>${d.revogado_em ? `<small>revogado em ${fmt.dt(d.revogado_em)}</small>` : ""}</td><td>${esc(TYPE[d.tipo] || d.tipo)}</td>
            <td>${esc(d.destinatario_nome || "—")}${d.destinatario_email ? `<small>${esc(d.destinatario_email)}</small>` : "<small>uso interno</small>"}</td>
            <td class="num">v${d.versao}</td><td>${fmt.dt(d.criado_em)}<small>${esc(d.criado_por_email || "")}</small></td>
            <td><button class="btn" type="button" data-open="${esc(d.id)}">Abrir</button></td></tr>`).join("")}
        </tbody></table></div></section>`).join("") || (error ? "" : `<section class="section"><div class="note">Nenhum documento publicado ainda.</div></section>`)}`;
    target.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { const d = await bridge().documentHtml(b.dataset.open); UBY.reports.open(d.html); }
      catch (err) { alert(err.message); }
      b.disabled = false;
    });
  }

  UBY.register("arquivo", { render });
})();

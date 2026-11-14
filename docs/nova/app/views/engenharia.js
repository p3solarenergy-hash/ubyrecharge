/*
  Engenharia e concessionária — tela nova (antes: legado/obra-ev/engenharia.html em moldura).
  Mesmas regras da página antiga:
   - quadro dos processos com a concessionária (segundo padrão / aumento de carga) de todas as obras
     não concluídas: atraso = previsão vencida e etapa não liberada; energizado = última etapa liberada;
     etapa ativa = em andamento, senão a atrasada, senão a primeira aberta.
   - planejador de visitas/etapas: fica só neste navegador (mesma chave da página antiga).
   - calculadora preliminar de materiais (mesmas fórmulas).
  A edição de cada etapa (situação, protocolo, datas, observação) é feita no detalhe da obra (Fases e tarefas).
*/
(function () {
  "use strict";
  const { esc, kpi } = UBY;
  const PROCESSES = [
    { id: "segundo-padrao", label: "Segundo padrão", request: "Pedido segundo padrao", steps: ["Pedido segundo padrao", "Protocolo aberto na concessionaria", "Projeto enviado para analise", "Aprovacao da concessionaria", "Ligacao ou energizacao liberada"] },
    { id: "aumento-carga", label: "Aumento de carga", request: "Pedido de aumento de carga", steps: ["Definicao se precisa aumento de carga", "Pedido de aumento de carga", "Protocolo aberto na concessionaria", "Projeto enviado para analise", "Aprovacao da concessionaria", "Ligacao ou energizacao liberada"] }
  ];
  const PLANNER_KEY = "uby-engineering-planner-v1";
  const MATERIAL_KEY = "uby-material-calculator-v1";
  const PHASES = ["Projeto", "Concessionaria", "Orcamento", "Obra civil", "Obra eletrica", "Comissionamento"];
  let snap = null, api = null, error = "", loading = false;
  const ui = { calc: null };

  const released = s => s === "done" || s === "na";
  const isOverdue = t => t.forecastDate && !released(t.status) && new Date(t.forecastDate + "T23:59:59") < new Date();
  const fmtDate = v => { if (!v) return "—"; const p = String(v).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; };
  const stepShort = t => t.replace("Pedido de ", "").replace("Pedido ", "").replace(" na concessionaria", "").replace(" para analise", "")
    .replace("Ligacao ou energizacao liberada", "Energizado").replace("Definicao se precisa aumento de carga", "Definir necessidade").replace("Aprovacao da concessionaria", "Aprovação");

  function ensure(target) {
    if (snap || loading) return;
    loading = true;
    UBY.obras().then(r => { snap = r.data; api = r.api; error = ""; }).catch(e => { error = e.message; })
      .finally(() => { loading = false; if (location.hash.startsWith("#/engenharia")) render(target); });
  }
  function utilityTasks(id) {
    const d = api.obraDetail(id);
    const ph = (d?.phases || []).find(p => p.name === "Concessionaria");
    return ph ? ph.tasks : [];
  }
  function processItem(work, process) {
    const ut = utilityTasks(work.id);
    const byTitle = title => ut.find(t => t.title === title) || { title, status: "pending", note: "", protocol: "", requestDate: "", forecastDate: "" };
    const tasks = process.steps.map(byTitle), request = byTitle(process.request);
    const done = tasks.filter(t => released(t.status)).length, open = tasks.filter(t => !released(t.status)), late = tasks.filter(isOverdue);
    const energized = released(tasks[tasks.length - 1]?.status);
    const active = open.find(t => t.status === "doing") || late[0] || open[0] || tasks[tasks.length - 1];
    const protocol = (request.protocol || tasks.find(t => t.protocol)?.protocol || "").trim();
    return { work, tasks, active, protocol, requestDate: request.requestDate || tasks.find(t => t.requestDate)?.requestDate || "",
      forecastDate: request.forecastDate || tasks.find(t => t.forecastDate)?.forecastDate || "", note: active?.note || request.note || tasks.find(t => t.note)?.note || "",
      pct: Math.round(done / tasks.length * 100), openCount: open.length, late: late.length > 0, energized };
  }
  function items(process) {
    return snap.works.filter(w => !/conclu/i.test(w.status || "")).map(w => processItem(w, process))
      .sort((a, b) => Number(b.late) - Number(a.late) || Number(a.energized) - Number(b.energized) || b.openCount - a.openCount || a.pct - b.pct || a.work.nome.localeCompare(b.work.nome));
  }
  const planner = () => { try { return JSON.parse(localStorage.getItem(PLANNER_KEY)) || []; } catch (_) { return []; } };
  const savePlanner = list => { try { localStorage.setItem(PLANNER_KEY, JSON.stringify(list)); } catch (_) {} };
  const nextBreaker = a => [32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400].find(v => v >= a) || 400;
  const cableSize = a => a <= 50 ? "10 mm2" : a <= 80 ? "16 mm2" : a <= 105 ? "25 mm2" : a <= 140 ? "35 mm2" : a <= 180 ? "50 mm2" : a <= 230 ? "70 mm2" : a <= 285 ? "95 mm2" : "120 mm2 ou paralelo";
  const conduit = s => { const n = parseInt(s, 10) || 120; return n <= 16 ? "1 a 1.1/4 pol" : n <= 35 ? "1.1/2 pol" : n <= 70 ? "2 pol" : "3 pol ou eletrocalha"; };
  function calcular(c) {
    const kw = Number(c.kw) || 0, distance = Number(c.distance) || 0, voltage = Number(c.voltage) || 380, reserve = Number(c.reserve) || 0;
    if (!kw) return null;
    const amps = (kw * 1000) / (voltage * 1.732 * .92), design = amps * (1 + reserve / 100);
    const r = { kw, distance, voltage, reserve, amps: Math.round(amps), breaker: nextBreaker(design * 1.15), cable: cableSize(design), meters: Math.ceil(distance * (1 + reserve / 100)) };
    try { localStorage.setItem(MATERIAL_KEY, JSON.stringify(r)); } catch (_) {}
    return r;
  }

  function render(target) {
    if (!snap) {
      ensure(target);
      target.innerHTML = error ? `<div class="loading"><h2>Não foi possível ler as obras</h2><p>${esc(error)}</p></div>` : `<div class="loading"><div class="spinner"></div><h2>Lendo obras e processos da concessionária</h2></div>`;
      return;
    }
    const works = snap.works;
    const allUt = works.flatMap(w => utilityTasks(w.id)).filter(t => t.status === "pending" || t.status === "doing");
    const needsProtocol = t => /pedido|consulta|protocolo|projeto enviado|aprovacao|ligacao/i.test(t.title);
    if (!ui.calc) {
      let saved = null; try { saved = JSON.parse(localStorage.getItem(MATERIAL_KEY)); } catch (_) {}
      ui.calc = { work: works[0]?.id || "", kw: saved?.kw || works[0]?.kw || 60, distance: saved?.distance ?? 20, voltage: saved?.voltage || 380, reserve: saved?.reserve ?? 20 };
    }
    const res = calcular(ui.calc);
    const byId = new Map(works.map(w => [w.id, w]));
    const plan = planner().filter(i => byId.has(i.obraId)).sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
    const lane = p => {
      const list = items(p), late = list.filter(i => i.late).length, open = list.filter(i => !i.energized).length;
      return `<section class="section"><div class="section-head"><div><p class="kicker">${p.steps.length} etapas até a energização</p><h2>${esc(p.label)}</h2></div>
        <div><span class="badge ${late ? "bad" : "ok"}">${late} atrasado(s)</span> <span class="badge neutral">${open} em aberto</span></div></div>
        <div class="table-wrap"><table><thead><tr><th>Obra</th><th>Etapas</th><th>Etapa atual</th><th>Protocolo</th><th>Pedido</th><th>Previsão</th><th>Situação</th></tr></thead><tbody>
        ${list.map(i => `<tr><td style="white-space:normal"><a href="#/obras/obra/${encodeURIComponent(i.work.id)}/fases"><strong>${esc(i.work.nome)}</strong></a><small>${esc(i.work.cliente || "")}</small></td>
          <td style="white-space:normal;min-width:220px">${i.tasks.map(t => `<span class="badge ${isOverdue(t) ? "bad" : released(t.status) ? "ok" : t.status === "doing" ? "warn" : "neutral"}" style="margin:1px" title="${esc(t.title)}">${esc(stepShort(t.title))}</span>`).join("")}</td>
          <td style="white-space:normal">${esc(stepShort(i.active?.title || ""))}${i.note ? `<small>${esc(i.note)}</small>` : ""}</td><td>${esc(i.protocol || "—")}</td><td>${fmtDate(i.requestDate)}</td><td>${fmtDate(i.forecastDate)}</td>
          <td><span class="badge ${i.late ? "bad" : i.energized ? "ok" : "warn"}">${i.late ? "Atrasado" : i.energized ? "Energizado" : i.openCount ? "Em aberto" : "Sem pendência"}</span><small>${i.pct}%</small></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhuma obra em andamento.</td></tr>`}
        </tbody></table></div></section>`;
    };
    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão de obras · engenharia</p><h1>Engenharia e concessionária</h1>
        <p class="lead">Pedidos, protocolos e prazos com a concessionária em todas as obras, planejamento da engenharia e estimativa preliminar de materiais.</p></div>
        <div class="callout"><strong>Editar uma etapa</strong><small>Clique na obra: abre "Fases e tarefas" no detalhe da obra, onde situação, protocolo, datas e observação são gravados na base real.</small></div></div>
      <section class="section"><div class="grid g4">
        ${kpi("Obras", String(works.length), "na base oficial", "", "lead")}
        ${kpi("Etapas da concessionária abertas", String(allUt.length), "pendentes ou em andamento")}
        ${kpi("Sem protocolo", String(allUt.filter(t => needsProtocol(t) && !t.protocol).length), "pedido feito sem número", "", "warn")}
        ${kpi("Prazos vencidos", String(allUt.filter(isOverdue).length), "previsão já passou", "", allUt.some(isOverdue) ? "bad" : "")}
      </div></section>
      ${PROCESSES.map(lane).join("")}
      <div class="split">
        <section class="section"><div class="section-head"><div><p class="kicker">Planejamento · só neste navegador</p><h2>Agenda da engenharia</h2></div></div>
          <div class="toolbar" style="flex-wrap:wrap;gap:6px">
            <select class="select" id="egWork">${works.map(w => `<option value="${esc(w.id)}">${esc(w.nome)}</option>`).join("")}</select>
            <select class="select" id="egPhase">${PHASES.map(p => `<option>${esc(p)}</option>`).join("")}</select>
            <input class="select" type="date" id="egDate"><input class="select" id="egOwner" placeholder="Responsável">
            <button class="btn primary" id="egAdd">Adicionar</button></div>
          <div class="list">${plan.map(i => `<div class="list-row"><span><strong>${esc(byId.get(i.obraId).nome)}</strong><small style="display:block">${esc(i.phase)} · ${esc(i.owner)}</small></span><span>${i.date ? fmtDate(i.date) : "Sem data"} <button class="btn" data-eg-del="${esc(i.id)}" title="Remover">✕</button></span></div>`).join("") || `<div class="note">Nada planejado.</div>`}</div></section>
        <section class="section"><div class="section-head"><div><p class="kicker">Estimativa preliminar</p><h2>Calculadora de materiais</h2></div></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
            <label class="imp-field"><span class="k">Obra</span><select class="select" id="egCalcWork">${works.map(w => `<option value="${esc(w.id)}" ${w.id === ui.calc.work ? "selected" : ""}>${esc(w.nome)}</option>`).join("")}</select></label>
            <label class="imp-field"><span class="k">Potência (kW)</span><input class="select" type="number" data-calc="kw" value="${esc(ui.calc.kw)}"></label>
            <label class="imp-field"><span class="k">Distância (m)</span><input class="select" type="number" data-calc="distance" value="${esc(ui.calc.distance)}"></label>
            <label class="imp-field"><span class="k">Tensão</span><select class="select" data-calc="voltage"><option value="380" ${Number(ui.calc.voltage) === 380 ? "selected" : ""}>380 V trifásico</option><option value="220" ${Number(ui.calc.voltage) === 220 ? "selected" : ""}>220 V trifásico</option></select></label>
            <label class="imp-field"><span class="k">Reserva (%)</span><input class="select" type="number" data-calc="reserve" value="${esc(ui.calc.reserve)}"></label>
          </div>
          ${res ? `<div class="list" style="margin-top:10px">${[["Corrente estimada", `${res.amps} A`], ["Disjuntor de referência", `${res.breaker} A`], ["Cabo preliminar", res.cable], ["Infra sugerida", conduit(res.cable)], ["Metragem com reserva", `${res.meters || "—"} m`]].map(([k, v]) => `<div class="list-row"><span>${k}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
            <p class="note" style="margin-top:8px">Estimativa para conversa técnica e orçamento inicial. Validar queda de tensão, método de instalação, temperatura, agrupamento, aterramento, DPS/DR e projeto executivo antes da compra.</p>`
            : `<div class="note" style="margin-top:10px">Escolha uma obra ou informe a potência para estimar materiais.</div>`}</section>
      </div>`;
    const $ = s => target.querySelector(s);
    $("#egAdd").onclick = () => {
      const obraId = $("#egWork").value; if (!obraId) return;
      const list = planner(); list.unshift({ id: "plan-" + Date.now(), obraId, phase: $("#egPhase").value, date: $("#egDate").value, owner: $("#egOwner").value.trim() || "Engenharia", status: "Aberto" });
      savePlanner(list); render(target);
    };
    target.querySelectorAll("[data-eg-del]").forEach(b => b.onclick = () => { savePlanner(planner().filter(i => i.id !== b.dataset.egDel)); render(target); });
    $("#egCalcWork").onchange = e => { const w = works.find(x => x.id === e.target.value); ui.calc.work = e.target.value; if (w) ui.calc.kw = w.kw || 60; render(target); };
    target.querySelectorAll("[data-calc]").forEach(el => el.onchange = () => { ui.calc[el.dataset.calc] = el.value; render(target); });
  }

  UBY.register("engenharia", { render });
})();

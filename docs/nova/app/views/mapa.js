/* Mapa de implantação — pontos da tela original, situação da obra vinculada e desempenho de quem já opera. */
(function () {
  "use strict";
  const { fmt, esc } = UBY;
  const LEGACY_MAP = "legado/obra-ev/mapa-implantacao.html";
  const MAP_KEY = "uby-mapa-implantacao-v1";
  const STATUS_OVERRIDES = { malassise: "Concluida" };
  const ROUNDS = ["1ª Rodada", "1ª e 2ª Rodadas", "2ª Rodada", "Próximas Rodadas", "Frente de expansão"];
  let points = null, leafletReady = null, selectedId = "", error = null;

  // Lê a lista POINTS da própria tela original, para não manter duas cópias.
  async function loadPoints() {
    const html = await (await fetch(LEGACY_MAP, { cache: "no-store" })).text();
    const match = html.match(/const POINTS=(\[[\s\S]*?\])\.map\(/);
    if (!match) throw new Error("Lista de pontos não encontrada na tela original do mapa.");
    const rows = new Function(`"use strict";return ${match[1]};`)();
    return rows.map(([id, name, round, lat, lon, note]) => ({ id, name, round, lat, lon, note }));
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const js = document.createElement("script"); js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; js.onload = resolve; js.onerror = () => reject(new Error("Não foi possível carregar o mapa (Leaflet).")); document.head.appendChild(js);
    });
    return leafletReady;
  }

  const workStatus = w => STATUS_OVERRIDES[w?.id] || w?.status || "Prospecção / Estudo";
  const isDone = w => /conclu|operac[aã]o|ativo/i.test(workStatus(w));
  const colorFor = (p, w) => w ? (isDone(w) ? "#187457" : "#3d6f8e") : ({ "1ª e 2ª Rodadas": "#77637d", "Próximas Rodadas": "#b98527", "Frente de expansão": "#8a9690", "1ª Rodada": "#173c30" }[p.round] || "#3d6f8e");

  function links(works) {
    let local = {};
    try { local = JSON.parse(localStorage.getItem(MAP_KEY) || "{}"); } catch (_) {}
    const byPoint = {};
    works.forEach(w => { if (w.mapLocation?.pointId) byPoint[w.mapLocation.pointId] = w; });
    Object.entries(local).forEach(([pointId, workId]) => { if (!byPoint[pointId]) { const w = works.find(x => String(x.id) === String(workId)); if (w) byPoint[pointId] = w; } });
    return byPoint;
  }

  function render(target) {
    if (!points && !error) {
      target.innerHTML = `<div class="loading"><div class="spinner"></div><h2>Montando o mapa</h2></div>`;
      Promise.all([loadPoints(), loadLeaflet(), UBY.obras()]).then(([p]) => { points = p; }).catch(err => { error = err.message; })
        .finally(() => { if (location.hash.startsWith("#/mapa") && !location.hash.startsWith("#/mapa-")) render(target); });
      return;
    }
    if (error) { target.innerHTML = `<div class="loading"><h2>Não foi possível montar o mapa</h2><p>${esc(error)}</p><a class="btn" href="#/mapa-classico">Abrir mapa original</a></div>`; return; }
    UBY.obras().then(({ data }) => draw(target, data.works));
  }

  function draw(target, works) {
    const byPoint = links(works);
    const month = UBY.state.months.at(-1) || "";
    const stations = UBY.state.api && UBY.state.status ? UBY.data("stations", month) : [];
    const monthName = UBY.state.api && month ? UBY.state.api.monthName(month) : "";
    const perf = w => { const rows = stations.filter(s => String(s.workId) === String(w.id) && s.sessions); return rows.length ? { revenue: rows.reduce((a, s) => a + s.revenue, 0), occupancy: rows[0].occupancy } : null; };
    const linked = points.filter(p => byPoint[p.id]);
    const done = linked.filter(p => isDone(byPoint[p.id]));
    const sel = points.find(p => p.id === selectedId);
    const selWork = sel ? byPoint[sel.id] : null;
    const selPerf = selWork ? perf(selWork) : null;

    target.innerHTML = `
      <div class="hero"><div><p class="eyebrow">Gestão de obras</p><h1>Mapa de implantação</h1>
        <p class="lead">Rodadas de implantação, próximas áreas e frentes de expansão, com a situação da obra vinculada e o desempenho de quem já opera.</p></div>
        <div class="callout"><strong>${points.length} pontos · ${linked.length} vinculados a obras · ${done.length} em operação</strong><small>Vincular um ponto a uma obra ou criar obra a partir do ponto: <a href="#/mapa-classico">mapa original (edição)</a>.</small></div></div>
      <div class="split" style="grid-template-columns:minmax(0,1.6fr) minmax(280px,.8fr);margin-bottom:18px">
        <section class="section" style="padding:0;overflow:hidden;margin:0"><div id="ubyMap" style="height:620px"></div></section>
        <section class="section" style="margin:0">
          ${sel ? `<p class="kicker">${esc(sel.round)}</p><h2>${esc(sel.name)}</h2><p style="margin:4px 0 10px;font-size:11.5px">${esc(sel.note)}</p>
            ${selWork ? `<div class="list"><div class="list-row"><span>Obra vinculada</span><strong>${esc(selWork.nome)}</strong></div>
              <div class="list-row"><span>Situação</span><span class="badge ${isDone(selWork) ? "ok" : "warn"}">${esc(isDone(selWork) ? "Concluída" : workStatus(selWork))}</span></div>
              ${!isDone(selWork) ? `<div class="list-row"><span>Avanço</span><strong>${selWork.pct}%</strong></div><div class="list-row"><span>Pendências críticas</span><strong>${selWork.crit}</strong></div>` : ""}
              ${selPerf ? `<div class="list-row"><span>Faturamento ${esc(monthName)}</span><strong>${fmt.brl(selPerf.revenue)}</strong></div><div class="list-row"><span>Ocupação</span><strong>${fmt.pct1(selPerf.occupancy)}</strong></div>` : ""}</div>
              <p style="margin:10px 0 0"><a class="btn link-btn" href="#/obras/obra/${encodeURIComponent(selWork.id)}">Abrir obra →</a></p>`
            : `<div class="note">Ainda sem obra vinculada. O vínculo é feito no mapa original.</div>`}
            <p style="margin:10px 0 0"><a href="#" id="mapClear" style="font-size:11px">ver legenda</a></p>`
          : `<p class="kicker">Legenda</p><h2>Clique num ponto</h2>
            <div class="list" style="margin-top:10px">${[["#187457", "Obra vinculada e em operação"], ["#3d6f8e", "Obra vinculada em andamento"], ["#173c30", "1ª Rodada"], ["#77637d", "1ª e 2ª Rodadas"], ["#b98527", "Próximas Rodadas"], ["#8a9690", "Frente de expansão (local a definir)"]].map(([c, l]) => `<div class="list-row"><span style="display:flex;align-items:center;gap:8px"><i style="width:12px;height:12px;border-radius:50%;background:${c};display:inline-block"></i>${l}</span></div>`).join("")}</div>`}
        </section>
      </div>
      <section class="section"><div class="section-head"><div><p class="kicker">Por rodada</p><h2>Pontos e obras</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Ponto</th><th>Rodada</th><th>Local</th><th>Obra vinculada</th><th>Situação</th><th class="num">Avanço</th><th class="num">Faturamento ${esc(monthName)}</th></tr></thead>
          <tbody>${ROUNDS.flatMap(r => points.filter(p => p.round === r)).concat(points.filter(p => !ROUNDS.includes(p.round))).map(p => { const w = byPoint[p.id]; const pf = w ? perf(w) : null; return `<tr class="clickable" data-point="${esc(p.id)}">
            <td><strong>${esc(p.name)}</strong></td><td>${esc(p.round)}</td><td style="white-space:normal"><small style="color:var(--uby-muted)">${esc(p.note)}</small></td>
            <td>${w ? esc(w.nome) : "—"}</td><td>${w ? `<span class="badge ${isDone(w) ? "ok" : "warn"}">${esc(isDone(w) ? "Concluída" : workStatus(w))}</span>` : '<span class="badge neutral">sem vínculo</span>'}</td>
            <td class="num">${w ? (isDone(w) ? "100%" : `${w.pct}%`) : "—"}</td><td class="num">${pf ? fmt.brl(pf.revenue) : "—"}</td></tr>`; }).join("")}</tbody></table></div>
      </section>`;

    target.querySelectorAll("tr[data-point]").forEach(tr => tr.onclick = () => { selectedId = tr.dataset.point; draw(target, works); window.scrollTo({ top: 0, behavior: "smooth" }); });
    const clr = target.querySelector("#mapClear"); if (clr) clr.onclick = e => { e.preventDefault(); selectedId = ""; draw(target, works); };
    const map = L.map(target.querySelector("#ubyMap"), { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    points.forEach(p => {
      const w = byPoint[p.id];
      const isSel = p.id === selectedId;
      const m = L.circleMarker([p.lat, p.lon], { radius: isSel ? 12 : p.round === "Frente de expansão" ? 11 : 8, color: isSel ? "#c6d449" : "#fff", weight: isSel ? 4 : 2,
        fillColor: colorFor(p, w), fillOpacity: p.round === "Frente de expansão" && !w ? .45 : 1, dashArray: p.round === "Frente de expansão" && !w ? "5,4" : null }).addTo(map);
      m.bindTooltip(p.name, { direction: "top" });
      m.on("click", () => { selectedId = p.id; draw(target, works); });
    });
    if (sel) map.setView([sel.lat, sel.lon], 12); else map.fitBounds(points.map(p => [p.lat, p.lon]), { padding: [30, 30] });
  }

  UBY.register("mapa", { render });
})();

/*
  Mantém a posição da tela quando uma tela se redesenha (salvar, adicionar, motor recalculando).
  O redesenho troca o conteúdo; se a página encolhe no meio (ex.: "Atualizando"), o navegador joga
  a rolagem para cima sozinho. Aqui a posição fica guardada e volta quando o conteúdo reaparece.
  Só a troca de tela (route) e os saltos pedidos pelo sistema chamam reset() e mudam a posição.
*/
(function () {
  "use strict";
  if (typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return;
  const EXPIRA_MS = 30000;
  let wanted = window.scrollY, pending = false, since = 0, userAt = 0, dragging = false, freeUntil = 0, innerQueued = false;
  const inner = new Map();

  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const deliberate = () => dragging || Date.now() - userAt < 350 || Date.now() < freeUntil;
  const markUser = () => { userAt = Date.now(); };
  const hold = () => { if (!pending) { pending = true; since = Date.now(); } };

  function onScroll() {
    const y = window.scrollY;
    if (deliberate()) { wanted = y; pending = false; return; }
    if (y < wanted - 1 && (pending || y >= maxY() - 1)) { hold(); return; }
    wanted = y;
  }

  function restore() {
    const m = maxY();
    if (!pending && wanted > m + 1) hold();
    if (!pending) return;
    if (Date.now() - since > EXPIRA_MS) { pending = false; wanted = window.scrollY; return; }
    const target = Math.min(wanted, m);
    if (window.scrollY < target - 1) window.scrollTo({ top: target, behavior: "instant" });
    if (m >= wanted - 1) pending = false;
  }

  // Tabelas com rolagem própria: o redesenho cria uma tabela nova, que volta ao início.
  const tableKey = el => (el.querySelector("thead")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
  function restoreTables(view) {
    innerQueued = false;
    view.querySelectorAll(".table-wrap").forEach(el => {
      const saved = inner.get(tableKey(el));
      if (saved && !el.scrollTop && !el.scrollLeft) { el.scrollTop = saved[0]; el.scrollLeft = saved[1]; }
    });
  }

  function start() {
    const view = document.getElementById("view");
    if (!view) return;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", markUser, { passive: true });
    window.addEventListener("touchmove", markUser, { passive: true });
    window.addEventListener("keydown", e => { if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key) && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "")) markUser(); });
    // Clique fora do conteúdo é a barra de rolagem sendo arrastada.
    window.addEventListener("pointerdown", e => { if (e.target === document.documentElement) dragging = true; });
    window.addEventListener("pointerup", () => { if (dragging) { dragging = false; markUser(); } });
    document.addEventListener("scroll", e => {
      const el = e.target;
      if (el?.matches?.(".table-wrap")) inner.set(tableKey(el), [el.scrollTop, el.scrollLeft]);
    }, { capture: true, passive: true });
    new ResizeObserver(restore).observe(view);
    new MutationObserver(() => {
      if (innerQueued || !inner.size) return;
      innerQueued = true;
      requestAnimationFrame(() => restoreTables(view));
    }).observe(view, { childList: true, subtree: true });
  }

  window.UBY_SCROLL_KEEP = {
    // Chamar logo antes de mudar a rolagem de propósito (troca de tela, ir até um campo).
    reset() { pending = false; wanted = window.scrollY; freeUntil = Date.now() + 500; inner.clear(); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

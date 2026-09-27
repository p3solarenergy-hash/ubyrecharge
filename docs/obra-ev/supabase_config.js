window.UBY_SUPABASE_CONFIG = {
  url: "https://csxafzuaqbbsbdatuhrd.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzeGFmenVhcWJic2JkYXR1aHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Njg5ODMsImV4cCI6MjA5NDU0NDk4M30.Kb_4MIW4unNjFFLSzUDr-MDpEQmGOZbIyQTzCCZArcs",
  enabled: true
};

// PLATAFORMA ANTIGA SOMENTE CONSULTA (27/09/2026, decisão do usuário).
// Toda gravação passou para a Nova Plataforma (/ubyrecharge/nova/). Esta cópia
// antiga regravava os blocos compartilhados sem os campos novos (impostos, cotas
// por rodada, fechamentos aprovados, horários por dia, repasse à área) e apagava
// esses dados. Aqui o cliente Supabase só lê: login continua, gravações retornam erro.
(function () {
  "use strict";
  var NOVA_URL = "https://p3solarenergy-hash.github.io/ubyrecharge/nova/";
  window.UBY_OLD_READ_ONLY = true;
  function roError(action) {
    var e = new Error("Plataforma antiga em modo consulta: \"" + action + "\" não foi gravado. Faça lançamentos e edições na Nova Plataforma: " + NOVA_URL);
    e.code = "UBY_OLD_READ_ONLY";
    try { console.warn("[UBY antiga somente consulta]", action); } catch (_) {}
    return e;
  }
  function blocked(action) {
    var result = Promise.resolve({ data: null, error: roError(action), count: null });
    var chain = new Proxy(function () {}, {
      get: function (_, p) {
        if (p === "then" || p === "catch" || p === "finally") return result[p].bind(result);
        return function () { return chain; };
      },
      apply: function () { return chain; }
    });
    return chain;
  }
  var WRITES = { insert: 1, upsert: 1, update: 1, delete: 1 };
  var STORAGE_WRITES = { upload: 1, update: 1, remove: 1, move: 1, copy: 1 };
  function readOnly(raw) {
    return new Proxy(raw, {
      get: function (t, prop) {
        if (prop === "from") return function (table) {
          var b = t.from(table);
          return new Proxy(b, { get: function (bb, m) { if (WRITES[m]) return function () { return blocked(m + " em " + table); }; var v = bb[m]; return typeof v === "function" ? v.bind(bb) : v; } });
        };
        if (prop === "rpc") return function (name) { return blocked("rpc " + name); };
        if (prop === "storage") return new Proxy(t.storage, { get: function (s, m) {
          if (m !== "from") { var sv = s[m]; return typeof sv === "function" ? sv.bind(s) : sv; }
          return function (bucket) { var api = s.from(bucket); return new Proxy(api, { get: function (a, k) { if (STORAGE_WRITES[k]) return function () { return Promise.resolve({ data: null, error: roError("arquivo " + k + " em " + bucket) }); }; var av = a[k]; return typeof av === "function" ? av.bind(a) : av; } }); };
        } });
        var v = t[prop];
        return typeof v === "function" ? v.bind(t) : v;
      }
    });
  }
  function wrap(lib) {
    if (!lib || lib.__ubyReadOnly || typeof lib.createClient !== "function") return lib;
    var original = lib.createClient.bind(lib);
    lib.createClient = function () { return readOnly(original.apply(null, arguments)); };
    lib.__ubyReadOnly = true;
    return lib;
  }
  var lib = wrap(window.supabase);
  try {
    Object.defineProperty(window, "supabase", { configurable: true, get: function () { return lib; }, set: function (v) { lib = wrap(v); } });
  } catch (_) {}
  function banner() {
    if (document.getElementById("ubyOldBanner") || window.self !== window.top) return;
    var bar = document.createElement("div");
    bar.id = "ubyOldBanner";
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:sticky;top:0;z-index:99999;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 16px;background:#0A1628;color:#fff;font:600 14px/1.35 system-ui,sans-serif;text-align:center";
    bar.innerHTML = '<span>Plataforma antiga · <strong style="color:#FFD600">somente consulta</strong>. Lançamentos, importações e edições agora são feitos na Nova Plataforma.</span><a href="' + NOVA_URL + '" style="background:#00FF85;color:#0A1628;padding:6px 14px;border-radius:999px;text-decoration:none;font-weight:700">Abrir a Nova Plataforma</a>';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner); else banner();
})();

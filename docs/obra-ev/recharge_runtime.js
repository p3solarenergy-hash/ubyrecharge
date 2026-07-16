(function () {
  "use strict";

  const DB_NAME = "uby-recharge-cache";
  const STORE_NAME = "runtime";
  const METRICS_KEY = "uby-recharge-performance-v1";

  function openDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function cacheSet(key, value) {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ value, savedAt: Date.now() }, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function cacheGet(key, maxAgeMs = 0) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry || (maxAgeMs && Date.now() - entry.savedAt > maxAgeMs)) resolve(null);
        else resolve(entry.value);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function recordMetric(metric) {
    try {
      const current = JSON.parse(localStorage.getItem(METRICS_KEY) || "[]");
      current.push({ ...metric, at: new Date().toISOString() });
      localStorage.setItem(METRICS_KEY, JSON.stringify(current.slice(-40)));
    } catch (_) {}
  }

  function markReady(detail = {}) {
    const duration = Math.round(performance.now());
    recordMetric({ type: "page-ready", duration, ...detail });
    document.dispatchEvent(new CustomEvent("uby:recharge-ready", { detail: { duration, ...detail } }));
  }

  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver(list => {
        list.getEntries().filter(entry => entry.duration >= 150).forEach(entry => {
          recordMetric({ type: "long-task", duration: Math.round(entry.duration), start: Math.round(entry.startTime) });
        });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch (_) {}
  }

  window.UBY_RECHARGE_RUNTIME = { cacheGet, cacheSet, markReady };
})();

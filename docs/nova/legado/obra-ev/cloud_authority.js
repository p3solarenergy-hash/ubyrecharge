(function () {
  "use strict";

  const WORKS_KEY = "uby-obras-dashboard-v1";
  const SYNC_KEY = "uby-obras-cloud-snapshot-v2";
  const RECOVERY_PREFIX = "uby-obras-recovery-v2-";
  const CHANNEL_NAME = "uby-obras-cloud-sync-v2";
  const POLL_INTERVAL_MS = 120000;
  const MAX_RECOVERIES = 5;
  const PROBE_ID = "__uby_cloud_probe__";

  let installed = false;
  let saveQueue = Promise.resolve();
  let refreshRunning = false;
  let lastRemoteHash = "";
  let channel = null;

  function parseJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function clone(value) {
    return parseJson(JSON.stringify(value), value);
  }

  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce(function (result, key) {
          result[key] = normalize(value[key]);
          return result;
        }, {});
    }
    return value;
  }

  function hash(value) {
    return JSON.stringify(normalize(value || []));
  }

  function readSnapshot() {
    return parseJson(localStorage.getItem(SYNC_KEY), []);
  }

  function writeSnapshot(works) {
    const clean = clone(Array.isArray(works) ? works : []);
    localStorage.setItem(SYNC_KEY, JSON.stringify(clean));
    localStorage.setItem(WORKS_KEY, JSON.stringify(clean));
    lastRemoteHash = hash(clean);
    return clean;
  }

  function recoveryKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.indexOf(RECOVERY_PREFIX) === 0) keys.push(key);
    }
    return keys.sort().reverse();
  }

  function preserveRecovery(works, reason) {
    if (!Array.isArray(works) || !works.length) return null;
    const record = {
      createdAt: new Date().toISOString(),
      reason: reason || "copia preventiva",
      works: clone(works),
    };
    const key = RECOVERY_PREFIX + Date.now();
    localStorage.setItem(key, JSON.stringify(record));
    recoveryKeys().slice(MAX_RECOVERIES).forEach(function (oldKey) {
      localStorage.removeItem(oldKey);
    });
    return key;
  }

  function statusElement() {
    let element = document.getElementById("uby-cloud-authority-status");
    if (element) return element;
    element = document.createElement("button");
    element.id = "uby-cloud-authority-status";
    element.type = "button";
    element.title = "Estado da base oficial de obras";
    element.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:99999",
      "border:1px solid #1f4b5f",
      "border-radius:6px",
      "padding:8px 12px",
      "font:600 12px/1.2 system-ui,sans-serif",
      "color:#d9fdf3",
      "background:#0b1b2d",
      "box-shadow:0 8px 24px rgba(0,0,0,.25)",
      "cursor:pointer",
    ].join(";");
    element.addEventListener("click", function () {
      refreshFromCloud({ reload: true, reason: "atualizacao manual" });
    });
    (document.body || document.documentElement).appendChild(element);
    return element;
  }

  function setStatus(state, detail) {
    const labels = {
      loading: "Nuvem: consultando...",
      saving: "Nuvem: salvando...",
      synced: "Nuvem: sincronizada",
      offline: "Nuvem: indisponivel",
      error: "Nuvem: gravacao pendente",
    };
    const colors = {
      loading: "#55b6ff",
      saving: "#ffd166",
      synced: "#00f09a",
      offline: "#ffbf47",
      error: "#ff6673",
    };
    const element = statusElement();
    element.textContent = labels[state] || labels.loading;
    element.style.borderColor = colors[state] || colors.loading;
    element.style.color = colors[state] || colors.loading;
    element.title = detail || "Clique para consultar novamente a base oficial";
    document.documentElement.dataset.ubyCloudState = state;
    window.dispatchEvent(new CustomEvent("uby:cloud-status", {
      detail: { state: state, message: detail || "" },
    }));
  }

  function broadcast(type, works) {
    const message = { type: type, hash: hash(works), at: Date.now() };
    try {
      if (channel) channel.postMessage(message);
      localStorage.setItem(CHANNEL_NAME, JSON.stringify(message));
    } catch (_error) {
      // A atualizacao por foco e a verificacao remota continuam disponiveis.
    }
  }

  function isProbeResult(value) {
    return Array.isArray(value) && value.length === 1 && value[0] && value[0].id === PROBE_ID;
  }

  function isEditing() {
    const active = document.activeElement;
    if (!active) return false;
    return ["INPUT", "TEXTAREA", "SELECT"].indexOf(active.tagName) >= 0;
  }

  function install() {
    if (installed || !window.UBY_STORE) return false;
    const store = window.UBY_STORE;
    if (typeof store.loadWorks !== "function" || typeof store.saveWorks !== "function") return false;
    installed = true;

    const originalLoad = store.loadWorks.bind(store);
    const originalSave = store.saveWorks.bind(store);

    async function loadRemoteStrict() {
      const probe = [{ id: PROBE_ID, name: PROBE_ID, status: "probe" }];
      const result = await originalLoad(probe);
      if (isProbeResult(result)) {
        throw new Error("A base oficial nao respondeu ou nao esta acessivel nesta sessao.");
      }
      if (!Array.isArray(result)) {
        throw new Error("Resposta invalida da base oficial de obras.");
      }
      return result;
    }

    store.loadWorks = async function (fallback) {
      setStatus("loading", "Consultando a base oficial de obras no Supabase.");
      const localCandidate = parseJson(localStorage.getItem(WORKS_KEY), []);
      try {
        const remote = await loadRemoteStrict();
        if (localCandidate.length && hash(localCandidate) !== hash(remote)) {
          preserveRecovery(localCandidate, "versao local divergente substituida pela base oficial");
        }
        const clean = writeSnapshot(remote);
        setStatus("synced", "Base oficial confirmada em " + new Date().toLocaleTimeString("pt-BR"));
        return clean;
      } catch (error) {
        const cached = readSnapshot();
        setStatus("offline", error.message + " A tela mostra apenas a ultima copia confirmada.");
        if (cached.length) return clone(cached);
        return Array.isArray(fallback) ? clone(fallback) : [];
      }
    };

    store.saveWorks = function (nextWorks) {
      const proposed = clone(Array.isArray(nextWorks) ? nextWorks : []);
      saveQueue = saveQueue.then(async function () {
        const before = readSnapshot();
        preserveRecovery(proposed, "copia antes da confirmacao da gravacao na nuvem");
        setStatus("saving", "Gravando e conferindo a base oficial de obras.");
        try {
          await originalSave(proposed);
          const verified = await loadRemoteStrict();
          if (hash(verified) !== hash(proposed)) {
            throw new Error("A leitura de conferencia nao corresponde ao que foi gravado.");
          }
          writeSnapshot(verified);
          broadcast("saved", verified);
          setStatus("synced", "Gravacao confirmada na base oficial em " + new Date().toLocaleTimeString("pt-BR"));
          return clone(verified);
        } catch (error) {
          if (before.length) writeSnapshot(before);
          setStatus("error", error.message + " A alteracao ficou guardada como recuperacao e nao virou dado oficial.");
          window.dispatchEvent(new CustomEvent("uby:cloud-save-error", {
            detail: { error: error, proposed: proposed },
          }));
          window.alert("A alteracao nao foi confirmada na nuvem e nao sera tratada como oficial. Uma copia de recuperacao foi preservada. Verifique o login e tente novamente.");
          throw error;
        }
      });
      return saveQueue;
    };

    async function refresh(options) {
      options = options || {};
      if (refreshRunning || isEditing()) return false;
      refreshRunning = true;
      try {
        const remote = await loadRemoteStrict();
        const remoteHash = hash(remote);
        const changed = lastRemoteHash && remoteHash !== lastRemoteHash;
        writeSnapshot(remote);
        setStatus("synced", "Base oficial consultada em " + new Date().toLocaleTimeString("pt-BR"));
        if ((changed || options.reload) && options.reload !== false) {
          const reloadKey = "uby-cloud-reload-" + remoteHash.length + "-" + remoteHash.slice(0, 24);
          if (sessionStorage.getItem(reloadKey) !== "1") {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          }
        }
        return changed;
      } catch (error) {
        setStatus("offline", error.message + " Mantendo a ultima copia confirmada.");
        return false;
      } finally {
        refreshRunning = false;
      }
    }

    window.UBY_CLOUD_AUTHORITY = {
      refresh: refresh,
      getSnapshot: function () { return clone(readSnapshot()); },
      listRecoveries: function () {
        return recoveryKeys().map(function (key) {
          return { key: key, record: parseJson(localStorage.getItem(key), null) };
        });
      },
      restoreRecovery: function (key) {
        const record = parseJson(localStorage.getItem(key), null);
        if (!record || !Array.isArray(record.works)) return Promise.reject(new Error("Copia de recuperacao invalida."));
        return store.saveWorks(record.works);
      },
    };

    window.addEventListener("focus", function () { refresh({ reload: true, reason: "foco" }); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh({ reload: true, reason: "visibilidade" });
    });
    window.addEventListener("storage", function (event) {
      if (event.key === CHANNEL_NAME && event.newValue) refresh({ reload: true, reason: "outra aba" });
    });
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", function () { refresh({ reload: true, reason: "outra aba" }); });
    }
    window.setInterval(function () { refresh({ reload: true, reason: "verificacao periodica" }); }, POLL_INTERVAL_MS);
    window.setTimeout(function () { refresh({ reload: false, reason: "inicializacao" }); }, 50);
    return true;
  }

  if (!install()) {
    window.addEventListener("DOMContentLoaded", install, { once: true });
  }
}());

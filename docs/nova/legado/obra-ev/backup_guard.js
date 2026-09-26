(function () {
  const BACKUP_KEY = "uby-obras-backups-v1";
  const SESSION_KEY = "uby-obras-backup-session-v1";
  const DAILY_KEY = "uby-obras-backup-daily-v1";
  const MAX_BACKUPS = 5;
  const MAX_BACKUP_VALUE_CHARS = 120000;
  const MAX_BACKUP_TOTAL_CHARS = 500000;
  const CLOUD_BACKED_KEYS = new Set([
    "uby-recargas-db-v1",
    "uby-finance-reports-v1"
  ]);
  const PREFIXES = [
    "uby-obra-detalhe-",
    "uby-obras-dashboard",
    "uby-tarefas",
    "uby-auth-",
    "uby-engineering-",
    "uby-material-",
    "uby-activity",
    "uby-messages",
    "uby-mercado",
    "uby-recargas-",
    "uby-club-",
    "uby-calendar-",
    "p3_obras_theme",
    "uby-sidebar"
  ];

  function isManagedKey(key) {
    return PREFIXES.some(prefix => key.startsWith(prefix));
  }

  function sanitizeData(source, includeCloudBacked = false) {
    const data = {};
    let total = 0;
    Object.entries(source || {}).forEach(([key, rawValue]) => {
      if (!isManagedKey(key) || key === BACKUP_KEY) return;
      if (!includeCloudBacked && CLOUD_BACKED_KEYS.has(key)) return;
      const value = String(rawValue ?? "");
      if (!includeCloudBacked && value.length > MAX_BACKUP_VALUE_CHARS) return;
      if (!includeCloudBacked && total + value.length > MAX_BACKUP_TOTAL_CHARS) return;
      data[key] = value;
      total += value.length;
    });
    return data;
  }

  function collect(includeCloudBacked = false) {
    const source = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isManagedKey(key) && key !== BACKUP_KEY) source[key] = localStorage.getItem(key);
    }
    return sanitizeData(source, includeCloudBacked);
  }

  function readBackups() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function releaseStorage() {
    const compact = readBackups().slice(0, 2).map(item => {
      const data = sanitizeData(item?.data || {}, false);
      return {
        createdAt: item?.createdAt || new Date().toISOString(),
        reason: item?.reason || "automatico",
        count: Object.keys(data).length,
        data
      };
    }).filter(item => item.count > 0);

    localStorage.removeItem(BACKUP_KEY);
    if (!compact.length) return true;
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(compact));
      return true;
    } catch (err) {
      localStorage.removeItem(BACKUP_KEY);
      return false;
    }
  }

  function saveBackup(reason) {
    releaseStorage();
    const data = collect(false);
    const count = Object.keys(data).length;
    if (!count) return null;
    const backup = {
      createdAt: new Date().toISOString(),
      reason: reason || "automatico",
      count,
      data
    };
    const backups = [backup, ...readBackups()].slice(0, MAX_BACKUPS);
    localStorage.removeItem(BACKUP_KEY);
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
      return backup;
    } catch (err) {
      localStorage.removeItem(BACKUP_KEY);
      return null;
    }
  }

  function autoBackup() {
    releaseStorage();
    const today = new Date().toISOString().slice(0, 10);
    const lastDaily = localStorage.getItem(DAILY_KEY);
    if (lastDaily !== today && saveBackup("backup diario automatico")) {
      localStorage.setItem(DAILY_KEY, today);
    }
    if (!sessionStorage.getItem(SESSION_KEY) && saveBackup("antes de carregar pagina")) {
      sessionStorage.setItem(SESSION_KEY, "1");
    }
  }

  function exportBackup() {
    const data = collect(true);
    const backup = {
      createdAt: new Date().toISOString(),
      reason: "exportacao manual",
      count: Object.keys(data).length,
      data
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-obras-ev-" + backup.createdAt.slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        saveBackup("antes de importar backup");
        const imported = JSON.parse(String(reader.result || "{}"));
        const data = imported.data || imported;
        Object.entries(data).forEach(([key, value]) => {
          if (isManagedKey(key) && key !== BACKUP_KEY) localStorage.setItem(key, String(value));
        });
        alert("Backup restaurado. A pagina sera atualizada agora.");
        location.reload();
      } catch (err) {
        alert("Nao foi possivel restaurar o backup: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  window.UBY_BACKUP = {
    collect: () => collect(true),
    save: saveBackup,
    releaseStorage,
    export: exportBackup,
    importFile: importBackupFile
  };

  autoBackup();
})();

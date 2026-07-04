(function () {
  const BACKUP_KEY = "uby-obras-backups-v1";
  const SESSION_KEY = "uby-obras-backup-session-v1";
  const DAILY_KEY = "uby-obras-backup-daily-v1";
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

  function collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isManagedKey(key) && key !== BACKUP_KEY) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  }

  function saveBackup(reason) {
    const data = collect();
    const count = Object.keys(data).length;
    if (!count) return null;
    let backups = [];
    try {
      backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
    } catch (err) {
      backups = [];
    }
    const backup = {
      createdAt: new Date().toISOString(),
      reason: reason || "automatico",
      count,
      data
    };
    backups.unshift(backup);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 30)));
    return backup;
  }

  function autoBackup() {
    const today = new Date().toISOString().slice(0, 10);
    const lastDaily = localStorage.getItem(DAILY_KEY);
    if (lastDaily !== today) {
      saveBackup("backup diario automatico");
      localStorage.setItem(DAILY_KEY, today);
    }
    if (!sessionStorage.getItem(SESSION_KEY)) {
      saveBackup("antes de carregar pagina");
      sessionStorage.setItem(SESSION_KEY, "1");
    }
  }

  function exportBackup() {
    const backup = saveBackup("exportacao manual") || { createdAt: new Date().toISOString(), reason: "vazio", count: 0, data: {} };
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
    collect,
    save: saveBackup,
    export: exportBackup,
    importFile: importBackupFile
  };

  autoBackup();
})();

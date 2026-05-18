(function () {
  const ACTIVITY_KEY = "uby-activity-v1";
  const MESSAGE_KEY = "uby-messages-v1";
  const MAX_ITEMS = 800;

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (err) {
      return [];
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value.slice(0, MAX_ITEMS)));
  }

  function user() {
    const current = window.UBY_AUTH?.current?.();
    if (current) return {
      id: current.id || current.email || "usuario",
      label: current.label || current.email || "Usuario",
      email: current.email || "",
      role: current.role || ""
    };
    return { id: "local", label: "Usuario local", email: "", role: "" };
  }

  function nowLabel(iso) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(iso));
    } catch (err) {
      return iso;
    }
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function summarize(item) {
    const who = item.user?.label || "Usuario";
    if (item.type === "message") return `${who} enviou mensagem`;
    if (item.type === "protocol") return `${who} alterou protocolo`;
    if (item.type === "status") return `${who} alterou status`;
    if (item.type === "document") return `${who} atualizou documento`;
    if (item.type === "analysis") return `${who} vinculou analisador`;
    if (item.type === "project") return `${who} atualizou dados da obra`;
    return `${who} registrou alteracao`;
  }

  function record(entry) {
    const item = {
      id: `act-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      user: user(),
      workId: entry.workId || "geral",
      workName: entry.workName || "Geral",
      type: entry.type || "update",
      title: entry.title || "",
      detail: entry.detail || "",
      field: entry.field || "",
      before: clean(entry.before),
      after: clean(entry.after)
    };
    write(ACTIVITY_KEY, [item, ...read(ACTIVITY_KEY)]);
    return item;
  }

  function list(options = {}) {
    const items = read(ACTIVITY_KEY);
    const filtered = options.workId ? items.filter(item => item.workId === options.workId) : items;
    return filtered.slice(0, options.limit || 40);
  }

  function sendMessage(entry) {
    const text = clean(entry.text);
    if (!text) return null;
    const item = {
      id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      user: user(),
      workId: entry.workId || "geral",
      workName: entry.workName || "Geral",
      text
    };
    write(MESSAGE_KEY, [item, ...read(MESSAGE_KEY)]);
    record({
      workId: item.workId,
      workName: item.workName,
      type: "message",
      title: "Mensagem enviada",
      detail: text
    });
    return item;
  }

  function messages(options = {}) {
    const items = read(MESSAGE_KEY);
    const filtered = options.workId ? items.filter(item => item.workId === options.workId) : items;
    return filtered.slice(0, options.limit || 40);
  }

  window.UBY_ACTIVITY = {
    record,
    list,
    sendMessage,
    messages,
    summarize,
    nowLabel
  };
})();

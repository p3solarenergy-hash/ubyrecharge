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

  function mergeById(localItems, cloudItems) {
    const map = new Map();
    [...cloudItems, ...localItems].forEach(item => {
      if (item?.id) map.set(item.id, item);
    });
    return [...map.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function saveCloud(kind, item) {
    const store = window.UBY_STORE;
    const method = kind === "message" ? store?.saveMessage : store?.saveActivity;
    if (!method) return;
    method(item).catch(err => console.warn("Nao foi possivel sincronizar no Supabase:", err.message));
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
    saveCloud("activity", item);
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
    saveCloud("message", item);
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

  async function refresh() {
    const store = window.UBY_STORE;
    if (!store) return { activity: read(ACTIVITY_KEY), messages: read(MESSAGE_KEY) };
    const localActivity = read(ACTIVITY_KEY);
    const localMessages = read(MESSAGE_KEY);
    const [cloudActivity, cloudMessages] = await Promise.all([
      store.loadActivity ? store.loadActivity(localActivity) : localActivity,
      store.loadMessages ? store.loadMessages(localMessages) : localMessages
    ]);
    const activity = mergeById(localActivity, cloudActivity || []);
    const messagesList = mergeById(localMessages, cloudMessages || []);
    write(ACTIVITY_KEY, activity);
    write(MESSAGE_KEY, messagesList);
    return { activity, messages: messagesList };
  }

  window.UBY_ACTIVITY = {
    record,
    list,
    sendMessage,
    messages,
    refresh,
    summarize,
    nowLabel
  };
})();

(function () {
  const SESSION_KEY = "uby-auth-session-v1";
  const LEGACY_PROFILE_KEY = "uby-auth-profile-v1";
  const LOGIN_PAGE = location.pathname.includes("/analisadores/")
    ? "../login.html"
    : location.pathname.includes("/tarefas/")
      ? "../obra-ev/login.html"
      : "login.html";
  const ENGINEERING_PAGE = location.pathname.includes("/analisadores/")
    ? "../engenharia.html"
    : location.pathname.includes("/tarefas/")
      ? "../obra-ev/engenharia.html"
      : "engenharia.html";

  const profiles = {
    eduardo: {
      id: "eduardo",
      email: "eduardoprochet@gmail.com",
      label: "Eduardo / Admin",
      role: "admin",
      modules: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "documents", "analyzers", "tasks", "backup", "login"]
    },
    p3solar: {
      id: "p3solar",
      email: "p3solarenergy@gmail.com",
      label: "P3 Solar / Admin",
      role: "admin",
      modules: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "documents", "analyzers", "tasks", "backup", "login"]
    },
    engineer: {
      id: "engineer",
      email: "eng.alanbrunelli@gmail.com",
      label: "Alan / Engenharia",
      role: "engineering",
      modules: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "analyzers", "login"]
    }
  };

  const users = [
    { email: profiles.eduardo.email, profile: "eduardo", passwordHash: "a59dda367b884701d91d10c157927d6e540c8b8c6f07c88fa6ebd3d93671128a" },
    { email: profiles.p3solar.email, profile: "p3solar", passwordHash: "a59dda367b884701d91d10c157927d6e540c8b8c6f07c88fa6ebd3d93671128a" },
    { email: profiles.engineer.email, profile: "engineer", passwordHash: "193a0fbb305e24428944bc8ddd4bd7f0e5ebefa44e5dc69faaebcfff4e8bcd9a" }
  ];

  function loginUrl(target) {
    const current = encodeURIComponent(target || `${location.pathname}${location.search}${location.hash}`);
    return `${LOGIN_PAGE}?next=${current}`;
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function publicProfile(profileId) {
    const profile = profiles[profileId];
    if (!profile) return null;
    return { ...profile, authenticated: true };
  }

  function readSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!saved || !profiles[saved.profile]) return null;
      return { ...publicProfile(saved.profile), email: saved.email, loginAt: saved.loginAt };
    } catch (err) {
      return null;
    }
  }

  function writeSession(user) {
    const profile = publicProfile(user.profile);
    const session = {
      profile: user.profile,
      email: user.email,
      label: profile.label,
      role: profile.role,
      modules: profile.modules,
      loginAt: new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(session));
    return session;
  }

  async function login(email, password) {
    const normalized = normalizeEmail(email);
    const user = users.find(item => item.email === normalized);
    const passwordHash = await sha256(password);
    if (!user || user.passwordHash !== passwordHash) {
      throw new Error("E-mail ou senha invalidos.");
    }
    return writeSession(user);
  }

  function logout(target) {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
    location.href = target || LOGIN_PAGE;
  }

  function can(module) {
    const profile = readSession();
    if (!profile) return module === "login";
    return profile.role === "admin" || profile.modules.includes(module);
  }

  function requireAuth(module, target) {
    if (!readSession() && module !== "login") {
      location.href = loginUrl(target);
      return null;
    }
    if (!can(module)) {
      location.href = ENGINEERING_PAGE;
      return null;
    }
    return readSession();
  }

  function setProfile(id, target) {
    const profile = profiles[id];
    if (!profile) return;
    const user = users.find(item => item.profile === id);
    writeSession(user);
    location.href = target || (profile.role === "engineering" ? "engenharia.html" : "index.html");
  }

  window.UBY_AUTH = {
    profiles,
    users: users.map(({ email, profile }) => ({ email, profile })),
    current: readSession,
    login,
    logout,
    can,
    require: requireAuth,
    set: setProfile
  };
})();

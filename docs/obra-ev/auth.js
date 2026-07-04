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

  const roleModules = {
    admin: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "documents", "analyzers", "market", "recargas", "tasks", "backup", "login"],
    engenharia: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "analyzers", "market", "recargas", "login"]
  };

  const fallbackProfiles = {
    admin: { id: "admin", label: "Admin", role: "admin", modules: roleModules.admin },
    engenharia: { id: "engenharia", label: "Engenharia", role: "engineering", modules: roleModules.engenharia }
  };

  function loginUrl(target) {
    const current = encodeURIComponent(target || `${location.pathname}${location.search}${location.hash}`);
    return `${LOGIN_PAGE}?next=${current}`;
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function publicProfile(profile) {
    const perfil = profile?.perfil === "engenharia" ? "engenharia" : "admin";
    const base = fallbackProfiles[perfil];
    return {
      id: profile?.id || base.id,
      email: profile?.email || "",
      label: profile?.nome || profile?.email || base.label,
      role: perfil === "admin" ? "admin" : "engineering",
      modules: base.modules,
      authenticated: true
    };
  }

  function readSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!saved || !saved.email || !saved.loginAt) return null;
      const ageMs = Date.now() - new Date(saved.loginAt).getTime();
      if (ageMs > 12 * 60 * 60 * 1000) return null;
      return saved;
    } catch (err) {
      return null;
    }
  }

  function writeSession(profile) {
    const session = { ...publicProfile(profile), loginAt: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(session));
    return session;
  }

  async function login(email, password) {
    if (!window.UBY_SUPABASE?.configured()) {
      throw new Error("Supabase nao esta carregado ou configurado. O login real depende da conexao com a nuvem.");
    }
    const data = await window.UBY_SUPABASE.signIn(normalizeEmail(email), password);
    const profile = await window.UBY_SUPABASE.currentProfile();
    if (!profile) {
      await window.UBY_SUPABASE.signOut();
      throw new Error("Usuario autenticado, mas sem perfil na tabela profiles. Cadastre o perfil antes de liberar acesso.");
    }
    const supabaseEmail = data?.user?.email || normalizeEmail(email);
    return writeSession({ ...profile, email: supabaseEmail, nome: profile?.nome || supabaseEmail });
  }

  function logout(target) {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
    const destination = target || LOGIN_PAGE;
    const finish = () => { location.href = destination; };
    try {
      const signOut = window.UBY_SUPABASE?.signOut?.();
      if (signOut && typeof signOut.finally === "function") {
        signOut.finally(finish);
        return;
      }
    } catch (err) {
      console.warn("Nao foi possivel encerrar sessao Supabase:", err.message);
    }
    finish();
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
    if (!window.UBY_SUPABASE_CONFIG?.devLoginEnabled) {
      throw new Error("Login local desativado. Use o acesso real pelo Supabase.");
    }
    const profile = fallbackProfiles[id] || fallbackProfiles.admin;
    writeSession({ id, email: "", nome: profile.label, perfil: id === "engenharia" ? "engenharia" : "admin" });
    location.href = target || (profile.role === "engineering" ? "engenharia.html" : "index.html");
  }

  window.UBY_AUTH = {
    profiles: fallbackProfiles,
    users: [],
    current: readSession,
    login,
    logout,
    can,
    require: requireAuth,
    set: setProfile
  };
})();

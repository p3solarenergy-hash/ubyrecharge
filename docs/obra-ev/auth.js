(function () {
  const PROFILE_KEY = "uby-auth-profile-v1";
  const profiles = {
    admin: {
      id: "admin",
      label: "Eduardo / Admin",
      role: "admin",
      modules: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "documents", "analyzers", "tasks", "backup", "login"]
    },
    engineer: {
      id: "engineer",
      label: "Engenheiro",
      role: "engineering",
      modules: ["home", "dashboard", "detail", "engineering", "utility", "budgets", "analyzers", "backup", "login"]
    }
  };

  function readProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (saved && profiles[saved.id]) return { ...profiles[saved.id], ...saved };
    } catch (err) {
      return profiles.admin;
    }
    return profiles.admin;
  }

  function setProfile(id, target) {
    const profile = profiles[id] || profiles.admin;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    location.href = target || (profile.role === "engineering" ? "engenharia.html" : "index.html");
  }

  function logout(target) {
    localStorage.removeItem(PROFILE_KEY);
    location.href = target || "login.html";
  }

  function can(module) {
    const profile = readProfile();
    return profile.role === "admin" || profile.modules.includes(module);
  }

  window.UBY_AUTH = { profiles, current: readProfile, set: setProfile, logout, can };
})();

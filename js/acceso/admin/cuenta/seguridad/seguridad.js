document.addEventListener("DOMContentLoaded", initSeguridad);

async function initSeguridad() {

  const token = localStorage.getItem("onion_token");
  if (!token) {
    window.location.href = "/es/acceso/";
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  /* =====================================================
     CONFIG CACHE
  ===================================================== */

  const CACHE_TTL = 60000; // 60s

  function getCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (Date.now() > parsed.exp) {
        sessionStorage.removeItem(key);
        return null;
      }

      return parsed.data;
    } catch {
      return null;
    }
  }

  function setCache(key, data) {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        data,
        exp: Date.now() + CACHE_TTL
      })
    );
  }

  function clearCache() {
    sessionStorage.removeItem("seguridad_user");
    sessionStorage.removeItem("seguridad_sessions");
  }

  /* =====================================================
     HELPERS
  ===================================================== */

  function logout() {
    clearCache();
    localStorage.clear();
    window.location.href = "/es/acceso/";
  }

  function tiempoRelativo(fechaISO) {
    if (!fechaISO) return "Nunca";

    const ahora = new Date();
    const fecha = new Date(fechaISO);
    const diffMs = ahora - fecha;

    const minutos = Math.floor(diffMs / 60000);
    const horas   = Math.floor(diffMs / 3600000);
    const dias    = Math.floor(diffMs / 86400000);
    const meses   = Math.floor(dias / 30);

    if (meses > 0) return `Hace ${meses} mes${meses > 1 ? "es" : ""}`;
    if (dias > 0)  return `Hace ${dias} día${dias > 1 ? "s" : ""}`;
    if (horas > 0) return `Hace ${horas} hora${horas > 1 ? "s" : ""}`;
    return `Hace ${minutos} min`;
  }

  /* =====================================================
     PINTADO
  ===================================================== */

  function pintarPasswordDate(fechaISO) {
    const el = document.getElementById("lastPasswordChangeText");
    if (el) el.textContent = `Último cambio: ${tiempoRelativo(fechaISO)}`;
  }

  function pintar2FAStatus(enabled) {
    const el = document.getElementById("security2FAStatus");
    const btn = document.getElementById("enable2FAButton");
    if (!el || !btn) return;

    el.textContent = enabled ? "Activado" : "No activado";
    btn.textContent = enabled ? "Desactivar 2FA" : "Activar 2FA";
  }

  function pintarEmail(email) {
    const el = document.getElementById("currentEmailText");
    if (el) el.textContent = `Correo actual: ${email || "—"}`;
  }

  function pintarTelefono(phone) {
    const el = document.getElementById("currentPhoneText");
    if (!el) return;

    if (!phone) {
      el.textContent = "Teléfono actual: —";
      return;
    }

    const limpio = phone.replace(/\D/g, "");

    if (limpio.startsWith("34") && limpio.length === 11) {
      const numero = limpio.slice(2);
      el.textContent =
        `Teléfono actual: +34 ${numero.slice(0,3)} ${numero.slice(3,6)} ${numero.slice(6)}`;
      return;
    }

    if (limpio.length === 9) {
      el.textContent =
        `Teléfono actual: ${limpio.slice(0,3)} ${limpio.slice(3,6)} ${limpio.slice(6)}`;
      return;
    }

    el.textContent = `Teléfono actual: ${phone}`;
  }

  /* =====================================================
     FETCH USUARIO (CACHEADO)
  ===================================================== */

  let user = getCache("seguridad_user");

  if (!user) {
    try {
      const res = await fetch("https://api.onionit.net/api/auth/me", { headers });

      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }

      const json = await res.json();
      user = json?.user || {};

      setCache("seguridad_user", user);

    } catch (err) {
      console.error("ERROR cargando usuario:", err);
    }
  }

  if (user) {
    pintarPasswordDate(user.lastPasswordChangeAt);
    pintar2FAStatus(user.twofa_enabled === true);
    pintarEmail(user.email);
    pintarTelefono(user.phone);

    localStorage.setItem(
      "onion_user_twofa_enabled",
      user.twofa_enabled === true
    );
  }

  /* =====================================================
     PINTAR ÚLTIMA SESIÓN (CACHEADO)
  ===================================================== */

  async function loadLastSession() {

    let sessions = getCache("seguridad_sessions");

    if (!sessions) {
      try {
        const res = await fetch("https://api.onionit.net/api/users/sessions", { headers });
        if (!res.ok) return;

        const json = await res.json();
        if (!json.ok || !Array.isArray(json.sessions)) return;

        sessions = json.sessions;
        setCache("seguridad_sessions", sessions);

      } catch (err) {
        console.error("LAST SESSION ERROR:", err);
        return;
      }
    }

    if (!sessions.length) return;

    const sorted = sessions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const latest = sorted[0];

    const locationText = latest.location || "Ubicación desconocida";
    const ipText = latest.ip || "";

    const el = document.getElementById("lastSessionLocation");

    if (el) {
      el.textContent =
        `Ubicación aproximada: ${locationText}` +
        (ipText ? ` - ${ipText}` : "");
    }
  }

  loadLastSession();

  /* =====================================================
     BOTONES
  ===================================================== */

  const enable2FABtn = document.getElementById("enable2FAButton");
  const logoutAllBtn = document.getElementById("logoutAllButton");

  enable2FABtn?.addEventListener("click", () => {
    const enabled =
      localStorage.getItem("onion_user_twofa_enabled") === "true";

    window.location.href = enabled
      ? "/es/acceso/2fa/disable/"
      : "/es/acceso/2fa/activate/";
  });

  logoutAllBtn?.addEventListener("click", async () => {

    if (!confirm("¿Cerrar todas las sesiones?")) return;

    try {
      await fetch("https://api.onionit.net/api/auth/logout-all", {
        method: "POST",
        headers
      });

      logout();

    } catch (err) {
      console.error("LOGOUT ALL ERROR:", err);
    }

  });

  /* =====================================================
     2FA GATE
  ===================================================== */

  const changePasswordBtn = document.querySelector(
    '[data-href="/es/acceso/admin/cuenta/seguridad/change_password/"]'
  );

  const changeEmailBtn = document.querySelector(
    '[data-href="/es/acceso/admin/cuenta/seguridad/change_email/"]'
  );

  const changePhoneBtn = document.querySelector(
    '[data-href="/es/acceso/admin/cuenta/seguridad/change_phone/"]'
  );

  const has2FA =
    localStorage.getItem("onion_user_twofa_enabled") === "true";

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = has2FA
        ? "/es/acceso/2fa/confirm/?action=change_password"
        : "/es/acceso/admin/cuenta/seguridad/change_password/";
    });
  }

  if (changeEmailBtn) {
    changeEmailBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = has2FA
        ? "/es/acceso/2fa/confirm/?action=change_email"
        : "/es/acceso/admin/cuenta/seguridad/change_email/";
    });
  }

  if (changePhoneBtn) {
    changePhoneBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = has2FA
        ? "/es/acceso/2fa/confirm/?action=change_phone"
        : "/es/acceso/admin/cuenta/seguridad/change_phone/";
    });
  }

}
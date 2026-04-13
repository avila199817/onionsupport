/* =========================================================
   Onion SPA - Login Helpers
   Archivo: src/views/login/login.helpers.js

   Responsabilidades:
   - helpers puros del login
   - validación de credenciales
   - persistencia de email recordado
   - normalización de respuesta auth
   - sincronización de sesión con AppCore
   - resolución de redirect post-login
========================================================= */

import AppCore from "../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const LOGIN_REMEMBER_KEY = "auth:last-email";

/* =========================================================
   BASICS
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* =========================================================
   STORAGE
========================================================= */

export function getStorage() {
  try {
    if (AppCore?.storage) return AppCore.storage;
  } catch {}

  return null;
}

export function getNamespacedKey(key) {
  const prefix = safeText(AppCore?.config?.storagePrefix, "onion");
  return `${prefix}:${key}`;
}

export function readStorage(key, fallback = "") {
  try {
    const storage = getStorage();

    if (storage?.get) {
      return safeText(storage.get(key), fallback);
    }

    return safeText(
      window.localStorage.getItem(getNamespacedKey(key)),
      fallback
    );
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value = "") {
  try {
    const storage = getStorage();
    const finalValue = safeText(value, "");

    if (storage?.set) {
      storage.set(key, finalValue);
      return true;
    }

    window.localStorage.setItem(
      getNamespacedKey(key),
      finalValue
    );

    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    const storage = getStorage();

    if (storage?.remove) {
      storage.remove(key);
      return true;
    }

    window.localStorage.removeItem(
      getNamespacedKey(key)
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REMEMBER EMAIL
========================================================= */

export function loadRememberedEmail() {
  return readStorage(LOGIN_REMEMBER_KEY, "");
}

export function saveRememberedEmail(email = "") {
  return writeStorage(
    LOGIN_REMEMBER_KEY,
    safeText(email, "").toLowerCase()
  );
}

export function clearRememberedEmail() {
  return removeStorage(LOGIN_REMEMBER_KEY);
}

/* =========================================================
   LOGIN PAYLOAD
========================================================= */

export function createLoginPayload({
  email = "",
  password = "",
  remember = false,
} = {}) {
  return {
    email: safeText(email, "").toLowerCase(),
    password: safeText(password, ""),
    remember: Boolean(remember),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateLoginPayload(payload = {}) {
  const email = safeText(payload.email, "").toLowerCase();
  const password = safeText(payload.password, "");

  const errors = {};

  if (!email) {
    errors.email = "Introduce tu email.";
  } else if (!isValidEmail(email)) {
    errors.email = "Introduce un email válido.";
  }

  if (!password) {
    errors.password = "Introduce tu contraseña.";
  }

  return errors;
}

export function getFirstLoginError(errors = {}) {
  return (
    safeText(errors.email, "") ||
    safeText(errors.password, "") ||
    ""
  );
}

/* =========================================================
   AUTH RESPONSE
========================================================= */

export function normalizeAuthResult(result = {}) {
  const token =
    result?.token ||
    result?.accessToken ||
    result?.authToken ||
    result?.data?.token ||
    result?.data?.accessToken ||
    "";

  const user =
    result?.user ||
    result?.usuario ||
    result?.data?.user ||
    result?.data?.usuario ||
    null;

  const role =
    result?.role ||
    result?.rol ||
    user?.role ||
    user?.rol ||
    result?.data?.role ||
    result?.data?.rol ||
    "";

  const message =
    result?.message ||
    result?.mensaje ||
    result?.data?.message ||
    result?.data?.mensaje ||
    "";

  return {
    raw: result,
    token: safeText(token, ""),
    user,
    role: safeText(role, ""),
    message: safeText(message, ""),
  };
}

export function resolveAuthErrorMessage(error) {
  return (
    safeText(error?.message, "") ||
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    "No se ha podido iniciar sesión."
  );
}

/* =========================================================
   SESSION
========================================================= */

export function syncSession(auth = {}) {
  const token = safeText(auth?.token, "");
  const user = auth?.user || null;
  const role = safeText(
    auth?.role ||
    auth?.user?.role ||
    auth?.user?.rol ||
    "",
    ""
  );

  if (!token) {
    throw new Error("No se recibió token de autenticación.");
  }

  if (typeof AppCore?.setSession === "function") {
    AppCore.setSession({
      token,
      user,
      role,
      authenticated: true,
    });
  } else {
    AppCore.state = AppCore.state || {};
    AppCore.state.token = token;
    AppCore.state.user = user;
    AppCore.state.role = role;
    AppCore.state.authenticated = true;
  }

  try {
    AppCore?.events?.emit?.("app:user:change", {
      user,
      token,
      role,
      authenticated: true,
    });
  } catch {}

  try {
    AppCore?.events?.emit?.("auth:login:success", {
      user,
      token,
      role,
    });
  } catch {}

  try {
    AppCore?.syncUserUI?.();
  } catch {}

  return {
    token,
    user,
    role,
    authenticated: true,
  };
}

/* =========================================================
   REDIRECT
========================================================= */

export function resolveLoginRedirect(auth = {}, options = {}) {
  const explicitRedirect =
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "");

  if (explicitRedirect) {
    return explicitRedirect;
  }

  const responseRedirect =
    safeText(auth?.raw?.redirectTo, "") ||
    safeText(auth?.raw?.data?.redirectTo, "");

  if (responseRedirect) {
    return responseRedirect;
  }

  const role = safeText(
    auth?.role ||
    auth?.user?.role ||
    auth?.user?.rol ||
    "",
    ""
  ).toLowerCase();

  switch (role) {
    case "admin":
      return "/";
    case "tecnico":
      return "/";
    case "agent":
      return "/";
    case "cliente":
      return "/";
    default:
      return "/";
  }
}

/* =========================================================
   REMEMBER FLOW
========================================================= */

export function persistRememberedEmail({
  email = "",
  remember = false,
} = {}) {
  if (remember) {
    saveRememberedEmail(email);
    return;
  }

  clearRememberedEmail();
}

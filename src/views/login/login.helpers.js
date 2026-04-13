/* =========================================================
   Onion SPA - Login Helpers
   Archivo: src/views/login/login.helpers.js

   Responsabilidades:
   - helpers puros del login
   - validación de credenciales
   - persistencia del identificador recordado
   - normalización de respuesta auth
   - sincronización de sesión con AppCore real
   - resolución de redirect post-login
   - compatibilidad con login por usuario o correo
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const LOGIN_REMEMBER_KEY = "auth:last-identifier";

/* =========================================================
   BASICS
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

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

export function normalizeIdentifier(value = "") {
  return safeText(value, "");
}

export function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();

  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

export function slugify(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function normalizePath(path = "/") {
  const raw = safeText(path, "/") || "/";

  if (typeof AppCore?.utils?.normalizePath === "function") {
    try {
      return AppCore.utils.normalizePath(raw);
    } catch {}
  }

  if (raw === "/") {
    return "/";
  }

  return raw
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";
}

export function isSafeInternalRedirect(path = "") {
  const value = safeText(path, "").trim();

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^\/login(?:[/?#]|$)/i.test(value)) return false;

  return true;
}

export function ensureSafeRedirect(path = "", fallback = "/") {
  const normalizedFallback = normalizePath(fallback || "/");
  const normalizedPath = normalizePath(path || "");

  if (!isSafeInternalRedirect(normalizedPath)) {
    return normalizedFallback;
  }

  return normalizedPath;
}

/* =========================================================
   STORAGE
========================================================= */

export function getStorage() {
  try {
    if (AppCore?.storage) {
      return AppCore.storage;
    }
  } catch {}

  return null;
}

export function getNamespacedKey(key = "") {
  const prefix = safeText(
    AppCore?.config?.storagePrefix,
    "onion"
  );

  return `${prefix}:${safeText(key, "")}`;
}

export function readStorage(key, fallback = "") {
  try {
    const storage = getStorage();

    if (typeof storage?.get === "function") {
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

    if (typeof storage?.set === "function") {
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

    if (typeof storage?.remove === "function") {
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
   REMEMBER IDENTIFIER
========================================================= */

export function loadRememberedIdentifier() {
  return readStorage(
    LOGIN_REMEMBER_KEY,
    ""
  );
}

/*
  Compat legacy:
  mantenemos loadRememberedEmail para no romper imports existentes,
  pero internamente ya trabajamos con identifier.
*/
export function loadRememberedEmail() {
  return loadRememberedIdentifier();
}

export function saveRememberedIdentifier(identifier = "") {
  return writeStorage(
    LOGIN_REMEMBER_KEY,
    normalizeIdentifier(identifier)
  );
}

export function saveRememberedEmail(email = "") {
  return saveRememberedIdentifier(email);
}

export function clearRememberedIdentifier() {
  return removeStorage(
    LOGIN_REMEMBER_KEY
  );
}

export function clearRememberedEmail() {
  return clearRememberedIdentifier();
}

/* =========================================================
   LOGIN PAYLOAD
========================================================= */

export function createLoginPayload({
  identifier = "",
  email = "",
  password = "",
  remember = false,
  redirect = "",
} = {}) {
  const normalizedIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email);

  const normalizedPassword = safeText(password, "");

  return {
    identifier: normalizedIdentifier,
    email: looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier.toLowerCase()
      : "",
    password: normalizedPassword,
    remember: Boolean(remember),
    redirect: safeText(redirect, ""),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateLoginPayload(payload = {}) {
  const identifier = normalizeIdentifier(
    payload.identifier || payload.email || ""
  );

  const password = safeText(
    payload.password,
    ""
  );

  const errors = {};

  if (!identifier) {
    errors.identifier =
      "Introduce tu email o nombre de usuario.";
  } else if (
    looksLikeEmail(identifier) &&
    !isValidEmail(identifier)
  ) {
    errors.identifier =
      "El formato del email no es válido.";
  }

  if (!password) {
    errors.password =
      "Introduce tu contraseña.";
  } else if (password.length < 6) {
    errors.password =
      "La contraseña debe tener al menos 6 caracteres.";
  }

  return errors;
}

export function getFirstLoginError(errors = {}) {
  return (
    safeText(errors.identifier, "") ||
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
    result?.jwt ||
    result?.data?.token ||
    result?.data?.accessToken ||
    result?.data?.authToken ||
    result?.data?.jwt ||
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

  const redirectTo =
    result?.redirectTo ||
    result?.redirect ||
    result?.data?.redirectTo ||
    result?.data?.redirect ||
    "";

  const tempToken =
    result?.tempToken ||
    result?.temporaryToken ||
    result?.data?.tempToken ||
    result?.data?.temporaryToken ||
    "";

  const requires2FA = Boolean(
    result?.requires2FA ||
    result?.require2FA ||
    result?.twoFactorRequired ||
    result?.mfaRequired ||
    result?.data?.requires2FA ||
    result?.data?.require2FA ||
    result?.data?.twoFactorRequired ||
    result?.data?.mfaRequired ||
    tempToken
  );

  return {
    raw: result,
    token: safeText(token, ""),
    user,
    role: safeText(role, ""),
    message: safeText(message, ""),
    redirectTo: safeText(redirectTo, ""),
    tempToken: safeText(tempToken, ""),
    requires2FA,
  };
}

export function resolveAuthErrorMessage(error) {
  return (
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "") ||
    "No se ha podido iniciar sesión."
  );
}

/* =========================================================
   SESSION
========================================================= */

export function syncSession(auth = {}) {
  const token = safeText(
    auth?.token,
    ""
  );

  const user = auth?.user || null;

  const role = safeText(
    auth?.role ||
      auth?.user?.role ||
      auth?.user?.rol ||
      "",
    ""
  );

  if (!token) {
    throw new Error(
      "No se recibió token de autenticación."
    );
  }

  if (typeof AppCore?.applySession === "function") {
    AppCore.applySession({
      token,
      user,
    });
  } else {
    AppCore.state = AppCore.state || {};
    AppCore.state.token = token;
    AppCore.state.user = user;
    AppCore.state.role = role;
    AppCore.state.authenticated = true;
  }

  try {
    if (typeof AppCore?.setToken === "function") {
      AppCore.setToken(token);
    }
  } catch {}

  try {
    if (typeof AppCore?.setUser === "function") {
      AppCore.setUser(user);
    }
  } catch {}

  try {
    if (typeof AppCore?.setState === "function") {
      AppCore.setState({
        role,
        authenticated: true,
      });
    } else {
      AppCore.state = AppCore.state || {};
      AppCore.state.role = role;
      AppCore.state.authenticated = true;
    }
  } catch {}

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
    AppCore?.events?.emit?.("login:success", {
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

export function resolveLoginRedirect(
  auth = {},
  options = {}
) {
  const explicitRedirect =
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.redirect, "");

  if (explicitRedirect) {
    return ensureSafeRedirect(explicitRedirect, "/");
  }

  const responseRedirect =
    safeText(auth?.redirectTo, "") ||
    safeText(auth?.raw?.redirectTo, "") ||
    safeText(auth?.raw?.redirect, "") ||
    safeText(auth?.raw?.data?.redirectTo, "") ||
    safeText(auth?.raw?.data?.redirect, "");

  if (responseRedirect) {
    return ensureSafeRedirect(responseRedirect, "/");
  }

  const user = auth?.user || {};
  const slug =
    safeText(user?.slug, "") ||
    slugify(
      user?.username ||
      user?.name ||
      user?.nombre ||
      ""
    );

  if (slug) {
    return ensureSafeRedirect(`/@${slug}`, "/");
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
    case "tecnico":
    case "agent":
    case "cliente":
    case "user":
    default:
      return "/";
  }
}

/* =========================================================
   REMEMBER FLOW
========================================================= */

export function persistRememberedIdentifier({
  identifier = "",
  email = "",
  remember = false,
} = {}) {
  const finalIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email);

  if (remember) {
    saveRememberedIdentifier(finalIdentifier);
    return;
  }

  clearRememberedIdentifier();
}

/*
  Compat legacy:
  mantenemos el nombre antiguo para index.js y otros módulos
  que todavía llamen persistRememberedEmail().
*/
export function persistRememberedEmail({
  identifier = "",
  email = "",
  remember = false,
} = {}) {
  persistRememberedIdentifier({
    identifier,
    email,
    remember,
  });
}

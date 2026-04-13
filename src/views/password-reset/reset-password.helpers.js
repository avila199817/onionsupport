/* =========================================================
   Onion SPA - Reset Password Helpers
   Archivo: src/views/password-reset/reset-password.helpers.js

   Responsabilidades:
   - helpers puros de recuperación de acceso
   - validación de identificador
   - creación de payload uniforme
   - normalización de respuesta del backend
   - resolución de mensajes de error
   - persistencia opcional del identificador recordado
   - compatibilidad con usuario o email
   - endurecer redirects y consistencia UX
========================================================= */

import { AppCore } from "../../core/index.js";
import {
  AUTH_STORAGE_KEYS,
  AUTH_CONSTANTS,
} from "../../features/auth/constants.js";

/* =========================================================
   CONST
========================================================= */

export const RESET_PASSWORD_IDENTIFIER_KEY =
  AUTH_STORAGE_KEYS?.lastResetIdentifier ||
  "auth:last-identifier";

const DEFAULT_SUCCESS_MESSAGE =
  "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña.";

const DEFAULT_ERROR_MESSAGE =
  "No se pudo procesar la recuperación de acceso.";

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

export function isObject(value) {
  return value !== null && typeof value === "object";
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

export function getResetIdentifierMaxLength() {
  return Number(
    AUTH_CONSTANTS?.resetIdentifierMaxLength ??
      AUTH_CONSTANTS?.identifierMaxLength ??
      160
  ) || 160;
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

  return (
    raw
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/"
  );
}

export function isSafeInternalRedirect(path = "") {
  const value = safeText(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^\/https?:/i.test(value)) return false;
  if (/[\r\n]/.test(value)) return false;

  return true;
}

export function ensureSafeRedirect(path = "", fallback = "/login") {
  const normalizedFallback = normalizePath(fallback || "/login");
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

export function removeStorage(key = "") {
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
   IDENTIFIER MEMORY
========================================================= */

export function loadRememberedIdentifier() {
  return readStorage(
    RESET_PASSWORD_IDENTIFIER_KEY,
    ""
  );
}

export function saveRememberedIdentifier(identifier = "") {
  return writeStorage(
    RESET_PASSWORD_IDENTIFIER_KEY,
    normalizeIdentifier(identifier)
  );
}

export function clearRememberedIdentifier() {
  return removeStorage(
    RESET_PASSWORD_IDENTIFIER_KEY
  );
}

/* =========================================================
   PAYLOAD
========================================================= */

export function createResetPasswordPayload({
  identifier = "",
  email = "",
  redirect = "",
} = {}) {
  const normalizedIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email);

  return {
    identifier: normalizedIdentifier,
    email: looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier.toLowerCase()
      : "",
    redirect: safeText(redirect, ""),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateResetPasswordPayload(payload = {}) {
  const identifier = normalizeIdentifier(
    payload.identifier ||
      payload.email ||
      payload.username ||
      payload.user ||
      ""
  );

  const errors = {};

  if (!identifier) {
    errors.identifier =
      "Introduce tu email o nombre de usuario.";
    return errors;
  }

  if (identifier.length > getResetIdentifierMaxLength()) {
    errors.identifier =
      "El identificador es demasiado largo.";
    return errors;
  }

  if (
    looksLikeEmail(identifier) &&
    !isValidEmail(identifier)
  ) {
    errors.identifier =
      "El formato del email no es válido.";
  }

  return errors;
}

export function getFirstResetPasswordError(errors = {}) {
  return (
    safeText(errors.identifier, "") ||
    safeText(errors.email, "") ||
    ""
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeResetPasswordResult(result = {}) {
  const ok =
    typeof result?.ok === "boolean"
      ? result.ok
      : typeof result?.success === "boolean"
        ? result.success
        : typeof result?.data?.ok === "boolean"
          ? result.data.ok
          : typeof result?.data?.success === "boolean"
            ? result.data.success
            : true;

  const message =
    result?.message ||
    result?.mensaje ||
    result?.detail ||
    result?.data?.message ||
    result?.data?.mensaje ||
    result?.data?.detail ||
    "";

  const redirectTo =
    result?.redirectTo ||
    result?.redirect ||
    result?.data?.redirectTo ||
    result?.data?.redirect ||
    "";

  const cooldown =
    Number(
      result?.cooldownSeconds ??
        result?.retryAfter ??
        result?.data?.cooldownSeconds ??
        result?.data?.retryAfter ??
        0
    ) || 0;

  const emailMasked =
    result?.emailMasked ||
    result?.maskedEmail ||
    result?.data?.emailMasked ||
    result?.data?.maskedEmail ||
    "";

  return {
    raw: result,
    ok: Boolean(ok),
    success: Boolean(ok),
    message: safeText(message, DEFAULT_SUCCESS_MESSAGE),
    redirectTo: safeText(redirectTo, ""),
    cooldownSeconds: Math.max(0, cooldown),
    retryAfter: Math.max(0, cooldown),
    emailMasked: safeText(emailMasked, ""),
  };
}

export function resolveResetPasswordErrorMessage(error) {
  const status = Number(
    error?.status ??
      error?.response?.status ??
      0
  ) || 0;

  const backendMessage =
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "");

  if (status === 429) {
    return "Has alcanzado el límite temporal. Espera un momento antes de volver a intentarlo.";
  }

  if (status >= 500) {
    return "Ahora mismo no se pudo procesar la recuperación de acceso. Inténtalo de nuevo en unos minutos.";
  }

  return backendMessage || DEFAULT_ERROR_MESSAGE;
}

/* =========================================================
   EXECUTOR RESOLUTION
========================================================= */

export function resolveResetPasswordExecutor(deps = {}) {
  const candidates = [
    deps.onSubmit,
    deps.submitResetPassword,
    deps.requestResetPassword,
    deps.resetPassword,
    AppCore?.services?.auth?.requestPasswordReset,
    AppCore?.services?.auth?.resetPasswordRequest,
    AppCore?.services?.auth?.forgotPassword,
    AppCore?.auth?.requestPasswordReset,
    AppCore?.auth?.forgotPassword,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }

  return null;
}

/* =========================================================
   REDIRECT
========================================================= */

export function resolveResetPasswordRedirect(
  result = {},
  options = {}
) {
  const explicitRedirect =
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.backToLoginHref, "") ||
    "/login";

  const responseRedirect =
    safeText(result?.redirectTo, "") ||
    safeText(result?.raw?.redirectTo, "") ||
    safeText(result?.raw?.redirect, "") ||
    safeText(result?.raw?.data?.redirectTo, "") ||
    safeText(result?.raw?.data?.redirect, "");

  if (responseRedirect) {
    return ensureSafeRedirect(
      responseRedirect,
      explicitRedirect
    );
  }

  return ensureSafeRedirect(
    explicitRedirect,
    "/login"
  );
}

/* =========================================================
   UX HELPERS
========================================================= */

export function buildResetPasswordSuccessMessage(result = {}) {
  const normalized =
    normalizeResetPasswordResult(result);

  if (normalized.emailMasked) {
    return `Te hemos enviado las instrucciones a ${normalized.emailMasked}.`;
  }

  return (
    normalized.message ||
    DEFAULT_SUCCESS_MESSAGE
  );
}

export function buildResetPasswordCooldownMessage(seconds = 0) {
  const safeSeconds = Math.max(
    0,
    Number(seconds) || 0
  );

  if (!safeSeconds) {
    return "Espera un momento antes de volver a intentarlo.";
  }

  if (safeSeconds === 1) {
    return "Espera 1 segundo antes de volver a intentarlo.";
  }

  if (safeSeconds < 60) {
    return `Espera ${safeSeconds} segundos antes de volver a intentarlo.`;
  }

  const minutes = Math.ceil(safeSeconds / 60);

  if (minutes === 1) {
    return "Espera 1 minuto antes de volver a intentarlo.";
  }

  return `Espera ${minutes} minutos antes de volver a intentarlo.`;
}

/* =========================================================
   MEMORY FLOW
========================================================= */

export function persistResetPasswordIdentifier(identifier = "") {
  const value = normalizeIdentifier(identifier);

  if (!value) {
    clearRememberedIdentifier();
    return;
  }

  saveRememberedIdentifier(value);
}

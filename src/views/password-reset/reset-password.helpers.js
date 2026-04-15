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
   - distinguir success real de cooldown / rate limit
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

const DEFAULT_COOLDOWN_MESSAGE =
  "Espera un momento antes de volver a intentarlo.";

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

export function persistResetPasswordIdentifier(identifier = "") {
  const value = normalizeIdentifier(identifier);

  if (!value) {
    clearRememberedIdentifier();
    return false;
  }

  return saveRememberedIdentifier(value);
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
    safeText(errors.global, "") ||
    safeText(errors.message, "") ||
    ""
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeResetPasswordResult(result = {}) {
  const raw = isObject(result) ? result : {};

  const explicitOk =
    typeof raw?.ok === "boolean"
      ? raw.ok
      : typeof raw?.success === "boolean"
        ? raw.success
        : typeof raw?.data?.ok === "boolean"
          ? raw.data.ok
          : typeof raw?.data?.success === "boolean"
            ? raw.data.success
            : null;

  const status =
    Number(
      raw?.status ??
        raw?.statusCode ??
        raw?.data?.status ??
        raw?.data?.statusCode ??
        0
    ) || 0;

  const cooldownSeconds =
    Number(
      raw?.cooldownSeconds ??
        raw?.retryAfter ??
        raw?.data?.cooldownSeconds ??
        raw?.data?.retryAfter ??
        0
    ) || 0;

  const retryAfter = Math.max(0, cooldownSeconds);

  const cooldown =
    Boolean(raw?.cooldown) ||
    status === 429 ||
    retryAfter > 0;

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    raw?.message ||
    raw?.mensaje ||
    raw?.detail ||
    raw?.error ||
    raw?.data?.message ||
    raw?.data?.mensaje ||
    raw?.data?.detail ||
    raw?.data?.error ||
    "";

  const redirectTo =
    raw?.redirectTo ||
    raw?.redirect ||
    raw?.data?.redirectTo ||
    raw?.data?.redirect ||
    "";

  const emailMasked =
    raw?.emailMasked ||
    raw?.maskedEmail ||
    raw?.data?.emailMasked ||
    raw?.data?.maskedEmail ||
    "";

  return {
    raw,
    ok,
    success: ok,
    error: !ok,
    cooldown,
    status,
    message: safeText(
      message,
      ok
        ? DEFAULT_SUCCESS_MESSAGE
        : cooldown
          ? DEFAULT_COOLDOWN_MESSAGE
          : DEFAULT_ERROR_MESSAGE
    ),
    redirectTo: safeText(redirectTo, ""),
    cooldownSeconds: retryAfter,
    retryAfter,
    emailMasked: safeText(emailMasked, ""),
  };
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

export function resolveResetPasswordErrorMessage(error) {
  const status = Number(
    error?.status ??
      error?.response?.status ??
      error?.data?.status ??
      error?.data?.statusCode ??
      0
  ) || 0;

  const retryAfter = Number(
    error?.retryAfter ??
      error?.data?.retryAfter ??
      error?.data?.cooldownSeconds ??
      error?.response?.data?.retryAfter ??
      error?.response?.data?.cooldownSeconds ??
      0
  ) || 0;

  const backendMessage =
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.data?.detail, "") ||
    safeText(error?.data?.error, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.response?.data?.detail, "") ||
    safeText(error?.response?.data?.error, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "");

  if (status === 429 || retryAfter > 0) {
    return buildResetPasswordCooldownMessage(retryAfter);
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
    safeText(normalized.message, "") ||
    DEFAULT_SUCCESS_MESSAGE
  );
}

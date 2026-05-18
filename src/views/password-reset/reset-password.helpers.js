/* =========================================================
   Onion SPA - Reset Password Helpers
   Archivo: src/views/password-reset/reset-password.helpers.js

   Responsabilidad:
   - Helpers puros para password reset.
   - Normalizar identificador.
   - Validar request mínimo.
   - Crear payload simple.
   - Normalizar resultado/error.
   - Resolver redirect interno seguro.
   - Sin AppCore.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin storage paralelo.
   - Sin Toast.
   - Sin magia negra.
========================================================= */

export const RESET_PASSWORD_HELPERS_VERSION = "minimal-1";

export const RESET_PASSWORD_IDENTIFIER_KEY = "auth:last-identifier";

const MAX_IDENTIFIER_LENGTH = 160;

const DEFAULT_SUCCESS_MESSAGE =
  "Si el identificador existe, recibirás instrucciones para restablecer la contraseña.";

const DEFAULT_ERROR_MESSAGE =
  "No se pudo procesar la recuperación de acceso.";

const DEFAULT_COOLDOWN_MESSAGE =
  "Espera un momento antes de volver a intentarlo.";

/* =========================================================
   BASICS
========================================================= */

export function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* =========================================================
   IDENTIFIER
========================================================= */

export function getResetIdentifierMaxLength() {
  return MAX_IDENTIFIER_LENGTH;
}

export function normalizeIdentifier(value = "") {
  return safeText(value, "")
    .normalize("NFKC")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

export function looksLikeEmail(value = "") {
  return normalizeIdentifier(value).includes("@");
}

export function isValidEmail(value = "") {
  const email = normalizeIdentifier(value).toLowerCase();

  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* =========================================================
   REDIRECT
========================================================= */

export function normalizePath(path = "/") {
  let value = safeText(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

export function isSafeInternalRedirect(path = "") {
  const value = safeText(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t\\]/.test(value)) return false;

  return true;
}

export function ensureSafeRedirect(path = "", fallback = "/login") {
  const fallbackPath = normalizePath(fallback || "/login");
  const candidate = normalizePath(path || fallbackPath);

  return isSafeInternalRedirect(candidate) ? candidate : fallbackPath;
}

/* =========================================================
   STORAGE COMPAT
   Nota: sin storage paralelo. Exports conservados para no romper imports.
========================================================= */

export function getStorage() {
  return null;
}

export function getNamespacedKey(key = "") {
  return safeText(key, "");
}

export function readStorage(_key, fallback = "") {
  return fallback;
}

export function writeStorage() {
  return false;
}

export function removeStorage() {
  return false;
}

export function loadRememberedIdentifier() {
  return "";
}

export function saveRememberedIdentifier() {
  return false;
}

export function clearRememberedIdentifier() {
  return false;
}

export function persistResetPasswordIdentifier() {
  return false;
}

/* =========================================================
   PAYLOAD
========================================================= */

export function createResetPasswordPayload({
  identifier = "",
  email = "",
  username = "",
  user = "",
  login = "",
  redirect = "",
} = {}) {
  const normalizedIdentifier = normalizeIdentifier(
    identifier || email || username || user || login
  );

  const normalizedEmail =
    looksLikeEmail(normalizedIdentifier) && isValidEmail(normalizedIdentifier)
      ? normalizedIdentifier.toLowerCase()
      : "";

  return {
    identifier: normalizedIdentifier,
    email: normalizedEmail,
    redirect: safeText(redirect, ""),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateResetPasswordPayload(payload = {}) {
  const rawIdentifier = safeText(
    payload.identifier ||
      payload.email ||
      payload.username ||
      payload.user ||
      payload.login ||
      "",
    ""
  );

  const identifier = normalizeIdentifier(rawIdentifier);
  const errors = {};

  if (!identifier) {
    errors.identifier = "Introduce tu email o nombre de usuario.";
    return errors;
  }

  if (rawIdentifier.length > MAX_IDENTIFIER_LENGTH) {
    errors.identifier = "El identificador es demasiado largo.";
    return errors;
  }

  if (looksLikeEmail(identifier) && !isValidEmail(identifier)) {
    errors.identifier = "El formato del email no es válido.";
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
   RESPONSE
========================================================= */

function readResponseMessage(raw = {}) {
  return (
    safeText(raw.message, "") ||
    safeText(raw.mensaje, "") ||
    safeText(raw.detail, "") ||
    safeText(raw.description, "") ||
    safeText(raw.error, "") ||
    safeText(raw.data?.message, "") ||
    safeText(raw.data?.mensaje, "") ||
    safeText(raw.data?.detail, "") ||
    safeText(raw.data?.description, "") ||
    safeText(raw.data?.error, "")
  );
}

export function normalizeResetPasswordResult(result = {}) {
  const raw = isObject(result) ? result : {};
  const status = number(raw.status ?? raw.statusCode ?? raw.data?.status ?? raw.data?.statusCode, 0);
  const retryAfter = Math.max(
    0,
    number(raw.retryAfter ?? raw.cooldownSeconds ?? raw.data?.retryAfter ?? raw.data?.cooldownSeconds, 0)
  );

  const explicitOk =
    typeof raw.ok === "boolean"
      ? raw.ok
      : typeof raw.success === "boolean"
        ? raw.success
        : typeof raw.data?.ok === "boolean"
          ? raw.data.ok
          : typeof raw.data?.success === "boolean"
            ? raw.data.success
            : null;

  const cooldown = Boolean(raw.cooldown) || status === 429 || retryAfter > 0;
  const ok = explicitOk === null
    ? raw.error !== true && status < 400
    : Boolean(explicitOk);

  const redirectTo =
    safeText(raw.redirectTo, "") ||
    safeText(raw.redirect, "") ||
    safeText(raw.data?.redirectTo, "") ||
    safeText(raw.data?.redirect, "");

  const emailMasked =
    safeText(raw.emailMasked, "") ||
    safeText(raw.maskedEmail, "") ||
    safeText(raw.data?.emailMasked, "") ||
    safeText(raw.data?.maskedEmail, "");

  return {
    raw,

    ok,
    success: ok,
    error: !ok,

    status,
    cooldown,
    retryAfter,
    cooldownSeconds: retryAfter,

    message: safeText(
      readResponseMessage(raw),
      ok
        ? DEFAULT_SUCCESS_MESSAGE
        : cooldown
          ? DEFAULT_COOLDOWN_MESSAGE
          : DEFAULT_ERROR_MESSAGE
    ),

    redirectTo: safeText(redirectTo, ""),
    emailMasked: safeText(emailMasked, ""),
  };
}

/* =========================================================
   ERROR MESSAGES
========================================================= */

export function buildResetPasswordCooldownMessage(seconds = 0) {
  const safeSeconds = Math.max(0, number(seconds, 0));

  if (!safeSeconds) {
    return DEFAULT_COOLDOWN_MESSAGE;
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

export function resolveResetPasswordErrorMessage(error = null) {
  const status = number(
    error?.status ??
      error?.statusCode ??
      error?.response?.status ??
      error?.data?.status ??
      error?.data?.statusCode,
    0
  );

  const retryAfter = number(
    error?.retryAfter ??
      error?.cooldownSeconds ??
      error?.data?.retryAfter ??
      error?.data?.cooldownSeconds ??
      error?.response?.data?.retryAfter ??
      error?.response?.data?.cooldownSeconds,
    0
  );

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
   EXECUTOR COMPAT
   Nota: la vista actual llama Auth directamente.
========================================================= */

export function resolveResetPasswordExecutor(deps = {}) {
  const candidates = [
    deps.onSubmit,
    deps.submitResetPassword,
    deps.requestResetPassword,
    deps.resetPassword,
  ];

  return candidates.find((candidate) => typeof candidate === "function") || null;
}

/* =========================================================
   SUCCESS / REDIRECT
========================================================= */

export function resolveResetPasswordRedirect(result = {}, options = {}) {
  const fallback =
    safeText(options.redirectTo, "") ||
    safeText(options.successRedirect, "") ||
    safeText(options.backToLoginHref, "") ||
    "/login";

  const redirect =
    safeText(result?.redirectTo, "") ||
    safeText(result?.redirect, "") ||
    safeText(result?.raw?.redirectTo, "") ||
    safeText(result?.raw?.redirect, "") ||
    safeText(result?.raw?.data?.redirectTo, "") ||
    safeText(result?.raw?.data?.redirect, "");

  return ensureSafeRedirect(redirect || fallback, "/login");
}

export function buildResetPasswordSuccessMessage(result = {}) {
  const normalized = normalizeResetPasswordResult(result);

  if (normalized.emailMasked) {
    return `Te hemos enviado las instrucciones a ${normalized.emailMasked}.`;
  }

  return safeText(normalized.message, DEFAULT_SUCCESS_MESSAGE);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  RESET_PASSWORD_HELPERS_VERSION,
  RESET_PASSWORD_IDENTIFIER_KEY,

  safeText,
  escapeHtml,
  isObject,

  normalizeIdentifier,
  looksLikeEmail,
  isValidEmail,
  getResetIdentifierMaxLength,

  normalizePath,
  isSafeInternalRedirect,
  ensureSafeRedirect,

  getStorage,
  getNamespacedKey,
  readStorage,
  writeStorage,
  removeStorage,

  loadRememberedIdentifier,
  saveRememberedIdentifier,
  clearRememberedIdentifier,
  persistResetPasswordIdentifier,

  createResetPasswordPayload,
  validateResetPasswordPayload,
  getFirstResetPasswordError,

  normalizeResetPasswordResult,
  buildResetPasswordCooldownMessage,
  resolveResetPasswordErrorMessage,

  resolveResetPasswordExecutor,
  resolveResetPasswordRedirect,
  buildResetPasswordSuccessMessage,
};

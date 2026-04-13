/* =========================================================
   Onion SPA - Reset Password Helpers
   Archivo: src/views/reset-password/reset-password.helpers.js

   Responsabilidades:
   - helpers puros de recuperación de acceso
   - validación de identificador
   - creación de payload uniforme
   - normalización de respuesta del backend
   - resolución de mensajes de error
   - persistencia opcional del identificador recordado
   - compatibilidad con usuario o email
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const RESET_PASSWORD_IDENTIFIER_KEY = "auth:last-identifier";

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
      return safeText(
        storage.get(key),
        fallback
      );
    }

    return safeText(
      window.localStorage.getItem(
        getNamespacedKey(key)
      ),
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
} = {}) {
  const normalizedIdentifier =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(email);

  return {
    identifier: normalizedIdentifier,
    email: looksLikeEmail(normalizedIdentifier)
      ? normalizedIdentifier.toLowerCase()
      : "",
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateResetPasswordPayload(payload = {}) {
  const identifier = normalizeIdentifier(
    payload.identifier || payload.email || ""
  );

  const errors = {};

  if (!identifier) {
    errors.identifier =
      "Introduce tu email o nombre de usuario.";
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
    message: safeText(
      message,
      "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña."
    ),
    redirectTo: safeText(redirectTo, ""),
    cooldownSeconds: Math.max(0, cooldown),
    emailMasked: safeText(emailMasked, ""),
  };
}

export function resolveResetPasswordErrorMessage(error) {
  return (
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "") ||
    "No se pudo procesar la recuperación de acceso."
  );
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
    return ensureSafeRedirect(responseRedirect, explicitRedirect);
  }

  return ensureSafeRedirect(explicitRedirect, "/login");
}

/* =========================================================
   UX HELPERS
========================================================= */

export function buildResetPasswordSuccessMessage(result = {}) {
  const normalized = normalizeResetPasswordResult(result);

  if (normalized.emailMasked) {
    return `Te hemos enviado las instrucciones a ${normalized.emailMasked}.`;
  }

  return normalized.message ||
    "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña.";
}

export function buildResetPasswordCooldownMessage(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);

  if (!safeSeconds) {
    return "Espera un momento antes de volver a intentarlo.";
  }

  if (safeSeconds === 1) {
    return "Espera 1 segundo antes de volver a intentarlo.";
  }

  return `Espera ${safeSeconds} segundos antes de volver a intentarlo.`;
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

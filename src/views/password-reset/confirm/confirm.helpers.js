/* =========================================================
   Onion SPA - Reset Password Confirm Helpers
   Archivo: src/views/password-reset/confirm/confirm.helpers.js

   Responsabilidad:
   - Helpers puros mínimos para confirm reset.
   - Leer token básico desde URL.
   - Crear payload confirm.
   - Validar contraseña.
   - Normalizar resultado/error.
   - Resolver redirect seguro a /login.
   - Sin AppCore.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin magia negra.
========================================================= */

export const CONFIRM_HELPERS_VERSION = "minimal-1";

export const DEFAULT_SUCCESS_MESSAGE =
  "La contraseña se ha actualizado correctamente.";

export const DEFAULT_ERROR_MESSAGE =
  "No se pudo restablecer la contraseña.";

export const MIN_PASSWORD_LENGTH = 8;

const DEFAULT_LOGIN_PATH = "/login";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const TOKEN_KEYS = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
]);

/* =========================================================
   BASICS
========================================================= */

export function safeText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeToken(value = "") {
  const token = safeText(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

/* =========================================================
   PATH / REDIRECT
========================================================= */

export function normalizePath(path = DEFAULT_LOGIN_PATH) {
  let value = safeText(path, DEFAULT_LOGIN_PATH);

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  value = value.split("?")[0].split("#")[0];

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value || DEFAULT_LOGIN_PATH;
}

function isSafeInternalPath(path = "") {
  const value = safeText(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t\\]/.test(value)) return false;

  return true;
}

function normalizeRedirectPath(path = DEFAULT_LOGIN_PATH) {
  const candidate = normalizePath(path || DEFAULT_LOGIN_PATH);

  return isSafeInternalPath(candidate) ? candidate : DEFAULT_LOGIN_PATH;
}

/* =========================================================
   TOKEN
========================================================= */

function tokenFromSearch(search = "") {
  const raw = safeText(search, "");
  if (!raw) return "";

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);

    for (const key of TOKEN_KEYS) {
      const token = normalizeToken(params.get(key));
      if (token) return token;
    }
  } catch {
    // noop
  }

  return "";
}

function tokenFromHash(hash = "") {
  const raw = safeText(hash, "");
  if (!raw) return "";

  if (raw.includes("?")) {
    return tokenFromSearch(raw.split("?").slice(1).join("?"));
  }

  return tokenFromPath(raw.replace(/^#\/?/, "/"));
}

function tokenFromPath(pathname = "") {
  const path = normalizePath(pathname);
  const parts = path.split("/").filter(Boolean);

  const index = parts.findIndex((part, position) => (
    part === "reset-password" &&
    parts[position + 1] === "confirm"
  ));

  if (index < 0 || !parts[index + 2]) return "";

  try {
    return normalizeToken(decodeURIComponent(parts[index + 2]));
  } catch {
    return normalizeToken(parts[index + 2]);
  }
}

export function getUrlToken() {
  if (!isBrowser()) return "";

  try {
    return (
      tokenFromSearch(window.location.search) ||
      tokenFromHash(window.location.hash) ||
      tokenFromPath(window.location.pathname)
    );
  } catch {
    return "";
  }
}

/* =========================================================
   PAYLOAD
========================================================= */

export function createConfirmPayload({
  token = "",
  password = "",
  newPassword = "",
  confirmPassword = "",
  passwordConfirm = "",
} = {}) {
  const cleanToken = normalizeToken(token);
  const cleanPassword = String(password || newPassword || "");
  const cleanConfirmPassword = String(confirmPassword || passwordConfirm || "");

  return {
    token: cleanToken,
    resetToken: cleanToken,
    passwordResetToken: cleanToken,
    confirmToken: cleanToken,
    code: cleanToken,
    t: cleanToken,

    password: cleanPassword,
    newPassword: cleanPassword,
    confirmPassword: cleanConfirmPassword,
    passwordConfirm: cleanConfirmPassword,
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateConfirmPayload(payload = {}) {
  const errors = {};

  const token = normalizeToken(
    payload.token ||
      payload.resetToken ||
      payload.passwordResetToken ||
      payload.confirmToken ||
      payload.code ||
      payload.t
  );

  const password = String(payload.password || payload.newPassword || "");
  const confirmPassword = String(
    payload.confirmPassword ||
      payload.passwordConfirm ||
      payload.repeatPassword ||
      payload.password2 ||
      ""
  );

  if (!token) {
    errors.global = "El enlace no es válido o falta el token.";
  }

  if (!password.trim()) {
    errors.password = "Introduce una nueva contraseña.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (!confirmPassword.trim()) {
    errors.confirmPassword = "Confirma la nueva contraseña.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

export function getFirstConfirmError(errors = {}) {
  return (
    safeText(errors.global, "") ||
    safeText(errors.password, "") ||
    safeText(errors.confirmPassword, "") ||
    "Revisa el formulario."
  );
}

/* =========================================================
   RESULT / ERROR
========================================================= */

export function normalizeConfirmResult(result = {}) {
  const raw = isObject(result) ? result : {};
  const data = isObject(raw.data) ? raw.data : {};

  const explicitOk =
    typeof raw.ok === "boolean"
      ? raw.ok
      : typeof raw.success === "boolean"
        ? raw.success
        : typeof data.ok === "boolean"
          ? data.ok
          : typeof data.success === "boolean"
            ? data.success
            : null;

  const status = Number(raw.status || raw.statusCode || data.status || data.statusCode || 0) || 0;
  const ok = explicitOk === null
    ? raw.error !== true && status < 400
    : Boolean(explicitOk);

  const message =
    safeText(raw.message, "") ||
    safeText(raw.mensaje, "") ||
    safeText(raw.detail, "") ||
    safeText(raw.error, "") ||
    safeText(data.message, "") ||
    safeText(data.mensaje, "") ||
    safeText(data.detail, "") ||
    safeText(data.error, "");

  const redirectTo =
    safeText(raw.redirectTo, "") ||
    safeText(raw.redirect, "") ||
    safeText(data.redirectTo, "") ||
    safeText(data.redirect, "") ||
    DEFAULT_LOGIN_PATH;

  return {
    raw,
    ok,
    success: ok,
    error: !ok,
    status,
    message: safeText(message, ok ? DEFAULT_SUCCESS_MESSAGE : DEFAULT_ERROR_MESSAGE),
    redirectTo: normalizeRedirectPath(redirectTo),
  };
}

function errorCode(error = null) {
  return safeText(
    error?.code ||
      error?.error ||
      error?.data?.code ||
      error?.data?.error ||
      error?.response?.data?.code ||
      error?.response?.data?.error,
    ""
  ).toUpperCase();
}

export function resolveConfirmErrorMessage(error = null) {
  const code = errorCode(error);

  if (code.includes("EXPIRED")) {
    return "El enlace de recuperación ha caducado. Solicita uno nuevo.";
  }

  if (
    code.includes("TOKEN_INVALID") ||
    code.includes("INVALID_TOKEN") ||
    code.includes("TOKEN_NOT_FOUND") ||
    code.includes("NOT_FOUND")
  ) {
    return "El enlace de recuperación no es válido o ya no está disponible.";
  }

  if (code.includes("USED")) {
    return "Este enlace de recuperación ya ha sido utilizado.";
  }

  if (
    code.includes("WEAK_PASSWORD") ||
    code.includes("PASSWORD_POLICY")
  ) {
    return "La contraseña no cumple los requisitos de seguridad.";
  }

  if (code.includes("MISMATCH")) {
    return "Las contraseñas no coinciden.";
  }

  return (
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.message, "") ||
    DEFAULT_ERROR_MESSAGE
  );
}

/* =========================================================
   REDIRECT
========================================================= */

export function resolveConfirmRedirect(result = {}, deps = {}) {
  return normalizeRedirectPath(
    safeText(deps.redirectTo, "") ||
      safeText(result.redirectTo, "") ||
      DEFAULT_LOGIN_PATH
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CONFIRM_HELPERS_VERSION,

  DEFAULT_SUCCESS_MESSAGE,
  DEFAULT_ERROR_MESSAGE,
  MIN_PASSWORD_LENGTH,

  safeText,
  isObject,

  normalizePath,
  getUrlToken,

  createConfirmPayload,
  validateConfirmPayload,
  getFirstConfirmError,

  normalizeConfirmResult,
  resolveConfirmErrorMessage,
  resolveConfirmRedirect,
};

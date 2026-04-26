/* =========================================================
   Onion SPA - Reset Password Confirm Helpers
   Archivo: src/views/password-reset/confirm/confirm.helpers.js

   Responsabilidades:
   - helpers puros del flujo confirm
   - lectura robusta de token desde URL normal
   - lectura robusta de token desde /reset-password/confirm/<token>
   - lectura robusta de token desde hash-router
   - lectura robusta desde history.state / URL inicial capturada
   - normalización de payload
   - validación de contraseña
   - normalización de respuesta backend
   - mensajes UX consistentes
   - redirects seguros post-success
   - no exponer token real en logs
   - compatibilidad total SPA pública
========================================================= */

import { AppCore } from "../../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const DEFAULT_SUCCESS_MESSAGE =
  "La contraseña se ha actualizado correctamente.";

export const DEFAULT_ERROR_MESSAGE =
  "No se pudo restablecer la contraseña.";

export const MIN_PASSWORD_LENGTH = 8;

const DEFAULT_LOGIN_PATH = "/login";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
]);

const PUBLIC_SAFE_REDIRECTS = new Set([
  "/login",
  "/",
]);

/* =========================================================
   BASICS
========================================================= */

export function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function safeDecodeURIComponent(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    return safeText(
      decodeURIComponent(text),
      text
    );
  } catch {
    return text;
  }
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value =
    String(search || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    String(hash || "").trim();

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitRawPath(path = "/") {
  const raw =
    safeText(path, "/");

  if (!raw) {
    return {
      pathname: "/",
      search: "",
      hash: "",
    };
  }

  if (isHashRouterPath(raw)) {
    return splitRawPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ) {
      const url = new URL(
        raw,
        getBaseOrigin()
      );

      if (
        url.hash &&
        isHashRouterPath(url.hash)
      ) {
        return splitRawPath(
          normalizeHashRouterPath(url.hash)
        );
      }

      return {
        pathname:
          url.pathname || "/",
        search:
          normalizeSearch(url.search || ""),
        hash:
          normalizeHash(url.hash || ""),
      };
    }
  } catch {}

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname =
      pathname.slice(0, hashIndex) ||
      "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname =
      pathname.slice(0, searchIndex) ||
      "/";
  }

  return {
    pathname:
      pathname || "/",
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
  };
}

export function normalizePath(
  path = DEFAULT_LOGIN_PATH
) {
  const raw =
    safeText(path, DEFAULT_LOGIN_PATH) ||
    DEFAULT_LOGIN_PATH;

  if (
    typeof AppCore?.utils?.normalizePath ===
    "function"
  ) {
    try {
      const parts = splitRawPath(raw);

      const normalizedPathname =
        AppCore.utils.normalizePath(
          parts.pathname || DEFAULT_LOGIN_PATH
        );

      return `${normalizePathnameOnly(normalizedPathname)}${parts.search}${parts.hash}`;
    } catch {}
  }

  if (raw === "/") {
    return "/";
  }

  const parts = splitRawPath(raw);

  return (
    `${normalizePathnameOnly(parts.pathname)}${parts.search}${parts.hash}` ||
    DEFAULT_LOGIN_PATH
  );
}

function normalizeRedirectPath(path = DEFAULT_LOGIN_PATH) {
  const value = normalizePath(path);

  if (!value || typeof value !== "string") {
    return DEFAULT_LOGIN_PATH;
  }

  if (/^(https?:|mailto:|tel:|javascript:|data:|vbscript:)/i.test(value)) {
    return DEFAULT_LOGIN_PATH;
  }

  if (!value.startsWith("/")) {
    return DEFAULT_LOGIN_PATH;
  }

  if (PUBLIC_SAFE_REDIRECTS.has(value)) {
    return value;
  }

  return value;
}

/* =========================================================
   TOKEN EXTRACTION
========================================================= */

function getTokenFromSearchParams(search = "") {
  try {
    const params = new URLSearchParams(
      search || ""
    );

    for (const key of TOKEN_PARAM_NAMES) {
      const value = safeText(
        params.get(key),
        ""
      );

      if (value) {
        return value;
      }
    }

    /*
      Fallback defensivo:
      algunos clientes de correo envuelven la URL real dentro de
      redirect=, url=, link=, target=, etc.
    */
    for (const [, rawValue] of params.entries()) {
      const value = safeText(rawValue, "");

      if (!value) {
        continue;
      }

      const lower = value.toLowerCase();

      if (
        !lower.includes("token") &&
        !lower.includes("reset") &&
        !lower.includes("confirm")
      ) {
        continue;
      }

      const nestedToken =
        extractTokenFromUrlLike(value);

      if (nestedToken) {
        return nestedToken;
      }

      try {
        const decoded =
          decodeURIComponent(value);

        const decodedToken =
          extractTokenFromUrlLike(decoded);

        if (decodedToken) {
          return decodedToken;
        }
      } catch {}
    }
  } catch {}

  return "";
}

function extractTokenFromRoutePath(pathname = "") {
  try {
    const normalized =
      normalizePathnameOnly(pathname);

    const escapedBase =
      RESET_CONFIRM_PATH.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const pattern = new RegExp(
      `^${escapedBase}/([^/?#]+)$`,
      "i"
    );

    const match =
      normalized.match(pattern);

    if (!match?.[1]) {
      return "";
    }

    return safeDecodeURIComponent(
      match[1]
    );
  } catch {
    return "";
  }
}

function extractTokenFromHash(hash = "") {
  const rawHash =
    safeText(hash, "");

  if (!rawHash) {
    return "";
  }

  try {
    const cleanHash =
      normalizeHashRouterPath(rawHash);

    const query =
      cleanHash.includes("?")
        ? cleanHash.split("?").slice(1).join("?")
        : "";

    const fromQuery =
      getTokenFromSearchParams(
        query ? `?${query}` : ""
      );

    if (fromQuery) {
      return fromQuery;
    }

    const pathOnly =
      cleanHash.split("?")[0] || "";

    return extractTokenFromRoutePath(
      pathOnly
    );
  } catch {
    return "";
  }
}

function extractTokenFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(
      raw,
      getBaseOrigin()
    );

    const fromSearch =
      getTokenFromSearchParams(
        parsed.search
      );

    if (fromSearch) {
      return fromSearch;
    }

    const fromHash =
      extractTokenFromHash(
        parsed.hash
      );

    if (fromHash) {
      return fromHash;
    }

    return extractTokenFromRoutePath(
      parsed.pathname
    );
  } catch {
    try {
      if (isHashRouterPath(raw)) {
        return extractTokenFromHash(raw);
      }

      const parts = splitRawPath(raw);

      const fromSearch =
        getTokenFromSearchParams(
          parts.search
        );

      if (fromSearch) {
        return fromSearch;
      }

      const fromHash =
        extractTokenFromHash(
          parts.hash
        );

      if (fromHash) {
        return fromHash;
      }

      return extractTokenFromRoutePath(
        parts.pathname
      );
    } catch {
      return "";
    }
  }
}

function getHistoryUrlCandidates() {
  if (!isBrowser()) {
    return [];
  }

  try {
    const historyState =
      window.history?.state &&
      typeof window.history.state === "object"
        ? window.history.state
        : null;

    if (!historyState) {
      return [];
    }

    return [
      historyState.publicPath,
      historyState.path,
      historyState.requestedPath,
      historyState.url,
      historyState.href,
      historyState.redirectedFrom,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getWindowUrlCandidates() {
  const urls = [];

  if (!isBrowser()) {
    return urls;
  }

  try {
    urls.push(window.location.href);
  } catch {}

  try {
    urls.push(window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__);
  } catch {}

  try {
    urls.push(window.__ONION_INITIAL_URL__);
  } catch {}

  try {
    urls.push(document.referrer);
  } catch {}

  return urls
    .map((url) => safeText(url, ""))
    .filter(Boolean);
}

function getAppStateUrlCandidates() {
  return [
    AppCore?.state?.publicPath,
    AppCore?.state?.route,
    AppCore?.state?.lastRoute,
  ]
    .map((url) => safeText(url, ""))
    .filter(Boolean);
}

function getInitialTokenCandidates() {
  return [
    ...getHistoryUrlCandidates(),
    ...getWindowUrlCandidates(),
    ...getAppStateUrlCandidates(),
  ]
    .map((url) => safeText(url, ""))
    .filter(Boolean);
}

/**
 * Lee el token del reset password confirm.
 *
 * Soporta:
 * - /reset-password/confirm?token=abc
 * - /reset-password/confirm/abc
 * - /#/reset-password/confirm?token=abc
 * - /#/reset-password/confirm/abc
 * - history.state.publicPath
 * - window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__
 * - window.__ONION_INITIAL_URL__
 */
export function getUrlToken() {
  const candidates =
    getInitialTokenCandidates();

  for (const candidate of candidates) {
    const token =
      extractTokenFromUrlLike(candidate);

    if (token) {
      return token;
    }
  }

  return "";
}

/* =========================================================
   PAYLOAD
========================================================= */

export function createConfirmPayload({
  token = "",
  password = "",
  confirmPassword = "",
} = {}) {
  const cleanToken =
    safeText(token, "");

  const cleanPassword =
    String(password || "");

  const cleanConfirmPassword =
    String(confirmPassword || "");

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
    repeatPassword: cleanConfirmPassword,
    password2: cleanConfirmPassword,
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateConfirmPayload(
  payload = {}
) {
  const errors = {};

  const token = safeText(
    payload.token ||
      payload.resetToken ||
      payload.passwordResetToken ||
      payload.confirmToken ||
      payload.code ||
      payload.t,
    ""
  );

  const password = String(
    payload.password ||
      payload.newPassword ||
      ""
  );

  const confirmPassword =
    String(
      payload.confirmPassword ||
        payload.passwordConfirm ||
        payload.repeatPassword ||
        payload.password2 ||
        ""
    );

  if (!token) {
    errors.global =
      "El enlace no es válido o falta el token.";
  }

  if (!password.trim()) {
    errors.password =
      "Introduce una nueva contraseña.";
  } else if (
    password.length <
    MIN_PASSWORD_LENGTH
  ) {
    errors.password =
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (!confirmPassword.trim()) {
    errors.confirmPassword =
      "Repite la contraseña.";
  } else if (
    password !==
    confirmPassword
  ) {
    errors.confirmPassword =
      "Las contraseñas no coinciden.";
  }

  return errors;
}

export function getFirstConfirmError(
  errors = {}
) {
  return (
    safeText(
      errors.global,
      ""
    ) ||
    safeText(
      errors.password,
      ""
    ) ||
    safeText(
      errors.confirmPassword,
      ""
    ) ||
    "Revisa el formulario."
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeConfirmResult(
  result = {}
) {
  const raw = isObject(result)
    ? result
    : {};

  const data = isObject(raw.data)
    ? raw.data
    : {};

  const payload = isObject(raw.payload)
    ? raw.payload
    : {};

  const explicitOk =
    typeof raw.ok === "boolean"
      ? raw.ok
      : typeof raw.success === "boolean"
        ? raw.success
        : typeof data.ok === "boolean"
          ? data.ok
          : typeof data.success === "boolean"
            ? data.success
            : typeof payload.ok === "boolean"
              ? payload.ok
              : typeof payload.success === "boolean"
                ? payload.success
                : null;

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    raw.message ||
    raw.mensaje ||
    raw.detail ||
    raw.error ||
    data.message ||
    data.mensaje ||
    data.detail ||
    data.error ||
    payload.message ||
    payload.mensaje ||
    payload.detail ||
    payload.error ||
    "";

  const redirectTo =
    raw.redirectTo ||
    raw.redirect ||
    data.redirectTo ||
    data.redirect ||
    payload.redirectTo ||
    payload.redirect ||
    DEFAULT_LOGIN_PATH;

  return {
    raw,
    ok,
    success: ok,
    error: !ok,

    message: safeText(
      message,
      ok
        ? DEFAULT_SUCCESS_MESSAGE
        : DEFAULT_ERROR_MESSAGE
    ),

    redirectTo:
      normalizeRedirectPath(
        redirectTo
      ),
  };
}

/* =========================================================
   ERROR MESSAGE
========================================================= */

function normalizeErrorCode(error = null) {
  return safeText(
    error?.code ||
      error?.error ||
      error?.data?.code ||
      error?.data?.error ||
      error?.response?.data?.code ||
      error?.response?.data?.error ||
      "",
    ""
  ).toUpperCase();
}

export function resolveConfirmErrorMessage(
  error
) {
  const code =
    normalizeErrorCode(error);

  if (
    code.includes("TOKEN_EXPIRED") ||
    code.includes("EXPIRED")
  ) {
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

  if (
    code.includes("TOKEN_ALREADY_USED") ||
    code.includes("USED")
  ) {
    return "Este enlace de recuperación ya ha sido utilizado.";
  }

  if (
    code.includes("WEAK_PASSWORD") ||
    code.includes("PASSWORD_POLICY")
  ) {
    return "La contraseña no cumple los requisitos de seguridad.";
  }

  if (
    code.includes("PASSWORD_MISMATCH") ||
    code.includes("MISMATCH")
  ) {
    return "Las contraseñas no coinciden.";
  }

  const backendMessage =
    safeText(
      error?.data?.message,
      ""
    ) ||
    safeText(
      error?.data?.mensaje,
      ""
    ) ||
    safeText(
      error?.response?.data?.message,
      ""
    ) ||
    safeText(
      error?.response?.data?.mensaje,
      ""
    ) ||
    safeText(
      error?.message,
      ""
    );

  return (
    backendMessage ||
    DEFAULT_ERROR_MESSAGE
  );
}

/* =========================================================
   REDIRECT
========================================================= */

export function resolveConfirmRedirect(
  result = {},
  deps = {}
) {
  return normalizeRedirectPath(
    safeText(
      deps.redirectTo,
      ""
    ) ||
      safeText(
        result.redirectTo,
        ""
      ) ||
      DEFAULT_LOGIN_PATH
  );
}

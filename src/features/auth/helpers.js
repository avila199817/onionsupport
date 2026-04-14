/* =========================================================
   Onion SPA - Auth Helpers
   Archivo: src/features/auth/helpers.js

   Responsabilidades:
   - helpers base auth
   - normalización paths
   - saneado username / slug / tokens
   - extracción segura mensajes error
   - detección rutas auth
   - validación redirects internos
   - endurecer strings / urls / payloads backend
========================================================= */

import { AppCore } from "../../core/index.js";
import { AUTH_CONSTANTS } from "./constants.js";

/* =========================================================
   BASE
========================================================= */

export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function safeClone(value) {
  try {
    if (typeof AppCore?.utils?.safeClone === "function") {
      return AppCore.utils.safeClone(value, value);
    }
  } catch {}

  try {
    return structuredClone(value);
  } catch {}

  return value;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function fallbackNormalizePath(value = "/") {
  const raw = safeText(value, "/") || "/";

  if (raw === "/") {
    return "/";
  }

  return raw
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";
}

export function normalizePath(path = "/") {
  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      return AppCore.utils.normalizePath(path);
    }
  } catch {}

  return fallbackNormalizePath(path);
}

export function normalizeCanonicalPath(path = "/") {
  try {
    if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") {
      return AppCore.utils.normalizeCanonicalPath(path);
    }
  } catch {}

  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      return AppCore.utils.normalizePath(path);
    }
  } catch {}

  return fallbackNormalizePath(path);
}

export function getCurrentCanonicalPath() {
  if (!isBrowser()) {
    return "/";
  }

  const raw =
    `${window.location.pathname || "/"}${window.location.search || ""}`;

  return normalizeCanonicalPath(raw);
}

export function isAuthRoute(
  pathname = isBrowser()
    ? window.location.pathname
    : "/"
) {
  const path =
    normalizeCanonicalPath(pathname)
      .toLowerCase();

  return [
    "/login",
    "/signin",
    "/auth",
    "/auth/login",
    "/reset-password",
    "/forgot-password",
    "/2fa",
  ].includes(path);
}

export function configLikeRoute(path = "/") {
  return normalizePath(path || "/");
}

export function isSafeRelativePath(path = "") {
  const raw = safeText(path, "");

  if (!raw) {
    return false;
  }

  if (!raw.startsWith("/")) {
    return false;
  }

  if (raw.startsWith("//")) {
    return false;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(raw)) {
    return false;
  }

  if (/[\r\n]/.test(raw)) {
    return false;
  }

  return true;
}

/* =========================================================
   USER / TOKEN
========================================================= */

export function sanitizeUsername(value = "") {
  try {
    if (typeof AppCore?.utils?.sanitizeUsername === "function") {
      return AppCore.utils.sanitizeUsername(value);
    }
  } catch {}

  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase()
    .slice(0, safeNumber(AUTH_CONSTANTS?.identifierMaxLength, 160));
}

export function slugify(value = "") {
  try {
    if (typeof AppCore?.utils?.slugify === "function") {
      return AppCore.utils.slugify(value);
    }
  } catch {}

  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTokenValue(token = null) {
  if (token === null || token === undefined) {
    return null;
  }

  const normalized = String(token).trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(
    0,
    safeNumber(AUTH_CONSTANTS?.tokenMaxLength, 4096)
  );
}

export function normalizeSessionValue(
  value = null,
  maxLength = AUTH_CONSTANTS?.sessionValueMaxLength
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(
    0,
    safeNumber(maxLength, 200)
  );
}

export function hasValidToken(
  token = AppCore?.state?.token
) {
  return Boolean(normalizeTokenValue(token));
}

/* =========================================================
   ERROR MESSAGE
========================================================= */

export function extractMessage(error) {
  if (!error) {
    return "Error de autenticación";
  }

  if (typeof error === "string") {
    return error;
  }

  const message =
    safeText(error?.data?.message, "") ||
    safeText(error?.data?.mensaje, "") ||
    safeText(error?.data?.detail, "") ||
    safeText(error?.data?.error, "") ||
    safeText(error?.response?.data?.message, "") ||
    safeText(error?.response?.data?.mensaje, "") ||
    safeText(error?.response?.data?.detail, "") ||
    safeText(error?.response?.data?.error, "") ||
    (typeof error?.data === "string" ? safeText(error.data, "") : "") ||
    safeText(error?.message, "") ||
    safeText(error?.statusText, "");

  return message || "Error de autenticación";
}

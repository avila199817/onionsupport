/* =========================================================
   Onion SPA - Auth Helpers
   Archivo: src/features/auth/helpers.js

   Responsabilidades:
   - helpers base del módulo auth
   - normalización de paths y canonical paths
   - saneado de username / slug / tokens
   - extracción segura de mensajes de error
   - detección de rutas auth
   - validación de redirects internos seguros
========================================================= */

import { AppCore } from "../../core/index.js";
import { AUTH_CONSTANTS } from "./constants.js";

/* =========================================================
   BASE
========================================================= */
export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function safeClone(value) {
  if (typeof AppCore.utils?.safeClone === "function") {
    return AppCore.utils.safeClone(value, value);
  }

  return value;
}

/* =========================================================
   PATH HELPERS
========================================================= */
export function normalizePath(path = "/") {
  const fn =
    AppCore.utils?.normalizePath ||
    ((value) => String(value || "/").trim() || "/");

  return fn(path || "/");
}

export function normalizeCanonicalPath(path = "/") {
  const fn =
    AppCore.utils?.normalizeCanonicalPath ||
    AppCore.utils?.normalizePath ||
    ((value) => String(value || "/").trim() || "/");

  return fn(path || "/");
}

export function getCurrentCanonicalPath() {
  const rawPath = isBrowser()
    ? `${window.location.pathname || "/"}${window.location.search || ""}`
    : "/";

  return normalizeCanonicalPath(rawPath);
}

export function isAuthRoute(pathname = isBrowser() ? window.location.pathname : "/") {
  const path = normalizeCanonicalPath(pathname).toLowerCase();

  return (
    path === "/login" ||
    path === "/signin" ||
    path === "/auth" ||
    path === "/auth/login"
  );
}

export function configLikeRoute(path = "/") {
  return normalizePath(path || "/");
}

export function isSafeRelativePath(path = "") {
  const raw = String(path || "").trim();

  if (!raw) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(raw)) return false;

  return true;
}

/* =========================================================
   USER / TOKEN NORMALIZATION
========================================================= */
export function sanitizeUsername(value = "") {
  if (typeof AppCore.utils?.sanitizeUsername === "function") {
    return AppCore.utils.sanitizeUsername(value);
  }

  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export function slugify(value = "") {
  if (typeof AppCore.utils?.slugify === "function") {
    return AppCore.utils.slugify(value);
  }

  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTokenValue(token = null) {
  if (token === null || token === undefined) return null;

  const normalized = String(token).trim();
  if (!normalized) return null;

  return normalized.slice(0, AUTH_CONSTANTS.tokenMaxLength);
}

export function normalizeSessionValue(
  value = null,
  maxLength = AUTH_CONSTANTS.sessionValueMaxLength
) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  return normalized.slice(0, maxLength);
}

export function hasValidToken(token = AppCore.state.token) {
  return Boolean(token && String(token).trim());
}

/* =========================================================
   ERROR MESSAGE
========================================================= */
export function extractMessage(error) {
  if (!error) return "Error de autenticación";
  if (typeof error === "string") return error;
  if (error.data?.message) return error.data.message;
  if (error.data?.error) return error.data.error;
  if (typeof error.data === "string") return error.data;
  if (error.message) return error.message;
  return "Error de autenticación";
}

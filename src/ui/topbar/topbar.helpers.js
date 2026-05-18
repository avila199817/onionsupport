/* =========================================================
   Onion Support - Topbar Helpers
   Archivo: /src/ui/topbar/topbar.helpers.js

   Responsabilidad:
   - Helpers mínimos de compat para Topbar.
   - Sin DOM mutation.
   - Sin overlays.
   - Sin search runtime.
   - Sin HTTP.
   - Sin Store.
   - Sin Router real.
   - Sin aliases legacy masivos.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_HELPERS_VERSION = "simple";

export const TOPBAR_SCOPE = "ui:topbar";
export const TOPBAR_SEARCH_SCOPE = "ui:topbar:search";

export const TOPBAR_SEARCH_CONFIG = Object.freeze({
  debounceMs: 200,
  minQueryLength: 1,
  maxQueryLength: 120,
  maxResultsTotal: 20,
  maxResultsPerGroup: 6,
  cacheTtlMs: 0,
  timeoutMs: 8000,
  mobileBreakpoint: 900,
});

export const TOPBAR_RESULT_TYPES = Object.freeze({
  INCIDENCIA: "incidencia",
  FACTURA: "factura",
  CLIENTE: "cliente",
  USUARIO: "usuario",
  NAV: "nav",
  SETTINGS: "settings",
  RECENT: "recent",
  GENERAL: "general",
});

const TYPE_LABELS = Object.freeze({
  incidencia: "Incidencias",
  factura: "Facturas",
  cliente: "Clientes",
  usuario: "Usuarios",
  nav: "Navegación",
  settings: "Ajustes",
  recent: "Recientes",
  general: "Resultados",
});

const TYPE_ICONS = Object.freeze({
  incidencia: "incidencia",
  factura: "factura",
  cliente: "cliente",
  usuario: "usuario",
  nav: "nav",
  settings: "settings",
  recent: "recent",
  general: "general",
});

const TYPE_ORDER = Object.freeze([
  "incidencia",
  "factura",
  "cliente",
  "usuario",
  "nav",
  "settings",
  "recent",
  "general",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

export function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (safeObject(value) === value && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

export function escapeHtml(_AppCore, value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   TEXT
========================================================= */

export function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLooseText(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9@._\-/#:\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompactText(value = "") {
  return normalizeLooseText(value).replace(/[^a-z0-9@._\-/#:]/gi, "");
}

export function normalizeQuery(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPBAR_SEARCH_CONFIG.maxQueryLength);
}

export function tokenize(value = "") {
  return normalizeLooseText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function uniqBy(items = [], keyGetter = null) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const key = typeof keyGetter === "function"
      ? safeText(keyGetter(item), "")
      : safeText(item?.id || item?.key || item?.url || item?.title, "");

    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

/* =========================================================
   TYPES
========================================================= */

export function normalizeResultType(type = TOPBAR_RESULT_TYPES.GENERAL) {
  const clean = normalizeCompactText(type || TOPBAR_RESULT_TYPES.GENERAL);

  if (clean === "incidencias" || clean === "ticket" || clean === "tickets") return "incidencia";
  if (clean === "facturas" || clean === "invoice" || clean === "invoices") return "factura";
  if (clean === "clientes" || clean === "client" || clean === "clients") return "cliente";
  if (clean === "usuarios" || clean === "user" || clean === "users") return "usuario";
  if (clean === "ajustes" || clean === "setting" || clean === "config") return "settings";
  if (clean === "route" || clean === "ruta") return "nav";

  return TYPE_LABELS[clean] ? clean : TOPBAR_RESULT_TYPES.GENERAL;
}

export function isResultType(type = "", expected = "") {
  return normalizeResultType(type) === normalizeResultType(expected);
}

export function getTypeLabel(type = TOPBAR_RESULT_TYPES.GENERAL) {
  return TYPE_LABELS[normalizeResultType(type)] || TYPE_LABELS.general;
}

export function getTypeIcon(type = TOPBAR_RESULT_TYPES.GENERAL) {
  return TYPE_ICONS[normalizeResultType(type)] || TYPE_ICONS.general;
}

export function getTypeGroupOrder(type = TOPBAR_RESULT_TYPES.GENERAL) {
  const index = TYPE_ORDER.indexOf(normalizeResultType(type));
  return index >= 0 ? index : TYPE_ORDER.length;
}

/* =========================================================
   PATHS
========================================================= */

function baseOrigin() {
  return isBrowser() && window.location?.origin
    ? window.location.origin
    : "http://localhost";
}

export function isUnsafeHref(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return (
    raw.startsWith("javascript:") ||
    raw.startsWith("data:") ||
    raw.startsWith("vbscript:") ||
    raw.startsWith("file:")
  );
}

export function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

export function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "/");

  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";

  return raw.replace(/^#\/?/, "/") || "/";
}

export function isHashOnlyHref(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#") && !isHashRouterPath(raw);
}

export function isExternalHref(value = "") {
  const raw = safeText(value, "");

  if (!raw || isUnsafeHref(raw)) return false;
  if (raw.startsWith("//")) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;

  try {
    const url = new URL(raw, baseOrigin());

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin !== baseOrigin();
    }

    return true;
  } catch {
    return true;
  }
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/").replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value || "/";
}

export function safeNormalizePath(_AppCore, path = "/") {
  let raw = safeText(path, "/");

  if (!raw || isUnsafeHref(raw) || isExternalHref(raw)) return "/";
  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);
  if (isHashOnlyHref(raw)) return raw;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw, baseOrigin());
      raw = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "/";
  }

  if (!raw.startsWith("/")) raw = `/${raw}`;

  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;

  const queryIndex = withoutHash.indexOf("?");
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  return `${normalizePathname(pathname)}${search}${hash}`;
}

export function safeNormalizeCanonicalPath(AppCore, path = "/") {
  return safeNormalizePath(AppCore, path).split("?")[0].split("#")[0] || "/";
}

export function getCurrentPublicPath(AppCore = null) {
  if (!isBrowser()) return "/";

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return safeNormalizePath(AppCore, normalizeHashRouterPath(hash));
    }

    return safeNormalizePath(
      AppCore,
      `${window.location.pathname || "/"}${window.location.search || ""}${hash}`
    );
  } catch {
    return "/";
  }
}

export function isMobileViewport(mobileBreakpoint = TOPBAR_SEARCH_CONFIG.mobileBreakpoint) {
  if (!isBrowser()) return false;

  const breakpoint = Number(mobileBreakpoint) || TOPBAR_SEARCH_CONFIG.mobileBreakpoint;

  try {
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  } catch {
    return window.innerWidth <= breakpoint;
  }
}

/* =========================================================
   SCORING
========================================================= */

export function scoreTextMatch(textValue = "", queryValue = "") {
  const field = normalizeLooseText(textValue);
  const query = normalizeLooseText(queryValue);

  if (!field || !query) return 0;
  if (field === query) return 100;
  if (field.startsWith(query)) return 70;
  if (field.includes(query)) return 40;

  let score = 0;

  for (const token of tokenize(query)) {
    if (field.includes(token)) score += 10;
  }

  return score;
}

export function scoreResult(item = {}, query = "") {
  const q = normalizeQuery(query);

  if (!q) return normalizeResultType(item?.type) === "nav" ? 10 : 1;

  const titleScore = scoreTextMatch(item?.title, q) * 3;
  const subtitleScore = scoreTextMatch(item?.subtitle, q);
  const urlScore = scoreTextMatch(item?.url, q);
  const idScore = scoreTextMatch(item?.id || item?.entityId, q) * 2;

  return Math.max(0, Math.round(titleScore + subtitleScore + urlScore + idScore));
}

/* =========================================================
   HIGHLIGHT
========================================================= */

export function highlight(AppCore, value = "", query = "") {
  const source = String(value ?? "");
  const needle = normalizeQuery(query);

  if (!source || !needle) return escapeHtml(AppCore, source);

  const haystack = normalizeText(source);
  const normalizedNeedle = normalizeText(needle);
  const index = haystack.indexOf(normalizedNeedle);

  if (index < 0) return escapeHtml(AppCore, source);

  const end = index + normalizedNeedle.length;

  return [
    escapeHtml(AppCore, source.slice(0, index)),
    "<mark>",
    escapeHtml(AppCore, source.slice(index, end)),
    "</mark>",
    escapeHtml(AppCore, source.slice(end)),
  ].join("");
}

/* =========================================================
   GROUPING
========================================================= */

export function groupResults(results = []) {
  const groups = new Map();

  for (const item of safeArray(results)) {
    const type = normalizeResultType(item?.type);

    if (!groups.has(type)) groups.set(type, []);

    groups.get(type).push({
      ...item,
      type,
    });
  }

  return [...groups.entries()]
    .sort(([left], [right]) => getTypeGroupOrder(left) - getTypeGroupOrder(right))
    .map(([type, items]) => [
      type,
      items.sort((a, b) => {
        const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0);
        if (scoreDiff) return scoreDiff;

        return String(a?.title || "").localeCompare(String(b?.title || ""), "es", {
          sensitivity: "base",
        });
      }),
    ]);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOPBAR_HELPERS_VERSION,
  TOPBAR_SCOPE,
  TOPBAR_SEARCH_SCOPE,
  TOPBAR_SEARCH_CONFIG,
  TOPBAR_RESULT_TYPES,

  safeText,
  safeArray,
  safeObject,
  first,
  escapeHtml,

  normalizeText,
  normalizeLooseText,
  normalizeCompactText,
  normalizeQuery,
  tokenize,
  uniqBy,

  normalizeResultType,
  isResultType,
  getTypeLabel,
  getTypeIcon,
  getTypeGroupOrder,

  isExternalHref,
  isUnsafeHref,
  isHashRouterPath,
  normalizeHashRouterPath,
  isHashOnlyHref,
  safeNormalizePath,
  safeNormalizeCanonicalPath,
  getCurrentPublicPath,
  isMobileViewport,

  scoreTextMatch,
  scoreResult,

  highlight,
  groupResults,
};

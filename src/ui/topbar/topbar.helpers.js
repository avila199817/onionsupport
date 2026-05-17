/* =========================================================
   Onion SPA - Topbar Helpers
   Archivo: src/ui/topbar/topbar.helpers.js

   TOPBAR HELPERS · SIMPLE
   - constantes base del topbar
   - helpers de texto/html
   - normalización segura de rutas
   - tipos/labels/icons de búsqueda
   - scoring simple y estable
   - highlight seguro
   - agrupación de resultados
   - cero DOM mutation, cero overlays
========================================================= */

export const TOPBAR_HELPERS_VERSION = "topbar-helpers-v16-simple";

export const TOPBAR_SCOPE = "ui:topbar";
export const TOPBAR_SEARCH_SCOPE = "ui:topbar:search";

export const TOPBAR_SEARCH_CONFIG = Object.freeze({
  debounceMs: 220,
  minQueryLength: 1,
  maxQueryLength: 120,
  maxResultsTotal: 24,
  maxResultsPerGroup: 6,
  cacheTtlMs: 20_000,
  timeoutMs: 12_000,
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

const TYPE_ALIASES = Object.freeze({
  incidencia: TOPBAR_RESULT_TYPES.INCIDENCIA,
  incidencias: TOPBAR_RESULT_TYPES.INCIDENCIA,
  ticket: TOPBAR_RESULT_TYPES.INCIDENCIA,
  tickets: TOPBAR_RESULT_TYPES.INCIDENCIA,
  issue: TOPBAR_RESULT_TYPES.INCIDENCIA,
  issues: TOPBAR_RESULT_TYPES.INCIDENCIA,
  soporte: TOPBAR_RESULT_TYPES.INCIDENCIA,
  support: TOPBAR_RESULT_TYPES.INCIDENCIA,
  averia: TOPBAR_RESULT_TYPES.INCIDENCIA,
  averias: TOPBAR_RESULT_TYPES.INCIDENCIA,
  incidenciaid: TOPBAR_RESULT_TYPES.INCIDENCIA,
  ticketid: TOPBAR_RESULT_TYPES.INCIDENCIA,

  factura: TOPBAR_RESULT_TYPES.FACTURA,
  facturas: TOPBAR_RESULT_TYPES.FACTURA,
  invoice: TOPBAR_RESULT_TYPES.FACTURA,
  invoices: TOPBAR_RESULT_TYPES.FACTURA,
  bill: TOPBAR_RESULT_TYPES.FACTURA,
  bills: TOPBAR_RESULT_TYPES.FACTURA,
  billing: TOPBAR_RESULT_TYPES.FACTURA,
  recibo: TOPBAR_RESULT_TYPES.FACTURA,
  recibos: TOPBAR_RESULT_TYPES.FACTURA,
  facturaid: TOPBAR_RESULT_TYPES.FACTURA,
  invoiceid: TOPBAR_RESULT_TYPES.FACTURA,
  numerofactura: TOPBAR_RESULT_TYPES.FACTURA,

  cliente: TOPBAR_RESULT_TYPES.CLIENTE,
  clientes: TOPBAR_RESULT_TYPES.CLIENTE,
  client: TOPBAR_RESULT_TYPES.CLIENTE,
  clients: TOPBAR_RESULT_TYPES.CLIENTE,
  customer: TOPBAR_RESULT_TYPES.CLIENTE,
  customers: TOPBAR_RESULT_TYPES.CLIENTE,
  empresa: TOPBAR_RESULT_TYPES.CLIENTE,
  empresas: TOPBAR_RESULT_TYPES.CLIENTE,
  clienteid: TOPBAR_RESULT_TYPES.CLIENTE,
  clientid: TOPBAR_RESULT_TYPES.CLIENTE,

  user: TOPBAR_RESULT_TYPES.USUARIO,
  users: TOPBAR_RESULT_TYPES.USUARIO,
  usuario: TOPBAR_RESULT_TYPES.USUARIO,
  usuarios: TOPBAR_RESULT_TYPES.USUARIO,
  profile: TOPBAR_RESULT_TYPES.USUARIO,
  perfil: TOPBAR_RESULT_TYPES.USUARIO,
  account: TOPBAR_RESULT_TYPES.USUARIO,
  cuenta: TOPBAR_RESULT_TYPES.USUARIO,
  userid: TOPBAR_RESULT_TYPES.USUARIO,
  usuarioid: TOPBAR_RESULT_TYPES.USUARIO,

  nav: TOPBAR_RESULT_TYPES.NAV,
  route: TOPBAR_RESULT_TYPES.NAV,
  routes: TOPBAR_RESULT_TYPES.NAV,
  ruta: TOPBAR_RESULT_TYPES.NAV,
  rutas: TOPBAR_RESULT_TYPES.NAV,
  navigation: TOPBAR_RESULT_TYPES.NAV,
  navegacion: TOPBAR_RESULT_TYPES.NAV,
  pagina: TOPBAR_RESULT_TYPES.NAV,
  page: TOPBAR_RESULT_TYPES.NAV,
  vista: TOPBAR_RESULT_TYPES.NAV,
  view: TOPBAR_RESULT_TYPES.NAV,

  settings: TOPBAR_RESULT_TYPES.SETTINGS,
  setting: TOPBAR_RESULT_TYPES.SETTINGS,
  ajustes: TOPBAR_RESULT_TYPES.SETTINGS,
  ajuste: TOPBAR_RESULT_TYPES.SETTINGS,
  config: TOPBAR_RESULT_TYPES.SETTINGS,
  configuration: TOPBAR_RESULT_TYPES.SETTINGS,
  configuracion: TOPBAR_RESULT_TYPES.SETTINGS,
  preferencias: TOPBAR_RESULT_TYPES.SETTINGS,
  preferences: TOPBAR_RESULT_TYPES.SETTINGS,

  recent: TOPBAR_RESULT_TYPES.RECENT,
  recientes: TOPBAR_RESULT_TYPES.RECENT,
  recentes: TOPBAR_RESULT_TYPES.RECENT,
  recents: TOPBAR_RESULT_TYPES.RECENT,
  history: TOPBAR_RESULT_TYPES.RECENT,
  historial: TOPBAR_RESULT_TYPES.RECENT,

  general: TOPBAR_RESULT_TYPES.GENERAL,
  result: TOPBAR_RESULT_TYPES.GENERAL,
  results: TOPBAR_RESULT_TYPES.GENERAL,
  resultado: TOPBAR_RESULT_TYPES.GENERAL,
  resultados: TOPBAR_RESULT_TYPES.GENERAL,
});

const TYPE_LABELS = Object.freeze({
  [TOPBAR_RESULT_TYPES.INCIDENCIA]: "Incidencias",
  [TOPBAR_RESULT_TYPES.FACTURA]: "Facturas",
  [TOPBAR_RESULT_TYPES.CLIENTE]: "Clientes",
  [TOPBAR_RESULT_TYPES.USUARIO]: "Usuarios",
  [TOPBAR_RESULT_TYPES.NAV]: "Navegación",
  [TOPBAR_RESULT_TYPES.SETTINGS]: "Ajustes",
  [TOPBAR_RESULT_TYPES.RECENT]: "Recientes",
  [TOPBAR_RESULT_TYPES.GENERAL]: "Resultados",
});

const TYPE_ICONS = Object.freeze({
  [TOPBAR_RESULT_TYPES.INCIDENCIA]: "🎫",
  [TOPBAR_RESULT_TYPES.FACTURA]: "🧾",
  [TOPBAR_RESULT_TYPES.CLIENTE]: "🏢",
  [TOPBAR_RESULT_TYPES.USUARIO]: "👤",
  [TOPBAR_RESULT_TYPES.NAV]: "📂",
  [TOPBAR_RESULT_TYPES.SETTINGS]: "⚙️",
  [TOPBAR_RESULT_TYPES.RECENT]: "🕘",
  [TOPBAR_RESULT_TYPES.GENERAL]: "🔎",
});

const TYPE_GROUP_ORDER = Object.freeze([
  TOPBAR_RESULT_TYPES.INCIDENCIA,
  TOPBAR_RESULT_TYPES.FACTURA,
  TOPBAR_RESULT_TYPES.CLIENTE,
  TOPBAR_RESULT_TYPES.USUARIO,
  TOPBAR_RESULT_TYPES.NAV,
  TOPBAR_RESULT_TYPES.SETTINGS,
  TOPBAR_RESULT_TYPES.RECENT,
  TOPBAR_RESULT_TYPES.GENERAL,
]);

const TYPE_BOOST = Object.freeze({
  [TOPBAR_RESULT_TYPES.INCIDENCIA]: 14,
  [TOPBAR_RESULT_TYPES.FACTURA]: 13,
  [TOPBAR_RESULT_TYPES.CLIENTE]: 12,
  [TOPBAR_RESULT_TYPES.USUARIO]: 11,
  [TOPBAR_RESULT_TYPES.SETTINGS]: 7,
  [TOPBAR_RESULT_TYPES.NAV]: 5,
  [TOPBAR_RESULT_TYPES.RECENT]: 4,
  [TOPBAR_RESULT_TYPES.GENERAL]: 1,
});

const STOP_WORDS = new Set([
  "de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas",
  "y", "o", "a", "en", "por", "para", "con", "sin", "mi", "mis", "su", "sus", "al", "lo",
  "the", "of", "and", "or", "to", "in", "for",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
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
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

export function escapeHtml(AppCore, value = "") {
  try {
    if (typeof AppCore?.utils?.escapeHtml === "function") return AppCore.utils.escapeHtml(String(value ?? ""));
  } catch {}

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
    .replace(/[^\p{L}\p{N}@._\-/#:\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompactText(value = "") {
  return normalizeLooseText(value).replace(/[^\p{L}\p{N}@._\-/#:]/gu, "");
}

export function normalizeQuery(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPBAR_SEARCH_CONFIG.maxQueryLength);
}

export function tokenize(value = "", options = {}) {
  const includeStopWords = options.includeStopWords === true;

  return normalizeLooseText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => includeStopWords || !STOP_WORDS.has(token));
}

export function uniqBy(items = [], keyGetter) {
  const seen = new Set();
  const output = [];

  for (const item of safeArray(items)) {
    const key = typeof keyGetter === "function" ? safeText(keyGetter(item), "") : "";
    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

/* =========================================================
   TYPE HELPERS
========================================================= */

export function normalizeResultType(type = TOPBAR_RESULT_TYPES.GENERAL) {
  const raw = normalizeCompactText(type || TOPBAR_RESULT_TYPES.GENERAL);
  return TYPE_ALIASES[raw] || raw || TOPBAR_RESULT_TYPES.GENERAL;
}

export function isResultType(type = "", expected = "") {
  return normalizeResultType(type) === normalizeResultType(expected);
}

export function getTypeLabel(type = TOPBAR_RESULT_TYPES.GENERAL) {
  return TYPE_LABELS[normalizeResultType(type)] || TYPE_LABELS[TOPBAR_RESULT_TYPES.GENERAL];
}

export function getTypeIcon(type = TOPBAR_RESULT_TYPES.GENERAL) {
  return TYPE_ICONS[normalizeResultType(type)] || TYPE_ICONS[TOPBAR_RESULT_TYPES.GENERAL];
}

export function getTypeGroupOrder(type = TOPBAR_RESULT_TYPES.GENERAL) {
  const index = TYPE_GROUP_ORDER.indexOf(normalizeResultType(type));
  return index === -1 ? TYPE_GROUP_ORDER.length : index;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function hasAbsoluteScheme(value = "") {
  return /^[a-z][a-z0-9+.-]*:/i.test(safeText(value, ""));
}

export function isUnsafeHref(value = "") {
  const raw = safeText(value, "").toLowerCase();
  return raw.startsWith("javascript:") || raw.startsWith("data:") || raw.startsWith("vbscript:") || raw.startsWith("file:");
}

export function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

export function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  return raw.startsWith("#!") ? raw.replace(/^#!\/?/, "/") || "/" : raw.replace(/^#\/?/, "/") || "/";
}

export function isHashOnlyHref(value = "") {
  const raw = safeText(value, "");
  return Boolean(raw.startsWith("#") && !isHashRouterPath(raw));
}

export function isExternalHref(value = "") {
  const raw = safeText(value, "");
  if (!raw || isUnsafeHref(raw)) return false;

  if (raw.startsWith("//")) {
    try {
      return new URL(raw, getBaseOrigin()).origin !== getBaseOrigin();
    } catch {
      return true;
    }
  }

  if (!hasAbsoluteScheme(raw)) return false;

  try {
    const url = new URL(raw, getBaseOrigin());
    if (["http:", "https:"].includes(url.protocol)) return url.origin !== getBaseOrigin();
    return true;
  } catch {
    return true;
  }
}

function stripSearchAndHash(path = "/") {
  const raw = safeText(path, "/");
  const queryIndex = raw.indexOf("?");
  const hashIndex = raw.indexOf("#");
  let cutIndex = -1;

  if (queryIndex >= 0 && hashIndex >= 0) cutIndex = Math.min(queryIndex, hashIndex);
  else if (queryIndex >= 0) cutIndex = queryIndex;
  else if (hashIndex >= 0) cutIndex = hashIndex;

  return cutIndex >= 0 ? raw.slice(0, cutIndex) || "/" : raw || "/";
}

function stripUsernamePrefix(pathname = "/") {
  return safeText(pathname, "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value;
}

function normalizeSearch(search = "") {
  const raw = safeText(search, "");
  if (!raw) return "";
  return raw.startsWith("?") ? raw : `?${raw}`;
}

function normalizeHash(hash = "") {
  const raw = safeText(hash, "");
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

export function safeNormalizePath(AppCore, path = "/") {
  const raw = safeText(path, "/");

  if (!raw || isUnsafeHref(raw)) return "/";

  if (isHashRouterPath(raw)) return safeNormalizePath(AppCore, normalizeHashRouterPath(raw));
  if (isHashOnlyHref(raw)) return raw;

  try {
    if (
      typeof AppCore?.utils?.normalizePath === "function" &&
      !hasAbsoluteScheme(raw) &&
      !raw.startsWith("//") &&
      !raw.includes("#/")
    ) {
      return safeText(AppCore.utils.normalizePath(raw || "/"), "/");
    }
  } catch {}

  try {
    if (hasAbsoluteScheme(raw) || raw.startsWith("//")) {
      const url = new URL(raw, getBaseOrigin());

      if (["http:", "https:"].includes(url.protocol)) {
        if (url.origin !== getBaseOrigin()) return raw;
        if (url.hash && isHashRouterPath(url.hash)) return safeNormalizePath(AppCore, normalizeHashRouterPath(url.hash));
        return `${normalizePathname(url.pathname || "/")}${url.search || ""}${url.hash || ""}`;
      }

      return raw;
    }
  } catch {
    return "/";
  }

  try {
    const url = new URL(raw.startsWith("/") ? raw : `/${raw}`, getBaseOrigin());
    if (url.hash && isHashRouterPath(url.hash)) return safeNormalizePath(AppCore, normalizeHashRouterPath(url.hash));
    return `${normalizePathname(url.pathname || "/")}${url.search || ""}${url.hash || ""}`;
  } catch {}

  const [pathAndSearch = "/", hashPart = ""] = raw.split("#");
  const [pathnameRaw = "/", searchPart = ""] = pathAndSearch.split("?");

  return `${normalizePathname(pathnameRaw || "/")}${normalizeSearch(searchPart)}${normalizeHash(hashPart)}`;
}

export function safeNormalizeCanonicalPath(AppCore, path = "/") {
  const raw = safeText(path, "/");
  let normalized = "";

  try {
    if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") normalized = AppCore.utils.normalizeCanonicalPath(raw || "/");
  } catch {}

  if (!normalized) normalized = safeNormalizePath(AppCore, raw);

  return normalizePathname(stripUsernamePrefix(stripSearchAndHash(normalized)) || "/");
}

export function getCurrentPublicPath(AppCore) {
  if (!isBrowser()) return "/";

  try {
    const hash = window.location.hash || "";
    if (hash && isHashRouterPath(hash)) return safeNormalizePath(AppCore, normalizeHashRouterPath(hash));

    return safeNormalizePath(
      AppCore,
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

export function isMobileViewport(mobileBreakpoint = TOPBAR_SEARCH_CONFIG.mobileBreakpoint) {
  if (!isBrowser()) return false;

  try {
    return window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches;
  } catch {
    try {
      return window.innerWidth <= Number(mobileBreakpoint || TOPBAR_SEARCH_CONFIG.mobileBreakpoint);
    } catch {
      return false;
    }
  }
}

/* =========================================================
   SCORING
========================================================= */

function scoreToken(fieldToken = "", queryToken = "") {
  const field = normalizeLooseText(fieldToken);
  const query = normalizeLooseText(queryToken);

  if (!field || !query) return 0;
  if (field === query) return 120;
  if (field.startsWith(query)) return 80;
  if (field.includes(query)) return 42;
  if (query.startsWith(field) && field.length >= 3) return 30;

  return 0;
}

export function scoreTextMatch(text = "", query = "") {
  const field = normalizeLooseText(text);
  const q = normalizeLooseText(query);

  if (!field || !q) return 0;

  let score = 0;

  if (field === q) score += 260;
  if (field.startsWith(q)) score += 150;
  if (field.includes(` ${q}`)) score += 104;
  if (field.includes(q)) score += 86;

  const compactField = normalizeCompactText(field);
  const compactQuery = normalizeCompactText(q);

  if (compactField && compactQuery) {
    if (compactField === compactQuery) score += 190;
    if (compactField.startsWith(compactQuery)) score += 92;
    if (compactField.includes(compactQuery)) score += 48;
  }

  const fieldTokens = tokenize(field, { includeStopWords: true });
  const queryTokens = tokenize(q, { includeStopWords: true });

  for (const qToken of queryTokens) {
    let best = 0;
    for (const fieldToken of fieldTokens) best = Math.max(best, scoreToken(fieldToken, qToken));
    score += best;
  }

  return Math.round(score);
}

function searchableValues(item = {}) {
  const raw = safeObject(item.raw);

  return [
    item.id,
    item.entityId,
    item.type,
    item.title,
    item.subtitle,
    item.url,
    item.action,
    raw.id,
    raw._id,
    raw.uuid,
    raw.userId,
    raw.usuarioId,
    raw.username,
    raw.email,
    raw.displayName,
    raw.fullName,
    raw.nombreCompleto,
    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.nombre,
    raw.name,
    raw.nombreFiscal,
    raw.razonSocial,
    raw.ticketId,
    raw.incidenciaId,
    raw.subject,
    raw.asunto,
    raw.descripcion,
    raw.status,
    raw.estado,
    raw.facturaId,
    raw.invoiceId,
    raw.numero,
    raw.numeroFactura,
    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,
    raw.invoiceNumber,
    ...safeArray(item.keywords),
    ...safeArray(raw.keywords),
    ...safeArray(raw.tags),
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
}

function queryIntentTypes(query = "") {
  const q = normalizeLooseText(query);
  const types = new Set();

  tokenize(q, { includeStopWords: true }).forEach((token) => {
    const mapped = normalizeResultType(token);
    if (mapped !== TOPBAR_RESULT_TYPES.GENERAL && TYPE_LABELS[mapped]) types.add(mapped);
  });

  if (/@/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.USUARIO);
    types.add(TOPBAR_RESULT_TYPES.CLIENTE);
  }

  return [...types];
}

function typeBoost(item = {}, query = "") {
  const type = normalizeResultType(item.type);
  const intentTypes = queryIntentTypes(query);
  let boost = TYPE_BOOST[type] || TYPE_BOOST[TOPBAR_RESULT_TYPES.GENERAL];

  if (intentTypes.includes(type)) boost += 52;
  else if (intentTypes.length) boost -= type === TOPBAR_RESULT_TYPES.NAV ? 14 : 6;

  if (item.source === "api") boost += 10;
  if (item.source === "local" && type === TOPBAR_RESULT_TYPES.NAV) boost += 2;

  return boost;
}

function idBoost(item = {}, query = "") {
  const q = normalizeCompactText(query);
  if (!q) return 0;

  const raw = safeObject(item.raw);
  const id = normalizeCompactText(
    first(
      item.entityId,
      raw.entityId,
      raw.id,
      raw._id,
      raw.userId,
      raw.usuarioId,
      raw.clienteId,
      raw.clientId,
      raw.ticketId,
      raw.incidenciaId,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numeroFactura,
      raw.invoiceNumber
    ) || ""
  );

  if (!id) return 0;
  if (id === q) return 240;
  if (id.startsWith(q)) return 120;
  if (id.includes(q)) return 68;

  return 0;
}

export function scoreResult(item, query = "") {
  const q = normalizeQuery(query);
  const type = normalizeResultType(item?.type);

  if (!q) return type === TOPBAR_RESULT_TYPES.NAV ? 10 : 1;

  let score = 0;
  score += scoreTextMatch(item?.title, q) * 3.2;
  score += scoreTextMatch(item?.subtitle, q) * 1.45;
  score += scoreTextMatch(item?.url, q) * 0.7;
  score += scoreTextMatch(item?.entityId, q) * 2.6;

  for (const value of searchableValues(item)) score += scoreTextMatch(value, q) * 0.22;

  score += typeBoost(item, q);
  score += idBoost(item, q);

  return Math.round(Math.max(0, score));
}

/* =========================================================
   HIGHLIGHT
========================================================= */

function normalizedIndexMap(value = "") {
  const source = String(value ?? "");
  let normalized = "";
  const map = [];

  for (let i = 0; i < source.length; i += 1) {
    const normalizedChar = source[i]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    for (let j = 0; j < normalizedChar.length; j += 1) {
      normalized += normalizedChar[j];
      map.push(i);
    }
  }

  return { normalized, map };
}

function findRanges(source = "", query = "") {
  const needle = normalizeText(query);
  if (!needle) return [];

  const { normalized, map } = normalizedIndexMap(source);
  const ranges = [];
  let startAt = 0;

  while (startAt < normalized.length) {
    const foundAt = normalized.indexOf(needle, startAt);
    if (foundAt < 0) break;

    const start = map[foundAt] ?? 0;
    const last = map[foundAt + needle.length - 1] ?? start;

    ranges.push([start, last + 1]);
    startAt = foundAt + Math.max(1, needle.length);
  }

  return ranges;
}

function mergeRanges(ranges = []) {
  const sorted = safeArray(ranges)
    .filter((range) => Array.isArray(range) && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0])
    .sort((a, b) => a[0] - b[0]);

  const output = [];

  for (const range of sorted) {
    const last = output[output.length - 1];

    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
      continue;
    }

    output.push([...range]);
  }

  return output;
}

export function highlight(AppCore, text = "", query = "") {
  const source = String(text ?? "");
  const needle = normalizeQuery(query);

  if (!source || !needle) return escapeHtml(AppCore, source);

  let ranges = findRanges(source, needle);

  if (!ranges.length) {
    for (const token of tokenize(needle).filter((item) => item.length >= 2)) {
      ranges = ranges.concat(findRanges(source, token));
    }
  }

  const merged = mergeRanges(ranges);
  if (!merged.length) return escapeHtml(AppCore, source);

  let output = "";
  let cursor = 0;

  for (const [start, end] of merged) {
    output += escapeHtml(AppCore, source.slice(cursor, start));
    output += `<mark>${escapeHtml(AppCore, source.slice(start, end))}</mark>`;
    cursor = end;
  }

  output += escapeHtml(AppCore, source.slice(cursor));
  return output;
}

/* =========================================================
   GROUPING
========================================================= */

export function groupResults(results = []) {
  const groups = new Map();

  safeArray(results).forEach((item) => {
    const type = normalizeResultType(item?.type || TOPBAR_RESULT_TYPES.GENERAL);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push({ ...item, type });
  });

  return [...groups.entries()]
    .sort(([typeA], [typeB]) => {
      const orderA = getTypeGroupOrder(typeA);
      const orderB = getTypeGroupOrder(typeB);
      if (orderA !== orderB) return orderA - orderB;
      return String(typeA).localeCompare(String(typeB), "es", { sensitivity: "base" });
    })
    .map(([type, items]) => [
      type,
      [...items].sort((a, b) => {
        const scoreA = Number(a?.score || 0);
        const scoreB = Number(b?.score || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(a?.title || "").localeCompare(String(b?.title || ""), "es", { sensitivity: "base" });
      }),
    ]);
}

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

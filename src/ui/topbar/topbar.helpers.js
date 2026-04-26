/* =========================================================
   Onion SPA - Topbar Helpers
   Archivo: src/ui/topbar/topbar.helpers.js

   EXTREME MODE · FULL PRO SAAS PANEL

   Responsabilidades:
   - constantes base del topbar
   - helpers de texto y escape
   - normalización robusta de paths
   - normalización de tipos de búsqueda
   - helpers de búsqueda, tokens y scoring
   - highlight seguro tolerante a acentos
   - agrupación profesional de resultados
   - utilidades puras de resultados
========================================================= */

/* =========================================================
   SCOPES
========================================================= */

export const TOPBAR_SCOPE = "ui:topbar";
export const TOPBAR_SEARCH_SCOPE = "ui:topbar:search";

/* =========================================================
   SEARCH CONFIG
========================================================= */

export const TOPBAR_SEARCH_CONFIG = Object.freeze({
  debounceMs: 220,
  minQueryLength: 1,
  maxQueryLength: 120,
  maxResultsTotal: 24,
  maxResultsPerGroup: 6,
  cacheTtlMs: 20 * 1000,
  mobileBreakpoint: 900,
});

/* =========================================================
   TYPE SYSTEM
========================================================= */

export const TOPBAR_RESULT_TYPES = Object.freeze({
  INCIDENCIA: "incidencia",
  FACTURA: "factura",
  CLIENTE: "cliente",
  USUARIO: "user",
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
  averia: TOPBAR_RESULT_TYPES.INCIDENCIA,
  averias: TOPBAR_RESULT_TYPES.INCIDENCIA,

  factura: TOPBAR_RESULT_TYPES.FACTURA,
  facturas: TOPBAR_RESULT_TYPES.FACTURA,
  invoice: TOPBAR_RESULT_TYPES.FACTURA,
  invoices: TOPBAR_RESULT_TYPES.FACTURA,
  bill: TOPBAR_RESULT_TYPES.FACTURA,
  billing: TOPBAR_RESULT_TYPES.FACTURA,
  recibo: TOPBAR_RESULT_TYPES.FACTURA,
  recibos: TOPBAR_RESULT_TYPES.FACTURA,

  cliente: TOPBAR_RESULT_TYPES.CLIENTE,
  clientes: TOPBAR_RESULT_TYPES.CLIENTE,
  client: TOPBAR_RESULT_TYPES.CLIENTE,
  clients: TOPBAR_RESULT_TYPES.CLIENTE,
  customer: TOPBAR_RESULT_TYPES.CLIENTE,
  customers: TOPBAR_RESULT_TYPES.CLIENTE,
  empresa: TOPBAR_RESULT_TYPES.CLIENTE,
  empresas: TOPBAR_RESULT_TYPES.CLIENTE,

  user: TOPBAR_RESULT_TYPES.USUARIO,
  users: TOPBAR_RESULT_TYPES.USUARIO,
  usuario: TOPBAR_RESULT_TYPES.USUARIO,
  usuarios: TOPBAR_RESULT_TYPES.USUARIO,
  profile: TOPBAR_RESULT_TYPES.USUARIO,
  perfil: TOPBAR_RESULT_TYPES.USUARIO,
  account: TOPBAR_RESULT_TYPES.USUARIO,
  cuenta: TOPBAR_RESULT_TYPES.USUARIO,

  nav: TOPBAR_RESULT_TYPES.NAV,
  route: TOPBAR_RESULT_TYPES.NAV,
  routes: TOPBAR_RESULT_TYPES.NAV,
  ruta: TOPBAR_RESULT_TYPES.NAV,
  rutas: TOPBAR_RESULT_TYPES.NAV,
  navegacion: TOPBAR_RESULT_TYPES.NAV,
  navigation: TOPBAR_RESULT_TYPES.NAV,

  settings: TOPBAR_RESULT_TYPES.SETTINGS,
  setting: TOPBAR_RESULT_TYPES.SETTINGS,
  ajustes: TOPBAR_RESULT_TYPES.SETTINGS,
  ajuste: TOPBAR_RESULT_TYPES.SETTINGS,
  config: TOPBAR_RESULT_TYPES.SETTINGS,
  configuracion: TOPBAR_RESULT_TYPES.SETTINGS,
  preferencias: TOPBAR_RESULT_TYPES.SETTINGS,
  preference: TOPBAR_RESULT_TYPES.SETTINGS,
  preferences: TOPBAR_RESULT_TYPES.SETTINGS,

  recent: TOPBAR_RESULT_TYPES.RECENT,
  recientes: TOPBAR_RESULT_TYPES.RECENT,
  recents: TOPBAR_RESULT_TYPES.RECENT,

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

const TYPE_BASE_BOOST = Object.freeze({
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
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "a",
  "en",
  "por",
  "para",
  "con",
  "sin",
  "mi",
  "mis",
  "su",
  "sus",
  "the",
  "of",
  "and",
  "or",
  "to",
  "in",
  "for",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

export function escapeHtml(AppCore, value = "") {
  if (AppCore?.utils?.escapeHtml) {
    try {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    } catch {
      /* fallback below */
    }
  }

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
    .replace(/[^\p{L}\p{N}@._\-/#\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompactText(value = "") {
  return normalizeLooseText(value).replace(/[^a-z0-9@._\-/#]/gi, "");
}

export function normalizeQuery(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPBAR_SEARCH_CONFIG.maxQueryLength);
}

export function tokenize(value = "", options = {}) {
  const includeStopWords = Boolean(options.includeStopWords);

  return normalizeLooseText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => includeStopWords || !STOP_WORDS.has(token));
}

export function uniqBy(items = [], keyGetter) {
  const seen = new Set();
  const result = [];

  for (const item of safeArray(items)) {
    const key =
      typeof keyGetter === "function"
        ? safeText(keyGetter(item), "")
        : "";

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

/* =========================================================
   TYPE HELPERS
========================================================= */

export function normalizeResultType(type = "general") {
  const raw = normalizeCompactText(type || "general");
  return TYPE_ALIASES[raw] || raw || TOPBAR_RESULT_TYPES.GENERAL;
}

export function isResultType(type = "", expected = "") {
  return normalizeResultType(type) === normalizeResultType(expected);
}

export function getTypeLabel(type = "general") {
  const normalized = normalizeResultType(type);
  return TYPE_LABELS[normalized] || TYPE_LABELS[TOPBAR_RESULT_TYPES.GENERAL];
}

export function getTypeIcon(type = "general") {
  const normalized = normalizeResultType(type);
  return TYPE_ICONS[normalized] || TYPE_ICONS[TOPBAR_RESULT_TYPES.GENERAL];
}

export function getTypeGroupOrder(type = "general") {
  const normalized = normalizeResultType(type);
  const index = TYPE_GROUP_ORDER.indexOf(normalized);

  return index === -1 ? TYPE_GROUP_ORDER.length : index;
}

/* =========================================================
   PATH HELPERS
========================================================= */

export function isExternalHref(value = "") {
  const raw = safeText(value, "");

  if (!raw) return false;

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
}

export function isUnsafeHref(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return (
    raw.startsWith("javascript:") ||
    raw.startsWith("data:") ||
    raw.startsWith("vbscript:")
  );
}

export function isHashOnlyHref(value = "") {
  return safeText(value, "").startsWith("#");
}

export function safeNormalizePath(AppCore, path = "/") {
  const raw = safeText(path, "/");

  if (!raw || isUnsafeHref(raw)) {
    return "/";
  }

  if (isHashOnlyHref(raw)) {
    return raw;
  }

  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      const normalized = AppCore.utils.normalizePath(raw || "/");
      return safeText(normalized, "/");
    }
  } catch {
    /* fallback below */
  }

  try {
    /*
      Si llega URL absoluta del mismo origen, se convierte a path SPA.
      Si es externa, se mantiene como URL externa para fallback clásico.
    */
    if (isExternalHref(raw)) {
      const url = new URL(raw, window.location.origin);

      if (url.origin === window.location.origin) {
        return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
      }

      return raw;
    }
  } catch {
    return "/";
  }

  const [pathAndSearch = "/", hashPart = ""] = raw.split("#");
  const [pathnameRaw = "/", searchPart = ""] = pathAndSearch.split("?");

  let pathname = safeText(pathnameRaw, "/");

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replace(/\/{2,}/g, "/");

  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, "");
  }

  const search = searchPart ? `?${searchPart}` : "";
  const hash = hashPart ? `#${hashPart}` : "";

  return `${pathname || "/"}${search}${hash}`;
}

export function safeNormalizeCanonicalPath(AppCore, path = "/") {
  try {
    if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") {
      return AppCore.utils.normalizeCanonicalPath(path || "/");
    }

    return safeNormalizePath(AppCore, path);
  } catch {
    return "/";
  }
}

export function getCurrentPublicPath(AppCore) {
  try {
    return safeNormalizePath(
      AppCore,
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

export function isMobileViewport(
  mobileBreakpoint = TOPBAR_SEARCH_CONFIG.mobileBreakpoint
) {
  try {
    return window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches;
  } catch {
    return false;
  }
}

/* =========================================================
   SCORING
========================================================= */

function boundedLevenshtein(a = "", b = "", maxDistance = 2) {
  const x = normalizeCompactText(a);
  const y = normalizeCompactText(b);

  if (!x && !y) return 0;
  if (!x || !y) return maxDistance + 1;
  if (x === y) return 0;

  const diff = Math.abs(x.length - y.length);

  if (diff > maxDistance) {
    return maxDistance + 1;
  }

  const previous = new Array(y.length + 1);
  const current = new Array(y.length + 1);

  for (let j = 0; j <= y.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= x.length; i += 1) {
    current[0] = i;

    let rowMin = current[0];

    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;

      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );

      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= y.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[y.length];
}

function scoreTokenMatch(fieldToken = "", queryToken = "") {
  const field = normalizeLooseText(fieldToken);
  const query = normalizeLooseText(queryToken);

  if (!field || !query) return 0;

  if (field === query) return 120;
  if (field.startsWith(query)) return 82;
  if (query.startsWith(field) && field.length >= 3) return 54;
  if (field.includes(query)) return 42;

  if (field.length >= 3 && query.length >= 3) {
    const distance = boundedLevenshtein(field, query, 2);

    if (distance === 1) return 24;
    if (distance === 2) return 10;
  }

  return 0;
}

export function scoreTextMatch(text = "", query = "") {
  const t = normalizeLooseText(text);
  const q = normalizeLooseText(query);

  if (!t || !q) return 0;

  let score = 0;

  if (t === q) score += 260;
  if (t.startsWith(q)) score += 150;
  if (t.includes(` ${q}`)) score += 104;
  if (t.includes(q)) score += 86;

  const compactText = normalizeCompactText(t);
  const compactQuery = normalizeCompactText(q);

  if (compactText && compactQuery) {
    if (compactText === compactQuery) score += 190;
    if (compactText.startsWith(compactQuery)) score += 92;
    if (compactText.includes(compactQuery)) score += 48;
  }

  const textTokens = tokenize(t, { includeStopWords: true });
  const queryTokens = tokenize(q, { includeStopWords: true });

  for (const qToken of queryTokens) {
    let bestTokenScore = 0;

    for (const tToken of textTokens) {
      bestTokenScore = Math.max(bestTokenScore, scoreTokenMatch(tToken, qToken));
    }

    score += bestTokenScore;
  }

  return Math.round(score);
}

function extractSearchableValues(item = {}) {
  const raw = safeObject(item.raw);

  return [
    item.id,
    item.entityId,
    item.type,
    item.title,
    item.subtitle,
    item.url,
    item.action,
    item.openAction,
    item.searchAction,

    raw.id,
    raw._id,
    raw.uuid,
    raw.entityId,

    raw.userId,
    raw.usuarioId,
    raw.username,
    raw.email,
    raw.role,
    raw.rol,

    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.nombre,
    raw.name,
    raw.nombreFiscal,
    raw.razonSocial,
    raw.nombreComercial,
    raw.nif,
    raw.cif,

    raw.ticketId,
    raw.incidenciaId,
    raw.issueId,
    raw.subject,
    raw.asunto,
    raw.descripcion,
    raw.description,
    raw.status,
    raw.estado,
    raw.priority,
    raw.prioridad,

    raw.facturaId,
    raw.invoiceId,
    raw.numero,
    raw.numeroFactura,
    raw.numeroFacturaLegal,
    raw.invoiceCode,
    raw.total,
    raw.amount,

    ...safeArray(item.keywords),
    ...safeArray(raw.keywords),
  ].filter((value) => value !== null && value !== undefined && value !== "");
}

function getQueryIntentTypes(query = "") {
  const q = normalizeLooseText(query);
  const tokens = tokenize(q, { includeStopWords: true });
  const types = new Set();

  for (const token of tokens) {
    const mapped = normalizeResultType(token);

    if (
      [
        TOPBAR_RESULT_TYPES.INCIDENCIA,
        TOPBAR_RESULT_TYPES.FACTURA,
        TOPBAR_RESULT_TYPES.CLIENTE,
        TOPBAR_RESULT_TYPES.USUARIO,
        TOPBAR_RESULT_TYPES.NAV,
        TOPBAR_RESULT_TYPES.SETTINGS,
      ].includes(mapped)
    ) {
      types.add(mapped);
    }
  }

  if (/@/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.USUARIO);
    types.add(TOPBAR_RESULT_TYPES.CLIENTE);
  }

  if (/\b(ticket|incidencia|soporte|averia|averias)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.INCIDENCIA);
  }

  if (/\b(factura|facturas|invoice|billing|recibo)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.FACTURA);
  }

  if (/\b(cliente|clientes|empresa|empresas)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.CLIENTE);
  }

  if (/\b(usuario|usuarios|user|users|perfil|cuenta)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.USUARIO);
  }

  if (/\b(ajustes|settings|configuracion|preferencias)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.SETTINGS);
  }

  return [...types];
}

function getTypeBoost(item = {}, query = "") {
  const type = normalizeResultType(item.type);
  const intentTypes = getQueryIntentTypes(query);

  let boost = TYPE_BASE_BOOST[type] || TYPE_BASE_BOOST[TOPBAR_RESULT_TYPES.GENERAL];

  if (intentTypes.includes(type)) {
    boost += 52;
  }

  if (intentTypes.length && !intentTypes.includes(type)) {
    boost -= type === TOPBAR_RESULT_TYPES.NAV ? 14 : 6;
  }

  if (item.source === "api") {
    boost += 10;
  }

  if (item.source === "local" && type === TOPBAR_RESULT_TYPES.NAV) {
    boost += 2;
  }

  return boost;
}

function getHeuristicBoost(item = {}, query = "") {
  const type = normalizeResultType(item.type);
  const q = normalizeLooseText(query);
  const compactQuery = normalizeCompactText(q);

  if (!q || !compactQuery) return 0;

  const raw = safeObject(item.raw);
  const entityId = normalizeCompactText(
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
      raw.invoiceId
    ) || ""
  );

  let boost = 0;

  if (entityId) {
    if (entityId === compactQuery) boost += 240;
    if (entityId.startsWith(compactQuery)) boost += 120;
    if (entityId.includes(compactQuery)) boost += 68;
  }

  if (/@/.test(q) && [TOPBAR_RESULT_TYPES.USUARIO, TOPBAR_RESULT_TYPES.CLIENTE].includes(type)) {
    boost += 42;
  }

  if (/^\d+$/.test(compactQuery) && type === TOPBAR_RESULT_TYPES.FACTURA) {
    boost += 42;
  }

  if (/^\d+$/.test(compactQuery) && type === TOPBAR_RESULT_TYPES.INCIDENCIA) {
    boost += 34;
  }

  if (
    type === TOPBAR_RESULT_TYPES.NAV &&
    q.length <= 2 &&
    !scoreTextMatch(item.title, q)
  ) {
    boost -= 25;
  }

  return boost;
}

export function scoreResult(item, query = "") {
  const q = normalizeQuery(query);

  if (!q) {
    return normalizeResultType(item?.type) === TOPBAR_RESULT_TYPES.NAV ? 10 : 1;
  }

  const type = normalizeResultType(item?.type);
  const values = extractSearchableValues(item);

  const titleScore = scoreTextMatch(item?.title, q) * 3.2;
  const subtitleScore = scoreTextMatch(item?.subtitle, q) * 1.45;
  const urlScore = scoreTextMatch(item?.url, q) * 0.7;
  const entityScore = scoreTextMatch(item?.entityId, q) * 2.6;

  let keywordScore = 0;

  for (const value of values) {
    keywordScore += scoreTextMatch(value, q) * 0.24;
  }

  /*
    Penalización ligera para navegación cuando hay entidad real con match fuerte.
    Evita que "factura 123" saque antes "/facturas" que la factura real.
  */
  let navPenalty = 0;

  if (
    type === TOPBAR_RESULT_TYPES.NAV &&
    getQueryIntentTypes(q).some((intent) =>
      [
        TOPBAR_RESULT_TYPES.INCIDENCIA,
        TOPBAR_RESULT_TYPES.FACTURA,
        TOPBAR_RESULT_TYPES.CLIENTE,
        TOPBAR_RESULT_TYPES.USUARIO,
      ].includes(intent)
    )
  ) {
    navPenalty = 26;
  }

  const finalScore =
    titleScore +
    subtitleScore +
    urlScore +
    entityScore +
    keywordScore +
    getTypeBoost(item, q) +
    getHeuristicBoost(item, q) -
    navPenalty;

  return Math.round(Math.max(0, finalScore));
}

/* =========================================================
   HIGHLIGHT
========================================================= */

function buildNormalizedIndexMap(value = "") {
  const source = String(value ?? "");
  let normalized = "";
  const map = [];

  for (let i = 0; i < source.length; i += 1) {
    const originalChar = source[i];
    const normalizedChar = originalChar
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    for (let j = 0; j < normalizedChar.length; j += 1) {
      normalized += normalizedChar[j];
      map.push(i);
    }
  }

  return {
    normalized,
    map,
  };
}

export function highlight(AppCore, text = "", query = "") {
  const source = String(text ?? "");
  const needle = normalizeQuery(query);

  if (!source || !needle) {
    return escapeHtml(AppCore, source);
  }

  const { normalized, map } = buildNormalizedIndexMap(source);
  const normalizedNeedle = normalizeText(needle);

  if (!normalizedNeedle) {
    return escapeHtml(AppCore, source);
  }

  const foundAt = normalized.indexOf(normalizedNeedle);

  if (foundAt === -1) {
    return escapeHtml(AppCore, source);
  }

  const originalStart = map[foundAt] ?? 0;
  const originalLast =
    map[foundAt + normalizedNeedle.length - 1] ?? originalStart;

  const originalEnd = originalLast + 1;

  const start = source.slice(0, originalStart);
  const middle = source.slice(originalStart, originalEnd);
  const end = source.slice(originalEnd);

  return `${escapeHtml(AppCore, start)}<mark>${escapeHtml(
    AppCore,
    middle
  )}</mark>${escapeHtml(AppCore, end)}`;
}

/* =========================================================
   GROUP RESULTS
========================================================= */

export function groupResults(results = []) {
  const groups = new Map();

  safeArray(results).forEach((item) => {
    const key = normalizeResultType(item?.type || TOPBAR_RESULT_TYPES.GENERAL);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({
      ...item,
      type: key,
    });
  });

  return Array.from(groups.entries())
    .sort(([typeA], [typeB]) => {
      const orderA = getTypeGroupOrder(typeA);
      const orderB = getTypeGroupOrder(typeB);

      if (orderA !== orderB) return orderA - orderB;

      return String(typeA).localeCompare(String(typeB), "es", {
        sensitivity: "base",
      });
    })
    .map(([type, items]) => [
      type,
      [...items].sort((a, b) => {
        const scoreA = Number(a?.score || 0);
        const scoreB = Number(b?.score || 0);

        if (scoreB !== scoreA) return scoreB - scoreA;

        return String(a?.title || "").localeCompare(String(b?.title || ""), "es", {
          sensitivity: "base",
        });
      }),
    ]);
}

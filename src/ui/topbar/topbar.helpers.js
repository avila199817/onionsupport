/* =========================================================
   Onion SPA - Topbar Helpers
   Archivo: src/ui/topbar/topbar.helpers.js

   FINAL PRO SYSTEM · TOPBAR HELPERS · PATH SAFE · SEARCH SAFE · 10/10
   TOKEN PRO SYSTEM ALIGNED · COMMAND PALETTE READY

   Responsabilidades:
   - constantes base del topbar
   - helpers de texto y escape
   - normalización robusta de paths
   - soporte hash-router /#/ruta y #!/ruta
   - soporte rutas públicas con /@usuario
   - normalización de tipos de búsqueda
   - helpers de búsqueda, tokens y scoring
   - highlight seguro tolerante a acentos
   - agrupación profesional de resultados
   - utilidades puras de resultados

   REGLAS:
   - Sin CSS inline.
   - Sin DOM mutation.
   - Sin overlays.
   - Sin side effects visuales.
   - Sólo funciones puras/utilitarias.

   FIXES:
   - isHashOnlyHref no confunde #/ruta con ancla
   - getCurrentPublicPath soporta hash-router
   - safeNormalizeCanonicalPath elimina query/hash y prefijo /@usuario
   - safeNormalizePath no rompe URLs absolutas del mismo origen
   - normalizeResultType tolera aliases backend heterogéneos
   - highlight marca múltiples apariciones de forma segura
   - scoring favorece ids exactos, entidades reales y coincidencias por intención
========================================================= */

/* =========================================================
   SCOPES
========================================================= */

export const TOPBAR_SCOPE =
  "ui:topbar";

export const TOPBAR_SEARCH_SCOPE =
  "ui:topbar:search";

/* =========================================================
   SEARCH CONFIG
========================================================= */

export const TOPBAR_SEARCH_CONFIG = Object.freeze({
  debounceMs:
    220,

  minQueryLength:
    1,

  maxQueryLength:
    120,

  maxResultsTotal:
    24,

  maxResultsPerGroup:
    6,

  cacheTtlMs:
    20 * 1000,

  timeoutMs:
    12000,

  mobileBreakpoint:
    900,
});

/* =========================================================
   TYPE SYSTEM
========================================================= */

export const TOPBAR_RESULT_TYPES = Object.freeze({
  INCIDENCIA:
    "incidencia",

  FACTURA:
    "factura",

  CLIENTE:
    "cliente",

  USUARIO:
    "usuario",

  NAV:
    "nav",

  SETTINGS:
    "settings",

  RECENT:
    "recent",

  GENERAL:
    "general",
});

const TYPE_ALIASES = Object.freeze({
  incidencia:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  incidencias:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  ticket:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  tickets:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  issue:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  issues:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  soporte:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  support:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  averia:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  averias:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  incidenciaid:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  ticketid:
    TOPBAR_RESULT_TYPES.INCIDENCIA,
  issueid:
    TOPBAR_RESULT_TYPES.INCIDENCIA,

  factura:
    TOPBAR_RESULT_TYPES.FACTURA,
  facturas:
    TOPBAR_RESULT_TYPES.FACTURA,
  invoice:
    TOPBAR_RESULT_TYPES.FACTURA,
  invoices:
    TOPBAR_RESULT_TYPES.FACTURA,
  bill:
    TOPBAR_RESULT_TYPES.FACTURA,
  bills:
    TOPBAR_RESULT_TYPES.FACTURA,
  billing:
    TOPBAR_RESULT_TYPES.FACTURA,
  recibo:
    TOPBAR_RESULT_TYPES.FACTURA,
  recibos:
    TOPBAR_RESULT_TYPES.FACTURA,
  facturaid:
    TOPBAR_RESULT_TYPES.FACTURA,
  invoiceid:
    TOPBAR_RESULT_TYPES.FACTURA,
  numeroFactura:
    TOPBAR_RESULT_TYPES.FACTURA,
  numerofactura:
    TOPBAR_RESULT_TYPES.FACTURA,

  cliente:
    TOPBAR_RESULT_TYPES.CLIENTE,
  clientes:
    TOPBAR_RESULT_TYPES.CLIENTE,
  client:
    TOPBAR_RESULT_TYPES.CLIENTE,
  clients:
    TOPBAR_RESULT_TYPES.CLIENTE,
  customer:
    TOPBAR_RESULT_TYPES.CLIENTE,
  customers:
    TOPBAR_RESULT_TYPES.CLIENTE,
  empresa:
    TOPBAR_RESULT_TYPES.CLIENTE,
  empresas:
    TOPBAR_RESULT_TYPES.CLIENTE,
  clienteid:
    TOPBAR_RESULT_TYPES.CLIENTE,
  clientid:
    TOPBAR_RESULT_TYPES.CLIENTE,
  customerid:
    TOPBAR_RESULT_TYPES.CLIENTE,

  user:
    TOPBAR_RESULT_TYPES.USUARIO,
  users:
    TOPBAR_RESULT_TYPES.USUARIO,
  usuario:
    TOPBAR_RESULT_TYPES.USUARIO,
  usuarios:
    TOPBAR_RESULT_TYPES.USUARIO,
  profile:
    TOPBAR_RESULT_TYPES.USUARIO,
  perfil:
    TOPBAR_RESULT_TYPES.USUARIO,
  account:
    TOPBAR_RESULT_TYPES.USUARIO,
  cuenta:
    TOPBAR_RESULT_TYPES.USUARIO,
  userid:
    TOPBAR_RESULT_TYPES.USUARIO,
  usuarioid:
    TOPBAR_RESULT_TYPES.USUARIO,

  nav:
    TOPBAR_RESULT_TYPES.NAV,
  route:
    TOPBAR_RESULT_TYPES.NAV,
  routes:
    TOPBAR_RESULT_TYPES.NAV,
  ruta:
    TOPBAR_RESULT_TYPES.NAV,
  rutas:
    TOPBAR_RESULT_TYPES.NAV,
  navegacion:
    TOPBAR_RESULT_TYPES.NAV,
  navigation:
    TOPBAR_RESULT_TYPES.NAV,
  page:
    TOPBAR_RESULT_TYPES.NAV,
  pagina:
    TOPBAR_RESULT_TYPES.NAV,
  paginas:
    TOPBAR_RESULT_TYPES.NAV,
  view:
    TOPBAR_RESULT_TYPES.NAV,
  vista:
    TOPBAR_RESULT_TYPES.NAV,
  vistas:
    TOPBAR_RESULT_TYPES.NAV,

  settings:
    TOPBAR_RESULT_TYPES.SETTINGS,
  setting:
    TOPBAR_RESULT_TYPES.SETTINGS,
  ajustes:
    TOPBAR_RESULT_TYPES.SETTINGS,
  ajuste:
    TOPBAR_RESULT_TYPES.SETTINGS,
  config:
    TOPBAR_RESULT_TYPES.SETTINGS,
  configuration:
    TOPBAR_RESULT_TYPES.SETTINGS,
  configuracion:
    TOPBAR_RESULT_TYPES.SETTINGS,
  preferencias:
    TOPBAR_RESULT_TYPES.SETTINGS,
  preference:
    TOPBAR_RESULT_TYPES.SETTINGS,
  preferences:
    TOPBAR_RESULT_TYPES.SETTINGS,

  recent:
    TOPBAR_RESULT_TYPES.RECENT,
  recientes:
    TOPBAR_RESULT_TYPES.RECENT,
  recentes:
    TOPBAR_RESULT_TYPES.RECENT,
  recents:
    TOPBAR_RESULT_TYPES.RECENT,
  history:
    TOPBAR_RESULT_TYPES.RECENT,
  historial:
    TOPBAR_RESULT_TYPES.RECENT,

  general:
    TOPBAR_RESULT_TYPES.GENERAL,
  result:
    TOPBAR_RESULT_TYPES.GENERAL,
  results:
    TOPBAR_RESULT_TYPES.GENERAL,
  resultado:
    TOPBAR_RESULT_TYPES.GENERAL,
  resultados:
    TOPBAR_RESULT_TYPES.GENERAL,
});

const TYPE_LABELS = Object.freeze({
  [TOPBAR_RESULT_TYPES.INCIDENCIA]:
    "Incidencias",

  [TOPBAR_RESULT_TYPES.FACTURA]:
    "Facturas",

  [TOPBAR_RESULT_TYPES.CLIENTE]:
    "Clientes",

  [TOPBAR_RESULT_TYPES.USUARIO]:
    "Usuarios",

  [TOPBAR_RESULT_TYPES.NAV]:
    "Navegación",

  [TOPBAR_RESULT_TYPES.SETTINGS]:
    "Ajustes",

  [TOPBAR_RESULT_TYPES.RECENT]:
    "Recientes",

  [TOPBAR_RESULT_TYPES.GENERAL]:
    "Resultados",
});

const TYPE_ICONS = Object.freeze({
  [TOPBAR_RESULT_TYPES.INCIDENCIA]:
    "🎫",

  [TOPBAR_RESULT_TYPES.FACTURA]:
    "🧾",

  [TOPBAR_RESULT_TYPES.CLIENTE]:
    "🏢",

  [TOPBAR_RESULT_TYPES.USUARIO]:
    "👤",

  [TOPBAR_RESULT_TYPES.NAV]:
    "📂",

  [TOPBAR_RESULT_TYPES.SETTINGS]:
    "⚙️",

  [TOPBAR_RESULT_TYPES.RECENT]:
    "🕘",

  [TOPBAR_RESULT_TYPES.GENERAL]:
    "🔎",
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
  [TOPBAR_RESULT_TYPES.INCIDENCIA]:
    14,

  [TOPBAR_RESULT_TYPES.FACTURA]:
    13,

  [TOPBAR_RESULT_TYPES.CLIENTE]:
    12,

  [TOPBAR_RESULT_TYPES.USUARIO]:
    11,

  [TOPBAR_RESULT_TYPES.SETTINGS]:
    7,

  [TOPBAR_RESULT_TYPES.NAV]:
    5,

  [TOPBAR_RESULT_TYPES.RECENT]:
    4,

  [TOPBAR_RESULT_TYPES.GENERAL]:
    1,
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
  "al",
  "lo",
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

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

export function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

export function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

export function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

export function escapeHtml(AppCore, value = "") {
  try {
    if (typeof AppCore?.utils?.escapeHtml === "function") {
      return AppCore.utils.escapeHtml(
        String(value ?? "")
      );
    }
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
  return normalizeLooseText(value)
    .replace(/[^\p{L}\p{N}@._\-/#:]/gu, "");
}

export function normalizeQuery(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPBAR_SEARCH_CONFIG.maxQueryLength);
}

export function tokenize(value = "", options = {}) {
  const includeStopWords =
    Boolean(options.includeStopWords);

  return normalizeLooseText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => includeStopWords || !STOP_WORDS.has(token));
}

export function uniqBy(items = [], keyGetter) {
  const seen =
    new Set();

  const result =
    [];

  for (const item of safeArray(items)) {
    const key =
      typeof keyGetter === "function"
        ? safeText(keyGetter(item), "")
        : "";

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

/* =========================================================
   TYPE HELPERS
========================================================= */

export function normalizeResultType(type = "general") {
  const raw =
    normalizeCompactText(type || "general");

  return (
    TYPE_ALIASES[raw] ||
    raw ||
    TOPBAR_RESULT_TYPES.GENERAL
  );
}

export function isResultType(type = "", expected = "") {
  return normalizeResultType(type) === normalizeResultType(expected);
}

export function getTypeLabel(type = "general") {
  const normalized =
    normalizeResultType(type);

  return (
    TYPE_LABELS[normalized] ||
    TYPE_LABELS[TOPBAR_RESULT_TYPES.GENERAL]
  );
}

export function getTypeIcon(type = "general") {
  const normalized =
    normalizeResultType(type);

  return (
    TYPE_ICONS[normalized] ||
    TYPE_ICONS[TOPBAR_RESULT_TYPES.GENERAL]
  );
}

export function getTypeGroupOrder(type = "general") {
  const normalized =
    normalizeResultType(type);

  const index =
    TYPE_GROUP_ORDER.indexOf(normalized);

  return index === -1
    ? TYPE_GROUP_ORDER.length
    : index;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function hasAbsoluteScheme(value = "") {
  return /^[a-z][a-z0-9+.-]*:/i.test(
    safeText(value, "")
  );
}

export function isUnsafeHref(value = "") {
  const raw =
    safeText(value, "").toLowerCase();

  return (
    raw.startsWith("javascript:") ||
    raw.startsWith("data:") ||
    raw.startsWith("vbscript:") ||
    raw.startsWith("file:")
  );
}

export function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

export function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

export function isHashOnlyHref(value = "") {
  const raw =
    safeText(value, "");

  return Boolean(
    raw.startsWith("#") &&
      !isHashRouterPath(raw)
  );
}

export function isExternalHref(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (isUnsafeHref(raw)) {
    return false;
  }

  if (raw.startsWith("//")) {
    try {
      const url =
        new URL(raw, getBaseOrigin());

      return url.origin !== getBaseOrigin();
    } catch {
      return true;
    }
  }

  if (!hasAbsoluteScheme(raw)) {
    return false;
  }

  try {
    const url =
      new URL(raw, getBaseOrigin());

    if (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      return url.origin !== getBaseOrigin();
    }

    return true;
  } catch {
    return true;
  }
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  const queryIndex =
    raw.indexOf("?");

  const hashIndex =
    raw.indexOf("#");

  let cutIndex =
    -1;

  if (
    queryIndex >= 0 &&
    hashIndex >= 0
  ) {
    cutIndex =
      Math.min(queryIndex, hashIndex);
  } else if (queryIndex >= 0) {
    cutIndex =
      queryIndex;
  } else if (hashIndex >= 0) {
    cutIndex =
      hashIndex;
  }

  return cutIndex >= 0
    ? raw.slice(0, cutIndex) || "/"
    : raw || "/";
}

function stripUsernamePrefix(pathname = "/") {
  return (
    safeText(pathname, "/")
      .replace(/^\/@[^/]+(?=\/|$)/i, "") ||
    "/"
  );
}

function normalizePathname(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw}`;
}

function normalizeHash(hash = "") {
  const raw =
    safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw}`;
}

export function safeNormalizePath(AppCore, path = "/") {
  const raw =
    safeText(path, "/");

  if (
    !raw ||
    isUnsafeHref(raw)
  ) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return safeNormalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  if (isHashOnlyHref(raw)) {
    return raw;
  }

  try {
    if (
      typeof AppCore?.utils?.normalizePath === "function" &&
      !hasAbsoluteScheme(raw) &&
      !raw.startsWith("//") &&
      !raw.includes("#/")
    ) {
      const normalized =
        AppCore.utils.normalizePath(raw || "/");

      return safeText(normalized, "/");
    }
  } catch {}

  try {
    if (
      hasAbsoluteScheme(raw) ||
      raw.startsWith("//")
    ) {
      const url =
        new URL(raw, getBaseOrigin());

      if (
        url.protocol === "http:" ||
        url.protocol === "https:"
      ) {
        if (url.origin !== getBaseOrigin()) {
          return raw;
        }

        if (
          url.hash &&
          isHashRouterPath(url.hash)
        ) {
          return safeNormalizePath(
            AppCore,
            normalizeHashRouterPath(url.hash)
          );
        }

        return `${normalizePathname(url.pathname || "/")}${url.search || ""}${url.hash || ""}`;
      }

      return raw;
    }
  } catch {
    return "/";
  }

  try {
    const url =
      new URL(
        raw.startsWith("/")
          ? raw
          : `/${raw}`,
        getBaseOrigin()
      );

    if (
      url.hash &&
      isHashRouterPath(url.hash)
    ) {
      return safeNormalizePath(
        AppCore,
        normalizeHashRouterPath(url.hash)
      );
    }

    return `${normalizePathname(url.pathname || "/")}${url.search || ""}${url.hash || ""}`;
  } catch {}

  const [pathAndSearch = "/", hashPart = ""] =
    raw.split("#");

  const [pathnameRaw = "/", searchPart = ""] =
    pathAndSearch.split("?");

  const pathname =
    normalizePathname(pathnameRaw || "/");

  const search =
    normalizeSearch(searchPart);

  const hash =
    normalizeHash(hashPart);

  return `${pathname}${search}${hash}`;
}

export function safeNormalizeCanonicalPath(AppCore, path = "/") {
  const raw =
    safeText(path, "/");

  let normalized =
    "";

  try {
    if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") {
      normalized =
        AppCore.utils.normalizeCanonicalPath(raw || "/");
    }
  } catch {}

  if (!normalized) {
    normalized =
      safeNormalizePath(AppCore, raw);
  }

  const clean =
    stripUsernamePrefix(
      stripSearchAndHash(normalized)
    );

  return normalizePathname(clean || "/");
}

export function getCurrentPublicPath(AppCore) {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return safeNormalizePath(
        AppCore,
        normalizeHashRouterPath(hash)
      );
    }

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
    return window.matchMedia(
      `(max-width: ${mobileBreakpoint}px)`
    ).matches;
  } catch {
    return false;
  }
}

/* =========================================================
   SCORING
========================================================= */

function boundedLevenshtein(a = "", b = "", maxDistance = 2) {
  const x =
    normalizeCompactText(a);

  const y =
    normalizeCompactText(b);

  if (
    !x &&
    !y
  ) {
    return 0;
  }

  if (
    !x ||
    !y
  ) {
    return maxDistance + 1;
  }

  if (x === y) {
    return 0;
  }

  const diff =
    Math.abs(x.length - y.length);

  if (diff > maxDistance) {
    return maxDistance + 1;
  }

  const previous =
    new Array(y.length + 1);

  const current =
    new Array(y.length + 1);

  for (let j = 0; j <= y.length; j += 1) {
    previous[j] =
      j;
  }

  for (let i = 1; i <= x.length; i += 1) {
    current[0] =
      i;

    let rowMin =
      current[0];

    for (let j = 1; j <= y.length; j += 1) {
      const cost =
        x[i - 1] === y[j - 1]
          ? 0
          : 1;

      current[j] =
        Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + cost
        );

      rowMin =
        Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= y.length; j += 1) {
      previous[j] =
        current[j];
    }
  }

  return previous[y.length];
}

function scoreTokenMatch(fieldToken = "", queryToken = "") {
  const field =
    normalizeLooseText(fieldToken);

  const query =
    normalizeLooseText(queryToken);

  if (
    !field ||
    !query
  ) {
    return 0;
  }

  if (field === query) {
    return 120;
  }

  if (field.startsWith(query)) {
    return 82;
  }

  if (
    query.startsWith(field) &&
    field.length >= 3
  ) {
    return 54;
  }

  if (field.includes(query)) {
    return 42;
  }

  if (
    field.length >= 3 &&
    query.length >= 3
  ) {
    const distance =
      boundedLevenshtein(field, query, 2);

    if (distance === 1) {
      return 24;
    }

    if (distance === 2) {
      return 10;
    }
  }

  return 0;
}

export function scoreTextMatch(text = "", query = "") {
  const t =
    normalizeLooseText(text);

  const q =
    normalizeLooseText(query);

  if (
    !t ||
    !q
  ) {
    return 0;
  }

  let score =
    0;

  if (t === q) {
    score += 260;
  }

  if (t.startsWith(q)) {
    score += 150;
  }

  if (t.includes(` ${q}`)) {
    score += 104;
  }

  if (t.includes(q)) {
    score += 86;
  }

  const compactText =
    normalizeCompactText(t);

  const compactQuery =
    normalizeCompactText(q);

  if (
    compactText &&
    compactQuery
  ) {
    if (compactText === compactQuery) {
      score += 190;
    }

    if (compactText.startsWith(compactQuery)) {
      score += 92;
    }

    if (compactText.includes(compactQuery)) {
      score += 48;
    }
  }

  const textTokens =
    tokenize(t, {
      includeStopWords:
        true,
    });

  const queryTokens =
    tokenize(q, {
      includeStopWords:
        true,
    });

  for (const qToken of queryTokens) {
    let bestTokenScore =
      0;

    for (const tToken of textTokens) {
      bestTokenScore =
        Math.max(
          bestTokenScore,
          scoreTokenMatch(tToken, qToken)
        );
    }

    score +=
      bestTokenScore;
  }

  return Math.round(score);
}

function extractSearchableValues(item = {}) {
  const raw =
    safeObject(item.raw);

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
    raw.searchId,
    raw.resultId,

    raw.userId,
    raw.usuarioId,
    raw.username,
    raw.email,
    raw.role,
    raw.rol,
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
    raw.nombreComercial,
    raw.nif,
    raw.cif,
    raw.phone,
    raw.telefono,

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
    raw.category,
    raw.categoria,

    raw.facturaId,
    raw.invoiceId,
    raw.numero,
    raw.numeroFactura,
    raw.numeroFacturaLegal,
    raw.numeroFacturaSistema,
    raw.invoiceCode,
    raw.invoiceNumber,
    raw.total,
    raw.amount,
    raw.importe,

    ...safeArray(item.keywords),
    ...safeArray(raw.keywords),
    ...safeArray(raw.tags),
  ].filter((value) => {
    return (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    );
  });
}

function getQueryIntentTypes(query = "") {
  const q =
    normalizeLooseText(query);

  const tokens =
    tokenize(q, {
      includeStopWords:
        true,
    });

  const types =
    new Set();

  for (const token of tokens) {
    const mapped =
      normalizeResultType(token);

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

  if (/\b(ticket|tickets|incidencia|incidencias|soporte|support|averia|averias|issue|issues)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.INCIDENCIA);
  }

  if (/\b(factura|facturas|invoice|invoices|billing|bill|bills|recibo|recibos)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.FACTURA);
  }

  if (/\b(cliente|clientes|client|clients|empresa|empresas|customer|customers)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.CLIENTE);
  }

  if (/\b(usuario|usuarios|user|users|perfil|profile|cuenta|account)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.USUARIO);
  }

  if (/\b(ajustes|settings|configuracion|configuration|config|preferencias|preferences)\b/.test(q)) {
    types.add(TOPBAR_RESULT_TYPES.SETTINGS);
  }

  return [...types];
}

function getTypeBoost(item = {}, query = "") {
  const type =
    normalizeResultType(item.type);

  const intentTypes =
    getQueryIntentTypes(query);

  let boost =
    TYPE_BASE_BOOST[type] ||
    TYPE_BASE_BOOST[TOPBAR_RESULT_TYPES.GENERAL];

  if (intentTypes.includes(type)) {
    boost += 52;
  }

  if (
    intentTypes.length &&
    !intentTypes.includes(type)
  ) {
    boost -= type === TOPBAR_RESULT_TYPES.NAV
      ? 14
      : 6;
  }

  if (item.source === "api") {
    boost += 10;
  }

  if (
    item.source === "local" &&
    type === TOPBAR_RESULT_TYPES.NAV
  ) {
    boost += 2;
  }

  return boost;
}

function getHeuristicBoost(item = {}, query = "") {
  const type =
    normalizeResultType(item.type);

  const q =
    normalizeLooseText(query);

  const compactQuery =
    normalizeCompactText(q);

  if (
    !q ||
    !compactQuery
  ) {
    return 0;
  }

  const raw =
    safeObject(item.raw);

  const entityId =
    normalizeCompactText(
      first(
        item.entityId,
        raw.entityId,
        raw.id,
        raw._id,
        raw.userId,
        raw.usuarioId,
        raw.clienteId,
        raw.clientId,
        raw.customerId,
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

  let boost =
    0;

  if (entityId) {
    if (entityId === compactQuery) {
      boost += 240;
    }

    if (entityId.startsWith(compactQuery)) {
      boost += 120;
    }

    if (entityId.includes(compactQuery)) {
      boost += 68;
    }
  }

  if (
    /@/.test(q) &&
    [
      TOPBAR_RESULT_TYPES.USUARIO,
      TOPBAR_RESULT_TYPES.CLIENTE,
    ].includes(type)
  ) {
    boost += 42;
  }

  if (
    /^\d+$/.test(compactQuery) &&
    type === TOPBAR_RESULT_TYPES.FACTURA
  ) {
    boost += 42;
  }

  if (
    /^\d+$/.test(compactQuery) &&
    type === TOPBAR_RESULT_TYPES.INCIDENCIA
  ) {
    boost += 34;
  }

  if (
    /^inc[-_a-z0-9]*/i.test(compactQuery) &&
    type === TOPBAR_RESULT_TYPES.INCIDENCIA
  ) {
    boost += 44;
  }

  if (
    /^fac[-_a-z0-9]*/i.test(compactQuery) &&
    type === TOPBAR_RESULT_TYPES.FACTURA
  ) {
    boost += 44;
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
  const q =
    normalizeQuery(query);

  if (!q) {
    return normalizeResultType(item?.type) === TOPBAR_RESULT_TYPES.NAV
      ? 10
      : 1;
  }

  const type =
    normalizeResultType(item?.type);

  const values =
    extractSearchableValues(item);

  const titleScore =
    scoreTextMatch(item?.title, q) * 3.2;

  const subtitleScore =
    scoreTextMatch(item?.subtitle, q) * 1.45;

  const urlScore =
    scoreTextMatch(item?.url, q) * 0.7;

  const entityScore =
    scoreTextMatch(item?.entityId, q) * 2.6;

  let keywordScore =
    0;

  for (const value of values) {
    keywordScore +=
      scoreTextMatch(value, q) * 0.24;
  }

  let navPenalty =
    0;

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
    navPenalty =
      26;
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

  return Math.round(
    Math.max(0, finalScore)
  );
}

/* =========================================================
   HIGHLIGHT
========================================================= */

function buildNormalizedIndexMap(value = "") {
  const source =
    String(value ?? "");

  let normalized =
    "";

  const map =
    [];

  for (let i = 0; i < source.length; i += 1) {
    const originalChar =
      source[i];

    const normalizedChar =
      originalChar
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    for (let j = 0; j < normalizedChar.length; j += 1) {
      normalized +=
        normalizedChar[j];

      map.push(i);
    }
  }

  return {
    normalized,
    map,
  };
}

function addHighlightRanges(ranges = [], normalized = "", map = [], needle = "") {
  const cleanNeedle =
    normalizeText(needle);

  if (!cleanNeedle) {
    return ranges;
  }

  let startAt =
    0;

  while (startAt < normalized.length) {
    const foundAt =
      normalized.indexOf(cleanNeedle, startAt);

    if (foundAt === -1) {
      break;
    }

    const originalStart =
      map[foundAt] ?? 0;

    const originalLast =
      map[foundAt + cleanNeedle.length - 1] ?? originalStart;

    ranges.push([
      originalStart,
      originalLast + 1,
    ]);

    startAt =
      foundAt + Math.max(1, cleanNeedle.length);
  }

  return ranges;
}

function mergeRanges(ranges = []) {
  const sorted =
    safeArray(ranges)
      .filter((range) => {
        return (
          Array.isArray(range) &&
          Number.isFinite(range[0]) &&
          Number.isFinite(range[1]) &&
          range[1] > range[0]
        );
      })
      .sort((a, b) => a[0] - b[0]);

  const merged =
    [];

  for (const range of sorted) {
    const last =
      merged[merged.length - 1];

    if (
      last &&
      range[0] <= last[1]
    ) {
      last[1] =
        Math.max(last[1], range[1]);

      continue;
    }

    merged.push([...range]);
  }

  return merged;
}

export function highlight(AppCore, text = "", query = "") {
  const source =
    String(text ?? "");

  const needle =
    normalizeQuery(query);

  if (
    !source ||
    !needle
  ) {
    return escapeHtml(AppCore, source);
  }

  const {
    normalized,
    map,
  } =
    buildNormalizedIndexMap(source);

  const normalizedNeedle =
    normalizeText(needle);

  if (
    !normalized ||
    !normalizedNeedle
  ) {
    return escapeHtml(AppCore, source);
  }

  const ranges =
    [];

  addHighlightRanges(
    ranges,
    normalized,
    map,
    normalizedNeedle
  );

  const queryTokens =
    tokenize(needle, {
      includeStopWords:
        false,
    }).filter((token) => token.length >= 2);

  if (
    ranges.length === 0 &&
    queryTokens.length > 1
  ) {
    for (const token of queryTokens) {
      addHighlightRanges(
        ranges,
        normalized,
        map,
        token
      );
    }
  }

  const merged =
    mergeRanges(ranges);

  if (!merged.length) {
    return escapeHtml(AppCore, source);
  }

  let output =
    "";

  let cursor =
    0;

  for (const [start, end] of merged) {
    output +=
      escapeHtml(
        AppCore,
        source.slice(cursor, start)
      );

    output += `<mark>${escapeHtml(
      AppCore,
      source.slice(start, end)
    )}</mark>`;

    cursor =
      end;
  }

  output +=
    escapeHtml(
      AppCore,
      source.slice(cursor)
    );

  return output;
}

/* =========================================================
   GROUP RESULTS
========================================================= */

export function groupResults(results = []) {
  const groups =
    new Map();

  safeArray(results).forEach((item) => {
    const key =
      normalizeResultType(
        item?.type ||
          TOPBAR_RESULT_TYPES.GENERAL
      );

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({
      ...item,
      type:
        key,
    });
  });

  return Array.from(groups.entries())
    .sort(([typeA], [typeB]) => {
      const orderA =
        getTypeGroupOrder(typeA);

      const orderB =
        getTypeGroupOrder(typeB);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return String(typeA).localeCompare(
        String(typeB),
        "es",
        {
          sensitivity:
            "base",
        }
      );
    })
    .map(([type, items]) => [
      type,
      [...items].sort((a, b) => {
        const scoreA =
          Number(a?.score || 0);

        const scoreB =
          Number(b?.score || 0);

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        return String(a?.title || "").localeCompare(
          String(b?.title || ""),
          "es",
          {
            sensitivity:
              "base",
          }
        );
      }),
    ]);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
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

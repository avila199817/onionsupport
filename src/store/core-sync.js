/* =========================================================
   Onion Support - Store Core Sync
   Archivo: /src/store/core-sync.js

   Responsabilidad:
   - Compat mínima Store ↔ Core.
   - Hidratar Store desde Core sólo cuando cambia app/ui/ruta.
   - No duplicar Core.
   - No duplicar Auth.
   - No duplicar sesión.
   - No duplicar Router.
   - No duplicar UI.
   - No escuchar eventos masivos.
   - No guardar tokens.
   - No guardar usuario Auth.
   - Sin imports.
   - Sin storage.
   - Sin fetch.
   - Sin navegación.
========================================================= */

export const STORE_CORE_SYNC_VERSION = "store.core-sync.v3";

export const STORE_CORE_SYNC_EVENT = "app:state:change";

const RELEVANT_CORE_PATHS = Object.freeze([
  "ready",
  "appReady",
  "initialized",
  "booted",
  "booting",
  "loading",
  "fatal",
  "appFatal",

  "route",
  "canonicalPath",
  "publicPath",
  "routeMode",

  "lang",
  "language",
  "locale",

  "theme",
  "themeMode",
  "effectiveTheme",

  "sidebarOpen",
  "shellVisible",
  "chromeVisible",

  "pageTitle",
  "topbarTitle",

  "error",
  "lastError",
  "hasError",
]);

const IGNORED_CORE_PATH_PARTS = Object.freeze([
  "__proto__",
  "prototype",
  "constructor",

  "auth",
  "authenticated",

  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "jwt",
  "authorization",
  "bearer",

  "session",
  "sessionData",
  "sessionId",
  "session_id",
  "sessionUserId",

  "user",
  "currentUser",
  "authUser",
  "sessionUser",

  "role",
  "rol",
  "roles",
  "permissions",

  "password",
  "passwd",
  "pwd",
  "secret",
  "credential",
  "cookie",
  "apiKey",
  "api_key",
  "privateKey",
  "private_key",
  "connectionString",
  "connection_string",
  "sas",

  "otp",
  "totp",
  "mfa",
  "twofa",
  "2fa",
  "backupCode",
  "backup_code",
  "backupCodes",
  "backup_codes",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
]);

const IGNORED_CORE_PATH_SET = new Set(
  IGNORED_CORE_PATH_PARTS.map((part) => String(part).toLowerCase())
);

const SENSITIVE_PATH_RE =
  /(token|authorization|bearer|cookie|password|passwd|pwd|secret|credential|jwt|refresh|accessToken|access_token|idToken|id_token|apiKey|api_key|privateKey|private_key|connectionString|connection_string|sas|otp|totp|mfa|twofa|2fa|backupCode|backup_code|backupCodes|backup_codes|sessionId|session_id)/i;

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function noop() {
  return false;
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizePathParts(path = "") {
  const source = Array.isArray(path)
    ? path
    : text(path, "")
        .replace(/\[(["'`]?)(.*?)\1\]/g, ".$2")
        .replace(/^\.+|\.+$/g, "")
        .replace(/\.{2,}/g, ".")
        .split(".");

  const parts = source
    .map((part) => text(part, ""))
    .filter(Boolean);

  if (!parts.length) return [];

  const hasBlockedPart = parts.some((part) => {
    const clean = part.toLowerCase();

    return (
      clean === "__proto__" ||
      clean === "prototype" ||
      clean === "constructor"
    );
  });

  return hasBlockedPart ? [] : parts;
}

function normalizePath(path = "") {
  return normalizePathParts(path).join(".");
}

function lowerPath(path = "") {
  return normalizePath(path).toLowerCase();
}

function pushUnsubscriber(list, off) {
  if (Array.isArray(list) && isFunction(off)) {
    list.push(off);
  }

  return off;
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   PAYLOAD FILTER
========================================================= */

function changedPathsFromPayload(payload = {}) {
  if (!isObject(payload)) return [];

  const paths =
    payload.changedPaths ||
    payload.paths ||
    payload.keys ||
    payload.changed ||
    payload.path ||
    payload.key ||
    [];

  const list = Array.isArray(paths) ? paths : [paths];

  return [
    ...new Set(
      list
        .map(normalizePath)
        .filter(Boolean)
    ),
  ];
}

function pathTouches(path = "", candidate = "") {
  const current = lowerPath(path);
  const target = lowerPath(candidate);

  if (!current || !target) return false;

  return (
    current === target ||
    current.startsWith(`${target}.`) ||
    target.startsWith(`${current}.`) ||
    current.endsWith(`.${target}`) ||
    current.includes(`.${target}.`)
  );
}

function isIgnoredPath(path = "") {
  const parts = normalizePathParts(path);

  if (!parts.length) return true;

  return parts.some((part) => {
    const clean = part.toLowerCase();

    return IGNORED_CORE_PATH_SET.has(clean) || SENSITIVE_PATH_RE.test(part);
  });
}

function isRelevantPath(path = "") {
  if (!path || isIgnoredPath(path)) return false;

  return RELEVANT_CORE_PATHS.some((candidate) => {
    return pathTouches(path, candidate);
  });
}

function relevantChangedPathsFromPayload(payload = {}) {
  return changedPathsFromPayload(payload).filter(isRelevantPath);
}

function shouldHydrateFromPayload(payload = {}) {
  const changedPaths = changedPathsFromPayload(payload);

  if (!changedPaths.length) return false;

  return changedPaths.some(isRelevantPath);
}

function safePayload(payload = {}, reason = "core-sync") {
  if (!isObject(payload)) {
    return {
      version: STORE_CORE_SYNC_VERSION,
      source: "store.core-sync",
      reason,
      changedPaths: [],
    };
  }

  return {
    version: STORE_CORE_SYNC_VERSION,
    source: "store.core-sync",
    reason,
    changedPaths: relevantChangedPathsFromPayload(payload),
    timestamp: Number(payload.timestamp || Date.now()),
  };
}

/* =========================================================
   HYDRATE
========================================================= */

function hydrateFromCore(actions = null, reason = "core-sync", payload = {}) {
  if (!actions) return false;

  const hydrate =
    actions.hydrateFromCore ||
    actions.syncFromCore ||
    null;

  if (!isFunction(hydrate)) return false;

  const result = safeCall(hydrate, {
    source: "store.core-sync",
    reason,
    payload: safePayload(payload, reason),
  });

  return result !== null && result !== false;
}

/* =========================================================
   EVENT COMPAT
========================================================= */

export function addCoreEvent({
  AppCore = null,
  coreUnsubscribers = null,
  eventName = "",
  handler = null,
} = {}) {
  if (!AppCore || !eventName || !isFunction(handler)) {
    return noop;
  }

  let off = null;

  try {
    if (isFunction(AppCore.events?.on)) {
      off = AppCore.events.on(eventName, handler);
    }
  } catch {
    off = null;
  }

  if (!isFunction(off)) {
    return noop;
  }

  pushUnsubscriber(coreUnsubscribers, off);

  return off;
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindCoreEvents({
  AppCore = null,
  coreUnsubscribers = null,
  actions = null,
} = {}) {
  if (!AppCore || !actions) {
    return false;
  }

  if (Array.isArray(coreUnsubscribers) && coreUnsubscribers.length > 0) {
    return true;
  }

  const hydrated = hydrateFromCore(actions, "bind", null);

  if (!Array.isArray(coreUnsubscribers)) {
    return hydrated;
  }

  const before = coreUnsubscribers.length;

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: STORE_CORE_SYNC_EVENT,
    handler: (payload = {}) => {
      if (!shouldHydrateFromPayload(payload)) return false;

      return hydrateFromCore(actions, "core-state-change", payload);
    },
  });

  return hydrated || coreUnsubscribers.length > before;
}

export function unbindCoreEvents({ coreUnsubscribers = null } = {}) {
  if (!Array.isArray(coreUnsubscribers)) {
    return true;
  }

  while (coreUnsubscribers.length) {
    const off = coreUnsubscribers.pop();

    try {
      off?.();
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCoreSyncSnapshot({ coreUnsubscribers = null } = {}) {
  return {
    version: STORE_CORE_SYNC_VERSION,

    event: STORE_CORE_SYNC_EVENT,
    bound: Array.isArray(coreUnsubscribers) && coreUnsubscribers.length > 0,
    listeners: Array.isArray(coreUnsubscribers) ? coreUnsubscribers.length : 0,

    relevantCorePaths: [...RELEVANT_CORE_PATHS],

    policy: {
      compatOnly: true,

      noCoreDuplication: true,
      noAuthDuplication: true,
      noSessionDuplication: true,
      noRouterDuplication: true,
      noUiDuplication: true,

      singleCoreEvent: true,
      filtersAuthSessionTokenUserChanges: true,
      hydratesOnlyAppUiRouteChanges: true,
      skipsEventsWithoutChangedPaths: true,

      noStorage: true,
      noFetch: true,
      noNavigation: true,
      noTokens: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_CORE_SYNC_VERSION,
  STORE_CORE_SYNC_EVENT,

  addCoreEvent,
  bindCoreEvents,
  unbindCoreEvents,

  getCoreSyncSnapshot,
};

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

  "sidebarOpen",
  "shellVisible",
  "chromeVisible",

  "error",
  "lastError",
  "hasError",
]);

const IGNORED_CORE_PATH_PARTS = Object.freeze([
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

  "session",
  "sessionData",
  "sessionId",
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
  "secret",
  "cookie",
  "otp",
  "totp",
  "mfa",
  "twofa",
  "2fa",
]);

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function normalizePath(path = "") {
  return text(path, "")
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
    .trim();
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
    target.startsWith(`${current}.`)
  );
}

function isIgnoredPath(path = "") {
  const current = lowerPath(path);

  if (!current) return false;

  return IGNORED_CORE_PATH_PARTS.some((part) => {
    const clean = lowerPath(part);

    return (
      current === clean ||
      current.includes(`.${clean}`) ||
      current.startsWith(`${clean}.`) ||
      current.endsWith(`.${clean}`)
    );
  });
}

function isRelevantPath(path = "") {
  if (isIgnoredPath(path)) return false;

  return RELEVANT_CORE_PATHS.some((candidate) =>
    pathTouches(path, candidate)
  );
}

function shouldHydrateFromPayload(payload = {}) {
  const changedPaths = changedPathsFromPayload(payload);

  /*
    Sin lista de paths, mantenemos compat: hidratar una vez.
    La limpieza real de campos sensibles corresponde a actions/state.
  */
  if (!changedPaths.length) return true;

  return changedPaths.some(isRelevantPath);
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

  safeCall(hydrate, {
    source: "store.core-sync",
    reason,
    payload,
  });

  return true;
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
    off = noop;
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

  hydrateFromCore(actions, "bind", null);

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName: STORE_CORE_SYNC_EVENT,
    handler: (payload = {}) => {
      if (!shouldHydrateFromPayload(payload)) return false;

      return hydrateFromCore(actions, "core-state-change", payload);
    },
  });

  return true;
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

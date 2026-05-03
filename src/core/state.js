/* =========================================================
   Onion SPA - Core State
   Archivo: src/core/state.js

   RESPONSABILIDADES:
   - definir el estado global base del core
   - exponer snapshot seguro del estado
   - computar autenticación
   - aplicar patches de estado normalizados
   - mantener route/publicPath consistentes
   - preservar currentResolvedUsername cuando procede
   - evitar ghost auth
   - evitar eventos falsos de state change

   HARDENING EXTREMO:
   - estado inicial robusto
   - route/publicPath siempre definidos
   - currentResolvedUsername persistente
   - patches seguros e idempotentes
   - auth derivada consistente
   - canonical route sin query/hash
   - publicPath con query/hash
   - eventos con snapshot estable
   - snapshots sin token real
   - patch de evento sin contaminación de estado completo
   - updatedAt/stateChangeCount solo si hay cambios reales
   - cero undefined setters
   - cero throws accidentales salvo estado raíz inválido
========================================================= */

import {
  cloneError,
  safeClone,
  normalizeUser,
  hasValidToken,
  sanitizeUsername,
  getCurrentLocationCanonicalPath,
  getCurrentLocationPath,
  normalizeCanonicalPath,
  normalizePublicPath,
  normalizePath,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE =
  "/";

const STATE_VERSION =
  "10.1.0";

const VALID_THEMES =
  Object.freeze([
    "dark",
    "light",
  ]);

const VALID_LANG_RE =
  /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

const BOOLEAN_KEYS =
  Object.freeze([
    "initialized",
    "booting",
    "ready",
    "coreInitializing",
    "coreReady",
    "loading",
    "sidebarOpen",
    "shellVisible",
    "chromeVisible",
    "appShellVisible",
    "shellBusy",
    "hasError",
  ]);

/* =========================================================
   HELPERS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      obj,
      key
    );
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "");
  }
}

function safeHasValidToken(token) {
  try {
    return Boolean(
      hasValidToken(token)
    );
  } catch {
    return Boolean(
      safeText(token, "")
    );
  }
}

function safeNormalizeUser(user = null) {
  try {
    return normalizeUser(user);
  } catch {
    return user || null;
  }
}

function safeGetUserUsername(user = null) {
  try {
    return getUserUsername(user) || null;
  } catch {
    return null;
  }
}

function safeGetUserDisplayName(user = null) {
  try {
    return getUserDisplayName(user) || null;
  } catch {
    return null;
  }
}

function safeGetUserAvatarUrl(user = null) {
  try {
    return getUserAvatarUrl(user) || null;
  } catch {
    return null;
  }
}

function safeCanonicalPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  try {
    return normalizeCanonicalPath(
      value || fallback || DEFAULT_ROUTE
    );
  } catch {
    return fallback || DEFAULT_ROUTE;
  }
}

function safePublicPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  try {
    if (typeof normalizePublicPath === "function") {
      return normalizePublicPath(
        value || fallback || DEFAULT_ROUTE
      );
    }
  } catch {}

  try {
    return normalizePath(
      value || fallback || DEFAULT_ROUTE
    );
  } catch {
    return fallback || DEFAULT_ROUTE;
  }
}

function safeLocationCanonicalPath() {
  try {
    return safeCanonicalPath(
      getCurrentLocationCanonicalPath(),
      DEFAULT_ROUTE
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function safeLocationPublicPath(fallback = DEFAULT_ROUTE) {
  try {
    return safePublicPath(
      getCurrentLocationPath(),
      fallback
    );
  } catch {
    return fallback || DEFAULT_ROUTE;
  }
}

function normalizeTheme(theme = "dark") {
  const value =
    safeText(
      theme,
      "dark"
    ).toLowerCase();

  return VALID_THEMES.includes(value)
    ? value
    : "dark";
}

function normalizeLang(lang = "es") {
  const value =
    safeText(
      lang,
      "es"
    ).toLowerCase();

  return VALID_LANG_RE.test(value)
    ? value
    : "es";
}

function resolveRole(user = null) {
  const role =
    safeText(
      user?.role ||
        user?.rol ||
        user?.type ||
        user?.userType ||
        user?.user_type ||
        user?.profile?.role ||
        user?.raw?.role ||
        user?.raw?.rol ||
        "",
      ""
    ).toLowerCase();

  return role || null;
}

function extractUsernameFromPublicPath(publicPath = DEFAULT_ROUTE) {
  const match =
    String(publicPath || "")
      .match(/^\/@([^/]+)(?:\/|$)/i);

  return (
    sanitizeUsername(
      match?.[1] || ""
    ) || null
  );
}

function resolveCurrentResolvedUsername({
  user = null,
  publicPath = DEFAULT_ROUTE,
  previous = null,
  authenticated = false,
} = {}) {
  if (!authenticated) {
    return null;
  }

  const fromPath =
    extractUsernameFromPublicPath(
      publicPath
    );

  const fromUser =
    sanitizeUsername(
      safeGetUserUsername(user) ||
        user?.username ||
        user?.userName ||
        user?.nick ||
        user?.alias ||
        user?.login ||
        user?.slug ||
        ""
    ) || null;

  const fromPrevious =
    sanitizeUsername(
      previous || ""
    ) || null;

  return (
    fromPath ||
    fromUser ||
    fromPrevious ||
    null
  );
}

function resolveOnlineState() {
  try {
    if (typeof navigator !== "undefined") {
      return navigator.onLine !== false;
    }
  } catch {}

  return true;
}

function normalizeError(value = null) {
  if (!value) {
    return null;
  }

  try {
    return cloneError(value);
  } catch {
    return value;
  }
}

function sanitizePatchInput(patch = {}) {
  const output =
    {};

  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    return output;
  }

  for (const [key, value] of Object.entries(patch)) {
    /*
      Regla core:
      undefined no escribe estado.
      Para limpiar un valor se debe usar null.
    */
    if (value !== undefined) {
      output[key] =
        value;
    }
  }

  return output;
}

function stableStringify(value, seen = new WeakSet()) {
  if (
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  const type =
    typeof value;

  if (
    type === "string" ||
    type === "number" ||
    type === "boolean" ||
    type === "bigint"
  ) {
    return `${type}:${String(value)}`;
  }

  if (type === "function") {
    return `function:${value.name || "anonymous"}`;
  }

  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }

  if (value instanceof Error) {
    return `error:${value.name}:${value.message}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) =>
      stableStringify(item, seen)
    ).join(",")}]`;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    const keys =
      Object.keys(value).sort();

    return `{${keys.map((key) =>
      `${key}:${stableStringify(value[key], seen)}`
    ).join("|")}}`;
  }

  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

function valuesEqual(previous, next) {
  if (Object.is(previous, next)) {
    return true;
  }

  const previousIsObject =
    previous !== null &&
    typeof previous === "object";

  const nextIsObject =
    next !== null &&
    typeof next === "object";

  if (
    previousIsObject ||
    nextIsObject
  ) {
    try {
      return (
        stableStringify(previous) ===
        stableStringify(next)
      );
    } catch {
      return false;
    }
  }

  return false;
}

function getChangedKeys(state, patch = {}) {
  return Object.keys(patch).filter((key) =>
    !valuesEqual(
      state?.[key],
      patch[key]
    )
  );
}

/* =========================================================
   AUTH
========================================================= */

export function computeAuthenticated(nextUser, nextToken) {
  const normalizedUser =
    safeNormalizeUser(nextUser);

  const validToken =
    safeHasValidToken(nextToken);

  /*
    Regla anti ghost-auth:
    - token válido requerido
    - usuario activo si existe
    - si no hay usuario todavía, token válido permite estado técnico
      autenticado hasta que /me complete o falle.
  */
  if (!validToken) {
    return false;
  }

  if (
    normalizedUser &&
    normalizedUser.active === false
  ) {
    return false;
  }

  return true;
}

function deriveAuthPatch({
  state,
  patch,
} = {}) {
  const nextUser =
    hasOwn(patch, "user")
      ? patch.user
      : state.user;

  const nextToken =
    hasOwn(patch, "token")
      ? patch.token
      : state.token;

  const authenticated =
    computeAuthenticated(
      nextUser,
      nextToken
    );

  const hasToken =
    safeHasValidToken(
      nextToken
    );

  return {
    authenticated,

    hasToken,

    role:
      authenticated
        ? resolveRole(nextUser)
        : null,

    username:
      authenticated
        ? safeGetUserUsername(nextUser)
        : null,
  };
}

/* =========================================================
   STATE FACTORY
========================================================= */

export function createInitialState({
  config,
} = {}) {
  const route =
    safeLocationCanonicalPath();

  const publicPath =
    safeLocationPublicPath(route);

  const lang =
    normalizeLang(
      config?.defaultLang || "es"
    );

  const theme =
    normalizeTheme(
      config?.defaultTheme || "dark"
    );

  const online =
    resolveOnlineState();

  const nowIso =
    safeIsoDate();

  return {
    __version:
      STATE_VERSION,

    initialized:
      false,

    booting:
      false,

    ready:
      false,

    coreInitializing:
      false,

    coreReady:
      false,

    loading:
      true,

    route,
    publicPath,

    lastRoute:
      null,

    lastPublicPath:
      null,

    user:
      null,

    token:
      null,

    hasToken:
      false,

    role:
      null,

    username:
      null,

    authenticated:
      false,

    currentResolvedUsername:
      null,

    resolvedUsername:
      null,

    lang,
    theme,

    sidebarOpen:
      true,

    shellVisible:
      true,

    chromeVisible:
      true,

    appShellVisible:
      true,

    shellBusy:
      false,

    online,

    offline:
      !online,

    networkOnline:
      online,

    networkOffline:
      !online,

    networkStatus:
      online ? "online" : "offline",

    lastError:
      null,

    error:
      null,

    hasError:
      false,

    lastRequestAt:
      null,

    lastRequestUrl:
      null,

    lastRequestMethod:
      null,

    createdAt:
      nowIso,

    updatedAt:
      nowIso,

    stateChangeCount:
      0,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function cloneState(state, options = {}) {
  const opts =
    isObject(options)
      ? options
      : {};

  const includeToken =
    opts.includeToken === true;

  const source =
    state && typeof state === "object"
      ? state
      : {};

  const snapshot = {
    ...safeClone(
      source,
      {}
    ),

    user:
      source.user
        ? safeClone(
            source.user,
            source.user
          )
        : null,

    token:
      includeToken
        ? source.token || null
        : null,

    hasToken:
      Boolean(
        safeHasValidToken(source.token)
      ),

    lastError:
      normalizeError(
        source.lastError ||
          source.error
      ),

    error:
      normalizeError(
        source.error ||
          source.lastError
      ),

    route:
      safeCanonicalPath(
        source.route || DEFAULT_ROUTE
      ),

    publicPath:
      safeRedact(
        safePublicPath(
          source.publicPath ||
            source.route ||
            DEFAULT_ROUTE
        )
      ),

    lastRequestUrl:
      safeRedact(
        source.lastRequestUrl || ""
      ),
  };

  return snapshot;
}

export function getState(state, options = {}) {
  return cloneState(
    state,
    options
  );
}

function clonePatchForEvent(patch = {}) {
  const cloned =
    safeClone(
      patch || {},
      {}
    );

  if (hasOwn(cloned, "token")) {
    cloned.token =
      null;
  }

  if (hasOwn(cloned, "lastRequestUrl")) {
    cloned.lastRequestUrl =
      safeRedact(
        cloned.lastRequestUrl || ""
      );
  }

  if (hasOwn(cloned, "publicPath")) {
    cloned.publicPath =
      safeRedact(
        cloned.publicPath || ""
      );
  }

  if (hasOwn(cloned, "lastPublicPath")) {
    cloned.lastPublicPath =
      safeRedact(
        cloned.lastPublicPath || ""
      );
  }

  if (hasOwn(cloned, "error")) {
    cloned.error =
      normalizeError(
        cloned.error
      );
  }

  if (hasOwn(cloned, "lastError")) {
    cloned.lastError =
      normalizeError(
        cloned.lastError
      );
  }

  return cloned;
}

/* =========================================================
   PATCH NORMALIZATION
========================================================= */

function normalizeStatePatch(state, patch = {}) {
  const normalizedPatch =
    sanitizePatchInput(patch);

  if (hasOwn(normalizedPatch, "user")) {
    normalizedPatch.user =
      safeNormalizeUser(
        normalizedPatch.user
      );
  }

  if (hasOwn(normalizedPatch, "token")) {
    normalizedPatch.token =
      safeHasValidToken(
        normalizedPatch.token
      )
        ? String(
            normalizedPatch.token
          ).trim()
        : null;
  }

  if (hasOwn(normalizedPatch, "route")) {
    normalizedPatch.route =
      safeCanonicalPath(
        normalizedPatch.route,
        state.route || DEFAULT_ROUTE
      );
  }

  if (hasOwn(normalizedPatch, "publicPath")) {
    normalizedPatch.publicPath =
      safePublicPath(
        normalizedPatch.publicPath,
        state.publicPath ||
          state.route ||
          DEFAULT_ROUTE
      );
  }

  if (hasOwn(normalizedPatch, "lastRoute")) {
    normalizedPatch.lastRoute =
      normalizedPatch.lastRoute
        ? safeCanonicalPath(
            normalizedPatch.lastRoute,
            DEFAULT_ROUTE
          )
        : null;
  }

  if (hasOwn(normalizedPatch, "lastPublicPath")) {
    normalizedPatch.lastPublicPath =
      normalizedPatch.lastPublicPath
        ? safePublicPath(
            normalizedPatch.lastPublicPath,
            DEFAULT_ROUTE
          )
        : null;
  }

  if (hasOwn(normalizedPatch, "theme")) {
    normalizedPatch.theme =
      normalizeTheme(
        normalizedPatch.theme
      );
  }

  if (hasOwn(normalizedPatch, "lang")) {
    normalizedPatch.lang =
      normalizeLang(
        normalizedPatch.lang
      );
  }

  for (const key of BOOLEAN_KEYS) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] =
        Boolean(
          normalizedPatch[key]
        );
    }
  }

  if (hasOwn(normalizedPatch, "online")) {
    normalizedPatch.online =
      normalizedPatch.online === null
        ? null
        : Boolean(normalizedPatch.online);

    normalizedPatch.offline =
      normalizedPatch.online === null
        ? null
        : !normalizedPatch.online;

    normalizedPatch.networkOnline =
      normalizedPatch.online;

    normalizedPatch.networkOffline =
      normalizedPatch.offline;

    normalizedPatch.networkStatus =
      normalizedPatch.online === null
        ? "unknown"
        : normalizedPatch.online
          ? "online"
          : "offline";
  }

  if (hasOwn(normalizedPatch, "offline")) {
    normalizedPatch.offline =
      normalizedPatch.offline === null
        ? null
        : Boolean(normalizedPatch.offline);

    normalizedPatch.online =
      normalizedPatch.offline === null
        ? null
        : !normalizedPatch.offline;

    normalizedPatch.networkOnline =
      normalizedPatch.online;

    normalizedPatch.networkOffline =
      normalizedPatch.offline;

    normalizedPatch.networkStatus =
      normalizedPatch.online === null
        ? "unknown"
        : normalizedPatch.online
          ? "online"
          : "offline";
  }

  if (hasOwn(normalizedPatch, "error")) {
    normalizedPatch.error =
      normalizeError(
        normalizedPatch.error
      );

    normalizedPatch.lastError =
      normalizedPatch.error;

    normalizedPatch.hasError =
      Boolean(normalizedPatch.error);
  }

  if (hasOwn(normalizedPatch, "lastError")) {
    normalizedPatch.lastError =
      normalizeError(
        normalizedPatch.lastError
      );

    normalizedPatch.error =
      normalizedPatch.lastError;

    normalizedPatch.hasError =
      Boolean(normalizedPatch.lastError);
  }

  if (hasOwn(normalizedPatch, "lastRequestUrl")) {
    normalizedPatch.lastRequestUrl =
      safeRedact(
        normalizedPatch.lastRequestUrl
      );
  }

  if (hasOwn(normalizedPatch, "lastRequestMethod")) {
    normalizedPatch.lastRequestMethod =
      safeText(
        normalizedPatch.lastRequestMethod,
        ""
      ).toUpperCase() || null;
  }

  const shouldRecomputeAuth =
    hasOwn(normalizedPatch, "user") ||
    hasOwn(normalizedPatch, "token") ||
    hasOwn(normalizedPatch, "authenticated") ||
    hasOwn(normalizedPatch, "hasToken") ||
    hasOwn(normalizedPatch, "role") ||
    hasOwn(normalizedPatch, "username");

  if (shouldRecomputeAuth) {
    const authPatch =
      deriveAuthPatch({
        state,
        patch:
          normalizedPatch,
      });

    normalizedPatch.authenticated =
      authPatch.authenticated;

    normalizedPatch.hasToken =
      authPatch.hasToken;

    normalizedPatch.role =
      authPatch.role;

    normalizedPatch.username =
      authPatch.username;
  }

  const nextUserForUsername =
    hasOwn(normalizedPatch, "user")
      ? normalizedPatch.user
      : state.user;

  const nextPublicPathForUsername =
    hasOwn(normalizedPatch, "publicPath")
      ? normalizedPatch.publicPath
      : state.publicPath;

  const nextAuthenticated =
    hasOwn(normalizedPatch, "authenticated")
      ? normalizedPatch.authenticated
      : state.authenticated;

  const resolvedUsername =
    resolveCurrentResolvedUsername({
      user:
        nextUserForUsername,

      publicPath:
        nextPublicPathForUsername,

      previous:
        state.currentResolvedUsername,

      authenticated:
        nextAuthenticated,
    });

  normalizedPatch.currentResolvedUsername =
    resolvedUsername;

  normalizedPatch.resolvedUsername =
    resolvedUsername;

  return normalizedPatch;
}

/* =========================================================
   WRITE STATE
========================================================= */

export function setState({
  state,
  events,
  patch = {},
} = {}) {
  if (
    !state ||
    typeof state !== "object"
  ) {
    throw new Error(
      "Core state inválido."
    );
  }

  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    return cloneState(state);
  }

  const normalizedPatch =
    normalizeStatePatch(
      state,
      patch
    );

  const changedKeys =
    getChangedKeys(
      state,
      normalizedPatch
    );

  /*
    Punto crítico:
    si no hay cambios reales, no se toca updatedAt,
    no se incrementa stateChangeCount y no se emite evento.
  */
  if (!changedKeys.length) {
    return cloneState(state);
  }

  const previousState =
    cloneState(state);

  normalizedPatch.updatedAt =
    safeIsoDate();

  normalizedPatch.stateChangeCount =
    safeNumber(
      state.stateChangeCount,
      0
    ) + 1;

  const finalChangedKeys =
    Array.from(
      new Set([
        ...changedKeys,
        "updatedAt",
        "stateChangeCount",
      ])
    );

  Object.assign(
    state,
    normalizedPatch
  );

  const nextSnapshot =
    cloneState(state);

  try {
    events?.emit?.(
      "app:state:change",
      {
        state:
          nextSnapshot,

        patch:
          clonePatchForEvent(
            normalizedPatch
          ),

        previousState,

        changedKeys:
          finalChangedKeys,
      }
    );
  } catch {}

  return nextSnapshot;
}

/* =========================================================
   DEBUG HELPERS
========================================================= */

export function getStateDebugSnapshot(state) {
  return {
    version:
      state?.__version || STATE_VERSION,

    initialized:
      Boolean(state?.initialized),

    booting:
      Boolean(state?.booting),

    ready:
      Boolean(state?.ready),

    coreInitializing:
      Boolean(state?.coreInitializing),

    coreReady:
      Boolean(state?.coreReady),

    loading:
      Boolean(state?.loading),

    route:
      safeCanonicalPath(
        state?.route || DEFAULT_ROUTE
      ),

    publicPath:
      safeRedact(
        safePublicPath(
          state?.publicPath ||
            state?.route ||
            DEFAULT_ROUTE
        )
      ),

    lastRoute:
      state?.lastRoute || null,

    lastPublicPath:
      safeRedact(
        state?.lastPublicPath || ""
      ) || null,

    authenticated:
      Boolean(state?.authenticated),

    hasToken:
      Boolean(
        safeHasValidToken(state?.token)
      ),

    role:
      state?.role || null,

    username:
      state?.username || null,

    displayName:
      safeGetUserDisplayName(state?.user),

    avatarUrl:
      safeGetUserAvatarUrl(state?.user),

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    resolvedUsername:
      state?.resolvedUsername || null,

    lang:
      state?.lang || "es",

    theme:
      state?.theme || "dark",

    sidebarOpen:
      typeof state?.sidebarOpen === "boolean"
        ? state.sidebarOpen
        : null,

    shellVisible:
      typeof state?.shellVisible === "boolean"
        ? state.shellVisible
        : null,

    chromeVisible:
      typeof state?.chromeVisible === "boolean"
        ? state.chromeVisible
        : null,

    appShellVisible:
      typeof state?.appShellVisible === "boolean"
        ? state.appShellVisible
        : null,

    shellBusy:
      typeof state?.shellBusy === "boolean"
        ? state.shellBusy
        : null,

    online:
      state?.online ?? null,

    offline:
      state?.offline ?? null,

    networkStatus:
      state?.networkStatus || "",

    hasError:
      Boolean(state?.hasError),

    lastRequestAt:
      state?.lastRequestAt || null,

    lastRequestUrl:
      safeRedact(
        state?.lastRequestUrl || ""
      ),

    lastRequestMethod:
      state?.lastRequestMethod || null,

    stateChangeCount:
      safeNumber(
        state?.stateChangeCount,
        0
      ),

    createdAt:
      state?.createdAt || "",

    updatedAt:
      state?.updatedAt || "",
  };
}

export default {
  createInitialState,
  cloneState,
  getState,
  setState,
  computeAuthenticated,
  getStateDebugSnapshot,
};

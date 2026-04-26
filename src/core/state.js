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
  "10.0.0";

const VALID_THEMES =
  Object.freeze([
    "dark",
    "light",
  ]);

const VALID_LANG_RE =
  /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

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

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;

  return Boolean(fallback);
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
    safeText(theme, "dark").toLowerCase();

  return VALID_THEMES.includes(value)
    ? value
    : "dark";
}

function normalizeLang(lang = "es") {
  const value =
    safeText(lang, "es").toLowerCase();

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
        "",
      ""
    ).toLowerCase();

  return role || null;
}

function hasUsableUser(user = null) {
  if (!user || !isObject(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
    safeText(user.userId, "") ||
    safeText(user.username, "") ||
    safeText(user.email, "") ||
    safeText(user.name, "")
  );
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
      getUserUsername(user) ||
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

/* =========================================================
   AUTH
========================================================= */

export function computeAuthenticated(nextUser, nextToken) {
  const normalizedUser =
    normalizeUser(nextUser);

  const validToken =
    hasValidToken(nextToken);

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

  return {
    authenticated,

    hasToken:
      hasValidToken(nextToken),

    role:
      authenticated
        ? resolveRole(nextUser)
        : null,

    username:
      authenticated
        ? getUserUsername(nextUser) || null
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
      safeIsoDate(),

    updatedAt:
      safeIsoDate(),

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

  const snapshot = {
    ...safeClone(
      state || {},
      {}
    ),

    user:
      state?.user
        ? safeClone(
            state.user,
            state.user
          )
        : null,

    token:
      includeToken
        ? state?.token || null
        : null,

    hasToken:
      Boolean(
        hasValidToken(state?.token)
      ),

    lastError:
      normalizeError(
        state?.lastError ||
          state?.error
      ),

    error:
      normalizeError(
        state?.error ||
          state?.lastError
      ),

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

    lastRequestUrl:
      safeRedact(
        state?.lastRequestUrl || ""
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

/* =========================================================
   PATCH NORMALIZATION
========================================================= */

function normalizeStatePatch(state, patch = {}) {
  const normalizedPatch = {
    ...patch,
  };

  if (hasOwn(normalizedPatch, "user")) {
    normalizedPatch.user =
      normalizeUser(
        normalizedPatch.user
      );
  }

  if (hasOwn(normalizedPatch, "token")) {
    normalizedPatch.token =
      hasValidToken(
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

  if (hasOwn(normalizedPatch, "sidebarOpen")) {
    normalizedPatch.sidebarOpen =
      Boolean(
        normalizedPatch.sidebarOpen
      );
  }

  if (hasOwn(normalizedPatch, "loading")) {
    normalizedPatch.loading =
      Boolean(
        normalizedPatch.loading
      );
  }

  if (hasOwn(normalizedPatch, "booting")) {
    normalizedPatch.booting =
      Boolean(
        normalizedPatch.booting
      );
  }

  if (hasOwn(normalizedPatch, "ready")) {
    normalizedPatch.ready =
      Boolean(
        normalizedPatch.ready
      );
  }

  if (hasOwn(normalizedPatch, "initialized")) {
    normalizedPatch.initialized =
      Boolean(
        normalizedPatch.initialized
      );
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

  const shouldRecomputeAuth =
    hasOwn(normalizedPatch, "user") ||
    hasOwn(normalizedPatch, "token") ||
    hasOwn(normalizedPatch, "authenticated") ||
    hasOwn(normalizedPatch, "hasToken");

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

  normalizedPatch.currentResolvedUsername =
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

  normalizedPatch.resolvedUsername =
    normalizedPatch.currentResolvedUsername;

  normalizedPatch.updatedAt =
    safeIsoDate();

  normalizedPatch.stateChangeCount =
    safeNumber(
      state.stateChangeCount,
      0
    ) + 1;

  return normalizedPatch;
}

function shallowEqualPatch(state, patch = {}) {
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) {
      return false;
    }
  }

  return true;
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

  const previousState =
    cloneState(state);

  const normalizedPatch =
    normalizeStatePatch(
      state,
      patch
    );

  if (
    shallowEqualPatch(
      state,
      normalizedPatch
    )
  ) {
    return cloneState(state);
  }

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
          cloneState(
            normalizedPatch
          ),

        previousState,

        changedKeys:
          Object.keys(
            normalizedPatch
          ),
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

    loading:
      Boolean(state?.loading),

    route:
      state?.route || DEFAULT_ROUTE,

    publicPath:
      safeRedact(
        state?.publicPath || DEFAULT_ROUTE
      ),

    authenticated:
      Boolean(state?.authenticated),

    hasToken:
      Boolean(
        hasValidToken(state?.token)
      ),

    role:
      state?.role || null,

    username:
      state?.username || null,

    displayName:
      getUserDisplayName(state?.user) || null,

    avatarUrl:
      getUserAvatarUrl(state?.user) || null,

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    lang:
      state?.lang || "es",

    theme:
      state?.theme || "dark",

    sidebarOpen:
      typeof state?.sidebarOpen === "boolean"
        ? state.sidebarOpen
        : null,

    online:
      state?.online ?? null,

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

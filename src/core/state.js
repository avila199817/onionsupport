/* =========================================================
   Onion Support - Core State
   Archivo: /src/core/state.js

   Responsabilidad:
   - Estado mínimo en memoria.
   - Auth estricta: token + user usable.
   - User inválido sólo si disabled.
   - Roles únicos: admin / user.
   - Sin imports.
   - Sin storage.
   - Sin rutas técnicas.
   - Sin 2FA/MFA/OTP.
   - Sin network state.
   - Sin lógica rara.
========================================================= */

export const STATE_VERSION = "simple";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "en";
const DEFAULT_THEME = "system";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function cleanPath(path = DEFAULT_ROUTE) {
  let value = text(path, DEFAULT_ROUTE).split("?")[0].split("#")[0];

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "");

  return value || DEFAULT_ROUTE;
}

function publicPath(path = DEFAULT_ROUTE) {
  let value = text(path, DEFAULT_ROUTE);

  if (!value.startsWith("/")) value = `/${value}`;

  return value || DEFAULT_ROUTE;
}

function currentPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  return publicPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

function currentCanonicalPath() {
  return cleanPath(currentPublicPath());
}

function stripBearer(token = "") {
  return text(token, "").replace(/^Bearer\s+/i, "");
}

function validToken(token = "") {
  const clean = stripBearer(token);

  if (!clean) return false;
  if (/\s/.test(clean)) return false;

  return !["null", "undefined", "false", "true", "[object object]"].includes(
    clean.toLowerCase()
  );
}

function normalizeRole(value = "") {
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function normalizeUser(user = null) {
  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  const id = user.userId || user.id || null;
  const email = user.email || null;
  const username = user.username || user.slug || email || id || null;

  if (!id && !username && !email) return null;

  const name =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    username ||
    email ||
    id ||
    "Usuario";

  const role = normalizeRole(user.role || user.rol);

  return {
    ...user,

    id,
    userId: user.userId || id,

    username,
    usernameLower: username ? String(username).toLowerCase() : null,
    slug: user.slug || username,

    name,
    fullName: user.fullName || name,
    displayName: user.displayName || name,

    email,
    emailLower: email ? String(email).toLowerCase() : null,

    role,
    rol: role,
    roles: [role],

    active: true,
    disabled: false,
  };
}

function readUserFrom(source = {}) {
  return (
    source.user ||
    source.currentUser ||
    source.authUser ||
    source.sessionUser ||
    null
  );
}

function readTokenFrom(source = {}) {
  return (
    source.token ||
    source.accessToken ||
    source.access_token ||
    null
  );
}

export function computeAuthenticated(user = null, token = null) {
  return Boolean(validToken(token) && normalizeUser(user));
}

function authPatch(source = {}, options = {}) {
  if (options.forceUnauthenticated === true) {
    return clearAuthPatch();
  }

  const token = validToken(readTokenFrom(source))
    ? stripBearer(readTokenFrom(source))
    : null;

  if (!token) {
    return clearAuthPatch();
  }

  const user = normalizeUser(readUserFrom(source));

  if (!user) {
    return {
      ...clearAuthPatch(),
      token,
      accessToken: token,
      access_token: token,
      hasToken: true,
    };
  }

  const role = normalizeRole(user.role);

  return {
    token,
    accessToken: token,
    access_token: token,

    user,
    currentUser: user,
    authUser: user,
    sessionUser: user,

    hasToken: true,
    authenticated: true,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    username: user.username || null,

    isAdmin: role === "admin",
    isUser: role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function clearAuthPatch() {
  return {
    token: null,
    accessToken: null,
    access_token: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    hasToken: false,
    authenticated: false,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    username: null,

    isAdmin: false,
    isUser: false,
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function normalizePatch(state, patch = {}, options = {}) {
  const next = isObject(patch) ? { ...patch } : {};

  if ("route" in next || "canonicalPath" in next) {
    const route = cleanPath(next.route || next.canonicalPath || state.route || DEFAULT_ROUTE);
    next.route = route;
    next.canonicalPath = route;
  }

  if ("publicPath" in next) {
    next.publicPath = publicPath(next.publicPath || DEFAULT_ROUTE);
    next.route = cleanPath(next.publicPath);
    next.canonicalPath = next.route;
  }

  if ("lang" in next || "language" in next || "locale" in next) {
    const lang = ["ca", "es", "en"].includes(next.lang || next.language || next.locale)
      ? next.lang || next.language || next.locale
      : DEFAULT_LANG;

    next.lang = lang;
    next.language = lang;
    next.locale = lang;
  }

  if ("theme" in next) {
    next.theme = ["dark", "light", "system"].includes(next.theme)
      ? next.theme
      : DEFAULT_THEME;
  }

  if ("error" in next) {
    next.lastError = next.error;
    next.hasError = Boolean(next.error);
  }

  if ("lastError" in next) {
    next.error = next.lastError;
    next.hasError = Boolean(next.lastError);
  }

  if (next.hasError === false) {
    next.error = null;
    next.lastError = null;
  }

  const authKeys = [
    "token",
    "accessToken",
    "access_token",
    "user",
    "currentUser",
    "authUser",
    "sessionUser",
    "authenticated",
    "hasToken",
  ];

  if (options.forceUnauthenticated === true || authKeys.some((key) => key in next)) {
    Object.assign(next, authPatch({ ...state, ...next }, options));
  }

  return next;
}

function valuesEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function changedKeys(state, patch) {
  return Object.keys(patch).filter((key) => !valuesEqual(state[key], patch[key]));
}

function safeSnapshotUser(user = null) {
  if (!isObject(user)) return null;

  return {
    id: user.id || user.userId || null,
    userId: user.userId || user.id || null,
    username: user.username || null,
    displayName: user.name || user.fullName || user.displayName || user.username || null,
    fullName: user.name || user.fullName || user.displayName || null,
    role: normalizeRole(user.role || user.rol),
  };
}

/* =========================================================
   STATE FACTORY
========================================================= */

export function createInitialState() {
  const createdAt = nowIso();
  const route = currentCanonicalPath();
  const visiblePath = currentPublicPath();

  return {
    __version: STATE_VERSION,

    initialized: false,
    booting: false,
    ready: false,
    appReady: false,
    appFatal: false,
    loading: true,

    route,
    canonicalPath: route,
    publicPath: visiblePath,

    token: null,
    accessToken: null,
    access_token: null,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    hasToken: false,
    authenticated: false,

    role: null,
    rol: null,
    userRole: null,
    roles: [],

    username: null,

    isAdmin: false,
    isUser: false,
    isSupport: false,
    isManager: false,
    isClient: false,

    lang: isBrowser() ? document.documentElement.lang || DEFAULT_LANG : DEFAULT_LANG,
    language: isBrowser() ? document.documentElement.lang || DEFAULT_LANG : DEFAULT_LANG,
    locale: isBrowser()
      ? document.documentElement.dataset.locale || document.documentElement.lang || DEFAULT_LANG
      : DEFAULT_LANG,

    theme: isBrowser()
      ? document.documentElement.dataset.theme || DEFAULT_THEME
      : DEFAULT_THEME,

    sidebarOpen: true,

    shellVisible: true,
    shellHidden: false,
    chromeVisible: true,
    chromeHidden: false,
    appShellVisible: true,
    shellBusy: false,

    error: null,
    lastError: null,
    hasError: false,

    createdAt,
    updatedAt: createdAt,
    stateChangeCount: 0,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function cloneState(state = {}, options = {}) {
  const snapshot = clone(state) || {};

  const token = readTokenFrom(state);
  const user = readUserFrom(state);
  const authenticated = computeAuthenticated(user, token);
  const cleanToken = validToken(token) ? stripBearer(token) : null;

  snapshot.token = options.includeToken ? cleanToken : null;
  snapshot.accessToken = options.includeToken ? cleanToken : null;
  snapshot.access_token = options.includeToken ? cleanToken : null;

  snapshot.user = authenticated ? safeSnapshotUser(user) : null;
  snapshot.currentUser = authenticated ? safeSnapshotUser(user) : null;
  snapshot.authUser = authenticated ? safeSnapshotUser(user) : null;
  snapshot.sessionUser = authenticated ? safeSnapshotUser(user) : null;

  snapshot.hasToken = Boolean(cleanToken);
  snapshot.authenticated = authenticated;

  snapshot.role = authenticated ? normalizeRole(state.role || user?.role) : null;
  snapshot.rol = snapshot.role;
  snapshot.userRole = snapshot.role;
  snapshot.roles = authenticated ? [snapshot.role] : [];

  snapshot.isAdmin = authenticated && snapshot.role === "admin";
  snapshot.isUser = authenticated && snapshot.role === "user";
  snapshot.isSupport = false;
  snapshot.isManager = false;
  snapshot.isClient = false;

  return snapshot;
}

export function getState(state = {}, options = {}) {
  return cloneState(state, options);
}

export const getStateBase = getState;

/* =========================================================
   WRITE
========================================================= */

export function setStateBase(state, patch = {}, options = {}) {
  if (!isObject(state)) {
    throw new Error("Core state inválido.");
  }

  if (!isObject(patch)) {
    return cloneState(state);
  }

  const normalized = normalizePatch(state, patch, options);
  const keys = changedKeys(state, normalized);

  if (!keys.length) {
    return cloneState(state);
  }

  Object.assign(state, normalized, {
    updatedAt: nowIso(),
    stateChangeCount: Number(state.stateChangeCount || 0) + 1,
  });

  if (options.emitInternal === true && options.events?.emit) {
    options.events.emit("app:state:patched", {
      state: cloneState(state),
      changedKeys: [...keys, "updatedAt", "stateChangeCount"],
      source: options.source || "core:state",
    });
  }

  return cloneState(state);
}

export function setState({ state, events, patch = {}, options = {} } = {}) {
  return setStateBase(state, patch, {
    ...options,
    events,
  });
}

/* =========================================================
   DEBUG
========================================================= */

export function getStateDebugSnapshot(state = {}) {
  const token = readTokenFrom(state);
  const user = readUserFrom(state);
  const authenticated = computeAuthenticated(user, token);
  const role = authenticated ? normalizeRole(state.role || user?.role) : null;

  return {
    version: state.__version || STATE_VERSION,

    initialized: Boolean(state.initialized),
    booting: Boolean(state.booting),
    ready: Boolean(state.ready),
    appReady: Boolean(state.appReady),
    appFatal: Boolean(state.appFatal),
    loading: Boolean(state.loading),

    route: state.route || DEFAULT_ROUTE,
    canonicalPath: state.canonicalPath || state.route || DEFAULT_ROUTE,
    publicPath: state.publicPath || state.route || DEFAULT_ROUTE,

    authenticated,
    hasToken: validToken(token),

    role,
    roles: authenticated ? [role] : [],
    username: authenticated ? state.username || user?.username || null : null,

    isAdmin: authenticated && role === "admin",
    isUser: authenticated && role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,

    lang: state.lang || DEFAULT_LANG,
    theme: state.theme || DEFAULT_THEME,

    hasError: Boolean(state.hasError),
    error: state.error
      ? {
          name: state.error.name || "Error",
          message: state.error.message || String(state.error),
          code: state.error.code || null,
          status: state.error.status || state.error.statusCode || null,
        }
      : null,

    stateChangeCount: Number(state.stateChangeCount || 0),
    createdAt: state.createdAt || "",
    updatedAt: state.updatedAt || "",
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STATE_VERSION,

  createInitialState,

  cloneState,
  getState,
  getStateBase,

  setState,
  setStateBase,

  computeAuthenticated,

  getStateDebugSnapshot,
};

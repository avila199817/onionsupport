/* =========================================================
   Onion Support - Store State
   Archivo: /src/store/state.js

   Responsabilidad:
   - Estado inicial mínimo del Store.
   - Compat para imports antiguos.
   - Store NO es dueño de Auth.
   - Store NO es dueño de Router.
   - Store NO es dueño de HTTP.
   - Nunca guarda token real.
   - Roles únicos: admin / user.
   - User inválido sólo si disabled.
   - Sin rutas técnicas legacy.
   - Sin 2FA/MFA/OTP.
   - Sin recursos inventados.
========================================================= */

export const STORE_STATE_VERSION = "simple";

const APP_NAME = "Onion Support";
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
  if (value === undefined) return undefined;
  if (value === null) return null;

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

function usableUser(user = null) {
  if (!isObject(user)) return false;
  if (userDisabled(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function publicUser(user = null) {
  if (!usableUser(user)) return null;

  const id = user.userId || user.id || null;
  const username = user.username || user.slug || user.email || id || null;

  const displayName =
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    username ||
    user.email ||
    id ||
    "Usuario";

  const role = normalizeRole(user.role || user.rol);

  return {
    id,
    userId: user.userId || id,

    username,
    slug: user.slug || username,

    displayName,
    name: user.name || displayName,
    fullName: user.fullName || displayName,

    email: user.email || null,

    role,
    rol: role,
    roles: [role],

    avatar: user.avatar || user.avatarUrl || user.picture || null,
    avatarUrl: user.avatarUrl || user.avatar || user.picture || null,
    picture: user.picture || user.avatarUrl || user.avatar || null,
    hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),

    active: true,
    disabled: false,
  };
}

function readCoreState(AppCore = null) {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function readRoute(AppCore = null) {
  const state = readCoreState(AppCore);

  const visible = publicPath(state.publicPath || state.route || currentPublicPath());
  const canonical = cleanPath(state.canonicalPath || state.route || visible);

  return {
    route: canonical,
    canonicalPath: canonical,
    publicPath: visible,
  };
}

function readSession(AppCore = null) {
  const state = readCoreState(AppCore);

  const authenticated = Boolean(state.authenticated);
  const hasToken = Boolean(state.hasToken);
  const user = authenticated ? publicUser(state.user || state.currentUser) : null;

  if (!authenticated || !hasToken || !user) {
    return {
      authenticated: false,
      hasToken,
      user: null,
      role: null,
      roles: [],
      username: null,
      displayName: null,
      avatarUrl: null,
      isAdmin: false,
      isUser: false,
      isSupport: false,
      isManager: false,
      isClient: false,
    };
  }

  const role = normalizeRole(state.role || user.role);

  return {
    authenticated: true,
    hasToken: true,

    user,
    role,
    roles: [role],

    username: user.username || null,
    displayName: user.displayName || user.name || user.username || null,
    avatarUrl: user.avatarUrl || null,

    isAdmin: role === "admin",
    isUser: role === "user",
    isSupport: false,
    isManager: false,
    isClient: false,
  };
}

function readLang(AppCore = null) {
  const state = readCoreState(AppCore);

  const lang =
    state.lang ||
    state.language ||
    state.locale ||
    (isBrowser() ? document.documentElement.lang : "") ||
    DEFAULT_LANG;

  return ["ca", "es", "en"].includes(lang) ? lang : DEFAULT_LANG;
}

function readTheme(AppCore = null) {
  const state = readCoreState(AppCore);

  const theme =
    state.theme ||
    (isBrowser() ? document.documentElement.dataset.theme : "") ||
    DEFAULT_THEME;

  return ["dark", "light", "system"].includes(theme) ? theme : DEFAULT_THEME;
}

export function safeTitle() {
  if (!isBrowser()) return APP_NAME;

  return text(document.title, APP_NAME);
}

export function safeTopbarTitle() {
  if (!isBrowser()) return safeTitle();

  return (
    text(document.getElementById("topbar-title")?.textContent, "") ||
    safeTitle()
  );
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function buildInitialState(AppCore = null) {
  const route = readRoute(AppCore);
  const session = readSession(AppCore);
  const lang = readLang(AppCore);
  const theme = readTheme(AppCore);
  const now = nowIso();

  return {
    app: {
      ready: Boolean(AppCore?.state?.ready || AppCore?.state?.appReady),
      booted: Boolean(AppCore?.state?.booted || AppCore?.state?.initialized),
      initialized: Boolean(AppCore?.state?.initialized),
      booting: Boolean(AppCore?.state?.booting),
      loading: Boolean(AppCore?.state?.loading),
      fatal: Boolean(AppCore?.state?.fatal || AppCore?.state?.appFatal),

      route: route.route,
      canonicalPath: route.canonicalPath,
      publicPath: route.publicPath,

      lastError: AppCore?.state?.lastError || AppCore?.state?.error || null,
    },

    session: {
      authenticated: session.authenticated,
      hasToken: session.hasToken,

      token: null,
      accessToken: null,

      user: session.user,
      role: session.role,
      roles: session.roles,

      username: session.username,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,

      isAdmin: session.isAdmin,
      isUser: session.isUser,
      isSupport: false,
      isManager: false,
      isClient: false,
    },

    ui: {
      theme,
      themeMode: theme,
      themePreference: theme,

      lang,
      language: lang,
      locale: lang,

      sidebarOpen: AppCore?.state?.sidebarOpen !== false,
      shellVisible: AppCore?.state?.shellVisible !== false,
      chromeVisible: AppCore?.state?.chromeVisible !== false,

      pageTitle: safeTitle(),
      topbarTitle: safeTopbarTitle(),
    },

    entities: {},

    flags: {
      hydrating: false,
      hydrated: false,
      syncingCore: false,
      refreshing: false,
      saving: false,
    },

    meta: {
      version: STORE_STATE_VERSION,
      hydrated: false,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      source: "store:state",
    },
  };
}

/* =========================================================
   META
========================================================= */

export function touchMeta(state, extra = {}) {
  if (!isObject(state)) return false;

  if (!isObject(state.meta)) {
    state.meta = {};
  }

  state.meta.version = STORE_STATE_VERSION;
  state.meta.updatedAt = nowIso();
  state.meta.revision = Number(state.meta.revision || 0) + 1;

  if (isObject(extra)) {
    Object.assign(state.meta, clone(extra));
  }

  return true;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

export function shallowCloneRoot(state = {}) {
  const source = isObject(state) ? state : {};

  return {
    app: clone(source.app || {}),
    session: {
      ...(clone(source.session || {}) || {}),
      token: null,
      accessToken: null,
    },
    ui: clone(source.ui || {}),
    entities: clone(source.entities || {}),
    flags: clone(source.flags || {}),
    meta: clone(source.meta || {}),
  };
}

function sanitize(value, key = "") {
  if (/token|password|secret|authorization|cookie|jwt|refresh|access/i.test(key)) {
    return value ? "***" : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (isObject(value)) {
    const output = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = sanitize(childValue, childKey);
    }

    return output;
  }

  return value;
}

export function buildSafeSnapshot(state = {}) {
  return sanitize(shallowCloneRoot(state));
}

export default {
  STORE_STATE_VERSION,

  safeTitle,
  safeTopbarTitle,

  touchMeta,

  buildInitialState,
  shallowCloneRoot,
  buildSafeSnapshot,
};

/* =========================================================
   Onion Support - Core Session
   Archivo: /src/core/session.js

   Responsabilidad:
   - Compat mínima de sesión para Core.
   - Estado en memoria.
   - Auth estricta: token + user usable.
   - Token sin user = hasToken, pero NO authenticated.
   - User sin token = NO authenticated.
   - User inválido sólo si disabled.
   - Roles únicos: admin / user.
   - Theme simple.
   - Idiomas: ca / es / en.
   - Sin imports.
   - Sin storage.
   - Sin HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin rutas legacy.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

export const SESSION_VERSION = "simple";

export const SESSION_EVENTS = Object.freeze({
  routeChange: "app:route:change",
  publicPathChange: "app:public-path:change",
  userChange: "app:user:change",
  tokenChange: "app:token:change",
  authChange: "app:auth:change",
  sessionApplied: "app:session:applied",
  sessionLoaded: "app:session:loaded",
  sessionCleared: "app:session:cleared",
  themeChange: "app:theme:change",
  langChange: "app:lang:change",
  loadingChange: "app:loading:change",
  error: "app:error",
});

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "en";
const DEFAULT_THEME = "system";

const VALID_LANGS = new Set(["ca", "es", "en"]);
const VALID_THEMES = new Set(["dark", "light", "system"]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function emit(events, name, payload = {}) {
  if (!name) return false;

  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function commitState({ state, setState, patch = {}, options = {} } = {}) {
  if (!isObject(patch)) return false;

  if (isObject(state)) {
    Object.assign(state, patch);
  }

  if (isFunction(setState)) {
    try {
      setState(patch, options);
    } catch {
      // Compat mínima: nunca rompe.
    }
  }

  return true;
}

/* =========================================================
   PATHS
========================================================= */

function normalizePublicPath(value = DEFAULT_ROUTE) {
  let path = text(value, DEFAULT_ROUTE);

  if (path.startsWith("#/")) path = path.slice(1);
  if (path.startsWith("#!")) path = path.replace(/^#!\/?/, "/");

  if (!path.startsWith("/")) path = `/${path}`;

  return path || DEFAULT_ROUTE;
}

function normalizeCanonicalPath(value = DEFAULT_ROUTE) {
  let path = normalizePublicPath(value).split("?")[0].split("#")[0] || DEFAULT_ROUTE;

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "");
  }

  return path || DEFAULT_ROUTE;
}

/* =========================================================
   AUTH NORMALIZATION
========================================================= */

function stripBearer(token = "") {
  return text(token, "").replace(/^Bearer\s+/i, "");
}

function validToken(token = "") {
  const clean = stripBearer(token);

  if (!clean) return false;
  if (/\s/.test(clean)) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(clean.toLowerCase());
}

function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
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

function authPatch({ token = null, user = null } = {}) {
  const cleanToken = validToken(token) ? stripBearer(token) : null;
  const cleanUser = normalizeUser(user);

  const base = {
    token: cleanToken,
    accessToken: cleanToken,
    access_token: cleanToken,

    user: null,
    currentUser: null,
    authUser: null,
    sessionUser: null,

    hasToken: Boolean(cleanToken),
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

  if (!cleanToken || !cleanUser) {
    return base;
  }

  const role = normalizeRole(cleanUser.role || cleanUser.rol);

  return {
    ...base,

    user: cleanUser,
    currentUser: cleanUser,
    authUser: cleanUser,
    sessionUser: cleanUser,

    authenticated: true,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    username: cleanUser.username || null,

    isAdmin: role === "admin",
    isUser: role === "user",
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

function sessionSnapshot(state = {}, cause = "session") {
  return {
    version: SESSION_VERSION,
    cause,

    authenticated: Boolean(state.authenticated),
    hasToken: Boolean(state.hasToken),

    user: state.authenticated
      ? {
          id: state.user?.id || state.user?.userId || null,
          userId: state.user?.userId || state.user?.id || null,
          username: state.user?.username || null,
          displayName:
            state.user?.name ||
            state.user?.fullName ||
            state.user?.displayName ||
            state.user?.username ||
            null,
          role: state.role || null,
        }
      : null,

    role: state.role || null,
    username: state.username || null,

    route: state.route || DEFAULT_ROUTE,
    publicPath: state.publicPath || state.route || DEFAULT_ROUTE,

    theme: state.theme || DEFAULT_THEME,
    lang: state.lang || DEFAULT_LANG,
  };
}

/* =========================================================
   ROUTE
========================================================= */

export function setRoute({ state, setState, events, route = DEFAULT_ROUTE, options = {} } = {}) {
  const nextRoute = normalizeCanonicalPath(route);
  const previousRoute = state?.route || DEFAULT_ROUTE;

  commitState({
    state,
    setState,
    patch: {
      route: nextRoute,
      canonicalPath: nextRoute,
    },
    options: {
      ...options,
      source: options.source || "core-session:setRoute",
    },
  });

  if (previousRoute !== nextRoute) {
    emit(events, SESSION_EVENTS.routeChange, {
      route: nextRoute,
      previousRoute,
    });
  }

  return nextRoute;
}

export function setPublicPath({ state, setState, events, path = DEFAULT_ROUTE, options = {} } = {}) {
  const nextPublicPath = normalizePublicPath(path);
  const nextRoute = normalizeCanonicalPath(nextPublicPath);
  const previousPublicPath = state?.publicPath || DEFAULT_ROUTE;

  commitState({
    state,
    setState,
    patch: {
      publicPath: nextPublicPath,
      route: nextRoute,
      canonicalPath: nextRoute,
    },
    options: {
      ...options,
      source: options.source || "core-session:setPublicPath",
    },
  });

  if (previousPublicPath !== nextPublicPath) {
    emit(events, SESSION_EVENTS.publicPathChange, {
      publicPath: nextPublicPath,
      previousPublicPath,
      route: nextRoute,
    });
  }

  return nextPublicPath;
}

/* =========================================================
   USER / TOKEN
========================================================= */

export function setUser({ state, events, setState, user = null, options = {} } = {}) {
  const patch = authPatch({
    token: state?.token,
    user,
  });

  commitState({
    state,
    setState,
    patch,
    options: {
      ...options,
      source: options.source || "core-session:setUser",
      forceUnauthenticated: !patch.authenticated,
    },
  });

  emit(events, SESSION_EVENTS.userChange, sessionSnapshot(state, "setUser"));
  emit(events, SESSION_EVENTS.authChange, sessionSnapshot(state, "setUser"));

  return state?.user || null;
}

export function setToken({ state, events, setState, token = null, options = {} } = {}) {
  const patch = authPatch({
    token,
    user: state?.user,
  });

  commitState({
    state,
    setState,
    patch,
    options: {
      ...options,
      source: options.source || "core-session:setToken",
      forceUnauthenticated: !patch.authenticated,
    },
  });

  emit(events, SESSION_EVENTS.tokenChange, {
    hasToken: Boolean(state?.hasToken),
    authenticated: Boolean(state?.authenticated),
  });

  emit(events, SESSION_EVENTS.authChange, sessionSnapshot(state, "setToken"));

  return state?.token || null;
}

/* =========================================================
   APPLY / CLEAR SESSION
========================================================= */

export function applySession(input = {}) {
  const { state, events, setState } = input || {};

  const token =
    input.token ||
    input.accessToken ||
    input.access_token ||
    input.data?.token ||
    input.data?.accessToken ||
    input.data?.access_token ||
    input.auth?.token ||
    input.session?.token ||
    null;

  const user =
    input.user ||
    input.usuario ||
    input.me ||
    input.account ||
    input.profile ||
    input.data?.user ||
    input.auth?.user ||
    input.session?.user ||
    null;

  const patch = authPatch({
    token,
    user,
  });

  if (input.route || input.publicPath) {
    const visible = normalizePublicPath(input.publicPath || input.route || DEFAULT_ROUTE);
    patch.publicPath = visible;
    patch.route = normalizeCanonicalPath(visible);
    patch.canonicalPath = patch.route;
  }

  commitState({
    state,
    setState,
    patch,
    options: {
      source: input.options?.source || "core-session:applySession",
      forceUnauthenticated: !patch.authenticated,
    },
  });

  const snapshot = sessionSnapshot(state, "applySession");

  emit(events, SESSION_EVENTS.sessionApplied, snapshot);
  emit(events, SESSION_EVENTS.authChange, snapshot);

  return snapshot;
}

export function clearSession({ state, events, setState, options = {} } = {}) {
  const patch = authPatch({
    token: null,
    user: null,
  });

  commitState({
    state,
    setState,
    patch,
    options: {
      ...options,
      source: options.source || "core-session:clearSession",
      forceUnauthenticated: true,
    },
  });

  const snapshot = sessionSnapshot(state, "clearSession");

  emit(events, SESSION_EVENTS.sessionCleared, snapshot);
  emit(events, SESSION_EVENTS.authChange, snapshot);

  return true;
}

/* =========================================================
   LOAD
========================================================= */

export function loadPreferences({ state, setState } = {}) {
  const lang = isBrowser()
    ? document.documentElement.lang || DEFAULT_LANG
    : DEFAULT_LANG;

  const theme = isBrowser()
    ? document.documentElement.dataset.theme || DEFAULT_THEME
    : DEFAULT_THEME;

  const cleanLang = VALID_LANGS.has(lang) ? lang : DEFAULT_LANG;
  const cleanTheme = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;

  commitState({
    state,
    setState,
    patch: {
      lang: cleanLang,
      language: cleanLang,
      locale: cleanLang,
      theme: cleanTheme,
    },
    options: {
      source: "core-session:loadPreferences",
    },
  });

  return {
    lang: state?.lang || cleanLang,
    theme: state?.theme || cleanTheme,
  };
}

export function loadSession({ state, events, setState } = {}) {
  const patch = authPatch({
    token: state?.token,
    user: state?.user,
  });

  commitState({
    state,
    setState,
    patch,
    options: {
      source: "core-session:loadSession",
      forceUnauthenticated: !patch.authenticated,
    },
  });

  const snapshot = sessionSnapshot(state, "loadSession");

  emit(events, SESSION_EVENTS.sessionLoaded, snapshot);
  emit(events, SESSION_EVENTS.authChange, snapshot);

  return state;
}

/* =========================================================
   UI SETTERS
========================================================= */

export function syncThemeMetaColor({ theme = DEFAULT_THEME } = {}) {
  if (!isBrowser()) return false;

  const color = theme === "light" ? "#ffffff" : "#0a0c11";

  let changed = false;

  try {
    document
      .querySelectorAll("meta[name='theme-color']")
      .forEach((meta) => {
        const media = meta.getAttribute("media") || "";

        if (!media) {
          meta.setAttribute("content", color);
          changed = true;
        }
      });
  } catch {
    return false;
  }

  return changed;
}

export function setTheme({ setState, events, theme = DEFAULT_THEME } = {}) {
  const value = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;

  setState?.(
    {
      theme: value,
    },
    {
      source: "core-session:setTheme",
    }
  );

  if (isBrowser()) {
    document.documentElement.dataset.theme = value;
  }

  syncThemeMetaColor({ theme: value });

  emit(events, SESSION_EVENTS.themeChange, {
    theme: value,
  });

  return value;
}

export function setLang({ setState, events, lang = DEFAULT_LANG } = {}) {
  const value = VALID_LANGS.has(lang) ? lang : DEFAULT_LANG;

  setState?.(
    {
      lang: value,
      language: value,
      locale: value,
    },
    {
      source: "core-session:setLang",
    }
  );

  if (isBrowser()) {
    document.documentElement.lang = value;
    document.documentElement.dataset.locale = value;
  }

  emit(events, SESSION_EVENTS.langChange, {
    lang: value,
  });

  return value;
}

export function setSidebarOpen({ setState, value = false } = {}) {
  const open = Boolean(value);

  setState?.(
    {
      sidebarOpen: open,
    },
    {
      source: "core-session:setSidebarOpen",
    }
  );

  return open;
}

export function setLoading({ setState, events, value = false } = {}) {
  const loading = Boolean(value);

  setState?.(
    {
      loading,
    },
    {
      source: "core-session:setLoading",
    }
  );

  emit(events, SESSION_EVENTS.loadingChange, {
    loading,
  });

  return loading;
}

export function setError({ events, setState, error = null } = {}) {
  const normalized = error
    ? {
        name: error.name || "Error",
        message: error.message || String(error),
        code: error.code || error.status || error.statusCode || null,
      }
    : null;

  setState?.(
    {
      error: normalized,
      lastError: normalized,
      hasError: Boolean(normalized),
    },
    {
      source: "core-session:setError",
    }
  );

  emit(events, SESSION_EVENTS.error, {
    error: normalized,
  });

  return normalized;
}

/* =========================================================
   BASE UI / SNAPSHOT
========================================================= */

export function syncBaseUI({ setDocumentTitle, syncUserUI } = {}) {
  try {
    setDocumentTitle?.("Onion Support");
  } catch {
    // noop
  }

  try {
    syncUserUI?.();
  } catch {
    // noop
  }

  return true;
}

export function getSessionDebugSnapshot(state = {}) {
  return sessionSnapshot(state, "debug");
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SESSION_VERSION,
  SESSION_EVENTS,

  setRoute,
  setPublicPath,

  setUser,
  setToken,

  applySession,
  clearSession,

  loadPreferences,
  loadSession,

  syncThemeMetaColor,

  setTheme,
  setLang,
  setSidebarOpen,
  setLoading,
  setError,

  syncBaseUI,
  getSessionDebugSnapshot,
};

/* =========================================================
   Onion SPA - Core Session
   Archivo: src/core/session.js

   RESPONSABILIDADES:
   - cargar preferencias persistidas
   - cargar sesión persistida
   - sincronizar route/publicPath
   - aplicar usuario/token
   - limpiar sesión local
   - mantener auth consistente
   - preservar currentResolvedUsername cuando procede
   - sincronizar UI base

   HARDENING PRO:
   - zero ghost auth
   - persistencia robusta
   - setters idempotentes
   - sync UI estable
   - eventos consistentes
   - no emitir token real en eventos/snapshots
   - preserve currentResolvedUsername
   - route/publicPath sync sin degradar contexto
   - canonical sin query/hash
   - publicPath con query/hash
========================================================= */

import { config } from "./config.js";

import {
  normalizePath,
  normalizePublicPath,
  normalizeCanonicalPath,
  normalizeUser,
  hasValidToken,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  getThemeColor,
  sanitizeUsername,
  safeText,
  redactTokenInText,
} from "./helpers.js";

import {
  computeAuthenticated,
} from "./state.js";

import {
  removeLegacySessionKeys,
} from "./storage.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE =
  "/";

const VALID_THEMES =
  Object.freeze([
    "dark",
    "light",
  ]);

const VALID_LANG_RE =
  /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

const SESSION_EVENTS =
  Object.freeze({
    routeChange:
      "app:route:change",

    publicPathChange:
      "app:public-path:change",

    userChange:
      "app:user:change",

    tokenChange:
      "app:token:change",

    sessionState:
      "app:session:state",

    sessionApplied:
      "app:session:applied",

    sessionLoaded:
      "app:session:loaded",

    sessionCleared:
      "app:session:cleared",

    themeChange:
      "app:theme:change",

    langChange:
      "app:lang:change",

    sidebarChange:
      "app:sidebar:change",

    loadingChange:
      "app:loading:change",

    error:
      "app:error",
  });

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function localSafeText(value, fallback = "") {
  try {
    if (typeof safeText === "function") {
      return safeText(value, fallback);
    }
  } catch {}

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

  return Boolean(fallback);
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeEmit(events, name, payload = {}) {
  try {
    events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeSetState(setState, patch = {}) {
  if (!isFunction(setState)) {
    return false;
  }

  try {
    setState(
      safeObject(patch)
    );

    return true;
  } catch {}

  return false;
}

function safeStorageGet(storage, key, fallback = null) {
  try {
    return storage?.get?.(
      key,
      fallback
    );
  } catch {
    return fallback;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage?.set?.(
      key,
      value
    );

    return true;
  } catch {}

  return false;
}

function safeStorageRemove(storage, key) {
  try {
    if (isFunction(storage?.remove)) {
      storage.remove(key);
      return true;
    }

    if (isFunction(storage?.delete)) {
      storage.delete(key);
      return true;
    }

    if (isFunction(storage?.del)) {
      storage.del(key);
      return true;
    }
  } catch {}

  return false;
}

function safeCloneError(cloneError, error = null) {
  try {
    if (isFunction(cloneError)) {
      return cloneError(error);
    }
  } catch {}

  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name:
        error.name,
      message:
        error.message,
      stack:
        error.stack || null,
    };
  }

  return error;
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return localSafeText(value, "");
  }
}

/* =========================================================
   AUTH DERIVED STATE
========================================================= */

function resolveRole(user = null) {
  return localSafeText(
    user?.role ||
      user?.rol ||
      user?.type ||
      user?.userType ||
      user?.user_type ||
      "",
    ""
  ).toLowerCase() || null;
}

function resolveResolvedUsername(state = {}, user = null) {
  const candidate =
    sanitizeUsername(
      state?.currentResolvedUsername ||
        state?.resolvedUsername ||
        getUserUsername(user) ||
        getUserUsername(state?.user) ||
        ""
    );

  return candidate || null;
}

function hasUsableUser(user = null) {
  if (!user || !isObject(user)) {
    return false;
  }

  return Boolean(
    localSafeText(user.id, "") ||
    localSafeText(user.userId, "") ||
    localSafeText(user.username, "") ||
    localSafeText(user.email, "") ||
    localSafeText(user.name, "")
  );
}

function computeAuthSafe(user = null, token = null) {
  try {
    return Boolean(
      computeAuthenticated(
        user,
        token
      )
    );
  } catch {}

  return Boolean(
    hasUsableUser(user) &&
    hasValidToken(token)
  );
}

function syncAuthState(state, options = {}) {
  if (!state || !isObject(state)) {
    return state;
  }

  const forceUnauthenticated =
    options.forceUnauthenticated === true;

  const authenticated =
    forceUnauthenticated
      ? false
      : computeAuthSafe(
          state.user,
          state.token
        );

  state.authenticated =
    authenticated;

  state.hasToken =
    hasValidToken(
      state.token
    );

  state.role =
    authenticated
      ? resolveRole(state.user)
      : null;

  state.username =
    authenticated
      ? getUserUsername(state.user) || null
      : null;

  if (!authenticated) {
    state.currentResolvedUsername =
      null;
  } else {
    state.currentResolvedUsername =
      resolveResolvedUsername(
        state,
        state.user
      );
  }

  return state;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setAriaExpanded(el, value) {
  if (!el) {
    return false;
  }

  try {
    el.setAttribute(
      "aria-expanded",
      String(Boolean(value))
    );

    return true;
  } catch {}

  return false;
}

function toggleClass(el, className, force) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.toggle(
      className,
      Boolean(force)
    );

    return true;
  } catch {}

  return false;
}

function setAttribute(el, name, value) {
  if (
    !el ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
    ) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {}

  return false;
}

function hasOwn(obj, key) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

/* =========================================================
   THEME / LANG
========================================================= */

function normalizeTheme(theme = config.defaultTheme) {
  const value =
    localSafeText(
      theme,
      config.defaultTheme || "dark"
    ).toLowerCase();

  return VALID_THEMES.includes(value)
    ? value
    : "dark";
}

function normalizeLang(lang = config.defaultLang) {
  const value =
    localSafeText(
      lang,
      config.defaultLang || "es"
    ).toLowerCase();

  return VALID_LANG_RE.test(value)
    ? value
    : config.defaultLang || "es";
}

function resolveThemeFromUser(user = null) {
  if (!user || !isObject(user)) {
    return null;
  }

  const explicitTheme =
    localSafeText(
      user.theme ??
        user?.preferences?.theme ??
        user?.settings?.theme ??
        user?.raw?.theme ??
        user?.raw?.preferences?.theme ??
        user?.raw?.settings?.theme ??
        "",
      ""
    ).toLowerCase();

  if (VALID_THEMES.includes(explicitTheme)) {
    return explicitTheme;
  }

  const candidates = [
    user.darkMode,
    user.dark_mode,
    user?.raw?.darkMode,
    user?.raw?.dark_mode,
    user?.preferences?.darkMode,
    user?.preferences?.dark_mode,
    user?.settings?.darkMode,
    user?.settings?.dark_mode,
    user?.raw?.preferences?.darkMode,
    user?.raw?.preferences?.dark_mode,
    user?.raw?.settings?.darkMode,
    user?.raw?.settings?.dark_mode,
  ];

  const hasExplicitDarkMode =
    hasOwn(user, "darkMode") ||
    hasOwn(user, "dark_mode") ||
    hasOwn(user?.raw, "darkMode") ||
    hasOwn(user?.raw, "dark_mode") ||
    hasOwn(user?.preferences, "darkMode") ||
    hasOwn(user?.preferences, "dark_mode") ||
    hasOwn(user?.settings, "darkMode") ||
    hasOwn(user?.settings, "dark_mode") ||
    hasOwn(user?.raw?.preferences, "darkMode") ||
    hasOwn(user?.raw?.preferences, "dark_mode") ||
    hasOwn(user?.raw?.settings, "darkMode") ||
    hasOwn(user?.raw?.settings, "dark_mode");

  if (hasExplicitDarkMode) {
    const darkValue =
      candidates.find((item) =>
        typeof item === "boolean"
      );

    if (typeof darkValue === "boolean") {
      return darkValue
        ? "dark"
        : "light";
    }
  }

  return null;
}

/* =========================================================
   SNAPSHOTS / FINGERPRINTS
========================================================= */

function createSessionSnapshot(state, cause = "unknown") {
  return {
    authenticated:
      Boolean(state?.authenticated),

    hasToken:
      Boolean(
        hasValidToken(state?.token)
      ),

    token:
      null,

    user:
      state?.user || null,

    role:
      state?.role || null,

    username:
      getUserUsername(state?.user) || null,

    displayName:
      getUserDisplayName(state?.user) || null,

    avatarUrl:
      getUserAvatarUrl(state?.user) || null,

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    route:
      state?.route || DEFAULT_ROUTE,

    publicPath:
      state?.publicPath ||
      state?.route ||
      DEFAULT_ROUTE,

    cause,

    changedAt:
      new Date().toISOString(),
  };
}

function userFingerprint(user = null) {
  if (!user) {
    return "";
  }

  const normalized =
    normalizeUser(user);

  try {
    return JSON.stringify({
      id:
        normalized?.id ||
        normalized?.userId ||
        null,

      username:
        normalized?.username || null,

      email:
        normalized?.email || null,

      role:
        normalized?.role ||
        normalized?.rol ||
        null,

      avatar:
        normalized?.avatar ||
        normalized?.avatarUrl ||
        null,

      avatarUpdatedAt:
        normalized?.avatarUpdatedAt ||
        null,

      active:
        normalized?.active ?? null,
    });
  } catch {
    return String(user);
  }
}

function syncRouteFields({
  state,
  setState,
  route,
  publicPath,
} = {}) {
  if (!state) {
    return {
      route:
        DEFAULT_ROUTE,
      publicPath:
        DEFAULT_ROUTE,
      currentResolvedUsername:
        null,
    };
  }

  const nextCanonical =
    normalizeCanonicalPath(
      route ||
        state?.route ||
        DEFAULT_ROUTE
    );

  const nextPublicPath =
    normalizePublicPath
      ? normalizePublicPath(
          publicPath ||
            state?.publicPath ||
            nextCanonical
        )
      : normalizePath(
          publicPath ||
            state?.publicPath ||
            nextCanonical
        );

  const resolvedUsername =
    state.authenticated
      ? resolveResolvedUsername(
          state,
          state.user
        )
      : null;

  safeSetState(
    setState,
    {
      route:
        nextCanonical,

      publicPath:
        nextPublicPath,

      currentResolvedUsername:
        resolvedUsername,
    }
  );

  state.route =
    nextCanonical;

  state.publicPath =
    nextPublicPath;

  state.currentResolvedUsername =
    resolvedUsername;

  return {
    route:
      nextCanonical,

    publicPath:
      nextPublicPath,

    currentResolvedUsername:
      resolvedUsername,
  };
}

/* =========================================================
   ROUTE
========================================================= */

export function setRoute({
  state,
  setState,
  events,
  route = DEFAULT_ROUTE,
} = {}) {
  const previousRoute =
    state?.route || DEFAULT_ROUTE;

  const normalized =
    normalizeCanonicalPath(
      route || DEFAULT_ROUTE
    );

  if (
    previousRoute === normalized
  ) {
    return normalized;
  }

  safeSetState(
    setState,
    {
      lastRoute:
        previousRoute,

      route:
        normalized,
    }
  );

  if (state) {
    state.lastRoute =
      previousRoute;

    state.route =
      normalized;
  }

  safeEmit(
    events,
    SESSION_EVENTS.routeChange,
    {
      route:
        normalized,

      previousRoute,

      publicPath:
        state?.publicPath || normalized,
    }
  );

  return normalized;
}

export function setPublicPath({
  state,
  storage,
  setState,
  events,
  path = DEFAULT_ROUTE,
} = {}) {
  const previousPublicPath =
    state?.publicPath || DEFAULT_ROUTE;

  const normalized =
    normalizePublicPath
      ? normalizePublicPath(path || DEFAULT_ROUTE)
      : normalizePath(path || DEFAULT_ROUTE);

  if (
    previousPublicPath === normalized
  ) {
    return normalized;
  }

  safeSetState(
    setState,
    {
      publicPath:
        normalized,
    }
  );

  if (state) {
    state.publicPath =
      normalized;
  }

  safeStorageSet(
    storage,
    config.storageKeys.lastPublicPath,
    normalized
  );

  safeEmit(
    events,
    SESSION_EVENTS.publicPathChange,
    {
      publicPath:
        safeRedact(normalized),

      previousPublicPath:
        safeRedact(previousPublicPath),

      route:
        state?.route || DEFAULT_ROUTE,
    }
  );

  return normalized;
}

/* =========================================================
   USER / TOKEN
========================================================= */

export function setUser({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  user = null,
} = {}) {
  const normalizedUser =
    normalizeUser(user);

  const previousUserFingerprint =
    userFingerprint(
      state?.user
    );

  const nextUserFingerprint =
    userFingerprint(
      normalizedUser
    );

  if (
    previousUserFingerprint === nextUserFingerprint
  ) {
    return normalizedUser;
  }

  safeSetState(
    setState,
    {
      user:
        normalizedUser,
    }
  );

  if (state) {
    state.user =
      normalizedUser;
  }

  syncAuthState(state);

  safeSetState(
    setState,
    {
      role:
        state?.role || null,

      authenticated:
        Boolean(state?.authenticated),

      hasToken:
        Boolean(state?.hasToken),

      username:
        state?.username || null,

      currentResolvedUsername:
        state?.currentResolvedUsername || null,
    }
  );

  if (normalizedUser) {
    safeStorageSet(
      storage,
      config.storageKeys.user,
      normalizedUser
    );
  } else {
    safeStorageRemove(
      storage,
      config.storageKeys.user
    );
  }

  try {
    syncUserUI?.();
  } catch {}

  safeEmit(
    events,
    SESSION_EVENTS.userChange,
    {
      user:
        normalizedUser,

      authenticated:
        Boolean(state?.authenticated),

      hasToken:
        Boolean(state?.hasToken),

      username:
        normalizedUser?.username || null,

      displayName:
        getUserDisplayName(normalizedUser),

      currentResolvedUsername:
        state?.currentResolvedUsername || null,

      avatarUrl:
        getUserAvatarUrl(normalizedUser) || null,
    }
  );

  safeEmit(
    events,
    SESSION_EVENTS.sessionState,
    createSessionSnapshot(
      state,
      "setUser"
    )
  );

  return normalizedUser;
}

export function setToken({
  state,
  storage,
  events,
  setState,
  token = null,
} = {}) {
  const normalized =
    hasValidToken(token)
      ? String(token).trim()
      : null;

  if (
    state?.token === normalized
  ) {
    return normalized;
  }

  safeSetState(
    setState,
    {
      token:
        normalized,
    }
  );

  if (state) {
    state.token =
      normalized;
  }

  syncAuthState(
    state,
    {
      forceUnauthenticated:
        !normalized,
    }
  );

  safeSetState(
    setState,
    {
      role:
        state?.role || null,

      authenticated:
        Boolean(state?.authenticated),

      hasToken:
        Boolean(state?.hasToken),

      username:
        state?.username || null,

      currentResolvedUsername:
        state?.currentResolvedUsername || null,
    }
  );

  if (normalized) {
    safeStorageSet(
      storage,
      config.storageKeys.token,
      normalized
    );
  } else {
    safeStorageRemove(
      storage,
      config.storageKeys.token
    );
  }

  safeEmit(
    events,
    SESSION_EVENTS.tokenChange,
    {
      token:
        null,

      hasToken:
        Boolean(normalized),

      authenticated:
        Boolean(state?.authenticated),

      currentResolvedUsername:
        state?.currentResolvedUsername || null,
    }
  );

  safeEmit(
    events,
    SESSION_EVENTS.sessionState,
    createSessionSnapshot(
      state,
      "setToken"
    )
  );

  return normalized;
}

/* =========================================================
   APPLY SESSION
========================================================= */

function callFlexibleSetter(fn, objectArg, directValue, key) {
  if (!isFunction(fn)) {
    return null;
  }

  try {
    return fn(objectArg);
  } catch {}

  try {
    return fn(directValue);
  } catch {}

  try {
    return fn({
      [key]:
        directValue,
    });
  } catch {}

  return null;
}

export function applySession({
  state,
  events,
  setUser,
  setToken,
  setState,
  token = undefined,
  user = undefined,
  route = undefined,
  publicPath = undefined,
} = {}) {
  if (token !== undefined) {
    callFlexibleSetter(
      setToken,
      {
        token,
      },
      token,
      "token"
    );
  }

  if (user !== undefined) {
    callFlexibleSetter(
      setUser,
      {
        user,
      },
      user,
      "user"
    );
  }

  syncAuthState(
    state,
    {
      forceUnauthenticated:
        token === null
    }
  );

  if (isFunction(setState)) {
    syncRouteFields({
      state,
      setState,
      route,
      publicPath,
    });
  }

  const snapshot = {
    ...createSessionSnapshot(
      state,
      "applySession"
    ),

    route:
      state?.route || DEFAULT_ROUTE,

    publicPath:
      safeRedact(
        state?.publicPath ||
          state?.route ||
          DEFAULT_ROUTE
      ),
  };

  safeEmit(
    events,
    SESSION_EVENTS.sessionApplied,
    snapshot
  );

  safeEmit(
    events,
    SESSION_EVENTS.sessionState,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   CLEAR SESSION
========================================================= */

export function clearSession({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  utils,
  options = {},
} = {}) {
  const opts =
    safeObject(options);

  safeStorageRemove(
    storage,
    config.storageKeys.user
  );

  safeStorageRemove(
    storage,
    config.storageKeys.token
  );

  safeStorageRemove(
    storage,
    config.storageKeys.refreshToken
  );

  safeStorageRemove(
    storage,
    config.storageKeys.tempToken
  );

  safeStorageRemove(
    storage,
    config.storageKeys.sessionId
  );

  safeStorageRemove(
    storage,
    config.storageKeys.sessionUserId
  );

  try {
    removeLegacySessionKeys(
      utils
    );
  } catch {}

  safeSetState(
    setState,
    {
      user:
        null,

      token:
        null,

      role:
        null,

      username:
        null,

      authenticated:
        false,

      hasToken:
        false,

      currentResolvedUsername:
        null,

      resolvedUsername:
        null,
    }
  );

  if (state) {
    state.user =
      null;

    state.token =
      null;

    state.role =
      null;

    state.username =
      null;

    state.authenticated =
      false;

    state.hasToken =
      false;

    state.currentResolvedUsername =
      null;

    state.resolvedUsername =
      null;
  }

  syncAuthState(
    state,
    {
      forceUnauthenticated:
        true,
    }
  );

  try {
    syncUserUI?.();
  } catch {}

  const payload = {
    authenticated:
      false,

    hasToken:
      false,

    token:
      null,

    user:
      null,

    role:
      null,

    username:
      null,

    currentResolvedUsername:
      null,

    silent:
      Boolean(opts.silent),

    reason:
      opts.reason || "clearSession",
  };

  safeEmit(
    events,
    SESSION_EVENTS.sessionCleared,
    payload
  );

  safeEmit(
    events,
    SESSION_EVENTS.sessionState,
    createSessionSnapshot(
      state,
      "clearSession"
    )
  );

  return true;
}

/* =========================================================
   PREFS LOAD
========================================================= */

export function syncThemeMetaColor({
  dom,
  theme = config.defaultTheme,
} = {}) {
  if (!dom?.themeColorMeta) {
    return false;
  }

  try {
    dom.themeColorMeta.setAttribute(
      "content",
      getThemeColor(theme)
    );

    return true;
  } catch {}

  return false;
}

export function loadPreferences({
  state,
  storage,
  dom,
} = {}) {
  const savedTheme =
    safeStorageGet(
      storage,
      config.storageKeys.theme,
      config.defaultTheme
    );

  const savedLang =
    safeStorageGet(
      storage,
      config.storageKeys.lang,
      config.defaultLang
    );

  const theme =
    normalizeTheme(savedTheme);

  const lang =
    normalizeLang(savedLang);

  if (state) {
    state.theme =
      theme;

    state.lang =
      lang;

    /*
      Regla UX:
      estado natural por defecto = abierto.
      Evitamos arrancar colapsado por residuos legacy de storage.
    */
    state.sidebarOpen =
      true;
  }

  setAttribute(
    dom?.html,
    "data-theme",
    theme
  );

  setAttribute(
    dom?.html,
    "lang",
    lang
  );

  syncThemeMetaColor({
    dom,
    theme,
  });

  toggleClass(
    dom?.body,
    "sidebar-open",
    true
  );

  toggleClass(
    dom?.body,
    "sidebar-collapsed",
    false
  );

  toggleClass(
    dom?.sidebar,
    "open",
    true
  );

  toggleClass(
    dom?.sidebar,
    "collapsed",
    false
  );

  toggleClass(
    dom?.sidebar,
    "is-open",
    true
  );

  toggleClass(
    dom?.sidebar,
    "is-collapsed",
    false
  );

  setAriaExpanded(
    dom?.sidebarToggle,
    true
  );

  setAriaExpanded(
    dom?.sidebarMobileToggle,
    true
  );

  return {
    theme,
    lang,
    sidebarOpen:
      true,
  };
}

/* =========================================================
   SESSION LOAD
========================================================= */

export function loadSession({
  state,
  storage,
  dom,
  events,
} = {}) {
  const savedUser =
    normalizeUser(
      safeStorageGet(
        storage,
        config.storageKeys.user,
        null
      )
    );

  const savedTokenRaw =
    safeStorageGet(
      storage,
      config.storageKeys.token,
      null
    );

  const savedToken =
    hasValidToken(savedTokenRaw)
      ? String(savedTokenRaw).trim()
      : null;

  if (state) {
    state.user =
      savedUser;

    state.token =
      savedToken;
  }

  syncAuthState(
    state,
    {
      forceUnauthenticated:
        !savedToken,
    }
  );

  if (state) {
    state.currentResolvedUsername =
      state.authenticated
        ? resolveResolvedUsername(
            state,
            savedUser
          )
        : null;
  }

  const userTheme =
    resolveThemeFromUser(
      savedUser
    );

  if (
    userTheme === "light" ||
    userTheme === "dark"
  ) {
    if (state) {
      state.theme =
        userTheme;
    }

    safeStorageSet(
      storage,
      config.storageKeys.theme,
      userTheme
    );

    setAttribute(
      dom?.html,
      "data-theme",
      userTheme
    );

    syncThemeMetaColor({
      dom,
      theme:
        userTheme,
    });
  }

  safeEmit(
    events,
    SESSION_EVENTS.sessionLoaded,
    createSessionSnapshot(
      state,
      "loadSession"
    )
  );

  return state;
}

/* =========================================================
   UI SETTERS
========================================================= */

export function setTheme({
  dom,
  storage,
  events,
  setState,
  theme = config.defaultTheme,
} = {}) {
  const normalized =
    normalizeTheme(theme);

  safeSetState(
    setState,
    {
      theme:
        normalized,
    }
  );

  safeStorageSet(
    storage,
    config.storageKeys.theme,
    normalized
  );

  setAttribute(
    dom?.html,
    "data-theme",
    normalized
  );

  syncThemeMetaColor({
    dom,
    theme:
      normalized,
  });

  safeEmit(
    events,
    SESSION_EVENTS.themeChange,
    {
      theme:
        normalized,
    }
  );

  return normalized;
}

export function setLang({
  dom,
  storage,
  events,
  setState,
  lang = config.defaultLang,
} = {}) {
  const normalized =
    normalizeLang(lang);

  safeSetState(
    setState,
    {
      lang:
        normalized,
    }
  );

  safeStorageSet(
    storage,
    config.storageKeys.lang,
    normalized
  );

  setAttribute(
    dom?.html,
    "lang",
    normalized
  );

  safeEmit(
    events,
    SESSION_EVENTS.langChange,
    {
      lang:
        normalized,
    }
  );

  return normalized;
}

export function setSidebarOpen({
  dom,
  storage,
  events,
  setState,
  value,
} = {}) {
  const next =
    Boolean(value);

  safeSetState(
    setState,
    {
      sidebarOpen:
        next,
    }
  );

  safeStorageSet(
    storage,
    config.storageKeys.sidebarOpen,
    next
  );

  safeStorageSet(
    storage,
    "sidebar-collapsed",
    !next
  );

  toggleClass(
    dom?.body,
    "sidebar-open",
    next
  );

  toggleClass(
    dom?.body,
    "sidebar-collapsed",
    !next
  );

  toggleClass(
    dom?.sidebar,
    "open",
    next
  );

  toggleClass(
    dom?.sidebar,
    "collapsed",
    !next
  );

  toggleClass(
    dom?.sidebar,
    "is-open",
    next
  );

  toggleClass(
    dom?.sidebar,
    "is-collapsed",
    !next
  );

  setAriaExpanded(
    dom?.sidebarToggle,
    next
  );

  setAriaExpanded(
    dom?.sidebarMobileToggle,
    next
  );

  safeEmit(
    events,
    SESSION_EVENTS.sidebarChange,
    {
      open:
        next,
    }
  );

  return next;
}

export function setLoading({
  dom,
  events,
  setState,
  value,
} = {}) {
  const next =
    Boolean(value);

  safeSetState(
    setState,
    {
      loading:
        next,
    }
  );

  toggleClass(
    dom?.body,
    "loading",
    next
  );

  toggleClass(
    dom?.body,
    "app-loading",
    next
  );

  if (dom?.loader) {
    try {
      dom.loader.hidden =
        !next;
    } catch {}

    setAttribute(
      dom.loader,
      "aria-hidden",
      String(!next)
    );

    try {
      dom.loader.dataset.loaderVisible =
        next ? "true" : "false";
    } catch {}
  }

  safeEmit(
    events,
    SESSION_EVENTS.loadingChange,
    {
      loading:
        next,
    }
  );

  return next;
}

export function setError({
  events,
  setState,
  cloneError,
  error = null,
} = {}) {
  const normalized =
    error
      ? safeCloneError(
          cloneError,
          error
        ) || error
      : null;

  safeSetState(
    setState,
    {
      lastError:
        normalized,

      error:
        normalized,

      hasError:
        Boolean(normalized),
    }
  );

  safeEmit(
    events,
    SESSION_EVENTS.error,
    {
      error:
        normalized,
    }
  );

  return normalized;
}

/* =========================================================
   BASE UI
========================================================= */

export function syncBaseUI({
  setDocumentTitle,
  syncUserUI,
} = {}) {
  try {
    setDocumentTitle?.(
      config.appName
    );
  } catch {}

  try {
    syncUserUI?.();
  } catch {}

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionDebugSnapshot(state) {
  return {
    authenticated:
      Boolean(state?.authenticated),

    hasToken:
      Boolean(
        hasValidToken(state?.token)
      ),

    token:
      null,

    role:
      state?.role || null,

    username:
      getUserUsername(state?.user) || null,

    displayName:
      getUserDisplayName(state?.user) || null,

    avatarUrl:
      getUserAvatarUrl(state?.user) || null,

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    route:
      state?.route || DEFAULT_ROUTE,

    publicPath:
      safeRedact(
        state?.publicPath || null
      ),

    theme:
      state?.theme || config.defaultTheme,

    lang:
      state?.lang || config.defaultLang,

    sidebarOpen:
      typeof state?.sidebarOpen === "boolean"
        ? state.sidebarOpen
        : null,
  };
}

export default {
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

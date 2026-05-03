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

   HARDENING EXTREMO:
   - zero ghost auth
   - persistencia robusta
   - setters idempotentes
   - sync UI estable
   - eventos consistentes
   - no emitir token real en eventos/snapshots
   - no pintar usuario antiguo si no hay token válido
   - preserve currentResolvedUsername
   - route/publicPath sync sin degradar contexto
   - canonical sin query/hash
   - publicPath con query/hash
   - auth alineada con state.computeAuthenticated()
   - una sola mutación lógica por setter
   - no dobles setState innecesarios
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

    authChange:
      "app:auth:change",

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

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer/i;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function localSafeText(value, fallback = "") {
  try {
    if (typeof safeText === "function") {
      return safeText(
        value,
        fallback
      );
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
  if (value === "true") return true;
  if (value === "false") return false;

  return Boolean(fallback);
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeNowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
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

function safeSetState(setState, patch = {}, options = undefined) {
  if (!isFunction(setState)) {
    return false;
  }

  try {
    if (options !== undefined) {
      setState(
        safeObject(patch),
        options
      );
    } else {
      setState(
        safeObject(patch)
      );
    }

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

function safeHasValidToken(token = null) {
  try {
    return Boolean(
      hasValidToken(token)
    );
  } catch {
    return Boolean(
      localSafeText(token, "")
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

function safeSanitizeUsername(value = "") {
  try {
    return sanitizeUsername(value) || null;
  } catch {
    return null;
  }
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
   REDACTION / SNAPSHOT SAFETY
========================================================= */

function sanitizeForEvent(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(localSafeText(keyHint, ""))) {
    return null;
  }

  if (depth > 3) {
    return "[depth-limit]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string"
      ? safeRedact(value)
      : value;
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) =>
        sanitizeForEvent(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isPlainObject(value)) {
    const output =
      {};

    for (const [key, item] of Object.entries(value)) {
      output[key] =
        SENSITIVE_KEY_RE.test(key)
          ? null
          : sanitizeForEvent(
              item,
              depth + 1,
              key
            );
    }

    return output;
  }

  try {
    return safeRedact(
      String(value)
    );
  } catch {
    return "[unserializable]";
  }
}

function createUserSnapshot(user = null) {
  if (!user || !isObject(user)) {
    return null;
  }

  const normalized =
    safeNormalizeUser(user);

  return sanitizeForEvent(
    normalized
  );
}

/* =========================================================
   PATH HELPERS
========================================================= */

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

function extractUsernameFromPublicPath(publicPath = DEFAULT_ROUTE) {
  const match =
    String(publicPath || "")
      .match(/^\/@([^/]+)(?:\/|$)/i);

  return safeSanitizeUsername(
    match?.[1] || ""
  );
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
      user?.profile?.role ||
      user?.raw?.role ||
      user?.raw?.rol ||
      "",
    ""
  ).toLowerCase() || null;
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

  /*
    Fallback alineado con state.js:
    token válido requerido.
    Si hay usuario y está desactivado, no autentica.
  */
  if (!safeHasValidToken(token)) {
    return false;
  }

  if (
    user &&
    isObject(user) &&
    user.active === false
  ) {
    return false;
  }

  return true;
}

function resolveResolvedUsername({
  state = {},
  user = null,
  publicPath = "",
  authenticated = false,
} = {}) {
  if (!authenticated) {
    return null;
  }

  const fromPath =
    extractUsernameFromPublicPath(
      publicPath ||
        state?.publicPath ||
        DEFAULT_ROUTE
    );

  const fromUser =
    safeSanitizeUsername(
      safeGetUserUsername(user) ||
        user?.username ||
        user?.userName ||
        user?.nick ||
        user?.alias ||
        user?.login ||
        user?.slug ||
        user?.email ||
        ""
    );

  const fromPrevious =
    safeSanitizeUsername(
      state?.currentResolvedUsername ||
        state?.resolvedUsername ||
        ""
    );

  return (
    fromPath ||
    fromUser ||
    fromPrevious ||
    null
  );
}

function buildAuthPatch(state, options = {}) {
  const forceUnauthenticated =
    options.forceUnauthenticated === true;

  const authenticated =
    forceUnauthenticated
      ? false
      : computeAuthSafe(
          state?.user,
          state?.token
        );

  const hasToken =
    safeHasValidToken(
      state?.token
    );

  const currentResolvedUsername =
    authenticated
      ? resolveResolvedUsername({
          state,
          user:
            state?.user,
          publicPath:
            state?.publicPath,
          authenticated,
        })
      : null;

  return {
    authenticated,

    hasToken,

    role:
      authenticated
        ? resolveRole(state?.user)
        : null,

    username:
      authenticated
        ? safeGetUserUsername(state?.user)
        : null,

    currentResolvedUsername,

    resolvedUsername:
      currentResolvedUsername,
  };
}

function syncAuthState(state, options = {}) {
  if (!state || !isObject(state)) {
    return state;
  }

  const patch =
    buildAuthPatch(
      state,
      options
    );

  Object.assign(
    state,
    patch
  );

  return state;
}

function emitAuthChangeIfNeeded(events, previousSnapshot, state, cause = "unknown") {
  const previousAuth =
    Boolean(previousSnapshot?.authenticated);

  const nextAuth =
    Boolean(state?.authenticated);

  const previousHasToken =
    Boolean(previousSnapshot?.hasToken);

  const nextHasToken =
    Boolean(state?.hasToken);

  const previousUsername =
    previousSnapshot?.username || null;

  const nextUsername =
    state?.username || null;

  if (
    previousAuth === nextAuth &&
    previousHasToken === nextHasToken &&
    previousUsername === nextUsername
  ) {
    return false;
  }

  return safeEmit(
    events,
    SESSION_EVENTS.authChange,
    {
      authenticated:
        nextAuth,

      hasToken:
        nextHasToken,

      role:
        state?.role || null,

      username:
        nextUsername,

      currentResolvedUsername:
        state?.currentResolvedUsername || null,

      cause,

      changedAt:
        safeNowIso(),
    }
  );
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

function createAuthSnapshot(state) {
  return {
    authenticated:
      Boolean(state?.authenticated),

    hasToken:
      Boolean(
        safeHasValidToken(state?.token)
      ),

    role:
      state?.role || null,

    username:
      state?.username ||
      safeGetUserUsername(state?.user) ||
      null,

    currentResolvedUsername:
      state?.currentResolvedUsername || null,
  };
}

function createSessionSnapshot(state, cause = "unknown") {
  return {
    authenticated:
      Boolean(state?.authenticated),

    hasToken:
      Boolean(
        safeHasValidToken(state?.token)
      ),

    token:
      null,

    user:
      createUserSnapshot(
        state?.user || null
      ),

    role:
      state?.role || null,

    username:
      state?.username ||
      safeGetUserUsername(state?.user) ||
      null,

    displayName:
      safeGetUserDisplayName(state?.user),

    avatarUrl:
      safeGetUserAvatarUrl(state?.user),

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    resolvedUsername:
      state?.resolvedUsername || null,

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

    cause,

    changedAt:
      safeNowIso(),
  };
}

function userFingerprint(user = null) {
  if (!user) {
    return "";
  }

  const normalized =
    safeNormalizeUser(user);

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

      avatarUrl:
        normalized?.avatarUrl ||
        normalized?.avatar ||
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

function tokenFingerprint(token = null) {
  if (!safeHasValidToken(token)) {
    return "";
  }

  const value =
    String(token).trim();

  return `${value.length}:${value.slice(0, 8)}:${value.slice(-8)}`;
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
    safeCanonicalPath(
      route ||
        state?.route ||
        DEFAULT_ROUTE,
      DEFAULT_ROUTE
    );

  const nextPublicPath =
    safePublicPath(
      publicPath ||
        state?.publicPath ||
        nextCanonical,
      nextCanonical
    );

  const authPatch =
    buildAuthPatch({
      ...state,
      route:
        nextCanonical,
      publicPath:
        nextPublicPath,
    });

  const patch = {
    route:
      nextCanonical,

    publicPath:
      nextPublicPath,

    currentResolvedUsername:
      authPatch.currentResolvedUsername,

    resolvedUsername:
      authPatch.resolvedUsername,
  };

  if (
    !safeSetState(
      setState,
      patch
    )
  ) {
    Object.assign(
      state,
      patch
    );
  }

  return {
    route:
      nextCanonical,

    publicPath:
      nextPublicPath,

    currentResolvedUsername:
      authPatch.currentResolvedUsername,
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
    safeCanonicalPath(
      state?.route || DEFAULT_ROUTE
    );

  const normalized =
    safeCanonicalPath(
      route || DEFAULT_ROUTE
    );

  if (
    previousRoute === normalized
  ) {
    return normalized;
  }

  const patch = {
    lastRoute:
      previousRoute,

    route:
      normalized,
  };

  if (
    !safeSetState(
      setState,
      patch
    ) &&
    state
  ) {
    Object.assign(
      state,
      patch
    );
  }

  safeEmit(
    events,
    SESSION_EVENTS.routeChange,
    {
      route:
        normalized,

      previousRoute,

      publicPath:
        safeRedact(
          state?.publicPath || normalized
        ),
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
    safePublicPath(
      state?.publicPath || DEFAULT_ROUTE
    );

  const normalized =
    safePublicPath(
      path || DEFAULT_ROUTE
    );

  if (
    previousPublicPath === normalized
  ) {
    return normalized;
  }

  const patch = {
    lastPublicPath:
      previousPublicPath,

    publicPath:
      normalized,
  };

  if (
    !safeSetState(
      setState,
      patch
    ) &&
    state
  ) {
    Object.assign(
      state,
      patch
    );
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
        safeCanonicalPath(
          state?.route || DEFAULT_ROUTE
        ),
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
    user
      ? safeNormalizeUser(user)
      : null;

  const previousAuth =
    createAuthSnapshot(state);

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

    syncAuthState(state);

    return normalizedUser;
  }

  const patch = {
    user:
      normalizedUser,
  };

  if (
    !safeSetState(
      setState,
      patch
    ) &&
    state
  ) {
    state.user =
      normalizedUser;

    syncAuthState(state);
  }

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

  emitAuthChangeIfNeeded(
    events,
    previousAuth,
    state,
    "setUser"
  );

  safeEmit(
    events,
    SESSION_EVENTS.userChange,
    {
      user:
        createUserSnapshot(normalizedUser),

      authenticated:
        Boolean(state?.authenticated),

      hasToken:
        Boolean(state?.hasToken),

      role:
        state?.role || null,

      username:
        state?.username ||
        safeGetUserUsername(normalizedUser),

      displayName:
        safeGetUserDisplayName(normalizedUser),

      currentResolvedUsername:
        state?.currentResolvedUsername || null,

      avatarUrl:
        safeGetUserAvatarUrl(normalizedUser),
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
    safeHasValidToken(token)
      ? String(token).trim()
      : null;

  const previousAuth =
    createAuthSnapshot(state);

  const previousTokenFingerprint =
    tokenFingerprint(
      state?.token
    );

  const nextTokenFingerprint =
    tokenFingerprint(
      normalized
    );

  if (
    previousTokenFingerprint === nextTokenFingerprint
  ) {
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

    syncAuthState(
      state,
      {
        forceUnauthenticated:
          !normalized,
      }
    );

    return normalized;
  }

  const patch = {
    token:
      normalized,
  };

  if (
    !safeSetState(
      setState,
      patch,
      {
        forceUnauthenticated:
          !normalized,
      }
    ) &&
    state
  ) {
    state.token =
      normalized;

    syncAuthState(
      state,
      {
        forceUnauthenticated:
          !normalized,
      }
    );
  }

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

  emitAuthChangeIfNeeded(
    events,
    previousAuth,
    state,
    "setToken"
  );

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

      role:
        state?.role || null,

      username:
        state?.username || null,

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
  const previousAuth =
    createAuthSnapshot(state);

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
        token === null,
    }
  );

  if (
    route !== undefined ||
    publicPath !== undefined
  ) {
    syncRouteFields({
      state,
      setState,
      route,
      publicPath,
    });
  }

  emitAuthChangeIfNeeded(
    events,
    previousAuth,
    state,
    "applySession"
  );

  const snapshot =
    createSessionSnapshot(
      state,
      "applySession"
    );

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

  const previousAuth =
    createAuthSnapshot(state);

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

  const patch = {
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
  };

  if (
    !safeSetState(
      setState,
      patch,
      {
        forceUnauthenticated:
          true,
      }
    ) &&
    state
  ) {
    Object.assign(
      state,
      patch
    );

    syncAuthState(
      state,
      {
        forceUnauthenticated:
          true,
      }
    );
  }

  try {
    syncUserUI?.();
  } catch {}

  emitAuthChangeIfNeeded(
    events,
    previousAuth,
    state,
    "clearSession"
  );

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

  /*
    Regla UX:
    por defecto abierto. Evita residuos legacy tipo sidebar-collapsed.
  */
  const sidebarOpen =
    true;

  if (state) {
    state.theme =
      theme;

    state.lang =
      lang;

    state.sidebarOpen =
      sidebarOpen;
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
    sidebarOpen
  );

  toggleClass(
    dom?.body,
    "sidebar-collapsed",
    !sidebarOpen
  );

  toggleClass(
    dom?.sidebar,
    "open",
    sidebarOpen
  );

  toggleClass(
    dom?.sidebar,
    "collapsed",
    !sidebarOpen
  );

  toggleClass(
    dom?.sidebar,
    "is-open",
    sidebarOpen
  );

  toggleClass(
    dom?.sidebar,
    "is-collapsed",
    !sidebarOpen
  );

  setAriaExpanded(
    dom?.sidebarToggle,
    sidebarOpen
  );

  setAriaExpanded(
    dom?.sidebarMobileToggle,
    sidebarOpen
  );

  return {
    theme,
    lang,
    sidebarOpen,
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
  const savedTokenRaw =
    safeStorageGet(
      storage,
      config.storageKeys.token,
      null
    );

  const savedToken =
    safeHasValidToken(savedTokenRaw)
      ? String(savedTokenRaw).trim()
      : null;

  const savedUser =
    savedToken
      ? safeNormalizeUser(
          safeStorageGet(
            storage,
            config.storageKeys.user,
            null
          )
        )
      : null;

  if (state) {
    state.token =
      savedToken;

    /*
      Punto crítico:
      si no hay token válido, no hidratamos usuario antiguo.
      Esto evita avatar fantasma/topbar con usuario viejo.
    */
    state.user =
      savedToken
        ? savedUser
        : null;
  }

  syncAuthState(
    state,
    {
      forceUnauthenticated:
        !savedToken,
    }
  );

  const userTheme =
    savedToken
      ? resolveThemeFromUser(savedUser)
      : null;

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

  const snapshot =
    createSessionSnapshot(
      state,
      "loadSession"
    );

  safeEmit(
    events,
    SESSION_EVENTS.sessionLoaded,
    snapshot
  );

  safeEmit(
    events,
    SESSION_EVENTS.sessionState,
    snapshot
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
        safeHasValidToken(state?.token)
      ),

    token:
      null,

    role:
      state?.role || null,

    username:
      state?.username ||
      safeGetUserUsername(state?.user),

    displayName:
      safeGetUserDisplayName(state?.user),

    avatarUrl:
      safeGetUserAvatarUrl(state?.user),

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    resolvedUsername:
      state?.resolvedUsername || null,

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

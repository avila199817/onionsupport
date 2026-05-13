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
   - publicPath con query/hash y /@usuario preservado
   - auth alineada con state.computeAuthenticated(), pero estricta contra token-only auth
   - una sola mutación lógica cuando setState está disponible
   - no dobles setState innecesarios
   - compatible con preboot theme system/light/dark
   - compatible con storage local/session/memory
========================================================= */

import { config } from "./config.js";

import {
  normalizePath,
  normalizeCanonicalPath,
  normalizeUser,
  hasValidToken,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  getThemeColor,
  sanitizeUsername,
  safeText,
  safeBool,
  safeObject,
  safeArray,
  safeLower,
  firstNonEmpty,
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

const SESSION_VERSION =
  "12.0.0";

const DEFAULT_ROUTE =
  "/";

const DEFAULT_LANG =
  "es";

const DEFAULT_THEME =
  "dark";

const DEFAULT_THEME_MODE =
  "system";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const VALID_THEMES =
  Object.freeze([
    "dark",
    "light",
  ]);

const VALID_THEME_MODES =
  Object.freeze([
    "dark",
    "light",
    "system",
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

    preferencesLoaded:
      "app:preferences:loaded",

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

const STORAGE_KEY_FALLBACKS =
  Object.freeze({
    token:
      "token",

    user:
      "user",

    refreshToken:
      "refreshToken",

    tempToken:
      "tempToken",

    sessionId:
      "sessionId",

    sessionUserId:
      "sessionUserId",

    theme:
      "theme",

    themeMode:
      "themeMode",

    appearance:
      "appearance",

    lang:
      "lang",

    sidebarOpen:
      "sidebarOpen",

    lastPublicPath:
      "lastPublicPath",

    postLoginTarget:
      "postLoginTarget",
  });

const AUTH_STORAGE_KEYS =
  Object.freeze([
    "token",
    "user",
    "refreshToken",
    "tempToken",
    "sessionId",
    "sessionUserId",
    "postLoginTarget",
  ]);

const USER_ID_KEYS =
  Object.freeze([
    "id",
    "userId",
    "user_id",
    "_id",
    "uid",
    "sub",
    "username",
    "userName",
    "user_name",
    "email",
    "mail",
    "phone",
    "telefono",
    "mobile",
  ]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

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

function localSafeObject(value, fallback = {}) {
  try {
    return safeObject(
      value,
      fallback
    );
  } catch {
    return isPlainObject(value)
      ? value
      : fallback;
  }
}

function localSafeLower(value, fallback = "") {
  try {
    return safeLower(
      value,
      fallback
    );
  } catch {
    return localSafeText(value, fallback)
      .toLowerCase();
  }
}

function localSafeBool(value, fallback = false) {
  try {
    return safeBool(
      value,
      fallback
    );
  } catch {
    if (value === true) return true;
    if (value === false) return false;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === 1) return true;
    if (value === 0) return false;

    return Boolean(fallback);
  }
}

function localSafeArray(value) {
  try {
    return safeArray(value);
  } catch {
    return Array.isArray(value)
      ? value
      : [];
  }
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeNowIso(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function hasOwn(obj, key) {
  try {
    return Boolean(
      obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
    );
  } catch {
    return false;
  }
}

function safeEmit(events, name, payload = {}) {
  const eventName =
    localSafeText(name, "");

  if (!eventName) {
    return false;
  }

  try {
    events?.emit?.(
      eventName,
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
        localSafeObject(patch),
        options
      );
    } else {
      setState(
        localSafeObject(patch)
      );
    }

    return true;
  } catch {}

  return false;
}

function getStorageKey(name = "", fallback = "") {
  const cleanName =
    localSafeText(name, "");

  const keys =
    localSafeObject(
      config?.storageKeys,
      {}
    );

  return (
    localSafeText(keys?.[cleanName], "") ||
    localSafeText(STORAGE_KEY_FALLBACKS?.[cleanName], "") ||
    localSafeText(fallback, "") ||
    cleanName
  );
}

function safeStorageGet(storage, key, fallback = null, options = undefined) {
  const finalKey =
    localSafeText(key, "");

  if (!finalKey) {
    return fallback;
  }

  try {
    if (options !== undefined) {
      return storage?.get?.(
        finalKey,
        fallback,
        options
      );
    }

    return storage?.get?.(
      finalKey,
      fallback
    );
  } catch {
    return fallback;
  }
}

function safeStorageGetRaw(storage, key, fallback = null, options = undefined) {
  const finalKey =
    localSafeText(key, "");

  if (!finalKey) {
    return fallback;
  }

  try {
    if (isFunction(storage?.getRaw)) {
      if (options !== undefined) {
        return storage.getRaw(
          finalKey,
          fallback,
          options
        );
      }

      return storage.getRaw(
        finalKey,
        fallback
      );
    }
  } catch {}

  return safeStorageGet(
    storage,
    finalKey,
    fallback,
    options
  );
}

function safeStorageSet(storage, key, value, options = undefined) {
  const finalKey =
    localSafeText(key, "");

  if (!finalKey) {
    return false;
  }

  try {
    if (options !== undefined) {
      storage?.set?.(
        finalKey,
        value,
        options
      );
    } else {
      storage?.set?.(
        finalKey,
        value
      );
    }

    return true;
  } catch {}

  return false;
}

function safeStorageSetRaw(storage, key, value, options = undefined) {
  const finalKey =
    localSafeText(key, "");

  if (!finalKey) {
    return false;
  }

  try {
    if (isFunction(storage?.setRaw)) {
      if (options !== undefined) {
        storage.setRaw(
          finalKey,
          value,
          options
        );
      } else {
        storage.setRaw(
          finalKey,
          value
        );
      }

      return true;
    }
  } catch {}

  return safeStorageSet(
    storage,
    finalKey,
    value,
    options
  );
}

function safeStorageRemove(storage, key, options = undefined) {
  const finalKey =
    localSafeText(key, "");

  if (!finalKey) {
    return false;
  }

  try {
    if (isFunction(storage?.remove)) {
      if (options !== undefined) {
        storage.remove(
          finalKey,
          options
        );
      } else {
        storage.remove(finalKey);
      }

      return true;
    }

    if (isFunction(storage?.delete)) {
      storage.delete(finalKey);
      return true;
    }

    if (isFunction(storage?.del)) {
      storage.del(finalKey);
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
        error.name || "Error",

      message:
        safeRedact(
          error.message || "Error"
        ),

      stack:
        error.stack ? "[stack]" : null,

      code:
        error.code || null,

      status:
        error.status ||
        error.statusCode ||
        null,
    };
  }

  return sanitizeForEvent(error);
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

/* =========================================================
   REDACTION / SNAPSHOT SAFETY
========================================================= */

function sanitizeForEvent(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(localSafeText(keyHint, ""))) {
    return value
      ? "***"
      : null;
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

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return {
      name:
        value.name || "Error",

      message:
        safeRedact(
          value.message || "Error"
        ),

      stack:
        value.stack
          ? "[stack]"
          : null,
    };
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
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] =
        SENSITIVE_KEY_RE.test(key)
          ? item
            ? "***"
            : null
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

  const snapshot = {
    id:
      normalized?.id ||
      normalized?.userId ||
      null,

    userId:
      normalized?.userId ||
      normalized?.id ||
      null,

    username:
      normalized?.username || null,

    slug:
      normalized?.slug || null,

    email:
      normalized?.email || null,

    name:
      normalized?.name || null,

    displayName:
      normalized?.displayName ||
      normalized?.name ||
      null,

    role:
      normalized?.role ||
      normalized?.rol ||
      null,

    avatar:
      normalized?.avatar
        ? safeRedact(normalized.avatar)
        : null,

    avatarUrl:
      normalized?.avatarUrl
        ? safeRedact(normalized.avatarUrl)
        : null,

    hasAvatar:
      Boolean(normalized?.hasAvatar),

    avatarUpdatedAt:
      normalized?.avatarUpdatedAt || null,

    active:
      normalized?.active !== false,
  };

  return sanitizeForEvent(snapshot);
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    String(pathname || DEFAULT_ROUTE)
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  const normalizedSegments =
    [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  value =
    `/${normalizedSegments.join("/")}`;

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value;
}

function normalizeSearch(search = "") {
  const raw =
    localSafeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw =
    localSafeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw =
    localSafeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    localSafeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") ||
      DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") ||
    DEFAULT_ROUTE;
}

function splitFullPath(value = DEFAULT_ROUTE) {
  const raw =
    localSafeText(value, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
  };
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePublicPathLocal(value = DEFAULT_ROUTE) {
  const raw =
    localSafeText(value, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  if (isHashRouterPath(raw)) {
    return normalizePublicPathLocal(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizePublicPathLocal(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizePublicPathLocal(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  try {
    const delegated =
      normalizePath(raw);

    if (
      delegated &&
      !raw.includes("@") &&
      !raw.includes("?") &&
      !raw.includes("#")
    ) {
      const parts =
        splitFullPath(delegated);

      return `${parts.pathname}${parts.search}${parts.hash}`;
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripPublicUsernamePrefix(path = DEFAULT_ROUTE) {
  const parts =
    splitFullPath(
      normalizePublicPathLocal(path)
    );

  const segments =
    parts.pathname
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    /^@[A-Za-z0-9._-]{1,80}$/.test(segments[0])
  ) {
    const rest =
      segments.slice(1).join("/");

    const cleanPathname =
      rest
        ? normalizePathnameOnly(`/${rest}`)
        : DEFAULT_ROUTE;

    return `${cleanPathname}${parts.search}${parts.hash}`;
  }

  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const parts =
    splitFullPath(path);

  return normalizePathnameOnly(
    parts.pathname || DEFAULT_ROUTE
  );
}

function collapseTechnicalCanonicalPath(pathname = DEFAULT_ROUTE) {
  const clean =
    normalizePathnameOnly(pathname);

  if (
    clean === ACTIVATION_PATH ||
    clean.startsWith(`${ACTIVATION_PATH}/`)
  ) {
    return ACTIVATION_PATH;
  }

  if (
    clean === RESET_CONFIRM_PATH ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
  ) {
    return RESET_CONFIRM_PATH;
  }

  return clean;
}

function safeCanonicalPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const source =
    value || fallback || DEFAULT_ROUTE;

  try {
    const noUsername =
      stripPublicUsernamePrefix(source);

    const external =
      normalizeCanonicalPath(
        noUsername || DEFAULT_ROUTE
      );

    return collapseTechnicalCanonicalPath(
      stripSearchAndHash(
        external || noUsername || DEFAULT_ROUTE
      )
    );
  } catch {}

  return collapseTechnicalCanonicalPath(
    stripSearchAndHash(
      stripPublicUsernamePrefix(
        source
      )
    )
  );
}

function safePublicPath(value = DEFAULT_ROUTE, fallback = DEFAULT_ROUTE) {
  const source =
    value || fallback || DEFAULT_ROUTE;

  return normalizePublicPathLocal(source);
}

function extractUsernameFromPublicPath(publicPath = DEFAULT_ROUTE) {
  const clean =
    normalizePublicPathLocal(publicPath);

  const match =
    clean.match(/^\/@([^/]+)(?:\/|$)/i);

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
      user?.profile?.rol ||
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

  if (
    user.active === false ||
    user.disabled === true ||
    user.isDisabled === true ||
    user.deleted === true ||
    user.isDeleted === true ||
    user.blocked === true ||
    user.isBlocked === true
  ) {
    return false;
  }

  const status =
    localSafeLower(
      user.status ||
        user.estado ||
        user.state ||
        user.accountStatus ||
        "",
      ""
    );

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
    ].includes(status)
  ) {
    return false;
  }

  return USER_ID_KEYS.some((key) =>
    Boolean(
      localSafeText(user?.[key], "")
    )
  );
}

function computeAuthSafe(user = null, token = null) {
  const validToken =
    safeHasValidToken(token);

  const usableUser =
    hasUsableUser(user);

  if (
    !validToken ||
    !usableUser
  ) {
    return false;
  }

  try {
    const computed =
      computeAuthenticated(
        user,
        token
      );

    return Boolean(
      computed &&
        validToken &&
        usableUser
    );
  } catch {}

  return Boolean(
    validToken &&
      usableUser
  );
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
  const root =
    localSafeObject(state);

  const opts =
    localSafeObject(options);

  const forceUnauthenticated =
    opts.forceUnauthenticated === true;

  const normalizedUser =
    root.user
      ? safeNormalizeUser(root.user)
      : null;

  const hasToken =
    safeHasValidToken(root.token);

  const authenticated =
    forceUnauthenticated
      ? false
      : computeAuthSafe(
          normalizedUser,
          root.token
        );

  const currentResolvedUsername =
    authenticated
      ? resolveResolvedUsername({
          state:
            root,
          user:
            normalizedUser,
          publicPath:
            root.publicPath,
          authenticated,
        })
      : null;

  return {
    authenticated,

    hasToken,

    role:
      authenticated
        ? resolveRole(normalizedUser)
        : null,

    username:
      authenticated
        ? safeGetUserUsername(normalizedUser)
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

  const previousResolved =
    previousSnapshot?.currentResolvedUsername || null;

  const nextResolved =
    state?.currentResolvedUsername || null;

  if (
    previousAuth === nextAuth &&
    previousHasToken === nextHasToken &&
    previousUsername === nextUsername &&
    previousResolved === nextResolved
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
        nextResolved,

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

function addClass(el, className) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.add(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(el, className) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.remove(className);
    return true;
  } catch {
    return false;
  }
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
      value === undefined ||
      value === ""
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

function setDataset(el, key, value) {
  if (
    !el ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
    } else {
      el.dataset[key] =
        String(value);
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   THEME / LANG
========================================================= */

function normalizeTheme(theme = config.defaultTheme) {
  const value =
    localSafeLower(
      theme,
      config.defaultTheme || DEFAULT_THEME
    );

  return VALID_THEMES.includes(value)
    ? value
    : DEFAULT_THEME;
}

function normalizeThemeMode(mode = DEFAULT_THEME_MODE) {
  const value =
    localSafeLower(
      mode,
      DEFAULT_THEME_MODE
    );

  if (
    [
      "auto",
      "automatic",
      "browser",
      "os",
      "device",
      "system-preference",
      "system_preference",
    ].includes(value)
  ) {
    return "system";
  }

  return VALID_THEME_MODES.includes(value)
    ? value
    : DEFAULT_THEME_MODE;
}

function normalizeLang(lang = config.defaultLang) {
  const value =
    localSafeLower(
      lang,
      config.defaultLang || DEFAULT_LANG
    );

  return VALID_LANG_RE.test(value)
    ? value
    : config.defaultLang || DEFAULT_LANG;
}

function getBootThemeSnapshot() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return window.__ONION_BOOT_THEME__ || {};
  } catch {
    return {};
  }
}

function resolveSystemTheme() {
  if (!isBrowser()) {
    return DEFAULT_THEME;
  }

  try {
    if (
      isFunction(window.matchMedia) &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
  } catch {}

  return "light";
}

function resolveThemeFromMode(mode = DEFAULT_THEME_MODE) {
  const finalMode =
    normalizeThemeMode(mode);

  if (finalMode === "dark") {
    return "dark";
  }

  if (finalMode === "light") {
    return "light";
  }

  return resolveSystemTheme();
}

function resolveThemeFromUser(user = null) {
  if (!user || !isObject(user)) {
    return null;
  }

  const explicitTheme =
    localSafeLower(
      user.theme ??
        user?.preferences?.theme ??
        user?.settings?.theme ??
        user?.raw?.theme ??
        user?.raw?.preferences?.theme ??
        user?.raw?.settings?.theme ??
        "",
      ""
    );

  if (VALID_THEMES.includes(explicitTheme)) {
    return explicitTheme;
  }

  const explicitMode =
    normalizeThemeMode(
      user.themeMode ??
        user.theme_mode ??
        user.appearance ??
        user?.preferences?.themeMode ??
        user?.preferences?.theme_mode ??
        user?.preferences?.appearance ??
        user?.settings?.themeMode ??
        user?.settings?.theme_mode ??
        user?.settings?.appearance ??
        user?.raw?.themeMode ??
        user?.raw?.theme_mode ??
        user?.raw?.appearance ??
        ""
    );

  if (explicitMode) {
    return resolveThemeFromMode(explicitMode);
  }

  const darkCandidates = [
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
      darkCandidates.find((item) =>
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

function resolveStoredTheme(storage) {
  const bootTheme =
    getBootThemeSnapshot();

  const bootMode =
    normalizeThemeMode(
      bootTheme?.mode || ""
    );

  const bootResolvedTheme =
    VALID_THEMES.includes(bootTheme?.theme)
      ? bootTheme.theme
      : "";

  const storedThemeModeRaw =
    safeStorageGet(
      storage,
      getStorageKey("themeMode"),
      ""
    ) ||
    safeStorageGet(
      storage,
      getStorageKey("appearance"),
      ""
    );

  const storedThemeMode =
    storedThemeModeRaw
      ? normalizeThemeMode(storedThemeModeRaw)
      : "";

  const storedThemeRaw =
    safeStorageGet(
      storage,
      getStorageKey("theme"),
      bootResolvedTheme || config.defaultTheme || DEFAULT_THEME
    );

  const storedTheme =
    normalizeTheme(
      storedThemeRaw
    );

  const finalMode =
    storedThemeMode ||
    bootMode ||
    normalizeThemeMode(config?.defaultThemeMode || config?.appearance || "") ||
    DEFAULT_THEME_MODE;

  const finalTheme =
    storedThemeMode
      ? resolveThemeFromMode(storedThemeMode)
      : bootResolvedTheme ||
        storedTheme ||
        resolveThemeFromMode(finalMode);

  return {
    theme:
      normalizeTheme(finalTheme),

    themeMode:
      normalizeThemeMode(finalMode),
  };
}

export function syncThemeMetaColor({
  dom,
  theme = config.defaultTheme,
} = {}) {
  const finalTheme =
    normalizeTheme(theme);

  const color =
    getThemeColor(finalTheme);

  const candidates =
    [
      dom?.themeColorMeta,
      dom?.metaThemeColor,
      isBrowser()
        ? document.querySelector?.("meta[name='theme-color']")
        : null,
    ].filter(Boolean);

  let synced =
    false;

  for (const meta of candidates) {
    try {
      meta.setAttribute(
        "content",
        color
      );

      synced =
        true;
    } catch {}
  }

  return synced;
}

function applyThemeDom({
  dom,
  theme,
  themeMode = "",
} = {}) {
  const finalTheme =
    normalizeTheme(theme);

  const finalMode =
    themeMode
      ? normalizeThemeMode(themeMode)
      : finalTheme;

  setAttribute(
    dom?.html,
    "data-theme",
    finalTheme
  );

  setAttribute(
    dom?.html,
    "data-theme-mode",
    finalMode
  );

  setAttribute(
    dom?.body,
    "data-theme",
    finalTheme
  );

  setAttribute(
    dom?.body,
    "data-theme-mode",
    finalMode
  );

  removeClass(
    dom?.html,
    "theme-dark"
  );

  removeClass(
    dom?.html,
    "theme-light"
  );

  removeClass(
    dom?.body,
    "theme-dark"
  );

  removeClass(
    dom?.body,
    "theme-light"
  );

  addClass(
    dom?.html,
    `theme-${finalTheme}`
  );

  addClass(
    dom?.body,
    `theme-${finalTheme}`
  );

  syncThemeMetaColor({
    dom,
    theme:
      finalTheme,
  });

  return finalTheme;
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
  const publicPath =
    safePublicPath(
      state?.publicPath ||
        state?.route ||
        DEFAULT_ROUTE
    );

  return {
    version:
      SESSION_VERSION,

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
      safeRedact(
        safeGetUserAvatarUrl(state?.user) || ""
      ),

    currentResolvedUsername:
      state?.currentResolvedUsername || null,

    resolvedUsername:
      state?.resolvedUsername || null,

    route:
      safeCanonicalPath(
        state?.route || DEFAULT_ROUTE
      ),

    publicPath:
      safeRedact(publicPath),

    theme:
      state?.theme || config.defaultTheme || DEFAULT_THEME,

    themeMode:
      state?.themeMode || null,

    lang:
      state?.lang || config.defaultLang || DEFAULT_LANG,

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

  const nextPublicPath =
    safePublicPath(
      publicPath ||
        state?.publicPath ||
        route ||
        state?.route ||
        DEFAULT_ROUTE,
      state?.publicPath ||
        state?.route ||
        DEFAULT_ROUTE
    );

  const nextCanonical =
    safeCanonicalPath(
      route ||
        nextPublicPath ||
        state?.route ||
        DEFAULT_ROUTE,
      DEFAULT_ROUTE
    );

  const nextStatePreview = {
    ...state,

    route:
      nextCanonical,

    publicPath:
      nextPublicPath,
  };

  const authPatch =
    buildAuthPatch(
      nextStatePreview
    );

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
  options = {},
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
      patch,
      localSafeObject(options)
    ) &&
    state
  ) {
    Object.assign(
      state,
      patch
    );

    syncAuthState(state);
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

      changedAt:
        safeNowIso(),
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
  options = {},
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
      patch,
      localSafeObject(options)
    ) &&
    state
  ) {
    Object.assign(
      state,
      patch
    );

    syncAuthState(state);
  }

  safeStorageSet(
    storage,
    getStorageKey("lastPublicPath"),
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

      changedAt:
        safeNowIso(),
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
  options = {},
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
        getStorageKey("user"),
        normalizedUser
      );
    } else {
      safeStorageRemove(
        storage,
        getStorageKey("user")
      );
    }

    syncAuthState(state);

    return normalizedUser;
  }

  const nextPreview = {
    ...localSafeObject(state),

    user:
      normalizedUser,
  };

  const authPatch =
    buildAuthPatch(nextPreview);

  const patch = {
    user:
      normalizedUser,

    ...authPatch,
  };

  if (
    !safeSetState(
      setState,
      patch,
      {
        ...localSafeObject(options),

        forceUnauthenticated:
          !patch.authenticated,
      }
    ) &&
    state
  ) {
    Object.assign(
      state,
      patch
    );

    syncAuthState(state);
  }

  if (normalizedUser) {
    safeStorageSet(
      storage,
      getStorageKey("user"),
      normalizedUser
    );
  } else {
    safeStorageRemove(
      storage,
      getStorageKey("user")
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
        safeRedact(
          safeGetUserAvatarUrl(normalizedUser) || ""
        ),

      changedAt:
        safeNowIso(),
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
  options = {},
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
      safeStorageSetRaw(
        storage,
        getStorageKey("token"),
        normalized
      );
    } else {
      safeStorageRemove(
        storage,
        getStorageKey("token")
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

  const nextPreview = {
    ...localSafeObject(state),

    token:
      normalized,
  };

  const authPatch =
    buildAuthPatch(
      nextPreview,
      {
        forceUnauthenticated:
          !normalized,
      }
    );

  const patch = {
    token:
      normalized,

    ...authPatch,
  };

  if (
    !safeSetState(
      setState,
      patch,
      {
        ...localSafeObject(options),

        forceUnauthenticated:
          !patch.authenticated,
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
          !normalized,
      }
    );
  }

  if (normalized) {
    safeStorageSetRaw(
      storage,
      getStorageKey("token"),
      normalized
    );
  } else {
    safeStorageRemove(
      storage,
      getStorageKey("token")
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

      changedAt:
        safeNowIso(),
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
   AUX SESSION STORAGE
========================================================= */

function persistAuxSessionValue(storage, keyName, value) {
  const key =
    getStorageKey(keyName);

  if (value === undefined) {
    return false;
  }

  if (
    value === null ||
    value === ""
  ) {
    return safeStorageRemove(
      storage,
      key,
      {
        all:
          true,
      }
    );
  }

  if (
    keyName.toLowerCase().includes("token")
  ) {
    return safeStorageSetRaw(
      storage,
      key,
      String(value)
    );
  }

  return safeStorageSet(
    storage,
    key,
    value
  );
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
  storage,
  events,
  setUser,
  setToken,
  setState,

  token = undefined,
  user = undefined,

  refreshToken = undefined,
  tempToken = undefined,
  sessionId = undefined,
  sessionUserId = undefined,

  route = undefined,
  publicPath = undefined,
  options = {},
} = {}) {
  const opts =
    localSafeObject(options);

  const previousAuth =
    createAuthSnapshot(state);

  const hasDirectMutation =
    isFunction(setState);

  const nextToken =
    token !== undefined
      ? safeHasValidToken(token)
        ? String(token).trim()
        : null
      : state?.token ?? null;

  const nextUser =
    user !== undefined
      ? user
        ? safeNormalizeUser(user)
        : null
      : state?.user ?? null;

  const nextPublicPath =
    publicPath !== undefined
      ? safePublicPath(
          publicPath,
          state?.publicPath ||
            state?.route ||
            DEFAULT_ROUTE
        )
      : state?.publicPath || DEFAULT_ROUTE;

  const nextRoute =
    route !== undefined
      ? safeCanonicalPath(
          route,
          state?.route || DEFAULT_ROUTE
        )
      : safeCanonicalPath(
          nextPublicPath ||
            state?.route ||
            DEFAULT_ROUTE
        );

  const nextPreview = {
    ...localSafeObject(state),

    token:
      nextToken,

    user:
      nextUser,

    route:
      nextRoute,

    publicPath:
      nextPublicPath,
  };

  const authPatch =
    buildAuthPatch(
      nextPreview,
      {
        forceUnauthenticated:
          token === null ||
          !nextToken ||
          !hasUsableUser(nextUser),
      }
    );

  if (hasDirectMutation && state) {
    const basePatch = {};

    if (token !== undefined) {
      basePatch.token =
        nextToken;
    }

    if (user !== undefined) {
      basePatch.user =
        nextUser;
    }

    if (route !== undefined) {
      basePatch.route =
        nextRoute;
    }

    if (publicPath !== undefined) {
      basePatch.publicPath =
        nextPublicPath;
    }

    Object.assign(
      basePatch,
      authPatch
    );

    safeSetState(
      setState,
      basePatch,
      {
        ...opts,

        source:
          opts.source || "core-session:applySession",

        forceUnauthenticated:
          !authPatch.authenticated,
      }
    );

    if (token !== undefined) {
      if (nextToken) {
        safeStorageSetRaw(
          storage,
          getStorageKey("token"),
          nextToken
        );
      } else {
        safeStorageRemove(
          storage,
          getStorageKey("token"),
          {
            all:
              true,
          }
        );
      }
    }

    if (user !== undefined) {
      if (nextUser) {
        safeStorageSet(
          storage,
          getStorageKey("user"),
          nextUser
        );
      } else {
        safeStorageRemove(
          storage,
          getStorageKey("user"),
          {
            all:
              true,
          }
        );
      }
    }
  } else {
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

    if (
      route !== undefined ||
      publicPath !== undefined
    ) {
      syncRouteFields({
        state,
        setState,
        route:
          nextRoute,
        publicPath:
          nextPublicPath,
      });
    }

    if (state) {
      Object.assign(
        state,
        authPatch
      );
    }
  }

  persistAuxSessionValue(
    storage,
    "refreshToken",
    refreshToken
  );

  persistAuxSessionValue(
    storage,
    "tempToken",
    tempToken
  );

  persistAuxSessionValue(
    storage,
    "sessionId",
    sessionId
  );

  persistAuxSessionValue(
    storage,
    "sessionUserId",
    sessionUserId
  );

  if (state) {
    syncAuthState(
      state,
      {
        forceUnauthenticated:
          !authPatch.authenticated,
      }
    );
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
    localSafeObject(options);

  const previousAuth =
    createAuthSnapshot(state);

  for (const keyName of AUTH_STORAGE_KEYS) {
    safeStorageRemove(
      storage,
      getStorageKey(keyName),
      {
        all:
          true,
      }
    );
  }

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
        source:
          opts.source || "core-session:clearSession",

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

    changedAt:
      safeNowIso(),
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

function resolveStoredSidebarOpen(storage) {
  const stored =
    safeStorageGet(
      storage,
      getStorageKey("sidebarOpen"),
      null
    );

  if (
    stored === null ||
    stored === undefined ||
    stored === ""
  ) {
    return true;
  }

  return localSafeBool(
    stored,
    true
  );
}

export function loadPreferences({
  state,
  storage,
  dom,
  events,
} = {}) {
  const resolvedTheme =
    resolveStoredTheme(storage);

  const savedLang =
    safeStorageGet(
      storage,
      getStorageKey("lang"),
      config.defaultLang || DEFAULT_LANG
    );

  const theme =
    normalizeTheme(
      resolvedTheme.theme
    );

  const themeMode =
    normalizeThemeMode(
      resolvedTheme.themeMode
    );

  const lang =
    normalizeLang(savedLang);

  const sidebarOpen =
    resolveStoredSidebarOpen(storage);

  if (state) {
    state.theme =
      theme;

    state.themeMode =
      themeMode;

    state.lang =
      lang;

    state.sidebarOpen =
      sidebarOpen;
  }

  applyThemeDom({
    dom,
    theme,
    themeMode,
  });

  setAttribute(
    dom?.html,
    "lang",
    lang
  );

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

  const payload = {
    theme,
    themeMode,
    lang,
    sidebarOpen,
    loadedAt:
      safeNowIso(),
  };

  safeEmit(
    events,
    SESSION_EVENTS.preferencesLoaded,
    payload
  );

  return payload;
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
    safeStorageGetRaw(
      storage,
      getStorageKey("token"),
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
            getStorageKey("user"),
            null
          )
        )
      : null;

  const usableSavedUser =
    hasUsableUser(savedUser)
      ? savedUser
      : null;

  if (state) {
    state.token =
      savedToken;

    /*
      Punto crítico:
      si no hay token válido, no hidratamos usuario antiguo.
      Si hay token pero el usuario no es usable, hasToken queda true
      pero authenticated queda false hasta que /me restaure usuario real.
    */
    state.user =
      savedToken
        ? usableSavedUser
        : null;
  }

  syncAuthState(
    state,
    {
      forceUnauthenticated:
        !savedToken ||
        !usableSavedUser,
    }
  );

  const userTheme =
    savedToken && usableSavedUser
      ? resolveThemeFromUser(usableSavedUser)
      : null;

  if (
    userTheme === "light" ||
    userTheme === "dark"
  ) {
    if (state) {
      state.theme =
        userTheme;

      state.themeMode =
        state.themeMode || userTheme;
    }

    safeStorageSet(
      storage,
      getStorageKey("theme"),
      userTheme
    );

    applyThemeDom({
      dom,
      theme:
        userTheme,
      themeMode:
        state?.themeMode || userTheme,
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
  themeMode = "",
} = {}) {
  const normalizedMode =
    themeMode
      ? normalizeThemeMode(themeMode)
      : VALID_THEME_MODES.includes(theme)
        ? normalizeThemeMode(theme)
        : "";

  const normalizedTheme =
    normalizedMode
      ? resolveThemeFromMode(normalizedMode)
      : normalizeTheme(theme);

  const finalMode =
    normalizedMode ||
    normalizedTheme;

  safeSetState(
    setState,
    {
      theme:
        normalizedTheme,

      themeMode:
        finalMode,
    },
    {
      source:
        "core-session:setTheme",
    }
  );

  safeStorageSet(
    storage,
    getStorageKey("theme"),
    normalizedTheme
  );

  safeStorageSet(
    storage,
    getStorageKey("themeMode"),
    finalMode
  );

  safeStorageSet(
    storage,
    getStorageKey("appearance"),
    finalMode
  );

  applyThemeDom({
    dom,
    theme:
      normalizedTheme,
    themeMode:
      finalMode,
  });

  try {
    if (
      isBrowser() &&
      window.__ONION_THEME__?.set &&
      themeMode
    ) {
      window.__ONION_THEME__.set(
        finalMode,
        {
          source:
            "core-session:setTheme",
          emit:
            false,
        }
      );
    }
  } catch {}

  safeEmit(
    events,
    SESSION_EVENTS.themeChange,
    {
      theme:
        normalizedTheme,

      themeMode:
        finalMode,

      changedAt:
        safeNowIso(),
    }
  );

  return normalizedTheme;
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
    },
    {
      source:
        "core-session:setLang",
    }
  );

  safeStorageSet(
    storage,
    getStorageKey("lang"),
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

      changedAt:
        safeNowIso(),
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
    },
    {
      source:
        "core-session:setSidebarOpen",
    }
  );

  safeStorageSet(
    storage,
    getStorageKey("sidebarOpen"),
    next
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

      changedAt:
        safeNowIso(),
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
    },
    {
      source:
        "core-session:setLoading",
    }
  );

  toggleClass(
    dom?.html,
    "app-loading",
    next
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

  setDataset(
    dom?.html,
    "appLoading",
    next ? "true" : "false"
  );

  setDataset(
    dom?.body,
    "appLoading",
    next ? "true" : "false"
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

    setAttribute(
      dom.loader,
      "aria-busy",
      String(next)
    );

    setDataset(
      dom.loader,
      "loaderVisible",
      next ? "true" : "false"
    );

    setDataset(
      dom.loader,
      "loaderState",
      next ? "visible" : "hidden"
    );
  }

  safeEmit(
    events,
    SESSION_EVENTS.loadingChange,
    {
      loading:
        next,

      changedAt:
        safeNowIso(),
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
    },
    {
      source:
        "core-session:setError",
    }
  );

  safeEmit(
    events,
    SESSION_EVENTS.error,
    {
      error:
        sanitizeForEvent(normalized),

      hasError:
        Boolean(normalized),

      changedAt:
        safeNowIso(),
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
    version:
      SESSION_VERSION,

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
      safeRedact(
        safeGetUserAvatarUrl(state?.user) || ""
      ),

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
      state?.theme || config.defaultTheme || DEFAULT_THEME,

    themeMode:
      state?.themeMode || null,

    lang:
      state?.lang || config.defaultLang || DEFAULT_LANG,

    sidebarOpen:
      typeof state?.sidebarOpen === "boolean"
        ? state.sidebarOpen
        : null,

    hasUser:
      hasUsableUser(state?.user),

    at:
      safeNowIso(),
  };
}

export default {
  SESSION_VERSION,

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

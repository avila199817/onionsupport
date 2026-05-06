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
   - normalizar red/network/ui/boot/session
   - proteger snapshots frente a token leakage

   HARDENING EXTREMO:
   - estado inicial robusto
   - route/publicPath siempre definidos
   - currentResolvedUsername persistente
   - patches seguros e idempotentes
   - auth derivada consistente
   - canonical route sin query/hash
   - publicPath con query/hash
   - snapshots sin token real por defecto
   - patch de evento sin contaminación de estado completo
   - updatedAt/stateChangeCount solo si hay cambios reales
   - cero undefined setters
   - cero throws accidentales salvo estado raíz inválido
   - compatible con AppCore.setState() como emisor público
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

const DEFAULT_LANG =
  "es";

const DEFAULT_THEME =
  "dark";

const STATE_VERSION =
  "11.0.0";

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

const VALID_NETWORK_STATUSES =
  Object.freeze([
    "online",
    "offline",
    "unknown",
  ]);

const VALID_LANG_RE =
  /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

const BOOLEAN_KEYS =
  Object.freeze([
    "initialized",
    "booting",
    "ready",
    "appReady",
    "appFatal",
    "coreInitializing",
    "coreReady",
    "loading",
    "sidebarOpen",
    "shellVisible",
    "chromeVisible",
    "appShellVisible",
    "shellBusy",
    "hasError",
    "authenticated",
    "hasToken",
    "online",
    "offline",
    "networkOnline",
    "networkOffline",
  ]);

const NULLABLE_STRING_KEYS =
  Object.freeze([
    "role",
    "username",
    "currentResolvedUsername",
    "resolvedUsername",
    "lastRoute",
    "lastPublicPath",
    "lastRequestAt",
    "lastRequestUrl",
    "lastRequestMethod",
    "bootPhase",
    "mainPhase",
    "mainReason",
    "bootInitialUrl",
    "bootInitialPath",
    "bootCanonicalPath",
    "bootProtectedInitialUrl",
    "bootProtectedInitialPath",
    "bootProtectedRouteKey",
    "bootCapturedAt",
    "bootActivationInitialUrl",
    "bootActivationInitialPath",
    "bootResetConfirmInitialUrl",
    "bootResetConfirmInitialPath",
  ]);

const SENSITIVE_STATE_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "idToken",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "mfaToken",
    "mfa_token",
    "twoFactorToken",
    "two_factor_token",
    "password",
    "otp",
    "code",
  ]);

const REDACTABLE_PATH_KEYS =
  Object.freeze([
    "route",
    "publicPath",
    "lastRoute",
    "lastPublicPath",
    "lastRequestUrl",
    "bootInitialUrl",
    "bootInitialPath",
    "bootCanonicalPath",
    "bootProtectedInitialUrl",
    "bootProtectedInitialPath",
    "bootActivationInitialUrl",
    "bootActivationInitialPath",
    "bootResetConfirmInitialUrl",
    "bootResetConfirmInitialPath",
  ]);

const INTERNAL_STATE_PATCH_EVENT =
  "app:state:patched";

/* =========================================================
   BASIC HELPERS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isAnyObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isFunction(value) {
  return typeof value === "function";
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

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "enabled",
        "active",
      ].includes(clean)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
      ].includes(clean)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeCloneValue(value, fallback = null) {
  try {
    const cloned =
      safeClone(value);

    if (cloned !== undefined) {
      return cloned;
    }
  } catch {}

  if (Array.isArray(value)) {
    return value.map((item) =>
      safeCloneValue(item, item)
    );
  }

  if (isObject(value)) {
    try {
      return JSON.parse(
        JSON.stringify(value)
      );
    } catch {
      return {
        ...value,
      };
    }
  }

  return value === undefined
    ? fallback
    : value;
}

function safeRedact(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    return redactTokenInText(raw);
  } catch {
    return raw;
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
  if (!user) {
    return null;
  }

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

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeTheme(theme = DEFAULT_THEME) {
  const value =
    safeLower(
      theme,
      DEFAULT_THEME
    );

  return VALID_THEMES.includes(value)
    ? value
    : DEFAULT_THEME;
}

function normalizeThemeMode(themeMode = "") {
  const value =
    safeLower(
      themeMode,
      ""
    );

  if (!value) {
    return "";
  }

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
    : "";
}

function normalizeLang(lang = DEFAULT_LANG) {
  const value =
    safeLower(
      lang,
      DEFAULT_LANG
    );

  return VALID_LANG_RE.test(value)
    ? value
    : DEFAULT_LANG;
}

function normalizeNetworkStatus(value = "") {
  const clean =
    safeLower(value, "");

  return VALID_NETWORK_STATUSES.includes(clean)
    ? clean
    : "";
}

function normalizeHttpMethod(value = "") {
  const method =
    safeText(value, "")
      .toUpperCase();

  return method || null;
}

function normalizeError(value = null) {
  if (!value) {
    return null;
  }

  try {
    return cloneError(value);
  } catch {
    if (value instanceof Error) {
      return {
        name:
          value.name || "Error",

        message:
          value.message || "Error",
      };
    }

    return value;
  }
}

function resolveOnlineState() {
  try {
    if (typeof navigator !== "undefined") {
      return navigator.onLine !== false;
    }
  } catch {}

  return true;
}

function resolveNetworkPatchFromOnline(onlineValue) {
  const online =
    onlineValue === null
      ? null
      : Boolean(onlineValue);

  const offline =
    online === null
      ? null
      : !online;

  return {
    online,
    offline,
    networkOnline:
      online,
    networkOffline:
      offline,
    networkStatus:
      online === null
        ? "unknown"
        : online
          ? "online"
          : "offline",
  };
}

function resolveNetworkPatchFromOffline(offlineValue) {
  const offline =
    offlineValue === null
      ? null
      : Boolean(offlineValue);

  const online =
    offline === null
      ? null
      : !offline;

  return {
    online,
    offline,
    networkOnline:
      online,
    networkOffline:
      offline,
    networkStatus:
      online === null
        ? "unknown"
        : online
          ? "online"
          : "offline",
  };
}

function resolveNetworkPatchFromStatus(statusValue) {
  const status =
    normalizeNetworkStatus(statusValue);

  if (status === "online") {
    return resolveNetworkPatchFromOnline(true);
  }

  if (status === "offline") {
    return resolveNetworkPatchFromOnline(false);
  }

  if (status === "unknown") {
    return resolveNetworkPatchFromOnline(null);
  }

  return {};
}

function resolveRole(user = null, explicitRole = "") {
  const role =
    safeLower(
      explicitRole ||
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
    );

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

function resolveUsernameFromUser(user = null) {
  return (
    sanitizeUsername(
      safeGetUserUsername(user) ||
        user?.username ||
        user?.userName ||
        user?.nick ||
        user?.alias ||
        user?.login ||
        user?.slug ||
        user?.email ||
        ""
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
    resolveUsernameFromUser(user);

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

/* =========================================================
   PATCH / DIFF HELPERS
========================================================= */

function sanitizePatchInput(patch = {}) {
  const output = {};

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
      Para limpiar valor se usa null.
    */
    if (value !== undefined) {
      output[key] = value;
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

function compactChangedKeys(keys = []) {
  return Array.from(
    new Set(
      keys.filter(Boolean)
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
    - token válido requerido.
    - usuario inactive/disabled bloquea auth.
    - usuario null con token válido permite estado técnico
      autenticado hasta que /me complete o falle.
  */
  if (!validToken) {
    return false;
  }

  if (
    normalizedUser &&
    (
      normalizedUser.active === false ||
      normalizedUser.disabled === true ||
      normalizedUser.deleted === true ||
      normalizedUser.status === "disabled" ||
      normalizedUser.status === "inactive" ||
      normalizedUser.estado === "disabled" ||
      normalizedUser.estado === "inactive"
    )
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
        ? resolveRole(
            nextUser,
            hasOwn(patch, "role")
              ? patch.role
              : state.role
          )
        : null,

    username:
      authenticated
        ? resolveUsernameFromUser(nextUser)
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
      config?.defaultLang ||
        config?.lang ||
        DEFAULT_LANG
    );

  const theme =
    normalizeTheme(
      config?.defaultTheme ||
        config?.theme ||
        DEFAULT_THEME
    );

  const themeMode =
    normalizeThemeMode(
      config?.defaultThemeMode ||
        config?.themeMode ||
        config?.appearance ||
        ""
    ) || "";

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

    appReady:
      false,

    appFatal:
      false,

    coreInitializing:
      false,

    coreReady:
      false,

    loading:
      true,

    bootPhase:
      "",

    mainPhase:
      "",

    mainReason:
      "",

    mainUpdatedAt:
      null,

    coreInitCycle:
      0,

    coreVersion:
      STATE_VERSION,

    coreReadyAt:
      null,

    coreErrorAt:
      null,

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

    themeMode:
      themeMode || null,

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

    lastRequestStatus:
      null,

    requestPending:
      0,

    bootInitialUrl:
      "",

    bootInitialPath:
      "",

    bootCanonicalPath:
      "",

    bootProtectedInitialUrl:
      "",

    bootProtectedInitialPath:
      "",

    bootProtectedRouteKey:
      "",

    bootHasProtectedToken:
      false,

    bootCapturedAt:
      "",

    bootIsActivation:
      false,

    bootHasActivationToken:
      false,

    bootActivationInitialUrl:
      "",

    bootActivationInitialPath:
      "",

    bootIsResetConfirm:
      false,

    bootHasResetToken:
      false,

    bootResetConfirmInitialUrl:
      "",

    bootResetConfirmInitialPath:
      "",

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

function sanitizeSnapshotValue(key, value, options = {}) {
  const includeToken =
    options?.includeToken === true;

  if (SENSITIVE_STATE_KEYS.includes(key)) {
    if (includeToken && key === "token") {
      return value || null;
    }

    return value
      ? "***"
      : null;
  }

  if (REDACTABLE_PATH_KEYS.includes(key)) {
    return safeRedact(value || "");
  }

  if (
    key === "error" ||
    key === "lastError"
  ) {
    return normalizeError(value);
  }

  return value;
}

export function cloneState(state, options = {}) {
  const opts =
    isObject(options)
      ? options
      : {};

  const source =
    state && typeof state === "object"
      ? state
      : {};

  const raw =
    safeCloneValue(
      source,
      {}
    ) || {};

  const snapshot = {};

  for (const [key, value] of Object.entries(raw)) {
    snapshot[key] =
      sanitizeSnapshotValue(
        key,
        value,
        opts
      );
  }

  snapshot.__version =
    source.__version || STATE_VERSION;

  snapshot.user =
    source.user
      ? safeCloneValue(
          source.user,
          source.user
        )
      : null;

  snapshot.token =
    opts.includeToken === true
      ? source.token || null
      : null;

  snapshot.hasToken =
    Boolean(
      safeHasValidToken(source.token)
    );

  snapshot.lastError =
    normalizeError(
      source.lastError ||
        source.error
    );

  snapshot.error =
    normalizeError(
      source.error ||
        source.lastError
    );

  snapshot.route =
    safeCanonicalPath(
      source.route || DEFAULT_ROUTE
    );

  snapshot.publicPath =
    safeRedact(
      safePublicPath(
        source.publicPath ||
          source.route ||
          DEFAULT_ROUTE
      )
    );

  snapshot.lastRoute =
    source.lastRoute
      ? safeCanonicalPath(
          source.lastRoute,
          DEFAULT_ROUTE
        )
      : null;

  snapshot.lastPublicPath =
    source.lastPublicPath
      ? safeRedact(
          safePublicPath(
            source.lastPublicPath,
            DEFAULT_ROUTE
          )
        )
      : null;

  snapshot.lastRequestUrl =
    safeRedact(
      source.lastRequestUrl || ""
    );

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
    safeCloneValue(
      patch || {},
      {}
    ) || {};

  for (const key of SENSITIVE_STATE_KEYS) {
    if (hasOwn(cloned, key)) {
      cloned[key] =
        cloned[key]
          ? "***"
          : null;
    }
  }

  for (const key of REDACTABLE_PATH_KEYS) {
    if (hasOwn(cloned, key)) {
      cloned[key] =
        safeRedact(
          cloned[key] || ""
        );
    }
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

function normalizeRoutePatch(state, normalizedPatch) {
  const routeWasProvided =
    hasOwn(normalizedPatch, "route");

  const publicPathWasProvided =
    hasOwn(normalizedPatch, "publicPath");

  if (routeWasProvided) {
    const nextRoute =
      safeCanonicalPath(
        normalizedPatch.route,
        state.route || DEFAULT_ROUTE
      );

    if (
      nextRoute !== state.route &&
      !hasOwn(normalizedPatch, "lastRoute")
    ) {
      normalizedPatch.lastRoute =
        state.route || null;
    }

    normalizedPatch.route =
      nextRoute;
  }

  if (publicPathWasProvided) {
    const nextPublicPath =
      safePublicPath(
        normalizedPatch.publicPath,
        state.publicPath ||
          state.route ||
          DEFAULT_ROUTE
      );

    if (
      nextPublicPath !== state.publicPath &&
      !hasOwn(normalizedPatch, "lastPublicPath")
    ) {
      normalizedPatch.lastPublicPath =
        state.publicPath || null;
    }

    normalizedPatch.publicPath =
      nextPublicPath;
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

  if (
    routeWasProvided &&
    !publicPathWasProvided &&
    !state.publicPath
  ) {
    normalizedPatch.publicPath =
      safePublicPath(
        normalizedPatch.route,
        normalizedPatch.route
      );
  }

  if (
    publicPathWasProvided &&
    !routeWasProvided
  ) {
    const publicPathCanonical =
      safeCanonicalPath(
        normalizedPatch.publicPath,
        state.route || DEFAULT_ROUTE
      );

    if (!state.route) {
      normalizedPatch.route =
        publicPathCanonical;
    }
  }

  return normalizedPatch;
}

function normalizeBootPatch(normalizedPatch) {
  for (const key of [
    "bootInitialPath",
    "bootCanonicalPath",
    "bootProtectedInitialPath",
    "bootActivationInitialPath",
    "bootResetConfirmInitialPath",
  ]) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] =
        normalizedPatch[key]
          ? safePublicPath(
              normalizedPatch[key],
              DEFAULT_ROUTE
            )
          : "";
    }
  }

  for (const key of [
    "bootInitialUrl",
    "bootProtectedInitialUrl",
    "bootActivationInitialUrl",
    "bootResetConfirmInitialUrl",
  ]) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] =
        safeText(
          normalizedPatch[key],
          ""
        );
    }
  }

  for (const key of [
    "bootIsActivation",
    "bootHasActivationToken",
    "bootIsResetConfirm",
    "bootHasResetToken",
    "bootHasProtectedToken",
  ]) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] =
        Boolean(
          normalizedPatch[key]
        );
    }
  }

  return normalizedPatch;
}

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

  normalizeRoutePatch(
    state,
    normalizedPatch
  );

  normalizeBootPatch(
    normalizedPatch
  );

  if (hasOwn(normalizedPatch, "theme")) {
    normalizedPatch.theme =
      normalizeTheme(
        normalizedPatch.theme
      );
  }

  if (hasOwn(normalizedPatch, "themeMode")) {
    normalizedPatch.themeMode =
      normalizeThemeMode(
        normalizedPatch.themeMode
      ) || null;
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

  for (const key of NULLABLE_STRING_KEYS) {
    if (hasOwn(normalizedPatch, key)) {
      normalizedPatch[key] =
        normalizedPatch[key] === null
          ? null
          : safeText(
              normalizedPatch[key],
              ""
            ) || null;
    }
  }

  if (hasOwn(normalizedPatch, "online")) {
    Object.assign(
      normalizedPatch,
      resolveNetworkPatchFromOnline(
        normalizedPatch.online
      )
    );
  }

  if (hasOwn(normalizedPatch, "offline")) {
    Object.assign(
      normalizedPatch,
      resolveNetworkPatchFromOffline(
        normalizedPatch.offline
      )
    );
  }

  if (hasOwn(normalizedPatch, "networkStatus")) {
    Object.assign(
      normalizedPatch,
      resolveNetworkPatchFromStatus(
        normalizedPatch.networkStatus
      )
    );
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
      safeText(
        normalizedPatch.lastRequestUrl,
        ""
      ) || null;
  }

  if (hasOwn(normalizedPatch, "lastRequestMethod")) {
    normalizedPatch.lastRequestMethod =
      normalizeHttpMethod(
        normalizedPatch.lastRequestMethod
      );
  }

  if (hasOwn(normalizedPatch, "lastRequestStatus")) {
    const status =
      safeNumber(
        normalizedPatch.lastRequestStatus,
        0
      );

    normalizedPatch.lastRequestStatus =
      status > 0
        ? status
        : null;
  }

  if (hasOwn(normalizedPatch, "requestPending")) {
    normalizedPatch.requestPending =
      Math.max(
        0,
        safeNumber(
          normalizedPatch.requestPending,
          0
        )
      );
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
    compactChangedKeys([
      ...changedKeys,
      "updatedAt",
      "stateChangeCount",
    ]);

  Object.assign(
    state,
    normalizedPatch
  );

  const nextSnapshot =
    cloneState(state);

  /*
    Importante:
    AppCore.setState() emite app:state:change y eventos derivados.
    Aquí sólo dejamos un evento interno de diagnóstico para evitar
    doble app:state:change.
  */
  try {
    events?.emit?.(
      INTERNAL_STATE_PATCH_EVENT,
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
  const source =
    state && typeof state === "object"
      ? state
      : {};

  return {
    version:
      source.__version || STATE_VERSION,

    initialized:
      Boolean(source.initialized),

    booting:
      Boolean(source.booting),

    ready:
      Boolean(source.ready),

    appReady:
      Boolean(source.appReady),

    appFatal:
      Boolean(source.appFatal),

    coreInitializing:
      Boolean(source.coreInitializing),

    coreReady:
      Boolean(source.coreReady),

    loading:
      Boolean(source.loading),

    bootPhase:
      source.bootPhase || "",

    mainPhase:
      source.mainPhase || "",

    mainReason:
      source.mainReason || "",

    coreInitCycle:
      safeNumber(
        source.coreInitCycle,
        0
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

    lastRoute:
      source.lastRoute || null,

    lastPublicPath:
      safeRedact(
        source.lastPublicPath || ""
      ) || null,

    authenticated:
      Boolean(source.authenticated),

    hasToken:
      Boolean(
        safeHasValidToken(source.token)
      ),

    role:
      source.role || null,

    username:
      source.username || null,

    displayName:
      safeGetUserDisplayName(source.user),

    avatarUrl:
      safeGetUserAvatarUrl(source.user),

    currentResolvedUsername:
      source.currentResolvedUsername || null,

    resolvedUsername:
      source.resolvedUsername || null,

    lang:
      source.lang || DEFAULT_LANG,

    theme:
      source.theme || DEFAULT_THEME,

    themeMode:
      source.themeMode || null,

    sidebarOpen:
      typeof source.sidebarOpen === "boolean"
        ? source.sidebarOpen
        : null,

    shellVisible:
      typeof source.shellVisible === "boolean"
        ? source.shellVisible
        : null,

    chromeVisible:
      typeof source.chromeVisible === "boolean"
        ? source.chromeVisible
        : null,

    appShellVisible:
      typeof source.appShellVisible === "boolean"
        ? source.appShellVisible
        : null,

    shellBusy:
      typeof source.shellBusy === "boolean"
        ? source.shellBusy
        : null,

    online:
      source.online ?? null,

    offline:
      source.offline ?? null,

    networkOnline:
      source.networkOnline ?? null,

    networkOffline:
      source.networkOffline ?? null,

    networkStatus:
      source.networkStatus || "",

    hasError:
      Boolean(source.hasError),

    lastRequestAt:
      source.lastRequestAt || null,

    lastRequestUrl:
      safeRedact(
        source.lastRequestUrl || ""
      ),

    lastRequestMethod:
      source.lastRequestMethod || null,

    lastRequestStatus:
      source.lastRequestStatus || null,

    requestPending:
      safeNumber(
        source.requestPending,
        0
      ),

    boot: {
      bootInitialUrl:
        safeRedact(
          source.bootInitialUrl || ""
        ),

      bootInitialPath:
        safeRedact(
          source.bootInitialPath || ""
        ),

      bootCanonicalPath:
        safeRedact(
          source.bootCanonicalPath || ""
        ),

      bootProtectedInitialUrl:
        safeRedact(
          source.bootProtectedInitialUrl || ""
        ),

      bootProtectedInitialPath:
        safeRedact(
          source.bootProtectedInitialPath || ""
        ),

      bootProtectedRouteKey:
        source.bootProtectedRouteKey || "",

      bootHasProtectedToken:
        Boolean(source.bootHasProtectedToken),

      bootCapturedAt:
        source.bootCapturedAt || "",

      bootIsActivation:
        Boolean(source.bootIsActivation),

      bootHasActivationToken:
        Boolean(source.bootHasActivationToken),

      bootActivationInitialUrl:
        safeRedact(
          source.bootActivationInitialUrl || ""
        ),

      bootActivationInitialPath:
        safeRedact(
          source.bootActivationInitialPath || ""
        ),

      bootIsResetConfirm:
        Boolean(source.bootIsResetConfirm),

      bootHasResetToken:
        Boolean(source.bootHasResetToken),

      bootResetConfirmInitialUrl:
        safeRedact(
          source.bootResetConfirmInitialUrl || ""
        ),

      bootResetConfirmInitialPath:
        safeRedact(
          source.bootResetConfirmInitialPath || ""
        ),
    },

    stateChangeCount:
      safeNumber(
        source.stateChangeCount,
        0
      ),

    createdAt:
      source.createdAt || "",

    updatedAt:
      source.updatedAt || "",
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

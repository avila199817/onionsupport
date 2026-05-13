/* =========================================================
   Onion SPA - Store Core Sync
   Archivo: src/store/core-sync.js

   ONION SUPPORT · STORE CORE SYNC
   APPCORE EVENT BRIDGE · ROUTER/AUTH/UI SYNC · 14/10

   Responsabilidades:
   - enlazar Store con AppCore mediante event bus
   - hidratar slices reactivos desde eventos globales
   - mantener session/ui/router sincronizados
   - evitar listeners duplicados
   - cleanup seguro de suscripciones
   - tolerar payload directo o CustomEvent.detail
   - sincronizar auth/session/router/ui sin estados fantasma
   - no romper si AppCore llega parcial

   HARDENING EXTREMO:
   - listeners envueltos con try/catch
   - unbind idempotente
   - fallback DOM events si AppCore.events no existe
   - soporte payload directo AppCore.events.emit(payload)
   - soporte payload DOM CustomEvent({ detail })
   - soporte payload envelope: { state }, { data }, { payload }, { auth }, { session }
   - sync robusto app/session/ui/router
   - evita perder false/null válidos
   - no fuerza sesión autenticada sin token + user usable
   - no ensucia rutas técnicas con token
   - no duplica listeners si Store.init() se llama dos veces
   - compatible con Store actions actuales
========================================================= */

import { isBrowser } from "./helpers.js";

import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_CORE_SYNC_VERSION =
  "14.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const SYNC_SCOPE =
  "store:core-sync";

const DEFAULT_ROUTE =
  "/";

const DEFAULT_THEME =
  "dark";

const DEFAULT_LANG =
  "es";

const BAD_TOKEN_VALUES =
  Object.freeze([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "nan",
    "none",
    "empty",
    "[object object]",
    "{}",
    "[]",
    "\"\"",
    "''",
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

const ROUTE_EVENT_NAMES =
  Object.freeze([
    "app:route:change",
    "app:public-path:change",
    "router:before-render",
    "router:rendered",
    "router:navigation:complete",
    "router:render:async-complete",
  ]);

const SESSION_APPLY_EVENT_NAMES =
  Object.freeze([
    "app:session:applied",
    "auth:session:applied",
    "auth:login:session-committed",

    "auth:session:restored",
    "app:session:restored",

    "auth:refresh:success",
    "app:auth:ready",

    "app:auth:change",
    "auth:change",

    "auth:login:success",

    "app:user:change",
    "app:user:updated",
  ]);

const SESSION_CLEAR_EVENT_NAMES =
  Object.freeze([
    "app:session:cleared",
    "auth:session:cleared",
    "auth:logout",
    "auth:logout:success",
  ]);

const UI_EVENT_NAMES =
  Object.freeze([
    "app:theme:change",
    "onion:theme:change",
    "theme:change",

    "app:lang:change",
    "app:sidebar:change",
    "app:title:change",
    "app:loading:change",

    "app:error",
    "app:error:clear",
  ]);

const BOOT_EVENT_NAMES =
  Object.freeze([
    "app:core:ready",
    "app:ready",
    "app:boot:ready",
    "app:boot:error",

    "main:ready",
    "main:booting",
    "main:boot:error",
  ]);

const AUTH_FLOW_EVENT_NAMES =
  Object.freeze([
    "auth:login:start",
    "auth:login:error",

    "auth:restore:start",
    "auth:restore:success",
    "auth:restore:error",

    "auth:refresh:start",
    "auth:refresh:error",
  ]);

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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
  return safeText(value, fallback)
    .toLowerCase();
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "open",
        "enabled",
        "active",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "closed",
        "disabled",
        "inactive",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function hasOwn(object, key) {
  try {
    return Boolean(
      object &&
        typeof object === "object" &&
        Object.prototype.hasOwnProperty.call(
          object,
          key
        )
    );
  } catch {
    return false;
  }
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function pickNonEmpty(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function pickText(...values) {
  for (const value of values) {
    const text =
      safeText(value, "");

    if (text) {
      return text;
    }
  }

  return "";
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/* =========================================================
   LOGGING
========================================================= */

function safeWarn(AppCore, ...args) {
  let logged =
    false;

  try {
    if (isFn(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[StoreCoreSync]",
        ...args
      );

      logged =
        true;
    }
  } catch {
    logged =
      false;
  }

  if (logged) {
    return;
  }

  try {
    console.warn(
      "[StoreCoreSync]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  let logged =
    false;

  try {
    if (isFn(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[StoreCoreSync]",
        ...args
      );

      logged =
        true;
    }
  } catch {
    logged =
      false;
  }

  if (logged) {
    return;
  }

  try {
    console.error(
      "[StoreCoreSync]",
      ...args
    );
  } catch {}
}

function safeEmit(AppCore, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   TOKEN / USER SAFETY
========================================================= */

function stripBearerPrefix(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearerPrefix(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (BAD_TOKEN_VALUES.includes(lower)) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  return true;
}

function normalizeToken(token = null) {
  const value =
    stripBearerPrefix(token);

  return hasUsableToken(value)
    ? value
    : null;
}

function hasUsableUser(user = null) {
  if (!isObject(user)) {
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
    safeLower(
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
      "revoked",
      "desactivado",
      "inactivo",
      "bloqueado",
      "eliminado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  return USER_ID_KEYS.some((key) =>
    Boolean(
      safeText(user?.[key], "")
    )
  );
}

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  const list =
    Array.isArray(value)
      ? value.flat(Infinity)
      : value === null || value === undefined
        ? []
        : [value];

  return Array.from(
    new Set(
      list
        .map(normalizeRole)
        .filter(Boolean)
    )
  );
}

function collectRoles(user = null, explicitRole = null, explicitRoles = null) {
  const source =
    safeObject(user);

  const raw =
    safeObject(source.raw);

  const profile =
    safeObject(source.profile);

  const roles = [
    explicitRole,
    explicitRoles,

    source.role,
    source.rol,
    source.userRole,
    source.user_role,
    source.type,
    source.userType,
    source.user_type,
    source.perfil,
    source.roles,
    source.permissions,
    source.scopes,

    profile.role,
    profile.rol,
    profile.roles,
    profile.permissions,
    profile.scopes,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.roles,
    raw.permissions,
    raw.scopes,
  ];

  if (
    source.isAdmin === true ||
    source.admin === true ||
    source.superAdmin === true ||
    source.isSuperAdmin === true ||
    raw.isAdmin === true ||
    raw.admin === true
  ) {
    roles.push("admin");
  }

  return normalizeRoles(
    roles.flat(Infinity)
  );
}

function resolvePrimaryRole(user = null, role = null, roles = null) {
  const normalizedRole =
    normalizeRole(role);

  if (normalizedRole) {
    return normalizedRole;
  }

  const list =
    collectRoles(
      user,
      role,
      roles
    );

  return list[0] || null;
}

/* =========================================================
   EVENT PAYLOAD
========================================================= */

function unwrapDetail(eventOrPayload = {}) {
  const payload =
    eventOrPayload;

  if (
    payload &&
    typeof payload === "object" &&
    hasOwn(payload, "detail") &&
    payload.detail !== undefined
  ) {
    return payload.detail;
  }

  return payload;
}

function unwrapPayload(eventOrPayload = {}) {
  const payload =
    unwrapDetail(eventOrPayload);

  if (!isObject(payload)) {
    return {};
  }

  if (
    isObject(payload.payload) &&
    (
      hasOwn(payload, "type") ||
      hasOwn(payload, "detail") ||
      hasOwn(payload, "event")
    )
  ) {
    return payload.payload;
  }

  return payload;
}

function resolveEventPayload(eventOrPayload = {}) {
  return safeObject(
    unwrapPayload(eventOrPayload)
  );
}

function resolveStatePayload(eventOrPayload = {}) {
  const payload =
    resolveEventPayload(eventOrPayload);

  const data =
    safeObject(payload.data);

  const auth =
    safeObject(payload.auth);

  const session =
    safeObject(payload.session);

  return safeObject(
    payload.state ||
      payload.nextState ||
      payload.after ||
      payload.current ||
      payload.coreState ||
      data.state ||
      data.current ||
      auth.state ||
      session.state ||
      payload
  );
}

function resolveNestedData(payload = {}) {
  const root =
    safeObject(payload);

  return {
    root,

    data:
      safeObject(root.data),

    payload:
      safeObject(root.payload),

    auth:
      safeObject(root.auth),

    session:
      safeObject(root.session),

    user:
      safeObject(root.user),

    usuario:
      safeObject(root.usuario),

    me:
      safeObject(root.me),

    account:
      safeObject(root.account),

    profile:
      safeObject(root.profile),
  };
}

/* =========================================================
   CORE / STORE ACCESS
========================================================= */

function getCoreState(AppCore) {
  return safeObject(
    AppCore?.state
  );
}

function getStoreAppState(state) {
  return safeObject(
    state?.app
  );
}

function getStoreSessionState(state) {
  return safeObject(
    state?.session
  );
}

function getStoreUiState(state) {
  return safeObject(
    state?.ui
  );
}

/* =========================================================
   BROWSER PATH FALLBACKS
========================================================= */

function normalizePath(path = DEFAULT_ROUTE) {
  let value =
    safeText(path, DEFAULT_ROUTE)
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

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return (
    safeText(path, DEFAULT_ROUTE)
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function getBrowserPathname() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    return normalizePath(
      window.location.pathname ||
        DEFAULT_ROUTE
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    return `${
      window.location.pathname || DEFAULT_ROUTE
    }${
      window.location.search || ""
    }${
      window.location.hash || ""
    }`;
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   PATCH BUILDERS
========================================================= */

function buildAppPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core =
    getCoreState(AppCore);

  const app =
    getStoreAppState(state);

  const route =
    pickText(
      source.canonicalPath,
      source.route,
      source.currentRoute,
      source.path,
      core.canonicalPath,
      core.route,
      app.route,
      getBrowserPathname(),
      DEFAULT_ROUTE
    );

  const publicPath =
    pickText(
      source.publicPath,
      source.currentPublicPath,
      source.requestedPath,
      source.href,
      source.url,
      source.path,
      core.publicPath,
      app.publicPath,
      getBrowserPublicPath(),
      route,
      DEFAULT_ROUTE
    );

  return {
    route:
      normalizePath(
        stripSearchAndHash(route || DEFAULT_ROUTE)
      ),

    publicPath:
      safeText(
        publicPath,
        route || DEFAULT_ROUTE
      ),

    loading:
      pickDefined(
        source.loading,
        source.isLoading,
        core.loading,
        app.loading,
        false
      ),

    initialized:
      pickDefined(
        source.initialized,
        core.initialized,
        app.initialized,
        false
      ),

    booting:
      pickDefined(
        source.booting,
        core.booting,
        app.booting,
        false
      ),

    ready:
      pickDefined(
        source.ready,
        core.ready,
        app.ready,
        false
      ),

    booted:
      pickDefined(
        source.booted,
        source.appReady,
        core.booted,
        core.appReady,
        app.booted,
        false
      ),

    lastError:
      pickDefined(
        source.lastError,
        source.error,
        core.lastError,
        core.error,
        app.lastError,
        null
      ),
  };
}

function resolveUserFromPayload(payload = {}, core = {}, session = {}) {
  const nested =
    resolveNestedData(payload);

  const dataSession =
    safeObject(nested.data.session);

  const dataAuth =
    safeObject(nested.data.auth);

  const payloadSession =
    safeObject(nested.payload.session);

  const payloadAuth =
    safeObject(nested.payload.auth);

  const coreSession =
    safeObject(core.session);

  const user =
    pickNonEmpty(
      nested.root.user,
      nested.root.usuario,
      nested.root.me,
      nested.root.account,
      nested.root.profile,
      nested.root.currentUser,
      nested.root.sessionUser,
      nested.root.authUser,

      nested.session.user,
      nested.session.usuario,
      nested.session.me,
      nested.session.account,
      nested.session.profile,

      nested.auth.user,
      nested.auth.usuario,
      nested.auth.me,
      nested.auth.account,
      nested.auth.profile,

      nested.data.user,
      nested.data.usuario,
      nested.data.me,
      nested.data.account,
      nested.data.profile,

      dataSession.user,
      dataSession.usuario,
      dataSession.me,
      dataSession.account,
      dataSession.profile,

      dataAuth.user,
      dataAuth.usuario,
      dataAuth.me,
      dataAuth.account,
      dataAuth.profile,

      nested.payload.user,
      nested.payload.usuario,
      nested.payload.me,
      nested.payload.account,
      nested.payload.profile,

      payloadSession.user,
      payloadSession.usuario,
      payloadSession.me,
      payloadSession.account,
      payloadSession.profile,

      payloadAuth.user,
      payloadAuth.usuario,
      payloadAuth.me,
      payloadAuth.account,
      payloadAuth.profile,

      core.user,
      core.currentUser,
      core.sessionUser,
      core.authUser,
      coreSession.user,

      session.user
    );

  return hasUsableUser(user)
    ? user
    : null;
}

function resolveTokenFromPayload(payload = {}, core = {}, session = {}) {
  const nested =
    resolveNestedData(payload);

  const dataSession =
    safeObject(nested.data.session);

  const dataAuth =
    safeObject(nested.data.auth);

  const payloadSession =
    safeObject(nested.payload.session);

  const payloadAuth =
    safeObject(nested.payload.auth);

  const coreSession =
    safeObject(core.session);

  return normalizeToken(
    pickNonEmpty(
      nested.root.token,
      nested.root.accessToken,
      nested.root.access_token,
      nested.root.jwt,
      nested.root.bearer,

      nested.session.token,
      nested.session.accessToken,
      nested.session.access_token,
      nested.session.jwt,
      nested.session.bearer,

      nested.auth.token,
      nested.auth.accessToken,
      nested.auth.access_token,
      nested.auth.jwt,
      nested.auth.bearer,

      nested.data.token,
      nested.data.accessToken,
      nested.data.access_token,
      nested.data.jwt,
      nested.data.bearer,

      dataSession.token,
      dataSession.accessToken,
      dataSession.access_token,
      dataSession.jwt,
      dataSession.bearer,

      dataAuth.token,
      dataAuth.accessToken,
      dataAuth.access_token,
      dataAuth.jwt,
      dataAuth.bearer,

      nested.payload.token,
      nested.payload.accessToken,
      nested.payload.access_token,
      nested.payload.jwt,
      nested.payload.bearer,

      payloadSession.token,
      payloadSession.accessToken,
      payloadSession.access_token,
      payloadSession.jwt,
      payloadSession.bearer,

      payloadAuth.token,
      payloadAuth.accessToken,
      payloadAuth.access_token,
      payloadAuth.jwt,
      payloadAuth.bearer,

      core.token,
      core.accessToken,
      core.access_token,
      coreSession.token,
      coreSession.accessToken,
      coreSession.access_token,

      session.token,
      session.accessToken
    )
  );
}

function resolveRefreshTokenFromPayload(payload = {}, core = {}, session = {}) {
  const nested =
    resolveNestedData(payload);

  const dataSession =
    safeObject(nested.data.session);

  const dataAuth =
    safeObject(nested.data.auth);

  const payloadSession =
    safeObject(nested.payload.session);

  const payloadAuth =
    safeObject(nested.payload.auth);

  const coreSession =
    safeObject(core.session);

  return normalizeToken(
    pickNonEmpty(
      nested.root.refreshToken,
      nested.root.refresh_token,

      nested.session.refreshToken,
      nested.session.refresh_token,

      nested.auth.refreshToken,
      nested.auth.refresh_token,

      nested.data.refreshToken,
      nested.data.refresh_token,

      dataSession.refreshToken,
      dataSession.refresh_token,

      dataAuth.refreshToken,
      dataAuth.refresh_token,

      nested.payload.refreshToken,
      nested.payload.refresh_token,

      payloadSession.refreshToken,
      payloadSession.refresh_token,

      payloadAuth.refreshToken,
      payloadAuth.refresh_token,

      core.refreshToken,
      core.refresh_token,
      coreSession.refreshToken,
      coreSession.refresh_token,

      session.refreshToken
    )
  );
}

function resolveSessionIdFromPayload(payload = {}, core = {}, session = {}) {
  const nested =
    resolveNestedData(payload);

  const dataSession =
    safeObject(nested.data.session);

  const payloadSession =
    safeObject(nested.payload.session);

  const coreSession =
    safeObject(core.session);

  return safeText(
    pickNonEmpty(
      nested.root.sessionId,
      nested.root.session_id,

      nested.session.sessionId,
      nested.session.session_id,
      nested.session.id,

      nested.data.sessionId,
      nested.data.session_id,

      dataSession.sessionId,
      dataSession.session_id,
      dataSession.id,

      nested.payload.sessionId,
      nested.payload.session_id,

      payloadSession.sessionId,
      payloadSession.session_id,
      payloadSession.id,

      core.sessionId,
      core.session_id,
      coreSession.sessionId,
      coreSession.session_id,
      coreSession.id,

      session.sessionId
    ),
    ""
  ) || null;
}

function resolveSessionUserIdFromPayload(payload = {}, core = {}, session = {}, user = null) {
  const nested =
    resolveNestedData(payload);

  const dataSession =
    safeObject(nested.data.session);

  const payloadSession =
    safeObject(nested.payload.session);

  const coreSession =
    safeObject(core.session);

  return safeText(
    pickNonEmpty(
      nested.root.sessionUserId,
      nested.root.session_user_id,
      nested.root.userId,
      nested.root.user_id,

      nested.session.sessionUserId,
      nested.session.session_user_id,
      nested.session.userId,
      nested.session.user_id,

      nested.data.sessionUserId,
      nested.data.session_user_id,
      nested.data.userId,
      nested.data.user_id,

      dataSession.sessionUserId,
      dataSession.session_user_id,
      dataSession.userId,
      dataSession.user_id,

      nested.payload.sessionUserId,
      nested.payload.session_user_id,
      nested.payload.userId,
      nested.payload.user_id,

      payloadSession.sessionUserId,
      payloadSession.session_user_id,
      payloadSession.userId,
      payloadSession.user_id,

      core.sessionUserId,
      core.session_user_id,
      core.userId,
      core.user_id,

      coreSession.sessionUserId,
      coreSession.session_user_id,
      coreSession.userId,
      coreSession.user_id,

      session.sessionUserId,

      user?.userId,
      user?.user_id,
      user?.id,
      user?.uid,
      user?.sub
    ),
    ""
  ) || null;
}

function resolveAuthenticatedSignal(payload = {}, core = {}, session = {}) {
  const nested =
    resolveNestedData(payload);

  const dataSession =
    safeObject(nested.data.session);

  const dataAuth =
    safeObject(nested.data.auth);

  const payloadSession =
    safeObject(nested.payload.session);

  const payloadAuth =
    safeObject(nested.payload.auth);

  const coreSession =
    safeObject(core.session);

  return pickDefined(
    nested.root.authenticated,
    nested.root.isAuthenticated,
    nested.root.ok && nested.root.status === "authenticated"
      ? true
      : undefined,

    nested.session.authenticated,
    nested.session.isAuthenticated,

    nested.auth.authenticated,
    nested.auth.isAuthenticated,

    nested.data.authenticated,
    nested.data.isAuthenticated,

    dataSession.authenticated,
    dataSession.isAuthenticated,

    dataAuth.authenticated,
    dataAuth.isAuthenticated,

    nested.payload.authenticated,
    nested.payload.isAuthenticated,

    payloadSession.authenticated,
    payloadSession.isAuthenticated,

    payloadAuth.authenticated,
    payloadAuth.isAuthenticated,

    core.authenticated,
    core.isAuthenticated,
    coreSession.authenticated,
    coreSession.isAuthenticated,

    session.authenticated,
    false
  );
}

function buildSessionPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core =
    getCoreState(AppCore);

  const session =
    getStoreSessionState(state);

  const user =
    resolveUserFromPayload(
      source,
      core,
      session
    );

  const token =
    resolveTokenFromPayload(
      source,
      core,
      session
    );

  const refreshToken =
    resolveRefreshTokenFromPayload(
      source,
      core,
      session
    );

  const sessionId =
    resolveSessionIdFromPayload(
      source,
      core,
      session
    );

  const sessionUserId =
    resolveSessionUserIdFromPayload(
      source,
      core,
      session,
      user
    );

  const explicitRole =
    pickDefined(
      source.role,
      source.rol,
      safeObject(source.session).role,
      safeObject(source.session).rol,
      core.role,
      core.rol,
      safeObject(core.session).role,
      safeObject(core.session).rol,
      session.role,
      user?.role,
      user?.rol,
      null
    );

  const explicitRoles =
    pickDefined(
      source.roles,
      safeObject(source.session).roles,
      core.roles,
      safeObject(core.session).roles,
      session.roles,
      user?.roles,
      null
    );

  const authSignal =
    resolveAuthenticatedSignal(
      source,
      core,
      session
    );

  const authenticated =
    safeBool(authSignal, false) &&
    hasUsableToken(token) &&
    hasUsableUser(user);

  const role =
    authenticated
      ? resolvePrimaryRole(
          user,
          explicitRole,
          explicitRoles
        )
      : null;

  const roles =
    authenticated
      ? collectRoles(
          user,
          role,
          explicitRoles
        )
      : [];

  return {
    authenticated,

    token:
      authenticated
        ? token
        : null,

    accessToken:
      authenticated
        ? token
        : null,

    refreshToken:
      refreshToken || null,

    user:
      authenticated
        ? user
        : null,

    role,
    roles,

    sessionId:
      sessionId || null,

    sessionUserId:
      sessionUserId || null,

    isAdmin:
      roles.includes("admin") ||
      roles.includes("administrator") ||
      roles.includes("administrador") ||
      roles.includes("superadmin") ||
      roles.includes("owner") ||
      roles.includes("root"),
  };
}

function buildUiPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core =
    getCoreState(AppCore);

  const ui =
    getStoreUiState(state);

  const theme =
    pickDefined(
      source.theme,
      source.mode,
      source.resolvedTheme,
      core.theme,
      ui.theme,
      DEFAULT_THEME
    );

  const lang =
    pickDefined(
      source.lang,
      source.locale,
      core.lang,
      ui.lang,
      DEFAULT_LANG
    );

  const sidebarOpen =
    pickDefined(
      source.sidebarOpen,
      source.open,
      core.sidebarOpen,
      ui.sidebarOpen,
      true
    );

  return {
    theme,

    themePreference:
      pickDefined(
        source.themePreference,
        source.themeMode,
        source.appearance,
        core.themePreference,
        core.themeMode,
        ui.themePreference,
        theme
      ),

    lang,

    sidebarOpen:
      safeBool(
        sidebarOpen,
        true
      ),

    pageTitle:
      safeTitle(AppCore),

    topbarTitle:
      safeTopbarTitle(AppCore),
  };
}

function syncFromCore({
  AppCore,
  state,
  patch,
  source = {},
} = {}) {
  if (!isFn(patch)) {
    return false;
  }

  patch({
    app:
      buildAppPatch({
        AppCore,
        state,
        source,
      }),

    session:
      buildSessionPatch({
        AppCore,
        state,
        source,
      }),

    ui:
      buildUiPatch({
        AppCore,
        state,
        source,
      }),
  });

  return true;
}

/* =========================================================
   UNSUBSCRIBE
========================================================= */

function safeOff(fn, AppCore) {
  try {
    fn?.();
  } catch (error) {
    safeWarn(
      AppCore,
      "No se pudo limpiar listener del Store.",
      error
    );
  }
}

function normalizeUnsubscriber({
  AppCore,
  eventName,
  handler,
  rawOff,
  usedWindow = false,
} = {}) {
  if (isFn(rawOff)) {
    return rawOff;
  }

  if (
    !usedWindow &&
    isFn(AppCore?.events?.off)
  ) {
    return () => {
      try {
        AppCore.events.off(
          eventName,
          handler
        );
      } catch {}
    };
  }

  if (
    usedWindow &&
    isBrowser()
  ) {
    return () => {
      try {
        window.removeEventListener(
          eventName,
          handler
        );
      } catch {}
    };
  }

  return () => {};
}

function pushUnsubscriber(coreUnsubscribers, off) {
  if (
    Array.isArray(coreUnsubscribers) &&
    isFn(off)
  ) {
    coreUnsubscribers.push(off);
  }
}

/* =========================================================
   API · ADD EVENT
========================================================= */

export function addCoreEvent({
  AppCore,
  coreUnsubscribers,
  eventName,
  handler,
}) {
  const cleanEventName =
    safeText(eventName, "");

  if (
    !cleanEventName ||
    !isFn(handler)
  ) {
    return () => {};
  }

  const wrappedHandler = (...args) => {
    try {
      return handler(...args);
    } catch (error) {
      safeWarn(
        AppCore,
        `Error en listener "${cleanEventName}".`,
        error
      );

      return undefined;
    }
  };

  let rawOff = null;
  let usedWindow = false;

  if (isFn(AppCore?.events?.on)) {
    try {
      rawOff =
        AppCore.events.on(
          cleanEventName,
          wrappedHandler
        );
    } catch (error) {
      safeWarn(
        AppCore,
        `No se pudo registrar listener AppCore "${cleanEventName}".`,
        error
      );
    }
  }

  if (
    !rawOff &&
    isBrowser()
  ) {
    try {
      window.addEventListener(
        cleanEventName,
        wrappedHandler
      );

      usedWindow =
        true;
    } catch (error) {
      safeWarn(
        AppCore,
        `No se pudo registrar listener window "${cleanEventName}".`,
        error
      );
    }
  }

  const off =
    normalizeUnsubscriber({
      AppCore,
      eventName:
        cleanEventName,
      handler:
        wrappedHandler,
      rawOff,
      usedWindow,
    });

  pushUnsubscriber(
    coreUnsubscribers,
    off
  );

  return off;
}

/* =========================================================
   API · UNBIND
========================================================= */

export function unbindCoreEvents({
  AppCore,
  coreUnsubscribers,
} = {}) {
  while (
    Array.isArray(coreUnsubscribers) &&
    coreUnsubscribers.length
  ) {
    const off =
      coreUnsubscribers.pop();

    safeOff(
      off,
      AppCore
    );
  }

  return true;
}

/* =========================================================
   ROUTER SYNC
========================================================= */

function syncRouteEvent({
  AppCore,
  state,
  actions,
  event,
  loading = null,
} = {}) {
  const payload =
    resolveEventPayload(event);

  const core =
    getCoreState(AppCore);

  const route =
    pickText(
      payload.canonicalPath,
      payload.route,
      payload.currentRoute,
      payload.path,
      core.canonicalPath,
      core.route,
      state?.app?.route,
      getBrowserPathname(),
      DEFAULT_ROUTE
    );

  const publicPath =
    pickText(
      payload.publicPath,
      payload.currentPublicPath,
      payload.requestedPath,
      payload.href,
      payload.url,
      payload.path,
      core.publicPath,
      state?.app?.publicPath,
      getBrowserPublicPath(),
      route,
      DEFAULT_ROUTE
    );

  actions.setRoute?.(
    route || DEFAULT_ROUTE
  );

  actions.setPublicPath?.(
    publicPath || route || DEFAULT_ROUTE
  );

  if (loading !== null) {
    actions.setLoading?.(
      Boolean(loading)
    );
  }

  actions.setPageTitle?.(
    safeTitle(AppCore)
  );

  return true;
}

/* =========================================================
   SESSION SYNC
========================================================= */

function syncSessionEvent({
  AppCore,
  state,
  actions,
  patch,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  const sessionPatch =
    buildSessionPatch({
      AppCore,
      state,
      source:
        payload,
    });

  if (isFn(actions?.setSession)) {
    actions.setSession(sessionPatch);
    return true;
  }

  if (isFn(patch)) {
    patch({
      session:
        sessionPatch,
    });

    return true;
  }

  return false;
}

function clearSessionEvent({
  actions,
  patch,
} = {}) {
  if (isFn(actions?.clearSession)) {
    actions.clearSession();
    return true;
  }

  if (isFn(patch)) {
    patch({
      session: {
        authenticated:
          false,

        token:
          null,

        accessToken:
          null,

        refreshToken:
          null,

        user:
          null,

        role:
          null,

        roles:
          [],

        sessionId:
          null,

        sessionUserId:
          null,

        isAdmin:
          false,
      },
    });

    return true;
  }

  return false;
}

/* =========================================================
   UI SYNC
========================================================= */

function syncThemeEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  actions.setTheme?.(
    pickDefined(
      payload.theme,
      payload.resolvedTheme,
      payload.mode,
      getCoreState(AppCore).theme,
      state?.ui?.theme,
      DEFAULT_THEME
    )
  );

  return true;
}

function syncLangEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  actions.setLang?.(
    pickDefined(
      payload.lang,
      payload.locale,
      getCoreState(AppCore).lang,
      state?.ui?.lang,
      DEFAULT_LANG
    )
  );

  return true;
}

function syncSidebarEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  actions.setSidebarOpen?.(
    safeBool(
      pickDefined(
        payload.open,
        payload.sidebarOpen,
        getCoreState(AppCore).sidebarOpen,
        state?.ui?.sidebarOpen,
        true
      ),
      true
    )
  );

  return true;
}

function syncTitleEvent({
  AppCore,
  actions,
  event,
} = {}) {
  const payload =
    resolveEventPayload(event);

  actions.setPageTitle?.(
    payload.title ||
      safeTitle(AppCore)
  );

  if (isFn(actions?.setTopbarTitle)) {
    actions.setTopbarTitle(
      payload.topbarTitle ||
        safeTopbarTitle(AppCore)
    );
  }

  return true;
}

/* =========================================================
   BIND HELPERS
========================================================= */

function bindEventList({
  AppCore,
  coreUnsubscribers,
  eventNames = [],
  handler,
}) {
  for (const eventName of safeArray(eventNames)) {
    addCoreEvent({
      AppCore,
      coreUnsubscribers,
      eventName,
      handler,
    });
  }
}

function markStoreReady(actions) {
  actions.hydrateFromCore?.();
  actions.setInitialized?.(true);
  actions.markReady?.(true);
  actions.markBooted?.(true);
  actions.setBooting?.(false);
  actions.setLoading?.(false);

  return true;
}

function markStoreBooting(actions) {
  actions.setBooting?.(true);
  actions.setLoading?.(true);
  actions.markReady?.(false);

  return true;
}

function markStoreBootError(actions, event) {
  const payload =
    resolveEventPayload(event);

  actions.setBooting?.(false);
  actions.setLoading?.(false);
  actions.markReady?.(false);
  actions.setError?.(
    payload.error ||
      payload.message ||
      null
  );

  return true;
}

/* =========================================================
   MAIN BIND
========================================================= */

export function bindCoreEvents({
  AppCore,
  state,
  coreUnsubscribers,
  actions,
  patch,
} = {}) {
  if (
    !AppCore ||
    !state ||
    !actions ||
    !isFn(patch)
  ) {
    return false;
  }

  /*
    Evita doble binding si Store.init() se llama dos veces.
  */
  if (
    Array.isArray(coreUnsubscribers) &&
    coreUnsubscribers.length
  ) {
    return true;
  }

  safeEmit(
    AppCore,
    "store:core-sync:binding",
    {
      version:
        STORE_CORE_SYNC_VERSION,

      scope:
        SYNC_SCOPE,

      at:
        safeIsoDate(),
    }
  );

  /* =========================================
     STATE CHANGE · MASTER SYNC
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:state:change",
    handler: (event) => {
      syncFromCore({
        AppCore,
        state,
        patch,
        source:
          resolveStatePayload(event),
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:state:patched",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      syncFromCore({
        AppCore,
        state,
        patch,
        source:
          resolveStatePayload(
            payload.state ||
              payload
          ),
      });
    },
  });

  /* =========================================
     CORE READY / BOOT
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:core:ready",
    handler: () => {
      markStoreReady(actions);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:ready",
    handler: () => {
      actions.markReady?.(true);
      actions.setBooting?.(false);
      actions.setLoading?.(false);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:boot:ready",
    handler: () => {
      actions.markReady?.(true);
      actions.markBooted?.(true);
      actions.setBooting?.(false);
      actions.setLoading?.(false);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:boot:error",
    handler: (event) => {
      markStoreBootError(
        actions,
        event
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "main:ready",
    handler: () => {
      markStoreReady(actions);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "main:booting",
    handler: () => {
      markStoreBooting(actions);
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "main:boot:error",
    handler: (event) => {
      markStoreBootError(
        actions,
        event
      );
    },
  });

  /* =========================================
     UI
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:theme:change",
    handler: (event) => {
      syncThemeEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "onion:theme:change",
    handler: (event) => {
      syncThemeEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "theme:change",
    handler: (event) => {
      syncThemeEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:lang:change",
    handler: (event) => {
      syncLangEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:sidebar:change",
    handler: (event) => {
      syncSidebarEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:title:change",
    handler: (event) => {
      syncTitleEvent({
        AppCore,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:loading:change",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(
        safeBool(
          pickDefined(
            payload.loading,
            payload.isLoading,
            false
          ),
          false
        )
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:error:clear",
    handler: () => {
      actions.clearError?.();
    },
  });

  /* =========================================
     AUTH / SESSION
  ========================================= */

  bindEventList({
    AppCore,
    coreUnsubscribers,
    eventNames:
      SESSION_APPLY_EVENT_NAMES,
    handler: (event) => {
      syncSessionEvent({
        AppCore,
        state,
        actions,
        patch,
        event,
      });
    },
  });

  bindEventList({
    AppCore,
    coreUnsubscribers,
    eventNames:
      SESSION_CLEAR_EVENT_NAMES,
    handler: () => {
      clearSessionEvent({
        actions,
        patch,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:login:start",
    handler: () => {
      actions.setLoading?.(true);
      actions.setFlag?.(
        "loginInProgress",
        true
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:login:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(false);
      actions.setFlag?.(
        "loginInProgress",
        false
      );

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );

      clearSessionEvent({
        actions,
        patch,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:restore:start",
    handler: () => {
      actions.setFlag?.(
        "restoreInProgress",
        true
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:restore:success",
    handler: (event) => {
      actions.setFlag?.(
        "restoreInProgress",
        false
      );

      syncSessionEvent({
        AppCore,
        state,
        actions,
        patch,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:restore:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setFlag?.(
        "restoreInProgress",
        false
      );

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:refresh:start",
    handler: () => {
      actions.setFlag?.(
        "refreshInProgress",
        true
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "auth:refresh:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setFlag?.(
        "refreshInProgress",
        false
      );

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  /* =========================================
     ROUTER
  ========================================= */

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:route:change",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "app:public-path:change",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:before-render",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
        loading:
          true,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:rendered",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
        loading:
          false,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:navigation:complete",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
        loading:
          false,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:render:async-complete",
    handler: (event) => {
      syncRouteEvent({
        AppCore,
        state,
        actions,
        event,
        loading:
          false,
      });
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:render:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(false);

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:error",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      actions.setLoading?.(false);

      actions.setError?.(
        payload.error ||
          payload.message ||
          null
      );
    },
  });

  addCoreEvent({
    AppCore,
    coreUnsubscribers,
    eventName:
      "router:shell:state",
    handler: (event) => {
      const payload =
        resolveEventPayload(event);

      if (hasOwn(payload, "shellHidden")) {
        actions.setFlag?.(
          "shellHidden",
          Boolean(payload.shellHidden)
        );
      }

      if (hasOwn(payload, "chromeVisible")) {
        actions.setFlag?.(
          "chromeVisible",
          Boolean(payload.chromeVisible)
        );
      }

      if (hasOwn(payload, "authScreen")) {
        actions.setFlag?.(
          "authScreen",
          Boolean(payload.authScreen)
        );
      }
    },
  });

  safeEmit(
    AppCore,
    "store:core-sync:bound",
    {
      version:
        STORE_CORE_SYNC_VERSION,

      scope:
        SYNC_SCOPE,

      listeners:
        Array.isArray(coreUnsubscribers)
          ? coreUnsubscribers.length
          : 0,

      groups: {
        boot:
          BOOT_EVENT_NAMES.length,

        ui:
          UI_EVENT_NAMES.length,

        auth:
          AUTH_FLOW_EVENT_NAMES.length +
          SESSION_APPLY_EVENT_NAMES.length +
          SESSION_CLEAR_EVENT_NAMES.length,

        route:
          ROUTE_EVENT_NAMES.length,
      },

      at:
        safeIsoDate(),
    }
  );

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_CORE_SYNC_VERSION,

  addCoreEvent,
  bindCoreEvents,
  unbindCoreEvents,
};

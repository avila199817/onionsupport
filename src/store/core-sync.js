/* =========================================================
   Onion SPA - Store Core Sync
   Archivo: src/store/core-sync.js

   Store ↔ AppCore bridge limpio:
   - Un solo binding idempotente.
   - Store sigue a Core/Auth/Router/UI.
   - Token + user obligatorios para authenticated=true.
   - Rutas técnicas preservadas vía publicPath.
   - Sin event storms.
========================================================= */

import { isBrowser } from "./helpers.js";

import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_CORE_SYNC_VERSION = "15.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const SYNC_SCOPE = "store:core-sync";

const DEFAULT_ROUTE = "/";
const DEFAULT_THEME = "dark";
const DEFAULT_LANG = "es";

const BAD_TOKEN_VALUES = Object.freeze([
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

const USER_ID_KEYS = Object.freeze([
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

const STATE_EVENTS = Object.freeze([
  "app:state:change",
  "app:state:patched",
]);

const BOOT_READY_EVENTS = Object.freeze([
  "app:core:ready",
  "app:ready",
  "app:boot:ready",
  "app:boot:complete",
  "main:ready",
]);

const BOOTING_EVENTS = Object.freeze([
  "app:boot:start",
  "main:booting",
]);

const BOOT_ERROR_EVENTS = Object.freeze([
  "app:boot:error",
  "main:boot:error",
]);

const ROUTE_EVENTS = Object.freeze([
  "app:route:change",
  "app:public-path:change",
  "router:before-render",
  "router:rendered",
  "router:navigation:complete",
  "router:render:async-complete",
]);

const ROUTE_LOADING_EVENTS = new Set([
  "router:before-render",
]);

const ROUTE_DONE_EVENTS = new Set([
  "router:rendered",
  "router:navigation:complete",
  "router:render:async-complete",
]);

const SESSION_APPLY_EVENTS = Object.freeze([
  "app:session:applied",
  "app:session:loaded",
  "app:session:restored",

  "auth:session:applied",
  "auth:session:restored",
  "auth:login:success",
  "auth:login:session-committed",
  "auth:refresh:success",

  "app:auth:ready",
  "app:auth:change",
  "auth:change",

  "app:user:change",
  "app:user:updated",
]);

const SESSION_CLEAR_EVENTS = Object.freeze([
  "app:session:cleared",
  "auth:session:cleared",
  "auth:logout",
  "auth:logout:success",
]);

const THEME_EVENTS = Object.freeze([
  "app:theme:change",
  "onion:theme:change",
  "theme:change",
]);

const LANG_EVENTS = Object.freeze([
  "app:lang:change",
]);

const SIDEBAR_EVENTS = Object.freeze([
  "app:sidebar:change",
]);

const TITLE_EVENTS = Object.freeze([
  "app:title:change",
]);

const LOADING_EVENTS = Object.freeze([
  "app:loading:change",
]);

const ERROR_EVENTS = Object.freeze([
  "app:error",
]);

const CLEAR_ERROR_EVENTS = Object.freeze([
  "app:error:clear",
]);

const AUTH_START_EVENTS = Object.freeze([
  "auth:login:start",
  "auth:restore:start",
  "auth:refresh:start",
]);

const AUTH_ERROR_EVENTS = Object.freeze([
  "auth:login:error",
  "auth:restore:error",
  "auth:refresh:error",
]);

const SHELL_EVENTS = Object.freeze([
  "router:shell:state",
  "router:shell:change",
]);

/* =========================================================
   BASICS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "on", "open", "enabled", "active"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off", "closed", "disabled", "inactive"].includes(key)) {
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
        Object.prototype.hasOwnProperty.call(object, key)
    );
  } catch {
    return false;
  }
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }

  return undefined;
}

function pickNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function pickText(...values) {
  for (const value of values) {
    const text = safeText(value, "");

    if (text) return text;
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
   LOG / EMIT
========================================================= */

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[StoreCoreSync]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[StoreCoreSync]", ...args);
    }
  } catch {}
}

function safeEmit(AppCore, eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   TOKEN / USER
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const value = stripBearer(token);

  if (!value) return false;
  if (BAD_TOKEN_VALUES.includes(value.toLowerCase())) return false;
  if (/[\s\r\n\t]/.test(value)) return false;

  return true;
}

function normalizeToken(token = null) {
  const value = stripBearer(token);
  return hasUsableToken(value) ? value : null;
}

function hasUsableUser(user = null) {
  if (!isObject(user)) return false;

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

  const status = safeLower(
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

  return USER_ID_KEYS.some((key) => Boolean(safeText(user?.[key], "")));
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
  const list = Array.isArray(value)
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

function collectRoles(user = null, role = null, roles = null) {
  const source = safeObject(user);
  const profile = safeObject(source.profile);
  const raw = safeObject(source.raw);

  const list = [
    role,
    roles,

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
    list.push("admin");
  }

  return normalizeRoles(list.flat(Infinity));
}

function primaryRole(user = null, explicitRole = null, explicitRoles = null) {
  const role = normalizeRole(explicitRole);

  if (role) return role;

  return collectRoles(user, explicitRole, explicitRoles)[0] || null;
}

/* =========================================================
   PAYLOAD UNWRAP
========================================================= */

function unwrapDetail(eventOrPayload = {}) {
  if (
    eventOrPayload &&
    typeof eventOrPayload === "object" &&
    hasOwn(eventOrPayload, "detail") &&
    eventOrPayload.detail !== undefined
  ) {
    return eventOrPayload.detail;
  }

  return eventOrPayload;
}

function unwrapPayload(eventOrPayload = {}) {
  const payload = unwrapDetail(eventOrPayload);

  if (!isObject(payload)) return {};

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

function eventPayload(eventOrPayload = {}) {
  return safeObject(unwrapPayload(eventOrPayload));
}

function statePayload(eventOrPayload = {}) {
  const payload = eventPayload(eventOrPayload);
  const data = safeObject(payload.data);
  const auth = safeObject(payload.auth);
  const session = safeObject(payload.session);

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

function nested(payload = {}) {
  const root = safeObject(payload);

  return {
    root,
    data: safeObject(root.data),
    payload: safeObject(root.payload),
    auth: safeObject(root.auth),
    session: safeObject(root.session),
    user: safeObject(root.user),
    usuario: safeObject(root.usuario),
    me: safeObject(root.me),
    account: safeObject(root.account),
    profile: safeObject(root.profile),
  };
}

/* =========================================================
   STATE HELPERS
========================================================= */

function coreState(AppCore) {
  return safeObject(AppCore?.state);
}

function appState(state) {
  return safeObject(state?.app);
}

function sessionState(state) {
  return safeObject(state?.session);
}

function uiState(state) {
  return safeObject(state?.ui);
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(path = DEFAULT_ROUTE) {
  let value = safeText(path, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = DEFAULT_ROUTE;
  if (!value.startsWith("/")) value = `/${value}`;

  if (value.length > 1 && value.endsWith("/")) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
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

function browserPathname() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    return normalizePath(window.location.pathname || DEFAULT_ROUTE);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function browserPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    return `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${window.location.hash || ""}`;
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
  const core = coreState(AppCore);
  const app = appState(state);

  const route = pickText(
    source.canonicalPath,
    source.route,
    source.currentRoute,
    source.path,
    core.canonicalPath,
    core.route,
    app.route,
    browserPathname(),
    DEFAULT_ROUTE
  );

  const publicPath = pickText(
    source.publicPath,
    source.currentPublicPath,
    source.requestedPath,
    source.href,
    source.url,
    source.path,
    core.publicPath,
    app.publicPath,
    browserPublicPath(),
    route,
    DEFAULT_ROUTE
  );

  return {
    route: normalizePath(stripSearchAndHash(route || DEFAULT_ROUTE)),
    publicPath: safeText(publicPath, route || DEFAULT_ROUTE),

    loading: pickDefined(
      source.loading,
      source.isLoading,
      core.loading,
      app.loading,
      false
    ),

    initialized: pickDefined(
      source.initialized,
      core.initialized,
      app.initialized,
      false
    ),

    booting: pickDefined(
      source.booting,
      core.booting,
      app.booting,
      false
    ),

    ready: pickDefined(
      source.ready,
      core.ready,
      app.ready,
      false
    ),

    booted: pickDefined(
      source.booted,
      source.appReady,
      core.booted,
      core.appReady,
      app.booted,
      false
    ),

    lastError: pickDefined(
      source.lastError,
      source.error,
      core.lastError,
      core.error,
      app.lastError,
      null
    ),
  };
}

function pickUser(payload = {}, core = {}, session = {}) {
  const x = nested(payload);
  const dataSession = safeObject(x.data.session);
  const dataAuth = safeObject(x.data.auth);
  const payloadSession = safeObject(x.payload.session);
  const payloadAuth = safeObject(x.payload.auth);
  const coreSession = safeObject(core.session);

  const user = pickNonEmpty(
    x.root.user,
    x.root.usuario,
    x.root.me,
    x.root.account,
    x.root.profile,
    x.root.currentUser,
    x.root.sessionUser,
    x.root.authUser,

    x.session.user,
    x.session.usuario,
    x.session.me,
    x.session.account,
    x.session.profile,

    x.auth.user,
    x.auth.usuario,
    x.auth.me,
    x.auth.account,
    x.auth.profile,

    x.data.user,
    x.data.usuario,
    x.data.me,
    x.data.account,
    x.data.profile,

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

    x.payload.user,
    x.payload.usuario,
    x.payload.me,
    x.payload.account,
    x.payload.profile,

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

  return hasUsableUser(user) ? user : null;
}

function pickToken(payload = {}, core = {}, session = {}) {
  const x = nested(payload);
  const dataSession = safeObject(x.data.session);
  const dataAuth = safeObject(x.data.auth);
  const payloadSession = safeObject(x.payload.session);
  const payloadAuth = safeObject(x.payload.auth);
  const coreSession = safeObject(core.session);

  return normalizeToken(
    pickNonEmpty(
      x.root.token,
      x.root.accessToken,
      x.root.access_token,
      x.root.jwt,
      x.root.bearer,

      x.session.token,
      x.session.accessToken,
      x.session.access_token,
      x.session.jwt,
      x.session.bearer,

      x.auth.token,
      x.auth.accessToken,
      x.auth.access_token,
      x.auth.jwt,
      x.auth.bearer,

      x.data.token,
      x.data.accessToken,
      x.data.access_token,
      x.data.jwt,
      x.data.bearer,

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

      x.payload.token,
      x.payload.accessToken,
      x.payload.access_token,
      x.payload.jwt,
      x.payload.bearer,

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

function pickRefreshToken(payload = {}, core = {}, session = {}) {
  const x = nested(payload);
  const dataSession = safeObject(x.data.session);
  const dataAuth = safeObject(x.data.auth);
  const payloadSession = safeObject(x.payload.session);
  const payloadAuth = safeObject(x.payload.auth);
  const coreSession = safeObject(core.session);

  return normalizeToken(
    pickNonEmpty(
      x.root.refreshToken,
      x.root.refresh_token,

      x.session.refreshToken,
      x.session.refresh_token,

      x.auth.refreshToken,
      x.auth.refresh_token,

      x.data.refreshToken,
      x.data.refresh_token,

      dataSession.refreshToken,
      dataSession.refresh_token,

      dataAuth.refreshToken,
      dataAuth.refresh_token,

      x.payload.refreshToken,
      x.payload.refresh_token,

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

function pickSessionId(payload = {}, core = {}, session = {}) {
  const x = nested(payload);
  const dataSession = safeObject(x.data.session);
  const payloadSession = safeObject(x.payload.session);
  const coreSession = safeObject(core.session);

  return safeText(
    pickNonEmpty(
      x.root.sessionId,
      x.root.session_id,

      x.session.sessionId,
      x.session.session_id,
      x.session.id,

      x.data.sessionId,
      x.data.session_id,

      dataSession.sessionId,
      dataSession.session_id,
      dataSession.id,

      x.payload.sessionId,
      x.payload.session_id,

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

function pickSessionUserId(payload = {}, core = {}, session = {}, user = null) {
  const x = nested(payload);
  const dataSession = safeObject(x.data.session);
  const payloadSession = safeObject(x.payload.session);
  const coreSession = safeObject(core.session);

  return safeText(
    pickNonEmpty(
      x.root.sessionUserId,
      x.root.session_user_id,
      x.root.userId,
      x.root.user_id,

      x.session.sessionUserId,
      x.session.session_user_id,
      x.session.userId,
      x.session.user_id,

      x.data.sessionUserId,
      x.data.session_user_id,
      x.data.userId,
      x.data.user_id,

      dataSession.sessionUserId,
      dataSession.session_user_id,
      dataSession.userId,
      dataSession.user_id,

      x.payload.sessionUserId,
      x.payload.session_user_id,
      x.payload.userId,
      x.payload.user_id,

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

function pickAuthenticatedSignal(payload = {}, core = {}, session = {}) {
  const x = nested(payload);
  const dataSession = safeObject(x.data.session);
  const dataAuth = safeObject(x.data.auth);
  const payloadSession = safeObject(x.payload.session);
  const payloadAuth = safeObject(x.payload.auth);
  const coreSession = safeObject(core.session);

  return pickDefined(
    x.root.authenticated,
    x.root.isAuthenticated,

    x.session.authenticated,
    x.session.isAuthenticated,

    x.auth.authenticated,
    x.auth.isAuthenticated,

    x.data.authenticated,
    x.data.isAuthenticated,

    dataSession.authenticated,
    dataSession.isAuthenticated,

    dataAuth.authenticated,
    dataAuth.isAuthenticated,

    x.payload.authenticated,
    x.payload.isAuthenticated,

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
  const core = coreState(AppCore);
  const session = sessionState(state);

  const user = pickUser(source, core, session);
  const token = pickToken(source, core, session);
  const refreshToken = pickRefreshToken(source, core, session);
  const sessionId = pickSessionId(source, core, session);
  const sessionUserId = pickSessionUserId(source, core, session, user);

  const roleInput = pickDefined(
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

  const rolesInput = pickDefined(
    source.roles,
    safeObject(source.session).roles,
    core.roles,
    safeObject(core.session).roles,
    session.roles,
    user?.roles,
    null
  );

  const authSignal = safeBool(pickAuthenticatedSignal(source, core, session), false);

  const authenticated =
    authSignal &&
    hasUsableToken(token) &&
    hasUsableUser(user);

  const role = authenticated
    ? primaryRole(user, roleInput, rolesInput)
    : null;

  const roles = authenticated
    ? collectRoles(user, role, rolesInput)
    : [];

  return {
    authenticated,
    hasToken: Boolean(token),

    token: authenticated ? token : null,
    accessToken: authenticated ? token : null,

    refreshToken: refreshToken || null,

    user: authenticated ? user : null,

    role,
    roles,

    sessionId: sessionId || null,
    sessionUserId: sessionUserId || null,

    isAdmin: roles.includes("admin"),
  };
}

function buildUiPatch({
  AppCore,
  state,
  source = {},
} = {}) {
  const core = coreState(AppCore);
  const ui = uiState(state);

  const theme = pickDefined(
    source.theme,
    source.mode,
    source.resolvedTheme,
    core.theme,
    ui.theme,
    DEFAULT_THEME
  );

  const lang = pickDefined(
    source.lang,
    source.locale,
    core.lang,
    ui.lang,
    DEFAULT_LANG
  );

  const sidebarOpen = pickDefined(
    source.sidebarOpen,
    source.open,
    core.sidebarOpen,
    ui.sidebarOpen,
    true
  );

  return {
    theme,

    themePreference: pickDefined(
      source.themePreference,
      source.themeMode,
      source.appearance,
      core.themePreference,
      core.themeMode,
      ui.themePreference,
      theme
    ),

    lang,

    sidebarOpen: safeBool(sidebarOpen, true),

    pageTitle: safeTitle(AppCore),
    topbarTitle: safeTopbarTitle(AppCore),
  };
}

function syncFromCore({
  AppCore,
  state,
  patch,
  source = {},
} = {}) {
  if (!isFn(patch)) return false;

  patch({
    app: buildAppPatch({
      AppCore,
      state,
      source,
    }),

    session: buildSessionPatch({
      AppCore,
      state,
      source,
    }),

    ui: buildUiPatch({
      AppCore,
      state,
      source,
    }),
  });

  return true;
}

/* =========================================================
   ACTION HELPERS
========================================================= */

function callAction(fn, ...args) {
  try {
    if (isFn(fn)) {
      fn(...args);
      return true;
    }
  } catch {}

  return false;
}

function patchSession({
  actions,
  patch,
  session,
} = {}) {
  if (callAction(actions?.setSession, session)) return true;

  if (isFn(patch)) {
    patch({ session });
    return true;
  }

  return false;
}

function clearSession({
  actions,
  patch,
} = {}) {
  const clean = {
    authenticated: false,
    hasToken: false,

    token: null,
    accessToken: null,
    refreshToken: null,

    user: null,

    role: null,
    roles: [],

    sessionId: null,
    sessionUserId: null,

    isAdmin: false,
  };

  if (callAction(actions?.clearSession)) return true;

  if (isFn(patch)) {
    patch({ session: clean });
    return true;
  }

  return false;
}

/* =========================================================
   EVENT HANDLERS
========================================================= */

function handleStateEvent({
  AppCore,
  state,
  patch,
  event,
} = {}) {
  syncFromCore({
    AppCore,
    state,
    patch,
    source: statePayload(event),
  });
}

function handleBootReady({
  AppCore,
  state,
  actions,
  patch,
} = {}) {
  callAction(actions?.hydrateFromCore);

  syncFromCore({
    AppCore,
    state,
    patch,
    source: coreState(AppCore),
  });

  callAction(actions?.setInitialized, true);
  callAction(actions?.markReady, true);
  callAction(actions?.markBooted, true);
  callAction(actions?.setBooting, false);
  callAction(actions?.setLoading, false);
}

function handleBooting({ actions } = {}) {
  callAction(actions?.setBooting, true);
  callAction(actions?.setLoading, true);
  callAction(actions?.markReady, false);
}

function handleBootError({
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(actions?.setBooting, false);
  callAction(actions?.setLoading, false);
  callAction(actions?.markReady, false);
  callAction(actions?.setError, payload.error || payload.message || null);
}

function handleRouteEvent({
  AppCore,
  state,
  actions,
  event,
  eventName = "",
} = {}) {
  const payload = eventPayload(event);
  const core = coreState(AppCore);

  const route = pickText(
    payload.canonicalPath,
    payload.route,
    payload.currentRoute,
    payload.path,
    core.canonicalPath,
    core.route,
    state?.app?.route,
    browserPathname(),
    DEFAULT_ROUTE
  );

  const publicPath = pickText(
    payload.publicPath,
    payload.currentPublicPath,
    payload.requestedPath,
    payload.href,
    payload.url,
    payload.path,
    core.publicPath,
    state?.app?.publicPath,
    browserPublicPath(),
    route,
    DEFAULT_ROUTE
  );

  callAction(actions?.setRoute, route || DEFAULT_ROUTE);
  callAction(actions?.setPublicPath, publicPath || route || DEFAULT_ROUTE);

  if (ROUTE_LOADING_EVENTS.has(eventName)) {
    callAction(actions?.setLoading, true);
  }

  if (ROUTE_DONE_EVENTS.has(eventName)) {
    callAction(actions?.setLoading, false);
  }

  callAction(actions?.setPageTitle, safeTitle(AppCore));
  callAction(actions?.setTopbarTitle, safeTopbarTitle(AppCore));
}

function handleSessionEvent({
  AppCore,
  state,
  actions,
  patch,
  event,
} = {}) {
  const session = buildSessionPatch({
    AppCore,
    state,
    source: eventPayload(event),
  });

  patchSession({
    actions,
    patch,
    session,
  });
}

function handleThemeEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(
    actions?.setTheme,
    pickDefined(
      payload.theme,
      payload.resolvedTheme,
      payload.mode,
      coreState(AppCore).theme,
      state?.ui?.theme,
      DEFAULT_THEME
    )
  );
}

function handleLangEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(
    actions?.setLang,
    pickDefined(
      payload.lang,
      payload.locale,
      coreState(AppCore).lang,
      state?.ui?.lang,
      DEFAULT_LANG
    )
  );
}

function handleSidebarEvent({
  AppCore,
  state,
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(
    actions?.setSidebarOpen,
    safeBool(
      pickDefined(
        payload.open,
        payload.sidebarOpen,
        coreState(AppCore).sidebarOpen,
        state?.ui?.sidebarOpen,
        true
      ),
      true
    )
  );
}

function handleTitleEvent({
  AppCore,
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(actions?.setPageTitle, payload.title || safeTitle(AppCore));
  callAction(actions?.setTopbarTitle, payload.topbarTitle || safeTopbarTitle(AppCore));
}

function handleLoadingEvent({
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(
    actions?.setLoading,
    safeBool(
      pickDefined(payload.loading, payload.isLoading, false),
      false
    )
  );
}

function handleErrorEvent({
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  callAction(actions?.setError, payload.error || payload.message || null);
}

function handleAuthStart({
  actions,
  eventName = "",
} = {}) {
  callAction(actions?.setLoading, true);

  if (eventName.includes("login")) {
    callAction(actions?.setFlag, "loginInProgress", true);
  }

  if (eventName.includes("restore")) {
    callAction(actions?.setFlag, "restoreInProgress", true);
  }

  if (eventName.includes("refresh")) {
    callAction(actions?.setFlag, "refreshInProgress", true);
  }
}

function handleAuthError({
  actions,
  patch,
  event,
  eventName = "",
} = {}) {
  const payload = eventPayload(event);

  callAction(actions?.setLoading, false);

  if (eventName.includes("login")) {
    callAction(actions?.setFlag, "loginInProgress", false);

    clearSession({
      actions,
      patch,
    });
  }

  if (eventName.includes("restore")) {
    callAction(actions?.setFlag, "restoreInProgress", false);
  }

  if (eventName.includes("refresh")) {
    callAction(actions?.setFlag, "refreshInProgress", false);
  }

  callAction(actions?.setError, payload.error || payload.message || null);
}

function handleShellEvent({
  actions,
  event,
} = {}) {
  const payload = eventPayload(event);

  if (hasOwn(payload, "shellHidden")) {
    callAction(actions?.setFlag, "shellHidden", Boolean(payload.shellHidden));
  }

  if (hasOwn(payload, "chromeVisible")) {
    callAction(actions?.setFlag, "chromeVisible", Boolean(payload.chromeVisible));
  }

  if (hasOwn(payload, "authScreen")) {
    callAction(actions?.setFlag, "authScreen", Boolean(payload.authScreen));
  }
}

/* =========================================================
   SUBSCRIBE
========================================================= */

function safeOff(off, AppCore) {
  try {
    off?.();
  } catch (error) {
    safeWarn(AppCore, "No se pudo limpiar listener del Store.", error);
  }
}

function normalizeUnsubscriber({
  AppCore,
  eventName,
  handler,
  rawOff,
  usedWindow = false,
} = {}) {
  if (isFn(rawOff)) return rawOff;

  if (!usedWindow && isFn(AppCore?.events?.off)) {
    return () => {
      try {
        AppCore.events.off(eventName, handler);
      } catch {}
    };
  }

  if (usedWindow && isBrowser()) {
    return () => {
      try {
        window.removeEventListener(eventName, handler);
      } catch {}
    };
  }

  return () => {};
}

function pushUnsubscriber(coreUnsubscribers, off) {
  if (Array.isArray(coreUnsubscribers) && isFn(off)) {
    coreUnsubscribers.push(off);
  }
}

export function addCoreEvent({
  AppCore,
  coreUnsubscribers,
  eventName,
  handler,
}) {
  const name = safeText(eventName, "");

  if (!name || !isFn(handler)) return () => {};

  const wrapped = (...args) => {
    try {
      return handler(...args);
    } catch (error) {
      safeWarn(AppCore, `Error en listener "${name}".`, error);
      return undefined;
    }
  };

  let rawOff = null;
  let usedWindow = false;

  try {
    if (isFn(AppCore?.cleanup?.event)) {
      rawOff = AppCore.cleanup.event(SYNC_SCOPE, name, wrapped);
    }
  } catch {}

  if (!rawOff && isFn(AppCore?.events?.on)) {
    try {
      rawOff = AppCore.events.on(name, wrapped);
    } catch (error) {
      safeWarn(AppCore, `No se pudo registrar listener AppCore "${name}".`, error);
    }
  }

  if (!rawOff && isBrowser()) {
    try {
      window.addEventListener(name, wrapped);
      usedWindow = true;
    } catch (error) {
      safeWarn(AppCore, `No se pudo registrar listener window "${name}".`, error);
    }
  }

  const off = normalizeUnsubscriber({
    AppCore,
    eventName: name,
    handler: wrapped,
    rawOff,
    usedWindow,
  });

  pushUnsubscriber(coreUnsubscribers, off);

  return off;
}

function bindMany({
  AppCore,
  coreUnsubscribers,
  eventNames,
  handler,
}) {
  for (const eventName of safeArray(eventNames)) {
    addCoreEvent({
      AppCore,
      coreUnsubscribers,
      eventName,
      handler: (event) => handler(event, eventName),
    });
  }
}

/* =========================================================
   UNBIND
========================================================= */

export function unbindCoreEvents({
  AppCore,
  coreUnsubscribers,
} = {}) {
  while (Array.isArray(coreUnsubscribers) && coreUnsubscribers.length) {
    safeOff(coreUnsubscribers.pop(), AppCore);
  }

  try {
    AppCore?.cleanup?.run?.(SYNC_SCOPE);
  } catch {}

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
  if (!AppCore || !state || !actions || !isFn(patch)) {
    return false;
  }

  if (Array.isArray(coreUnsubscribers) && coreUnsubscribers.length) {
    return true;
  }

  safeEmit(AppCore, "store:core-sync:binding", {
    version: STORE_CORE_SYNC_VERSION,
    scope: SYNC_SCOPE,
    at: safeIsoDate(),
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: STATE_EVENTS,
    handler: (event) => {
      handleStateEvent({
        AppCore,
        state,
        patch,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: BOOT_READY_EVENTS,
    handler: () => {
      handleBootReady({
        AppCore,
        state,
        actions,
        patch,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: BOOTING_EVENTS,
    handler: () => {
      handleBooting({ actions });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: BOOT_ERROR_EVENTS,
    handler: (event) => {
      handleBootError({
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: ROUTE_EVENTS,
    handler: (event, eventName) => {
      handleRouteEvent({
        AppCore,
        state,
        actions,
        event,
        eventName,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: SESSION_APPLY_EVENTS,
    handler: (event) => {
      handleSessionEvent({
        AppCore,
        state,
        actions,
        patch,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: SESSION_CLEAR_EVENTS,
    handler: () => {
      clearSession({
        actions,
        patch,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: THEME_EVENTS,
    handler: (event) => {
      handleThemeEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: LANG_EVENTS,
    handler: (event) => {
      handleLangEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: SIDEBAR_EVENTS,
    handler: (event) => {
      handleSidebarEvent({
        AppCore,
        state,
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: TITLE_EVENTS,
    handler: (event) => {
      handleTitleEvent({
        AppCore,
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: LOADING_EVENTS,
    handler: (event) => {
      handleLoadingEvent({
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: ERROR_EVENTS,
    handler: (event) => {
      handleErrorEvent({
        actions,
        event,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: CLEAR_ERROR_EVENTS,
    handler: () => {
      callAction(actions?.clearError);
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: AUTH_START_EVENTS,
    handler: (_event, eventName) => {
      handleAuthStart({
        actions,
        eventName,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: AUTH_ERROR_EVENTS,
    handler: (event, eventName) => {
      handleAuthError({
        actions,
        patch,
        event,
        eventName,
      });
    },
  });

  bindMany({
    AppCore,
    coreUnsubscribers,
    eventNames: SHELL_EVENTS,
    handler: (event) => {
      handleShellEvent({
        actions,
        event,
      });
    },
  });

  safeEmit(AppCore, "store:core-sync:bound", {
    version: STORE_CORE_SYNC_VERSION,
    scope: SYNC_SCOPE,
    listeners: Array.isArray(coreUnsubscribers) ? coreUnsubscribers.length : 0,
    groups: {
      state: STATE_EVENTS.length,
      boot: BOOT_READY_EVENTS.length + BOOTING_EVENTS.length + BOOT_ERROR_EVENTS.length,
      route: ROUTE_EVENTS.length,
      session: SESSION_APPLY_EVENTS.length + SESSION_CLEAR_EVENTS.length,
      ui: THEME_EVENTS.length + LANG_EVENTS.length + SIDEBAR_EVENTS.length + TITLE_EVENTS.length,
      auth: AUTH_START_EVENTS.length + AUTH_ERROR_EVENTS.length,
      shell: SHELL_EVENTS.length,
    },
    at: safeIsoDate(),
  });

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

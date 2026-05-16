/* =========================================================
   Onion SPA - Store Actions
   Archivo: src/store/actions.js

   STORE ACTIONS · SIMPLE
   - El Store NO es dueño de auth/router/http.
   - AppCore manda sesión, ruta, token y usuario real.
   - El Store sólo guarda snapshot seguro.
   - Nunca guarda token real.
   - Roles reales: admin / user.
   - Colecciones simples y normalizadas.
========================================================= */

import {
  deepClone,
  isFunction,
  normalizeCollection,
} from "./helpers.js";

import {
  ensureCollectionKey,
  normalizeMatcher,
} from "./collections.js";

import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

export const STORE_ACTIONS_VERSION = "16.0.0-simple";

const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";
const DEFAULT_APP_NAME = "Onion Support";

const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

const BAD_TOKEN_VALUES = new Set([
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

const INACTIVE_STATUSES = new Set([
  "disabled",
  "inactive",
  "deleted",
  "blocked",
  "suspended",
  "banned",
  "revoked",
  "archived",
  "desactivado",
  "inactivo",
  "eliminado",
  "bloqueado",
  "suspendido",
  "archivado",
]);

const ADMIN_ROLE_KEYS = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "owner",
  "root",
]);

const USER_ID_KEYS = Object.freeze([
  "id",
  "_id",
  "uuid",
  "userId",
  "user_id",
  "uid",
  "sub",
  "username",
  "userName",
  "user_name",
  "slug",
  "email",
  "mail",
]);

const ENTITY_ID_KEYS = Object.freeze([
  "id",
  "_id",
  "uuid",
  "userId",
  "user_id",
  "uid",
  "sub",
  "ticketId",
  "ticket_id",
  "incidenciaId",
  "incidencia_id",
  "clienteId",
  "cliente_id",
  "clientId",
  "client_id",
  "customerId",
  "customer_id",
  "facturaId",
  "factura_id",
  "invoiceId",
  "invoice_id",
  "numeroFacturaLegal",
  "numero_factura_legal",
]);

const COLLECTION_KEYS = Object.freeze([
  "tickets",
  "incidencias",
  "facturas",
  "clientes",
  "usuarios",
  "hardware",
  "recientes",
]);

const FETCH_FLAG_KEYS = Object.freeze([
  "Dashboard",
  "Tickets",
  "Incidencias",
  "Facturas",
  "Clientes",
  "Usuarios",
  "Hardware",
  "Search",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).trim();
  return output || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function unique(values = []) {
  return [
    ...new Set(
      toArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function clone(value, fallback = null) {
  if (value === null || value === undefined) return fallback;

  try {
    return deepClone(value);
  } catch {}

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback === null ? value : fallback;
  }
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/* =========================================================
   APPCORE SAFE
========================================================= */

function coreState(AppCore) {
  return safeObject(AppCore?.state);
}

function coreConfig(AppCore) {
  return safeObject(AppCore?.config);
}

function appName(AppCore) {
  const config = coreConfig(AppCore);
  return safeText(config.appName, "") || safeText(config.name, "") || DEFAULT_APP_NAME;
}

function defaultTheme(AppCore) {
  const config = coreConfig(AppCore);
  const state = coreState(AppCore);

  return normalizeTheme(
    first(
      state.theme,
      state.themeMode,
      state.appearance,
      config.defaultTheme,
      config.ui?.defaultTheme,
      DEFAULT_THEME
    )
  );
}

function defaultLang(AppCore) {
  const config = coreConfig(AppCore);
  const state = coreState(AppCore);

  return normalizeLang(
    first(
      state.lang,
      state.language,
      state.locale,
      config.defaultLang,
      config.i18n?.defaultLang,
      DEFAULT_LANG
    )
  );
}

function resolveTitle(AppCore) {
  try {
    return safeText(safeTitle(AppCore), appName(AppCore));
  } catch {
    return appName(AppCore);
  }
}

function resolveTopbarTitle(AppCore) {
  try {
    return safeText(safeTopbarTitle(AppCore), resolveTitle(AppCore));
  } catch {
    return resolveTitle(AppCore);
  }
}

function emit(AppCore, eventName, payload = {}) {
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
   PATHS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let path = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) path = `/${path}`;

  const stack = [];

  for (const part of path.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }

  path = `/${stack.join("/")}`;
  return path.length > 1 ? path.replace(/\/+$/g, "") || DEFAULT_ROUTE : path || DEFAULT_ROUTE;
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = safeText(path, DEFAULT_ROUTE);
  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
  };
}

function normalizePublicPath(path = DEFAULT_ROUTE) {
  const raw = safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) return normalizePublicPath(normalizeHashRouterPath(raw));

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, "http://localhost");

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizePublicPath(normalizeHashRouterPath(parsed.hash));
      }

      return normalizePublicPath(`${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`);
    }
  } catch {}

  const parts = splitPath(raw);
  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const parts = splitPath(normalizePublicPath(path));
  const noUser = parts.pathname.replace(/^\/@[^/]+(?=\/|$)/i, "") || DEFAULT_ROUTE;
  const canonical = normalizePathname(noUser);

  if (canonical === "/activate" || canonical.startsWith("/activate/") || canonical === "/activation" || canonical.startsWith("/activation/") || canonical === "/activate-account" || canonical.startsWith("/activate-account/")) {
    return "/activate-account";
  }

  if (canonical === "/password-reset/confirm" || canonical.startsWith("/password-reset/confirm/") || canonical === "/reset-password/confirm" || canonical.startsWith("/reset-password/confirm/")) {
    return "/reset-password/confirm";
  }

  for (const base of ["/2fa", "/otp", "/mfa"]) {
    if (canonical === base || canonical.startsWith(`${base}/`)) return base;
  }

  return canonical;
}

/* =========================================================
   SESSION NORMALIZATION
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const clean = stripBearer(token);
  if (!clean) return false;
  if (BAD_TOKEN_VALUES.has(clean.toLowerCase())) return false;
  if (/[\s\r\n\t]/.test(clean)) return false;
  return true;
}

function hasUsableUser(user = null) {
  const current = safeObject(user);
  if (!Object.keys(current).length) return false;

  if (
    current.active === false ||
    current.enabled === false ||
    current.disabled === true ||
    current.isDisabled === true ||
    current.deleted === true ||
    current.isDeleted === true ||
    current.blocked === true ||
    current.isBlocked === true ||
    current.suspended === true ||
    current.revoked === true ||
    current.archived === true ||
    current.deletedAt ||
    current.disabledAt ||
    current.blockedAt
  ) {
    return false;
  }

  const status = safeLower(current.status || current.estado || current.state || current.accountStatus || current.account_status || "");
  if (INACTIVE_STATUSES.has(status)) return false;

  return USER_ID_KEYS.some((key) => Boolean(safeText(current[key], "")));
}

function sanitizeUserValue(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return undefined;
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return undefined;

  if (Array.isArray(value)) {
    return value.slice(0, 120).map((item) => sanitizeUserValue(item, depth + 1, keyHint));
  }

  if (typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 160)) {
      const clean = sanitizeUserValue(item, depth + 1, key);
      if (clean !== undefined) output[key] = clean;
    }

    return output;
  }

  return String(value);
}

function sanitizeUser(user = null) {
  if (!hasUsableUser(user)) return null;

  const output = sanitizeUserValue(clone(user, {}) || {}) || {};

  const id = safeText(first(output.id, output.userId, output.user_id, output._id, output.uid, output.sub), "");
  const displayName = safeText(first(output.displayName, output.display_name, output.fullName, output.full_name, output.name, output.nombre, output.username, output.email, "Usuario"), "Usuario");
  const username = safeText(first(output.slug, output.username, output.userName, output.user_name, output.login, output.alias, output.email), "");
  const avatarUrl = safeText(first(output.avatarUrl, output.avatarURL, output.avatar_url, output.avatar, output.photoUrl, output.photoURL, output.photo_url, output.photo, output.pictureUrl, output.pictureURL, output.picture_url, output.picture, output.imageUrl, output.imageURL, output.image_url, output.image), "");

  return {
    ...output,
    id: output.id || id || null,
    userId: output.userId || output.user_id || id || null,
    user_id: output.user_id || output.userId || id || null,
    username: username || null,
    slug: output.slug || username || null,
    displayName,
    name: output.name || output.nombre || displayName,
    email: output.email || output.mail || null,
    avatar: output.hasAvatar === false ? null : avatarUrl || null,
    avatarUrl: output.hasAvatar === false ? null : avatarUrl || null,
    picture: output.hasAvatar === false ? null : avatarUrl || null,
    hasAvatar: output.hasAvatar === false ? false : Boolean(avatarUrl),
    active: true,
  };
}

function normalizeRole(value = "") {
  const role = safeLower(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();

  if (!role) return "";
  return ADMIN_ROLE_KEYS.has(role) ? ROLE_ADMIN : ROLE_USER;
}

function normalizeRoles(values = []) {
  const roles = unique(toArray(values).flat(Infinity).map(normalizeRole)).filter(Boolean);
  return roles.includes(ROLE_ADMIN) ? [ROLE_ADMIN] : [ROLE_USER];
}

function readTokenFromCore(AppCore) {
  const state = coreState(AppCore);
  const session = safeObject(state.session);
  const sessionData = safeObject(state.sessionData);

  let token = stripBearer(first(
    state.token,
    state.accessToken,
    state.access_token,
    session.token,
    session.accessToken,
    session.access_token,
    sessionData.token,
    sessionData.accessToken,
    sessionData.access_token
  ) || "");

  try {
    const header = AppCore?.getAuthHeader?.() || {};
    token = token || stripBearer(header.Authorization || header.authorization || "");
  } catch {}

  return hasUsableToken(token) ? token : "";
}

function readUserFromCore(AppCore) {
  const state = coreState(AppCore);
  const session = safeObject(state.session);
  const sessionData = safeObject(state.sessionData);

  const user = first(
    state.user,
    state.currentUser,
    state.sessionUser,
    state.authUser,
    state.account,
    state.profile,
    state.usuario,
    state.me,
    session.user,
    session.usuario,
    session.me,
    sessionData.user,
    sessionData.usuario,
    sessionData.me
  );

  return sanitizeUser(user);
}

function sessionPatchFrom({ AppCore, currentSession = {}, token, user, role, roles, permissions, authenticated } = {}) {
  const hasToken = hasUsableToken(token);
  const safeUser = sanitizeUser(user);
  const isAuthenticated = authenticated === false ? false : Boolean(hasToken && safeUser);

  const base = {
    token: null,
    accessToken: null,
    isSupport: false,
    isManager: false,
    isClient: false,
  };

  if (!isAuthenticated) {
    return {
      ...base,
      authenticated: false,
      hasToken,
      user: null,
      role: null,
      roles: [],
      permissions: [],
      username: null,
      displayName: null,
      avatarUrl: null,
      currentResolvedUsername: null,
      isAdmin: false,
      isUser: false,
    };
  }

  const finalRoles = normalizeRoles([role, roles, currentSession.role, currentSession.roles, safeUser.role, safeUser.rol, safeUser.roles]);
  const finalRole = finalRoles.includes(ROLE_ADMIN) ? ROLE_ADMIN : ROLE_USER;
  const finalPermissions = unique([permissions, currentSession.permissions, safeUser.permissions, safeUser.permisos].flat(Infinity));

  return {
    ...base,
    authenticated: true,
    hasToken: true,
    user: safeUser,
    role: finalRole,
    roles: [finalRole],
    permissions: finalPermissions,
    username: safeText(safeUser.username || safeUser.slug, "") || null,
    displayName: safeText(safeUser.displayName || safeUser.name, "") || null,
    avatarUrl: safeText(safeUser.avatarUrl || safeUser.avatar, "") || null,
    currentResolvedUsername:
      safeText(coreState(AppCore).currentResolvedUsername, "") ||
      safeText(coreState(AppCore).resolvedUsername, "") ||
      safeText(safeUser.slug || safeUser.username, "") ||
      null,
    isAdmin: finalRole === ROLE_ADMIN,
    isUser: finalRole === ROLE_USER,
  };
}

function extractSessionInput(payload = {}) {
  const source = safeObject(payload);
  const data = safeObject(source.data);
  const auth = safeObject(source.auth);
  const session = safeObject(first(source.session, source.sessionData, data.session, data.sessionData, auth.session, {}));
  const user = first(source.user, source.usuario, source.me, source.account, source.profile, data.user, data.usuario, data.me, data.account, data.profile, auth.user, auth.usuario, auth.me, session.user, session.usuario, session.me, null);

  return {
    token: first(source.token, source.accessToken, source.access_token, data.token, data.accessToken, data.access_token, auth.token, auth.accessToken, auth.access_token, session.token, session.accessToken, session.access_token, null),
    user,
    authenticated: first(source.authenticated, data.authenticated, auth.authenticated, session.authenticated, undefined),
    role: first(source.role, source.rol, data.role, data.rol, auth.role, auth.rol, user?.role, user?.rol, undefined),
    roles: first(source.roles, data.roles, auth.roles, user?.roles, undefined),
    permissions: first(source.permissions, source.permisos, data.permissions, data.permisos, auth.permissions, user?.permissions, user?.permisos, undefined),
  };
}

/* =========================================================
   UI NORMALIZATION
========================================================= */

function normalizeTheme(theme = DEFAULT_THEME) {
  const value = safeLower(theme, DEFAULT_THEME);
  if (value === "dark") return "dark";
  if (value === "light") return "light";
  if (["system", "auto", "browser", "os", "device"].includes(value)) return "system";
  return DEFAULT_THEME;
}

function normalizeLang(lang = DEFAULT_LANG) {
  const value = safeLower(lang, DEFAULT_LANG).replace(/_/g, "-");
  const firstPart = value.split("-")[0] || value;

  if (["spa", "spanish", "castellano", "español"].includes(firstPart)) return "es";
  if (["eng", "english"].includes(firstPart)) return "en";
  if (["cat", "catalan", "català", "catalán"].includes(firstPart)) return "ca";

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(value) ? value : DEFAULT_LANG;
}

function normalizeFlagKey(flag = "") {
  return safeText(flag, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "");
}

/* =========================================================
   COLLECTIONS
========================================================= */

function ensureKey(state, key) {
  const clean = safeText(key, "");
  if (!clean) throw new Error("Store collection key requerido.");

  try {
    return ensureCollectionKey(state, clean);
  } catch {
    if (!state.entities || typeof state.entities !== "object") state.entities = {};
    if (!Array.isArray(state.entities[clean])) state.entities[clean] = [];
    return clean;
  }
}

function collectionPath(state, key) {
  return `entities.${ensureKey(state, key)}`;
}

function normalizeItems(items = []) {
  if (items === null || items === undefined) return [];

  try {
    return normalizeCollection(Array.isArray(items) ? items : [items]);
  } catch {
    return Array.isArray(items) ? items : [items];
  }
}

function entityId(item = null) {
  const source = safeObject(item);

  for (const key of ENTITY_ID_KEYS) {
    const value = safeText(source[key], "");
    if (value) return value;
  }

  return "";
}

function matcherFor(matcher, item = null) {
  if (matcher) {
    try {
      return normalizeMatcher(matcher);
    } catch {}
  }

  const id = entityId(item);
  return id ? (current) => entityId(current) === id : () => false;
}

function emptyEntities(previous = {}) {
  const output = {};

  for (const key of COLLECTION_KEYS) output[key] = [];

  output.byId = clone(previous.byId || {}, {});
  output.dashboard = null;
  output.search = {
    query: "",
    results: [],
    lastResults: [],
    loading: false,
    error: null,
    meta: {},
  };

  return output;
}

/* =========================================================
   FACTORY
========================================================= */

export function createActions({ AppCore = null, state, set, patch, update } = {}) {
  if (!state || typeof state !== "object") throw new Error("createActions requiere state válido.");
  if (!isFunction(set)) throw new Error("createActions requiere set(path, value).");
  if (!isFunction(patch)) throw new Error("createActions requiere patch(partialState).");
  if (!isFunction(update)) throw new Error("createActions requiere update(path, updater).");

  function patchApp(value = {}) {
    return patch({ app: safeObject(value) });
  }

  function patchUi(value = {}) {
    return patch({ ui: safeObject(value) });
  }

  function patchSession(value = {}) {
    return patch({
      session: sessionPatchFrom({
        AppCore,
        currentSession: state.session,
        ...safeObject(value),
      }),
    });
  }

  function patchMeta(extra = {}) {
    const timestamp = nowMs();

    return patch({
      meta: {
        ...safeObject(state.meta),
        ...safeObject(extra),
        version: state.meta?.version || STORE_ACTIONS_VERSION,
        revision: safeNumber(state.meta?.revision, 0) + 1,
        updatedAt: timestamp,
        updatedAtIso: nowIso(timestamp),
      },
    });
  }

  const api = {
    version: STORE_ACTIONS_VERSION,

    /* APP */

    markReady(value = true) {
      const ready = Boolean(value);
      return patchApp({
        ready,
        loading: ready ? false : Boolean(state.app?.loading),
        booting: ready ? false : Boolean(state.app?.booting),
      });
    },

    markBooted(value = true) {
      const booted = Boolean(value);
      return patchApp({
        booted,
        booting: booted ? false : Boolean(state.app?.booting),
        loading: booted ? false : Boolean(state.app?.loading),
      });
    },

    setInitialized(value = true) {
      return set("app.initialized", Boolean(value));
    },

    setBooting(value = false) {
      const booting = Boolean(value);
      return patchApp({
        booting,
        loading: booting ? true : Boolean(state.app?.loading),
      });
    },

    setLoading(value = false) {
      return set("app.loading", Boolean(value));
    },

    setError(error = null) {
      return patchApp({
        lastError: error || null,
        error: error || null,
        hasError: Boolean(error),
      });
    },

    clearError() {
      return api.setError(null);
    },

    setRoute(route = DEFAULT_ROUTE) {
      const nextRoute = normalizeCanonicalPath(route);
      return patchApp({
        route: nextRoute,
        canonicalPath: nextRoute,
      });
    },

    setCanonicalPath(route = DEFAULT_ROUTE) {
      return api.setRoute(route);
    },

    setPublicPath(publicPath = DEFAULT_ROUTE) {
      return set("app.publicPath", normalizePublicPath(publicPath));
    },

    setRouteSnapshot({ route = undefined, canonicalPath = undefined, publicPath = undefined } = {}) {
      const nextPublicPath = normalizePublicPath(first(publicPath, state.app?.publicPath, route, canonicalPath, DEFAULT_ROUTE));
      const nextRoute = normalizeCanonicalPath(first(route, canonicalPath, nextPublicPath, DEFAULT_ROUTE));

      return patchApp({
        route: nextRoute,
        canonicalPath: nextRoute,
        publicPath: nextPublicPath,
      });
    },

    setAppReady(value = true) {
      const ready = Boolean(value);
      return patchApp({
        ready,
        booted: ready ? true : Boolean(state.app?.booted),
        loading: ready ? false : Boolean(state.app?.loading),
        booting: ready ? false : Boolean(state.app?.booting),
      });
    },

    /* SESSION */

    setSession(payload = {}) {
      return patchSession(safeObject(payload));
    },

    applySession(payload = {}) {
      return patchSession(extractSessionInput(payload));
    },

    clearSession() {
      return patch({
        session: {
          authenticated: false,
          hasToken: false,
          token: null,
          accessToken: null,
          user: null,
          role: null,
          roles: [],
          permissions: [],
          username: null,
          displayName: null,
          avatarUrl: null,
          currentResolvedUsername: null,
          isAdmin: false,
          isUser: false,
          isSupport: false,
          isManager: false,
          isClient: false,
        },
      });
    },

    setAuthenticated(value = false) {
      if (!value) return api.clearSession();

      return patchSession({
        authenticated: true,
        token: readTokenFromCore(AppCore),
        user: readUserFromCore(AppCore),
      });
    },

    setToken() {
      return patchSession({
        token: readTokenFromCore(AppCore),
        user: readUserFromCore(AppCore),
      });
    },

    setAccessToken() {
      return api.setToken();
    },

    setRefreshToken() {
      return true;
    },

    setTempToken() {
      return true;
    },

    setSessionId() {
      return true;
    },

    setSessionUserId() {
      return true;
    },

    setUser(user = null) {
      return patchSession({
        token: readTokenFromCore(AppCore),
        user,
      });
    },

    setRole(role = null) {
      return patchSession({
        token: readTokenFromCore(AppCore),
        user: state.session?.user,
        role,
      });
    },

    setRoles(roles = []) {
      return patchSession({
        token: readTokenFromCore(AppCore),
        user: state.session?.user,
        roles,
      });
    },

    setPermissions(permissions = []) {
      return patchSession({
        token: readTokenFromCore(AppCore),
        user: state.session?.user,
        permissions,
      });
    },

    /* UI */

    setTheme(theme = defaultTheme(AppCore)) {
      return patchUi({ theme: normalizeTheme(theme) });
    },

    setThemePreference(theme = DEFAULT_THEME) {
      const normalized = normalizeTheme(theme);
      return patchUi({
        themePreference: normalized,
        themeMode: normalized,
      });
    },

    setLang(lang = defaultLang(AppCore)) {
      const next = normalizeLang(lang);
      return patchUi({
        lang: next,
        language: next,
        locale: next,
      });
    },

    setSidebarOpen(value = false) {
      return set("ui.sidebarOpen", Boolean(value));
    },

    toggleSidebar() {
      return api.setSidebarOpen(!Boolean(state.ui?.sidebarOpen));
    },

    setPageTitle(title = appName(AppCore)) {
      const next = safeText(title, appName(AppCore));
      return patchUi({ pageTitle: next, topbarTitle: next });
    },

    setTopbarTitle(title = appName(AppCore)) {
      return set("ui.topbarTitle", safeText(title, appName(AppCore)));
    },

    setDensity(density = "default") {
      return set("ui.density", safeText(density, "default"));
    },

    resetTitles() {
      const title = appName(AppCore);
      return patchUi({ pageTitle: title, topbarTitle: title });
    },

    hydrateTitles() {
      const title = resolveTitle(AppCore);
      return patchUi({ pageTitle: title, topbarTitle: resolveTopbarTitle(AppCore) || title });
    },

    /* FLAGS */

    setFlag(flag, value = true) {
      const key = normalizeFlagKey(flag);
      if (!key) throw new Error("actions.setFlag(flag, value) requiere flag válido.");
      return set(`flags.${key}`, Boolean(value));
    },

    clearFlag(flag) {
      return api.setFlag(flag, false);
    },

    toggleFlag(flag) {
      const key = normalizeFlagKey(flag);
      if (!key) throw new Error("actions.toggleFlag(flag) requiere flag válido.");
      return set(`flags.${key}`, !Boolean(state.flags?.[key]));
    },

    setFlags(flags = {}) {
      const next = {};

      for (const [key, value] of Object.entries(safeObject(flags))) {
        const clean = normalizeFlagKey(key);
        if (clean) next[clean] = Boolean(value);
      }

      return patch({ flags: next });
    },

    resetFlags() {
      const next = {
        hydrating: false,
        hydrated: Boolean(state.flags?.hydrated),
        syncingCore: false,
        refreshing: false,
        saving: false,
      };

      for (const key of FETCH_FLAG_KEYS) next[`fetching${key}`] = false;

      return patch({ flags: next });
    },

    setFetching(key = "", value = true) {
      const clean = normalizeFlagKey(key);
      if (!clean) throw new Error("actions.setFetching(key, value) requiere key válido.");
      return api.setFlag(`fetching${clean[0]?.toUpperCase() || ""}${clean.slice(1)}`, value);
    },

    /* COLLECTIONS */

    setCollection(key, items = []) {
      return set(collectionPath(state, key), normalizeItems(items));
    },

    appendToCollection(key, item) {
      return update(collectionPath(state, key), (list = []) => normalizeItems([...(Array.isArray(list) ? list : []), clone(item, item)]));
    },

    prependToCollection(key, item) {
      return update(collectionPath(state, key), (list = []) => normalizeItems([clone(item, item), ...(Array.isArray(list) ? list : [])]));
    },

    replaceCollectionItem(key, matcher, nextItem) {
      const match = matcherFor(matcher, nextItem);
      return update(collectionPath(state, key), (list = []) => normalizeItems((Array.isArray(list) ? list : []).map((item) => (match(item) ? clone(nextItem, nextItem) : item))));
    },

    updateCollectionItem(key, matcher, updater) {
      if (!isFunction(updater)) throw new Error("actions.updateCollectionItem(key, matcher, updater) requiere updater function.");

      const match = matcherFor(matcher);
      return update(collectionPath(state, key), (list = []) => normalizeItems((Array.isArray(list) ? list : []).map((item) => {
        if (!match(item)) return item;
        const next = updater(clone(item, item));
        return next === undefined ? item : next;
      })));
    },

    patchCollectionItem(key, matcher, partial = {}) {
      const source = safeObject(partial);
      return api.updateCollectionItem(key, matcher, (item) => ({ ...safeObject(item), ...clone(source, {}) }));
    },

    upsertCollectionItem(key, item, matcher = null) {
      const cleanItem = clone(item, item);
      const match = matcherFor(matcher, cleanItem);

      return update(collectionPath(state, key), (list = []) => {
        const next = Array.isArray(list) ? [...list] : [];
        const index = next.findIndex((current) => match(current));

        if (index >= 0) next[index] = cleanItem;
        else next.push(cleanItem);

        return normalizeItems(next);
      });
    },

    removeCollectionItem(key, matcher) {
      const match = matcherFor(matcher);
      return update(collectionPath(state, key), (list = []) => normalizeItems((Array.isArray(list) ? list : []).filter((item) => !match(item))));
    },

    clearCollection(key) {
      return set(collectionPath(state, key), []);
    },

    clearCollections(options = {}) {
      if (options?.full === true) return patch({ entities: emptyEntities(state.entities) });

      const next = { ...safeObject(state.entities) };
      for (const key of COLLECTION_KEYS) next[key] = [];
      return patch({ entities: next });
    },

    setDashboard(value = null) {
      return set("entities.dashboard", value ? clone(value, null) : null);
    },

    clearDashboard() {
      return api.setDashboard(null);
    },

    setSearchState(value = {}) {
      const next = safeObject(value);
      return patch({
        entities: {
          search: {
            ...safeObject(state.entities?.search),
            ...next,
            results: next.results !== undefined ? normalizeItems(next.results) : normalizeItems(state.entities?.search?.results),
            lastResults: next.lastResults !== undefined ? normalizeItems(next.lastResults) : normalizeItems(state.entities?.search?.lastResults),
          },
        },
      });
    },

    clearSearch() {
      return api.setSearchState({ query: "", results: [], loading: false, error: null });
    },

    /* ALIASES */

    setTickets(items = []) { return api.setCollection("tickets", items); },
    setIncidencias(items = []) { return api.setCollection("incidencias", items); },
    setFacturas(items = []) { return api.setCollection("facturas", items); },
    setClientes(items = []) { return api.setCollection("clientes", items); },
    setUsuarios(items = []) { return api.setCollection("usuarios", items); },
    setHardware(items = []) { return api.setCollection("hardware", items); },
    setRecientes(items = []) { return api.setCollection("recientes", items); },

    upsertTicket(item, matcher = null) { return api.upsertCollectionItem("tickets", item, matcher); },
    upsertIncidencia(item, matcher = null) { return api.upsertCollectionItem("incidencias", item, matcher); },
    upsertFactura(item, matcher = null) { return api.upsertCollectionItem("facturas", item, matcher); },
    upsertCliente(item, matcher = null) { return api.upsertCollectionItem("clientes", item, matcher); },
    upsertUsuario(item, matcher = null) { return api.upsertCollectionItem("usuarios", item, matcher); },
    upsertHardware(item, matcher = null) { return api.upsertCollectionItem("hardware", item, matcher); },

    /* CORE SYNC */

    hydrateFromCore() {
      const core = coreState(AppCore);
      const token = readTokenFromCore(AppCore);
      const user = readUserFromCore(AppCore);
      const session = sessionPatchFrom({
        AppCore,
        currentSession: state.session,
        authenticated: core.authenticated,
        token,
        user,
        role: first(core.role, core.rol, user?.role, user?.rol),
        roles: first(core.roles, user?.roles, []),
        permissions: first(core.permissions, core.permisos, user?.permissions, user?.permisos, []),
      });

      const publicPath = normalizePublicPath(first(core.publicPath, core.route, state.app?.publicPath, DEFAULT_ROUTE));
      const route = normalizeCanonicalPath(first(core.canonicalPath, core.route, publicPath, DEFAULT_ROUTE));
      const title = resolveTitle(AppCore);
      const topbarTitle = resolveTopbarTitle(AppCore) || title;
      const timestamp = nowMs();

      const result = patch({
        app: {
          ready: Boolean(first(core.ready, core.appReady, state.app?.ready, false)),
          booted: Boolean(first(core.booted, core.initialized, state.app?.booted, false)),
          initialized: Boolean(first(core.initialized, state.app?.initialized, false)),
          booting: Boolean(first(core.booting, core.coreInitializing, state.app?.booting, false)),
          loading: Boolean(first(core.loading, state.app?.loading, false)),
          route,
          canonicalPath: route,
          publicPath,
          routeMode: core.routeMode || state.app?.routeMode || "app",
          lastError: clone(first(core.lastError, core.error, state.app?.lastError, null), null),
          error: clone(first(core.error, core.lastError, state.app?.error, null), null),
          hasError: Boolean(first(core.hasError, core.error, core.lastError, state.app?.hasError, false)),
        },

        session,

        ui: {
          theme: normalizeTheme(first(core.theme, state.ui?.theme, defaultTheme(AppCore))),
          themePreference: normalizeTheme(first(core.themeMode, core.appearance, state.ui?.themePreference, defaultTheme(AppCore))),
          themeMode: normalizeTheme(first(core.themeMode, core.appearance, state.ui?.themeMode, defaultTheme(AppCore))),
          lang: normalizeLang(first(core.lang, state.ui?.lang, defaultLang(AppCore))),
          language: normalizeLang(first(core.language, core.lang, state.ui?.language, defaultLang(AppCore))),
          locale: normalizeLang(first(core.locale, core.lang, state.ui?.locale, defaultLang(AppCore))),
          sidebarOpen: Boolean(first(core.sidebarOpen, state.ui?.sidebarOpen, true)),
          shellVisible: Boolean(first(core.shellVisible, state.ui?.shellVisible, true)),
          chromeVisible: Boolean(first(core.chromeVisible, state.ui?.chromeVisible, true)),
          authScreen: Boolean(first(core.authScreen, state.ui?.authScreen, false)),
          routeMode: core.routeMode || state.ui?.routeMode || "app",
          density: safeText(first(core.density, state.ui?.density, coreConfig(AppCore).ui?.density, "default"), "default"),
          pageTitle: title,
          topbarTitle,
        },

        flags: {
          ...safeObject(state.flags),
          hydrated: true,
          hydrating: false,
          syncingCore: false,
        },

        meta: {
          ...safeObject(state.meta),
          hydrated: true,
          lastHydratedAt: timestamp,
          lastHydratedAtIso: nowIso(timestamp),
          updatedAt: timestamp,
          updatedAtIso: nowIso(timestamp),
        },
      });

      emit(AppCore, "store:hydrated-from-core", {
        authenticated: Boolean(session.authenticated),
        hasToken: Boolean(session.hasToken),
        hasUser: Boolean(session.user),
        route,
        publicPath,
        at: nowIso(),
      });

      return result;
    },

    touchMeta(extra = {}) {
      return patchMeta(extra);
    },
  };

  return api;
}

export default {
  STORE_ACTIONS_VERSION,
  createActions,
};

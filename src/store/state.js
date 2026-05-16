/* =========================================================
   Onion SPA - Store State
   Archivo: src/store/state.js

   STORE STATE · SIMPLE
   - El Store NO es dueño de auth, router ni HTTP.
   - AppCore sigue siendo fuente de sesión/ruta/config.
   - Store sólo mantiene snapshot ligero + datos de dominio.
   - Nunca guarda token real.
   - Auth estricta: token + user activo; si falta uno, no autentica.
========================================================= */

import {
  isBrowser,
  deepClone,
  normalizeCollection,
} from "./helpers.js";

export const STORE_STATE_VERSION = "16.0.0-simple";

const APP_NAME_FALLBACK = "Onion Support";
const DEFAULT_ROUTE = "/";
const DEFAULT_LANG = "es";
const DEFAULT_THEME = "dark";

const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

const RESOURCE_KEYS = Object.freeze([
  "tickets",
  "incidencias",
  "facturas",
  "clientes",
  "usuarios",
  "hardware",
  "recientes",
]);

const INDEXED_RESOURCE_KEYS = Object.freeze([
  "tickets",
  "incidencias",
  "facturas",
  "clientes",
  "usuarios",
  "hardware",
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
  "slug",
  "email",
  "mail",
]);

const INACTIVE_STATUSES = Object.freeze([
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

const ADMIN_ALIASES = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "owner",
  "root",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access|otp|mfa|2fa|code|csrf|xsrf/i;

/* =========================================================
   BASIC HELPERS
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

function safeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const clean = safeLower(value, "");

  if (["true", "yes", "si", "sí", "ok", "on", "active", "enabled"].includes(clean)) return true;
  if (["false", "no", "off", "inactive", "disabled"].includes(clean)) return false;

  return Boolean(fallback);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function isFunction(value) {
  return typeof value === "function";
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

function clone(value, fallback = null) {
  if (value === null || value === undefined) return value;

  try {
    return deepClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
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

function flatten(values = []) {
  const output = [];

  for (const value of safeArray(values)) {
    if (Array.isArray(value)) output.push(...flatten(value));
    else if (value instanceof Set) output.push(...flatten([...value]));
    else if (typeof value === "string") output.push(...value.split(/[,\s|]+/g));
    else if (value !== null && value !== undefined) output.push(value);
  }

  return output;
}

function unique(values = []) {
  return [...new Set(flatten(values).map((item) => safeText(item, "")).filter(Boolean))];
}

function toCollection(value) {
  try {
    const normalized = normalizeCollection(value);
    return Array.isArray(normalized) ? normalized.slice() : [];
  } catch {}

  return Array.isArray(value) ? value.slice() : [];
}

/* =========================================================
   APPCORE ACCESS
========================================================= */

function coreConfig(AppCore) {
  return safeObject(AppCore?.config);
}

function coreState(AppCore) {
  return safeObject(AppCore?.state);
}

function coreDom(AppCore) {
  return safeObject(AppCore?.dom);
}

function coreUtils(AppCore) {
  return safeObject(AppCore?.utils);
}

function appName(AppCore) {
  const config = coreConfig(AppCore);
  return safeText(config.appName, "") || safeText(config.name, "") || APP_NAME_FALLBACK;
}

/* =========================================================
   PATHS
========================================================= */

function isHashRouterPath(value = "") {
  const output = safeText(value, "");
  return output.startsWith("#/") || output.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const output = safeText(value, "");
  if (!output) return DEFAULT_ROUTE;
  if (output.startsWith("#!")) return output.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return output.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = safeText(pathname, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  const parts = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  value = `/${parts.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE : value || DEFAULT_ROUTE;
}

function splitPath(value = DEFAULT_ROUTE) {
  let raw = safeText(value, DEFAULT_ROUTE);

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

function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const parts = splitPath(normalizePublicPath(path));
  const clean = parts.pathname.replace(/^\/@[^/]+(?=\/|$)/i, "") || DEFAULT_ROUTE;
  return `${normalizePathname(clean)}${parts.search}${parts.hash}`;
}

function collapseTechnicalPath(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathname(pathname);

  if (clean === "/activate" || clean.startsWith("/activate/") || clean === "/activation" || clean.startsWith("/activation/") || clean === "/activate-account" || clean.startsWith("/activate-account/")) {
    return "/activate-account";
  }

  if (clean === "/password-reset/confirm" || clean.startsWith("/password-reset/confirm/") || clean === "/reset-password/confirm" || clean.startsWith("/reset-password/confirm/")) {
    return "/reset-password/confirm";
  }

  for (const base of ["/2fa", "/otp", "/mfa"]) {
    if (clean === base || clean.startsWith(`${base}/`)) return base;
  }

  return clean || DEFAULT_ROUTE;
}

function normalizeCanonical(path = DEFAULT_ROUTE) {
  const clean = splitPath(stripUsernamePrefix(path)).pathname;
  return collapseTechnicalPath(clean);
}

function browserPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const hash = window.location.hash || "";
    if (isHashRouterPath(hash)) return normalizePublicPath(hash);
    return normalizePublicPath(`${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function resolveRoute(AppCore) {
  const state = coreState(AppCore);
  const utils = coreUtils(AppCore);

  const rawPublicPath = first(
    state.publicPath,
    state.lastPublicPath,
    browserPublicPath(),
    state.route,
    DEFAULT_ROUTE
  );

  let publicPath = normalizePublicPath(rawPublicPath);

  try {
    if (isFunction(utils.normalizePath)) publicPath = normalizePublicPath(utils.normalizePath(publicPath) || publicPath);
  } catch {}

  let canonicalPath = normalizeCanonical(first(state.canonicalPath, state.route, publicPath, DEFAULT_ROUTE));

  try {
    if (isFunction(utils.normalizeCanonicalPath)) {
      canonicalPath = normalizeCanonical(utils.normalizeCanonicalPath(publicPath) || canonicalPath);
    }
  } catch {}

  return {
    route: canonicalPath,
    canonicalPath,
    publicPath: publicPath || canonicalPath || DEFAULT_ROUTE,
  };
}

/* =========================================================
   SESSION SNAPSHOT
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

function readCoreToken(AppCore) {
  const state = coreState(AppCore);
  const session = safeObject(state.session);
  const sessionData = safeObject(state.sessionData);

  let token = stripBearer(first(
    state.token,
    state.accessToken,
    state.access_token,
    state.jwt,
    state.bearer,
    session.token,
    session.accessToken,
    session.access_token,
    session.jwt,
    session.bearer,
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

function isInactiveUser(user = {}) {
  const current = safeObject(user);

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
    current.archived === true
  ) {
    return true;
  }

  const status = safeLower(
    current.status || current.estado || current.state || current.accountStatus || current.account_status || ""
  );

  return INACTIVE_STATUSES.includes(status);
}

function hasUsableUser(user = null) {
  const current = safeObject(user);
  if (!Object.keys(current).length) return false;
  if (isInactiveUser(current)) return false;
  return USER_ID_KEYS.some((key) => Boolean(safeText(current[key], "")));
}

function normalizeRole(value = "") {
  const role = safeLower(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();

  if (ADMIN_ALIASES.includes(role)) return ROLE_ADMIN;
  return role ? ROLE_USER : "";
}

function normalizeRoles(values = []) {
  const roles = unique(flatten(values).map(normalizeRole)).filter(Boolean);
  return roles.includes(ROLE_ADMIN) ? [ROLE_ADMIN] : roles.length ? [ROLE_USER] : [];
}

function readCoreUser(AppCore) {
  const state = coreState(AppCore);
  const session = safeObject(state.session);
  const sessionData = safeObject(state.sessionData);

  const raw = first(
    state.user,
    state.currentUser,
    state.authUser,
    state.sessionUser,
    state.account,
    state.profile,
    state.usuario,
    state.me,
    session.user,
    session.currentUser,
    session.authUser,
    session.sessionUser,
    session.account,
    session.profile,
    session.usuario,
    session.me,
    sessionData.user,
    sessionData.usuario,
    sessionData.me
  );

  if (!hasUsableUser(raw)) return null;

  try {
    const normalized = AppCore?.normalizeUser?.(raw) || AppCore?.utils?.normalizeUser?.(raw);
    if (hasUsableUser(normalized)) return normalized;
  } catch {}

  return clone(raw, null);
}

function displayNameOf(user = null) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);

  return safeText(
    first(
      current.displayName,
      current.display_name,
      current.fullName,
      current.full_name,
      current.name,
      current.nombre,
      profile.displayName,
      profile.display_name,
      profile.fullName,
      profile.name,
      current.username,
      current.email,
      "Usuario"
    ),
    "Usuario"
  );
}

function usernameOf(user = null) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);

  return safeText(
    first(
      current.slug,
      current.username,
      current.userName,
      current.user_name,
      current.login,
      current.alias,
      profile.slug,
      profile.username,
      current.email
    ),
    ""
  );
}

function avatarOf(user = null) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);

  if (current.hasAvatar === false || current.has_avatar === false || profile.hasAvatar === false || profile.has_avatar === false) {
    return "";
  }

  return safeText(
    first(
      current.avatarUrl,
      current.avatarURL,
      current.avatar_url,
      current.avatar,
      current.photoUrl,
      current.photoURL,
      current.photo_url,
      current.photo,
      current.pictureUrl,
      current.pictureURL,
      current.picture_url,
      current.picture,
      current.imageUrl,
      current.imageURL,
      current.image_url,
      current.image,
      profile.avatarUrl,
      profile.avatarURL,
      profile.avatar_url,
      profile.avatar,
      profile.photoUrl,
      profile.pictureUrl,
      profile.imageUrl
    ),
    ""
  );
}

function userIdOf(user = null) {
  const current = safeObject(user);
  return safeText(first(current.id, current.userId, current.user_id, current._id, current.uid, current.sub), "");
}

function sanitizeObject(value, depth = 0, keyHint = "") {
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return undefined;
  if (depth > 5) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return undefined;
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => sanitizeObject(item, depth + 1, keyHint));

  if (typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 160)) {
      const clean = sanitizeObject(item, depth + 1, key);
      if (clean !== undefined) output[key] = clean;
    }

    return output;
  }

  return String(value);
}

function publicUserSnapshot(user = null) {
  if (!hasUsableUser(user)) return null;

  const current = sanitizeObject(clone(user, {}) || {}) || {};
  const id = userIdOf(current);
  const displayName = displayNameOf(current);
  const username = usernameOf(current);
  const avatarUrl = avatarOf(current);
  const roles = normalizeRoles([current.roles, current.role, current.rol]);
  const role = roles.includes(ROLE_ADMIN) ? ROLE_ADMIN : ROLE_USER;

  return {
    ...current,

    id: current.id || id || null,
    userId: current.userId || current.user_id || id || null,
    user_id: current.user_id || current.userId || id || null,

    username: username || null,
    slug: current.slug || username || null,

    displayName,
    name: current.name || current.nombre || displayName,

    email: current.email || current.mail || null,

    role,
    rol: role,
    roles: [role],

    avatar: avatarUrl || null,
    avatarUrl: avatarUrl || null,
    picture: avatarUrl || null,
    hasAvatar: Boolean(avatarUrl),

    active: !isInactiveUser(current),
  };
}

function resolveSession(AppCore) {
  const state = coreState(AppCore);
  const token = readCoreToken(AppCore);
  const user = readCoreUser(AppCore);
  const hasToken = hasUsableToken(token);
  const hasUser = hasUsableUser(user);
  const authenticated = Boolean(state.authenticated === true && hasToken && hasUser);

  if (!authenticated) {
    return {
      authenticated: false,
      hasToken,
      user: null,
      role: null,
      roles: [],
      username: null,
      displayName: null,
      avatarUrl: null,
      currentResolvedUsername: null,
      isAdmin: false,
    };
  }

  const publicUser = publicUserSnapshot(user);
  const roles = normalizeRoles([state.roles, publicUser?.roles, state.role, state.rol, publicUser?.role, publicUser?.rol]);
  const role = roles.includes(ROLE_ADMIN) ? ROLE_ADMIN : ROLE_USER;

  return {
    authenticated: true,
    hasToken: true,
    user: publicUser,
    role,
    roles: [role],
    username: safeText(state.username, "") || usernameOf(publicUser) || null,
    displayName: displayNameOf(publicUser),
    avatarUrl: avatarOf(publicUser) || null,
    currentResolvedUsername:
      safeText(state.currentResolvedUsername, "") ||
      safeText(state.resolvedUsername, "") ||
      usernameOf(publicUser) ||
      null,
    isAdmin: role === ROLE_ADMIN,
  };
}

/* =========================================================
   THEME / LANG / TITLES
========================================================= */

function normalizeTheme(value = "") {
  const theme = safeLower(value, "");
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  if (theme === "system") return "system";
  return "";
}

function systemTheme() {
  if (!isBrowser()) return DEFAULT_THEME;

  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  } catch {
    return DEFAULT_THEME;
  }
}

function documentTheme() {
  if (!isBrowser()) return "";

  try {
    return normalizeTheme(
      document.documentElement?.dataset?.theme ||
        document.documentElement?.getAttribute("data-theme") ||
        document.body?.dataset?.theme ||
        document.body?.getAttribute("data-theme") ||
        ""
    );
  } catch {
    return "";
  }
}

function bootTheme() {
  if (!isBrowser()) return {};

  try {
    return safeObject(window.__ONION_BOOT_THEME__);
  } catch {
    return {};
  }
}

function resolveThemePreference(AppCore) {
  const state = coreState(AppCore);
  const config = coreConfig(AppCore);
  const boot = bootTheme();

  return (
    normalizeTheme(state.themePreference) ||
    normalizeTheme(state.themeMode) ||
    normalizeTheme(state.appearance) ||
    normalizeTheme(state.theme) ||
    normalizeTheme(boot.mode) ||
    normalizeTheme(boot.themeMode) ||
    normalizeTheme(config.defaultTheme) ||
    normalizeTheme(config.ui?.defaultTheme) ||
    DEFAULT_THEME
  );
}

function resolveTheme(AppCore) {
  const preference = resolveThemePreference(AppCore);
  return preference === "system" ? documentTheme() || systemTheme() : normalizeTheme(preference) || documentTheme() || systemTheme();
}

function normalizeLang(value = "") {
  const lang = safeLower(value, "").replace(/_/g, "-");
  if (!lang) return "";

  const firstPart = lang.split("-")[0];
  if (["spa", "spanish", "castellano", "español"].includes(firstPart)) return "es";
  if (["eng", "english"].includes(firstPart)) return "en";
  if (["cat", "catalan", "català", "catalán"].includes(firstPart)) return "ca";

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(lang) ? lang : "";
}

function resolveLang(AppCore) {
  const state = coreState(AppCore);
  const config = coreConfig(AppCore);

  return (
    normalizeLang(state.lang) ||
    normalizeLang(state.language) ||
    normalizeLang(state.locale) ||
    normalizeLang(config.defaultLang) ||
    normalizeLang(config.i18n?.defaultLang) ||
    DEFAULT_LANG
  );
}

export function safeTitle(AppCore) {
  const fallback = appName(AppCore);

  if (!isBrowser()) return fallback;

  try {
    return safeText(document.title, "") || fallback;
  } catch {
    return fallback;
  }
}

export function safeTopbarTitle(AppCore) {
  const dom = coreDom(AppCore);
  const candidates = [dom.topbarTitle?.textContent, dom.topbarViewTitle?.textContent];

  if (isBrowser()) {
    try {
      candidates.push(
        document.querySelector?.("#topbar-title")?.textContent,
        document.querySelector?.("[data-topbar-title]")?.textContent,
        document.querySelector?.(".topbar-title")?.textContent
      );
    } catch {}
  }

  return safeText(first(...candidates), "") || safeTitle(AppCore);
}

/* =========================================================
   SLICES
========================================================= */

function buildAppSlice(AppCore) {
  const state = coreState(AppCore);
  const route = resolveRoute(AppCore);

  return {
    ready: Boolean(state.ready || state.appReady || state.coreReady),
    booted: Boolean(state.booted || state.initialized),
    initialized: Boolean(state.initialized),
    booting: Boolean(state.booting || state.coreInitializing),
    loading: Boolean(state.loading),
    fatal: Boolean(state.appFatal || state.fatal),

    route: route.route,
    canonicalPath: route.canonicalPath,
    publicPath: route.publicPath,

    lastRoute: state.lastRoute || null,
    lastPublicPath: state.lastPublicPath || null,
    routeMode: state.routeMode || "boot",

    lastError: clone(state.lastError || state.error || null, null),
  };
}

function buildSessionSlice(AppCore) {
  const session = resolveSession(AppCore);

  return {
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

    currentResolvedUsername: session.currentResolvedUsername,

    isAdmin: session.isAdmin,
    isUser: session.role === ROLE_USER,
    isClient: false,
    isSupport: false,
    isManager: false,
  };
}

function buildUiSlice(AppCore) {
  const state = coreState(AppCore);
  const themePreference = resolveThemePreference(AppCore);
  const theme = resolveTheme(AppCore);
  const lang = resolveLang(AppCore);

  return {
    theme,
    themePreference,
    themeMode: themePreference,

    lang,
    language: lang,
    locale: lang,

    sidebarOpen: state.sidebarOpen !== undefined ? Boolean(state.sidebarOpen) : true,
    shellVisible: state.shellVisible !== undefined ? Boolean(state.shellVisible) : true,
    chromeVisible: state.chromeVisible !== undefined ? Boolean(state.chromeVisible) : true,

    authScreen: Boolean(state.authScreen),
    routeMode: state.routeMode || "boot",
    density: state.density || "default",

    pageTitle: safeTitle(AppCore),
    topbarTitle: safeTopbarTitle(AppCore),
  };
}

function createByIdMap(seed = {}) {
  const source = safeObject(seed);
  return Object.fromEntries(INDEXED_RESOURCE_KEYS.map((key) => [key, safeObject(source[key], {})]));
}

function buildEntitiesSlice(seed = {}) {
  const source = safeObject(seed);

  return {
    tickets: toCollection(source.tickets),
    incidencias: toCollection(source.incidencias),
    facturas: toCollection(source.facturas),
    clientes: toCollection(source.clientes),
    usuarios: toCollection(source.usuarios),
    hardware: toCollection(source.hardware),
    recientes: toCollection(source.recientes),

    dashboard: source.dashboard ? clone(source.dashboard, null) : null,

    search: {
      query: safeText(source.search?.query, ""),
      results: toCollection(source.search?.results),
      lastResults: toCollection(source.search?.lastResults),
      loading: Boolean(source.search?.loading),
      error: clone(source.search?.error || null, null),
      meta: clone(source.search?.meta || {}, {}),
    },

    byId: createByIdMap(source.byId || {}),
  };
}

function buildFlagsSlice(seed = {}) {
  const source = safeObject(seed);

  const flags = {
    hydrating: Boolean(source.hydrating),
    hydrated: Boolean(source.hydrated),
    syncingCore: Boolean(source.syncingCore),
    refreshing: Boolean(source.refreshing),
    saving: Boolean(source.saving),
  };

  for (const key of FETCH_FLAG_KEYS) flags[`fetching${key}`] = Boolean(source[`fetching${key}`]);

  return flags;
}

function buildMetaSlice(seed = {}) {
  const source = safeObject(seed);
  const createdAt = safeNumber(source.createdAt, nowMs());
  const updatedAt = safeNumber(source.updatedAt, createdAt);

  return {
    version: STORE_STATE_VERSION,
    hydrated: Boolean(source.hydrated),
    revision: safeNumber(source.revision, 0),
    createdAt,
    createdAtIso: source.createdAtIso || nowIso(createdAt),
    updatedAt,
    updatedAtIso: source.updatedAtIso || nowIso(updatedAt),
    source: source.source || "store:state",
    resourceKeys: [...RESOURCE_KEYS],
    indexedResourceKeys: [...INDEXED_RESOURCE_KEYS],
  };
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function buildInitialState(AppCore = null) {
  return {
    app: buildAppSlice(AppCore),
    session: buildSessionSlice(AppCore),
    ui: buildUiSlice(AppCore),
    entities: buildEntitiesSlice(),
    flags: buildFlagsSlice(),
    meta: buildMetaSlice(),
  };
}

/* =========================================================
   META
========================================================= */

export function touchMeta(state, extra = {}) {
  if (!state || typeof state !== "object") return false;

  if (!isObject(state.meta)) state.meta = {};

  const timestamp = nowMs();

  state.meta.version = STORE_STATE_VERSION;
  state.meta.updatedAt = timestamp;
  state.meta.updatedAtIso = nowIso(timestamp);
  state.meta.revision = safeNumber(state.meta.revision, 0) + 1;

  if (isObject(extra)) Object.assign(state.meta, clone(extra, {}));

  return true;
}

/* =========================================================
   SNAPSHOTS
========================================================= */

function sanitizeValue(value, keyHint = "", depth = 0, seen = new WeakSet()) {
  if (depth > 8) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : null;
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, keyHint, depth + 1, seen));

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeValue(item, key, depth + 1, seen);
    }

    return output;
  }

  return String(value);
}

function cloneEntities(entities = {}) {
  return buildEntitiesSlice(entities);
}

export function shallowCloneRoot(state = {}) {
  const source = safeObject(state);

  return {
    app: {
      ...safeObject(source.app),
      lastError: clone(source.app?.lastError || null, null),
    },

    session: {
      ...safeObject(source.session),
      token: null,
      accessToken: null,
      user: source.session?.user ? clone(source.session.user, null) : null,
      roles: safeArray(source.session?.roles).slice(),
    },

    ui: {
      ...safeObject(source.ui),
    },

    entities: cloneEntities(source.entities),

    flags: {
      ...safeObject(source.flags),
    },

    meta: {
      ...safeObject(source.meta),
    },
  };
}

export function buildSafeSnapshot(state = {}) {
  return sanitizeValue(shallowCloneRoot(state));
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

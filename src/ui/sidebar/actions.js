/* =========================================================
   Onion SPA - Sidebar Actions
   Archivo: src/ui/sidebar/actions.js

   SIDEBAR ACTIONS · SIMPLE
   - acciones de intención del sidebar
   - state.js gobierna estado/clases/indicator
   - navegación delegada a Router/AppCore/history fallback
   - logout: remoto si existe + limpieza local concreta + /login
   - sin storage.clear(), sin cookies masivas, sin lógica visual duplicada
========================================================= */

import {
  setSidebarOpen as setSidebarOpenState,
  getDesiredSidebarOpenState,
  isMobileViewport,
  syncSidebarState as syncSidebarStateBase,
} from "./state.js";

export const SIDEBAR_ACTIONS_VERSION = "sidebar-actions-v17-simple";

const SOURCE = "SidebarActions";
const OWNER = "actions.js";
const LOG_PREFIX = "[SidebarActions]";
const LOGIN_ROUTE = "/login";
const REMOTE_LOGOUT_TIMEOUT_MS = 9000;

const EVENTS = Object.freeze({
  actionStart: "sidebar:action:start",
  actionComplete: "sidebar:action:complete",
  actionError: "sidebar:action:error",

  open: "sidebar:open",
  close: "sidebar:close",
  toggle: "sidebar:toggle",
  collapse: "sidebar:collapse",
  expand: "sidebar:expand",
  mobileCloseAfterNavigation: "sidebar:mobile:close-after-navigation",

  navigationStart: "sidebar:navigation:start",
  navigationComplete: "sidebar:navigation:complete",
  navigationError: "sidebar:navigation:error",

  logoutStart: "sidebar:logout:start",
  logoutRemoteSuccess: "sidebar:logout:remote:success",
  logoutRemoteError: "sidebar:logout:remote:error",
  logoutRemoteSkipped: "sidebar:logout:remote:skipped",
  logoutLocalCleared: "sidebar:logout:local-cleared",
  logoutComplete: "sidebar:logout:complete",
  logoutError: "sidebar:logout:error",
  logoutFinally: "sidebar:logout:finally",

  appSessionCleared: "app:session:cleared",
  authSessionCleared: "auth:session:cleared",
  authLogoutSuccess: "auth:logout:success",
  userUiSync: "app:user-ui:sync",
  uiRepairRequest: "app:ui:repair-request",
});

const ROUTE_ALIASES = Object.freeze({
  "/home": "/",
  "/dashboard": "/",
  "/inicio": "/",
  "/inici": "/",

  "/tickets": "/incidencias",
  "/ticket": "/incidencias",
  "/incidents": "/incidencias",
  "/incident": "/incidencias",
  "/incidencia": "/incidencias",

  "/invoices": "/facturas",
  "/invoice": "/facturas",
  "/billing": "/facturas",
  "/factura": "/facturas",

  "/users": "/usuarios",
  "/user": "/usuarios",
  "/usuario": "/usuarios",

  "/clients": "/clientes",
  "/client": "/clientes",
  "/customers": "/clientes",
  "/customer": "/clientes",
  "/cliente": "/clientes",

  "/account": "/cuenta",
  "/profile": "/cuenta",
  "/perfil": "/cuenta",

  "/settings": "/ajustes",
  "/config": "/ajustes",
  "/configuration": "/ajustes",
  "/configuracion": "/ajustes",
  "/configuración": "/ajustes",

  "/server": "/servidor",
});

const AUTH_STORAGE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
  "idToken",
  "id_token",
  "refreshToken",
  "refresh_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "session",
  "sessionData",
  "sessionId",
  "session_id",
  "sessionUserId",
  "session_user_id",
  "user",
  "usuario",
  "currentUser",
  "sessionUser",
  "authUser",
  "profile",
  "account",
  "username",
  "displayName",
  "name",
  "email",
  "role",
  "rol",
  "roles",
  "permissions",
  "permisos",
  "scopes",
]);

let logoutPromise = null;
let logoutGeneration = 0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowTs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSensitiveText(value = "") {
  let output = safeText(value, "");
  if (!output) return "";

  for (const name of ["token", "access_token", "refresh_token", "id_token", "tempToken", "code", "t", "sig", "signature"]) {
    try {
      output = output.replace(new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  return output
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function cloneError(error = null) {
  if (!error) return null;

  return {
    name: safeText(error?.name, "Error"),
    message: redactSensitiveText(safeText(error?.message || error, "")),
    code: redactSensitiveText(safeText(error?.code, "")) || null,
    status: error?.status ?? error?.statusCode ?? error?.response?.status ?? null,
    timeout: Boolean(error?.timeout),
  };
}

function sanitizePayload(value, depth = 0) {
  if (depth > 5) return "[MaxDepth]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[Function]";
  if (value instanceof Error) return cloneError(value);
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1));

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = /token|secret|password|authorization|credential|jwt|bearer|otp|code/i.test(key)
        ? item ? "***" : item
        : sanitizePayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function safeWarn(AppCore, ...args) {
  const clean = args.map((item) => sanitizePayload(item));

  try {
    AppCore?.utils?.warn?.(LOG_PREFIX, ...clean);
    return;
  } catch {}

  try {
    console.warn(LOG_PREFIX, ...clean);
  } catch {}
}

function safeError(AppCore, ...args) {
  const clean = args.map((item) => sanitizePayload(item));

  try {
    AppCore?.utils?.error?.(LOG_PREFIX, ...clean);
    return;
  } catch {}

  try {
    console.error(LOG_PREFIX, ...clean);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const data = safeObject(payload);
  const detail = sanitizePayload({
    ...data,
    source: safeText(data.source, SOURCE),
    actionSource: SOURCE,
    owner: OWNER,
    version: SIDEBAR_ACTIONS_VERSION,
    at: safeText(data.at, safeIsoDate()),
    ts: data.ts || nowTs(),
  });

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, detail);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function sleep(ms = 0) {
  return new Promise((resolve) => {
    const delay = Math.max(0, Number(ms) || 0);

    try {
      if (typeof window !== "undefined") {
        window.setTimeout(resolve, delay);
        return;
      }
    } catch {}

    try {
      setTimeout(resolve, delay);
      return;
    } catch {}

    resolve();
  });
}

async function withTimeout(promise, ms = REMOTE_LOGOUT_TIMEOUT_MS, label = "timeout") {
  const timeoutMs = Math.max(1000, Number(ms) || REMOTE_LOGOUT_TIMEOUT_MS);
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label}:${timeoutMs}ms`);
      error.code = "SIDEBAR_ACTION_TIMEOUT";
      error.timeout = true;
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    try {
      clearTimeout(timer);
    } catch {}
  }
}

function getModule(AppCore = null, name = "") {
  const clean = safeText(name, "");
  if (!AppCore || !clean) return null;

  try {
    return AppCore?.modules?.get?.(clean) || null;
  } catch {}

  try {
    return AppCore?.modules?.[clean] || null;
  } catch {
    return null;
  }
}

function resolveAuth(Auth, AppCore) {
  return Auth || AppCore?.Auth || AppCore?.auth || AppCore?.features?.auth || getModule(AppCore, "Auth") || getModule(AppCore, "auth") || null;
}

function resolveRouter(Router, AppCore) {
  return Router || AppCore?.Router || AppCore?.router || getModule(AppCore, "Router") || getModule(AppCore, "router") || null;
}

/* =========================================================
   ROUTES
========================================================= */

function getBaseOrigin() {
  try {
    if (isBrowser() && window.location?.origin) return window.location.origin;
  } catch {}

  return "http://localhost";
}

function isUnsafeRouteValue(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return raw.startsWith("javascript:") || raw.startsWith("data:") || raw.startsWith("vbscript:") || raw.startsWith("file:") || raw.startsWith("mailto:") || raw.startsWith("tel:");
}

function isProtocolHref(value = "") {
  return /^[a-z][a-z0-9+.-]*:/i.test(safeText(value, ""));
}

function isExternalHref(value = "") {
  const raw = safeText(value, "");
  if (!raw || !isProtocolHref(raw)) return false;

  try {
    const url = new URL(raw, getBaseOrigin());
    if (["http:", "https:"].includes(url.protocol)) return url.origin !== getBaseOrigin();
    return true;
  } catch {
    return true;
  }
}

function isHashOnlyHref(value = "") {
  const href = safeText(value, "");
  return Boolean(href.startsWith("#") && !href.startsWith("#/") && !href.startsWith("#!"));
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  return raw.startsWith("#!") ? raw.replace(/^#!\/?/, "/") : raw.replace(/^#\/?/, "/");
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value;
}

function stripPublicUsernamePrefix(pathname = "/") {
  return safeText(pathname, "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
}

function applyRouteAlias(pathname = "/") {
  const clean = normalizePathname(pathname || "/");
  if (ROUTE_ALIASES[clean]) return ROUTE_ALIASES[clean];

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (from !== "/" && clean.startsWith(`${from}/`)) return `${to}${clean.slice(from.length)}`;
  }

  return clean;
}

function normalizeRoutePath(path = "/") {
  let value = safeText(path, "/");
  if (!value) return "/";
  if (isUnsafeRouteValue(value) || isExternalHref(value) || isHashOnlyHref(value)) return "";
  if (isHashRouterPath(value)) value = normalizeHashRouterPath(value);

  try {
    const parsed = new URL(value, getBaseOrigin());
    if (parsed.hash && isHashRouterPath(parsed.hash)) value = normalizeHashRouterPath(parsed.hash);
    else value = `${parsed.pathname || "/"}${parsed.search || ""}`;
  } catch {
    value = value.split("#")[0] || "/";
  }

  value = safeText(value, "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;

  const queryIndex = value.indexOf("?");
  const pathname = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : "";
  const cleanPathname = applyRouteAlias(stripPublicUsernamePrefix(normalizePathname(pathname || "/")));

  return query ? `${cleanPathname}?${query}` : cleanPathname;
}

function stripQuery(path = "/") {
  return (normalizeRoutePath(path || "/") || "/").split("?")[0] || "/";
}

function patchRouteState(AppCore, target = LOGIN_ROUTE) {
  const publicPath = normalizeRoutePath(target || LOGIN_ROUTE) || LOGIN_ROUTE;
  const canonicalPath = stripQuery(publicPath);
  const patch = { publicPath, route: canonicalPath, canonicalPath };

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, patch);
  } catch {}

  for (const method of ["setState", "patchState"]) {
    try {
      AppCore?.[method]?.(patch, {
        source: "sidebar:actions:navigation",
        emit: false,
        emitState: false,
        silent: true,
      });
    } catch {}
  }

  return patch;
}

function dispatchPopStateSafe() {
  if (!isBrowser()) return false;

  try {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  } catch {}

  try {
    window.dispatchEvent(new Event("popstate"));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SIDEBAR STATE ACTIONS
========================================================= */

function syncStateFallback(AppCore, closeDropdown, syncSidebarState) {
  try {
    if (isFn(syncSidebarState)) return Boolean(syncSidebarState());
  } catch {}

  try {
    return Boolean(syncSidebarStateBase(AppCore, closeDropdown));
  } catch {
    return false;
  }
}

export function setSidebarOpen({ AppCore, open, closeDropdown, syncSidebarState, reason = "set-sidebar-open" } = {}) {
  const nextOpen = Boolean(open);

  safeEmit(AppCore, EVENTS.actionStart, { action: "setSidebarOpen", open: nextOpen, reason });

  try {
    const result = setSidebarOpenState(AppCore, nextOpen, closeDropdown);
    if (!result) syncStateFallback(AppCore, closeDropdown, syncSidebarState);

    safeEmit(AppCore, EVENTS.actionComplete, { action: "setSidebarOpen", open: nextOpen, reason, result: Boolean(result) });
    return Boolean(result);
  } catch (error) {
    const fallbackResult = syncStateFallback(AppCore, closeDropdown, syncSidebarState);

    safeWarn(AppCore, "setSidebarOpen falló.", error);
    safeEmit(AppCore, EVENTS.actionError, {
      action: "setSidebarOpen",
      open: nextOpen,
      reason,
      fallbackResult,
      error: cloneError(error),
    });

    return Boolean(fallbackResult);
  }
}

export function openSidebar({ AppCore, closeDropdown, syncSidebarState, reason = "open-sidebar" } = {}) {
  const result = setSidebarOpen({ AppCore, open: true, closeDropdown, syncSidebarState, reason });
  safeEmit(AppCore, EVENTS.open, { open: true, reason, result });
  return result;
}

export function closeSidebar({ AppCore, closeDropdown, syncSidebarState, reason = "close-sidebar" } = {}) {
  try {
    closeDropdown?.({ force: true, reason });
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  const result = setSidebarOpen({ AppCore, open: false, closeDropdown, syncSidebarState, reason });
  safeEmit(AppCore, EVENTS.close, { open: false, reason, result });
  return result;
}

export function toggleSidebar({ AppCore, closeDropdown, syncSidebarState, reason = "toggle-sidebar" } = {}) {
  let currentOpen = true;

  try {
    currentOpen = Boolean(getDesiredSidebarOpenState(AppCore));
  } catch {
    currentOpen = Boolean(AppCore?.state?.sidebarOpen);
  }

  const nextOpen = !currentOpen;
  const result = setSidebarOpen({ AppCore, open: nextOpen, closeDropdown, syncSidebarState, reason });

  safeEmit(AppCore, EVENTS.toggle, { previousOpen: currentOpen, open: nextOpen, reason, result });
  return result;
}

export function collapseSidebar({ AppCore, closeDropdown, syncSidebarState, reason = "collapse-sidebar" } = {}) {
  const result = closeSidebar({ AppCore, closeDropdown, syncSidebarState, reason });
  safeEmit(AppCore, EVENTS.collapse, { open: false, collapsed: true, mobile: isMobileViewport(), reason, result });
  return result;
}

export function expandSidebar({ AppCore, closeDropdown, syncSidebarState, reason = "expand-sidebar" } = {}) {
  const result = openSidebar({ AppCore, closeDropdown, syncSidebarState, reason });
  safeEmit(AppCore, EVENTS.expand, { open: true, collapsed: false, mobile: isMobileViewport(), reason, result });
  return result;
}

export function ensureSidebarOpenForUserMenu({ AppCore, closeDropdown, syncSidebarState, reason = "ensure-sidebar-open-for-user-menu" } = {}) {
  let open = true;

  try {
    open = Boolean(getDesiredSidebarOpenState(AppCore));
  } catch {
    open = Boolean(AppCore?.state?.sidebarOpen);
  }

  return open ? false : expandSidebar({ AppCore, closeDropdown, syncSidebarState, reason });
}

export function closeSidebarOnMobileAfterNavigation({ AppCore, closeDropdown, syncSidebarState, reason = "mobile-navigation" } = {}) {
  if (!isMobileViewport()) return false;

  const result = closeSidebar({ AppCore, closeDropdown, syncSidebarState, reason });
  safeEmit(AppCore, EVENTS.mobileCloseAfterNavigation, { open: false, mobile: true, reason, result });
  return result;
}

/* =========================================================
   NAVIGATION
========================================================= */

async function invokeNavigation(methodName, fn, ctx, cleanTarget, options) {
  if (!isFn(fn)) return { ok: false, skipped: true, method: methodName };

  try {
    const result = await Promise.resolve(fn.call(ctx, cleanTarget, options));
    return result === false
      ? { ok: false, skipped: false, returnedFalse: true, method: methodName }
      : { ok: true, method: methodName, result };
  } catch (error) {
    return { ok: false, skipped: false, method: methodName, error };
  }
}

async function navigateToTarget({ AppCore, Router, target = "", replace = false, source = "sidebar", force = false } = {}) {
  const router = resolveRouter(Router, AppCore);
  const cleanTarget = normalizeRoutePath(target);

  if (!cleanTarget) {
    safeEmit(AppCore, EVENTS.navigationError, { target, source, error: { code: "INVALID_TARGET", message: "Destino no seguro o vacío." } });
    return false;
  }

  const canonicalPath = stripQuery(cleanTarget);
  const options = {
    replaceState: Boolean(replace),
    replace: Boolean(replace),
    force: Boolean(force),
    source,
    publicPath: cleanTarget,
    requestedPath: cleanTarget,
    canonicalPath,
  };

  safeEmit(AppCore, EVENTS.navigationStart, { target: cleanTarget, canonicalPath, replace: Boolean(replace), force: Boolean(force), source });

  const candidates = [
    ["Router.replace", replace ? router?.replace : null, router],
    ["Router.navigate", router?.navigate, router],
    ["Router.go", router?.go, router],
    ["Router.push", !replace ? router?.push : null, router],
    ["AppCore.navigate", AppCore?.navigate, AppCore],
  ];

  for (const [name, fn, ctx] of candidates) {
    const result = await invokeNavigation(name, fn, ctx, cleanTarget, options);

    if (result.ok) {
      patchRouteState(AppCore, cleanTarget);
      safeEmit(AppCore, EVENTS.navigationComplete, { ok: true, method: result.method, target: cleanTarget, canonicalPath, replace: Boolean(replace), force: Boolean(force), source });
      return true;
    }

    if (!result.skipped && result.error) safeWarn(AppCore, `${result.method}("${cleanTarget}") falló.`, result.error);
  }

  if (!isBrowser()) {
    safeEmit(AppCore, EVENTS.navigationComplete, { ok: false, target: cleanTarget, canonicalPath, reason: "not-browser", source });
    return false;
  }

  try {
    const state = { path: cleanTarget, publicPath: cleanTarget, canonicalPath, source, ts: nowTs() };

    if (replace) window.history.replaceState(state, "", cleanTarget);
    else window.history.pushState(state, "", cleanTarget);

    patchRouteState(AppCore, cleanTarget);
    dispatchPopStateSafe();

    safeEmit(AppCore, EVENTS.navigationComplete, { ok: true, method: replace ? "history.replaceState" : "history.pushState", target: cleanTarget, canonicalPath, replace: Boolean(replace), source });
    return true;
  } catch (error) {
    safeEmit(AppCore, EVENTS.navigationError, { target: cleanTarget, canonicalPath, source, error: cloneError(error) });
  }

  return false;
}

export async function navigateFromSidebar({ AppCore, Router, target = "", closeDropdown, closeSidebarOnMobile = true, syncSidebarState, replace = false, source = "sidebar" } = {}) {
  try {
    closeDropdown?.({ force: true, reason: "navigate-from-sidebar" });
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  const ok = await navigateToTarget({ AppCore, Router, target, replace, source, force: false });

  if (ok && closeSidebarOnMobile) {
    closeSidebarOnMobileAfterNavigation({ AppCore, closeDropdown, syncSidebarState, reason: "navigate-from-sidebar" });
  }

  return ok;
}

/* =========================================================
   LOGOUT
========================================================= */

function setLoading(AppCore, value = false) {
  const loading = Boolean(value);

  try {
    if (isFn(AppCore?.setLoading)) {
      AppCore.setLoading(loading);
      return true;
    }
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") AppCore.state.loading = loading;
  } catch {}

  try {
    AppCore?.setState?.({ loading }, { source: "sidebar:actions", emit: false, emitState: false, silent: true });
    return true;
  } catch {}

  return false;
}

function authClearPatch() {
  return {
    authenticated: false,
    isAuthenticated: false,
    hasToken: false,
    token: null,
    accessToken: null,
    access_token: null,
    authToken: null,
    auth_token: null,
    jwt: null,
    refreshToken: null,
    refresh_token: null,
    tempToken: null,
    temp_token: null,
    session: null,
    sessionData: null,
    sessionId: null,
    session_id: null,
    sessionUserId: null,
    session_user_id: null,
    user: null,
    usuario: null,
    currentUser: null,
    sessionUser: null,
    authUser: null,
    profile: null,
    account: null,
    avatar: null,
    avatarUrl: null,
    role: "",
    rol: "",
    userRole: "",
    username: "",
    userName: "",
    displayName: "",
    name: "",
    email: "",
    currentResolvedUsername: null,
    resolvedUsername: null,
    roles: [],
    permissions: [],
    permisos: [],
    scopes: [],
    groups: [],
    authorities: [],
    isAdmin: false,
    admin: false,
    twoFactorPending: false,
    mfaPending: false,
    loginInProgress: false,
    restoreInProgress: false,
    lastAuthSource: "logout",
    lastLogoutAt: safeIsoDate(),
  };
}

function clearNestedAuthState(AppCore) {
  const patch = authClearPatch();
  let changed = false;

  try {
    const state = AppCore?.state;
    if (!state || typeof state !== "object") return false;

    for (const key of ["auth", "sessionAuth", "authState", "session"]) {
      if (state[key] && typeof state[key] === "object") {
        Object.assign(state[key], patch);
        changed = true;
      }
    }
  } catch {}

  return changed;
}

async function callAuthClear(Auth, AppCore) {
  const options = {
    silent: true,
    reason: "sidebar-logout",
    source: "sidebar",
    navigate: false,
    redirect: false,
    remote: false,
    notifyServer: false,
    emit: false,
    emitEvents: false,
  };

  let cleared = false;

  for (const method of ["clearSessionLocal", "clearLocalSession", "clearSession", "resetSession", "clearAuthStorage", "clear"]) {
    try {
      if (isFn(Auth?.[method])) {
        await Promise.resolve(Auth[method](options));
        cleared = true;
      }
    } catch (error) {
      safeWarn(AppCore, `Auth.${method} falló.`, error);
    }
  }

  return cleared;
}

function clearAppCoreSession(AppCore) {
  const patch = authClearPatch();
  let cleared = false;

  try {
    AppCore?.clearSession?.({ silent: true, reason: "sidebar-logout", source: "sidebar", navigate: false, redirect: false, emit: false, emitEvents: false });
    cleared = true;
  } catch {}

  for (const method of ["setToken", "setUser"]) {
    try {
      AppCore?.[method]?.(null);
      cleared = true;
    } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
      cleared = true;
    }
  } catch {}

  for (const method of ["setState", "patchState"]) {
    try {
      AppCore?.[method]?.(patch, {
        source: "sidebar:logout",
        forceUnauthenticated: true,
        emit: false,
        emitState: false,
        silent: true,
      });
      cleared = true;
    } catch {}
  }

  return clearNestedAuthState(AppCore) || cleared;
}

function clearAuthHeaders(AppCore, Auth) {
  const clients = [
    AppCore?.http,
    AppCore?.Http,
    AppCore?.apiClient,
    AppCore?.services?.http,
    AppCore?.services?.api,
    AppCore?.services?.apiClient,
    Auth?.http,
    Auth?.api,
    Auth?.client,
  ].filter(Boolean);

  let cleared = false;

  for (const client of clients) {
    try {
      if (client.defaults?.headers?.common?.Authorization) {
        delete client.defaults.headers.common.Authorization;
        cleared = true;
      }
    } catch {}

    try {
      if (client.defaults?.headers?.Authorization) {
        delete client.defaults.headers.Authorization;
        cleared = true;
      }
    } catch {}

    try {
      client.setAuthToken?.(null);
      cleared = true;
    } catch {}

    try {
      client.setToken?.(null);
      cleared = true;
    } catch {}

    try {
      client.clearAuth?.();
      cleared = true;
    } catch {}
  }

  return cleared;
}

function storageKeys(AppCore) {
  const prefix = safeText(AppCore?.config?.storagePrefix || AppCore?.config?.storageKeyPrefix || AppCore?.config?.appKey, "onion");
  const keys = [];

  for (const key of AUTH_STORAGE_KEYS) {
    keys.push(key);
    keys.push(`${prefix}:${key}`);
    keys.push(`${prefix}_${key.replace(/[.:]/g, "_")}`);
    keys.push(key.replace(/\./g, ":"));
    keys.push(key.replace(/\./g, "_"));
  }

  return [...new Set(keys.filter(Boolean))];
}

function removeStorageKey(storage, key) {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

function clearKnownAuthStorage(AppCore) {
  let removed = 0;
  let appCoreRemoved = 0;
  const keys = storageKeys(AppCore);

  for (const key of keys) {
    try {
      AppCore?.storage?.remove?.(key);
      appCoreRemoved += 1;
    } catch {}

    try {
      AppCore?.storage?.delete?.(key);
      appCoreRemoved += 1;
    } catch {}
  }

  if (isBrowser()) {
    for (const key of keys) {
      if (removeStorageKey(window.localStorage, key)) removed += 1;
      if (removeStorageKey(window.sessionStorage, key)) removed += 1;
    }
  }

  return { removed, appCoreRemoved };
}

async function clearSessionEverywhere({ Auth, AppCore } = {}) {
  const resolvedAuth = resolveAuth(Auth, AppCore);

  const authCleared = await callAuthClear(resolvedAuth, AppCore);
  const coreCleared = clearAppCoreSession(AppCore);
  const authHeadersCleared = clearAuthHeaders(AppCore, resolvedAuth);
  const storageResult = clearKnownAuthStorage(AppCore);

  const result = {
    authCleared,
    coreCleared,
    authHeadersCleared,
    storageRemoved: storageResult.removed || 0,
    appCoreStorageRemoved: storageResult.appCoreRemoved || 0,
  };

  safeEmit(AppCore, EVENTS.logoutLocalCleared, result);
  safeEmit(AppCore, EVENTS.appSessionCleared, { source: "sidebar:logout", local: result });
  safeEmit(AppCore, EVENTS.authSessionCleared, { source: "sidebar:logout", local: result });
  safeEmit(AppCore, EVENTS.authLogoutSuccess, { source: "sidebar:logout", localOnly: true, local: result });

  return result;
}

function hideGlobalLoader(AppCore, reason = "sidebar:logout") {
  setLoading(AppCore, false);

  if (!isBrowser()) return false;

  try {
    document.documentElement?.classList?.remove?.("app-loading", "app-booting", "loading");
    document.body?.classList?.remove?.("app-loading", "app-booting", "loading");
    if (document.documentElement?.dataset) document.documentElement.dataset.appLoading = "false";
    if (document.body?.dataset) document.body.dataset.appLoading = "false";
  } catch {}

  for (const selector of ["#app-loader", ".app-loader", "[data-app-loader='true']", "[data-loader='app']"]) {
    let loader = null;

    try {
      loader = document.querySelector(selector);
    } catch {}

    if (!loader) continue;

    try {
      loader.classList.remove("is-visible", "is-leaving", "app-loader--visible");
      loader.classList.add("is-hidden", "has-hidden");
      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("aria-busy", "false");
      loader.dataset.loaderVisible = "false";
      loader.dataset.loaderState = "hidden";
      loader.hidden = true;
    } catch {}
  }

  safeEmit(AppCore, "app:loader:hidden", { reason, source: "sidebar.actions" });
  return true;
}

function syncSidebarAfterLogout({ AppCore, closeDropdown, renderUser, applyRoleVisibility, closeSidebarOnMobileAfterNavigation: closeMobileFn, syncSidebarState } = {}) {
  try {
    closeDropdown?.({ force: true, reason: "logout" });
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  try {
    renderUser?.("logout", { reason: "logout", authenticated: false, user: null });
  } catch {}

  try {
    applyRoleVisibility?.("logout", { reason: "logout", authenticated: false, user: null });
  } catch {}

  try {
    closeMobileFn?.({ reason: "logout" });
  } catch {}

  try {
    syncSidebarState?.("logout");
  } catch {}

  safeEmit(AppCore, EVENTS.userUiSync, { source: "sidebar:logout" });
  safeEmit(AppCore, EVENTS.uiRepairRequest, { source: "sidebar:logout", reason: "logout", syncState: true });

  return true;
}

async function navigateToLogin({ AppCore, Router } = {}) {
  return navigateToTarget({ AppCore, Router, target: LOGIN_ROUTE, replace: true, force: true, source: "sidebar:logout" });
}

function remoteLogoutCandidates(Auth) {
  return [
    ["Auth.logoutRemote", Auth?.logoutRemote, Auth],
    ["Auth.remoteLogout", Auth?.remoteLogout, Auth],
    ["Auth.signOutRemote", Auth?.signOutRemote, Auth],
    ["Auth.revokeSession", Auth?.revokeSession, Auth],
    ["Auth.api.logout", Auth?.api?.logout, Auth?.api],
    ["Auth.client.logout", Auth?.client?.logout, Auth?.client],
    ["Auth.logout", Auth?.logout, Auth],
    ["Auth.signOut", Auth?.signOut, Auth],
  ].filter(([, fn]) => isFn(fn));
}

async function runRemoteLogout({ Auth, AppCore } = {}) {
  const resolvedAuth = resolveAuth(Auth, AppCore);
  const candidates = remoteLogoutCandidates(resolvedAuth);

  if (!candidates.length) {
    const result = { attempted: false, ok: false, method: "", error: null };
    safeEmit(AppCore, EVENTS.logoutRemoteSkipped, result);
    return result;
  }

  const options = {
    silent: true,
    notifyServer: true,
    remote: true,
    remoteOnly: true,
    source: "sidebar",
    reason: "sidebar-logout",
    local: false,
    clearLocal: false,
    navigate: false,
    redirect: false,
    replaceState: false,
    emit: false,
    emitEvents: false,
    toast: false,
  };

  let lastError = null;

  for (const [method, fn, ctx] of candidates) {
    try {
      await withTimeout(Promise.resolve(fn.call(ctx || resolvedAuth, options)), REMOTE_LOGOUT_TIMEOUT_MS, method);

      const result = { attempted: true, ok: true, method, error: null };
      safeEmit(AppCore, EVENTS.logoutRemoteSuccess, result);
      return result;
    } catch (error) {
      lastError = error;
      safeWarn(AppCore, `Logout remoto falló en ${method}.`, error);
    }
  }

  const result = { attempted: true, ok: false, method: "", error: cloneError(lastError) };
  safeEmit(AppCore, EVENTS.logoutRemoteError, result);
  return result;
}

async function runLogoutFlow({ AppCore, Auth, Router, closeDropdown, renderUser, applyRoleVisibility, closeSidebarOnMobileAfterNavigation: closeMobileFn, syncSidebarState, setLogoutInFlight } = {}) {
  const generation = ++logoutGeneration;
  const startedAt = nowTs();
  const resolvedAuth = resolveAuth(Auth, AppCore);
  const resolvedRouter = resolveRouter(Router, AppCore);

  try {
    setLogoutInFlight?.(true);
  } catch {}

  setLoading(AppCore, true);

  safeEmit(AppCore, EVENTS.logoutStart, { generation, version: SIDEBAR_ACTIONS_VERSION });

  let remote = { attempted: false, ok: false, method: "", error: null };
  let local = null;
  let navigationOk = false;

  try {
    remote = await runRemoteLogout({ Auth: resolvedAuth, AppCore });
    local = await clearSessionEverywhere({ Auth: resolvedAuth, AppCore });
    syncSidebarAfterLogout({ AppCore, closeDropdown, renderUser, applyRoleVisibility, closeSidebarOnMobileAfterNavigation: closeMobileFn, syncSidebarState });
    hideGlobalLoader(AppCore, "sidebar:logout:local-cleared");
    await sleep(0);
    navigationOk = await navigateToLogin({ AppCore, Router: resolvedRouter });

    const result = { ok: true, generation, remote, local, navigationOk, durationMs: nowTs() - startedAt };
    safeEmit(AppCore, EVENTS.logoutComplete, result);
    return result;
  } catch (error) {
    safeError(AppCore, "Logout fatal inesperado.", error);

    try {
      local = await clearSessionEverywhere({ Auth: resolvedAuth, AppCore });
    } catch {}

    try {
      syncSidebarAfterLogout({ AppCore, closeDropdown, renderUser, applyRoleVisibility, closeSidebarOnMobileAfterNavigation: closeMobileFn, syncSidebarState });
    } catch {}

    try {
      hideGlobalLoader(AppCore, "sidebar:logout:error");
    } catch {}

    try {
      navigationOk = await navigateToLogin({ AppCore, Router: resolvedRouter });
    } catch {}

    const result = {
      ok: false,
      generation,
      error: cloneError(error),
      message: safeText(error?.message, "No se pudo cerrar sesión correctamente."),
      remote,
      local,
      navigationOk,
      durationMs: nowTs() - startedAt,
    };

    safeEmit(AppCore, EVENTS.logoutError, result);
    return result;
  } finally {
    try {
      setLogoutInFlight?.(false);
    } catch {}

    hideGlobalLoader(AppCore, "sidebar:logout:finally");
    safeEmit(AppCore, EVENTS.logoutFinally, { generation, durationMs: nowTs() - startedAt });
  }
}

export async function handleLogout({ AppCore, Auth, Router, closeDropdown, renderUser, applyRoleVisibility, closeSidebarOnMobileAfterNavigation, syncSidebarState, setLogoutInFlight, isLogoutInFlight } = {}) {
  if (logoutPromise) return logoutPromise;

  if (isFn(isLogoutInFlight) && isLogoutInFlight()) {
    const result = { ok: false, skipped: true, reason: "logout-in-flight" };
    safeEmit(AppCore, EVENTS.actionComplete, { action: "handleLogout", ...result });
    return result;
  }

  logoutPromise = runLogoutFlow({
    AppCore,
    Auth,
    Router,
    closeDropdown,
    renderUser,
    applyRoleVisibility,
    closeSidebarOnMobileAfterNavigation,
    syncSidebarState,
    setLogoutInFlight,
  });

  try {
    return await logoutPromise;
  } finally {
    logoutPromise = null;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarActionsSnapshot() {
  return {
    version: SIDEBAR_ACTIONS_VERSION,
    logoutInFlight: Boolean(logoutPromise),
    logoutGeneration,
    remoteTimeoutMs: REMOTE_LOGOUT_TIMEOUT_MS,
    loginRoute: LOGIN_ROUTE,
    mobile: (() => {
      try {
        return isMobileViewport();
      } catch {
        return false;
      }
    })(),
    events: EVENTS,
    exports: [
      "setSidebarOpen",
      "openSidebar",
      "closeSidebar",
      "toggleSidebar",
      "collapseSidebar",
      "expandSidebar",
      "ensureSidebarOpenForUserMenu",
      "closeSidebarOnMobileAfterNavigation",
      "navigateFromSidebar",
      "handleLogout",
      "getSidebarActionsSnapshot",
    ],
  };
}

export default {
  SIDEBAR_ACTIONS_VERSION,

  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,
  collapseSidebar,
  expandSidebar,

  ensureSidebarOpenForUserMenu,
  closeSidebarOnMobileAfterNavigation,

  navigateFromSidebar,

  handleLogout,
  getSidebarActionsSnapshot,
};

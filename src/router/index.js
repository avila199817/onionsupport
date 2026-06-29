/* =========================================================
   Onion Support - Router
   Archivo: /src/router/index.js

   Responsabilidad:
   - Router SPA mínimo.
   - Resolver rutas públicas/privadas/admin.
   - Resolver /@{slug} y /@{slug}/{ruta}.
   - Validar slug real del usuario autenticado.
   - Respetar la URL actual tras restore de sesión.
   - Renderizar vista con swap atómico, sin pantalla vacía.
   - Dar feedback inmediato de navegación sin vaciar la vista anterior.
   - Evitar rerenders innecesarios de la misma ruta.
   - Actualizar history.
   - Actualizar estado de ruta.
   - Actualizar shell/chrome básico.
   - Sin Auth propio.
   - Sin HTTP/fetch.
   - Sin Store.
   - Sin Toast.
   - Sin storage.
   - Sin 2FA/MFA/OTP.
   - Sin rutas inventadas.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  ROUTES,
  USER_HOME_PREFIX,
  SENSITIVE_QUERY_PARAMS,
  buildUserHomeRoute,
  buildUserScopedRoute,
  getUserScopedRouteInfo,
  isBlockedRoutePath,
  normalizeRoutePath,
  normalizeUserSlug,
  routePathFromUrlLike,
} from "../core/config.js";

import * as Routes from "./routes.js";

export const ROUTER_VERSION = "router.minimal.v7";

const PUBLIC_HOME_PATH = "/";
const PRIVATE_HOME_PATH =
  Routes.ROUTE_PATHS?.HOME ||
  ROUTES.privateHome ||
  ROUTES.dashboard ||
  "/dashboard";

const HOME_PATH = PUBLIC_HOME_PATH;
const LOGIN_PATH = ROUTES.login || "/login";
const APP_TITLE = "Onion Support";

const ROUTE_HOST_CLASS = "route-view-host";
const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const SENSITIVE_QUERY_KEYS = new Set(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) ? SENSITIVE_QUERY_PARAMS : [])
    .map((key) => normalizeKey(key))
    .filter(Boolean)
);

let initialized = false;
let bound = false;

let activeView = null;
let activeHost = null;

let renderSeq = 0;
let renderTask = null;

let pendingSeq = 0;
let pendingPath = "";

const disposers = [];

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .replace(/[-_\s]/g, "")
    .toLowerCase();
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function getRoutes() {
  return isFunction(Routes.getImmutableRoutes)
    ? Routes.getImmutableRoutes()
    : [];
}

function readState() {
  try {
    if (isFunction(AppCore?.getState)) {
      return AppCore.getState();
    }
  } catch {
    // fallback abajo
  }

  return isObject(AppCore?.state) ? AppCore.state : {};
}

function writeState(patch = {}) {
  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(patch, {
        source: "router",
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    Object.assign(AppCore.state || {}, patch);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATHS
========================================================= */

function routePathFromInput(value = HOME_PATH) {
  try {
    return routePathFromUrlLike(value) || HOME_PATH;
  } catch {
    const raw = cleanText(value, HOME_PATH);

    if (!raw) return HOME_PATH;

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/") || HOME_PATH;
    }

    if (raw.startsWith("#/")) {
      return raw.slice(1) || HOME_PATH;
    }

    if (raw.startsWith("//")) return HOME_PATH;

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
      return HOME_PATH;
    }

    if (/[\r\n\t\\]/.test(raw)) return HOME_PATH;

    if (/^https?:\/\//i.test(raw) && isBrowser()) {
      try {
        const url = new URL(raw);

        if (url.origin !== window.location.origin) return HOME_PATH;

        return `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
      } catch {
        return HOME_PATH;
      }
    }

    return raw;
  }
}

function normalizePathname(pathname = HOME_PATH) {
  try {
    return normalizeRoutePath(pathname) || HOME_PATH;
  } catch {
    let value = cleanText(pathname, HOME_PATH)
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME_PATH;
    }

    return value || HOME_PATH;
  }
}

function normalizeSearch(search = "") {
  const value = cleanText(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = cleanText(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = HOME_PATH) {
  let raw = routePathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME_PATH;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME_PATH;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinPath(parts = {}) {
  return `${normalizePathname(parts.pathname || HOME_PATH)}${normalizeSearch(
    parts.search || ""
  )}${normalizeHash(parts.hash || "")}`;
}

function normalizePublicPath(path = HOME_PATH) {
  return joinPath(splitPath(path));
}

function browserPath() {
  if (!isBrowser()) return HOME_PATH;

  const hash = window.location.hash || "";

  if (hash.startsWith("#/") || hash.startsWith("#!")) {
    return normalizePublicPath(hash);
  }

  return normalizePublicPath(
    `${window.location.pathname || HOME_PATH}${window.location.search || ""}${hash}`
  );
}

function currentPublicPath() {
  return normalizePublicPath(readState().publicPath || browserPath());
}

function currentCanonicalPath() {
  return normalizePathname(
    readState().canonicalPath || readState().route || HOME_PATH
  );
}

function publicPathname(path = HOME_PATH) {
  return splitPath(path).pathname;
}

function withSearchHashFrom(sourcePath = HOME_PATH, targetPathname = HOME_PATH) {
  const parts = splitPath(sourcePath);

  return joinPath({
    pathname: targetPathname,
    search: parts.search,
    hash: parts.hash,
  });
}

function canonicalPathFromPublicPath(path = HOME_PATH) {
  const pathname = publicPathname(path);
  const scoped = getScopedInfo(pathname);

  if (scoped.scoped) {
    return normalizePathname(
      scoped.home
        ? PRIVATE_HOME_PATH
        : scoped.canonicalPath || scoped.restPath || HOME_PATH
    );
  }

  return normalizePathname(pathname);
}

function queryHasSensitiveKey(search = "") {
  const value = normalizeSearch(search);

  if (!value) return false;

  try {
    const params = new URLSearchParams(value);

    for (const key of params.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
        return true;
      }
    }
  } catch {
    return /[?&](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
      value
    );
  }

  return false;
}

function hashHasSensitiveValue(hash = "") {
  const value = normalizeHash(hash);

  if (!value) return false;

  return /[#&?](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    value
  );
}

function hasSensitiveQuery(path = "") {
  const parts = splitPath(path);
  return queryHasSensitiveKey(parts.search) || hashHasSensitiveValue(parts.hash);
}

function stripSensitiveQuery(path = HOME_PATH) {
  const parts = splitPath(path);
  const params = new URLSearchParams(parts.search || "");

  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) {
      params.delete(key);
    }
  }

  return joinPath({
    pathname: parts.pathname,
    search: params.toString() ? `?${params.toString()}` : "",
    hash: hashHasSensitiveValue(parts.hash) ? "" : parts.hash,
  });
}

function isUnsafeHref(href = "") {
  const value = cleanText(href, "");

  return Boolean(
    !value ||
      value.startsWith("//") ||
      (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) ||
      /[\r\n\t\\]/.test(value)
  );
}

function isExternalHref(href = "") {
  if (!isBrowser()) return false;

  const value = cleanText(href, "");

  if (!/^https?:\/\//i.test(value)) return false;

  try {
    return new URL(value, window.location.origin).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function isHashOnlyHref(href = "") {
  const value = cleanText(href, "");
  return value.startsWith("#") && !value.startsWith("#/") && !value.startsWith("#!");
}

function isBlockedPath(path = HOME_PATH) {
  const parts = splitPath(path);

  try {
    if (isBlockedRoutePath(parts.pathname)) return true;
  } catch {
    // noop
  }

  const scoped = getScopedInfo(parts.pathname);

  try {
    return Boolean(
      scoped.scoped &&
        isBlockedRoutePath(scoped.restPath || scoped.canonicalPath || HOME_PATH)
    );
  } catch {
    return false;
  }
}

/* =========================================================
   AUTH
========================================================= */

function getAuth() {
  return AppCore.auth || AppCore.Auth || Auth;
}

function authCall(method = "", fallback = null, ...args) {
  const auth = getAuth();
  const fn = auth?.[method];

  if (!isFunction(fn)) return fallback;

  try {
    return fn.call(auth, ...args);
  } catch {
    return fallback;
  }
}

function getAuthSession() {
  const auth = getAuth();
  return isObject(auth?.session) ? auth.session : {};
}

function getInFlightAuthPromise() {
  const session = getAuthSession();
  const candidate =
    session.restorePromise ||
    session.mePromise ||
    session.refreshPromise ||
    null;

  return candidate && isFunction(candidate.then) ? candidate : null;
}

function isAuthResolving() {
  const session = getAuthSession();

  return Boolean(
    session.restoring ||
      session.checking ||
      session.refreshing ||
      session.restorePromise ||
      session.mePromise ||
      session.refreshPromise
  );
}

async function waitForAuthIfNeeded(route = null) {
  if (authCall("isAuthenticated", false) === true) return false;
  if (!route || route.public === true) return false;
  if (!isAuthResolving()) return false;

  const promise = getInFlightAuthPromise();

  if (!promise) return false;

  try {
    await promise;
  } catch {
    // El guard decide después.
  }

  return true;
}

function isAuthenticated() {
  return authCall("isAuthenticated", false) === true;
}

function getCurrentUser() {
  return (
    authCall("getUser", null) ||
    authCall("getCurrentUser", null) ||
    AppCore.getCurrentUser?.() ||
    null
  );
}

function getCurrentRole() {
  return (
    authCall("getRole", "") ||
    authCall("getCurrentRole", "") ||
    AppCore.getCurrentRole?.() ||
    ""
  );
}

function isAdmin() {
  return authCall("isAdmin", false) === true || getCurrentRole() === "admin";
}

function getCurrentUserSlug() {
  const fromAuth = authCall("getUserSlug", "");

  if (fromAuth) return normalizeUserSlug(fromAuth);

  const user = getCurrentUser();

  return normalizeUserSlug(
    user?.slug ||
      user?.lookup?.slug ||
      user?.profile?.slug ||
      user?.username ||
      user?.userId ||
      user?.id ||
      ""
  );
}

/* =========================================================
   USER SCOPE
========================================================= */

function getScopedInfo(path = HOME_PATH) {
  try {
    return getUserScopedRouteInfo(path);
  } catch {
    const clean = normalizePathname(path);

    if (!clean.startsWith(USER_HOME_PREFIX)) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath: clean,
        canonicalPath: clean,
        lookupPath: clean,
      };
    }

    const rest = clean.slice(USER_HOME_PREFIX.length);
    const [slugSegment = "", ...segments] = rest.split("/");
    const slug = normalizeUserSlug(slugSegment);
    const restPath = segments.length
      ? normalizePathname(`/${segments.join("/")}`)
      : HOME_PATH;

    return {
      scoped: Boolean(slug),
      home: restPath === HOME_PATH,
      slug,
      restPath,
      canonicalPath: restPath,
      lookupPath: restPath,
    };
  }
}

function getUserSlugFromPath(path = HOME_PATH) {
  return getScopedInfo(path).slug || "";
}

function isUserHomePath(path = HOME_PATH) {
  return getScopedInfo(path).home === true;
}

function isUserScopedPath(path = HOME_PATH) {
  return getScopedInfo(path).scoped === true;
}

function buildUserHomePath(slug = getCurrentUserSlug()) {
  const clean = normalizeUserSlug(slug);

  if (!clean) return HOME_PATH;

  try {
    return buildUserHomeRoute(clean) || `${USER_HOME_PREFIX}${clean}`;
  } catch {
    return `${USER_HOME_PREFIX}${clean}`;
  }
}

function buildUserScopedPath(
  canonicalPath = HOME_PATH,
  slug = getCurrentUserSlug()
) {
  const clean = normalizeUserSlug(slug);
  const canonical = normalizePathname(canonicalPath);

  if (!clean) return canonical;

  if (canonical === PRIVATE_HOME_PATH) {
    return buildUserHomePath(clean);
  }

  try {
    return buildUserScopedRoute(clean, canonical);
  } catch {
    return canonical === HOME_PATH
      ? `${USER_HOME_PREFIX}${clean}`
      : `${USER_HOME_PREFIX}${clean}${canonical}`;
  }
}

function getDefaultHome() {
  return buildUserHomePath();
}

/* =========================================================
   ROUTE MATCHING
========================================================= */

function getRouteByCanonicalPath(path = HOME_PATH) {
  const canonical = normalizePathname(path);

  return (
    getRoutes().find((route) => normalizePathname(route.path) === canonical) ||
    null
  );
}

function routeIsPrivate(route = null) {
  return Boolean(route && route.public !== true);
}

function routeRequiresAdmin(route = null) {
  return Boolean(route?.adminOnly || route?.requiresAdmin);
}

function routeAllowsSensitiveQuery(route = null) {
  return Boolean(
    route?.tokenRoute === true ||
      route?.requiresToken === true ||
      route?.publicTokenRoute === true
  );
}

function getRouteMatch(path = HOME_PATH) {
  const publicPath = normalizePublicPath(path);
  const pathname = publicPathname(publicPath);
  const scoped = getScopedInfo(pathname);

  const lookupPath = scoped.scoped
    ? normalizePathname(
        scoped.home
          ? PRIVATE_HOME_PATH
          : scoped.canonicalPath || scoped.restPath || HOME_PATH
      )
    : normalizePathname(pathname);

  let route = isBlockedPath(publicPath)
    ? null
    : getRouteByCanonicalPath(lookupPath);

  if (scoped.scoped && route?.public === true) {
    route = null;
  }

  return {
    route,
    publicPath,
    pathname,
    canonicalPath: route ? normalizePathname(route.path) : lookupPath,
    lookupPath,
    routeParams: scoped.slug ? { slug: scoped.slug } : {},
    scoped,
    blocked: isBlockedPath(publicPath),
  };
}

function getRoute(path = HOME_PATH) {
  return getRouteMatch(path).route;
}

function routeExists(path = HOME_PATH) {
  return Boolean(getRoute(path));
}

function getCurrentRoute() {
  return getRoute(currentPublicPath());
}

/* =========================================================
   REDIRECTS / GUARDS
========================================================= */

function isPublicAuthRoute(path = HOME_PATH) {
  const route = getRoute(path);
  return route?.public === true;
}

function routeIsTokenRoute(path = HOME_PATH) {
  return routeAllowsSensitiveQuery(getRoute(path));
}

function isValidPostLoginTarget(path = "") {
  const target = normalizePublicPath(path);

  if (!target) return false;
  if (hasSensitiveQuery(target)) return false;
  if (isBlockedPath(target)) return false;
  if (isPublicAuthRoute(target)) return false;

  return routeExists(target);
}

function loginRedirectTarget(publicPath = HOME_PATH) {
  const target = normalizePublicPath(publicPath || HOME_PATH);

  if (!isValidPostLoginTarget(target)) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
}

function redirectParamFromCurrentLocation() {
  if (!isBrowser()) return "";

  try {
    return new URLSearchParams(window.location.search || "").get("redirect") || "";
  } catch {
    return "";
  }
}

function normalizePostLoginTarget(fallback = getDefaultHome()) {
  const target = redirectParamFromCurrentLocation();

  if (isValidPostLoginTarget(target)) {
    return normalizeNavigationTarget(target);
  }

  return normalizeNavigationTarget(fallback || getDefaultHome());
}

function normalizeNavigationTarget(path = HOME_PATH, options = {}) {
  const publicPath = normalizePublicPath(path);
  const match = getRouteMatch(publicPath);

  if (
    options.useSlug !== false &&
    isAuthenticated() &&
    routeIsPrivate(match.route)
  ) {
    return withSearchHashFrom(
      publicPath,
      buildUserScopedPath(match.canonicalPath, getCurrentUserSlug())
    );
  }

  if (
    options.useSlug !== false &&
    isAuthenticated() &&
    match.canonicalPath === PRIVATE_HOME_PATH &&
    match.route?.public !== true
  ) {
    return withSearchHashFrom(publicPath, buildUserHomePath());
  }

  return publicPath;
}

function privateSlugRedirect(match = {}) {
  const route = match.route;

  if (!routeIsPrivate(route)) return "";
  if (!isAuthenticated()) return "";

  const realSlug = getCurrentUserSlug();

  if (!realSlug) return "";

  const requestedSlug = normalizeUserSlug(match.routeParams?.slug || "");
  const expectedPathname = buildUserScopedPath(match.canonicalPath, realSlug);
  const currentPathname = publicPathname(match.publicPath);

  if (!requestedSlug && currentPathname === match.canonicalPath) {
    return withSearchHashFrom(match.publicPath, expectedPathname);
  }

  if (requestedSlug && requestedSlug !== realSlug) {
    return withSearchHashFrom(match.publicPath, expectedPathname);
  }

  if (currentPathname !== expectedPathname) {
    return withSearchHashFrom(match.publicPath, expectedPathname);
  }

  return "";
}

function checkAccess(match = {}) {
  const route = match.route;

  if (!route) {
    return {
      allowed: false,
      reason: "not-found",
    };
  }

  if (route.public === true) {
    if (route.guestOnly === true && isAuthenticated()) {
      return {
        allowed: false,
        reason: "guest-only",
        redirectTo: normalizePostLoginTarget(getDefaultHome()),
      };
    }

    return {
      allowed: true,
      reason: "public",
    };
  }

  if (!isAuthenticated()) {
    return {
      allowed: false,
      reason: "not-authenticated",
      redirectTo: loginRedirectTarget(match.publicPath),
    };
  }

  if (routeRequiresAdmin(route) && !isAdmin()) {
    return {
      allowed: false,
      reason: "admin-required",
    };
  }

  return {
    allowed: true,
    reason: routeRequiresAdmin(route) ? "admin" : "authenticated",
  };
}

/* =========================================================
   HISTORY
========================================================= */

function ensureInitialHistoryState() {
  if (!isBrowser()) return false;

  try {
    if (!window.history.state) {
      window.history.replaceState(
        {
          router: true,
          path: browserPath(),
        },
        "",
        browserPath()
      );
    }

    return true;
  } catch {
    return false;
  }
}

function writeHistory(publicPath = HOME_PATH, options = {}) {
  if (!isBrowser()) return false;
  if (options.skipHistory === true) return false;

  const target = normalizePublicPath(publicPath);
  const current = browserPath();

  try {
    const method =
      options.replaceState === true || current === target
        ? "replaceState"
        : "pushState";

    window.history[method](
      {
        router: true,
        path: target,
      },
      "",
      target
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SHELL / CHROME
========================================================= */

function node(id = "") {
  if (!isBrowser()) return null;
  return document.getElementById(id);
}

function setHidden(element = null, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
    element.setAttribute("aria-hidden", value ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function forceVisible(element = null, mode = "app", chrome = "visible") {
  if (!element) return false;

  try {
    element.hidden = false;
    element.removeAttribute("hidden");
    element.removeAttribute("inert");

    element.setAttribute("aria-hidden", "false");

    element.dataset.routeMode = mode;
    element.dataset.shell = "visible";
    element.dataset.shellState = "ready";
    element.dataset.appReady = "true";
    element.dataset.appLoading = "false";
    element.dataset.chrome = chrome;

    element.classList.remove(
      "is-hidden",
      "app-hidden",
      "shell-hidden",
      "route-hidden",
      "chrome-hidden"
    );

    element.classList.add("is-visible");

    element.style.removeProperty("display");
    element.style.removeProperty("visibility");
    element.style.removeProperty("opacity");
    element.style.removeProperty("pointer-events");

    return true;
  } catch {
    return false;
  }
}

function clearTableHead() {
  const tableHead = node("table-head");
  const tableHeadContainer = node("tablehead-container");

  setHidden(tableHead, true);

  try {
    tableHeadContainer?.replaceChildren();
  } catch {
    // noop
  }

  return true;
}

function setShell(route = null) {
  const publicRoute = route?.public === true;
  const mode = publicRoute ? "auth" : "app";
  const chrome = publicRoute ? "hidden" : "visible";

  const html = isBrowser() ? document.documentElement : null;
  const body = isBrowser() ? document.body : null;

  for (const root of [html, body].filter(Boolean)) {
    root.dataset.routeMode = mode;
    root.dataset.shell = "visible";
    root.dataset.shellState = "ready";
    root.dataset.appReady = "true";
    root.dataset.appLoading = "false";
    root.dataset.chrome = chrome;

    root.classList.toggle("route-auth", publicRoute);
    root.classList.toggle("route-app", !publicRoute);
    root.classList.toggle("chrome-hidden", publicRoute);
    root.classList.toggle("chrome-visible", !publicRoute);
  }

  for (const element of [
    node("app-shell"),
    node("main-content"),
    node("app-content"),
    node("view-container"),
  ].filter(Boolean)) {
    forceVisible(element, mode, chrome);
  }

  const sidebar = node("sidebar-mount");
  const topbar = node("topbar-mount");

  setHidden(sidebar, publicRoute);
  setHidden(topbar, publicRoute);

  for (const element of [sidebar, topbar].filter(Boolean)) {
    element.dataset.routeMode = mode;
    element.dataset.chrome = chrome;
    element.classList.toggle("is-hidden", publicRoute);
    element.classList.toggle("is-visible", !publicRoute);
  }

  clearTableHead();

  return true;
}

function setDocumentTitle(route = null) {
  if (!isBrowser()) return false;

  const title = cleanText(route?.title || route?.name || "", "");

  document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;

  return true;
}

function setActiveMenu(route = null, context = {}) {
  if (!isBrowser()) return false;

  const key = cleanText(route?.sidebarKey || route?.viewKey || route?.name || "", "");
  const canonicalPath = normalizePathname(
    context.canonicalPath ||
      route?.path ||
      HOME_PATH
  );

  const publicPath = normalizePublicPath(context.publicPath || "");
  const pending = context.pending === true;

  for (const item of document.querySelectorAll(
    "#sidebar-mount [data-sidebar-key], #sidebar-mount [data-route]"
  )) {
    const itemKey = cleanText(item.getAttribute("data-sidebar-key"), "");
    const itemRoute = cleanText(item.getAttribute("data-route"), "");
    const itemCanonical = itemRoute ? canonicalPathFromPublicPath(itemRoute) : "";

    const active = Boolean(
      (key && itemKey === key) ||
        (canonicalPath && itemCanonical === canonicalPath) ||
        (publicPath && itemRoute === publicPath)
    );

    item.classList.toggle("is-active", active);
    item.classList.toggle("is-pending", active && pending);

    if (active) {
      item.setAttribute("aria-current", "page");
      item.setAttribute("data-route-pending", pending ? "true" : "false");
    } else {
      item.removeAttribute("aria-current");
      item.removeAttribute("data-route-pending");
    }
  }

  return true;
}

function syncChrome(route = null, context = {}) {
  const modules = new Set(
    [
      AppCore.sidebar,
      AppCore.Sidebar,
      AppCore.getModule?.("sidebar"),
      AppCore.topbar,
      AppCore.Topbar,
      AppCore.getModule?.("topbar"),
    ].filter(Boolean)
  );

  for (const module of modules) {
    try {
      if (isFunction(module.sync)) {
        module.sync(context);
      } else if (isFunction(module.refresh)) {
        module.refresh(context);
      }
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   ROUTE PENDING STATE
========================================================= */

function setElementBusy(element = null, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
    element.classList.toggle("is-route-pending", busy);
    element.dataset.routePending = busy ? "true" : "false";

    return true;
  } catch {
    return false;
  }
}

function setRoutePending(match = {}, options = {}, seq = renderSeq) {
  if (!isBrowser()) return false;

  const route = match.route || null;
  const publicPath = normalizePublicPath(match.publicPath || HOME_PATH);
  const canonicalPath = normalizePathname(match.canonicalPath || route?.path || HOME_PATH);
  const viewKey = cleanText(route?.viewKey || route?.name || "", "");

  pendingSeq = seq;
  pendingPath = publicPath;

  const html = document.documentElement;
  const body = document.body;

  for (const root of [html, body].filter(Boolean)) {
    root.classList.add("route-pending");
    root.classList.add("is-route-pending");

    root.dataset.routePending = "true";
    root.dataset.routePendingPath = publicPath;
    root.dataset.routePendingCanonicalPath = canonicalPath;
    root.dataset.routePendingView = viewKey;
    root.dataset.routePendingSource = cleanText(options.source, "router");
  }

  for (const element of [
    node("app-shell"),
    node("main-content"),
    node("app-content"),
    node("view-container"),
  ].filter(Boolean)) {
    setElementBusy(element, true);
  }

  setActiveMenu(route, {
    publicPath,
    canonicalPath,
    pending: true,
  });

  writeState({
    routePending: true,
    pendingPublicPath: publicPath,
    pendingCanonicalPath: canonicalPath,
    pendingViewKey: viewKey,
  });

  return true;
}

function clearRoutePending(seq = renderSeq) {
  if (!isBrowser()) return false;
  if (seq && pendingSeq && seq !== pendingSeq) return false;

  pendingSeq = 0;
  pendingPath = "";

  const html = document.documentElement;
  const body = document.body;

  for (const root of [html, body].filter(Boolean)) {
    root.classList.remove("route-pending");
    root.classList.remove("is-route-pending");

    delete root.dataset.routePending;
    delete root.dataset.routePendingPath;
    delete root.dataset.routePendingCanonicalPath;
    delete root.dataset.routePendingView;
    delete root.dataset.routePendingSource;
  }

  for (const element of [
    node("app-shell"),
    node("main-content"),
    node("app-content"),
    node("view-container"),
  ].filter(Boolean)) {
    setElementBusy(element, false);
  }

  writeState({
    routePending: false,
    pendingPublicPath: "",
    pendingCanonicalPath: "",
    pendingViewKey: "",
  });

  return true;
}

/* =========================================================
   RENDER
========================================================= */

function viewRoot() {
  if (!isBrowser()) return null;

  return (
    node("view-container") ||
    node("app-content") ||
    node("main-content") ||
    document.body ||
    null
  );
}

function cleanupView(view = null) {
  if (!view || !isObject(view)) return false;

  for (const method of ["destroy", "unmount", "cleanup", "dispose"]) {
    try {
      if (isFunction(view[method])) {
        view[method]();
        return true;
      }
    } catch {
      // noop
    }
  }

  return false;
}

function removeNode(element = null) {
  try {
    element?.remove?.();
    return true;
  } catch {
    return false;
  }
}

function destroyActiveView() {
  const previousView = activeView;
  const previousHost = activeHost;

  activeView = null;
  activeHost = null;

  cleanupView(previousView);
  removeNode(previousHost);

  return true;
}

function createRouteHost(match = {}, state = {}) {
  const route = match.route || null;
  const host = document.createElement("div");

  host.className = ROUTE_HOST_CLASS;

  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("aria-busy", "true");

  host.dataset.routeHost = "true";
  host.dataset.routeHostState = "preparing";
  host.dataset.routePath = state.canonicalPath || match.canonicalPath || HOME_PATH;
  host.dataset.publicPath = state.publicPath || match.publicPath || HOME_PATH;
  host.dataset.viewKey = route?.viewKey || route?.name || "";

  return host;
}

function activateRouteHost(host = null, route = null) {
  if (!host) return false;

  const publicRoute = route?.public === true;
  const mode = publicRoute ? "auth" : "app";
  const chrome = publicRoute ? "hidden" : "visible";

  try {
    host.hidden = false;
    host.removeAttribute("hidden");
    host.removeAttribute("inert");

    host.setAttribute("aria-hidden", "false");
    host.setAttribute("aria-busy", "false");

    host.dataset.routeHostState = "ready";
    host.dataset.routeMode = mode;
    host.dataset.chrome = chrome;

    host.classList.remove("is-hidden", "is-preparing");
    host.classList.add("is-visible", "is-ready");

    return true;
  } catch {
    return false;
  }
}

function commitRouteHost(nextHost = null, {
  route = null,
  nextView = null,
  previousView = null,
  previousHost = null,
} = {}) {
  const root = viewRoot();

  if (!root || !nextHost) return false;

  activateRouteHost(nextHost, route);

  try {
    if (nextHost.parentNode !== root) {
      root.appendChild(nextHost);
    }

    root.replaceChildren(nextHost);
  } catch {
    return false;
  }

  activeHost = nextHost;
  activeView = nextView || null;

  cleanupView(previousView);

  if (previousHost && previousHost !== nextHost) {
    removeNode(previousHost);
  }

  return true;
}

function renderFallback(title = "Onion Support", message = "", host = null) {
  const target = host || activeHost || viewRoot();

  if (!target) return null;

  const section = document.createElement("section");
  section.className = "route-fallback-view";
  section.setAttribute("role", "status");

  const heading = document.createElement("h1");
  heading.textContent = title;
  section.appendChild(heading);

  if (message) {
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    section.appendChild(paragraph);
  }

  target.replaceChildren(section);

  return section;
}

function setRouteState(match = {}) {
  const patch = {
    route: match.canonicalPath || HOME_PATH,
    canonicalPath: match.canonicalPath || HOME_PATH,
    publicPath: match.publicPath || HOME_PATH,
    routeParams: match.routeParams || {},
    initialRouteRendered: true,
  };

  writeState(patch);

  return patch;
}

function beginTransition(match = {}, options = {}) {
  const route = match.route || null;
  const state = setRouteState(match);

  setShell(route);
  setDocumentTitle(route);

  setActiveMenu(route, {
    publicPath: state.publicPath,
    canonicalPath: state.canonicalPath,
    pending: false,
  });

  writeHistory(state.publicPath, options);

  return state;
}

async function renderRoute(match = {}, options = {}, seq = renderSeq) {
  const route = match.route;
  const state = beginTransition(match, options);
  const root = viewRoot();

  setRoutePending(match, options, seq);

  if (!root) {
    clearRoutePending(seq);

    return {
      ok: false,
      reason: "missing-root",
    };
  }

  forceVisible(
    root,
    route?.public === true ? "auth" : "app",
    route?.public === true ? "hidden" : "visible"
  );

  const previousView = activeView;
  const previousHost = activeHost;
  const nextHost = createRouteHost(match, state);

  try {
    root.appendChild(nextHost);
  } catch {
    clearRoutePending(seq);

    return {
      ok: false,
      reason: "mount-host-failed",
    };
  }

  try {
    if (!isFunction(route?.render)) {
      throw new Error("La ruta no tiene render().");
    }

    const result = await route.render(nextHost, {
      AppCore,
      Auth: getAuth(),
      Router,

      route,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,

      source: "router",

      isCurrentRender: () => seq === renderSeq,
    });

    if (seq !== renderSeq) {
      cleanupView(result);
      removeNode(nextHost);

      return {
        ok: false,
        skipped: true,
        reason: "stale-render",
      };
    }

    let nextView = null;

    if (
      typeof Node !== "undefined" &&
      result instanceof Node &&
      result !== nextHost &&
      !nextHost.contains(result)
    ) {
      nextHost.replaceChildren(result);
    } else if (typeof result === "string") {
      nextHost.textContent = "";
      nextHost.insertAdjacentHTML("beforeend", result);
    } else if (isObject(result)) {
      nextView = result;
    }

    const committed = commitRouteHost(nextHost, {
      route,
      nextView,
      previousView,
      previousHost,
    });

    if (!committed) {
      cleanupView(nextView);
      removeNode(nextHost);
      clearRoutePending(seq);

      return {
        ok: false,
        reason: "commit-failed",
        canonicalPath: state.canonicalPath,
        publicPath: state.publicPath,
      };
    }

    syncChrome(route, {
      AppCore,
      Auth: getAuth(),
      Router,

      route,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    });

    setActiveMenu(route, {
      publicPath: state.publicPath,
      canonicalPath: state.canonicalPath,
      pending: false,
    });

    clearRoutePending(seq);

    return {
      ok: true,
      found: true,
      route,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  } catch (error) {
    if (seq !== renderSeq) {
      removeNode(nextHost);

      return {
        ok: false,
        skipped: true,
        reason: "stale-error",
      };
    }

    renderFallback("Error de vista", "No se pudo renderizar esta vista.", nextHost);

    const committed = commitRouteHost(nextHost, {
      route,
      nextView: null,
      previousView,
      previousHost,
    });

    if (committed) {
      syncChrome(route, {
        AppCore,
        Auth: getAuth(),
        Router,

        route,
        canonicalPath: state.canonicalPath,
        publicPath: state.publicPath,
        routeParams: state.routeParams,
      });
    }

    clearRoutePending(seq);

    return {
      ok: false,
      error,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
    };
  }
}

function renderNotFound(match = {}, options = {}, seq = renderSeq) {
  const state = beginTransition(
    {
      ...match,
      route: null,
      canonicalPath: match.canonicalPath || HOME_PATH,
    },
    options
  );

  setRoutePending(match, options, seq);

  const root = viewRoot();

  if (!root) {
    clearRoutePending(seq);

    return {
      ok: false,
      found: false,
      reason: "missing-root",
      renderSeq: seq,
    };
  }

  const previousView = activeView;
  const previousHost = activeHost;
  const nextHost = createRouteHost(
    {
      ...match,
      route: null,
    },
    state
  );

  root.appendChild(nextHost);

  renderFallback("Ruta no encontrada", "La vista solicitada no existe.", nextHost);

  commitRouteHost(nextHost, {
    route: null,
    nextView: null,
    previousView,
    previousHost,
  });

  clearRoutePending(seq);

  return {
    ok: true,
    found: false,
    canonicalPath: state.canonicalPath,
    publicPath: state.publicPath,
    routeParams: state.routeParams,
    renderSeq: seq,
  };
}

function renderForbidden(
  match = {},
  reason = "forbidden",
  options = {},
  seq = renderSeq
) {
  const state = beginTransition(match, options);

  setRoutePending(match, options, seq);

  const root = viewRoot();

  if (!root) {
    clearRoutePending(seq);

    return {
      ok: false,
      forbidden: true,
      reason: "missing-root",
      renderSeq: seq,
    };
  }

  const previousView = activeView;
  const previousHost = activeHost;
  const nextHost = createRouteHost(match, state);

  root.appendChild(nextHost);

  renderFallback("Acceso no permitido", "No tienes permisos para ver esta vista.", nextHost);

  commitRouteHost(nextHost, {
    route: match.route || null,
    nextView: null,
    previousView,
    previousHost,
  });

  clearRoutePending(seq);

  return {
    ok: true,
    forbidden: true,
    reason,
    canonicalPath: state.canonicalPath,
    publicPath: state.publicPath,
    routeParams: state.routeParams,
    renderSeq: seq,
  };
}

async function redirectTo(path = HOME_PATH, options = {}, reason = "redirect") {
  const depth = Number(options.__redirectDepth || 0);

  if (depth >= 5) {
    return {
      ok: false,
      skipped: true,
      reason: "redirect-loop",
      redirectTo: path,
    };
  }

  return executeRender(path, {
    ...options,
    replaceState: true,
    skipHistory: false,
    source: reason,
    __redirectDepth: depth + 1,
  });
}

async function executeRender(path = HOME_PATH, options = {}) {
  const seq = ++renderSeq;
  let match = getRouteMatch(path);

  setRoutePending(match, options, seq);

  if (
    hasSensitiveQuery(match.publicPath) &&
    !routeAllowsSensitiveQuery(match.route)
  ) {
    const cleanPath = stripSensitiveQuery(match.publicPath);

    if (cleanPath !== match.publicPath) {
      return redirectTo(cleanPath, options, "scrub-sensitive-query");
    }
  }

  if (match.blocked) {
    return isAuthenticated()
      ? renderNotFound(match, options, seq)
      : redirectTo(LOGIN_PATH, options, "blocked-login");
  }

  await waitForAuthIfNeeded(match.route);

  if (seq !== renderSeq) {
    return {
      ok: false,
      skipped: true,
      reason: "stale",
    };
  }

  match = getRouteMatch(path);

  setRoutePending(match, options, seq);

  if (
    hasSensitiveQuery(match.publicPath) &&
    !routeAllowsSensitiveQuery(match.route)
  ) {
    const cleanPath = stripSensitiveQuery(match.publicPath);

    if (cleanPath !== match.publicPath) {
      return redirectTo(cleanPath, options, "scrub-sensitive-query");
    }
  }

  if (!match.route) {
    return isAuthenticated()
      ? renderNotFound(match, options, seq)
      : redirectTo(LOGIN_PATH, options, "not-found-login");
  }

  const access = checkAccess(match);

  if (!access.allowed) {
    if (access.redirectTo) {
      return redirectTo(access.redirectTo, options, access.reason || "guard-redirect");
    }

    return renderForbidden(match, access.reason || "forbidden", options, seq);
  }

  const slugRedirect =
    options.keepCanonicalHome === true ? "" : privateSlugRedirect(match);

  if (slugRedirect) {
    return redirectTo(slugRedirect, options, "user-scope");
  }

  return renderRoute(match, options, seq);
}

function render(path = HOME_PATH, options = {}) {
  const task = Promise.resolve(
    executeRender(path, isObject(options) ? options : {})
  );

  renderTask = task;

  task.catch(() => null).finally(() => {
    if (renderTask === task) {
      renderTask = null;
    }
  });

  return task;
}

function renderCurrent(options = {}) {
  return render(browserPath(), {
    ...options,
    replaceState: true,
    skipHistory: options.skipHistory ?? false,
    source: options.source || "render-current",
  });
}

/* =========================================================
   NAVIGATION
========================================================= */

function hrefAllowed(href = "") {
  if (isUnsafeHref(href)) return false;
  if (isExternalHref(href)) return false;
  if (isHashOnlyHref(href)) return false;
  if (isBlockedPath(href)) return false;

  if (hasSensitiveQuery(href) && !routeIsTokenRoute(href)) {
    return false;
  }

  return true;
}

function shouldSkipSameNavigation(target = HOME_PATH, options = {}) {
  if (options.force === true || options.reload === true || options.forceRefresh === true) {
    return false;
  }

  const normalizedTarget = normalizePublicPath(target);

  return normalizedTarget === currentPublicPath();
}

function navigate(path = HOME_PATH, options = {}) {
  const href = cleanText(path, HOME_PATH);

  if (!hrefAllowed(href)) {
    return Promise.resolve({
      ok: true,
      skipped: true,
      reason: "ignored-href",
    });
  }

  const target = normalizeNavigationTarget(href, options);
  const normalizedTarget = normalizePublicPath(target);

  if (renderTask && pendingPath && pendingPath === normalizedTarget) {
    return renderTask;
  }

  if (shouldSkipSameNavigation(normalizedTarget, options)) {
    const match = getRouteMatch(normalizedTarget);

    setActiveMenu(match.route, {
      publicPath: match.publicPath,
      canonicalPath: match.canonicalPath,
      pending: false,
    });

    return Promise.resolve({
      ok: true,
      skipped: true,
      reason: "same-route",
      publicPath: normalizedTarget,
      canonicalPath: canonicalPathFromPublicPath(normalizedTarget),
    });
  }

  const match = getRouteMatch(normalizedTarget);

  setRoutePending(match, options, renderSeq + 1);

  return render(normalizedTarget, options);
}

function replace(path = HOME_PATH, options = {}) {
  return navigate(path, {
    ...options,
    replaceState: true,
  });
}

function goAfterLogin(fallback = HOME_PATH, options = {}) {
  return replace(normalizePostLoginTarget(fallback), {
    ...options,
    source: "login",
  });
}

/* =========================================================
   EVENTS
========================================================= */

function linkHref(element = null) {
  return cleanText(
    element?.dataset?.route ||
      element?.dataset?.href ||
      element?.dataset?.to ||
      element?.getAttribute?.("data-route") ||
      element?.getAttribute?.("data-href") ||
      element?.getAttribute?.("data-to") ||
      element?.getAttribute?.("href"),
    ""
  );
}

function onClick(event) {
  if (
    event.defaultPrevented ||
    event[ROUTER_EVENT_HANDLED_KEY] === true ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target =
    event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

  /*
    No interceptar button[data-route] genérico.
    Las vistas pueden usar botones con data-route para acciones propias.
    El router sólo captura:
    - anchors SPA
    - anchors internos
    - elementos marcados explícitamente con data-router-link
  */
  const element = target?.closest?.(
    "a[data-spa], a[data-route], a[href^='/'], [data-router-link]"
  );

  if (!element || element.hasAttribute?.("download")) return;

  const href = linkHref(element);
  const targetAttr = cleanText(element.getAttribute?.("target"), "").toLowerCase();

  if (!href || targetAttr === "_blank") return;
  if (!hrefAllowed(href)) return;

  event.preventDefault();
  event[ROUTER_EVENT_HANDLED_KEY] = true;

  navigate(href, {
    source: "link-click",
  });
}

function onPopState() {
  render(browserPath(), {
    skipHistory: true,
    replaceState: true,
    source: "popstate",
  });
}

function onDom(target, eventName, handler, options = false) {
  if (!target || !isFunction(target.addEventListener)) return () => false;

  target.addEventListener(eventName, handler, options);

  return () => {
    try {
      target.removeEventListener(eventName, handler, options);
      return true;
    } catch {
      return false;
    }
  };
}

/* =========================================================
   LIFECYCLE
========================================================= */

function attachToCore() {
  try {
    AppCore.Router = Router;
    AppCore.router = Router;

    AppCore.registerModule?.("router", Router, {
      overwrite: true,
    });

    AppCore.modules?.register?.("router", Router, {
      overwrite: true,
    });
  } catch {
    // noop
  }

  return true;
}

function init() {
  if (initialized) return Router;

  initialized = true;

  ensureInitialHistoryState();
  attachToCore();

  return Router;
}

function bind() {
  if (bound) return Router;

  init();

  if (isBrowser()) {
    disposers.push(onDom(document, "click", onClick, true));
    disposers.push(onDom(window, "popstate", onPopState));
  }

  bound = true;
  attachToCore();

  return Router;
}

function unbind() {
  while (disposers.length) {
    try {
      disposers.pop()?.();
    } catch {
      // noop
    }
  }

  destroyActiveView();
  clearRoutePending();

  bound = false;
  renderTask = null;

  return Router;
}

function start(options = {}) {
  bind();

  return renderCurrent({
    ...options,
    source: options.source || "router.start",
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  return {
    version: ROUTER_VERSION,

    initialized,
    bound,
    renderSeq,

    hasActiveView: Boolean(activeView),
    hasActiveHost: Boolean(activeHost),

    rendering: Boolean(renderTask),
    pending: Boolean(pendingPath),
    pendingPath: redact(pendingPath),

    publicPath: redact(currentPublicPath()),
    canonicalPath: redact(currentCanonicalPath()),

    authenticated: isAuthenticated(),
    role: getCurrentRole() || null,
    isAdmin: isAdmin(),
    userSlug: getCurrentUserSlug() || null,
    defaultHome: redact(getDefaultHome()),

    routes: getRoutes().map((route) => ({
      path: route.path,
      name: route.name,
      title: route.title,
      public: route.public,
      guestOnly: route.guestOnly,
      tokenRoute: route.tokenRoute,
      adminOnly: route.adminOnly,
      viewKey: route.viewKey,
    })),
  };
}

function debug(path = "") {
  const target = cleanText(path, "");

  return target
    ? {
        target: redact(target),
        match: getRouteMatch(target),
        snapshot: getSnapshot(),
      }
    : getSnapshot();
}

/* =========================================================
   API
========================================================= */

export const Router = {
  version: ROUTER_VERSION,

  get routes() {
    return getRoutes();
  },

  init,
  bind,
  unbind,
  destroy: unbind,

  start,
  boot: start,
  renderInitialRoute: start,

  getRoute,
  routeExists,
  getRouteMatch,
  getCurrentRoute,

  getCurrentPath: currentPublicPath,
  getCurrentPublicPath: currentPublicPath,
  getCurrentCanonicalPath: currentCanonicalPath,

  navigate,
  replace,

  render,
  renderCurrent,

  goAfterLogin,

  buildPublicPath: normalizeNavigationTarget,
  resolveSpaHref: normalizeNavigationTarget,

  buildUserHomePath,
  buildUserScopedPath,
  getDefaultHome,

  extractSlugFromPath: getUserSlugFromPath,
  isUserHomePath,
  isUserScopedPath,

  isSameCanonicalPath: (a = HOME_PATH, b = HOME_PATH) =>
    normalizePathname(a) === normalizePathname(b),

  safePath: normalizePublicPath,
  safePublicPath: normalizePublicPath,
  safeCanonicalPath: normalizePathname,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,
  debug,
};

export default Router;

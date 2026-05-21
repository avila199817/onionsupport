/* =========================================================
   Onion Support - Router
   Archivo: /src/router/index.js

   Responsabilidad:
   - Orquestador mínimo de navegación SPA.
   - Resolver rutas públicas y privadas.
   - Resolver rutas privadas con prefijo /@{slug}.
   - Canonicalizar rutas privadas sin slug a /@{slug}/ruta.
   - Validar que /@{slug} coincide con el usuario real.
   - Esperar restore Auth si ya está en curso antes de decidir guard.
   - Consultar guard.
   - Renderizar vista.
   - Actualizar history.
   - Actualizar estado de ruta.
   - Sincronizar chrome registrado tras render.
   - Ruta privada sin sesión válida -> /login.
   - Login con sesión válida -> /@{user.slug}.
   - Rutas admin definidas en core/config.js requieren rol admin.
   - Home interna: /
   - Home visible: /@{user.slug}
   - Sin Auth estático.
   - Sin fetch.
   - Sin storage.
   - Sin Toast.
   - Sin alias /home.
   - Sin rutas inventadas.
   - Sin /403 ni /404 como rutas.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../core/index.js";
import {
  BLOCKED_FRONTEND_ROUTES as CONFIG_BLOCKED_FRONTEND_ROUTES,
  isAdminRoute as isConfigAdminRoute,
  isBlockedRoutePath as isConfigBlockedRoutePath,
} from "../core/config.js";

import * as Routes from "./routes.js";
import * as RouteGuards from "./guards.js";
import * as History from "./history.js";
import * as Render from "./render.js";
import * as Shell from "./shell.js";

export const ROUTER_VERSION = "router.index.v10";

const ROUTE_PATHS = Routes.ROUTE_PATHS || {
  HOME: "/",
  LOGIN: "/login",
};

const getImmutableRoutes = Routes.getImmutableRoutes || (() => []);

export const Router = (() => {
  "use strict";

  const SOURCE = "router";

  const HOME_PATH = "/";
  const LOGIN_PATH = ROUTE_PATHS.LOGIN || "/login";
  const USER_HOME_PREFIX = Routes.USER_HOME_PREFIX || "/@";

  const routes = getImmutableRoutes();

  const BLOCKED_LEGACY_PATHS = new Set(
    Array.isArray(CONFIG_BLOCKED_FRONTEND_ROUTES) &&
      CONFIG_BLOCKED_FRONTEND_ROUTES.length
      ? CONFIG_BLOCKED_FRONTEND_ROUTES
      : [
          "/home",
          "/403",
          "/404",
          "/2fa",
          "/mfa",
          "/otp",
        ]
  );

  let initialized = false;
  let bound = false;
  let activeView = null;
  let renderSeq = 0;
  let renderPromise = Promise.resolve();

  const disposers = [];

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function cleanText(value = "", fallback = "") {
    const output = String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return output || fallback;
  }

  function readState() {
    return isObject(AppCore?.state) ? AppCore.state : {};
  }

  function safeCall(fn, ...args) {
    try {
      return isFunction(fn) ? fn(...args) : null;
    } catch {
      return null;
    }
  }

  function redact(value = "") {
    return cleanText(value, "")
      .replace(
        /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  }

  /* =======================================================
     PATHS
  ======================================================= */

  function isHashRouterPath(value = "") {
    const raw = cleanText(value, "");
    return raw.startsWith("#/") || raw.startsWith("#!");
  }

  function normalizeHashPath(value = "") {
    const raw = cleanText(value, HOME_PATH);

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/") || HOME_PATH;
    }

    if (raw.startsWith("#/")) {
      return raw.slice(1) || HOME_PATH;
    }

    return raw || HOME_PATH;
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

  function normalizePathname(pathname = HOME_PATH) {
    let value = cleanText(pathname, HOME_PATH).replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME_PATH;
    }

    return value || HOME_PATH;
  }

  function pathFromInput(path = HOME_PATH) {
    const raw = cleanText(path, HOME_PATH);

    if (isHashRouterPath(raw)) {
      return normalizeHashPath(raw);
    }

    if (!raw || raw.startsWith("//")) {
      return HOME_PATH;
    }

    if (/^https?:\/\//i.test(raw)) {
      try {
        const base = isBrowser() ? window.location.origin : "http://localhost";
        const url = new URL(raw, base);

        if (url.origin !== base) {
          return HOME_PATH;
        }

        if (isHashRouterPath(url.hash)) {
          return normalizeHashPath(url.hash);
        }

        return `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`;
      } catch {
        return HOME_PATH;
      }
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return HOME_PATH;
    }

    return raw || HOME_PATH;
  }

  function splitPath(path = HOME_PATH) {
    let raw = pathFromInput(path);
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
    return [
      normalizePathname(parts.pathname || HOME_PATH),
      normalizeSearch(parts.search || ""),
      normalizeHash(parts.hash || ""),
    ].join("");
  }

  function normalizePublicPath(path = HOME_PATH) {
    return joinPath(splitPath(path));
  }

  function normalizeCanonicalPath(path = HOME_PATH) {
    return splitPath(path).pathname || HOME_PATH;
  }

  function canonicalAuthPath(path = HOME_PATH) {
    return normalizeCanonicalPath(path);
  }

  function withSearchHashFrom(sourcePath = HOME_PATH, targetPathname = HOME_PATH) {
    const parts = splitPath(sourcePath);

    return joinPath({
      pathname: targetPathname,
      search: parts.search,
      hash: parts.hash,
    });
  }

  function browserPath() {
    if (!isBrowser()) return HOME_PATH;

    try {
      const hash = window.location.hash || "";

      if (isHashRouterPath(hash)) {
        return normalizePublicPath(hash);
      }

      return normalizePublicPath(
        `${window.location.pathname || HOME_PATH}${window.location.search || ""}${hash}`
      );
    } catch {
      return HOME_PATH;
    }
  }

  function currentPublicPath() {
    return normalizePublicPath(readState().publicPath || browserPath());
  }

  function currentCanonicalPath() {
    return normalizeCanonicalPath(
      readState().canonicalPath ||
        readState().route ||
        currentPublicPath()
    );
  }

  function hasSensitiveQuery(value = "") {
    return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
      String(value || "")
    );
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
    return value.startsWith("#") && !isHashRouterPath(value);
  }

  function isBlockedLegacyPath(path = HOME_PATH) {
    const normalized = normalizeCanonicalPath(path).toLowerCase();

    try {
      if (isConfigBlockedRoutePath(normalized) === true) return true;
    } catch {
      // fallback local
    }

    if (BLOCKED_LEGACY_PATHS.has(normalized)) return true;

    return (
      normalized.startsWith("/2fa/") ||
      normalized.startsWith("/mfa/") ||
      normalized.startsWith("/otp/")
    );
  }

  function safeRedirectPath(path = HOME_PATH, fallback = HOME_PATH) {
    const value = cleanText(path, "");

    if (
      isUnsafeHref(value) ||
      isExternalHref(value) ||
      isHashOnlyHref(value) ||
      hasSensitiveQuery(value)
    ) {
      return normalizePublicPath(fallback);
    }

    return normalizePublicPath(value || fallback);
  }

  /* =======================================================
     AUTH BRIDGE
  ======================================================= */

  function getAuth() {
    try {
      return (
        AppCore?.auth ||
        AppCore?.Auth ||
        AppCore?.modules?.get?.("auth") ||
        AppCore?.modules?.get?.("Auth") ||
        null
      );
    } catch {
      return null;
    }
  }

  function authCall(method = "", fallback = null, ...args) {
    const Auth = getAuth();
    const fn = Auth?.[method];

    if (!isFunction(fn)) return fallback;

    try {
      return fn.call(Auth, ...args);
    } catch {
      return fallback;
    }
  }

  function getAuthSessionState() {
    const Auth = getAuth();

    return isObject(Auth?.session) ? Auth.session : {};
  }

  function getInFlightAuthPromise() {
    const session = getAuthSessionState();

    const candidate =
      session.restorePromise ||
      session.mePromise ||
      session.refreshPromise ||
      null;

    return candidate && isFunction(candidate.then) ? candidate : null;
  }

  function isAuthResolving() {
    const session = getAuthSessionState();
    const state = readState();

    return Boolean(
      session.restoring ||
        session.checking ||
        session.refreshing ||
        session.restorePromise ||
        session.mePromise ||
        session.refreshPromise ||
        state.authRestoring === true ||
        state.sessionRestoring === true ||
        state.restoringSession === true
    );
  }

  async function waitForAuthIfNeeded(data = {}, options = {}) {
    if (options.skipAuthWait === true) return false;
    if (isAuthenticated()) return false;

    const route = data.route || null;

    const shouldWait = Boolean(
      routeIsPrivate(route) ||
        route?.guestOnly === true ||
        route?.publicOnly === true ||
        isAuthResolving()
    );

    if (!shouldWait) return false;

    const promise = getInFlightAuthPromise();

    if (!promise) return false;

    try {
      await promise;
    } catch {
      // restore fallido se decide después por guards
    }

    return true;
  }

  function getCurrentUser() {
    return (
      authCall("getUser", null) ||
      authCall("getCurrentUser", null) ||
      safeCall(AppCore?.getCurrentUser?.bind?.(AppCore) || AppCore?.getCurrentUser) ||
      null
    );
  }

  function isAuthenticated() {
    const authResult = authCall("isAuthenticated", null);

    if (authResult !== null) {
      return authResult === true;
    }

    return safeCall(AppCore?.isAuthenticated?.bind?.(AppCore) || AppCore?.isAuthenticated) === true;
  }

  function normalizeRole(value = "") {
    if (Array.isArray(value)) {
      const roles = value.map(normalizeRole).filter(Boolean);

      if (roles.includes("admin")) return "admin";
      if (roles.includes("user")) return "user";

      return "";
    }

    const role = cleanText(value, "").toLowerCase();

    if (role === "admin") return "admin";
    if (role === "user") return "user";

    return "";
  }

  function getCurrentRole() {
    const fromAuth =
      authCall("getRole", "") ||
      authCall("getCurrentRole", "");

    const role = normalizeRole(fromAuth);

    if (role) return role;

    const user = getCurrentUser();
    const state = readState();

    return (
      normalizeRole(user?.role || user?.rol || user?.roles) ||
      normalizeRole(state.role || state.rol || state.roles) ||
      "user"
    );
  }

  /* =======================================================
     USER SLUG ROUTES
  ======================================================= */

  function normalizeUserSlug(value = "") {
    if (isFunction(Routes.normalizeUserHomeSlug)) {
      return Routes.normalizeUserHomeSlug(value);
    }

    const slug = cleanText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }

  function getCurrentUserSlug() {
    const fromAuth =
      authCall("getUserSlug", "") ||
      authCall("extractUserSlug", "", getCurrentUser());

    if (fromAuth) return normalizeUserSlug(fromAuth);

    const user = getCurrentUser();
    const state = readState();

    return normalizeUserSlug(
      user?.slug ||
        user?.lookup?.slug ||
        user?.profile?.slug ||
        state.userSlug ||
        ""
    );
  }

  function getUserPathInfo(path = HOME_PATH) {
    const canonical = normalizeCanonicalPath(path);

    if (!canonical.startsWith(USER_HOME_PREFIX)) {
      return {
        scoped: false,
        slug: "",
        restPath: canonical,
        isHome: false,
      };
    }

    const rest = canonical.slice(USER_HOME_PREFIX.length);
    const [slugSegment = "", ...restSegments] = rest.split("/");
    const slug = normalizeUserSlug(slugSegment);

    const restPath = restSegments.length
      ? normalizePathname(`/${restSegments.join("/")}`)
      : HOME_PATH;

    return {
      scoped: Boolean(slug),
      slug,
      restPath,
      isHome: Boolean(slug && restPath === HOME_PATH),
    };
  }

  function extractSlugFromPath(path = HOME_PATH) {
    return getUserPathInfo(path).slug;
  }

  function isUserHomePath(path = HOME_PATH) {
    return getUserPathInfo(path).isHome;
  }

  function isUserScopedPath(path = HOME_PATH) {
    return getUserPathInfo(path).scoped;
  }

  function isCurrentUserScopedPath(path = HOME_PATH) {
    const requestedSlug = extractSlugFromPath(path);
    const realSlug = getCurrentUserSlug();

    return Boolean(requestedSlug && realSlug && requestedSlug === realSlug);
  }

  function buildUserScopedPath(canonicalPath = HOME_PATH, slug = getCurrentUserSlug()) {
    const cleanSlug = normalizeUserSlug(slug);
    const canonical = normalizeCanonicalPath(canonicalPath);

    if (!cleanSlug) return canonical;
    if (canonical === HOME_PATH) return `${USER_HOME_PREFIX}${cleanSlug}`;

    return `${USER_HOME_PREFIX}${cleanSlug}${canonical}`;
  }

  function buildUserHomePath(slug = getCurrentUserSlug()) {
    return buildUserScopedPath(HOME_PATH, slug);
  }

  function getDefaultHome() {
    return buildUserHomePath();
  }

  function resolveRouteLookupPath(path = HOME_PATH) {
    const canonical = normalizeCanonicalPath(path);
    const scoped = getUserPathInfo(canonical);

    if (scoped.scoped) {
      return scoped.restPath;
    }

    if (isFunction(Routes.resolveRouteLookupPath)) {
      return normalizeCanonicalPath(Routes.resolveRouteLookupPath(canonical));
    }

    return canonical;
  }

  function routeIsPrivate(route = null) {
    return Boolean(route && route.public !== true);
  }

  function buildScopedPublicPath(data = {}, slug = getCurrentUserSlug()) {
    return withSearchHashFrom(
      data.publicPath || data.canonicalPath || HOME_PATH,
      buildUserScopedPath(data.canonicalPath || HOME_PATH, slug)
    );
  }

  function getUserHomeRedirect(data = {}) {
    const route = data.route || null;

    if (!route || route.path !== HOME_PATH || route.public === true) return "";
    if (!isAuthenticated()) return "";

    const realSlug = getCurrentUserSlug();

    if (!realSlug) return "";

    const expected = buildScopedPublicPath(data, realSlug);
    const visibleCanonical = normalizeCanonicalPath(data.publicPath || HOME_PATH);
    const requestedSlug = normalizeUserSlug(data.routeParams?.slug || "");

    if (visibleCanonical === HOME_PATH) return expected;
    if (requestedSlug && requestedSlug !== realSlug) return expected;

    if (
      requestedSlug === realSlug &&
      visibleCanonical !== normalizeCanonicalPath(expected)
    ) {
      return expected;
    }

    return "";
  }

  function getPrivateRouteSlugRedirect(data = {}) {
    const route = data.route || null;

    if (!routeIsPrivate(route)) return "";
    if (!isAuthenticated()) return "";

    const realSlug = getCurrentUserSlug();

    if (!realSlug) return "";

    const visibleCanonical = normalizeCanonicalPath(
      data.publicPath || data.canonicalPath || HOME_PATH
    );

    const expectedPathname = buildUserScopedPath(
      data.canonicalPath || HOME_PATH,
      realSlug
    );

    const requestedSlug = normalizeUserSlug(data.routeParams?.slug || "");

    if (visibleCanonical !== expectedPathname || requestedSlug !== realSlug) {
      return withSearchHashFrom(
        data.publicPath || data.canonicalPath || HOME_PATH,
        expectedPathname
      );
    }

    return "";
  }

  /* =======================================================
     ROUTES
  ======================================================= */

  function routePath(route = null) {
    return normalizeCanonicalPath(route?.path || HOME_PATH);
  }

  function getStaticRouteByPath(path = HOME_PATH) {
    const lookup = normalizeCanonicalPath(path);
    return routes.find((route) => routePath(route) === lookup) || null;
  }

  function getRouteMatch(path = HOME_PATH) {
    const publicPath = normalizePublicPath(path);
    const visibleCanonicalPath = normalizeCanonicalPath(publicPath);
    const scoped = getUserPathInfo(visibleCanonicalPath);
    const lookupPath = resolveRouteLookupPath(visibleCanonicalPath);
    const route = isBlockedLegacyPath(visibleCanonicalPath)
      ? null
      : getStaticRouteByPath(lookupPath);

    return {
      route,
      publicPath,
      canonicalPath: route ? routePath(route) : lookupPath,
      visibleCanonicalPath,
      lookupPath,
      routeParams: scoped.slug ? { slug: scoped.slug } : {},
      matchedBy: scoped.slug ? "user-scope" : route ? "static" : "none",
      blockedLegacy: isBlockedLegacyPath(visibleCanonicalPath),
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

  function isPublicAuthRoutePath(path = HOME_PATH) {
    const canonical = canonicalAuthPath(path);

    if (isBlockedLegacyPath(canonical)) return false;

    if (isFunction(Routes.isPublicAuthPath)) {
      return Routes.isPublicAuthPath(canonical) === true;
    }

    const route = getRoute(canonical);
    return Boolean(route?.public === true);
  }

  function normalizeNavigationTarget(path = HOME_PATH, options = {}) {
    const publicPath = normalizePublicPath(path);
    const canonicalPath = normalizeCanonicalPath(publicPath);

    if (
      options.useSlugHome !== false &&
      options.keepCanonicalHome !== true &&
      canonicalPath === HOME_PATH &&
      isAuthenticated()
    ) {
      return buildUserHomePath();
    }

    const match = getRouteMatch(publicPath);

    if (
      options.useSlugPrivate !== false &&
      routeIsPrivate(match.route) &&
      isAuthenticated() &&
      getCurrentUserSlug()
    ) {
      return buildScopedPublicPath(match, getCurrentUserSlug());
    }

    return publicPath;
  }

  function isValidPostLoginTarget(path = "") {
    const target = normalizePublicPath(path);

    if (!target) return false;
    if (hasSensitiveQuery(target)) return false;
    if (isBlockedLegacyPath(target)) return false;
    if (isPublicAuthRoutePath(target)) return false;

    return routeExists(target);
  }

  function normalizePostLoginTarget(path = "", fallback = getDefaultHome()) {
    const target = normalizePublicPath(path || fallback || HOME_PATH);

    if (!isValidPostLoginTarget(target)) {
      return normalizeNavigationTarget(fallback || HOME_PATH);
    }

    return normalizeNavigationTarget(target);
  }

  /* =======================================================
     STATE / SHELL / CHROME
  ======================================================= */

  function setRouterState({
    canonicalPath = HOME_PATH,
    publicPath = HOME_PATH,
    routeParams = {},
  } = {}) {
    const canonical = normalizeCanonicalPath(canonicalPath);
    const visible = normalizePublicPath(publicPath || canonical);
    const params = isObject(routeParams) ? { ...routeParams } : {};

    const patch = {
      route: canonical,
      canonicalPath: canonical,
      publicPath: visible,
      routeParams: params,
      initialRouteRendered: true,
    };

    try {
      AppCore?.setState?.(patch, {
        source: SOURCE,
        silent: true,
        emit: false,
      });
    } catch {
      try {
        Object.assign(readState(), patch);
      } catch {
        // noop
      }
    }

    return {
      canonicalPath: canonical,
      publicPath: visible,
      routeParams: params,
    };
  }

  function updateShell(route = null, canonicalPath = HOME_PATH) {
    safeCall(Shell.setShellMode, AppCore, route);
    safeCall(Shell.setActiveMenu, AppCore, canonicalPath);
    safeCall(
      Shell.setDocumentTitle,
      AppCore,
      route?.title || route?.label || route?.name || "Onion Support"
    );

    return true;
  }

  function getChromeModule(...names) {
    for (const name of names.flat().filter(Boolean)) {
      try {
        const module =
          AppCore?.modules?.get?.(name) ||
          AppCore?.ui?.[name] ||
          AppCore?.[name] ||
          null;

        if (module) return module;
      } catch {
        // noop
      }
    }

    return null;
  }

  function syncChromeModule(module = null, context = {}) {
    if (!module) return false;

    for (const method of ["sync", "refresh", "render"]) {
      try {
        if (isFunction(module?.[method])) {
          module[method](context);
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  function syncRouteChrome(route = null, state = {}, options = {}) {
    const context = {
      AppCore,
      core: AppCore,
      route,
      canonicalPath: state.canonicalPath || HOME_PATH,
      publicPath: state.publicPath || state.canonicalPath || HOME_PATH,
      routeParams: state.routeParams || {},
      source: options.source || SOURCE,
      reason: "route-render",
    };

    syncChromeModule(getChromeModule("sidebar", "SidebarUI", "Sidebar"), context);
    syncChromeModule(getChromeModule("topbar", "TopbarUI", "Topbar"), context);

    return true;
  }

  function clearChrome() {
    safeCall(Shell.clearDynamicContainers, AppCore);
    return true;
  }

  function destroyActiveView() {
    if (!activeView) return false;

    for (const method of ["destroy", "unmount", "cleanup"]) {
      try {
        if (isFunction(activeView?.[method])) {
          activeView[method]();
          break;
        }
      } catch {
        // noop
      }
    }

    activeView = null;
    return true;
  }

  function viewRoot() {
    if (!isBrowser()) return null;

    return (
      document.getElementById("view-container") ||
      document.getElementById("app-content") ||
      document.getElementById("main-content") ||
      document.body ||
      null
    );
  }

  function renderFallback(title = "Onion Support", message = "") {
    const root = viewRoot();

    if (!root) return null;

    const section = document.createElement("section");
    section.className = "route-fallback-view";
    section.setAttribute("role", "status");

    const h1 = document.createElement("h1");
    h1.textContent = title;
    section.appendChild(h1);

    if (message) {
      const p = document.createElement("p");
      p.textContent = message;
      section.appendChild(p);
    }

    root.replaceChildren(section);

    return section;
  }

  /* =======================================================
     GUARDS
  ======================================================= */

  function loginRedirectTarget(publicPath = HOME_PATH) {
    const target = normalizePublicPath(publicPath || HOME_PATH);

    if (
      !target ||
      hasSensitiveQuery(target) ||
      isBlockedLegacyPath(target) ||
      isPublicAuthRoutePath(target) ||
      !routeExists(target)
    ) {
      return LOGIN_PATH;
    }

    return `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`;
  }

  function routeRoles(route = null) {
    const values = Array.isArray(route?.roles)
      ? route.roles
      : route?.roles
        ? [route.roles]
        : [];

    return values.map(normalizeRole).filter(Boolean);
  }

  function routeRequiresAdmin(route = null, canonicalPath = HOME_PATH) {
    if (!route || route.public === true) return false;
    if (route.adminOnly === true || route.requiresAdmin === true) return true;

    const roles = routeRoles(route);

    if (roles.includes("admin") && !roles.includes("user")) return true;

    try {
      return isConfigAdminRoute(canonicalPath || routePath(route)) === true;
    } catch {
      return false;
    }
  }

  function adminRouteAccessResult(route, canonicalPath, publicPath) {
    if (!routeRequiresAdmin(route, canonicalPath)) return null;

    if (!isAuthenticated()) {
      return {
        allowed: false,
        reason: "not-authenticated",
        redirectTo: loginRedirectTarget(publicPath),
      };
    }

    if (getCurrentRole() === "admin") {
      return {
        allowed: true,
        reason: "admin",
      };
    }

    return {
      allowed: false,
      reason: "admin-required",
    };
  }

  function enforceAdminRouteAccess(result, route, canonicalPath, publicPath) {
    const adminResult = adminRouteAccessResult(route, canonicalPath, publicPath);

    if (!adminResult) return result;
    if (!adminResult.allowed) return adminResult;

    return result;
  }

  function fallbackAllowRoute({ route, requestedCanonicalPath, requestedPublicPath }) {
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
          redirectTo: getDefaultHome(),
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
        redirectTo: loginRedirectTarget(requestedPublicPath),
      };
    }

    const adminAccess = adminRouteAccessResult(
      route,
      requestedCanonicalPath || routePath(route),
      requestedPublicPath
    );

    if (adminAccess && !adminAccess.allowed) return adminAccess;

    const roles = routeRoles(route);

    if (!roles.length) {
      return {
        allowed: true,
        reason: "authenticated",
      };
    }

    const role = getCurrentRole();

    if (role === "admin") {
      return {
        allowed: true,
        reason: "admin",
      };
    }

    const allowed = roles.includes(role);

    return {
      allowed,
      reason: allowed ? "role-match" : "insufficient-role",
    };
  }

  function checkAccess(route, canonicalPath, publicPath) {
    const shouldAllowRoute = RouteGuards.shouldAllowRoute;
    const requiresAdmin = routeRequiresAdmin(route, canonicalPath);

    try {
      if (isFunction(shouldAllowRoute)) {
        const result = shouldAllowRoute({
          AppCore,
          Auth: getAuth(),

          route,

          requestedCanonicalPath: canonicalPath,
          requestedPublicPath: publicPath,
          requestedSlug: extractSlugFromPath(publicPath),

          currentUser: getCurrentUser(),
          currentUserSlug: getCurrentUserSlug(),

          currentRole: getCurrentRole(),
          requiresAdmin,
          adminOnly: requiresAdmin,
          isAdminRoute: isConfigAdminRoute,

          defaultHome: getDefaultHome(),

          buildUserHomePath,
          buildUserScopedPath,
          getRoute,

          isAuthenticated,
        });

        if (isObject(result)) {
          return enforceAdminRouteAccess(
            {
              allowed: result.allowed !== false,
              ...result,
            },
            route,
            canonicalPath,
            publicPath
          );
        }

        if (typeof result === "boolean") {
          return enforceAdminRouteAccess(
            {
              allowed: result,
              reason: result ? "guard-allow" : "guard-deny",
            },
            route,
            canonicalPath,
            publicPath
          );
        }
      }
    } catch (error) {
      return {
        allowed: false,
        reason: "guard-error",
        error,
      };
    }

    return fallbackAllowRoute({
      route,
      requestedCanonicalPath: canonicalPath,
      requestedPublicPath: publicPath,
    });
  }

  /* =======================================================
     HISTORY
  ======================================================= */

  function writeHistory(publicPath = HOME_PATH, options = {}) {
    if (options.skipHistory === true) return false;

    return Boolean(
      safeCall(History.updateHistory, {
        AppCore,
        pathname: publicPath,
        options,
      })
    );
  }

  function initHistory() {
    safeCall(History.ensureInitialHistoryState, { AppCore });
    return true;
  }

  /* =======================================================
     RENDER HELPERS
  ======================================================= */

  function renderNotFound(data, options = {}) {
    destroyActiveView();
    clearChrome();
    writeHistory(data.publicPath, options);

    if (isFunction(Render.renderRouteNotFound)) {
      Render.renderRouteNotFound({
        AppCore,
        route: null,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        setShellMode: (route) => Shell.setShellMode?.(AppCore, route),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else {
      renderFallback("Ruta no encontrada", "La vista solicitada no existe.");
    }

    const state = setRouterState(data);

    updateShell(null, state.canonicalPath);
    syncRouteChrome(null, state, options);

    return {
      ok: true,
      found: false,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  }

  function renderForbidden(route, data, reason = "forbidden", options = {}) {
    destroyActiveView();
    clearChrome();
    writeHistory(data.publicPath, options);

    if (isFunction(Render.renderRouteForbidden)) {
      Render.renderRouteForbidden({
        AppCore,
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        setShellMode: (nextRoute) => Shell.setShellMode?.(AppCore, nextRoute),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else {
      renderFallback("Acceso no permitido", "No tienes permisos para ver esta vista.");
    }

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    syncRouteChrome(route, state, options);

    return {
      ok: true,
      forbidden: true,
      reason,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
    };
  }

  async function renderSuccess(route, data, options = {}) {
    destroyActiveView();
    clearChrome();
    updateShell(route, data.canonicalPath);
    writeHistory(data.publicPath, options);

    let view = null;

    if (isFunction(Render.renderRouteSuccess)) {
      view = await Render.renderRouteSuccess({
        AppCore,
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        setShellMode: (nextRoute) => Shell.setShellMode?.(AppCore, nextRoute),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else if (isFunction(route?.render)) {
      view = await route.render(viewRoot(), {
        AppCore,
        route,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
      });
    }

    activeView = view || null;

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    syncRouteChrome(route, state, options);

    return {
      ok: true,
      found: true,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
      route,
    };
  }

  async function renderRuntimeError(route, data, error, options = {}) {
    destroyActiveView();
    writeHistory(data.publicPath, options);

    if (isFunction(Render.renderRouteRuntimeError)) {
      await Render.renderRouteRuntimeError({
        AppCore,
        route,
        error,
        requestedPath: data.publicPath,
        canonicalPath: data.canonicalPath,
        publicPath: data.publicPath,
        routeParams: data.routeParams || {},
        setShellMode: (nextRoute) => Shell.setShellMode?.(AppCore, nextRoute),
        setDocumentTitle: (title) => Shell.setDocumentTitle?.(AppCore, title),
      });
    } else {
      renderFallback("Error de vista", "No se pudo renderizar esta vista.");
    }

    const state = setRouterState(data);

    updateShell(route, state.canonicalPath);
    syncRouteChrome(route, state, options);

    return {
      ok: false,
      error,
      canonicalPath: state.canonicalPath,
      publicPath: state.publicPath,
      routeParams: state.routeParams,
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

    return executeRender(safeRedirectPath(path, HOME_PATH), {
      ...options,
      replaceState: true,
      skipHistory: false,
      source: reason,
      __redirectDepth: depth + 1,
    });
  }

  async function executeRender(path = HOME_PATH, options = {}) {
    const seq = ++renderSeq;
    let data = getRouteMatch(path);

    if (data.blockedLegacy) {
      if (!isAuthenticated()) {
        return redirectTo(LOGIN_PATH, options, "blocked-legacy-login");
      }

      return renderNotFound(data, options);
    }

    const waitedAuth = await waitForAuthIfNeeded(data, options);

    if (waitedAuth) {
      if (seq !== renderSeq) {
        return {
          ok: false,
          skipped: true,
          reason: "stale",
        };
      }

      data = getRouteMatch(path);
    }

    if (!data.route) {
      if (!isAuthenticated()) {
        return redirectTo(
          loginRedirectTarget(data.publicPath),
          options,
          "not-found-auth-required"
        );
      }

      return renderNotFound(data, options);
    }

    const access = checkAccess(data.route, data.canonicalPath, data.publicPath);

    if (seq !== renderSeq) {
      return {
        ok: false,
        skipped: true,
        reason: "stale",
      };
    }

    if (!access.allowed) {
      if (access.redirectTo) {
        return redirectTo(access.redirectTo, options, access.reason || "guard-redirect");
      }

      return renderForbidden(data.route, data, access.reason || "forbidden", options);
    }

    const privateSlugRedirect = options.keepCanonicalHome === true
      ? ""
      : getPrivateRouteSlugRedirect(data);

    if (privateSlugRedirect) {
      return redirectTo(privateSlugRedirect, options, "user-scope");
    }

    const homeRedirect = options.keepCanonicalHome === true
      ? ""
      : getUserHomeRedirect(data);

    if (homeRedirect) {
      return redirectTo(homeRedirect, options, "user-home");
    }

    try {
      return await renderSuccess(data.route, data, options);
    } catch (error) {
      return renderRuntimeError(data.route, data, error, options);
    }
  }

  function render(path = HOME_PATH, options = {}) {
    renderPromise = renderPromise
      .catch(() => null)
      .then(() => executeRender(path, isObject(options) ? options : {}));

    return renderPromise;
  }

  function renderCurrent(options = {}) {
    return render(browserPath(), {
      ...options,
      replaceState: true,
      skipHistory: true,
      source: options.source || "render-current",
    });
  }

  /* =======================================================
     NAVIGATION
  ======================================================= */

  function navigate(path = HOME_PATH, options = {}) {
    const href = cleanText(path, HOME_PATH);

    if (
      isUnsafeHref(href) ||
      isExternalHref(href) ||
      isHashOnlyHref(href) ||
      hasSensitiveQuery(href)
    ) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        reason: "ignored-href",
      });
    }

    return render(normalizeNavigationTarget(href, options), options);
  }

  function replace(path = HOME_PATH, options = {}) {
    return navigate(path, {
      ...options,
      replaceState: true,
    });
  }

  function goAfterLogin(fallback = HOME_PATH, options = {}) {
    const target = normalizePostLoginTarget(
      readState().postLoginTarget || fallback,
      getDefaultHome()
    );

    return navigate(target, {
      ...options,
      replaceState: true,
      force: true,
      source: "login",
    });
  }

  /* =======================================================
     EVENTS / BIND
  ======================================================= */

  function onDom(target, eventName, handler, options = false) {
    if (!target || !isFunction(target.addEventListener) || !isFunction(handler)) {
      return () => false;
    }

    try {
      target.addEventListener(eventName, handler, options);
    } catch {
      return () => false;
    }

    return () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {
        // noop
      }

      return true;
    };
  }

  function linkHref(link = null) {
    return cleanText(
      link?.dataset?.route ||
        link?.dataset?.href ||
        link?.dataset?.to ||
        link?.getAttribute?.("data-route") ||
        link?.getAttribute?.("data-href") ||
        link?.getAttribute?.("data-to") ||
        link?.getAttribute?.("href"),
      ""
    );
  }

  function onClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

    const link = target?.closest?.("a[data-spa]");

    if (!link || link.hasAttribute("download")) return;

    const href = linkHref(link);
    const linkTarget = cleanText(link.getAttribute("target"), "").toLowerCase();

    if (!href || linkTarget === "_blank") return;
    if (isUnsafeHref(href) || isExternalHref(href) || isHashOnlyHref(href)) return;
    if (hasSensitiveQuery(href)) return;

    event.preventDefault();

    navigate(href, {
      source: "link-click",
    });
  }

  function handlePopState() {
    render(browserPath(), {
      skipHistory: true,
      replaceState: true,
      source: "popstate",
    });
  }

  function attachToCore() {
    try {
      AppCore.Router = api;
      AppCore.router = api;
      AppCore.modules?.register?.("router", api);
    } catch {
      // noop
    }

    return true;
  }

  function init() {
    if (initialized) return api;

    initialized = true;

    initHistory();
    attachToCore();

    return api;
  }

  function bind() {
    if (bound) return api;

    init();

    if (isBrowser()) {
      disposers.push(onDom(document, "click", onClick));
      disposers.push(onDom(window, "popstate", handlePopState));
    }

    bound = true;
    attachToCore();

    return api;
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
    bound = false;

    return api;
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getSnapshot() {
    return {
      version: ROUTER_VERSION,

      initialized,
      bound,
      renderSeq,
      hasActiveView: Boolean(activeView),

      route: redact(readState().route || HOME_PATH),
      canonicalPath: redact(currentCanonicalPath()),
      publicPath: redact(currentPublicPath()),
      routeParams: readState().routeParams || {},

      authenticated: isAuthenticated(),
      authResolving: isAuthResolving(),
      hasAuthPromise: Boolean(getInFlightAuthPromise()),

      defaultHome: getDefaultHome(),
      currentUserSlug: getCurrentUserSlug() || null,
      currentRole: getCurrentRole(),

      routes: routes.map((route) => ({
        path: route.path,
        name: route.name || route.id || "",
        title: route.title || route.label || "",
        public: Boolean(route.public),
        roles: Array.isArray(route.roles) ? route.roles : [],
        adminOnly: routeRequiresAdmin(route, route.path),
      })),

      policy: {
        ownAuthStatic: false,
        authDelegated: true,
        waitsForInFlightAuthRestore: true,
        doesNotStartRestore: true,

        ownStorage: false,
        ownTransport: false,
        ownToast: false,

        strictAuth: true,
        adminRoutesDelegatedToConfig: true,
        adminRoutesRequireAdmin: true,

        privateRouteWithoutSessionRedirectsLogin: true,
        userSlugHome: true,
        userSlugPrivateRoutes: true,
        validatesRealUserSlug: true,

        homeInternalPath: HOME_PATH,
        homeVisiblePattern: "/@{user.slug}",
        privateVisiblePattern: "/@{user.slug}/{route}",

        syncsRegisteredChromeAfterRender: true,

        noHomeAlias: true,
        noHomeRoute: true,
        blocksHomeAlias: true,
        blocks403Route: true,
        blocks404Route: true,

        no2fa: true,
        noMfa: true,
        noOtp: true,
      },
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

  const api = {
    version: ROUTER_VERSION,
    routes,

    init,

    bind,
    unbind,
    destroy: unbind,

    getRoute,
    routeExists,
    getRouteMatch,
    getCurrentRoute,

    getCurrentPath: currentPublicPath,
    getCurrentCanonicalPath: currentCanonicalPath,
    getCurrentPublicPath: currentPublicPath,

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

    extractSlugFromPath,
    isUserHomePath,
    isUserScopedPath,
    isCurrentUserScopedPath,

    isSameCanonicalPath: (a = HOME_PATH, b = HOME_PATH) =>
      normalizeCanonicalPath(a) === normalizeCanonicalPath(b),

    getRequestedData: getRouteMatch,

    safePath: normalizePublicPath,
    safePublicPath: normalizePublicPath,
    safeCanonicalPath: normalizeCanonicalPath,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    debug,
  };

  return api;
})();

export default Router;

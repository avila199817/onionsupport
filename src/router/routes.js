/* =========================================================
   Onion Support - Routes
   Archivo: /src/router/routes.js

   Responsabilidad:
   - Tabla mínima de rutas SPA.
   - Vistas lazy.
   - Resolver /@{slug} hacia ruta interna.
   - Marcar rutas públicas, privadas y admin.
   - Rutas públicas viven en /src/views/public/*
   - Sin Auth, sin guards, sin history, sin storage,
     sin Toast, sin snapshots gigantes y sin rutas inventadas.
========================================================= */

import {
  ROUTES,
  USER_HOME_PREFIX,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
} from "../core/config.js";

export const ROUTES_VERSION = "routes.minimal.v2";

export const ROUTE_PATHS = Object.freeze({
  HOME: ROUTES.home || "/",

  INCIDENCIAS: ROUTES.incidencias || "/incidencias",
  FACTURAS: ROUTES.facturas || "/facturas",
  CLIENTES: ROUTES.clientes || "/clientes",
  USUARIOS: ROUTES.usuarios || "/usuarios",
  SERVIDOR: ROUTES.servidor || "/servidor",
  CUENTA: ROUTES.cuenta || "/cuenta",
  AJUSTES: ROUTES.ajustes || "/ajustes",

  LOGIN: ROUTES.login || "/login",
  PASSWORD_REQUEST: ROUTES.passwordRequest || "/password-request",
  PASSWORD_RESET: ROUTES.passwordReset || "/password-reset",
  ACTIVATE_ACCOUNT: ROUTES.activateAccount || "/activate-account",
});

export const ROUTE_NAMES = Object.freeze({
  HOME: "home",

  INCIDENCIAS: "incidencias",
  FACTURAS: "facturas",
  CLIENTES: "clientes",
  USUARIOS: "usuarios",
  SERVIDOR: "servidor",
  CUENTA: "cuenta",
  AJUSTES: "ajustes",

  LOGIN: "login",
  PASSWORD_REQUEST: "password-request",
  PASSWORD_RESET: "password-reset",
  ACTIVATE_ACCOUNT: "activate-account",
});

export const VALID_ROLES = Object.freeze(["admin", "user"]);
export const ADMIN_ROLES = Object.freeze(["admin"]);

export const PUBLIC_AUTH_ROUTES = Object.freeze([
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.PASSWORD_REQUEST,
  ROUTE_PATHS.PASSWORD_RESET,
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
]);

export const TOKEN_ROUTE_PATHS = Object.freeze([
  ROUTE_PATHS.PASSWORD_RESET,
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
]);

export const ROUTE_ALIASES = Object.freeze({});

/* =========================================================
   BASICS
========================================================= */

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePath(path = "/") {
  try {
    return configNormalizeRoutePath(path) || "/";
  } catch {
    let value = cleanText(path, "/")
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value || "/";
  }
}

function cleanName(value = "") {
  return cleanText(value, "route")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96);
}

function pickView(module, names = []) {
  for (const name of names) {
    if (module?.[name]) return module[name];
  }

  return module?.default || module;
}

function resolveRenderer(view, viewKey = "") {
  if (isFunction(view)) return view;

  if (isFunction(view?.init)) return view.init.bind(view);
  if (isFunction(view?.mount)) return view.mount.bind(view);
  if (isFunction(view?.render)) return view.render.bind(view);

  throw new Error(`La vista "${viewKey}" no expone init(), mount() ni render().`);
}

/* =========================================================
   USER SCOPE
========================================================= */

export function normalizeRoutePath(path = "/") {
  return normalizePath(path);
}

export function normalizeUserHomeSlug(value = "") {
  try {
    return normalizeUserSlug(value) || "";
  } catch {
    return "";
  }
}

export function getUserScopedRouteInfo(path = "/") {
  try {
    return configGetUserScopedRouteInfo(path);
  } catch {
    const clean = normalizePath(path);

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
    const slug = normalizeUserHomeSlug(slugSegment);

    if (!slug) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath: clean,
        canonicalPath: clean,
        lookupPath: clean,
      };
    }

    const restPath = segments.length
      ? normalizePath(`/${segments.join("/")}`)
      : "/";

    return {
      scoped: true,
      home: restPath === "/",
      slug,
      restPath,
      canonicalPath: restPath,
      lookupPath: restPath,
    };
  }
}

export function resolveRouteLookupPath(path = "/") {
  const clean = normalizePath(path);

  if (isBlockedRoutePath(clean)) return "";

  const scoped = getUserScopedRouteInfo(clean);

  return scoped.scoped ? scoped.canonicalPath || scoped.restPath || "/" : clean;
}

export function getUserHomeSlugFromPath(path = "/") {
  const info = getUserScopedRouteInfo(path);
  return info.home ? info.slug : "";
}

export function getUserScopedSlugFromPath(path = "/") {
  const info = getUserScopedRouteInfo(path);
  return info.scoped ? info.slug : "";
}

export function getUserScopedRestPath(path = "/") {
  const info = getUserScopedRouteInfo(path);
  return info.scoped ? info.restPath || info.canonicalPath || "/" : "";
}

export function isUserScopedPath(path = "/") {
  return getUserScopedRouteInfo(path).scoped === true;
}

export function isUserHomePath(path = "/") {
  return getUserScopedRouteInfo(path).home === true;
}

export function isHomePath(path = "/") {
  return normalizePath(path) === "/" || isUserHomePath(path);
}

/* =========================================================
   VIEW LOADERS
========================================================= */

const VIEW_LOADERS = Object.freeze({
  home: () =>
    import("../views/home/index.js").then((module) =>
      pickView(module, ["HomeView"])
    ),

  incidencias: () =>
    import("../views/incidencias/index.js").then((module) =>
      pickView(module, ["IncidenciasView"])
    ),

  facturas: () =>
    import("../views/facturas/index.js").then((module) =>
      pickView(module, ["FacturasView"])
    ),

  clientes: () =>
    import("../views/clientes/index.js").then((module) =>
      pickView(module, ["ClientesView"])
    ),

  usuarios: () =>
    import("../views/usuarios/index.js").then((module) =>
      pickView(module, ["UsuariosView"])
    ),

  servidor: () =>
    import("../views/server/index.js").then((module) =>
      pickView(module, ["ServidorView", "ServerView"])
    ),

  cuenta: () =>
    import("../views/cuenta/index.js").then((module) =>
      pickView(module, ["CuentaView"])
    ),

  ajustes: () =>
    import("../views/ajustes/index.js").then((module) =>
      pickView(module, ["AjustesView"])
    ),

  login: () =>
    import("../views/public/login/index.js").then((module) =>
      pickView(module, ["LoginView"])
    ),

  "password-request": () =>
    import("../views/public/password-reset/index.js").then((module) =>
      pickView(module, ["PasswordRequestView", "PasswordResetView", "ResetPasswordView"])
    ),

  "password-reset": () =>
    import("../views/public/password-reset/index.js").then((module) =>
      pickView(module, ["PasswordResetView", "ResetPasswordView"])
    ),

  "activate-account": () =>
    import("../views/public/activate-account/index.js").then((module) =>
      pickView(module, ["ActivateAccountView"])
    ),
});

const VIEW_CACHE = new Map();

async function loadView(viewKey = "") {
  const key = cleanName(viewKey);
  const loader = VIEW_LOADERS[key];

  if (!loader) {
    throw new Error(`Vista no encontrada: "${key}".`);
  }

  if (!VIEW_CACHE.has(key)) {
    VIEW_CACHE.set(
      key,
      Promise.resolve()
        .then(loader)
        .catch((error) => {
          VIEW_CACHE.delete(key);
          throw error;
        })
    );
  }

  return VIEW_CACHE.get(key);
}

function createRender(viewKey = "") {
  const key = cleanName(viewKey);

  return async function render(host = null, context = {}) {
    const view = await loadView(key);
    const renderer = resolveRenderer(view, key);

    return renderer(host, {
      ...(isObject(context) ? context : {}),
      viewKey: key,
      routeViewKey: key,
    });
  };
}

/* =========================================================
   ROUTES
========================================================= */

function createRoute({
  path,
  name,
  title,
  viewKey,
  public: isPublic = false,
  guestOnly = false,
  adminOnly = false,
  tokenRoute = false,
  order = 0,
}) {
  const finalPath = normalizePath(path);
  const finalName = cleanName(name || viewKey || finalPath);
  const finalViewKey = cleanName(viewKey || finalName);
  const finalAdminOnly = Boolean(adminOnly || configIsAdminRoute(finalPath));
  const finalPublic = Boolean(isPublic);

  if (!finalPath || isBlockedRoutePath(finalPath)) {
    throw new Error(`Ruta no permitida: "${path}".`);
  }

  if (finalPath.startsWith(USER_HOME_PREFIX)) {
    throw new Error(`No se declaran rutas reales bajo "${USER_HOME_PREFIX}".`);
  }

  return Object.freeze({
    id: finalName,
    version: ROUTES_VERSION,

    path: finalPath,
    canonicalPath: finalPath,
    name: finalName,
    title: cleanText(title, finalName),

    viewKey: finalViewKey,
    viewName: finalViewKey,

    public: finalPublic,
    private: !finalPublic,
    requiresAuth: !finalPublic,

    guestOnly: Boolean(guestOnly),
    publicOnly: Boolean(guestOnly),

    adminOnly: finalAdminOnly,
    requiresAdmin: finalAdminOnly,
    roles: finalAdminOnly ? ADMIN_ROLES : [],

    tokenRoute: Boolean(tokenRoute),
    preserveSearch: finalPublic || tokenRoute,
    preserveHash: finalPublic || tokenRoute,

    hideShell: finalPublic,
    showShell: !finalPublic,
    shell: !finalPublic,
    layout: finalPublic ? "auth" : "app",

    sidebar: !finalPublic,
    showInSidebar: !finalPublic,
    sidebarKey: finalViewKey,

    order: Number(order) || 0,

    render: createRender(finalViewKey),
  });
}

const ROUTE_DEFINITIONS = Object.freeze([
  createRoute({
    path: ROUTE_PATHS.HOME,
    name: ROUTE_NAMES.HOME,
    title: "Inicio",
    viewKey: "home",
    order: 10,
  }),

  createRoute({
    path: ROUTE_PATHS.INCIDENCIAS,
    name: ROUTE_NAMES.INCIDENCIAS,
    title: "Incidencias",
    viewKey: "incidencias",
    order: 20,
  }),

  createRoute({
    path: ROUTE_PATHS.FACTURAS,
    name: ROUTE_NAMES.FACTURAS,
    title: "Facturas",
    viewKey: "facturas",
    order: 30,
  }),

  createRoute({
    path: ROUTE_PATHS.CLIENTES,
    name: ROUTE_NAMES.CLIENTES,
    title: "Clientes",
    viewKey: "clientes",
    adminOnly: true,
    order: 40,
  }),

  createRoute({
    path: ROUTE_PATHS.USUARIOS,
    name: ROUTE_NAMES.USUARIOS,
    title: "Usuarios",
    viewKey: "usuarios",
    adminOnly: true,
    order: 50,
  }),

  createRoute({
    path: ROUTE_PATHS.SERVIDOR,
    name: ROUTE_NAMES.SERVIDOR,
    title: "Servidor",
    viewKey: "servidor",
    adminOnly: true,
    order: 60,
  }),

  createRoute({
    path: ROUTE_PATHS.CUENTA,
    name: ROUTE_NAMES.CUENTA,
    title: "Cuenta",
    viewKey: "cuenta",
    order: 70,
  }),

  createRoute({
    path: ROUTE_PATHS.AJUSTES,
    name: ROUTE_NAMES.AJUSTES,
    title: "Ajustes",
    viewKey: "ajustes",
    order: 80,
  }),

  createRoute({
    path: ROUTE_PATHS.LOGIN,
    name: ROUTE_NAMES.LOGIN,
    title: "Acceso",
    viewKey: "login",
    public: true,
    guestOnly: true,
    order: 100,
  }),

  createRoute({
    path: ROUTE_PATHS.PASSWORD_REQUEST,
    name: ROUTE_NAMES.PASSWORD_REQUEST,
    title: "Recuperar acceso",
    viewKey: "password-request",
    public: true,
    order: 110,
  }),

  createRoute({
    path: ROUTE_PATHS.PASSWORD_RESET,
    name: ROUTE_NAMES.PASSWORD_RESET,
    title: "Nueva contraseña",
    viewKey: "password-reset",
    public: true,
    tokenRoute: true,
    order: 120,
  }),

  createRoute({
    path: ROUTE_PATHS.ACTIVATE_ACCOUNT,
    name: ROUTE_NAMES.ACTIVATE_ACCOUNT,
    title: "Activar cuenta",
    viewKey: "activate-account",
    public: true,
    tokenRoute: true,
    order: 130,
  }),
]);

let routesCache = null;

export function createRoutes() {
  return [...ROUTE_DEFINITIONS].sort((a, b) => a.order - b.order);
}

export function getImmutableRoutes() {
  if (!routesCache) {
    routesCache = Object.freeze(createRoutes());
  }

  return routesCache;
}

export function resetRoutesCacheForTests() {
  routesCache = null;
  VIEW_CACHE.clear();
  return true;
}

/* =========================================================
   LOOKUPS
========================================================= */

export function getRouteByPath(path = "/") {
  const lookup = resolveRouteLookupPath(path);

  if (!lookup || isBlockedRoutePath(lookup)) return null;

  return getImmutableRoutes().find((route) => route.path === lookup) || null;
}

export function getRouteByName(name = "") {
  const clean = cleanName(name);
  return getImmutableRoutes().find((route) => route.name === clean) || null;
}

export function getRouteByViewKey(viewKey = "") {
  const clean = cleanName(viewKey);
  return getImmutableRoutes().find((route) => route.viewKey === clean) || null;
}

export function resolveRouteAlias(path = "/") {
  return resolveRouteLookupPath(path);
}

export function isPublicAuthPath(path = "/") {
  const route = getRouteByPath(path);
  return route?.public === true;
}

export function isTokenPublicRoutePath(path = "/") {
  const route = getRouteByPath(path);
  return route?.tokenRoute === true;
}

export function isPrivateRoutePath(path = "/") {
  const route = getRouteByPath(path);
  return Boolean(route && route.requiresAuth === true);
}

export function isAdminRoutePath(path = "/") {
  const route = getRouteByPath(path);
  return Boolean(route?.adminOnly || route?.requiresAdmin);
}

export function validateRoutesTable(_core = null, routes = getImmutableRoutes()) {
  if (!Array.isArray(routes)) {
    throw new Error("Tabla de rutas inválida.");
  }

  const seen = new Set();

  for (const route of routes) {
    if (!route?.path || !route?.render) {
      throw new Error("Ruta inválida.");
    }

    if (seen.has(route.path)) {
      throw new Error(`Ruta duplicada: ${route.path}`);
    }

    seen.add(route.path);
  }

  return true;
}

/* =========================================================
   SNAPSHOT MÍNIMO
========================================================= */

export function getRoutesSnapshot() {
  return getImmutableRoutes().map((route) => ({
    path: route.path,
    name: route.name,
    title: route.title,
    viewKey: route.viewKey,
    public: route.public,
    requiresAuth: route.requiresAuth,
    adminOnly: route.adminOnly,
    tokenRoute: route.tokenRoute,
    hideShell: route.hideShell,
    showInSidebar: route.showInSidebar,
  }));
}

export function getRouteDebug(path = "/") {
  const route = getRouteByPath(path);
  const scoped = getUserScopedRouteInfo(path);

  return {
    input: cleanText(path, "/"),
    lookupPath: resolveRouteLookupPath(path),
    found: Boolean(route),
    userScoped: scoped.scoped === true,
    userHome: scoped.home === true,
    userSlug: scoped.slug || null,
    route: route
      ? {
          path: route.path,
          name: route.name,
          viewKey: route.viewKey,
          public: route.public,
          adminOnly: route.adminOnly,
        }
      : null,
  };
}

export function getCriticalRoutesDebug() {
  return getRoutesSnapshot();
}

export function getRoutesIntegritySnapshot() {
  return {
    version: ROUTES_VERSION,
    count: getImmutableRoutes().length,
    routes: getRoutesSnapshot(),
    userHomePrefix: USER_HOME_PREFIX,
    loadedViews: [...VIEW_CACHE.keys()],
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTES_VERSION,

  ROUTE_PATHS,
  ROUTE_NAMES,
  ROUTE_ALIASES,

  VALID_ROLES,
  ADMIN_ROLES,

  PUBLIC_AUTH_ROUTES,
  TOKEN_ROUTE_PATHS,

  normalizeRoutePath,
  normalizeUserHomeSlug,

  getUserScopedRouteInfo,
  getUserHomeSlugFromPath,
  getUserScopedSlugFromPath,
  getUserScopedRestPath,
  isUserScopedPath,
  isUserHomePath,
  isHomePath,
  resolveRouteLookupPath,

  createRoutes,
  getImmutableRoutes,
  resetRoutesCacheForTests,
  validateRoutesTable,

  getRouteByPath,
  getRouteByName,
  getRouteByViewKey,
  resolveRouteAlias,

  isPublicAuthPath,
  isTokenPublicRoutePath,
  isPrivateRoutePath,
  isAdminRoutePath,

  getRoutesSnapshot,
  getRouteDebug,
  getCriticalRoutesDebug,
  getRoutesIntegritySnapshot,
};

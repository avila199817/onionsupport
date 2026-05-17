/* =========================================================
   Onion Support - Routes
   Archivo: /src/router/routes.js

   Responsabilidad:
   - Tabla estática mínima de rutas SPA.
   - Vistas lazy.
   - Roles reales: admin / user.
   - Rutas privadas sin rol: usuario autenticado.
   - Rutas admin: sólo admin.
   - Rutas públicas actuales:
     /login
     /password-request
     /password-reset
     /activate-account
   - Sin aliases legacy.
   - Sin 2FA/MFA/OTP.
   - Sin /403.
   - Sin /404.
   - Sin Auth.
   - Sin guards.
   - Sin history.
   - Sin storage.
   - Sin Toast.
========================================================= */

export const ROUTES_VERSION = "simple";

const ROUTE_SOURCE = "router.routes";

/* =========================================================
   PATHS / NAMES / VIEWS
========================================================= */

export const ROUTE_PATHS = Object.freeze({
  HOME: "/",
  INCIDENCIAS: "/incidencias",
  FACTURAS: "/facturas",
  USUARIOS: "/usuarios",
  CLIENTES: "/clientes",
  CUENTA: "/cuenta",
  AJUSTES: "/ajustes",
  SERVIDOR: "/servidor",

  LOGIN: "/login",
  ACTIVATE_ACCOUNT: "/activate-account",
  PASSWORD_REQUEST: "/password-request",
  PASSWORD_RESET: "/password-reset",
});

export const ROUTE_NAMES = Object.freeze({
  HOME: "home",
  INCIDENCIAS: "incidencias",
  FACTURAS: "facturas",
  USUARIOS: "usuarios",
  CLIENTES: "clientes",
  CUENTA: "cuenta",
  AJUSTES: "ajustes",
  SERVIDOR: "servidor",

  LOGIN: "login",
  ACTIVATE_ACCOUNT: "activate-account",
  PASSWORD_REQUEST: "password-request",
  PASSWORD_RESET: "password-reset",
});

export const ROUTE_VIEW_KEYS = Object.freeze({
  HOME: "home",
  INCIDENCIAS: "incidencias",
  FACTURAS: "facturas",
  USUARIOS: "usuarios",
  CLIENTES: "clientes",
  CUENTA: "cuenta",
  AJUSTES: "ajustes",
  SERVIDOR: "servidor",

  LOGIN: "login",
  ACTIVATE_ACCOUNT: "activate-account",
  PASSWORD_REQUEST: "password-reset",
  PASSWORD_RESET: "password-reset",
});

export const ROUTE_VIEW_NAMES = Object.freeze({
  HOME: "HomeView",
  INCIDENCIAS: "IncidenciasView",
  FACTURAS: "FacturasView",
  USUARIOS: "UsuariosView",
  CLIENTES: "ClientesView",
  CUENTA: "CuentaView",
  AJUSTES: "AjustesView",
  SERVIDOR: "ServerView",

  LOGIN: "LoginView",
  ACTIVATE_ACCOUNT: "ActivateAccountView",
  PASSWORD_REQUEST: "PasswordResetView",
  PASSWORD_RESET: "PasswordResetView",
});

/* =========================================================
   AUTH
========================================================= */

export const ADMIN_ROLES = Object.freeze(["admin"]);
export const VALID_ROLES = Object.freeze(["admin", "user"]);

export const PUBLIC_AUTH_ROUTES = Object.freeze([
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
  ROUTE_PATHS.PASSWORD_REQUEST,
  ROUTE_PATHS.PASSWORD_RESET,
]);

export const TOKEN_ROUTE_PATHS = Object.freeze([
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
  ROUTE_PATHS.PASSWORD_RESET,
]);

export const ROUTE_ALIASES = Object.freeze({});

const PUBLIC_AUTH_ROUTE_SET = new Set(PUBLIC_AUTH_ROUTES);
const TOKEN_ROUTE_SET = new Set(TOKEN_ROUTE_PATHS);

/* =========================================================
   VIEW LOADERS
========================================================= */

const VIEW_LOADERS = Object.freeze({
  [ROUTE_VIEW_KEYS.HOME]: () =>
    import("../views/home/index.js").then((module) => module.HomeView || module.default || module),

  [ROUTE_VIEW_KEYS.INCIDENCIAS]: () =>
    import("../views/incidencias/index.js").then((module) => module.IncidenciasView || module.default || module),

  [ROUTE_VIEW_KEYS.FACTURAS]: () =>
    import("../views/facturas/index.js").then((module) => module.FacturasView || module.default || module),

  [ROUTE_VIEW_KEYS.USUARIOS]: () =>
    import("../views/usuarios/index.js").then((module) => module.UsuariosView || module.default || module),

  [ROUTE_VIEW_KEYS.CLIENTES]: () =>
    import("../views/clientes/index.js").then((module) => module.ClientesView || module.default || module),

  [ROUTE_VIEW_KEYS.CUENTA]: () =>
    import("../views/cuenta/index.js").then((module) => module.CuentaView || module.default || module),

  [ROUTE_VIEW_KEYS.AJUSTES]: () =>
    import("../views/ajustes/index.js").then((module) => module.AjustesView || module.default || module),

  [ROUTE_VIEW_KEYS.SERVIDOR]: () =>
    import("../views/server/index.js").then((module) => module.ServerView || module.default || module),

  [ROUTE_VIEW_KEYS.LOGIN]: () =>
    import("../views/login/index.js").then((module) => module.LoginView || module.default || module),

  [ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT]: () =>
    import("../views/activate-account/index.js").then((module) => module.ActivateAccountView || module.default || module),

  [ROUTE_VIEW_KEYS.PASSWORD_REQUEST]: () =>
    import("../views/password-reset/index.js").then((module) => module.PasswordResetView || module.ResetPasswordView || module.default || module),

  [ROUTE_VIEW_KEYS.PASSWORD_RESET]: () =>
    import("../views/password-reset/index.js").then((module) => module.PasswordResetView || module.ResetPasswordView || module.default || module),
});

const VIEW_CACHE = new Map();

/* =========================================================
   BASIC HELPERS
========================================================= */

function safeText(value, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function safeNumber(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isPromiseLike(value) {
  return Boolean(value && (typeof value === "object" || typeof value === "function") && isFunction(value.then));
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).flat().map((item) => safeText(item, "")).filter(Boolean))];
}

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  return raw.replace(/^#\/?/, "/") || "/";
}

function pathFromUrlLike(value = "/") {
  const raw = safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, "http://localhost");

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

function stripQueryHash(path = "/") {
  return safeText(pathFromUrlLike(path), "/").split("#")[0].split("?")[0] || "/";
}

function normalizePathname(path = "/") {
  let clean = stripQueryHash(path).replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  if (!clean.startsWith("/")) clean = `/${clean}`;
  if (clean.length > 1) clean = clean.replace(/\/+$/g, "") || "/";

  return clean || "/";
}

function normalizeLookupPath(path = "/") {
  return normalizePathname(path);
}

function normalizeLiteralPath(path = "/") {
  return normalizePathname(path);
}

function normalizeName(value = "route") {
  return safeText(value, "route")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96) || "route";
}

function normalizeViewKey(value = "view") {
  return safeText(value, "view")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96) || "view";
}

function normalizeViewName(value = "View") {
  return safeText(value, "View").replace(/\s+/g, "").slice(0, 128) || "View";
}

function normalizeRoles(roles = []) {
  return unique(roles).filter((role) => role === "admin" || role === "user");
}

/* =========================================================
   VIEW ADAPTERS
========================================================= */

function isNode(value) {
  try {
    return Boolean(typeof Node !== "undefined" && value instanceof Node);
  } catch {
    return Boolean(value && typeof value.nodeType === "number");
  }
}

async function loadView(viewKey = "") {
  const key = normalizeViewKey(viewKey);
  const loader = VIEW_LOADERS[key];

  if (!loader) {
    throw new Error(`Router: view loader no encontrado "${key}".`);
  }

  if (!VIEW_CACHE.has(key)) {
    VIEW_CACHE.set(key, Promise.resolve().then(loader));
  }

  return VIEW_CACHE.get(key);
}

function getViewRenderer(view) {
  if (isFunction(view)) return view;
  if (isFunction(view?.init)) return view.init.bind(view);
  if (isFunction(view?.mount)) return view.mount.bind(view);
  if (isFunction(view?.render)) return view.render.bind(view);
  if (isFunction(view?.bootstrap)) return view.bootstrap.bind(view);

  return () => null;
}

function normalizeContext(renderTarget = null, context = {}, meta = {}) {
  const ctx = isObject(context) ? context : {};
  const target = isNode(renderTarget)
    ? renderTarget
    : ctx.renderRoot || ctx.renderHost || ctx.viewContainer || null;

  return {
    ...ctx,

    viewKey: ctx.viewKey || meta.viewKey,
    viewName: ctx.viewName || meta.viewName,
    routeViewKey: meta.viewKey,
    routeViewName: meta.viewName,

    renderRoot: target || ctx.renderRoot || null,
    renderHost: target || ctx.renderHost || null,
    viewContainer: ctx.viewContainer || target || null,
  };
}

function markTarget(target, meta = {}) {
  if (!target || !isNode(target)) return false;

  try {
    target.setAttribute("data-route-view-key", meta.viewKey || "");
    target.setAttribute("data-route-view-name", meta.viewName || "");
    target.setAttribute("data-route-source", ROUTE_SOURCE);
    return true;
  } catch {
    return false;
  }
}

function createViewAdapter({ viewKey, viewName } = {}) {
  const finalViewKey = normalizeViewKey(viewKey);
  const finalViewName = normalizeViewName(viewName || finalViewKey);

  async function adapter(renderTarget = null, context = {}) {
    const ctx = normalizeContext(renderTarget, context, {
      viewKey: finalViewKey,
      viewName: finalViewName,
    });

    markTarget(ctx.renderRoot, {
      viewKey: finalViewKey,
      viewName: finalViewName,
    });

    const view = await loadView(finalViewKey);
    const render = getViewRenderer(view);
    const result = render(ctx.renderRoot, ctx);

    return result === undefined && isObject(view) ? view : result;
  }

  Object.defineProperties(adapter, {
    routeViewKey: { value: finalViewKey, enumerable: true },
    routeViewName: { value: finalViewName, enumerable: true },
    routeViewKind: { value: "lazy", enumerable: true },
    routeSource: { value: ROUTE_SOURCE, enumerable: true },
  });

  return adapter;
}

function safeRender(fn, meta = {}) {
  function wrapped(...args) {
    try {
      const result = fn(...args);

      if (isPromiseLike(result)) {
        return result.catch((error) => {
          console.warn("[RouterRoutes] Render error:", meta.path, error);
          throw error;
        });
      }

      return result;
    } catch (error) {
      console.warn("[RouterRoutes] Render error:", meta.path, error);
      throw error;
    }
  }

  Object.defineProperties(wrapped, {
    routeViewKey: { value: meta.viewKey, enumerable: true },
    routeViewName: { value: meta.viewName, enumerable: true },
    routeViewKind: { value: fn.routeViewKind || "", enumerable: true },
    routeSource: { value: ROUTE_SOURCE, enumerable: true },
  });

  return wrapped;
}

/* =========================================================
   ROUTE FACTORY
========================================================= */

const renderHome = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.HOME, viewName: ROUTE_VIEW_NAMES.HOME });
const renderIncidencias = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS, viewName: ROUTE_VIEW_NAMES.INCIDENCIAS });
const renderFacturas = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.FACTURAS, viewName: ROUTE_VIEW_NAMES.FACTURAS });
const renderUsuarios = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.USUARIOS, viewName: ROUTE_VIEW_NAMES.USUARIOS });
const renderClientes = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.CLIENTES, viewName: ROUTE_VIEW_NAMES.CLIENTES });
const renderCuenta = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.CUENTA, viewName: ROUTE_VIEW_NAMES.CUENTA });
const renderAjustes = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.AJUSTES, viewName: ROUTE_VIEW_NAMES.AJUSTES });
const renderServidor = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.SERVIDOR, viewName: ROUTE_VIEW_NAMES.SERVIDOR });
const renderLogin = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.LOGIN, viewName: ROUTE_VIEW_NAMES.LOGIN });
const renderActivateAccount = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT, viewName: ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT });
const renderPasswordRequest = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.PASSWORD_REQUEST, viewName: ROUTE_VIEW_NAMES.PASSWORD_REQUEST });
const renderPasswordReset = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.PASSWORD_RESET, viewName: ROUTE_VIEW_NAMES.PASSWORD_RESET });

function buildRouteId(path, name) {
  const slug = path === "/" ? "root" : path.replace(/^\//, "").replace(/\//g, "_");
  return `${name}:${slug}`;
}

function createRoute({
  path,
  name,
  viewKey,
  viewName,
  title,
  render,
  public: isPublic = false,
  roles = [],
  order = 0,
  guestOnly = false,
  tokenRoute = false,
} = {}) {
  const finalPath = normalizeLiteralPath(path);
  const finalName = normalizeName(name);
  const finalViewKey = normalizeViewKey(viewKey || finalName);
  const finalViewName = normalizeViewName(viewName || finalViewKey);
  const finalRoles = freeze(normalizeRoles(roles));
  const finalPublic = Boolean(isPublic);
  const finalTokenRoute = Boolean(tokenRoute || TOKEN_ROUTE_SET.has(finalPath));
  const hideShell = finalPublic;

  const route = {
    id: buildRouteId(finalPath, finalName),
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,

    path: finalPath,
    canonicalPath: finalPath,

    name: finalName,
    viewKey: finalViewKey,
    viewName: finalViewName,
    sidebarKey: finalViewKey,

    title: safeText(title, finalName),

    public: finalPublic,
    private: !finalPublic,
    requiresAuth: !finalPublic,

    guestOnly: Boolean(guestOnly),
    publicOnly: Boolean(guestOnly),

    roles: finalRoles,

    hideShell,
    shell: !hideShell,
    showShell: !hideShell,
    layout: hideShell ? "auth" : "app",
    authScreen: hideShell,

    routeGroup: finalPublic ? "auth" : "app",

    tokenRoute: finalTokenRoute,
    preserveSearch: finalTokenRoute || finalPublic,
    preserveHash: finalTokenRoute || finalPublic,

    order: safeNumber(order, 0),

    aliases: freeze([]),

    render: safeRender(render || (() => null), {
      path: finalPath,
      viewKey: finalViewKey,
      viewName: finalViewName,
    }),
  };

  route.meta = freeze({
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,

    path: route.path,
    canonicalPath: route.canonicalPath,

    public: route.public,
    private: route.private,
    requiresAuth: route.requiresAuth,

    guestOnly: route.guestOnly,
    publicOnly: route.publicOnly,

    roles: route.roles,

    hideShell: route.hideShell,
    shell: route.shell,
    showShell: route.showShell,
    layout: route.layout,
    authScreen: route.authScreen,

    viewKey: route.viewKey,
    viewName: route.viewName,
    sidebarKey: route.sidebarKey,

    routeGroup: route.routeGroup,

    tokenRoute: route.tokenRoute,
    preserveSearch: route.preserveSearch,
    preserveHash: route.preserveHash,

    order: route.order,
  });

  return freeze(route);
}

function privateRoute(config = {}) {
  return createRoute({
    public: false,
    roles: [],
    ...config,
  });
}

function adminRoute(config = {}) {
  return privateRoute({
    roles: ADMIN_ROLES,
    ...config,
  });
}

function publicRoute(config = {}) {
  return createRoute({
    public: true,
    roles: [],
    ...config,
  });
}

/* =========================================================
   ROUTES
========================================================= */

export function createRoutes() {
  return [
    privateRoute({
      path: ROUTE_PATHS.HOME,
      name: ROUTE_NAMES.HOME,
      viewKey: ROUTE_VIEW_KEYS.HOME,
      viewName: ROUTE_VIEW_NAMES.HOME,
      title: "Inicio",
      order: 10,
      render: renderHome,
    }),

    privateRoute({
      path: ROUTE_PATHS.INCIDENCIAS,
      name: ROUTE_NAMES.INCIDENCIAS,
      viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS,
      viewName: ROUTE_VIEW_NAMES.INCIDENCIAS,
      title: "Incidencias",
      order: 20,
      render: renderIncidencias,
    }),

    privateRoute({
      path: ROUTE_PATHS.FACTURAS,
      name: ROUTE_NAMES.FACTURAS,
      viewKey: ROUTE_VIEW_KEYS.FACTURAS,
      viewName: ROUTE_VIEW_NAMES.FACTURAS,
      title: "Facturas",
      order: 30,
      render: renderFacturas,
    }),

    adminRoute({
      path: ROUTE_PATHS.USUARIOS,
      name: ROUTE_NAMES.USUARIOS,
      viewKey: ROUTE_VIEW_KEYS.USUARIOS,
      viewName: ROUTE_VIEW_NAMES.USUARIOS,
      title: "Usuarios",
      order: 40,
      render: renderUsuarios,
    }),

    adminRoute({
      path: ROUTE_PATHS.CLIENTES,
      name: ROUTE_NAMES.CLIENTES,
      viewKey: ROUTE_VIEW_KEYS.CLIENTES,
      viewName: ROUTE_VIEW_NAMES.CLIENTES,
      title: "Clientes",
      order: 50,
      render: renderClientes,
    }),

    privateRoute({
      path: ROUTE_PATHS.CUENTA,
      name: ROUTE_NAMES.CUENTA,
      viewKey: ROUTE_VIEW_KEYS.CUENTA,
      viewName: ROUTE_VIEW_NAMES.CUENTA,
      title: "Cuenta",
      order: 60,
      render: renderCuenta,
    }),

    privateRoute({
      path: ROUTE_PATHS.AJUSTES,
      name: ROUTE_NAMES.AJUSTES,
      viewKey: ROUTE_VIEW_KEYS.AJUSTES,
      viewName: ROUTE_VIEW_NAMES.AJUSTES,
      title: "Ajustes",
      order: 70,
      render: renderAjustes,
    }),

    adminRoute({
      path: ROUTE_PATHS.SERVIDOR,
      name: ROUTE_NAMES.SERVIDOR,
      viewKey: ROUTE_VIEW_KEYS.SERVIDOR,
      viewName: ROUTE_VIEW_NAMES.SERVIDOR,
      title: "Servidor",
      order: 80,
      render: renderServidor,
    }),

    publicRoute({
      path: ROUTE_PATHS.LOGIN,
      name: ROUTE_NAMES.LOGIN,
      viewKey: ROUTE_VIEW_KEYS.LOGIN,
      viewName: ROUTE_VIEW_NAMES.LOGIN,
      title: "Acceso",
      guestOnly: true,
      order: 1000,
      render: renderLogin,
    }),

    publicRoute({
      path: ROUTE_PATHS.ACTIVATE_ACCOUNT,
      name: ROUTE_NAMES.ACTIVATE_ACCOUNT,
      viewKey: ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT,
      viewName: ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT,
      title: "Activar cuenta",
      tokenRoute: true,
      order: 1010,
      render: renderActivateAccount,
    }),

    publicRoute({
      path: ROUTE_PATHS.PASSWORD_REQUEST,
      name: ROUTE_NAMES.PASSWORD_REQUEST,
      viewKey: ROUTE_VIEW_KEYS.PASSWORD_REQUEST,
      viewName: ROUTE_VIEW_NAMES.PASSWORD_REQUEST,
      title: "Recuperar acceso",
      order: 1020,
      render: renderPasswordRequest,
    }),

    publicRoute({
      path: ROUTE_PATHS.PASSWORD_RESET,
      name: ROUTE_NAMES.PASSWORD_RESET,
      viewKey: ROUTE_VIEW_KEYS.PASSWORD_RESET,
      viewName: ROUTE_VIEW_NAMES.PASSWORD_RESET,
      title: "Nueva contraseña",
      tokenRoute: true,
      order: 1030,
      render: renderPasswordReset,
    }),
  ].sort((left, right) => {
    return safeNumber(left.order) - safeNumber(right.order) || left.path.localeCompare(right.path);
  });
}

/* =========================================================
   CACHE
========================================================= */

let ROUTES_CACHE = null;

export function getImmutableRoutes() {
  if (ROUTES_CACHE) return ROUTES_CACHE;

  ROUTES_CACHE = freeze(createRoutes().map((route) => freeze(route)));

  return ROUTES_CACHE;
}

export function resetRoutesCacheForTests() {
  ROUTES_CACHE = null;
  VIEW_CACHE.clear();
  return true;
}

/* =========================================================
   VALIDATION
========================================================= */

function validateRoute(route, seenPaths, seenNames) {
  if (!isObject(route)) throw new Error("Router: ruta inválida.");

  const path = normalizeLiteralPath(route.path);

  if (route.path !== path) throw new Error(`Router: path no normalizado "${route.path}".`);
  if (path.includes("?") || path.includes("#")) throw new Error(`Router: ruta con query/hash "${path}".`);
  if (seenPaths.has(path)) throw new Error(`Router: ruta duplicada "${path}".`);
  if (!route.name || seenNames.has(route.name)) throw new Error(`Router: name inválido o duplicado en "${path}".`);
  if (!route.viewKey || !route.viewName) throw new Error(`Router: viewKey/viewName inválido en "${path}".`);
  if (!isFunction(route.render)) throw new Error(`Router: "${path}" no tiene render().`);
  if (!Array.isArray(route.roles)) throw new Error(`Router: roles inválidos en "${path}".`);
  if (route.roles.some((role) => role !== "admin" && role !== "user")) throw new Error(`Router: rol no soportado en "${path}".`);
  if (typeof route.public !== "boolean" || typeof route.requiresAuth !== "boolean") throw new Error(`Router: flags auth inválidos en "${path}".`);
  if (route.public && route.requiresAuth) throw new Error(`Router: ruta pública requiere auth en "${path}".`);
  if (!route.public && !route.requiresAuth) throw new Error(`Router: ruta privada sin auth en "${path}".`);
  if (route.public && route.roles.length) throw new Error(`Router: ruta pública con roles en "${path}".`);

  seenPaths.add(path);
  seenNames.add(route.name);
}

export function validateRoutesTable(_AppCore, routes = getImmutableRoutes()) {
  if (!Array.isArray(routes)) throw new Error("Router: tabla de rutas inválida.");

  const seenPaths = new Set();
  const seenNames = new Set();

  for (const route of routes) {
    validateRoute(route, seenPaths, seenNames);
  }

  for (const path of Object.values(ROUTE_PATHS)) {
    if (!seenPaths.has(normalizeLiteralPath(path))) {
      throw new Error(`Router: falta ruta "${path}".`);
    }
  }

  return true;
}

/* =========================================================
   LOOKUPS
========================================================= */

export function resolveRouteAlias(path = "/") {
  return normalizeLookupPath(path);
}

export function getRouteByPath(path = "/") {
  const lookupPath = normalizeLookupPath(path);
  return getImmutableRoutes().find((route) => route.path === lookupPath) || null;
}

export function getRouteByName(name = "") {
  const clean = normalizeName(name);
  return getImmutableRoutes().find((route) => route.name === clean) || null;
}

export function getRouteByViewKey(viewKey = "") {
  const clean = normalizeViewKey(viewKey);
  return getImmutableRoutes().find((route) => route.viewKey === clean) || null;
}

export function isPublicAuthPath(path = "/") {
  return PUBLIC_AUTH_ROUTE_SET.has(normalizeLookupPath(path));
}

export function isTokenPublicRoutePath(path = "/") {
  return TOKEN_ROUTE_SET.has(normalizeLookupPath(path));
}

export function isPrivateRoutePath(path = "/") {
  const route = getRouteByPath(path);
  return Boolean(route && route.public === false && route.requiresAuth === true);
}

/* =========================================================
   SNAPSHOTS
========================================================= */

function serializeRoute(route) {
  return {
    id: route.id,
    path: route.path,
    canonicalPath: route.canonicalPath,
    name: route.name,
    viewKey: route.viewKey,
    viewName: route.viewName,
    title: route.title,

    public: route.public,
    private: route.private,
    requiresAuth: route.requiresAuth,
    guestOnly: route.guestOnly,

    roles: route.roles,

    hideShell: route.hideShell,
    shell: route.shell,
    layout: route.layout,

    tokenRoute: route.tokenRoute,
    preserveSearch: route.preserveSearch,
    preserveHash: route.preserveHash,

    order: route.order,
  };
}

export function getRoutesSnapshot() {
  return getImmutableRoutes().map(serializeRoute);
}

export function getRouteDebug(path = "/") {
  const route = getRouteByPath(path);

  return {
    found: Boolean(route),
    input: path,
    lookupPath: normalizeLookupPath(path),
    route: route ? serializeRoute(route) : null,
  };
}

export function getCriticalRoutesDebug() {
  return Object.values(ROUTE_PATHS).map((path) => {
    const route = getRouteByPath(path);

    return {
      path,
      found: Boolean(route),
      route: route ? serializeRoute(route) : null,
    };
  });
}

export function getRoutesIntegritySnapshot() {
  const routes = getImmutableRoutes();

  let validationOk = false;
  let validationError = null;

  try {
    validateRoutesTable(null, routes);
    validationOk = true;
  } catch (error) {
    validationError = {
      name: error?.name || "Error",
      message: error?.message || String(error),
    };
  }

  return {
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,

    validationOk,
    validationError,

    count: routes.length,
    paths: routes.map((route) => route.path),

    publicAuthRoutes: [...PUBLIC_AUTH_ROUTES],
    tokenRoutePaths: [...TOKEN_ROUTE_PATHS],
    aliases: ROUTE_ALIASES,

    critical: getCriticalRoutesDebug(),
    loadedViews: [...VIEW_CACHE.keys()],

    policy: {
      staticRoutesOnly: true,
      lazyViews: true,
      ownAuth: false,
      ownGuards: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
      roles: [...VALID_ROLES],
      noLegacyRoutes: true,
      no2fa: true,
      no403: true,
      no404: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTES_VERSION,

  ROUTE_PATHS,
  ROUTE_NAMES,
  ROUTE_VIEW_KEYS,
  ROUTE_VIEW_NAMES,
  ROUTE_ALIASES,

  ADMIN_ROLES,
  VALID_ROLES,

  PUBLIC_AUTH_ROUTES,
  TOKEN_ROUTE_PATHS,

  createRoutes,
  getImmutableRoutes,
  resetRoutesCacheForTests,
  validateRoutesTable,

  resolveRouteAlias,
  getRouteByPath,
  getRouteByName,
  getRouteByViewKey,

  isPublicAuthPath,
  isTokenPublicRoutePath,
  isPrivateRoutePath,

  getRoutesSnapshot,
  getRouteDebug,
  getCriticalRoutesDebug,
  getRoutesIntegritySnapshot,
};

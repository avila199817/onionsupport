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
   - Sin magia negra.
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
   AUTH CONTRACT
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
   BASICS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function number(value = 0, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function unique(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values])
        .flat()
        .map((item) => text(item, ""))
        .filter(Boolean)
    ),
  ];
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

function normalizeHashPath(value = "") {
  const raw = text(value, "/");

  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  if (raw.startsWith("#/")) return raw.slice(1) || "/";

  return raw;
}

function pathFromInput(value = "/") {
  let raw = normalizeHashPath(value);

  try {
    const parsed = new URL(raw, "http://localhost");

    if (parsed.hash.startsWith("#/") || parsed.hash.startsWith("#!")) {
      return normalizeHashPath(parsed.hash);
    }

    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

function normalizePath(path = "/") {
  let clean = text(pathFromInput(path), "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!clean.startsWith("/")) clean = `/${clean}`;
  if (clean.length > 1) clean = clean.replace(/\/+$/g, "") || "/";

  return clean || "/";
}

function normalizeName(value = "route") {
  return text(value, "route")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96) || "route";
}

function normalizeViewKey(value = "view") {
  return text(value, "view")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96) || "view";
}

function normalizeViewName(value = "View") {
  return text(value, "View")
    .replace(/\s+/g, "")
    .slice(0, 128) || "View";
}

function normalizeRoles(roles = []) {
  return unique(roles).filter((role) => VALID_ROLES.includes(role));
}

/* =========================================================
   VIEW LOADERS
========================================================= */

function pickView(module, names = []) {
  for (const name of names) {
    if (module?.[name]) return module[name];
  }

  return module?.default || module;
}

const VIEW_LOADERS = Object.freeze({
  [ROUTE_VIEW_KEYS.HOME]: () =>
    import("../views/home/index.js").then((module) => pickView(module, ["HomeView"])),

  [ROUTE_VIEW_KEYS.INCIDENCIAS]: () =>
    import("../views/incidencias/index.js").then((module) => pickView(module, ["IncidenciasView"])),

  [ROUTE_VIEW_KEYS.FACTURAS]: () =>
    import("../views/facturas/index.js").then((module) => pickView(module, ["FacturasView"])),

  [ROUTE_VIEW_KEYS.USUARIOS]: () =>
    import("../views/usuarios/index.js").then((module) => pickView(module, ["UsuariosView"])),

  [ROUTE_VIEW_KEYS.CLIENTES]: () =>
    import("../views/clientes/index.js").then((module) => pickView(module, ["ClientesView"])),

  [ROUTE_VIEW_KEYS.CUENTA]: () =>
    import("../views/cuenta/index.js").then((module) => pickView(module, ["CuentaView"])),

  [ROUTE_VIEW_KEYS.AJUSTES]: () =>
    import("../views/ajustes/index.js").then((module) => pickView(module, ["AjustesView"])),

  [ROUTE_VIEW_KEYS.SERVIDOR]: () =>
    import("../views/server/index.js").then((module) => pickView(module, ["ServerView"])),

  [ROUTE_VIEW_KEYS.LOGIN]: () =>
    import("../views/login/index.js").then((module) => pickView(module, ["LoginView"])),

  [ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT]: () =>
    import("../views/activate-account/index.js").then((module) => pickView(module, ["ActivateAccountView"])),

  [ROUTE_VIEW_KEYS.PASSWORD_RESET]: () =>
    import("../views/password-reset/index.js").then((module) =>
      pickView(module, ["PasswordResetView", "ResetPasswordView"])
    ),
});

const VIEW_CACHE = new Map();

async function loadView(viewKey = "") {
  const key = normalizeViewKey(viewKey);
  const loader = VIEW_LOADERS[key];

  if (!loader) {
    throw new Error(`Router: vista no encontrada "${key}".`);
  }

  if (!VIEW_CACHE.has(key)) {
    VIEW_CACHE.set(key, Promise.resolve().then(loader));
  }

  return VIEW_CACHE.get(key);
}

function resolveRenderer(view) {
  if (isFunction(view)) return view;
  if (isFunction(view?.render)) return view.render.bind(view);
  if (isFunction(view?.init)) return view.init.bind(view);
  if (isFunction(view?.mount)) return view.mount.bind(view);
  if (isFunction(view?.bootstrap)) return view.bootstrap.bind(view);

  return () => null;
}

function createLazyRender(viewKey = "", viewName = "") {
  const finalViewKey = normalizeViewKey(viewKey);
  const finalViewName = normalizeViewName(viewName || viewKey);

  async function render(root = null, context = {}) {
    const view = await loadView(finalViewKey);
    const renderer = resolveRenderer(view);

    const ctx = {
      ...(isObject(context) ? context : {}),

      viewKey: finalViewKey,
      viewName: finalViewName,
      routeViewKey: finalViewKey,
      routeViewName: finalViewName,

      renderRoot: root || context?.renderRoot || null,
      renderHost: root || context?.renderHost || null,
      viewContainer: context?.viewContainer || root || null,
    };

    if (root?.setAttribute) {
      try {
        root.setAttribute("data-route-view-key", finalViewKey);
        root.setAttribute("data-route-view-name", finalViewName);
        root.setAttribute("data-route-source", ROUTE_SOURCE);
      } catch {
        // noop
      }
    }

    const result = await renderer(ctx.renderRoot, ctx);

    return result === undefined && isObject(view) ? view : result;
  }

  Object.defineProperties(render, {
    routeViewKey: { value: finalViewKey, enumerable: true },
    routeViewName: { value: finalViewName, enumerable: true },
    routeViewKind: { value: "lazy", enumerable: true },
    routeSource: { value: ROUTE_SOURCE, enumerable: true },
  });

  return render;
}

/* =========================================================
   ROUTE FACTORY
========================================================= */

function routeId(path = "/", name = "route") {
  const slug = path === "/" ? "root" : path.replace(/^\//, "").replace(/\//g, "_");
  return `${name}:${slug}`;
}

function createRoute({
  path,
  name,
  viewKey,
  viewName,
  title,
  public: isPublic = false,
  roles = [],
  order = 0,
  guestOnly = false,
  tokenRoute = false,
} = {}) {
  const finalPath = normalizePath(path);
  const finalName = normalizeName(name);
  const finalViewKey = normalizeViewKey(viewKey || finalName);
  const finalViewName = normalizeViewName(viewName || finalViewKey);
  const finalRoles = freeze(normalizeRoles(roles));
  const finalPublic = Boolean(isPublic);
  const finalTokenRoute = Boolean(tokenRoute || TOKEN_ROUTE_SET.has(finalPath));
  const hideShell = finalPublic;

  const meta = freeze({
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,

    path: finalPath,
    canonicalPath: finalPath,

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

    viewKey: finalViewKey,
    viewName: finalViewName,
    sidebarKey: finalViewKey,

    routeGroup: finalPublic ? "auth" : "app",

    tokenRoute: finalTokenRoute,
    preserveSearch: finalPublic || finalTokenRoute,
    preserveHash: finalPublic || finalTokenRoute,

    order: number(order, 0),
  });

  return freeze({
    id: routeId(finalPath, finalName),
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,

    path: finalPath,
    canonicalPath: finalPath,

    name: finalName,
    viewKey: finalViewKey,
    viewName: finalViewName,
    sidebarKey: finalViewKey,

    title: text(title, finalName),

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
    preserveSearch: finalPublic || finalTokenRoute,
    preserveHash: finalPublic || finalTokenRoute,

    order: number(order, 0),

    aliases: freeze([]),

    meta,
    render: createLazyRender(finalViewKey, finalViewName),
  });
}

function privateRoute(config = {}) {
  return createRoute({
    ...config,
    public: false,
    roles: [],
  });
}

function adminRoute(config = {}) {
  return createRoute({
    ...config,
    public: false,
    roles: ADMIN_ROLES,
  });
}

function publicRoute(config = {}) {
  return createRoute({
    ...config,
    public: true,
    roles: [],
  });
}

/* =========================================================
   ROUTES
========================================================= */

const ROUTE_DEFINITIONS = Object.freeze([
  {
    kind: "private",
    path: ROUTE_PATHS.HOME,
    name: ROUTE_NAMES.HOME,
    viewKey: ROUTE_VIEW_KEYS.HOME,
    viewName: ROUTE_VIEW_NAMES.HOME,
    title: "Inicio",
    order: 10,
  },
  {
    kind: "private",
    path: ROUTE_PATHS.INCIDENCIAS,
    name: ROUTE_NAMES.INCIDENCIAS,
    viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS,
    viewName: ROUTE_VIEW_NAMES.INCIDENCIAS,
    title: "Incidencias",
    order: 20,
  },
  {
    kind: "private",
    path: ROUTE_PATHS.FACTURAS,
    name: ROUTE_NAMES.FACTURAS,
    viewKey: ROUTE_VIEW_KEYS.FACTURAS,
    viewName: ROUTE_VIEW_NAMES.FACTURAS,
    title: "Facturas",
    order: 30,
  },
  {
    kind: "admin",
    path: ROUTE_PATHS.USUARIOS,
    name: ROUTE_NAMES.USUARIOS,
    viewKey: ROUTE_VIEW_KEYS.USUARIOS,
    viewName: ROUTE_VIEW_NAMES.USUARIOS,
    title: "Usuarios",
    order: 40,
  },
  {
    kind: "admin",
    path: ROUTE_PATHS.CLIENTES,
    name: ROUTE_NAMES.CLIENTES,
    viewKey: ROUTE_VIEW_KEYS.CLIENTES,
    viewName: ROUTE_VIEW_NAMES.CLIENTES,
    title: "Clientes",
    order: 50,
  },
  {
    kind: "private",
    path: ROUTE_PATHS.CUENTA,
    name: ROUTE_NAMES.CUENTA,
    viewKey: ROUTE_VIEW_KEYS.CUENTA,
    viewName: ROUTE_VIEW_NAMES.CUENTA,
    title: "Cuenta",
    order: 60,
  },
  {
    kind: "private",
    path: ROUTE_PATHS.AJUSTES,
    name: ROUTE_NAMES.AJUSTES,
    viewKey: ROUTE_VIEW_KEYS.AJUSTES,
    viewName: ROUTE_VIEW_NAMES.AJUSTES,
    title: "Ajustes",
    order: 70,
  },
  {
    kind: "admin",
    path: ROUTE_PATHS.SERVIDOR,
    name: ROUTE_NAMES.SERVIDOR,
    viewKey: ROUTE_VIEW_KEYS.SERVIDOR,
    viewName: ROUTE_VIEW_NAMES.SERVIDOR,
    title: "Servidor",
    order: 80,
  },
  {
    kind: "public",
    path: ROUTE_PATHS.LOGIN,
    name: ROUTE_NAMES.LOGIN,
    viewKey: ROUTE_VIEW_KEYS.LOGIN,
    viewName: ROUTE_VIEW_NAMES.LOGIN,
    title: "Acceso",
    guestOnly: true,
    order: 1000,
  },
  {
    kind: "public",
    path: ROUTE_PATHS.ACTIVATE_ACCOUNT,
    name: ROUTE_NAMES.ACTIVATE_ACCOUNT,
    viewKey: ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT,
    viewName: ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT,
    title: "Activar cuenta",
    tokenRoute: true,
    order: 1010,
  },
  {
    kind: "public",
    path: ROUTE_PATHS.PASSWORD_REQUEST,
    name: ROUTE_NAMES.PASSWORD_REQUEST,
    viewKey: ROUTE_VIEW_KEYS.PASSWORD_REQUEST,
    viewName: ROUTE_VIEW_NAMES.PASSWORD_REQUEST,
    title: "Recuperar acceso",
    order: 1020,
  },
  {
    kind: "public",
    path: ROUTE_PATHS.PASSWORD_RESET,
    name: ROUTE_NAMES.PASSWORD_RESET,
    viewKey: ROUTE_VIEW_KEYS.PASSWORD_RESET,
    viewName: ROUTE_VIEW_NAMES.PASSWORD_RESET,
    title: "Nueva contraseña",
    tokenRoute: true,
    order: 1030,
  },
]);

export function createRoutes() {
  return ROUTE_DEFINITIONS
    .map((definition) => {
      if (definition.kind === "admin") return adminRoute(definition);
      if (definition.kind === "public") return publicRoute(definition);

      return privateRoute(definition);
    })
    .sort((left, right) => {
      return number(left.order) - number(right.order) || left.path.localeCompare(right.path);
    });
}

/* =========================================================
   CACHE
========================================================= */

let ROUTES_CACHE = null;

export function getImmutableRoutes() {
  if (!ROUTES_CACHE) {
    ROUTES_CACHE = freeze(createRoutes().map((route) => freeze(route)));
  }

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

  const path = normalizePath(route.path);

  if (route.path !== path) throw new Error(`Router: path no normalizado "${route.path}".`);
  if (path.includes("?") || path.includes("#")) throw new Error(`Router: ruta con query/hash "${path}".`);
  if (seenPaths.has(path)) throw new Error(`Router: ruta duplicada "${path}".`);
  if (!route.name || seenNames.has(route.name)) throw new Error(`Router: name inválido o duplicado en "${path}".`);
  if (!route.viewKey || !route.viewName) throw new Error(`Router: viewKey/viewName inválido en "${path}".`);
  if (!isFunction(route.render)) throw new Error(`Router: "${path}" no tiene render().`);
  if (!Array.isArray(route.roles)) throw new Error(`Router: roles inválidos en "${path}".`);

  if (route.roles.some((role) => !VALID_ROLES.includes(role))) {
    throw new Error(`Router: rol no soportado en "${path}".`);
  }

  if (typeof route.public !== "boolean" || typeof route.requiresAuth !== "boolean") {
    throw new Error(`Router: flags auth inválidos en "${path}".`);
  }

  if (route.public && route.requiresAuth) {
    throw new Error(`Router: ruta pública requiere auth en "${path}".`);
  }

  if (!route.public && !route.requiresAuth) {
    throw new Error(`Router: ruta privada sin auth en "${path}".`);
  }

  if (route.public && route.roles.length) {
    throw new Error(`Router: ruta pública con roles en "${path}".`);
  }

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
    if (!seenPaths.has(normalizePath(path))) {
      throw new Error(`Router: falta ruta "${path}".`);
    }
  }

  return true;
}

/* =========================================================
   LOOKUPS
========================================================= */

export function resolveRouteAlias(path = "/") {
  return normalizePath(path);
}

export function getRouteByPath(path = "/") {
  const lookupPath = normalizePath(path);
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
  return PUBLIC_AUTH_ROUTE_SET.has(normalizePath(path));
}

export function isTokenPublicRoutePath(path = "/") {
  return TOKEN_ROUTE_SET.has(normalizePath(path));
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
    lookupPath: normalizePath(path),
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

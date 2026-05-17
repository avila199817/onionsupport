/* =========================================================
   Onion SPA - Routes
   Archivo: src/router/routes.js

   ROUTES TABLE · SIMPLE
   - tabla estática de rutas SPA
   - vistas cargadas lazy al renderizar
   - roles reales: admin / user
   - rutas privadas sin rol = cualquier usuario autenticado
   - rutas admin = sólo admin
   - sin Auth, guards, history, fetch, storage, Toast ni navegación
========================================================= */

export const ROUTES_VERSION = "21.0.1-simple";

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
  RESET_PASSWORD: "/reset-password",
  RESET_PASSWORD_CONFIRM: "/reset-password/confirm",
  FORGOT_PASSWORD: "/forgot-password",
  RECOVER_PASSWORD: "/recover-password",
  PASSWORD_RESET: "/password-reset",

  TWO_FACTOR: "/2fa",
  OTP: "/otp",
  MFA: "/mfa",
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
  RESET_PASSWORD: "reset-password",
  RESET_PASSWORD_CONFIRM: "reset-password-confirm",
  FORGOT_PASSWORD: "forgot-password",
  RECOVER_PASSWORD: "recover-password",
  PASSWORD_RESET: "password-reset",

  TWO_FACTOR: "2fa",
  OTP: "otp",
  MFA: "mfa",
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
  RESET_PASSWORD: "reset-password",
  RESET_PASSWORD_CONFIRM: "reset-password-confirm",
  TWO_FACTOR: "2fa",
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
  RESET_PASSWORD: "ResetPasswordView",
  RESET_PASSWORD_CONFIRM: "ConfirmResetPasswordView",
  TWO_FACTOR: "TwoFactorView",
});

/* =========================================================
   AUTH / ALIASES
========================================================= */

export const ADMIN_ROLES = Object.freeze(["admin"]);
export const VALID_ROLES = Object.freeze(["admin", "user"]);

export const PUBLIC_AUTH_ROUTES = Object.freeze([
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
  ROUTE_PATHS.RESET_PASSWORD,
  ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  ROUTE_PATHS.FORGOT_PASSWORD,
  ROUTE_PATHS.RECOVER_PASSWORD,
  ROUTE_PATHS.PASSWORD_RESET,
  ROUTE_PATHS.TWO_FACTOR,
  ROUTE_PATHS.OTP,
  ROUTE_PATHS.MFA,
]);

export const TOKEN_ROUTE_PATHS = Object.freeze([
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
  ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  ROUTE_PATHS.TWO_FACTOR,
  ROUTE_PATHS.OTP,
  ROUTE_PATHS.MFA,
]);

const PUBLIC_AUTH_ROUTE_SET = new Set(PUBLIC_AUTH_ROUTES);
const TOKEN_ROUTE_SET = new Set(TOKEN_ROUTE_PATHS);

export const ROUTE_ALIASES = Object.freeze({
  "/home": ROUTE_PATHS.HOME,
  "/dashboard": ROUTE_PATHS.HOME,

  "/tickets": ROUTE_PATHS.INCIDENCIAS,
  "/ticket": ROUTE_PATHS.INCIDENCIAS,

  "/invoices": ROUTE_PATHS.FACTURAS,
  "/billing": ROUTE_PATHS.FACTURAS,

  "/users": ROUTE_PATHS.USUARIOS,
  "/clients": ROUTE_PATHS.CLIENTES,

  "/account": ROUTE_PATHS.CUENTA,
  "/profile": ROUTE_PATHS.CUENTA,

  "/settings": ROUTE_PATHS.AJUSTES,
  "/server": ROUTE_PATHS.SERVIDOR,

  "/signin": ROUTE_PATHS.LOGIN,
  "/sign-in": ROUTE_PATHS.LOGIN,
  "/auth": ROUTE_PATHS.LOGIN,
  "/auth/login": ROUTE_PATHS.LOGIN,

  "/activate": ROUTE_PATHS.ACTIVATE_ACCOUNT,
  "/activation": ROUTE_PATHS.ACTIVATE_ACCOUNT,
  "/account/activate": ROUTE_PATHS.ACTIVATE_ACCOUNT,
  "/activate/first-user": ROUTE_PATHS.ACTIVATE_ACCOUNT,

  "/recover": ROUTE_PATHS.RECOVER_PASSWORD,
  "/password-reset/confirm": ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  "/reset-password-confirm": ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  "/password-reset-confirm": ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  "/confirm-reset-password": ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
});

/* =========================================================
   VIEW LOADERS · LAZY
========================================================= */

const VIEW_LOADERS = Object.freeze({
  [ROUTE_VIEW_KEYS.HOME]: () => import("../views/home/index.js").then((module) => module.HomeView || module.default || module),
  [ROUTE_VIEW_KEYS.INCIDENCIAS]: () => import("../views/incidencias/index.js").then((module) => module.IncidenciasView || module.default || module),
  [ROUTE_VIEW_KEYS.FACTURAS]: () => import("../views/facturas/index.js").then((module) => module.FacturasView || module.default || module),
  [ROUTE_VIEW_KEYS.USUARIOS]: () => import("../views/usuarios/index.js").then((module) => module.UsuariosView || module.default || module),
  [ROUTE_VIEW_KEYS.CLIENTES]: () => import("../views/clientes/index.js").then((module) => module.ClientesView || module.default || module),
  [ROUTE_VIEW_KEYS.CUENTA]: () => import("../views/cuenta/index.js").then((module) => module.CuentaView || module.default || module),
  [ROUTE_VIEW_KEYS.AJUSTES]: () => import("../views/ajustes/index.js").then((module) => module.AjustesView || module.default || module),
  [ROUTE_VIEW_KEYS.SERVIDOR]: () => import("../views/server/index.js").then((module) => module.ServerView || module.default || module),

  [ROUTE_VIEW_KEYS.LOGIN]: () => import("../views/login/index.js").then((module) => module.LoginView || module.default || module),
  [ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT]: () => import("../views/activate-account/index.js").then((module) => module.ActivateAccountView || module.default || module),
  [ROUTE_VIEW_KEYS.RESET_PASSWORD]: () => import("../views/password-reset/index.js").then((module) => module.ResetPasswordView || module.default || module),
  [ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM]: () => import("../views/password-reset/confirm/index.js").then((module) => module.ConfirmResetPasswordView || module.default || module),
  [ROUTE_VIEW_KEYS.TWO_FACTOR]: () => import("../views/login/index.js").then((module) => module.LoginView || module.default || module),
});

const VIEW_CACHE = new Map();

/* =========================================================
   BASIC HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFn(value) {
  return typeof value === "function";
}

function isPromiseLike(value) {
  return Boolean(value && (typeof value === "object" || typeof value === "function") && isFn(value.then));
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(toArray(values).flat(Infinity).map((item) => safeText(item, "")).filter(Boolean))];
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || (typeof value !== "object" && typeof value !== "function") || Object.isFrozen(value)) return value;

  try {
    if (seen.has(value)) return value;
    seen.add(value);

    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key], seen);
    Object.freeze(value);
  } catch {}

  return value;
}

function warn(...args) {
  try {
    console.warn("[RouterRoutes]", ...args);
  } catch {}
}

function t(_key, fallback = "") {
  return safeText(fallback, "");
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

  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    const parsed = new URL(raw, "http://localhost");
    if (parsed.hash && isHashRouterPath(parsed.hash)) return normalizeHashRouterPath(parsed.hash);
    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw;
  }
}

function stripQueryHash(path = "/") {
  return safeText(pathFromUrlLike(path), "/").split("#")[0].split("?")[0] || "/";
}

function stripUsername(path = "/") {
  return stripQueryHash(path).replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
}

function normalizePathname(path = "/") {
  let clean = safeText(stripUsername(path), "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  if (!clean.startsWith("/")) clean = `/${clean}`;

  const parts = [];

  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  clean = `/${parts.join("/")}`;
  if (clean.length > 1) clean = clean.replace(/\/+$/g, "") || "/";

  return clean || "/";
}

function collapseTokenRoute(path = "/") {
  const clean = normalizePathname(path);

  for (const tokenPath of TOKEN_ROUTE_PATHS) {
    if (clean === tokenPath || clean.startsWith(`${tokenPath}/`)) return tokenPath;
  }

  return clean;
}

function applyAlias(path = "/") {
  const clean = normalizePathname(path);

  if (ROUTE_ALIASES[clean]) return ROUTE_ALIASES[clean];

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (from !== "/" && clean.startsWith(`${from}/`)) return `${to}${clean.slice(from.length)}`;
  }

  return clean;
}

function normalizeLookupPath(path = "/") {
  return collapseTokenRoute(applyAlias(path));
}

function normalizeLiteralPath(path = "/") {
  return normalizePathname(path);
}

function normalizeName(name = "route") {
  return safeText(name, "route")
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

  if (!loader) throw new Error(`Router: view loader no encontrado "${key}".`);
  if (!VIEW_CACHE.has(key)) VIEW_CACHE.set(key, Promise.resolve().then(loader));

  return VIEW_CACHE.get(key);
}

function getViewRenderer(view) {
  if (isFn(view)) return { fn: view, kind: "function" };
  if (isFn(view?.init)) return { fn: view.init.bind(view), kind: "object.init" };
  if (isFn(view?.mount)) return { fn: view.mount.bind(view), kind: "object.mount" };
  if (isFn(view?.render)) return { fn: view.render.bind(view), kind: "object.render" };
  if (isFn(view?.bootstrap)) return { fn: view.bootstrap.bind(view), kind: "object.bootstrap" };

  return { fn: () => null, kind: "empty" };
}

function normalizeContext(renderTarget = null, context = {}, meta = {}) {
  const ctx = isObject(context) ? context : {};
  const target = isNode(renderTarget) ? renderTarget : ctx.renderRoot || ctx.renderHost || ctx.viewContainer || null;

  return {
    ...ctx,
    routeViewKey: meta.viewKey,
    routeViewName: meta.viewName,
    viewKey: ctx.viewKey || meta.viewKey,
    viewName: ctx.viewName || meta.viewName,
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
    target.setAttribute("data-route-render-source", ROUTE_SOURCE);
    return true;
  } catch {
    return false;
  }
}

function createViewAdapter({ viewKey, viewName } = {}) {
  const finalViewKey = normalizeViewKey(viewKey);
  const finalViewName = normalizeViewName(viewName || finalViewKey);

  async function adapter(renderTarget = null, context = {}) {
    const ctx = normalizeContext(renderTarget, context, { viewKey: finalViewKey, viewName: finalViewName });
    markTarget(ctx.renderRoot, { viewKey: finalViewKey, viewName: finalViewName });

    const view = await loadView(finalViewKey);
    const { fn } = getViewRenderer(view);
    const result = fn(ctx.renderRoot, ctx);

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
          warn("Render error", { path: meta.path, viewKey: meta.viewKey, viewName: meta.viewName, error });
          throw error;
        });
      }

      return result;
    } catch (error) {
      warn("Render error", { path: meta.path, viewKey: meta.viewKey, viewName: meta.viewName, error });
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
const renderResetPassword = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD });
const renderConfirmResetPassword = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD_CONFIRM });
const renderTwoFactor = createViewAdapter({ viewKey: ROUTE_VIEW_KEYS.TWO_FACTOR, viewName: ROUTE_VIEW_NAMES.TWO_FACTOR });

/* =========================================================
   ROUTE FACTORY
========================================================= */

function buildRouteId(path, name) {
  const slug = path === "/" ? "root" : path.replace(/^\//, "").replace(/\//g, "_");
  return `${name}:${slug}`;
}

function createRoute({
  path,
  name,
  viewKey,
  viewName,
  titleKey,
  titleFallback,
  render,
  public: isPublic = false,
  roles = [],
  order = 0,
  hideShell = false,
  layout = "",
  guestOnly = false,
  redirectAuthenticated = "",
  redirectForbidden = "",
  tokenRoute = false,
} = {}) {
  const finalPath = normalizeLiteralPath(path);
  const finalName = normalizeName(name);
  const finalViewKey = normalizeViewKey(viewKey || finalName);
  const finalViewName = normalizeViewName(viewName || finalViewKey);
  const finalRoles = Object.freeze(normalizeRoles(roles));
  const finalPublic = Boolean(isPublic);
  const finalHideShell = Boolean(hideShell || finalPublic);
  const finalRequiresAuth = !finalPublic;
  const finalTokenRoute = Boolean(tokenRoute || TOKEN_ROUTE_SET.has(finalPath));

  const finalRender = safeRender(render || (() => null), {
    path: finalPath,
    viewKey: finalViewKey,
    viewName: finalViewName,
  });

  const meta = deepFreeze({
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,
    path: finalPath,
    canonicalPath: finalPath,
    public: finalPublic,
    private: finalRequiresAuth,
    requiresAuth: finalRequiresAuth,
    guestOnly: Boolean(guestOnly),
    publicOnly: Boolean(guestOnly),
    roles: finalRoles,
    hideShell: finalHideShell,
    shell: !finalHideShell,
    showShell: !finalHideShell,
    layout: layout || (finalHideShell ? "auth" : "app"),
    authScreen: finalHideShell,
    viewKey: finalViewKey,
    viewName: finalViewName,
    sidebarKey: finalViewKey,
    routeGroup: finalPublic ? "auth" : "app",
    tokenRoute: finalTokenRoute,
    preserveSearch: finalTokenRoute || finalPublic,
    preserveHash: finalTokenRoute || finalPublic,
    order: safeNumber(order, 0),
  });

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
    titleKey: safeText(titleKey, ""),
    titleFallback: safeText(titleFallback, finalName),
    public: finalPublic,
    private: finalRequiresAuth,
    requiresAuth: finalRequiresAuth,
    guestOnly: Boolean(guestOnly),
    publicOnly: Boolean(guestOnly),
    roles: finalRoles,
    hideShell: finalHideShell,
    shell: !finalHideShell,
    showShell: !finalHideShell,
    layout: meta.layout,
    authScreen: meta.authScreen,
    routeGroup: meta.routeGroup,
    tokenRoute: meta.tokenRoute,
    preserveSearch: meta.preserveSearch,
    preserveHash: meta.preserveHash,
    order: meta.order,
    redirectAuthenticated: safeText(redirectAuthenticated, ""),
    redirectIfAuth: safeText(redirectAuthenticated, ""),
    redirectForbidden: safeText(redirectForbidden, ""),
    aliases: Object.freeze([]),
    render: finalRender,
    meta,
  };

  Object.defineProperty(route, "title", {
    enumerable: true,
    configurable: false,
    get() {
      return t(route.titleKey, route.titleFallback);
    },
  });

  return deepFreeze(route);
}

function privateRoute(config = {}) {
  return createRoute({ public: false, hideShell: false, layout: "app", roles: [], ...config });
}

function adminRoute(config = {}) {
  return privateRoute({ roles: ADMIN_ROLES, redirectForbidden: ROUTE_PATHS.HOME, ...config });
}

function publicAuthRoute(config = {}) {
  return createRoute({ public: true, hideShell: true, layout: "auth", roles: [], ...config });
}

/* =========================================================
   ROUTES
========================================================= */

export function createRoutes() {
  return [
    privateRoute({ path: ROUTE_PATHS.HOME, name: ROUTE_NAMES.HOME, viewKey: ROUTE_VIEW_KEYS.HOME, viewName: ROUTE_VIEW_NAMES.HOME, titleKey: "routes.home", titleFallback: "Inicio", order: 10, render: renderHome }),
    privateRoute({ path: ROUTE_PATHS.INCIDENCIAS, name: ROUTE_NAMES.INCIDENCIAS, viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS, viewName: ROUTE_VIEW_NAMES.INCIDENCIAS, titleKey: "routes.incidencias", titleFallback: "Incidencias", order: 20, render: renderIncidencias }),
    privateRoute({ path: ROUTE_PATHS.FACTURAS, name: ROUTE_NAMES.FACTURAS, viewKey: ROUTE_VIEW_KEYS.FACTURAS, viewName: ROUTE_VIEW_NAMES.FACTURAS, titleKey: "routes.facturas", titleFallback: "Facturas", order: 30, render: renderFacturas }),
    adminRoute({ path: ROUTE_PATHS.USUARIOS, name: ROUTE_NAMES.USUARIOS, viewKey: ROUTE_VIEW_KEYS.USUARIOS, viewName: ROUTE_VIEW_NAMES.USUARIOS, titleKey: "routes.usuarios", titleFallback: "Usuarios", order: 40, render: renderUsuarios }),
    adminRoute({ path: ROUTE_PATHS.CLIENTES, name: ROUTE_NAMES.CLIENTES, viewKey: ROUTE_VIEW_KEYS.CLIENTES, viewName: ROUTE_VIEW_NAMES.CLIENTES, titleKey: "routes.clientes", titleFallback: "Clientes", order: 50, render: renderClientes }),
    privateRoute({ path: ROUTE_PATHS.CUENTA, name: ROUTE_NAMES.CUENTA, viewKey: ROUTE_VIEW_KEYS.CUENTA, viewName: ROUTE_VIEW_NAMES.CUENTA, titleKey: "routes.cuenta", titleFallback: "Cuenta", order: 60, render: renderCuenta }),
    privateRoute({ path: ROUTE_PATHS.AJUSTES, name: ROUTE_NAMES.AJUSTES, viewKey: ROUTE_VIEW_KEYS.AJUSTES, viewName: ROUTE_VIEW_NAMES.AJUSTES, titleKey: "routes.ajustes", titleFallback: "Ajustes", order: 70, render: renderAjustes }),
    adminRoute({ path: ROUTE_PATHS.SERVIDOR, name: ROUTE_NAMES.SERVIDOR, viewKey: ROUTE_VIEW_KEYS.SERVIDOR, viewName: ROUTE_VIEW_NAMES.SERVIDOR, titleKey: "routes.servidor", titleFallback: "Servidor", order: 80, render: renderServidor }),

    publicAuthRoute({ path: ROUTE_PATHS.LOGIN, name: ROUTE_NAMES.LOGIN, viewKey: ROUTE_VIEW_KEYS.LOGIN, viewName: ROUTE_VIEW_NAMES.LOGIN, titleKey: "routes.login", titleFallback: "Acceso", guestOnly: true, redirectAuthenticated: ROUTE_PATHS.HOME, order: 1000, render: renderLogin }),
    publicAuthRoute({ path: ROUTE_PATHS.ACTIVATE_ACCOUNT, name: ROUTE_NAMES.ACTIVATE_ACCOUNT, viewKey: ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT, viewName: ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT, titleKey: "routes.activateAccount", titleFallback: "Activar cuenta", tokenRoute: true, order: 1010, render: renderActivateAccount }),
    publicAuthRoute({ path: ROUTE_PATHS.RESET_PASSWORD, name: ROUTE_NAMES.RESET_PASSWORD, viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD, titleKey: "routes.resetPassword", titleFallback: "Recuperar acceso", order: 1020, render: renderResetPassword }),
    publicAuthRoute({ path: ROUTE_PATHS.RESET_PASSWORD_CONFIRM, name: ROUTE_NAMES.RESET_PASSWORD_CONFIRM, viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD_CONFIRM, titleKey: "routes.resetPasswordConfirm", titleFallback: "Nueva contraseña", tokenRoute: true, order: 1030, render: renderConfirmResetPassword }),
    publicAuthRoute({ path: ROUTE_PATHS.FORGOT_PASSWORD, name: ROUTE_NAMES.FORGOT_PASSWORD, viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD, titleKey: "routes.forgotPassword", titleFallback: "Recuperar acceso", order: 1040, render: renderResetPassword }),
    publicAuthRoute({ path: ROUTE_PATHS.RECOVER_PASSWORD, name: ROUTE_NAMES.RECOVER_PASSWORD, viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD, titleKey: "routes.recoverPassword", titleFallback: "Recuperar acceso", order: 1050, render: renderResetPassword }),
    publicAuthRoute({ path: ROUTE_PATHS.PASSWORD_RESET, name: ROUTE_NAMES.PASSWORD_RESET, viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD, viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD, titleKey: "routes.passwordReset", titleFallback: "Recuperar acceso", order: 1060, render: renderResetPassword }),
    publicAuthRoute({ path: ROUTE_PATHS.TWO_FACTOR, name: ROUTE_NAMES.TWO_FACTOR, viewKey: ROUTE_VIEW_KEYS.TWO_FACTOR, viewName: ROUTE_VIEW_NAMES.TWO_FACTOR, titleKey: "routes.twoFactor", titleFallback: "Verificación", tokenRoute: true, order: 1070, render: renderTwoFactor }),
    publicAuthRoute({ path: ROUTE_PATHS.OTP, name: ROUTE_NAMES.OTP, viewKey: ROUTE_VIEW_KEYS.TWO_FACTOR, viewName: ROUTE_VIEW_NAMES.TWO_FACTOR, titleKey: "routes.otp", titleFallback: "Verificación", tokenRoute: true, order: 1080, render: renderTwoFactor }),
    publicAuthRoute({ path: ROUTE_PATHS.MFA, name: ROUTE_NAMES.MFA, viewKey: ROUTE_VIEW_KEYS.TWO_FACTOR, viewName: ROUTE_VIEW_NAMES.TWO_FACTOR, titleKey: "routes.mfa", titleFallback: "Verificación", tokenRoute: true, order: 1090, render: renderTwoFactor }),
  ].sort((a, b) => safeNumber(a.order) - safeNumber(b.order) || a.path.localeCompare(b.path));
}

/* =========================================================
   CACHE
========================================================= */

let ROUTES_CACHE = null;

export function getImmutableRoutes() {
  if (ROUTES_CACHE) return ROUTES_CACHE;
  ROUTES_CACHE = Object.freeze(createRoutes().map((route) => deepFreeze(route)));
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
  if (!isFn(route.render)) throw new Error(`Router: "${path}" no tiene render().`);
  if (route.render.routeViewKey !== route.viewKey) throw new Error(`Router: renderViewKey incorrecto en "${path}".`);
  if (route.render.routeViewName !== route.viewName) throw new Error(`Router: renderViewName incorrecto en "${path}".`);
  if (!Array.isArray(route.roles)) throw new Error(`Router: roles inválidos en "${path}".`);
  if (route.roles.some((role) => role !== "admin" && role !== "user")) throw new Error(`Router: rol no soportado en "${path}".`);
  if (typeof route.public !== "boolean" || typeof route.requiresAuth !== "boolean") throw new Error(`Router: flags auth inválidos en "${path}".`);
  if (route.public && route.requiresAuth) throw new Error(`Router: ruta pública requiere auth en "${path}".`);
  if (!route.public && !route.requiresAuth) throw new Error(`Router: ruta privada sin auth en "${path}".`);
  if (route.public && route.roles.length) throw new Error(`Router: ruta pública con roles en "${path}".`);
  if (PUBLIC_AUTH_ROUTE_SET.has(path) && route.hideShell !== true) throw new Error(`Router: ruta auth pública debe ocultar shell "${path}".`);
  if (route.meta?.path !== route.path || route.meta?.viewKey !== route.viewKey || route.meta?.viewName !== route.viewName) throw new Error(`Router: meta inconsistente en "${path}".`);

  seenPaths.add(path);
  seenNames.add(route.name);
}

export function validateRoutesTable(AppCore, routes, externalNormalizeCanonicalPath) {
  if (!Array.isArray(routes)) throw new Error("Router: tabla de rutas inválida.");

  const seenPaths = new Set();
  const seenNames = new Set();

  for (const route of routes) {
    validateRoute(route, seenPaths, seenNames);

    if (isFn(externalNormalizeCanonicalPath)) {
      try {
        const external = normalizeLookupPath(externalNormalizeCanonicalPath(AppCore, route.path));
        if (external && external !== route.path && external !== "/") warn("normalizeCanonicalPath externo difiere", { routePath: route.path, external });
      } catch {}
    }
  }

  for (const path of Object.values(ROUTE_PATHS)) {
    if (!seenPaths.has(normalizeLiteralPath(path))) throw new Error(`Router: falta ruta "${path}".`);
  }

  for (const path of PUBLIC_AUTH_ROUTES) {
    const route = routes.find((item) => item.path === path);
    if (!route || route.public !== true || route.requiresAuth !== false || route.hideShell !== true) throw new Error(`Router: ruta pública auth mal configurada "${path}".`);
  }

  for (const path of TOKEN_ROUTE_PATHS) {
    const route = routes.find((item) => item.path === path);
    if (!route || route.tokenRoute !== true || route.preserveSearch !== true || route.preserveHash !== true) throw new Error(`Router: ruta token mal configurada "${path}".`);
  }

  for (const [alias, target] of Object.entries(ROUTE_ALIASES)) {
    const cleanAlias = normalizeLiteralPath(alias);
    const cleanTarget = normalizeLookupPath(target);

    if (cleanAlias !== alias) throw new Error(`Router: alias no normalizado "${alias}".`);
    if (!seenPaths.has(cleanTarget)) throw new Error(`Router: alias "${alias}" apunta a ruta inexistente "${target}".`);
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
   DEBUG
========================================================= */

function serializeRoute(route) {
  return {
    id: route.id,
    version: route.version,
    source: route.source,
    path: route.path,
    canonicalPath: route.canonicalPath,
    aliases: route.aliases,
    name: route.name,
    viewKey: route.viewKey,
    viewName: route.viewName,
    sidebarKey: route.sidebarKey,
    renderViewKey: route.render?.routeViewKey || null,
    renderViewName: route.render?.routeViewName || null,
    renderViewKind: route.render?.routeViewKind || null,
    title: route.title,
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
    routeGroup: route.routeGroup,
    tokenRoute: route.tokenRoute,
    preserveSearch: route.preserveSearch,
    preserveHash: route.preserveHash,
    redirectAuthenticated: route.redirectAuthenticated || null,
    redirectForbidden: route.redirectForbidden || null,
    order: route.order,
    meta: route.meta,
  };
}

export function getRoutesSnapshot() {
  return getImmutableRoutes().map(serializeRoute);
}

export function getRouteDebug(path = "/") {
  const route = getRouteByPath(path);

  if (!route) {
    return {
      found: false,
      input: path,
      lookupPath: normalizeLookupPath(path),
      literalPath: normalizeLiteralPath(path),
      aliasResolvedPath: resolveRouteAlias(path),
      tokenRoute: isTokenPublicRoutePath(path),
    };
  }

  return {
    found: true,
    input: path,
    lookupPath: normalizeLookupPath(path),
    literalPath: normalizeLiteralPath(path),
    aliasResolvedPath: resolveRouteAlias(path),
    ...serializeRoute(route),
  };
}

export function getCriticalRoutesDebug() {
  return Object.values(ROUTE_PATHS).map((path) => {
    const route = getRouteByPath(path);
    return { path, found: Boolean(route), route: route ? serializeRoute(route) : null };
  });
}

export function getRoutesIntegritySnapshot() {
  const routes = getImmutableRoutes();

  let validationOk = false;
  let validationError = null;

  try {
    validateRoutesTable(null, routes, null);
    validationOk = true;
  } catch (error) {
    validationError = { name: error?.name || "Error", message: error?.message || String(error) };
  }

  return {
    version: ROUTES_VERSION,
    source: ROUTE_SOURCE,
    validationOk,
    validationError,
    count: routes.length,
    paths: routes.map((route) => route.path),
    publicAuthRoutes: PUBLIC_AUTH_ROUTES,
    tokenRoutePaths: TOKEN_ROUTE_PATHS,
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
      roles: VALID_ROLES,
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

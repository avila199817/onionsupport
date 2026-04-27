/* =========================================================
   Onion SPA - Routes
   Archivo: src/router/routes.js

   RESPONSABILIDADES:
   - definir la tabla de rutas canónicas de la SPA
   - encapsular adapters de render
   - exponer rutas inmutables
   - validar estructura mínima
   - resolver títulos reactivos vía i18n
   - mantener orden consistente con sidebar/router

   HARDENING EXTREMO:
   - lazy title getter
   - safe render wrappers sin convertir renders sync en async
   - validación extendida
   - metadata estable
   - soporte para vistas tipo objeto y vistas tipo función
   - integración de rutas auth públicas
   - priorizar init() sobre render() en vistas objeto
   - canonical paths estrictos
   - meta auth consistente con guards
   - soporte público para activación de cuenta
   - soporte público para reset password
   - aliases públicos forgot/recover/password-reset
   - rutas sin query/hash por definición
   - no toca history
   - no modifica search/hash
   - no destruye /activate-account?token=...
   - no destruye /activate-account/<token>
   - no destruye /reset-password/confirm?token=...
   - no destruye /reset-password/confirm/<token>
   - roles admin centralizados
   - Home real en /
========================================================= */

import { I18n } from "../i18n/index.js";

import { LoginView } from "../views/login/index.js";
import { ActivateAccountView } from "../views/activate-account/index.js";
import { ResetPasswordView } from "../views/password-reset/index.js";
import { ConfirmResetPasswordView } from "../views/password-reset/confirm/index.js";

import { HomeView } from "../views/home/index.js";
import { IncidenciasView } from "../views/incidencias/index.js";
import { FacturasView } from "../views/facturas/index.js";
import { ServerView } from "../views/server/index.js";
import { UsuariosView } from "../views/usuarios/index.js";
import { ClientesView } from "../views/clientes/index.js";
import { CuentaView } from "../views/cuenta/index.js";
import { AjustesView } from "../views/ajustes/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const ROUTE_SOURCE = "router:routes";

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
});

const PUBLIC_AUTH_ROUTES = Object.freeze([
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
  ROUTE_PATHS.RESET_PASSWORD,
  ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  ROUTE_PATHS.FORGOT_PASSWORD,
  ROUTE_PATHS.RECOVER_PASSWORD,
  ROUTE_PATHS.PASSWORD_RESET,
]);

const PUBLIC_AUTH_ROUTE_SET = new Set(PUBLIC_AUTH_ROUTES);

export const ADMIN_ROLES = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "super_administrador",
  "super-administrador",
  "owner",
  "root",
]);

/* =========================================================
   I18N
========================================================= */

function t(key, fallback = "", params = {}) {
  try {
    return I18n.t(key, params, fallback) || fallback || key;
  } catch {
    return fallback || key;
  }
}

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeError(...args) {
  try {
    console.error(...args);
  } catch {}
}

function isPromiseLike(value) {
  return Boolean(
    value &&
      (
        typeof value === "object" ||
        typeof value === "function"
      ) &&
      typeof value.then === "function"
  );
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function unique(values = []) {
  return Array.from(
    new Set(
      values.filter(Boolean)
    )
  );
}

function freezeArray(values = []) {
  return Object.freeze(
    unique(values)
  );
}

function normalizeRoleKey(role = "") {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(roles) {
  return unique(
    toArray(roles)
      .flat(Infinity)
      .map(normalizeRoleKey)
      .filter(Boolean)
  );
}

function stripQueryAndHash(path = "/") {
  const raw = safeText(path, "/");

  const withoutHash = raw.split("#")[0] || "/";
  const withoutSearch = withoutHash.split("?")[0] || "/";

  return withoutSearch || "/";
}

function normalizeRoutePath(path = "/") {
  const withoutQuery = stripQueryAndHash(path);

  const normalized = String(withoutQuery || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!normalized) {
    return "/";
  }

  const prefixed = normalized.startsWith("/")
    ? normalized
    : `/${normalized}`;

  if (prefixed.length > 1 && prefixed.endsWith("/")) {
    return prefixed.replace(/\/+$/g, "") || "/";
  }

  return prefixed;
}

function normalizeRouteName(name = "route") {
  return (
    String(name || "route")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._:-]/g, "") || "route"
  );
}

function buildRouteId({ path = "/", name = "route" } = {}) {
  const cleanPath =
    normalizeRoutePath(path)
      .replace(/^\//, "")
      .replace(/\//g, "_") || "root";

  return `${normalizeRouteName(name)}:${cleanPath}`;
}

/* =========================================================
   SAFE RENDER
========================================================= */

function safeRun(fn) {
  return function wrappedRouteRender(...args) {
    try {
      if (typeof fn !== "function") {
        return null;
      }

      const result = fn(...args);

      if (isPromiseLike(result)) {
        return result.catch((error) => {
          safeError("[Router Route Error]", error);
          throw error;
        });
      }

      return result;
    } catch (error) {
      safeError("[Router Route Error]", error);
      throw error;
    }
  };
}

function resolveViewRenderer(view) {
  if (typeof view === "function") {
    return view;
  }

  /*
    IMPORTANTE:
    Priorizamos init() antes que render().
    Vistas auth complejas suelen preparar listeners/estado en init().
  */
  if (view && typeof view.init === "function") {
    return view.init.bind(view);
  }

  if (view && typeof view.render === "function") {
    return view.render.bind(view);
  }

  if (view && typeof view.mount === "function") {
    return view.mount.bind(view);
  }

  return () => null;
}

function createViewAdapter(view) {
  const renderer = resolveViewRenderer(view);

  return (...args) => renderer(...args);
}

/* =========================================================
   META
========================================================= */

function normalizeMeta(definition = {}) {
  const normalizedPath = normalizeRoutePath(definition.path || "/");

  const publicRoute = definition.public === true;
  const isLoginRoute = normalizedPath === ROUTE_PATHS.LOGIN;
  const isPublicAuthRoute = PUBLIC_AUTH_ROUTE_SET.has(normalizedPath);

  const roles = freezeArray(
    normalizeRoles(definition.roles)
  );

  const hideShell = definition.hideShell === true;

  const layout =
    safeText(
      definition.layout,
      hideShell ? "auth" : "app"
    );

  const shell =
    hideShell ? false : true;

  const authScreen =
    definition.authScreen === true ||
    (
      publicRoute === true &&
      hideShell === true &&
      isPublicAuthRoute
    );

  const guestOnly =
    definition.guestOnly === true ||
    (
      publicRoute === true &&
      hideShell === true &&
      isLoginRoute === true
    );

  /*
    Regla central:
    - public true => no requiere auth
    - public false => requiere auth
    - roles => requiere auth sí o sí, salvo definición inválida public+roles,
      que se bloqueará en validateRoutesTable().
  */
  const requiresAuth =
    publicRoute === true
      ? false
      : true;

  return Object.freeze({
    order: Number(definition.order || 0),

    source:
      definition.source || ROUTE_SOURCE,

    requiresAuth,
    private: requiresAuth,

    public: publicRoute,
    publicAuth:
      publicRoute && isPublicAuthRoute,

    guestOnly,
    publicOnly: guestOnly,

    roles,
    allowRoles: roles,
    requireRoles: roles,

    hideShell,
    shell,
    showShell: !hideShell,

    layout,
    authScreen,
  });
}

function resolveRouteTitle(route) {
  if (!route) {
    return "";
  }

  return t(
    route.titleKey,
    route.titleFallback || route.name || ""
  );
}

/* =========================================================
   ROUTE FACTORY
========================================================= */

function createRoute(definition = {}) {
  const normalizedPath = normalizeRoutePath(definition.path || "/");
  const normalizedName = normalizeRouteName(definition.name || "route");

  const normalizedRoles = freezeArray(
    normalizeRoles(definition.roles)
  );

  const publicRoute = definition.public === true;
  const hideShell = definition.hideShell === true;

  const meta = normalizeMeta({
    ...definition,
    roles: normalizedRoles,
    public: publicRoute,
    path: normalizedPath,
    hideShell,
  });

  const route = {
    id: buildRouteId({
      path: normalizedPath,
      name: normalizedName,
    }),

    path: normalizedPath,
    canonicalPath: normalizedPath,
    name: normalizedName,

    titleKey: safeText(definition.titleKey, ""),
    titleFallback: safeText(definition.titleFallback, definition.name || ""),

    public: publicRoute,
    requiresAuth: meta.requiresAuth,
    private: meta.private,

    guestOnly: meta.guestOnly,
    publicOnly: meta.publicOnly,

    roles: normalizedRoles,
    allowRoles: normalizedRoles,

    hideShell,
    shell: meta.shell,
    showShell: meta.showShell,
    layout: meta.layout,
    authScreen: meta.authScreen,

    order: meta.order,

    redirectAuthenticated:
      safeText(definition.redirectAuthenticated, ""),

    redirectIfAuth:
      safeText(
        definition.redirectIfAuth ||
          definition.redirectAuthenticated,
        ""
      ),

    redirectForbidden:
      safeText(definition.redirectForbidden, ""),

    renderMode:
      safeText(definition.renderMode, ""),

    awaitRender:
      definition.awaitRender === true
        ? true
        : definition.awaitRender === false
          ? false
          : undefined,

    transitionView:
      definition.transitionView === false
        ? false
        : true,

    render: safeRun(definition.render || (() => null)),

    meta,
  };

  Object.defineProperty(route, "title", {
    enumerable: true,
    configurable: false,

    get() {
      return resolveRouteTitle(route);
    },
  });

  return Object.freeze(route);
}

/* =========================================================
   VIEW ADAPTERS
========================================================= */

const renderHomeView = createViewAdapter(HomeView);
const renderIncidenciasView = createViewAdapter(IncidenciasView);
const renderFacturasView = createViewAdapter(FacturasView);
const renderUsuariosView = createViewAdapter(UsuariosView);
const renderClientesView = createViewAdapter(ClientesView);
const renderCuentaView = createViewAdapter(CuentaView);
const renderAjustesView = createViewAdapter(AjustesView);
const renderServidorView = createViewAdapter(ServerView);

const renderLoginView = createViewAdapter(LoginView);
const renderActivateAccountView = createViewAdapter(ActivateAccountView);
const renderResetPasswordView = createViewAdapter(ResetPasswordView);
const renderConfirmResetPasswordView = createViewAdapter(ConfirmResetPasswordView);

/* =========================================================
   ROUTE DEFINITIONS
========================================================= */

function privateRoute(definition = {}) {
  return createRoute({
    public: false,
    roles: [],
    hideShell: false,
    layout: "app",
    ...definition,
  });
}

function adminRoute(definition = {}) {
  return privateRoute({
    roles: ADMIN_ROLES,
    redirectForbidden: ROUTE_PATHS.HOME,
    ...definition,
  });
}

function publicAuthRoute(definition = {}) {
  return createRoute({
    public: true,
    roles: [],
    hideShell: true,
    layout: "auth",
    authScreen: true,
    guestOnly: false,
    ...definition,
  });
}

/* =========================================================
   ROUTES FACTORY
========================================================= */

export function createRoutes() {
  return [
    privateRoute({
      path: ROUTE_PATHS.HOME,
      name: "home",
      titleKey: "routes.home",
      titleFallback: "Inicio",
      order: 10,
      render: renderHomeView,
    }),

    privateRoute({
      path: ROUTE_PATHS.INCIDENCIAS,
      name: "incidencias",
      titleKey: "routes.incidencias",
      titleFallback: "Incidencias",
      order: 20,
      render: renderIncidenciasView,
    }),

    privateRoute({
      path: ROUTE_PATHS.FACTURAS,
      name: "facturas",
      titleKey: "routes.facturas",
      titleFallback: "Facturas",
      order: 30,
      render: renderFacturasView,
    }),

    adminRoute({
      path: ROUTE_PATHS.USUARIOS,
      name: "usuarios",
      titleKey: "routes.usuarios",
      titleFallback: "Usuarios",
      order: 40,
      render: renderUsuariosView,
    }),

    adminRoute({
      path: ROUTE_PATHS.CLIENTES,
      name: "clientes",
      titleKey: "routes.clientes",
      titleFallback: "Clientes",
      order: 50,
      render: renderClientesView,
    }),

    privateRoute({
      path: ROUTE_PATHS.CUENTA,
      name: "cuenta",
      titleKey: "routes.cuenta",
      titleFallback: "Cuenta",
      order: 60,
      render: renderCuentaView,
    }),

    privateRoute({
      path: ROUTE_PATHS.AJUSTES,
      name: "ajustes",
      titleKey: "routes.ajustes",
      titleFallback: "Ajustes",
      order: 70,
      render: renderAjustesView,
    }),

    adminRoute({
      path: ROUTE_PATHS.SERVIDOR,
      name: "servidor",
      titleKey: "routes.servidor",
      titleFallback: "Servidor",
      order: 80,
      render: renderServidorView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.LOGIN,
      name: "login",
      titleKey: "routes.login",
      titleFallback: "Acceso",
      guestOnly: true,
      redirectAuthenticated: ROUTE_PATHS.HOME,
      order: 1000,
      render: renderLoginView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.ACTIVATE_ACCOUNT,
      name: "activate-account",
      titleKey: "routes.activateAccount",
      titleFallback: "Activar cuenta",
      order: 1005,
      render: renderActivateAccountView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.RESET_PASSWORD,
      name: "reset-password",
      titleKey: "routes.resetPassword",
      titleFallback: "Recuperar acceso",
      order: 1010,
      render: renderResetPasswordView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
      name: "reset-password-confirm",
      titleKey: "routes.resetPasswordConfirm",
      titleFallback: "Nueva contraseña",
      order: 1020,
      render: renderConfirmResetPasswordView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.FORGOT_PASSWORD,
      name: "forgot-password",
      titleKey: "routes.forgotPassword",
      titleFallback: "Recuperar acceso",
      order: 1030,
      render: renderResetPasswordView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.RECOVER_PASSWORD,
      name: "recover-password",
      titleKey: "routes.recoverPassword",
      titleFallback: "Recuperar acceso",
      order: 1040,
      render: renderResetPasswordView,
    }),

    publicAuthRoute({
      path: ROUTE_PATHS.PASSWORD_RESET,
      name: "password-reset",
      titleKey: "routes.passwordReset",
      titleFallback: "Recuperar acceso",
      order: 1050,
      render: renderResetPasswordView,
    }),
  ];
}

/* =========================================================
   IMMUTABLE TABLE
========================================================= */

let ROUTES_CACHE = null;

export function getImmutableRoutes() {
  if (ROUTES_CACHE) {
    return ROUTES_CACHE;
  }

  ROUTES_CACHE = Object.freeze(createRoutes());

  return ROUTES_CACHE;
}

/* =========================================================
   VALIDATION
========================================================= */

function assertValidRouteObject(route, index) {
  if (!route || typeof route !== "object") {
    throw new Error(`Router: ruta inválida en índice ${index}.`);
  }
}

function assertValidPath(route, normalizedPath) {
  if (!normalizedPath || !normalizedPath.startsWith("/")) {
    throw new Error(`Router: path inválido "${route.path}".`);
  }

  if (normalizedPath.includes("?") || normalizedPath.includes("#")) {
    throw new Error(
      `Router: la ruta "${route.path}" no debe incluir query/hash.`
    );
  }

  if (route.path !== normalizedPath) {
    throw new Error(
      `Router: path no normalizado "${route.path}". Esperado "${normalizedPath}".`
    );
  }
}

function assertValidName(route, normalizedPath) {
  if (typeof route.name !== "string" || !route.name.trim()) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene name válido.`
    );
  }
}

function assertValidRender(route, normalizedPath) {
  if (typeof route.render !== "function") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene render().`
    );
  }
}

function assertValidRoles(route, normalizedPath) {
  if (!Array.isArray(route.roles)) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene roles inválidos.`
    );
  }

  if (
    route.roles.some((role) => {
      return typeof role !== "string" || !role.trim();
    })
  ) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene roles vacíos o inválidos.`
    );
  }

  const normalized = normalizeRoles(route.roles);

  if (normalized.length !== route.roles.length) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene roles duplicados o inválidos.`
    );
  }
}

function assertValidFlags(route, normalizedPath) {
  if (typeof route.public !== "boolean") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene public inválido.`
    );
  }

  if (typeof route.hideShell !== "boolean") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene hideShell inválido.`
    );
  }

  if (typeof route.requiresAuth !== "boolean") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene requiresAuth inválido.`
    );
  }

  if (typeof route.guestOnly !== "boolean") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene guestOnly inválido.`
    );
  }

  if (typeof route.shell !== "boolean") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene shell inválido.`
    );
  }

  if (typeof route.showShell !== "boolean") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene showShell inválido.`
    );
  }

  if (route.public === true && route.roles.length > 0) {
    throw new Error(
      `Router: la ruta pública "${normalizedPath}" no debe declarar roles.`
    );
  }

  if (
    route.public === true &&
    PUBLIC_AUTH_ROUTE_SET.has(normalizedPath) &&
    !route.hideShell
  ) {
    throw new Error(
      `Router: la ruta auth pública "${normalizedPath}" debe ocultar shell.`
    );
  }

  if (route.public === false && route.hideShell === true) {
    throw new Error(
      `Router: la ruta privada "${normalizedPath}" no debería ocultar shell.`
    );
  }

  if (route.public === true && route.requiresAuth === true) {
    throw new Error(
      `Router: la ruta pública "${normalizedPath}" no debe requerir auth.`
    );
  }

  if (route.public === false && route.requiresAuth !== true) {
    throw new Error(
      `Router: la ruta privada "${normalizedPath}" debe requerir auth.`
    );
  }

  if (route.hideShell === true && route.shell !== false) {
    throw new Error(
      `Router: shell inconsistente en "${normalizedPath}".`
    );
  }

  if (route.hideShell === false && route.shell !== true) {
    throw new Error(
      `Router: shell inconsistente en "${normalizedPath}".`
    );
  }
}

function assertValidMeta(route, normalizedPath) {
  if (typeof route.meta !== "object" || !route.meta) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene meta válido.`
    );
  }

  if (route.meta.requiresAuth !== route.requiresAuth) {
    throw new Error(
      `Router: meta.requiresAuth inconsistente en "${normalizedPath}".`
    );
  }

  if (route.meta.public !== route.public) {
    throw new Error(
      `Router: meta.public inconsistente en "${normalizedPath}".`
    );
  }

  if (route.meta.private !== route.requiresAuth) {
    throw new Error(
      `Router: meta.private inconsistente en "${normalizedPath}".`
    );
  }

  if (route.meta.hideShell !== route.hideShell) {
    throw new Error(
      `Router: meta.hideShell inconsistente en "${normalizedPath}".`
    );
  }

  if (route.meta.shell !== route.shell) {
    throw new Error(
      `Router: meta.shell inconsistente en "${normalizedPath}".`
    );
  }

  if (!Array.isArray(route.meta.roles)) {
    throw new Error(
      `Router: meta.roles inválido en "${normalizedPath}".`
    );
  }

  if (!Array.isArray(route.meta.allowRoles)) {
    throw new Error(
      `Router: meta.allowRoles inválido en "${normalizedPath}".`
    );
  }

  if (route.meta.roles.length !== route.roles.length) {
    throw new Error(
      `Router: meta.roles inconsistente en "${normalizedPath}".`
    );
  }

  if (route.meta.allowRoles.length !== route.roles.length) {
    throw new Error(
      `Router: meta.allowRoles inconsistente en "${normalizedPath}".`
    );
  }
}

function assertHomeRoute(routes) {
  const home = routes.find((route) => route.path === ROUTE_PATHS.HOME);

  if (!home) {
    throw new Error("Router: falta la ruta Home '/'.");
  }

  if (home.name !== "home") {
    throw new Error("Router: la ruta '/' debe llamarse 'home'.");
  }

  if (home.public !== false || home.requiresAuth !== true) {
    throw new Error("Router: Home debe ser privada y requerir auth.");
  }

  if (home.hideShell !== false || home.shell !== true) {
    throw new Error("Router: Home debe usar shell visible.");
  }
}

function assertPublicAuthRoutes(routes) {
  for (const path of PUBLIC_AUTH_ROUTES) {
    const route = routes.find((item) => item.path === path);

    if (!route) {
      throw new Error(`Router: falta ruta pública auth "${path}".`);
    }

    if (route.public !== true || route.requiresAuth !== false) {
      throw new Error(`Router: ruta pública auth inválida "${path}".`);
    }

    if (route.hideShell !== true || route.shell !== false) {
      throw new Error(`Router: ruta pública auth debe ocultar shell "${path}".`);
    }
  }
}

export function validateRoutesTable(AppCore, routes, normalizeCanonicalPath) {
  if (!Array.isArray(routes)) {
    throw new Error("Router: tabla de rutas inválida.");
  }

  const seen = new Set();
  const seenNames = new Set();

  routes.forEach((route, index) => {
    assertValidRouteObject(route, index);

    const normalizedPath = normalizeRoutePath(
      normalizeCanonicalPath(AppCore, route.path || "/")
    );

    assertValidPath(route, normalizedPath);

    if (seen.has(normalizedPath)) {
      throw new Error(`Router: ruta duplicada "${normalizedPath}".`);
    }

    assertValidName(route, normalizedPath);

    const normalizedName = normalizeRouteName(route.name);

    if (seenNames.has(normalizedName)) {
      throw new Error(`Router: nombre de ruta duplicado "${route.name}".`);
    }

    assertValidRender(route, normalizedPath);
    assertValidRoles(route, normalizedPath);
    assertValidFlags(route, normalizedPath);
    assertValidMeta(route, normalizedPath);

    seen.add(normalizedPath);
    seenNames.add(normalizedName);
  });

  assertHomeRoute(routes);
  assertPublicAuthRoutes(routes);

  return true;
}

/* =========================================================
   DEBUG HELPERS
========================================================= */

export function getRoutesSnapshot() {
  return getImmutableRoutes().map((route) => ({
    id: route.id,
    path: route.path,
    canonicalPath: route.canonicalPath,
    name: route.name,
    title: route.title,
    public: route.public,
    requiresAuth: route.requiresAuth,
    guestOnly: route.guestOnly,
    publicOnly: route.publicOnly,
    hideShell: route.hideShell,
    shell: route.shell,
    layout: route.layout,
    authScreen: route.authScreen,
    roles: route.roles,
    redirectAuthenticated: route.redirectAuthenticated || null,
    redirectForbidden: route.redirectForbidden || null,
    order: route.order,
    meta: route.meta,
  }));
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTE_PATHS,
  ADMIN_ROLES,

  createRoutes,
  getImmutableRoutes,
  validateRoutesTable,
  getRoutesSnapshot,
};

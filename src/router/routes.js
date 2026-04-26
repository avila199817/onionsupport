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
   - safe render wrappers
   - validación extendida
   - metadata estable
   - soporte para vistas tipo objeto y vistas tipo función
   - integración de rutas auth públicas
   - priorizar init() sobre render() en vistas objeto
   - canonical paths estrictos
   - meta auth consistente con guards
   - soporte público para activación de cuenta
   - rutas sin query/hash por definición
   - no toca history
   - no modifica search/hash
   - no destruye /activate-account?token=...
   - roles admin centralizados
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

const PUBLIC_AUTH_ROUTES = Object.freeze([
  "/login",
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
]);

const PUBLIC_AUTH_ROUTE_SET = new Set(PUBLIC_AUTH_ROUTES);

const ADMIN_ROLES = Object.freeze([
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

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function normalizeRoleKey(role = "") {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .filter?.() || "";
}

function normalizeRoles(roles) {
  return toArray(roles)
    .flat()
    .map((role) => {
      return String(role || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
    })
    .filter(Boolean);
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
    return prefixed.replace(/\/+$/, "") || "/";
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
  return async function wrappedRouteRender(...args) {
    try {
      if (typeof fn !== "function") {
        return null;
      }

      return await Promise.resolve(fn(...args));
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
    Priorizamos init() antes que render()
    porque vistas auth y otras vistas complejas
    pueden necesitar preparar estado antes del paint.
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
  const isLoginRoute = normalizedPath === "/login";
  const isPublicAuthRoute = PUBLIC_AUTH_ROUTE_SET.has(normalizedPath);

  const guestOnly =
    definition.guestOnly === true ||
    (publicRoute && definition.hideShell === true && isLoginRoute);

  const roles = normalizeRoles(definition.roles);
  const requiresAuth = publicRoute !== true;

  return Object.freeze({
    order: Number(definition.order || 0),

    source: definition.source || ROUTE_SOURCE,

    requiresAuth,
    private: requiresAuth,

    public: publicRoute,
    publicAuth: publicRoute && isPublicAuthRoute,

    guestOnly,
    publicOnly: guestOnly,

    roles,
    allowRoles: roles,
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
  const normalizedRoles = normalizeRoles(definition.roles);

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
    name: normalizedName,

    titleKey: safeText(definition.titleKey, ""),
    titleFallback: safeText(definition.titleFallback, definition.name || ""),

    public: publicRoute,
    requiresAuth: meta.requiresAuth,
    guestOnly: meta.guestOnly,

    roles: normalizedRoles,

    hideShell,

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
   ROUTES FACTORY
========================================================= */

export function createRoutes() {
  return [
    createRoute({
      path: "/",
      name: "home",
      titleKey: "routes.home",
      titleFallback: "Onion Support",
      public: false,
      roles: [],
      hideShell: false,
      order: 10,
      render: renderHomeView,
    }),

    createRoute({
      path: "/incidencias",
      name: "incidencias",
      titleKey: "routes.incidencias",
      titleFallback: "Incidencias",
      public: false,
      roles: [],
      hideShell: false,
      order: 20,
      render: renderIncidenciasView,
    }),

    createRoute({
      path: "/facturas",
      name: "facturas",
      titleKey: "routes.facturas",
      titleFallback: "Facturas",
      public: false,
      roles: [],
      hideShell: false,
      order: 30,
      render: renderFacturasView,
    }),

    createRoute({
      path: "/usuarios",
      name: "usuarios",
      titleKey: "routes.usuarios",
      titleFallback: "Usuarios",
      public: false,
      roles: ADMIN_ROLES,
      hideShell: false,
      order: 40,
      render: renderUsuariosView,
    }),

    createRoute({
      path: "/clientes",
      name: "clientes",
      titleKey: "routes.clientes",
      titleFallback: "Clientes",
      public: false,
      roles: ADMIN_ROLES,
      hideShell: false,
      order: 50,
      render: renderClientesView,
    }),

    createRoute({
      path: "/cuenta",
      name: "cuenta",
      titleKey: "routes.cuenta",
      titleFallback: "Cuenta",
      public: false,
      roles: [],
      hideShell: false,
      order: 60,
      render: renderCuentaView,
    }),

    createRoute({
      path: "/ajustes",
      name: "ajustes",
      titleKey: "routes.ajustes",
      titleFallback: "Ajustes",
      public: false,
      roles: [],
      hideShell: false,
      order: 70,
      render: renderAjustesView,
    }),

    createRoute({
      path: "/servidor",
      name: "servidor",
      titleKey: "routes.servidor",
      titleFallback: "Servidor",
      public: false,
      roles: ADMIN_ROLES,
      hideShell: false,
      order: 80,
      render: renderServidorView,
    }),

    createRoute({
      path: "/login",
      name: "login",
      titleKey: "routes.login",
      titleFallback: "Acceso",
      public: true,
      roles: [],
      hideShell: true,
      guestOnly: true,
      order: 1000,
      render: renderLoginView,
    }),

    createRoute({
      path: "/activate-account",
      name: "activate-account",
      titleKey: "routes.activateAccount",
      titleFallback: "Activar cuenta",
      public: true,
      roles: [],
      hideShell: true,
      guestOnly: false,
      order: 1005,
      render: renderActivateAccountView,
    }),

    createRoute({
      path: "/reset-password",
      name: "reset-password",
      titleKey: "routes.resetPassword",
      titleFallback: "Recuperar acceso",
      public: true,
      roles: [],
      hideShell: true,
      guestOnly: false,
      order: 1010,
      render: renderResetPasswordView,
    }),

    createRoute({
      path: "/reset-password/confirm",
      name: "reset-password-confirm",
      titleKey: "routes.resetPasswordConfirm",
      titleFallback: "Nueva contraseña",
      public: true,
      roles: [],
      hideShell: true,
      guestOnly: false,
      order: 1020,
      render: renderConfirmResetPasswordView,
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

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  createRoutes,
  getImmutableRoutes,
  validateRoutesTable,
};

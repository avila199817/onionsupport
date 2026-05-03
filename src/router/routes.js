/* =========================================================
   Onion SPA - Routes
   Archivo: src/router/routes.js

   FINAL EXTREME SYSTEM · ROUTES TABLE · CANONICAL SAFE · 10/10
   PATCH · SIDEBAR ACTIVE ROUTE SAFE
   PATCH · VIEWKEY/VIEWNAME HARD LOCKED
   PATCH · PUBLIC AUTH TOKEN ROUTES SAFE
   PATCH · ADAPTERS RENDER HOST COMPATIBLE
   PATCH · ROUTE VALIDATION EXTREME

   RESPONSABILIDADES:
   - definir la tabla de rutas canónicas de la SPA
   - encapsular adapters de render
   - exponer rutas inmutables
   - validar estructura mínima/extrema
   - resolver títulos reactivos vía i18n
   - mantener orden consistente con sidebar/router
   - centralizar paths/names/viewKeys
   - blindar Home / Incidencias / Facturas
   - evitar que una ruta pinte la vista equivocada
   - no tocar history
   - no modificar search/hash
   - no destruir tokens públicos por query/path
   - entregar metadata estable para guards/render/sidebar

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
   - roles admin centralizados
   - Home real en /
   - cada ruta declara viewKey estable
   - cada ruta declara viewName estable
   - cada render adapter queda marcado con routeViewKey/routeViewName
   - validateRoutesTable verifica bindings críticos
   - validateRoutesTable NO depende ciegamente de normalizeCanonicalPath externo

   FIX CRÍTICO:
   - / solo renderiza HomeView
   - /incidencias solo renderiza IncidenciasView
   - /facturas solo renderiza FacturasView
   - /usuarios solo renderiza UsuariosView
   - /clientes solo renderiza ClientesView
   - /cuenta solo renderiza CuentaView
   - /ajustes solo renderiza AjustesView
   - /servidor solo renderiza ServerView
   - /login solo renderiza LoginView
   - /reset-password/confirm solo renderiza ConfirmResetPasswordView
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
const ROUTES_VERSION = "13.0.0";

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
});

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

export const PUBLIC_AUTH_ROUTES = Object.freeze([
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.ACTIVATE_ACCOUNT,
  ROUTE_PATHS.RESET_PASSWORD,
  ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
  ROUTE_PATHS.FORGOT_PASSWORD,
  ROUTE_PATHS.RECOVER_PASSWORD,
  ROUTE_PATHS.PASSWORD_RESET,
]);

const PUBLIC_AUTH_ROUTE_SET =
  new Set(PUBLIC_AUTH_ROUTES);

export const ROUTE_ALIASES = Object.freeze({
  "/home": ROUTE_PATHS.HOME,
  "/dashboard": ROUTE_PATHS.HOME,

  "/tickets": ROUTE_PATHS.INCIDENCIAS,
  "/ticket": ROUTE_PATHS.INCIDENCIAS,
  "/incidents": ROUTE_PATHS.INCIDENCIAS,
  "/incident": ROUTE_PATHS.INCIDENCIAS,

  "/invoices": ROUTE_PATHS.FACTURAS,
  "/invoice": ROUTE_PATHS.FACTURAS,
  "/billing": ROUTE_PATHS.FACTURAS,

  "/users": ROUTE_PATHS.USUARIOS,
  "/user": ROUTE_PATHS.USUARIOS,

  "/clients": ROUTE_PATHS.CLIENTES,
  "/client": ROUTE_PATHS.CLIENTES,
  "/customers": ROUTE_PATHS.CLIENTES,
  "/customer": ROUTE_PATHS.CLIENTES,

  "/account": ROUTE_PATHS.CUENTA,
  "/profile": ROUTE_PATHS.CUENTA,

  "/settings": ROUTE_PATHS.AJUSTES,
  "/config": ROUTE_PATHS.AJUSTES,

  "/server": ROUTE_PATHS.SERVIDOR,
});

const CRITICAL_ROUTE_BINDINGS = Object.freeze([
  Object.freeze({
    path: ROUTE_PATHS.HOME,
    name: ROUTE_NAMES.HOME,
    viewKey: ROUTE_VIEW_KEYS.HOME,
    viewName: ROUTE_VIEW_NAMES.HOME,
  }),

  Object.freeze({
    path: ROUTE_PATHS.INCIDENCIAS,
    name: ROUTE_NAMES.INCIDENCIAS,
    viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS,
    viewName: ROUTE_VIEW_NAMES.INCIDENCIAS,
  }),

  Object.freeze({
    path: ROUTE_PATHS.FACTURAS,
    name: ROUTE_NAMES.FACTURAS,
    viewKey: ROUTE_VIEW_KEYS.FACTURAS,
    viewName: ROUTE_VIEW_NAMES.FACTURAS,
  }),

  Object.freeze({
    path: ROUTE_PATHS.CUENTA,
    name: ROUTE_NAMES.CUENTA,
    viewKey: ROUTE_VIEW_KEYS.CUENTA,
    viewName: ROUTE_VIEW_NAMES.CUENTA,
  }),
]);

const ROUTE_RENDER_EXPECTATIONS = Object.freeze({
  [ROUTE_PATHS.HOME]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.HOME,
    viewName: ROUTE_VIEW_NAMES.HOME,
  }),

  [ROUTE_PATHS.INCIDENCIAS]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS,
    viewName: ROUTE_VIEW_NAMES.INCIDENCIAS,
  }),

  [ROUTE_PATHS.FACTURAS]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.FACTURAS,
    viewName: ROUTE_VIEW_NAMES.FACTURAS,
  }),

  [ROUTE_PATHS.USUARIOS]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.USUARIOS,
    viewName: ROUTE_VIEW_NAMES.USUARIOS,
  }),

  [ROUTE_PATHS.CLIENTES]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.CLIENTES,
    viewName: ROUTE_VIEW_NAMES.CLIENTES,
  }),

  [ROUTE_PATHS.CUENTA]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.CUENTA,
    viewName: ROUTE_VIEW_NAMES.CUENTA,
  }),

  [ROUTE_PATHS.AJUSTES]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.AJUSTES,
    viewName: ROUTE_VIEW_NAMES.AJUSTES,
  }),

  [ROUTE_PATHS.SERVIDOR]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.SERVIDOR,
    viewName: ROUTE_VIEW_NAMES.SERVIDOR,
  }),

  [ROUTE_PATHS.LOGIN]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.LOGIN,
    viewName: ROUTE_VIEW_NAMES.LOGIN,
  }),

  [ROUTE_PATHS.ACTIVATE_ACCOUNT]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT,
    viewName: ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT,
  }),

  [ROUTE_PATHS.RESET_PASSWORD]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD,
    viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD,
  }),

  [ROUTE_PATHS.FORGOT_PASSWORD]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD,
    viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD,
  }),

  [ROUTE_PATHS.RECOVER_PASSWORD]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD,
    viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD,
  }),

  [ROUTE_PATHS.PASSWORD_RESET]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD,
    viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD,
  }),

  [ROUTE_PATHS.RESET_PASSWORD_CONFIRM]: Object.freeze({
    viewKey: ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM,
    viewName: ROUTE_VIEW_NAMES.RESET_PASSWORD_CONFIRM,
  }),
});

/* =========================================================
   I18N
========================================================= */

function t(key, fallback = "", params = {}) {
  try {
    if (typeof I18n?.t === "function") {
      return I18n.t(key, params, fallback) || fallback || key;
    }
  } catch {}

  return fallback || key;
}

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "ok",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return fallback;
}

function safeError(...args) {
  try {
    console.error(...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    console.warn(...args);
  } catch {}
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
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

function isFunction(value) {
  return typeof value === "function";
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
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

function deepFreeze(value) {
  if (
    !value ||
    (
      typeof value !== "object" &&
      typeof value !== "function"
    )
  ) {
    return value;
  }

  try {
    const keys =
      Object.keys(value);

    for (const key of keys) {
      const item =
        value[key];

      if (
        item &&
        (
          typeof item === "object" ||
          typeof item === "function"
        ) &&
        !Object.isFrozen(item)
      ) {
        deepFreeze(item);
      }
    }

    Object.freeze(value);
  } catch {}

  return value;
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

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

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function stripQueryAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  const withoutHash =
    raw.split("#")[0] || "/";

  const withoutSearch =
    withoutHash.split("?")[0] || "/";

  return withoutSearch || "/";
}

function stripPublicUsernamePrefix(path = "/") {
  const raw =
    safeText(path, "/")
      .replace(/\\/g, "/");

  const withoutQuery =
    stripQueryAndHash(raw);

  const clean =
    withoutQuery.replace(/^\/@[^/]+(?=\/|$)/i, "");

  return clean || "/";
}

function applyRouteAlias(path = "/") {
  const clean =
    safeText(path, "/") || "/";

  if (ROUTE_ALIASES[clean]) {
    return ROUTE_ALIASES[clean];
  }

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (
      from !== "/" &&
      clean.startsWith(`${from}/`)
    ) {
      return `${to}${clean.slice(from.length)}`;
    }
  }

  return clean;
}

function normalizeRoutePath(path = "/") {
  const withoutQuery =
    stripPublicUsernamePrefix(path);

  let normalized =
    String(withoutQuery || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!normalized) {
    normalized = "/";
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (
    normalized.length > 1 &&
    normalized.endsWith("/")
  ) {
    normalized =
      normalized.replace(/\/+$/g, "") || "/";
  }

  normalized =
    applyRouteAlias(normalized);

  if (
    normalized.length > 1 &&
    normalized.endsWith("/")
  ) {
    normalized =
      normalized.replace(/\/+$/g, "") || "/";
  }

  return normalized || "/";
}

function normalizeRouteName(name = "route") {
  return (
    String(name || "route")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._:-]/g, "") ||
    "route"
  );
}

function normalizeViewKey(value = "view") {
  return (
    String(value || "view")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._:-]/g, "") ||
    "view"
  );
}

function normalizeViewName(value = "View") {
  return (
    String(value || "View")
      .trim()
      .replace(/\s+/g, "") ||
    "View"
  );
}

function buildRouteId({ path = "/", name = "route" } = {}) {
  const cleanPath =
    normalizeRoutePath(path)
      .replace(/^\//, "")
      .replace(/\//g, "_") ||
    "root";

  return `${normalizeRouteName(name)}:${cleanPath}`;
}

/* =========================================================
   SAFE RENDER
========================================================= */

function safeRun(fn, meta = {}) {
  const safeMeta = {
    routeName:
      safeText(meta.routeName, ""),
    routePath:
      safeText(meta.routePath, ""),
    viewKey:
      safeText(meta.viewKey, ""),
    viewName:
      safeText(meta.viewName, ""),
  };

  return function wrappedRouteRender(...args) {
    try {
      if (typeof fn !== "function") {
        return null;
      }

      const result =
        fn(...args);

      if (isPromiseLike(result)) {
        return result.catch((error) => {
          safeError(
            "[Router Route Error]",
            {
              ...safeMeta,
              error,
            }
          );

          throw error;
        });
      }

      return result;
    } catch (error) {
      safeError(
        "[Router Route Error]",
        {
          ...safeMeta,
          error,
        }
      );

      throw error;
    }
  };
}

function resolveViewRenderer(view) {
  if (typeof view === "function") {
    return {
      renderer:
        view,
      kind:
        "function",
    };
  }

  /*
    IMPORTANTE:
    Priorizamos init() antes que render().
    Vistas complejas suelen preparar listeners/estado en init().
  */
  if (
    view &&
    typeof view.init === "function"
  ) {
    return {
      renderer:
        view.init.bind(view),
      kind:
        "object.init",
    };
  }

  if (
    view &&
    typeof view.mount === "function"
  ) {
    return {
      renderer:
        view.mount.bind(view),
      kind:
        "object.mount",
    };
  }

  if (
    view &&
    typeof view.render === "function"
  ) {
    return {
      renderer:
        view.render.bind(view),
      kind:
        "object.render",
    };
  }

  if (
    view &&
    typeof view.bootstrap === "function"
  ) {
    return {
      renderer:
        view.bootstrap.bind(view),
      kind:
        "object.bootstrap",
    };
  }

  return {
    renderer:
      () => null,
    kind:
      "empty",
  };
}

function getViewDebugName(view, fallback = "View") {
  return (
    safeText(view?.displayName, "") ||
    safeText(view?.viewName, "") ||
    safeText(view?.name, "") ||
    safeText(view?.constructor?.name, "") ||
    fallback
  );
}

function createViewAdapter(view, config = {}) {
  const viewKey =
    normalizeViewKey(
      config.viewKey || "view"
    );

  const viewName =
    normalizeViewName(
      config.viewName ||
        getViewDebugName(view, viewKey)
    );

  const {
    renderer,
    kind,
  } = resolveViewRenderer(view);

  const adapter =
    function routeViewAdapter(...args) {
      const result =
        renderer(...args);

      /*
        Si la vista es objeto y su init()/mount()/render() no devuelve nada,
        devolvemos la propia vista para que Router pueda ejecutar destroy().
      */
      if (
        result === undefined &&
        view &&
        typeof view === "object"
      ) {
        return view;
      }

      return result;
    };

  try {
    Object.defineProperties(adapter, {
      routeViewKey: {
        value:
          viewKey,
        enumerable:
          true,
      },

      routeViewName: {
        value:
          viewName,
        enumerable:
          true,
      },

      routeViewKind: {
        value:
          kind,
        enumerable:
          true,
      },

      routeViewHasRawView: {
        value:
          Boolean(view),
        enumerable:
          true,
      },
    });
  } catch {}

  return adapter;
}

/* =========================================================
   META
========================================================= */

function normalizeMeta(definition = {}) {
  const normalizedPath =
    normalizeRoutePath(
      definition.path || "/"
    );

  const publicRoute =
    definition.public === true;

  const isLoginRoute =
    normalizedPath === ROUTE_PATHS.LOGIN;

  const isPublicAuthRoute =
    PUBLIC_AUTH_ROUTE_SET.has(normalizedPath);

  const roles =
    freezeArray(
      normalizeRoles(definition.roles)
    );

  const hideShell =
    definition.hideShell === true;

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

  const requiresAuth =
    publicRoute === true
      ? false
      : true;

  const viewKey =
    normalizeViewKey(
      definition.viewKey || definition.name || "view"
    );

  const viewName =
    normalizeViewName(
      definition.viewName || viewKey
    );

  return deepFreeze({
    version:
      ROUTES_VERSION,

    order:
      safeNumber(definition.order, 0),

    source:
      definition.source || ROUTE_SOURCE,

    path:
      normalizedPath,

    canonicalPath:
      normalizedPath,

    requiresAuth,
    private:
      requiresAuth,

    public:
      publicRoute,

    publicAuth:
      publicRoute && isPublicAuthRoute,

    guestOnly,
    publicOnly:
      guestOnly,

    roles,
    allowRoles:
      roles,
    requireRoles:
      roles,

    hideShell,
    shell,
    showShell:
      !hideShell,

    layout,
    authScreen,

    viewKey,
    viewName,

    sidebarKey:
      viewKey,

    routeGroup:
      safeText(definition.routeGroup, publicRoute ? "auth" : "app"),

    tokenRoute:
      safeBoolean(definition.tokenRoute, false),

    preserveSearch:
      safeBoolean(definition.preserveSearch, false),

    preserveHash:
      safeBoolean(definition.preserveHash, false),
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
  const normalizedPath =
    normalizeRoutePath(
      definition.path || "/"
    );

  const normalizedName =
    normalizeRouteName(
      definition.name || "route"
    );

  const viewKey =
    normalizeViewKey(
      definition.viewKey ||
        normalizedName
    );

  const viewName =
    normalizeViewName(
      definition.viewName ||
        viewKey
    );

  const normalizedRoles =
    freezeArray(
      normalizeRoles(definition.roles)
    );

  const publicRoute =
    definition.public === true;

  const hideShell =
    definition.hideShell === true;

  const meta =
    normalizeMeta({
      ...definition,
      roles:
        normalizedRoles,
      public:
        publicRoute,
      path:
        normalizedPath,
      hideShell,
      viewKey,
      viewName,
    });

  const rawRender =
    typeof definition.render === "function"
      ? definition.render
      : () => null;

  const route = {
    id:
      buildRouteId({
        path:
          normalizedPath,
        name:
          normalizedName,
      }),

    version:
      ROUTES_VERSION,

    source:
      ROUTE_SOURCE,

    path:
      normalizedPath,

    canonicalPath:
      normalizedPath,

    name:
      normalizedName,

    viewKey,
    viewName,

    sidebarKey:
      viewKey,

    titleKey:
      safeText(definition.titleKey, ""),

    titleFallback:
      safeText(
        definition.titleFallback,
        definition.name || ""
      ),

    public:
      publicRoute,

    requiresAuth:
      meta.requiresAuth,

    private:
      meta.private,

    guestOnly:
      meta.guestOnly,

    publicOnly:
      meta.publicOnly,

    roles:
      normalizedRoles,

    allowRoles:
      normalizedRoles,

    requireRoles:
      normalizedRoles,

    hideShell,
    shell:
      meta.shell,

    showShell:
      meta.showShell,

    layout:
      meta.layout,

    authScreen:
      meta.authScreen,

    order:
      meta.order,

    redirectAuthenticated:
      safeText(
        definition.redirectAuthenticated,
        ""
      ),

    redirectIfAuth:
      safeText(
        definition.redirectIfAuth ||
          definition.redirectAuthenticated,
        ""
      ),

    redirectForbidden:
      safeText(
        definition.redirectForbidden,
        ""
      ),

    renderMode:
      safeText(
        definition.renderMode,
        ""
      ),

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

    tokenRoute:
      safeBoolean(definition.tokenRoute, false),

    preserveSearch:
      safeBoolean(definition.preserveSearch, false),

    preserveHash:
      safeBoolean(definition.preserveHash, false),

    aliases:
      freezeArray(
        toArray(definition.aliases)
          .map(normalizeRoutePath)
          .filter((alias) => alias && alias !== normalizedPath)
      ),

    render:
      safeRun(
        rawRender,
        {
          routeName:
            normalizedName,
          routePath:
            normalizedPath,
          viewKey,
          viewName,
        }
      ),

    meta,
  };

  try {
    Object.defineProperties(route.render, {
      routeName: {
        value:
          normalizedName,
        enumerable:
          true,
      },

      routePath: {
        value:
          normalizedPath,
        enumerable:
          true,
      },

      routeViewKey: {
        value:
          viewKey,
        enumerable:
          true,
      },

      routeViewName: {
        value:
          viewName,
        enumerable:
          true,
      },

      routeSource: {
        value:
          ROUTE_SOURCE,
        enumerable:
          true,
      },
    });
  } catch {}

  Object.defineProperty(route, "title", {
    enumerable:
      true,
    configurable:
      false,

    get() {
      return resolveRouteTitle(route);
    },
  });

  return deepFreeze(route);
}

/* =========================================================
   VIEW ADAPTERS
========================================================= */

const renderHomeView =
  createViewAdapter(
    HomeView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.HOME,
      viewName:
        ROUTE_VIEW_NAMES.HOME,
    }
  );

const renderIncidenciasView =
  createViewAdapter(
    IncidenciasView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.INCIDENCIAS,
      viewName:
        ROUTE_VIEW_NAMES.INCIDENCIAS,
    }
  );

const renderFacturasView =
  createViewAdapter(
    FacturasView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.FACTURAS,
      viewName:
        ROUTE_VIEW_NAMES.FACTURAS,
    }
  );

const renderUsuariosView =
  createViewAdapter(
    UsuariosView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.USUARIOS,
      viewName:
        ROUTE_VIEW_NAMES.USUARIOS,
    }
  );

const renderClientesView =
  createViewAdapter(
    ClientesView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.CLIENTES,
      viewName:
        ROUTE_VIEW_NAMES.CLIENTES,
    }
  );

const renderCuentaView =
  createViewAdapter(
    CuentaView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.CUENTA,
      viewName:
        ROUTE_VIEW_NAMES.CUENTA,
    }
  );

const renderAjustesView =
  createViewAdapter(
    AjustesView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.AJUSTES,
      viewName:
        ROUTE_VIEW_NAMES.AJUSTES,
    }
  );

const renderServidorView =
  createViewAdapter(
    ServerView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.SERVIDOR,
      viewName:
        ROUTE_VIEW_NAMES.SERVIDOR,
    }
  );

const renderLoginView =
  createViewAdapter(
    LoginView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.LOGIN,
      viewName:
        ROUTE_VIEW_NAMES.LOGIN,
    }
  );

const renderActivateAccountView =
  createViewAdapter(
    ActivateAccountView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT,
      viewName:
        ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT,
    }
  );

const renderResetPasswordView =
  createViewAdapter(
    ResetPasswordView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD,
    }
  );

const renderConfirmResetPasswordView =
  createViewAdapter(
    ConfirmResetPasswordView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD_CONFIRM,
    }
  );

/* =========================================================
   ROUTE DEFINITIONS HELPERS
========================================================= */

function privateRoute(definition = {}) {
  return createRoute({
    public:
      false,
    roles:
      [],
    hideShell:
      false,
    layout:
      "app",
    authScreen:
      false,
    ...definition,
  });
}

function adminRoute(definition = {}) {
  return privateRoute({
    roles:
      ADMIN_ROLES,
    redirectForbidden:
      ROUTE_PATHS.HOME,
    ...definition,
  });
}

function publicAuthRoute(definition = {}) {
  return createRoute({
    public:
      true,
    roles:
      [],
    hideShell:
      true,
    layout:
      "auth",
    authScreen:
      true,
    guestOnly:
      false,
    preserveSearch:
      true,
    preserveHash:
      true,
    ...definition,
  });
}

/* =========================================================
   ROUTES FACTORY
========================================================= */

export function createRoutes() {
  const routes = [
    privateRoute({
      path:
        ROUTE_PATHS.HOME,
      name:
        ROUTE_NAMES.HOME,
      viewKey:
        ROUTE_VIEW_KEYS.HOME,
      viewName:
        ROUTE_VIEW_NAMES.HOME,
      titleKey:
        "routes.home",
      titleFallback:
        "Inicio",
      order:
        10,
      render:
        renderHomeView,
      aliases:
        [
          "/home",
          "/dashboard",
        ],
    }),

    privateRoute({
      path:
        ROUTE_PATHS.INCIDENCIAS,
      name:
        ROUTE_NAMES.INCIDENCIAS,
      viewKey:
        ROUTE_VIEW_KEYS.INCIDENCIAS,
      viewName:
        ROUTE_VIEW_NAMES.INCIDENCIAS,
      titleKey:
        "routes.incidencias",
      titleFallback:
        "Incidencias",
      order:
        20,
      render:
        renderIncidenciasView,
      aliases:
        [
          "/tickets",
          "/ticket",
          "/incidents",
          "/incident",
        ],
    }),

    privateRoute({
      path:
        ROUTE_PATHS.FACTURAS,
      name:
        ROUTE_NAMES.FACTURAS,
      viewKey:
        ROUTE_VIEW_KEYS.FACTURAS,
      viewName:
        ROUTE_VIEW_NAMES.FACTURAS,
      titleKey:
        "routes.facturas",
      titleFallback:
        "Facturas",
      order:
        30,
      render:
        renderFacturasView,
      aliases:
        [
          "/invoices",
          "/invoice",
          "/billing",
        ],
    }),

    adminRoute({
      path:
        ROUTE_PATHS.USUARIOS,
      name:
        ROUTE_NAMES.USUARIOS,
      viewKey:
        ROUTE_VIEW_KEYS.USUARIOS,
      viewName:
        ROUTE_VIEW_NAMES.USUARIOS,
      titleKey:
        "routes.usuarios",
      titleFallback:
        "Usuarios",
      order:
        40,
      render:
        renderUsuariosView,
      aliases:
        [
          "/users",
          "/user",
        ],
    }),

    adminRoute({
      path:
        ROUTE_PATHS.CLIENTES,
      name:
        ROUTE_NAMES.CLIENTES,
      viewKey:
        ROUTE_VIEW_KEYS.CLIENTES,
      viewName:
        ROUTE_VIEW_NAMES.CLIENTES,
      titleKey:
        "routes.clientes",
      titleFallback:
        "Clientes",
      order:
        50,
      render:
        renderClientesView,
      aliases:
        [
          "/clients",
          "/client",
          "/customers",
          "/customer",
        ],
    }),

    privateRoute({
      path:
        ROUTE_PATHS.CUENTA,
      name:
        ROUTE_NAMES.CUENTA,
      viewKey:
        ROUTE_VIEW_KEYS.CUENTA,
      viewName:
        ROUTE_VIEW_NAMES.CUENTA,
      titleKey:
        "routes.cuenta",
      titleFallback:
        "Cuenta",
      order:
        60,
      render:
        renderCuentaView,
      aliases:
        [
          "/account",
          "/profile",
        ],
    }),

    privateRoute({
      path:
        ROUTE_PATHS.AJUSTES,
      name:
        ROUTE_NAMES.AJUSTES,
      viewKey:
        ROUTE_VIEW_KEYS.AJUSTES,
      viewName:
        ROUTE_VIEW_NAMES.AJUSTES,
      titleKey:
        "routes.ajustes",
      titleFallback:
        "Ajustes",
      order:
        70,
      render:
        renderAjustesView,
      aliases:
        [
          "/settings",
          "/config",
        ],
    }),

    adminRoute({
      path:
        ROUTE_PATHS.SERVIDOR,
      name:
        ROUTE_NAMES.SERVIDOR,
      viewKey:
        ROUTE_VIEW_KEYS.SERVIDOR,
      viewName:
        ROUTE_VIEW_NAMES.SERVIDOR,
      titleKey:
        "routes.servidor",
      titleFallback:
        "Servidor",
      order:
        80,
      render:
        renderServidorView,
      aliases:
        [
          "/server",
        ],
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.LOGIN,
      name:
        ROUTE_NAMES.LOGIN,
      viewKey:
        ROUTE_VIEW_KEYS.LOGIN,
      viewName:
        ROUTE_VIEW_NAMES.LOGIN,
      titleKey:
        "routes.login",
      titleFallback:
        "Acceso",
      guestOnly:
        true,
      redirectAuthenticated:
        ROUTE_PATHS.HOME,
      order:
        1000,
      render:
        renderLoginView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.ACTIVATE_ACCOUNT,
      name:
        ROUTE_NAMES.ACTIVATE_ACCOUNT,
      viewKey:
        ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT,
      viewName:
        ROUTE_VIEW_NAMES.ACTIVATE_ACCOUNT,
      titleKey:
        "routes.activateAccount",
      titleFallback:
        "Activar cuenta",
      tokenRoute:
        true,
      preserveSearch:
        true,
      preserveHash:
        true,
      order:
        1005,
      render:
        renderActivateAccountView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.RESET_PASSWORD,
      name:
        ROUTE_NAMES.RESET_PASSWORD,
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD,
      titleKey:
        "routes.resetPassword",
      titleFallback:
        "Recuperar acceso",
      preserveSearch:
        true,
      preserveHash:
        true,
      order:
        1010,
      render:
        renderResetPasswordView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.RESET_PASSWORD_CONFIRM,
      name:
        ROUTE_NAMES.RESET_PASSWORD_CONFIRM,
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD_CONFIRM,
      titleKey:
        "routes.resetPasswordConfirm",
      titleFallback:
        "Nueva contraseña",
      tokenRoute:
        true,
      preserveSearch:
        true,
      preserveHash:
        true,
      order:
        1020,
      render:
        renderConfirmResetPasswordView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.FORGOT_PASSWORD,
      name:
        ROUTE_NAMES.FORGOT_PASSWORD,
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD,
      titleKey:
        "routes.forgotPassword",
      titleFallback:
        "Recuperar acceso",
      preserveSearch:
        true,
      preserveHash:
        true,
      order:
        1030,
      render:
        renderResetPasswordView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.RECOVER_PASSWORD,
      name:
        ROUTE_NAMES.RECOVER_PASSWORD,
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD,
      titleKey:
        "routes.recoverPassword",
      titleFallback:
        "Recuperar acceso",
      preserveSearch:
        true,
      preserveHash:
        true,
      order:
        1040,
      render:
        renderResetPasswordView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.PASSWORD_RESET,
      name:
        ROUTE_NAMES.PASSWORD_RESET,
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD,
      viewName:
        ROUTE_VIEW_NAMES.RESET_PASSWORD,
      titleKey:
        "routes.passwordReset",
      titleFallback:
        "Recuperar acceso",
      preserveSearch:
        true,
      preserveHash:
        true,
      order:
        1050,
      render:
        renderResetPasswordView,
    }),
  ];

  return routes
    .slice()
    .sort((a, b) => {
      const orderA =
        safeNumber(a.order, 0);

      const orderB =
        safeNumber(b.order, 0);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return String(a.path).localeCompare(String(b.path));
    });
}

/* =========================================================
   IMMUTABLE TABLE
========================================================= */

let ROUTES_CACHE = null;

export function getImmutableRoutes() {
  if (ROUTES_CACHE) {
    return ROUTES_CACHE;
  }

  ROUTES_CACHE =
    Object.freeze(
      createRoutes().map((route) => deepFreeze(route))
    );

  return ROUTES_CACHE;
}

export function resetRoutesCacheForTests() {
  ROUTES_CACHE = null;
  return true;
}

/* =========================================================
   VALIDATION HELPERS
========================================================= */

function assertValidRouteObject(route, index) {
  if (
    !route ||
    typeof route !== "object"
  ) {
    throw new Error(
      `Router: ruta inválida en índice ${index}.`
    );
  }
}

function assertValidPath(route, normalizedPath) {
  if (
    !normalizedPath ||
    !normalizedPath.startsWith("/")
  ) {
    throw new Error(
      `Router: path inválido "${route.path}".`
    );
  }

  if (
    normalizedPath.includes("?") ||
    normalizedPath.includes("#")
  ) {
    throw new Error(
      `Router: la ruta "${route.path}" no debe incluir query/hash.`
    );
  }

  if (route.path !== normalizedPath) {
    throw new Error(
      `Router: path no normalizado "${route.path}". Esperado "${normalizedPath}".`
    );
  }

  if (
    route.canonicalPath &&
    route.canonicalPath !== normalizedPath
  ) {
    throw new Error(
      `Router: canonicalPath inconsistente en "${route.path}". Esperado "${normalizedPath}".`
    );
  }
}

function assertValidName(route, normalizedPath) {
  if (
    typeof route.name !== "string" ||
    !route.name.trim()
  ) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene name válido.`
    );
  }
}

function assertValidViewKey(route, normalizedPath) {
  if (
    typeof route.viewKey !== "string" ||
    !route.viewKey.trim()
  ) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene viewKey válido.`
    );
  }

  if (
    typeof route.viewName !== "string" ||
    !route.viewName.trim()
  ) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene viewName válido.`
    );
  }

  if (
    route.meta?.viewKey &&
    route.meta.viewKey !== route.viewKey
  ) {
    throw new Error(
      `Router: meta.viewKey inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta?.viewName &&
    route.meta.viewName !== route.viewName
  ) {
    throw new Error(
      `Router: meta.viewName inconsistente en "${normalizedPath}".`
    );
  }
}

function assertValidRender(route, normalizedPath) {
  if (typeof route.render !== "function") {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene render().`
    );
  }

  const expected =
    ROUTE_RENDER_EXPECTATIONS[normalizedPath];

  if (!expected) {
    return;
  }

  const renderViewKey =
    route.render.routeViewKey ||
    route.render.routeViewName ||
    "";

  const renderViewName =
    route.render.routeViewName || "";

  if (
    renderViewKey &&
    renderViewKey !== expected.viewKey
  ) {
    throw new Error(
      `Router: render incorrecto en "${normalizedPath}". route.render.routeViewKey="${renderViewKey}", esperado "${expected.viewKey}".`
    );
  }

  if (
    renderViewName &&
    renderViewName !== expected.viewName
  ) {
    throw new Error(
      `Router: render incorrecto en "${normalizedPath}". route.render.routeViewName="${renderViewName}", esperado "${expected.viewName}".`
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
      return (
        typeof role !== "string" ||
        !role.trim()
      );
    })
  ) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" tiene roles vacíos o inválidos.`
    );
  }

  const normalized =
    normalizeRoles(route.roles);

  if (
    normalized.length !== route.roles.length
  ) {
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

  if (
    route.public === true &&
    route.roles.length > 0
  ) {
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

  if (
    route.public === false &&
    route.hideShell === true
  ) {
    throw new Error(
      `Router: la ruta privada "${normalizedPath}" no debería ocultar shell.`
    );
  }

  if (
    route.public === true &&
    route.requiresAuth === true
  ) {
    throw new Error(
      `Router: la ruta pública "${normalizedPath}" no debe requerir auth.`
    );
  }

  if (
    route.public === false &&
    route.requiresAuth !== true
  ) {
    throw new Error(
      `Router: la ruta privada "${normalizedPath}" debe requerir auth.`
    );
  }

  if (
    route.hideShell === true &&
    route.shell !== false
  ) {
    throw new Error(
      `Router: shell inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.hideShell === false &&
    route.shell !== true
  ) {
    throw new Error(
      `Router: shell inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.hideShell === true &&
    route.showShell !== false
  ) {
    throw new Error(
      `Router: showShell inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.hideShell === false &&
    route.showShell !== true
  ) {
    throw new Error(
      `Router: showShell inconsistente en "${normalizedPath}".`
    );
  }
}

function assertValidMeta(route, normalizedPath) {
  if (
    typeof route.meta !== "object" ||
    !route.meta
  ) {
    throw new Error(
      `Router: la ruta "${normalizedPath}" no tiene meta válido.`
    );
  }

  if (
    route.meta.requiresAuth !== route.requiresAuth
  ) {
    throw new Error(
      `Router: meta.requiresAuth inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.public !== route.public
  ) {
    throw new Error(
      `Router: meta.public inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.private !== route.requiresAuth
  ) {
    throw new Error(
      `Router: meta.private inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.hideShell !== route.hideShell
  ) {
    throw new Error(
      `Router: meta.hideShell inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.shell !== route.shell
  ) {
    throw new Error(
      `Router: meta.shell inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.showShell !== route.showShell
  ) {
    throw new Error(
      `Router: meta.showShell inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.viewKey !== route.viewKey
  ) {
    throw new Error(
      `Router: meta.viewKey inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.viewName !== route.viewName
  ) {
    throw new Error(
      `Router: meta.viewName inconsistente en "${normalizedPath}".`
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

  if (
    route.meta.roles.length !== route.roles.length
  ) {
    throw new Error(
      `Router: meta.roles inconsistente en "${normalizedPath}".`
    );
  }

  if (
    route.meta.allowRoles.length !== route.roles.length
  ) {
    throw new Error(
      `Router: meta.allowRoles inconsistente en "${normalizedPath}".`
    );
  }
}

function assertHomeRoute(routes) {
  const home =
    routes.find(
      (route) => route.path === ROUTE_PATHS.HOME
    );

  if (!home) {
    throw new Error(
      "Router: falta la ruta Home '/'."
    );
  }

  if (home.name !== ROUTE_NAMES.HOME) {
    throw new Error(
      "Router: la ruta '/' debe llamarse 'home'."
    );
  }

  if (
    home.viewKey !== ROUTE_VIEW_KEYS.HOME
  ) {
    throw new Error(
      "Router: la ruta '/' debe usar viewKey 'home'."
    );
  }

  if (
    home.viewName !== ROUTE_VIEW_NAMES.HOME
  ) {
    throw new Error(
      "Router: la ruta '/' debe usar viewName 'HomeView'."
    );
  }

  if (
    home.render?.routeViewKey !== ROUTE_VIEW_KEYS.HOME ||
    home.render?.routeViewName !== ROUTE_VIEW_NAMES.HOME
  ) {
    throw new Error(
      "Router: la ruta '/' no está ligada a HomeView."
    );
  }

  if (
    home.public !== false ||
    home.requiresAuth !== true
  ) {
    throw new Error(
      "Router: Home debe ser privada y requerir auth."
    );
  }

  if (
    home.hideShell !== false ||
    home.shell !== true
  ) {
    throw new Error(
      "Router: Home debe usar shell visible."
    );
  }
}

function assertIncidenciasRoute(routes) {
  const incidencias =
    routes.find(
      (route) => route.path === ROUTE_PATHS.INCIDENCIAS
    );

  if (!incidencias) {
    throw new Error(
      "Router: falta la ruta Incidencias '/incidencias'."
    );
  }

  if (
    incidencias.name !== ROUTE_NAMES.INCIDENCIAS
  ) {
    throw new Error(
      "Router: la ruta '/incidencias' debe llamarse 'incidencias'."
    );
  }

  if (
    incidencias.viewKey !== ROUTE_VIEW_KEYS.INCIDENCIAS
  ) {
    throw new Error(
      "Router: la ruta '/incidencias' debe usar viewKey 'incidencias'."
    );
  }

  if (
    incidencias.viewName !== ROUTE_VIEW_NAMES.INCIDENCIAS
  ) {
    throw new Error(
      "Router: la ruta '/incidencias' debe usar viewName 'IncidenciasView'."
    );
  }

  if (
    incidencias.render?.routeViewKey !== ROUTE_VIEW_KEYS.INCIDENCIAS ||
    incidencias.render?.routeViewName !== ROUTE_VIEW_NAMES.INCIDENCIAS
  ) {
    throw new Error(
      "Router: la ruta '/incidencias' no está ligada a IncidenciasView."
    );
  }

  if (
    incidencias.public !== false ||
    incidencias.requiresAuth !== true
  ) {
    throw new Error(
      "Router: Incidencias debe ser privada y requerir auth."
    );
  }

  if (
    incidencias.hideShell !== false ||
    incidencias.shell !== true
  ) {
    throw new Error(
      "Router: Incidencias debe usar shell visible."
    );
  }
}

function assertFacturasRoute(routes) {
  const facturas =
    routes.find(
      (route) => route.path === ROUTE_PATHS.FACTURAS
    );

  if (!facturas) {
    throw new Error(
      "Router: falta la ruta Facturas '/facturas'."
    );
  }

  if (
    facturas.name !== ROUTE_NAMES.FACTURAS
  ) {
    throw new Error(
      "Router: la ruta '/facturas' debe llamarse 'facturas'."
    );
  }

  if (
    facturas.viewKey !== ROUTE_VIEW_KEYS.FACTURAS
  ) {
    throw new Error(
      "Router: la ruta '/facturas' debe usar viewKey 'facturas'."
    );
  }

  if (
    facturas.viewName !== ROUTE_VIEW_NAMES.FACTURAS
  ) {
    throw new Error(
      "Router: la ruta '/facturas' debe usar viewName 'FacturasView'."
    );
  }

  if (
    facturas.render?.routeViewKey !== ROUTE_VIEW_KEYS.FACTURAS ||
    facturas.render?.routeViewName !== ROUTE_VIEW_NAMES.FACTURAS
  ) {
    throw new Error(
      "Router: la ruta '/facturas' no está ligada a FacturasView."
    );
  }

  if (
    facturas.public !== false ||
    facturas.requiresAuth !== true
  ) {
    throw new Error(
      "Router: Facturas debe ser privada y requerir auth."
    );
  }

  if (
    facturas.hideShell !== false ||
    facturas.shell !== true
  ) {
    throw new Error(
      "Router: Facturas debe usar shell visible."
    );
  }
}

function assertPublicAuthRoutes(routes) {
  for (const path of PUBLIC_AUTH_ROUTES) {
    const route =
      routes.find(
        (item) => item.path === path
      );

    if (!route) {
      throw new Error(
        `Router: falta ruta pública auth "${path}".`
      );
    }

    if (
      route.public !== true ||
      route.requiresAuth !== false
    ) {
      throw new Error(
        `Router: ruta pública auth inválida "${path}".`
      );
    }

    if (
      route.hideShell !== true ||
      route.shell !== false
    ) {
      throw new Error(
        `Router: ruta pública auth debe ocultar shell "${path}".`
      );
    }

    if (
      route.layout !== "auth"
    ) {
      throw new Error(
        `Router: ruta pública auth debe usar layout auth "${path}".`
      );
    }
  }
}

function assertCriticalBindings(routes) {
  for (const expected of CRITICAL_ROUTE_BINDINGS) {
    const route =
      routes.find(
        (item) => item.path === expected.path
      );

    if (!route) {
      throw new Error(
        `Router: falta ruta crítica "${expected.path}".`
      );
    }

    if (route.name !== expected.name) {
      throw new Error(
        `Router: ruta crítica "${expected.path}" tiene name "${route.name}", esperado "${expected.name}".`
      );
    }

    if (route.viewKey !== expected.viewKey) {
      throw new Error(
        `Router: ruta crítica "${expected.path}" tiene viewKey "${route.viewKey}", esperado "${expected.viewKey}".`
      );
    }

    if (route.viewName !== expected.viewName) {
      throw new Error(
        `Router: ruta crítica "${expected.path}" tiene viewName "${route.viewName}", esperado "${expected.viewName}".`
      );
    }

    if (
      route.render?.routeViewKey !== expected.viewKey ||
      route.render?.routeViewName !== expected.viewName
    ) {
      throw new Error(
        `Router: ruta crítica "${expected.path}" está ligada a render incorrecto.`
      );
    }
  }
}

function getExternalCanonicalPath(AppCore, normalizeCanonicalPath, path) {
  if (typeof normalizeCanonicalPath !== "function") {
    return "";
  }

  try {
    return normalizeRoutePath(
      normalizeCanonicalPath(
        AppCore,
        path || "/"
      )
    );
  } catch {
    return "";
  }
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateRoutesTable(AppCore, routes, normalizeCanonicalPath) {
  if (!Array.isArray(routes)) {
    throw new Error(
      "Router: tabla de rutas inválida."
    );
  }

  const seen =
    new Set();

  const seenNames =
    new Set();

  routes.forEach((route, index) => {
    assertValidRouteObject(route, index);

    /*
      CRÍTICO:
      La ruta definida manda. No usamos normalizeCanonicalPath externo
      como fuente de verdad porque si el helper está mal puede convertir
      "/incidencias" o "/facturas" en "/" y romper el boot/sidebar.
    */
    const normalizedPath =
      normalizeRoutePath(route.path || "/");

    const externalCanonicalPath =
      getExternalCanonicalPath(
        AppCore,
        normalizeCanonicalPath,
        route.path || "/"
      );

    if (
      externalCanonicalPath &&
      externalCanonicalPath !== normalizedPath &&
      externalCanonicalPath !== "/"
    ) {
      safeWarn(
        "[Router Routes]",
        `normalizeCanonicalPath externo difiere para "${route.path}".`,
        {
          routePath:
            route.path,
          normalizedPath,
          externalCanonicalPath,
        }
      );
    }

    assertValidPath(route, normalizedPath);

    if (seen.has(normalizedPath)) {
      throw new Error(
        `Router: ruta duplicada "${normalizedPath}".`
      );
    }

    assertValidName(route, normalizedPath);

    const normalizedName =
      normalizeRouteName(route.name);

    if (seenNames.has(normalizedName)) {
      throw new Error(
        `Router: nombre de ruta duplicado "${route.name}".`
      );
    }

    assertValidViewKey(route, normalizedPath);
    assertValidRender(route, normalizedPath);
    assertValidRoles(route, normalizedPath);
    assertValidFlags(route, normalizedPath);
    assertValidMeta(route, normalizedPath);

    seen.add(normalizedPath);
    seenNames.add(normalizedName);
  });

  assertHomeRoute(routes);
  assertIncidenciasRoute(routes);
  assertFacturasRoute(routes);
  assertPublicAuthRoutes(routes);
  assertCriticalBindings(routes);

  return true;
}

/* =========================================================
   ROUTE RESOLUTION HELPERS
========================================================= */

export function resolveRouteAlias(path = "/") {
  return normalizeRoutePath(path);
}

export function getRouteByPath(path = "/") {
  const normalizedPath =
    normalizeRoutePath(path);

  const routes =
    getImmutableRoutes();

  return (
    routes.find(
      (route) => route.path === normalizedPath
    ) ||
    routes.find(
      (route) => Array.isArray(route.aliases) && route.aliases.includes(normalizedPath)
    ) ||
    null
  );
}

export function getRouteByName(name = "") {
  const normalizedName =
    normalizeRouteName(name);

  return (
    getImmutableRoutes().find(
      (route) => route.name === normalizedName
    ) || null
  );
}

export function getRouteByViewKey(viewKey = "") {
  const normalized =
    normalizeViewKey(viewKey);

  return (
    getImmutableRoutes().find(
      (route) => route.viewKey === normalized
    ) || null
  );
}

export function isPublicAuthPath(path = "/") {
  return PUBLIC_AUTH_ROUTE_SET.has(
    normalizeRoutePath(path)
  );
}

export function isPrivateRoutePath(path = "/") {
  const route =
    getRouteByPath(path);

  return Boolean(
    route &&
      route.requiresAuth === true &&
      route.public === false
  );
}

/* =========================================================
   DEBUG HELPERS
========================================================= */

export function getRoutesSnapshot() {
  return getImmutableRoutes().map((route) => ({
    id:
      route.id,

    version:
      route.version,

    source:
      route.source,

    path:
      route.path,

    canonicalPath:
      route.canonicalPath,

    aliases:
      route.aliases,

    name:
      route.name,

    viewKey:
      route.viewKey,

    viewName:
      route.viewName,

    sidebarKey:
      route.sidebarKey,

    renderViewKey:
      route.render?.routeViewKey ||
      null,

    renderViewName:
      route.render?.routeViewName ||
      null,

    renderViewKind:
      route.render?.routeViewKind ||
      null,

    title:
      route.title,

    public:
      route.public,

    requiresAuth:
      route.requiresAuth,

    guestOnly:
      route.guestOnly,

    publicOnly:
      route.publicOnly,

    hideShell:
      route.hideShell,

    shell:
      route.shell,

    showShell:
      route.showShell,

    layout:
      route.layout,

    authScreen:
      route.authScreen,

    tokenRoute:
      route.tokenRoute,

    preserveSearch:
      route.preserveSearch,

    preserveHash:
      route.preserveHash,

    roles:
      route.roles,

    redirectAuthenticated:
      route.redirectAuthenticated || null,

    redirectForbidden:
      route.redirectForbidden || null,

    order:
      route.order,

    meta:
      route.meta,
  }));
}

export function getRouteDebug(path = "/") {
  const normalizedPath =
    normalizeRoutePath(path);

  const route =
    getRouteByPath(normalizedPath);

  if (!route) {
    return {
      found:
        false,
      input:
        path,
      path:
        normalizedPath,
    };
  }

  return {
    found:
      true,

    input:
      path,

    id:
      route.id,

    path:
      route.path,

    canonicalPath:
      route.canonicalPath,

    aliases:
      route.aliases,

    name:
      route.name,

    viewKey:
      route.viewKey,

    viewName:
      route.viewName,

    renderViewKey:
      route.render?.routeViewKey ||
      null,

    renderViewName:
      route.render?.routeViewName ||
      null,

    renderViewKind:
      route.render?.routeViewKind ||
      null,

    title:
      route.title,

    public:
      route.public,

    requiresAuth:
      route.requiresAuth,

    hideShell:
      route.hideShell,

    shell:
      route.shell,

    showShell:
      route.showShell,

    layout:
      route.layout,

    roles:
      route.roles,

    meta:
      route.meta,
  };
}

export function getCriticalRoutesDebug() {
  return CRITICAL_ROUTE_BINDINGS.map((expected) => {
    const route =
      getRouteByPath(expected.path);

    return {
      expected,
      found:
        Boolean(route),

      actual:
        route
          ? {
              path:
                route.path,
              name:
                route.name,
              viewKey:
                route.viewKey,
              viewName:
                route.viewName,
              renderViewKey:
                route.render?.routeViewKey || null,
              renderViewName:
                route.render?.routeViewName || null,
            }
          : null,

      ok:
        Boolean(
          route &&
            route.path === expected.path &&
            route.name === expected.name &&
            route.viewKey === expected.viewKey &&
            route.viewName === expected.viewName &&
            route.render?.routeViewKey === expected.viewKey &&
            route.render?.routeViewName === expected.viewName
        ),
    };
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTE_PATHS,
  ROUTE_NAMES,
  ROUTE_VIEW_KEYS,
  ROUTE_VIEW_NAMES,
  ROUTE_ALIASES,
  ADMIN_ROLES,
  PUBLIC_AUTH_ROUTES,

  createRoutes,
  getImmutableRoutes,
  resetRoutesCacheForTests,
  validateRoutesTable,

  resolveRouteAlias,
  getRouteByPath,
  getRouteByName,
  getRouteByViewKey,
  isPublicAuthPath,
  isPrivateRoutePath,

  getRoutesSnapshot,
  getRouteDebug,
  getCriticalRoutesDebug,
};

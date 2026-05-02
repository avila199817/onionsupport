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

   FIX CRÍTICO:
   - / solo renderiza HomeView
   - /incidencias solo renderiza IncidenciasView
   - /facturas solo renderiza FacturasView
   - cada ruta declara viewKey estable
   - validateRoutesTable verifica bindings críticos
   - validateRoutesTable NO depende ciegamente de normalizeCanonicalPath externo
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

const PUBLIC_AUTH_ROUTES = Object.freeze([
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

const CRITICAL_ROUTE_BINDINGS = Object.freeze([
  Object.freeze({
    path: ROUTE_PATHS.HOME,
    name: ROUTE_NAMES.HOME,
    viewKey: ROUTE_VIEW_KEYS.HOME,
  }),

  Object.freeze({
    path: ROUTE_PATHS.INCIDENCIAS,
    name: ROUTE_NAMES.INCIDENCIAS,
    viewKey: ROUTE_VIEW_KEYS.INCIDENCIAS,
  }),

  Object.freeze({
    path: ROUTE_PATHS.FACTURAS,
    name: ROUTE_NAMES.FACTURAS,
    viewKey: ROUTE_VIEW_KEYS.FACTURAS,
  }),
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

function deepFreezeObject(value) {
  if (!isObject(value)) {
    return value;
  }

  for (const key of Object.keys(value)) {
    const item = value[key];

    if (
      isObject(item) ||
      Array.isArray(item)
    ) {
      try {
        Object.freeze(item);
      } catch {}
    }
  }

  return Object.freeze(value);
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

function normalizeRoutePath(path = "/") {
  const withoutQuery =
    stripQueryAndHash(path);

  const normalized =
    String(withoutQuery || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!normalized) {
    return "/";
  }

  const prefixed =
    normalized.startsWith("/")
      ? normalized
      : `/${normalized}`;

  if (
    prefixed.length > 1 &&
    prefixed.endsWith("/")
  ) {
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
    typeof view.mount === "function"
  ) {
    return {
      renderer:
        view.mount.bind(view),
      kind:
        "object.mount",
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
    safeText(
      config.viewName,
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
        Si la vista es objeto y su init() no devuelve nada,
        devolvemos la propia vista para que Router pueda ejecutar destroy().
        Si devuelve HTML/string/objeto, respetamos su retorno.
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

  return deepFreezeObject({
    order:
      Number(definition.order || 0),

    source:
      definition.source || ROUTE_SOURCE,

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

    viewKey:
      normalizeViewKey(definition.viewKey || definition.name || "view"),

    viewName:
      safeText(definition.viewName, ""),
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
    safeText(
      definition.viewName,
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

    path:
      normalizedPath,

    canonicalPath:
      normalizedPath,

    name:
      normalizedName,

    viewKey,
    viewName,

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

    render:
      safeRun(
        rawRender,
        {
          routeName:
            normalizedName,
          routePath:
            normalizedPath,
          viewKey,
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

  return Object.freeze(route);
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
        "HomeView",
    }
  );

const renderIncidenciasView =
  createViewAdapter(
    IncidenciasView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.INCIDENCIAS,
      viewName:
        "IncidenciasView",
    }
  );

const renderFacturasView =
  createViewAdapter(
    FacturasView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.FACTURAS,
      viewName:
        "FacturasView",
    }
  );

const renderUsuariosView =
  createViewAdapter(
    UsuariosView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.USUARIOS,
      viewName:
        "UsuariosView",
    }
  );

const renderClientesView =
  createViewAdapter(
    ClientesView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.CLIENTES,
      viewName:
        "ClientesView",
    }
  );

const renderCuentaView =
  createViewAdapter(
    CuentaView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.CUENTA,
      viewName:
        "CuentaView",
    }
  );

const renderAjustesView =
  createViewAdapter(
    AjustesView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.AJUSTES,
      viewName:
        "AjustesView",
    }
  );

const renderServidorView =
  createViewAdapter(
    ServerView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.SERVIDOR,
      viewName:
        "ServerView",
    }
  );

const renderLoginView =
  createViewAdapter(
    LoginView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.LOGIN,
      viewName:
        "LoginView",
    }
  );

const renderActivateAccountView =
  createViewAdapter(
    ActivateAccountView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.ACTIVATE_ACCOUNT,
      viewName:
        "ActivateAccountView",
    }
  );

const renderResetPasswordView =
  createViewAdapter(
    ResetPasswordView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD,
      viewName:
        "ResetPasswordView",
    }
  );

const renderConfirmResetPasswordView =
  createViewAdapter(
    ConfirmResetPasswordView,
    {
      viewKey:
        ROUTE_VIEW_KEYS.RESET_PASSWORD_CONFIRM,
      viewName:
        "ConfirmResetPasswordView",
    }
  );

/* =========================================================
   ROUTE DEFINITIONS
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
    ...definition,
  });
}

/* =========================================================
   ROUTES FACTORY
========================================================= */

export function createRoutes() {
  return [
    privateRoute({
      path:
        ROUTE_PATHS.HOME,
      name:
        ROUTE_NAMES.HOME,
      viewKey:
        ROUTE_VIEW_KEYS.HOME,
      viewName:
        "HomeView",
      titleKey:
        "routes.home",
      titleFallback:
        "Inicio",
      order:
        10,
      render:
        renderHomeView,
    }),

    privateRoute({
      path:
        ROUTE_PATHS.INCIDENCIAS,
      name:
        ROUTE_NAMES.INCIDENCIAS,
      viewKey:
        ROUTE_VIEW_KEYS.INCIDENCIAS,
      viewName:
        "IncidenciasView",
      titleKey:
        "routes.incidencias",
      titleFallback:
        "Incidencias",
      order:
        20,
      render:
        renderIncidenciasView,
    }),

    privateRoute({
      path:
        ROUTE_PATHS.FACTURAS,
      name:
        ROUTE_NAMES.FACTURAS,
      viewKey:
        ROUTE_VIEW_KEYS.FACTURAS,
      viewName:
        "FacturasView",
      titleKey:
        "routes.facturas",
      titleFallback:
        "Facturas",
      order:
        30,
      render:
        renderFacturasView,
    }),

    adminRoute({
      path:
        ROUTE_PATHS.USUARIOS,
      name:
        ROUTE_NAMES.USUARIOS,
      viewKey:
        ROUTE_VIEW_KEYS.USUARIOS,
      viewName:
        "UsuariosView",
      titleKey:
        "routes.usuarios",
      titleFallback:
        "Usuarios",
      order:
        40,
      render:
        renderUsuariosView,
    }),

    adminRoute({
      path:
        ROUTE_PATHS.CLIENTES,
      name:
        ROUTE_NAMES.CLIENTES,
      viewKey:
        ROUTE_VIEW_KEYS.CLIENTES,
      viewName:
        "ClientesView",
      titleKey:
        "routes.clientes",
      titleFallback:
        "Clientes",
      order:
        50,
      render:
        renderClientesView,
    }),

    privateRoute({
      path:
        ROUTE_PATHS.CUENTA,
      name:
        ROUTE_NAMES.CUENTA,
      viewKey:
        ROUTE_VIEW_KEYS.CUENTA,
      viewName:
        "CuentaView",
      titleKey:
        "routes.cuenta",
      titleFallback:
        "Cuenta",
      order:
        60,
      render:
        renderCuentaView,
    }),

    privateRoute({
      path:
        ROUTE_PATHS.AJUSTES,
      name:
        ROUTE_NAMES.AJUSTES,
      viewKey:
        ROUTE_VIEW_KEYS.AJUSTES,
      viewName:
        "AjustesView",
      titleKey:
        "routes.ajustes",
      titleFallback:
        "Ajustes",
      order:
        70,
      render:
        renderAjustesView,
    }),

    adminRoute({
      path:
        ROUTE_PATHS.SERVIDOR,
      name:
        ROUTE_NAMES.SERVIDOR,
      viewKey:
        ROUTE_VIEW_KEYS.SERVIDOR,
      viewName:
        "ServerView",
      titleKey:
        "routes.servidor",
      titleFallback:
        "Servidor",
      order:
        80,
      render:
        renderServidorView,
    }),

    publicAuthRoute({
      path:
        ROUTE_PATHS.LOGIN,
      name:
        ROUTE_NAMES.LOGIN,
      viewKey:
        ROUTE_VIEW_KEYS.LOGIN,
      viewName:
        "LoginView",
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
        "ActivateAccountView",
      titleKey:
        "routes.activateAccount",
      titleFallback:
        "Activar cuenta",
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
        "ResetPasswordView",
      titleKey:
        "routes.resetPassword",
      titleFallback:
        "Recuperar acceso",
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
        "ConfirmResetPasswordView",
      titleKey:
        "routes.resetPasswordConfirm",
      titleFallback:
        "Nueva contraseña",
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
        "ResetPasswordView",
      titleKey:
        "routes.forgotPassword",
      titleFallback:
        "Recuperar acceso",
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
        "ResetPasswordView",
      titleKey:
        "routes.recoverPassword",
      titleFallback:
        "Recuperar acceso",
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
        "ResetPasswordView",
      titleKey:
        "routes.passwordReset",
      titleFallback:
        "Recuperar acceso",
      order:
        1050,
      render:
        renderResetPasswordView,
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

  ROUTES_CACHE =
    Object.freeze(
      createRoutes()
    );

  return ROUTES_CACHE;
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
    incidencias.viewName !== "IncidenciasView"
  ) {
    throw new Error(
      "Router: la ruta '/incidencias' debe usar viewName 'IncidenciasView'."
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
    facturas.viewName !== "FacturasView"
  ) {
    throw new Error(
      "Router: la ruta '/facturas' debe usar viewName 'FacturasView'."
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
      "/incidencias" en "/" y romper el boot.
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
   DEBUG HELPERS
========================================================= */

export function getRoutesSnapshot() {
  return getImmutableRoutes().map((route) => ({
    id:
      route.id,

    path:
      route.path,

    canonicalPath:
      route.canonicalPath,

    name:
      route.name,

    viewKey:
      route.viewKey,

    viewName:
      route.viewName,

    renderViewKey:
      route.render?.routeViewKey ||
      route.render?.routeViewName ||
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

    layout:
      route.layout,

    authScreen:
      route.authScreen,

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

export function getRouteByPath(path = "/") {
  const normalizedPath =
    normalizeRoutePath(path);

  return (
    getImmutableRoutes().find(
      (route) => route.path === normalizedPath
    ) || null
  );
}

export function getRouteDebug(path = "/") {
  const route =
    getRouteByPath(path);

  if (!route) {
    return {
      found:
        false,
      path:
        normalizeRoutePath(path),
    };
  }

  return {
    found:
      true,
    id:
      route.id,
    path:
      route.path,
    canonicalPath:
      route.canonicalPath,
    name:
      route.name,
    viewKey:
      route.viewKey,
    viewName:
      route.viewName,
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
    layout:
      route.layout,
    roles:
      route.roles,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTE_PATHS,
  ROUTE_NAMES,
  ROUTE_VIEW_KEYS,
  ADMIN_ROLES,

  createRoutes,
  getImmutableRoutes,
  validateRoutesTable,

  getRoutesSnapshot,
  getRouteByPath,
  getRouteDebug,
};

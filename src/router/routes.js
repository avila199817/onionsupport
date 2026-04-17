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
========================================================= */

import { I18n } from "../i18n/index.js";

import { LoginView } from "../views/login/index.js";
import { ResetPasswordView } from "../views/password-reset/index.js";
import { ConfirmResetPasswordView } from "../views/password-reset/confirm/index.js";
import { HomeView } from "../views/home/index.js";
import { IncidenciasView } from "../views/incidencias/index.js";
import { FacturasView } from "../views/facturas/index.js";
import { ServerView } from "../views/serverView.js";
import { UsuariosView } from "../views/usuarios/index.js";
import { ClientesView } from "../views/clientes/index.js";
import { CuentaView } from "../views/cuentaView.js";
import { AjustesView } from "../views/ajustes/index.js";

/* =========================================================
   I18N
========================================================= */

function t(
  key,
  fallback = "",
  params = {}
) {
  try {
    return (
      I18n.t(
        key,
        params,
        fallback
      ) ||
      fallback ||
      key
    );
  } catch {
    return fallback || key;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function safeRun(fn) {
  return async function wrappedRouteRender(
    ...args
  ) {
    try {
      return await Promise.resolve(
        fn(...args)
      );
    } catch (error) {
      console.error(
        "[Router Route Error]",
        error
      );
      throw error;
    }
  };
}

function resolveRouteTitle(route) {
  if (!route) {
    return "";
  }

  return t(
    route.titleKey,
    route.titleFallback ||
      route.name ||
      ""
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

function normalizeRoles(roles) {
  return toArray(roles)
    .flat()
    .map((role) =>
      String(role || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

function normalizeRoutePath(
  path = "/"
) {
  const normalized = String(
    path || "/"
  )
    .trim()
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
    return (
      prefixed.replace(
        /\/+$/,
        ""
      ) || "/"
    );
  }

  return prefixed;
}

function buildRouteId({
  path = "/",
  name = "route",
} = {}) {
  const cleanPath =
    normalizeRoutePath(path)
      .replace(/^\//, "")
      .replace(/\//g, "_") ||
    "root";

  return `${name}:${cleanPath}`;
}

function normalizeMeta(
  definition = {}
) {
  const publicRoute =
    definition.public === true;

  const guestOnly =
    publicRoute &&
    definition.hideShell === true &&
    normalizeRoutePath(
      definition.path || "/"
    ) === "/login";

  const roles =
    normalizeRoles(
      definition.roles
    );

  const requiresAuth =
    publicRoute !== true;

  return Object.freeze({
    order: Number(
      definition.order || 0
    ),
    source:
      definition.source ||
      "router:routes",
    requiresAuth,
    private:
      requiresAuth,
    guestOnly:
      definition.guestOnly === true ||
      guestOnly,
    publicOnly:
      definition.guestOnly === true ||
      guestOnly,
    roles,
    allowRoles: roles,
  });
}

function createRoute(
  definition = {}
) {
  const normalizedPath =
    normalizeRoutePath(
      definition.path || "/"
    );

  const normalizedName =
    String(
      definition.name || "route"
    ).trim() || "route";

  const normalizedRoles =
    normalizeRoles(
      definition.roles
    );

  const publicRoute =
    definition.public === true;

  const meta =
    normalizeMeta({
      ...definition,
      roles: normalizedRoles,
      public: publicRoute,
      path: normalizedPath,
    });

  const route = {
    id: buildRouteId({
      path: normalizedPath,
      name: normalizedName,
    }),

    path: normalizedPath,
    name: normalizedName,

    titleKey:
      definition.titleKey || "",

    titleFallback:
      definition.titleFallback ||
      definition.name ||
      "",

    public: publicRoute,

    requiresAuth:
      meta.requiresAuth,

    guestOnly:
      meta.guestOnly,

    roles:
      normalizedRoles,

    hideShell:
      definition.hideShell === true,

    render: safeRun(
      definition.render ||
        (() => null)
    ),

    meta,
  };

  Object.defineProperty(
    route,
    "title",
    {
      enumerable: true,
      configurable: false,
      get() {
        return resolveRouteTitle(
          route
        );
      },
    }
  );

  return Object.freeze(route);
}

function resolveViewRenderer(view) {
  if (
    typeof view ===
    "function"
  ) {
    return view;
  }

  /*
    IMPORTANTE:
    Priorizamos init() antes que render()
    porque vistas auth y otras vistas complejas
    pueden necesitar preparar estado antes del paint.
  */
  if (
    view &&
    typeof view.init ===
      "function"
  ) {
    return view.init.bind(view);
  }

  if (
    view &&
    typeof view.render ===
      "function"
  ) {
    return view.render.bind(view);
  }

  return () => null;
}

function createViewAdapter(view) {
  const renderer =
    resolveViewRenderer(view);

  return safeRun(
    (...args) =>
      renderer(...args)
  );
}

/* =========================================================
   VIEW ADAPTERS
========================================================= */

const renderHomeView =
  createViewAdapter(
    HomeView
  );

const renderIncidenciasView =
  createViewAdapter(
    IncidenciasView
  );

const renderFacturasView =
  createViewAdapter(
    FacturasView
  );

const renderUsuariosView =
  createViewAdapter(
    UsuariosView
  );

const renderClientesView =
  createViewAdapter(
    ClientesView
  );

const renderCuentaView =
  createViewAdapter(
    CuentaView
  );

const renderAjustesView =
  createViewAdapter(
    AjustesView
  );

const renderServidorView =
  createViewAdapter(
    ServerView
  );

const renderLoginView =
  createViewAdapter(
    LoginView
  );

const renderResetPasswordView =
  createViewAdapter(
    ResetPasswordView
  );

const renderConfirmResetPasswordView =
  createViewAdapter(
    ConfirmResetPasswordView
  );

/* =========================================================
   ROUTES FACTORY
========================================================= */

export function createRoutes() {
  return [
    createRoute({
      path: "/",
      name: "home",
      titleKey:
        "routes.home",
      titleFallback:
        "Onion Support",
      public: false,
      roles: [],
      hideShell: false,
      order: 10,
      render:
        renderHomeView,
    }),

    createRoute({
      path:
        "/incidencias",
      name:
        "incidencias",
      titleKey:
        "routes.incidencias",
      titleFallback:
        "Incidencias",
      public: false,
      roles: [],
      hideShell: false,
      order: 20,
      render:
        renderIncidenciasView,
    }),

    createRoute({
      path:
        "/facturas",
      name:
        "facturas",
      titleKey:
        "routes.facturas",
      titleFallback:
        "Facturas",
      public: false,
      roles: [],
      hideShell: false,
      order: 30,
      render:
        renderFacturasView,
    }),

    createRoute({
      path:
        "/usuarios",
      name:
        "usuarios",
      titleKey:
        "routes.usuarios",
      titleFallback:
        "Usuarios",
      public: false,
      roles: ["admin"],
      hideShell: false,
      order: 40,
      render:
        renderUsuariosView,
    }),

    createRoute({
      path:
        "/clientes",
      name:
        "clientes",
      titleKey:
        "routes.clientes",
      titleFallback:
        "Clientes",
      public: false,
      roles: ["admin"],
      hideShell: false,
      order: 50,
      render:
        renderClientesView,
    }),

    createRoute({
      path:
        "/cuenta",
      name:
        "cuenta",
      titleKey:
        "routes.cuenta",
      titleFallback:
        "Cuenta",
      public: false,
      roles: [],
      hideShell: false,
      order: 60,
      render:
        renderCuentaView,
    }),

    createRoute({
      path:
        "/ajustes",
      name:
        "ajustes",
      titleKey:
        "routes.ajustes",
      titleFallback:
        "Ajustes",
      public: false,
      roles: [],
      hideShell: false,
      order: 70,
      render:
        renderAjustesView,
    }),

    createRoute({
      path:
        "/servidor",
      name:
        "servidor",
      titleKey:
        "routes.servidor",
      titleFallback:
        "Servidor",
      public: false,
      roles: ["admin"],
      hideShell: false,
      order: 80,
      render:
        renderServidorView,
    }),

    createRoute({
      path:
        "/login",
      name: "login",
      titleKey:
        "routes.login",
      titleFallback:
        "Acceso",
      public: true,
      roles: [],
      hideShell: true,
      guestOnly: true,
      order: 1000,
      render:
        renderLoginView,
    }),

    createRoute({
      path:
        "/reset-password",
      name:
        "reset-password",
      titleKey:
        "routes.resetPassword",
      titleFallback:
        "Recuperar acceso",
      public: true,
      roles: [],
      hideShell: true,
      order: 1010,
      render:
        renderResetPasswordView,
    }),

    createRoute({
      path:
        "/reset-password/confirm",
      name:
        "reset-password-confirm",
      titleKey:
        "routes.resetPasswordConfirm",
      titleFallback:
        "Nueva contraseña",
      public: true,
      roles: [],
      hideShell: true,
      order: 1020,
      render:
        renderConfirmResetPasswordView,
    }),
  ];
}

/* =========================================================
   IMMUTABLE TABLE
========================================================= */

let ROUTES_CACHE = null;

export function getImmutableRoutes() {
  if (
    ROUTES_CACHE
  ) {
    return ROUTES_CACHE;
  }

  ROUTES_CACHE =
    Object.freeze(
      createRoutes()
    );

  return ROUTES_CACHE;
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateRoutesTable(
  AppCore,
  routes,
  normalizeCanonicalPath
) {
  if (!Array.isArray(routes)) {
    throw new Error(
      "Router: tabla de rutas inválida."
    );
  }

  const seen =
    new Set();
  const seenNames =
    new Set();
  const allowedPublicAuthRoutes =
    new Set([
      "/login",
      "/reset-password",
      "/reset-password/confirm",
    ]);

  routes.forEach(
    (route, index) => {
      if (
        !route ||
        typeof route !==
          "object"
      ) {
        throw new Error(
          `Router: ruta inválida en índice ${index}.`
        );
      }

      const normalizedPath =
        normalizeCanonicalPath(
          AppCore,
          route.path || "/"
        );

      if (
        !normalizedPath ||
        !normalizedPath.startsWith(
          "/"
        )
      ) {
        throw new Error(
          `Router: path inválido "${route.path}".`
        );
      }

      if (
        seen.has(
          normalizedPath
        )
      ) {
        throw new Error(
          `Router: ruta duplicada "${normalizedPath}".`
        );
      }

      if (
        typeof route.name !==
          "string" ||
        !route.name.trim()
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" no tiene name válido.`
        );
      }

      const normalizedName =
        route.name
          .trim()
          .toLowerCase();

      if (
        seenNames.has(
          normalizedName
        )
      ) {
        throw new Error(
          `Router: nombre de ruta duplicado "${route.name}".`
        );
      }

      if (
        typeof route.render !==
        "function"
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" no tiene render().`
        );
      }

      if (
        !Array.isArray(
          route.roles
        )
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" tiene roles inválidos.`
        );
      }

      if (
        route.roles.some(
          (role) =>
            typeof role !==
              "string" ||
            !role.trim()
        )
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" tiene roles vacíos o inválidos.`
        );
      }

      if (
        typeof route.public !==
        "boolean"
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" tiene public inválido.`
        );
      }

      if (
        typeof route.hideShell !==
        "boolean"
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" tiene hideShell inválido.`
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
        !route.hideShell &&
        allowedPublicAuthRoutes.has(
          normalizedPath
        )
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
        typeof route.meta !==
          "object" ||
        !route.meta
      ) {
        throw new Error(
          `Router: la ruta "${normalizedPath}" no tiene meta válido.`
        );
      }

      seen.add(
        normalizedPath
      );
      seenNames.add(
        normalizedName
      );
    }
  );

  return true;
}

export default {
  createRoutes,
  getImmutableRoutes,
  validateRoutesTable,
};

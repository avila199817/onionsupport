/* =========================================================
   Onion SPA - Routes
   Archivo: src/router/routes.js

   Responsabilidades:
   - definir la tabla de rutas canónicas de la SPA
   - encapsular adapters de render
   - exponer rutas inmutables
   - validar estructura mínima
   - resolver títulos reactivos vía i18n
   - mantener orden consistente con sidebar/router

   HARDENING:
   - lazy title getter
   - safe render wrappers
   - validación extendida
   - metadata estable
   - soporte para vistas tipo objeto y vistas tipo función
   - integración de rutas auth públicas
   - priorizar init() sobre render() en vistas objeto
========================================================= */

import { I18n } from "../i18n/index.js";

import { LoginView } from "../views/login/index.js";
import { ResetPasswordView } from "../views/password-reset/index.js";
import { HomeView } from "../views/homeView.js";
import { IncidenciasView } from "../views/incidencias/index.js";
import { FacturasView } from "../views/facturas/index.js";
import { ServerView } from "../views/serverView.js";
import { UsuariosView } from "../views/usuariosView.js";
import { ClientesView } from "../views/clientesView.js";
import { CuentaView } from "../views/cuentaView.js";
import { AjustesView } from "../views/ajustesView.js";

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

function resolveRouteTitle(
  route
) {
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

function normalizeRoles(
  roles
) {
  if (
    !Array.isArray(roles)
  ) {
    return [];
  }

  return roles
    .filter(Boolean)
    .map((role) =>
      String(role)
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

function createRoute(
  definition = {}
) {
  const route = {
    path:
      definition.path || "/",

    name:
      definition.name ||
      "route",

    titleKey:
      definition.titleKey ||
      "",

    titleFallback:
      definition.titleFallback ||
      definition.name ||
      "",

    public:
      definition.public ===
      true,

    roles:
      normalizeRoles(
        definition.roles
      ),

    hideShell:
      definition.hideShell ===
      true,

    render: safeRun(
      definition.render ||
        (() => {})
    ),
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

  return Object.freeze(
    route
  );
}

function resolveViewRenderer(
  view
) {
  if (
    typeof view ===
    "function"
  ) {
    return view;
  }

  /*
    IMPORTANTE:
    Priorizamos init() antes que render()
    porque vistas como IncidenciasView
    cargan datos dentro de init().
  */
  if (
    view &&
    typeof view.init ===
      "function"
  ) {
    return view.init.bind(
      view
    );
  }

  if (
    view &&
    typeof view.render ===
      "function"
  ) {
    return view.render.bind(
      view
    );
  }

  return () => {};
}

function createViewAdapter(
  view
) {
  const renderer =
    resolveViewRenderer(
      view
    );

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
      render:
        renderResetPasswordView,
    }),
  ];
}

/* =========================================================
   IMMUTABLE TABLE
========================================================= */

let ROUTES_CACHE =
  null;

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
  if (
    !Array.isArray(routes)
  ) {
    throw new Error(
      "Router: tabla de rutas inválida."
    );
  }

  const seen =
    new Set();

  routes.forEach(
    (
      route,
      index
    ) => {
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

      seen.add(
        normalizedPath
      );
    }
  );

  return true;
}

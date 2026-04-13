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
========================================================= */

import { I18n } from "../i18n/index.js";

import { LoginView } from "../views/login/index.js";
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
  return async function wrappedRouteRender(...args) {
    return await Promise.resolve(
      fn(...args)
    );
  };
}

function resolveRouteTitle(route) {
  if (!route) return "";

  return t(
    route.titleKey,
    route.titleFallback || route.name || ""
  );
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .filter(Boolean)
    .map((role) =>
      String(role).trim()
    )
    .filter(Boolean);
}

function createRoute(definition = {}) {
  const route = {
    path:
      definition.path || "/",

    name:
      definition.name || "route",

    titleKey:
      definition.titleKey || "",

    titleFallback:
      definition.titleFallback ||
      definition.name ||
      "",

    public:
      definition.public === true,

    roles:
      normalizeRoles(
        definition.roles
      ),

    hideShell:
      definition.hideShell === true,

    render:
      safeRun(
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

  return Object.freeze(route);
}

/* =========================================================
   VIEW ADAPTERS
========================================================= */
const renderHomeView =
  safeRun(() =>
    HomeView.render?.()
  );

const renderIncidenciasView =
  safeRun(() =>
    IncidenciasView.init?.()
  );

const renderFacturasView =
  safeRun(() =>
    FacturasView.render?.()
  );

const renderUsuariosView =
  safeRun(() =>
    UsuariosView.render?.()
  );

const renderClientesView =
  safeRun(() =>
    ClientesView.render?.()
  );

const renderCuentaView =
  safeRun(() =>
    CuentaView.render?.()
  );

const renderAjustesView =
  safeRun(() =>
    AjustesView.render?.()
  );

const renderServidorView =
  safeRun(() =>
    ServerView.render?.()
  );

const renderLoginView =
  safeRun(() =>
    LoginView.render?.()
  );

/* =========================================================
   ROUTES FACTORY
========================================================= */
export function createRoutes() {
  return [
    createRoute({
      path: "/",
      name: "home",
      titleKey: "routes.home",
      titleFallback:
        "Onion Support",
      public: false,
      roles: [],
      hideShell: false,
      render: renderHomeView,
    }),

    createRoute({
      path: "/incidencias",
      name: "incidencias",
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
      path: "/facturas",
      name: "facturas",
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
      path: "/usuarios",
      name: "usuarios",
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
      path: "/clientes",
      name: "clientes",
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
      path: "/cuenta",
      name: "cuenta",
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
      path: "/ajustes",
      name: "ajustes",
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
      path: "/servidor",
      name: "servidor",
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
      path: "/login",
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
  ];
}

/* =========================================================
   IMMUTABLE TABLE
========================================================= */
export function getImmutableRoutes() {
  return Object.freeze(
    createRoutes()
  );
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

  const seen = new Set();

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

      seen.add(
        normalizedPath
      );
    }
  );
}

/* =========================================================
   Onion SPA - Routes
   Archivo: src/router/routes.js

   Responsabilidades:
   - definir la tabla de rutas canónicas de la SPA
   - encapsular los adapters de render de vistas
   - exponer rutas inmutables
   - validar la estructura mínima de cada ruta
   - resolver títulos vía i18n
   - mantener orden consistente con sidebar y navegación real
========================================================= */

import { I18n } from "../i18n/index.js";

import { LoginView } from "../views/loginView.js";
import { HomeView } from "../views/homeView.js";
import { IncidenciasView } from "../views/incidenciasView.js";
import { FacturasView } from "../views/facturas/index.js";
import { ServerView } from "../views/serverView.js";
import { UsuariosView } from "../views/usuariosView.js";
import { ClientesView } from "../views/clientesView.js";
import { CuentaView } from "../views/cuentaView.js";
import { AjustesView } from "../views/ajustesView.js";

function t(key, fallback = "", params = {}) {
  try {
    return I18n.t(key, params, fallback);
  } catch {
    return fallback || key;
  }
}

function renderHomeView() {
  HomeView.render();
}

function renderIncidenciasView() {
  IncidenciasView.render();
}

function renderFacturasView() {
  FacturasView.render();
}

function renderUsuariosView() {
  UsuariosView.render();
}

function renderClientesView() {
  ClientesView.render();
}

function renderCuentaView() {
  CuentaView.render();
}

function renderAjustesView() {
  AjustesView.render();
}

function renderServidorView() {
  ServerView.render();
}

function renderLoginView() {
  LoginView.render();
}

export function createRoutes() {
  return [
    {
      path: "/",
      name: "home",
      title: t("routes.home", "Onion Support"),
      public: false,
      roles: [],
      hideShell: false,
      render: renderHomeView,
    },
    {
      path: "/incidencias",
      name: "incidencias",
      title: t("routes.incidencias", "Incidencias"),
      public: false,
      roles: [],
      hideShell: false,
      render: renderIncidenciasView,
    },
    {
      path: "/facturas",
      name: "facturas",
      title: t("routes.facturas", "Facturas"),
      public: false,
      roles: [],
      hideShell: false,
      render: renderFacturasView,
    },
    {
      path: "/usuarios",
      name: "usuarios",
      title: t("routes.usuarios", "Usuarios"),
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderUsuariosView,
    },
    {
      path: "/clientes",
      name: "clientes",
      title: t("routes.clientes", "Clientes"),
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderClientesView,
    },
    {
      path: "/cuenta",
      name: "cuenta",
      title: t("routes.cuenta", "Cuenta"),
      public: false,
      roles: [],
      hideShell: false,
      render: renderCuentaView,
    },
    {
      path: "/ajustes",
      name: "ajustes",
      title: t("routes.ajustes", "Ajustes"),
      public: false,
      roles: [],
      hideShell: false,
      render: renderAjustesView,
    },
    {
      path: "/servidor",
      name: "servidor",
      title: t("routes.servidor", "Servidor"),
      public: false,
      roles: ["admin"],
      hideShell: false,
      render: renderServidorView,
    },
    {
      path: "/login",
      name: "login",
      title: t("routes.login", "Acceso"),
      public: true,
      roles: [],
      hideShell: true,
      render: renderLoginView,
    },
  ];
}

export function getImmutableRoutes() {
  return Object.freeze(
    createRoutes().map((route) => Object.freeze({ ...route }))
  );
}

export function validateRoutesTable(AppCore, routes, normalizeCanonicalPath) {
  const seen = new Set();

  routes.forEach((route) => {
    if (!route || typeof route !== "object") {
      throw new Error("Router: existe una ruta inválida en la tabla.");
    }

    const normalizedPath = normalizeCanonicalPath(
      AppCore,
      route.path || "/"
    );

    if (!normalizedPath.startsWith("/")) {
      throw new Error(`Router: ruta inválida "${route.path}".`);
    }

    if (seen.has(normalizedPath)) {
      throw new Error(`Router: ruta duplicada detectada "${normalizedPath}".`);
    }

    if (typeof route.render !== "function") {
      throw new Error(`Router: la ruta "${normalizedPath}" no tiene render().`);
    }

    seen.add(normalizedPath);
  });
}

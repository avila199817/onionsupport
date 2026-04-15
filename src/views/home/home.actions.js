/* =========================================================
   Onion SPA - Home Actions
   Archivo: src/views/home/home.actions.js

   Responsabilidades:
   - centralizar acciones de la vista Home
   - encapsular navegación interna del dashboard
   - exponer helpers de refresh / hydrate futuros
   - mantener compatibilidad con AppCore / Router
   - devolver resultados estables para la vista
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";

/* =========================================================
   HELPERS
========================================================= */

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch (error) {
    console.warn(
      "[HomeActions] emit warning",
      error
    );
  }
}

function createResult({
  ok = true,
  action = "",
  data = null,
  error = null,
} = {}) {
  return {
    ok: ok === true,
    action: safeText(action),
    data,
    error,
  };
}

function getRouter() {
  return Router || null;
}

function resolveTargetPath(path = "/") {
  const finalPath = safeText(
    path,
    "/"
  );

  return finalPath.startsWith("/")
    ? finalPath
    : `/${finalPath}`;
}

/* =========================================================
   NAVIGATION
========================================================= */

export async function navigateTo(
  path = "/"
) {
  const target =
    resolveTargetPath(path);

  try {
    safeEmit(
      "home:action:navigate:start",
      {
        target,
      }
    );

    const router =
      getRouter();

    if (
      router &&
      typeof router.navigate ===
        "function"
    ) {
      await Promise.resolve(
        router.navigate(target)
      );
    } else if (
      typeof window !==
        "undefined"
    ) {
      window.location.hash =
        `#${target}`;
    }

    safeEmit(
      "home:action:navigate:success",
      {
        target,
      }
    );

    return createResult({
      ok: true,
      action: "navigate",
      data: {
        target,
      },
    });
  } catch (error) {
    console.error(
      "[HomeActions] navigateTo error",
      error
    );

    safeEmit(
      "home:action:navigate:error",
      {
        target,
        error,
      }
    );

    return createResult({
      ok: false,
      action: "navigate",
      error,
      data: {
        target,
      },
    });
  }
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

export async function openIncidencias() {
  return navigateTo(
    "/incidencias"
  );
}

export async function openFacturas() {
  return navigateTo(
    "/facturas"
  );
}

export async function openUsuarios() {
  return navigateTo(
    "/usuarios"
  );
}

export async function openClientes() {
  return navigateTo(
    "/clientes"
  );
}

export async function openCuenta() {
  return navigateTo(
    "/cuenta"
  );
}

export async function openAjustes() {
  return navigateTo(
    "/ajustes"
  );
}

export async function openServidor() {
  return navigateTo(
    "/servidor"
  );
}

/* =========================================================
   REFRESH / HYDRATE
========================================================= */

export async function refreshHome() {
  try {
    safeEmit(
      "home:action:refresh:start",
      {}
    );

    /*
      Placeholder:
      aquí luego podremos lanzar:
      - hydrateHomeSummary()
      - reload widgets
      - refetch quick stats
      - sync recent activity
    */

    const payload = {
      refreshedAt:
        new Date().toISOString(),
    };

    safeEmit(
      "home:action:refresh:success",
      payload
    );

    return createResult({
      ok: true,
      action: "refresh",
      data: payload,
    });
  } catch (error) {
    console.error(
      "[HomeActions] refreshHome error",
      error
    );

    safeEmit(
      "home:action:refresh:error",
      {
        error,
      }
    );

    return createResult({
      ok: false,
      action: "refresh",
      error,
    });
  }
}

export async function hydrateHomeSummary() {
  try {
    safeEmit(
      "home:action:hydrate:start",
      {}
    );

    /*
      Placeholder realista:
      aquí luego meteremos llamadas a:
      - home.api.js
      - incidencias summary
      - facturas summary
      - server health
    */

    const summary = {
      status: "idle",
      generatedAt:
        new Date().toISOString(),
      cards: 1,
    };

    safeEmit(
      "home:action:hydrate:success",
      {
        summary,
      }
    );

    return createResult({
      ok: true,
      action: "hydrate",
      data: summary,
    });
  } catch (error) {
    console.error(
      "[HomeActions] hydrateHomeSummary error",
      error
    );

    safeEmit(
      "home:action:hydrate:error",
      {
        error,
      }
    );

    return createResult({
      ok: false,
      action: "hydrate",
      error,
    });
  }
}

/* =========================================================
   CARD ACTIONS
========================================================= */

export async function handleHomeCardAction(
  action = ""
) {
  const normalized =
    safeText(action)
      .toLowerCase()
      .trim();

  switch (normalized) {
    case "incidencias":
      return openIncidencias();

    case "facturas":
      return openFacturas();

    case "usuarios":
      return openUsuarios();

    case "clientes":
      return openClientes();

    case "cuenta":
      return openCuenta();

    case "ajustes":
      return openAjustes();

    case "servidor":
      return openServidor();

    case "refresh":
      return refreshHome();

    case "hydrate":
      return hydrateHomeSummary();

    default:
      return createResult({
        ok: false,
        action: "unknown",
        error: new Error(
          `Home action no soportada: ${normalized || "empty"}`
        ),
        data: {
          requestedAction:
            normalized,
        },
      });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

export const HomeActions = {
  navigateTo,
  openIncidencias,
  openFacturas,
  openUsuarios,
  openClientes,
  openCuenta,
  openAjustes,
  openServidor,
  refreshHome,
  hydrateHomeSummary,
  handleHomeCardAction,
};

export default HomeActions;

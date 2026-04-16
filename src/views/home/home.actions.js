/* =========================================================
   Onion SPA - Home Actions
   Archivo: src/views/home/home.actions.js

   FINAL PRO SYSTEM · ACTIONS REAL · 10/10

   Responsabilidades:
   - centralizar acciones reales de la vista Home
   - encapsular navegación interna del dashboard
   - exponer helpers de refresh / hydrate reales
   - mantener compatibilidad con AppCore / Router
   - devolver resultados estables para la vista
   - actualizar estado UI del módulo Home
   - emitir eventos consistentes para tracing
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";

import {
  loadHomeSummary,
  refreshHomeSummary,
} from "./home.api.js";

import {
  getHomeSnapshot,
  getHomeStatus,
  setHomeAction,
  setHomeSelectedCard,
  patchHomeUi,
} from "./home.store.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeEmit(
  eventName,
  payload = {}
) {
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

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {
    console.warn(...args);
  }
}

function createResult({
  ok = true,
  action = "",
  data = null,
  error = null,
  target = "",
  meta = {},
} = {}) {
  return {
    ok: ok === true,
    action: safeText(action),
    target: safeText(target, ""),
    data,
    error: error || null,
    meta: safeObject(meta),
  };
}

function getRouter() {
  if (
    Router &&
    typeof Router.navigate ===
      "function"
  ) {
    return Router;
  }

  if (
    AppCore?.modules?.Router &&
    typeof AppCore.modules.Router
      .navigate === "function"
  ) {
    return AppCore.modules.Router;
  }

  if (
    AppCore?.Router &&
    typeof AppCore.Router.navigate ===
      "function"
  ) {
    return AppCore.Router;
  }

  return null;
}

function resolveTargetPath(
  path = "/"
) {
  const finalPath = safeText(
    path,
    "/"
  );

  if (
    finalPath.startsWith("/")
  ) {
    return finalPath;
  }

  return `/${finalPath}`;
}

function updateUiActionState({
  action = "",
  card = "",
} = {}) {
  try {
    if (action) {
      setHomeAction(action);
    }

    if (card) {
      setHomeSelectedCard(card);
    }

    patchHomeUi({
      lastAction: safeText(
        action,
        ""
      ),
      activeCard: safeText(
        card,
        ""
      ),
    });
  } catch (error) {
    safeWarn(
      "[HomeActions] UI state warning",
      error
    );
  }
}

function buildActionMeta(
  extra = {}
) {
  return {
    homeStatus: getHomeStatus(),
    ...safeObject(extra),
  };
}

function resolveActionTarget(
  action = ""
) {
  const normalized =
    safeText(action)
      .toLowerCase()
      .trim();

  switch (normalized) {
    case "incidencias":
    case "tickets":
    case "ticket":
    case "open-incidencias":
    case "go-incidencias":
    case "go-tickets":
      return {
        kind: "navigate",
        action: "incidencias",
        target: "/incidencias",
      };

    case "facturas":
    case "billing":
    case "invoice":
    case "invoices":
    case "open-facturas":
    case "go-facturas":
      return {
        kind: "navigate",
        action: "facturas",
        target: "/facturas",
      };

    case "usuarios":
    case "users":
    case "user":
    case "open-usuarios":
    case "go-usuarios":
      return {
        kind: "navigate",
        action: "usuarios",
        target: "/usuarios",
      };

    case "clientes":
    case "clients":
    case "client":
    case "open-clientes":
    case "go-clientes":
      return {
        kind: "navigate",
        action: "clientes",
        target: "/clientes",
      };

    case "cuenta":
    case "account":
    case "mi-cuenta":
    case "open-cuenta":
    case "go-cuenta":
      return {
        kind: "navigate",
        action: "cuenta",
        target: "/cuenta",
      };

    case "ajustes":
    case "settings":
    case "config":
    case "configuracion":
    case "open-ajustes":
    case "go-ajustes":
      return {
        kind: "navigate",
        action: "ajustes",
        target: "/ajustes",
      };

    case "servidor":
    case "server":
    case "health":
    case "status":
    case "open-servidor":
    case "go-servidor":
      return {
        kind: "navigate",
        action: "servidor",
        target: "/servidor",
      };

    case "refresh":
    case "reload":
    case "update":
    case "actualizar":
      return {
        kind: "refresh",
        action: "refresh",
      };

    case "hydrate":
    case "load":
    case "sync":
    case "resync":
      return {
        kind: "hydrate",
        action: "hydrate",
      };

    default:
      return {
        kind: "unknown",
        action: normalized,
      };
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

export async function navigateTo(
  path = "/",
  options = {}
) {
  const target =
    resolveTargetPath(path);

  const meta =
    safeObject(options);

  try {
    updateUiActionState({
      action: "navigate",
      card:
        meta.card ||
        meta.action ||
        "",
    });

    safeEmit(
      "home:action:navigate:start",
      {
        target,
        meta,
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
        router.navigate(target, {
          ...meta,
          force:
            meta.force === true,
        })
      );
    } else if (
      typeof window !==
      "undefined"
    ) {
      window.location.hash =
        `#${target}`;
    } else {
      throw new Error(
        "No hay Router disponible para navegar."
      );
    }

    safeEmit(
      "home:action:navigate:success",
      {
        target,
        meta,
      }
    );

    return createResult({
      ok: true,
      action: "navigate",
      target,
      data: {
        target,
      },
      meta: buildActionMeta(meta),
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
        meta,
        error,
      }
    );

    return createResult({
      ok: false,
      action: "navigate",
      target,
      error,
      data: {
        target,
      },
      meta: buildActionMeta(meta),
    });
  }
}

/* =========================================================
   QUICK NAV ACTIONS
========================================================= */

export async function openIncidencias(
  options = {}
) {
  return navigateTo(
    "/incidencias",
    {
      ...safeObject(options),
      action: "incidencias",
      card: "incidencias",
    }
  );
}

export async function openFacturas(
  options = {}
) {
  return navigateTo(
    "/facturas",
    {
      ...safeObject(options),
      action: "facturas",
      card: "facturas",
    }
  );
}

export async function openUsuarios(
  options = {}
) {
  return navigateTo(
    "/usuarios",
    {
      ...safeObject(options),
      action: "usuarios",
      card: "usuarios",
    }
  );
}

export async function openClientes(
  options = {}
) {
  return navigateTo(
    "/clientes",
    {
      ...safeObject(options),
      action: "clientes",
      card: "clientes",
    }
  );
}

export async function openCuenta(
  options = {}
) {
  return navigateTo(
    "/cuenta",
    {
      ...safeObject(options),
      action: "cuenta",
      card: "cuenta",
    }
  );
}

export async function openAjustes(
  options = {}
) {
  return navigateTo(
    "/ajustes",
    {
      ...safeObject(options),
      action: "ajustes",
      card: "ajustes",
    }
  );
}

export async function openServidor(
  options = {}
) {
  return navigateTo(
    "/servidor",
    {
      ...safeObject(options),
      action: "servidor",
      card: "servidor",
    }
  );
}

/* =========================================================
   REFRESH / HYDRATE
========================================================= */

export async function refreshHome(
  options = {}
) {
  const meta =
    safeObject(options);

  try {
    updateUiActionState({
      action: "refresh",
      card:
        meta.card ||
        "refresh",
    });

    safeEmit(
      "home:action:refresh:start",
      meta
    );

    const result =
      await refreshHomeSummary();

    safeEmit(
      "home:action:refresh:success",
      {
        result,
      }
    );

    return createResult({
      ok:
        result?.ok === true,
      action: "refresh",
      data: result,
      error:
        result?.error || null,
      meta: buildActionMeta({
        ...meta,
        source:
          result?.source ||
          "",
        remoteOk:
          result?.remoteOk ===
          true,
        degraded:
          result?.degraded ===
          true,
        cacheHit:
          result?.cacheHit ===
          true,
      }),
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
        meta,
      }
    );

    return createResult({
      ok: false,
      action: "refresh",
      error,
      meta: buildActionMeta(meta),
    });
  }
}

export async function hydrateHomeSummary(
  options = {}
) {
  const meta =
    safeObject(options);

  try {
    updateUiActionState({
      action: "hydrate",
      card:
        meta.card ||
        "hydrate",
    });

    safeEmit(
      "home:action:hydrate:start",
      meta
    );

    const result =
      await loadHomeSummary({
        force:
          meta.force === true,
        preferCache:
          meta.preferCache !==
          false,
      });

    safeEmit(
      "home:action:hydrate:success",
      {
        result,
      }
    );

    return createResult({
      ok:
        result?.ok === true,
      action: "hydrate",
      data: result,
      error:
        result?.error || null,
      meta: buildActionMeta({
        ...meta,
        source:
          result?.source ||
          "",
        remoteOk:
          result?.remoteOk ===
          true,
        degraded:
          result?.degraded ===
          true,
        cacheHit:
          result?.cacheHit ===
          true,
      }),
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
        meta,
      }
    );

    return createResult({
      ok: false,
      action: "hydrate",
      error,
      meta: buildActionMeta(meta),
    });
  }
}

/* =========================================================
   CARD / QUICK ACTION RESOLUTION
========================================================= */

export async function executeHomeAction(
  action = "",
  options = {}
) {
  const resolved =
    resolveActionTarget(action);

  const meta =
    safeObject(options);

  switch (resolved.kind) {
    case "navigate":
      return navigateTo(
        resolved.target,
        {
          ...meta,
          action:
            resolved.action,
          card:
            meta.card ||
            resolved.action,
        }
      );

    case "refresh":
      return refreshHome({
        ...meta,
        action:
          resolved.action,
        card:
          meta.card ||
          resolved.action,
      });

    case "hydrate":
      return hydrateHomeSummary({
        ...meta,
        action:
          resolved.action,
        card:
          meta.card ||
          resolved.action,
      });

    default:
      return createResult({
        ok: false,
        action: safeText(
          action,
          "unknown"
        ),
        error: new Error(
          `Home action no soportada: ${safeText(action, "empty")}`
        ),
        data: {
          requestedAction:
            safeText(
              action,
              ""
            ),
        },
        meta: buildActionMeta(meta),
      });
  }
}

export async function handleHomeCardAction(
  action = "",
  options = {}
) {
  return executeHomeAction(
    action,
    {
      ...safeObject(options),
      source: "card",
    }
  );
}

export async function handleHomeQuickAction(
  action = "",
  options = {}
) {
  return executeHomeAction(
    action,
    {
      ...safeObject(options),
      source: "quick-action",
    }
  );
}

export async function runQuickActionItem(
  item = {},
  options = {}
) {
  const quickAction =
    safeObject(item);

  const key = safeText(
    quickAction.key,
    ""
  );

  const href = safeText(
    quickAction.href,
    ""
  );

  if (key) {
    const result =
      await handleHomeQuickAction(
        key,
        {
          ...safeObject(options),
          href,
          quickAction,
          card: key,
        }
      );

    if (
      result?.ok === true
    ) {
      return result;
    }
  }

  if (href) {
    return navigateTo(href, {
      ...safeObject(options),
      action:
        key || "navigate",
      card:
        key || "navigate",
      quickAction,
    });
  }

  return createResult({
    ok: false,
    action: "quick-action",
    error: new Error(
      "Quick action sin key ni href resoluble."
    ),
    data: {
      quickAction,
    },
    meta: buildActionMeta(
      options
    ),
  });
}

/* =========================================================
   SELECTORS / SNAPSHOTS
========================================================= */

export function getHomeActionContext() {
  return {
    home: getHomeSnapshot(),
    status: getHomeStatus(),
  };
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

  executeHomeAction,
  handleHomeCardAction,
  handleHomeQuickAction,
  runQuickActionItem,

  getHomeActionContext,
};

export default HomeActions;

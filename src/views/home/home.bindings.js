/* =========================================================
   Onion SPA - Home Bindings
   Archivo: src/views/home/home.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry dashboard
   - export CSV
   - open widget / bloque
   - copy widget id
   - quick actions / navegación
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE = "view:home";

/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[HomeBindings]", ...args);
  } catch {}
}

function resolveScopeName(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function getScope(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  try {
    AppCore?.cleanup?.run?.(finalScope);
  } catch {}

  try {
    return AppCore?.cleanup?.scope?.(finalScope) || finalScope;
  } catch {
    return finalScope;
  }
}

function getContainer() {
  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document
  );
}

function getWidgetId(element) {
  return safeText(
    element?.dataset?.widgetId ||
      element?.getAttribute?.("data-widget-id"),
    ""
  );
}

function getWidgetKey(element) {
  return safeText(
    element?.dataset?.widgetKey ||
      element?.getAttribute?.("data-widget-key"),
    ""
  );
}

function getWidgetRoute(element) {
  return safeText(
    element?.dataset?.route ||
      element?.getAttribute?.("data-route") ||
      element?.dataset?.href ||
      element?.getAttribute?.("data-href"),
    ""
  );
}

function getQuickActionName(element) {
  return safeText(
    element?.dataset?.quickAction ||
      element?.getAttribute?.("data-quick-action") ||
      element?.dataset?.actionName ||
      element?.getAttribute?.("data-action-name"),
    ""
  );
}

function getPayloadFromDataset(element) {
  const raw =
    element?.dataset?.payload ||
    element?.getAttribute?.("data-payload") ||
    "";

  const text = safeText(raw, "");

  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return safeObject(parsed);
  } catch (error) {
    safeWarn("payload JSON inválido", error);
    return {};
  }
}

async function safeReload(reload, loadHomeDashboard) {
  try {
    if (typeof reload === "function") {
      await reload();
      return;
    }

    if (typeof loadHomeDashboard === "function") {
      await loadHomeDashboard({
        force: true,
      });
    }
  } catch (error) {
    safeWarn("reload falló", error);
  }
}

/* =========================================================
   MAIN
========================================================= */

export function bindHomeEvents({
  loadHomeDashboard,
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef = getScope(scope);
  const root = getContainer();

  const refreshBtn = document.getElementById("home-refresh-btn");
  const retryBtn = document.getElementById("home-retry-btn");
  const exportBtn = document.getElementById("home-export-btn");

  /* =========================================
     DIRECT BUTTONS
  ========================================= */

  if (refreshBtn) {
    AppCore.cleanup.on(
      scopeRef,
      refreshBtn,
      "click",
      async (event) => {
        event.preventDefault();
        await safeReload(reload, loadHomeDashboard);
      }
    );
  }

  if (retryBtn) {
    AppCore.cleanup.on(
      scopeRef,
      retryBtn,
      "click",
      async (event) => {
        event.preventDefault();
        await safeReload(reload, loadHomeDashboard);
      }
    );
  }

  if (exportBtn) {
    AppCore.cleanup.on(
      scopeRef,
      exportBtn,
      "click",
      async (event) => {
        event.preventDefault();

        try {
          await exportHomeCsvAction?.();
        } catch (error) {
          safeWarn("export falló", error);
        }
      }
    );
  }

  /* =========================================
     DELEGATED ACTIONS
  ========================================= */

  AppCore.cleanup.on(
    scopeRef,
    root,
    "click",
    async (event) => {
      const openWidgetBtn = event.target?.closest?.(
        '[data-action="open-home-widget"]'
      );

      if (openWidgetBtn) {
        event.preventDefault();
        event.stopPropagation();

        const widgetId =
          getWidgetId(openWidgetBtn) ||
          getWidgetKey(openWidgetBtn);

        if (!widgetId) {
          safeWarn("open-home-widget sin id");
          return;
        }

        try {
          await openHomeWidgetAction?.({
            widgetId,
          });
        } catch (error) {
          safeWarn("openHomeWidgetAction falló", error);
        }

        return;
      }

      const copyWidgetBtn = event.target?.closest?.(
        '[data-action="copy-home-widget-id"]'
      );

      if (copyWidgetBtn) {
        event.preventDefault();
        event.stopPropagation();

        const widgetId =
          getWidgetId(copyWidgetBtn) ||
          getWidgetKey(copyWidgetBtn);

        try {
          await copyHomeWidgetIdAction?.({
            widgetId,
          });
        } catch (error) {
          safeWarn("copyHomeWidgetIdAction falló", error);
        }

        return;
      }

      const quickActionBtn = event.target?.closest?.(
        '[data-action="run-home-quick-action"]'
      );

      if (quickActionBtn) {
        event.preventDefault();
        event.stopPropagation();

        const action = getQuickActionName(quickActionBtn);
        const route = getWidgetRoute(quickActionBtn);
        const payload = getPayloadFromDataset(quickActionBtn);

        try {
          await runHomeQuickAction?.({
            action,
            route,
            payload,
          });
        } catch (error) {
          safeWarn("runHomeQuickAction falló", error);
        }

        return;
      }

      const navigateBtn = event.target?.closest?.(
        '[data-action="navigate-home"]'
      );

      if (navigateBtn) {
        event.preventDefault();
        event.stopPropagation();

        const route = getWidgetRoute(navigateBtn);

        if (!route) {
          safeWarn("navigate-home sin route");
          return;
        }

        try {
          await navigateFromHomeAction?.({
            route,
          });
        } catch (error) {
          safeWarn("navigateFromHomeAction falló", error);
        }

        return;
      }
    }
  );

  /* =========================================
     CLEANUP
  ========================================= */

  return () => {
    try {
      AppCore?.cleanup?.run?.(
        resolveScopeName(scope)
      );
    } catch {}
  };
}

export default {
  bindHomeEvents,
};

/* =========================================================
   Onion SPA - Server Bindings
   Archivo: src/views/server/server.bindings.js

   Responsabilidades:
   - bind DOM robusto del módulo server
   - refresh / retry snapshot server
   - toggle live refresh
   - acciones rápidas del panel técnico
   - navegación opcional desde cards / bloques
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE = "view:server";

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
    AppCore?.utils?.warn?.("[ServerBindings]", ...args);
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

function getActionRoute(element) {
  return safeText(
    element?.dataset?.route ||
      element?.getAttribute?.("data-route") ||
      element?.dataset?.href ||
      element?.getAttribute?.("data-href"),
    ""
  );
}

function getActionName(element) {
  return safeText(
    element?.dataset?.actionName ||
      element?.getAttribute?.("data-action-name") ||
      element?.dataset?.serverAction ||
      element?.getAttribute?.("data-server-action"),
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

async function safeReload(reload, loadServerSnapshot) {
  try {
    if (typeof reload === "function") {
      await reload();
      return;
    }

    if (typeof loadServerSnapshot === "function") {
      await loadServerSnapshot({
        force: true,
      });
    }
  } catch (error) {
    safeWarn("reload falló", error);
  }
}

async function safeToggleLive({
  toggleServerLiveAction,
  setServerAutoRefresh,
  getAutoRefreshState,
  onEnable,
  onDisable,
}) {
  try {
    const current =
      typeof getAutoRefreshState === "function"
        ? Boolean(getAutoRefreshState())
        : false;

    const next = !current;

    if (typeof setServerAutoRefresh === "function") {
      setServerAutoRefresh(next);
    }

    if (typeof toggleServerLiveAction === "function") {
      await toggleServerLiveAction({
        enabled: next,
        onTick: next ? onEnable : onDisable,
      });
      return next;
    }

    if (next && typeof onEnable === "function") {
      await onEnable();
    }

    if (!next && typeof onDisable === "function") {
      await onDisable();
    }

    return next;
  } catch (error) {
    safeWarn("toggle live falló", error);
    return null;
  }
}

/* =========================================================
   MAIN
========================================================= */

export function bindServerEvents({
  loadServerSnapshot,
  refreshServerSnapshot,
  loadServerHealth,
  toggleServerLiveAction,
  setServerAutoRefresh,
  navigateFromServerAction,
  runServerQuickAction,
  reload,
  getAutoRefreshState,
  onLiveRefreshStart,
  onLiveRefreshStop,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef = getScope(scope);
  const root = getContainer();

  const refreshBtn = document.getElementById("server-refresh-btn");
  const retryBtn = document.getElementById("server-retry-btn");
  const toggleLiveBtn = document.getElementById("server-toggle-live-btn");
  const healthBtn = document.getElementById("server-health-btn");

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

        try {
          if (typeof refreshServerSnapshot === "function") {
            await refreshServerSnapshot();
            return;
          }

          await safeReload(reload, loadServerSnapshot);
        } catch (error) {
          safeWarn("refreshServerSnapshot falló", error);
        }
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
        await safeReload(reload, loadServerSnapshot);
      }
    );
  }

  if (toggleLiveBtn) {
    AppCore.cleanup.on(
      scopeRef,
      toggleLiveBtn,
      "click",
      async (event) => {
        event.preventDefault();

        await safeToggleLive({
          toggleServerLiveAction,
          setServerAutoRefresh,
          getAutoRefreshState,
          onEnable: onLiveRefreshStart,
          onDisable: onLiveRefreshStop,
        });
      }
    );
  }

  if (healthBtn) {
    AppCore.cleanup.on(
      scopeRef,
      healthBtn,
      "click",
      async (event) => {
        event.preventDefault();

        try {
          await loadServerHealth?.({
            silent: false,
          });
        } catch (error) {
          safeWarn("loadServerHealth falló", error);
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
      const refreshCardBtn = event.target?.closest?.(
        '[data-action="refresh-server"]'
      );

      if (refreshCardBtn) {
        event.preventDefault();
        event.stopPropagation();

        try {
          if (typeof refreshServerSnapshot === "function") {
            await refreshServerSnapshot();
          } else {
            await safeReload(reload, loadServerSnapshot);
          }
        } catch (error) {
          safeWarn("refresh-server falló", error);
        }

        return;
      }

      const healthCheckBtn = event.target?.closest?.(
        '[data-action="load-server-health"]'
      );

      if (healthCheckBtn) {
        event.preventDefault();
        event.stopPropagation();

        try {
          await loadServerHealth?.({
            silent: false,
          });
        } catch (error) {
          safeWarn("load-server-health falló", error);
        }

        return;
      }

      const toggleLiveActionBtn = event.target?.closest?.(
        '[data-action="toggle-server-live"]'
      );

      if (toggleLiveActionBtn) {
        event.preventDefault();
        event.stopPropagation();

        await safeToggleLive({
          toggleServerLiveAction,
          setServerAutoRefresh,
          getAutoRefreshState,
          onEnable: onLiveRefreshStart,
          onDisable: onLiveRefreshStop,
        });

        return;
      }

      const quickActionBtn = event.target?.closest?.(
        '[data-action="run-server-quick-action"]'
      );

      if (quickActionBtn) {
        event.preventDefault();
        event.stopPropagation();

        const action = getActionName(quickActionBtn);
        const route = getActionRoute(quickActionBtn);
        const payload = getPayloadFromDataset(quickActionBtn);

        try {
          await runServerQuickAction?.({
            action,
            route,
            payload,
          });
        } catch (error) {
          safeWarn("runServerQuickAction falló", error);
        }

        return;
      }

      const navigateBtn = event.target?.closest?.(
        '[data-action="navigate-server"]'
      );

      if (navigateBtn) {
        event.preventDefault();
        event.stopPropagation();

        const route = getActionRoute(navigateBtn);

        if (!route) {
          safeWarn("navigate-server sin route");
          return;
        }

        try {
          await navigateFromServerAction?.({
            route,
          });
        } catch (error) {
          safeWarn("navigateFromServerAction falló", error);
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
  bindServerEvents,
};

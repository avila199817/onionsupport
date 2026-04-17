/* =========================================================
   Onion SPA - Ajustes Bindings
   Archivo: src/views/ajustes/ajustes.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry
   - export CSV
   - open ajuste modal / detalle
   - copy id / copy key
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE =
  "view:ajustes";

/* =========================================================
   HELPERS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
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

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AjustesBindings]",
      ...args
    );
  } catch {}
}

function resolveScopeName(
  scope = DEFAULT_SCOPE
) {
  return safeText(
    scope,
    DEFAULT_SCOPE
  );
}

function getScope(
  scopeName = DEFAULT_SCOPE
) {
  const finalScope =
    resolveScopeName(
      scopeName
    );

  try {
    AppCore?.cleanup?.run?.(
      finalScope
    );
  } catch {}

  try {
    return (
      AppCore?.cleanup?.scope?.(
        finalScope
      ) || finalScope
    );
  } catch {
    return finalScope;
  }
}

function getContainer() {
  return (
    AppCore?.dom
      ?.viewContainer ||
    document.getElementById(
      "view-container"
    ) ||
    document
  );
}

function getAjusteId(
  element
) {
  return safeText(
    element?.dataset
      ?.settingId ||
      element?.dataset
        ?.ajusteId ||
      element?.dataset?.id ||
      element?.getAttribute?.(
        "data-setting-id"
      ) ||
      element?.getAttribute?.(
        "data-ajuste-id"
      ) ||
      element?.getAttribute?.(
        "data-id"
      ),
    ""
  );
}

function getAjusteKey(
  element
) {
  return safeText(
    element?.dataset?.key ||
      element?.dataset
        ?.settingKey ||
      element?.getAttribute?.(
        "data-key"
      ) ||
      element?.getAttribute?.(
        "data-setting-key"
      ),
    ""
  );
}

async function safeReload(
  reload,
  loadAjustes
) {
  try {
    if (
      typeof reload ===
      "function"
    ) {
      await reload();
      return;
    }

    if (
      typeof loadAjustes ===
      "function"
    ) {
      await loadAjustes({
        force: true,
      });
    }
  } catch (error) {
    safeWarn(
      "reload falló",
      error
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

export function bindAjustesEvents({
  loadAjustes,
  openAjuste,
  copyAjusteIdAction,
  copyAjusteKeyAction,
  exportAjustesCsvAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef =
    getScope(scope);

  const root =
    getContainer();

  const refreshBtn =
    document.getElementById(
      "ajustes-refresh-btn"
    );

  const retryBtn =
    document.getElementById(
      "ajustes-retry-btn"
    );

  const exportBtn =
    document.getElementById(
      "ajustes-export-btn"
    );

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
        await safeReload(
          reload,
          loadAjustes
        );
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
        await safeReload(
          reload,
          loadAjustes
        );
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
          await exportAjustesCsvAction?.();
        } catch (error) {
          safeWarn(
            "export falló",
            error
          );
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
      const openBtn =
        event.target?.closest?.(
          '[data-action="open-ajuste"]'
        );

      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();

        const settingId =
          getAjusteId(
            openBtn
          );

        if (!settingId) {
          safeWarn(
            "open-ajuste sin id"
          );
          return;
        }

        try {
          await openAjuste?.(
            settingId
          );
        } catch (error) {
          safeWarn(
            "openAjuste falló",
            error
          );
        }

        return;
      }

      const copyIdBtn =
        event.target?.closest?.(
          '[data-action="copy-ajuste-id"]'
        );

      if (copyIdBtn) {
        event.preventDefault();
        event.stopPropagation();

        const settingId =
          getAjusteId(
            copyIdBtn
          );

        try {
          await copyAjusteIdAction?.({
            settingId,
          });
        } catch (error) {
          safeWarn(
            "copyAjusteIdAction falló",
            error
          );
        }

        return;
      }

      const copyKeyBtn =
        event.target?.closest?.(
          '[data-action="copy-ajuste-key"]'
        );

      if (copyKeyBtn) {
        event.preventDefault();
        event.stopPropagation();

        const key =
          getAjusteKey(
            copyKeyBtn
          );

        const settingId =
          getAjusteId(
            copyKeyBtn
          );

        try {
          await copyAjusteKeyAction?.({
            item: {
              key,
              settingId,
            },
          });
        } catch (error) {
          safeWarn(
            "copyAjusteKeyAction falló",
            error
          );
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
        resolveScopeName(
          scope
        )
      );
    } catch {}
  };
}

export default {
  bindAjustesEvents,
};

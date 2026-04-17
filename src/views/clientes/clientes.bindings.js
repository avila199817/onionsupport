/* =========================================================
   Onion SPA - Clientes Bindings
   Archivo: src/views/clientes/clientes.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry
   - export CSV
   - open client modal
   - copy id
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE =
  "view:clientes";

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
      "[ClientesBindings]",
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

function getClientId(
  element
) {
  return safeText(
    element?.dataset
      ?.clientId ||
      element?.dataset
      ?.clienteId ||
      element?.dataset
      ?.id ||
      element?.getAttribute?.(
        "data-client-id"
      ) ||
      element?.getAttribute?.(
        "data-cliente-id"
      ) ||
      element?.getAttribute?.(
        "data-id"
      ),
    ""
  );
}

function getClientCode(
  element
) {
  return safeText(
    element?.dataset
      ?.clientCode ||
      element?.dataset
      ?.clienteCode ||
      element?.getAttribute?.(
        "data-client-code"
      ) ||
      element?.getAttribute?.(
        "data-cliente-code"
      ),
    ""
  );
}

async function safeReload(
  reload,
  loadClientes
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
      typeof loadClientes ===
      "function"
    ) {
      await loadClientes({
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

export function bindClientesEvents({
  loadClientes,
  openCliente,
  copyClienteIdAction,
  exportClientesCsvAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef =
    getScope(scope);

  const root =
    getContainer();

  const refreshBtn =
    document.getElementById(
      "clientes-refresh-btn"
    );

  const retryBtn =
    document.getElementById(
      "clientes-retry-btn"
    );

  const exportBtn =
    document.getElementById(
      "clientes-export-btn"
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
          loadClientes
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
          loadClientes
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
          await exportClientesCsvAction?.();
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
          '[data-action="open-client"]'
        ) ||
        event.target?.closest?.(
          '[data-action="open-cliente"]'
        );

      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();

        const clientId =
          getClientId(
            openBtn
          );

        if (!clientId) {
          safeWarn(
            "open-client sin id"
          );
          return;
        }

        try {
          await openCliente?.(
            clientId
          );
        } catch (error) {
          safeWarn(
            "openCliente falló",
            error
          );
        }

        return;
      }

      const copyBtn =
        event.target?.closest?.(
          '[data-action="copy-client-id"]'
        ) ||
        event.target?.closest?.(
          '[data-action="copy-cliente-id"]'
        );

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        const clientId =
          getClientId(
            copyBtn
          );

        const clientCode =
          getClientCode(
            copyBtn
          );

        try {
          await copyClienteIdAction?.({
            clientId,
            clientCode,
          });
        } catch (error) {
          safeWarn(
            "copyClienteIdAction falló",
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
  bindClientesEvents,
};

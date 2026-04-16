/* =========================================================
   Onion SPA - Incidencias Bindings
   Archivo: src/views/incidencias/incidencias.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry
   - export CSV
   - open ticket modal
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
  "view:incidencias";

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
      "[IncidenciasBindings]",
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

function getTicketId(
  element
) {
  return safeText(
    element?.dataset
      ?.ticketId ||
      element?.getAttribute?.(
        "data-ticket-id"
      ),
    ""
  );
}

function getTicketCode(
  element
) {
  return safeText(
    element?.dataset
      ?.ticketCode ||
      element?.getAttribute?.(
        "data-ticket-code"
      ),
    ""
  );
}

async function safeReload(
  reload,
  loadIncidencias
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
      typeof loadIncidencias ===
      "function"
    ) {
      await loadIncidencias({
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

export function bindIncidenciasEvents({
  loadIncidencias,
  openTicket,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef =
    getScope(scope);

  const root =
    getContainer();

  const refreshBtn =
    document.getElementById(
      "incidencias-refresh-btn"
    );

  const retryBtn =
    document.getElementById(
      "incidencias-retry-btn"
    );

  const exportBtn =
    document.getElementById(
      "incidencias-export-btn"
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
          loadIncidencias
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
          loadIncidencias
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
          await exportIncidenciasCsvAction?.();
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
          '[data-action="open-ticket"]'
        );

      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();

        const ticketId =
          getTicketId(
            openBtn
          );

        if (!ticketId) {
          safeWarn(
            "open-ticket sin id"
          );
          return;
        }

        try {
          await openTicket?.(
            ticketId
          );
        } catch (error) {
          safeWarn(
            "openTicket falló",
            error
          );
        }

        return;
      }

      const copyBtn =
        event.target?.closest?.(
          '[data-action="copy-ticket-id"]'
        );

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        const ticketId =
          getTicketId(
            copyBtn
          );

        const ticketCode =
          getTicketCode(
            copyBtn
          );

        try {
          await copyTicketIdAction?.({
            ticketId,
            ticketCode,
          });
        } catch (error) {
          safeWarn(
            "copyTicketIdAction falló",
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
  bindIncidenciasEvents,
};

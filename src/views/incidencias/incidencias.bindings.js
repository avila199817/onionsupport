/* =========================================================
   Onion SPA - Incidencias Bindings
   Archivo: src/views/incidencias/incidencias.bindings.js

   Responsabilidades:
   - bind de eventos DOM
   - refresh / retry
   - abrir ticket
   - cleanup seguro por scope
   - soportar rebind limpio tras rerender
   - tolerar scope externo
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE = "view:incidencias";

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

function getTicketIdFromElement(element) {
  return safeText(
    element?.getAttribute?.("data-ticket-id") ||
    element?.dataset?.ticketId ||
    "",
    ""
  );
}

function getContainer() {
  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document
  );
}

async function safeReload(loadIncidencias, options = {}) {
  if (typeof loadIncidencias !== "function") {
    return;
  }

  try {
    await loadIncidencias({
      force: true,
      ...options,
    });
  } catch (error) {
    AppCore?.utils?.warn?.(
      "[IncidenciasBindings] loadIncidencias falló",
      error
    );
  }
}

/* =========================================================
   PUBLIC
========================================================= */

export function bindIncidenciasEvents({
  loadIncidencias,
  openTicket,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef = getScope(scope);
  const root = getContainer();

  const refreshBtn = document.getElementById(
    "incidencias-refresh-btn"
  );

  const retryBtn = document.getElementById(
    "incidencias-retry-btn"
  );

  if (refreshBtn) {
    AppCore.cleanup.on(
      scopeRef,
      refreshBtn,
      "click",
      async (event) => {
        event.preventDefault();
        await safeReload(loadIncidencias);
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
        await safeReload(loadIncidencias);
      }
    );
  }

  /*
    Delegación para soportar rerender sin rebinding
    individual de cada botón.
  */
  AppCore.cleanup.on(
    scopeRef,
    root,
    "click",
    (event) => {
      const openBtn =
        event.target?.closest?.('[data-action="open-ticket"]');

      if (!openBtn) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const ticketId =
        getTicketIdFromElement(openBtn);

      if (!ticketId) {
        return;
      }

      try {
        openTicket?.(ticketId);
      } catch (error) {
        AppCore?.utils?.warn?.(
          "[IncidenciasBindings] openTicket falló",
          error
        );
      }
    }
  );

  return () => {
    try {
      AppCore?.cleanup?.run?.(
        resolveScopeName(scope)
      );
    } catch {}
  };
}

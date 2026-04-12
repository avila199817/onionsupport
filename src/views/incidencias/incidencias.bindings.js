/* =========================================================
   Onion SPA - Incidencias Bindings
   Archivo: src/views/incidencias/incidencias.bindings.js

   Responsabilidades:
   - bind de eventos DOM
   - refresh / retry
   - abrir ticket
   - cleanup seguro por scope
========================================================= */

import { AppCore } from "../../core/index.js";

const SCOPE = "view:incidencias";

/* =========================================================
   HELPERS
========================================================= */

function getScope() {
  AppCore.cleanup.run(SCOPE);
  return AppCore.cleanup.scope(SCOPE);
}

function getTicketIdFromElement(element) {
  return (
    element?.getAttribute?.("data-ticket-id") ||
    ""
  );
}

/* =========================================================
   PUBLIC
========================================================= */

export function bindIncidenciasEvents({
  loadIncidencias,
  openTicket,
} = {}) {
  const scope = getScope();

  const refreshBtn = document.getElementById(
    "incidencias-refresh-btn"
  );

  const retryBtn = document.getElementById(
    "incidencias-retry-btn"
  );

  if (refreshBtn) {
    AppCore.cleanup.on(
      scope,
      refreshBtn,
      "click",
      async () => {
        await loadIncidencias?.({
          force: true,
        });
      }
    );
  }

  if (retryBtn) {
    AppCore.cleanup.on(
      scope,
      retryBtn,
      "click",
      async () => {
        await loadIncidencias?.({
          force: true,
        });
      }
    );
  }

  const openButtons =
    document.querySelectorAll(
      '[data-action="open-ticket"]'
    );

  openButtons.forEach((button) => {
    AppCore.cleanup.on(
      scope,
      button,
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        openTicket?.(
          getTicketIdFromElement(button)
        );
      }
    );
  });
}

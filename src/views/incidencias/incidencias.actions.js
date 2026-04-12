/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   Responsabilidades:
   - acciones de usuario
   - abrir ticket
   - emitir eventos globales
   - preparado para detalle futuro
========================================================= */

import { AppCore } from "../../core/index.js";
// import { Router } from "../../router/index.js";

/* =========================================================
   OPEN TICKET
========================================================= */

export function openTicket(ticketId) {
  if (!ticketId) return;

  AppCore?.events?.emit?.(
    "incidencias:open",
    {
      ticketId,
    }
  );

  /* =====================================================
     FUTURO
  ===================================================== */
  // Router.navigate(`/incidencias/${ticketId}`);
}

/* =========================================================
   REFRESH
========================================================= */

export async function refreshIncidencias(
  loadIncidencias
) {
  if (
    typeof loadIncidencias !==
    "function"
  ) {
    return;
  }

  return loadIncidencias({
    force: true,
  });
}

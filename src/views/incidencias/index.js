/* =========================================================
   Onion SPA - Incidencias Entry
   Archivo: src/views/incidencias/index.js

   Responsabilidades:
   - punto de entrada de la vista incidencias
   - componer módulos internos
   - render principal
   - cargar datos
   - bind de eventos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  setHydrated,
} from "./incidencias.state.js";

import {
  loadIncidencias,
} from "./incidencias.api.js";

import {
  renderHeader,
  renderTable,
} from "./incidencias.table.template.js";

import {
  bindIncidenciasEvents,
} from "./incidencias.bindings.js";

import {
  openTicket,
} from "./incidencias.actions.js";

export const IncidenciasView = (() => {
  "use strict";

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container =
      AppCore.dom.viewContainer;

    if (!container) return;

    AppCore.setDocumentTitle(
      "Incidencias"
    );

    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader()}
          ${renderTable()}
        </div>
      </section>
    `;

    setHydrated(true);

    bindIncidenciasEvents({
      loadIncidencias,
      openTicket,
    });
  }

  /* =====================================================
     INIT
  ===================================================== */

  async function init() {
    render();

    try {
      await loadIncidencias();
    } catch {
      /* noop */
    }

    render();
  }

  /* =====================================================
     API
  ===================================================== */

  return {
    init,
    render,
    reload: () =>
      loadIncidencias({
        force: true,
      }),
    loadIncidencias,
  };
})();

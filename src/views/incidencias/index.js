/* =========================================================
   Onion SPA - Incidencias Entry
   Archivo: src/views/incidencias/index.js

   Responsabilidades:
   - punto de entrada de la vista incidencias
   - componer módulos internos
   - render principal
   - cargar datos
   - bind de eventos
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender
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

  const SCOPE = "view:incidencias";

  let initialized = false;
  let bindingsCleanup = null;

  /* =====================================================
     HELPERS
  ===================================================== */

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function bind() {
    cleanupBindings();

    const maybeCleanup =
      bindIncidenciasEvents({
        loadIncidencias,
        openTicket,
        scope: SCOPE,
      });

    if (typeof maybeCleanup === "function") {
      bindingsCleanup = maybeCleanup;
    }
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container = getContainer();

    if (!container) {
      return null;
    }

    AppCore?.setDocumentTitle?.(
      "Incidencias"
    );

    AppCore?.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader()}
          ${renderTable()}
        </div>
      </section>
    `;

    setHydrated(true);

    return container;
  }

  /* =====================================================
     LOAD + RENDER
  ===================================================== */

  async function renderAndLoad() {
    render();

    try {
      await loadIncidencias();
    } catch (error) {
      AppCore?.utils?.warn?.(
        "[IncidenciasView] loadIncidencias falló",
        error
      );
    }

    render();
  }

  async function reload(options = {}) {
    try {
      await loadIncidencias({
        force: true,
        ...options,
      });
    } catch (error) {
      AppCore?.utils?.warn?.(
        "[IncidenciasView] reload falló",
        error
      );
    }

    render();
  }

  /* =====================================================
     INIT
  ===================================================== */

  async function init() {
    initialized = true;

    await renderAndLoad();
    bind();

    return api;
  }

  /* =====================================================
     DESTROY
  ===================================================== */

  function destroy() {
    initialized = false;
    cleanupBindings();
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    render,
    reload,
    destroy,
    loadIncidencias,
    get initialized() {
      return initialized;
    },
  };

  return api;
})();

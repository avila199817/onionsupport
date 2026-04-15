/* =========================================================
   Onion SPA - Incidencias View
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
   - compartir flujo robusto con vistas premium del sistema

   HARDENING PRO:
   - render inicial inmediato con estado actual
   - carga posterior con rerender seguro
   - anti-race con token de render
   - cleanup sólido por scope
   - tolerancia total a fallos de carga
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  setHydrated,
} from "./incidencias.state.js";

import {
  loadIncidencias,
  hydrateFromCache,
} from "./incidencias.api.js";

import {
  getIncidencias,
  sortIncidenciasByUpdatedDesc,
} from "./incidencias.store.js";

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
  let destroyed = false;
  let bindingsCleanup = null;
  let renderToken = 0;
  let inflightInit = null;

  /* =====================================================
     HELPERS
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[IncidenciasView]",
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        "[IncidenciasView]",
        ...args
      );
    } catch {}
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById(
        "view-container"
      ) ||
      null
    );
  }

  function getItems() {
    try {
      return sortIncidenciasByUpdatedDesc(
        getIncidencias()
      );
    } catch {
      return [];
    }
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return (
      !destroyed &&
      token === renderToken
    );
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(
        SCOPE
      );
    } catch {}
  }

  function bind() {
    cleanupBindings();

    const maybeCleanup =
      bindIncidenciasEvents({
        scope: SCOPE,
        loadIncidencias,
        openTicket,
        rerender: render,
        reload,
      });

    if (
      typeof maybeCleanup ===
      "function"
    ) {
      bindingsCleanup =
        maybeCleanup;
    }
  }

  function buildHtml() {
    const items = getItems();

    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader({
            items,
            state: incidenciasState,
          })}

          ${renderTable({
            items,
            state: incidenciasState,
          })}
        </div>
      </section>
    `;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container =
      getContainer();

    if (!container) {
      safeWarn(
        "No se encontró #view-container."
      );
      return null;
    }

    AppCore?.setDocumentTitle?.(
      "Incidencias"
    );

    AppCore?.clearDynamicContainers?.();

    container.innerHTML =
      buildHtml();

    setHydrated(true);

    return container;
  }

  /* =====================================================
     LOAD + RENDER
  ===================================================== */

  async function renderAndLoad({
    force = false,
  } = {}) {
    const token =
      nextRenderToken();

    try {
      hydrateFromCache?.();
    } catch {}

    render();

    try {
      await loadIncidencias({
        force,
      });
    } catch (error) {
      safeWarn(
        "loadIncidencias falló:",
        error
      );
    }

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    return api;
  }

  async function reload(
    options = {}
  ) {
    if (destroyed) {
      return api;
    }

    try {
      await renderAndLoad({
        force: true,
        ...options,
      });
    } catch (error) {
      safeWarn(
        "reload falló:",
        error
      );
    }

    if (!destroyed) {
      bind();
    }

    return api;
  }

  /* =====================================================
     INIT
  ===================================================== */

  async function init() {
    if (
      initialized &&
      inflightInit
    ) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    inflightInit =
      (async () => {
        safeLog("init");

        await renderAndLoad();

        if (!destroyed) {
          bind();
        }

        return api;
      })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  /* =====================================================
     DESTROY
  ===================================================== */

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderToken();
    cleanupBindings();

    safeLog("destroy");
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

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default IncidenciasView;

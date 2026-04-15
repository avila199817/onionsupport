/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/IncidenciasView.js

   Responsabilidades:
   - actuar como visor principal de incidencias
   - renderizar header + tabla premium del módulo
   - cargar datos iniciales y refrescos
   - bind de eventos de la vista
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender
   - desacoplar la orquestación de la capa template

   HARDENING PRO:
   - init serializado
   - anti-race con token de render
   - tolerancia a hydrate cache + carga remota
   - rerender seguro tras refresh
   - cleanup sólido por scope
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
  let inflightReload = null;

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

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
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
    } catch (error) {
      safeWarn(
        "getItems falló:",
        error
      );
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
    } catch (error) {
      safeWarn(
        "cleanupBindings falló:",
        error
      );
    }

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
    } catch (error) {
      safeWarn(
        "hydrateFromCache falló:",
        error
      );
    }

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

    if (inflightReload) {
      return inflightReload;
    }

    inflightReload =
      (async () => {
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
      })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
    }
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

        try {
          await renderAndLoad();
        } catch (error) {
          safeError(
            "init renderAndLoad falló:",
            error
          );
        }

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

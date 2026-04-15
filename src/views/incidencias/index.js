/* =========================================================
   Onion SPA - Incidencias Entry
   Archivo: src/views/incidencias/index.js

   EXTREME MODE · 10/10

   Responsabilidades:
   - entrypoint robusto de la vista incidencias
   - render reactivo y limpio
   - carga inicial + refresh inteligente
   - evitar race conditions
   - evitar doble bind
   - destroy limpio router-safe
   - reload premium
   - trazabilidad debug
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
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
  let destroyed = false;
  let bindingsCleanup = null;
  let renderToken = 0;
  let inflightInit = null;

  /* =====================================================
     HELPERS
  ===================================================== */

  function log(...args) {
    AppCore?.utils?.log?.(
      "[IncidenciasView]",
      ...args
    );
  }

  function warn(...args) {
    AppCore?.utils?.warn?.(
      "[IncidenciasView]",
      ...args
    );
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

  function isAlive(token = 0) {
    return (
      !destroyed &&
      token === renderToken
    );
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch (error) {
      warn(
        "cleanup bindings error:",
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

  function getShellHtml() {
    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader({
            state: incidenciasState,
          })}

          ${renderTable({
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
      warn(
        "container no encontrado"
      );
      return null;
    }

    AppCore?.setDocumentTitle?.(
      "Incidencias"
    );

    AppCore?.clearDynamicContainers?.();

    container.innerHTML =
      getShellHtml();

    setHydrated(true);

    return container;
  }

  /* =====================================================
     LOAD FLOW
  ===================================================== */

  async function renderAndLoad({
    force = false,
  } = {}) {
    const token =
      ++renderToken;

    render();

    try {
      await loadIncidencias({
        force,
      });
    } catch (error) {
      warn(
        "loadIncidencias falló:",
        error
      );
    }

    if (!isAlive(token)) {
      return;
    }

    render();
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
      warn(
        "reload error:",
        error
      );
    }

    bind();

    return api;
  }

  /* =====================================================
     INIT
  ===================================================== */

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (
      initialized &&
      inflightInit
    ) {
      return inflightInit;
    }

    initialized = true;

    inflightInit =
      (async () => {
        log("init");

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

    renderToken++;

    cleanupBindings();

    log("destroy");
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

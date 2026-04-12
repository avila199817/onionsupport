/* =========================================================
   Onion SPA - Facturas View (LEAN PRO SAAS PANEL)
   Archivo: src/views/facturas/facturasView.js

   Objetivo actual:
   - pintar SOLO cards de facturas existentes
   - respetar el layout real del shell
   - usar content-wrapper / panel-content / grid del sistema
   - cargar facturas desde backend
   - guardar facturas en Store
   - normalizar facturas del backend nuevo
   - estados mínimos: loading / error / vacío
   - cero filtros
   - cero tabla
   - cero drawer
   - simplicidad máxima
========================================================= */

import { AppCore } from "../../core/index.js";
import { Store } from "../../store/index.js";

import {
  extractFacturas,
  normalizeFactura,
  getRemoteCount,
} from "./facturas.model.js";

import {
  renderHeader,
  renderCards,
} from "./facturas.template.js";

export const FacturasView = (() => {
  "use strict";

  const SCOPE = "view:facturas";
  const ENDPOINT = "/api/facturas";

  const localState = {
    hydrated: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,
    bootstrapped: false,
    remoteCount: 0,
  };

  let inflightLoad = null;

  function safeGet(path, fallback = []) {
    try {
      if (typeof Store?.get === "function") {
        return Store.get(path) ?? fallback;
      }
    } catch {
      /* noop */
    }

    return fallback;
  }

  function safeSet(path, value) {
    try {
      if (typeof Store?.set === "function") {
        Store.set(path, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function safeSetCollection(name, value) {
    try {
      if (typeof Store?.actions?.setCollection === "function") {
        Store.actions.setCollection(name, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function getFacturas() {
    return safeGet("entities.facturas", []);
  }

  function getSortedFacturas() {
    return [...getFacturas()].sort(
      (a, b) => (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0)
    );
  }

  function setFacturas(items = []) {
    if (safeSetCollection("facturas", items)) return;
    safeSet("entities.facturas", items);
  }

  async function fetchFacturas() {
    return AppCore.apiClient.get(ENDPOINT, {
      timeout: 15000,
      auth: true,
    });
  }

  async function loadFacturas({ silent = false } = {}) {
    if (inflightLoad) return inflightLoad;

    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    } else {
      localState.refreshing = true;
      render();
    }

    inflightLoad = (async () => {
      try {
        const response = await fetchFacturas();
        const items = extractFacturas(response).map(normalizeFactura);

        setFacturas(items);

        localState.remoteCount = getRemoteCount(response, items.length);
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error = null;

        render();
        return items;
      } catch (error) {
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudieron cargar las facturas.";

        render();
        throw error;
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  function openFactura(id) {
    if (!id) return;

    if (typeof AppCore.events?.emit === "function") {
      AppCore.events.emit("facturas:open", { facturaId: id });
    }

    // Router.navigate(`/facturas/${id}`);
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    const items = getSortedFacturas();

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Facturas");
    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader({ items, state: localState })}
          ${renderCards({ items, state: localState })}
        </div>
      </section>
    `;

    localState.hydrated = true;
    bind();
  }

  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("facturas-refresh-btn");
    const retryBtn = document.getElementById("facturas-retry-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.refreshing) return;
        await loadFacturas({ silent: true });
      });
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadFacturas();
      });
    }

    const openButtons = document.querySelectorAll('[data-action="open-factura"]');
    openButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", (event) => {
        event.stopPropagation();
        openFactura(button.getAttribute("data-factura-id"));
      });
    });

    const cards = document.querySelectorAll(".factura-card");
    cards.forEach((card) => {
      AppCore.cleanup.on(scope, card, "click", () => {
        openFactura(card.getAttribute("data-factura-id"));
      });
    });

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadFacturas();
    }
  }

  return {
    render,
    loadFacturas,
  };
})();

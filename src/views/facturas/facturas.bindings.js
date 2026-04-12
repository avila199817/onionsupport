/* =========================================================
   Onion SPA - Facturas Bindings
   Archivo: src/views/facturas/facturas.bindings.js

   Responsabilidades:
   - registrar eventos de UI del módulo de facturas
   - bind de refresh / retry / export
   - delegación de eventos sobre cards y modal
   - bind de Escape para cierre de detalle
   - mantener la vista principal más limpia
========================================================= */

import { AppCore } from "../../core/index.js";

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function bindFacturasView({
  scopeName = "view:facturas",
  getContainer,
  getState,
  render,
  loadFacturas,
  openFactura,
  openFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,
  onBootstrap,
} = {}) {
  if (typeof getContainer !== "function") return;

  const scope = AppCore.cleanup.scope(scopeName);
  const container = getContainer();
  const state = typeof getState === "function" ? getState() : null;

  if (!container || !state) return;

  const root = container.querySelector(`[data-facturas-scope="${scopeName}"]`);
  if (!root) return;

  const refreshBtn = container.querySelector("#facturas-refresh-btn");
  const retryBtn = container.querySelector("#facturas-retry-btn");
  const exportBtn = container.querySelector("#facturas-export-btn");

  if (refreshBtn) {
    AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
      if (state.loading || state.refreshing) return;

      try {
        await loadFacturas({ silent: true });
        AppCore?.showToast?.("Facturas actualizadas correctamente.", "success");
      } catch {
        AppCore?.showToast?.("No se pudo actualizar el listado.", "error");
      }
    });
  }

  if (retryBtn) {
    AppCore.cleanup.on(scope, retryBtn, "click", async () => {
      try {
        await loadFacturas();
      } catch {
        AppCore?.showToast?.("No se pudo recargar la facturación.", "error");
      }
    });
  }

  if (exportBtn) {
    AppCore.cleanup.on(scope, exportBtn, "click", () => {
      if (typeof exportFacturasCsv === "function") {
        exportFacturasCsv();
      }
    });
  }

  AppCore.cleanup.on(scope, container, "click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    const cardEl = event.target.closest(".factura-card");
    const modalPanel = event.target.closest('[data-role="facturas-detail-modal"]');

    if (actionEl) {
      const action = safeText(actionEl.getAttribute("data-action"), "");
      const facturaId = safeText(actionEl.getAttribute("data-factura-id"), "");

      if (action === "open-factura") {
        event.preventDefault();
        event.stopPropagation();
        await openFactura?.(facturaId);
        return;
      }

      if (action === "view-factura-pdf") {
        event.preventDefault();
        event.stopPropagation();
        await openFacturaPdf?.(facturaId);
        return;
      }

      if (action === "download-factura") {
        event.preventDefault();
        event.stopPropagation();
        await downloadFacturaPdf?.(facturaId);
        return;
      }

      if (action === "send-factura") {
        event.preventDefault();
        event.stopPropagation();
        await sendFacturaToClient?.(facturaId);
        return;
      }

      if (action === "close-factura-detail") {
        if (modalPanel) return;
        event.preventDefault();
        closeDetail?.();
        render?.();
        return;
      }
    }

    if (cardEl && !event.target.closest("button")) {
      const facturaId = safeText(cardEl.getAttribute("data-factura-id"), "");
      await openFactura?.(facturaId);
    }
  });

  AppCore.cleanup.on(scope, document, "keydown", (event) => {
    if (event.key === "Escape" && state.detailOpen) {
      closeDetail?.();
      render?.();
    }
  });

  if (!state.bootstrapped) {
    state.bootstrapped = true;

    if (typeof onBootstrap === "function") {
      onBootstrap();
      return;
    }

    loadFacturas?.().catch(() => {
      AppCore?.showToast?.("No se pudieron cargar las facturas.", "error");
    });
  }
}

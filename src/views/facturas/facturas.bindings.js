/* =========================================================
   Onion SPA - Facturas Bindings
   Archivo: src/views/facturas/facturas.bindings.js

   RESPONSABILIDADES:
   - registrar eventos de UI del módulo de facturas
   - bind de refresh / retry / export
   - delegación de eventos sobre cards y modal
   - bind de Escape para cierre de detalle
   - delegar bootstrap inicial a la vista
   - mantener la vista principal más limpia

   HARDENING PRO:
   - evita dobles listeners
   - reevalúa estado en cada interacción
   - soporta refresh explícito con asRefresh
   - tolera ausencia parcial de acciones
   - cleanup sólido por scope
========================================================= */

import { AppCore } from "../../core/index.js";
import { safeText } from "./facturas.utils.js";

const DEFAULT_SCOPE = "view:facturas";

/* =========================================================
   HELPERS
========================================================= */

function showBindingToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.show === "function") {
      AppCore.toast.show(text, type);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.[type] === "function") {
      AppCore.ui.toast[type](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.showToast === "function") {
      AppCore.showToast(text, type);
      return true;
    }
  } catch {}

  try {
    const logger =
      type === "error"
        ? console.error
        : type === "warning"
          ? console.warn
          : console.log;

    logger(`[FacturasBindings:${type}]`, text);
  } catch {}

  return false;
}

function resolveScopeName(scopeName = DEFAULT_SCOPE) {
  return safeText(scopeName, DEFAULT_SCOPE);
}

function resolveScope(scopeName = DEFAULT_SCOPE) {
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

function getLiveState(getState) {
  try {
    return typeof getState === "function" ? getState() || {} : {};
  } catch {
    return {};
  }
}

function getRoot(container, scopeName = DEFAULT_SCOPE) {
  if (!container) return null;

  return (
    container.querySelector(
      `[data-facturas-scope="${resolveScopeName(scopeName)}"]`
    ) || container
  );
}

function getFacturaId(element) {
  return safeText(
    element?.dataset?.facturaId ||
      element?.getAttribute?.("data-factura-id") ||
      "",
    ""
  );
}

function isBusyState(state = {}) {
  return Boolean(state?.loading || state?.refreshing);
}

async function safeRefresh({
  loadFacturas,
  silent = true,
  asRefresh = true,
  force = true,
} = {}) {
  if (typeof loadFacturas !== "function") {
    return false;
  }

  await loadFacturas({
    silent,
    asRefresh,
    force,
  });

  return true;
}

/* =========================================================
   MAIN
========================================================= */

export function bindFacturasView({
  scopeName = DEFAULT_SCOPE,
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
  if (typeof getContainer !== "function") {
    return () => {};
  }

  const scope = resolveScope(scopeName);
  const container = getContainer();
  const root = getRoot(container, scopeName);

  if (!container || !root) {
    return () => {};
  }

  const refreshBtn = container.querySelector("#facturas-refresh-btn");
  const retryBtn = container.querySelector("#facturas-retry-btn");
  const exportBtn = container.querySelector("#facturas-export-btn");

  /* =========================================
     DIRECT BUTTONS
  ========================================= */

  if (refreshBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      refreshBtn,
      "click",
      async (event) => {
        event.preventDefault();

        const state = getLiveState(getState);
        if (isBusyState(state)) {
          return;
        }

        try {
          await safeRefresh({
            loadFacturas,
            silent: true,
            asRefresh: true,
            force: true,
          });

          showBindingToast(
            "Facturas actualizadas correctamente.",
            "success"
          );
        } catch (error) {
          showBindingToast(
            "No se pudo actualizar el listado.",
            "error"
          );
        }
      }
    );
  }

  if (retryBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      retryBtn,
      "click",
      async (event) => {
        event.preventDefault();

        const state = getLiveState(getState);
        if (isBusyState(state)) {
          return;
        }

        try {
          await safeRefresh({
            loadFacturas,
            silent: false,
            asRefresh: false,
            force: true,
          });
        } catch {
          showBindingToast(
            "No se pudo recargar la facturación.",
            "error"
          );
        }
      }
    );
  }

  if (exportBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      exportBtn,
      "click",
      (event) => {
        event.preventDefault();

        try {
          exportFacturasCsv?.();
        } catch {
          showBindingToast(
            "No se pudo exportar el CSV.",
            "error"
          );
        }
      }
    );
  }

  /* =========================================
     DELEGATED ACTIONS
  ========================================= */

  AppCore?.cleanup?.on?.(
    scope,
    root,
    "click",
    async (event) => {
      const state = getLiveState(getState);

      const actionEl = event.target?.closest?.("[data-action]");
      const cardEl = event.target?.closest?.(".factura-card");
      const overlayEl = event.target?.closest?.(
        '[data-action="close-factura-detail"]'
      );

      if (actionEl) {
        const action = safeText(
          actionEl?.dataset?.action ||
            actionEl?.getAttribute?.("data-action"),
          ""
        );

        const facturaId = getFacturaId(actionEl);

        if (action === "open-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (isBusyState(state)) {
            return;
          }

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
          event.preventDefault();

          closeDetail?.();
          render?.();
          return;
        }
      }

      if (cardEl && !event.target?.closest?.("button, a, input, select, textarea")) {
        const facturaId = getFacturaId(cardEl);

        if (!facturaId || isBusyState(state)) {
          return;
        }

        await openFactura?.(facturaId);
        return;
      }

      if (overlayEl && !event.target?.closest?.('[data-role="facturas-detail-panel"]')) {
        closeDetail?.();
        render?.();
      }
    }
  );

  /* =========================================
     ESC CLOSE
  ========================================= */

  AppCore?.cleanup?.on?.(
    scope,
    document,
    "keydown",
    (event) => {
      const state = getLiveState(getState);

      if (event.key !== "Escape") {
        return;
      }

      if (!state?.detailOpen) {
        return;
      }

      closeDetail?.();
      render?.();
    }
  );

  /* =========================================
     BOOTSTRAP
  ========================================= */

  const liveState = getLiveState(getState);

  if (!liveState?.bootstrapped) {
    try {
      if (typeof onBootstrap === "function") {
        onBootstrap();
      } else {
        safeRefresh({
          loadFacturas,
          silent: false,
          asRefresh: false,
          force: false,
        }).catch(() => {
          showBindingToast(
            "No se pudieron cargar las facturas.",
            "error"
          );
        });
      }
    } catch {
      showBindingToast(
        "No se pudieron cargar las facturas.",
        "error"
      );
    }
  }

  /* =========================================
     CLEANUP
  ========================================= */

  return () => {
    try {
      AppCore?.cleanup?.run?.(resolveScopeName(scopeName));
    } catch {}
  };
}

export default {
  bindFacturasView,
};

/* =========================================================
   Onion SPA - Facturas Bindings
   Archivo: src/views/facturas/facturas.bindings.js

   FINAL PRO SYSTEM · BINDINGS REAL · 10/10
   PATCH · OPEN INCIDENCIA SUPPORT

   RESPONSABILIDADES:
   - registrar eventos UI del módulo de facturas
   - bind de refresh / retry / export
   - delegación de eventos sobre cards y acciones de colección
   - soportar click en incidencia relacionada
   - evitar dobles listeners por re-render
   - re-evaluar estado vivo en cada interacción
   - mantener facturasView.js limpio

   HARDENING PRO:
   - cleanup sólido por scope
   - no mezcla lógica del modal global aquí
   - no usa snapshots de estado congelados
   - tolera ausencia parcial de acciones
   - soporta refresh explícito con asRefresh
   - no ejecuta bootstrap inicial: eso pertenece a la vista
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

function getIncidenciaId(element) {
  return safeText(
    element?.dataset?.ticketId ||
      element?.dataset?.incidenciaId ||
      element?.getAttribute?.("data-ticket-id") ||
      element?.getAttribute?.("data-incidencia-id") ||
      "",
    ""
  );
}

function isBusyState(state = {}) {
  return Boolean(state?.loading || state?.refreshing);
}

function isOpenBusyState(state = {}) {
  return Boolean(
    state?.loading ||
      state?.refreshing ||
      state?.detailLoading ||
      state?.openingFacturaId
  );
}

function isActionBusyForFactura(state = {}, facturaId = "") {
  const id = safeText(facturaId, "");

  if (!id) return false;

  return Boolean(
    safeText(state?.sendingFacturaId, "") === id ||
      safeText(state?.downloadingFacturaId, "") === id ||
      safeText(state?.viewingFacturaId, "") === id ||
      safeText(state?.openingFacturaId, "") === id
  );
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

async function tryNavigateWith(candidatePath = "") {
  const path = safeText(candidatePath, "");
  if (!path) return false;

  try {
    if (typeof AppCore?.router?.navigate === "function") {
      await AppCore.router.navigate(path);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.Router?.navigate === "function") {
      await AppCore.Router.navigate(path);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.modules?.Router?.navigate === "function") {
      await AppCore.modules.Router.navigate(path);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.services?.router?.navigate === "function") {
      await AppCore.services.router.navigate(path);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.navigate === "function") {
      await AppCore.navigate(path);
      return true;
    }
  } catch {}

  return false;
}

async function openIncidenciaById(incidenciaId = "") {
  const id = safeText(incidenciaId, "");
  if (!id) return false;

  const candidates = [
    `/incidencias/${id}`,
    `/tickets/${id}`,
  ];

  for (const path of candidates) {
    const ok = await tryNavigateWith(path);
    if (ok) return true;
  }

  try {
    AppCore?.events?.emit?.("facturas:open-incidencia", {
      incidenciaId: id,
      ticketId: id,
    });
  } catch {}

  return false;
}

/* =========================================================
   MAIN
========================================================= */

export function bindFacturasView({
  scopeName = DEFAULT_SCOPE,
  getContainer,
  getState,
  loadFacturas,
  openFactura,
  openFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,
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
  const closeDetailBtn = container.querySelector("[data-action='close-detail']");

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
        } catch {
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

        const state = getLiveState(getState);
        if (isBusyState(state)) {
          return;
        }

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

  if (closeDetailBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      closeDetailBtn,
      "click",
      (event) => {
        event.preventDefault();
        closeDetail?.();
      }
    );
  }

  AppCore?.cleanup?.on?.(
    scope,
    root,
    "click",
    async (event) => {
      const state = getLiveState(getState);
      const actionEl = event.target?.closest?.("[data-action]");
      const cardEl =
        event.target?.closest?.(".factura-card") ||
        event.target?.closest?.(".facturas-mobile-card") ||
        event.target?.closest?.(".facturas-row");

      if (actionEl) {
        const action = safeText(
          actionEl?.dataset?.action ||
            actionEl?.getAttribute?.("data-action"),
          ""
        );

        const facturaId = getFacturaId(actionEl);
        const incidenciaId = getIncidenciaId(actionEl);

        if (action === "open-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isOpenBusyState(state)) {
            return;
          }

          await openFactura?.(facturaId);
          return;
        }

        if (action === "view-factura-pdf") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isActionBusyForFactura(state, facturaId)) {
            return;
          }

          await openFacturaPdf?.(facturaId);
          return;
        }

        if (action === "download-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isActionBusyForFactura(state, facturaId)) {
            return;
          }

          await downloadFacturaPdf?.(facturaId);
          return;
        }

        if (action === "send-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isActionBusyForFactura(state, facturaId)) {
            return;
          }

          await sendFacturaToClient?.(facturaId);
          return;
        }

        if (action === "open-incidencia") {
          event.preventDefault();
          event.stopPropagation();

          if (!incidenciaId || isBusyState(state)) {
            return;
          }

          const opened = await openIncidenciaById(incidenciaId);

          if (!opened) {
            showBindingToast(
              "No se pudo abrir la incidencia relacionada.",
              "error"
            );
          }

          return;
        }

        if (action === "close-detail") {
          event.preventDefault();
          event.stopPropagation();
          closeDetail?.();
          return;
        }
      }

      if (
        cardEl &&
        !event.target?.closest?.(
          "button, a, input, select, textarea, [data-action]"
        )
      ) {
        const facturaId = getFacturaId(cardEl);

        if (!facturaId || isOpenBusyState(state)) {
          return;
        }

        await openFactura?.(facturaId);
      }
    }
  );

  return () => {
    try {
      AppCore?.cleanup?.run?.(resolveScopeName(scopeName));
    } catch {}
  };
}

export default {
  bindFacturasView,
};

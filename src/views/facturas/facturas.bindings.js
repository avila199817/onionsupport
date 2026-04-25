/* =========================================================
   Onion SPA - Facturas Bindings
   Archivo: src/views/facturas/facturas.bindings.js

   FINAL PRO SYSTEM · BINDINGS REAL · 10/10
   PATCH · OPEN INCIDENCIA SUPPORT · PAGINATION SUPPORT

   RESPONSABILIDADES:
   - registrar eventos UI del módulo de facturas
   - bind de refresh / retry / export
   - delegación de eventos sobre tabla/cards y acciones de colección
   - soportar click en incidencia relacionada
   - soportar paginación visual: prev / next / page
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

function getDatasetValue(element, ...keys) {
  if (!element) return "";

  for (const key of keys) {
    const value = element?.dataset?.[key];

    if (safeText(value, "")) {
      return safeText(value, "");
    }
  }

  return "";
}

function getAttrValue(element, ...attrs) {
  if (!element) return "";

  for (const attr of attrs) {
    try {
      const value = element.getAttribute?.(attr);

      if (safeText(value, "")) {
        return safeText(value, "");
      }
    } catch {}
  }

  return "";
}

function getFacturaId(element) {
  return safeText(
    getDatasetValue(element, "facturaId") ||
      getAttrValue(element, "data-factura-id") ||
      "",
    ""
  );
}

function getIncidenciaId(element) {
  return safeText(
    getDatasetValue(element, "ticketId", "incidenciaId") ||
      getAttrValue(element, "data-ticket-id", "data-incidencia-id") ||
      "",
    ""
  );
}

function getActionName(element) {
  return safeText(
    getDatasetValue(element, "action", "facturasAction") ||
      getAttrValue(element, "data-action", "data-facturas-action") ||
      "",
    ""
  );
}

function getPageValue(element, fallback = 1) {
  const raw = safeText(
    getDatasetValue(element, "page") ||
      getAttrValue(element, "data-page") ||
      "",
    ""
  );

  const n = Number.parseInt(raw, 10);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return n;
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

async function openIncidenciaById(incidenciaId = "", openIncidencia = null) {
  const id = safeText(incidenciaId, "");

  if (!id) return false;

  if (typeof openIncidencia === "function") {
    try {
      const result = await openIncidencia(id);

      if (result !== false) {
        return true;
      }
    } catch {}
  }

  try {
    if (typeof window?.OnionIncidenciasModal?.openById === "function") {
      await window.OnionIncidenciasModal.openById(id);
      return true;
    }
  } catch {}

  try {
    AppCore?.events?.emit?.("facturas:open-incidencia", {
      incidenciaId: id,
      ticketId: id,
    });
  } catch {}

  try {
    AppCore?.events?.emit?.("incidencias:modal:open-request", {
      incidenciaId: id,
      ticketId: id,
    });
  } catch {}

  const candidates = [
    `/incidencias?ticketId=${encodeURIComponent(id)}`,
    `/incidencias/${encodeURIComponent(id)}`,
    `/tickets/${encodeURIComponent(id)}`,
  ];

  for (const path of candidates) {
    const ok = await tryNavigateWith(path);

    if (ok) return true;
  }

  return false;
}

function resolveCurrentPage(state = {}) {
  const candidates = [
    state?.page,
    state?.currentPage,
    state?.facturasPage,
    state?.view?.page,
    state?.view?.currentPage,
    state?.pagination?.page,
    state?.pagination?.currentPage,
  ];

  for (const candidate of candidates) {
    const n = Number.parseInt(candidate, 10);

    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }

  return 1;
}

function runRender(render) {
  try {
    if (typeof render === "function") {
      render();
      return true;
    }
  } catch {}

  return false;
}

function trySetPageOnState(state = {}, page = 1) {
  const nextPage = Math.max(1, Number.parseInt(page, 10) || 1);

  try {
    if (state?.view && typeof state.view === "object") {
      state.view.page = nextPage;
      state.view.currentPage = nextPage;
      state.view.facturasPage = nextPage;
      return true;
    }
  } catch {}

  try {
    if (state?.pagination && typeof state.pagination === "object") {
      state.pagination.page = nextPage;
      state.pagination.currentPage = nextPage;
      return true;
    }
  } catch {}

  try {
    state.page = nextPage;
    state.currentPage = nextPage;
    state.facturasPage = nextPage;
    return true;
  } catch {}

  return false;
}

async function handlePagination({
  action = "",
  page = 1,
  state = {},
  render,
  goToPage,
  goPrevPage,
  goNextPage,
  setPage,
} = {}) {
  if (isBusyState(state)) {
    return false;
  }

  const currentPage = resolveCurrentPage(state);

  if (action === "prev-page" || action === "pagination-prev") {
    if (typeof goPrevPage === "function") {
      await goPrevPage();
      return true;
    }

    page = Math.max(1, currentPage - 1);
  }

  if (action === "next-page" || action === "pagination-next") {
    if (typeof goNextPage === "function") {
      await goNextPage();
      return true;
    }

    page = currentPage + 1;
  }

  if (typeof goToPage === "function") {
    await goToPage(page);
    return true;
  }

  if (typeof setPage === "function") {
    await setPage(page);
    runRender(render);
    return true;
  }

  const patched = trySetPageOnState(state, page);

  if (patched) {
    runRender(render);
    return true;
  }

  showBindingToast(
    "La paginación necesita conectar goToPage o setPage desde FacturasView.",
    "warning"
  );

  return false;
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

  openIncidencia,
  openRelatedIncidencia,

  goToPage,
  goPrevPage,
  goNextPage,
  setPage,
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

      const actionEl =
        event.target?.closest?.("[data-action]") ||
        event.target?.closest?.("[data-facturas-action]");

      const cardEl =
        event.target?.closest?.(".factura-card") ||
        event.target?.closest?.(".facturas-mobile-card") ||
        event.target?.closest?.(".facturas-row");

      if (actionEl) {
        const action = getActionName(actionEl);
        const facturaId = getFacturaId(actionEl);
        const incidenciaId = getIncidenciaId(actionEl);

        if (
          action === "prev-page" ||
          action === "pagination-prev" ||
          action === "next-page" ||
          action === "pagination-next" ||
          action === "page" ||
          action === "go-page"
        ) {
          event.preventDefault();
          event.stopPropagation();

          const page = getPageValue(
            actionEl,
            resolveCurrentPage(state)
          );

          await handlePagination({
            action,
            page,
            state,
            render,
            goToPage,
            goPrevPage,
            goNextPage,
            setPage,
          });

          return;
        }

        if (action === "refresh" || action === "reload") {
          event.preventDefault();
          event.stopPropagation();

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

          return;
        }

        if (action === "retry") {
          event.preventDefault();
          event.stopPropagation();

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

          return;
        }

        if (action === "export" || action === "export-csv") {
          event.preventDefault();
          event.stopPropagation();

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

          return;
        }

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

          const opened = await openIncidenciaById(
            incidenciaId,
            openIncidencia || openRelatedIncidencia
          );

          if (!opened) {
            showBindingToast(
              "No se pudo abrir la incidencia relacionada.",
              "error"
            );
          }

          return;
        }

        if (
          action === "close-detail" ||
          action === "close-factura-detail"
        ) {
          event.preventDefault();
          event.stopPropagation();

          closeDetail?.();
          return;
        }
      }

      if (
        cardEl &&
        !event.target?.closest?.(
          "button, a, input, select, textarea, [data-action], [data-facturas-action]"
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

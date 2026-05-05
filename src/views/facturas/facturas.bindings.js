/* =========================================================
   Onion SPA - Facturas Bindings
   Archivo: src/views/facturas/facturas.bindings.js

   FINAL PRO SYSTEM · FACTURAS BINDINGS · CSP CLEAN · 15/10
   PATCH · SINGLE DELEGATION
   PATCH · ROW CLICK OPENS DETAIL VIEW
   PATCH · IGNORE LEGACY data-row-click-disabled
   PATCH · NO API FALLBACKS
   PATCH · NO STORE ACCESS
   PATCH · NO FILTER/SEARCH/SORT DUPLICATION
   PATCH · ACTION LOCKS
   PATCH · PAGINATION SUPPORT
   PATCH · CREATE FACTURA MODAL BRIDGE
   PATCH · OPEN INCIDENCIA VIA VIEW BRIDGE ONLY
   PATCH · CLEANUP ENTERPRISE

   RESPONSABILIDADES:
   - Registrar eventos UI del módulo Facturas.
   - Delegar acciones de colección y fila.
   - Abrir detalle al pinchar en cualquier zona no interactiva de la fila.
   - No abrir detalle al pinchar botones, inputs, enlaces o acciones internas.
   - No cargar datos directamente.
   - No abrir modales de incidencia directamente.
   - No importar store.
   - No duplicar filtros, búsqueda ni orden.
   - No ejecutar bootstrap inicial.
   - Evitar dobles listeners por rerender.
   - Evitar dobles clicks por acción/factura.
   - Mantener facturasView.js como owner del estado real.
========================================================= */

import { AppCore } from "../../core/index.js";
import { safeText } from "./facturas.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_SCOPE = "view:facturas";

const ACTION_ALIASES = Object.freeze({
  "create-factura": "create-factura",
  "new-factura": "create-factura",
  "create-invoice": "create-factura",
  "new-invoice": "create-factura",

  refresh: "refresh",
  reload: "refresh",

  retry: "retry",

  export: "export",
  "export-csv": "export",

  "open-factura": "open-factura",
  detail: "open-factura",
  details: "open-factura",
  "open-detail": "open-factura",
  "view-factura": "open-factura",
  "view-invoice": "open-factura",

  "view-factura-pdf": "view-factura-pdf",
  "view-pdf": "view-factura-pdf",
  "ver-pdf": "view-factura-pdf",
  pdf: "view-factura-pdf",

  "download-factura": "download-factura",
  "download-pdf": "download-factura",
  descargar: "download-factura",

  "send-factura": "send-factura",
  "send-invoice": "send-factura",
  enviar: "send-factura",

  "open-incidencia": "open-incidencia",
  "open-ticket": "open-incidencia",
  "open-related-incidencia": "open-incidencia",
  incidencia: "open-incidencia",
  ticket: "open-incidencia",

  "prev-page": "prev-page",
  "pagination-prev": "prev-page",

  "next-page": "next-page",
  "pagination-next": "next-page",

  page: "page",
  "go-page": "page",

  "close-detail": "close-detail",
  "close-factura-detail": "close-detail",
});

const VIEW_OWNED_ACTIONS = new Set([
  "filter",
  "filter-facturas",
  "sort",
  "sort-facturas",
  "search",
  "search-facturas",
  "clear-search",
  "clear-filters",
  "clear-facturas-search",
  "clear-facturas-filters",
  "reset-filters",
]);

const ROW_SELECTOR = [
  ".facturas-table-row",
  ".facturas-row",
  ".factura-card",
  ".facturas-mobile-card",
  "[data-facturas-row='true']",
  "[data-factura-id]",
].join(",");

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[tabindex]:not(.facturas-table-row):not(.facturas-row):not(.factura-card):not(.facturas-mobile-card)",
  "[data-action]",
  "[data-facturas-action]",
].join(",");

/* =========================================================
   BASE HELPERS
========================================================= */

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function normalizeActionName(value = "") {
  const key = normalizeKey(value);

  return ACTION_ALIASES[key] || key;
}

function resolveScopeName(scopeName = DEFAULT_SCOPE) {
  return safeText(scopeName, DEFAULT_SCOPE);
}

function getLiveState(getState) {
  try {
    return typeof getState === "function" ? safeObject(getState()) : {};
  } catch {
    return {};
  }
}

function getRoot(container, scopeName = DEFAULT_SCOPE) {
  if (!container) return null;

  const finalScopeName = resolveScopeName(scopeName);

  return (
    container.querySelector(`[data-facturas-scope="${finalScopeName}"]`) ||
    container.querySelector(".facturas-view-root[data-facturas-scope]") ||
    container.querySelector("[data-facturas-scope='true']") ||
    container.querySelector(".facturas-view-root") ||
    container.querySelector("[data-facturas-panel='true']") ||
    container
  );
}

function getDatasetValue(element, ...keys) {
  if (!element) return "";

  for (const key of keys) {
    const value = element?.dataset?.[key];
    if (safeText(value, "")) return safeText(value, "");
  }

  return "";
}

function getAttrValue(element, ...attrs) {
  if (!element) return "";

  for (const attr of attrs) {
    try {
      const value = element.getAttribute?.(attr);
      if (safeText(value, "")) return safeText(value, "");
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
  return normalizeActionName(
    getDatasetValue(element, "facturasAction", "action") ||
      getAttrValue(element, "data-facturas-action", "data-action") ||
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

  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isDisabledElement(element) {
  if (!element) return false;

  return Boolean(
    element.disabled ||
      element.getAttribute?.("disabled") !== null ||
      element.getAttribute?.("aria-disabled") === "true"
  );
}

function markElementBusy(element, busy = true) {
  if (!element) return;

  try {
    if (busy) {
      element.setAttribute("aria-busy", "true");
      element.classList?.add?.("is-binding-busy");
    } else {
      element.removeAttribute("aria-busy");
      element.classList?.remove?.("is-binding-busy");
    }
  } catch {}
}

function prevent(event) {
  try {
    event.preventDefault();
    event.stopPropagation();
  } catch {}
}

function isElementInsideRoot(root, element) {
  try {
    return Boolean(root && element && root.contains(element));
  } catch {
    return false;
  }
}

/* =========================================================
   ROW HELPERS
========================================================= */

function getRowElementFromEvent(event, root) {
  const rowEl = event?.target?.closest?.(ROW_SELECTOR) || null;

  if (!rowEl || !isElementInsideRoot(root, rowEl)) return null;

  const facturaId = getFacturaId(rowEl);
  if (!facturaId) return null;

  return rowEl;
}

function isInsideInteractiveElement(event, rowEl) {
  const target = event?.target;
  if (!target || !rowEl) return false;

  const interactiveEl = target.closest?.(INTERACTIVE_SELECTOR) || null;

  if (!interactiveEl) return false;

  return rowEl.contains(interactiveEl);
}

function prepareClickableRows(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;

  const rows = root.querySelectorAll(ROW_SELECTOR);

  rows.forEach((row) => {
    const facturaId = getFacturaId(row);
    if (!facturaId) return;

    try {
      row.dataset.facturasRowClickable = "true";
      row.classList?.add?.("is-clickable");

      if (!row.hasAttribute("tabindex")) {
        row.setAttribute("tabindex", "0");
      }

      if (!row.hasAttribute("aria-label")) {
        row.setAttribute("aria-label", `Abrir detalle de factura ${facturaId}`);
      }
    } catch {}
  });
}

function shouldOpenRowByKeyboard(event, rowEl) {
  if (!rowEl) return false;
  if (event.key !== "Enter" && event.key !== " ") return false;
  if (isInsideInteractiveElement(event, rowEl)) return false;

  return true;
}

/* =========================================================
   STATE HELPERS
========================================================= */

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

function canCreateFacturaFromState(state = {}) {
  const role = normalizeKey(
    first(
      state?.role,
      state?.rawRole,
      state?.view?.role,
      state?.view?.rawRole,
      ""
    )
  );

  return Boolean(
    state?.canCreateFactura ||
      state?.isAdmin ||
      state?.view?.canCreateFactura ||
      state?.view?.isAdmin ||
      role === "admin" ||
      role === "administrator" ||
      role === "superadmin" ||
      role === "super-admin" ||
      role === "root" ||
      role === "owner"
  );
}

function resolveCurrentPage(state = {}) {
  const candidates = [
    state?.page,
    state?.currentPage,
    state?.facturasPage,
    state?.view?.page,
    state?.view?.currentPage,
    state?.view?.facturasPage,
    state?.pagination?.page,
    state?.pagination?.currentPage,
  ];

  for (const candidate of candidates) {
    const n = Number.parseInt(candidate, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return 1;
}

/* =========================================================
   TOAST
========================================================= */

function showBindingToast(message = "", type = "info") {
  const text = safeText(message, "");
  if (!text) return false;

  const finalType = normalizeKey(type) || "info";

  try {
    if (typeof AppCore?.toast?.[finalType] === "function") {
      AppCore.toast[finalType](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.show === "function") {
      AppCore.toast.show(text, finalType);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.[finalType] === "function") {
      AppCore.ui.toast[finalType](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.showToast === "function") {
      AppCore.showToast(text, finalType);
      return true;
    }
  } catch {}

  try {
    const logger =
      finalType === "error"
        ? console.error
        : finalType === "warning"
          ? console.warn
          : console.log;

    logger(`[FacturasBindings:${finalType}]`, text);
  } catch {}

  return false;
}

/* =========================================================
   CLEANUP / LISTENERS
========================================================= */

function runScopeCleanup(scopeName = DEFAULT_SCOPE) {
  try {
    AppCore?.cleanup?.run?.(resolveScopeName(scopeName));
  } catch {}
}

function addScopedListener(cleanups, scopeName, target, eventName, handler, options) {
  if (!target || !eventName || typeof handler !== "function") return;

  const scope = resolveScopeName(scopeName);

  try {
    if (typeof AppCore?.cleanup?.on === "function") {
      AppCore.cleanup.on(scope, target, eventName, handler, options);
      return;
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);
    cleanups.push(() => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    });
  } catch {}
}

/* =========================================================
   ACTION LOCKS
========================================================= */

const actionLocks = new Set();

function buildActionLockKey(action = "", payload = "") {
  return `${normalizeActionName(action)}:${safeText(payload, "global")}`;
}

async function runLocked(action = "", payload = "", callback = null) {
  const key = buildActionLockKey(action, payload);

  if (actionLocks.has(key)) {
    return false;
  }

  actionLocks.add(key);

  try {
    if (typeof callback === "function") {
      return await callback();
    }

    return true;
  } finally {
    actionLocks.delete(key);
  }
}

/* =========================================================
   ACTION HELPERS
========================================================= */

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

async function handlePagination({
  action = "",
  page = 1,
  state = {},
  goToPage,
  goPrevPage,
  goNextPage,
  setPage,
} = {}) {
  if (isBusyState(state)) return false;

  const currentPage = resolveCurrentPage(state);
  let targetPage = page;

  if (action === "prev-page") {
    if (typeof goPrevPage === "function") {
      await goPrevPage();
      return true;
    }

    targetPage = Math.max(1, currentPage - 1);
  }

  if (action === "next-page") {
    if (typeof goNextPage === "function") {
      await goNextPage();
      return true;
    }

    targetPage = currentPage + 1;
  }

  if (typeof goToPage === "function") {
    await goToPage(targetPage);
    return true;
  }

  if (typeof setPage === "function") {
    await setPage(targetPage);
    return true;
  }

  showBindingToast(
    "La paginación necesita conectar goToPage o setPage desde FacturasView.",
    "warning"
  );

  return false;
}

function shouldIgnoreAction(action = "") {
  const key = normalizeActionName(action);

  return VIEW_OWNED_ACTIONS.has(key);
}

/* =========================================================
   OPEN ROW DETAIL
========================================================= */

async function openFacturaFromRow({
  event,
  rowEl,
  state = {},
  openFactura,
} = {}) {
  if (!rowEl) return false;

  const facturaId = getFacturaId(rowEl);
  if (!facturaId) return false;

  if (isOpenBusyState(state)) {
    prevent(event);
    return true;
  }

  if (typeof openFactura !== "function") {
    prevent(event);
    showBindingToast("La apertura de factura no está conectada.", "error");
    return true;
  }

  prevent(event);

  await runLocked("row-open-factura", facturaId, async () => {
    try {
      rowEl.setAttribute("aria-busy", "true");
      rowEl.classList?.add?.("is-row-opening");
    } catch {}

    try {
      await openFactura(facturaId);
    } finally {
      try {
        rowEl.removeAttribute("aria-busy");
        rowEl.classList?.remove?.("is-row-opening");
      } catch {}
    }
  });

  return true;
}

/* =========================================================
   ACTION DISPATCHER
========================================================= */

async function dispatchFacturasAction({
  event,
  actionEl,
  state,

  loadFacturas,
  openFactura,
  openFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,

  createFactura,

  openIncidencia,
  openRelatedIncidencia,

  goToPage,
  goPrevPage,
  goNextPage,
  setPage,
} = {}) {
  const action = getActionName(actionEl);

  if (!action) {
    return false;
  }

  if (shouldIgnoreAction(action)) {
    return false;
  }

  const rowEl = actionEl.closest?.(ROW_SELECTOR) || null;

  const facturaId = safeText(
    getFacturaId(actionEl) ||
      getFacturaId(rowEl) ||
      "",
    ""
  );

  const incidenciaId = getIncidenciaId(actionEl);

  if (isDisabledElement(actionEl)) {
    prevent(event);
    return true;
  }

  if (action === "create-factura") {
    prevent(event);

    if (isBusyState(state)) return true;

    if (!canCreateFacturaFromState(state)) {
      showBindingToast("No tienes permisos para crear facturas.", "error");
      return true;
    }

    if (typeof createFactura !== "function") {
      showBindingToast(
        "El modal de creación de facturas no está conectado.",
        "error"
      );
      return true;
    }

    await runLocked(action, "global", async () => {
      markElementBusy(actionEl, true);

      try {
        await createFactura();
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "refresh") {
    prevent(event);

    if (isBusyState(state)) return true;

    await runLocked(action, "global", async () => {
      markElementBusy(actionEl, true);

      try {
        await safeRefresh({
          loadFacturas,
          silent: true,
          asRefresh: true,
          force: true,
        });

        showBindingToast("Facturas actualizadas correctamente.", "success");
      } catch {
        showBindingToast("No se pudo actualizar el listado.", "error");
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "retry") {
    prevent(event);

    if (isBusyState(state)) return true;

    await runLocked(action, "global", async () => {
      markElementBusy(actionEl, true);

      try {
        await safeRefresh({
          loadFacturas,
          silent: false,
          asRefresh: false,
          force: true,
        });
      } catch {
        showBindingToast("No se pudo recargar la facturación.", "error");
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "export") {
    prevent(event);

    if (isBusyState(state)) return true;

    await runLocked(action, "global", async () => {
      try {
        if (typeof exportFacturasCsv !== "function") {
          showBindingToast("La exportación CSV no está conectada.", "error");
          return;
        }

        await exportFacturasCsv();
      } catch {
        showBindingToast("No se pudo exportar el CSV.", "error");
      }
    });

    return true;
  }

  if (action === "prev-page" || action === "next-page" || action === "page") {
    prevent(event);

    const page = getPageValue(actionEl, resolveCurrentPage(state));

    await runLocked(action, String(page), async () => {
      await handlePagination({
        action,
        page,
        state,
        goToPage,
        goPrevPage,
        goNextPage,
        setPage,
      });
    });

    return true;
  }

  if (action === "open-incidencia") {
    prevent(event);

    const finalIncidenciaId = safeText(incidenciaId, "");

    if (!finalIncidenciaId || isBusyState(state)) {
      return true;
    }

    const delegatedOpen = openIncidencia || openRelatedIncidencia;

    if (typeof delegatedOpen !== "function") {
      showBindingToast(
        "El bridge de incidencias no está conectado.",
        "error"
      );
      return true;
    }

    await runLocked(action, finalIncidenciaId, async () => {
      markElementBusy(actionEl, true);

      try {
        const opened = await delegatedOpen(finalIncidenciaId, {
          ticketId: finalIncidenciaId,
          incidenciaId: finalIncidenciaId,
          facturaId,
        });

        if (opened === false) {
          showBindingToast(
            "No se pudo abrir la incidencia relacionada.",
            "error"
          );
        }
      } catch {
        showBindingToast(
          "No se pudo abrir la incidencia relacionada.",
          "error"
        );
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "open-factura") {
    prevent(event);

    if (!facturaId || isOpenBusyState(state)) {
      return true;
    }

    if (typeof openFactura !== "function") {
      showBindingToast("La apertura de factura no está conectada.", "error");
      return true;
    }

    await runLocked(action, facturaId, async () => {
      markElementBusy(actionEl, true);

      try {
        await openFactura(facturaId);
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "view-factura-pdf") {
    prevent(event);

    if (!facturaId || isActionBusyForFactura(state, facturaId)) {
      return true;
    }

    if (typeof openFacturaPdf !== "function") {
      showBindingToast("La visualización del PDF no está conectada.", "error");
      return true;
    }

    await runLocked(action, facturaId, async () => {
      markElementBusy(actionEl, true);

      try {
        await openFacturaPdf(facturaId);
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "download-factura") {
    prevent(event);

    if (!facturaId || isActionBusyForFactura(state, facturaId)) {
      return true;
    }

    if (typeof downloadFacturaPdf !== "function") {
      showBindingToast("La descarga del PDF no está conectada.", "error");
      return true;
    }

    await runLocked(action, facturaId, async () => {
      markElementBusy(actionEl, true);

      try {
        await downloadFacturaPdf(facturaId);
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "send-factura") {
    prevent(event);

    if (!facturaId || isActionBusyForFactura(state, facturaId)) {
      return true;
    }

    if (typeof sendFacturaToClient !== "function") {
      showBindingToast("El envío de factura no está conectado.", "error");
      return true;
    }

    await runLocked(action, facturaId, async () => {
      markElementBusy(actionEl, true);

      try {
        await sendFacturaToClient(facturaId);
      } finally {
        markElementBusy(actionEl, false);
      }
    });

    return true;
  }

  if (action === "close-detail") {
    prevent(event);

    try {
      closeDetail?.();
    } catch {}

    return true;
  }

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

  createFactura,

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

  const cleanups = [];
  const finalScopeName = resolveScopeName(scopeName);

  runScopeCleanup(finalScopeName);

  const container = getContainer();
  const root = getRoot(container, finalScopeName);

  if (!container || !root) {
    return () => {};
  }

  prepareClickableRows(root);

  const onClick = async (event) => {
    const state = getLiveState(getState);

    const actionEl =
      event.target?.closest?.("[data-facturas-action]") ||
      event.target?.closest?.("[data-action]") ||
      null;

    if (actionEl && root.contains(actionEl)) {
      const handled = await dispatchFacturasAction({
        event,
        actionEl,
        state,

        loadFacturas,
        openFactura,
        openFacturaPdf,
        downloadFacturaPdf,
        sendFacturaToClient,
        closeDetail,
        exportFacturasCsv,

        createFactura,

        openIncidencia,
        openRelatedIncidencia,

        goToPage,
        goPrevPage,
        goNextPage,
        setPage,
      });

      if (handled) return;
    }

    const rowEl = getRowElementFromEvent(event, root);
    if (!rowEl) return;

    /*
      IMPORTANTE:
      No se respeta data-row-click-disabled="true" porque el template legacy
      lo está pintando en el <tr> y bloqueaba la apertura de detalle.
      La protección correcta está en INTERACTIVE_SELECTOR:
      botones, enlaces, inputs y acciones internas no abren la fila.
    */
    if (isInsideInteractiveElement(event, rowEl)) return;

    await openFacturaFromRow({
      event,
      rowEl,
      state,
      openFactura,
    });
  };

  const onKeydown = async (event) => {
    const actionEl =
      event.target?.closest?.("[data-facturas-action]") ||
      event.target?.closest?.("[data-action]") ||
      null;

    if (actionEl && root.contains(actionEl)) {
      if (
        actionEl.tagName === "BUTTON" ||
        actionEl.tagName === "A" ||
        actionEl.getAttribute?.("role") === "button"
      ) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") return;

      const state = getLiveState(getState);

      const handled = await dispatchFacturasAction({
        event,
        actionEl,
        state,

        loadFacturas,
        openFactura,
        openFacturaPdf,
        downloadFacturaPdf,
        sendFacturaToClient,
        closeDetail,
        exportFacturasCsv,

        createFactura,

        openIncidencia,
        openRelatedIncidencia,

        goToPage,
        goPrevPage,
        goNextPage,
        setPage,
      });

      if (handled) return;
    }

    const rowEl = getRowElementFromEvent(event, root);
    if (!rowEl) return;

    if (!shouldOpenRowByKeyboard(event, rowEl)) return;

    const state = getLiveState(getState);

    await openFacturaFromRow({
      event,
      rowEl,
      state,
      openFactura,
    });
  };

  addScopedListener(cleanups, finalScopeName, root, "click", onClick);
  addScopedListener(cleanups, finalScopeName, root, "keydown", onKeydown);

  return () => {
    runScopeCleanup(finalScopeName);

    cleanups.forEach((cleanup) => {
      try {
        cleanup?.();
      } catch {}
    });

    cleanups.length = 0;
  };
}

export default {
  bindFacturasView,
};

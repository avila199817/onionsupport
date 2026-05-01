/* =========================================================
   Onion SPA - Incidencias Bindings
   Archivo: src/views/incidencias/incidencias.bindings.js

   CLIENT EXPERIENCE PRO · DOM BINDINGS · EXTREME 12/10
   PATCH · FILTER PILLS CONNECTED
   PATCH · DATA-ACTION + DATA-INCIDENCIAS-ACTION
   PATCH · CREATE BUTTON READY
   PATCH · CREATE MODAL EVENT BRIDGE FIXED
   PATCH · PAGINATION READY
   PATCH · ROW CLICK SAFE
   PATCH · NO DOUBLE HANDLERS
   PATCH · MODAL BRIDGE REAL
   PATCH · MUTATION RELOAD BRIDGE

   Responsabilidades:
   - bind DOM robusto por delegación
   - refresh / retry
   - export CSV
   - create incidencia
   - filtros visuales funcionales
   - pagination prev / next
   - open ticket modal
   - copy id
   - rebind limpio tras rerender
   - cleanup sólido por scope
   - compatibilidad con actions antiguas y nuevas
   - compatibilidad con data-action y data-incidencias-action

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - soporta openTicket(ticketId) y openTicket({ ticketId })
   - abre modal si la action solo devuelve el detail
   - refresca listado tras updates del modal
   - respeta data-row-click-disabled="true"
   - conecta filtros con incidenciasState + render/rerender
========================================================= */

import { AppCore } from "../../core/index.js";
import { incidenciasState } from "./incidencias.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_SCOPE = "view:incidencias";

const BrowserWindow = typeof window !== "undefined" ? window : null;
const BrowserDocument = typeof document !== "undefined" ? document : null;

const ACTIONS = Object.freeze({
  refresh: new Set([
    "refresh",
    "retry",
    "reload",
    "refresh-incidencias",
    "reload-incidencias",
    "incidencias-refresh",
    "incidencias-retry",
  ]),

  export: new Set([
    "export",
    "export-csv",
    "export-incidencias",
    "export-incidencias-csv",
    "incidencias-export",
    "incidencias-export-csv",
  ]),

  open: new Set([
    "detail",
    "open-detail",
    "open-ticket",
    "open-incidencia",
    "view-ticket",
    "view-incidencia",
    "ticket-open",
    "incidencia-open",
    "show-ticket",
    "show-incidencia",
  ]),

  copy: new Set([
    "copy",
    "copy-id",
    "copy-ticket-id",
    "copy-incidencia-id",
    "copy-ticket",
    "copy-incidencia",
  ]),

  create: new Set([
    "create",
    "new",
    "new-incidencia",
    "create-incidencia",
    "incidencias-create",
    "open-create",
    "open-create-incidencia",
  ]),

  filter: new Set([
    "filter",
    "filter-incidencias",
    "filter-tickets",
    "status-filter",
    "set-filter",
    "set-status-filter",
    "incidencias-filter",
  ]),

  clearFilters: new Set([
    "clear-filter",
    "clear-filters",
    "reset-filter",
    "reset-filters",
    "clear-incidencias-filter",
    "clear-incidencias-filters",
  ]),

  prevPage: new Set([
    "prev",
    "previous",
    "prev-page",
    "previous-page",
    "incidencias-prev-page",
  ]),

  nextPage: new Set([
    "next",
    "next-page",
    "incidencias-next-page",
  ]),
});

const VALID_FILTERS = new Set([
  "all",
  "open",
  "pending",
  "progress",
  "resolved",
  "closed",
  "urgent",
  "attachments",
  "billed",
]);

const ACTION_SELECTOR = [
  "[data-incidencias-action]",
  "[data-action]",
].join(",");

const ROW_SELECTOR = [
  ".incidencias-row",
  "[data-ticket-row]",
  "[data-incidencia-row]",
  "[data-ticket-id][data-row]",
  "[data-ticket-id][role='row']",
  "tr[data-ticket-id]",
  "article[data-ticket-id]",
].join(",");

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[data-action]",
  "[data-incidencias-action]",
  "[data-spa]",
  "[data-no-row-open]",
].join(",");

const fallbackCleanups = new Map();
const busyKeys = new Set();
const busyElementMeta = new WeakMap();

let reloadScheduled = false;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAction(value = "") {
  return safeLower(value, "")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeFilter(value = "") {
  const key = normalizeAction(value);

  if (!key || key === "todos" || key === "todas") return "all";
  if (key === "in-progress") return "progress";
  if (key === "with-attachments" || key === "con-adjuntos") return "attachments";
  if (key === "with-amount" || key === "with-invoices" || key === "con-importe") return "billed";

  return VALID_FILTERS.has(key) ? key : "all";
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[IncidenciasBindings]", ...args);
    return;
  } catch {}

  try {
    console.warn("[IncidenciasBindings]", ...args);
  } catch {}
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");
  const kind = safeText(type, "info");

  if (!text) return;

  try {
    if (typeof AppCore?.toast?.[kind] === "function") {
      AppCore.toast[kind](text);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, kind);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[kind]?.(text);
  } catch {}
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    BrowserWindow?.dispatchEvent?.(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

/* =========================================================
   SCOPE / CLEANUP
========================================================= */

function resolveScopeName(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function addFallbackCleanup(scopeName = DEFAULT_SCOPE, cleanup) {
  const finalScope = resolveScopeName(scopeName);

  if (typeof cleanup !== "function") return;

  if (!fallbackCleanups.has(finalScope)) {
    fallbackCleanups.set(finalScope, new Set());
  }

  fallbackCleanups.get(finalScope).add(cleanup);
}

function runFallbackCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);
  const cleanups = fallbackCleanups.get(finalScope);

  if (!cleanups) return;

  cleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch {}
  });

  fallbackCleanups.delete(finalScope);
}

function runScopeCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  try {
    AppCore?.cleanup?.run?.(finalScope);
  } catch {}

  runFallbackCleanup(finalScope);
}

function getScope(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  runScopeCleanup(finalScope);

  try {
    return AppCore?.cleanup?.scope?.(finalScope) || finalScope;
  } catch {
    return finalScope;
  }
}

function bindDomEvent({
  scopeName = DEFAULT_SCOPE,
  scopeRef = null,
  target = null,
  eventName = "",
  handler = null,
  options = undefined,
} = {}) {
  if (!target || !eventName || typeof handler !== "function") return false;

  try {
    if (typeof AppCore?.cleanup?.on === "function") {
      AppCore.cleanup.on(scopeRef || scopeName, target, eventName, handler, options);
      return true;
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);

    addFallbackCleanup(scopeName, () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    });

    return true;
  } catch {
    return false;
  }
}

function bindBusEvent({
  scopeName = DEFAULT_SCOPE,
  eventName = "",
  handler = null,
} = {}) {
  if (!eventName || typeof handler !== "function") return false;

  let bound = false;

  try {
    if (typeof AppCore?.events?.on === "function") {
      const off = AppCore.events.on(eventName, handler);
      bound = true;

      addFallbackCleanup(scopeName, () => {
        try {
          if (typeof off === "function") {
            off();
            return;
          }

          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  try {
    if (BrowserWindow?.addEventListener) {
      const windowHandler = (event) => handler(event);

      BrowserWindow.addEventListener(eventName, windowHandler);
      bound = true;

      addFallbackCleanup(scopeName, () => {
        try {
          BrowserWindow.removeEventListener(eventName, windowHandler);
        } catch {}
      });
    }
  } catch {}

  return bound;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getContainer() {
  return (
    AppCore?.dom?.viewContainer ||
    BrowserDocument?.getElementById?.("view-container") ||
    BrowserDocument
  );
}

function getEventTargetElement(event) {
  const target = event?.target || null;

  if (!target) return null;

  if (target.nodeType === 1) {
    return target;
  }

  return target.parentElement || null;
}

function isElementInsideRoot(root, element) {
  try {
    if (!root || !element) return false;
    if (root === BrowserDocument) return true;
    return root.contains(element);
  } catch {
    return true;
  }
}

function closestInside(root, target, selector = "") {
  const element = target?.nodeType === 1 ? target : target?.parentElement;

  if (!element || !selector || typeof element.closest !== "function") {
    return null;
  }

  const match = element.closest(selector);

  if (!match || !isElementInsideRoot(root, match)) {
    return null;
  }

  return match;
}

function getActionNames(element = null) {
  if (!element) return [];

  return [
    element?.dataset?.incidenciasAction,
    element?.dataset?.action,
    element?.getAttribute?.("data-incidencias-action"),
    element?.getAttribute?.("data-action"),
  ]
    .map(normalizeAction)
    .filter(Boolean);
}

function elementMatchesActionSet(element = null, actionSet = new Set()) {
  if (!element || !actionSet) return false;

  return getActionNames(element).some((action) => actionSet.has(action));
}

function getActionElement(root, target, actionSet = new Set()) {
  let element = target?.nodeType === 1 ? target : target?.parentElement;

  while (element && isElementInsideRoot(root, element)) {
    if (
      element.matches?.(ACTION_SELECTOR) &&
      elementMatchesActionSet(element, actionSet)
    ) {
      return element;
    }

    if (element === root || element === BrowserDocument?.body) {
      break;
    }

    element = element.parentElement;
  }

  return null;
}

function getAnyActionElement(root, target) {
  return closestInside(root, target, ACTION_SELECTOR);
}

function getDataSource(element) {
  return (
    element?.closest?.(
      [
        "[data-ticket-id]",
        "[data-incidencia-id]",
        "[data-id]",
        "[data-ticket-code]",
      ].join(",")
    ) || element
  );
}

function getTicketId(element) {
  const source = getDataSource(element);

  return safeText(
    first(
      element?.dataset?.ticketId,
      element?.dataset?.incidenciaId,
      element?.dataset?.id,
      element?.getAttribute?.("data-ticket-id"),
      element?.getAttribute?.("data-incidencia-id"),
      element?.getAttribute?.("data-id"),

      source?.dataset?.ticketId,
      source?.dataset?.incidenciaId,
      source?.dataset?.id,
      source?.getAttribute?.("data-ticket-id"),
      source?.getAttribute?.("data-incidencia-id"),
      source?.getAttribute?.("data-id"),

      element?.dataset?.ticketCode,
      element?.getAttribute?.("data-ticket-code"),
      source?.dataset?.ticketCode,
      source?.getAttribute?.("data-ticket-code")
    ),
    ""
  );
}

function getTicketCode(element) {
  const source = getDataSource(element);

  return safeText(
    first(
      element?.dataset?.ticketCode,
      element?.getAttribute?.("data-ticket-code"),
      source?.dataset?.ticketCode,
      source?.getAttribute?.("data-ticket-code"),
      getTicketId(element)
    ),
    ""
  );
}

function getPageFromElement(element = null) {
  return safeNumber(
    first(
      element?.dataset?.page,
      element?.getAttribute?.("data-page"),
      element?.dataset?.targetPage,
      element?.getAttribute?.("data-target-page")
    ),
    0
  );
}

function getFilterFromElement(element = null) {
  return normalizeFilter(
    first(
      element?.dataset?.filter,
      element?.dataset?.filterStatus,
      element?.dataset?.statusFilter,
      element?.getAttribute?.("data-filter"),
      element?.getAttribute?.("data-filter-status"),
      element?.getAttribute?.("data-status-filter")
    )
  );
}

function getRouteFromElement(element = null) {
  return safeText(
    first(
      element?.dataset?.route,
      element?.getAttribute?.("data-route"),
      element?.getAttribute?.("href")
    ),
    ""
  );
}

function isRowClickDisabled(row = null) {
  const value = safeLower(
    first(
      row?.dataset?.rowClickDisabled,
      row?.getAttribute?.("data-row-click-disabled"),
      row?.dataset?.noRowOpen,
      row?.getAttribute?.("data-no-row-open")
    ),
    ""
  );

  return ["true", "1", "yes", "si", "sí", "on"].includes(value);
}

function shouldOpenRowFromClick(root, event) {
  const target = getEventTargetElement(event);
  if (!target) return null;

  const row = closestInside(root, target, ROW_SELECTOR);
  if (!row) return null;

  if (isRowClickDisabled(row)) {
    return null;
  }

  const interactive = target.closest?.(INTERACTIVE_SELECTOR);

  if (interactive && row.contains(interactive)) {
    return null;
  }

  return row;
}

function isFormControl(element = null) {
  const tagName = safeLower(element?.tagName, "");

  return ["button", "input", "select", "textarea"].includes(tagName);
}

function setElementBusy(element, busy = false) {
  if (!element) return;

  try {
    if (busy && !busyElementMeta.has(element)) {
      busyElementMeta.set(element, {
        disabled: Boolean(element.disabled),
        ariaBusy: element.getAttribute?.("aria-busy"),
        classLoading: element.classList?.contains?.("is-loading"),
      });
    }

    if (busy) {
      element.setAttribute("aria-busy", "true");
      element.classList?.add?.("is-loading");

      if (isFormControl(element)) {
        element.disabled = true;
      }

      return;
    }

    const previous = busyElementMeta.get(element) || {};

    if (previous.ariaBusy === null || previous.ariaBusy === undefined) {
      element.removeAttribute?.("aria-busy");
    } else {
      element.setAttribute?.("aria-busy", previous.ariaBusy);
    }

    if (!previous.classLoading) {
      element.classList?.remove?.("is-loading");
    }

    if (isFormControl(element)) {
      element.disabled = Boolean(previous.disabled);
    }

    busyElementMeta.delete(element);
  } catch {}
}

async function runBusy(key = "", element = null, task = null) {
  const finalKey = safeText(key, "");

  if (!finalKey || typeof task !== "function") return null;

  if (busyKeys.has(finalKey)) {
    return null;
  }

  busyKeys.add(finalKey);
  setElementBusy(element, true);

  try {
    return await task();
  } finally {
    busyKeys.delete(finalKey);
    setElementBusy(element, false);
  }
}

/* =========================================================
   VIEW / STATE BRIDGE
========================================================= */

function getGlobalActions() {
  return (
    BrowserWindow?.OnionIncidenciasActions ||
    BrowserWindow?.IncidenciasActions ||
    {}
  );
}

function getViewBridge() {
  return (
    BrowserWindow?.OnionIncidenciasView ||
    BrowserWindow?.IncidenciasView ||
    AppCore?.modules?.IncidenciasView ||
    AppCore?.modules?.incidenciasView ||
    null
  );
}

function patchLocalFilterState(filter = "all") {
  const nextFilter = normalizeFilter(filter);

  try {
    incidenciasState.activeFilter = nextFilter;
    incidenciasState.filter = nextFilter;
    incidenciasState.statusFilter = nextFilter;

    incidenciasState.page = 1;
    incidenciasState.currentPage = 1;
    incidenciasState.incidenciasPage = 1;

    incidenciasState.filters = {
      ...safeObject(incidenciasState.filters),
      active: nextFilter,
      status: nextFilter,
    };

    incidenciasState.table = {
      ...safeObject(incidenciasState.table),
      activeFilter: nextFilter,
      filter: nextFilter,
      statusFilter: nextFilter,
      page: 1,
      currentPage: 1,
    };
  } catch {}

  return nextFilter;
}

async function callFlexibleRerender({
  payload = {},
  render,
  rerender,
} = {}) {
  const view = getViewBridge();
  const globalActions = getGlobalActions();

  const candidates = [
    rerender,
    render,
    view?.rerender,
    view?.render,
    view?.refreshView,
    view?.update,
    globalActions?.rerender,
    globalActions?.render,
  ].filter((candidate) => typeof candidate === "function");

  let handled = false;
  let lastError = null;

  for (const candidate of candidates) {
    try {
      await candidate(payload);
      handled = true;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  safeEmit("incidencias:render:requested", payload);
  safeEmit("incidencias:rerender:requested", payload);

  if (!handled && lastError) {
    throw lastError;
  }

  return handled;
}

async function callFlexibleFilter({
  filter = "all",
  setFilter,
  changeFilter,
  applyFilter,
} = {}) {
  const finalFilter = normalizeFilter(filter);
  const view = getViewBridge();
  const globalActions = getGlobalActions();

  const payload = {
    filter: finalFilter,
    activeFilter: finalFilter,
    statusFilter: finalFilter,
    page: 1,
    source: "bindings",
  };

  const candidates = [
    setFilter,
    changeFilter,
    applyFilter,
    view?.setFilter,
    view?.changeFilter,
    view?.applyFilter,
    globalActions?.setFilter,
    globalActions?.changeFilter,
    globalActions?.applyFilter,
  ].filter((candidate) => typeof candidate === "function");

  let handled = false;
  let lastError = null;

  for (const candidate of candidates) {
    try {
      await candidate(finalFilter, payload);
      handled = true;
      break;
    } catch (error) {
      lastError = error;
    }

    try {
      await candidate(payload);
      handled = true;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  safeEmit("incidencias:filter:change", payload);
  safeEmit("incidencias:bindings:filter:change", payload);

  if (!handled && lastError) {
    throw lastError;
  }

  return handled;
}

/* =========================================================
   CALLBACK COMPAT
========================================================= */

async function callFlexibleOpen(openTicket, payload = {}) {
  const ticketId = safeText(payload.ticketId, "");
  if (!ticketId) return null;

  const candidates = [];

  if (typeof openTicket === "function") {
    candidates.push(() => openTicket(payload));
    candidates.push(() => openTicket(ticketId, payload));
  }

  const globalActions = getGlobalActions();
  const globalOpen =
    globalActions.openTicket ||
    globalActions.getTicketDetail ||
    globalActions.getTicket ||
    null;

  if (typeof globalOpen === "function" && globalOpen !== openTicket) {
    candidates.push(() => globalOpen(payload));
    candidates.push(() => globalOpen(ticketId, payload));
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function callFlexibleCopy(copyTicketIdAction, payload = {}) {
  const ticketId = safeText(payload.ticketId || payload.ticketCode, "");
  if (!ticketId) return false;

  const candidates = [];

  if (typeof copyTicketIdAction === "function") {
    candidates.push(() => copyTicketIdAction(payload));
    candidates.push(() => copyTicketIdAction(ticketId, payload));
  }

  const globalActions = getGlobalActions();
  const globalCopy = globalActions.copyTicketId || globalActions.copyId || null;

  if (typeof globalCopy === "function" && globalCopy !== copyTicketIdAction) {
    candidates.push(() => globalCopy(payload));
    candidates.push(() => globalCopy(ticketId, payload));
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result !== null && result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

async function callFlexibleExport(exportIncidenciasCsvAction) {
  const candidates = [];

  if (typeof exportIncidenciasCsvAction === "function") {
    candidates.push(() => exportIncidenciasCsvAction());
    candidates.push(() =>
      exportIncidenciasCsvAction({
        silent: false,
      })
    );
  }

  const globalActions = getGlobalActions();
  const globalExport =
    globalActions.exportCsv ||
    globalActions.exportIncidenciasCsv ||
    null;

  if (typeof globalExport === "function" && globalExport !== exportIncidenciasCsvAction) {
    candidates.push(() => globalExport());
    candidates.push(() =>
      globalExport({
        silent: false,
      })
    );
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result !== null && result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

async function callFlexibleCreate(createIncidenciaAction, payload = {}) {
  const candidates = [];

  if (typeof createIncidenciaAction === "function") {
    candidates.push(() => createIncidenciaAction(payload));
    candidates.push(() => createIncidenciaAction(payload?.draft || {}, payload));
  }

  const globalActions = getGlobalActions();
  const globalCreate =
    globalActions.createIncidencia ||
    globalActions.openCreate ||
    globalActions.create ||
    null;

  if (typeof globalCreate === "function" && globalCreate !== createIncidenciaAction) {
    candidates.push(() => globalCreate(payload));
    candidates.push(() => globalCreate(payload?.draft || {}, payload));
  }

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result !== null && result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function callFlexiblePage({
  page = 0,
  direction = "",
  setPage,
  nextPage,
  prevPage,
  changePage,
  render,
  rerender,
} = {}) {
  const finalPage = safeNumber(page, 0);
  const finalDirection = safeText(direction, "");

  const payload = {
    page: finalPage,
    direction: finalDirection,
    source: "bindings",
  };

  const candidates = [];

  if (finalPage > 0 && typeof setPage === "function") {
    candidates.push(() => setPage(finalPage, payload));
    candidates.push(() => setPage(payload));
  }

  if (typeof changePage === "function") {
    candidates.push(() => changePage(payload));

    if (finalPage > 0) {
      candidates.push(() => changePage(finalPage, payload));
    }
  }

  if (finalDirection === "next" && typeof nextPage === "function") {
    candidates.push(() => nextPage(payload));
  }

  if (finalDirection === "prev" && typeof prevPage === "function") {
    candidates.push(() => prevPage(payload));
  }

  const view = getViewBridge();

  if (finalPage > 0 && typeof view?.setPage === "function") {
    candidates.push(() => view.setPage(finalPage, payload));
  }

  if (typeof view?.changePage === "function") {
    candidates.push(() => view.changePage(payload));
  }

  if (finalDirection === "next" && typeof view?.nextPage === "function") {
    candidates.push(() => view.nextPage(payload));
  }

  if (finalDirection === "prev" && typeof view?.prevPage === "function") {
    candidates.push(() => view.prevPage(payload));
  }

  let handled = false;
  let lastError = null;

  for (const attempt of candidates) {
    try {
      await attempt();
      handled = true;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  safeEmit("incidencias:page:change", payload);
  safeEmit("incidencias:bindings:page:change", payload);

  try {
    await callFlexibleRerender({
      payload,
      render,
      rerender,
    });

    handled = true;
  } catch (error) {
    lastError = error;
  }

  if (!handled && lastError) {
    throw lastError;
  }

  return handled;
}

/* =========================================================
   MODAL BRIDGES
========================================================= */

function pickDetailPayload(response = null) {
  if (!response) return null;

  if (isObject(response)) {
    return (
      response.detail ||
      response.ticket ||
      response.item ||
      response.data ||
      response.result ||
      response.payload ||
      response.incidencia ||
      response
    );
  }

  return null;
}

function openModalBridge(detail = null, ticketId = "") {
  const payload = pickDetailPayload(detail);

  if (!payload || !Object.keys(safeObject(payload)).length) {
    return false;
  }

  try {
    if (typeof BrowserWindow?.OnionIncidenciasModal?.open === "function") {
      BrowserWindow.OnionIncidenciasModal.open(payload);
      return true;
    }
  } catch {}

  try {
    if (typeof BrowserWindow?.IncidenciasModal?.open === "function") {
      BrowserWindow.IncidenciasModal.open(payload);
      return true;
    }
  } catch {}

  try {
    if (typeof BrowserWindow?.renderIncidenciaTicketModal === "function") {
      BrowserWindow.renderIncidenciaTicketModal(payload);
      return true;
    }
  } catch {}

  safeEmit("incidencias:modal:open", {
    ticketId,
    detail: payload,
  });

  return true;
}

function openCreateModalBridge(payload = {}) {
  try {
    if (typeof BrowserWindow?.OnionIncidenciasCreateModal?.open === "function") {
      BrowserWindow.OnionIncidenciasCreateModal.open(payload);
      return true;
    }
  } catch {}

  try {
    if (typeof BrowserWindow?.OnionIncidencias?.createModal?.open === "function") {
      BrowserWindow.OnionIncidencias.createModal.open(payload);
      return true;
    }
  } catch {}

  try {
    if (typeof BrowserWindow?.renderIncidenciasCreateModal === "function") {
      BrowserWindow.renderIncidenciasCreateModal(payload);
      return true;
    }
  } catch {}

  safeEmit("incidencias:create-modal:open", payload);
  safeEmit("incidencias:create:open", payload);

  return true;
}

async function navigateToCreate(route = "/incidencias/nueva") {
  const target = safeText(route, "/incidencias/nueva");

  try {
    if (typeof AppCore?.router?.navigate === "function") {
      await AppCore.router.navigate(target);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.Router?.navigate === "function") {
      await AppCore.Router.navigate(target);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.modules?.Router?.navigate === "function") {
      await AppCore.modules.Router.navigate(target);
      return true;
    }
  } catch {}

  try {
    if (typeof BrowserWindow?.Router?.navigate === "function") {
      await BrowserWindow.Router.navigate(target);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   RELOAD
========================================================= */

async function safeReload(reload, loadIncidencias, meta = {}) {
  try {
    safeEmit("incidencias:bindings:reload:start", meta);

    if (typeof reload === "function") {
      const result = await reload({
        force: true,
        source: meta.source || "bindings",
      });

      safeEmit("incidencias:bindings:reload:success", {
        ...meta,
        result,
      });

      return result;
    }

    if (typeof loadIncidencias === "function") {
      const result = await loadIncidencias({
        force: true,
        source: meta.source || "bindings",
      });

      safeEmit("incidencias:bindings:reload:success", {
        ...meta,
        result,
      });

      return result;
    }

    return null;
  } catch (error) {
    safeWarn("reload falló", error);

    safeEmit("incidencias:bindings:reload:error", {
      ...meta,
      error,
    });

    return null;
  }
}

function scheduleReload(reload, loadIncidencias, meta = {}) {
  if (reloadScheduled) return;

  reloadScheduled = true;

  setTimeout(async () => {
    reloadScheduled = false;

    await safeReload(reload, loadIncidencias, {
      source: "scheduled",
      ...meta,
    });
  }, 80);
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function handleRefresh({
  element = null,
  reload,
  loadIncidencias,
} = {}) {
  await runBusy("incidencias:refresh", element, async () => {
    await safeReload(reload, loadIncidencias, {
      source: "manual",
    });
  });
}

async function handleExport({
  element = null,
  exportIncidenciasCsvAction,
} = {}) {
  await runBusy("incidencias:export", element, async () => {
    try {
      const ok = await callFlexibleExport(exportIncidenciasCsvAction);

      safeEmit("incidencias:bindings:export", {
        ok: Boolean(ok),
      });
    } catch (error) {
      safeWarn("exportIncidenciasCsvAction falló", error);
      showToast("No se pudo exportar el historial.", "error");
    }
  });
}

async function handleCreate({
  element = null,
  createIncidenciaAction,
} = {}) {
  const route = getRouteFromElement(element) || "/incidencias/nueva";

  await runBusy("incidencias:create", element, async () => {
    try {
      const payload = {
        route,
        source: "bindings",
        silent: false,
        draft: {},
      };

      safeEmit("incidencias:bindings:create:start", payload);

      const actionResult = await callFlexibleCreate(createIncidenciaAction, payload);

      if (actionResult) {
        safeEmit("incidencias:bindings:create:success", {
          route,
          result: actionResult,
        });

        return actionResult;
      }

      const opened = openCreateModalBridge(payload);

      if (opened) {
        safeEmit("incidencias:bindings:create:opened", {
          route,
          mode: "modal",
        });

        return true;
      }

      const navigated = await navigateToCreate(route);

      safeEmit("incidencias:bindings:create:opened", {
        route,
        mode: navigated ? "route" : "event",
      });

      return navigated;
    } catch (error) {
      safeWarn("createIncidenciaAction falló", error);

      safeEmit("incidencias:bindings:create:error", {
        error,
      });

      showToast("No se pudo abrir el formulario de nueva incidencia.", "error");

      return false;
    }
  });
}

async function handleFilter({
  element = null,
  filter = "",
  setFilter,
  changeFilter,
  applyFilter,
  render,
  rerender,
} = {}) {
  const nextFilter = normalizeFilter(filter || getFilterFromElement(element));

  await runBusy(`incidencias:filter:${nextFilter}`, element, async () => {
    try {
      patchLocalFilterState(nextFilter);

      const payload = {
        filter: nextFilter,
        activeFilter: nextFilter,
        statusFilter: nextFilter,
        page: 1,
        source: "bindings",
      };

      await callFlexibleFilter({
        filter: nextFilter,
        setFilter,
        changeFilter,
        applyFilter,
      });

      await callFlexibleRerender({
        payload,
        render,
        rerender,
      });
    } catch (error) {
      safeWarn("filter action falló", error);

      safeEmit("incidencias:bindings:filter:error", {
        filter: nextFilter,
        error,
      });
    }
  });
}

async function handleClearFilters({
  element = null,
  setFilter,
  changeFilter,
  applyFilter,
  render,
  rerender,
} = {}) {
  await handleFilter({
    element,
    filter: "all",
    setFilter,
    changeFilter,
    applyFilter,
    render,
    rerender,
  });
}

async function handleOpenTicket({
  element = null,
  openTicket,
} = {}) {
  const ticketId = getTicketId(element);
  const ticketCode = getTicketCode(element);

  if (!ticketId) {
    safeWarn("open-ticket sin id", {
      element,
    });

    showToast("No se pudo identificar la incidencia.", "error");
    return;
  }

  await runBusy(`incidencias:open:${ticketId}`, element, async () => {
    try {
      safeEmit("incidencias:bindings:open:start", {
        ticketId,
        ticketCode,
      });

      const detail = await callFlexibleOpen(openTicket, {
        ticketId,
        ticketCode,
        preferFresh: true,
        silent: false,
      });

      if (detail) {
        openModalBridge(detail, ticketId);

        safeEmit("incidencias:bindings:open:success", {
          ticketId,
          ticketCode,
          detail,
        });

        return;
      }

      safeWarn("openTicket no devolvió detalle", {
        ticketId,
        ticketCode,
      });

      safeEmit("incidencias:bindings:open:empty", {
        ticketId,
        ticketCode,
      });
    } catch (error) {
      safeWarn("openTicket falló", error);

      safeEmit("incidencias:bindings:open:error", {
        ticketId,
        ticketCode,
        error,
      });

      showToast("No se pudo abrir la incidencia.", "error");
    }
  });
}

async function handleCopyTicket({
  element = null,
  copyTicketIdAction,
} = {}) {
  const ticketId = getTicketId(element);
  const ticketCode = getTicketCode(element);

  if (!ticketId && !ticketCode) {
    safeWarn("copy-ticket-id sin id", {
      element,
    });

    showToast("No hay referencia para copiar.", "error");
    return;
  }

  const finalId = ticketId || ticketCode;

  await runBusy(`incidencias:copy:${finalId}`, element, async () => {
    try {
      await callFlexibleCopy(copyTicketIdAction, {
        ticketId: finalId,
        ticketCode,
      });

      safeEmit("incidencias:bindings:copy", {
        ticketId: finalId,
        ticketCode,
      });
    } catch (error) {
      safeWarn("copyTicketIdAction falló", error);
      showToast("No se pudo copiar la referencia.", "error");
    }
  });
}

async function handlePage({
  element = null,
  direction = "",
  setPage,
  nextPage,
  prevPage,
  changePage,
  render,
  rerender,
} = {}) {
  const page = getPageFromElement(element);
  const finalDirection = safeText(direction, "");

  await runBusy(`incidencias:page:${finalDirection}:${page || "auto"}`, element, async () => {
    try {
      await callFlexiblePage({
        page,
        direction: finalDirection,
        setPage,
        nextPage,
        prevPage,
        changePage,
        render,
        rerender,
      });
    } catch (error) {
      safeWarn("pagination action falló", error);

      safeEmit("incidencias:bindings:page:error", {
        page,
        direction: finalDirection,
        error,
      });
    }
  });
}

/* =========================================================
   MAIN
========================================================= */

export function bindIncidenciasEvents({
  loadIncidencias,
  openTicket,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  createIncidenciaAction,

  reload,

  setFilter,
  changeFilter,
  applyFilter,

  setPage,
  nextPage,
  prevPage,
  changePage,
  render,
  rerender,

  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeName = resolveScopeName(scope);
  const scopeRef = getScope(scopeName);
  const root = getContainer();

  if (!root) {
    safeWarn("No se encontró contenedor para bindings.");
    return () => {};
  }

  /* =======================================================
     DELEGATED ACTIONS
     Soporta contenido dinámico tras rerender.
  ======================================================= */

  bindDomEvent({
    scopeName,
    scopeRef,
    target: root,
    eventName: "click",
    handler: async (event) => {
      const target = getEventTargetElement(event);

      if (!target) return;

      const refreshAction = getActionElement(root, target, ACTIONS.refresh);

      if (refreshAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleRefresh({
          element: refreshAction,
          reload,
          loadIncidencias,
        });

        return;
      }

      const exportAction = getActionElement(root, target, ACTIONS.export);

      if (exportAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleExport({
          element: exportAction,
          exportIncidenciasCsvAction,
        });

        return;
      }

      const createAction = getActionElement(root, target, ACTIONS.create);

      if (createAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreate({
          element: createAction,
          createIncidenciaAction,
        });

        return;
      }

      const clearFiltersAction = getActionElement(root, target, ACTIONS.clearFilters);

      if (clearFiltersAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleClearFilters({
          element: clearFiltersAction,
          setFilter,
          changeFilter,
          applyFilter,
          render,
          rerender,
        });

        return;
      }

      const filterAction = getActionElement(root, target, ACTIONS.filter);

      if (filterAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleFilter({
          element: filterAction,
          setFilter,
          changeFilter,
          applyFilter,
          render,
          rerender,
        });

        return;
      }

      const prevPageAction = getActionElement(root, target, ACTIONS.prevPage);

      if (prevPageAction) {
        event.preventDefault();
        event.stopPropagation();

        await handlePage({
          element: prevPageAction,
          direction: "prev",
          setPage,
          nextPage,
          prevPage,
          changePage,
          render,
          rerender,
        });

        return;
      }

      const nextPageAction = getActionElement(root, target, ACTIONS.nextPage);

      if (nextPageAction) {
        event.preventDefault();
        event.stopPropagation();

        await handlePage({
          element: nextPageAction,
          direction: "next",
          setPage,
          nextPage,
          prevPage,
          changePage,
          render,
          rerender,
        });

        return;
      }

      const openAction = getActionElement(root, target, ACTIONS.open);

      if (openAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket({
          element: openAction,
          openTicket,
        });

        return;
      }

      const copyAction = getActionElement(root, target, ACTIONS.copy);

      if (copyAction) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyTicket({
          element: copyAction,
          copyTicketIdAction,
        });

        return;
      }

      const row = shouldOpenRowFromClick(root, event);

      if (row) {
        event.preventDefault();

        await handleOpenTicket({
          element: row,
          openTicket,
        });

        return;
      }

      const unknownAction = getAnyActionElement(root, target);

      if (unknownAction) {
        safeEmit("incidencias:bindings:unknown-action", {
          actions: getActionNames(unknownAction),
          element: unknownAction,
        });
      }
    },
  });

  /* =======================================================
     KEYBOARD ACCESSIBILITY
  ======================================================= */

  bindDomEvent({
    scopeName,
    scopeRef,
    target: root,
    eventName: "keydown",
    handler: async (event) => {
      const key = safeText(event.key, "");
      const target = getEventTargetElement(event);

      if (!target) return;

      if (key !== "Enter" && key !== " ") {
        return;
      }

      const actionElement = closestInside(root, target, ACTION_SELECTOR);

      if (actionElement) {
        return;
      }

      const row = closestInside(root, target, ROW_SELECTOR);

      if (!row || isRowClickDisabled(row)) {
        return;
      }

      const interactive = target?.closest?.(INTERACTIVE_SELECTOR);

      if (interactive && row.contains(interactive)) {
        return;
      }

      event.preventDefault();

      await handleOpenTicket({
        element: row,
        openTicket,
      });
    },
  });

  /* =======================================================
     MODAL / MUTATION EVENTS
     Cuando el modal actualiza, refrescamos tabla/store.
  ======================================================= */

  const refreshAfterMutation = (event) => {
    const payload = event?.detail || event || {};

    scheduleReload(reload, loadIncidencias, {
      source: "mutation-event",
      payload,
    });
  };

  [
    "incidencias:modal:updated",
    "incidencias:modal:update",
    "incidencias:ticket:updated",
    "incidencias:update:success",
    "incidencias:upload:success",
    "incidencias:comment:success",
    "incidencias:reopen:success",
    "incidencias:create:success",
    "incidencias:created",
  ].forEach((eventName) => {
    bindBusEvent({
      scopeName,
      eventName,
      handler: refreshAfterMutation,
    });
  });

  safeEmit("incidencias:bindings:ready", {
    scope: scopeName,
  });

  /* =======================================================
     CLEANUP
  ======================================================= */

  return () => {
    runScopeCleanup(scopeName);

    safeEmit("incidencias:bindings:destroyed", {
      scope: scopeName,
    });
  };
}

/* =========================================================
   ALIAS / DEFAULT EXPORT
========================================================= */

export const bind = bindIncidenciasEvents;

export function cleanupIncidenciasBindings(scope = DEFAULT_SCOPE) {
  runScopeCleanup(scope);
}

export default {
  bindIncidenciasEvents,
  bind,
  cleanupIncidenciasBindings,
};

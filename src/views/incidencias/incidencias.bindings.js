/* =========================================================
   Onion Support - Incidencias Bindings
   Archivo: /src/views/incidencias/incidencias.bindings.js

   Responsabilidad:
   - Bind DOM por delegación para la vista Incidencias.
   - Conectar botones, filas, filtros, búsqueda y paginación.
   - Delegar TODO a callbacks recibidos desde incidenciasView.js.
   - No llamar APIs directamente salvo fallback loadIncidencias opcional.
   - No abrir modales directamente.
   - No registrar globals.
   - No leer Router.
   - No leer Auth.
   - No tocar AppCore.modules.
   - No parchear estado fuera de los callbacks de la vista.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_BINDINGS_VERSION = "incidencias.bindings.v1";

const DEFAULT_SCOPE = "view:incidencias";
const SEARCH_DEBOUNCE_MS = 180;
const MUTATION_RELOAD_DELAY_MS = 120;

const ACTION_SELECTOR = [
  "[data-incidencias-action]",
  "[data-action]",
].join(",");

const ROW_SELECTOR = [
  ".incidencias-row",
  "[data-ticket-row='true']",
  "[data-ticket-row]",
  "[data-incidencia-row]",
  "tr[data-ticket-id]",
  "article[data-ticket-id]",
  "[data-ticket-id][role='row']",
].join(",");

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
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

const SEARCH_SELECTOR = [
  "#incidencias-search-input",
  "#incidencias-filter-search",
  "[data-incidencias-search-input='true']",
  "[data-incidencias-field='search']",
  "[data-field='search']",
].join(",");

const PAGE_SIZE_SELECTOR = [
  "[data-incidencias-field='page-size']",
  "[data-field='page-size']",
].join(",");

const ACTIONS = Object.freeze({
  refresh: new Set([
    "refresh",
    "reload",
    "refresh-incidencias",
    "reload-incidencias",
    "incidencias-refresh",
  ]),

  retry: new Set([
    "retry",
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

  create: new Set([
    "create",
    "new",
    "new-ticket",
    "new-incidencia",
    "create-ticket",
    "create-incidencia",
    "incidencias-create",
    "open-create",
    "open-create-incidencia",
  ]),

  open: new Set([
    "detail",
    "open",
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

  clearSearch: new Set([
    "clear-search",
    "clear-filter-search",
    "reset-search",
    "search-clear",
  ]),

  page: new Set([
    "page",
    "go-page",
    "set-page",
    "change-page",
  ]),

  prevPage: new Set([
    "prev",
    "previous",
    "prev-page",
    "previous-page",
    "pagination-prev",
    "incidencias-prev-page",
  ]),

  nextPage: new Set([
    "next",
    "next-page",
    "pagination-next",
    "incidencias-next-page",
  ]),
});

const DEFAULT_MUTATION_EVENTS = Object.freeze([
  "incidencias:modal:updated",
  "incidencias:ticket:updated",
  "incidencias:update:success",
  "incidencias:upload:success",
  "incidencias:comment:success",
  "incidencias:reopen:success",
  "incidencias:create:success",
  "incidencias:created",
]);

const scopeCleanups = new Map();
const busyKeys = new Set();
const busyElementMeta = new WeakMap();

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function normalizeAction(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeScope(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
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

function emit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {
    return false;
  }
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) {
    return;
  }

  try {
    if (isFn(AppCore?.toast?.[type])) {
      AppCore.toast[type](text);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.show?.(text, type);
  } catch {}
}

/* =========================================================
   CLEANUP
========================================================= */

function runCleanups(cleanups = []) {
  safeArray(cleanups).forEach((cleanup) => {
    try {
      cleanup?.();
    } catch {}
  });
}

function cleanupScope(scope = DEFAULT_SCOPE) {
  const scopeName = normalizeScope(scope);
  const cleanups = scopeCleanups.get(scopeName);

  if (!cleanups) {
    return;
  }

  scopeCleanups.delete(scopeName);
  runCleanups([...cleanups]);
}

function registerScopeCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName = normalizeScope(scope);

  if (!scopeCleanups.has(scopeName)) {
    scopeCleanups.set(scopeName, new Set());
  }

  scopeCleanups.get(scopeName).add(cleanup);
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getDefaultContainer() {
  if (!isBrowser()) {
    return null;
  }

  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    null
  );
}

function resolveContainer(container = null) {
  return container || getDefaultContainer();
}

function getEventElement(event = null) {
  const target = event?.target || null;

  if (!target) {
    return null;
  }

  if (target.nodeType === 1) {
    return target;
  }

  return target.parentElement || null;
}

function rootContains(root = null, element = null) {
  try {
    return Boolean(root && element && (root === element || root.contains(element)));
  } catch {
    return false;
  }
}

function closestInside(root = null, target = null, selector = "") {
  const element =
    target?.nodeType === 1
      ? target
      : target?.parentElement || null;

  if (!root || !element || !selector || !isFn(element.closest)) {
    return null;
  }

  const match = element.closest(selector);

  if (!match || !rootContains(root, match)) {
    return null;
  }

  return match;
}

function getActionNames(element = null) {
  if (!element) {
    return [];
  }

  return [
    element.dataset?.incidenciasAction,
    element.dataset?.action,
    element.getAttribute?.("data-incidencias-action"),
    element.getAttribute?.("data-action"),
  ]
    .map(normalizeAction)
    .filter(Boolean);
}

function elementMatchesActionSet(element = null, actionSet = null) {
  if (!element || !actionSet) {
    return false;
  }

  return getActionNames(element).some((action) => actionSet.has(action));
}

function getActionElement(root = null, target = null, actionSet = null) {
  let element =
    target?.nodeType === 1
      ? target
      : target?.parentElement || null;

  while (element && rootContains(root, element)) {
    if (
      element.matches?.(ACTION_SELECTOR) &&
      elementMatchesActionSet(element, actionSet)
    ) {
      return element;
    }

    if (element === root) {
      break;
    }

    element = element.parentElement;
  }

  return null;
}

function getDataSource(element = null) {
  if (!element) {
    return null;
  }

  return (
    element.closest?.(
      [
        "[data-ticket-id]",
        "[data-incidencia-id]",
        "[data-id]",
        "[data-ticket-code]",
      ].join(",")
    ) ||
    element
  );
}

function getTicketId(element = null) {
  const source = getDataSource(element);

  return safeText(
    first(
      element?.dataset?.ticketId,
      element?.dataset?.incidenciaId,
      element?.dataset?.id,
      element?.dataset?.ticketCode,

      element?.getAttribute?.("data-ticket-id"),
      element?.getAttribute?.("data-incidencia-id"),
      element?.getAttribute?.("data-id"),
      element?.getAttribute?.("data-ticket-code"),

      source?.dataset?.ticketId,
      source?.dataset?.incidenciaId,
      source?.dataset?.id,
      source?.dataset?.ticketCode,

      source?.getAttribute?.("data-ticket-id"),
      source?.getAttribute?.("data-incidencia-id"),
      source?.getAttribute?.("data-id"),
      source?.getAttribute?.("data-ticket-code")
    ),
    ""
  );
}

function getTicketCode(element = null) {
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

function getFilter(element = null) {
  return safeText(
    first(
      element?.dataset?.filter,
      element?.dataset?.filterStatus,
      element?.dataset?.statusFilter,
      element?.getAttribute?.("data-filter"),
      element?.getAttribute?.("data-filter-status"),
      element?.getAttribute?.("data-status-filter"),
      "all"
    ),
    "all"
  );
}

function getPage(element = null) {
  return safeNumber(
    first(
      element?.dataset?.page,
      element?.dataset?.targetPage,
      element?.getAttribute?.("data-page"),
      element?.getAttribute?.("data-target-page")
    ),
    0
  );
}

function getRowClickDisabled(row = null) {
  const value = normalizeAction(
    first(
      row?.dataset?.rowClickDisabled,
      row?.dataset?.noRowOpen,
      row?.getAttribute?.("data-row-click-disabled"),
      row?.getAttribute?.("data-no-row-open"),
      ""
    )
  );

  return ["true", "1", "yes", "si", "sí", "on"].includes(value);
}

function getRowFromClick(root = null, event = null) {
  const target = getEventElement(event);

  if (!target) {
    return null;
  }

  const row = closestInside(root, target, ROW_SELECTOR);

  if (!row || getRowClickDisabled(row)) {
    return null;
  }

  const interactive = target.closest?.(INTERACTIVE_SELECTOR);

  if (interactive && rowContains(row, interactive)) {
    return null;
  }

  return row;
}

function rowContains(row = null, element = null) {
  try {
    return Boolean(row && element && row.contains(element));
  } catch {
    return false;
  }
}

function isFormControl(element = null) {
  const tag = safeText(element?.tagName, "").toLowerCase();

  return ["button", "input", "select", "textarea"].includes(tag);
}

function setElementBusy(element = null, busy = false) {
  if (!element) {
    return;
  }

  try {
    if (busy && !busyElementMeta.has(element)) {
      busyElementMeta.set(element, {
        disabled: Boolean(element.disabled),
        ariaBusy: element.getAttribute?.("aria-busy"),
        loading: element.classList?.contains?.("is-loading"),
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

    if (!previous.loading) {
      element.classList?.remove?.("is-loading");
    }

    if (isFormControl(element)) {
      element.disabled = Boolean(previous.disabled);
    }

    busyElementMeta.delete(element);
  } catch {}
}

async function runBusy(key = "", element = null, task = null) {
  const busyKey = safeText(key, "");

  if (!busyKey || !isFn(task)) {
    return null;
  }

  if (busyKeys.has(busyKey)) {
    return null;
  }

  busyKeys.add(busyKey);
  setElementBusy(element, true);

  try {
    return await task();
  } finally {
    busyKeys.delete(busyKey);
    setElementBusy(element, false);
  }
}

/* =========================================================
   CALL HELPERS
========================================================= */

async function callReload({
  reload,
  loadIncidencias,
  force = true,
  asRefresh = true,
  silent = false,
  source = "bindings",
} = {}) {
  if (isFn(reload)) {
    return reload({
      force,
      asRefresh,
      silent,
      source,
    });
  }

  if (isFn(loadIncidencias)) {
    return loadIncidencias({
      force,
      silent,
      source,
    });
  }

  safeWarn("No hay callback reload/loadIncidencias para refrescar.");
  return null;
}

async function callOpenTicket(openTicket, ticketId = "", payload = {}) {
  if (!isFn(openTicket)) {
    safeWarn("No hay callback openTicket.");
    return null;
  }

  try {
    return await openTicket(ticketId, payload);
  } catch (firstError) {
    try {
      return await openTicket({
        ...safeObject(payload),
        ticketId,
      });
    } catch {
      throw firstError;
    }
  }
}

async function callCopyTicket(copyTicketId, ticketId = "", payload = {}) {
  if (!isFn(copyTicketId)) {
    safeWarn("No hay callback copyTicketId.");
    return false;
  }

  try {
    return await copyTicketId(ticketId, payload);
  } catch (firstError) {
    try {
      return await copyTicketId({
        ...safeObject(payload),
        ticketId,
      });
    } catch {
      throw firstError;
    }
  }
}

async function callExport(exportCsv) {
  if (!isFn(exportCsv)) {
    safeWarn("No hay callback exportCsv.");
    return false;
  }

  try {
    return await exportCsv({
      silent: false,
      source: "bindings",
    });
  } catch (firstError) {
    try {
      return await exportCsv();
    } catch {
      throw firstError;
    }
  }
}

async function callCreate(createIncidencia, payload = {}) {
  if (!isFn(createIncidencia)) {
    safeWarn("No hay callback createIncidencia.");
    return false;
  }

  try {
    return await createIncidencia(payload);
  } catch (firstError) {
    try {
      return await createIncidencia(payload.draft || {}, payload);
    } catch {
      throw firstError;
    }
  }
}

async function callSetFilter(setFilter, filter = "all") {
  if (!isFn(setFilter)) {
    safeWarn("No hay callback setFilter.");
    return false;
  }

  return setFilter(filter);
}

async function callSetSearchQuery(setSearchQuery, value = "") {
  if (!isFn(setSearchQuery)) {
    safeWarn("No hay callback setSearchQuery.");
    return false;
  }

  return setSearchQuery(value);
}

/* =========================================================
   EVENT BINDERS
========================================================= */

function addDomListener(cleanups, target, eventName, handler, options) {
  if (!target || !eventName || !isFn(handler)) {
    return false;
  }

  try {
    target.addEventListener(eventName, handler, options);

    cleanups.push(() => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    });

    return true;
  } catch {
    return false;
  }
}

function addAppEventListener(cleanups, eventName = "", handler = null) {
  const name = safeText(eventName, "");

  if (!name || !isFn(handler)) {
    return false;
  }

  let attached = false;

  try {
    if (isFn(AppCore?.events?.on)) {
      const off = AppCore.events.on(name, handler);

      cleanups.push(() => {
        try {
          if (isFn(off)) {
            off();
            return;
          }

          AppCore?.events?.off?.(name, handler);
        } catch {}
      });

      attached = true;
    }
  } catch {}

  return attached;
}

/* =========================================================
   MAIN
========================================================= */

export function bindIncidenciasEvents({
  container = null,
  scope = DEFAULT_SCOPE,

  loadIncidencias,
  reload,

  openTicket,

  copyTicketId,
  copyTicketIdAction,

  exportCsv,
  exportIncidenciasCsvAction,

  createIncidencia,
  createIncidenciaAction,

  setFilter,
  setSearchQuery,
  clearFilters,
  clearSearchOnly,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  mutationEvents = DEFAULT_MUTATION_EVENTS,
  bindMutationEvents = true,
} = {}) {
  const scopeName = normalizeScope(scope);

  cleanupScope(scopeName);

  const root = resolveContainer(container);

  if (!root) {
    safeWarn("No se encontró contenedor para bindings.");
    return () => {};
  }

  const cleanups = [];

  let destroyed = false;
  let searchTimer = 0;
  let mutationReloadTimer = 0;

  const resolvedCopyTicketId = copyTicketId || copyTicketIdAction;
  const resolvedExportCsv = exportCsv || exportIncidenciasCsvAction;
  const resolvedCreateIncidencia = createIncidencia || createIncidenciaAction;

  function clearSearchTimer() {
    if (!searchTimer) {
      return;
    }

    try {
      window.clearTimeout(searchTimer);
    } catch {}

    searchTimer = 0;
  }

  function clearMutationReloadTimer() {
    if (!mutationReloadTimer) {
      return;
    }

    try {
      window.clearTimeout(mutationReloadTimer);
    } catch {}

    mutationReloadTimer = 0;
  }

  function scheduleMutationReload(payload = {}) {
    if (!bindMutationEvents) {
      return;
    }

    clearMutationReloadTimer();

    mutationReloadTimer = window.setTimeout(async () => {
      mutationReloadTimer = 0;

      if (destroyed) {
        return;
      }

      await callReload({
        reload,
        loadIncidencias,
        force: true,
        asRefresh: true,
        silent: true,
        source: "mutation",
        payload,
      });
    }, MUTATION_RELOAD_DELAY_MS);
  }

  async function handleRefresh(element = null, retry = false) {
    await runBusy("incidencias:refresh", element, async () => {
      await callReload({
        reload,
        loadIncidencias,
        force: true,
        asRefresh: !retry,
        silent: false,
        source: retry ? "retry" : "manual",
      });
    });
  }

  async function handleExport(element = null) {
    await runBusy("incidencias:export", element, async () => {
      try {
        const result = await callExport(resolvedExportCsv);

        emit("incidencias:bindings:export", {
          ok: Boolean(result),
          source: scopeName,
        });

        return result;
      } catch (error) {
        safeWarn("No se pudo exportar incidencias.", error);
        showToast("No se pudo exportar el historial.", "error");
        return false;
      }
    });
  }

  async function handleCreate(element = null) {
    await runBusy("incidencias:create", element, async () => {
      try {
        const payload = {
          source: scopeName,
          silent: false,
          draft: {},
        };

        const result = await callCreate(resolvedCreateIncidencia, payload);

        emit("incidencias:bindings:create", {
          ok: Boolean(result),
          source: scopeName,
        });

        return result;
      } catch (error) {
        safeWarn("No se pudo abrir creación de incidencia.", error);
        showToast("No se pudo abrir el formulario de nueva incidencia.", "error");
        return false;
      }
    });
  }

  async function handleOpen(element = null) {
    const ticketId = getTicketId(element);
    const ticketCode = getTicketCode(element);

    if (!ticketId) {
      safeWarn("open-ticket sin id.");
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    await runBusy(`incidencias:open:${ticketId}`, element, async () => {
      try {
        const payload = {
          ticketId,
          ticketCode,
          preferFresh: true,
          silent: false,
          source: scopeName,
        };

        const result = await callOpenTicket(openTicket, ticketId, payload);

        emit("incidencias:bindings:open", {
          ticketId,
          ticketCode,
          ok: Boolean(result),
          source: scopeName,
        });

        return result;
      } catch (error) {
        safeWarn("No se pudo abrir la incidencia.", error);
        showToast("No se pudo abrir la incidencia.", "error");
        return null;
      }
    });
  }

  async function handleCopy(element = null) {
    const ticketId = getTicketId(element);
    const ticketCode = getTicketCode(element);
    const finalId = ticketId || ticketCode;

    if (!finalId) {
      safeWarn("copy-ticket-id sin id.");
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    await runBusy(`incidencias:copy:${finalId}`, element, async () => {
      try {
        const result = await callCopyTicket(resolvedCopyTicketId, finalId, {
          ticketId: finalId,
          ticketCode,
          source: scopeName,
        });

        emit("incidencias:bindings:copy", {
          ticketId: finalId,
          ticketCode,
          ok: Boolean(result),
          source: scopeName,
        });

        return result;
      } catch (error) {
        safeWarn("No se pudo copiar la referencia.", error);
        showToast("No se pudo copiar la referencia.", "error");
        return false;
      }
    });
  }

  async function handleFilter(element = null) {
    const filter = getFilter(element);

    await runBusy(`incidencias:filter:${filter}`, element, async () => {
      try {
        const result = await callSetFilter(setFilter, filter);

        emit("incidencias:bindings:filter", {
          filter,
          ok: Boolean(result),
          source: scopeName,
        });

        return result;
      } catch (error) {
        safeWarn("No se pudo aplicar filtro.", error);
        return false;
      }
    });
  }

  async function handleClearFilters(element = null) {
    await runBusy("incidencias:filters:clear", element, async () => {
      try {
        if (isFn(clearFilters)) {
          return await clearFilters();
        }

        return await callSetFilter(setFilter, "all");
      } catch (error) {
        safeWarn("No se pudieron limpiar filtros.", error);
        return false;
      }
    });
  }

  async function handleClearSearch(element = null) {
    await runBusy("incidencias:search:clear", element, async () => {
      try {
        if (isFn(clearSearchOnly)) {
          return await clearSearchOnly();
        }

        return await callSetSearchQuery(setSearchQuery, "");
      } catch (error) {
        safeWarn("No se pudo limpiar búsqueda.", error);
        return false;
      }
    });
  }

  async function handlePage(element = null) {
    const page = getPage(element);

    if (!page || !isFn(goToPage)) {
      return false;
    }

    return goToPage(page);
  }

  async function handlePrevPage() {
    if (isFn(goPrevPage)) {
      return goPrevPage();
    }

    return false;
  }

  async function handleNextPage() {
    if (isFn(goNextPage)) {
      return goNextPage();
    }

    return false;
  }

  function handleSearchInput(input = null) {
    if (!input) {
      return;
    }

    const value = safeText(input.value, "");

    clearSearchTimer();

    searchTimer = window.setTimeout(async () => {
      searchTimer = 0;

      if (destroyed) {
        return;
      }

      try {
        await callSetSearchQuery(setSearchQuery, value);
      } catch (error) {
        safeWarn("No se pudo aplicar búsqueda.", error);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSearchChange(input = null) {
    if (!input) {
      return;
    }

    clearSearchTimer();

    try {
      void callSetSearchQuery(setSearchQuery, safeText(input.value, ""));
    } catch (error) {
      safeWarn("No se pudo aplicar búsqueda.", error);
    }
  }

  function handlePageSizeChange(input = null) {
    if (!input || !isFn(changePageSize)) {
      return;
    }

    try {
      void changePageSize(input.value);
    } catch (error) {
      safeWarn("No se pudo cambiar tamaño de página.", error);
    }
  }

  addDomListener(cleanups, root, "click", async (event) => {
    if (destroyed) {
      return;
    }

    const target = getEventElement(event);

    if (!target) {
      return;
    }

    const refreshAction = getActionElement(root, target, ACTIONS.refresh);

    if (refreshAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleRefresh(refreshAction, false);
      return;
    }

    const retryAction = getActionElement(root, target, ACTIONS.retry);

    if (retryAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleRefresh(retryAction, true);
      return;
    }

    const exportAction = getActionElement(root, target, ACTIONS.export);

    if (exportAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleExport(exportAction);
      return;
    }

    const createAction = getActionElement(root, target, ACTIONS.create);

    if (createAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleCreate(createAction);
      return;
    }

    const clearFiltersAction = getActionElement(root, target, ACTIONS.clearFilters);

    if (clearFiltersAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleClearFilters(clearFiltersAction);
      return;
    }

    const clearSearchAction = getActionElement(root, target, ACTIONS.clearSearch);

    if (clearSearchAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleClearSearch(clearSearchAction);
      return;
    }

    const filterAction = getActionElement(root, target, ACTIONS.filter);

    if (filterAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleFilter(filterAction);
      return;
    }

    const pageAction = getActionElement(root, target, ACTIONS.page);

    if (pageAction) {
      event.preventDefault();
      event.stopPropagation();

      await handlePage(pageAction);
      return;
    }

    const prevPageAction = getActionElement(root, target, ACTIONS.prevPage);

    if (prevPageAction) {
      event.preventDefault();
      event.stopPropagation();

      await handlePrevPage();
      return;
    }

    const nextPageAction = getActionElement(root, target, ACTIONS.nextPage);

    if (nextPageAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleNextPage();
      return;
    }

    const copyAction = getActionElement(root, target, ACTIONS.copy);

    if (copyAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleCopy(copyAction);
      return;
    }

    const openAction = getActionElement(root, target, ACTIONS.open);

    if (openAction) {
      event.preventDefault();
      event.stopPropagation();

      await handleOpen(openAction);
      return;
    }

    const row = getRowFromClick(root, event);

    if (row) {
      event.preventDefault();

      await handleOpen(row);
    }
  });

  addDomListener(cleanups, root, "keydown", async (event) => {
    if (destroyed) {
      return;
    }

    const key = safeText(event.key, "");

    if (key !== "Enter" && key !== " ") {
      return;
    }

    const target = getEventElement(event);

    if (!target) {
      return;
    }

    const action = closestInside(root, target, ACTION_SELECTOR);

    if (action) {
      return;
    }

    const row = closestInside(root, target, ROW_SELECTOR);

    if (!row || getRowClickDisabled(row)) {
      return;
    }

    const interactive = target.closest?.(INTERACTIVE_SELECTOR);

    if (interactive && rowContains(row, interactive)) {
      return;
    }

    event.preventDefault();

    await handleOpen(row);
  });

  addDomListener(cleanups, root, "input", (event) => {
    if (destroyed) {
      return;
    }

    const target = getEventElement(event);
    const input = closestInside(root, target, SEARCH_SELECTOR);

    if (input) {
      handleSearchInput(input);
    }
  });

  addDomListener(cleanups, root, "change", (event) => {
    if (destroyed) {
      return;
    }

    const target = getEventElement(event);

    const searchInput = closestInside(root, target, SEARCH_SELECTOR);

    if (searchInput) {
      handleSearchChange(searchInput);
      return;
    }

    const pageSizeInput = closestInside(root, target, PAGE_SIZE_SELECTOR);

    if (pageSizeInput) {
      handlePageSizeChange(pageSizeInput);
    }
  });

  if (bindMutationEvents && (isFn(reload) || isFn(loadIncidencias))) {
    safeArray(mutationEvents).forEach((eventName) => {
      addAppEventListener(cleanups, eventName, (eventOrPayload = {}) => {
        const payload = safeObject(eventOrPayload?.detail || eventOrPayload);

        scheduleMutationReload(payload);
      });
    });
  }

  emit("incidencias:bindings:ready", {
    scope: scopeName,
    source: "incidencias.bindings",
  });

  const cleanup = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;

    clearSearchTimer();
    clearMutationReloadTimer();
    runCleanups(cleanups);
    scopeCleanups.delete(scopeName);

    emit("incidencias:bindings:destroyed", {
      scope: scopeName,
      source: "incidencias.bindings",
    });
  };

  registerScopeCleanup(scopeName, cleanup);

  return cleanup;
}

/* =========================================================
   ALIASES
========================================================= */

export const bind = bindIncidenciasEvents;

export function cleanupIncidenciasBindings(scope = DEFAULT_SCOPE) {
  cleanupScope(scope);
}

export default {
  bindIncidenciasEvents,
  bind,
  cleanupIncidenciasBindings,
};

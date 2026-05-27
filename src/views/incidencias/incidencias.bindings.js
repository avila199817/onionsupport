/* =========================================================
   Onion Support - Incidencias Bindings
   Archivo: /src/views/incidencias/incidencias.bindings.js

   Responsabilidad:
   - Bind DOM por delegación para la vista Incidencias.
   - Conectar botones, filas, filtros, búsqueda y load-more.
   - Delegar TODO a callbacks recibidos desde incidenciasView.js.
   - Compatibilidad legacy con acciones page/prev/next sin paginación visual.
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

export const INCIDENCIAS_BINDINGS_VERSION = "incidencias.bindings.v4.solid";

const DEFAULT_SCOPE = "view:incidencias";
const SEARCH_DEBOUNCE_MS = 180;
const MUTATION_SYNC_DELAY_MS = 160;

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
  "[data-ticket-id][role='button']",
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

  loadMore: new Set([
    "load-more",
    "show-more",
    "more",
    "next-batch",
    "load-next",
    "load-more-incidencias",
    "show-more-incidencias",
    "incidencias-load-more",
    "incidencias-show-more",
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

const ACTION_ORDER = Object.freeze([
  ["refresh", ACTIONS.refresh],
  ["retry", ACTIONS.retry],
  ["export", ACTIONS.export],
  ["create", ACTIONS.create],
  ["clearFilters", ACTIONS.clearFilters],
  ["clearSearch", ACTIONS.clearSearch],
  ["filter", ACTIONS.filter],
  ["loadMore", ACTIONS.loadMore],
  ["page", ACTIONS.page],
  ["prevPage", ACTIONS.prevPage],
  ["nextPage", ACTIONS.nextPage],
  ["copy", ACTIONS.copy],
  ["open", ACTIONS.open],
]);

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

const TRUE_VALUES = new Set(["true", "1", "yes", "si", "sí", "on"]);
const PLACEHOLDER_IDS = new Set(["-", "—", "_", "n/a", "na", "null", "undefined"]);

const scopeCleanups = new Map();
const busyKeys = new Set();
const busyElementMeta = new WeakMap();

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getTimerHost() {
  return typeof window !== "undefined" ? window : globalThis;
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
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

function cleanIdentifier(value = "") {
  const text = safeText(value, "");
  const normalized = text.toLowerCase();

  if (!text || PLACEHOLDER_IDS.has(normalized)) return "";

  return text;
}

function isTruthyValue(value = "") {
  return TRUE_VALUES.has(normalizeAction(value));
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

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {
    return false;
  }
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return;

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

  if (!cleanups) return;

  scopeCleanups.delete(scopeName);
  runCleanups([...cleanups]);
}

function registerScopeCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFn(cleanup)) return;

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
  if (!isBrowser()) return null;

  return AppCore?.dom?.viewContainer || document.getElementById("view-container") || null;
}

function resolveContainer(container = null) {
  return container || getDefaultContainer();
}

function getEventElement(event = null) {
  const target = event?.target || null;

  if (!target) return null;
  if (target.nodeType === 1) return target;

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
  const element = target?.nodeType === 1 ? target : target?.parentElement || null;

  if (!root || !element || !selector || !isFn(element.closest)) return null;

  const match = element.closest(selector);

  if (!match || !rootContains(root, match)) return null;

  return match;
}

function getActionNames(element = null) {
  if (!element) return [];

  return [
    element.dataset?.incidenciasAction,
    element.dataset?.action,
    element.getAttribute?.("data-incidencias-action"),
    element.getAttribute?.("data-action"),
  ]
    .map(normalizeAction)
    .filter(Boolean);
}

function getActionType(element = null) {
  const actionNames = getActionNames(element);

  if (!actionNames.length) return "";

  const match = ACTION_ORDER.find(([, actionSet]) => {
    return actionNames.some((action) => actionSet.has(action));
  });

  return match?.[0] || "";
}

function getRecognizedAction(root = null, target = null) {
  let element = target?.nodeType === 1 ? target : target?.parentElement || null;

  while (element && rootContains(root, element)) {
    if (element.matches?.(ACTION_SELECTOR)) {
      const type = getActionType(element);

      if (type) {
        return { element, type };
      }
    }

    if (element === root) break;

    element = element.parentElement;
  }

  return { element: null, type: "" };
}

function getDataSource(element = null) {
  if (!element) return null;

  return (
    element.closest?.(
      [
        "[data-ticket-id]",
        "[data-incidencia-id]",
        "[data-id]",
        "[data-ticket-code]",
      ].join(",")
    ) || element
  );
}

function getTicketId(element = null) {
  const source = getDataSource(element);

  return cleanIdentifier(
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
    )
  );
}

function getTicketCode(element = null) {
  const source = getDataSource(element);

  return cleanIdentifier(
    first(
      element?.dataset?.ticketCode,
      element?.getAttribute?.("data-ticket-code"),
      source?.dataset?.ticketCode,
      source?.getAttribute?.("data-ticket-code"),
      getTicketId(element)
    )
  );
}

function getFilter(element = null) {
  return safeText(
    first(
      element?.dataset?.filter,
      element?.dataset?.filterStatus,
      element?.dataset?.statusFilter,
      element?.value,
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
      element?.value,
      element?.getAttribute?.("data-page"),
      element?.getAttribute?.("data-target-page")
    ),
    0
  );
}

function getRowClickDisabled(row = null) {
  return isTruthyValue(
    first(
      row?.dataset?.rowClickDisabled,
      row?.dataset?.noRowOpen,
      row?.getAttribute?.("data-row-click-disabled"),
      row?.getAttribute?.("data-no-row-open"),
      ""
    )
  );
}

function rowContains(row = null, element = null) {
  try {
    return Boolean(row && element && row.contains(element));
  } catch {
    return false;
  }
}

function getRowFromTarget(root = null, target = null) {
  if (!target) return null;

  const row = closestInside(root, target, ROW_SELECTOR);

  if (!row || getRowClickDisabled(row)) return null;

  const interactive = target.closest?.(INTERACTIVE_SELECTOR);

  if (interactive && interactive !== row && rowContains(row, interactive)) {
    return null;
  }

  return row;
}

function isFormControl(element = null) {
  const tag = safeText(element?.tagName, "").toLowerCase();

  return ["button", "input", "select", "textarea"].includes(tag);
}

function isDisabledElement(element = null) {
  if (!element) return false;

  return Boolean(
    element.disabled === true ||
      element.getAttribute?.("aria-disabled") === "true" ||
      isTruthyValue(element.dataset?.disabled) ||
      isTruthyValue(element.getAttribute?.("data-disabled"))
  );
}

function setElementBusy(element = null, busy = false) {
  if (!element) return;

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

  if (!busyKey || !isFn(task)) return null;
  if (busyKeys.has(busyKey)) return null;

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
    return reload({ force, asRefresh, silent, source });
  }

  if (isFn(loadIncidencias)) {
    return loadIncidencias({ force, silent, source });
  }

  safeWarn("No hay callback reload/loadIncidencias para refrescar.");
  return null;
}

async function callOpenTicket(openTicket, ticketId = "", payload = {}) {
  if (!isFn(openTicket)) {
    safeWarn("No hay callback openTicket.");
    return null;
  }

  return openTicket(ticketId, payload);
}

async function callCopyTicket(copyTicketId, ticketId = "", payload = {}) {
  if (!isFn(copyTicketId)) {
    safeWarn("No hay callback copyTicketId.");
    return false;
  }

  return copyTicketId(ticketId, payload);
}

async function callExport(exportCsv) {
  if (!isFn(exportCsv)) {
    safeWarn("No hay callback exportCsv.");
    return false;
  }

  return exportCsv({
    silent: false,
    source: "bindings",
  });
}

async function callCreate(createIncidencia, payload = {}) {
  if (!isFn(createIncidencia)) {
    safeWarn("No hay callback createIncidencia.");
    return false;
  }

  return createIncidencia(payload);
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

async function callLoadMore({
  loadMore,
  showMore,
  goNextPage,
  source = "bindings",
  reason = "manual",
} = {}) {
  if (isFn(loadMore)) {
    return loadMore({ source, reason });
  }

  if (isFn(showMore)) {
    return showMore({ source, reason });
  }

  if (isFn(goNextPage)) {
    return goNextPage();
  }

  safeWarn("No hay callback loadMore/showMore/goNextPage.");
  return null;
}

async function callViewSync({
  scheduleRender,
  render,
  refreshView,
  reload,
  loadIncidencias,
  source = "mutation",
} = {}) {
  if (isFn(refreshView)) {
    return refreshView({ source });
  }

  if (isFn(scheduleRender)) {
    return scheduleRender({ source });
  }

  if (isFn(render)) {
    return render({ source });
  }

  return callReload({
    reload,
    loadIncidencias,
    force: false,
    asRefresh: false,
    silent: true,
    source,
  });
}

/* =========================================================
   EVENT BINDERS
========================================================= */

function addDomListener(cleanups, target, eventName, handler, options) {
  if (!target || !eventName || !isFn(handler)) return false;

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

  if (!name || !isFn(handler)) return false;

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

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   MAIN
========================================================= */

export function bindIncidenciasEvents({
  container = null,
  scope = DEFAULT_SCOPE,

  loadIncidencias,
  reload,
  render,
  scheduleRender,
  refreshView,

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

  loadMore,
  showMore,
  infiniteScroll = true,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  mutationEvents = DEFAULT_MUTATION_EVENTS,
  bindMutationEvents = false,
} = {}) {
  const scopeName = normalizeScope(scope);

  cleanupScope(scopeName);

  const root = resolveContainer(container);

  if (!root) {
    safeWarn("No se encontró contenedor para bindings.");
    return () => {};
  }

  const cleanups = [];
  const timerHost = getTimerHost();

  let destroyed = false;
  let searchTimer = 0;
  let mutationSyncTimer = 0;
  let lastSearchValue = "";

  const resolvedCopyTicketId = copyTicketId || copyTicketIdAction;
  const resolvedExportCsv = exportCsv || exportIncidenciasCsvAction;
  const resolvedCreateIncidencia = createIncidencia || createIncidenciaAction;

  function clearSearchTimer() {
    if (!searchTimer) return;

    try {
      timerHost.clearTimeout(searchTimer);
    } catch {}

    searchTimer = 0;
  }

  function clearMutationSyncTimer() {
    if (!mutationSyncTimer) return;

    try {
      timerHost.clearTimeout(mutationSyncTimer);
    } catch {}

    mutationSyncTimer = 0;
  }

  function scheduleMutationSync(payload = {}) {
    if (!bindMutationEvents) return;

    clearMutationSyncTimer();

    mutationSyncTimer = timerHost.setTimeout(async () => {
      mutationSyncTimer = 0;

      if (destroyed) return;

      try {
        await callViewSync({
          scheduleRender,
          render,
          refreshView,
          reload,
          loadIncidencias,
          source: safeText(payload?.source, "mutation"),
        });
      } catch (error) {
        safeWarn("No se pudo sincronizar la vista tras mutación.", error);
      }
    }, MUTATION_SYNC_DELAY_MS);
  }

  async function handleRefresh(element = null, retry = false) {
    return runBusy("incidencias:refresh", element, async () => {
      return callReload({
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
    return runBusy("incidencias:export", element, async () => {
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
    return runBusy("incidencias:create", element, async () => {
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
    const finalId = ticketId || ticketCode;

    if (!finalId) {
      safeWarn("open-ticket sin id.");
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    return runBusy(`incidencias:open:${finalId}`, element, async () => {
      try {
        const payload = {
          ticketId: finalId,
          ticketCode,
          preferFresh: true,
          silent: false,
          source: scopeName,
        };

        const result = await callOpenTicket(openTicket, finalId, payload);

        emit("incidencias:bindings:open", {
          ticketId: finalId,
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

    return runBusy(`incidencias:copy:${finalId}`, element, async () => {
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

    return runBusy(`incidencias:filter:${filter}`, element, async () => {
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
    return runBusy("incidencias:filters:clear", element, async () => {
      try {
        if (isFn(clearFilters)) {
          return clearFilters();
        }

        return callSetFilter(setFilter, "all");
      } catch (error) {
        safeWarn("No se pudieron limpiar filtros.", error);
        return false;
      }
    });
  }

  async function handleClearSearch(element = null) {
    return runBusy("incidencias:search:clear", element, async () => {
      try {
        lastSearchValue = "";

        if (isFn(clearSearchOnly)) {
          return clearSearchOnly();
        }

        return callSetSearchQuery(setSearchQuery, "");
      } catch (error) {
        safeWarn("No se pudo limpiar búsqueda.", error);
        return false;
      }
    });
  }

  async function handleLoadMore(element = null, reason = "manual") {
    if (!infiniteScroll) return false;

    return runBusy("incidencias:load-more", element, async () => {
      try {
        const result = await callLoadMore({
          loadMore,
          showMore,
          goNextPage,
          source: scopeName,
          reason,
        });

        emit("incidencias:bindings:load-more", {
          ok: Boolean(result),
          source: scopeName,
          reason,
        });

        return result;
      } catch (error) {
        safeWarn("No se pudieron cargar más incidencias.", error);
        return false;
      }
    });
  }

  async function handlePage(element = null) {
    const page = getPage(element);

    if (!page || !isFn(goToPage)) return false;

    return goToPage(page);
  }

  async function handlePrevPage() {
    if (isFn(goPrevPage)) return goPrevPage();
    return false;
  }

  async function handleNextPage() {
    if (infiniteScroll && (isFn(loadMore) || isFn(showMore) || isFn(goNextPage))) {
      return callLoadMore({
        loadMore,
        showMore,
        goNextPage,
        source: scopeName,
        reason: "legacy_next_page",
      });
    }

    if (isFn(goNextPage)) return goNextPage();

    return false;
  }

  async function dispatchAction(type = "", element = null, reason = "action") {
    if (!type || isDisabledElement(element)) return null;

    switch (type) {
      case "refresh":
        return handleRefresh(element, false);

      case "retry":
        return handleRefresh(element, true);

      case "export":
        return handleExport(element);

      case "create":
        return handleCreate(element);

      case "clearFilters":
        return handleClearFilters(element);

      case "clearSearch":
        return handleClearSearch(element);

      case "filter":
        return handleFilter(element);

      case "loadMore":
        return handleLoadMore(element, reason === "keyboard" ? "keyboard" : "button");

      case "page":
        return handlePage(element);

      case "prevPage":
        return handlePrevPage();

      case "nextPage":
        return handleNextPage();

      case "copy":
        return handleCopy(element);

      case "open":
        return handleOpen(element);

      default:
        return null;
    }
  }

  function queueSearchValue(value = "") {
    const nextValue = safeText(value, "");

    clearSearchTimer();

    if (nextValue === lastSearchValue) return;

    searchTimer = timerHost.setTimeout(async () => {
      searchTimer = 0;

      if (destroyed) return;
      if (nextValue === lastSearchValue) return;

      lastSearchValue = nextValue;

      try {
        await callSetSearchQuery(setSearchQuery, nextValue);
      } catch (error) {
        safeWarn("No se pudo aplicar búsqueda.", error);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function commitSearchValue(value = "") {
    const nextValue = safeText(value, "");

    clearSearchTimer();

    if (nextValue === lastSearchValue) return;

    lastSearchValue = nextValue;

    Promise.resolve(callSetSearchQuery(setSearchQuery, nextValue)).catch((error) => {
      safeWarn("No se pudo aplicar búsqueda.", error);
    });
  }

  function handleSearchInput(input = null) {
    if (!input) return;
    queueSearchValue(input.value);
  }

  function handleSearchChange(input = null) {
    if (!input) return;
    commitSearchValue(input.value);
  }

  function handlePageSizeChange(input = null) {
    if (!input || !isFn(changePageSize)) return;

    Promise.resolve(changePageSize(input.value)).catch((error) => {
      safeWarn("No se pudo cambiar tamaño de página.", error);
    });
  }

  addDomListener(cleanups, root, "click", async (event) => {
    if (destroyed || event.defaultPrevented) return;

    const target = getEventElement(event);

    if (!target) return;

    const action = getRecognizedAction(root, target);

    if (action.element && action.type) {
      event.preventDefault();
      event.stopPropagation();
      await dispatchAction(action.type, action.element, "click");
      return;
    }

    const row = getRowFromTarget(root, target);

    if (row) {
      event.preventDefault();
      await handleOpen(row);
    }
  });

  addDomListener(cleanups, root, "keydown", async (event) => {
    if (destroyed || event.defaultPrevented) return;

    const key = safeText(event.key, "");

    if (key !== "Enter" && key !== " " && key !== "Spacebar") return;

    const target = getEventElement(event);

    if (!target) return;

    const action = getRecognizedAction(root, target);

    if (action.element && action.type) {
      event.preventDefault();
      event.stopPropagation();
      await dispatchAction(action.type, action.element, "keyboard");
      return;
    }

    const row = getRowFromTarget(root, target);

    if (!row) return;

    event.preventDefault();
    await handleOpen(row);
  });

  addDomListener(cleanups, root, "input", (event) => {
    if (destroyed) return;

    const target = getEventElement(event);
    const input = closestInside(root, target, SEARCH_SELECTOR);

    if (input) {
      handleSearchInput(input);
    }
  });

  addDomListener(cleanups, root, "change", (event) => {
    if (destroyed) return;

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

  if (bindMutationEvents) {
    safeArray(mutationEvents).forEach((eventName) => {
      addAppEventListener(cleanups, eventName, (eventOrPayload = {}) => {
        const payload = safeObject(eventOrPayload?.detail || eventOrPayload);
        scheduleMutationSync(payload);
      });
    });
  }

  emit("incidencias:bindings:ready", {
    scope: scopeName,
    source: "incidencias.bindings",
    mode: infiniteScroll ? "infinite" : "legacy",
    mutationEvents: Boolean(bindMutationEvents),
  });

  const cleanup = () => {
    if (destroyed) return;

    destroyed = true;

    clearSearchTimer();
    clearMutationSyncTimer();
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

/* =========================================================
   Onion Support - Clientes Index
   Cursor pagination · server search/filter/order · race-safe
========================================================= */

import { AppCore } from "../../core/index.js";
import { ROUTES } from "../../core/config.js";
import {
  CLIENTES_API_VERSION,
  CLIENTES_ENDPOINT,
  CLIENTES_PAGE_ENDPOINT,
  CLIENTES_FETCH_LIMIT,
  CLIENTES_MAX_LIMIT,
  CLIENTES_MAX_PAGES,
  CLIENTES_CACHE_KEY,
  CLIENTES_CACHE_TTL_MS,
  fetchClientesPage,
  loadClienteDetail as loadClienteDetailRequest,
  normalizeClienteModel,
  findClienteById as findClienteByIdApi,
} from "./clientes.api.js";
import {
  renderClientesTemplate,
  CLIENTES_ACTIONS,
} from "./clientes.template.js";
import {
  openClientesDetailModal,
  closeClientesDetailModal,
} from "./clientes.template.modal.js";
import {
  init as initLegacyCreateBridge,
  openCreate as openLegacyCreate,
  destroy as destroyLegacyCreateBridge,
} from "./clientes.index.legacy.js";

export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_CANONICAL_PATH = "/clientes";
export const CLIENTES_INDEX_VERSION =
  "clientes.index.cursor.v12.progressive-reconciliation";
export const CLIENTES_VIEW_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_MODULE_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_INDEX_SOURCE = "views.clientes.index";

export {
  CLIENTES_ENDPOINT,
  CLIENTES_PAGE_ENDPOINT,
  CLIENTES_FETCH_LIMIT,
  CLIENTES_MAX_LIMIT,
  CLIENTES_MAX_PAGES,
  CLIENTES_CACHE_KEY,
  CLIENTES_CACHE_TTL_MS,
};

const DEFAULT_SORT_ORDER = "desc";
const SEARCH_DEBOUNCE_MS = 220;
const INFINITE_ROOT_MARGIN = "0px 0px 900px 0px";
const INSTANCES = new WeakMap();

let lastInstance = null;
let controllerSequence = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function safeError(error = null, fallback = "No se pudieron cargar los clientes.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function errorCode(error = null) {
  return cleanText(
    first(
      error?.code,
      error?.data?.code,
      error?.payload?.code,
      error?.response?.data?.code,
      error?.response?.code,
      error?.error,
      ""
    ),
    ""
  ).toUpperCase();
}

function isAbortError(error = null) {
  return (
    error?.name === "AbortError" ||
    errorCode(error) === "ABORT_ERR" ||
    /aborted|aborterror/i.test(cleanText(error?.message, ""))
  );
}

function isCursorContextError(error = null) {
  return [
    "CLIENTES_CURSOR_INVALID",
    "CLIENTES_CURSOR_CONTEXT_MISMATCH",
  ].includes(errorCode(error));
}

function isDomNode(value = null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.nodeType === 1 &&
    "innerHTML" in value &&
    typeof value.addEventListener === "function"
  );
}

function isElement(value = null) {
  return Boolean(typeof Element !== "undefined" && value instanceof Element);
}

function nextFrame(callback) {
  if (!isBrowser() || typeof callback !== "function") return 0;
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 0);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return;
  try { window.cancelAnimationFrame?.(id); } catch { /* noop */ }
  try { window.clearTimeout?.(id); } catch { /* noop */ }
}

function getGlobalObject() {
  try { return globalThis; } catch { return {}; }
}

function getAppState() {
  try {
    if (typeof AppCore?.runtimeState?.read === "function") {
      return AppCore.runtimeState.read() || {};
    }
  } catch {
    // noop
  }
  return {};
}

function getCurrentUser() {
  const state = getAppState();
  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function getCurrentRole(context = {}) {
  const state = getAppState();
  const user = safeObject(getCurrentUser());
  try {
    return (
      AppCore.normalizeRole(
        first(
          context.role,
          context.rol,
          context.user?.role,
          context.user?.rol,
          AppCore.getCurrentRole?.(),
          state.role,
          state.rol,
          state.roles,
          user.role,
          user.rol,
          user.roles,
          ""
        )
      ) || "user"
    );
  } catch {
    return normalizeKey(first(context.role, state.role, user.role, "user")) === "admin"
      ? "admin"
      : "user";
  }
}

function isAdmin(context = {}) {
  return context.admin === true || getCurrentRole(context) === "admin";
}

function getRoutes() {
  return {
    incidencias: ROUTES?.incidencias || "/incidencias",
    facturas: ROUTES?.facturas || "/facturas",
    clientes: ROUTES?.clientes || "/clientes",
    usuarios: ROUTES?.usuarios || "/usuarios",
    servidor: ROUTES?.servidor || "/servidor",
  };
}

function normalizePath(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.split("?")[0].split("#")[0] || "/";
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";
  const segments = value.split("/").filter(Boolean);
  if (segments[0]?.startsWith("@")) {
    value = `/${segments.slice(1).join("/")}` || "/";
  }
  return value;
}

function currentPath(context = {}) {
  if (isBrowser()) {
    try {
      const hash = window.location.hash || "";
      if (hash.startsWith("#/")) return normalizePath(hash.slice(1));
      if (hash.startsWith("#!/")) return normalizePath(hash.slice(2));
      return normalizePath(window.location.pathname || "/");
    } catch {
      // noop
    }
  }
  return normalizePath(
    first(
      context.canonicalPath,
      context.routePath,
      context.route?.path,
      context.path,
      CLIENTES_CANONICAL_PATH
    )
  );
}

function isClientesRoute(context = {}) {
  return currentPath(context) === CLIENTES_CANONICAL_PATH;
}

function resolveHost(host = null, context = {}) {
  if (isDomNode(host)) return host;
  for (const candidate of [context.host, context.root, context.container]) {
    if (isDomNode(candidate)) return candidate;
  }
  if (!isBrowser()) return null;
  return (
    document.querySelector("[data-view-host='clientes']") ||
    document.querySelector("[data-clientes-host='true']") ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
}

function showToast(message = "", type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;
  for (const toast of [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast]) {
    try {
      if (typeof toast?.[type] === "function") {
        toast[type](text);
        return true;
      }
      if (typeof toast?.show === "function") {
        toast.show(text, type);
        return true;
      }
    } catch {
      // noop
    }
  }
  return false;
}

function emitEvent(name = "", payload = {}) {
  const eventName = cleanText(name, "");
  if (!eventName) return false;
  try {
    if (typeof AppCore?.events?.emit === "function") {
      AppCore.events.emit(eventName, payload);
      return true;
    }
  } catch {
    // fallback
  }
  try {
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      return true;
    }
  } catch {
    // noop
  }
  return false;
}

function getClienteId(item = {}) {
  const current = normalizeClienteModel(safeObject(item));
  return cleanText(
    first(
      current.clienteId,
      current.clientId,
      current.customerId,
      current.id,
      current._id,
      current.uid,
      ""
    ),
    ""
  );
}

function cloneItems(items = []) {
  return items.map((item) => ({ ...normalizeClienteModel(item) }));
}

function appendUnique(existing = [], incoming = []) {
  const output = [];
  const seen = new Set();

  for (const raw of [...existing, ...incoming]) {
    const item = normalizeClienteModel(raw);
    const id = getClienteId(item);
    const key = id.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function mergeFreshPageWithLoaded(existing = [], incoming = []) {
  return mergeFreshReconciliationPage([], incoming, existing).visibleItems;
}

export function mergeFreshReconciliationPage(
  freshItems = [],
  incoming = [],
  visibleItems = []
) {
  const previousFresh = appendUnique([], freshItems);
  const nextFresh = appendUnique(previousFresh, incoming);
  const freshIds = new Set(
    nextFresh.map(getClienteId).filter(Boolean).map((id) => id.toLowerCase())
  );
  const preservedVisible = appendUnique([], visibleItems).filter((item) => {
    const id = getClienteId(item).toLowerCase();
    return id && !freshIds.has(id);
  });

  return {
    freshItems: nextFresh,
    visibleItems: appendUnique(nextFresh, preservedVisible),
    progressed: nextFresh.length > previousFresh.length,
  };
}

function csvEscape(value = "") {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function createClientesController(host = null, initialContext = {}) {
  const id = ++controllerSequence;
  let root = resolveHost(host, initialContext);
  let context = safeObject(initialContext);
  let destroyed = false;
  let mounted = false;

  let items = [];
  let nextCursor = "";
  let hasMore = false;
  let seenPageCursors = new Set();
  let totalKnown = false;
  let total = null;
  let lastSyncAt = 0;
  let freshReconciliationItems = null;

  let loading = false;
  let refreshing = false;
  let loadingMore = false;
  let creating = false;
  let error = "";
  let loadMoreError = "";

  let search = "";
  let searchDraft = "";
  let searchContextDirty = false;
  let filter = "all";
  let sortOrder = DEFAULT_SORT_ORDER;

  let openingClienteId = "";
  let requestSeq = 0;
  let queryVersion = 0;
  let activeListController = null;
  let searchTimer = 0;
  let searchComposing = false;
  let renderFrame = 0;
  let infiniteObserver = null;
  let detailSeq = 0;
  let legacyBridgeHost = null;
  let legacyBridgeReady = false;

  function alive() {
    return !destroyed && isClientesRoute(context);
  }

  function payload(extra = {}) {
    return {
      id,
      user: getCurrentUser(),
      role: getCurrentRole(context),
      admin: isAdmin(context),
      routes: getRoutes(),
      route: getRoutes().clientes,
      items,
      clientes: items,
      clients: items,
      rows: items,
      nextCursor,
      hasMore,
      totalKnown,
      total,
      lastSyncAt,
      loading,
      refreshing,
      loadingMore,
      creating,
      error,
      loadMoreError,
      filter,
      search,
      searchDraft,
      searchPending: Boolean(searchTimer) || searchContextDirty,
      sortOrder,
      openingClienteId,
      reconcilingHistory: Array.isArray(freshReconciliationItems),
      queryVersion,
      apiVersion: CLIENTES_API_VERSION,
      indexVersion: CLIENTES_INDEX_VERSION,
      ...extra,
    };
  }

  function snapshot() {
    return {
      ...payload(),
      items: cloneItems(items),
      clientes: cloneItems(items),
      clients: cloneItems(items),
      rows: cloneItems(items),
      mounted,
      destroyed,
    };
  }

  function captureFocusState() {
    if (!isBrowser() || !root) return null;
    const scrollRoot = resolveInfiniteScrollRoot();
    const baseState = {
      scrollTop: number(scrollRoot?.scrollTop, 0),
    };
    const active = document.activeElement;
    if (!active || !root.contains(active)) {
      return { ...baseState, kind: "scroll" };
    }

    if (
      active.matches?.(
        "[data-clientes-search-input], [data-search-input='clientes']"
      )
    ) {
      return {
        ...baseState,
        kind: "search",
        start: Number.isInteger(active.selectionStart)
          ? active.selectionStart
          : null,
        end: Number.isInteger(active.selectionEnd)
          ? active.selectionEnd
          : null,
      };
    }

    const row = active.closest?.("[data-client-id], [data-cliente-id]");
    const action = active.closest?.("[data-clientes-action], [data-action]");
    const clientId = cleanText(
      first(
        row?.getAttribute?.("data-client-id"),
        row?.getAttribute?.("data-cliente-id"),
        ""
      ),
      ""
    );

    return {
      ...baseState,
      kind: "control",
      clientId,
      action: cleanText(
        first(
          action?.getAttribute?.("data-clientes-action"),
          action?.getAttribute?.("data-action"),
          ""
        ),
        ""
      ),
      filter: cleanText(action?.getAttribute?.("data-filter"), ""),
      controlKind: active.matches?.(".clientes-stat-card")
        ? "stat-card"
        : active.matches?.(".clientes-filter-pill")
          ? "filter-pill"
          : active.matches?.(".clientes-sort-pill")
            ? "sort-pill"
            : "",
      elementId: cleanText(active.id, ""),
      href: cleanText(active.getAttribute?.("href"), ""),
      tagName: cleanText(active.tagName, "").toLowerCase(),
    };
  }

  function restoreFocusState(state = null) {
    if (!state || !root) return;

    const scrollRoot = resolveInfiniteScrollRoot();
    if (scrollRoot) scrollRoot.scrollTop = number(state.scrollTop, 0);

    let target = null;
    if (state.kind === "search") {
      target = root.querySelector(
        "[data-clientes-search-input], [data-search-input='clientes']"
      );
    } else {
      if (state.action === CLIENTES_ACTIONS.CLEAR_SEARCH) {
        target = root.querySelector(
          "[data-clientes-search-input], [data-search-input='clientes']"
        );
      }
      if (!target && state.action === CLIENTES_ACTIONS.CLEAR_FILTERS) {
        target = root.querySelector(
          `.clientes-filter-pill[data-clientes-action="${CLIENTES_ACTIONS.FILTER}"][data-filter="all"]`
        );
      }
      if (!target && state.elementId) {
        const candidate = document.getElementById(state.elementId);
        if (candidate && root.contains(candidate)) target = candidate;
      }
      const rows = Array.from(
        root.querySelectorAll?.("[data-client-id], [data-cliente-id]") || []
      );
      const scope = state.clientId
        ? rows.find((row) =>
            [
              row.getAttribute("data-client-id"),
              row.getAttribute("data-cliente-id"),
            ].some((value) => cleanText(value, "") === state.clientId)
          ) || null
        : root;
      if (!target) {
        const controls = Array.from(
          scope?.querySelectorAll?.(
            "[data-clientes-action], [data-action], a[href], button, [tabindex]"
          ) || []
        );
        target = controls.find((control) => {
          const action = cleanText(
            first(
              control.getAttribute?.("data-clientes-action"),
              control.getAttribute?.("data-action"),
              ""
            ),
            ""
          );
          const href = cleanText(control.getAttribute?.("href"), "");
          const filter = cleanText(control.getAttribute?.("data-filter"), "");
          const kindMatches = !state.controlKind || control.matches?.(
            `.clientes-${state.controlKind}`
          );
          if (state.action) {
            return action === state.action &&
              (!state.filter || filter === state.filter) &&
              kindMatches;
          }
          if (state.href) return href === state.href;
          return cleanText(control.tagName, "").toLowerCase() === state.tagName;
        }) || (scope?.matches?.("[tabindex]") ? scope : null);
      }
      if (
        !target &&
        (state.clientId ||
          [CLIENTES_ACTIONS.RETRY_PAGE, CLIENTES_ACTIONS.REFRESH].includes(
            state.action
          ))
      ) {
        target = root.querySelector(".clientes-history-subtitle");
      }
    }

    if (!target) return;
    try {
      target.focus({ preventScroll: true });
      if (
        state.kind === "search" &&
        state.start !== null &&
        state.end !== null &&
        typeof target.setSelectionRange === "function"
      ) {
        const max = String(target.value || "").length;
        target.setSelectionRange(
          Math.min(state.start, max),
          Math.min(state.end, max)
        );
      }
    } catch {
      // noop
    }
  }

  function disconnectInfiniteObserver(observer = infiniteObserver) {
    if (!observer) return false;
    if (infiniteObserver === observer) infiniteObserver = null;
    try {
      observer.takeRecords?.();
    } catch {
      // noop
    }
    try {
      observer.disconnect();
    } catch {
      // noop
    }
    return true;
  }

  function resolveInfiniteScrollRoot() {
    if (!isBrowser()) return null;
    const mainContent = document.getElementById("main-content");
    if (mainContent?.contains?.(root)) return mainContent;
    return root?.closest?.(".main-content, [data-main-content='true']") || null;
  }

  function syncInfiniteObserver() {
    disconnectInfiniteObserver();

    if (
      !isBrowser() ||
      !root ||
      destroyed ||
      loading ||
      refreshing ||
      loadingMore ||
      Boolean(searchTimer) ||
      searchContextDirty ||
      Boolean(error) ||
      hasMore !== true ||
      !nextCursor ||
      Boolean(loadMoreError) ||
      typeof window.IntersectionObserver !== "function"
    ) {
      return false;
    }

    const sentinel = root.querySelector(
      "[data-clientes-infinite-sentinel='true']"
    );
    const scrollRoot = resolveInfiniteScrollRoot();
    if (!sentinel || !scrollRoot) return false;

    try {
      const observer = new window.IntersectionObserver(
        (entries) => {
          if (infiniteObserver !== observer) {
            disconnectInfiniteObserver(observer);
            return;
          }
          if (
            destroyed ||
            loading ||
            refreshing ||
            loadingMore ||
            Boolean(searchTimer) ||
            searchContextDirty ||
            Boolean(error) ||
            hasMore !== true ||
            !nextCursor ||
            Boolean(loadMoreError)
          ) {
            disconnectInfiniteObserver(observer);
            return;
          }

          if (entries.some((entry) => entry.isIntersecting)) {
            disconnectInfiniteObserver(observer);
            void loadMore();
          }
        },
        {
          root: scrollRoot,
          rootMargin: INFINITE_ROOT_MARGIN,
          threshold: 0.01,
        }
      );
      infiniteObserver = observer;
      infiniteObserver.observe(sentinel);
      return true;
    } catch {
      disconnectInfiniteObserver();
      return false;
    }
  }

  function renderNow() {
    if (!root || destroyed || !isClientesRoute(context)) return false;
    cancelFrame(renderFrame);
    renderFrame = 0;
    disconnectInfiniteObserver();
    const focusState = captureFocusState();
    try {
      root.innerHTML = renderClientesTemplate(payload());
      root.dataset.view = "clientes";
      root.dataset.clientesVersion = CLIENTES_INDEX_VERSION;
      root.dataset.clientesApiVersion = CLIENTES_API_VERSION;
      restoreFocusState(focusState);
      if (error && !items.length) {
        const active = document.activeElement;
        const mayMoveFocus =
          !active ||
          active === document.body ||
          active === document.documentElement;
        if (mayMoveFocus) {
          nextFrame(() => {
            if (!alive() || !isClientesRoute(context)) return;
            const fatalError = root?.querySelector?.(
              "[data-clientes-fatal-error='true']"
            );
            try { fatalError?.focus?.({ preventScroll: true }); } catch { /* noop */ }
          });
        }
      }
      syncInfiniteObserver();
      return true;
    } catch (renderError) {
      error = safeError(renderError, "No se pudo renderizar la vista de clientes.");
      root.textContent = error;
      return false;
    }
  }

  function scheduleRender() {
    if (!root || destroyed) return 0;
    cancelFrame(renderFrame);
    renderFrame = nextFrame(() => {
      renderFrame = 0;
      renderNow();
    });
    return renderFrame;
  }

  function abortList(reason = "clientes-query-changed") {
    const controller = activeListController;
    activeListController = null;
    if (!controller || controller.signal.aborted) return false;
    try {
      controller.abort(reason);
      return true;
    } catch {
      try { controller.abort(); } catch { /* noop */ }
      return true;
    }
  }

  function clearPageState() {
    items = [];
    nextCursor = "";
    hasMore = false;
    seenPageCursors = new Set();
    totalKnown = false;
    total = null;
    lastSyncAt = 0;
    freshReconciliationItems = null;
    error = "";
    loadMoreError = "";
  }

  async function requestPage({
    append = false,
    silent = false,
    cursorOverride = null,
    preservePages = false,
  } = {}) {
    if (!alive()) return snapshot();

    if (
      append &&
      (loading ||
        refreshing ||
        loadingMore ||
        Boolean(searchTimer) ||
        searchContextDirty ||
        Boolean(error) ||
        hasMore !== true ||
        !nextCursor)
    ) {
      return snapshot();
    }

    const preserveLoadedPages =
      !append && preservePages === true && items.length > 0;
    const preservedTotalKnown = totalKnown;
    const preservedTotal = total;
    const preservedLoadMoreError = preserveLoadedPages ? loadMoreError : "";
    const preservedFreshReconciliationItems = Array.isArray(
      freshReconciliationItems
    )
      ? cloneItems(freshReconciliationItems)
      : null;

    abortList(append ? "clientes-load-more-replaced" : "clientes-first-page-replaced");
    const controller = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
    activeListController = controller;

    const seq = ++requestSeq;
    const version = queryVersion;
    const cursor = append
      ? cleanText(first(cursorOverride, nextCursor, ""), "")
      : "";

    if (append) {
      loading = false;
      refreshing = false;
      loadingMore = true;
      loadMoreError = "";
    } else if (preserveLoadedPages && silent) {
      loading = false;
      refreshing = true;
      loadingMore = false;
    } else {
      loading = true;
      refreshing = false;
      loadingMore = false;
    }
    if (!append) {
      loadMoreError = "";
      error = "";
    }
    renderNow();

    try {
      const response = await fetchClientesPage({
        limit: CLIENTES_FETCH_LIMIT,
        q: search,
        filter,
        order: sortOrder,
        cursor,
        signal: controller?.signal,
        source: append
          ? "views.clientes.index.load-more"
          : "views.clientes.index.first-page",
      });

      if (
        seq !== requestSeq ||
        version !== queryVersion ||
        !alive() ||
        controller?.signal?.aborted
      ) {
        return snapshot();
      }

      const pageItems = Array.isArray(response?.items) ? response.items : [];
      const responseCursor = cleanText(response?.nextCursor, "");
      const responseHasMore = response?.hasMore === true && Boolean(responseCursor);
      const responseTotalKnown = response?.totalKnown === true;
      const responseTotal = Number(response?.total);
      const normalizedPageItems = appendUnique([], pageItems);
      const freshWithLoaded = preserveLoadedPages
        ? mergeFreshPageWithLoaded(items, pageItems)
        : appendUnique([], pageItems);
      const reconciliationPage =
        append && Array.isArray(preservedFreshReconciliationItems)
          ? mergeFreshReconciliationPage(
              preservedFreshReconciliationItems,
              pageItems,
              items
            )
          : null;
      const startFreshReconciliation =
        preserveLoadedPages && responseHasMore;
      const preserveAccumulatedRows = startFreshReconciliation;
      const mergedItems = append
        ? reconciliationPage
          ? responseHasMore
            ? reconciliationPage.visibleItems
            : reconciliationPage.freshItems
          : appendUnique(items, pageItems)
        : preserveAccumulatedRows
          ? freshWithLoaded
          : appendUnique([], pageItems);

      if (
        append &&
        responseHasMore &&
        (responseCursor === cursor || seenPageCursors.has(responseCursor))
      ) {
        const cursorError = new Error(
          "La API devolvió un cursor de clientes ya recorrido."
        );
        cursorError.code = "CLIENTES_CURSOR_DID_NOT_ADVANCE";
        throw cursorError;
      }

      if (
        append &&
        responseHasMore &&
        (reconciliationPage
          ? !reconciliationPage.progressed
          : mergedItems.length <= items.length)
      ) {
        const progressError = new Error(
          "La siguiente página de clientes no hizo avanzar la colección fresca."
        );
        progressError.code = "CLIENTES_PAGE_DID_NOT_ADVANCE";
        throw progressError;
      }

      if (
        !append &&
        responseHasMore &&
        normalizedPageItems.length === 0
      ) {
        const progressError = new Error(
          "La primera página continuable no incluyó clientes con identidad estable."
        );
        progressError.code = "CLIENTES_PAGE_DID_NOT_ADVANCE";
        throw progressError;
      }

      items = mergedItems;
      nextCursor = responseHasMore ? responseCursor : "";
      hasMore = responseHasMore && Boolean(nextCursor);
      if (append && reconciliationPage) {
        freshReconciliationItems = responseHasMore
          ? reconciliationPage.freshItems
          : null;
      } else if (!append && startFreshReconciliation) {
        freshReconciliationItems = appendUnique([], pageItems);
      } else if (!append) {
        freshReconciliationItems = null;
      }
      if (append) {
        if (responseHasMore && responseCursor) {
          seenPageCursors.add(responseCursor);
        }
      } else {
        seenPageCursors = new Set(
          responseHasMore && responseCursor ? [responseCursor] : []
        );
      }
      if (Array.isArray(freshReconciliationItems)) {
        totalKnown = false;
        total = null;
      } else if (preserveAccumulatedRows) {
        totalKnown = responseTotalKnown || preservedTotalKnown;
        const knownTotal = responseTotalKnown && Number.isFinite(responseTotal)
          ? responseTotal
          : preservedTotal;
        total = totalKnown && Number.isFinite(Number(knownTotal))
          ? Math.max(items.length, Number(knownTotal))
          : null;
      } else if (append && !responseTotalKnown) {
        totalKnown = preservedTotalKnown;
        total = preservedTotalKnown && Number.isFinite(Number(preservedTotal))
          ? Math.max(items.length, Number(preservedTotal))
          : null;
      } else {
        totalKnown = responseTotalKnown;
        total = totalKnown && Number.isFinite(Number(response?.total))
          ? Number(response.total)
          : null;
      }
      lastSyncAt = Number(response?.lastSyncAt || Date.now()) || Date.now();
      error = "";
      loadMoreError = "";

      emitEvent("clientes:loaded", {
        ...snapshot(),
        appended: append,
        preservedPages: preserveAccumulatedRows,
        source: CLIENTES_INDEX_SOURCE,
        controllerId: id,
      });

      return snapshot();
    } catch (loadError) {
      if (
        seq !== requestSeq ||
        version !== queryVersion ||
        destroyed ||
        isAbortError(loadError)
      ) {
        return snapshot();
      }

      if (append && isCursorContextError(loadError)) {
        clearPageState();
        queryVersion += 1;
        emitEvent("clientes:cursor-reset", {
          code: errorCode(loadError),
          source: CLIENTES_INDEX_SOURCE,
          controllerId: id,
        });
        return requestPage({ append: false, silent: false });
      }

      const message = safeError(loadError);
      if (append && items.length) {
        loadMoreError = message;
        error = "";
      } else {
        loadMoreError = preserveLoadedPages ? preservedLoadMoreError : "";
        error = message;
      }
      emitEvent("clientes:error", {
        message,
        code: errorCode(loadError),
        append,
        source: CLIENTES_INDEX_SOURCE,
        controllerId: id,
      });
      return snapshot();
    } finally {
      if (seq === requestSeq && !destroyed) {
        if (activeListController === controller) activeListController = null;
        loading = false;
        refreshing = false;
        loadingMore = false;
        if (root && isClientesRoute(context)) renderNow();
      }
    }
  }

  async function resetAndLoad() {
    clearSearchTimer();
    abortList("clientes-query-context-reset");
    requestSeq += 1;
    queryVersion += 1;
    searchContextDirty = false;
    loading = false;
    refreshing = false;
    loadingMore = false;
    clearPageState();
    return requestPage({ append: false, silent: false });
  }

  function clearSearchTimer() {
    if (searchTimer && isBrowser()) {
      window.clearTimeout?.(searchTimer);
    }
    searchTimer = 0;
    return true;
  }

  function readLiveSearchDraft() {
    const input = root?.querySelector?.(
      "[data-clientes-search-input], [data-search-input='clientes']"
    );
    return input && "value" in input ? String(input.value ?? "") : searchDraft;
  }

  function commitSearchDraft() {
    const rawDraft = String(readLiveSearchDraft() ?? "");
    searchDraft = rawDraft;
    const next = cleanText(rawDraft, "");
    const changed = next !== search;
    search = next;
    return changed;
  }

  function invalidateForSearchDraft() {
    disconnectInfiniteObserver();
    abortList("clientes-search-draft-changed");
    requestSeq += 1;
    queryVersion += 1;
    loading = false;
    refreshing = false;
    loadingMore = false;
    searchContextDirty = true;
    return true;
  }

  function reflectSearchPendingState() {
    if (!root || destroyed) return false;
    root.querySelector?.("[data-clientes-infinite-sentinel='true']")?.remove?.();
    root.querySelector?.("[data-clientes-scope='true']")?.setAttribute?.(
      "data-search-pending",
      "true"
    );
    root.querySelector?.(".clientes-history-results")?.setAttribute?.(
      "aria-busy",
      "true"
    );
    const message = "Preparando la búsqueda de clientes...";
    const liveStatus = root.querySelector?.(".clientes-history-subtitle");
    if (liveStatus) liveStatus.textContent = message;
    const footerStatus = root.querySelector?.(".clientes-infinite-status");
    if (footerStatus) {
      footerStatus.classList?.add?.("is-loading");
      footerStatus.textContent = message;
    }
    return true;
  }

  async function refresh() {
    if (!alive()) return snapshot();
    const pendingSearch = searchContextDirty || Boolean(searchTimer);
    clearSearchTimer();
    const searchChanged = commitSearchDraft();
    if (pendingSearch || searchChanged) return resetAndLoad();
    return requestPage({
      append: false,
      silent: items.length > 0,
      preservePages: items.length > 0,
    });
  }

  async function setSearch(value = "") {
    clearSearchTimer();
    const rawDraft = String(value ?? "");
    const next = cleanText(rawDraft, "");
    const shouldReload = searchContextDirty || next !== search;
    searchDraft = rawDraft;
    search = next;
    if (shouldReload) await resetAndLoad();
    else renderNow();
    return search;
  }

  async function setFilter(value = "all") {
    const pendingSearch = searchContextDirty || Boolean(searchTimer);
    clearSearchTimer();
    const searchChanged = commitSearchDraft();
    const key = normalizeKey(value || "all");
    const next = ["all", "active", "pending", "blocked"].includes(key)
      ? key
      : "all";
    const filterChanged = next !== filter;
    filter = next;
    if (pendingSearch || searchChanged || filterChanged) await resetAndLoad();
    else renderNow();
    return filter;
  }

  async function setSortOrder(value = DEFAULT_SORT_ORDER) {
    const pendingSearch = searchContextDirty || Boolean(searchTimer);
    clearSearchTimer();
    const searchChanged = commitSearchDraft();
    const next = ["asc", "ascending", "oldest", "antiguos"].includes(
      normalizeKey(value)
    )
      ? "asc"
      : "desc";
    const sortChanged = next !== sortOrder;
    sortOrder = next;
    if (pendingSearch || searchChanged || sortChanged) await resetAndLoad();
    else renderNow();
    return sortOrder;
  }

  async function clearFilters() {
    const pendingSearch = searchContextDirty || Boolean(searchTimer);
    clearSearchTimer();
    const changed =
      filter !== "all" ||
      search !== "" ||
      cleanText(searchDraft, "") !== "" ||
      sortOrder !== DEFAULT_SORT_ORDER;
    filter = "all";
    search = "";
    searchDraft = "";
    sortOrder = DEFAULT_SORT_ORDER;
    if (pendingSearch || changed) await resetAndLoad();
    else scheduleRender();
    return true;
  }

  async function loadMore() {
    if (
      searchTimer ||
      searchContextDirty ||
      Boolean(error) ||
      loading ||
      refreshing ||
      hasMore !== true ||
      !nextCursor ||
      loadingMore
    ) {
      return snapshot();
    }
    return requestPage({ append: true });
  }

  function exportCsv() {
    const rows = items.map((item) => normalizeClienteModel(item));
    const header = [
      "ID",
      "Código",
      "Nombre",
      "Email",
      "Teléfono",
      "Ciudad",
      "NIF",
      "Estado",
      "Tipo",
      "Importe",
    ];
    const lines = [
      header,
      ...rows.map((item) => [
        getClienteId(item),
        first(item.code, item.codigo, ""),
        first(item.nombreFiscal, item.razonSocial, item.displayName, ""),
        item.email || "",
        first(item.phone, item.telefono, ""),
        first(item.city, item.ciudad, ""),
        first(item.nif, item.cif, ""),
        first(item.status, item.estado, ""),
        first(item.tipo, item.type, ""),
        String(first(item.totalAmount, item.totalImporte, 0)).replace(".", ","),
      ]),
    ];
    const csv = lines
      .map((row) => row.map(csvEscape).join(";"))
      .join("\n");

    if (!isBrowser()) return csv;

    try {
      const blob = new Blob([`\ufeff${csv}`], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clientes-cargados-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(
        `Se han exportado ${rows.length} clientes cargados. La exportación no descarga páginas adicionales.`,
        "success"
      );
      return true;
    } catch {
      return csv;
    }
  }

  async function openCliente(idValue = "") {
    const clienteId = cleanText(idValue, "");
    if (!clienteId || openingClienteId === clienteId) return Boolean(clienteId);

    const seq = ++detailSeq;
    openingClienteId = clienteId;
    scheduleRender();

    try {
      let current = findClienteByIdApi(items, clienteId);

      if (isAdmin(context)) {
        try {
          current = await loadClienteDetailRequest(clienteId, { dedupe: true });
        } catch {
          // Loaded page snapshot remains a valid fallback.
        }
      }

      if (seq !== detailSeq || !alive() || !current) return false;

      const normalized = normalizeClienteModel(current);
      if (getClienteId(normalized) !== clienteId) return false;

      const index = items.findIndex(
        (item) => getClienteId(item).toLowerCase() === clienteId.toLowerCase()
      );
      if (index >= 0) {
        items = [
          ...items.slice(0, index),
          normalized,
          ...items.slice(index + 1),
        ];
      }

      return openClientesDetailModal(normalized) !== false;
    } catch (detailError) {
      showToast(safeError(detailError, "No se pudo abrir el cliente."), "error");
      return false;
    } finally {
      if (seq === detailSeq) {
        openingClienteId = "";
        scheduleRender();
      }
    }
  }

  async function ensureLegacyCreateBridge() {
    if (!isBrowser()) return false;
    if (legacyBridgeReady && legacyBridgeHost) return true;

    legacyBridgeHost = document.createElement("div");
    legacyBridgeHost.setAttribute("data-clientes-create-bridge", "true");

    await initLegacyCreateBridge(legacyBridgeHost, {
      ...context,
      host: legacyBridgeHost,
      root: legacyBridgeHost,
      container: legacyBridgeHost,
      canonicalPath: CLIENTES_CANONICAL_PATH,
      routePath: CLIENTES_CANONICAL_PATH,
      path: CLIENTES_CANONICAL_PATH,
    });

    legacyBridgeReady = true;
    return true;
  }

  async function openCreate() {
    if (!isAdmin(context) || creating) return false;
    creating = true;
    scheduleRender();

    try {
      if (!(await ensureLegacyCreateBridge())) return false;
      return (await openLegacyCreate()) !== false;
    } catch (createError) {
      showToast(
        safeError(createError, "No se pudo abrir la creación de cliente."),
        "error"
      );
      return false;
    } finally {
      creating = false;
      scheduleRender();
    }
  }

  function onCreated() {
    if (!alive()) return;
    void refresh();
  }

  function actionInfo(target) {
    if (!isElement(target)) return null;
    const element = target.closest("[data-clientes-action], [data-action]");
    if (!element || !root?.contains(element)) return null;
    return {
      element,
      action: cleanText(
        element.getAttribute("data-clientes-action") ||
        element.getAttribute("data-action"),
        ""
      ),
    };
  }

  function handleClick(event) {
    const info = actionInfo(event.target);
    if (!info?.action) return;

    const { element, action } = info;

    if (
      action === CLIENTES_ACTIONS.OPEN_DETAIL &&
      event.target?.closest?.("a[href], button, input, select, textarea, [data-stop-row='true']") &&
      event.target !== element
    ) {
      return;
    }

    event.preventDefault();

    if ([CLIENTES_ACTIONS.OPEN_DETAIL, "detail", "open-client", "open-cliente"].includes(action)) {
      const row = element.closest("[data-client-id], [data-cliente-id]");
      void openCliente(
        element.getAttribute("data-client-id") ||
        element.getAttribute("data-cliente-id") ||
        row?.getAttribute("data-client-id") ||
        row?.getAttribute("data-cliente-id") ||
        ""
      );
      return;
    }

    if ([CLIENTES_ACTIONS.CREATE_OPEN, "create", "create-client", "create-cliente"].includes(action)) {
      void openCreate();
      return;
    }

    if ([CLIENTES_ACTIONS.EXPORT, "export-csv"].includes(action)) {
      exportCsv();
      return;
    }

    if (action === CLIENTES_ACTIONS.FILTER) {
      void setFilter(element.getAttribute("data-filter") || "all");
      return;
    }

    if (action === CLIENTES_ACTIONS.SORT_TOGGLE) {
      void setSortOrder(
        element.getAttribute("data-next-sort-order") ||
        (sortOrder === "asc" ? "desc" : "asc")
      );
      return;
    }

    if (action === CLIENTES_ACTIONS.CLEAR_SEARCH) {
      void setSearch("");
      return;
    }

    if (action === CLIENTES_ACTIONS.CLEAR_FILTERS) {
      void clearFilters();
      return;
    }

    if (action === CLIENTES_ACTIONS.RETRY_PAGE) {
      void loadMore();
      return;
    }

    if (action === CLIENTES_ACTIONS.REFRESH || action === "retry") {
      void refresh();
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (
      !isElement(target) ||
      !target.matches("[data-clientes-search-input], [data-search-input='clientes']")
    ) {
      return;
    }

    searchDraft = String(target.value ?? "");
    if (event.isComposing || searchComposing) {
      searchComposing = true;
      clearSearchTimer();
      if (!searchContextDirty) invalidateForSearchDraft();
      reflectSearchPendingState();
      return;
    }

    clearSearchTimer();
    invalidateForSearchDraft();
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      void setSearch(searchDraft);
    }, SEARCH_DEBOUNCE_MS);
    reflectSearchPendingState();
  }

  function handleCompositionStart(event) {
    const target = event.target;
    if (
      !isElement(target) ||
      !target.matches("[data-clientes-search-input], [data-search-input='clientes']")
    ) {
      return;
    }

    searchComposing = true;
    searchDraft = String(target.value ?? "");
    clearSearchTimer();
    if (!searchContextDirty) invalidateForSearchDraft();
    reflectSearchPendingState();
  }

  function handleCompositionEnd(event) {
    const target = event.target;
    if (
      !isElement(target) ||
      !target.matches("[data-clientes-search-input], [data-search-input='clientes']")
    ) {
      return;
    }

    searchComposing = false;
    handleInput({ target, isComposing: false });
  }

  function handleKeydown(event) {
    if (!isElement(event.target) || !["Enter", " "].includes(event.key)) return;
    const row = event.target.closest(
      "[data-client-row='true'], [data-cliente-row='true']"
    );
    if (!row || !root?.contains(row)) return;
    if (
      event.target !== row &&
      event.target.closest("a, button, input, select, textarea")
    ) {
      return;
    }
    event.preventDefault();
    void openCliente(
      row.getAttribute("data-client-id") ||
      row.getAttribute("data-cliente-id") ||
      ""
    );
  }

  function attach() {
    if (!root || mounted) return;
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("compositionstart", handleCompositionStart);
    root.addEventListener("compositionend", handleCompositionEnd);
    root.addEventListener("keydown", handleKeydown);
    if (isBrowser()) {
      window.addEventListener("clientes:create:success", onCreated);
    }
    mounted = true;
  }

  function detach() {
    try {
      root?.removeEventListener("click", handleClick);
      root?.removeEventListener("input", handleInput);
      root?.removeEventListener("compositionstart", handleCompositionStart);
      root?.removeEventListener("compositionend", handleCompositionEnd);
      root?.removeEventListener("keydown", handleKeydown);
      if (isBrowser()) {
        window.removeEventListener("clientes:create:success", onCreated);
        clearSearchTimer();
      }
    } catch {
      // noop
    }
    searchTimer = 0;
    searchComposing = false;
    mounted = false;
  }

  async function mount(nextHost = null, nextContext = {}) {
    if (destroyed) return snapshot();
    context = { ...context, ...safeObject(nextContext) };
    root = resolveHost(nextHost, context) || root;
    if (!root) throw new Error("CLIENTES_HOST_NOT_FOUND");
    if (!isClientesRoute(context)) return snapshot();

    attach();
    clearPageState();
    loading = true;
    renderNow();
    await requestPage({ append: false, silent: false });
    return snapshot();
  }

  async function destroy({ clear = true } = {}) {
    if (destroyed) return true;
    destroyed = true;
    requestSeq += 1;
    queryVersion += 1;
    detailSeq += 1;
    abortList("clientes-controller-destroyed");
    cancelFrame(renderFrame);
    disconnectInfiniteObserver();
    freshReconciliationItems = null;
    detach();

    try { closeClientesDetailModal(); } catch { /* noop */ }

    if (legacyBridgeReady) {
      try { await destroyLegacyCreateBridge({ clear: true }); } catch { /* noop */ }
    }
    legacyBridgeReady = false;
    legacyBridgeHost = null;

    if (clear && root) root.replaceChildren();
    if (root && INSTANCES.get(root) === controller) INSTANCES.delete(root);
    if (lastInstance === controller) lastInstance = null;
    return true;
  }

  const controller = {
    id,
    version: CLIENTES_INDEX_VERSION,
    get state() {
      return { ...snapshot(), host: root, context };
    },
    getSnapshot: snapshot,
    getState: snapshot,
    mount,
    render: mount,
    init: mount,
    bootstrap: mount,
    load: () => requestPage({ append: false, silent: false }),
    reload: refresh,
    refresh,
    setSearch,
    setFilter,
    setSortOrder,
    toggleSortOrder: () =>
      setSortOrder(sortOrder === "asc" ? "desc" : "asc"),
    clearSearch: () => setSearch(""),
    clearFilters,
    loadMore,
    openCliente,
    openClient: openCliente,
    openCreate,
    createCliente: openCreate,
    createClient: openCreate,
    exportCsv,
    destroy,
    unmount: destroy,
    dispose: destroy,
  };

  return controller;
}

function ensureController(host = null, context = {}) {
  const resolved = resolveHost(host, context);
  if (resolved) {
    const existing = INSTANCES.get(resolved);
    if (existing && !existing.state.destroyed) {
      lastInstance = existing;
      return existing;
    }
  }

  if (!resolved && lastInstance && !lastInstance.state.destroyed) {
    return lastInstance;
  }

  const controller = createClientesController(resolved, context);
  if (resolved) INSTANCES.set(resolved, controller);
  lastInstance = controller;
  return controller;
}

function parseInitArgs(hostOrContext = null, maybeContext = {}) {
  return isDomNode(hostOrContext)
    ? { host: hostOrContext, context: safeObject(maybeContext) }
    : { host: null, context: safeObject(hostOrContext) };
}

export async function init(hostOrContext = null, maybeContext = {}) {
  const { host, context } = parseInitArgs(hostOrContext, maybeContext);
  return ensureController(host, context).mount(host, context);
}

export const mount = init;
export const bootstrap = init;
export const render = init;

export async function reload() {
  return ensureController().refresh();
}

export async function refresh() {
  return ensureController().refresh();
}

export async function destroy(options = {}) {
  return lastInstance ? lastInstance.destroy(options) : true;
}

export const unmount = destroy;
export const dispose = destroy;

export function getClientes() {
  return cloneItems(ensureController().state.items);
}

export const getItems = getClientes;

export function getClientesCount() {
  return ensureController().state.items.length;
}

export function hasClientes() {
  return getClientesCount() > 0;
}

export function getState() {
  return ensureController().getSnapshot();
}

export const getSnapshot = getState;

export function getClienteById(id = "") {
  return findClienteByIdApi(ensureController().state.items, id);
}

export function setClientesSearch(value = "") {
  return ensureController().setSearch(value);
}

export function setClientesFilter(value = "all") {
  return ensureController().setFilter(value);
}

export function setClientesSortOrder(value = DEFAULT_SORT_ORDER) {
  return ensureController().setSortOrder(value);
}

export function toggleClientesSortOrder() {
  return ensureController().toggleSortOrder();
}

export function loadMoreClientes() {
  return ensureController().loadMore();
}

export async function openCliente(id = "") {
  return ensureController().openCliente(id);
}

export async function openCreate() {
  return ensureController().openCreate();
}

export async function createCliente() {
  return openCreate();
}

export function exportCsv() {
  return ensureController().exportCsv();
}

export const ClientesView = {
  version: CLIENTES_INDEX_VERSION,
  apiVersion: CLIENTES_API_VERSION,
  init,
  mount,
  bootstrap,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,
  getState,
  getSnapshot,
  getClientes,
  getItems,
  getClientesCount,
  hasClientes,
  getClienteById,
  setSearch: setClientesSearch,
  setFilter: setClientesFilter,
  setSortOrder: setClientesSortOrder,
  toggleSortOrder: toggleClientesSortOrder,
  loadMore: loadMoreClientes,
  openCliente,
  openClient: openCliente,
  openCreate,
  createCliente,
  exportCsv,
};

try {
  const global = getGlobalObject();
  global.ClientesView = ClientesView;
  global.OnionClientesView = ClientesView;
  global.OnionClientes = ClientesView;

  if (AppCore?.modules && typeof AppCore.modules === "object") {
    AppCore.modules.Clientes = ClientesView;
    AppCore.modules.clientes = ClientesView;
  }
} catch {
  // noop
}

export default ClientesView;

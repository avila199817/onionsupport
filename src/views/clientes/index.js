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
  "clientes.index.cursor.v10.abort-sequence-server-query";
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
  const output = existing.map((item) => normalizeClienteModel(item));
  const seen = new Set(output.map(getClienteId).filter(Boolean).map((id) => id.toLowerCase()));

  for (const raw of incoming) {
    const item = normalizeClienteModel(raw);
    const id = getClienteId(item);
    const key = id.toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    output.push(item);
  }
  return output;
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
  let totalKnown = false;
  let total = null;
  let lastSyncAt = 0;

  let loading = false;
  let refreshing = false;
  let loadingMore = false;
  let creating = false;
  let error = "";

  let search = "";
  let filter = "all";
  let sortOrder = DEFAULT_SORT_ORDER;

  let openingClienteId = "";
  let requestSeq = 0;
  let queryVersion = 0;
  let activeListController = null;
  let searchTimer = 0;
  let renderFrame = 0;
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
      filter,
      search,
      sortOrder,
      openingClienteId,
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

  function captureSearchFocus() {
    if (!isBrowser() || !root) return null;
    const active = document.activeElement;
    if (
      !active ||
      !root.contains(active) ||
      !active.matches?.("[data-clientes-search-input], [data-search-input='clientes']")
    ) {
      return null;
    }
    return {
      start: Number.isInteger(active.selectionStart) ? active.selectionStart : null,
      end: Number.isInteger(active.selectionEnd) ? active.selectionEnd : null,
    };
  }

  function restoreSearchFocus(state = null) {
    if (!state || !root) return;
    const target = root.querySelector(
      "[data-clientes-search-input], [data-search-input='clientes']"
    );
    if (!target) return;
    try {
      target.focus({ preventScroll: true });
      if (
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

  function renderNow() {
    if (!root || destroyed || !isClientesRoute(context)) return false;
    cancelFrame(renderFrame);
    renderFrame = 0;
    const focusState = captureSearchFocus();
    try {
      root.innerHTML = renderClientesTemplate(payload());
      root.dataset.view = "clientes";
      root.dataset.clientesVersion = CLIENTES_INDEX_VERSION;
      root.dataset.clientesApiVersion = CLIENTES_API_VERSION;
      restoreSearchFocus(focusState);
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
    totalKnown = false;
    total = null;
    lastSyncAt = 0;
    error = "";
  }

  async function requestPage({ append = false, silent = false, cursorOverride = null } = {}) {
    if (!alive()) return snapshot();

    if (append && (loadingMore || hasMore !== true || !nextCursor)) {
      return snapshot();
    }

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
      loadingMore = true;
    } else if (items.length && silent) {
      refreshing = true;
    } else {
      loading = true;
    }
    if (!silent || !items.length) error = "";
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
      items = append
        ? appendUnique(items, pageItems)
        : appendUnique([], pageItems);
      nextCursor = cleanText(response?.nextCursor, "");
      hasMore = response?.hasMore === true && Boolean(nextCursor);
      totalKnown = response?.totalKnown === true;
      total = totalKnown && Number.isFinite(Number(response?.total))
        ? Number(response.total)
        : null;
      lastSyncAt = Number(response?.lastSyncAt || Date.now()) || Date.now();
      error = "";

      emitEvent("clientes:loaded", {
        ...snapshot(),
        appended: append,
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
      error = silent && items.length ? "" : message;
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
    abortList("clientes-query-context-reset");
    requestSeq += 1;
    queryVersion += 1;
    clearPageState();
    return requestPage({ append: false, silent: false });
  }

  async function refresh() {
    if (!alive()) return snapshot();
    return requestPage({ append: false, silent: items.length > 0 });
  }

  async function setSearch(value = "") {
    const next = cleanText(value, "");
    if (next === search) return search;
    search = next;
    await resetAndLoad();
    return search;
  }

  async function setFilter(value = "all") {
    const key = normalizeKey(value || "all");
    const next = ["all", "active", "pending", "blocked"].includes(key)
      ? key
      : "all";
    if (next === filter) return filter;
    filter = next;
    await resetAndLoad();
    return filter;
  }

  async function setSortOrder(value = DEFAULT_SORT_ORDER) {
    const next = ["asc", "ascending", "oldest", "antiguos"].includes(
      normalizeKey(value)
    )
      ? "asc"
      : "desc";
    if (next === sortOrder) return sortOrder;
    sortOrder = next;
    await resetAndLoad();
    return sortOrder;
  }

  async function clearFilters() {
    const changed =
      filter !== "all" ||
      search !== "" ||
      sortOrder !== DEFAULT_SORT_ORDER;
    filter = "all";
    search = "";
    sortOrder = DEFAULT_SORT_ORDER;
    if (changed) await resetAndLoad();
    else scheduleRender();
    return true;
  }

  async function loadMore() {
    if (hasMore !== true || !nextCursor || loadingMore) return snapshot();
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

    if (action === CLIENTES_ACTIONS.LOAD_MORE) {
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

    if (isBrowser()) window.clearTimeout?.(searchTimer);
    const value = target.value;
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      void setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
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
      root?.removeEventListener("keydown", handleKeydown);
      if (isBrowser()) {
        window.removeEventListener("clientes:create:success", onCreated);
        window.clearTimeout?.(searchTimer);
      }
    } catch {
      // noop
    }
    searchTimer = 0;
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

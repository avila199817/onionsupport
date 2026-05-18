/* =========================================================
   Onion Support - Home Bindings
   Archivo: /src/views/home/home.bindings.js

   Responsabilidad:
   - Bind DOM mínimo de Home.
   - Delegar clicks por data-home-action / data-action.
   - Soportar refresh, retry, export, navigate, create,
     open widget, copy id y paginación.
   - Limpiar listeners por scope.
   - Evitar doble binding tras rerender.
   - Busy state durante acciones async.
   - Sin AppCore.
   - Sin eventos globales.
   - Sin window bridges.
   - Sin Router propio.
   - Sin fetch.
   - Sin storage.
   - Sin CSS inline.
   - Sin route aliases legacy.
   - Sin /home.
   - Sin /incidencias/nueva.
========================================================= */

export const HOME_BINDINGS_VERSION = "home.bindings.v1";

const DEFAULT_SCOPE = "view:home";

const ACTION_SELECTOR = [
  "[data-home-action]",
  "[data-action]",
  "[data-quick-action]",
  "[data-route]",
  "[data-href]",
  "[data-widget-id]",
  "[data-widget-key]",
  "[data-entity-id]",
].join(",");

const KEYBOARD_SELECTOR = [
  "[role='button'][data-home-action]",
  "[role='button'][data-action]",
  "[role='button'][data-quick-action]",
  "[tabindex][data-home-action]",
  "[tabindex][data-action]",
  "[tabindex][data-quick-action]",
  "[tabindex][data-route]",
  "[tabindex][data-href]",
].join(",");

const ACTIONS = Object.freeze({
  refresh: new Set(["refresh", "retry", "reload"]),
  export: new Set(["export", "export_csv", "download_csv"]),
  openWidget: new Set(["open_widget", "open_home_widget", "open_block", "open_kpi", "detail"]),
  copyId: new Set(["copy", "copy_id", "copy_widget_id", "copy_entity_id"]),
  navigate: new Set(["navigate", "navigate_home", "go", "open_route"]),
  create: new Set(["create", "new", "create_ticket", "create_incidencia", "new_ticket", "new_incidencia"]),
  pagePrev: new Set(["prev_page", "previous_page"]),
  pageNext: new Set(["next_page"]),
  pageGo: new Set(["page", "go_page"]),
});

const ROUTE_FALLBACKS = Object.freeze({
  go_incidencias: "/incidencias",
  go_tickets: "/incidencias",

  go_facturas: "/facturas",
  go_invoices: "/facturas",

  go_clientes: "/clientes",
  go_clients: "/clientes",

  go_usuarios: "/usuarios",
  go_users: "/usuarios",

  go_cuenta: "/cuenta",
  go_account: "/cuenta",

  go_ajustes: "/ajustes",
  go_settings: "/ajustes",
});

const cleanupsByScope = new Map();
const busyState = new WeakMap();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isElement(value) {
  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.closest === "function");
  }
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value).trim();

  return output || fallback;
}

function safeNumber(value = 0, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

/* =========================================================
   SCOPE / CLEANUP
========================================================= */

function scopeName(scope = DEFAULT_SCOPE) {
  if (typeof scope === "string") {
    return safeText(scope, DEFAULT_SCOPE);
  }

  if (isObject(scope)) {
    return safeText(scope.name || scope.scope || scope.id || scope.key, DEFAULT_SCOPE);
  }

  return DEFAULT_SCOPE;
}

function addCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFunction(cleanup)) return false;

  const name = scopeName(scope);
  const list = cleanupsByScope.get(name) || [];

  list.push(cleanup);
  cleanupsByScope.set(name, list);

  return true;
}

function cleanupScope(scope = DEFAULT_SCOPE) {
  const name = scopeName(scope);
  const list = cleanupsByScope.get(name) || [];

  for (const cleanup of list) {
    try {
      cleanup();
    } catch {
      // noop
    }
  }

  cleanupsByScope.delete(name);

  return true;
}

function listen(scope, target, eventName = "", handler = null, options = undefined) {
  if (!target || !eventName || !isFunction(handler)) {
    return () => {};
  }

  try {
    target.addEventListener(eventName, handler, options);

    const cleanup = () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {
        // noop
      }
    };

    addCleanup(scope, cleanup);

    return cleanup;
  } catch {
    return () => {};
  }
}

/* =========================================================
   DOM
========================================================= */

function getContainer(container = null) {
  if (!isBrowser()) return null;

  if (isElement(container)) return container;

  return (
    document.getElementById("view-container") ||
    document.querySelector("[data-router-view]") ||
    document.querySelector("[data-view-root]") ||
    document
  );
}

function contains(root = null, node = null) {
  if (!root || !node) return false;

  try {
    return root === document || root === node || root.contains(node);
  } catch {
    return false;
  }
}

function closest(event = null, selector = "", root = null) {
  const target = event?.target;

  if (!isElement(target) || !selector) return null;

  let element = null;

  try {
    element = target.closest(selector);
  } catch {
    element = null;
  }

  if (!element) return null;
  if (root && !contains(root, element)) return null;

  return element;
}

function datasetValue(element = null, ...names) {
  if (!element) return "";

  for (const name of names) {
    const cleanName = safeText(name, "");

    if (!cleanName) continue;

    try {
      const value = element.dataset?.[cleanName];

      if (value !== undefined && value !== null && value !== "") {
        return safeText(value, "");
      }
    } catch {
      // noop
    }

    try {
      const attrName = cleanName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const value = element.getAttribute?.(`data-${attrName}`);

      if (value !== undefined && value !== null && value !== "") {
        return safeText(value, "");
      }
    } catch {
      // noop
    }
  }

  return "";
}

function actionName(element = null) {
  return normalizeKey(
    first(
      datasetValue(element, "homeAction"),
      datasetValue(element, "action"),
      datasetValue(element, "quickAction"),
      datasetValue(element, "actionName"),
      ""
    )
  );
}

function routeFromElement(element = null) {
  if (!element) return "";

  const source = element.closest?.("[data-route], [data-href], [href]") || element;

  return safeText(
    first(
      datasetValue(element, "route"),
      datasetValue(element, "href"),
      element.getAttribute?.("href"),

      datasetValue(source, "route"),
      datasetValue(source, "href"),
      source.getAttribute?.("href")
    ),
    ""
  );
}

function widgetIdFromElement(element = null) {
  if (!element) return "";

  const source =
    element.closest?.(
      "[data-widget-id], [data-widget-key], [data-entity-id], [data-ticket-id], [data-incidencia-id], [data-invoice-id], [data-factura-id], [data-key]"
    ) || element;

  return safeText(
    first(
      datasetValue(element, "widgetId"),
      datasetValue(element, "widgetKey"),
      datasetValue(element, "entityId"),
      datasetValue(element, "ticketId"),
      datasetValue(element, "incidenciaId"),
      datasetValue(element, "invoiceId"),
      datasetValue(element, "facturaId"),
      datasetValue(element, "key"),

      datasetValue(source, "widgetId"),
      datasetValue(source, "widgetKey"),
      datasetValue(source, "entityId"),
      datasetValue(source, "ticketId"),
      datasetValue(source, "incidenciaId"),
      datasetValue(source, "invoiceId"),
      datasetValue(source, "facturaId"),
      datasetValue(source, "key")
    ),
    ""
  );
}

function payloadFromElement(element = null) {
  const raw = safeText(
    first(
      datasetValue(element, "payload"),
      datasetValue(element, "json"),
      datasetValue(element, "data"),
      ""
    ),
    ""
  );

  if (!raw) return {};

  try {
    return safeObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function filenameFromElement(element = null) {
  return safeText(
    first(
      datasetValue(element, "filename"),
      datasetValue(element, "fileName"),
      datasetValue(element, "exportFilename"),
      ""
    ),
    ""
  );
}

function exportModeFromElement(element = null) {
  return normalizeKey(
    first(
      datasetValue(element, "exportMode"),
      datasetValue(element, "mode"),
      datasetValue(element, "collection"),
      "widgets"
    )
  );
}

function pageFromElement(element = null) {
  return Math.max(
    1,
    safeNumber(
      first(
        datasetValue(element, "page"),
        element?.getAttribute?.("aria-label")?.match?.(/\d+/)?.[0],
        1
      ),
      1
    )
  );
}

/* =========================================================
   TARGET GUARDS / BUSY
========================================================= */

function isModifiedClick(event = null) {
  return Boolean(
    event?.metaKey ||
      event?.ctrlKey ||
      event?.shiftKey ||
      event?.altKey ||
      event?.button === 1
  );
}

function isDisabled(element = null) {
  if (!element) return false;

  return Boolean(
    element.disabled === true ||
      element.getAttribute?.("aria-disabled") === "true" ||
      element.getAttribute?.("data-disabled") === "true" ||
      element.closest?.("[disabled]") ||
      element.closest?.("[aria-disabled='true']") ||
      element.closest?.("[data-disabled='true']")
  );
}

function isHidden(element = null) {
  if (!element) return false;

  return Boolean(
    element.hidden === true ||
      element.getAttribute?.("aria-hidden") === "true" ||
      element.closest?.("[hidden]") ||
      element.closest?.("[inert]") ||
      element.closest?.("[aria-hidden='true']")
  );
}

function shouldIgnore(element = null) {
  return Boolean(!element || isDisabled(element) || isHidden(element));
}

function setBusy(element = null, busy = false) {
  if (!element) return false;

  const value = Boolean(busy);

  if (value && !busyState.has(element)) {
    busyState.set(element, {
      disabled: "disabled" in element ? Boolean(element.disabled) : null,
      ariaBusy: element.getAttribute?.("aria-busy"),
    });
  }

  const previous = busyState.get(element) || {};

  try {
    if (value) {
      element.setAttribute("aria-busy", "true");
    } else if (previous.ariaBusy === null || previous.ariaBusy === undefined) {
      element.removeAttribute("aria-busy");
    } else {
      element.setAttribute("aria-busy", previous.ariaBusy);
    }
  } catch {
    // noop
  }

  try {
    element.classList.toggle("is-busy", value);
    element.classList.toggle("is-loading", value);
    element.classList.toggle("is-processing", value);
  } catch {
    // noop
  }

  try {
    if (
      "disabled" in element &&
      ["BUTTON", "INPUT", "SELECT"].includes(element.tagName)
    ) {
      element.disabled = value ? true : Boolean(previous.disabled);
    }
  } catch {
    // noop
  }

  if (!value) {
    try {
      busyState.delete(element);
    } catch {
      // noop
    }
  }

  return true;
}

async function withBusy(element = null, callback = null) {
  if (!isFunction(callback)) return null;

  if (element?.getAttribute?.("aria-busy") === "true") {
    return false;
  }

  setBusy(element, true);

  try {
    return await callback();
  } finally {
    setBusy(element, false);
  }
}

/* =========================================================
   ROUTES
========================================================= */

function normalizeInternalRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw || raw === "#") return "";

  const lower = raw.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      if (!isBrowser()) return "";

      const url = new URL(raw, window.location.origin);

      if (url.origin !== window.location.origin) return "";

      return normalizeInternalRoute(`${url.pathname}${url.search || ""}${url.hash || ""}`);
    } catch {
      return "";
    }
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`;

  const hashIndex = normalized.indexOf("#");
  const hash = hashIndex >= 0 ? normalized.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;

  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  let cleanPath = path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!cleanPath.startsWith("/")) cleanPath = `/${cleanPath}`;

  if (cleanPath.length > 1) {
    cleanPath = cleanPath.replace(/\/+$/g, "") || "/";
  }

  /*
    /home no existe en la SPA nueva.
    Se rechaza para no perpetuar aliases legacy.
  */
  if (cleanPath === "/home") return "";

  return `${cleanPath}${query}${hash}`;
}

function routeFromAction(action = "") {
  const key = normalizeKey(action);

  return ROUTE_FALLBACKS[key] || "";
}

/* =========================================================
   ACTION RESOLUTION
========================================================= */

function resolveKind(element = null) {
  const action = actionName(element);

  if (ACTIONS.refresh.has(action)) return "refresh";
  if (ACTIONS.export.has(action)) return "export";
  if (ACTIONS.openWidget.has(action)) return "open-widget";
  if (ACTIONS.copyId.has(action)) return "copy-id";
  if (ACTIONS.create.has(action)) return "create";
  if (ACTIONS.pagePrev.has(action)) return "page-prev";
  if (ACTIONS.pageNext.has(action)) return "page-next";
  if (ACTIONS.pageGo.has(action)) return "page-go";
  if (ACTIONS.navigate.has(action)) return "navigate";

  if (!action && widgetIdFromElement(element) && !normalizeInternalRoute(routeFromElement(element))) {
    return "open-widget";
  }

  if (normalizeInternalRoute(routeFromElement(element)) || routeFromAction(action)) {
    return "navigate";
  }

  return "";
}

/* =========================================================
   HANDLERS
========================================================= */

async function handleRefresh(element, api = {}) {
  return withBusy(element, async () => {
    if (isFunction(api.reload)) {
      return api.reload({
        force: true,
        asRefresh: true,
        silent: false,
      });
    }

    if (isFunction(api.refresh)) {
      return api.refresh({
        force: true,
        asRefresh: true,
        silent: false,
      });
    }

    if (isFunction(api.loadHomeDashboard)) {
      return api.loadHomeDashboard({
        force: true,
        returnStaleOnError: true,
      });
    }

    return false;
  });
}

async function handleExport(element, api = {}) {
  if (!isFunction(api.exportHomeCsvAction)) return false;

  return withBusy(element, () =>
    api.exportHomeCsvAction({
      filename: filenameFromElement(element) || undefined,
      mode: exportModeFromElement(element) || "widgets",
      silent: false,
    })
  );
}

async function handleNavigate(element, api = {}) {
  const action = actionName(element);
  const route = normalizeInternalRoute(routeFromElement(element) || routeFromAction(action));
  const payload = payloadFromElement(element);

  if (!route || !isFunction(api.navigateFromHomeAction)) return false;

  return withBusy(element, () =>
    api.navigateFromHomeAction({
      route,
      payload,
      silent: false,
    })
  );
}

async function handleOpenWidget(element, api = {}) {
  const widgetId = widgetIdFromElement(element);
  const payload = payloadFromElement(element);
  const route = normalizeInternalRoute(routeFromElement(element));

  if (!widgetId && route) {
    return handleNavigate(element, api);
  }

  if (!widgetId || !isFunction(api.openHomeWidgetAction)) return false;

  return withBusy(element, () =>
    api.openHomeWidgetAction({
      widgetId,
      payload,
      navigate: Boolean(route),
      silent: false,
    })
  );
}

async function handleCopyId(element, api = {}) {
  const widgetId = widgetIdFromElement(element);

  if (!widgetId || !isFunction(api.copyHomeWidgetIdAction)) return false;

  return withBusy(element, () =>
    api.copyHomeWidgetIdAction({
      widgetId,
      silent: false,
    })
  );
}

async function handleCreate(element, api = {}) {
  const payload = payloadFromElement(element);
  const route = normalizeInternalRoute(routeFromElement(element)) || "/incidencias";

  return withBusy(element, async () => {
    if (isFunction(api.createFromHomeAction)) {
      return api.createFromHomeAction({
        route,
        payload,
        draft: payload,
        silent: false,
      });
    }

    if (isFunction(api.runHomeQuickAction)) {
      return api.runHomeQuickAction({
        action: "create_incidencia",
        route,
        payload,
        silent: false,
      });
    }

    if (isFunction(api.navigateFromHomeAction)) {
      return api.navigateFromHomeAction({
        route,
        payload,
        silent: false,
      });
    }

    return false;
  });
}

async function handleQuick(element, api = {}) {
  const action = actionName(element);
  const payload = payloadFromElement(element);
  const route = normalizeInternalRoute(routeFromElement(element) || routeFromAction(action));

  if (route && isFunction(api.navigateFromHomeAction)) {
    return handleNavigate(element, api);
  }

  if (!isFunction(api.runHomeQuickAction)) return false;

  return withBusy(element, () =>
    api.runHomeQuickAction({
      action,
      route,
      payload,
      silent: false,
    })
  );
}

async function handlePage(kind = "", element = null, api = {}) {
  const page = pageFromElement(element);

  return withBusy(element, async () => {
    if (kind === "page-prev" && isFunction(api.goPrevPage)) {
      return api.goPrevPage();
    }

    if (kind === "page-next" && isFunction(api.goNextPage)) {
      return api.goNextPage();
    }

    if (isFunction(api.goToPage)) {
      return api.goToPage(page);
    }

    if (isFunction(api.runHomeQuickAction)) {
      return api.runHomeQuickAction({
        action: kind,
        payload: {
          page,
        },
        silent: true,
      });
    }

    return false;
  });
}

/* =========================================================
   MAIN DISPATCH
========================================================= */

async function dispatchAction(event = null, element = null, api = {}) {
  const kind = resolveKind(element);

  if (!kind) return false;

  if (kind === "navigate" && isModifiedClick(event)) {
    return false;
  }

  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (kind === "refresh") return handleRefresh(element, api);
  if (kind === "export") return handleExport(element, api);
  if (kind === "navigate") return handleNavigate(element, api);
  if (kind === "open-widget") return handleOpenWidget(element, api);
  if (kind === "copy-id") return handleCopyId(element, api);
  if (kind === "create") return handleCreate(element, api);
  if (kind === "page-prev") return handlePage(kind, element, api);
  if (kind === "page-next") return handlePage(kind, element, api);
  if (kind === "page-go") return handlePage(kind, element, api);

  return handleQuick(element, api);
}

/* =========================================================
   BIND
========================================================= */

export function bindHomeEvents({
  scope = DEFAULT_SCOPE,
  container = null,

  reload,
  refresh,
  loadHomeDashboard,

  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  createFromHomeAction,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,
} = {}) {
  if (!isBrowser()) return () => {};

  const name = scopeName(scope);
  const root = getContainer(container);

  cleanupScope(name);

  const api = {
    reload,
    refresh,
    loadHomeDashboard,

    exportHomeCsvAction,
    navigateFromHomeAction,
    runHomeQuickAction,
    openHomeWidgetAction,
    copyHomeWidgetIdAction,
    createFromHomeAction,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,
  };

  listen(name, root, "click", async (event) => {
    if (event.defaultPrevented) return;

    const element = closest(event, ACTION_SELECTOR, root);

    if (!element) return;

    if (shouldIgnore(element)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    await dispatchAction(event, element, api);
  });

  listen(name, root, "keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const target = event.target;

    if (!isElement(target)) return;

    const nativeTag = String(target.tagName || "").toUpperCase();

    if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(nativeTag)) {
      return;
    }

    const element = target.closest?.(KEYBOARD_SELECTOR);

    if (!element || !contains(root, element) || shouldIgnore(element)) return;

    event.preventDefault();

    try {
      element.click();
    } catch {
      // noop
    }
  });

  return () => cleanupScope(name);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeBindingsSnapshot(scope = DEFAULT_SCOPE) {
  const name = scopeName(scope);

  return {
    version: HOME_BINDINGS_VERSION,
    source: "views.home.bindings",

    scope: name,
    browser: isBrowser(),

    cleanupCount: cleanupsByScope.get(name)?.length || 0,

    hasContainer: Boolean(getContainer()),

    actions: {
      refresh: [...ACTIONS.refresh],
      export: [...ACTIONS.export],
      openWidget: [...ACTIONS.openWidget],
      copyId: [...ACTIONS.copyId],
      navigate: [...ACTIONS.navigate],
      create: [...ACTIONS.create],
      pagePrev: [...ACTIONS.pagePrev],
      pageNext: [...ACTIONS.pageNext],
      pageGo: [...ACTIONS.pageGo],
    },

    policy: {
      delegatedOnly: true,
      noAppCore: true,
      noEvents: true,
      noWindowBridge: true,
      noStorage: true,
      noFetch: true,
      noHomeAlias: true,
      noCreateRoute: true,
    },

    at: nowIso(),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeBindings = Object.freeze({
  version: HOME_BINDINGS_VERSION,

  bindHomeEvents,

  getHomeBindingsSnapshot,
  getDebugSnapshot: getHomeBindingsSnapshot,
});

export default HomeBindings;

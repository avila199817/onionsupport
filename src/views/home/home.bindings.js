/* =========================================================
   Onion Support - Home Bindings
   Archivo: /src/views/home/home.bindings.js

   Responsabilidad:
   - Bind DOM mínimo de Home.
   - Delegar clicks por data-home-action / data-action.
   - Soportar refresh, retry, export, navigate, create,
     copy id y paginación.
   - Limpiar listeners por scope.
   - Evitar doble binding tras rerender.
   - Busy state durante acciones async.
   - Rutas base desde core/config.js.
   - Bloqueos de rutas desde core/config.js.
   - Sin AppCore.
   - Sin eventos globales.
   - Sin window bridges.
   - Sin Router propio.
   - Sin fetch.
   - Sin storage.
   - Sin CSS inline.
   - Sin route aliases legacy.
   - Sin document fallback.
   - Sin rutas opcionales inventadas.
   - Sin /home.
   - Sin /incidencias/nueva.
========================================================= */

import {
  ROUTES as CORE_ROUTES,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

export const HOME_BINDINGS_VERSION = "home.bindings.v6";

const DEFAULT_SCOPE = "view:home";

const ACTIONS = Object.freeze({
  refresh: new Set(["refresh", "retry"]),
  exportCsv: new Set(["export_csv"]),

  copyId: new Set(["copy_widget_id"]),

  navigate: new Set(["navigate_home"]),
  create: new Set(["create_incidencia"]),

  pagePrev: new Set(["prev_page"]),
  pageNext: new Set(["next_page"]),
  pageGo: new Set(["page"]),
});

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payloadRaw",
  "response",
  "body",
]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|jwt|bearer|refresh|access_token|accessToken|id_token|idToken|otp|totp|mfa|2fa|backupCode|backup_code|sessionId|session_id/i;

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i;

const ACTION_SELECTOR = [
  "[data-home-action]",
  "[data-action]",
  "[data-quick-action]",
  "[data-route]",
  "[data-href]",
  "a[href]",
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

const cleanupsByScope = new Map();
const rootsByScope = new Map();
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

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeNumber(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const number = Number(String(value).replace(",", "."));
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

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function isSensitiveKey(key = "") {
  return SENSITIVE_KEY_RE.test(String(key || ""));
}

function sanitizePayloadValue(value, keyHint = "") {
  if (RAW_KEYS.has(keyHint)) return undefined;
  if (isSensitiveKey(keyHint)) return undefined;

  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePayloadValue(item))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (RAW_KEYS.has(key)) continue;
      if (isSensitiveKey(key)) continue;

      const clean = sanitizePayloadValue(item, key);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  return value;
}

function sanitizePayload(value = {}) {
  return safeObject(sanitizePayloadValue(value), {});
}

/* =========================================================
   ROUTES
========================================================= */

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function routeInput(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  try {
    return configRoutePathFromUrlLike(raw) || "";
  } catch {
    if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
    if (raw.startsWith("#/")) return raw.slice(1) || "/";
    return raw;
  }
}

function routeSuffix(value = "") {
  const raw = safeText(value, "");

  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";

  const queryIndex = beforeHash.indexOf("?");
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";

  if (hasSensitiveQuery(search) || hasSensitiveQuery(hash)) return "";

  return `${search}${hash}`;
}

function routePathOnly(value = "") {
  const input = routeInput(value);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = input.split("?")[0].split("#")[0] || "";

  try {
    return configNormalizeRoutePath(pathOnly) || "";
  } catch {
    let path = pathOnly.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || "/";
    }

    return path || "";
  }
}

function isBlockedRoute(value = "") {
  const path = routePathOnly(value);
  const lower = path.toLowerCase();

  if (!path) return true;

  if (
    lower === "/incidencias/nueva" ||
    lower.startsWith("/incidencias/nueva/")
  ) {
    return true;
  }

  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return Boolean(
      lower === "/home" ||
        lower === "/403" ||
        lower === "/404" ||
        lower === "/2fa" ||
        lower === "/mfa" ||
        lower === "/otp" ||
        lower.startsWith("/2fa/") ||
        lower.startsWith("/mfa/") ||
        lower.startsWith("/otp/")
    );
  }
}

function normalizeInternalRoute(route = "") {
  const input = routeInput(route);

  if (!input) return "";
  if (!input.startsWith("/")) return "";
  if (input.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
  if (/[\r\n\t\\]/.test(input)) return "";
  if (hasSensitiveQuery(input)) return "";

  const pathOnly = routePathOnly(input);

  if (!pathOnly) return "";
  if (isBlockedRoute(pathOnly)) return "";

  return `${pathOnly}${routeSuffix(input)}`;
}

function configRoute(route = "", fallback = "") {
  return normalizeInternalRoute(route) || normalizeInternalRoute(fallback);
}

const INCIDENCIAS_ROUTE = configRoute(CORE_ROUTES?.incidencias, "/incidencias");

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
  rootsByScope.delete(name);

  return true;
}

function addCleanup(scope = DEFAULT_SCOPE, cleanup = null) {
  if (!isFunction(cleanup)) return false;

  const name = scopeName(scope);
  const list = cleanupsByScope.get(name) || [];

  list.push(cleanup);
  cleanupsByScope.set(name, list);

  return true;
}

function listen(scope, target, eventName = "", handler = null, options = undefined) {
  if (!target || !eventName || !isFunction(handler)) {
    return () => false;
  }

  try {
    target.addEventListener(eventName, handler, options);

    const cleanup = () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {
        // noop
      }

      return true;
    };

    addCleanup(scope, cleanup);

    return cleanup;
  } catch {
    return () => false;
  }
}

/* =========================================================
   DOM
========================================================= */

function getContainer(container = null) {
  if (!isBrowser()) return null;
  return isElement(container) ? container : null;
}

function contains(root = null, node = null) {
  if (!root || !node) return false;

  try {
    return root === node || root.contains(node);
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

  return safeText(
    first(
      datasetValue(element, "route"),
      datasetValue(element, "href"),
      element.getAttribute?.("href"),
      ""
    ),
    ""
  );
}

function idFromElement(element = null) {
  if (!element) return "";

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
      ""
    ),
    ""
  );
}

function payloadFromElement(element = null) {
  const raw = safeText(
    first(
      datasetValue(element, "payload"),
      datasetValue(element, "json"),
      ""
    ),
    ""
  );

  if (!raw) return {};

  try {
    return sanitizePayload(JSON.parse(raw));
  } catch {
    return {};
  }
}

function filenameFromElement(element = null) {
  const value = safeText(
    first(
      datasetValue(element, "filename"),
      datasetValue(element, "fileName"),
      datasetValue(element, "exportFilename"),
      "home-incidencias.csv"
    ),
    "home-incidencias.csv"
  );

  return (
    value
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 160) || "home-incidencias.csv"
  );
}

function exportModeFromElement(element = null) {
  return normalizeKey(
    first(
      datasetValue(element, "exportMode"),
      datasetValue(element, "mode"),
      datasetValue(element, "collection"),
      "tickets"
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
   GUARDS / BUSY
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
      ["BUTTON", "INPUT", "SELECT"].includes(String(element.tagName || "").toUpperCase())
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

function elementHasBlockedRoute(element = null) {
  const raw = routeFromElement(element);

  if (!raw) return false;

  return !normalizeInternalRoute(raw);
}

/* =========================================================
   ACTION RESOLUTION
========================================================= */

function resolveKind(element = null) {
  const action = actionName(element);
  const route = normalizeInternalRoute(routeFromElement(element));

  if (ACTIONS.refresh.has(action)) return "refresh";
  if (ACTIONS.exportCsv.has(action)) return "export";
  if (ACTIONS.copyId.has(action)) return "copy-id";
  if (ACTIONS.create.has(action)) return "create";
  if (ACTIONS.pagePrev.has(action)) return "page-prev";
  if (ACTIONS.pageNext.has(action)) return "page-next";
  if (ACTIONS.pageGo.has(action)) return "page-go";
  if (ACTIONS.navigate.has(action)) return "navigate";

  if (route) return "navigate";
  if (action) return "quick";

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
      filename: filenameFromElement(element),
      mode: exportModeFromElement(element) || "tickets",
      silent: false,
    })
  );
}

async function handleNavigate(element, api = {}) {
  const route = normalizeInternalRoute(routeFromElement(element));
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

async function handleCopyId(element, api = {}) {
  const id = idFromElement(element);

  if (!id || !isFunction(api.copyHomeWidgetIdAction)) return false;

  return withBusy(element, () =>
    api.copyHomeWidgetIdAction({
      widgetId: id,
      silent: false,
    })
  );
}

async function handleCreate(element, api = {}) {
  const payload = payloadFromElement(element);
  const route = normalizeInternalRoute(routeFromElement(element)) || INCIDENCIAS_ROUTE;

  if (!route) return false;

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

    return false;
  });
}

async function handleQuick(element, api = {}) {
  const action = actionName(element);
  const route = normalizeInternalRoute(routeFromElement(element));
  const payload = payloadFromElement(element);

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

  try {
    if (kind === "refresh") return handleRefresh(element, api);
    if (kind === "export") return handleExport(element, api);
    if (kind === "navigate") return handleNavigate(element, api);
    if (kind === "copy-id") return handleCopyId(element, api);
    if (kind === "create") return handleCreate(element, api);
    if (kind === "page-prev") return handlePage(kind, element, api);
    if (kind === "page-next") return handlePage(kind, element, api);
    if (kind === "page-go") return handlePage(kind, element, api);

    return handleQuick(element, api);
  } catch {
    return false;
  }
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
  copyHomeWidgetIdAction,
  createFromHomeAction,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,
} = {}) {
  if (!isBrowser()) return () => false;

  const name = scopeName(scope);
  const root = getContainer(container);

  cleanupScope(name);

  if (!isElement(root)) {
    return () => false;
  }

  rootsByScope.set(name, root);

  const api = {
    reload,
    refresh,
    loadHomeDashboard,

    exportHomeCsvAction,
    navigateFromHomeAction,
    runHomeQuickAction,
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

    if (shouldIgnore(element) || elementHasBlockedRoute(element)) {
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
    if (elementHasBlockedRoute(element)) return;

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
  const root = rootsByScope.get(name) || null;

  return {
    version: HOME_BINDINGS_VERSION,
    source: "views.home.bindings",

    scope: name,
    browser: isBrowser(),

    cleanupCount: cleanupsByScope.get(name)?.length || 0,
    hasContainer: Boolean(root),
    containerConnected: Boolean(root?.isConnected),

    actions: {
      refresh: [...ACTIONS.refresh],
      exportCsv: [...ACTIONS.exportCsv],
      copyId: [...ACTIONS.copyId],
      navigate: [...ACTIONS.navigate],
      create: [...ACTIONS.create],
      pagePrev: [...ACTIONS.pagePrev],
      pageNext: [...ACTIONS.pageNext],
      pageGo: [...ACTIONS.pageGo],
    },

    routes: {
      incidencias: INCIDENCIAS_ROUTE,
    },

    policy: {
      delegatedDomEventsOnly: true,

      noAppCore: true,
      noGlobalEvents: true,
      noWindowBridge: true,
      noRouterOwn: true,
      noFetch: true,
      noStorage: true,
      noCssInline: true,

      noDocumentFallback: true,
      noRouteAliasesLegacy: true,
      noHomeAlias: true,
      noCreateRouteAlias: true,
      noInventedOptionalRoutes: true,

      rejectsSensitiveRoutes: true,
      sanitizesPayload: true,

      configRoutes: true,
      configBlockedRoutes: true,

      noPassiveRowActions: true,
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

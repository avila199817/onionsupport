/* =========================================================
   Onion Support - Home Bindings
   Archivo: /src/views/home/home.bindings.js

   Responsabilidad:
   - Bind DOM mínimo de Home.
   - Delegar clicks sólo por data-home-action / data-action.
   - Acciones alineadas con home.template.js actual:
     retry, navigate_home, create_incidencia,
     open_ticket_detail, close_ticket_detail, page_prev, page_next.
   - Conectar open_ticket_detail / close_ticket_detail con statePatch.
   - Solicitar rerender tras cambios de estado si HomeView pasa callback.
   - Limpiar listeners por scope.
   - Evitar doble binding tras rerender.
   - Mantener binding idempotente si el root no cambia.
   - Actualizar callbacks/API aunque el root no cambie.
   - Busy state durante acciones async.
   - Rutas base desde core/config.js.
   - Bloqueos de rutas desde core/config.js.
   - Sin acción refresh manual.
   - Sin acción export CSV.
   - Sin quick actions legacy.
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
   - Sin health/server/ready/ping.
========================================================= */

import {
  ROUTES as CORE_ROUTES,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

export const HOME_BINDINGS_VERSION = "home.bindings.v11.template-contract";

const DEFAULT_SCOPE = "view:home";

const ACTIONS = Object.freeze({
  retry: new Set([
    "retry",
  ]),

  navigate: new Set([
    "navigate_home",
  ]),

  create: new Set([
    "create_incidencia",
  ]),

  ticketOpen: new Set([
    "open_ticket_detail",
  ]),

  ticketClose: new Set([
    "close_ticket_detail",
  ]),

  pagePrev: new Set([
    "page_prev",
  ]),

  pageNext: new Set([
    "page_next",
  ]),
});

const ACTION_RESULT_TYPES = Object.freeze({
  STATE_PATCH: "home_state_patch",
});

const RAW_KEYS = new Set([
  "raw",
  "data",
  "payloadRaw",
  "response",
  "body",
  "request",
  "headers",
  "config",
]);

const COSMOS_META_KEYS = new Set([
  "_id",
  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const SENSITIVE_KEY_PARTS = Object.freeze([
  "token",
  "authorization",
  "cookie",
  "password",
  "passwd",
  "pwd",
  "secret",
  "credential",
  "jwt",
  "bearer",
  "refresh",
  "apikey",
  "privatekey",
  "connectionstring",
  "sas",
  "otp",
  "totp",
  "mfa",
  "twofa",
  "backupcode",
  "sessionid",
  "email",
  "correo",
  "mail",
  "phone",
  "telefono",
  "address",
  "direccion",
  "nif",
  "dni",
  "iban",
  "bank",
  "cuenta",
  "account",
  "useragent",
]);

const SENSITIVE_KEY_EXACT = new Set([
  "session",
  "ip",
  "ipraw",
]);

const SENSITIVE_QUERY_RE =
  /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i;

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const EMAIL_GLOBAL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gi;
const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

const JWT_TEST_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;

const ACTION_SELECTOR = [
  "[data-home-action]",
  "[data-action]",
].join(",");

const KEYBOARD_SELECTOR = [
  "[role='button'][data-home-action]",
  "[role='button'][data-action]",
  "[tabindex][data-home-action]",
  "[tabindex][data-action]",
].join(",");

const TICKET_ROW_SELECTOR =
  "[data-ticket-row], [data-ticket-id], [data-incidencia-id]";

const TICKET_MODAL_SELECTOR = "[data-home-modal='ticket-detail']";

const cleanupsByScope = new Map();
const rootsByScope = new Map();
const apiByScope = new Map();
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

function normalizeSensitiveKey(value = "") {
  return normalizeKey(value).replace(/_/g, "");
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
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(JWT_RE, "***")
    .replace(EMAIL_GLOBAL_RE, "");
}

function isSensitiveKey(key = "") {
  const clean = normalizeSensitiveKey(key);

  if (!clean) return false;
  if (SENSITIVE_KEY_EXACT.has(clean)) return true;

  return SENSITIVE_KEY_PARTS.some((part) => clean.includes(part));
}

function isRawKey(key = "") {
  return RAW_KEYS.has(String(key || ""));
}

function isCosmosMetaKey(key = "") {
  return COSMOS_META_KEYS.has(String(key || ""));
}

function isEmailLike(value = "") {
  const text = safeText(value, "");
  return Boolean(text && EMAIL_RE.test(text));
}

function hasSensitiveQuery(value = "") {
  return SENSITIVE_QUERY_RE.test(String(value || ""));
}

function hasJwt(value = "") {
  return JWT_TEST_RE.test(String(value || ""));
}

function sanitizePayloadValue(value, keyHint = "") {
  if (isRawKey(keyHint)) return undefined;
  if (isCosmosMetaKey(keyHint)) return undefined;
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
      if (isRawKey(key)) continue;
      if (isCosmosMetaKey(key)) continue;
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
   SAFE IDS
========================================================= */

function safePublicId(value = "") {
  const text = safeText(value, "");

  if (!text) return "";
  if (isEmailLike(text)) return "";
  if (hasSensitiveQuery(text)) return "";
  if (/Bearer\s+/i.test(text)) return "";
  if (hasJwt(text)) return "";

  return redact(text).slice(0, 240);
}

/* =========================================================
   ROUTES
========================================================= */

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

  if (!path) return true;

  try {
    return configIsBlockedRoutePath(path) === true;
  } catch {
    return true;
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

  cleanupsByScope.delete(name);
  rootsByScope.delete(name);
  apiByScope.delete(name);

  for (const cleanup of list) {
    try {
      cleanup();
    } catch {
      // noop
    }
  }

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

function getCleanupCount(scope = DEFAULT_SCOPE) {
  const name = scopeName(scope);
  return cleanupsByScope.get(name)?.length || 0;
}

function scopeIsBoundToRoot(scope = DEFAULT_SCOPE, root = null) {
  const name = scopeName(scope);

  return Boolean(
    isElement(root) &&
      rootsByScope.get(name) === root &&
      getCleanupCount(name) > 0 &&
      root.isConnected !== false
  );
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
   API CONTEXT
========================================================= */

function buildApi(callbacks = {}) {
  return {
    reload: callbacks.reload,
    refresh: callbacks.refresh,
    loadHomeDashboard: callbacks.loadHomeDashboard,

    navigateFromHomeAction: callbacks.navigateFromHomeAction,
    createFromHomeAction: callbacks.createFromHomeAction,

    openHomeTicketDetailAction: callbacks.openHomeTicketDetailAction,
    closeHomeTicketDetailAction: callbacks.closeHomeTicketDetailAction,
    reduceHomeActionState: callbacks.reduceHomeActionState,

    getState: callbacks.getState,
    setState: callbacks.setState,
    patchState: callbacks.patchState,
    updateState: callbacks.updateState,

    requestRender: callbacks.requestRender,
    requestRerender: callbacks.requestRerender,
    rerender: callbacks.rerender,
    render: callbacks.render,
    onRenderRequest: callbacks.onRenderRequest,
    onRenderRequested: callbacks.onRenderRequested,

    onStatePatch: callbacks.onStatePatch,
    onActionResult: callbacks.onActionResult,
    onHomeActionResult: callbacks.onHomeActionResult,
    onTicketDetailOpen: callbacks.onTicketDetailOpen,
    onIncidenciaDetailOpen: callbacks.onIncidenciaDetailOpen,
    onTicketDetailClose: callbacks.onTicketDetailClose,
    onIncidenciaDetailClose: callbacks.onIncidenciaDetailClose,

    goPrevPage: callbacks.goPrevPage,
    goNextPage: callbacks.goNextPage,
  };
}

function getBoundApi(scope = DEFAULT_SCOPE) {
  return apiByScope.get(scopeName(scope)) || {};
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

function closestElement(element = null, selector = "", root = null) {
  if (!isElement(element) || !selector) return null;

  let found = null;

  try {
    found = element.closest(selector);
  } catch {
    found = null;
  }

  if (!found) return null;
  if (root && !contains(root, found)) return null;

  return found;
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

function ticketIdFromElement(element = null, root = null) {
  if (!element) return "";

  const row = closestElement(element, TICKET_ROW_SELECTOR, root);

  return safePublicId(
    first(
      datasetValue(element, "ticketId"),
      datasetValue(element, "incidenciaId"),
      datasetValue(row, "ticketId"),
      datasetValue(row, "incidenciaId"),
      ""
    )
  );
}

function idFromElement(element = null, root = null) {
  if (!element) return "";

  const row = closestElement(element, TICKET_ROW_SELECTOR, root);

  return safePublicId(
    first(
      datasetValue(element, "widgetId"),
      datasetValue(element, "widgetKey"),
      datasetValue(element, "ticketId"),
      datasetValue(element, "incidenciaId"),
      datasetValue(element, "invoiceId"),
      datasetValue(element, "facturaId"),
      datasetValue(element, "entityId"),
      datasetValue(element, "key"),
      datasetValue(row, "ticketId"),
      datasetValue(row, "incidenciaId"),
      datasetValue(row, "entityId"),
      ""
    )
  );
}

function payloadFromElement(element = null, root = null) {
  const raw = safeText(
    first(
      datasetValue(element, "payload"),
      datasetValue(element, "json"),
      ""
    ),
    ""
  );

  let parsed = {};

  if (raw) {
    try {
      parsed = sanitizePayload(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  const ticketId = ticketIdFromElement(element, root);
  const id = idFromElement(element, root);

  return sanitizePayload({
    ...parsed,

    widgetId: first(parsed.widgetId, datasetValue(element, "widgetId"), ""),
    widgetKey: first(parsed.widgetKey, datasetValue(element, "widgetKey"), ""),

    ticketId: first(parsed.ticketId, ticketId, ""),
    incidenciaId: first(parsed.incidenciaId, ticketId, ""),

    invoiceId: first(parsed.invoiceId, datasetValue(element, "invoiceId"), ""),
    facturaId: first(parsed.facturaId, datasetValue(element, "facturaId"), ""),

    entityId: first(parsed.entityId, datasetValue(element, "entityId"), id, ""),
    id: first(parsed.id, id, ""),
  });
}

function hasTicketModal(root = null) {
  if (!isElement(root)) return false;

  try {
    return Boolean(root.querySelector(TICKET_MODAL_SELECTOR));
  } catch {
    return false;
  }
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
   STATE PATCH / RENDER CALLBACKS
========================================================= */

async function callFirstAvailable(callbacks = [], ...args) {
  for (const callback of callbacks) {
    if (!isFunction(callback)) continue;

    try {
      const result = await callback(...args);

      if (result !== false) return true;
    } catch {
      // probar siguiente callback
    }
  }

  return false;
}

async function requestHomeRender(api = {}, result = {}) {
  return callFirstAvailable(
    [
      api.requestRender,
      api.requestRerender,
      api.rerender,
      api.render,
      api.onRenderRequest,
      api.onRenderRequested,
    ],
    result
  );
}

async function applyStatePatch(patch = {}, result = {}, api = {}) {
  const cleanPatch = sanitizePayload(patch);

  if (!Object.keys(cleanPatch).length) return false;

  const appliedBySpecificPatchHandler = await callFirstAvailable(
    [
      api.onStatePatch,
      api.patchState,
      api.updateState,
    ],
    cleanPatch,
    result
  );

  if (appliedBySpecificPatchHandler) {
    await requestHomeRender(api, result);
    return true;
  }

  const needsCurrentState = Boolean(
    isFunction(api.reduceHomeActionState) ||
      isFunction(api.setState)
  );

  const currentState = needsCurrentState && isFunction(api.getState)
    ? safeObject(await api.getState(), {})
    : {};

  if (
    isFunction(api.reduceHomeActionState) &&
    isFunction(api.setState)
  ) {
    try {
      const nextState = api.reduceHomeActionState(currentState, result);
      const applied = await api.setState(nextState, result);

      if (applied !== false) {
        await requestHomeRender(api, result);
        return true;
      }
    } catch {
      // fallback abajo
    }
  }

  if (isFunction(api.setState)) {
    try {
      const applied = await api.setState(
        Object.keys(currentState).length
          ? {
              ...currentState,
              ...cleanPatch,
            }
          : cleanPatch,
        result
      );

      if (applied !== false) {
        await requestHomeRender(api, result);
        return true;
      }
    } catch {
      // noop
    }
  }

  return false;
}

async function notifyActionResult(result = {}, api = {}, element = null) {
  const cleanResult = sanitizePayload(result);

  await callFirstAvailable(
    [
      api.onActionResult,
      api.onHomeActionResult,
    ],
    cleanResult,
    element
  );

  const action = normalizeKey(cleanResult.action);

  if (action === "open_ticket_detail") {
    await callFirstAvailable(
      [
        api.onTicketDetailOpen,
        api.onIncidenciaDetailOpen,
      ],
      cleanResult,
      element
    );
  }

  if (action === "close_ticket_detail") {
    await callFirstAvailable(
      [
        api.onTicketDetailClose,
        api.onIncidenciaDetailClose,
      ],
      cleanResult,
      element
    );
  }

  return cleanResult;
}

async function applyActionResult(result = null, api = {}, element = null) {
  if (result === false || result === null || result === undefined) {
    return result;
  }

  if (!isObject(result)) {
    return result;
  }

  const cleanResult = await notifyActionResult(result, api, element);

  if (isObject(cleanResult.statePatch) && Object.keys(cleanResult.statePatch).length) {
    await applyStatePatch(cleanResult.statePatch, cleanResult, api);
  }

  return cleanResult;
}

/* =========================================================
   ACTION RESOLUTION
========================================================= */

function resolveKind(element = null) {
  const action = actionName(element);

  if (ACTIONS.retry.has(action)) return "retry";
  if (ACTIONS.ticketClose.has(action)) return "ticket-close";
  if (ACTIONS.ticketOpen.has(action)) return "ticket-open";
  if (ACTIONS.create.has(action)) return "create";
  if (ACTIONS.pagePrev.has(action)) return "page-prev";
  if (ACTIONS.pageNext.has(action)) return "page-next";
  if (ACTIONS.navigate.has(action)) return "navigate";

  return "";
}

/* =========================================================
   HANDLERS
========================================================= */

async function handleRetry(element, api = {}) {
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
        asRefresh: true,
        returnStaleOnError: true,
      });
    }

    return false;
  });
}

async function handleNavigate(element, api = {}, root = null) {
  const route = normalizeInternalRoute(routeFromElement(element));
  const payload = payloadFromElement(element, root);

  if (!route || !isFunction(api.navigateFromHomeAction)) return false;

  return withBusy(element, async () => {
    const result = await api.navigateFromHomeAction({
      route,
      payload,
      silent: false,
    });

    return applyActionResult(result, api, element);
  });
}

async function handleCreate(element, api = {}, root = null) {
  const payload = payloadFromElement(element, root);
  const route = INCIDENCIAS_ROUTE;

  if (!route) return false;

  return withBusy(element, async () => {
    if (isFunction(api.createFromHomeAction)) {
      const result = await api.createFromHomeAction({
        route,
        payload,
        draft: payload,
        silent: false,
      });

      return applyActionResult(result, api, element);
    }

    if (isFunction(api.navigateFromHomeAction)) {
      const result = await api.navigateFromHomeAction({
        route,
        payload,
        silent: false,
      });

      return applyActionResult(result, api, element);
    }

    return false;
  });
}

async function handleOpenTicketDetail(element, api = {}, root = null) {
  const payload = payloadFromElement(element, root);
  const ticketId = safePublicId(
    first(
      payload.ticketId,
      payload.incidenciaId,
      ticketIdFromElement(element, root),
      payload.entityId,
      payload.id,
      ""
    )
  );

  if (!ticketId) return false;

  return withBusy(element, async () => {
    let result = false;

    if (isFunction(api.openHomeTicketDetailAction)) {
      result = await api.openHomeTicketDetailAction({
        ticketId,
        incidenciaId: ticketId,
        entityId: ticketId,
        payload,
        silent: false,
      });
    } else {
      result = {
        ok: true,
        type: ACTION_RESULT_TYPES.STATE_PATCH,
        action: "open_ticket_detail",
        selectedTicketId: ticketId,
        selectedIncidenciaId: ticketId,
        statePatch: {
          selectedTicketId: ticketId,
          selectedIncidenciaId: ticketId,
          openingTicketId: "",
        },
        modal: {
          open: true,
          ticketId,
          incidenciaId: ticketId,
        },
        at: nowIso(),
      };
    }

    return applyActionResult(result, api, element);
  });
}

async function handleCloseTicketDetail(element, api = {}) {
  return withBusy(element, async () => {
    let result = false;

    if (isFunction(api.closeHomeTicketDetailAction)) {
      result = await api.closeHomeTicketDetailAction();
    } else {
      result = {
        ok: true,
        type: ACTION_RESULT_TYPES.STATE_PATCH,
        action: "close_ticket_detail",
        selectedTicketId: "",
        selectedIncidenciaId: "",
        statePatch: {
          selectedTicketId: "",
          selectedIncidenciaId: "",
          openingTicketId: "",
        },
        modal: {
          open: false,
          ticketId: "",
          incidenciaId: "",
        },
        at: nowIso(),
      };
    }

    return applyActionResult(result, api, element);
  });
}

async function handlePage(kind = "", element = null, api = {}) {
  return withBusy(element, async () => {
    if (kind === "page-prev" && isFunction(api.goPrevPage)) {
      return api.goPrevPage();
    }

    if (kind === "page-next" && isFunction(api.goNextPage)) {
      return api.goNextPage();
    }

    return false;
  });
}

/* =========================================================
   MAIN DISPATCH
========================================================= */

async function dispatchAction(event = null, element = null, api = {}, root = null) {
  const kind = resolveKind(element);

  if (!kind) return false;

  if (kind === "navigate" && isModifiedClick(event)) {
    return false;
  }

  event?.preventDefault?.();
  event?.stopPropagation?.();

  try {
    if (kind === "retry") return handleRetry(element, api);
    if (kind === "navigate") return handleNavigate(element, api, root);
    if (kind === "create") return handleCreate(element, api, root);
    if (kind === "ticket-open") return handleOpenTicketDetail(element, api, root);
    if (kind === "ticket-close") return handleCloseTicketDetail(element, api);
    if (kind === "page-prev") return handlePage(kind, element, api);
    if (kind === "page-next") return handlePage(kind, element, api);

    return false;
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
  force = false,

  reload,
  refresh,
  loadHomeDashboard,

  navigateFromHomeAction,
  createFromHomeAction,

  openHomeTicketDetailAction,
  closeHomeTicketDetailAction,
  reduceHomeActionState,

  getState,
  setState,
  patchState,
  updateState,

  requestRender,
  requestRerender,
  rerender,
  render,
  onRenderRequest,
  onRenderRequested,

  onStatePatch,
  onActionResult,
  onHomeActionResult,
  onTicketDetailOpen,
  onIncidenciaDetailOpen,
  onTicketDetailClose,
  onIncidenciaDetailClose,

  goPrevPage,
  goNextPage,
} = {}) {
  if (!isBrowser()) return () => false;

  const name = scopeName(scope);
  const root = getContainer(container);

  if (!isElement(root)) {
    return () => false;
  }

  const nextApi = buildApi({
    reload,
    refresh,
    loadHomeDashboard,

    navigateFromHomeAction,
    createFromHomeAction,

    openHomeTicketDetailAction,
    closeHomeTicketDetailAction,
    reduceHomeActionState,

    getState,
    setState,
    patchState,
    updateState,

    requestRender,
    requestRerender,
    rerender,
    render,
    onRenderRequest,
    onRenderRequested,

    onStatePatch,
    onActionResult,
    onHomeActionResult,
    onTicketDetailOpen,
    onIncidenciaDetailOpen,
    onTicketDetailClose,
    onIncidenciaDetailClose,

    goPrevPage,
    goNextPage,
  });

  if (force !== true && scopeIsBoundToRoot(name, root)) {
    apiByScope.set(name, nextApi);
    return () => cleanupScope(name);
  }

  cleanupScope(name);

  rootsByScope.set(name, root);
  apiByScope.set(name, nextApi);

  listen(name, root, "click", async (event) => {
    if (event.defaultPrevented) return;

    const element = closest(event, ACTION_SELECTOR, root);

    if (!element) return;

    if (shouldIgnore(element) || elementHasBlockedRoute(element)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    await dispatchAction(event, element, getBoundApi(name), root);
  });

  listen(name, root, "keydown", async (event) => {
    if (event.key === "Escape" && hasTicketModal(root)) {
      event.preventDefault();
      event.stopPropagation();

      await handleCloseTicketDetail(root, getBoundApi(name));
      return;
    }

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
  const api = apiByScope.get(name) || {};

  return {
    version: HOME_BINDINGS_VERSION,
    source: "views.home.bindings",

    scope: name,
    browser: isBrowser(),

    cleanupCount: cleanupsByScope.get(name)?.length || 0,
    hasContainer: Boolean(root),
    containerConnected: Boolean(root?.isConnected),
    stableBindingActive: scopeIsBoundToRoot(name, root),
    mutableApiContext: Boolean(apiByScope.has(name)),

    callbacks: {
      reload: isFunction(api.reload),
      refresh: isFunction(api.refresh),
      loadHomeDashboard: isFunction(api.loadHomeDashboard),
      navigateFromHomeAction: isFunction(api.navigateFromHomeAction),
      createFromHomeAction: isFunction(api.createFromHomeAction),
      openHomeTicketDetailAction: isFunction(api.openHomeTicketDetailAction),
      closeHomeTicketDetailAction: isFunction(api.closeHomeTicketDetailAction),
      patchState: isFunction(api.patchState),
      requestRender: isFunction(api.requestRender),
      goPrevPage: isFunction(api.goPrevPage),
      goNextPage: isFunction(api.goNextPage),
    },

    actions: {
      retry: [...ACTIONS.retry],
      navigate: [...ACTIONS.navigate],
      create: [...ACTIONS.create],
      ticketOpen: [...ACTIONS.ticketOpen],
      ticketClose: [...ACTIONS.ticketClose],
      pagePrev: [...ACTIONS.pagePrev],
      pageNext: [...ACTIONS.pageNext],
    },

    routes: {
      incidencias: INCIDENCIAS_ROUTE,
    },

    policy: {
      delegatedDomEventsOnly: true,
      stableSameRootBinding: true,
      noDuplicateBindingForSameRoot: true,
      updatesApiCallbacksOnSameRootRebind: true,

      templateAlignedActionsOnly: true,
      noManualRefreshAction: true,
      retryOnlyForErrorState: true,
      noExportCsvAction: true,
      noQuickActionsLegacy: true,
      noCopyWidgetAction: true,
      noPageGoAction: true,
      noPassiveRouteCapture: true,

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

      noHealthServerActions: true,

      rejectsSensitiveRoutes: true,
      sanitizesPayload: true,

      configRoutes: true,
      configBlockedRoutes: true,
      noLocalBlockedRouteFallback: true,

      ticketDetailDoesNotNavigate: true,
      ticketDetailReturnsStatePatch: true,
      ticketDetailSupportsCallbacks: true,
      closeDetailClearsSelection: true,
      escapeClosesTicketModalInsideScope: true,

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

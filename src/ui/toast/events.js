/* =========================================================
   Onion SPA - Toast Events
   Archivo: src/ui/toast/events.js

   Toast Events limpio:
   - puente AppCore.events/window -> Toast API
   - click delegated para dismiss
   - refresh al cambiar idioma
   - cleanup por scope
   - anti doble bind
   - anti loop clear/reset
   - payloads normalizados
   - sin render/store/timers directos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  TOAST_SCOPE,
  TOAST_EVENTS,
  TOAST_DATA_ID,
  TOAST_EVENT_SHOW,
  TOAST_EVENT_UPDATE,
  TOAST_EVENT_DISMISS,
  TOAST_EVENT_CLEAR,
  TOAST_EVENT_SUCCESS,
  TOAST_EVENT_ERROR,
  TOAST_EVENT_WARNING,
  TOAST_EVENT_INFO,
  TOAST_EVENT_LOADING,
  TOAST_EVENT_SHOWN,
  TOAST_EVENT_UPDATED,
  TOAST_EVENT_DISMISSED,
  TOAST_EVENT_CLEARED,
  TOAST_EVENT_LANGUAGE_REFRESH,
  TOAST_EVENT_RESET,
  TOAST_EVENT_ERROR_INTERNAL,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_EVENTS_VERSION = "17.0.0-clean";

const SOURCE = "ui.toast.events";

const DOM_CLICK_EVENT = "click";
const EVENT_DEDUPE_MS = 64;

const BOUND_EVENT = "toast:events:bound";
const UNBOUND_EVENT = "toast:events:unbound";

const GLOBAL_SHOW_EVENTS = Object.freeze([
  TOAST_EVENT_SHOW,
  `${TOAST_SCOPE}:show`,
]);

const GLOBAL_SUCCESS_EVENTS = Object.freeze([
  TOAST_EVENT_SUCCESS,
  `${TOAST_SCOPE}:success`,
]);

const GLOBAL_ERROR_EVENTS = Object.freeze([
  TOAST_EVENT_ERROR,
  `${TOAST_SCOPE}:error`,
]);

const GLOBAL_WARNING_EVENTS = Object.freeze([
  TOAST_EVENT_WARNING,
  "toast:warn",
  `${TOAST_SCOPE}:warning`,
  `${TOAST_SCOPE}:warn`,
]);

const GLOBAL_INFO_EVENTS = Object.freeze([
  TOAST_EVENT_INFO,
  `${TOAST_SCOPE}:info`,
]);

const GLOBAL_LOADING_EVENTS = Object.freeze([
  TOAST_EVENT_LOADING,
  `${TOAST_SCOPE}:loading`,
]);

const GLOBAL_UPDATE_EVENTS = Object.freeze([
  TOAST_EVENT_UPDATE,
  `${TOAST_SCOPE}:update`,
]);

const GLOBAL_DISMISS_EVENTS = Object.freeze([
  TOAST_EVENT_DISMISS,
  "toast:hide",
  "toast:close",
  `${TOAST_SCOPE}:dismiss`,
  `${TOAST_SCOPE}:hide`,
  `${TOAST_SCOPE}:close`,
]);

const GLOBAL_CLEAR_EVENTS = Object.freeze([
  TOAST_EVENT_CLEAR,
  "toast:dismiss-all",
  "toast:clear-all",
  `${TOAST_SCOPE}:clear`,
  `${TOAST_SCOPE}:dismiss-all`,
  `${TOAST_SCOPE}:clear-all`,
]);

const GLOBAL_RESET_EVENTS = Object.freeze([
  TOAST_EVENT_RESET,
  `${TOAST_SCOPE}:reset`,
]);

const GLOBAL_LANGUAGE_EVENTS = Object.freeze([
  TOAST_EVENT_LANGUAGE_REFRESH,
  "app:lang:change",
  "app:i18n:change",
  "i18n:change",
  `${TOAST_SCOPE}:language:refresh`,
]);

const INTERNAL_LIFECYCLE_EVENTS = new Set([
  TOAST_EVENT_SHOWN,
  TOAST_EVENT_UPDATED,
  TOAST_EVENT_DISMISSED,
  TOAST_EVENT_CLEARED,
  TOAST_EVENT_ERROR_INTERNAL,

  `${TOAST_SCOPE}:shown`,
  `${TOAST_SCOPE}:updated`,
  `${TOAST_SCOPE}:dismissed`,
  `${TOAST_SCOPE}:cleared`,
  `${TOAST_SCOPE}:internal-error`,
]);

/* =========================================================
   STATE
========================================================= */

let globalEventsBound = false;
let domEventsBound = false;

let boundAt = "";
let unboundAt = "";
let lastEventKey = "";
let lastEventAt = 0;

const manualUnsubscribers = new Set();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "on", "ok"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;

  return Boolean(fallback);
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[ToastEvents]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[ToastEvents]", ...args);
  } catch {}
}

function errorLog(...args) {
  try {
    AppCore?.utils?.error?.("[ToastEvents]", ...args);
    return;
  } catch {}

  try {
    console.error("[ToastEvents]", ...args);
  } catch {}
}

function rememberOff(off) {
  if (!isFn(off)) return false;

  manualUnsubscribers.add(off);
  return true;
}

function runManualOffs() {
  for (const off of Array.from(manualUnsubscribers)) {
    try {
      off();
    } catch {}
  }

  manualUnsubscribers.clear();
  return true;
}

function cleanupScope() {
  try {
    AppCore?.cleanup?.scope?.(TOAST_SCOPE);
  } catch {}

  return TOAST_SCOPE;
}

/* =========================================================
   PAYLOAD
========================================================= */

function rawDetail(input = null) {
  if (isObject(input) && "detail" in input) return input.detail;
  if (isObject(input) && "payload" in input) return input.payload;
  return input;
}

function normalizeDetail(input = null, { stringKey = "message" } = {}) {
  const raw = rawDetail(input);

  if (raw === null || raw === undefined) return null;

  if (isPlainObject(raw)) return raw;

  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return {
      [stringKey]: safeText(raw, ""),
    };
  }

  return null;
}

function normalizeToastDetail(input = null, options = {}) {
  const detail = normalizeDetail(input, options);

  if (!detail) return null;

  const id = safeText(
    detail.id ??
      detail.toastId ??
      detail.toast_id ??
      detail.key ??
      "",
    ""
  );

  const type = safeText(
    detail.type ??
      detail.variant ??
      "",
    ""
  );

  const title = safeText(
    detail.title ??
      detail.heading ??
      "",
    ""
  );

  const message = safeText(
    detail.message ??
      detail.text ??
      detail.description ??
      "",
    ""
  );

  const text = safeText(
    detail.text ??
      detail.message ??
      detail.description ??
      "",
    ""
  );

  return {
    ...detail,

    id,
    toastId: id,

    type,
    title,

    message,
    text,

    duration: detail.duration,
    closable: detail.closable,

    persist: detail.persist,
    persistent: detail.persistent,

    replace: detail.replace,
    replaceNode: detail.replaceNode,

    dedupe: detail.dedupe,
    dedupeMs: detail.dedupeMs,
    dedupeKey: detail.dedupeKey,

    source: detail.source || "event-bus",

    useDefaultTitle: safeBool(detail.useDefaultTitle, false),
    useDefaultMessage: safeBool(detail.useDefaultMessage, false),
  };
}

function eventNameFromInput(input = null, fallback = "") {
  return safeText(input?.type || input?.eventName || fallback, "");
}

function sourceFromDetail(detail = {}) {
  return safeText(detail?.source || detail?.origin || detail?.eventSource || "", "");
}

function isInternalLifecycleEvent(eventName = "") {
  return INTERNAL_LIFECYCLE_EVENTS.has(safeText(eventName, ""));
}

function dedupeEvent(eventName = "", input = null) {
  const name = safeText(eventName, "");
  if (!name) return true;

  const detail = rawDetail(input);
  const stamp = now();

  const key = [
    name,
    isObject(detail) ? detail.id || detail.toastId || detail.key || "" : "",
    isObject(detail) ? detail.type || detail.variant || "" : "",
    isObject(detail) ? detail.message || detail.text || detail.description || "" : safeText(detail, ""),
    isObject(detail) ? detail.source || "" : "",
  ].join("|");

  if (key === lastEventKey && stamp - lastEventAt < EVENT_DEDUPE_MS) {
    return true;
  }

  lastEventKey = key;
  lastEventAt = stamp;

  return false;
}

/* =========================================================
   EMIT LIFECYCLE
========================================================= */

function emitEvent(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    version: TOAST_EVENTS_VERSION,
    at: iso(),
    ...safeObject(payload),
  };

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, detail);
      emitted = true;
    }
  } catch {}

  if ((options.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

export function buildToastEventPayload(item, extra = {}) {
  return {
    id: item?.id || null,

    type: item?.type || null,

    title: item?.title || "",
    message: item?.message || "",

    duration: item?.duration ?? 0,
    remaining: item?.remaining ?? 0,

    closable: Boolean(item?.closable),
    dismissed: Boolean(item?.dismissed),

    useDefaultTitle: Boolean(item?.useDefaultTitle),
    useDefaultMessage: Boolean(item?.useDefaultMessage),

    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,

    timestamp: now(),

    ...safeObject(extra),
  };
}

export function emitToastShown(item) {
  const payload = buildToastEventPayload(item);

  emitEvent(TOAST_EVENT_SHOWN, payload);
  emitEvent(`${TOAST_SCOPE}:shown`, payload);

  return payload;
}

export function emitToastUpdated(item) {
  const payload = buildToastEventPayload(item);

  emitEvent(TOAST_EVENT_UPDATED, payload);
  emitEvent(`${TOAST_SCOPE}:updated`, payload);

  return payload;
}

export function emitToastDismissed(item) {
  const payload = buildToastEventPayload(item);

  emitEvent(TOAST_EVENT_DISMISSED, payload);
  emitEvent(`${TOAST_SCOPE}:dismissed`, payload);

  return payload;
}

/* =========================================================
   BIND HELPERS
========================================================= */

function bindCoreEvent(scope, eventName, handler) {
  const name = safeText(eventName, "");

  if (!name || !isFn(handler)) return false;

  try {
    if (isFn(AppCore?.cleanup?.event)) {
      AppCore.cleanup.event(scope, name, handler);
      return true;
    }
  } catch (error) {
    warn("cleanup.event falló.", { eventName: name, error });
  }

  try {
    if (isFn(AppCore?.events?.on)) {
      const off = AppCore.events.on(name, handler);
      rememberOff(off);
      return true;
    }
  } catch (error) {
    warn("AppCore.events.on falló.", { eventName: name, error });
  }

  return false;
}

function bindWindowEvent(scope, eventName, handler) {
  const name = safeText(eventName, "");

  if (!isBrowser() || !name || !isFn(handler)) return false;

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      AppCore.cleanup.on(scope, window, name, handler);
      return true;
    }
  } catch (error) {
    warn("cleanup.on(window) falló.", { eventName: name, error });
  }

  try {
    window.addEventListener(name, handler);
    rememberOff(() => window.removeEventListener(name, handler));
    return true;
  } catch {
    return false;
  }
}

function bindDomEvent(scope, node, eventName, handler, options = false) {
  const name = safeText(eventName, "");

  if (!isBrowser() || !node || !name || !isFn(handler)) return false;

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      AppCore.cleanup.on(scope, node, name, handler, options);
      return true;
    }
  } catch (error) {
    warn("cleanup.on(DOM) falló.", { eventName: name, error });
  }

  try {
    node.addEventListener(name, handler, options);
    rememberOff(() => node.removeEventListener(name, handler, options));
    return true;
  } catch {
    return false;
  }
}

function bindEvents(scope, eventNames = [], handler) {
  if (!isFn(handler)) return false;

  let bound = false;

  eventNames
    .map((item) => safeText(item, ""))
    .filter(Boolean)
    .forEach((eventName) => {
      const wrapped = (event) => {
        if (isInternalLifecycleEvent(eventName)) return;
        if (dedupeEvent(eventName, event)) return;

        handler(event, eventName);
      };

      const bus = bindCoreEvent(scope, eventName, wrapped);
      const win = bindWindowEvent(scope, eventName, wrapped);

      bound = bound || bus || win;
    });

  return bound;
}

function callAction(fn, ...args) {
  if (!isFn(fn)) return null;

  try {
    return fn(...args);
  } catch (error) {
    errorLog("Toast action falló.", error);
    return null;
  }
}

/* =========================================================
   GLOBAL EVENTS
========================================================= */

export function bindToastGlobalEvents(actions = {}) {
  if (globalEventsBound) return cleanupScope();

  const scope = cleanupScope();

  const show = actions.show || actions.showToast;
  const update = actions.update || actions.updateToast;
  const dismiss = actions.dismiss || actions.dismissToast;
  const clear = actions.clear || actions.clearToasts;
  const reset = actions.reset || actions.resetToastApiState;

  const success = actions.success || actions.successToast;
  const error = actions.error || actions.errorToast;
  const warning = actions.warning || actions.warn || actions.warningToast;
  const info = actions.info || actions.infoToast;
  const loading = actions.loading || actions.loadingToast;

  const refreshLanguage =
    actions.refreshAllToastsLanguage ||
    actions.refreshLanguage ||
    actions.refresh;

  bindEvents(scope, GLOBAL_SHOW_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail) return;

    callAction(show, detail);
  });

  bindEvents(scope, GLOBAL_SUCCESS_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail) return;

    callAction(success, detail.message || detail.text || "", detail);
  });

  bindEvents(scope, GLOBAL_ERROR_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail) return;

    callAction(error, detail.message || detail.text || "", detail);
  });

  bindEvents(scope, GLOBAL_WARNING_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail) return;

    callAction(warning, detail.message || detail.text || "", detail);
  });

  bindEvents(scope, GLOBAL_INFO_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail) return;

    callAction(info, detail.message || detail.text || "", detail);
  });

  bindEvents(scope, GLOBAL_LOADING_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail) return;

    callAction(loading, detail.message || detail.text || "", detail);
  });

  bindEvents(scope, GLOBAL_UPDATE_EVENTS, (event) => {
    const detail = normalizeToastDetail(event);
    if (!detail?.id) return;

    const patch = isPlainObject(detail.patch)
      ? {
          ...detail,
          ...detail.patch,
        }
      : detail;

    callAction(update, detail.id, patch);
  });

  bindEvents(scope, GLOBAL_DISMISS_EVENTS, (event) => {
    const detail = normalizeToastDetail(event, { stringKey: "id" });

    if (!detail?.id) {
      callAction(dismiss, null, {
        reason: "event-dismiss",
        source: "event-bus",
      });
      return;
    }

    callAction(dismiss, detail.id, {
      reason: detail.reason || "event-dismiss",
      source: "event-bus",
    });
  });

  bindEvents(scope, GLOBAL_CLEAR_EVENTS, (event) => {
    const detail = normalizeToastDetail(event, { stringKey: "reason" }) || {};

    callAction(clear, {
      ...detail,
      reason: detail.reason || "event-clear",
      source: "event-bus",
    });
  });

  bindEvents(scope, GLOBAL_RESET_EVENTS, (event) => {
    const detail = normalizeToastDetail(event, { stringKey: "reason" }) || {};

    callAction(reset, {
      ...detail,
      reason: detail.reason || "event-reset",
      source: "event-bus",
    });
  });

  bindEvents(scope, GLOBAL_LANGUAGE_EVENTS, () => {
    callAction(refreshLanguage);
  });

  globalEventsBound = true;
  boundAt = iso();

  emitEvent(BOUND_EVENT, {
    scope,
    global: true,
    dom: domEventsBound,
  });

  return scope;
}

/* =========================================================
   DOM EVENTS
========================================================= */

function getDismissTarget(event) {
  const target = event?.target;

  if (!target || !isFn(target.closest)) return null;

  try {
    return target.closest("[data-toast-dismiss]");
  } catch {
    return null;
  }
}

function getToastIdFromDismissTarget(target) {
  if (!target) return "";

  const direct = safeText(target.getAttribute?.("data-toast-dismiss"), "");
  if (direct) return direct;

  try {
    const toast = target.closest?.([
      `[${TOAST_DATA_ID}]`,
      "[data-toast-id]",
      "[data-ui-toast-id]",
      "[data-toast-item-id]",
    ].join(","));

    return safeText(
      toast?.getAttribute?.(TOAST_DATA_ID) ||
        toast?.getAttribute?.("data-toast-id") ||
        toast?.getAttribute?.("data-ui-toast-id") ||
        toast?.getAttribute?.("data-toast-item-id") ||
        toast?.dataset?.toastId ||
        "",
      ""
    );
  } catch {
    return "";
  }
}

export function bindToastDomEvents(actions = {}) {
  if (domEventsBound) return cleanupScope();
  if (!isBrowser()) return null;

  const scope = cleanupScope();
  const dismiss = actions.dismiss || actions.dismissToast;

  bindDomEvent(
    scope,
    document,
    DOM_CLICK_EVENT,
    (event) => {
      const target = getDismissTarget(event);
      if (!target) return;

      const toastId = getToastIdFromDismissTarget(target);

      try {
        event.preventDefault();
      } catch {}

      try {
        event.stopPropagation();
      } catch {}

      callAction(dismiss, toastId || null, {
        reason: "dom-click",
        source: "dom",
      });
    },
    true
  );

  domEventsBound = true;
  boundAt = boundAt || iso();

  emitEvent(BOUND_EVENT, {
    scope,
    global: globalEventsBound,
    dom: true,
  });

  return scope;
}

/* =========================================================
   UNBIND
========================================================= */

export function unbindToastEvents() {
  try {
    AppCore?.cleanup?.run?.(TOAST_SCOPE);
  } catch {}

  try {
    AppCore?.cleanup?.clear?.(TOAST_SCOPE);
  } catch {}

  runManualOffs();

  globalEventsBound = false;
  domEventsBound = false;

  unboundAt = iso();

  lastEventKey = "";
  lastEventAt = 0;

  emitEvent(UNBOUND_EVENT, {
    scope: TOAST_SCOPE,
  });

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastEventsSnapshot() {
  return {
    version: TOAST_EVENTS_VERSION,
    source: SOURCE,

    scope: TOAST_SCOPE,

    globalEventsBound,
    domEventsBound,

    boundAt,
    unboundAt,

    manualUnsubscribers: manualUnsubscribers.size,

    hasAppCoreEvents: Boolean(AppCore?.events),
    hasAppCoreEventsOn: isFn(AppCore?.events?.on),
    hasAppCoreEventsEmit: isFn(AppCore?.events?.emit),

    hasCleanup: Boolean(AppCore?.cleanup),
    hasCleanupEvent: isFn(AppCore?.cleanup?.event),
    hasCleanupOn: isFn(AppCore?.cleanup?.on),
    hasCleanupRun: isFn(AppCore?.cleanup?.run),
    hasCleanupClear: isFn(AppCore?.cleanup?.clear),

    lastEventKey,
    lastEventAt,
    lastEventAtIso: lastEventAt ? iso(lastEventAt) : "",

    events: TOAST_EVENTS,

    browser: isBrowser(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOAST_EVENTS_VERSION,

  buildToastEventPayload,

  emitToastShown,
  emitToastUpdated,
  emitToastDismissed,

  bindToastGlobalEvents,
  bindToastDomEvents,
  unbindToastEvents,

  getToastEventsSnapshot,
};

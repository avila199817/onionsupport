/* =========================================================
   Onion Support - Toast Events
   Archivo: /src/ui/toast/events.js

   Responsabilidad:
   - Compat mínima de eventos Toast.
   - Puente AppCore.events -> Toast API.
   - Click delegado para dismiss.
   - Sin constants.js.
   - Sin window CustomEvent.
   - Sin AppCore.cleanup.
   - Sin store.
   - Sin timers.
   - Sin render.
   - Sin loops clear/reset.
   - Sin magia negra.
   - El Toast real vive en src/ui/toast/index.js.
========================================================= */

import { AppCore } from "../../core/index.js";
import Toast from "./index.js";

export const TOAST_EVENTS_VERSION = "simple";

const SOURCE = "ui.toast.events";
const TOAST_SCOPE = "ui:toast";

const EVENTS = Object.freeze({
  show: "toast:show",
  update: "toast:update",
  dismiss: "toast:dismiss",
  clear: "toast:clear",
  reset: "toast:reset",

  success: "toast:success",
  error: "toast:error",
  warning: "toast:warning",
  warn: "toast:warn",
  info: "toast:info",
  loading: "toast:loading",

  shown: "toast:shown",
  updated: "toast:updated",
  dismissed: "toast:dismissed",
  cleared: "toast:cleared",

  languageRefresh: "toast:language:refresh",
});

const SOURCE_BLOCKLIST = new Set([
  SOURCE,
  "ui.toast",
  "ui.toast.index",
  "ui.toast.api",
  "toast.api.bridge",
  "toast-events",
]);

const LIFECYCLE_EVENTS = new Set([
  EVENTS.shown,
  EVENTS.updated,
  EVENTS.dismissed,
  EVENTS.cleared,
]);

let globalEventsBound = false;
let domEventsBound = false;
let boundAt = "";
let unboundAt = "";

let lastEventKey = "";
let lastEventAt = 0;

const unsubscribers = new Set();

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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function now() {
  return Date.now();
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function remember(off = null) {
  if (!isFunction(off)) return false;

  unsubscribers.add(off);
  return true;
}

function runUnsubscribers() {
  for (const off of [...unsubscribers]) {
    try {
      off();
    } catch {
      // noop
    }
  }

  unsubscribers.clear();
  return true;
}

/* =========================================================
   PAYLOAD
========================================================= */

function rawDetail(input = null) {
  if (isObject(input?.detail)) return input.detail;
  if (isObject(input?.payload)) return input.payload;
  return input;
}

function normalizeDetail(input = null, stringKey = "message") {
  const raw = rawDetail(input);

  if (raw === null || raw === undefined) return {};

  if (isObject(raw)) return raw;

  if (["string", "number", "boolean"].includes(typeof raw)) {
    return {
      [stringKey]: text(raw, ""),
    };
  }

  return {};
}

function normalizeToastPayload(input = null, stringKey = "message") {
  const detail = normalizeDetail(input, stringKey);

  const id = text(
    detail.id ??
      detail.toastId ??
      detail.toast_id ??
      detail.key ??
      "",
    ""
  );

  const message = text(
    detail.message ??
      detail.text ??
      detail.description ??
      "",
    ""
  );

  return {
    ...detail,

    id,
    toastId: id,

    type: text(detail.type ?? detail.variant ?? "", ""),
    title: text(detail.title ?? detail.heading ?? "", ""),
    message,
    text: message,

    source: text(
      detail.source ??
        detail.origin ??
        detail.eventSource ??
        "event-bus",
      "event-bus"
    ),
  };
}

function sourceOf(detail = {}) {
  return text(detail?.source || detail?.origin || detail?.eventSource || "", "");
}

function shouldIgnore(eventName = "", detail = {}) {
  if (LIFECYCLE_EVENTS.has(eventName)) return true;

  const source = sourceOf(detail);

  return Boolean(source && SOURCE_BLOCKLIST.has(source));
}

function dedupe(eventName = "", detail = {}) {
  const key = [
    eventName,
    detail.id || detail.toastId || detail.key || "",
    detail.type || "",
    detail.message || detail.text || "",
    detail.source || "",
  ].join("|");

  const stamp = now();

  if (key === lastEventKey && stamp - lastEventAt < 64) {
    return true;
  }

  lastEventKey = key;
  lastEventAt = stamp;

  return false;
}

/* =========================================================
   EVENT EMIT
========================================================= */

function emit(eventName = "", payload = {}) {
  const name = text(eventName, "");

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, {
      source: SOURCE,
      version: TOAST_EVENTS_VERSION,
      at: iso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

export function buildToastEventPayload(item = null, extra = {}) {
  return {
    id: item?.id || null,
    type: item?.type || null,
    title: item?.title || "",
    message: item?.message || "",
    duration: item?.duration ?? 0,
    persist: Boolean(item?.persist),
    dismissed: Boolean(item?.dismissed),
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
    timestamp: now(),
    ...extra,
  };
}

export function emitToastShown(item = null) {
  const payload = buildToastEventPayload(item);
  emit(EVENTS.shown, payload);
  return payload;
}

export function emitToastUpdated(item = null) {
  const payload = buildToastEventPayload(item);
  emit(EVENTS.updated, payload);
  return payload;
}

export function emitToastDismissed(item = null) {
  const payload = buildToastEventPayload(item);
  emit(EVENTS.dismissed, payload);
  return payload;
}

/* =========================================================
   ACTIONS
========================================================= */

function resolveActions(actions = {}) {
  return {
    show: actions.show || actions.showToast || Toast.show,
    update: actions.update || actions.updateToast || Toast.update,
    dismiss: actions.dismiss || actions.dismissToast || Toast.dismiss,
    clear: actions.clear || actions.clearToasts || Toast.clear,
    reset: actions.reset || actions.resetToastApiState || Toast.reset,

    success: actions.success || actions.successToast || Toast.success,
    error: actions.error || actions.errorToast || Toast.error,
    warning: actions.warning || actions.warn || actions.warningToast || Toast.warning,
    info: actions.info || actions.infoToast || Toast.info,
    loading: actions.loading || actions.loadingToast || Toast.loading,

    refresh:
      actions.refreshAllToastsLanguage ||
      actions.refreshLanguage ||
      actions.refresh ||
      Toast.refreshAllToastsLanguage ||
      Toast.refreshLanguage,
  };
}

function callAction(fn = null, ...args) {
  if (!isFunction(fn)) return null;

  try {
    return fn(...args);
  } catch {
    return null;
  }
}

/* =========================================================
   BIND HELPERS
========================================================= */

function bindCoreEvent(eventName = "", handler = null) {
  const name = text(eventName, "");

  if (!name || !isFunction(handler)) return false;

  try {
    if (isFunction(AppCore?.events?.on)) {
      const off = AppCore.events.on(name, handler);

      if (isFunction(off)) {
        remember(off);
      } else if (isFunction(AppCore?.events?.off)) {
        remember(() => AppCore.events.off(name, handler));
      }

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function bindEventList(eventNames = [], handler = null) {
  let bound = false;

  for (const eventName of eventNames) {
    const name = text(eventName, "");

    if (!name) continue;

    const wrapped = (payload) => {
      const detail = normalizeToastPayload(payload);

      if (shouldIgnore(name, detail)) return;
      if (dedupe(name, detail)) return;

      handler(detail, name);
    };

    bound = bindCoreEvent(name, wrapped) || bound;
  }

  return bound;
}

/* =========================================================
   GLOBAL EVENTS
========================================================= */

export function bindToastGlobalEvents(actions = {}) {
  if (globalEventsBound) return TOAST_SCOPE;

  const resolved = resolveActions(actions);

  bindEventList([EVENTS.show, `${TOAST_SCOPE}:show`], (detail) => {
    callAction(resolved.show, detail);
  });

  bindEventList([EVENTS.success, `${TOAST_SCOPE}:success`], (detail) => {
    callAction(resolved.success, detail.message || detail.text || "", detail);
  });

  bindEventList([EVENTS.error, `${TOAST_SCOPE}:error`], (detail) => {
    callAction(resolved.error, detail.message || detail.text || "", detail);
  });

  bindEventList([EVENTS.warning, EVENTS.warn, `${TOAST_SCOPE}:warning`, `${TOAST_SCOPE}:warn`], (detail) => {
    callAction(resolved.warning, detail.message || detail.text || "", detail);
  });

  bindEventList([EVENTS.info, `${TOAST_SCOPE}:info`], (detail) => {
    callAction(resolved.info, detail.message || detail.text || "", detail);
  });

  bindEventList([EVENTS.loading, `${TOAST_SCOPE}:loading`], (detail) => {
    callAction(resolved.loading, detail.message || detail.text || "", detail);
  });

  bindEventList([EVENTS.update, `${TOAST_SCOPE}:update`], (detail) => {
    if (!detail.id) return;

    const patch = isObject(detail.patch)
      ? {
          ...detail,
          ...detail.patch,
        }
      : detail;

    callAction(resolved.update, detail.id, patch);
  });

  bindEventList([
    EVENTS.dismiss,
    "toast:hide",
    "toast:close",
    `${TOAST_SCOPE}:dismiss`,
    `${TOAST_SCOPE}:hide`,
    `${TOAST_SCOPE}:close`,
  ], (detail) => {
    callAction(resolved.dismiss, detail.id || null, {
      reason: detail.reason || "event-dismiss",
      source: SOURCE,
    });
  });

  bindEventList([
    EVENTS.clear,
    "toast:dismiss-all",
    "toast:clear-all",
    `${TOAST_SCOPE}:clear`,
    `${TOAST_SCOPE}:dismiss-all`,
    `${TOAST_SCOPE}:clear-all`,
  ], (detail) => {
    callAction(resolved.clear, {
      ...detail,
      reason: detail.reason || "event-clear",
      source: SOURCE,
    });
  });

  bindEventList([EVENTS.reset, `${TOAST_SCOPE}:reset`], (detail) => {
    callAction(resolved.reset, {
      ...detail,
      reason: detail.reason || "event-reset",
      source: SOURCE,
    });
  });

  bindEventList([
    EVENTS.languageRefresh,
    "app:lang:change",
    "app:i18n:change",
    "i18n:change",
    `${TOAST_SCOPE}:language:refresh`,
  ], () => {
    callAction(resolved.refresh);
  });

  globalEventsBound = true;
  boundAt = iso();

  emit("toast:events:bound", {
    scope: TOAST_SCOPE,
    global: true,
    dom: domEventsBound,
  });

  return TOAST_SCOPE;
}

/* =========================================================
   DOM EVENTS
========================================================= */

function dismissTarget(event = null) {
  const target = event?.target;

  if (!target || !isFunction(target.closest)) return null;

  try {
    return target.closest("[data-toast-dismiss]");
  } catch {
    return null;
  }
}

function toastIdFromTarget(target = null) {
  if (!target) return "";

  const direct = text(target.getAttribute?.("data-toast-dismiss"), "");

  if (direct) return direct;

  try {
    const toast = target.closest?.("[data-toast-id]");
    return text(toast?.dataset?.toastId || toast?.getAttribute?.("data-toast-id"), "");
  } catch {
    return "";
  }
}

export function bindToastDomEvents(actions = {}) {
  if (domEventsBound) return TOAST_SCOPE;
  if (!isBrowser()) return null;

  const resolved = resolveActions(actions);

  const handler = (event) => {
    const target = dismissTarget(event);

    if (!target) return;

    const toastId = toastIdFromTarget(target);

    try {
      event.preventDefault();
      event.stopPropagation();
    } catch {
      // noop
    }

    callAction(resolved.dismiss, toastId || null, {
      reason: "dom-click",
      source: SOURCE,
    });
  };

  try {
    document.addEventListener("click", handler, true);
    remember(() => document.removeEventListener("click", handler, true));
  } catch {
    return null;
  }

  domEventsBound = true;
  boundAt = boundAt || iso();

  emit("toast:events:bound", {
    scope: TOAST_SCOPE,
    global: globalEventsBound,
    dom: true,
  });

  return TOAST_SCOPE;
}

/* =========================================================
   UNBIND
========================================================= */

export function unbindToastEvents() {
  runUnsubscribers();

  globalEventsBound = false;
  domEventsBound = false;
  unboundAt = iso();

  lastEventKey = "";
  lastEventAt = 0;

  emit("toast:events:unbound", {
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

    manualUnsubscribers: unsubscribers.size,

    hasAppCoreEvents: Boolean(AppCore?.events),
    hasAppCoreEventsOn: isFunction(AppCore?.events?.on),
    hasAppCoreEventsEmit: isFunction(AppCore?.events?.emit),

    lastEventKey,
    lastEventAt,
    lastEventAtIso: lastEventAt ? iso(lastEventAt) : "",

    events: EVENTS,
    browser: isBrowser(),

    policy: {
      compatOnly: true,
      noConstantsImport: true,
      noWindowCustomEvent: true,
      noAppCoreCleanup: true,
      noStore: true,
      noTimers: true,
      noRender: true,
      noLoopClearReset: true,
    },
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

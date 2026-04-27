/* =========================================================
   Onion SPA - Toast Events
   Archivo: src/ui/toast/events.js

   Responsabilidades:
   - bind de eventos globales del sistema toast
   - bind de eventos DOM para dismiss
   - puente con AppCore.events
   - puente opcional con window CustomEvent
   - refresh live al cambiar idioma
   - cero acoplamiento al render concreto
   - endurecer payloads y binds duplicados
   - cleanup seguro
   - aliases legacy: warn / dismissAll / clear
========================================================= */

import { AppCore } from "../../core/index.js";
import { TOAST_SCOPE } from "./constants.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let globalEventsBound = false;
let domEventsBound = false;

const manualUnsubscribers = new Set();

let seenPayloads = new WeakMap();

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[ToastEvents]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[ToastEvents]",
      ...args
    );
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[ToastEvents]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[ToastEvents]",
      ...args
    );
  } catch {}
}

function rememberUnsubscriber(off) {
  if (!isFunction(off)) {
    return false;
  }

  manualUnsubscribers.add(off);

  return true;
}

function runManualUnsubscribers() {
  for (const off of Array.from(manualUnsubscribers)) {
    try {
      off();
    } catch {}
  }

  manualUnsubscribers.clear();

  return true;
}

function resolveCleanupScope() {
  try {
    AppCore?.cleanup?.scope?.(
      TOAST_SCOPE
    );
  } catch {}

  return TOAST_SCOPE;
}

function getRawDetail(input) {
  if (
    isObject(input) &&
    Object.prototype.hasOwnProperty.call(
      input,
      "detail"
    )
  ) {
    return input.detail;
  }

  return input;
}

function getEventDetail(
  input,
  {
    stringKey = "message",
  } = {}
) {
  const raw =
    getRawDetail(input);

  if (isPlainObject(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    return {
      [stringKey]: raw,
    };
  }

  if (
    raw === null ||
    raw === undefined
  ) {
    return null;
  }

  return {
    [stringKey]: safeText(raw, ""),
  };
}

function shouldSkipDuplicateEvent(
  eventName = "",
  input = null
) {
  const raw =
    getRawDetail(input);

  if (!isObject(raw)) {
    return false;
  }

  const now =
    Date.now();

  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  let eventMap =
    seenPayloads.get(raw);

  if (!eventMap) {
    eventMap = new Map();
    seenPayloads.set(
      raw,
      eventMap
    );
  }

  const lastAt =
    safeNumber(
      eventMap.get(name),
      0
    );

  if (
    lastAt &&
    now - lastAt < 24
  ) {
    return true;
  }

  eventMap.set(
    name,
    now
  );

  try {
    window.setTimeout?.(
      () => {
        try {
          eventMap.delete(name);
        } catch {}
      },
      80
    );
  } catch {}

  return false;
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function normalizeToastDetail(
  input,
  {
    stringKey = "message",
  } = {}
) {
  const detail =
    getEventDetail(input, {
      stringKey,
    });

  if (!isPlainObject(detail)) {
    return null;
  }

  const id =
    safeText(
      detail.id ??
        detail.toastId ??
        detail.toast_id ??
        detail.key ??
        "",
      ""
    );

  const type =
    safeText(
      detail.type ??
        detail.variant ??
        "",
      ""
    );

  const title =
    safeText(
      detail.title ??
        detail.heading ??
        "",
      ""
    );

  const message =
    safeText(
      detail.message ??
        detail.text ??
        detail.description ??
        "",
      ""
    );

  const text =
    safeText(
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

    duration:
      detail.duration,

    closable:
      detail.closable,

    persist:
      detail.persist,

    useDefaultTitle:
      safeBool(
        detail.useDefaultTitle,
        false
      ),

    useDefaultMessage:
      safeBool(
        detail.useDefaultMessage,
        false
      ),
  };
}

/* =========================================================
   CLEANUP / BIND HELPERS
========================================================= */

function bindCoreEvent(
  scope,
  eventName,
  handler
) {
  const name =
    safeText(eventName, "");

  if (
    !name ||
    !isFunction(handler)
  ) {
    return false;
  }

  try {
    if (
      isFunction(
        AppCore?.cleanup?.event
      )
    ) {
      AppCore.cleanup.event(
        scope,
        name,
        handler
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      "cleanup.event falló.",
      {
        eventName: name,
        error,
      }
    );
  }

  try {
    if (
      isFunction(
        AppCore?.events?.on
      )
    ) {
      const off =
        AppCore.events.on(
          name,
          handler
        );

      rememberUnsubscriber(
        off
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      "AppCore.events.on falló.",
      {
        eventName: name,
        error,
      }
    );
  }

  return false;
}

function bindWindowEvent(
  scope,
  eventName,
  handler
) {
  const name =
    safeText(eventName, "");

  if (
    !isBrowser() ||
    !name ||
    !isFunction(handler)
  ) {
    return false;
  }

  try {
    if (
      isFunction(
        AppCore?.cleanup?.on
      )
    ) {
      AppCore.cleanup.on(
        scope,
        window,
        name,
        handler
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      "cleanup.on(window) falló.",
      {
        eventName: name,
        error,
      }
    );
  }

  try {
    window.addEventListener(
      name,
      handler
    );

    rememberUnsubscriber(
      () => {
        try {
          window.removeEventListener(
            name,
            handler
          );
        } catch {}
      }
    );

    return true;
  } catch {
    return false;
  }
}

function bindDomEvent(
  scope,
  node,
  eventName,
  handler,
  options
) {
  const name =
    safeText(eventName, "");

  if (
    !isBrowser() ||
    !node ||
    !name ||
    !isFunction(handler)
  ) {
    return false;
  }

  try {
    if (
      isFunction(
        AppCore?.cleanup?.on
      )
    ) {
      AppCore.cleanup.on(
        scope,
        node,
        name,
        handler,
        options
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      "cleanup.on(DOM) falló.",
      {
        eventName: name,
        error,
      }
    );
  }

  try {
    node.addEventListener(
      name,
      handler,
      options
    );

    rememberUnsubscriber(
      () => {
        try {
          node.removeEventListener(
            name,
            handler,
            options
          );
        } catch {}
      }
    );

    return true;
  } catch {
    return false;
  }
}

function bindGlobalAliases(
  scope,
  eventNames = [],
  handler
) {
  if (!isFunction(handler)) {
    return false;
  }

  let bound = false;

  eventNames
    .map((name) => safeText(name, ""))
    .filter(Boolean)
    .forEach((eventName) => {
      const wrapped = (event) => {
        if (
          shouldSkipDuplicateEvent(
            eventName,
            event
          )
        ) {
          return;
        }

        handler(event);
      };

      const coreBound =
        bindCoreEvent(
          scope,
          eventName,
          wrapped
        );

      const windowBound =
        bindWindowEvent(
          scope,
          eventName,
          wrapped
        );

      bound =
        bound ||
        coreBound ||
        windowBound;
    });

  return bound;
}

function callAction(fn, ...args) {
  if (!isFunction(fn)) {
    return null;
  }

  try {
    return fn(...args);
  } catch (error) {
    safeError(
      "Toast action falló.",
      error
    );

    return null;
  }
}

/* =========================================================
   PAYLOAD
========================================================= */

export function buildToastEventPayload(
  item,
  extra = {}
) {
  return {
    id:
      item?.id || null,

    type:
      item?.type || null,

    title:
      item?.title || "",

    message:
      item?.message || "",

    duration:
      item?.duration ?? 0,

    remaining:
      item?.remaining ?? 0,

    closable:
      Boolean(
        item?.closable
      ),

    dismissed:
      Boolean(
        item?.dismissed
      ),

    useDefaultTitle:
      Boolean(
        item?.useDefaultTitle
      ),

    useDefaultMessage:
      Boolean(
        item?.useDefaultMessage
      ),

    createdAt:
      item?.createdAt || null,

    timestamp:
      Date.now(),

    ...extra,
  };
}

/* =========================================================
   EMIT
========================================================= */

function emitEvent(
  eventName,
  payload = {}
) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(
      name,
      payload
    );

    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

export function emitToastShown(item) {
  const payload =
    buildToastEventPayload(item);

  emitEvent(
    "toast:shown",
    payload
  );

  emitEvent(
    `${TOAST_SCOPE}:shown`,
    payload
  );

  return payload;
}

export function emitToastUpdated(item) {
  const payload =
    buildToastEventPayload(item);

  emitEvent(
    "toast:updated",
    payload
  );

  emitEvent(
    `${TOAST_SCOPE}:updated`,
    payload
  );

  return payload;
}

export function emitToastDismissed(item) {
  const payload =
    buildToastEventPayload(item);

  emitEvent(
    "toast:dismissed",
    payload
  );

  emitEvent(
    `${TOAST_SCOPE}:dismissed`,
    payload
  );

  return payload;
}

/* =========================================================
   GLOBAL EVENT BINDING
========================================================= */

export function bindToastGlobalEvents({
  show,
  update,
  dismiss,
  clear,
  success,
  error,
  warning,
  warn,
  info,
  loading,
  refreshAllToastsLanguage,
} = {}) {
  if (globalEventsBound) {
    return resolveCleanupScope();
  }

  const scope =
    resolveCleanupScope();

  const warningAction =
    isFunction(warning)
      ? warning
      : warn;

  bindGlobalAliases(
    scope,
    [
      "toast:show",
      `${TOAST_SCOPE}:show`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail) {
        return;
      }

      callAction(
        show,
        detail
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:success",
      `${TOAST_SCOPE}:success`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail) {
        return;
      }

      callAction(
        success,
        detail.message || detail.text || "",
        detail
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:error",
      `${TOAST_SCOPE}:error`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail) {
        return;
      }

      callAction(
        error,
        detail.message || detail.text || "",
        detail
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:warning",
      "toast:warn",
      `${TOAST_SCOPE}:warning`,
      `${TOAST_SCOPE}:warn`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail) {
        return;
      }

      callAction(
        warningAction,
        detail.message || detail.text || "",
        detail
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:info",
      `${TOAST_SCOPE}:info`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail) {
        return;
      }

      callAction(
        info,
        detail.message || detail.text || "",
        detail
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:loading",
      `${TOAST_SCOPE}:loading`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail) {
        return;
      }

      callAction(
        loading,
        detail.message || detail.text || "",
        detail
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:update",
      `${TOAST_SCOPE}:update`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(event);

      if (!detail?.id) {
        return;
      }

      const patch =
        isPlainObject(detail.patch)
          ? {
              ...detail,
              ...detail.patch,
            }
          : detail;

      callAction(
        update,
        detail.id,
        patch
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:dismiss",
      `${TOAST_SCOPE}:dismiss`,
    ],
    (event) => {
      const detail =
        normalizeToastDetail(
          event,
          {
            stringKey: "id",
          }
        );

      if (!isFunction(dismiss)) {
        return;
      }

      if (!detail?.id) {
        callAction(dismiss);
        return;
      }

      callAction(
        dismiss,
        detail.id
      );
    }
  );

  bindGlobalAliases(
    scope,
    [
      "toast:clear",
      "toast:dismiss-all",
      `${TOAST_SCOPE}:clear`,
      `${TOAST_SCOPE}:dismiss-all`,
    ],
    () => {
      callAction(clear);
    }
  );

  bindGlobalAliases(
    scope,
    [
      "app:lang:change",
    ],
    () => {
      callAction(
        refreshAllToastsLanguage
      );
    }
  );

  globalEventsBound = true;

  emitEvent(
    "toast:events:bound",
    {
      scope,
      global: true,
      dom: domEventsBound,
    }
  );

  return scope;
}

/* =========================================================
   DOM EVENT BINDING
========================================================= */

function getDismissTarget(event) {
  const target =
    event?.target;

  if (
    !target ||
    !isFunction(target.closest)
  ) {
    return null;
  }

  try {
    return target.closest(
      "[data-toast-dismiss]"
    );
  } catch {
    return null;
  }
}

function resolveToastIdFromDismissTarget(target) {
  if (!target) {
    return "";
  }

  const direct =
    safeText(
      target.getAttribute?.(
        "data-toast-dismiss"
      ),
      ""
    );

  if (direct) {
    return direct;
  }

  const toastNode =
    target.closest?.(
      [
        "[data-toast-id]",
        "[data-ui-toast-id]",
        "[data-toast-item-id]",
      ].join(",")
    );

  return safeText(
    toastNode?.getAttribute?.(
      "data-toast-id"
    ) ??
      toastNode?.getAttribute?.(
        "data-ui-toast-id"
      ) ??
      toastNode?.getAttribute?.(
        "data-toast-item-id"
      ) ??
      toastNode?.dataset?.toastId ??
      "",
    ""
  );
}

export function bindToastDomEvents({
  dismiss,
} = {}) {
  if (domEventsBound) {
    return resolveCleanupScope();
  }

  if (!isBrowser()) {
    return null;
  }

  const scope =
    resolveCleanupScope();

  bindDomEvent(
    scope,
    document,
    "click",
    (event) => {
      const closeBtn =
        getDismissTarget(event);

      if (!closeBtn) {
        return;
      }

      const toastId =
        resolveToastIdFromDismissTarget(
          closeBtn
        );

      try {
        event.preventDefault();
      } catch {}

      try {
        event.stopPropagation();
      } catch {}

      try {
        event.stopImmediatePropagation?.();
      } catch {}

      callAction(
        dismiss,
        toastId || null
      );
    }
  );

  domEventsBound = true;

  emitEvent(
    "toast:events:bound",
    {
      scope,
      global: globalEventsBound,
      dom: true,
    }
  );

  return scope;
}

/* =========================================================
   UNBIND
========================================================= */

export function unbindToastEvents() {
  try {
    AppCore?.cleanup?.run?.(
      TOAST_SCOPE
    );
  } catch {}

  runManualUnsubscribers();

  globalEventsBound = false;
  domEventsBound = false;

  seenPayloads =
    new WeakMap();

  emitEvent(
    "toast:events:unbound",
    {
      scope: TOAST_SCOPE,
    }
  );

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getToastEventsSnapshot() {
  return {
    scope:
      TOAST_SCOPE,

    globalEventsBound,
    domEventsBound,

    manualUnsubscribers:
      manualUnsubscribers.size,

    hasAppCoreEvents:
      Boolean(
        AppCore?.events
      ),

    hasAppCoreEventsOn:
      isFunction(
        AppCore?.events?.on
      ),

    hasAppCoreEventsEmit:
      isFunction(
        AppCore?.events?.emit
      ),

    hasCleanup:
      Boolean(
        AppCore?.cleanup
      ),

    hasCleanupEvent:
      isFunction(
        AppCore?.cleanup?.event
      ),

    hasCleanupOn:
      isFunction(
        AppCore?.cleanup?.on
      ),

    hasCleanupRun:
      isFunction(
        AppCore?.cleanup?.run
      ),

    browser:
      isBrowser(),
  };
}

export default {
  buildToastEventPayload,

  emitToastShown,
  emitToastUpdated,
  emitToastDismissed,

  bindToastGlobalEvents,
  bindToastDomEvents,
  unbindToastEvents,

  getToastEventsSnapshot,
};

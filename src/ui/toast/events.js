/* =========================================================
   Onion SPA - Toast Events
   Archivo: src/ui/toast/events.js

   Responsabilidades:
   - bind de eventos globales del sistema toast
   - bind de eventos dom para dismiss
   - puente con AppCore.events
   - refresh live al cambiar idioma
   - cero acoplamiento al render concreto
   - endurecer payloads y binds duplicados
========================================================= */

import { AppCore } from "../../core/index.js";
import { TOAST_SCOPE } from "./constants.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let globalEventsBound = false;
let domEventsBound = false;

/* =========================================================
   HELPERS
========================================================= */

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function resolveCleanupScope() {
  try {
    const cleanup = AppCore?.cleanup;

    if (typeof cleanup?.scope === "function") {
      return cleanup.scope(TOAST_SCOPE);
    }
  } catch {}

  return TOAST_SCOPE;
}

function getEventDetail(event) {
  const detail = event?.detail;

  if (isObject(detail)) {
    return detail;
  }

  if (typeof detail === "string") {
    return {
      message: detail,
    };
  }

  return null;
}

function normalizeToastDetail(detail) {
  if (!isObject(detail)) {
    return null;
  }

  return {
    ...detail,
    id: safeText(detail.id, ""),
    type: safeText(detail.type, ""),
    title: safeText(detail.title, ""),
    message: safeText(
      detail.message ?? detail.text,
      ""
    ),
    text: safeText(
      detail.text ?? detail.message,
      ""
    ),
  };
}

function safeCleanupEvent(scope, eventName, handler) {
  try {
    const cleanup = AppCore?.cleanup;

    if (typeof cleanup?.event !== "function") {
      return;
    }

    cleanup.event(scope, eventName, handler);
  } catch {}
}

function safeCleanupOn(scope, node, eventName, handler) {
  try {
    const cleanup = AppCore?.cleanup;

    if (typeof cleanup?.on !== "function") {
      return;
    }

    cleanup.on(scope, node, eventName, handler);
  } catch {}
}

/* =========================================================
   PAYLOAD
========================================================= */

export function buildToastEventPayload(
  item,
  extra = {}
) {
  return {
    id: item?.id || null,
    type: item?.type || null,
    title: item?.title || "",
    message: item?.message || "",
    duration: item?.duration ?? 0,
    closable: Boolean(item?.closable),
    useDefaultTitle: Boolean(item?.useDefaultTitle),
    useDefaultMessage: Boolean(item?.useDefaultMessage),
    ...extra,
  };
}

/* =========================================================
   EMIT
========================================================= */

export function emitToastShown(item) {
  try {
    AppCore?.events?.emit?.(
      "toast:shown",
      buildToastEventPayload(item)
    );
  } catch {}
}

export function emitToastUpdated(item) {
  try {
    AppCore?.events?.emit?.(
      "toast:updated",
      buildToastEventPayload(item)
    );
  } catch {}
}

export function emitToastDismissed(item) {
  try {
    AppCore?.events?.emit?.(
      "toast:dismissed",
      buildToastEventPayload(item)
    );
  } catch {}
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
  info,
  loading,
  refreshAllToastsLanguage,
} = {}) {
  const cleanup = AppCore?.cleanup;

  if (typeof cleanup?.event !== "function") {
    return null;
  }

  if (globalEventsBound) {
    return resolveCleanupScope();
  }

  const scope = resolveCleanupScope();

  safeCleanupEvent(scope, "toast:show", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail || !isFunction(show)) {
      return;
    }

    show({
      ...detail,
    });
  });

  safeCleanupEvent(scope, "toast:success", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail || !isFunction(success)) {
      return;
    }

    success(
      detail.message || detail.text || "",
      detail
    );
  });

  safeCleanupEvent(scope, "toast:error", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail || !isFunction(error)) {
      return;
    }

    error(
      detail.message || detail.text || "",
      detail
    );
  });

  safeCleanupEvent(scope, "toast:warning", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail || !isFunction(warning)) {
      return;
    }

    warning(
      detail.message || detail.text || "",
      detail
    );
  });

  safeCleanupEvent(scope, "toast:info", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail || !isFunction(info)) {
      return;
    }

    info(
      detail.message || detail.text || "",
      detail
    );
  });

  safeCleanupEvent(scope, "toast:loading", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail || !isFunction(loading)) {
      return;
    }

    loading(
      detail.message || detail.text || "",
      detail
    );
  });

  safeCleanupEvent(scope, "toast:update", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!detail?.id || !isFunction(update)) {
      return;
    }

    update(detail.id, detail);
  });

  safeCleanupEvent(scope, "toast:dismiss", (event) => {
    const detail = normalizeToastDetail(
      getEventDetail(event)
    );

    if (!isFunction(dismiss)) {
      return;
    }

    if (!detail?.id) {
      dismiss();
      return;
    }

    dismiss(detail.id);
  });

  safeCleanupEvent(scope, "toast:clear", () => {
    if (!isFunction(clear)) {
      return;
    }

    clear();
  });

  safeCleanupEvent(scope, "app:lang:change", () => {
    if (!isFunction(refreshAllToastsLanguage)) {
      return;
    }

    refreshAllToastsLanguage();
  });

  globalEventsBound = true;

  return scope;
}

/* =========================================================
   DOM EVENT BINDING
========================================================= */

export function bindToastDomEvents({
  dismiss,
} = {}) {
  const cleanup = AppCore?.cleanup;

  if (typeof cleanup?.on !== "function") {
    return null;
  }

  if (domEventsBound) {
    return resolveCleanupScope();
  }

  const scope = resolveCleanupScope();

  safeCleanupOn(scope, document, "click", (event) => {
    const closeBtn =
      event.target?.closest?.("[data-toast-dismiss]");

    if (!closeBtn) {
      return;
    }

    const toastId =
      closeBtn.getAttribute("data-toast-dismiss") ||
      closeBtn
        .closest?.("[data-toast-id]")
        ?.dataset?.toastId ||
      null;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (isFunction(dismiss)) {
      dismiss(toastId || null);
    }
  });

  domEventsBound = true;

  return scope;
}

/* =========================================================
   UNBIND
========================================================= */

export function unbindToastEvents() {
  try {
    AppCore?.cleanup?.run?.(TOAST_SCOPE);
  } catch {}

  globalEventsBound = false;
  domEventsBound = false;

  return true;
}

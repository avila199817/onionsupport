/* =========================================================
   Onion SPA - Toast Events
   Archivo: src/ui/toast/events.js

   Responsabilidades:
   - bind de eventos globales del sistema toast
   - bind de eventos dom para dismiss
   - puente con AppCore.events
   - refresh live al cambiar idioma
   - cero acoplamiento al render concreto
========================================================= */

import { AppCore } from "../../core/index.js";
import { TOAST_SCOPE } from "./constants.js";

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

  if (!cleanup?.event) {
    return null;
  }

  const scope =
    cleanup?.scope?.(TOAST_SCOPE) || TOAST_SCOPE;

  cleanup.event(
    scope,
    "toast:show",
    ({ detail }) => {
      if (!detail || typeof show !== "function") {
        return;
      }

      show({
        ...detail,
      });
    }
  );

  cleanup.event(
    scope,
    "toast:success",
    ({ detail }) => {
      if (!detail || typeof success !== "function") {
        return;
      }

      success(
        detail.message || detail.text || "",
        detail
      );
    }
  );

  cleanup.event(
    scope,
    "toast:error",
    ({ detail }) => {
      if (!detail || typeof error !== "function") {
        return;
      }

      error(
        detail.message || detail.text || "",
        detail
      );
    }
  );

  cleanup.event(
    scope,
    "toast:warning",
    ({ detail }) => {
      if (!detail || typeof warning !== "function") {
        return;
      }

      warning(
        detail.message || detail.text || "",
        detail
      );
    }
  );

  cleanup.event(
    scope,
    "toast:info",
    ({ detail }) => {
      if (!detail || typeof info !== "function") {
        return;
      }

      info(
        detail.message || detail.text || "",
        detail
      );
    }
  );

  cleanup.event(
    scope,
    "toast:loading",
    ({ detail }) => {
      if (!detail || typeof loading !== "function") {
        return;
      }

      loading(
        detail.message || detail.text || "",
        detail
      );
    }
  );

  cleanup.event(
    scope,
    "toast:update",
    ({ detail }) => {
      if (
        !detail?.id ||
        typeof update !== "function"
      ) {
        return;
      }

      update(detail.id, detail);
    }
  );

  cleanup.event(
    scope,
    "toast:dismiss",
    ({ detail }) => {
      if (
        !detail?.id ||
        typeof dismiss !== "function"
      ) {
        return;
      }

      dismiss(detail.id);
    }
  );

  cleanup.event(
    scope,
    "toast:clear",
    () => {
      if (typeof clear !== "function") {
        return;
      }

      clear();
    }
  );

  cleanup.event(
    scope,
    "app:lang:change",
    () => {
      if (
        typeof refreshAllToastsLanguage !==
        "function"
      ) {
        return;
      }

      refreshAllToastsLanguage();
    }
  );

  return scope;
}

/* =========================================================
   DOM EVENT BINDING
========================================================= */

export function bindToastDomEvents({
  dismiss,
} = {}) {
  const cleanup = AppCore?.cleanup;

  if (!cleanup?.on) {
    return null;
  }

  const scope =
    cleanup?.scope?.(TOAST_SCOPE) || TOAST_SCOPE;

  cleanup.on(
    scope,
    document,
    "click",
    (event) => {
      const closeBtn =
        event.target?.closest?.(
          "[data-toast-dismiss]"
        );

      if (!closeBtn) {
        return;
      }

      const toastId =
        closeBtn.getAttribute(
          "data-toast-dismiss"
        ) ||
        closeBtn
          .closest?.("[data-toast-id]")
          ?.dataset?.toastId ||
        null;

      if (!toastId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (typeof dismiss === "function") {
        dismiss(toastId);
      }
    }
  );

  return scope;
}

/* =========================================================
   UNBIND
========================================================= */

export function unbindToastEvents() {
  try {
    AppCore?.cleanup?.run?.(TOAST_SCOPE);
  } catch {}

  return true;
}

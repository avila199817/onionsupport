/* =========================================================
   Onion SPA - App Events (FIXED / HARDENED)
   Archivo: src/app/events.js
========================================================= */

import { getCurrentPublicPath } from "./helpers.js";

let eventsBound = false;
let langChangeInFlight = false;
let lastToastKey = "";
let lastToastAt = 0;

/* ===================================================== */

function safeText(v, fb = "") {
  if (v === null || v === undefined) return fb;
  const t = String(v).trim();
  return t || fb;
}

function safeLog(AppCore, ...args) {
  try { AppCore?.utils?.log?.(...args); } catch {}
}

function safeWarn(AppCore, ...args) {
  try { AppCore?.utils?.warn?.(...args); } catch {}
}

function safeEmit(AppCore, name, payload = {}) {
  try { AppCore?.events?.emit?.(name, payload); } catch {}
}

function safeToast(Toast, type, message, options = {}) {
  try {
    if (typeof Toast?.[type] === "function") {
      return Toast[type](message, options);
    }

    return Toast?.show?.({
      type,
      message,
      ...options,
    });
  } catch {}
}

function toastOnce(
  Toast,
  type,
  message,
  options = {},
  dedupeMs = 1200
) {
  const key = `${type}:${message}:${options?.title || ""}`;
  const now = Date.now();

  if (
    key === lastToastKey &&
    now - lastToastAt < dedupeMs
  ) {
    return;
  }

  lastToastKey = key;
  lastToastAt = now;

  safeToast(
    Toast,
    type,
    message,
    options
  );
}

function safeSetLang(lang = "es") {
  try {
    document.documentElement.lang = lang;
  } catch {}
}

function safeSyncUI(syncUserUI, AppCore) {
  try {
    syncUserUI?.(AppCore);
  } catch {}
}

function resolvePublicPath(AppCore, detail = {}) {
  return (
    safeText(detail?.publicPath) ||
    safeText(detail?.path) ||
    safeText(getCurrentPublicPath(AppCore)) ||
    "/"
  );
}

/* ===================================================== */

export function bindAppEvents({
  AppCore,
  I18n,
  Toast,
  scope,
  syncUserUI,
  rerenderCurrentRoute,
  applyPostRenderLoaderPolicy,
} = {}) {
  if (!AppCore?.cleanup?.event) {
    return false;
  }

  if (eventsBound) {
    return true;
  }

  /* =====================================================
     USER
  ===================================================== */

  AppCore.cleanup.event(
    scope,
    "app:user:change",
    () => safeSyncUI(syncUserUI, AppCore)
  );

  AppCore.cleanup.event(
    scope,
    "app:session:cleared",
    () => safeSyncUI(syncUserUI, AppCore)
  );

  AppCore.cleanup.event(
    scope,
    "app:ui:ready",
    () => safeSyncUI(syncUserUI, AppCore)
  );

  AppCore.cleanup.event(
    scope,
    "app:ready",
    () => safeSyncUI(syncUserUI, AppCore)
  );

  /* =====================================================
     LANGUAGE
  ===================================================== */

  AppCore.cleanup.event(
    scope,
    "app:lang:change",
    async ({ detail } = {}) => {
      const lang =
        safeText(detail?.lang) ||
        safeText(I18n?.getLang?.()) ||
        safeText(AppCore?.state?.lang) ||
        "es";

      safeSetLang(lang);

      if (langChangeInFlight) return;
      langChangeInFlight = true;

      try {
        await Promise.resolve(
          rerenderCurrentRoute?.()
        );
      } catch (e) {
        safeWarn(AppCore, e);
      } finally {
        langChangeInFlight = false;
      }

      toastOnce(
        Toast,
        "success",
        "Idioma actualizado",
        {
          title: "Idioma",
          duration: 2200,
        }
      );
    }
  );

  /* =====================================================
     AUTH
  ===================================================== */

  AppCore.cleanup.event(
    scope,
    "auth:login:success",
    () => {
      safeSyncUI(syncUserUI, AppCore);

      toastOnce(
        Toast,
        "success",
        "Sesión iniciada correctamente.",
        {
          title: "Bienvenido",
        }
      );
    }
  );

  AppCore.cleanup.event(
    scope,
    "auth:logout:success",
    () => {
      safeSyncUI(syncUserUI, AppCore);

      toastOnce(
        Toast,
        "info",
        "Sesión cerrada correctamente.",
        {
          title: "Sesión finalizada",
        }
      );
    }
  );

  /* =====================================================
     ROUTER
  ===================================================== */

  AppCore.cleanup.event(
    scope,
    "router:rendered",
    ({ detail } = {}) => {
      const publicPath =
        resolvePublicPath(
          AppCore,
          detail
        );

      try {
        AppCore?.setPublicPath?.(
          publicPath
        );
      } catch {}

      try {
        applyPostRenderLoaderPolicy?.();
      } catch {}

      safeSyncUI(
        syncUserUI,
        AppCore
      );

      safeEmit(
        AppCore,
        "app:user-ui:sync",
        {
          route: publicPath,
        }
      );
    }
  );

  /* ===================================================== */

  eventsBound = true;

  safeLog(
    AppCore,
    "App events ready."
  );

  return true;
}

export default {
  bindAppEvents,
};

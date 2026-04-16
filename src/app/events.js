/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   RESPONSABILIDADES:
   - bind eventos globales app
   - sincronizar UI tras sesión
   - rerender ruta al cambiar idioma
   - gestionar notificaciones auth
   - reaccionar eventos router

   HARDENING EXTREMO:
   - bind idempotente
   - tolerancia total a módulos parciales
   - logs seguros enterprise
   - notificaciones sin duplicados agresivos
   - sync route/UI robusta
   - cero throws accidentales
   - no forzar publicPath incorrecto tras render
   - no duplicar rerenders por idioma
========================================================= */

import {
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let eventsBound = false;
let langChangeInFlight = false;
let lastToastKey = "";
let lastToastAt = 0;

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeSetState(
  AppCore,
  payload = {}
) {
  try {
    AppCore?.setState?.(payload);
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        payload
      );
    }
  } catch {}
}

function safeSetPublicPath(
  AppCore,
  path = "/"
) {
  try {
    return AppCore?.setPublicPath?.(path);
  } catch {
    return path;
  }
}

function safeSetDocumentLang(
  lang = "es"
) {
  if (!isBrowser()) {
    return;
  }

  try {
    document.documentElement.setAttribute(
      "lang",
      lang
    );
  } catch {}
}

function safeToast(
  Toast,
  type = "info",
  message = "",
  options = {}
) {
  try {
    const method = Toast?.[type];

    if (
      typeof method === "function"
    ) {
      return method(
        message,
        options
      );
    }

    return Toast?.show?.({
      ...options,
      type,
      message,
    });
  } catch {
    return null;
  }
}

function toastOnce(
  Toast,
  type,
  message,
  options = {},
  dedupeMs = 1200
) {
  const key = [
    type,
    safeText(options?.title, ""),
    safeText(message, ""),
  ].join("::");

  const now = Date.now();

  if (
    key &&
    key === lastToastKey &&
    now - lastToastAt < dedupeMs
  ) {
    return null;
  }

  lastToastKey = key;
  lastToastAt = now;

  return safeToast(
    Toast,
    type,
    message,
    options
  );
}

function resolveLang(
  detail,
  I18n,
  AppCore
) {
  return (
    safeText(
      detail?.lang,
      ""
    ) ||
    safeText(
      I18n?.getLang?.(),
      ""
    ) ||
    safeText(
      AppCore?.state?.lang,
      ""
    ) ||
    safeText(
      AppCore?.config?.defaultLang,
      ""
    ) ||
    "es"
  );
}

function resolveRenderedPublicPath(
  AppCore,
  detail = {}
) {
  return (
    safeText(
      detail?.publicPath,
      ""
    ) ||
    safeText(
      detail?.path,
      ""
    ) ||
    safeText(
      getCurrentPublicPath(
        AppCore
      ),
      ""
    ) ||
    "/"
  );
}

/* =========================================================
   MAIN
========================================================= */

export function bindAppEvents({
  AppCore,
  I18n,
  Toast,
  scope,
  syncUserUI,
  rerenderCurrentRoute,
  applyPostRenderLoaderPolicy,
} = {}) {
  if (
    !AppCore?.cleanup?.event
  ) {
    return false;
  }

  if (eventsBound) {
    return true;
  }

  /* ======================================================
     USER / SESSION
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "app:user:change",
    () => {
      try {
        syncUserUI?.(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "syncUserUI falló en app:user:change",
          error
        );
      }
    }
  );

  AppCore.cleanup.event(
    scope,
    "app:session:cleared",
    () => {
      try {
        syncUserUI?.(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "syncUserUI falló en app:session:cleared",
          error
        );
      }
    }
  );

  /* ======================================================
     LANGUAGE
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "app:lang:change",
    async ({ detail } = {}) => {
      const lang = resolveLang(
        detail,
        I18n,
        AppCore
      );

      safeSetState(
        AppCore,
        { lang }
      );

      safeSetDocumentLang(
        lang
      );

      if (langChangeInFlight) {
        safeLog(
          AppCore,
          "Cambio de idioma omitido: ya hay rerender en curso.",
          { lang }
        );
        return;
      }

      langChangeInFlight = true;

      try {
        await Promise.resolve(
          rerenderCurrentRoute?.()
        );
      } catch (error) {
        safeWarn(
          AppCore,
          "rerenderCurrentRoute() falló tras cambio de idioma.",
          error
        );
      } finally {
        langChangeInFlight = false;
      }

      toastOnce(
        Toast,
        "success",
        I18n?.t?.(
          "settings.languageChanged",
          {},
          "Idioma actualizado"
        ) || "Idioma actualizado",
        {
          title:
            I18n?.t?.(
              "settings.language",
              {},
              "Idioma"
            ) || "Idioma",
          duration: 2200,
        }
      );

      safeLog(
        AppCore,
        "Idioma cambiado.",
        {
          lang,
          route:
            getCurrentPublicPath(
              AppCore
            ),
        }
      );
    }
  );

  /* ======================================================
     AUTH
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "auth:login:success",
    () => {
      try {
        syncUserUI?.(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "syncUserUI falló en auth:login:success",
          error
        );
      }

      toastOnce(
        Toast,
        "success",
        "Sesión iniciada correctamente.",
        {
          title: "Bienvenido",
          duration: 2800,
        }
      );
    }
  );

  AppCore.cleanup.event(
    scope,
    "auth:logout:success",
    () => {
      try {
        syncUserUI?.(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "syncUserUI falló en auth:logout:success",
          error
        );
      }

      toastOnce(
        Toast,
        "info",
        "Sesión cerrada correctamente.",
        {
          title:
            "Sesión finalizada",
          duration: 2200,
        }
      );
    }
  );

  /* ======================================================
     ROUTER
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "router:before-render",
    ({ detail } = {}) => {
      safeLog(
        AppCore,
        "Router before render:",
        {
          path:
            detail?.path ?? null,
          canonicalPath:
            detail?.canonicalPath ??
            null,
          publicPath:
            detail?.publicPath ??
            null,
          username:
            detail?.username ??
            null,
        }
      );
    }
  );

  AppCore.cleanup.event(
    scope,
    "router:rendered",
    ({ detail } = {}) => {
      const publicPath =
        resolveRenderedPublicPath(
          AppCore,
          detail
        );

      safeSetPublicPath(
        AppCore,
        publicPath
      );

      try {
        applyPostRenderLoaderPolicy?.();
      } catch (error) {
        safeWarn(
          AppCore,
          "applyPostRenderLoaderPolicy() falló.",
          error
        );
      }

      try {
        syncUserUI?.(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "syncUserUI falló en router:rendered",
          error
        );
      }

      safeEmit(
        AppCore,
        "app:user-ui:sync",
        {
          route: publicPath,
        }
      );

      safeLog(
        AppCore,
        "Ruta renderizada:",
        {
          publicPath,
          canonicalPath:
            detail?.canonicalPath ??
            null,
          username:
            detail?.username ??
            null,
          found: Boolean(
            detail?.found
          ),
          forbidden: Boolean(
            detail?.forbidden
          ),
          lang:
            AppCore?.state?.lang,
        }
      );
    }
  );

  eventsBound = true;

  safeLog(
    AppCore,
    "App events bind completado."
  );

  return true;
}

export default {
  bindAppEvents,
};

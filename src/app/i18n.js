/* =========================================================
   Onion SPA - App I18n
   Archivo: src/app/i18n.js

   Responsabilidades:
   - inicializar i18n de la aplicación
   - sincronizar idioma activo con AppCore
   - aplicar atributo lang al documento
   - rerenderizar la ruta actual al cambiar idioma
   - registrar módulo i18n en AppCore
   - endurecer fallback multilenguaje

   HARDENING PRO:
   - idempotencia total
   - tolerancia si I18n parcial
   - rerender serializado
   - logs seguros
   - browser/server safe
========================================================= */

import {
  getCurrentPublicPath,
  registerModule,
} from "./helpers.js";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeLog(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.log?.(
      ...args
    );
  } catch {}
}

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      ...args
    );
  } catch {}
}

function safeSetState(
  AppCore,
  payload = {}
) {
  try {
    AppCore?.setState?.(
      payload
    );
  } catch {}

  try {
    if (
      AppCore?.state
    ) {
      Object.assign(
        AppCore.state,
        payload
      );
    }
  } catch {}
}

function safeLang(
  value,
  fallback = "es"
) {
  const lang =
    String(
      value || ""
    ).trim()
      .toLowerCase();

  return (
    lang ||
    fallback
  );
}

function setDocumentLang(
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

/* =========================================================
   STATE SYNC
========================================================= */

export function syncLangState(
  AppCore,
  I18n
) {
  try {
    const lang =
      safeLang(
        I18n?.getLang?.() ||
        AppCore?.state?.lang ||
        AppCore?.config
          ?.defaultLang ||
        "es"
      );

    safeSetState(
      AppCore,
      {
        lang,
      }
    );

    setDocumentLang(
      lang
    );

    return lang;
  } catch {
    const fallbackLang =
      safeLang(
        AppCore?.state
          ?.lang ||
        AppCore?.config
          ?.defaultLang ||
        "es"
      );

    safeSetState(
      AppCore,
      {
        lang:
          fallbackLang,
      }
    );

    setDocumentLang(
      fallbackLang
    );

    return fallbackLang;
  }
}

/* =========================================================
   INIT
========================================================= */

export function initI18n({
  AppCore,
  I18n,
  state,
} = {}) {
  if (
    state?.i18nInitialized
  ) {
    syncLangState(
      AppCore,
      I18n
    );

    return true;
  }

  try {
    I18n?.boot?.();
  } catch (error) {
    safeWarn(
      AppCore,
      "I18n.boot falló; fallback activo.",
      error
    );
  }

  const lang =
    syncLangState(
      AppCore,
      I18n
    );

  registerModule(
    AppCore,
    "i18n",
    I18n
  );

  if (state) {
    state.i18nInitialized =
      true;
  }

  safeLog(
    AppCore,
    "I18n inicializado.",
    {
      lang,
      available:
        I18n?.getAvailable?.() ||
        [],
    }
  );

  return true;
}

/* =========================================================
   RERENDER CURRENT ROUTE
========================================================= */

let rerenderPromise =
  null;

export async function rerenderCurrentRoute({
  AppCore,
  Router,
  I18n,
  applyPostRenderLoaderPolicy,
  syncUserUI,
} = {}) {
  if (
    rerenderPromise
  ) {
    return rerenderPromise;
  }

  rerenderPromise =
    (async () => {
      try {
        const currentPath =
          getCurrentPublicPath(
            AppCore
          ) || "/";

        const lang =
          safeLang(
            I18n?.getLang?.() ||
            AppCore?.state
              ?.lang ||
            "es"
          );

        safeLog(
          AppCore,
          "Rerender por cambio de idioma.",
          {
            path:
              currentPath,
            lang,
          }
        );

        await Promise.resolve(
          Router?.render?.(
            currentPath,
            {
              skipHistory: true,
              replaceState: true,
              force: true,
            }
          )
        );

        try {
          AppCore?.setPublicPath?.(
            currentPath
          );
        } catch {}

        try {
          applyPostRenderLoaderPolicy?.();
        } catch {}

        try {
          syncUserUI?.(
            AppCore
          );
        } catch {}

        return true;
      } catch (error) {
        safeWarn(
          AppCore,
          "rerenderCurrentRoute() falló.",
          error
        );

        return false;
      } finally {
        rerenderPromise =
          null;
      }
    })();

  return rerenderPromise;
}

/* =========================================================
   DEBUG
========================================================= */

export function getI18nSnapshot(
  AppCore,
  I18n
) {
  return {
    lang:
      AppCore?.state
        ?.lang ||
      "es",

    documentLang:
      isBrowser()
        ? document.documentElement.getAttribute(
            "lang"
          )
        : null,

    available:
      I18n?.getAvailable?.() ||
      [],

    initialized:
      Boolean(
        I18n
      ),
  };
}

export default {
  syncLangState,
  initI18n,
  rerenderCurrentRoute,
  getI18nSnapshot,
};

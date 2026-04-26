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
   - exponer snapshots de diagnóstico

   HARDENING PRO:
   - idempotencia total
   - tolerancia si I18n parcial
   - compatibilidad con firmas legacy y modernas
   - rerender serializado
   - rerender con fallback Router.render / Router.navigate
   - logs seguros
   - browser/server safe
   - cero throws accidentales
========================================================= */

import {
  getCurrentPublicPath,
  registerModule,
} from "./helpers.js";

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  UI_CONSTANTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_SCOPE =
  APP_SCOPES?.i18n ||
  APP_SCOPE ||
  "app:i18n";

const FALLBACK_LANG =
  UI_CONSTANTS?.fallbackLang ||
  UI_CONSTANTS?.defaultLang ||
  "es";

const DEFAULT_LANG =
  UI_CONSTANTS?.defaultLang ||
  FALLBACK_LANG ||
  "es";

const LANG_STORAGE_KEY =
  "lang";

const I18N_EVENTS =
  Object.freeze({
    langChange:
      APP_EVENTS?.langChange || "app:lang:change",

    i18nReady:
      "app:i18n:ready",

    i18nSync:
      "app:i18n:sync",

    i18nError:
      "app:i18n:error",

    i18nRerenderStart:
      "app:i18n:rerender:start",

    i18nRerenderDone:
      "app:i18n:rerender:done",

    i18nRerenderError:
      "app:i18n:rerender:error",
  });

const INIT_METHODS =
  Object.freeze([
    "boot",
    "init",
    "initialize",
    "start",
  ]);

const SET_LANG_METHODS =
  Object.freeze([
    "setLang",
    "setLanguage",
    "changeLang",
    "changeLanguage",
    "use",
  ]);

const GET_LANG_METHODS =
  Object.freeze([
    "getLang",
    "getLanguage",
    "getCurrentLang",
    "current",
  ]);

const GET_AVAILABLE_METHODS =
  Object.freeze([
    "getAvailable",
    "getAvailableLangs",
    "getLanguages",
    "available",
  ]);

/* =========================================================
   MODULE STATE
========================================================= */

let initialized = false;
let boundCore = null;
let rerenderPromise = null;
let rerenderQueued = false;

const i18nState = {
  initialized: false,
  lastLang: "",
  lastSyncAt: 0,
  lastRerenderAt: 0,
  rerendering: false,
  rerenderCount: 0,
  syncCount: 0,
  errors: [],
};

/* =========================================================
   BASICS
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

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeLang(value, fallback = FALLBACK_LANG) {
  const raw =
    safeText(value, fallback)
      .toLowerCase()
      .replace("_", "-");

  const lang =
    raw.split("-")[0] || fallback;

  return safeText(
    lang,
    fallback
  );
}

function safeInvoke(fn, thisArg = null, args = []) {
  try {
    if (isFunction(fn)) {
      return fn.apply(
        thisArg,
        safeArray(args)
      );
    }
  } catch {}

  return undefined;
}

function safeMethod(target, methodName, args = []) {
  const object =
    ensureObject(target);

  return safeInvoke(
    object?.[methodName],
    object,
    args
  );
}

function normalizeDeps(first = {}, second = null, extra = {}) {
  if (
    isObject(first) &&
    (
      "AppCore" in first ||
      "I18n" in first ||
      "Router" in first ||
      "state" in first
    )
  ) {
    return {
      ...first,
    };
  }

  return {
    ...ensureObject(extra),
    AppCore:
      first,

    I18n:
      second,
  };
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[AppI18n]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AppI18n]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AppI18n]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(
      "[AppI18n]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[AppI18n]",
      ...args
    );
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName, payload = {}) {
  if (!eventName) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    emitted = true;
  } catch {}

  if (
    safeWindowDispatch(
      eventName,
      payload
    )
  ) {
    emitted = true;
  }

  return emitted;
}

function pushError(AppCore, error, source = "i18n") {
  const snapshot = {
    source:
      safeText(source, "i18n"),

    message:
      safeText(
        error?.message || error,
        "Error i18n."
      ),

    at:
      safeIsoDate(),
  };

  i18nState.errors.unshift(snapshot);

  if (i18nState.errors.length > 8) {
    i18nState.errors =
      i18nState.errors.slice(0, 8);
  }

  safeEmit(
    AppCore,
    I18N_EVENTS.i18nError,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   STORAGE / DOCUMENT
========================================================= */

function readStoredLang() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.localStorage?.getItem?.(LANG_STORAGE_KEY),
      ""
    );
  } catch {}

  return "";
}

function writeStoredLang(lang = "") {
  if (!isBrowser()) {
    return false;
  }

  const cleanLang =
    safeLang(lang, "");

  if (!cleanLang) {
    return false;
  }

  try {
    window.localStorage?.setItem?.(
      LANG_STORAGE_KEY,
      cleanLang
    );

    return true;
  } catch {}

  return false;
}

function getDocumentLang() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      document.documentElement.getAttribute("lang"),
      ""
    );
  } catch {}

  return "";
}

function setDocumentLang(lang = FALLBACK_LANG) {
  if (!isBrowser()) {
    return false;
  }

  const cleanLang =
    safeLang(lang, FALLBACK_LANG);

  try {
    document.documentElement.setAttribute(
      "lang",
      cleanLang
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   I18N ACCESSORS
========================================================= */

function getAvailableLangs(I18n) {
  for (const methodName of GET_AVAILABLE_METHODS) {
    try {
      const result =
        safeMethod(
          I18n,
          methodName
        );

      if (Array.isArray(result)) {
        return result
          .map((item) => safeLang(item, ""))
          .filter(Boolean);
      }

      if (isObject(result)) {
        return Object.keys(result)
          .map((item) => safeLang(item, ""))
          .filter(Boolean);
      }
    } catch {}
  }

  try {
    if (Array.isArray(I18n?.available)) {
      return I18n.available
        .map((item) => safeLang(item, ""))
        .filter(Boolean);
    }
  } catch {}

  try {
    if (isObject(I18n?.dictionaries)) {
      return Object.keys(I18n.dictionaries)
        .map((item) => safeLang(item, ""))
        .filter(Boolean);
    }
  } catch {}

  try {
    if (isObject(I18n?.locales)) {
      return Object.keys(I18n.locales)
        .map((item) => safeLang(item, ""))
        .filter(Boolean);
    }
  } catch {}

  return [
    "es",
    "en",
    "ca",
  ];
}

function isAvailableLang(I18n, lang = "") {
  const cleanLang =
    safeLang(lang, "");

  if (!cleanLang) {
    return false;
  }

  const available =
    getAvailableLangs(I18n);

  if (!available.length) {
    return true;
  }

  return available.includes(cleanLang);
}

function normalizeAvailableLang(I18n, value = "", fallback = FALLBACK_LANG) {
  const cleanLang =
    safeLang(value, fallback);

  if (
    isAvailableLang(
      I18n,
      cleanLang
    )
  ) {
    return cleanLang;
  }

  const fallbackLang =
    safeLang(fallback, FALLBACK_LANG);

  if (
    isAvailableLang(
      I18n,
      fallbackLang
    )
  ) {
    return fallbackLang;
  }

  const available =
    getAvailableLangs(I18n);

  return (
    available[0] ||
    FALLBACK_LANG
  );
}

function getI18nLang(I18n) {
  for (const methodName of GET_LANG_METHODS) {
    try {
      const result =
        safeMethod(
          I18n,
          methodName
        );

      if (result) {
        return safeLang(result, "");
      }
    } catch {}
  }

  return (
    safeLang(I18n?.lang, "") ||
    safeLang(I18n?.currentLang, "") ||
    safeLang(I18n?.language, "") ||
    ""
  );
}

function setI18nLang(I18n, lang = FALLBACK_LANG, options = {}) {
  const cleanLang =
    safeLang(lang, FALLBACK_LANG);

  let ok = false;

  for (const methodName of SET_LANG_METHODS) {
    try {
      if (!isFunction(I18n?.[methodName])) {
        continue;
      }

      I18n[methodName](
        cleanLang,
        options
      );

      ok = true;
      break;
    } catch {}
  }

  try {
    if (
      I18n &&
      typeof I18n === "object"
    ) {
      I18n.lang =
        cleanLang;

      ok = true;
    }
  } catch {}

  return ok;
}

/* =========================================================
   APP STATE
========================================================= */

function safeSetState(AppCore, payload = {}) {
  const cleanPayload =
    ensureObject(payload);

  try {
    AppCore?.setState?.(
      cleanPayload
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPayload
      );
    }
  } catch {}
}

function resolveInitialLang(AppCore, I18n, preferred = "") {
  return normalizeAvailableLang(
    I18n,
    preferred ||
      getI18nLang(I18n) ||
      AppCore?.state?.lang ||
      AppCore?.config?.defaultLang ||
      AppCore?.config?.lang ||
      readStoredLang() ||
      getDocumentLang() ||
      DEFAULT_LANG,
    FALLBACK_LANG
  );
}

function registerI18nModule(AppCore, I18n) {
  let registered = false;

  try {
    registerModule(
      AppCore,
      "i18n",
      I18n
    );

    registered = true;
  } catch {}

  try {
    AppCore.modules =
      AppCore.modules || {};

    AppCore.modules.I18n =
      I18n;

    AppCore.modules.i18n =
      I18n;

    registered = true;
  } catch {}

  try {
    AppCore.I18n =
      I18n;

    AppCore.i18n =
      I18n;

    registered = true;
  } catch {}

  return registered;
}

/* =========================================================
   CORE BINDING
========================================================= */

function bindCoreToI18n(AppCore, I18n) {
  if (
    !AppCore ||
    !I18n
  ) {
    return false;
  }

  if (boundCore === AppCore) {
    return true;
  }

  let ok = false;

  try {
    if (isFunction(I18n?.bindCore)) {
      I18n.bindCore(AppCore);
      ok = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "I18n.bindCore(AppCore) falló.",
      error
    );
  }

  try {
    if (isFunction(I18n?.configure)) {
      I18n.configure({
        core:
          AppCore,

        AppCore,
      });

      ok = true;
    }
  } catch {}

  boundCore =
    AppCore;

  return ok;
}

function bootI18nModule(AppCore, I18n, lang = FALLBACK_LANG) {
  if (!I18n) {
    return false;
  }

  let booted = false;

  for (const methodName of INIT_METHODS) {
    try {
      if (!isFunction(I18n?.[methodName])) {
        continue;
      }

      I18n[methodName]({
        AppCore,
        lang,
        fallbackLang:
          FALLBACK_LANG,
      });

      booted = true;
      break;
    } catch (error) {
      pushError(
        AppCore,
        error,
        `I18n.${methodName}`
      );

      safeWarn(
        AppCore,
        `I18n.${methodName} falló; fallback activo.`,
        error
      );
    }
  }

  return booted;
}

/* =========================================================
   STATE SYNC
========================================================= */

export function syncLangState(first = {}, second = null) {
  const {
    AppCore,
    I18n,
    lang: preferredLang,
    reason = "sync-lang-state",
    persist = true,
    emit = true,
  } = normalizeDeps(
    first,
    second
  );

  const finalLang =
    resolveInitialLang(
      AppCore,
      I18n,
      preferredLang
    );

  safeSetState(
    AppCore,
    {
      lang:
        finalLang,

      fallbackLang:
        FALLBACK_LANG,

      availableLangs:
        getAvailableLangs(I18n),
    }
  );

  setDocumentLang(
    finalLang
  );

  setI18nLang(
    I18n,
    finalLang,
    {
      silent:
        true,

      reason,
    }
  );

  if (persist) {
    writeStoredLang(
      finalLang
    );
  }

  i18nState.lastLang =
    finalLang;

  i18nState.lastSyncAt =
    Date.now();

  i18nState.syncCount += 1;

  const payload = {
    lang:
      finalLang,

    fallbackLang:
      FALLBACK_LANG,

    available:
      getAvailableLangs(I18n),

    reason:
      safeText(reason, "sync-lang-state"),

    at:
      safeIsoDate(i18nState.lastSyncAt),
  };

  if (emit) {
    safeEmit(
      AppCore,
      I18N_EVENTS.i18nSync,
      payload
    );
  }

  return finalLang;
}

/* =========================================================
   INIT
========================================================= */

export function initI18n(first = {}, second = null) {
  const {
    AppCore,
    I18n,
    state,
    lang: preferredLang,
    force = false,
  } = normalizeDeps(
    first,
    second
  );

  const alreadyInitialized =
    Boolean(
      initialized ||
      state?.i18nInitialized ||
      AppCore?.state?.i18nInitialized
    );

  if (
    alreadyInitialized &&
    !force
  ) {
    const lang =
      syncLangState({
        AppCore,
        I18n,
        lang:
          preferredLang,
        reason:
          "init-i18n:already-initialized",
      });

    return Boolean(lang);
  }

  bindCoreToI18n(
    AppCore,
    I18n
  );

  const initialLang =
    resolveInitialLang(
      AppCore,
      I18n,
      preferredLang
    );

  bootI18nModule(
    AppCore,
    I18n,
    initialLang
  );

  setI18nLang(
    I18n,
    initialLang,
    {
      silent:
        true,

      reason:
        "init-i18n",
    }
  );

  const lang =
    syncLangState({
      AppCore,
      I18n,
      lang:
        initialLang,
      reason:
        "init-i18n",
    });

  registerI18nModule(
    AppCore,
    I18n
  );

  initialized =
    true;

  i18nState.initialized =
    true;

  if (state) {
    state.i18nInitialized =
      true;
  }

  safeSetState(
    AppCore,
    {
      i18nInitialized:
        true,
    }
  );

  const payload = {
    lang,

    fallbackLang:
      FALLBACK_LANG,

    available:
      getAvailableLangs(I18n),

    scope:
      DEFAULT_SCOPE,

    at:
      safeIsoDate(),
  };

  safeEmit(
    AppCore,
    I18N_EVENTS.i18nReady,
    payload
  );

  safeLog(
    AppCore,
    "I18n inicializado.",
    payload
  );

  return true;
}

/* =========================================================
   LANGUAGE CHANGE
========================================================= */

export async function changeLanguage(first = {}, second = null) {
  const {
    AppCore,
    I18n,
    Router,
    lang,
    applyPostRenderLoaderPolicy,
    syncUserUI,
    rerender = true,
    persist = true,
    emit = true,
    reason = "change-language",
  } = normalizeDeps(
    first,
    second
  );

  const finalLang =
    normalizeAvailableLang(
      I18n,
      lang,
      FALLBACK_LANG
    );

  setI18nLang(
    I18n,
    finalLang,
    {
      reason,
    }
  );

  syncLangState({
    AppCore,
    I18n,
    lang:
      finalLang,
    reason,
    persist,
    emit:
      false,
  });

  const payload = {
    lang:
      finalLang,

    fallbackLang:
      FALLBACK_LANG,

    available:
      getAvailableLangs(I18n),

    reason:
      safeText(reason, "change-language"),

    at:
      safeIsoDate(),
  };

  if (emit) {
    safeEmit(
      AppCore,
      I18N_EVENTS.langChange,
      payload
    );
  }

  if (rerender) {
    await rerenderCurrentRoute({
      AppCore,
      Router,
      I18n,
      applyPostRenderLoaderPolicy,
      syncUserUI,
      reason:
        `${reason}:rerender`,
    });
  }

  return finalLang;
}

/* =========================================================
   RERENDER CURRENT ROUTE
========================================================= */

function resolveCurrentPath(AppCore, Router) {
  return (
    safeText(Router?.getCurrentPublicPath?.(), "") ||
    safeText(getCurrentPublicPath?.(AppCore), "") ||
    safeText(AppCore?.state?.publicPath, "") ||
    safeText(AppCore?.state?.route, "") ||
    "/"
  );
}

async function runRouterRender({
  AppCore,
  Router,
  path = "/",
  reason = "i18n-rerender",
} = {}) {
  const currentPath =
    safeText(path, "/");

  try {
    if (isFunction(Router?.rerenderCurrentRoute)) {
      await Promise.resolve(
        Router.rerenderCurrentRoute({
          reason,
          force:
            true,
        })
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.rerenderCurrentRoute() falló.",
      error
    );
  }

  try {
    if (isFunction(Router?.render)) {
      await Promise.resolve(
        Router.render(
          currentPath,
          {
            skipHistory:
              true,

            replaceState:
              true,

            force:
              true,

            reason,
          }
        )
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.render() falló en rerender i18n.",
      error
    );
  }

  try {
    if (isFunction(Router?.navigate)) {
      await Promise.resolve(
        Router.navigate(
          currentPath,
          {
            replaceState:
              true,

            force:
              true,

            reason,
          }
        )
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate() falló en rerender i18n.",
      error
    );
  }

  return false;
}

function syncAfterRender({
  AppCore,
  path,
  applyPostRenderLoaderPolicy,
  syncUserUI,
} = {}) {
  try {
    AppCore?.setPublicPath?.(
      path
    );
  } catch {}

  try {
    AppCore?.setState?.({
      publicPath:
        path,
    });
  } catch {}

  try {
    applyPostRenderLoaderPolicy?.({
      reason:
        "i18n-rerender",
      path,
    });
  } catch {}

  try {
    syncUserUI?.(
      AppCore
    );
  } catch {}

  try {
    syncUserUI?.({
      AppCore,
      reason:
        "i18n-rerender",
      publicPath:
        path,
    });
  } catch {}
}

export async function rerenderCurrentRoute(first = {}, second = null) {
  const deps =
    normalizeDeps(
      first,
      second
    );

  if (rerenderPromise) {
    rerenderQueued =
      true;

    return rerenderPromise;
  }

  rerenderPromise =
    (async () => {
      const {
        AppCore,
        Router,
        I18n,
        applyPostRenderLoaderPolicy,
        syncUserUI,
        reason = "i18n-rerender",
      } = deps;

      i18nState.rerendering =
        true;

      const currentPath =
        resolveCurrentPath(
          AppCore,
          Router
        );

      const lang =
        syncLangState({
          AppCore,
          I18n,
          reason:
            `${reason}:pre-render`,
        });

      const startPayload = {
        path:
          currentPath,

        lang,

        reason:
          safeText(reason, "i18n-rerender"),

        at:
          safeIsoDate(),
      };

      safeEmit(
        AppCore,
        I18N_EVENTS.i18nRerenderStart,
        startPayload
      );

      safeLog(
        AppCore,
        "Rerender por cambio de idioma.",
        startPayload
      );

      let ok = false;

      try {
        ok =
          await runRouterRender({
            AppCore,
            Router,
            path:
              currentPath,

            reason:
              startPayload.reason,
          });

        syncAfterRender({
          AppCore,
          path:
            currentPath,

          applyPostRenderLoaderPolicy,
          syncUserUI,
        });

        i18nState.rerenderCount += 1;
        i18nState.lastRerenderAt =
          Date.now();

        const donePayload = {
          ...startPayload,
          ok,
          at:
            safeIsoDate(),
        };

        safeEmit(
          AppCore,
          I18N_EVENTS.i18nRerenderDone,
          donePayload
        );

        return ok;
      } catch (error) {
        pushError(
          AppCore,
          error,
          "rerenderCurrentRoute"
        );

        safeEmit(
          AppCore,
          I18N_EVENTS.i18nRerenderError,
          {
            ...startPayload,
            message:
              safeText(
                error?.message || error,
                "rerenderCurrentRoute() falló."
              ),
          }
        );

        safeWarn(
          AppCore,
          "rerenderCurrentRoute() falló.",
          error
        );

        return false;
      } finally {
        i18nState.rerendering =
          false;

        rerenderPromise =
          null;

        if (rerenderQueued) {
          rerenderQueued =
            false;

          setTimeout(() => {
            rerenderCurrentRoute({
              ...deps,
              reason:
                "i18n-rerender:queued",
            });
          }, 0);
        }
      }
    })();

  return rerenderPromise;
}

/* =========================================================
   TRANSLATION HELPERS
========================================================= */

export function t(first = {}, second = "", third = "", fourth = {}) {
  let I18n = null;
  let key = "";
  let fallback = "";
  let params = {};

  if (
    isObject(first) &&
    (
      "I18n" in first ||
      "key" in first
    )
  ) {
    I18n =
      first.I18n;

    key =
      safeText(first.key, "");

    fallback =
      safeText(first.fallback, second || key);

    params =
      ensureObject(first.params);
  } else {
    I18n =
      null;

    key =
      safeText(first, "");

    fallback =
      safeText(second, key);

    params =
      ensureObject(third || fourth);
  }

  try {
    if (I18n?.t) {
      return I18n.t(
        key,
        params,
        fallback
      );
    }
  } catch {}

  return fallback || key;
}

/* =========================================================
   DEBUG
========================================================= */

export function getI18nSnapshot(first = {}, second = null) {
  const {
    AppCore,
    I18n,
  } = normalizeDeps(
    first,
    second
  );

  return {
    initialized:
      Boolean(
        initialized ||
        i18nState.initialized ||
        AppCore?.state?.i18nInitialized
      ),

    modulePresent:
      Boolean(I18n),

    boundCore:
      Boolean(boundCore),

    lang:
      safeLang(
        AppCore?.state?.lang ||
          getI18nLang(I18n) ||
          FALLBACK_LANG
      ),

    i18nLang:
      getI18nLang(I18n),

    documentLang:
      getDocumentLang(),

    storedLang:
      readStoredLang(),

    fallbackLang:
      FALLBACK_LANG,

    defaultLang:
      DEFAULT_LANG,

    available:
      getAvailableLangs(I18n),

    lastLang:
      i18nState.lastLang,

    syncCount:
      i18nState.syncCount,

    lastSyncAt:
      i18nState.lastSyncAt,

    lastSyncAtIso:
      i18nState.lastSyncAt
        ? safeIsoDate(i18nState.lastSyncAt)
        : "",

    rerendering:
      Boolean(i18nState.rerendering),

    rerenderQueued:
      Boolean(rerenderQueued),

    rerenderCount:
      i18nState.rerenderCount,

    lastRerenderAt:
      i18nState.lastRerenderAt,

    lastRerenderAtIso:
      i18nState.lastRerenderAt
        ? safeIsoDate(i18nState.lastRerenderAt)
        : "",

    errors:
      i18nState.errors,
  };
}

export function resetI18nRuntimeState() {
  initialized =
    false;

  boundCore =
    null;

  rerenderPromise =
    null;

  rerenderQueued =
    false;

  i18nState.initialized =
    false;

  i18nState.lastLang =
    "";

  i18nState.lastSyncAt =
    0;

  i18nState.lastRerenderAt =
    0;

  i18nState.rerendering =
    false;

  i18nState.rerenderCount =
    0;

  i18nState.syncCount =
    0;

  i18nState.errors =
    [];

  return getI18nSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  syncLangState,
  initI18n,

  changeLanguage,
  rerenderCurrentRoute,

  t,

  getI18nSnapshot,
  resetI18nRuntimeState,
};

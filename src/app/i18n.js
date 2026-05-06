/* =========================================================
   Onion SPA - App I18n
   Archivo: src/app/i18n.js

   ONION SUPPORT · APP I18N CONTROLLER
   LANG SYNC · ROUTER RERENDER SAFE · EXTREME 10/10

   RESPONSABILIDADES:
   - Inicializar i18n de la aplicación.
   - Sincronizar idioma activo con AppCore.
   - Aplicar atributo lang al documento.
   - Persistir idioma activo.
   - Rerenderizar ruta actual al cambiar idioma.
   - Registrar módulo i18n en AppCore.
   - Exponer bridge AppCore.changeLanguage / AppCore.t.
   - Endurecer fallback multilenguaje.
   - Exponer snapshots de diagnóstico.

   HARDENING EXTREMO:
   - Idempotencia total.
   - Tolerancia si I18n parcial.
   - Compatibilidad con firmas legacy y modernas.
   - Rerender serializado.
   - Rerender con fallback Router.rerenderCurrentRoute / Router.render / Router.navigate.
   - No destruye publicPath contextualizado.
   - No toca history salvo necesidad del Router.
   - Safe emit sin duplicar AppCore.events + window.
   - Logs seguros.
   - Browser/server safe.
   - Cero throws accidentales.

   API COMPATIBLE:
   - initI18n({ AppCore, I18n, Router })
   - initI18n(AppCore, I18n)
   - syncLangState({ AppCore, I18n, lang })
   - changeLanguage({ AppCore, I18n, Router, lang })
   - changeLanguage(AppCore, "en")
   - rerenderCurrentRoute({ AppCore, Router })
   - t("key", "fallback", params)
   - t({ I18n, key, fallback, params })
========================================================= */

import {
  getCurrentPublicPath,
  getCurrentCanonicalPath,
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
  UI_CONSTANTS?.langStorageKey ||
  "lang";

const LANG_STORAGE_KEYS = Object.freeze([
  LANG_STORAGE_KEY,
  "onion:lang",
  "onion.lang",
  "onion_language",
  "language",
]);

const KNOWN_LANGS = Object.freeze([
  "es",
  "en",
  "ca",
]);

const LANG_ALIASES = Object.freeze({
  es: "es",
  spa: "es",
  spanish: "es",
  castellano: "es",
  español: "es",

  en: "en",
  eng: "en",
  english: "en",

  ca: "ca",
  cat: "ca",
  catalan: "ca",
  català: "ca",
  catalán: "ca",
});

const I18N_EVENTS = Object.freeze({
  langChange:
    APP_EVENTS?.langChange ||
    "app:lang:change",

  i18nReady:
    "app:i18n:ready",

  i18nSync:
    "app:i18n:sync",

  i18nError:
    "app:i18n:error",

  i18nBridgeReady:
    "app:i18n:bridge:ready",

  i18nRerenderStart:
    "app:i18n:rerender:start",

  i18nRerenderDone:
    "app:i18n:rerender:done",

  i18nRerenderError:
    "app:i18n:rerender:error",
});

const INIT_METHODS = Object.freeze([
  "boot",
  "init",
  "initialize",
  "start",
]);

const SET_LANG_METHODS = Object.freeze([
  "setLang",
  "setLanguage",
  "changeLang",
  "changeLanguage",
  "use",
]);

const GET_LANG_METHODS = Object.freeze([
  "getLang",
  "getLanguage",
  "getCurrentLang",
  "current",
]);

const GET_AVAILABLE_METHODS = Object.freeze([
  "getAvailable",
  "getAvailableLangs",
  "getLanguages",
  "getLocales",
]);

const TRANSLATE_METHODS = Object.freeze([
  "t",
  "translate",
  "get",
]);

const ROUTER_RERENDER_METHODS = Object.freeze([
  "rerenderCurrentRoute",
  "renderCurrentRoute",
]);

const PUBLIC_PATH_KEYS = Object.freeze([
  "publicPath",
  "currentPublicPath",
  "lastPublicPath",
]);

const CANONICAL_PATH_KEYS = Object.freeze([
  "route",
  "canonicalPath",
  "currentPath",
  "currentCanonicalPath",
]);

/* =========================================================
   MODULE STATE
========================================================= */

let initialized = false;
let boundCore = null;
let currentAppCoreRef = null;
let currentI18nRef = null;
let currentRouterRef = null;

let rerenderPromise = null;
let rerenderQueued = false;

let changeSequence = 0;

const i18nState = {
  initialized: false,

  lastLang: "",
  lastRequestedLang: "",
  lastReason: "",

  lastSyncAt: 0,
  lastRerenderAt: 0,

  rerendering: false,
  rerenderCount: 0,
  syncCount: 0,
  changeCount: 0,

  bridgeReady: false,

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
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function ensureObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isExtensibleObject(value) {
  try {
    return (
      isObject(value) &&
      Object.isExtensible(value)
    );
  } catch {
    return false;
  }
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function unique(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of safeArray(values)) {
    const text = safeText(value, "");

    if (
      text &&
      !seen.has(text)
    ) {
      seen.add(text);
      result.push(text);
    }
  }

  return result;
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

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeSetTimeout(callback, ms = 0) {
  if (!isFunction(callback)) {
    return null;
  }

  try {
    return setTimeout(() => {
      try {
        callback();
      } catch {}
    }, Math.max(0, Number(ms) || 0));
  } catch {
    try {
      callback();
    } catch {}

    return null;
  }
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
  if (
    !target ||
    !methodName
  ) {
    return undefined;
  }

  return safeInvoke(
    target?.[methodName],
    target,
    args
  );
}

/* =========================================================
   DEPENDENCY RESOLUTION
========================================================= */

function looksLikeDepsObject(value) {
  if (!isObject(value)) {
    return false;
  }

  return Boolean(
    "AppCore" in value ||
      "I18n" in value ||
      "Router" in value ||
      "Auth" in value ||
      "Store" in value ||
      "SidebarUI" in value ||
      "TopbarUI" in value ||
      "Toast" in value ||
      "lang" in value ||
      "reason" in value
  );
}

function getModuleFromRegistry(AppCore, names = []) {
  const modules = AppCore?.modules;

  if (!modules) {
    return null;
  }

  for (const name of safeArray(names)) {
    const key = safeText(name, "");

    if (!key) {
      continue;
    }

    try {
      if (
        isFunction(modules.get) &&
        modules.get(key)
      ) {
        return modules.get(key);
      }
    } catch {}

    try {
      if (
        isFunction(modules.has) &&
        modules.has(key) &&
        isFunction(modules.get)
      ) {
        return modules.get(key);
      }
    } catch {}

    try {
      if (modules[key]) {
        return modules[key];
      }
    } catch {}
  }

  return null;
}

function normalizeDeps(first = {}, second = null, extra = {}) {
  if (looksLikeDepsObject(first)) {
    return {
      ...ensureObject(extra),
      ...first,
    };
  }

  if (typeof second === "string") {
    return {
      ...ensureObject(extra),
      AppCore:
        first || null,

      lang:
        second,
    };
  }

  return {
    ...ensureObject(extra),

    AppCore:
      first || null,

    I18n:
      second || null,
  };
}

function resolveRuntimeDeps(first = {}, second = null, extra = {}) {
  const deps = normalizeDeps(
    first,
    second,
    extra
  );

  const AppCore =
    deps.AppCore ||
    currentAppCoreRef ||
    null;

  const I18n =
    deps.I18n ||
    currentI18nRef ||
    AppCore?.I18n ||
    AppCore?.i18n ||
    getModuleFromRegistry(
      AppCore,
      [
        "I18n",
        "i18n",
        "Lang",
        "lang",
      ]
    );

  const Router =
    deps.Router ||
    currentRouterRef ||
    AppCore?.Router ||
    AppCore?.router ||
    getModuleFromRegistry(
      AppCore,
      [
        "Router",
        "router",
        "AppRouter",
        "appRouter",
      ]
    );

  return {
    ...deps,
    AppCore,
    I18n,
    Router,
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

    return;
  } catch {}

  try {
    console.log(
      "[AppI18n]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let coreLogged = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppI18n]",
        ...args
      );

      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn(
      "[AppI18n]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  let coreLogged = false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[AppI18n]",
        ...args
      );

      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

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
        detail: payload,
      })
    );

    return true;
  } catch {
    return false;
  }
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, payload);
      busEmitted = true;
    }
  } catch {}

  /*
    Anti event-storm:
    si AppCore.events existe, no duplicamos por window.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return safeWindowDispatch(name, payload) || busEmitted;
  }

  return busEmitted;
}

function normalizeError(error, fallback = "Error i18n.") {
  if (!error) {
    return {
      name: "I18nError",
      message: fallback,
      code: "I18N_ERROR",
    };
  }

  if (typeof error === "string") {
    return {
      name: "I18nError",
      message: error,
      code: "I18N_ERROR",
    };
  }

  return {
    name:
      safeText(
        error?.name,
        "I18nError"
      ),

    message:
      safeText(
        error?.message || error,
        fallback
      ),

    code:
      safeText(
        error?.code ||
          error?.status ||
          error?.statusCode,
        "I18N_ERROR"
      ),
  };
}

function pushError(AppCore, error, source = "i18n") {
  const snapshot = {
    source:
      safeText(source, "i18n"),

    error:
      normalizeError(error),

    message:
      safeText(
        error?.message || error,
        "Error i18n."
      ),

    at:
      safeIsoDate(),
  };

  i18nState.errors.unshift(snapshot);

  if (i18nState.errors.length > 10) {
    i18nState.errors =
      i18nState.errors.slice(0, 10);
  }

  safeEmit(
    AppCore,
    I18N_EVENTS.i18nError,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   LANG NORMALIZATION
========================================================= */

function safeLang(value, fallback = FALLBACK_LANG) {
  const raw = safeText(value, fallback)
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();

  if (!raw) {
    return safeText(fallback, FALLBACK_LANG);
  }

  const firstPart =
    raw.split("-")[0] || raw;

  const alias =
    LANG_ALIASES[firstPart] ||
    LANG_ALIASES[raw] ||
    firstPart;

  return safeText(alias, fallback);
}

function normalizeLangList(values = []) {
  return unique(
    toArray(values)
      .flat(Infinity)
      .map((value) => safeLang(value, ""))
      .filter(Boolean)
  );
}

/* =========================================================
   STORAGE / DOCUMENT
========================================================= */

function readStoredLang() {
  if (!isBrowser()) {
    return "";
  }

  for (const key of LANG_STORAGE_KEYS) {
    try {
      const value =
        window.localStorage?.getItem?.(key);

      const lang =
        safeLang(value, "");

      if (lang) {
        return lang;
      }
    } catch {}
  }

  for (const key of LANG_STORAGE_KEYS) {
    try {
      const value =
        window.sessionStorage?.getItem?.(key);

      const lang =
        safeLang(value, "");

      if (lang) {
        return lang;
      }
    } catch {}
  }

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

  let written = false;

  for (const key of LANG_STORAGE_KEYS) {
    try {
      window.localStorage?.setItem?.(
        key,
        cleanLang
      );

      written = true;
    } catch {}
  }

  return written;
}

function getDocumentLang() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeLang(
      document.documentElement?.getAttribute?.("lang") ||
        document.documentElement?.lang ||
        "",
      ""
    );
  } catch {
    return "";
  }
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

    document.documentElement.lang =
      cleanLang;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   I18N ACCESSORS
========================================================= */

function getAvailableLangs(I18n) {
  for (const methodName of GET_AVAILABLE_METHODS) {
    try {
      if (!isFunction(I18n?.[methodName])) {
        continue;
      }

      const result =
        safeMethod(
          I18n,
          methodName
        );

      if (Array.isArray(result)) {
        return normalizeLangList(result);
      }

      if (isObject(result)) {
        return normalizeLangList(
          Object.keys(result)
        );
      }
    } catch {}
  }

  const propertyCandidates = [
    I18n?.available,
    I18n?.langs,
    I18n?.languages,
    I18n?.locales,
    I18n?.dictionaries,
    I18n?.messages,
  ];

  for (const candidate of propertyCandidates) {
    try {
      if (Array.isArray(candidate)) {
        const langs = normalizeLangList(candidate);

        if (langs.length) {
          return langs;
        }
      }

      if (isObject(candidate)) {
        const langs = normalizeLangList(
          Object.keys(candidate)
        );

        if (langs.length) {
          return langs;
        }
      }
    } catch {}
  }

  return normalizeLangList(KNOWN_LANGS);
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
    safeLang(value, "");

  if (
    cleanLang &&
    isAvailableLang(I18n, cleanLang)
  ) {
    return cleanLang;
  }

  const fallbackLang =
    safeLang(fallback, FALLBACK_LANG);

  if (
    fallbackLang &&
    isAvailableLang(I18n, fallbackLang)
  ) {
    return fallbackLang;
  }

  const defaultLang =
    safeLang(DEFAULT_LANG, FALLBACK_LANG);

  if (
    defaultLang &&
    isAvailableLang(I18n, defaultLang)
  ) {
    return defaultLang;
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
      if (!isFunction(I18n?.[methodName])) {
        continue;
      }

      const result =
        safeMethod(
          I18n,
          methodName
        );

      const lang =
        safeLang(result, "");

      if (lang) {
        return lang;
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

      const result =
        I18n[methodName](
          cleanLang,
          options
        );

      if (
        result &&
        isFunction(result.catch)
      ) {
        result.catch(() => {});
      }

      ok = true;
      break;
    } catch {}
  }

  try {
    if (
      I18n &&
      typeof I18n === "object"
    ) {
      I18n.lang = cleanLang;
      ok = true;
    }
  } catch {}

  return ok;
}

function translateWithI18n(I18n, key = "", fallback = "", params = {}) {
  const cleanKey =
    safeText(key, "");

  const cleanFallback =
    fallback === undefined || fallback === null
      ? cleanKey
      : String(fallback);

  if (!cleanKey) {
    return cleanFallback;
  }

  for (const methodName of TRANSLATE_METHODS) {
    try {
      if (!isFunction(I18n?.[methodName])) {
        continue;
      }

      const result =
        I18n[methodName](
          cleanKey,
          ensureObject(params),
          cleanFallback
        );

      if (
        result !== undefined &&
        result !== null &&
        String(result).trim()
      ) {
        return result;
      }
    } catch {}

    try {
      if (!isFunction(I18n?.[methodName])) {
        continue;
      }

      const result =
        I18n[methodName](
          cleanKey,
          cleanFallback,
          ensureObject(params)
        );

      if (
        result !== undefined &&
        result !== null &&
        String(result).trim()
      ) {
        return result;
      }
    } catch {}
  }

  return cleanFallback || cleanKey;
}

/* =========================================================
   APP STATE / MODULE REGISTRY
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

  return cleanPayload;
}

function registerI18nModule(AppCore, I18n) {
  if (
    !AppCore ||
    !I18n
  ) {
    return false;
  }

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
    const modules = AppCore.modules;

    if (modules) {
      if (
        isFunction(modules.register)
      ) {
        modules.register("i18n", I18n);
        modules.register("I18n", I18n);
        registered = true;
      } else if (
        isFunction(modules.set)
      ) {
        modules.set("i18n", I18n);
        modules.set("I18n", I18n);
        registered = true;
      } else if (isExtensibleObject(modules)) {
        modules.i18n = I18n;
        modules.I18n = I18n;
        registered = true;
      }
    }
  } catch {}

  try {
    if (
      !AppCore.modules &&
      isExtensibleObject(AppCore)
    ) {
      AppCore.modules = {
        i18n: I18n,
        I18n,
      };

      registered = true;
    }
  } catch {}

  try {
    if (isExtensibleObject(AppCore)) {
      AppCore.I18n = I18n;
      AppCore.i18n = I18n;
      registered = true;
    }
  } catch {}

  return registered;
}

function resolveInitialLang(AppCore, I18n, preferred = "") {
  const candidates = [
    preferred,
    AppCore?.state?.lang,
    readStoredLang(),
    getI18nLang(I18n),
    getDocumentLang(),
    AppCore?.config?.lang,
    AppCore?.config?.defaultLang,
    DEFAULT_LANG,
    FALLBACK_LANG,
  ];

  for (const candidate of candidates) {
    const lang =
      safeLang(candidate, "");

    if (
      lang &&
      isAvailableLang(I18n, lang)
    ) {
      return lang;
    }
  }

  return normalizeAvailableLang(
    I18n,
    FALLBACK_LANG,
    FALLBACK_LANG
  );
}

/* =========================================================
   CORE BINDING / BRIDGE
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
    pushError(
      AppCore,
      error,
      "I18n.bindCore"
    );

    safeWarn(
      AppCore,
      "I18n.bindCore(AppCore) falló.",
      error
    );
  }

  try {
    if (isFunction(I18n?.configure)) {
      I18n.configure({
        core: AppCore,
        AppCore,
      });

      ok = true;
    }
  } catch (error) {
    pushError(
      AppCore,
      error,
      "I18n.configure"
    );
  }

  boundCore = AppCore;

  return ok;
}

function attachAppCoreBridge(AppCore, I18n, Router) {
  if (!isExtensibleObject(AppCore)) {
    return false;
  }

  let attached = false;

  try {
    AppCore.changeLanguage = (lang, options = {}) => {
      return changeLanguage({
        AppCore,
        I18n,
        Router,
        ...ensureObject(options),
        lang,
      });
    };

    attached = true;
  } catch {}

  try {
    AppCore.setLanguage = AppCore.changeLanguage;
    attached = true;
  } catch {}

  try {
    AppCore.getLanguage = () => {
      return (
        safeLang(AppCore?.state?.lang, "") ||
        getI18nLang(I18n) ||
        FALLBACK_LANG
      );
    };

    attached = true;
  } catch {}

  try {
    AppCore.t = (key, fallback = "", params = {}) => {
      return translateWithI18n(
        I18n,
        key,
        fallback,
        params
      );
    };

    attached = true;
  } catch {}

  if (attached) {
    i18nState.bridgeReady = true;

    safeEmit(
      AppCore,
      I18N_EVENTS.i18nBridgeReady,
      {
        lang:
          safeLang(
            AppCore?.state?.lang ||
              getI18nLang(I18n) ||
              FALLBACK_LANG
          ),

        at:
          safeIsoDate(),
      }
    );
  }

  return attached;
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

      const result =
        I18n[methodName]({
          AppCore,
          core:
            AppCore,
          lang,
          fallbackLang:
            FALLBACK_LANG,
          defaultLang:
            DEFAULT_LANG,
        });

      if (
        result &&
        isFunction(result.catch)
      ) {
        result.catch((error) => {
          pushError(
            AppCore,
            error,
            `I18n.${methodName}:async`
          );
        });
      }

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
    Router,
    lang: preferredLang,
    reason = "sync-lang-state",
    persist = true,
    emit = true,
  } = resolveRuntimeDeps(
    first,
    second
  );

  currentAppCoreRef =
    AppCore || currentAppCoreRef;

  currentI18nRef =
    I18n || currentI18nRef;

  currentRouterRef =
    Router || currentRouterRef;

  const finalLang =
    resolveInitialLang(
      AppCore,
      I18n,
      preferredLang
    );

  const available =
    getAvailableLangs(I18n);

  safeSetState(
    AppCore,
    {
      lang:
        finalLang,

      fallbackLang:
        FALLBACK_LANG,

      defaultLang:
        DEFAULT_LANG,

      availableLangs:
        available,
    }
  );

  setDocumentLang(finalLang);

  setI18nLang(
    I18n,
    finalLang,
    {
      silent:
        true,

      reason,
      source:
        "app:i18n:sync",
    }
  );

  if (persist) {
    writeStoredLang(finalLang);
  }

  i18nState.lastLang =
    finalLang;

  i18nState.lastReason =
    safeText(reason, "sync-lang-state");

  i18nState.lastSyncAt =
    Date.now();

  i18nState.syncCount += 1;

  const payload = {
    lang:
      finalLang,

    fallbackLang:
      FALLBACK_LANG,

    defaultLang:
      DEFAULT_LANG,

    available,

    reason:
      i18nState.lastReason,

    at:
      safeIsoDate(i18nState.lastSyncAt),

    source:
      "app:i18n",
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
    Router,
    state,
    lang: preferredLang,
    force = false,
  } = resolveRuntimeDeps(
    first,
    second
  );

  currentAppCoreRef =
    AppCore || currentAppCoreRef;

  currentI18nRef =
    I18n || currentI18nRef;

  currentRouterRef =
    Router || currentRouterRef;

  const alreadyInitialized =
    Boolean(
      initialized ||
        i18nState.initialized ||
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
        Router,
        lang:
          preferredLang,
        reason:
          "init-i18n:already-initialized",
      });

    attachAppCoreBridge(
      AppCore,
      I18n,
      Router
    );

    return Boolean(lang);
  }

  registerI18nModule(
    AppCore,
    I18n
  );

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
      source:
        "app:i18n:init",
    }
  );

  const lang =
    syncLangState({
      AppCore,
      I18n,
      Router,
      lang:
        initialLang,
      reason:
        "init-i18n",
    });

  attachAppCoreBridge(
    AppCore,
    I18n,
    Router
  );

  initialized =
    true;

  i18nState.initialized =
    true;

  if (state) {
    try {
      state.i18nInitialized = true;
    } catch {}
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

    defaultLang:
      DEFAULT_LANG,

    available:
      getAvailableLangs(I18n),

    scope:
      DEFAULT_SCOPE,

    at:
      safeIsoDate(),

    source:
      "app:i18n",
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
  } = resolveRuntimeDeps(
    first,
    second
  );

  currentAppCoreRef =
    AppCore || currentAppCoreRef;

  currentI18nRef =
    I18n || currentI18nRef;

  currentRouterRef =
    Router || currentRouterRef;

  const sequence =
    ++changeSequence;

  const requestedLang =
    safeLang(
      lang ||
        second ||
        "",
      ""
    );

  const finalLang =
    normalizeAvailableLang(
      I18n,
      requestedLang ||
        FALLBACK_LANG,
      FALLBACK_LANG
    );

  i18nState.lastRequestedLang =
    requestedLang || finalLang;

  i18nState.changeCount += 1;

  setI18nLang(
    I18n,
    finalLang,
    {
      reason,
      source:
        "app:i18n:change",
      sequence,
    }
  );

  syncLangState({
    AppCore,
    I18n,
    Router,
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

    requestedLang:
      requestedLang || finalLang,

    fallbackLang:
      FALLBACK_LANG,

    defaultLang:
      DEFAULT_LANG,

    available:
      getAvailableLangs(I18n),

    reason:
      safeText(reason, "change-language"),

    sequence,

    at:
      safeIsoDate(),

    source:
      "app:i18n",
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
      sequence,
    });
  }

  return finalLang;
}

/* =========================================================
   RERENDER CURRENT ROUTE
========================================================= */

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    return `${pathname}${search}${hash}` || "/";
  } catch {
    return "/";
  }
}

function getPathFromStateByKeys(state = {}, keys = []) {
  for (const key of safeArray(keys)) {
    const value =
      safeText(
        state?.[key],
        ""
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveCurrentPaths(AppCore, Router) {
  const state =
    ensureObject(AppCore?.state);

  const routerPublic =
    safeText(
      Router?.getCurrentPublicPath?.(),
      ""
    );

  const routerCanonical =
    safeText(
      Router?.getCurrentCanonicalPath?.(),
      ""
    );

  const helperPublic =
    safeText(
      safeInvoke(
        getCurrentPublicPath,
        null,
        [AppCore, Router]
      ),
      ""
    );

  const helperCanonical =
    safeText(
      safeInvoke(
        getCurrentCanonicalPath,
        null,
        [AppCore, Router]
      ),
      ""
    );

  const statePublic =
    getPathFromStateByKeys(
      state,
      PUBLIC_PATH_KEYS
    );

  const stateCanonical =
    getPathFromStateByKeys(
      state,
      CANONICAL_PATH_KEYS
    );

  const browserPublic =
    getBrowserPublicPath();

  const publicPath =
    routerPublic ||
    helperPublic ||
    statePublic ||
    browserPublic ||
    stateCanonical ||
    "/";

  const canonicalPath =
    routerCanonical ||
    helperCanonical ||
    stateCanonical ||
    publicPath ||
    "/";

  return {
    publicPath,
    canonicalPath,
    renderPath:
      canonicalPath || publicPath || "/",
  };
}

async function runRouterRender({
  AppCore,
  Router,
  publicPath = "/",
  canonicalPath = "/",
  reason = "i18n-rerender",
  sequence = 0,
} = {}) {
  const renderPath =
    safeText(
      canonicalPath ||
        publicPath,
      "/"
    );

  for (const methodName of ROUTER_RERENDER_METHODS) {
    try {
      if (!isFunction(Router?.[methodName])) {
        continue;
      }

      await Promise.resolve(
        Router[methodName]({
          reason,
          force:
            true,
          source:
            "app:i18n",
          sequence,
        })
      );

      return {
        ok: true,
        method: methodName,
      };
    } catch (error) {
      safeWarn(
        AppCore,
        `Router.${methodName}() falló en rerender i18n.`,
        error
      );
    }
  }

  try {
    if (isFunction(Router?.render)) {
      await Promise.resolve(
        Router.render(
          renderPath,
          {
            skipHistory:
              true,

            replaceState:
              true,

            force:
              true,

            reason,
            source:
              "app:i18n",

            canonicalPath:
              renderPath,

            publicPath:
              publicPath || renderPath,

            preservePublicPath:
              true,

            preserveSearch:
              true,

            preserveHash:
              true,

            i18nRerender:
              true,

            sequence,
          }
        )
      );

      return {
        ok: true,
        method: "render",
      };
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
          publicPath || renderPath,
          {
            replaceState:
              true,

            force:
              true,

            reason,
            source:
              "app:i18n",

            preservePublicPath:
              true,

            preserveSearch:
              true,

            preserveHash:
              true,

            i18nRerender:
              true,

            sequence,
          }
        )
      );

      return {
        ok: true,
        method: "navigate",
      };
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate() falló en rerender i18n.",
      error
    );
  }

  return {
    ok: false,
    method: "",
  };
}

function syncAfterRender({
  AppCore,
  Router,
  publicPath,
  canonicalPath,
  applyPostRenderLoaderPolicy,
  syncUserUI,
  reason = "i18n-rerender",
} = {}) {
  try {
    AppCore?.setPublicPath?.(
      publicPath
    );
  } catch {}

  try {
    AppCore?.setRoute?.(
      canonicalPath
    );
  } catch {}

  safeSetState(
    AppCore,
    {
      publicPath:
        publicPath || canonicalPath || "/",

      route:
        canonicalPath || publicPath || "/",
    }
  );

  try {
    applyPostRenderLoaderPolicy?.({
      AppCore,
      Router,
      reason,
      path:
        canonicalPath || publicPath || "/",
      hideLoaderOnPostRender:
        false,
    });
  } catch {}

  try {
    syncUserUI?.({
      AppCore,
      Router,
      reason,
      publicPath,
      canonicalPath,
      rebind:
        false,
      hardRepair:
        false,
      force:
        true,
    });
  } catch {}

  try {
    syncUserUI?.(
      AppCore
    );
  } catch {}
}

export async function rerenderCurrentRoute(first = {}, second = null) {
  const deps =
    resolveRuntimeDeps(
      first,
      second
    );

  if (rerenderPromise) {
    rerenderQueued = true;
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
        sequence = changeSequence,
      } = deps;

      i18nState.rerendering = true;

      const paths =
        resolveCurrentPaths(
          AppCore,
          Router
        );

      const lang =
        syncLangState({
          AppCore,
          I18n,
          Router,
          reason:
            `${reason}:pre-render`,
          emit:
            false,
        });

      const startPayload = {
        publicPath:
          paths.publicPath,

        canonicalPath:
          paths.canonicalPath,

        renderPath:
          paths.renderPath,

        lang,

        reason:
          safeText(reason, "i18n-rerender"),

        sequence,

        at:
          safeIsoDate(),

        source:
          "app:i18n",
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

      try {
        const renderResult =
          await runRouterRender({
            AppCore,
            Router,
            publicPath:
              paths.publicPath,
            canonicalPath:
              paths.canonicalPath,
            reason:
              startPayload.reason,
            sequence,
          });

        syncAfterRender({
          AppCore,
          Router,
          publicPath:
            paths.publicPath,
          canonicalPath:
            paths.canonicalPath,
          applyPostRenderLoaderPolicy,
          syncUserUI,
          reason:
            startPayload.reason,
        });

        i18nState.rerenderCount += 1;
        i18nState.lastRerenderAt =
          Date.now();

        const donePayload = {
          ...startPayload,
          ok:
            Boolean(renderResult.ok),
          method:
            renderResult.method || "",
          at:
            safeIsoDate(),
        };

        safeEmit(
          AppCore,
          I18N_EVENTS.i18nRerenderDone,
          donePayload
        );

        return Boolean(renderResult.ok);
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
        i18nState.rerendering = false;
        rerenderPromise = null;

        if (rerenderQueued) {
          rerenderQueued = false;

          safeSetTimeout(() => {
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

export function t(first = {}, second = "", third = {}, fourth = {}) {
  let I18n =
    currentI18nRef;

  let key = "";
  let fallback = "";
  let params = {};

  if (
    isObject(first) &&
    (
      "I18n" in first ||
      "key" in first ||
      "fallback" in first ||
      "params" in first
    )
  ) {
    I18n =
      first.I18n ||
      currentI18nRef;

    key =
      safeText(first.key, "");

    fallback =
      first.fallback === undefined
        ? safeText(second, key)
        : safeText(first.fallback, key);

    params =
      ensureObject(
        first.params ||
          third ||
          fourth
      );
  } else {
    key =
      safeText(first, "");

    fallback =
      second === undefined || second === null
        ? key
        : safeText(second, key);

    params =
      ensureObject(
        third && isObject(third)
          ? third
          : fourth
      );
  }

  return translateWithI18n(
    I18n,
    key,
    fallback,
    params
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getI18nSnapshot(first = {}, second = null) {
  const {
    AppCore,
    I18n,
    Router,
  } = resolveRuntimeDeps(
    first,
    second
  );

  const available =
    getAvailableLangs(I18n);

  const stateLang =
    safeLang(
      AppCore?.state?.lang,
      ""
    );

  const i18nLang =
    getI18nLang(I18n);

  const documentLang =
    getDocumentLang();

  const storedLang =
    readStoredLang();

  return {
    initialized:
      Boolean(
        initialized ||
          i18nState.initialized ||
          AppCore?.state?.i18nInitialized
      ),

    modulePresent:
      Boolean(I18n),

    routerPresent:
      Boolean(Router),

    boundCore:
      Boolean(boundCore),

    bridgeReady:
      Boolean(i18nState.bridgeReady),

    lang:
      safeLang(
        stateLang ||
          i18nLang ||
          documentLang ||
          storedLang ||
          FALLBACK_LANG
      ),

    stateLang,
    i18nLang,
    documentLang,
    storedLang,

    fallbackLang:
      FALLBACK_LANG,

    defaultLang:
      DEFAULT_LANG,

    available,

    lastLang:
      i18nState.lastLang,

    lastRequestedLang:
      i18nState.lastRequestedLang,

    lastReason:
      i18nState.lastReason,

    syncCount:
      i18nState.syncCount,

    changeCount:
      i18nState.changeCount,

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

    rerenderInFlight:
      Boolean(rerenderPromise),

    rerenderCount:
      i18nState.rerenderCount,

    lastRerenderAt:
      i18nState.lastRerenderAt,

    lastRerenderAtIso:
      i18nState.lastRerenderAt
        ? safeIsoDate(i18nState.lastRerenderAt)
        : "",

    changeSequence,

    storageKeys:
      LANG_STORAGE_KEYS,

    events:
      I18N_EVENTS,

    errors:
      i18nState.errors,
  };
}

export function resetI18nRuntimeState() {
  initialized = false;
  boundCore = null;
  currentAppCoreRef = null;
  currentI18nRef = null;
  currentRouterRef = null;

  rerenderPromise = null;
  rerenderQueued = false;

  changeSequence = 0;

  i18nState.initialized = false;
  i18nState.lastLang = "";
  i18nState.lastRequestedLang = "";
  i18nState.lastReason = "";

  i18nState.lastSyncAt = 0;
  i18nState.lastRerenderAt = 0;

  i18nState.rerendering = false;
  i18nState.rerenderCount = 0;
  i18nState.syncCount = 0;
  i18nState.changeCount = 0;

  i18nState.bridgeReady = false;
  i18nState.errors = [];

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

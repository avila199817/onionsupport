/* =========================================================
   Onion SPA - App I18n
   Archivo: src/app/i18n.js

   APP I18N · SIMPLE ADAPTER
   - adapter de boot/sync sobre i18n/index.js
   - inicia I18n real si existe
   - sincroniza lang/document/AppCore
   - expone bridge AppCore.t / AppCore.changeLanguage
   - sin sistema i18n paralelo, sin Router/render, sin Toast, sin fetch
   - sin diccionarios grandes aquí
========================================================= */

import {
  registerModule,
  redactTokenInText as redactTokenInTextBase,
} from "./helpers.js";

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  UI_CONSTANTS,
} from "./constants.js";

export const I18N_VERSION = "21.0.0-simple";

const SOURCE = "app.i18n";
const DEFAULT_SCOPE = APP_SCOPES?.i18n || APP_SCOPE || "app:i18n";
const FALLBACK_LANG = UI_CONSTANTS?.fallbackLang || UI_CONSTANTS?.defaultLang || "es";
const DEFAULT_LANG = UI_CONSTANTS?.defaultLang || FALLBACK_LANG || "es";
const LANG_STORAGE_KEY = UI_CONSTANTS?.langStorageKey || "lang";
const DEBUG_KEY = "__ONION_APP_I18N__";

const STORAGE_KEYS = Object.freeze(uniqueStatic([
  LANG_STORAGE_KEY,
  "onion:lang",
  "onion.lang",
  "onion_language",
  "onion:language",
  "onion.language",
  "language",
  "locale",
  "lang",
]));

const KNOWN_LANGS = Object.freeze(uniqueStatic([
  ...(Array.isArray(UI_CONSTANTS?.supportedLangs) ? UI_CONSTANTS.supportedLangs : []),
  "es",
  "en",
  "ca",
]));

const LANG_ALIASES = Object.freeze({
  es: "es",
  "es-es": "es",
  spa: "es",
  spanish: "es",
  castellano: "es",
  español: "es",
  espanol: "es",

  en: "en",
  "en-us": "en",
  "en-gb": "en",
  eng: "en",
  english: "en",

  ca: "ca",
  "ca-es": "ca",
  cat: "ca",
  catalan: "ca",
  català: "ca",
  catala: "ca",
  catalán: "ca",
});

const LANG_META = Object.freeze({
  es: Object.freeze({ lang: "es", locale: "es-ES", direction: "ltr" }),
  en: Object.freeze({ lang: "en", locale: "en-US", direction: "ltr" }),
  ca: Object.freeze({ lang: "ca", locale: "ca-ES", direction: "ltr" }),
});

const EVENTS = Object.freeze({
  langChange: APP_EVENTS?.langChange || "app:lang:change",
  ready: "app:i18n:ready",
  initStart: "app:i18n:init:start",
  initDone: "app:i18n:init:done",
  sync: "app:i18n:sync",
  changeStart: "app:i18n:change:start",
  changeDone: "app:i18n:change:done",
  error: "app:i18n:error",
  bridgeReady: "app:i18n:bridge:ready",
  debugReady: "app:i18n:debug:ready",
  rerenderSkipped: "app:i18n:rerender:skipped",
});

const CONFIGURE_METHODS = Object.freeze(["configure", "setup", "bindCore"]);
const INIT_METHODS = Object.freeze(["boot", "init", "initialize", "start"]);
const GET_LANG_METHODS = Object.freeze(["getLang", "getLanguage", "getCurrentLang", "getLocale", "current"]);
const SET_LANG_METHODS = Object.freeze(["setLang", "setLanguage", "changeLang", "changeLanguage", "use", "setLocale", "changeLocale"]);
const TRANSLATE_METHODS = Object.freeze(["t", "translate", "get", "message"]);
const AVAILABLE_METHODS = Object.freeze(["getAvailable", "getAvailableLangs", "getLanguages", "getLocales", "availableLanguages"]);
const DICTIONARY_KEYS = Object.freeze(["dictionaries", "dictionary", "messages", "locales", "translations", "resources", "catalogs"]);

const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i;
const LANG_EMIT_DEDUPE_MS = 80;
const MAX_ERRORS = 12;

let initialized = false;
let boundCore = null;
let currentAppCore = null;
let currentI18n = null;
let currentRouter = null;
let changePromise = null;
let changeSeq = 0;
let debugReady = false;
let lastLangEmitKey = "";
let lastLangEmitAt = 0;

const runtime = {
  initialized: false,
  lang: "",
  requestedLang: "",
  reason: "",
  syncCount: 0,
  changeCount: 0,
  lastSyncAt: 0,
  lastChangeAt: 0,
  bridgeReady: false,
  errors: [],
};

/* =========================================================
   BASICS
========================================================= */

function uniqueStatic(values = []) {
  const seen = new Set();
  const output = [];

  for (const item of Array.isArray(values) ? values : []) {
    const clean = item === null || item === undefined ? "" : String(item).trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      output.push(clean);
    }
  }

  return output;
}

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isObjectLike = (value) => Boolean(value && (typeof value === "object" || typeof value === "function"));
const isFn = (value) => typeof value === "function";

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function unique(values = []) {
  return [...new Set(toArray(values).flat(Infinity).map((item) => safeText(item, "")).filter(Boolean))];
}

function now() {
  try { return Date.now(); } catch { return 0; }
}

function iso(ms = now()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function canExtend(value) {
  try { return isObjectLike(value) && Object.isExtensible(value); } catch { return false; }
}

function defineHidden(target, key, value) {
  if (!target || !key || !canExtend(target)) return false;

  try {
    Object.defineProperty(target, key, { value, enumerable: false, configurable: true, writable: true });
    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

function maybePromise(value) {
  return Boolean(value && isFn(value.then));
}

async function maybeAwait(value) {
  return maybePromise(value) ? await value : value;
}

/* =========================================================
   SANITIZE / EMIT
========================================================= */

function redactText(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  try {
    return redactTokenInTextBase(raw);
  } catch {
    return raw
      .replace(/([?&#](token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  }
}

function normalizeError(error, fallback = "Error i18n.") {
  if (!error) return { name: "I18nError", message: fallback, code: "I18N_ERROR" };

  return {
    name: safeText(error?.name || error?.constructor?.name, "I18nError"),
    message: redactText(safeText(error?.message || error?.reason || error, fallback)),
    code: redactText(safeText(error?.code || error?.status || error?.statusCode, "I18N_ERROR")),
  };
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redactText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

function safeLog(AppCore, ...args) {
  try { AppCore?.utils?.log?.("[AppI18n]", ...args.map((item) => sanitize(item))); } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppI18n]", ...args.map((item) => sanitize(item)));
  } catch {
    try { if (AppCore?.config?.debug) console.warn("[AppI18n]", ...args.map((item) => sanitize(item))); } catch {}
  }
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({ source: SOURCE, version: I18N_VERSION, at: iso(), ...safeObject(payload) });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function pushError(AppCore, error, source = "i18n") {
  const entry = { source, error: normalizeError(error), at: iso() };
  runtime.errors.unshift(entry);
  if (runtime.errors.length > MAX_ERRORS) runtime.errors.length = MAX_ERRORS;
  safeEmit(AppCore, EVENTS.error, entry);
  return entry;
}

/* =========================================================
   DEPS
========================================================= */

function looksLikeDeps(value) {
  return Boolean(isObject(value) && ("AppCore" in value || "I18n" in value || "Router" in value || "lang" in value || "reason" in value));
}

function getModule(AppCore, names = []) {
  for (const name of toArray(names)) {
    const key = safeText(name, "");
    if (!key) continue;

    try {
      const value = AppCore?.modules?.get?.(key) || AppCore?.registry?.modules?.get?.(key) || AppCore?.modules?.[key] || AppCore?.[key] || null;
      if (value) return value;
    } catch {}
  }

  return null;
}

function resolveDeps(first = {}, second = null, extra = {}) {
  const deps = looksLikeDeps(first)
    ? { ...safeObject(extra), ...first }
    : typeof second === "string"
      ? { ...safeObject(extra), AppCore: first || null, lang: second }
      : { ...safeObject(extra), AppCore: first || null, I18n: second || null };

  const AppCore = deps.AppCore || currentAppCore || null;
  const I18n = deps.I18n || currentI18n || AppCore?.I18n || AppCore?.i18n || getModule(AppCore, ["I18n", "i18n", "Lang", "lang"]);
  const Router = deps.Router || currentRouter || AppCore?.Router || AppCore?.router || getModule(AppCore, ["Router", "router"]);

  return { ...deps, AppCore, I18n, Router };
}

function rememberDeps({ AppCore, I18n, Router } = {}) {
  if (AppCore) currentAppCore = AppCore;
  if (I18n) currentI18n = I18n;
  if (Router) currentRouter = Router;
}

/* =========================================================
   LANG CORE
========================================================= */

function normalizeLang(value, fallback = FALLBACK_LANG) {
  const fallbackText = fallback === "" ? "" : safeText(fallback, FALLBACK_LANG);
  if (value === null || value === undefined) return fallbackText;

  const raw = String(value).trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return fallbackText;

  const first = raw.split("-")[0] || raw;
  return safeText(LANG_ALIASES[raw] || LANG_ALIASES[first] || first, fallbackText);
}

function normalizeLangList(values = []) {
  return unique(toArray(values).flat(Infinity).map((item) => normalizeLang(item, "")).filter(Boolean));
}

function getLangMeta(lang = FALLBACK_LANG) {
  const clean = normalizeLang(lang, FALLBACK_LANG);
  return {
    ...(LANG_META[clean] || {}),
    lang: clean,
    locale: LANG_META[clean]?.locale || clean,
    direction: LANG_META[clean]?.direction || "ltr",
  };
}

function getAvailableLangs(I18n) {
  for (const method of AVAILABLE_METHODS) {
    try {
      if (!isFn(I18n?.[method])) continue;
      const result = I18n[method]();
      if (Array.isArray(result)) return normalizeLangList(result);
      if (isObject(result)) return normalizeLangList(Object.keys(result));
    } catch {}
  }

  for (const value of [I18n?.available, I18n?.langs, I18n?.languages, I18n?.locales, I18n?.dictionaries, I18n?.messages, I18n?.translations]) {
    if (Array.isArray(value)) return normalizeLangList(value);
    if (isObject(value)) return normalizeLangList(Object.keys(value));
  }

  return normalizeLangList(KNOWN_LANGS);
}

function isAvailableLang(I18n, lang = "") {
  const clean = normalizeLang(lang, "");
  if (!clean) return false;
  const available = getAvailableLangs(I18n);
  return !available.length || available.includes(clean);
}

function normalizeAvailableLang(I18n, value = "", fallback = FALLBACK_LANG) {
  const requested = normalizeLang(value, "");
  if (requested && isAvailableLang(I18n, requested)) return requested;

  const fallbackLang = normalizeLang(fallback, "");
  if (fallbackLang && isAvailableLang(I18n, fallbackLang)) return fallbackLang;

  const defaultLang = normalizeLang(DEFAULT_LANG, "");
  if (defaultLang && isAvailableLang(I18n, defaultLang)) return defaultLang;

  return getAvailableLangs(I18n)[0] || FALLBACK_LANG;
}

function getI18nLang(I18n) {
  for (const method of GET_LANG_METHODS) {
    try {
      if (!isFn(I18n?.[method])) continue;
      const lang = normalizeLang(I18n[method](), "");
      if (lang) return lang;
    } catch {}
  }

  return normalizeLang(I18n?.lang, "") || normalizeLang(I18n?.currentLang, "") || normalizeLang(I18n?.language, "") || normalizeLang(I18n?.locale, "") || "";
}

function setI18nLang(I18n, lang = FALLBACK_LANG, options = {}) {
  const clean = normalizeLang(lang, FALLBACK_LANG);
  let ok = false;

  for (const method of SET_LANG_METHODS) {
    try {
      if (!isFn(I18n?.[method])) continue;
      const result = I18n[method](clean, options);
      if (maybePromise(result)) result.catch?.(() => {});
      ok = true;
      break;
    } catch {}
  }

  try {
    if (I18n && typeof I18n === "object") {
      I18n.lang = clean;
      I18n.language = clean;
      I18n.locale = getLangMeta(clean).locale;
      ok = true;
    }
  } catch {}

  return ok;
}

async function setI18nLangAsync(I18n, lang = FALLBACK_LANG, options = {}) {
  const clean = normalizeLang(lang, FALLBACK_LANG);
  let ok = false;

  for (const method of SET_LANG_METHODS) {
    try {
      if (!isFn(I18n?.[method])) continue;
      await maybeAwait(I18n[method](clean, options));
      ok = true;
      break;
    } catch {}
  }

  try {
    if (I18n && typeof I18n === "object") {
      I18n.lang = clean;
      I18n.language = clean;
      I18n.locale = getLangMeta(clean).locale;
      ok = true;
    }
  } catch {}

  return ok;
}

/* =========================================================
   STORAGE / DOCUMENT
========================================================= */

function readStoredLang() {
  if (!isBrowser()) return "";

  for (const storageName of ["localStorage", "sessionStorage"]) {
    for (const key of STORAGE_KEYS) {
      try {
        const lang = normalizeLang(window[storageName]?.getItem?.(key), "");
        if (lang) return lang;
      } catch {}
    }
  }

  return "";
}

function writeStoredLang(lang = "") {
  if (!isBrowser()) return false;

  const clean = normalizeLang(lang, "");
  if (!clean) return false;

  let ok = false;

  for (const key of STORAGE_KEYS) {
    try {
      window.localStorage?.setItem?.(key, clean);
      ok = true;
    } catch {}
  }

  return ok;
}

function getDocumentLang() {
  if (!isBrowser()) return "";

  try {
    return normalizeLang(document.documentElement?.getAttribute?.("lang") || document.documentElement?.lang || "", "");
  } catch {
    return "";
  }
}

function setDocumentLang(lang = FALLBACK_LANG) {
  if (!isBrowser()) return false;

  const clean = normalizeLang(lang, FALLBACK_LANG);
  const meta = getLangMeta(clean);

  try {
    document.documentElement.setAttribute("lang", clean);
    document.documentElement.lang = clean;
    document.documentElement.setAttribute("dir", meta.direction || "ltr");
    document.documentElement.dataset.lang = clean;
    document.documentElement.dataset.locale = meta.locale || clean;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   TRANSLATION
========================================================= */

function getNestedValue(source = {}, key = "") {
  if (!source || !key) return undefined;

  let current = source;

  for (const part of String(key).split(".").filter(Boolean)) {
    if (current === null || current === undefined) return undefined;
    current = current?.[part];
  }

  return current;
}

function getDictionary(I18n, lang = "") {
  const clean = normalizeLang(lang, "");
  if (!I18n || !clean) return null;

  for (const key of DICTIONARY_KEYS) {
    try {
      const collection = I18n?.[key];
      if (collection && isObject(collection[clean])) return collection[clean];
    } catch {}
  }

  return isObject(I18n?.[clean]) ? I18n[clean] : null;
}

function interpolate(value = "", params = {}) {
  let output = String(value ?? "");

  for (const [key, item] of Object.entries(safeObject(params))) {
    const safeKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const replacement = item === null || item === undefined ? "" : String(item);

    try {
      output = output
        .replace(new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g"), replacement)
        .replace(new RegExp(`\\{\\s*${safeKey}\\s*\\}`, "g"), replacement)
        .replace(new RegExp(`:${safeKey}\\b`, "g"), replacement);
    } catch {}
  }

  return output;
}

function dictionaryTranslation(I18n, key = "", params = {}) {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return "";

  for (const lang of unique([getI18nLang(I18n), FALLBACK_LANG, DEFAULT_LANG, ...KNOWN_LANGS])) {
    const dict = getDictionary(I18n, lang);
    const value = dict ? getNestedValue(dict, cleanKey) : undefined;

    if (value !== undefined && value !== null && typeof value !== "object") return interpolate(String(value), params);
  }

  return "";
}

function usableTranslation(value, key = "", fallback = "") {
  if (value === undefined || value === null) return false;
  const textValue = String(value).trim();
  if (!textValue) return false;
  if (fallback && key && textValue === key) return false;
  return true;
}

function translateWithI18n(I18n, key = "", fallback = "", params = {}) {
  const cleanKey = safeText(key, "");
  const cleanFallback = fallback === undefined || fallback === null ? cleanKey : String(fallback);
  const cleanParams = safeObject(params);

  if (!cleanKey) return interpolate(cleanFallback, cleanParams);

  for (const method of TRANSLATE_METHODS) {
    for (const args of [[cleanKey, cleanParams, cleanFallback], [cleanKey, cleanFallback, cleanParams], [cleanKey]]) {
      try {
        if (!isFn(I18n?.[method])) continue;
        const result = I18n[method](...args);
        if (usableTranslation(result, cleanKey, cleanFallback)) return interpolate(String(result), cleanParams);
      } catch {}
    }
  }

  return dictionaryTranslation(I18n, cleanKey, cleanParams) || interpolate(cleanFallback || cleanKey, cleanParams);
}

export function t(first = {}, second = "", third = {}, fourth = {}) {
  let I18n = currentI18n;
  let key = "";
  let fallback = "";
  let params = {};

  if (isObject(first) && ("I18n" in first || "key" in first || "fallback" in first || "params" in first)) {
    I18n = first.I18n || currentI18n;
    key = safeText(first.key, "");
    fallback = first.fallback === undefined ? safeText(second, key) : safeText(first.fallback, key);
    params = safeObject(first.params || third || fourth);
  } else {
    key = safeText(first, "");
    fallback = second === undefined || second === null ? key : safeText(second, key);
    params = safeObject(isObject(third) ? third : fourth);
  }

  return translateWithI18n(I18n, key, fallback, params);
}

/* =========================================================
   STATE / BRIDGES
========================================================= */

function setStateSilent(AppCore, patch = {}) {
  const cleanPatch = safeObject(patch);

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, cleanPatch);
  } catch {}

  try {
    AppCore?.setState?.(cleanPatch, { source: SOURCE, emit: false, emitState: false, silent: true });
  } catch {}

  try {
    AppCore?.patchState?.(cleanPatch, { source: SOURCE, emit: false, silent: true });
  } catch {}

  return cleanPatch;
}

function registerI18nModule(AppCore, I18n) {
  if (!AppCore || !I18n) return false;

  let ok = false;

  try {
    ok = registerModule(AppCore, "I18n", I18n, ["i18n", "Lang", "lang"]) || ok;
  } catch {}

  try {
    if (canExtend(AppCore)) {
      AppCore.I18n = AppCore.I18n || I18n;
      AppCore.i18n = AppCore.i18n || I18n;
      ok = true;
    }
  } catch {}

  return ok;
}

function bindCore(AppCore, I18n) {
  if (!AppCore || !I18n || boundCore === AppCore) return true;

  for (const method of CONFIGURE_METHODS) {
    try {
      if (!isFn(I18n?.[method])) continue;
      if (method === "bindCore") I18n[method](AppCore);
      else I18n[method]({ AppCore, core: AppCore, source: SOURCE });
    } catch (error) {
      pushError(AppCore, error, `I18n.${method}`);
    }
  }

  boundCore = AppCore;
  return true;
}

function attachBridge(AppCore, I18n, Router) {
  if (!canExtend(AppCore)) return false;

  const changeLanguageBridge = (lang, options = {}) => changeLanguage({ AppCore, I18n, Router, ...safeObject(options), lang });
  const getLanguageBridge = () => normalizeLang(AppCore?.state?.lang || getI18nLang(I18n) || getDocumentLang() || readStoredLang() || FALLBACK_LANG);
  const tBridge = (key, fallback = "", params = {}) => translateWithI18n(I18n, key, fallback, params);

  let ok = false;

  ok = defineHidden(AppCore, "changeLanguage", changeLanguageBridge) || ok;
  ok = defineHidden(AppCore, "setLanguage", changeLanguageBridge) || ok;
  ok = defineHidden(AppCore, "getLanguage", getLanguageBridge) || ok;
  ok = defineHidden(AppCore, "t", tBridge) || ok;

  try {
    AppCore.changeLanguage = changeLanguageBridge;
    AppCore.setLanguage = changeLanguageBridge;
    AppCore.getLanguage = getLanguageBridge;
    AppCore.t = tBridge;
    ok = true;
  } catch {}

  if (ok && !runtime.bridgeReady) {
    runtime.bridgeReady = true;
    safeEmit(AppCore, EVENTS.bridgeReady, { lang: getLanguageBridge() });
  }

  return ok;
}

function exposeDebugBridge(AppCore, I18n, Router) {
  if (!isBrowser()) return false;
  if (debugReady && window[DEBUG_KEY]) return true;

  const api = {
    version: I18N_VERSION,
    get: () => getI18nSnapshot({ AppCore, I18n, Router }),
    snapshot: () => getI18nSnapshot({ AppCore, I18n, Router }),
    change: (lang, options = {}) => changeLanguage({ AppCore, I18n, Router, ...safeObject(options), lang }),
    sync: (options = {}) => syncLangState({ AppCore, I18n, Router, ...safeObject(options) }),
    t: (key, fallback = "", params = {}) => translateWithI18n(I18n, key, fallback, params),
    reset: resetI18nRuntimeState,
  };

  try {
    window[DEBUG_KEY] = api;
  } catch {}

  try {
    defineHidden(AppCore, "I18nDebug", api);
  } catch {}

  debugReady = true;
  safeEmit(AppCore, EVENTS.debugReady);
  return true;
}

async function bootI18n(AppCore, I18n, lang = FALLBACK_LANG) {
  if (!I18n) return false;

  for (const method of INIT_METHODS) {
    try {
      if (!isFn(I18n?.[method])) continue;
      await maybeAwait(I18n[method]({ AppCore, core: AppCore, lang, fallbackLang: FALLBACK_LANG, defaultLang: DEFAULT_LANG, source: SOURCE }));
      return true;
    } catch (error) {
      pushError(AppCore, error, `I18n.${method}`);
    }
  }

  return false;
}

/* =========================================================
   SYNC / INIT
========================================================= */

function resolveInitialLang(AppCore, I18n, preferred = "") {
  const candidates = [
    preferred,
    AppCore?.state?.lang,
    AppCore?.state?.language,
    AppCore?.state?.locale,
    readStoredLang(),
    getI18nLang(I18n),
    getDocumentLang(),
    AppCore?.config?.lang,
    AppCore?.config?.language,
    AppCore?.config?.locale,
    AppCore?.config?.defaultLang,
    DEFAULT_LANG,
    FALLBACK_LANG,
  ];

  for (const candidate of candidates) {
    const lang = normalizeLang(candidate, "");
    if (lang && isAvailableLang(I18n, lang)) return lang;
  }

  return normalizeAvailableLang(I18n, FALLBACK_LANG, FALLBACK_LANG);
}

export function syncLangState(first = {}, second = null) {
  const { AppCore, I18n, Router, lang: preferredLang, reason = "sync-lang-state", persist = true, emit = true } = resolveDeps(first, second);

  rememberDeps({ AppCore, I18n, Router });

  const lang = resolveInitialLang(AppCore, I18n, preferredLang);
  const meta = getLangMeta(lang);
  const available = getAvailableLangs(I18n);

  setStateSilent(AppCore, {
    lang,
    language: lang,
    locale: meta.locale,
    dir: meta.direction,
    fallbackLang: FALLBACK_LANG,
    defaultLang: DEFAULT_LANG,
    availableLangs: available,
  });

  setDocumentLang(lang);
  setI18nLang(I18n, lang, { silent: true, reason, source: `${SOURCE}:sync` });
  if (persist) writeStoredLang(lang);

  runtime.lang = lang;
  runtime.reason = safeText(reason, "sync-lang-state");
  runtime.lastSyncAt = now();
  runtime.syncCount += 1;

  if (emit) {
    safeEmit(AppCore, EVENTS.sync, {
      lang,
      language: lang,
      locale: meta.locale,
      dir: meta.direction,
      fallbackLang: FALLBACK_LANG,
      defaultLang: DEFAULT_LANG,
      available,
      reason: runtime.reason,
    });
  }

  return lang;
}

export async function initI18n(first = {}, second = null) {
  const deps = resolveDeps(first, second);
  const { AppCore, I18n, Router, state, lang: preferredLang, force = false } = deps;

  rememberDeps(deps);

  const already = Boolean(initialized || runtime.initialized || state?.i18nInitialized || AppCore?.state?.i18nInitialized);

  if (already && !force) {
    const lang = syncLangState({ AppCore, I18n, Router, lang: preferredLang, reason: "init-i18n:already-initialized" });
    registerI18nModule(AppCore, I18n);
    attachBridge(AppCore, I18n, Router);
    exposeDebugBridge(AppCore, I18n, Router);
    return Boolean(lang);
  }

  safeEmit(AppCore, EVENTS.initStart, { scope: DEFAULT_SCOPE, force: Boolean(force) });

  registerI18nModule(AppCore, I18n);
  bindCore(AppCore, I18n);

  const initialLang = resolveInitialLang(AppCore, I18n, preferredLang);
  await bootI18n(AppCore, I18n, initialLang);
  await setI18nLangAsync(I18n, initialLang, { silent: true, reason: "init-i18n", source: `${SOURCE}:init` });

  const lang = syncLangState({ AppCore, I18n, Router, lang: initialLang, reason: "init-i18n" });

  attachBridge(AppCore, I18n, Router);
  exposeDebugBridge(AppCore, I18n, Router);

  initialized = true;
  runtime.initialized = true;

  try {
    if (state) state.i18nInitialized = true;
  } catch {}

  setStateSilent(AppCore, { i18nInitialized: true });

  const payload = {
    ok: true,
    lang,
    fallbackLang: FALLBACK_LANG,
    defaultLang: DEFAULT_LANG,
    available: getAvailableLangs(I18n),
    scope: DEFAULT_SCOPE,
  };

  safeEmit(AppCore, EVENTS.initDone, payload);
  safeEmit(AppCore, EVENTS.ready, payload);
  safeLog(AppCore, "I18n listo", payload);

  return true;
}

/* =========================================================
   CHANGE LANGUAGE
========================================================= */

function shouldEmitLang(payload = {}) {
  const key = [safeText(payload.lang, ""), safeText(payload.previousLang, ""), safeText(payload.reason, ""), safeText(payload.sequence, "")].join("|");
  const stamp = now();

  if (key === lastLangEmitKey && stamp - lastLangEmitAt < LANG_EMIT_DEDUPE_MS) return false;

  lastLangEmitKey = key;
  lastLangEmitAt = stamp;
  return true;
}

function emitLangChange(AppCore, payload = {}) {
  if (!shouldEmitLang(payload)) return false;
  return safeEmit(AppCore, EVENTS.langChange, payload);
}

export function changeLanguage(first = {}, second = null) {
  const deps = resolveDeps(first, second);
  const previous = deps.force ? null : changePromise;

  const runPromise = (previous || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const { AppCore, I18n, Router, lang, persist = true, emit = true, reason = "change-language" } = deps;

      rememberDeps({ AppCore, I18n, Router });

      const sequence = ++changeSeq;
      const requestedLang = normalizeLang(lang || second || "", "");
      const previousLang = normalizeLang(AppCore?.state?.lang || getI18nLang(I18n) || getDocumentLang() || readStoredLang() || DEFAULT_LANG, FALLBACK_LANG);
      const finalLang = normalizeAvailableLang(I18n, requestedLang || previousLang || DEFAULT_LANG, FALLBACK_LANG);

      runtime.requestedLang = requestedLang || finalLang;
      runtime.changeCount += 1;
      runtime.lastChangeAt = now();

      safeEmit(AppCore, EVENTS.changeStart, { lang: finalLang, requestedLang: requestedLang || finalLang, previousLang, reason, sequence });

      await setI18nLangAsync(I18n, finalLang, { reason, source: `${SOURCE}:change`, sequence });
      syncLangState({ AppCore, I18n, Router, lang: finalLang, reason, persist, emit: false });

      const meta = getLangMeta(finalLang);
      const payload = {
        lang: finalLang,
        language: finalLang,
        locale: meta.locale,
        dir: meta.direction,
        requestedLang: requestedLang || finalLang,
        previousLang,
        fallbackLang: FALLBACK_LANG,
        defaultLang: DEFAULT_LANG,
        available: getAvailableLangs(I18n),
        reason,
        rerender: false,
        rerenderByEvents: false,
        appEventsRerender: false,
        forceEventsRerender: false,
        rerenderHandledBy: "none",
        sequence,
      };

      if (emit) emitLangChange(AppCore, payload);
      safeEmit(AppCore, EVENTS.rerenderSkipped, { lang: finalLang, previousLang, reason, sequence, handledBy: SOURCE, routerRender: false });
      safeEmit(AppCore, EVENTS.changeDone, { ...payload, rerendered: false });

      return finalLang;
    })
    .catch((error) => {
      pushError(deps.AppCore, error, "changeLanguage");
      throw error;
    });

  const finalPromise = runPromise.finally(() => {
    if (changePromise === finalPromise) changePromise = null;
  });

  changePromise = finalPromise;
  return finalPromise;
}

/* =========================================================
   RERENDER COMPAT NO-OP
========================================================= */

export function rerenderCurrentRoute(first = {}, second = null) {
  const { AppCore, lang, reason = "i18n-rerender-disabled" } = resolveDeps(first, second);

  safeEmit(AppCore, EVENTS.rerenderSkipped, {
    lang: normalizeLang(lang || runtime.lang || FALLBACK_LANG),
    reason,
    routerRender: false,
    handledBy: SOURCE,
  });

  return false;
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getI18nSnapshot(first = {}, second = null) {
  const { AppCore, I18n, Router } = resolveDeps(first, second);
  const stateLang = normalizeLang(AppCore?.state?.lang, "");
  const i18nLang = getI18nLang(I18n);
  const documentLang = getDocumentLang();
  const storedLang = readStoredLang();
  const lang = normalizeLang(stateLang || i18nLang || documentLang || storedLang || FALLBACK_LANG);
  const meta = getLangMeta(lang);

  return sanitize({
    version: I18N_VERSION,
    initialized: Boolean(initialized || runtime.initialized || AppCore?.state?.i18nInitialized),
    modulePresent: Boolean(I18n),
    routerPresent: Boolean(Router),
    boundCore: Boolean(boundCore),
    bridgeReady: Boolean(runtime.bridgeReady),
    debugReady: Boolean(debugReady),
    lang,
    language: lang,
    locale: meta.locale,
    dir: meta.direction,
    stateLang,
    i18nLang,
    documentLang,
    storedLang,
    fallbackLang: FALLBACK_LANG,
    defaultLang: DEFAULT_LANG,
    available: getAvailableLangs(I18n),
    runtime: {
      lang: runtime.lang,
      requestedLang: runtime.requestedLang,
      reason: runtime.reason,
      syncCount: runtime.syncCount,
      changeCount: runtime.changeCount,
      lastSyncAt: runtime.lastSyncAt,
      lastSyncAtIso: runtime.lastSyncAt ? iso(runtime.lastSyncAt) : "",
      lastChangeAt: runtime.lastChangeAt,
      lastChangeAtIso: runtime.lastChangeAt ? iso(runtime.lastChangeAt) : "",
      changeSequence: changeSeq,
      changeInFlight: Boolean(changePromise),
    },
    storageKeys: [...STORAGE_KEYS],
    errors: runtime.errors,
    policy: {
      adapterOnly: true,
      ownRouter: false,
      ownRender: false,
      ownToast: false,
      ownFetch: false,
      ownStorageSystem: false,
      ownDictionaries: false,
    },
  });
}

export function resetI18nRuntimeState() {
  initialized = false;
  boundCore = null;
  currentAppCore = null;
  currentI18n = null;
  currentRouter = null;
  changePromise = null;
  changeSeq = 0;
  debugReady = false;
  lastLangEmitKey = "";
  lastLangEmitAt = 0;

  Object.assign(runtime, {
    initialized: false,
    lang: "",
    requestedLang: "",
    reason: "",
    syncCount: 0,
    changeCount: 0,
    lastSyncAt: 0,
    lastChangeAt: 0,
    bridgeReady: false,
    errors: [],
  });

  return getI18nSnapshot();
}

export default {
  I18N_VERSION,

  initI18n,
  syncLangState,

  changeLanguage,
  rerenderCurrentRoute,

  t,

  getI18nSnapshot,
  resetI18nRuntimeState,
};

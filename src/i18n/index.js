/* =========================================================
   Onion Support - I18n
   Archivo: /src/i18n/index.js

   Responsabilidad:
   - Singleton mínimo de traducción.
   - Idiomas reales: ca / es / en.
   - Fallback: en.
   - Traducción por key path.
   - Interpolación básica.
   - Update DOM mínimo por data-i18n.
   - Registro opcional en AppCore.
   - Sin storage.
   - Sin autoboot.
   - Sin eventos globales.
   - Sin innerHTML.
   - Sin refresh raro.
   - Sin magia negra.
========================================================= */

import es from "./locales/es/index.js";
import en from "./locales/en/index.js";
import ca from "./locales/ca/index.js";

export const I18N_VERSION = "simple";

const FALLBACK_LANG = "en";
const SUPPORTED_LANGS = Object.freeze(["ca", "es", "en"]);

const dictionaries = {
  ca: ca || {},
  es: es || {},
  en: en || {},
};

let currentLang = FALLBACK_LANG;
let coreRef = null;
let booted = false;
let lastUpdateCount = 0;

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

function normalizeLang(value = "") {
  const raw = text(value, "")
    .toLowerCase()
    .replace("_", "-");

  const short = raw.split("-")[0];

  if (SUPPORTED_LANGS.includes(raw)) return raw;
  if (SUPPORTED_LANGS.includes(short)) return short;

  return FALLBACK_LANG;
}

function browserLang() {
  if (!isBrowser()) return FALLBACK_LANG;

  const langs = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const lang of langs) {
    const normalized = normalizeLang(lang);

    if (SUPPORTED_LANGS.includes(normalized)) {
      return normalized;
    }
  }

  return FALLBACK_LANG;
}

function initialLang() {
  if (!isBrowser()) return FALLBACK_LANG;

  return normalizeLang(
    document.documentElement.dataset.locale ||
      document.documentElement.lang ||
      browserLang()
  );
}

/* =========================================================
   DICTIONARY
========================================================= */

function getNested(source = {}, path = "") {
  const keys = text(path, "")
    .split(".")
    .map((key) => key.trim())
    .filter(Boolean);

  let cursor = source;

  for (const key of keys) {
    if (!cursor || !Object.prototype.hasOwnProperty.call(cursor, key)) {
      return undefined;
    }

    cursor = cursor[key];
  }

  return cursor;
}

function mergeObjects(left = {}, right = {}) {
  return {
    ...(isObject(left) ? left : {}),
    ...(isObject(right) ? right : {}),
  };
}

function resolveValue(key = "", lang = currentLang) {
  const cleanKey = text(key, "");

  if (!cleanKey) return "";

  const selected = normalizeLang(lang);

  return (
    getNested(dictionaries[selected], cleanKey) ??
    getNested(dictionaries[FALLBACK_LANG], cleanKey) ??
    cleanKey
  );
}

/* =========================================================
   TRANSLATE
========================================================= */

function normalizeArgs(params = {}, fallback = "") {
  if (isObject(params)) {
    return {
      params,
      fallback: text(fallback, ""),
    };
  }

  return {
    params: {},
    fallback: text(params, fallback),
  };
}

function interpolate(value = "", params = {}) {
  const source = String(value ?? "");
  const data = isObject(params) ? params : {};

  return source.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\{\s*([a-zA-Z0-9_.-]+)\s*\}/g,
    (match, keyA, keyB) => {
      const key = keyA || keyB;
      const value = getNested(data, key) ?? data[key];

      return value === undefined || value === null ? match : String(value);
    }
  );
}

function resolvePlural(value, params = {}) {
  if (!isObject(value)) return value;

  const count = Number(params.count ?? params.n ?? params.total);

  if (Number.isFinite(count)) {
    if (value[`=${count}`] !== undefined) return value[`=${count}`];
    if (count === 0 && value.zero !== undefined) return value.zero;
    if (count === 1 && value.one !== undefined) return value.one;
    if (count !== 1 && value.other !== undefined) return value.other;
  }

  return value.default ?? value.other ?? value.one ?? "";
}

function translate(key = "", params = {}, fallback = "") {
  const cleanKey = text(key, "");
  const args = normalizeArgs(params, fallback);

  if (!cleanKey) return args.fallback;

  const raw = resolvePlural(resolveValue(cleanKey), args.params);

  if (
    raw === undefined ||
    raw === null ||
    isObject(raw) ||
    Array.isArray(raw)
  ) {
    return interpolate(args.fallback || cleanKey, args.params);
  }

  return interpolate(raw, args.params);
}

export const t = translate;

/* =========================================================
   DOM
========================================================= */

function getScope(root = null) {
  if (!isBrowser()) return null;

  if (!root) return document;
  if (root === window || root === document) return document;

  if (typeof root === "string") {
    try {
      return document.querySelector(root) || document;
    } catch {
      return document;
    }
  }

  return root?.querySelectorAll ? root : document;
}

function queryAll(scope, selector = "") {
  if (!scope || !selector) return [];

  try {
    return [...scope.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function readParams(node = null) {
  const raw = node?.getAttribute?.("data-i18n-params");

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readFallback(node = null) {
  return text(node?.getAttribute?.("data-i18n-fallback"), "");
}

function applyText(node = null, key = "") {
  if (!node || !key) return false;

  try {
    node.textContent = translate(key, readParams(node), readFallback(node));
    return true;
  } catch {
    return false;
  }
}

function applyAttr(node = null, attr = "", key = "") {
  if (!node || !attr || !key) return false;

  try {
    node.setAttribute(attr, translate(key, readParams(node), readFallback(node)));
    return true;
  } catch {
    return false;
  }
}

export function updateDOM(root = null) {
  const scope = getScope(root);

  if (!scope) return false;

  let count = 0;

  for (const node of queryAll(scope, "[data-i18n]")) {
    if (applyText(node, node.getAttribute("data-i18n"))) count += 1;
  }

  const attrs = [
    ["[data-i18n-placeholder]", "placeholder", "data-i18n-placeholder"],
    ["[data-i18n-title]", "title", "data-i18n-title"],
    ["[data-i18n-aria-label]", "aria-label", "data-i18n-aria-label"],
    ["[data-i18n-alt]", "alt", "data-i18n-alt"],
  ];

  for (const [selector, attr, dataAttr] of attrs) {
    for (const node of queryAll(scope, selector)) {
      if (applyAttr(node, attr, node.getAttribute(dataAttr))) count += 1;
    }
  }

  lastUpdateCount = count;

  return true;
}

/* =========================================================
   LANG
========================================================= */

function syncDocument(lang = currentLang) {
  if (!isBrowser()) return false;

  const normalized = normalizeLang(lang);

  try {
    document.documentElement.lang = normalized;
    document.documentElement.dataset.locale = normalized;
    document.documentElement.dataset.localeSource = "i18n";
    document.documentElement.dataset.localeFallback = FALLBACK_LANG;
    document.documentElement.dataset.localeSupported = SUPPORTED_LANGS.join(" ");
    return true;
  } catch {
    return false;
  }
}

function syncCore(lang = currentLang) {
  const normalized = normalizeLang(lang);

  try {
    if (isFunction(coreRef?.setState)) {
      coreRef.setState(
        {
          lang: normalized,
          language: normalized,
          locale: normalized,
        },
        {
          source: "i18n",
          silent: true,
          emit: false,
        }
      );

      return true;
    }
  } catch {
    // fallback abajo
  }

  try {
    if (coreRef?.state) {
      coreRef.state.lang = normalized;
      coreRef.state.language = normalized;
      coreRef.state.locale = normalized;
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang = FALLBACK_LANG, options = {}) {
  const normalized = normalizeLang(lang);

  currentLang = normalized;

  syncDocument(normalized);
  syncCore(normalized);

  if (options.updateDOM !== false && options.updateUi !== false) {
    updateDOM(options.root || null);
  }

  return currentLang;
}

export function hasLang(lang = "") {
  return SUPPORTED_LANGS.includes(normalizeLang(lang));
}

export function getAvailable() {
  return [...SUPPORTED_LANGS];
}

export function getDictionary(lang = currentLang) {
  return dictionaries[normalizeLang(lang)] || dictionaries[FALLBACK_LANG] || {};
}

export function exists(key = "", lang = currentLang) {
  const cleanKey = text(key, "");

  if (!cleanKey) return false;

  return (
    getNested(dictionaries[normalizeLang(lang)], cleanKey) !== undefined ||
    getNested(dictionaries[FALLBACK_LANG], cleanKey) !== undefined
  );
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerOnCore(core = null) {
  if (!core) return false;

  coreRef = core;

  try {
    core.I18n = api;
    core.i18n = api;
    core.t = translate;

    core.services = isObject(core.services) ? core.services : {};
    core.services.I18n = api;
    core.services.i18n = api;

    core.modules?.register?.("I18n", api);
    core.modules?.register?.("i18n", api);

    return true;
  } catch {
    return false;
  }
}

export function bindCore(core = null) {
  registerOnCore(core);
  syncCore(currentLang);
  return api;
}

export function register(lang = "", dictionary = {}, options = {}) {
  const code = normalizeLang(lang);

  if (!SUPPORTED_LANGS.includes(code) || !isObject(dictionary)) {
    return false;
  }

  dictionaries[code] = options.merge === true
    ? mergeObjects(dictionaries[code], dictionary)
    : dictionary;

  if (code === currentLang && options.updateDOM === true) {
    updateDOM(options.root || null);
  }

  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

export function init(options = {}) {
  if (booted && options.force !== true) {
    if (options.updateDOM === true || options.updateUi === true) {
      updateDOM(options.root || null);
    }

    return api;
  }

  if (options.AppCore || options.core) {
    bindCore(options.AppCore || options.core);
  }

  currentLang = normalizeLang(
    options.lang ||
      options.locale ||
      coreRef?.state?.lang ||
      initialLang()
  );

  syncDocument(currentLang);
  syncCore(currentLang);

  if (options.updateDOM !== false && options.updateUi !== false) {
    updateDOM(options.root || null);
  }

  booted = true;

  return api;
}

export const boot = init;
export const start = init;

export function reload(root = null) {
  return updateDOM(root);
}

export function reset(options = {}) {
  return setLang(FALLBACK_LANG, {
    ...options,
    updateDOM: options.updateDOM !== false,
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSnapshot() {
  return {
    version: I18N_VERSION,

    lang: currentLang,
    locale: currentLang,

    fallbackLang: FALLBACK_LANG,
    available: getAvailable(),

    booted,
    hasCore: Boolean(coreRef),

    lastUpdateCount,

    documentLang: isBrowser()
      ? document.documentElement.lang || ""
      : "",

    policy: {
      noStorage: true,
      noAutoboot: true,
      noGlobalEvents: true,
      noInnerHTML: true,
      noCustomEvent: true,
      supported: [...SUPPORTED_LANGS],
    },
  };
}

/* =========================================================
   API
========================================================= */

export const api = {
  I18N_VERSION,
  version: I18N_VERSION,

  init,
  boot,
  start,

  bindCore,

  t,
  translate,

  getLang,
  getLocale: getLang,

  setLang,
  setLocale: setLang,
  changeLanguage: setLang,

  hasLang,
  exists,

  getAvailable,
  getLanguages: getAvailable,
  getDictionary,

  register,

  updateDOM,
  reload,
  refresh: reload,
  reset,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
};

export const I18n = api;

export default I18n;

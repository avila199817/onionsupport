/* =========================================================
   Onion Support - I18n
   Archivo: /src/i18n/index.js

   Responsabilidad:
   - Traducción mínima ca / es / en.
   - Fallback de idioma: en.
   - Traducción por key path.
   - Interpolación básica.
   - Aplicar data-i18n al DOM.
   - Si falta traducción, NO pisa el fallback del template.
   - Sin storage.
   - Sin fetch.
   - Sin eventos globales.
   - Sin innerHTML.
   - Sin Router.
   - Sin Toast.
========================================================= */

import es from "./locales/es/index.js";
import en from "./locales/en/index.js";
import ca from "./locales/ca/index.js";

export const I18N_VERSION = "minimal-1";

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

function isFn(value) {
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

function getBrowserLang() {
  if (!isBrowser()) return FALLBACK_LANG;

  const langs = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const lang of langs) {
    const clean = normalizeLang(lang);

    if (SUPPORTED_LANGS.includes(clean)) {
      return clean;
    }
  }

  return FALLBACK_LANG;
}

function getInitialLang() {
  if (!isBrowser()) return FALLBACK_LANG;

  return normalizeLang(
    document.documentElement.dataset.locale ||
      document.documentElement.lang ||
      getBrowserLang()
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

function setNested(target = {}, path = "", value = "") {
  const keys = text(path, "")
    .split(".")
    .map((key) => key.trim())
    .filter(Boolean);

  if (!keys.length) return false;

  let cursor = target;

  while (keys.length > 1) {
    const key = keys.shift();

    if (!isObject(cursor[key])) {
      cursor[key] = {};
    }

    cursor = cursor[key];
  }

  cursor[keys[0]] = value;
  return true;
}

function mergeObjects(left = {}, right = {}) {
  return {
    ...(isObject(left) ? left : {}),
    ...(isObject(right) ? right : {}),
  };
}

function resolveRaw(key = "", lang = currentLang) {
  const cleanKey = text(key, "");

  if (!cleanKey) {
    return {
      found: false,
      value: "",
    };
  }

  const selected = normalizeLang(lang);
  const selectedValue = getNested(dictionaries[selected], cleanKey);

  if (selectedValue !== undefined) {
    return {
      found: true,
      value: selectedValue,
    };
  }

  const fallbackValue = getNested(dictionaries[FALLBACK_LANG], cleanKey);

  if (fallbackValue !== undefined) {
    return {
      found: true,
      value: fallbackValue,
    };
  }

  return {
    found: false,
    value: "",
  };
}

/* =========================================================
   TRANSLATE
========================================================= */

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

function normalizeTranslateArgs(params = {}, fallback = "") {
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

export function translate(key = "", params = {}, fallback = "") {
  const cleanKey = text(key, "");
  const args = normalizeTranslateArgs(params, fallback);

  if (!cleanKey) return args.fallback;

  const resolved = resolveRaw(cleanKey);

  if (!resolved.found) {
    return interpolate(args.fallback || cleanKey, args.params);
  }

  const value = resolvePlural(resolved.value, args.params);

  if (
    value === undefined ||
    value === null ||
    isObject(value) ||
    Array.isArray(value)
  ) {
    return interpolate(args.fallback || cleanKey, args.params);
  }

  return interpolate(value, args.params);
}

export const t = translate;

/* =========================================================
   DOM
========================================================= */

function getScope(root = null) {
  if (!isBrowser()) return null;

  if (!root || root === window || root === document) {
    return document;
  }

  if (typeof root === "string") {
    try {
      return document.querySelector(root) || document;
    } catch {
      return document;
    }
  }

  return isFn(root.querySelectorAll) ? root : document;
}

function queryAll(scope, selector = "") {
  if (!scope || !selector) return [];

  try {
    return Array.from(scope.querySelectorAll(selector));
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

function readFallback(node = null, suffix = "") {
  const specific = suffix
    ? text(node?.getAttribute?.(`data-i18n-${suffix}-fallback`), "")
    : "";

  return (
    specific ||
    text(node?.getAttribute?.("data-i18n-fallback"), "")
  );
}

function resolveDomValue(node = null, key = "", suffix = "") {
  const cleanKey = text(key, "");

  if (!node || !cleanKey) {
    return {
      ok: false,
      value: "",
    };
  }

  const params = readParams(node);
  const fallback = readFallback(node, suffix);
  const resolved = resolveRaw(cleanKey);

  if (!resolved.found) {
    if (!fallback) {
      return {
        ok: false,
        value: "",
      };
    }

    return {
      ok: true,
      value: interpolate(fallback, params),
    };
  }

  const value = resolvePlural(resolved.value, params);

  if (
    value === undefined ||
    value === null ||
    isObject(value) ||
    Array.isArray(value)
  ) {
    if (!fallback) {
      return {
        ok: false,
        value: "",
      };
    }

    return {
      ok: true,
      value: interpolate(fallback, params),
    };
  }

  return {
    ok: true,
    value: interpolate(value, params),
  };
}

function applyText(node = null, key = "") {
  const result = resolveDomValue(node, key);

  if (!result.ok) return false;

  try {
    node.textContent = result.value;
    return true;
  } catch {
    return false;
  }
}

function applyAttr(node = null, attr = "", key = "", suffix = "") {
  const result = resolveDomValue(node, key, suffix);

  if (!result.ok) return false;

  try {
    node.setAttribute(attr, result.value);
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
    if (applyText(node, node.getAttribute("data-i18n"))) {
      count += 1;
    }
  }

  const attrBindings = [
    ["[data-i18n-placeholder]", "placeholder", "data-i18n-placeholder", "placeholder"],
    ["[data-i18n-title]", "title", "data-i18n-title", "title"],
    ["[data-i18n-aria-label]", "aria-label", "data-i18n-aria-label", "aria-label"],
    ["[data-i18n-alt]", "alt", "data-i18n-alt", "alt"],
  ];

  for (const [selector, attr, dataAttr, suffix] of attrBindings) {
    for (const node of queryAll(scope, selector)) {
      if (applyAttr(node, attr, node.getAttribute(dataAttr), suffix)) {
        count += 1;
      }
    }
  }

  lastUpdateCount = count;

  return true;
}

/* =========================================================
   LANGUAGE
========================================================= */

function syncDocument(lang = currentLang) {
  if (!isBrowser()) return false;

  const clean = normalizeLang(lang);

  try {
    document.documentElement.lang = clean;
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = clean;
    document.documentElement.dataset.localeSource = "i18n";
    document.documentElement.dataset.localeFallback = FALLBACK_LANG;
    document.documentElement.dataset.localeSupported = SUPPORTED_LANGS.join(" ");
    return true;
  } catch {
    return false;
  }
}

function syncCore(lang = currentLang) {
  const clean = normalizeLang(lang);

  try {
    if (isFn(coreRef?.setState)) {
      coreRef.setState(
        {
          lang: clean,
          language: clean,
          locale: clean,
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
      coreRef.state.lang = clean;
      coreRef.state.language = clean;
      coreRef.state.locale = clean;
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
  currentLang = normalizeLang(lang);

  syncDocument(currentLang);
  syncCore(currentLang);

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
  return resolveRaw(key, lang).found;
}

export function register(lang = "", dictionary = {}, options = {}) {
  const clean = normalizeLang(lang);

  if (!SUPPORTED_LANGS.includes(clean) || !isObject(dictionary)) {
    return false;
  }

  dictionaries[clean] = options.merge === true
    ? mergeObjects(dictionaries[clean], dictionary)
    : dictionary;

  if (clean === currentLang && options.updateDOM === true) {
    updateDOM(options.root || null);
  }

  return true;
}

export function set(key = "", value = "", lang = currentLang, options = {}) {
  const clean = normalizeLang(lang);

  if (!SUPPORTED_LANGS.includes(clean) || !text(key, "")) {
    return false;
  }

  setNested(dictionaries[clean], key, value);

  if (clean === currentLang && options.updateDOM === true) {
    updateDOM(options.root || null);
  }

  return true;
}

/* =========================================================
   CORE
========================================================= */

export function bindCore(core = null) {
  if (!core) return api;

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
  } catch {
    // noop
  }

  syncCore(currentLang);
  return api;
}

/* =========================================================
   LIFECYCLE
========================================================= */

export function init(options = {}) {
  if (options.AppCore || options.core) {
    bindCore(options.AppCore || options.core);
  }

  if (!booted || options.force === true) {
    currentLang = normalizeLang(
      options.lang ||
        options.locale ||
        coreRef?.state?.lang ||
        getInitialLang()
    );

    booted = true;
  }

  syncDocument(currentLang);
  syncCore(currentLang);

  if (options.updateDOM !== false && options.updateUi !== false) {
    updateDOM(options.root || null);
  }

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
    supportedLangs: getAvailable(),

    booted,
    hasCore: Boolean(coreRef),
    lastUpdateCount,

    documentLang: isBrowser()
      ? document.documentElement.lang || ""
      : "",
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
  set,

  updateDOM,
  reload,
  refresh: reload,
  reset,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
};

export const I18n = api;

export default I18n;

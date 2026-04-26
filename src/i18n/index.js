/* =========================================================
   Onion SPA - i18n Core
   Archivo: src/i18n/index.js

   Responsabilidades:
   - registro de idiomas
   - traducción por key path
   - fallback robusto a español
   - cambio live de idioma
   - persistencia local
   - sincronización opcional con AppCore
   - evento global app:lang:change
   - helpers para refresco de UI
   - soporte extendido para atributos
   - evitar dependencia circular con Core

   HARDENING EXTREMO:
   - sin dependencia directa de AppCore
   - boot idempotente
   - storage tolerante a JSON/raw/legacy
   - fallback multilenguaje estable
   - interpolación segura
   - DOM refresh parcial por scope
   - soporte data-i18n-params
   - soporte data-i18n-fallback
   - soporte data-i18n-count / plural básico
   - no rompe si faltan diccionarios parciales
   - eventos consistentes
   - aliases públicos estables
========================================================= */

import es from "./locales/es/index.js";
import en from "./locales/en/index.js";
import ca from "./locales/ca/index.js";

/* =========================================================
   SINGLETON
========================================================= */

export const I18n = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */

  const STORAGE_KEY = "lang";
  const FALLBACK_LANG = "es";

  const dictionaries = {
    es: es || {},
    en: en || {},
    ca: ca || {},
  };

  let coreRef = null;
  let currentLang = FALLBACK_LANG;
  let booted = false;
  let booting = false;
  let lastChangeAt = 0;

  /* =========================================================
     BASICS
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

    const text =
      String(value).trim();

    return text || fallback;
  }

  function isPlainObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function safeObject(value) {
    return isPlainObject(value)
      ? value
      : {};
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeNumber(value, fallback = 0) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function safeJsonParse(value, fallback = null) {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    if (typeof value === "object") {
      return value;
    }

    const raw =
      String(value).trim();

    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function safeLog(...args) {
    try {
      if (getCore()?.config?.debug) {
        getCore()?.utils?.log?.(
          "[I18n]",
          ...args
        );
      }
    } catch {}
  }

  function safeWarn(...args) {
    try {
      getCore()?.utils?.warn?.(
        "[I18n]",
        ...args
      );
    } catch {}

    try {
      if (getCore()?.config?.debug) {
        console.warn(
          "[I18n]",
          ...args
        );
      }
    } catch {}
  }

  /* =========================================================
     CORE REF
  ========================================================= */

  function getCore() {
    return coreRef;
  }

  function bindCore(AppCore) {
    coreRef = AppCore || null;

    try {
      const lang =
        normalizeLang(
          currentLang ||
            getCore()?.state?.lang ||
            getDefaultLang()
        );

      syncLangToState(lang);
      syncLangToDocument(lang);
    } catch {}

    return api;
  }

  function getDefaultLang() {
    const configured =
      safeText(
        getCore()?.config?.defaultLang,
        FALLBACK_LANG
      ).toLowerCase();

    return hasLang(configured)
      ? configured
      : FALLBACK_LANG;
  }

  function getStoragePrefix() {
    return safeText(
      getCore()?.config?.storagePrefix,
      "onion"
    );
  }

  /* =========================================================
     LANG HELPERS
  ========================================================= */

  function hasLang(lang = "") {
    const code =
      safeText(lang, "").toLowerCase();

    return Boolean(
      code &&
        Object.prototype.hasOwnProperty.call(
          dictionaries,
          code
        )
    );
  }

  function normalizeLang(lang = "") {
    const raw =
      safeText(lang, "")
        .toLowerCase()
        .replace(/_/g, "-");

    const defaultLang =
      safeText(
        getDefaultLang(),
        FALLBACK_LANG
      ).toLowerCase();

    if (!raw) {
      return hasLang(defaultLang)
        ? defaultLang
        : FALLBACK_LANG;
    }

    if (hasLang(raw)) {
      return raw;
    }

    const short =
      raw.split("-")[0];

    if (hasLang(short)) {
      return short;
    }

    return hasLang(defaultLang)
      ? defaultLang
      : FALLBACK_LANG;
  }

  function getAvailable() {
    return Object.keys(dictionaries);
  }

  function getDictionary(lang = currentLang) {
    const code =
      normalizeLang(lang);

    const defaultLang =
      getDefaultLang();

    return (
      dictionaries[code] ||
      dictionaries[defaultLang] ||
      dictionaries[FALLBACK_LANG] ||
      {}
    );
  }

  /* =========================================================
     OBJECT HELPERS
  ========================================================= */

  function getNested(obj, path = "") {
    if (!obj || !path) {
      return undefined;
    }

    const keys =
      String(path)
        .split(".")
        .map((item) => item.trim())
        .filter(Boolean);

    let cursor = obj;

    for (const key of keys) {
      if (
        cursor &&
        Object.prototype.hasOwnProperty.call(
          cursor,
          key
        )
      ) {
        cursor = cursor[key];
      } else {
        return undefined;
      }
    }

    return cursor;
  }

  function deepMerge(target = {}, source = {}) {
    const output = {
      ...safeObject(target),
    };

    const input =
      safeObject(source);

    Object.keys(input).forEach((key) => {
      const current =
        output[key];

      const next =
        input[key];

      if (
        isPlainObject(current) &&
        isPlainObject(next)
      ) {
        output[key] =
          deepMerge(current, next);
        return;
      }

      output[key] = next;
    });

    return output;
  }

  /* =========================================================
     INTERPOLATION / PLURAL
  ========================================================= */

  function interpolate(text = "", params = {}) {
    const data =
      safeObject(params);

    return String(text).replace(
      /\{([a-zA-Z0-9_.$-]+)\}/g,
      (match, key) => {
        const direct =
          data[key];

        const nested =
          getNested(data, key);

        const value =
          direct !== undefined
            ? direct
            : nested;

        return value !== undefined &&
          value !== null
          ? String(value)
          : match;
      }
    );
  }

  function resolvePlural(value, params = {}) {
    if (!isPlainObject(value)) {
      return value;
    }

    const count =
      safeNumber(
        params.count ??
          params.n ??
          params.total,
        NaN
      );

    if (
      Number.isFinite(count)
    ) {
      if (
        count === 0 &&
        value.zero !== undefined
      ) {
        return value.zero;
      }

      if (
        count === 1 &&
        value.one !== undefined
      ) {
        return value.one;
      }

      if (value.other !== undefined) {
        return value.other;
      }
    }

    return (
      value.default ??
      value.other ??
      value.one ??
      ""
    );
  }

  function resolveValue(key = "", params = {}, fallback = "") {
    const lang =
      currentLang;

    const defaultLang =
      getDefaultLang();

    const active =
      getNested(
        dictionaries[lang],
        key
      );

    const base =
      getNested(
        dictionaries[defaultLang],
        key
      );

    const fallbackBase =
      getNested(
        dictionaries[FALLBACK_LANG],
        key
      );

    const resolved =
      active ??
      base ??
      fallbackBase ??
      fallback ??
      key;

    return resolvePlural(
      resolved,
      params
    );
  }

  function t(key = "", params = {}, fallback = "") {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return safeText(fallback, "");
    }

    const resolved =
      resolveValue(
        cleanKey,
        params,
        fallback
      );

    if (
      resolved === null ||
      resolved === undefined
    ) {
      return cleanKey;
    }

    if (
      typeof resolved === "string" ||
      typeof resolved === "number" ||
      typeof resolved === "boolean"
    ) {
      return interpolate(
        resolved,
        params
      );
    }

    return interpolate(
      safeText(fallback, cleanKey),
      params
    );
  }

  function exists(key = "") {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return false;
    }

    const defaultLang =
      getDefaultLang();

    return (
      getNested(
        dictionaries[currentLang],
        cleanKey
      ) !== undefined ||
      getNested(
        dictionaries[defaultLang],
        cleanKey
      ) !== undefined ||
      getNested(
        dictionaries[FALLBACK_LANG],
        cleanKey
      ) !== undefined
    );
  }

  /* =========================================================
     STORAGE
  ========================================================= */

  function getStorageCandidates() {
    const prefix =
      getStoragePrefix();

    return [
      STORAGE_KEY,
      `${prefix}:${STORAGE_KEY}`,
      `${prefix}_${STORAGE_KEY}`,
      "onion:lang",
      "onion_lang",
      "lang",
    ];
  }

  function normalizeStoredLang(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (typeof value === "string") {
      const raw =
        value.trim();

      if (!raw) {
        return "";
      }

      const parsed =
        safeJsonParse(raw, undefined);

      if (typeof parsed === "string") {
        return safeText(parsed, "");
      }

      return raw;
    }

    return safeText(value, "");
  }

  function safeStorageGet() {
    const core =
      getCore();

    const candidates =
      getStorageCandidates();

    try {
      if (core?.storage?.getRaw) {
        for (const key of candidates) {
          const value =
            normalizeStoredLang(
              core.storage.getRaw(key, "")
            );

          if (value) {
            return value;
          }
        }
      }
    } catch {}

    try {
      if (core?.storage?.get) {
        for (const key of candidates) {
          const value =
            normalizeStoredLang(
              core.storage.get(key, "")
            );

          if (value) {
            return value;
          }
        }
      }
    } catch {}

    if (!isBrowser()) {
      return null;
    }

    try {
      for (const key of candidates) {
        const value =
          normalizeStoredLang(
            window.localStorage?.getItem?.(key)
          );

        if (value) {
          return value;
        }
      }
    } catch {}

    return null;
  }

  function safeStorageSet(lang) {
    const normalized =
      normalizeLang(lang);

    const core =
      getCore();

    try {
      if (core?.storage?.setRaw) {
        core.storage.setRaw(
          STORAGE_KEY,
          normalized
        );
      } else if (core?.storage?.set) {
        core.storage.set(
          STORAGE_KEY,
          normalized
        );
      }
    } catch {}

    if (!isBrowser()) {
      return;
    }

    try {
      window.localStorage?.setItem?.(
        `${getStoragePrefix()}:${STORAGE_KEY}`,
        normalized
      );
    } catch {}
  }

  /* =========================================================
     SYNC
  ========================================================= */

  function syncLangToDocument(lang) {
    if (!isBrowser()) {
      return false;
    }

    try {
      document.documentElement.setAttribute(
        "lang",
        normalizeLang(lang)
      );

      return true;
    } catch {
      return false;
    }
  }

  function syncLangToState(lang) {
    const normalized =
      normalizeLang(lang);

    try {
      const core =
        getCore();

      if (
        typeof core?.setState === "function"
      ) {
        core.setState({
          lang: normalized,
        });

        return true;
      }

      if (
        core?.state &&
        typeof core.state === "object"
      ) {
        core.state.lang = normalized;
        return true;
      }
    } catch {}

    return false;
  }

  function emitLangChange(lang, extra = {}) {
    const normalized =
      normalizeLang(lang);

    const payload = {
      lang: normalized,
      previousLang:
        extra.previousLang || null,
      changed:
        Boolean(extra.changed),
      dictionary:
        getDictionary(normalized),
      available:
        getAvailable(),
      source:
        extra.source || "i18n",
      at:
        new Date().toISOString(),
    };

    let emittedByCore = false;

    try {
      const core =
        getCore();

      if (core?.events?.emit) {
        core.events.emit(
          "app:lang:change",
          payload
        );

        emittedByCore = true;
      }
    } catch {}

    if (
      !emittedByCore &&
      isBrowser()
    ) {
      try {
        document.dispatchEvent(
          new CustomEvent(
            "app:lang:change",
            {
              detail: payload,
            }
          )
        );
      } catch {}
    }

    return payload;
  }

  /* =========================================================
     DOM PARAMS
  ========================================================= */

  function getScope(root = null) {
    if (!isBrowser()) {
      return null;
    }

    try {
      if (!root) {
        return document;
      }

      if (
        root === document ||
        root === window ||
        root instanceof Element ||
        root instanceof Document ||
        root instanceof DocumentFragment
      ) {
        return root === window
          ? document
          : root;
      }
    } catch {}

    return document;
  }

  function readNodeParams(node) {
    if (!node) {
      return {};
    }

    const raw =
      node.getAttribute?.(
        "data-i18n-params"
      );

    const parsed =
      safeJsonParse(raw, {});

    return safeObject(parsed);
  }

  function readNodeFallback(node) {
    return safeText(
      node?.getAttribute?.(
        "data-i18n-fallback"
      ),
      ""
    );
  }

  function readNodeCount(node) {
    const raw =
      node?.getAttribute?.(
        "data-i18n-count"
      );

    if (
      raw === null ||
      raw === undefined ||
      raw === ""
    ) {
      return undefined;
    }

    const count =
      Number(raw);

    return Number.isFinite(count)
      ? count
      : undefined;
  }

  function buildNodeParams(node) {
    const params =
      readNodeParams(node);

    const count =
      readNodeCount(node);

    if (count !== undefined) {
      params.count = count;
    }

    return params;
  }

  function applyNodeText(node, key) {
    const params =
      buildNodeParams(node);

    const fallback =
      readNodeFallback(node);

    node.textContent =
      t(key, params, fallback);
  }

  function applyNodeHtml(node, key) {
    const params =
      buildNodeParams(node);

    const fallback =
      readNodeFallback(node);

    /*
      Uso previsto para HTML controlado del diccionario.
      No usar con contenido generado por usuarios.
    */
    node.innerHTML =
      t(key, params, fallback);
  }

  function applyNodeAttr(node, attr, key) {
    const cleanAttr =
      safeText(attr, "");

    const cleanKey =
      safeText(key, "");

    if (!node || !cleanAttr || !cleanKey) {
      return false;
    }

    const params =
      buildNodeParams(node);

    const fallback =
      readNodeFallback(node);

    const value =
      t(cleanKey, params, fallback);

    try {
      node.setAttribute(
        cleanAttr,
        value
      );

      return true;
    } catch {
      return false;
    }
  }

  function translateAttr(scope, selector, targetAttr, dataAttr) {
    try {
      scope
        .querySelectorAll(selector)
        .forEach((node) => {
          const key =
            node.getAttribute(dataAttr);

          applyNodeAttr(
            node,
            targetAttr,
            key
          );
        });
    } catch {}
  }

  function translateDynamicAttrs(scope) {
    try {
      scope
        .querySelectorAll("[data-i18n-attr]")
        .forEach((node) => {
          const raw =
            safeText(
              node.getAttribute(
                "data-i18n-attr"
              ),
              ""
            );

          if (!raw) {
            return;
          }

          /*
            Formatos soportados:
            - data-i18n-attr="title:common.title"
            - data-i18n-attr="placeholder:forms.search;aria-label:forms.search"
          */
          raw
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((entry) => {
              const [attr, ...keyParts] =
                entry.split(":");

              const key =
                keyParts.join(":");

              applyNodeAttr(
                node,
                attr,
                key
              );
            });
        });
    } catch {}
  }

  function updateDOM(root = null) {
    if (!isBrowser()) {
      return false;
    }

    const scope =
      getScope(root);

    if (!scope) {
      return false;
    }

    try {
      scope
        .querySelectorAll("[data-i18n]")
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n"
            );

          if (!key) {
            return;
          }

          applyNodeText(
            node,
            key
          );
        });

      scope
        .querySelectorAll("[data-i18n-html]")
        .forEach((node) => {
          const key =
            node.getAttribute(
              "data-i18n-html"
            );

          if (!key) {
            return;
          }

          applyNodeHtml(
            node,
            key
          );
        });

      translateAttr(
        scope,
        "[data-i18n-placeholder]",
        "placeholder",
        "data-i18n-placeholder"
      );

      translateAttr(
        scope,
        "[data-i18n-title]",
        "title",
        "data-i18n-title"
      );

      translateAttr(
        scope,
        "[data-i18n-aria-label]",
        "aria-label",
        "data-i18n-aria-label"
      );

      translateAttr(
        scope,
        "[data-i18n-data-tooltip]",
        "data-tooltip",
        "data-i18n-data-tooltip"
      );

      translateAttr(
        scope,
        "[data-i18n-alt]",
        "alt",
        "data-i18n-alt"
      );

      translateAttr(
        scope,
        "[data-i18n-value]",
        "value",
        "data-i18n-value"
      );

      translateAttr(
        scope,
        "[data-i18n-label]",
        "label",
        "data-i18n-label"
      );

      translateAttr(
        scope,
        "[data-i18n-aria-description]",
        "aria-description",
        "data-i18n-aria-description"
      );

      translateAttr(
        scope,
        "[data-i18n-aria-placeholder]",
        "aria-placeholder",
        "data-i18n-aria-placeholder"
      );

      translateDynamicAttrs(scope);

      return true;
    } catch (error) {
      safeWarn(
        "updateDOM() falló.",
        error
      );

      return false;
    }
  }

  /* =========================================================
     LANGUAGE DETECTION
  ========================================================= */

  function getBrowserLang() {
    if (!isBrowser()) {
      return getDefaultLang();
    }

    try {
      const candidates = [
        navigator.language,
        ...safeArray(navigator.languages),
        navigator.userLanguage,
      ]
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean);

      for (const candidate of candidates) {
        const normalized =
          normalizeLang(candidate);

        if (hasLang(normalized)) {
          return normalized;
        }
      }

      return getDefaultLang();
    } catch {
      return getDefaultLang();
    }
  }

  function detectInitialLang() {
    const stateLang =
      safeText(
        getCore()?.state?.lang,
        ""
      );

    if (stateLang) {
      return normalizeLang(stateLang);
    }

    const saved =
      safeStorageGet();

    if (saved) {
      return normalizeLang(saved);
    }

    return getBrowserLang();
  }

  /* =========================================================
     CORE API
  ========================================================= */

  function getLang() {
    return currentLang;
  }

  function setLang(lang = getDefaultLang(), options = {}) {
    const opts =
      safeObject(options);

    const {
      force = false,
      silent = false,
      updateUi = true,
      root = null,
      persist = true,
      source = "i18n.setLang",
    } = opts;

    const previousLang =
      currentLang;

    const nextLang =
      normalizeLang(lang);

    const changed =
      nextLang !== previousLang;

    currentLang =
      nextLang;

    lastChangeAt =
      Date.now();

    if (persist !== false) {
      safeStorageSet(nextLang);
    }

    syncLangToDocument(nextLang);
    syncLangToState(nextLang);

    if (updateUi !== false) {
      updateDOM(root);
    }

    if (
      !silent &&
      (changed || force)
    ) {
      emitLangChange(
        nextLang,
        {
          previousLang,
          changed,
          source,
        }
      );
    }

    safeLog(
      "Idioma activo:",
      {
        lang: currentLang,
        previousLang,
        changed,
      }
    );

    return currentLang;
  }

  function register(lang, data = {}, options = {}) {
    const rawCode =
      safeText(lang, "")
        .toLowerCase()
        .replace(/_/g, "-");

    if (
      !rawCode ||
      !isPlainObject(data)
    ) {
      return false;
    }

    const {
      merge = true,
      refresh = false,
      root = null,
    } = safeObject(options);

    dictionaries[rawCode] =
      merge && isPlainObject(dictionaries[rawCode])
        ? deepMerge(
            dictionaries[rawCode],
            data
          )
        : data;

    if (refresh) {
      updateDOM(root);
    }

    safeLog(
      "Diccionario registrado:",
      rawCode
    );

    return true;
  }

  function unregister(lang = "") {
    const code =
      safeText(lang, "")
        .toLowerCase()
        .replace(/_/g, "-");

    if (
      !code ||
      code === FALLBACK_LANG ||
      !hasLang(code)
    ) {
      return false;
    }

    delete dictionaries[code];

    if (currentLang === code) {
      setLang(FALLBACK_LANG, {
        force: true,
        source: "i18n.unregister",
      });
    }

    return true;
  }

  function boot(options = {}) {
    if (booting) {
      return currentLang;
    }

    const opts =
      safeObject(options);

    const {
      updateUi = true,
      emit = false,
      root = null,
      force = false,
      source = "i18n.boot",
    } = opts;

    if (booted && !force) {
      if (updateUi !== false) {
        updateDOM(root);
      }

      return currentLang;
    }

    booting = true;

    try {
      const previousLang =
        currentLang;

      const initial =
        detectInitialLang();

      currentLang =
        normalizeLang(initial);

      safeStorageSet(currentLang);
      syncLangToDocument(currentLang);
      syncLangToState(currentLang);

      if (updateUi !== false) {
        updateDOM(root);
      }

      booted = true;

      if (emit) {
        emitLangChange(
          currentLang,
          {
            previousLang,
            changed:
              previousLang !== currentLang,
            source,
          }
        );
      }

      safeLog(
        "I18n boot.",
        {
          lang: currentLang,
          available:
            getAvailable(),
        }
      );

      return currentLang;
    } finally {
      booting = false;
    }
  }

  function reload(root = null) {
    return updateDOM(root);
  }

  function reset(options = {}) {
    const opts =
      safeObject(options);

    return setLang(
      getDefaultLang(),
      {
        ...opts,
        force: true,
        source: "i18n.reset",
      }
    );
  }

  function getSnapshot() {
    return {
      lang: currentLang,
      defaultLang:
        getDefaultLang(),
      fallbackLang:
        FALLBACK_LANG,
      available:
        getAvailable(),
      booted,
      booting,
      lastChangeAt,
      hasCore:
        Boolean(getCore()),
      documentLang:
        isBrowser()
          ? document.documentElement.getAttribute("lang")
          : null,
    };
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api = {
    bindCore,

    boot,
    reload,
    reset,

    t,
    translate: t,

    setLang,
    setLocale: setLang,
    changeLanguage: setLang,

    getLang,
    getLocale: getLang,

    exists,

    register,
    unregister,

    getAvailable,
    getDictionary,

    updateDOM,

    normalizeLang,
    hasLang,

    getSnapshot,
  };

  /* =========================================================
     AUTO BOOT
  ========================================================= */

  if (isBrowser()) {
    boot({
      updateUi: true,
      emit: false,
      source: "i18n.autoBoot",
    });
  }

  return Object.freeze(api);
})();

export default I18n;

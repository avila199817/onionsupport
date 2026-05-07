/* =========================================================
   Onion SPA - i18n Core
   Archivo: src/i18n/index.js

   ONION SUPPORT · I18N CORE
   DICTIONARY REGISTRY · LIVE LANGUAGE · DOM REFRESH SAFE

   Responsabilidades:
   - Registro de idiomas.
   - Traducción por key path.
   - Fallback robusto a español.
   - Cambio live de idioma.
   - Persistencia local.
   - Sincronización opcional con AppCore.
   - Evento global app:lang:change.
   - Helpers para refresco de UI.
   - Soporte extendido para atributos.
   - Evitar dependencia circular con Core.
   - Interpolación segura.
   - Plural básico.
   - Refresh parcial por scope.

   HARDENING EXTREMO:
   - Sin dependencia directa de AppCore.
   - Boot idempotente.
   - Storage tolerante a JSON/raw/legacy.
   - Fallback multilenguaje estable.
   - DOM refresh seguro por scope.
   - Soporte data-i18n-params.
   - Soporte data-i18n-fallback.
   - Soporte data-i18n-count.
   - Soporte data-i18n-attr / data-i18n-attrs.
   - No rompe si faltan diccionarios parciales.
   - Eventos consistentes por Core/document/window.
   - Aliases públicos estables.
========================================================= */

import es from "./locales/es/index.js";
import en from "./locales/en/index.js";
import ca from "./locales/ca/index.js";

/* =========================================================
   SINGLETON
========================================================= */

export const I18n = (() => {
  "use strict";

  /* =======================================================
     CONSTANTS
  ======================================================= */

  const I18N_VERSION =
    "12.0.0";

  const STORAGE_KEY =
    "lang";

  const FALLBACK_LANG =
    "es";

  const EVENT_LANG_CHANGE =
    "app:lang:change";

  const DEFAULT_STORAGE_PREFIX =
    "onion";

  const DEFAULT_SOURCE =
    "i18n";

  const ATTR_MAP =
    Object.freeze([
      [
        "[data-i18n-placeholder]",
        "placeholder",
        "data-i18n-placeholder",
      ],
      [
        "[data-i18n-title]",
        "title",
        "data-i18n-title",
      ],
      [
        "[data-i18n-aria-label]",
        "aria-label",
        "data-i18n-aria-label",
      ],
      [
        "[data-i18n-data-tooltip]",
        "data-tooltip",
        "data-i18n-data-tooltip",
      ],
      [
        "[data-i18n-tooltip]",
        "data-tooltip",
        "data-i18n-tooltip",
      ],
      [
        "[data-i18n-alt]",
        "alt",
        "data-i18n-alt",
      ],
      [
        "[data-i18n-value]",
        "value",
        "data-i18n-value",
      ],
      [
        "[data-i18n-label]",
        "label",
        "data-i18n-label",
      ],
      [
        "[data-i18n-aria-description]",
        "aria-description",
        "data-i18n-aria-description",
      ],
      [
        "[data-i18n-aria-placeholder]",
        "aria-placeholder",
        "data-i18n-aria-placeholder",
      ],
    ]);

  /* =======================================================
     RUNTIME
  ======================================================= */

  const dictionaries = {
    es:
      es || {},

    en:
      en || {},

    ca:
      ca || {},
  };

  let coreRef =
    null;

  let currentLang =
    FALLBACK_LANG;

  let booted =
    false;

  let booting =
    false;

  let lastChangeAt =
    0;

  let lastDomUpdateAt =
    0;

  let lastDomUpdateCount =
    0;

  let lastEventPayload =
    null;

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function isFn(value) {
    return typeof value === "function";
  }

  function isPlainObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function safeObject(value, fallback = {}) {
    return isPlainObject(value)
      ? value
      : fallback;
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

  function safeNumber(value, fallback = 0) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function isoNow(ms = nowMs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
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

  function getCore() {
    return coreRef;
  }

  function safeLog(...args) {
    try {
      const core =
        getCore();

      if (core?.config?.debug) {
        core?.utils?.log?.(
          "[I18n]",
          ...args
        );
      }
    } catch {}
  }

  function safeWarn(...args) {
    let logged =
      false;

    try {
      const core =
        getCore();

      if (isFn(core?.utils?.warn)) {
        core.utils.warn(
          "[I18n]",
          ...args
        );

        logged =
          true;
      }
    } catch {
      logged =
        false;
    }

    if (logged) {
      return;
    }

    try {
      if (getCore()?.config?.debug) {
        console.warn(
          "[I18n]",
          ...args
        );
      }
    } catch {}
  }

  /* =======================================================
     LANG HELPERS
  ======================================================= */

  function hasLang(lang = "") {
    const code =
      safeText(lang, "")
        .toLowerCase();

    return Boolean(
      code &&
        Object.prototype.hasOwnProperty.call(
          dictionaries,
          code
        )
    );
  }

  function getConfiguredDefaultLang() {
    const configured =
      safeText(
        getCore()?.config?.defaultLang ||
          getCore()?.config?.lang ||
          "",
        ""
      )
        .toLowerCase()
        .replace(/_/g, "-");

    if (configured && hasLang(configured)) {
      return configured;
    }

    const short =
      configured.split("-")[0];

    if (short && hasLang(short)) {
      return short;
    }

    return FALLBACK_LANG;
  }

  function getDefaultLang() {
    return getConfiguredDefaultLang();
  }

  function normalizeLang(lang = "") {
    const raw =
      safeText(lang, "")
        .toLowerCase()
        .replace(/_/g, "-");

    const defaultLang =
      getDefaultLang();

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

  /* =======================================================
     OBJECT HELPERS
  ======================================================= */

  function getNested(obj, path = "") {
    if (!obj || !path) {
      return undefined;
    }

    const keys =
      String(path)
        .split(".")
        .map((item) => item.trim())
        .filter(Boolean);

    let cursor =
      obj;

    for (const key of keys) {
      if (
        cursor &&
        Object.prototype.hasOwnProperty.call(
          cursor,
          key
        )
      ) {
        cursor =
          cursor[key];

        continue;
      }

      return undefined;
    }

    return cursor;
  }

  function deepMerge(target = {}, source = {}) {
    const output = {
      ...safeObject(target),
    };

    const input =
      safeObject(source);

    for (const [key, next] of Object.entries(input)) {
      const current =
        output[key];

      if (
        isPlainObject(current) &&
        isPlainObject(next)
      ) {
        output[key] =
          deepMerge(
            current,
            next
          );

        continue;
      }

      output[key] =
        next;
    }

    return output;
  }

  /* =======================================================
     TRANSLATION ARGS
  ======================================================= */

  function normalizeTranslationArgs(params = {}, fallback = "") {
    if (
      params === null ||
      params === undefined
    ) {
      return {
        params:
          {},

        fallback:
          safeText(fallback, ""),
      };
    }

    if (isPlainObject(params)) {
      return {
        params,

        fallback:
          safeText(fallback, ""),
      };
    }

    /*
      Compatibilidad:
      t("key", "Fallback")
    */
    return {
      params:
        {},

      fallback:
        safeText(params, fallback),
    };
  }

  /* =======================================================
     INTERPOLATION / PLURAL
  ======================================================= */

  function interpolate(text = "", params = {}) {
    const data =
      safeObject(params);

    return String(text).replace(
      /\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}|\{\s*([a-zA-Z0-9_.$-]+)\s*\}/g,
      (match, keyA, keyB) => {
        const key =
          keyA || keyB;

        const direct =
          data[key];

        const nested =
          getNested(
            data,
            key
          );

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

    if (Number.isFinite(count)) {
      const exactKey =
        `=${count}`;

      if (value[exactKey] !== undefined) {
        return value[exactKey];
      }

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

      if (
        count > 1 &&
        value.many !== undefined
      ) {
        return value.many;
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
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return fallback;
    }

    const activeLang =
      normalizeLang(currentLang);

    const defaultLang =
      getDefaultLang();

    const active =
      getNested(
        dictionaries[activeLang],
        cleanKey
      );

    const base =
      getNested(
        dictionaries[defaultLang],
        cleanKey
      );

    const fallbackBase =
      getNested(
        dictionaries[FALLBACK_LANG],
        cleanKey
      );

    const resolved =
      active ??
      base ??
      fallbackBase ??
      fallback ??
      cleanKey;

    return resolvePlural(
      resolved,
      params
    );
  }

  function t(key = "", params = {}, fallback = "") {
    const cleanKey =
      safeText(key, "");

    const normalizedArgs =
      normalizeTranslationArgs(
        params,
        fallback
      );

    if (!cleanKey) {
      return safeText(
        normalizedArgs.fallback,
        ""
      );
    }

    const resolved =
      resolveValue(
        cleanKey,
        normalizedArgs.params,
        normalizedArgs.fallback
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
        normalizedArgs.params
      );
    }

    return interpolate(
      safeText(
        normalizedArgs.fallback,
        cleanKey
      ),
      normalizedArgs.params
    );
  }

  function exists(key = "", lang = currentLang) {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return false;
    }

    const code =
      normalizeLang(lang);

    const defaultLang =
      getDefaultLang();

    return (
      getNested(
        dictionaries[code],
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

  /* =======================================================
     STORAGE
  ======================================================= */

  function getStoragePrefix() {
    return safeText(
      getCore()?.config?.storagePrefix ||
        getCore()?.config?.appKey,
      DEFAULT_STORAGE_PREFIX
    );
  }

  function getStorageCandidates() {
    const prefix =
      getStoragePrefix();

    return Array.from(
      new Set([
        STORAGE_KEY,
        `${prefix}:${STORAGE_KEY}`,
        `${prefix}_${STORAGE_KEY}`,
        `${prefix}.${STORAGE_KEY}`,
        "onion:lang",
        "onion_lang",
        "onion.lang",
        "lang",
      ])
    );
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
        safeJsonParse(
          raw,
          undefined
        );

      if (typeof parsed === "string") {
        return safeText(parsed, "");
      }

      if (isPlainObject(parsed)) {
        return safeText(
          parsed.lang ||
            parsed.locale ||
            parsed.value,
          ""
        );
      }

      return raw;
    }

    if (isPlainObject(value)) {
      return safeText(
        value.lang ||
          value.locale ||
          value.value,
        ""
      );
    }

    return safeText(value, "");
  }

  function safeStorageGet() {
    const core =
      getCore();

    const candidates =
      getStorageCandidates();

    try {
      if (isFn(core?.storage?.getRaw)) {
        for (const key of candidates) {
          const value =
            normalizeStoredLang(
              core.storage.getRaw(
                key,
                ""
              )
            );

          if (value) {
            return value;
          }
        }
      }
    } catch {}

    try {
      if (isFn(core?.storage?.get)) {
        for (const key of candidates) {
          const value =
            normalizeStoredLang(
              core.storage.get(
                key,
                ""
              )
            );

          if (value) {
            return value;
          }
        }
      }
    } catch {}

    if (!isBrowser()) {
      return "";
    }

    try {
      for (const key of candidates) {
        const value =
          normalizeStoredLang(
            window.localStorage?.getItem?.(
              key
            )
          );

        if (value) {
          return value;
        }
      }
    } catch {}

    return "";
  }

  function safeStorageSet(lang) {
    const normalized =
      normalizeLang(lang);

    const core =
      getCore();

    try {
      if (isFn(core?.storage?.setRaw)) {
        core.storage.setRaw(
          STORAGE_KEY,
          normalized
        );
      } else if (isFn(core?.storage?.set)) {
        core.storage.set(
          STORAGE_KEY,
          normalized
        );
      }
    } catch {}

    if (!isBrowser()) {
      return true;
    }

    try {
      window.localStorage?.setItem?.(
        `${getStoragePrefix()}:${STORAGE_KEY}`,
        normalized
      );
    } catch {}

    return true;
  }

  /* =======================================================
     SYNC
  ======================================================= */

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

    const core =
      getCore();

    try {
      if (isFn(core?.setState)) {
        core.setState(
          {
            lang:
              normalized,
          },
          {
            source:
              "i18n:sync-lang",
          }
        );

        return true;
      }
    } catch {}

    try {
      if (
        core?.state &&
        typeof core.state === "object"
      ) {
        core.state.lang =
          normalized;

        return true;
      }
    } catch {}

    return false;
  }

  function emitDomEvent(name, payload) {
    if (!isBrowser()) {
      return false;
    }

    let emitted =
      false;

    try {
      document.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              payload,
          }
        )
      );

      emitted =
        true;
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              payload,
          }
        )
      );

      emitted =
        true;
    } catch {}

    return emitted;
  }

  function emitLangChange(lang, extra = {}) {
    const normalized =
      normalizeLang(lang);

    const payload = {
      lang:
        normalized,

      locale:
        normalized,

      previousLang:
        extra.previousLang || null,

      previousLocale:
        extra.previousLang || null,

      changed:
        Boolean(extra.changed),

      available:
        getAvailable(),

      dictionary:
        getDictionary(normalized),

      source:
        extra.source || DEFAULT_SOURCE,

      at:
        isoNow(),
    };

    let emittedByCore =
      false;

    try {
      const core =
        getCore();

      if (isFn(core?.events?.emit)) {
        core.events.emit(
          EVENT_LANG_CHANGE,
          payload
        );

        emittedByCore =
          true;
      }
    } catch {}

    emitDomEvent(
      EVENT_LANG_CHANGE,
      payload
    );

    lastEventPayload = {
      ...payload,
      emittedByCore,
    };

    return payload;
  }

  /* =======================================================
     DOM SCOPE
  ======================================================= */

  function isNodeLike(value) {
    if (!value) {
      return false;
    }

    try {
      return Boolean(
        typeof Node !== "undefined" &&
          value instanceof Node
      );
    } catch {}

    try {
      return Boolean(
        value.nodeType &&
          value.nodeName
      );
    } catch {}

    return false;
  }

  function getScope(root = null) {
    if (!isBrowser()) {
      return null;
    }

    if (!root) {
      return document;
    }

    if (root === window) {
      return document;
    }

    if (root === document) {
      return document;
    }

    if (isNodeLike(root)) {
      return root;
    }

    if (typeof root === "string") {
      try {
        return document.querySelector(root) || document;
      } catch {
        return document;
      }
    }

    return document;
  }

  function queryAll(scope, selector = "") {
    if (!scope || !selector) {
      return [];
    }

    try {
      return Array.from(
        scope.querySelectorAll?.(selector) || []
      );
    } catch {
      return [];
    }
  }

  /* =======================================================
     DOM PARAMS
  ======================================================= */

  function readNodeParams(node) {
    if (!node) {
      return {};
    }

    const raw =
      node.getAttribute?.(
        "data-i18n-params"
      );

    const parsed =
      safeJsonParse(
        raw,
        {}
      );

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
    const params = {
      ...readNodeParams(node),
    };

    const count =
      readNodeCount(node);

    if (count !== undefined) {
      params.count =
        count;
    }

    return params;
  }

  /* =======================================================
     DOM APPLY
  ======================================================= */

  function applyNodeText(node, key) {
    if (!node || !key) {
      return false;
    }

    const params =
      buildNodeParams(node);

    const fallback =
      readNodeFallback(node);

    try {
      node.textContent =
        t(
          key,
          params,
          fallback
        );

      return true;
    } catch {
      return false;
    }
  }

  function applyNodeHtml(node, key) {
    if (!node || !key) {
      return false;
    }

    const params =
      buildNodeParams(node);

    const fallback =
      readNodeFallback(node);

    /*
      Uso previsto para HTML controlado del diccionario.
      No usar con contenido generado por usuarios.
    */
    try {
      node.innerHTML =
        t(
          key,
          params,
          fallback
        );

      return true;
    } catch {
      return false;
    }
  }

  function applyNodeAttr(node, attr, key) {
    const cleanAttr =
      safeText(attr, "");

    const cleanKey =
      safeText(key, "");

    if (
      !node ||
      !cleanAttr ||
      !cleanKey
    ) {
      return false;
    }

    const params =
      buildNodeParams(node);

    const fallback =
      readNodeFallback(node);

    const value =
      t(
        cleanKey,
        params,
        fallback
      );

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

  function translateStaticAttr(scope, selector, targetAttr, dataAttr) {
    let count =
      0;

    for (const node of queryAll(scope, selector)) {
      const key =
        node.getAttribute?.(
          dataAttr
        );

      if (
        applyNodeAttr(
          node,
          targetAttr,
          key
        )
      ) {
        count += 1;
      }
    }

    return count;
  }

  function parseAttrEntries(raw = "") {
    return safeText(raw, "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex =
          entry.indexOf(":");

        if (separatorIndex <= 0) {
          return null;
        }

        const attr =
          entry.slice(0, separatorIndex).trim();

        const key =
          entry.slice(separatorIndex + 1).trim();

        if (!attr || !key) {
          return null;
        }

        return {
          attr,
          key,
        };
      })
      .filter(Boolean);
  }

  function translateDynamicAttrs(scope) {
    let count =
      0;

    const nodes = [
      ...queryAll(scope, "[data-i18n-attr]"),
      ...queryAll(scope, "[data-i18n-attrs]"),
    ];

    for (const node of nodes) {
      const raw =
        safeText(
          node.getAttribute?.("data-i18n-attr") ||
            node.getAttribute?.("data-i18n-attrs"),
          ""
        );

      if (!raw) {
        continue;
      }

      for (const entry of parseAttrEntries(raw)) {
        if (
          applyNodeAttr(
            node,
            entry.attr,
            entry.key
          )
        ) {
          count += 1;
        }
      }
    }

    return count;
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

    let count =
      0;

    try {
      for (const node of queryAll(scope, "[data-i18n]")) {
        const key =
          node.getAttribute?.(
            "data-i18n"
          );

        if (
          applyNodeText(
            node,
            key
          )
        ) {
          count += 1;
        }
      }

      for (const node of queryAll(scope, "[data-i18n-html]")) {
        const key =
          node.getAttribute?.(
            "data-i18n-html"
          );

        if (
          applyNodeHtml(
            node,
            key
          )
        ) {
          count += 1;
        }
      }

      for (const [selector, targetAttr, dataAttr] of ATTR_MAP) {
        count += translateStaticAttr(
          scope,
          selector,
          targetAttr,
          dataAttr
        );
      }

      count += translateDynamicAttrs(scope);

      lastDomUpdateAt =
        nowMs();

      lastDomUpdateCount =
        count;

      return true;
    } catch (error) {
      safeWarn(
        "updateDOM() falló.",
        error
      );

      return false;
    }
  }

  /* =======================================================
     DETECTION
  ======================================================= */

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
    } catch {}

    return getDefaultLang();
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

  /* =======================================================
     APPLY LANGUAGE
  ======================================================= */

  function applyLang(lang = getDefaultLang(), options = {}) {
    const opts =
      safeObject(options);

    const previousLang =
      currentLang;

    const nextLang =
      normalizeLang(lang);

    const changed =
      nextLang !== previousLang;

    currentLang =
      nextLang;

    lastChangeAt =
      nowMs();

    if (opts.persist !== false) {
      safeStorageSet(nextLang);
    }

    syncLangToDocument(nextLang);
    syncLangToState(nextLang);

    if (opts.updateUi !== false) {
      updateDOM(opts.root || null);
    }

    if (
      opts.silent !== true &&
      (
        changed ||
        opts.force === true
      )
    ) {
      emitLangChange(
        nextLang,
        {
          previousLang,
          changed,
          source:
            opts.source || DEFAULT_SOURCE,
        }
      );
    }

    safeLog(
      "Idioma activo:",
      {
        lang:
          currentLang,

        previousLang,

        changed,
      }
    );

    return currentLang;
  }

  /* =======================================================
     CORE API
  ======================================================= */

  function bindCore(AppCore) {
    coreRef =
      AppCore || null;

    try {
      applyLang(
        currentLang ||
          getCore()?.state?.lang ||
          getDefaultLang(),
        {
          silent:
            true,

          updateUi:
            false,

          persist:
            false,

          source:
            "i18n.bindCore",
        }
      );
    } catch {}

    return api;
  }

  function boot(options = {}) {
    if (booting) {
      return currentLang;
    }

    const opts =
      safeObject(options);

    if (
      booted &&
      opts.force !== true
    ) {
      if (opts.updateUi !== false) {
        updateDOM(opts.root || null);
      }

      return currentLang;
    }

    booting =
      true;

    try {
      const initialLang =
        detectInitialLang();

      applyLang(
        initialLang,
        {
          silent:
            opts.emit !== true,

          updateUi:
            opts.updateUi !== false,

          root:
            opts.root || null,

          persist:
            opts.persist !== false,

          force:
            opts.force === true,

          source:
            opts.source || "i18n.boot",
        }
      );

      booted =
        true;

      safeLog(
        "I18n boot.",
        {
          lang:
            currentLang,

          available:
            getAvailable(),
        }
      );

      return currentLang;
    } finally {
      booting =
        false;
    }
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang = getDefaultLang(), options = {}) {
    return applyLang(
      lang,
      {
        ...safeObject(options),

        source:
          options?.source ||
          "i18n.setLang",
      }
    );
  }

  function reload(root = null) {
    return updateDOM(root);
  }

  function reset(options = {}) {
    return setLang(
      getDefaultLang(),
      {
        ...safeObject(options),

        force:
          true,

        source:
          "i18n.reset",
      }
    );
  }

  function register(lang, data = {}, options = {}) {
    const code =
      safeText(lang, "")
        .toLowerCase()
        .replace(/_/g, "-");

    if (
      !code ||
      !isPlainObject(data)
    ) {
      return false;
    }

    const opts =
      safeObject(options);

    dictionaries[code] =
      opts.merge !== false &&
      isPlainObject(dictionaries[code])
        ? deepMerge(
            dictionaries[code],
            data
          )
        : data;

    if (
      opts.refresh === true ||
      (
        opts.refreshCurrent === true &&
        normalizeLang(code) === currentLang
      )
    ) {
      updateDOM(opts.root || null);
    }

    safeLog(
      "Diccionario registrado:",
      code
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
      setLang(
        FALLBACK_LANG,
        {
          force:
            true,

          source:
            "i18n.unregister",
        }
      );
    }

    return true;
  }

  function getSnapshot() {
    return {
      version:
        I18N_VERSION,

      lang:
        currentLang,

      locale:
        currentLang,

      defaultLang:
        getDefaultLang(),

      fallbackLang:
        FALLBACK_LANG,

      available:
        getAvailable(),

      booted,

      booting,

      lastChangeAt,

      lastChangeAtIso:
        lastChangeAt
          ? isoNow(lastChangeAt)
          : "",

      lastDomUpdateAt,

      lastDomUpdateAtIso:
        lastDomUpdateAt
          ? isoNow(lastDomUpdateAt)
          : "",

      lastDomUpdateCount,

      hasCore:
        Boolean(getCore()),

      documentLang:
        isBrowser()
          ? document.documentElement.getAttribute("lang")
          : null,

      lastEvent:
        lastEventPayload
          ? {
              lang:
                lastEventPayload.lang,

              previousLang:
                lastEventPayload.previousLang,

              changed:
                lastEventPayload.changed,

              source:
                lastEventPayload.source,

              at:
                lastEventPayload.at,

              emittedByCore:
                Boolean(lastEventPayload.emittedByCore),
            }
          : null,
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    I18N_VERSION,
    version:
      I18N_VERSION,

    bindCore,

    boot,
    reload,
    refresh:
      reload,
    reset,

    t,
    translate:
      t,

    setLang,
    setLocale:
      setLang,
    changeLanguage:
      setLang,

    getLang,
    getLocale:
      getLang,
    language:
      getLang,

    exists,

    register,
    unregister,

    getAvailable,
    getLanguages:
      getAvailable,

    getDictionary,

    updateDOM,

    normalizeLang,
    hasLang,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,
  };

  /* =======================================================
     AUTO BOOT
  ======================================================= */

  try {
    if (isBrowser()) {
      if (document.readyState === "loading") {
        /*
          Fijamos lang cuanto antes y refrescamos DOM cuando exista.
        */
        currentLang =
          normalizeLang(
            safeStorageGet() ||
              getBrowserLang()
          );

        syncLangToDocument(currentLang);

        document.addEventListener(
          "DOMContentLoaded",
          () => {
            boot({
              updateUi:
                true,

              emit:
                false,

              source:
                "i18n.autoBoot",
            });
          },
          {
            once:
              true,
          }
        );
      } else {
        boot({
          updateUi:
            true,

          emit:
            false,

          source:
            "i18n.autoBoot",
        });
      }
    }
  } catch {}

  try {
    return Object.freeze(api);
  } catch {
    return api;
  }
})();

export default I18n;

/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

   ONION SUPPORT · CORE SINGLETON
   GLOBAL CONFIG · STATE · EVENTS · STORAGE · REQUEST · HTTP · MODULES · 15/10

   QUÉ CENTRALIZA:
   - configuración global
   - estado global robusto
   - helpers enterprise
   - cache DOM
   - storage namespaced
   - event bus
   - cleanup scopes
   - módulos
   - hooks
   - request/api client
   - core http bridge
   - init idempotente real
   - wrappers seguros de session/ui
   - bridge global Toast
   - snapshots de diagnóstico

   HARDENING EXTREMO:
   - cero undefined setters
   - estado siempre vivo
   - boot serializado
   - compat total con router/auth/app bootstrap
   - sync auth derivada robusta
   - auth alineada con state.computeAuthenticated()
   - fallback si factories parciales fallan
   - no ReferenceError server-side
   - API estable con bridges Router/Auth/Store/Http vía accessors
   - snapshots públicos sin token crudo
   - no duplicar eventos base de state/session
   - applySession compatible con payloads heterogéneos
   - clearSession bloquea auth fantasma
   - createStorage recibe { utils, events }
   - applySessionBase recibe storage real
   - adaptadores setUser/setToken no envuelven mal payloads
   - HTTP único conectado a src/core/http.js
   - HTTP bridge idempotente
   - aliases internos sin app:module:duplicate storm
========================================================= */

import { config } from "./config.js";

import {
  isDocumentReady,
  safeClone,
  cloneError,
  joinUrl,
  buildUrl,
  normalizePath,
  normalizeCanonicalPath,
  stripUsernamePrefix,
  sanitizeUsername,
  slugify,
  normalizeUser,
  getUserUsername,
  getUserDisplayName,
  getUserAvatarUrl,
  hasValidToken,
  getInitials,
  isPublicApiPath,
} from "./helpers.js";

import {
  createInitialState,
  cloneState,
  setState as setStateBase,
  getState as getStateBase,
  computeAuthenticated,
} from "./state.js";

import {
  createDomCache,
  cacheDom,
  validateRequiredDom,
} from "./dom.js";

import { createStorage } from "./storage.js";
import { createEvents } from "./events.js";
import { createCleanup } from "./cleanup.js";
import { createModules } from "./modules.js";
import { createHooks } from "./hooks.js";

import {
  setRoute as setRouteBase,
  setPublicPath as setPublicPathBase,
  setUser as setUserBase,
  setToken as setTokenBase,
  applySession as applySessionBase,
  clearSession as clearSessionBase,
  loadPreferences,
  loadSession,
  setTheme as setThemeBase,
  setLang as setLangBase,
  setSidebarOpen as setSidebarOpenBase,
  setLoading as setLoadingBase,
  setError as setErrorBase,
  syncBaseUI,
} from "./session.js";

import {
  setDocumentTitle as setDocumentTitleBase,
  clearDynamicContainers as clearDynamicContainersBase,
  syncUserUI as syncUserUIBase,
} from "./ui.js";

import {
  createRequest,
  createApiClient,
} from "./request.js";

import * as CoreHttpModule from "./http.js";

import {
  bindNetworkEvents,
} from "./network.js";

/* =========================================================
   SINGLETON
========================================================= */

export const AppCore = (() => {
  "use strict";

  /* =======================================================
     CONSTANTS
  ======================================================= */

  const CORE_VERSION = "15.1.0";
  const CORE_SOURCE = "core";

  const DEFAULT_APP_NAME = "Onion Support";
  const DEFAULT_STORAGE_PREFIX = "onion";
  const DEFAULT_LANG = "es";
  const DEFAULT_THEME = "dark";

  const EVENTS = Object.freeze({
    coreInitStart: "app:core:init:start",
    coreReady: "app:core:ready",
    coreInitError: "app:core:init:error",
    coreReboot: "app:core:reboot",

    stateChange: "app:state:change",
    authChange: "app:auth:change",
    userChange: "app:user:change",
    routeChange: "app:route:change",
    publicPathChange: "app:public-path:change",

    sessionApplied: "app:session:applied",
    sessionCleared: "app:session:cleared",

    moduleRegistered: "app:module:registered",
    moduleReplaced: "app:module:replaced",

    toastBridgeReady: "app:toast:bridge-ready",
    httpReady: "app:http:ready",
  });

  const SENSITIVE_STATE_KEYS = Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "idToken",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "mfaToken",
    "mfa_token",
    "twoFactorToken",
    "two_factor_token",
    "password",
    "otp",
    "code",
    "authorization",
    "jwt",
    "bearer",
  ]);

  const SENSITIVE_PARAM_NAMES = Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]);

  const TOKEN_STATE_KEYS = Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "jwt",
    "bearer",
    "idToken",
    "id_token",
  ]);

  const USER_STATE_KEYS = Object.freeze([
    "user",
    "currentUser",
    "sessionUser",
    "authUser",
    "account",
    "profile",
    "usuario",
    "me",
  ]);

  const USER_ID_KEYS = Object.freeze([
    "id",
    "userId",
    "user_id",
    "_id",
    "uid",
    "sub",
    "username",
    "userName",
    "user_name",
    "email",
    "mail",
    "phone",
    "telefono",
    "mobile",
  ]);

  const BRIDGE_MODULE_ALIASES = Object.freeze({
    Router: Object.freeze(["Router", "router"]),
    router: Object.freeze(["router", "Router"]),

    Auth: Object.freeze(["Auth", "auth"]),
    auth: Object.freeze(["auth", "Auth"]),

    Store: Object.freeze(["Store", "store"]),
    store: Object.freeze(["store", "Store"]),

    Http: Object.freeze(["Http", "http"]),
    http: Object.freeze(["http", "Http"]),

    ApiClient: Object.freeze(["ApiClient", "apiClient"]),
    apiClient: Object.freeze(["apiClient", "ApiClient"]),
  });

  /* =======================================================
     RUNTIME FLAGS
  ======================================================= */

  let initPromise = null;
  let initialized = false;
  let initCycle = 0;
  let networkEventsBound = false;
  let showToastBridge = null;
  let readyCallbacksFlushed = false;

  let httpBridge = null;
  let requestBridge = null;
  let apiClientBridge = null;

  let httpBridgeInstalled = false;
  let httpReadyEmitted = false;

  /* =======================================================
     BASIC SAFE HELPERS
  ======================================================= */

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

  function isAnyObject(value) {
    return (
      value !== null &&
      typeof value === "object"
    );
  }

  function ensureObject(value) {
    return isObject(value) ? value : {};
  }

  function isObjectLike(value) {
    return (
      value !== null &&
      (
        typeof value === "object" ||
        typeof value === "function"
      )
    );
  }

  function canExtend(value) {
    try {
      return (
        isObjectLike(value) &&
        Object.isExtensible(value)
      );
    } catch {
      return false;
    }
  }

  function defineHiddenValue(target, key, value) {
    if (
      !target ||
      !key ||
      !canExtend(target)
    ) {
      return false;
    }

    try {
      Object.defineProperty(
        target,
        key,
        {
          value,
          configurable: true,
          enumerable: false,
          writable: true,
        }
      );

      return true;
    } catch {}

    try {
      target[key] = value;
      return true;
    } catch {}

    return false;
  }

  function isFunction(value) {
    return typeof value === "function";
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

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
  }

  function safeBool(value, fallback = false) {
    if (value === true) return true;
    if (value === false) return false;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const clean = value.trim().toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
          "ok",
          "on",
          "enabled",
          "active",
        ].includes(clean)
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "off",
          "disabled",
          "inactive",
        ].includes(clean)
      ) {
        return false;
      }
    }

    return Boolean(fallback);
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeNow() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function safeIsoDate(ms = safeNow()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function safeOwn(object, key) {
    try {
      return Object.prototype.hasOwnProperty.call(object, key);
    } catch {
      return false;
    }
  }

  function safeFactory(factory, fallback, ...args) {
    try {
      if (isFunction(factory)) {
        const value = factory(...args);

        if (value) {
          return value;
        }
      }
    } catch {}

    return isFunction(fallback)
      ? fallback()
      : fallback;
  }

  function getDebugEnabled() {
    try {
      return Boolean(
        config?.debug ||
          config?.dev ||
          config?.environment === "development" ||
          config?.env === "development"
      );
    } catch {
      return false;
    }
  }

  function getAppName() {
    return (
      safeText(config?.appName, "") ||
      safeText(config?.name, "") ||
      DEFAULT_APP_NAME
    );
  }

  function safeConsole(method = "log", ...args) {
    try {
      const fn = console?.[method] || console?.log;

      fn?.(`[${getAppName()}]`, ...args);
    } catch {}
  }

  function safeLog(...args) {
    if (!getDebugEnabled()) {
      return;
    }

    safeConsole("log", ...args);
  }

  function safeWarn(...args) {
    if (!getDebugEnabled()) {
      return;
    }

    safeConsole("warn", ...args);
  }

  function safeError(...args) {
    safeConsole("error", ...args);
  }

  function first(...values) {
    for (const value of values) {
      if (
        value === undefined ||
        value === null
      ) {
        continue;
      }

      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        continue;
      }

      if (
        Array.isArray(value) &&
        value.length === 0
      ) {
        continue;
      }

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        continue;
      }

      return value;
    }

    return null;
  }

  /* =======================================================
     TOKEN / ERROR SANITIZE
  ======================================================= */

  function escapeRegExp(value = "") {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }

  function redactTokenInText(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "";
    }

    let output = raw;

    try {
      for (const name of SENSITIVE_PARAM_NAMES) {
        const escaped = escapeRegExp(name);

        output = output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      }

      output = output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );

      output = output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
    } catch {}

    return output;
  }

  function sanitizeErrorForSnapshot(error = null) {
    if (!error) {
      return null;
    }

    const candidate =
      error?.reason ||
      error?.error ||
      error;

    return {
      name: safeText(candidate?.name, "Error"),

      message: redactTokenInText(
        safeText(
          candidate?.message ||
            candidate?.reason ||
            candidate,
          "Error"
        )
      ),

      code: safeText(
        candidate?.code ||
          candidate?.statusCode ||
          "",
        ""
      ),

      status: safeNumber(candidate?.status, 0),
      timeout: Boolean(candidate?.timeout),
      aborted: Boolean(candidate?.aborted),
      at: safeIsoDate(),
    };
  }

  function sanitizeStateForSnapshot(inputState = {}) {
    const source =
      isAnyObject(inputState)
        ? inputState
        : {};

    let clean = {};

    try {
      clean = safeClone(source, {}) || {};
    } catch {
      clean = { ...source };
    }

    for (const key of SENSITIVE_STATE_KEYS) {
      if (key in clean) {
        clean[key] =
          clean[key]
            ? "***"
            : null;
      }
    }

    for (const key of [
      "bootInitialUrl",
      "bootProtectedInitialUrl",
      "bootActivationInitialUrl",
      "bootResetConfirmInitialUrl",
      "publicPath",
      "route",
      "lastRoute",
      "lastPublicPath",
      "lastRequestUrl",
    ]) {
      if (clean[key]) {
        clean[key] = redactTokenInText(clean[key]);
      }
    }

    if (clean.error) {
      clean.error = sanitizeErrorForSnapshot(clean.error);
    }

    if (clean.lastError) {
      clean.lastError = sanitizeErrorForSnapshot(clean.lastError);
    }

    return clean;
  }

  function getSnapshotFrom(ref, options = {}) {
    if (!ref) {
      return null;
    }

    try {
      if (isFunction(ref.getSnapshot)) {
        return ref.getSnapshot(options);
      }
    } catch {}

    try {
      if (isFunction(ref.getDebugSnapshot)) {
        return ref.getDebugSnapshot(options);
      }
    } catch {}

    try {
      if (isFunction(ref.snapshot)) {
        return ref.snapshot(options);
      }
    } catch {}

    return null;
  }

  /* =======================================================
     FALLBACK EVENTS
  ======================================================= */

  function createFallbackEvents() {
    const listeners = new Map();

    function getSet(name) {
      const key = safeText(name, "");

      if (!key) {
        return null;
      }

      if (!listeners.has(key)) {
        listeners.set(key, new Set());
      }

      return listeners.get(key);
    }

    function on(name, handler) {
      const key = safeText(name, "");

      if (
        !key ||
        !isFunction(handler)
      ) {
        return () => {};
      }

      const set = getSet(key);

      if (!set) {
        return () => {};
      }

      set.add(handler);

      return () => off(key, handler);
    }

    function once(name, handler) {
      if (
        !name ||
        !isFunction(handler)
      ) {
        return () => {};
      }

      let disposed = false;

      const dispose = on(
        name,
        (...args) => {
          if (disposed) {
            return;
          }

          disposed = true;
          dispose();

          try {
            handler(...args);
          } catch (error) {
            safeWarn("Fallback once handler error:", name, error);
          }
        }
      );

      return dispose;
    }

    function off(name, handler) {
      const key = safeText(name, "");

      if (!key) {
        return false;
      }

      try {
        if (!handler) {
          listeners.delete(key);
          return true;
        }

        listeners.get(key)?.delete(handler);

        return true;
      } catch {
        return false;
      }
    }

    function emit(name, payload = {}) {
      const key = safeText(name, "");

      if (!key) {
        return false;
      }

      const handlers = Array.from(listeners.get(key) || []);
      const wildcardHandlers = Array.from(listeners.get("*") || []);

      if (
        !handlers.length &&
        !wildcardHandlers.length
      ) {
        return false;
      }

      const eventLike = {
        type: key,
        detail: payload,
        payload,
      };

      for (const handler of handlers) {
        try {
          handler(eventLike);
        } catch (error) {
          safeWarn("Fallback event handler error:", key, error);
        }
      }

      for (const handler of wildcardHandlers) {
        try {
          handler(key, payload);
        } catch (error) {
          safeWarn("Fallback wildcard handler error:", key, error);
        }
      }

      return true;
    }

    function clear(name = "") {
      const key = safeText(name, "");

      if (key) {
        listeners.delete(key);
        return true;
      }

      listeners.clear();
      return true;
    }

    function listenerCount(name = "") {
      const key = safeText(name, "");

      if (key) {
        return listeners.get(key)?.size || 0;
      }

      let total = 0;

      for (const set of listeners.values()) {
        total += set.size;
      }

      return total;
    }

    function names() {
      return Array.from(listeners.keys());
    }

    function getSnapshot() {
      return {
        fallback: true,
        names: names(),
        listenerCount: listenerCount(),
      };
    }

    return {
      on,
      once,
      off,
      emit,
      clear,
      listenerCount,
      names,
      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     ROOT REGISTRY / STATE
  ======================================================= */

  const registry = {
    modules: new Map(),
    scopes: new Map(),

    hooks: {
      beforeInit: [],
      afterInit: [],
      beforeRequest: [],
      afterResponse: [],
      onRequestError: [],
    },
  };

  const events = safeFactory(
    createEvents,
    createFallbackEvents,
    {
      maxRecentEvents:
        config?.diagnostics?.maxRecentEvents,
    }
  );

  const state =
    safeFactory(
      createInitialState,
      () => ({}),
      {
        config,
      }
    ) || {};

  const dom =
    safeFactory(
      createDomCache,
      () => ({})
    ) || {};

  /* =======================================================
     LOW LEVEL EMIT
  ======================================================= */

  function safeEmit(name, payload = {}) {
    const eventName = safeText(name, "");

    if (!eventName) {
      return false;
    }

    try {
      events?.emit?.(eventName, payload);
      return true;
    } catch {}

    return false;
  }

  /* =======================================================
     UTILS
  ======================================================= */

  const utils = {
    qs(selector, scope = null) {
      if (!isBrowser()) {
        return null;
      }

      const root = scope || document;

      try {
        return root?.querySelector?.(selector) || null;
      } catch {
        return null;
      }
    },

    qsa(selector, scope = null) {
      if (!isBrowser()) {
        return [];
      }

      const root = scope || document;

      try {
        return Array.from(root?.querySelectorAll?.(selector) || []);
      } catch {
        return [];
      }
    },

    byId(id = "") {
      if (!isBrowser()) {
        return null;
      }

      try {
        return document.getElementById(id);
      } catch {
        return null;
      }
    },

    on(target, ev, fn, opts = false) {
      if (
        !target ||
        !ev ||
        !isFunction(fn)
      ) {
        return () => {};
      }

      try {
        target.addEventListener(ev, fn, opts);

        return () => {
          try {
            target.removeEventListener(ev, fn, opts);
          } catch {}
        };
      } catch {
        return () => {};
      }
    },

    off(target, ev, fn, opts = false) {
      try {
        target?.removeEventListener?.(ev, fn, opts);
      } catch {}
    },

    sleep(ms = 0) {
      return new Promise((resolve) => {
        try {
          setTimeout(
            resolve,
            Math.max(0, safeNumber(ms, 0))
          );
        } catch {
          resolve();
        }
      });
    },

    nextTick(fn) {
      return Promise.resolve()
        .then(() => {
          if (isFunction(fn)) {
            return fn();
          }

          return undefined;
        });
    },

    afterPaint(fn) {
      if (!isBrowser()) {
        if (isFunction(fn)) {
          try {
            fn();
          } catch {}
        }

        return;
      }

      try {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            try {
              fn?.();
            } catch {}
          });
        });

        return;
      } catch {}

      try {
        setTimeout(() => {
          try {
            fn?.();
          } catch {}
        }, 0);
      } catch {}
    },

    log: safeLog,
    warn: safeWarn,
    error: safeError,
    emit: safeEmit,

    safeClone,
    cloneError,

    joinUrl,
    buildUrl,

    normalizePath,
    normalizeCanonicalPath,
    stripUsernamePrefix,

    sanitizeUsername,
    slugify,

    normalizeUser,
    getUserUsername,
    getUserDisplayName,
    getUserAvatarUrl,
    hasValidToken,
    getInitials,
    isPublicApiPath,

    redactTokenInText,
    sanitizeErrorForSnapshot,
    sanitizeStateForSnapshot,

    safeText,
    safeLower,
    safeBool,
    safeNumber,
    safeArray,
    safeObject: ensureObject,

    isObject,
    isFunction,

    now: safeNow,
    nowIso: safeIsoDate,
  };

  /* =======================================================
     FALLBACK CLEANUP
  ======================================================= */

  function createFallbackCleanup() {
    function ensureScope(name = "global") {
      const scopeName = safeText(name, "global");

      if (!registry.scopes.has(scopeName)) {
        registry.scopes.set(scopeName, new Set());
      }

      return {
        name: scopeName,
      };
    }

    function add(scopeName, disposer) {
      if (!isFunction(disposer)) {
        return false;
      }

      const scope = ensureScope(scopeName).name;

      registry.scopes.get(scope).add(disposer);

      return true;
    }

    function event(scopeName, targetOrName, eventNameOrHandler, handlerOrOptions, maybeOptions) {
      const scope = ensureScope(scopeName).name;

      let target = null;
      let eventName = "";
      let handler = null;
      let options = false;

      if (
        targetOrName &&
        isFunction(targetOrName.addEventListener)
      ) {
        target = targetOrName;
        eventName = safeText(eventNameOrHandler, "");
        handler = handlerOrOptions;
        options = maybeOptions || false;
      } else {
        target = isBrowser() ? window : null;
        eventName = safeText(targetOrName, "");
        handler = eventNameOrHandler;
        options = handlerOrOptions || false;
      }

      if (
        !target ||
        !eventName ||
        !isFunction(handler)
      ) {
        return false;
      }

      try {
        target.addEventListener(eventName, handler, options);

        add(scope, () => {
          try {
            target.removeEventListener(eventName, handler, options);
          } catch {}
        });

        return true;
      } catch {
        return false;
      }
    }

    function timeout(scopeName, callback, delay = 0) {
      if (!isFunction(callback)) {
        return null;
      }

      try {
        const id =
          setTimeout(
            callback,
            Math.max(0, safeNumber(delay, 0))
          );

        add(scopeName, () => {
          try {
            clearTimeout(id);
          } catch {}
        });

        return id;
      } catch {
        return null;
      }
    }

    function interval(scopeName, callback, delay = 0) {
      if (!isFunction(callback)) {
        return null;
      }

      try {
        const id =
          setInterval(
            callback,
            Math.max(0, safeNumber(delay, 0))
          );

        add(scopeName, () => {
          try {
            clearInterval(id);
          } catch {}
        });

        return id;
      } catch {
        return null;
      }
    }

    function run(scopeName = "global") {
      const scope = safeText(scopeName, "global");
      const disposers = registry.scopes.get(scope);

      if (!disposers) {
        return true;
      }

      for (const dispose of Array.from(disposers)) {
        try {
          dispose();
        } catch {}
      }

      disposers.clear();

      return true;
    }

    function clear(scopeName = "") {
      if (scopeName) {
        return run(scopeName);
      }

      for (const key of Array.from(registry.scopes.keys())) {
        run(key);
      }

      registry.scopes.clear();

      return true;
    }

    function getSnapshot() {
      return {
        fallback: true,
        scopeCount: registry.scopes.size,

        scopes:
          Array.from(registry.scopes.entries()).map(([name, disposers]) => ({
            name,
            count: disposers?.size || 0,
          })),
      };
    }

    return {
      scope: ensureScope,
      ensureScope,
      add,

      on: event,
      event,

      timeout,
      timer: timeout,
      interval,

      run,
      clear,
      dispose: run,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     FALLBACK STORAGE
  ======================================================= */

  function createFallbackStorage() {
    const memory = new Map();

    const prefix =
      safeText(
        config?.storagePrefix ||
          config?.appKey ||
          DEFAULT_STORAGE_PREFIX,
        DEFAULT_STORAGE_PREFIX
      );

    function normalizeKey(name = "") {
      const clean = safeText(name, "");

      if (!clean) {
        return `${prefix}:`;
      }

      if (
        clean.startsWith(`${prefix}:`) ||
        clean.startsWith(`${prefix}.`) ||
        clean.startsWith(`${prefix}_`)
      ) {
        return clean;
      }

      return `${prefix}:${clean}`;
    }

    function getStorage(kind = "localStorage") {
      if (!isBrowser()) {
        return null;
      }

      try {
        return window?.[kind] || null;
      } catch {
        return null;
      }
    }

    function getRaw(name, fallback = null) {
      const finalKey = normalizeKey(name);

      try {
        const local = getStorage("localStorage");
        const localValue = local?.getItem?.(finalKey);

        if (
          localValue !== null &&
          localValue !== undefined
        ) {
          return localValue;
        }
      } catch {}

      try {
        const session = getStorage("sessionStorage");
        const sessionValue = session?.getItem?.(finalKey);

        if (
          sessionValue !== null &&
          sessionValue !== undefined
        ) {
          return sessionValue;
        }
      } catch {}

      return memory.has(finalKey)
        ? memory.get(finalKey)
        : fallback;
    }

    function setRaw(name, value, options = {}) {
      const finalKey = normalizeKey(name);

      const raw =
        value === null ||
        value === undefined
          ? ""
          : String(value);

      memory.set(finalKey, raw);

      const target =
        options?.session === true
          ? getStorage("sessionStorage")
          : getStorage("localStorage");

      try {
        target?.setItem?.(finalKey, raw);
      } catch {}

      return true;
    }

    function parseJson(raw, fallback = null) {
      if (
        raw === null ||
        raw === undefined ||
        raw === ""
      ) {
        return fallback;
      }

      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    }

    function get(name, fallback = null) {
      const raw = getRaw(name, undefined);

      if (raw === undefined) {
        return fallback;
      }

      const parsed = parseJson(raw, undefined);

      return parsed === undefined
        ? raw
        : parsed;
    }

    function set(name, value, options = {}) {
      try {
        return setRaw(
          name,
          JSON.stringify(value),
          options
        );
      } catch {
        return setRaw(
          name,
          String(value ?? ""),
          options
        );
      }
    }

    function getJson(name, fallback = null) {
      return parseJson(
        getRaw(name, null),
        fallback
      );
    }

    function setJson(name, value, options = {}) {
      return set(name, value, options);
    }

    function remove(name) {
      const finalKey = normalizeKey(name);

      memory.delete(finalKey);

      try {
        getStorage("localStorage")?.removeItem?.(finalKey);
      } catch {}

      try {
        getStorage("sessionStorage")?.removeItem?.(finalKey);
      } catch {}

      return true;
    }

    function has(name) {
      const value = getRaw(name, undefined);

      return value !== undefined;
    }

    function keys() {
      return Array.from(memory.keys());
    }

    function getSnapshot() {
      return {
        fallback: true,
        prefix,

        memoryKeys:
          keys().map((key) =>
            redactTokenInText(key)
          ),
      };
    }

    return {
      prefix,

      key: normalizeKey,
      normalizeKey,

      getRaw,
      setRaw,

      get,
      set,

      getJson,
      setJson,

      remove,
      del: remove,
      delete: remove,

      has,
      keys,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     FACTORIES
  ======================================================= */

  const cleanup =
    safeFactory(
      createCleanup,
      createFallbackCleanup,
      {
        registry,
        events,
        utils,
      }
    );

  const storage =
    safeFactory(
      createStorage,
      createFallbackStorage,
      {
        utils,
        events,
      }
    );

  function createFallbackModules() {
    function canonical(name = "") {
      return safeText(name, "");
    }

    function has(name) {
      return registry.modules.has(canonical(name));
    }

    function get(name) {
      return registry.modules.get(canonical(name)) || null;
    }

    function register(name, moduleRef, options = {}) {
      const key = canonical(name);

      if (
        !key ||
        !moduleRef
      ) {
        return false;
      }

      const exists = registry.modules.has(key);

      if (
        exists &&
        options?.replace !== true &&
        options?.overwrite !== true
      ) {
        return registry.modules.get(key);
      }

      registry.modules.set(key, moduleRef);

      safeEmit(
        exists
          ? EVENTS.moduleReplaced
          : EVENTS.moduleRegistered,
        {
          name: key,
          replaced: exists,
          source: CORE_SOURCE,
        }
      );

      return moduleRef;
    }

    function set(name, moduleRef, options = {}) {
      return register(
        name,
        moduleRef,
        {
          ...ensureObject(options),
          replace: options?.replace !== false,
          overwrite: options?.overwrite !== false,
        }
      );
    }

    function remove(name) {
      return registry.modules.delete(canonical(name));
    }

    function list() {
      return Array.from(registry.modules.keys());
    }

    function getSnapshot() {
      return {
        fallback: true,
        count: registry.modules.size,
        modules: list(),
      };
    }

    return {
      has,
      get,
      register,
      set,
      remove,
      delete: remove,
      list,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  function createFallbackHooks() {
    function ensureHookList(name = "") {
      const key = safeText(name, "");

      if (!key) {
        return null;
      }

      if (!Array.isArray(registry.hooks[key])) {
        registry.hooks[key] = [];
      }

      return registry.hooks[key];
    }

    function add(name, handler) {
      const list = ensureHookList(name);

      if (
        !list ||
        !isFunction(handler)
      ) {
        return () => {};
      }

      list.push(handler);

      return () => {
        const key = safeText(name, "");

        registry.hooks[key] =
          safeArray(registry.hooks[key]).filter((item) =>
            item !== handler
          );
      };
    }

    async function run(name, payload = {}) {
      const list =
        safeArray(
          registry.hooks[
            safeText(name, "")
          ]
        );

      let current = payload;

      for (const hook of list) {
        if (!isFunction(hook)) {
          continue;
        }

        try {
          const next = await hook(current);

          if (next !== undefined) {
            current = next;
          }
        } catch (error) {
          safeWarn("Hook error:", name, error);
        }
      }

      return current;
    }

    function get(name) {
      return safeArray(
        registry.hooks[
          safeText(name, "")
        ]
      );
    }

    function clear(name = "") {
      const key = safeText(name, "");

      if (key) {
        registry.hooks[key] = [];
        return true;
      }

      Object.keys(registry.hooks).forEach((hookName) => {
        registry.hooks[hookName] = [];
      });

      return true;
    }

    function getSnapshot() {
      return Object.fromEntries(
        Object.entries(registry.hooks || {}).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.length
            : 0,
        ])
      );
    }

    return {
      add,
      on: add,
      use: add,
      run,
      get,
      clear,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  const modules =
    safeFactory(
      createModules,
      createFallbackModules,
      {
        registry,
        events,
      }
    );

  const hooks =
    safeFactory(
      createHooks,
      createFallbackHooks,
      {
        registry,
        events,
        utils,
      }
    );

  /* =======================================================
     STATE HELPERS
  ======================================================= */

  function ensureState() {
    if (
      !state ||
      typeof state !== "object"
    ) {
      return {};
    }

    return state;
  }

  function hasTokenValue(token) {
    const text = safeText(token, "");

    if (!text) {
      return false;
    }

    const lower = text.toLowerCase();

    if (
      [
        "null",
        "undefined",
        "false",
        "true",
        "nan",
        "none",
        "[object object]",
      ].includes(lower)
    ) {
      return false;
    }

    if (/[\s\r\n\t]/.test(text)) {
      return false;
    }

    try {
      return Boolean(hasValidToken(text));
    } catch {}

    return true;
  }

  function getNestedObject(value = {}) {
    return isObject(value)
      ? value
      : {};
  }

  function firstToken(...values) {
    for (const value of values) {
      if (hasTokenValue(value)) {
        return String(value).trim();
      }
    }

    return null;
  }

  function hasUsableUser(user = null) {
    if (
      !user ||
      typeof user !== "object" ||
      Array.isArray(user)
    ) {
      return false;
    }

    if (
      user.active === false ||
      user.disabled === true ||
      user.deleted === true ||
      user.isDisabled === true ||
      user.isDeleted === true
    ) {
      return false;
    }

    const status =
      safeLower(
        user.status ||
          user.estado ||
          user.state ||
          "",
        ""
      );

    if (
      [
        "disabled",
        "inactive",
        "deleted",
        "blocked",
        "suspended",
        "banned",
        "desactivado",
        "inactivo",
        "eliminado",
        "bloqueado",
        "suspendido",
      ].includes(status)
    ) {
      return false;
    }

    return USER_ID_KEYS.some((key) =>
      Boolean(
        safeText(user?.[key], "")
      )
    );
  }

  function firstUser(...values) {
    for (const value of values) {
      if (hasUsableUser(value)) {
        return value;
      }

      try {
        const normalized =
          value
            ? normalizeUser(value)
            : null;

        if (hasUsableUser(normalized)) {
          return normalized;
        }
      } catch {}
    }

    return null;
  }

  function getStateToken(root = ensureState()) {
    const session = getNestedObject(root.session);
    const sessionData = getNestedObject(root.sessionData);

    return firstToken(
      ...TOKEN_STATE_KEYS.map((key) => root[key]),
      ...TOKEN_STATE_KEYS.map((key) => session[key]),
      ...TOKEN_STATE_KEYS.map((key) => sessionData[key])
    );
  }

  function getStateUser(root = ensureState()) {
    const session = getNestedObject(root.session);
    const sessionData = getNestedObject(root.sessionData);

    return firstUser(
      ...USER_STATE_KEYS.map((key) => root[key]),
      ...USER_STATE_KEYS.map((key) => session[key]),
      ...USER_STATE_KEYS.map((key) => sessionData[key])
    );
  }

  function normalizeRoleValue(user = null, explicitRole = "") {
    return safeText(
      explicitRole ||
        user?.role ||
        user?.rol ||
        user?.userRole ||
        user?.user_role ||
        user?.type ||
        user?.userType ||
        user?.user_type ||
        user?.profile?.role ||
        user?.profile?.rol ||
        user?.raw?.role ||
        user?.raw?.rol ||
        "",
      ""
    ).toLowerCase() || null;
  }

  function resolveUsernameValue(user = null) {
    return (
      safeText(
        getUserUsername(user) ||
          user?.username ||
          user?.userName ||
          user?.user_name ||
          user?.nick ||
          user?.alias ||
          user?.slug ||
          user?.login ||
          user?.email ||
          user?.mail ||
          user?.name ||
          "",
        ""
      ) || null
    );
  }

  function resolveCurrentUsernameValue(root) {
    if (!root?.authenticated) {
      return null;
    }

    const fromPrevious =
      sanitizeUsername(
        root.currentResolvedUsername ||
          root.resolvedUsername ||
          ""
      ) || null;

    const fromUser =
      sanitizeUsername(
        getUserUsername(root.user) ||
          root.user?.username ||
          root.user?.userName ||
          root.user?.user_name ||
          root.user?.nick ||
          root.user?.alias ||
          root.user?.login ||
          root.user?.slug ||
          root.user?.email ||
          root.user?.mail ||
          ""
      ) || null;

    return (
      fromPrevious ||
      fromUser ||
      null
    );
  }

  function computeAuthValue(root, options = {}) {
    const opts = ensureObject(options);

    if (opts.forceUnauthenticated === true) {
      return false;
    }

    const token = getStateToken(root);
    const user = getStateUser(root);

    if (
      !hasTokenValue(token) ||
      !hasUsableUser(user)
    ) {
      return false;
    }

    try {
      return Boolean(
        computeAuthenticated(
          user,
          token
        )
      );
    } catch {}

    return true;
  }

  function syncDerivedAuthState(options = {}) {
    const root = ensureState();

    const token = getStateToken(root);
    const user = getStateUser(root);

    const tokenValid = hasTokenValue(token);
    const userValid = hasUsableUser(user);

    const authenticated =
      computeAuthValue(
        {
          ...root,
          token,
          user,
        },
        options
      );

    root.token = tokenValid ? token : null;
    root.accessToken = tokenValid ? token : null;
    root.access_token = tokenValid ? token : null;

    root.user = userValid ? user : null;

    root.authenticated = authenticated;
    root.hasToken = tokenValid;

    root.role =
      authenticated
        ? normalizeRoleValue(root.user, root.role)
        : null;

    root.username =
      authenticated
        ? resolveUsernameValue(root.user)
        : null;

    root.currentResolvedUsername =
      authenticated
        ? resolveCurrentUsernameValue(root)
        : null;

    root.resolvedUsername =
      root.currentResolvedUsername || null;

    if (!authenticated) {
      root.role = null;
      root.username = null;
      root.currentResolvedUsername = null;
      root.resolvedUsername = null;
    }

    return root;
  }

  function selectStateMarkers(root = {}) {
    return {
      authenticated: Boolean(root.authenticated),
      hasToken: Boolean(root.hasToken),
      user: root.user || null,
      username: root.username || null,
      role: root.role || null,
      currentResolvedUsername: root.currentResolvedUsername || null,
      route: root.route || "/",
      publicPath: root.publicPath || "/",
      lang: root.lang || DEFAULT_LANG,
      theme: root.theme || DEFAULT_THEME,
    };
  }

  function sameMarkerValue(a, b) {
    if (a === b) {
      return true;
    }

    if (
      isAnyObject(a) ||
      isAnyObject(b)
    ) {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    }

    return false;
  }

  function markerChanged(before = {}, after = {}, keys = []) {
    return safeArray(keys).some((key) =>
      !sameMarkerValue(before[key], after[key])
    );
  }

  function clonePublicState({ safe = false } = {}) {
    let snapshot = null;

    try {
      snapshot = cloneState(ensureState());
    } catch {}

    if (!snapshot) {
      try {
        snapshot = safeClone(ensureState(), {});
      } catch {}
    }

    if (!snapshot) {
      snapshot = {
        ...ensureState(),
      };
    }

    return safe
      ? sanitizeStateForSnapshot(snapshot)
      : snapshot;
  }

  function emitDerivedStateChanges(before = {}, after = {}, patch = {}, options = {}) {
    const opts = ensureObject(options);

    if (opts.emit === false) {
      return false;
    }

    const changedKeys =
      Object.keys(ensureObject(patch));

    if (
      opts.emitState === true &&
      changedKeys.length > 0
    ) {
      safeEmit(
        EVENTS.stateChange,
        {
          changedKeys,

          state:
            sanitizeStateForSnapshot(after),

          previous:
            sanitizeStateForSnapshot(before),

          source:
            safeText(opts.source, "core:setState"),
        }
      );
    }

    if (
      opts.emitDerived === true &&
      markerChanged(before, after, [
        "authenticated",
        "hasToken",
        "role",
      ])
    ) {
      safeEmit(
        EVENTS.authChange,
        {
          authenticated: Boolean(after.authenticated),
          hasToken: Boolean(after.hasToken),
          role: after.role || null,
          username: after.username || null,
          previousAuthenticated: Boolean(before.authenticated),
          source: safeText(opts.source, "core:setState"),
        }
      );
    }

    if (
      opts.emitDerived === true &&
      markerChanged(before, after, [
        "user",
        "username",
        "currentResolvedUsername",
        "role",
      ])
    ) {
      safeEmit(
        EVENTS.userChange,
        {
          authenticated: Boolean(after.authenticated),

          user:
            after.authenticated
              ? after.user || null
              : null,

          username: after.username || null,
          currentResolvedUsername: after.currentResolvedUsername || null,
          role: after.role || null,
          source: safeText(opts.source, "core:setState"),
        }
      );
    }

    if (
      opts.emitDerived === true &&
      markerChanged(before, after, [
        "route",
      ])
    ) {
      safeEmit(
        EVENTS.routeChange,
        {
          route: after.route || "/",
          previousRoute: before.route || "/",
          publicPath: after.publicPath || "/",
          source: safeText(opts.source, "core:setState"),
        }
      );
    }

    if (
      opts.emitDerived === true &&
      markerChanged(before, after, [
        "publicPath",
      ])
    ) {
      safeEmit(
        EVENTS.publicPathChange,
        {
          publicPath: after.publicPath || "/",
          previousPublicPath: before.publicPath || "/",
          route: after.route || "/",
          source: safeText(opts.source, "core:setState"),
        }
      );
    }

    return true;
  }

  async function runInitHooks(type, payload = {}) {
    const key = safeText(type, "");

    if (!key) {
      return payload;
    }

    try {
      if (isFunction(hooks?.run)) {
        return await hooks.run(key, payload);
      }

      if (isFunction(hooks?.runSeries)) {
        return await hooks.runSeries(key, payload);
      }
    } catch (error) {
      safeWarn("hooks.run() falló.", key, error);
    }

    const list = registry?.hooks?.[key];

    if (
      !Array.isArray(list) ||
      !list.length
    ) {
      return payload;
    }

    let current = payload;

    for (const hook of list) {
      if (!isFunction(hook)) {
        continue;
      }

      try {
        const next = await hook(current);

        if (next !== undefined) {
          current = next;
        }
      } catch (error) {
        safeWarn("Hook error:", key, error);
      }
    }

    return current;
  }

  /* =======================================================
     STATE API
  ======================================================= */

  function setState(patch = {}, options = {}) {
    const root = ensureState();

    const cleanPatch =
      patch &&
      typeof patch === "object" &&
      !Array.isArray(patch)
        ? patch
        : {};

    const opts = ensureObject(options);

    const before = selectStateMarkers(root);

    let baseSucceeded = false;

    try {
      setStateBase({
        state: root,
        events,
        patch: cleanPatch,
      });

      baseSucceeded = true;
    } catch (error) {
      try {
        Object.assign(root, cleanPatch);
      } catch {}

      safeWarn("setStateBase falló; aplicado fallback.", error);
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        opts.forceUnauthenticated === true,
    });

    const after = selectStateMarkers(root);

    emitDerivedStateChanges(
      before,
      after,
      cleanPatch,
      {
        ...opts,

        emitState:
          baseSucceeded
            ? opts.emitState === true
            : opts.emitState !== false,

        emitDerived:
          opts.emitDerived === true ||
          (!baseSucceeded && opts.emitDerived !== false),
      }
    );

    return clonePublicState();
  }

  function getState(options = {}) {
    syncDerivedAuthState();

    const opts = ensureObject(options);

    try {
      const snapshot = getStateBase(ensureState());

      return opts.safe
        ? sanitizeStateForSnapshot(snapshot)
        : snapshot;
    } catch {
      return clonePublicState({
        safe:
          opts.safe === true,
      });
    }
  }

  function patchState(patch = {}, options = {}) {
    return setState(patch, options);
  }

  function isAuthenticated() {
    syncDerivedAuthState();

    return Boolean(state.authenticated);
  }

  function getCurrentUser() {
    syncDerivedAuthState();

    return state.user || null;
  }

  function getCurrentRole() {
    syncDerivedAuthState();

    return state.role || null;
  }

  function hasRole(roleOrRoles = []) {
    const roles =
      Array.isArray(roleOrRoles)
        ? roleOrRoles
        : [roleOrRoles];

    const current =
      safeLower(
        getCurrentRole(),
        ""
      );

    return roles.some((role) =>
      safeLower(role, "") === current
    );
  }

  function getAuthHeader() {
    syncDerivedAuthState();

    const token = safeText(state.token, "");

    if (!token) {
      return {};
    }

    const headerName =
      safeText(
        config?.auth?.tokenHeader,
        "Authorization"
      );

    const bearerPrefix =
      safeText(
        config?.auth?.bearerPrefix,
        "Bearer"
      );

    return {
      [headerName]:
        `${bearerPrefix} ${token}`,
    };
  }

  /* =======================================================
     UI API
  ======================================================= */

  function setDocumentTitle(title = config.appName) {
    try {
      return setDocumentTitleBase({
        dom,
        events,
        title:
          safeText(
            title,
            getAppName()
          ),
      });
    } catch {
      if (isBrowser()) {
        try {
          document.title =
            safeText(
              title,
              getAppName()
            );

          return document.title;
        } catch {}
      }
    }

    return false;
  }

  function clearDynamicContainers(options = {}) {
    try {
      return clearDynamicContainersBase({
        dom,
        events,
        ...ensureObject(options),
      });
    } catch {}

    return false;
  }

  function syncUserUI(options = {}) {
    try {
      return syncUserUIBase({
        state,
        dom,
        events,
        ...ensureObject(options),
      });
    } catch (error) {
      safeWarn("syncUserUIBase falló.", error);
      return false;
    }
  }

  function setShowToast(fn) {
    if (!isFunction(fn)) {
      return false;
    }

    showToastBridge = fn;

    safeEmit(
      EVENTS.toastBridgeReady,
      {
        ready: true,
        at: safeIsoDate(),
        source: CORE_SOURCE,
      }
    );

    return true;
  }

  function showToast(message = "", type = "info", options = {}) {
    if (!isFunction(showToastBridge)) {
      return null;
    }

    try {
      return showToastBridge(message, type, options);
    } catch (error) {
      safeWarn("showToast bridge falló.", error);
      return null;
    }
  }

  /* =======================================================
     SESSION PAYLOAD EXTRACTION
  ======================================================= */

  function extractSessionPayload(payload = {}) {
    const source = ensureObject(payload);

    const data = ensureObject(source.data);
    const payloadData = ensureObject(source.payload);

    const session = ensureObject(source.session);
    const sessionData = ensureObject(source.sessionData);

    const dataSession = ensureObject(data.session);
    const dataSessionData = ensureObject(data.sessionData);

    const payloadSession = ensureObject(payloadData.session);
    const payloadSessionData = ensureObject(payloadData.sessionData);

    const auth = ensureObject(source.auth);
    const dataAuth = ensureObject(data.auth);

    const user =
      firstUser(
        source.user,
        source.usuario,
        source.me,
        source.account,
        source.profile,
        source.currentUser,
        source.sessionUser,
        source.authUser,

        session.user,
        session.usuario,
        session.me,
        session.account,
        session.profile,

        sessionData.user,
        sessionData.usuario,
        sessionData.me,
        sessionData.account,
        sessionData.profile,

        data.user,
        data.usuario,
        data.me,
        data.account,
        data.profile,
        data.currentUser,
        data.sessionUser,
        data.authUser,

        dataSession.user,
        dataSession.usuario,
        dataSession.me,
        dataSession.account,
        dataSession.profile,

        dataSessionData.user,
        dataSessionData.usuario,
        dataSessionData.me,
        dataSessionData.account,
        dataSessionData.profile,

        payloadData.user,
        payloadData.usuario,
        payloadData.me,
        payloadData.account,
        payloadData.profile,
        payloadData.currentUser,
        payloadData.sessionUser,
        payloadData.authUser,

        payloadSession.user,
        payloadSession.usuario,
        payloadSession.me,
        payloadSession.account,
        payloadSession.profile,

        payloadSessionData.user,
        payloadSessionData.usuario,
        payloadSessionData.me,
        payloadSessionData.account,
        payloadSessionData.profile,

        auth.user,
        auth.usuario,
        auth.me,
        auth.account,
        auth.profile,

        dataAuth.user,
        dataAuth.usuario,
        dataAuth.me,
        dataAuth.account,
        dataAuth.profile
      );

    const token =
      firstToken(
        source.token,
        source.accessToken,
        source.access_token,
        source.jwt,
        source.bearer,

        session.token,
        session.accessToken,
        session.access_token,
        session.jwt,
        session.bearer,

        sessionData.token,
        sessionData.accessToken,
        sessionData.access_token,
        sessionData.jwt,
        sessionData.bearer,

        data.token,
        data.accessToken,
        data.access_token,
        data.jwt,
        data.bearer,

        dataSession.token,
        dataSession.accessToken,
        dataSession.access_token,
        dataSession.jwt,
        dataSession.bearer,

        dataSessionData.token,
        dataSessionData.accessToken,
        dataSessionData.access_token,
        dataSessionData.jwt,
        dataSessionData.bearer,

        payloadData.token,
        payloadData.accessToken,
        payloadData.access_token,
        payloadData.jwt,
        payloadData.bearer,

        payloadSession.token,
        payloadSession.accessToken,
        payloadSession.access_token,
        payloadSession.jwt,
        payloadSession.bearer,

        payloadSessionData.token,
        payloadSessionData.accessToken,
        payloadSessionData.access_token,
        payloadSessionData.jwt,
        payloadSessionData.bearer,

        auth.token,
        auth.accessToken,
        auth.access_token,
        auth.jwt,
        auth.bearer,

        dataAuth.token,
        dataAuth.accessToken,
        dataAuth.access_token,
        dataAuth.jwt,
        dataAuth.bearer
      );

    return {
      user: user || null,
      token: token || null,

      refreshToken:
        firstToken(
          source.refreshToken,
          source.refresh_token,
          data.refreshToken,
          data.refresh_token,
          auth.refreshToken,
          auth.refresh_token
        ),

      tempToken:
        firstToken(
          source.tempToken,
          source.temp_token,
          source.temporaryToken,
          source.temporary_token,
          data.tempToken,
          data.temp_token,
          auth.tempToken,
          auth.temp_token
        ),

      sessionId:
        safeText(
          source.sessionId ||
            source.session_id ||
            session.sessionId ||
            session.session_id ||
            session.id ||
            sessionData.sessionId ||
            sessionData.session_id ||
            sessionData.id ||
            data.sessionId ||
            data.session_id ||
            dataSession.sessionId ||
            dataSession.session_id ||
            dataSession.id ||
            auth.sessionId ||
            auth.session_id ||
            "",
          ""
        ) || null,

      sessionUserId:
        safeText(
          source.sessionUserId ||
            source.session_user_id ||
            source.userId ||
            source.user_id ||
            session.sessionUserId ||
            session.session_user_id ||
            session.userId ||
            session.user_id ||
            sessionData.sessionUserId ||
            sessionData.session_user_id ||
            sessionData.userId ||
            sessionData.user_id ||
            data.sessionUserId ||
            data.session_user_id ||
            data.userId ||
            data.user_id ||
            auth.sessionUserId ||
            auth.session_user_id ||
            auth.userId ||
            auth.user_id ||
            "",
          ""
        ) || null,

      route:
        source.route ||
        source.canonicalPath ||
        data.route ||
        data.canonicalPath ||
        payloadData.route ||
        payloadData.canonicalPath ||
        null,

      publicPath:
        source.publicPath ||
        data.publicPath ||
        payloadData.publicPath ||
        null,
    };
  }

  /* =======================================================
     SESSION API
  ======================================================= */

  function setRoute(route = "/", options = {}) {
    try {
      return setRouteBase({
        state,
        setState,
        events,
        route,
        options: ensureObject(options),
      });
    } catch (error) {
      const cleanRoute =
        normalizeCanonicalPath(route || "/");

      setState(
        {
          route: cleanRoute,
          canonicalPath: cleanRoute,
        },
        {
          source: "core:setRoute:fallback",
          emitDerived: true,
        }
      );

      safeWarn("setRouteBase falló; aplicado fallback.", error);

      return cleanRoute;
    }
  }

  function setPublicPath(path = "/", options = {}) {
    try {
      return setPublicPathBase({
        state,
        storage,
        setState,
        events,
        path,
        options: ensureObject(options),
      });
    } catch (error) {
      const cleanPath = normalizePath(path || "/");

      setState(
        {
          publicPath: cleanPath,
        },
        {
          source: "core:setPublicPath:fallback",
          emitDerived: true,
        }
      );

      safeWarn("setPublicPathBase falló; aplicado fallback.", error);

      return cleanPath;
    }
  }

  function setUser(user = null, options = {}) {
    let result = null;

    try {
      result =
        setUserBase({
          state,
          storage,
          events,
          setState,
          syncUserUI,
          user,
          options: ensureObject(options),
        });
    } catch (error) {
      setState(
        {
          user:
            user
              ? normalizeUser(user)
              : null,
        },
        {
          source: "core:setUser:fallback",
          forceUnauthenticated: !user && !state.token,
          emitDerived: true,
        }
      );

      safeWarn("setUserBase falló; aplicado fallback.", error);

      result = state.user;
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        !user && !state.token,
    });

    return result;
  }

  function setToken(token = null, options = {}) {
    let result = null;

    try {
      result =
        setTokenBase({
          state,
          storage,
          events,
          setState,
          token,
          options: ensureObject(options),
        });
    } catch (error) {
      const cleanToken =
        hasTokenValue(token)
          ? String(token).trim()
          : null;

      setState(
        {
          token: cleanToken,
          accessToken: cleanToken,
          access_token: cleanToken,
        },
        {
          source: "core:setToken:fallback",
          forceUnauthenticated: !cleanToken,
          emitDerived: true,
        }
      );

      safeWarn("setTokenBase falló; aplicado fallback.", error);

      result = state.token;
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        !token,
    });

    return result;
  }

  function adaptSessionSetterValue(value, key) {
    if (
      value &&
      typeof value === "object" &&
      safeOwn(value, key)
    ) {
      return value[key];
    }

    return value;
  }

  function applySession(session = {}, options = {}) {
    const payload = ensureObject(session);
    const opts = ensureObject(options);

    const extracted =
      extractSessionPayload(payload);

    const token =
      safeOwn(payload, "token") ||
      safeOwn(payload, "accessToken") ||
      safeOwn(payload, "access_token") ||
      extracted.token
        ? extracted.token
        : undefined;

    const user =
      safeOwn(payload, "user") ||
      safeOwn(payload, "usuario") ||
      safeOwn(payload, "me") ||
      safeOwn(payload, "account") ||
      safeOwn(payload, "profile") ||
      extracted.user
        ? extracted.user
        : undefined;

    let result = null;
    let baseSucceeded = false;

    try {
      result =
        applySessionBase({
          state,
          storage,
          events,

          setUser:
            (value) =>
              setUser(
                adaptSessionSetterValue(value, "user"),
                {
                  source: "core:applySession:setUser",
                }
              ),

          setToken:
            (value) =>
              setToken(
                adaptSessionSetterValue(value, "token"),
                {
                  source: "core:applySession:setToken",
                }
              ),

          setState,

          token,
          user,

          refreshToken: extracted.refreshToken,
          tempToken: extracted.tempToken,
          sessionId: extracted.sessionId,
          sessionUserId: extracted.sessionUserId,
          route: extracted.route,
          publicPath: extracted.publicPath,

          options: opts,
        });

      baseSucceeded = true;
    } catch (error) {
      if (token !== undefined) {
        setToken(
          token,
          {
            source: "core:applySession:fallback-token",
          }
        );
      }

      if (user !== undefined) {
        setUser(
          user,
          {
            source: "core:applySession:fallback-user",
          }
        );
      }

      if (extracted.route) {
        setRoute(
          extracted.route,
          {
            source: "core:applySession:fallback-route",
          }
        );
      }

      if (extracted.publicPath) {
        setPublicPath(
          extracted.publicPath,
          {
            source: "core:applySession:fallback-public-path",
          }
        );
      }

      safeWarn("applySessionBase falló; aplicado fallback.", error);

      result = {
        token: state.token,
        user: state.user,
      };
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        token === null,
    });

    if (
      !baseSucceeded &&
      opts.emit !== false
    ) {
      safeEmit(
        EVENTS.sessionApplied,
        {
          authenticated: Boolean(state.authenticated),
          hasToken: Boolean(state.hasToken),
          username: state.username || null,
          currentResolvedUsername: state.currentResolvedUsername || null,
          source: safeText(opts.source, "core:applySession:fallback"),
        }
      );
    }

    return result;
  }

  function clearSession(options = {}) {
    const opts = ensureObject(options);

    let result = null;
    let baseSucceeded = false;

    try {
      result =
        clearSessionBase({
          state,
          storage,
          events,
          setState,
          syncUserUI,
          utils,
          options: opts,
        });

      baseSucceeded = true;
    } catch (error) {
      setState(
        {
          token: null,
          accessToken: null,
          access_token: null,
          refreshToken: null,
          refresh_token: null,
          idToken: null,
          id_token: null,
          tempToken: null,
          temp_token: null,

          user: null,
          currentUser: null,
          sessionUser: null,
          authUser: null,

          authenticated: false,
          hasToken: false,

          role: null,
          username: null,
          currentResolvedUsername: null,
          resolvedUsername: null,
        },
        {
          source: "core:clearSession:fallback",
          forceUnauthenticated: true,
          emitDerived: true,
        }
      );

      safeWarn("clearSessionBase falló; aplicado fallback.", error);

      result = true;
    }

    syncDerivedAuthState({
      forceUnauthenticated: true,
    });

    if (
      !baseSucceeded &&
      opts.emit !== false
    ) {
      safeEmit(
        EVENTS.sessionCleared,
        {
          silent: Boolean(opts.silent),
          source: safeText(opts.source, "core:clearSession:fallback"),
        }
      );
    }

    return result;
  }

  function setTheme(theme, themeMode = "") {
    try {
      return setThemeBase({
        dom,
        storage,
        events,
        setState,
        theme,
        themeMode,
      });
    } catch {
      const cleanTheme =
        safeText(theme, DEFAULT_THEME).toLowerCase() === "light"
          ? "light"
          : DEFAULT_THEME;

      setState(
        {
          theme: cleanTheme,
        },
        {
          source: "core:setTheme:fallback",
        }
      );

      return cleanTheme;
    }
  }

  function setLang(lang) {
    try {
      return setLangBase({
        dom,
        storage,
        events,
        setState,
        lang,
      });
    } catch {
      const cleanLang =
        safeText(lang, DEFAULT_LANG).toLowerCase();

      setState(
        {
          lang: cleanLang,
        },
        {
          source: "core:setLang:fallback",
        }
      );

      try {
        if (isBrowser()) {
          document.documentElement.lang = cleanLang;
        }
      } catch {}

      safeEmit(
        "app:lang:change",
        {
          lang: cleanLang,
          source: "core:setLang:fallback",
        }
      );

      return cleanLang;
    }
  }

  function setSidebarOpen(value) {
    try {
      return setSidebarOpenBase({
        dom,
        storage,
        events,
        setState,
        value,
      });
    } catch {
      const next = Boolean(value);

      setState(
        {
          sidebarOpen: next,
        },
        {
          source: "core:setSidebarOpen:fallback",
        }
      );

      return next;
    }
  }

  function setLoading(value) {
    try {
      return setLoadingBase({
        dom,
        events,
        setState,
        value,
      });
    } catch {
      const next = Boolean(value);

      setState(
        {
          loading: next,
        },
        {
          source: "core:setLoading:fallback",
        }
      );

      return next;
    }
  }

  function setError(error = null) {
    try {
      return setErrorBase({
        events,
        setState,
        cloneError,
        error,
      });
    } catch {
      const normalized =
        error
          ? cloneError(error)
          : null;

      setState(
        {
          error: normalized,
          lastError: normalized,
          hasError: Boolean(normalized),
        },
        {
          source: "core:setError:fallback",
        }
      );

      return normalized;
    }
  }

  /* =======================================================
     REQUEST
  ======================================================= */

  function createFallbackRequest() {
    return async function fallbackRequest(url, options = {}) {
      if (!isBrowser() || !isFunction(fetch)) {
        throw new Error("Fetch API no disponible.");
      }

      const response = await fetch(url, options);

      const contentType =
        response.headers?.get?.("content-type") || "";

      let body = null;

      if (contentType.includes("application/json")) {
        try {
          body = await response.json();
        } catch {
          body = null;
        }
      } else {
        try {
          body = await response.text();
        } catch {
          body = "";
        }
      }

      if (!response.ok) {
        const error =
          new Error(
            safeText(
              body?.message ||
                body?.error ||
                response.statusText,
              `HTTP ${response.status}`
            )
          );

        error.status = response.status;
        error.response = response;
        error.body = body;

        throw error;
      }

      return body;
    };
  }

  const request =
    safeFactory(
      createRequest,
      createFallbackRequest,
      {
        state,
        events,
        setError,
        utils,
        registry,
        hooks,
      }
    );

  function createFallbackApiClient(req) {
    const call =
      isFunction(req)
        ? req
        : createFallbackRequest();

    function buildJsonOptions(method, body, options = {}) {
      const opts = ensureObject(options);

      const headers = {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      };

      return {
        ...opts,
        method,

        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),

        headers,
      };
    }

    return {
      request: call,

      get(url, options = {}) {
        return call(
          url,
          {
            ...options,
            method: "GET",
          }
        );
      },

      post(url, body = undefined, options = {}) {
        return call(
          url,
          buildJsonOptions("POST", body, options)
        );
      },

      put(url, body = undefined, options = {}) {
        return call(
          url,
          buildJsonOptions("PUT", body, options)
        );
      },

      patch(url, body = undefined, options = {}) {
        return call(
          url,
          buildJsonOptions("PATCH", body, options)
        );
      },

      delete(url, options = {}) {
        return call(
          url,
          {
            ...options,
            method: "DELETE",
          }
        );
      },

      del(url, options = {}) {
        return this.delete(url, options);
      },
    };
  }

  const apiClient =
    safeFactory(
      createApiClient,
      () => createFallbackApiClient(request),
      request
    );

  requestBridge = request;
  apiClientBridge = apiClient;

  /* =======================================================
     MODULE BRIDGES
  ======================================================= */

  function getUniqueBridgeAliases(name = "") {
    const rawAliases =
      BRIDGE_MODULE_ALIASES[name] ||
      [name];

    const output = [];
    const seen = new Set();

    for (const alias of rawAliases) {
      const clean = safeText(alias, "");

      if (
        !clean ||
        seen.has(clean)
      ) {
        continue;
      }

      seen.add(clean);
      output.push(clean);
    }

    return output;
  }

  function registerBridgeModule(name = "", value = null, options = {}) {
    const aliases = getUniqueBridgeAliases(name);
    const opts = ensureObject(options);

    if (
      !aliases.length ||
      !value
    ) {
      return false;
    }

    let changed = false;

    for (const alias of aliases) {
      try {
        const current = registry.modules.get(alias);

        if (current === value) {
          continue;
        }

        registry.modules.set(alias, value);
        changed = true;

        if (opts.emit === true) {
          safeEmit(
            current
              ? EVENTS.moduleReplaced
              : EVENTS.moduleRegistered,
            {
              name: alias,
              replaced: Boolean(current),
              source: safeText(opts.source, CORE_SOURCE),
            }
          );
        }
      } catch {}
    }

    return changed || true;
  }

  function getBridgeModule(name = "") {
    const aliases =
      BRIDGE_MODULE_ALIASES[name] ||
      [name];

    for (const alias of aliases) {
      try {
        const value =
          modules?.get?.(alias) ||
          registry.modules.get(alias);

        if (value) {
          return value;
        }
      } catch {}
    }

    return null;
  }

  /* =======================================================
     HTTP BRIDGE · CORE HTTP CONNECTOR
  ======================================================= */

  function getHttpExport(name = "") {
    try {
      return CoreHttpModule?.[name];
    } catch {
      return null;
    }
  }

  function getDefaultHttpExport() {
    try {
      return CoreHttpModule?.default || null;
    } catch {
      return null;
    }
  }

  function isFormDataLike(value) {
    try {
      return (
        typeof FormData !== "undefined" &&
        value instanceof FormData
      );
    } catch {
      return false;
    }
  }

  function createHttpJsonOptions(method = "GET", body = undefined, options = {}) {
    const opts = ensureObject(options);
    const bodyIsForm = isFormDataLike(body);

    const headers =
      bodyIsForm
        ? {
            ...(opts.headers || {}),
          }
        : {
            "Content-Type": "application/json",
            ...(opts.headers || {}),
          };

    return {
      ...opts,

      method:
        safeText(method, "GET").toUpperCase(),

      headers,

      body:
        body === undefined
          ? undefined
          : bodyIsForm
            ? body
            : JSON.stringify(body),
    };
  }

  function getAuthEndpoint(name = "", fallback = "") {
    const cleanName = safeText(name, "");

    const authConfig = ensureObject(config?.auth);
    const apiConfig = ensureObject(config?.api);
    const endpoints = ensureObject(authConfig.endpoints || apiConfig.endpoints);

    return (
      safeText(endpoints?.[cleanName], "") ||
      safeText(authConfig?.[`${cleanName}Endpoint`], "") ||
      safeText(apiConfig?.[`${cleanName}Endpoint`], "") ||
      fallback
    );
  }

  function setHttpMember(target, key = "", value = null) {
    if (
      !target ||
      !key ||
      value === null ||
      value === undefined
    ) {
      return false;
    }

    try {
      if (
        target[key] === undefined ||
        target[key] === null
      ) {
        target[key] = value;
        return true;
      }
    } catch {}

    try {
      defineHiddenValue(target, key, value);
      return true;
    } catch {}

    return false;
  }

  function createHttpCompatClient(candidate = null) {
    const source =
      candidate &&
      (
        typeof candidate === "object" ||
        typeof candidate === "function"
      )
        ? candidate
        : {};

    let client = source;

    try {
      if (
        !Object.isExtensible(client) ||
        Array.isArray(client)
      ) {
        client = {};
      }
    } catch {
      client = {};
    }

    const requestFn =
      isFunction(source.request)
        ? source.request.bind(source)
        : isFunction(source)
          ? source
          : isFunction(requestBridge)
            ? requestBridge
            : request;

    setHttpMember(client, "request", requestFn);

    if (!isFunction(client.get)) {
      setHttpMember(
        client,
        "get",
        (url, options = {}) =>
          requestFn(
            url,
            {
              ...options,
              method: "GET",
            }
          )
      );
    }

    if (!isFunction(client.post)) {
      setHttpMember(
        client,
        "post",
        (url, body = undefined, options = {}) =>
          requestFn(
            url,
            createHttpJsonOptions("POST", body, options)
          )
      );
    }

    if (!isFunction(client.put)) {
      setHttpMember(
        client,
        "put",
        (url, body = undefined, options = {}) =>
          requestFn(
            url,
            createHttpJsonOptions("PUT", body, options)
          )
      );
    }

    if (!isFunction(client.patch)) {
      setHttpMember(
        client,
        "patch",
        (url, body = undefined, options = {}) =>
          requestFn(
            url,
            createHttpJsonOptions("PATCH", body, options)
          )
      );
    }

    if (!isFunction(client.delete)) {
      setHttpMember(
        client,
        "delete",
        (url, options = {}) =>
          requestFn(
            url,
            {
              ...options,
              method: "DELETE",
            }
          )
      );
    }

    if (!isFunction(client.del)) {
      setHttpMember(
        client,
        "del",
        (url, options = {}) =>
          client.delete(url, options)
      );
    }

    if (!isFunction(client.login)) {
      setHttpMember(
        client,
        "login",
        (body = {}, options = {}) =>
          client.post(
            getAuthEndpoint("login", "/api/auth/login"),
            body,
            {
              public: true,
              auth: false,
              skipAuth: true,
              ...ensureObject(options),
            }
          )
      );
    }

    if (!isFunction(client.refresh)) {
      setHttpMember(
        client,
        "refresh",
        (body = {}, options = {}) =>
          client.post(
            getAuthEndpoint("refresh", "/api/auth/refresh"),
            body,
            {
              public: true,
              auth: false,
              skipAuth: true,
              ...ensureObject(options),
            }
          )
      );
    }

    if (!isFunction(client.me)) {
      setHttpMember(
        client,
        "me",
        (options = {}) =>
          client.get(
            getAuthEndpoint("me", "/api/auth/me"),
            {
              auth: true,
              noCache: true,
              ...ensureObject(options),
            }
          )
      );
    }

    if (!isFunction(client.logout)) {
      setHttpMember(
        client,
        "logout",
        (body = {}, options = {}) =>
          client.post(
            getAuthEndpoint("logout", "/api/auth/logout"),
            body,
            {
              auth: true,
              noCache: true,
              ...ensureObject(options),
            }
          )
      );
    }

    if (!isFunction(client.getSnapshot)) {
      setHttpMember(
        client,
        "getSnapshot",
        () => ({
          version:
            safeText(
              client.version ||
                client.HTTP_VERSION ||
                client.CORE_HTTP_VERSION,
              "core-http-bridge"
            ),

          installed: true,

          hasRequest: isFunction(client.request),
          hasGet: isFunction(client.get),
          hasPost: isFunction(client.post),
          hasMe: isFunction(client.me),

          source: "core:index:http-bridge",
          at: safeIsoDate(),
        })
      );
    }

    if (!isFunction(client.snapshot)) {
      setHttpMember(
        client,
        "snapshot",
        client.getSnapshot
      );
    }

    return client;
  }

  function callHttpInstaller(installer, context = {}) {
    if (!isFunction(installer)) {
      return null;
    }

    const attempts = [
      () => installer(api, context),
      () => installer(context),
      () => installer({
        AppCore: api,
        core: api,
        ...context,
      }),
      () => installer(api),
    ];

    for (const attempt of attempts) {
      try {
        const result = attempt();

        if (result) {
          return result;
        }
      } catch {}
    }

    return null;
  }

  function resolveHttpCandidate(context = {}) {
    const installers = [
      getHttpExport("installHttp"),
      getHttpExport("installCoreHttp"),
      getHttpExport("install"),
    ].filter(isFunction);

    const defaultExport = getDefaultHttpExport();

    if (isFunction(defaultExport)) {
      installers.push(defaultExport);
    }

    for (const installer of installers) {
      const installed =
        callHttpInstaller(installer, context);

      if (installed) {
        return installed;
      }

      const fromApi =
        getBridgeModule("Http") ||
        getBridgeModule("http");

      if (fromApi) {
        return fromApi;
      }
    }

    return (
      getHttpExport("Http") ||
      getHttpExport("http") ||
      getHttpExport("apiClient") ||
      getHttpExport("client") ||
      (
        defaultExport &&
        typeof defaultExport === "object"
          ? defaultExport
          : null
      )
    );
  }

  function registerHttpAliases(client = null) {
    if (!client) {
      return false;
    }

    const aliases = [
      "Http",
      "http",
      "ApiClient",
      "apiClient",
    ];

    let changed = false;

    for (const alias of aliases) {
      try {
        const current = registry.modules.get(alias);

        if (current === client) {
          continue;
        }

        registry.modules.set(alias, client);
        changed = true;
      } catch {}
    }

    return changed || true;
  }

  function ensureServicesBag() {
    try {
      if (
        !api.services ||
        typeof api.services !== "object"
      ) {
        api.services = {};
      }

      return api.services;
    } catch {
      return null;
    }
  }

  function installHttpBridge(reason = "core:http:install", options = {}) {
    const opts = ensureObject(options);

    if (
      httpBridgeInstalled &&
      httpBridge &&
      opts.force !== true
    ) {
      registerHttpAliases(httpBridge);

      return httpBridge;
    }

    const context = {
      AppCore: api,
      core: api,

      config,
      state,
      dom,

      events,
      storage,
      cleanup,
      modules,
      hooks,
      utils,

      request: requestBridge || request,
      baseRequest: request,

      apiClient: apiClientBridge || apiClient,
      baseApiClient: apiClient,

      getState,
      setState,
      patchState,

      setError,
      getAuthHeader,

      setToken,
      setUser,
      applySession,
      clearSession,

      source: "core:index",
      reason,
    };

    const candidate =
      resolveHttpCandidate(context);

    const client =
      createHttpCompatClient(
        candidate ||
          httpBridge ||
          apiClientBridge ||
          apiClient
      );

    const previousHttpBridge = httpBridge;

    httpBridge = client;
    apiClientBridge = client;
    httpBridgeInstalled = true;

    if (isFunction(client.request)) {
      try {
        requestBridge = client.request.bind(client);
      } catch {
        requestBridge = client.request;
      }
    }

    registerHttpAliases(client);

    const services = ensureServicesBag();

    if (services) {
      try {
        services.http = client;
        services.Http = client;
        services.api = client;
        services.apiClient = client;
      } catch {}
    }

    try {
      api.apiClient = client;
    } catch {}

    try {
      api.http = client;
      api.Http = client;
    } catch {}

    if (
      !httpReadyEmitted ||
      previousHttpBridge !== client ||
      opts.force === true
    ) {
      httpReadyEmitted = true;

      safeEmit(
        EVENTS.httpReady,
        {
          installed: true,
          reason,

          hasRequest: isFunction(client.request),
          hasGet: isFunction(client.get),
          hasPost: isFunction(client.post),
          hasMe: isFunction(client.me),

          source: "core:index",
        }
      );
    }

    return client;
  }

  function getHttpClient() {
    return (
      httpBridge ||
      getBridgeModule("Http") ||
      getBridgeModule("http") ||
      apiClientBridge ||
      apiClient
    );
  }

  function getActiveRequest() {
    const client = getHttpClient();

    if (isFunction(client?.request)) {
      try {
        return client.request.bind(client);
      } catch {
        return client.request;
      }
    }

    return requestBridge || request;
  }

  function getActiveApiClient() {
    return getHttpClient();
  }

  /* =======================================================
     READY
  ======================================================= */

  function ready(fn) {
    if (!isFunction(fn)) {
      return () => {};
    }

    if (!isBrowser()) {
      try {
        fn();
      } catch (error) {
        safeError("ready() server callback error:", error);
      }

      return () => {};
    }

    if (!isDocumentReady()) {
      let disposed = false;

      const handler = () => {
        if (disposed) {
          return;
        }

        disposed = true;
        readyCallbacksFlushed = true;

        try {
          fn();
        } catch (error) {
          safeError("ready() callback error:", error);
        }
      };

      try {
        document.addEventListener(
          "DOMContentLoaded",
          handler,
          {
            once: true,
          }
        );

        return () => {
          disposed = true;

          try {
            document.removeEventListener("DOMContentLoaded", handler);
          } catch {}
        };
      } catch {
        return () => {};
      }
    }

    try {
      readyCallbacksFlushed = true;
      fn();
    } catch (error) {
      safeError("ready() callback error:", error);
    }

    return () => {};
  }

  /* =======================================================
     INIT HELPERS
  ======================================================= */

  function markCoreBooting(cycleId) {
    setState(
      {
        booting: true,
        ready: false,
        initialized: false,
        coreInitializing: true,
        coreInitCycle: cycleId,
        coreVersion: CORE_VERSION,
      },
      {
        source: "core:init:booting",
      }
    );
  }

  function markCoreReady(cycleId) {
    setState(
      {
        initialized: true,
        booting: false,
        ready: true,
        coreInitializing: false,
        coreReady: true,
        coreInitCycle: cycleId,
        coreVersion: CORE_VERSION,
        coreReadyAt: safeIsoDate(),
      },
      {
        source: "core:init:ready",
      }
    );
  }

  function markCoreError(error, cycleId) {
    setState(
      {
        initialized: false,
        ready: false,
        booting: false,
        coreInitializing: false,
        coreReady: false,
        coreInitCycle: cycleId,
        coreVersion: CORE_VERSION,
        coreErrorAt: safeIsoDate(),
      },
      {
        source: "core:init:error",
      }
    );

    setError(error);
  }

  function safeCacheDom() {
    try {
      cacheDom({
        dom,
        utils,
        events,
      });

      return true;
    } catch (error) {
      safeWarn("cacheDom() falló.", error);
      return false;
    }
  }

  function safeValidateRequiredDom() {
    try {
      validateRequiredDom({
        dom,
        utils,
        events,
      });

      return true;
    } catch (error) {
      safeWarn("validateRequiredDom() falló.", error);
      return false;
    }
  }

  function safeLoadPreferences() {
    try {
      loadPreferences({
        state,
        storage,
        dom,
        events,
      });

      return true;
    } catch (error) {
      safeWarn("loadPreferences() falló.", error);
      return false;
    }
  }

  function safeLoadSession() {
    try {
      loadSession({
        state,
        storage,
        dom,
        events,
      });

      return true;
    } catch (error) {
      safeWarn("loadSession() falló.", error);
      return false;
    }
  }

  function safeSyncBaseUI() {
    try {
      syncBaseUI({
        setDocumentTitle,
        syncUserUI,
      });

      return true;
    } catch (error) {
      safeWarn("syncBaseUI() falló.", error);
      return false;
    }
  }

  function safeBindNetworkEvents() {
    if (networkEventsBound) {
      return true;
    }

    if (config?.featureFlags?.enableNetworkEvents === false) {
      return false;
    }

    try {
      bindNetworkEvents({
        state,
        events,
        cleanup,
        utils,
      });

      networkEventsBound = true;

      return true;
    } catch (error) {
      safeWarn("bindNetworkEvents() falló.", error);
      return false;
    }
  }

  /* =======================================================
     INIT
  ======================================================= */

  async function doInit() {
    const cycleId = ++initCycle;

    try {
      markCoreBooting(cycleId);

      installHttpBridge("core:init:before-hooks");

      safeEmit(
        EVENTS.coreInitStart,
        {
          cycleId,
          version: CORE_VERSION,

          state:
            clonePublicState({
              safe: true,
            }),

          source: CORE_SOURCE,
        }
      );

      await runInitHooks(
        "beforeInit",
        {
          state,
          dom,
          config,
          events,
          utils,
          storage,
          cleanup,
          modules,
          hooks,

          request: getActiveRequest(),
          apiClient: getActiveApiClient(),
          http: getHttpClient(),
          Http: getHttpClient(),

          cycleId,
          version: CORE_VERSION,
        }
      );

      safeCacheDom();
      safeValidateRequiredDom();

      safeLoadPreferences();
      safeLoadSession();

      syncDerivedAuthState();

      safeSyncBaseUI();
      safeBindNetworkEvents();

      initialized = true;

      markCoreReady(cycleId);

      await runInitHooks(
        "afterInit",
        {
          state,
          dom,
          config,
          events,
          utils,
          storage,
          cleanup,
          modules,
          hooks,

          request: getActiveRequest(),
          apiClient: getActiveApiClient(),
          http: getHttpClient(),
          Http: getHttpClient(),

          cycleId,
          version: CORE_VERSION,
        }
      );

      safeEmit(
        EVENTS.coreReady,
        {
          cycleId,
          version: CORE_VERSION,

          state:
            clonePublicState({
              safe: true,
            }),

          source: CORE_SOURCE,
        }
      );

      safeLog(
        "Core ready.",
        {
          cycleId,
          authenticated: Boolean(state.authenticated),
          hasToken: Boolean(state.hasToken),
          route: state.route || "/",
          publicPath: redactTokenInText(state.publicPath || "/"),
          lang: state.lang || DEFAULT_LANG,
          theme: state.theme || DEFAULT_THEME,
          hasHttp: Boolean(getHttpClient()),
        }
      );

      return api;
    } catch (error) {
      initialized = false;

      markCoreError(error, cycleId);

      safeEmit(
        EVENTS.coreInitError,
        {
          cycleId,
          version: CORE_VERSION,
          error: sanitizeErrorForSnapshot(error),
          source: CORE_SOURCE,
        }
      );

      throw error;
    } finally {
      initPromise = null;
    }
  }

  async function init(options = {}) {
    const opts = ensureObject(options);

    if (
      !opts.force &&
      (
        initialized ||
        state.initialized
      )
    ) {
      syncDerivedAuthState();
      installHttpBridge("core:init:already-initialized");

      return api;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = doInit();

    return initPromise;
  }

  function rebootCore(options = {}) {
    initialized = false;
    initPromise = null;
    networkEventsBound = false;
    httpBridgeInstalled = false;
    httpReadyEmitted = false;

    setState(
      {
        initialized: false,
        ready: false,
        booting: false,
        coreReady: false,
        coreInitializing: false,
      },
      {
        source: "core:reboot",
      }
    );

    safeEmit(
      EVENTS.coreReboot,
      {
        at: safeIsoDate(),
        source: CORE_SOURCE,
      }
    );

    return init({
      ...ensureObject(options),
      force: true,
    });
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getSnapshot(options = {}) {
    syncDerivedAuthState();

    const opts = ensureObject(options);

    return {
      appName: getAppName(),
      version: CORE_VERSION,
      debug: getDebugEnabled(),

      initialized: Boolean(initialized || state.initialized),
      initInFlight: Boolean(initPromise),
      initCycle,
      networkEventsBound: Boolean(networkEventsBound),
      readyCallbacksFlushed: Boolean(readyCallbacksFlushed),

      state: {
        initialized: Boolean(state.initialized),
        ready: Boolean(state.ready),
        booting: Boolean(state.booting),
        loading: Boolean(state.loading),

        authenticated: Boolean(state.authenticated),
        hasToken: Boolean(state.hasToken),

        role: state.role || null,
        username: state.username || null,
        currentResolvedUsername: state.currentResolvedUsername || null,

        route: redactTokenInText(state.route || "/"),
        publicPath: redactTokenInText(state.publicPath || "/"),

        theme: state.theme || DEFAULT_THEME,
        lang: state.lang || DEFAULT_LANG,

        hasError: Boolean(state.error || state.hasError),
      },

      dom: {
        hasViewContainer: Boolean(dom.viewContainer),
        hasSidebar: Boolean(dom.sidebar),
        hasTopbar: Boolean(dom.topbar),
        hasLoader: Boolean(dom.loader),
        hasShell: Boolean(dom.appShell || dom.shell),
      },

      registry: {
        moduleCount: registry.modules?.size || 0,

        modules:
          Array.from(
            registry.modules?.keys?.() || []
          ),

        scopeCount: registry.scopes?.size || 0,

        hookCounts:
          Object.fromEntries(
            Object.entries(registry.hooks || {}).map(
              ([key, value]) => [
                key,
                Array.isArray(value)
                  ? value.length
                  : 0,
              ]
            )
          ),
      },

      bridges: {
        toast: Boolean(showToastBridge),

        Router: Boolean(getBridgeModule("Router")),
        Auth: Boolean(getBridgeModule("Auth")),
        Store: Boolean(getBridgeModule("Store")),

        Http: Boolean(getHttpClient()),
        http: Boolean(getHttpClient()),
        apiClient: Boolean(getActiveApiClient()),

        httpBridgeInstalled: Boolean(httpBridgeInstalled),
        httpReadyEmitted: Boolean(httpReadyEmitted),
      },

      events:
        opts.deep === true
          ? getSnapshotFrom(events)
          : null,

      cleanup:
        opts.deep === true
          ? getSnapshotFrom(cleanup)
          : null,

      storage:
        opts.deep === true
          ? getSnapshotFrom(storage)
          : null,

      modules:
        opts.deep === true
          ? getSnapshotFrom(modules)
          : null,

      hooks:
        opts.deep === true
          ? getSnapshotFrom(hooks)
          : null,

      request:
        opts.deep === true
          ? getSnapshotFrom(getActiveRequest())
          : null,

      apiClient:
        opts.deep === true
          ? getSnapshotFrom(getActiveApiClient())
          : null,

      http:
        opts.deep === true
          ? getSnapshotFrom(getHttpClient())
          : null,

      at: safeIsoDate(),
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    CORE_VERSION,
    version: CORE_VERSION,

    config,
    state,
    dom,

    registry,

    utils,
    storage,
    events,
    cleanup,
    modules,
    hooks,

    services: {},

    init,
    rebootCore,
    ready,

    getState,
    setState,
    patchState,

    isAuthenticated,
    getCurrentUser,
    getCurrentRole,
    hasRole,
    getAuthHeader,

    setRoute,
    setPublicPath,

    setUser,
    setToken,
    applySession,
    clearSession,

    setTheme,
    setLang,
    setSidebarOpen,
    setLoading,
    setError,

    setDocumentTitle,
    clearDynamicContainers,
    syncUserUI,

    setShowToast,
    showToast,

    installHttpBridge,
    getHttpClient,
    getActiveRequest,
    getActiveApiClient,

    getSnapshot,
    getDebugSnapshot: getSnapshot,

    getUserDisplayName,
    getUserUsername,
    getUserAvatarUrl,
    normalizeUser,
  };

  try {
    Object.defineProperties(api, {
      request: {
        enumerable: true,
        configurable: false,
        get() {
          return getActiveRequest();
        },
        set(value) {
          if (isFunction(value)) {
            requestBridge = value;
          }
        },
      },

      apiClient: {
        enumerable: true,
        configurable: false,
        get() {
          return getActiveApiClient();
        },
        set(value) {
          if (value) {
            const client = createHttpCompatClient(value);

            httpBridge = client;
            apiClientBridge = client;
            httpBridgeInstalled = true;

            if (isFunction(client.request)) {
              try {
                requestBridge = client.request.bind(client);
              } catch {
                requestBridge = client.request;
              }
            }

            registerHttpAliases(client);
          }
        },
      },

      Http: {
        enumerable: false,
        configurable: false,
        get() {
          return getHttpClient();
        },
        set(value) {
          if (value) {
            const client = createHttpCompatClient(value);

            httpBridge = client;
            apiClientBridge = client;
            httpBridgeInstalled = true;

            registerHttpAliases(client);
          }
        },
      },

      http: {
        enumerable: false,
        configurable: false,
        get() {
          return getHttpClient();
        },
        set(value) {
          if (value) {
            const client = createHttpCompatClient(value);

            httpBridge = client;
            apiClientBridge = client;
            httpBridgeInstalled = true;

            registerHttpAliases(client);
          }
        },
      },

      Router: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridgeModule("Router");
        },
        set(value) {
          registerBridgeModule("Router", value);
        },
      },

      router: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridgeModule("router");
        },
        set(value) {
          registerBridgeModule("router", value);
        },
      },

      Auth: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridgeModule("Auth");
        },
        set(value) {
          registerBridgeModule("Auth", value);
        },
      },

      auth: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridgeModule("auth");
        },
        set(value) {
          registerBridgeModule("auth", value);
        },
      },

      Store: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridgeModule("Store");
        },
        set(value) {
          registerBridgeModule("Store", value);
        },
      },

      store: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridgeModule("store");
        },
        set(value) {
          registerBridgeModule("store", value);
        },
      },
    });
  } catch {}

  try {
    installHttpBridge("core:bootstrap");
  } catch (error) {
    safeWarn("installHttpBridge() falló durante bootstrap.", error);
  }

  try {
    if (isBrowser()) {
      window.__ONION_CORE__ = api;
      window.AppCore = window.AppCore || api;
    }
  } catch {}

  try {
    return Object.freeze(api);
  } catch {
    return api;
  }
})();

export default AppCore;

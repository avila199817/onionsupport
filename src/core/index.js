/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

   CORE SINGLETON · CLEAN KERNEL
   - AppCore único
   - State / Events / Storage / Cleanup / Modules / Hooks
   - request.js = motor HTTP base
   - http.js = facade HTTP única
   - Auth estricta: token + user activo
   - Token sin user conserva hasToken para /me, pero NO autentica
   - User sin token NO autentica
   - Bridges Router/Auth/Store/Http sin event storm
   - Snapshots sin secretos
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
  setState as stateSetState,
  setStateBase as stateSetStateBase,
  getState as stateGetState,
  getStateBase as stateGetStateBase,
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
  unbindNetworkEvents,
  getNetworkSnapshot,
} from "./network.js";

export const AppCore = (() => {
  "use strict";

  /* =======================================================
     CONSTANTS
  ======================================================= */

  const VERSION = "18.0.0-clean-core";
  const SOURCE = "core";

  const DEFAULT_APP_NAME = "Onion Support";
  const DEFAULT_STORAGE_PREFIX = "onion";
  const DEFAULT_LANG = "es";
  const DEFAULT_THEME = "dark";

  const EVENTS = Object.freeze({
    initStart: "app:core:init:start",
    ready: "app:core:ready",
    initError: "app:core:init:error",
    reboot: "app:core:reboot",

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

  const SENSITIVE_KEYS = Object.freeze([
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
    "secret",
  ]);

  const TOKEN_KEYS = Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",
    "bearer",
    "idToken",
    "id_token",
  ]);

  const REFRESH_TOKEN_KEYS = Object.freeze([
    "refreshToken",
    "refresh_token",
  ]);

  const TEMP_TOKEN_KEYS = Object.freeze([
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "challengeToken",
    "challenge_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "otpToken",
    "otp_token",
  ]);

  const USER_KEYS = Object.freeze([
    "user",
    "usuario",
    "me",
    "account",
    "profile",
    "currentUser",
    "current_user",
    "sessionUser",
    "authUser",
  ]);

  const USER_ID_KEYS = Object.freeze([
    "id",
    "userId",
    "user_id",
    "_id",
    "uid",
    "uuid",
    "sub",
    "username",
    "userName",
    "user_name",
    "email",
    "mail",
    "phone",
    "telefono",
    "mobile",
    "displayName",
    "name",
    "nombre",
  ]);

  const SESSION_ID_KEYS = Object.freeze([
    "sessionId",
    "session_id",
    "sid",
  ]);

  const SESSION_USER_ID_KEYS = Object.freeze([
    "sessionUserId",
    "session_user_id",
    "userId",
    "user_id",
    "uid",
    "sub",
  ]);

  const NESTED_KEYS = Object.freeze([
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "authData",
    "session",
    "sessionData",
    "account",
    "profile",
    "me",
    "user",
    "usuario",
  ]);

  const BRIDGE_CANONICAL = Object.freeze({
    Router: "Router",
    router: "Router",

    Auth: "Auth",
    auth: "Auth",

    Store: "Store",
    store: "Store",

    Http: "Http",
    http: "Http",
    ApiClient: "Http",
    apiClient: "Http",
    api: "Http",
  });

  const BRIDGE_ALIASES = Object.freeze({
    Router: Object.freeze(["Router", "router"]),
    Auth: Object.freeze(["Auth", "auth"]),
    Store: Object.freeze(["Store", "store"]),
    Http: Object.freeze(["Http", "http", "ApiClient", "apiClient", "api"]),
  });

  /* =======================================================
     RUNTIME
  ======================================================= */

  let initialized = false;
  let initPromise = null;
  let initCycle = 0;

  let networkBound = false;
  let readyCallbacksFlushed = false;

  let showToastBridge = null;

  let requestBridge = null;
  let apiClientBridge = null;
  let httpBridge = null;
  let httpInstalled = false;
  let httpReadyEmitted = false;

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

  /* =======================================================
     BASICS
  ======================================================= */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isFn(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function anyObject(value) {
    return value !== null && typeof value === "object";
  }

  function object(value) {
    return isObject(value) ? value : {};
  }

  function array(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return [...value];
    if (value === null || value === undefined) return [];
    return [value];
  }

  function text(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const output = String(value).trim();
    return output || fallback;
  }

  function lower(value, fallback = "") {
    return text(value, fallback).toLowerCase();
  }

  function number(value, fallback = 0) {
    const output = Number(value);
    return Number.isFinite(output) ? output : fallback;
  }

  function bool(value, fallback = false) {
    if (value === true || value === false) return value;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    const clean = lower(value, "");

    if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(clean)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled", "inactive"].includes(clean)) {
      return false;
    }

    return Boolean(fallback);
  }

  function unique(values = []) {
    return [
      ...new Set(
        array(values)
          .flat(Infinity)
          .map((item) => text(item, ""))
          .filter(Boolean)
      ),
    ];
  }

  function now() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function iso(ms = now()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function hasOwn(obj, key) {
    try {
      return Object.prototype.hasOwnProperty.call(obj, key);
    } catch {
      return false;
    }
  }

  function clone(value, fallback = null) {
    try {
      return safeClone(value, fallback);
    } catch {}

    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch {}

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function first(...values) {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (isObject(value) && Object.keys(value).length === 0) continue;

      return value;
    }

    return null;
  }

  function appName() {
    return text(config?.appName || config?.name, DEFAULT_APP_NAME);
  }

  function debugEnabled() {
    return Boolean(
      config?.debug ||
        config?.dev ||
        config?.environment === "development" ||
        config?.env === "development"
    );
  }

  function log(...args) {
    if (!debugEnabled()) return;

    try {
      console.log(`[${appName()}]`, ...args);
    } catch {}
  }

  function warn(...args) {
    if (!debugEnabled()) return;

    try {
      console.warn(`[${appName()}]`, ...args);
    } catch {}
  }

  function error(...args) {
    try {
      console.error(`[${appName()}]`, ...args);
    } catch {}
  }

  function safeFactory(factory, fallback, ...args) {
    try {
      if (isFn(factory)) {
        const value = factory(...args);

        if (value) return value;
      }
    } catch {}

    return isFn(fallback) ? fallback() : fallback;
  }

  /* =======================================================
     REDACTION
  ======================================================= */

  function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function redact(value = "") {
    let output = text(value, "");

    if (!output) return "";

    const params = [
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
      "otpToken",
      "otp_token",
    ];

    for (const name of params) {
      try {
        output = output.replace(
          new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }

    try {
      output = output
        .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
        .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
    } catch {}

    return output;
  }

  function sanitizeError(err = null) {
    if (!err) return null;

    const source = err?.reason || err?.error || err;

    return {
      name: text(source?.name, "Error"),
      message: redact(text(source?.message || source?.reason || source, "Error")),
      code: text(source?.code || source?.data?.code || source?.response?.data?.code || "", ""),
      status: number(source?.status || source?.statusCode || source?.response?.status, 0),
      timeout: Boolean(source?.timeout),
      aborted: Boolean(source?.aborted),
      at: iso(),
    };
  }

  function sanitizeState(input = {}) {
    const clean = clone(input, {}) || {};

    for (const key of SENSITIVE_KEYS) {
      if (key in clean) {
        clean[key] = clean[key] ? "***" : null;
      }
    }

    for (const key of [
      "route",
      "publicPath",
      "lastRoute",
      "lastPublicPath",
      "bootInitialUrl",
      "bootProtectedInitialUrl",
      "bootActivationInitialUrl",
      "bootResetConfirmInitialUrl",
      "lastRequestUrl",
    ]) {
      if (clean[key]) {
        clean[key] = redact(clean[key]);
      }
    }

    if (clean.error) clean.error = sanitizeError(clean.error);
    if (clean.lastError) clean.lastError = sanitizeError(clean.lastError);

    return clean;
  }

  function publicUser(user = null) {
    if (!isObject(user)) return null;

    return {
      id: user.id || user.userId || user.user_id || user.uid || null,
      userId: user.userId || user.user_id || user.id || user.uid || null,
      username: user.username || user.userName || user.user_name || user.slug || null,
      displayName: user.displayName || user.name || user.nombre || null,
      role: user.role || user.rol || null,
      hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
    };
  }

  function snapshotFrom(ref, options = {}) {
    if (!ref) return null;

    try {
      if (isFn(ref.getSnapshot)) return ref.getSnapshot(options);
    } catch {}

    try {
      if (isFn(ref.getDebugSnapshot)) return ref.getDebugSnapshot(options);
    } catch {}

    try {
      if (isFn(ref.snapshot)) return ref.snapshot(options);
    } catch {}

    return null;
  }

  /* =======================================================
     FALLBACK EVENTS
  ======================================================= */

  function fallbackEvents() {
    const map = new Map();

    function setFor(name) {
      const key = text(name, "");

      if (!key) return null;
      if (!map.has(key)) map.set(key, new Set());

      return map.get(key);
    }

    function on(name, handler) {
      const set = setFor(name);

      if (!set || !isFn(handler)) return () => false;

      set.add(handler);

      return () => off(name, handler);
    }

    function once(name, handler) {
      if (!isFn(handler)) return () => false;

      let disposed = false;

      const dispose = on(name, (...args) => {
        if (disposed) return;

        disposed = true;
        dispose();

        try {
          handler(...args);
        } catch (err) {
          warn("event once handler error", name, err);
        }
      });

      return dispose;
    }

    function off(name, handler = null) {
      const key = text(name, "");

      if (!key) return false;

      if (!handler) {
        map.delete(key);
        return true;
      }

      map.get(key)?.delete(handler);

      return true;
    }

    function emit(name, payload = {}) {
      const key = text(name, "");

      if (!key) return false;

      const handlers = [...(map.get(key) || [])];
      const wildcard = [...(map.get("*") || [])];

      const event = {
        type: key,
        detail: payload,
        payload,
      };

      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          warn("event handler error", key, err);
        }
      }

      for (const handler of wildcard) {
        try {
          handler(key, payload, event);
        } catch (err) {
          warn("event wildcard handler error", key, err);
        }
      }

      return handlers.length + wildcard.length > 0;
    }

    function clear(name = "") {
      const key = text(name, "");

      if (key) map.delete(key);
      else map.clear();

      return true;
    }

    function getSnapshot() {
      return {
        fallback: true,
        names: [...map.keys()],
        listenerCount: [...map.values()].reduce((sum, set) => sum + set.size, 0),
      };
    }

    return {
      on,
      once,
      off,
      emit,
      dispatch: emit,
      trigger: emit,
      clear,
      removeAllListeners: clear,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     FALLBACK STORAGE
  ======================================================= */

  function fallbackStorage() {
    const memory = new Map();
    const prefix = text(config?.storagePrefix || config?.appKey, DEFAULT_STORAGE_PREFIX);

    function key(name = "") {
      const clean = text(name, "");

      if (!clean) return `${prefix}:`;

      if (
        clean.startsWith(`${prefix}:`) ||
        clean.startsWith(`${prefix}.`) ||
        clean.startsWith(`${prefix}_`)
      ) {
        return clean;
      }

      return `${prefix}:${clean}`;
    }

    function web(kind = "localStorage") {
      if (!isBrowser()) return null;

      try {
        return window?.[kind] || null;
      } catch {
        return null;
      }
    }

    function getRaw(name, fallback = null) {
      const finalKey = key(name);

      try {
        const local = web("localStorage")?.getItem?.(finalKey);

        if (local !== null && local !== undefined) return local;
      } catch {}

      try {
        const session = web("sessionStorage")?.getItem?.(finalKey);

        if (session !== null && session !== undefined) return session;
      } catch {}

      return memory.has(finalKey) ? memory.get(finalKey) : fallback;
    }

    function setRaw(name, value, options = {}) {
      const finalKey = key(name);

      if (value === null || value === undefined) return remove(name);

      const raw = String(value);

      memory.set(finalKey, raw);

      try {
        const target = options.session === true
          ? web("sessionStorage")
          : web("localStorage");

        target?.setItem?.(finalKey, raw);
      } catch {}

      return true;
    }

    function parse(raw, fallback = null) {
      if (raw === null || raw === undefined || raw === "") return fallback;

      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    }

    function get(name, fallback = null) {
      const raw = getRaw(name, undefined);

      if (raw === undefined) return fallback;

      const parsed = parse(raw, undefined);

      return parsed === undefined ? raw : parsed;
    }

    function set(name, value, options = {}) {
      try {
        return setRaw(name, JSON.stringify(value), options);
      } catch {
        return setRaw(name, String(value ?? ""), options);
      }
    }

    function remove(name) {
      const finalKey = key(name);

      memory.delete(finalKey);

      try {
        web("localStorage")?.removeItem?.(finalKey);
      } catch {}

      try {
        web("sessionStorage")?.removeItem?.(finalKey);
      } catch {}

      return true;
    }

    function getSnapshot() {
      return {
        fallback: true,
        prefix,
        memoryKeys: [...memory.keys()].map(redact),
      };
    }

    return {
      prefix,
      key,
      normalizeKey: key,

      getRaw,
      setRaw,

      get,
      set,

      getJson: (name, fallback = null) => parse(getRaw(name, null), fallback),
      setJson: set,

      remove,
      del: remove,
      delete: remove,

      has: (name) => getRaw(name, undefined) !== undefined,
      keys: () => [...memory.keys()],

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     FALLBACK CLEANUP
  ======================================================= */

  function fallbackCleanup() {
    function scope(name = "global") {
      const clean = text(name, "global");

      if (!registry.scopes.has(clean)) {
        registry.scopes.set(clean, new Set());
      }

      return clean;
    }

    function add(scopeName, disposer) {
      if (!isFn(disposer)) return () => false;

      const clean = scope(scopeName);
      registry.scopes.get(clean).add(disposer);

      return () => {
        try {
          disposer();
        } catch {}

        try {
          registry.scopes.get(clean)?.delete(disposer);
        } catch {}

        return true;
      };
    }

    function event(scopeName, target, eventName, handler, options = false) {
      if (!target || !eventName || !isFn(handler)) return () => false;

      try {
        target.addEventListener(eventName, handler, options);
        return add(scopeName, () => target.removeEventListener(eventName, handler, options));
      } catch {
        return () => false;
      }
    }

    function timeout(scopeName, fn, ms = 0) {
      if (!isFn(fn)) return () => false;

      try {
        const id = setTimeout(fn, Math.max(0, number(ms, 0)));
        return add(scopeName, () => clearTimeout(id));
      } catch {
        return () => false;
      }
    }

    function interval(scopeName, fn, ms = 0) {
      if (!isFn(fn)) return () => false;

      try {
        const id = setInterval(fn, Math.max(0, number(ms, 0)));
        return add(scopeName, () => clearInterval(id));
      } catch {
        return () => false;
      }
    }

    function run(scopeName = "global") {
      const clean = text(scopeName, "global");
      const disposers = registry.scopes.get(clean);

      if (!disposers) return true;

      for (const dispose of [...disposers]) {
        try {
          dispose();
        } catch {}
      }

      disposers.clear();

      return true;
    }

    function clear(scopeName = "") {
      const clean = text(scopeName, "");

      if (clean) return run(clean);

      for (const key of [...registry.scopes.keys()]) {
        run(key);
      }

      registry.scopes.clear();

      return true;
    }

    function getSnapshot() {
      return {
        fallback: true,
        scopes: [...registry.scopes.entries()].map(([name, set]) => ({
          name,
          count: set.size,
        })),
      };
    }

    return {
      scope: (name) => ({ name: scope(name) }),
      ensureScope: (name) => ({ name: scope(name) }),

      add,
      on: event,
      event,
      bus: event,

      timeout,
      timer: timeout,
      interval,

      run,
      dispose: run,
      clear,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     FALLBACK MODULES / HOOKS
  ======================================================= */

  function fallbackModules() {
    function get(name) {
      return registry.modules.get(text(name, "")) || null;
    }

    function register(name, value, options = {}) {
      const key = text(name, "");

      if (!key || !value) return false;

      const previous = registry.modules.get(key);

      if (previous && options.replace !== true && options.overwrite !== true) {
        return previous;
      }

      registry.modules.set(key, value);

      if (options.emit === true) {
        emit(
          previous ? EVENTS.moduleReplaced : EVENTS.moduleRegistered,
          {
            name: key,
            replaced: Boolean(previous),
            source: SOURCE,
          }
        );
      }

      return value;
    }

    function set(name, value, options = {}) {
      return register(name, value, {
        ...object(options),
        replace: options.replace !== false,
        overwrite: options.overwrite !== false,
      });
    }

    function remove(name) {
      return registry.modules.delete(text(name, ""));
    }

    function list() {
      return [...registry.modules.keys()];
    }

    function getSnapshot() {
      return {
        fallback: true,
        count: registry.modules.size,
        modules: list(),
      };
    }

    return {
      has: (name) => registry.modules.has(text(name, "")),
      get,

      register,
      set,
      upsert: set,

      remove,
      delete: remove,
      unregister: remove,

      list,
      names: list,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  function fallbackHooks() {
    function listFor(name) {
      const key = text(name, "");

      if (!key) return null;
      if (!Array.isArray(registry.hooks[key])) registry.hooks[key] = [];

      return registry.hooks[key];
    }

    function add(name, handler) {
      const list = listFor(name);

      if (!list || !isFn(handler)) return () => false;

      list.push(handler);

      return () => {
        const key = text(name, "");
        registry.hooks[key] = array(registry.hooks[key]).filter((item) => item !== handler);
        return true;
      };
    }

    async function run(name, payload = {}) {
      let current = payload;

      for (const hook of array(registry.hooks[text(name, "")])) {
        if (!isFn(hook)) continue;

        try {
          const next = await hook(current);

          if (next !== undefined) current = next;
        } catch (err) {
          warn("hook error", name, err);
        }
      }

      return current;
    }

    function clear(name = "") {
      const key = text(name, "");

      if (key) {
        registry.hooks[key] = [];
      } else {
        Object.keys(registry.hooks).forEach((hookName) => {
          registry.hooks[hookName] = [];
        });
      }

      return true;
    }

    function getSnapshot() {
      return Object.fromEntries(
        Object.entries(registry.hooks).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.length : 0,
        ])
      );
    }

    return {
      add,
      on: add,
      use: add,
      register: add,

      run,
      runSeries: run,

      get: (name) => array(registry.hooks[text(name, "")]),
      clear,

      getSnapshot,
      getDebugSnapshot: getSnapshot,
      snapshot: getSnapshot,
    };
  }

  /* =======================================================
     ROOT OBJECTS
  ======================================================= */

  const events = safeFactory(createEvents, fallbackEvents, {
    maxRecentEvents: config?.diagnostics?.maxRecentEvents,
  });

  const state = safeFactory(createInitialState, () => ({}), { config }) || {};
  const dom = safeFactory(createDomCache, () => ({})) || {};

  function emit(name, payload = {}) {
    const eventName = text(name, "");

    if (!eventName) return false;

    try {
      events.emit(eventName, payload);
      return true;
    } catch {
      return false;
    }
  }

  const utils = {
    qs(selector, scope = null) {
      if (!isBrowser()) return null;

      try {
        return (scope || document).querySelector(selector);
      } catch {
        return null;
      }
    },

    qsa(selector, scope = null) {
      if (!isBrowser()) return [];

      try {
        return [...((scope || document).querySelectorAll(selector) || [])];
      } catch {
        return [];
      }
    },

    byId(id = "") {
      if (!isBrowser()) return null;

      try {
        return document.getElementById(id);
      } catch {
        return null;
      }
    },

    on(target, eventName, handler, options = false) {
      if (!target || !eventName || !isFn(handler)) return () => false;

      try {
        target.addEventListener(eventName, handler, options);

        return () => {
          try {
            target.removeEventListener(eventName, handler, options);
            return true;
          } catch {
            return false;
          }
        };
      } catch {
        return () => false;
      }
    },

    off(target, eventName, handler, options = false) {
      try {
        target?.removeEventListener?.(eventName, handler, options);
      } catch {}
    },

    sleep(ms = 0) {
      return new Promise((resolve) => {
        try {
          setTimeout(resolve, Math.max(0, number(ms, 0)));
        } catch {
          resolve();
        }
      });
    },

    nextTick(fn) {
      return Promise.resolve().then(() => (isFn(fn) ? fn() : undefined));
    },

    afterPaint(fn) {
      if (!isFn(fn)) return;

      if (!isBrowser()) {
        try {
          fn();
        } catch {}
        return;
      }

      try {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try {
            fn();
          } catch {}
        }));
      } catch {
        setTimeout(() => {
          try {
            fn();
          } catch {}
        }, 0);
      }
    },

    log,
    warn,
    error,
    emit,

    safeClone: clone,
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

    redactTokenInText: redact,
    sanitizeErrorForSnapshot: sanitizeError,
    sanitizeStateForSnapshot: sanitizeState,

    safeText: text,
    safeLower: lower,
    safeBool: bool,
    safeNumber: number,
    safeArray: array,
    safeObject: object,

    isObject,
    isFunction: isFn,

    now,
    nowIso: iso,
  };

  const cleanup = safeFactory(createCleanup, fallbackCleanup, {
    registry,
    events,
    utils,
  });

  const storage = safeFactory(createStorage, fallbackStorage, {
    utils,
    events,
  });

  const modules = safeFactory(createModules, fallbackModules, {
    registry,
    events,
    utils,
  });

  const hooks = safeFactory(createHooks, fallbackHooks, {
    registry,
    events,
    utils,
  });

  /* =======================================================
     AUTH DERIVATION
  ======================================================= */

  function stripBearer(value = "") {
    return text(value, "").replace(/^Bearer\s+/i, "").trim();
  }

  function validToken(value = "") {
    const token = stripBearer(value);

    if (!token) return false;

    const badValues = new Set([
      "null",
      "undefined",
      "false",
      "true",
      "nan",
      "none",
      "[object object]",
      "{}",
      "[]",
    ]);

    if (badValues.has(token.toLowerCase())) return false;
    if (/[\s\r\n\t]/.test(token)) return false;

    try {
      return Boolean(hasValidToken(token));
    } catch {
      return true;
    }
  }

  function usableUser(value = null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    if (
      value.active === false ||
      value.enabled === false ||
      value.disabled === true ||
      value.deleted === true ||
      value.archived === true ||
      value.blocked === true ||
      value.suspended === true ||
      value.banned === true ||
      value.revoked === true
    ) {
      return false;
    }

    const status = lower(
      value.status ||
        value.estado ||
        value.state ||
        value.accountStatus ||
        "",
      ""
    );

    if (
      [
        "disabled",
        "inactive",
        "deleted",
        "archived",
        "blocked",
        "suspended",
        "banned",
        "revoked",
        "desactivado",
        "inactivo",
        "eliminado",
        "archivado",
        "bloqueado",
        "suspendido",
      ].includes(status)
    ) {
      return false;
    }

    return USER_ID_KEYS.some((key) => Boolean(text(value?.[key], "")));
  }

  function normalizeUserSafe(value = null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    try {
      const normalized = normalizeUser(value);

      if (usableUser(normalized)) return normalized;
    } catch {}

    return usableUser(value) ? value : null;
  }

  function roleOf(user = null, explicit = "") {
    const raw = lower(
      explicit ||
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
    )
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "");

    if (
      [
        "admin",
        "administrator",
        "administrador",
        "superadmin",
        "super_admin",
        "owner",
        "root",
      ].includes(raw)
    ) {
      return "admin";
    }

    return "user";
  }

  function tokenFrom(root = state) {
    const session = object(root.session);
    const sessionData = object(root.sessionData);

    for (const value of [
      ...TOKEN_KEYS.map((key) => root[key]),
      ...TOKEN_KEYS.map((key) => session[key]),
      ...TOKEN_KEYS.map((key) => sessionData[key]),
    ]) {
      if (validToken(value)) return stripBearer(value);
    }

    return null;
  }

  function userFrom(root = state) {
    const session = object(root.session);
    const sessionData = object(root.sessionData);

    for (const value of [
      ...USER_KEYS.map((key) => root[key]),
      ...USER_KEYS.map((key) => session[key]),
      ...USER_KEYS.map((key) => sessionData[key]),
    ]) {
      const user = normalizeUserSafe(value);

      if (user) return user;
    }

    return null;
  }

  function usernameOf(user = null) {
    return text(
      getUserUsername(user) ||
        user?.username ||
        user?.userName ||
        user?.user_name ||
        user?.usernameLower ||
        user?.username_lower ||
        user?.slug ||
        user?.email ||
        user?.mail ||
        user?.name ||
        "",
      ""
    ) || null;
  }

  function clearAuthFields(root = state) {
    Object.assign(root, {
      token: null,
      accessToken: null,
      access_token: null,

      user: null,
      currentUser: null,
      sessionUser: null,
      authUser: null,
      account: null,
      profile: null,

      authenticated: false,
      hasToken: false,

      role: null,
      rol: null,
      userRole: null,
      roles: [],

      username: null,
      currentResolvedUsername: null,
      resolvedUsername: null,

      isAdmin: false,
      isUser: false,
      isClient: false,
      isSupport: false,
      isManager: false,
    });

    return root;
  }

  function setTokenOnly(root = state, token = null) {
    Object.assign(root, {
      token,
      accessToken: token,
      access_token: token,

      user: null,
      currentUser: null,
      sessionUser: null,
      authUser: null,
      account: null,
      profile: null,

      authenticated: false,
      hasToken: Boolean(token),

      role: null,
      rol: null,
      userRole: null,
      roles: [],

      username: null,
      currentResolvedUsername: null,
      resolvedUsername: null,

      isAdmin: false,
      isUser: false,
      isClient: false,
      isSupport: false,
      isManager: false,
    });

    return root;
  }

  function syncAuth(options = {}) {
    if (options.forceUnauthenticated === true) {
      return clearAuthFields(state);
    }

    const token = tokenFrom(state);

    if (!token) {
      return clearAuthFields(state);
    }

    const user = userFrom(state);

    if (!user) {
      return setTokenOnly(state, token);
    }

    let authenticated = false;

    try {
      authenticated = Boolean(computeAuthenticated(user, token));
    } catch {
      authenticated = true;
    }

    if (!authenticated) {
      return setTokenOnly(state, token);
    }

    const role = roleOf(user, state.role);
    const roles = [role];

    Object.assign(state, {
      token,
      accessToken: token,
      access_token: token,

      user,
      currentUser: user,
      sessionUser: user,
      authUser: user,
      account: user,
      profile: user,

      authenticated: true,
      hasToken: true,

      role,
      rol: role,
      userRole: role,
      roles,

      username: usernameOf(user),

      currentResolvedUsername:
        sanitizeUsername(state.currentResolvedUsername || state.resolvedUsername || "") ||
        sanitizeUsername(usernameOf(user) || "") ||
        null,

      resolvedUsername: state.currentResolvedUsername || null,

      isAdmin: role === "admin",
      isUser: role === "user",
      isClient: role === "user",
      isSupport: false,
      isManager: false,
    });

    return state;
  }

  function marker(root = state) {
    return {
      authenticated: Boolean(root.authenticated),
      hasToken: Boolean(root.hasToken),
      userId: root.user?.userId || root.user?.id || null,
      username: root.username || null,
      role: root.role || null,
      route: root.route || "/",
      publicPath: root.publicPath || "/",
      lang: root.lang || DEFAULT_LANG,
      theme: root.theme || DEFAULT_THEME,
    };
  }

  function markerChanged(before = {}, after = {}, keys = []) {
    return keys.some((key) => before[key] !== after[key]);
  }

  function emitDerived(before = {}, after = {}, patch = {}, options = {}) {
    if (options.emit === false) return false;

    const source = text(options.source, "core:setState");
    const changedKeys = Object.keys(object(patch));

    if (options.emitState === true && changedKeys.length) {
      emit(EVENTS.stateChange, {
        changedKeys,
        state: sanitizeState(state),
        source,
      });
    }

    if (options.emitDerived !== true) return false;

    if (markerChanged(before, after, ["authenticated", "hasToken", "role"])) {
      emit(EVENTS.authChange, {
        authenticated: Boolean(after.authenticated),
        hasToken: Boolean(after.hasToken),
        role: after.role || null,
        username: after.username || null,
        source,
      });
    }

    if (markerChanged(before, after, ["userId", "username", "role"])) {
      emit(EVENTS.userChange, {
        authenticated: Boolean(after.authenticated),
        user: state.authenticated ? publicUser(state.user) : null,
        username: after.username || null,
        role: after.role || null,
        source,
      });
    }

    if (markerChanged(before, after, ["route"])) {
      emit(EVENTS.routeChange, {
        route: after.route || "/",
        previousRoute: before.route || "/",
        publicPath: after.publicPath || "/",
        source,
      });
    }

    if (markerChanged(before, after, ["publicPath"])) {
      emit(EVENTS.publicPathChange, {
        publicPath: after.publicPath || "/",
        previousPublicPath: before.publicPath || "/",
        route: after.route || "/",
        source,
      });
    }

    return true;
  }

  /* =======================================================
     STATE API
  ======================================================= */

  function applyBaseSetState(root, patch, options = {}) {
    const attempts = [
      () => stateSetState({ state: root, events, patch, options }),
      () => stateSetStateBase(root, patch, { ...options, events }),
    ];

    for (const attempt of attempts) {
      try {
        attempt();
        return true;
      } catch {}
    }

    Object.assign(root, patch);
    return false;
  }

  function getStateBaseCompat(root) {
    const attempts = [
      () => stateGetState(root),
      () => stateGetStateBase(root),
      () => stateGetState({ state: root }),
    ];

    for (const attempt of attempts) {
      try {
        const value = attempt();

        if (value) return value;
      } catch {}
    }

    return null;
  }

  function publicState(options = {}) {
    let output = null;

    try {
      output = cloneState(state);
    } catch {}

    if (!output) {
      output = clone(state, { ...state }) || { ...state };
    }

    return options.safe ? sanitizeState(output) : output;
  }

  function setState(patch = {}, options = {}) {
    const cleanPatch = isObject(patch) ? patch : {};
    const opts = object(options);

    const before = marker(state);

    applyBaseSetState(state, cleanPatch, opts);

    syncAuth({
      forceUnauthenticated: opts.forceUnauthenticated === true,
    });

    const after = marker(state);

    emitDerived(before, after, cleanPatch, opts);

    return publicState();
  }

  function getState(options = {}) {
    syncAuth();

    const output = getStateBaseCompat(state) || publicState();

    return options.safe ? sanitizeState(output) : output;
  }

  function patchState(patch = {}, options = {}) {
    return setState(patch, options);
  }

  function isAuthenticated() {
    syncAuth();
    return Boolean(state.authenticated);
  }

  function getCurrentUser() {
    syncAuth();
    return state.user || null;
  }

  function getCurrentRole() {
    syncAuth();
    return state.role || null;
  }

  function hasRole(roleOrRoles = []) {
    const roles = array(roleOrRoles).map((item) => roleOf({ role: item }));
    return roles.includes(getCurrentRole());
  }

  function getAuthHeader() {
    syncAuth();

    if (!state.token) return {};

    return {
      [text(config?.auth?.tokenHeader, "Authorization")]:
        `${text(config?.auth?.bearerPrefix, "Bearer")} ${state.token}`,
    };
  }

  /* =======================================================
     UI API
  ======================================================= */

  function setDocumentTitle(title = appName()) {
    const finalTitle = text(title, appName());

    try {
      return setDocumentTitleBase({
        dom,
        events,
        title: finalTitle,
      });
    } catch {}

    if (!isBrowser()) return false;

    try {
      document.title = finalTitle;
      return document.title;
    } catch {
      return false;
    }
  }

  function clearDynamicContainers(options = {}) {
    try {
      return clearDynamicContainersBase({
        dom,
        events,
        ...object(options),
      });
    } catch {
      return false;
    }
  }

  function syncUserUI(options = {}) {
    try {
      return syncUserUIBase({
        state,
        dom,
        events,
        ...object(options),
      });
    } catch (err) {
      warn("syncUserUI failed", err);
      return false;
    }
  }

  function setShowToast(fn) {
    if (!isFn(fn)) return false;

    showToastBridge = fn;

    emit(EVENTS.toastBridgeReady, {
      ready: true,
      at: iso(),
      source: SOURCE,
    });

    return true;
  }

  function showToast(message = "", type = "info", options = {}) {
    if (!isFn(showToastBridge)) return null;

    try {
      return showToastBridge(message, type, options);
    } catch (err) {
      warn("toast bridge failed", err);
      return null;
    }
  }

  /* =======================================================
     SESSION EXTRACTION
  ======================================================= */

  function collectObjects(value, depth = 0, seen = new WeakSet()) {
    if (depth > 8 || !value || typeof value !== "object") return [];

    try {
      if (seen.has(value)) return [];
      seen.add(value);
    } catch {}

    const output = [value];

    for (const key of NESTED_KEYS) {
      if (value[key] && typeof value[key] === "object") {
        output.push(...collectObjects(value[key], depth + 1, seen));
      }
    }

    if (value.response?.data && typeof value.response.data === "object") {
      output.push(...collectObjects(value.response.data, depth + 1, seen));
    }

    return output;
  }

  function pickToken(objects = [], keys = []) {
    for (const obj of array(objects)) {
      for (const key of keys) {
        if (validToken(obj?.[key])) return stripBearer(obj[key]);
      }
    }

    return null;
  }

  function pickUser(objects = []) {
    for (const obj of array(objects)) {
      for (const key of USER_KEYS) {
        const user = normalizeUserSafe(obj?.[key]);

        if (user) return user;
      }
    }

    for (const obj of array(objects)) {
      const user = normalizeUserSafe(obj);

      if (user) return user;
    }

    return null;
  }

  function pickText(objects = [], keys = []) {
    for (const obj of array(objects)) {
      for (const key of keys) {
        const value = text(obj?.[key], "");

        if (value) return value;
      }
    }

    return null;
  }

  function pickObject(objects = [], keys = []) {
    for (const obj of array(objects)) {
      for (const key of keys) {
        if (isObject(obj?.[key])) return obj[key];
      }
    }

    return null;
  }

  function extractSessionPayload(payload = {}) {
    const source = object(payload);
    const objects = collectObjects(source);

    return {
      raw: source,

      token: pickToken(objects, TOKEN_KEYS),
      refreshToken: pickToken(objects, REFRESH_TOKEN_KEYS),
      tempToken: pickToken(objects, TEMP_TOKEN_KEYS),

      user: pickUser(objects),

      session:
        pickObject(objects, ["session", "sessionData", "authSession", "auth_session"]) ||
        null,

      sessionId: pickText(objects, SESSION_ID_KEYS),
      sessionUserId: pickText(objects, SESSION_USER_ID_KEYS),

      route:
        source.route ||
        source.canonicalPath ||
        source.data?.route ||
        source.data?.canonicalPath ||
        null,

      publicPath:
        source.publicPath ||
        source.data?.publicPath ||
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
        options: object(options),
      });
    } catch {}

    const clean = normalizeCanonicalPath(route || "/");

    setState(
      {
        route: clean,
        canonicalPath: clean,
      },
      {
        source: "core:setRoute:fallback",
        emitDerived: true,
      }
    );

    return clean;
  }

  function setPublicPath(path = "/", options = {}) {
    try {
      return setPublicPathBase({
        state,
        storage,
        setState,
        events,
        path,
        options: object(options),
      });
    } catch {}

    const publicPath = normalizePath(path || "/");
    const route = normalizeCanonicalPath(publicPath);

    setState(
      {
        publicPath,
        route,
        canonicalPath: route,
      },
      {
        source: "core:setPublicPath:fallback",
        emitDerived: true,
      }
    );

    return publicPath;
  }

  function setUser(user = null, options = {}) {
    try {
      const output = setUserBase({
        state,
        storage,
        events,
        setState,
        syncUserUI,
        user,
        options: object(options),
      });

      syncAuth({
        forceUnauthenticated: !user && !state.token,
      });

      return output;
    } catch {}

    setState(
      {
        user: user ? normalizeUserSafe(user) : null,
      },
      {
        source: "core:setUser:fallback",
        forceUnauthenticated: !user && !state.token,
        emitDerived: true,
      }
    );

    return state.user;
  }

  function setToken(token = null, options = {}) {
    const cleanToken = validToken(token) ? stripBearer(token) : null;

    try {
      const output = setTokenBase({
        state,
        storage,
        events,
        setState,
        token: cleanToken,
        options: object(options),
      });

      syncAuth({
        forceUnauthenticated: !cleanToken,
      });

      return output;
    } catch {}

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

    return state.token;
  }

  function adaptSetter(value, key) {
    if (isObject(value) && hasOwn(value, key)) return value[key];
    return value;
  }

  function applySession(sessionPayload = {}, options = {}) {
    const opts = object(options);
    const extracted = extractSessionPayload(sessionPayload);

    const token =
      hasOwn(sessionPayload, "token") ||
      hasOwn(sessionPayload, "accessToken") ||
      hasOwn(sessionPayload, "access_token") ||
      extracted.token
        ? extracted.token
        : tokenFrom(state);

    const user =
      hasOwn(sessionPayload, "user") ||
      hasOwn(sessionPayload, "usuario") ||
      hasOwn(sessionPayload, "me") ||
      hasOwn(sessionPayload, "account") ||
      hasOwn(sessionPayload, "profile") ||
      extracted.user
        ? extracted.user
        : userFrom(state);

    let result = null;
    let baseOk = false;

    try {
      result = applySessionBase({
        state,
        storage,
        events,

        setUser: (value) =>
          setUser(adaptSetter(value, "user"), {
            source: "core:applySession:setUser",
          }),

        setToken: (value) =>
          setToken(adaptSetter(value, "token"), {
            source: "core:applySession:setToken",
          }),

        setState,

        token,
        user,

        refreshToken: extracted.refreshToken,
        tempToken: extracted.tempToken,

        session: extracted.session,
        sessionId: extracted.sessionId,
        sessionUserId: extracted.sessionUserId,

        route: extracted.route,
        publicPath: extracted.publicPath,

        options: opts,
      });

      baseOk = true;
    } catch {}

    if (!baseOk) {
      if (token !== undefined) {
        state.token = validToken(token) ? stripBearer(token) : null;
        state.accessToken = state.token;
        state.access_token = state.token;
      }

      if (user !== undefined) {
        state.user = normalizeUserSafe(user);
      }

      if (extracted.refreshToken) {
        state.refreshToken = extracted.refreshToken;
        state.refresh_token = extracted.refreshToken;
      }

      if (extracted.tempToken) {
        state.tempToken = extracted.tempToken;
        state.temp_token = extracted.tempToken;
      }

      if (extracted.session || extracted.sessionId || extracted.sessionUserId) {
        state.session = {
          ...object(extracted.session),

          sessionId:
            extracted.sessionId ||
            extracted.session?.sessionId ||
            extracted.session?.session_id ||
            null,

          session_id:
            extracted.sessionId ||
            extracted.session?.session_id ||
            extracted.session?.sessionId ||
            null,

          userId:
            extracted.sessionUserId ||
            extracted.session?.userId ||
            extracted.session?.user_id ||
            null,

          user_id:
            extracted.sessionUserId ||
            extracted.session?.user_id ||
            extracted.session?.userId ||
            null,
        };

        state.sessionData = state.session;
      }

      if (extracted.route) {
        setRoute(extracted.route, {
          source: "core:applySession:fallback-route",
        });
      }

      if (extracted.publicPath) {
        setPublicPath(extracted.publicPath, {
          source: "core:applySession:fallback-public-path",
        });
      }

      result = {
        token: state.token,
        user: state.user,
        session: state.session || null,
      };
    }

    syncAuth({
      forceUnauthenticated: token === null,
    });

    if (opts.emit === true || !baseOk) {
      emit(EVENTS.sessionApplied, {
        authenticated: Boolean(state.authenticated),
        hasToken: Boolean(state.hasToken),
        user: publicUser(state.user),
        role: state.role || null,
        source: text(opts.source, baseOk ? "core:applySession" : "core:applySession:fallback"),
      });
    }

    return result;
  }

  function clearSession(options = {}) {
    const opts = object(options);

    let result = null;
    let baseOk = false;

    try {
      result = clearSessionBase({
        state,
        storage,
        events,
        setState,
        syncUserUI,
        utils,
        options: opts,
      });

      baseOk = true;
    } catch {}

    clearAuthFields(state);

    state.refreshToken = null;
    state.refresh_token = null;
    state.idToken = null;
    state.id_token = null;
    state.tempToken = null;
    state.temp_token = null;
    state.session = null;
    state.sessionData = null;
    state.sessionId = null;
    state.sessionUserId = null;

    if (!baseOk) {
      setState(
        {},
        {
          source: "core:clearSession:fallback",
          forceUnauthenticated: true,
          emitDerived: true,
        }
      );

      result = true;
    }

    if (opts.emit === true || !baseOk) {
      emit(EVENTS.sessionCleared, {
        silent: Boolean(opts.silent),
        source: text(opts.source, baseOk ? "core:clearSession" : "core:clearSession:fallback"),
      });
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
    } catch {}

    const clean = lower(theme, DEFAULT_THEME) === "light" ? "light" : DEFAULT_THEME;

    setState(
      { theme: clean },
      { source: "core:setTheme:fallback" }
    );

    return clean;
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
    } catch {}

    const clean = lower(lang, DEFAULT_LANG);

    setState(
      { lang: clean },
      { source: "core:setLang:fallback" }
    );

    try {
      if (isBrowser()) document.documentElement.lang = clean;
    } catch {}

    emit("app:lang:change", {
      lang: clean,
      source: "core:setLang:fallback",
    });

    return clean;
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
    } catch {}

    const next = Boolean(value);

    setState(
      { sidebarOpen: next },
      { source: "core:setSidebarOpen:fallback" }
    );

    return next;
  }

  function setLoading(value) {
    try {
      return setLoadingBase({
        dom,
        events,
        setState,
        value,
      });
    } catch {}

    const next = Boolean(value);

    setState(
      { loading: next },
      { source: "core:setLoading:fallback" }
    );

    return next;
  }

  function setError(err = null) {
    try {
      return setErrorBase({
        events,
        setState,
        cloneError,
        error: err,
      });
    } catch {}

    const normalized = err ? cloneError(err) : null;

    setState(
      {
        error: normalized,
        lastError: normalized,
        hasError: Boolean(normalized),
      },
      { source: "core:setError:fallback" }
    );

    return normalized;
  }

  /* =======================================================
     REQUEST / HTTP
  ======================================================= */

  async function fallbackRequest(url, options = {}) {
    if (!isBrowser() || !isFn(fetch)) {
      throw new Error("Fetch API no disponible.");
    }

    const opts = { ...object(options) };
    const method = text(opts.method, "GET").toUpperCase();

    const headers = {
      Accept: "application/json",
      ...object(opts.headers),
    };

    const hasBody =
      opts.body !== undefined &&
      opts.body !== null &&
      method !== "GET" &&
      method !== "HEAD";

    let body = opts.body;

    if (
      hasBody &&
      typeof FormData !== "undefined" &&
      !(body instanceof FormData) &&
      typeof body !== "string"
    ) {
      headers["Content-Type"] =
        headers["Content-Type"] ||
        headers["content-type"] ||
        "application/json";

      body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      ...opts,
      method,
      headers,
      credentials: opts.credentials || "include",
      cache: opts.cache || "no-store",
      body: hasBody ? body : undefined,
    });

    const contentType = response.headers?.get?.("content-type") || "";

    let payload = null;

    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    } else {
      try {
        payload = await response.text();
      } catch {
        payload = "";
      }
    }

    if (!response.ok) {
      const err = new Error(
        text(
          payload?.message ||
            payload?.error?.message ||
            payload?.error ||
            response.statusText,
          `HTTP ${response.status}`
        )
      );

      err.status = response.status;
      err.response = response;
      err.data = payload;

      throw err;
    }

    return payload;
  }

  const baseRequest = safeFactory(createRequest, () => fallbackRequest, {
    state,
    events,
    setError,
    utils,
    registry,
    hooks,
  });

  function fallbackApiClient(req) {
    const call = isFn(req) ? req : fallbackRequest;

    return {
      request: call,

      get(url, options = {}) {
        return call(url, {
          ...options,
          method: "GET",
        });
      },

      post(url, body = undefined, options = {}) {
        return call(url, {
          ...options,
          method: "POST",
          body,
        });
      },

      put(url, body = undefined, options = {}) {
        return call(url, {
          ...options,
          method: "PUT",
          body,
        });
      },

      patch(url, body = undefined, options = {}) {
        return call(url, {
          ...options,
          method: "PATCH",
          body,
        });
      },

      delete(url, options = {}) {
        return call(url, {
          ...options,
          method: "DELETE",
        });
      },

      del(url, options = {}) {
        return this.delete(url, options);
      },
    };
  }

  const baseApiClient = safeFactory(
    createApiClient,
    () => fallbackApiClient(baseRequest),
    baseRequest
  );

  requestBridge = baseRequest;
  apiClientBridge = baseApiClient;

  function authEndpoint(name = "", fallback = "") {
    const endpointMap = object(config?.auth?.endpoints || config?.api?.endpoints);

    return (
      text(endpointMap[name], "") ||
      text(config?.auth?.[`${name}Endpoint`], "") ||
      text(config?.api?.[`${name}Endpoint`], "") ||
      fallback
    );
  }

  function setMember(target, key, value) {
    if (!target || !key || value === undefined || value === null) return false;

    try {
      if (target[key] === undefined || target[key] === null) {
        target[key] = value;
        return true;
      }
    } catch {}

    try {
      Object.defineProperty(target, key, {
        value,
        configurable: true,
        enumerable: false,
        writable: true,
      });

      return true;
    } catch {}

    return false;
  }

  function compatHttpClient(candidate = null) {
    const source =
      candidate &&
      (typeof candidate === "object" || typeof candidate === "function")
        ? candidate
        : {};

    let client = source;

    try {
      if (!Object.isExtensible(client) || Array.isArray(client)) {
        client = {};
      }
    } catch {
      client = {};
    }

    const requestFn = isFn(source.request)
      ? source.request.bind(source)
      : isFn(source)
        ? source
        : isFn(requestBridge)
          ? requestBridge
          : baseRequest;

    setMember(client, "request", requestFn);

    setMember(client, "get", client.get || ((url, options = {}) =>
      requestFn(url, {
        ...options,
        method: "GET",
      })
    ));

    setMember(client, "post", client.post || ((url, body = undefined, options = {}) =>
      requestFn(url, {
        ...options,
        method: "POST",
        body,
      })
    ));

    setMember(client, "put", client.put || ((url, body = undefined, options = {}) =>
      requestFn(url, {
        ...options,
        method: "PUT",
        body,
      })
    ));

    setMember(client, "patch", client.patch || ((url, body = undefined, options = {}) =>
      requestFn(url, {
        ...options,
        method: "PATCH",
        body,
      })
    ));

    setMember(client, "delete", client.delete || ((url, options = {}) =>
      requestFn(url, {
        ...options,
        method: "DELETE",
      })
    ));

    setMember(client, "del", client.del || ((url, options = {}) =>
      client.delete(url, options)
    ));

    setMember(client, "login", client.login || ((body = {}, options = {}) =>
      client.post(
        authEndpoint("login", "/api/auth/login"),
        body,
        {
          public: true,
          auth: false,
          skipAuth: true,
          _skipAuthRefresh: true,
          skipAuthRefresh: true,
          ...object(options),
        }
      )
    ));

    setMember(client, "refresh", client.refresh || ((body = {}, options = {}) =>
      client.post(
        authEndpoint("refresh", "/api/auth/refresh"),
        body,
        {
          public: true,
          auth: false,
          skipAuth: true,
          _skipAuthRefresh: true,
          skipAuthRefresh: true,
          noAutoLogout: true,
          ...object(options),
        }
      )
    ));

    setMember(client, "me", client.me || ((options = {}) =>
      client.get(
        authEndpoint("me", "/api/auth/me"),
        {
          auth: true,
          public: false,
          skipAuth: false,
          noCache: true,
          cache: "no-store",
          ...object(options),
        }
      )
    ));

    setMember(client, "logout", client.logout || ((body = {}, options = {}) =>
      client.post(
        authEndpoint("logout", "/api/auth/logout"),
        body,
        {
          auth: true,
          public: false,
          skipAuth: false,
          noCache: true,
          _skipAuthRefresh: true,
          skipAuthRefresh: true,
          ...object(options),
        }
      )
    ));

    setMember(client, "getSnapshot", client.getSnapshot || (() => ({
      version: text(
        client.version ||
          client.HTTP_VERSION ||
          client.CORE_HTTP_VERSION,
        "core-http-bridge"
      ),
      installed: true,
      hasRequest: isFn(client.request),
      hasGet: isFn(client.get),
      hasPost: isFn(client.post),
      hasMe: isFn(client.me),
      source: "core:index:http",
      at: iso(),
    })));

    setMember(client, "getDebugSnapshot", client.getDebugSnapshot || client.getSnapshot);
    setMember(client, "snapshot", client.snapshot || client.getSnapshot);

    return client;
  }

  function httpExport(name = "") {
    try {
      return CoreHttpModule?.[name] || null;
    } catch {
      return null;
    }
  }

  function defaultHttpExport() {
    try {
      return CoreHttpModule?.default || null;
    } catch {
      return null;
    }
  }

  function bridgeCanonical(name = "") {
    return BRIDGE_CANONICAL[text(name, "")] || text(name, "");
  }

  function bridgeAliases(name = "") {
    const canonical = bridgeCanonical(name);
    return BRIDGE_ALIASES[canonical] || [canonical];
  }

  function getBridge(name = "") {
    const aliases = bridgeAliases(name);

    for (const alias of aliases) {
      try {
        const value = modules?.get?.(alias) || registry.modules.get(alias);
        if (value) return value;
      } catch {}
    }

    return null;
  }

  function registerBridge(name = "", value = null, options = {}) {
    const canonical = bridgeCanonical(name);
    const aliases = bridgeAliases(canonical);

    if (!canonical || !value) return false;

    let changed = false;

    for (const alias of aliases) {
      const previous = getBridge(alias);

      if (previous === value) continue;

      try {
        modules?.register?.(alias, value, {
          overwrite: true,
          replace: true,
          source: text(options.source, "core:bridge"),
          emit: false,
          silent: true,
        });

        changed = true;
        continue;
      } catch {}

      try {
        registry.modules.set(alias, value);
        changed = true;
      } catch {}
    }

    return changed || true;
  }

  function resolveHttpCandidate(context = {}) {
    const installers = [
      httpExport("installHttp"),
      httpExport("installCoreHttp"),
      httpExport("install"),
    ].filter(isFn);

    const defaultExport = defaultHttpExport();

    if (isFn(defaultExport)) installers.push(defaultExport);

    for (const install of installers) {
      const attempts = [
        () => install(api, context),
        () => install({ AppCore: api, core: api, ...context }),
        () => install(context),
        () => install(api),
      ];

      for (const attempt of attempts) {
        try {
          const value = attempt();

          if (value) return value;
        } catch {}
      }

      const bridged = getBridge("Http");

      if (bridged) return bridged;
    }

    return (
      httpExport("Http") ||
      httpExport("http") ||
      httpExport("apiClient") ||
      httpExport("client") ||
      (defaultExport && typeof defaultExport === "object" ? defaultExport : null)
    );
  }

  function installHttpBridge(reason = "core:http:install", options = {}) {
    const opts = object(options);

    if (httpInstalled && httpBridge && opts.force !== true) {
      registerBridge("Http", httpBridge, {
        source: "core:http:existing",
      });

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

      request: requestBridge || baseRequest,
      baseRequest,

      apiClient: apiClientBridge || baseApiClient,
      baseApiClient,

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
      options: opts,
    };

    const previous = httpBridge;
    const candidate = resolveHttpCandidate(context);

    const client = compatHttpClient(
      candidate ||
        httpBridge ||
        apiClientBridge ||
        baseApiClient
    );

    httpBridge = client;
    apiClientBridge = client;
    httpInstalled = true;

    if (isFn(client.request)) {
      try {
        requestBridge = client.request.bind(client);
      } catch {
        requestBridge = client.request;
      }
    }

    registerBridge("Http", client, {
      source: "core:http",
    });

    try {
      api.services.http = client;
      api.services.Http = client;
      api.services.api = client;
      api.services.apiClient = client;
    } catch {}

    if (!httpReadyEmitted || previous !== client || opts.force === true) {
      httpReadyEmitted = true;

      emit(EVENTS.httpReady, {
        installed: true,
        reason,
        hasRequest: isFn(client.request),
        hasGet: isFn(client.get),
        hasPost: isFn(client.post),
        hasMe: isFn(client.me),
        source: SOURCE,
      });
    }

    return client;
  }

  function getHttpClient() {
    return httpBridge || getBridge("Http") || apiClientBridge || baseApiClient;
  }

  function getActiveRequest() {
    const client = getHttpClient();

    if (isFn(client?.request)) {
      try {
        return client.request.bind(client);
      } catch {
        return client.request;
      }
    }

    return requestBridge || baseRequest;
  }

  function getActiveApiClient() {
    return getHttpClient();
  }

  /* =======================================================
     READY / INIT
  ======================================================= */

  function ready(fn) {
    if (!isFn(fn)) return () => false;

    if (!isBrowser()) {
      try {
        fn();
      } catch (err) {
        error("ready callback error", err);
      }

      return () => false;
    }

    if (!isDocumentReady()) {
      let disposed = false;

      const handler = () => {
        if (disposed) return;

        disposed = true;
        readyCallbacksFlushed = true;

        try {
          fn();
        } catch (err) {
          error("ready callback error", err);
        }
      };

      try {
        document.addEventListener("DOMContentLoaded", handler, { once: true });

        return () => {
          disposed = true;

          try {
            document.removeEventListener("DOMContentLoaded", handler);
          } catch {}

          return true;
        };
      } catch {
        return () => false;
      }
    }

    readyCallbacksFlushed = true;

    try {
      fn();
    } catch (err) {
      error("ready callback error", err);
    }

    return () => true;
  }

  async function runHooks(name, payload = {}) {
    try {
      if (isFn(hooks?.runSeries)) return await hooks.runSeries(name, payload);
      if (isFn(hooks?.run)) return await hooks.run(name, payload);
    } catch (err) {
      warn("hooks failed", name, err);
    }

    let current = payload;

    for (const hook of array(registry.hooks?.[name])) {
      if (!isFn(hook)) continue;

      try {
        const next = await hook(current);

        if (next !== undefined) current = next;
      } catch (err) {
        warn("hook failed", name, err);
      }
    }

    return current;
  }

  function safeCacheDom() {
    try {
      cacheDom({ dom, utils, events });
      return true;
    } catch (err) {
      warn("cacheDom failed", err);
      return false;
    }
  }

  function safeValidateDom() {
    try {
      validateRequiredDom({ dom, utils, events });
      return true;
    } catch (err) {
      warn("validateRequiredDom failed", err);
      return false;
    }
  }

  function safeLoadPreferences() {
    try {
      loadPreferences({ state, storage, dom, events, setState });
      return true;
    } catch (err) {
      warn("loadPreferences failed", err);
      return false;
    }
  }

  function safeLoadSession() {
    try {
      loadSession({ state, storage, dom, events, setState });
      return true;
    } catch (err) {
      warn("loadSession failed", err);
      return false;
    }
  }

  function safeSyncBaseUI() {
    try {
      syncBaseUI({ setDocumentTitle, syncUserUI });
      return true;
    } catch (err) {
      warn("syncBaseUI failed", err);
      return false;
    }
  }

  function bindNetworkSafe() {
    if (networkBound) return true;
    if (config?.featureFlags?.enableNetworkEvents === false) return false;

    try {
      bindNetworkEvents({
        state,
        events,
        cleanup,
        utils,
        setState,
      });

      networkBound = true;
      return true;
    } catch (err) {
      warn("network bind failed", err);
      return false;
    }
  }

  async function doInit() {
    const cycleId = ++initCycle;

    try {
      setState(
        {
          booting: true,
          ready: false,
          initialized: false,
          coreInitializing: true,
          coreInitCycle: cycleId,
          coreVersion: VERSION,
        },
        { source: "core:init:start" }
      );

      installHttpBridge("core:init:before-hooks");

      emit(EVENTS.initStart, {
        cycleId,
        version: VERSION,
        state: sanitizeState(state),
        source: SOURCE,
      });

      await runHooks("beforeInit", {
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
        version: VERSION,
      });

      safeCacheDom();
      safeValidateDom();

      safeLoadPreferences();
      safeLoadSession();

      syncAuth();

      safeSyncBaseUI();
      bindNetworkSafe();

      installHttpBridge("core:init:after-session");

      initialized = true;

      setState(
        {
          initialized: true,
          booting: false,
          ready: true,
          coreInitializing: false,
          coreReady: true,
          coreInitCycle: cycleId,
          coreVersion: VERSION,
          coreReadyAt: iso(),
        },
        { source: "core:init:ready" }
      );

      await runHooks("afterInit", {
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
        version: VERSION,
      });

      emit(EVENTS.ready, {
        cycleId,
        version: VERSION,
        state: sanitizeState(state),
        source: SOURCE,
      });

      log("Core ready", {
        cycleId,
        authenticated: Boolean(state.authenticated),
        hasToken: Boolean(state.hasToken),
        route: state.route || "/",
        publicPath: redact(state.publicPath || "/"),
        lang: state.lang || DEFAULT_LANG,
        theme: state.theme || DEFAULT_THEME,
        hasHttp: Boolean(getHttpClient()),
      });

      return api;
    } catch (err) {
      initialized = false;

      setState(
        {
          initialized: false,
          ready: false,
          booting: false,
          coreInitializing: false,
          coreReady: false,
          coreInitCycle: cycleId,
          coreVersion: VERSION,
          coreErrorAt: iso(),
        },
        { source: "core:init:error" }
      );

      setError(err);

      emit(EVENTS.initError, {
        cycleId,
        version: VERSION,
        error: sanitizeError(err),
        source: SOURCE,
      });

      throw err;
    } finally {
      initPromise = null;
    }
  }

  function init(options = {}) {
    const opts = object(options);

    if (!opts.force && (initialized || state.initialized)) {
      syncAuth();
      installHttpBridge("core:init:already-ready");
      return Promise.resolve(api);
    }

    if (initPromise) return initPromise;

    initPromise = doInit();
    return initPromise;
  }

  function rebootCore(options = {}) {
    try {
      unbindNetworkEvents({ cleanup, events, utils });
    } catch {}

    initialized = false;
    initPromise = null;
    networkBound = false;

    httpInstalled = false;
    httpReadyEmitted = false;

    setState(
      {
        initialized: false,
        ready: false,
        booting: false,
        coreReady: false,
        coreInitializing: false,
      },
      { source: "core:reboot" }
    );

    emit(EVENTS.reboot, {
      at: iso(),
      source: SOURCE,
    });

    return init({
      ...object(options),
      force: true,
    });
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getSnapshot(options = {}) {
    syncAuth();

    const deep = options.deep === true;

    return {
      appName: appName(),
      version: VERSION,
      debug: debugEnabled(),

      initialized: Boolean(initialized || state.initialized),
      initInFlight: Boolean(initPromise),
      initCycle,

      networkEventsBound: Boolean(networkBound),
      readyCallbacksFlushed: Boolean(readyCallbacksFlushed),

      state: {
        initialized: Boolean(state.initialized),
        ready: Boolean(state.ready),
        booting: Boolean(state.booting),
        loading: Boolean(state.loading),

        authenticated: Boolean(state.authenticated),
        hasToken: Boolean(state.hasToken),

        user: publicUser(state.user),
        role: state.role || null,
        username: state.username || null,
        currentResolvedUsername: state.currentResolvedUsername || null,

        route: redact(state.route || "/"),
        publicPath: redact(state.publicPath || "/"),

        theme: state.theme || DEFAULT_THEME,
        lang: state.lang || DEFAULT_LANG,

        hasError: Boolean(state.error || state.hasError),
      },

      dom: {
        hasShell: Boolean(dom.appShell || dom.shell),
        hasViewContainer: Boolean(dom.viewContainer),
        hasSidebar: Boolean(dom.sidebar),
        hasTopbar: Boolean(dom.topbar),
        hasLoader: Boolean(dom.loader),
      },

      registry: {
        moduleCount: registry.modules.size,
        modules: [...registry.modules.keys()],
        scopeCount: registry.scopes.size,
        hookCounts: Object.fromEntries(
          Object.entries(registry.hooks || {}).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.length : 0,
          ])
        ),
      },

      bridges: {
        toast: Boolean(showToastBridge),

        Router: Boolean(getBridge("Router")),
        Auth: Boolean(getBridge("Auth")),
        Store: Boolean(getBridge("Store")),

        Http: Boolean(getHttpClient()),
        apiClient: Boolean(getActiveApiClient()),

        httpInstalled: Boolean(httpInstalled),
        httpReadyEmitted: Boolean(httpReadyEmitted),
      },

      events: deep ? snapshotFrom(events) : null,
      cleanup: deep ? snapshotFrom(cleanup) : null,
      storage: deep ? snapshotFrom(storage) : null,
      modules: deep ? snapshotFrom(modules) : null,
      hooks: deep ? snapshotFrom(hooks) : null,

      request: deep ? snapshotFrom(getActiveRequest()) : null,
      apiClient: deep ? snapshotFrom(getActiveApiClient()) : null,
      http: deep ? snapshotFrom(getHttpClient()) : null,

      network: deep ? getNetworkSnapshot({ state }) : null,

      at: iso(),
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    CORE_VERSION: VERSION,
    version: VERSION,

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

    baseRequest,
    baseApiClient,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
    snapshot: getSnapshot,

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
          if (isFn(value)) requestBridge = value;
        },
      },

      apiClient: {
        enumerable: true,
        configurable: false,
        get() {
          return getActiveApiClient();
        },
        set(value) {
          if (!value) return;

          const client = compatHttpClient(value);

          httpBridge = client;
          apiClientBridge = client;
          httpInstalled = true;

          if (isFn(client.request)) {
            try {
              requestBridge = client.request.bind(client);
            } catch {
              requestBridge = client.request;
            }
          }

          registerBridge("Http", client, {
            source: "core:set:apiClient",
          });
        },
      },

      Http: {
        enumerable: false,
        configurable: false,
        get() {
          return getHttpClient();
        },
        set(value) {
          if (!value) return;

          const client = compatHttpClient(value);

          httpBridge = client;
          apiClientBridge = client;
          httpInstalled = true;

          registerBridge("Http", client, {
            source: "core:set:Http",
          });
        },
      },

      http: {
        enumerable: false,
        configurable: false,
        get() {
          return getHttpClient();
        },
        set(value) {
          if (!value) return;

          const client = compatHttpClient(value);

          httpBridge = client;
          apiClientBridge = client;
          httpInstalled = true;

          registerBridge("Http", client, {
            source: "core:set:http",
          });
        },
      },

      Router: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridge("Router");
        },
        set(value) {
          registerBridge("Router", value, {
            source: "core:set:Router",
          });
        },
      },

      router: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridge("Router");
        },
        set(value) {
          registerBridge("Router", value, {
            source: "core:set:router",
          });
        },
      },

      Auth: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridge("Auth");
        },
        set(value) {
          registerBridge("Auth", value, {
            source: "core:set:Auth",
          });
        },
      },

      auth: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridge("Auth");
        },
        set(value) {
          registerBridge("Auth", value, {
            source: "core:set:auth",
          });
        },
      },

      Store: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridge("Store");
        },
        set(value) {
          registerBridge("Store", value, {
            source: "core:set:Store",
          });
        },
      },

      store: {
        enumerable: false,
        configurable: false,
        get() {
          return getBridge("Store");
        },
        set(value) {
          registerBridge("Store", value, {
            source: "core:set:store",
          });
        },
      },
    });
  } catch {}

  try {
    installHttpBridge("core:bootstrap");
  } catch (err) {
    warn("installHttpBridge bootstrap failed", err);
  }

  try {
    if (isBrowser()) {
      window.__ONION_CORE__ = api;
      window.AppCore = api;
    }
  } catch {}

  try {
    return Object.freeze(api);
  } catch {
    return api;
  }
})();

export default AppCore;

/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

   CORE SINGLETON · SIMPLE KERNEL
   - AppCore único
   - State / Events / Storage / Cleanup / Modules / Hooks
   - request.js = motor HTTP base
   - http.js = facade HTTP única
   - Auth estricta: token + user activo
   - Bridges Router/Auth/Store/Http sin sistemas paralelos
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
  computeAuthenticated,
} from "./state.js";

import { createDomCache, cacheDom, validateRequiredDom } from "./dom.js";
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

import { createRequest, createApiClient } from "./request.js";
import * as CoreHttpModule from "./http.js";

import {
  bindNetworkEvents,
  unbindNetworkEvents,
  getNetworkSnapshot,
} from "./network.js";

export const CORE_VERSION = "21.0.0-simple";

export const AppCore = (() => {
  "use strict";

  const VERSION = CORE_VERSION;
  const SOURCE = "core";

  const DEFAULT_APP_NAME = "Onion Support";
  const DEFAULT_LANG = "es";
  const DEFAULT_THEME = "dark";
  const DEFAULT_STORAGE_PREFIX = "onion";

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
    "otpToken",
    "otp_token",
    "password",
    "passwordHash",
    "secret",
    "authorization",
    "cookie",
    "otp",
    "totp",
    "code",
    "backupCodes",
    "connectionString",
    "sas",
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
  ]);

  const BRIDGE_ALIASES = Object.freeze({
    Router: Object.freeze(["Router", "router"]),
    Auth: Object.freeze(["Auth", "auth"]),
    Store: Object.freeze(["Store", "store"]),
    Http: Object.freeze(["Http", "http", "ApiClient", "apiClient", "api"]),
  });

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

  const registry = {
    modules: new Map(),
    scopes: new Map(),
    hooks: Object.create(null),
  };

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
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;

    const clean = lower(value, "");
    if (["true", "yes", "si", "sí", "on", "active", "enabled"].includes(clean)) return true;
    if (["false", "no", "off", "inactive", "disabled"].includes(clean)) return false;

    return Boolean(fallback);
  }

  function now() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function iso(value = now()) {
    try {
      return new Date(value).toISOString();
    } catch {
      return "";
    }
  }

  function clone(value, fallback = null) {
    try {
      return safeClone(value, fallback);
    } catch {}

    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch {}

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function safeFactory(factory, fallback) {
    try {
      const value = isFn(factory) ? factory() : null;
      if (value) return value;
    } catch {}

    return isFn(fallback) ? fallback() : fallback;
  }

  function appName() {
    return text(config?.appName || config?.name, DEFAULT_APP_NAME);
  }

  function debugEnabled() {
    return Boolean(config?.debug || config?.dev || config?.env === "development" || config?.environment === "development");
  }

  function log(...args) {
    if (!debugEnabled()) return;
    try { console.log(`[${appName()}]`, ...args); } catch {}
  }

  function warn(...args) {
    if (!debugEnabled()) return;
    try { console.warn(`[${appName()}]`, ...args); } catch {}
  }

  function error(...args) {
    try { console.error(`[${appName()}]`, ...args); } catch {}
  }

  function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function redactText(value = "") {
    let output = text(value, "");
    if (!output) return "";

    for (const key of [
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
      "temporaryToken",
      "twoFactorToken",
      "mfaToken",
      "otpToken",
    ]) {
      try {
        output = output.replace(new RegExp(`([?&#]${escapeRegExp(key)}=)([^&#\\s]+)`, "gi"), "$1***");
      } catch {}
    }

    try {
      output = output
        .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
        .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***")
        .replace(/(\/(?:activate-account|activate|activation)\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/(?:reset-password\/confirm|password-reset\/confirm)\/)([^/?#\s]+)/gi, "$1***")
        .replace(/(\/(?:2fa|mfa|otp)\/)([^/?#\s]+)/gi, "$1***");
    } catch {}

    return output;
  }

  function sanitizeError(err = null) {
    if (!err) return null;

    const source = err?.reason || err?.error || err;

    return {
      name: text(source?.name, "Error"),
      message: redactText(text(source?.message || source?.reason || source, "Error")),
      code: text(source?.code || source?.data?.code || source?.response?.data?.code, ""),
      status: number(source?.status || source?.statusCode || source?.response?.status, 0),
      aborted: Boolean(source?.aborted),
      timeout: Boolean(source?.timeout),
      at: iso(),
    };
  }

  function sanitizeValue(value, depth = 0, seen = new WeakSet(), keyHint = "") {
    if (depth > 7) return "[depth-limit]";

    if (SENSITIVE_KEYS.some((sensitive) => lower(keyHint, "").includes(lower(sensitive)))) {
      return value ? "***" : value;
    }

    if (typeof value === "string") return redactText(value);
    if (!value || typeof value !== "object") return value;

    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1, seen, keyHint));

    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeValue(item, depth + 1, seen, key);
    }

    return output;
  }

  function sanitizeState(input = state) {
    const output = sanitizeValue(clone(input, {}), 0) || {};

    if (output.error) output.error = sanitizeError(output.error);
    if (output.lastError) output.lastError = sanitizeError(output.lastError);

    return output;
  }

  function publicUser(user = null) {
    if (!isObject(user)) return null;

    return {
      id: user.id || user.userId || user.user_id || user.uid || null,
      userId: user.userId || user.user_id || user.id || user.uid || null,
      username: user.username || user.userName || user.user_name || user.slug || null,
      displayName: user.name || user.displayName || user.nombre || user.username || null,
      fullName: user.name || user.fullName || user.displayName || user.nombre || null,
      role: user.role || user.rol || null,
      hasAvatar: Boolean(user.avatar || user.avatarUrl || user.picture),
    };
  }

  function snapshotFrom(ref, options = {}) {
    if (!ref) return null;

    for (const key of ["getSnapshot", "getDebugSnapshot", "snapshot"]) {
      try {
        if (isFn(ref[key])) return ref[key](options);
      } catch {}
    }

    return null;
  }

  /* =======================================================
     FALLBACK SYSTEMS
  ======================================================= */

  function fallbackEvents() {
    const map = new Map();

    function on(name, handler) {
      const key = text(name, "");
      if (!key || !isFn(handler)) return () => false;

      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(handler);

      return () => off(key, handler);
    }

    function once(name, handler) {
      if (!isFn(handler)) return () => false;

      let disposed = false;
      const dispose = on(name, (...args) => {
        if (disposed) return;
        disposed = true;
        dispose();
        handler(...args);
      });

      return dispose;
    }

    function off(name, handler = null) {
      const key = text(name, "");
      if (!key) return false;
      if (!handler) return map.delete(key);
      map.get(key)?.delete(handler);
      return true;
    }

    function emitEvent(name, payload = {}) {
      const key = text(name, "");
      if (!key) return false;

      const event = { type: key, detail: payload, payload };

      for (const handler of [...(map.get(key) || [])]) {
        try { handler(event); } catch (err) { warn("event handler failed", key, err); }
      }

      for (const handler of [...(map.get("*") || [])]) {
        try { handler(key, payload, event); } catch (err) { warn("event wildcard handler failed", key, err); }
      }

      return true;
    }

    function clear(name = "") {
      const key = text(name, "");
      if (key) map.delete(key);
      else map.clear();
      return true;
    }

    const getSnapshot = () => ({ fallback: true, names: [...map.keys()], listenerCount: [...map.values()].reduce((sum, set) => sum + set.size, 0) });

    return { on, once, off, emit: emitEvent, dispatch: emitEvent, trigger: emitEvent, clear, removeAllListeners: clear, getSnapshot, getDebugSnapshot: getSnapshot, snapshot: getSnapshot };
  }

  const events = safeFactory(() => createEvents({ maxRecentEvents: config?.diagnostics?.maxRecentEvents }), fallbackEvents);

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
      try { return (scope || document).querySelector(selector); } catch { return null; }
    },

    qsa(selector, scope = null) {
      if (!isBrowser()) return [];
      try { return [...((scope || document).querySelectorAll(selector) || [])]; } catch { return []; }
    },

    byId(id = "") {
      if (!isBrowser()) return null;
      try { return document.getElementById(id); } catch { return null; }
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
      try { target?.removeEventListener?.(eventName, handler, options); } catch {}
    },

    sleep(ms = 0) {
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, number(ms, 0))));
    },

    nextTick(fn) {
      return Promise.resolve().then(() => (isFn(fn) ? fn() : undefined));
    },

    afterPaint(fn) {
      if (!isFn(fn)) return;
      if (!isBrowser()) {
        try { fn(); } catch {}
        return;
      }
      try { requestAnimationFrame(() => requestAnimationFrame(() => fn())); } catch { setTimeout(fn, 0); }
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

    redactTokenInText: redactText,
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

  function fallbackStorage() {
    const memory = new Map();
    const prefix = text(config?.storagePrefix || config?.appKey, DEFAULT_STORAGE_PREFIX);

    const key = (name = "") => {
      const clean = text(name, "");
      if (!clean) return `${prefix}:`;
      if (clean.startsWith(`${prefix}:`) || clean.startsWith(`${prefix}.`) || clean.startsWith(`${prefix}_`)) return clean;
      return `${prefix}:${clean}`;
    };

    const area = (session = false) => {
      if (!isBrowser()) return null;
      try { return session ? window.sessionStorage : window.localStorage; } catch { return null; }
    };

    const getRaw = (name, fallback = null) => {
      const finalKey = key(name);

      try {
        const value = area(false)?.getItem?.(finalKey);
        if (value !== null && value !== undefined) return value;
      } catch {}

      try {
        const value = area(true)?.getItem?.(finalKey);
        if (value !== null && value !== undefined) return value;
      } catch {}

      return memory.has(finalKey) ? memory.get(finalKey) : fallback;
    };

    const setRaw = (name, value, options = {}) => {
      const finalKey = key(name);
      if (value === null || value === undefined) return remove(name);

      const raw = String(value);
      memory.set(finalKey, raw);

      try { area(options.session === true)?.setItem?.(finalKey, raw); } catch {}
      return true;
    };

    const parse = (raw, fallback = null) => {
      if (raw === null || raw === undefined || raw === "") return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    };

    const get = (name, fallback = null) => {
      const raw = getRaw(name, undefined);
      if (raw === undefined) return fallback;
      const parsed = parse(raw, undefined);
      return parsed === undefined ? raw : parsed;
    };

    const set = (name, value, options = {}) => {
      try { return setRaw(name, JSON.stringify(value), options); } catch { return setRaw(name, String(value ?? ""), options); }
    };

    function remove(name) {
      const finalKey = key(name);
      memory.delete(finalKey);
      try { area(false)?.removeItem?.(finalKey); } catch {}
      try { area(true)?.removeItem?.(finalKey); } catch {}
      return true;
    }

    const getSnapshot = () => ({ fallback: true, prefix, memoryKeys: [...memory.keys()].map(redactText) });

    return { prefix, key, normalizeKey: key, getRaw, setRaw, get, set, getJson: (name, fallback = null) => parse(getRaw(name, null), fallback), setJson: set, remove, del: remove, delete: remove, has: (name) => getRaw(name, undefined) !== undefined, keys: () => [...memory.keys()], getSnapshot, getDebugSnapshot: getSnapshot, snapshot: getSnapshot };
  }

  function fallbackCleanup() {
    const ensure = (name = "global") => {
      const clean = text(name, "global");
      if (!registry.scopes.has(clean)) registry.scopes.set(clean, new Set());
      return clean;
    };

    const add = (scopeName, disposer) => {
      if (!isFn(disposer)) return () => false;
      const name = ensure(scopeName);
      registry.scopes.get(name).add(disposer);
      return () => {
        try { disposer(); } catch {}
        registry.scopes.get(name)?.delete(disposer);
        return true;
      };
    };

    const event = (scopeName, target, eventName, handler, options = false) => {
      if (!target || !eventName || !isFn(handler)) return () => false;
      try {
        target.addEventListener(eventName, handler, options);
        return add(scopeName, () => target.removeEventListener(eventName, handler, options));
      } catch {
        return () => false;
      }
    };

    const timeout = (scopeName, fn, ms = 0) => {
      const id = setTimeout(fn, Math.max(0, number(ms, 0)));
      return add(scopeName, () => clearTimeout(id));
    };

    const interval = (scopeName, fn, ms = 0) => {
      const id = setInterval(fn, Math.max(0, number(ms, 0)));
      return add(scopeName, () => clearInterval(id));
    };

    const run = (scopeName = "") => {
      const names = scopeName ? [scopeName] : [...registry.scopes.keys()];

      for (const name of names) {
        const set = registry.scopes.get(name);
        if (!set) continue;
        for (const dispose of [...set]) {
          try { dispose(); } catch {}
        }
        set.clear();
      }

      if (!scopeName) registry.scopes.clear();
      return true;
    };

    const getSnapshot = () => ({ fallback: true, scopes: [...registry.scopes.entries()].map(([name, set]) => ({ name, count: set.size })) });

    return { scope: (name) => ({ name: ensure(name) }), ensureScope: (name) => ({ name: ensure(name) }), add, on: event, event, bus: event, timeout, timer: timeout, interval, run, dispose: run, clear: run, getSnapshot, getDebugSnapshot: getSnapshot, snapshot: getSnapshot };
  }

  function fallbackModules() {
    const get = (name) => registry.modules.get(text(name, "")) || null;

    const register = (name, value, options = {}) => {
      const key = text(name, "");
      if (!key || !value) return false;

      const previous = registry.modules.get(key);
      if (previous && previous !== value && options.replace !== true && options.overwrite !== true) return previous;

      registry.modules.set(key, value);

      if (options.emit === true) {
        emit(previous ? EVENTS.moduleReplaced : EVENTS.moduleRegistered, { name: key, replaced: Boolean(previous), source: text(options.source, SOURCE) });
      }

      return value;
    };

    const remove = (name) => registry.modules.delete(text(name, ""));
    const list = () => [...registry.modules.keys()];
    const getSnapshot = () => ({ fallback: true, count: registry.modules.size, modules: list() });

    return { has: (name) => registry.modules.has(text(name, "")), get, register, set: register, upsert: register, remove, delete: remove, unregister: remove, list, names: list, getSnapshot, getDebugSnapshot: getSnapshot, snapshot: getSnapshot };
  }

  function fallbackHooks() {
    const listFor = (name) => {
      const key = text(name, "");
      if (!key) return null;
      if (!Array.isArray(registry.hooks[key])) registry.hooks[key] = [];
      return registry.hooks[key];
    };

    const add = (name, handler) => {
      const list = listFor(name);
      if (!list || !isFn(handler)) return () => false;
      list.push(handler);
      return () => {
        const key = text(name, "");
        registry.hooks[key] = array(registry.hooks[key]).filter((item) => item !== handler);
        return true;
      };
    };

    const run = async (name, payload = {}) => {
      let current = payload;
      for (const hook of array(registry.hooks[text(name, "")])) {
        if (!isFn(hook)) continue;
        try {
          const next = await hook(current);
          if (next !== undefined) current = next;
        } catch (err) {
          warn("hook failed", name, err);
        }
      }
      return current;
    };

    const clear = (name = "") => {
      const key = text(name, "");
      if (key) registry.hooks[key] = [];
      else {
        for (const hookName of Object.keys(registry.hooks)) registry.hooks[hookName] = [];
      }
      return true;
    };

    const getSnapshot = () => Object.fromEntries(Object.entries(registry.hooks).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));

    return { add, on: add, use: add, register: add, run, runSeries: run, get: (name) => array(registry.hooks[text(name, "")]), clear, getSnapshot, getDebugSnapshot: getSnapshot, snapshot: getSnapshot };
  }

  const state = safeFactory(() => createInitialState({ config }), () => ({}));
  const dom = safeFactory(() => createDomCache(), () => ({}));
  const storage = safeFactory(() => createStorage({ utils, events }), fallbackStorage);
  const cleanup = safeFactory(() => createCleanup({ registry, events, utils }), fallbackCleanup);
  const modules = safeFactory(() => createModules({ registry, events, utils }), fallbackModules);
  const hooks = safeFactory(() => createHooks({ registry, events, utils }), fallbackHooks);

  /* =======================================================
     AUTH STATE
  ======================================================= */

  function stripBearer(value = "") {
    return text(value, "").replace(/^Bearer\s+/i, "").trim();
  }

  function validToken(value = "") {
    const token = stripBearer(value);
    if (!token || /[\s\r\n\t]/.test(token)) return false;

    const bad = lower(token, "");
    if (["null", "undefined", "false", "true", "nan", "none", "[object object]", "{}", "[]"].includes(bad)) return false;

    try {
      return Boolean(hasValidToken(token));
    } catch {
      return token.length >= 8;
    }
  }

  function usableUser(user = null) {
    if (!isObject(user)) return false;

    if (user.active === false || user.enabled === false || user.disabled === true || user.deleted === true || user.archived === true || user.blocked === true || user.suspended === true || user.revoked === true) return false;

    const status = lower(user.status || user.estado || user.state || user.accountStatus || "", "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_");

    if (["disabled", "inactive", "deleted", "archived", "blocked", "suspended", "banned", "revoked", "desactivado", "inactivo", "eliminado", "archivado", "bloqueado", "suspendido"].includes(status)) return false;

    return USER_ID_KEYS.some((key) => Boolean(text(user[key], "")));
  }

  function normalizeUserSafe(value = null) {
    if (!isObject(value)) return null;

    try {
      const normalized = normalizeUser(value);
      if (usableUser(normalized)) return normalized;
    } catch {}

    return usableUser(value) ? value : null;
  }

  function roleOf(user = null, explicit = "") {
    const raw = lower(explicit || user?.role || user?.rol || user?.userRole || user?.user_role || user?.profile?.role || user?.profile?.rol || "", "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "");

    return ["admin", "administrator", "administrador", "superadmin", "super_admin", "owner", "root"].includes(raw) ? "admin" : "user";
  }

  function tokenFrom(root = state) {
    for (const key of TOKEN_KEYS) {
      if (validToken(root?.[key])) return stripBearer(root[key]);
      if (validToken(root?.session?.[key])) return stripBearer(root.session[key]);
      if (validToken(root?.sessionData?.[key])) return stripBearer(root.sessionData[key]);
    }
    return null;
  }

  function userFrom(root = state) {
    for (const key of USER_KEYS) {
      const direct = normalizeUserSafe(root?.[key]);
      if (direct) return direct;

      const session = normalizeUserSafe(root?.session?.[key]);
      if (session) return session;

      const sessionData = normalizeUserSafe(root?.sessionData?.[key]);
      if (sessionData) return sessionData;
    }
    return null;
  }

  function usernameOf(user = null) {
    return text(getUserUsername(user) || user?.username || user?.userName || user?.user_name || user?.usernameLower || user?.username_lower || user?.slug || user?.email || user?.mail || "", "") || null;
  }

  function clearAuthFields() {
    Object.assign(state, {
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
  }

  function setTokenOnly(token) {
    clearAuthFields();
    state.token = token;
    state.accessToken = token;
    state.access_token = token;
    state.hasToken = Boolean(token);
  }

  function syncAuth(options = {}) {
    if (options.forceUnauthenticated === true) {
      clearAuthFields();
      return state;
    }

    const token = tokenFrom(state);
    if (!token) {
      clearAuthFields();
      return state;
    }

    const user = userFrom(state);
    if (!user) {
      setTokenOnly(token);
      return state;
    }

    let authenticated = false;
    try {
      authenticated = Boolean(computeAuthenticated(user, token));
    } catch {
      authenticated = true;
    }

    if (!authenticated) {
      setTokenOnly(token);
      return state;
    }

    const role = roleOf(user, state.role);
    const username = usernameOf(user);
    const resolvedUsername = sanitizeUsername(state.currentResolvedUsername || state.resolvedUsername || "") || sanitizeUsername(username || "") || null;

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
      roles: [role],

      username,
      currentResolvedUsername: resolvedUsername,
      resolvedUsername,

      isAdmin: role === "admin",
      isUser: role === "user",
      isClient: false,
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

  function writeState(patch = {}, options = {}) {
    const cleanPatch = isObject(patch) ? patch : {};

    try {
      stateSetState({ state, events, patch: cleanPatch, options });
      return true;
    } catch {}

    try {
      stateSetStateBase(state, cleanPatch, { ...options, events });
      return true;
    } catch {}

    Object.assign(state, cleanPatch);
    return false;
  }

  function publicState(options = {}) {
    let output = null;

    try { output = cloneState(state); } catch {}
    if (!output) output = clone(state, { ...state }) || { ...state };

    return options.safe ? sanitizeState(output) : output;
  }

  function emitStateChanges(before = {}, after = {}, patch = {}, options = {}) {
    if (options.emit === false || options.silent === true) return;

    const source = text(options.source, "core:setState");
    const changedKeys = Object.keys(object(patch));

    if (options.emitState === true && changedKeys.length) {
      emit(EVENTS.stateChange, { changedKeys, state: sanitizeState(state), source });
    }

    if (markerChanged(before, after, ["authenticated", "hasToken", "role"])) {
      emit(EVENTS.authChange, { authenticated: Boolean(after.authenticated), hasToken: Boolean(after.hasToken), role: after.role || null, username: after.username || null, source });
    }

    if (markerChanged(before, after, ["userId", "username", "role"])) {
      emit(EVENTS.userChange, { authenticated: Boolean(after.authenticated), user: after.authenticated ? publicUser(state.user) : null, username: after.username || null, role: after.role || null, source });
    }

    if (markerChanged(before, after, ["route"])) {
      emit(EVENTS.routeChange, { route: after.route || "/", previousRoute: before.route || "/", publicPath: after.publicPath || "/", source });
    }

    if (markerChanged(before, after, ["publicPath"])) {
      emit(EVENTS.publicPathChange, { publicPath: after.publicPath || "/", previousPublicPath: before.publicPath || "/", route: after.route || "/", source });
    }
  }

  function setState(patch = {}, options = {}) {
    const opts = object(options);
    const cleanPatch = isObject(patch) ? patch : {};
    const before = marker(state);

    writeState(cleanPatch, opts);
    syncAuth({ forceUnauthenticated: opts.forceUnauthenticated === true });

    const after = marker(state);
    emitStateChanges(before, after, cleanPatch, opts);

    return publicState();
  }

  function getState(options = {}) {
    syncAuth();
    return publicState(options);
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
    const current = getCurrentRole();
    const roles = array(roleOrRoles).map((role) => roleOf({ role }));
    return roles.includes(current);
  }

  function getAuthHeader() {
    syncAuth();
    if (!state.token) return {};

    return {
      [text(config?.auth?.tokenHeader, "Authorization")]: `${text(config?.auth?.bearerPrefix, "Bearer")} ${state.token}`,
    };
  }

  /* =======================================================
     UI / SESSION WRAPPERS
  ======================================================= */

  function setDocumentTitle(title = appName()) {
    const finalTitle = text(title, appName());

    try { return setDocumentTitleBase({ dom, events, title: finalTitle }); } catch {}
    if (!isBrowser()) return false;

    try {
      document.title = finalTitle;
      return document.title;
    } catch {
      return false;
    }
  }

  function clearDynamicContainers(options = {}) {
    try { return clearDynamicContainersBase({ dom, events, ...object(options) }); } catch { return false; }
  }

  function syncUserUI(options = {}) {
    try { return syncUserUIBase({ state, dom, events, ...object(options) }); } catch (err) { warn("syncUserUI failed", err); return false; }
  }

  function setShowToast(fn) {
    if (!isFn(fn)) return false;
    showToastBridge = fn;
    emit(EVENTS.toastBridgeReady, { ready: true, at: iso(), source: SOURCE });
    return true;
  }

  function showToast(message = "", type = "info", options = {}) {
    if (!isFn(showToastBridge)) return null;
    try { return showToastBridge(message, type, options); } catch (err) { warn("toast bridge failed", err); return null; }
  }

  function setRoute(route = "/", options = {}) {
    const opts = object(options);

    try { return setRouteBase({ state, setState, events, route, options: opts }); } catch {}

    const clean = normalizeCanonicalPath(route || "/");
    setState({ route: clean, canonicalPath: clean }, { ...opts, source: text(opts.source, "core:setRoute:fallback") });
    return clean;
  }

  function setPublicPath(path = "/", options = {}) {
    const opts = object(options);

    try { return setPublicPathBase({ state, storage, setState, events, path, options: opts }); } catch {}

    const publicPath = normalizePath(path || "/");
    const route = normalizeCanonicalPath(publicPath);

    setState({ publicPath, route, canonicalPath: route }, { ...opts, source: text(opts.source, "core:setPublicPath:fallback") });
    return publicPath;
  }

  function setUser(user = null, options = {}) {
    const opts = object(options);

    try {
      const output = setUserBase({ state, storage, events, setState, syncUserUI, user, options: opts });
      syncAuth({ forceUnauthenticated: !user && !state.token });
      return output;
    } catch {}

    setState({ user: user ? normalizeUserSafe(user) : null }, { ...opts, source: text(opts.source, "core:setUser:fallback"), forceUnauthenticated: !user && !state.token });
    return state.user;
  }

  function setToken(token = null, options = {}) {
    const opts = object(options);
    const cleanToken = validToken(token) ? stripBearer(token) : null;

    try {
      const output = setTokenBase({ state, storage, events, setState, token: cleanToken, options: opts });
      syncAuth({ forceUnauthenticated: !cleanToken });
      return output;
    } catch {}

    setState({ token: cleanToken, accessToken: cleanToken, access_token: cleanToken }, { ...opts, source: text(opts.source, "core:setToken:fallback"), forceUnauthenticated: !cleanToken });
    return state.token;
  }

  function payloadValue(payload = {}, key = "") {
    if (!payload || !key) return null;

    return payload[key] ?? payload.data?.[key] ?? payload.payload?.[key] ?? payload.result?.[key] ?? payload.auth?.[key] ?? payload.session?.[key] ?? null;
  }

  function pickToken(payload = {}) {
    for (const key of TOKEN_KEYS) {
      const value = payloadValue(payload, key);
      if (validToken(value)) return stripBearer(value);
    }
    return null;
  }

  function pickUser(payload = {}) {
    for (const key of USER_KEYS) {
      const user = normalizeUserSafe(payloadValue(payload, key));
      if (user) return user;
    }
    return normalizeUserSafe(payload);
  }

  function applySession(sessionPayload = {}, options = {}) {
    const opts = object(options);
    const payload = object(sessionPayload);

    const token = pickToken(payload);
    const user = pickUser(payload);
    const refreshToken = payloadValue(payload, "refreshToken") || payloadValue(payload, "refresh_token");
    const tempToken = payloadValue(payload, "tempToken") || payloadValue(payload, "temp_token") || payloadValue(payload, "temporaryToken") || payloadValue(payload, "temporary_token");

    let result = null;
    let delegated = false;

    try {
      result = applySessionBase({
        state,
        storage,
        events,
        setUser: (value) => setUser(isObject(value) && "user" in value ? value.user : value, { source: "core:applySession:setUser" }),
        setToken: (value) => setToken(isObject(value) && "token" in value ? value.token : value, { source: "core:applySession:setToken" }),
        setState,
        token,
        user,
        refreshToken,
        tempToken,
        session: payload.session || payload.sessionData || null,
        sessionId: payloadValue(payload, "sessionId") || payloadValue(payload, "session_id"),
        sessionUserId: payloadValue(payload, "sessionUserId") || payloadValue(payload, "session_user_id") || payloadValue(payload, "userId"),
        route: payload.route || payload.canonicalPath || payload.data?.route || payload.data?.canonicalPath || null,
        publicPath: payload.publicPath || payload.data?.publicPath || null,
        options: opts,
      });
      delegated = true;
    } catch {}

    if (!delegated) {
      if (token) {
        state.token = token;
        state.accessToken = token;
        state.access_token = token;
      }
      if (user) state.user = user;
      if (refreshToken) {
        state.refreshToken = refreshToken;
        state.refresh_token = refreshToken;
      }
      if (tempToken) {
        state.tempToken = tempToken;
        state.temp_token = tempToken;
      }
      result = { token: state.token || null, user: state.user || null, session: state.session || null };
    }

    syncAuth({ forceUnauthenticated: opts.forceUnauthenticated === true });

    if (opts.emit !== false) {
      emit(EVENTS.sessionApplied, { authenticated: Boolean(state.authenticated), hasToken: Boolean(state.hasToken), user: publicUser(state.user), role: state.role || null, source: text(opts.source, delegated ? "core:applySession" : "core:applySession:fallback") });
    }

    return result;
  }

  function clearSession(options = {}) {
    const opts = object(options);
    let result = null;
    let delegated = false;

    try {
      result = clearSessionBase({ state, storage, events, setState, syncUserUI, utils, options: opts });
      delegated = true;
    } catch {}

    clearAuthFields();
    Object.assign(state, {
      refreshToken: null,
      refresh_token: null,
      idToken: null,
      id_token: null,
      tempToken: null,
      temp_token: null,
      session: null,
      sessionData: null,
      sessionId: null,
      sessionUserId: null,
    });

    setState({}, { source: text(opts.source, delegated ? "core:clearSession" : "core:clearSession:fallback"), forceUnauthenticated: true, silent: opts.silent === true });

    if (opts.emit !== false) {
      emit(EVENTS.sessionCleared, { silent: Boolean(opts.silent), source: text(opts.source, delegated ? "core:clearSession" : "core:clearSession:fallback") });
    }

    return delegated ? result : true;
  }

  function setTheme(theme, themeMode = "") {
    try { return setThemeBase({ dom, storage, events, setState, theme, themeMode }); } catch {}

    const clean = lower(theme, DEFAULT_THEME) === "light" ? "light" : DEFAULT_THEME;
    setState({ theme: clean }, { source: "core:setTheme:fallback" });
    return clean;
  }

  function setLang(lang) {
    try { return setLangBase({ dom, storage, events, setState, lang }); } catch {}

    const clean = lower(lang, DEFAULT_LANG);
    setState({ lang: clean }, { source: "core:setLang:fallback" });

    try { if (isBrowser()) document.documentElement.lang = clean; } catch {}
    emit("app:lang:change", { lang: clean, source: "core:setLang:fallback" });

    return clean;
  }

  function setSidebarOpen(value) {
    try { return setSidebarOpenBase({ dom, storage, events, setState, value }); } catch {}

    const next = Boolean(value);
    setState({ sidebarOpen: next }, { source: "core:setSidebarOpen:fallback" });
    return next;
  }

  function setLoading(value) {
    try { return setLoadingBase({ dom, events, setState, value }); } catch {}

    const next = Boolean(value);
    setState({ loading: next }, { source: "core:setLoading:fallback" });
    return next;
  }

  function setError(err = null) {
    try { return setErrorBase({ events, setState, cloneError, error: err }); } catch {}

    const normalized = err ? cloneError(err) : null;
    setState({ error: normalized, lastError: normalized, hasError: Boolean(normalized) }, { source: "core:setError:fallback" });
    return normalized;
  }

  /* =======================================================
     HTTP BRIDGE
  ======================================================= */

  function apiBase() {
    return text(config?.apiBase || config?.api?.baseUrl || config?.api?.base || config?.backendUrl || "", "");
  }

  function isAbsoluteUrl(url = "") {
    return /^https?:\/\//i.test(text(url, ""));
  }

  function resolveUrl(url = "") {
    const raw = text(url, "/");
    if (isAbsoluteUrl(raw)) return raw;

    try { return buildUrl(apiBase(), raw); } catch { return `${apiBase().replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`; }
  }

  async function fallbackRequest(url, options = {}) {
    if (!isBrowser() || !isFn(fetch)) throw new Error("Fetch API no disponible.");

    const opts = { ...object(options) };
    const method = text(opts.method, "GET").toUpperCase();
    const finalUrl = resolveUrl(url);
    const publicRequest = opts.public === true || opts.auth === false || opts.skipAuth === true || opts._skipAuth === true || isPublicApiPath(finalUrl);

    const headers = {
      Accept: "application/json",
      ...object(opts.headers),
      ...(publicRequest ? {} : getAuthHeader()),
    };

    const hasBody = opts.body !== undefined && opts.body !== null && method !== "GET" && method !== "HEAD";
    let body = opts.body;

    if (hasBody && typeof FormData !== "undefined" && !(body instanceof FormData) && typeof body !== "string") {
      headers["Content-Type"] = headers["Content-Type"] || headers["content-type"] || "application/json";
      body = JSON.stringify(body);
    }

    const response = await fetch(finalUrl, {
      ...opts,
      method,
      headers,
      credentials: opts.credentials || "include",
      cache: opts.cache || (opts.noCache ? "no-store" : "default"),
      body: hasBody ? body : undefined,
    });

    const contentType = response.headers?.get?.("content-type") || "";
    let payload = null;

    if (contentType.includes("application/json")) {
      try { payload = await response.json(); } catch { payload = null; }
    } else {
      try { payload = await response.text(); } catch { payload = ""; }
    }

    if (!response.ok) {
      const err = new Error(text(payload?.message || payload?.error?.message || payload?.error || response.statusText, `HTTP ${response.status}`));
      err.status = response.status;
      err.response = response;
      err.data = payload;
      throw err;
    }

    return payload;
  }

  const baseRequest = safeFactory(() => createRequest({ state, events, setError, utils, registry, hooks }), () => fallbackRequest);

  function simpleClient(requestFn) {
    const call = isFn(requestFn) ? requestFn : fallbackRequest;

    return {
      request: call,
      get: (url, options = {}) => call(url, { ...options, method: "GET" }),
      post: (url, body = undefined, options = {}) => call(url, { ...options, method: "POST", body }),
      put: (url, body = undefined, options = {}) => call(url, { ...options, method: "PUT", body }),
      patch: (url, body = undefined, options = {}) => call(url, { ...options, method: "PATCH", body }),
      delete: (url, options = {}) => call(url, { ...options, method: "DELETE" }),
      del(url, options = {}) { return this.delete(url, options); },
    };
  }

  const baseApiClient = safeFactory(() => createApiClient(baseRequest), () => simpleClient(baseRequest));

  requestBridge = baseRequest;
  apiClientBridge = baseApiClient;

  function authEndpoint(name = "", fallback = "") {
    const endpoints = object(config?.auth?.endpoints || config?.api?.endpoints);
    return text(endpoints[name], "") || text(config?.auth?.[`${name}Endpoint`], "") || text(config?.api?.[`${name}Endpoint`], "") || fallback;
  }

  function defineMissing(target, key, value, enumerable = false) {
    if (!target || !key || value === undefined || value === null) return false;

    try {
      if (target[key] !== undefined && target[key] !== null) return true;
    } catch {}

    try {
      Object.defineProperty(target, key, { value, configurable: true, enumerable, writable: true });
      return true;
    } catch {}

    try {
      target[key] = value;
      return true;
    } catch {
      return false;
    }
  }

  function normalizeHttpClient(candidate = null) {
    const source = candidate && (typeof candidate === "object" || typeof candidate === "function") ? candidate : {};
    let client = source;

    try {
      if (!Object.isExtensible(client) || Array.isArray(client)) client = {};
    } catch {
      client = {};
    }

    const requestFn = isFn(source.request) ? source.request.bind(source) : isFn(source) ? source : isFn(requestBridge) ? requestBridge : baseRequest;

    defineMissing(client, "request", requestFn, true);
    defineMissing(client, "get", (url, options = {}) => requestFn(url, { ...options, method: "GET" }), true);
    defineMissing(client, "post", (url, body = undefined, options = {}) => requestFn(url, { ...options, method: "POST", body }), true);
    defineMissing(client, "put", (url, body = undefined, options = {}) => requestFn(url, { ...options, method: "PUT", body }), true);
    defineMissing(client, "patch", (url, body = undefined, options = {}) => requestFn(url, { ...options, method: "PATCH", body }), true);
    defineMissing(client, "delete", (url, options = {}) => requestFn(url, { ...options, method: "DELETE" }), true);
    defineMissing(client, "del", (url, options = {}) => client.delete(url, options), true);

    defineMissing(client, "login", (body = {}, options = {}) => client.post(authEndpoint("login", "/api/auth/login"), body, { public: true, auth: false, skipAuth: true, _skipAuthRefresh: true, skipAuthRefresh: true, ...object(options) }));
    defineMissing(client, "refresh", (body = {}, options = {}) => client.post(authEndpoint("refresh", "/api/auth/refresh"), body, { public: true, auth: false, skipAuth: true, _skipAuthRefresh: true, skipAuthRefresh: true, noAutoLogout: true, ...object(options) }));
    defineMissing(client, "me", (options = {}) => client.get(authEndpoint("me", "/api/auth/me"), { auth: true, public: false, skipAuth: false, noCache: true, cache: "no-store", ...object(options) }));
    defineMissing(client, "logout", (body = {}, options = {}) => client.post(authEndpoint("logout", "/api/auth/logout"), body, { auth: true, public: false, skipAuth: false, noCache: true, _skipAuthRefresh: true, skipAuthRefresh: true, ...object(options) }));

    defineMissing(client, "getSnapshot", () => ({ version: text(client.version || client.HTTP_VERSION || client.CORE_HTTP_VERSION, "core-http"), installed: true, hasRequest: isFn(client.request), hasGet: isFn(client.get), hasPost: isFn(client.post), hasMe: isFn(client.me), source: "core:index:http", at: iso() }));
    defineMissing(client, "getDebugSnapshot", client.getSnapshot);
    defineMissing(client, "snapshot", client.getSnapshot);

    return client;
  }

  function bridgeCanonical(name = "") {
    return BRIDGE_CANONICAL[text(name, "")] || text(name, "");
  }

  function bridgeAliases(name = "") {
    const canonical = bridgeCanonical(name);
    return BRIDGE_ALIASES[canonical] || [canonical];
  }

  function getBridge(name = "") {
    for (const alias of bridgeAliases(name)) {
      try {
        const value = modules?.get?.(alias) || registry.modules.get(alias);
        if (value) return value;
      } catch {}
    }
    return null;
  }

  function registerBridge(name = "", value = null, options = {}) {
    const canonical = bridgeCanonical(name);
    if (!canonical || !value) return false;

    for (const alias of bridgeAliases(canonical)) {
      try {
        modules?.register?.(alias, value, { overwrite: true, replace: true, emit: false, silent: true, source: text(options.source, "core:bridge") });
      } catch {
        try { registry.modules.set(alias, value); } catch {}
      }
    }

    return value;
  }

  function registerModule(name = "", value = null, options = {}) {
    const key = text(name, "");
    if (!key || !value) return false;

    let result = null;

    try {
      result = modules?.register?.(key, value, { overwrite: options.overwrite !== false, replace: options.replace !== false, emit: options.emit === true, source: text(options.source, SOURCE) });
    } catch {}

    if (!result) registry.modules.set(key, value);
    if (BRIDGE_CANONICAL[key]) registerBridge(key, value, options);

    return result || value;
  }

  function getModule(name = "") {
    return getBridge(name) || modules?.get?.(name) || registry.modules.get(text(name, "")) || null;
  }

  function httpExport(name = "") {
    try { return CoreHttpModule?.[name] || null; } catch { return null; }
  }

  function defaultHttpExport() {
    try { return CoreHttpModule?.default || null; } catch { return null; }
  }

  function resolveHttpCandidate(context = {}) {
    const def = defaultHttpExport();
    const installers = [httpExport("installHttp"), httpExport("installCoreHttp"), httpExport("install"), isFn(def) ? def : null].filter(isFn);

    for (const install of installers) {
      for (const attempt of [() => install(context), () => install({ AppCore: api, core: api, ...context }), () => install(api, context), () => install(api)]) {
        try {
          const value = attempt();
          if (value) return value;
        } catch {}
      }
    }

    return getBridge("Http") || httpExport("Http") || httpExport("http") || httpExport("apiClient") || httpExport("client") || (def && typeof def === "object" ? def : null);
  }

  function installHttpBridge(reason = "core:http:install", options = {}) {
    const opts = object(options);

    if (httpInstalled && httpBridge && opts.force !== true) {
      registerBridge("Http", httpBridge, { source: "core:http:existing" });
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
    const client = normalizeHttpClient(resolveHttpCandidate(context) || httpBridge || apiClientBridge || baseApiClient);

    httpBridge = client;
    apiClientBridge = client;
    httpInstalled = true;

    if (isFn(client.request)) {
      try { requestBridge = client.request.bind(client); } catch { requestBridge = client.request; }
    }

    registerBridge("Http", client, { source: "core:http" });

    api.services.http = client;
    api.services.Http = client;
    api.services.api = client;
    api.services.apiClient = client;

    if (!httpReadyEmitted || previous !== client || opts.force === true) {
      httpReadyEmitted = true;
      emit(EVENTS.httpReady, { installed: true, reason, hasRequest: isFn(client.request), hasGet: isFn(client.get), hasPost: isFn(client.post), hasMe: isFn(client.me), source: SOURCE });
    }

    return client;
  }

  function getHttpClient() {
    return httpBridge || getBridge("Http") || apiClientBridge || baseApiClient;
  }

  function getActiveRequest() {
    const client = getHttpClient();
    if (isFn(client?.request)) {
      try { return client.request.bind(client); } catch { return client.request; }
    }
    return requestBridge || baseRequest;
  }

  function getActiveApiClient() {
    return getHttpClient();
  }

  /* =======================================================
     INIT
  ======================================================= */

  function ready(fn) {
    if (!isFn(fn)) return () => false;

    if (!isBrowser()) {
      try { fn(); } catch (err) { error("ready callback failed", err); }
      return () => false;
    }

    if (!isDocumentReady()) {
      let disposed = false;
      const handler = () => {
        if (disposed) return;
        disposed = true;
        readyCallbacksFlushed = true;
        try { fn(); } catch (err) { error("ready callback failed", err); }
      };

      try {
        document.addEventListener("DOMContentLoaded", handler, { once: true });
        return () => {
          disposed = true;
          try { document.removeEventListener("DOMContentLoaded", handler); } catch {}
          return true;
        };
      } catch {
        return () => false;
      }
    }

    readyCallbacksFlushed = true;
    try { fn(); } catch (err) { error("ready callback failed", err); }
    return () => true;
  }

  async function runHooks(name, payload = {}) {
    try {
      if (isFn(hooks?.runSeries)) return await hooks.runSeries(name, payload);
      if (isFn(hooks?.run)) return await hooks.run(name, payload);
    } catch (err) {
      warn("hooks failed", name, err);
    }
    return payload;
  }

  function safeCacheDom() {
    try { cacheDom({ dom, utils, events }); return true; } catch (err) { warn("cacheDom failed", err); return false; }
  }

  function safeValidateDom() {
    try { validateRequiredDom({ dom, utils, events }); return true; } catch (err) { warn("validateRequiredDom failed", err); return false; }
  }

  function safeLoadPreferences() {
    try { loadPreferences({ state, storage, dom, events, setState }); return true; } catch (err) { warn("loadPreferences failed", err); return false; }
  }

  function safeLoadSession() {
    try { loadSession({ state, storage, dom, events, setState }); return true; } catch (err) { warn("loadSession failed", err); return false; }
  }

  function safeSyncBaseUI() {
    try { syncBaseUI({ setDocumentTitle, syncUserUI }); return true; } catch (err) { warn("syncBaseUI failed", err); return false; }
  }

  function bindNetworkSafe() {
    if (networkBound) return true;
    if (config?.featureFlags?.enableNetworkEvents === false) return false;

    try {
      bindNetworkEvents({ state, events, cleanup, utils, setState });
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
      setState({ booting: true, ready: false, initialized: false, coreInitializing: true, coreInitCycle: cycleId, coreVersion: VERSION }, { source: "core:init:start", silent: true });
      installHttpBridge("core:init:before-hooks");

      emit(EVENTS.initStart, { cycleId, version: VERSION, state: sanitizeState(state), source: SOURCE });

      await runHooks("beforeInit", { state, dom, config, events, utils, storage, cleanup, modules, hooks, request: getActiveRequest(), apiClient: getActiveApiClient(), http: getHttpClient(), Http: getHttpClient(), cycleId, version: VERSION });

      safeCacheDom();
      safeValidateDom();
      safeLoadPreferences();
      safeLoadSession();
      syncAuth();
      safeSyncBaseUI();
      bindNetworkSafe();
      installHttpBridge("core:init:after-session");

      initialized = true;

      setState({ initialized: true, booting: false, ready: true, coreInitializing: false, coreReady: true, coreInitCycle: cycleId, coreVersion: VERSION, coreReadyAt: iso() }, { source: "core:init:ready", silent: true });

      await runHooks("afterInit", { state, dom, config, events, utils, storage, cleanup, modules, hooks, request: getActiveRequest(), apiClient: getActiveApiClient(), http: getHttpClient(), Http: getHttpClient(), cycleId, version: VERSION });

      emit(EVENTS.ready, { cycleId, version: VERSION, state: sanitizeState(state), source: SOURCE });

      log("Core ready", { cycleId, authenticated: Boolean(state.authenticated), hasToken: Boolean(state.hasToken), route: redactText(state.route || "/"), publicPath: redactText(state.publicPath || "/"), hasHttp: Boolean(getHttpClient()) });

      return api;
    } catch (err) {
      initialized = false;

      setState({ initialized: false, ready: false, booting: false, coreInitializing: false, coreReady: false, coreInitCycle: cycleId, coreVersion: VERSION, coreErrorAt: iso() }, { source: "core:init:error", silent: true });
      setError(err);
      emit(EVENTS.initError, { cycleId, version: VERSION, error: sanitizeError(err), source: SOURCE });

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
    try { unbindNetworkEvents({ cleanup, events, utils }); } catch {}

    initialized = false;
    initPromise = null;
    networkBound = false;
    httpInstalled = false;
    httpReadyEmitted = false;

    setState({ initialized: false, ready: false, booting: false, coreReady: false, coreInitializing: false }, { source: "core:reboot", silent: true });
    emit(EVENTS.reboot, { at: iso(), source: SOURCE });

    return init({ ...object(options), force: true });
  }

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
        route: redactText(state.route || "/"),
        publicPath: redactText(state.publicPath || "/"),
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
        hookCounts: Object.fromEntries(Object.entries(registry.hooks || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
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
      http: deep ? snapshotFrom(getHttpClient()) : null,
      network: deep ? getNetworkSnapshot({ state }) : null,

      policy: {
        singletonOnly: true,
        ownRouter: false,
        ownAuthFlow: false,
        ownStore: false,
        duplicateHttp: false,
        strictAuth: true,
      },

      at: iso(),
    };
  }

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

    registerModule,
    getModule,
    registerBridge,
    getBridge,

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
        get() { return getActiveRequest(); },
        set(value) { if (isFn(value)) requestBridge = value; },
      },

      apiClient: {
        enumerable: true,
        configurable: false,
        get() { return getActiveApiClient(); },
        set(value) {
          if (!value) return;
          const client = normalizeHttpClient(value);
          httpBridge = client;
          apiClientBridge = client;
          httpInstalled = true;
          if (isFn(client.request)) {
            try { requestBridge = client.request.bind(client); } catch { requestBridge = client.request; }
          }
          registerBridge("Http", client, { source: "core:set:apiClient" });
        },
      },

      Http: {
        enumerable: false,
        configurable: false,
        get() { return getHttpClient(); },
        set(value) {
          if (!value) return;
          const client = normalizeHttpClient(value);
          httpBridge = client;
          apiClientBridge = client;
          httpInstalled = true;
          registerBridge("Http", client, { source: "core:set:Http" });
        },
      },

      http: {
        enumerable: false,
        configurable: false,
        get() { return getHttpClient(); },
        set(value) {
          if (!value) return;
          const client = normalizeHttpClient(value);
          httpBridge = client;
          apiClientBridge = client;
          httpInstalled = true;
          registerBridge("Http", client, { source: "core:set:http" });
        },
      },

      Router: {
        enumerable: false,
        configurable: false,
        get() { return getBridge("Router"); },
        set(value) { registerBridge("Router", value, { source: "core:set:Router" }); },
      },

      router: {
        enumerable: false,
        configurable: false,
        get() { return getBridge("Router"); },
        set(value) { registerBridge("Router", value, { source: "core:set:router" }); },
      },

      Auth: {
        enumerable: false,
        configurable: false,
        get() { return getBridge("Auth"); },
        set(value) { registerBridge("Auth", value, { source: "core:set:Auth" }); },
      },

      auth: {
        enumerable: false,
        configurable: false,
        get() { return getBridge("Auth"); },
        set(value) { registerBridge("Auth", value, { source: "core:set:auth" }); },
      },

      Store: {
        enumerable: false,
        configurable: false,
        get() { return getBridge("Store"); },
        set(value) { registerBridge("Store", value, { source: "core:set:Store" }); },
      },

      store: {
        enumerable: false,
        configurable: false,
        get() { return getBridge("Store"); },
        set(value) { registerBridge("Store", value, { source: "core:set:store" }); },
      },
    });
  } catch {}

  try { installHttpBridge("core:bootstrap"); } catch (err) { warn("installHttpBridge bootstrap failed", err); }

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

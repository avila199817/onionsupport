/* =========================================================
   Onion SPA - Core
   Archivo: src/core/index.js

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
   - API congelada estable
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

import {
  bindNetworkEvents,
} from "./network.js";

/* =========================================================
   SINGLETON
========================================================= */

export const AppCore = (() => {
  "use strict";

  let initPromise = null;
  let initialized = false;
  let initCycle = 0;
  let networkEventsBound = false;
  let showToastBridge = null;

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

  function safeBool(value, fallback = false) {
    if (value === true) {
      return true;
    }

    if (value === false) {
      return false;
    }

    return Boolean(fallback);
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeNow() {
    return Date.now();
  }

  function safeIsoDate(ms = safeNow()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
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

  function safeFactory(factory, fallback, ...args) {
    try {
      if (isFunction(factory)) {
        const value =
          factory(...args);

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
      return Boolean(config?.debug);
    } catch {
      return false;
    }
  }

  function getAppName() {
    return (
      safeText(config?.appName, "") ||
      safeText(config?.name, "") ||
      "Onion SPA"
    );
  }

  function safeConsole(method = "log", ...args) {
    try {
      const fn =
        console?.[method] ||
        console?.log;

      fn?.(
        `[${getAppName()}]`,
        ...args
      );
    } catch {}
  }

  function safeLog(...args) {
    if (!getDebugEnabled()) {
      return;
    }

    safeConsole(
      "log",
      ...args
    );
  }

  function safeWarn(...args) {
    if (!getDebugEnabled()) {
      return;
    }

    safeConsole(
      "warn",
      ...args
    );
  }

  function safeError(...args) {
    safeConsole(
      "error",
      ...args
    );
  }

  /* =======================================================
     FALLBACK EVENTS
  ======================================================= */

  function createFallbackEvents() {
    const listeners =
      new Map();

    function getSet(name) {
      const key =
        safeText(name, "");

      if (!key) {
        return null;
      }

      if (!listeners.has(key)) {
        listeners.set(
          key,
          new Set()
        );
      }

      return listeners.get(key);
    }

    function on(name, handler) {
      if (
        !name ||
        !isFunction(handler)
      ) {
        return () => {};
      }

      const set =
        getSet(name);

      if (!set) {
        return () => {};
      }

      set.add(handler);

      return () =>
        off(
          name,
          handler
        );
    }

    function once(name, handler) {
      if (
        !name ||
        !isFunction(handler)
      ) {
        return () => {};
      }

      const dispose =
        on(
          name,
          (...args) => {
            dispose();

            handler(...args);
          }
        );

      return dispose;
    }

    function off(name, handler) {
      try {
        listeners
          .get(name)
          ?.delete(handler);
      } catch {}

      return true;
    }

    function emit(name, payload = {}) {
      const set =
        listeners.get(name);

      if (!set) {
        return false;
      }

      for (const handler of Array.from(set)) {
        try {
          handler(payload);
        } catch (error) {
          safeWarn(
            "Fallback event handler error:",
            name,
            error
          );
        }
      }

      return true;
    }

    function clear(name = "") {
      if (name) {
        listeners.delete(name);
        return true;
      }

      listeners.clear();
      return true;
    }

    return {
      on,
      once,
      off,
      emit,
      clear,
    };
  }

  /* =======================================================
     ROOT REGISTRY / STATE
  ======================================================= */

  const registry = {
    modules:
      new Map(),

    scopes:
      new Map(),

    hooks: {
      beforeInit:
        [],

      afterInit:
        [],

      beforeRequest:
        [],

      afterResponse:
        [],

      onRequestError:
        [],
    },
  };

  const events =
    safeFactory(
      createEvents,
      createFallbackEvents
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
     UTILS
  ======================================================= */

  const utils = {
    qs(selector, scope = null) {
      if (!isBrowser()) {
        return null;
      }

      const root =
        scope ||
        document;

      try {
        return (
          root?.querySelector?.(
            selector
          ) || null
        );
      } catch {
        return null;
      }
    },

    qsa(selector, scope = null) {
      if (!isBrowser()) {
        return [];
      }

      const root =
        scope ||
        document;

      try {
        return Array.from(
          root?.querySelectorAll?.(
            selector
          ) || []
        );
      } catch {
        return [];
      }
    },

    byId(id = "") {
      if (!isBrowser()) {
        return null;
      }

      try {
        return document.getElementById(
          id
        );
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
        target.addEventListener(
          ev,
          fn,
          opts
        );

        return () => {
          try {
            target.removeEventListener(
              ev,
              fn,
              opts
            );
          } catch {}
        };
      } catch {
        return () => {};
      }
    },

    off(target, ev, fn, opts = false) {
      try {
        target?.removeEventListener?.(
          ev,
          fn,
          opts
        );
      } catch {}
    },

    sleep(ms = 0) {
      return new Promise((resolve) =>
        setTimeout(
          resolve,
          Number.isFinite(Number(ms))
            ? Number(ms)
            : 0
        )
      );
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

      setTimeout(() => {
        try {
          fn?.();
        } catch {}
      }, 0);
    },

    log:
      safeLog,

    warn:
      safeWarn,

    error:
      safeError,

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
  };

  /* =======================================================
     FALLBACK CLEANUP
  ======================================================= */

  function createFallbackCleanup() {
    function ensureScope(name = "global") {
      const scopeName =
        safeText(name, "global");

      if (!registry.scopes.has(scopeName)) {
        registry.scopes.set(
          scopeName,
          new Set()
        );
      }

      return {
        name:
          scopeName,
      };
    }

    function add(scopeName, disposer) {
      if (!isFunction(disposer)) {
        return false;
      }

      const scope =
        ensureScope(scopeName).name;

      registry.scopes
        .get(scope)
        .add(disposer);

      return true;
    }

    function event(scopeName, targetOrName, eventNameOrHandler, handlerOrOptions, maybeOptions) {
      const scope =
        ensureScope(scopeName).name;

      let target =
        null;

      let eventName =
        "";

      let handler =
        null;

      let options =
        false;

      if (
        targetOrName &&
        isFunction(targetOrName.addEventListener)
      ) {
        target =
          targetOrName;

        eventName =
          safeText(
            eventNameOrHandler,
            ""
          );

        handler =
          handlerOrOptions;

        options =
          maybeOptions || false;
      } else {
        target =
          isBrowser()
            ? window
            : null;

        eventName =
          safeText(
            targetOrName,
            ""
          );

        handler =
          eventNameOrHandler;

        options =
          handlerOrOptions || false;
      }

      if (
        !target ||
        !eventName ||
        !isFunction(handler)
      ) {
        return false;
      }

      try {
        target.addEventListener(
          eventName,
          handler,
          options
        );

        add(scope, () => {
          try {
            target.removeEventListener(
              eventName,
              handler,
              options
            );
          } catch {}
        });

        return true;
      } catch {
        return false;
      }
    }

    function run(scopeName = "global") {
      const scope =
        safeText(scopeName, "global");

      const disposers =
        registry.scopes.get(scope);

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

    return {
      scope:
        ensureScope,

      ensureScope,

      add,
      event,
      run,
      clear,
      dispose:
        run,
    };
  }

  /* =======================================================
     FALLBACK STORAGE
  ======================================================= */

  function createFallbackStorage() {
    const memory =
      new Map();

    const prefix =
      safeText(
        config?.storagePrefix ||
          config?.appKey ||
          "onion",
        "onion"
      );

    function key(name = "") {
      return `${prefix}:${safeText(name, "")}`;
    }

    function get(name, fallback = null) {
      const finalKey =
        key(name);

      try {
        if (isBrowser()) {
          const raw =
            window.localStorage?.getItem?.(
              finalKey
            );

          if (raw !== null && raw !== undefined) {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          }
        }
      } catch {}

      return memory.has(finalKey)
        ? memory.get(finalKey)
        : fallback;
    }

    function set(name, value) {
      const finalKey =
        key(name);

      memory.set(
        finalKey,
        value
      );

      try {
        if (isBrowser()) {
          window.localStorage?.setItem?.(
            finalKey,
            JSON.stringify(value)
          );
        }
      } catch {}

      return true;
    }

    function remove(name) {
      const finalKey =
        key(name);

      memory.delete(finalKey);

      try {
        if (isBrowser()) {
          window.localStorage?.removeItem?.(
            finalKey
          );
        }
      } catch {}

      return true;
    }

    return {
      key,
      get,
      set,
      remove,
      del:
        remove,
      delete:
        remove,
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
      utils
    );

  function createFallbackModules() {
    return {
      has(name) {
        return registry.modules.has(
          safeText(name, "")
        );
      },

      get(name) {
        return registry.modules.get(
          safeText(name, "")
        );
      },

      register(name, moduleRef) {
        const key =
          safeText(name, "");

        if (
          !key ||
          !moduleRef
        ) {
          return false;
        }

        if (!registry.modules.has(key)) {
          registry.modules.set(
            key,
            moduleRef
          );

          try {
            events.emit(
              "app:module:registered",
              {
                name:
                  key,
              }
            );
          } catch {}
        }

        return true;
      },

      set(name, moduleRef) {
        return this.register(
          name,
          moduleRef
        );
      },

      list() {
        return Array.from(
          registry.modules.keys()
        );
      },
    };
  }

  function createFallbackHooks() {
    function add(name, handler) {
      const key =
        safeText(name, "");

      if (
        !key ||
        !isFunction(handler)
      ) {
        return () => {};
      }

      if (!Array.isArray(registry.hooks[key])) {
        registry.hooks[key] = [];
      }

      registry.hooks[key].push(handler);

      return () => {
        registry.hooks[key] =
          registry.hooks[key].filter((item) =>
            item !== handler
          );
      };
    }

    return {
      add,
      on:
        add,

      use:
        add,

      get(name) {
        return registry.hooks[
          safeText(name, "")
        ] || [];
      },
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
    try {
      return Boolean(
        hasValidToken(token)
      );
    } catch {}

    return Boolean(
      safeText(token, "")
    );
  }

  function normalizeRoleValue(user = null, explicitRole = "") {
    return safeText(
      explicitRole ||
        user?.role ||
        user?.rol ||
        user?.profile?.role ||
        user?.raw?.role ||
        user?.raw?.rol ||
        "",
      ""
    )
      .toLowerCase();
  }

  function resolveUsernameValue(user = null) {
    return (
      safeText(
        getUserUsername(user) ||
          user?.username ||
          user?.userName ||
          user?.email ||
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
          root.user?.nick ||
          root.user?.alias ||
          root.user?.login ||
          root.user?.slug ||
          root.user?.email ||
          ""
      ) || null;

    return (
      fromPrevious ||
      fromUser ||
      null
    );
  }

  function syncDerivedAuthState(options = {}) {
    const root =
      ensureState();

    const opts =
      ensureObject(options);

    const tokenValid =
      hasTokenValue(root.token);

    const forceUnauthenticated =
      opts.forceUnauthenticated === true;

    let authenticated =
      false;

    if (!forceUnauthenticated) {
      try {
        authenticated =
          Boolean(
            computeAuthenticated(
              root.user,
              root.token
            )
          );
      } catch {
        authenticated =
          Boolean(tokenValid);
      }
    }

    root.authenticated =
      authenticated;

    root.hasToken =
      tokenValid;

    root.role =
      authenticated
        ? normalizeRoleValue(
            root.user,
            root.role
          ) || null
        : null;

    root.username =
      authenticated
        ? resolveUsernameValue(
            root.user
          )
        : null;

    root.currentResolvedUsername =
      authenticated
        ? resolveCurrentUsernameValue(root)
        : null;

    root.resolvedUsername =
      root.currentResolvedUsername || null;

    return root;
  }

  function clonePublicState() {
    try {
      return cloneState(
        ensureState()
      );
    } catch {}

    try {
      return safeClone(
        ensureState()
      );
    } catch {}

    return {
      ...ensureState(),
    };
  }

  function safeEmit(name, payload = {}) {
    try {
      events?.emit?.(
        name,
        payload
      );

      return true;
    } catch {}

    return false;
  }

  async function runInitHooks(type, payload = {}) {
    const list =
      registry?.hooks?.[type];

    if (
      !Array.isArray(list) ||
      !list.length
    ) {
      return payload;
    }

    let current =
      payload;

    for (const hook of list) {
      if (!isFunction(hook)) {
        continue;
      }

      try {
        const next =
          await hook(current);

        if (
          next &&
          typeof next === "object"
        ) {
          current =
            next;
        }
      } catch (error) {
        safeWarn(
          "Hook error:",
          type,
          error
        );
      }
    }

    return current;
  }

  /* =======================================================
     STATE API
  ======================================================= */

  function setState(patch = {}, options = {}) {
    const root =
      ensureState();

    const cleanPatch =
      patch &&
      typeof patch === "object" &&
      !Array.isArray(patch)
        ? patch
        : {};

    try {
      setStateBase({
        state:
          root,

        events,

        patch:
          cleanPatch,
      });
    } catch (error) {
      try {
        Object.assign(
          root,
          cleanPatch
        );
      } catch {}

      safeWarn(
        "setStateBase falló; aplicado fallback.",
        error
      );
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        options.forceUnauthenticated === true,
    });

    return clonePublicState();
  }

  function getState() {
    syncDerivedAuthState();

    try {
      return getStateBase(
        ensureState()
      );
    } catch {
      return clonePublicState();
    }
  }

  function patchState(patch = {}, options = {}) {
    return setState(
      patch,
      options
    );
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

          return true;
        } catch {}
      }
    }

    return false;
  }

  function clearDynamicContainers() {
    try {
      return clearDynamicContainersBase({
        dom,
        events,
      });
    } catch {}

    return false;
  }

  function syncUserUI() {
    try {
      return syncUserUIBase({
        state,
        dom,
        events,
      });
    } catch (error) {
      safeWarn(
        "syncUserUIBase falló.",
        error
      );

      return false;
    }
  }

  function setShowToast(fn) {
    if (!isFunction(fn)) {
      return false;
    }

    showToastBridge =
      fn;

    return true;
  }

  function showToast(message = "", type = "info", options = {}) {
    if (!isFunction(showToastBridge)) {
      return null;
    }

    try {
      return showToastBridge(
        message,
        type,
        options
      );
    } catch (error) {
      safeWarn(
        "showToast bridge falló.",
        error
      );

      return null;
    }
  }

  /* =======================================================
     SESSION API
  ======================================================= */

  function setRoute(route = "/") {
    try {
      return setRouteBase({
        state,
        setState,
        events,
        route,
      });
    } catch (error) {
      const cleanRoute =
        normalizeCanonicalPath(
          route || "/"
        );

      setState({
        route:
          cleanRoute,
      });

      safeWarn(
        "setRouteBase falló; aplicado fallback.",
        error
      );

      return cleanRoute;
    }
  }

  function setPublicPath(path = "/") {
    try {
      return setPublicPathBase({
        state,
        storage,
        setState,
        events,
        path,
      });
    } catch (error) {
      const cleanPath =
        normalizePath(
          path || "/"
        );

      setState({
        publicPath:
          cleanPath,
      });

      safeWarn(
        "setPublicPathBase falló; aplicado fallback.",
        error
      );

      return cleanPath;
    }
  }

  function setUser(user = null) {
    let result =
      null;

    try {
      result =
        setUserBase({
          state,
          storage,
          events,
          setState,
          syncUserUI,
          user,
        });
    } catch (error) {
      setState({
        user:
          user
            ? normalizeUser(user)
            : null,
      });

      safeWarn(
        "setUserBase falló; aplicado fallback.",
        error
      );

      result =
        state.user;
    }

    syncDerivedAuthState();

    return result;
  }

  function setToken(token = null) {
    let result =
      null;

    try {
      result =
        setTokenBase({
          state,
          storage,
          events,
          setState,
          token,
        });
    } catch (error) {
      setState(
        {
          token:
            token || null,
        },
        {
          forceUnauthenticated:
            !token,
        }
      );

      safeWarn(
        "setTokenBase falló; aplicado fallback.",
        error
      );

      result =
        state.token;
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        !token,
    });

    return result;
  }

  function applySession(session = {}) {
    const payload =
      ensureObject(session);

    const token =
      Object.prototype.hasOwnProperty.call(payload, "token")
        ? payload.token
        : undefined;

    const user =
      Object.prototype.hasOwnProperty.call(payload, "user")
        ? payload.user
        : undefined;

    let result =
      null;

    try {
      result =
        applySessionBase({
          state,
          events,

          setUser:
            ({ user: nextUser }) =>
              setUser(nextUser),

          setToken:
            ({ token: nextToken }) =>
              setToken(nextToken),

          token,
          user,
        });
    } catch (error) {
      if (token !== undefined) {
        setToken(token);
      }

      if (user !== undefined) {
        setUser(user);
      }

      safeWarn(
        "applySessionBase falló; aplicado fallback.",
        error
      );

      result =
        {
          token:
            state.token,

          user:
            state.user,
        };
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        token === null,
    });

    safeEmit(
      "app:session:applied",
      {
        authenticated:
          Boolean(state.authenticated),

        hasToken:
          Boolean(state.hasToken),

        username:
          state.username || null,

        currentResolvedUsername:
          state.currentResolvedUsername || null,
      }
    );

    return result;
  }

  function clearSession(options = {}) {
    let result =
      null;

    try {
      result =
        clearSessionBase({
          state,
          storage,
          events,
          setState,
          syncUserUI,
          utils,
          options:
            ensureObject(options),
        });
    } catch (error) {
      setState(
        {
          token:
            null,

          user:
            null,

          authenticated:
            false,

          hasToken:
            false,

          role:
            null,

          username:
            null,

          currentResolvedUsername:
            null,

          resolvedUsername:
            null,
        },
        {
          forceUnauthenticated:
            true,
        }
      );

      safeWarn(
        "clearSessionBase falló; aplicado fallback.",
        error
      );

      result =
        true;
    }

    syncDerivedAuthState({
      forceUnauthenticated:
        true,
    });

    safeEmit(
      "app:session:cleared",
      {
        silent:
          Boolean(options?.silent),
      }
    );

    return result;
  }

  function setTheme(theme) {
    try {
      return setThemeBase({
        dom,
        storage,
        events,
        setState,
        theme,
      });
    } catch {
      return setState({
        theme:
          safeText(
            theme,
            "dark"
          ),
      });
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
        safeText(
          lang,
          "es"
        ).toLowerCase();

      setState({
        lang:
          cleanLang,
      });

      try {
        if (isBrowser()) {
          document.documentElement.lang =
            cleanLang;
        }
      } catch {}

      safeEmit(
        "app:lang:change",
        {
          lang:
            cleanLang,
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
      return setState({
        sidebarOpen:
          Boolean(value),
      });
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
      return setState({
        loading:
          Boolean(value),
      });
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

      return setState({
        error:
          normalized,

        hasError:
          Boolean(normalized),
      });
    }
  }

  /* =======================================================
     REQUEST
  ======================================================= */

  function createFallbackRequest() {
    return async function fallbackRequest(url, options = {}) {
      if (!isBrowser() || !isFunction(fetch)) {
        throw new Error(
          "Fetch API no disponible."
        );
      }

      const response =
        await fetch(
          url,
          options
        );

      if (!response.ok) {
        const error =
          new Error(
            response.statusText ||
              `HTTP ${response.status}`
          );

        error.status =
          response.status;

        throw error;
      }

      const contentType =
        response.headers?.get?.("content-type") || "";

      if (contentType.includes("application/json")) {
        return response.json();
      }

      return response.text();
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
      }
    );

  function createFallbackApiClient(req) {
    const call =
      isFunction(req)
        ? req
        : createFallbackRequest();

    return {
      request:
        call,

      get(url, options = {}) {
        return call(
          url,
          {
            ...options,
            method:
              "GET",
          }
        );
      },

      post(url, body = undefined, options = {}) {
        return call(
          url,
          {
            ...options,
            method:
              "POST",
            body:
              body === undefined
                ? undefined
                : JSON.stringify(body),
            headers: {
              "Content-Type":
                "application/json",
              ...(options.headers || {}),
            },
          }
        );
      },

      put(url, body = undefined, options = {}) {
        return call(
          url,
          {
            ...options,
            method:
              "PUT",
            body:
              body === undefined
                ? undefined
                : JSON.stringify(body),
            headers: {
              "Content-Type":
                "application/json",
              ...(options.headers || {}),
            },
          }
        );
      },

      patch(url, body = undefined, options = {}) {
        return call(
          url,
          {
            ...options,
            method:
              "PATCH",
            body:
              body === undefined
                ? undefined
                : JSON.stringify(body),
            headers: {
              "Content-Type":
                "application/json",
              ...(options.headers || {}),
            },
          }
        );
      },

      delete(url, options = {}) {
        return call(
          url,
          {
            ...options,
            method:
              "DELETE",
          }
        );
      },
    };
  }

  const apiClient =
    safeFactory(
      createApiClient,
      () => createFallbackApiClient(request),
      request
    );

  /* =======================================================
     READY
  ======================================================= */

  function ready(fn) {
    if (
      !isFunction(fn) ||
      !isBrowser()
    ) {
      return () => {};
    }

    if (!isDocumentReady()) {
      try {
        document.addEventListener(
          "DOMContentLoaded",
          fn,
          {
            once:
              true,
          }
        );

        return () => {
          try {
            document.removeEventListener(
              "DOMContentLoaded",
              fn
            );
          } catch {}
        };
      } catch {
        return () => {};
      }
    }

    try {
      fn();
    } catch (error) {
      safeError(
        "ready() callback error:",
        error
      );
    }

    return () => {};
  }

  /* =======================================================
     INIT HELPERS
  ======================================================= */

  function markCoreBooting(cycleId) {
    setState({
      booting:
        true,

      ready:
        false,

      initialized:
        false,

      coreInitializing:
        true,

      coreInitCycle:
        cycleId,
    });
  }

  function markCoreReady(cycleId) {
    setState({
      initialized:
        true,

      booting:
        false,

      ready:
        true,

      coreInitializing:
        false,

      coreReady:
        true,

      coreInitCycle:
        cycleId,

      coreReadyAt:
        safeIsoDate(),
    });
  }

  function markCoreError(error, cycleId) {
    setState({
      initialized:
        false,

      ready:
        false,

      booting:
        false,

      coreInitializing:
        false,

      coreReady:
        false,

      coreInitCycle:
        cycleId,

      coreErrorAt:
        safeIsoDate(),
    });

    setError(error);
  }

  function safeCacheDom() {
    try {
      cacheDom({
        dom,
        utils,
      });

      return true;
    } catch (error) {
      safeWarn(
        "cacheDom() falló.",
        error
      );

      return false;
    }
  }

  function safeValidateRequiredDom() {
    try {
      validateRequiredDom({
        dom,
        utils,
      });

      return true;
    } catch (error) {
      safeWarn(
        "validateRequiredDom() falló.",
        error
      );

      return false;
    }
  }

  function safeLoadPreferences() {
    try {
      loadPreferences({
        state,
        storage,
        dom,
      });

      return true;
    } catch (error) {
      safeWarn(
        "loadPreferences() falló.",
        error
      );

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
      safeWarn(
        "loadSession() falló.",
        error
      );

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
      safeWarn(
        "syncBaseUI() falló.",
        error
      );

      return false;
    }
  }

  function safeBindNetworkEvents() {
    if (networkEventsBound) {
      return true;
    }

    try {
      bindNetworkEvents({
        state,
        events,
        cleanup,
        utils,
      });

      networkEventsBound =
        true;

      return true;
    } catch (error) {
      safeWarn(
        "bindNetworkEvents() falló.",
        error
      );

      return false;
    }
  }

  /* =======================================================
     INIT
  ======================================================= */

  async function doInit() {
    const cycleId =
      ++initCycle;

    try {
      markCoreBooting(
        cycleId
      );

      safeEmit(
        "app:core:init:start",
        {
          cycleId,

          state:
            clonePublicState(),
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
          cycleId,
        }
      );

      safeCacheDom();
      safeValidateRequiredDom();

      safeLoadPreferences();
      safeLoadSession();

      syncDerivedAuthState();

      safeSyncBaseUI();
      safeBindNetworkEvents();

      initialized =
        true;

      markCoreReady(
        cycleId
      );

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
          cycleId,
        }
      );

      safeEmit(
        "app:core:ready",
        {
          cycleId,

          state:
            clonePublicState(),
        }
      );

      safeLog(
        "Core ready.",
        {
          cycleId,
          authenticated:
            Boolean(state.authenticated),
          hasToken:
            Boolean(state.hasToken),
          route:
            state.route || "/",
          publicPath:
            state.publicPath || "/",
          lang:
            state.lang || "es",
          theme:
            state.theme || "dark",
        }
      );

      return api;
    } catch (error) {
      initialized =
        false;

      markCoreError(
        error,
        cycleId
      );

      safeEmit(
        "app:core:init:error",
        {
          cycleId,

          error:
            cloneError(error),
        }
      );

      throw error;
    } finally {
      initPromise =
        null;
    }
  }

  async function init(options = {}) {
    const opts =
      ensureObject(options);

    if (
      !opts.force &&
      (
        initialized ||
        state.initialized
      )
    ) {
      syncDerivedAuthState();

      return api;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise =
      doInit();

    return initPromise;
  }

  function rebootCore() {
    initialized =
      false;

    initPromise =
      null;

    networkEventsBound =
      false;

    setState({
      initialized:
        false,

      ready:
        false,

      booting:
        false,

      coreReady:
        false,

      coreInitializing:
        false,
    });

    return init({
      force:
        true,
    });
  }

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  function getSnapshot() {
    syncDerivedAuthState();

    return {
      appName:
        getAppName(),

      debug:
        getDebugEnabled(),

      initialized:
        Boolean(initialized || state.initialized),

      initInFlight:
        Boolean(initPromise),

      initCycle,

      networkEventsBound:
        Boolean(networkEventsBound),

      state: {
        initialized:
          Boolean(state.initialized),

        ready:
          Boolean(state.ready),

        booting:
          Boolean(state.booting),

        loading:
          Boolean(state.loading),

        authenticated:
          Boolean(state.authenticated),

        hasToken:
          Boolean(state.hasToken),

        role:
          state.role || null,

        username:
          state.username || null,

        currentResolvedUsername:
          state.currentResolvedUsername || null,

        route:
          state.route || "/",

        publicPath:
          state.publicPath || "/",

        theme:
          state.theme || "dark",

        lang:
          state.lang || "es",

        hasError:
          Boolean(state.error || state.hasError),
      },

      dom: {
        hasViewContainer:
          Boolean(dom.viewContainer),

        hasSidebar:
          Boolean(dom.sidebar),

        hasTopbar:
          Boolean(dom.topbar),

        hasLoader:
          Boolean(dom.loader),

        hasShell:
          Boolean(dom.appShell || dom.shell),
      },

      registry: {
        moduleCount:
          registry.modules?.size || 0,

        modules:
          Array.from(
            registry.modules?.keys?.() || []
          ),

        scopeCount:
          registry.scopes?.size || 0,

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
        toast:
          Boolean(showToastBridge),
      },

      at:
        safeIsoDate(),
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = Object.freeze({
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

    request,
    apiClient,

    init,
    rebootCore,
    ready,

    getState,
    setState,
    patchState,

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

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,

    getUserDisplayName,
    getUserUsername,
    getUserAvatarUrl,
    normalizeUser,
  });

  return api;
})();

export default AppCore;

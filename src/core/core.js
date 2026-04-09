/* =========================================================
   Onion SPA - Core (FULL PRO SAAS PANEL · OLYMPUS MODE)
   Archivo: src/core/core.js

   Qué centraliza:
   - configuración global
   - estado global
   - helpers
   - cache de DOM
   - storage namespaced
   - event bus
   - cleanup scopes
   - registro de módulos
   - sesión base
   - preferencias base
   - utilidades de request
   - helpers UI / lifecycle
   - helpers de username / slug
   - diagnóstico de red / timeouts / aborts
   - init idempotente y robusta
   - compatibilidad con shell SPA actual
========================================================= */

export const AppCore = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const config = {
    appName: "Onion Support",
    version: "2.1.0",
    debug: true,

    apiBase: "https://api.onionit.net",
    requestTimeout: 15000,
    requestRetries: 0,

    defaultLang: "es",
    defaultTheme: "dark",

    storagePrefix: "onion",

    routes: {
      login: "/login",
      home: "/",
    },

    storageKeys: {
      token: "token",
      user: "user",
      theme: "theme",
      lang: "lang",
      sidebarOpen: "sidebarOpen",
      lastPublicPath: "lastPublicPath",
    },

    legacyStorageKeys: {
      token: "onion_token",
      userSlug: "onion_user_slug",
      userName: "onion_user_name",
      role: "onion_role",
      tempToken: "onion_temp_token",
    },

    ui: {
      themeColorDark: "#0a0c11",
      themeColorLight: "#f4f7fb",
    },

    auth: {
      bearerPrefix: "Bearer",
      publicApiPaths: [
        "/api/auth/login",
        "/api/auth/refresh",
        "/api/auth/reset-password-request",
        "/api/auth/reset-password-confirm",
        "/api/auth/activate/first-user",
        "/api/auth/2fa/login",
        "/api/auth/_health",
      ],
    },
  };

  /* =========================================================
     PRIVADOS / FLAGS
  ========================================================= */
  let initPromise = null;
  let initDone = false;

  /* =========================================================
     HELPERS PRIVADOS BASE
  ========================================================= */
  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isDocumentReady() {
    return isBrowser() && document.readyState !== "loading";
  }

  function now() {
    return Date.now();
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isDomScope(scope) {
    if (!isBrowser()) return false;
    if (!scope) return false;

    return (
      scope === document ||
      scope === window ||
      scope instanceof Element ||
      scope instanceof Document ||
      scope instanceof DocumentFragment
    );
  }

  function normalizeListenerOptions(options) {
    if (typeof options === "boolean") {
      return { capture: options };
    }

    if (isPlainObject(options)) {
      return { ...options };
    }

    return { capture: false };
  }

  function buildStorageKey(key) {
    return `${config.storagePrefix}:${key}`;
  }

  function safeParse(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function safeClone(value, fallback = null) {
    if (value === undefined) return fallback;

    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch {
      /* noop */
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function cloneError(error = null) {
    if (!error) return null;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack || null,
      };
    }

    if (typeof error === "object") {
      return safeClone(error, {
        message: String(error),
      });
    }

    return { message: String(error) };
  }

  function sanitizeUsername(value = "") {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();
  }

  function slugify(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeApiBase(base = "") {
    return String(base || "").trim().replace(/\/+$/, "");
  }

  function normalizePath(path = "/") {
    if (path === null || path === undefined) return "/";

    let raw = String(path).trim();

    if (!raw) return "/";
    if (raw.startsWith("#")) return "/";

    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        raw = `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return "/";
      }
    }

    raw = raw.replace(/^[.][/]+/, "/");

    if (!raw.startsWith("/")) {
      raw = `/${raw}`;
    }

    raw = raw.replace(/\/{2,}/g, "/");

    const hashIndex = raw.indexOf("#");
    const searchIndex = raw.indexOf("?");
    let cutIndex = -1;

    if (searchIndex >= 0 && hashIndex >= 0) {
      cutIndex = Math.min(searchIndex, hashIndex);
    } else if (searchIndex >= 0) {
      cutIndex = searchIndex;
    } else if (hashIndex >= 0) {
      cutIndex = hashIndex;
    }

    const pathname = cutIndex >= 0 ? raw.slice(0, cutIndex) : raw;
    const suffix = cutIndex >= 0 ? raw.slice(cutIndex) : "";

    let cleanPathname = pathname || "/";

    if (cleanPathname.length > 1) {
      cleanPathname = cleanPathname.replace(/\/+$/, "");
    }

    cleanPathname = cleanPathname || "/";

    return `${cleanPathname}${suffix}`;
  }

  function stripUsernamePrefix(path = "/") {
    const normalized = normalizePath(path);
    const match = normalized.match(/^([^?#]*)(.*)$/);
    const pathOnly = match?.[1] || "/";
    const suffix = match?.[2] || "";
    const stripped = pathOnly.replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";

    return normalizePath(`${stripped}${suffix}`);
  }

  function normalizeCanonicalPath(path = "/") {
    const normalized = normalizePath(path);
    const noSlug = stripUsernamePrefix(normalized);
    const [pathOnly] = noSlug.split(/[?#]/);
    return normalizePath(pathOnly || "/");
  }

  function joinUrl(base, path = "") {
    const cleanBase = normalizeApiBase(base);
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  }

  function buildUrl(path, query = null) {
    const rawPath = String(path || "").trim();
    const apiBase = normalizeApiBase(config.apiBase);

    const baseUrl = /^https?:\/\//i.test(rawPath)
      ? rawPath
      : joinUrl(apiBase, rawPath);

    if (!query || !isPlainObject(query) || Object.keys(query).length === 0) {
      return baseUrl;
    }

    const origin = isBrowser() ? window.location.origin : "http://localhost";
    const url = new URL(baseUrl, origin);

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== "") {
            url.searchParams.append(key, String(item));
          }
        });
        return;
      }

      url.searchParams.set(key, String(value));
    });

    return url.toString();
  }

  function hasValidToken(token = null) {
    return Boolean(token && String(token).trim());
  }

  function isPublicApiPath(path = "") {
    const normalized = normalizeCanonicalPath(path);
    return config.auth.publicApiPaths.some(
      (publicPath) => normalizeCanonicalPath(publicPath) === normalized
    );
  }

  function normalizeUser(user = null) {
    if (!user || typeof user !== "object") return null;

    const username = sanitizeUsername(
      user.username ||
      user.userName ||
      user.nick ||
      user.alias ||
      user.login ||
      user.slug ||
      ""
    );

    const name =
      user.name ||
      user.nombre ||
      user.full_name ||
      user.fullName ||
      user.display_name ||
      user.displayName ||
      user.username ||
      user.email ||
      "Usuario";

    const role =
      user.role ||
      user.rol ||
      user.type ||
      user.user_type ||
      user.userType ||
      null;

    const slug = user.slug || slugify(username || name || "usuario");

    return {
      ...user,
      id: user.id ?? user.user_id ?? user.uuid ?? user._id ?? null,
      username,
      slug,
      name,
      email: user.email || user.mail || "",
      role,
      avatar:
        user.avatar ||
        user.avatarUrl ||
        user.photo ||
        user.image ||
        user.profileImage ||
        user.picture ||
        null,
      active: user.active ?? user.is_active ?? user.isActive ?? true,
    };
  }

  function getUserDisplayName(user = null) {
    const target = user || state.user;

    return (
      target?.name ||
      target?.nombre ||
      target?.username ||
      target?.email ||
      "Usuario"
    );
  }

  function getUserUsername(user = null) {
    const target = user || state.user;

    return sanitizeUsername(
      target?.username ||
      target?.userName ||
      target?.nick ||
      target?.alias ||
      target?.login ||
      ""
    );
  }

  function getUserAvatarUrl(user = null) {
    const target = user || state.user;

    return String(
      target?.avatar ||
      target?.avatarUrl ||
      target?.photo ||
      target?.image ||
      target?.profileImage ||
      target?.picture ||
      ""
    ).trim();
  }

  function getInitials(value = "") {
    return String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2);
  }

  function getCurrentLocationPath() {
    if (!isBrowser()) return "/";
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  function getCurrentLocationCanonicalPath() {
    if (!isBrowser()) return "/";
    return normalizeCanonicalPath(
      `${window.location.pathname || "/"}${window.location.search || ""}`
    );
  }

  async function runHookSeries(hooks = [], payload) {
    let current = payload;

    for (const hook of hooks) {
      try {
        const result = await hook(current);
        if (result !== undefined) {
          current = result;
        }
      } catch (error) {
        if (config.debug) {
          console.error(`[${config.appName}] Error ejecutando hook`, error);
        }
      }
    }

    return current;
  }

  function getThemeColor(theme = config.defaultTheme) {
    return theme === "light"
      ? config.ui.themeColorLight
      : config.ui.themeColorDark;
  }

  function createAbortTimeout(ms = config.requestTimeout) {
    const controller = new AbortController();
    const normalizedMs = Number(ms);

    if (!Number.isFinite(normalizedMs) || normalizedMs <= 0) {
      return { controller, timeoutId: null };
    }

    const timeoutId = setTimeout(() => {
      try {
        controller.abort("timeout");
      } catch {
        controller.abort();
      }
    }, normalizedMs);

    return { controller, timeoutId };
  }

  function normalizeHeaders(headers = {}) {
    return Object.entries(headers || {}).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  function mergeAbortSignals(signals = []) {
    const validSignals = signals.filter(Boolean);

    if (!validSignals.length) return null;
    if (validSignals.length === 1) return validSignals[0];

    const controller = new AbortController();

    function abortFrom(sourceSignal) {
      if (controller.signal.aborted) return;

      try {
        controller.abort(sourceSignal?.reason || "aborted");
      } catch {
        controller.abort();
      }
    }

    validSignals.forEach((signal) => {
      if (signal.aborted) {
        abortFrom(signal);
        return;
      }

      signal.addEventListener(
        "abort",
        () => {
          abortFrom(signal);
        },
        { once: true }
      );
    });

    return controller.signal;
  }

  function isAbortError(error) {
    return (
      error?.name === "AbortError" ||
      error?.code === 20 ||
      String(error?.message || "").toLowerCase().includes("aborted")
    );
  }

  function isProbablyTimeoutError(error) {
    const message = String(error?.message || "").toLowerCase();
    const raw = String(error?.raw || "").toLowerCase();

    return (
      message.includes("timeout") ||
      raw.includes("timeout") ||
      error?.timeout === true
    );
  }

  function detectNetworkHints(url = "") {
    const hints = [];

    if (!isBrowser()) return hints;

    if (navigator.onLine === false) {
      hints.push("El navegador parece estar offline.");
    }

    if (/^https:\/\//i.test(url) && window.location.protocol === "http:") {
      hints.push("Hay mezcla de protocolos: frontend en HTTP y API en HTTPS.");
    }

    if (/^http:\/\//i.test(url) && window.location.protocol === "https:") {
      hints.push("Hay mezcla de protocolos: frontend en HTTPS y API en HTTP.");
    }

    const apiOrigin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return null;
      }
    })();

    if (apiOrigin && apiOrigin !== window.location.origin) {
      hints.push("Petición cross-origin: revisa CORS y preflight OPTIONS.");
    }

    return hints;
  }

  function removeLegacySessionKeys() {
    if (!isBrowser()) return;

    try {
      Object.values(config.legacyStorageKeys).forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      if (config.debug) {
        console.warn(`[${config.appName}] No se pudieron borrar claves legacy`, error);
      }
    }
  }

  /* =========================================================
     ESTADO GLOBAL
  ========================================================= */
  const state = {
    initialized: false,
    booting: false,
    ready: false,

    route: getCurrentLocationCanonicalPath(),
    publicPath: getCurrentLocationPath(),

    user: null,
    token: null,
    role: null,
    authenticated: false,

    lang: config.defaultLang,
    theme: config.defaultTheme,

    sidebarOpen: true,
    loading: true,

    lastError: null,
    lastRoute: null,
    lastRequestAt: null,
    lastRequestUrl: null,
    online: isBrowser() ? navigator.onLine !== false : true,
  };

  function cloneState() {
    return {
      ...state,
      user: state.user ? safeClone(state.user, state.user) : null,
      lastError: cloneError(state.lastError),
    };
  }

  /* =========================================================
     CACHE DOM
  ========================================================= */
  const dom = {
    html: null,
    body: null,
    themeColorMeta: null,

    layout: null,
    loader: null,
    sidebar: null,
    sidebarMenu: null,
    mainContent: null,
    viewContainer: null,

    topbar: null,
    topbarTitle: null,
    topbarViewContainer: null,
    tableheadContainer: null,

    searchInput: null,
    searchResults: null,

    userToggle: null,
    userDropdown: null,
    logoutBtn: null,
    sidebarToggle: null,
    sidebarMobileToggle: null,
    sidebarAvatar: null,
    sidebarName: null,
  };

  /* =========================================================
     REGISTRO INTERNO
  ========================================================= */
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

  /* =========================================================
     UTILS
  ========================================================= */
  const utils = {
    qs(selector, scope = document) {
      if (!isBrowser()) return null;
      if (!selector || !isDomScope(scope)) return null;
      return scope.querySelector(selector);
    },

    qsa(selector, scope = document) {
      if (!isBrowser()) return [];
      if (!selector || !isDomScope(scope)) return [];
      return Array.from(scope.querySelectorAll(selector));
    },

    create(tag, options = {}) {
      if (!isBrowser()) return null;

      const el = document.createElement(tag);

      if (options.className) el.className = options.className;
      if (options.id) el.id = options.id;
      if (options.text !== undefined) el.textContent = options.text;
      if (options.html !== undefined) el.innerHTML = options.html;

      if (isPlainObject(options.attrs)) {
        Object.entries(options.attrs).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            el.setAttribute(key, String(value));
          }
        });
      }

      return el;
    },

    on(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== "function") {
        return () => {};
      }

      target.addEventListener(event, handler, options);

      return () => {
        target.removeEventListener(event, handler, options);
      };
    },

    off(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== "function") return;
      target.removeEventListener(event, handler, options);
    },

    once(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== "function") {
        return () => {};
      }

      const finalOptions = {
        ...normalizeListenerOptions(options),
        once: true,
      };

      target.addEventListener(event, handler, finalOptions);

      return () => {
        target.removeEventListener(event, handler, finalOptions);
      };
    },

    log(...args) {
      if (!config.debug) return;
      console.log(`[${config.appName}]`, ...args);
    },

    warn(...args) {
      if (!config.debug) return;
      console.warn(`[${config.appName}]`, ...args);
    },

    error(...args) {
      console.error(`[${config.appName}]`, ...args);
    },

    sleep(ms = 0) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    capitalize(value = "") {
      if (!value) return "";
      return value.charAt(0).toUpperCase() + value.slice(1);
    },

    debounce(fn, delay = 250) {
      let timeoutId = null;

      return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          fn(...args);
        }, delay);
      };
    },

    throttle(fn, limit = 250) {
      let inThrottle = false;
      let lastArgs = null;

      return (...args) => {
        if (inThrottle) {
          lastArgs = args;
          return;
        }

        inThrottle = true;
        fn(...args);

        setTimeout(() => {
          inThrottle = false;

          if (lastArgs) {
            const queuedArgs = lastArgs;
            lastArgs = null;
            fn(...queuedArgs);
            inThrottle = true;

            setTimeout(() => {
              inThrottle = false;
            }, limit);
          }
        }, limit);
      };
    },

    escapeHtml(value = "") {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    },

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

  /* =========================================================
     STORAGE
  ========================================================= */
  const storage = {
    get(key, fallback = null) {
      if (!isBrowser()) return fallback;

      try {
        const raw = localStorage.getItem(buildStorageKey(key));
        if (raw === null) return fallback;
        return safeParse(raw, fallback);
      } catch (error) {
        utils.warn(`No se pudo leer storage: ${key}`, error);
        return fallback;
      }
    },

    getRaw(key, fallback = null) {
      if (!isBrowser()) return fallback;

      try {
        const raw = localStorage.getItem(buildStorageKey(key));
        return raw === null ? fallback : raw;
      } catch (error) {
        utils.warn(`No se pudo leer storage raw: ${key}`, error);
        return fallback;
      }
    },

    set(key, value) {
      if (!isBrowser()) return false;

      try {
        localStorage.setItem(buildStorageKey(key), JSON.stringify(value));
        return true;
      } catch (error) {
        utils.warn(`No se pudo guardar storage: ${key}`, error);
        return false;
      }
    },

    setRaw(key, value) {
      if (!isBrowser()) return false;

      try {
        localStorage.setItem(buildStorageKey(key), String(value));
        return true;
      } catch (error) {
        utils.warn(`No se pudo guardar storage raw: ${key}`, error);
        return false;
      }
    },

    remove(key) {
      if (!isBrowser()) return false;

      try {
        localStorage.removeItem(buildStorageKey(key));
        return true;
      } catch (error) {
        utils.warn(`No se pudo borrar storage: ${key}`, error);
        return false;
      }
    },

    has(key) {
      if (!isBrowser()) return false;

      try {
        return localStorage.getItem(buildStorageKey(key)) !== null;
      } catch {
        return false;
      }
    },

    clearAll() {
      if (!isBrowser()) return false;

      try {
        const keysToRemove = [];

        for (let i = 0; i < localStorage.length; i += 1) {
          const currentKey = localStorage.key(i);
          if (currentKey && currentKey.startsWith(`${config.storagePrefix}:`)) {
            keysToRemove.push(currentKey);
          }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));
        removeLegacySessionKeys();
        return true;
      } catch (error) {
        utils.warn("No se pudo limpiar el storage de la app", error);
        return false;
      }
    },
  };

  /* =========================================================
     EVENT BUS
  ========================================================= */
  const events = {
    emit(name, detail = {}) {
      if (!isBrowser()) return;
      document.dispatchEvent(new CustomEvent(name, { detail }));
    },

    on(name, handler, options = false) {
      if (!isBrowser() || !name || typeof handler !== "function") {
        return () => {};
      }

      document.addEventListener(name, handler, options);

      return () => {
        document.removeEventListener(name, handler, options);
      };
    },

    off(name, handler, options = false) {
      if (!isBrowser() || !name || typeof handler !== "function") return;
      document.removeEventListener(name, handler, options);
    },

    once(name, handler, options = false) {
      if (!isBrowser() || !name || typeof handler !== "function") {
        return () => {};
      }

      const finalOptions = {
        ...normalizeListenerOptions(options),
        once: true,
      };

      document.addEventListener(name, handler, finalOptions);

      return () => {
        document.removeEventListener(name, handler, finalOptions);
      };
    },
  };

  /* =========================================================
     CLEANUP SCOPES
  ========================================================= */
  function ensureScope(name = "global") {
    if (!registry.scopes.has(name)) {
      registry.scopes.set(name, {
        listeners: [],
        cleaners: [],
      });
    }

    return registry.scopes.get(name);
  }

  const cleanup = {
    scope(name = "global") {
      ensureScope(name);
      return name;
    },

    on(scopeName = "global", target, event, handler, options = false) {
      const scope = ensureScope(scopeName);

      if (!target || !event || typeof handler !== "function") {
        return () => {};
      }

      target.addEventListener(event, handler, options);

      const disposer = () => {
        target.removeEventListener(event, handler, options);
      };

      scope.listeners.push(disposer);
      return disposer;
    },

    event(scopeName = "global", name, handler, options = false) {
      const off = events.on(name, handler, options);
      const scope = ensureScope(scopeName);
      scope.cleaners.push(off);
      return off;
    },

    add(scopeName = "global", disposer) {
      if (typeof disposer !== "function") return () => {};
      const scope = ensureScope(scopeName);
      scope.cleaners.push(disposer);
      return disposer;
    },

    run(scopeName = "global") {
      const scope = registry.scopes.get(scopeName);
      if (!scope) return;

      [...scope.listeners, ...scope.cleaners].forEach((dispose) => {
        try {
          dispose();
        } catch (error) {
          utils.warn(`Error limpiando scope "${scopeName}"`, error);
        }
      });

      registry.scopes.delete(scopeName);
    },

    runAll() {
      Array.from(registry.scopes.keys()).forEach((scopeName) => {
        cleanup.run(scopeName);
      });
    },
  };

  /* =========================================================
     REGISTRO DE MÓDULOS
  ========================================================= */
  const modules = {
    register(name, instance) {
      if (!name) {
        throw new Error("modules.register(name, instance) requiere un nombre");
      }

      registry.modules.set(name, instance);
      events.emit("app:module:registered", { name, instance });
      return instance;
    },

    get(name) {
      return registry.modules.get(name) || null;
    },

    has(name) {
      return registry.modules.has(name);
    },

    unregister(name) {
      const exists = registry.modules.has(name);

      if (!exists) return false;

      const instance = registry.modules.get(name);
      registry.modules.delete(name);

      events.emit("app:module:unregistered", { name, instance });
      return true;
    },

    list() {
      return Array.from(registry.modules.keys());
    },
  };

  /* =========================================================
     HOOKS
  ========================================================= */
  const hooks = {
    add(type, handler) {
      if (!registry.hooks[type]) {
        throw new Error(`Hook desconocido: ${type}`);
      }

      if (typeof handler !== "function") {
        throw new Error("El hook debe ser una función");
      }

      registry.hooks[type].push(handler);

      return () => {
        registry.hooks[type] = registry.hooks[type].filter(
          (fn) => fn !== handler
        );
      };
    },

    types() {
      return Object.keys(registry.hooks);
    },
  };

  /* =========================================================
     STATE
  ========================================================= */
  function computeAuthenticated(
    nextUser = state.user,
    nextToken = state.token
  ) {
    const normalizedUser = normalizeUser(nextUser);
    const validToken = hasValidToken(nextToken);

    return Boolean(validToken && normalizedUser?.active !== false);
  }

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") return cloneState();

    const previousState = cloneState();
    const normalizedPatch = { ...patch };

    if (Object.prototype.hasOwnProperty.call(normalizedPatch, "user")) {
      normalizedPatch.user = normalizeUser(normalizedPatch.user);
      normalizedPatch.role = normalizedPatch.user?.role || null;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedPatch, "token")) {
      normalizedPatch.token = hasValidToken(normalizedPatch.token)
        ? String(normalizedPatch.token).trim()
        : null;
    }

    const shouldRecomputeAuth =
      Object.prototype.hasOwnProperty.call(normalizedPatch, "user") ||
      Object.prototype.hasOwnProperty.call(normalizedPatch, "token") ||
      Object.prototype.hasOwnProperty.call(normalizedPatch, "authenticated");

    if (shouldRecomputeAuth) {
      normalizedPatch.authenticated = computeAuthenticated(
        Object.prototype.hasOwnProperty.call(normalizedPatch, "user")
          ? normalizedPatch.user
          : state.user,
        Object.prototype.hasOwnProperty.call(normalizedPatch, "token")
          ? normalizedPatch.token
          : state.token
      );
    }

    Object.assign(state, normalizedPatch);

    events.emit("app:state:change", {
      state: cloneState(),
      patch: normalizedPatch,
      previousState,
    });

    return cloneState();
  }

  function getState() {
    return cloneState();
  }

  function setRoute(route = "/") {
    const normalizedRoute = normalizeCanonicalPath(route);

    setState({
      lastRoute: state.route,
      route: normalizedRoute,
    });

    events.emit("app:route:change", {
      route: normalizedRoute,
      previousRoute: state.lastRoute,
    });

    return normalizedRoute;
  }

  function setPublicPath(path = "/") {
    const normalizedPath = normalizePath(path);

    setState({
      publicPath: normalizedPath,
    });

    storage.set(config.storageKeys.lastPublicPath, normalizedPath);

    events.emit("app:public-path:change", {
      publicPath: normalizedPath,
    });

    return normalizedPath;
  }

  function setUser(user = null) {
    const normalizedUser = normalizeUser(user);
    const authenticated = computeAuthenticated(normalizedUser, state.token);

    setState({
      user: normalizedUser,
      role: normalizedUser?.role || null,
      authenticated,
    });

    if (normalizedUser) {
      storage.set(config.storageKeys.user, normalizedUser);
    } else {
      storage.remove(config.storageKeys.user);
    }

    syncUserUI();

    events.emit("app:user:change", {
      user: normalizedUser,
      authenticated,
      username: normalizedUser?.username || null,
      avatarUrl: normalizedUser?.avatar || null,
    });

    return normalizedUser;
  }

  function setToken(token = null) {
    const normalizedToken = hasValidToken(token) ? String(token).trim() : null;
    const authenticated = computeAuthenticated(state.user, normalizedToken);

    setState({
      token: normalizedToken,
      authenticated,
    });

    if (normalizedToken) {
      storage.set(config.storageKeys.token, normalizedToken);
    } else {
      storage.remove(config.storageKeys.token);
    }

    events.emit("app:token:change", {
      token: normalizedToken,
      authenticated,
    });

    return normalizedToken;
  }

  function applySession({ token = undefined, user = undefined } = {}) {
    if (token !== undefined) {
      setToken(token);
    }

    if (user !== undefined) {
      setUser(user);
    }

    const snapshot = {
      authenticated: state.authenticated,
      token: state.token,
      user: state.user,
      role: state.role,
    };

    events.emit("app:session:applied", snapshot);
    return snapshot;
  }

  function clearSession() {
    storage.remove(config.storageKeys.user);
    storage.remove(config.storageKeys.token);
    removeLegacySessionKeys();

    setState({
      user: null,
      token: null,
      role: null,
      authenticated: false,
    });

    syncUserUI();

    events.emit("app:session:cleared", {
      authenticated: false,
      token: null,
      user: null,
      role: null,
    });
  }

  function syncThemeMetaColor(theme = config.defaultTheme) {
    if (!dom.themeColorMeta) return;
    dom.themeColorMeta.setAttribute("content", getThemeColor(theme));
  }

  function setTheme(theme = config.defaultTheme) {
    const normalizedTheme = theme === "light" ? "light" : "dark";

    setState({ theme: normalizedTheme });
    storage.set(config.storageKeys.theme, normalizedTheme);

    if (dom.html) {
      dom.html.setAttribute("data-theme", normalizedTheme);
    }

    syncThemeMetaColor(normalizedTheme);

    events.emit("app:theme:change", {
      theme: normalizedTheme,
    });

    return normalizedTheme;
  }

  function setLang(lang = config.defaultLang) {
    const normalizedLang =
      String(lang || config.defaultLang).trim() || config.defaultLang;

    setState({ lang: normalizedLang });
    storage.set(config.storageKeys.lang, normalizedLang);

    if (dom.html) {
      dom.html.setAttribute("lang", normalizedLang);
    }

    events.emit("app:lang:change", {
      lang: normalizedLang,
    });

    return normalizedLang;
  }

  function setSidebarOpen(value) {
    const nextValue = Boolean(value);

    setState({ sidebarOpen: nextValue });
    storage.set(config.storageKeys.sidebarOpen, nextValue);

    if (dom.body) {
      dom.body.classList.toggle("sidebar-collapsed", !nextValue);
      dom.body.classList.toggle("sidebar-open", nextValue);
    }

    if (dom.sidebar) {
      dom.sidebar.classList.toggle("collapsed", !nextValue);
      dom.sidebar.classList.toggle("open", nextValue);
      dom.sidebar.classList.toggle("is-collapsed", !nextValue);
      dom.sidebar.classList.toggle("is-open", nextValue);
    }

    if (dom.sidebarToggle) {
      dom.sidebarToggle.setAttribute("aria-expanded", String(nextValue));
    }

    if (dom.sidebarMobileToggle) {
      dom.sidebarMobileToggle.setAttribute("aria-expanded", String(nextValue));
    }

    events.emit("app:sidebar:change", {
      open: nextValue,
    });

    return nextValue;
  }

  function setLoading(value) {
    const nextValue = Boolean(value);

    setState({ loading: nextValue });

    if (dom.body) {
      dom.body.classList.toggle("loading", nextValue);
    }

    if (dom.loader) {
      dom.loader.hidden = !nextValue;
      dom.loader.setAttribute("aria-hidden", String(!nextValue));
    }

    events.emit("app:loading:change", {
      loading: nextValue,
    });

    return nextValue;
  }

  function setError(error = null) {
    const normalized = error ? cloneError(error) || error : null;
    setState({ lastError: normalized });
    events.emit("app:error", { error: normalized });
    return normalized;
  }

  /* =========================================================
     UI HELPERS
  ========================================================= */
  function setDocumentTitle(title = config.appName) {
    if (!isBrowser()) return;

    const safeTitle = String(title || config.appName);
    document.title = safeTitle;

    if (dom.topbarTitle) {
      dom.topbarTitle.textContent = safeTitle;
    }

    events.emit("app:title:change", { title: safeTitle });
  }

  function clearDynamicContainers() {
    if (dom.topbarViewContainer) {
      dom.topbarViewContainer.innerHTML = "";
    }

    if (dom.tableheadContainer) {
      dom.tableheadContainer.innerHTML = "";
    }

    events.emit("app:dynamic:cleared", {});
  }

  function syncUserUI() {
    const user = state.user;
    const displayName = getUserDisplayName(user);
    const username = getUserUsername(user);
    const avatarText =
      getInitials(displayName) ||
      (username ? username.slice(0, 2).toUpperCase() : "ON");
    const avatarUrl = getUserAvatarUrl(user);

    if (dom.sidebarName) {
      dom.sidebarName.textContent = displayName;

      if (username) {
        dom.sidebarName.dataset.username = username;
      } else {
        delete dom.sidebarName.dataset.username;
      }
    }

    if (dom.sidebarAvatar) {
      if (!avatarUrl) {
        const avatarImage = dom.sidebarAvatar.querySelector("img[data-avatar-image]");
        if (avatarImage) avatarImage.remove();
        dom.sidebarAvatar.textContent = avatarText;
        dom.sidebarAvatar.classList.remove("has-image");
      } else {
        let avatarImage = dom.sidebarAvatar.querySelector("img[data-avatar-image]");

        if (!avatarImage) {
          avatarImage = document.createElement("img");
          avatarImage.dataset.avatarImage = "true";
          avatarImage.loading = "lazy";
          dom.sidebarAvatar.innerHTML = "";
          dom.sidebarAvatar.appendChild(avatarImage);
        }

        avatarImage.src = avatarUrl;
        avatarImage.alt = `Avatar ${displayName}`;
        dom.sidebarAvatar.classList.add("has-image");
      }

      dom.sidebarAvatar.setAttribute("aria-label", `Avatar ${displayName}`);
      dom.sidebarAvatar.setAttribute("title", displayName);

      if (username) {
        dom.sidebarAvatar.dataset.username = username;
      } else {
        delete dom.sidebarAvatar.dataset.username;
      }
    }

    events.emit("app:user-ui:sync", {
      displayName,
      avatarText,
      avatarUrl: avatarUrl || null,
      username: username || null,
    });
  }

  /* =========================================================
     DOM
  ========================================================= */
  function cacheDom() {
    if (!isBrowser()) return;

    dom.html = document.documentElement || null;
    dom.body = document.body || null;
    dom.themeColorMeta = utils.qs('meta[name="theme-color"]');

    dom.layout = utils.qs(".layout");
    dom.loader = utils.qs("#app-loader");
    dom.sidebar = utils.qs(".sidebar");
    dom.sidebarMenu = utils.qs("#sidebar-menu") || utils.qs(".sidebar-menu");
    dom.mainContent = utils.qs("#app-content");
    dom.viewContainer = utils.qs("#view-container");

    dom.topbar = utils.qs(".topbar");
    dom.topbarTitle = utils.qs("#topbar-title");
    dom.topbarViewContainer = utils.qs("#topbarview-container");
    dom.tableheadContainer = utils.qs("#tablehead-container");

    dom.searchInput = utils.qs("#topbar-search");
    dom.searchResults = utils.qs("#topbar-search-results");

    dom.userToggle = utils.qs("#userToggle");
    dom.userDropdown = utils.qs("#userDropdown");
    dom.logoutBtn = utils.qs("#logoutBtn");
    dom.sidebarToggle = utils.qs("#toggleSidebar");
    dom.sidebarMobileToggle = utils.qs("#toggleSidebarMobile");
    dom.sidebarAvatar = utils.qs("#sidebar-avatar");
    dom.sidebarName = utils.qs("#sidebar-name");
  }

  function validateRequiredDom() {
    const required = [
      ["body", dom.body],
      ["layout", dom.layout],
      ["mainContent", dom.mainContent],
      ["viewContainer", dom.viewContainer],
    ];

    const missing = required
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      utils.warn("Faltan nodos importantes del layout:", missing);
    }

    return missing;
  }

  /* =========================================================
     PREFERENCIAS / SESIÓN
  ========================================================= */
  function loadPreferences() {
    const savedTheme = storage.get(
      config.storageKeys.theme,
      config.defaultTheme
    );
    const savedLang = storage.get(config.storageKeys.lang, config.defaultLang);
    const savedSidebarOpen = storage.get(config.storageKeys.sidebarOpen, true);

    state.theme = savedTheme === "light" ? "light" : "dark";
    state.lang = savedLang || config.defaultLang;
    state.sidebarOpen =
      typeof savedSidebarOpen === "boolean" ? savedSidebarOpen : true;

    if (dom.html) {
      dom.html.setAttribute("data-theme", state.theme);
      dom.html.setAttribute("lang", state.lang);
    }

    syncThemeMetaColor(state.theme);

    if (dom.body) {
      dom.body.classList.toggle("sidebar-collapsed", !state.sidebarOpen);
      dom.body.classList.toggle("sidebar-open", state.sidebarOpen);
      dom.body.classList.toggle("loading", state.loading);
    }

    if (dom.sidebar) {
      dom.sidebar.classList.toggle("collapsed", !state.sidebarOpen);
      dom.sidebar.classList.toggle("open", state.sidebarOpen);
      dom.sidebar.classList.toggle("is-collapsed", !state.sidebarOpen);
      dom.sidebar.classList.toggle("is-open", state.sidebarOpen);
    }

    if (dom.sidebarToggle) {
      dom.sidebarToggle.setAttribute("aria-expanded", String(state.sidebarOpen));
    }

    if (dom.sidebarMobileToggle) {
      dom.sidebarMobileToggle.setAttribute("aria-expanded", String(state.sidebarOpen));
    }

    if (dom.loader) {
      dom.loader.hidden = !state.loading;
      dom.loader.setAttribute("aria-hidden", String(!state.loading));
    }
  }

  function loadSession() {
    const savedUser = normalizeUser(storage.get(config.storageKeys.user, null));
    const savedToken = storage.get(config.storageKeys.token, null);

    state.user = savedUser;
    state.token = hasValidToken(savedToken) ? String(savedToken).trim() : null;
    state.role = savedUser?.role || null;
    state.authenticated = computeAuthenticated(savedUser, state.token);
  }

  function syncBaseUI() {
    setDocumentTitle(config.appName);
    syncUserUI();
  }

  /* =========================================================
     RESPONSE PARSING
  ========================================================= */
  async function parseResponseBody(response, responseType = "auto") {
    if (!response) return null;
    if (response.status === 204) return null;

    const contentType = String(response.headers.get("content-type") || "")
      .trim()
      .toLowerCase();

    if (responseType === "blob") return response.blob();
    if (responseType === "arrayBuffer") return response.arrayBuffer();

    if (responseType === "text") {
      try {
        return await response.text();
      } catch {
        return "";
      }
    }

    if (responseType === "json") {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    try {
      return await response.text();
    } catch {
      return null;
    }
  }

  function buildRequestError({
    response = null,
    data = null,
    url = "",
    method = "",
    timeout = false,
    aborted = false,
    raw = null,
  }) {
    if (!response) {
      const hints = detectNetworkHints(url);

      return {
        status: 0,
        statusText: timeout
          ? "Request Timeout"
          : aborted
          ? "Request Aborted"
          : "Network Error",
        data,
        url,
        method,
        timeout,
        aborted,
        raw,
        hints,
        message: timeout
          ? "La petición excedió el tiempo máximo."
          : aborted
          ? "La petición fue cancelada."
          : "No se pudo completar la petición.",
      };
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data,
      url,
      method,
      timeout,
      aborted,
      raw,
      message:
        data?.message ||
        data?.error ||
        data?.detail ||
        response.statusText ||
        "Error de petición",
    };
  }

  function shouldRetryRequest(error, requestConfig) {
    const method = String(requestConfig?.method || "GET").toUpperCase();
    const retries = Number(requestConfig?.retries ?? config.requestRetries ?? 0);

    if (retries <= 0) return false;
    if (!["GET", "HEAD"].includes(method)) return false;

    if (error?.status >= 500) return true;
    if (error?.status === 0) return true;

    return false;
  }

  async function executeFetchWithRetry(url, fetchConfig, requestConfig) {
    const retries = Number(requestConfig?.retries ?? config.requestRetries ?? 0);
    const baseDelay = Number(requestConfig?.retryDelay ?? 250);
    const maxDelay = Number(requestConfig?.retryMaxDelay ?? 3000);
    let attempt = 0;
    let lastError = null;

    while (attempt <= retries) {
      try {
        return await fetch(url, fetchConfig);
      } catch (error) {
        lastError = error;
        if (attempt >= retries) throw error;
        const backoff = Math.min(
          maxDelay,
          Math.max(baseDelay, baseDelay * 2 ** attempt)
        );
        const jitter = Math.floor(Math.random() * Math.max(1, baseDelay));
        await utils.sleep(backoff + jitter);
      }
      attempt += 1;
    }

    throw lastError;
  }

  /* =========================================================
     REQUEST
  ========================================================= */
  async function request(path, options = {}) {
    let requestConfig = {
      method: "GET",
      headers: {},
      body: null,
      auth: !isPublicApiPath(path),
      timeout: config.requestTimeout,
      raw: false,
      responseType: "auto",
      query: null,
      credentials: "omit",
      signal: null,
      retries: config.requestRetries,
      ...options,
      path,
    };

    requestConfig = await runHookSeries(
      registry.hooks.beforeRequest,
      requestConfig
    );

    const {
      method = "GET",
      headers = {},
      body = null,
      auth = !isPublicApiPath(requestConfig.path),
      timeout = config.requestTimeout,
      raw = false,
      responseType = "auto",
      query = null,
      credentials = "omit",
      signal = null,
      retries = config.requestRetries,
    } = requestConfig;

    const url = buildUrl(requestConfig.path, query);
    const upperMethod = String(method || "GET").toUpperCase();

    const finalHeaders = normalizeHeaders({
      Accept: "application/json",
      ...headers,
    });

    if (auth && hasValidToken(state.token)) {
      finalHeaders.Authorization = `${config.auth.bearerPrefix} ${state.token}`;
    }

    const isFormData =
      isBrowser() &&
      typeof FormData !== "undefined" &&
      body instanceof FormData;

    const isBodyAllowed = !["GET", "HEAD"].includes(upperMethod);

    if (
      !isFormData &&
      body !== null &&
      isBodyAllowed &&
      !finalHeaders["Content-Type"]
    ) {
      finalHeaders["Content-Type"] = "application/json";
    }

    const payload = !isBodyAllowed
      ? undefined
      : body === null
      ? null
      : isFormData
      ? body
      : finalHeaders["Content-Type"]?.includes("application/json")
      ? JSON.stringify(body)
      : body;

    const { controller, timeoutId } = createAbortTimeout(timeout);
    const mergedSignal = mergeAbortSignals([controller.signal, signal]);

    events.emit("app:request:start", {
      url,
      method: upperMethod,
      auth,
      hasBody: body !== null,
    });

    try {
      state.lastRequestAt = now();
      state.lastRequestUrl = url;

      const response = await executeFetchWithRetry(
        url,
        {
          method: upperMethod,
          headers: finalHeaders,
          body: payload,
          signal: mergedSignal,
          credentials,
        },
        {
          ...requestConfig,
          retries,
          method: upperMethod,
        }
      );

      clearTimeout(timeoutId);

      if (raw) {
        const hookedRaw = await runHookSeries(
          registry.hooks.afterResponse,
          response
        );

        events.emit("app:request:success", {
          url,
          method: upperMethod,
          status: response.status,
          response: hookedRaw,
        });

        return hookedRaw;
      }

      const data = await parseResponseBody(response, responseType);

      if (!response.ok) {
        const error = buildRequestError({
          response,
          data,
          url,
          method: upperMethod,
        });

        setError(error);
        await runHookSeries(registry.hooks.onRequestError, error);
        events.emit("app:request:error", error);
        throw error;
      }

      const hookedData = await runHookSeries(
        registry.hooks.afterResponse,
        data
      );

      events.emit("app:request:success", {
        url,
        method: upperMethod,
        status: response.status,
        data: hookedData,
      });

      return hookedData;
    } catch (error) {
      clearTimeout(timeoutId);

      if (isAbortError(error)) {
        const abortedByExternalSignal = signal?.aborted === true;

        const abortError = buildRequestError({
          response: null,
          data: null,
          url,
          method: upperMethod,
          timeout: !abortedByExternalSignal,
          aborted: abortedByExternalSignal,
          raw: error?.reason || error?.message || error,
        });

        setError(abortError);
        await runHookSeries(registry.hooks.onRequestError, abortError);
        events.emit("app:request:error", abortError);
        throw abortError;
      }

      const normalizedError =
        error?.status !== undefined
          ? error
          : buildRequestError({
              response: null,
              data: null,
              url,
              method: upperMethod,
              timeout: isProbablyTimeoutError(error),
              raw: error?.message || error,
            });

      if (shouldRetryRequest(normalizedError, { ...requestConfig, retries })) {
        normalizedError.retryable = true;
      }

      setError(normalizedError);
      await runHookSeries(registry.hooks.onRequestError, normalizedError);
      events.emit("app:request:error", normalizedError);
      throw normalizedError;
    }
  }

  const apiClient = {
    get(path, options = {}) {
      return request(path, { ...options, method: "GET" });
    },

    post(path, body = null, options = {}) {
      return request(path, { ...options, method: "POST", body });
    },

    put(path, body = null, options = {}) {
      return request(path, { ...options, method: "PUT", body });
    },

    patch(path, body = null, options = {}) {
      return request(path, { ...options, method: "PATCH", body });
    },

    delete(path, options = {}) {
      return request(path, { ...options, method: "DELETE" });
    },

    request,
  };

  /* =========================================================
     RED / ONLINE
  ========================================================= */
  function bindNetworkEvents() {
    if (!isBrowser()) return;

    cleanup.on("core:network", window, "online", () => {
      state.online = true;
      events.emit("app:network:change", { online: true });
      utils.log("Conectividad recuperada.");
    });

    cleanup.on("core:network", window, "offline", () => {
      state.online = false;
      events.emit("app:network:change", { online: false });
      utils.warn("El navegador está offline.");
    });
  }

  /* =========================================================
     READY
  ========================================================= */
  function ready(callback) {
    if (typeof callback !== "function") return;
    if (!isBrowser()) return;

    if (!isDocumentReady()) {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function doInit() {
    state.booting = true;

    try {
      await runHookSeries(registry.hooks.beforeInit, api);

      config.apiBase = normalizeApiBase(config.apiBase);

      cacheDom();
      validateRequiredDom();
      loadPreferences();
      loadSession();
      syncBaseUI();
      bindNetworkEvents();

      state.route = getCurrentLocationCanonicalPath();
      state.publicPath = getCurrentLocationPath();
      state.initialized = true;
      state.booting = false;
      state.ready = true;

      initDone = true;

      utils.log("Core inicializado correctamente.", {
        version: config.version,
        apiBase: config.apiBase,
        route: state.route,
        publicPath: state.publicPath,
        lang: state.lang,
        theme: state.theme,
        authenticated: state.authenticated,
        username: getUserUsername(state.user) || null,
        online: state.online,
      });

      events.emit("app:core:ready", {
        state: cloneState(),
        config: { ...config },
      });

      await runHookSeries(registry.hooks.afterInit, api);

      return api;
    } catch (error) {
      state.booting = false;
      state.ready = false;
      state.initialized = false;
      setError(error);
      throw error;
    } finally {
      initPromise = null;
    }
  }

  async function init() {
    if (initDone || state.initialized) {
      utils.warn("AppCore ya fue inicializado.");
      return api;
    }

    if (initPromise) {
      utils.warn("AppCore ya está arrancando.");
      return initPromise;
    }

    initPromise = doInit();
    return initPromise;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    config,
    state,
    dom,
    utils,
    storage,
    events,
    cleanup,
    modules,
    hooks,
    apiClient,

    init,
    ready,

    getState,
    setState,
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

    getUserDisplayName,
    getUserUsername,
    getUserAvatarUrl,
    normalizeUser,
  };

  return api;
})();

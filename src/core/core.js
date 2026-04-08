/* =========================================================
   Onion SPA - Core
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
   - helpers UI/lifecycle
   - helpers de username/slug
========================================================= */

export const AppCore = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const config = {
    appName: "Onion Support",
    version: "1.0.0",
    debug: true,

    apiBase: "https://api.onionit.net",
    requestTimeout: 15000,

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
    },

    ui: {
      themeColorDark: "#0a0c11",
      themeColorLight: "#f4f7fb",
    },
  };

  /* =========================================================
     HELPERS PRIVADOS BASE
  ========================================================= */
  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isDocumentReady() {
    return isBrowser() && document.readyState !== "loading";
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

  function safeClone(value, fallback = null) {
    if (value === undefined) return fallback;

    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch {
      /* no-op */
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
      return safeClone(error, { message: String(error) });
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

  function normalizePath(path = "/") {
    if (path === null || path === undefined) return "/";

    let raw = String(path).trim();

    if (!raw) return "/";

    if (raw.startsWith("#")) {
      return "/";
    }

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
    const [pathOnly, suffix = ""] = normalized.split(/([?#].*)/, 2);
    const stripped =
      (pathOnly || "/").replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";

    return normalizePath(`${stripped}${suffix}`);
  }

  function normalizeCanonicalPath(path = "/") {
    const normalized = normalizePath(path);
    const noSlug = stripUsernamePrefix(normalized);
    const [pathOnly] = noSlug.split(/[?#]/);
    return normalizePath(pathOnly || "/");
  }

  function joinUrl(base, path = "") {
    const cleanBase = String(base || "").replace(/\/+$/, "");
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  }

  function buildUrl(path, query = null) {
    const rawPath = String(path || "");
    const baseUrl = /^https?:\/\//i.test(rawPath)
      ? rawPath
      : joinUrl(config.apiBase, rawPath);

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
      avatar: user.avatar || user.photo || user.image || user.picture || null,
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

  function getInitials(value = "") {
    return String(value || "")
      .split(" ")
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
        console.error(`[${config.appName}] Error ejecutando hook`, error);
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
    const timeoutId = setTimeout(() => controller.abort(), ms);
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
  };

  function cloneState() {
    return {
      ...state,
      user: state.user ? { ...state.user } : null,
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
    hasValidToken,
    getInitials,
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

        for (let i = 0; i < localStorage.length; i++) {
          const currentKey = localStorage.key(i);
          if (currentKey && currentKey.startsWith(`${config.storagePrefix}:`)) {
            keysToRemove.push(currentKey);
          }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));
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
    return Boolean(normalizeUser(nextUser) || hasValidToken(nextToken));
  }

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") return cloneState();

    const previousState = cloneState();

    Object.assign(state, patch);

    events.emit("app:state:change", {
      state: cloneState(),
      patch: { ...patch },
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

    if (dom.sidebarName) {
      dom.sidebarName.textContent = displayName;

      if (username) {
        dom.sidebarName.dataset.username = username;
      } else {
        delete dom.sidebarName.dataset.username;
      }
    }

    if (dom.sidebarAvatar) {
      dom.sidebarAvatar.textContent = avatarText;
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
     REQUEST HELPERS
  ========================================================= */
  async function parseResponseBody(response, responseType = "auto") {
    const contentType = response.headers.get("content-type") || "";

    if (response.status === 204) {
      return null;
    }

    if (responseType === "json") {
      return response.json();
    }

    if (responseType === "text") {
      return response.text();
    }

    if (responseType === "blob") {
      return response.blob();
    }

    if (responseType === "arrayBuffer") {
      return response.arrayBuffer();
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }

  function buildRequestError({
    response = null,
    data = null,
    url = "",
    method = "",
  }) {
    if (!response) {
      return {
        status: 0,
        statusText: "Network Error",
        data,
        url,
        method,
        message: "No se pudo completar la petición.",
      };
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data,
      url,
      method,
      message:
        data?.message ||
        data?.error ||
        response.statusText ||
        "Error de petición",
    };
  }

  /* =========================================================
     REQUEST
  ========================================================= */
  async function request(path, options = {}) {
    let requestConfig = {
      method: "GET",
      headers: {},
      body: null,
      auth: true,
      timeout: config.requestTimeout,
      raw: false,
      responseType: "auto",
      query: null,
      credentials: "same-origin",
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
      auth = true,
      timeout = config.requestTimeout,
      raw = false,
      responseType = "auto",
      query = null,
      credentials = "same-origin",
    } = requestConfig;

    const url = buildUrl(requestConfig.path, query);

    const finalHeaders = normalizeHeaders({
      Accept: "application/json",
      ...headers,
    });

    if (auth && hasValidToken(state.token)) {
      finalHeaders.Authorization = `Bearer ${state.token}`;
    }

    const isFormData = isBrowser() && body instanceof FormData;

    if (!isFormData && body !== null && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }

    const payload =
      body === null
        ? null
        : isFormData
        ? body
        : finalHeaders["Content-Type"]?.includes("application/json")
        ? JSON.stringify(body)
        : body;

    const { controller, timeoutId } = createAbortTimeout(timeout);

    events.emit("app:request:start", {
      url,
      method,
      auth,
      hasBody: body !== null,
    });

    try {
      state.lastRequestAt = Date.now();

      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: payload,
        signal: controller.signal,
        credentials,
      });

      clearTimeout(timeoutId);

      if (raw) {
        const hookedRaw = await runHookSeries(
          registry.hooks.afterResponse,
          response
        );

        events.emit("app:request:success", {
          url,
          method,
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
          method,
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
        method,
        status: response.status,
        data: hookedData,
      });

      return hookedData;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error?.name === "AbortError") {
        const timeoutError = {
          status: 0,
          statusText: "Request timeout",
          message: `La petición superó ${timeout}ms`,
          url,
          method,
        };

        setError(timeoutError);
        await runHookSeries(registry.hooks.onRequestError, timeoutError);
        events.emit("app:request:error", timeoutError);
        throw timeoutError;
      }

      const normalizedError =
        error?.status !== undefined
          ? error
          : {
              status: 0,
              statusText: "Network Error",
              message: error?.message || "Error de red no controlado",
              url,
              method,
              raw: error,
            };

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
  async function init() {
    if (state.initialized || state.booting) {
      utils.warn("AppCore ya fue inicializado o está arrancando.");
      return api;
    }

    state.booting = true;

    try {
      await runHookSeries(registry.hooks.beforeInit, api);

      cacheDom();
      validateRequiredDom();
      loadPreferences();
      loadSession();
      syncBaseUI();

      state.route = getCurrentLocationCanonicalPath();
      state.publicPath = getCurrentLocationPath();
      state.initialized = true;
      state.booting = false;
      state.ready = true;

      utils.log("Core inicializado correctamente.", {
        version: config.version,
        apiBase: config.apiBase,
        route: state.route,
        publicPath: state.publicPath,
        lang: state.lang,
        theme: state.theme,
        authenticated: state.authenticated,
        username: getUserUsername(state.user) || null,
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
      setError(error);
      throw error;
    }
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
    normalizeUser,
  };

  return api;
})();

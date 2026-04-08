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

    defaultLang: "es",
    defaultTheme: "dark",
    storagePrefix: "onion",
    requestTimeout: 15000,

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

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function isValidScope(scope) {
    if (!isBrowser()) return false;
    return (
      scope === document ||
      scope instanceof Element ||
      scope instanceof Document
    );
  }

  function normalizeListenerOptions(options) {
    if (typeof options === "boolean") return { capture: options };
    if (typeof options === "object" && options !== null) return options;
    return { capture: false };
  }

  function sanitizeUsername(value = "") {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();
  }

  function normalizePath(path = "/") {
    if (path === null || path === undefined) return "/";

    let clean = String(path).trim();

    if (!clean) return "/";

    if (/^https?:\/\//i.test(clean)) {
      try {
        const url = new URL(clean);
        clean = `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return "/";
      }
    }

    if (clean.startsWith("#")) {
      return "/";
    }

    clean = clean.replace(/^[.][/]+/, "/");
    clean = clean.replace(/^[/]{0,1}(?=@)/, "/");

    if (!clean.startsWith("/")) {
      clean = `/${clean}`;
    }

    clean = clean.replace(/\/{2,}/g, "/");

    const [pathnameOnly, suffix = ""] = clean.split(/([?#].*)/, 2);
    let pathname = pathnameOnly || "/";

    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/, "");
    }

    pathname = pathname || "/";

    return `${pathname}${suffix}`;
  }

  function normalizeCanonicalPath(path = "/") {
    const normalized = normalizePath(path);
    const noQuery = normalized.split("?")[0].split("#")[0] || "/";
    const stripped = noQuery.replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";
    return normalizePath(stripped);
  }

  function joinUrl(base, path = "") {
    const cleanBase = String(base || "").replace(/\/+$/, "");
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  }

  function buildUrl(path, query = null) {
    const baseUrl = /^https?:\/\//i.test(String(path || ""))
      ? String(path)
      : joinUrl(config.apiBase, path);

    if (!query || !isPlainObject(query) || Object.keys(query).length === 0) {
      return baseUrl;
    }

    const url = new URL(baseUrl, isBrowser() ? window.location.origin : "http://localhost");

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

  function createAbortTimeout(ms) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return { controller, timeoutId };
  }

  function normalizeHeaders(headers = {}) {
    return Object.entries(headers).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        acc[key] = value;
      }
      return acc;
    }, {});
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
      try {
        return JSON.parse(JSON.stringify(error));
      } catch {
        return { message: String(error) };
      }
    }

    return { message: String(error) };
  }

  function hasValidToken(token = null) {
    return Boolean(token && String(token).trim());
  }

  function cloneState() {
    return {
      ...state,
      user: state.user ? { ...state.user } : null,
      lastError: cloneError(state.lastError),
    };
  }

  async function runHookSeries(hooks = [], payload) {
    let nextPayload = payload;

    for (const hook of hooks) {
      try {
        const result = await hook(nextPayload);
        if (result !== undefined) {
          nextPayload = result;
        }
      } catch (error) {
        console.error(`[${config.appName}]`, "Error ejecutando hook", error);
      }
    }

    return nextPayload;
  }

  function getThemeColor(theme = config.defaultTheme) {
    return theme === "light"
      ? config.ui.themeColorLight
      : config.ui.themeColorDark;
  }

  function syncThemeMetaColor(theme = config.defaultTheme) {
    if (!dom.themeColorMeta) return;
    dom.themeColorMeta.setAttribute("content", getThemeColor(theme));
  }

  function normalizeUser(user = null) {
    if (!user || typeof user !== "object") return null;

    const normalized = { ...user };

    normalized.id =
      user.id ??
      user.user_id ??
      user.uuid ??
      user._id ??
      null;

    normalized.username = sanitizeUsername(
      user.username ||
      user.userName ||
      user.nick ||
      user.alias ||
      user.login ||
      ""
    );

    normalized.name =
      user.name ||
      user.nombre ||
      user.full_name ||
      user.fullName ||
      user.display_name ||
      user.displayName ||
      user.username ||
      user.email ||
      "Usuario";

    normalized.email = user.email || user.mail || "";
    normalized.role =
      user.role ||
      user.rol ||
      user.type ||
      user.user_type ||
      user.userType ||
      null;

    normalized.avatar =
      user.avatar ||
      user.photo ||
      user.image ||
      user.picture ||
      null;

    normalized.active =
      user.active ??
      user.is_active ??
      user.isActive ??
      true;

    return normalized;
  }

  function getUserDisplayName(user = state.user) {
    if (!user) return "Usuario";

    return (
      user.name ||
      user.nombre ||
      user.username ||
      user.email ||
      "Usuario"
    );
  }

  function getUserUsername(user = state.user) {
    if (!user) return "";

    return sanitizeUsername(
      user.username ||
      user.userName ||
      user.nick ||
      user.alias ||
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
    return normalizeCanonicalPath(window.location.pathname || "/");
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
      if (!selector || !isValidScope(scope)) return null;
      return scope.querySelector(selector);
    },

    qsa(selector, scope = document) {
      if (!selector || !isValidScope(scope)) return [];
      return Array.from(scope.querySelectorAll(selector));
    },

    on(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== "function") return () => {};
      target.addEventListener(event, handler, options);
      return () => target.removeEventListener(event, handler, options);
    },

    off(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== "function") return;
      target.removeEventListener(event, handler, options);
    },

    once(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== "function") return () => {};
      const finalOptions = {
        ...normalizeListenerOptions(options),
        once: true,
      };
      target.addEventListener(event, handler, finalOptions);
      return () => target.removeEventListener(event, handler, finalOptions);
    },

    create(tag, options = {}) {
      const el = document.createElement(tag);

      if (options.className) el.className = options.className;
      if (options.id) el.id = options.id;
      if (options.text !== undefined) el.textContent = options.text;
      if (options.html !== undefined) el.innerHTML = options.html;

      if (options.attrs && typeof options.attrs === "object") {
        Object.entries(options.attrs).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            el.setAttribute(key, String(value));
          }
        });
      }

      return el;
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

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    capitalize(value = "") {
      if (!value) return "";
      return value.charAt(0).toUpperCase() + value.slice(1);
    },

    slugify(value = "") {
      return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    },

    sanitizeUsername,
    getUserUsername,
    hasValidToken,

    debounce(fn, delay = 250) {
      let timeoutId;
      return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
      };
    },

    throttle(fn, limit = 250) {
      let waiting = false;
      let pendingArgs = null;

      return (...args) => {
        if (waiting) {
          pendingArgs = args;
          return;
        }

        waiting = true;
        fn(...args);

        setTimeout(() => {
          waiting = false;

          if (pendingArgs) {
            const nextArgs = pendingArgs;
            pendingArgs = null;
            fn(...nextArgs);
            waiting = true;

            setTimeout(() => {
              waiting = false;
            }, limit);
          }
        }, limit);
      };
    },

    sleep(ms = 0) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    joinUrl,
    buildUrl,
    normalizePath,
    normalizeCanonicalPath,

    escapeHtml(value = "") {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    },
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
      if (!isBrowser()) return () => {};
      document.addEventListener(name, handler, options);
      return () => document.removeEventListener(name, handler, options);
    },

    off(name, handler, options = false) {
      if (!isBrowser()) return;
      document.removeEventListener(name, handler, options);
    },

    once(name, handler, options = false) {
      if (!isBrowser()) return () => {};
      const finalOptions = {
        ...normalizeListenerOptions(options),
        once: true,
      };
      document.addEventListener(name, handler, finalOptions);
      return () => document.removeEventListener(name, handler, finalOptions);
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

      if (exists) {
        const instance = registry.modules.get(name);
        registry.modules.delete(name);
        events.emit("app:module:unregistered", { name, instance });
      }

      return exists;
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
        registry.hooks[type] = registry.hooks[type].filter((fn) => fn !== handler);
      };
    },

    types() {
      return Object.keys(registry.hooks);
    },
  };

  /* =========================================================
     STATE
  ========================================================= */
  function computeAuthenticated(nextUser = state.user, nextToken = state.token) {
    return Boolean(normalizeUser(nextUser) || hasValidToken(nextToken));
  }

  function setState(patch = {}) {
    if (!patch || typeof patch !== "object") return;

    const previousState = cloneState();

    Object.assign(state, patch);

    events.emit("app:state:change", {
      state: cloneState(),
      patch: { ...patch },
      previousState,
    });
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
  }

  function setPublicPath(path = "/") {
    const normalizedPath = normalizePath(path);

    setState({
      publicPath: normalizedPath,
    });

    events.emit("app:public-path:change", {
      publicPath: normalizedPath,
    });
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

    events.emit("app:session:cleared", {});
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
  }

  function setLang(lang = config.defaultLang) {
    const normalizedLang = lang || config.defaultLang;

    setState({ lang: normalizedLang });
    storage.set(config.storageKeys.lang, normalizedLang);

    if (dom.html) {
      dom.html.setAttribute("lang", normalizedLang);
    }

    events.emit("app:lang:change", {
      lang: normalizedLang,
    });
  }

  function setSidebarOpen(value) {
    const nextValue = Boolean(value);

    setState({ sidebarOpen: nextValue });
    storage.set(config.storageKeys.sidebarOpen, nextValue);

    if (dom.body) {
      dom.body.classList.toggle("sidebar-collapsed", !nextValue);
    }

    if (dom.sidebar) {
      dom.sidebar.classList.toggle("collapsed", !nextValue);
      dom.sidebar.classList.toggle("open", nextValue);
    }

    if (dom.sidebarToggle) {
      dom.sidebarToggle.setAttribute("aria-expanded", String(nextValue));
    }

    events.emit("app:sidebar:change", {
      open: nextValue,
    });
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
  }

  function setError(error = null) {
    setState({ lastError: error || null });
    events.emit("app:error", { error });
  }

  /* =========================================================
     UI HELPERS
  ========================================================= */
  function setDocumentTitle(title = config.appName) {
    if (!isBrowser()) return;

    const safeTitle = title || config.appName;

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
    }

    if (dom.sidebarAvatar) {
      dom.sidebarAvatar.textContent = avatarText;
      dom.sidebarAvatar.setAttribute("aria-label", `Avatar ${displayName}`);

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

    dom.html = document.documentElement;
    dom.body = document.body;
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
      ["viewContainer", dom.viewContainer],
      ["mainContent", dom.mainContent],
    ];

    const missing = required
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      utils.warn("Faltan nodos importantes del layout:", missing);
    }
  }

  /* =========================================================
     PREFERENCIAS / SESIÓN
  ========================================================= */
  function loadPreferences() {
    const savedTheme = storage.get(config.storageKeys.theme, config.defaultTheme);
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
      dom.body.classList.toggle("loading", state.loading);
    }

    if (dom.sidebar) {
      dom.sidebar.classList.toggle("collapsed", !state.sidebarOpen);
      dom.sidebar.classList.toggle("open", state.sidebarOpen);
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

  /* =========================================================
     UI BASE
  ========================================================= */
  function syncBaseUI() {
    setDocumentTitle(config.appName);
    syncUserUI();
  }

  /* =========================================================
     REQUEST HELPERS
  ========================================================= */
  async function parseResponseBody(response, responseType = "auto") {
    const contentType = response.headers.get("content-type") || "";

    if (responseType === "json") {
      return response.status === 204 ? null : response.json();
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

    if (response.status === 204) {
      return null;
    }

    const isJson = contentType.includes("application/json");
    return isJson ? response.json() : response.text();
  }

  function buildRequestError({ response = null, data = null, url = "", method = "" }) {
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

    const url = buildUrl(path, query);

    const finalHeaders = normalizeHeaders({
      Accept: "application/json",
      ...headers,
    });

    if (auth && hasValidToken(state.token)) {
      finalHeaders.Authorization = `Bearer ${state.token}`;
    }

    const isFormData = body instanceof FormData;

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

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
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
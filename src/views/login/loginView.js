/* =========================================================
   Onion SPA - Login View Legacy Bridge
   Archivo: src/views/loginView.js

   Bridge legacy limpio:
   - mantiene imports antiguos src/views/loginView.js
   - delega render real en src/views/login/index.js
   - no ejecuta Auth.login
   - no sincroniza sesión
   - no decide redirect
   - prepara shell auth mínimo
   - sin CSS inline / sin innerHTML / sin event storm
========================================================= */

import { AppCore } from "../core/index.js";

import LoginDefault, * as LoginModule from "./login/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_VIEW_BRIDGE_VERSION = "17.0.0-clean";

const SOURCE = "loginView.legacyBridge";
const SCOPE = "view:login:legacy-bridge";

const LOGIN_PATH = "/login";
const DEFAULT_PATH = "/";
const RUNTIME_KEY = "__ONION_LOGIN_VIEW_BRIDGE__";

const EVENTS = Object.freeze({
  beforeRender: "login:view:before-render",
  rendered: "login:view:rendered",
  destroyed: "login:view:destroyed",
  error: "login:view:error",
  shellPrepared: "login:view:shell-prepared",
  debugReady: "login:view:debug-ready",
});

const AUTH_ROOT_CLASSES = Object.freeze([
  "auth-screen",
  "route-auth",
  "route-shell-hidden",
  "route-chrome-hidden",
]);

const APP_ROOT_CLASSES = Object.freeze([
  "route-app",
  "route-shell-visible",
  "route-chrome-visible",
]);

const LOADING_CLASSES = Object.freeze([
  "loading",
  "app-loading",
  "app-booting",
  "is-loading",
  "is-booting",
]);

const TOKENISH_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t|otp|mfaToken|mfa_token)=)[^&#\s]+/gi;

/* =========================================================
   RUNTIME
========================================================= */

let activeController = null;
let activeContainer = null;
let activeEpoch = 0;
let renderEpoch = 0;
let renderInFlight = false;

let lastRenderAt = "";
let lastDestroyAt = "";
let lastError = null;

let lastEventKey = "";
let lastEventAt = 0;

let debugReady = false;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
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

function isNode(value) {
  if (!isBrowser() || !value) return false;

  try {
    return Boolean(
      value === window ||
        value === document ||
        value.nodeType === 1 ||
        value.nodeType === 9 ||
        value.nodeType === 11
    );
  } catch {
    return false;
  }
}

function connected(node) {
  if (!isBrowser() || !node) return false;

  try {
    if (node === window || node === document) return true;
    return Boolean(node.isConnected || document.contains(node));
  } catch {
    return false;
  }
}

function defineHidden(target, key, value) {
  if (!target || !key) return false;

  try {
    Object.defineProperty(target, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REDACTION / LOGS
========================================================= */

function redact(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  try {
    return text
      .replace(TOKENISH_RE, (match) => {
        if (/^bearer\s+/i.test(match)) return "Bearer ***";
        if (/^[?&#]/.test(match)) return match.replace(/=.+$/g, "=***");
        return "***";
      })
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***");
  } catch {
    return text;
  }
}

function sanitizeError(error = null) {
  if (!error) return null;

  const source = error?.error || error?.reason || error;

  return {
    name: safeText(source?.name || source?.constructor?.name, "Error"),
    message: redact(safeText(source?.message || source?.reason || source, "Error")),
    status: source?.status || source?.statusCode || source?.response?.status || 0,
    code: source?.code || source?.data?.code || source?.response?.data?.code || null,
    at: iso(),
  };
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > 5) return "[depth-limit]";

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return sanitizeError(value);

  if (isNode(value)) {
    return {
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(value.className?.baseVal || value.className, "").slice(0, 500),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, seen));
  }

  if (value && typeof value === "object") {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|otp|mfa|code|session|refresh/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitize(item, depth + 1, seen);
    }

    return output;
  }

  return String(value);
}

function log(...args) {
  try {
    AppCore?.utils?.log?.(`[${SOURCE}]`, ...args.map((item) => sanitize(item)));
  } catch {}
}

function warn(...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.(`[${SOURCE}]`, ...clean);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn(`[${SOURCE}]`, ...clean);
  } catch {}
}

function errorLog(...args) {
  const clean = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.error?.(`[${SOURCE}]`, ...clean);
    return;
  } catch {}

  try {
    console.error(`[${SOURCE}]`, ...clean);
  } catch {}
}

function shouldDedupeEvent(name = "", payload = {}, force = false) {
  if (force) return false;

  const key = [
    name,
    payload?.epoch,
    payload?.containerId,
    payload?.reason,
    payload?.ok === false ? "fail" : "ok",
  ].map((item) => safeText(item, "")).join("|");

  const stamp = now();

  if (key === lastEventKey && stamp - lastEventAt < 80) return true;

  lastEventKey = key;
  lastEventAt = stamp;

  return false;
}

function emit(name, payload = {}, options = {}) {
  const eventName = safeText(name, "");
  if (!eventName) return false;

  const opts = safeObject(options);

  if (opts.dedupe !== false && shouldDedupeEvent(eventName, payload, opts.force === true)) {
    return false;
  }

  const detail = sanitize({
    source: SOURCE,
    version: LOGIN_VIEW_BRIDGE_VERSION,
    at: iso(),
    ...safeObject(payload),
  });

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(eventName, detail);
      emitted = true;
    }
  } catch {}

  if ((opts.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function isHashRouterPath(value = "") {
  const text = safeText(value, "");
  return text.startsWith("#/") || text.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const text = safeText(value, "");
  if (!text) return DEFAULT_PATH;
  if (text.startsWith("#!")) return `/${text.replace(/^#!\/?/, "")}` || DEFAULT_PATH;
  return `/${text.replace(/^#\/?/, "")}` || DEFAULT_PATH;
}

function normalizePathname(value = DEFAULT_PATH) {
  let path = safeText(value, DEFAULT_PATH)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) path = `/${path}`;

  const out = [];

  for (const part of path.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }

    out.push(part);
  }

  path = `/${out.join("/")}`;
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function splitPath(value = DEFAULT_PATH) {
  let raw = safeText(value, DEFAULT_PATH);

  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_PATH;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_PATH;
  }

  return {
    pathname: normalizePathname(pathname),
    search,
    hash,
  };
}

function normalizePath(value = DEFAULT_PATH) {
  const raw = safeText(value, DEFAULT_PATH);

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const url = new URL(raw, window.location?.origin || "http://localhost");

      if (url.hash && isHashRouterPath(url.hash)) return normalizePath(url.hash);

      return normalizePath(`${url.pathname || DEFAULT_PATH}${url.search || ""}${url.hash || ""}`);
    }
  } catch {
    return DEFAULT_PATH;
  }

  const { pathname, search, hash } = splitPath(raw);
  return `${pathname}${search}${hash}`;
}

function stripSearchHash(value = DEFAULT_PATH) {
  return splitPath(normalizePath(value)).pathname;
}

function stripUsernamePrefix(value = DEFAULT_PATH) {
  const { pathname, search, hash } = splitPath(normalizePath(value));
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] && /^@[A-Za-z0-9._-]{1,80}$/.test(parts[0])) {
    const rest = parts.slice(1).join("/");
    return `${rest ? `/${rest}` : DEFAULT_PATH}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function currentPath() {
  if (!isBrowser()) return DEFAULT_PATH;

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) return normalizePath(hash);

    return normalizePath(`${window.location.pathname || DEFAULT_PATH}${window.location.search || ""}${hash}`);
  } catch {
    return DEFAULT_PATH;
  }
}

function currentCanonicalPath() {
  return stripSearchHash(stripUsernamePrefix(currentPath()));
}

function isLoginRoute(path = currentPath()) {
  const clean = stripSearchHash(stripUsernamePrefix(path));

  return clean === LOGIN_PATH || clean.startsWith(`${LOGIN_PATH}/`);
}

/* =========================================================
   DOM / SHELL
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function qs(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function getShellElements() {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,
      shell: null,
      main: null,
      appContent: null,
      view: null,
      sidebarMount: null,
      topbarMount: null,
      tablehead: null,
      tableheadContainer: null,
      loader: null,
    };
  }

  return {
    html: document.documentElement || null,
    body: document.body || null,

    shell:
      AppCore?.dom?.appShell ||
      AppCore?.dom?.shell ||
      byId("app-shell") ||
      qs("[data-app-shell],.app-shell"),

    main:
      AppCore?.dom?.mainContent ||
      AppCore?.dom?.main ||
      byId("main-content") ||
      qs("[data-main-content],main.main-content,.main-content,main"),

    appContent:
      AppCore?.dom?.appContent ||
      byId("app-content") ||
      qs("[data-app-content],.app-content"),

    view:
      AppCore?.dom?.viewContainer ||
      AppCore?.dom?.routerView ||
      AppCore?.dom?.viewRoot ||
      byId("view-container") ||
      qs("[data-view-root],[data-router-view],[data-view-container],.view-container,.router-view"),

    sidebarMount:
      AppCore?.dom?.sidebarMount ||
      byId("sidebar-mount") ||
      qs("[data-sidebar-mount]"),

    topbarMount:
      AppCore?.dom?.topbarMount ||
      byId("topbar-mount") ||
      qs("[data-topbar-mount]"),

    tablehead:
      AppCore?.dom?.tablehead ||
      byId("table-head") ||
      qs("[data-tablehead],.table-head"),

    tableheadContainer:
      AppCore?.dom?.tableheadContainer ||
      byId("tablehead-container") ||
      qs("[data-tablehead-container]"),

    loader:
      AppCore?.dom?.loader ||
      byId("app-loader") ||
      qs("[data-app-loader],.app-loader"),
  };
}

function setAttr(el, key, value) {
  if (!el || !key) return false;

  try {
    if (value === null || value === undefined) {
      el.removeAttribute(key);
      return true;
    }

    el.setAttribute(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function setData(el, key, value) {
  if (!el || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete el.dataset[key];
      return true;
    }

    el.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setHidden(el, hidden = false) {
  if (!el) return false;

  try {
    el.hidden = Boolean(hidden);
  } catch {}

  setAttr(el, "aria-hidden", hidden ? "true" : "false");
  return true;
}

function setBusy(el, busy = false) {
  return setAttr(el, "aria-busy", busy ? "true" : "false");
}

function toggleClass(el, className, enabled) {
  if (!el || !className) return false;

  try {
    el.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function removeClasses(el, classNames = []) {
  if (!el) return false;

  try {
    for (const className of classNames) {
      if (className) el.classList.remove(className);
    }

    return true;
  } catch {
    return false;
  }
}

function syncDomCache(container = null) {
  try {
    if (!AppCore.dom) AppCore.dom = {};
  } catch {
    return false;
  }

  const dom = getShellElements();
  const view = container || dom.view;

  try {
    Object.assign(AppCore.dom, {
      html: dom.html,
      body: dom.body,

      appShell: dom.shell,
      shell: dom.shell,

      mainContent: dom.main,
      main: dom.main,

      appContent: dom.appContent,

      viewContainer: view,
      routerView: view,
      viewRoot: view,

      sidebarMount: dom.sidebarMount,
      topbarMount: dom.topbarMount,

      tablehead: dom.tablehead,
      tableHead: dom.tablehead,
      tableheadContainer: dom.tableheadContainer,
      tableHeadContainer: dom.tableheadContainer,

      loader: dom.loader,
      appLoader: dom.loader,
    });

    return true;
  } catch {
    return false;
  }
}

function setAuthScreen(active = true) {
  if (!isBrowser()) return false;

  const enabled = Boolean(active);
  const dom = getShellElements();

  for (const root of [dom.html, dom.body]) {
    if (!root) continue;

    for (const className of AUTH_ROOT_CLASSES) toggleClass(root, className, enabled);
    for (const className of APP_ROOT_CLASSES) toggleClass(root, className, !enabled);

    setData(root, "routeMode", enabled ? "auth" : "app");
    setData(root, "authScreen", enabled ? "true" : "false");
    setData(root, "chrome", enabled ? "hidden" : "visible");
    setData(root, "shell", "visible");
    setData(root, "appLoading", "false");
  }

  for (const el of [dom.shell, dom.main, dom.appContent, dom.view]) {
    setHidden(el, false);
    setBusy(el, false);
    setData(el, "shell", "visible");
    setData(el, "routeMode", enabled ? "auth" : "app");
    setData(el, "chrome", enabled ? "hidden" : "visible");
  }

  for (const el of [dom.sidebarMount, dom.topbarMount, dom.tablehead, dom.tableheadContainer]) {
    setHidden(el, enabled);
    setBusy(el, false);
  }

  return true;
}

function releaseAuthScreenIfNeeded() {
  if (!isBrowser()) return false;
  if (isLoginRoute()) return false;
  return setAuthScreen(false);
}

function hideLoaderFallback() {
  try {
    AppCore?.setLoading?.(false, {
      source: SOURCE,
      silent: true,
    });
  } catch {
    try {
      AppCore?.setLoading?.(false);
    } catch {}
  }

  try {
    AppCore?.setState?.(
      {
        loading: false,
        appLoading: false,
        loaderVisible: false,
      },
      {
        source: SOURCE,
        emit: false,
        emitState: false,
        silent: true,
      }
    );
  } catch {}

  const loaderModule =
    AppCore?.modules?.get?.("Loader") ||
    AppCore?.modules?.get?.("loader") ||
    AppCore?.Loader ||
    AppCore?.loader ||
    null;

  try {
    if (isFn(loaderModule?.hide)) {
      loaderModule.hide({
        source: SOURCE,
        reason: "login-bridge-rendered",
        force: true,
        allowDuringBoot: true,
      });

      return true;
    }
  } catch {}

  const dom = getShellElements();

  for (const root of [dom.body, dom.html]) {
    removeClasses(root, LOADING_CLASSES);
    setData(root, "appLoading", "false");
    setData(root, "appBooting", "false");
  }

  if (dom.loader) {
    setHidden(dom.loader, true);
    setBusy(dom.loader, false);

    setData(dom.loader, "loaderVisible", "false");
    setData(dom.loader, "loaderState", "hidden");

    try {
      dom.loader.classList.add("is-hidden", "has-hidden", "loader-hidden");
      dom.loader.classList.remove("is-visible", "is-entering", "is-leaving", "loader-visible");
    } catch {}
  }

  return true;
}

function prepareLoginShell(container = null) {
  syncDomCache(container);
  setAuthScreen(true);
  hideLoaderFallback();

  try {
    AppCore?.clearDynamicContainers?.({
      includeView: false,
      includeTopbar: true,
      includeTablehead: true,
      source: SOURCE,
    });
  } catch {}

  try {
    AppCore?.setDocumentTitle?.(AppCore?.config?.appName || "Onion Support");
  } catch {}

  emit(EVENTS.shellPrepared, {
    path: currentPath(),
    canonicalPath: currentCanonicalPath(),
    containerId: safeText(container?.id, ""),
  });

  return true;
}

/* =========================================================
   RENDER DELEGATION
========================================================= */

function resolveContainer(input = null) {
  if (isNode(input)) return input;

  try {
    return (
      AppCore?.dom?.viewContainer ||
      AppCore?.dom?.routerView ||
      AppCore?.dom?.viewRoot ||
      getShellElements().view ||
      null
    );
  } catch {
    return null;
  }
}

function resolveRenderer() {
  const candidates = [
    LoginDefault?.render,
    LoginDefault?.init,
    LoginDefault?.mount,
    LoginDefault,

    LoginModule.render,
    LoginModule.init,
    LoginModule.mount,

    LoginModule.default?.render,
    LoginModule.default?.init,
    LoginModule.default?.mount,
    LoginModule.default,
  ];

  return candidates.find(isFn) || null;
}

function hasController(value = null) {
  return Boolean(
    value &&
      (
        isFn(value.destroy) ||
        isFn(value.unmount) ||
        isFn(value.dispose) ||
        isFn(value.teardown) ||
        isFn(value.abort)
      )
  );
}

function normalizeController(value = null, epoch = 0) {
  if (hasController(value)) return value;

  return {
    source: SOURCE,
    epoch,

    destroy() {},

    getSnapshot() {
      return {
        source: SOURCE,
        epoch,
        delegatedController: false,
      };
    },
  };
}

function destroyController(controller = null, reason = "destroy") {
  if (!controller) return false;

  for (const method of ["destroy", "unmount", "dispose", "teardown", "abort"]) {
    if (!isFn(controller?.[method])) continue;

    try {
      controller[method]({
        source: SOURCE,
        reason,
        epoch: activeEpoch,
      });

      return true;
    } catch (error) {
      try {
        controller[method]();
        return true;
      } catch (fallbackError) {
        lastError = sanitizeError(fallbackError || error);
        warn(`controller.${method}() falló.`, lastError);
        return false;
      }
    }
  }

  return false;
}

function cleanupScope() {
  try {
    AppCore?.cleanup?.run?.(SCOPE);
  } catch {}

  try {
    AppCore?.cleanup?.clear?.(SCOPE);
  } catch {}

  try {
    AppCore?.cleanup?.dispose?.(SCOPE);
  } catch {}

  return true;
}

function destroyActive({
  preserveAuthScreen = false,
  emitEvent = true,
  reason = "destroy",
} = {}) {
  const controller = activeController;
  const hadController = Boolean(controller);

  try {
    destroyController(controller, reason);
  } finally {
    activeController = null;
    activeContainer = null;
    activeEpoch = 0;
    renderInFlight = false;

    cleanupScope();

    if (!preserveAuthScreen) releaseAuthScreenIfNeeded();

    lastDestroyAt = iso();

    if (emitEvent && hadController) {
      emit(EVENTS.destroyed, {
        epoch: renderEpoch,
        preserveAuthScreen,
        reason,
      });
    }
  }

  return hadController;
}

function normalizeRenderArgs(input = null, maybeDeps = {}) {
  if (isNode(input)) {
    return {
      container: resolveContainer(input),
      deps: safeObject(maybeDeps),
    };
  }

  if (isObject(input)) {
    const container = input.container || input.target || input.root || input.el || null;
    const deps = { ...input };

    delete deps.container;
    delete deps.target;
    delete deps.root;
    delete deps.el;

    return {
      container: resolveContainer(container),
      deps,
    };
  }

  return {
    container: resolveContainer(null),
    deps: safeObject(maybeDeps),
  };
}

function callRenderer(renderer, container, deps = {}, epoch = 0) {
  const context = {
    source: SOURCE,
    legacyBridge: true,
    scope: SCOPE,
    epoch,

    AppCore,

    container,
    target: container,
    root: container,
    el: container,

    path: currentPath(),
    canonicalPath: currentCanonicalPath(),

    ...safeObject(deps),
  };

  try {
    return renderer(container, context);
  } catch (firstError) {
    try {
      return renderer(context);
    } catch {
      throw firstError;
    }
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

function render(input = null, maybeDeps = {}) {
  if (!isBrowser()) {
    warn("render ignorado fuera de browser.");
    return null;
  }

  const { container, deps } = normalizeRenderArgs(input, maybeDeps);

  if (!container) {
    const err = new Error("LoginView: no se encontró #view-container.");
    lastError = sanitizeError(err);

    errorLog(lastError.message);
    emit(EVENTS.error, { error: lastError }, { force: true, dedupe: false });

    return null;
  }

  const renderer = resolveRenderer();

  if (!renderer) {
    const err = new Error("LoginView: src/views/login/index.js no exporta render/init/mount válido.");
    lastError = sanitizeError(err);

    errorLog(lastError.message);
    emit(EVENTS.error, { error: lastError }, { force: true, dedupe: false });

    return null;
  }

  renderEpoch += 1;
  const epoch = renderEpoch;

  renderInFlight = true;

  destroyActive({
    preserveAuthScreen: true,
    emitEvent: false,
    reason: "before-new-render",
  });

  activeEpoch = epoch;
  activeContainer = container;

  prepareLoginShell(container);

  emit(EVENTS.beforeRender, {
    epoch,
    path: currentPath(),
    canonicalPath: currentCanonicalPath(),
    containerId: safeText(container.id, ""),
  });

  try {
    const result = callRenderer(
      renderer,
      container,
      {
        ...deps,
        source: SOURCE,
        legacyBridge: true,
      },
      epoch
    );

    if (result && isFn(result.then)) {
      const provisional = normalizeController(null, epoch);

      activeController = provisional;
      renderInFlight = false;
      lastRenderAt = iso();
      lastError = null;

      result
        .then((controller) => {
          if (epoch !== activeEpoch) {
            destroyController(controller, "async-render-stale");
            return;
          }

          activeController = normalizeController(controller, epoch);
          renderInFlight = false;
          lastRenderAt = iso();
          lastError = null;

          hideLoaderFallback();

          emit(EVENTS.rendered, {
            epoch,
            async: true,
            containerId: safeText(container.id, ""),
            connected: connected(container),
          });
        })
        .catch((error) => {
          if (epoch !== activeEpoch) return;

          lastError = sanitizeError(error);

          activeController = null;
          activeContainer = null;
          activeEpoch = 0;
          renderInFlight = false;

          releaseAuthScreenIfNeeded();

          emit(
            EVENTS.error,
            {
              epoch,
              async: true,
              error: lastError,
            },
            {
              force: true,
              dedupe: false,
            }
          );

          errorLog("Error async renderizando login delegado.", lastError);
        });

      hideLoaderFallback();
      return provisional;
    }

    activeController = normalizeController(result, epoch);
    renderInFlight = false;
    lastRenderAt = iso();
    lastError = null;

    hideLoaderFallback();

    emit(EVENTS.rendered, {
      epoch,
      async: false,
      containerId: safeText(container.id, ""),
      connected: connected(container),
    });

    log("render OK", { epoch });

    return activeController;
  } catch (error) {
    lastError = sanitizeError(error);

    activeController = null;
    activeContainer = null;
    activeEpoch = 0;
    renderInFlight = false;

    releaseAuthScreenIfNeeded();

    emit(
      EVENTS.error,
      {
        epoch,
        error: lastError,
      },
      {
        force: true,
        dedupe: false,
      }
    );

    errorLog("Error renderizando login delegado.", lastError);

    throw error;
  }
}

function init(input = null, maybeDeps = {}) {
  return render(input, maybeDeps);
}

function mount(input = null, maybeDeps = {}) {
  return render(input, maybeDeps);
}

function destroy(options = {}) {
  return destroyActive({
    preserveAuthScreen: options?.preserveAuthScreen === true,
    emitEvent: options?.emit !== false,
    reason: options?.reason || "destroy",
  });
}

function unmount(options = {}) {
  return destroy(options);
}

function dispose(options = {}) {
  return destroy(options);
}

function teardown(options = {}) {
  return destroy(options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(el = null) {
  if (!el) return { exists: false };

  return {
    exists: true,
    id: safeText(el.id, ""),
    tag: safeText(el.tagName?.toLowerCase?.(), ""),
    hidden: Boolean(el.hidden),
    connected: connected(el),

    ariaHidden: safeText(el.getAttribute?.("aria-hidden"), ""),
    ariaBusy: safeText(el.getAttribute?.("aria-busy"), ""),

    dataset: {
      shell: safeText(el.dataset?.shell, ""),
      chrome: safeText(el.dataset?.chrome, ""),
      routeMode: safeText(el.dataset?.routeMode, ""),
      loaderVisible: safeText(el.dataset?.loaderVisible, ""),
      loaderState: safeText(el.dataset?.loaderState, ""),
    },

    className: safeText(el.className?.baseVal || el.className, "").slice(0, 500),

    childCount: (() => {
      try {
        return el.children?.length || 0;
      } catch {
        return 0;
      }
    })(),
  };
}

function getSnapshot() {
  const dom = getShellElements();

  return sanitize({
    version: LOGIN_VIEW_BRIDGE_VERSION,
    source: SOURCE,
    scope: SCOPE,

    active: Boolean(activeController),
    renderInFlight: Boolean(renderInFlight),
    hasActiveController: hasController(activeController),

    activeEpoch,
    renderEpoch,

    currentPath: isBrowser() ? currentPath() : "",
    canonicalPath: isBrowser() ? currentCanonicalPath() : "",
    isLoginRoute: isBrowser() ? isLoginRoute() : false,

    delegatedRenderer: Boolean(resolveRenderer()),

    moduleExports: {
      hasDefault: Boolean(LoginModule?.default),
      hasRender: isFn(LoginModule?.render),
      hasInit: isFn(LoginModule?.init),
      hasMount: isFn(LoginModule?.mount),
    },

    activeContainer: {
      exists: Boolean(activeContainer),
      id: safeText(activeContainer?.id, ""),
      connected: connected(activeContainer),
    },

    dom: {
      html: elementSnapshot(dom.html),
      body: elementSnapshot(dom.body),
      shell: elementSnapshot(dom.shell),
      main: elementSnapshot(dom.main),
      appContent: elementSnapshot(dom.appContent),
      view: elementSnapshot(dom.view),
      sidebarMount: elementSnapshot(dom.sidebarMount),
      topbarMount: elementSnapshot(dom.topbarMount),
      tablehead: elementSnapshot(dom.tablehead),
      tableheadContainer: elementSnapshot(dom.tableheadContainer),
      loader: elementSnapshot(dom.loader),
    },

    lastRenderAt,
    lastDestroyAt,
    lastError,

    lastEventKey: redact(lastEventKey),
    lastEventAt,
    lastEventAtIso: lastEventAt ? iso(lastEventAt) : "",

    debugReady,
    at: iso(),
  });
}

/* =========================================================
   EXPORT / DEBUG BRIDGE
========================================================= */

export const LoginView = Object.freeze({
  version: LOGIN_VIEW_BRIDGE_VERSION,

  render,
  init,
  mount,

  destroy,
  unmount,
  dispose,
  teardown,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
});

function exposeDebugBridge() {
  try {
    if (isBrowser()) {
      window.LoginView = window.LoginView || LoginView;
      window[RUNTIME_KEY] = LoginView;
    }
  } catch {}

  try {
    defineHidden(AppCore, "LoginView", LoginView);
  } catch {}

  if (!debugReady) {
    debugReady = true;

    emit(
      EVENTS.debugReady,
      {
        installed: true,
      },
      {
        dedupe: false,
      }
    );
  }

  return true;
}

exposeDebugBridge();

export default LoginView;

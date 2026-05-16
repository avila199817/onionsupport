/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   Login View limpio:
   - renderiza template
   - conecta DOM helpers
   - llama Auth.login o executor custom
   - Auth.login aplica sesión; la vista sólo navega si sigue en /login
   - custom executor puede usar syncSession()
   - anti doble submit local/global
   - toast loading siempre se cierra
   - auth-screen controlado sin event storm
   - sin HTTP directo
   - sin Store paralelo
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import ToastBridge from "../../ui/toast/toast.bridge.js";

import getLoginTemplate from "./login.template.js";

import {
  loadRememberedIdentifier,
  createLoginPayload,
  validateLoginPayload,
  getFirstLoginError,
  normalizeAuthResult,
  resolveAuthErrorMessage,
  persistRememberedIdentifier,
  syncSession,
  resolveLoginRedirect,
  shouldRedirectAfterLogin,
  hasUsableToken,
  hasUsableUser,
  safeText,
} from "./login.helpers.js";

import {
  getLoginRefs,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  unlockLoginForm,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindThemeToggle,
  bindLoginSubmit,
  bindLoginPasswordFields,
  destroyLoginPasswordFields,
  getLoginDomSnapshot,
} from "./login.dom.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_VIEW_VERSION = "17.0.0-clean";

const SOURCE = "login.view";
const LOGIN_ROUTE = "/login";
const DEFAULT_HOME = "/";
const DEFAULT_2FA = "/2fa";

const INSTANCE_KEY = "__ONION_LOGIN_VIEW_INSTANCE__";
const RUNTIME_KEY = "__ONION_LOGIN_VIEW__";

const GLOBAL_SUBMIT_TIMEOUT_MS = 45_000;
const GLOBAL_SUBMIT_GRACE_MS = 2_500;
const NAVIGATION_TIMEOUT_MS = 8_000;
const POST_NAV_FAILSAFE_MS = 1_250;
const SUCCESS_TOAST_DEDUPE_MS = 1_600;

const AUTH_CLASSES = Object.freeze([
  "auth-screen",
  "login-no-scroll",
  "route-auth",
  "route-shell-hidden",
  "route-chrome-hidden",
]);

const APP_CLASSES = Object.freeze([
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

const AUTH_PATHS = new Set([
  "/login",
  "/logout",
  "/activate-account",
  "/activate",
  "/activation",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/password-reset/confirm",
  "/2fa",
  "/otp",
  "/mfa",
  "/403",
  "/404",
]);

const EVENTS = Object.freeze({
  ready: "auth:login:view:ready",
  submitStart: "auth:login:view:submit:start",
  submitDone: "auth:login:view:submit:done",
  submitBlocked: "auth:login:view:submit:blocked",
  submitUnlocked: "auth:login:view:submit:unlocked",
  error: "auth:login:view:error",
  navigationStart: "auth:login:view:navigation:start",
  navigationDone: "auth:login:view:navigation:done",
  navigationError: "auth:login:view:navigation:error",
  navigationFailsafe: "auth:login:view:navigation:failsafe",
  authScreenCleared: "auth:login:view:auth-screen-cleared",
  destroyed: "auth:login:view:destroyed",
  debugReady: "auth:login:view:debug-ready",
});

/* =========================================================
   RUNTIME
========================================================= */

let globalSubmitPromise = null;
let globalSubmitFingerprint = "";
let globalSubmitStartedAt = 0;
let lastSuccessToastAt = 0;
let lastInstance = null;

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
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value) {
  return isObject(value) ? value : {};
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

function normalizeError(error = null) {
  if (!error) return null;

  const source = error?.error || error?.reason || error;

  return {
    name: safeText(source?.name || source?.constructor?.name, "Error"),
    message: safeText(source?.message || source?.reason || source, "Error"),
    code: source?.code || source?.data?.code || source?.response?.data?.code || null,
    status: source?.status || source?.statusCode || source?.response?.status || 0,
    at: iso(),
  };
}

function log(...args) {
  try {
    AppCore?.utils?.log?.("[LoginView]", ...args);
  } catch {}
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[LoginView]", ...args);
  } catch {}
}

function errorLog(...args) {
  try {
    AppCore?.utils?.error?.("[LoginView]", ...args);
    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) console.error("[LoginView]", ...args);
  } catch {}
}

function emit(eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    version: LOGIN_VIEW_VERSION,
    at: iso(),
    ...safeObject(payload),
  };

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, detail);
      emitted = true;
    }
  } catch {}

  if (!hasBus && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

function withTimeout(work, timeoutMs = 0, code = "TIMEOUT") {
  const ms = Math.max(0, Number(timeoutMs || 0));

  if (!ms) return Promise.resolve(work);

  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(code);
      error.code = code;
      reject(error);
    }, ms);
  });

  return Promise.race([Promise.resolve(work), timeout]).finally(() => {
    if (timer) {
      try {
        clearTimeout(timer);
      } catch {}
    }

    timer = null;
  });
}

/* =========================================================
   PATH / ROUTER
========================================================= */

function isHashRouterPath(value = "") {
  const text = safeText(value, "");
  return text.startsWith("#/") || text.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const text = safeText(value, "");
  if (!text) return "/";

  if (text.startsWith("#!")) return text.replace(/^#!\/?/, "/") || "/";
  return text.replace(/^#\/?/, "/") || "/";
}

function normalizePathname(value = "/") {
  let path = safeText(value, "/")
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

function normalizePath(value = "/") {
  let raw = safeText(value, "/") || "/";

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const url = new URL(raw, window.location?.origin || "http://localhost");

      if (url.hash && isHashRouterPath(url.hash)) {
        return normalizePath(url.hash);
      }

      raw = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "/";
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return `${normalizePathname(pathname)}${search}${hash}`;
}

function stripSearchHash(path = "/") {
  return normalizePath(path).split("?")[0].split("#")[0] || "/";
}

function stripUsernamePrefix(path = "/") {
  const normalized = normalizePath(path);
  const pathOnly = stripSearchHash(normalized);
  const suffix = normalized.slice(pathOnly.length);
  const clean = pathOnly.replace(/^\/@[^/]+(?=\/|$)/i, "") || "/";

  return normalizePath(`${clean}${suffix}`);
}

function currentPath() {
  if (!isBrowser()) return "/";

  try {
    const hash = window.location.hash || "";

    if (isHashRouterPath(hash)) return normalizePath(hash);

    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${hash}`
    );
  } catch {
    return "/";
  }
}

function currentCanonicalPath() {
  return stripSearchHash(stripUsernamePrefix(currentPath()));
}

function isLoginRoute(path = currentPath()) {
  const clean = stripSearchHash(stripUsernamePrefix(path));
  return clean === LOGIN_ROUTE || clean.startsWith(`${LOGIN_ROUTE}/`);
}

function hasOpenRedirectRisk(value = "") {
  const raw = safeText(value, "");

  if (!raw) return true;
  if (!raw.startsWith("/")) return true;
  if (raw.startsWith("//")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return true;
  if (/[\r\n\t\\]/.test(raw)) return true;

  const lower = raw.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("%5c")
  ) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(raw).trim().replace(/\\/g, "/");

    return (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    );
  } catch {
    return true;
  }
}

function isAuthPath(path = "") {
  const clean = stripSearchHash(stripUsernamePrefix(path)).toLowerCase();

  if (AUTH_PATHS.has(clean)) return true;

  return (
    clean.startsWith("/login/") ||
    clean.startsWith("/logout/") ||
    clean.startsWith("/activate-account/") ||
    clean.startsWith("/activate/") ||
    clean.startsWith("/activation/") ||
    clean.startsWith("/reset-password/") ||
    clean.startsWith("/forgot-password/") ||
    clean.startsWith("/recover-password/") ||
    clean.startsWith("/password-reset/") ||
    clean.startsWith("/2fa/") ||
    clean.startsWith("/otp/") ||
    clean.startsWith("/mfa/")
  );
}

function safeInternalPath(path = "", fallback = DEFAULT_HOME, options = {}) {
  const candidate = normalizePath(path || "");

  if (!candidate || hasOpenRedirectRisk(candidate)) {
    return normalizePath(fallback || DEFAULT_HOME);
  }

  if (options.allowAuth !== true && isAuthPath(candidate)) {
    return normalizePath(fallback || DEFAULT_HOME);
  }

  return candidate;
}

function configuredHome() {
  const candidate = normalizePath(
    AppCore?.config?.routes?.home ||
      AppCore?.config?.auth?.homeRoute ||
      AppCore?.config?.auth?.postLoginFallback ||
      DEFAULT_HOME
  );

  return safeInternalPath(candidate, DEFAULT_HOME);
}

function getRouter() {
  try {
    return (
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.modules?.get?.("router") ||
      (isBrowser() ? window.__ONION_ROUTER__ || window.Router : null) ||
      null
    );
  } catch {
    return null;
  }
}

async function navigateTo(path = "/", options = {}) {
  const target = safeInternalPath(path, configuredHome(), {
    allowAuth: options.allowAuth === true,
  });

  const router = getRouter();

  const routerOptions = {
    replaceState: options.replaceState !== false,
    force: true,
    forceRender: true,
    source: SOURCE,
    fromLogin: true,
    reason: options.reason || "login-navigation",
    publicPath: target,
    requestedPath: target,
    canonicalPath: stripSearchHash(stripUsernamePrefix(target)),
  };

  emit(EVENTS.navigationStart, {
    target,
    method: router ? "router" : "hard-redirect",
  });

  try {
    if (router?.navigate) {
      await withTimeout(
        router.navigate(target, routerOptions),
        NAVIGATION_TIMEOUT_MS,
        "LOGIN_NAVIGATION_TIMEOUT"
      );

      emit(EVENTS.navigationDone, { target, method: "router.navigate" });
      return true;
    }

    if (router?.replace) {
      await withTimeout(
        router.replace(target, routerOptions),
        NAVIGATION_TIMEOUT_MS,
        "LOGIN_NAVIGATION_TIMEOUT"
      );

      emit(EVENTS.navigationDone, { target, method: "router.replace" });
      return true;
    }

    if (router?.goAfterLogin) {
      await withTimeout(
        router.goAfterLogin(target, routerOptions),
        NAVIGATION_TIMEOUT_MS,
        "LOGIN_NAVIGATION_TIMEOUT"
      );

      emit(EVENTS.navigationDone, { target, method: "router.goAfterLogin" });
      return true;
    }

    if (router?.render) {
      await withTimeout(
        router.render(target, {
          ...routerOptions,
          skipHistory: false,
        }),
        NAVIGATION_TIMEOUT_MS,
        "LOGIN_NAVIGATION_TIMEOUT"
      );

      emit(EVENTS.navigationDone, { target, method: "router.render" });
      return true;
    }
  } catch (error) {
    warn("router navigation failed", normalizeError(error));
  }

  try {
    if (AppCore?.navigate) {
      await withTimeout(
        AppCore.navigate(target, routerOptions),
        NAVIGATION_TIMEOUT_MS,
        "LOGIN_NAVIGATION_TIMEOUT"
      );

      emit(EVENTS.navigationDone, { target, method: "AppCore.navigate" });
      return true;
    }
  } catch (error) {
    warn("AppCore.navigate failed", normalizeError(error));
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(target);
    emit(EVENTS.navigationDone, { target, method: "window.location.assign" });
    return true;
  } catch {
    try {
      window.location.href = target;
      emit(EVENTS.navigationDone, { target, method: "window.location.href" });
      return true;
    } catch {}
  }

  emit(EVENTS.navigationError, {
    target,
    reason: "navigation-failed",
  });

  return false;
}

function scheduleNavigationFailsafe(container, target = DEFAULT_HOME) {
  if (!isBrowser()) return () => {};

  let timer = window.setTimeout(() => {
    timer = null;

    if (isLoginRoute()) return;

    const loginStillRendered = Boolean(
      container?.isConnected &&
        container.querySelector?.("[data-login-view],.login-view")
    );

    if (!loginStillRendered) return;

    emit(EVENTS.navigationFailsafe, {
      target,
      loginStillRendered,
    });

    try {
      window.location.assign(target);
    } catch {}
  }, POST_NAV_FAILSAFE_MS);

  return () => {
    if (!timer) return;

    try {
      window.clearTimeout(timer);
    } catch {}

    timer = null;
  };
}

/* =========================================================
   AUTH SCREEN
========================================================= */

function setClassList(node, add = [], remove = []) {
  if (!node) return false;

  try {
    node.classList.add(...add);
    node.classList.remove(...remove);
    return true;
  } catch {
    return false;
  }
}

function setDataset(node, data = {}) {
  if (!node) return false;

  try {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === "") {
        delete node.dataset[key];
      } else {
        node.dataset[key] = String(value);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function setHidden(node, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function query(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function getShellNodes() {
  if (!isBrowser()) return {};

  return {
    html: document.documentElement,
    body: document.body,

    shell:
      AppCore?.dom?.appShell ||
      AppCore?.dom?.shell ||
      query("#app-shell,[data-app-shell],.app-shell"),

    main:
      AppCore?.dom?.mainContent ||
      AppCore?.dom?.main ||
      query("#main-content,[data-main-content],main"),

    appContent:
      AppCore?.dom?.appContent ||
      query("#app-content,[data-app-content]"),

    view:
      AppCore?.dom?.viewContainer ||
      query("#view-container,[data-view-root],[data-router-view]"),

    sidebar:
      AppCore?.dom?.sidebar ||
      query("#app-sidebar,#sidebar,[data-sidebar-root],.sidebar"),

    topbar:
      AppCore?.dom?.topbar ||
      query("#app-topbar,#topbar,[data-topbar-root],.topbar"),

    sidebarMount:
      AppCore?.dom?.sidebarMount ||
      query("#sidebar-mount,[data-sidebar-mount]"),

    topbarMount:
      AppCore?.dom?.topbarMount ||
      query("#topbar-mount,[data-topbar-mount]"),

    tablehead:
      AppCore?.dom?.tablehead ||
      query("#table-head,[data-tablehead],.table-head"),

    tableheadContainer:
      AppCore?.dom?.tableheadContainer ||
      query("#tablehead-container,[data-tablehead-container]"),

    loader:
      AppCore?.dom?.loader ||
      query("#app-loader,[data-app-loader],.app-loader"),
  };
}

function enableAuthScreen() {
  if (!isBrowser()) return false;

  const nodes = getShellNodes();

  setClassList(nodes.body, AUTH_CLASSES, APP_CLASSES);
  setClassList(nodes.html, ["route-auth", "route-shell-hidden", "route-chrome-hidden"], APP_CLASSES);

  setDataset(nodes.body, {
    authScreen: "true",
    routeMode: "auth",
    chrome: "hidden",
    shell: "visible",
    appLoading: "false",
  });

  setDataset(nodes.html, {
    routeMode: "auth",
    chrome: "hidden",
    shell: "visible",
    appLoading: "false",
  });

  for (const node of [nodes.shell, nodes.main, nodes.appContent, nodes.view]) {
    setHidden(node, false);
    setDataset(node, {
      routeMode: "auth",
      chrome: "hidden",
      shell: "visible",
    });
  }

  for (const node of [
    nodes.sidebar,
    nodes.topbar,
    nodes.sidebarMount,
    nodes.topbarMount,
    nodes.tablehead,
    nodes.tableheadContainer,
  ]) {
    setHidden(node, true);
  }

  hideLoader();

  try {
    AppCore?.setState?.(
      {
        shellVisible: false,
        chromeVisible: false,
        appShellVisible: true,
        routeShellHidden: true,
        shellHidden: true,
        authScreen: true,
        routeMode: "auth",
      },
      {
        source: SOURCE,
        emit: false,
        emitState: false,
        silent: true,
      }
    );
  } catch {}

  return true;
}

function disableAuthScreen({ force = false, reason = "cleanup" } = {}) {
  if (!isBrowser()) return false;
  if (!force && isLoginRoute()) return false;

  const nodes = getShellNodes();

  setClassList(nodes.body, APP_CLASSES, AUTH_CLASSES);
  setClassList(nodes.html, APP_CLASSES, ["route-auth", "route-shell-hidden", "route-chrome-hidden"]);

  setDataset(nodes.body, {
    authScreen: null,
    routeMode: "app",
    chrome: "visible",
  });

  setDataset(nodes.html, {
    routeMode: "app",
    chrome: "visible",
  });

  for (const node of [
    nodes.sidebar,
    nodes.topbar,
    nodes.sidebarMount,
    nodes.topbarMount,
  ]) {
    setHidden(node, false);
  }

  try {
    AppCore?.setState?.(
      {
        shellVisible: true,
        chromeVisible: true,
        appShellVisible: true,
        routeShellHidden: false,
        shellHidden: false,
        authScreen: false,
        routeMode: "app",
      },
      {
        source: SOURCE,
        emit: false,
        emitState: false,
        silent: true,
      }
    );
  } catch {}

  emit(EVENTS.authScreenCleared, {
    reason,
    stillOnLogin: isLoginRoute(),
  });

  return true;
}

function hideLoader() {
  const nodes = getShellNodes();

  for (const root of [nodes.html, nodes.body]) {
    if (!root) continue;

    try {
      root.classList.remove(...LOADING_CLASSES);
      root.dataset.appLoading = "false";
    } catch {}
  }

  if (nodes.loader) {
    setHidden(nodes.loader, true);

    try {
      nodes.loader.classList.remove("is-visible", "is-entering", "is-leaving", "app-loader--visible");
      nodes.loader.classList.add("is-hidden", "has-hidden");
      nodes.loader.dataset.loaderVisible = "false";
      nodes.loader.dataset.loaderState = "hidden";
      nodes.loader.setAttribute("aria-busy", "false");
    } catch {}
  }

  try {
    AppCore?.setLoading?.(false);
  } catch {}

  return true;
}

function scheduleAuthScreenCleanup() {
  if (!isBrowser()) {
    return {
      flush: () => false,
      cancel: () => {},
    };
  }

  const timers = [];
  const disposers = [];

  let disposed = false;

  function cleanup(reason = "navigation") {
    if (disposed) return false;
    if (isLoginRoute()) return false;

    disableAuthScreen({
      force: true,
      reason,
    });

    cancel();
    return true;
  }

  function cancel() {
    disposed = true;

    while (timers.length) {
      try {
        window.clearTimeout(timers.pop());
      } catch {}
    }

    while (disposers.length) {
      try {
        disposers.pop()?.();
      } catch {}
    }
  }

  function onEvent(eventName, reason) {
    const handler = () => cleanup(reason);

    try {
      AppCore?.events?.on?.(eventName, handler);
      disposers.push(() => AppCore?.events?.off?.(eventName, handler));
      return;
    } catch {}

    try {
      window.addEventListener(eventName, handler);
      disposers.push(() => window.removeEventListener(eventName, handler));
    } catch {}
  }

  onEvent("router:rendered", "router:rendered");
  onEvent("router:navigation:complete", "router:navigation:complete");
  onEvent("popstate", "popstate");

  [0, 80, 180, 360, 720, 1200].forEach((delay) => {
    timers.push(window.setTimeout(() => cleanup(`timer:${delay}`), delay));
  });

  timers.push(window.setTimeout(cancel, 1500));

  return {
    flush: cleanup,
    cancel,
  };
}

/* =========================================================
   GLOBAL SUBMIT LOCK
========================================================= */

function fingerprint(payload = {}) {
  return [
    safeText(
      payload.identifier ||
        payload.email ||
        payload.username ||
        payload.user ||
        payload.login ||
        "",
      ""
    ).toLowerCase(),
    payload.remember || payload.rememberMe ? "1" : "0",
  ].join("|");
}

function clearGlobalSubmit(reason = "") {
  globalSubmitPromise = null;
  globalSubmitFingerprint = "";
  globalSubmitStartedAt = 0;

  if (reason) log("global submit lock cleared", reason);
}

function clearStaleGlobalSubmit() {
  if (!globalSubmitPromise) return false;

  const started = Number(globalSubmitStartedAt) || 0;

  if (!started || now() - started > GLOBAL_SUBMIT_TIMEOUT_MS + GLOBAL_SUBMIT_GRACE_MS) {
    clearGlobalSubmit("stale");
    return true;
  }

  return false;
}

function hasGlobalSubmit() {
  clearStaleGlobalSubmit();
  return Boolean(globalSubmitPromise);
}

function runGlobalSubmit(work, submitFingerprint = "") {
  clearStaleGlobalSubmit();

  if (globalSubmitPromise) return globalSubmitPromise;

  globalSubmitStartedAt = now();
  globalSubmitFingerprint = safeText(submitFingerprint, "");

  globalSubmitPromise = withTimeout(
    Promise.resolve().then(work),
    GLOBAL_SUBMIT_TIMEOUT_MS,
    "LOGIN_SUBMIT_TIMEOUT"
  ).finally(() => {
    clearGlobalSubmit();
  });

  return globalSubmitPromise;
}

/* =========================================================
   AUTH EXECUTOR
========================================================= */

function moduleAuth() {
  try {
    return (
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      AppCore?.Auth ||
      AppCore?.auth ||
      null
    );
  } catch {
    return null;
  }
}

function resolveLoginExecutor(deps = {}) {
  const authModule = moduleAuth();

  const candidates = [
    {
      fn: deps.onSubmit,
      owner: deps,
      source: "deps.onSubmit",
      custom: true,
    },
    {
      fn: deps.submitLogin,
      owner: deps,
      source: "deps.submitLogin",
      custom: true,
    },
    {
      fn: deps.login,
      owner: deps,
      source: "deps.login",
      custom: true,
    },
    {
      fn: Auth?.login,
      owner: Auth,
      source: "Auth.login",
      custom: false,
    },
    {
      fn: authModule?.login,
      owner: authModule,
      source: "moduleAuth.login",
      custom: false,
    },
  ];

  return candidates.find((item) => isFn(item.fn)) || null;
}

function buildLoginOptions(deps = {}) {
  return {
    source: SOURCE,

    /*
      La vista decide navegación por defecto.
      Auth.login sólo debe aplicar sesión.
    */
    navigate: false,
    skipNavigate: true,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
    skipPostLoginNavigation: true,
    skipPostRestoreNavigation: true,

    preserveCurrentRoute: true,
    preserveRoute: true,
    preservePublicPath: true,

    emitLoginSuccessEvent: deps.emitLoginSuccessEvent === true,

    redirectTo: deps.redirectTo,
    redirect: deps.redirect,
    target: deps.target,
  };
}

function stateToken() {
  return safeText(
    AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.access_token ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      "",
    ""
  );
}

function stateUser() {
  return (
    AppCore?.state?.user ||
    AppCore?.state?.currentUser ||
    AppCore?.state?.authUser ||
    AppCore?.state?.sessionUser ||
    AppCore?.state?.session?.user ||
    null
  );
}

function buildCoreAuthResult() {
  const token = stateToken();
  const user = stateUser();

  if (!hasUsableToken(token) || !hasUsableUser(user)) return null;

  return normalizeAuthResult({
    ok: true,
    success: true,
    authenticated: true,
    token,
    accessToken: token,
    user,
    usuario: user,
    source: "core-state",
  });
}

function normalizeLoginResult(rawResult = null) {
  const normalized = normalizeAuthResult(rawResult || {});

  if (normalized.authenticated || normalized.requires2FA || normalized.explicitFailure) {
    return normalized;
  }

  const fromCore = buildCoreAuthResult();
  return fromCore || normalized;
}

function isAuthenticatedResult(auth = {}) {
  if (!auth || auth.requires2FA || auth.explicitFailure) return false;

  if (auth.authenticated === true) return true;

  return Boolean(
    hasUsableToken(auth.token || auth.accessToken || auth.access_token || stateToken()) &&
      hasUsableUser(auth.user || auth.usuario || stateUser())
  );
}

function is2FAResult(auth = {}) {
  const status = safeText(auth?.status, "").toLowerCase();

  return Boolean(
    auth?.requires2FA === true ||
      status === "2fa_required" ||
      status === "mfa_required" ||
      status === "two_factor_required" ||
      status === "otp_required"
  );
}

/* =========================================================
   INSTANCE MANAGEMENT
========================================================= */

function destroyPrevious(container) {
  try {
    const previous = container?.[INSTANCE_KEY];

    if (previous?.destroy) {
      previous.destroy({
        remount: true,
        preserveAuthScreen: true,
      });

      return true;
    }
  } catch {}

  return false;
}

function storeInstance(container, instance) {
  if (!container || !instance) return false;

  try {
    Object.defineProperty(container, INSTANCE_KEY, {
      value: instance,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch {
    try {
      container[INSTANCE_KEY] = instance;
    } catch {}
  }

  lastInstance = instance;

  try {
    if (isBrowser()) {
      window[RUNTIME_KEY] = instance;
    }
  } catch {}

  return true;
}

function clearInstance(container, instance) {
  try {
    if (container?.[INSTANCE_KEY] === instance) {
      delete container[INSTANCE_KEY];
    }
  } catch {}

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   TEMPLATE
========================================================= */

function renderTemplate(container, html = "") {
  const markup = safeText(html, "");

  if (!isBrowser()) {
    try {
      container.innerHTML = markup;
    } catch {}

    return true;
  }

  try {
    const template = document.createElement("template");
    template.innerHTML = markup;

    container.replaceChildren(template.content.cloneNode(true));
    return true;
  } catch {
    try {
      container.innerHTML = markup;
      return true;
    } catch {
      return false;
    }
  }
}

function appName() {
  return safeText(AppCore?.config?.appName, "Onion Support");
}

function forgotHref(deps = {}) {
  return (
    safeText(deps.forgotPasswordHref, "") ||
    safeText(AppCore?.config?.routes?.forgotPassword, "") ||
    "/forgot-password"
  );
}

/* =========================================================
   VIEW RENDER
========================================================= */

export function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error("[LoginView] container requerido.");
  }

  destroyPrevious(container);

  let mounted = true;
  let submitting = false;
  let leavingLogin = false;

  let loadingToastId = null;
  let submitWatchdog = null;
  let navigationFailsafe = null;
  let authCleanup = null;

  enableAuthScreen();

  const toast = ToastBridge.of(deps.toast || deps.Toast || deps.toastProvider || null);

  try {
    toast.init?.();
  } catch {}

  const rememberedIdentifier = loadRememberedIdentifier();

  renderTemplate(
    container,
    getLoginTemplate({
      appName: appName(),
      identifier: rememberedIdentifier,
      forgotPasswordHref: forgotHref(deps),
      ...safeObject(deps),
    })
  );

  const refs = getLoginRefs(container);
  const passwordBindings = bindLoginPasswordFields(container);

  const submitLabel = safeText(deps.submitLabel, "Entrar al panel");
  const loadingLabel = safeText(deps.loadingLabel, "Accediendo...");

  const executor = resolveLoginExecutor(deps);

  function closeLoadingToast() {
    if (loadingToastId !== null && loadingToastId !== undefined && loadingToastId !== "") {
      try {
        toast.dismiss(loadingToastId);
      } catch {}
    }

    loadingToastId = null;
  }

  function stopWatchdog() {
    if (!submitWatchdog) return;

    try {
      clearTimeout(submitWatchdog);
    } catch {}

    submitWatchdog = null;
  }

  function startWatchdog() {
    stopWatchdog();

    submitWatchdog = setTimeout(() => {
      submitWatchdog = null;
      closeLoadingToast();
      clearGlobalSubmit("watchdog");

      if (mounted && isLoginRoute()) {
        submitting = false;
        leavingLogin = false;
        unlockLoginForm(refs, { submitLabel, loadingLabel });

        emit(EVENTS.submitUnlocked, {
          reason: "watchdog",
        });

        try {
          toast.error("Se recuperó el formulario. Inténtalo de nuevo.");
        } catch {}
      }
    }, GLOBAL_SUBMIT_TIMEOUT_MS + GLOBAL_SUBMIT_GRACE_MS);
  }

  function setSubmitting(value = false) {
    submitting = Boolean(value);

    try {
      if (refs.form?.dataset) {
        if (submitting) refs.form.dataset.loginSubmitting = "1";
        else delete refs.form.dataset.loginSubmitting;
      }
    } catch {}

    setLoginLoading(refs, submitting, {
      submitLabel,
      loadingLabel,
    });
  }

  function unlock(reason = "manual") {
    closeLoadingToast();
    stopWatchdog();
    clearGlobalSubmit(reason);

    submitting = false;

    if (mounted) {
      unlockLoginForm(refs, {
        submitLabel,
        loadingLabel,
      });
    }

    emit(EVENTS.submitUnlocked, {
      reason,
    });

    return true;
  }

  async function navigateAfter(auth = {}) {
    if (deps.navigate === false || deps.skipNavigate === true || deps.manualNavigate === true) {
      return false;
    }

    if (!shouldRedirectAfterLogin(auth, deps)) {
      return false;
    }

    if (!isLoginRoute()) {
      return false;
    }

    const target = safeInternalPath(
      resolveLoginRedirect(auth, deps) || configuredHome(),
      configuredHome(),
      {
        allowAuth: auth.requires2FA === true,
      }
    );

    leavingLogin = true;

    if (!authCleanup) {
      authCleanup = scheduleAuthScreenCleanup();
    }

    const ok = await navigateTo(target, {
      replaceState: true,
      reason: auth.requires2FA ? "login-2fa" : "login-success",
      allowAuth: auth.requires2FA === true,
    });

    if (ok) {
      navigationFailsafe = scheduleNavigationFailsafe(container, target);
      return true;
    }

    leavingLogin = false;

    if (mounted && isLoginRoute()) {
      unlock("navigation-failed");
    }

    return false;
  }

  async function handleSubmit(event) {
    try {
      event?.preventDefault?.();
    } catch {}

    clearStaleGlobalSubmit();

    if (submitting || leavingLogin || hasGlobalSubmit() || refs.form?.dataset?.loginSubmitting === "1") {
      emit(EVENTS.submitBlocked, {
        submitting,
        leavingLogin,
        hasGlobalSubmit: hasGlobalSubmit(),
        fingerprint: globalSubmitFingerprint,
      });

      try {
        toast.info("Ya hay un inicio de sesión en curso.");
      } catch {}

      return;
    }

    clearLoginErrors(refs);

    const formState = readLoginFormState(refs);
    const payload = createLoginPayload(formState);
    const validationErrors = validateLoginPayload(payload);

    if (Object.keys(validationErrors).length > 0) {
      applyLoginErrors(refs, validationErrors);

      try {
        toast.error(getFirstLoginError(validationErrors) || "Revisa el formulario.");
      } catch {}

      return;
    }

    if (!executor) {
      const message = "No se encontró el módulo de autenticación.";
      setGlobalLoginError(refs, message);

      try {
        toast.error(message);
      } catch {}

      return;
    }

    persistRememberedIdentifier(payload);

    const submitFingerprint = fingerprint(payload);

    try {
      setSubmitting(true);
      startWatchdog();

      loadingToastId = toast.loading?.("Validando credenciales...", {
        id: "login:loading",
        persist: true,
        dedupeMs: 0,
      });

      emit(EVENTS.submitStart, {
        executor: executor.source,
        customExecutor: executor.custom,
        fingerprint: submitFingerprint,
      });

      const rawResult = await runGlobalSubmit(
        () => executor.fn.call(executor.owner || null, payload, buildLoginOptions(deps)),
        submitFingerprint
      );

      const auth = normalizeLoginResult(rawResult);

      closeLoadingToast();

      if (!mounted) return;

      if (is2FAResult(auth)) {
        try {
          toast.info(auth.message || "Verificación adicional requerida.");
        } catch {}

        await navigateAfter({
          ...auth,
          requires2FA: true,
          redirectTo: auth.redirectTo || DEFAULT_2FA,
        });

        emit(EVENTS.submitDone, {
          ok: true,
          twoFactor: true,
        });

        return;
      }

      if (!isAuthenticatedResult(auth)) {
        throw rawResult || new Error("INVALID_LOGIN_RESULT");
      }

      if (executor.custom === true) {
        syncSession(auth, {
          source: SOURCE,
        });
      }

      const current = now();

      if (current - lastSuccessToastAt > SUCCESS_TOAST_DEDUPE_MS) {
        lastSuccessToastAt = current;

        try {
          toast.success(auth.message || "Sesión iniciada correctamente.");
        } catch {}
      }

      await navigateAfter(auth);

      emit(EVENTS.submitDone, {
        ok: true,
        authenticated: true,
        navigated: !isLoginRoute(),
      });
    } catch (error) {
      closeLoadingToast();

      const normalized = normalizeError(error);

      const message =
        normalized?.code === "LOGIN_SUBMIT_TIMEOUT" ||
        normalized?.message === "LOGIN_SUBMIT_TIMEOUT"
          ? "La solicitud tardó demasiado. Revisa tu conexión y vuelve a intentarlo."
          : resolveAuthErrorMessage(error);

      setGlobalLoginError(refs, message);

      try {
        toast.error(message);
      } catch {}

      emit(EVENTS.error, {
        message,
        error: normalized,
      });

      errorLog("login error", normalized);
    } finally {
      stopWatchdog();
      closeLoadingToast();

      if (!leavingLogin || isLoginRoute()) {
        leavingLogin = false;
        unlock("finally");
      }
    }
  }

  function toggleTheme() {
    const current = safeText(
      AppCore?.state?.theme ||
        document.documentElement?.dataset?.theme ||
        AppCore?.config?.defaultTheme ||
        "dark",
      "dark"
    ).toLowerCase();

    const next = current === "light" ? "dark" : "light";

    try {
      AppCore?.setTheme?.(next);
    } catch {
      try {
        document.documentElement.dataset.theme = next;
      } catch {}
    }

    try {
      toast.info(`Tema ${next} activado.`);
    } catch {}
  }

  const unbindInputClearers = bindLoginInputClearers(refs, () => clearLoginErrors(refs));
  const unbindTheme = bindThemeToggle(refs, toggleTheme);
  const unbindSubmit = bindLoginSubmit(refs, handleSubmit);

  focusLoginPrimaryField(refs, {
    rememberedIdentifier,
  });

  hideLoader();

  emit(EVENTS.ready, {
    route: LOGIN_ROUTE,
    view: "login",
    executor: executor?.source || null,
  });

  const instance = {
    version: LOGIN_VIEW_VERSION,

    destroy(options = {}) {
      mounted = false;

      stopWatchdog();

      if (navigationFailsafe) {
        try {
          navigationFailsafe();
        } catch {}

        navigationFailsafe = null;
      }

      closeLoadingToast();

      try {
        unbindInputClearers?.();
      } catch {}

      try {
        unbindTheme?.();
      } catch {}

      try {
        unbindSubmit?.();
      } catch {}

      try {
        destroyLoginPasswordFields(container);
      } catch {
        try {
          for (const binding of passwordBindings || []) {
            if (isFn(binding)) binding();
            else if (binding?.destroy) binding.destroy();
            else if (binding?.unbind) binding.unbind();
            else if (binding?.dispose) binding.dispose();
          }
        } catch {}
      }

      if (authCleanup) {
        if (leavingLogin) {
          try {
            authCleanup.flush?.("destroy-leaving-login");
          } catch {}
        } else {
          try {
            authCleanup.cancel?.();
          } catch {}
        }

        authCleanup = null;
      }

      if (options.preserveAuthScreen !== true && options.remount !== true) {
        disableAuthScreen({
          force: !isLoginRoute(),
          reason: "destroy-login-view",
        });
      }

      clearInstance(container, instance);

      emit(EVENTS.destroyed, {
        remount: options.remount === true,
        preserveAuthScreen: options.preserveAuthScreen === true,
        leavingLogin,
      });
    },

    unlock,

    getSnapshot() {
      return {
        version: LOGIN_VIEW_VERSION,
        source: SOURCE,

        mounted: Boolean(mounted),
        submitting: Boolean(submitting),
        leavingLogin: Boolean(leavingLogin),

        currentPath: currentPath(),
        currentCanonicalPath: currentCanonicalPath(),
        stillOnLogin: isLoginRoute(),

        hasGlobalSubmit: hasGlobalSubmit(),
        globalSubmitFingerprint,
        globalSubmitStartedAt,
        globalSubmitStartedAtIso: globalSubmitStartedAt ? iso(globalSubmitStartedAt) : "",

        hasLoadingToast: Boolean(loadingToastId),
        hasSubmitWatchdog: Boolean(submitWatchdog),
        hasNavigationFailsafe: Boolean(navigationFailsafe),

        executor: executor?.source || null,
        customExecutor: executor?.custom === true,

        authenticated: Boolean(AppCore?.state?.authenticated),
        hasStateToken: Boolean(stateToken()),
        hasStateUser: hasUsableUser(stateUser()),

        dom: getLoginDomSnapshot(refs),

        at: iso(),
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  storeInstance(container, instance);

  emit(EVENTS.debugReady, {
    installed: true,
  });

  log("ready", {
    executor: executor?.source || null,
  });

  return instance;
}

/* =========================================================
   COMPAT EXPORTS
========================================================= */

function init(container, deps = {}) {
  return renderLoginView(container, deps);
}

function mount(container, deps = {}) {
  return renderLoginView(container, deps);
}

function destroy(options = {}) {
  if (lastInstance?.destroy) {
    lastInstance.destroy(options);
    return true;
  }

  return false;
}

function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: LOGIN_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    currentPath: isBrowser() ? currentPath() : "",
    currentCanonicalPath: isBrowser() ? currentCanonicalPath() : "",
    stillOnLogin: isBrowser() ? isLoginRoute() : false,
    hasGlobalSubmit: hasGlobalSubmit(),
    at: iso(),
  };
}

export const LoginView = Object.assign(
  function LoginViewCompat(container, deps = {}) {
    return renderLoginView(container, deps);
  },
  {
    version: LOGIN_VIEW_VERSION,

    render: renderLoginView,
    init,
    mount,
    destroy,

    getSnapshot,
    getDebugSnapshot: getSnapshot,
  }
);

try {
  if (isBrowser()) {
    window[RUNTIME_KEY] = LoginView;
  }
} catch {}

export {
  renderLoginView as render,
  init,
  mount,
  destroy,
  getSnapshot,
};

export default LoginView;

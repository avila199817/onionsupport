/* =========================================================
   Onion SPA - App Shell
   Archivo: src/app/shell.js

   APP SHELL · SIMPLE ADAPTER
   - adapter mínimo para boot/compat
   - router/shell.js gobierna el chrome real
   - expone helpers usados por app/index.js
   - sincroniza visibilidad por ruta
   - aplica política de loader post-render
   - sin Auth, guards, render de vistas, history, storage, Toast ni navegación
========================================================= */

import {
  getShellElements as getRouterShellElements,
  setShellMode as setRouterShellMode,
  getShellSnapshot as getRouterShellSnapshot,
} from "../router/shell.js";

export const SHELL_VERSION = "21.0.0-simple";

const SOURCE = "app.shell";
const DEFAULT_ROUTE = "/";
const DEBUG_KEY = "__ONION_APP_SHELL__";

const AUTH_PATHS = new Set([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/2fa",
  "/otp",
  "/mfa",
  "/403",
  "/404",
]);

const AUTH_PREFIXES = Object.freeze([
  "/activate-account/",
  "/activate/",
  "/activation/",
  "/account/activate/",
  "/activate/first-user/",
  "/reset-password/confirm/",
  "/password-reset/confirm/",
  "/2fa/",
  "/otp/",
  "/mfa/",
]);

const LOADER_VISIBLE_CLASSES = Object.freeze(["is-visible", "is-entering", "is-leaving", "loader-visible", "app-loader--visible"]);
const LOADER_HIDDEN_CLASSES = Object.freeze(["is-hidden", "has-hidden", "loader-hidden"]);

const TOKEN_RE = /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|otpToken|otp_token)=)([^&#\s]+)/gi;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|session|refresh|otp|mfa|2fa|code/i;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return text(value, "")
    .replace(TOKEN_RE, "$1***")
    .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      status: value.status || value.statusCode || value.response?.status || null,
      code: value.code || value.data?.code || value.response?.data?.code || null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({ source: SOURCE, version: SHELL_VERSION, at: isoNow(), ...object(payload) });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function setState(AppCore, patch = {}) {
  const data = object(patch);
  if (!Object.keys(data).length) return false;

  try {
    AppCore?.setState?.(data, { source: SOURCE, emit: false, emitState: false, silent: true });
    return true;
  } catch {}

  try {
    AppCore?.patchState?.(data, { source: SOURCE, emit: false, silent: true });
    return true;
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, data);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   PATHS
========================================================= */

function normalizePathname(path = DEFAULT_ROUTE) {
  let value = text(path, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/@[^/]+(?=\/|$)/i, "");

  if (!value) value = DEFAULT_ROUTE;
  if (!value.startsWith("/")) value = `/${value}`;

  const parts = [];

  for (const part of value.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  value = `/${parts.join("/")}` || DEFAULT_ROUTE;
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_ROUTE : value;
}

function stripSearchHash(path = DEFAULT_ROUTE) {
  return text(path, DEFAULT_ROUTE).split("#")[0].split("?")[0] || DEFAULT_ROUTE;
}

function canonicalPath(path = DEFAULT_ROUTE) {
  return normalizePathname(stripSearchHash(path || DEFAULT_ROUTE));
}

function currentCanonical(AppCore, Router = null) {
  try {
    const value = Router?.getCurrentCanonicalPath?.();
    if (value) return canonicalPath(value);
  } catch {}

  return canonicalPath(AppCore?.state?.canonicalPath || AppCore?.state?.route || AppCore?.state?.publicPath || DEFAULT_ROUTE);
}

function currentPublic(AppCore, Router = null) {
  try {
    const value = Router?.getCurrentPublicPath?.();
    if (value) return value;
  } catch {}

  return AppCore?.state?.publicPath || AppCore?.state?.route || DEFAULT_ROUTE;
}

function isAuthLikePathValue(path = DEFAULT_ROUTE) {
  const clean = canonicalPath(path);
  return AUTH_PATHS.has(clean) || AUTH_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

function routeForVisibility({ visible = true, route = null, canonical = DEFAULT_ROUTE } = {}) {
  if (route) return route;

  if (!visible) {
    return {
      path: canonical || "/login",
      canonicalPath: canonical || "/login",
      hideShell: true,
      shell: false,
      showShell: false,
      layout: "auth",
      authScreen: true,
      meta: { layout: "auth", hideShell: true, shell: false },
    };
  }

  return {
    path: canonical || DEFAULT_ROUTE,
    canonicalPath: canonical || DEFAULT_ROUTE,
    hideShell: false,
    shell: true,
    showShell: true,
    layout: "app",
    authScreen: false,
    meta: { layout: "app", hideShell: false, shell: true },
  };
}

/* =========================================================
   DOM / ELEMENTS
========================================================= */

function setHidden(element, hidden = false) {
  if (!element) return false;

  try { element.hidden = Boolean(hidden); } catch {}
  try { element.setAttribute("aria-hidden", hidden ? "true" : "false"); } catch {}

  return true;
}

function setBusy(element, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function hasContent(element) {
  if (!element) return false;

  try {
    if (element.childElementCount > 0) return true;
  } catch {}

  try {
    return Boolean(text(element.textContent, ""));
  } catch {
    return false;
  }
}

function hideLoaderFallback(AppCore) {
  const loader = getShellElements(AppCore).loader;
  if (!loader) return false;

  try {
    loader.classList.remove(...LOADER_VISIBLE_CLASSES);
    loader.classList.add(...LOADER_HIDDEN_CLASSES);
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";
    return true;
  } catch {
    return false;
  }
}

export function getShellElements(AppCore) {
  const elements = getRouterShellElements(AppCore) || {};

  return {
    html: elements.html || null,
    body: elements.body || null,
    appShell: elements.shell || elements.appShell || null,
    shell: elements.shell || elements.appShell || null,
    mainContent: elements.main || elements.mainContent || null,
    main: elements.main || elements.mainContent || null,
    appContent: elements.appContent || null,
    viewContainer: elements.viewContainer || elements.view || null,
    viewRoot: elements.viewContainer || elements.view || null,
    routerView: elements.viewContainer || elements.view || null,
    sidebarMount: elements.sidebarMount || null,
    topbarMount: elements.topbarMount || null,
    sidebar: elements.sidebar || null,
    topbar: elements.topbar || null,
    tablehead: elements.tablehead || elements.tableHead || null,
    tableHead: elements.tablehead || elements.tableHead || null,
    tableheadContainer: elements.tableheadContainer || elements.tableHeadContainer || null,
    tableHeadContainer: elements.tableheadContainer || elements.tableHeadContainer || null,
    mobileSidebarToggle: elements.mobileToggle || elements.mobileSidebarToggle || null,
    sidebarMobileToggle: elements.mobileToggle || elements.mobileSidebarToggle || null,
    loader: elements.loader || null,
    appLoader: elements.loader || null,
  };
}

export function getViewContainer(AppCore) {
  return getShellElements(AppCore).viewContainer || null;
}

/* =========================================================
   VISIBILITY
========================================================= */

export function readShellVisibility(AppCore) {
  const state = object(AppCore?.state);

  if (typeof state.chromeVisible === "boolean") return state.chromeVisible;
  if (typeof state.routeShellHidden === "boolean") return !state.routeShellHidden;

  const { body, html } = getShellElements(AppCore);

  for (const root of [body, html]) {
    const chrome = text(root?.dataset?.chrome, "");
    if (chrome === "visible") return true;
    if (chrome === "hidden") return false;
  }

  return true;
}

export function setShellVisibility(AppCore, visible = true, options = {}) {
  const opts = object(options);
  const show = Boolean(visible);
  const canonical = canonicalPath(opts.canonicalPath || AppCore?.state?.route || DEFAULT_ROUTE);
  const publicPath = text(opts.publicPath || AppCore?.state?.publicPath || canonical, canonical);
  const route = routeForVisibility({ visible: show, route: opts.route || null, canonical });
  const result = setRouterShellMode(AppCore, route);

  setState(AppCore, {
    appShellVisible: true,
    shellVisible: show,
    shellHidden: !show,
    chromeVisible: show,
    chromeHidden: !show,
    routeShellHidden: !show,
    authScreen: !show,
    routeMode: show ? "app" : "auth",
    currentShellRoute: canonical,
    currentShellCanonicalPath: canonical,
    currentShellPublicPath: publicPath,
  });

  emit(AppCore, "app:shell:state", {
    reason: text(opts.reason, "set-shell-visibility"),
    visible: show,
    chromeVisible: show,
    authLike: !show,
    canonicalPath: canonical,
    publicPath,
  });

  return result?.visible ?? show;
}

export function updateShellVisibilityByRoute(AppCore, Router = null, options = {}) {
  const opts = object(options);
  const canonical = canonicalPath(opts.canonicalPath || currentCanonical(AppCore, Router));
  const publicPath = text(opts.publicPath || currentPublic(AppCore, Router), canonical);

  let route = opts.route || null;

  try {
    route = route || Router?.getRoute?.(canonical) || Router?.getCurrentRoute?.() || null;
  } catch {}

  const authLike = opts.authLike !== undefined
    ? Boolean(opts.authLike)
    : Boolean(isAuthLikePathValue(canonical) || route?.layout === "auth" || route?.hideShell === true || route?.shell === false || route?.meta?.layout === "auth");

  const finalRoute = route || routeForVisibility({ visible: !authLike, canonical });
  const result = setRouterShellMode(AppCore, finalRoute);

  setState(AppCore, {
    appShellVisible: true,
    shellVisible: !authLike,
    shellHidden: authLike,
    chromeVisible: !authLike,
    chromeHidden: authLike,
    routeShellHidden: authLike,
    authScreen: authLike,
    routeMode: authLike ? "auth" : "app",
    currentShellRoute: canonical,
    currentShellCanonicalPath: canonical,
    currentShellPublicPath: publicPath,
  });

  return result?.visible ?? !authLike;
}

/* =========================================================
   LOADER POLICY
========================================================= */

function callHideLoader(AppCore, hideLoader, options = {}) {
  if (isFn(hideLoader)) {
    try {
      hideLoader(AppCore, {
        reason: options.reason || "shell-post-render",
        minVisibleMs: options.minVisibleMs ?? 0,
        force: options.force === true,
        allowDuringBoot: true,
      });
      return true;
    } catch {}
  }

  return hideLoaderFallback(AppCore);
}

export function applyPostRenderLoaderPolicy({
  AppCore,
  Router,
  hideLoader,
  forceHideLoader = false,
  hideLoaderOnPostRender = true,
  minVisibleMs = 0,
} = {}) {
  const elements = getShellElements(AppCore);
  const view = elements.viewContainer;
  const hasViewContent = hasContent(view);
  const chromeVisible = updateShellVisibilityByRoute(AppCore, Router, { reason: "post-render-policy" });

  let loaderHidden = false;

  if (hideLoaderOnPostRender !== false && (hasViewContent || forceHideLoader === true)) {
    loaderHidden = callHideLoader(AppCore, hideLoader, {
      reason: "post-render",
      minVisibleMs,
      force: forceHideLoader === true || hasViewContent,
    });
  }

  for (const element of [elements.appShell, elements.mainContent, elements.appContent, view]) {
    setHidden(element, false);
    setBusy(element, false);
  }

  const snapshot = getShellSnapshot(AppCore, Router);

  emit(AppCore, "app:shell:post-render", {
    hasViewContent,
    chromeVisible,
    loaderHidden,
    snapshot,
  });

  return snapshot;
}

/* =========================================================
   READY / BUSY COMPAT
========================================================= */

export function markShellReady(AppCore, options = {}) {
  updateShellVisibilityByRoute(AppCore, options.Router || null, options);
  setState(AppCore, { shellBusy: false, shellReady: true, shellReadyAt: isoNow() });
  emit(AppCore, "app:shell:ready", { snapshot: getShellSnapshot(AppCore, options.Router || null) });
  return true;
}

export function markShellBusy(AppCore, options = {}) {
  const elements = getShellElements(AppCore);

  for (const element of [elements.appShell, elements.mainContent, elements.appContent, elements.viewContainer]) {
    setBusy(element, true);
  }

  setState(AppCore, { shellBusy: true });
  emit(AppCore, "app:shell:busy", { snapshot: getShellSnapshot(AppCore, options.Router || null) });
  return true;
}

/* =========================================================
   ROUTE HELPERS COMPAT
========================================================= */

export function isLoginPath(AppCore, path = "") {
  return ["/login", "/signin", "/sign-in", "/auth", "/auth/login"].includes(canonicalPath(path || currentCanonical(AppCore)));
}

export function isResetPasswordPath(AppCore, path = "") {
  return ["/forgot-password", "/recover-password", "/recover", "/password-reset", "/reset-password"].includes(canonicalPath(path || currentCanonical(AppCore)));
}

export function isResetPasswordConfirmPath(AppCore, path = "") {
  const clean = canonicalPath(path || currentCanonical(AppCore));
  return clean === "/reset-password/confirm" || clean === "/password-reset/confirm" || clean.startsWith("/reset-password/confirm/") || clean.startsWith("/password-reset/confirm/");
}

export function isActivateAccountPath(AppCore, path = "") {
  const clean = canonicalPath(path || currentCanonical(AppCore));
  return clean === "/activate-account" || clean === "/activate" || clean === "/activation" || clean.startsWith("/activate-account/") || clean.startsWith("/activate/") || clean.startsWith("/activation/");
}

export function isAuthLikePath(AppCore, path = "") {
  return isAuthLikePathValue(path || currentCanonical(AppCore));
}

export function isAuthLikeRoute(AppCore, Router = null) {
  const canonical = currentCanonical(AppCore, Router);
  let route = null;

  try {
    route = Router?.getRoute?.(canonical) || Router?.getCurrentRoute?.() || null;
  } catch {}

  return Boolean(isAuthLikePathValue(canonical) || route?.layout === "auth" || route?.hideShell === true || route?.shell === false || route?.meta?.layout === "auth");
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

function elementSnapshot(element) {
  if (!element) return { exists: false };

  return {
    exists: true,
    id: element.id || "",
    tag: element.tagName?.toLowerCase?.() || "",
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    ariaBusy: element.getAttribute?.("aria-busy") || "",
    className: text(element.className?.baseVal || element.className, "").slice(0, 400),
    dataset: {
      shell: element.dataset?.shell || null,
      chrome: element.dataset?.chrome || null,
      routeMode: element.dataset?.routeMode || null,
      loaderState: element.dataset?.loaderState || null,
    },
  };
}

export function getShellSnapshot(AppCore, Router = null) {
  const elements = getShellElements(AppCore);
  let routerShell = null;

  try {
    routerShell = getRouterShellSnapshot(AppCore);
  } catch {}

  const canonical = currentCanonical(AppCore, Router);
  const publicPath = currentPublic(AppCore, Router);

  return sanitize({
    version: SHELL_VERSION,
    source: SOURCE,
    canonicalPath: canonical,
    publicPath,
    chromeVisible: readShellVisibility(AppCore),
    authLike: isAuthLikeRoute(AppCore, Router),
    shellBusy: Boolean(AppCore?.state?.shellBusy),
    shellReady: Boolean(AppCore?.state?.shellReady),
    hasView: Boolean(elements.viewContainer),
    hasViewContent: hasContent(elements.viewContainer),
    loaderVisible: Boolean(elements.loader && !elements.loader.hidden && elements.loader.getAttribute?.("aria-hidden") !== "true"),
    elements: {
      appShell: elementSnapshot(elements.appShell),
      mainContent: elementSnapshot(elements.mainContent),
      appContent: elementSnapshot(elements.appContent),
      viewContainer: elementSnapshot(elements.viewContainer),
      sidebarMount: elementSnapshot(elements.sidebarMount),
      topbarMount: elementSnapshot(elements.topbarMount),
      sidebar: elementSnapshot(elements.sidebar),
      topbar: elementSnapshot(elements.topbar),
      tablehead: elementSnapshot(elements.tablehead),
      tableheadContainer: elementSnapshot(elements.tableheadContainer),
      loader: elementSnapshot(elements.loader),
    },
    routerShell,
    policy: {
      adapterOnly: true,
      ownRouter: false,
      ownAuth: false,
      ownHistory: false,
      ownRender: false,
      ownStorage: false,
      ownToast: false,
    },
  });
}

export function refreshShellElements(AppCore) {
  return getShellElements(AppCore);
}

export function resetShellRuntimeState(AppCore) {
  setState(AppCore, {
    shellVisible: true,
    shellHidden: false,
    appShellVisible: true,
    chromeVisible: true,
    chromeHidden: false,
    routeShellHidden: false,
    authScreen: false,
    shellBusy: false,
    shellReady: false,
    routeMode: "app",
  });

  setShellVisibility(AppCore, true, { reason: "reset-shell-runtime" });
  return getShellSnapshot(AppCore);
}

export function exposeShellDebugApi(AppCore = null) {
  const api = {
    version: SHELL_VERSION,
    getElements: () => getShellElements(AppCore),
    getSnapshot: (Router = null) => getShellSnapshot(AppCore, Router),
    refresh: () => refreshShellElements(AppCore),
    reset: () => resetShellRuntimeState(AppCore),
    setVisible: (visible = true, options = {}) => setShellVisibility(AppCore, visible, options),
    updateByRoute: (Router = null, options = {}) => updateShellVisibilityByRoute(AppCore, Router, options),
  };

  try {
    if (isBrowser()) window[DEBUG_KEY] = api;
  } catch {}

  try {
    if (AppCore && typeof AppCore === "object" && Object.isExtensible(AppCore)) {
      Object.defineProperty(AppCore, "Shell", { value: api, configurable: true, enumerable: false, writable: true });
    }
  } catch {}

  return api;
}

export default {
  SHELL_VERSION,

  getShellElements,
  getViewContainer,

  readShellVisibility,
  setShellVisibility,

  isLoginPath,
  isResetPasswordPath,
  isResetPasswordConfirmPath,
  isActivateAccountPath,
  isAuthLikePath,
  isAuthLikeRoute,

  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,

  markShellReady,
  markShellBusy,

  refreshShellElements,
  resetShellRuntimeState,
  exposeShellDebugApi,

  getShellSnapshot,
};

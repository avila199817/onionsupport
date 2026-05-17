/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   APP ERRORS · SIMPLE
   - handlers globales mínimos
   - pantalla fatal de boot segura
   - redacción fuerte de tokens
   - recovery básico: reload / reboot / login
   - sin Auth/Router paralelos, restore, refresh, fetch, storage ni Toast obligatorio
========================================================= */

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  LOGIN_PATH as LOGIN_PATH_FROM_CONSTANTS,
} from "./constants.js";

export const APP_ERRORS_VERSION = "21.0.0-simple";

const SOURCE = "app.errors";
const DEFAULT_SCOPE = APP_SCOPES?.errors || APP_SCOPES?.events || APP_SCOPE || "app:errors";
const LOGIN_PATH = LOGIN_PATH_FROM_CONSTANTS || "/login";

const DEFAULT_MESSAGE = "Se produjo un error inesperado.";
const DEFAULT_BOOT_MESSAGE = "No se pudo iniciar la aplicación correctamente.";
const MAX_RECENT_ERRORS = 20;
const TOAST_THROTTLE_MS = 2500;
const RENDER_THROTTLE_MS = 1000;
const TELEMETRY_THROTTLE_MS = 900;

const EVENTS = Object.freeze({
  bootError: APP_EVENTS?.bootError || "app:boot:error",
  appError: APP_EVENTS?.error || "app:error",
  telemetry: APP_EVENTS?.errorTelemetry || "app:error:telemetry",
  render: "app:boot:error:render",
  runtime: "app:error:runtime",
  resource: "app:error:resource",
  promise: "app:error:promise",
  recover: "app:error:recover",
  handlersBound: "app:errors:handlers:bound",
  handlersUnbound: "app:errors:handlers:unbound",
  debugApi: "app:errors:debug-api",
});

const DOM_IDS = Object.freeze({
  appLoader: "app-loader",
  appShell: "app-shell",
  mainContent: "main-content",
  appContent: "app-content",
  viewContainer: "view-container",
});

const VIEW_CONTAINER_SELECTOR = "#view-container,[data-view-root],[data-router-view],[data-view-container='true'],.view-container";

const TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "resetToken",
  "reset_token",
  "passwordResetToken",
  "password_reset_token",
  "confirmToken",
  "confirm_token",
  "code",
  "t",
  "otp",
  "totp",
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
  "authorization",
  "auth",
  "jwt",
  "session",
  "sid",
]);

const TOKEN_ROUTE_PATHS = Object.freeze([
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
]);

const ROOT_ERROR_CLASSES = Object.freeze(["app-error", "app-fatal"]);
const ROOT_LOADING_CLASSES = Object.freeze(["loading", "app-loading", "app-booting", "is-loading", "is-booting", "app-ready", "is-ready"]);
const LOADER_VISIBLE_CLASSES = Object.freeze(["is-visible", "is-entering", "is-leaving", "loader-visible", "app-loader--visible"]);
const LOADER_HIDDEN_CLASSES = Object.freeze(["is-hidden", "has-hidden", "loader-hidden"]);

const IGNORED_ERROR_PATTERNS = Object.freeze([
  /ResizeObserver loop limit exceeded/i,
  /ResizeObserver loop completed with undelivered notifications/i,
  /^Script error\.?$/i,
]);

let handlersBound = false;
let bindingInFlight = false;
let boundScope = "";
let debugApiInstalled = false;

const boundListeners = [];

const errorState = {
  handling: false,
  rendering: false,
  total: 0,
  recent: [],
  lastToastKey: "",
  lastToastAt: 0,
  lastRenderKey: "",
  lastRenderAt: 0,
  lastTelemetryKey: "",
  lastTelemetryAt: 0,
};

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isObjectLike = (value) => Boolean(value && (typeof value === "object" || typeof value === "function"));
const isFn = (value) => typeof value === "function";

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

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function now() {
  try { return Date.now(); } catch { return 0; }
}

function iso(ms = now()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function canDefine(value) {
  try { return isObjectLike(value) && Object.isExtensible(value); } catch { return false; }
}

function defineHidden(target, key, value) {
  if (!target || !key || !canDefine(target)) return false;

  try {
    Object.defineProperty(target, key, { value, configurable: true, enumerable: false, writable: true });
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
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactTokenInText(value = "") {
  let output = text(value, "");
  if (!output) return "";

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  for (const path of TOKEN_ROUTE_PATHS) {
    try {
      output = output.replace(new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi, "$1$2***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") return false;

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {}

  return Boolean(value.nodeType && value.nodeName);
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  if (/token|secret|password|authorization|credential|jwt|bearer|otp|mfa|2fa|code|session|refresh|access/i.test(keyHint)) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redactTokenInText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return normalizeError(value);

  if (isDomNodeLike(value)) {
    return {
      node: text(value.nodeName, "Node"),
      id: text(value.id, ""),
      className: text(value.className?.baseVal || value.className, ""),
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1));
  if (value instanceof Map) return { type: "Map", size: value.size };
  if (value instanceof Set) return { type: "Set", size: value.size };

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return redactTokenInText(String(value));
}

/* =========================================================
   LOG / EMIT
========================================================= */

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppErrors]", ...args.map((item) => sanitize(item)));
  } catch {
    try { if (AppCore?.config?.debug) console.warn("[AppErrors]", ...args.map((item) => sanitize(item))); } catch {}
  }
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({ version: APP_ERRORS_VERSION, source: SOURCE, at: iso(), ...object(payload) });

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

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function errorCandidate(error = null) {
  if (!error) return null;
  return error.reason || error.error || error;
}

function rawMessage(error = null, fallback = DEFAULT_MESSAGE) {
  const candidate = errorCandidate(error);
  if (!candidate) return fallback;
  if (typeof candidate === "string") return text(candidate, fallback);

  return (
    text(candidate.message, "") ||
    text(candidate.statusText, "") ||
    text(candidate.data?.message, "") ||
    text(candidate.data?.error, "") ||
    text(candidate.response?.data?.message, "") ||
    text(candidate.response?.data?.error, "") ||
    text(candidate.reason?.message, "") ||
    text(candidate.reason, "") ||
    text(candidate.detail, "") ||
    fallback
  );
}

function errorName(error = null) {
  const candidate = errorCandidate(error);
  if (!candidate || typeof candidate === "string") return "Error";
  return text(candidate.name || candidate.constructor?.name, "Error");
}

function errorCode(error = null) {
  const candidate = errorCandidate(error);
  if (!candidate || typeof candidate === "string") return "";

  return text(
    candidate.code || candidate.status || candidate.statusCode || candidate.data?.code || candidate.response?.status || candidate.response?.statusCode || "",
    ""
  );
}

function errorStack(error = null) {
  const candidate = errorCandidate(error);
  if (!candidate || typeof candidate === "string") return "";
  return redactTokenInText(text(candidate.stack, ""));
}

function errorUrl(error = null) {
  const candidate = errorCandidate(error);
  if (!candidate || typeof candidate === "string") return "";

  return redactTokenInText(text(candidate.filename || candidate.url || candidate.href || candidate.target?.src || candidate.target?.href || "", ""));
}

function errorLine(error = null) {
  const candidate = errorCandidate(error);
  if (!candidate || typeof candidate === "string") return 0;
  return number(candidate.lineno || candidate.lineNumber || candidate.line, 0);
}

function errorColumn(error = null) {
  const candidate = errorCandidate(error);
  if (!candidate || typeof candidate === "string") return 0;
  return number(candidate.colno || candidate.columnNumber || candidate.column, 0);
}

function errorKind(error = null, source = "") {
  const message = rawMessage(error, "").toLowerCase();
  const src = text(source, "").toLowerCase();

  if (src.includes("resource")) return "resource";
  if (src.includes("unhandledrejection")) return "promise";
  if (/failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|module script/i.test(message)) return "chunk";
  if (/networkerror|failed to fetch|load failed|network request failed|err_internet_disconnected/i.test(message)) return "network";
  if (/unauthorized|forbidden|\b401\b|\b403\b/i.test(message)) return "auth";
  if (/quotaexceedederror|quota exceeded/i.test(message)) return "storage";

  return "runtime";
}

function friendlyMessage(message = "", fallback = DEFAULT_MESSAGE) {
  const clean = redactTokenInText(text(message, fallback));

  if (/failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|module script/i.test(clean)) {
    return "No se pudo cargar un módulo de la aplicación. Recarga la página para sincronizar los archivos.";
  }

  if (/networkerror|failed to fetch|load failed|network request failed|err_internet_disconnected/i.test(clean)) {
    return "No se pudo completar una operación de red. Comprueba la conexión o vuelve a intentarlo.";
  }

  if (/unauthorized|forbidden|\b401\b|\b403\b/i.test(clean)) {
    return "La sesión no es válida o no tiene permisos suficientes. Inicia sesión de nuevo.";
  }

  if (/quotaexceedederror|quota exceeded/i.test(clean)) {
    return "El navegador no pudo guardar datos locales. Libera espacio o limpia el almacenamiento del sitio.";
  }

  return clean;
}

function normalizeError(error = null, fallback = DEFAULT_MESSAGE) {
  return {
    name: errorName(error),
    message: friendlyMessage(rawMessage(error, fallback), fallback),
    code: errorCode(error) || null,
  };
}

export function resolveErrorMessage(error = null, fallback = DEFAULT_MESSAGE) {
  return friendlyMessage(rawMessage(error, fallback), fallback);
}

export function createErrorSnapshot({ source = "runtime", error = null, severity = "error", boot = false, handled = false } = {}) {
  const atMs = now();
  const fallback = boot ? DEFAULT_BOOT_MESSAGE : DEFAULT_MESSAGE;
  const raw = rawMessage(error, fallback);
  const stack = errorStack(error);

  return sanitize({
    version: APP_ERRORS_VERSION,
    source: text(source, "runtime"),
    kind: errorKind(error, source),
    severity: text(severity, "error"),
    boot: Boolean(boot),
    handled: Boolean(handled),
    name: errorName(error),
    code: errorCode(error) || null,
    message: friendlyMessage(raw, fallback),
    rawMessage: redactTokenInText(raw),
    url: errorUrl(error),
    line: errorLine(error),
    column: errorColumn(error),
    stack,
    hasStack: Boolean(stack),
    at: iso(atMs),
    atMs,
  });
}

function pushRecent(snapshot = {}) {
  errorState.total += 1;
  errorState.recent.unshift({ ...snapshot, index: errorState.total });
  if (errorState.recent.length > MAX_RECENT_ERRORS) errorState.recent.length = MAX_RECENT_ERRORS;
}

function throttleKey(snapshot = {}) {
  return [snapshot.source, snapshot.kind, snapshot.name, snapshot.code, snapshot.message, snapshot.url].map((item) => text(item, "")).join("|");
}

function isThrottled(kind = "toast", snapshot = {}, ms = TOAST_THROTTLE_MS) {
  const key = throttleKey(snapshot);
  const stamp = now();
  const keyName = kind === "render" ? "lastRenderKey" : kind === "telemetry" ? "lastTelemetryKey" : "lastToastKey";
  const atName = kind === "render" ? "lastRenderAt" : kind === "telemetry" ? "lastTelemetryAt" : "lastToastAt";

  if (errorState[keyName] === key && stamp - errorState[atName] < ms) return true;

  errorState[keyName] = key;
  errorState[atName] = stamp;
  return false;
}

/* =========================================================
   APP STATE / OPTIONAL TOAST
========================================================= */

function setCoreError(AppCore, snapshot = null) {
  const patch = {
    hasError: Boolean(snapshot),
    error: snapshot,
    lastError: snapshot,
    lastAppError: snapshot,
    lastBootError: snapshot?.boot === true ? snapshot : AppCore?.state?.lastBootError || null,
  };

  try { AppCore?.setError?.(snapshot); } catch {}

  try {
    AppCore?.setState?.(patch, { source: SOURCE, emit: false, emitState: false, silent: true });
  } catch {
    try { AppCore?.patchState?.(patch, { source: SOURCE, emit: false, silent: true }); } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, patch);
  } catch {}

  return patch;
}

function toastError(Toast, AppCore, message, options = {}) {
  const cleanMessage = redactTokenInText(text(message, DEFAULT_MESSAGE));
  const payload = {
    title: text(options.title, "Error"),
    duration: number(options.duration, 5000),
    ...object(options),
    type: "error",
    message: cleanMessage,
  };

  for (const attempt of [
    () => Toast?.error?.(cleanMessage, payload),
    () => Toast?.errorToast?.(cleanMessage, payload),
    () => Toast?.showToast?.(cleanMessage, "error", payload),
    () => Toast?.show?.(cleanMessage, "error", payload),
    () => Toast?.notify?.(payload),
    () => AppCore?.showToast?.(cleanMessage, "error", payload),
  ]) {
    try {
      const result = attempt();
      if (result !== undefined && result !== null) return result;
    } catch {}
  }

  return null;
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;
  try { return document.getElementById(id); } catch { return null; }
}

function qs(selector = "") {
  if (!isBrowser() || !selector) return null;
  try { return document.querySelector(selector); } catch { return null; }
}

function attr(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined) element.removeAttribute(key);
    else element.setAttribute(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function data(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function addClasses(element, classes = []) {
  if (!element) return false;

  try {
    const clean = Array.isArray(classes) ? classes.filter(Boolean) : [classes].filter(Boolean);
    if (clean.length) element.classList.add(...clean);
    return true;
  } catch {
    return false;
  }
}

function removeClasses(element, classes = []) {
  if (!element) return false;

  try {
    const clean = Array.isArray(classes) ? classes.filter(Boolean) : [classes].filter(Boolean);
    if (clean.length) element.classList.remove(...clean);
    return true;
  } catch {
    return false;
  }
}

function empty(element) {
  if (!element) return false;

  try {
    element.replaceChildren();
    return true;
  } catch {}

  try {
    while (element.firstChild) element.removeChild(element.firstChild);
    return true;
  } catch {
    return false;
  }
}

function createElement(tagName = "div", { id = "", className = "", textContent = "", attrs = {}, dataset = {} } = {}) {
  const element = document.createElement(tagName);

  if (id) element.id = id;
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;

  for (const [key, value] of Object.entries(object(attrs))) attr(element, key, value);
  for (const [key, value] of Object.entries(object(dataset))) data(element, key, value);

  return element;
}

function append(parent, children = []) {
  if (!parent) return parent;

  for (const child of Array.isArray(children) ? children : [children]) {
    try { if (child) parent.appendChild(child); } catch {}
  }

  return parent;
}

/* =========================================================
   RECOVERY
========================================================= */

function reloadPage() {
  if (!isBrowser()) return false;

  try {
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

function safeRedirect(path = LOGIN_PATH) {
  if (!isBrowser()) return false;

  const target = text(path, LOGIN_PATH);
  if (!target.startsWith("/") || target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return safeRedirect(LOGIN_PATH);

  try {
    window.location.assign(target);
    return true;
  } catch {
    try {
      window.location.href = target;
      return true;
    } catch {}
  }

  return false;
}

function rebootApp(AppCore) {
  if (!isBrowser()) return false;

  try {
    const app = window.__ONION_APP__ || AppCore?.App || AppCore?.app || null;
    if (isFn(app?.reboot)) {
      void Promise.resolve(app.reboot({ reason: "boot-error-recovery", force: true }));
      return true;
    }
  } catch {}

  return false;
}

export function clearAuthSession(Auth = null, AppCore = null) {
  let cleared = false;

  for (const attempt of [
    () => Auth?.clearSessionLocal?.({ silent: true, reason: "boot-error-recovery" }),
    () => Auth?.clear?.({ silent: true, reason: "boot-error-recovery" }),
    () => Auth?.logout?.({ silent: true, localOnly: true, reason: "boot-error-recovery" }),
    () => AppCore?.clearSession?.({ silent: true, reason: "boot-error-recovery" }),
  ]) {
    try {
      const result = attempt();
      if (result !== false && result !== undefined) cleared = true;
    } catch {}
  }

  const patch = {
    authenticated: false,
    hasToken: false,
    user: null,
    currentUser: null,
    sessionUser: null,
    authUser: null,
    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,
    tempToken: null,
    temp_token: null,
    role: null,
    rol: null,
    userRole: null,
    roles: [],
    username: null,
    currentResolvedUsername: null,
    resolvedUsername: null,
  };

  try {
    AppCore?.setState?.(patch, { source: `${SOURCE}:clear-session`, forceUnauthenticated: true, emit: false, silent: true });
    cleared = true;
  } catch {
    try {
      AppCore?.patchState?.(patch, { source: `${SOURCE}:clear-session`, forceUnauthenticated: true, emit: false, silent: true });
      cleared = true;
    } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
      cleared = true;
    }
  } catch {}

  return cleared;
}

/* =========================================================
   FATAL DOM / BOOT VIEW
========================================================= */

function hideLoader(hideLoaderFn, AppCore, reason = "boot-error") {
  for (const attempt of [
    () => hideLoaderFn?.(AppCore, { reason, minVisibleMs: 0, fatal: true, force: true, forceHide: true, allowDuringBoot: true }),
    () => hideLoaderFn?.(AppCore),
    () => hideLoaderFn?.({ reason, force: true }),
    () => hideLoaderFn?.(),
  ]) {
    try {
      const result = attempt();
      if (result !== undefined && result !== false) return true;
    } catch {}
  }

  const loader = byId(DOM_IDS.appLoader) || qs("[data-app-loader='true'],[data-app-loader],.app-loader");
  if (!loader) return false;

  try {
    loader.hidden = true;
    attr(loader, "aria-hidden", "true");
    attr(loader, "aria-busy", "false");
    data(loader, "loaderVisible", "false");
    data(loader, "loaderState", "hidden");
    removeClasses(loader, LOADER_VISIBLE_CLASSES);
    addClasses(loader, LOADER_HIDDEN_CLASSES);
    return true;
  } catch {
    return false;
  }
}

function setShellVisibility(setShellVisibilityFn, AppCore, visible = false) {
  for (const attempt of [
    () => setShellVisibilityFn?.(AppCore, visible, { reason: "boot-error", authLike: true, hideAppShell: false, force: true }),
    () => setShellVisibilityFn?.(AppCore, visible),
    () => setShellVisibilityFn?.(visible),
  ]) {
    try {
      const result = attempt();
      if (result !== undefined && result !== false) return true;
    } catch {}
  }

  return false;
}

function setTitle(AppCore, title = "Error de inicio") {
  try {
    AppCore?.setDocumentTitle?.(title);
    return true;
  } catch {}

  if (!isBrowser()) return false;

  try {
    document.title = title;
    return true;
  } catch {
    return false;
  }
}

function markFatalDom(AppCore, snapshot = {}) {
  if (!isBrowser()) return false;

  for (const root of [document.documentElement, document.body]) {
    if (!root) continue;

    addClasses(root, ROOT_ERROR_CLASSES);
    removeClasses(root, ROOT_LOADING_CLASSES);
    data(root, "appLoading", "false");
    data(root, "appReady", "false");
    data(root, "appBooting", "false");
    data(root, "appState", "fatal");
    data(root, "shellState", "fatal");
    data(root, "routeMode", "fatal");
    data(root, "chrome", "hidden");
    data(root, "shell", "visible");
    data(root, "bootError", "true");
  }

  for (const element of [byId(DOM_IDS.appShell), byId(DOM_IDS.mainContent), byId(DOM_IDS.appContent), byId(DOM_IDS.viewContainer)]) {
    if (!element) continue;

    try { element.hidden = false; } catch {}
    attr(element, "aria-hidden", "false");
    attr(element, "aria-busy", "false");
    data(element, "shellState", "fatal");
    data(element, "viewState", "boot-error");
  }

  const patch = {
    loading: false,
    booting: false,
    loaderVisible: false,
    ready: false,
    appReady: false,
    booted: false,
    appFatal: true,
    fatal: true,
    fatalAt: snapshot.at || iso(),
    bootPhase: "fatal",
    lastBootError: snapshot,
  };

  try {
    AppCore?.setState?.(patch, { source: `${SOURCE}:fatal-dom`, emit: false, silent: true });
  } catch {
    try { AppCore?.patchState?.(patch, { source: `${SOURCE}:fatal-dom`, emit: false, silent: true }); } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, patch);
  } catch {}

  return true;
}

function fallbackViewContainer() {
  if (!isBrowser()) return null;
  return qs(VIEW_CONTAINER_SELECTOR);
}

function createFallbackViewContainer(AppCore = null) {
  if (!isBrowser()) return null;

  let shell = byId(DOM_IDS.appShell);
  if (!shell) {
    shell = createElement("div", { id: DOM_IDS.appShell, className: "app-shell", dataset: { appShell: "true", shell: "fatal" } });
    (document.body || document.documentElement).appendChild(shell);
  }

  let main = byId(DOM_IDS.mainContent);
  if (!main) {
    main = createElement("main", { id: DOM_IDS.mainContent, className: "main-content", attrs: { role: "main" }, dataset: { mainContent: "true" } });
    shell.appendChild(main);
  }

  let view = byId(DOM_IDS.viewContainer);
  if (!view) {
    view = createElement("div", { id: DOM_IDS.viewContainer, className: "view-container", dataset: { viewContainer: "true", routerView: "true", viewRoot: "true" } });
    main.appendChild(view);
  }

  try {
    AppCore.dom = AppCore.dom || {};
    AppCore.dom.appShell = shell;
    AppCore.dom.mainContent = main;
    AppCore.dom.viewContainer = view;
  } catch {}

  return view;
}

function resolveViewContainer(AppCore, getViewContainer) {
  for (const attempt of [
    () => getViewContainer?.(AppCore),
    () => getViewContainer?.(),
    () => AppCore?.dom?.viewContainer,
    () => fallbackViewContainer(),
    () => createFallbackViewContainer(AppCore),
  ]) {
    try {
      const result = attempt();
      if (result) return result;
    } catch {}
  }

  return null;
}

function metaRow(label = "", value = "") {
  const row = createElement("div", { className: "boot-error-card__meta-row" });
  append(row, [createElement("strong", { textContent: label }), createElement("span", { textContent: value || "—" })]);
  return row;
}

function actionButton(action, label, className = "ui-btn ui-btn-secondary") {
  return createElement("button", {
    className,
    textContent: label,
    attrs: { type: "button" },
    dataset: { bootErrorAction: action },
  });
}

function buildBootErrorNode(snapshot = {}) {
  const section = createElement("section", {
    className: "content-wrapper boot-error-view",
    attrs: { "aria-labelledby": "boot-error-title" },
    dataset: { view: "boot-error", bootErrorView: "true" },
  });

  const card = createElement("div", { className: "panel-block boot-error-card", dataset: { bootErrorCard: "true" } });
  const inner = createElement("div", { className: "boot-error-card__inner" });
  const icon = createElement("div", { className: "boot-error-card__icon", textContent: "!", attrs: { "aria-hidden": "true" } });
  const header = createElement("div", { className: "boot-error-card__header" });

  append(header, [
    createElement("p", { className: "boot-error-card__eyebrow", textContent: "Boot failure" }),
    createElement("h2", { id: "boot-error-title", className: "boot-error-card__title", textContent: "Error al iniciar la aplicación" }),
    createElement("p", { className: "boot-error-card__message", textContent: snapshot.message || DEFAULT_BOOT_MESSAGE }),
  ]);

  const meta = createElement("div", { className: "boot-error-card__meta", dataset: { bootErrorMeta: "true" } });
  append(meta, [
    metaRow("Código:", snapshot.code || snapshot.name || "BOOT_ERROR"),
    metaRow("Tipo:", snapshot.kind || "runtime"),
    metaRow("Fecha:", snapshot.at || iso()),
  ]);

  const technicalText = [
    snapshot.rawMessage ? `Mensaje: ${snapshot.rawMessage}` : "",
    snapshot.kind ? `Tipo: ${snapshot.kind}` : "",
    snapshot.url ? `URL: ${snapshot.url}` : "",
    snapshot.line ? `Línea: ${snapshot.line}` : "",
    snapshot.column ? `Columna: ${snapshot.column}` : "",
    snapshot.stack ? `Stack:\n${snapshot.stack}` : "",
  ].filter(Boolean).join("\n");

  if (technicalText) {
    const details = createElement("details", { className: "boot-error-card__details" });
    append(details, [
      createElement("summary", { textContent: "Detalle técnico" }),
      createElement("pre", { className: "boot-error-card__pre", textContent: technicalText }),
    ]);
    meta.appendChild(details);
  }

  const retryButton = actionButton("retry", "Reintentar", "ui-btn ui-btn-primary");
  const rebootButton = actionButton("reboot", "Reiniciar app");
  const loginButton = actionButton("login", "Ir al login");
  const actions = createElement("div", { className: "boot-error-card__actions" });

  append(actions, [retryButton, rebootButton, loginButton]);
  append(inner, [icon, header, meta, actions]);
  card.appendChild(inner);
  section.appendChild(card);

  return { root: section, retryButton, rebootButton, loginButton };
}

function bindBootErrorActions({ AppCore, snapshot, retryButton, rebootButton, loginButton } = {}) {
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      emit(AppCore, EVENTS.recover, { action: "retry", error: snapshot });
      reloadPage();
    }, { once: true });
  }

  if (rebootButton) {
    rebootButton.addEventListener("click", () => {
      emit(AppCore, EVENTS.recover, { action: "reboot", error: snapshot });
      if (!rebootApp(AppCore)) reloadPage();
    }, { once: true });
  }

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      emit(AppCore, EVENTS.recover, { action: "login", error: snapshot });
      safeRedirect(LOGIN_PATH);
    }, { once: true });
  }
}

/* =========================================================
   RENDER BOOT ERROR
========================================================= */

export function renderBootError({ AppCore, Auth, Toast, error, getViewContainer, setShellVisibility: setShellVisibilityFn, hideLoader: hideLoaderFn } = {}) {
  void Auth;

  const snapshot = createErrorSnapshot({ source: "boot", error, severity: "critical", boot: true, handled: true });

  pushRecent(snapshot);
  setCoreError(AppCore, snapshot);
  exposeDebugApi(AppCore);

  emit(AppCore, EVENTS.bootError, snapshot, { force: true });
  emit(AppCore, EVENTS.render, snapshot, { force: true });

  hideLoader(hideLoaderFn, AppCore, "boot-error");
  setShellVisibility(setShellVisibilityFn, AppCore, false);
  markFatalDom(AppCore, snapshot);
  setTitle(AppCore, "Error de inicio");

  const container = resolveViewContainer(AppCore, getViewContainer);

  if (!container) {
    warn(AppCore, "renderBootError(): contenedor no disponible.", snapshot);

    if (!isThrottled("toast", snapshot, TOAST_THROTTLE_MS)) {
      toastError(Toast, AppCore, snapshot.message, { title: "Error de arranque", duration: 6000 });
    }

    return false;
  }

  if (isThrottled("render", snapshot, RENDER_THROTTLE_MS) || errorState.rendering) return true;

  errorState.rendering = true;

  try {
    empty(container);

    const view = buildBootErrorNode(snapshot);
    container.appendChild(view.root);

    attr(container, "aria-busy", "false");
    attr(container, "aria-hidden", "false");
    data(container, "viewState", "boot-error");

    bindBootErrorActions({ AppCore, snapshot, ...view });

    try { view.retryButton?.focus?.(); } catch {}

    if (!isThrottled("toast", snapshot, TOAST_THROTTLE_MS)) {
      toastError(Toast, AppCore, snapshot.message, { title: "Error de arranque", duration: 6000 });
    }

    return true;
  } catch (renderError) {
    warn(AppCore, "No se pudo pintar la pantalla de error de boot.", renderError);
    return false;
  } finally {
    errorState.rendering = false;
  }
}

/* =========================================================
   RUNTIME ERRORS
========================================================= */

function isResourceErrorEvent(event = null) {
  return Boolean(event?.target && event.target !== window && (event.target.src || event.target.href));
}

function normalizeResourceError(event = null) {
  const target = event?.target || {};
  const tagName = text(target.tagName, "resource").toLowerCase();
  const url = redactTokenInText(text(target.src || target.href, ""));

  return {
    name: "ResourceLoadError",
    message: `No se pudo cargar el recurso ${tagName}${url ? `: ${url}` : "."}`,
    url,
    targetTag: tagName,
  };
}

function isIgnoredError(error = null) {
  const message = rawMessage(error, "");
  return Boolean(message && IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message)));
}

function emitTelemetry(AppCore, snapshot = {}) {
  if (isThrottled("telemetry", snapshot, TELEMETRY_THROTTLE_MS)) return false;
  return emit(AppCore, EVENTS.telemetry, { ...snapshot, recentCount: errorState.recent.length, total: errorState.total });
}

function processRuntimeError({ AppCore, Toast, source = "runtime", error = null, severity = "error", toast = true } = {}) {
  if (errorState.handling || isIgnoredError(error)) return null;

  errorState.handling = true;

  try {
    const snapshot = createErrorSnapshot({ source, error, severity, boot: false, handled: true });

    pushRecent(snapshot);
    setCoreError(AppCore, snapshot);

    emit(AppCore, EVENTS.appError, snapshot);
    emit(AppCore, EVENTS.runtime, snapshot);
    if (snapshot.kind === "resource") emit(AppCore, EVENTS.resource, snapshot);
    if (snapshot.kind === "promise") emit(AppCore, EVENTS.promise, snapshot);
    emitTelemetry(AppCore, snapshot);

    if (toast && !isThrottled("toast", snapshot, TOAST_THROTTLE_MS)) {
      toastError(Toast, AppCore, snapshot.message, { title: severity === "warning" ? "Aviso" : "Error", duration: 5000 });
    }

    return snapshot;
  } finally {
    errorState.handling = false;
  }
}

export function reportAppError({ AppCore, Toast, source = "runtime", error = null, severity = "error", toast = true } = {}) {
  return processRuntimeError({ AppCore, Toast, source, error, severity, toast });
}

/* =========================================================
   GLOBAL HANDLERS
========================================================= */

function addWindowListener(target, eventName, handler, options) {
  try {
    target.addEventListener(eventName, handler, options);
    boundListeners.push({ target, eventName, handler, options });
    return true;
  } catch {
    return false;
  }
}

export function bindGlobalErrorHandlers({ AppCore, Toast, scope = DEFAULT_SCOPE } = {}) {
  if (handlersBound || bindingInFlight) return () => unbindGlobalErrorHandlers(AppCore);
  if (!isBrowser()) return false;

  bindingInFlight = true;

  const onError = (event) => {
    if (isResourceErrorEvent(event)) {
      const resourceError = normalizeResourceError(event);
      const tagName = text(event?.target?.tagName, "");

      processRuntimeError({
        AppCore,
        Toast,
        source: "window.resource-error",
        error: resourceError,
        severity: "warning",
        toast: /script|link/i.test(tagName),
      });
      return;
    }

    processRuntimeError({
      AppCore,
      Toast,
      source: "window.error",
      error: event?.error || {
        name: "WindowError",
        message: event?.message || "Error global no controlado",
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      },
      severity: "error",
      toast: true,
    });
  };

  const onReject = (event) => {
    processRuntimeError({
      AppCore,
      Toast,
      source: "unhandledrejection",
      error: event?.reason || { name: "UnhandledRejection", message: "Promise rechazada sin control" },
      severity: "error",
      toast: true,
    });
  };

  try {
    const okError = addWindowListener(window, "error", onError, true);
    const okReject = addWindowListener(window, "unhandledrejection", onReject, false);

    handlersBound = Boolean(okError || okReject);
    boundScope = handlersBound ? text(scope, DEFAULT_SCOPE) : "";

    if (!handlersBound) return false;

    exposeDebugApi(AppCore);
    emit(AppCore, EVENTS.handlersBound, { scope: boundScope });

    return () => unbindGlobalErrorHandlers(AppCore);
  } finally {
    bindingInFlight = false;
  }
}

export function unbindGlobalErrorHandlers(AppCore = null) {
  while (boundListeners.length) {
    const item = boundListeners.pop();
    try { item.target?.removeEventListener?.(item.eventName, item.handler, item.options); } catch {}
  }

  handlersBound = false;
  bindingInFlight = false;
  boundScope = "";

  emit(AppCore, EVENTS.handlersUnbound);
  return true;
}

/* =========================================================
   DEBUG / SNAPSHOT
========================================================= */

export function exposeDebugApi(AppCore = null) {
  if (!isBrowser()) return false;

  const api = {
    version: APP_ERRORS_VERSION,
    getSnapshot: getErrorStateSnapshot,
    reset: resetErrorState,
    resolveMessage: resolveErrorMessage,
    createSnapshot: createErrorSnapshot,
    report: (error, options = {}) => reportAppError({ AppCore, error, ...object(options) }),
    renderBootError: (error, options = {}) => renderBootError({ AppCore, error, ...object(options) }),
    clearAuthSession: (Auth = null) => clearAuthSession(Auth, AppCore),
    bind: (options = {}) => bindGlobalErrorHandlers({ AppCore, ...object(options) }),
    unbind: () => unbindGlobalErrorHandlers(AppCore),
  };

  try { window.__ONION_APP_ERRORS__ = api; } catch {}
  try { defineHidden(AppCore, "Errors", api); } catch {}

  if (!debugApiInstalled) {
    debugApiInstalled = true;
    emit(AppCore, EVENTS.debugApi, { installed: true });
  }

  return true;
}

export function getErrorStateSnapshot() {
  return sanitize({
    version: APP_ERRORS_VERSION,
    handlersBound,
    bindingInFlight,
    boundScope,
    boundListeners: boundListeners.length,
    handling: errorState.handling,
    rendering: errorState.rendering,
    total: errorState.total,
    lastToastKey: redactTokenInText(errorState.lastToastKey),
    lastToastAt: errorState.lastToastAt,
    lastToastAtIso: errorState.lastToastAt ? iso(errorState.lastToastAt) : "",
    lastRenderKey: redactTokenInText(errorState.lastRenderKey),
    lastRenderAt: errorState.lastRenderAt,
    lastRenderAtIso: errorState.lastRenderAt ? iso(errorState.lastRenderAt) : "",
    lastTelemetryKey: redactTokenInText(errorState.lastTelemetryKey),
    lastTelemetryAt: errorState.lastTelemetryAt,
    lastTelemetryAtIso: errorState.lastTelemetryAt ? iso(errorState.lastTelemetryAt) : "",
    recent: errorState.recent.map((item) => ({
      index: item.index,
      source: item.source,
      kind: item.kind,
      severity: item.severity,
      boot: Boolean(item.boot),
      handled: Boolean(item.handled),
      name: item.name,
      code: item.code,
      message: item.message,
      url: item.url,
      line: item.line,
      column: item.column,
      hasStack: Boolean(item.hasStack),
      at: item.at,
    })),
    debugApiInstalled,
    policy: {
      errorsOnly: true,
      ownAuth: false,
      ownRouter: false,
      ownNavigation: false,
      ownRestore: false,
      ownRefresh: false,
      ownFetch: false,
      ownStorage: false,
      ownToast: false,
    },
  });
}

export function resetErrorState() {
  errorState.handling = false;
  errorState.rendering = false;
  errorState.total = 0;
  errorState.recent = [];
  errorState.lastToastKey = "";
  errorState.lastToastAt = 0;
  errorState.lastRenderKey = "";
  errorState.lastRenderAt = 0;
  errorState.lastTelemetryKey = "";
  errorState.lastTelemetryAt = 0;

  return getErrorStateSnapshot();
}

export default {
  APP_ERRORS_VERSION,

  renderBootError,

  bindGlobalErrorHandlers,
  unbindGlobalErrorHandlers,

  reportAppError,
  resolveErrorMessage,
  createErrorSnapshot,

  clearAuthSession,

  getErrorStateSnapshot,
  resetErrorState,

  exposeDebugApi,

  redactTokenInText,
};

/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   App errors simple:
   - pantalla segura de boot error
   - window.error / unhandledrejection
   - resource load errors
   - telemetry interna
   - recuperación básica
   - redacción fuerte
   - sin innerHTML / sin inline handlers / sin CSS inline
========================================================= */

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  LOGIN_PATH as LOGIN_PATH_FROM_CONSTANTS,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const APP_ERRORS_VERSION = "18.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE = "app:errors";

const DEFAULT_SCOPE =
  APP_SCOPES?.errors ||
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:errors";

const LOGIN_PATH = LOGIN_PATH_FROM_CONSTANTS || "/login";

const MAX_RECENT_ERRORS = 24;
const TOAST_THROTTLE_MS = 2500;
const RENDER_THROTTLE_MS = 1200;
const TELEMETRY_THROTTLE_MS = 900;

const DEFAULT_MESSAGE = "Se produjo un error inesperado.";
const DEFAULT_BOOT_MESSAGE = "No se pudo iniciar la aplicación correctamente.";

const ERROR_EVENTS = Object.freeze({
  bootError: APP_EVENTS?.bootError || "app:boot:error",
  appError: APP_EVENTS?.error || "app:error",
  telemetry: APP_EVENTS?.errorTelemetry || "app:error:telemetry",

  recover: "app:error:recover",
  render: "app:boot:error:render",
  runtime: "app:error:runtime",
  resource: "app:error:resource",
  promise: "app:error:promise",

  handlersBound: "app:errors:handlers:bound",
  handlersUnbound: "app:errors:handlers:unbound",
  debugApi: "app:errors:debug-api",
});

const ERROR_ACTIONS = Object.freeze({
  retry: "retry",
  reboot: "reboot",
  resetSession: "reset-session",
  goLogin: "go-login",
});

const DOM_IDS = Object.freeze({
  appLoader: "app-loader",
  appShell: "app-shell",
  mainContent: "main-content",
  appContent: "app-content",
  viewContainer: "view-container",
});

const VIEW_CONTAINER_SELECTOR =
  "#view-container,[data-view-root],[data-router-view],[data-view-container='true'],.view-container";

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

const AUTH_STORAGE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "authToken",
  "auth_token",
  "jwt",
  "bearer",

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

  "session",
  "sessionData",
  "authSession",
  "auth_session",
  "sessionId",
  "session_id",
  "sessionUserId",
  "session_user_id",

  "user",
  "currentUser",
  "authUser",
  "sessionUser",
  "usuario",
  "me",
  "account",
  "profile",
  "auth",

  "onion_token",
  "onion_access_token",
  "onion_refresh_token",
  "onion_session",
  "onion_user",
  "onion_auth",
]);

const ROOT_ERROR_CLASSES = Object.freeze([
  "app-error",
  "app-fatal",
]);

const ROOT_LOADING_CLASSES = Object.freeze([
  "loading",
  "app-loading",
  "app-booting",
  "is-loading",
  "is-booting",
  "app-ready",
  "is-ready",
]);

const LOADER_VISIBLE_CLASSES = Object.freeze([
  "is-visible",
  "is-entering",
  "is-leaving",
  "loader-visible",
  "app-loader--visible",
]);

const LOADER_HIDDEN_CLASSES = Object.freeze([
  "is-hidden",
  "has-hidden",
  "loader-hidden",
]);

const IGNORED_ERROR_PATTERNS = Object.freeze([
  /ResizeObserver loop limit exceeded/i,
  /ResizeObserver loop completed with undelivered notifications/i,
  /Script error\.?$/i,
]);

/* =========================================================
   MODULE STATE
========================================================= */

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

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function canDefine(value) {
  try {
    return isObjectLike(value) && Object.isExtensible(value);
  } catch {
    return false;
  }
}

function defineHidden(target, key, value) {
  if (!target || !key || !canDefine(target)) return false;

  try {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const path of TOKEN_ROUTE_PATHS) {
    try {
      output = output.replace(
        new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
        "$1***"
      );
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

  try {
    return Boolean(value.nodeType && value.nodeName);
  } catch {}

  return false;
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6) return "[MaxDepth]";

  if (typeof value === "string") return redactTokenInText(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactTokenInText(value.message || ""),
      stack: value.stack ? "[stack]" : "",
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (isDomNodeLike(value)) {
    return {
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(value.className?.baseVal || value.className, ""),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, seen));
  }

  if (value instanceof Map) {
    return { type: "Map", size: value.size };
  }

  if (value instanceof Set) {
    return { type: "Set", size: value.size };
  }

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|otp|mfa|2fa|code|session|refresh|access/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitize(item, depth + 1, seen);
    }

    return output;
  }

  return redactTokenInText(String(value));
}

/* =========================================================
   LOG / EMIT
========================================================= */

function log(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[AppErrors]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[AppErrors]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.warn("[AppErrors]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function errorLog(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.("[AppErrors]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.error("[AppErrors]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function createCustomEvent(name, detail = {}) {
  if (!isBrowser()) return null;

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(name, { detail });
    }
  } catch {}

  try {
    const event = document.createEvent("CustomEvent");
    event.initCustomEvent(name, false, false, detail);
    return event;
  } catch {
    return null;
  }
}

function emitWindow(name, payload = {}) {
  if (!isBrowser() || !name) return false;

  try {
    const event = createCustomEvent(name, sanitize(payload));
    if (!event) return false;

    window.dispatchEvent(event);
    return true;
  } catch {}

  return false;
}

function emit(AppCore, name, payload = {}, options = {}) {
  const eventName = safeText(name, "");
  if (!eventName) return false;

  const detail = sanitize({
    version: APP_ERRORS_VERSION,
    source: SOURCE,
    ...safeObject(payload),
  });

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(eventName, detail);
      busEmitted = true;
    }
  } catch {}

  if (options.window === true || (!busAvailable && isBrowser())) {
    return emitWindow(eventName, detail) || busEmitted;
  }

  return busEmitted;
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function errorCandidate(error = null) {
  if (!error) return null;
  return error.reason || error.error || error;
}

function getErrorName(error = null) {
  const candidate = errorCandidate(error);

  if (!candidate) return "Error";
  if (typeof candidate === "string") return "Error";

  return safeText(candidate.name || candidate.constructor?.name, "Error");
}

function getErrorCode(error = null) {
  const candidate = errorCandidate(error);

  if (!candidate || typeof candidate === "string") return "";

  return safeText(
    candidate.code ||
      candidate.status ||
      candidate.statusCode ||
      candidate.data?.code ||
      candidate.data?.status ||
      candidate.response?.status ||
      candidate.response?.statusCode ||
      "",
    ""
  );
}

function getRawMessage(error = null, fallback = DEFAULT_MESSAGE) {
  const candidate = errorCandidate(error);

  if (!candidate) return fallback;
  if (typeof candidate === "string") return safeText(candidate, fallback);

  return (
    safeText(candidate.message, "") ||
    safeText(candidate.statusText, "") ||
    safeText(candidate.data?.message, "") ||
    safeText(candidate.data?.error, "") ||
    safeText(candidate.response?.data?.message, "") ||
    safeText(candidate.response?.data?.error, "") ||
    safeText(candidate.reason?.message, "") ||
    safeText(candidate.reason, "") ||
    safeText(candidate.detail, "") ||
    fallback
  );
}

function getErrorStack(error = null) {
  const candidate = errorCandidate(error);

  if (!candidate || typeof candidate === "string") return "";
  return redactTokenInText(safeText(candidate.stack, ""));
}

function getErrorUrl(error = null) {
  const candidate = errorCandidate(error);

  if (!candidate || typeof candidate === "string") return "";

  return redactTokenInText(
    safeText(
      candidate.filename ||
        candidate.url ||
        candidate.href ||
        candidate.target?.src ||
        candidate.target?.href ||
        "",
      ""
    )
  );
}

function getErrorLine(error = null) {
  const candidate = errorCandidate(error);

  if (!candidate || typeof candidate === "string") return 0;
  return safeNumber(candidate.lineno || candidate.lineNumber || candidate.line, 0);
}

function getErrorColumn(error = null) {
  const candidate = errorCandidate(error);

  if (!candidate || typeof candidate === "string") return 0;
  return safeNumber(candidate.colno || candidate.columnNumber || candidate.column, 0);
}

function getErrorKind(error = null, source = "") {
  const message = getRawMessage(error, "").toLowerCase();
  const src = safeText(source, "").toLowerCase();

  if (src.includes("resource")) return "resource";
  if (src.includes("unhandledrejection")) return "promise";

  if (
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk/i.test(message) ||
    /chunkloaderror/i.test(message) ||
    /module script/i.test(message)
  ) {
    return "chunk";
  }

  if (
    /networkerror/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /load failed/i.test(message) ||
    /network request failed/i.test(message) ||
    /err_internet_disconnected/i.test(message)
  ) {
    return "network";
  }

  if (
    /unauthorized/i.test(message) ||
    /forbidden/i.test(message) ||
    /\b401\b/.test(message) ||
    /\b403\b/.test(message)
  ) {
    return "auth";
  }

  if (/quotaexceedederror/i.test(message) || /quota exceeded/i.test(message)) {
    return "storage";
  }

  return "runtime";
}

function friendlyMessage(rawMessage = "", fallback = DEFAULT_MESSAGE) {
  const message = redactTokenInText(safeText(rawMessage, fallback));

  if (
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk/i.test(message) ||
    /chunkloaderror/i.test(message) ||
    /module script/i.test(message)
  ) {
    return "No se pudo cargar un módulo de la aplicación. Recarga la página para sincronizar los archivos.";
  }

  if (
    /networkerror/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /load failed/i.test(message) ||
    /network request failed/i.test(message) ||
    /err_internet_disconnected/i.test(message)
  ) {
    return "No se pudo completar una operación de red. Comprueba la conexión o vuelve a intentarlo.";
  }

  if (
    /unauthorized/i.test(message) ||
    /forbidden/i.test(message) ||
    /\b401\b/.test(message) ||
    /\b403\b/.test(message)
  ) {
    return "La sesión no es válida o no tiene permisos suficientes. Inicia sesión de nuevo.";
  }

  if (/quotaexceedederror/i.test(message) || /quota exceeded/i.test(message)) {
    return "El navegador no pudo guardar datos locales. Libera espacio o limpia el almacenamiento del sitio.";
  }

  return message;
}

export function resolveErrorMessage(error = null, fallback = DEFAULT_MESSAGE) {
  return friendlyMessage(getRawMessage(error, fallback), fallback);
}

export function createErrorSnapshot({
  source = "runtime",
  error = null,
  severity = "error",
  boot = false,
  handled = false,
} = {}) {
  const atMs = now();
  const fallback = boot ? DEFAULT_BOOT_MESSAGE : DEFAULT_MESSAGE;
  const rawMessage = getRawMessage(error, fallback);
  const message = friendlyMessage(rawMessage, fallback);
  const stack = getErrorStack(error);

  return sanitize({
    version: APP_ERRORS_VERSION,

    source: safeText(source, "runtime"),
    kind: getErrorKind(error, source),
    severity: safeText(severity, "error"),

    boot: Boolean(boot),
    handled: Boolean(handled),

    name: getErrorName(error),
    code: getErrorCode(error),

    message,
    rawMessage,

    url: getErrorUrl(error),
    line: getErrorLine(error),
    column: getErrorColumn(error),

    stack,
    hasStack: Boolean(stack),

    at: iso(atMs),
    atMs,
  });
}

function pushRecent(snapshot = {}) {
  errorState.total += 1;

  errorState.recent.unshift({
    ...snapshot,
    index: errorState.total,
  });

  if (errorState.recent.length > MAX_RECENT_ERRORS) {
    errorState.recent = errorState.recent.slice(0, MAX_RECENT_ERRORS);
  }
}

function throttleKey(snapshot = {}) {
  return [
    snapshot.source,
    snapshot.kind,
    snapshot.name,
    snapshot.code,
    snapshot.message,
    snapshot.url,
  ]
    .map((item) => safeText(item, ""))
    .join("|");
}

function isThrottled(kind = "toast", snapshot = {}, ms = TOAST_THROTTLE_MS) {
  const key = throttleKey(snapshot);
  const stamp = now();

  const keyName = kind === "render"
    ? "lastRenderKey"
    : kind === "telemetry"
      ? "lastTelemetryKey"
      : "lastToastKey";

  const atName = kind === "render"
    ? "lastRenderAt"
    : kind === "telemetry"
      ? "lastTelemetryAt"
      : "lastToastAt";

  if (errorState[keyName] === key && stamp - errorState[atName] < ms) {
    return true;
  }

  errorState[keyName] = key;
  errorState[atName] = stamp;

  return false;
}

/* =========================================================
   APP CORE STATE / TOAST
========================================================= */

function setCoreError(AppCore, snapshot = null) {
  const patch = {
    hasError: Boolean(snapshot),
    error: snapshot,
    lastError: snapshot,
    lastAppError: snapshot,
    lastBootError: snapshot?.boot === true
      ? snapshot
      : AppCore?.state?.lastBootError || null,
  };

  try {
    AppCore?.setError?.(snapshot);
  } catch {}

  try {
    AppCore?.setState?.(patch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
    });
  } catch {
    try {
      AppCore?.patchState?.(patch, {
        source: SOURCE,
        emit: false,
        emitState: false,
        silent: true,
      });
    } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
    }
  } catch {}

  return patch;
}

function toastError(Toast, AppCore, message, options = {}) {
  const cleanMessage = redactTokenInText(safeText(message, DEFAULT_MESSAGE));

  const payload = {
    title: safeText(options.title, "Error"),
    duration: Number.isFinite(Number(options.duration)) ? Number(options.duration) : 5000,
    ...safeObject(options),
    type: "error",
    message: cleanMessage,
  };

  const attempts = [
    () => Toast?.error?.(cleanMessage, payload),
    () => Toast?.errorToast?.(cleanMessage, payload),
    () => Toast?.showToast?.(cleanMessage, "error", payload),
    () => Toast?.show?.(cleanMessage, "error", payload),
    () => Toast?.notify?.(payload),
    () => AppCore?.showToast?.(cleanMessage, "error", payload),
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result !== undefined && result !== null) return result;
    } catch {}
  }

  return null;
}

/* =========================================================
   DOM HELPERS
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

function setAttribute(el, key, value) {
  if (!el || !key) return false;

  try {
    if (value === null || value === undefined) el.removeAttribute(key);
    else el.setAttribute(key, String(value));

    return true;
  } catch {
    return false;
  }
}

function setDataset(el, key, value) {
  if (!el || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete el.dataset[key];
    else el.dataset[key] = String(value);

    return true;
  } catch {
    return false;
  }
}

function addClasses(el, classes = []) {
  if (!el) return false;

  try {
    const clean = safeArray(classes).filter(Boolean);
    if (clean.length) el.classList.add(...clean);
    return true;
  } catch {
    return false;
  }
}

function removeClasses(el, classes = []) {
  if (!el) return false;

  try {
    const clean = safeArray(classes).filter(Boolean);
    if (clean.length) el.classList.remove(...clean);
    return true;
  } catch {
    return false;
  }
}

function empty(el) {
  if (!el) return false;

  try {
    el.replaceChildren();
    return true;
  } catch {}

  try {
    while (el.firstChild) el.removeChild(el.firstChild);
    return true;
  } catch {
    return false;
  }
}

function createElement(tagName = "div", {
  id = "",
  className = "",
  text = "",
  attrs = {},
  dataset = {},
} = {}) {
  const el = document.createElement(tagName);

  if (id) el.id = id;
  if (className) el.className = className;
  if (text) el.textContent = text;

  for (const [key, value] of Object.entries(safeObject(attrs))) {
    setAttribute(el, key, value);
  }

  for (const [key, value] of Object.entries(safeObject(dataset))) {
    setDataset(el, key, value);
  }

  return el;
}

function append(parent, children = []) {
  if (!parent) return parent;

  for (const child of safeArray(children)) {
    try {
      if (child) parent.appendChild(child);
    } catch {}
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

  const target = safeText(path, LOGIN_PATH);

  if (!target.startsWith("/") || target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return safeRedirect(LOGIN_PATH);
  }

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

    if (isFunction(app?.reboot)) {
      void Promise.resolve(
        app.reboot({
          reason: "boot-error-recovery",
          force: true,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function buildStorageKeys(AppCore = null) {
  const prefixes = [
    "onion",
    "auth",
    safeText(AppCore?.config?.storagePrefix, ""),
    safeText(AppCore?.config?.appKey, ""),
    safeText(AppCore?.config?.appId, ""),
  ].filter(Boolean);

  const keys = new Set(AUTH_STORAGE_KEYS);

  for (const key of AUTH_STORAGE_KEYS) {
    for (const prefix of prefixes) {
      keys.add(`${prefix}:${key}`);
      keys.add(`${prefix}.${key}`);
      keys.add(`${prefix}_${key}`);
    }
  }

  return Array.from(keys);
}

function removeStorageKey(AppCore, key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey) return false;

  let changed = false;

  try {
    AppCore?.storage?.remove?.(cleanKey);
    changed = true;
  } catch {}

  try {
    AppCore?.storage?.del?.(cleanKey);
    changed = true;
  } catch {}

  if (!isBrowser()) return changed;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage?.removeItem?.(cleanKey);
      changed = true;
    } catch {}
  }

  return changed;
}

export function clearAuthSession(Auth = null, AppCore = null) {
  let cleared = false;

  const authAttempts = [
    () => Auth?.clearSessionLocal?.({ silent: true, reason: "boot-error-recovery" }),
    () => Auth?.clear?.({ silent: true, reason: "boot-error-recovery" }),
    () => Auth?.logout?.({ silent: true, localOnly: true, reason: "boot-error-recovery" }),
    () => AppCore?.clearSession?.({ silent: true, reason: "boot-error-recovery" }),
  ];

  for (const attempt of authAttempts) {
    try {
      const result = attempt();
      if (result !== false) cleared = true;
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
    AppCore?.setState?.(patch, {
      source: "app:errors:clear-session",
      forceUnauthenticated: true,
      emit: false,
      silent: true,
    });

    cleared = true;
  } catch {
    try {
      AppCore?.patchState?.(patch, {
        source: "app:errors:clear-session",
        forceUnauthenticated: true,
        emit: false,
        silent: true,
      });

      cleared = true;
    } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
      cleared = true;
    }
  } catch {}

  for (const key of buildStorageKeys(AppCore)) {
    if (removeStorageKey(AppCore, key)) cleared = true;
  }

  return cleared;
}

/* =========================================================
   FATAL DOM / LOADER
========================================================= */

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

function hideLoader(hideLoaderFn, AppCore, reason = "boot-error") {
  const attempts = [
    () => hideLoaderFn?.(AppCore, {
      reason,
      minVisibleMs: 0,
      fatal: true,
      force: true,
      forceHide: true,
      allowDuringBoot: true,
    }),
    () => hideLoaderFn?.(AppCore),
    () => hideLoaderFn?.({ reason, force: true }),
    () => hideLoaderFn?.(),
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result !== undefined && result !== false) return true;
    } catch {}
  }

  if (!isBrowser()) return false;

  const loader = byId(DOM_IDS.appLoader) || qs("[data-app-loader='true'],[data-app-loader],.app-loader");

  if (!loader) return false;

  try {
    loader.hidden = true;

    setAttribute(loader, "aria-hidden", "true");
    setAttribute(loader, "aria-busy", "false");

    setDataset(loader, "loaderVisible", "false");
    setDataset(loader, "loaderState", "hidden");

    removeClasses(loader, LOADER_VISIBLE_CLASSES);
    addClasses(loader, LOADER_HIDDEN_CLASSES);

    return true;
  } catch {
    return false;
  }
}

function setShellVisibility(setShellVisibilityFn, AppCore, visible = false) {
  const attempts = [
    () => setShellVisibilityFn?.(AppCore, visible, {
      reason: "boot-error",
      authLike: true,
      hideAppShell: false,
      force: true,
      forceChromeSync: true,
    }),
    () => setShellVisibilityFn?.(AppCore, visible),
    () => setShellVisibilityFn?.(visible),
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result !== undefined && result !== false) return true;
    } catch {}
  }

  return false;
}

function markFatalDom(AppCore, snapshot = {}) {
  if (!isBrowser()) return false;

  const html = document.documentElement;
  const body = document.body;

  const shell = byId(DOM_IDS.appShell);
  const main = byId(DOM_IDS.mainContent);
  const appContent = byId(DOM_IDS.appContent);
  const view = byId(DOM_IDS.viewContainer);

  for (const root of [html, body]) {
    if (!root) continue;

    addClasses(root, ROOT_ERROR_CLASSES);
    removeClasses(root, ROOT_LOADING_CLASSES);

    setDataset(root, "appLoading", "false");
    setDataset(root, "appReady", "false");
    setDataset(root, "appBooting", "false");
    setDataset(root, "appState", "fatal");
    setDataset(root, "shellState", "fatal");
    setDataset(root, "routeMode", "fatal");
    setDataset(root, "chrome", "hidden");
    setDataset(root, "shell", "visible");
    setDataset(root, "bootError", "true");
  }

  for (const el of [shell, main, appContent, view]) {
    if (!el) continue;

    try {
      el.hidden = false;
    } catch {}

    setAttribute(el, "aria-hidden", "false");
    setAttribute(el, "aria-busy", "false");

    setDataset(el, "shell", "fatal");
    setDataset(el, "shellState", "fatal");
    setDataset(el, "shellInteractive", "true");
    setDataset(el, "viewState", "boot-error");
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
    AppCore?.setState?.(patch, {
      source: "app:errors:fatal-dom",
      emit: false,
      silent: true,
    });
  } catch {
    try {
      AppCore?.patchState?.(patch, {
        source: "app:errors:fatal-dom",
        emit: false,
        silent: true,
      });
    } catch {}
  }

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, patch);
    }
  } catch {}

  return true;
}

/* =========================================================
   VIEW CONTAINER
========================================================= */

function fallbackViewContainer() {
  if (!isBrowser()) return null;
  return qs(VIEW_CONTAINER_SELECTOR);
}

function createFallbackViewContainer(AppCore = null) {
  if (!isBrowser()) return null;

  try {
    let shell = byId(DOM_IDS.appShell);

    if (!shell) {
      shell = createElement("div", {
        id: DOM_IDS.appShell,
        className: "app-shell",
        dataset: {
          appShell: "true",
          shell: "fatal",
        },
      });

      (document.body || document.documentElement).appendChild(shell);
    }

    let main = byId(DOM_IDS.mainContent);

    if (!main) {
      main = createElement("main", {
        id: DOM_IDS.mainContent,
        className: "main-content",
        attrs: { role: "main" },
        dataset: { mainContent: "true" },
      });

      shell.appendChild(main);
    }

    let view = byId(DOM_IDS.viewContainer);

    if (!view) {
      view = createElement("div", {
        id: DOM_IDS.viewContainer,
        className: "view-container",
        dataset: {
          viewContainer: "true",
          routerView: "true",
          viewRoot: "true",
        },
      });

      main.appendChild(view);
    }

    try {
      AppCore.dom = AppCore.dom || {};
      AppCore.dom.appShell = shell;
      AppCore.dom.mainContent = main;
      AppCore.dom.viewContainer = view;
    } catch {}

    return view;
  } catch {
    return null;
  }
}

function resolveViewContainer(AppCore, getViewContainer) {
  const attempts = [
    () => getViewContainer?.(AppCore),
    () => getViewContainer?.(),
    () => AppCore?.dom?.viewContainer,
    () => fallbackViewContainer(),
    () => createFallbackViewContainer(AppCore),
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result) return result;
    } catch {}
  }

  return null;
}

function clearView(AppCore, container) {
  try {
    AppCore?.clearDynamicContainers?.({
      includeView: true,
      includeTopbar: true,
      includeTablehead: true,
    });
  } catch {
    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}
  }

  empty(container);

  return true;
}

/* =========================================================
   BOOT ERROR VIEW
========================================================= */

function metaRow(label = "", value = "") {
  const row = createElement("div", {
    className: "boot-error-card__meta-row",
  });

  append(row, [
    createElement("strong", { text: label }),
    createElement("span", { text: value || "—" }),
  ]);

  return row;
}

function actionButton(action, text, className = "ui-btn ui-btn-secondary") {
  return createElement("button", {
    className,
    text,
    attrs: { type: "button" },
    dataset: { bootErrorAction: action },
  });
}

function detailsNode(snapshot = {}) {
  const raw = safeText(snapshot.rawMessage, "");
  const stack = safeText(snapshot.stack, "");

  if ((!raw && !stack) || (raw && raw === snapshot.message && !stack)) {
    return null;
  }

  const details = createElement("details", {
    className: "boot-error-card__details",
  });

  const summary = createElement("summary", {
    text: "Detalle técnico",
  });

  const pre = createElement("pre", {
    className: "boot-error-card__pre",
  });

  pre.textContent = [
    raw ? `Mensaje: ${raw}` : "",
    snapshot.kind ? `Tipo: ${snapshot.kind}` : "",
    snapshot.url ? `URL: ${snapshot.url}` : "",
    snapshot.line ? `Línea: ${snapshot.line}` : "",
    snapshot.column ? `Columna: ${snapshot.column}` : "",
    stack ? `Stack:\n${stack}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  append(details, [summary, pre]);

  return details;
}

function buildBootErrorNode(snapshot = {}) {
  const section = createElement("section", {
    className: "content-wrapper boot-error-view",
    attrs: {
      "aria-labelledby": "boot-error-title",
    },
    dataset: {
      view: "boot-error",
      bootErrorView: "true",
    },
  });

  const card = createElement("div", {
    className: "panel-block boot-error-card",
    dataset: { bootErrorCard: "true" },
  });

  const inner = createElement("div", {
    className: "boot-error-card__inner",
  });

  const icon = createElement("div", {
    className: "boot-error-card__icon",
    text: "!",
    attrs: { "aria-hidden": "true" },
  });

  const header = createElement("div", {
    className: "boot-error-card__header",
  });

  append(header, [
    createElement("p", {
      className: "boot-error-card__eyebrow",
      text: "Boot failure",
    }),
    createElement("h2", {
      id: "boot-error-title",
      className: "boot-error-card__title",
      text: "Error al iniciar la aplicación",
    }),
    createElement("p", {
      className: "boot-error-card__message",
      text: snapshot.message || DEFAULT_BOOT_MESSAGE,
    }),
  ]);

  const meta = createElement("div", {
    className: "boot-error-card__meta",
    dataset: { bootErrorMeta: "true" },
  });

  append(meta, [
    metaRow("Código:", snapshot.code || snapshot.name || "BOOT_ERROR"),
    metaRow("Tipo:", snapshot.kind || "runtime"),
    metaRow("Fecha:", snapshot.at || iso()),
  ]);

  const details = detailsNode(snapshot);
  if (details) meta.appendChild(details);

  const retryButton = actionButton(ERROR_ACTIONS.retry, "Reintentar", "ui-btn ui-btn-primary");
  const rebootButton = actionButton(ERROR_ACTIONS.reboot, "Reiniciar app");
  const resetButton = actionButton(ERROR_ACTIONS.resetSession, "Limpiar sesión");
  const loginButton = actionButton(ERROR_ACTIONS.goLogin, "Ir al login");

  const actions = createElement("div", {
    className: "boot-error-card__actions",
  });

  append(actions, [
    retryButton,
    rebootButton,
    resetButton,
    loginButton,
  ]);

  append(inner, [
    icon,
    header,
    meta,
    actions,
  ]);

  card.appendChild(inner);
  section.appendChild(card);

  return {
    root: section,
    retryButton,
    rebootButton,
    resetButton,
    loginButton,
  };
}

function bindBootErrorActions({
  AppCore,
  Auth,
  snapshot,
  retryButton,
  rebootButton,
  resetButton,
  loginButton,
} = {}) {
  if (retryButton) {
    retryButton.addEventListener(
      "click",
      () => {
        emit(AppCore, ERROR_EVENTS.recover, {
          action: ERROR_ACTIONS.retry,
          error: snapshot,
        });

        reloadPage();
      },
      { once: true }
    );
  }

  if (rebootButton) {
    rebootButton.addEventListener(
      "click",
      () => {
        emit(AppCore, ERROR_EVENTS.recover, {
          action: ERROR_ACTIONS.reboot,
          error: snapshot,
        });

        if (!rebootApp(AppCore)) reloadPage();
      },
      { once: true }
    );
  }

  if (resetButton) {
    resetButton.addEventListener(
      "click",
      () => {
        emit(AppCore, ERROR_EVENTS.recover, {
          action: ERROR_ACTIONS.resetSession,
          error: snapshot,
        });

        clearAuthSession(Auth, AppCore);
        safeRedirect(LOGIN_PATH);
      },
      { once: true }
    );
  }

  if (loginButton) {
    loginButton.addEventListener(
      "click",
      () => {
        emit(AppCore, ERROR_EVENTS.recover, {
          action: ERROR_ACTIONS.goLogin,
          error: snapshot,
        });

        safeRedirect(LOGIN_PATH);
      },
      { once: true }
    );
  }
}

/* =========================================================
   RENDER BOOT ERROR
========================================================= */

export function renderBootError({
  AppCore,
  Auth,
  Toast,
  error,
  getViewContainer,
  setShellVisibility: setShellVisibilityFn,
  hideLoader: hideLoaderFn,
} = {}) {
  const snapshot = createErrorSnapshot({
    source: "boot",
    error,
    severity: "critical",
    boot: true,
    handled: true,
  });

  pushRecent(snapshot);
  setCoreError(AppCore, snapshot);

  emit(AppCore, ERROR_EVENTS.bootError, snapshot);
  emit(AppCore, ERROR_EVENTS.render, snapshot);

  exposeDebugApi(AppCore);

  hideLoader(hideLoaderFn, AppCore, "boot-error");
  setShellVisibility(setShellVisibilityFn, AppCore, false);
  markFatalDom(AppCore, snapshot);
  setTitle(AppCore, "Error de inicio");

  const container = resolveViewContainer(AppCore, getViewContainer);

  if (!container) {
    errorLog(AppCore, "renderBootError(): contenedor no disponible.", snapshot);

    if (!isThrottled("toast", snapshot, TOAST_THROTTLE_MS)) {
      toastError(Toast, AppCore, snapshot.message, {
        title: "Error de arranque",
        duration: 6000,
      });
    }

    return false;
  }

  if (isThrottled("render", snapshot, RENDER_THROTTLE_MS)) return true;
  if (errorState.rendering) return true;

  errorState.rendering = true;

  try {
    clearView(AppCore, container);

    const view = buildBootErrorNode(snapshot);

    container.appendChild(view.root);

    setAttribute(container, "aria-busy", "false");
    setAttribute(container, "aria-hidden", "false");
    setDataset(container, "viewState", "boot-error");

    bindBootErrorActions({
      AppCore,
      Auth,
      snapshot,
      ...view,
    });

    try {
      view.retryButton?.focus?.();
    } catch {}

    if (!isThrottled("toast", snapshot, TOAST_THROTTLE_MS)) {
      toastError(Toast, AppCore, snapshot.message, {
        title: "Error de arranque",
        duration: 6000,
      });
    }

    return true;
  } catch (renderError) {
    errorLog(AppCore, "No se pudo pintar la pantalla de error de boot.", renderError);
    return false;
  } finally {
    errorState.rendering = false;
  }
}

/* =========================================================
   RUNTIME ERRORS
========================================================= */

function isResourceErrorEvent(event = null) {
  try {
    return Boolean(
      event?.target &&
        event.target !== window &&
        (event.target.src || event.target.href)
    );
  } catch {
    return false;
  }
}

function normalizeResourceError(event = null) {
  const target = event?.target || {};
  const tagName = safeText(target.tagName, "resource").toLowerCase();
  const url = redactTokenInText(safeText(target.src || target.href, ""));

  return {
    name: "ResourceLoadError",
    message: `No se pudo cargar el recurso ${tagName}${url ? `: ${url}` : "."}`,
    url,
    targetTag: tagName,
  };
}

function isIgnoredError(error = null) {
  const message = getRawMessage(error, "");

  if (!message) return false;

  return IGNORED_ERROR_PATTERNS.some((pattern) => {
    try {
      return pattern.test(message);
    } catch {
      return false;
    }
  });
}

function emitTelemetry(AppCore, snapshot = {}) {
  if (isThrottled("telemetry", snapshot, TELEMETRY_THROTTLE_MS)) return false;

  return emit(AppCore, ERROR_EVENTS.telemetry, {
    ...snapshot,
    recentCount: errorState.recent.length,
    total: errorState.total,
  });
}

function processRuntimeError({
  AppCore,
  Toast,
  source = "runtime",
  error = null,
  severity = "error",
  toast = true,
} = {}) {
  if (errorState.handling) return null;
  if (isIgnoredError(error)) return null;

  errorState.handling = true;

  try {
    const snapshot = createErrorSnapshot({
      source,
      error,
      severity,
      boot: false,
      handled: true,
    });

    pushRecent(snapshot);
    setCoreError(AppCore, snapshot);

    errorLog(AppCore, source, snapshot);

    emit(AppCore, ERROR_EVENTS.appError, snapshot);
    emit(AppCore, ERROR_EVENTS.runtime, snapshot);

    if (snapshot.kind === "resource") {
      emit(AppCore, ERROR_EVENTS.resource, snapshot);
    }

    if (snapshot.kind === "promise") {
      emit(AppCore, ERROR_EVENTS.promise, snapshot);
    }

    emitTelemetry(AppCore, snapshot);

    if (toast && !isThrottled("toast", snapshot, TOAST_THROTTLE_MS)) {
      toastError(Toast, AppCore, snapshot.message, {
        title: severity === "warning" ? "Aviso" : "Error",
        duration: 5000,
      });
    }

    return snapshot;
  } finally {
    errorState.handling = false;
  }
}

export function reportAppError({
  AppCore,
  Toast,
  source = "runtime",
  error = null,
  severity = "error",
  toast = true,
} = {}) {
  return processRuntimeError({
    AppCore,
    Toast,
    source,
    error,
    severity,
    toast,
  });
}

/* =========================================================
   GLOBAL HANDLERS
========================================================= */

function addWindowListener(target, eventName, handler, options) {
  try {
    target.addEventListener(eventName, handler, options);

    boundListeners.push({
      target,
      eventName,
      handler,
      options,
    });

    return true;
  } catch {
    return false;
  }
}

export function bindGlobalErrorHandlers({
  AppCore,
  Toast,
  scope = DEFAULT_SCOPE,
} = {}) {
  if (handlersBound || bindingInFlight) return true;
  if (!isBrowser()) return false;

  bindingInFlight = true;

  const onError = (event) => {
    if (isResourceErrorEvent(event)) {
      const resourceError = normalizeResourceError(event);
      const tagName = safeText(event?.target?.tagName, "");

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
      error: event?.reason || {
        name: "UnhandledRejection",
        message: "Promise rechazada sin control",
      },
      severity: "error",
      toast: true,
    });
  };

  try {
    const okError = addWindowListener(window, "error", onError, true);
    const okReject = addWindowListener(window, "unhandledrejection", onReject, false);

    handlersBound = Boolean(okError || okReject);
    boundScope = handlersBound ? safeText(scope, DEFAULT_SCOPE) : "";

    if (!handlersBound) {
      errorLog(AppCore, "bindGlobalErrorHandlers() no pudo registrar listeners.");
      return false;
    }

    exposeDebugApi(AppCore);

    emit(AppCore, ERROR_EVENTS.handlersBound, {
      scope: boundScope,
      at: iso(),
    });

    log(AppCore, "Global error handlers activos.", {
      scope: boundScope,
    });

    return true;
  } finally {
    bindingInFlight = false;
  }
}

export function unbindGlobalErrorHandlers(AppCore = null) {
  for (const item of boundListeners.splice(0)) {
    try {
      item.target?.removeEventListener?.(
        item.eventName,
        item.handler,
        item.options
      );
    } catch {}
  }

  handlersBound = false;
  bindingInFlight = false;
  boundScope = "";

  emit(AppCore, ERROR_EVENTS.handlersUnbound, {
    at: iso(),
  });

  log(AppCore, "Global error handlers desactivados.");

  return true;
}

/* =========================================================
   DEBUG API
========================================================= */

export function exposeDebugApi(AppCore = null) {
  if (!isBrowser()) return false;

  const api = {
    version: APP_ERRORS_VERSION,

    getSnapshot: getErrorStateSnapshot,
    reset: resetErrorState,

    resolveMessage: resolveErrorMessage,
    createSnapshot: createErrorSnapshot,

    report: (error, options = {}) =>
      reportAppError({
        AppCore,
        error,
        ...safeObject(options),
      }),

    renderBootError: (error, options = {}) =>
      renderBootError({
        AppCore,
        error,
        ...safeObject(options),
      }),

    clearAuthSession: (Auth = null) =>
      clearAuthSession(Auth, AppCore),

    bind: (options = {}) =>
      bindGlobalErrorHandlers({
        AppCore,
        ...safeObject(options),
      }),

    unbind: () =>
      unbindGlobalErrorHandlers(AppCore),
  };

  try {
    window.__ONION_APP_ERRORS__ = api;
  } catch {}

  try {
    defineHidden(AppCore, "Errors", api);
  } catch {}

  if (!debugApiInstalled) {
    debugApiInstalled = true;

    emit(AppCore, ERROR_EVENTS.debugApi, {
      installed: true,
    });
  }

  return true;
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getErrorStateSnapshot() {
  return sanitize({
    version: APP_ERRORS_VERSION,

    handlersBound: Boolean(handlersBound),
    bindingInFlight: Boolean(bindingInFlight),
    boundScope,

    boundListeners: boundListeners.length,

    handling: Boolean(errorState.handling),
    rendering: Boolean(errorState.rendering),

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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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

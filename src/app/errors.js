/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   ONION SUPPORT · APP ERRORS
   BOOT ERROR UX · GLOBAL ERROR GUARD · TELEMETRY · RECOVERY · EXTREME 12/10

   RESPONSABILIDADES:
   - Renderizar pantalla de error de boot.
   - Bindear window.error.
   - Bindear unhandledrejection.
   - Notificar errores críticos con Toast.
   - Emitir telemetría interna.
   - Evitar loops recursivos de error.
   - Ofrecer recuperación UX enterprise.
   - Redactar tokens en mensajes, URLs y stack traces.
   - No dejar loader infinito.
   - No dejar pantalla blanca.

   REGLAS:
   - Sin inline handlers.
   - Sin CSS inline.
   - Sin innerHTML.
   - Sin throws accidentales.
   - safeEmit usa bus interno o window, no ambos.
   - Boot error debe funcionar aunque falten Router/Auth/Toast/AppCore.

   HARDENING 12/10:
   - DOM seguro por createElement/textContent.
   - Estado app-fatal coherente en html/body/shell/main/view.
   - Limpieza de loader incluso si loader.js no responde.
   - Recovery actions blindadas.
   - Global handlers idempotentes.
   - Resource errors diferenciados.
   - Rejection/object/error/string normalization.
   - Snapshot sin tokens.
   - Debug API pública segura.
========================================================= */

import { escapeHtml } from "./helpers.js";

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const APP_ERRORS_VERSION = "12.0.0";

const DEFAULT_ERROR_SCOPE =
  APP_SCOPES?.errors ||
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:errors";

const ERROR_THROTTLE_MS = 2500;
const MAX_RECENT_ERRORS = 12;

const BOOT_ERROR_RENDER_EVENT = "app:boot:error:render";
const APP_ERROR_EVENT = "app:error";
const APP_ERROR_TELEMETRY_EVENT = "app:error:telemetry";
const APP_ERROR_RECOVER_EVENT = "app:error:recover";

const FALLBACK_ERROR_MESSAGE =
  "Se produjo un error inesperado.";

const FALLBACK_BOOT_ERROR_MESSAGE =
  "No se pudo iniciar la aplicación correctamente.";

const LOGIN_PATH = "/login";

const DOM_IDS = Object.freeze({
  appLoader: "app-loader",
  appShell: "app-shell",
  mainContent: "main-content",
  appContent: "app-content",
  viewContainer: "view-container",
});

const VIEW_CONTAINER_SELECTOR =
  "#view-container,[data-view-root],[data-router-view],[data-view-container='true'],.view-container";

const ERROR_ACTIONS = Object.freeze({
  retry: "retry",
  resetSession: "reset-session",
  goLogin: "go-login",
});

const TOKEN_PARAM_NAMES = Object.freeze([
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
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
]);

const ERROR_EVENTS = Object.freeze({
  bootError:
    APP_EVENTS?.bootError || "app:boot:error",

  appError:
    APP_ERROR_EVENT,

  telemetry:
    APP_ERROR_TELEMETRY_EVENT,

  recover:
    APP_ERROR_RECOVER_EVENT,

  render:
    BOOT_ERROR_RENDER_EVENT,

  handlersBound:
    "app:errors:handlers:bound",

  handlersUnbound:
    "app:errors:handlers:unbound",
});

const FATAL_CLASSES = Object.freeze([
  "app-fatal",
]);

const LOADING_CLASSES = Object.freeze([
  "loading",
  "app-loading",
  "app-booting",
  "is-loading",
  "is-booting",
]);

const READY_CLASSES = Object.freeze([
  "app-ready",
]);

const LOADER_VISIBLE_CLASSES = Object.freeze([
  "is-visible",
  "is-entering",
  "is-leaving",
  "loader-visible",
]);

const LOADER_HIDDEN_CLASSES = Object.freeze([
  "is-hidden",
  "has-hidden",
  "loader-hidden",
]);

/* =========================================================
   INTERNAL STATE
========================================================= */

let handlersBound = false;
let bindingInFlight = false;
let boundScope = "";

const boundListeners = [];
const boundDisposers = [];

const errorState = {
  lastToastKey: "",
  lastToastAt: 0,

  lastRenderKey: "",
  lastRenderAt: 0,

  handling: false,
  rendering: false,

  total: 0,
  recent: [],
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeIsoDate(ms = now()) {
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

function safeMethod(target, methodName, args = []) {
  return safeInvoke(
    target?.[methodName],
    target,
    args
  );
}

function isExtensibleObject(value) {
  try {
    return (
      isObject(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !isExtensibleObject(target) ||
    !key
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  return false;
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/* =========================================================
   ESCAPE
========================================================= */

function localEscapeHtml(value = "") {
  return safeText(value, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeEscapeHtml(AppCore, value = "") {
  const text =
    safeText(value, "");

  try {
    if (isFunction(escapeHtml)) {
      const result =
        escapeHtml.length >= 2
          ? escapeHtml(AppCore, text)
          : escapeHtml(text);

      const clean =
        safeText(result, "");

      if (
        clean &&
        clean !== "[object Object]"
      ) {
        return clean;
      }
    }
  } catch {}

  return localEscapeHtml(text);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[AppErrors]", ...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[AppErrors]", ...args);
      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn("[AppErrors]", ...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error("[AppErrors]", ...args);
      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error("[AppErrors]", ...args);
  } catch {}
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail:
          payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const cleanEventName =
    safeText(eventName, "");

  if (!cleanEventName) {
    return false;
  }

  const opts =
    ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        cleanEventName,
        payload
      );

      busEmitted = true;
    }
  } catch {}

  /*
    Anti-storm:
    si hay bus interno, no duplicamos en window.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    return (
      safeWindowDispatch(
        cleanEventName,
        payload
      ) ||
      busEmitted
    );
  }

  return busEmitted;
}

function safeSetError(AppCore, snapshot = null) {
  const payload = {
    hasError:
      Boolean(snapshot),

    error:
      snapshot,

    lastError:
      snapshot,
  };

  try {
    AppCore?.setError?.(snapshot);
  } catch {}

  try {
    AppCore?.setState?.(
      payload,
      {
        source:
          "app:errors",
      }
    );
  } catch {}

  try {
    AppCore?.patchState?.(
      payload,
      {
        source:
          "app:errors",
      }
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        payload
      );
    }
  } catch {}

  return payload;
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function extractErrorCandidate(error = null) {
  if (!error) {
    return null;
  }

  if (error?.reason) {
    return error.reason;
  }

  if (error?.error) {
    return error.error;
  }

  return error;
}

function getErrorName(error = null) {
  const candidate =
    extractErrorCandidate(error);

  if (!candidate) {
    return "Error";
  }

  if (typeof candidate === "string") {
    return "Error";
  }

  return (
    safeText(candidate?.name, "") ||
    safeText(candidate?.constructor?.name, "") ||
    "Error"
  );
}

function getErrorCode(error = null) {
  const candidate =
    extractErrorCandidate(error);

  if (
    !candidate ||
    typeof candidate === "string"
  ) {
    return "";
  }

  return (
    safeText(candidate?.code, "") ||
    safeText(candidate?.status, "") ||
    safeText(candidate?.statusCode, "") ||
    safeText(candidate?.data?.code, "") ||
    safeText(candidate?.data?.status, "") ||
    safeText(candidate?.response?.status, "") ||
    safeText(candidate?.response?.statusCode, "") ||
    ""
  );
}

function getRawErrorMessage(error = null, fallback = FALLBACK_ERROR_MESSAGE) {
  const candidate =
    extractErrorCandidate(error);

  if (!candidate) {
    return fallback;
  }

  if (typeof candidate === "string") {
    return safeText(candidate, fallback);
  }

  return (
    safeText(candidate?.message, "") ||
    safeText(candidate?.statusText, "") ||
    safeText(candidate?.data?.message, "") ||
    safeText(candidate?.data?.error, "") ||
    safeText(candidate?.response?.data?.message, "") ||
    safeText(candidate?.response?.data?.error, "") ||
    safeText(candidate?.reason?.message, "") ||
    safeText(candidate?.reason, "") ||
    safeText(candidate?.detail, "") ||
    fallback
  );
}

function getErrorStack(error = null) {
  const candidate =
    extractErrorCandidate(error);

  if (
    !candidate ||
    typeof candidate === "string"
  ) {
    return "";
  }

  return redactTokenInText(
    safeText(candidate?.stack, "")
  );
}

function getErrorUrl(error = null) {
  const candidate =
    extractErrorCandidate(error);

  if (!candidate) {
    return "";
  }

  const url =
    safeText(candidate?.filename, "") ||
    safeText(candidate?.url, "") ||
    safeText(candidate?.target?.src, "") ||
    safeText(candidate?.target?.href, "") ||
    "";

  return redactTokenInText(url);
}

function getFriendlyErrorMessage(rawMessage = "", fallback = FALLBACK_ERROR_MESSAGE) {
  const message =
    redactTokenInText(
      safeText(rawMessage, fallback)
    );

  if (
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk/i.test(message) ||
    /chunkloaderror/i.test(message) ||
    /module script/i.test(message)
  ) {
    return "No se pudo cargar un módulo de la aplicación. Recarga la página para volver a sincronizar los archivos.";
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

  if (
    /quotaexceedederror/i.test(message) ||
    /quota exceeded/i.test(message)
  ) {
    return "El navegador no pudo guardar datos locales. Libera espacio o limpia el almacenamiento del sitio.";
  }

  return message;
}

export function resolveErrorMessage(error = null, fallback = FALLBACK_ERROR_MESSAGE) {
  const raw =
    getRawErrorMessage(
      error,
      fallback
    );

  return getFriendlyErrorMessage(
    raw,
    fallback
  );
}

export function createErrorSnapshot({
  source = "runtime",
  error = null,
  severity = "error",
  boot = false,
  handled = false,
} = {}) {
  const atMs =
    now();

  const rawMessage =
    getRawErrorMessage(
      error,
      boot
        ? FALLBACK_BOOT_ERROR_MESSAGE
        : FALLBACK_ERROR_MESSAGE
    );

  const message =
    getFriendlyErrorMessage(
      rawMessage,
      boot
        ? FALLBACK_BOOT_ERROR_MESSAGE
        : FALLBACK_ERROR_MESSAGE
    );

  const stack =
    getErrorStack(error);

  return {
    version:
      APP_ERRORS_VERSION,

    source:
      safeText(source, "runtime"),

    severity:
      safeText(severity, "error"),

    boot:
      Boolean(boot),

    handled:
      Boolean(handled),

    name:
      getErrorName(error),

    code:
      getErrorCode(error),

    message:
      redactTokenInText(message),

    rawMessage:
      redactTokenInText(rawMessage),

    url:
      getErrorUrl(error),

    stack,

    hasStack:
      Boolean(stack),

    at:
      safeIsoDate(atMs),

    atMs,
  };
}

function pushRecentError(snapshot = {}) {
  errorState.total += 1;

  errorState.recent.unshift({
    ...snapshot,
    index:
      errorState.total,
  });

  if (errorState.recent.length > MAX_RECENT_ERRORS) {
    errorState.recent =
      errorState.recent.slice(
        0,
        MAX_RECENT_ERRORS
      );
  }
}

function getThrottleKey(snapshot = {}) {
  return [
    snapshot.source,
    snapshot.name,
    snapshot.code,
    snapshot.message,
    snapshot.url,
  ]
    .map((item) =>
      safeText(item, "")
    )
    .join("|");
}

function shouldThrottleToast(snapshot = {}) {
  const key =
    getThrottleKey(snapshot);

  const time =
    now();

  if (
    errorState.lastToastKey === key &&
    time - errorState.lastToastAt < ERROR_THROTTLE_MS
  ) {
    return true;
  }

  errorState.lastToastKey = key;
  errorState.lastToastAt = time;

  return false;
}

function shouldThrottleRender(snapshot = {}) {
  const key =
    getThrottleKey(snapshot);

  const time =
    now();

  if (
    errorState.lastRenderKey === key &&
    time - errorState.lastRenderAt < ERROR_THROTTLE_MS
  ) {
    return true;
  }

  errorState.lastRenderKey = key;
  errorState.lastRenderAt = time;

  return false;
}

/* =========================================================
   TOAST
========================================================= */

function safeToastError(Toast, message, options = {}) {
  const cleanMessage =
    redactTokenInText(
      safeText(message, FALLBACK_ERROR_MESSAGE)
    );

  const payload = {
    title:
      safeText(options.title, "Error"),

    duration:
      Number.isFinite(Number(options.duration))
        ? Number(options.duration)
        : 5000,

    ...ensureObject(options),

    type:
      "error",

    message:
      cleanMessage,
  };

  try {
    if (isFunction(Toast?.error)) {
      return Toast.error(
        cleanMessage,
        payload
      );
    }

    if (isFunction(Toast?.show)) {
      return Toast.show(payload);
    }

    if (isFunction(Toast?.notify)) {
      return Toast.notify(payload);
    }
  } catch {}

  return null;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getById(id = "") {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  try {
    return document.getElementById(id);
  } catch {}

  return null;
}

function query(selector = "") {
  if (
    !isBrowser() ||
    !selector
  ) {
    return null;
  }

  try {
    return document.querySelector(selector);
  } catch {}

  return null;
}

function createElement(tagName = "div", {
  id = "",
  className = "",
  text = "",
  attrs = {},
  dataset = {},
} = {}) {
  const element =
    document.createElement(tagName);

  if (id) {
    element.id = id;
  }

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  for (const [key, value] of Object.entries(ensureObject(attrs))) {
    setAttribute(
      element,
      key,
      value
    );
  }

  for (const [key, value] of Object.entries(ensureObject(dataset))) {
    setDataset(
      element,
      key,
      value
    );
  }

  return element;
}

function setAttribute(element, name, value) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
    ) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {}

  return false;
}

function setDataset(element, key, value) {
  if (
    !element ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
    } else {
      element.dataset[key] =
        String(value);
    }

    return true;
  } catch {}

  return false;
}

function addClasses(element, classNames = []) {
  if (!element) {
    return false;
  }

  try {
    const clean =
      safeArray(classNames).filter(Boolean);

    if (clean.length) {
      element.classList.add(...clean);
    }

    return true;
  } catch {}

  return false;
}

function removeClasses(element, classNames = []) {
  if (!element) {
    return false;
  }

  try {
    const clean =
      safeArray(classNames).filter(Boolean);

    if (clean.length) {
      element.classList.remove(...clean);
    }

    return true;
  } catch {}

  return false;
}

function emptyElement(element) {
  if (!element) {
    return false;
  }

  try {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }

    return true;
  } catch {}

  return false;
}

function appendAll(parent, children = []) {
  if (!parent) {
    return parent;
  }

  for (const child of safeArray(children)) {
    try {
      if (child) {
        parent.appendChild(child);
      }
    } catch {}
  }

  return parent;
}

/* =========================================================
   RECOVERY ACTIONS
========================================================= */

function safeReload() {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.location.reload();
    return true;
  } catch {}

  return false;
}

function safeRedirect(path = LOGIN_PATH) {
  if (!isBrowser()) {
    return false;
  }

  const target =
    safeText(path, LOGIN_PATH);

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

function safeClearViewContainer(AppCore, container) {
  try {
    AppCore?.clearDynamicContainers?.();
  } catch {}

  emptyElement(container);

  return true;
}

function clearBrowserAuthStorage() {
  if (!isBrowser()) {
    return false;
  }

  const keys = [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "idToken",
    "id_token",
    "tempToken",
    "temp_token",
    "session",
    "sessionId",
    "session_id",
    "user",
    "auth",
    "onion:token",
    "onion:accessToken",
    "onion:refreshToken",
    "onion:session",
    "onion:user",
  ];

  let changed = false;

  for (const storage of [
    window.localStorage,
    window.sessionStorage,
  ]) {
    if (!storage) {
      continue;
    }

    for (const key of keys) {
      try {
        storage.removeItem(key);
        changed = true;
      } catch {}
    }
  }

  return changed;
}

function clearAuthSession(Auth, AppCore) {
  let cleared = false;

  try {
    Auth?.clearSessionLocal?.({
      silent:
        true,
      reason:
        "boot-error-recovery",
    });

    cleared = true;
  } catch (error) {
    safeWarn(
      AppCore,
      "No se pudo ejecutar Auth.clearSessionLocal().",
      error
    );
  }

  try {
    Auth?.clear?.({
      silent:
        true,
      reason:
        "boot-error-recovery",
    });

    cleared = true;
  } catch {}

  try {
    Auth?.logout?.({
      silent:
        true,
      localOnly:
        true,
      reason:
        "boot-error-recovery",
    });

    cleared = true;
  } catch {}

  try {
    AppCore?.clearSession?.({
      silent:
        true,
      reason:
        "boot-error-recovery",
    });

    cleared = true;
  } catch {}

  try {
    AppCore?.setState?.(
      {
        authenticated:
          false,
        hasToken:
          false,
        user:
          null,
        token:
          null,
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
        source:
          "app:errors:clear-session",
        forceUnauthenticated:
          true,
      }
    );

    cleared = true;
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.authenticated = false;
      AppCore.state.hasToken = false;
      AppCore.state.user = null;
      AppCore.state.token = null;
      AppCore.state.role = null;
      AppCore.state.username = null;
      AppCore.state.currentResolvedUsername = null;
      AppCore.state.resolvedUsername = null;
      cleared = true;
    }
  } catch {}

  clearBrowserAuthStorage();

  return cleared;
}

function safeSetDocumentTitle(AppCore, title = "Error de inicio") {
  try {
    AppCore?.setDocumentTitle?.(title);
    return true;
  } catch {}

  if (!isBrowser()) {
    return false;
  }

  try {
    document.title = title;
    return true;
  } catch {}

  return false;
}

function safeHideLoader(hideLoader, AppCore, reason = "boot-error") {
  try {
    hideLoader?.(
      AppCore,
      {
        reason,
        minVisibleMs:
          0,
        fatal:
          true,
      }
    );

    return true;
  } catch {}

  try {
    hideLoader?.(AppCore);
    return true;
  } catch {}

  if (!isBrowser()) {
    return false;
  }

  try {
    const loader =
      getById(DOM_IDS.appLoader) ||
      query("[data-app-loader='true'],.app-loader");

    if (!loader) {
      return false;
    }

    loader.hidden = true;

    setAttribute(
      loader,
      "aria-hidden",
      "true"
    );

    setAttribute(
      loader,
      "aria-busy",
      "false"
    );

    setDataset(
      loader,
      "loaderVisible",
      "false"
    );

    setDataset(
      loader,
      "loaderState",
      "hidden"
    );

    removeClasses(
      loader,
      LOADER_VISIBLE_CLASSES
    );

    addClasses(
      loader,
      LOADER_HIDDEN_CLASSES
    );

    return true;
  } catch {}

  return false;
}

function safeSetShellVisibility(setShellVisibility, AppCore, visible = false) {
  try {
    setShellVisibility?.(
      AppCore,
      visible,
      {
        reason:
          "boot-error",
        authLike:
          true,
        hideAppShell:
          false,
        force:
          true,
      }
    );

    return true;
  } catch {}

  try {
    setShellVisibility?.(
      AppCore,
      visible
    );

    return true;
  } catch {}

  return false;
}

function getFallbackViewContainer() {
  if (!isBrowser()) {
    return null;
  }

  return query(VIEW_CONTAINER_SELECTOR);
}

function resolveViewContainer(AppCore, getViewContainer) {
  try {
    if (isFunction(getViewContainer)) {
      const container =
        getViewContainer(AppCore);

      if (container) {
        return container;
      }
    }
  } catch {}

  try {
    if (AppCore?.dom?.viewContainer) {
      return AppCore.dom.viewContainer;
    }
  } catch {}

  return getFallbackViewContainer();
}

function markFatalDomState(AppCore, snapshot = {}) {
  if (!isBrowser()) {
    return false;
  }

  const html =
    document.documentElement;

  const body =
    document.body;

  const shell =
    getById(DOM_IDS.appShell);

  const main =
    getById(DOM_IDS.mainContent);

  const appContent =
    getById(DOM_IDS.appContent);

  const view =
    getById(DOM_IDS.viewContainer);

  try {
    for (const root of [
      html,
      body,
    ]) {
      if (!root) {
        continue;
      }

      addClasses(
        root,
        FATAL_CLASSES
      );

      removeClasses(
        root,
        LOADING_CLASSES
      );

      removeClasses(
        root,
        READY_CLASSES
      );

      setDataset(
        root,
        "appLoading",
        "false"
      );

      setDataset(
        root,
        "appState",
        "fatal"
      );

      setDataset(
        root,
        "shellState",
        "fatal"
      );

      setDataset(
        root,
        "routeMode",
        "fatal"
      );
    }

    if (body) {
      body.removeAttribute("data-auth-screen");
    }

    for (const element of [
      shell,
      main,
      appContent,
      view,
    ]) {
      if (!element) {
        continue;
      }

      element.hidden = false;

      setAttribute(
        element,
        "aria-hidden",
        "false"
      );

      setAttribute(
        element,
        "aria-busy",
        "false"
      );

      setDataset(
        element,
        "shell",
        "fatal"
      );

      setDataset(
        element,
        "shellState",
        "fatal"
      );

      setDataset(
        element,
        "shellInteractive",
        "true"
      );

      setDataset(
        element,
        "viewState",
        "boot-error"
      );
    }

    try {
      AppCore?.setState?.(
        {
          loading:
            false,
          booting:
            false,
          appFatal:
            true,
          fatal:
            true,
          fatalAt:
            snapshot.at || safeIsoDate(),
        },
        {
          source:
            "app:errors:fatal-dom",
        }
      );
    } catch {}

    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        AppCore.state.loading = false;
        AppCore.state.booting = false;
        AppCore.state.appFatal = true;
        AppCore.state.fatal = true;
        AppCore.state.fatalAt = snapshot.at || safeIsoDate();
      }
    } catch {}

    return true;
  } catch {}

  return false;
}

/* =========================================================
   ERROR SCREEN MARKUP - DOM SAFE
========================================================= */

function createBootErrorMetaRow(label = "", value = "") {
  const row =
    createElement("div", {
      className:
        "boot-error-card__meta-row",
    });

  const strong =
    createElement("strong", {
      text:
        label,
    });

  const span =
    createElement("span", {
      text:
        value,
    });

  appendAll(
    row,
    [
      strong,
      span,
    ]
  );

  return row;
}

function createBootErrorButton({
  action,
  className = "ui-btn ui-btn-secondary",
  text = "",
} = {}) {
  return createElement("button", {
    className,
    text,
    attrs: {
      type:
        "button",
    },
    dataset: {
      bootErrorAction:
        action,
    },
  });
}

function createBootErrorDetails(AppCore, snapshot = {}) {
  if (
    !snapshot.rawMessage ||
    snapshot.rawMessage === snapshot.message
  ) {
    return null;
  }

  const details =
    createElement("details", {
      className:
        "boot-error-card__details",
    });

  const summary =
    createElement("summary", {
      text:
        "Detalle técnico",
    });

  const pre =
    createElement("pre");

  /*
    textContent: sin innerHTML.
    safeEscapeHtml queda disponible por compat si se necesita serializar.
  */
  pre.textContent =
    safeEscapeHtml(
      AppCore,
      snapshot.rawMessage
    )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&");

  appendAll(
    details,
    [
      summary,
      pre,
    ]
  );

  return details;
}

function buildBootErrorNode(AppCore, snapshot = {}) {
  const section =
    createElement("section", {
      className:
        "content-wrapper boot-error-view",
      attrs: {
        "aria-labelledby":
          "boot-error-title",
      },
      dataset: {
        view:
          "boot-error",
        bootErrorView:
          "true",
      },
    });

  const card =
    createElement("div", {
      className:
        "panel-block boot-error-card",
      dataset: {
        bootErrorCard:
          "true",
      },
    });

  const inner =
    createElement("div", {
      className:
        "boot-error-card__inner",
    });

  const icon =
    createElement("div", {
      className:
        "boot-error-card__icon",
      text:
        "!",
      attrs: {
        "aria-hidden":
          "true",
      },
    });

  const header =
    createElement("div", {
      className:
        "boot-error-card__header",
    });

  const eyebrow =
    createElement("p", {
      className:
        "boot-error-card__eyebrow",
      text:
        "Boot failure",
    });

  const title =
    createElement("h2", {
      id:
        "boot-error-title",
      className:
        "boot-error-card__title",
      text:
        "Error al iniciar la aplicación",
    });

  const message =
    createElement("p", {
      className:
        "boot-error-card__message",
      text:
        snapshot.message || FALLBACK_BOOT_ERROR_MESSAGE,
    });

  appendAll(
    header,
    [
      eyebrow,
      title,
      message,
    ]
  );

  const meta =
    createElement("div", {
      className:
        "boot-error-card__meta",
      dataset: {
        bootErrorMeta:
          "true",
      },
    });

  appendAll(
    meta,
    [
      createBootErrorMetaRow(
        "Código:",
        snapshot.code || snapshot.name || "BOOT_ERROR"
      ),
      createBootErrorMetaRow(
        "Fecha:",
        snapshot.at || safeIsoDate()
      ),
    ]
  );

  const details =
    createBootErrorDetails(
      AppCore,
      snapshot
    );

  if (details) {
    meta.appendChild(details);
  }

  const actions =
    createElement("div", {
      className:
        "boot-error-card__actions",
    });

  const retryButton =
    createBootErrorButton({
      action:
        ERROR_ACTIONS.retry,
      className:
        "ui-btn ui-btn-primary",
      text:
        "Reintentar",
    });

  const resetButton =
    createBootErrorButton({
      action:
        ERROR_ACTIONS.resetSession,
      text:
        "Limpiar sesión",
    });

  const loginButton =
    createBootErrorButton({
      action:
        ERROR_ACTIONS.goLogin,
      text:
        "Ir al login",
    });

  appendAll(
    actions,
    [
      retryButton,
      resetButton,
      loginButton,
    ]
  );

  appendAll(
    inner,
    [
      icon,
      header,
      meta,
      actions,
    ]
  );

  card.appendChild(inner);
  section.appendChild(card);

  return {
    root:
      section,

    retryButton,
    resetButton,
    loginButton,
  };
}

/* =========================================================
   UI ERROR SCREEN
========================================================= */

export function renderBootError({
  AppCore,
  Auth,
  Toast,
  error,
  getViewContainer,
  setShellVisibility,
  hideLoader,
} = {}) {
  const snapshot =
    createErrorSnapshot({
      source:
        "boot",
      error,
      severity:
        "critical",
      boot:
        true,
      handled:
        true,
    });

  pushRecentError(snapshot);
  safeSetError(AppCore, snapshot);

  safeEmit(
    AppCore,
    ERROR_EVENTS.bootError,
    snapshot
  );

  safeEmit(
    AppCore,
    ERROR_EVENTS.render,
    snapshot
  );

  const container =
    resolveViewContainer(
      AppCore,
      getViewContainer
    );

  markFatalDomState(
    AppCore,
    snapshot
  );

  safeHideLoader(
    hideLoader,
    AppCore,
    "boot-error"
  );

  safeSetDocumentTitle(
    AppCore,
    "Error de inicio"
  );

  safeSetShellVisibility(
    setShellVisibility,
    AppCore,
    false
  );

  if (!container) {
    safeError(
      AppCore,
      "renderBootError(): contenedor no disponible.",
      snapshot
    );

    if (!shouldThrottleToast(snapshot)) {
      safeToastError(
        Toast,
        snapshot.message,
        {
          title:
            "Error de arranque",
          duration:
            6000,
        }
      );
    }

    return false;
  }

  if (shouldThrottleRender(snapshot)) {
    return true;
  }

  if (errorState.rendering) {
    return true;
  }

  errorState.rendering = true;

  try {
    safeClearViewContainer(
      AppCore,
      container
    );

    const {
      root,
      retryButton,
      resetButton,
      loginButton,
    } =
      buildBootErrorNode(
        AppCore,
        snapshot
      );

    container.appendChild(root);

    container.removeAttribute("aria-busy");

    container.setAttribute(
      "aria-hidden",
      "false"
    );

    container.setAttribute(
      "data-view-state",
      "boot-error"
    );

    if (retryButton) {
      retryButton.addEventListener(
        "click",
        () => {
          safeEmit(
            AppCore,
            ERROR_EVENTS.recover,
            {
              action:
                ERROR_ACTIONS.retry,
              error:
                snapshot,
            }
          );

          safeReload();
        },
        {
          once:
            true,
        }
      );
    }

    if (resetButton) {
      resetButton.addEventListener(
        "click",
        () => {
          safeEmit(
            AppCore,
            ERROR_EVENTS.recover,
            {
              action:
                ERROR_ACTIONS.resetSession,
              error:
                snapshot,
            }
          );

          clearAuthSession(
            Auth,
            AppCore
          );

          safeRedirect(LOGIN_PATH);
        },
        {
          once:
            true,
        }
      );
    }

    if (loginButton) {
      loginButton.addEventListener(
        "click",
        () => {
          safeEmit(
            AppCore,
            ERROR_EVENTS.recover,
            {
              action:
                ERROR_ACTIONS.goLogin,
              error:
                snapshot,
            }
          );

          safeRedirect(LOGIN_PATH);
        },
        {
          once:
            true,
        }
      );
    }

    try {
      retryButton?.focus?.();
    } catch {}

    if (!shouldThrottleToast(snapshot)) {
      safeToastError(
        Toast,
        snapshot.message,
        {
          title:
            "Error de arranque",
          duration:
            6000,
        }
      );
    }

    return true;
  } catch (renderError) {
    safeError(
      AppCore,
      "No se pudo pintar la pantalla de error de boot.",
      renderError
    );

    return false;
  } finally {
    errorState.rendering = false;
  }
}

/* =========================================================
   GLOBAL ERROR PROCESSOR
========================================================= */

function isResourceErrorEvent(event = null) {
  try {
    return Boolean(
      event?.target &&
      event.target !== window &&
      (
        event.target.src ||
        event.target.href
      )
    );
  } catch {}

  return false;
}

function normalizeResourceError(event = null) {
  const target =
    event?.target || {};

  const tagName =
    safeText(
      target.tagName,
      "resource"
    ).toLowerCase();

  const url =
    redactTokenInText(
      safeText(
        target.src ||
          target.href,
        ""
      )
    );

  return {
    name:
      "ResourceLoadError",

    message:
      `No se pudo cargar el recurso ${tagName}${url ? `: ${url}` : "."}`,

    url,

    target,
  };
}

function isIgnorableRuntimeError(error = null) {
  const message =
    getRawErrorMessage(error, "");

  if (!message) {
    return false;
  }

  return Boolean(
    /ResizeObserver loop limit exceeded/i.test(message) ||
      /ResizeObserver loop completed with undelivered notifications/i.test(message)
  );
}

function processRuntimeError({
  AppCore,
  Toast,
  source = "runtime",
  error = null,
  severity = "error",
  toast = true,
} = {}) {
  if (errorState.handling) {
    return null;
  }

  if (isIgnorableRuntimeError(error)) {
    return null;
  }

  errorState.handling = true;

  try {
    const snapshot =
      createErrorSnapshot({
        source,
        error,
        severity,
        boot:
          false,
        handled:
          true,
      });

    pushRecentError(snapshot);
    safeSetError(AppCore, snapshot);

    safeError(
      AppCore,
      source,
      snapshot
    );

    safeEmit(
      AppCore,
      ERROR_EVENTS.appError,
      snapshot
    );

    safeEmit(
      AppCore,
      ERROR_EVENTS.telemetry,
      {
        ...snapshot,
        recentCount:
          errorState.recent.length,
        total:
          errorState.total,
      }
    );

    if (
      toast &&
      !shouldThrottleToast(snapshot)
    ) {
      safeToastError(
        Toast,
        snapshot.message,
        {
          title:
            severity === "warning"
              ? "Aviso"
              : "Error",

          duration:
            5000,
        }
      );
    }

    return snapshot;
  } finally {
    errorState.handling = false;
  }
}

/* =========================================================
   GLOBAL HANDLERS
========================================================= */

function rememberBoundListener(target, eventName, handler, options = undefined) {
  boundListeners.push({
    target,
    eventName,
    handler,
    options,
  });
}

function rememberDisposer(disposer) {
  if (isFunction(disposer)) {
    boundDisposers.push(disposer);
  }
}

function bindWithCleanup({
  AppCore,
  scope,
  target,
  eventName,
  handler,
  options,
}) {
  const cleanup =
    AppCore?.cleanup;

  if (
    cleanup &&
    isFunction(cleanup.event)
  ) {
    try {
      const off =
        cleanup.event(
          scope,
          target,
          eventName,
          handler,
          options
        );

      if (isFunction(off)) {
        rememberDisposer(off);
      }

      return true;
    } catch {
      try {
        const off =
          cleanup.event(
            scope,
            target,
            eventName,
            handler
          );

        if (isFunction(off)) {
          rememberDisposer(off);
        }

        return true;
      } catch {}
    }
  }

  try {
    target.addEventListener(
      eventName,
      handler,
      options
    );

    rememberBoundListener(
      target,
      eventName,
      handler,
      options
    );

    return true;
  } catch {}

  return false;
}

export function bindGlobalErrorHandlers({
  AppCore,
  Toast,
  scope = DEFAULT_ERROR_SCOPE,
} = {}) {
  if (handlersBound) {
    return true;
  }

  if (bindingInFlight) {
    return true;
  }

  if (!isBrowser()) {
    return false;
  }

  bindingInFlight = true;

  const finalScope =
    safeText(
      scope,
      DEFAULT_ERROR_SCOPE
    );

  const onError = (event) => {
    if (isResourceErrorEvent(event)) {
      const resourceError =
        normalizeResourceError(event);

      processRuntimeError({
        AppCore,
        Toast,
        source:
          "window.resource-error",
        error:
          resourceError,
        severity:
          "warning",
        toast:
          /script|link/i.test(
            safeText(
              event?.target?.tagName,
              ""
            )
          ),
      });

      return;
    }

    const error =
      event?.error || {
        name:
          "WindowError",
        message:
          event?.message || "Error global no controlado",
        filename:
          event?.filename,
        lineno:
          event?.lineno,
        colno:
          event?.colno,
      };

    processRuntimeError({
      AppCore,
      Toast,
      source:
        "window.error",
      error,
      severity:
        "error",
      toast:
        true,
    });
  };

  const onReject = (event) => {
    const reason =
      event?.reason || {
        name:
          "UnhandledRejection",
        message:
          "Promise rechazada sin control",
      };

    processRuntimeError({
      AppCore,
      Toast,
      source:
        "unhandledrejection",
      error:
        reason,
      severity:
        "error",
      toast:
        true,
    });
  };

  try {
    const okError =
      bindWithCleanup({
        AppCore,
        scope:
          finalScope,
        target:
          window,
        eventName:
          "error",
        handler:
          onError,
        options:
          true,
      });

    const okReject =
      bindWithCleanup({
        AppCore,
        scope:
          finalScope,
        target:
          window,
        eventName:
          "unhandledrejection",
        handler:
          onReject,
        options:
          false,
      });

    handlersBound =
      Boolean(
        okError ||
          okReject
      );

    boundScope =
      handlersBound
        ? finalScope
        : "";

    if (handlersBound) {
      exposeDebugApi(AppCore);

      safeEmit(
        AppCore,
        ERROR_EVENTS.handlersBound,
        {
          version:
            APP_ERRORS_VERSION,
          scope:
            boundScope,
          at:
            safeIsoDate(),
        }
      );

      safeLog(
        AppCore,
        "Global error handlers activos.",
        {
          scope:
            boundScope,
        }
      );

      return true;
    }

    safeError(
      AppCore,
      "bindGlobalErrorHandlers() no pudo registrar listeners."
    );

    return false;
  } finally {
    bindingInFlight = false;
  }
}

export function unbindGlobalErrorHandlers(AppCore = null) {
  for (const dispose of boundDisposers.splice(0)) {
    try {
      dispose();
    } catch {}
  }

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

  safeEmit(
    AppCore,
    ERROR_EVENTS.handlersUnbound,
    {
      version:
        APP_ERRORS_VERSION,
      at:
        safeIsoDate(),
    }
  );

  safeLog(
    AppCore,
    "Global error handlers desactivados."
  );

  return true;
}

/* =========================================================
   DEBUG API
========================================================= */

function exposeDebugApi(AppCore = null) {
  if (!isBrowser()) {
    return false;
  }

  const api = {
    version:
      APP_ERRORS_VERSION,

    getSnapshot:
      getErrorStateSnapshot,

    reset:
      resetErrorState,

    resolveMessage:
      resolveErrorMessage,

    createSnapshot:
      createErrorSnapshot,
  };

  try {
    window.__ONION_APP_ERRORS__ = api;
  } catch {}

  try {
    safeDefineValue(
      AppCore,
      "Errors",
      api
    );
  } catch {}

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getErrorStateSnapshot() {
  return {
    version:
      APP_ERRORS_VERSION,

    handlersBound:
      Boolean(handlersBound),

    bindingInFlight:
      Boolean(bindingInFlight),

    boundScope,

    boundListeners:
      boundListeners.length,

    boundDisposers:
      boundDisposers.length,

    handling:
      Boolean(errorState.handling),

    rendering:
      Boolean(errorState.rendering),

    total:
      errorState.total,

    lastToastKey:
      redactTokenInText(errorState.lastToastKey),

    lastToastAt:
      errorState.lastToastAt,

    lastToastAtIso:
      errorState.lastToastAt
        ? safeIsoDate(errorState.lastToastAt)
        : "",

    lastRenderKey:
      redactTokenInText(errorState.lastRenderKey),

    lastRenderAt:
      errorState.lastRenderAt,

    lastRenderAtIso:
      errorState.lastRenderAt
        ? safeIsoDate(errorState.lastRenderAt)
        : "",

    recent:
      errorState.recent.map((item) => ({
        index:
          item.index,

        source:
          item.source,

        severity:
          item.severity,

        boot:
          Boolean(item.boot),

        handled:
          Boolean(item.handled),

        name:
          item.name,

        code:
          item.code,

        message:
          item.message,

        url:
          item.url,

        hasStack:
          Boolean(item.hasStack),

        at:
          item.at,
      })),
  };
}

export function resetErrorState() {
  errorState.lastToastKey = "";
  errorState.lastToastAt = 0;

  errorState.lastRenderKey = "";
  errorState.lastRenderAt = 0;

  errorState.handling = false;
  errorState.rendering = false;

  errorState.total = 0;
  errorState.recent = [];

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

  resolveErrorMessage,
  createErrorSnapshot,

  getErrorStateSnapshot,
  resetErrorState,
};

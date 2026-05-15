/* =========================================================
   Onion SPA - App Errors
   Archivo: /src/app/errors.js

   ONION SUPPORT · APP ERRORS
   BOOT ERROR UX · GLOBAL ERROR GUARD · TELEMETRY · RECOVERY · 10/10

   RESPONSABILIDADES:
   - Renderizar pantalla de error de boot.
   - Bindear window.error.
   - Bindear unhandledrejection.
   - Diferenciar errores runtime, promise rejection y resource load.
   - Notificar errores críticos con Toast.
   - Emitir telemetría interna.
   - Evitar loops recursivos de error.
   - Ofrecer recuperación UX enterprise.
   - Redactar tokens en mensajes, URLs y stack traces.
   - No dejar loader infinito.
   - No dejar pantalla blanca.
   - Exponer API debug segura.

   REGLAS:
   - Sin inline handlers.
   - Sin CSS inline.
   - Sin innerHTML.
   - Sin throws accidentales.
   - safeEmit usa bus interno o window, no ambos.
   - Boot error debe funcionar aunque falten Router/Auth/Toast/AppCore.

   EXTREME MODE:
   - Fallback view container si #view-container falta.
   - Fatal DOM state endurecido para html/body/shell/main/view.
   - Limpieza de sesión local robusta y selectiva.
   - Redacción fuerte query/path/Bearer/JWT/authorization.
   - Dedupe de toast/render/telemetry.
   - Debug API segura en window.__ONION_APP_ERRORS__ y AppCore.Errors.
========================================================= */

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  LOGIN_PATH as LOGIN_PATH_FROM_CONSTANTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const APP_ERRORS_VERSION =
  "15.1.0-extreme-pro";

const ERROR_SOURCE =
  "app:errors";

const DEFAULT_ERROR_SCOPE =
  APP_SCOPES?.errors ||
  APP_SCOPES?.events ||
  APP_SCOPE ||
  "app:errors";

const ERROR_THROTTLE_MS =
  2500;

const RENDER_THROTTLE_MS =
  1200;

const TELEMETRY_THROTTLE_MS =
  900;

const MAX_RECENT_ERRORS =
  24;

const FALLBACK_ERROR_MESSAGE =
  "Se produjo un error inesperado.";

const FALLBACK_BOOT_ERROR_MESSAGE =
  "No se pudo iniciar la aplicación correctamente.";

const LOGIN_PATH =
  LOGIN_PATH_FROM_CONSTANTS ||
  "/login";

const DOM_IDS =
  Object.freeze({
    app:
      "app",

    appRoot:
      "app-root",

    appLoader:
      "app-loader",

    appShell:
      "app-shell",

    mainContent:
      "main-content",

    appContent:
      "app-content",

    viewContainer:
      "view-container",
  });

const VIEW_CONTAINER_SELECTOR =
  "#view-container,[data-view-root],[data-router-view],[data-view-container='true'],.view-container";

const ERROR_ACTIONS =
  Object.freeze({
    retry:
      "retry",

    reboot:
      "reboot",

    resetSession:
      "reset-session",

    goLogin:
      "go-login",
  });

const TOKEN_PARAM_NAMES =
  Object.freeze([
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

const TOKEN_ROUTE_PATHS =
  Object.freeze([
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

const ERROR_EVENTS =
  Object.freeze({
    bootError:
      APP_EVENTS?.bootError ||
      "app:boot:error",

    appError:
      APP_EVENTS?.error ||
      "app:error",

    telemetry:
      APP_EVENTS?.errorTelemetry ||
      "app:error:telemetry",

    recover:
      "app:error:recover",

    render:
      "app:boot:error:render",

    runtime:
      "app:error:runtime",

    resource:
      "app:error:resource",

    promise:
      "app:error:promise",

    handlersBound:
      "app:errors:handlers:bound",

    handlersUnbound:
      "app:errors:handlers:unbound",

    debugApi:
      "app:errors:debug-api",
  });

const FATAL_CLASSES =
  Object.freeze([
    "app-fatal",
  ]);

const ERROR_CLASSES =
  Object.freeze([
    "app-error",
  ]);

const LOADING_CLASSES =
  Object.freeze([
    "loading",
    "app-loading",
    "app-booting",
    "is-loading",
    "is-booting",
  ]);

const READY_CLASSES =
  Object.freeze([
    "app-ready",
  ]);

const LOADER_VISIBLE_CLASSES =
  Object.freeze([
    "is-visible",
    "is-entering",
    "is-leaving",
    "loader-visible",
  ]);

const LOADER_HIDDEN_CLASSES =
  Object.freeze([
    "is-hidden",
    "has-hidden",
    "loader-hidden",
  ]);

const AUTH_STORAGE_KEYS =
  Object.freeze([
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

    "onion:token",
    "onion:accessToken",
    "onion:access_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion:session",
    "onion:user",
    "onion:auth",

    "onion.token",
    "onion.accessToken",
    "onion.access_token",
    "onion.refreshToken",
    "onion.refresh_token",
    "onion.session",
    "onion.user",
    "onion.auth",

    "auth.token",
    "auth:token",
    "auth.accessToken",
    "auth:accessToken",
    "auth.access_token",
    "auth:access_token",
    "auth.refreshToken",
    "auth:refreshToken",
    "auth.refresh_token",
    "auth:refresh_token",
    "auth.session",
    "auth:session",
    "auth.user",
    "auth:user",
  ]);

const IGNORED_ERROR_PATTERNS =
  Object.freeze([
    /ResizeObserver loop limit exceeded/i,
    /ResizeObserver loop completed with undelivered notifications/i,
    /Script error\.?$/i,
  ]);

const BOOT_ERROR_VIEW_DATASET =
  Object.freeze({
    view:
      "boot-error",

    bootErrorView:
      "true",
  });

/* =========================================================
   INTERNAL STATE
========================================================= */

let handlersBound =
  false;

let bindingInFlight =
  false;

let boundScope =
  "";

let debugApiInstalled =
  false;

const boundListeners =
  [];

const boundDisposers =
  [];

const errorState = {
  lastToastKey:
    "",

  lastToastAt:
    0,

  lastRenderKey:
    "",

  lastRenderAt:
    0,

  lastTelemetryKey:
    "",

  lastTelemetryAt:
    0,

  handling:
    false,

  rendering:
    false,

  total:
    0,

  recent:
    [],
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
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeIsoDate(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function isExtensibleTarget(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !isExtensibleTarget(target) ||
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

  try {
    target[key] =
      value;

    return true;
  } catch {}

  return false;
}

/* =========================================================
   TOKEN REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      const escaped =
        escapeRegExp(name);

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  for (const routePath of TOKEN_ROUTE_PATHS) {
    try {
      output =
        output.replace(
          new RegExp(`(${escapeRegExp(routePath)}\\/)([^/?#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
        value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
        value.nodeName
    );
  } catch {}

  return false;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isDomNodeLike(value)) {
    return {
      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(
          value.className?.baseVal ||
            value.className,
          ""
        ),
    };
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactTokenInText(value.message || ""),

      stack:
        redactTokenInText(value.stack || ""),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizeValue(
          item,
          depth + 1
        )
      );
  }

  if (value instanceof Map) {
    return {
      type:
        "Map",

      size:
        value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type:
        "Set",

      size:
        value.size,
    };
  }

  if (isObject(value)) {
    const output =
      {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i.test(key)
      ) {
        if (
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
        ) {
          output[key] =
            item;
        } else {
          output[key] =
            "***";
        }

        continue;
      }

      output[key] =
        sanitizeValue(
          item,
          depth + 1
        );
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   LOG / EMIT
========================================================= */

function safeLog(AppCore, ...args) {
  const cleanArgs =
    args.map((arg) =>
      sanitizeValue(arg)
    );

  try {
    AppCore?.utils?.log?.(
      "[AppErrors]",
      ...cleanArgs
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  const cleanArgs =
    args.map((arg) =>
      sanitizeValue(arg)
    );

  let emittedByCore =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppErrors]",
        ...cleanArgs
      );

      emittedByCore =
        true;
    }
  } catch {
    emittedByCore =
      false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[AppErrors]",
      ...cleanArgs
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  const cleanArgs =
    args.map((arg) =>
      sanitizeValue(arg)
    );

  let emittedByCore =
    false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[AppErrors]",
        ...cleanArgs
      );

      emittedByCore =
        true;
    }
  } catch {
    emittedByCore =
      false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error(
      "[AppErrors]",
      ...cleanArgs
    );
  } catch {}
}

function safeCreateCustomEvent(name, detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        name,
        {
          detail,
        }
      );
    }
  } catch {}

  try {
    const event =
      document.createEvent("CustomEvent");

    event.initCustomEvent(
      name,
      false,
      false,
      detail
    );

    return event;
  } catch {
    return null;
  }
}

function safeWindowDispatch(eventName, payload = {}) {
  if (
    !isBrowser() ||
    !eventName
  ) {
    return false;
  }

  try {
    const event =
      safeCreateCustomEvent(
        eventName,
        sanitizeValue(payload)
      );

    if (!event) {
      return false;
    }

    window.dispatchEvent(event);
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

  const cleanPayload =
    sanitizeValue({
      version:
        APP_ERRORS_VERSION,

      source:
        ERROR_SOURCE,

      ...ensureObject(payload),
    });

  const opts =
    ensureObject(options);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        cleanEventName,
        cleanPayload
      );

      busEmitted =
        true;
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
        cleanPayload
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

    lastAppError:
      snapshot,

    lastBootError:
      snapshot?.boot === true
        ? snapshot
        : AppCore?.state?.lastBootError || null,
  };

  try {
    AppCore?.setError?.(snapshot);
  } catch {}

  try {
    AppCore?.setState?.(
      payload,
      {
        source:
          ERROR_SOURCE,

        emit:
          false,

        emitState:
          false,

        silent:
          true,
      }
    );
  } catch {}

  try {
    AppCore?.patchState?.(
      payload,
      {
        source:
          ERROR_SOURCE,

        emit:
          false,

        emitState:
          false,

        silent:
          true,
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
    return safeText(
      candidate,
      fallback
    );
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
    safeText(candidate?.href, "") ||
    safeText(candidate?.target?.src, "") ||
    safeText(candidate?.target?.href, "") ||
    "";

  return redactTokenInText(url);
}

function getErrorLine(error = null) {
  const candidate =
    extractErrorCandidate(error);

  if (!candidate) {
    return 0;
  }

  return safeNumber(
    candidate?.lineno ||
      candidate?.lineNumber ||
      candidate?.line,
    0
  );
}

function getErrorColumn(error = null) {
  const candidate =
    extractErrorCandidate(error);

  if (!candidate) {
    return 0;
  }

  return safeNumber(
    candidate?.colno ||
      candidate?.columnNumber ||
      candidate?.column,
    0
  );
}

function getErrorKind(error = null, source = "") {
  const message =
    getRawErrorMessage(error, "")
      .toLowerCase();

  const src =
    safeText(source, "").toLowerCase();

  if (src.includes("resource")) {
    return "resource";
  }

  if (src.includes("unhandledrejection")) {
    return "promise";
  }

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

  if (
    /quotaexceedederror/i.test(message) ||
    /quota exceeded/i.test(message)
  ) {
    return "storage";
  }

  return "runtime";
}

function getFriendlyErrorMessage(rawMessage = "", fallback = FALLBACK_ERROR_MESSAGE) {
  const message =
    redactTokenInText(
      safeText(
        rawMessage,
        fallback
      )
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

  return sanitizeValue({
    version:
      APP_ERRORS_VERSION,

    source:
      safeText(source, "runtime"),

    kind:
      getErrorKind(error, source),

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

    line:
      getErrorLine(error),

    column:
      getErrorColumn(error),

    stack,

    hasStack:
      Boolean(stack),

    at:
      safeIsoDate(atMs),

    atMs,
  });
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
    snapshot.kind,
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

  errorState.lastToastKey =
    key;

  errorState.lastToastAt =
    time;

  return false;
}

function shouldThrottleRender(snapshot = {}) {
  const key =
    getThrottleKey(snapshot);

  const time =
    now();

  if (
    errorState.lastRenderKey === key &&
    time - errorState.lastRenderAt < RENDER_THROTTLE_MS
  ) {
    return true;
  }

  errorState.lastRenderKey =
    key;

  errorState.lastRenderAt =
    time;

  return false;
}

function shouldThrottleTelemetry(snapshot = {}) {
  const key =
    getThrottleKey(snapshot);

  const time =
    now();

  if (
    errorState.lastTelemetryKey === key &&
    time - errorState.lastTelemetryAt < TELEMETRY_THROTTLE_MS
  ) {
    return true;
  }

  errorState.lastTelemetryKey =
    key;

  errorState.lastTelemetryAt =
    time;

  return false;
}

/* =========================================================
   TOAST
========================================================= */

function safeToastError(Toast, message, options = {}) {
  const cleanMessage =
    redactTokenInText(
      safeText(
        message,
        FALLBACK_ERROR_MESSAGE
      )
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
  } catch {}

  try {
    if (isFunction(Toast?.errorToast)) {
      return Toast.errorToast(
        cleanMessage,
        payload
      );
    }
  } catch {}

  try {
    if (isFunction(Toast?.showToast)) {
      return Toast.showToast(
        cleanMessage,
        "error",
        payload
      );
    }
  } catch {}

  try {
    if (isFunction(Toast?.show)) {
      return Toast.show(
        cleanMessage,
        "error",
        payload
      );
    }
  } catch {}

  try {
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
    element.id =
      id;
  }

  if (className) {
    element.className =
      className;
  }

  if (text) {
    element.textContent =
      text;
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

  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return safeRedirect(LOGIN_PATH);
  }

  try {
    window.location.assign(target);
    return true;
  } catch {
    try {
      window.location.href =
        target;

      return true;
    } catch {}
  }

  return false;
}

function safeRebootApp(AppCore) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const app =
      window.__ONION_APP__ ||
      AppCore?.App ||
      AppCore?.app ||
      null;

    if (isFunction(app?.reboot)) {
      void Promise.resolve(
        app.reboot({
          reason:
            "boot-error-recovery",

          force:
            true,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function safeClearViewContainer(AppCore, container) {
  try {
    AppCore?.clearDynamicContainers?.({
      includeView:
        true,
      includeTopbar:
        true,
      includeTablehead:
        true,
    });
  } catch {
    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}
  }

  emptyElement(container);

  return true;
}

function clearBrowserAuthStorage() {
  if (!isBrowser()) {
    return false;
  }

  let changed =
    false;

  const storages =
    [];

  try {
    if (window.localStorage) {
      storages.push(window.localStorage);
    }
  } catch {}

  try {
    if (window.sessionStorage) {
      storages.push(window.sessionStorage);
    }
  } catch {}

  for (const storage of storages) {
    for (const key of AUTH_STORAGE_KEYS) {
      try {
        storage.removeItem(key);
        changed =
          true;
      } catch {}
    }
  }

  return changed;
}

function clearAuthSession(Auth, AppCore) {
  let cleared =
    false;

  try {
    Auth?.clearSessionLocal?.({
      silent:
        true,
      reason:
        "boot-error-recovery",
    });

    cleared =
      true;
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

    cleared =
      true;
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

    cleared =
      true;
  } catch {}

  try {
    AppCore?.clearSession?.({
      silent:
        true,
      reason:
        "boot-error-recovery",
    });

    cleared =
      true;
  } catch {}

  const unauthPatch = {
    authenticated:
      false,

    hasToken:
      false,

    user:
      null,

    currentUser:
      null,

    sessionUser:
      null,

    authUser:
      null,

    token:
      null,

    accessToken:
      null,

    access_token:
      null,

    refreshToken:
      null,

    refresh_token:
      null,

    role:
      null,

    rol:
      null,

    username:
      null,

    currentResolvedUsername:
      null,

    resolvedUsername:
      null,
  };

  try {
    AppCore?.setState?.(
      unauthPatch,
      {
        source:
          "app:errors:clear-session",

        forceUnauthenticated:
          true,

        emit:
          false,

        silent:
          true,
      }
    );

    cleared =
      true;
  } catch {}

  try {
    AppCore?.patchState?.(
      unauthPatch,
      {
        source:
          "app:errors:clear-session",

        forceUnauthenticated:
          true,

        emit:
          false,

        silent:
          true,
      }
    );

    cleared =
      true;
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        unauthPatch
      );

      cleared =
        true;
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
    document.title =
      title;

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
        force:
          true,
        forceHide:
          true,
        allowDuringBoot:
          true,
        state:
          null,
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

    loader.hidden =
      true;

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

    /*
      Limpieza de posibles estilos legacy sin inyectar nuevos estilos.
    */
    try {
      loader.style.display = "";
      loader.style.opacity = "";
      loader.style.visibility = "";
      loader.style.pointerEvents = "";
    } catch {}

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
        forceChromeSync:
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

/* =========================================================
   VIEW CONTAINER FALLBACK
========================================================= */

function getFallbackViewContainer() {
  if (!isBrowser()) {
    return null;
  }

  return query(VIEW_CONTAINER_SELECTOR);
}

function createFallbackViewContainer(AppCore = null) {
  if (!isBrowser()) {
    return null;
  }

  try {
    let shell =
      getById(DOM_IDS.appShell);

    if (!shell) {
      shell =
        createElement("div", {
          id:
            DOM_IDS.appShell,
          className:
            "app-shell",
          dataset: {
            appShell:
              "true",
            shell:
              "fatal",
          },
        });

      const mount =
        document.body ||
        document.documentElement;

      mount.appendChild(shell);
    }

    let main =
      getById(DOM_IDS.mainContent);

    if (!main) {
      main =
        createElement("main", {
          id:
            DOM_IDS.mainContent,
          className:
            "main-content",
          attrs: {
            role:
              "main",
          },
          dataset: {
            mainContent:
              "true",
          },
        });

      shell.appendChild(main);
    }

    let view =
      getById(DOM_IDS.viewContainer);

    if (!view) {
      view =
        createElement("div", {
          id:
            DOM_IDS.viewContainer,
          className:
            "view-container",
          dataset: {
            viewContainer:
              "true",
            routerView:
              "true",
            viewRoot:
              "true",
          },
        });

      main.appendChild(view);
    }

    try {
      if (
        AppCore &&
        typeof AppCore === "object"
      ) {
        AppCore.dom =
          AppCore.dom || {};
        AppCore.dom.appShell =
          shell;
        AppCore.dom.mainContent =
          main;
        AppCore.dom.viewContainer =
          view;
      }
    } catch {}

    return view;
  } catch {
    return null;
  }
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
    if (isFunction(getViewContainer)) {
      const container =
        getViewContainer();

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

  return (
    getFallbackViewContainer() ||
    createFallbackViewContainer(AppCore)
  );
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

      addClasses(
        root,
        ERROR_CLASSES
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
        "appReady",
        "false"
      );

      setDataset(
        root,
        "appBooting",
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

      setDataset(
        root,
        "chrome",
        "hidden"
      );

      setDataset(
        root,
        "shell",
        "visible"
      );

      setDataset(
        root,
        "bootError",
        "true"
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

      element.hidden =
        false;

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

    const fatalPatch = {
      loading:
        false,

      booting:
        false,

      loaderVisible:
        false,

      ready:
        false,

      appReady:
        false,

      booted:
        false,

      appFatal:
        true,

      fatal:
        true,

      fatalAt:
        snapshot.at || safeIsoDate(),

      bootPhase:
        "fatal",

      lastBootError:
        snapshot,
    };

    try {
      AppCore?.setState?.(
        fatalPatch,
        {
          source:
            "app:errors:fatal-dom",

          emit:
            false,

          silent:
            true,
        }
      );
    } catch {}

    try {
      AppCore?.patchState?.(
        fatalPatch,
        {
          source:
            "app:errors:fatal-dom",

          emit:
            false,

          silent:
            true,
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
          fatalPatch
        );
      }
    } catch {}

    return true;
  } catch {}

  return false;
}

/* =========================================================
   ERROR SCREEN MARKUP
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

function createBootErrorDetails(snapshot = {}) {
  const raw =
    safeText(snapshot.rawMessage, "");

  const stack =
    safeText(snapshot.stack, "");

  if (
    !raw &&
    !stack
  ) {
    return null;
  }

  if (
    raw &&
    raw === snapshot.message &&
    !stack
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
    createElement("pre", {
      className:
        "boot-error-card__pre",
    });

  pre.textContent =
    [
      raw ? `Mensaje: ${raw}` : "",
      snapshot.kind ? `Tipo: ${snapshot.kind}` : "",
      snapshot.url ? `URL: ${snapshot.url}` : "",
      snapshot.line ? `Línea: ${snapshot.line}` : "",
      snapshot.column ? `Columna: ${snapshot.column}` : "",
      stack ? `Stack:\n${stack}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  appendAll(
    details,
    [
      summary,
      pre,
    ]
  );

  return details;
}

function buildBootErrorNode(snapshot = {}) {
  const section =
    createElement("section", {
      className:
        "content-wrapper boot-error-view",
      attrs: {
        "aria-labelledby":
          "boot-error-title",
      },
      dataset:
        BOOT_ERROR_VIEW_DATASET,
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
        "Tipo:",
        snapshot.kind || "runtime"
      ),

      createBootErrorMetaRow(
        "Fecha:",
        snapshot.at || safeIsoDate()
      ),
    ]
  );

  const details =
    createBootErrorDetails(snapshot);

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

  const rebootButton =
    createBootErrorButton({
      action:
        ERROR_ACTIONS.reboot,
      text:
        "Reiniciar app",
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
      rebootButton,
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
    rebootButton,
    resetButton,
    loginButton,
  };
}

/* =========================================================
   BOOT ERROR RENDER
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

  exposeDebugApi(AppCore);

  const container =
    resolveViewContainer(
      AppCore,
      getViewContainer
    );

  /*
    Orden intencionado:
    1. Cortar loader.
    2. Ocultar chrome.
    3. Reafirmar fatal DOM state al final para que shell.js no rebaje routeMode.
  */
  safeHideLoader(
    hideLoader,
    AppCore,
    "boot-error"
  );

  safeSetShellVisibility(
    setShellVisibility,
    AppCore,
    false
  );

  markFatalDomState(
    AppCore,
    snapshot
  );

  safeSetDocumentTitle(
    AppCore,
    "Error de inicio"
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

  errorState.rendering =
    true;

  try {
    safeClearViewContainer(
      AppCore,
      container
    );

    const {
      root,
      retryButton,
      rebootButton,
      resetButton,
      loginButton,
    } =
      buildBootErrorNode(snapshot);

    container.appendChild(root);

    setAttribute(
      container,
      "aria-busy",
      "false"
    );

    setAttribute(
      container,
      "aria-hidden",
      "false"
    );

    setDataset(
      container,
      "viewState",
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

    if (rebootButton) {
      rebootButton.addEventListener(
        "click",
        () => {
          safeEmit(
            AppCore,
            ERROR_EVENTS.recover,
            {
              action:
                ERROR_ACTIONS.reboot,
              error:
                snapshot,
            }
          );

          if (!safeRebootApp(AppCore)) {
            safeReload();
          }
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
    errorState.rendering =
      false;
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
    getRawErrorMessage(
      error,
      ""
    );

  if (!message) {
    return false;
  }

  return IGNORED_ERROR_PATTERNS.some((pattern) => {
    try {
      return pattern.test(message);
    } catch {
      return false;
    }
  });
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

function emitTelemetry(AppCore, snapshot = {}) {
  if (shouldThrottleTelemetry(snapshot)) {
    return false;
  }

  return safeEmit(
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

  errorState.handling =
    true;

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

    if (snapshot.kind === "resource") {
      safeEmit(
        AppCore,
        ERROR_EVENTS.resource,
        snapshot
      );
    }

    if (snapshot.kind === "promise") {
      safeEmit(
        AppCore,
        ERROR_EVENTS.promise,
        snapshot
      );
    }

    safeEmit(
      AppCore,
      ERROR_EVENTS.runtime,
      snapshot
    );

    emitTelemetry(
      AppCore,
      snapshot
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
    errorState.handling =
      false;
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

function bindWindowEvent(target, eventName, handler, options) {
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

function normalizeDisposer(candidate) {
  if (isFunction(candidate)) {
    return candidate;
  }

  if (isFunction(candidate?.dispose)) {
    return () => {
      try {
        candidate.dispose();
      } catch {}
    };
  }

  if (isFunction(candidate?.off)) {
    return () => {
      try {
        candidate.off();
      } catch {}
    };
  }

  if (isFunction(candidate?.remove)) {
    return () => {
      try {
        candidate.remove();
      } catch {}
    };
  }

  return null;
}

function bindWithCleanup({
  AppCore,
  scope,
  target,
  eventName,
  handler,
  options,
}) {
  /*
    Listener directo primero:
    - funciona aunque AppCore esté parcial;
    - permite capturar resource errors con capture=true;
    - unbind propio y explícito.
  */
  if (
    bindWindowEvent(
      target,
      eventName,
      handler,
      options
    )
  ) {
    return true;
  }

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

      const disposer =
        normalizeDisposer(off);

      if (disposer) {
        rememberDisposer(disposer);
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

        const disposer =
          normalizeDisposer(off);

        if (disposer) {
          rememberDisposer(disposer);
        }

        return true;
      } catch {}
    }
  }

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

  bindingInFlight =
    true;

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
    bindingInFlight =
      false;
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

  handlersBound =
    false;

  bindingInFlight =
    false;

  boundScope =
    "";

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

    report:
      (error, options = {}) =>
        reportAppError({
          AppCore,
          error,
          ...ensureObject(options),
        }),

    renderBootError:
      (error = null, options = {}) =>
        renderBootError({
          AppCore,
          error,
          ...ensureObject(options),
        }),

    clearAuthSession:
      (Auth = null) =>
        clearAuthSession(
          Auth,
          AppCore
        ),

    bind:
      (options = {}) =>
        bindGlobalErrorHandlers({
          AppCore,
          ...ensureObject(options),
        }),

    unbind:
      () =>
        unbindGlobalErrorHandlers(AppCore),
  };

  try {
    window.__ONION_APP_ERRORS__ =
      api;
  } catch {}

  try {
    safeDefineValue(
      AppCore,
      "Errors",
      api
    );
  } catch {}

  if (!debugApiInstalled) {
    debugApiInstalled =
      true;

    safeEmit(
      AppCore,
      ERROR_EVENTS.debugApi,
      {
        version:
          APP_ERRORS_VERSION,

        installed:
          true,
      }
    );
  }

  return true;
}

/* =========================================================
   SNAPSHOT / RESET
========================================================= */

export function getErrorStateSnapshot() {
  return sanitizeValue({
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

    lastTelemetryKey:
      redactTokenInText(errorState.lastTelemetryKey),

    lastTelemetryAt:
      errorState.lastTelemetryAt,

    lastTelemetryAtIso:
      errorState.lastTelemetryAt
        ? safeIsoDate(errorState.lastTelemetryAt)
        : "",

    recent:
      errorState.recent.map((item) => ({
        index:
          item.index,

        source:
          item.source,

        kind:
          item.kind,

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

        line:
          item.line,

        column:
          item.column,

        hasStack:
          Boolean(item.hasStack),

        at:
          item.at,
      })),
  });
}

export function resetErrorState() {
  errorState.lastToastKey =
    "";

  errorState.lastToastAt =
    0;

  errorState.lastRenderKey =
    "";

  errorState.lastRenderAt =
    0;

  errorState.lastTelemetryKey =
    "";

  errorState.lastTelemetryAt =
    0;

  errorState.handling =
    false;

  errorState.rendering =
    false;

  errorState.total =
    0;

  errorState.recent =
    [];

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

  getErrorStateSnapshot,
  resetErrorState,

  redactTokenInText,
};

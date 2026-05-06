/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   ONION SUPPORT · APP ERRORS
   BOOT ERROR UX · GLOBAL ERROR GUARD · TELEMETRY · RECOVERY · EXTREME 10/10

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
   - Sin throws accidentales.
   - safeEmit usa bus interno o window, no ambos.
   - Boot error debe funcionar aunque falten Router/Auth/Toast/AppCore.
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
const VIEW_CONTAINER_SELECTOR = "#view-container";

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
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
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

  const text = String(value).trim();

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
  const object = ensureObject(target);

  return safeInvoke(
    object?.[methodName],
    object,
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
        configurable: true,
        enumerable: false,
        writable: true,
      }
    );

    return true;
  } catch {}

  return false;
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
  const text = safeText(value, "");

  try {
    if (isFunction(escapeHtml)) {
      const result =
        escapeHtml.length >= 2
          ? escapeHtml(AppCore, text)
          : escapeHtml(text);

      const clean = safeText(result, "");

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
        detail: payload,
      })
    );

    return true;
  } catch {}

  return false;
}

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const cleanEventName = safeText(eventName, "");

  if (!cleanEventName) {
    return false;
  }

  const opts = ensureObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(cleanEventName, payload);
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
    return safeWindowDispatch(cleanEventName, payload) || busEmitted;
  }

  return busEmitted;
}

function safeSetError(AppCore, snapshot = null) {
  const payload = {
    hasError: Boolean(snapshot),
    lastError: snapshot,
  };

  try {
    AppCore?.setError?.(snapshot);
  } catch {}

  safeMethod(AppCore, "setState", [payload]);
  safeMethod(AppCore, "patchState", [payload]);

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(AppCore.state, payload);
    }
  } catch {}
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
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
  const candidate = extractErrorCandidate(error);

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
  const candidate = extractErrorCandidate(error);

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
  const candidate = extractErrorCandidate(error);

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
  const candidate = extractErrorCandidate(error);

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
  const candidate = extractErrorCandidate(error);

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
  const message = redactTokenInText(
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

  return message;
}

export function resolveErrorMessage(error = null, fallback = FALLBACK_ERROR_MESSAGE) {
  const raw = getRawErrorMessage(error, fallback);

  return getFriendlyErrorMessage(raw, fallback);
}

export function createErrorSnapshot({
  source = "runtime",
  error = null,
  severity = "error",
  boot = false,
  handled = false,
} = {}) {
  const atMs = now();

  const rawMessage = getRawErrorMessage(
    error,
    boot
      ? FALLBACK_BOOT_ERROR_MESSAGE
      : FALLBACK_ERROR_MESSAGE
  );

  const message = getFriendlyErrorMessage(
    rawMessage,
    boot
      ? FALLBACK_BOOT_ERROR_MESSAGE
      : FALLBACK_ERROR_MESSAGE
  );

  const stack = getErrorStack(error);

  return {
    source: safeText(source, "runtime"),
    severity: safeText(severity, "error"),

    boot: Boolean(boot),
    handled: Boolean(handled),

    name: getErrorName(error),
    code: getErrorCode(error),

    message: redactTokenInText(message),
    rawMessage: redactTokenInText(rawMessage),

    url: getErrorUrl(error),

    stack,
    hasStack: Boolean(stack),

    at: safeIsoDate(atMs),
    atMs,
  };
}

function pushRecentError(snapshot = {}) {
  errorState.total += 1;

  errorState.recent.unshift({
    ...snapshot,
    index: errorState.total,
  });

  if (errorState.recent.length > MAX_RECENT_ERRORS) {
    errorState.recent = errorState.recent.slice(0, MAX_RECENT_ERRORS);
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
    .map((item) => safeText(item, ""))
    .join("|");
}

function shouldThrottleToast(snapshot = {}) {
  const key = getThrottleKey(snapshot);
  const time = now();

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
  const key = getThrottleKey(snapshot);
  const time = now();

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
  const cleanMessage = redactTokenInText(
    safeText(message, FALLBACK_ERROR_MESSAGE)
  );

  const payload = {
    title: safeText(options.title, "Error"),

    duration:
      Number.isFinite(Number(options.duration))
        ? Number(options.duration)
        : 5000,

    ...ensureObject(options),

    type: "error",
    message: cleanMessage,
  };

  try {
    if (isFunction(Toast?.error)) {
      return Toast.error(cleanMessage, payload);
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

  const target = safeText(path, LOGIN_PATH);

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

  try {
    if (container) {
      container.innerHTML = "";
    }
  } catch {}
}

function clearAuthSession(Auth, AppCore) {
  let cleared = false;

  try {
    Auth?.clearSessionLocal?.({
      silent: true,
      reason: "boot-error-recovery",
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
      silent: true,
      reason: "boot-error-recovery",
    });

    cleared = true;
  } catch {}

  try {
    AppCore?.clearSession?.({
      silent: true,
      reason: "boot-error-recovery",
    });

    cleared = true;
  } catch {}

  try {
    AppCore?.setState?.({
      authenticated: false,
      user: null,
      token: null,
    });

    cleared = true;
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.authenticated = false;
      AppCore.state.user = null;
      AppCore.state.token = null;
      cleared = true;
    }
  } catch {}

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
        minVisibleMs: 0,
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
      document.getElementById("app-loader") ||
      document.querySelector("[data-app-loader='true'],.app-loader");

    if (!loader) {
      return false;
    }

    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";
    loader.classList.remove("is-visible", "is-leaving", "is-entering");
    loader.classList.add("is-hidden", "has-hidden");

    return true;
  } catch {}

  return false;
}

function safeSetShellVisibility(setShellVisibility, AppCore, visible = false) {
  try {
    setShellVisibility?.(AppCore, visible);
    return true;
  } catch {}

  return false;
}

function getFallbackViewContainer() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.querySelector(VIEW_CONTAINER_SELECTOR);
  } catch {}

  return null;
}

function resolveViewContainer(AppCore, getViewContainer) {
  try {
    if (isFunction(getViewContainer)) {
      const container = getViewContainer(AppCore);

      if (container) {
        return container;
      }
    }
  } catch {}

  return getFallbackViewContainer();
}

/* =========================================================
   ERROR SCREEN MARKUP
========================================================= */

function buildBootErrorHtml(AppCore, snapshot = {}) {
  const escapedMessage = safeEscapeHtml(AppCore, snapshot.message);

  const escapedRawMessage =
    snapshot.rawMessage &&
    snapshot.rawMessage !== snapshot.message
      ? safeEscapeHtml(AppCore, snapshot.rawMessage)
      : "";

  const escapedCode = safeEscapeHtml(
    AppCore,
    snapshot.code || snapshot.name || "BOOT_ERROR"
  );

  const escapedAt = safeEscapeHtml(AppCore, snapshot.at);

  return `
    <section
      class="content-wrapper boot-error-view"
      data-view="boot-error"
      data-boot-error-view="true"
      aria-labelledby="boot-error-title"
    >
      <div class="panel-block boot-error-card" data-boot-error-card="true">
        <div class="boot-error-card__inner">
          <div
            class="boot-error-card__icon"
            aria-hidden="true"
          >
            !
          </div>

          <div class="boot-error-card__header">
            <p class="boot-error-card__eyebrow">
              Boot failure
            </p>

            <h2
              id="boot-error-title"
              class="boot-error-card__title"
            >
              Error al iniciar la aplicación
            </h2>

            <p class="boot-error-card__message">
              ${escapedMessage}
            </p>
          </div>

          <div class="boot-error-card__meta" data-boot-error-meta="true">
            <div class="boot-error-card__meta-row">
              <strong>Código:</strong>
              <span>${escapedCode}</span>
            </div>

            <div class="boot-error-card__meta-row">
              <strong>Fecha:</strong>
              <span>${escapedAt}</span>
            </div>

            ${
              escapedRawMessage
                ? `
                  <details class="boot-error-card__details">
                    <summary>Detalle técnico</summary>
                    <pre>${escapedRawMessage}</pre>
                  </details>
                `
                : ""
            }
          </div>

          <div class="boot-error-card__actions">
            <button
              type="button"
              class="ui-btn ui-btn-primary"
              data-boot-error-action="${ERROR_ACTIONS.retry}"
            >
              Reintentar
            </button>

            <button
              type="button"
              class="ui-btn ui-btn-secondary"
              data-boot-error-action="${ERROR_ACTIONS.resetSession}"
            >
              Limpiar sesión
            </button>

            <button
              type="button"
              class="ui-btn ui-btn-secondary"
              data-boot-error-action="${ERROR_ACTIONS.goLogin}"
            >
              Ir al login
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
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
  const snapshot = createErrorSnapshot({
    source: "boot",
    error,
    severity: "critical",
    boot: true,
    handled: true,
  });

  pushRecentError(snapshot);
  safeSetError(AppCore, snapshot);

  safeEmit(AppCore, ERROR_EVENTS.bootError, snapshot);
  safeEmit(AppCore, ERROR_EVENTS.render, snapshot);

  const container = resolveViewContainer(
    AppCore,
    getViewContainer
  );

  if (!container) {
    safeError(
      AppCore,
      "renderBootError(): contenedor no disponible.",
      snapshot
    );

    safeHideLoader(
      hideLoader,
      AppCore,
      "boot-error:no-container"
    );

    if (!shouldThrottleToast(snapshot)) {
      safeToastError(
        Toast,
        snapshot.message,
        {
          title: "Error de arranque",
          duration: 6000,
        }
      );
    }

    return false;
  }

  if (shouldThrottleRender(snapshot)) {
    return true;
  }

  safeSetDocumentTitle(AppCore, "Error de inicio");

  safeClearViewContainer(AppCore, container);

  /*
    setShellVisibility(false) debe ocultar chrome, no destruir #app-shell.
  */
  safeSetShellVisibility(
    setShellVisibility,
    AppCore,
    false
  );

  safeHideLoader(
    hideLoader,
    AppCore,
    "boot-error"
  );

  try {
    container.innerHTML = buildBootErrorHtml(AppCore, snapshot);
    container.removeAttribute("aria-busy");
    container.setAttribute("data-view-state", "boot-error");
  } catch (renderError) {
    safeError(
      AppCore,
      "No se pudo pintar la pantalla de error de boot.",
      renderError
    );

    return false;
  }

  const retryBtn = container.querySelector?.(
    `[data-boot-error-action="${ERROR_ACTIONS.retry}"]`
  );

  const resetBtn = container.querySelector?.(
    `[data-boot-error-action="${ERROR_ACTIONS.resetSession}"]`
  );

  const loginBtn = container.querySelector?.(
    `[data-boot-error-action="${ERROR_ACTIONS.goLogin}"]`
  );

  if (retryBtn) {
    retryBtn.addEventListener(
      "click",
      () => {
        safeEmit(
          AppCore,
          ERROR_EVENTS.recover,
          {
            action: ERROR_ACTIONS.retry,
            error: snapshot,
          }
        );

        safeReload();
      },
      {
        once: true,
      }
    );
  }

  if (resetBtn) {
    resetBtn.addEventListener(
      "click",
      () => {
        safeEmit(
          AppCore,
          ERROR_EVENTS.recover,
          {
            action: ERROR_ACTIONS.resetSession,
            error: snapshot,
          }
        );

        clearAuthSession(Auth, AppCore);
        safeRedirect(LOGIN_PATH);
      },
      {
        once: true,
      }
    );
  }

  if (loginBtn) {
    loginBtn.addEventListener(
      "click",
      () => {
        safeEmit(
          AppCore,
          ERROR_EVENTS.recover,
          {
            action: ERROR_ACTIONS.goLogin,
            error: snapshot,
          }
        );

        safeRedirect(LOGIN_PATH);
      },
      {
        once: true,
      }
    );
  }

  try {
    retryBtn?.focus?.();
  } catch {}

  if (!shouldThrottleToast(snapshot)) {
    safeToastError(
      Toast,
      snapshot.message,
      {
        title: "Error de arranque",
        duration: 6000,
      }
    );
  }

  return true;
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
  const target = event?.target || {};

  const tagName = safeText(
    target.tagName,
    "resource"
  ).toLowerCase();

  const url = redactTokenInText(
    safeText(
      target.src ||
        target.href,
      ""
    )
  );

  return {
    name: "ResourceLoadError",
    message: `No se pudo cargar el recurso ${tagName}${url ? `: ${url}` : "."}`,
    url,
    target,
  };
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

  errorState.handling = true;

  try {
    const snapshot = createErrorSnapshot({
      source,
      error,
      severity,
      boot: false,
      handled: true,
    });

    pushRecentError(snapshot);
    safeSetError(AppCore, snapshot);

    safeError(AppCore, source, snapshot);

    safeEmit(AppCore, ERROR_EVENTS.appError, snapshot);

    safeEmit(
      AppCore,
      ERROR_EVENTS.telemetry,
      {
        ...snapshot,
        recentCount: errorState.recent.length,
        total: errorState.total,
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

          duration: 5000,
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
  const cleanup = AppCore?.cleanup;

  if (
    cleanup &&
    isFunction(cleanup.event)
  ) {
    try {
      const off = cleanup.event(
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
        const off = cleanup.event(
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

  const finalScope = safeText(
    scope,
    DEFAULT_ERROR_SCOPE
  );

  const onError = (event) => {
    if (isResourceErrorEvent(event)) {
      const resourceError = normalizeResourceError(event);

      processRuntimeError({
        AppCore,
        Toast,
        source: "window.resource-error",
        error: resourceError,
        severity: "warning",
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
        name: "WindowError",
        message: event?.message || "Error global no controlado",
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      };

    processRuntimeError({
      AppCore,
      Toast,
      source: "window.error",
      error,
      severity: "error",
      toast: true,
    });
  };

  const onReject = (event) => {
    const reason =
      event?.reason || {
        name: "UnhandledRejection",
        message: "Promise rechazada sin control",
      };

    processRuntimeError({
      AppCore,
      Toast,
      source: "unhandledrejection",
      error: reason,
      severity: "error",
      toast: true,
    });
  };

  try {
    const okError = bindWithCleanup({
      AppCore,
      scope: finalScope,
      target: window,
      eventName: "error",
      handler: onError,
      options: true,
    });

    const okReject = bindWithCleanup({
      AppCore,
      scope: finalScope,
      target: window,
      eventName: "unhandledrejection",
      handler: onReject,
      options: false,
    });

    handlersBound = Boolean(okError || okReject);
    boundScope = handlersBound ? finalScope : "";

    if (handlersBound) {
      exposeDebugApi(AppCore);

      safeEmit(
        AppCore,
        ERROR_EVENTS.handlersBound,
        {
          scope: boundScope,
          at: safeIsoDate(),
        }
      );

      safeLog(
        AppCore,
        "Global error handlers activos.",
        {
          scope: boundScope,
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
      at: safeIsoDate(),
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
    safeDefineValue(AppCore, "Errors", api);
  } catch {}

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getErrorStateSnapshot() {
  return {
    handlersBound: Boolean(handlersBound),
    bindingInFlight: Boolean(bindingInFlight),

    boundScope,

    boundListeners: boundListeners.length,
    boundDisposers: boundDisposers.length,

    handling: Boolean(errorState.handling),

    total: errorState.total,

    lastToastKey: errorState.lastToastKey,
    lastToastAt: errorState.lastToastAt,
    lastToastAtIso:
      errorState.lastToastAt
        ? safeIsoDate(errorState.lastToastAt)
        : "",

    lastRenderKey: errorState.lastRenderKey,
    lastRenderAt: errorState.lastRenderAt,
    lastRenderAtIso:
      errorState.lastRenderAt
        ? safeIsoDate(errorState.lastRenderAt)
        : "",

    recent:
      errorState.recent.map((item) => ({
        index: item.index,
        source: item.source,
        severity: item.severity,
        boot: Boolean(item.boot),
        handled: Boolean(item.handled),
        name: item.name,
        code: item.code,
        message: item.message,
        url: item.url,
        hasStack: Boolean(item.hasStack),
        at: item.at,
      })),
  };
}

export function resetErrorState() {
  errorState.lastToastKey = "";
  errorState.lastToastAt = 0;

  errorState.lastRenderKey = "";
  errorState.lastRenderAt = 0;

  errorState.handling = false;

  errorState.total = 0;
  errorState.recent = [];

  return getErrorStateSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  renderBootError,

  bindGlobalErrorHandlers,
  unbindGlobalErrorHandlers,

  resolveErrorMessage,
  createErrorSnapshot,

  getErrorStateSnapshot,
  resetErrorState,
};

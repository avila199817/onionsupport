/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   RESPONSABILIDADES:
   - renderizar pantalla de error de boot
   - bind de errores globales window.error
   - bind de promesas rechazadas sin control
   - notificar errores críticos con Toast
   - emitir telemetría interna de errores
   - evitar loops recursivos de error
   - ofrecer recuperación UX enterprise

   HARDENING NIVEL DIOS:
   - listeners idempotentes
   - throttling visual de errores repetidos
   - sanitizado robusto mensajes
   - redacción de tokens en URLs/mensajes
   - fallback total si faltan módulos
   - cero loops recursivos de error
   - telemetría interna por eventos
   - recovery UX enterprise
   - no duplicar binds
   - no reventar si falta cleanup
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

const ERROR_THROTTLE_MS =
  2500;

const MAX_RECENT_ERRORS =
  12;

const BOOT_ERROR_RENDER_EVENT =
  "app:boot:error:render";

const APP_ERROR_EVENT =
  "app:error";

const APP_ERROR_TELEMETRY_EVENT =
  "app:error:telemetry";

const APP_ERROR_RECOVER_EVENT =
  "app:error:recover";

const FALLBACK_ERROR_MESSAGE =
  "Se produjo un error inesperado.";

const FALLBACK_BOOT_ERROR_MESSAGE =
  "No se pudo iniciar la aplicación correctamente.";

const LOGIN_PATH =
  "/login";

const VIEW_CONTAINER_SELECTOR =
  "#view-container";

const ERROR_ACTIONS =
  Object.freeze({
    retry:
      "retry",

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
    "resetToken",
    "passwordResetToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
  ]);

/* =========================================================
   INTERNAL STATE
========================================================= */

let handlersBound = false;
let boundScope = "";

const boundListeners = [];

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
  return Date.now();
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
    typeof value === "object"
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
  const object =
    ensureObject(target);

  return safeInvoke(
    object?.[methodName],
    object,
    args
  );
}

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
    AppCore?.utils?.log?.(
      "[AppErrors]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AppErrors]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AppErrors]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(
      "[AppErrors]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[AppErrors]",
      ...args
    );
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

function safeEmit(AppCore, eventName, payload = {}) {
  if (!eventName) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    emitted = true;
  } catch {}

  if (
    safeWindowDispatch(
      eventName,
      payload
    )
  ) {
    emitted = true;
  }

  return emitted;
}

function safeSetError(AppCore, snapshot = null) {
  try {
    AppCore?.setError?.(
      snapshot
    );
  } catch {}

  try {
    AppCore?.setState?.({
      hasError:
        Boolean(snapshot),

      lastError:
        snapshot,
    });
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.hasError =
        Boolean(snapshot);

      AppCore.state.lastError =
        snapshot;
    }
  } catch {}
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

  if (!candidate || typeof candidate === "string") {
    return "";
  }

  return (
    safeText(candidate?.code, "") ||
    safeText(candidate?.status, "") ||
    safeText(candidate?.statusCode, "") ||
    safeText(candidate?.data?.code, "") ||
    safeText(candidate?.data?.status, "") ||
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
    safeText(
      candidate?.stack,
      ""
    )
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
    /chunkloaderror/i.test(message)
  ) {
    return "No se pudo cargar un módulo de la aplicación. Recarga la página para volver a sincronizar los archivos.";
  }

  if (
    /networkerror/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /load failed/i.test(message) ||
    /network request failed/i.test(message)
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
    time - errorState.lastRenderAt < ERROR_THROTTLE_MS
  ) {
    return true;
  }

  errorState.lastRenderKey =
    key;

  errorState.lastRenderAt =
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
      safeText(
        options.title,
        "Error"
      ),

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
    AppCore?.clearSession?.({
      silent:
        true,

      reason:
        "boot-error-recovery",
    });

    cleared = true;
  } catch {}

  return cleared;
}

function safeSetDocumentTitle(AppCore, title = "Error de inicio") {
  try {
    AppCore?.setDocumentTitle?.(
      title
    );
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
      }
    );

    return true;
  } catch {}

  try {
    hideLoader?.(
      AppCore
    );

    return true;
  } catch {}

  return false;
}

function safeSetShellVisibility(setShellVisibility, AppCore, visible = false) {
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

  try {
    return document.querySelector(
      VIEW_CONTAINER_SELECTOR
    );
  } catch {}

  return null;
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

  return getFallbackViewContainer();
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

  safeSetError(
    AppCore,
    snapshot
  );

  safeEmit(
    AppCore,
    APP_EVENTS?.bootError || "app:boot:error",
    snapshot
  );

  safeEmit(
    AppCore,
    BOOT_ERROR_RENDER_EVENT,
    snapshot
  );

  const container =
    resolveViewContainer(
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
          title:
            "Error de arranque",

          duration:
            6000,
        }
      );
    }

    return false;
  }

  if (
    shouldThrottleRender(snapshot)
  ) {
    return true;
  }

  safeSetDocumentTitle(
    AppCore,
    "Error de inicio"
  );

  safeClearViewContainer(
    AppCore,
    container
  );

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

  const escapedMessage =
    safeEscapeHtml(
      AppCore,
      snapshot.message
    );

  const escapedRawMessage =
    snapshot.rawMessage &&
    snapshot.rawMessage !== snapshot.message
      ? safeEscapeHtml(
          AppCore,
          snapshot.rawMessage
        )
      : "";

  const escapedCode =
    safeEscapeHtml(
      AppCore,
      snapshot.code || snapshot.name || "BOOT_ERROR"
    );

  const escapedAt =
    safeEscapeHtml(
      AppCore,
      snapshot.at
    );

  try {
    container.innerHTML = `
      <section class="content-wrapper boot-error-view" data-view="boot-error">
        <div class="panel-block boot-error-card" style="padding:24px;">
          <div style="display:grid;gap:18px;max-width:780px;">
            <div
              aria-hidden="true"
              style="
                width:56px;
                height:56px;
                border-radius:16px;
                display:grid;
                place-items:center;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(255,255,255,.04);
                font-size:28px;
              "
            >
              ⚠️
            </div>

            <div style="display:grid;gap:8px;">
              <p
                style="
                  margin:0;
                  color:var(--accent, #60a5fa);
                  font-size:13px;
                  font-weight:700;
                  letter-spacing:.08em;
                  text-transform:uppercase;
                "
              >
                Boot failure
              </p>

              <h2 style="margin:0;">
                Error al iniciar la aplicación
              </h2>

              <p style="margin:0;color:var(--text-dim);line-height:1.6;">
                ${escapedMessage}
              </p>
            </div>

            <div
              style="
                display:grid;
                gap:8px;
                padding:14px;
                border-radius:14px;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(255,255,255,.03);
                color:var(--text-dim);
                font-size:13px;
              "
            >
              <div>
                <strong style="color:var(--text-main);">Código:</strong>
                ${escapedCode}
              </div>

              <div>
                <strong style="color:var(--text-main);">Fecha:</strong>
                ${escapedAt}
              </div>

              ${
                escapedRawMessage
                  ? `
                    <details style="margin-top:4px;">
                      <summary style="cursor:pointer;color:var(--text-main);">
                        Detalle técnico
                      </summary>
                      <pre
                        style="
                          white-space:pre-wrap;
                          margin:10px 0 0;
                          overflow:auto;
                          color:var(--text-dim);
                          font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
                          font-size:12px;
                        "
                      >${escapedRawMessage}</pre>
                    </details>
                  `
                  : ""
              }
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap;">
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
  } catch (renderError) {
    safeError(
      AppCore,
      "No se pudo pintar la pantalla de error de boot.",
      renderError
    );

    return false;
  }

  const retryBtn =
    container.querySelector?.(
      `[data-boot-error-action="${ERROR_ACTIONS.retry}"]`
    );

  const resetBtn =
    container.querySelector?.(
      `[data-boot-error-action="${ERROR_ACTIONS.resetSession}"]`
    );

  const loginBtn =
    container.querySelector?.(
      `[data-boot-error-action="${ERROR_ACTIONS.goLogin}"]`
    );

  if (retryBtn) {
    retryBtn.addEventListener(
      "click",
      () => {
        safeEmit(
          AppCore,
          APP_ERROR_RECOVER_EVENT,
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

  if (resetBtn) {
    resetBtn.addEventListener(
      "click",
      () => {
        safeEmit(
          AppCore,
          APP_ERROR_RECOVER_EVENT,
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

        safeRedirect(
          LOGIN_PATH
        );
      },
      {
        once:
          true,
      }
    );
  }

  if (loginBtn) {
    loginBtn.addEventListener(
      "click",
      () => {
        safeEmit(
          AppCore,
          APP_ERROR_RECOVER_EVENT,
          {
            action:
              ERROR_ACTIONS.goLogin,

            error:
              snapshot,
          }
        );

        safeRedirect(
          LOGIN_PATH
        );
      },
      {
        once:
          true,
      }
    );
  }

  if (
    !shouldThrottleToast(snapshot)
  ) {
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

    safeSetError(
      AppCore,
      snapshot
    );

    safeError(
      AppCore,
      source,
      snapshot
    );

    safeEmit(
      AppCore,
      APP_ERROR_EVENT,
      snapshot
    );

    safeEmit(
      AppCore,
      APP_ERROR_TELEMETRY_EVENT,
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
      cleanup.event(
        scope,
        target,
        eventName,
        handler,
        options
      );

      return true;
    } catch {
      try {
        cleanup.event(
          scope,
          target,
          eventName,
          handler
        );

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

  if (!isBrowser()) {
    return false;
  }

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
          event?.message ||
          "Error global no controlado",

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
}

export function unbindGlobalErrorHandlers(AppCore = null) {
  if (!handlersBound) {
    return true;
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

  boundScope =
    "";

  safeLog(
    AppCore,
    "Global error handlers desactivados."
  );

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getErrorStateSnapshot() {
  return {
    handlersBound:
      Boolean(handlersBound),

    boundScope,

    handling:
      Boolean(errorState.handling),

    total:
      errorState.total,

    recent:
      errorState.recent.map((item) => ({
        index:
          item.index,

        source:
          item.source,

        severity:
          item.severity,

        name:
          item.name,

        code:
          item.code,

        message:
          item.message,

        url:
          item.url,

        at:
          item.at,
      })),
  };
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

  errorState.handling =
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
  renderBootError,

  bindGlobalErrorHandlers,
  unbindGlobalErrorHandlers,

  resolveErrorMessage,
  createErrorSnapshot,

  getErrorStateSnapshot,
  resetErrorState,
};

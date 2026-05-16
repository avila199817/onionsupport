/* =========================================================
   Onion SPA - Entry Point
   Archivo: /src/main.js

   Responsabilidad única:
   - Ser el único entrypoint físico cargado por index.html.
   - Capturar URL inicial.
   - Bloquear auto-boot legacy.
   - Cargar /src/app/index.js.
   - Ejecutar App.boot() una sola vez.
   - Capturar error fatal de arranque.
   - No meter auth/router/API/store/vistas.
========================================================= */

const MAIN_VERSION = "v2-fast-main";
const APP_MODULE_PATH = "./app/index.js";

const BOOT_LOCK_KEY = "__ONION_MAIN_BOOT_LOCK__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";

const FATAL_ERROR_KEY = "__ONION_FATAL_ERROR__";
const MAIN_DEBUG_KEY = "__ONION_MAIN__";

const DEFAULT_ERROR_TITLE = "Error de arranque";
const DEFAULT_ERROR_MESSAGE = "No se pudo iniciar Onion Support.";

let appModule = null;
let appModulePromise = null;
let bootPromise = null;

let startedAt = 0;
let failed = false;
let errorsBound = false;

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function currentHref() {
  if (!isBrowser()) return "";

  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function currentPath() {
  if (!isBrowser()) return "/";

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "/";
  }
}

/* =========================================================
   REDACTION / ERROR
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactUrl(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  const sensitive = [
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "otp",
    "totp",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "mfaToken",
    "mfa_token",
    "twoFactorToken",
    "two_factor_token",
    "authorization",
    "jwt",
    "sid",
  ];

  for (const key of sensitive) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(key)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function serializeError(error) {
  if (!error) {
    return {
      name: "UnknownError",
      message: DEFAULT_ERROR_MESSAGE,
    };
  }

  if (error instanceof Error) {
    return {
      name: safeText(error.name, "Error"),
      message: redactUrl(safeText(error.message, DEFAULT_ERROR_MESSAGE)),
      stack: error.stack ? "[stack]" : "",
      code: error.code || null,
      status: error.status || error.statusCode || null,
    };
  }

  if (typeof error === "string") {
    return {
      name: "ThrownString",
      message: redactUrl(safeText(error, DEFAULT_ERROR_MESSAGE)),
    };
  }

  if (isObject(error)) {
    return {
      name: safeText(error.name, "ObjectError"),
      message: redactUrl(safeText(error.message || error.reason, DEFAULT_ERROR_MESSAGE)),
      code: error.code || null,
      status: error.status || error.statusCode || null,
    };
  }

  return {
    name: "ThrownValue",
    message: redactUrl(String(error)),
  };
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function setDataset(element, key, value) {
  if (!element || !key) return false;

  try {
    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function addClass(element, className) {
  if (!element || !className) return false;

  try {
    element.classList.add(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(element, className) {
  if (!element || !className) return false;

  try {
    element.classList.remove(className);
    return true;
  } catch {
    return false;
  }
}

function markBooting() {
  if (!isBrowser()) return false;

  const html = document.documentElement;
  const body = document.body;

  for (const element of [html, body]) {
    if (!element) continue;

    removeClass(element, "app-ready");
    removeClass(element, "app-fatal");

    addClass(element, "app-booting");
    addClass(element, "app-loading");

    setDataset(element, "appBooting", "true");
    setDataset(element, "appLoading", "true");
    setDataset(element, "appReady", "false");
    setDataset(element, "mainReady", "false");
    setDataset(element, "mainFailed", "false");
  }

  setDataset(html, "appState", "booting");

  return true;
}

function markMainReady() {
  if (!isBrowser()) return false;

  const html = document.documentElement;
  const body = document.body;

  for (const element of [html, body]) {
    if (!element) continue;

    setDataset(element, "mainReady", "true");
    setDataset(element, "mainFailed", "false");
  }

  return true;
}

function markFatal() {
  if (!isBrowser()) return false;

  const html = document.documentElement;
  const body = document.body;

  for (const element of [html, body]) {
    if (!element) continue;

    removeClass(element, "app-booting");
    removeClass(element, "app-loading");
    removeClass(element, "app-ready");

    addClass(element, "app-fatal");

    setDataset(element, "appBooting", "false");
    setDataset(element, "appLoading", "false");
    setDataset(element, "appReady", "false");
    setDataset(element, "mainReady", "false");
    setDataset(element, "mainFailed", "true");
    setDataset(element, "routeMode", "fatal");
  }

  setDataset(html, "appState", "fatal");

  return true;
}

/* =========================================================
   BOOT CONTEXT
========================================================= */

function disableLegacyAutoBoot() {
  if (!isBrowser()) return false;

  try {
    window[DISABLE_AUTO_BOOT_KEY] = true;
    return true;
  } catch {
    return false;
  }
}

function captureBootContext() {
  const context = {
    source: "main",
    version: MAIN_VERSION,
    initialUrl: currentHref(),
    initialPath: currentPath(),
    capturedAt: nowIso(),
  };

  if (!isBrowser()) return context;

  try {
    if (!window[INITIAL_URL_KEY]) {
      window[INITIAL_URL_KEY] = context.initialUrl;
    }

    window[BOOT_CONTEXT_KEY] = {
      ...(isObject(window[BOOT_CONTEXT_KEY]) ? window[BOOT_CONTEXT_KEY] : {}),
      ...context,
    };
  } catch {}

  return context;
}

/* =========================================================
   APP MODULE
========================================================= */

async function loadAppModule() {
  if (appModule) return appModule;

  if (!appModulePromise) {
    appModulePromise = import(APP_MODULE_PATH)
      .then((moduleValue) => {
        appModule = moduleValue;
        return moduleValue;
      })
      .finally(() => {
        appModulePromise = null;
      });
  }

  return appModulePromise;
}

function resolveBootFunction(moduleValue) {
  if (!moduleValue) return null;

  if (isFn(moduleValue.bootApp)) return moduleValue.bootApp;
  if (isFn(moduleValue.boot)) return moduleValue.boot;
  if (isFn(moduleValue.start)) return moduleValue.start;

  if (moduleValue.App && isFn(moduleValue.App.boot)) {
    return moduleValue.App.boot.bind(moduleValue.App);
  }

  if (moduleValue.default && isFn(moduleValue.default.boot)) {
    return moduleValue.default.boot.bind(moduleValue.default);
  }

  if (isFn(moduleValue.default)) {
    return moduleValue.default;
  }

  return null;
}

function exposeLoadedApp(moduleValue, result) {
  if (!isBrowser()) return false;

  try {
    window.OnionApp = window.OnionApp || {};
    window.OnionApp.app = result || moduleValue?.App || moduleValue?.default || null;
    window.OnionApp.module = moduleValue || null;
    window.OnionApp.main = api;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FATAL FALLBACK
========================================================= */

function hideLoaderEmergency() {
  if (!isBrowser()) return false;

  const loader =
    document.getElementById("app-loader") ||
    document.querySelector("[data-app-loader='true']");

  if (!loader) return false;

  try {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.classList.remove("is-visible");
    loader.classList.add("is-hidden");
    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";
    return true;
  } catch {
    return false;
  }
}

function getFatalRoot() {
  if (!isBrowser()) return null;

  return (
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body ||
    null
  );
}

function clearNode(node) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {}

  try {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    return true;
  } catch {
    return false;
  }
}

function createFatalView(error) {
  const data = serializeError(error);

  const section = document.createElement("section");
  section.className = "content-wrapper boot-error-view";
  section.setAttribute("role", "alert");
  section.setAttribute("aria-live", "assertive");

  const card = document.createElement("div");
  card.className = "panel-block boot-error-card";

  const title = document.createElement("h1");
  title.textContent = DEFAULT_ERROR_TITLE;

  const message = document.createElement("p");
  message.textContent = data.message || DEFAULT_ERROR_MESSAGE;

  const hint = document.createElement("p");
  hint.textContent = "Recarga la página. Si el problema persiste, revisa la consola.";

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "ui-btn ui-btn-primary";
  reload.textContent = "Recargar";

  reload.addEventListener("click", () => {
    try {
      window.location.reload();
    } catch {}
  });

  card.appendChild(title);
  card.appendChild(message);
  card.appendChild(hint);
  card.appendChild(reload);

  section.appendChild(card);

  return section;
}

function renderFatal(error) {
  if (!isBrowser()) return false;

  markFatal();
  hideLoaderEmergency();

  const root = getFatalRoot();

  if (!root) return false;

  try {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.setAttribute("aria-busy", "false");
  } catch {}

  clearNode(root);
  root.appendChild(createFatalView(error));

  return true;
}

function handleFatal(error, reason = "boot") {
  failed = true;

  const serialized = serializeError(error);

  if (isBrowser()) {
    try {
      window[FATAL_ERROR_KEY] = {
        reason,
        error: serialized,
        rawError: error,
        at: nowIso(),
      };
    } catch {}
  }

  try {
    console.error("[Onion Main] Fatal boot error:", serialized);
    console.error(error);
  } catch {}

  renderFatal(error);

  return error;
}

/* =========================================================
   SAFETY NET
========================================================= */

function bindGlobalErrors() {
  if (!isBrowser() || errorsBound) return false;

  errorsBound = true;

  try {
    window.addEventListener("error", (event) => {
      try {
        window.__ONION_LAST_WINDOW_ERROR__ = {
          message: event.message || "Window error",
          filename: redactUrl(event.filename || ""),
          lineno: event.lineno || 0,
          colno: event.colno || 0,
          error: serializeError(event.error),
          at: nowIso(),
        };
      } catch {}

      if (!bootPromise || failed) return;

      handleFatal(event.error || event.message, "window.error");
    });
  } catch {}

  try {
    window.addEventListener("unhandledrejection", (event) => {
      try {
        window.__ONION_LAST_REJECTION__ = {
          reason: serializeError(event.reason),
          at: nowIso(),
        };
      } catch {}

      if (!bootPromise || failed) return;

      handleFatal(event.reason, "unhandledrejection");
    });
  } catch {}

  return true;
}

/* =========================================================
   BOOT
========================================================= */

function getExternalBootLock() {
  if (!isBrowser()) return null;

  try {
    const lock = window[BOOT_LOCK_KEY];

    if (lock?.promise && isFn(lock.promise.then)) {
      return lock;
    }
  } catch {}

  return null;
}

function setBootLock(promise) {
  if (!isBrowser() || !promise) return false;

  try {
    window[BOOT_LOCK_KEY] = {
      source: "main",
      version: MAIN_VERSION,
      promise,
      startedAt,
    };

    return true;
  } catch {
    return false;
  }
}

function clearBootLock(promise) {
  if (!isBrowser()) return false;

  try {
    if (window[BOOT_LOCK_KEY]?.promise === promise) {
      delete window[BOOT_LOCK_KEY];
      return true;
    }
  } catch {}

  return false;
}

async function runBoot(options = {}) {
  startedAt = nowMs();
  failed = false;

  disableLegacyAutoBoot();

  const bootContext = captureBootContext();

  markBooting();

  const moduleValue = await loadAppModule();
  const bootFn = resolveBootFunction(moduleValue);

  if (!bootFn) {
    throw new Error("No se encontró función de arranque en src/app/index.js.");
  }

  const result = await bootFn({
    ...safeObject(options),
    source: safeText(options.source, "main"),
    version: MAIN_VERSION,
    bootContext,
    startedAt,
  });

  markMainReady();
  exposeLoadedApp(moduleValue, result);

  return result || moduleValue;
}

function boot(options = {}) {
  const opts = safeObject(options);

  if (bootPromise && opts.force !== true) {
    return bootPromise;
  }

  const externalLock = getExternalBootLock();

  if (externalLock && opts.force !== true) {
    return externalLock.promise;
  }

  const promise = runBoot(opts)
    .catch((error) => {
      handleFatal(error, "boot");
      throw error;
    })
    .finally(() => {
      clearBootLock(promise);

      if (bootPromise === promise) {
        bootPromise = null;
      }
    });

  bootPromise = promise;
  setBootLock(promise);

  return promise;
}

function start(options = {}) {
  bindGlobalErrors();
  return boot(options);
}

/* =========================================================
   DEBUG BRIDGE
========================================================= */

function getState() {
  return {
    version: MAIN_VERSION,

    startedAt,
    startedAtIso: startedAt ? nowIso(startedAt) : "",

    failed,
    hasBootPromise: Boolean(bootPromise),
    appLoaded: Boolean(appModule),

    initialUrl: redactUrl(currentHref()),
    initialPath: redactUrl(currentPath()),
  };
}

const api = {
  version: MAIN_VERSION,
  start,
  boot,
  getState,
};

function exposeDebugBridge() {
  if (!isBrowser()) return false;

  try {
    window.OnionApp = window.OnionApp || {};
    window.OnionApp.main = api;
    window[MAIN_DEBUG_KEY] = api;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   START
========================================================= */

disableLegacyAutoBoot();
captureBootContext();
bindGlobalErrors();
exposeDebugBridge();

start().catch(() => {
  /*
    handleFatal() ya pinta fallback.
  */
});

/* =========================================================
   EXPORTS
========================================================= */

export {
  MAIN_VERSION,
  start,
  boot,
  getState,
};

export default api;

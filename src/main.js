/* =========================================================
   Onion SPA - Entry Point
   Archivo: src/main.js

   MAIN · FINAL SIMPLE
   - Único entrypoint cargado por index.html
   - Captura URL inicial antes del boot
   - Desactiva auto-boot legacy
   - Importa app/index.js
   - Ejecuta App.boot() una sola vez
   - Fallback fatal mínimo si el boot no llega a app/errors.js
   - Sin Auth, Router, Services, Store, Toast, vistas, fetch ni storage
========================================================= */

export const MAIN_VERSION = "20.0.0-final";

const APP_MODULE_PATH = "./app/index.js";

const MAIN_DEBUG_KEY = "__ONION_MAIN__";
const BOOT_LOCK_KEY = "__ONION_MAIN_BOOT_LOCK__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";
const MAIN_BOOT_CONTEXT_KEY = "__ONION_MAIN_BOOT_CONTEXT__";
const FATAL_ERROR_KEY = "__ONION_FATAL_ERROR__";

const DEFAULT_ROUTE = "/";
const DEFAULT_ERROR_TITLE = "Error de arranque";
const DEFAULT_ERROR_MESSAGE = "No se pudo iniciar Onion Support.";

let appModule = null;
let appModulePromise = null;
let bootPromise = null;
let startedAt = 0;
let failed = false;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

function currentHref() {
  if (!isBrowser()) return "";

  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function currentPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;
    return `${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`;
  } catch {
    return DEFAULT_ROUTE;
  }
}

/* =========================================================
   REDACTION / ERROR
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = text(value, "");
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
    "session",
    "sid",
  ];

  for (const key of sensitive) {
    try {
      output = output.replace(new RegExp(`([?&#]${escapeRegExp(key)}=)([^&#\\s]+)`, "gi"), "$1***");
    } catch {}
  }

  try {
    output = output
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function serializeError(error) {
  if (!error) {
    return { name: "UnknownError", message: DEFAULT_ERROR_MESSAGE };
  }

  if (error instanceof Error) {
    return {
      name: text(error.name, "Error"),
      message: redact(text(error.message, DEFAULT_ERROR_MESSAGE)),
      code: error.code || null,
      status: error.status || error.statusCode || null,
      stack: error.stack ? "[stack]" : "",
    };
  }

  if (typeof error === "string") {
    return { name: "ThrownString", message: redact(text(error, DEFAULT_ERROR_MESSAGE)) };
  }

  if (isObject(error)) {
    return {
      name: text(error.name, "ObjectError"),
      message: redact(text(error.message || error.reason, DEFAULT_ERROR_MESSAGE)),
      code: error.code || error.status || error.statusCode || null,
    };
  }

  return { name: "ThrownValue", message: redact(String(error)) };
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
    capturedAt: iso(),
  };

  if (!isBrowser()) return context;

  try {
    if (!window[INITIAL_URL_KEY]) window[INITIAL_URL_KEY] = context.initialUrl;

    window[BOOT_CONTEXT_KEY] = {
      ...object(window[BOOT_CONTEXT_KEY]),
      ...context,
    };

    window[MAIN_BOOT_CONTEXT_KEY] = {
      ...object(window[MAIN_BOOT_CONTEXT_KEY]),
      ...context,
      href: context.initialUrl,
      publicPath: context.initialPath,
      mainInitialUrl: context.initialUrl,
      mainInitialPublicPath: context.initialPath,
    };
  } catch {}

  return context;
}

/* =========================================================
   DOCUMENT MARKERS
========================================================= */

function setData(element, key, value) {
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

  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;

    removeClass(element, "app-ready");
    removeClass(element, "app-fatal");
    addClass(element, "app-booting");
    addClass(element, "app-loading");

    setData(element, "appBooting", "true");
    setData(element, "appLoading", "true");
    setData(element, "appReady", "false");
    setData(element, "mainReady", "false");
    setData(element, "mainFailed", "false");
  }

  setData(document.documentElement, "appState", "booting");
  return true;
}

function markMainReady() {
  if (!isBrowser()) return false;

  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;

    setData(element, "mainReady", "true");
    setData(element, "mainFailed", "false");
  }

  return true;
}

function markFatal() {
  if (!isBrowser()) return false;

  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;

    removeClass(element, "app-booting");
    removeClass(element, "app-loading");
    removeClass(element, "app-ready");
    addClass(element, "app-fatal");

    setData(element, "appBooting", "false");
    setData(element, "appLoading", "false");
    setData(element, "appReady", "false");
    setData(element, "mainReady", "false");
    setData(element, "mainFailed", "true");
    setData(element, "routeMode", "fatal");
  }

  setData(document.documentElement, "appState", "fatal");
  return true;
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
  if (moduleValue.App && isFn(moduleValue.App.boot)) return moduleValue.App.boot.bind(moduleValue.App);
  if (moduleValue.default && isFn(moduleValue.default.boot)) return moduleValue.default.boot.bind(moduleValue.default);
  if (isFn(moduleValue.default)) return moduleValue.default;

  return null;
}

function exposeLoadedApp(moduleValue, result) {
  if (!isBrowser()) return false;

  try {
    window.OnionApp = window.OnionApp || {};
    window.OnionApp.main = api;
    window.OnionApp.module = moduleValue || null;
    window.OnionApp.app = result || moduleValue?.App || moduleValue?.default || null;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FATAL FALLBACK
========================================================= */

function hideLoaderFallback() {
  if (!isBrowser()) return false;

  const loader = document.getElementById("app-loader") || document.querySelector("[data-app-loader],.app-loader");
  if (!loader) return false;

  try {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.classList.remove("is-visible", "is-entering", "is-leaving");
    loader.classList.add("is-hidden", "has-hidden", "loader-hidden");
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

function empty(node) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {}

  try {
    while (node.firstChild) node.removeChild(node.firstChild);
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

  card.append(title, message, hint, reload);
  section.appendChild(card);

  return section;
}

function renderFatal(error) {
  if (!isBrowser()) return false;

  markFatal();
  hideLoaderFallback();

  const root = getFatalRoot();
  if (!root) return false;

  try {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.setAttribute("aria-busy", "false");
  } catch {}

  empty(root);
  root.appendChild(createFatalView(error));

  return true;
}

function handleFatal(error, reason = "boot") {
  failed = true;

  const serialized = serializeError(error);

  if (isBrowser()) {
    try {
      window[FATAL_ERROR_KEY] = { reason, error: serialized, at: iso() };
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
   BOOT LOCK
========================================================= */

function externalBootLock() {
  if (!isBrowser()) return null;

  try {
    const lock = window[BOOT_LOCK_KEY];
    return lock?.promise && isFn(lock.promise.then) ? lock : null;
  } catch {
    return null;
  }
}

function setBootLock(promise) {
  if (!isBrowser() || !promise) return false;

  try {
    window[BOOT_LOCK_KEY] = { source: "main", version: MAIN_VERSION, promise, startedAt };
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

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  startedAt = now();
  failed = false;

  disableLegacyAutoBoot();

  const bootContext = captureBootContext();

  markBooting();

  const moduleValue = await loadAppModule();
  const bootFn = resolveBootFunction(moduleValue);

  if (!bootFn) throw new Error("No se encontró función de arranque en src/app/index.js.");

  const result = await bootFn({
    ...object(options),
    source: text(options.source, "main"),
    version: MAIN_VERSION,
    bootContext,
    startedAt,
  });

  markMainReady();
  exposeLoadedApp(moduleValue, result);

  return result || moduleValue;
}

export function boot(options = {}) {
  const opts = object(options);

  if (bootPromise && opts.force !== true) return bootPromise;

  const lock = externalBootLock();
  if (lock && opts.force !== true) return lock.promise;

  const promise = runBoot(opts)
    .catch((error) => {
      handleFatal(error, "boot");
      throw error;
    })
    .finally(() => {
      clearBootLock(promise);
      if (bootPromise === promise) bootPromise = null;
    });

  bootPromise = promise;
  setBootLock(promise);

  return promise;
}

export function start(options = {}) {
  return boot(options);
}

export function getState() {
  return {
    version: MAIN_VERSION,
    startedAt,
    startedAtIso: startedAt ? iso(startedAt) : "",
    failed,
    hasBootPromise: Boolean(bootPromise),
    appLoaded: Boolean(appModule),
    initialUrl: redact(currentHref()),
    initialPath: redact(currentPath()),
  };
}

/* =========================================================
   DEBUG BRIDGE
========================================================= */

export const api = {
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
exposeDebugBridge();

start().catch(() => {
  /* handleFatal() ya pintó fallback. */
});

export default api;

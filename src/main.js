/* =========================================================
   Onion SPA - Entry Point
   Archivo: /src/main.js

   Responsabilidad única:
   - Ser el único entrypoint físico cargado por index.html.
   - Esperar DOM ready.
   - Cargar /src/app/index.js.
   - Ejecutar el boot lógico una sola vez.
   - Capturar error fatal de arranque.
   - No meter auth.
   - No meter router.
   - No meter API.
   - No meter store.
   - No meter vistas.
========================================================= */

const MAIN_VERSION = "v1-simple-main";
const APP_MODULE_PATH = "./app/index.js";

const BOOT_LOCK_KEY = "__ONION_MAIN_BOOT_LOCK__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";

const DEFAULT_ERROR_TITLE = "Error de arranque";
const DEFAULT_ERROR_MESSAGE = "No se pudo iniciar Onion Support.";

let appModule = null;
let bootPromise = null;
let startedAt = 0;
let failed = false;

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function getRequestPath() {
  if (!isBrowser()) return "/";

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "/";
  }
}

function getInitialUrl() {
  if (!isBrowser()) return "";

  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function redactUrl(value = "") {
  let output = safeText(value, "");

  if (!output) return "";

  const sensitive = [
    "token",
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
  ];

  try {
    for (const key of sensitive) {
      output = output.replace(
        new RegExp(`([?&#]${key}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    }

    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
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
      message: safeText(error.message, DEFAULT_ERROR_MESSAGE),
      stack: redactUrl(safeText(error.stack, "")),
      code: error.code || null,
      status: error.status || error.statusCode || null,
    };
  }

  if (typeof error === "string") {
    return {
      name: "ThrownString",
      message: safeText(error, DEFAULT_ERROR_MESSAGE),
    };
  }

  if (isObject(error)) {
    return {
      name: safeText(error.name, "ObjectError"),
      message: safeText(error.message || error.reason, DEFAULT_ERROR_MESSAGE),
      code: error.code || null,
      status: error.status || error.statusCode || null,
    };
  }

  return {
    name: "ThrownValue",
    message: safeText(String(error), DEFAULT_ERROR_MESSAGE),
  };
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function setDataset(element, key, value) {
  if (!element || !key) return;

  try {
    element.dataset[key] = String(value);
  } catch {}
}

function addClass(element, className) {
  if (!element || !className) return;

  try {
    element.classList.add(className);
  } catch {}
}

function removeClass(element, className) {
  if (!element || !className) return;

  try {
    element.classList.remove(className);
  } catch {}
}

function markBooting() {
  if (!isBrowser()) return;

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

  if (html) {
    setDataset(html, "appState", "booting");
  }
}

function markMainReady() {
  if (!isBrowser()) return;

  const html = document.documentElement;
  const body = document.body;

  for (const element of [html, body]) {
    if (!element) continue;

    setDataset(element, "mainReady", "true");
    setDataset(element, "mainFailed", "false");
  }
}

function markFatal() {
  if (!isBrowser()) return;

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

  if (html) {
    setDataset(html, "appState", "fatal");
  }
}

/* =========================================================
   DOM READY
========================================================= */

function waitForDomReady() {
  if (!isBrowser()) return Promise.resolve();

  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, {
      once: true,
    });
  });
}

/* =========================================================
   BOOT CONTEXT
========================================================= */

function disableLegacyAutoBoot() {
  if (!isBrowser()) return;

  try {
    window[DISABLE_AUTO_BOOT_KEY] = true;
  } catch {}
}

function captureBootContext() {
  const context = {
    source: "main",
    version: MAIN_VERSION,
    initialUrl: getInitialUrl(),
    initialPath: getRequestPath(),
    capturedAt: nowIso(),
  };

  if (!isBrowser()) return context;

  try {
    window[INITIAL_URL_KEY] = context.initialUrl;
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

  appModule = await import(APP_MODULE_PATH);

  return appModule;
}

function resolveBootFunction(moduleValue) {
  if (!moduleValue) return null;

  if (isFunction(moduleValue.bootApp)) return moduleValue.bootApp;
  if (isFunction(moduleValue.boot)) return moduleValue.boot;
  if (isFunction(moduleValue.start)) return moduleValue.start;

  if (moduleValue.App && isFunction(moduleValue.App.boot)) {
    return moduleValue.App.boot.bind(moduleValue.App);
  }

  if (moduleValue.default && isFunction(moduleValue.default.boot)) {
    return moduleValue.default.boot.bind(moduleValue.default);
  }

  if (isFunction(moduleValue.default)) {
    return moduleValue.default;
  }

  return null;
}

/* =========================================================
   FATAL FALLBACK
========================================================= */

function hideLoaderEmergency() {
  if (!isBrowser()) return;

  const loader =
    document.getElementById("app-loader") ||
    document.querySelector("[data-app-loader='true']");

  if (!loader) return;

  try {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.classList.remove("is-visible");
    loader.classList.add("is-hidden");
    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";
  } catch {}
}

function getFatalRoot() {
  if (!isBrowser()) return null;

  return (
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body
  );
}

function clearNode(node) {
  if (!node) return;

  try {
    node.replaceChildren();
    return;
  } catch {}

  try {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  } catch {}
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
  if (!isBrowser()) return;

  markFatal();
  hideLoaderEmergency();

  const root = getFatalRoot();

  if (!root) return;

  try {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.setAttribute("aria-busy", "false");
  } catch {}

  clearNode(root);
  root.appendChild(createFatalView(error));
}

function handleFatal(error, reason = "boot") {
  failed = true;

  const serialized = serializeError(error);

  try {
    window.__ONION_FATAL_ERROR__ = {
      reason,
      error: serialized,
      rawError: error,
      at: nowIso(),
    };
  } catch {}

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
  if (!isBrowser()) return;

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
}

/* =========================================================
   BOOT
========================================================= */

async function boot(options = {}) {
  if (bootPromise && options.force !== true) {
    return bootPromise;
  }

  if (isBrowser()) {
    const existingLock = window[BOOT_LOCK_KEY];

    if (
      existingLock &&
      existingLock.promise &&
      isFunction(existingLock.promise.then) &&
      options.force !== true
    ) {
      return existingLock.promise;
    }
  }

  startedAt = Date.now();
  failed = false;

  disableLegacyAutoBoot();
  markBooting();

  const bootContext = captureBootContext();

  bootPromise = (async () => {
    await waitForDomReady();

    const moduleValue = await loadAppModule();
    const bootFn = resolveBootFunction(moduleValue);

    if (!bootFn) {
      throw new Error("No se encontró función de arranque en src/app/index.js.");
    }

    const result = await bootFn({
      source: "main",
      version: MAIN_VERSION,
      bootContext,
      startedAt,
      ...options,
    });

    markMainReady();

    return result || moduleValue;
  })()
    .catch((error) => {
      handleFatal(error, "boot");
      throw error;
    })
    .finally(() => {
      try {
        if (window[BOOT_LOCK_KEY]?.promise === bootPromise) {
          delete window[BOOT_LOCK_KEY];
        }
      } catch {}

      bootPromise = null;
    });

  try {
    window[BOOT_LOCK_KEY] = {
      source: "main",
      version: MAIN_VERSION,
      promise: bootPromise,
      startedAt,
    };
  } catch {}

  return bootPromise;
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
    startedAtIso: startedAt ? new Date(startedAt).toISOString() : "",
    failed,
    hasBootPromise: Boolean(bootPromise),
    appLoaded: Boolean(appModule),
    initialUrl: redactUrl(getInitialUrl()),
    initialPath: redactUrl(getRequestPath()),
  };
}

function exposeDebugBridge() {
  if (!isBrowser()) return;

  try {
    window.OnionApp = window.OnionApp || {};
    window.OnionApp.main = {
      version: MAIN_VERSION,
      start,
      boot,
      getState,
    };

    window.__ONION_MAIN__ = window.OnionApp.main;
  } catch {}
}

/* =========================================================
   START
========================================================= */

disableLegacyAutoBoot();
captureBootContext();
markBooting();
bindGlobalErrors();
exposeDebugBridge();

start().catch(() => {
  /*
    handleFatal() ya pinta el fallback.
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

export default {
  version: MAIN_VERSION,
  start,
  boot,
  getState,
};

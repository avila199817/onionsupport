/* =========================================================
   Onion Support - Main
   Archivo: /src/main.js

   Responsabilidad:
   - Entry point único de la SPA.
   - Bloquear auto-boot legacy antes de cargar app.
   - Capturar path inicial para el boot.
   - Cargar /src/app/index.js.
   - Ejecutar boot una sola vez.
   - Mostrar error mínimo si falla el arranque.
   - Exponer snapshot técnico redacted.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin Services.
   - Sin fetch.
   - Sin storage.
   - Sin lógica de dominio.
========================================================= */

export const MAIN_VERSION = "main.v4";

const APP_MODULE = "./app/index.js";

const BOOT_PROMISE_KEY = "__ONION_MAIN_BOOT_PROMISE__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";
const MAIN_GLOBAL_KEY = "__ONION_MAIN__";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redactText(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeError(error = null) {
  return {
    name: cleanText(error?.name, "Error"),
    message: redactText(error?.message || String(error || "")),
    code: error?.code || error?.error || null,
    status: error?.status || error?.statusCode || error?.response?.status || null,
  };
}

/* =========================================================
   INITIAL PATH
========================================================= */

function getInitialPath() {
  if (!isBrowser()) return "/";

  try {
    const { pathname = "/", search = "", hash = "" } = window.location;
    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "/";
  }
}

/* =========================================================
   ROOT STATE
========================================================= */

function setDataset(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    node.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setAria(node = null, name = "", value = "") {
  if (!node || !name) return false;

  try {
    node.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setMainState(state = "booting") {
  if (!isBrowser()) return false;

  const value = cleanText(state, "booting");
  const booting = value === "booting";
  const ready = value === "ready";
  const fatal = value === "fatal";

  const roots = [document.documentElement, document.body].filter(Boolean);

  for (const root of roots) {
    setDataset(root, "mainState", value);
    setDataset(root, "appState", value);

    setDataset(root, "appLoading", booting ? "true" : "false");
    setDataset(root, "appBooting", booting ? "true" : "false");
    setDataset(root, "appReady", ready ? "true" : "false");
    setDataset(root, "appFatal", fatal ? "true" : "false");

    root.classList.toggle("app-booting", booting);
    root.classList.toggle("app-loading", booting);
    root.classList.toggle("app-ready", ready);
    root.classList.toggle("app-fatal", fatal);
  }

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

function createBootContext() {
  const initialPath = getInitialPath();

  disableLegacyAutoBoot();

  const context = Object.freeze({
    version: MAIN_VERSION,
    source: "main",
    initialPath,
    initialPathRedacted: redactText(initialPath),
  });

  try {
    window[BOOT_CONTEXT_KEY] = context;
  } catch {
    // noop
  }

  return context;
}

/* =========================================================
   FATAL DOM
========================================================= */

function hideLoaderForFatal() {
  if (!isBrowser()) return false;

  const loader = document.getElementById("app-loader");

  if (!loader) return false;

  try {
    loader.hidden = true;
    loader.classList.remove("is-visible");
    loader.classList.add("is-hidden");

    setDataset(loader, "loaderVisible", "false");
    setDataset(loader, "loaderState", "fatal");

    setAria(loader, "aria-hidden", "true");
    setAria(loader, "aria-busy", "false");

    return true;
  } catch {
    return false;
  }
}

function showShellForFatal() {
  if (!isBrowser()) return false;

  const shell = document.getElementById("app-shell");

  if (!shell) return false;

  try {
    shell.hidden = false;

    setDataset(shell, "shell", "visible");
    setDataset(shell, "shellState", "fatal");
    setDataset(shell, "shellInteractive", "false");
    setDataset(shell, "chrome", "hidden");
    setDataset(shell, "routeMode", "fatal");

    setAria(shell, "aria-hidden", "false");
    setAria(shell, "aria-busy", "false");

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

function showFatalError(error = null) {
  if (!isBrowser()) return false;

  setMainState("fatal");
  showShellForFatal();
  hideLoaderForFatal();

  const root = getFatalRoot();

  if (!root) return false;

  try {
    root.hidden = false;

    setAria(root, "aria-busy", "false");
    setAria(root, "aria-hidden", "false");

    if (root.dataset) {
      root.dataset.routeMode = "fatal";
    }

    const section = document.createElement("section");
    section.className = "boot-error-view";
    section.setAttribute("role", "alert");
    section.setAttribute("aria-live", "assertive");

    const title = document.createElement("h1");
    title.textContent = "Error de arranque";

    const message = document.createElement("p");
    message.textContent = "No se pudo iniciar Onion Support. Recarga la página.";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Recargar";
    button.addEventListener("click", () => {
      window.location.reload();
    });

    section.append(title, message, button);
    root.replaceChildren(section);
  } catch {
    return false;
  }

  try {
    console.error("[Onion Main] Boot error:", safeError(error));
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   DEBUG API
========================================================= */

function exposeMainDebugApi() {
  if (!isBrowser()) return false;

  try {
    window[MAIN_GLOBAL_KEY] = Object.freeze({
      version: MAIN_VERSION,
      boot,
      getSnapshot: getMainSnapshot,
      snapshot: getMainSnapshot,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   RUN
========================================================= */

async function runBoot() {
  const bootContext = createBootContext();

  setMainState("booting");

  const module = await import(APP_MODULE);

  if (!isFunction(module.bootApp)) {
    throw new Error("/src/app/index.js debe exportar bootApp().");
  }

  const result = await module.bootApp({
    source: "main",
    initialPath: bootContext.initialPath,
    bootContext,
  });

  setMainState("ready");

  return result === undefined ? true : result;
}

/* =========================================================
   PUBLIC BOOT
========================================================= */

export function boot() {
  if (!isBrowser()) return Promise.resolve(false);

  disableLegacyAutoBoot();
  exposeMainDebugApi();

  if (window[BOOT_PROMISE_KEY]) {
    return window[BOOT_PROMISE_KEY];
  }

  window[BOOT_PROMISE_KEY] = runBoot().catch((error) => {
    showFatalError(error);
    return false;
  });

  return window[BOOT_PROMISE_KEY];
}

export function getMainSnapshot() {
  if (!isBrowser()) {
    return {
      version: MAIN_VERSION,
      browser: false,
    };
  }

  const bootContext = window[BOOT_CONTEXT_KEY] || null;

  return {
    version: MAIN_VERSION,
    browser: true,

    booting: Boolean(window[BOOT_PROMISE_KEY]),
    disableAutoBoot: window[DISABLE_AUTO_BOOT_KEY] === true,

    initialPath: redactText(bootContext?.initialPath || getInitialPath()),

    state: {
      mainState: document.documentElement?.dataset?.mainState || null,
      appState: document.documentElement?.dataset?.appState || null,
      appLoading: document.documentElement?.dataset?.appLoading || null,
      appBooting: document.documentElement?.dataset?.appBooting || null,
      appReady: document.documentElement?.dataset?.appReady || null,
      appFatal: document.documentElement?.dataset?.appFatal || null,
    },

    dom: {
      loader: Boolean(document.getElementById("app-loader")),
      shell: Boolean(document.getElementById("app-shell")),
      mainContent: Boolean(document.getElementById("main-content")),
      appContent: Boolean(document.getElementById("app-content")),
      viewContainer: Boolean(document.getElementById("view-container")),
    },

    policy: {
      singleEntryPoint: true,
      disablesLegacyAutoBoot: true,
      capturesInitialPathBeforeAppImport: true,
      delegatesBootToAppIndex: true,
      bootRunsOnce: true,
      snapshotRedacted: true,

      noAuth: true,
      noRouter: true,
      noStore: true,
      noServices: true,
      noFetch: true,
      noStorage: true,
      noDomainLogic: true,
    },
  };
}

/* =========================================================
   START
========================================================= */

boot();

export default boot;

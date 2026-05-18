/* =========================================================
   Onion Support - Main
   Archivo: /src/main.js

   Responsabilidad:
   - Entry point único de la SPA.
   - Bloquear auto-boot legacy.
   - Capturar URL inicial.
   - Cargar /src/app/index.js.
   - Ejecutar boot una sola vez.
   - Mostrar error mínimo si falla.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin Services.
   - Sin fetch.
   - Sin storage.
   - Sin magia negra.
========================================================= */

const APP_MODULE = "./app/index.js";

const BOOT_PROMISE_KEY = "__ONION_MAIN_BOOT_PROMISE__";
const BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function currentPath() {
  if (!isBrowser()) return "/";

  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element = null, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   BOOT CONTEXT
========================================================= */

function createBootContext() {
  window[DISABLE_AUTO_BOOT_KEY] = true;

  if (!window[INITIAL_URL_KEY]) {
    window[INITIAL_URL_KEY] = window.location.href;
  }

  const context = {
    source: "main",
    initialUrl: window[INITIAL_URL_KEY],
    initialPath: currentPath(),
  };

  window[BOOT_CONTEXT_KEY] = context;

  return context;
}

/* =========================================================
   MAIN STATE
========================================================= */

function setMainState(state = "booting") {
  if (!isBrowser()) return false;

  const value = String(state || "booting");

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    setDataset(element, "mainState", value);
    setDataset(element, "appState", value);

    toggleClass(element, "app-booting", value === "booting");
    toggleClass(element, "app-loading", value === "booting");
    toggleClass(element, "app-ready", value === "ready");
    toggleClass(element, "app-fatal", value === "fatal");
  }

  return true;
}

/* =========================================================
   BOOT RESOLUTION
========================================================= */

function resolveBoot(module = {}) {
  if (typeof module.boot === "function") return module.boot;
  if (typeof module.bootApp === "function") return module.bootApp;
  if (typeof module.start === "function") return module.start;

  if (typeof module.App?.boot === "function") {
    return module.App.boot.bind(module.App);
  }

  if (typeof module.App?.bootApp === "function") {
    return module.App.bootApp.bind(module.App);
  }

  if (typeof module.App?.start === "function") {
    return module.App.start.bind(module.App);
  }

  if (typeof module.default?.boot === "function") {
    return module.default.boot.bind(module.default);
  }

  if (typeof module.default?.bootApp === "function") {
    return module.default.bootApp.bind(module.default);
  }

  if (typeof module.default?.start === "function") {
    return module.default.start.bind(module.default);
  }

  if (typeof module.default === "function") {
    return module.default;
  }

  return null;
}

/* =========================================================
   LOADER / SHELL
========================================================= */

function hideLoader() {
  if (!isBrowser()) return false;

  const loader = document.getElementById("app-loader");

  if (!loader) return false;

  try {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");
    loader.classList.remove("is-visible");
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
    shell.setAttribute("aria-hidden", "false");
    shell.setAttribute("aria-busy", "false");
    shell.dataset.shellState = "fatal";
    return true;
  } catch {
    return false;
  }
}

function fatalRoot() {
  if (!isBrowser()) return null;

  return (
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body ||
    null
  );
}

/* =========================================================
   FATAL VIEW
========================================================= */

function showFatalError(error = null) {
  if (!isBrowser()) return false;

  setMainState("fatal");
  showShellForFatal();
  hideLoader();

  const root = fatalRoot();

  if (!root) return false;

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const message = document.createElement("p");
  message.textContent = "No se pudo iniciar Onion Support. Recarga la página.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => window.location.reload());

  section.append(title, message, button);
  root.replaceChildren(section);

  try {
    console.error("[Onion Main] Boot error:", error);
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   RUN
========================================================= */

async function runBoot() {
  const bootContext = createBootContext();

  setMainState("booting");

  const module = await import(APP_MODULE);
  const bootApp = resolveBoot(module);

  if (!bootApp) {
    throw new Error("src/app/index.js no exporta boot/start/bootApp.");
  }

  const result = await bootApp({
    source: "main",
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

  if (window[BOOT_PROMISE_KEY]) {
    return window[BOOT_PROMISE_KEY];
  }

  window[BOOT_PROMISE_KEY] = runBoot().catch((error) => {
    showFatalError(error);
    return false;
  });

  return window[BOOT_PROMISE_KEY];
}

boot();

export default boot;

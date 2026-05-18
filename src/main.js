/* =========================================================
   Onion Support - Main
   Archivo: /src/main.js

   Responsabilidad:
   - Entry point único de la SPA.
   - Bloquear auto-boot legacy.
   - Capturar path inicial para el boot.
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
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function currentPath() {
  if (!isBrowser()) return "/";

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "/";
  }
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
   MAIN STATE
========================================================= */

function setMainState(state = "booting") {
  if (!isBrowser()) return false;

  const value = text(state, "booting");
  const booting = value === "booting";
  const ready = value === "ready";
  const fatal = value === "fatal";

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    setDataset(element, "mainState", value);
    setDataset(element, "appState", value);

    setDataset(element, "appLoading", booting ? "true" : "false");
    setDataset(element, "appBooting", booting ? "true" : "false");
    setDataset(element, "appReady", ready ? "true" : "false");

    toggleClass(element, "app-booting", booting);
    toggleClass(element, "app-loading", booting);
    toggleClass(element, "app-ready", ready);
    toggleClass(element, "app-fatal", fatal);
  }

  return true;
}

/* =========================================================
   BOOT CONTEXT
========================================================= */

function createBootContext() {
  window[DISABLE_AUTO_BOOT_KEY] = true;

  return {
    source: "main",
    initialPath: currentPath(),
  };
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
    shell.dataset.shell = "visible";
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
  button.addEventListener("click", () => {
    window.location.reload();
  });

  section.append(title, message, button);
  root.replaceChildren(section);

  try {
    console.error("[Onion Main] Boot error:", {
      name: error?.name || "Error",
      message: redact(error?.message || String(error || "")),
    });
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

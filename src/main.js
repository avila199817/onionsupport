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

function getInitialPath() {
  if (!isBrowser()) return "/";

  try {
    const { pathname = "/", search = "", hash = "" } = window.location;
    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "/";
  }
}

function redactErrorMessage(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   ROOT STATE
========================================================= */

function setMainState(state = "booting") {
  if (!isBrowser()) return false;

  const value = String(state || "booting");
  const booting = value === "booting";
  const ready = value === "ready";
  const fatal = value === "fatal";

  const roots = [document.documentElement, document.body].filter(Boolean);

  for (const root of roots) {
    root.dataset.mainState = value;
    root.dataset.appState = value;

    root.dataset.appLoading = String(booting);
    root.dataset.appBooting = String(booting);
    root.dataset.appReady = String(ready);

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

function createBootContext() {
  window[DISABLE_AUTO_BOOT_KEY] = true;

  return {
    source: "main",
    initialPath: getInitialPath(),
  };
}

/* =========================================================
   FATAL DOM
========================================================= */

function hideLoaderForFatal() {
  if (!isBrowser()) return false;

  const loader = document.getElementById("app-loader");
  if (!loader) return false;

  loader.hidden = true;
  loader.classList.remove("is-visible");
  loader.dataset.loaderVisible = "false";
  loader.dataset.loaderState = "fatal";
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");

  return true;
}

function showShellForFatal() {
  if (!isBrowser()) return false;

  const shell = document.getElementById("app-shell");
  if (!shell) return false;

  shell.hidden = false;
  shell.dataset.shell = "visible";
  shell.dataset.shellState = "fatal";
  shell.dataset.shellInteractive = "false";
  shell.dataset.chrome = "hidden";
  shell.setAttribute("aria-hidden", "false");
  shell.setAttribute("aria-busy", "false");

  return true;
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

  root.setAttribute("aria-busy", "false");
  root.setAttribute("aria-hidden", "false");

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
      message: redactErrorMessage(error?.message || String(error || "")),
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

  if (typeof module.bootApp !== "function") {
    throw new Error("/src/app/index.js debe exportar bootApp().");
  }

  const result = await module.bootApp({
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

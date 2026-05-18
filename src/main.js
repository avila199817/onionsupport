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

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function currentPath() {
  if (!isBrowser()) return "/";

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function createBootContext() {
  window.__ONION_DISABLE_AUTO_BOOT__ = true;

  if (!window.__ONION_INITIAL_URL__) {
    window.__ONION_INITIAL_URL__ = window.location.href;
  }

  const context = {
    source: "main",
    initialUrl: window.__ONION_INITIAL_URL__,
    initialPath: currentPath(),
  };

  window.__ONION_BOOT_CONTEXT__ = context;

  return context;
}

function setMainState(state = "booting") {
  if (!isBrowser()) return false;

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    element.dataset.mainState = state;
    element.dataset.appState = state === "fatal" ? "fatal" : element.dataset.appState || state;

    element.classList.toggle("app-booting", state === "booting");
    element.classList.toggle("app-loading", state === "booting");
    element.classList.toggle("app-ready", state === "ready");
    element.classList.toggle("app-fatal", state === "fatal");
  }

  return true;
}

function resolveBoot(module = {}) {
  if (typeof module.boot === "function") return module.boot;
  if (typeof module.bootApp === "function") return module.bootApp;
  if (typeof module.start === "function") return module.start;

  if (typeof module.App?.boot === "function") {
    return module.App.boot.bind(module.App);
  }

  if (typeof module.default?.boot === "function") {
    return module.default.boot.bind(module.default);
  }

  if (typeof module.default === "function") {
    return module.default;
  }

  return null;
}

function hideLoader() {
  if (!isBrowser()) return false;

  const loader = document.getElementById("app-loader");

  if (!loader) return false;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");
  loader.classList.remove("is-visible");

  return true;
}

function showShell() {
  if (!isBrowser()) return false;

  const shell = document.getElementById("app-shell");

  if (!shell) return false;

  shell.hidden = false;
  shell.setAttribute("aria-hidden", "false");
  shell.setAttribute("aria-busy", "false");
  shell.dataset.shellState = "fatal";

  return true;
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

function showFatalError(error = null) {
  if (!isBrowser()) return false;

  setMainState("fatal");
  showShell();
  hideLoader();

  const root = fatalRoot();

  if (!root) return false;

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const text = document.createElement("p");
  text.textContent = "No se pudo iniciar Onion Support. Recarga la página.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => window.location.reload());

  section.append(title, text, button);
  root.replaceChildren(section);

  try {
    console.error("[Onion Main] Boot error:", error);
  } catch {
    // noop
  }

  return true;
}

async function runBoot() {
  const bootContext = createBootContext();

  setMainState("booting");

  const module = await import(APP_MODULE);
  const bootApp = resolveBoot(module);

  if (!bootApp) {
    throw new Error("src/app/index.js no exporta boot/start/bootApp.");
  }

  await bootApp({
    source: "main",
    bootContext,
  });

  setMainState("ready");

  return true;
}

export function boot() {
  if (!isBrowser()) return Promise.resolve(false);

  if (window[BOOT_PROMISE_KEY]) {
    return window[BOOT_PROMISE_KEY];
  }

  window[BOOT_PROMISE_KEY] = runBoot()
    .catch((error) => {
      showFatalError(error);
      return false;
    })
    .finally(() => {
      window[BOOT_PROMISE_KEY] = null;
    });

  return window[BOOT_PROMISE_KEY];
}

boot();

export default boot;

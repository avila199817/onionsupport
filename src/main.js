/* =========================================================
   Onion Support - Main
   Archivo: /src/main.js

   Responsabilidad:
   - Entry point único del SPA.
   - Bloquear auto-boot legacy.
   - Guardar URL inicial.
   - Cargar /src/app/index.js.
   - Ejecutar boot una sola vez.
   - Mostrar error mínimo si falla.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin Services.
   - Sin fetch.
   - Sin storage.
========================================================= */

const APP_MODULE = "./app/index.js";

function getInitialPath() {
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
    initialPath: getInitialPath(),
  };

  window.__ONION_BOOT_CONTEXT__ = context;

  return context;
}

function setMainState(state) {
  const elements = [document.documentElement, document.body].filter(Boolean);

  for (const element of elements) {
    element.dataset.mainState = state;
  }
}

function resolveBoot(module) {
  if (typeof module?.boot === "function") {
    return module.boot;
  }

  if (typeof module?.bootApp === "function") {
    return module.bootApp;
  }

  if (typeof module?.start === "function") {
    return module.start;
  }

  if (typeof module?.App?.boot === "function") {
    return module.App.boot.bind(module.App);
  }

  if (typeof module?.default?.boot === "function") {
    return module.default.boot.bind(module.default);
  }

  if (typeof module?.default === "function") {
    return module.default;
  }

  return null;
}

function hideLoader() {
  const loader = document.getElementById("app-loader");

  if (!loader) return;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");
  loader.classList.remove("is-visible");
}

function showFatalError() {
  const root =
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body;

  if (!root) return;

  document.documentElement.classList.remove("app-booting", "app-loading");
  document.documentElement.classList.add("app-fatal");

  if (document.body) {
    document.body.classList.remove("app-booting", "app-loading");
    document.body.classList.add("app-fatal");
  }

  const shell = document.getElementById("app-shell");

  if (shell) {
    shell.hidden = false;
    shell.setAttribute("aria-hidden", "false");
    shell.setAttribute("aria-busy", "false");
  }

  hideLoader();

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
}

async function boot() {
  const bootContext = createBootContext();

  setMainState("booting");

  const module = await import(APP_MODULE);
  const bootApp = resolveBoot(module);

  if (!bootApp) {
    throw new Error("src/app/index.js no exporta una función de arranque.");
  }

  await bootApp({
    source: "main",
    bootContext,
  });

  setMainState("ready");
}

boot().catch(() => {
  setMainState("fatal");
  showFatalError();
});

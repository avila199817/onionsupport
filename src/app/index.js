/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Iniciar Core/Auth/Router si existen.
   - Restaurar sesión si Auth lo soporta.
   - Renderizar ruta actual si Router lo soporta.
   - Mostrar shell.
   - Ocultar loader.
   - Sin Store.
   - Sin Toast.
   - Sin Sidebar.
   - Sin Topbar.
   - Sin I18n.
   - Sin Services.
   - Sin eventos custom.
   - Sin warmup.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

let bootPromise = null;
let ready = false;

function path() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

async function call(target, names, ...args) {
  for (const name of names) {
    if (typeof target?.[name] === "function") {
      return target[name](...args);
    }
  }

  return null;
}

function setAppState(state) {
  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;

    element.dataset.appState = state;
    element.dataset.appBooting = state === "booting" ? "true" : "false";
    element.dataset.appReady = state === "ready" ? "true" : "false";

    element.classList.toggle("app-booting", state === "booting");
    element.classList.toggle("app-loading", state === "booting");
    element.classList.toggle("app-ready", state === "ready");
    element.classList.toggle("app-fatal", state === "fatal");
  }
}

function showShell() {
  const shell = document.getElementById("app-shell");

  if (!shell) return;

  shell.hidden = false;
  shell.setAttribute("aria-hidden", "false");
  shell.setAttribute("aria-busy", "false");
  shell.dataset.shellState = "ready";
}

function hideLoader() {
  const loader = document.getElementById("app-loader");

  if (!loader) return;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");
  loader.classList.remove("is-visible");
}

function renderFatal() {
  const root =
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content");

  if (!root) return;

  root.replaceChildren();

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const text = document.createElement("p");
  text.textContent = "No se pudo iniciar Onion Support.";

  section.append(title, text);
  root.appendChild(section);

  showShell();
  hideLoader();
}

async function renderRoute() {
  const currentPath = path();

  if (typeof Router?.renderCurrent === "function") {
    return Router.renderCurrent();
  }

  if (typeof Router?.render === "function") {
    return Router.render(currentPath);
  }

  if (typeof Router?.navigate === "function") {
    return Router.navigate(currentPath);
  }

  return null;
}

async function runBoot(options = {}) {
  setAppState("booting");

  await call(AppCore, ["init", "boot", "start"], {
    source: "app",
    ...options,
  });

  await call(Auth, ["init", "boot", "start"], {
    source: "app",
    skipNavigation: true,
  });

  await call(Router, ["init", "boot", "start"], {
    source: "app",
  });

  await call(Auth, ["restore", "restoreSession"], {
    source: "app",
  });

  await renderRoute();

  showShell();
  hideLoader();
  setAppState("ready");

  ready = true;

  return App;
}

export function boot(options = {}) {
  if (ready) return Promise.resolve(App);
  if (bootPromise) return bootPromise;

  bootPromise = runBoot(options)
    .catch((error) => {
      console.error("[Onion App] Boot error:", error);
      setAppState("fatal");
      renderFatal();
      return App;
    })
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

export function start(options = {}) {
  return boot(options);
}

export function isReady() {
  return ready;
}

export const App = {
  boot,
  start,
  isReady,
};

export const bootApp = boot;

export default App;

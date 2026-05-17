/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Iniciar Core/Auth/Router si existen.
   - Intentar restaurar sesión.
   - Renderizar ruta actual.
   - Actualizar shell.
   - Ocultar loader.
   - Sin Store.
   - Sin Toast.
   - Sin Sidebar.
   - Sin Topbar.
   - Sin I18n.
   - Sin Services.
   - Sin eventos.
   - Sin warmup.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import { showLoader, hideLoader, forceHideLoader } from "./loader.js";

import {
  updateShellVisibilityByRoute,
  markShellReady,
  markShellBusy,
  getViewContainer,
  setShellVisibility,
} from "./shell.js";

let bootPromise = null;
let ready = false;

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function setAppState(state) {
  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    element.dataset.appState = state;
    element.dataset.appBooting = state === "booting" ? "true" : "false";
    element.dataset.appReady = state === "ready" ? "true" : "false";

    element.classList.toggle("app-booting", state === "booting");
    element.classList.toggle("app-loading", state === "booting");
    element.classList.toggle("app-ready", state === "ready");
    element.classList.toggle("app-fatal", state === "fatal");
  }
}

async function call(target, names, payload = {}) {
  for (const name of names) {
    if (typeof target?.[name] === "function") {
      return target[name](payload);
    }
  }

  return null;
}

async function tryCall(target, names, payload = {}) {
  try {
    return await call(target, names, payload);
  } catch {
    return null;
  }
}

async function renderRoute() {
  const path = currentPath();

  if (typeof Router?.renderCurrent === "function") {
    return Router.renderCurrent();
  }

  if (typeof Router?.render === "function") {
    return Router.render(path);
  }

  if (typeof Router?.navigate === "function") {
    return Router.navigate(path);
  }

  return null;
}

function renderFatal() {
  const root = getViewContainer() || document.body;

  setAppState("fatal");
  setShellVisibility(null, true);
  markShellReady();
  forceHideLoader();

  if (!root) return;

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const text = document.createElement("p");
  text.textContent = "No se pudo iniciar Onion Support.";

  section.append(title, text);
  root.replaceChildren(section);
}

async function runBoot(options = {}) {
  setAppState("booting");
  markShellBusy();
  showLoader();

  const payload = {
    source: "app",
    ...options,
  };

  await tryCall(AppCore, ["init", "boot", "start"], payload);

  await tryCall(Auth, ["init", "boot", "start"], {
    ...payload,
    skipNavigation: true,
  });

  await tryCall(Router, ["init", "boot", "start"], payload);

  await tryCall(Auth, ["restore", "restoreSession"], payload);

  await renderRoute();

  updateShellVisibilityByRoute(AppCore, Router);
  markShellReady();
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

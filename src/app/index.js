/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Iniciar Core/Auth/Router.
   - Iniciar Toast.
   - Restaurar sesión.
   - Renderizar ruta actual.
   - Actualizar shell.
   - Iniciar Sidebar/Topbar.
   - Ocultar loader.
   - Sin Store.
   - Sin I18n.
   - Sin Services.
   - Sin warmup.
   - Sin repair loops.
   - Sin eventos custom.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import Toast from "../ui/toast/index.js";
import SidebarUI from "../ui/sidebar/index.js";
import TopbarUI from "../ui/topbar/index.js";

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

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function currentPath() {
  if (!isBrowser()) return "/";

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function setAppState(state = "booting") {
  if (!isBrowser()) return false;

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    element.dataset.appState = state;
    element.dataset.appBooting = state === "booting" ? "true" : "false";
    element.dataset.appReady = state === "ready" ? "true" : "false";

    element.classList.toggle("app-booting", state === "booting");
    element.classList.toggle("app-loading", state === "booting");
    element.classList.toggle("app-ready", state === "ready");
    element.classList.toggle("app-fatal", state === "fatal");
  }

  return true;
}

async function call(target, names = [], payload = {}) {
  for (const name of names) {
    if (typeof target?.[name] === "function") {
      return target[name](payload);
    }
  }

  return null;
}

async function tryCall(target, names = [], payload = {}) {
  try {
    return await call(target, names, payload);
  } catch {
    return null;
  }
}

/* =========================================================
   ROUTER
========================================================= */

async function renderRoute() {
  const path = currentPath();

  if (typeof Router?.renderCurrent === "function") {
    return Router.renderCurrent({
      source: "app",
      skipHistory: true,
      replaceState: true,
    });
  }

  if (typeof Router?.render === "function") {
    return Router.render(path, {
      source: "app",
      skipHistory: true,
      replaceState: true,
    });
  }

  if (typeof Router?.navigate === "function") {
    return Router.navigate(path, {
      source: "app",
      replaceState: true,
    });
  }

  return null;
}

/* =========================================================
   UI
========================================================= */

async function initToast(payload = {}) {
  await tryCall(Toast, ["init", "start", "boot"], payload);
  return Toast;
}

async function initChrome(payload = {}) {
  await tryCall(SidebarUI, ["init", "sync", "refresh"], payload);
  await tryCall(TopbarUI, ["init", "sync", "refresh"], payload);

  return true;
}

async function syncChrome(payload = {}) {
  await tryCall(SidebarUI, ["sync", "refresh", "render"], payload);
  await tryCall(TopbarUI, ["sync", "refresh", "render"], payload);

  return true;
}

/* =========================================================
   FATAL
========================================================= */

function renderFatal() {
  setAppState("fatal");

  try {
    setShellVisibility(null, true);
  } catch {
    // noop
  }

  try {
    markShellReady();
  } catch {
    // noop
  }

  forceHideLoader();

  if (!isBrowser()) return false;

  const root =
    getViewContainer?.() ||
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content");

  if (!root) return false;

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const text = document.createElement("p");
  text.textContent = "No se pudo iniciar Onion Support.";

  section.append(title, text);
  root.replaceChildren(section);

  return true;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const payload = {
    source: "app",
    ...options,
  };

  setAppState("booting");
  markShellBusy();
  showLoader();

  await tryCall(AppCore, ["init", "boot", "start"], payload);

  await tryCall(Auth, ["init", "boot", "start"], {
    ...payload,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });

  await tryCall(Router, ["init", "boot", "start"], {
    ...payload,
    appManagedInitialRender: true,
    skipInitialRender: true,
  });

  await initToast(payload);

  await tryCall(Auth, ["restore", "restoreSession"], {
    ...payload,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });

  await renderRoute();

  updateShellVisibilityByRoute(AppCore, Router);

  await initChrome(payload);
  await syncChrome(payload);

  markShellReady();
  hideLoader();

  setAppState("ready");
  ready = true;

  return App;
}

/* =========================================================
   PUBLIC API
========================================================= */

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

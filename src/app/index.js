/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Iniciar Core/Auth/Router.
   - Iniciar I18n.
   - Iniciar Toast.
   - Restaurar sesión.
   - Renderizar ruta actual.
   - Actualizar shell.
   - Iniciar Sidebar/Topbar.
   - Refrescar textos i18n.
   - Ocultar loader.
   - Sin Store.
   - Sin Services.
   - Sin warmup.
   - Sin repair loops.
   - Sin eventos custom.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import I18n from "../i18n/index.js";
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

function safeCall(fn, ...args) {
  if (typeof fn !== "function") return null;

  try {
    return fn(...args);
  } catch {
    return null;
  }
}

async function callFirst(target, names = [], payload = {}) {
  for (const name of names) {
    if (typeof target?.[name] === "function") {
      return target[name](payload);
    }
  }

  return null;
}

async function tryCall(target, names = [], payload = {}) {
  try {
    return await callFirst(target, names, payload);
  } catch {
    return null;
  }
}

/* =========================================================
   LOADER / SHELL SAFE
========================================================= */

function safeShowLoader() {
  safeCall(showLoader);
}

function safeHideLoader() {
  safeCall(hideLoader);
}

function safeForceHideLoader() {
  safeCall(forceHideLoader);
}

function safeMarkShellBusy() {
  safeCall(markShellBusy);
}

function safeMarkShellReady() {
  safeCall(markShellReady);
}

function safeUpdateShell() {
  safeCall(updateShellVisibilityByRoute, AppCore, Router);
}

function safeShowFatalShell() {
  safeCall(setShellVisibility, null, true);
  safeMarkShellReady();
  safeForceHideLoader();
}

/* =========================================================
   CORE UI SINGLETONS
========================================================= */

async function initI18n(payload = {}) {
  safeCall(I18n?.bindCore, AppCore);

  await tryCall(I18n, ["init", "boot", "start"], {
    ...payload,
    AppCore,
    core: AppCore,
    updateDOM: false,
    updateUi: false,
  });

  return I18n;
}

async function initToast(payload = {}) {
  await tryCall(Toast, ["init", "start", "boot"], payload);
  return Toast;
}

function refreshI18nDom() {
  if (!isBrowser()) return false;

  try {
    if (typeof I18n?.updateDOM === "function") {
      I18n.updateDOM();
      return true;
    }

    if (typeof I18n?.reload === "function") {
      I18n.reload();
      return true;
    }

    if (typeof I18n?.refresh === "function") {
      I18n.refresh();
      return true;
    }
  } catch {
    return false;
  }

  return false;
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
   CHROME
========================================================= */

async function initChrome(payload = {}) {
  await tryCall(SidebarUI, ["init", "boot", "start"], payload);
  await tryCall(TopbarUI, ["init", "boot", "start"], payload);

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
  safeShowFatalShell();

  if (!isBrowser()) return false;

  const root =
    safeCall(getViewContainer) ||
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body ||
    null;

  if (!root) return false;

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const text = document.createElement("p");
  text.textContent = "No se pudo iniciar Onion Support.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => window.location.reload());

  section.append(title, text, button);
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
  safeMarkShellBusy();
  safeShowLoader();

  await tryCall(AppCore, ["init", "boot", "start"], payload);

  await initI18n(payload);
  await initToast(payload);

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

  await tryCall(Auth, ["restore", "restoreSession"], {
    ...payload,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });

  await renderRoute();

  await initChrome(payload);
  await syncChrome(payload);

  safeUpdateShell();
  refreshI18nDom();

  safeMarkShellReady();
  safeHideLoader();

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

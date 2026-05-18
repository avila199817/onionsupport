/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Iniciar Core.
   - Iniciar I18n.
   - Iniciar Toast.
   - Iniciar Auth.
   - Restaurar sesión ANTES del primer render Router.
   - Iniciar Router sin render automático.
   - Renderizar ruta actual.
   - Iniciar Sidebar/Topbar después de ruta + auth.
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

import {
  showLoader,
  hideLoader,
  forceHideLoader,
} from "./loader.js";

import {
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

  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function setAppState(state = "booting") {
  if (!isBrowser()) return false;

  const value = String(state || "booting");

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    element.dataset.appState = value;
    element.dataset.appBooting = value === "booting" ? "true" : "false";
    element.dataset.appReady = value === "ready" ? "true" : "false";

    element.classList.toggle("app-booting", value === "booting");
    element.classList.toggle("app-loading", value === "booting");
    element.classList.toggle("app-ready", value === "ready");
    element.classList.toggle("app-fatal", value === "fatal");
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
   AUTH
========================================================= */

async function initAuth(payload = {}) {
  await tryCall(Auth, ["init", "boot", "start"], {
    ...payload,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });

  return Auth;
}

async function restoreAuth(payload = {}) {
  await tryCall(Auth, ["restoreSession", "restore"], {
    ...payload,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });

  return Auth;
}

/* =========================================================
   ROUTER
========================================================= */

async function initRouter(payload = {}) {
  const router = await tryCall(Router, ["init", "configure"], {
    ...payload,
    appManagedInitialRender: true,
    skipInitialRender: true,
    render: false,
  });

  if (router) return router;

  return tryCall(Router, ["start", "boot"], {
    ...payload,
    appManagedInitialRender: true,
    skipInitialRender: true,
    render: false,
  });
}

async function renderRoute() {
  const path = currentPath();

  if (typeof Router?.renderCurrent === "function") {
    return Router.renderCurrent({
      source: "app.boot",
      initialRender: true,
      preserveUrl: true,
      replaceState: true,
      skipHistory: true,
    });
  }

  if (typeof Router?.render === "function") {
    return Router.render(path, {
      source: "app.boot",
      initialRender: true,
      preserveUrl: true,
      replaceState: true,
      skipHistory: true,
    });
  }

  if (typeof Router?.navigate === "function") {
    return Router.navigate(path, {
      source: "app.boot",
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

  const message = document.createElement("p");
  message.textContent = "No se pudo iniciar Onion Support.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => window.location.reload());

  section.append(title, message, button);
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

  /*
    Orden crítico:
    Auth debe estar inicializado y restaurado antes del primer render Router.
    Así /@slug puede renderizar Home si hay sesión válida.
  */
  await initAuth(payload);
  await restoreAuth(payload);

  /*
    Router se inicia sin render automático.
    El render inicial lo controla App después del restore.
  */
  await initRouter(payload);
  await renderRoute();

  /*
    Chrome después de ruta + auth:
    Sidebar y Topbar ya reciben estado real.
  */
  await initChrome(payload);
  await syncChrome(payload);

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
      try {
        console.error("[Onion App] Boot error:", error);
      } catch {
        // noop
      }

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

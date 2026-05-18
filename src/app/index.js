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

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return "/";
  }
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function safeCall(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

async function callModule(target = null, names = [], payload = {}) {
  if (!target) return null;

  for (const name of names) {
    const fn = target?.[name];

    if (!isFunction(fn)) continue;

    try {
      return await fn.call(target, payload);
    } catch {
      return null;
    }
  }

  return null;
}

/* =========================================================
   APP STATE
========================================================= */

function setRootData(element = null, state = "booting") {
  if (!element) return false;

  const booting = state === "booting";
  const readyState = state === "ready";
  const fatal = state === "fatal";

  try {
    element.dataset.appState = state;
    element.dataset.appLoading = booting ? "true" : "false";
    element.dataset.appBooting = booting ? "true" : "false";
    element.dataset.appReady = readyState ? "true" : "false";

    element.classList.toggle("app-booting", booting);
    element.classList.toggle("app-loading", booting);
    element.classList.toggle("app-ready", readyState);
    element.classList.toggle("app-fatal", fatal);

    return true;
  } catch {
    return false;
  }
}

function setAppState(state = "booting") {
  if (!isBrowser()) return false;

  const value = String(state || "booting");

  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    setRootData(element, value);
  }

  return true;
}

/* =========================================================
   SAFE UI
========================================================= */

function setBusy() {
  setAppState("booting");
  safeCall(markShellBusy);
  safeCall(showLoader);
}

function setReady() {
  safeCall(markShellReady);
  safeCall(hideLoader);
  setAppState("ready");
}

function setFatal() {
  setAppState("fatal");
  safeCall(setShellVisibility, null, true);
  safeCall(markShellReady);
  safeCall(forceHideLoader);
}

function fatalRoot() {
  if (!isBrowser()) return null;

  return (
    safeCall(getViewContainer) ||
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body ||
    null
  );
}

/* =========================================================
   CORE SINGLETONS
========================================================= */

function exposeSingletons() {
  try {
    AppCore.Auth = Auth;
    AppCore.auth = Auth;

    AppCore.Router = Router;
    AppCore.router = Router;

    AppCore.I18n = I18n;
    AppCore.i18n = I18n;

    AppCore.Toast = Toast;
    AppCore.toast = Toast;

    AppCore.modules?.register?.("Auth", Auth);
    AppCore.modules?.register?.("auth", Auth);

    AppCore.modules?.register?.("Router", Router);
    AppCore.modules?.register?.("router", Router);

    AppCore.modules?.register?.("I18n", I18n);
    AppCore.modules?.register?.("i18n", I18n);

    AppCore.modules?.register?.("Toast", Toast);
    AppCore.modules?.register?.("toast", Toast);
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   CORE / UI BOOT
========================================================= */

async function initCore(payload = {}) {
  await callModule(AppCore, ["init", "boot", "start"], payload);
  exposeSingletons();

  return AppCore;
}

async function initI18n(payload = {}) {
  safeCall(I18n?.bindCore?.bind?.(I18n) || I18n?.bindCore, AppCore);

  await callModule(I18n, ["init", "boot", "start"], {
    ...payload,
    AppCore,
    core: AppCore,
    updateDOM: false,
    updateUi: false,
  });

  return I18n;
}

async function initToast(payload = {}) {
  await callModule(Toast, ["init", "start", "boot"], {
    ...payload,
    AppCore,
    core: AppCore,
  });

  return Toast;
}

function refreshI18nDom() {
  if (!isBrowser()) return false;

  try {
    if (isFunction(I18n?.updateDOM)) {
      I18n.updateDOM();
      return true;
    }

    if (isFunction(I18n?.refresh)) {
      I18n.refresh();
      return true;
    }

    if (isFunction(I18n?.reload)) {
      I18n.reload();
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
  await callModule(Auth, ["init", "boot", "start"], {
    ...payload,
    AppCore,
    core: AppCore,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });

  return Auth;
}

async function restoreAuth(payload = {}) {
  await callModule(Auth, ["restoreSession", "restore"], {
    ...payload,
    AppCore,
    core: AppCore,
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
  const options = {
    ...payload,
    AppCore,
    core: AppCore,
    appManagedInitialRender: true,
    skipInitialRender: true,
    render: false,
  };

  const router =
    await callModule(Router, ["init", "configure"], options) ||
    await callModule(Router, ["start", "boot"], options);

  return router || Router;
}

async function renderInitialRoute() {
  const options = {
    source: "app.boot",
    initialRender: true,
    preserveUrl: true,
    replaceState: true,
    skipHistory: true,
  };

  if (isFunction(Router?.renderCurrent)) {
    return Router.renderCurrent(options);
  }

  if (isFunction(Router?.render)) {
    return Router.render(currentPath(), options);
  }

  if (isFunction(Router?.navigate)) {
    return Router.navigate(currentPath(), {
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
  await callModule(SidebarUI, ["init", "boot", "start"], {
    ...payload,
    AppCore,
    core: AppCore,
  });

  await callModule(TopbarUI, ["init", "boot", "start"], {
    ...payload,
    AppCore,
    core: AppCore,
  });

  return true;
}

async function syncChrome(payload = {}) {
  await callModule(SidebarUI, ["sync", "refresh", "render"], {
    ...payload,
    AppCore,
    core: AppCore,
  });

  await callModule(TopbarUI, ["sync", "refresh", "render"], {
    ...payload,
    AppCore,
    core: AppCore,
  });

  return true;
}

/* =========================================================
   FATAL
========================================================= */

function renderFatal(error = null) {
  setFatal();

  if (!isBrowser()) return false;

  const root = fatalRoot();

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
  button.addEventListener("click", () => {
    window.location.reload();
  });

  section.append(title, message, button);
  root.replaceChildren(section);

  try {
    console.error("[Onion App] Boot error:", error);
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const payload = {
    ...(isObject(options) ? options : {}),
    source: options.source || "app",
  };

  setBusy();

  await initCore(payload);
  await initI18n(payload);
  await initToast(payload);

  /*
    Orden crítico:
    Auth debe estar inicializado y restaurado antes del primer render Router.
    Así /@{user.slug} puede renderizar Home si hay sesión válida.
  */
  await initAuth(payload);
  await restoreAuth(payload);

  /*
    Router se inicia sin render automático.
    El render inicial lo controla App después del restore.
  */
  await initRouter(payload);
  await renderInitialRoute();

  /*
    Chrome después de ruta + auth.
    Sidebar y Topbar ya reciben estado real.
  */
  await initChrome(payload);
  await syncChrome(payload);

  refreshI18nDom();

  setReady();
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
      renderFatal(error);
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

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
   - Renderizar ruta inicial capturada por main.js.
   - Iniciar Sidebar/Topbar después de ruta + auth.
   - Refrescar textos i18n.
   - Ocultar loader.
   - Sin Store.
   - Sin Services paralelos.
   - Sin warmup.
   - Sin repair loops.
   - Sin eventos custom.
   - Sin fetch.
   - Sin storage.
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
} from "./loader.js";

import {
  markShellReady,
  markShellBusy,
} from "./shell.js";

export const APP_INDEX_VERSION = "app.index.v3";

let bootPromise = null;
let ready = false;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function currentPath() {
  if (!isBrowser()) return "/";

  try {
    const { pathname = "/", search = "", hash = "" } = window.location;
    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "/";
  }
}

function bootPath(options = {}) {
  return cleanText(
    options.bootContext?.initialPath ||
      options.initialPath ||
      currentPath(),
    "/"
  );
}

function createBootPayload(options = {}) {
  const input = isObject(options) ? options : {};
  const initialPath = bootPath(input);

  return {
    ...input,
    source: cleanText(input.source, "app"),
    initialPath,
    bootContext: {
      ...(isObject(input.bootContext) ? input.bootContext : {}),
      initialPath,
    },
    AppCore,
    core: AppCore,
  };
}

/* =========================================================
   METHOD CONTRACTS
========================================================= */

async function callRequired(target = null, method = "", label = "", payload = {}) {
  const fn = target?.[method];

  if (!isFunction(fn)) {
    throw new Error(`${label || "Módulo"}.${method}() no disponible.`);
  }

  return fn.call(target, payload);
}

async function callOptional(target = null, method = "", payload = {}) {
  const fn = target?.[method];

  if (!isFunction(fn)) {
    return null;
  }

  return fn.call(target, payload);
}

/* =========================================================
   APP STATE
========================================================= */

function setRootState(root = null, state = "booting") {
  if (!root) return false;

  const value = cleanText(state, "booting");
  const booting = value === "booting";
  const readyState = value === "ready";
  const fatal = value === "fatal";

  root.dataset.appState = value;
  root.dataset.appLoading = String(booting);
  root.dataset.appBooting = String(booting);
  root.dataset.appReady = String(readyState);

  root.classList.toggle("app-booting", booting);
  root.classList.toggle("app-loading", booting);
  root.classList.toggle("app-ready", readyState);
  root.classList.toggle("app-fatal", fatal);

  return true;
}

function setAppState(state = "booting") {
  if (!isBrowser()) return false;

  for (const root of [document.documentElement, document.body].filter(Boolean)) {
    setRootState(root, state);
  }

  return true;
}

/* =========================================================
   UI STATE
========================================================= */

function setBusy() {
  setAppState("booting");
  markShellBusy();
  showLoader();
}

function setReady() {
  markShellReady();
  hideLoader();
  setAppState("ready");
}

/* =========================================================
   CORE REGISTRY
========================================================= */

function exposeCoreModules() {
  AppCore.auth = Auth;
  AppCore.router = Router;
  AppCore.i18n = I18n;
  AppCore.toast = Toast;

  AppCore.modules?.register?.("auth", Auth);
  AppCore.modules?.register?.("router", Router);
  AppCore.modules?.register?.("i18n", I18n);
  AppCore.modules?.register?.("toast", Toast);

  return true;
}

/* =========================================================
   CORE / I18N / TOAST
========================================================= */

async function initCore(payload = {}) {
  await callRequired(AppCore, "init", "AppCore", payload);
  exposeCoreModules();

  return AppCore;
}

async function initI18n(payload = {}) {
  if (isFunction(I18n?.bindCore)) {
    I18n.bindCore(AppCore);
  }

  await callRequired(I18n, "init", "I18n", {
    ...payload,
    updateDOM: false,
    updateUi: false,
  });

  return I18n;
}

async function initToast(payload = {}) {
  await callRequired(Toast, "init", "Toast", payload);
  return Toast;
}

function refreshI18nDom() {
  if (!isFunction(I18n?.updateDOM)) {
    return false;
  }

  I18n.updateDOM();
  return true;
}

/* =========================================================
   AUTH
========================================================= */

function authBootOptions(payload = {}) {
  return {
    ...payload,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  };
}

async function initAuth(payload = {}) {
  await callRequired(Auth, "init", "Auth", authBootOptions(payload));
  return Auth;
}

async function restoreAuth(payload = {}) {
  await callRequired(Auth, "restoreSession", "Auth", authBootOptions(payload));
  await callOptional(Auth, "syncAuthState", payload);

  return Auth;
}

/* =========================================================
   ROUTER
========================================================= */

async function initRouter(payload = {}) {
  await callRequired(Router, "init", "Router", {
    ...payload,
    appManagedInitialRender: true,
    skipInitialRender: true,
    render: false,
  });

  return Router;
}

async function renderInitialRoute(payload = {}) {
  const path = bootPath(payload);

  if (!isFunction(Router?.render)) {
    throw new Error("Router.render() no disponible.");
  }

  return Router.render.call(Router, path, {
    source: "app.boot",
    initialRender: true,
    preserveUrl: true,
    replaceState: true,
    skipHistory: true,
  });
}

/* =========================================================
   CHROME
========================================================= */

async function initChrome(payload = {}) {
  await callRequired(SidebarUI, "init", "SidebarUI", payload);
  await callRequired(TopbarUI, "init", "TopbarUI", payload);

  return true;
}

async function syncChrome(payload = {}) {
  await callOptional(SidebarUI, "sync", payload);
  await callOptional(TopbarUI, "sync", payload);

  return true;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const payload = createBootPayload(options);

  setBusy();

  await initCore(payload);
  await initI18n(payload);
  await initToast(payload);

  /*
    Orden crítico:
    Auth debe estar inicializado y restaurado antes del primer render Router.
    Así /@{user.slug} puede resolver Home si hay sesión válida.
  */
  await initAuth(payload);
  await restoreAuth(payload);

  /*
    Router se inicia sin render automático.
    El render inicial lo controla App después del restore.
  */
  await initRouter(payload);
  await renderInitialRoute(payload);

  /*
    Chrome después de ruta + auth.
    Sidebar y Topbar reciben estado real.
  */
  await initChrome(payload);
  await syncChrome(payload);

  refreshI18nDom();

  setReady();
  ready = true;

  return App;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppSnapshot() {
  return {
    version: APP_INDEX_VERSION,
    ready,
    booting: Boolean(bootPromise),
    currentPath: redact(currentPath()),

    modules: {
      core: Boolean(AppCore),
      auth: Boolean(Auth),
      router: Boolean(Router),
      i18n: Boolean(I18n),
      toast: Boolean(Toast),
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
    },

    policy: {
      singleEntryPoint: true,
      bootAppContract: true,
      restoresAuthBeforeRouterRender: true,
      routerManagedInitialRender: false,
      chromeAfterRouteAndAuth: true,
      noStore: true,
      noParallelServices: true,
      noWarmup: true,
      noRepairLoops: true,
      noCustomEvents: true,
      noFetch: true,
      noStorage: true,
      redactedSnapshot: true,
    },
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export function bootApp(options = {}) {
  if (!isBrowser()) return Promise.resolve(App);
  if (ready) return Promise.resolve(App);
  if (bootPromise) return bootPromise;

  bootPromise = runBoot(options).finally(() => {
    bootPromise = null;
  });

  return bootPromise;
}

export function isReady() {
  return ready;
}

export const App = {
  version: APP_INDEX_VERSION,
  boot: bootApp,
  isReady,
  getSnapshot: getAppSnapshot,
};

export default App;

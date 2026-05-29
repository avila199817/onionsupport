/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Inicializar Core/Auth/UI.
   - Restaurar sesión antes del primer render del Router.
   - Arrancar Router.
   - Ocultar loader al terminar.
   - Sin Store, Services, i18n funcional, warmup, eventos custom,
     fetch directo, storage directo ni lógica de dominio.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import Toast from "../ui/toast/index.js";
import SidebarUI from "../ui/sidebar/index.js";
import TopbarUI from "../ui/topbar/index.js";

import { showLoader, hideLoader } from "./loader.js";

export const APP_VERSION = "app.minimal.v1";

const AUTH_BOOT_OPTIONS = Object.freeze({
  persistent: true,
  restoreOnBoot: true,
  silent: true,
  silentRefresh: true,
  credentials: "include",
  skipRedirect: true,
  skipNavigation: true,
});

let bootPromise = null;
let ready = false;
let lastError = null;
let lastRestore = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
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

function safeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error.name, "Error"),
    message: redact(error.message || String(error)),
    status: error.status || error.statusCode || error.response?.status || null,
    code: error.code || error.error || null,
  };
}

function createBootPayload(options = {}) {
  const initialPath = cleanText(options?.initialPath || currentPath(), "/");

  return {
    ...options,

    source: cleanText(options?.source, "app"),
    version: APP_VERSION,
    initialPath,

    AppCore,
    core: AppCore,

    Auth,
    Router,
    Toast,
    SidebarUI,
    TopbarUI,
  };
}

function registerCoreModule(name = "", module = null) {
  if (!name || !module) return false;

  try {
    if (isFunction(AppCore?.registerModule)) {
      AppCore.registerModule(name, module, { overwrite: true });
      return true;
    }

    if (isFunction(AppCore?.modules?.register)) {
      AppCore.modules.register(name, module, { overwrite: true });
      return true;
    }

    AppCore[name] = module;
    return true;
  } catch {
    return false;
  }
}

function registerCoreModules() {
  registerCoreModule("auth", Auth);
  registerCoreModule("router", Router);
  registerCoreModule("toast", Toast);
  return true;
}

async function optionalCall(target = null, method = "", payload = {}) {
  const fn = target?.[method];

  if (!isFunction(fn)) return null;

  return fn.call(target, payload);
}

async function callFirst(target = null, methods = [], payload = {}) {
  for (const method of methods) {
    const fn = target?.[method];

    if (!isFunction(fn)) continue;

    return {
      called: true,
      method,
      value: await fn.call(target, payload),
    };
  }

  return {
    called: false,
    method: null,
    value: null,
  };
}

async function initCore(payload = {}) {
  await optionalCall(AppCore, "init", payload);
  registerCoreModules();
}

async function initToast(payload = {}) {
  await optionalCall(Toast, "init", payload);
}

async function initAuth(payload = {}) {
  await optionalCall(Auth, "init", {
    ...payload,
    ...AUTH_BOOT_OPTIONS,
    restoreOnBoot: false,
  });
}

async function restoreAuth(payload = {}) {
  const restore = await callFirst(
    Auth,
    [
      "restoreSession",
      "restoreAuthSession",
      "restore",
      "silentRestore",
      "refreshSession",
      "syncSession",
    ],
    {
      ...payload,
      ...AUTH_BOOT_OPTIONS,
    }
  );

  lastRestore = {
    attempted: restore.called,
    method: restore.method,
    ok: restore.called ? restore.value !== false : null,
  };

  return restore.value;
}

async function initGlobalUI(payload = {}) {
  await optionalCall(SidebarUI, "init", payload);
  await optionalCall(TopbarUI, "init", payload);
}

async function syncGlobalUI(payload = {}) {
  await optionalCall(SidebarUI, "sync", payload);
  await optionalCall(TopbarUI, "sync", payload);
}

async function startRouter(payload = {}) {
  const result = await callFirst(
    Router,
    [
      "start",
      "boot",
      "init",
      "renderInitialRoute",
    ],
    payload
  );

  if (result.called) return result.value;

  if (isFunction(Router?.navigate)) {
    return Router.navigate(payload.initialPath || currentPath(), {
      replace: true,
      source: "app.boot",
    });
  }

  throw new Error("Router.start() no disponible.");
}

function markBooting() {
  try {
    showLoader("booting");
  } catch {
    // noop
  }
}

function markReady() {
  ready = true;
  lastError = null;

  try {
    hideLoader();
  } catch {
    // noop
  }
}

function markFailed(error = null) {
  ready = false;
  lastError = safeError(error);

  try {
    hideLoader();
  } catch {
    // noop
  }
}

async function runBoot(options = {}) {
  const payload = createBootPayload(options);

  ready = false;
  lastError = null;
  lastRestore = null;

  markBooting();

  await initCore(payload);
  await initToast(payload);
  await initAuth(payload);

  /*
    Restore antes del primer render.
    Un fallo recuperable de restore no debe tumbar el boot:
    Router decidirá si muestra login o zona privada.
  */
  try {
    await restoreAuth(payload);
  } catch (error) {
    lastRestore = {
      attempted: true,
      method: "restore",
      ok: false,
      error: safeError(error),
    };
  }

  await initGlobalUI(payload);
  await startRouter(payload);
  await syncGlobalUI(payload);

  markReady();

  return App;
}

export function bootApp(options = {}) {
  if (!isBrowser()) return Promise.resolve(App);
  if (ready) return Promise.resolve(App);
  if (bootPromise) return bootPromise;

  bootPromise = runBoot(options)
    .catch((error) => {
      markFailed(error);
      throw error;
    })
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

export function isReady() {
  return ready;
}

export function getAppSnapshot() {
  return {
    version: APP_VERSION,
    ready,
    booting: Boolean(bootPromise),
    path: redact(currentPath()),
    lastError,
    lastRestore,

    modules: {
      core: Boolean(AppCore),
      auth: Boolean(Auth),
      router: Boolean(Router),
      toast: Boolean(Toast),
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
    },
  };
}

export const App = {
  version: APP_VERSION,

  boot: bootApp,
  bootApp,
  isReady,

  getSnapshot: getAppSnapshot,
  snapshot: getAppSnapshot,
};

export default App;

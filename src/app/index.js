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

export const APP_VERSION = "app.minimal.v2";

const AUTH_BOOT_OPTIONS = Object.freeze({
  persistent: true,
  restoreOnBoot: true,
  silent: true,
  credentials: "include",
  skipRedirect: true,
  skipNavigation: true,
});

let bootPromise = null;
let ready = false;
let lastError = null;
let lastRestore = null;

/* =========================================================
   BASICS
========================================================= */

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
  return {
    ...options,

    source: cleanText(options?.source, "app"),
    version: APP_VERSION,
    initialPath: cleanText(options?.initialPath || currentPath(), "/"),

    AppCore,
    core: AppCore,

    Auth,
    Router,

    Toast,
    SidebarUI,
    TopbarUI,
  };
}

async function call(target = null, method = "", payload = {}, critical = true) {
  const fn = target?.[method];

  if (!isFunction(fn)) {
    return {
      called: false,
      ok: false,
      method,
      value: null,
      error: null,
    };
  }

  try {
    return {
      called: true,
      ok: true,
      method,
      value: await fn.call(target, payload),
      error: null,
    };
  } catch (error) {
    if (critical) throw error;

    return {
      called: true,
      ok: false,
      method,
      value: null,
      error: safeError(error),
    };
  }
}

/* =========================================================
   BOOT STEPS
========================================================= */

async function initCore(payload = {}) {
  await call(AppCore, "init", payload, true);
}

async function initToast(payload = {}) {
  await call(Toast, "init", payload, false);
}

async function initAuth(payload = {}) {
  await call(
    Auth,
    "init",
    {
      ...payload,
      ...AUTH_BOOT_OPTIONS,
      restoreOnBoot: false,
    },
    true
  );
}

async function restoreAuth(payload = {}) {
  const result = await call(
    Auth,
    "restoreSession",
    {
      ...payload,
      ...AUTH_BOOT_OPTIONS,
    },
    false
  );

  lastRestore = {
    attempted: result.called,
    method: result.method,
    ok: result.called ? result.ok && result.value !== false : null,
    error: result.error,
  };

  return result.value;
}

async function initGlobalUI(payload = {}) {
  /*
    Sidebar/Topbar se registran en AppCore dentro de su propio init().
    El Router sincroniza chrome tras renderizar la ruta.
  */
  await call(SidebarUI, "init", payload, false);
  await call(TopbarUI, "init", payload, false);
}

async function startRouter(payload = {}) {
  const result = await call(Router, "start", payload, true);

  if (result.called) {
    return result.value;
  }

  throw new Error("Router.start() no disponible.");
}

/* =========================================================
   BOOT STATE
========================================================= */

function markBooting() {
  ready = false;
  lastError = null;

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

/* =========================================================
   RUN
========================================================= */

async function runBoot(options = {}) {
  const payload = createBootPayload(options);

  markBooting();
  lastRestore = null;

  await initCore(payload);
  await initToast(payload);
  await initAuth(payload);

  /*
    Restore antes del primer render.
    Si no hay sesión o no hay token, Auth.restoreSession() debe resolver
    sin tumbar el boot. El Router decide si muestra login o zona privada.
  */
  await restoreAuth(payload);

  await initGlobalUI(payload);
  await startRouter(payload);

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

/* =========================================================
   SNAPSHOT
========================================================= */

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

/* =========================================================
   API
========================================================= */

export const App = {
  version: APP_VERSION,

  boot: bootApp,
  bootApp,
  isReady,

  getSnapshot: getAppSnapshot,
  getDebugSnapshot: getAppSnapshot,
  snapshot: getAppSnapshot,
};

export default App;

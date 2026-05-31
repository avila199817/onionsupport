/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Inicializar Core/Auth/UI.
   - Restaurar sesión antes del primer render del Router.
   - Arrancar Router respetando la URL actual.
   - Ocultar loader al terminar.
   - Sin Store.
   - Sin Services.
   - Sin i18n funcional.
   - Sin warmup.
   - Sin eventos custom.
   - Sin fetch directo.
   - Sin storage directo.
   - Sin lógica de dominio.
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import Toast from "../ui/toast/index.js";
import SidebarUI from "../ui/sidebar/index.js";
import TopbarUI from "../ui/topbar/index.js";

import { showLoader, hideLoader } from "./loader.js";

export const APP_VERSION = "app.minimal.v3";

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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
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

function authResultOk(value = null) {
  if (value === false) return false;
  if (value === true) return true;

  if (isObject(value)) {
    return value.ok !== false;
  }

  return value !== null && value !== undefined;
}

function authResultAuthenticated(value = null) {
  return isObject(value) && value.authenticated === true;
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
  /*
    Auth se inicializa sin restaurar aquí.
    La restauración se hace una única vez en restoreAuth(),
    antes de arrancar Router.
  */
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
  /*
    Punto crítico:
    - Tras F5 puede no existir access token en memoria.
    - El refresh debe intentarse igualmente con credentials include.
    - Auth decide si hay cookie/sesión restaurable.
    - Router no arranca hasta que esto termina.
  */
  const result = await call(
    Auth,
    "restoreSession",
    {
      ...payload,
      ...AUTH_BOOT_OPTIONS,
    },
    false
  );

  const value = result.value;

  lastRestore = {
    attempted: result.called,
    method: result.method,
    ok: result.called ? result.ok === true && authResultOk(value) : null,
    authenticated: authResultAuthenticated(value),
    skippedRefresh: isObject(value) ? value.skippedRefresh === true : false,
    reason: isObject(value) ? value.reason || null : null,
    error: result.error,
  };

  return value;
}

async function initGlobalUI(payload = {}) {
  /*
    Sidebar/Topbar se registran en AppCore dentro de su propio init().
    Router sincroniza chrome/active state tras renderizar la ruta.
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
    Orden obligatorio:
    1. Core listo.
    2. Auth instalado.
    3. Restore con cookie httpOnly / credentials include.
    4. UI global registrada.
    5. Router renderiza la URL actual.

    Así una recarga en /@slug/incidencias no cae a login antes
    de que Auth haya intentado restaurar la sesión.
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

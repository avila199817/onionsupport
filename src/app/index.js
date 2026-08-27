/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Orquestar el boot mínimo de la SPA.
   - Inicializar Core/Auth/UI.
   - Restaurar sesión antes del primer render en rutas privadas.
   - Permitir fast-path sin red para la home pública exacta (/).
   - Arrancar Router respetando la URL real actual.
   - Mantener tokens/rutas sensibles fuera de módulos que no los necesitan.
   - Delegar el loader exclusivamente en /src/app/loader.js.
   - Exponer snapshot de boot seguro y útil para diagnóstico.
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
import { Router } from "../router/index.js";

import {
  showLoader,
  hideLoader,
} from "./loader.js";

export const APP_VERSION =
  "app.minimal.v6-public-lean-graph";

/* =========================================================
   CONSTANTS
========================================================= */

const PUBLIC_HOME_PATH = "/";
const PUBLIC_HYDRATION_DELAY_MS = 7000;
const PUBLIC_HYDRATION_INTERACTION_EVENTS =
  Object.freeze(["pointerdown", "keydown", "touchstart"]);

const AUTH_BOOT_OPTIONS =
  Object.freeze({
    persistent: true,
    restoreOnBoot: true,
    silent: true,
    credentials: "include",
    skipRedirect: true,
    skipNavigation: true,
  });

const BOOT_PHASES =
  Object.freeze({
    IDLE: "idle",
    BOOTING: "booting",
    CORE: "core",
    TOAST: "toast",
    AUTH: "auth",
    RESTORE: "restore-auth",
    UI: "global-ui",
    ROUTER: "router",
    READY: "ready",
    FAILED: "failed",
  });

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

/* =========================================================
   INTERNAL STATE
========================================================= */

let bootPromise = null;
let publicHydrationPromise = null;
let publicHydrationTimer = 0;
let publicHydrationInteractionHandler = null;
let ready = false;
let publicFastBoot = false;

let Auth = null;
let Toast = null;
let SidebarUI = null;
let TopbarUI = null;

let authLoadPromise = null;
let toastLoadPromise = null;
let sidebarLoadPromise = null;
let topbarLoadPromise = null;

let bootPhase =
  BOOT_PHASES.IDLE;

let lastError = null;
let lastRestore = null;

let bootStartedAt = 0;
let lastReadyAt = 0;
let lastBootDurationMs = null;

let bootSteps =
  Object.create(null);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return (
    typeof value === "function"
  );
}

async function loadRuntimeModule(
  current = null,
  promise = null,
  loader = null,
  names = []
) {
  if (current) {
    return { value: current, promise };
  }

  const activePromise =
    promise ||
    Promise.resolve()
      .then(loader)
      .then((module) => {
        for (const name of names) {
          if (module?.[name]) {
            return module[name];
          }
        }
        return module?.default || module || null;
      });

  return {
    value: await activePromise,
    promise: activePromise,
  };
}

async function ensureAuth() {
  const loaded = await loadRuntimeModule(
    Auth,
    authLoadPromise,
    () => import("../features/auth/index.js"),
    ["Auth"]
  );
  authLoadPromise = loaded.promise;
  Auth = loaded.value;
  return Auth;
}

async function ensureToast() {
  const loaded = await loadRuntimeModule(
    Toast,
    toastLoadPromise,
    () => import("../ui/toast/index.js"),
    ["Toast"]
  );
  toastLoadPromise = loaded.promise;
  Toast = loaded.value;
  return Toast;
}

async function ensureSidebarUI() {
  const loaded = await loadRuntimeModule(
    SidebarUI,
    sidebarLoadPromise,
    () => import("../ui/sidebar/index.js"),
    ["SidebarUI"]
  );
  sidebarLoadPromise = loaded.promise;
  SidebarUI = loaded.value;
  return SidebarUI;
}

async function ensureTopbarUI() {
  const loaded = await loadRuntimeModule(
    TopbarUI,
    topbarLoadPromise,
    () => import("../ui/topbar/index.js"),
    ["TopbarUI"]
  );
  topbarLoadPromise = loaded.promise;
  TopbarUI = loaded.value;
  return TopbarUI;
}

function withRuntimeModules(payload = {}) {
  return {
    ...payload,
    Auth,
    Router,
    Toast,
    SidebarUI,
    TopbarUI,
  };
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    output ||
    fallback
  );
}

/* =========================================================
   SENSITIVE PATH / ERROR SAFETY
========================================================= */

function redact(value = "") {
  return cleanText(
    value,
    ""
  )
    .replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    )
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function currentPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const {
      pathname = "/",
      search = "",
      hash = "",
    } = window.location;

    return (
      `${pathname || "/"}${search || ""}${hash || ""}`
    );
  } catch {
    return "/";
  }
}

function resolveInitialPath(
  options = {}
) {
  return cleanText(
    options?.initialPath ||
    currentPath(),
    "/"
  );
}

function pathnameFromInitialPath(
  value = "/"
) {
  const raw = cleanText(
    value,
    "/"
  );

  try {
    if (
      /^https?:\/\//i.test(raw) &&
      isBrowser()
    ) {
      return new URL(
        raw,
        window.location.origin
      ).pathname || "/";
    }
  } catch {
    return "/";
  }

  let pathname = raw
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/") || "/";

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";

  return pathname;
}

function isPublicHomeFastPath(
  rawInitialPath = "/"
) {
  return (
    pathnameFromInitialPath(
      rawInitialPath
    ) === PUBLIC_HOME_PATH
  );
}

function safeError(
  error = null
) {
  if (!error) {
    return null;
  }

  return {
    name:
      cleanText(
        error?.name,
        "Error"
      ),

    message:
      redact(
        error?.message ||
        String(error)
      ),

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      null,

    code:
      cleanText(
        error?.code ||
        error?.error ||
        "",
        ""
      ) ||
      null,
  };
}

/* =========================================================
   AUTH RESULT
========================================================= */

function authResultOk(
  value = null
) {
  if (value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  if (isObject(value)) {
    return (
      value.ok !== false
    );
  }

  return (
    value !== null &&
    value !== undefined
  );
}

function authResultAuthenticated(
  value = null
) {
  return Boolean(
    isObject(value) &&
    value.authenticated === true
  );
}

/* =========================================================
   BOOT OBSERVABILITY
========================================================= */

function setBootPhase(
  phase = BOOT_PHASES.BOOTING
) {
  bootPhase =
    cleanText(
      phase,
      BOOT_PHASES.BOOTING
    );

  return bootPhase;
}

function resetBootSteps() {
  bootSteps =
    Object.create(null);
}

function recordBootStep(
  name = "",
  result = {}
) {
  const key =
    cleanText(
      name,
      ""
    );

  if (!key) {
    return null;
  }

  const entry =
    Object.freeze({
      called:
        result?.called === true,

      ok:
        result?.ok === true,

      status:
        cleanText(
          result?.status,
          result?.ok === true
            ? "ok"
            : "unknown"
        ),

      method:
        cleanText(
          result?.method,
          ""
        ) ||
        null,

      error:
        result?.error ||
        null,
    });

  bootSteps[key] =
    entry;

  return entry;
}

function snapshotBootSteps() {
  return Object.freeze({
    ...bootSteps,
  });
}

/* =========================================================
   PAYLOADS
========================================================= */

/*
  Los módulos generales reciben una ruta saneada.

  Sólo Router.start() recibe después la URL real:
  el Router es quien necesita poder interpretar ?token=... durante
  password-reset y otros flujos públicos con query sensible.
*/
function createBootPayload(
  options = {},
  safeInitialPath = "/"
) {
  return {
    ...options,

    source:
      cleanText(
        options?.source,
        "app"
      ),

    version:
      APP_VERSION,

    initialPath:
      redact(
        safeInitialPath
      ) ||
      "/",

    AppCore,
    core: AppCore,

    Router,
  };
}

function createRouterPayload(
  payload = {},
  rawInitialPath = "/"
) {
  return {
    ...payload,

    /*
      Único handoff interno de la URL sin redacción.
      No se almacena en snapshots del App.
    */
    initialPath:
      cleanText(
        rawInitialPath,
        "/"
      ),
  };
}

/* =========================================================
   SAFE CALL
========================================================= */

async function call(
  target = null,
  method = "",
  payload = {},
  critical = true
) {
  const methodName =
    cleanText(
      method,
      ""
    );

  const fn =
    target?.[
      methodName
    ];

  if (!isFunction(fn)) {
    const missing = {
      called: false,
      ok: false,
      status: "missing",
      method:
        methodName,
      value: null,
      error: null,
    };

    if (critical) {
      const error =
        new Error(
          `${methodName || "Método crítico"} no disponible durante el boot.`
        );

      error.code =
        "APP_BOOT_METHOD_MISSING";

      throw error;
    }

    return missing;
  }

  try {
    return {
      called: true,
      ok: true,
      status: "ok",
      method:
        methodName,
      value:
        await fn.call(
          target,
          payload
        ),
      error: null,
    };
  } catch (error) {
    const failure = {
      called: true,
      ok: false,
      status: "failed",
      method:
        methodName,
      value: null,
      error:
        safeError(
          error
        ),
    };

    if (critical) {
      throw error;
    }

    return failure;
  }
}

/* =========================================================
   BOOT STEPS
========================================================= */

async function initCore(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.CORE
  );

  const result =
    await call(
      AppCore,
      "init",
      payload,
      true
    );

  recordBootStep(
    "core",
    result
  );

  return result.value;
}

async function initToast(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.TOAST
  );

  const toast = await ensureToast();

  const result =
    await call(
      toast,
      "init",
      withRuntimeModules(payload),
      false
    );

  recordBootStep(
    "toast",
    result
  );

  return result.value;
}

async function initAuth(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.AUTH
  );

  const auth = await ensureAuth();

  /*
    Auth se inicializa sin restaurar aquí.
    restoreSession() se ejecuta una sola vez después.
  */
  const result =
    await call(
      auth,
      "init",
      {
        ...withRuntimeModules(payload),
        ...AUTH_BOOT_OPTIONS,
        restoreOnBoot: false,
      },
      true
    );

  recordBootStep(
    "auth",
    result
  );

  return result.value;
}

async function restoreAuth(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.RESTORE
  );

  const auth = await ensureAuth();

  /*
    La ausencia de sesión NO es un fallo fatal del App.

    Auth.restoreSession():
    - reutiliza sesión si ya está autenticada;
    - prueba /me si existe access token;
    - puede intentar refresh con cookie httpOnly;
    - devuelve resultado anónimo si no existe sesión restaurable;
    - no debe impedir que Router renderice rutas públicas.
  */
  const result =
    await call(
      auth,
      "restoreSession",
      {
        ...withRuntimeModules(payload),
        ...AUTH_BOOT_OPTIONS,
      },
      false
    );

  recordBootStep(
    "restoreAuth",
    result
  );

  const value =
    result.value;

  lastRestore =
    Object.freeze({
      attempted:
        result.called,

      method:
        result.method,

      transportOk:
        result.called
          ? result.ok === true
          : null,

      ok:
        result.called
          ? (
              result.ok === true &&
              authResultOk(
                value
              )
            )
          : null,

      authenticated:
        authResultAuthenticated(
          value
        ),

      skippedRefresh:
        isObject(value)
          ? value.skippedRefresh === true
          : false,

      reason:
        isObject(value)
          ? (
              cleanText(
                value.reason,
                ""
              ) ||
              null
            )
          : null,

      error:
        result.error,
    });

  return value;
}

async function initGlobalUI(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.UI
  );

  /*
    Se mantiene secuencial:
    no introducimos concurrencia entre módulos UI sin necesidad.
  */
  const sidebar = await ensureSidebarUI();
  const sidebarResult =
    await call(
      sidebar,
      "init",
      withRuntimeModules(payload),
      false
    );

  recordBootStep(
    "sidebar",
    sidebarResult
  );

  const topbar = await ensureTopbarUI();
  const topbarResult =
    await call(
      topbar,
      "init",
      withRuntimeModules(payload),
      false
    );

  recordBootStep(
    "topbar",
    topbarResult
  );

  return {
    sidebar:
      sidebarResult.value,

    topbar:
      topbarResult.value,
  };
}

function notifyPublicHomeSessionHydrated() {
  if (!isBrowser()) return false;

  try {
    document.dispatchEvent(
      new Event("public-home:ready")
    );
    return true;
  } catch {
    return false;
  }
}

function hydratePublicHomeInBackground(
  payload = {}
) {
  if (publicHydrationPromise) {
    return publicHydrationPromise;
  }

  publicHydrationPromise = (async () => {
    await initToast(payload);
    const restored = await restoreAuth(payload);

    /*
      El chrome privado no aporta nada a una visita pública anónima. Sólo se
      hidrata si realmente existe una sesión autenticada restaurada.
    */
    if (
      authResultAuthenticated(restored) ||
      lastRestore?.authenticated === true
    ) {
      await initGlobalUI(payload);
    }

    notifyPublicHomeSessionHydrated();
    return true;
  })()
    .catch((error) => {
      try {
        console.error(
          "[Onion App] Hidratación pública no crítica:",
          safeError(error)
        );
      } catch {
        // noop
      }
      return false;
    })
    .finally(() => {
      publicHydrationPromise = null;
      if (ready) {
        setBootPhase(
          BOOT_PHASES.READY
        );
      }
    });

  return publicHydrationPromise;
}

function clearPublicHydrationSchedule() {
  if (!isBrowser()) return false;

  if (publicHydrationTimer) {
    window.clearTimeout(publicHydrationTimer);
    publicHydrationTimer = 0;
  }

  if (publicHydrationInteractionHandler) {
    for (const eventName of PUBLIC_HYDRATION_INTERACTION_EVENTS) {
      window.removeEventListener(
        eventName,
        publicHydrationInteractionHandler,
        true
      );
    }
    publicHydrationInteractionHandler = null;
  }

  return true;
}

function schedulePublicHomeHydration(payload = {}) {
  if (!isBrowser()) return false;
  if (publicHydrationPromise || publicHydrationTimer) return true;

  const start = () => {
    clearPublicHydrationSchedule();
    void hydratePublicHomeInBackground(payload);
  };

  publicHydrationInteractionHandler = start;

  for (const eventName of PUBLIC_HYDRATION_INTERACTION_EVENTS) {
    window.addEventListener(eventName, start, {
      once: true,
      capture: true,
      passive: eventName !== "keydown",
    });
  }

  publicHydrationTimer = window.setTimeout(
    start,
    PUBLIC_HYDRATION_DELAY_MS
  );

  return true;
}

async function startRouter(
  payload = {},
  rawInitialPath = "/"
) {
  setBootPhase(
    BOOT_PHASES.ROUTER
  );

  const result =
    await call(
      Router,
      "start",
      createRouterPayload(
        withRuntimeModules(payload),
        rawInitialPath
      ),
      true
    );

  recordBootStep(
    "router",
    result
  );

  return result.value;
}

/* =========================================================
   BOOT STATE
========================================================= */

function markBooting() {
  ready = false;
  lastError = null;
  lastRestore = null;

  bootStartedAt =
    Date.now();

  lastReadyAt = 0;
  lastBootDurationMs =
    null;

  resetBootSteps();
  publicFastBoot = false;

  setBootPhase(
    BOOT_PHASES.BOOTING
  );

  try {
    showLoader(
      "booting"
    );
  } catch {
    // loader best-effort
  }
}

function markReady() {
  ready = true;
  lastError = null;

  lastReadyAt =
    Date.now();

  lastBootDurationMs =
    bootStartedAt > 0
      ? Math.max(
          0,
          lastReadyAt -
          bootStartedAt
        )
      : null;

  setBootPhase(
    BOOT_PHASES.READY
  );

  try {
    hideLoader();
  } catch {
    // loader best-effort
  }
}

function markFailed(
  error = null
) {
  ready = false;
  lastError =
    safeError(
      error
    );

  lastBootDurationMs =
    bootStartedAt > 0
      ? Math.max(
          0,
          Date.now() -
          bootStartedAt
        )
      : null;

  setBootPhase(
    BOOT_PHASES.FAILED
  );

  try {
    hideLoader();
  } catch {
    // Main mantiene fatal boundary adicional
  }
}

/* =========================================================
   RUN
========================================================= */

async function runBoot(
  options = {}
) {
  /*
    rawInitialPath puede contener token.
    Se conserva únicamente en este scope y en el handoff a Router.
  */
  const rawInitialPath =
    resolveInitialPath(
      options
    );

  const safeInitialPath =
    redact(
      rawInitialPath
    ) ||
    "/";

  const payload =
    createBootPayload(
      options,
      safeInitialPath
    );

  markBooting();

  publicFastBoot =
    isPublicHomeFastPath(
      rawInitialPath
    );

  await initCore(
    payload
  );

  /*
    Fast-path exclusivo de la home pública exacta (/):
    - NO descarga Auth, Toast, Sidebar ni Topbar antes del primer render.
    - Router trata la ruta pública como anónima si Auth aún no está registrado.
    - El loader se retira antes de cualquier módulo privado o refresh/me remoto.
    - Auth/Toast/UI se descargan e hidratan después en background.

    Ninguna otra ruta usa este atajo. Login/reset/activation y todas las
    rutas privadas mantienen el orden histórico seguro de boot.
  */
  if (publicFastBoot) {
    await startRouter(
      payload,
      rawInitialPath
    );

    markReady();

    schedulePublicHomeHydration(
      payload
    );

    return App;
  }

  /*
    Orden contractual para rutas no fast-path:

    1. Core.
    2. Toast opcional.
    3. Auth.init sin restore.
    4. Auth.restoreSession.
    5. Sidebar/Topbar.
    6. Router.start con URL real.
    7. Loader hidden / App ready.
  */
  await initToast(
    payload
  );

  await initAuth(
    payload
  );

  await restoreAuth(
    payload
  );

  await initGlobalUI(
    payload
  );

  await startRouter(
    payload,
    rawInitialPath
  );

  markReady();

  return App;
}

/* =========================================================
   PUBLIC BOOT
========================================================= */

export function bootApp(
  options = {}
) {
  if (!isBrowser()) {
    return Promise.resolve(
      App
    );
  }

  if (ready) {
    return Promise.resolve(
      App
    );
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise =
    runBoot(
      options
    )
      .catch(
        (error) => {
          markFailed(
            error
          );

          throw error;
        }
      )
      .finally(
        () => {
          bootPromise =
            null;
        }
      );

  return bootPromise;
}

export function isReady() {
  return ready;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppSnapshot() {
  return Object.freeze({
    version:
      APP_VERSION,

    ready,

    booting:
      Boolean(
        bootPromise
      ),

    phase:
      bootPhase,

    path:
      redact(
        currentPath()
      ) ||
      "/",

    boot:
      Object.freeze({
        startedAt:
          bootStartedAt ||
          null,

        readyAt:
          lastReadyAt ||
          null,

        durationMs:
          lastBootDurationMs,

        steps:
          snapshotBootSteps(),
      }),

    lastError,
    lastRestore,

    publicFastBoot,
    publicHydrationPending:
      Boolean(
        publicHydrationPromise
      ),

    modules:
      Object.freeze({
        core:
          Boolean(
            AppCore
          ),

        auth:
          Boolean(
            Auth
          ),

        router:
          Boolean(
            Router
          ),

        toast:
          Boolean(
            Toast
          ),

        sidebar:
          Boolean(
            SidebarUI
          ),

        topbar:
          Boolean(
            TopbarUI
          ),
      }),
  });
}

/* =========================================================
   API
========================================================= */

export const App =
  Object.freeze({
    version:
      APP_VERSION,

    boot:
      bootApp,

    bootApp,

    isReady,

    getSnapshot:
      getAppSnapshot,

    getDebugSnapshot:
      getAppSnapshot,

    snapshot:
      getAppSnapshot,
  });

export default App;

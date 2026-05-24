/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Boot mínimo de la SPA.
   - Iniciar Core.
   - Iniciar I18n.
   - Iniciar Toast.
   - Registrar bridge UI mínimo de Toast.
   - Iniciar Auth.
   - Restaurar sesión ANTES del primer render Router.
   - Delegar restore compat en /src/app/session.js.
   - Delegar Router en /src/app/router.js.
   - Configurar Router antes del primer render.
   - Registrar Sidebar/Topbar después de Auth + Router config.
   - Renderizar ruta inicial capturada por main.js.
   - Sincronizar Sidebar/Topbar después del primer render.
   - Refrescar textos i18n.
   - Ocultar loader sólo cuando el boot termina correctamente.
   - Sin Store.
   - Sin Services paralelos.
   - Sin warmup.
   - Sin repair loops.
   - Sin eventos custom.
   - Sin fetch.
   - Sin storage.
   - Sin lógica de dominio.
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

import {
  restoreAuthSession,
} from "./session.js";

import {
  configureRouter,
  renderInitialRoute as renderRouterInitialRoute,
} from "./router.js";

import {
  initUISystems,
  getUISystemsSnapshot,
} from "./ui.js";

export const APP_INDEX_VERSION = "app.index.v9";

let bootPromise = null;
let ready = false;
let lastBootError = null;
let lastRestoreResult = null;

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
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function safeError(error = null) {
  if (!error) return null;

  return {
    name: error.name || "Error",
    message: redact(error.message || String(error)),
    code: error.code || null,
    status: error.status || error.statusCode || error.response?.status || null,
  };
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
  };
}

function withCore(payload = {}, extra = {}) {
  return {
    ...payload,
    AppCore,
    core: AppCore,
    ...extra,
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
   UI STATE
========================================================= */

function setBusy() {
  try {
    markShellBusy();
  } catch {
    // noop
  }

  try {
    showLoader("booting");
  } catch {
    // noop
  }
}

function setReady() {
  try {
    markShellReady();
  } catch {
    // noop
  }

  try {
    hideLoader();
  } catch {
    // noop
  }
}

/* =========================================================
   CORE REGISTRY
========================================================= */

function setCoreModuleProperty(name = "", module = null) {
  if (!name || !module) return false;

  try {
    AppCore[name] = module;
    return true;
  } catch {
    return false;
  }
}

function registerCoreModule(name = "", module = null) {
  if (!name || !module || !isFunction(AppCore?.modules?.register)) {
    return false;
  }

  try {
    AppCore.modules.register(name, module);
    return true;
  } catch {
    return false;
  }
}

function exposeCoreModules() {
  const modules = [
    ["auth", "Auth", Auth],
    ["router", "Router", Router],
    ["i18n", "I18n", I18n],
    ["toast", "Toast", Toast],
  ];

  for (const [lowerName, upperName, module] of modules) {
    setCoreModuleProperty(lowerName, module);
    setCoreModuleProperty(upperName, module);

    registerCoreModule(lowerName, module);
    registerCoreModule(upperName, module);
  }

  return true;
}

/* =========================================================
   CORE / I18N / TOAST / UI COMPAT
========================================================= */

async function initCore(payload = {}) {
  await callRequired(AppCore, "init", "AppCore", payload);
  exposeCoreModules();

  return AppCore;
}

async function initI18n(payload = {}) {
  if (isFunction(I18n?.bindCore)) {
    try {
      I18n.bindCore(AppCore);
    } catch {
      // noop
    }
  }

  await callRequired(I18n, "init", "I18n", withCore(payload, {
    updateDOM: false,
    updateUi: false,
  }));

  return I18n;
}

async function initToast(payload = {}) {
  await callRequired(Toast, "init", "Toast", withCore(payload));

  /*
    Bridge mínimo: expone AppCore.showToast si no existe.
    No crea sistema UI paralelo y no pisa implementaciones existentes.
  */
  try {
    initUISystems({
      ...withCore(payload),
      Toast,
    });
  } catch {
    // compat pasiva, no debe romper boot
  }

  return Toast;
}

function refreshI18nDom() {
  if (!isFunction(I18n?.updateDOM)) {
    return false;
  }

  try {
    I18n.updateDOM();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   AUTH
========================================================= */

function authPayload(payload = {}) {
  return withCore(payload, {
    Auth,

    persistent: true,
    restoreOnBoot: true,
    allowSilentRefresh: true,
    silentRefresh: true,

    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
  });
}

async function initAuth(payload = {}) {
  await callRequired(Auth, "init", "Auth", authPayload(payload));
  exposeCoreModules();

  return Auth;
}

async function restoreAuth(payload = {}) {
  /*
    No llamar Auth.syncAuthState() aquí.
    El restore real ya decide si aplica sesión, refresca o limpia.
    App sólo espera el resultado antes del primer render del Router.
  */
  const result = await restoreAuthSession(authPayload(payload));

  lastRestoreResult = isObject(result)
    ? {
        ok: Boolean(result.ok),
        restored: Boolean(result.restored),
        authenticated: Boolean(result.authenticated),
        hasUser: Boolean(
          result.user ||
            result.currentUser ||
            result.result?.user ||
            result.result?.currentUser
        ),
        hasSession: Boolean(result.session || result.result?.session),
        source: cleanText(
          result.source || result.result?.source,
          "app.session"
        ),
      }
    : null;

  return result;
}

/* =========================================================
   ROUTER
========================================================= */

async function initRouter(payload = {}) {
  await configureRouter(withCore(payload, {
    source: "app.router",
  }));

  return Router;
}

async function renderInitialRoute(payload = {}) {
  await renderRouterInitialRoute(withCore(payload, {
    source: "app.boot",
  }));

  return Router;
}

/* =========================================================
   CHROME
========================================================= */

async function initChrome(payload = {}) {
  await callRequired(SidebarUI, "init", "SidebarUI", withCore(payload));
  await callRequired(TopbarUI, "init", "TopbarUI", withCore(payload));

  return true;
}

async function syncChrome(payload = {}) {
  await callOptional(SidebarUI, "sync", withCore(payload));
  await callOptional(TopbarUI, "sync", withCore(payload));

  return true;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const payload = createBootPayload(options);

  lastBootError = null;
  lastRestoreResult = null;

  setBusy();

  try {
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
      Router queda configurado antes de registrar chrome.
      Sidebar/Topbar necesitan rutas reales y Auth restaurado.
    */
    await initRouter(payload);

    /*
      Chrome se registra ANTES del primer render de ruta.
      Esto permite que Home pueda consumir AppCore.ui.sidebar.getSnapshot()
      durante su primer render sin caer a "Usuario".
    */
    await initChrome(payload);

    /*
      Primer render real de la SPA.
      A partir de aquí la vista Home ya puede recibir usuario/chrome/contexto.
    */
    await renderInitialRoute(payload);

    /*
      Re-sincronización final de chrome con la ruta ya renderizada.
      Mantiene visibilidad, active item, route mode y mounts correctos.
    */
    await syncChrome(payload);

    refreshI18nDom();

    ready = true;
    setReady();

    return App;
  } catch (error) {
    ready = false;
    lastBootError = safeError(error);

    /*
      No marcar shell ready ni ocultar loader aquí.
      El fatal UI lo gestiona /src/main.js, que es el entrypoint real.
    */
    throw error;
  }
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

    lastBootError,
    lastRestoreResult,

    modules: {
      core: Boolean(AppCore),
      auth: Boolean(Auth),
      router: Boolean(Router),
      i18n: Boolean(I18n),
      toast: Boolean(Toast),
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
    },

    ui: getUISystemsSnapshot({
      AppCore,
      Toast,
    }),

    state: {
      authenticated: AppCore?.state?.authenticated === true,
      hasToken: AppCore?.state?.hasToken === true,
      hasRefreshToken: AppCore?.state?.hasRefreshToken === true,
      hasUser: Boolean(AppCore?.state?.user || AppCore?.state?.currentUser),
      route: redact(AppCore?.state?.route || ""),
      canonicalPath: redact(AppCore?.state?.canonicalPath || ""),
      publicPath: redact(AppCore?.state?.publicPath || ""),
      routeMode: AppCore?.state?.routeMode || null,
      chromeVisible: AppCore?.state?.chromeVisible ?? null,
    },

    policy: {
      singleEntryPoint: true,
      bootAppContract: true,

      restoresAuthBeforeRouterRender: true,
      sessionRestoreDelegated: true,
      appDoesNotForceAuthSyncAfterRestore: true,

      routerDelegatedToAppRouter: true,
      routerConfiguredBeforeChrome: true,
      initialRouteDelegatedToAppRouter: true,

      chromeRegisteredBeforeInitialRoute: true,
      chromeSyncedAfterInitialRoute: true,

      toastBridgeRegisteredAfterToastInit: true,

      noStore: true,
      noParallelServices: true,
      noWarmup: true,
      noRepairLoops: true,
      noCustomEvents: true,
      noFetch: true,
      noStorage: true,
      noDomainLogic: true,

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

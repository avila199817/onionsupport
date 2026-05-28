/* =========================================================
   Onion Support - App
   Archivo: /src/app/index.js

   Responsabilidad:
   - Orquestar el boot mínimo de la SPA.
   - Delegar Core, I18n, Toast, Auth, Router, Shell, Loader y UI.
   - Restaurar sesión antes del primer render Router.
   - Pedir restore con silent refresh y cookie httpOnly.
   - No limpiar sesión por access token caducado/rotado.
   - Sin Store, Services paralelos, warmup, eventos custom, fetch,
     storage ni lógica de dominio.
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
  markBootStart,
  markBootReady,
  markBootError,
  getBootStateSnapshot,
} from "./boot-state.js";

import {
  initI18n as initAppI18n,
  getI18nSnapshot,
} from "./i18n.js";

import {
  restoreAuthSession,
  getSessionBootstrapSnapshot,
} from "./session.js";

import {
  configureRouter,
  renderInitialRoute as renderRouterInitialRoute,
  getRouterBootstrapState,
} from "./router.js";

import {
  initUISystems,
  getUISystemsSnapshot,
} from "./ui.js";

export const APP_INDEX_VERSION = "app.index.v12";

const CORE_MODULES = Object.freeze([
  ["auth", "Auth", Auth],
  ["router", "Router", Router],
  ["i18n", "I18n", I18n],
  ["toast", "Toast", Toast],
]);

const AUTH_BOOT_OPTIONS = Object.freeze({
  persistent: true,
  restoreOnBoot: true,

  allowSilentRefresh: true,
  allowCookieRefresh: true,
  silentRefresh: true,

  credentials: "include",

  skipNavigation: true,
  skipRedirect: true,
  noRedirect: true,
});

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

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function safeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error.name, "Error"),
    message: redact(error.message || String(error)),
    code: error.code || error.error || null,
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

function createBootPayload(options = {}) {
  const input = isPlainObject(options) ? options : {};

  const initialPath = cleanText(
    input.bootContext?.initialPath || input.initialPath || currentPath(),
    "/"
  );

  return {
    ...input,
    source: cleanText(input.source, "app"),
    initialPath,
    bootContext: {
      ...(isPlainObject(input.bootContext) ? input.bootContext : {}),
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

function withSource(payload = {}, source = "app.index") {
  return {
    ...payload,
    source,
  };
}

/* =========================================================
   SAFE CALLS
========================================================= */

function safeCall(fn) {
  try {
    return isFunction(fn) ? fn() : null;
  } catch {
    return null;
  }
}

async function safeAsyncCall(fn) {
  try {
    return isFunction(fn) ? await fn() : null;
  } catch {
    return null;
  }
}

async function callRequired(target = null, method = "", label = "Módulo", payload = {}) {
  const fn = target?.[method];

  if (!isFunction(fn)) {
    throw new Error(`${label}.${method}() no disponible.`);
  }

  return fn.call(target, payload);
}

async function callOptional(target = null, method = "", payload = {}) {
  const fn = target?.[method];
  return isFunction(fn) ? fn.call(target, payload) : null;
}

/* =========================================================
   BOOT UI STATE
========================================================= */

function markBusy(payload = {}) {
  const statePayload = withSource(payload);

  safeCall(() => markBootStart(AppCore, statePayload));
  safeCall(() => markShellBusy());
  safeCall(() => showLoader("booting"));
}

function markReady(payload = {}) {
  const statePayload = withSource(payload);

  safeCall(() => markBootReady(AppCore, statePayload));
  safeCall(() => markShellReady());
  safeCall(() => hideLoader());
}

function markError(error = null, payload = {}) {
  safeCall(() => markBootError(AppCore, error, withSource(payload)));
}

/* =========================================================
   CORE REGISTRY
========================================================= */

function getCoreRegistrar() {
  if (isFunction(AppCore?.registerModule)) {
    return AppCore.registerModule.bind(AppCore);
  }

  if (isFunction(AppCore?.modules?.register)) {
    return AppCore.modules.register.bind(AppCore.modules);
  }

  return null;
}

function exposeCoreModule(name = "", module = null, registrar = null) {
  if (!name || !module) return false;

  safeCall(() => {
    AppCore[name] = module;
  });

  if (!registrar) return true;

  try {
    registrar(name, module, { overwrite: true });
    return true;
  } catch {
    return false;
  }
}

function exposeCoreModules() {
  const registrar = getCoreRegistrar();

  for (const [lowerName, upperName, module] of CORE_MODULES) {
    exposeCoreModule(lowerName, module, registrar);
    exposeCoreModule(upperName, module, registrar);
  }

  return true;
}

/* =========================================================
   SESSION SUMMARY
========================================================= */

function normalizeRestoreSummary(result = null) {
  if (!isPlainObject(result)) return null;

  const nested = isPlainObject(result.result) ? result.result : {};
  const data = isPlainObject(result.data) ? result.data : {};
  const auth = isPlainObject(result.auth) ? result.auth : {};
  const snapshot = isPlainObject(result.snapshot) ? result.snapshot : {};

  return {
    ok: result.ok !== false,

    restoreCompleted: result.restoreCompleted === true,

    restored: Boolean(
      result.restored ||
        nested.restored ||
        data.restored ||
        auth.restored ||
        snapshot.restored
    ),

    authenticated: Boolean(
      result.authenticated ||
        nested.authenticated ||
        data.authenticated ||
        auth.authenticated ||
        snapshot.authenticated
    ),

    hasUser: Boolean(
      result.user ||
        result.currentUser ||
        nested.user ||
        nested.currentUser ||
        data.user ||
        data.currentUser ||
        auth.user ||
        auth.currentUser ||
        snapshot.hasUser
    ),

    hasSession: Boolean(
      result.session ||
        result.currentSession ||
        nested.session ||
        nested.currentSession ||
        data.session ||
        data.currentSession ||
        auth.session ||
        auth.currentSession ||
        snapshot.hasSession
    ),

    supportsHttpOnlyRefresh: Boolean(
      result.supportsHttpOnlyRefresh ||
        nested.supportsHttpOnlyRefresh ||
        data.supportsHttpOnlyRefresh ||
        auth.supportsHttpOnlyRefresh ||
        snapshot.supportsHttpOnlyRefresh
    ),

    hasCookieRefreshCandidate: Boolean(
      result.hasCookieRefreshCandidate ||
        nested.hasCookieRefreshCandidate ||
        data.hasCookieRefreshCandidate ||
        auth.hasCookieRefreshCandidate ||
        snapshot.hasCookieRefreshCandidate
    ),

    source: cleanText(
      result.source ||
        nested.source ||
        data.source ||
        auth.source ||
        snapshot.source,
      "app.session"
    ),
  };
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const payload = createBootPayload(options);

  const corePayload = withCore(payload);

  const authPayload = withCore(payload, {
    Auth,
    ...AUTH_BOOT_OPTIONS,
  });

  ready = false;
  lastBootError = null;
  lastRestoreResult = null;

  markBusy(payload);

  try {
    await callRequired(AppCore, "init", "AppCore", payload);
    exposeCoreModules();

    await initAppI18n(withCore(payload, {
      I18n,
      updateDOM: false,
      updateUi: false,
    }));

    await callRequired(Toast, "init", "Toast", corePayload);

    await safeAsyncCall(() => initUISystems(withCore(payload, {
      Toast,
    })));

    await callRequired(Auth, "init", "Auth", authPayload);

    /*
      Punto crítico:
      restore antes de configurar/renderizar Router.
      Auth decide /api/auth/me, refresh silencioso, cookie httpOnly y limpieza
      sólo si backend confirma sesión inválida.
    */
    const restoreResult = await restoreAuthSession(authPayload);
    lastRestoreResult = normalizeRestoreSummary(restoreResult);

    await configureRouter(withSource(corePayload, "app.router"));

    await callRequired(SidebarUI, "init", "SidebarUI", corePayload);
    await callRequired(TopbarUI, "init", "TopbarUI", corePayload);

    await renderRouterInitialRoute(withSource(corePayload, "app.boot"));

    await callOptional(SidebarUI, "sync", corePayload);
    await callOptional(TopbarUI, "sync", corePayload);

    safeCall(() => I18n.updateDOM());

    ready = true;
    markReady(payload);

    return App;
  } catch (error) {
    ready = false;
    lastBootError = safeError(error);

    markError(error, payload);

    throw error;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getAppSnapshot() {
  const state = AppCore?.state || {};

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

    bootState: getBootStateSnapshot(AppCore),

    session: getSessionBootstrapSnapshot({
      AppCore,
      Auth,
    }),

    router: getRouterBootstrapState(),

    i18n: getI18nSnapshot({
      AppCore,
      I18n,
    }),

    ui: getUISystemsSnapshot({
      AppCore,
      Toast,
    }),

    state: {
      initialized: state.initialized === true,
      ready: state.ready === true,

      authenticated: state.authenticated === true,
      hasToken: state.hasToken === true,
      hasRefreshToken: state.hasRefreshToken === true,
      hasUser: Boolean(state.user || state.currentUser),

      role: state.role || null,
      userSlug: state.userSlug || null,
      homePath: redact(state.homePath || ""),

      route: redact(state.route || ""),
      canonicalPath: redact(state.canonicalPath || ""),
      publicPath: redact(state.publicPath || ""),

      routeMode: state.routeMode || null,
      chromeVisible: state.chromeVisible ?? null,
    },

    policy: {
      singleEntryPoint: true,
      delegatesCoreAuthRouterUi: true,
      restoresAuthBeforeRouterRender: true,

      restoreUsesSilentRefresh: true,
      restoreUsesCookieRefresh: true,
      credentialsInclude: true,
      tokenExpiredDoesNotMeanLogout: true,

      noStore: true,
      noParallelServices: true,
      noWarmup: true,
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
  if (!isBrowser() || ready) return Promise.resolve(App);
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
  bootApp,
  isReady,

  getSnapshot: getAppSnapshot,
  getDebugSnapshot: getAppSnapshot,
  snapshot: getAppSnapshot,
};

export default App;

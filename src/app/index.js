/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   APP ORCHESTRATOR · SIMPLE
   - boot lógico único de la SPA
   - delega en Core/Auth/Router/UI/I18n/Store/Services
   - preserva rutas públicas técnicas con token
   - render público técnico antes de restore
   - restore normal sólo en flujo privado
   - sin HTTP/Auth/Router/Toast/storage paralelos
========================================================= */

import { AppCore } from "../core/index.js";
import { Store } from "../store/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";
import { Http as ServiceHttp } from "../services/index.js";

import { SidebarUI } from "../ui/sidebar/index.js";
import { TopbarUI } from "../ui/topbar/index.js";
import { Toast } from "../ui/toast/index.js";
import { I18n } from "../i18n/index.js";

import { showLoader, hideLoader, forceHideLoader } from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,
} from "./shell.js";

import { initI18n, syncLangState } from "./i18n.js";
import { initUISystems, syncUserUI, repairUISystems } from "./ui.js";
import { configureRouter, bindRouter, renderInitialRoute } from "./router.js";
import { restoreSessionInBackground } from "./session.js";
import { renderBootError, bindGlobalErrorHandlers } from "./errors.js";
import { bindAppEvents } from "./events.js";
import { warmup } from "./warmup.js";

import {
  captureInitialUrl as captureRouterInitialUrl,
  getCurrentPublicPath as getRouterCurrentPublicPath,
} from "../router/helpers.js";

import {
  isPublicTechnicalRoute,
  hasActivationToken,
  hasResetToken,
  hasTokenInUrl,
  redactTokenInText,
} from "../features/auth/helpers.js";

export const APP_VERSION = "21.0.1-simple";

const SOURCE = "app.index";
const RUNTIME_APP_KEY = "__ONION_APP__";
const AUTO_BOOT_KEY = "__ONION_ALLOW_APP_AUTO_BOOT__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const DEFAULT_ROUTE = "/";

let bootPromise = null;
let booted = false;
let booting = false;
let eventsBound = false;
let lastError = null;
let lastReadyAt = "";

const disposers = [];

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function call(fn, fallback = null, ...args) {
  try {
    return isFn(fn) ? fn(...args) : fallback;
  } catch {
    return fallback;
  }
}

async function callAsync(fn, fallback = null, ...args) {
  try {
    return isFn(fn) ? await fn(...args) : fallback;
  } catch {
    return fallback;
  }
}

function getCoreState() {
  try {
    return AppCore?.state && typeof AppCore.state === "object" ? AppCore.state : {};
  } catch {
    return {};
  }
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "");
  }
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  if (/token|secret|password|authorization|credential|cookie|jwt|bearer|session|refresh|otp|mfa|2fa|code/i.test(keyHint)) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: text(value.name, "Error"),
      message: redact(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function debugEnabled() {
  try {
    return Boolean(AppCore?.config?.debug || AppCore?.config?.diagnostics?.enabled);
  } catch {
    return false;
  }
}

function log(...args) {
  if (!debugEnabled()) return;

  try {
    AppCore?.utils?.log?.("[App]", ...args.map((item) => sanitize(item)));
  } catch {
    try { console.log("[App]", ...args.map((item) => sanitize(item))); } catch {}
  }
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[App]", ...args.map((item) => sanitize(item)));
  } catch {
    try { console.warn("[App]", ...args.map((item) => sanitize(item))); } catch {}
  }
}

function errorLog(...args) {
  try {
    AppCore?.utils?.error?.("[App]", ...args.map((item) => sanitize(item)));
  } catch {
    try { console.error("[App]", ...args.map((item) => sanitize(item))); } catch {}
  }
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({
    source: SOURCE,
    version: APP_VERSION,
    at: isoNow(),
    ...object(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   PATH / PUBLIC BOOT
========================================================= */

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;
    if (hash?.startsWith?.("#/") || hash?.startsWith?.("#!")) return hash.replace(/^#!?\/?/, "/") || DEFAULT_ROUTE;
    return `${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function currentPublicPath() {
  return (
    call(() => Router?.getCurrentPublicPath?.(), "") ||
    call(() => getRouterCurrentPublicPath?.(AppCore), "") ||
    AppCore?.state?.publicPath ||
    browserPath()
  );
}

function publicBootContext({ capture = false } = {}) {
  if (capture) call(captureRouterInitialUrl, false);

  const publicPath = currentPublicPath();
  const active = call(isPublicTechnicalRoute, false, publicPath) === true;
  const tokenRoute = Boolean(
    call(hasActivationToken, false, publicPath) ||
      call(hasResetToken, false, publicPath) ||
      call(hasTokenInUrl, false, publicPath, "twoFactor")
  );

  return { active, tokenRoute, publicPath };
}

function hasLocalToken() {
  try {
    const state = object(AppCore?.state);
    const session = object(state.session || state.sessionData);
    const token = state.token || state.accessToken || state.access_token || session.token || session.accessToken || session.access_token || "";

    if (state.hasToken === true || text(token, "")) return true;
  } catch {}

  try {
    if (isFn(Auth?.hasToken) && Auth.hasToken()) return true;
    if (isFn(Auth?.getToken) && text(Auth.getToken(), "")) return true;
    if (isFn(Auth?.getAccessToken) && text(Auth.getAccessToken(), "")) return true;
  } catch {}

  return false;
}

/* =========================================================
   CORE / MODULES
========================================================= */

function getCoreHttp() {
  try {
    return AppCore?.getHttpClient?.() || AppCore?.Http || AppCore?.http || AppCore?.services?.http || AppCore?.services?.api || AppCore?.apiClient || null;
  } catch {
    return null;
  }
}

function registerCoreModule(name = "", value = null, aliases = []) {
  const cleanName = text(name, "");
  if (!cleanName || !value) return false;

  try {
    AppCore?.modules?.register?.(cleanName, value, {
      overwrite: true,
      replace: true,
      aliases,
      source: SOURCE,
      silent: true,
      emit: false,
    });
    return true;
  } catch {}

  try {
    AppCore?.modules?.set?.(cleanName, value, {
      overwrite: true,
      replace: true,
      source: SOURCE,
      emit: false,
    });
    return true;
  } catch {
    return false;
  }
}

function exposeModulesToCore() {
  if (!AppCore || typeof AppCore !== "object") return false;

  try { AppCore.App = App; AppCore.app = App; } catch {}
  try { AppCore.Router = Router; AppCore.router = Router; } catch {}
  try { AppCore.Auth = Auth; AppCore.auth = Auth; } catch {}
  try { AppCore.Store = Store; AppCore.store = Store; } catch {}
  try { AppCore.Toast = Toast; AppCore.toast = Toast; } catch {}
  try { AppCore.I18n = I18n; AppCore.i18n = I18n; } catch {}
  try { AppCore.SidebarUI = SidebarUI; AppCore.sidebarUI = SidebarUI; AppCore.sidebar = SidebarUI; } catch {}
  try { AppCore.TopbarUI = TopbarUI; AppCore.topbarUI = TopbarUI; AppCore.topbar = TopbarUI; } catch {}

  registerCoreModule("App", App, ["app"]);
  registerCoreModule("Router", Router, ["router"]);
  registerCoreModule("Auth", Auth, ["auth"]);
  registerCoreModule("Store", Store, ["store"]);
  registerCoreModule("Toast", Toast, ["toast"]);
  registerCoreModule("I18n", I18n, ["i18n"]);
  registerCoreModule("SidebarUI", SidebarUI, ["sidebarUI", "sidebar"]);
  registerCoreModule("TopbarUI", TopbarUI, ["topbarUI", "topbar"]);

  try {
    AppCore.services = AppCore.services || {};
    AppCore.services.serviceHttp = ServiceHttp;
    AppCore.services.http = AppCore.services.http || getCoreHttp() || ServiceHttp;
    AppCore.services.api = AppCore.services.api || AppCore.services.http;
  } catch {}

  return true;
}

function buildDeps(extra = {}) {
  return {
    AppCore,
    App,
    Store,
    Auth,
    Router,
    Http: getCoreHttp() || ServiceHttp,
    ServiceHttp,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    getViewContainer,
    setShellVisibility,
    updateShellVisibilityByRoute,
    applyPostRenderLoaderPolicy,
    ...object(extra),
  };
}

function setState(patch = {}, options = {}) {
  const cleanPatch = object(patch);
  if (!Object.keys(cleanPatch).length) return false;

  try {
    AppCore?.setState?.(cleanPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      silent: true,
      ...object(options),
    });
    return true;
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function initTarget(target, deps = {}, names = ["init"]) {
  if (!target) return true;

  for (const name of names) {
    if (!isFn(target?.[name])) continue;

    try {
      const result = target[name](deps);
      return result !== false;
    } catch (withDepsError) {
      try {
        const result = target[name]();
        return result !== false;
      } catch (withoutDepsError) {
        warn(`${name} falló.`, withoutDepsError || withDepsError);
        return false;
      }
    }
  }

  return true;
}

/* =========================================================
   BOOT STEPS
========================================================= */

async function initCore() {
  exposeModulesToCore();

  if (isFn(AppCore?.installHttpBridge)) call(() => AppCore.installHttpBridge("app:init"));
  if (isFn(AppCore?.init)) await AppCore.init({ source: SOURCE, version: APP_VERSION });

  exposeModulesToCore();

  setState({
    appVersion: APP_VERSION,
    appBooting: true,
    appReady: false,
    appBooted: false,
    appSource: SOURCE,
  });

  return true;
}

async function initServices() {
  initTarget(ServiceHttp, buildDeps(), ["init", "boot", "start"]);
  setState({ servicesReady: true });
  return true;
}

async function initStore() {
  initTarget(Store, buildDeps(), ["init", "boot", "start"]);
  setState({ storeReady: true });
  return true;
}

async function initAuth() {
  initTarget(Auth, buildDeps({ skipRestore: true, skipNavigation: true, noRedirect: true }), ["init", "boot", "start"]);
  setState({ authReady: true });
  return true;
}

async function initLanguage() {
  await callAsync(initI18n, true, buildDeps());
  await callAsync(syncLangState, true, buildDeps({ reason: "app-boot" }));
  setState({ i18nReady: true, i18nInitialized: true });
  return true;
}

async function initRouter() {
  let configured = false;

  try { configured = configureRouter?.(buildDeps()) !== false; } catch (error) { warn("configureRouter falló.", error); }
  if (!configured) {
    try { configured = Router?.configure?.(buildDeps()) !== false; } catch (error) { warn("Router.configure falló.", error); }
  }
  if (!configured) {
    try { configured = Router?.init?.(buildDeps()) !== false; } catch (error) { warn("Router.init falló.", error); }
  }

  if (!configured) throw new Error("No se pudo configurar el Router.");

  let bound = false;

  try { bound = bindRouter?.(buildDeps()) !== false; } catch (error) { warn("bindRouter falló.", error); }
  if (!bound) {
    try { bound = Router?.bind?.(buildDeps()) !== false; } catch (error) { warn("Router.bind falló.", error); }
  }

  setState({ routerReady: true, routerBound: Boolean(bound) });
  return true;
}

async function initUI() {
  let ok = false;

  try {
    ok = initUISystems?.(buildDeps({ state: getCoreState(), scope: "app:ui" })) !== false;
  } catch (error) {
    warn("initUISystems falló.", error);
  }

  call(syncUserUI, null, buildDeps({ reason: "app-boot" }));
  call(repairUISystems, null, buildDeps({ reason: "app-boot" }));

  setState({ uiReady: Boolean(ok), uiInitialized: Boolean(ok) });
  return true;
}

async function bindEvents() {
  if (eventsBound) return true;
  eventsBound = true;

  try {
    const disposer = bindGlobalErrorHandlers?.(buildDeps({ scope: "app:errors" }));
    if (isFn(disposer)) disposers.push(disposer);
  } catch {}

  try {
    const disposer = bindAppEvents?.(buildDeps({
      scope: "app:events",
      syncUserUI: () => call(syncUserUI, null, buildDeps({ reason: "app-event" })),
      repairUISystems: () => call(repairUISystems, null, buildDeps({ reason: "app-event" })),
    }));

    if (isFn(disposer)) disposers.push(disposer);
  } catch {}

  return true;
}

/* =========================================================
   SESSION / ROUTER FLOW
========================================================= */

async function restoreSession({ skipNavigation = false } = {}) {
  if (!isFn(restoreSessionInBackground)) return null;

  try {
    return await restoreSessionInBackground(buildDeps({
      state: getCoreState(),
      warmup,
      skipNavigation,
      skipRedirect: skipNavigation,
      noRedirect: skipNavigation,
      skipPostRestoreNavigation: skipNavigation,
      syncUserUI: () => call(syncUserUI, null, buildDeps({ reason: "restore-session" })),
    }));
  } catch (error) {
    warn("restoreSession falló.", error);
    return null;
  }
}

function restoreHandledNavigation(result = null) {
  const payload = object(result);

  return Boolean(
    payload.navigationHandled ||
      payload.navigated ||
      payload.redirected ||
      payload.routeChanged ||
      payload.rendered ||
      AppCore?.state?.bootNavigationHandled ||
      AppCore?.state?.initialRouteRendered
  );
}

function restoreInBackgroundIfUseful(reason = "background-restore") {
  if (!hasLocalToken()) return false;

  setState({ appRestoreBackgroundStarted: true, appRestoreBackgroundReason: reason });

  void restoreSession({ skipNavigation: true })
    .then((result) => {
      setState({
        appRestoreBackgroundDone: true,
        appRestoreBackgroundAt: isoNow(),
        appRestoreBackgroundHandled: restoreHandledNavigation(result),
      });
    })
    .catch((error) => {
      warn("restore background falló.", error);
      setState({
        appRestoreBackgroundDone: true,
        appRestoreBackgroundError: true,
        appRestoreBackgroundAt: isoNow(),
      });
    });

  return true;
}

async function renderRoute(reason = "initial") {
  const path = currentPublicPath();
  const deps = buildDeps({ reason, source: SOURCE, path, publicPath: path });

  if (isFn(renderInitialRoute)) return renderInitialRoute(deps);

  const options = {
    force: true,
    forceRender: true,
    preservePublicPath: true,
    preserveUrl: true,
    reason,
    source: SOURCE,
  };

  if (isFn(Router?.renderCurrent)) return Router.renderCurrent(options);
  if (isFn(Router?.render)) return Router.render(path, options);
  if (isFn(Router?.navigate)) return Router.navigate(path, options);

  throw new Error("No hay función disponible para renderizar la ruta inicial.");
}

/* =========================================================
   FINALIZE / ERROR
========================================================= */

async function finalizeBoot() {
  call(syncUserUI, null, buildDeps({ reason: "finalize-boot" }));
  call(repairUISystems, null, buildDeps({ reason: "finalize-boot" }));

  booted = true;
  booting = false;
  lastReadyAt = isoNow();

  setState({
    appBooting: false,
    appReady: true,
    appBooted: true,
    appReadyAt: lastReadyAt,
    ready: true,
    booting: false,
  });

  try { hideLoader(AppCore, { reason: "app-ready", minVisibleMs: 300, finalize: true }); } catch {}

  emit("app:boot:complete", { at: lastReadyAt });
  emit("app:ready", { at: lastReadyAt });

  log("ready", { at: lastReadyAt });

  try { void warmup?.(buildDeps({ reason: "after-boot" })); } catch {}

  return true;
}

function renderFatal(error) {
  try { forceHideLoader(AppCore, { reason: "app-boot-error", force: true }); } catch {}

  try {
    renderBootError({
      AppCore,
      Auth,
      Router,
      Toast,
      error,
      getViewContainer,
      setShellVisibility,
      hideLoader: forceHideLoader,
    });
  } catch (renderError) {
    errorLog("No se pudo renderizar boot error.", renderError);
  }
}

function failBoot(error) {
  lastError = error;
  booted = false;
  booting = false;

  const message = text(error?.message || error, "Boot error");

  setState({
    appBooting: false,
    appReady: false,
    appBooted: false,
    appError: true,
    appLastError: {
      message,
      name: text(error?.name, "Error"),
      at: isoNow(),
    },
    booting: false,
    ready: false,
  });

  emit("app:boot:error", { message });
  renderFatal(error);

  return App;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const opts = object(options);
  const bootContext = publicBootContext({ capture: true });
  const fastPublicBoot = Boolean(bootContext.active);

  booting = true;
  booted = false;
  lastError = null;

  setState({
    appBooting: true,
    appReady: false,
    appBooted: false,
    appError: false,
    appSource: text(opts.source, SOURCE),
    appPublicTokenBoot: Boolean(bootContext.tokenRoute),
    appFastPublicBoot: fastPublicBoot,
    booting: true,
    ready: false,
  });

  emit("app:boot:start", {
    publicTokenBoot: Boolean(bootContext.tokenRoute),
    fastPublicBoot,
    path: redact(bootContext.publicPath || browserPath()),
  });

  try { showLoader(AppCore, { booting: true, reason: "app-boot" }); } catch {}

  await initCore();
  await bindEvents();
  await initServices();
  await initStore();
  await initAuth();
  await initLanguage();
  await initRouter();
  await initUI();

  if (fastPublicBoot) {
    await renderRoute(bootContext.tokenRoute ? "public-token-first" : "public-fast-first");
    restoreInBackgroundIfUseful(bootContext.tokenRoute ? "public-token-route" : "public-auth-route");

    setState({
      appPublicRouteRendered: true,
      appPublicTokenRouteRendered: Boolean(bootContext.tokenRoute),
    });
  } else {
    const restoreResult = await restoreSession({ skipNavigation: false });
    if (!restoreHandledNavigation(restoreResult)) await renderRoute("after-restore");
  }

  await finalizeBoot();
  return App;
}

export function boot(options = {}) {
  const opts = object(options);

  if (booted && opts.force !== true) return Promise.resolve(App);
  if (bootPromise && opts.force !== true) return bootPromise;

  bootPromise = runBoot(opts)
    .catch((error) => failBoot(error))
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

export function start(options = {}) {
  return boot(options);
}

export async function reboot(options = {}) {
  const opts = object(options);

  destroy({ keepGlobal: true, silent: true });
  return boot({ ...opts, force: true, reason: text(opts.reason, "reboot") });
}

export function destroy(options = {}) {
  const opts = object(options);

  bootPromise = null;
  booting = false;
  booted = false;

  while (disposers.length) {
    try { disposers.pop()?.(); } catch {}
  }

  eventsBound = false;

  try {
    AppCore?.cleanup?.run?.("app:events");
    AppCore?.cleanup?.run?.("app:errors");
    AppCore?.cleanup?.run?.("app:ui");
  } catch {}

  try { forceHideLoader(AppCore, { reason: "app-destroy", force: true }); } catch {}

  setState({
    appBooting: false,
    appReady: false,
    appBooted: false,
    booting: false,
    ready: false,
  });

  if (opts.silent !== true) emit("app:destroy", { at: isoNow() });

  if (!opts.keepGlobal && isBrowser()) {
    try {
      if (window[RUNTIME_APP_KEY] === App) delete window[RUNTIME_APP_KEY];
    } catch {}
  }

  return true;
}

/* =========================================================
   STATE / SNAPSHOT
========================================================= */

export function getState() {
  const bootContext = publicBootContext({ capture: false });
  const path = currentPublicPath();
  const coreState = getCoreState();

  return {
    version: APP_VERSION,
    booted,
    booting,
    hasBootPromise: Boolean(bootPromise),
    lastReadyAt,
    lastError: lastError
      ? {
          message: text(lastError.message || lastError, ""),
          name: text(lastError.name, "Error"),
        }
      : null,
    publicTokenBoot: Boolean(bootContext.tokenRoute),
    publicAuthRoute: Boolean(bootContext.active),
    hasLocalToken: hasLocalToken(),
    path: redact(path),
    coreReady: Boolean(AppCore),
    servicesReady: Boolean(getCoreHttp() || ServiceHttp),
    storeReady: Boolean(Store),
    authReady: Boolean(Auth),
    routerReady: Boolean(Router),
    uiReady: Boolean(SidebarUI || TopbarUI),
    state: {
      appBooting: Boolean(coreState.appBooting),
      appReady: Boolean(coreState.appReady),
      appBooted: Boolean(coreState.appBooted),
      authenticated: Boolean(coreState.authenticated),
      hasToken: Boolean(coreState.hasToken),
      route: redact(coreState.route || DEFAULT_ROUTE),
      publicPath: redact(coreState.publicPath || DEFAULT_ROUTE),
    },
  };
}

export function getSnapshot() {
  return {
    source: SOURCE,
    version: APP_VERSION,
    ...getState(),
    modules: {
      AppCore: Boolean(AppCore),
      Auth: Boolean(Auth),
      Router: Boolean(Router),
      Store: Boolean(Store),
      ServiceHttp: Boolean(ServiceHttp),
      CoreHttp: Boolean(getCoreHttp()),
      SidebarUI: Boolean(SidebarUI),
      TopbarUI: Boolean(TopbarUI),
      Toast: Boolean(Toast),
      I18n: Boolean(I18n),
    },
    policy: {
      ownHttp: false,
      ownAuth: false,
      ownRouter: false,
      ownToast: false,
      ownStorage: false,
      bootOnly: true,
    },
    at: isoNow(),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const App = {
  version: APP_VERSION,

  boot,
  start,
  reboot,
  destroy,

  getState,
  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  getCore: () => AppCore,
  getRouter: () => Router,
  getAuth: () => Auth,
  getStore: () => Store,
  getHttp: () => getCoreHttp() || ServiceHttp,
  getUI: () => ({ SidebarUI, TopbarUI, Toast }),
  getI18n: () => I18n,
};

/* =========================================================
   GLOBAL API
========================================================= */

try {
  if (isBrowser()) window[RUNTIME_APP_KEY] = App;
} catch {}

try {
  exposeModulesToCore();
} catch {}

/* =========================================================
   OPTIONAL AUTO BOOT
========================================================= */

try {
  if (isBrowser() && window[DISABLE_AUTO_BOOT_KEY] !== true && window[AUTO_BOOT_KEY] === true) {
    boot({ source: "app:auto" });
  }
} catch {}

export const bootApp = boot;

export default App;

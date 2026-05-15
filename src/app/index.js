/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: /src/app/index.js

   Responsabilidad:
   - Orquestar el arranque lógico de la SPA.
   - Delegar en Core, Services, Store, Auth, Router, UI e I18n.
   - No autoarrancar: /src/main.js manda.
   - No meter lógica de negocio.
   - No duplicar auth/router/http.
   - No hacer magia rara.
========================================================= */

import { AppCore } from "../core/index.js";
import { Store } from "../store/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";
import { Http } from "../services/index.js";

import { SidebarUI } from "../ui/sidebar/index.js";
import { TopbarUI } from "../ui/topbar/index.js";
import { Toast } from "../ui/toast/index.js";
import { I18n } from "../i18n/index.js";

import {
  showLoader,
  hideLoader,
  forceHideLoader,
} from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,
} from "./shell.js";

import {
  initI18n,
  syncLangState,
} from "./i18n.js";

import {
  initUISystems,
  syncUserUI,
  repairUISystems,
} from "./ui.js";

import {
  configureRouter,
  bindRouter,
  renderInitialRoute,
} from "./router.js";

import {
  restoreSessionInBackground,
} from "./session.js";

import {
  renderBootError,
  bindGlobalErrorHandlers,
} from "./errors.js";

import {
  bindAppEvents,
} from "./events.js";

import {
  warmup,
} from "./warmup.js";

/* =========================================================
   CONSTANTS
========================================================= */

const APP_VERSION = "v1-simple-app-bootstrap";
const APP_SOURCE = "app:index";

const RUNTIME_APP_KEY = "__ONION_APP__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";

const PUBLIC_TOKEN_PATHS = [
  "/activate",
  "/activate-account",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
];

let bootPromise = null;
let booted = false;
let booting = false;
let lastError = null;
let lastReadyAt = null;

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function getCurrentPath() {
  if (!isBrowser()) return "/";

  try {
    const path = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
    return path || "/";
  } catch {
    return "/";
  }
}

function stripQueryAndHash(path = "/") {
  return safeText(path, "/").split("?")[0].split("#")[0] || "/";
}

function hasTokenInUrl() {
  if (!isBrowser()) return false;

  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    return Boolean(
      params.get("token") ||
      params.get("code") ||
      params.get("t") ||
      params.get("activationToken") ||
      params.get("resetToken") ||
      params.get("passwordResetToken") ||
      params.get("activation_token") ||
      params.get("reset_token") ||
      params.get("password_reset_token")
    );
  } catch {
    return false;
  }
}

function isPublicTokenRoute() {
  const cleanPath = stripQueryAndHash(getCurrentPath());

  return PUBLIC_TOKEN_PATHS.some((path) => {
    return cleanPath === path || cleanPath.startsWith(`${path}/`);
  }) && hasTokenInUrl();
}

function emit(name, detail = {}) {
  const eventName = safeText(name, "");

  if (!eventName || !isBrowser()) return false;

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          source: APP_SOURCE,
          version: APP_VERSION,
          ...safeObject(detail),
        },
      })
    );

    return true;
  } catch {
    return false;
  }
}

function log(...args) {
  try {
    if (AppCore?.config?.debug === true) {
      console.log("[App]", ...args);
    }
  } catch {}
}

function warn(...args) {
  try {
    console.warn("[App]", ...args);
  } catch {}
}

function errorLog(...args) {
  try {
    console.error("[App]", ...args);
  } catch {}
}

function setState(patch = {}) {
  const next = safeObject(patch);

  if (!Object.keys(next).length) return false;

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(next, {
        source: APP_SOURCE,
        emit: false,
        silent: true,
      });

      return true;
    }
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, next);
      return true;
    }
  } catch {}

  return false;
}

function callInit(target, deps = {}) {
  if (!target || !isFunction(target.init)) return true;

  try {
    const result = target.init(deps);
    return result !== false;
  } catch {
    try {
      const result = target.init();
      return result !== false;
    } catch (err) {
      warn("init falló:", err);
      return false;
    }
  }
}

/* =========================================================
   CORE BRIDGE
========================================================= */

function getCoreHttp() {
  return (
    AppCore?.Http ||
    AppCore?.http ||
    AppCore?.services?.http ||
    AppCore?.services?.api ||
    null
  );
}

function exposeModulesToCore() {
  if (!AppCore || typeof AppCore !== "object") return false;

  try {
    AppCore.Router = Router;
    AppCore.router = Router;

    AppCore.Auth = Auth;
    AppCore.auth = Auth;

    AppCore.Store = Store;
    AppCore.store = Store;

    AppCore.Toast = Toast;
    AppCore.toast = Toast;

    AppCore.I18n = I18n;
    AppCore.i18n = I18n;

    AppCore.SidebarUI = SidebarUI;
    AppCore.sidebarUI = SidebarUI;

    AppCore.TopbarUI = TopbarUI;
    AppCore.topbarUI = TopbarUI;

    AppCore.services = AppCore.services || {};
    AppCore.services.serviceHttp = Http;
    AppCore.services.http = AppCore.services.http || getCoreHttp() || Http;

    return true;
  } catch {
    return false;
  }
}

function buildDeps(extra = {}) {
  return {
    AppCore,
    Store,
    Auth,
    Router,
    Http: getCoreHttp() || Http,
    ServiceHttp: Http,
    SidebarUI,
    TopbarUI,
    Toast,
    I18n,
    getViewContainer,
    setShellVisibility,
    updateShellVisibilityByRoute,
    applyPostRenderLoaderPolicy,
    ...safeObject(extra),
  };
}

/* =========================================================
   BOOT STEPS
========================================================= */

async function initCore() {
  exposeModulesToCore();

  if (isFunction(AppCore?.init)) {
    await AppCore.init({
      source: APP_SOURCE,
      version: APP_VERSION,
    });
  }

  exposeModulesToCore();

  setState({
    appVersion: APP_VERSION,
    appBooting: true,
    appReady: false,
  });

  return true;
}

async function initServices() {
  callInit(Http, buildDeps());

  setState({
    servicesReady: true,
  });

  return true;
}

async function initStore() {
  callInit(Store, buildDeps());

  setState({
    storeReady: true,
  });

  return true;
}

async function initLanguage() {
  try {
    initI18n?.(buildDeps());
  } catch (err) {
    warn("initI18n falló:", err);
  }

  try {
    syncLangState?.(buildDeps({
      reason: "app-boot",
    }));
  } catch {}

  setState({
    i18nReady: true,
  });

  return true;
}

async function initRouter() {
  let configured = false;

  try {
    configured = configureRouter?.(buildDeps()) !== false;
  } catch (err) {
    warn("configureRouter falló:", err);
  }

  if (!configured && isFunction(Router?.configure)) {
    try {
      configured = Router.configure(buildDeps()) !== false;
    } catch (err) {
      warn("Router.configure falló:", err);
    }
  }

  if (!configured) {
    throw new Error("No se pudo configurar el router.");
  }

  let bound = false;

  try {
    bound = bindRouter?.(buildDeps()) !== false;
  } catch (err) {
    warn("bindRouter falló:", err);
  }

  if (!bound && isFunction(Router?.bind)) {
    try {
      bound = Router.bind(buildDeps()) !== false;
    } catch (err) {
      warn("Router.bind falló:", err);
    }
  }

  setState({
    routerReady: true,
    routerBound: Boolean(bound),
  });

  return true;
}

async function initUI() {
  let ok = false;

  try {
    ok = initUISystems?.(buildDeps({
      state: getState(),
      scope: "app:ui",
    })) !== false;
  } catch (err) {
    warn("initUISystems falló:", err);
  }

  try {
    syncUserUI?.(buildDeps({
      reason: "app-boot",
    }));
  } catch {}

  try {
    repairUISystems?.(buildDeps({
      reason: "app-boot",
    }));
  } catch {}

  setState({
    uiReady: Boolean(ok),
  });

  return true;
}

async function bindEvents() {
  try {
    bindGlobalErrorHandlers?.(buildDeps({
      scope: "app:errors",
    }));
  } catch {}

  try {
    bindAppEvents?.(buildDeps({
      syncUserUI: () => {
        try {
          syncUserUI?.(buildDeps({
            reason: "app-event",
          }));
        } catch {}
      },
    }));
  } catch {}

  return true;
}

async function restoreSession({ skipNavigation = false } = {}) {
  if (!isFunction(restoreSessionInBackground)) {
    return null;
  }

  try {
    const result = await restoreSessionInBackground(buildDeps({
      state: getState(),
      warmup,
      skipPostRestoreNavigation: skipNavigation,
      syncUserUI: () => {
        try {
          syncUserUI?.(buildDeps({
            reason: "restore-session",
          }));
        } catch {}
      },
    }));

    return result || null;
  } catch (err) {
    warn("restoreSession falló:", err);
    return null;
  }
}

function restoreHandledNavigation(result = null) {
  const payload = safeObject(result);

  return Boolean(
    payload.navigationHandled ||
    payload.navigated ||
    payload.redirected ||
    payload.routeChanged ||
    AppCore?.state?.bootNavigationHandled
  );
}

async function renderRoute(reason = "initial") {
  if (isFunction(renderInitialRoute)) {
    return await renderInitialRoute(buildDeps({
      reason,
      source: APP_SOURCE,
    }));
  }

  if (isFunction(Router?.render)) {
    return await Router.render(getCurrentPath(), {
      force: true,
      reason,
      source: APP_SOURCE,
    });
  }

  throw new Error("No hay función disponible para renderizar la ruta inicial.");
}

async function finalizeBoot() {
  try {
    syncUserUI?.(buildDeps({
      reason: "finalize-boot",
    }));
  } catch {}

  try {
    repairUISystems?.(buildDeps({
      reason: "finalize-boot",
    }));
  } catch {}

  try {
    await warmup?.(buildDeps({
      reason: "after-boot",
    }));
  } catch {}

  booted = true;
  booting = false;
  lastReadyAt = nowIso();

  setState({
    appBooting: false,
    appReady: true,
    appBooted: true,
    appReadyAt: lastReadyAt,
  });

  try {
    hideLoader(AppCore, {
      reason: "app-ready",
      minVisibleMs: 300,
      finalize: true,
    });
  } catch {}

  emit("app:ready", {
    at: lastReadyAt,
  });

  return true;
}

/* =========================================================
   ERROR HANDLING
========================================================= */

function renderFatal(error) {
  try {
    forceHideLoader(AppCore, {
      reason: "app-boot-error",
      force: true,
    });
  } catch {}

  try {
    renderBootError({
      AppCore,
      Auth,
      Toast,
      error,
      getViewContainer,
      setShellVisibility,
      hideLoader: forceHideLoader,
    });
  } catch (err) {
    errorLog("No se pudo renderizar boot error:", err);
  }
}

function failBoot(error) {
  lastError = error;
  booted = false;
  booting = false;

  setState({
    appBooting: false,
    appReady: false,
    appBooted: false,
    appError: true,
    appLastError: {
      message: safeText(error?.message || error, "Boot error"),
      at: nowIso(),
    },
  });

  emit("app:boot:error", {
    message: safeText(error?.message || error, "Boot error"),
  });

  renderFatal(error);

  return App;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const opts = safeObject(options);

  booting = true;
  booted = false;
  lastError = null;

  const publicTokenBoot = isPublicTokenRoute();

  setState({
    appBooting: true,
    appReady: false,
    appBooted: false,
    appError: false,
    appSource: opts.source || APP_SOURCE,
    appPublicTokenBoot: publicTokenBoot,
  });

  emit("app:boot:start", {
    publicTokenBoot,
  });

  try {
    showLoader(AppCore, {
      booting: true,
      reason: "app-boot",
    });
  } catch {}

  await initCore();
  await bindEvents();
  await initServices();
  await initStore();
  await initLanguage();
  await initRouter();
  await initUI();

  if (publicTokenBoot) {
    await renderRoute("public-token-first");

    void restoreSession({
      skipNavigation: true,
    });
  } else {
    const restoreResult = await restoreSession({
      skipNavigation: false,
    });

    if (!restoreHandledNavigation(restoreResult)) {
      await renderRoute("after-restore");
    }
  }

  await finalizeBoot();

  return App;
}

function boot(options = {}) {
  const opts = safeObject(options);

  if (booted && opts.force !== true) {
    return Promise.resolve(App);
  }

  if (bootPromise && opts.force !== true) {
    return bootPromise;
  }

  bootPromise = runBoot(opts)
    .catch((err) => {
      failBoot(err);
      return App;
    })
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

function start(options = {}) {
  return boot(options);
}

async function reboot(options = {}) {
  booted = false;
  booting = false;
  bootPromise = null;

  return boot({
    ...safeObject(options),
    force: true,
    reason: safeText(options?.reason, "reboot"),
  });
}

function destroy() {
  bootPromise = null;
  booting = false;
  booted = false;

  try {
    forceHideLoader(AppCore, {
      reason: "app-destroy",
      force: true,
    });
  } catch {}

  setState({
    appBooting: false,
    appReady: false,
    appBooted: false,
  });

  emit("app:destroy", {
    at: nowIso(),
  });

  return true;
}

/* =========================================================
   STATE / PUBLIC API
========================================================= */

function getState() {
  return {
    version: APP_VERSION,
    booted,
    booting,
    hasBootPromise: Boolean(bootPromise),
    lastReadyAt,
    lastError: lastError
      ? {
          message: safeText(lastError.message || lastError, ""),
          name: safeText(lastError.name, "Error"),
        }
      : null,
    publicTokenBoot: isPublicTokenRoute(),
    path: getCurrentPath(),
    coreReady: Boolean(AppCore),
    storeReady: Boolean(Store),
    authReady: Boolean(Auth),
    routerReady: Boolean(Router),
    uiReady: Boolean(SidebarUI || TopbarUI),
  };
}

const App = {
  version: APP_VERSION,

  boot,
  start,
  reboot,
  destroy,
  getState,

  getCore() {
    return AppCore;
  },

  getRouter() {
    return Router;
  },

  getAuth() {
    return Auth;
  },

  getStore() {
    return Store;
  },

  getHttp() {
    return getCoreHttp() || Http;
  },
};

/* =========================================================
   GLOBAL API
========================================================= */

try {
  if (isBrowser()) {
    window[RUNTIME_APP_KEY] = App;
  }
} catch {}

/* =========================================================
   NO AUTO BOOT
========================================================= */

try {
  if (
    isBrowser() &&
    window[DISABLE_AUTO_BOOT_KEY] !== true &&
    window.__ONION_ALLOW_APP_AUTO_BOOT__ === true
  ) {
    boot({
      source: "app:auto",
    });
  }
} catch {}

/* =========================================================
   EXPORTS
========================================================= */

export {
  APP_VERSION,
  App,
  boot,
  start,
  reboot,
  destroy,
  getState,
};

export const bootApp = boot;

export default App;

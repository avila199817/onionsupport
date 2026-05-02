/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · ROUTE SAFE · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo home
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y homeView.js
   - init / render / reload / destroy seguros
   - aliases mount / unmount / refresh para compatibilidad
   - exponer modal / navegación / helpers públicos
   - evitar duplicidad de lógica en index.js
   - preservar this/contexto al delegar métodos
   - bridge global opcional para debug

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
   - no pisa bridges globales existentes sin mezclar

   FIX ROUTE SAFE:
   - HomeView.init/render/mount/reload/refresh solo corren en HOME real
   - bloquea Home si ctx.canonicalPath/publicPath/route no corresponde a "/"
   - bloquea Home si browserPath actual es /@usuario/incidencias, /incidencias, etc.
   - evita que un render viejo de Home pinte encima de Incidencias
   - mantiene destroy/unmount siempre permitidos
========================================================= */

import RawHomeView from "./homeView.js";
import HomeModal from "./home.modal.js";

/* =========================================================
   CONSTANTS
========================================================= */

const HOME_INDEX_SOURCE = "views:home:index";
const HOME_CANONICAL_PATH = "/";

const GUARDED_HOME_METHODS = new Set([
  "init",
  "render",
  "mount",
  "reload",
  "refresh",

  "openWidget",
  "copyWidgetId",
  "exportCsv",
  "navigate",
  "quickAction",

  "goToPage",
  "goPrevPage",
  "goNextPage",
]);

const ALWAYS_ALLOWED_METHODS = new Set([
  "destroy",
  "unmount",
  "getDashboard",
  "getWidgets",
  "getPageWidgets",
  "getWidgetById",
  "getState",
  "getSnapshot",
  "isInitialized",
  "isDestroyed",
  "isReady",
]);

/* =========================================================
   CORE EXPORTS
========================================================= */

export { HomeModal };

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isNodeLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.nodeType === "number"
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeWarn(...args) {
  try {
    console.warn(
      "[HomeIndex]",
      ...args
    );
  } catch {}
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitPath(value = "/") {
  const raw =
    safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),
    search,
    hash,
  };
}

function normalizeFullPath(path = "/") {
  const raw =
    safeText(path, "/");

  if (!raw) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizeFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  return (
    normalizeFullPath(path)
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

function stripUsernamePrefix(path = "/") {
  const {
    pathname,
    search,
    hash,
  } = splitPath(
    normalizeFullPath(path)
  );

  const segments =
    pathname
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    isUsernameSegment(segments[0])
  ) {
    const rest =
      segments
        .slice(1)
        .join("/");

    const cleanPathname =
      rest
        ? normalizePathnameOnly(`/${rest}`)
        : "/";

    return `${cleanPathname}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function canonicalizePath(path = "/") {
  return normalizeFullPath(
    stripUsernamePrefix(path || "/")
  );
}

function getCleanCanonicalPath(path = "/") {
  return stripSearchAndHash(
    canonicalizePath(path || "/")
  );
}

function isHomePath(path = "") {
  return getCleanCanonicalPath(path || "/") === HOME_CANONICAL_PATH;
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeFullPath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizeFullPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "";
  }
}

function getWindowAppCore() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      window.AppCore ||
      window.OnionApp?.AppCore ||
      window.Onion?.AppCore ||
      null
    );
  } catch {
    return null;
  }
}

function getAppStatePath() {
  const AppCore =
    getWindowAppCore();

  try {
    return safeText(
      AppCore?.state?.route ||
        AppCore?.state?.canonicalPath ||
        "",
      ""
    );
  } catch {
    return "";
  }
}

function getAppPublicPath() {
  const AppCore =
    getWindowAppCore();

  try {
    return safeText(
      AppCore?.state?.publicPath ||
        "",
      ""
    );
  } catch {
    return "";
  }
}

function getDefaultFallback(method = "") {
  switch (method) {
    case "destroy":
    case "unmount":
      return true;

    case "copyWidgetId":
    case "exportCsv":
    case "navigate":
    case "quickAction":
    case "goToPage":
    case "goPrevPage":
    case "goNextPage":
      return false;

    case "getDashboard":
      return {};

    case "getWidgets":
    case "getPageWidgets":
      return [];

    case "getWidgetById":
    case "getState":
      return null;

    case "getSnapshot":
      return {
        initialized:
          false,
        destroyed:
          false,
        routeBlocked:
          true,
        source:
          HOME_INDEX_SOURCE,
      };

    default:
      return null;
  }
}

/* =========================================================
   ROUTE CONTEXT INSPECTION
========================================================= */

function pushPathSignal(signals, label, value) {
  const text =
    safeText(value, "");

  if (!text) {
    return;
  }

  signals.push({
    type:
      "path",
    label,
    value:
      text,
    canonical:
      getCleanCanonicalPath(text),
    isHome:
      isHomePath(text),
  });
}

function pushViewSignal(signals, label, value) {
  const text =
    safeText(value, "");

  if (!text) {
    return;
  }

  signals.push({
    type:
      "view",
    label,
    value:
      text.toLowerCase(),
    isHome:
      text.toLowerCase() === "home",
  });
}

function collectRouteSignalsFromObject(signals, value, label = "arg") {
  if (
    !isObject(value) ||
    isNodeLike(value)
  ) {
    return;
  }

  pushViewSignal(
    signals,
    `${label}.viewKey`,
    value.viewKey
  );

  pushViewSignal(
    signals,
    `${label}.route.viewKey`,
    value.route?.viewKey
  );

  pushPathSignal(
    signals,
    `${label}.canonicalPath`,
    value.canonicalPath
  );

  pushPathSignal(
    signals,
    `${label}.routePath`,
    value.routePath
  );

  pushPathSignal(
    signals,
    `${label}.route.path`,
    value.route?.path
  );

  pushPathSignal(
    signals,
    `${label}.publicPath`,
    value.publicPath
  );

  pushPathSignal(
    signals,
    `${label}.requestedPath`,
    value.requestedPath
  );

  pushPathSignal(
    signals,
    `${label}.path`,
    value.path
  );

  collectRouteSignalsFromObject(
    signals,
    value.options,
    `${label}.options`
  );
}

function collectRouteSignals(args = []) {
  const signals = [];

  const list =
    Array.isArray(args)
      ? args
      : [];

  list.forEach((arg, index) => {
    collectRouteSignalsFromObject(
      signals,
      arg,
      `args[${index}]`
    );
  });

  const statePath =
    getAppStatePath();

  if (statePath) {
    pushPathSignal(
      signals,
      "AppCore.state.route",
      statePath
    );
  }

  const publicPath =
    getAppPublicPath();

  if (publicPath) {
    pushPathSignal(
      signals,
      "AppCore.state.publicPath",
      publicPath
    );
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    pushPathSignal(
      signals,
      "window.location",
      browserPath
    );
  }

  return signals;
}

function getBlockingSignal(signals = []) {
  return (
    signals.find((signal) => signal.isHome === false) ||
    null
  );
}

function hasPositiveHomeSignal(signals = []) {
  return signals.some((signal) => signal.isHome === true);
}

function shouldAllowHomeMethod(method = "", args = []) {
  const cleanMethod =
    safeText(method, "");

  if (!cleanMethod) {
    return true;
  }

  if (ALWAYS_ALLOWED_METHODS.has(cleanMethod)) {
    return true;
  }

  if (!GUARDED_HOME_METHODS.has(cleanMethod)) {
    return true;
  }

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveHomeSignal(signals)) {
    return true;
  }

  /*
    Sin señales de ruta:
    - en browser, si location existe y no es home, bloquea
    - fuera de browser/tests, permite compatibilidad
  */
  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return isHomePath(browserPath);
  }

  return true;
}

function logBlockedHomeMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  safeWarn(
    `HomeView.${method} bloqueado: ruta actual no es Home.`,
    {
      method,
      blockingSignal,
      signals,
      browserPath:
        getBrowserPath(),
      appRoute:
        getAppStatePath(),
      appPublicPath:
        getAppPublicPath(),
    }
  );
}

/* =========================================================
   SAFE CALL
========================================================= */

function safeCall(
  target,
  method,
  args = [],
  fallback = undefined
) {
  const callArgs =
    Array.isArray(args)
      ? args
      : [];

  try {
    const source =
      target || {};

    const fn =
      source?.[method];

    if (isFn(fn)) {
      return fn.apply(
        source,
        callArgs
      );
    }
  } catch (error) {
    try {
      console.warn(
        `[HomeIndex] ${String(method)} falló.`,
        error
      );
    } catch {}
  }

  return fallback;
}

function guardedCall(
  target,
  method,
  args = [],
  fallback = undefined
) {
  const callArgs =
    Array.isArray(args)
      ? args
      : [];

  if (
    !shouldAllowHomeMethod(
      method,
      callArgs
    )
  ) {
    logBlockedHomeMethod(
      method,
      callArgs
    );

    return fallback !== undefined
      ? fallback
      : getDefaultFallback(method);
  }

  return safeCall(
    target,
    method,
    callArgs,
    fallback
  );
}

function safeFlag(target, key, fallback = false) {
  try {
    return Boolean(target?.[key]);
  } catch {
    return Boolean(fallback);
  }
}

/* =========================================================
   GUARDED VIEW BRIDGE
========================================================= */

function createGuardedHomeViewBridge(view) {
  const source =
    view || {};

  const cache =
    new Map();

  if (
    typeof Proxy !== "function" ||
    !isObject(source)
  ) {
    return source;
  }

  return new Proxy(source, {
    get(target, prop, receiver) {
      if (prop === "__raw") {
        return target;
      }

      if (prop === "__source") {
        return HOME_INDEX_SOURCE;
      }

      const value =
        Reflect.get(
          target,
          prop,
          receiver
        );

      if (!isFn(value)) {
        return value;
      }

      const method =
        String(prop);

      if (cache.has(method)) {
        return cache.get(method);
      }

      const wrapped =
        function guardedHomeViewMethod(...args) {
          if (
            !shouldAllowHomeMethod(
              method,
              args
            )
          ) {
            logBlockedHomeMethod(
              method,
              args
            );

            return getDefaultFallback(method);
          }

          try {
            return value.apply(
              target,
              args
            );
          } catch (error) {
            safeWarn(
              `HomeView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedHome_${method}`,
          },

          routeViewKey: {
            value:
              "home",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              "HomeView",
            enumerable:
              true,
          },
        });
      } catch {}

      cache.set(
        method,
        wrapped
      );

      return wrapped;
    },

    set(target, prop, value) {
      try {
        target[prop] = value;
        return true;
      } catch {
        return false;
      }
    },
  });
}

export const HomeView =
  createGuardedHomeViewBridge(
    RawHomeView
  );

export default HomeView;

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  safeFlag(
    RawHomeView,
    "initialized",
    false
  );

export const isDestroyed = () =>
  safeFlag(
    RawHomeView,
    "destroyed",
    false
  );

export const isReady = () =>
  Boolean(
    isInitialized() &&
      !isDestroyed()
  );

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  guardedCall(
    RawHomeView,
    "init",
    args,
    null
  );

export const render = (...args) =>
  guardedCall(
    RawHomeView,
    "render",
    args,
    null
  );

export const mount = (...args) =>
  guardedCall(
    RawHomeView,
    "mount",
    args,
    guardedCall(
      RawHomeView,
      "init",
      args,
      null
    )
  );

export const reload = (...args) =>
  guardedCall(
    RawHomeView,
    "reload",
    args,
    guardedCall(
      RawHomeView,
      "refresh",
      args,
      null
    )
  );

export const refresh = (...args) =>
  guardedCall(
    RawHomeView,
    "refresh",
    args,
    guardedCall(
      RawHomeView,
      "reload",
      args,
      null
    )
  );

export const destroy = (...args) =>
  safeCall(
    RawHomeView,
    "destroy",
    args,
    true
  );

export const unmount = (...args) =>
  safeCall(
    RawHomeView,
    "unmount",
    args,
    safeCall(
      RawHomeView,
      "destroy",
      args,
      true
    )
  );

/* =========================================================
   ACTIONS API
========================================================= */

export const openWidget = (...args) =>
  guardedCall(
    RawHomeView,
    "openWidget",
    args,
    null
  );

export const copyWidgetId = (...args) =>
  guardedCall(
    RawHomeView,
    "copyWidgetId",
    args,
    false
  );

export const exportCsv = (...args) =>
  guardedCall(
    RawHomeView,
    "exportCsv",
    args,
    false
  );

export const navigate = (...args) =>
  guardedCall(
    RawHomeView,
    "navigate",
    args,
    false
  );

export const quickAction = (...args) =>
  guardedCall(
    RawHomeView,
    "quickAction",
    args,
    false
  );

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  guardedCall(
    RawHomeView,
    "goToPage",
    args,
    false
  );

export const goPrevPage = (...args) =>
  guardedCall(
    RawHomeView,
    "goPrevPage",
    args,
    false
  );

export const goNextPage = (...args) =>
  guardedCall(
    RawHomeView,
    "goNextPage",
    args,
    false
  );

/* =========================================================
   DATA API
========================================================= */

export const getDashboard = (...args) =>
  safeCall(
    RawHomeView,
    "getDashboard",
    args,
    {}
  );

export const getWidgets = (...args) =>
  safeCall(
    RawHomeView,
    "getWidgets",
    args,
    []
  );

export const getPageWidgets = (...args) =>
  safeCall(
    RawHomeView,
    "getPageWidgets",
    args,
    []
  );

export const getWidgetById = (...args) =>
  safeCall(
    RawHomeView,
    "getWidgetById",
    args,
    null
  );

export const getState = (...args) =>
  safeCall(
    RawHomeView,
    "getState",
    args,
    null
  );

export const getSnapshot = (...args) =>
  safeCall(
    RawHomeView,
    "getSnapshot",
    args,
    {
      initialized:
        isInitialized(),

      destroyed:
        isDestroyed(),

      ready:
        isReady(),

      hasHomeView:
        Boolean(RawHomeView),

      hasHomeModal:
        Boolean(HomeModal),

      source:
        HOME_INDEX_SOURCE,

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      appRoute:
        getAppStatePath(),

      appPublicPath:
        getAppPublicPath(),

      homeAllowedNow:
        shouldAllowHomeMethod(
          "render",
          []
        ),
    }
  );

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  safeCall(
    HomeModal,
    "open",
    args,
    safeCall(
      HomeModal,
      "show",
      args,
      null
    )
  );

export const closeModal = (...args) =>
  safeCall(
    HomeModal,
    "close",
    args,
    safeCall(
      HomeModal,
      "hide",
      args,
      true
    )
  );

export const updateModal = (...args) =>
  safeCall(
    HomeModal,
    "update",
    args,
    safeCall(
      HomeModal,
      "patch",
      args,
      null
    )
  );

export const destroyModal = (...args) =>
  safeCall(
    HomeModal,
    "destroy",
    args,
    true
  );

/* =========================================================
   DEBUG API
========================================================= */

export const canRenderHomeNow = (...args) =>
  shouldAllowHomeMethod(
    "render",
    args
  );

export const getHomeRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      HOME_INDEX_SOURCE,

    allowed:
      shouldAllowHomeMethod(
        "render",
        args
      ),

    browserPath:
      getBrowserPath(),

    browserCanonicalPath:
      getCleanCanonicalPath(
        getBrowserPath() || "/"
      ),

    appRoute:
      getAppStatePath(),

    appPublicPath:
      getAppPublicPath(),

    signals,

    blockingSignal:
      getBlockingSignal(signals),
  };
};

/* =========================================================
   PUBLIC MODULE API
========================================================= */

export const Home = Object.freeze({
  init,
  render,
  mount,

  reload,
  refresh,

  destroy,
  unmount,

  openWidget,
  copyWidgetId,
  exportCsv,
  navigate,
  quickAction,

  goToPage,
  goPrevPage,
  goNextPage,

  getDashboard,
  getWidgets,
  getPageWidgets,
  getWidgetById,
  getState,
  getSnapshot,

  openModal,
  closeModal,
  updateModal,
  destroyModal,

  isInitialized,
  isDestroyed,
  isReady,

  canRenderHomeNow,
  getHomeRouteDebug,

  View:
    HomeView,

  RawView:
    RawHomeView,

  Modal:
    HomeModal,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

try {
  if (isBrowser()) {
    window.OnionHome = {
      ...(window.OnionHome || {}),
      ...Home,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */

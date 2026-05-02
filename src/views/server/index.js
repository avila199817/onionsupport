/* =========================================================
   Onion SPA - Server View
   Archivo: src/views/server/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · SERVER · ROUTE SAFE · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo server/servidor
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y serverView.js
   - init / mount / render / reload / destroy seguros
   - exponer modal / navegación / helpers públicos
   - evitar duplicidad de lógica en index.js
   - registrar bridge global estable

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un método no existe
   - global bridge opcional idempotente
   - bridge AppCore.modules si AppCore está expuesto

   FIX ROUTE SAFE:
   - ServerView.init/render/mount/reload/refresh solo corren en /servidor
   - acepta /@usuario/servidor como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es servidor
   - destroy/unmount/close siempre permitidos
========================================================= */

import RawServerView from "./serverView.js";
import RawServerModal from "./server.modal.js";

/* =========================================================
   MODULE META
========================================================= */

export const SERVER_MODULE_NAME = "server";
export const SERVER_VIEW_NAME = "ServerView";
export const SERVER_MODULE_VERSION = "11.0.0";
export const SERVER_CANONICAL_PATH = "/servidor";
export const SERVER_LEGACY_CANONICAL_PATH = "/server";
export const SERVER_INDEX_SOURCE = "views:server:index";

/* =========================================================
   BASICS
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

function isProxyable(value) {
  return Boolean(
    value &&
      (
        typeof value === "object" ||
        typeof value === "function"
      )
  );
}

function isNodeLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.nodeType === "number"
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function getGlobalObject() {
  try {
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
  } catch {}

  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return {};
}

function safeWarn(...args) {
  try {
    const root =
      getGlobalObject();

    root?.AppCore?.utils?.warn?.(
      "[ServerIndex]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[ServerIndex]",
      ...args
    );
  } catch {}
}

function safeEmit(event = "", payload = {}) {
  const eventName =
    safeText(event, "");

  if (!eventName) {
    return false;
  }

  const root =
    getGlobalObject();

  let emitted = false;

  try {
    if (isFn(root?.AppCore?.events?.emit)) {
      root.AppCore.events.emit(
        eventName,
        payload
      );

      emitted = true;
    }
  } catch {}

  try {
    if (
      !emitted &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail:
            payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   ROUTE GUARD
========================================================= */

const GUARDED_VIEW_METHODS = new Set([
  "init",
  "mount",
  "render",
  "reload",
  "refresh",
  "bootstrap",

  "openDetail",
  "open",
  "openById",
  "copyDetailId",
  "copy",
  "refreshHealth",
  "toggleLive",
  "navigate",
  "quickAction",

  "goToPage",
  "goPrevPage",
  "prevPage",
  "goNextPage",
  "nextPage",
  "changePageSize",
  "setPageSize",

  "openModal",
  "refreshModal",
  "updateModal",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",

  "closeModal",

  "getSnapshot",
  "getServices",
  "getPageServices",
  "getServiceById",
  "getState",

  "isInitialized",
  "isDestroyed",
  "isMounted",
]);

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
      value.replace(/\/+$/g, "") ||
      "/";
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
      pathname.slice(0, hashIndex) ||
      "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      "/";
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

function isServerPath(path = "") {
  const canonical =
    getCleanCanonicalPath(path || "/");

  return (
    canonical === SERVER_CANONICAL_PATH ||
    canonical === SERVER_LEGACY_CANONICAL_PATH
  );
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
  const root =
    getGlobalObject();

  try {
    return (
      root?.AppCore ||
      root?.OnionApp?.AppCore ||
      root?.Onion?.AppCore ||
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
    isServer:
      isServerPath(text),
  });
}

function pushViewSignal(signals, label, value) {
  const text =
    safeText(value, "");

  if (!text) {
    return;
  }

  const normalized =
    text.toLowerCase();

  signals.push({
    type:
      "view",
    label,
    value:
      normalized,
    isServer:
      normalized === "server" ||
      normalized === "servidor" ||
      normalized === "serverview" ||
      normalized === "server-view",
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

  pushViewSignal(
    signals,
    `${label}.viewName`,
    value.viewName
  );

  pushViewSignal(
    signals,
    `${label}.route.viewName`,
    value.route?.viewName
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
    signals.find((signal) => signal.isServer === false) ||
    null
  );
}

function hasPositiveServerSignal(signals = []) {
  return signals.some((signal) => signal.isServer === true);
}

function shouldAllowServerMethod(method = "", args = []) {
  const cleanMethod =
    safeText(method, "");

  if (!cleanMethod) {
    return true;
  }

  if (ALWAYS_ALLOWED_VIEW_METHODS.has(cleanMethod)) {
    return true;
  }

  if (!GUARDED_VIEW_METHODS.has(cleanMethod)) {
    return true;
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return isServerPath(browserPath);
  }

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveServerSignal(signals)) {
    return true;
  }

  const appRoute =
    getAppStatePath();

  const appPublicPath =
    getAppPublicPath();

  if (appRoute || appPublicPath) {
    return (
      isServerPath(appRoute || "") ||
      isServerPath(appPublicPath || "")
    );
  }

  return true;
}

function logBlockedServerMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `ServerView.${method} bloqueado: ruta actual no es Servidor.`,
    {
      method,
      browserPath:
        getBrowserPath(),
      browserCanonicalPath:
        getCleanCanonicalPath(getBrowserPath() || "/"),
      appRoute:
        getAppStatePath(),
      appPublicPath:
        getAppPublicPath(),
      signals,
      blockingSignal:
        getBlockingSignal(signals),
    }
  );
}

function getDefaultFallback(method = "") {
  switch (method) {
    case "destroy":
    case "unmount":
    case "dispose":
    case "closeModal":
      return true;

    case "copyDetailId":
    case "refreshHealth":
    case "toggleLive":
    case "navigate":
    case "quickAction":
    case "goToPage":
    case "goPrevPage":
    case "prevPage":
    case "goNextPage":
    case "nextPage":
    case "changePageSize":
    case "setPageSize":
      return false;

    case "getSnapshot":
      return {};

    case "getServices":
    case "getPageServices":
      return [];

    case "getServiceById":
    case "getState":
      return null;

    default:
      return null;
  }
}

/* =========================================================
   SAFE CALL
========================================================= */

function safeCall(target, method, args = [], fallback = undefined) {
  try {
    const fn =
      target?.[method];

    if (typeof fn === "function") {
      return fn.apply(
        target,
        Array.isArray(args) ? args : []
      );
    }
  } catch (error) {
    safeWarn(
      `safeCall falló: ${method}`,
      error
    );
  }

  return fallback;
}

function guardedCall(target, method, args = [], fallback = undefined) {
  const callArgs =
    Array.isArray(args)
      ? args
      : [];

  if (
    !shouldAllowServerMethod(
      method,
      callArgs
    )
  ) {
    logBlockedServerMethod(
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

function callAny(candidates = [], args = [], fallback = undefined, options = {}) {
  const opts =
    safeObject(options);

  for (const candidate of candidates) {
    const target =
      candidate?.[0];

    const method =
      candidate?.[1];

    if (!target || !method) {
      continue;
    }

    const result =
      opts.guarded === true
        ? guardedCall(target, method, args, undefined)
        : safeCall(target, method, args, undefined);

    if (result !== undefined) {
      return result;
    }
  }

  return fallback;
}

function asyncCallAny(candidates = [], args = [], fallback = undefined, options = {}) {
  try {
    return Promise.resolve(
      callAny(
        candidates,
        args,
        fallback,
        options
      )
    );
  } catch {
    return Promise.resolve(fallback);
  }
}

/* =========================================================
   GUARDED VIEW BRIDGE
========================================================= */

function createGuardedServerViewBridge(view) {
  const source =
    view || {};

  const cache =
    new Map();

  if (
    typeof Proxy !== "function" ||
    !isProxyable(source)
  ) {
    return source;
  }

  return new Proxy(source, {
    get(target, prop, receiver) {
      if (prop === "__raw") {
        return target;
      }

      if (prop === "__source") {
        return SERVER_INDEX_SOURCE;
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
        function guardedServerViewMethod(...args) {
          if (
            !shouldAllowServerMethod(
              method,
              args
            )
          ) {
            logBlockedServerMethod(
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
              `ServerView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedServer_${method}`,
          },

          routeViewKey: {
            value:
              "server",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              SERVER_VIEW_NAME,
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

    apply(target, thisArg, args) {
      if (
        !shouldAllowServerMethod(
          "render",
          args
        )
      ) {
        logBlockedServerMethod(
          "render",
          args
        );

        return null;
      }

      return Reflect.apply(
        target,
        thisArg,
        args
      );
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

export const ServerView =
  createGuardedServerViewBridge(
    RawServerView
  );

export const ServerModal =
  RawServerModal;

export const view =
  ServerView;

export const component =
  ServerView;

export const page =
  ServerView;

export default ServerView;

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  asyncCallAny(
    [
      [RawServerView, "init"],
      [RawServerView, "mount"],
      [RawServerView, "render"],
    ],
    args,
    ServerView,
    { guarded: true }
  );

export const mount = (...args) =>
  init(...args);

export const render = (...args) =>
  callAny(
    [
      [RawServerView, "render"],
      [RawServerView, "mount"],
      [RawServerView, "init"],
    ],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  asyncCallAny(
    [
      [RawServerView, "reload"],
      [RawServerView, "refresh"],
      [RawServerView, "refreshHealth"],
      [RawServerView, "loadServer"],
      [RawServerView, "loadServices"],
    ],
    args,
    ServerView,
    { guarded: true }
  );

export const refresh = (...args) =>
  reload(...args);

export const destroy = (...args) =>
  callAny(
    [
      [RawServerView, "destroy"],
      [RawServerView, "unmount"],
      [RawServerView, "dispose"],
    ],
    args,
    true
  );

export const unmount = (...args) =>
  destroy(...args);

export const dispose =
  destroy;

export const bootstrap =
  init;

/* =========================================================
   ACTIONS API
========================================================= */

export const openDetail = (...args) =>
  asyncCallAny(
    [
      [RawServerView, "openDetail"],
      [RawServerView, "open"],
      [RawServerView, "openById"],
    ],
    args,
    null,
    { guarded: true }
  );

export const copyDetailId = (...args) =>
  callAny(
    [
      [RawServerView, "copyDetailId"],
      [RawServerView, "copyId"],
      [RawServerView, "copy"],
    ],
    args,
    false,
    { guarded: true }
  );

export const refreshHealth = (...args) =>
  asyncCallAny(
    [
      [RawServerView, "refreshHealth"],
      [RawServerView, "reload"],
      [RawServerView, "refresh"],
    ],
    args,
    false,
    { guarded: true }
  );

export const toggleLive = (...args) =>
  callAny(
    [
      [RawServerView, "toggleLive"],
      [RawServerView, "toggleLiveMode"],
    ],
    args,
    false,
    { guarded: true }
  );

export const navigate = (...args) =>
  callAny(
    [
      [RawServerView, "navigate"],
      [RawServerView, "go"],
    ],
    args,
    false,
    { guarded: true }
  );

export const quickAction = (...args) =>
  callAny(
    [
      [RawServerView, "quickAction"],
      [RawServerView, "runQuickAction"],
    ],
    args,
    false,
    { guarded: true }
  );

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  callAny(
    [
      [RawServerView, "goToPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goPrevPage = (...args) =>
  callAny(
    [
      [RawServerView, "goPrevPage"],
      [RawServerView, "prevPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goNextPage = (...args) =>
  callAny(
    [
      [RawServerView, "goNextPage"],
      [RawServerView, "nextPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const changePageSize = (...args) =>
  callAny(
    [
      [RawServerView, "changePageSize"],
      [RawServerView, "setPageSize"],
    ],
    args,
    5,
    { guarded: true }
  );

/* =========================================================
   DATA API
========================================================= */

export const getSnapshot = (...args) => {
  const base =
    callAny(
      [
        [RawServerView, "getSnapshot"],
        [RawServerView, "getState"],
      ],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    module:
      SERVER_MODULE_NAME,

    viewName:
      SERVER_VIEW_NAME,

    version:
      SERVER_MODULE_VERSION,

    source:
      SERVER_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    mounted:
      isMounted(),

    hasView:
      Boolean(ServerView),

    hasRawView:
      Boolean(RawServerView),

    hasModal:
      Boolean(RawServerModal),

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

    serverAllowedNow:
      canRenderServerNow(...args),
  };
};

export const getServices = (...args) =>
  callAny(
    [
      [RawServerView, "getServices"],
      [RawServerView, "getItems"],
    ],
    args,
    []
  );

export const getPageServices = (...args) =>
  callAny(
    [
      [RawServerView, "getPageServices"],
      [RawServerView, "getPageItems"],
    ],
    args,
    []
  );

export const getServiceById = (...args) =>
  callAny(
    [
      [RawServerView, "getServiceById"],
      [RawServerView, "getItemById"],
      [RawServerView, "findServiceById"],
    ],
    args,
    null
  );

export const getState = (...args) =>
  callAny(
    [
      [RawServerView, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   MODAL API
========================================================= */

export const openModal = (...args) =>
  callAny(
    [
      [RawServerModal, "open"],
      [RawServerModal, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeModal = (...args) =>
  callAny(
    [
      [RawServerModal, "close"],
      [RawServerModal, "destroy"],
      [RawServerModal, "unmount"],
    ],
    args,
    true
  );

export const updateModal = (...args) =>
  callAny(
    [
      [RawServerModal, "update"],
      [RawServerModal, "setState"],
    ],
    args,
    false,
    { guarded: true }
  );

export const refreshModal = (...args) =>
  asyncCallAny(
    [
      [RawServerModal, "refresh"],
      [RawServerModal, "reload"],
    ],
    args,
    null,
    { guarded: true }
  );

export const getModalState = (...args) =>
  callAny(
    [
      [RawServerModal, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   FLAGS / DEBUG
========================================================= */

export const isInitialized = () =>
  Boolean(
    RawServerView?.initialized ||
      RawServerView?.isInitialized ||
      safeCall(RawServerView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    RawServerView?.destroyed ||
      RawServerView?.isDestroyed ||
      safeCall(RawServerView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    RawServerView?.mounted ||
      RawServerView?.isMounted ||
      safeCall(RawServerView, "isMounted", [], false)
  );

export const canRenderServerNow = (...args) =>
  shouldAllowServerMethod(
    "render",
    args
  );

export const getServerRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      SERVER_INDEX_SOURCE,

    allowed:
      shouldAllowServerMethod(
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

    acceptedCanonicalPaths: [
      SERVER_CANONICAL_PATH,
      SERVER_LEGACY_CANONICAL_PATH,
    ],

    signals,

    blockingSignal:
      getBlockingSignal(signals),
  };
};

/* =========================================================
   PUBLIC MODULE SHAPE
========================================================= */

export const ServerModule = Object.freeze({
  name:
    SERVER_MODULE_NAME,

  viewName:
    SERVER_VIEW_NAME,

  version:
    SERVER_MODULE_VERSION,

  source:
    SERVER_INDEX_SOURCE,

  ServerView,
  RawServerView,
  ServerModal,

  View:
    ServerView,

  RawView:
    RawServerView,

  view,
  component,
  page,

  init,
  mount,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,
  bootstrap,

  openDetail,
  copyDetailId,
  refreshHealth,
  toggleLive,
  navigate,
  quickAction,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  getSnapshot,
  getServices,
  getPageServices,
  getServiceById,
  getState,

  openModal,
  closeModal,
  updateModal,
  refreshModal,
  getModalState,

  isInitialized,
  isDestroyed,
  isMounted,

  canRenderServerNow,
  getServerRouteDebug,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalObject();

  try {
    const previous =
      root.OnionServer &&
      typeof root.OnionServer === "object"
        ? root.OnionServer
        : {};

    root.OnionServer = {
      ...previous,
      ...ServerModule,
    };

    root.OnionServidor = {
      ...(root.OnionServidor && typeof root.OnionServidor === "object"
        ? root.OnionServidor
        : {}),
      ...ServerModule,
    };

    root.OnionServerView =
      root.OnionServerView &&
      typeof root.OnionServerView === "object"
        ? {
            ...root.OnionServerView,
            ...ServerModule,
            view:
              ServerView,
          }
        : ServerView;

    root.ServerView =
      root.ServerView &&
      typeof root.ServerView === "object"
        ? {
            ...root.ServerView,
            ...ServerModule,
            view:
              ServerView,
          }
        : ServerView;

    if (!root.OnionServerModal && RawServerModal) {
      root.OnionServerModal =
        RawServerModal;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge global.",
      error
    );
  }

  try {
    const appCore =
      root?.AppCore;

    if (appCore) {
      if (
        !appCore.modules ||
        typeof appCore.modules !== "object"
      ) {
        appCore.modules = {};
      }

      appCore.modules.Server =
        ServerModule;

      appCore.modules.ServerView =
        ServerModule;

      appCore.modules.Servidor =
        ServerModule;

      appCore.modules.OnionServer =
        ServerModule;

      appCore.modules.OnionServidor =
        ServerModule;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "server:index:ready",
    {
      source:
        SERVER_INDEX_SOURCE,

      hasView:
        Boolean(ServerView),

      hasRawView:
        Boolean(RawServerView),

      hasModal:
        Boolean(RawServerModal),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderServerNow(),
    }
  );

  return ServerModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

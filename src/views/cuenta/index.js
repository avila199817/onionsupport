/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · CUENTA · ROUTE SAFE · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo cuenta
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y cuentaView.js
   - init / mount / render / reload / destroy seguros
   - exponer save / theme / language / password / modal / helpers públicos
   - evitar duplicidad de lógica en index.js
   - registrar bridge global estable

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un método no existe
   - bridge global opcional window.OnionCuenta
   - bridge AppCore.modules si AppCore está expuesto

   FIX ROUTE SAFE:
   - CuentaView.init/render/mount/reload/refresh solo corren en /cuenta
   - acepta /@usuario/cuenta como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es cuenta
   - destroy/unmount/dispose siempre permitidos
   - getters/snapshot siguen disponibles
========================================================= */

import RawCuentaView from "./cuentaView.js";

/* =========================================================
   MODULE META
========================================================= */

export const CUENTA_MODULE_NAME = "cuenta";
export const CUENTA_VIEW_NAME = "CuentaView";
export const CUENTA_MODULE_VERSION = "11.0.0";
export const CUENTA_CANONICAL_PATH = "/cuenta";
export const CUENTA_INDEX_SOURCE = "views:cuenta:index";

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
      "[CuentaIndex]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[CuentaIndex]",
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

  "saveCuenta",
  "save",

  "updateTheme",
  "updateCuentaTheme",

  "updateLanguage",
  "updateCuentaLanguage",

  "refreshCuenta",

  "changePassword",

  "openModal",
  "openCuentaModal",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",

  "getItem",
  "getCuenta",
  "getSnapshot",
  "getCuentaSnapshot",
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

function isCuentaPath(path = "") {
  return (
    getCleanCanonicalPath(path || "/") ===
    CUENTA_CANONICAL_PATH
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
    isCuenta:
      isCuentaPath(text),
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
    isCuenta:
      normalized === "cuenta" ||
      normalized === "cuentaview" ||
      normalized === "cuenta-view",
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
    signals.find((signal) => signal.isCuenta === false) ||
    null
  );
}

function hasPositiveCuentaSignal(signals = []) {
  return signals.some((signal) => signal.isCuenta === true);
}

function shouldAllowCuentaMethod(method = "", args = []) {
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
    return isCuentaPath(browserPath);
  }

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveCuentaSignal(signals)) {
    return true;
  }

  const appRoute =
    getAppStatePath();

  const appPublicPath =
    getAppPublicPath();

  if (appRoute || appPublicPath) {
    return (
      isCuentaPath(appRoute || "") ||
      isCuentaPath(appPublicPath || "")
    );
  }

  return true;
}

function logBlockedCuentaMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `CuentaView.${method} bloqueado: ruta actual no es Cuenta.`,
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
      return true;

    case "saveCuenta":
    case "save":
    case "updateTheme":
    case "updateCuentaTheme":
    case "updateLanguage":
    case "updateCuentaLanguage":
    case "refreshCuenta":
    case "changePassword":
    case "openModal":
    case "openCuentaModal":
      return false;

    case "getItem":
    case "getCuenta":
    case "getSnapshot":
    case "getCuentaSnapshot":
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
    !shouldAllowCuentaMethod(
      method,
      callArgs
    )
  ) {
    logBlockedCuentaMethod(
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

function createGuardedCuentaViewBridge(view) {
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
        return CUENTA_INDEX_SOURCE;
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
        function guardedCuentaViewMethod(...args) {
          if (
            !shouldAllowCuentaMethod(
              method,
              args
            )
          ) {
            logBlockedCuentaMethod(
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
              `CuentaView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedCuenta_${method}`,
          },

          routeViewKey: {
            value:
              "cuenta",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              CUENTA_VIEW_NAME,
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
        !shouldAllowCuentaMethod(
          "render",
          args
        )
      ) {
        logBlockedCuentaMethod(
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

export const CuentaView =
  createGuardedCuentaViewBridge(
    RawCuentaView
  );

export const view =
  CuentaView;

export const component =
  CuentaView;

export const page =
  CuentaView;

export default CuentaView;

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "init"],
      [RawCuentaView, "mount"],
      [RawCuentaView, "render"],
    ],
    args,
    CuentaView,
    { guarded: true }
  );

export const mount = (...args) =>
  init(...args);

export const render = (...args) =>
  callAny(
    [
      [RawCuentaView, "render"],
      [RawCuentaView, "mount"],
      [RawCuentaView, "init"],
    ],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "reload"],
      [RawCuentaView, "refresh"],
      [RawCuentaView, "refreshCuenta"],
      [RawCuentaView, "loadCuenta"],
    ],
    args,
    CuentaView,
    { guarded: true }
  );

export const destroy = (...args) =>
  callAny(
    [
      [RawCuentaView, "destroy"],
      [RawCuentaView, "unmount"],
      [RawCuentaView, "dispose"],
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

export const saveCuenta = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "saveCuenta"],
      [RawCuentaView, "save"],
    ],
    args,
    false,
    { guarded: true }
  );

export const updateTheme = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "updateTheme"],
      [RawCuentaView, "updateCuentaTheme"],
    ],
    args,
    false,
    { guarded: true }
  );

export const updateLanguage = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "updateLanguage"],
      [RawCuentaView, "updateCuentaLanguage"],
    ],
    args,
    false,
    { guarded: true }
  );

export const refreshCuenta = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "refreshCuenta"],
      [RawCuentaView, "refresh"],
      [RawCuentaView, "reload"],
    ],
    args,
    false,
    { guarded: true }
  );

export const changePassword = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "changePassword"],
      [RawCuentaView, "updatePassword"],
    ],
    args,
    false,
    { guarded: true }
  );

export const openModal = (...args) =>
  callAny(
    [
      [RawCuentaView, "openModal"],
      [RawCuentaView, "open"],
    ],
    args,
    false,
    { guarded: true }
  );

/* =========================================================
   DATA API
========================================================= */

export const getItem = (...args) =>
  callAny(
    [
      [RawCuentaView, "getItem"],
      [RawCuentaView, "getCuenta"],
      [RawCuentaView, "getUser"],
    ],
    args,
    null
  );

export const getSnapshot = (...args) => {
  const base =
    callAny(
      [
        [RawCuentaView, "getSnapshot"],
        [RawCuentaView, "getState"],
      ],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    module:
      CUENTA_MODULE_NAME,

    viewName:
      CUENTA_VIEW_NAME,

    version:
      CUENTA_MODULE_VERSION,

    source:
      CUENTA_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    mounted:
      isMounted(),

    hasView:
      Boolean(CuentaView),

    hasRawView:
      Boolean(RawCuentaView),

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

    cuentaAllowedNow:
      canRenderCuentaNow(...args),
  };
};

export const getState = (...args) =>
  callAny(
    [
      [RawCuentaView, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   ALIASES API
========================================================= */

export const save = (...args) =>
  saveCuenta(...args);

export const refresh = (...args) =>
  refreshCuenta(...args);

export const updateCuentaTheme = (...args) =>
  updateTheme(...args);

export const updateCuentaLanguage = (...args) =>
  updateLanguage(...args);

export const openCuentaModal = (...args) =>
  openModal(...args);

export const getCuenta = (...args) =>
  getItem(...args);

export const getCuentaSnapshot = (...args) =>
  getSnapshot(...args);

/* =========================================================
   FLAGS / DEBUG
========================================================= */

export const isInitialized = () =>
  Boolean(
    RawCuentaView?.initialized ||
      RawCuentaView?.isInitialized ||
      safeCall(RawCuentaView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    RawCuentaView?.destroyed ||
      RawCuentaView?.isDestroyed ||
      safeCall(RawCuentaView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    RawCuentaView?.mounted ||
      RawCuentaView?.isMounted ||
      safeCall(RawCuentaView, "isMounted", [], false)
  );

export const canRenderCuentaNow = (...args) =>
  shouldAllowCuentaMethod(
    "render",
    args
  );

export const getCuentaRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      CUENTA_INDEX_SOURCE,

    allowed:
      shouldAllowCuentaMethod(
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
   PUBLIC MODULE SHAPE
========================================================= */

export const CuentaModule = Object.freeze({
  name:
    CUENTA_MODULE_NAME,

  viewName:
    CUENTA_VIEW_NAME,

  version:
    CUENTA_MODULE_VERSION,

  source:
    CUENTA_INDEX_SOURCE,

  CuentaView,
  RawCuentaView,

  View:
    CuentaView,

  RawView:
    RawCuentaView,

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

  saveCuenta,
  save,

  updateTheme,
  updateCuentaTheme,

  updateLanguage,
  updateCuentaLanguage,

  refreshCuenta,

  changePassword,

  openModal,
  openCuentaModal,

  getItem,
  getCuenta,

  getSnapshot,
  getCuentaSnapshot,

  getState,

  isInitialized,
  isDestroyed,
  isMounted,

  canRenderCuentaNow,
  getCuentaRouteDebug,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalObject();

  try {
    const previous =
      root.OnionCuenta &&
      typeof root.OnionCuenta === "object"
        ? root.OnionCuenta
        : {};

    root.OnionCuenta = {
      ...previous,
      ...CuentaModule,
    };

    root.OnionCuentaView =
      root.OnionCuentaView &&
      typeof root.OnionCuentaView === "object"
        ? {
            ...root.OnionCuentaView,
            ...CuentaModule,
            view:
              CuentaView,
          }
        : CuentaView;

    root.CuentaView =
      root.CuentaView &&
      typeof root.CuentaView === "object"
        ? {
            ...root.CuentaView,
            ...CuentaModule,
            view:
              CuentaView,
          }
        : CuentaView;
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

      appCore.modules.Cuenta =
        CuentaModule;

      appCore.modules.CuentaView =
        CuentaModule;

      appCore.modules.OnionCuenta =
        CuentaModule;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "cuenta:index:ready",
    {
      source:
        CUENTA_INDEX_SOURCE,

      hasView:
        Boolean(CuentaView),

      hasRawView:
        Boolean(RawCuentaView),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderCuentaNow(),
    }
  );

  return CuentaModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

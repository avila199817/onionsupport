/* =========================================================
   Onion SPA - Ajustes View
   Archivo: src/views/ajustes/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · AJUSTES · ROUTE SAFE · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo ajustes
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y ajustesView.js
   - init / mount / render / reload / destroy seguros
   - exponer edit / modal / helpers públicos
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
   - AjustesView.init/render/mount/reload/refresh solo corren en /ajustes
   - acepta /@usuario/ajustes como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es ajustes
   - destroy/unmount/close siempre permitidos
========================================================= */

import RawAjustesView from "./ajustesView.js";
import RawAjustesEditView from "./ajustesEditView.js";
import RawAjustesModal from "./ajustes.modal.js";

/* =========================================================
   MODULE META
========================================================= */

export const AJUSTES_MODULE_NAME = "ajustes";
export const AJUSTES_VIEW_NAME = "AjustesView";
export const AJUSTES_MODULE_VERSION = "11.0.0";
export const AJUSTES_CANONICAL_PATH = "/ajustes";
export const AJUSTES_INDEX_SOURCE = "views:ajustes:index";

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
      "[AjustesIndex]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[AjustesIndex]",
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

  "openAjuste",
  "open",
  "openById",
  "createAjuste",
  "create",
  "updateAjuste",
  "update",
  "exportCsv",

  "goToPage",
  "goPrevPage",
  "prevPage",
  "goNextPage",
  "nextPage",
  "changePageSize",
  "setPageSize",

  "initEdit",
  "openEdit",
  "renderEdit",
  "resetEdit",

  "openModal",
  "refreshModal",
  "updateModal",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",

  "closeEdit",
  "closeModal",

  "getItems",
  "getPageItems",
  "getPagination",
  "getAjusteById",
  "getAjusteByKey",
  "getState",
  "getSnapshot",
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

function isAjustesPath(path = "") {
  return (
    getCleanCanonicalPath(path || "/") ===
    AJUSTES_CANONICAL_PATH
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
    isAjustes:
      isAjustesPath(text),
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
    isAjustes:
      normalized === "ajustes" ||
      normalized === "ajustesview" ||
      normalized === "ajustes-view",
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
    signals.find((signal) => signal.isAjustes === false) ||
    null
  );
}

function hasPositiveAjustesSignal(signals = []) {
  return signals.some((signal) => signal.isAjustes === true);
}

function shouldAllowAjustesMethod(method = "", args = []) {
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
    return isAjustesPath(browserPath);
  }

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveAjustesSignal(signals)) {
    return true;
  }

  const appRoute =
    getAppStatePath();

  const appPublicPath =
    getAppPublicPath();

  if (appRoute || appPublicPath) {
    return (
      isAjustesPath(appRoute || "") ||
      isAjustesPath(appPublicPath || "")
    );
  }

  return true;
}

function logBlockedAjustesMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `AjustesView.${method} bloqueado: ruta actual no es Ajustes.`,
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
    case "closeEdit":
    case "closeModal":
      return true;

    case "createAjuste":
    case "updateAjuste":
    case "exportCsv":
    case "goToPage":
    case "goPrevPage":
    case "prevPage":
    case "goNextPage":
    case "nextPage":
    case "changePageSize":
    case "setPageSize":
      return false;

    case "getItems":
    case "getPageItems":
      return [];

    case "getPagination":
    case "getAjusteById":
    case "getAjusteByKey":
    case "getState":
    case "getSnapshot":
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
    !shouldAllowAjustesMethod(
      method,
      callArgs
    )
  ) {
    logBlockedAjustesMethod(
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

function createGuardedAjustesViewBridge(view) {
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
        return AJUSTES_INDEX_SOURCE;
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
        function guardedAjustesViewMethod(...args) {
          if (
            !shouldAllowAjustesMethod(
              method,
              args
            )
          ) {
            logBlockedAjustesMethod(
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
              `AjustesView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedAjustes_${method}`,
          },

          routeViewKey: {
            value:
              "ajustes",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              AJUSTES_VIEW_NAME,
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
        !shouldAllowAjustesMethod(
          "render",
          args
        )
      ) {
        logBlockedAjustesMethod(
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

export const AjustesView =
  createGuardedAjustesViewBridge(
    RawAjustesView
  );

export const AjustesEditView =
  RawAjustesEditView;

export const AjustesModal =
  RawAjustesModal;

export const view =
  AjustesView;

export const component =
  AjustesView;

export const page =
  AjustesView;

export default AjustesView;

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  asyncCallAny(
    [
      [RawAjustesView, "init"],
      [RawAjustesView, "mount"],
      [RawAjustesView, "render"],
    ],
    args,
    AjustesView,
    { guarded: true }
  );

export const mount = (...args) =>
  init(...args);

export const render = (...args) =>
  callAny(
    [
      [RawAjustesView, "render"],
      [RawAjustesView, "mount"],
      [RawAjustesView, "init"],
    ],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  asyncCallAny(
    [
      [RawAjustesView, "reload"],
      [RawAjustesView, "refresh"],
      [RawAjustesView, "loadAjustes"],
    ],
    args,
    AjustesView,
    { guarded: true }
  );

export const refresh = (...args) =>
  reload(...args);

export const destroy = (...args) =>
  callAny(
    [
      [RawAjustesView, "destroy"],
      [RawAjustesView, "unmount"],
      [RawAjustesView, "dispose"],
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

export const openAjuste = (...args) =>
  asyncCallAny(
    [
      [RawAjustesView, "openAjuste"],
      [RawAjustesView, "open"],
      [RawAjustesView, "openById"],
    ],
    args,
    null,
    { guarded: true }
  );

export const createAjuste = (...args) =>
  asyncCallAny(
    [
      [RawAjustesView, "createAjuste"],
      [RawAjustesView, "create"],
    ],
    args,
    false,
    { guarded: true }
  );

export const updateAjuste = (...args) =>
  asyncCallAny(
    [
      [RawAjustesView, "updateAjuste"],
      [RawAjustesView, "update"],
    ],
    args,
    false,
    { guarded: true }
  );

export const exportCsv = (...args) =>
  callAny(
    [
      [RawAjustesView, "exportCsv"],
      [RawAjustesView, "exportAjustesCsv"],
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
      [RawAjustesView, "goToPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goPrevPage = (...args) =>
  callAny(
    [
      [RawAjustesView, "goPrevPage"],
      [RawAjustesView, "prevPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goNextPage = (...args) =>
  callAny(
    [
      [RawAjustesView, "goNextPage"],
      [RawAjustesView, "nextPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const changePageSize = (...args) =>
  callAny(
    [
      [RawAjustesView, "changePageSize"],
      [RawAjustesView, "setPageSize"],
    ],
    args,
    5,
    { guarded: true }
  );

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  callAny(
    [
      [RawAjustesView, "getItems"],
      [RawAjustesView, "getAjustes"],
    ],
    args,
    []
  );

export const getPageItems = (...args) =>
  callAny(
    [
      [RawAjustesView, "getPageItems"],
    ],
    args,
    []
  );

export const getPagination = (...args) =>
  callAny(
    [
      [RawAjustesView, "getPagination"],
    ],
    args,
    null
  );

export const getAjusteById = (...args) =>
  callAny(
    [
      [RawAjustesView, "getAjusteById"],
      [RawAjustesView, "findAjusteById"],
    ],
    args,
    null
  );

export const getAjusteByKey = (...args) =>
  callAny(
    [
      [RawAjustesView, "getAjusteByKey"],
      [RawAjustesView, "findAjusteByKey"],
    ],
    args,
    null
  );

export const getState = (...args) =>
  callAny(
    [
      [RawAjustesView, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   EDIT VIEW API
========================================================= */

export const initEdit = (...args) =>
  guardedCall(
    RawAjustesEditView,
    "init",
    args,
    undefined
  );

export const openEdit = (...args) =>
  callAny(
    [
      [RawAjustesEditView, "open"],
      [RawAjustesEditView, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeEdit = (...args) =>
  callAny(
    [
      [RawAjustesEditView, "close"],
      [RawAjustesEditView, "destroy"],
      [RawAjustesEditView, "unmount"],
    ],
    args,
    true
  );

export const renderEdit = (...args) =>
  callAny(
    [
      [RawAjustesEditView, "render"],
    ],
    args,
    null,
    { guarded: true }
  );

export const resetEdit = (...args) =>
  callAny(
    [
      [RawAjustesEditView, "reset"],
    ],
    args,
    undefined,
    { guarded: true }
  );

export const getEditState = (...args) =>
  callAny(
    [
      [RawAjustesEditView, "getState"],
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
      [RawAjustesModal, "open"],
      [RawAjustesModal, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeModal = (...args) =>
  callAny(
    [
      [RawAjustesModal, "close"],
      [RawAjustesModal, "destroy"],
      [RawAjustesModal, "unmount"],
    ],
    args,
    true
  );

export const refreshModal = (...args) =>
  asyncCallAny(
    [
      [RawAjustesModal, "refresh"],
      [RawAjustesModal, "reload"],
    ],
    args,
    null,
    { guarded: true }
  );

export const updateModal = (...args) =>
  callAny(
    [
      [RawAjustesModal, "update"],
      [RawAjustesModal, "setState"],
    ],
    args,
    false,
    { guarded: true }
  );

export const getModalState = (...args) =>
  callAny(
    [
      [RawAjustesModal, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   FLAGS / DEBUG
========================================================= */

export const isInitialized = () =>
  Boolean(
    RawAjustesView?.initialized ||
      RawAjustesView?.isInitialized ||
      safeCall(RawAjustesView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    RawAjustesView?.destroyed ||
      RawAjustesView?.isDestroyed ||
      safeCall(RawAjustesView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    RawAjustesView?.mounted ||
      RawAjustesView?.isMounted ||
      safeCall(RawAjustesView, "isMounted", [], false)
  );

export const canRenderAjustesNow = (...args) =>
  shouldAllowAjustesMethod(
    "render",
    args
  );

export const getAjustesRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      AJUSTES_INDEX_SOURCE,

    allowed:
      shouldAllowAjustesMethod(
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

export const getSnapshot = (...args) => {
  const base =
    callAny(
      [
        [RawAjustesView, "getSnapshot"],
        [RawAjustesView, "getState"],
      ],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    module:
      AJUSTES_MODULE_NAME,

    viewName:
      AJUSTES_VIEW_NAME,

    version:
      AJUSTES_MODULE_VERSION,

    source:
      AJUSTES_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    mounted:
      isMounted(),

    hasView:
      Boolean(AjustesView),

    hasRawView:
      Boolean(RawAjustesView),

    hasEditView:
      Boolean(RawAjustesEditView),

    hasModal:
      Boolean(RawAjustesModal),

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

    ajustesAllowedNow:
      canRenderAjustesNow(...args),
  };
};

/* =========================================================
   PUBLIC MODULE SHAPE
========================================================= */

export const AjustesModule = Object.freeze({
  name:
    AJUSTES_MODULE_NAME,

  viewName:
    AJUSTES_VIEW_NAME,

  version:
    AJUSTES_MODULE_VERSION,

  source:
    AJUSTES_INDEX_SOURCE,

  AjustesView,
  RawAjustesView,
  AjustesEditView,
  AjustesModal,

  View:
    AjustesView,

  RawView:
    RawAjustesView,

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

  openAjuste,
  createAjuste,
  updateAjuste,
  exportCsv,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  getItems,
  getPageItems,
  getPagination,
  getAjusteById,
  getAjusteByKey,
  getState,
  getSnapshot,

  initEdit,
  openEdit,
  closeEdit,
  renderEdit,
  resetEdit,
  getEditState,

  openModal,
  closeModal,
  refreshModal,
  updateModal,
  getModalState,

  isInitialized,
  isDestroyed,
  isMounted,

  canRenderAjustesNow,
  getAjustesRouteDebug,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalObject();

  try {
    const previous =
      root.OnionAjustes &&
      typeof root.OnionAjustes === "object"
        ? root.OnionAjustes
        : {};

    root.OnionAjustes = {
      ...previous,
      ...AjustesModule,
    };

    root.OnionAjustesView =
      root.OnionAjustesView &&
      typeof root.OnionAjustesView === "object"
        ? {
            ...root.OnionAjustesView,
            ...AjustesModule,
            view:
              AjustesView,
          }
        : AjustesView;

    root.AjustesView =
      root.AjustesView &&
      typeof root.AjustesView === "object"
        ? {
            ...root.AjustesView,
            ...AjustesModule,
            view:
              AjustesView,
          }
        : AjustesView;

    if (!root.OnionAjustesModal && RawAjustesModal) {
      root.OnionAjustesModal =
        RawAjustesModal;
    }

    if (!root.OnionAjustesEditView && RawAjustesEditView) {
      root.OnionAjustesEditView =
        RawAjustesEditView;
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

      appCore.modules.Ajustes =
        AjustesModule;

      appCore.modules.AjustesView =
        AjustesModule;

      appCore.modules.OnionAjustes =
        AjustesModule;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "ajustes:index:ready",
    {
      source:
        AJUSTES_INDEX_SOURCE,

      hasView:
        Boolean(AjustesView),

      hasRawView:
        Boolean(RawAjustesView),

      hasEditView:
        Boolean(RawAjustesEditView),

      hasModal:
        Boolean(RawAjustesModal),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderAjustesNow(),
    }
  );

  return AjustesModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

/* =========================================================
   Onion SPA - Clientes View
   Archivo: src/views/clientes/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · CLIENTES · ROUTE SAFE · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo clientes
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y clientesView.js
   - init / mount / render / reload / destroy seguros
   - exponer create / modal / helpers públicos
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
   - ClientesView.init/render/mount/reload/refresh solo corren en /clientes
   - acepta /@usuario/clientes como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es clientes
   - destroy/unmount/close siempre permitidos
========================================================= */

import RawClientesView from "./clientesView.js";
import RawClientesCreateView from "./clientes.create.modal.js";
import RawClientesModal from "./clientes.modal.js";

/* =========================================================
   MODULE META
========================================================= */

export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_MODULE_VERSION = "11.0.0";
export const CLIENTES_CANONICAL_PATH = "/clientes";
export const CLIENTES_INDEX_SOURCE = "views:clientes:index";

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
      "[ClientesIndex]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[ClientesIndex]",
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

  "openCliente",
  "open",
  "openById",
  "createCliente",
  "create",
  "exportCsv",

  "goToPage",
  "goPrevPage",
  "prevPage",
  "goNextPage",
  "nextPage",
  "changePageSize",
  "setPageSize",

  "initCreate",
  "openCreate",
  "renderCreate",
  "resetCreate",

  "openModal",
  "refreshModal",
  "updateModal",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",

  "closeCreate",
  "closeModal",

  "getItems",
  "getPageItems",
  "getPagination",
  "getClienteById",
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

function isClientesPath(path = "") {
  return (
    getCleanCanonicalPath(path || "/") ===
    CLIENTES_CANONICAL_PATH
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
    isClientes:
      isClientesPath(text),
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
    isClientes:
      normalized === "clientes" ||
      normalized === "clientesview" ||
      normalized === "clientes-view",
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
    signals.find((signal) => signal.isClientes === false) ||
    null
  );
}

function hasPositiveClientesSignal(signals = []) {
  return signals.some((signal) => signal.isClientes === true);
}

function shouldAllowClientesMethod(method = "", args = []) {
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
    return isClientesPath(browserPath);
  }

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveClientesSignal(signals)) {
    return true;
  }

  const appRoute =
    getAppStatePath();

  const appPublicPath =
    getAppPublicPath();

  if (appRoute || appPublicPath) {
    return (
      isClientesPath(appRoute || "") ||
      isClientesPath(appPublicPath || "")
    );
  }

  return true;
}

function logBlockedClientesMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `ClientesView.${method} bloqueado: ruta actual no es Clientes.`,
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
    case "closeCreate":
    case "closeModal":
      return true;

    case "createCliente":
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
    case "getClienteById":
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
    !shouldAllowClientesMethod(
      method,
      callArgs
    )
  ) {
    logBlockedClientesMethod(
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

function createGuardedClientesViewBridge(view) {
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
        return CLIENTES_INDEX_SOURCE;
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
        function guardedClientesViewMethod(...args) {
          if (
            !shouldAllowClientesMethod(
              method,
              args
            )
          ) {
            logBlockedClientesMethod(
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
              `ClientesView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedClientes_${method}`,
          },

          routeViewKey: {
            value:
              "clientes",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              CLIENTES_VIEW_NAME,
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
        !shouldAllowClientesMethod(
          "render",
          args
        )
      ) {
        logBlockedClientesMethod(
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

export const ClientesView =
  createGuardedClientesViewBridge(
    RawClientesView
  );

export const ClientesCreateView =
  RawClientesCreateView;

export const ClientesModal =
  RawClientesModal;

export const view =
  ClientesView;

export const component =
  ClientesView;

export const page =
  ClientesView;

export default ClientesView;

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  asyncCallAny(
    [
      [RawClientesView, "init"],
      [RawClientesView, "mount"],
      [RawClientesView, "render"],
    ],
    args,
    ClientesView,
    { guarded: true }
  );

export const mount = (...args) =>
  init(...args);

export const render = (...args) =>
  callAny(
    [
      [RawClientesView, "render"],
      [RawClientesView, "mount"],
      [RawClientesView, "init"],
    ],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  asyncCallAny(
    [
      [RawClientesView, "reload"],
      [RawClientesView, "refresh"],
      [RawClientesView, "loadClientes"],
    ],
    args,
    ClientesView,
    { guarded: true }
  );

export const refresh = (...args) =>
  reload(...args);

export const destroy = (...args) =>
  callAny(
    [
      [RawClientesView, "destroy"],
      [RawClientesView, "unmount"],
      [RawClientesView, "dispose"],
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

export const openCliente = (...args) =>
  asyncCallAny(
    [
      [RawClientesView, "openCliente"],
      [RawClientesView, "open"],
      [RawClientesView, "openById"],
    ],
    args,
    null,
    { guarded: true }
  );

export const createCliente = (...args) =>
  asyncCallAny(
    [
      [RawClientesView, "createCliente"],
      [RawClientesView, "create"],
    ],
    args,
    false,
    { guarded: true }
  );

export const exportCsv = (...args) =>
  callAny(
    [
      [RawClientesView, "exportCsv"],
      [RawClientesView, "exportClientesCsv"],
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
      [RawClientesView, "goToPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goPrevPage = (...args) =>
  callAny(
    [
      [RawClientesView, "goPrevPage"],
      [RawClientesView, "prevPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goNextPage = (...args) =>
  callAny(
    [
      [RawClientesView, "goNextPage"],
      [RawClientesView, "nextPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const changePageSize = (...args) =>
  callAny(
    [
      [RawClientesView, "changePageSize"],
      [RawClientesView, "setPageSize"],
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
      [RawClientesView, "getItems"],
      [RawClientesView, "getClientes"],
    ],
    args,
    []
  );

export const getPageItems = (...args) =>
  callAny(
    [
      [RawClientesView, "getPageItems"],
    ],
    args,
    []
  );

export const getPagination = (...args) =>
  callAny(
    [
      [RawClientesView, "getPagination"],
    ],
    args,
    null
  );

export const getClienteById = (...args) =>
  callAny(
    [
      [RawClientesView, "getClienteById"],
      [RawClientesView, "findClienteById"],
    ],
    args,
    null
  );

export const getState = (...args) =>
  callAny(
    [
      [RawClientesView, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   CREATE VIEW API
========================================================= */

export const initCreate = (...args) =>
  guardedCall(
    RawClientesCreateView,
    "init",
    args,
    undefined
  );

export const openCreate = (...args) =>
  callAny(
    [
      [RawClientesCreateView, "open"],
      [RawClientesCreateView, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeCreate = (...args) =>
  callAny(
    [
      [RawClientesCreateView, "close"],
      [RawClientesCreateView, "destroy"],
      [RawClientesCreateView, "unmount"],
    ],
    args,
    true
  );

export const renderCreate = (...args) =>
  callAny(
    [
      [RawClientesCreateView, "render"],
    ],
    args,
    null,
    { guarded: true }
  );

export const resetCreate = (...args) =>
  callAny(
    [
      [RawClientesCreateView, "reset"],
    ],
    args,
    undefined,
    { guarded: true }
  );

export const getCreateState = (...args) =>
  callAny(
    [
      [RawClientesCreateView, "getState"],
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
      [RawClientesModal, "open"],
      [RawClientesModal, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeModal = (...args) =>
  callAny(
    [
      [RawClientesModal, "close"],
      [RawClientesModal, "destroy"],
      [RawClientesModal, "unmount"],
    ],
    args,
    true
  );

export const refreshModal = (...args) =>
  asyncCallAny(
    [
      [RawClientesModal, "refresh"],
      [RawClientesModal, "reload"],
    ],
    args,
    null,
    { guarded: true }
  );

export const updateModal = (...args) =>
  callAny(
    [
      [RawClientesModal, "update"],
      [RawClientesModal, "setState"],
    ],
    args,
    false,
    { guarded: true }
  );

export const getModalState = (...args) =>
  callAny(
    [
      [RawClientesModal, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   FLAGS / DEBUG
========================================================= */

export const isInitialized = () =>
  Boolean(
    RawClientesView?.initialized ||
      RawClientesView?.isInitialized ||
      safeCall(RawClientesView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    RawClientesView?.destroyed ||
      RawClientesView?.isDestroyed ||
      safeCall(RawClientesView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    RawClientesView?.mounted ||
      RawClientesView?.isMounted ||
      safeCall(RawClientesView, "isMounted", [], false)
  );

export const canRenderClientesNow = (...args) =>
  shouldAllowClientesMethod(
    "render",
    args
  );

export const getClientesRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      CLIENTES_INDEX_SOURCE,

    allowed:
      shouldAllowClientesMethod(
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
        [RawClientesView, "getSnapshot"],
        [RawClientesView, "getState"],
      ],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    module:
      CLIENTES_MODULE_NAME,

    viewName:
      CLIENTES_VIEW_NAME,

    version:
      CLIENTES_MODULE_VERSION,

    source:
      CLIENTES_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    mounted:
      isMounted(),

    hasView:
      Boolean(ClientesView),

    hasRawView:
      Boolean(RawClientesView),

    hasCreateView:
      Boolean(RawClientesCreateView),

    hasModal:
      Boolean(RawClientesModal),

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

    clientesAllowedNow:
      canRenderClientesNow(...args),
  };
};

/* =========================================================
   PUBLIC MODULE SHAPE
========================================================= */

export const ClientesModule = Object.freeze({
  name:
    CLIENTES_MODULE_NAME,

  viewName:
    CLIENTES_VIEW_NAME,

  version:
    CLIENTES_MODULE_VERSION,

  source:
    CLIENTES_INDEX_SOURCE,

  ClientesView,
  RawClientesView,
  ClientesCreateView,
  ClientesModal,

  View:
    ClientesView,

  RawView:
    RawClientesView,

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

  openCliente,
  createCliente,
  exportCsv,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  getItems,
  getPageItems,
  getPagination,
  getClienteById,
  getState,
  getSnapshot,

  initCreate,
  openCreate,
  closeCreate,
  renderCreate,
  resetCreate,
  getCreateState,

  openModal,
  closeModal,
  refreshModal,
  updateModal,
  getModalState,

  isInitialized,
  isDestroyed,
  isMounted,

  canRenderClientesNow,
  getClientesRouteDebug,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalObject();

  try {
    const previous =
      root.OnionClientes &&
      typeof root.OnionClientes === "object"
        ? root.OnionClientes
        : {};

    root.OnionClientes = {
      ...previous,
      ...ClientesModule,
    };

    root.OnionClientesView =
      root.OnionClientesView &&
      typeof root.OnionClientesView === "object"
        ? {
            ...root.OnionClientesView,
            ...ClientesModule,
            view:
              ClientesView,
          }
        : ClientesView;

    root.ClientesView =
      root.ClientesView &&
      typeof root.ClientesView === "object"
        ? {
            ...root.ClientesView,
            ...ClientesModule,
            view:
              ClientesView,
          }
        : ClientesView;

    if (!root.OnionClientesModal && RawClientesModal) {
      root.OnionClientesModal =
        RawClientesModal;
    }

    if (!root.OnionClientesCreateModal && RawClientesCreateView) {
      root.OnionClientesCreateModal =
        RawClientesCreateView;
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

      appCore.modules.Clientes =
        ClientesModule;

      appCore.modules.ClientesView =
        ClientesModule;

      appCore.modules.OnionClientes =
        ClientesModule;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "clientes:index:ready",
    {
      source:
        CLIENTES_INDEX_SOURCE,

      hasView:
        Boolean(ClientesView),

      hasRawView:
        Boolean(RawClientesView),

      hasCreateView:
        Boolean(RawClientesCreateView),

      hasModal:
        Boolean(RawClientesModal),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderClientesNow(),
    }
  );

  return ClientesModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

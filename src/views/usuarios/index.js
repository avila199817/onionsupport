/* =========================================================
   Onion SPA - Usuarios View
   Archivo: src/views/usuarios/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · ADMIN USERS · ROUTE SAFE · 10/10

   RESPONSABILIDADES:
   - punto de entrada único del módulo usuarios
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y usuariosView.js
   - init / mount / render / reload / destroy seguros
   - exponer create / modal / helpers públicos
   - exponer actions públicas útiles
   - evitar duplicidad de lógica en index.js
   - registrar bridge global estable

   HARDENING PRO:
   - fallback si cambia nombre del módulo
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo no existe
   - global bridge opcional idempotente

   FIX ROUTE SAFE:
   - UsuariosView.init/render/mount/reload/refresh solo corren en /usuarios
   - acepta /@usuario/usuarios como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es usuarios
   - destroy/unmount/close siempre permitidos
   - actions/store/model/state siguen disponibles
========================================================= */

import RawUsuariosView from "./usuariosView.js";
import RawUsuariosCreateView from "./usuarios.create.modal.js";
import RawUsuariosModal from "./usuarios.modal.js";

import {
  openUsuarioAction,
  getUsuarioDetailAction,
  getUsuarioDetailFromStoreAction,
  refreshUsuarioDetailAction,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  createUsuarioAction,
  submitCreateUsuarioAction,
} from "./usuarios.actions.js";

import {
  usuariosState,
  getUsuariosStateSnapshot,
} from "./usuarios.state.js";

import {
  getUsuarios,
  getSortedUsuariosStore,
  getUsuarioByIdStore,
  getUsuariosCount,
  hasUsuarios,
  getUsuariosStoreSnapshot,
} from "./usuarios.store.js";

import {
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,
} from "./usuarios.model.js";

/* =========================================================
   MODULE META
========================================================= */

export const USUARIOS_MODULE_NAME = "usuarios";
export const USUARIOS_VIEW_NAME = "UsuariosView";
export const USUARIOS_MODULE_VERSION = "11.0.0";
export const USUARIOS_CANONICAL_PATH = "/usuarios";
export const USUARIOS_INDEX_SOURCE = "views:usuarios:index";

/* =========================================================
   CORE RE-EXPORTS
========================================================= */

export {
  usuariosState,
  getUsuariosStateSnapshot,

  getUsuarios,
  getSortedUsuariosStore,
  getUsuarioByIdStore,
  getUsuariosCount,
  hasUsuarios,
  getUsuariosStoreSnapshot,

  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,

  openUsuarioAction,
  getUsuarioDetailAction,
  getUsuarioDetailFromStoreAction,
  refreshUsuarioDetailAction,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  createUsuarioAction,
  submitCreateUsuarioAction,
};

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
      "[UsuariosIndex]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[UsuariosIndex]",
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

  "openUsuario",
  "open",
  "openById",
  "copyUsuarioId",
  "createUsuario",
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
  "getUsuarioById",
  "getState",
  "isAdmin",
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

function isUsuariosPath(path = "") {
  return (
    getCleanCanonicalPath(path || "/") ===
    USUARIOS_CANONICAL_PATH
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
    isUsuarios:
      isUsuariosPath(text),
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
    isUsuarios:
      normalized === "usuarios" ||
      normalized === "usuariosview" ||
      normalized === "usuarios-view",
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
    signals.find((signal) => signal.isUsuarios === false) ||
    null
  );
}

function hasPositiveUsuariosSignal(signals = []) {
  return signals.some((signal) => signal.isUsuarios === true);
}

function shouldAllowUsuariosMethod(method = "", args = []) {
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
    return isUsuariosPath(browserPath);
  }

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveUsuariosSignal(signals)) {
    return true;
  }

  const appRoute =
    getAppStatePath();

  const appPublicPath =
    getAppPublicPath();

  if (appRoute || appPublicPath) {
    return (
      isUsuariosPath(appRoute || "") ||
      isUsuariosPath(appPublicPath || "")
    );
  }

  return true;
}

function logBlockedUsuariosMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `UsuariosView.${method} bloqueado: ruta actual no es Usuarios.`,
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

    case "copyUsuarioId":
    case "createUsuario":
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
    case "getUsuarioById":
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
    !shouldAllowUsuariosMethod(
      method,
      callArgs
    )
  ) {
    logBlockedUsuariosMethod(
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

function createGuardedUsuariosViewBridge(view) {
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
        return USUARIOS_INDEX_SOURCE;
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
        function guardedUsuariosViewMethod(...args) {
          if (
            !shouldAllowUsuariosMethod(
              method,
              args
            )
          ) {
            logBlockedUsuariosMethod(
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
              `UsuariosView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedUsuarios_${method}`,
          },

          routeViewKey: {
            value:
              "usuarios",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              USUARIOS_VIEW_NAME,
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
        !shouldAllowUsuariosMethod(
          "render",
          args
        )
      ) {
        logBlockedUsuariosMethod(
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

export const UsuariosView =
  createGuardedUsuariosViewBridge(
    RawUsuariosView
  );

export const UsuariosCreateView =
  RawUsuariosCreateView;

export const UsuariosModal =
  RawUsuariosModal;

export const view =
  UsuariosView;

export const component =
  UsuariosView;

export const page =
  UsuariosView;

export default UsuariosView;

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  asyncCallAny(
    [
      [RawUsuariosView, "init"],
      [RawUsuariosView, "mount"],
      [RawUsuariosView, "render"],
    ],
    args,
    UsuariosView,
    { guarded: true }
  );

export const mount = (...args) =>
  init(...args);

export const render = (...args) =>
  callAny(
    [
      [RawUsuariosView, "render"],
      [RawUsuariosView, "mount"],
      [RawUsuariosView, "init"],
    ],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  asyncCallAny(
    [
      [RawUsuariosView, "reload"],
      [RawUsuariosView, "refresh"],
      [RawUsuariosView, "loadUsuarios"],
    ],
    args,
    UsuariosView,
    { guarded: true }
  );

export const refresh = (...args) =>
  reload(...args);

export const destroy = (...args) =>
  callAny(
    [
      [RawUsuariosView, "destroy"],
      [RawUsuariosView, "unmount"],
      [RawUsuariosView, "dispose"],
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

export const openUsuario = (...args) =>
  asyncCallAny(
    [
      [RawUsuariosView, "openUsuario"],
      [RawUsuariosView, "open"],
      [RawUsuariosView, "openById"],
      [{ openUsuarioAction }, "openUsuarioAction"],
    ],
    args,
    null,
    { guarded: true }
  );

export const copyUsuarioId = (...args) =>
  asyncCallAny(
    [
      [RawUsuariosView, "copyUsuarioId"],
      [{ copyUsuarioIdAction }, "copyUsuarioIdAction"],
    ],
    args,
    false,
    { guarded: true }
  );

export const createUsuario = (...args) =>
  asyncCallAny(
    [
      [RawUsuariosView, "createUsuario"],
      [RawUsuariosView, "create"],
      [{ createUsuarioAction }, "createUsuarioAction"],
    ],
    args,
    false,
    { guarded: true }
  );

export const exportCsv = (...args) =>
  callAny(
    [
      [RawUsuariosView, "exportCsv"],
      [RawUsuariosView, "exportUsuariosCsv"],
      [{ exportUsuariosCsvAction }, "exportUsuariosCsvAction"],
    ],
    args,
    false,
    { guarded: true }
  );

export const refreshUsuario = (...args) =>
  refreshUsuarioDetailAction(...args);

export const submitCreateUsuario = (...args) =>
  guardedCall(
    { submitCreateUsuarioAction },
    "submitCreateUsuarioAction",
    args,
    false
  );

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  callAny(
    [
      [RawUsuariosView, "goToPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goPrevPage = (...args) =>
  callAny(
    [
      [RawUsuariosView, "goPrevPage"],
      [RawUsuariosView, "prevPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const goNextPage = (...args) =>
  callAny(
    [
      [RawUsuariosView, "goNextPage"],
      [RawUsuariosView, "nextPage"],
    ],
    args,
    1,
    { guarded: true }
  );

export const changePageSize = (...args) =>
  callAny(
    [
      [RawUsuariosView, "changePageSize"],
      [RawUsuariosView, "setPageSize"],
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
      [RawUsuariosView, "getItems"],
      [RawUsuariosView, "getUsuarios"],
      [{ getUsuarios }, "getUsuarios"],
    ],
    args,
    []
  );

export const getPageItems = (...args) =>
  callAny(
    [
      [RawUsuariosView, "getPageItems"],
    ],
    args,
    []
  );

export const getPagination = (...args) =>
  callAny(
    [
      [RawUsuariosView, "getPagination"],
    ],
    args,
    null
  );

export const getUsuarioById = (...args) =>
  callAny(
    [
      [RawUsuariosView, "getUsuarioById"],
      [RawUsuariosView, "findUsuarioById"],
      [{ getUsuarioByIdStore }, "getUsuarioByIdStore"],
    ],
    args,
    null
  );

export const getState = (...args) =>
  callAny(
    [
      [RawUsuariosView, "getState"],
      [{ getUsuariosStateSnapshot }, "getUsuariosStateSnapshot"],
    ],
    args,
    getUsuariosStateSnapshot?.() || usuariosState
  );

export const isAdmin = (...args) =>
  callAny(
    [
      [RawUsuariosView, "isAdmin"],
    ],
    args,
    false
  );

/* =========================================================
   CREATE VIEW API
========================================================= */

export const initCreate = (...args) =>
  guardedCall(
    RawUsuariosCreateView,
    "init",
    args,
    undefined
  );

export const openCreate = (...args) =>
  callAny(
    [
      [RawUsuariosCreateView, "open"],
      [RawUsuariosCreateView, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeCreate = (...args) =>
  callAny(
    [
      [RawUsuariosCreateView, "close"],
      [RawUsuariosCreateView, "destroy"],
      [RawUsuariosCreateView, "unmount"],
    ],
    args,
    true
  );

export const renderCreate = (...args) =>
  callAny(
    [
      [RawUsuariosCreateView, "render"],
    ],
    args,
    null,
    { guarded: true }
  );

export const resetCreate = (...args) =>
  callAny(
    [
      [RawUsuariosCreateView, "reset"],
    ],
    args,
    undefined,
    { guarded: true }
  );

export const getCreateState = (...args) =>
  callAny(
    [
      [RawUsuariosCreateView, "getState"],
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
      [RawUsuariosModal, "open"],
      [RawUsuariosModal, "mount"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeModal = (...args) =>
  callAny(
    [
      [RawUsuariosModal, "close"],
      [RawUsuariosModal, "destroy"],
      [RawUsuariosModal, "unmount"],
    ],
    args,
    true
  );

export const refreshModal = (...args) =>
  asyncCallAny(
    [
      [RawUsuariosModal, "refresh"],
      [RawUsuariosModal, "reload"],
    ],
    args,
    null,
    { guarded: true }
  );

export const updateModal = (...args) =>
  callAny(
    [
      [RawUsuariosModal, "update"],
      [RawUsuariosModal, "setState"],
    ],
    args,
    false,
    { guarded: true }
  );

export const getModalState = (...args) =>
  callAny(
    [
      [RawUsuariosModal, "getState"],
    ],
    args,
    null
  );

/* =========================================================
   FLAGS / DEBUG
========================================================= */

export const isInitialized = () =>
  Boolean(
    RawUsuariosView?.initialized ||
      RawUsuariosView?.isInitialized ||
      safeCall(RawUsuariosView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    RawUsuariosView?.destroyed ||
      RawUsuariosView?.isDestroyed ||
      safeCall(RawUsuariosView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    RawUsuariosView?.mounted ||
      RawUsuariosView?.isMounted ||
      safeCall(RawUsuariosView, "isMounted", [], false)
  );

export const canRenderUsuariosNow = (...args) =>
  shouldAllowUsuariosMethod(
    "render",
    args
  );

export const getUsuariosRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      USUARIOS_INDEX_SOURCE,

    allowed:
      shouldAllowUsuariosMethod(
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
        [RawUsuariosView, "getSnapshot"],
        [RawUsuariosView, "getState"],
      ],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    module:
      USUARIOS_MODULE_NAME,

    viewName:
      USUARIOS_VIEW_NAME,

    version:
      USUARIOS_MODULE_VERSION,

    source:
      USUARIOS_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    mounted:
      isMounted(),

    hasView:
      Boolean(UsuariosView),

    hasRawView:
      Boolean(RawUsuariosView),

    hasCreateView:
      Boolean(RawUsuariosCreateView),

    hasModal:
      Boolean(RawUsuariosModal),

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

    usuariosAllowedNow:
      canRenderUsuariosNow(...args),
  };
};

/* =========================================================
   PUBLIC MODULE SHAPE
========================================================= */

export const UsuariosModule = Object.freeze({
  name:
    USUARIOS_MODULE_NAME,

  viewName:
    USUARIOS_VIEW_NAME,

  version:
    USUARIOS_MODULE_VERSION,

  source:
    USUARIOS_INDEX_SOURCE,

  UsuariosView,
  RawUsuariosView,
  UsuariosCreateView,
  UsuariosModal,

  View:
    UsuariosView,

  RawView:
    RawUsuariosView,

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

  openUsuario,
  copyUsuarioId,
  createUsuario,
  submitCreateUsuario,
  exportCsv,
  refreshUsuario,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  getItems,
  getPageItems,
  getPagination,
  getUsuarioById,
  getState,
  getSnapshot,
  isAdmin,

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

  canRenderUsuariosNow,
  getUsuariosRouteDebug,

  actions: {
    openUsuarioAction,
    getUsuarioDetailAction,
    getUsuarioDetailFromStoreAction,
    refreshUsuarioDetailAction,
    copyUsuarioIdAction,
    exportUsuariosCsvAction,
    createUsuarioAction,
    submitCreateUsuarioAction,
  },

  store: {
    getUsuarios,
    getSortedUsuariosStore,
    getUsuarioByIdStore,
    getUsuariosCount,
    hasUsuarios,
    getUsuariosStoreSnapshot,
  },

  model: {
    normalizeUsuarioModel,
    normalizeUsuariosCollection,
    findUsuarioById,
    paginateUsuarios,
    computeUsuariosStats,
  },

  state:
    usuariosState,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalObject();

  try {
    const previous =
      root.OnionUsuarios &&
      typeof root.OnionUsuarios === "object"
        ? root.OnionUsuarios
        : {};

    root.OnionUsuarios = {
      ...previous,
      ...UsuariosModule,
    };

    root.OnionUsuariosView =
      root.OnionUsuariosView &&
      typeof root.OnionUsuariosView === "object"
        ? {
            ...root.OnionUsuariosView,
            ...UsuariosModule,
            view:
              UsuariosView,
          }
        : UsuariosView;

    root.UsuariosView =
      root.UsuariosView &&
      typeof root.UsuariosView === "object"
        ? {
            ...root.UsuariosView,
            ...UsuariosModule,
            view:
              UsuariosView,
          }
        : UsuariosView;

    if (!root.OnionUsuariosModal && RawUsuariosModal) {
      root.OnionUsuariosModal =
        RawUsuariosModal;
    }

    if (!root.OnionUsuariosCreateModal && RawUsuariosCreateView) {
      root.OnionUsuariosCreateModal =
        RawUsuariosCreateView;
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

      appCore.modules.Usuarios =
        UsuariosModule;

      appCore.modules.UsuariosView =
        UsuariosModule;

      appCore.modules.OnionUsuarios =
        UsuariosModule;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "usuarios:index:ready",
    {
      source:
        USUARIOS_INDEX_SOURCE,

      hasView:
        Boolean(UsuariosView),

      hasRawView:
        Boolean(RawUsuariosView),

      hasCreateView:
        Boolean(RawUsuariosCreateView),

      hasModal:
        Boolean(RawUsuariosModal),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderUsuariosNow(),
    }
  );

  return UsuariosModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · ROUTE SAFE · 13/10
   EXTREME MODULE BRIDGE · ROUTER READY · LEGACY READY

   RESPONSABILIDADES:
   - punto de entrada único del módulo incidencias
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y incidenciasView.js
   - init / mount / render / reload / destroy seguros
   - exponer create / modal / helpers públicos
   - exponer filtros y búsqueda pública
   - evitar duplicidad de lógica en index.js
   - no reimplementar lógica del View: solo delegar
   - registrar bridge global estable para topbar/search/router

   HARDENING PRO:
   - import por namespace para tolerar default/named exports
   - fallback si cambia nombre del módulo exportado
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo cambia su forma de export
   - no pisa globals existentes sin fusionar
   - bridge AppCore.modules si AppCore está expuesto en window/globalThis

   FIX ROUTE SAFE:
   - IncidenciasView.init/render/mount/reload/refresh solo corren en /incidencias
   - acepta /@usuario/incidencias como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es incidencias
   - destroy/unmount/close siempre permitidos
   - modales de detalle/create siguen disponibles para bridge externo
========================================================= */

import * as IncidenciasViewModule from "./incidenciasView.js";
import * as IncidenciasCreateModalModule from "./incidencias.create.modal.js";
import * as IncidenciasModalModule from "./incidencias.modal.js";

/* =========================================================
   CONSTANTS
========================================================= */

const INCIDENCIAS_INDEX_SOURCE = "views:incidencias:index";
const INCIDENCIAS_CANONICAL_PATH = "/incidencias";

const GUARDED_VIEW_METHODS = new Set([
  "init",
  "mount",
  "render",
  "scheduleRender",
  "reload",
  "refresh",

  "openTicket",
  "open",
  "openById",
  "openTicketFromExternalRequest",
  "openTicketFromLocationOnce",
  "closeTicket",

  "createIncidencia",
  "create",
  "exportCsv",
  "export",
  "copyTicketId",
  "copy",
  "refreshTicketDetail",
  "refreshDetail",

  "setFilter",
  "setSearchQuery",
  "search",
  "clearFilters",
  "clearSearchOnly",
  "clearSearch",

  "goToPage",
  "goPrevPage",
  "prevPage",
  "goNextPage",
  "nextPage",
  "changePageSize",
  "setPageSize",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",

  "getItems",
  "getFilteredItems",
  "getPageItems",
  "getPagination",
  "getTicketById",
  "findTicketById",
  "mergeTicketDetailWithStoreSnapshot",
  "getState",
  "getSnapshot",
]);

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
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function getGlobalRoot() {
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
      getGlobalRoot();

    root?.AppCore?.utils?.warn?.(
      "[IncidenciasIndex]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[IncidenciasIndex]",
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
    getGlobalRoot();

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
   PATH / ROUTE GUARD
========================================================= */

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

function isIncidenciasPath(path = "") {
  return (
    getCleanCanonicalPath(path || "/") ===
    INCIDENCIAS_CANONICAL_PATH
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
    getGlobalRoot();

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
    isIncidencias:
      isIncidenciasPath(text),
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
    isIncidencias:
      normalized === "incidencias" ||
      normalized === "incidenciasview" ||
      normalized === "incidencias-view",
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
    signals.find((signal) => signal.isIncidencias === false) ||
    null
  );
}

function hasPositiveIncidenciasSignal(signals = []) {
  return signals.some((signal) => signal.isIncidencias === true);
}

function shouldAllowIncidenciasMethod(method = "", args = []) {
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

  const signals =
    collectRouteSignals(args);

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveIncidenciasSignal(signals)) {
    return true;
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return isIncidenciasPath(browserPath);
  }

  return true;
}

function logBlockedIncidenciasMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `IncidenciasView.${method} bloqueado: ruta actual no es Incidencias.`,
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
    case "closeTicket":
      return true;

    case "copyTicketId":
    case "exportCsv":
    case "export":
    case "setFilter":
    case "setSearchQuery":
    case "search":
    case "clearFilters":
    case "clearSearchOnly":
    case "clearSearch":
    case "goToPage":
    case "goPrevPage":
    case "prevPage":
    case "goNextPage":
    case "nextPage":
    case "changePageSize":
    case "setPageSize":
      return false;

    case "getItems":
    case "getFilteredItems":
    case "getPageItems":
      return [];

    case "getPagination":
    case "getTicketById":
    case "findTicketById":
    case "mergeTicketDetailWithStoreSnapshot":
    case "getState":
      return null;

    default:
      return null;
  }
}

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function pickModuleExport(moduleObject = {}, names = []) {
  const source =
    safeObject(moduleObject);

  for (const name of names) {
    const value =
      source?.[name];

    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
}

const RawIncidenciasView =
  pickModuleExport(IncidenciasViewModule, [
    "default",
    "IncidenciasView",
    "OnionIncidenciasView",
    "View",
  ]) || null;

export const IncidenciasCreateModal =
  pickModuleExport(IncidenciasCreateModalModule, [
    "default",
    "IncidenciasCreateModal",
    "IncidenciasCreateView",
    "OnionIncidenciasCreateModal",
    "OnionIncidenciasCreateView",
    "CreateModal",
  ]) || null;

export const IncidenciasModal =
  pickModuleExport(IncidenciasModalModule, [
    "default",
    "IncidenciasModal",
    "OnionIncidenciasModal",
    "TicketModal",
    "OnionTicketModal",
    "DetailModal",
  ]) || null;

/* =========================================================
   GUARDED VIEW PROXY
========================================================= */

function createGuardedIncidenciasViewBridge(view) {
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
        return INCIDENCIAS_INDEX_SOURCE;
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
        function guardedIncidenciasViewMethod(...args) {
          if (
            !shouldAllowIncidenciasMethod(
              method,
              args
            )
          ) {
            logBlockedIncidenciasMethod(
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
              `IncidenciasView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedIncidencias_${method}`,
          },

          routeViewKey: {
            value:
              "incidencias",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              "IncidenciasView",
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

export const IncidenciasView =
  createGuardedIncidenciasViewBridge(
    RawIncidenciasView
  );

export default IncidenciasView;

/* =========================================================
   LIVE TARGETS
========================================================= */

function getViewTarget() {
  const root =
    getGlobalRoot();

  return (
    IncidenciasView ||
    root?.OnionIncidenciasView?.view ||
    root?.OnionIncidenciasView ||
    root?.IncidenciasView?.view ||
    root?.IncidenciasView ||
    root?.OnionIncidenciasUI?.view ||
    root?.OnionIncidencias?.view ||
    null
  );
}

function getRawViewTarget() {
  const root =
    getGlobalRoot();

  return (
    RawIncidenciasView ||
    root?.OnionIncidencias?.RawView ||
    root?.OnionIncidencias?.view?.__raw ||
    null
  );
}

function getCreateModalTarget() {
  const root =
    getGlobalRoot();

  return (
    IncidenciasCreateModal ||
    root?.OnionIncidenciasCreateModal ||
    root?.IncidenciasCreateModal ||
    root?.OnionIncidencias?.createModal ||
    null
  );
}

function getDetailModalTarget() {
  const root =
    getGlobalRoot();

  return (
    IncidenciasModal ||
    root?.OnionIncidenciasModal ||
    root?.IncidenciasModal ||
    root?.OnionIncidencias?.modal ||
    null
  );
}

/* =========================================================
   INTERNAL SAFE CALL
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
    !shouldAllowIncidenciasMethod(
      method,
      callArgs
    )
  ) {
    logBlockedIncidenciasMethod(
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

function safeCallAny(target, methods = [], args = [], fallback = undefined, options = {}) {
  const names =
    Array.isArray(methods)
      ? methods
      : [methods];

  const opts =
    safeObject(options);

  for (const method of names) {
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

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["init", "mount"],
    args,
    null,
    { guarded: true }
  );

export const mount = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["mount", "init"],
    args,
    null,
    { guarded: true }
  );

export const render = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["render", "scheduleRender"],
    args,
    null,
    { guarded: true }
  );

export const scheduleRender = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["scheduleRender", "render"],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["reload", "refresh"],
    args,
    null,
    { guarded: true }
  );

export const refresh = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["refresh", "reload"],
    args,
    null,
    { guarded: true }
  );

export const destroy = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["destroy", "unmount"],
    args,
    true
  );

export const unmount = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["unmount", "destroy"],
    args,
    true
  );

/* =========================================================
   ACTIONS API
========================================================= */

export const openTicket = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["openTicket", "open", "openById"],
    args,
    null,
    { guarded: true }
  );

export const openTicketById = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["openTicket", "openById", "open"],
    args,
    null,
    { guarded: true }
  );

export const openById =
  openTicketById;

export const openTicketFromExternalRequest = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["openTicketFromExternalRequest", "open"],
    args,
    null,
    { guarded: true }
  );

export const openTicketFromLocationOnce = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["openTicketFromLocationOnce"],
    args,
    null,
    { guarded: true }
  );

export const closeTicket = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["closeTicket", "close"],
    args,
    true
  );

export const createIncidencia = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["createIncidencia", "create"],
    args,
    null,
    { guarded: true }
  );

export const create =
  createIncidencia;

export const exportCsv = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["exportCsv", "export"],
    args,
    false,
    { guarded: true }
  );

export const copyTicketId = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["copyTicketId", "copy"],
    args,
    false,
    { guarded: true }
  );

export const refreshTicketDetail = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["refreshTicketDetail", "refreshDetail"],
    args,
    null,
    { guarded: true }
  );

/* =========================================================
   FILTER / SEARCH API
========================================================= */

export const setFilter = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["setFilter"],
    args,
    false,
    { guarded: true }
  );

export const setSearchQuery = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["setSearchQuery", "search"],
    args,
    false,
    { guarded: true }
  );

export const search =
  setSearchQuery;

export const clearFilters = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["clearFilters"],
    args,
    false,
    { guarded: true }
  );

export const clearSearchOnly = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["clearSearchOnly", "clearSearch"],
    args,
    false,
    { guarded: true }
  );

export const clearSearch =
  clearSearchOnly;

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["goToPage"],
    args,
    false,
    { guarded: true }
  );

export const goPrevPage = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["goPrevPage", "prevPage"],
    args,
    false,
    { guarded: true }
  );

export const goNextPage = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["goNextPage", "nextPage"],
    args,
    false,
    { guarded: true }
  );

export const changePageSize = (...args) =>
  safeCallAny(
    getViewTarget(),
    ["changePageSize", "setPageSize"],
    args,
    false,
    { guarded: true }
  );

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["getItems"],
    args,
    []
  );

export const getFilteredItems = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["getFilteredItems"],
    args,
    []
  );

export const getPageItems = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["getPageItems"],
    args,
    []
  );

export const getPagination = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["getPagination"],
    args,
    null
  );

export const getTicketById = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["getTicketById", "findTicketById"],
    args,
    null
  );

export const findTicketById = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["findTicketById", "getTicketById"],
    args,
    null
  );

export const mergeTicketDetailWithStoreSnapshot = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["mergeTicketDetailWithStoreSnapshot"],
    args,
    null
  );

export const getState = (...args) =>
  safeCallAny(
    getRawViewTarget() || getViewTarget(),
    ["getState"],
    args,
    null
  );

/* =========================================================
   CREATE MODAL API
========================================================= */

export const openCreate = (...args) => {
  const result =
    safeCallAny(
      getCreateModalTarget(),
      ["open", "mount"],
      args,
      undefined
    );

  if (result !== undefined) {
    return result;
  }

  return createIncidencia(...args);
};

export const closeCreate = (...args) =>
  safeCallAny(
    getCreateModalTarget(),
    ["close", "destroy", "unmount"],
    args,
    true
  );

export const updateCreate = (...args) =>
  safeCallAny(
    getCreateModalTarget(),
    ["update", "setState"],
    args,
    null
  );

export const destroyCreate = (...args) =>
  safeCallAny(
    getCreateModalTarget(),
    ["destroy", "unmount", "close"],
    args,
    true
  );

export const getCreateState = (...args) =>
  safeCallAny(
    getCreateModalTarget(),
    ["getState", "state"],
    args,
    null
  );

/* =========================================================
   DETAIL MODAL API
========================================================= */

export const openModal = (...args) => {
  const result =
    safeCallAny(
      getDetailModalTarget(),
      ["open", "mount"],
      args,
      undefined
    );

  if (result !== undefined) {
    return result;
  }

  const payload =
    first(...args);

  return openTicketFromExternalRequest(
    payload
  );
};

export const closeModal = (...args) =>
  safeCallAny(
    getDetailModalTarget(),
    ["close", "destroy", "unmount"],
    args,
    true
  );

export const updateModal = (...args) =>
  safeCallAny(
    getDetailModalTarget(),
    ["update", "setState"],
    args,
    null
  );

export const destroyModal = (...args) =>
  safeCallAny(
    getDetailModalTarget(),
    ["destroy", "unmount", "close"],
    args,
    true
  );

export const getModalState = (...args) =>
  safeCallAny(
    getDetailModalTarget(),
    ["getState", "state"],
    args,
    null
  );

/* =========================================================
   COMPOSITE API
========================================================= */

export const destroyAll = (...args) => {
  const results = [];

  results.push(
    destroy(...args)
  );

  results.push(
    destroyModal(...args)
  );

  results.push(
    destroyCreate(...args)
  );

  return results;
};

export const closeAll = (...args) => {
  const results = [];

  results.push(
    closeModal(...args)
  );

  results.push(
    closeCreate(...args)
  );

  results.push(
    closeTicket(...args)
  );

  return results;
};

/* =========================================================
   FLAGS / DEBUG
========================================================= */

export const isInitialized = () =>
  Boolean(
    getRawViewTarget()?.initialized ||
      getViewTarget()?.initialized
  );

export const isDestroyed = () =>
  Boolean(
    getRawViewTarget()?.destroyed ||
      getViewTarget()?.destroyed
  );

export const isReady = () =>
  Boolean(
    getViewTarget() &&
      !isDestroyed()
  );

export const canRenderIncidenciasNow = (...args) =>
  shouldAllowIncidenciasMethod(
    "render",
    args
  );

export const getIncidenciasRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      INCIDENCIAS_INDEX_SOURCE,

    allowed:
      shouldAllowIncidenciasMethod(
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
  const viewTarget =
    getRawViewTarget() || getViewTarget();

  const base =
    safeCallAny(
      viewTarget,
      ["getSnapshot", "getState"],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    source:
      INCIDENCIAS_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    ready:
      isReady(),

    hasView:
      Boolean(getViewTarget()),

    hasRawView:
      Boolean(getRawViewTarget()),

    hasCreateModal:
      Boolean(getCreateModalTarget()),

    hasDetailModal:
      Boolean(getDetailModalTarget()),

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

    incidenciasAllowedNow:
      shouldAllowIncidenciasMethod(
        "render",
        args
      ),
  };
};

/* =========================================================
   PUBLIC BRIDGE BUILDER
========================================================= */

export function buildBridge() {
  return {
    view:
      getViewTarget(),

    rawView:
      getRawViewTarget(),

    modal:
      getDetailModalTarget(),

    createModal:
      getCreateModalTarget(),

    init,
    mount,
    render,
    scheduleRender,
    reload,
    refresh,
    destroy,
    unmount,

    openTicket,
    openTicketById,
    openById,
    openTicketFromExternalRequest,
    openTicketFromLocationOnce,
    closeTicket,

    createIncidencia,
    create,
    exportCsv,
    copyTicketId,
    refreshTicketDetail,

    setFilter,
    setSearchQuery,
    search,
    clearFilters,
    clearSearchOnly,
    clearSearch,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems,
    getFilteredItems,
    getPageItems,
    getPagination,
    getTicketById,
    findTicketById,
    mergeTicketDetailWithStoreSnapshot,
    getState,
    getSnapshot,

    openModal,
    closeModal,
    updateModal,
    destroyModal,
    getModalState,

    openCreate,
    closeCreate,
    updateCreate,
    destroyCreate,
    getCreateState,

    closeAll,
    destroyAll,

    isInitialized,
    isDestroyed,
    isReady,

    canRenderIncidenciasNow,
    getIncidenciasRouteDebug,
  };
}

/* =========================================================
   LEGACY GLOBAL BRIDGE
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalRoot();

  const bridge =
    buildBridge();

  try {
    const globalKeys = [
      "OnionIncidencias",
      "OnionIncidenciasUI",
      "IncidenciasBridge",
      "OnionIncidenciasBridge",
      "OnionIncidenciaBridge",
    ];

    globalKeys.forEach((key) => {
      const previous =
        safeObject(root?.[key]);

      root[key] = {
        ...previous,
        ...bridge,
      };
    });

    /*
      Importante:
      Estos dos nombres suelen esperarse como "view object".
      Los dejamos apuntando al proxy guardado, no al bridge entero.
    */
    root.OnionIncidenciasView =
      root.OnionIncidenciasView &&
      isObject(root.OnionIncidenciasView)
        ? {
            ...root.OnionIncidenciasView,
            ...bridge,
            view:
              getViewTarget(),
          }
        : getViewTarget();

    root.IncidenciasView =
      root.IncidenciasView &&
      isObject(root.IncidenciasView)
        ? {
            ...root.IncidenciasView,
            ...bridge,
            view:
              getViewTarget(),
          }
        : getViewTarget();

    root.openIncidenciaModal =
      (...args) =>
        openTicketFromExternalRequest(...args);

    root.openIncidenciaFicha =
      (...args) =>
        openTicketFromExternalRequest(...args);

    root.openTicketModal =
      (...args) =>
        openTicketFromExternalRequest(...args);

    root.openTicketFicha =
      (...args) =>
        openTicketFromExternalRequest(...args);

    root.renderIncidenciaModal =
      (...args) =>
        openTicketFromExternalRequest(...args);
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge global window/globalThis.",
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

      appCore.modules.Incidencias =
        bridge;

      appCore.modules.IncidenciasView =
        bridge;

      appCore.modules.OnionIncidencias =
        bridge;

      appCore.modules.OnionIncidenciasUI =
        bridge;

      appCore.modules.OnionIncidenciasBridge =
        bridge;

      appCore.modules.OnionIncidenciaBridge =
        bridge;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "incidencias:index:ready",
    {
      source:
        "incidencias/index.js",

      hasView:
        Boolean(getViewTarget()),

      hasRawView:
        Boolean(getRawViewTarget()),

      hasCreateModal:
        Boolean(getCreateModalTarget()),

      hasDetailModal:
        Boolean(getDetailModalTarget()),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderIncidenciasNow(),
    }
  );

  return bridge;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

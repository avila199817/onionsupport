/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   FINAL PRO SYSTEM · MODULE ENTRYPOINT · 10/10 EXTREME
   PATCH · ROUTE SAFE · LEGACY SAFE · NO DUPLICATED HELPERS
   PATCH · PUBLIC API STABLE · GLOBAL BRIDGE SAFE
   PATCH · NAMESPACE EXPORT SAFE · ROUTER COMPAT

   RESPONSABILIDADES:
   - punto de entrada único del módulo Facturas
   - exportar vista principal para router moderno y legacy
   - proteger render/init/mount/reload contra rutas incorrectas
   - aceptar /facturas y /@usuario/facturas
   - exponer namespaces internos sin duplicar lógica
   - exponer API pública estable aunque cambien exports internos
   - registrar bridge global sin sobreescritura destructiva

   IMPORTANTE:
   - Este archivo NO contiene CSS.
   - Este archivo NO normaliza facturas.
   - Este archivo NO contiene lógica de dominio.
   - La lógica de dominio vive en facturas.model.js.
   - Los helpers base viven en facturas.utils.js.
========================================================= */

import RawFacturasView from "./facturasView.js";

import * as Model from "./facturas.model.js";
import * as Utils from "./facturas.utils.js";
import * as State from "./facturas.state.js";
import * as Store from "./facturas.store.js";
import * as Api from "./facturas.api.js";
import * as Loaders from "./facturas.loaders.js";
import * as Actions from "./facturas.actions.js";
import * as Bindings from "./facturas.bindings.js";
import * as Template from "./facturas.template.js";
import * as DetailTemplate from "./facturas.detail.template.js";
import * as CreateModal from "./facturas.create.modal.js";
import * as IncidenciasBridge from "./facturas.incidencias.js";

/* =========================================================
   MODULE META
========================================================= */

export const FACTURAS_MODULE_NAME = "facturas";
export const FACTURAS_VIEW_NAME = "FacturasView";
export const FACTURAS_MODULE_VERSION = "12.0.0";
export const FACTURAS_CANONICAL_PATH = "/facturas";
export const FACTURAS_INDEX_SOURCE = "views:facturas:index";

/* =========================================================
   NAMESPACE EXPORTS
========================================================= */

export {
  Model,
  Utils,
  State,
  Store,
  Api,
  Loaders,
  Actions,
  Bindings,
  Template,
  DetailTemplate,
  CreateModal,
  IncidenciasBridge,
};

/* =========================================================
   INTERNAL HELPERS · FROM UTILS
========================================================= */

const safeText = Utils.safeText || ((value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
});

const safeObject = Utils.safeObject || ((value, fallback = {}) => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback
));

const safeArray = Utils.safeArray || ((value, fallback = []) => (
  Array.isArray(value) ? value : fallback
));

const first = Utils.first || ((...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
});

const normalizeText = Utils.normalizeText || ((value = "") => (
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
));

/* =========================================================
   INTERNAL SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isProxyable(value) {
  return Boolean(value && (typeof value === "object" || typeof value === "function"));
}

function isNodeLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.nodeType === "number"
  );
}

function getGlobalRoot() {
  try {
    if (typeof globalThis !== "undefined") return globalThis;
  } catch {}

  try {
    if (typeof window !== "undefined") return window;
  } catch {}

  return {};
}

function safeWarn(...args) {
  try {
    Utils.safeWarn?.("[FacturasIndex]", ...args);
    return true;
  } catch {}

  try {
    const root = getGlobalRoot();
    root?.AppCore?.utils?.warn?.("[FacturasIndex]", ...args);
    return true;
  } catch {}

  try {
    console.warn("[FacturasIndex]", ...args);
    return true;
  } catch {}

  return false;
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    if (typeof Utils.safeEmit === "function") {
      return Utils.safeEmit(name, payload);
    }
  } catch {}

  const root = getGlobalRoot();
  let emitted = false;

  try {
    root?.AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

function safeCall(target, method, args = [], fallback = undefined) {
  try {
    const fn = target?.[method];

    if (typeof fn === "function") {
      return fn.apply(target, Array.isArray(args) ? args : []);
    }
  } catch (error) {
    safeWarn(`Error calling ${method}`, error);
  }

  return fallback;
}

function callAny(candidates = [], args = [], fallback = undefined, options = {}) {
  const opts = safeObject(options);

  for (const candidate of safeArray(candidates)) {
    const target = candidate?.[0];
    const method = candidate?.[1];

    if (!target || !method) continue;

    const result = opts.guarded === true
      ? guardedCall(target, method, args, undefined)
      : safeCall(target, method, args, undefined);

    if (result !== undefined) {
      return result;
    }
  }

  return fallback;
}

function moduleMethod(moduleRef, method, fallback = undefined) {
  return (...args) => safeCall(moduleRef, method, args, fallback);
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
  "loadFacturas",
  "openFactura",
  "openFacturaPdf",
  "viewFacturaPdf",
  "downloadFacturaPdf",
  "downloadFactura",
  "sendFacturaToClient",
  "sendFactura",
  "exportFacturasCsv",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",
  "closeDetail",
  "closeFacturaDetail",
  "getItems",
  "getFacturas",
  "getState",
  "getSnapshot",
  "isInitialized",
  "isDestroyed",
  "isMounted",
]);

function getBaseOrigin() {
  if (isBrowser() && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "/";

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitPath(value = "/") {
  const raw = safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitPath(normalizeHashRouterPath(raw));
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathnameOnly(pathname),
    search,
    hash,
  };
}

function normalizeFullPath(path = "/") {
  const raw = safeText(path, "/");

  if (!raw) return "/";

  if (isHashRouterPath(raw)) {
    return normalizeFullPath(normalizeHashRouterPath(raw));
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (parsed.hash && isHashRouterPath(parsed.hash)) {
        return normalizeFullPath(normalizeHashRouterPath(parsed.hash));
      }

      return normalizeFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const { pathname, search, hash } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  return normalizeFullPath(path)
    .split("?")[0]
    .split("#")[0] || "/";
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(safeText(segment, ""));
}

function stripUsernamePrefix(path = "/") {
  const { pathname, search, hash } = splitPath(normalizeFullPath(path));
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length > 0 && isUsernameSegment(segments[0])) {
    const rest = segments.slice(1).join("/");
    const cleanPathname = rest ? normalizePathnameOnly(`/${rest}`) : "/";

    return `${cleanPathname}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function canonicalizePath(path = "/") {
  return normalizeFullPath(stripUsernamePrefix(path || "/"));
}

function getCleanCanonicalPath(path = "/") {
  return stripSearchAndHash(canonicalizePath(path || "/"));
}

function isFacturasPath(path = "") {
  return getCleanCanonicalPath(path || "/") === FACTURAS_CANONICAL_PATH;
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizeFullPath(normalizeHashRouterPath(hash));
    }

    return normalizeFullPath(`${pathname}${search}${hash}`);
  } catch {
    return "";
  }
}

function getAppCore() {
  const root = getGlobalRoot();

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

function getAppRoutePath() {
  const AppCore = getAppCore();

  return safeText(
    first(
      AppCore?.state?.route,
      AppCore?.state?.canonicalPath,
      AppCore?.state?.path,
      ""
    ),
    ""
  );
}

function getAppPublicPath() {
  const AppCore = getAppCore();

  return safeText(
    first(
      AppCore?.state?.publicPath,
      AppCore?.state?.resolvedPath,
      ""
    ),
    ""
  );
}

function pushPathSignal(signals, label, value) {
  const text = safeText(value, "");
  if (!text) return;

  signals.push({
    type: "path",
    label,
    value: text,
    canonical: getCleanCanonicalPath(text),
    isFacturas: isFacturasPath(text),
  });
}

function pushViewSignal(signals, label, value) {
  const text = safeText(value, "");
  if (!text) return;

  const normalized = normalizeText(text);

  signals.push({
    type: "view",
    label,
    value: normalized,
    isFacturas:
      normalized === "facturas" ||
      normalized === "facturasview" ||
      normalized === "facturas-view",
  });
}

function collectRouteSignalsFromObject(signals, value, label = "arg") {
  if (!isObject(value) || isNodeLike(value)) return;

  pushViewSignal(signals, `${label}.viewKey`, value.viewKey);
  pushViewSignal(signals, `${label}.viewName`, value.viewName);
  pushViewSignal(signals, `${label}.name`, value.name);

  pushViewSignal(signals, `${label}.route.viewKey`, value.route?.viewKey);
  pushViewSignal(signals, `${label}.route.viewName`, value.route?.viewName);
  pushViewSignal(signals, `${label}.route.name`, value.route?.name);

  pushPathSignal(signals, `${label}.canonicalPath`, value.canonicalPath);
  pushPathSignal(signals, `${label}.routePath`, value.routePath);
  pushPathSignal(signals, `${label}.publicPath`, value.publicPath);
  pushPathSignal(signals, `${label}.requestedPath`, value.requestedPath);
  pushPathSignal(signals, `${label}.path`, value.path);

  pushPathSignal(signals, `${label}.route.path`, value.route?.path);
  pushPathSignal(signals, `${label}.route.canonicalPath`, value.route?.canonicalPath);
  pushPathSignal(signals, `${label}.route.publicPath`, value.route?.publicPath);

  collectRouteSignalsFromObject(signals, value.options, `${label}.options`);
  collectRouteSignalsFromObject(signals, value.meta, `${label}.meta`);
}

function collectExplicitRouteSignals(args = []) {
  const signals = [];

  safeArray(args).forEach((arg, index) => {
    collectRouteSignalsFromObject(signals, arg, `args[${index}]`);
  });

  return signals;
}

function collectRuntimeRouteSignals() {
  const signals = [];

  const browserPath = getBrowserPath();
  if (browserPath) {
    pushPathSignal(signals, "window.location", browserPath);
  }

  const appRoute = getAppRoutePath();
  if (appRoute) {
    pushPathSignal(signals, "AppCore.state.route", appRoute);
  }

  const publicPath = getAppPublicPath();
  if (publicPath) {
    pushPathSignal(signals, "AppCore.state.publicPath", publicPath);
  }

  return signals;
}

function getBlockingSignal(signals = []) {
  return safeArray(signals).find((signal) => signal.isFacturas === false) || null;
}

function hasPositiveFacturasSignal(signals = []) {
  return safeArray(signals).some((signal) => signal.isFacturas === true);
}

function shouldAllowFacturasMethod(method = "", args = []) {
  const cleanMethod = safeText(method, "");

  if (!cleanMethod) return true;
  if (ALWAYS_ALLOWED_VIEW_METHODS.has(cleanMethod)) return true;
  if (!GUARDED_VIEW_METHODS.has(cleanMethod)) return true;

  const explicitSignals = collectExplicitRouteSignals(args);

  if (explicitSignals.length) {
    return hasPositiveFacturasSignal(explicitSignals) && !getBlockingSignal(explicitSignals);
  }

  const browserPath = getBrowserPath();

  if (browserPath) {
    return isFacturasPath(browserPath);
  }

  const runtimeSignals = collectRuntimeRouteSignals();

  if (runtimeSignals.length) {
    return hasPositiveFacturasSignal(runtimeSignals) && !getBlockingSignal(runtimeSignals);
  }

  return true;
}

function logBlockedFacturasMethod(method = "", args = []) {
  const explicitSignals = collectExplicitRouteSignals(args);
  const runtimeSignals = collectRuntimeRouteSignals();
  const signals = [...explicitSignals, ...runtimeSignals];

  safeWarn(`FacturasView.${method} bloqueado: ruta actual no es Facturas.`, {
    method,
    browserPath: getBrowserPath(),
    browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || "/"),
    appRoute: getAppRoutePath(),
    appPublicPath: getAppPublicPath(),
    explicitSignals,
    runtimeSignals,
    blockingSignal: getBlockingSignal(signals),
  });
}

function getDefaultFallback(method = "") {
  switch (method) {
    case "destroy":
    case "unmount":
    case "dispose":
    case "closeDetail":
    case "closeFacturaDetail":
      return true;

    case "downloadFacturaPdf":
    case "downloadFactura":
    case "sendFacturaToClient":
    case "sendFactura":
    case "exportFacturasCsv":
    case "copyFacturaIdAction":
      return false;

    case "getItems":
    case "getFacturas":
      return [];

    case "getState":
    case "getSnapshot":
      return null;

    default:
      return null;
  }
}

function guardedCall(target, method, args = [], fallback = undefined) {
  const callArgs = Array.isArray(args) ? args : [];

  if (!shouldAllowFacturasMethod(method, callArgs)) {
    logBlockedFacturasMethod(method, callArgs);

    return fallback !== undefined
      ? fallback
      : getDefaultFallback(method);
  }

  return safeCall(target, method, callArgs, fallback);
}

/* =========================================================
   GUARDED VIEW BRIDGE
========================================================= */

function createGuardedFacturasViewBridge(viewRef) {
  const source = viewRef || {};
  const cache = new Map();

  if (typeof Proxy !== "function" || !isProxyable(source)) {
    return source;
  }

  return new Proxy(source, {
    get(target, prop, receiver) {
      if (prop === "__raw") return target;
      if (prop === "__source") return FACTURAS_INDEX_SOURCE;
      if (prop === "routeViewKey") return "facturas";
      if (prop === "routeViewName") return FACTURAS_VIEW_NAME;

      const value = Reflect.get(target, prop, receiver);

      if (!isFn(value)) {
        return value;
      }

      const method = String(prop);

      if (cache.has(method)) {
        return cache.get(method);
      }

      const wrapped = function guardedFacturasViewMethod(...args) {
        if (!shouldAllowFacturasMethod(method, args)) {
          logBlockedFacturasMethod(method, args);
          return getDefaultFallback(method);
        }

        try {
          return value.apply(target, args);
        } catch (error) {
          safeWarn(`FacturasView.${method} falló.`, error);
          throw error;
        }
      };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value: `guardedFacturas_${method}`,
          },
          routeViewKey: {
            value: "facturas",
            enumerable: true,
          },
          routeViewName: {
            value: FACTURAS_VIEW_NAME,
            enumerable: true,
          },
        });
      } catch {}

      cache.set(method, wrapped);

      return wrapped;
    },

    apply(target, thisArg, args) {
      if (!shouldAllowFacturasMethod("render", args)) {
        logBlockedFacturasMethod("render", args);
        return null;
      }

      return Reflect.apply(target, thisArg, args);
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

export const FacturasView = createGuardedFacturasViewBridge(RawFacturasView);

export { FacturasView as View };

export const view = FacturasView;
export const component = FacturasView;
export const page = FacturasView;

export default FacturasView;

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  callAny(
    [
      [RawFacturasView, "init"],
      [RawFacturasView, "mount"],
      [RawFacturasView, "render"],
    ],
    args,
    null,
    { guarded: true }
  );

export const mount = (...args) =>
  callAny(
    [
      [RawFacturasView, "mount"],
      [RawFacturasView, "init"],
      [RawFacturasView, "render"],
    ],
    args,
    null,
    { guarded: true }
  );

export const render = (...args) =>
  callAny(
    [
      [RawFacturasView, "render"],
      [RawFacturasView, "mount"],
      [RawFacturasView, "init"],
    ],
    args,
    null,
    { guarded: true }
  );

export const reload = (...args) =>
  callAny(
    [
      [RawFacturasView, "reload"],
      [RawFacturasView, "refresh"],
      [RawFacturasView, "loadFacturas"],
      [Loaders, "loadFacturasCollection"],
    ],
    args,
    null,
    { guarded: true }
  );

export const refresh = (...args) => reload(...args);
export const bootstrap = (...args) => init(...args);

export const destroy = (...args) =>
  callAny(
    [
      [RawFacturasView, "destroy"],
      [RawFacturasView, "unmount"],
      [RawFacturasView, "dispose"],
    ],
    args,
    true
  );

export const unmount = (...args) =>
  callAny(
    [
      [RawFacturasView, "unmount"],
      [RawFacturasView, "destroy"],
      [RawFacturasView, "dispose"],
    ],
    args,
    true
  );

export const dispose = (...args) => destroy(...args);

/* =========================================================
   ACTION API · VIEW FIRST + FALLBACKS
========================================================= */

export const loadFacturas = (...args) =>
  callAny(
    [
      [RawFacturasView, "loadFacturas"],
      [RawFacturasView, "reload"],
      [Loaders, "loadFacturasCollection"],
    ],
    args,
    null,
    { guarded: true }
  );

export const openFactura = (...args) =>
  callAny(
    [
      [RawFacturasView, "openFactura"],
      [Actions, "openFacturaAction"],
    ],
    args,
    null,
    { guarded: true }
  );

export const openFacturaPdf = (...args) =>
  callAny(
    [
      [RawFacturasView, "openFacturaPdf"],
      [RawFacturasView, "viewFacturaPdf"],
      [Actions, "openFacturaPdfAction"],
    ],
    args,
    false,
    { guarded: true }
  );

export const viewFacturaPdf = (...args) => openFacturaPdf(...args);

export const downloadFacturaPdf = (...args) =>
  callAny(
    [
      [RawFacturasView, "downloadFacturaPdf"],
      [RawFacturasView, "downloadFactura"],
      [Actions, "downloadFacturaPdfAction"],
    ],
    args,
    false,
    { guarded: true }
  );

export const sendFacturaToClient = (...args) =>
  callAny(
    [
      [RawFacturasView, "sendFacturaToClient"],
      [RawFacturasView, "sendFactura"],
      [Actions, "sendFacturaToClientAction"],
    ],
    args,
    false,
    { guarded: true }
  );

export const closeDetail = (...args) =>
  callAny(
    [
      [RawFacturasView, "closeDetail"],
      [RawFacturasView, "closeFacturaDetail"],
      [State, "closeFacturasDetail"],
    ],
    args,
    true
  );

export const exportFacturasCsv = (...args) =>
  callAny(
    [
      [RawFacturasView, "exportFacturasCsv"],
      [Actions, "exportFacturasCsvAction"],
    ],
    args,
    false,
    { guarded: true }
  );

/* =========================================================
   CREATE MODAL API
========================================================= */

export const openFacturasCreateModal = (...args) =>
  callAny(
    [
      [CreateModal, "openFacturasCreateModal"],
      [CreateModal.OnionFacturasCreateModal, "open"],
      [CreateModal.default, "open"],
    ],
    args,
    false
  );

export const closeFacturasCreateModal = (...args) =>
  callAny(
    [
      [CreateModal, "closeFacturasCreateModal"],
      [CreateModal.OnionFacturasCreateModal, "close"],
      [CreateModal.default, "close"],
    ],
    args,
    false
  );

export const updateFacturasCreateModal = (...args) =>
  callAny(
    [
      [CreateModal, "updateFacturasCreateModal"],
      [CreateModal.OnionFacturasCreateModal, "update"],
      [CreateModal.default, "update"],
    ],
    args,
    false
  );

export const OnionFacturasCreateModal =
  CreateModal.OnionFacturasCreateModal ||
  CreateModal.default ||
  null;

/* =========================================================
   INCIDENCIAS BRIDGE API
========================================================= */

export const openFacturaIncidenciaModal = (...args) =>
  callAny(
    [
      [IncidenciasBridge, "openFacturaIncidenciaModal"],
      [IncidenciasBridge.default, "openFacturaIncidenciaModal"],
    ],
    args,
    false,
    { guarded: true }
  );

/* =========================================================
   DATA / DEBUG API
========================================================= */

export const getItems = (...args) =>
  callAny(
    [
      [RawFacturasView, "getItems"],
      [RawFacturasView, "getFacturas"],
      [Store, "getFacturasStore"],
    ],
    args,
    []
  );

export const getFacturasView = () => FacturasView;
export const getRawFacturasView = () => RawFacturasView;

export const canRenderFacturasNow = (...args) =>
  shouldAllowFacturasMethod("render", args);

export const getFacturasRouteDebug = (...args) => {
  const explicitSignals = collectExplicitRouteSignals(args);
  const runtimeSignals = collectRuntimeRouteSignals();
  const signals = [...explicitSignals, ...runtimeSignals];

  return {
    source: FACTURAS_INDEX_SOURCE,
    allowed: shouldAllowFacturasMethod("render", args),
    browserPath: getBrowserPath(),
    browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || "/"),
    appRoute: getAppRoutePath(),
    appPublicPath: getAppPublicPath(),
    explicitSignals,
    runtimeSignals,
    signals,
    blockingSignal: getBlockingSignal(signals),
  };
};

export const isInitialized = () =>
  Boolean(
    RawFacturasView?.initialized ||
      RawFacturasView?.isInitialized ||
      safeCall(RawFacturasView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    RawFacturasView?.destroyed ||
      RawFacturasView?.isDestroyed ||
      safeCall(RawFacturasView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    RawFacturasView?.mounted ||
      RawFacturasView?.isMounted ||
      safeCall(RawFacturasView, "isMounted", [], false)
  );

export const getModuleSnapshot = (...args) => {
  const base = callAny(
    [
      [RawFacturasView, "getSnapshot"],
      [RawFacturasView, "getState"],
    ],
    args,
    null
  );

  return {
    ...(isObject(base) ? base : {}),

    module: FACTURAS_MODULE_NAME,
    viewName: FACTURAS_VIEW_NAME,
    version: FACTURAS_MODULE_VERSION,
    source: FACTURAS_INDEX_SOURCE,

    initialized: isInitialized(),
    destroyed: isDestroyed(),
    mounted: isMounted(),

    items: getItems(),

    browserPath: getBrowserPath(),
    browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || "/"),
    appRoute: getAppRoutePath(),
    appPublicPath: getAppPublicPath(),
    facturasAllowedNow: canRenderFacturasNow(...args),
  };
};

/* =========================================================
   MODEL PUBLIC WRAPPERS
========================================================= */

export const DEFAULT_FACTURAS_SORT = Model.DEFAULT_FACTURAS_SORT;
export const DEFAULT_FACTURA_CURRENCY = Model.DEFAULT_FACTURA_CURRENCY;

export const truncate = moduleMethod(Model, "truncate", "");
export const formatMoney = moduleMethod(Model, "formatMoney", "");
export const formatDate = moduleMethod(Model, "formatDate", "—");
export const formatDateTime = moduleMethod(Model, "formatDateTime", "—");
export const formatRelativeDate = moduleMethod(Model, "formatRelativeDate", "Sin fecha");
export const getInitials = moduleMethod(Model, "getInitials", "ON");

export const normalizeEstadoPago = moduleMethod(Model, "normalizeEstadoPago", "pending");
export const normalizeEstado = moduleMethod(Model, "normalizeEstado", "issued");
export const getEstadoPagoLabel = moduleMethod(Model, "getEstadoPagoLabel", "Pendiente");
export const getEstadoLabel = moduleMethod(Model, "getEstadoLabel", "Emitida");

export const isFacturaDocument = moduleMethod(Model, "isFacturaDocument", true);
export const getFacturaIdentityList = moduleMethod(Model, "getFacturaIdentityList", []);
export const getFacturaPrimaryId = moduleMethod(Model, "getFacturaPrimaryId", "");
export const sameFacturaIdentity = moduleMethod(Model, "sameFacturaIdentity", false);

export const getFacturaNumero = moduleMethod(Model, "getFacturaNumero", "—");
export const getFacturaFecha = moduleMethod(Model, "getFacturaFecha", null);
export const getFacturaUpdatedAt = moduleMethod(Model, "getFacturaUpdatedAt", null);
export const getFacturaClienteObject = moduleMethod(Model, "getFacturaClienteObject", {});
export const getFacturaClienteNombre = moduleMethod(Model, "getFacturaClienteNombre", "Cliente");
export const getFacturaClienteEmpresa = moduleMethod(Model, "getFacturaClienteEmpresa", "-");
export const getFacturaClienteEmail = moduleMethod(Model, "getFacturaClienteEmail", "-");
export const getFacturaPreview = moduleMethod(Model, "getFacturaPreview", "Sin detalle");
export const getFacturaCurrency = moduleMethod(Model, "getFacturaCurrency", "EUR");
export const getFacturaTotal = moduleMethod(Model, "getFacturaTotal", 0);
export const getFacturaBaseImponible = moduleMethod(Model, "getFacturaBaseImponible", 0);
export const getFacturaImpuestosTotal = moduleMethod(Model, "getFacturaImpuestosTotal", 0);
export const getFacturaDescuentoTotal = moduleMethod(Model, "getFacturaDescuentoTotal", 0);
export const getFacturaPaidAmount = moduleMethod(Model, "getFacturaPaidAmount", 0);
export const getFacturaPendingAmount = moduleMethod(Model, "getFacturaPendingAmount", 0);
export const getEffectiveEstadoPago = moduleMethod(Model, "getEffectiveEstadoPago", "pending");

export const isFacturaPaid = moduleMethod(Model, "isFacturaPaid", false);
export const isFacturaPending = moduleMethod(Model, "isFacturaPending", false);
export const isFacturaOverdue = moduleMethod(Model, "isFacturaOverdue", false);

export const getFacturaIncidenciaId = moduleMethod(Model, "getFacturaIncidenciaId", "");
export const hasFacturaIncidencia = moduleMethod(Model, "hasFacturaIncidencia", false);
export const buildFacturaIncidenciaPayload = moduleMethod(Model, "buildFacturaIncidenciaPayload", null);

export const normalizeFactura = moduleMethod(Model, "normalizeFactura", {});
export const extractFacturas = moduleMethod(Model, "extractFacturas", []);
export const extractNormalizedFacturas = moduleMethod(Model, "extractNormalizedFacturas", []);
export const getRemoteCount = moduleMethod(Model, "getRemoteCount", 0);
export const extractStats = moduleMethod(Model, "extractStats", null);

export const sumFacturasTotal = moduleMethod(Model, "sumFacturasTotal", 0);
export const sumFacturasBase = moduleMethod(Model, "sumFacturasBase", 0);
export const countFacturasByEstadoPago = moduleMethod(Model, "countFacturasByEstadoPago", 0);
export const countFacturasByEstado = moduleMethod(Model, "countFacturasByEstado", 0);
export const computeFacturasStats = moduleMethod(Model, "computeFacturasStats", {});
export const sortFacturas = moduleMethod(Model, "sortFacturas", []);
export const filterFacturas = moduleMethod(Model, "filterFacturas", []);

/* =========================================================
   UTILS PUBLIC WRAPPERS
========================================================= */

export const safeString = moduleMethod(Utils, "safeString", "");
export const safeNumber = moduleMethod(Utils, "safeNumber", 0);
export const safeArrayExport = moduleMethod(Utils, "safeArray", []);
export const safeObjectExport = moduleMethod(Utils, "safeObject", {});
export const safeBoolean = moduleMethod(Utils, "safeBoolean", false);
export const escapeHtml = moduleMethod(Utils, "escapeHtml", "");
export const normalizeWhitespace = moduleMethod(Utils, "normalizeWhitespace", "");
export const normalizeKey = moduleMethod(Utils, "normalizeKey", "");
export const normalizeIdentity = moduleMethod(Utils, "normalizeIdentity", "");
export const showToast = moduleMethod(Utils, "showToast", false);
export const safeEmitEvent = moduleMethod(Utils, "safeEmit", false);

/* =========================================================
   STATE PUBLIC WRAPPERS
========================================================= */

export const DEFAULT_PAGE_SIZE = State.DEFAULT_PAGE_SIZE || 5;

export const createFacturasState = moduleMethod(State, "createFacturasState", {});
export const resetFacturasViewState = moduleMethod(State, "resetFacturasViewState");
export const resetFacturasDetailState = moduleMethod(State, "resetFacturasDetailState");
export const resetFacturasInflightState = moduleMethod(State, "resetFacturasInflightState");
export const resetFacturasState = moduleMethod(State, "resetFacturasState");

export const getFacturasViewState = moduleMethod(State, "getFacturasViewState", {});
export const getFacturasDetailState = moduleMethod(State, "getFacturasDetailState", {});
export const getFacturasActionsState = moduleMethod(State, "getFacturasActionsState", {});
export const getFacturasInflightState = moduleMethod(State, "getFacturasInflightState", {});

export const isFacturasHydrated = moduleMethod(State, "isFacturasHydrated", false);
export const isFacturasLoading = moduleMethod(State, "isFacturasLoading", false);
export const isFacturasLoaded = moduleMethod(State, "isFacturasLoaded", false);
export const isFacturasRefreshing = moduleMethod(State, "isFacturasRefreshing", false);
export const isFacturasBootstrapped = moduleMethod(State, "isFacturasBootstrapped", false);

export const getFacturasError = moduleMethod(State, "getFacturasError", null);
export const getFacturasRemoteCount = moduleMethod(State, "getFacturasRemoteCount", 0);
export const getFacturasLastSyncAt = moduleMethod(State, "getFacturasLastSyncAt", "");
export const getFacturasPage = moduleMethod(State, "getFacturasPage", 1);
export const getFacturasPageSize = moduleMethod(State, "getFacturasPageSize", DEFAULT_PAGE_SIZE);

export const isFacturasDetailOpen = moduleMethod(State, "isFacturasDetailOpen", false);
export const isFacturasDetailLoading = moduleMethod(State, "isFacturasDetailLoading", false);
export const getFacturasDetailData = moduleMethod(State, "getFacturasDetailData", null);

export const getFacturasSendingFacturaId = moduleMethod(State, "getFacturasSendingFacturaId", "");
export const getFacturasDownloadingFacturaId = moduleMethod(State, "getFacturasDownloadingFacturaId", "");
export const getFacturasViewingFacturaId = moduleMethod(State, "getFacturasViewingFacturaId", "");
export const getFacturasOpeningFacturaId = moduleMethod(State, "getFacturasOpeningFacturaId", "");
export const getFacturasSelectedFacturaId = moduleMethod(State, "getFacturasSelectedFacturaId", "");

export const getFacturasInflightLoad = moduleMethod(State, "getFacturasInflightLoad", null);
export const getFacturasInflightDetail = moduleMethod(State, "getFacturasInflightDetail", null);
export const getFacturasCollectionToken = moduleMethod(State, "getFacturasCollectionToken", 0);
export const getFacturasDetailToken = moduleMethod(State, "getFacturasDetailToken", 0);
export const getFacturasDetailFacturaId = moduleMethod(State, "getFacturasDetailFacturaId", "");

export const setFacturasHydrated = moduleMethod(State, "setFacturasHydrated");
export const setFacturasLoading = moduleMethod(State, "setFacturasLoading");
export const setFacturasLoaded = moduleMethod(State, "setFacturasLoaded");
export const setFacturasError = moduleMethod(State, "setFacturasError");
export const clearFacturasError = moduleMethod(State, "clearFacturasError");
export const setFacturasRefreshing = moduleMethod(State, "setFacturasRefreshing");
export const setFacturasBootstrapped = moduleMethod(State, "setFacturasBootstrapped");
export const setFacturasRemoteCount = moduleMethod(State, "setFacturasRemoteCount");
export const setFacturasLastSyncAt = moduleMethod(State, "setFacturasLastSyncAt");
export const setFacturasPage = moduleMethod(State, "setFacturasPage");
export const setFacturasPageSize = moduleMethod(State, "setFacturasPageSize");

export const setFacturasDetailOpen = moduleMethod(State, "setFacturasDetailOpen");
export const setFacturasDetailLoading = moduleMethod(State, "setFacturasDetailLoading");
export const setFacturasDetailData = moduleMethod(State, "setFacturasDetailData");
export const openFacturasDetail = moduleMethod(State, "openFacturasDetail");
export const closeFacturasDetail = moduleMethod(State, "closeFacturasDetail");

export const setFacturasSendingFacturaId = moduleMethod(State, "setFacturasSendingFacturaId");
export const setFacturasDownloadingFacturaId = moduleMethod(State, "setFacturasDownloadingFacturaId");
export const setFacturasViewingFacturaId = moduleMethod(State, "setFacturasViewingFacturaId");
export const setFacturasOpeningFacturaId = moduleMethod(State, "setFacturasOpeningFacturaId");
export const setFacturasSelectedFacturaId = moduleMethod(State, "setFacturasSelectedFacturaId");
export const clearFacturasActionIds = moduleMethod(State, "clearFacturasActionIds");

export const setFacturasInflightLoad = moduleMethod(State, "setFacturasInflightLoad");
export const setFacturasInflightDetail = moduleMethod(State, "setFacturasInflightDetail");
export const setFacturasCollectionToken = moduleMethod(State, "setFacturasCollectionToken");
export const setFacturasDetailToken = moduleMethod(State, "setFacturasDetailToken");
export const setFacturasDetailFacturaId = moduleMethod(State, "setFacturasDetailFacturaId");
export const clearFacturasCollectionInflight = moduleMethod(State, "clearFacturasCollectionInflight");
export const clearFacturasDetailInflight = moduleMethod(State, "clearFacturasDetailInflight");

export const patchFacturasViewState = moduleMethod(State, "patchFacturasViewState");
export const patchFacturasDetailState = moduleMethod(State, "patchFacturasDetailState");
export const patchFacturasActionsState = moduleMethod(State, "patchFacturasActionsState");
export const patchFacturasInflightState = moduleMethod(State, "patchFacturasInflightState");

export const getFacturasTemplateState = moduleMethod(State, "getFacturasTemplateState", {});
export const getFacturasStateSnapshot = moduleMethod(State, "getFacturasStateSnapshot", {});

/* =========================================================
   STORE PUBLIC WRAPPERS
========================================================= */

export const getFacturasStore = moduleMethod(Store, "getFacturasStore", []);
export const getSortedFacturasStore = moduleMethod(Store, "getSortedFacturasStore", []);
export const getFacturaByIdStore = moduleMethod(Store, "getFacturaByIdStore", null);
export const getFacturaByIncidenciaIdStore = moduleMethod(Store, "getFacturaByIncidenciaIdStore", null);
export const hasFacturasStore = moduleMethod(Store, "hasFacturasStore", false);
export const countFacturasStore = moduleMethod(Store, "countFacturasStore", 0);

export const setFacturasStore = moduleMethod(Store, "setFacturasStore", false);
export const appendFacturasStore = moduleMethod(Store, "appendFacturasStore", false);
export const upsertFacturaStore = moduleMethod(Store, "upsertFacturaStore", false);
export const removeFacturaByIdStore = moduleMethod(Store, "removeFacturaByIdStore", false);
export const clearFacturasStore = moduleMethod(Store, "clearFacturasStore", false);

export const debugFacturasIncidenciasStore = moduleMethod(Store, "debugFacturasIncidenciasStore", []);

/* =========================================================
   API / LOADERS / ACTIONS PUBLIC WRAPPERS
========================================================= */

export const fetchFacturasRequest = moduleMethod(Api, "fetchFacturasRequest", null);
export const fetchFacturaDetailRequest = moduleMethod(Api, "fetchFacturaDetailRequest", null);
export const fetchFacturaPdfUrlRequest = moduleMethod(Api, "fetchFacturaPdfUrlRequest", null);
export const sendFacturaRequest = moduleMethod(Api, "sendFacturaRequest", null);

export const loadFacturasCollection = moduleMethod(Loaders, "loadFacturasCollection", null);
export const loadFacturaDetailById = moduleMethod(Loaders, "loadFacturaDetailById", null);

export const getFacturaDetailFromStoreAction = moduleMethod(Actions, "getFacturaDetailFromStoreAction", null);
export const getFacturaDetailAction = moduleMethod(Actions, "getFacturaDetailAction", null);
export const openFacturaAction = moduleMethod(Actions, "openFacturaAction", null);
export const refreshFacturaDetailAction = moduleMethod(Actions, "refreshFacturaDetailAction", null);
export const openFacturaPdfAction = moduleMethod(Actions, "openFacturaPdfAction", false);
export const downloadFacturaPdfAction = moduleMethod(Actions, "downloadFacturaPdfAction", false);
export const sendFacturaToClientAction = moduleMethod(Actions, "sendFacturaToClientAction", false);
export const copyFacturaIdAction = moduleMethod(Actions, "copyFacturaIdAction", false);
export const exportFacturasCsvAction = moduleMethod(Actions, "exportFacturasCsvAction", false);

export const bindFacturasView = moduleMethod(Bindings, "bindFacturasView", null);

/* =========================================================
   TEMPLATE PUBLIC WRAPPERS
========================================================= */

export const renderHeader = moduleMethod(Template, "renderHeader", "");
export const renderCards = moduleMethod(Template, "renderCards", "");
export const renderLoadingState = moduleMethod(Template, "renderLoadingState", "");
export const renderErrorState = moduleMethod(Template, "renderErrorState", "");
export const renderFacturasTemplate = moduleMethod(Template, "renderFacturasTemplate", "");

export const renderMiniMeta = moduleMethod(DetailTemplate, "renderMiniMeta", "");
export const renderDetailStat = moduleMethod(DetailTemplate, "renderDetailStat", "");
export const renderSectionCard = moduleMethod(DetailTemplate, "renderSectionCard", "");
export const renderHeaderActions = moduleMethod(DetailTemplate, "renderHeaderActions", "");
export const renderFacturasDetailContent = moduleMethod(DetailTemplate, "renderFacturasDetailContent", "");
export const renderFacturasDetailModal = moduleMethod(DetailTemplate, "renderFacturasDetailModal", "");

/* =========================================================
   PUBLIC MODULE OBJECT
========================================================= */

export const FacturasModule = Object.freeze({
  name: FACTURAS_MODULE_NAME,
  viewName: FACTURAS_VIEW_NAME,
  version: FACTURAS_MODULE_VERSION,
  canonicalPath: FACTURAS_CANONICAL_PATH,
  source: FACTURAS_INDEX_SOURCE,

  View: FacturasView,
  RawView: RawFacturasView,
  FacturasView,

  view,
  component,
  page,

  Model,
  Utils,
  State,
  Store,
  Api,
  Loaders,
  Actions,
  Bindings,
  Template,
  DetailTemplate,
  CreateModal,
  IncidenciasBridge,

  init,
  mount,
  render,
  reload,
  refresh,
  bootstrap,
  destroy,
  unmount,
  dispose,

  loadFacturas,
  openFactura,
  openFacturaPdf,
  viewFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,

  openFacturasCreateModal,
  closeFacturasCreateModal,
  updateFacturasCreateModal,
  OnionFacturasCreateModal,

  openFacturaIncidenciaModal,

  getItems,
  getFacturasView,
  getRawFacturasView,
  getModuleSnapshot,
  canRenderFacturasNow,
  getFacturasRouteDebug,

  isInitialized,
  isDestroyed,
  isMounted,
});

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export function registerGlobalBridge() {
  const root = getGlobalRoot();

  try {
    const previous =
      root.OnionFacturas &&
      typeof root.OnionFacturas === "object"
        ? root.OnionFacturas
        : {};

    root.OnionFacturas = {
      ...previous,
      ...FacturasModule,
    };

    root.OnionFacturasView = FacturasView;
    root.FacturasView = FacturasView;

    if (OnionFacturasCreateModal && !root.OnionFacturasCreateModal) {
      root.OnionFacturasCreateModal = OnionFacturasCreateModal;
    }
  } catch (error) {
    safeWarn("No se pudo registrar bridge global.", error);
  }

  try {
    const appCore = root?.AppCore;

    if (appCore) {
      if (!appCore.modules || typeof appCore.modules !== "object") {
        appCore.modules = {};
      }

      appCore.modules.facturas = FacturasModule;
      appCore.modules.Facturas = FacturasModule;
      appCore.modules.FacturasView = FacturasModule;
      appCore.modules.OnionFacturas = FacturasModule;

      if (typeof appCore.registerModule === "function") {
        appCore.registerModule("facturas", FacturasModule);
      }
    }
  } catch (error) {
    safeWarn("No se pudo registrar bridge en AppCore.modules.", error);
  }

  safeEmit("facturas:index:ready", {
    source: FACTURAS_INDEX_SOURCE,
    hasView: Boolean(FacturasView),
    hasRawView: Boolean(RawFacturasView),
    browserPath: getBrowserPath(),
    browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || "/"),
    appRoute: getAppRoutePath(),
    appPublicPath: getAppPublicPath(),
    allowedNow: canRenderFacturasNow(),
  });

  return FacturasModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge = registerGlobalBridge();
export const ready = true;

/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · ROUTE SAFE · 10/10 EXTREME
   PATCH · ROUTER SAFE · LEGACY SAFE · NAMESPACE EXPORT SAFE
   PATCH · VIEW/ACTIONS/LOADERS FALLBACK CHAIN
   PATCH · PUBLIC API STABLE · GLOBAL BRIDGE SAFE

   RESPONSABILIDADES:
   - punto de entrada único del módulo facturas
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y facturasView.js
   - init / mount / render / reload / destroy seguros
   - exponer modal / helpers públicos
   - evitar duplicidad de lógica en index.js
   - mantener superficie pública estable aunque cambien exports internos

   HARDENING PRO:
   - fallback si cambia nombre del método en FacturasView
   - wrappers seguros contra exports ausentes
   - namespace imports para no romper por named exports inexistentes
   - no lanza errores por métodos ausentes
   - no sobreescribe brutalmente window.OnionFacturas
   - compatible con imports antiguos
   - compatible con router que consume default, named, view o component

   FIX ROUTE SAFE:
   - FacturasView.init/render/mount/reload/refresh solo corren en /facturas
   - acepta /@usuario/facturas como publicPath válido
   - bloquea renders tardíos si la ruta actual ya no es facturas
   - destroy/unmount/dispose siempre permitidos
   - exports de modelo/state/store/api siguen disponibles
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

/* =========================================================
   MODULE META
========================================================= */

export const FACTURAS_MODULE_NAME = "facturas";
export const FACTURAS_VIEW_NAME = "FacturasView";
export const FACTURAS_MODULE_VERSION = "11.0.0";
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
};

/* =========================================================
   LOCAL FALLBACK HELPERS
========================================================= */

function localSafeText(value, fallback = "") {
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

function localSafeNumber(value, fallback = 0) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function localSafeArray(value, fallback = []) {
  return Array.isArray(value)
    ? value
    : fallback;
}

function localSafeObject(value, fallback = {}) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : fallback;
}

function localSafeBoolean(value, fallback = false) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function localFirst(...values) {
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

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function localNormalizeWhitespace(value = "") {
  return localSafeText(value, "")
    .replace(/\s+/g, " ")
    .trim();
}

function localEscapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localTruncate(value = "", max = 140) {
  const text =
    localSafeText(value, "");

  const limit =
    Number(max);

  if (!text) {
    return "";
  }

  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    return text;
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit).trim()}…`;
}

/* =========================================================
   INTERNAL SAFE HELPERS
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

function internalSafeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
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
      "[FacturasIndex]",
      ...args
    );
  } catch {}

  try {
    if (
      typeof console !== "undefined" &&
      typeof console.warn === "function"
    ) {
      console.warn(
        "[FacturasIndex]",
        ...args
      );
    }
  } catch {}
}

function safeEmit(event = "", payload = {}) {
  const eventName =
    localSafeText(event, "");

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
  "sendFacturaToClient",
  "closeDetail",
  "exportFacturasCsv",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",
  "getItems",
  "getFacturas",
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
    localSafeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    localSafeText(value, "");

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
    localSafeText(value, "/");

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
    localSafeText(path, "/");

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
    localSafeText(segment, "")
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

function isFacturasPath(path = "") {
  return (
    getCleanCanonicalPath(path || "/") ===
    FACTURAS_CANONICAL_PATH
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
    return localSafeText(
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
    return localSafeText(
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
    localSafeText(value, "");

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
    isFacturas:
      isFacturasPath(text),
  });
}

function pushViewSignal(signals, label, value) {
  const text =
    localSafeText(value, "");

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
    isFacturas:
      normalized === "facturas" ||
      normalized === "facturasview" ||
      normalized === "facturas-view",
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
    signals.find((signal) => signal.isFacturas === false) ||
    null
  );
}

function hasPositiveFacturasSignal(signals = []) {
  return signals.some((signal) => signal.isFacturas === true);
}

function shouldAllowFacturasMethod(method = "", args = []) {
  const cleanMethod =
    localSafeText(method, "");

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

  if (hasPositiveFacturasSignal(signals)) {
    return true;
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return isFacturasPath(browserPath);
  }

  return true;
}

function logBlockedFacturasMethod(method = "", args = []) {
  const signals =
    collectRouteSignals(args);

  safeWarn(
    `FacturasView.${method} bloqueado: ruta actual no es Facturas.`,
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

    case "downloadFacturaPdf":
    case "sendFacturaToClient":
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
      `Error calling ${method}`,
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
    !shouldAllowFacturasMethod(
      method,
      callArgs
    )
  ) {
    logBlockedFacturasMethod(
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
    internalSafeObject(options);

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

function moduleMethod(moduleRef, method, fallback = undefined) {
  return (...args) =>
    safeCall(
      moduleRef,
      method,
      args,
      fallback
    );
}

/* =========================================================
   GUARDED VIEW BRIDGE
========================================================= */

function createGuardedFacturasViewBridge(view) {
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
        return FACTURAS_INDEX_SOURCE;
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
        function guardedFacturasViewMethod(...args) {
          if (
            !shouldAllowFacturasMethod(
              method,
              args
            )
          ) {
            logBlockedFacturasMethod(
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
              `FacturasView.${method} falló.`,
              error
            );

            throw error;
          }
        };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value:
              `guardedFacturas_${method}`,
          },

          routeViewKey: {
            value:
              "facturas",
            enumerable:
              true,
          },

          routeViewName: {
            value:
              FACTURAS_VIEW_NAME,
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
        !shouldAllowFacturasMethod(
          "render",
          args
        )
      ) {
        logBlockedFacturasMethod(
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

export const FacturasView =
  createGuardedFacturasViewBridge(
    RawFacturasView
  );

/* =========================================================
   CORE EXPORTS
========================================================= */

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

export const refresh = (...args) =>
  reload(...args);

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

export const dispose = destroy;
export const bootstrap = init;

/* =========================================================
   ACTIONS API · VIEW FIRST + ACTION FALLBACK
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

export const viewFacturaPdf = openFacturaPdf;

export const downloadFacturaPdf = (...args) =>
  callAny(
    [
      [RawFacturasView, "downloadFacturaPdf"],
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
   DATA API
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

export const getFacturasView = () =>
  FacturasView;

export const getRawFacturasView = () =>
  RawFacturasView;

export const canRenderFacturasNow = (...args) =>
  shouldAllowFacturasMethod(
    "render",
    args
  );

export const getFacturasRouteDebug = (...args) => {
  const signals =
    collectRouteSignals(args);

  return {
    source:
      FACTURAS_INDEX_SOURCE,

    allowed:
      shouldAllowFacturasMethod(
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

export const getModuleSnapshot = (...args) => {
  const base =
    callAny(
      [
        [RawFacturasView, "getSnapshot"],
        [RawFacturasView, "getState"],
      ],
      args,
      null
    );

  return {
    ...(isObject(base) ? base : {}),

    module:
      FACTURAS_MODULE_NAME,

    viewName:
      FACTURAS_VIEW_NAME,

    version:
      FACTURAS_MODULE_VERSION,

    source:
      FACTURAS_INDEX_SOURCE,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    mounted:
      isMounted(),

    items:
      getItems(),

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

    facturasAllowedNow:
      canRenderFacturasNow(...args),
  };
};

/* =========================================================
   MODEL PÚBLICO
========================================================= */

export const truncate = (...args) =>
  callAny([[Model, "truncate"]], args, localTruncate(...args));

export const formatMoney = (...args) =>
  callAny([[Model, "formatMoney"]], args, undefined);

export const formatDate = (...args) =>
  callAny([[Model, "formatDate"]], args, undefined);

export const formatDateTime = (...args) =>
  callAny([[Model, "formatDateTime"]], args, undefined);

export const formatRelativeDate = (...args) =>
  callAny([[Model, "formatRelativeDate"]], args, undefined);

export const getInitials = (...args) =>
  callAny([[Model, "getInitials"]], args, undefined);

export const normalizeEstadoPago = (...args) =>
  callAny([[Model, "normalizeEstadoPago"]], args, undefined);

export const normalizeEstado = (...args) =>
  callAny([[Model, "normalizeEstado"]], args, undefined);

export const getEstadoPagoLabel = (...args) =>
  callAny([[Model, "getEstadoPagoLabel"]], args, undefined);

export const getEstadoLabel = (...args) =>
  callAny([[Model, "getEstadoLabel"]], args, undefined);

export const getEstadoPagoChipStyle = (...args) =>
  callAny([[Model, "getEstadoPagoChipStyle"]], args, undefined);

export const getEstadoChipStyle = (...args) =>
  callAny([[Model, "getEstadoChipStyle"]], args, undefined);

export const getFacturaNumero = (...args) =>
  callAny([[Model, "getFacturaNumero"]], args, undefined);

export const getFacturaFecha = (...args) =>
  callAny([[Model, "getFacturaFecha"]], args, undefined);

export const getFacturaUpdatedAt = (...args) =>
  callAny([[Model, "getFacturaUpdatedAt"]], args, undefined);

export const getFacturaClienteNombre = (...args) =>
  callAny([[Model, "getFacturaClienteNombre"]], args, undefined);

export const getFacturaClienteEmpresa = (...args) =>
  callAny([[Model, "getFacturaClienteEmpresa"]], args, undefined);

export const getFacturaClienteEmail = (...args) =>
  callAny([[Model, "getFacturaClienteEmail"]], args, undefined);

export const getFacturaPreview = (...args) =>
  callAny([[Model, "getFacturaPreview"]], args, undefined);

export const getFacturaCurrency = (...args) =>
  callAny([[Model, "getFacturaCurrency"]], args, undefined);

export const getFacturaTotal = (...args) =>
  callAny([[Model, "getFacturaTotal"]], args, undefined);

export const getFacturaBaseImponible = (...args) =>
  callAny([[Model, "getFacturaBaseImponible"]], args, undefined);

export const getFacturaImpuestosTotal = (...args) =>
  callAny([[Model, "getFacturaImpuestosTotal"]], args, undefined);

export const getFacturaDescuentoTotal = (...args) =>
  callAny([[Model, "getFacturaDescuentoTotal"]], args, undefined);

export const isFacturaPaid = (...args) =>
  callAny([[Model, "isFacturaPaid"]], args, false);

export const isFacturaPending = (...args) =>
  callAny([[Model, "isFacturaPending"]], args, false);

export const isFacturaOverdue = (...args) =>
  callAny([[Model, "isFacturaOverdue"]], args, false);

export const normalizeFactura = (...args) =>
  callAny([[Model, "normalizeFactura"]], args, undefined);

export const extractFacturas = (...args) =>
  callAny([[Model, "extractFacturas"]], args, []);

export const extractNormalizedFacturas = (...args) =>
  callAny([[Model, "extractNormalizedFacturas"]], args, []);

export const getRemoteCount = (...args) =>
  callAny([[Model, "getRemoteCount"]], args, 0);

export const extractStats = (...args) =>
  callAny([[Model, "extractStats"]], args, undefined);

export const sumFacturasTotal = (...args) =>
  callAny([[Model, "sumFacturasTotal"]], args, 0);

export const sumFacturasBase = (...args) =>
  callAny([[Model, "sumFacturasBase"]], args, 0);

export const countFacturasByEstadoPago = (...args) =>
  callAny([[Model, "countFacturasByEstadoPago"]], args, 0);

export const countFacturasByEstado = (...args) =>
  callAny([[Model, "countFacturasByEstado"]], args, 0);

export const sortFacturas = (...args) =>
  callAny([[Model, "sortFacturas"]], args, localSafeArray(args[0], []));

export const filterFacturas = (...args) =>
  callAny([[Model, "filterFacturas"]], args, localSafeArray(args[0], []));

/* =========================================================
   UTILS REUTILIZABLES
========================================================= */

export const safeText = (...args) =>
  callAny([[Utils, "safeText"]], args, localSafeText(...args));

export const safeNumber = (...args) =>
  callAny([[Utils, "safeNumber"]], args, localSafeNumber(...args));

export const safeArray = (...args) =>
  callAny([[Utils, "safeArray"]], args, localSafeArray(...args));

export const safeObject = (...args) =>
  callAny([[Utils, "safeObject"]], args, localSafeObject(...args));

export const safeBoolean = (...args) =>
  callAny([[Utils, "safeBoolean"]], args, localSafeBoolean(...args));

export const first = (...args) =>
  callAny([[Utils, "first"]], args, localFirst(...args));

export const normalizeWhitespace = (...args) =>
  callAny([[Utils, "normalizeWhitespace"]], args, localNormalizeWhitespace(...args));

export const escapeHtml = (...args) =>
  callAny([[Utils, "escapeHtml"]], args, localEscapeHtml(...args));

export const truncateText = (...args) =>
  callAny([[Utils, "truncate"]], args, localTruncate(...args));

export const showToast = (...args) =>
  callAny([[Utils, "showToast"]], args, false);

/* =========================================================
   STATE
========================================================= */

export const createFacturasState = moduleMethod(State, "createFacturasState");
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
export const getFacturasLastSyncAt = moduleMethod(State, "getFacturasLastSyncAt", null);
export const getFacturasPage = moduleMethod(State, "getFacturasPage", 1);
export const getFacturasPageSize = moduleMethod(State, "getFacturasPageSize", 5);

export const isFacturasDetailOpen = moduleMethod(State, "isFacturasDetailOpen", false);
export const isFacturasDetailLoading = moduleMethod(State, "isFacturasDetailLoading", false);
export const getFacturasDetailData = moduleMethod(State, "getFacturasDetailData", null);

export const getFacturasSendingFacturaId = moduleMethod(State, "getFacturasSendingFacturaId", "");
export const getFacturasDownloadingFacturaId = moduleMethod(State, "getFacturasDownloadingFacturaId", "");
export const getFacturasViewingFacturaId = moduleMethod(State, "getFacturasViewingFacturaId", "");
export const getFacturasOpeningFacturaId = moduleMethod(State, "getFacturasOpeningFacturaId", "");

export const getFacturasInflightLoad = moduleMethod(State, "getFacturasInflightLoad", null);
export const getFacturasInflightDetail = moduleMethod(State, "getFacturasInflightDetail", null);

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
export const clearFacturasActionIds = moduleMethod(State, "clearFacturasActionIds");

export const setFacturasInflightLoad = moduleMethod(State, "setFacturasInflightLoad");
export const setFacturasInflightDetail = moduleMethod(State, "setFacturasInflightDetail");

export const patchFacturasViewState = moduleMethod(State, "patchFacturasViewState");
export const patchFacturasDetailState = moduleMethod(State, "patchFacturasDetailState");

export const getFacturasTemplateState = moduleMethod(State, "getFacturasTemplateState", {});
export const getFacturasStateSnapshot = moduleMethod(State, "getFacturasStateSnapshot", {});

/* =========================================================
   STORE
========================================================= */

export const getFacturasStore = moduleMethod(Store, "getFacturasStore", []);
export const getSortedFacturasStore = moduleMethod(Store, "getSortedFacturasStore", []);
export const getFacturaByIdStore = moduleMethod(Store, "getFacturaByIdStore", null);
export const hasFacturasStore = moduleMethod(Store, "hasFacturasStore", false);
export const countFacturasStore = moduleMethod(Store, "countFacturasStore", 0);
export const setFacturasStore = moduleMethod(Store, "setFacturasStore");
export const appendFacturasStore = moduleMethod(Store, "appendFacturasStore");
export const upsertFacturaStore = moduleMethod(Store, "upsertFacturaStore");
export const removeFacturaByIdStore = moduleMethod(Store, "removeFacturaByIdStore");
export const clearFacturasStore = moduleMethod(Store, "clearFacturasStore");

/* =========================================================
   API
========================================================= */

export const fetchFacturasRequest = moduleMethod(Api, "fetchFacturasRequest");
export const fetchFacturaDetailRequest = moduleMethod(Api, "fetchFacturaDetailRequest");
export const fetchFacturaPdfUrlRequest = moduleMethod(Api, "fetchFacturaPdfUrlRequest");
export const sendFacturaRequest = moduleMethod(Api, "sendFacturaRequest");

/* =========================================================
   LOADERS
========================================================= */

export const loadFacturasCollection = moduleMethod(Loaders, "loadFacturasCollection");
export const loadFacturaDetailById = moduleMethod(Loaders, "loadFacturaDetailById");

/* =========================================================
   ACTIONS
========================================================= */

export const getFacturaDetailFromStoreAction = moduleMethod(Actions, "getFacturaDetailFromStoreAction");
export const getFacturaDetailAction = moduleMethod(Actions, "getFacturaDetailAction");
export const openFacturaAction = moduleMethod(Actions, "openFacturaAction");
export const refreshFacturaDetailAction = moduleMethod(Actions, "refreshFacturaDetailAction");
export const openFacturaPdfAction = moduleMethod(Actions, "openFacturaPdfAction");
export const downloadFacturaPdfAction = moduleMethod(Actions, "downloadFacturaPdfAction");
export const sendFacturaToClientAction = moduleMethod(Actions, "sendFacturaToClientAction");
export const copyFacturaIdAction = moduleMethod(Actions, "copyFacturaIdAction");
export const exportFacturasCsvAction = moduleMethod(Actions, "exportFacturasCsvAction");

export const getFacturaIdAction = moduleMethod(Actions, "getFacturaIdAction");
export const getFacturaNumberAction = moduleMethod(Actions, "getFacturaNumberAction");
export const getFacturaClientAction = moduleMethod(Actions, "getFacturaClientAction");
export const getFacturaEmailAction = moduleMethod(Actions, "getFacturaEmailAction");
export const getFacturaDateAction = moduleMethod(Actions, "getFacturaDateAction");
export const getFacturaEstadoPagoAction = moduleMethod(Actions, "getFacturaEstadoPagoAction");
export const getFacturaEstadoAction = moduleMethod(Actions, "getFacturaEstadoAction");
export const getFacturaFormaPagoAction = moduleMethod(Actions, "getFacturaFormaPagoAction");
export const getFacturaMonedaAction = moduleMethod(Actions, "getFacturaMonedaAction");
export const getFacturaTotalAction = moduleMethod(Actions, "getFacturaTotalAction");
export const normalizeFacturaDetailAction = moduleMethod(Actions, "normalizeFacturaDetailAction");

/* =========================================================
   BINDINGS
========================================================= */

export const bindFacturasView = moduleMethod(Bindings, "bindFacturasView");

/* =========================================================
   TEMPLATES
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
   FLAGS
========================================================= */

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

/* =========================================================
   PUBLIC API OBJECT
========================================================= */

export const FacturasModule = Object.freeze({
  name:
    FACTURAS_MODULE_NAME,

  viewName:
    FACTURAS_VIEW_NAME,

  version:
    FACTURAS_MODULE_VERSION,

  source:
    FACTURAS_INDEX_SOURCE,

  View:
    FacturasView,

  RawView:
    RawFacturasView,

  FacturasView,

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

  loadFacturas,
  openFactura,
  openFacturaPdf,
  viewFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,

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
   LEGACY GLOBAL BRIDGE
========================================================= */

export function registerGlobalBridge() {
  const root =
    getGlobalRoot();

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

    root.OnionFacturasView =
      root.OnionFacturasView &&
      typeof root.OnionFacturasView === "object"
        ? {
            ...root.OnionFacturasView,
            ...FacturasModule,
            view:
              FacturasView,
          }
        : FacturasView;

    root.FacturasView =
      root.FacturasView &&
      typeof root.FacturasView === "object"
        ? {
            ...root.FacturasView,
            ...FacturasModule,
            view:
              FacturasView,
          }
        : FacturasView;
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

      appCore.modules.Facturas =
        FacturasModule;

      appCore.modules.FacturasView =
        FacturasModule;

      appCore.modules.OnionFacturas =
        FacturasModule;
    }
  } catch (error) {
    safeWarn(
      "No se pudo registrar bridge en AppCore.modules.",
      error
    );
  }

  safeEmit(
    "facturas:index:ready",
    {
      source:
        FACTURAS_INDEX_SOURCE,

      hasView:
        Boolean(FacturasView),

      hasRawView:
        Boolean(RawFacturasView),

      browserPath:
        getBrowserPath(),

      browserCanonicalPath:
        getCleanCanonicalPath(
          getBrowserPath() || "/"
        ),

      allowedNow:
        canRenderFacturasNow(),
    }
  );

  return FacturasModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge =
  registerGlobalBridge();

export const ready =
  true;

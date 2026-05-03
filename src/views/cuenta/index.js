/* =========================================================
   Onion SPA - Cuenta View
   Archivo: src/views/cuenta/index.js

   EXTREME PRO SYSTEM · ENTRYPOINT REAL · CUENTA · ROUTE SAFE · 13/10
   ROUTER SAFE · LEGACY SAFE · NAMESPACE EXPORT SAFE
   VIEW/ACTIONS/LOADERS FALLBACK CHAIN
   PUBLIC API STABLE · GLOBAL BRIDGE SAFE
   ACCOUNT SETTINGS / THEME / LANGUAGE / PASSWORD SAFE

   RESPONSABILIDADES:
   - punto de entrada único del módulo cuenta
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y cuentaView.js
   - init / mount / render / reload / destroy seguros
   - exponer save / theme / language / password / modal / helpers públicos
   - evitar duplicidad de lógica en index.js
   - mantener superficie pública estable aunque cambien exports internos
   - registrar bridge global estable window.OnionCuenta / window.CuentaView
   - registrar AppCore.modules.Cuenta si AppCore está disponible

   HARDENING EXTREME:
   - route guard por evaluación ponderada, no por primer falso
   - prioridad a señales explícitas del router
   - soporta /cuenta y /@usuario/cuenta
   - soporta hash router #/cuenta y #!/cuenta
   - no bloquea por rutas antiguas de AppCore si browser/publicPath es cuenta
   - destroy/unmount/dispose/close siempre permitidos
   - getters/snapshot/debug siempre disponibles
   - flags booleanos corregidos: no confunde función con valor
   - bridge global estable sin romper imports antiguos
========================================================= */

import RawCuentaView from "./cuentaView.js";

/* =========================================================
   MODULE META
========================================================= */

export const CUENTA_MODULE_NAME = "cuenta";
export const CUENTA_VIEW_NAME = "CuentaView";
export const CUENTA_MODULE_VERSION = "13.0.0";
export const CUENTA_CANONICAL_PATH = "/cuenta";
export const CUENTA_INDEX_SOURCE = "views:cuenta:index";

/* =========================================================
   LOCAL SAFE HELPERS
========================================================= */

function localSafeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function localSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function localSafeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function localSafeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function localSafeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

  const normalized = localSafeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["true", "1", "yes", "y", "si", "sí", "on", "enabled", "activo"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "off", "disabled", "inactivo"].includes(normalized)) {
    return false;
  }

  return Boolean(fallback);
}

function localFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function localNormalizeWhitespace(value = "") {
  return localSafeText(value, "").replace(/\s+/g, " ").trim();
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
  const text = localSafeText(value, "");
  const limit = localSafeNumber(max, 140);

  if (!text) return "";
  if (limit <= 0) return text;
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
}

/* =========================================================
   INTERNAL HELPERS
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

function internalSafeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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

function getWindowAppCore() {
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

function safeWarn(...args) {
  try {
    getWindowAppCore()?.utils?.warn?.("[CuentaIndex]", ...args);
  } catch {}

  try {
    console.warn("[CuentaIndex]", ...args);
  } catch {}
}

function safeEmit(event = "", payload = {}) {
  const eventName = localSafeText(event, "");
  if (!eventName) return false;

  const root = getGlobalRoot();
  let emitted = false;

  try {
    if (isFn(root?.AppCore?.events?.emit)) {
      root.AppCore.events.emit(eventName, payload);
      emitted = true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   ROUTE GUARD CONFIG
========================================================= */

const GUARDED_VIEW_METHODS = new Set([
  "init",
  "mount",
  "render",
  "reload",
  "refresh",
  "bootstrap",

  "loadCuenta",
  "refreshCuenta",

  "save",
  "saveCuenta",
  "saveProfile",
  "savePerfil",
  "updateProfile",
  "updatePerfil",
  "updateCuenta",

  "updateTheme",
  "updateCuentaTheme",
  "setTheme",
  "setCuentaTheme",

  "updateLanguage",
  "updateCuentaLanguage",
  "setLanguage",
  "setCuentaLanguage",

  "changePassword",
  "updatePassword",
  "savePassword",

  "openModal",
  "openCuentaModal",
]);

const ALWAYS_ALLOWED_VIEW_METHODS = new Set([
  "destroy",
  "unmount",
  "dispose",

  "closeModal",
  "closeCuentaModal",
  "close",

  "getItem",
  "getCuenta",
  "getUser",
  "getProfile",
  "getPerfil",

  "getState",
  "getSnapshot",
  "getCuentaSnapshot",
  "getModuleSnapshot",

  "getRouteDebug",
  "getCuentaRouteDebug",

  "isInitialized",
  "isDestroyed",
  "isMounted",
]);

/* =========================================================
   PATH NORMALIZATION
========================================================= */

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
  const raw = localSafeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = localSafeText(value, "");

  if (!raw) return "/";

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function splitPath(value = "/") {
  const raw = localSafeText(value, "/");

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
  const raw = localSafeText(path, "/");

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
  return normalizeFullPath(path).split("?")[0].split("#")[0] || "/";
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(localSafeText(segment, ""));
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

function isCuentaPath(path = "") {
  return getCleanCanonicalPath(path || "/") === CUENTA_CANONICAL_PATH;
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

function getAppStatePath() {
  const AppCore = getWindowAppCore();

  try {
    return localSafeText(
      localFirst(
        AppCore?.state?.canonicalPath,
        AppCore?.state?.route,
        AppCore?.state?.path,
        ""
      ),
      ""
    );
  } catch {
    return "";
  }
}

function getAppPublicPath() {
  const AppCore = getWindowAppCore();

  try {
    return localSafeText(AppCore?.state?.publicPath || "", "");
  } catch {
    return "";
  }
}

/* =========================================================
   ROUTE SIGNALS
========================================================= */

function pushPathSignal(signals, label, value, origin = "explicit") {
  const text = localSafeText(value, "");
  if (!text) return;

  signals.push({
    type: "path",
    origin,
    label,
    value: text,
    canonical: getCleanCanonicalPath(text),
    isCuenta: isCuentaPath(text),
  });
}

function pushViewSignal(signals, label, value, origin = "explicit") {
  const text = localSafeText(value, "");
  if (!text) return;

  const normalized = text
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .trim();

  signals.push({
    type: "view",
    origin,
    label,
    value: normalized,
    canonical: normalized,
    isCuenta:
      normalized === "cuenta" ||
      normalized === "cuentaview" ||
      normalized === "cuenta-view" ||
      normalized === "account" ||
      normalized === "accountview" ||
      normalized === "account-view",
  });
}

function collectRouteSignalsFromObject(signals, value, label = "arg", origin = "explicit", depth = 0) {
  if (!isObject(value) || isNodeLike(value) || depth > 2) return;

  pushViewSignal(signals, `${label}.viewKey`, value.viewKey, origin);
  pushViewSignal(signals, `${label}.route.viewKey`, value.route?.viewKey, origin);

  pushViewSignal(signals, `${label}.viewName`, value.viewName, origin);
  pushViewSignal(signals, `${label}.route.viewName`, value.route?.viewName, origin);

  pushViewSignal(signals, `${label}.name`, value.name, origin);
  pushViewSignal(signals, `${label}.route.name`, value.route?.name, origin);

  pushPathSignal(signals, `${label}.canonicalPath`, value.canonicalPath, origin);
  pushPathSignal(signals, `${label}.routePath`, value.routePath, origin);
  pushPathSignal(signals, `${label}.route.path`, value.route?.path, origin);
  pushPathSignal(signals, `${label}.publicPath`, value.publicPath, origin);
  pushPathSignal(signals, `${label}.requestedPath`, value.requestedPath, origin);
  pushPathSignal(signals, `${label}.path`, value.path, origin);
  pushPathSignal(signals, `${label}.href`, value.href, origin);
  pushPathSignal(signals, `${label}.url`, value.url, origin);

  collectRouteSignalsFromObject(signals, value.options, `${label}.options`, origin, depth + 1);
  collectRouteSignalsFromObject(signals, value.payload, `${label}.payload`, origin, depth + 1);
  collectRouteSignalsFromObject(signals, value.detail, `${label}.detail`, origin, depth + 1);
  collectRouteSignalsFromObject(signals, value.route, `${label}.route`, origin, depth + 1);
}

function collectRouteSignals(args = []) {
  const signals = [];
  const list = Array.isArray(args) ? args : [];

  list.forEach((arg, index) => {
    collectRouteSignalsFromObject(signals, arg, `args[${index}]`, "explicit");
  });

  pushPathSignal(signals, "AppCore.state.route", getAppStatePath(), "ambient");
  pushPathSignal(signals, "AppCore.state.publicPath", getAppPublicPath(), "ambient");
  pushPathSignal(signals, "window.location", getBrowserPath(), "ambient");

  return signals;
}

function getExplicitSignals(signals = []) {
  return signals.filter((signal) => signal.origin === "explicit");
}

function getAmbientSignals(signals = []) {
  return signals.filter((signal) => signal.origin === "ambient");
}

function getBlockingSignal(signals = []) {
  const explicit = getExplicitSignals(signals);
  const ambient = getAmbientSignals(signals);

  const explicitPositive = explicit.find((signal) => signal.isCuenta === true);
  if (explicitPositive) return null;

  const explicitNegative = explicit.find((signal) => signal.isCuenta === false);
  if (explicitNegative) return explicitNegative;

  const ambientPositive = ambient.find((signal) => signal.isCuenta === true);
  if (ambientPositive) return null;

  if (ambient.length > 0) {
    return ambient.find((signal) => signal.isCuenta === false) || null;
  }

  return null;
}

function hasPositiveCuentaSignal(signals = []) {
  return signals.some((signal) => signal.isCuenta === true);
}

function evaluateCuentaRoute(args = []) {
  const signals = collectRouteSignals(args);
  const explicit = getExplicitSignals(signals);
  const ambient = getAmbientSignals(signals);

  const explicitPositive = explicit.find((signal) => signal.isCuenta === true);
  const explicitNegative = explicit.find((signal) => signal.isCuenta === false);

  if (explicitPositive) {
    return {
      allowed: true,
      reason: "explicit-positive",
      signals,
      blockingSignal: null,
      positiveSignal: explicitPositive,
    };
  }

  if (explicitNegative) {
    return {
      allowed: false,
      reason: "explicit-negative",
      signals,
      blockingSignal: explicitNegative,
      positiveSignal: null,
    };
  }

  const ambientPositive = ambient.find((signal) => signal.isCuenta === true);

  if (ambientPositive) {
    return {
      allowed: true,
      reason: "ambient-positive",
      signals,
      blockingSignal: null,
      positiveSignal: ambientPositive,
    };
  }

  if (ambient.length > 0) {
    const blockingSignal = ambient.find((signal) => signal.isCuenta === false) || null;

    return {
      allowed: false,
      reason: "ambient-negative",
      signals,
      blockingSignal,
      positiveSignal: null,
    };
  }

  return {
    allowed: true,
    reason: "no-route-signal",
    signals,
    blockingSignal: null,
    positiveSignal: null,
  };
}

function shouldAllowCuentaMethod(method = "", args = []) {
  const cleanMethod = localSafeText(method, "");

  if (!cleanMethod) return true;

  if (ALWAYS_ALLOWED_VIEW_METHODS.has(cleanMethod)) {
    return true;
  }

  if (!GUARDED_VIEW_METHODS.has(cleanMethod)) {
    return true;
  }

  return evaluateCuentaRoute(args).allowed;
}

function logBlockedCuentaMethod(method = "", args = []) {
  const evaluation = evaluateCuentaRoute(args);

  safeWarn(`CuentaView.${method} bloqueado: ruta actual no es Cuenta.`, {
    method,
    reason: evaluation.reason,
    browserPath: getBrowserPath(),
    browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || "/"),
    appRoute: getAppStatePath(),
    appPublicPath: getAppPublicPath(),
    signals: evaluation.signals,
    blockingSignal: evaluation.blockingSignal,
  });
}

function getDefaultFallback(method = "") {
  switch (method) {
    case "init":
    case "mount":
    case "bootstrap":
    case "reload":
    case "refresh":
    case "loadCuenta":
      return CuentaView;

    case "render":
      return null;

    case "destroy":
    case "unmount":
    case "dispose":
    case "closeModal":
    case "closeCuentaModal":
    case "close":
      return true;

    case "saveCuenta":
    case "save":
    case "saveProfile":
    case "savePerfil":
    case "updateProfile":
    case "updatePerfil":
    case "updateCuenta":
    case "updateTheme":
    case "updateCuentaTheme":
    case "setTheme":
    case "setCuentaTheme":
    case "updateLanguage":
    case "updateCuentaLanguage":
    case "setLanguage":
    case "setCuentaLanguage":
    case "refreshCuenta":
    case "changePassword":
    case "updatePassword":
    case "savePassword":
    case "openModal":
    case "openCuentaModal":
      return false;

    case "getItem":
    case "getCuenta":
    case "getUser":
    case "getProfile":
    case "getPerfil":
    case "getState":
    case "getSnapshot":
    case "getCuentaSnapshot":
    case "getModuleSnapshot":
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
    const fn = target?.[method];

    if (typeof fn === "function") {
      return fn.apply(target, Array.isArray(args) ? args : []);
    }
  } catch (error) {
    safeWarn(`Error calling ${method}`, error);
  }

  return fallback;
}

function guardedCall(target, method, args = [], fallback = undefined) {
  const callArgs = Array.isArray(args) ? args : [];

  if (!shouldAllowCuentaMethod(method, callArgs)) {
    logBlockedCuentaMethod(method, callArgs);

    return fallback !== undefined ? fallback : getDefaultFallback(method);
  }

  return safeCall(target, method, callArgs, fallback);
}

function callAny(candidates = [], args = [], fallback = undefined, options = {}) {
  const opts = internalSafeObject(options);

  for (const candidate of candidates) {
    const target = candidate?.[0];
    const method = candidate?.[1];

    if (!target || !method) continue;

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
    return Promise.resolve(callAny(candidates, args, fallback, options));
  } catch (error) {
    safeWarn("asyncCallAny falló.", error);
    return Promise.resolve(fallback);
  }
}

/* =========================================================
   GUARDED VIEW BRIDGE
========================================================= */

function createGuardedCuentaViewBridge(view) {
  const source = view || {};
  const cache = new Map();

  if (typeof Proxy !== "function" || !isProxyable(source)) {
    return source;
  }

  return new Proxy(source, {
    get(target, prop, receiver) {
      if (prop === "__raw") return target;
      if (prop === "__source") return CUENTA_INDEX_SOURCE;
      if (prop === "__module") return CUENTA_MODULE_NAME;

      const value = Reflect.get(target, prop, receiver);

      if (!isFn(value)) {
        return value;
      }

      const method = String(prop);

      if (cache.has(method)) {
        return cache.get(method);
      }

      const wrapped = function guardedCuentaViewMethod(...args) {
        if (!shouldAllowCuentaMethod(method, args)) {
          logBlockedCuentaMethod(method, args);
          return getDefaultFallback(method);
        }

        try {
          return value.apply(target, args);
        } catch (error) {
          safeWarn(`CuentaView.${method} falló.`, error);
          throw error;
        }
      };

      try {
        Object.defineProperties(wrapped, {
          name: {
            value: `guardedCuenta_${method}`,
          },
          routeViewKey: {
            value: "cuenta",
            enumerable: true,
          },
          routeViewName: {
            value: CUENTA_VIEW_NAME,
            enumerable: true,
          },
        });
      } catch {}

      cache.set(method, wrapped);

      return wrapped;
    },

    apply(target, thisArg, args) {
      if (!shouldAllowCuentaMethod("render", args)) {
        logBlockedCuentaMethod("render", args);
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

export const CuentaView = createGuardedCuentaViewBridge(RawCuentaView);

/* =========================================================
   CORE EXPORTS
========================================================= */

export { CuentaView as View };

export const view = CuentaView;
export const component = CuentaView;
export const page = CuentaView;

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
  asyncCallAny(
    [
      [RawCuentaView, "mount"],
      [RawCuentaView, "init"],
      [RawCuentaView, "render"],
    ],
    args,
    CuentaView,
    { guarded: true }
  );

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
      [RawCuentaView, "load"],
    ],
    args,
    CuentaView,
    { guarded: true }
  );

export const refresh = (...args) =>
  reload(...args);

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
  callAny(
    [
      [RawCuentaView, "unmount"],
      [RawCuentaView, "destroy"],
      [RawCuentaView, "dispose"],
    ],
    args,
    true
  );

export const dispose = destroy;
export const bootstrap = init;

/* =========================================================
   ACTIONS API
========================================================= */

export const loadCuenta = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "loadCuenta"],
      [RawCuentaView, "reload"],
      [RawCuentaView, "refresh"],
      [RawCuentaView, "load"],
    ],
    args,
    CuentaView,
    { guarded: true }
  );

export const saveCuenta = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "saveCuenta"],
      [RawCuentaView, "save"],
      [RawCuentaView, "saveProfile"],
      [RawCuentaView, "savePerfil"],
      [RawCuentaView, "updateProfile"],
      [RawCuentaView, "updatePerfil"],
      [RawCuentaView, "updateCuenta"],
    ],
    args,
    false,
    { guarded: true }
  );

export const save = (...args) =>
  saveCuenta(...args);

export const saveProfile = (...args) =>
  saveCuenta(...args);

export const savePerfil = (...args) =>
  saveCuenta(...args);

export const updateProfile = (...args) =>
  saveCuenta(...args);

export const updatePerfil = (...args) =>
  saveCuenta(...args);

export const updateCuenta = (...args) =>
  saveCuenta(...args);

export const updateTheme = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "updateTheme"],
      [RawCuentaView, "updateCuentaTheme"],
      [RawCuentaView, "setTheme"],
      [RawCuentaView, "setCuentaTheme"],
    ],
    args,
    false,
    { guarded: true }
  );

export const updateCuentaTheme = (...args) =>
  updateTheme(...args);

export const setTheme = (...args) =>
  updateTheme(...args);

export const setCuentaTheme = (...args) =>
  updateTheme(...args);

export const updateLanguage = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "updateLanguage"],
      [RawCuentaView, "updateCuentaLanguage"],
      [RawCuentaView, "setLanguage"],
      [RawCuentaView, "setCuentaLanguage"],
    ],
    args,
    false,
    { guarded: true }
  );

export const updateCuentaLanguage = (...args) =>
  updateLanguage(...args);

export const setLanguage = (...args) =>
  updateLanguage(...args);

export const setCuentaLanguage = (...args) =>
  updateLanguage(...args);

export const refreshCuenta = (...args) =>
  asyncCallAny(
    [
      [RawCuentaView, "refreshCuenta"],
      [RawCuentaView, "refresh"],
      [RawCuentaView, "reload"],
      [RawCuentaView, "loadCuenta"],
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
      [RawCuentaView, "savePassword"],
    ],
    args,
    false,
    { guarded: true }
  );

export const updatePassword = (...args) =>
  changePassword(...args);

export const savePassword = (...args) =>
  changePassword(...args);

export const openModal = (...args) =>
  callAny(
    [
      [RawCuentaView, "openModal"],
      [RawCuentaView, "openCuentaModal"],
      [RawCuentaView, "open"],
    ],
    args,
    false,
    { guarded: true }
  );

export const openCuentaModal = (...args) =>
  openModal(...args);

export const closeModal = (...args) =>
  callAny(
    [
      [RawCuentaView, "closeModal"],
      [RawCuentaView, "closeCuentaModal"],
      [RawCuentaView, "close"],
    ],
    args,
    true
  );

export const closeCuentaModal = (...args) =>
  closeModal(...args);

/* =========================================================
   DATA API
========================================================= */

export const getItem = (...args) =>
  callAny(
    [
      [RawCuentaView, "getItem"],
      [RawCuentaView, "getCuenta"],
      [RawCuentaView, "getUser"],
      [RawCuentaView, "getProfile"],
      [RawCuentaView, "getPerfil"],
    ],
    args,
    null
  );

export const getCuenta = (...args) =>
  getItem(...args);

export const getUser = (...args) =>
  getItem(...args);

export const getProfile = (...args) =>
  getItem(...args);

export const getPerfil = (...args) =>
  getItem(...args);

export const getState = (...args) =>
  callAny(
    [
      [RawCuentaView, "getState"],
      [RawCuentaView, "getSnapshot"],
      [RawCuentaView, "getCuentaSnapshot"],
    ],
    args,
    null
  );

export const getCuentaView = () =>
  CuentaView;

export const getRawCuentaView = () =>
  RawCuentaView;

export const canRenderCuentaNow = (...args) =>
  shouldAllowCuentaMethod("render", args);

export const getCuentaRouteDebug = (...args) => {
  const evaluation = evaluateCuentaRoute(args);

  return {
    source: CUENTA_INDEX_SOURCE,
    allowed: evaluation.allowed,
    reason: evaluation.reason,

    browserPath: getBrowserPath(),
    browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || "/"),

    appRoute: getAppStatePath(),
    appRouteCanonicalPath: getCleanCanonicalPath(getAppStatePath() || "/"),

    appPublicPath: getAppPublicPath(),
    appPublicCanonicalPath: getCleanCanonicalPath(getAppPublicPath() || "/"),

    signals: evaluation.signals,
    positiveSignal: evaluation.positiveSignal,
    blockingSignal: evaluation.blockingSignal,
  };
};

export const getSnapshot = (...args) => {
  const base = callAny(
    [
      [RawCuentaView, "getSnapshot"],
      [RawCuentaView, "getCuentaSnapshot"],
      [RawCuentaView, "getState"],
    ],
    args,
    null
  );

  return {
    ...(isObject(base) ? base : {}),

    module: CUENTA_MODULE_NAME,
    viewName: CUENTA_VIEW_NAME,
    version: CUENTA_MODULE_VERSION,
    source: CUENTA_INDEX_SOURCE,

    initialized: isInitialized(),
    destroyed: isDestroyed(),
    mounted: isMounted(),

    item: getItem(),

    hasView: Boolean(CuentaView),
    hasRawView: Boolean(RawCuentaView),

    route: getCuentaRouteDebug(...args),
    cuentaAllowedNow: canRenderCuentaNow(...args),
  };
};

export const getCuentaSnapshot = (...args) =>
  getSnapshot(...args);

export const getModuleSnapshot = (...args) =>
  getSnapshot(...args);

/* =========================================================
   UTILS REUTILIZABLES
========================================================= */

export const safeText = (...args) =>
  localSafeText(...args);

export const safeNumber = (...args) =>
  localSafeNumber(...args);

export const safeArray = (...args) =>
  localSafeArray(...args);

export const safeObject = (...args) =>
  localSafeObject(...args);

export const safeBoolean = (...args) =>
  localSafeBoolean(...args);

export const first = (...args) =>
  localFirst(...args);

export const normalizeWhitespace = (...args) =>
  localNormalizeWhitespace(...args);

export const escapeHtml = (...args) =>
  localEscapeHtml(...args);

export const truncate = (...args) =>
  localTruncate(...args);

export const truncateText = (...args) =>
  localTruncate(...args);

/* =========================================================
   FLAGS · CORREGIDOS
========================================================= */

function readViewBooleanFlag(propName = "", methodName = "") {
  try {
    if (methodName && typeof RawCuentaView?.[methodName] === "function") {
      return Boolean(RawCuentaView[methodName]());
    }
  } catch {}

  try {
    const value = RawCuentaView?.[propName];

    if (typeof value === "function") {
      return Boolean(value.call(RawCuentaView));
    }

    return Boolean(value);
  } catch {
    return false;
  }
}

export const isInitialized = () =>
  readViewBooleanFlag("initialized", "isInitialized");

export const isDestroyed = () =>
  readViewBooleanFlag("destroyed", "isDestroyed");

export const isMounted = () =>
  readViewBooleanFlag("mounted", "isMounted");

/* =========================================================
   PUBLIC API OBJECT
========================================================= */

export const CuentaModule = Object.freeze({
  name: CUENTA_MODULE_NAME,
  viewName: CUENTA_VIEW_NAME,
  version: CUENTA_MODULE_VERSION,
  source: CUENTA_INDEX_SOURCE,

  View: CuentaView,
  RawView: RawCuentaView,

  CuentaView,
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

  loadCuenta,

  saveCuenta,
  save,
  saveProfile,
  savePerfil,
  updateProfile,
  updatePerfil,
  updateCuenta,

  updateTheme,
  updateCuentaTheme,
  setTheme,
  setCuentaTheme,

  updateLanguage,
  updateCuentaLanguage,
  setLanguage,
  setCuentaLanguage,

  refreshCuenta,

  changePassword,
  updatePassword,
  savePassword,

  openModal,
  openCuentaModal,
  closeModal,
  closeCuentaModal,

  getItem,
  getCuenta,
  getUser,
  getProfile,
  getPerfil,

  getState,
  getSnapshot,
  getCuentaSnapshot,
  getModuleSnapshot,

  getCuentaView,
  getRawCuentaView,

  canRenderCuentaNow,
  getCuentaRouteDebug,

  isInitialized,
  isDestroyed,
  isMounted,

  safeText,
  safeNumber,
  safeArray,
  safeObject,
  safeBoolean,
  first,
  normalizeWhitespace,
  escapeHtml,
  truncate,
  truncateText,
});

/* =========================================================
   LEGACY GLOBAL BRIDGE
========================================================= */

export function registerGlobalBridge() {
  const root = getGlobalRoot();

  try {
    const previousOnionCuenta =
      root.OnionCuenta && typeof root.OnionCuenta === "object"
        ? root.OnionCuenta
        : {};

    root.OnionCuenta = {
      ...previousOnionCuenta,
      ...CuentaModule,
    };

    root.CuentaView = CuentaView;
    root.OnionCuentaView = CuentaView;
    root.CuentaModule = CuentaModule;
  } catch (error) {
    safeWarn("No se pudo registrar bridge global.", error);
  }

  try {
    const appCore = root?.AppCore;

    if (appCore) {
      if (!appCore.modules || typeof appCore.modules !== "object") {
        appCore.modules = {};
      }

      appCore.modules.Cuenta = CuentaModule;
      appCore.modules.CuentaView = CuentaModule;
      appCore.modules.OnionCuenta = CuentaModule;

      if (typeof appCore.modules.set === "function") {
        try { appCore.modules.set("Cuenta", CuentaModule); } catch {}
        try { appCore.modules.set("CuentaView", CuentaModule); } catch {}
        try { appCore.modules.set("OnionCuenta", CuentaModule); } catch {}
      }

      if (typeof appCore.modules.register === "function") {
        try { appCore.modules.register("Cuenta", CuentaModule); } catch {}
        try { appCore.modules.register("CuentaView", CuentaModule); } catch {}
        try { appCore.modules.register("OnionCuenta", CuentaModule); } catch {}
      }
    }
  } catch (error) {
    safeWarn("No se pudo registrar bridge en AppCore.modules.", error);
  }

  safeEmit("cuenta:index:ready", {
    source: CUENTA_INDEX_SOURCE,
    version: CUENTA_MODULE_VERSION,

    hasView: Boolean(CuentaView),
    hasRawView: Boolean(RawCuentaView),

    route: getCuentaRouteDebug(),
    allowedNow: canRenderCuentaNow(),
  });

  return CuentaModule;
}

/* =========================================================
   READY
========================================================= */

export const bridge = registerGlobalBridge();

export const ready = true;

export default CuentaView;

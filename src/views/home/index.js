/* =========================================================
   Onion SPA - Home View Entrypoint
   Archivo: src/views/home/index.js

   ONION SUPPORT · HOME ENTRYPOINT
   ROUTE SAFE · APP CORE SAFE · ROUTER SAFE · EXTREME 10/10

   RESPONSABILIDADES:
   - Actuar como única puerta de entrada pública de la vista Home.
   - Delegar la lógica real en homeView.js.
   - Mantener compatibilidad con Router legacy y moderno.
   - Exportar API estable: init/render/mount/reload/refresh/destroy.
   - Exportar acciones/getters si homeView.js los expone.
   - Conservar this/contexto al delegar métodos.
   - Evitar duplicar lógica de estado, bindings, template o acciones.
   - No importar CSS ni inyectar estilos.
   - No depender de home.modal.js.
   - Exponer metadata de ruta para Router/AppCore.
   - Proteger Home contra renders stale fuera de "/".
   - Evitar que Home pinte encima de Incidencias/Facturas/etc.

   ESTRUCTURA HOME ALINEADA:
   - homeView.js       => orquestador real de vista
   - home.state.js     => estado local de vista
   - home.actions.js   => acciones de usuario
   - home.api.js       => acceso API
   - home.bindings.js  => eventos DOM
   - home.model.js     => normalización/modelo
   - home.selectors.js => selectores DOM
   - home.template.js  => markup HTML
   - home.utils.js     => utilidades locales
   - index.js          => entrypoint público

   REGLAS:
   - Este archivo NO contiene CSS.
   - Este archivo NO pinta HTML directamente.
   - Este archivo NO bindea eventos DOM directamente.
   - Este archivo NO gestiona estado interno pesado.
   - Este archivo NO llama repair/rebind global.
   - Este archivo NO pisa bridges globales existentes.
   - Este archivo NO ejecuta fallbacks antes de tiempo.

   ROUTE SAFE:
   - init/render/mount/reload/refresh solo corren si la ruta actual es Home.
   - Home real:
       canonicalPath "/"
       publicPath "/"
       publicPath "/@usuario"
   - Bloquea:
       "/incidencias"
       "/@usuario/incidencias"
       "/facturas"
       "/clientes"
       "/usuarios"
       rutas técnicas auth/reset/activate
   - destroy/unmount/getters siempre permitidos.
   - Acciones internas no interpretan href/path destino como ruta actual.

   HARDENING:
   - Compatible con default export object/function.
   - Compatible con named export HomeView/View/Home.
   - Compatible con Router.render(view.default).
   - Compatible con Router.render(view.render).
   - Compatible con imports antiguos.
   - Browser/server safe.
   - Debug snapshot sin tokens sensibles.
========================================================= */

import { AppCore as ImportedAppCore } from "../../core/index.js";
import * as HomeViewModule from "./homeView.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_INDEX_VERSION =
  "10.0.0";

export const HOME_INDEX_SOURCE =
  "views:home:index";

export const HOME_VIEW_NAME =
  "home";

export const HOME_VIEW_ID =
  "home-view";

export const HOME_ROUTE_PATH =
  "/";

export const HOME_CANONICAL_PATH =
  "/";

export const HOME_ROUTE_TITLE =
  "Inicio";

export const HOME_ROUTE_NAMESPACE =
  "home";

const GUARDED_ROUTE_METHODS =
  Object.freeze([
    "init",
    "render",
    "mount",
    "reload",
    "refresh",
  ]);

const GUARDED_RUNTIME_METHODS =
  Object.freeze([
    "openWidget",
    "copyWidgetId",
    "exportCsv",
    "navigate",
    "quickAction",
    "goToPage",
    "goPrevPage",
    "goNextPage",
  ]);

const ALWAYS_ALLOWED_METHODS =
  Object.freeze([
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

const GUARDED_ROUTE_METHOD_SET =
  new Set(GUARDED_ROUTE_METHODS);

const GUARDED_RUNTIME_METHOD_SET =
  new Set(GUARDED_RUNTIME_METHODS);

const ALWAYS_ALLOWED_METHOD_SET =
  new Set(ALWAYS_ALLOWED_METHODS);

const SENSITIVE_QUERY_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
  ]);

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function resolveModuleExport(moduleRef, candidates = []) {
  const source =
    moduleRef &&
    typeof moduleRef === "object"
      ? moduleRef
      : {};

  for (const key of candidates) {
    try {
      if (source[key]) {
        return source[key];
      }
    } catch {}
  }

  try {
    if (source.default) {
      return source.default;
    }
  } catch {}

  return source;
}

export const RawHomeView =
  resolveModuleExport(
    HomeViewModule,
    [
      "default",
      "HomeView",
      "Home",
      "View",
      "view",
    ]
  );

/* =========================================================
   META / ROUTE
========================================================= */

export const HOME_VIEW_META =
  Object.freeze({
    version:
      HOME_INDEX_VERSION,

    source:
      HOME_INDEX_SOURCE,

    name:
      HOME_VIEW_NAME,

    id:
      HOME_VIEW_ID,

    namespace:
      HOME_ROUTE_NAMESPACE,

    title:
      HOME_ROUTE_TITLE,

    route:
      HOME_ROUTE_PATH,

    path:
      HOME_ROUTE_PATH,

    canonicalPath:
      HOME_CANONICAL_PATH,

    layout:
      "app",

    requiresAuth:
      true,

    public:
      false,

    private:
      true,

    showShell:
      true,

    showChrome:
      true,

    sidebar:
      true,

    topbar:
      true,

    tablehead:
      false,

    preload:
      false,
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return Boolean(
    value &&
      (
        typeof value === "object" ||
        typeof value === "function"
      )
  );
}

function isNodeLike(value) {
  try {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.nodeType === "number"
    );
  } catch {}

  return false;
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(...args) {
  try {
    ImportedAppCore?.utils?.warn?.(
      "[HomeIndex]",
      ...args
    );

    return;
  } catch {}

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

/* =========================================================
   CORE / ROUTER ACCESS
========================================================= */

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return null;
  }

  try {
    return window[key] || null;
  } catch {}

  return null;
}

function getAppCore() {
  try {
    if (ImportedAppCore) {
      return ImportedAppCore;
    }
  } catch {}

  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      getWindowValue("AppCore") ||
      getWindowValue("__ONION_APP_CORE__") ||
      getWindowValue("__ONION_CORE__") ||
      getWindowValue("__ONION_APP__")?.AppCore ||
      getWindowValue("__ONION_APP__")?.core ||
      getWindowValue("OnionApp")?.AppCore ||
      getWindowValue("OnionApp")?.core ||
      getWindowValue("Onion")?.AppCore ||
      getWindowValue("Onion")?.core ||
      null
    );
  } catch {}

  return null;
}

function getRouterFromCore() {
  const core =
    getAppCore();

  try {
    return (
      core?.Router ||
      core?.router ||
      core?.modules?.Router ||
      core?.modules?.router ||
      core?.registry?.modules?.get?.("Router") ||
      core?.registry?.modules?.get?.("router") ||
      null
    );
  } catch {}

  return null;
}

function callRouterGetter(methodName = "") {
  const Router =
    getRouterFromCore();

  try {
    if (isFunction(Router?.[methodName])) {
      return Router[methodName]();
    }
  } catch {}

  return "";
}

function getAppStatePath() {
  const core =
    getAppCore();

  try {
    return safeText(
      core?.state?.route ||
        core?.state?.canonicalPath ||
        callRouterGetter("getCurrentCanonicalPath") ||
        "",
      ""
    );
  } catch {}

  return "";
}

function getAppPublicPath() {
  const core =
    getAppCore();

  try {
    return safeText(
      core?.state?.publicPath ||
        callRouterGetter("getCurrentPublicPath") ||
        "",
      ""
    );
  } catch {}

  return "";
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

function escapeRegExp(value = "") {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      output =
        output.replace(
          new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    }

    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

/* =========================================================
   PATH HELPERS
========================================================= */

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

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
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

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

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

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
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
  } =
    splitPath(raw);

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
  } =
    splitPath(
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
  } catch {}

  return "";
}

/* =========================================================
   FALLBACKS
========================================================= */

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
        version:
          HOME_INDEX_VERSION,

        initialized:
          false,

        destroyed:
          false,

        ready:
          false,

        routeBlocked:
          true,

        source:
          HOME_INDEX_SOURCE,

        at:
          safeIsoDate(),
      };

    default:
      return null;
  }
}

/* =========================================================
   ROUTE SIGNALS
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
      redactSensitiveText(text),

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

  const clean =
    text.toLowerCase();

  signals.push({
    type:
      "view",

    label,

    value:
      clean,

    isHome:
      clean === HOME_VIEW_NAME,
  });
}

function pushPrimitiveRouteSignal(signals, value, label = "arg") {
  const text =
    safeText(value, "");

  if (!text) {
    return;
  }

  if (
    text.startsWith("/") ||
    text.startsWith("#/") ||
    text.startsWith("#!") ||
    /^[a-z][a-z\d+.-]*:\/\//i.test(text)
  ) {
    pushPathSignal(
      signals,
      label,
      text
    );
  }
}

function collectRouteSignalsFromObject(
  signals,
  value,
  label = "arg",
  visited = new WeakSet(),
  depth = 0
) {
  if (
    !isObject(value) ||
    isNodeLike(value) ||
    depth > 3
  ) {
    return;
  }

  try {
    if (visited.has(value)) {
      return;
    }

    visited.add(value);
  } catch {}

  pushViewSignal(
    signals,
    `${label}.viewKey`,
    value.viewKey
  );

  pushViewSignal(
    signals,
    `${label}.viewName`,
    value.viewName
  );

  pushViewSignal(
    signals,
    `${label}.name`,
    value.name
  );

  pushViewSignal(
    signals,
    `${label}.id`,
    value.id
  );

  pushViewSignal(
    signals,
    `${label}.route.viewKey`,
    value.route?.viewKey
  );

  pushViewSignal(
    signals,
    `${label}.route.name`,
    value.route?.name
  );

  pushViewSignal(
    signals,
    `${label}.route.id`,
    value.route?.id
  );

  pushPathSignal(
    signals,
    `${label}.canonicalPath`,
    value.canonicalPath
  );

  pushPathSignal(
    signals,
    `${label}.currentCanonicalPath`,
    value.currentCanonicalPath
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
    `${label}.route.canonicalPath`,
    value.route?.canonicalPath
  );

  pushPathSignal(
    signals,
    `${label}.publicPath`,
    value.publicPath
  );

  pushPathSignal(
    signals,
    `${label}.currentPublicPath`,
    value.currentPublicPath
  );

  pushPathSignal(
    signals,
    `${label}.requestedPath`,
    value.requestedPath
  );

  pushPathSignal(
    signals,
    `${label}.browserPath`,
    value.browserPath
  );

  pushPathSignal(
    signals,
    `${label}.locationPath`,
    value.locationPath
  );

  collectRouteSignalsFromObject(
    signals,
    value.options,
    `${label}.options`,
    visited,
    depth + 1
  );

  collectRouteSignalsFromObject(
    signals,
    value.context,
    `${label}.context`,
    visited,
    depth + 1
  );

  collectRouteSignalsFromObject(
    signals,
    value.routeContext,
    `${label}.routeContext`,
    visited,
    depth + 1
  );
}

function collectCurrentRouteSignals(signals) {
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
}

function collectRouteSignals(args = [], options = {}) {
  const signals =
    [];

  const opts =
    safeObject(options);

  if (opts.includeArgs !== false) {
    const list =
      Array.isArray(args)
        ? args
        : [];

    list.forEach((arg, index) => {
      if (typeof arg === "string") {
        pushPrimitiveRouteSignal(
          signals,
          arg,
          `args[${index}]`
        );

        return;
      }

      collectRouteSignalsFromObject(
        signals,
        arg,
        `args[${index}]`
      );
    });
  }

  collectCurrentRouteSignals(signals);

  return signals;
}

function getBlockingSignal(signals = []) {
  return (
    safeArray(signals).find((signal) => signal.isHome === false) ||
    null
  );
}

function hasPositiveHomeSignal(signals = []) {
  return safeArray(signals).some((signal) => signal.isHome === true);
}

function shouldInspectArgsForMethod(method = "") {
  return GUARDED_ROUTE_METHOD_SET.has(
    safeText(method, "")
  );
}

function shouldAllowHomeMethod(method = "", args = []) {
  const cleanMethod =
    safeText(method, "");

  if (!cleanMethod) {
    return true;
  }

  if (ALWAYS_ALLOWED_METHOD_SET.has(cleanMethod)) {
    return true;
  }

  const isGuarded =
    GUARDED_ROUTE_METHOD_SET.has(cleanMethod) ||
    GUARDED_RUNTIME_METHOD_SET.has(cleanMethod);

  if (!isGuarded) {
    return true;
  }

  const signals =
    collectRouteSignals(
      args,
      {
        /*
          Para init/render/mount/reload/refresh sí inspeccionamos args,
          porque el Router puede pasar canonicalPath/publicPath.

          Para acciones como navigate/quickAction NO inspeccionamos args,
          porque pueden recibir un destino "/incidencias" aunque la acción
          se esté disparando legítimamente desde Home.
        */
        includeArgs:
          shouldInspectArgsForMethod(cleanMethod),
      }
    );

  const blockingSignal =
    getBlockingSignal(signals);

  if (blockingSignal) {
    return false;
  }

  if (hasPositiveHomeSignal(signals)) {
    return true;
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return isHomePath(browserPath);
  }

  /*
    SSR/tests sin browser ni AppCore:
    permite compatibilidad.
  */
  return true;
}

function logBlockedHomeMethod(method = "", args = []) {
  const includeArgs =
    shouldInspectArgsForMethod(method);

  const signals =
    collectRouteSignals(
      args,
      {
        includeArgs,
      }
    );

  const blockingSignal =
    getBlockingSignal(signals);

  safeWarn(
    `HomeView.${method} bloqueado: la ruta actual no es Home.`,
    {
      method,
      includeArgs,
      blockingSignal,
      signals,
      browserPath:
        redactSensitiveText(getBrowserPath()),
      browserCanonicalPath:
        getCleanCanonicalPath(getBrowserPath() || "/"),
      appRoute:
        redactSensitiveText(getAppStatePath()),
      appPublicPath:
        redactSensitiveText(getAppPublicPath()),
    }
  );
}

/* =========================================================
   METHOD CALL HELPERS
========================================================= */

function resolveMethod(target, method = "") {
  const source =
    target || {};

  try {
    const fn =
      source?.[method];

    if (isFunction(fn)) {
      return {
        fn,
        owner:
          source,
        method:
          safeText(method, ""),
      };
    }
  } catch {}

  /*
    Compatibilidad:
    si homeView.js exporta una función directa, Router.render(default)
    puede delegar render/init/mount al callable.
  */
  if (
    isFunction(source) &&
    (
      method === "render" ||
      method === "mount" ||
      method === "init"
    )
  ) {
    return {
      fn:
        source,
      owner:
        null,
      method:
        "__callable__",
    };
  }

  return {
    fn:
      null,
    owner:
      source,
    method:
      safeText(method, ""),
  };
}

function safeCall(target, method, args = [], fallback = undefined) {
  const callArgs =
    Array.isArray(args)
      ? args
      : [];

  const resolved =
    resolveMethod(
      target,
      method
    );

  if (!isFunction(resolved.fn)) {
    return fallback !== undefined
      ? fallback
      : getDefaultFallback(method);
  }

  try {
    return resolved.fn.apply(
      resolved.owner || target,
      callArgs
    );
  } catch (error) {
    safeWarn(
      `${String(method)} falló.`,
      error
    );

    return fallback !== undefined
      ? fallback
      : getDefaultFallback(method);
  }
}

function guardedCall(target, method, args = [], fallback = undefined) {
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

function guardedCallWithLazyFallback({
  target,
  method,
  args = [],
  fallbackMethod = "",
  fallbackValue = undefined,
}) {
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

    return fallbackValue !== undefined
      ? fallbackValue
      : getDefaultFallback(method);
  }

  const resolved =
    resolveMethod(
      target,
      method
    );

  if (isFunction(resolved.fn)) {
    return safeCall(
      target,
      method,
      callArgs,
      fallbackValue
    );
  }

  if (fallbackMethod) {
    return guardedCall(
      target,
      fallbackMethod,
      callArgs,
      fallbackValue
    );
  }

  return fallbackValue !== undefined
    ? fallbackValue
    : getDefaultFallback(method);
}

function safeFlag(target, key, fallback = false) {
  try {
    return Boolean(target?.[key]);
  } catch {}

  return Boolean(fallback);
}

/* =========================================================
   GUARDED VIEW BRIDGE
========================================================= */

function createGuardedHomeViewBridge(view) {
  const source =
    view || {};

  if (
    typeof Proxy !== "function" ||
    !isObjectLike(source)
  ) {
    return source;
  }

  const cache =
    new Map();

  const handler = {
    get(target, prop, receiver) {
      if (prop === "__raw") {
        return target;
      }

      if (prop === "__source") {
        return HOME_INDEX_SOURCE;
      }

      if (prop === "__routeViewKey") {
        return HOME_VIEW_NAME;
      }

      if (prop === "meta") {
        return target.meta || HOME_VIEW_META;
      }

      if (prop === "route") {
        return target.route || HomeRoute;
      }

      const value =
        Reflect.get(
          target,
          prop,
          receiver
        );

      if (!isFunction(value)) {
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

            return getDefaultFallback(method);
          }
        };

      try {
        Object.defineProperties(
          wrapped,
          {
            routeViewKey: {
              value:
                HOME_VIEW_NAME,
              enumerable:
                true,
            },

            routeViewName: {
              value:
                "HomeView",
              enumerable:
                true,
            },
          }
        );
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
      } catch {}

      return false;
    },
  };

  if (isFunction(source)) {
    handler.apply = function applyGuardedHome(target, thisArg, args) {
      if (
        !shouldAllowHomeMethod(
          "render",
          args
        )
      ) {
        logBlockedHomeMethod(
          "render",
          args
        );

        return getDefaultFallback("render");
      }

      try {
        return Reflect.apply(
          target,
          thisArg,
          args
        );
      } catch (error) {
        safeWarn(
          "HomeView callable falló.",
          error
        );

        return getDefaultFallback("render");
      }
    };
  }

  return new Proxy(
    source,
    handler
  );
}

export const HomeView =
  createGuardedHomeViewBridge(
    RawHomeView
  );

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
  guardedCallWithLazyFallback({
    target:
      RawHomeView,
    method:
      "mount",
    fallbackMethod:
      "init",
    args,
    fallbackValue:
      null,
  });

export const reload = (...args) =>
  guardedCallWithLazyFallback({
    target:
      RawHomeView,
    method:
      "reload",
    fallbackMethod:
      "refresh",
    args,
    fallbackValue:
      null,
  });

export const refresh = (...args) =>
  guardedCallWithLazyFallback({
    target:
      RawHomeView,
    method:
      "refresh",
    fallbackMethod:
      "reload",
    args,
    fallbackValue:
      null,
  });

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

export const getSnapshot = (...args) => {
  const indexSnapshot = {
    version:
      HOME_INDEX_VERSION,

    initialized:
      isInitialized(),

    destroyed:
      isDestroyed(),

    ready:
      isReady(),

    hasHomeView:
      Boolean(RawHomeView),

    hasModal:
      false,

    source:
      HOME_INDEX_SOURCE,

    browserPath:
      redactSensitiveText(getBrowserPath()),

    browserCanonicalPath:
      getCleanCanonicalPath(
        getBrowserPath() || "/"
      ),

    appRoute:
      redactSensitiveText(getAppStatePath()),

    appPublicPath:
      redactSensitiveText(getAppPublicPath()),

    homeAllowedNow:
      shouldAllowHomeMethod(
        "render",
        []
      ),

    at:
      safeIsoDate(),
  };

  const viewSnapshot =
    safeCall(
      RawHomeView,
      "getSnapshot",
      args,
      null
    );

  return {
    ...indexSnapshot,
    ...safeObject(viewSnapshot),

    index:
      indexSnapshot,
  };
};

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
    collectRouteSignals(
      args,
      {
        includeArgs:
          true,
      }
    );

  return {
    version:
      HOME_INDEX_VERSION,

    source:
      HOME_INDEX_SOURCE,

    allowed:
      shouldAllowHomeMethod(
        "render",
        args
      ),

    browserPath:
      redactSensitiveText(getBrowserPath()),

    browserCanonicalPath:
      getCleanCanonicalPath(
        getBrowserPath() || "/"
      ),

    appRoute:
      redactSensitiveText(getAppStatePath()),

    appPublicPath:
      redactSensitiveText(getAppPublicPath()),

    signals,

    blockingSignal:
      getBlockingSignal(signals),

    hasPositiveHomeSignal:
      hasPositiveHomeSignal(signals),

    at:
      safeIsoDate(),
  };
};

/* =========================================================
   ROUTE DEFINITION
========================================================= */

export const HomeRoute =
  Object.freeze({
    name:
      HOME_VIEW_NAME,

    id:
      HOME_VIEW_NAME,

    path:
      HOME_ROUTE_PATH,

    canonicalPath:
      HOME_CANONICAL_PATH,

    title:
      HOME_ROUTE_TITLE,

    view:
      HomeView,

    component:
      HomeView,

    module:
      HomeView,

    meta:
      HOME_VIEW_META,
  });

export function getHomeView() {
  return HomeView;
}

export function getRawHomeView() {
  return RawHomeView;
}

export function getHomeRoute() {
  return HomeRoute;
}

export function getHomeMeta() {
  return HOME_VIEW_META;
}

export function createHomeRoute(overrides = {}) {
  const safeOverrides =
    safeObject(overrides);

  return {
    ...HomeRoute,
    ...safeOverrides,

    meta: {
      ...HOME_VIEW_META,
      ...safeObject(safeOverrides.meta),
    },
  };
}

/* =========================================================
   PUBLIC MODULE API
========================================================= */

export const Home =
  Object.freeze({
    version:
      HOME_INDEX_VERSION,

    source:
      HOME_INDEX_SOURCE,

    name:
      HOME_VIEW_NAME,

    id:
      HOME_VIEW_ID,

    path:
      HOME_ROUTE_PATH,

    canonicalPath:
      HOME_CANONICAL_PATH,

    meta:
      HOME_VIEW_META,

    route:
      HomeRoute,

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

    isInitialized,
    isDestroyed,
    isReady,

    canRenderHomeNow,
    getHomeRouteDebug,

    getHomeView,
    getRawHomeView,
    getHomeRoute,
    getHomeMeta,
    createHomeRoute,

    View:
      HomeView,

    RawView:
      RawHomeView,
  });

/* =========================================================
   COMPAT EXPORTS
========================================================= */

export {
  HomeViewModule,
};

export const View =
  HomeView;

export const view =
  HomeView;

export const Module =
  Home;

export const route =
  HomeRoute;

export const meta =
  HOME_VIEW_META;

/* =========================================================
   LEGACY GLOBAL BRIDGE OPTIONAL
========================================================= */

try {
  if (isBrowser()) {
    const previous =
      window.OnionHome &&
      typeof window.OnionHome === "object"
        ? window.OnionHome
        : {};

    window.OnionHome = {
      ...previous,
      ...Home,

      previous:
        previous.previous || previous,
    };
  }
} catch {}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default HomeView;

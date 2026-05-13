/* =========================================================
   Onion SPA - Entry Point
   Archivo: /src/main.js

   ONION SUPPORT · MAIN ENTRYPOINT
   PRIVATE SPA · SINGLE BOOT OWNER · CSP CLEAN · EXTREME 14/10

   RESPONSABILIDADES:
   - Ser el único entrypoint físico cargado por index.html.
   - Desactivar cualquier auto-boot legacy antes de importar src/app/index.js.
   - Esperar DOM ready de forma segura.
   - Capturar URL inicial mínima antes del boot lógico.
   - Preservar rutas técnicas con token antes de cargar App.
   - Cargar App/AppCore mediante imports dinámicos controlados.
   - Invocar App.boot() una sola vez.
   - Evitar doble arranque.
   - Capturar errores fatales del arranque físico.
   - Exponer diagnóstico mínimo en window.OnionApp.main.
   - No montar UI.
   - No configurar Router/Auth/Store.
   - No controlar el loader real salvo fallback fatal de emergencia.
   - No contener CSS.
   - No inyectar estilos.
   - No duplicar lógica de src/app/index.js.
   - No duplicar lógica de src/app/loader.js.

   CONTRATO:
   - index.html carga /src/main.js.
   - src/app/index.js exporta App, pero NO debe autoarrancar.
   - Si quedara auto-boot legacy, main.js fija __ONION_DISABLE_AUTO_BOOT__
     antes del import dinámico.
   - src/app/loader.js gobierna el loader real.
   - src/app/index.js gobierna bootstrap, restore, router, UI y finalize.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const MAIN_VERSION = "14.0.0";

const MAIN_SOURCE = "main";

const RUNTIME_KEY = "__ONION_MAIN__";
const BOOT_LOCK_KEY = "__ONION_MAIN_BOOT_LOCK__";
const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";
const MAIN_BOOT_CONTEXT_KEY = "__ONION_MAIN_BOOT_CONTEXT__";
const APP_BOOT_CONTEXT_KEY = "__ONION_BOOT_CONTEXT__";

const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";

const DEFAULT_ROUTE = "/";

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const DEFAULT_FATAL_TITLE = "Error de arranque";
const DEFAULT_FATAL_MESSAGE = "No se pudo iniciar Onion Support.";

const APP_MODULE_PATH = "./app/index.js";
const CORE_MODULE_PATH = "./core/index.js";

const TOKEN_ROUTE_CONFIGS = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),
    tokenParamNames: Object.freeze([
      "token",
      "activationToken",
      "activateToken",
      "code",
      "t",
    ]),
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),
    tokenParamNames: Object.freeze([
      "token",
      "resetToken",
      "passwordResetToken",
      "confirmToken",
      "code",
      "t",
    ]),
  }),
]);

const SENSITIVE_PARAM_NAMES = Object.freeze([
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

const MAIN_EVENTS = Object.freeze({
  moduleLoaded: "main:module:loaded",
  bridgeReady: "main:bridge:ready",

  initialUrlCaptured: "main:initial-url:captured",

  runtimeLoadStart: "main:runtime-load:start",
  runtimeLoadReady: "main:runtime-load:ready",
  runtimeLoadError: "main:runtime-load:error",

  bootStart: "main:boot:start",
  bootReady: "main:boot:ready",
  bootError: "main:boot:error",

  fatalRendered: "main:fatal:rendered",

  globalError: "main:global:error",
  unhandledRejection: "main:global:unhandled-rejection",
});

/* =========================================================
   RUNTIME REFS
========================================================= */

let App = null;
let AppCore = null;

let runtimeLoadPromise = null;

/* =========================================================
   STATE
========================================================= */

const state = {
  version: MAIN_VERSION,

  started: false,
  settled: false,
  failed: false,

  startPromise: null,
  bootPromise: null,

  runtimeLoaded: false,
  runtimeLoadStartedAt: 0,
  runtimeLoadSettledAt: 0,

  startedAt: 0,
  settledAt: 0,

  readyBound: false,
  readyCallbackCalled: false,

  safetyNetBound: false,
  fatalRendered: false,
  debugBridgeExposed: false,

  lastBootContext: null,
  lastError: null,
};

/* =========================================================
   BASIC HELPERS
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
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
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

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
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
   LEGACY AUTO BOOT GUARD
========================================================= */

function disableLegacyAutoBoot() {
  if (!isBrowser()) {
    return false;
  }

  try {
    window[DISABLE_AUTO_BOOT_KEY] = true;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATH / TOKEN HELPERS
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_PARAM_NAMES) {
      const escaped =
        escapeRegExp(name);

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
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

    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );

    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    safeText(pathname, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  const cleanSegments = [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      cleanSegments.pop();
      continue;
    }

    cleanSegments.push(segment);
  }

  value =
    `/${cleanSegments.join("/")}`;

  if (!value) {
    value = DEFAULT_ROUTE;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
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
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return normalizeLocalFullPath(
      raw.replace(/^#!\/?/, "/")
    );
  }

  return normalizeLocalFullPath(
    raw.replace(/^#\/?/, "/")
  );
}

function splitFullPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return splitFullPath(
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
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
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

function normalizeLocalFullPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
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
        return normalizeLocalFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizeLocalFullPath(
      `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizeLocalFullPath(
      raw.startsWith("/") ||
      raw.startsWith("#")
        ? raw
        : `/${raw}`
    );
  }
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  const normalized =
    normalizeLocalFullPath(path || DEFAULT_ROUTE);

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return safeArray(names).some((name) =>
      Boolean(
        safeText(
          params.get(name),
          ""
        )
      )
    );
  } catch {
    return false;
  }
}

function getPathToken(config = null, value = "") {
  if (!config?.path) {
    return "";
  }

  const path =
    pathFromUrlLike(value);

  const clean =
    stripSearchAndHash(path);

  if (!clean.startsWith(`${config.path}/`)) {
    return "";
  }

  const token =
    clean
      .slice(`${config.path}/`.length)
      .split("/")[0];

  try {
    return safeText(
      decodeURIComponent(token || ""),
      ""
    );
  } catch {
    return safeText(token, "");
  }
}

function matchesTokenRoute(config = null, value = "") {
  if (!config?.path) {
    return false;
  }

  const path =
    pathFromUrlLike(value);

  const clean =
    stripSearchAndHash(path);

  return (
    clean === config.path ||
    clean.startsWith(`${config.path}/`)
  );
}

function hasRouteToken(config = null, value = "") {
  if (!config) {
    return false;
  }

  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (getPathToken(config, raw)) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      hasTokenInSearch(
        parsed.search,
        config.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      if (getPathToken(config, hashPath)) {
        return true;
      }

      const hashParts =
        splitFullPath(hashPath);

      if (
        hasTokenInSearch(
          hashParts.search,
          config.tokenParamNames
        )
      ) {
        return true;
      }
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames
      );
    }

    return false;
  } catch {
    const normalized =
      normalizeLocalFullPath(raw);

    if (getPathToken(config, normalized)) {
      return true;
    }

    const parts =
      splitFullPath(normalized);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenParamNames
      );
    }

    return false;
  }
}

function getMatchedTokenRouteContext(href = "") {
  for (const config of TOKEN_ROUTE_CONFIGS) {
    if (
      matchesTokenRoute(config, href) &&
      hasRouteToken(config, href)
    ) {
      const publicPath =
        pathFromUrlLike(href);

      return {
        key:
          config.key,

        path:
          stripSearchAndHash(publicPath),

        publicPath,

        hasToken:
          true,

        tokenInPath:
          Boolean(getPathToken(config, href)),

        config,
      };
    }
  }

  return {
    key:
      "",

    path:
      "",

    publicPath:
      "",

    hasToken:
      false,

    tokenInPath:
      false,

    config:
      null,
  };
}

/* =========================================================
   ERROR / PAYLOAD SANITIZE
========================================================= */

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  const candidate =
    error?.reason ||
    error?.error ||
    error;

  return {
    name:
      safeText(
        candidate?.name,
        "Error"
      ),

    message:
      redactSensitiveText(
        safeText(
          candidate?.message ||
            candidate?.reason ||
            candidate,
          "Error"
        )
      ),

    code:
      safeText(
        candidate?.code ||
          candidate?.statusCode ||
          "",
        ""
      ),

    status:
      safeNumber(
        candidate?.status,
        0
      ),

    timeout:
      Boolean(candidate?.timeout),

    at:
      nowIso(),
  };
}

function sanitizeBootContext(context = {}) {
  const ctx =
    safeObject(context);

  return {
    version:
      MAIN_VERSION,

    source:
      MAIN_SOURCE,

    reason:
      safeText(ctx.reason, ""),

    href:
      redactSensitiveText(ctx.href || ""),

    initialUrl:
      redactSensitiveText(ctx.initialUrl || ""),

    pathname:
      safeText(ctx.pathname, ""),

    search:
      ctx.search ? "***" : "",

    hash:
      ctx.hash
        ? redactSensitiveText(ctx.hash)
        : "",

    publicPath:
      redactSensitiveText(ctx.publicPath || ""),

    protectedRouteKey:
      safeText(ctx.protectedRouteKey, ""),

    isPublicTokenRoute:
      Boolean(ctx.isPublicTokenRoute),

    hasPublicToken:
      Boolean(ctx.hasPublicToken),

    capturedAt:
      safeText(ctx.capturedAt, ""),
  };
}

function sanitizePayload(payload = {}) {
  if (!isObject(payload)) {
    if (typeof payload === "string") {
      return redactSensitiveText(payload);
    }

    return payload;
  }

  const clean = {};

  for (const [key, value] of Object.entries(payload)) {
    if (
      /token|secret|password|authorization|credential/i.test(key) &&
      value
    ) {
      clean[key] = "***";
      continue;
    }

    if (
      [
        "href",
        "url",
        "path",
        "route",
        "publicPath",
        "canonicalPath",
        "initialUrl",
        "redirectTo",
        "filename",
        "message",
      ].includes(key) &&
      typeof value === "string"
    ) {
      clean[key] =
        redactSensitiveText(value);

      continue;
    }

    if (key === "error") {
      clean[key] =
        sanitizeError(value);

      continue;
    }

    if (
      key === "bootContext" &&
      isObject(value)
    ) {
      clean[key] =
        sanitizeBootContext(value);

      continue;
    }

    if (value instanceof Error) {
      clean[key] =
        sanitizeError(value);

      continue;
    }

    if (Array.isArray(value)) {
      clean[key] =
        value
          .slice(0, 60)
          .map((item) =>
            isObject(item)
              ? sanitizePayload(item)
              : typeof item === "string"
                ? redactSensitiveText(item)
                : item
          );

      continue;
    }

    if (isObject(value)) {
      clean[key] =
        sanitizePayload(value);

      continue;
    }

    clean[key] =
      value;
  }

  return clean;
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function safeLog(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    AppCore?.utils?.log?.(
      "[Main]",
      ...cleanArgs
    );

    return;
  } catch {}

  try {
    console.log(
      "[Main]",
      ...cleanArgs
    );
  } catch {}
}

function safeWarn(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[Main]",
        ...cleanArgs
      );

      coreLogged =
        true;
    }
  } catch {
    coreLogged =
      false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn(
      "[Main]",
      ...cleanArgs
    );
  } catch {}
}

function safeError(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[Main]",
        ...cleanArgs
      );

      coreLogged =
        true;
    }
  } catch {
    coreLogged =
      false;
    }

  if (coreLogged) {
    return;
  }

  try {
    console.error(
      "[Main]",
      ...cleanArgs
    );
  } catch {}
}

function safeCreateCustomEvent(name = "", detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  const eventName =
    safeText(name, "");

  if (!eventName) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        eventName,
        {
          detail,
        }
      );
    }
  } catch {}

  try {
    const event =
      document.createEvent("CustomEvent");

    event.initCustomEvent(
      eventName,
      false,
      false,
      detail
    );

    return event;
  } catch {
    return null;
  }
}

function safeEmit(name = "", payload = {}, options = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  const cleanPayload =
    sanitizePayload({
      source:
        MAIN_SOURCE,

      version:
        MAIN_VERSION,

      ...safeObject(payload),
    });

  const opts =
    safeObject(options);

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        eventName,
        cleanPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      const event =
        safeCreateCustomEvent(
          eventName,
          cleanPayload
        );

      if (event) {
        window.dispatchEvent(event);
        return true;
      }
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getHtml() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.documentElement || null;
  } catch {
    return null;
  }
}

function getBody() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.body || null;
  } catch {
    return null;
  }
}

function byId(id = "") {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function query(selector = "") {
  if (
    !isBrowser() ||
    !selector
  ) {
    return null;
  }

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function setAttr(element, name, value) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key, value) {
  if (
    !element ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
    } else {
      element.dataset[key] =
        String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function addClass(element, className) {
  if (
    !element ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.add(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(element, className) {
  if (
    !element ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.remove(className);
    return true;
  } catch {
    return false;
  }
}

function clearNode(node) {
  if (!node) {
    return false;
  }

  try {
    node.replaceChildren();
    return true;
  } catch {}

  try {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    return true;
  } catch {
    return false;
  }
}

function createElement(tagName = "div", {
  id = "",
  className = "",
  text = "",
  attrs = {},
  dataset = {},
} = {}) {
  const element =
    document.createElement(tagName);

  if (id) {
    element.id = id;
  }

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  for (const [key, value] of Object.entries(safeObject(attrs))) {
    setAttr(
      element,
      key,
      value
    );
  }

  for (const [key, value] of Object.entries(safeObject(dataset))) {
    setDataset(
      element,
      key,
      value
    );
  }

  return element;
}

/* =========================================================
   APP CORE STATE PATCH
========================================================= */

function patchCoreState(payload = {}) {
  const patch =
    safeObject(payload);

  if (!Object.keys(patch).length) {
    return false;
  }

  try {
    AppCore?.setState?.(
      patch,
      {
        source:
          "main",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );

    return true;
  } catch {}

  try {
    AppCore?.patchState?.(
      patch,
      {
        source:
          "main",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );

    return true;
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        patch
      );

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function markDocumentBooting(reason = "main-booting") {
  if (!isBrowser()) {
    return false;
  }

  const html =
    getHtml();

  const body =
    getBody();

  for (const element of [
    html,
    body,
  ]) {
    if (!element) {
      continue;
    }

    removeClass(element, "app-ready");
    removeClass(element, "app-fatal");
    removeClass(element, "app-error");

    addClass(element, "app-booting");
    addClass(element, "app-loading");

    setDataset(
      element,
      "appLoading",
      "true"
    );

    setDataset(
      element,
      "appBooting",
      "true"
    );

    setDataset(
      element,
      "appReady",
      "false"
    );

    setDataset(
      element,
      "routeMode",
      "boot"
    );
  }

  if (html) {
    setDataset(
      html,
      "appState",
      "booting"
    );

    setDataset(
      html,
      "shellState",
      "booting"
    );
  }

  if (body) {
    setDataset(
      body,
      "shellState",
      "booting"
    );

    setDataset(
      body,
      "bootReason",
      reason
    );
  }

  patchCoreState({
    mainReady:
      false,

    mainBooting:
      true,

    mainFatal:
      false,

    mainPhase:
      "booting",

    mainReason:
      reason,

    mainUpdatedAt:
      nowIso(),
  });

  return true;
}

function markDocumentReady(reason = "main-ready") {
  if (!isBrowser()) {
    return false;
  }

  const html =
    getHtml();

  const body =
    getBody();

  for (const element of [
    html,
    body,
  ]) {
    if (!element) {
      continue;
    }

    removeClass(element, "app-booting");
    removeClass(element, "app-loading");
    removeClass(element, "app-fatal");
    removeClass(element, "app-error");

    addClass(element, "app-ready");

    setDataset(
      element,
      "appLoading",
      "false"
    );

    setDataset(
      element,
      "appBooting",
      "false"
    );

    setDataset(
      element,
      "appReady",
      "true"
    );
  }

  if (html) {
    setDataset(
      html,
      "appState",
      "ready"
    );

    if (html.dataset.routeMode === "boot") {
      setDataset(
        html,
        "routeMode",
        "app"
      );
    }

    setDataset(
      html,
      "shellState",
      "ready"
    );
  }

  if (body) {
    if (body.dataset.routeMode === "boot") {
      setDataset(
        body,
        "routeMode",
        "app"
      );
    }

    setDataset(
      body,
      "shellState",
      "ready"
    );

    setDataset(
      body,
      "bootReason",
      reason
    );
  }

  patchCoreState({
    mainReady:
      true,

    mainBooting:
      false,

    mainFatal:
      false,

    mainPhase:
      "ready",

    mainReason:
      reason,

    mainUpdatedAt:
      nowIso(),
  });

  return true;
}

function markDocumentFatal(reason = "main-fatal") {
  if (!isBrowser()) {
    return false;
  }

  const html =
    getHtml();

  const body =
    getBody();

  for (const element of [
    html,
    body,
  ]) {
    if (!element) {
      continue;
    }

    removeClass(element, "app-booting");
    removeClass(element, "app-loading");
    removeClass(element, "app-ready");

    addClass(element, "app-fatal");

    setDataset(
      element,
      "appLoading",
      "false"
    );

    setDataset(
      element,
      "appBooting",
      "false"
    );

    setDataset(
      element,
      "appReady",
      "false"
    );

    setDataset(
      element,
      "routeMode",
      "fatal"
    );
  }

  if (html) {
    setDataset(
      html,
      "appState",
      "fatal"
    );

    setDataset(
      html,
      "shellState",
      "fatal"
    );
  }

  if (body) {
    setDataset(
      body,
      "shellState",
      "fatal"
    );

    setDataset(
      body,
      "bootReason",
      reason
    );
  }

  patchCoreState({
    mainReady:
      false,

    mainBooting:
      false,

    mainFatal:
      true,

    mainPhase:
      "fatal",

    mainReason:
      reason,

    mainUpdatedAt:
      nowIso(),

    mainLastError:
      sanitizeError(state.lastError),
  });

  return true;
}

/* =========================================================
   URL CAPTURE
========================================================= */

function getCurrentHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function writeRuntimeValue(key = "", value = null, onlyIfMissing = false) {
  if (
    !isBrowser() ||
    !key
  ) {
    return false;
  }

  try {
    if (
      onlyIfMissing &&
      window[key]
    ) {
      return true;
    }

    window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function preserveTokenRouteInitialUrls(href = "") {
  if (
    !isBrowser() ||
    !href
  ) {
    return {
      isPublicTokenRoute:
        false,

      hasPublicToken:
        false,

      protectedRouteKey:
        "",

      protectedInitialPublicPath:
        "",
    };
  }

  const tokenContext =
    getMatchedTokenRouteContext(href);

  if (
    !tokenContext.config ||
    !tokenContext.hasToken
  ) {
    return {
      isPublicTokenRoute:
        false,

      hasPublicToken:
        false,

      protectedRouteKey:
        "",

      protectedInitialPublicPath:
        "",
    };
  }

  for (const key of tokenContext.config.windowKeys || []) {
    writeRuntimeValue(
      key,
      href,
      true
    );
  }

  return {
    isPublicTokenRoute:
      true,

    hasPublicToken:
      true,

    protectedRouteKey:
      tokenContext.key,

    protectedInitialPublicPath:
      tokenContext.publicPath,
  };
}

function captureInitialUrl(reason = "main") {
  if (!isBrowser()) {
    return null;
  }

  const href =
    getCurrentHref();

  const publicPath =
    pathFromUrlLike(href) ||
    DEFAULT_ROUTE;

  const tokenPatch =
    preserveTokenRouteInitialUrls(href);

  const context = {
    version:
      MAIN_VERSION,

    source:
      MAIN_SOURCE,

    reason,

    href,

    initialUrl:
      href,

    pathname:
      window.location?.pathname || DEFAULT_ROUTE,

    search:
      window.location?.search || "",

    hash:
      window.location?.hash || "",

    publicPath,

    isPublicTokenRoute:
      Boolean(tokenPatch.isPublicTokenRoute),

    hasPublicToken:
      Boolean(tokenPatch.hasPublicToken),

    protectedRouteKey:
      tokenPatch.protectedRouteKey || "",

    protectedInitialPublicPath:
      tokenPatch.protectedInitialPublicPath || "",

    capturedAt:
      nowIso(),
  };

  writeRuntimeValue(
    INITIAL_URL_KEY,
    href,
    true
  );

  writeRuntimeValue(
    MAIN_BOOT_CONTEXT_KEY,
    context,
    false
  );

  /*
    Compartido con src/app/index.js/helpers.js.
    No sustituye el contexto rico de App, sólo aporta captura temprana.
  */
  writeRuntimeValue(
    APP_BOOT_CONTEXT_KEY,
    {
      ...(isObject(window[APP_BOOT_CONTEXT_KEY]) ? window[APP_BOOT_CONTEXT_KEY] : {}),
      mainInitialUrl:
        href,
      mainInitialPublicPath:
        publicPath,
      mainCapturedAt:
        context.capturedAt,
      ...tokenPatch,
    },
    false
  );

  patchCoreState({
    mainInitialUrl:
      href,

    mainInitialPath:
      context.pathname,

    mainInitialPublicPath:
      publicPath,

    mainInitialHash:
      context.hash,

    mainBootContextCapturedAt:
      context.capturedAt,

    mainIsPublicTokenRoute:
      Boolean(tokenPatch.isPublicTokenRoute),

    mainHasPublicToken:
      Boolean(tokenPatch.hasPublicToken),

    mainProtectedRouteKey:
      tokenPatch.protectedRouteKey || "",
  });

  state.lastBootContext =
    context;

  safeEmit(
    MAIN_EVENTS.initialUrlCaptured,
    {
      reason,
      bootContext:
        context,
    }
  );

  return context;
}

/* =========================================================
   DOM READY
========================================================= */

function waitForDomReady() {
  if (!isBrowser()) {
    return Promise.resolve();
  }

  try {
    if (
      document.readyState === "interactive" ||
      document.readyState === "complete"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const done = () => {
        try {
          document.removeEventListener(
            "DOMContentLoaded",
            done
          );
        } catch {}

        resolve();
      };

      document.addEventListener(
        "DOMContentLoaded",
        done,
        {
          once:
            true,
        }
      );
    });
  } catch {
    return Promise.resolve();
  }
}

function bindReady(callback) {
  if (state.readyBound) {
    return false;
  }

  state.readyBound =
    true;

  const runOnce = () => {
    if (state.readyCallbackCalled) {
      return;
    }

    state.readyCallbackCalled =
      true;

    try {
      callback();
    } catch (error) {
      void handleFatalError(
        error,
        "ready-callback"
      );
    }
  };

  /*
    No dependemos de AppCore.ready aquí porque AppCore se carga dinámicamente.
    El único contrato físico del main es DOM ready.
  */
  void waitForDomReady()
    .then(runOnce)
    .catch((error) => {
      void handleFatalError(
        error,
        "dom-ready"
      );
    });

  return true;
}

/* =========================================================
   RUNTIME MODULE LOADING
========================================================= */

function resolveAppFromModule(moduleRef = {}) {
  return (
    moduleRef?.App ||
    moduleRef?.default ||
    null
  );
}

function resolveCoreFromModule(moduleRef = {}) {
  return (
    moduleRef?.AppCore ||
    moduleRef?.default?.AppCore ||
    moduleRef?.default ||
    null
  );
}

async function loadRuntimeModules() {
  if (runtimeLoadPromise) {
    return runtimeLoadPromise;
  }

  state.runtimeLoadStartedAt =
    nowMs();

  safeEmit(
    MAIN_EVENTS.runtimeLoadStart,
    {
      at:
        nowIso(state.runtimeLoadStartedAt),
    }
  );

  runtimeLoadPromise =
    (async () => {
      try {
        disableLegacyAutoBoot();

        const [
          appModule,
          coreModule,
        ] =
          await Promise.all([
            import(APP_MODULE_PATH),
            import(CORE_MODULE_PATH),
          ]);

        App =
          resolveAppFromModule(appModule);

        AppCore =
          resolveCoreFromModule(coreModule);

        if (
          !App ||
          !isFunction(App.boot)
        ) {
          const error =
            new Error("App.boot no está disponible.");

          error.code =
            "APP_BOOT_MISSING";

          throw error;
        }

        state.runtimeLoaded =
          true;

        state.runtimeLoadSettledAt =
          nowMs();

        exposeDebugBridge();

        safeEmit(
          MAIN_EVENTS.runtimeLoadReady,
          {
            durationMs:
              state.runtimeLoadSettledAt -
              state.runtimeLoadStartedAt,

            hasApp:
              Boolean(App),

            hasAppBoot:
              Boolean(App?.boot),

            hasAppCore:
              Boolean(AppCore),
          }
        );

        return {
          App,
          AppCore,
        };
      } catch (error) {
        state.runtimeLoaded =
          false;

        state.runtimeLoadSettledAt =
          nowMs();

        state.lastError =
          error;

        safeEmit(
          MAIN_EVENTS.runtimeLoadError,
          {
            durationMs:
              state.runtimeLoadSettledAt -
              state.runtimeLoadStartedAt,

            error,
          }
        );

        throw error;
      }
    })();

  return runtimeLoadPromise;
}

/* =========================================================
   FATAL VIEW / EMERGENCY LOADER CLEANUP
========================================================= */

function emergencyHideLoader() {
  if (!isBrowser()) {
    return false;
  }

  const loader =
    byId("app-loader") ||
    query("[data-app-loader='true'],.app-loader");

  if (!loader) {
    return false;
  }

  try {
    loader.hidden =
      true;

    setAttr(
      loader,
      "aria-hidden",
      "true"
    );

    setAttr(
      loader,
      "aria-busy",
      "false"
    );

    setDataset(
      loader,
      "loaderVisible",
      "false"
    );

    setDataset(
      loader,
      "loaderState",
      "hidden"
    );

    removeClass(loader, "is-visible");
    removeClass(loader, "is-entering");
    removeClass(loader, "is-leaving");
    removeClass(loader, "loader-visible");

    addClass(loader, "is-hidden");
    addClass(loader, "has-hidden");
    addClass(loader, "loader-hidden");

    try {
      loader.style.display = "";
      loader.style.opacity = "";
      loader.style.visibility = "";
      loader.style.pointerEvents = "";
    } catch {}

    return true;
  } catch {
    return false;
  }
}

function getFatalRoot() {
  return (
    byId("view-container") ||
    byId("app-content") ||
    byId("main-content") ||
    byId("app-shell") ||
    getBody()
  );
}

function exposeFatalRoot(root) {
  if (!root) {
    return false;
  }

  try {
    root.hidden =
      false;

    setAttr(
      root,
      "aria-hidden",
      "false"
    );

    setAttr(
      root,
      "aria-busy",
      "false"
    );

    let parent =
      root.parentElement;

    while (parent) {
      parent.hidden =
        false;

      setAttr(
        parent,
        "aria-hidden",
        "false"
      );

      parent =
        parent.parentElement;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeBootError(error = null) {
  if (error instanceof Error) {
    return error;
  }

  const normalized =
    new Error(
      safeText(
        error?.message ||
          error?.reason ||
          error,
        DEFAULT_FATAL_MESSAGE
      )
    );

  try {
    normalized.raw =
      error;
  } catch {}

  return normalized;
}

function createActionButton({
  action = "",
  className = "ui-btn ui-btn-secondary",
  text = "",
} = {}) {
  return createElement("button", {
    className,
    text,
    attrs: {
      type:
        "button",
    },
    dataset: {
      mainFatalAction:
        action,
    },
  });
}

function createReloadButton() {
  const button =
    createActionButton({
      action:
        "reload",

      className:
        "ui-btn ui-btn-primary",

      text:
        "Recargar",
    });

  try {
    button.addEventListener(
      "click",
      () => {
        try {
          window.location.reload();
        } catch {}
      },
      {
        once:
          true,
      }
    );
  } catch {}

  return button;
}

function createDetailsButton(error) {
  const button =
    createActionButton({
      action:
        "details",

      className:
        "ui-btn ui-btn-secondary",

      text:
        "Detalles",
    });

  try {
    button.addEventListener(
      "click",
      () => {
        try {
          console.group("[Onion Support] Boot error details");
          console.error(error);
          console.groupEnd();
        } catch {}
      }
    );
  } catch {}

  return button;
}

function buildFatalBootNode(error = null) {
  const message =
    redactSensitiveText(
      safeText(
        error?.message,
        DEFAULT_FATAL_MESSAGE
      )
    );

  const section =
    createElement("section", {
      className:
        "content-wrapper boot-error-view",
      attrs: {
        role:
          "alert",
        "aria-live":
          "assertive",
        "aria-labelledby":
          "main-fatal-title",
      },
      dataset: {
        view:
          "main-fatal-boot",
        mainFatalBoot:
          "true",
      },
    });

  const card =
    createElement("div", {
      className:
        "panel-block boot-error-card",
      dataset: {
        mainFatalBootCard:
          "true",
      },
    });

  const inner =
    createElement("div", {
      className:
        "boot-error-card__inner",
    });

  const icon =
    createElement("div", {
      className:
        "boot-error-card__icon",
      text:
        "!",
      attrs: {
        "aria-hidden":
          "true",
      },
    });

  const header =
    createElement("div", {
      className:
        "boot-error-card__header",
    });

  const eyebrow =
    createElement("p", {
      className:
        "boot-error-card__eyebrow",
      text:
        "Onion Support",
    });

  const title =
    createElement("h1", {
      id:
        "main-fatal-title",
      className:
        "boot-error-card__title",
      text:
        DEFAULT_FATAL_TITLE,
    });

  const paragraph =
    createElement("p", {
      className:
        "boot-error-card__message",
      text:
        message,
    });

  const hint =
    createElement("p", {
      className:
        "boot-error-card__hint",
      text:
        "Recarga la página. Si el problema persiste, revisa la consola del navegador.",
    });

  header.appendChild(eyebrow);
  header.appendChild(title);
  header.appendChild(paragraph);
  header.appendChild(hint);

  const meta =
    createElement("div", {
      className:
        "boot-error-card__meta",
      dataset: {
        mainFatalBootMeta:
          "true",
      },
    });

  const codeRow =
    createElement("div", {
      className:
        "boot-error-card__meta-row",
    });

  codeRow.appendChild(
    createElement("strong", {
      text:
        "Código:",
    })
  );

  codeRow.appendChild(
    createElement("span", {
      text:
        safeText(
          error?.code ||
            error?.name,
          "MAIN_BOOT_ERROR"
        ),
    })
  );

  const dateRow =
    createElement("div", {
      className:
        "boot-error-card__meta-row",
    });

  dateRow.appendChild(
    createElement("strong", {
      text:
        "Fecha:",
    })
  );

  dateRow.appendChild(
    createElement("span", {
      text:
        nowIso(),
    })
  );

  meta.appendChild(codeRow);
  meta.appendChild(dateRow);

  const actions =
    createElement("div", {
      className:
        "boot-error-card__actions",
    });

  const reloadButton =
    createReloadButton();

  const detailsButton =
    createDetailsButton(error);

  actions.appendChild(reloadButton);
  actions.appendChild(detailsButton);

  inner.appendChild(icon);
  inner.appendChild(header);
  inner.appendChild(meta);
  inner.appendChild(actions);

  card.appendChild(inner);
  section.appendChild(card);

  return {
    root:
      section,

    focusTarget:
      reloadButton,
  };
}

function renderFatalBootError(error = null) {
  if (
    !isBrowser() ||
    state.fatalRendered
  ) {
    return false;
  }

  state.fatalRendered =
    true;

  const normalizedError =
    normalizeBootError(error);

  state.lastError =
    normalizedError;

  markDocumentFatal("boot-error");
  emergencyHideLoader();

  const root =
    getFatalRoot();

  if (!root) {
    return false;
  }

  exposeFatalRoot(root);
  clearNode(root);

  const {
    root: node,
    focusTarget,
  } =
    buildFatalBootNode(normalizedError);

  root.appendChild(node);

  try {
    focusTarget?.focus?.();
  } catch {}

  safeEmit(
    MAIN_EVENTS.fatalRendered,
    {
      message:
        normalizedError.message,
      error:
        normalizedError,
    }
  );

  return true;
}

async function handleFatalError(error = null, reason = "fatal") {
  const normalizedError =
    normalizeBootError(error);

  state.failed =
    true;

  state.settled =
    true;

  state.settledAt =
    nowMs();

  state.lastError =
    normalizedError;

  safeError(
    "Fallo fatal en main.",
    {
      reason,
      error:
        normalizedError,
    }
  );

  safeEmit(
    MAIN_EVENTS.bootError,
    {
      reason,

      durationMs:
        state.startedAt && state.settledAt
          ? state.settledAt - state.startedAt
          : 0,

      error:
        normalizedError,

      bootContext:
        state.lastBootContext,
    }
  );

  renderFatalBootError(
    normalizedError
  );

  return normalizedError;
}

/* =========================================================
   GLOBAL SAFETY NET
========================================================= */

function isResourceErrorEvent(event = null) {
  try {
    return Boolean(
      event?.target &&
        event.target !== window &&
        (
          event.target.src ||
          event.target.href
        )
    );
  } catch {
    return false;
  }
}

function bindGlobalSafetyNet() {
  if (
    !isBrowser() ||
    state.safetyNetBound
  ) {
    return false;
  }

  state.safetyNetBound =
    true;

  try {
    window.addEventListener(
      "error",
      (event) => {
        if (state.settled) {
          return;
        }

        if (isResourceErrorEvent(event)) {
          safeEmit(
            MAIN_EVENTS.globalError,
            {
              resource:
                true,
              message:
                "Resource load error",
              filename:
                redactSensitiveText(
                  event?.target?.src ||
                    event?.target?.href ||
                    ""
                ),
            }
          );

          return;
        }

        const error =
          event?.error ||
          event?.message ||
          null;

        safeEmit(
          MAIN_EVENTS.globalError,
          {
            message:
              event?.message || "Global error",
            filename:
              redactSensitiveText(event?.filename || ""),
            lineno:
              event?.lineno || 0,
            colno:
              event?.colno || 0,
            error,
          }
        );
      },
      true
    );
  } catch {}

  try {
    window.addEventListener(
      "unhandledrejection",
      (event) => {
        if (state.settled) {
          return;
        }

        const reason =
          event?.reason || null;

        safeEmit(
          MAIN_EVENTS.unhandledRejection,
          {
            message:
              safeText(
                reason?.message ||
                  reason,
                "Unhandled rejection"
              ),
            error:
              reason,
          }
        );

        /*
          Durante el arranque físico, una rejection sin capturar suele dejar
          la SPA en estado indefinido. La convertimos en fatal sólo antes
          de finalizar main.
        */
        void handleFatalError(
          reason,
          "unhandledrejection"
        );
      }
    );
  } catch {}

  return true;
}

/* =========================================================
   APP BOOT RESULT INSPECTION
========================================================= */

function getAppStateSafe() {
  try {
    if (isFunction(App?.getState)) {
      return App.getState();
    }
  } catch {}

  return null;
}

function appStateLooksFailed(appState = null) {
  const snapshot =
    safeObject(appState);

  if (!snapshot) {
    return false;
  }

  return Boolean(
    snapshot.failed === true ||
      snapshot.fatal === true ||
      snapshot.appFatal === true ||
      snapshot.booted === false &&
        (
          snapshot.lastBootErrorAt ||
          snapshot.lastBootError ||
          snapshot.bootPhase === "error" ||
          snapshot.bootPhase === "fatal"
        )
  );
}

/* =========================================================
   BOOT
========================================================= */

async function boot(options = {}) {
  const opts =
    safeObject(options);

  if (state.bootPromise) {
    return state.bootPromise;
  }

  if (
    state.started &&
    state.settled &&
    !state.failed &&
    opts.force !== true
  ) {
    return App;
  }

  state.started =
    true;

  state.settled =
    false;

  state.failed =
    false;

  state.fatalRendered =
    false;

  state.lastError =
    null;

  state.startedAt =
    nowMs();

  state.settledAt =
    0;

  disableLegacyAutoBoot();

  const context =
    captureInitialUrl("boot") ||
    state.lastBootContext ||
    {};

  markDocumentBooting("main-boot");

  safeEmit(
    MAIN_EVENTS.bootStart,
    {
      bootContext:
        context,

      readyState:
        isBrowser()
          ? document.readyState
          : "server",
    }
  );

  state.bootPromise =
    Promise.resolve()
      .then(async () => {
        await loadRuntimeModules();

        if (
          !App ||
          !isFunction(App.boot)
        ) {
          const error =
            new Error("App.boot no está disponible.");

          error.code =
            "APP_BOOT_MISSING";

          throw error;
        }

        safeLog(
          "Iniciando App.boot().",
          {
            bootContext:
              context,
          }
        );

        const result =
          await App.boot({
            source:
              MAIN_SOURCE,

            bootContext:
              context,

            ...opts,
          });

        const appState =
          getAppStateSafe();

        state.settled =
          true;

        state.failed =
          appStateLooksFailed(appState);

        state.settledAt =
          nowMs();

        if (state.failed) {
          markDocumentFatal("main-app-boot-failed");
        } else {
          markDocumentReady("main-boot-complete");
        }

        safeEmit(
          state.failed
            ? MAIN_EVENTS.bootError
            : MAIN_EVENTS.bootReady,
          {
            durationMs:
              state.settledAt -
              state.startedAt,

            bootContext:
              context,

            appState:
              appState || null,

            failed:
              state.failed,
          }
        );

        if (state.failed) {
          safeWarn(
            "App.boot() resolvió con estado no listo.",
            {
              appState,
            }
          );
        } else {
          safeLog(
            "Arranque completado.",
            {
              durationMs:
                state.settledAt -
                state.startedAt,
            }
          );
        }

        return result || App;
      })
      .catch(async (error) => {
        await handleFatalError(
          error,
          "boot"
        );

        throw normalizeBootError(error);
      })
      .finally(() => {
        state.bootPromise =
          null;
      });

  try {
    if (isBrowser()) {
      window[BOOT_LOCK_KEY] = {
        version:
          MAIN_VERSION,
        source:
          MAIN_SOURCE,
        promise:
          state.bootPromise,
        startedAt:
          state.startedAt,
      };
    }
  } catch {}

  return state.bootPromise;
}

function start(options = {}) {
  const opts =
    safeObject(options);

  if (
    state.startPromise &&
    opts.force !== true
  ) {
    return state.startPromise;
  }

  if (
    state.started &&
    state.bootPromise &&
    opts.force !== true
  ) {
    return state.bootPromise;
  }

  disableLegacyAutoBoot();
  bindGlobalSafetyNet();

  captureInitialUrl("start");
  markDocumentBooting("main-start");

  state.startPromise =
    new Promise((resolve, reject) => {
      bindReady(() => {
        void boot(opts)
          .then(resolve)
          .catch((error) => {
            /*
              handleFatalError() ya renderiza el estado fatal.
              Rechazamos para callers explícitos, pero el autoarranque
              captura abajo para evitar ruido extra.
            */
            reject(error);
          });
      });
    });

  state.startPromise
    .catch(() => {})
    .finally(() => {
      state.startPromise =
        null;
    });

  return state.startPromise;
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

function getMainSnapshot() {
  const html =
    getHtml();

  const body =
    getBody();

  const appState =
    getAppStateSafe();

  return sanitizePayload({
    version:
      MAIN_VERSION,

    started:
      state.started,

    settled:
      state.settled,

    failed:
      state.failed,

    runtimeLoaded:
      state.runtimeLoaded,

    hasStartPromise:
      Boolean(state.startPromise),

    hasBootPromise:
      Boolean(state.bootPromise),

    startedAt:
      state.startedAt,

    startedAtIso:
      state.startedAt
        ? nowIso(state.startedAt)
        : "",

    settledAt:
      state.settledAt,

    settledAtIso:
      state.settledAt
        ? nowIso(state.settledAt)
        : "",

    durationMs:
      state.startedAt && state.settledAt
        ? state.settledAt - state.startedAt
        : state.startedAt
          ? nowMs() - state.startedAt
          : 0,

    runtimeLoadStartedAt:
      state.runtimeLoadStartedAt,

    runtimeLoadSettledAt:
      state.runtimeLoadSettledAt,

    readyBound:
      state.readyBound,

    readyCallbackCalled:
      state.readyCallbackCalled,

    safetyNetBound:
      state.safetyNetBound,

    fatalRendered:
      state.fatalRendered,

    debugBridgeExposed:
      state.debugBridgeExposed,

    hasApp:
      Boolean(App),

    hasAppBoot:
      Boolean(App?.boot),

    hasAppCore:
      Boolean(AppCore),

    documentReadyState:
      isBrowser()
        ? document.readyState
        : "server",

    htmlClassName:
      html?.className || "",

    bodyClassName:
      body?.className || "",

    htmlDataset: {
      appState:
        html?.dataset?.appState || "",

      appLoading:
        html?.dataset?.appLoading || "",

      appBooting:
        html?.dataset?.appBooting || "",

      appReady:
        html?.dataset?.appReady || "",

      routeMode:
        html?.dataset?.routeMode || "",

      shellState:
        html?.dataset?.shellState || "",

      theme:
        html?.dataset?.theme || "",

      themeMode:
        html?.dataset?.themeMode || "",
    },

    bodyDataset: {
      appLoading:
        body?.dataset?.appLoading || "",

      authenticated:
        body?.dataset?.authenticated || "",

      routeMode:
        body?.dataset?.routeMode || "",

      shellState:
        body?.dataset?.shellState || "",
    },

    bootContext:
      state.lastBootContext,

    lastError:
      sanitizeError(state.lastError),

    appState,
  });
}

function exposeDebugBridge() {
  if (
    !isBrowser() ||
    state.debugBridgeExposed
  ) {
    return false;
  }

  try {
    window.OnionApp =
      window.OnionApp || {};

    window.OnionApp.main = {
      version:
        MAIN_VERSION,

      start,
      boot,

      loadRuntimeModules,

      captureInitialUrl,

      markDocumentBooting,
      markDocumentReady,
      markDocumentFatal,

      getState:
        getMainSnapshot,

      getSnapshot:
        getMainSnapshot,
    };

    window[RUNTIME_KEY] =
      window.OnionApp.main;

    state.debugBridgeExposed =
      true;

    safeEmit(
      MAIN_EVENTS.bridgeReady,
      {
        version:
          MAIN_VERSION,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FIRST TICK
========================================================= */

disableLegacyAutoBoot();
captureInitialUrl("module-load");
markDocumentBooting("module-load");
exposeDebugBridge();

safeEmit(
  MAIN_EVENTS.moduleLoaded,
  {
    version:
      MAIN_VERSION,

    readyState:
      isBrowser()
        ? document.readyState
        : "server",
  }
);

void start().catch(() => {
  /*
    handleFatalError() ya deja la UX fatal preparada.
    Se evita ruido adicional en consola por el autoarranque.
  */
});

/* =========================================================
   EXPORTS
========================================================= */

export {
  MAIN_VERSION,

  start,
  boot,

  loadRuntimeModules,

  captureInitialUrl,

  markDocumentBooting,
  markDocumentReady,
  markDocumentFatal,

  getMainSnapshot,
};

export default {
  MAIN_VERSION,

  start,
  boot,

  loadRuntimeModules,

  captureInitialUrl,

  markDocumentBooting,
  markDocumentReady,
  markDocumentFatal,

  getState:
    getMainSnapshot,

  getSnapshot:
    getMainSnapshot,
};

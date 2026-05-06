/* =========================================================
   Onion SPA - Entry Point
   Archivo: src/main.js

   RESPONSABILIDADES:
   - punto único de arranque de la SPA
   - mantener estado visual de boot desde el primer tick JS
   - capturar URL inicial antes de que el router normalice
   - preservar rutas públicas técnicas con token
   - sincronizar boot context con AppCore.state
   - esperar DOM ready de forma segura
   - boot idempotente
   - capturar errores fatales de arranque
   - integrar App + AppCore
   - no dejar loader pegado ante fallo fatal o timeout
   - exponer diagnóstico mínimo en window.OnionApp.main

   HARDENING EXTREMO:
   - una sola vía de arranque
   - anti doble boot / anti doble ready
   - CSP clean: sin innerHTML, sin estilos inline
   - fallback robusto si AppCore.ready falla/no existe
   - logs/eventos sin tokens reales
   - error fatal visible sin destruir seguridad
   - timeout de boot configurable
   - preservación activation/reset tokens antes del router
   - sync shell/main/view/loader segura
   - clases html/body coherentes:
     app-booting / app-loading / app-ready / app-fatal

   ALINEADO CON:
   - index.html con #app-loader estático
   - src/app/index.js
   - src/app/loader.js
   - src/css/core/loader.css
   - router/helpers.js + router/history.js + router/render.js
========================================================= */

import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

/* =========================================================
   STATE
========================================================= */

let bootStarted = false;
let bootSettled = false;
let bootFailed = false;
let bootPromise = null;

let startCalled = false;
let readyBound = false;
let readyCallbackCalled = false;
let fatalRendered = false;
let globalSafetyNetBound = false;
let debugBridgeExposed = false;

let bootStartedAt = 0;
let bootSettledAt = 0;
let lastBootContext = null;
let lastFatalError = null;

/* =========================================================
   CONSTANTS
========================================================= */

const MAIN_VERSION =
  "10.1.0";

const DEFAULT_BOOT_TIMEOUT_MS =
  45000;

const DEFAULT_FATAL_MESSAGE =
  "No se pudo iniciar la aplicación.";

const DEFAULT_FATAL_TITLE =
  "Error de arranque";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const INITIAL_URL_KEY =
  "__ONION_INITIAL_URL__";

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
  ]);

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

const PROTECTED_PUBLIC_ROUTES =
  Object.freeze([
    Object.freeze({
      key:
        "activation",

      path:
        ACTIVATION_PATH,

      bootIsKey:
        "bootIsActivation",

      bootHasKey:
        "bootHasActivationToken",

      bootUrlKey:
        "bootActivationInitialUrl",

      bootPathKey:
        "bootActivationInitialPath",

      windowKeys:
        Object.freeze([
          "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
        ]),

      tokenNames:
        ACTIVATION_TOKEN_PARAM_NAMES,

      scrubbedFlags:
        Object.freeze([
          "scrubbedActivationToken",
          "activationTokenScrubbed",
          "scrubbedActivateAccountToken",
          "scrubbedPublicTokenRoute",
          "scrubbedTokenRoute",
        ]),
    }),

    Object.freeze({
      key:
        "resetConfirm",

      path:
        RESET_CONFIRM_PATH,

      bootIsKey:
        "bootIsResetConfirm",

      bootHasKey:
        "bootHasResetToken",

      bootUrlKey:
        "bootResetConfirmInitialUrl",

      bootPathKey:
        "bootResetConfirmInitialPath",

      windowKeys:
        Object.freeze([
          "__ONION_RESET_CONFIRM_INITIAL_URL__",
          "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
        ]),

      tokenNames:
        RESET_TOKEN_PARAM_NAMES,

      scrubbedFlags:
        Object.freeze([
          "scrubbedResetToken",
          "resetTokenScrubbed",
          "scrubbedResetPasswordToken",
          "scrubbedResetConfirmToken",
          "scrubbedPasswordResetToken",
          "scrubbedPublicTokenRoute",
          "scrubbedTokenRoute",
        ]),
    }),
  ]);

const ROOT_STATE_CLASSES =
  Object.freeze([
    "app-booting",
    "app-loading",
    "app-ready",
    "app-fatal",
  ]);

const BODY_EXTRA_LOADING_CLASSES =
  Object.freeze([
    "loading",
  ]);

const MAIN_EVENTS =
  Object.freeze({
    initialUrlCaptured:
      "main:initial-url:capture",

    booting:
      "main:booting",

    ready:
      "main:ready",

    fatal:
      "main:fatal",

    bootStart:
      "main:boot:start",

    bootComplete:
      "main:boot:complete",

    bootError:
      "main:boot:error",

    bootFatalRendered:
      "main:boot:fatal-rendered",

    globalError:
      "main:boot:global-error",

    unhandledRejection:
      "main:boot:unhandled-rejection",

    loaderVisible:
      "main:loader:visible",

    loaderHidden:
      "main:loader:hidden",

    bridgeReady:
      "main:bridge:ready",
  });

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

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
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
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(normalized)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(normalized)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
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

function tryCall(fn, ...args) {
  try {
    if (isFunction(fn)) {
      return fn(...args);
    }
  } catch {}

  return undefined;
}

/* =========================================================
   TOKEN REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactTokenInText(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
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
  } catch {}

  return output;
}

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
      redactTokenInText(
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
      safeText(ctx.version, MAIN_VERSION),

    reason:
      safeText(ctx.reason, ""),

    href:
      redactTokenInText(ctx.href || ""),

    initialUrl:
      redactTokenInText(ctx.initialUrl || ""),

    publicPath:
      redactTokenInText(ctx.publicPath || ""),

    canonicalPath:
      redactTokenInText(ctx.canonicalPath || ""),

    hasProtectedToken:
      Boolean(ctx.hasProtectedToken),

    protectedRouteKey:
      safeText(ctx.protectedRouteKey, ""),

    protectedRoutePath:
      safeText(ctx.protectedRoutePath, ""),

    activationBoot:
      Boolean(ctx.activationBoot),

    resetConfirmBoot:
      Boolean(ctx.resetConfirmBoot),

    capturedProtected:
      Boolean(ctx.capturedProtected),

    synced:
      Boolean(ctx.synced),

    matchedProtectedRoutes:
      safeArray(ctx.matchedProtectedRoutes)
        .map((item) => ({
          key:
            safeText(item?.key, ""),
          path:
            safeText(item?.path, ""),
          scrubbed:
            Boolean(item?.scrubbed),
          matches:
            Boolean(item?.matches),
          hasToken:
            Boolean(item?.hasToken),
        })),

    capturedAt:
      safeText(ctx.capturedAt, ""),
  };
}

function sanitizePayload(payload = {}) {
  if (!isObject(payload)) {
    return payload;
  }

  const clean = {
    ...payload,
  };

  for (const key of [
    "href",
    "url",
    "path",
    "publicPath",
    "canonicalPath",
    "initialUrl",
    "activationInitialUrl",
    "resetConfirmInitialUrl",
    "redirectTo",
  ]) {
    if (clean[key]) {
      clean[key] =
        redactTokenInText(clean[key]);
    }
  }

  for (const key of [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
  ]) {
    if (key in clean) {
      clean[key] = null;
    }
  }

  if (clean.bootContext) {
    clean.bootContext =
      sanitizeBootContext(clean.bootContext);
  }

  if (clean.context) {
    clean.context =
      sanitizeBootContext(clean.context);
  }

  if (clean.error) {
    clean.error =
      sanitizeError(clean.error);
  }

  if (clean.appState) {
    clean.appState =
      sanitizeAppState(clean.appState);
  }

  return clean;
}

function sanitizeAppState(state = null) {
  if (!isObject(state)) {
    return state;
  }

  const clean = {
    ...state,
  };

  for (const key of [
    "bootInitialUrl",
    "bootProtectedInitialUrl",
    "bootActivationInitialUrl",
    "bootResetConfirmInitialUrl",
    "publicPath",
    "route",
  ]) {
    if (clean[key]) {
      clean[key] =
        redactTokenInText(clean[key]);
    }
  }

  return clean;
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[Main]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[Main]",
        ...args
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[Main]",
      ...args
    );
  } catch {}
}

function safeError(...args) {
  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[Main]",
        ...args
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.error(
      "[Main]",
      ...args
    );
  } catch {}
}

function safeEmit(name = "", payload = {}, options = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  const opts =
    safeObject(options);

  const cleanPayload =
    sanitizePayload(payload);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        eventName,
        cleanPayload
      );

      busEmitted = true;
    }
  } catch {}

  /*
    Evita duplicar AppCore.events + window.
    Window queda como fallback real o emisión forzada.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail:
            cleanPayload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   TIMING
========================================================= */

function nextFrame() {
  return new Promise((resolve) => {
    try {
      if (
        isBrowser() &&
        isFunction(window.requestAnimationFrame)
      ) {
        window.requestAnimationFrame(() => {
          resolve();
        });

        return;
      }
    } catch {}

    try {
      setTimeout(resolve, 0);
    } catch {
      resolve();
    }
  });
}

async function nextPaint() {
  await nextFrame();
  await nextFrame();
}

/* =========================================================
   URL / PATH HELPERS
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

  const segments =
    value.split("/");

  const normalizedSegments = [];

  for (const segment of segments) {
    if (
      !segment ||
      segment === "."
    ) {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  value =
    `/${normalizedSegments.join("/")}` || "/";

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
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
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function splitPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

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

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
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
      return normalizeHashRouterPath(
        parsed.hash
      );
    }

    return `${normalizePathnameOnly(
      parsed.pathname || "/"
    )}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex =
      raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash =
        raw.slice(hashIndex);

      if (isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }
    }

    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }
}

function stripSearchAndHash(path = "/") {
  const resolved =
    pathFromUrlLike(path) ||
    path ||
    "/";

  const {
    pathname,
  } =
    splitPath(resolved);

  return pathname || "/";
}

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

function getCurrentPublicPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return pathFromUrlLike(
      window.location.href || ""
    ) || "/";
  } catch {
    return "/";
  }
}

function isPathOrChild(path = "/", basePath = "/") {
  const clean =
    stripSearchAndHash(path);

  const base =
    normalizePathnameOnly(basePath);

  return (
    clean === base ||
    clean.startsWith(`${base}/`)
  );
}

/* =========================================================
   TOKEN DETECTION
========================================================= */

function getPathToken(path = "", basePath = "") {
  const clean =
    stripSearchAndHash(path);

  const base =
    normalizePathnameOnly(basePath);

  if (
    !base ||
    !clean.startsWith(`${base}/`)
  ) {
    return "";
  }

  const token =
    clean
      .slice(`${base}/`.length)
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

function hasTokenInSearch(search = "", tokenNames = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return safeArray(tokenNames)
      .some((name) => {
        return Boolean(
          safeText(
            params.get(name),
            ""
          )
        );
      });
  } catch {
    return false;
  }
}

function getHashQuery(hash = "") {
  const value =
    safeText(hash, "");

  if (
    !value ||
    !value.includes("?")
  ) {
    return "";
  }

  const query =
    value
      .split("?")
      .slice(1)
      .join("?");

  return query
    ? `?${query}`
    : "";
}

function hasProtectedRouteToken(value = "", routeConfig = null) {
  if (!routeConfig) {
    return false;
  }

  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const path =
    pathFromUrlLike(raw) || raw;

  if (
    isPathOrChild(path, routeConfig.path) &&
    getPathToken(path, routeConfig.path)
  ) {
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
        routeConfig.tokenNames
      )
    ) {
      return true;
    }

    const hashQuery =
      getHashQuery(parsed.hash);

    if (
      hashQuery &&
      hasTokenInSearch(
        hashQuery,
        routeConfig.tokenNames
      )
    ) {
      return true;
    }
  } catch {
    const split =
      splitPath(path);

    if (
      split.search &&
      hasTokenInSearch(
        split.search,
        routeConfig.tokenNames
      )
    ) {
      return true;
    }

    const hashQuery =
      getHashQuery(split.hash);

    if (
      hashQuery &&
      hasTokenInSearch(
        hashQuery,
        routeConfig.tokenNames
      )
    ) {
      return true;
    }
  }

  return false;
}

function isProtectedRouteScrubbed(routeConfig = null) {
  if (
    !isBrowser() ||
    !routeConfig
  ) {
    return false;
  }

  try {
    const state =
      window.history?.state || {};

    for (const flag of routeConfig.scrubbedFlags || []) {
      if (
        state?.[flag] === true ||
        state?.[flag] === routeConfig.key
      ) {
        return true;
      }
    }

    if (
      state.scrubbedPublicTokenRoute === routeConfig.key ||
      state.scrubbedTokenRoute === routeConfig.key
    ) {
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   BOOT CONTEXT
========================================================= */

function setWindowValueOnce(key = "", value = "") {
  if (
    !isBrowser() ||
    !key ||
    !value
  ) {
    return false;
  }

  try {
    if (!window[key]) {
      window[key] = value;
      return true;
    }

    return true;
  } catch {
    return false;
  }
}

function setWindowValue(key = "", value = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return false;
  }

  try {
    window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return "";
  }

  try {
    return safeText(
      window[key],
      ""
    );
  } catch {
    return "";
  }
}

function getProtectedStoredInitialUrls() {
  const values = [];

  for (const routeConfig of PROTECTED_PUBLIC_ROUTES) {
    for (const key of routeConfig.windowKeys || []) {
      const value =
        getWindowValue(key);

      if (value) {
        values.push(value);
      }
    }
  }

  return unique(values);
}

function buildBootContext(reason = "main") {
  const href =
    getCurrentHref();

  const currentPublicPath =
    pathFromUrlLike(href) ||
    getCurrentPublicPath() ||
    "/";

  const candidates =
    unique([
      href,
      getWindowValue(INITIAL_URL_KEY),
      ...getProtectedStoredInitialUrls(),
      currentPublicPath,
    ]);

  const matchedProtectedRoutes = [];

  let protectedRoute =
    null;

  let protectedSource =
    "";

  let protectedPublicPath =
    "";

  for (const candidate of candidates) {
    const candidatePath =
      pathFromUrlLike(candidate) ||
      candidate ||
      "/";

    for (const routeConfig of PROTECTED_PUBLIC_ROUTES) {
      const scrubbed =
        isProtectedRouteScrubbed(routeConfig);

      const matches =
        isPathOrChild(
          candidatePath,
          routeConfig.path
        );

      const hasToken =
        !scrubbed &&
        matches &&
        hasProtectedRouteToken(
          candidate,
          routeConfig
        );

      if (matches) {
        matchedProtectedRoutes.push({
          key:
            routeConfig.key,
          path:
            routeConfig.path,
          scrubbed,
          matches,
          hasToken,
          source:
            redactTokenInText(candidate),
        });
      }

      if (
        hasToken &&
        !protectedRoute
      ) {
        protectedRoute =
          routeConfig;

        protectedSource =
          candidate;

        protectedPublicPath =
          candidatePath;
      }
    }
  }

  const publicPath =
    protectedPublicPath ||
    currentPublicPath ||
    "/";

  const canonicalPath =
    stripSearchAndHash(publicPath);

  return {
    version:
      MAIN_VERSION,

    reason,

    href,
    initialUrl:
      href,

    publicPath,
    canonicalPath,

    hasProtectedToken:
      Boolean(protectedRoute),

    protectedRouteKey:
      protectedRoute?.key || "",

    protectedRoutePath:
      protectedRoute?.path || "",

    protectedSource,

    activationBoot:
      Boolean(
        protectedRoute?.key === "activation"
      ),

    resetConfirmBoot:
      Boolean(
        protectedRoute?.key === "resetConfirm"
      ),

    matchedProtectedRoutes:
      matchedProtectedRoutes.map((item) => ({
        key:
          item.key,
        path:
          item.path,
        scrubbed:
          item.scrubbed,
        matches:
          item.matches,
        hasToken:
          item.hasToken,
      })),

    capturedAt:
      nowIso(),
  };
}

function writeProtectedWindowKeys(context = {}) {
  if (!isBrowser()) {
    return false;
  }

  let captured =
    false;

  const source =
    safeText(
      context.protectedSource ||
        context.href,
      ""
    );

  if (!source) {
    return false;
  }

  for (const routeConfig of PROTECTED_PUBLIC_ROUTES) {
    const active =
      context.protectedRouteKey === routeConfig.key;

    if (!active) {
      continue;
    }

    for (const key of routeConfig.windowKeys) {
      captured =
        setWindowValueOnce(
          key,
          source
        ) || captured;
    }
  }

  return captured;
}

function markCoreBootPhase(phase = "booting", extras = {}) {
  const isBooting =
    phase === "booting";

  const isReady =
    phase === "ready";

  const isFatal =
    phase === "fatal";

  const payload = {
    booting:
      isBooting,

    loading:
      isBooting,

    booted:
      isReady,

    ready:
      isReady,

    appReady:
      isReady,

    appFatal:
      isFatal,

    bootPhase:
      phase,

    mainPhase:
      phase,

    mainUpdatedAt:
      nowIso(),

    ...safeObject(extras),
  };

  try {
    AppCore?.setState?.(payload);
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        payload
      );
    }
  } catch {}

  return payload;
}

function syncBootContextToAppCore(context = {}) {
  const ctx =
    safeObject(context);

  const patch = {
    bootInitialUrl:
      ctx.href || "",

    bootInitialPath:
      ctx.publicPath || "/",

    bootCanonicalPath:
      ctx.canonicalPath || "/",

    bootProtectedInitialUrl:
      ctx.hasProtectedToken
        ? ctx.protectedSource || ctx.href || ""
        : "",

    bootProtectedInitialPath:
      ctx.hasProtectedToken
        ? ctx.publicPath || "/"
        : "",

    bootProtectedRouteKey:
      ctx.protectedRouteKey || "",

    bootHasProtectedToken:
      Boolean(ctx.hasProtectedToken),

    bootCapturedAt:
      ctx.capturedAt || nowIso(),

    mainVersion:
      MAIN_VERSION,
  };

  for (const routeConfig of PROTECTED_PUBLIC_ROUTES) {
    const isActive =
      ctx.protectedRouteKey === routeConfig.key &&
      ctx.hasProtectedToken;

    patch[routeConfig.bootIsKey] =
      Boolean(isActive);

    patch[routeConfig.bootHasKey] =
      Boolean(isActive);

    patch[routeConfig.bootUrlKey] =
      isActive
        ? ctx.protectedSource || ctx.href || ""
        : getWindowValue(routeConfig.windowKeys[0]) || "";

    patch[routeConfig.bootPathKey] =
      isActive
        ? ctx.publicPath || "/"
        : "";
  }

  try {
    AppCore?.setState?.(patch);
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
    }
  } catch {}

  return patch;
}

function captureInitialUrl(reason = "main") {
  if (!isBrowser()) {
    return null;
  }

  try {
    const context =
      buildBootContext(reason);

    setWindowValueOnce(
      INITIAL_URL_KEY,
      context.href
    );

    /*
      Si ya hay una URL inicial protegida capturada, no se pisa.
      Si estamos justo en la URL protegida con token, se conserva antes del Router.
    */
    const capturedProtected =
      writeProtectedWindowKeys(context);

    const syncedPatch =
      syncBootContextToAppCore(context);

    lastBootContext = {
      ...context,
      capturedProtected,
      synced:
        Boolean(syncedPatch),
    };

    safeEmit(
      MAIN_EVENTS.initialUrlCaptured,
      {
        reason,
        bootContext:
          lastBootContext,
      }
    );

    return lastBootContext;
  } catch (error) {
    safeWarn(
      "No se pudo capturar URL inicial.",
      error
    );

    return null;
  }
}

/* =========================================================
   DOM RESOLUTION
========================================================= */

function qs(selector = "") {
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

function getHtml() {
  if (!isBrowser()) {
    return null;
  }

  return document.documentElement || null;
}

function getBody() {
  if (!isBrowser()) {
    return null;
  }

  return document.body || null;
}

function getShellElement() {
  return (
    byId("app-shell") ||
    qs("[data-app-shell='true']") ||
    qs("[data-app-shell]") ||
    qs(".app-shell")
  );
}

function getMainElement() {
  return (
    byId("main-content") ||
    qs("[data-main-content='true']") ||
    qs("[data-main-content]") ||
    qs("main.main-content") ||
    qs("main")
  );
}

function getViewElement() {
  return (
    byId("view-container") ||
    qs("[data-view-root='true']") ||
    qs("[data-view-root]") ||
    qs("[data-router-view='true']") ||
    qs("[data-router-view]")
  );
}

function getLoaderElement() {
  return (
    byId("app-loader") ||
    qs("[data-app-loader='true']") ||
    qs("[data-app-loader]") ||
    qs(".app-loader")
  );
}

/* =========================================================
   DOM MUTATORS
========================================================= */

function addClass(el, className) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.add(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(el, className) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.remove(className);
    return true;
  } catch {
    return false;
  }
}

function setAttr(el, name, value) {
  if (
    !el ||
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
      el.removeAttribute(name);
    } else {
      el.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {
    return false;
  }
}

function setDataset(el, key, value) {
  if (
    !el ||
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
      delete el.dataset[key];
    } else {
      el.dataset[key] =
        String(value);
    }

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

function createElement(tag, {
  className = "",
  text = "",
  attrs = {},
} = {}) {
  const el =
    document.createElement(tag);

  if (className) {
    el.className = className;
  }

  if (text) {
    el.textContent = text;
  }

  Object.entries(
    safeObject(attrs)
  ).forEach(([key, value]) => {
    setAttr(
      el,
      key,
      value
    );
  });

  return el;
}

function setRootStateClasses(state = "booting") {
  const html =
    getHtml();

  const body =
    getBody();

  const isBooting =
    state === "booting";

  const isReady =
    state === "ready";

  const isFatal =
    state === "fatal";

  for (const className of ROOT_STATE_CLASSES) {
    removeClass(html, className);
    removeClass(body, className);
  }

  for (const className of BODY_EXTRA_LOADING_CLASSES) {
    removeClass(body, className);
  }

  if (isBooting) {
    addClass(html, "app-booting");
    addClass(html, "app-loading");

    addClass(body, "app-booting");
    addClass(body, "app-loading");
    addClass(body, "loading");
  }

  if (isReady) {
    addClass(html, "app-ready");
    addClass(body, "app-ready");
  }

  if (isFatal) {
    addClass(html, "app-fatal");
    addClass(body, "app-fatal");
  }

  return {
    html,
    body,
  };
}

function syncShellState(state = "booting", reason = "main") {
  const shell =
    getShellElement();

  const main =
    getMainElement();

  const view =
    getViewElement();

  const isBooting =
    state === "booting";

  const isReady =
    state === "ready";

  const isFatal =
    state === "fatal";

  for (const el of [
    shell,
    main,
    view,
  ]) {
    if (!el) {
      continue;
    }

    setAttr(
      el,
      "aria-busy",
      isBooting ? "true" : "false"
    );

    setDataset(
      el,
      "routeMode",
      isBooting
        ? "boot"
        : isFatal
          ? "fatal"
          : "app"
    );

    setDataset(
      el,
      "bootReason",
      reason
    );
  }

  if (shell) {
    shell.hidden = false;

    setAttr(
      shell,
      "aria-hidden",
      "false"
    );

    setDataset(
      shell,
      "shell",
      isBooting
        ? "booting"
        : isFatal
          ? "fatal"
          : "ready"
    );

    setDataset(
      shell,
      "shellState",
      isBooting
        ? "booting"
        : isFatal
          ? "fatal"
          : "ready"
    );
  }

  if (main) {
    main.hidden = false;

    setAttr(
      main,
      "aria-hidden",
      "false"
    );
  }

  if (view) {
    view.hidden = false;

    setAttr(
      view,
      "aria-hidden",
      "false"
    );

    setAttr(
      view,
      "aria-live",
      isFatal
        ? "assertive"
        : "polite"
    );
  }

  return {
    shell:
      Boolean(shell),
    main:
      Boolean(main),
    view:
      Boolean(view),
    isBooting,
    isReady,
    isFatal,
  };
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function markDocumentBooting(reason = "main") {
  const {
    html,
    body,
  } =
    setRootStateClasses("booting");

  setDataset(
    html,
    "appLoading",
    "true"
  );

  setDataset(
    body,
    "appLoading",
    "true"
  );

  setDataset(
    html,
    "routeMode",
    "boot"
  );

  setDataset(
    body,
    "routeMode",
    "boot"
  );

  setDataset(
    body,
    "bootReason",
    reason
  );

  markCoreBootPhase(
    "booting",
    {
      mainReason:
        reason,
    }
  );

  syncShellState(
    "booting",
    reason
  );

  safeEmit(
    MAIN_EVENTS.booting,
    {
      reason,
    }
  );
}

function markDocumentReady(reason = "boot-complete") {
  const {
    html,
    body,
  } =
    setRootStateClasses("ready");

  setDataset(
    html,
    "appLoading",
    "false"
  );

  setDataset(
    body,
    "appLoading",
    "false"
  );

  setDataset(
    html,
    "routeMode",
    "app"
  );

  setDataset(
    body,
    "routeMode",
    "app"
  );

  setDataset(
    body,
    "bootReason",
    reason
  );

  markCoreBootPhase(
    "ready",
    {
      mainReason:
        reason,
    }
  );

  syncShellState(
    "ready",
    reason
  );

  safeEmit(
    MAIN_EVENTS.ready,
    {
      reason,
    }
  );
}

function markDocumentFatal(reason = "boot-error") {
  const {
    html,
    body,
  } =
    setRootStateClasses("fatal");

  setDataset(
    html,
    "appLoading",
    "false"
  );

  setDataset(
    body,
    "appLoading",
    "false"
  );

  setDataset(
    html,
    "routeMode",
    "fatal"
  );

  setDataset(
    body,
    "routeMode",
    "fatal"
  );

  setDataset(
    body,
    "bootReason",
    reason
  );

  markCoreBootPhase(
    "fatal",
    {
      mainReason:
        reason,
      lastFatalError:
        sanitizeError(lastFatalError),
    }
  );

  syncShellState(
    "fatal",
    reason
  );

  safeEmit(
    MAIN_EVENTS.fatal,
    {
      reason,
    }
  );
}

/* =========================================================
   LOADER FALLBACK OPS
========================================================= */

function ensureStaticLoaderVisible(reason = "main") {
  const loader =
    getLoaderElement();

  if (!loader) {
    return false;
  }

  try {
    loader.hidden = false;
    loader.removeAttribute("hidden");

    setAttr(
      loader,
      "aria-hidden",
      "false"
    );

    setAttr(
      loader,
      "aria-busy",
      "true"
    );

    setDataset(
      loader,
      "loaderVisible",
      "true"
    );

    setDataset(
      loader,
      "loaderState",
      "visible"
    );

    setDataset(
      loader,
      "loaderReason",
      reason
    );

    removeClass(
      loader,
      "is-hidden"
    );

    removeClass(
      loader,
      "has-hidden"
    );

    removeClass(
      loader,
      "is-leaving"
    );

    addClass(
      loader,
      "is-visible"
    );

    safeEmit(
      MAIN_EVENTS.loaderVisible,
      {
        reason,
      }
    );

    return true;
  } catch {
    return false;
  }
}

function forceHideStaticLoader(reason = "main") {
  const loader =
    getLoaderElement();

  if (!loader) {
    return false;
  }

  try {
    loader.hidden = true;

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

    setDataset(
      loader,
      "loaderReason",
      reason
    );

    removeClass(
      loader,
      "is-visible"
    );

    removeClass(
      loader,
      "is-leaving"
    );

    addClass(
      loader,
      "is-hidden"
    );

    addClass(
      loader,
      "has-hidden"
    );

    safeEmit(
      MAIN_EVENTS.loaderHidden,
      {
        reason,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FATAL ERROR VIEW
========================================================= */

function createReloadButton() {
  const button =
    createElement("button", {
      className:
        "fatal-boot-button",
      text:
        "Recargar",
      attrs: {
        type:
          "button",
      },
    });

  try {
    button.addEventListener(
      "click",
      () => {
        try {
          window.location.reload();
        } catch {}
      }
    );
  } catch {}

  return button;
}

function createDetailsButton(error) {
  const button =
    createElement("button", {
      className:
        "fatal-boot-button fatal-boot-button-secondary",
      text:
        "Detalles",
      attrs: {
        type:
          "button",
      },
    });

  try {
    button.addEventListener(
      "click",
      () => {
        try {
          console.group(
            "[Main] Boot fatal details"
          );

          console.error(error);

          console.groupEnd();
        } catch {}
      }
    );
  } catch {}

  return button;
}

function exposeFatalRoot(root) {
  if (!root) {
    return false;
  }

  try {
    root.hidden = false;
    root.removeAttribute("hidden");

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
  } catch {}

  try {
    let node =
      root.parentElement;

    while (node) {
      node.hidden = false;

      setAttr(
        node,
        "aria-hidden",
        "false"
      );

      node =
        node.parentElement;
    }
  } catch {}

  return true;
}

function getFatalRoot() {
  return (
    getViewElement() ||
    byId("app-content") ||
    getMainElement() ||
    getShellElement() ||
    getBody()
  );
}

function normalizeBootError(error) {
  if (error instanceof Error) {
    return error;
  }

  const message =
    safeText(
      error?.message ||
        error?.reason ||
        error,
      DEFAULT_FATAL_MESSAGE
    );

  const normalized =
    new Error(message);

  try {
    normalized.raw =
      error;
  } catch {}

  return normalized;
}

function showFatalBootError(error) {
  if (
    !isBrowser() ||
    fatalRendered
  ) {
    return false;
  }

  fatalRendered = true;

  try {
    const normalizedError =
      normalizeBootError(error);

    lastFatalError =
      normalizedError;

    markDocumentFatal("boot-error");
    forceHideStaticLoader("boot-error");

    const root =
      getFatalRoot();

    if (!root) {
      return false;
    }

    exposeFatalRoot(root);
    clearNode(root);

    const message =
      redactTokenInText(
        safeText(
          normalizedError?.message,
          DEFAULT_FATAL_MESSAGE
        )
      );

    const section =
      createElement("section", {
        className:
          "fatal-boot",
        attrs: {
          role:
            "alert",
          "aria-live":
            "assertive",
          "data-fatal-boot":
            "true",
        },
      });

    const card =
      createElement("div", {
        className:
          "fatal-boot-card",
      });

    const eyebrow =
      createElement("p", {
        className:
          "fatal-boot-eyebrow",
        text:
          "Onion Support",
      });

    const title =
      createElement("h1", {
        className:
          "fatal-boot-title",
        text:
          DEFAULT_FATAL_TITLE,
      });

    const paragraph =
      createElement("p", {
        className:
          "fatal-boot-message",
        text:
          message,
      });

    const hint =
      createElement("p", {
        className:
          "fatal-boot-hint",
        text:
          "Recarga la página. Si el problema persiste, revisa la consola del navegador.",
      });

    const actions =
      createElement("div", {
        className:
          "fatal-boot-actions",
      });

    actions.appendChild(
      createReloadButton()
    );

    actions.appendChild(
      createDetailsButton(
        normalizedError
      )
    );

    card.appendChild(eyebrow);
    card.appendChild(title);
    card.appendChild(paragraph);
    card.appendChild(hint);
    card.appendChild(actions);

    section.appendChild(card);
    root.appendChild(section);

    safeEmit(
      MAIN_EVENTS.bootFatalRendered,
      {
        message,
        error:
          normalizedError,
      }
    );

    return true;
  } catch (renderError) {
    safeError(
      "No se pudo renderizar fatal boot.",
      renderError
    );

    return false;
  }
}

/* =========================================================
   READY HANDLING
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

function callReadyCallbackOnce(callback) {
  if (readyCallbackCalled) {
    return;
  }

  readyCallbackCalled = true;

  void waitForDomReady()
    .then(() => {
      try {
        callback();
      } catch (error) {
        safeError(
          "Callback de ready falló.",
          error
        );

        showFatalBootError(error);
      }
    });
}

function bindReady(callback) {
  if (readyBound) {
    return;
  }

  readyBound = true;

  try {
    if (isFunction(AppCore?.ready)) {
      AppCore.ready(() => {
        callReadyCallbackOnce(callback);
      });

      return;
    }
  } catch (error) {
    safeWarn(
      "AppCore.ready falló. Usando DOMContentLoaded fallback.",
      error
    );
  }

  void waitForDomReady()
    .then(() => {
      callReadyCallbackOnce(callback);
    });
}

/* =========================================================
   BOOT TIMEOUT
========================================================= */

function getBootTimeoutMs() {
  const configured =
    safeNumber(
      AppCore?.config?.bootTimeoutMs ??
        AppCore?.config?.appBootTimeoutMs ??
        AppCore?.config?.startupTimeoutMs,
      DEFAULT_BOOT_TIMEOUT_MS
    );

  return Math.max(
    0,
    configured
  );
}

function createBootTimeoutPromise(timeoutMs = 0) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return {
      promise:
        new Promise(() => {}),

      clear() {},
    };
  }

  let timeoutId =
    null;

  const promise =
    new Promise((_, reject) => {
      timeoutId =
        setTimeout(() => {
          const error =
            new Error(
              `El arranque superó el límite de ${timeoutMs}ms.`
            );

          error.name =
            "BootTimeoutError";

          error.code =
            "BOOT_TIMEOUT";

          error.status =
            408;

          error.timeout =
            true;

          reject(error);
        }, timeoutMs);
    });

  return {
    promise,

    clear() {
      try {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      } catch {}

      timeoutId = null;
    },
  };
}

/* =========================================================
   APP BOOT EXECUTION
========================================================= */

async function executeAppBoot(context = {}) {
  if (
    !App ||
    !isFunction(App.boot)
  ) {
    const error =
      new Error(
        "App.boot no está disponible."
      );

    error.code =
      "APP_BOOT_MISSING";

    throw error;
  }

  /*
    JS permite argumentos extra. Pasamos bootContext para versiones futuras.
    Las versiones actuales que no lo usen lo ignorarán.
  */
  return App.boot({
    bootContext:
      context,
  });
}

/* =========================================================
   BOOT
========================================================= */

async function boot(options = {}) {
  if (
    bootStarted &&
    bootPromise
  ) {
    return bootPromise;
  }

  bootStarted =
    true;

  bootSettled =
    false;

  bootFailed =
    false;

  fatalRendered =
    false;

  lastFatalError =
    null;

  bootStartedAt =
    nowMs();

  bootSettledAt =
    0;

  const context =
    captureInitialUrl("boot-start") ||
    buildBootContext("boot-start");

  lastBootContext =
    context;

  markDocumentBooting("main-boot");
  ensureStaticLoaderVisible("main-boot");

  const timeoutMs =
    options.timeoutMs === undefined
      ? getBootTimeoutMs()
      : safeNumber(
          options.timeoutMs,
          getBootTimeoutMs()
        );

  const bootTimeout =
    createBootTimeoutPromise(
      timeoutMs
    );

  bootPromise =
    Promise.resolve()
      .then(async () => {
        safeLog(
          "Boot iniciando...",
          {
            timeoutMs,
            context:
              sanitizeBootContext(context),
          }
        );

        safeEmit(
          MAIN_EVENTS.bootStart,
          {
            readyState:
              isBrowser()
                ? document.readyState
                : "server",
            timeoutMs,
            bootContext:
              context,
          }
        );

        /*
          Primer frame con clases app-booting/app-loading aplicadas.
        */
        await nextFrame();

        const result =
          await Promise.race([
            executeAppBoot(context),
            bootTimeout.promise,
          ]);

        bootTimeout.clear();

        bootSettled =
          true;

        bootFailed =
          false;

        bootSettledAt =
          nowMs();

        /*
          Fallback final:
          App.boot() debería haber sincronizado loader/shell.
          Main remata clases globales y evita loader pegado.
        */
        await nextPaint();

        markDocumentReady(
          "main-boot-complete"
        );

        forceHideStaticLoader(
          "main-boot-complete"
        );

        safeEmit(
          MAIN_EVENTS.bootComplete,
          {
            durationMs:
              bootSettledAt - bootStartedAt,
            bootContext:
              context,
            appState:
              isFunction(App?.getState)
                ? App.getState()
                : null,
          }
        );

        safeLog(
          "Boot completado.",
          {
            durationMs:
              bootSettledAt - bootStartedAt,
          }
        );

        return result || App;
      })
      .catch((error) => {
        bootTimeout.clear();

        bootSettled =
          true;

        bootFailed =
          true;

        bootSettledAt =
          nowMs();

        const normalizedError =
          normalizeBootError(error);

        lastFatalError =
          normalizedError;

        safeError(
          "Fallo crítico en boot:",
          normalizedError
        );

        safeEmit(
          MAIN_EVENTS.bootError,
          {
            durationMs:
              bootSettledAt - bootStartedAt,
            message:
              safeText(
                normalizedError?.message,
                "Boot error"
              ),
            code:
              normalizedError?.code || null,
            timeout:
              Boolean(normalizedError?.timeout),
            error:
              normalizedError,
            bootContext:
              context,
          }
        );

        showFatalBootError(
          normalizedError
        );

        throw normalizedError;
      });

  return bootPromise;
}

/* =========================================================
   GLOBAL ERROR SAFETY NET
========================================================= */

function bindGlobalBootSafetyNet() {
  if (
    !isBrowser() ||
    globalSafetyNetBound
  ) {
    return;
  }

  globalSafetyNetBound =
    true;

  try {
    window.addEventListener(
      "error",
      (event) => {
        if (bootSettled) {
          return;
        }

        const error =
          event?.error ||
          event?.message ||
          null;

        safeError(
          "Error global durante boot:",
          error
        );

        safeEmit(
          MAIN_EVENTS.globalError,
          {
            message:
              safeText(
                event?.message,
                "Global error"
              ),
            filename:
              redactTokenInText(event?.filename || ""),
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
        if (bootSettled) {
          return;
        }

        const reason =
          event?.reason || null;

        safeError(
          "Promise rechazada durante boot:",
          reason
        );

        safeEmit(
          MAIN_EVENTS.unhandledRejection,
          {
            error:
              reason,
            message:
              safeText(
                reason?.message ||
                  reason,
                "Unhandled rejection"
              ),
          }
        );
      }
    );
  } catch {}
}

/* =========================================================
   START
========================================================= */

function start() {
  if (startCalled) {
    return;
  }

  startCalled =
    true;

  bindGlobalBootSafetyNet();

  bindReady(() => {
    captureInitialUrl("ready");

    markDocumentBooting("dom-ready");
    ensureStaticLoaderVisible("dom-ready");

    void boot().catch(() => {
      /*
        showFatalBootError ya se ejecuta dentro de boot().
        Evitamos un unhandled rejection adicional en arranque automático.
      */
    });
  });
}

/* =========================================================
   DEBUG SNAPSHOT
========================================================= */

function getMainSnapshot() {
  const loader =
    getLoaderElement();

  const shell =
    getShellElement();

  const main =
    getMainElement();

  const view =
    getViewElement();

  return {
    version:
      MAIN_VERSION,

    bootStarted,
    bootSettled,
    bootFailed,

    bootStartedAt,
    bootStartedAtIso:
      bootStartedAt
        ? nowIso(bootStartedAt)
        : "",

    bootSettledAt,
    bootSettledAtIso:
      bootSettledAt
        ? nowIso(bootSettledAt)
        : "",

    bootDurationMs:
      bootStartedAt && bootSettledAt
        ? bootSettledAt - bootStartedAt
        : bootStartedAt
          ? nowMs() - bootStartedAt
          : 0,

    startCalled,
    readyBound,
    readyCallbackCalled,

    hasBootPromise:
      Boolean(bootPromise),

    fatalRendered,
    lastFatalError:
      sanitizeError(lastFatalError),

    globalSafetyNetBound,
    debugBridgeExposed,

    bootTimeoutMs:
      getBootTimeoutMs(),

    documentReadyState:
      isBrowser()
        ? document.readyState
        : "server",

    htmlClassName:
      isBrowser()
        ? document.documentElement?.className || ""
        : "",

    bodyClassName:
      isBrowser()
        ? document.body?.className || ""
        : "",

    dom: {
      loaderExists:
        Boolean(loader),

      loaderHidden:
        Boolean(loader?.hidden),

      loaderVisible:
        loader?.dataset?.loaderVisible || null,

      loaderState:
        loader?.dataset?.loaderState || null,

      shellExists:
        Boolean(shell),

      shellHidden:
        Boolean(shell?.hidden),

      mainExists:
        Boolean(main),

      viewExists:
        Boolean(view),
    },

    urls: {
      initialUrl:
        isBrowser()
          ? redactTokenInText(
              window.__ONION_INITIAL_URL__ || ""
            ) || null
          : null,

      activationInitialUrl:
        isBrowser()
          ? redactTokenInText(
              window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ || ""
            ) || null
          : null,

      resetConfirmInitialUrl:
        isBrowser()
          ? redactTokenInText(
              window.__ONION_RESET_CONFIRM_INITIAL_URL__ ||
              window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ ||
              ""
            ) || null
          : null,
    },

    bootContext:
      lastBootContext
        ? sanitizeBootContext(lastBootContext)
        : null,

    appState:
      isFunction(App?.getState)
        ? sanitizeAppState(App.getState())
        : null,
  };
}

/* =========================================================
   DEBUG BRIDGE
========================================================= */

function exposeDebugBridge() {
  if (
    !isBrowser() ||
    debugBridgeExposed
  ) {
    return false;
  }

  try {
    window.OnionApp =
      window.OnionApp || {};

    window.OnionApp.main = {
      version:
        MAIN_VERSION,

      boot,
      start,

      captureInitialUrl,

      markDocumentBooting,
      markDocumentReady,
      markDocumentFatal,

      ensureStaticLoaderVisible,
      forceHideStaticLoader,

      getBootContext() {
        return lastBootContext
          ? sanitizeBootContext(lastBootContext)
          : null;
      },

      getState:
        getMainSnapshot,

      getSnapshot:
        getMainSnapshot,
    };

    debugBridgeExposed =
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

captureInitialUrl("module-load");
markDocumentBooting("module-load");
ensureStaticLoaderVisible("module-load");
exposeDebugBridge();
start();

/* =========================================================
   EXPORT
========================================================= */

export {
  MAIN_VERSION,

  boot,
  start,

  captureInitialUrl,

  markDocumentBooting,
  markDocumentReady,
  markDocumentFatal,

  ensureStaticLoaderVisible,
  forceHideStaticLoader,

  getMainSnapshot,
};

export default {
  MAIN_VERSION,

  boot,
  start,

  captureInitialUrl,

  markDocumentBooting,
  markDocumentReady,
  markDocumentFatal,

  ensureStaticLoaderVisible,
  forceHideStaticLoader,

  getMainSnapshot,
};

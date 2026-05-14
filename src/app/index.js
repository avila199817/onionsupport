/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: /src/app/index.js

   ONION SUPPORT · APP BOOTSTRAP
   PRIVATE SPA · ROUTER SAFE · TOKEN ROUTES SAFE · 10/10

   RESPONSABILIDADES:
   - Bootstrap lógico de Onion SPA.
   - Configurar Core, servicios, Store, I18n, UI y Router.
   - Preservar rutas públicas técnicas con token durante el boot.
   - Restaurar sesión sin romper activation/reset-password.
   - Render inicial robusto.
   - Evitar doble render si restore ya navegó.
   - Controlar loader mediante src/app/loader.js.
   - Emitir app:ready una sola vez.
   - Montar SidebarUI/TopbarUI una sola vez.
   - Sin autoarranque: /src/main.js es el único dueño del arranque físico.
   - Sin CSS inline.
   - Sin estilos inyectados.
   - Sin montajes duplicados.
   - Sin responsabilidades duplicadas con main.js ni loader.js.

   EXTREME MODE:
   - Boot idempotente por ciclo.
   - Control de race conditions entre boot/reboot.
   - Preservación fuerte de rutas públicas con token.
   - Registro bridge de módulos sin duplicados.
   - AppCore.Router/AppCore.router como propiedades directas.
   - Registro canónico de módulos con aliases.
   - UI firebreak contra eventos recursivos.
   - Throttle para reparación UI y sync de usuario.
   - Loader con mínimo visible + failsafe.
   - Sanitización profunda de logs/eventos.
   - Eventos de diagnóstico sin exponer tokens.
   - Tolerancia a módulos legacy/faltantes.
========================================================= */

import { AppCore } from "../core/index.js";
import { Store } from "../store/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";
import { Http } from "../services/index.js";

import { SidebarUI } from "../ui/sidebar/index.js";
import { TopbarUI } from "../ui/topbar/index.js";
import { Toast } from "../ui/toast/index.js";
import { I18n } from "../i18n/index.js";

import {
  ensureScope,
  clearScope,
  getCurrentPublicPath,
  getCurrentCanonicalPath,
} from "./helpers.js";

import {
  showLoader,
  hideLoader,
  forceHideLoader,
  prepareBootLoader,
  armBootFailsafeLoader,
  clearBootFailsafeTimer,
  getLoaderSnapshot,
} from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,
} from "./shell.js";

import {
  BOOT_PHASES,
  markAppBootState,
  markStoreBootState,
  markBootStart,
  markBootReady,
  markBootError,
  markRebootState,
} from "./boot-state.js";

import {
  syncLangState,
  initI18n,
  rerenderCurrentRoute,
} from "./i18n.js";

import {
  initUISystems,
  syncUserUI as syncAppUserUI,
  repairUISystems as repairAppUISystems,
} from "./ui.js";

import {
  configureRouter,
  bindRouter,
  renderInitialRoute,
} from "./router.js";

import { warmup } from "./warmup.js";

import {
  restoreSessionInBackground,
} from "./session.js";

import {
  renderBootError,
  bindGlobalErrorHandlers,
} from "./errors.js";

import {
  bindAppEvents,
} from "./events.js";

import {
  APP_SCOPE,
  APP_SCOPES,
  APP_EVENTS,
  ROUTER_EVENTS,
  AUTH_EVENTS,
  BOOT_CONSTANTS,
  APP_RUNTIME_KEYS,
  APP_STATE_KEYS,
  DEFAULT_ROUTE,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  GENERIC_SENSITIVE_PARAM_NAMES,
  UI_REPAIR_REASONS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const APP_BOOTSTRAP_VERSION = "15.0.0-extreme-pro";
const BOOT_SOURCE = "app:index";

const DEFAULT_SCOPE =
  APP_SCOPES?.boot ||
  APP_SCOPE ||
  "app:boot";

const RUNTIME_KEYS = Object.freeze({
  initialUrl:
    APP_RUNTIME_KEYS?.initialUrl ||
    "__ONION_INITIAL_URL__",

  bootContext:
    APP_RUNTIME_KEYS?.bootContext ||
    "__ONION_BOOT_CONTEXT__",

  appApi:
    APP_RUNTIME_KEYS?.appApi ||
    "__ONION_APP__",

  bootSnapshot:
    APP_RUNTIME_KEYS?.bootSnapshot ||
    "__ONION_BOOT_SNAPSHOT__",

  lastReadyAt:
    APP_RUNTIME_KEYS?.lastReadyAt ||
    "__ONION_APP_LAST_READY_AT__",
});

const BOOT_EVENTS = Object.freeze({
  start:
    APP_EVENTS?.bootStart ||
    "app:boot:start",

  state:
    APP_EVENTS?.bootState ||
    "app:boot:state",

  step:
    APP_EVENTS?.bootStep ||
    "app:boot:step",

  ready:
    APP_EVENTS?.bootReady ||
    "app:boot:ready",

  error:
    APP_EVENTS?.bootError ||
    "app:boot:error",

  loaderShow:
    APP_EVENTS?.bootLoaderShow ||
    "app:boot:loader:show",

  loaderHide:
    APP_EVENTS?.bootLoaderHide ||
    "app:boot:loader:hide",

  loaderForceHide:
    APP_EVENTS?.bootLoaderForceHide ||
    "app:boot:loader:force-hide",
});

const BOOT_PHASE_VALUE = Object.freeze({
  idle:
    BOOT_PHASES?.IDLE ||
    "idle",

  booting:
    BOOT_PHASES?.BOOTING ||
    "booting",

  ready:
    BOOT_PHASES?.READY ||
    "ready",

  error:
    BOOT_PHASES?.ERROR ||
    "error",
});

const MIN_BOOT_LOADER_MS =
  Math.max(
    0,
    Number(
      BOOT_CONSTANTS?.minLoaderVisibleMs ??
      500
    ) || 500
  );

const UI_REPAIR_THROTTLE_MS =
  Math.max(
    0,
    Number(
      BOOT_CONSTANTS?.uiRepairThrottleMs ??
      140
    ) || 140
  );

const UI_SYNC_THROTTLE_MS =
  Math.max(
    0,
    Number(
      BOOT_CONSTANTS?.uiSyncThrottleMs ??
      100
    ) || 100
  );

const BOOT_STEP_MAX_DURATION_MS =
  Math.max(
    0,
    Number(
      BOOT_CONSTANTS?.stepWarnMs ??
      2500
    ) || 2500
  );

const UI_REASON_MAX_LENGTH = 180;
const SANITIZE_MAX_DEPTH = 7;
const SANITIZE_MAX_ARRAY = 100;

const FALLBACK_PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: "/activate-account",

    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),

    stateUrlKey:
      APP_STATE_KEYS?.bootActivationInitialUrl ||
      "bootActivationInitialUrl",

    statePathKey:
      APP_STATE_KEYS?.bootActivationInitialPath ||
      "bootActivationInitialPath",

    statePublicPathKey:
      APP_STATE_KEYS?.bootActivationInitialPublicPath ||
      "bootActivationInitialPublicPath",

    stateIsRouteKey:
      APP_STATE_KEYS?.bootIsActivation ||
      "bootIsActivation",

    stateHasTokenKey:
      APP_STATE_KEYS?.bootHasActivationToken ||
      "bootHasActivationToken",

    scrubbedStateKeys: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
    ]),

    scrubbedHistoryKeys: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
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
    path: "/reset-password/confirm",

    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),

    stateUrlKey:
      APP_STATE_KEYS?.bootResetConfirmInitialUrl ||
      "bootResetConfirmInitialUrl",

    statePathKey:
      APP_STATE_KEYS?.bootResetConfirmInitialPath ||
      "bootResetConfirmInitialPath",

    statePublicPathKey:
      APP_STATE_KEYS?.bootResetConfirmInitialPublicPath ||
      "bootResetConfirmInitialPublicPath",

    stateIsRouteKey:
      APP_STATE_KEYS?.bootIsResetConfirm ||
      "bootIsResetConfirm",

    stateHasTokenKey:
      APP_STATE_KEYS?.bootHasResetToken ||
      "bootHasResetToken",

    scrubbedStateKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
    ]),

    scrubbedHistoryKeys: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
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

const PUBLIC_TOKEN_ROUTES =
  normalizeProtectedPublicTokenRoutes(
    Array.isArray(PROTECTED_PUBLIC_TOKEN_ROUTES) &&
    PROTECTED_PUBLIC_TOKEN_ROUTES.length
      ? PROTECTED_PUBLIC_TOKEN_ROUTES
      : FALLBACK_PROTECTED_PUBLIC_TOKEN_ROUTES
  );

const SENSITIVE_PARAM_NAMES =
  Array.isArray(GENERIC_SENSITIVE_PARAM_NAMES) &&
  GENERIC_SENSITIVE_PARAM_NAMES.length
    ? Object.freeze(
        Array.from(
          new Set(
            GENERIC_SENSITIVE_PARAM_NAMES
              .map((item) => safeText(item, ""))
              .filter(Boolean)
          )
        )
      )
    : Object.freeze([
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
        "authorization",
        "auth",
        "jwt",
        "session",
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

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nowEpochMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowEpochMs()) {
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

function wait(ms = 0) {
  return new Promise((resolve) => {
    try {
      setTimeout(
        resolve,
        Math.max(0, Number(ms) || 0)
      );
    } catch {
      resolve();
    }
  });
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    if (isFunction(window.requestAnimationFrame)) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          try {
            callback();
          } catch {}
        });
      });

      return;
    }
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

function safeCreateCustomEvent(name = "", detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  const eventName = safeText(name, "");

  if (!eventName) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(eventName, {
        detail,
      });
    }
  } catch {}

  try {
    const event = document.createEvent("CustomEvent");

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

function normalizeProtectedPublicTokenRoutes(routes = []) {
  const defaultsByKey = new Map(
    FALLBACK_PROTECTED_PUBLIC_TOKEN_ROUTES.map((item) => [
      item.key,
      item,
    ])
  );

  return Object.freeze(
    safeArray(routes)
      .map((item) => {
        const source = safeObject(item);
        const key = safeText(source.key, "");
        const fallback = defaultsByKey.get(key) || {};

        const path = normalizePathnameOnly(
          source.path ||
            fallback.path ||
            DEFAULT_ROUTE ||
            "/"
        );

        return Object.freeze({
          ...fallback,
          ...source,

          key,
          path,

          windowKeys: Object.freeze(
            safeArray(source.windowKeys?.length ? source.windowKeys : fallback.windowKeys)
          ),

          scrubbedStateKeys: Object.freeze(
            safeArray(source.scrubbedStateKeys?.length ? source.scrubbedStateKeys : fallback.scrubbedStateKeys)
          ),

          scrubbedHistoryKeys: Object.freeze(
            safeArray(source.scrubbedHistoryKeys?.length ? source.scrubbedHistoryKeys : fallback.scrubbedHistoryKeys)
          ),

          tokenParamNames: Object.freeze(
            safeArray(source.tokenParamNames?.length ? source.tokenParamNames : fallback.tokenParamNames)
          ),
        });
      })
      .filter((item) => item.key && item.path)
  );
}

/* =========================================================
   PATH HELPERS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE || "/") {
  let value =
    safeText(pathname, DEFAULT_ROUTE || "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_ROUTE || "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE ||
      "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitFullPath(value = DEFAULT_ROUTE || "/") {
  const raw = safeText(value, DEFAULT_ROUTE || "/");

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname =
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE ||
      "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE ||
      "/";
  }

  return {
    pathname: normalizePathnameOnly(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE || "/";
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

function normalizeLocalFullPath(path = DEFAULT_ROUTE || "/") {
  const raw = safeText(path, DEFAULT_ROUTE || "/");

  if (!raw) {
    return DEFAULT_ROUTE || "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(raw, getBaseOrigin());

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeLocalFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || DEFAULT_ROUTE || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = DEFAULT_ROUTE || "/") {
  const normalized =
    normalizeLocalFullPath(path || DEFAULT_ROUTE || "/");

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE ||
    "/"
  );
}

function getBrowserHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(window.location.href, "");
  } catch {
    return "";
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE || "/";
  }

  try {
    const pathname =
      window.location.pathname ||
      DEFAULT_ROUTE ||
      "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizeLocalFullPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE || "/";
  }
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeLocalFullPath(
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizeLocalFullPath(
      `${parsed.pathname || DEFAULT_ROUTE || "/"}${parsed.search || ""}${parsed.hash || ""}`
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

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function redactTokenInText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_PARAM_NAMES) {
    try {
      const escapedName =
        String(name).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      output = output.replace(
        new RegExp(`([?&#]${escapedName}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const config of PUBLIC_TOKEN_ROUTES) {
    try {
      const escapedPath =
        safeText(config.path, "").replace(/\//g, "\\/");

      if (escapedPath) {
        output = output.replace(
          new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
      }
    } catch {}
  }

  try {
    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  try {
    output = output.replace(
      /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
      "$1$2***"
    );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
        value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
        value.nodeName
    );
  } catch {}

  return false;
}

function sanitizePayload(value, depth = 0) {
  if (depth > SANITIZE_MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isDomNodeLike(value)) {
    return {
      node: safeText(value.nodeName, "Node"),
      id: safeText(value.id, ""),
      className: safeText(
        value.className?.baseVal ||
          value.className,
        ""
      ),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, SANITIZE_MAX_ARRAY)
      .map((item) =>
        sanitizePayload(item, depth + 1)
      );
  }

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactTokenInText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      stack: value.stack
        ? redactTokenInText(value.stack)
        : "",
    };
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization|credential|session|jwt/i.test(key) &&
        item
      ) {
        output[key] = "***";
        continue;
      }

      output[key] = sanitizePayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   EARLY URL CAPTURE
========================================================= */

function getWindowValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return "";
  }

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function getWindowRawValue(key = "") {
  if (
    !isBrowser() ||
    !key
  ) {
    return null;
  }

  try {
    return window[key] ?? null;
  } catch {
    return null;
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

function setWindowValueIfEmpty(key = "", value = "") {
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
    }

    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  return getWindowValue(
    RUNTIME_KEYS.initialUrl
  );
}

function setInitialUrl(value = "") {
  return setWindowValueIfEmpty(
    RUNTIME_KEYS.initialUrl,
    value
  );
}

function getHistoryState() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return safeObject(window.history?.state);
  } catch {
    return {};
  }
}

function isTokenRouteScrubbed(config = null) {
  if (!config) {
    return false;
  }

  const historyState = getHistoryState();

  const keys = [
    ...safeArray(config.scrubbedStateKeys),
    ...safeArray(config.scrubbedHistoryKeys),
  ];

  for (const key of keys) {
    try {
      if (historyState[key]) {
        if (
          key === "scrubbedPublicTokenRoute" ||
          key === "scrubbedTokenRoute"
        ) {
          const value = safeText(historyState[key], "");

          if (
            !value ||
            value === config.key
          ) {
            return true;
          }

          continue;
        }

        return true;
      }
    } catch {}
  }

  return false;
}

function matchesRouteConfig(config, pathOrUrl = "") {
  if (!config?.path) {
    return false;
  }

  const path = pathFromUrlLike(pathOrUrl);
  const clean = stripSearchAndHash(path);

  return (
    clean === config.path ||
    clean.startsWith(`${config.path}/`)
  );
}

function getRouteConfigFromValue(value = "") {
  return (
    PUBLIC_TOKEN_ROUTES.find((config) =>
      matchesRouteConfig(config, value)
    ) || null
  );
}

function getPathToken(config = null, value = "") {
  if (!config?.path) {
    return "";
  }

  const path = pathFromUrlLike(value);
  const clean = stripSearchAndHash(path);

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

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");

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

function hasRouteToken(config = null, value = "") {
  if (!config) {
    return false;
  }

  const raw = safeText(value, "");

  if (!raw) {
    return false;
  }

  if (getPathToken(config, raw)) {
    return true;
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

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

      const hashParts = splitFullPath(hashPath);

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
    const normalized = normalizeLocalFullPath(raw);

    if (getPathToken(config, normalized)) {
      return true;
    }

    const parts = splitFullPath(normalized);

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

function getStoredInitialUrls(config = null) {
  if (!config) {
    return [];
  }

  return safeArray(config.windowKeys)
    .map((key) => getWindowValue(key))
    .filter(Boolean);
}

function setStoredInitialUrl(config = null, value = "") {
  if (
    !config ||
    !value ||
    isTokenRouteScrubbed(config)
  ) {
    return false;
  }

  let wrote = false;

  for (const key of safeArray(config.windowKeys)) {
    if (
      setWindowValueIfEmpty(
        key,
        value
      )
    ) {
      wrote = true;
    }
  }

  return wrote;
}

function resolveProtectedInitialContext(href = "") {
  const bootContextRaw =
    getWindowRawValue(RUNTIME_KEYS.bootContext);

  const bootContext =
    isObject(bootContextRaw)
      ? bootContextRaw
      : {};

  const candidates = [
    href,
    getInitialUrl(),
    bootContext.protectedInitialUrl,
    bootContext.activationInitialUrl,
    bootContext.resetConfirmInitialUrl,
    getBrowserPublicPath(),
    ...PUBLIC_TOKEN_ROUTES.flatMap((config) =>
      getStoredInitialUrls(config)
    ),
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const config = getRouteConfigFromValue(candidate);

    if (!config) {
      continue;
    }

    if (isTokenRouteScrubbed(config)) {
      continue;
    }

    if (!hasRouteToken(config, candidate)) {
      continue;
    }

    const path = pathFromUrlLike(candidate);

    return {
      config,
      key: config.key || "",
      url: candidate,
      path,
      publicPath: path,
      canonicalPath: stripSearchAndHash(path),
      hasToken: true,
      tokenInPath: Boolean(getPathToken(config, candidate)),
    };
  }

  return {
    config: null,
    key: "",
    url: "",
    path: "",
    publicPath: "",
    canonicalPath: "",
    hasToken: false,
    tokenInPath: false,
  };
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return {
      initialUrl: "",
      browserPublicPath: DEFAULT_ROUTE || "/",

      protectedInitialUrl: "",
      protectedInitialPath: "",
      protectedInitialPublicPath: "",
      isPublicTokenRoute: false,
      hasPublicToken: false,
      protectedRouteKey: "",

      activationInitialUrl: "",
      activationInitialPath: "",
      activationInitialPublicPath: "",
      isActivation: false,
      hasActivationToken: false,

      resetConfirmInitialUrl: "",
      resetConfirmInitialPath: "",
      resetConfirmInitialPublicPath: "",
      isResetConfirm: false,
      hasResetToken: false,
    };
  }

  const href = getBrowserHref();

  if (href) {
    setInitialUrl(href);

    for (const config of PUBLIC_TOKEN_ROUTES) {
      try {
        if (
          !isTokenRouteScrubbed(config) &&
          matchesRouteConfig(config, href) &&
          hasRouteToken(config, href) &&
          getStoredInitialUrls(config).length === 0
        ) {
          setStoredInitialUrl(config, href);
        }
      } catch {}
    }
  }

  const initialUrl = safeText(getInitialUrl(), href);
  const browserPublicPath = getBrowserPublicPath();
  const protectedContext = resolveProtectedInitialContext(href);

  const activationConfig =
    PUBLIC_TOKEN_ROUTES.find((config) =>
      config.key === "activation"
    ) || null;

  const resetConfig =
    PUBLIC_TOKEN_ROUTES.find((config) =>
      config.key === "resetConfirm"
    ) || null;

  const activationInitialUrl =
    !isTokenRouteScrubbed(activationConfig)
      ? safeText(
          getStoredInitialUrls(activationConfig)[0],
          ""
        )
      : "";

  const resetConfirmInitialUrl =
    !isTokenRouteScrubbed(resetConfig)
      ? safeText(
          getStoredInitialUrls(resetConfig)[0],
          ""
        )
      : "";

  const activationInitialPath =
    activationInitialUrl
      ? pathFromUrlLike(activationInitialUrl)
      : "";

  const resetConfirmInitialPath =
    resetConfirmInitialUrl
      ? pathFromUrlLike(resetConfirmInitialUrl)
      : "";

  const activationCandidate =
    protectedContext.url ||
    activationInitialUrl ||
    initialUrl ||
    href ||
    browserPublicPath;

  const resetCandidate =
    protectedContext.url ||
    resetConfirmInitialUrl ||
    initialUrl ||
    href ||
    browserPublicPath;

  const isActivation =
    Boolean(
      activationConfig &&
      matchesRouteConfig(
        activationConfig,
        activationCandidate
      )
    );

  const isResetConfirm =
    Boolean(
      resetConfig &&
      matchesRouteConfig(
        resetConfig,
        resetCandidate
      )
    );

  const hasActivationToken =
    Boolean(
      activationConfig &&
      !isTokenRouteScrubbed(activationConfig) &&
      hasRouteToken(
        activationConfig,
        activationInitialUrl ||
          initialUrl ||
          href ||
          browserPublicPath
      )
    );

  const hasResetToken =
    Boolean(
      resetConfig &&
      !isTokenRouteScrubbed(resetConfig) &&
      hasRouteToken(
        resetConfig,
        resetConfirmInitialUrl ||
          initialUrl ||
          href ||
          browserPublicPath
      )
    );

  const context = {
    initialUrl,
    browserPublicPath,

    protectedInitialUrl:
      protectedContext.url || "",

    protectedInitialPath:
      protectedContext.path || "",

    protectedInitialPublicPath:
      protectedContext.publicPath || "",

    isPublicTokenRoute:
      Boolean(protectedContext.config),

    hasPublicToken:
      Boolean(protectedContext.hasToken),

    protectedRouteKey:
      protectedContext.key || "",

    activationInitialUrl,
    activationInitialPath,

    activationInitialPublicPath:
      activationInitialPath || "",

    isActivation,
    hasActivationToken,

    resetConfirmInitialUrl,
    resetConfirmInitialPath,

    resetConfirmInitialPublicPath:
      resetConfirmInitialPath || "",

    isResetConfirm,
    hasResetToken,
  };

  setWindowValue(
    RUNTIME_KEYS.bootContext,
    context
  );

  return context;
}

function primeInitialUrlFromMainContext(mainContext = {}) {
  const ctx = safeObject(mainContext);

  const candidate =
    safeText(
      ctx.initialUrl ||
        ctx.href ||
        ctx.url ||
        "",
      ""
    );

  if (!candidate) {
    return false;
  }

  setInitialUrl(candidate);

  for (const config of PUBLIC_TOKEN_ROUTES) {
    try {
      if (
        !isTokenRouteScrubbed(config) &&
        matchesRouteConfig(config, candidate) &&
        hasRouteToken(config, candidate) &&
        getStoredInitialUrls(config).length === 0
      ) {
        setStoredInitialUrl(config, candidate);
      }
    } catch {}
  }

  return true;
}

function sanitizeBootContextForLog(context = {}) {
  const ctx = safeObject(context);

  return {
    initialUrl:
      redactTokenInText(ctx.initialUrl),

    browserPublicPath:
      redactTokenInText(ctx.browserPublicPath),

    protectedInitialUrl:
      redactTokenInText(ctx.protectedInitialUrl),

    protectedInitialPath:
      redactTokenInText(ctx.protectedInitialPath),

    protectedInitialPublicPath:
      redactTokenInText(ctx.protectedInitialPublicPath),

    isPublicTokenRoute:
      Boolean(ctx.isPublicTokenRoute),

    hasPublicToken:
      Boolean(ctx.hasPublicToken),

    protectedRouteKey:
      safeText(ctx.protectedRouteKey, ""),

    activationInitialUrl:
      redactTokenInText(ctx.activationInitialUrl),

    activationInitialPath:
      redactTokenInText(ctx.activationInitialPath),

    activationInitialPublicPath:
      redactTokenInText(ctx.activationInitialPublicPath),

    isActivation:
      Boolean(ctx.isActivation),

    hasActivationToken:
      Boolean(ctx.hasActivationToken),

    resetConfirmInitialUrl:
      redactTokenInText(ctx.resetConfirmInitialUrl),

    resetConfirmInitialPath:
      redactTokenInText(ctx.resetConfirmInitialPath),

    resetConfirmInitialPublicPath:
      redactTokenInText(ctx.resetConfirmInitialPublicPath),

    isResetConfirm:
      Boolean(ctx.isResetConfirm),

    hasResetToken:
      Boolean(ctx.hasResetToken),
  };
}

let BOOT_URL_CONTEXT = captureInitialUrl();

/* =========================================================
   APP SINGLETON
========================================================= */

export const App = (() => {
  "use strict";

  const bridgeRegistryCache = new Map();
  const bridgeConflictWarnings = new Set();

  const state = {
    version: APP_BOOTSTRAP_VERSION,

    booted: false,
    booting: false,

    servicesReady: false,
    storeReady: false,
    routerConfigured: false,
    routerBound: false,

    uiReady: false,
    uiMounted: false,

    readyEmitted: false,
    handlersBound: false,
    appEventsBound: false,
    uiRepairEventsBound: false,

    runtimeModulesExposed: false,
    runtimeModulesExposeCount: 0,

    bootPromise: null,
    restorePromise: null,

    bootCycleId: 0,
    finalizedCycleId: 0,

    loaderVisible: false,
    loaderShownAt: 0,

    bootFailsafeTimer: null,
    bootFailsafeStartedAt: 0,
    bootFailsafeTimeoutMs: 0,
    bootFailsafeArmId: 0,

    bootNavigationHandled: false,
    initialRouteRendered: false,

    lastBootStartedAt: 0,
    lastBootReadyAt: 0,
    lastBootErrorAt: 0,

    lastBootOptions: null,
    lastBootSteps: [],
    lastError: null,
  };

  let uiRepairRunning = false;
  let uiRepairScheduled = false;
  let uiRepairLastAt = 0;
  let uiRepairLastKey = "";

  let uiSyncRunning = false;
  let uiSyncLastAt = 0;
  let uiSyncLastReason = "";

  const boundWindowEvents = [];
  const boundBusEvents = [];

  /* =======================================================
     SAFE LOG / EMIT
  ======================================================= */

  function safeEmit(name, payload = {}, options = {}) {
    const eventName = safeText(name, "");

    if (!eventName) {
      return false;
    }

    const cleanPayload = sanitizePayload({
      source: BOOT_SOURCE,
      version: APP_BOOTSTRAP_VERSION,
      ...safeObject(payload),
    });

    const opts = safeObject(options);

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

    if (
      opts.window === true ||
      (!busAvailable && isBrowser())
    ) {
      try {
        const event = safeCreateCustomEvent(
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

  function safeLog(...args) {
    const safeArgs =
      args.map((item) => sanitizePayload(item));

    try {
      AppCore?.utils?.log?.("[App]", ...safeArgs);
      return;
    } catch {}

    try {
      console.log("[App]", ...safeArgs);
    } catch {}
  }

  function safeWarn(...args) {
    const safeArgs =
      args.map((item) => sanitizePayload(item));

    let coreLogged = false;

    try {
      if (isFunction(AppCore?.utils?.warn)) {
        AppCore.utils.warn("[App]", ...safeArgs);
        coreLogged = true;
      }
    } catch {
      coreLogged = false;
    }

    if (coreLogged) {
      return;
    }

    try {
      console.warn("[App]", ...safeArgs);
    } catch {}
  }

  function safeError(...args) {
    const safeArgs =
      args.map((item) => sanitizePayload(item));

    let coreLogged = false;

    try {
      if (isFunction(AppCore?.utils?.error)) {
        AppCore.utils.error("[App]", ...safeArgs);
        coreLogged = true;
      }
    } catch {
      coreLogged = false;
    }

    if (coreLogged) {
      return;
    }

    try {
      console.error("[App]", ...safeArgs);
    } catch {}
  }

  function safeWindowOn(eventName, handler) {
    if (
      !isBrowser() ||
      !eventName ||
      !isFunction(handler)
    ) {
      return false;
    }

    try {
      window.addEventListener(
        eventName,
        handler
      );

      boundWindowEvents.push({
        eventName,
        handler,
      });

      return true;
    } catch {
      return false;
    }
  }

  function safeBusOn(eventName, handler) {
    if (
      !eventName ||
      !isFunction(handler) ||
      !isFunction(AppCore?.events?.on)
    ) {
      return false;
    }

    try {
      AppCore.events.on(eventName, handler);

      boundBusEvents.push({
        eventName,
        handler,
      });

      return true;
    } catch {
      return false;
    }
  }

  function unbindWindowEvents() {
    if (!isBrowser()) {
      boundWindowEvents.length = 0;
      return true;
    }

    for (const item of boundWindowEvents.splice(0)) {
      try {
        window.removeEventListener(
          item.eventName,
          item.handler
        );
      } catch {}
    }

    return true;
  }

  function unbindBusEvents() {
    for (const item of boundBusEvents.splice(0)) {
      try {
        if (isFunction(AppCore?.events?.off)) {
          AppCore.events.off(item.eventName, item.handler);
        } else if (isFunction(AppCore?.events?.removeListener)) {
          AppCore.events.removeListener(item.eventName, item.handler);
        }
      } catch {}
    }

    return true;
  }

  /* =======================================================
     SNAPSHOTS
  ======================================================= */

  function getSidebarSnapshot() {
    try {
      return (
        SidebarUI?.getState?.() ||
        SidebarUI?.getSnapshot?.() ||
        {}
      );
    } catch {
      return {};
    }
  }

  function getTopbarSnapshot() {
    try {
      return (
        TopbarUI?.getState?.() ||
        TopbarUI?.getSnapshot?.() ||
        {}
      );
    } catch {
      return {};
    }
  }

  function getBootLoaderSnapshot() {
    try {
      return getLoaderSnapshot?.(AppCore, state) || {};
    } catch {
      return {};
    }
  }

  function getCurrentRouteSnapshot() {
    let publicPath = DEFAULT_ROUTE || "/";
    let route = DEFAULT_ROUTE || "/";

    try {
      publicPath =
        getCurrentPublicPath?.(AppCore, Router) ||
        Router?.getCurrentPublicPath?.() ||
        AppCore?.state?.publicPath ||
        getBrowserPublicPath() ||
        DEFAULT_ROUTE ||
        "/";
    } catch {
      publicPath =
        AppCore?.state?.publicPath ||
        getBrowserPublicPath() ||
        DEFAULT_ROUTE ||
        "/";
    }

    try {
      route =
        getCurrentCanonicalPath?.(AppCore, Router) ||
        Router?.getCurrentCanonicalPath?.() ||
        AppCore?.state?.route ||
        stripSearchAndHash(publicPath) ||
        DEFAULT_ROUTE ||
        "/";
    } catch {
      route =
        AppCore?.state?.route ||
        stripSearchAndHash(publicPath) ||
        DEFAULT_ROUTE ||
        "/";
    }

    return {
      route:
        route || DEFAULT_ROUTE || "/",

      publicPath:
        publicPath || route || DEFAULT_ROUTE || "/",
    };
  }

  function getUserSnapshot() {
    const user =
      AppCore?.state?.user ||
      AppCore?.state?.currentUser ||
      AppCore?.state?.sessionUser ||
      AppCore?.state?.authUser ||
      null;

    const routeSnapshot = getCurrentRouteSnapshot();

    return {
      user,

      authenticated:
        Boolean(AppCore?.state?.authenticated),

      username:
        safeText(
          user?.username ||
            user?.email ||
            user?.name ||
            AppCore?.state?.username ||
            "",
          ""
        ),

      displayName:
        safeText(
          user?.displayName ||
            user?.name ||
            user?.username ||
            user?.email ||
            "",
          ""
        ),

      role:
        safeText(
          AppCore?.state?.role ||
            AppCore?.state?.rol ||
            user?.role ||
            user?.rol ||
            "",
          ""
        ),

      lang:
        safeText(AppCore?.state?.lang || "", ""),

      theme:
        safeText(AppCore?.state?.theme || "", ""),

      route:
        routeSnapshot.route,

      publicPath:
        routeSnapshot.publicPath,
    };
  }

  function persistBootSnapshot(reason = "snapshot") {
    const snapshot = sanitizePayload({
      version: APP_BOOTSTRAP_VERSION,
      reason,
      state: {
        booted: state.booted,
        booting: state.booting,
        cycleId: state.bootCycleId,
        finalizedCycleId: state.finalizedCycleId,
        readyEmitted: state.readyEmitted,
        route: getCurrentRouteSnapshot(),
        bootUrlContext: sanitizeBootContextForLog(refreshBootUrlContext()),
      },
      at: safeIsoDate(),
    });

    try {
      setWindowValue(RUNTIME_KEYS.bootSnapshot, snapshot);
    } catch {}

    return snapshot;
  }

  /* =======================================================
     CORE MODULE BRIDGES · IDEMPOTENT
  ======================================================= */

  function getRegisteredCoreModule(name = "") {
    const cleanName = safeText(name, "");

    if (!cleanName) {
      return null;
    }

    try {
      if (isFunction(AppCore?.modules?.get)) {
        const value = AppCore.modules.get(cleanName);

        if (value) {
          return value;
        }
      }
    } catch {}

    try {
      if (AppCore?.registry?.modules?.get) {
        const value = AppCore.registry.modules.get(cleanName);

        if (value) {
          return value;
        }
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules === "object" &&
        AppCore.modules[cleanName]
      ) {
        return AppCore.modules[cleanName];
      }
    } catch {}

    return null;
  }

  function warnBridgeConflictOnce(name = "", aliases = []) {
    const cleanName = safeText(name, "");

    if (!cleanName) {
      return;
    }

    const key = [
      cleanName,
      ...safeArray(aliases)
        .map((alias) => safeText(alias, ""))
        .filter(Boolean),
    ].join("|");

    if (bridgeConflictWarnings.has(key)) {
      return;
    }

    bridgeConflictWarnings.add(key);

    safeWarn(
      "Bridge module ya existe con otra instancia. Se conserva registry actual para evitar app:module:duplicate.",
      {
        name: cleanName,
        aliases,
      }
    );
  }

  function registryHasSameModule(name = "", value = null, aliases = []) {
    const names = [
      name,
      ...safeArray(aliases),
    ]
      .map((item) => safeText(item, ""))
      .filter(Boolean);

    for (const candidate of names) {
      const registered = getRegisteredCoreModule(candidate);

      if (registered && Object.is(registered, value)) {
        return true;
      }
    }

    return false;
  }

  function registryHasConflictingModule(name = "", value = null, aliases = []) {
    const names = [
      name,
      ...safeArray(aliases),
    ]
      .map((item) => safeText(item, ""))
      .filter(Boolean);

    for (const candidate of names) {
      const registered = getRegisteredCoreModule(candidate);

      if (registered && !Object.is(registered, value)) {
        return true;
      }
    }

    return false;
  }

  function registerCoreModule(name = "", value = null, aliases = []) {
    const cleanName = safeText(name, "");

    if (
      !cleanName ||
      !value
    ) {
      return false;
    }

    const cleanAliases =
      Array.from(
        new Set(
          safeArray(aliases)
            .map((item) => safeText(item, ""))
            .filter(Boolean)
            .filter((item) => item !== cleanName)
        )
      );

    const cacheEntry =
      bridgeRegistryCache.get(cleanName);

    const sameCache =
      cacheEntry &&
      Object.is(cacheEntry.value, value) &&
      JSON.stringify(cacheEntry.aliases || []) === JSON.stringify(cleanAliases);

    if (
      sameCache &&
      registryHasSameModule(cleanName, value, cleanAliases)
    ) {
      return true;
    }

    if (registryHasConflictingModule(cleanName, value, cleanAliases)) {
      warnBridgeConflictOnce(cleanName, cleanAliases);

      bridgeRegistryCache.set(cleanName, {
        value,
        aliases: cleanAliases,
        skippedBecauseConflict: true,
        at: safeIsoDate(),
      });

      return false;
    }

    if (registryHasSameModule(cleanName, value, cleanAliases)) {
      bridgeRegistryCache.set(cleanName, {
        value,
        aliases: cleanAliases,
        alreadyRegistered: true,
        at: safeIsoDate(),
      });

      return true;
    }

    let registered = false;

    try {
      if (isFunction(AppCore?.modules?.register)) {
        const result =
          AppCore.modules.register(
            cleanName,
            value,
            {
              aliases: cleanAliases,
              overwrite: false,
              replace: false,
              idempotent: true,
              source: BOOT_SOURCE,
            }
          );

        registered = result !== false;
      }
    } catch (error) {
      registered = false;

      safeWarn(
        "modules.register() falló.",
        {
          name: cleanName,
          aliases: cleanAliases,
          error,
        }
      );
    }

    if (!registered) {
      try {
        if (
          isFunction(AppCore?.modules?.set) &&
          !getRegisteredCoreModule(cleanName)
        ) {
          const result =
            AppCore.modules.set(
              cleanName,
              value,
              {
                source: BOOT_SOURCE,
              }
            );

          registered = result !== false;
        }
      } catch {
        registered = false;
      }
    }

    if (!registered) {
      try {
        if (
          AppCore?.modules &&
          typeof AppCore.modules === "object" &&
          Object.isExtensible(AppCore.modules) &&
          !AppCore.modules[cleanName]
        ) {
          AppCore.modules[cleanName] = value;
          registered = true;
        }
      } catch {
        registered = false;
      }
    }

    if (!registered) {
      try {
        if (
          AppCore?.registry?.modules?.set &&
          !AppCore.registry.modules.get?.(cleanName)
        ) {
          AppCore.registry.modules.set(
            cleanName,
            value
          );

          registered = true;
        }
      } catch {
        registered = false;
      }
    }

    if (registered) {
      bridgeRegistryCache.set(cleanName, {
        value,
        aliases: cleanAliases,
        registered: true,
        at: safeIsoDate(),
      });
    }

    return registered;
  }

  function exposeRuntimeModulesToCore() {
    const assignments = [
      ["Router", Router],
      ["router", Router],

      ["Auth", Auth],
      ["auth", Auth],

      ["Store", Store],
      ["store", Store],

      ["Http", Http],
      ["http", Http],

      ["Toast", Toast],
      ["toast", Toast],
      ["toastModule", Toast],

      ["I18n", I18n],
      ["i18n", I18n],

      ["SidebarUI", SidebarUI],
      ["sidebarUI", SidebarUI],

      ["TopbarUI", TopbarUI],
      ["topbarUI", TopbarUI],
    ];

    for (const [key, value] of assignments) {
      try {
        if (value) {
          AppCore[key] = value;
        }
      } catch {}
    }

    registerCoreModule("Router", Router, ["router"]);
    registerCoreModule("Auth", Auth, ["auth"]);
    registerCoreModule("Store", Store, ["store"]);
    registerCoreModule("Http", Http, ["http"]);
    registerCoreModule("Toast", Toast, ["toast", "toastModule"]);
    registerCoreModule("I18n", I18n, ["i18n"]);
    registerCoreModule("SidebarUI", SidebarUI, ["sidebar", "sidebarUI"]);
    registerCoreModule("TopbarUI", TopbarUI, ["topbar", "topbarUI"]);

    state.runtimeModulesExposed = true;
    state.runtimeModulesExposeCount += 1;

    try {
      if (isFunction(AppCore?.setState)) {
        AppCore.setState(
          {
            routerReady: Boolean(Router),
            authReady: Boolean(Auth),
            storeReady: Boolean(Store),
            httpReady: Boolean(Http),
            runtimeModulesExposed: true,
          },
          {
            emit: false,
            emitState: false,
            silent: true,
            source: BOOT_SOURCE,
          }
        );
      }
    } catch {}

    return true;
  }

  function exposeRouterToCore() {
    return exposeRuntimeModulesToCore();
  }

  /* =======================================================
     UI FIREBREAK
  ======================================================= */

  function normalizeRepairReason(reason = "unknown") {
    let text =
      safeText(reason, "unknown")
        .replace(/\s+/g, " ")
        .trim();

    if (!text) {
      text = "unknown";
    }

    const appPrefixCount =
      (text.match(/app:/g) || []).length;

    if (appPrefixCount > 3) {
      return "recursive-event-blocked";
    }

    text = text.replace(/^(app:){2,}/, "app:");

    if (text.length > UI_REASON_MAX_LENGTH) {
      text = text.slice(0, UI_REASON_MAX_LENGTH);
    }

    return text;
  }

  function shouldSkipRepair(reason = "unknown", options = {}) {
    const cleanReason = normalizeRepairReason(reason);

    if (cleanReason === "recursive-event-blocked") {
      return true;
    }

    if (uiRepairRunning) {
      return true;
    }

    const current = nowEpochMs();
    const routeSnapshot = getCurrentRouteSnapshot();

    const key = [
      cleanReason,
      routeSnapshot.route,
      routeSnapshot.publicPath,
      Boolean(options?.repairShell),
      Boolean(options?.hardRepair),
      Boolean(options?.rebind),
    ].join("|");

    if (
      key === uiRepairLastKey &&
      current - uiRepairLastAt < UI_REPAIR_THROTTLE_MS
    ) {
      return true;
    }

    uiRepairLastKey = key;
    uiRepairLastAt = current;

    return false;
  }

  function shouldSkipUserSync(reason = "sync-user-ui") {
    const cleanReason = normalizeRepairReason(reason);

    if (cleanReason === "recursive-event-blocked") {
      return true;
    }

    if (uiSyncRunning) {
      return true;
    }

    const current = nowEpochMs();

    if (
      uiSyncLastReason === cleanReason &&
      current - uiSyncLastAt < UI_SYNC_THROTTLE_MS
    ) {
      return true;
    }

    uiSyncLastReason = cleanReason;
    uiSyncLastAt = current;

    return false;
  }

  function callUIMethod(target, methodName = "", reason = "unknown", context = {}) {
    if (
      !target ||
      !methodName ||
      !isFunction(target?.[methodName])
    ) {
      return false;
    }

    const fn = target[methodName];

    try {
      fn.call(target, reason, context);
      return true;
    } catch {}

    try {
      fn.call(target, context);
      return true;
    } catch {}

    try {
      fn.call(target);
      return true;
    } catch {}

    return false;
  }

  function callManyUIMethods(target, methodNames = [], reason = "unknown", context = {}) {
    const called = [];

    for (const methodName of safeArray(methodNames)) {
      if (
        callUIMethod(
          target,
          methodName,
          reason,
          context
        )
      ) {
        called.push(methodName);
      }
    }

    return {
      called: called.length > 0,
      methods: called,
      method: called[0] || "",
    };
  }

  function callFirstUIMethod(target, methodNames = [], reason = "unknown", context = {}) {
    for (const methodName of safeArray(methodNames)) {
      if (
        callUIMethod(
          target,
          methodName,
          reason,
          context
        )
      ) {
        return {
          called: true,
          method: methodName,
        };
      }
    }

    return {
      called: false,
      method: "",
    };
  }

  function syncSidebarIdentity(reason = "sidebar-identity", context = {}) {
    return callManyUIMethods(
      SidebarUI,
      [
        "renderUser",
        "refreshUser",
        "updateUser",
        "syncUser",
        "applyRoleVisibility",
      ],
      reason,
      context
    );
  }

  function syncSidebarVisual(reason = "sidebar-visual", context = {}) {
    return callManyUIMethods(
      SidebarUI,
      [
        "syncRouteAndIndicator",
        "syncIndicator",
        "updateToggleLabel",
        "sync",
        "refresh",
      ],
      reason,
      context
    );
  }

  function syncTopbarIdentity(reason = "topbar-identity", context = {}) {
    return callFirstUIMethod(
      TopbarUI,
      [
        "renderUser",
        "refreshUser",
        "updateUser",
        "syncUser",
        "sync",
        "refresh",
      ],
      reason,
      context
    );
  }

  function syncTopbarVisual(reason = "topbar-visual", context = {}) {
    return callFirstUIMethod(
      TopbarUI,
      [
        "syncRoute",
        "updateRoute",
        "sync",
        "refresh",
      ],
      reason,
      context
    );
  }

  function callSyncUserUI(reason = "sync-user-ui", extraContext = {}) {
    const cleanReason = normalizeRepairReason(reason);

    if (shouldSkipUserSync(cleanReason)) {
      return false;
    }

    uiSyncRunning = true;

    try {
      const routeSnapshot = getCurrentRouteSnapshot();
      const snapshot = getUserSnapshot();

      const context = {
        AppCore,
        Auth,
        Router,
        Store,
        Toast,
        I18n,
        SidebarUI,
        TopbarUI,

        reason: cleanReason,
        source: BOOT_SOURCE,

        route: routeSnapshot.route,
        publicPath: routeSnapshot.publicPath,

        snapshot,

        ...safeObject(extraContext),
      };

      let appUiSynced = false;

      try {
        appUiSynced =
          Boolean(
            syncAppUserUI?.({
              AppCore,
              Auth,
              Router,
              Store,
              Toast,
              I18n,
              SidebarUI,
              TopbarUI,

              reason: cleanReason,
              payload: context,

              rebind: false,
              hardRepair: false,
              force: true,
            })
          );
      } catch (error) {
        safeWarn(
          "syncAppUserUI() falló.",
          {
            reason: cleanReason,
            error,
          }
        );
      }

      let coreUserUiPayload = null;

      try {
        coreUserUiPayload = AppCore?.syncUserUI?.();
      } catch (error) {
        safeWarn(
          "AppCore.syncUserUI() falló.",
          {
            reason: cleanReason,
            error,
          }
        );
      }

      const sidebarIdentity =
        syncSidebarIdentity(
          cleanReason,
          context
        );

      const topbarIdentity =
        syncTopbarIdentity(
          cleanReason,
          context
        );

      safeEmit(
        APP_EVENTS?.userUiSync ||
          "app:user-ui:sync",
        {
          reason: cleanReason,

          appUiSynced,

          coreSynced:
            Boolean(coreUserUiPayload),

          sidebarSynced:
            Boolean(sidebarIdentity?.called),

          sidebarMethods:
            sidebarIdentity?.methods || [],

          topbarSynced:
            Boolean(topbarIdentity?.called),

          topbarMethod:
            topbarIdentity?.method || "",

          ...snapshot,
        }
      );

      return true;
    } catch (error) {
      safeWarn(
        "callSyncUserUI() falló.",
        {
          reason: cleanReason,
          error,
        }
      );

      return false;
    } finally {
      uiSyncRunning = false;
    }
  }

  function hardRepairSidebar(reason = "ui-hard-repair", context = {}) {
    return callFirstUIMethod(
      SidebarUI,
      [
        "repair",
        "refresh",
        "sync",
      ],
      reason,
      context
    );
  }

  function hardRepairTopbar(reason = "ui-hard-repair", context = {}) {
    return callFirstUIMethod(
      TopbarUI,
      [
        "repair",
        "refresh",
        "sync",
      ],
      reason,
      context
    );
  }

  function rebindSidebar(reason = "ui-rebind", context = {}) {
    return callFirstUIMethod(
      SidebarUI,
      [
        "rebindEvents",
        "rebind",
        "bindEvents",
        "bind",
      ],
      reason,
      context
    );
  }

  function rebindTopbar(reason = "ui-rebind", context = {}) {
    return callFirstUIMethod(
      TopbarUI,
      [
        "rebindEvents",
        "rebind",
        "bindEvents",
        "bind",
      ],
      reason,
      context
    );
  }

  function repairShell(reason = "unknown") {
    const cleanReason = normalizeRepairReason(reason);
    const routeSnapshot = getCurrentRouteSnapshot();

    try {
      updateShellVisibilityByRoute?.(
        AppCore,
        Router,
        {
          reason: cleanReason,
        }
      );
    } catch {}

    try {
      Router?.repairShell?.({
        route:
          Router?.getRoute?.(routeSnapshot.route) ||
          null,

        canonicalPath:
          routeSnapshot.route,

        publicPath:
          routeSnapshot.publicPath,

        phase:
          cleanReason.startsWith("app:")
            ? cleanReason
            : `app:${cleanReason}`,

        hideLoading: false,
      });
    } catch {}

    return routeSnapshot;
  }

  function repairUISystems(reason = "unknown", options = {}) {
    const cleanReason = normalizeRepairReason(reason);

    const opts = {
      repairShell:
        options?.repairShell !== false,

      syncUser:
        options?.syncUser !== false,

      rebind:
        options?.rebind === true,

      hardRepair:
        options?.hardRepair === true,

      emit:
        options?.emit !== false,

      afterPaint:
        options?.afterPaint === true,

      source:
        safeText(options?.source, BOOT_SOURCE),
    };

    if (shouldSkipRepair(cleanReason, opts)) {
      return false;
    }

    uiRepairRunning = true;

    try {
      const routeSnapshot =
        opts.repairShell
          ? repairShell(cleanReason)
          : getCurrentRouteSnapshot();

      const context = {
        AppCore,
        Auth,
        Router,
        Store,
        Toast,
        I18n,
        SidebarUI,
        TopbarUI,

        reason: cleanReason,
        source: opts.source,

        route: routeSnapshot.route,
        publicPath: routeSnapshot.publicPath,

        snapshot: getUserSnapshot(),
      };

      try {
        repairAppUISystems?.({
          AppCore,
          Auth,
          Router,
          Store,
          Toast,
          I18n,
          SidebarUI,
          TopbarUI,

          reason: cleanReason,
          payload: context,

          rebind: opts.rebind,
          hardRepair: opts.hardRepair,
          force: true,
        });
      } catch {}

      if (opts.syncUser) {
        callSyncUserUI(
          cleanReason,
          context
        );
      }

      let sidebarResult = {
        called: false,
        method: "",
        methods: [],
      };

      let topbarResult = {
        called: false,
        method: "",
        methods: [],
      };

      if (opts.hardRepair) {
        sidebarResult =
          hardRepairSidebar(
            cleanReason,
            context
          );

        topbarResult =
          hardRepairTopbar(
            cleanReason,
            context
          );
      } else {
        sidebarResult =
          syncSidebarVisual(
            cleanReason,
            context
          );

        topbarResult =
          syncTopbarVisual(
            cleanReason,
            context
          );
      }

      if (
        opts.rebind &&
        !opts.hardRepair
      ) {
        rebindSidebar(
          cleanReason,
          context
        );

        rebindTopbar(
          cleanReason,
          context
        );
      }

      if (opts.emit) {
        safeEmit(
          APP_EVENTS?.uiRepair ||
            "app:ui:repair",
          {
            reason: cleanReason,

            route: routeSnapshot.route,
            publicPath: routeSnapshot.publicPath,

            hardRepair: opts.hardRepair,
            rebind: opts.rebind,

            sidebarMethod:
              sidebarResult.method,

            sidebarMethods:
              sidebarResult.methods || [],

            topbarMethod:
              topbarResult.method,

            topbarMethods:
              topbarResult.methods || [],

            sidebarSnapshot:
              getSidebarSnapshot(),

            topbarSnapshot:
              getTopbarSnapshot(),
          }
        );
      }

      if (opts.afterPaint) {
        afterPaint(() => {
          repairUISystems(
            `${cleanReason}:after-paint`,
            {
              ...opts,

              repairShell: false,
              hardRepair: false,
              rebind: false,
              emit: false,
              afterPaint: false,

              source:
                `${opts.source}:after-paint`,
            }
          );
        });
      }

      return true;
    } finally {
      uiRepairRunning = false;
    }
  }

  function scheduleUIRepair(reason = "event", options = {}) {
    const cleanReason = normalizeRepairReason(reason);

    if (cleanReason === "recursive-event-blocked") {
      return false;
    }

    if (uiRepairScheduled) {
      return false;
    }

    uiRepairScheduled = true;

    const run = () => {
      uiRepairScheduled = false;

      repairUISystems(
        cleanReason,
        options
      );
    };

    if (!isBrowser()) {
      run();
      return true;
    }

    try {
      window.setTimeout(run, 0);
      return true;
    } catch {
      run();
      return true;
    }
  }

  function getEventPayload(eventOrPayload = {}) {
    const raw = eventOrPayload || {};

    if (
      raw &&
      typeof raw === "object" &&
      "detail" in raw &&
      raw.detail !== undefined
    ) {
      return safeObject(raw.detail);
    }

    if (
      raw &&
      typeof raw === "object" &&
      "payload" in raw &&
      raw.payload !== undefined
    ) {
      return safeObject(raw.payload);
    }

    return safeObject(raw);
  }

  function bindUIRepairEvents() {
    if (state.uiRepairEventsBound) {
      return true;
    }

    const getReason = (payload = {}, fallback = "event") => {
      const data = getEventPayload(payload);

      return normalizeRepairReason(
        data.reason ||
          data.phase ||
          data.type ||
          data.event ||
          fallback
      );
    };

    const hasBus = isFunction(AppCore?.events?.on);

    if (hasBus) {
      safeBusOn(
        ROUTER_EVENTS?.rendered ||
          "router:rendered",
        (payload) => {
          scheduleUIRepair(
            getReason(payload, "router:rendered"),
            {
              repairShell: false,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: "router:rendered",
            }
          );
        }
      );

      safeBusOn(
        ROUTER_EVENTS?.asyncComplete ||
          "router:render:async-complete",
        (payload) => {
          scheduleUIRepair(
            getReason(payload, "router:render:async-complete"),
            {
              repairShell: false,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: "router:render:async-complete",
            }
          );
        }
      );

      safeBusOn(
        APP_EVENTS?.routeChange ||
          "app:route:change",
        (payload) => {
          scheduleUIRepair(
            getReason(payload, "app:route:change"),
            {
              repairShell: false,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: "app:route:change",
            }
          );
        }
      );

      safeBusOn(
        APP_EVENTS?.uiRepairRequest ||
          "app:ui:repair-request",
        (payload) => {
          const data = getEventPayload(payload);

          scheduleUIRepair(
            getReason(payload, "app:ui:repair-request"),
            {
              repairShell:
                data.repairShell !== false,

              hardRepair:
                data.hardRepair === true,

              rebind:
                data.rebind === true,

              afterPaint:
                data.afterPaint === true,

              source:
                "app:ui:repair-request",
            }
          );
        }
      );

      [
        APP_EVENTS?.sessionRestored || "app:session:restored",
        AUTH_EVENTS?.sessionRestored || "auth:session:restored",
        AUTH_EVENTS?.loginSuccess || "auth:login:success",
        AUTH_EVENTS?.logout || "auth:logout",
        AUTH_EVENTS?.logoutSuccess || "auth:logout:success",
        APP_EVENTS?.userChange || "app:user:change",
        APP_EVENTS?.langChange || "app:lang:change",
        "onion:theme:change",
        APP_EVENTS?.themeChange || "app:theme:change",
        "theme:change",
      ].forEach((eventName) => {
        safeBusOn(eventName, (payload) => {
          scheduleUIRepair(
            getReason(payload, eventName),
            {
              repairShell: false,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: eventName,
            }
          );
        });
      });
    } else {
      safeWindowOn(
        APP_EVENTS?.uiRepairRequest ||
          "app:ui:repair-request",
        (payload) => {
          const data = getEventPayload(payload);

          scheduleUIRepair(
            getReason(payload, "window:app:ui:repair-request"),
            {
              repairShell:
                data.repairShell !== false,

              hardRepair:
                data.hardRepair === true,

              rebind:
                data.rebind === true,

              afterPaint:
                data.afterPaint === true,

              source:
                "window:app:ui:repair-request",
            }
          );
        }
      );

      safeWindowOn(
        APP_EVENTS?.langChange ||
          "app:lang:change",
        (payload) => {
          scheduleUIRepair(
            getReason(payload, "window:app:lang:change"),
            {
              repairShell: false,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: "window:app:lang:change",
            }
          );
        }
      );

      safeWindowOn(
        "onion:theme:change",
        (payload) => {
          scheduleUIRepair(
            getReason(payload, "window:onion:theme:change"),
            {
              repairShell: false,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: "window:onion:theme:change",
            }
          );
        }
      );
    }

    state.uiRepairEventsBound = true;

    return true;
  }

  /* =======================================================
     BOOT URL CONTEXT
  ======================================================= */

  function refreshBootUrlContext() {
    BOOT_URL_CONTEXT = captureInitialUrl();

    return BOOT_URL_CONTEXT;
  }

  function isPublicTokenBoot() {
    const context = refreshBootUrlContext();

    return Boolean(
      context.isPublicTokenRoute &&
        context.hasPublicToken
    );
  }

  function isActivationBoot() {
    const context = refreshBootUrlContext();

    return Boolean(
      context.isActivation &&
        context.hasActivationToken
    );
  }

  function isResetConfirmBoot() {
    const context = refreshBootUrlContext();

    return Boolean(
      context.isResetConfirm &&
        context.hasResetToken
    );
  }

  function exposeBootUrlContextToCore() {
    const context = refreshBootUrlContext();

    const payload = {
      [APP_STATE_KEYS?.bootInitialUrl || "bootInitialUrl"]:
        context.initialUrl,

      [APP_STATE_KEYS?.bootInitialPath || "bootInitialPath"]:
        context.browserPublicPath,

      [APP_STATE_KEYS?.bootProtectedInitialUrl || "bootProtectedInitialUrl"]:
        context.protectedInitialUrl,

      [APP_STATE_KEYS?.bootProtectedInitialPath || "bootProtectedInitialPath"]:
        context.protectedInitialPath,

      [APP_STATE_KEYS?.bootProtectedInitialPublicPath || "bootProtectedInitialPublicPath"]:
        context.protectedInitialPublicPath,

      [APP_STATE_KEYS?.bootIsPublicTokenRoute || "bootIsPublicTokenRoute"]:
        context.isPublicTokenRoute,

      [APP_STATE_KEYS?.bootHasPublicToken || "bootHasPublicToken"]:
        context.hasPublicToken,

      [APP_STATE_KEYS?.bootHasProtectedToken || "bootHasProtectedToken"]:
        context.hasPublicToken,

      [APP_STATE_KEYS?.bootProtectedRouteKey || "bootProtectedRouteKey"]:
        context.protectedRouteKey,

      [APP_STATE_KEYS?.bootActivationInitialUrl || "bootActivationInitialUrl"]:
        context.activationInitialUrl,

      [APP_STATE_KEYS?.bootActivationInitialPath || "bootActivationInitialPath"]:
        context.activationInitialPath,

      [APP_STATE_KEYS?.bootActivationInitialPublicPath || "bootActivationInitialPublicPath"]:
        context.activationInitialPublicPath,

      [APP_STATE_KEYS?.bootIsActivation || "bootIsActivation"]:
        context.isActivation,

      [APP_STATE_KEYS?.bootHasActivationToken || "bootHasActivationToken"]:
        context.hasActivationToken,

      [APP_STATE_KEYS?.bootResetConfirmInitialUrl || "bootResetConfirmInitialUrl"]:
        context.resetConfirmInitialUrl,

      [APP_STATE_KEYS?.bootResetConfirmInitialPath || "bootResetConfirmInitialPath"]:
        context.resetConfirmInitialPath,

      [APP_STATE_KEYS?.bootResetConfirmInitialPublicPath || "bootResetConfirmInitialPublicPath"]:
        context.resetConfirmInitialPublicPath,

      [APP_STATE_KEYS?.bootIsResetConfirm || "bootIsResetConfirm"]:
        context.isResetConfirm,

      [APP_STATE_KEYS?.bootHasResetToken || "bootHasResetToken"]:
        context.hasResetToken,
    };

    try {
      AppCore?.setState?.(
        payload,
        {
          emit: false,
          emitState: false,
          silent: true,
          source: BOOT_SOURCE,
        }
      );
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

    try {
      setWindowValue(
        RUNTIME_KEYS.bootContext,
        context
      );
    } catch {}

    return context;
  }

  /* =======================================================
     BOOT STATE
  ======================================================= */

  function nextCycle() {
    state.bootCycleId += 1;
    return state.bootCycleId;
  }

  function isStale(cycleId) {
    return cycleId !== state.bootCycleId;
  }

  function resetCycleRuntimeState() {
    state.bootNavigationHandled = false;
    state.initialRouteRendered = false;
    state.lastBootSteps = [];
    state.lastError = null;
  }

  function recordBootStep(name = "", payload = {}) {
    const item = {
      name: safeText(name, "unknown"),
      at: safeIsoDate(),
      ms: nowEpochMs(),
      ...sanitizePayload(payload),
    };

    state.lastBootSteps.push(item);

    if (state.lastBootSteps.length > 80) {
      state.lastBootSteps.splice(
        0,
        state.lastBootSteps.length - 80
      );
    }

    safeEmit(
      BOOT_EVENTS.step,
      item
    );

    return item;
  }

  async function runBootStep(name = "", fn, payload = {}) {
    const stepName = safeText(name, "unknown");
    const startedAt = nowEpochMs();

    recordBootStep(
      `${stepName}:start`,
      payload
    );

    try {
      const result = await Promise.resolve(
        isFunction(fn)
          ? fn()
          : null
      );

      const durationMs = nowEpochMs() - startedAt;

      recordBootStep(
        `${stepName}:done`,
        {
          durationMs,
        }
      );

      if (durationMs > BOOT_STEP_MAX_DURATION_MS) {
        safeWarn(
          "Boot step lento.",
          {
            step: stepName,
            durationMs,
          }
        );
      }

      return result;
    } catch (error) {
      const durationMs = nowEpochMs() - startedAt;

      recordBootStep(
        `${stepName}:error`,
        {
          durationMs,
          error,
        }
      );

      throw error;
    }
  }

  function emitBootState(phase = "unknown", extra = {}) {
    const routeSnapshot = getCurrentRouteSnapshot();

    safeEmit(
      BOOT_EVENTS.state,
      {
        phase,

        booted: state.booted,
        booting: state.booting,

        cycleId: state.bootCycleId,
        finalizedCycleId: state.finalizedCycleId,

        route: routeSnapshot.route,
        publicPath: routeSnapshot.publicPath,

        ...safeObject(extra),
      }
    );
  }

  function markBooting(cycleId) {
    state.booting = true;
    state.booted = false;
    state.lastBootStartedAt = nowEpochMs();

    try {
      markBootStart?.(
        AppCore,
        Store,
        {
          cycleId,
          reason: "app-index-boot-start",
        }
      );
    } catch {
      try {
        markAppBootState?.(AppCore, {
          booting: true,
          booted: false,
          ready: false,
          loading: true,
          phase: BOOT_PHASE_VALUE.booting,
          cycleId,
          reason: "app-index-boot-start",
        });
      } catch {}

      try {
        markStoreBootState?.(Store, {
          booting: true,
          booted: false,
          ready: false,
          loading: true,
          phase: BOOT_PHASE_VALUE.booting,
          cycleId,
          reason: "app-index-boot-start",
        });
      } catch {}
    }

    emitBootState(
      "booting",
      {
        cycleId,
      }
    );
  }

  function markBooted(cycleId) {
    state.booting = false;
    state.booted = true;
    state.lastBootReadyAt = nowEpochMs();

    try {
      markBootReady?.(
        AppCore,
        Store,
        {
          cycleId,
          reason: "app-index-boot-ready",
        }
      );
    } catch {
      try {
        markAppBootState?.(AppCore, {
          booting: false,
          booted: true,
          ready: true,
          loading: false,
          phase: BOOT_PHASE_VALUE.ready,
          cycleId,
          reason: "app-index-boot-ready",
        });
      } catch {}

      try {
        markStoreBootState?.(Store, {
          booting: false,
          booted: true,
          ready: true,
          loading: false,
          phase: BOOT_PHASE_VALUE.ready,
          cycleId,
          reason: "app-index-boot-ready",
        });
      } catch {}
    }

    emitBootState(
      "ready",
      {
        cycleId,
      }
    );
  }

  function markBootFailed(cycleId, error = null) {
    state.booting = false;
    state.booted = false;
    state.lastBootErrorAt = nowEpochMs();
    state.lastError = sanitizePayload(error);

    try {
      markBootError?.(
        AppCore,
        Store,
        error,
        {
          cycleId,
          reason: "app-index-boot-error",
        }
      );
    } catch {
      try {
        markAppBootState?.(AppCore, {
          booting: false,
          booted: false,
          ready: false,
          loading: false,
          phase: BOOT_PHASE_VALUE.error,
          cycleId,
          reason: "app-index-boot-error",
          error,
        });
      } catch {}

      try {
        markStoreBootState?.(Store, {
          booting: false,
          booted: false,
          ready: false,
          loading: false,
          phase: BOOT_PHASE_VALUE.error,
          cycleId,
          reason: "app-index-boot-error",
          error,
        });
      } catch {}
    }

    emitBootState(
      "error",
      {
        cycleId,
        message:
          safeText(error?.message || error, "Boot error."),
      }
    );
  }

  function setCoreBootFlag(key = "", value = false) {
    const cleanKey = safeText(key, "");

    if (!cleanKey) {
      return false;
    }

    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        AppCore.state[cleanKey] = value;
      }
    } catch {}

    try {
      AppCore?.setState?.(
        {
          [cleanKey]: value,
        },
        {
          emit: false,
          emitState: false,
          silent: true,
          source: BOOT_SOURCE,
        }
      );
    } catch {}

    return true;
  }

  function markBootNavigationHandled(value = true) {
    state.bootNavigationHandled = Boolean(value);

    setCoreBootFlag(
      "bootNavigationHandled",
      Boolean(value)
    );
  }

  function markInitialRouteRendered(value = true) {
    state.initialRouteRendered = Boolean(value);

    setCoreBootFlag(
      "initialRouteRendered",
      Boolean(value)
    );
  }

  function didRestoreHandleNavigation(restoreResult = null) {
    const result = safeObject(restoreResult);

    return Boolean(
      state.bootNavigationHandled === true ||
        result.navigationHandled === true ||
        result.navigated === true ||
        result.didNavigate === true ||
        result.redirected === true ||
        result.routeChanged === true ||
        AppCore?.state?.bootNavigationHandled === true
    );
  }

  /* =======================================================
     LOADER
  ======================================================= */

  function showBootLoader(reason = "boot") {
    if (state.loaderVisible) {
      return true;
    }

    state.loaderVisible = true;
    state.loaderShownAt = nowEpochMs();

    try {
      prepareBootLoader?.(AppCore, state);
    } catch {
      try {
        showLoader(
          AppCore,
          {
            booting: true,
            reason,
          }
        );
      } catch {}
    }

    try {
      armBootFailsafeLoader?.({
        AppCore,
        state,
        hideLoader: forceHideLoader,
      });
    } catch {}

    safeEmit(
      BOOT_EVENTS.loaderShow,
      {
        reason,
        loaderSnapshot:
          getBootLoaderSnapshot(),
      }
    );

    return true;
  }

  function hideBootLoader(reason = "boot-complete") {
    if (!state.loaderVisible) {
      return true;
    }

    state.loaderVisible = false;

    try {
      hideLoader(
        AppCore,
        {
          reason,
          state,

          minVisibleMs:
            MIN_BOOT_LOADER_MS,

          finalize: true,
          allowDuringBoot: true,
        }
      );
    } catch {}

    safeEmit(
      BOOT_EVENTS.loaderHide,
      {
        reason,
        loaderSnapshot:
          getBootLoaderSnapshot(),
      }
    );

    return true;
  }

  function forceHideBootLoader(reason = "force-hide") {
    state.loaderVisible = false;

    try {
      forceHideLoader(
        AppCore,
        {
          reason,
          minVisibleMs: 0,
          state,
          force: true,
        }
      );
    } catch {
      try {
        hideLoader(
          AppCore,
          {
            reason,
            state,
            minVisibleMs: 0,
            force: true,
            allowDuringBoot: true,
          }
        );
      } catch {}
    }

    safeEmit(
      BOOT_EVENTS.loaderForceHide,
      {
        reason,
        loaderSnapshot:
          getBootLoaderSnapshot(),
      }
    );

    return true;
  }

  /* =======================================================
     INIT BLOCKS
  ======================================================= */

  function bindGlobalHandlersBlock() {
    if (state.handlersBound) {
      return true;
    }

    try {
      bindGlobalErrorHandlers?.({
        AppCore,
        Toast,
        scope:
          APP_SCOPES?.errors ||
          DEFAULT_SCOPE,
      });
    } catch {}

    state.handlersBound = true;

    return true;
  }

  function bindAppEventsBlock() {
    if (state.appEventsBound) {
      bindUIRepairEvents();
      return true;
    }

    try {
      bindAppEvents?.({
        AppCore,
        Auth,
        Router,
        Store,
        SidebarUI,
        TopbarUI,
        Toast,
        I18n,

        syncUserUI:
          ({
            reason = "app-events:sync-user-ui",
            payload = {},
          } = {}) => {
            return callSyncUserUI(
              reason,
              payload
            );
          },

        rerenderCurrentRoute:
          (payload = {}) => {
            return rerenderCurrentRoute?.({
              AppCore,
              Router,
              I18n,
              ...safeObject(payload),
            });
          },

        applyPostRenderLoaderPolicy:
          (payload = {}) => {
            return applyPostRenderLoaderPolicy?.({
              AppCore,
              Router,
              hideLoader,
              forceHideLoader: false,
              hideLoaderOnPostRender: true,
              ...safeObject(payload),
            });
          },
      });
    } catch (error) {
      safeWarn(
        "bindAppEvents() falló.",
        error
      );
    }

    bindUIRepairEvents();

    state.appEventsBound = true;

    return true;
  }

  function initServices() {
    if (state.servicesReady) {
      return true;
    }

    try {
      Http?.init?.({
        AppCore,
        Auth,
        Store,
      });
    } catch {
      try {
        Http?.init?.();
      } catch (error) {
        safeWarn(
          "No se pudo inicializar Http.",
          error
        );
      }
    }

    state.servicesReady = true;

    return true;
  }

  function initStoreBlock() {
    if (state.storeReady) {
      return true;
    }

    try {
      Store?.init?.({
        AppCore,
        Auth,
        Http,
      });
    } catch {
      try {
        Store?.init?.();
      } catch (error) {
        safeWarn(
          "No se pudo inicializar Store.",
          error
        );
      }
    }

    state.storeReady = true;

    return true;
  }

  function initI18nBlock() {
    try {
      initI18n?.({
        AppCore,
        I18n,
        Router,
        state,
      });
    } catch (error) {
      safeWarn(
        "initI18n() falló.",
        error
      );
    }

    try {
      syncLangState?.({
        AppCore,
        I18n,
        Router,
        reason: "app-index:init-i18n",
      });
    } catch {}

    return true;
  }

  function configureRouterBlock() {
    if (state.routerConfigured) {
      exposeRuntimeModulesToCore();
      return true;
    }

    exposeRuntimeModulesToCore();

    let configured = false;

    try {
      if (isFunction(configureRouter)) {
        const result =
          configureRouter({
            AppCore,
            Auth,
            Router,
            Store,
            I18n,
          });

        configured = result !== false;
      }
    } catch (error) {
      safeWarn(
        "configureRouter() falló. Intentando Router.configure().",
        error
      );
    }

    if (!configured) {
      try {
        if (isFunction(Router?.configure)) {
          const result =
            Router.configure({
              core: AppCore,
              AppCore,

              auth: Auth,
              Auth,

              store: Store,
              Store,

              i18n: I18n,
              I18n,

              app: api,
            });

          configured = result !== false;
        }
      } catch (error) {
        safeWarn(
          "Router.configure() falló.",
          error
        );
      }
    }

    state.routerConfigured = Boolean(configured);

    safeEmit(
      "app:router:configured",
      {
        configured:
          Boolean(configured),
      }
    );

    if (!configured) {
      throw new Error("Router no pudo configurarse.");
    }

    return true;
  }

  function bindRouterBlock(reason = "bind-router") {
    if (state.routerBound) {
      return true;
    }

    let bound = false;

    try {
      if (isFunction(bindRouter)) {
        const result =
          bindRouter({
            AppCore,
            Auth,
            Router,
            Store,
            I18n,
          });

        bound = result !== false;
      }
    } catch (error) {
      safeWarn(
        "bindRouter() falló. Intentando Router.bind().",
        error
      );
    }

    if (!bound) {
      try {
        if (isFunction(Router?.bind)) {
          const result =
            Router.bind({
              AppCore,
              Auth,
              Store,
              I18n,
            });

          bound = result !== false;
        }
      } catch {}
    }

    exposeRuntimeModulesToCore();

    state.routerBound = Boolean(bound);

    safeEmit(
      "app:router:bound",
      {
        reason,
        bound:
          Boolean(bound),
      }
    );

    if (!bound) {
      safeWarn(
        "Router bind no confirmado.",
        {
          reason,
        }
      );
    }

    return Boolean(bound);
  }

  function safeEmitUIReady() {
    safeEmit(
      APP_EVENTS?.uiReady ||
        "app:ui:ready",
      {
        sidebarSnapshot:
          getSidebarSnapshot(),

        topbarSnapshot:
          getTopbarSnapshot(),
      }
    );
  }

  function initUIBlock() {
    if (state.uiReady) {
      repairUISystems(
        UI_REPAIR_REASONS?.alreadyReady ||
          "init-ui-already-ready",
        {
          repairShell: false,
          syncUser: true,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          source: "init-ui-already-ready",
        }
      );

      return true;
    }

    let uiOk = false;

    try {
      const result =
        initUISystems({
          AppCore,
          Toast,
          SidebarUI,
          TopbarUI,
          Auth,
          Router,
          Store,
          I18n,
          state,
          scope:
            APP_SCOPES?.ui ||
            "app:ui",
        });

      uiOk = result !== false;
    } catch (error) {
      uiOk = false;

      safeWarn(
        "initUISystems() falló.",
        error
      );
    }

    state.uiReady = Boolean(uiOk);
    state.uiMounted = Boolean(uiOk);

    try {
      setCoreBootFlag("uiReady", Boolean(uiOk));
      setCoreBootFlag("uiMounted", Boolean(uiOk));
      setCoreBootFlag("uiInitialized", Boolean(uiOk));
    } catch {}

    if (!uiOk) {
      safeWarn(
        "UI no quedó inicializada completamente."
      );

      return false;
    }

    callSyncUserUI("init-ui:post-mount");

    repairUISystems(
      UI_REPAIR_REASONS?.init ||
        "init-ui",
      {
        repairShell: true,
        syncUser: true,
        hardRepair: false,
        rebind: false,
        afterPaint: true,
        source: "init-ui",
      }
    );

    safeEmitUIReady();

    return true;
  }

  async function renderInitialRouteSafe(payload = {}) {
    const opts = safeObject(payload);

    if (isFunction(renderInitialRoute)) {
      try {
        const result =
          await Promise.resolve(
            renderInitialRoute({
              AppCore,
              Auth,
              Router,
              Store,
              I18n,
              Toast,

              getViewContainer,
              setShellVisibility,
              updateShellVisibilityByRoute,

              applyPostRenderLoaderPolicy:
                (policyPayload = {}) => {
                  return applyPostRenderLoaderPolicy?.({
                    AppCore,
                    Router,
                    hideLoader,
                    ...safeObject(policyPayload),
                  });
                },

              ...opts,
            })
          );

        return result;
      } catch (error) {
        safeWarn(
          "renderInitialRoute() con deps falló. Intentando firma legacy.",
          error
        );
      }

      try {
        return await Promise.resolve(
          renderInitialRoute()
        );
      } catch (error) {
        safeWarn(
          "renderInitialRoute() legacy falló. Intentando Router.render().",
          error
        );
      }
    }

    const routeSnapshot = getCurrentRouteSnapshot();

    try {
      return await Promise.resolve(
        Router?.render?.(
          routeSnapshot.publicPath ||
            routeSnapshot.route ||
            DEFAULT_ROUTE ||
            "/",
          {
            force: true,
            replaceState: true,

            reason:
              opts.reason ||
              "app-index-render-fallback",

            source: BOOT_SOURCE,

            preservePublicPath: true,
            preserveSearch: true,
            preserveHash: true,
          }
        )
      );
    } catch (error) {
      safeWarn(
        "Router.render() fallback falló.",
        error
      );

      throw error;
    }
  }

  async function renderInitialRouteBlock({
    cycleId,
    reason = "initial",
  } = {}) {
    if (isStale(cycleId)) {
      return null;
    }

    if (state.initialRouteRendered) {
      safeLog(
        "renderInitialRoute omitido: ya renderizado.",
        {
          reason,
        }
      );

      return null;
    }

    const result =
      await renderInitialRouteSafe({
        reason,
        source: BOOT_SOURCE,
        cycleId,
      });

    if (!isStale(cycleId)) {
      markInitialRouteRendered(true);

      repairUISystems(
        `render-initial-route:${reason}`,
        {
          repairShell: false,
          syncUser: true,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          source: "render-initial-route",
        }
      );
    }

    return result;
  }

  async function restoreSessionBlock({
    cycleId,
    nonBlocking = false,
    skipPostRestoreNavigation = false,
  } = {}) {
    if (isStale(cycleId)) {
      return null;
    }

    if (!isFunction(restoreSessionInBackground)) {
      safeWarn(
        "restoreSessionInBackground no disponible."
      );

      return {
        ok: false,
        skipped: true,
        reason: "restore-session-unavailable",
      };
    }

    if (state.restorePromise) {
      return state.restorePromise;
    }

    state.restorePromise =
      restoreSessionInBackground({
        AppCore,
        Auth,
        Router,
        Store,
        state,

        syncUserUI:
          () => {
            callSyncUserUI("restore-session");
          },

        warmup,

        skipPostRestoreNavigation:
          Boolean(skipPostRestoreNavigation),
      });

    try {
      const result = await state.restorePromise;

      if (!isStale(cycleId)) {
        repairUISystems(
          UI_REPAIR_REASONS?.restore ||
            "restore-session",
          {
            repairShell: false,
            syncUser: true,
            hardRepair: false,
            rebind: false,
            afterPaint: false,
            source: "restore-session",
          }
        );
      }

      return result;
    } catch (error) {
      if (nonBlocking) {
        safeWarn(
          "Restore session no bloqueante falló.",
          error
        );

        if (!isStale(cycleId)) {
          repairUISystems(
            UI_REPAIR_REASONS?.restoreErrorNonBlocking ||
              "restore-session-error-non-blocking",
            {
              repairShell: false,
              syncUser: true,
              hardRepair: false,
              rebind: false,
              afterPaint: false,
              source: "restore-session-error",
            }
          );
        }

        return null;
      }

      throw error;
    } finally {
      if (!isStale(cycleId)) {
        state.restorePromise = null;
      }
    }
  }

  function startPublicTokenRestoreAfterInitialRender(cycleId) {
    void restoreSessionBlock({
      cycleId,
      nonBlocking: true,
      skipPostRestoreNavigation: true,
    })
      .then(() => {
        if (isStale(cycleId)) {
          return;
        }

        repairUISystems(
          "public-token-background-restore-complete",
          {
            repairShell: false,
            syncUser: true,
            hardRepair: false,
            rebind: false,
            afterPaint: false,
            source: "public-token-background-restore",
          }
        );
      })
      .catch((error) => {
        safeWarn(
          "Restore público en background falló.",
          error
        );
      });

    return true;
  }

  async function runWarmupBlock(reason = "warmup") {
    if (!isFunction(warmup)) {
      return null;
    }

    try {
      return await warmup({
        AppCore,
        Auth,
        Router,
        Store,
        SidebarUI,
        TopbarUI,
        Toast,
        I18n,
        reason,
      });
    } catch (error) {
      safeWarn(
        "warmup() falló.",
        error
      );

      return null;
    }
  }

  /* =======================================================
     FINALIZE
  ======================================================= */

  async function finalizeBoot(cycleId) {
    if (isStale(cycleId)) {
      return false;
    }

    if (state.finalizedCycleId === cycleId) {
      return true;
    }

    state.finalizedCycleId = cycleId;

    clearBootFailsafeTimer(state, AppCore);

    try {
      markStoreBootState(Store, {
        ready: true,
        booted: true,
        booting: false,
        loading: false,
        phase: BOOT_PHASE_VALUE.ready,
        cycleId,
        reason: "finalize-boot",
      });
    } catch {}

    markBooted(cycleId);

    repairShell("finalize-boot:pre-ui");

    repairUISystems(
      UI_REPAIR_REASONS?.finalize ||
        "finalize-boot",
      {
        repairShell: false,
        syncUser: true,
        hardRepair: false,
        rebind: false,
        afterPaint: false,
        source: "finalize-boot",
      }
    );

    afterPaint(() => {
      repairUISystems(
        "finalize-boot:after-paint-pre-hide",
        {
          repairShell: false,
          syncUser: false,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          emit: false,
          source: "finalize-boot:after-paint-pre-hide",
        }
      );
    });

    const remaining =
      Math.max(
        0,
        MIN_BOOT_LOADER_MS -
          (nowEpochMs() - state.loaderShownAt)
      );

    if (remaining > 0) {
      await wait(remaining);
    }

    hideBootLoader("finalize-boot");

    afterPaint(() => {
      repairShell("finalize-boot:post-loader-hide");

      repairUISystems(
        "finalize-boot:post-loader-hide",
        {
          repairShell: false,
          syncUser: true,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          emit: false,
          source: "finalize-boot:post-loader-hide",
        }
      );
    });

    void runWarmupBlock("after-finalize-boot");

    if (!state.readyEmitted) {
      state.readyEmitted = true;

      const readyAt = safeIsoDate();

      try {
        setWindowValue(RUNTIME_KEYS.lastReadyAt, readyAt);
      } catch {}

      safeEmit(
        BOOT_EVENTS.ready,
        {
          cycleId,
          at: readyAt,
        }
      );

      safeEmit(
        APP_EVENTS?.ready ||
          "app:ready",
        {
          cycleId,

          sidebarSnapshot:
            getSidebarSnapshot(),

          topbarSnapshot:
            getTopbarSnapshot(),

          loaderSnapshot:
            getBootLoaderSnapshot(),
        }
      );
    }

    persistBootSnapshot("finalize-boot");

    return true;
  }

  /* =======================================================
     BOOT FLOWS
  ======================================================= */

  async function doPublicTokenBoot(cycleId, bootContext) {
    safeLog(
      "Boot public-token-first.",
      sanitizeBootContextForLog(bootContext)
    );

    await runBootStep(
      "render-public-token-route",
      () => renderInitialRouteBlock({
        cycleId,
        reason: "public-token-first",
      }),
      {
        cycleId,
      }
    );

    bindRouterBlock("public-token-first");

    startPublicTokenRestoreAfterInitialRender(cycleId);

    return true;
  }

  async function doPrivateOrNormalBoot(cycleId) {
    const beforeRestore = getCurrentRouteSnapshot();

    const restoreResult =
      await runBootStep(
        "restore-session",
        () => restoreSessionBlock({
          cycleId,
          nonBlocking: false,
          skipPostRestoreNavigation: false,
        }),
        {
          cycleId,
        }
      );

    const afterRestore = getCurrentRouteSnapshot();

    const routeChangedByRestore =
      beforeRestore.route !== afterRestore.route ||
      beforeRestore.publicPath !== afterRestore.publicPath;

    if (
      didRestoreHandleNavigation(restoreResult) ||
      routeChangedByRestore
    ) {
      markBootNavigationHandled(true);

      safeLog(
        "renderInitialRoute omitido: restore ya resolvió navegación.",
        {
          ok:
            Boolean(safeObject(restoreResult).ok),

          route:
            afterRestore.route,

          publicPath:
            afterRestore.publicPath,

          routeChangedByRestore,
        }
      );

      markInitialRouteRendered(true);

      repairUISystems(
        UI_REPAIR_REASONS?.restoreNavigationHandled ||
          "restore-navigation-handled",
        {
          repairShell: false,
          syncUser: true,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          source: "restore-navigation-handled",
        }
      );
    } else {
      await runBootStep(
        "render-after-restore",
        () => renderInitialRouteBlock({
          cycleId,
          reason: "after-restore",
        }),
        {
          cycleId,
        }
      );
    }

    bindRouterBlock("after-initial-route");

    return true;
  }

  async function doBoot(cycleId, options = {}) {
    try {
      state.booting = true;
      state.lastBootOptions = sanitizePayload(options);

      resetCycleRuntimeState();
      markBooting(cycleId);

      if (options?.bootContext) {
        primeInitialUrlFromMainContext(options.bootContext);
      }

      const firstContext = refreshBootUrlContext();

      safeEmit(
        BOOT_EVENTS.start,
        {
          cycleId,
          bootUrlContext:
            sanitizeBootContextForLog(firstContext),
        }
      );

      showBootLoader("boot-start");

      refreshBootUrlContext();

      await runBootStep(
        "expose-runtime-modules:early",
        () => exposeRuntimeModulesToCore(),
        {
          cycleId,
        }
      );

      await runBootStep(
        "bind-global-handlers",
        () => bindGlobalHandlersBlock(),
        {
          cycleId,
        }
      );

      await runBootStep(
        "core-init",
        () => AppCore?.init?.({
          source: BOOT_SOURCE,
          cycleId,
        }),
        {
          cycleId,
        }
      );

      exposeRuntimeModulesToCore();

      if (isStale(cycleId)) {
        return api;
      }

      ensureScope(
        AppCore,
        DEFAULT_SCOPE
      );

      const bootContext = exposeBootUrlContextToCore();

      exposeRuntimeModulesToCore();

      await runBootStep(
        "bind-app-events",
        () => bindAppEventsBlock(),
        {
          cycleId,
        }
      );

      await runBootStep(
        "init-services",
        () => initServices(),
        {
          cycleId,
        }
      );

      await runBootStep(
        "init-store",
        () => initStoreBlock(),
        {
          cycleId,
        }
      );

      await runBootStep(
        "init-i18n",
        () => initI18nBlock(),
        {
          cycleId,
        }
      );

      await runBootStep(
        "configure-router",
        () => configureRouterBlock(),
        {
          cycleId,
        }
      );

      const uiOk =
        await runBootStep(
          "init-ui",
          () => initUIBlock(),
          {
            cycleId,
          }
        );

      if (!uiOk) {
        safeWarn(
          "Boot continúa con UI parcial.",
          {
            cycleId,
          }
        );
      }

      if (
        bootContext.isPublicTokenRoute &&
        bootContext.hasPublicToken
      ) {
        await doPublicTokenBoot(
          cycleId,
          bootContext
        );
      } else {
        await doPrivateOrNormalBoot(cycleId);
      }

      if (isStale(cycleId)) {
        return api;
      }

      repairUISystems(
        UI_REPAIR_REASONS?.beforeFinalize ||
          "before-finalize",
        {
          repairShell: false,
          syncUser: true,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          source: "before-finalize",
        }
      );

      await runBootStep(
        "finalize-boot",
        () => finalizeBoot(cycleId),
        {
          cycleId,
        }
      );

      return api;
    } catch (error) {
      state.booting = false;

      clearBootFailsafeTimer(state, AppCore);

      markBootFailed(
        cycleId,
        error
      );

      safeError(
        "Boot error.",
        error
      );

      safeEmit(
        BOOT_EVENTS.error,
        {
          cycleId,

          message:
            safeText(
              error?.message ||
                error,
              "Boot error."
            ),

          bootUrlContext:
            sanitizeBootContextForLog(
              refreshBootUrlContext()
            ),
        }
      );

      try {
        repairUISystems(
          UI_REPAIR_REASONS?.bootError ||
            "boot-error",
          {
            repairShell: false,
            syncUser: true,
            hardRepair: false,
            rebind: false,
            afterPaint: false,
            source: "boot-error",
          }
        );
      } catch {}

      try {
        forceHideBootLoader("boot-error");
      } catch {}

      try {
        renderBootError({
          AppCore,
          Auth,
          Toast,
          error,
          getViewContainer,
          setShellVisibility,
          hideLoader: forceHideLoader,
        });
      } catch {}

      persistBootSnapshot("boot-error");

      return api;
    }
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  function boot(options = {}) {
    const opts = safeObject(options);

    if (
      state.booted &&
      opts.force !== true
    ) {
      repairUISystems(
        UI_REPAIR_REASONS?.bootAlreadyBooted ||
          "boot-already-booted",
        {
          repairShell: false,
          syncUser: true,
          hardRepair: false,
          rebind: false,
          afterPaint: false,
          source: "boot-already-booted",
        }
      );

      return Promise.resolve(api);
    }

    if (
      state.bootPromise &&
      opts.force !== true
    ) {
      return state.bootPromise;
    }

    const cycleId = nextCycle();

    const promise = doBoot(
      cycleId,
      opts
    );

    state.bootPromise = promise;

    void promise
      .finally(() => {
        if (state.bootPromise === promise) {
          state.bootPromise = null;
        }
      })
      .catch(() => {});

    return promise;
  }

  async function reboot(options = {}) {
    const opts = safeObject(options);

    nextCycle();

    state.booted = false;
    state.booting = false;

    state.servicesReady = false;
    state.storeReady = false;

    state.uiReady = false;
    state.uiMounted = false;
    state.readyEmitted = false;

    state.routerBound = false;
    state.routerConfigured = false;

    state.finalizedCycleId = 0;
    state.restorePromise = null;
    state.bootPromise = null;

    state.runtimeModulesExposed = false;
    state.runtimeModulesExposeCount = 0;

    bridgeRegistryCache.clear();
    bridgeConflictWarnings.clear();

    resetCycleRuntimeState();

    try {
      clearBootFailsafeTimer(state, AppCore);
    } catch {}

    try {
      clearScope(
        AppCore,
        DEFAULT_SCOPE
      );
    } catch {}

    try {
      markRebootState?.(
        AppCore,
        Store,
        {
          reason:
            opts.reason ||
            "reboot-reset",
        }
      );
    } catch {}

    forceHideBootLoader("reboot-reset");

    return boot({
      force: true,
      reason:
        opts.reason ||
        "reboot",
      bootContext:
        opts.bootContext ||
        null,
    });
  }

  function destroy(options = {}) {
    const opts = safeObject(options);

    try {
      clearBootFailsafeTimer(state, AppCore);
    } catch {}

    if (opts.unbindWindowEvents !== false) {
      unbindWindowEvents();
    }

    if (opts.unbindBusEvents === true) {
      unbindBusEvents();
      state.uiRepairEventsBound = false;
      state.appEventsBound = false;
    }

    state.booting = false;
    state.bootPromise = null;
    state.restorePromise = null;
    state.loaderVisible = false;

    forceHideBootLoader("app-destroy");

    safeEmit(
      APP_EVENTS?.destroy ||
        "app:destroy",
      {
        reason:
          opts.reason ||
          "manual",
      }
    );

    return true;
  }

  function getState() {
    const context = refreshBootUrlContext();

    let routerSnapshot = null;
    let coreSnapshot = null;

    try {
      routerSnapshot =
        Router?.getSnapshot?.() ||
        Router?.getDebugSnapshot?.() ||
        null;
    } catch {}

    try {
      coreSnapshot =
        AppCore?.getSnapshot?.() ||
        AppCore?.getState?.() ||
        null;
    } catch {}

    return sanitizePayload({
      ...state,

      version: APP_BOOTSTRAP_VERSION,

      bootUrlContext:
        sanitizeBootContextForLog(context),

      isActivationBoot:
        isActivationBoot(),

      isResetConfirmBoot:
        isResetConfirmBoot(),

      isPublicTokenBoot:
        isPublicTokenBoot(),

      route:
        AppCore?.state?.route ||
        DEFAULT_ROUTE ||
        "/",

      publicPath:
        AppCore?.state?.publicPath ||
        DEFAULT_ROUTE ||
        "/",

      browserPublicPath:
        redactTokenInText(
          getBrowserPublicPath()
        ),

      sidebarSnapshot:
        getSidebarSnapshot(),

      topbarSnapshot:
        getTopbarSnapshot(),

      loaderSnapshot:
        getBootLoaderSnapshot(),

      routerSnapshot,
      coreSnapshot,

      bridgeRegistry: {
        registered:
          Array.from(bridgeRegistryCache.keys()),

        conflicts:
          Array.from(bridgeConflictWarnings),

        exposeCount:
          state.runtimeModulesExposeCount,
      },

      uiFirebreak: {
        uiRepairRunning,
        uiRepairScheduled,
        uiRepairLastAt,
        uiRepairLastKey,
        uiSyncRunning,
        uiSyncLastAt,
        uiSyncLastReason,
      },

      events: {
        boundWindowEvents:
          boundWindowEvents.map((item) => item.eventName),

        boundBusEvents:
          boundBusEvents.map((item) => item.eventName),
      },
    });
  }

  const api = {
    version: APP_BOOTSTRAP_VERSION,

    boot,
    reboot,
    destroy,
    getState,

    repairUI: repairUISystems,
    repairShell,
    syncUserUI: callSyncUserUI,

    showLoader: showBootLoader,
    hideLoader: hideBootLoader,
    forceHideLoader: forceHideBootLoader,
    getLoaderSnapshot: getBootLoaderSnapshot,

    exposeRuntimeModulesToCore,
    exposeRouterToCore,

    refreshBootUrlContext,

    isActivationBoot,
    isResetConfirmBoot,
    isPublicTokenBoot,

    unbindWindowEvents,
    unbindBusEvents,
  };

  try {
    if (isBrowser()) {
      window[RUNTIME_KEYS.appApi] = api;
    }
  } catch {}

  return api;
})();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default App;

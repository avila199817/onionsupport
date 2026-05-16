/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   APP ORCHESTRATOR · SIMPLE · CORE ALIGNED

   Responsabilidad:
   - Orquestar boot lógico de la SPA.
   - Delegar en Core/Auth/Router/UI/I18n/Store/Services.
   - No autoarrancar salvo override explícito.
   - No duplicar HTTP/Auth/Router.
   - Preservar rutas públicas técnicas con token.
   - Render token routes antes de restore.
   - Restore normal antes de render privado.
   - Sin lógica de negocio.
========================================================= */

import { AppCore } from "../core/index.js";
import { Store } from "../store/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";
import { Http as ServiceHttp } from "../services/index.js";

import { SidebarUI } from "../ui/sidebar/index.js";
import { TopbarUI } from "../ui/topbar/index.js";
import { Toast } from "../ui/toast/index.js";
import { I18n } from "../i18n/index.js";

import {
  showLoader,
  hideLoader,
  forceHideLoader,
} from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  updateShellVisibilityByRoute,
  applyPostRenderLoaderPolicy,
} from "./shell.js";

import {
  initI18n,
  syncLangState,
} from "./i18n.js";

import {
  initUISystems,
  syncUserUI,
  repairUISystems,
} from "./ui.js";

import {
  configureRouter,
  bindRouter,
  renderInitialRoute,
} from "./router.js";

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
  warmup,
} from "./warmup.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const APP_VERSION = "18.0.0-clean-core-aligned";

const SOURCE = "app:index";
const RUNTIME_APP_KEY = "__ONION_APP__";
const AUTO_BOOT_KEY = "__ONION_ALLOW_APP_AUTO_BOOT__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";

const DEFAULT_ROUTE = "/";

const TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
  "resetToken",
  "passwordResetToken",
  "reset_token",
  "password_reset_token",
  "confirmToken",
  "confirm_token",
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
  "otpToken",
  "otp_token",
  "authorization",
  "auth",
  "jwt",
  "sid",
]);

const PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    canonicalPath: "/activate-account",
    paths: Object.freeze([
      "/activate-account",
      "/activate",
      "/activation",
      "/account/activate",
      "/activate/first-user",
    ]),
    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),
    scrubFlags: Object.freeze([
      "scrubbedActivationToken",
      "activationTokenScrubbed",
      "scrubbedActivateAccountToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),
    tokenParams: Object.freeze([
      "token",
      "activationToken",
      "activateToken",
      "activation_token",
      "activate_token",
      "code",
      "t",
    ]),
  }),

  Object.freeze({
    key: "resetConfirm",
    canonicalPath: "/reset-password/confirm",
    paths: Object.freeze([
      "/reset-password/confirm",
      "/reset-password-confirm",
      "/password-reset/confirm",
      "/password-reset-confirm",
      "/confirm-reset-password",
    ]),
    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),
    scrubFlags: Object.freeze([
      "scrubbedResetToken",
      "resetTokenScrubbed",
      "scrubbedResetConfirmToken",
      "scrubbedPasswordResetToken",
      "scrubbedResetPasswordToken",
      "scrubbedPublicTokenRoute",
      "scrubbedTokenRoute",
    ]),
    tokenParams: Object.freeze([
      "token",
      "resetToken",
      "passwordResetToken",
      "reset_token",
      "password_reset_token",
      "confirmToken",
      "confirm_token",
      "code",
      "t",
    ]),
  }),
]);

/* =========================================================
   RUNTIME
========================================================= */

let bootPromise = null;
let booted = false;
let booting = false;
let eventsBound = false;

let lastError = null;
let lastReadyAt = "";

const disposers = [];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(value) {
  return isObject(value) ? value : {};
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeCall(fn, fallback = null, ...args) {
  try {
    return isFn(fn) ? fn(...args) : fallback;
  } catch {
    return fallback;
  }
}

function safeAsync(fn, fallback = null, ...args) {
  try {
    return Promise.resolve(isFn(fn) ? fn(...args) : fallback);
  } catch {
    return Promise.resolve(fallback);
  }
}

/* =========================================================
   REDACTION
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value = "") {
  let output = text(value, "");

  if (!output) return "";

  for (const param of TOKEN_PARAM_NAMES) {
    try {
      output = output.replace(
        new RegExp(`([?&#]${escapeRegExp(param)}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    } catch {}
  }

  for (const route of PUBLIC_TOKEN_ROUTES) {
    for (const path of route.paths) {
      try {
        output = output.replace(
          new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  try {
    output = output
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 5) return "[MaxDepth]";

  if (/token|secret|password|authorization|credential|cookie|jwt|bearer|session|refresh|otp|mfa|2fa|code/i.test(keyHint)) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redact(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return {
      name: text(value.name, "Error"),
      message: redact(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      stack: value.stack ? "[stack]" : "",
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1, keyHint));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitize(item, depth + 1, key);
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function debugEnabled() {
  try {
    return Boolean(AppCore?.config?.debug || AppCore?.config?.diagnostics?.enabled);
  } catch {
    return false;
  }
}

function log(...args) {
  if (!debugEnabled()) return;

  try {
    AppCore?.utils?.log?.("[App]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.log("[App]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[App]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.warn("[App]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function errorLog(...args) {
  try {
    AppCore?.utils?.error?.("[App]", ...args.map((item) => sanitize(item)));
    return;
  } catch {}

  try {
    console.error("[App]", ...args.map((item) => sanitize(item)));
  } catch {}
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");

  if (!name) return false;

  const detail = sanitize({
    source: SOURCE,
    version: APP_VERSION,
    at: isoNow(),
    ...object(payload),
  });

  let emitted = false;
  let hasBus = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, detail);
      emitted = true;
    }
  } catch {}

  if ((options.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

/* =========================================================
   PATH / PUBLIC TOKEN BOOT
========================================================= */

function origin() {
  if (isBrowser() && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "");
  if (!raw) return DEFAULT_ROUTE;
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizePathname(value = DEFAULT_ROUTE) {
  let path = text(value, DEFAULT_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) path = `/${path}`;

  const output = [];

  for (const part of path.split("/").filter(Boolean)) {
    if (part === ".") continue;

    if (part === "..") {
      output.pop();
      continue;
    }

    output.push(part);
  }

  path = `/${output.join("/")}`;

  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function splitPath(value = DEFAULT_ROUTE) {
  let raw = text(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    raw = normalizeHashRouterPath(raw);
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? (search.startsWith("?") ? search : `?${search}`) : "",
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "",
  };
}

function toLocalPath(value = DEFAULT_ROUTE) {
  const raw = text(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return toLocalPath(normalizeHashRouterPath(raw));
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const url = new URL(raw, origin());

      if (url.origin !== origin()) {
        return DEFAULT_ROUTE;
      }

      if (url.hash && isHashRouterPath(url.hash)) {
        return toLocalPath(normalizeHashRouterPath(url.hash));
      }

      return toLocalPath(`${url.pathname || DEFAULT_ROUTE}${url.search || ""}${url.hash || ""}`);
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  const parts = splitPath(raw);
  return `${parts.pathname}${parts.search}${parts.hash}`;
}

function stripSearchHash(value = DEFAULT_ROUTE) {
  return splitPath(toLocalPath(value)).pathname || DEFAULT_ROUTE;
}

function stripUsernamePrefix(pathname = DEFAULT_ROUTE) {
  const clean = normalizePathname(pathname);
  const parts = clean.split("/").filter(Boolean);

  if (/^@[A-Za-z0-9._-]{1,80}$/.test(parts[0] || "")) {
    const rest = parts.slice(1).join("/");
    return rest ? normalizePathname(`/${rest}`) : DEFAULT_ROUTE;
  }

  return clean;
}

function canonicalPath(value = DEFAULT_ROUTE) {
  return stripUsernamePrefix(stripSearchHash(value));
}

function getBrowserPublicPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;

    if (hash && isHashRouterPath(hash)) {
      return toLocalPath(normalizeHashRouterPath(hash));
    }

    return toLocalPath(`${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`);
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getBrowserHref() {
  if (!isBrowser()) return "";

  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function getCurrentPath() {
  try {
    return Router?.getCurrentPublicPath?.() || getBrowserPublicPath();
  } catch {
    return getBrowserPublicPath();
  }
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");
    return names.some((name) => Boolean(text(params.get(name), "")));
  } catch {
    return false;
  }
}

function getPathToken(route, value = "") {
  const clean = canonicalPath(toLocalPath(value));

  for (const path of route.paths) {
    if (!clean.startsWith(`${path}/`)) continue;

    const token = clean.slice(`${path}/`.length).split("/")[0];

    try {
      return text(decodeURIComponent(token || ""), "");
    } catch {
      return text(token, "");
    }
  }

  return "";
}

function hasRouteToken(route, value = "") {
  const raw = text(value, "");

  if (!raw) return false;
  if (getPathToken(route, raw)) return true;

  try {
    const url = new URL(raw, origin());

    if (url.origin !== origin()) return false;

    if (hasTokenInSearch(url.search, route.tokenParams)) return true;

    if (url.hash && isHashRouterPath(url.hash)) {
      const hashPath = normalizeHashRouterPath(url.hash);

      if (getPathToken(route, hashPath)) return true;

      const hashParts = splitPath(hashPath);

      if (hasTokenInSearch(hashParts.search, route.tokenParams)) return true;
    }

    if (url.hash && url.hash.includes("?")) {
      const query = url.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", route.tokenParams);
    }
  } catch {
    const parts = splitPath(raw);

    if (hasTokenInSearch(parts.search, route.tokenParams)) return true;

    if (parts.hash && parts.hash.includes("?")) {
      const query = parts.hash.split("?").slice(1).join("?");
      return hasTokenInSearch(query ? `?${query}` : "", route.tokenParams);
    }
  }

  return false;
}

function historyState() {
  if (!isBrowser()) return {};

  try {
    return object(window.history?.state);
  } catch {
    return {};
  }
}

function isScrubbed(route) {
  const state = historyState();

  return route.scrubFlags.some((flag) => Boolean(state[flag]));
}

function getPublicTokenBoot() {
  if (!isBrowser()) {
    return {
      active: false,
      route: null,
      publicPath: DEFAULT_ROUTE,
      href: "",
    };
  }

  const href = getBrowserHref();
  const publicPath = getBrowserPublicPath();
  const clean = canonicalPath(publicPath);

  for (const route of PUBLIC_TOKEN_ROUTES) {
    const matches = route.paths.some((path) => clean === path || clean.startsWith(`${path}/`));

    if (!matches || isScrubbed(route)) continue;

    if (hasRouteToken(route, href) || hasRouteToken(route, publicPath)) {
      return {
        active: true,
        route,
        key: route.key,
        publicPath,
        canonicalPath: route.canonicalPath,
        href,
      };
    }
  }

  return {
    active: false,
    route: null,
    publicPath,
    canonicalPath: clean,
    href,
  };
}

function setWindowValueOnce(key = "", value = "") {
  if (!isBrowser() || !key || !value) return false;

  try {
    if (!window[key]) window[key] = value;
    return true;
  } catch {
    return false;
  }
}

function patchBootContext(patch = {}) {
  if (!isBrowser()) return false;

  try {
    window.__ONION_BOOT_CONTEXT__ = {
      ...object(window.__ONION_BOOT_CONTEXT__),
      ...object(patch),
    };

    return true;
  } catch {
    return false;
  }
}

function captureInitialUrl() {
  if (!isBrowser()) return null;

  const boot = getPublicTokenBoot();

  try {
    const href = getBrowserHref();

    if (href) {
      setWindowValueOnce("__ONION_INITIAL_URL__", href);
    }

    if (boot.active && boot.route) {
      for (const key of boot.route.windowKeys) {
        setWindowValueOnce(key, href);
      }

      patchBootContext({
        bootProtectedInitialUrl: href,
        bootProtectedInitialPublicPath: boot.publicPath,
        bootProtectedInitialPath: boot.canonicalPath,
        bootProtectedRouteKey: boot.key,
        bootIsPublicTokenRoute: true,
        bootHasPublicToken: true,
      });
    }
  } catch {}

  return boot;
}

/* =========================================================
   CORE BRIDGES / DEPS
========================================================= */

function getCoreHttp() {
  try {
    return (
      AppCore?.getHttpClient?.() ||
      AppCore?.Http ||
      AppCore?.http ||
      AppCore?.services?.http ||
      AppCore?.services?.api ||
      AppCore?.apiClient ||
      null
    );
  } catch {
    return null;
  }
}

function registerCoreModule(name = "", value = null, aliases = []) {
  const cleanName = text(name, "");

  if (!cleanName || !value) return false;

  try {
    AppCore?.modules?.register?.(cleanName, value, {
      overwrite: true,
      replace: true,
      aliases,
      source: SOURCE,
      silent: true,
      emit: false,
    });

    return true;
  } catch {}

  try {
    AppCore?.modules?.set?.(cleanName, value, {
      overwrite: true,
      replace: true,
      source: SOURCE,
      emit: false,
    });

    return true;
  } catch {}

  try {
    AppCore.registry.modules.set(cleanName, value);
    return true;
  } catch {
    return false;
  }
}

function exposeModulesToCore() {
  if (!AppCore || typeof AppCore !== "object") return false;

  try {
    AppCore.Router = Router;
    AppCore.router = Router;
  } catch {}

  try {
    AppCore.Auth = Auth;
    AppCore.auth = Auth;
  } catch {}

  try {
    AppCore.Store = Store;
    AppCore.store = Store;
  } catch {}

  try {
    AppCore.Toast = Toast;
    AppCore.toast = Toast;
  } catch {}

  try {
    AppCore.I18n = I18n;
    AppCore.i18n = I18n;
  } catch {}

  try {
    AppCore.SidebarUI = SidebarUI;
    AppCore.sidebarUI = SidebarUI;
    AppCore.sidebar = SidebarUI;

    AppCore.TopbarUI = TopbarUI;
    AppCore.topbarUI = TopbarUI;
    AppCore.topbar = TopbarUI;
  } catch {}

  registerCoreModule("App", App, ["app"]);
  registerCoreModule("Router", Router, ["router"]);
  registerCoreModule("Auth", Auth, ["auth"]);
  registerCoreModule("Store", Store, ["store"]);
  registerCoreModule("Toast", Toast, ["toast"]);
  registerCoreModule("I18n", I18n, ["i18n"]);
  registerCoreModule("SidebarUI", SidebarUI, ["sidebarUI", "sidebar"]);
  registerCoreModule("TopbarUI", TopbarUI, ["topbarUI", "topbar"]);

  try {
    AppCore.services = AppCore.services || {};
    AppCore.services.serviceHttp = ServiceHttp;

    if (!AppCore.services.http) {
      AppCore.services.http = getCoreHttp() || ServiceHttp;
    }

    if (!AppCore.services.api) {
      AppCore.services.api = AppCore.services.http;
    }
  } catch {}

  return true;
}

function buildDeps(extra = {}) {
  return {
    AppCore,
    App,

    Store,
    Auth,
    Router,

    Http: getCoreHttp() || ServiceHttp,
    ServiceHttp,

    SidebarUI,
    TopbarUI,
    Toast,
    I18n,

    getViewContainer,
    setShellVisibility,
    updateShellVisibilityByRoute,
    applyPostRenderLoaderPolicy,

    ...object(extra),
  };
}

function setState(patch = {}, options = {}) {
  const cleanPatch = object(patch);

  if (!Object.keys(cleanPatch).length) return false;

  try {
    AppCore?.setState?.(cleanPatch, {
      source: SOURCE,
      emit: false,
      emitState: false,
      emitDerived: false,
      silent: true,
      ...object(options),
    });

    return true;
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, cleanPatch);
      return true;
    }
  } catch {}

  return false;
}

function callInit(target, deps = {}, names = ["init"]) {
  if (!target) return true;

  for (const name of names) {
    if (!isFn(target?.[name])) continue;

    try {
      const result = target[name](deps);
      return result !== false;
    } catch (errorWithDeps) {
      try {
        const result = target[name]();
        return result !== false;
      } catch (errorWithoutDeps) {
        warn(`${name} falló.`, errorWithoutDeps || errorWithDeps);
        return false;
      }
    }
  }

  return true;
}

/* =========================================================
   BOOT STEPS
========================================================= */

async function initCore() {
  exposeModulesToCore();

  if (isFn(AppCore?.installHttpBridge)) {
    safeCall(() => AppCore.installHttpBridge("app:init"));
  }

  if (isFn(AppCore?.init)) {
    await AppCore.init({
      source: SOURCE,
      version: APP_VERSION,
    });
  }

  exposeModulesToCore();

  setState({
    appVersion: APP_VERSION,
    appBooting: true,
    appReady: false,
    appBooted: false,
    appSource: SOURCE,
  });

  return true;
}

async function initServices() {
  callInit(ServiceHttp, buildDeps(), ["init", "boot", "start"]);

  setState({
    servicesReady: true,
  });

  return true;
}

async function initStore() {
  callInit(Store, buildDeps(), ["init", "boot", "start"]);

  setState({
    storeReady: true,
  });

  return true;
}

async function initLanguage() {
  try {
    await safeAsync(initI18n, true, buildDeps());
  } catch (error) {
    warn("initI18n falló.", error);
  }

  try {
    await safeAsync(
      syncLangState,
      true,
      buildDeps({
        reason: "app-boot",
      })
    );
  } catch {}

  setState({
    i18nReady: true,
    i18nInitialized: true,
  });

  return true;
}

async function initRouter() {
  let configured = false;

  try {
    configured = configureRouter?.(buildDeps()) !== false;
  } catch (error) {
    warn("configureRouter falló.", error);
  }

  if (!configured && isFn(Router?.configure)) {
    try {
      configured = Router.configure(buildDeps()) !== false;
    } catch (error) {
      warn("Router.configure falló.", error);
    }
  }

  if (!configured) {
    throw new Error("No se pudo configurar el Router.");
  }

  let bound = false;

  try {
    bound = bindRouter?.(buildDeps()) !== false;
  } catch (error) {
    warn("bindRouter falló.", error);
  }

  if (!bound && isFn(Router?.bind)) {
    try {
      bound = Router.bind(buildDeps()) !== false;
    } catch (error) {
      warn("Router.bind falló.", error);
    }
  }

  setState({
    routerReady: true,
    routerBound: Boolean(bound),
  });

  return true;
}

async function initUI() {
  let ok = false;

  try {
    ok = initUISystems?.(
      buildDeps({
        state: getState(),
        scope: "app:ui",
      })
    ) !== false;
  } catch (error) {
    warn("initUISystems falló.", error);
  }

  try {
    syncUserUI?.(
      buildDeps({
        reason: "app-boot",
      })
    );
  } catch {}

  try {
    repairUISystems?.(
      buildDeps({
        reason: "app-boot",
      })
    );
  } catch {}

  setState({
    uiReady: Boolean(ok),
    uiInitialized: Boolean(ok),
  });

  return true;
}

async function bindEvents() {
  if (eventsBound) return true;

  eventsBound = true;

  try {
    const disposer = bindGlobalErrorHandlers?.(
      buildDeps({
        scope: "app:errors",
      })
    );

    if (isFn(disposer)) disposers.push(disposer);
  } catch {}

  try {
    const disposer = bindAppEvents?.(
      buildDeps({
        scope: "app:events",

        syncUserUI: () => {
          try {
            syncUserUI?.(
              buildDeps({
                reason: "app-event",
              })
            );
          } catch {}
        },

        repairUISystems: () => {
          try {
            repairUISystems?.(
              buildDeps({
                reason: "app-event",
              })
            );
          } catch {}
        },
      })
    );

    if (isFn(disposer)) disposers.push(disposer);
  } catch {}

  return true;
}

/* =========================================================
   SESSION / ROUTER FLOW
========================================================= */

async function restoreSession({ skipNavigation = false } = {}) {
  if (!isFn(restoreSessionInBackground)) return null;

  try {
    const result = await restoreSessionInBackground(
      buildDeps({
        state: getState(),
        warmup,

        skipNavigation,
        skipRedirect: skipNavigation,
        noRedirect: skipNavigation,
        skipPostRestoreNavigation: skipNavigation,

        syncUserUI: () => {
          try {
            syncUserUI?.(
              buildDeps({
                reason: "restore-session",
              })
            );
          } catch {}
        },
      })
    );

    return result || null;
  } catch (error) {
    warn("restoreSession falló.", error);
    return null;
  }
}

function restoreHandledNavigation(result = null) {
  const payload = object(result);

  return Boolean(
    payload.navigationHandled ||
      payload.navigated ||
      payload.redirected ||
      payload.routeChanged ||
      payload.rendered ||
      AppCore?.state?.bootNavigationHandled ||
      AppCore?.state?.initialRouteRendered
  );
}

async function renderRoute(reason = "initial") {
  const path = getCurrentPath();

  if (isFn(renderInitialRoute)) {
    return renderInitialRoute(
      buildDeps({
        reason,
        source: SOURCE,
        path,
        publicPath: path,
      })
    );
  }

  if (isFn(Router?.render)) {
    return Router.render(path, {
      force: true,
      forceRender: true,
      preservePublicPath: true,
      preserveUrl: true,
      reason,
      source: SOURCE,
    });
  }

  if (isFn(Router?.navigate)) {
    return Router.navigate(path, {
      force: true,
      forceRender: true,
      preservePublicPath: true,
      preserveUrl: true,
      reason,
      source: SOURCE,
    });
  }

  throw new Error("No hay función disponible para renderizar la ruta inicial.");
}

/* =========================================================
   FINALIZE / ERROR
========================================================= */

async function finalizeBoot() {
  try {
    syncUserUI?.(
      buildDeps({
        reason: "finalize-boot",
      })
    );
  } catch {}

  try {
    repairUISystems?.(
      buildDeps({
        reason: "finalize-boot",
      })
    );
  } catch {}

  booted = true;
  booting = false;
  lastReadyAt = isoNow();

  setState({
    appBooting: false,
    appReady: true,
    appBooted: true,
    appReadyAt: lastReadyAt,
    ready: true,
    booting: false,
  });

  try {
    hideLoader(AppCore, {
      reason: "app-ready",
      minVisibleMs: 300,
      finalize: true,
    });
  } catch {}

  try {
    await warmup?.(
      buildDeps({
        reason: "after-boot",
      })
    );
  } catch {}

  emit("app:boot:complete", {
    at: lastReadyAt,
  });

  emit("app:ready", {
    at: lastReadyAt,
  });

  log("ready", {
    at: lastReadyAt,
  });

  return true;
}

function renderFatal(error) {
  try {
    forceHideLoader(AppCore, {
      reason: "app-boot-error",
      force: true,
    });
  } catch {}

  try {
    renderBootError({
      AppCore,
      Auth,
      Router,
      Toast,
      error,
      getViewContainer,
      setShellVisibility,
      hideLoader: forceHideLoader,
    });
  } catch (renderError) {
    errorLog("No se pudo renderizar boot error.", renderError);
  }
}

function failBoot(error) {
  lastError = error;
  booted = false;
  booting = false;

  const message = text(error?.message || error, "Boot error");

  setState({
    appBooting: false,
    appReady: false,
    appBooted: false,
    appError: true,
    appLastError: {
      message,
      name: text(error?.name, "Error"),
      at: isoNow(),
    },
    booting: false,
    ready: false,
  });

  emit("app:boot:error", {
    message,
  });

  renderFatal(error);

  return App;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot(options = {}) {
  const opts = object(options);
  const tokenBoot = captureInitialUrl();

  booting = true;
  booted = false;
  lastError = null;

  setState({
    appBooting: true,
    appReady: false,
    appBooted: false,
    appError: false,
    appSource: text(opts.source, SOURCE),
    appPublicTokenBoot: Boolean(tokenBoot?.active),
    booting: true,
    ready: false,
  });

  emit("app:boot:start", {
    publicTokenBoot: Boolean(tokenBoot?.active),
    publicTokenRouteKey: tokenBoot?.key || null,
    path: redact(tokenBoot?.publicPath || getBrowserPublicPath()),
  });

  try {
    showLoader(AppCore, {
      booting: true,
      reason: "app-boot",
    });
  } catch {}

  await initCore();
  await bindEvents();
  await initServices();
  await initStore();
  await initLanguage();
  await initRouter();
  await initUI();

  if (tokenBoot?.active) {
    await renderRoute("public-token-first");

    void restoreSession({
      skipNavigation: true,
    });

    setState({
      appPublicTokenRouteRendered: true,
    });
  } else {
    const restoreResult = await restoreSession({
      skipNavigation: false,
    });

    if (!restoreHandledNavigation(restoreResult)) {
      await renderRoute("after-restore");
    }
  }

  await finalizeBoot();

  return App;
}

export function boot(options = {}) {
  const opts = object(options);

  if (booted && opts.force !== true) {
    return Promise.resolve(App);
  }

  if (bootPromise && opts.force !== true) {
    return bootPromise;
  }

  bootPromise = runBoot(opts)
    .catch((error) => failBoot(error))
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

export function start(options = {}) {
  return boot(options);
}

export async function reboot(options = {}) {
  destroy({
    keepGlobal: true,
    silent: true,
  });

  return boot({
    ...object(options),
    force: true,
    reason: text(options?.reason, "reboot"),
  });
}

export function destroy(options = {}) {
  const opts = object(options);

  bootPromise = null;
  booting = false;
  booted = false;

  while (disposers.length) {
    try {
      disposers.pop()?.();
    } catch {}
  }

  eventsBound = false;

  try {
    AppCore?.cleanup?.run?.("app:events");
    AppCore?.cleanup?.run?.("app:errors");
    AppCore?.cleanup?.run?.("app:ui");
  } catch {}

  try {
    forceHideLoader(AppCore, {
      reason: "app-destroy",
      force: true,
    });
  } catch {}

  setState({
    appBooting: false,
    appReady: false,
    appBooted: false,
    booting: false,
    ready: false,
  });

  if (opts.silent !== true) {
    emit("app:destroy", {
      at: isoNow(),
    });
  }

  if (!opts.keepGlobal && isBrowser()) {
    try {
      if (window[RUNTIME_APP_KEY] === App) {
        delete window[RUNTIME_APP_KEY];
      }
    } catch {}
  }

  return true;
}

/* =========================================================
   STATE / SNAPSHOT
========================================================= */

export function getState() {
  const tokenBoot = getPublicTokenBoot();

  return {
    version: APP_VERSION,

    booted,
    booting,
    hasBootPromise: Boolean(bootPromise),

    lastReadyAt,

    lastError: lastError
      ? {
          message: text(lastError.message || lastError, ""),
          name: text(lastError.name, "Error"),
        }
      : null,

    publicTokenBoot: Boolean(tokenBoot.active),
    publicTokenRouteKey: tokenBoot.key || null,

    path: redact(getCurrentPath()),

    coreReady: Boolean(AppCore),
    servicesReady: Boolean(getCoreHttp() || ServiceHttp),
    storeReady: Boolean(Store),
    authReady: Boolean(Auth),
    routerReady: Boolean(Router),
    uiReady: Boolean(SidebarUI || TopbarUI),

    state: {
      appBooting: Boolean(AppCore?.state?.appBooting),
      appReady: Boolean(AppCore?.state?.appReady),
      appBooted: Boolean(AppCore?.state?.appBooted),
      authenticated: Boolean(AppCore?.state?.authenticated),
      hasToken: Boolean(AppCore?.state?.hasToken),
      route: redact(AppCore?.state?.route || DEFAULT_ROUTE),
      publicPath: redact(AppCore?.state?.publicPath || DEFAULT_ROUTE),
    },
  };
}

export function getSnapshot() {
  return {
    source: SOURCE,
    version: APP_VERSION,
    ...getState(),

    modules: {
      AppCore: Boolean(AppCore),
      Auth: Boolean(Auth),
      Router: Boolean(Router),
      Store: Boolean(Store),
      ServiceHttp: Boolean(ServiceHttp),
      CoreHttp: Boolean(getCoreHttp()),
      SidebarUI: Boolean(SidebarUI),
      TopbarUI: Boolean(TopbarUI),
      Toast: Boolean(Toast),
      I18n: Boolean(I18n),
    },

    at: isoNow(),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const App = {
  version: APP_VERSION,

  boot,
  start,
  reboot,
  destroy,

  getState,
  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  getCore() {
    return AppCore;
  },

  getRouter() {
    return Router;
  },

  getAuth() {
    return Auth;
  },

  getStore() {
    return Store;
  },

  getHttp() {
    return getCoreHttp() || ServiceHttp;
  },

  getUI() {
    return {
      SidebarUI,
      TopbarUI,
      Toast,
    };
  },

  getI18n() {
    return I18n;
  },
};

/* =========================================================
   GLOBAL API
========================================================= */

try {
  if (isBrowser()) {
    window[RUNTIME_APP_KEY] = App;
  }
} catch {}

try {
  exposeModulesToCore();
} catch {}

/* =========================================================
   OPTIONAL AUTO BOOT
========================================================= */

try {
  if (
    isBrowser() &&
    window[DISABLE_AUTO_BOOT_KEY] !== true &&
    window[AUTO_BOOT_KEY] === true
  ) {
    boot({
      source: "app:auto",
    });
  }
} catch {}

/* =========================================================
   EXPORTS
========================================================= */

export const bootApp = boot;

export default App;

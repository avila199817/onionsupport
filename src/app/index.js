/* =========================================================
   Onion SPA - App Bootstrap
   Archivo: src/app/index.js

   RESPONSABILIDADES:
   - arrancar la SPA de forma ordenada
   - capturar URL inicial antes de Router/History
   - preservar /activate-account?token=... durante el boot
   - preservar /activate-account/<token> durante el boot
   - preservar /reset-password/confirm?token=... durante el boot
   - preservar /reset-password/confirm/<token> durante el boot
   - configurar servicios, store, i18n, UI y router
   - restaurar sesión sin romper rutas públicas técnicas
   - render inicial robusto
   - evitar doble render si restore ya navegó
   - loader boot controlado
   - emitir app:ready una sola vez

   FIX CRÍTICO:
   - NO hacer bindRouter() antes de renderInitialRoute()
   - renderizar rutas públicas con token antes de restoreSession
   - no permitir que restore/auth/history limpien el token antes de la vista
   - si restoreSession navega post-login, NO ejecutar renderInitialRoute() otra vez
   - bindRouter() ocurre después del primer render/navegación resuelta

   FIX UI LIFECYCLE:
   - repara/rebindea SidebarUI y TopbarUI después de restore
   - repara/rebindea SidebarUI y TopbarUI después del primer render
   - repara/rebindea SidebarUI y TopbarUI antes de app:ready
   - repara/rebindea SidebarUI y TopbarUI en router:rendered
   - corrige casos donde collapse/dropdown solo funcionan tras refrescar

   FIX BOOT LOADER:
   - toma control del loader estático de index.html desde el inicio
   - mantiene loader activo durante restore/render/finalize
   - usa failsafe anti-loader infinito
   - evita flash/parpadeo en refresh del navegador
   - no muestra shell inestable antes de app:ready
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
} from "./helpers.js";

import {
  showLoader,
  hideLoader,
  prepareBootLoader,
  armBootFailsafeLoader,
  clearBootFailsafeTimer,
  getLoaderSnapshot,
} from "./loader.js";

import {
  getViewContainer,
  setShellVisibility,
  updateShellVisibilityByRoute,
} from "./shell.js";

import {
  markAppBootState,
  markStoreBootState,
} from "./boot-state.js";

import {
  syncLangState,
  initI18n,
} from "./i18n.js";

import {
  syncUserUI,
  initUISystems,
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

/* =========================================================
   EARLY URL CAPTURE
========================================================= */

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

const RESET_TOKEN_PARAM_NAMES = [
  "token",
  "resetToken",
  "passwordResetToken",
  "code",
  "t",
];

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    windowKey: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    statePrefix: "Activation",
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    windowKey: "__ONION_RESET_CONFIRM_INITIAL_URL__",
    statePrefix: "ResetConfirm",
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
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

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
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

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
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

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return normalizePathnameOnly(
    raw.split("?")[0].split("#")[0] || "/"
  );
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
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(parsed.hash);
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

function getBrowserHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.location.href,
      ""
    );
  } catch {
    return "";
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "/";
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
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "/";
  }
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
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

/* =========================================================
   PROTECTED PUBLIC TOKEN ROUTES
========================================================= */

function matchesRouteConfig(config, pathOrUrl = "") {
  const path =
    pathFromUrlLike(pathOrUrl);

  const clean =
    stripSearchAndHash(path);

  return (
    clean === config.path ||
    clean.startsWith(`${config.path}/`)
  );
}

function getRouteConfigFromValue(value = "") {
  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((config) =>
      matchesRouteConfig(config, value)
    ) || null
  );
}

function getPathToken(config, value = "") {
  if (!config) {
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

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return names.some((name) =>
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

function hasRouteToken(config, value = "") {
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
      new URL(raw, getBaseOrigin());

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
    if (raw.includes("?")) {
      const query =
        raw
          .split("?")
          .slice(1)
          .join("?")
          .split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          config.tokenParamNames
        )
      ) {
        return true;
      }
    }

    if (
      raw.includes("#") &&
      raw.includes("?")
    ) {
      const query =
        raw
          .split("?")
          .slice(1)
          .join("?");

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          config.tokenParamNames
        )
      ) {
        return true;
      }
    }

    return false;
  }
}

function getStoredInitialUrl(config) {
  if (!isBrowser() || !config?.windowKey) {
    return "";
  }

  try {
    return safeText(
      window[config.windowKey],
      ""
    );
  } catch {
    return "";
  }
}

function setStoredInitialUrl(config, value = "") {
  if (!isBrowser() || !config?.windowKey) {
    return false;
  }

  try {
    window[config.windowKey] = value;
    return true;
  } catch {
    return false;
  }
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return safeText(
      window.__ONION_INITIAL_URL__,
      ""
    );
  } catch {
    return "";
  }
}

function setInitialUrl(value = "") {
  if (!isBrowser()) {
    return false;
  }

  try {
    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = value;
    }

    return true;
  } catch {
    return false;
  }
}

function resolveProtectedInitialContext(href = "") {
  const candidates = [
    href,
    getInitialUrl(),
    ...PROTECTED_PUBLIC_TOKEN_ROUTES.map((config) =>
      getStoredInitialUrl(config)
    ),
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const config =
      getRouteConfigFromValue(candidate);

    if (!config) {
      continue;
    }

    if (!hasRouteToken(config, candidate)) {
      continue;
    }

    return {
      config,
      url: candidate,
      path: pathFromUrlLike(candidate),
      hasToken: true,
    };
  }

  return {
    config: null,
    url: "",
    path: "",
    hasToken: false,
  };
}

function redactTokenInText(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    const escapedPath =
      config.path.replace(/\//g, "\\/");

    output = output.replace(
      new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
      "$1/***"
    );

    for (const name of config.tokenParamNames) {
      output = output.replace(
        new RegExp(`([?&]${name}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    }
  }

  return output;
}

function sanitizeBootContextForLog(context = {}) {
  const ctx =
    safeObject(context);

  return {
    initialUrl:
      redactTokenInText(ctx.initialUrl),

    protectedInitialUrl:
      redactTokenInText(ctx.protectedInitialUrl),

    activationInitialUrl:
      redactTokenInText(ctx.activationInitialUrl),

    activationInitialPath:
      redactTokenInText(ctx.activationInitialPath),

    resetConfirmInitialUrl:
      redactTokenInText(ctx.resetConfirmInitialUrl),

    resetConfirmInitialPath:
      redactTokenInText(ctx.resetConfirmInitialPath),

    protectedInitialPath:
      redactTokenInText(ctx.protectedInitialPath),

    isActivation:
      Boolean(ctx.isActivation),

    hasActivationToken:
      Boolean(ctx.hasActivationToken),

    isResetConfirm:
      Boolean(ctx.isResetConfirm),

    hasResetToken:
      Boolean(ctx.hasResetToken),

    isPublicTokenRoute:
      Boolean(ctx.isPublicTokenRoute),

    hasPublicToken:
      Boolean(ctx.hasPublicToken),

    protectedRouteKey:
      safeText(ctx.protectedRouteKey, ""),
  };
}

function captureInitialUrl() {
  if (!isBrowser()) {
    return {
      initialUrl: "",
      protectedInitialUrl: "",
      protectedInitialPath: "",

      activationInitialUrl: "",
      activationInitialPath: "",
      isActivation: false,
      hasActivationToken: false,

      resetConfirmInitialUrl: "",
      resetConfirmInitialPath: "",
      isResetConfirm: false,
      hasResetToken: false,

      isPublicTokenRoute: false,
      hasPublicToken: false,
      protectedRouteKey: "",
    };
  }

  const href =
    getBrowserHref();

  if (href) {
    setInitialUrl(href);

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      try {
        if (
          matchesRouteConfig(config, href) &&
          hasRouteToken(config, href) &&
          !getStoredInitialUrl(config)
        ) {
          setStoredInitialUrl(config, href);
        }
      } catch {}
    }
  }

  const initialUrl =
    safeText(
      getInitialUrl(),
      href
    );

  const protectedContext =
    resolveProtectedInitialContext(href);

  const activationConfig =
    PROTECTED_PUBLIC_TOKEN_ROUTES[0];

  const resetConfig =
    PROTECTED_PUBLIC_TOKEN_ROUTES[1];

  const activationInitialUrl =
    safeText(
      getStoredInitialUrl(activationConfig),
      ""
    );

  const resetConfirmInitialUrl =
    safeText(
      getStoredInitialUrl(resetConfig),
      ""
    );

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
    href;

  const resetCandidate =
    protectedContext.url ||
    resetConfirmInitialUrl ||
    initialUrl ||
    href;

  const isActivation =
    matchesRouteConfig(
      activationConfig,
      activationCandidate
    );

  const isResetConfirm =
    matchesRouteConfig(
      resetConfig,
      resetCandidate
    );

  const hasActivationToken =
    hasRouteToken(
      activationConfig,
      activationInitialUrl || initialUrl || href
    );

  const hasResetToken =
    hasRouteToken(
      resetConfig,
      resetConfirmInitialUrl || initialUrl || href
    );

  const isPublicTokenRoute =
    Boolean(protectedContext.config);

  const hasPublicToken =
    Boolean(protectedContext.hasToken);

  return {
    initialUrl,

    protectedInitialUrl:
      protectedContext.url || "",

    protectedInitialPath:
      protectedContext.path || "",

    activationInitialUrl,
    activationInitialPath,
    isActivation,
    hasActivationToken,

    resetConfirmInitialUrl,
    resetConfirmInitialPath,
    isResetConfirm,
    hasResetToken,

    isPublicTokenRoute,
    hasPublicToken,
    protectedRouteKey:
      protectedContext.config?.key || "",
  };
}

let BOOT_URL_CONTEXT =
  captureInitialUrl();

/* =========================================================
   APP
========================================================= */

export const App = (() => {
  "use strict";

  const MIN_BOOT_LOADER_MS = 500;

  const state = {
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

    bootPromise: null,
    restorePromise: null,

    bootCycleId: 0,
    finalizedCycleId: 0,

    loaderVisible: false,
    loaderShownAt: 0,

    bootFailsafeTimer: null,

    bootNavigationHandled: false,
    initialRouteRendered: false,
  };

  /* =======================================================
     SAFE
  ======================================================= */

  function safeEmit(name, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        name,
        payload
      );
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );
      }
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[App]",
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        "[App]",
        ...args
      );
    } catch {}

    try {
      console.warn("[App]", ...args);
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        "[App]",
        ...args
      );
    } catch {}

    try {
      console.error("[App]", ...args);
    } catch {}
  }

  function wait(ms = 0) {
    return new Promise((resolve) =>
      setTimeout(resolve, ms)
    );
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

      return true;
    } catch {
      return false;
    }
  }

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
      return (
        getLoaderSnapshot?.(
          AppCore,
          state
        ) || {}
      );
    } catch {
      return {};
    }
  }

  function getCurrentRouteSnapshot() {
    return {
      route:
        AppCore?.state?.route ||
        Router?.getCurrentCanonicalPath?.() ||
        stripSearchAndHash(getBrowserPublicPath()) ||
        "/",

      publicPath:
        AppCore?.state?.publicPath ||
        Router?.getCurrentPublicPath?.() ||
        getBrowserPublicPath() ||
        "/",
    };
  }

  function safeEmitUIReady() {
    safeEmit("app:ui:ready", {
      sidebarSnapshot:
        getSidebarSnapshot(),
      topbarSnapshot:
        getTopbarSnapshot(),
    });
  }

  function callSyncUserUI(reason = "sync-user-ui") {
    let ok = false;

    try {
      if (isFunction(syncUserUI)) {
        syncUserUI(AppCore);
        ok = true;
      }
    } catch (error) {
      safeWarn(
        "syncUserUI(AppCore) falló.",
        {
          reason,
          error,
        }
      );
    }

    /*
      Compatibilidad con implementaciones nuevas que acepten objeto.
      Se llama después y de forma segura; si el módulo usa firma legacy,
      normalmente ignorará el objeto o lanzará sin romper boot.
    */
    try {
      if (isFunction(syncUserUI)) {
        syncUserUI({
          AppCore,
          Auth,
          SidebarUI,
          TopbarUI,
          Toast,
          I18n,
          reason,
        });

        ok = true;
      }
    } catch {}

    return ok;
  }

  function safeCallUIMethod(target, names = [], reason = "unknown", context = {}) {
    let called = false;

    for (const name of names) {
      try {
        const fn =
          target?.[name];

        if (!isFunction(fn)) {
          continue;
        }

        /*
          Orden compatible:
          1. objeto contexto
          2. reason + contexto
          3. sin argumentos
        */
        try {
          fn.call(target, context);
          called = true;
          continue;
        } catch {}

        try {
          fn.call(target, reason, context);
          called = true;
          continue;
        } catch {}

        try {
          fn.call(target);
          called = true;
        } catch {}
      } catch (error) {
        safeWarn(
          `UI method falló: ${name}`,
          error
        );
      }
    }

    return called;
  }

  function repairShell(reason = "unknown") {
    const routeSnapshot =
      getCurrentRouteSnapshot();

    try {
      updateShellVisibilityByRoute(
        AppCore,
        Router
      );
    } catch {}

    try {
      Router?.repairShell?.({
        route:
          Router?.getRoute?.(
            routeSnapshot.route
          ) || null,
        canonicalPath:
          routeSnapshot.route,
        publicPath:
          routeSnapshot.publicPath,
        phase:
          `app:${reason}`,
        hideLoading:
          false,
      });
    } catch {}

    return routeSnapshot;
  }

  function repairUISystems(reason = "unknown") {
    const cleanReason =
      safeText(reason, "unknown");

    const routeSnapshot =
      repairShell(cleanReason);

    const context = {
      AppCore,
      Auth,
      Router,
      Store,
      Toast,
      I18n,
      reason: cleanReason,
      route:
        routeSnapshot.route,
      publicPath:
        routeSnapshot.publicPath,
    };

    callSyncUserUI(cleanReason);

    safeCallUIMethod(
      SidebarUI,
      [
        "repair",
        "refresh",
        "sync",
        "syncUser",
        "refreshUser",
        "updateUser",
        "render",
        "rebind",
        "bindEvents",
        "bind",
      ],
      cleanReason,
      context
    );

    safeCallUIMethod(
      TopbarUI,
      [
        "repair",
        "refresh",
        "sync",
        "syncUser",
        "refreshUser",
        "updateUser",
        "render",
        "rebind",
        "bindEvents",
        "bind",
      ],
      cleanReason,
      context
    );

    safeEmit("app:ui:repair", {
      reason: cleanReason,
      route:
        routeSnapshot.route,
      publicPath:
        routeSnapshot.publicPath,
      sidebarSnapshot:
        getSidebarSnapshot(),
      topbarSnapshot:
        getTopbarSnapshot(),
    });

    afterPaint(() => {
      callSyncUserUI(`${cleanReason}:after-paint`);

      safeCallUIMethod(
        SidebarUI,
        [
          "sync",
          "syncUser",
          "refreshUser",
          "updateUser",
          "rebind",
          "bindEvents",
        ],
        `${cleanReason}:after-paint`,
        context
      );

      safeCallUIMethod(
        TopbarUI,
        [
          "sync",
          "syncUser",
          "refreshUser",
          "updateUser",
          "rebind",
          "bindEvents",
        ],
        `${cleanReason}:after-paint`,
        context
      );
    });
  }

  function bindUIRepairEvents() {
    if (state.uiRepairEventsBound) {
      return;
    }

    const onRepair = (payload = {}) => {
      const data =
        safeObject(
          payload?.detail ||
            payload?.payload ||
            payload
        );

      const reason =
        safeText(
          data.reason ||
            data.phase ||
            data.type ||
            data.event ||
            "event"
        );

      repairUISystems(reason);
    };

    const bus =
      AppCore?.events;

    if (bus?.on) {
      try {
        bus.on("router:rendered", onRepair);
        bus.on("router:render:async-complete", onRepair);
        bus.on("router:shell:state", onRepair);

        bus.on("app:ready", onRepair);
        bus.on("app:ui:ready", onRepair);
        bus.on("app:ui:repair-request", onRepair);
        bus.on("app:route:change", onRepair);

        bus.on("app:session:restored", onRepair);
        bus.on("auth:session:restored", onRepair);
        bus.on("auth:login:success", onRepair);
        bus.on("auth:logout", onRepair);

        bus.on("app:user:change", onRepair);
        bus.on("app:lang:change", onRepair);
      } catch (error) {
        safeWarn(
          "No se pudieron bindear eventos UI sobre AppCore.events.",
          error
        );
      }
    }

    safeWindowOn("app:ui:repair-request", onRepair);
    safeWindowOn("app:ready", onRepair);
    safeWindowOn("app:lang:change", onRepair);

    state.uiRepairEventsBound = true;
  }

  function refreshBootUrlContext() {
    BOOT_URL_CONTEXT =
      captureInitialUrl();

    return BOOT_URL_CONTEXT;
  }

  function isPublicTokenBoot() {
    const context =
      refreshBootUrlContext();

    return Boolean(
      context.isPublicTokenRoute &&
      context.hasPublicToken
    );
  }

  function isActivationBoot() {
    const context =
      refreshBootUrlContext();

    return Boolean(
      context.isActivation &&
      context.hasActivationToken
    );
  }

  function isResetConfirmBoot() {
    const context =
      refreshBootUrlContext();

    return Boolean(
      context.isResetConfirm &&
      context.hasResetToken
    );
  }

  function exposeRouterToCore() {
    try {
      AppCore.Router = Router;
    } catch {}

    try {
      AppCore.router = Router;
    } catch {}

    try {
      AppCore.modules =
        AppCore.modules || {};

      AppCore.modules.Router = Router;
    } catch {}
  }

  function exposeBootUrlContextToCore() {
    const context =
      refreshBootUrlContext();

    try {
      AppCore?.setState?.({
        bootInitialUrl:
          context.initialUrl,

        bootProtectedInitialUrl:
          context.protectedInitialUrl,

        bootProtectedInitialPath:
          context.protectedInitialPath,

        bootIsPublicTokenRoute:
          context.isPublicTokenRoute,

        bootHasPublicToken:
          context.hasPublicToken,

        bootProtectedRouteKey:
          context.protectedRouteKey,

        bootActivationInitialUrl:
          context.activationInitialUrl,

        bootActivationInitialPath:
          context.activationInitialPath,

        bootIsActivation:
          context.isActivation,

        bootHasActivationToken:
          context.hasActivationToken,

        bootResetConfirmInitialUrl:
          context.resetConfirmInitialUrl,

        bootResetConfirmInitialPath:
          context.resetConfirmInitialPath,

        bootIsResetConfirm:
          context.isResetConfirm,

        bootHasResetToken:
          context.hasResetToken,
      });
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

  function isStale(id) {
    return id !== state.bootCycleId;
  }

  function resetCycleRuntimeState() {
    state.bootNavigationHandled = false;
    state.initialRouteRendered = false;
  }

  function markBooting(cycleId) {
    state.booting = true;

    try {
      markAppBootState?.(AppCore, {
        booting: true,
        booted: false,
        ready: false,
        cycleId,
      });
    } catch {}
  }

  function markBooted(cycleId) {
    try {
      markAppBootState?.(AppCore, {
        booting: false,
        booted: true,
        ready: true,
        cycleId,
      });
    } catch {}
  }

  /* =======================================================
     LOADER
  ======================================================= */

  function showBootLoader(reason = "boot") {
    if (state.loaderVisible) {
      return;
    }

    state.loaderVisible = true;
    state.loaderShownAt = Date.now();

    try {
      prepareBootLoader?.(
        AppCore,
        state
      );
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
      });
    } catch {}

    safeEmit("app:boot:loader:show", {
      reason,
      loaderSnapshot:
        getBootLoaderSnapshot(),
    });
  }

  function hideBootLoader(reason = "boot-complete") {
    if (!state.loaderVisible) {
      return;
    }

    state.loaderVisible = false;

    try {
      hideLoader(
        AppCore,
        {
          reason,
          minVisibleMs:
            MIN_BOOT_LOADER_MS,
        }
      );
    } catch {}

    safeEmit("app:boot:loader:hide", {
      reason,
      loaderSnapshot:
        getBootLoaderSnapshot(),
    });
  }

  function forceHideBootLoader(reason = "force-hide") {
    state.loaderVisible = false;

    try {
      hideLoader(
        AppCore,
        {
          reason,
          minVisibleMs: 0,
        }
      );
    } catch {}

    safeEmit("app:boot:loader:force-hide", {
      reason,
      loaderSnapshot:
        getBootLoaderSnapshot(),
    });
  }

  /* =======================================================
     INIT BLOCKS
  ======================================================= */

  function bindGlobalHandlersBlock() {
    if (state.handlersBound) {
      return;
    }

    try {
      bindGlobalErrorHandlers?.({
        AppCore,
        Auth,
        Toast,
      });
    } catch {}

    state.handlersBound = true;
  }

  function bindAppEventsBlock() {
    if (state.appEventsBound) {
      bindUIRepairEvents();
      return;
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
      });
    } catch {}

    bindUIRepairEvents();

    state.appEventsBound = true;
  }

  function initServices() {
    if (state.servicesReady) {
      return;
    }

    try {
      Http?.init?.();
    } catch (error) {
      safeWarn(
        "No se pudo inicializar Http.",
        error
      );
    }

    state.servicesReady = true;
  }

  function initStoreBlock() {
    if (state.storeReady) {
      return;
    }

    try {
      Store?.init?.();
    } catch (error) {
      safeWarn(
        "No se pudo inicializar Store.",
        error
      );
    }

    state.storeReady = true;
  }

  function initI18nBlock() {
    try {
      initI18n?.({
        AppCore,
        I18n,
      });
    } catch {}

    try {
      syncLangState?.({
        AppCore,
        I18n,
      });
    } catch {}
  }

  function configureRouterBlock() {
    if (state.routerConfigured) {
      exposeRouterToCore();
      return;
    }

    exposeRouterToCore();

    try {
      configureRouter?.();
    } catch (error) {
      safeWarn(
        "No se pudo configurar Router.",
        error
      );
    }

    exposeRouterToCore();

    state.routerConfigured = true;
  }

  function bindRouterBlock(reason = "bind-router") {
    if (state.routerBound) {
      return;
    }

    try {
      bindRouter?.();
    } catch (error) {
      safeWarn(
        "bindRouter() falló. Intentando Router.bind().",
        error
      );

      try {
        Router?.bind?.();
      } catch {}
    }

    exposeRouterToCore();

    state.routerBound = true;

    safeEmit("app:router:bound", {
      reason,
    });
  }

  function initUIBlock() {
    if (state.uiReady) {
      repairUISystems("init-ui-already-ready");
      return;
    }

    initUISystems({
      AppCore,
      Toast,
      SidebarUI,
      TopbarUI,
      state,
    });

    state.uiReady = true;
    state.uiMounted = true;

    repairUISystems("init-ui");

    safeEmitUIReady();
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
      await renderInitialRoute();

    if (!isStale(cycleId)) {
      state.initialRouteRendered = true;

      repairUISystems(
        `render-initial-route:${reason}`
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

    if (state.restorePromise) {
      return state.restorePromise;
    }

    state.restorePromise =
      restoreSessionInBackground({
        AppCore,
        Auth,
        Router,
        state,
        syncUserUI:
          (coreArg) => {
            try {
              syncUserUI?.(coreArg || AppCore);
            } catch {}

            try {
              syncUserUI?.({
                AppCore,
                Auth,
                SidebarUI,
                TopbarUI,
                Toast,
                I18n,
                reason: "restore-session",
              });
            } catch {}
          },
        warmup,
        skipPostRestoreNavigation,
      });

    try {
      const result =
        await state.restorePromise;

      if (!isStale(cycleId)) {
        repairUISystems("restore-session");
      }

      return result;
    } catch (error) {
      if (nonBlocking) {
        safeWarn(
          "Restore session no bloqueante falló.",
          error
        );

        if (!isStale(cycleId)) {
          repairUISystems("restore-session-error-non-blocking");
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

  /* =======================================================
     FINALIZE
  ======================================================= */

  async function finalizeBoot(cycleId) {
    if (isStale(cycleId)) {
      return;
    }

    if (state.finalizedCycleId === cycleId) {
      return;
    }

    state.finalizedCycleId = cycleId;

    clearBootFailsafeTimer(state);

    try {
      markStoreBootState(Store, {
        ready: true,
        booted: true,
      });
    } catch {}

    state.booted = true;
    state.booting = false;

    markBooted(cycleId);

    repairShell("finalize-boot:pre-ui");

    repairUISystems("finalize-boot");

    afterPaint(() => {
      repairUISystems("finalize-boot:after-paint");
    });

    const remaining =
      Math.max(
        0,
        MIN_BOOT_LOADER_MS -
          (Date.now() - state.loaderShownAt)
      );

    if (remaining > 0) {
      await wait(remaining);
    }

    hideBootLoader("finalize-boot");

    if (!state.readyEmitted) {
      state.readyEmitted = true;

      safeEmit("app:ready", {
        sidebarSnapshot:
          getSidebarSnapshot(),
        topbarSnapshot:
          getTopbarSnapshot(),
        loaderSnapshot:
          getBootLoaderSnapshot(),
      });
    }
  }

  /* =======================================================
     BOOT
  ======================================================= */

  async function doBoot(cycleId) {
    try {
      state.booting = true;

      resetCycleRuntimeState();
      markBooting(cycleId);

      /*
        MUY IMPORTANTE:
        El loader se toma aquí, al principio real del boot.

        Si index.html ya trae #app-loader visible, aquí JS toma control.
        Si index.html no lo trae, loader.js crea uno fallback.
      */
      showBootLoader("boot-start");

      refreshBootUrlContext();

      bindGlobalHandlersBlock();

      await AppCore.init();

      ensureScope(AppCore);

      const bootContext =
        exposeBootUrlContextToCore();

      exposeRouterToCore();

      bindAppEventsBlock();

      initServices();
      initStoreBlock();
      initI18nBlock();

      configureRouterBlock();

      initUIBlock();

      if (
        bootContext.isPublicTokenRoute &&
        bootContext.hasPublicToken
      ) {
        safeLog(
          "Boot public-token-first.",
          sanitizeBootContextForLog(bootContext)
        );

        await renderInitialRouteBlock({
          cycleId,
          reason: "public-token-first",
        });

        /*
          Bind después del primer render.
          Así no se pisa la URL pública con token durante boot.
        */
        bindRouterBlock("public-token-first");

        await restoreSessionBlock({
          cycleId,
          nonBlocking: true,
          skipPostRestoreNavigation: true,
        });
      } else {
        const restoreResult =
          await restoreSessionBlock({
            cycleId,
            nonBlocking: false,
            skipPostRestoreNavigation: false,
          });

        if (
          state.bootNavigationHandled === true
        ) {
          safeLog(
            "renderInitialRoute omitido: restore ya resolvió navegación.",
            {
              ok:
                Boolean(restoreResult?.ok),
              route:
                AppCore?.state?.route || "/",
              publicPath:
                AppCore?.state?.publicPath || "/",
            }
          );

          state.initialRouteRendered = true;

          repairUISystems(
            "restore-navigation-handled"
          );
        } else {
          await renderInitialRouteBlock({
            cycleId,
            reason: "after-restore",
          });
        }

        /*
          Bind después de:
          - restore con navegación, o
          - render inicial normal.
        */
        bindRouterBlock("after-initial-route");
      }

      repairUISystems("before-finalize");

      await finalizeBoot(cycleId);

      return api;
    } catch (error) {
      state.booting = false;

      clearBootFailsafeTimer(state);

      safeError(
        "Boot error.",
        error
      );

      try {
        repairUISystems("boot-error");
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
          hideLoader,
        });
      } catch {}

      return api;
    }
  }

  function boot() {
    if (state.booted) {
      repairUISystems("boot-already-booted");
      return Promise.resolve(api);
    }

    if (state.bootPromise) {
      return state.bootPromise;
    }

    const cycleId =
      nextCycle();

    state.bootPromise =
      doBoot(cycleId);

    return state.bootPromise;
  }

  async function reboot() {
    nextCycle();

    state.booted = false;
    state.booting = false;

    state.uiMounted = false;
    state.readyEmitted = false;

    state.finalizedCycleId = 0;
    state.restorePromise = null;
    state.bootPromise = null;

    /*
      No reseteamos routerConfigured/routerBound aquí de forma agresiva.
      Router.bind suele ser idempotente. Evitamos doble binding accidental.
    */

    resetCycleRuntimeState();

    try {
      clearBootFailsafeTimer(state);
    } catch {}

    try {
      clearScope(AppCore);
    } catch {}

    forceHideBootLoader("reboot-reset");

    return boot();
  }

  function getState() {
    const context =
      refreshBootUrlContext();

    return {
      ...state,

      bootUrlContext:
        sanitizeBootContextForLog(context),

      isActivationBoot:
        isActivationBoot(),

      isResetConfirmBoot:
        isResetConfirmBoot(),

      isPublicTokenBoot:
        isPublicTokenBoot(),

      route:
        AppCore?.state?.route || "/",

      publicPath:
        AppCore?.state?.publicPath || "/",

      browserPublicPath:
        getBrowserPublicPath(),

      sidebarSnapshot:
        getSidebarSnapshot(),

      topbarSnapshot:
        getTopbarSnapshot(),

      loaderSnapshot:
        getBootLoaderSnapshot(),

      routerSnapshot:
        Router?.getSnapshot?.() || null,
    };
  }

  const api = {
    boot,
    reboot,
    getState,

    repairUI:
      repairUISystems,

    repairShell,

    showLoader:
      showBootLoader,

    hideLoader:
      hideBootLoader,

    getLoaderSnapshot:
      getBootLoaderSnapshot,
  };

  return api;
})();

export default App;

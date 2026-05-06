/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   ONION SUPPORT · APP LOADER CONTROLLER
   BOOT SAFE · CSP CLEAN · RACE SAFE · EXTREME 12/10

   RESPONSABILIDADES:
   - Resolver el loader global de la app.
   - Tomar control del loader estático de index.html.
   - Mostrar / ocultar loader de forma robusta.
   - Crear loader fallback si index.html no lo trae.
   - No usar innerHTML.
   - No inyectar CSS inline.
   - No depender de body[data-theme] para decidir logos.
   - Limpiar estados html/body/shell/main/view.
   - Aplicar failsafe anti-loader infinito.
   - Limpiar timer de failsafe.
   - Evitar flicker visual.
   - Endurecer DOM access browser/server.
   - Redactar tokens en logs/eventos/snapshots.
   - Exponer snapshot útil para debug.

   CONTRATO CON INDEX / THEME / CSS:
   - index.html deja #app-loader visible desde refresh.
   - preboot/theme.js resuelve html[data-theme].
   - loader.css controla:
     · .is-visible
     · .is-entering
     · .is-leaving
     · .is-hidden
     · .has-hidden
     · [data-loader-visible]
     · [data-loader-state]
   - Este módulo controla estado; CSS controla presentación.

   LIMPIEZA FINAL ESPERADA:
   - html/body sin app-booting.
   - html/body sin app-loading.
   - html/body con app-ready salvo estado fatal.
   - html/body data-app-loading="false".
   - html data-app-state="ready" o "fatal".
   - body data-shell-state="ready" o "fatal".
   - #app-loader.is-hidden.has-hidden.
   - #app-loader data-loader-visible="false".
   - #app-loader data-loader-state="hidden".
   - #app-shell data-shell="ready" o "fatal".
   - #app-shell data-shell-interactive="true".
   - #app-shell aria-hidden="false".
   - #main-content aria-busy="false".
   - #view-container aria-busy="false".

   HARDENING 12/10:
   - Timer de hide serializado por sequence.
   - Failsafe serializado por armId.
   - forceHideLoader limpia siempre timers y failsafe.
   - prepareBootLoader actualiza lastShowAt para minVisible real.
   - No se duplican eventos bus/window salvo aliases legacy explícitos.
   - Eventos y snapshots no filtran tokens.
   - Payload sanitizer no intenta clonar nodos DOM.
   - Fallback loader CSP-clean sin innerHTML ni style tag.
========================================================= */

import {
  APP_EVENTS,
  BOOT_FAILSAFE_LOADER_MS,
  BOOT_MIN_LOADER_VISIBLE_MS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOADER_VERSION = "12.0.0";

const LOADER_ID = "app-loader";

const LOADER_SELECTOR =
  "#app-loader,.app-loader,[data-app-loader='true']";

const SHELL_ID = "app-shell";
const MAIN_ID = "main-content";
const VIEW_ID = "view-container";
const SIDEBAR_MOUNT_ID = "sidebar-mount";
const TOPBAR_MOUNT_ID = "topbar-mount";

const DEFAULT_HIDE_TRANSITION_MS = 220;

const DEFAULT_MIN_VISIBLE_MS =
  Math.max(
    0,
    safeNumber(
      BOOT_MIN_LOADER_VISIBLE_MS,
      320
    )
  );

const DEFAULT_FAILSAFE_MS = 12000;
const MIN_FAILSAFE_MS = 8000;
const FAILSAFE_WARN_DEDUPE_MS = 30000;

const DEFAULT_LOADER_LOGO_WHITE_URL =
  resolveModuleAssetUrl(
    "../media/img/favicon_white.png",
    "/src/media/img/favicon_white.png"
  );

const DEFAULT_LOADER_LOGO_BLACK_URL =
  resolveModuleAssetUrl(
    "../media/img/favicon_black.png",
    "/src/media/img/favicon_black.png"
  );

const BODY_LOADING_CLASSES = Object.freeze([
  "loading",
  "app-loading",
  "app-booting",
]);

const HTML_LOADING_CLASSES = Object.freeze([
  "app-loading",
  "app-booting",
]);

const BODY_READY_CLASSES = Object.freeze([
  "app-ready",
]);

const HTML_READY_CLASSES = Object.freeze([
  "app-ready",
]);

const BODY_FATAL_CLASSES = Object.freeze([
  "app-fatal",
]);

const HTML_FATAL_CLASSES = Object.freeze([
  "app-fatal",
]);

const LOADER_VISIBLE_CLASSES = Object.freeze([
  "is-visible",
]);

const LOADER_ENTERING_CLASSES = Object.freeze([
  "is-entering",
]);

const LOADER_LEAVING_CLASSES = Object.freeze([
  "is-leaving",
]);

const LOADER_HIDDEN_CLASSES = Object.freeze([
  "is-hidden",
  "has-hidden",
]);

const EVENT_NAMES = Object.freeze({
  takeover:
    "app:loader:takeover",

  show:
    APP_EVENTS?.bootLoaderShow ||
    "app:boot:loader:show",

  hide:
    APP_EVENTS?.bootLoaderHide ||
    "app:boot:loader:hide",

  forceHide:
    APP_EVENTS?.bootLoaderForceHide ||
    "app:boot:loader:force-hide",

  fallbackCreated:
    "app:loader:fallback:created",

  failsafeArmed:
    "app:loader:failsafe:armed",

  failsafe:
    "app:loader:failsafe",

  failsafeStale:
    "app:loader:failsafe:stale",

  state:
    "app:loader:state",
});

const LEGACY_EVENT_ALIASES = Object.freeze({
  show:
    Object.freeze([
      "app:loader:show",
    ]),

  hide:
    Object.freeze([
      "app:loader:hide",
    ]),

  forceHide:
    Object.freeze([
      "app:loader:force-hide",
      "app:loader:hide",
    ]),
});

const SENSITIVE_QUERY_PARAM_NAMES = Object.freeze([
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
   MODULE RUNTIME
========================================================= */

let lastShowAt = 0;

let hideTimer = null;
let transitionTimer = null;
let bootFailsafeTimer = null;

let sequence = 0;

let failsafeArmSequence = 0;
let lastFailsafeWarnKey = "";
let lastFailsafeWarnAt = 0;

const logoErrorBound = new WeakSet();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function resolveModuleAssetUrl(relativePath, fallbackPath = "") {
  try {
    return new URL(relativePath, import.meta.url).href;
  } catch {
    return fallbackPath;
  }
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
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
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

function now() {
  try {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
  } catch {}

  return Date.now();
}

function epochNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = epochNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function nextSequence() {
  sequence += 1;
  return sequence;
}

function isCurrentSequence(id) {
  return id === sequence;
}

function clearTimer(id) {
  try {
    if (id) {
      clearTimeout(id);
    }
  } catch {}
}

function requestPaint() {
  return new Promise((resolve) => {
    try {
      if (!isBrowser()) {
        setTimeout(resolve, 0);
        return;
      }

      if (!isFunction(window.requestAnimationFrame)) {
        window.setTimeout(resolve, 0);
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    } catch {
      resolve();
    }
  });
}

function safeGetState(AppCore) {
  try {
    return safeObject(AppCore?.state);
  } catch {
    return {};
  }
}

function safeSetCoreState(AppCore, patch = {}) {
  const cleanPatch =
    safeObject(patch);

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(
        cleanPatch,
        {
          source:
            "app:loader",
          emit:
            true,
        }
      );

      return true;
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPatch
      );

      return true;
    }
  } catch {}

  return false;
}

function safeSetLoading(AppCore, value = false) {
  const next =
    Boolean(value);

  try {
    if (isFunction(AppCore?.setLoading)) {
      AppCore.setLoading(next);
      return true;
    }
  } catch {}

  return safeSetCoreState(
    AppCore,
    {
      loading:
        next,
    }
  );
}

function safeSetBooting(AppCore, value = false) {
  const next =
    Boolean(value);

  return safeSetCoreState(
    AppCore,
    {
      booting:
        next,
    }
  );
}

function safeSetDomRef(AppCore, key, value) {
  try {
    if (AppCore?.dom && key) {
      AppCore.dom[key] = value;
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   TOKEN REDACTION / SAFE EVENTS
========================================================= */

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  if (depth > 4) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
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
      node:
        safeText(value.nodeName, "Node"),
      id:
        safeText(value.id, ""),
      className:
        safeText(value.className, ""),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) =>
        sanitizePayload(item, depth + 1)
      );
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),
      message:
        redactSensitiveText(value.message || ""),
      code:
        value.code || null,
      status:
        value.status || null,
    };
  }

  if (value instanceof Map) {
    return {
      type:
        "Map",
      size:
        value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type:
        "Set",
      size:
        value.size,
    };
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization/i.test(key)
      ) {
        output[key] = "***";
        continue;
      }

      output[key] =
        sanitizePayload(
          item,
          depth + 1
        );
    }

    return output;
  }

  return value;
}

function safeWarn(AppCore, ...args) {
  const safeArgs =
    args.map((arg) =>
      sanitizePayload(arg)
    );

  let emittedByCore = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[Loader]", ...safeArgs);
      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  if (emittedByCore) {
    return;
  }

  try {
    console.warn("[Loader]", ...safeArgs);
  } catch {}
}

function safeEmit(AppCore, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload =
    sanitizePayload(payload);

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        cleanPayload
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function emitLoaderEvent(AppCore, eventName, payload = {}, aliases = []) {
  const finalPayload = {
    version:
      LOADER_VERSION,
    at:
      safeIsoDate(),
    ...safeObject(payload),
  };

  let emitted = false;

  if (
    safeEmit(
      AppCore,
      eventName,
      finalPayload
    )
  ) {
    emitted = true;
  }

  for (const alias of safeArray(aliases)) {
    if (
      alias &&
      alias !== eventName &&
      safeEmit(
        AppCore,
        alias,
        finalPayload
      )
    ) {
      emitted = true;
    }
  }

  return emitted;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getById(id = "") {
  if (!isBrowser() || !id) {
    return null;
  }

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function query(selector = "") {
  if (!isBrowser() || !selector) {
    return null;
  }

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function documentContains(element) {
  try {
    return Boolean(
      element &&
      document.contains(element)
    );
  } catch {
    return false;
  }
}

function setAttr(element, name, value) {
  if (!element || !name) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
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
  if (!element || !key) {
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

function toggleClasses(element, classNames = [], enabled = false) {
  if (!element) {
    return false;
  }

  try {
    for (const className of safeArray(classNames)) {
      if (className) {
        element.classList.toggle(
          className,
          Boolean(enabled)
        );
      }
    }

    return true;
  } catch {
    return false;
  }
}

function addClasses(element, classNames = []) {
  if (!element) {
    return false;
  }

  try {
    const clean =
      safeArray(classNames).filter(Boolean);

    if (clean.length) {
      element.classList.add(...clean);
    }

    return true;
  } catch {
    return false;
  }
}

function removeClasses(element, classNames = []) {
  if (!element) {
    return false;
  }

  try {
    const clean =
      safeArray(classNames).filter(Boolean);

    if (clean.length) {
      element.classList.remove(...clean);
    }

    return true;
  } catch {
    return false;
  }
}

function clearLegacyInlineLoaderStyles(loader) {
  if (!loader) {
    return false;
  }

  try {
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
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
   THEME / LOGO
========================================================= */

function normalizeTheme(value) {
  const theme =
    safeText(value, "").toLowerCase();

  if (
    theme === "light" ||
    theme === "claro"
  ) {
    return "light";
  }

  if (
    theme === "dark" ||
    theme === "oscuro"
  ) {
    return "dark";
  }

  if (
    theme === "system" ||
    theme === "auto" ||
    theme === "automatic" ||
    theme === "browser" ||
    theme === "os" ||
    theme === "device"
  ) {
    return "system";
  }

  return "";
}

function getBootThemeSnapshot() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return safeObject(window.__ONION_BOOT_THEME__);
  } catch {
    return {};
  }
}

function getStoredTheme() {
  if (!isBrowser()) {
    return "";
  }

  const keys = [
    "onion:themeMode",
    "onion:appearance",
    "onion_themeMode",
    "onion_appearance",
    "onion.themeMode",
    "onion.appearance",
    "themeMode",
    "appearance",
    "theme_mode",
    "colorMode",
    "color_mode",
    "mode",
    "onion:theme",
    "onion_theme",
    "onion.theme",
    "theme",
  ];

  for (const key of keys) {
    try {
      const theme =
        normalizeTheme(
          localStorage.getItem(key)
        );

      if (theme) {
        return theme;
      }
    } catch {}
  }

  for (const key of keys) {
    try {
      const theme =
        normalizeTheme(
          sessionStorage.getItem(key)
        );

      if (theme) {
        return theme;
      }
    } catch {}
  }

  return "";
}

function getSystemTheme() {
  if (!isBrowser()) {
    return "dark";
  }

  try {
    if (
      isFunction(window.matchMedia) &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return "light";
    }
  } catch {}

  return "dark";
}

function resolveThemeValue(theme = "") {
  const normalized =
    normalizeTheme(theme);

  if (normalized === "system") {
    return getSystemTheme();
  }

  if (
    normalized === "light" ||
    normalized === "dark"
  ) {
    return normalized;
  }

  return "";
}

function getCurrentTheme(AppCore) {
  try {
    const htmlTheme =
      resolveThemeValue(
        document.documentElement?.dataset?.theme
      );

    if (htmlTheme) {
      return htmlTheme;
    }
  } catch {}

  try {
    const boot =
      getBootThemeSnapshot();

    const bootTheme =
      resolveThemeValue(
        boot.theme || boot.mode
      );

    if (bootTheme) {
      return bootTheme;
    }
  } catch {}

  try {
    const stateTheme =
      resolveThemeValue(
        AppCore?.state?.theme
      );

    if (stateTheme) {
      return stateTheme;
    }
  } catch {}

  const storedTheme =
    resolveThemeValue(
      getStoredTheme()
    );

  if (storedTheme) {
    return storedTheme;
  }

  return "dark";
}

function getDefaultLoaderLogoUrl(AppCore) {
  return getCurrentTheme(AppCore) === "light"
    ? DEFAULT_LOADER_LOGO_BLACK_URL
    : DEFAULT_LOADER_LOGO_WHITE_URL;
}

function getDefaultLoaderLogoPair() {
  return {
    white:
      DEFAULT_LOADER_LOGO_WHITE_URL,

    black:
      DEFAULT_LOADER_LOGO_BLACK_URL,
  };
}

/* =========================================================
   CONFIG
========================================================= */

function getLoaderConfig(AppCore) {
  const cfg =
    safeObject(AppCore?.config);

  const defaultLogoUrl =
    getDefaultLoaderLogoUrl(AppCore);

  const defaultLogoPair =
    getDefaultLoaderLogoPair();

  const explicitLogoUrl =
    safeText(
      cfg.loaderLogoUrl ||
        cfg.logoUrl ||
        cfg.logo ||
        cfg.brandLogo ||
        cfg.appLogo ||
        "",
      ""
    );

  return {
    logoUrl:
      safeText(
        explicitLogoUrl ||
          defaultLogoUrl,
        defaultLogoUrl
      ),

    logoWhiteUrl:
      safeText(
        cfg.loaderLogoWhiteUrl ||
          cfg.logoWhiteUrl ||
          cfg.brandLogoWhite ||
          cfg.appLogoWhite ||
          explicitLogoUrl ||
          defaultLogoPair.white,
        defaultLogoPair.white
      ),

    logoBlackUrl:
      safeText(
        cfg.loaderLogoBlackUrl ||
          cfg.logoBlackUrl ||
          cfg.brandLogoBlack ||
          cfg.appLogoBlack ||
          explicitLogoUrl ||
          defaultLogoPair.black,
        defaultLogoPair.black
      ),

    appName:
      safeText(
        cfg.appName ||
          cfg.brandName ||
          "Onion Support",
        "Onion Support"
      ),

    text:
      safeText(
        cfg.loaderText ||
          "Cargando sesión...",
        "Cargando sesión..."
      ),

    subtext:
      safeText(
        cfg.loaderSubtext ||
          "Preparando panel seguro",
        "Preparando panel seguro"
      ),

    minVisibleMs:
      Math.max(
        0,
        safeNumber(
          cfg.loaderMinVisibleMs,
          DEFAULT_MIN_VISIBLE_MS
        )
      ),

    hideTransitionMs:
      Math.max(
        0,
        safeNumber(
          cfg.loaderHideTransitionMs,
          DEFAULT_HIDE_TRANSITION_MS
        )
      ),

    createIfMissing:
      cfg.loaderCreateIfMissing !== false,
  };
}

function getFailsafeTimeoutMs(timeoutMs = null) {
  return Math.max(
    MIN_FAILSAFE_MS,
    safeNumber(
      timeoutMs,
      safeNumber(
        BOOT_FAILSAFE_LOADER_MS,
        DEFAULT_FAILSAFE_MS
      )
    )
  );
}

/* =========================================================
   APP / SHELL ELEMENTS
========================================================= */

function getShellElement() {
  return getById(SHELL_ID);
}

function getMainElement() {
  return getById(MAIN_ID);
}

function getViewElement() {
  return getById(VIEW_ID);
}

function getSidebarMountElement() {
  return getById(SIDEBAR_MOUNT_ID);
}

function getTopbarMountElement() {
  return getById(TOPBAR_MOUNT_ID);
}

function isFatalDocumentState() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      document.documentElement?.classList?.contains("app-fatal") ||
        document.body?.classList?.contains("app-fatal") ||
        document.documentElement?.dataset?.appState === "fatal" ||
        document.body?.dataset?.shellState === "fatal"
    );
  } catch {
    return false;
  }
}

function setDocumentLoadingState(enabled = false, {
  booting = false,
  fatal = false,
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  const html =
    document.documentElement;

  const body =
    document.body;

  if (!html) {
    return false;
  }

  const loading =
    Boolean(enabled);

  const isBooting =
    Boolean(booting && loading);

  const isFatal =
    Boolean(fatal || isFatalDocumentState());

  try {
    toggleClasses(
      html,
      HTML_LOADING_CLASSES,
      false
    );

    if (isFatal) {
      addClasses(
        html,
        HTML_FATAL_CLASSES
      );

      removeClasses(
        html,
        HTML_READY_CLASSES
      );
    } else {
      removeClasses(
        html,
        HTML_FATAL_CLASSES
      );

      toggleClasses(
        html,
        HTML_READY_CLASSES,
        !loading
      );
    }

    if (loading) {
      addClasses(
        html,
        ["app-loading"]
      );

      if (isBooting) {
        addClasses(
          html,
          ["app-booting"]
        );
      }
    }

    html.dataset.appLoading =
      loading ? "true" : "false";

    html.dataset.appState =
      loading
        ? isBooting
          ? "booting"
          : "loading"
        : isFatal
          ? "fatal"
          : "ready";

    if (isBooting) {
      html.dataset.routeMode = "boot";
      html.dataset.shellState = "booting";
    } else if (!loading) {
      if (html.dataset.routeMode === "boot") {
        html.dataset.routeMode =
          isFatal ? "fatal" : "ready";
      }

      html.dataset.shellState =
        isFatal ? "fatal" : "ready";
    }
  } catch {}

  if (!body) {
    return true;
  }

  try {
    toggleClasses(
      body,
      BODY_LOADING_CLASSES,
      false
    );

    if (isFatal) {
      addClasses(
        body,
        BODY_FATAL_CLASSES
      );

      removeClasses(
        body,
        BODY_READY_CLASSES
      );
    } else {
      removeClasses(
        body,
        BODY_FATAL_CLASSES
      );

      toggleClasses(
        body,
        BODY_READY_CLASSES,
        !loading
      );
    }

    if (loading) {
      addClasses(
        body,
        ["app-loading"]
      );

      if (isBooting) {
        addClasses(
          body,
          ["app-booting"]
        );
      }
    }

    body.dataset.appLoading =
      loading ? "true" : "false";

    body.dataset.shellState =
      loading
        ? isBooting
          ? "booting"
          : "loading"
        : isFatal
          ? "fatal"
          : "ready";

    if (isBooting) {
      body.dataset.routeMode = "boot";
    } else if (!loading && body.dataset.routeMode === "boot") {
      body.dataset.routeMode =
        isFatal ? "fatal" : "ready";
    }
  } catch {}

  return true;
}

function setShellLoadingState(enabled = false, {
  booting = false,
  fatal = false,
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  const loading =
    Boolean(enabled);

  const isBooting =
    Boolean(booting && loading);

  const isFatal =
    Boolean(fatal || isFatalDocumentState());

  const shell =
    getShellElement();

  const main =
    getMainElement();

  const view =
    getViewElement();

  const sidebar =
    getSidebarMountElement();

  const topbar =
    getTopbarMountElement();

  const shellState =
    loading
      ? isBooting
        ? "booting"
        : "loading"
      : isFatal
        ? "fatal"
        : "ready";

  try {
    if (shell) {
      shell.hidden = false;

      shell.dataset.shell = shellState;
      shell.dataset.shellState = shellState;
      shell.dataset.shellInteractive =
        loading ? "false" : "true";

      if (shell.dataset.routeMode === "boot" && !loading) {
        shell.dataset.routeMode =
          isFatal ? "fatal" : "ready";
      }

      setAttr(
        shell,
        "aria-busy",
        loading ? "true" : "false"
      );

      setAttr(
        shell,
        "aria-hidden",
        "false"
      );
    }

    if (main) {
      main.hidden = false;

      setAttr(
        main,
        "aria-busy",
        loading ? "true" : "false"
      );

      setAttr(
        main,
        "aria-hidden",
        "false"
      );

      if (main.dataset.routeMode === "boot" && !loading) {
        main.dataset.routeMode =
          isFatal ? "fatal" : "ready";
      }
    }

    if (view) {
      view.hidden = false;

      setAttr(
        view,
        "aria-busy",
        loading ? "true" : "false"
      );

      setAttr(
        view,
        "aria-hidden",
        "false"
      );
    }

    if (sidebar) {
      setAttr(
        sidebar,
        "aria-hidden",
        loading ? "true" : "false"
      );
    }

    if (topbar) {
      setAttr(
        topbar,
        "aria-hidden",
        loading ? "true" : "false"
      );
    }

    return true;
  } catch {
    return false;
  }
}

function setAppLoadingState(enabled = false, {
  booting = false,
  fatal = false,
} = {}) {
  setDocumentLoadingState(
    enabled,
    {
      booting,
      fatal,
    }
  );

  setShellLoadingState(
    enabled,
    {
      booting,
      fatal,
    }
  );

  return true;
}

/* =========================================================
   FALLBACK MARKUP WITHOUT innerHTML
========================================================= */

function createLoaderImage({
  className,
  src,
  fetchPriority = "auto",
  dataset = {},
} = {}) {
  return createElement("img", {
    className,
    attrs: {
      src,
      alt: "",
      width: "64",
      height: "64",
      loading: "eager",
      decoding: "async",
      draggable: "false",
      "aria-hidden": "true",
      fetchpriority: fetchPriority,
    },
    dataset,
  });
}

function isElementDisplayed(element) {
  if (!element) {
    return false;
  }

  try {
    if (element.hidden) {
      return false;
    }

    const style =
      window.getComputedStyle?.(element);

    if (!style) {
      return true;
    }

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0
    );
  } catch {
    return true;
  }
}

function bindFallbackLogoErrorHandlers(loader) {
  if (!isBrowser() || !loader) {
    return false;
  }

  try {
    if (logoErrorBound.has(loader)) {
      return true;
    }

    const logos =
      Array.from(
        loader.querySelectorAll(".app-loader__logo")
      );

    const fallback =
      loader.querySelector(
        ".app-loader__logo-fallback"
      );

    if (!logos.length) {
      logoErrorBound.add(loader);
      return false;
    }

    for (const logo of logos) {
      logo.addEventListener(
        "error",
        () => {
          try {
            const wasVisible =
              isElementDisplayed(logo);

            logo.classList.add("is-broken");
            logo.hidden = true;

            logo.setAttribute(
              "aria-hidden",
              "true"
            );

            if (wasVisible && fallback) {
              loader.classList.add("has-logo-error");
            }
          } catch {}
        },
        {
          once:
            true,
        }
      );
    }

    logoErrorBound.add(loader);

    return true;
  } catch {
    return false;
  }
}

function syncExistingLoaderAssets(AppCore, loader) {
  if (!loader) {
    return false;
  }

  const cfg =
    getLoaderConfig(AppCore);

  try {
    setDataset(
      loader,
      "appLoader",
      "true"
    );

    if (!loader.id) {
      loader.id = LOADER_ID;
    }

    if (!loader.getAttribute("role")) {
      setAttr(
        loader,
        "role",
        "status"
      );
    }

    if (!loader.getAttribute("aria-live")) {
      setAttr(
        loader,
        "aria-live",
        "polite"
      );
    }

    const darkLogo =
      loader.querySelector?.(
        ".app-loader__logo--dark,[data-loader-logo-dark='true']"
      );

    const lightLogo =
      loader.querySelector?.(
        ".app-loader__logo--light,[data-loader-logo-light='true']"
      );

    if (darkLogo && !safeText(darkLogo.getAttribute("src"), "")) {
      setAttr(
        darkLogo,
        "src",
        cfg.logoWhiteUrl
      );
    }

    if (lightLogo && !safeText(lightLogo.getAttribute("src"), "")) {
      setAttr(
        lightLogo,
        "src",
        cfg.logoBlackUrl
      );
    }

    const title =
      loader.querySelector?.(
        ".app-loader__title,[data-loader-title='true']"
      );

    if (
      title &&
      !safeText(title.textContent, "")
    ) {
      title.textContent = cfg.appName;
    }

    const text =
      loader.querySelector?.(
        ".app-loader__text,[data-loader-text='true']"
      );

    if (
      text &&
      !safeText(text.textContent, "")
    ) {
      text.textContent = cfg.text;
    }

    bindFallbackLogoErrorHandlers(loader);

    return true;
  } catch {
    return false;
  }
}

function createFallbackLoader(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const cfg =
    getLoaderConfig(AppCore);

  if (!cfg.createIfMissing) {
    return null;
  }

  try {
    const loader =
      createElement("div", {
        id:
          LOADER_ID,

        className:
          "app-loader is-visible",

        attrs: {
          role:
            "status",
          "aria-live":
            "polite",
          "aria-busy":
            "true",
          "aria-hidden":
            "false",
        },

        dataset: {
          appLoader:
            "true",
          loaderGenerated:
            "true",
          loaderVisible:
            "true",
          loaderState:
            "booting",
        },
      });

    const backdrop =
      createElement("div", {
        className:
          "app-loader__backdrop",

        attrs: {
          "aria-hidden":
            "true",
        },

        dataset: {
          loaderBackdrop:
            "true",
        },
      });

    const card =
      createElement("div", {
        className:
          "app-loader__card",

        dataset: {
          loaderCard:
            "true",
        },
      });

    const brand =
      createElement("div", {
        className:
          "app-loader__brand",

        attrs: {
          "aria-hidden":
            "true",
        },

        dataset: {
          loaderBrand:
            "true",
        },
      });

    const darkLogo =
      createLoaderImage({
        className:
          "app-loader__logo app-loader__logo--dark",
        src:
          cfg.logoWhiteUrl,
        fetchPriority:
          "high",
        dataset: {
          loaderLogoDark:
            "true",
        },
      });

    const lightLogo =
      createLoaderImage({
        className:
          "app-loader__logo app-loader__logo--light",
        src:
          cfg.logoBlackUrl,
        fetchPriority:
          "low",
        dataset: {
          loaderLogoLight:
            "true",
        },
      });

    const fallbackLogo =
      createElement("div", {
        className:
          "app-loader__logo-fallback",
        text:
          cfg.appName.slice(0, 1).toUpperCase() || "O",
        attrs: {
          "aria-hidden":
            "true",
        },
        dataset: {
          loaderLogoFallback:
            "true",
        },
      });

    brand.appendChild(darkLogo);
    brand.appendChild(lightLogo);
    brand.appendChild(fallbackLogo);

    const copy =
      createElement("div", {
        className:
          "app-loader__copy",
      });

    const title =
      createElement("strong", {
        className:
          "app-loader__title",
        text:
          cfg.appName,
        dataset: {
          loaderTitle:
            "true",
        },
      });

    const text =
      createElement("span", {
        className:
          "app-loader__text",
        text:
          cfg.text,
        dataset: {
          loaderText:
            "true",
        },
      });

    copy.appendChild(title);
    copy.appendChild(text);

    if (cfg.subtext) {
      copy.appendChild(
        createElement("small", {
          className:
            "app-loader__subtext",
          text:
            cfg.subtext,
          dataset: {
            loaderSubtext:
              "true",
          },
        })
      );
    }

    const bar =
      createElement("div", {
        className:
          "app-loader__bar",
        attrs: {
          "aria-hidden":
            "true",
        },
      });

    const fill =
      createElement("span", {
        className:
          "app-loader__bar-fill",
      });

    bar.appendChild(fill);

    card.appendChild(brand);
    card.appendChild(copy);
    card.appendChild(bar);

    loader.appendChild(backdrop);
    loader.appendChild(card);

    bindFallbackLogoErrorHandlers(loader);

    const target =
      document.body ||
      document.documentElement;

    target.appendChild(loader);

    safeSetDomRef(
      AppCore,
      "loader",
      loader
    );

    safeSetDomRef(
      AppCore,
      "appLoader",
      loader
    );

    emitLoaderEvent(
      AppCore,
      EVENT_NAMES.fallbackCreated,
      {
        hasLoader:
          true,
        generated:
          true,
      }
    );

    return loader;
  } catch {
    return null;
  }
}

/* =========================================================
   ELEMENT
========================================================= */

export function getLoaderElement(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (
      AppCore?.dom?.loader &&
      documentContains(AppCore.dom.loader)
    ) {
      return AppCore.dom.loader;
    }
  } catch {}

  try {
    const el =
      getById(LOADER_ID) ||
      query(LOADER_SELECTOR) ||
      null;

    if (el) {
      safeSetDomRef(
        AppCore,
        "loader",
        el
      );

      safeSetDomRef(
        AppCore,
        "appLoader",
        el
      );

      syncExistingLoaderAssets(
        AppCore,
        el
      );
    }

    return el;
  } catch {
    return null;
  }
}

function ensureLoaderElement(AppCore) {
  const existing =
    getLoaderElement(AppCore);

  if (existing) {
    syncExistingLoaderAssets(
      AppCore,
      existing
    );

    return existing;
  }

  return createFallbackLoader(AppCore);
}

/* =========================================================
   INTERNAL DOM OPS
========================================================= */

function clearLoaderTimers() {
  clearTimer(hideTimer);
  clearTimer(transitionTimer);

  hideTimer = null;
  transitionTimer = null;
}

function isLoaderActuallyVisible(loader) {
  if (!loader) {
    return false;
  }

  try {
    if (loader.hidden) {
      return false;
    }

    if (
      loader.classList?.contains?.("is-hidden") ||
      loader.classList?.contains?.("has-hidden")
    ) {
      return false;
    }

    const style =
      window.getComputedStyle?.(loader);

    if (style) {
      if (style.display === "none") {
        return false;
      }

      if (style.visibility === "hidden") {
        return false;
      }

      if (Number(style.opacity) === 0) {
        return false;
      }
    }

    return true;
  } catch {
    return Boolean(
      loader &&
      !loader.hidden
    );
  }
}

function restoreLoaderInlineStyles(AppCore) {
  const loader =
    ensureLoaderElement(AppCore);

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

    removeClasses(
      loader,
      [
        ...LOADER_HIDDEN_CLASSES,
        ...LOADER_LEAVING_CLASSES,
      ]
    );

    addClasses(
      loader,
      [
        ...LOADER_VISIBLE_CLASSES,
        ...LOADER_ENTERING_CLASSES,
      ]
    );

    clearLegacyInlineLoaderStyles(loader);

    return true;
  } catch {
    return false;
  }
}

function markLoaderVisible(loader) {
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

    removeClasses(
      loader,
      [
        ...LOADER_HIDDEN_CLASSES,
        ...LOADER_LEAVING_CLASSES,
      ]
    );

    addClasses(
      loader,
      LOADER_VISIBLE_CLASSES
    );

    clearLegacyInlineLoaderStyles(loader);

    return true;
  } catch {
    return false;
  }
}

function markLoaderLeaving(loader) {
  if (!loader) {
    return false;
  }

  try {
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
      "leaving"
    );

    removeClasses(
      loader,
      [
        ...LOADER_VISIBLE_CLASSES,
        ...LOADER_ENTERING_CLASSES,
        "has-hidden",
      ]
    );

    addClasses(
      loader,
      [
        "is-leaving",
        "is-hidden",
      ]
    );

    clearLegacyInlineLoaderStyles(loader);

    return true;
  } catch {
    return false;
  }
}

function markLoaderHidden(loader) {
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

    removeClasses(
      loader,
      [
        ...LOADER_VISIBLE_CLASSES,
        ...LOADER_ENTERING_CLASSES,
        ...LOADER_LEAVING_CLASSES,
      ]
    );

    addClasses(
      loader,
      LOADER_HIDDEN_CLASSES
    );

    clearLegacyInlineLoaderStyles(loader);

    return true;
  } catch {
    return false;
  }
}

function setLoaderVisible(loader, visible = true, AppCore = null, sequenceId = sequence) {
  if (!loader) {
    return false;
  }

  const show =
    Boolean(visible);

  if (show) {
    return markLoaderVisible(loader);
  }

  const cfg =
    getLoaderConfig(AppCore);

  markLoaderLeaving(loader);

  clearTimer(transitionTimer);

  transitionTimer =
    window.setTimeout(
      () => {
        if (isCurrentSequence(sequenceId)) {
          markLoaderHidden(loader);
        }

        transitionTimer = null;
      },
      cfg.hideTransitionMs
    );

  return true;
}

/* =========================================================
   PUBLIC VISIBILITY API
========================================================= */

export function showLoader(AppCore, options = {}) {
  const opts =
    safeObject(options);

  if (!isBrowser()) {
    safeSetLoading(
      AppCore,
      true
    );

    if (opts.booting === true) {
      safeSetBooting(
        AppCore,
        true
      );
    }

    return true;
  }

  const id =
    nextSequence();

  clearLoaderTimers();

  const loader =
    ensureLoaderElement(AppCore);

  lastShowAt =
    now();

  setAppLoadingState(
    true,
    {
      booting:
        opts.booting === true,
      fatal:
        false,
    }
  );

  if (loader) {
    restoreLoaderInlineStyles(AppCore);
    markLoaderVisible(loader);
  }

  safeSetLoading(
    AppCore,
    true
  );

  if (opts.booting === true) {
    safeSetBooting(
      AppCore,
      true
    );
  }

  safeSetCoreState(
    AppCore,
    {
      loaderVisible:
        true,
      loaderState:
        opts.booting === true
          ? "booting"
          : "visible",
      loaderShownAt:
        epochNow(),
    }
  );

  emitLoaderEvent(
    AppCore,
    EVENT_NAMES.show,
    {
      sequence:
        id,
      hasLoader:
        Boolean(loader),
      booting:
        Boolean(opts.booting),
      reason:
        safeText(opts.reason, ""),
    },
    LEGACY_EVENT_ALIASES.show
  );

  return true;
}

export function forceHideLoader(AppCore, options = {}) {
  const opts =
    safeObject(options);

  if (!isBrowser()) {
    safeSetLoading(
      AppCore,
      false
    );

    safeSetBooting(
      AppCore,
      false
    );

    return true;
  }

  const id =
    nextSequence();

  clearLoaderTimers();
  clearBootFailsafeTimer(opts.state || null);

  const loader =
    getLoaderElement(AppCore);

  setAppLoadingState(
    false,
    {
      booting:
        false,
      fatal:
        Boolean(opts.fatal),
    }
  );

  if (loader) {
    markLoaderHidden(loader);
  }

  safeSetLoading(
    AppCore,
    false
  );

  safeSetBooting(
    AppCore,
    false
  );

  safeSetCoreState(
    AppCore,
    {
      loaderVisible:
        false,
      loaderState:
        Boolean(opts.fatal)
          ? "fatal"
          : "hidden",
      loaderHiddenAt:
        epochNow(),
    }
  );

  emitLoaderEvent(
    AppCore,
    EVENT_NAMES.forceHide,
    {
      sequence:
        id,
      forced:
        true,
      hasLoader:
        Boolean(loader),
      fatal:
        Boolean(opts.fatal),
      reason:
        safeText(opts.reason, ""),
    },
    LEGACY_EVENT_ALIASES.forceHide
  );

  return true;
}

export function hideLoader(AppCore, options = {}) {
  const opts =
    safeObject(options);

  if (!isBrowser()) {
    safeSetLoading(
      AppCore,
      false
    );

    safeSetBooting(
      AppCore,
      false
    );

    return true;
  }

  const cfg =
    getLoaderConfig(AppCore);

  const id =
    nextSequence();

  clearLoaderTimers();

  const initialLoader =
    getLoaderElement(AppCore);

  const minVisibleMs =
    Math.max(
      0,
      safeNumber(
        opts.minVisibleMs,
        cfg.minVisibleMs
      )
    );

  const elapsed =
    Math.max(
      0,
      now() - lastShowAt
    );

  const remaining =
    Math.max(
      0,
      minVisibleMs - elapsed
    );

  const executeHide = async () => {
    if (!isCurrentSequence(id)) {
      return false;
    }

    try {
      await requestPaint();
    } catch {}

    if (!isCurrentSequence(id)) {
      return false;
    }

    const loader =
      getLoaderElement(AppCore) ||
      initialLoader;

    setAppLoadingState(
      false,
      {
        booting:
          false,
        fatal:
          Boolean(opts.fatal),
      }
    );

    if (loader) {
      setLoaderVisible(
        loader,
        false,
        AppCore,
        id
      );
    }

    safeSetLoading(
      AppCore,
      false
    );

    safeSetBooting(
      AppCore,
      false
    );

    safeSetCoreState(
      AppCore,
      {
        loaderVisible:
          false,
        loaderState:
          Boolean(opts.fatal)
            ? "fatal"
            : "hidden",
        loaderHiddenAt:
          epochNow(),
      }
    );

    emitLoaderEvent(
      AppCore,
      EVENT_NAMES.hide,
      {
        sequence:
          id,
        forced:
          false,
        hasLoader:
          Boolean(loader),
        remaining,
        fatal:
          Boolean(opts.fatal),
        reason:
          safeText(opts.reason, ""),
      },
      LEGACY_EVENT_ALIASES.hide
    );

    return true;
  };

  if (remaining > 0) {
    hideTimer =
      window.setTimeout(
        () => {
          hideTimer = null;
          void executeHide();
        },
        remaining
      );

    return true;
  }

  void executeHide();

  return true;
}

/* =========================================================
   BOOT HELPERS
========================================================= */

export function takeOverStaticLoader(AppCore) {
  const loader =
    ensureLoaderElement(AppCore);

  lastShowAt =
    now();

  setAppLoadingState(
    true,
    {
      booting:
        true,
      fatal:
        false,
    }
  );

  if (loader) {
    restoreLoaderInlineStyles(AppCore);
    markLoaderVisible(loader);
  }

  safeSetLoading(
    AppCore,
    true
  );

  safeSetBooting(
    AppCore,
    true
  );

  safeSetCoreState(
    AppCore,
    {
      loaderVisible:
        true,
      loaderState:
        "booting",
      loaderShownAt:
        epochNow(),
    }
  );

  emitLoaderEvent(
    AppCore,
    EVENT_NAMES.takeover,
    {
      hasLoader:
        Boolean(loader),
    }
  );

  return Boolean(loader);
}

export function prepareBootLoader(AppCore, state = null) {
  const hasLoader =
    takeOverStaticLoader(AppCore);

  if (state) {
    try {
      state.loaderVisible = true;
      state.loaderShownAt = Date.now();
      state.booting = true;
    } catch {}
  }

  return hasLoader;
}

/* =========================================================
   FAILSAFE TIMER
========================================================= */

export function clearBootFailsafeTimer(state = null) {
  try {
    clearTimer(bootFailsafeTimer);
    bootFailsafeTimer = null;
  } catch {}

  try {
    if (state?.bootFailsafeTimer) {
      clearTimeout(state.bootFailsafeTimer);
      state.bootFailsafeTimer = null;
    }

    if (state) {
      state.bootFailsafeStartedAt = 0;
      state.bootFailsafeTimeoutMs = 0;
      state.bootFailsafeArmId = 0;
    }
  } catch {}

  return true;
}

function isBootFinalizedState(state = null, coreState = {}) {
  return Boolean(
    state?.booted ||
      state?.readyEmitted ||
      (
        state?.finalizedCycleId &&
        state?.bootCycleId &&
        state.finalizedCycleId === state.bootCycleId
      ) ||
      coreState.booted ||
      coreState.ready ||
      coreState.appReady
  );
}

function shouldWarnFailsafe({
  phase = "boot",
  route = "/",
  publicPath = "/",
} = {}) {
  const key =
    [
      phase,
      redactSensitiveText(route),
      redactSensitiveText(publicPath),
    ].join("|");

  const current =
    epochNow();

  if (
    key === lastFailsafeWarnKey &&
    current - lastFailsafeWarnAt < FAILSAFE_WARN_DEDUPE_MS
  ) {
    return false;
  }

  lastFailsafeWarnKey = key;
  lastFailsafeWarnAt = current;

  return true;
}

export function armBootFailsafeLoader({
  AppCore,
  state,
  hideLoader: hideFn = forceHideLoader,
  timeoutMs = null,
} = {}) {
  if (!isBrowser()) {
    return null;
  }

  clearBootFailsafeTimer(state);

  const timeout =
    getFailsafeTimeoutMs(timeoutMs);

  const armId =
    ++failsafeArmSequence;

  const startedAt =
    epochNow();

  if (state) {
    try {
      state.bootFailsafeStartedAt = startedAt;
      state.bootFailsafeTimeoutMs = timeout;
      state.bootFailsafeArmId = armId;
    } catch {}
  }

  safeSetCoreState(
    AppCore,
    {
      bootFailsafeStartedAt:
        startedAt,
      bootFailsafeTimeoutMs:
        timeout,
      bootFailsafeArmId:
        armId,
    }
  );

  const timer =
    window.setTimeout(
      () => {
        try {
          if (
            state?.bootFailsafeArmId &&
            state.bootFailsafeArmId !== armId
          ) {
            emitLoaderEvent(
              AppCore,
              EVENT_NAMES.failsafeStale,
              {
                timeout,
                armId,
                reason:
                  "arm-id-stale",
              }
            );

            return;
          }

          const coreState =
            safeGetState(AppCore);

          const loader =
            getLoaderElement(AppCore);

          const loaderVisible =
            isLoaderActuallyVisible(loader);

          const stillBooting =
            Boolean(
              state?.booting ||
                coreState.booting
            );

          const stillLoading =
            Boolean(
              state?.loaderVisible ||
                coreState.loading
            );

          const finalized =
            isBootFinalizedState(
              state,
              coreState
            );

          const route =
            coreState.route ||
            state?.route ||
            "/";

          const publicPath =
            coreState.publicPath ||
            state?.publicPath ||
            "/";

          const payload = {
            timeout,
            booting:
              stillBooting,
            loading:
              stillLoading,
            loaderVisible,
            finalized,
            route:
              redactSensitiveText(route),
            publicPath:
              redactSensitiveText(publicPath),
            armId,
          };

          if (
            !stillBooting &&
            !stillLoading &&
            !loaderVisible
          ) {
            emitLoaderEvent(
              AppCore,
              EVENT_NAMES.failsafeStale,
              {
                ...payload,
                reason:
                  "already-idle",
              }
            );

            return;
          }

          if (
            finalized &&
            !stillBooting
          ) {
            hideFn(
              AppCore,
              {
                reason:
                  "failsafe-stale-after-ready",
                state,
              }
            );

            emitLoaderEvent(
              AppCore,
              EVENT_NAMES.failsafeStale,
              payload
            );

            return;
          }

          if (
            shouldWarnFailsafe({
              phase:
                "boot",
              route,
              publicPath,
            })
          ) {
            safeWarn(
              AppCore,
              "Failsafe loader aplicado.",
              payload
            );
          }

          hideFn(
            AppCore,
            {
              reason:
                "failsafe",
              state,
            }
          );

          emitLoaderEvent(
            AppCore,
            EVENT_NAMES.failsafe,
            payload
          );
        } catch {}
      },
      timeout
    );

  bootFailsafeTimer =
    timer;

  if (state) {
    try {
      state.bootFailsafeTimer = timer;
    } catch {}
  }

  safeSetCoreState(
    AppCore,
    {
      bootFailsafeTimer:
        timer,
    }
  );

  emitLoaderEvent(
    AppCore,
    EVENT_NAMES.failsafeArmed,
    {
      timeout,
      armId,
    }
  );

  return timer;
}

/* =========================================================
   DEBUG
========================================================= */

function getClassList(element) {
  try {
    return Array.from(element?.classList || []);
  } catch {
    return [];
  }
}

function getComputedSnapshot(element) {
  if (!isBrowser() || !element) {
    return {};
  }

  try {
    const style =
      window.getComputedStyle(element);

    return {
      display:
        safeText(style.display, ""),
      opacity:
        safeText(style.opacity, ""),
      visibility:
        safeText(style.visibility, ""),
      pointerEvents:
        safeText(style.pointerEvents, ""),
    };
  } catch {
    return {};
  }
}

export function getLoaderSnapshot(AppCore, state = null) {
  const loader =
    getLoaderElement(AppCore);

  const coreState =
    safeGetState(AppCore);

  const shell =
    getShellElement();

  const main =
    getMainElement();

  const view =
    getViewElement();

  const bootTheme =
    getBootThemeSnapshot();

  let htmlTheme = "";
  let bodyTheme = "";
  let htmlAppState = "";
  let bodyAppLoading = "";

  let bodyClasses = [];
  let htmlClasses = [];

  try {
    if (isBrowser()) {
      htmlTheme =
        safeText(
          document.documentElement?.dataset?.theme,
          ""
        );

      htmlAppState =
        safeText(
          document.documentElement?.dataset?.appState,
          ""
        );

      htmlClasses =
        getClassList(
          document.documentElement
        );
    }
  } catch {}

  try {
    if (isBrowser()) {
      bodyTheme =
        safeText(
          document.body?.dataset?.theme,
          ""
        );

      bodyAppLoading =
        safeText(
          document.body?.dataset?.appLoading,
          ""
        );

      bodyClasses =
        getClassList(
          document.body
        );
    }
  } catch {}

  const route =
    coreState.route ||
    state?.route ||
    "/";

  const publicPath =
    coreState.publicPath ||
    state?.publicPath ||
    "/";

  return {
    version:
      LOADER_VERSION,

    exists:
      Boolean(loader),

    id:
      safeText(loader?.id, ""),

    generated:
      Boolean(loader?.dataset?.loaderGenerated),

    hidden:
      Boolean(loader?.hidden),

    ariaHidden:
      safeText(loader?.getAttribute?.("aria-hidden"), ""),

    ariaBusy:
      safeText(loader?.getAttribute?.("aria-busy"), ""),

    visible:
      isLoaderActuallyVisible(loader),

    datasetVisible:
      safeText(loader?.dataset?.loaderVisible, ""),

    datasetState:
      safeText(loader?.dataset?.loaderState, ""),

    classList:
      getClassList(loader),

    inlineStyle: {
      display:
        safeText(loader?.style?.display, ""),
      opacity:
        safeText(loader?.style?.opacity, ""),
      visibility:
        safeText(loader?.style?.visibility, ""),
      pointerEvents:
        safeText(loader?.style?.pointerEvents, ""),
    },

    computedStyle:
      getComputedSnapshot(loader),

    shell: {
      exists:
        Boolean(shell),

      datasetShell:
        safeText(shell?.dataset?.shell, ""),

      datasetShellState:
        safeText(shell?.dataset?.shellState, ""),

      datasetShellInteractive:
        safeText(shell?.dataset?.shellInteractive, ""),

      ariaBusy:
        safeText(shell?.getAttribute?.("aria-busy"), ""),

      ariaHidden:
        safeText(shell?.getAttribute?.("aria-hidden"), ""),

      classes:
        getClassList(shell),

      computedStyle:
        getComputedSnapshot(shell),
    },

    main: {
      exists:
        Boolean(main),

      ariaBusy:
        safeText(main?.getAttribute?.("aria-busy"), ""),

      ariaHidden:
        safeText(main?.getAttribute?.("aria-hidden"), ""),

      routeMode:
        safeText(main?.dataset?.routeMode, ""),
    },

    view: {
      exists:
        Boolean(view),

      ariaBusy:
        safeText(view?.getAttribute?.("aria-busy"), ""),

      ariaHidden:
        safeText(view?.getAttribute?.("aria-hidden"), ""),
    },

    loading:
      Boolean(coreState.loading),

    booting:
      Boolean(coreState.booting),

    booted:
      Boolean(
        coreState.booted ||
          state?.booted
      ),

    ready:
      Boolean(
        coreState.ready ||
          coreState.appReady ||
          state?.readyEmitted
      ),

    fatal:
      isFatalDocumentState(),

    route:
      redactSensitiveText(route),

    publicPath:
      redactSensitiveText(publicPath),

    htmlTheme,
    bodyTheme,
    htmlAppState,
    bodyAppLoading,

    bootTheme:
      sanitizePayload(bootTheme),

    bodyClasses,
    htmlClasses,

    hasFailsafeTimer:
      Boolean(
        bootFailsafeTimer ||
          state?.bootFailsafeTimer ||
          coreState.bootFailsafeTimer
      ),

    failsafeTimeoutMs:
      safeNumber(
        state?.bootFailsafeTimeoutMs ||
          coreState.bootFailsafeTimeoutMs,
        0
      ),

    failsafeStartedAt:
      safeNumber(
        state?.bootFailsafeStartedAt ||
          coreState.bootFailsafeStartedAt,
        0
      ),

    failsafeStartedAtIso:
      safeNumber(
        state?.bootFailsafeStartedAt ||
          coreState.bootFailsafeStartedAt,
        0
      )
        ? safeIsoDate(
            safeNumber(
              state?.bootFailsafeStartedAt ||
                coreState.bootFailsafeStartedAt,
              0
            )
          )
        : "",

    failsafeArmId:
      safeNumber(
        state?.bootFailsafeArmId ||
          coreState.bootFailsafeArmId,
        0
      ),

    lastShowAt,

    hasHideTimer:
      Boolean(hideTimer),

    hasTransitionTimer:
      Boolean(transitionTimer),

    sequence,
    failsafeArmSequence,

    lastFailsafeWarnKey:
      redactSensitiveText(lastFailsafeWarnKey),

    lastFailsafeWarnAt,

    lastFailsafeWarnAtIso:
      lastFailsafeWarnAt
        ? safeIsoDate(lastFailsafeWarnAt)
        : "",

    theme:
      getCurrentTheme(AppCore),

    logoUrl:
      getDefaultLoaderLogoUrl(AppCore),

    logoWhiteUrl:
      DEFAULT_LOADER_LOGO_WHITE_URL,

    logoBlackUrl:
      DEFAULT_LOADER_LOGO_BLACK_URL,
  };
}

/* =========================================================
   LEGACY COMPAT
========================================================= */

export {
  restoreLoaderInlineStyles,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOADER_VERSION,

  getLoaderElement,

  takeOverStaticLoader,
  prepareBootLoader,

  forceHideLoader,
  restoreLoaderInlineStyles,
  showLoader,
  hideLoader,

  clearBootFailsafeTimer,
  armBootFailsafeLoader,

  getLoaderSnapshot,
};

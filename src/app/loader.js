/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   Loader controller simple:
   - controla #app-loader estático
   - crea fallback sólo si falta
   - no decide rutas/auth/router
   - no inyecta CSS / no innerHTML / no inline styles
   - failsafe anti-loader infinito
   - compatible con AppCore.state / AppCore.dom
========================================================= */

import {
  APP_EVENTS,
  APP_RUNTIME_KEYS,
  BOOT_FAILSAFE_LOADER_MS,
  BOOT_MIN_LOADER_VISIBLE_MS,
  BOOT_HIDE_TRANSITION_MS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const LOADER_VERSION = "17.0.0-clean";

const SOURCE = "app:loader";

const LOADER_ID = "app-loader";
const LOADER_SELECTOR = "#app-loader,.app-loader,[data-app-loader='true'],[data-app-loader]";

const SHELL_ID = "app-shell";
const MAIN_ID = "main-content";
const VIEW_ID = "view-container";

const DEBUG_KEY =
  APP_RUNTIME_KEYS?.loader ||
  "__ONION_APP_LOADER__";

const DEFAULT_HIDE_TRANSITION_MS = Math.max(0, number(BOOT_HIDE_TRANSITION_MS, 220));
const DEFAULT_MIN_VISIBLE_MS = Math.max(0, number(BOOT_MIN_LOADER_VISIBLE_MS, 500));

const DEFAULT_FAILSAFE_MS = 12000;
const MIN_FAILSAFE_MS = 8000;
const MAX_FAILSAFE_MS = 120000;

const EVENT_DEDUPE_MS = 80;
const FAILSAFE_WARN_DEDUPE_MS = 30000;

const STATES = Object.freeze({
  booting: "booting",
  visible: "visible",
  leaving: "leaving",
  hidden: "hidden",
  fatal: "fatal",
});

const EVENTS = Object.freeze({
  takeover: "app:loader:takeover",

  show:
    APP_EVENTS?.bootLoaderShow ||
    "app:boot:loader:show",

  hide:
    APP_EVENTS?.bootLoaderHide ||
    "app:boot:loader:hide",

  hideSkipped: "app:boot:loader:hide-skipped",

  forceHide:
    APP_EVENTS?.bootLoaderForceHide ||
    "app:boot:loader:force-hide",

  fallbackCreated: "app:loader:fallback:created",
  failsafeArmed: "app:loader:failsafe:armed",
  failsafe: "app:loader:failsafe",
  failsafeStale: "app:loader:failsafe:stale",
  debugApi: "app:loader:debug-api",
  state: "app:loader:state",
});

const LEGACY_ALIASES = Object.freeze({
  show: ["app:loader:show"],
  hide: ["app:loader:hide"],
  forceHide: ["app:loader:force-hide"],
});

const HTML_LOADING_CLASSES = Object.freeze(["app-loading", "app-booting"]);
const BODY_LOADING_CLASSES = Object.freeze(["loading", "app-loading", "app-booting"]);

const READY_CLASSES = Object.freeze(["app-ready"]);
const FATAL_CLASSES = Object.freeze(["app-fatal"]);

const LOADER_VISIBLE_CLASSES = Object.freeze(["is-visible"]);
const LOADER_ENTERING_CLASSES = Object.freeze(["is-entering"]);
const LOADER_LEAVING_CLASSES = Object.freeze(["is-leaving"]);
const LOADER_HIDDEN_CLASSES = Object.freeze(["is-hidden", "has-hidden", "loader-hidden"]);

const SENSITIVE_PARAMS = Object.freeze([
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
  "jwt",
  "session",
  "sid",
]);

const WHITE_LOGO_URL = assetUrl("../media/img/favicon_white.png", "/src/media/img/favicon_white.png");
const BLACK_LOGO_URL = assetUrl("../media/img/favicon_black.png", "/src/media/img/favicon_black.png");

/* =========================================================
   RUNTIME
========================================================= */

let sequence = 0;
let lastShowAt = 0;

let hideTimer = null;
let transitionTimer = null;
let failsafeTimer = null;

let failsafeArmId = 0;

let lastEventKey = "";
let lastEventAt = 0;

let lastFailsafeWarnKey = "";
let lastFailsafeWarnAt = 0;

let lastError = null;

let debugApi = null;
let debugInstalled = false;

const logoErrorBound = new WeakSet();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function epoch() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function perf() {
  try {
    return performance.now();
  } catch {
    return epoch();
  }
}

function iso(ms = epoch()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function clamp(value, fallback, min, max) {
  return Math.max(min, Math.min(max, number(value, fallback)));
}

function assetUrl(relativePath, fallback = "") {
  try {
    return new URL(relativePath, import.meta.url).href;
  } catch {
    return fallback;
  }
}

function nextSeq() {
  sequence += 1;
  return sequence;
}

function isCurrentSeq(id) {
  return id === sequence;
}

function clearTimer(id) {
  try {
    if (id) clearTimeout(id);
  } catch {}
}

function clearUiTimers() {
  clearTimer(hideTimer);
  clearTimer(transitionTimer);

  hideTimer = null;
  transitionTimer = null;
}

function afterPaint() {
  return new Promise((resolve) => {
    if (!isBrowser()) {
      resolve();
      return;
    }

    try {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    } catch {
      try {
        window.setTimeout(resolve, 0);
      } catch {
        resolve();
      }
    }
  });
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redact(value = "") {
  let output = text(value, "");

  if (!output) return "";

  try {
    for (const name of SENSITIVE_PARAMS) {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"), "$1***");
    }

    output = output
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
  } catch {}

  return output;
}

function sanitize(value, depth = 0) {
  if (depth > 5) return "[MaxDepth]";

  if (typeof value === "string") return redact(value);

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") return String(value);
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
    return value.slice(0, 80).map((item) => sanitize(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|session|refresh/i.test(key)) {
        output[key] = item ? "***" : item;
        continue;
      }

      output[key] = sanitize(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function warn(AppCore, ...args) {
  const safeArgs = args.map((item) => sanitize(item));

  try {
    AppCore?.utils?.warn?.("[Loader]", ...safeArgs);
    return;
  } catch {}

  try {
    console.warn("[Loader]", ...safeArgs);
  } catch {}
}

function recordError(AppCore, source = "loader", error = null) {
  lastError = {
    source: text(source, "loader"),
    error: sanitize(error),
    at: iso(),
  };

  warn(AppCore, "Loader error:", lastError);

  return lastError;
}

function shouldDedupeEvent(eventName = "", payload = {}, force = false) {
  if (force) return false;

  const key = [
    text(eventName, ""),
    text(payload?.reason, ""),
    text(payload?.loaderState || payload?.state, ""),
    payload?.forced ? "forced" : "normal",
    payload?.fatal ? "fatal" : "ok",
  ].join("|");

  const current = epoch();

  if (key === lastEventKey && current - lastEventAt < EVENT_DEDUPE_MS) {
    return true;
  }

  lastEventKey = key;
  lastEventAt = current;

  return false;
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");

  if (!name) return false;

  const opts = object(options);

  if (opts.dedupe !== false && shouldDedupeEvent(name, payload, opts.force === true)) {
    return false;
  }

  const detail = sanitize({
    version: LOADER_VERSION,
    source: SOURCE,
    at: iso(),
    ...object(payload),
  });

  let hasBus = false;
  let emitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      hasBus = true;
      AppCore.events.emit(name, detail);
      emitted = true;
    }
  } catch {}

  if ((opts.window === true || !hasBus) && isBrowser()) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      emitted = true;
    } catch {}
  }

  return emitted;
}

function emitLoader(AppCore, eventName = "", payload = {}, aliases = [], options = {}) {
  let emitted = emit(AppCore, eventName, payload, options);

  for (const alias of array(aliases)) {
    if (alias && alias !== eventName) {
      emitted = emit(AppCore, alias, payload, { ...object(options), dedupe: false }) || emitted;
    }
  }

  return emitted;
}

/* =========================================================
   CORE STATE
========================================================= */

function getState(AppCore) {
  try {
    return object(AppCore?.state);
  } catch {
    return {};
  }
}

function setCoreState(AppCore, patch = {}, options = {}) {
  const clean = object(patch);
  const opts = object(options);

  try {
    AppCore?.setState?.(clean, {
      source: SOURCE,
      emit: opts.emit === true,
      emitState: opts.emitState === true,
      silent: opts.silent !== false,
    });

    return true;
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, clean);
      return true;
    }
  } catch {}

  return false;
}

function setLoading(AppCore, value = false) {
  const next = Boolean(value);

  try {
    AppCore?.setLoading?.(next);
    return true;
  } catch {
    return setCoreState(AppCore, { loading: next });
  }
}

function setBooting(AppCore, value = false) {
  const next = Boolean(value);

  return setCoreState(AppCore, {
    booting: next,
    appBooting: next,
  });
}

function setDomRef(AppCore, key = "", value = null) {
  if (!key) return false;

  try {
    if (AppCore?.dom) {
      AppCore.dom[key] = value;
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function qs(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function contains(element) {
  try {
    return Boolean(element && document.contains(element));
  } catch {
    return false;
  }
}

function attr(element, name, value) {
  if (!element || !name) return false;

  try {
    if (value === null || value === undefined) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function dataset(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
    } else {
      element.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function addClasses(element, classes = []) {
  if (!element) return false;

  try {
    const clean = array(classes).filter(Boolean);
    if (clean.length) element.classList.add(...clean);
    return true;
  } catch {
    return false;
  }
}

function removeClasses(element, classes = []) {
  if (!element) return false;

  try {
    const clean = array(classes).filter(Boolean);
    if (clean.length) element.classList.remove(...clean);
    return true;
  } catch {
    return false;
  }
}

function toggleClasses(element, classes = [], enabled = false) {
  if (!element) return false;

  try {
    for (const className of array(classes)) {
      if (className) element.classList.toggle(className, Boolean(enabled));
    }

    return true;
  } catch {
    return false;
  }
}

function clearInlineLoaderOverrides(loader) {
  if (!loader) return false;

  try {
    /*
      No aplicamos estilos inline. Sólo limpiamos overrides legacy.
    */
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";

    return true;
  } catch {
    return false;
  }
}

function createEl(tagName = "div", {
  id = "",
  className = "",
  textContent = "",
  attrs = {},
  dataset: data = {},
} = {}) {
  const element = document.createElement(tagName);

  if (id) element.id = id;
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;

  for (const [key, value] of Object.entries(object(attrs))) {
    attr(element, key, value);
  }

  for (const [key, value] of Object.entries(object(data))) {
    dataset(element, key, value);
  }

  return element;
}

/* =========================================================
   THEME / LOGO
========================================================= */

function normalizeTheme(value = "") {
  const theme = text(value, "").toLowerCase();

  if (theme === "light" || theme === "claro") return "light";
  if (theme === "dark" || theme === "oscuro") return "dark";
  if (["system", "auto", "automatic", "browser", "os", "device"].includes(theme)) return "system";

  return "";
}

function systemTheme() {
  if (!isBrowser()) return "dark";

  try {
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

function storedTheme() {
  if (!isBrowser()) return "";

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

  for (const storageName of ["localStorage", "sessionStorage"]) {
    for (const key of keys) {
      try {
        const theme = normalizeTheme(window[storageName]?.getItem?.(key));
        if (theme) return theme;
      } catch {}
    }
  }

  return "";
}

function resolveTheme(value = "") {
  const theme = normalizeTheme(value);

  if (theme === "system") return systemTheme();
  if (theme === "light" || theme === "dark") return theme;

  return "";
}

function currentTheme(AppCore) {
  try {
    const theme = resolveTheme(document.documentElement?.dataset?.theme);
    if (theme) return theme;
  } catch {}

  try {
    const boot = object(window.__ONION_BOOT_THEME__);
    const theme = resolveTheme(boot.theme || boot.mode || boot.resolvedTheme);
    if (theme) return theme;
  } catch {}

  try {
    const theme = resolveTheme(
      AppCore?.state?.theme ||
        AppCore?.state?.mode ||
        AppCore?.state?.appearance
    );

    if (theme) return theme;
  } catch {}

  return resolveTheme(storedTheme()) || "dark";
}

function defaultLogo(AppCore) {
  return currentTheme(AppCore) === "light"
    ? BLACK_LOGO_URL
    : WHITE_LOGO_URL;
}

function loaderConfig(AppCore) {
  const cfg = object(AppCore?.config);
  const logo = text(
    cfg.loaderLogoUrl ||
      cfg.logoUrl ||
      cfg.logo ||
      cfg.brandLogo ||
      cfg.appLogo ||
      "",
    ""
  );

  return {
    appName: text(cfg.appName || cfg.brandName || "Onion Support", "Onion Support"),

    text: text(cfg.loaderText || "Cargando sesión...", "Cargando sesión..."),

    subtext: text(cfg.loaderSubtext || "Preparando panel seguro", "Preparando panel seguro"),

    logoUrl: text(logo || defaultLogo(AppCore), defaultLogo(AppCore)),

    logoWhiteUrl: text(
      cfg.loaderLogoWhiteUrl ||
        cfg.logoWhiteUrl ||
        cfg.brandLogoWhite ||
        cfg.appLogoWhite ||
        logo ||
        WHITE_LOGO_URL,
      WHITE_LOGO_URL
    ),

    logoBlackUrl: text(
      cfg.loaderLogoBlackUrl ||
        cfg.logoBlackUrl ||
        cfg.brandLogoBlack ||
        cfg.appLogoBlack ||
        logo ||
        BLACK_LOGO_URL,
      BLACK_LOGO_URL
    ),

    minVisibleMs: Math.max(0, number(cfg.loaderMinVisibleMs, DEFAULT_MIN_VISIBLE_MS)),
    hideTransitionMs: Math.max(0, number(cfg.loaderHideTransitionMs, DEFAULT_HIDE_TRANSITION_MS)),

    createIfMissing: cfg.loaderCreateIfMissing !== false,
  };
}

/* =========================================================
   LOADER ELEMENT
========================================================= */

function bindLogoFallback(loader) {
  if (!isBrowser() || !loader || logoErrorBound.has(loader)) return false;

  try {
    const logos = Array.from(loader.querySelectorAll(".app-loader__logo"));
    const fallback = loader.querySelector(".app-loader__logo-fallback");

    for (const logo of logos) {
      logo.addEventListener(
        "error",
        () => {
          try {
            logo.classList.add("is-broken");
            logo.hidden = true;
            attr(logo, "aria-hidden", "true");

            if (fallback) {
              loader.classList.add("has-logo-error");
              loader.dataset.logoError = "true";
            }
          } catch {}
        },
        { once: true }
      );
    }

    logoErrorBound.add(loader);
    return true;
  } catch {
    return false;
  }
}

function syncExistingLoader(AppCore, loader) {
  if (!loader) return false;

  const cfg = loaderConfig(AppCore);

  try {
    dataset(loader, "appLoader", "true");

    if (!loader.id) loader.id = LOADER_ID;
    if (!loader.getAttribute("role")) attr(loader, "role", "status");
    if (!loader.getAttribute("aria-live")) attr(loader, "aria-live", "polite");

    const darkLogo = loader.querySelector?.(
      ".app-loader__logo--dark,[data-loader-logo-dark='true']"
    );

    const lightLogo = loader.querySelector?.(
      ".app-loader__logo--light,[data-loader-logo-light='true']"
    );

    const genericLogo = loader.querySelector?.(
      ".app-loader__logo:not(.app-loader__logo--dark):not(.app-loader__logo--light),[data-loader-logo='true']"
    );

    if (darkLogo && !text(darkLogo.getAttribute("src"), "")) {
      attr(darkLogo, "src", cfg.logoWhiteUrl);
    }

    if (lightLogo && !text(lightLogo.getAttribute("src"), "")) {
      attr(lightLogo, "src", cfg.logoBlackUrl);
    }

    if (genericLogo && !text(genericLogo.getAttribute("src"), "")) {
      attr(genericLogo, "src", cfg.logoUrl);
    }

    const title = loader.querySelector?.(".app-loader__title,[data-loader-title='true']");
    const body = loader.querySelector?.(".app-loader__text,[data-loader-text='true']");
    const subtext = loader.querySelector?.(".app-loader__subtext,[data-loader-subtext='true']");

    if (title && !text(title.textContent, "")) title.textContent = cfg.appName;
    if (body && !text(body.textContent, "")) body.textContent = cfg.text;
    if (subtext && !text(subtext.textContent, "") && cfg.subtext) subtext.textContent = cfg.subtext;

    bindLogoFallback(loader);

    return true;
  } catch (error) {
    recordError(AppCore, "sync-existing-loader", error);
    return false;
  }
}

function createLoaderImage({ className = "", src = "", priority = "auto", data = {} } = {}) {
  return createEl("img", {
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
      fetchpriority: priority,
    },
    dataset: data,
  });
}

function createFallbackLoader(AppCore) {
  if (!isBrowser()) return null;

  const cfg = loaderConfig(AppCore);

  if (!cfg.createIfMissing) return null;

  try {
    const loader = createEl("div", {
      id: LOADER_ID,
      className: "app-loader is-visible",
      attrs: {
        role: "status",
        "aria-live": "polite",
        "aria-busy": "true",
        "aria-hidden": "false",
      },
      dataset: {
        appLoader: "true",
        loaderGenerated: "true",
        loaderVisible: "true",
        loaderState: STATES.booting,
      },
    });

    const backdrop = createEl("div", {
      className: "app-loader__backdrop",
      attrs: {
        "aria-hidden": "true",
      },
      dataset: {
        loaderBackdrop: "true",
      },
    });

    const card = createEl("div", {
      className: "app-loader__card",
      dataset: {
        loaderCard: "true",
      },
    });

    const brand = createEl("div", {
      className: "app-loader__brand",
      attrs: {
        "aria-hidden": "true",
      },
      dataset: {
        loaderBrand: "true",
      },
    });

    brand.appendChild(
      createLoaderImage({
        className: "app-loader__logo app-loader__logo--dark",
        src: cfg.logoWhiteUrl,
        priority: "high",
        data: {
          loaderLogoDark: "true",
        },
      })
    );

    brand.appendChild(
      createLoaderImage({
        className: "app-loader__logo app-loader__logo--light",
        src: cfg.logoBlackUrl,
        priority: "low",
        data: {
          loaderLogoLight: "true",
        },
      })
    );

    brand.appendChild(
      createEl("div", {
        className: "app-loader__logo-fallback",
        textContent: cfg.appName.slice(0, 1).toUpperCase() || "O",
        attrs: {
          "aria-hidden": "true",
        },
        dataset: {
          loaderLogoFallback: "true",
        },
      })
    );

    const copy = createEl("div", {
      className: "app-loader__copy",
    });

    copy.appendChild(
      createEl("strong", {
        className: "app-loader__title",
        textContent: cfg.appName,
        dataset: {
          loaderTitle: "true",
        },
      })
    );

    copy.appendChild(
      createEl("span", {
        className: "app-loader__text",
        textContent: cfg.text,
        dataset: {
          loaderText: "true",
        },
      })
    );

    if (cfg.subtext) {
      copy.appendChild(
        createEl("small", {
          className: "app-loader__subtext",
          textContent: cfg.subtext,
          dataset: {
            loaderSubtext: "true",
          },
        })
      );
    }

    const bar = createEl("div", {
      className: "app-loader__bar",
      attrs: {
        "aria-hidden": "true",
      },
    });

    bar.appendChild(
      createEl("span", {
        className: "app-loader__bar-fill",
      })
    );

    card.appendChild(brand);
    card.appendChild(copy);
    card.appendChild(bar);

    loader.appendChild(backdrop);
    loader.appendChild(card);

    bindLogoFallback(loader);

    (document.body || document.documentElement).appendChild(loader);

    setDomRef(AppCore, "loader", loader);
    setDomRef(AppCore, "appLoader", loader);

    emitLoader(AppCore, EVENTS.fallbackCreated, {
      hasLoader: true,
      generated: true,
    });

    return loader;
  } catch (error) {
    recordError(AppCore, "create-fallback-loader", error);
    return null;
  }
}

export function getLoaderElement(AppCore) {
  if (!isBrowser()) return null;

  try {
    if (AppCore?.dom?.loader && contains(AppCore.dom.loader)) {
      return AppCore.dom.loader;
    }
  } catch {}

  const loader = byId(LOADER_ID) || qs(LOADER_SELECTOR);

  if (loader) {
    setDomRef(AppCore, "loader", loader);
    setDomRef(AppCore, "appLoader", loader);
    syncExistingLoader(AppCore, loader);
  }

  return loader || null;
}

function ensureLoaderElement(AppCore) {
  const loader = getLoaderElement(AppCore);

  if (loader) {
    syncExistingLoader(AppCore, loader);
    return loader;
  }

  return createFallbackLoader(AppCore);
}

/* =========================================================
   APP/SHELL STATE
========================================================= */

function shellEl() {
  return byId(SHELL_ID);
}

function mainEl() {
  return byId(MAIN_ID);
}

function viewEl() {
  return byId(VIEW_ID);
}

function fatalDocumentState() {
  if (!isBrowser()) return false;

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

function setDocumentLoading(enabled = false, { booting = false, fatal = false } = {}) {
  if (!isBrowser()) return false;

  const loading = Boolean(enabled);
  const isBooting = Boolean(booting && loading);
  const isFatal = Boolean(fatal || fatalDocumentState());

  const html = document.documentElement;
  const body = document.body;

  for (const root of [html, body]) {
    if (!root) continue;

    const loadingClasses = root === body ? BODY_LOADING_CLASSES : HTML_LOADING_CLASSES;

    removeClasses(root, loadingClasses);
    toggleClasses(root, FATAL_CLASSES, isFatal);
    toggleClasses(root, READY_CLASSES, !loading && !isFatal);

    if (loading) {
      addClasses(root, ["app-loading"]);

      if (isBooting) {
        addClasses(root, ["app-booting"]);
      }
    }

    dataset(root, "appLoading", loading ? "true" : "false");

    if (root === html) {
      dataset(root, "appState", loading ? isBooting ? "booting" : "loading" : isFatal ? "fatal" : "ready");
    }

    dataset(root, "shellState", loading ? isBooting ? "booting" : "loading" : isFatal ? "fatal" : "ready");

    if (isBooting) {
      dataset(root, "routeMode", "boot");
    } else if (!loading && root.dataset?.routeMode === "boot") {
      dataset(root, "routeMode", isFatal ? "fatal" : "ready");
    }
  }

  return true;
}

function setShellLoading(enabled = false, { booting = false, fatal = false } = {}) {
  if (!isBrowser()) return false;

  const loading = Boolean(enabled);
  const isBooting = Boolean(booting && loading);
  const isFatal = Boolean(fatal || fatalDocumentState());

  const state = loading
    ? isBooting ? "booting" : "loading"
    : isFatal ? "fatal" : "ready";

  for (const element of [shellEl(), mainEl(), viewEl()]) {
    if (!element) continue;

    try {
      element.hidden = false;
      attr(element, "aria-busy", loading ? "true" : "false");
      attr(element, "aria-hidden", "false");

      if (element.id === SHELL_ID) {
        dataset(element, "shell", state);
        dataset(element, "shellState", state);
        dataset(element, "shellInteractive", loading ? "false" : "true");
      }

      if (!loading && element.dataset?.routeMode === "boot") {
        dataset(element, "routeMode", state);
      }
    } catch {}
  }

  return true;
}

function setAppLoading(enabled = false, options = {}) {
  setDocumentLoading(enabled, options);
  setShellLoading(enabled, options);

  return true;
}

/* =========================================================
   LOADER MARKERS
========================================================= */

function isLoaderActuallyVisible(loader) {
  if (!loader) return false;

  try {
    if (loader.hidden) return false;

    if (
      loader.classList?.contains?.("is-hidden") ||
      loader.classList?.contains?.("has-hidden") ||
      loader.classList?.contains?.("loader-hidden")
    ) {
      return false;
    }

    if (loader.getAttribute("aria-hidden") === "true") return false;
    if (loader.dataset?.loaderVisible === "false") return false;

    if (
      loader.dataset?.loaderState === STATES.hidden ||
      loader.dataset?.loaderState === "removed"
    ) {
      return false;
    }

    const style = window.getComputedStyle?.(loader);

    if (style) {
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (Number(style.opacity) === 0) return false;
    }

    return true;
  } catch {
    return Boolean(loader && !loader.hidden);
  }
}

export function isLoaderVisible(AppCore) {
  return isLoaderActuallyVisible(getLoaderElement(AppCore));
}

function markVisible(loader, state = STATES.visible) {
  if (!loader) return false;

  try {
    loader.hidden = false;
    loader.removeAttribute("hidden");

    attr(loader, "aria-hidden", "false");
    attr(loader, "aria-busy", "true");

    dataset(loader, "loaderVisible", "true");
    dataset(loader, "loaderState", state || STATES.visible);

    removeClasses(loader, [...LOADER_HIDDEN_CLASSES, ...LOADER_LEAVING_CLASSES]);
    addClasses(loader, LOADER_VISIBLE_CLASSES);

    clearInlineLoaderOverrides(loader);

    return true;
  } catch {
    return false;
  }
}

export function restoreLoaderInlineStyles(AppCore, loaderState = STATES.visible) {
  return markVisible(ensureLoaderElement(AppCore), loaderState);
}

function markLeaving(loader) {
  if (!loader) return false;

  try {
    attr(loader, "aria-hidden", "true");
    attr(loader, "aria-busy", "false");

    dataset(loader, "loaderVisible", "false");
    dataset(loader, "loaderState", STATES.leaving);

    removeClasses(loader, [...LOADER_VISIBLE_CLASSES, ...LOADER_ENTERING_CLASSES, "has-hidden"]);
    addClasses(loader, ["is-leaving", "is-hidden"]);

    clearInlineLoaderOverrides(loader);

    return true;
  } catch {
    return false;
  }
}

function markHidden(loader, state = STATES.hidden) {
  if (!loader) return false;

  try {
    loader.hidden = true;

    attr(loader, "aria-hidden", "true");
    attr(loader, "aria-busy", "false");

    dataset(loader, "loaderVisible", "false");
    dataset(loader, "loaderState", state || STATES.hidden);

    removeClasses(loader, [
      ...LOADER_VISIBLE_CLASSES,
      ...LOADER_ENTERING_CLASSES,
      ...LOADER_LEAVING_CLASSES,
    ]);

    addClasses(loader, LOADER_HIDDEN_CLASSES);

    clearInlineLoaderOverrides(loader);

    return true;
  } catch {
    return false;
  }
}

function setLoaderVisible(loader, visible = true, AppCore = null, seq = sequence) {
  if (!loader) return false;

  if (visible) return markVisible(loader);

  const cfg = loaderConfig(AppCore);

  markLeaving(loader);

  clearTimer(transitionTimer);

  transitionTimer = window.setTimeout(() => {
    if (isCurrentSeq(seq)) {
      markHidden(loader);
    }

    transitionTimer = null;
  }, cfg.hideTransitionMs);

  return true;
}

/* =========================================================
   BOOT GUARDS
========================================================= */

function hasBootClass() {
  if (!isBrowser()) return false;

  try {
    return Boolean(
      document.documentElement?.classList?.contains("app-booting") ||
        document.documentElement?.classList?.contains("app-loading") ||
        document.body?.classList?.contains("app-booting") ||
        document.body?.classList?.contains("app-loading")
    );
  } catch {
    return false;
  }
}

function bootFinalized(state = null, coreState = {}) {
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

function bootActive(AppCore, state = null) {
  const coreState = getState(AppCore);

  if (bootFinalized(state, coreState)) return false;

  return Boolean(
    state?.booting ||
      coreState.booting ||
      coreState.appBooting ||
      coreState.bootInProgress ||
      hasBootClass()
  );
}

function allowHideDuringBoot(options = {}) {
  const opts = object(options);
  const reason = text(opts.reason, "").toLowerCase();

  return Boolean(
    opts.force === true ||
      opts.forceHide === true ||
      opts.finalize === true ||
      opts.allowDuringBoot === true ||
      opts.failsafe === true ||
      [
        "finalize-boot",
        "boot-complete",
        "failsafe",
        "failsafe-stale-after-ready",
        "boot-error",
        "reboot-reset",
        "app-destroy",
      ].includes(reason)
  );
}

/* =========================================================
   PUBLIC API
========================================================= */

export function showLoader(AppCore, options = {}) {
  const opts = object(options);

  if (!isBrowser()) {
    setLoading(AppCore, true);

    if (opts.booting === true) {
      setBooting(AppCore, true);
    }

    return true;
  }

  const id = nextSeq();

  clearUiTimers();

  const loader = ensureLoaderElement(AppCore);
  const state = opts.booting === true ? STATES.booting : STATES.visible;

  lastShowAt = perf();

  setAppLoading(true, {
    booting: opts.booting === true,
    fatal: false,
  });

  if (loader) {
    restoreLoaderInlineStyles(AppCore, state);
    markVisible(loader, state);
  }

  setLoading(AppCore, true);

  if (opts.booting === true) {
    setBooting(AppCore, true);
  }

  setCoreState(AppCore, {
    loaderVisible: true,
    loaderState: state,
    loaderShownAt: epoch(),
  });

  emitLoader(
    AppCore,
    EVENTS.show,
    {
      sequence: id,
      hasLoader: Boolean(loader),
      booting: Boolean(opts.booting),
      reason: text(opts.reason, ""),
      loaderState: state,
    },
    LEGACY_ALIASES.show
  );

  return true;
}

export function forceHideLoader(AppCore, options = {}) {
  const opts = object(options);

  if (!isBrowser()) {
    setLoading(AppCore, false);
    setBooting(AppCore, false);
    return true;
  }

  const id = nextSeq();

  clearUiTimers();
  clearBootFailsafeTimer(opts.state || null, AppCore);

  const loader = getLoaderElement(AppCore);
  const state = opts.fatal ? STATES.fatal : STATES.hidden;

  setAppLoading(false, {
    booting: false,
    fatal: Boolean(opts.fatal),
  });

  if (loader) {
    markHidden(loader, state);
  }

  setLoading(AppCore, false);
  setBooting(AppCore, false);

  setCoreState(AppCore, {
    loaderVisible: false,
    loaderState: state,
    loaderHiddenAt: epoch(),
  });

  emitLoader(
    AppCore,
    EVENTS.forceHide,
    {
      sequence: id,
      forced: true,
      hasLoader: Boolean(loader),
      fatal: Boolean(opts.fatal),
      reason: text(opts.reason, ""),
      loaderState: state,
    },
    LEGACY_ALIASES.forceHide,
    { force: true }
  );

  return true;
}

export function hideLoader(AppCore, options = {}) {
  const opts = object(options);

  if (!isBrowser()) {
    setLoading(AppCore, false);
    setBooting(AppCore, false);
    return true;
  }

  if (bootActive(AppCore, opts.state || null) && !allowHideDuringBoot(opts)) {
    emitLoader(AppCore, EVENTS.hideSkipped, {
      reason: text(opts.reason, "boot-active"),
      bootActive: true,
    });

    return false;
  }

  const cfg = loaderConfig(AppCore);
  const id = nextSeq();

  clearUiTimers();

  const initialLoader = getLoaderElement(AppCore);

  const minVisibleMs = Math.max(0, number(opts.minVisibleMs, cfg.minVisibleMs));
  const elapsed = Math.max(0, perf() - lastShowAt);
  const remaining = Math.max(0, minVisibleMs - elapsed);

  const run = async () => {
    if (!isCurrentSeq(id)) return false;

    await afterPaint();

    if (!isCurrentSeq(id)) return false;

    const loader = getLoaderElement(AppCore) || initialLoader;
    const state = opts.fatal ? STATES.fatal : STATES.hidden;

    setAppLoading(false, {
      booting: false,
      fatal: Boolean(opts.fatal),
    });

    if (loader) {
      if (opts.fatal) {
        markHidden(loader, state);
      } else {
        setLoaderVisible(loader, false, AppCore, id);
      }
    }

    setLoading(AppCore, false);
    setBooting(AppCore, false);

    setCoreState(AppCore, {
      loaderVisible: false,
      loaderState: state,
      loaderHiddenAt: epoch(),
    });

    emitLoader(
      AppCore,
      EVENTS.hide,
      {
        sequence: id,
        forced: false,
        hasLoader: Boolean(loader),
        remaining,
        fatal: Boolean(opts.fatal),
        reason: text(opts.reason, ""),
        loaderState: state,
      },
      LEGACY_ALIASES.hide
    );

    return true;
  };

  if (remaining > 0) {
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      void run();
    }, remaining);

    return true;
  }

  void run();
  return true;
}

/* =========================================================
   BOOT API
========================================================= */

export function takeOverStaticLoader(AppCore) {
  const loader = ensureLoaderElement(AppCore);

  lastShowAt = perf();

  setAppLoading(true, {
    booting: true,
    fatal: false,
  });

  if (loader) {
    restoreLoaderInlineStyles(AppCore, STATES.booting);
    markVisible(loader, STATES.booting);
  }

  setLoading(AppCore, true);
  setBooting(AppCore, true);

  setCoreState(AppCore, {
    loaderVisible: true,
    loaderState: STATES.booting,
    loaderShownAt: epoch(),
  });

  emitLoader(AppCore, EVENTS.takeover, {
    hasLoader: Boolean(loader),
    loaderState: STATES.booting,
  });

  installLoaderDebugApi(AppCore);

  return Boolean(loader);
}

export function prepareBootLoader(AppCore, state = null) {
  const ok = takeOverStaticLoader(AppCore);

  if (state) {
    try {
      state.loaderVisible = true;
      state.loaderShownAt = epoch();
      state.booting = true;
    } catch {}
  }

  return ok;
}

/* =========================================================
   FAILSAFE
========================================================= */

function failsafeTimeout(value = null) {
  return clamp(
    value ?? BOOT_FAILSAFE_LOADER_MS,
    DEFAULT_FAILSAFE_MS,
    MIN_FAILSAFE_MS,
    MAX_FAILSAFE_MS
  );
}

export function clearBootFailsafeTimer(state = null, AppCore = null) {
  clearTimer(failsafeTimer);
  failsafeTimer = null;

  try {
    if (state?.bootFailsafeTimer) {
      clearTimeout(state.bootFailsafeTimer);
    }

    if (state) {
      state.bootFailsafeTimer = null;
      state.bootFailsafeStartedAt = 0;
      state.bootFailsafeTimeoutMs = 0;
      state.bootFailsafeArmId = 0;
    }
  } catch {}

  setCoreState(AppCore, {
    bootFailsafeStartedAt: 0,
    bootFailsafeTimeoutMs: 0,
    bootFailsafeArmId: 0,
    bootFailsafeArmed: false,
  });

  return true;
}

function shouldWarnFailsafe({ phase = "boot", route = "/", publicPath = "/" } = {}) {
  const key = [
    phase,
    redact(route),
    redact(publicPath),
  ].join("|");

  const current = epoch();

  if (key === lastFailsafeWarnKey && current - lastFailsafeWarnAt < FAILSAFE_WARN_DEDUPE_MS) {
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
  if (!isBrowser()) return null;

  clearBootFailsafeTimer(state, AppCore);

  const timeout = failsafeTimeout(timeoutMs);
  const armId = ++failsafeArmId;
  const startedAt = epoch();

  try {
    if (state) {
      state.bootFailsafeStartedAt = startedAt;
      state.bootFailsafeTimeoutMs = timeout;
      state.bootFailsafeArmId = armId;
    }
  } catch {}

  setCoreState(AppCore, {
    bootFailsafeStartedAt: startedAt,
    bootFailsafeTimeoutMs: timeout,
    bootFailsafeArmId: armId,
    bootFailsafeArmed: true,
  });

  failsafeTimer = window.setTimeout(() => {
    try {
      if (state?.bootFailsafeArmId && state.bootFailsafeArmId !== armId) {
        emitLoader(AppCore, EVENTS.failsafeStale, {
          timeout,
          armId,
          reason: "arm-id-stale",
        });

        return;
      }

      const coreState = getState(AppCore);
      const loader = getLoaderElement(AppCore);

      const loaderVisible = isLoaderActuallyVisible(loader);

      const stillBooting = Boolean(state?.booting || coreState.booting);
      const stillLoading = Boolean(state?.loaderVisible || coreState.loading || coreState.loaderVisible);
      const finalized = bootFinalized(state, coreState);

      const route = coreState.route || state?.route || "/";
      const publicPath = coreState.publicPath || state?.publicPath || "/";

      const payload = {
        timeout,
        booting: stillBooting,
        loading: stillLoading,
        loaderVisible,
        finalized,
        route: redact(route),
        publicPath: redact(publicPath),
        armId,
      };

      if (!stillBooting && !stillLoading && !loaderVisible) {
        emitLoader(AppCore, EVENTS.failsafeStale, {
          ...payload,
          reason: "already-idle",
        });

        clearBootFailsafeTimer(state, AppCore);
        return;
      }

      if (finalized && !stillBooting) {
        hideFn(AppCore, {
          reason: "failsafe-stale-after-ready",
          state,
          force: true,
          failsafe: true,
        });

        emitLoader(AppCore, EVENTS.failsafeStale, payload);

        clearBootFailsafeTimer(state, AppCore);
        return;
      }

      if (shouldWarnFailsafe({ route, publicPath })) {
        warn(AppCore, "Failsafe loader aplicado.", payload);
      }

      hideFn(AppCore, {
        reason: "failsafe",
        state,
        force: true,
        failsafe: true,
      });

      emitLoader(AppCore, EVENTS.failsafe, payload, [], { force: true });

      clearBootFailsafeTimer(state, AppCore);
    } catch (error) {
      recordError(AppCore, "boot-failsafe", error);
    }
  }, timeout);

  try {
    if (state) {
      state.bootFailsafeTimer = failsafeTimer;
    }
  } catch {}

  emitLoader(AppCore, EVENTS.failsafeArmed, {
    timeout,
    armId,
  });

  return failsafeTimer;
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

function classList(element) {
  try {
    return Array.from(element?.classList || []);
  } catch {
    return [];
  }
}

function computed(element) {
  if (!isBrowser() || !element) return {};

  try {
    const style = window.getComputedStyle(element);

    return {
      display: text(style.display, ""),
      opacity: text(style.opacity, ""),
      visibility: text(style.visibility, ""),
      pointerEvents: text(style.pointerEvents, ""),
      position: text(style.position, ""),
      zIndex: text(style.zIndex, ""),
    };
  } catch {
    return {};
  }
}

function elementSnapshot(element) {
  if (!element) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: text(element.id, ""),
    tag: text(element.tagName?.toLowerCase?.(), ""),
    hidden: Boolean(element.hidden),

    ariaHidden: text(element.getAttribute?.("aria-hidden"), ""),
    ariaBusy: text(element.getAttribute?.("aria-busy"), ""),

    dataset: sanitize({
      loaderVisible: element.dataset?.loaderVisible,
      loaderState: element.dataset?.loaderState,
      shell: element.dataset?.shell,
      shellState: element.dataset?.shellState,
      shellInteractive: element.dataset?.shellInteractive,
      routeMode: element.dataset?.routeMode,
    }),

    classList: classList(element),

    inlineStyle: {
      display: text(element.style?.display, ""),
      opacity: text(element.style?.opacity, ""),
      visibility: text(element.style?.visibility, ""),
      pointerEvents: text(element.style?.pointerEvents, ""),
    },

    computedStyle: computed(element),
  };
}

export function getLoaderSnapshot(AppCore, state = null) {
  const loader = getLoaderElement(AppCore);
  const coreState = getState(AppCore);

  const route = coreState.route || state?.route || "/";
  const publicPath = coreState.publicPath || state?.publicPath || "/";

  const failsafeStarted = number(
    state?.bootFailsafeStartedAt ||
      coreState.bootFailsafeStartedAt,
    0
  );

  let htmlTheme = "";
  let bodyTheme = "";
  let htmlAppState = "";
  let bodyAppLoading = "";
  let htmlClasses = [];
  let bodyClasses = [];

  try {
    if (isBrowser()) {
      htmlTheme = text(document.documentElement?.dataset?.theme, "");
      htmlAppState = text(document.documentElement?.dataset?.appState, "");
      htmlClasses = classList(document.documentElement);

      bodyTheme = text(document.body?.dataset?.theme, "");
      bodyAppLoading = text(document.body?.dataset?.appLoading, "");
      bodyClasses = classList(document.body);
    }
  } catch {}

  return sanitize({
    version: LOADER_VERSION,

    exists: Boolean(loader),
    id: text(loader?.id, ""),
    generated: Boolean(loader?.dataset?.loaderGenerated),

    hidden: Boolean(loader?.hidden),
    visible: isLoaderActuallyVisible(loader),

    ariaHidden: text(loader?.getAttribute?.("aria-hidden"), ""),
    ariaBusy: text(loader?.getAttribute?.("aria-busy"), ""),

    datasetVisible: text(loader?.dataset?.loaderVisible, ""),
    datasetState: text(loader?.dataset?.loaderState, ""),

    classList: classList(loader),

    inlineStyle: {
      display: text(loader?.style?.display, ""),
      opacity: text(loader?.style?.opacity, ""),
      visibility: text(loader?.style?.visibility, ""),
      pointerEvents: text(loader?.style?.pointerEvents, ""),
    },

    computedStyle: computed(loader),

    shell: elementSnapshot(shellEl()),
    main: elementSnapshot(mainEl()),
    view: elementSnapshot(viewEl()),

    loading: Boolean(coreState.loading),
    booting: Boolean(coreState.booting),
    booted: Boolean(coreState.booted || state?.booted),
    ready: Boolean(coreState.ready || coreState.appReady || state?.readyEmitted),
    fatal: fatalDocumentState(),
    bootActive: bootActive(AppCore, state),

    route: redact(route),
    publicPath: redact(publicPath),

    htmlTheme,
    bodyTheme,
    htmlAppState,
    bodyAppLoading,
    htmlClasses,
    bodyClasses,

    hasFailsafeTimer: Boolean(failsafeTimer || state?.bootFailsafeTimer || coreState.bootFailsafeArmed),
    failsafeTimeoutMs: number(state?.bootFailsafeTimeoutMs || coreState.bootFailsafeTimeoutMs, 0),
    failsafeStartedAt: failsafeStarted,
    failsafeStartedAtIso: failsafeStarted ? iso(failsafeStarted) : "",
    failsafeArmId: number(state?.bootFailsafeArmId || coreState.bootFailsafeArmId, 0),

    lastShowAt,

    hasHideTimer: Boolean(hideTimer),
    hasTransitionTimer: Boolean(transitionTimer),

    sequence,
    failsafeArmId,

    lastEventKey: redact(lastEventKey),
    lastEventAt,
    lastEventAtIso: lastEventAt ? iso(lastEventAt) : "",

    lastFailsafeWarnKey: redact(lastFailsafeWarnKey),
    lastFailsafeWarnAt,
    lastFailsafeWarnAtIso: lastFailsafeWarnAt ? iso(lastFailsafeWarnAt) : "",

    lastError,

    theme: currentTheme(AppCore),
    logoUrl: defaultLogo(AppCore),
    logoWhiteUrl: WHITE_LOGO_URL,
    logoBlackUrl: BLACK_LOGO_URL,

    debugInstalled: Boolean(debugInstalled),
  });
}

function attachDebugApi(AppCore, api) {
  if (!api) return false;

  try {
    if (isBrowser()) {
      window[DEBUG_KEY] = api;
      window.__ONION_APP_LOADER__ = api;
    }
  } catch {}

  try {
    if (AppCore && typeof AppCore === "object" && Object.isExtensible(AppCore)) {
      Object.defineProperty(AppCore, "Loader", {
        value: api,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  } catch {}

  try {
    AppCore?.modules?.register?.("Loader", api, {
      aliases: ["loader", "AppLoader", "appLoader"],
      overwrite: false,
      replace: false,
      source: SOURCE,
    });
  } catch {}

  return true;
}

export function installLoaderDebugApi(AppCore = null) {
  if (debugInstalled && debugApi) {
    attachDebugApi(AppCore, debugApi);
    return debugApi;
  }

  debugApi = {
    version: LOADER_VERSION,

    show(options = {}) {
      return showLoader(AppCore, {
        reason: "debug-api",
        ...object(options),
      });
    },

    hide(options = {}) {
      return hideLoader(AppCore, {
        reason: "debug-api",
        force: true,
        allowDuringBoot: true,
        ...object(options),
      });
    },

    forceHide(options = {}) {
      return forceHideLoader(AppCore, {
        reason: "debug-api",
        ...object(options),
      });
    },

    snapshot() {
      return getLoaderSnapshot(AppCore);
    },

    getSnapshot() {
      return getLoaderSnapshot(AppCore);
    },

    getElement() {
      return getLoaderElement(AppCore);
    },

    isVisible() {
      return isLoaderVisible(AppCore);
    },

    clearFailsafe() {
      return clearBootFailsafeTimer(null, AppCore);
    },
  };

  debugInstalled = true;

  attachDebugApi(AppCore, debugApi);

  emitLoader(AppCore, EVENTS.debugApi, {
    installed: true,
  });

  return debugApi;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOADER_VERSION,

  getLoaderElement,
  isLoaderVisible,

  takeOverStaticLoader,
  prepareBootLoader,

  showLoader,
  hideLoader,
  forceHideLoader,

  restoreLoaderInlineStyles,

  clearBootFailsafeTimer,
  armBootFailsafeLoader,

  installLoaderDebugApi,

  getLoaderSnapshot,
};

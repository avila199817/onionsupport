/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   RESPONSABILIDADES:
   - resolver el loader global de la app
   - mostrar / ocultar loader de forma robusta
   - tomar control del loader estático de index.html
   - crear loader fallback si index.html no lo trae
   - restaurar estilos inline del loader
   - aplicar failsafe anti-loader infinito
   - limpiar timer de failsafe
   - evitar flicker visual
   - endurecer DOM access browser/server

   ALINEADO CON index.js:
   - respeta AppCore.state.loading
   - respeta AppCore.state.booting
   - mínimo riesgo visual en boot
   - hide idempotente total
   - show seguro aunque DOM parcial
   - snapshot útil para debug

   HARDENING EXTREMO:
   - cero throws
   - race-safe timers
   - fallback si AppCore parcial
   - SSR safe
   - no deja overlay dark pegado
   - respeta state.bootFailsafeTimer
   - failsafe no agresivo
   - warnings deduplicados

   FIX VISUAL:
   - html/body reciben clases app-booting/app-loading/app-ready
   - loader visible desde boot/refresco si existe en index.html
   - fallback loader con logo si no existe #app-loader
   - ocultación suave + limpieza final

   FIX CONSOLA:
   - no duplica warnings por AppCore.utils.warn + console.warn
   - no dispara failsafe antes de 8s
   - no marca failsafe como warning si el boot ya terminó
========================================================= */

import {
  BOOT_FAILSAFE_LOADER_MS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOADER_ID = "app-loader";
const LOADER_SELECTOR =
  "#app-loader,.app-loader,.loader,[data-app-loader='true']";

const DEFAULT_HIDE_TRANSITION_MS = 220;
const DEFAULT_MIN_VISIBLE_MS = 320;

const DEFAULT_FAILSAFE_MS = 12000;
const MIN_FAILSAFE_MS = 8000;
const FAILSAFE_WARN_DEDUPE_MS = 30000;

const BODY_LOADING_CLASSES = [
  "loading",
  "app-loading",
  "app-booting",
];

const HTML_LOADING_CLASSES = [
  "app-loading",
  "app-booting",
];

const BODY_READY_CLASSES = [
  "app-ready",
];

const HTML_READY_CLASSES = [
  "app-ready",
];

/* =========================================================
   MODULE RUNTIME
========================================================= */

let lastShowAt = 0;
let hideTimer = null;
let transitionTimer = null;
let sequence = 0;

let failsafeArmSequence = 0;
let lastFailsafeWarnKey = "";
let lastFailsafeWarnAt = 0;

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

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeWarn(
  AppCore,
  ...args
) {
  let emittedByCore = false;

  try {
    if (
      typeof AppCore?.utils?.warn === "function"
    ) {
      AppCore.utils.warn(
        "[Loader]",
        ...args
      );

      emittedByCore = true;
    }
  } catch {
    emittedByCore = false;
  }

  /*
    Evita duplicar:
    - [Onion Support] [Loader] ...
    - [Loader] ...
  */
  if (emittedByCore) {
    return;
  }

  try {
    console.warn(
      "[Loader]",
      ...args
    );
  } catch {}
}

function safeLog(
  AppCore,
  ...args
) {
  let emittedByCore = false;

  try {
    if (
      typeof AppCore?.utils?.log === "function"
    ) {
      AppCore.utils.log(
        "[Loader]",
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
    console.log(
      "[Loader]",
      ...args
    );
  } catch {}
}

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  let busAvailable = false;

  try {
    if (
      typeof AppCore?.events?.emit === "function"
    ) {
      busAvailable = true;

      AppCore.events.emit(
        eventName,
        payload
      );

      return true;
    }
  } catch {}

  try {
    if (
      !busAvailable &&
      isBrowser()
    ) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function clearTimer(id) {
  try {
    if (id) {
      clearTimeout(id);
    }
  } catch {}
}

function nextSequence() {
  sequence += 1;
  return sequence;
}

function isCurrentSequence(id) {
  return id === sequence;
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

function requestPaint() {
  return new Promise((resolve) => {
    try {
      if (
        !isBrowser()
      ) {
        if (typeof setTimeout === "function") {
          setTimeout(resolve, 0);
          return;
        }

        resolve();
        return;
      }

      if (
        typeof window.requestAnimationFrame !== "function"
      ) {
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

function safeGetState(
  AppCore
) {
  try {
    return (
      AppCore?.state || {}
    );
  } catch {
    return {};
  }
}

function safeSetLoading(
  AppCore,
  value = false
) {
  const next =
    Boolean(value);

  try {
    if (
      typeof AppCore?.setLoading ===
      "function"
    ) {
      AppCore.setLoading(next);
      return;
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state ===
        "object"
    ) {
      AppCore.state.loading =
        next;
    }
  } catch {}
}

function safeSetBooting(
  AppCore,
  value = false
) {
  const next =
    Boolean(value);

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state ===
        "object"
    ) {
      AppCore.state.booting =
        next;
    }
  } catch {}
}

/* =========================================================
   CONFIG
========================================================= */

function getLoaderConfig(AppCore) {
  const cfg = safeObject(AppCore?.config);

  return {
    logoUrl:
      safeText(
        cfg.loaderLogoUrl ||
          cfg.logoUrl ||
          cfg.logo ||
          cfg.brandLogo ||
          cfg.appLogo ||
          "/assets/logo.svg",
        "/assets/logo.svg"
      ),

    appName:
      safeText(
        cfg.appName ||
          cfg.brandName ||
          "Onion"
      ),

    text:
      safeText(
        cfg.loaderText ||
          "Cargando sesión..."
      ),

    subtext:
      safeText(
        cfg.loaderSubtext ||
          ""
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
   DOM CLASS OPS
========================================================= */

function toggleClasses(
  element,
  classNames = [],
  enabled = false
) {
  if (!element) {
    return;
  }

  try {
    for (const className of classNames) {
      element.classList.toggle(
        className,
        Boolean(enabled)
      );
    }
  } catch {}
}

function removeClasses(
  element,
  classNames = []
) {
  if (!element) {
    return;
  }

  try {
    for (const className of classNames) {
      element.classList.remove(className);
    }
  } catch {}
}

function setDocumentLoadingState(
  enabled = false
) {
  if (
    !isBrowser() ||
    !document.documentElement ||
    !document.body
  ) {
    return;
  }

  const loading =
    Boolean(enabled);

  try {
    toggleClasses(
      document.documentElement,
      HTML_LOADING_CLASSES,
      loading
    );

    toggleClasses(
      document.body,
      BODY_LOADING_CLASSES,
      loading
    );

    toggleClasses(
      document.documentElement,
      HTML_READY_CLASSES,
      !loading
    );

    toggleClasses(
      document.body,
      BODY_READY_CLASSES,
      !loading
    );

    document.documentElement.dataset.appLoading =
      loading ? "true" : "false";

    document.body.dataset.appLoading =
      loading ? "true" : "false";
  } catch {}
}

function setBodyLoading(
  enabled = false
) {
  setDocumentLoadingState(
    enabled
  );
}

/* =========================================================
   FALLBACK MARKUP
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFallbackLoaderHtml(AppCore) {
  const cfg =
    getLoaderConfig(AppCore);

  const logoUrl =
    escapeHtml(cfg.logoUrl);

  const appName =
    escapeHtml(cfg.appName);

  const text =
    escapeHtml(cfg.text);

  const subtext =
    escapeHtml(cfg.subtext);

  return `
    <div class="app-loader__backdrop" data-loader-backdrop="true"></div>

    <div class="app-loader__card" role="status" aria-live="polite">
      <div class="app-loader__brand">
        <img
          class="app-loader__logo"
          src="${logoUrl}"
          alt="${appName}"
          draggable="false"
          onerror="this.style.display='none';this.nextElementSibling.style.display='grid';"
        />

        <div
          class="app-loader__logo-fallback"
          aria-hidden="true"
          style="display:none;"
        >
          ${escapeHtml(appName.slice(0, 1).toUpperCase() || "O")}
        </div>
      </div>

      <div class="app-loader__copy">
        <strong class="app-loader__title">${appName}</strong>
        <span class="app-loader__text">${text}</span>
        ${
          subtext
            ? `<small class="app-loader__subtext">${subtext}</small>`
            : ""
        }
      </div>

      <div class="app-loader__bar" aria-hidden="true">
        <span class="app-loader__bar-fill"></span>
      </div>
    </div>
  `;
}

function injectFallbackLoaderStyles() {
  if (!isBrowser()) {
    return false;
  }

  try {
    if (
      document.getElementById(
        "app-loader-fallback-style"
      )
    ) {
      return true;
    }

    const style =
      document.createElement("style");

    style.id =
      "app-loader-fallback-style";

    style.textContent = `
      html.app-booting,
      body.app-booting {
        min-height: 100%;
      }

      body.app-booting {
        overflow: hidden;
      }

      #app-loader,
      .app-loader {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        min-height: 100dvh;
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition:
          opacity 220ms ease,
          visibility 220ms ease;
      }

      #app-loader.is-hidden,
      .app-loader.is-hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      #app-loader.is-visible,
      .app-loader.is-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .app-loader__backdrop {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 0%, rgba(99, 102, 241, .14), transparent 36%),
          linear-gradient(180deg, rgba(3, 7, 18, .96), rgba(2, 6, 23, .98));
      }

      .app-loader__card {
        position: relative;
        z-index: 1;
        width: min(360px, calc(100vw - 48px));
        display: grid;
        gap: 18px;
        justify-items: center;
        padding: 28px 26px;
        border-radius: 28px;
        border: 1px solid rgba(148, 163, 184, .18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .08), rgba(255, 255, 255, .035));
        box-shadow:
          0 26px 80px rgba(0, 0, 0, .42),
          inset 0 1px 0 rgba(255, 255, 255, .08);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        color: #f8fafc;
        text-align: center;
      }

      .app-loader__brand {
        width: 74px;
        height: 74px;
        display: grid;
        place-items: center;
        border-radius: 24px;
        background: rgba(255, 255, 255, .08);
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, .12),
          0 16px 38px rgba(0, 0, 0, .26);
        overflow: hidden;
      }

      .app-loader__logo {
        width: 52px;
        height: 52px;
        object-fit: contain;
        display: block;
      }

      .app-loader__logo-fallback {
        width: 52px;
        height: 52px;
        display: grid;
        place-items: center;
        border-radius: 18px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -.04em;
        color: #f8fafc;
        background: linear-gradient(135deg, rgba(99,102,241,.8), rgba(14,165,233,.72));
      }

      .app-loader__copy {
        display: grid;
        gap: 5px;
      }

      .app-loader__title {
        font-size: 18px;
        line-height: 1.15;
        letter-spacing: -.03em;
      }

      .app-loader__text {
        font-size: 13px;
        color: rgba(226, 232, 240, .8);
      }

      .app-loader__subtext {
        font-size: 11px;
        color: rgba(148, 163, 184, .86);
      }

      .app-loader__bar {
        width: 100%;
        height: 7px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(148, 163, 184, .18);
      }

      .app-loader__bar-fill {
        display: block;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(99,102,241,.1), rgba(99,102,241,.85), rgba(14,165,233,.78));
        animation: onion-loader-bar 1.05s ease-in-out infinite;
      }

      @keyframes onion-loader-bar {
        0% {
          transform: translateX(-105%);
        }
        100% {
          transform: translateX(255%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #app-loader,
        .app-loader,
        .app-loader__bar-fill {
          transition: none !important;
          animation: none !important;
        }
      }
    `;

    document.head?.appendChild(style);

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
    injectFallbackLoaderStyles();

    const loader =
      document.createElement("div");

    loader.id = LOADER_ID;
    loader.className = "app-loader is-visible";
    loader.dataset.appLoader = "true";
    loader.setAttribute("aria-hidden", "false");
    loader.innerHTML =
      getFallbackLoaderHtml(AppCore);

    const target =
      document.body ||
      document.documentElement;

    target.appendChild(loader);

    try {
      if (AppCore?.dom) {
        AppCore.dom.loader = loader;
      }
    } catch {}

    return loader;
  } catch {
    return null;
  }
}

/* =========================================================
   ELEMENT
========================================================= */

export function getLoaderElement(
  AppCore
) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (
      AppCore?.dom?.loader &&
      document.contains(
        AppCore.dom.loader
      )
    ) {
      return AppCore.dom.loader;
    }
  } catch {}

  try {
    const el =
      document.getElementById(
        LOADER_ID
      ) ||
      document.querySelector(
        LOADER_SELECTOR
      ) ||
      null;

    if (el && AppCore?.dom) {
      AppCore.dom.loader = el;
    }

    return el;
  } catch {
    return null;
  }
}

function ensureLoaderElement(
  AppCore
) {
  const existing =
    getLoaderElement(AppCore);

  if (existing) {
    injectFallbackLoaderStyles();
    return existing;
  }

  return createFallbackLoader(
    AppCore
  );
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
      loader.classList?.contains?.("is-hidden")
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

function restoreLoaderInlineStyles(
  AppCore
) {
  const loader =
    ensureLoaderElement(
      AppCore
    );

  if (!loader) {
    return false;
  }

  try {
    loader.hidden = false;

    loader.removeAttribute(
      "hidden"
    );

    loader.setAttribute(
      "aria-hidden",
      "false"
    );

    loader.dataset.loaderVisible =
      "true";

    loader.classList.remove(
      "is-hidden",
      "has-hidden",
      "is-leaving"
    );

    loader.classList.add(
      "is-visible",
      "is-entering"
    );

    loader.style.display =
      "";

    loader.style.opacity =
      "";

    loader.style.visibility =
      "";

    loader.style.pointerEvents =
      "";

    return true;
  } catch {
    return false;
  }
}

function markLoaderVisible(
  loader
) {
  if (!loader) {
    return false;
  }

  try {
    loader.hidden = false;
    loader.removeAttribute("hidden");

    loader.setAttribute(
      "aria-hidden",
      "false"
    );

    loader.dataset.loaderVisible =
      "true";

    loader.classList.remove(
      "is-hidden",
      "has-hidden",
      "is-leaving"
    );

    loader.classList.add(
      "is-visible"
    );

    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";

    return true;
  } catch {
    return false;
  }
}

function markLoaderLeaving(
  loader
) {
  if (!loader) {
    return false;
  }

  try {
    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.dataset.loaderVisible =
      "false";

    loader.classList.remove(
      "is-visible",
      "is-entering"
    );

    loader.classList.add(
      "is-leaving",
      "is-hidden"
    );

    loader.style.opacity =
      "0";

    loader.style.pointerEvents =
      "none";

    return true;
  } catch {
    return false;
  }
}

function markLoaderHidden(
  loader
) {
  if (!loader) {
    return false;
  }

  try {
    loader.hidden = true;

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.dataset.loaderVisible =
      "false";

    loader.classList.remove(
      "is-visible",
      "is-entering",
      "is-leaving"
    );

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    loader.style.display =
      "none";

    loader.style.opacity =
      "0";

    loader.style.visibility =
      "hidden";

    loader.style.pointerEvents =
      "none";

    return true;
  } catch {
    return false;
  }
}

function setLoaderVisible(
  loader,
  visible = true,
  AppCore = null
) {
  if (!loader) {
    return false;
  }

  const show =
    Boolean(visible);

  if (show) {
    return markLoaderVisible(
      loader
    );
  }

  const cfg =
    getLoaderConfig(AppCore);

  markLoaderLeaving(
    loader
  );

  clearTimer(transitionTimer);

  transitionTimer =
    window.setTimeout(
      () => {
        markLoaderHidden(
          loader
        );
        transitionTimer = null;
      },
      cfg.hideTransitionMs
    );

  return true;
}

/* =========================================================
   PUBLIC VISIBILITY API
========================================================= */

export function showLoader(
  AppCore,
  options = {}
) {
  if (!isBrowser()) {
    safeSetLoading(
      AppCore,
      true
    );

    return true;
  }

  const opts =
    safeObject(options);

  const id =
    nextSequence();

  clearLoaderTimers();

  const loader =
    ensureLoaderElement(
      AppCore
    );

  lastShowAt =
    now();

  setBodyLoading(true);

  if (loader) {
    restoreLoaderInlineStyles(
      AppCore
    );

    markLoaderVisible(
      loader
    );
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

  safeEmit(
    AppCore,
    "app:loader:show",
    {
      sequence: id,
      hasLoader: Boolean(loader),
      booting:
        Boolean(opts.booting),
      reason:
        safeText(opts.reason, ""),
    }
  );

  return true;
}

export function forceHideLoader(
  AppCore,
  options = {}
) {
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

  const opts =
    safeObject(options);

  const id =
    nextSequence();

  clearLoaderTimers();

  const loader =
    getLoaderElement(
      AppCore
    );

  setBodyLoading(false);

  if (loader) {
    markLoaderHidden(
      loader
    );
  }

  safeSetLoading(
    AppCore,
    false
  );

  if (opts.booting !== true) {
    safeSetBooting(
      AppCore,
      false
    );
  }

  safeEmit(
    AppCore,
    "app:loader:hide",
    {
      sequence: id,
      forced: true,
      hasLoader: Boolean(loader),
      reason:
        safeText(opts.reason, ""),
    }
  );

  return true;
}

export function hideLoader(
  AppCore,
  options = {}
) {
  if (!isBrowser()) {
    safeSetLoading(
      AppCore,
      false
    );

    return true;
  }

  const opts =
    safeObject(options);

  const cfg =
    getLoaderConfig(AppCore);

  const id =
    nextSequence();

  clearLoaderTimers();

  const loader =
    getLoaderElement(
      AppCore
    );

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

    setBodyLoading(false);

    if (loader) {
      setLoaderVisible(
        loader,
        false,
        AppCore
      );
    }

    safeSetLoading(
      AppCore,
      false
    );

    if (opts.booting !== true) {
      safeSetBooting(
        AppCore,
        false
      );
    }

    safeEmit(
      AppCore,
      "app:loader:hide",
      {
        sequence: id,
        forced: false,
        hasLoader: Boolean(loader),
        remaining,
        reason:
          safeText(opts.reason, ""),
      }
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

export function takeOverStaticLoader(
  AppCore
) {
  /*
    Úsalo al principio del boot si quieres tomar control
    del loader que viene ya pintado desde index.html.
  */

  const loader =
    ensureLoaderElement(
      AppCore
    );

  setBodyLoading(true);

  if (loader) {
    restoreLoaderInlineStyles(
      AppCore
    );

    markLoaderVisible(
      loader
    );
  }

  safeSetLoading(
    AppCore,
    true
  );

  safeSetBooting(
    AppCore,
    true
  );

  safeEmit(
    AppCore,
    "app:loader:takeover",
    {
      hasLoader: Boolean(loader),
    }
  );

  return Boolean(loader);
}

export function prepareBootLoader(
  AppCore,
  state = null
) {
  takeOverStaticLoader(
    AppCore
  );

  if (state) {
    try {
      state.loaderVisible = true;
      state.loaderShownAt = Date.now();
    } catch {}
  }

  return true;
}

/* =========================================================
   FAILSAFE TIMER
========================================================= */

export function clearBootFailsafeTimer(
  state
) {
  try {
    if (
      state?.bootFailsafeTimer
    ) {
      clearTimeout(
        state.bootFailsafeTimer
      );

      state.bootFailsafeTimer =
        null;
    }

    if (state) {
      state.bootFailsafeStartedAt = 0;
      state.bootFailsafeTimeoutMs = 0;
      state.bootFailsafeArmId = 0;
    }
  } catch {}

  return true;
}

function isBootFinalizedState(
  state = null,
  coreState = {}
) {
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
  const key = [
    phase,
    route,
    publicPath,
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

  clearBootFailsafeTimer(
    state
  );

  const timeout =
    getFailsafeTimeoutMs(
      timeoutMs
    );

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

  const timer =
    window.setTimeout(
      () => {
        try {
          if (
            state?.bootFailsafeArmId &&
            state.bootFailsafeArmId !== armId
          ) {
            return;
          }

          const coreState =
            safeGetState(
              AppCore
            );

          const loader =
            getLoaderElement(
              AppCore
            );

          const loaderVisible =
            isLoaderActuallyVisible(
              loader
            );

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

          /*
            Si ya no hay boot/loading/loader visible, no hay nada que hacer.
          */
          if (
            !stillBooting &&
            !stillLoading &&
            !loaderVisible
          ) {
            return;
          }

          /*
            Si la app ya finalizó y sólo queda una bandera o loader stale,
            limpiar silenciosamente. No es un fallo real de boot.
          */
          if (
            finalized &&
            !stillBooting
          ) {
            hideFn(
              AppCore,
              {
                reason:
                  "failsafe-stale-after-ready",
              }
            );

            safeEmit(
              AppCore,
              "app:loader:failsafe:stale",
              {
                timeout,
                booting:
                  stillBooting,
                loading:
                  stillLoading,
                loaderVisible,
                finalized,
                route,
                publicPath,
              }
            );

            return;
          }

          if (
            shouldWarnFailsafe({
              phase: "boot",
              route,
              publicPath,
            })
          ) {
            safeWarn(
              AppCore,
              "Failsafe loader aplicado.",
              {
                timeout,
                booting:
                  stillBooting,
                loading:
                  stillLoading,
                loaderVisible,
                finalized,
                route,
                publicPath,
              }
            );
          }

          hideFn(
            AppCore,
            {
              reason:
                "failsafe",
            }
          );

          safeEmit(
            AppCore,
            "app:loader:failsafe",
            {
              timeout,
              booting:
                stillBooting,
              loading:
                stillLoading,
              loaderVisible,
              finalized,
              route,
              publicPath,
            }
          );
        } catch {}
      },
      timeout
    );

  if (state) {
    state.bootFailsafeTimer =
      timer;
  }

  safeEmit(
    AppCore,
    "app:loader:failsafe:armed",
    {
      timeout,
      armId,
    }
  );

  return timer;
}

/* =========================================================
   LEGACY COMPAT
========================================================= */

export {
  restoreLoaderInlineStyles,
};

/* =========================================================
   DEBUG
========================================================= */

export function getLoaderSnapshot(
  AppCore,
  state = null
) {
  const loader =
    getLoaderElement(
      AppCore
    );

  const coreState =
    safeGetState(
      AppCore
    );

  let bodyClasses = [];
  let htmlClasses = [];

  try {
    bodyClasses =
      Array.from(
        document.body?.classList || []
      );
  } catch {}

  try {
    htmlClasses =
      Array.from(
        document.documentElement?.classList || []
      );
  } catch {}

  return {
    exists:
      Boolean(loader),

    id:
      safeText(loader?.id, ""),

    hidden:
      Boolean(
        loader?.hidden
      ),

    ariaHidden:
      safeText(
        loader?.getAttribute?.("aria-hidden"),
        ""
      ),

    visible:
      isLoaderActuallyVisible(
        loader
      ),

    datasetVisible:
      safeText(
        loader?.dataset?.loaderVisible,
        ""
      ),

    display:
      safeText(
        loader?.style?.display,
        ""
      ),

    opacity:
      safeText(
        loader?.style?.opacity,
        ""
      ),

    visibility:
      safeText(
        loader?.style?.visibility,
        ""
      ),

    loading:
      Boolean(
        coreState.loading
      ),

    booting:
      Boolean(
        coreState.booting
      ),

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

    route:
      coreState.route ||
      "/",

    publicPath:
      coreState.publicPath ||
      "/",

    bodyClasses,
    htmlClasses,

    hasFailsafeTimer:
      Boolean(
        state?.bootFailsafeTimer ||
          coreState.bootFailsafeTimer
      ),

    failsafeTimeoutMs:
      safeNumber(
        state?.bootFailsafeTimeoutMs,
        0
      ),

    failsafeStartedAt:
      safeNumber(
        state?.bootFailsafeStartedAt,
        0
      ),

    failsafeArmId:
      safeNumber(
        state?.bootFailsafeArmId,
        0
      ),

    lastShowAt,

    hasHideTimer:
      Boolean(hideTimer),

    hasTransitionTimer:
      Boolean(transitionTimer),

    sequence,

    failsafeArmSequence,
    lastFailsafeWarnKey,
    lastFailsafeWarnAt,
  };
}

export default {
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

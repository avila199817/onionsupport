/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   APP LOADER · SIMPLE
   - controla #app-loader
   - crea fallback mínimo sólo si falta
   - show / hide / forceHide
   - failsafe anti-loader infinito
   - sin Auth, Router, guards, render, history, fetch, storage ni Toast
   - sin CSS runtime ni innerHTML
========================================================= */

import {
  APP_EVENTS,
  APP_RUNTIME_KEYS,
  BOOT_FAILSAFE_LOADER_MS,
  BOOT_MIN_LOADER_VISIBLE_MS,
  BOOT_HIDE_TRANSITION_MS,
} from "./constants.js";

export const LOADER_VERSION = "21.0.0-simple";

const SOURCE = "app.loader";
const LOADER_ID = "app-loader";
const LOADER_SELECTOR = "#app-loader,.app-loader,[data-app-loader='true'],[data-app-loader]";
const DEBUG_KEY = APP_RUNTIME_KEYS?.loader || "__ONION_APP_LOADER__";

const STATES = Object.freeze({
  booting: "booting",
  visible: "visible",
  leaving: "leaving",
  hidden: "hidden",
  fatal: "fatal",
});

const EVENTS = Object.freeze({
  show: APP_EVENTS?.bootLoaderShow || "app:boot:loader:show",
  hide: APP_EVENTS?.bootLoaderHide || "app:boot:loader:hide",
  hideSkipped: "app:boot:loader:hide-skipped",
  forceHide: APP_EVENTS?.bootLoaderForceHide || "app:boot:loader:force-hide",
  fallbackCreated: "app:loader:fallback:created",
  failsafeArmed: "app:loader:failsafe:armed",
  failsafe: "app:loader:failsafe",
  failsafeStale: "app:loader:failsafe:stale",
  debugApi: "app:loader:debug-api",
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

const DEFAULT_HIDE_TRANSITION_MS = Math.max(0, number(BOOT_HIDE_TRANSITION_MS, 220));
const DEFAULT_MIN_VISIBLE_MS = Math.max(0, number(BOOT_MIN_LOADER_VISIBLE_MS, 300));
const DEFAULT_FAILSAFE_MS = 12000;
const MIN_FAILSAFE_MS = 8000;
const MAX_FAILSAFE_MS = 120000;
const EVENT_DEDUPE_MS = 80;

const TOKEN_RE = /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|otpToken|otp_token|authorization|jwt|session|sid)=)([^&#\s]+)/gi;
const SENSITIVE_KEY_RE = /token|secret|password|authorization|credential|jwt|bearer|session|refresh|otp|mfa|2fa|code/i;

let sequence = 0;
let lastShowAt = 0;
let hideTimer = null;
let transitionTimer = null;
let failsafeTimer = null;
let failsafeArmId = 0;
let lastEventKey = "";
let lastEventAt = 0;
let lastError = null;
let debugApi = null;
let debugInstalled = false;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";

function object(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function array(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
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
  try { return Date.now(); } catch { return 0; }
}

function perf() {
  try {
    return typeof performance !== "undefined" && isFn(performance.now) ? performance.now() : epoch();
  } catch {
    return epoch();
  }
}

function iso(ms = epoch()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function clamp(value, fallback, min, max) {
  return Math.max(min, Math.min(max, number(value, fallback)));
}

function nextSeq() {
  sequence += 1;
  return sequence;
}

function isCurrentSeq(id) {
  return id === sequence;
}

function clearTimer(id) {
  try { if (id) clearTimeout(id); } catch {}
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
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    } catch {
      try { window.setTimeout(resolve, 0); } catch { resolve(); }
    }
  });
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redact(value = "") {
  return text(value, "")
    .replace(TOKEN_RE, "$1***")
    .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (SENSITIVE_KEY_RE.test(text(keyHint, ""))) return value ? "***" : value;
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || value.response?.status || null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

function eventKey(eventName = "", payload = {}) {
  return [
    text(eventName, ""),
    text(payload?.reason, ""),
    text(payload?.loaderState || payload?.state, ""),
    payload?.forced ? "forced" : "normal",
    payload?.fatal ? "fatal" : "ok",
  ].join("|");
}

function shouldDedupe(eventName = "", payload = {}, force = false) {
  if (force) return false;

  const key = eventKey(eventName, payload);
  const current = epoch();

  if (key === lastEventKey && current - lastEventAt < EVENT_DEDUPE_MS) return true;

  lastEventKey = key;
  lastEventAt = current;
  return false;
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;
  if (options.dedupe !== false && shouldDedupe(name, payload, options.force === true)) return false;

  const detail = sanitize({ version: LOADER_VERSION, source: SOURCE, at: iso(), ...object(payload) });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function emitLoader(AppCore, eventName = "", payload = {}, aliases = [], options = {}) {
  let emitted = emit(AppCore, eventName, payload, options);

  for (const alias of array(aliases)) {
    if (alias && alias !== eventName) emitted = emit(AppCore, alias, payload, { ...object(options), dedupe: false }) || emitted;
  }

  return emitted;
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[Loader]", ...args.map((item) => sanitize(item)));
  } catch {
    try { if (AppCore?.config?.debug) console.warn("[Loader]", ...args.map((item) => sanitize(item))); } catch {}
  }
}

function recordError(AppCore, source = "loader", error = null) {
  lastError = { source, error: sanitize(error), at: iso() };
  warn(AppCore, "Loader error", lastError);
  return lastError;
}

/* =========================================================
   CORE STATE
========================================================= */

function getState(AppCore) {
  return object(AppCore?.state);
}

function setCoreState(AppCore, patch = {}, options = {}) {
  const data = object(patch);
  if (!Object.keys(data).length) return false;

  try {
    AppCore?.setState?.(data, {
      source: SOURCE,
      emit: options.emit === true,
      emitState: options.emitState === true,
      silent: options.silent !== false,
    });
    return true;
  } catch {}

  try {
    AppCore?.patchState?.(data, {
      source: SOURCE,
      emit: options.emit === true,
      silent: options.silent !== false,
    });
    return true;
  } catch {}

  try {
    if (AppCore?.state && typeof AppCore.state === "object") {
      Object.assign(AppCore.state, data);
      return true;
    }
  } catch {}

  return false;
}

function setLoading(AppCore, value = false) {
  const next = Boolean(value);

  try { AppCore?.setLoading?.(next); } catch {}
  setCoreState(AppCore, { loading: next });

  return true;
}

function setBooting(AppCore, value = false) {
  const next = Boolean(value);
  setCoreState(AppCore, { booting: next, appBooting: next });
  return true;
}

function setDomRef(AppCore, key = "", value = null) {
  if (!key) return false;

  try {
    if (!AppCore.dom && AppCore && typeof AppCore === "object" && Object.isExtensible(AppCore)) AppCore.dom = {};
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
  try { return document.getElementById(id); } catch { return null; }
}

function qs(selector = "") {
  if (!isBrowser() || !selector) return null;
  try { return document.querySelector(selector); } catch { return null; }
}

function contains(element) {
  try { return Boolean(element && document.contains(element)); } catch { return false; }
}

function attr(element, name, value) {
  if (!element || !name) return false;

  try {
    if (value === null || value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function data(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
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

function createEl(tagName = "div", { id = "", className = "", textContent = "", attrs = {}, dataset = {} } = {}) {
  const element = document.createElement(tagName);

  if (id) element.id = id;
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;

  for (const [key, value] of Object.entries(object(attrs))) attr(element, key, value);
  for (const [key, value] of Object.entries(object(dataset))) data(element, key, value);

  return element;
}

function clearInlineOverrides(loader) {
  if (!loader) return false;

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

/* =========================================================
   LOADER ELEMENT
========================================================= */

function loaderConfig(AppCore) {
  const cfg = object(AppCore?.config);

  return {
    appName: text(cfg.appName || cfg.brandName || "Onion Support", "Onion Support"),
    text: text(cfg.loaderText || "Cargando sesión...", "Cargando sesión..."),
    subtext: text(cfg.loaderSubtext || "Preparando panel", "Preparando panel"),
    minVisibleMs: Math.max(0, number(cfg.loaderMinVisibleMs, DEFAULT_MIN_VISIBLE_MS)),
    hideTransitionMs: Math.max(0, number(cfg.loaderHideTransitionMs, DEFAULT_HIDE_TRANSITION_MS)),
    createIfMissing: cfg.loaderCreateIfMissing !== false,
  };
}

function syncExistingLoader(AppCore, loader) {
  if (!loader) return false;

  const cfg = loaderConfig(AppCore);

  try {
    if (!loader.id) loader.id = LOADER_ID;

    data(loader, "appLoader", "true");
    if (!loader.getAttribute("role")) attr(loader, "role", "status");
    if (!loader.getAttribute("aria-live")) attr(loader, "aria-live", "polite");

    const title = loader.querySelector?.(".app-loader__title,[data-loader-title='true']");
    const body = loader.querySelector?.(".app-loader__text,[data-loader-text='true']");
    const subtext = loader.querySelector?.(".app-loader__subtext,[data-loader-subtext='true']");

    if (title && !text(title.textContent, "")) title.textContent = cfg.appName;
    if (body && !text(body.textContent, "")) body.textContent = cfg.text;
    if (subtext && !text(subtext.textContent, "")) subtext.textContent = cfg.subtext;

    setDomRef(AppCore, "loader", loader);
    setDomRef(AppCore, "appLoader", loader);

    return true;
  } catch (error) {
    recordError(AppCore, "sync-existing-loader", error);
    return false;
  }
}

function createFallbackLoader(AppCore) {
  if (!isBrowser()) return null;

  const cfg = loaderConfig(AppCore);
  if (!cfg.createIfMissing) return null;

  try {
    const loader = createEl("div", {
      id: LOADER_ID,
      className: "app-loader is-visible",
      attrs: { role: "status", "aria-live": "polite", "aria-busy": "true", "aria-hidden": "false" },
      dataset: { appLoader: "true", loaderGenerated: "true", loaderVisible: "true", loaderState: STATES.booting },
    });

    const card = createEl("div", { className: "app-loader__card", dataset: { loaderCard: "true" } });
    const brand = createEl("div", { className: "app-loader__brand", textContent: cfg.appName.slice(0, 1).toUpperCase() || "O", attrs: { "aria-hidden": "true" } });
    const copy = createEl("div", { className: "app-loader__copy" });

    copy.appendChild(createEl("strong", { className: "app-loader__title", textContent: cfg.appName, dataset: { loaderTitle: "true" } }));
    copy.appendChild(createEl("span", { className: "app-loader__text", textContent: cfg.text, dataset: { loaderText: "true" } }));
    if (cfg.subtext) copy.appendChild(createEl("small", { className: "app-loader__subtext", textContent: cfg.subtext, dataset: { loaderSubtext: "true" } }));

    card.appendChild(brand);
    card.appendChild(copy);
    loader.appendChild(card);

    (document.body || document.documentElement).appendChild(loader);

    setDomRef(AppCore, "loader", loader);
    setDomRef(AppCore, "appLoader", loader);

    emitLoader(AppCore, EVENTS.fallbackCreated, { generated: true, hasLoader: true });
    return loader;
  } catch (error) {
    recordError(AppCore, "create-fallback-loader", error);
    return null;
  }
}

export function getLoaderElement(AppCore) {
  if (!isBrowser()) return null;

  try {
    if (AppCore?.dom?.loader && contains(AppCore.dom.loader)) return AppCore.dom.loader;
  } catch {}

  const loader = byId(LOADER_ID) || qs(LOADER_SELECTOR);

  if (loader) {
    syncExistingLoader(AppCore, loader);
    return loader;
  }

  return null;
}

function ensureLoaderElement(AppCore) {
  return getLoaderElement(AppCore) || createFallbackLoader(AppCore);
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function setDocumentLoading(enabled = false, { booting = false, fatal = false } = {}) {
  if (!isBrowser()) return false;

  const loading = Boolean(enabled);
  const isBooting = Boolean(booting && loading);
  const isFatal = Boolean(fatal);

  for (const root of [document.documentElement, document.body]) {
    if (!root) continue;

    removeClasses(root, root === document.body ? BODY_LOADING_CLASSES : HTML_LOADING_CLASSES);
    toggleClasses(root, FATAL_CLASSES, isFatal);
    toggleClasses(root, READY_CLASSES, !loading && !isFatal);

    if (loading) {
      addClasses(root, ["app-loading"]);
      if (isBooting) addClasses(root, ["app-booting"]);
    }

    data(root, "appLoading", loading ? "true" : "false");
    data(root, "shellState", loading ? (isBooting ? "booting" : "loading") : isFatal ? "fatal" : "ready");

    if (root === document.documentElement) data(root, "appState", loading ? (isBooting ? "booting" : "loading") : isFatal ? "fatal" : "ready");
  }

  return true;
}

function setShellLoading(enabled = false, { booting = false, fatal = false } = {}) {
  if (!isBrowser()) return false;

  const state = enabled ? (booting ? "booting" : "loading") : fatal ? "fatal" : "ready";

  for (const id of ["app-shell", "main-content", "app-content", "view-container"]) {
    const element = byId(id);
    if (!element) continue;

    try {
      element.hidden = false;
      attr(element, "aria-busy", enabled ? "true" : "false");
      attr(element, "aria-hidden", "false");
      data(element, "shellState", state);
      if (id === "app-shell") data(element, "shell", state);
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
    if (loader.classList.contains("is-hidden") || loader.classList.contains("has-hidden") || loader.classList.contains("loader-hidden")) return false;
    if (loader.getAttribute("aria-hidden") === "true") return false;
    if (loader.dataset?.loaderVisible === "false") return false;
    if ([STATES.hidden, "removed"].includes(loader.dataset?.loaderState)) return false;

    const style = window.getComputedStyle?.(loader);
    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;

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
    data(loader, "loaderVisible", "true");
    data(loader, "loaderState", state || STATES.visible);
    removeClasses(loader, [...LOADER_HIDDEN_CLASSES, ...LOADER_LEAVING_CLASSES]);
    addClasses(loader, LOADER_VISIBLE_CLASSES);
    clearInlineOverrides(loader);
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
    data(loader, "loaderVisible", "false");
    data(loader, "loaderState", STATES.leaving);
    removeClasses(loader, [...LOADER_VISIBLE_CLASSES, ...LOADER_ENTERING_CLASSES, "has-hidden"]);
    addClasses(loader, ["is-leaving", "is-hidden"]);
    clearInlineOverrides(loader);
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
    data(loader, "loaderVisible", "false");
    data(loader, "loaderState", state || STATES.hidden);
    removeClasses(loader, [...LOADER_VISIBLE_CLASSES, ...LOADER_ENTERING_CLASSES, ...LOADER_LEAVING_CLASSES]);
    addClasses(loader, LOADER_HIDDEN_CLASSES);
    clearInlineOverrides(loader);
    return true;
  } catch {
    return false;
  }
}

function hideWithTransition(AppCore, loader, state, seq) {
  if (!loader) return false;

  const cfg = loaderConfig(AppCore);
  markLeaving(loader);

  clearTimer(transitionTimer);
  transitionTimer = window.setTimeout(() => {
    if (isCurrentSeq(seq)) markHidden(loader, state);
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
  return Boolean(state?.booted || state?.readyEmitted || coreState.booted || coreState.ready || coreState.appReady || coreState.appBooted);
}

function bootActive(AppCore, state = null) {
  const coreState = getState(AppCore);
  if (bootFinalized(state, coreState)) return false;
  return Boolean(state?.booting || coreState.booting || coreState.appBooting || coreState.bootInProgress || hasBootClass());
}

function allowHideDuringBoot(options = {}) {
  const reason = text(options.reason, "").toLowerCase();

  return Boolean(
    options.force === true ||
      options.forceHide === true ||
      options.finalize === true ||
      options.allowDuringBoot === true ||
      options.failsafe === true ||
      ["finalize-boot", "boot-complete", "app-ready", "failsafe", "boot-error", "app-boot-error", "app-destroy", "reboot-reset"].includes(reason)
  );
}

/* =========================================================
   PUBLIC API
========================================================= */

export function showLoader(AppCore, options = {}) {
  const opts = object(options);

  if (!isBrowser()) {
    setLoading(AppCore, true);
    if (opts.booting === true) setBooting(AppCore, true);
    return true;
  }

  const seq = nextSeq();
  clearUiTimers();

  const loader = ensureLoaderElement(AppCore);
  const state = opts.booting === true ? STATES.booting : STATES.visible;

  lastShowAt = perf();

  setAppLoading(true, { booting: opts.booting === true, fatal: false });
  if (loader) markVisible(loader, state);

  setLoading(AppCore, true);
  if (opts.booting === true) setBooting(AppCore, true);

  setCoreState(AppCore, { loaderVisible: true, loaderState: state, loaderShownAt: epoch() });

  emitLoader(
    AppCore,
    EVENTS.show,
    { sequence: seq, hasLoader: Boolean(loader), booting: Boolean(opts.booting), reason: text(opts.reason, ""), loaderState: state },
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

  const seq = nextSeq();
  clearUiTimers();
  clearBootFailsafeTimer(opts.state || null, AppCore);

  const loader = getLoaderElement(AppCore);
  const state = opts.fatal ? STATES.fatal : STATES.hidden;

  setAppLoading(false, { fatal: Boolean(opts.fatal) });
  if (loader) markHidden(loader, state);

  setLoading(AppCore, false);
  setBooting(AppCore, false);
  setCoreState(AppCore, { loaderVisible: false, loaderState: state, loaderHiddenAt: epoch() });

  emitLoader(
    AppCore,
    EVENTS.forceHide,
    { sequence: seq, forced: true, hasLoader: Boolean(loader), fatal: Boolean(opts.fatal), reason: text(opts.reason, ""), loaderState: state },
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
    emitLoader(AppCore, EVENTS.hideSkipped, { reason: text(opts.reason, "boot-active"), bootActive: true });
    return false;
  }

  const cfg = loaderConfig(AppCore);
  const seq = nextSeq();
  clearUiTimers();

  const minVisibleMs = Math.max(0, number(opts.minVisibleMs, cfg.minVisibleMs));
  const elapsed = lastShowAt ? Math.max(0, perf() - lastShowAt) : minVisibleMs;
  const remaining = Math.max(0, minVisibleMs - elapsed);

  const run = async () => {
    if (!isCurrentSeq(seq)) return false;
    await afterPaint();
    if (!isCurrentSeq(seq)) return false;

    const loader = getLoaderElement(AppCore);
    const state = opts.fatal ? STATES.fatal : STATES.hidden;

    setAppLoading(false, { fatal: Boolean(opts.fatal) });

    if (loader) {
      if (opts.fatal) markHidden(loader, state);
      else hideWithTransition(AppCore, loader, state, seq);
    }

    setLoading(AppCore, false);
    setBooting(AppCore, false);
    setCoreState(AppCore, { loaderVisible: false, loaderState: state, loaderHiddenAt: epoch() });
    clearBootFailsafeTimer(opts.state || null, AppCore);

    emitLoader(
      AppCore,
      EVENTS.hide,
      { sequence: seq, forced: false, hasLoader: Boolean(loader), remaining, fatal: Boolean(opts.fatal), reason: text(opts.reason, ""), loaderState: state },
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
  setAppLoading(true, { booting: true, fatal: false });
  if (loader) markVisible(loader, STATES.booting);

  setLoading(AppCore, true);
  setBooting(AppCore, true);
  setCoreState(AppCore, { loaderVisible: true, loaderState: STATES.booting, loaderShownAt: epoch() });

  installLoaderDebugApi(AppCore);
  emitLoader(AppCore, "app:loader:takeover", { hasLoader: Boolean(loader), loaderState: STATES.booting });

  return Boolean(loader);
}

export function prepareBootLoader(AppCore, state = null) {
  const ok = takeOverStaticLoader(AppCore);

  try {
    if (state) {
      state.loaderVisible = true;
      state.loaderShownAt = epoch();
      state.booting = true;
    }
  } catch {}

  return ok;
}

/* =========================================================
   FAILSAFE
========================================================= */

function failsafeTimeout(value = null) {
  return clamp(value ?? BOOT_FAILSAFE_LOADER_MS, DEFAULT_FAILSAFE_MS, MIN_FAILSAFE_MS, MAX_FAILSAFE_MS);
}

export function clearBootFailsafeTimer(state = null, AppCore = null) {
  clearTimer(failsafeTimer);
  failsafeTimer = null;

  try {
    if (state?.bootFailsafeTimer) clearTimeout(state.bootFailsafeTimer);
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

export function armBootFailsafeLoader({ AppCore, state, hideLoader: hideFn = forceHideLoader, timeoutMs = null } = {}) {
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
      const coreState = getState(AppCore);
      const loader = getLoaderElement(AppCore);
      const loaderVisible = isLoaderActuallyVisible(loader);
      const stillBooting = Boolean(state?.booting || coreState.booting || coreState.appBooting);
      const stillLoading = Boolean(state?.loaderVisible || coreState.loading || coreState.loaderVisible);
      const finalized = bootFinalized(state, coreState);

      if (!stillBooting && !stillLoading && !loaderVisible) {
        emitLoader(AppCore, EVENTS.failsafeStale, { timeout, armId, reason: "already-idle" });
        clearBootFailsafeTimer(state, AppCore);
        return;
      }

      hideFn(AppCore, { reason: finalized ? "failsafe-stale-after-ready" : "failsafe", state, force: true, failsafe: true });
      emitLoader(AppCore, finalized ? EVENTS.failsafeStale : EVENTS.failsafe, { timeout, armId, booting: stillBooting, loading: stillLoading, loaderVisible, finalized }, [], { force: true });
      clearBootFailsafeTimer(state, AppCore);
    } catch (error) {
      recordError(AppCore, "boot-failsafe", error);
    }
  }, timeout);

  try {
    if (state) state.bootFailsafeTimer = failsafeTimer;
  } catch {}

  emitLoader(AppCore, EVENTS.failsafeArmed, { timeout, armId });
  return failsafeTimer;
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

function classList(element) {
  try { return Array.from(element?.classList || []); } catch { return []; }
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
    };
  } catch {
    return {};
  }
}

function elementSnapshot(element) {
  if (!element) return { exists: false };

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
      shellState: element.dataset?.shellState,
      routeMode: element.dataset?.routeMode,
    }),
    classList: classList(element),
    computedStyle: computed(element),
  };
}

export function getLoaderSnapshot(AppCore, state = null) {
  const loader = getLoaderElement(AppCore);
  const coreState = getState(AppCore);
  const route = coreState.route || state?.route || "/";
  const publicPath = coreState.publicPath || state?.publicPath || "/";

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
    computedStyle: computed(loader),
    loading: Boolean(coreState.loading),
    booting: Boolean(coreState.booting || coreState.appBooting),
    ready: Boolean(coreState.ready || coreState.appReady),
    bootActive: bootActive(AppCore, state),
    route: redact(route),
    publicPath: redact(publicPath),
    loader: elementSnapshot(loader),
    shell: elementSnapshot(byId("app-shell")),
    main: elementSnapshot(byId("main-content")),
    view: elementSnapshot(byId("view-container")),
    hasFailsafeTimer: Boolean(failsafeTimer || state?.bootFailsafeTimer || coreState.bootFailsafeArmed),
    sequence,
    failsafeArmId,
    lastShowAt,
    hasHideTimer: Boolean(hideTimer),
    hasTransitionTimer: Boolean(transitionTimer),
    lastError,
    debugInstalled,
    policy: {
      loaderOnly: true,
      ownAuth: false,
      ownRouter: false,
      ownRender: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
    },
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
      Object.defineProperty(AppCore, "Loader", { value: api, configurable: true, enumerable: false, writable: true });
    }
  } catch {}

  try {
    AppCore?.modules?.register?.("Loader", api, { aliases: ["loader", "AppLoader", "appLoader"], overwrite: false, replace: false, source: SOURCE });
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
    show: (options = {}) => showLoader(AppCore, { reason: "debug-api", ...object(options) }),
    hide: (options = {}) => hideLoader(AppCore, { reason: "debug-api", force: true, allowDuringBoot: true, ...object(options) }),
    forceHide: (options = {}) => forceHideLoader(AppCore, { reason: "debug-api", ...object(options) }),
    snapshot: () => getLoaderSnapshot(AppCore),
    getSnapshot: () => getLoaderSnapshot(AppCore),
    getElement: () => getLoaderElement(AppCore),
    isVisible: () => isLoaderVisible(AppCore),
    clearFailsafe: () => clearBootFailsafeTimer(null, AppCore),
  };

  debugInstalled = true;
  attachDebugApi(AppCore, debugApi);
  emitLoader(AppCore, EVENTS.debugApi, { installed: true });

  return debugApi;
}

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

/* =========================================================
   Onion SPA - Router Shell
   Archivo: src/router/shell.js

   ROUTER SHELL · SIMPLE
   - chrome/layout del Router
   - limpia slots dinámicos seguros
   - aplica title, menú activo y modo auth/app
   - sin Auth, guards, render de vistas, history, storage, Toast ni navegación
========================================================= */

import {
  normalizeCanonicalPath,
  resolveSpaHref,
} from "./helpers.js";

export const ROUTER_SHELL_VERSION = "21.0.0-simple";

const SOURCE = "router.shell";
const EVENT_DEDUPE_MS = 64;

const AUTH_PATHS = new Set([
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/auth/login",
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
  "/reset-password",
  "/reset-password/confirm",
  "/reset-password-confirm",
  "/forgot-password",
  "/recover-password",
  "/recover",
  "/password-reset",
  "/password-reset/confirm",
  "/password-reset-confirm",
  "/confirm-reset-password",
  "/2fa",
  "/otp",
  "/mfa",
]);

const AUTH_PREFIXES = Object.freeze([
  "/activate-account/",
  "/activate/",
  "/activation/",
  "/account/activate/",
  "/activate/first-user/",
  "/reset-password/confirm/",
  "/password-reset/confirm/",
  "/2fa/",
  "/otp/",
  "/mfa/",
]);

const BOOT_CLASSES = Object.freeze(["app-booting", "app-loading", "loading"]);
const AUTH_CLASSES = Object.freeze(["auth-screen", "route-auth", "route-shell-hidden", "route-chrome-hidden", "shell-hidden"]);
const APP_CLASSES = Object.freeze(["route-app", "route-shell-visible", "route-chrome-visible", "shell-visible"]);
const SIDEBAR_CLASSES = Object.freeze(["sidebar-open", "sidebar-collapsed", "sidebar-mobile-open", "has-sidebar-open"]);

const ACTIVE_LINK_CLASSES = Object.freeze(["active", "is-active", "router-active", "sidebar-link--active", "menu-item--active"]);
const ACTIVE_PARENT_CLASSES = Object.freeze(["active", "is-active", "router-active"]);

const MENU_SELECTOR = [
  "a[data-spa]",
  "a[href][data-route]",
  "a[href][data-nav-route]",
  "a[href][data-menu-route]",
  "[data-spa][href]",
  "[data-route]",
  "[data-nav-route]",
  "[data-menu-route]",
  "[data-sidebar-route]",
].join(",");

const DYNAMIC_SELECTOR = [
  "[data-router-dynamic]",
  "[data-dynamic-slot]",
  "[data-tablehead-dynamic]",
  "[data-route-dynamic]",
].join(",");

const PROTECTED_CLEAR_SELECTOR = [
  "#app-shell",
  "#main-content",
  "#app-content",
  "#view-container",
  "#app-loader",
  "#sidebar-mount",
  "#topbar-mount",
  "#app-sidebar",
  "#app-topbar",
  "#sidebar",
  "#topbar",
  ".sidebar",
  ".topbar",
  "[data-app-shell]",
  "[data-main-content]",
  "[data-app-content]",
  "[data-view-root]",
  "[data-router-view]",
  "[data-app-loader]",
  "[data-sidebar-root]",
  "[data-topbar-root]",
  "[data-sidebar-mount]",
  "[data-topbar-mount]",
].join(",");

const SENSITIVE_TEXT_RE = /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|temporaryToken|temporary_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|otpToken|otp_token)=)([^&#\s]+)/gi;

let lastEventKey = "";
let lastEventAt = 0;
let lastActiveMenuKey = "";
let lastActiveMenuAt = 0;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nowMs() {
  try { return Date.now(); } catch { return 0; }
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((item) => safeText(item, "")).filter(Boolean))];
}

function redactText(value = "") {
  return safeText(value, "")
    .replace(SENSITIVE_TEXT_RE, "$1***")
    .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function sanitizePayload(value, depth = 0, seen = new WeakSet(), keyHint = "") {
  if (depth > 4) return "[depth-limit]";
  if (/token|authorization|password|secret|credential|jwt|bearer|otp|totp|mfa|2fa|code/i.test(keyHint)) return value ? "***" : value;
  if (typeof value === "string") return redactText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizePayload(item, depth + 1, seen, keyHint));

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitizePayload(item, depth + 1, seen, key)])
    );
  }

  return String(value);
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitizePayload({
    source: SOURCE,
    version: ROUTER_SHELL_VERSION,
    ...safeObject(payload),
  });

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

function emitDeduped(AppCore, eventName = "", payload = {}, ms = EVENT_DEDUPE_MS) {
  const key = [eventName, payload?.route, payload?.canonicalPath, payload?.publicPath, payload?.mode, payload?.chromeHidden]
    .map((item) => safeText(item, ""))
    .join("|");
  const current = nowMs();

  if (key === lastEventKey && current - lastEventAt < ms) return false;

  lastEventKey = key;
  lastEventAt = current;

  return emit(AppCore, eventName, payload);
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[RouterShell]", ...args.map((item) => sanitizePayload(item)));
  } catch {
    try {
      if (AppCore?.config?.debug) console.warn("[RouterShell]", ...args.map((item) => sanitizePayload(item)));
    } catch {}
  }
}

/* =========================================================
   DOM CORE
========================================================= */

function ensureDom(AppCore) {
  try {
    if (AppCore && !AppCore.dom) AppCore.dom = {};
    return AppCore?.dom || null;
  } catch {
    return null;
  }
}

function isConnected(node) {
  if (!node || !isBrowser()) return false;

  try {
    return Boolean(node.isConnected || document.contains(node));
  } catch {
    return false;
  }
}

function queryOne(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    if (selector.startsWith("#") && !/[ ,[:]/.test(selector)) return document.getElementById(selector.slice(1));
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function queryAll(selector = "") {
  if (!isBrowser() || !selector) return [];

  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function resolveElement(AppCore, keys = [], selectors = []) {
  if (!isBrowser()) return null;

  const dom = ensureDom(AppCore);
  const keyList = Array.isArray(keys) ? keys : [keys];

  for (const key of keyList) {
    const cached = dom?.[key];
    if (cached && isConnected(cached)) return cached;
  }

  for (const selector of selectors) {
    const found = queryOne(selector);
    if (!found) continue;

    try {
      if (dom && keyList[0]) dom[keyList[0]] = found;
    } catch {}

    return found;
  }

  return null;
}

function setHidden(element, hidden = false) {
  if (!element) return false;

  const next = Boolean(hidden);

  try { element.hidden = next; } catch {}
  try { element.setAttribute("aria-hidden", next ? "true" : "false"); } catch {}

  return true;
}

function setBusy(element, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setAttribute(element, name, value) {
  if (!element || !name) return false;

  try {
    if (value === null || value === undefined || value === "") element.removeAttribute(name);
    else element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function addClasses(element, ...classes) {
  if (!element) return false;

  const clean = unique(classes);
  if (!clean.length) return false;

  try {
    element.classList.add(...clean);
    return true;
  } catch {
    return false;
  }
}

function removeClasses(element, ...classes) {
  if (!element) return false;

  const clean = unique(classes);
  if (!clean.length) return false;

  try {
    element.classList.remove(...clean);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className, active = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(active));
    return true;
  } catch {
    return false;
  }
}

function emptyElement(element) {
  if (!element) return false;

  try {
    element.replaceChildren();
    return true;
  } catch {}

  try {
    while (element.firstChild) element.removeChild(element.firstChild);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATH HELPERS
========================================================= */

function stripSearchHash(path = "/") {
  return safeText(path, "/").split("#")[0].split("?")[0] || "/";
}

function normalizePathname(path = "/") {
  let value = safeText(stripSearchHash(path), "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/@[^/]+(?=\/|$)/i, "");

  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";

  return value || "/";
}

function canonicalPath(AppCore, path = "/") {
  try {
    return normalizePathname(normalizeCanonicalPath(AppCore, path || "/"));
  } catch {
    return normalizePathname(path || "/");
  }
}

function routePath(route = null) {
  return safeText(route?.canonicalPath || route?.path || route?.routePath, "");
}

function isAuthPath(path = "/") {
  const clean = normalizePathname(path);
  return AUTH_PATHS.has(clean) || AUTH_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

function routeHidesChrome(route = null) {
  const meta = safeObject(route?.meta);
  const path = routePath(route);

  if (path && isAuthPath(path)) return true;

  return Boolean(
    route?.hideShell === true ||
      route?.shell === false ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.layout === "public" ||
      meta.hideShell === true ||
      meta.shell === false ||
      meta.showShell === false ||
      meta.layout === "auth" ||
      meta.layout === "public"
  );
}

function routeIsAuthScreen(route = null) {
  const meta = safeObject(route?.meta);
  return Boolean(routeHidesChrome(route) || route?.authScreen === true || meta.authScreen === true || route?.layout === "auth" || meta.layout === "auth");
}

function isUnsafeHref(href = "") {
  const raw = safeText(href, "");
  return Boolean(raw && (/[\r\n\t]/.test(raw) || /^(javascript:|data:|vbscript:)/i.test(raw)));
}

function isHashOnlyHref(href = "") {
  const raw = safeText(href, "");
  return raw.startsWith("#") && !raw.startsWith("#/") && !raw.startsWith("#!");
}

function isExternalHref(href = "") {
  const raw = safeText(href, "");

  if (!raw) return false;
  if (/^(mailto:|tel:)/i.test(raw)) return true;
  if (raw.startsWith("//")) return true;

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw, window.location.origin).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  return false;
}

function resolveHref(AppCore, href = "") {
  const raw = safeText(href, "");
  if (!raw || isUnsafeHref(raw) || isHashOnlyHref(raw) || isExternalHref(raw)) return "";

  try {
    return resolveSpaHref(AppCore, raw) || "";
  } catch {
    return raw;
  }
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,
      shell: null,
      main: null,
      appContent: null,
      viewContainer: null,
      sidebarMount: null,
      topbarMount: null,
      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      mobileToggle: null,
      loader: null,
    };
  }

  const dom = ensureDom(AppCore);
  const html = document.documentElement || null;
  const body = document.body || null;

  const shell = resolveElement(AppCore, ["shell", "appShell", "layout"], ["#app-shell", "[data-app-shell]", ".app-shell", ".layout"]);
  const main = resolveElement(AppCore, ["main", "mainContent"], ["#main-content", "[data-main-content]", ".main-content", "main[role='main']", "main"]);
  const appContent = resolveElement(AppCore, ["appContent", "content"], ["#app-content", "[data-app-content]"]);
  const viewContainer = resolveElement(AppCore, ["viewContainer", "routerView", "view"], ["#view-container", "[data-view-root]", "[data-router-view]"]);
  const sidebarMount = resolveElement(AppCore, ["sidebarMount"], ["#sidebar-mount", "[data-sidebar-mount]"]);
  const topbarMount = resolveElement(AppCore, ["topbarMount"], ["#topbar-mount", "[data-topbar-mount]"]);
  const sidebar = resolveElement(AppCore, ["sidebar", "sidebarRoot"], ["#app-sidebar", "#sidebar", ".sidebar", "[data-sidebar-root]", "[data-sidebar]"]);
  const topbar = resolveElement(AppCore, ["topbar", "topbarRoot"], ["#app-topbar", "#topbar", ".topbar", "[data-topbar-root]", "[data-topbar]"]);
  const tablehead = resolveElement(AppCore, ["tablehead", "tableHead"], ["#table-head", ".table-head", "[data-tablehead]"]);
  const tableheadContainer = resolveElement(AppCore, ["tableheadContainer", "tableHeadContainer"], ["#tablehead-container", "[data-tablehead-container]"]);
  const mobileToggle = resolveElement(AppCore, ["sidebarMobileToggle", "mobileToggle"], ["#toggleSidebarMobile", "[data-sidebar-mobile-toggle]", "[data-mobile-sidebar-toggle]"]);
  const loader = resolveElement(AppCore, ["loader", "appLoader"], ["#app-loader", ".app-loader", "[data-app-loader]"]);

  try {
    if (dom) {
      Object.assign(dom, {
        html,
        body,
        shell,
        appShell: shell,
        layout: shell,
        main,
        mainContent: main,
        appContent,
        viewContainer,
        routerView: viewContainer,
        sidebarMount,
        topbarMount,
        sidebar,
        topbar,
        tablehead,
        tableHead: tablehead,
        tableheadContainer,
        tableHeadContainer: tableheadContainer,
        sidebarMobileToggle: mobileToggle,
        mobileToggle,
        loader,
        appLoader: loader,
      });
    }
  } catch {}

  return { html, body, shell, main, appContent, viewContainer, sidebarMount, topbarMount, sidebar, topbar, tablehead, tableheadContainer, mobileToggle, loader };
}

/* =========================================================
   CLEAR DYNAMIC
========================================================= */

function isProtectedClearNode(node) {
  if (!node) return true;

  try { if (node.matches?.(PROTECTED_CLEAR_SELECTOR)) return true; } catch {}
  try { if (node.closest?.(PROTECTED_CLEAR_SELECTOR)) return true; } catch {}

  return false;
}

function clearSafeNode(node) {
  if (!node || isProtectedClearNode(node)) return false;
  return emptyElement(node);
}

export function clearDynamicContainers(AppCore) {
  if (!isBrowser()) return false;

  let changed = false;

  try {
    const { tablehead, tableheadContainer } = getShellElements(AppCore);

    if (tableheadContainer) changed = emptyElement(tableheadContainer) || changed;

    if (tablehead) {
      setHidden(tablehead, true);
      setBusy(tablehead, false);
      setDataset(tablehead, "tableheadState", "empty");
      changed = true;
    }

    for (const node of queryAll(DYNAMIC_SELECTOR)) changed = clearSafeNode(node) || changed;

    emit(AppCore, "router:shell:dynamic-cleared", { changed });
    return changed;
  } catch (error) {
    warn(AppCore, "clearDynamicContainers() falló", error);
    return false;
  }
}

/* =========================================================
   DOCUMENT TITLE
========================================================= */

function normalizeTitle(title = "", appName = "Onion Support") {
  const cleanAppName = safeText(appName, "Onion Support");
  const cleanTitle = safeText(title, cleanAppName).replace(/\s+/g, " ").slice(0, 140);

  if (!cleanTitle || cleanTitle === cleanAppName) return { cleanTitle: cleanAppName, finalTitle: cleanAppName };
  return { cleanTitle, finalTitle: `${cleanTitle} · ${cleanAppName}` };
}

export function setDocumentTitle(AppCore, title = "") {
  const appName = safeText(AppCore?.config?.appName, "Onion Support");
  const { cleanTitle, finalTitle } = normalizeTitle(title, appName);

  try {
    if (isFn(AppCore?.setDocumentTitle)) {
      AppCore.setDocumentTitle(cleanTitle, { finalTitle, source: SOURCE });
      return true;
    }
  } catch (error) {
    warn(AppCore, "AppCore.setDocumentTitle() falló", error);
  }

  if (!isBrowser()) return false;

  try {
    document.title = finalTitle;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function getMenuLinks() {
  return queryAll(MENU_SELECTOR);
}

function getLinkCandidate(link) {
  if (!link) return "";

  for (const attr of ["data-canonical-path", "data-route-path", "data-route", "data-nav-route", "data-menu-route", "data-sidebar-route", "href"]) {
    try {
      const value = link.getAttribute?.(attr);
      if (safeText(value, "")) return value;
    } catch {}
  }

  return "";
}

function getLinkCanonical(AppCore, link) {
  const candidate = getLinkCandidate(link);
  if (!candidate) return "";

  const resolved = resolveHref(AppCore, candidate);
  if (!resolved) return "";

  return canonicalPath(AppCore, resolved);
}

function getActiveParent(link) {
  if (!link) return null;

  try {
    return link.closest?.("[data-menu-item], [data-sidebar-item], .sidebar-menu-item, .menu-item, .nav-item, li") || null;
  } catch {
    return null;
  }
}

function setActiveClasses(element, active = false, classes = []) {
  if (!element) return false;

  for (const className of classes) toggleClass(element, className, active);
  setDataset(element, "active", active ? "true" : "false");

  return true;
}

function clearActiveState(link) {
  if (!link) return false;

  setActiveClasses(link, false, ACTIVE_LINK_CLASSES);
  setAttribute(link, "aria-current", "");

  const parent = getActiveParent(link);
  if (parent && parent !== link) setActiveClasses(parent, false, ACTIVE_PARENT_CLASSES);

  return true;
}

function applyActiveState(link) {
  if (!link) return false;

  setActiveClasses(link, true, ACTIVE_LINK_CLASSES);
  setAttribute(link, "aria-current", "page");

  const parent = getActiveParent(link);
  if (parent && parent !== link) setActiveClasses(parent, true, ACTIVE_PARENT_CLASSES);

  return true;
}

export function setActiveMenu(AppCore, pathname = "/") {
  if (!isBrowser()) return false;

  const currentCanonical = canonicalPath(AppCore, pathname || "/");
  const links = getMenuLinks();
  let activeCount = 0;

  for (const link of links) clearActiveState(link);

  for (const link of links) {
    const linkCanonical = getLinkCanonical(AppCore, link);
    if (!linkCanonical || linkCanonical !== currentCanonical) continue;

    applyActiveState(link);
    activeCount += 1;
  }

  const key = `${currentCanonical}|${links.length}|${activeCount}`;
  const current = nowMs();

  if (key !== lastActiveMenuKey || current - lastActiveMenuAt > EVENT_DEDUPE_MS) {
    lastActiveMenuKey = key;
    lastActiveMenuAt = current;
    emit(AppCore, "router:shell:active-menu", { canonicalPath: currentCanonical, count: links.length, activeCount });
  }

  return true;
}

/* =========================================================
   SHELL MODE
========================================================= */

function hasContent(element) {
  if (!element) return false;

  try { if (element.childElementCount > 0) return true; } catch {}
  try { return Boolean(safeText(element.textContent, "")); } catch { return false; }
}

function exposeCoreLayout(elements) {
  for (const element of [elements.shell, elements.main, elements.appContent, elements.viewContainer]) {
    setHidden(element, false);
    setBusy(element, false);
    setAttribute(element, "aria-hidden", "false");
  }
}

function applyRootState({ html, body, shell, chromeHidden = false, authScreen = false, mode = "app", route = "", canonicalPath: currentCanonical = "" }) {
  for (const root of [html, body]) {
    removeClasses(root, ...BOOT_CLASSES);
    addClasses(root, "app-ready");

    toggleClass(root, "route-auth", chromeHidden);
    toggleClass(root, "route-shell-hidden", chromeHidden);
    toggleClass(root, "route-chrome-hidden", chromeHidden);
    toggleClass(root, "shell-hidden", chromeHidden);
    toggleClass(root, "route-app", !chromeHidden);
    toggleClass(root, "route-shell-visible", !chromeHidden);
    toggleClass(root, "route-chrome-visible", !chromeHidden);
    toggleClass(root, "shell-visible", !chromeHidden);
    toggleClass(root, "auth-screen", authScreen);

    setDataset(root, "shell", "visible");
    setDataset(root, "chrome", chromeHidden ? "hidden" : "visible");
    setDataset(root, "routeMode", mode);
    setDataset(root, "authScreen", authScreen ? "true" : "false");
    setDataset(root, "currentRoute", route);
    setDataset(root, "currentCanonicalPath", currentCanonical || route);
    setDataset(root, "appLoading", "false");
  }

  if (body && chromeHidden) removeClasses(body, ...SIDEBAR_CLASSES);
  if (body && !chromeHidden) {
    removeClasses(body, ...AUTH_CLASSES, "login-no-scroll");
    addClasses(body, ...APP_CLASSES);
  }

  setDataset(shell, "shell", "visible");
  setDataset(shell, "chrome", chromeHidden ? "hidden" : "visible");
  setDataset(shell, "routeMode", mode);
  setDataset(shell, "currentRoute", route);
  setDataset(shell, "currentCanonicalPath", currentCanonical || route);
}

function applyChrome(elements, chromeHidden = false) {
  for (const element of [elements.sidebarMount, elements.topbarMount, elements.sidebar, elements.topbar, elements.mobileToggle]) {
    setHidden(element, chromeHidden);
    setBusy(element, false);
  }

  if (elements.mobileToggle && chromeHidden) setAttribute(elements.mobileToggle, "aria-expanded", "false");

  const tableheadVisible = !chromeHidden && hasContent(elements.tableheadContainer);

  setHidden(elements.tablehead, !tableheadVisible);
  setHidden(elements.tableheadContainer, chromeHidden || !tableheadVisible);
  setBusy(elements.tablehead, false);
  setBusy(elements.tableheadContainer, false);
}

function syncShellState(AppCore, { chromeHidden = false, authScreen = false, mode = "app", route = "", canonicalPath: currentCanonical = "" } = {}) {
  const patch = {
    appShellVisible: true,
    shellVisible: !chromeHidden,
    shellHidden: chromeHidden,
    routeShellHidden: chromeHidden,
    chromeVisible: !chromeHidden,
    chromeHidden,
    authScreen,
    routeMode: mode,
    currentShellRoute: route || null,
    currentShellCanonicalPath: currentCanonical || route || null,
  };

  try {
    AppCore?.setState?.(patch, { source: SOURCE, emit: false, silent: true });
  } catch {
    try { if (AppCore?.state) Object.assign(AppCore.state, patch); } catch {}
  }

  try {
    AppCore?.setShellVisibility?.(!chromeHidden, { source: SOURCE, mode, route });
  } catch {}

  return patch;
}

export function setShellMode(AppCore, route = null) {
  const path = routePath(route);
  const currentCanonical = path ? canonicalPath(AppCore, path) : "";
  const chromeHidden = routeHidesChrome(route);
  const authScreen = routeIsAuthScreen(route);
  const mode = chromeHidden ? "auth" : "app";
  const elements = getShellElements(AppCore);

  exposeCoreLayout(elements);
  applyChrome(elements, chromeHidden);
  applyRootState({ ...elements, chromeHidden, authScreen, mode, route: path, canonicalPath: currentCanonical });

  const statePatch = syncShellState(AppCore, { chromeHidden, authScreen, mode, route: path, canonicalPath: currentCanonical });

  emitDeduped(AppCore, "router:shell:change", {
    route: path,
    canonicalPath: currentCanonical,
    chromeHidden,
    authScreen,
    mode,
    hasShell: Boolean(elements.shell),
    hasMain: Boolean(elements.main),
    hasAppContent: Boolean(elements.appContent),
    hasViewContainer: Boolean(elements.viewContainer),
    hasSidebar: Boolean(elements.sidebar || elements.sidebarMount),
    hasTopbar: Boolean(elements.topbar || elements.topbarMount),
    hasTablehead: Boolean(elements.tablehead),
    state: statePatch,
  });

  return {
    hidden: chromeHidden,
    visible: !chromeHidden,
    chromeHidden,
    chromeVisible: !chromeHidden,
    authScreen,
    mode,
    route: path || null,
    canonicalPath: currentCanonical || null,
  };
}

/* =========================================================
   DEBUG
========================================================= */

function elementSnapshot(element) {
  if (!element) return { exists: false };

  return {
    exists: true,
    id: element.id || "",
    tag: element.tagName?.toLowerCase?.() || "",
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    ariaBusy: element.getAttribute?.("aria-busy") || "",
    className: safeText(element.className?.baseVal || element.className, ""),
    dataset: {
      shell: element.dataset?.shell || null,
      chrome: element.dataset?.chrome || null,
      routeMode: element.dataset?.routeMode || null,
      currentRoute: redactText(element.dataset?.currentRoute || ""),
      currentCanonicalPath: redactText(element.dataset?.currentCanonicalPath || ""),
      active: element.dataset?.active || null,
    },
  };
}

export function getShellSnapshot(AppCore) {
  const elements = getShellElements(AppCore);

  return {
    version: ROUTER_SHELL_VERSION,
    source: SOURCE,
    route: redactText(AppCore?.state?.route || ""),
    canonicalPath: redactText(AppCore?.state?.canonicalPath || AppCore?.state?.route || ""),
    publicPath: redactText(AppCore?.state?.publicPath || ""),
    shellVisible: AppCore?.state?.shellVisible ?? null,
    shellHidden: AppCore?.state?.shellHidden ?? AppCore?.state?.routeShellHidden ?? null,
    routeShellHidden: AppCore?.state?.routeShellHidden ?? null,
    chromeVisible: AppCore?.state?.chromeVisible ?? null,
    chromeHidden: AppCore?.state?.chromeHidden ?? null,
    authScreen: AppCore?.state?.authScreen ?? null,
    routeMode: AppCore?.state?.routeMode || null,
    lastEventKey: redactText(lastEventKey),
    lastEventAt,
    lastActiveMenuKey: redactText(lastActiveMenuKey),
    lastActiveMenuAt,
    dom: {
      bodyClasses: elements.body?.className || "",
      htmlClasses: elements.html?.className || "",
      html: elementSnapshot(elements.html),
      body: elementSnapshot(elements.body),
      shell: elementSnapshot(elements.shell),
      main: elementSnapshot(elements.main),
      appContent: elementSnapshot(elements.appContent),
      viewContainer: elementSnapshot(elements.viewContainer),
      sidebarMount: elementSnapshot(elements.sidebarMount),
      topbarMount: elementSnapshot(elements.topbarMount),
      sidebar: elementSnapshot(elements.sidebar),
      topbar: elementSnapshot(elements.topbar),
      tablehead: elementSnapshot(elements.tablehead),
      tableheadContainer: elementSnapshot(elements.tableheadContainer),
      mobileToggle: elementSnapshot(elements.mobileToggle),
      loader: elementSnapshot(elements.loader),
    },
    policy: {
      ownAuth: false,
      ownGuards: false,
      ownRender: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
      shellOnly: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_SHELL_VERSION,

  getShellElements,

  clearDynamicContainers,
  setDocumentTitle,
  setActiveMenu,
  setShellMode,

  getShellSnapshot,
};

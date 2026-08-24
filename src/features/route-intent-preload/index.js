/* =========================================================
   Onion Support - Route Intent Preload

   Adelanta únicamente la vista que el usuario parece dispuesto a abrir.
   Usa la caché/single-flight de router/routes.js; no crea otra caché de vistas.
   Sin fetch propio, storage, Auth ni persistencia de URLs.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as Routes from "../../router/routes.js";

export const ROUTE_INTENT_PRELOAD_VERSION =
  "route-intent-preload.v2-strong-intent-gates";

const LINK_SELECTOR =
  "a[data-spa], a[data-route], a[href^='/'], [data-router-link]";
const ROUTE_COMMITTED_SELECTOR =
  "[data-route-host='true'][data-route-host-state='ready']:not([hidden])";
const HOVER_DWELL_MS = 64;

const metrics = {
  intents: 0,
  started: 0,
  completed: 0,
  skippedLoaded: 0,
  skippedLoading: 0,
  skippedConnection: 0,
  skippedHidden: 0,
  skippedActive: 0,
  skippedGuard: 0,
  skippedTouch: 0,
  unresolved: 0,
  lastViewKey: null,
  lastSource: null,
};

let installed = false;
let hoverTimer = 0;
let hoverAnchor = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

export function normalizeIntentPath(value = "/") {
  let path = cleanText(value, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "") || "/";
  return path || "/";
}

export function shouldPrefetchForConnection(connection = null) {
  if (!connection || typeof connection !== "object") return true;
  if (connection.saveData === true) return false;

  const effectiveType = cleanText(connection.effectiveType, "").toLowerCase();
  return effectiveType !== "slow-2g" && effectiveType !== "2g";
}

export function shouldPrefetchForDocument(visibilityState = "visible") {
  return cleanText(visibilityState, "visible").toLowerCase() === "visible";
}

export function shouldUsePointerIntent(pointerType = "", source = "pointerdown") {
  const type = cleanText(pointerType, "").toLowerCase();
  const intentSource = cleanText(source, "pointerdown").toLowerCase();

  if (type === "touch") return false;
  if (intentSource === "hover-dwell") return !type || type === "mouse";
  return !type || type === "mouse" || type === "pen";
}

function connectionAllowsPrefetch() {
  if (!isBrowser()) return false;
  return shouldPrefetchForConnection(navigator?.connection || null);
}

function documentAllowsPrefetch() {
  if (!isBrowser()) return false;
  return shouldPrefetchForDocument(document.visibilityState || "visible");
}

function hasModifierKey(event = null) {
  return Boolean(
    event?.metaKey ||
    event?.ctrlKey ||
    event?.shiftKey ||
    event?.altKey
  );
}

function closestIntentLink(target = null) {
  try {
    return target?.closest?.(LINK_SELECTOR) || null;
  } catch {
    return null;
  }
}

function rawHrefFromLink(link = null) {
  return cleanText(
    link?.dataset?.route ||
    link?.dataset?.href ||
    link?.dataset?.to ||
    link?.getAttribute?.("data-route") ||
    link?.getAttribute?.("data-href") ||
    link?.getAttribute?.("data-to") ||
    link?.getAttribute?.("href") ||
    link?.href ||
    "",
    ""
  );
}

function pathFromLink(link = null) {
  if (!isBrowser() || !link) return "";

  try {
    if (link.hasAttribute?.("download")) return "";

    const target = cleanText(link.getAttribute?.("target"), "").toLowerCase();
    if (target && target !== "_self") return "";

    const href = rawHrefFromLink(link);
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("//") ||
      /[\r\n\t\\]/.test(href)
    ) {
      return "";
    }

    if (
      /^[a-z][a-z0-9+.-]*:/i.test(href) &&
      !/^https?:\/\//i.test(href)
    ) {
      return "";
    }

    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return "";

    return normalizeIntentPath(url.pathname || "/");
  } catch {
    return "";
  }
}

function router() {
  try {
    return AppCore.getModule?.("router") || AppCore.router || AppCore.Router || null;
  } catch {
    return null;
  }
}

function routeForPath(path = "/") {
  const cleanPath = normalizeIntentPath(path);
  const activeRouter = router();

  try {
    const routed = activeRouter?.getRouteMatch?.(cleanPath)?.route;
    if (routed) return routed;
  } catch {
    // fallback a la tabla canónica
  }

  try {
    return Routes.getRouteByPath?.(cleanPath) || null;
  } catch {
    return null;
  }
}

function activeViewKey() {
  if (!isBrowser()) return "";

  try {
    const host = document.querySelector(ROUTE_COMMITTED_SELECTOR);
    return cleanText(host?.dataset?.viewKey, "");
  } catch {
    return "";
  }
}

function routeAllowedForRuntime(route = null) {
  if (!route) return false;

  let current = null;

  try {
    current = AppCore.runtimeState?.read?.() || null;
  } catch {
    current = null;
  }

  const authenticated =
    current?.authenticated === true ||
    (!current && AppCore.isAuthenticated?.() === true);

  const role = cleanText(
    current?.role ||
    (!current ? AppCore.getCurrentRole?.() : ""),
    ""
  ).toLowerCase();

  if (route.public === true) {
    return !(route.guestOnly === true && authenticated);
  }

  if (!authenticated) return false;

  if (
    (route.adminOnly === true || route.requiresAdmin === true) &&
    role !== "admin"
  ) {
    return false;
  }

  return true;
}

export async function preloadIntentPath(path = "/", source = "intent") {
  if (!documentAllowsPrefetch()) {
    metrics.skippedHidden += 1;
    return false;
  }

  if (!connectionAllowsPrefetch()) {
    metrics.skippedConnection += 1;
    return false;
  }

  const route = routeForPath(path);
  const viewKey = cleanText(route?.viewKey, "");

  metrics.intents += 1;
  metrics.lastSource = cleanText(source, "intent");
  metrics.lastViewKey = viewKey || null;

  if (!viewKey) {
    metrics.unresolved += 1;
    return false;
  }

  if (!routeAllowedForRuntime(route)) {
    metrics.skippedGuard += 1;
    return false;
  }

  if (viewKey === activeViewKey()) {
    metrics.skippedActive += 1;
    return true;
  }

  if (Routes.isRouteViewLoaded?.(viewKey) === true) {
    metrics.skippedLoaded += 1;
    return true;
  }

  if (Routes.isRouteViewLoading?.(viewKey) === true) {
    metrics.skippedLoading += 1;
    return true;
  }

  metrics.started += 1;

  try {
    const view = await Routes.preloadRouteView?.(viewKey);
    if (view) metrics.completed += 1;
    return Boolean(view);
  } catch {
    return false;
  }
}

function triggerFromLink(link = null, source = "intent") {
  const path = pathFromLink(link);
  if (!path) return false;

  void preloadIntentPath(path, source);
  return true;
}

function clearHoverIntent() {
  if (hoverTimer && isBrowser()) {
    window.clearTimeout(hoverTimer);
  }
  hoverTimer = 0;
  hoverAnchor = null;
}

function onPointerOver(event) {
  if (!shouldUsePointerIntent(event?.pointerType, "hover-dwell")) {
    metrics.skippedTouch += event?.pointerType === "touch" ? 1 : 0;
    return;
  }

  const anchor = closestIntentLink(event?.target);
  if (!anchor || anchor === hoverAnchor) return;

  clearHoverIntent();
  hoverAnchor = anchor;
  hoverTimer = window.setTimeout(() => {
    const target = hoverAnchor;
    hoverTimer = 0;
    hoverAnchor = null;

    if (!documentAllowsPrefetch()) {
      metrics.skippedHidden += 1;
      return;
    }

    triggerFromLink(target, "hover-dwell");
  }, HOVER_DWELL_MS);
}

function onPointerOut(event) {
  if (!hoverAnchor) return;

  const from = closestIntentLink(event?.target);
  if (from !== hoverAnchor) return;

  const to = event?.relatedTarget;
  if (to && hoverAnchor.contains?.(to)) return;
  clearHoverIntent();
}

function onFocusIn(event) {
  if (!documentAllowsPrefetch()) {
    metrics.skippedHidden += 1;
    return;
  }

  triggerFromLink(closestIntentLink(event?.target), "focus");
}

function onPointerDown(event) {
  if (event?.button !== undefined && event.button !== 0) return;
  if (hasModifierKey(event)) return;

  if (!shouldUsePointerIntent(event?.pointerType, "pointerdown")) {
    metrics.skippedTouch += event?.pointerType === "touch" ? 1 : 0;
    return;
  }

  if (!documentAllowsPrefetch()) {
    metrics.skippedHidden += 1;
    return;
  }

  triggerFromLink(closestIntentLink(event?.target), "pointerdown");
}

export function initRouteIntentPreload() {
  if (!isBrowser()) return false;
  if (installed) return true;

  installed = true;
  document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true });
  document.addEventListener("pointerout", onPointerOut, { capture: true, passive: true });
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });

  try {
    AppCore.registerModule?.("routeIntentPreload", RouteIntentPreload, { overwrite: true });
  } catch {
    // noop
  }

  return true;
}

export function destroyRouteIntentPreload() {
  if (!isBrowser() || !installed) return false;

  clearHoverIntent();
  document.removeEventListener("pointerover", onPointerOver, true);
  document.removeEventListener("pointerout", onPointerOut, true);
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("pointerdown", onPointerDown, true);
  installed = false;
  return true;
}

export function getRouteIntentPreloadSnapshot() {
  return Object.freeze({
    version: ROUTE_INTENT_PRELOAD_VERSION,
    installed,
    ...metrics,
    policy: Object.freeze({
      sameOriginOnly: true,
      strongIntentOnly: true,
      hoverDwellMs: HOVER_DWELL_MS,
      saveDataAware: true,
      slow2gAware: true,
      documentVisibleOnly: true,
      modifierAware: true,
      touchPointerdown: false,
      activeRouteSkip: true,
      routerResolution: true,
      liveGuardAware: true,
      authCache: false,
      clickCapture: false,
      routerCacheAuthority: true,
      storesRawUrls: false,
      externalNetwork: false,
      storage: false,
    }),
  });
}

export const RouteIntentPreload = Object.freeze({
  version: ROUTE_INTENT_PRELOAD_VERSION,
  init: initRouteIntentPreload,
  destroy: destroyRouteIntentPreload,
  preloadPath: preloadIntentPath,
  getSnapshot: getRouteIntentPreloadSnapshot,
});

if (isBrowser()) initRouteIntentPreload();

export default RouteIntentPreload;

/* =========================================================
   Onion Support - Route Intent Preload

   Adelanta únicamente la vista que el usuario parece dispuesto a abrir.
   Usa la caché/single-flight de router/routes.js; no crea otra caché de vistas.
   Sin fetch propio, storage, Auth ni persistencia de URLs.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as Routes from "../../router/routes.js";

export const ROUTE_INTENT_PRELOAD_VERSION =
  "route-intent-preload.v1-confidence-gated";

const LINK_SELECTOR = "a[data-spa], a[data-route]";
const HOVER_DWELL_MS = 64;

const metrics = {
  intents: 0,
  started: 0,
  completed: 0,
  skippedLoaded: 0,
  skippedLoading: 0,
  skippedConnection: 0,
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

function isFunction(value) {
  return typeof value === "function";
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

function connectionAllowsPrefetch() {
  if (!isBrowser()) return false;
  return shouldPrefetchForConnection(navigator?.connection || null);
}

function closestIntentLink(target = null) {
  try {
    return target?.closest?.(LINK_SELECTOR) || null;
  } catch {
    return null;
  }
}

function pathFromAnchor(anchor = null) {
  if (!isBrowser() || !anchor) return "";

  try {
    if (anchor.hasAttribute?.("download")) return "";

    const target = cleanText(anchor.getAttribute?.("target"), "").toLowerCase();
    if (target && target !== "_self") return "";

    const href = anchor.getAttribute?.("href") || anchor.href || "";
    if (!href || href.startsWith("#")) return "";

    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return "";

    return normalizeIntentPath(url.pathname || "/");
  } catch {
    return "";
  }
}

function routeForPath(path = "/") {
  try {
    return Routes.getRouteByPath?.(normalizeIntentPath(path)) || null;
  } catch {
    return null;
  }
}

export async function preloadIntentPath(path = "/", source = "intent") {
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

function triggerFromAnchor(anchor = null, source = "intent") {
  const path = pathFromAnchor(anchor);
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
  const anchor = closestIntentLink(event?.target);
  if (!anchor || anchor === hoverAnchor) return;

  clearHoverIntent();
  hoverAnchor = anchor;
  hoverTimer = window.setTimeout(() => {
    const target = hoverAnchor;
    hoverTimer = 0;
    hoverAnchor = null;
    triggerFromAnchor(target, "hover-dwell");
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
  triggerFromAnchor(closestIntentLink(event?.target), "focus");
}

function onPointerDown(event) {
  if (event?.button !== undefined && event.button !== 0) return;
  triggerFromAnchor(closestIntentLink(event?.target), "pointerdown");
}

function onClickCapture(event) {
  if (event?.defaultPrevented) return;
  if (event?.button !== undefined && event.button !== 0) return;
  triggerFromAnchor(closestIntentLink(event?.target), "click-capture");
}

export function initRouteIntentPreload() {
  if (!isBrowser()) return false;
  if (installed) return true;

  installed = true;
  document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true });
  document.addEventListener("pointerout", onPointerOut, { capture: true, passive: true });
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  document.addEventListener("click", onClickCapture, true);

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
  document.removeEventListener("click", onClickCapture, true);
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

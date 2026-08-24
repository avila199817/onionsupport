/* =========================================================
   Onion Support - Runtime Performance

   Telemetría local y acotada del critical rendering path.
   No envía datos, no persiste URLs, no usa storage ni identifica usuarios.
========================================================= */

import { AppCore } from "../../core/index.js";

export const RUNTIME_PERFORMANCE_VERSION =
  "runtime-performance.v1-navigation-rendering";

const MAX_SAMPLES = 64;
const ROUTE_HOST_SELECTOR = ".route-view-host, [data-route-host='true']";
const NAV_LINK_SELECTOR = "a[data-spa], a[data-route]";
const NAVIGATION_TIMEOUT_MS = 10000;

const samples = {
  longTasks: [],
  interactions: [],
  intentToCommit: [],
  commitToPaint: [],
};

const state = {
  installed: false,
  routeCommits: 0,
  pendingNavigationAt: null,
  pendingNavigationSource: null,
  cls: 0,
  lcp: null,
  firstPaint: null,
  firstContentfulPaint: null,
  navigation: null,
};

const observers = [];
let routeObserver = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function now() {
  try {
    return Number(performance.now()) || 0;
  } catch {
    return 0;
  }
}

function pushSample(name, value) {
  const list = samples[name];
  const numeric = Number(value);
  if (!Array.isArray(list) || !Number.isFinite(numeric) || numeric < 0) return false;

  list.push(numeric);
  if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
  return true;
}

function percentile(values = [], fraction = 0.95) {
  if (!Array.isArray(values) || !values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Number(sorted[index].toFixed(2));
}

function summarize(values = []) {
  if (!Array.isArray(values) || !values.length) {
    return Object.freeze({ count: 0, p50: 0, p95: 0, max: 0 });
  }

  return Object.freeze({
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Number(Math.max(...values).toFixed(2)),
  });
}

function safeDuration(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Number(numeric.toFixed(2)) : null;
}

function captureBufferedNavigation() {
  if (!isBrowser()) return false;

  try {
    const navigation = performance.getEntriesByType?.("navigation")?.[0];
    if (navigation) {
      state.navigation = Object.freeze({
        ttfb: safeDuration(navigation.responseStart),
        domContentLoaded: safeDuration(navigation.domContentLoadedEventEnd),
        load: safeDuration(navigation.loadEventEnd),
      });
    }

    for (const entry of performance.getEntriesByType?.("paint") || []) {
      if (entry.name === "first-paint") state.firstPaint = safeDuration(entry.startTime);
      if (entry.name === "first-contentful-paint") {
        state.firstContentfulPaint = safeDuration(entry.startTime);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function installPerformanceObserver(type, callback, options = {}) {
  if (!isBrowser() || typeof PerformanceObserver !== "function") return false;

  try {
    const supported = PerformanceObserver.supportedEntryTypes;
    if (Array.isArray(supported) && !supported.includes(type)) return false;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) callback(entry);
    });

    observer.observe({ type, ...options });
    observers.push(observer);
    return true;
  } catch {
    return false;
  }
}

function installWebVitalObservers() {
  installPerformanceObserver("longtask", (entry) => {
    pushSample("longTasks", entry.duration);
  }, { buffered: true });

  installPerformanceObserver("event", (entry) => {
    if (Number(entry.duration) >= 40) {
      pushSample("interactions", entry.duration);
    }
  }, { buffered: true, durationThreshold: 40 });

  installPerformanceObserver("layout-shift", (entry) => {
    if (entry.hadRecentInput !== true) {
      state.cls = Number((state.cls + Number(entry.value || 0)).toFixed(4));
    }
  }, { buffered: true });

  installPerformanceObserver("largest-contentful-paint", (entry) => {
    state.lcp = safeDuration(entry.startTime);
  }, { buffered: true });

  installPerformanceObserver("paint", (entry) => {
    if (entry.name === "first-paint") state.firstPaint = safeDuration(entry.startTime);
    if (entry.name === "first-contentful-paint") state.firstContentfulPaint = safeDuration(entry.startTime);
  }, { buffered: true });
}

function routeObservationRoot() {
  if (!isBrowser()) return null;
  return (
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body ||
    null
  );
}

function nodeIsRouteHost(node = null) {
  return Boolean(
    node?.nodeType === 1 &&
    isFunction(node.matches) &&
    node.matches(ROUTE_HOST_SELECTOR)
  );
}

function mutationHasRouteHost(mutation = null) {
  if (mutation?.type !== "childList") return false;
  return [...mutation.addedNodes].some(nodeIsRouteHost);
}

function scheduleCommitPaint(commitAt) {
  if (!isBrowser()) return;

  const raf = isFunction(window.requestAnimationFrame)
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(() => callback(now()), 16);

  raf(() => {
    raf(() => {
      pushSample("commitToPaint", Math.max(0, now() - commitAt));
    });
  });
}

function recordRouteCommit() {
  const commitAt = now();
  state.routeCommits += 1;

  if (
    Number.isFinite(state.pendingNavigationAt) &&
    commitAt >= state.pendingNavigationAt &&
    commitAt - state.pendingNavigationAt <= NAVIGATION_TIMEOUT_MS
  ) {
    pushSample("intentToCommit", commitAt - state.pendingNavigationAt);
  }

  state.pendingNavigationAt = null;
  state.pendingNavigationSource = null;
  scheduleCommitPaint(commitAt);
}

function installRouteObserver() {
  if (!isBrowser() || typeof MutationObserver !== "function" || routeObserver) {
    return Boolean(routeObserver);
  }

  const root = routeObservationRoot();
  if (!root) return false;

  routeObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutationHasRouteHost)) recordRouteCommit();
  });

  routeObserver.observe(root, { childList: true, subtree: false });
  return true;
}

function closestNavLink(target = null) {
  try {
    return target?.closest?.(NAV_LINK_SELECTOR) || null;
  } catch {
    return null;
  }
}

function beginNavigationIntent(source = "navigation") {
  state.pendingNavigationAt = now();
  state.pendingNavigationSource = String(source || "navigation");
}

function onClick(event) {
  if (event?.defaultPrevented) return;
  if (event?.button !== undefined && event.button !== 0) return;
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return;
  if (!closestNavLink(event?.target)) return;
  beginNavigationIntent("click");
}

function onPopState() {
  beginNavigationIntent("popstate");
}

export function initRuntimePerformance() {
  if (!isBrowser()) return false;
  if (state.installed) return true;

  state.installed = true;
  captureBufferedNavigation();
  installWebVitalObservers();
  installRouteObserver();

  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", onPopState, { passive: true });

  try {
    AppCore.registerModule?.("runtimePerformance", RuntimePerformance, { overwrite: true });
  } catch {
    // noop
  }

  return true;
}

export function destroyRuntimePerformance() {
  if (!isBrowser() || !state.installed) return false;

  document.removeEventListener("click", onClick, true);
  window.removeEventListener("popstate", onPopState);

  routeObserver?.disconnect?.();
  routeObserver = null;

  for (const observer of observers.splice(0)) {
    try { observer.disconnect?.(); } catch {}
  }

  state.installed = false;
  return true;
}

export function getRuntimePerformanceSnapshot() {
  return Object.freeze({
    version: RUNTIME_PERFORMANCE_VERSION,
    installed: state.installed,
    navigation: state.navigation,
    paint: Object.freeze({
      firstPaint: state.firstPaint,
      firstContentfulPaint: state.firstContentfulPaint,
      lcp: state.lcp,
      cls: state.cls,
    }),
    routeCommits: state.routeCommits,
    longTasks: summarize(samples.longTasks),
    interactions: summarize(samples.interactions),
    intentToCommit: summarize(samples.intentToCommit),
    commitToPaint: summarize(samples.commitToPaint),
    sampleCap: MAX_SAMPLES,
    policy: Object.freeze({
      localOnly: true,
      externalNetwork: false,
      storage: false,
      rawUrls: false,
      userIdentifiers: false,
      boundedSamples: true,
      routeHostOnlyObservation: true,
    }),
  });
}

export const RuntimePerformance = Object.freeze({
  version: RUNTIME_PERFORMANCE_VERSION,
  init: initRuntimePerformance,
  destroy: destroyRuntimePerformance,
  getSnapshot: getRuntimePerformanceSnapshot,
});

if (isBrowser()) initRuntimePerformance();

export default RuntimePerformance;

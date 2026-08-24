/* =========================================================
   Onion Support - App Enhancements
   Archivo: /src/app/enhancements.js

   Responsabilidad:
   - Ser el registro único de mejoras globales/progresivas de la SPA.
   - Completar el preboot en paralelo antes de entregar control a bootApp().
   - Cargar después del Router sólo mejoras relevantes para la ruta real.
   - Detectar commits del Router y activar features bajo demanda.
   - Coalescer navegaciones rápidas sin perder la última ruta comprometida.
   - No descargar/parsear JS de rutas que el usuario no visita.
   - Aislar fallos de una mejora progresiva para no tumbar el arranque principal.
   - Evitar scripts globales dispersos en index.html.
   - Core/Auth/HTTP optimizan runtime de forma nativa; sin shim de monkey-patching.
   - Optimizar navegación por intención y medir el rendering path sólo en memoria.
   - Sin Auth, Router, HTTP, Store ni lógica de dominio propia.
========================================================= */

export const APP_ENHANCEMENTS_VERSION =
  "app.enhancements.v14-navigation-critical-path";

const PRE_ROUTER = Object.freeze([
  Object.freeze({
    key: "ticket-deeplink",
    load: () => import("../features/ticket-deeplink/index.js"),
  }),
  Object.freeze({
    key: "app-chrome",
    load: () => import("../ui/chrome/index.js"),
  }),
]);

const POST_ROUTER = Object.freeze([
  Object.freeze({
    key: "runtime-performance",
    scope: "global",
    load: () => import("../features/runtime-performance/index.js"),
  }),
  Object.freeze({
    key: "route-intent-preload",
    scope: "global",
    load: () => import("../features/route-intent-preload/index.js"),
  }),
  Object.freeze({
    key: "mobile-datalist",
    scope: "global",
    load: () => import("../features/mobile-datalist/index.js"),
  }),
  Object.freeze({
    key: "facturas-autorefresh",
    scope: "facturas",
    load: () => import("../features/facturas-autorefresh/index.js"),
  }),
  Object.freeze({
    key: "incidencias-media-preview",
    scope: "incidencias",
    load: () => import("../features/incidencias-media-preview/index.js"),
  }),
  Object.freeze({
    key: "incidencias-detail-state",
    scope: "incidencias",
    load: () => import("../features/incidencias-detail-state/index.js"),
  }),
  Object.freeze({
    key: "incidencias-technician-profile",
    scope: "incidencias",
    load: () => import("../features/incidencias-technician-profile/index.js"),
  }),
  Object.freeze({
    key: "public-support",
    scope: "public",
    load: () => import("../features/public-support/index.js"),
  }),
  Object.freeze({
    key: "public-postal-autofill",
    scope: "public",
    load: () => import("../features/public-postal-autofill/index.js"),
  }),
  Object.freeze({
    key: "public-support-progress",
    scope: "public",
    load: () => import("../features/public-support-progress/index.js"),
  }),
  Object.freeze({
    key: "public-home-experience",
    scope: "public",
    load: () => import("../features/public-home-experience/index.js"),
  }),
]);

const FALLBACK_PRELOAD_MS = 72;
const ROUTE_HOST_SELECTOR =
  ".route-view-host:not([hidden])[data-route-path], [data-route-host='true']:not([hidden])[data-route-path]";
const ROUTE_HOST_NODE_SELECTOR =
  ".route-view-host, [data-route-host='true']";

const records = new Map();
let preRouterPromise = null;
let postRouterPromise = null;
let routeSyncPromise = null;
let routeSyncQueued = false;
let routeSyncSource = "route-commit";
let routeObserver = null;
let fallbackTimer = 0;
let initialRouteLoads = 0;
let lazyRouteLoads = 0;
let observerTriggers = 0;
let coalescedRouteSyncs = 0;
let fallbackPreloads = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanErrorText(value = "") {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeError(error = null) {
  return Object.freeze({
    name: cleanErrorText(error?.name || "Error").slice(0, 80) || "Error",
    message: cleanErrorText(error?.message || error || "").slice(0, 240),
  });
}

function cleanPathname(value = "/") {
  return String(value || "/")
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .toLowerCase() || "/";
}

function activeRoutePathname() {
  if (!isBrowser()) return "/";

  try {
    const host = document.querySelector(ROUTE_HOST_SELECTOR);
    const committedPath = host?.dataset?.routePath;

    if (committedPath) {
      return cleanPathname(committedPath);
    }

    return cleanPathname(window.location?.pathname || "/");
  } catch {
    return "/";
  }
}

function hasPathSegment(pathname = "/", segment = "") {
  const cleanSegment = String(segment || "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

  if (!cleanSegment) return false;

  return cleanPathname(pathname)
    .split("/")
    .filter(Boolean)
    .includes(cleanSegment);
}

function routeScopes(pathname = activeRoutePathname()) {
  const path = cleanPathname(pathname);
  const scopes = new Set(["global"]);

  if (hasPathSegment(path, "facturas")) {
    scopes.add("facturas");
  }

  if (
    hasPathSegment(path, "incidencias") ||
    hasPathSegment(path, "tickets")
  ) {
    scopes.add("incidencias");
  }

  const isPublicHome =
    path === "/" ||
    path === "/index.html" ||
    hasPathSegment(path, "support") ||
    hasPathSegment(path, "soporte");

  if (isPublicHome) {
    scopes.add("public");
  }

  return scopes;
}

function routeDefinitions(scopes = routeScopes()) {
  return POST_ROUTER.filter((definition) =>
    scopes.has(definition.scope || "global")
  );
}

async function loadFeature(definition) {
  const key = String(definition?.key || "").trim();

  if (!key || typeof definition?.load !== "function") {
    return false;
  }

  const previous = records.get(key);

  if (previous?.state === "ready") {
    return true;
  }

  if (previous?.promise) {
    return previous.promise;
  }

  const record = {
    key,
    state: "loading",
    error: null,
    promise: null,
  };

  record.promise = Promise.resolve()
    .then(() => definition.load())
    .then(() => {
      record.state = "ready";
      record.error = null;
      return true;
    })
    .catch((error) => {
      record.state = "failed";
      record.error = safeError(error);

      try {
        console.error(`[Onion Enhancements] ${key}:`, record.error);
      } catch {
        // noop
      }

      return false;
    })
    .finally(() => {
      record.promise = null;
    });

  records.set(key, record);
  return record.promise;
}

async function loadPhase(definitions = []) {
  if (!definitions.length) return true;

  const results = await Promise.all(
    definitions.map((definition) => loadFeature(definition))
  );

  return results.every(Boolean);
}

async function syncCurrentRouteFeatures(source = "route") {
  const definitions = routeDefinitions();
  const pending = definitions.filter((definition) => {
    const record = records.get(definition.key);
    return record?.state !== "ready" && !record?.promise;
  });

  if (source === "initial") {
    initialRouteLoads += pending.length;
  } else {
    lazyRouteLoads += pending.length;
  }

  return loadPhase(definitions);
}

function queueRouteFeatureSync(source = "route-commit") {
  routeSyncSource = source;

  if (routeSyncPromise) {
    routeSyncQueued = true;
    coalescedRouteSyncs += 1;
    return routeSyncPromise;
  }

  routeSyncPromise = (async () => {
    let allOk = true;

    do {
      routeSyncQueued = false;
      const currentSource = routeSyncSource;
      const ok = await syncCurrentRouteFeatures(currentSource);
      allOk = ok && allOk;
    } while (routeSyncQueued);

    return allOk;
  })().finally(() => {
    routeSyncPromise = null;
  });

  return routeSyncPromise;
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
    typeof node.matches === "function" &&
    node.matches(ROUTE_HOST_NODE_SELECTOR)
  );
}

function mutationTouchesRouteHost(mutation = null) {
  if (mutation?.type !== "childList") return false;

  return [...mutation.addedNodes, ...mutation.removedNodes]
    .some(nodeIsRouteHost);
}

function installRouteObserver() {
  if (!isBrowser() || routeObserver) {
    return Boolean(routeObserver);
  }

  if (typeof MutationObserver !== "function") {
    return false;
  }

  const root = routeObservationRoot();
  if (!root) return false;

  routeObserver = new MutationObserver((mutations) => {
    if (!mutations.some(mutationTouchesRouteHost)) return;

    observerTriggers += 1;
    void queueRouteFeatureSync("route-commit");
  });

  routeObserver.observe(root, {
    childList: true,
    subtree: false,
  });

  return true;
}

function preloadFallbackSequentially() {
  if (!isBrowser() || fallbackTimer) return false;

  const next = POST_ROUTER.find((definition) => {
    const record = records.get(definition.key);
    return record?.state !== "ready" && !record?.promise;
  });

  if (!next) return true;

  fallbackTimer = window.setTimeout(async () => {
    fallbackTimer = 0;
    fallbackPreloads += 1;
    await loadFeature(next);
    preloadFallbackSequentially();
  }, FALLBACK_PRELOAD_MS);

  return true;
}

async function loadPostRouterPhase() {
  const initialOk = await syncCurrentRouteFeatures("initial");

  /*
    MutationObserver sigue el swap directo de route-view-host del Router.
    No observa el subtree de la vista: cambios internos de tablas/modales no
    disparan trabajo de carga progresiva.

    Una navegación que llega mientras otra feature importa se coalesce y vuelve
    a evaluar la última ruta al terminar, evitando perder commits rápidos.

    El fallback conserva compatibilidad si MutationObserver no existe.
  */
  if (!installRouteObserver()) {
    preloadFallbackSequentially();
  }

  return initialOk;
}

export function initPreRouterEnhancements() {
  if (!preRouterPromise) {
    preRouterPromise = loadPhase(PRE_ROUTER);
  }

  return preRouterPromise;
}

export function initPostRouterEnhancements() {
  if (!postRouterPromise) {
    postRouterPromise = loadPostRouterPhase();
  }

  return postRouterPromise;
}

export function getAppEnhancementsSnapshot() {
  const output = {};

  for (const definition of [...PRE_ROUTER, ...POST_ROUTER]) {
    const record = records.get(definition.key);

    output[definition.key] = Object.freeze({
      state: record?.state || "idle",
      error: record?.error || null,
    });
  }

  const readyPostRouter = POST_ROUTER.reduce(
    (total, definition) =>
      total + (records.get(definition.key)?.state === "ready" ? 1 : 0),
    0
  );

  return Object.freeze({
    version: APP_ENHANCEMENTS_VERSION,
    routePathname: activeRoutePathname(),
    routeScopes: Object.freeze([...routeScopes()]),
    initialRouteLoads,
    lazyRouteLoads,
    observerActive: Boolean(routeObserver),
    observerTriggers,
    coalescedRouteSyncs,
    fallbackPreloads,
    readyPostRouter,
    totalPostRouter: POST_ROUTER.length,
    policy: Object.freeze({
      parallelPreRouter: true,
      nativeRuntimeState: true,
      runtimeShim: false,
      routeCommitLazyLoading: true,
      rapidNavigationCoalescing: true,
      speculativeRoutePreload: false,
      routeIntentPreload: true,
      localRuntimePerformance: true,
      routeHostOnlyObservation: true,
      mutationObserverFallback: true,
    }),
    features: Object.freeze(output),
  });
}

export const AppEnhancements = Object.freeze({
  version: APP_ENHANCEMENTS_VERSION,
  initPreRouter: initPreRouterEnhancements,
  initPostRouter: initPostRouterEnhancements,
  getSnapshot: getAppEnhancementsSnapshot,
});

export default AppEnhancements;

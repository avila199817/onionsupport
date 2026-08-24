/* =========================================================
   Onion Support - App Enhancements
   Archivo: /src/app/enhancements.js

   Responsabilidad:
   - Ser el registro único de mejoras globales/progresivas de la SPA.
   - Cargar antes del Router únicamente lo que afecta al bootstrap de URL/chrome.
   - Priorizar después del Router sólo las mejoras relevantes para la ruta actual.
   - Diferir el resto por turnos idle para evitar ráfagas de red/parse/ejecución.
   - Aislar fallos de una mejora progresiva para no tumbar el arranque principal.
   - Evitar scripts globales dispersos en index.html.
   - Sin Auth, Router, HTTP, Store ni lógica de dominio propia.
========================================================= */

export const APP_ENHANCEMENTS_VERSION =
  "app.enhancements.v10-route-priority-idle";

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

const IDLE_FALLBACK_MS = 48;
const IDLE_TIMEOUT_MS = 1_200;

const records = new Map();
let preRouterPromise = null;
let postRouterPromise = null;
let deferredLoads = 0;
let immediateLoads = 0;

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

function currentPathname() {
  if (!isBrowser()) return "/";

  try {
    return String(window.location?.pathname || "/").toLowerCase();
  } catch {
    return "/";
  }
}

function hasPathSegment(pathname = "/", segment = "") {
  const cleanSegment = String(segment || "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

  if (!cleanSegment) return false;

  return String(pathname || "/")
    .split("/")
    .filter(Boolean)
    .includes(cleanSegment);
}

function routeScopes() {
  const pathname = currentPathname();
  const scopes = new Set(["global"]);

  if (hasPathSegment(pathname, "facturas")) {
    scopes.add("facturas");
  }

  if (
    hasPathSegment(pathname, "incidencias") ||
    hasPathSegment(pathname, "tickets")
  ) {
    scopes.add("incidencias");
  }

  const isPublicHome =
    pathname === "/" ||
    pathname === "/index.html" ||
    hasPathSegment(pathname, "support") ||
    hasPathSegment(pathname, "soporte");

  if (isPublicHome) {
    scopes.add("public");
  }

  return scopes;
}

function waitForIdle() {
  if (!isBrowser()) return Promise.resolve();

  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(
        () => resolve(),
        { timeout: IDLE_TIMEOUT_MS }
      );
      return;
    }

    window.setTimeout(resolve, IDLE_FALLBACK_MS);
  });
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

async function loadPostRouterPhase() {
  const scopes = routeScopes();
  const immediate = POST_ROUTER.filter((definition) =>
    scopes.has(definition.scope || "global")
  );
  const deferred = POST_ROUTER.filter((definition) =>
    !immediate.includes(definition)
  );

  immediateLoads = immediate.length;
  deferredLoads = deferred.length;

  const immediateOk = await loadPhase(immediate);
  let deferredOk = true;

  /*
    El resto se precarga igualmente para que una navegación SPA posterior no
    tenga que descubrir módulos desde cero, pero nunca en una ráfaga paralela.
    Un módulo por turno idle reduce contención de red, parse y main-thread justo
    después del primer render sin cambiar el contrato funcional histórico.
  */
  for (const definition of deferred) {
    await waitForIdle();
    const ok = await loadFeature(definition);
    deferredOk = ok && deferredOk;
  }

  return immediateOk && deferredOk;
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

  return Object.freeze({
    version: APP_ENHANCEMENTS_VERSION,
    routeScopes: Object.freeze([...routeScopes()]),
    immediateLoads,
    deferredLoads,
    idleScheduling:
      isBrowser() && typeof window.requestIdleCallback === "function"
        ? "requestIdleCallback"
        : "timeout",
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

/* =========================================================
   Onion Support - App Enhancements
   Archivo: /src/app/enhancements.js

   Responsabilidad:
   - Ser el registro único de mejoras globales/progresivas de la SPA.
   - Cargar antes del Router únicamente lo que afecta al bootstrap de URL/chrome.
   - Cargar después del App las mejoras no críticas de vistas/UX.
   - Aislar fallos de una mejora progresiva para no tumbar el arranque principal.
   - Evitar scripts globales dispersos en index.html.
   - Sin Auth, Router, HTTP, Store ni lógica de dominio propia.
========================================================= */

export const APP_ENHANCEMENTS_VERSION =
  "app.enhancements.v1-single-entrypoint";

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
    load: () => import("../features/mobile-datalist/index.js"),
  }),
  Object.freeze({
    key: "facturas-autorefresh",
    load: () => import("../features/facturas-autorefresh/index.js"),
  }),
  Object.freeze({
    key: "incidencias-media-preview",
    load: () => import("../features/incidencias-media-preview/index.js"),
  }),
  Object.freeze({
    key: "public-support",
    load: () => import("../features/public-support/index.js"),
  }),
  Object.freeze({
    key: "public-support-progress",
    load: () => import("../features/public-support-progress/index.js"),
  }),
  Object.freeze({
    key: "public-home-experience",
    load: () => import("../features/public-home-experience/index.js"),
  }),
]);

const records = new Map();
let preRouterPromise = null;
let postRouterPromise = null;

function safeError(error = null) {
  return Object.freeze({
    name: String(error?.name || "Error").slice(0, 80),
    message: String(error?.message || error || "").replace(/[\r\n\t]+/g, " ").slice(0, 240),
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
  const results = [];

  for (const definition of definitions) {
    results.push(await loadFeature(definition));
  }

  return results.every(Boolean);
}

export function initPreRouterEnhancements() {
  if (!preRouterPromise) {
    preRouterPromise = loadPhase(PRE_ROUTER);
  }

  return preRouterPromise;
}

export function initPostRouterEnhancements() {
  if (!postRouterPromise) {
    postRouterPromise = loadPhase(POST_ROUTER);
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

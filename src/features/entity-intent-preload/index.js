/* =========================================================
   Onion Support - Entity Intent Preload
   Archivo: /src/features/entity-intent-preload/index.js

   PRELOAD AUTENTICADO · HOME OWNER MODALS · BOUNDED / BEST-EFFORT

   Adelanta exclusivamente los recursos que necesita el siguiente modal del
   Home. Facturas precarga bridge, controller, CSS y detalle canónico; las
   Incidencias precalientan su bridge, controller, CSS y mejoras progresivas.

   No captura clicks, no navega, no cambia history y nunca persiste IDs.
========================================================= */

import { AppCore } from "../../core/index.js";
import {
  normalizeEntityId,
  normalizeEntityType,
} from "../entity-overlay/intent.js";

export const ENTITY_INTENT_PRELOAD_VERSION =
  "entity-intent-preload.v2-home-owner-bridges";

const DETAIL_SELECTOR = [
  "[data-home-scope='true'] ",
  "[data-entity-preload='detail']",
  "[data-entity-open-mode='in-place']",
  "[data-entity-type]",
  "[data-entity-id]",
].join("");

const HOVER_DWELL_MS = 64;

const BRIDGE_LOADERS = Object.freeze({
  factura: () => import("../factura-modal-bridge/index.js"),
  incidencia: () => import("../incidencia-modal-bridge/index.js"),
});

let installed = false;
let hoverTimer = 0;
let hoverNode = null;

const bridgePromises = new Map();
const intentFlights = new Map();

const metrics = {
  intents: 0,
  started: 0,
  completed: 0,
  failed: 0,
  skippedAuth: 0,
  skippedConnection: 0,
  skippedHidden: 0,
  skippedUnsupported: 0,
};

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

function authenticated() {
  try {
    const state = AppCore.runtimeState?.read?.() || null;
    return state?.authenticated === true || AppCore.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function connectionAllowsPreload() {
  if (!isBrowser()) return false;

  try {
    const connection = navigator?.connection || null;
    if (!connection) return true;
    if (connection.saveData === true) return false;

    const effectiveType = cleanText(connection.effectiveType, "").toLowerCase();
    return effectiveType !== "slow-2g" && effectiveType !== "2g";
  } catch {
    return true;
  }
}

function documentAllowsPreload() {
  if (!isBrowser()) return false;
  return cleanText(document.visibilityState, "visible").toLowerCase() === "visible";
}

function hasModifierKey(event = null) {
  return Boolean(
    event?.metaKey ||
    event?.ctrlKey ||
    event?.shiftKey ||
    event?.altKey
  );
}

function intentNode(target = null) {
  const element = target?.nodeType === 3 ? target.parentElement : target;

  try {
    return element?.closest?.(DETAIL_SELECTOR) || null;
  } catch {
    return null;
  }
}

function entityIntent(node = null) {
  const type = normalizeEntityType(
    node?.dataset?.entityType ||
    node?.getAttribute?.("data-entity-type") ||
    ""
  );

  const id = normalizeEntityId(
    type,
    node?.dataset?.entityId ||
    node?.getAttribute?.("data-entity-id") ||
    ""
  );

  return type && id && BRIDGE_LOADERS[type]
    ? Object.freeze({ type, id })
    : null;
}

function clearHoverIntent() {
  if (hoverTimer && isBrowser()) {
    window.clearTimeout(hoverTimer);
  }

  hoverTimer = 0;
  hoverNode = null;
}

function loadBridge(type = "") {
  const key = normalizeEntityType(type);
  const loader = BRIDGE_LOADERS[key];
  if (!loader) return Promise.resolve(null);

  if (!bridgePromises.has(key)) {
    const pending = Promise.resolve()
      .then(() => loader())
      .catch((error) => {
        if (bridgePromises.get(key) === pending) {
          bridgePromises.delete(key);
        }
        throw error;
      });

    bridgePromises.set(key, pending);
  }

  return bridgePromises.get(key);
}

async function warmIntent(intent = null, source = "intent") {
  if (!intent) return false;

  const module = await loadBridge(intent.type);
  if (!module) return false;

  if (intent.type === "factura") {
    const preload =
      module?.primeFacturaModalBridge ||
      module?.preloadFacturaModalBridge ||
      module?.default?.preload ||
      module?.default?.prime;

    if (typeof preload !== "function") return false;

    preload(intent.id, {
      source: `entity-intent-preload.${cleanText(source, "intent")}`,
    });

    return true;
  }

  if (intent.type === "incidencia") {
    const prime =
      module?.primeIncidenciaModalBridge ||
      module?.default?.prime;

    if (typeof prime !== "function") return false;

    /*
      El Detail de Incidencias exige lectura remota íntegra y abortable. Aquí
      sólo calentamos código/CSS; el controller conserva la única petición de
      datos para no duplicar su contrato de integridad.
    */
    prime();
    return true;
  }

  return false;
}

async function preloadNode(node = null, source = "intent") {
  const intent = entityIntent(node);
  if (!intent) {
    metrics.skippedUnsupported += 1;
    return false;
  }

  metrics.intents += 1;

  if (!authenticated()) {
    metrics.skippedAuth += 1;
    return false;
  }

  if (!documentAllowsPreload()) {
    metrics.skippedHidden += 1;
    return false;
  }

  if (!connectionAllowsPreload()) {
    metrics.skippedConnection += 1;
    return false;
  }

  const key = `${intent.type}:${intent.id}`;
  if (intentFlights.has(key)) return intentFlights.get(key);

  metrics.started += 1;

  const task = warmIntent(intent, source)
    .then((ready) => {
      if (ready) metrics.completed += 1;
      else metrics.failed += 1;
      return Boolean(ready);
    })
    .catch(() => {
      metrics.failed += 1;
      return false;
    })
    .finally(() => {
      if (intentFlights.get(key) === task) {
        intentFlights.delete(key);
      }
    });

  intentFlights.set(key, task);
  return task;
}

function onPointerOver(event = null) {
  const node = intentNode(event?.target);
  if (!node || node === hoverNode) return;

  const pointerType = cleanText(event?.pointerType, "mouse").toLowerCase();
  if (pointerType && pointerType !== "mouse") return;

  clearHoverIntent();
  hoverNode = node;
  hoverTimer = window.setTimeout(() => {
    const target = hoverNode;
    hoverTimer = 0;
    hoverNode = null;
    void preloadNode(target, "hover-dwell");
  }, HOVER_DWELL_MS);
}

function onPointerOut(event = null) {
  if (!hoverNode) return;

  const from = intentNode(event?.target);
  if (from !== hoverNode) return;

  const to = event?.relatedTarget;
  if (to && hoverNode.contains?.(to)) return;
  clearHoverIntent();
}

function onFocusIn(event = null) {
  const node = intentNode(event?.target);
  if (node) void preloadNode(node, "focus");
}

function onPointerDown(event = null) {
  if (event?.button !== undefined && event.button !== 0) return;
  if (hasModifierKey(event)) return;

  const node = intentNode(event?.target);
  if (node) void preloadNode(node, "pointerdown");
}

export function initEntityIntentPreload() {
  if (!isBrowser()) return false;
  if (installed) return true;

  installed = true;
  document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true });
  document.addEventListener("pointerout", onPointerOut, { capture: true, passive: true });
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });

  try {
    AppCore.registerModule?.("entityIntentPreload", EntityIntentPreload, {
      overwrite: true,
    });
  } catch {
    // Registro best-effort.
  }

  return true;
}

export function destroyEntityIntentPreload() {
  if (isBrowser() && installed) {
    clearHoverIntent();
    document.removeEventListener("pointerover", onPointerOver, true);
    document.removeEventListener("pointerout", onPointerOut, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  }

  const facturasPromise = bridgePromises.get("factura");
  if (facturasPromise) {
    void Promise.resolve(facturasPromise)
      .then(() => import("../../views/facturas/facturas.api.js"))
      .then((module) => {
        const clear =
          module?.clearFacturaDetailPrefetchCache ||
          module?.default?.clearFacturaDetailPrefetchCache;
        clear?.();
      })
      .catch(() => {});
  }

  bridgePromises.clear();
  intentFlights.clear();
  installed = false;
  return true;
}

export function getEntityIntentPreloadSnapshot() {
  return Object.freeze({
    version: ENTITY_INTENT_PRELOAD_VERSION,
    installed,
    loadedBridgeTypes: Object.freeze([...bridgePromises.keys()]),
    inFlight: intentFlights.size,
    ...metrics,
    policy: Object.freeze({
      authenticatedOnly: true,
      explicitHomeDetailIntentOnly: true,
      supportedTypes: Object.freeze(["factura", "incidencia"]),
      ownerBridgeWarmup: true,
      facturaDetailPrefetch: true,
      incidenciaDataOwnedByController: true,
      hoverDwellMs: HOVER_DWELL_MS,
      focusIntent: true,
      pointerdownIntent: true,
      clickCapture: false,
      routeNavigation: false,
      historyMutation: false,
      saveDataAware: true,
      slow2gAware: true,
      documentVisibleOnly: true,
      directFetch: false,
      storage: false,
      rawIdentifiersInSnapshot: false,
    }),
  });
}

export const EntityIntentPreload = Object.freeze({
  version: ENTITY_INTENT_PRELOAD_VERSION,
  init: initEntityIntentPreload,
  destroy: destroyEntityIntentPreload,
  preload: preloadNode,
  getSnapshot: getEntityIntentPreloadSnapshot,
});

export default EntityIntentPreload;

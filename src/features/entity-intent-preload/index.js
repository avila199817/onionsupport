/* =========================================================
   Onion Support - Entity Intent Preload
   Archivo: /src/features/entity-intent-preload/index.js

   PRELOAD AUTENTICADO · HOME OWNER MODALS · BOUNDED / BEST-EFFORT

   Adelanta exclusivamente los recursos que necesita el siguiente modal del
   Home. La autoridad global prepara los módulos y estilos de cada dominio;
   la carga de datos pertenece exclusivamente al controller de detalle.

   No captura clicks, no navega, no cambia history y nunca persiste IDs.
========================================================= */

import { cleanText } from "../../core/presentation-text.js";
import { AppCore } from "../../core/index.js";
import {
  normalizeEntityId,
  normalizeEntityType,
} from "../entity-overlay/intent.js";

export const ENTITY_INTENT_PRELOAD_VERSION =
  "entity-intent-preload.v3-domain-authority";

const DETAIL_SELECTOR = [
  "[data-home-scope='true'] ",
  "[data-entity-preload='detail']",
  "[data-entity-open-mode='in-place']",
  "[data-entity-type]",
  "[data-entity-id]",
].join("");

const HOVER_DWELL_MS = 64;

const DETAIL_TYPES = new Set(["factura", "incidencia", "cliente", "usuario"]);

let installed = false;
let hoverTimer = 0;
let hoverNode = null;


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

  return type && id && DETAIL_TYPES.has(type)
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

async function warmIntent(intent = null) {
  if (!intent) return false;
  const { EntityOverlay } = await import("../entity-overlay/index.js");
  return EntityOverlay.preload(intent.type);
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

  intentFlights.clear();
  installed = false;
  return true;
}

export function getEntityIntentPreloadSnapshot() {
  return Object.freeze({
    version: ENTITY_INTENT_PRELOAD_VERSION,
    installed,
    inFlight: intentFlights.size,
    ...metrics,
    policy: Object.freeze({
      authenticatedOnly: true,
      explicitHomeDetailIntentOnly: true,
      supportedTypes: Object.freeze([...DETAIL_TYPES]),
      domainCodeWarmup: true,
      domainDataReadOnOpen: true,
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

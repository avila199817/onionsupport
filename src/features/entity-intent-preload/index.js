/* =========================================================
   Onion Support - Entity Intent Preload
   Archivo: /src/features/entity-intent-preload/index.js

   PRELOAD AUTENTICADO · FACTURA DETAIL · BOUNDED / BEST-EFFORT

   Adelanta el detalle completo de una factura sólo cuando el usuario muestra
   intención real sobre una fila del Home: hover estable, foco o pointerdown.
   No captura clicks, no navega, no usa fetch propio y nunca persiste IDs.
========================================================= */

import { AppCore } from "../../core/index.js";

export const ENTITY_INTENT_PRELOAD_VERSION =
  "entity-intent-preload.v1-factura-detail";

const DETAIL_SELECTOR =
  "[data-entity-preload='detail'][data-entity-type='factura'][data-entity-id]";
const HOVER_DWELL_MS = 72;

let installed = false;
let hoverTimer = 0;
let hoverNode = null;
let facturasApiPromise = null;

const metrics = {
  intents: 0,
  started: 0,
  completed: 0,
  failed: 0,
  skippedAuth: 0,
  skippedConnection: 0,
  skippedHidden: 0,
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

function facturaId(node = null) {
  return cleanText(
    node?.dataset?.entityId ||
      node?.getAttribute?.("data-entity-id") ||
      "",
    ""
  )
    .replace(/[\r\n\t]/g, "")
    .slice(0, 160);
}

function clearHoverIntent() {
  if (hoverTimer && isBrowser()) {
    window.clearTimeout(hoverTimer);
  }

  hoverTimer = 0;
  hoverNode = null;
}

function getFacturasApi() {
  if (!facturasApiPromise) {
    facturasApiPromise = import("../../views/facturas/facturas.api.js")
      .catch((error) => {
        facturasApiPromise = null;
        throw error;
      });
  }

  return facturasApiPromise;
}

async function preloadNode(node = null, source = "intent") {
  const id = facturaId(node);
  if (!id) return false;

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

  metrics.started += 1;

  try {
    const module = await getFacturasApi();
    const prefetch = module?.prefetchFacturaDetail || module?.default?.prefetchFacturaDetail;
    if (typeof prefetch !== "function") return false;

    const detail = await prefetch(id, {
      source: `entity-intent-preload.${cleanText(source, "intent")}`,
    });

    if (detail) metrics.completed += 1;
    else metrics.failed += 1;
    return Boolean(detail);
  } catch {
    metrics.failed += 1;
    return false;
  }
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
  if (!isBrowser() || !installed) return false;

  clearHoverIntent();
  document.removeEventListener("pointerover", onPointerOver, true);
  document.removeEventListener("pointerout", onPointerOut, true);
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("pointerdown", onPointerDown, true);
  installed = false;

  if (facturasApiPromise) {
    void facturasApiPromise
      .then((module) => {
        const clear =
          module?.clearFacturaDetailPrefetchCache ||
          module?.default?.clearFacturaDetailPrefetchCache;
        clear?.();
      })
      .catch(() => {});
  }

  facturasApiPromise = null;
  return true;
}

export function getEntityIntentPreloadSnapshot() {
  return Object.freeze({
    version: ENTITY_INTENT_PRELOAD_VERSION,
    installed,
    ...metrics,
    policy: Object.freeze({
      authenticatedOnly: true,
      explicitDetailIntentOnly: true,
      facturaOnly: true,
      hoverDwellMs: HOVER_DWELL_MS,
      focusIntent: true,
      pointerdownIntent: true,
      clickCapture: false,
      saveDataAware: true,
      slow2gAware: true,
      documentVisibleOnly: true,
      directFetch: false,
      storage: false,
      rawIdentifiersInSnapshot: false,
      cacheAuthority: "facturas.api.js",
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

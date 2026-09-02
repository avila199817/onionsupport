/* =========================================================
   Onion Support - Home Entity Modal Authority

   El Home es una superficie de trabajo estable. Sus filas de Incidencias y
   Facturas abren los controladores canónicos en una isla modal transversal,
   sin cambiar de ruta, sin alterar history y sin desmontar el Home.

   Este listener se instala antes que EntityOverlay dentro del runtime privado.
   Sólo intercepta triggers explícitos del Home marcados como in-place; el resto
   de la aplicación conserva la autoridad global existente.
========================================================= */

import {
  normalizeEntityId,
  normalizeEntityType,
} from "../entity-overlay/intent.js";

export const HOME_ENTITY_MODAL_VERSION =
  "home-entity-modal.v1-owner-controller-in-place";

const HOME_SCOPE_SELECTOR =
  "[data-home-scope='true']";

const ROUTE_HOST_SELECTOR =
  "[data-route-host='true'][data-route-host-state='ready']:not([hidden])";

const HOME_TRIGGER_SELECTOR = [
  "[data-home-entity-source]",
  "[data-entity-overlay-trigger='true']",
  "[data-entity-open-mode='in-place']",
  "[data-entity-type]",
  "[data-entity-id]",
].join("");

const ROUTER_EVENT_HANDLED_KEY =
  "__onionRouterHandled";

const BRIDGES = Object.freeze({
  factura: Object.freeze({
    load: () => import("../factura-modal-bridge/index.js"),
    openName: "openFacturaModalFromCurrentView",
    destroyName: "destroyFacturaModalBridge",
  }),
  incidencia: Object.freeze({
    load: () => import("../incidencia-modal-bridge/index.js"),
    openName: "openIncidenciaModalFromCurrentView",
    destroyName: "destroyIncidenciaModalBridge",
  }),
});

let installed = false;
let context = {};
let openSequence = 0;

const bridgePromises = new Map();

const metrics = {
  intents: 0,
  opened: 0,
  failed: 0,
  ignored: 0,
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

function eventTarget(event = null) {
  const target = event?.target;
  return target?.nodeType === 3 ? target.parentElement : target;
}

function hasModifierKey(event = null) {
  return Boolean(
    event?.metaKey ||
    event?.ctrlKey ||
    event?.shiftKey ||
    event?.altKey
  );
}

function committedHomeTrigger(target = null) {
  if (!target?.closest) return null;

  const trigger = target.closest(HOME_TRIGGER_SELECTOR);
  if (!trigger) return null;

  const scope = trigger.closest(HOME_SCOPE_SELECTOR);
  if (!scope) return null;

  const routeHost = scope.closest(ROUTE_HOST_SELECTOR);
  if (!routeHost || !routeHost.contains(scope)) return null;

  const viewKey = cleanText(routeHost.dataset?.viewKey, "").toLowerCase();
  if (viewKey && viewKey !== "home") return null;

  if (
    trigger.disabled ||
    trigger.getAttribute?.("aria-disabled") === "true"
  ) {
    return null;
  }

  return trigger;
}

function intentFromTrigger(trigger = null) {
  if (!trigger) return null;

  const type = normalizeEntityType(
    trigger.dataset?.entityType ||
    trigger.getAttribute?.("data-entity-type") ||
    ""
  );

  const id = normalizeEntityId(
    type,
    trigger.dataset?.entityId ||
    trigger.getAttribute?.("data-entity-id") ||
    ""
  );

  if (!type || !id || !BRIDGES[type]) return null;

  return Object.freeze({
    type,
    id,
    source: cleanText(
      trigger.dataset?.homeEntitySource,
      "home.entity"
    ),
    opener: trigger,
  });
}

function stopHomeEntityClick(event = null) {
  try {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    event[ROUTER_EVENT_HANDLED_KEY] = true;
  } catch {
    // La apertura modal sigue siendo best-effort aunque el evento esté sellado.
  }
}

function loadBridge(type = "") {
  const key = normalizeEntityType(type);
  const definition = BRIDGES[key];
  if (!definition) return Promise.reject(new Error("HOME_ENTITY_BRIDGE_NOT_REGISTERED"));

  if (!bridgePromises.has(key)) {
    const pending = Promise.resolve()
      .then(() => definition.load())
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

async function openIntent(intent = null) {
  if (!intent) return false;

  const sequence = ++openSequence;
  metrics.intents += 1;

  try {
    const module = await loadBridge(intent.type);
    if (sequence !== openSequence) return false;

    const definition = BRIDGES[intent.type];
    const open = module?.[definition.openName] || module?.default?.open;
    if (typeof open !== "function") {
      throw new Error("HOME_ENTITY_BRIDGE_OPEN_UNAVAILABLE");
    }

    const opened = await open(
      intent.id,
      intent.opener,
      {
        ...context,
        source: intent.source,
        originView: "home",
        stayInView: true,
      }
    );

    if (sequence !== openSequence) return false;

    if (opened) metrics.opened += 1;
    else metrics.failed += 1;

    return Boolean(opened);
  } catch {
    if (sequence === openSequence) metrics.failed += 1;
    return false;
  }
}

function onDocumentClick(event = null) {
  if (
    !installed ||
    !event ||
    event.button !== 0 ||
    hasModifierKey(event)
  ) {
    return;
  }

  const trigger = committedHomeTrigger(eventTarget(event));
  if (!trigger) return;

  const intent = intentFromTrigger(trigger);
  if (!intent) {
    metrics.ignored += 1;
    return;
  }

  /*
    Autoridad absoluta de origen: se corta el evento en document/capture antes
    de que EntityOverlay, Router o el controller del Home puedan interpretarlo
    como navegación. El pathname y el host visible permanecen intactos.
  */
  stopHomeEntityClick(event);
  void openIntent(intent);
}

function destroyLoadedBridges() {
  for (const [type, pending] of bridgePromises) {
    const definition = BRIDGES[type];

    void Promise.resolve(pending)
      .then((module) => {
        const destroy =
          module?.[definition.destroyName] ||
          module?.default?.destroy;

        destroy?.();
      })
      .catch(() => {});
  }

  bridgePromises.clear();
  return true;
}

export function initHomeEntityModal(options = {}) {
  if (!isBrowser()) return false;

  context = {
    ...context,
    ...(options && typeof options === "object" ? options : {}),
  };

  if (installed) return true;

  /* Debe registrarse antes que EntityOverlay: PrivateRuntime garantiza el orden. */
  document.addEventListener("click", onDocumentClick, true);
  installed = true;
  return true;
}

export function destroyHomeEntityModal() {
  openSequence += 1;

  if (isBrowser() && installed) {
    document.removeEventListener("click", onDocumentClick, true);
  }

  destroyLoadedBridges();
  context = {};
  installed = false;
  return true;
}

export function getHomeEntityModalSnapshot() {
  return Object.freeze({
    version: HOME_ENTITY_MODAL_VERSION,
    installed,
    loadedBridgeTypes: Object.freeze([...bridgePromises.keys()]),
    ...metrics,
    policy: Object.freeze({
      committedHomeOnly: true,
      explicitInPlaceOnly: true,
      ownerControllersPreserved: true,
      routeNavigation: false,
      historyMutation: false,
      pathnameStable: true,
      documentCaptureAuthority: true,
      stopImmediatePropagation: true,
      rawIdentifiersInSnapshot: false,
    }),
  });
}

export const HomeEntityModal = Object.freeze({
  version: HOME_ENTITY_MODAL_VERSION,
  init: initHomeEntityModal,
  destroy: destroyHomeEntityModal,
  getSnapshot: getHomeEntityModalSnapshot,
});

export default HomeEntityModal;

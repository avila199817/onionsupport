/* =========================================================
   Onion Support - Incidencia Modal Bridge

   Permite abrir el modal canónico de Incidencias desde otras vistas sin
   navegar a /incidencias. El controller real de Incidencias sigue siendo la
   única autoridad sobre carga, acciones, adjuntos, foco y cierre del modal.
========================================================= */

const BRIDGE_HOST_ID = "incidencias-modal-bridge-host";
const MODAL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const STYLE_TIMEOUT_MS = 4_000;

const STYLE_PATHS = Object.freeze([
  "/src/css/components/detail-modal.css",
  "/src/css/views/incidencias/detail.css",
  "/src/css/views/incidencias/media-preview.css",
]);

let bridgeHost = null;
let bridgeController = null;
let closeObserver = null;
let openSequence = 0;
let modulePromise = null;

const stylePromises = new Map();

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

function absoluteUrl(path = "") {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return cleanText(path, "");
  }
}

function ensureStyle(path = "") {
  const href = absoluteUrl(path);
  if (!href || !isBrowser()) return Promise.resolve(false);
  if (stylePromises.has(href)) return stylePromises.get(href);

  const existing = Array.from(
    document.querySelectorAll("link[rel='stylesheet']")
  ).find((link) => link.href === href);

  if (existing?.sheet) {
    const ready = Promise.resolve(true);
    stylePromises.set(href, ready);
    return ready;
  }

  const promise = new Promise((resolve) => {
    const link = existing || document.createElement("link");
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
      resolve(Boolean(ok));
    };

    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeoutId = window.setTimeout(
      () => finish(Boolean(link.sheet)),
      STYLE_TIMEOUT_MS
    );

    link.addEventListener("load", onLoad, { once: true });
    link.addEventListener("error", onError, { once: true });

    if (!existing) {
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.incidenciasModalBridgeStyle = "true";
      document.head.appendChild(link);
    }
  });

  stylePromises.set(href, promise);
  return promise;
}

async function ensureStyles() {
  await Promise.all(STYLE_PATHS.map((path) => ensureStyle(path)));
  return true;
}

function loadIncidenciasModule() {
  if (!modulePromise) {
    modulePromise = import("../../views/incidencias/index.js");
  }
  return modulePromise;
}

function ensureBridgeHost() {
  if (!isBrowser()) return null;
  if (bridgeHost?.isConnected) return bridgeHost;

  document.getElementById(BRIDGE_HOST_ID)?.remove?.();

  bridgeHost = document.createElement("div");
  bridgeHost.id = BRIDGE_HOST_ID;
  bridgeHost.hidden = true;
  bridgeHost.setAttribute("aria-hidden", "true");
  bridgeHost.setAttribute("data-incidencias-modal-bridge-host", "true");
  document.body.appendChild(bridgeHost);
  return bridgeHost;
}

function stopCloseObserver() {
  closeObserver?.disconnect?.();
  closeObserver = null;
}

function disposeBridge({ invalidate = true } = {}) {
  if (invalidate) openSequence += 1;
  stopCloseObserver();

  const controller = bridgeController;
  bridgeController = null;

  try {
    controller?.destroy?.();
  } catch {
    // noop
  }

  try {
    bridgeHost?.replaceChildren?.();
    bridgeHost?.remove?.();
  } catch {
    // noop
  }

  bridgeHost = null;
  return true;
}

function watchBridgeModalClose() {
  stopCloseObserver();
  if (!isBrowser() || typeof MutationObserver !== "function") return false;

  let modalSeen = Boolean(document.querySelector(MODAL_ROOT_SELECTOR));

  closeObserver = new MutationObserver(() => {
    const open = Boolean(document.querySelector(MODAL_ROOT_SELECTOR));

    if (open) {
      modalSeen = true;
      return;
    }

    if (modalSeen) {
      disposeBridge({ invalidate: true });
    }
  });

  closeObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return true;
}

async function ensureBridgeController(module, context = {}) {
  const snapshot = bridgeController?.getSnapshot?.();
  if (
    bridgeController &&
    bridgeHost?.isConnected &&
    snapshot?.destroyed !== true
  ) {
    return bridgeController;
  }

  /*
    Limpia restos de una instancia anterior SIN invalidar la apertura actual.
    La invalidación sólo pertenece a cierres externos o nuevas aperturas.
  */
  disposeBridge({ invalidate: false });

  const host = ensureBridgeHost();
  if (!host || typeof module?.IncidenciasView !== "function") return null;

  const safeContext = context && typeof context === "object" ? context : {};
  bridgeController = await module.IncidenciasView(host, {
    ...safeContext,
    modalBridge: true,
    source: "incidencia-modal-bridge",
  });

  return bridgeController;
}

export async function openIncidenciaModalFromCurrentView(
  ticketId = "",
  openerNode = null,
  context = {}
) {
  const id = cleanText(ticketId, "");
  if (!id || !isBrowser()) return false;

  const sequence = ++openSequence;

  try {
    const [module] = await Promise.all([
      loadIncidenciasModule(),
      ensureStyles(),
    ]);

    if (sequence !== openSequence) return false;

    /*
      Si Incidencias ya es la vista propietaria activa, no creamos bridge:
      delegamos directamente en su controller canónico.
    */
    if (typeof module?.openIncidenciaDetailById === "function") {
      const openedByOwner = await module.openIncidenciaDetailById(
        id,
        openerNode
      );
      if (openedByOwner) return true;
    }

    const controller = await ensureBridgeController(module, context);
    if (
      sequence !== openSequence ||
      !controller ||
      typeof controller.openDetail !== "function"
    ) {
      return false;
    }

    const opened = Boolean(await controller.openDetail(id, openerNode));
    if (sequence !== openSequence) return false;

    if (opened) watchBridgeModalClose();
    else disposeBridge({ invalidate: false });

    return opened;
  } catch {
    if (sequence === openSequence) {
      disposeBridge({ invalidate: false });
    }
    return false;
  }
}

export function destroyIncidenciaModalBridge() {
  return disposeBridge({ invalidate: true });
}

export function getIncidenciaModalBridgeSnapshot() {
  const snapshot = bridgeController?.getSnapshot?.() || null;

  return Object.freeze({
    active: Boolean(bridgeController && bridgeHost?.isConnected),
    modalOpen: Boolean(
      isBrowser() && document.querySelector(MODAL_ROOT_SELECTOR)
    ),
    controller: snapshot,
  });
}

export default Object.freeze({
  open: openIncidenciaModalFromCurrentView,
  destroy: destroyIncidenciaModalBridge,
  getSnapshot: getIncidenciaModalBridgeSnapshot,
});

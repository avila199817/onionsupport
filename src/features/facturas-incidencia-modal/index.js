/* =========================================================
   Onion Support - Facturas -> Incidencia Detail Modal

   Enhancement exclusivo de la ruta Facturas. Intercepta la acción declarativa
   open-incidencia ANTES del handler histórico que navegaba a /incidencias y
   delega en el bridge del modal canónico.
========================================================= */

import {
  openIncidenciaModalFromCurrentView,
  destroyIncidenciaModalBridge,
} from "../incidencia-modal-bridge/index.js";

export const FACTURAS_INCIDENCIA_MODAL_VERSION =
  "facturas-incidencia-modal.v1.direct-canonical";

const ACTION = "open-incidencia";
const FACTURA_DETAIL_ROOT = "[data-facturas-detail-root='true']";
const FACTURA_DETAIL_HOST = "#facturas-detail-root";
const FACTURA_CLOSE_ACTION = "close-factura-detail";
const ROUTE_HOST_SELECTOR =
  "[data-route-host='true'][data-route-host-state='ready']:not([hidden])[data-route-path]";

let installed = false;
let opening = false;

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

function currentRouteIsFacturas() {
  if (!isBrowser()) return false;

  const committed = document.querySelector(ROUTE_HOST_SELECTOR);
  const pathname = cleanText(
    committed?.dataset?.routePath || window.location?.pathname || "",
    ""
  )
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();

  return pathname.split("/").filter(Boolean).includes("facturas");
}

function actionFrom(node = null) {
  return cleanText(
    node?.dataset?.facturasAction || node?.dataset?.action || "",
    ""
  );
}

function ticketIdFrom(node = null) {
  return cleanText(
    node?.dataset?.ticketId || node?.dataset?.incidenciaId || "",
    ""
  );
}

function findStableListOpener(ticketId = "") {
  if (!ticketId || !isBrowser()) return null;

  return Array.from(
    document.querySelectorAll(
      `[data-facturas-action="${ACTION}"], [data-action="${ACTION}"]`
    )
  ).find((node) => {
    if (node.closest(FACTURA_DETAIL_HOST)) return false;
    return ticketIdFrom(node) === ticketId;
  }) || null;
}

function closeFacturaDetailIfNeeded(actionNode = null) {
  const detailRoot = actionNode?.closest?.(FACTURA_DETAIL_ROOT);
  if (!detailRoot) return true;

  const closeButton = detailRoot.querySelector(
    `[data-facturas-action="${FACTURA_CLOSE_ACTION}"], ` +
    `[data-action="${FACTURA_CLOSE_ACTION}"]`
  );

  if (!closeButton || closeButton.disabled) return false;

  closeButton.click();
  return !document.querySelector(FACTURA_DETAIL_ROOT);
}

async function onDocumentClick(event) {
  if (
    opening ||
    !currentRouteIsFacturas() ||
    event.defaultPrevented
  ) {
    return;
  }

  const target =
    event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

  const actionNode = target?.closest?.(
    `[data-facturas-action="${ACTION}"], [data-action="${ACTION}"]`
  );

  if (!actionNode || actionFrom(actionNode) !== ACTION) return;

  const ticketId = ticketIdFrom(actionNode);
  if (!ticketId) return;

  /*
    Captura antes del listener del controller de Facturas: así nunca llega a
    Router.navigate(). No se altera la URL ni se desmonta la vista actual.
  */
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  opening = true;

  try {
    const stableOpener = findStableListOpener(ticketId) || actionNode;

    if (!closeFacturaDetailIfNeeded(actionNode)) {
      return;
    }

    await openIncidenciaModalFromCurrentView(
      ticketId,
      stableOpener?.isConnected ? stableOpener : null,
      {
        source: "facturas.direct-incidencia-modal",
      }
    );
  } finally {
    opening = false;
  }
}

export function installFacturasIncidenciaModal() {
  if (!isBrowser() || installed) return installed;

  document.addEventListener("click", onDocumentClick, true);
  installed = true;
  return true;
}

export function destroyFacturasIncidenciaModal() {
  if (isBrowser() && installed) {
    document.removeEventListener("click", onDocumentClick, true);
  }

  installed = false;
  opening = false;
  destroyIncidenciaModalBridge();
  return true;
}

export function getFacturasIncidenciaModalSnapshot() {
  return Object.freeze({
    version: FACTURAS_INCIDENCIA_MODAL_VERSION,
    installed,
    opening,
    directModal: true,
    routeNavigation: false,
  });
}

installFacturasIncidenciaModal();

export default Object.freeze({
  install: installFacturasIncidenciaModal,
  destroy: destroyFacturasIncidenciaModal,
  getSnapshot: getFacturasIncidenciaModalSnapshot,
});

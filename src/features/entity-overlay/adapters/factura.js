/* =========================================================
   Onion Support - Entity Overlay Adapter: Factura
========================================================= */

import { AppCore } from "../../../core/index.js";

import {
  actionFromNode,
  cleanText,
  entityIdFromData,
  first,
  isAdminRole,
  normalizeAction,
  openDocumentResult,
  relationId,
  renderAdapterError,
  safeError,
  unwrapEntity,
} from "./adapter-utils.js";

export const FACTURA_ENTITY_ADAPTER_VERSION =
  "entity-adapter.factura.v1";

let modulesPromise = null;

async function modules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../../../views/facturas/facturas.api.js"),
      import("../../../views/facturas/facturas.template.modal.js"),
    ]).then(([api, template]) => ({ api, template }));
  }

  return modulesPromise;
}

function facturaId(data = {}, fallback = "") {
  return cleanText(entityIdFromData("factura", data), fallback);
}

function filename(data = {}, id = "") {
  return `factura-${facturaId(data, id) || "documento"}.pdf`;
}

function renderPayload(context = {}) {
  const data = context.data || null;
  const busy = context.busy || {};
  const feedback = context.feedback || null;

  return {
    open: true,
    detailOpen: true,
    detailLoading: context.loading === true,
    loading: context.loading === true,
    factura: data,
    item: data,
    detail: data,
    admin: isAdminRole(AppCore),
    markingPaidFacturaId: busy.markPaid ? context.id : "",
    sendingFacturaId: busy.send ? context.id : "",
    viewingFacturaId: busy.view ? context.id : "",
    downloadingFacturaId: busy.download ? context.id : "",
    feedbackMessage: cleanText(feedback?.message, ""),
    feedbackType: cleanText(feedback?.type, "info"),
    embedded: true,
    entityOverlay: true,
  };
}

export async function loadFacturaEntity({ id = "", signal = null } = {}) {
  const { api } = await modules();
  const loader =
    api.getFacturaById ||
    api.fetchFacturaDetailRequest ||
    api.default?.getFacturaById ||
    api.default?.fetchFacturaDetailRequest;

  if (typeof loader !== "function") {
    throw new Error("FACTURA_DETAIL_LOADER_MISSING");
  }

  const result = await loader(id, {
    signal,
    source: "entity-overlay",
  });

  const item = unwrapEntity(result, "factura");
  if (!item) throw new Error("FACTURA_NOT_FOUND");
  return item;
}

export async function renderFacturaEntity(context = {}) {
  if (context.error) {
    return renderAdapterError({
      type: "factura",
      id: context.id,
      error: safeError(context.error, "No se pudo cargar la factura."),
    });
  }

  const { template } = await modules();
  const renderer =
    template.renderFacturasDetailModal ||
    template.default?.renderFacturasDetailModal;

  if (typeof renderer !== "function") {
    return renderAdapterError({
      type: "factura",
      id: context.id,
      error: "El modal de Facturas no está disponible.",
    });
  }

  return renderer(renderPayload(context));
}

async function runOperation(overlay, key, operation, successMessage = "Operación completada.") {
  overlay.setBusy(key, true);
  overlay.setFeedback(null);

  try {
    const result = await operation();
    overlay.setFeedback({
      type: "success",
      message: successMessage,
    });
    return result;
  } catch (error) {
    overlay.setFeedback({
      type: "error",
      message: safeError(error, "No se pudo completar la operación."),
    });
    return null;
  } finally {
    overlay.setBusy(key, false);
  }
}

function actionValue(node = null) {
  return actionFromNode(node, ["facturas", "factura"]);
}

export async function handleFacturaEntityAction({
  node = null,
  data = null,
  id = "",
  overlay = null,
} = {}) {
  if (!overlay) return false;

  const action = actionValue(node);
  if (!action) return false;

  if (action.includes("close") || action.includes("cerrar")) {
    overlay.close();
    return true;
  }

  const { api } = await modules();
  const entityId = facturaId(data, id);

  if (action.includes("open-incidencia") || action.includes("open-ticket")) {
    const linkedId = relationId(data, "incidencia", node);
    if (!linkedId) {
      overlay.setFeedback({
        type: "warning",
        message: "La factura no incluye una incidencia vinculada identificable.",
      });
      return true;
    }

    await overlay.open({
      type: "incidencia",
      id: linkedId,
      source: "factura.relation",
    });
    return true;
  }

  if (action.includes("view") && action.includes("pdf")) {
    const request =
      api.viewFacturaPdfRequest ||
      api.default?.viewFacturaPdfRequest;

    if (typeof request !== "function") return false;

    const result = await runOperation(
      overlay,
      "view",
      () => request(entityId, { source: "entity-overlay" }),
      "Documento preparado."
    );

    if (result && !openDocumentResult(result, {
      mode: "view",
      filename: filename(data, entityId),
    })) {
      overlay.setFeedback({
        type: "error",
        message: "Azure no devolvió una URL de visualización válida.",
      });
    }

    return true;
  }

  if (action.includes("download") || action.includes("descargar")) {
    const request =
      api.downloadFacturaPdfRequest ||
      api.default?.downloadFacturaPdfRequest;

    if (typeof request !== "function") return false;

    const result = await runOperation(
      overlay,
      "download",
      () => request(entityId, { source: "entity-overlay" }),
      "Descarga preparada."
    );

    if (result && !openDocumentResult(result, {
      mode: "download",
      filename: filename(data, entityId),
    })) {
      overlay.setFeedback({
        type: "error",
        message: "Azure no devolvió un documento descargable válido.",
      });
    }

    return true;
  }

  if (action.includes("send") || action.includes("enviar") || action.includes("resend")) {
    const request = api.sendFactura || api.default?.sendFactura;
    if (typeof request !== "function") return false;

    const result = await runOperation(
      overlay,
      "send",
      () => request(entityId, { source: "entity-overlay" }),
      "Factura enviada correctamente."
    );

    if (result) await overlay.reload({ silent: true });
    return true;
  }

  if (
    action.includes("mark-paid") ||
    action.includes("paid") ||
    action.includes("registrar-cobro") ||
    action.includes("cobro")
  ) {
    if (!isAdminRole(AppCore)) return true;

    const request = api.markFacturaPaid || api.default?.markFacturaPaid;
    if (typeof request !== "function") return false;

    const confirmed = window.confirm(
      `¿Confirmas que la factura ${entityId} está cobrada completamente?`
    );
    if (!confirmed) return true;

    const result = await runOperation(
      overlay,
      "markPaid",
      () => request(entityId, { source: "entity-overlay" }),
      "Cobro registrado correctamente."
    );

    if (result) await overlay.reload({ silent: true });
    return true;
  }

  if (action.includes("refresh") || action.includes("reload") || action.includes("actualizar")) {
    await overlay.reload();
    return true;
  }

  return false;
}

export function afterRenderFacturaEntity(root = null) {
  if (!root) return false;

  const panel = root.querySelector(
    "[data-facturas-detail-modal='true'], [data-role='facturas-detail-modal'], [role='dialog']"
  );

  if (panel) {
    panel.dataset.entityOverlayPanel = "true";
    panel.dataset.entityType = "factura";
    if (!panel.hasAttribute("tabindex")) panel.tabIndex = -1;
  }

  return Boolean(panel);
}

export const FacturaEntityAdapter = Object.freeze({
  type: "factura",
  version: FACTURA_ENTITY_ADAPTER_VERSION,
  load: loadFacturaEntity,
  render: renderFacturaEntity,
  handleAction: handleFacturaEntityAction,
  afterRender: afterRenderFacturaEntity,
});

export default FacturaEntityAdapter;

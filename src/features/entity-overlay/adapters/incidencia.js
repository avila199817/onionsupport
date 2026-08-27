/* =========================================================
   Onion Support - Entity Overlay Adapter: Incidencia
========================================================= */

import { AppCore } from "../../../core/index.js";

import {
  actionFromNode,
  cleanText,
  entityIdFromData,
  isAdminRole,
  normalizeAction,
  pickFunction,
  pickRenderer,
  relationId,
  renderAdapterError,
  safeError,
  unwrapEntity,
} from "./adapter-utils.js";

export const INCIDENCIA_ENTITY_ADAPTER_VERSION =
  "entity-adapter.incidencia.v1";

let modulesPromise = null;

async function modules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../../../views/incidencias/incidencias.api.js"),
      import("../../../views/incidencias/incidencias.template.modal.js"),
    ]).then(([api, template]) => ({ api, template }));
  }

  return modulesPromise;
}

function incidenciaId(data = {}, fallback = "") {
  return cleanText(entityIdFromData("incidencia", data), fallback);
}

export async function loadIncidenciaEntity({ id = "", signal = null } = {}) {
  const { api } = await modules();
  const loader = pickFunction(
    api,
    [
      "getIncidenciaByIdRequest",
      "loadIncidenciaDetail",
      "getIncidenciaById",
      "fetchIncidenciaDetailRequest",
      "fetchTicketDetailRequest",
    ],
    /(?:get|load|fetch).*(?:incidencia|ticket).*(?:detail|byid|request)/i
  );

  if (typeof loader !== "function") {
    throw new Error("INCIDENCIA_DETAIL_LOADER_MISSING");
  }

  const result = await loader(id, {
    signal,
    source: "entity-overlay",
  });

  const item = unwrapEntity(result, "incidencia");
  if (!item) throw new Error("INCIDENCIA_NOT_FOUND");
  return item;
}

function renderPayload(context = {}) {
  const data = context.data || null;
  const feedback = context.feedback || null;

  return {
    open: true,
    modalOpen: true,
    detailOpen: true,
    detailLoading: context.loading === true,
    loading: context.loading === true,
    incidencia: data,
    ticket: data,
    item: data,
    detail: data,
    selectedIncidencia: data,
    selectedTicket: data,
    admin: isAdminRole(AppCore),
    readOnly: true,
    readonly: true,
    canEdit: false,
    embedded: true,
    entityOverlay: true,
    feedbackMessage: cleanText(feedback?.message, ""),
    feedbackType: cleanText(feedback?.type, "info"),
  };
}

export async function renderIncidenciaEntity(context = {}) {
  if (context.error) {
    return renderAdapterError({
      type: "incidencia",
      id: context.id,
      error: safeError(context.error, "No se pudo cargar la incidencia."),
    });
  }

  const { template } = await modules();
  const renderer = pickRenderer(
    template,
    [
      "renderIncidenciasDetailModal",
      "renderIncidenciaDetailModal",
      "renderTicketDetailModal",
      "renderDetailModal",
    ],
    /render.*(?:incidencia|ticket)?.*(?:detail|modal)/i
  );

  if (typeof renderer !== "function") {
    return renderAdapterError({
      type: "incidencia",
      id: context.id,
      error: "El modal de Incidencias no está disponible.",
    });
  }

  return renderer(renderPayload(context));
}

function actionValue(node = null) {
  return actionFromNode(node, ["incidencias", "incidencia", "ticket"]);
}

function relationTypeFromAction(action = "") {
  const key = normalizeAction(action);
  if (key.includes("factura") || key.includes("invoice")) return "factura";
  if (key.includes("cliente") || key.includes("client")) return "cliente";
  if (key.includes("usuario") || key.includes("user") || key.includes("tecnico")) {
    return "usuario";
  }
  return "";
}

export async function handleIncidenciaEntityAction({
  node = null,
  data = null,
  overlay = null,
} = {}) {
  if (!overlay) return false;

  const action = actionValue(node);
  if (!action) return false;

  if (action.includes("close") || action.includes("cerrar")) {
    overlay.close();
    return true;
  }

  if (action.includes("refresh") || action.includes("reload") || action.includes("actualizar")) {
    await overlay.reload();
    return true;
  }

  const relationType = relationTypeFromAction(action);
  if (relationType) {
    const linkedId = relationId(data, relationType, node);

    if (!linkedId) {
      overlay.setFeedback({
        type: "warning",
        message: `No se encontró el identificador de ${relationType} vinculado.`,
      });
      return true;
    }

    await overlay.open({
      type: relationType,
      id: linkedId,
      source: "incidencia.relation",
    });
    return true;
  }

  /*
    El overlay transversal es deliberadamente de consulta. Las mutaciones de
    dominio complejas siguen perteneciendo al controller canónico de la vista,
    pero el usuario puede consultar la entidad completa desde cualquier lugar.
  */
  if (
    [
      "save",
      "edit",
      "delete",
      "assign",
      "status",
      "comment",
      "message",
      "upload",
      "resolve",
      "close-ticket",
      "reopen",
    ].some((part) => action.includes(part))
  ) {
    overlay.setFeedback({
      type: "info",
      message: "La vista rápida es de consulta. La edición completa permanece en Incidencias.",
    });
    return true;
  }

  return false;
}

const READ_ONLY_MUTATION_PARTS = Object.freeze([
  "save",
  "edit",
  "delete",
  "assign",
  "status",
  "comment",
  "message",
  "upload",
  "resolve",
  "reopen",
  "close-ticket",
]);

export function afterRenderIncidenciaEntity(root = null) {
  if (!root) return false;

  const panel = root.querySelector(
    "[data-incidencias-detail-modal='true'], [data-incidencia-detail-modal='true'], [data-ticket-detail-modal='true'], [role='dialog']"
  );

  if (panel) {
    panel.dataset.entityOverlayPanel = "true";
    panel.dataset.entityType = "incidencia";
    panel.dataset.entityOverlayReadonly = "true";
    if (!panel.hasAttribute("tabindex")) panel.tabIndex = -1;
  }

  for (const node of root.querySelectorAll(
    "button[data-action], button[data-incidencias-action], button[data-incidencia-action], button[data-ticket-action]"
  )) {
    const action = actionValue(node);
    if (!action) continue;

    if (READ_ONLY_MUTATION_PARTS.some((part) => action.includes(part))) {
      node.disabled = true;
      node.setAttribute("aria-disabled", "true");
      node.dataset.entityOverlayDisabled = "true";
      node.title = "Edición disponible en la vista Incidencias";
    }
  }

  return Boolean(panel);
}

export const IncidenciaEntityAdapter = Object.freeze({
  type: "incidencia",
  version: INCIDENCIA_ENTITY_ADAPTER_VERSION,
  load: loadIncidenciaEntity,
  render: renderIncidenciaEntity,
  handleAction: handleIncidenciaEntityAction,
  afterRender: afterRenderIncidenciaEntity,
});

export default IncidenciaEntityAdapter;

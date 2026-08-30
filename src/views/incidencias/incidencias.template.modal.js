/* =========================================================
   Onion Support - Incidencias Detail Truth Boundary
   Archivo: /src/views/incidencias/incidencias.template.modal.js

   TRUTHFUL BOUNDED WINDOWS · TEMPLATE SAFE

   Responsabilidad:
   - Mantener el template visual existente 1:1 en .impl.js.
   - Consumir la metadata de ventana acotada que devuelve el backend.
   - Mostrar totales reales de historial/actividad y adjuntos.
   - Explicar discretamente cuándo sólo se muestra la ventana reciente.
   - No introducir paginación, HTTP, DOM ni listeners nuevos.
========================================================= */

import {
  DETAIL_ACTIONS,
  getDetailCommentValue,
  getDetailTemplateSnapshot as getDetailTemplateSnapshotImpl,
  renderIncidenciasDetailModal as renderIncidenciasDetailModalImpl,
  renderIncidenciasDetailModalClosed,
  validateDetailUpdate,
} from "./incidencias.template.modal.impl.js";

export {
  DETAIL_ACTIONS,
  getDetailCommentValue,
  renderIncidenciasDetailModalClosed,
  validateDetailUpdate,
};

export const INCIDENCIAS_MODAL_TEMPLATE_VERSION =
  "incidencias.template.modal.extreme.v36.truthful-bounded-windows";

export const INCIDENCIAS_DETAIL_WINDOW_UI_VERSION =
  "incidencias.detail-window-ui.v1";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function count(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : fallback;
}

function detailFromInput(input = {}) {
  const source = object(input);

  for (const candidate of [
    source.detail,
    source.ticket,
    source.incidencia,
    source.item,
    source.data,
  ]) {
    if (isObject(candidate)) return candidate;
  }

  return {};
}

function collectionWindow(detail = {}, name = "", countKey = "", aliases = []) {
  const raw = object(detail);
  const meta = object(raw.meta);
  const window = object(meta[name]);

  let values = [];
  for (const key of [name, ...aliases]) {
    if (Array.isArray(raw[key])) {
      values = raw[key];
      break;
    }
  }

  const returned = count(window.returned, values.length);
  const total = Math.max(
    returned,
    count(window.total, 0),
    count(raw[countKey], 0)
  );
  const truncated = window.truncated === true || total > returned;

  return {
    total,
    returned,
    truncated,
  };
}

export function getIncidenciasDetailWindowUiState(input = {}) {
  const detail = detailFromInput(input);
  const meta = object(detail.meta);
  const hasWindowContract = Boolean(
    meta.detailWindowVersion ||
    isObject(meta.comments) ||
    isObject(meta.history) ||
    isObject(meta.attachments)
  );

  const comments = collectionWindow(
    detail,
    "comments",
    "commentsCount",
    ["notes", "messages"]
  );
  const history = collectionWindow(
    detail,
    "history",
    "historyCount",
    ["events"]
  );
  const attachments = collectionWindow(
    detail,
    "attachments",
    "attachmentsCount",
    ["files", "adjuntos"]
  );

  const timeline = {
    total: history.total + comments.total,
    returned: history.returned + comments.returned,
    truncated: history.truncated || comments.truncated,
  };

  return {
    hasWindowContract,
    comments,
    history,
    timeline,
    attachments,
    truncated: timeline.truncated || attachments.truncated,
  };
}

function timelineLabel(window = {}) {
  const total = count(window.total, 0);
  const returned = count(window.returned, 0);

  if (!total) return "Sin actividad registrada";

  if (window.truncated === true) {
    return `${total} registros · mostrando ${returned} recientes`;
  }

  return `${total} registro${total === 1 ? "" : "s"}`;
}

function attachmentsLabel(window = {}) {
  const total = count(window.total, 0);
  const returned = count(window.returned, 0);
  const noun = `adjunto${total === 1 ? "" : "s"}`;

  if (window.truncated === true) {
    return `${total} ${noun} · mostrando ${returned}`;
  }

  return `${total} ${noun}`;
}

function patchHistoryJumpCount(html = "", total = 0) {
  return String(html).replace(
    /(<span\s+class="incidencias-modal-history-jump-count"[^>]*>\s*)\d+(\s*<\/span>)/,
    `$1${count(total, 0)}$2`
  );
}

function patchHistoryHeading(html = "", window = {}) {
  return String(html).replace(
    /(<h3\s+id="incidencias-modal-history-title">[\s\S]*?<\/h3>\s*<span>)[\s\S]*?(<\/span>)/,
    `$1${timelineLabel(window)}$2`
  );
}

function patchAttachmentHeading(html = "", window = {}) {
  return String(html).replace(
    /(<h3\s+id="incidencias-modal-files-title">[\s\S]*?<\/h3>\s*<span>)[\s\S]*?(<\/span>)/,
    `$1${attachmentsLabel(window)}$2`
  );
}

function patchAttachmentMetaCard(html = "", total = 0) {
  return String(html).replace(
    /(<div\s+class="incidencias-modal-meta-card ui-detail-modal-meta-card">\s*<span>Adjuntos<\/span>\s*<strong>\s*)[^<]*(\s*<\/strong>)/,
    `$1${count(total, 0)}$2`
  );
}

function patchRootContract(html = "", state = {}) {
  const contract =
    `data-attachment-view-policy="signed-view-only" ` +
    `data-detail-window-ui-version="${INCIDENCIAS_DETAIL_WINDOW_UI_VERSION}" ` +
    `data-detail-window-truncated="${state.truncated ? "true" : "false"}"`;

  return String(html)
    .replace(
      /data-template-version="[^"]*"/,
      `data-template-version="${INCIDENCIAS_MODAL_TEMPLATE_VERSION}"`
    )
    .replace(
      'data-attachment-view-policy="signed-view-only"',
      contract
    );
}

export function renderIncidenciasDetailModal(input = {}) {
  const html = renderIncidenciasDetailModalImpl(input);
  if (!html) return html;

  const state = getIncidenciasDetailWindowUiState(input);
  if (!state.hasWindowContract) {
    return patchRootContract(html, state);
  }

  let output = patchRootContract(html, state);
  output = patchHistoryJumpCount(output, state.timeline.total);
  output = patchHistoryHeading(output, state.timeline);
  output = patchAttachmentHeading(output, state.attachments);
  output = patchAttachmentMetaCard(output, state.attachments.total);

  return output;
}

export function getDetailTemplateSnapshot() {
  const snapshot = getDetailTemplateSnapshotImpl();

  return {
    ...snapshot,
    version: INCIDENCIAS_MODAL_TEMPLATE_VERSION,
    detailWindowUi: {
      version: INCIDENCIAS_DETAIL_WINDOW_UI_VERSION,
      truthfulTotals: true,
      explicitRecentWindow: true,
      addsPagination: false,
    },
    policy: {
      ...(snapshot?.policy || {}),
      truthfulBoundedCollections: true,
      historyTotalUsesBackendWindowMetadata: true,
      attachmentsTotalUsesBackendWindowMetadata: true,
      noSyntheticTimelineEntries: true,
    },
  };
}

export const getSnapshot = getDetailTemplateSnapshot;
export const renderDetailModal = renderIncidenciasDetailModal;
export const renderDetailModalClosed = renderIncidenciasDetailModalClosed;

export default renderIncidenciasDetailModal;

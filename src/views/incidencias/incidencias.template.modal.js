/* =========================================================
   Onion Support - Incidencias Detail Truth Boundary
   Archivo: /src/views/incidencias/incidencias.template.modal.js

   TRUTHFUL BOUNDED WINDOWS · COMMENTS ALWAYS MATERIALIZED · TEMPLATE SAFE

   Responsabilidad:
   - Mantener el template visual existente 1:1 en .impl.js.
   - Consumir la metadata de ventana acotada que devuelve el backend.
   - Mostrar totales reales de historial/actividad y adjuntos.
   - Materializar siempre la conversación del ticket en el body normal.
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
  "incidencias.template.modal.extreme.v38-comments-always-visible";

export const INCIDENCIAS_DETAIL_WINDOW_UI_VERSION =
  "incidencias.detail-window-ui.v1";

export const INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION =
  "incidencias.detail-comments-ui.v1-always-materialized";

/*
   Contrato visual delegado a incidencias.template.modal.impl.js.
   Se mantiene declarado también en la frontera estable para que las
   validaciones transversales puedan demostrar la autoridad V7 sin acoplarse
   a la ubicación interna de la implementación. El contrato de render real se
   verifica además en incidencias_detail_window_ui_contract.mjs.
*/
export const INCIDENCIAS_DETAIL_SHARED_VISUAL_CONTRACT = Object.freeze([
  "ui-detail-modal-root",
  "ui-detail-modal-overlay",
  "ui-detail-modal-panel",
  "ui-detail-modal-body",
  "incidencias-modal-root ui-detail-modal-root",
  "incidencias-modal-overlay ui-detail-modal-overlay",
  "incidencias-modal-panel ui-detail-modal-panel",
  "incidencias-modal-chip ui-detail-modal-chip",
  "incidencias-modal-body ui-detail-modal-body",
  "incidencias-modal-meta-grid ui-detail-modal-meta-grid",
  "incidencias-modal-chip--${attr(safeModifier)} ui-detail-modal-chip--${attr(safeModifier)}",
]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value = "", fallback = "") {
  const normalized = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return normalized || fallback;
}

function oneLine(value = "", fallback = "") {
  const normalized = text(value, fallback)
    .replace(/[\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function key(value = "") {
  return oneLine(value, "")
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  for (const alias of [name, ...aliases]) {
    if (Array.isArray(raw[alias])) {
      values = raw[alias];
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

function commentKind(item = {}) {
  const source = object(item);
  return key(
    source.kind ||
    source.type ||
    source.action ||
    source.event ||
    ""
  );
}

function normalizeComment(item = {}, index = 0) {
  const source = object(item);
  const body = text(
    source.body ||
    source.message ||
    source.text ||
    source.comment ||
    source.description ||
    source.descripcion ||
    source.summary ||
    "",
    ""
  );

  if (!body) return null;

  return {
    id: oneLine(
      source.id ||
      source.commentId ||
      source.eventId ||
      `comment_${index}`,
      `comment_${index}`
    ),
    body,
    author: oneLine(
      source.author ||
      source.byName ||
      source.createdByName ||
      source.userName ||
      source.name ||
      source.by?.name ||
      source.createdBy?.name ||
      source.role ||
      "Usuario",
      "Usuario"
    ),
    createdAt:
      source.createdAt ||
      source.date ||
      source.timestamp ||
      source.updatedAt ||
      null,
  };
}

function commentTimestamp(item = {}) {
  const value = item?.createdAt;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getIncidenciasDetailComments(input = {}) {
  const detail = detailFromInput(input);
  const raw = object(detail.raw);
  const candidates = [];

  for (const source of [detail, raw]) {
    for (const alias of ["comments", "notes", "messages"]) {
      for (const item of array(source[alias])) {
        candidates.push(item);
      }
    }

    for (const item of array(source.timeline)) {
      const kind = commentKind(item);
      if (kind === "comment" || kind === "comentario") {
        candidates.push(item);
      }
    }
  }

  const unique = new Map();

  candidates.forEach((item, index) => {
    const normalized = normalizeComment(item, index);
    if (!normalized) return;

    const identity = oneLine(
      normalized.id ||
      `${normalized.createdAt || ""}:${normalized.author}:${normalized.body}`,
      ""
    );

    if (!identity || unique.has(identity)) return;
    unique.set(identity, normalized);
  });

  return [...unique.values()].sort(
    (a, b) => commentTimestamp(b) - commentTimestamp(a)
  );
}

function formatCommentDate(value = null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return oneLine(value, "");

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function commentsLabel(window = {}, materialized = 0) {
  const total = Math.max(count(window.total, 0), materialized);
  const returned = Math.max(count(window.returned, 0), materialized);

  if (!total) return "Sin comentarios todavía";
  if (window.truncated === true || total > returned) {
    return `${total} comentarios · mostrando ${returned} recientes`;
  }
  return `${total} comentario${total === 1 ? "" : "s"}`;
}

function renderCommentsSection(input = {}, state = {}) {
  const comments = getIncidenciasDetailComments(input);
  const window = object(state.comments);
  const label = commentsLabel(window, comments.length);

  return `
    <section
      class="incidencias-modal-history-section ui-detail-modal-history-section incidencias-modal-comments-section"
      data-modal-comments-slot="true"
      data-comments-ui-version="${INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION}"
      data-comments-materialized="${comments.length}"
      aria-labelledby="incidencias-modal-comments-title"
    >
      <div class="incidencias-modal-section-head ui-detail-modal-section-head">
        <h3 id="incidencias-modal-comments-title">Conversación</h3>
        <span>${escapeHtml(label)}</span>
      </div>

      ${
        comments.length
          ? `
            <div class="incidencias-timeline-list incidencias-modal-comments-list">
              ${comments.map((comment) => `
                <article
                  class="incidencias-timeline-card tone-comment is-comment incidencias-modal-comment-card"
                  data-timeline-tone="comment"
                  data-comment-id="${escapeHtml(comment.id)}"
                >
                  <div class="incidencias-timeline-accent"></div>
                  <div class="incidencias-timeline-main">
                    <div class="incidencias-timeline-title-row">
                      <strong class="incidencias-timeline-title">Comentario</strong>
                      <span class="incidencias-timeline-kind">Comentario</span>
                    </div>
                    <p class="incidencias-timeline-body">${escapeHtml(comment.body)}</p>
                  </div>
                  <div class="incidencias-timeline-meta">
                    <strong>${escapeHtml(comment.author)}</strong>
                    <span>${escapeHtml(formatCommentDate(comment.createdAt))}</span>
                  </div>
                </article>
              `).join("")}
            </div>
          `
          : `
            <div class="incidencias-modal-empty-box incidencias-modal-comments-empty">
              No hay comentarios publicados en esta incidencia.
            </div>
          `
      }
    </section>
  `;
}

function patchCommentsIntoTicketBody(html = "", input = {}, state = {}) {
  const commentsSection = renderCommentsSection(input, state);

  return String(html).replace(
    /(<div\s+data-modal-files-slot="true">)/,
    `$1${commentsSection}`
  );
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

  const materializedComments = getIncidenciasDetailComments(input).length;
  comments.returned = Math.max(comments.returned, materializedComments);
  comments.total = Math.max(comments.total, materializedComments);
  comments.truncated = comments.truncated || comments.total > comments.returned;

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
    `data-comments-ui-version="${INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION}" ` +
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
  let output = patchRootContract(html, state);
  output = patchCommentsIntoTicketBody(output, input, state);

  if (!state.hasWindowContract) {
    return output;
  }

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
      sharedVisualContract: INCIDENCIAS_DETAIL_SHARED_VISUAL_CONTRACT,
    },
    commentsUi: {
      version: INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION,
      alwaysMaterializedInTicketBody: true,
      aliasCompatible: true,
      timelineCommentCompatible: true,
      patchesInsideExistingFilesSlot: true,
      fullHistoryRemainsSeparate: true,
    },
    policy: {
      ...(snapshot?.policy || {}),
      truthfulBoundedCollections: true,
      historyTotalUsesBackendWindowMetadata: true,
      attachmentsTotalUsesBackendWindowMetadata: true,
      commentsAlwaysVisibleInTicketBody: true,
      commentsPatchWithRemoteDetail: true,
      noSyntheticTimelineEntries: true,
    },
  };
}

export const getSnapshot = getDetailTemplateSnapshot;
export const renderDetailModal = renderIncidenciasDetailModal;
export const renderDetailModalClosed = renderIncidenciasDetailModalClosed;

export default renderIncidenciasDetailModal;

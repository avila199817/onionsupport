/* =========================================================
   Onion Support - Incidencias Detail Truth Boundary
   Archivo: /src/views/incidencias/incidencias.template.modal.js

   TRUTHFUL BOUNDED WINDOWS · CANONICAL FOLLOW-UP · TEMPLATE SAFE

   Responsabilidad:
   - Mantener la implementación visual principal delegada en .impl.js.
   - Consumir metadata de ventanas acotadas del backend.
   - Mantener totales reales de historial/actividad y adjuntos.
   - Materializar comentarios con el MISMO contrato DOM de Seguimiento que
     usan live-sync, avatar fallback y user-update-turn.
   - No acoplar conversación al slot de documentos/adjuntos.
   - No introducir HTTP, DOM imperativo, listeners ni una segunda UI paralela.
   - Sellar en render la identidad de avatar del solicitante y del técnico
     para que AvatarSystem nunca mezcle personas dentro del mismo modal.
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
  "incidencias.template.modal.extreme.v40-avatar-identity-boundary";

export const INCIDENCIAS_DETAIL_WINDOW_UI_VERSION =
  "incidencias.detail-window-ui.v1";

export const INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION =
  "incidencias.detail-comments-ui.v2-canonical-followup";

export const INCIDENCIAS_DETAIL_AVATAR_UI_VERSION =
  "incidencias.detail-avatar-ui.v1-global-identity-boundary";

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
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
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

function rawDetail(detail = {}) {
  const source = object(detail);
  return object(source.raw || source.data || source.item || source, source);
}

function requesterAvatarIdentity(detail = {}) {
  const source = object(detail);
  const raw = rawDetail(source);
  const requester = object(
    source.requesterSnapshot ||
    source.cliente ||
    source.receptor ||
    source.user ||
    raw.requesterSnapshot ||
    raw.cliente ||
    raw.receptor ||
    raw.user ||
    {}
  );

  return {
    name: oneLine(
      source.displayName ||
      source.name ||
      source.nombre ||
      source.clientName ||
      source.clienteNombre ||
      requester.displayName ||
      requester.name ||
      requester.nombre ||
      raw.displayName ||
      raw.name ||
      raw.nombre ||
      raw.email ||
      "Usuario",
      "Usuario"
    ),
    email: oneLine(
      source.email ||
      source.emailLower ||
      source.userEmail ||
      source.clienteEmail ||
      requester.email ||
      requester.emailLower ||
      raw.email ||
      raw.emailLower ||
      "",
      ""
    ),
    userId: oneLine(
      source.requesterUserId ||
      source.userId ||
      source.usuarioId ||
      requester.userId ||
      requester.id ||
      raw.requesterUserId ||
      raw.userId ||
      raw.usuarioId ||
      "",
      ""
    ),
  };
}

function technicianAvatarIdentity(detail = {}) {
  const source = object(detail);
  const raw = rawDetail(source);
  const assignment = object(source.assignment || raw.assignment || {});
  const technician = object(
    source.tecnico ||
    source.assignedTo ||
    source.technician ||
    assignment.technician ||
    raw.tecnico ||
    raw.assignedTo ||
    raw.technician ||
    {}
  );

  return {
    name: oneLine(
      source.assignedToName ||
      source.technicianName ||
      source.tecnicoName ||
      assignment.assignedToName ||
      technician.displayName ||
      technician.name ||
      technician.nombre ||
      "Técnico asignado",
      "Técnico asignado"
    ),
    email: oneLine(
      source.assignedToEmail ||
      source.technicianEmail ||
      source.tecnicoEmail ||
      assignment.assignedToEmail ||
      technician.email ||
      technician.emailLower ||
      "",
      ""
    ),
    userId: oneLine(
      source.assignedToUserId ||
      source.technicianUserId ||
      source.tecnicoUserId ||
      assignment.assignedToUserId ||
      assignment.technicianUserId ||
      technician.userId ||
      technician.id ||
      "",
      ""
    ),
  };
}

function avatarIdentityAttributes(identity = {}, source = "") {
  const person = object(identity);
  const attrs = [
    'data-avatar-system="true"',
    'data-avatar-host="true"',
    `data-avatar-contract="${escapeHtml(INCIDENCIAS_DETAIL_AVATAR_UI_VERSION)}"`,
    `data-avatar-identity-source="${escapeHtml(source)}"`,
  ];

  if (person.name) {
    attrs.push(`data-avatar-name="${escapeHtml(person.name)}"`);
  }

  if (person.email) {
    attrs.push(`data-avatar-email="${escapeHtml(person.email)}"`);
  }

  if (person.userId) {
    attrs.push(`data-avatar-user-id="${escapeHtml(person.userId)}"`);
  }

  return attrs.join(" ");
}

function patchAvatarIdentityBoundary(html = "", input = {}) {
  const detail = detailFromInput(input);
  const requester = requesterAvatarIdentity(detail);
  const technician = technicianAvatarIdentity(detail);
  let output = String(html);

  output = output.replace(
    'data-modal-avatar-frame="true"',
    `data-modal-avatar-frame="true"\n        ${avatarIdentityAttributes(
      requester,
      "incidencias-detail-requester"
    )}`
  );

  if (output.includes('data-technician-assigned="true"')) {
    output = output.replace(
      'data-modal-technician-avatar-frame="true"',
      `data-modal-technician-avatar-frame="true"\n          ${avatarIdentityAttributes(
        technician,
        "incidencias-detail-technician"
      )}\n          style="--avatar-size:32px;--avatar-font-size:14px"`
    );
  } else {
    output = output.replace(
      'data-modal-technician-avatar-frame="true"',
      'data-modal-technician-avatar-frame="true"\n          data-avatar-system="off"\n          data-avatar-managed="false"'
    );
  }

  return output;
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

  return {
    total,
    returned,
    truncated: window.truncated === true || total > returned,
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

function timestamp(value = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }

  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeComment(item = {}, index = 0) {
  const source = object(item);
  const kind = commentKind(source);

  if (kind && kind !== "comment" && kind !== "comentario") {
    return null;
  }

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
    sourceIndex: index,
  };
}

export function getIncidenciasDetailComments(input = {}) {
  const detail = detailFromInput(input);
  const raw = object(detail.raw || detail.data || detail.item || detail);
  const timeline = array(detail.timeline?.length ? detail.timeline : raw.timeline);

  let source = [];

  if (timeline.length) {
    source = timeline.filter((entry) => {
      const kind = commentKind(entry);
      return kind === "comment" || kind === "comentario";
    });
  } else {
    for (const candidate of [detail, raw]) {
      for (const alias of ["comments", "notes", "messages"]) {
        const values = array(candidate[alias]);
        if (values.length) {
          source = values;
          break;
        }
      }
      if (source.length) break;
    }
  }

  const unique = new Map();

  source
    .map(normalizeComment)
    .filter(Boolean)
    .forEach((comment) => {
      const identity = oneLine(
        comment.id ||
        `${timestamp(comment.createdAt)}:${comment.author}:${comment.body}`,
        ""
      );

      if (!identity || unique.has(identity)) return;
      unique.set(identity, comment);
    });

  return [...unique.values()].sort(
    (a, b) =>
      timestamp(b.createdAt) - timestamp(a.createdAt) ||
      b.sourceIndex - a.sourceIndex
  );
}

function formatCommentDate(value = null) {
  const at = timestamp(value);
  if (!at) return "Fecha no disponible";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return "Fecha no disponible";
  }
}

function commentSignature(comments = []) {
  return array(comments)
    .map((comment) =>
      [
        oneLine(comment.id, ""),
        text(comment.body, ""),
        timestamp(comment.createdAt),
      ].join("::")
    )
    .join("||");
}

function renderCanonicalFollowup(input = {}) {
  const comments = getIncidenciasDetailComments(input);
  if (!comments.length) return "";

  const signature = commentSignature(comments);

  return `
    <section
      class="incidencias-modal-description-thread"
      data-description-comments="true"
      data-comment-signature="${escapeHtml(signature)}"
      data-comments-ui-version="${INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION}"
      aria-label="Comentarios y seguimiento de la incidencia"
    >
      <div class="incidencias-modal-description-thread-head">
        <strong>Seguimiento</strong>
        <span>${comments.length} comentario${comments.length === 1 ? "" : "s"}</span>
      </div>

      <div class="incidencias-modal-description-comments">
        ${comments.map((comment) => `
          <article
            class="incidencias-modal-description-comment"
            data-description-comment="true"
            data-comment-id="${escapeHtml(comment.id)}"
          >
            <span
              class="incidencias-modal-description-comment-accent"
              aria-hidden="true"
            ></span>

            <div class="incidencias-modal-description-comment-content">
              <div class="incidencias-modal-description-comment-head">
                <strong>${escapeHtml(comment.author)}</strong>
                <span class="incidencias-modal-description-comment-date">
                  ${escapeHtml(formatCommentDate(comment.createdAt))}
                </span>
              </div>

              <p>${escapeHtml(comment.body)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function patchCanonicalFollowupIntoDescription(html = "", input = {}) {
  const followup = renderCanonicalFollowup(input);
  if (!followup) return String(html);

  return String(html).replace(
    /(<p\s+id="incidencias-modal-description"[\s\S]*?<\/p>)(\s*<\/section>)/,
    `$1${followup}$2`
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
    `data-detail-avatar-ui-version="${INCIDENCIAS_DETAIL_AVATAR_UI_VERSION}" ` +
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
  output = patchAvatarIdentityBoundary(output, input);
  output = patchCanonicalFollowupIntoDescription(output, input);

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
      materializesWhenAvailableInTicketBody: true,
      canonicalFollowupMarkup: true,
      aliasCompatible: true,
      timelineCommentCompatible: true,
      liveSyncCompatible: true,
      followupAvatarCompatible: true,
      noFilesSlotCoupling: true,
      noAttachmentMarkupInConversation: true,
      fullHistoryRemainsSeparate: true,
    },
    avatarUi: {
      version: INCIDENCIAS_DETAIL_AVATAR_UI_VERSION,
      requesterUsesOwnIdentity: true,
      technicianUsesOwnIdentity: true,
      technicianSizePx: 32,
      unassignedTechnicianOptOut: true,
      globalAvatarSystem: true,
    },
    policy: {
      ...(snapshot?.policy || {}),
      truthfulBoundedCollections: true,
      historyTotalUsesBackendWindowMetadata: true,
      attachmentsTotalUsesBackendWindowMetadata: true,
      commentsAlwaysVisibleWhenMaterialized: true,
      commentsUseCanonicalFollowupSystem: true,
      commentsNeverShareAttachmentSlot: true,
      noSyntheticTimelineEntries: true,
      requesterAvatarIdentityBoundAtRender: true,
      technicianAvatarIdentityBoundAtRender: true,
      unassignedTechnicianNeverStealsRequesterIdentity: true,
    },
  };
}

export const getSnapshot = getDetailTemplateSnapshot;
export const renderDetailModal = renderIncidenciasDetailModal;
export const renderDetailModalClosed = renderIncidenciasDetailModalClosed;

export default renderIncidenciasDetailModal;
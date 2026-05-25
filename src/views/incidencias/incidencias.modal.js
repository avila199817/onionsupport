/* =========================================================
   Onion Support - Incidencias Modal
   Archivo: /src/views/incidencias/incidencias.modal.js

   Responsabilidad:
   - Modal singleton de detalle de incidencia.
   - Renderizar detalle, comentario, adjuntos y timeline.
   - Delegar acciones operativas a incidencias.actions.js.
   - Delegar normalización a incidencias.model.js.
   - Reutilizar helpers comunes desde incidencias.utils.js.
   - No llamar API directamente.
   - No registrar globals.
   - No crear bridges.
   - No leer Router/Auth/Store.
   - No duplicar lógica de View/Actions/API.
========================================================= */

import {
  normalizeIncidenciaModel,
  getStatusLabel,
  getPriorityLabel,
  getAvatarTheme,
} from "./incidencias.model.js";

import {
  copyTicketIdAction,
  commentTicketAction,
  reopenTicketAction,
  uploadTicketAttachmentsAction,
  openTicketAttachmentAction,
  downloadTicketAttachmentAction,
} from "./incidencias.actions.js";

import {
  BrowserDocument,
  BrowserWindow,

  isObject,
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  first,
  hasOwnKeys,

  escapeHtml,
  normalizeWhitespace,
  normalizeKey,
  getInitials,

  formatBytes,
  formatMoney,
  formatDate,
  formatRelativeDate,
  toTimestamp,

  safeImageSrc,
  safeExternalUrl,
  safeFilename,

  showToast,
  safeEmit,
  getErrorMessage,
} from "./incidencias.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_MODAL_VERSION = "incidencias.modal.v2";

const MODAL_ID = "incidencias-detail-modal-root";
const PANEL_ID = "incidencias-detail-modal-panel";
const DUPLICATE_OPEN_WINDOW_MS = 700;

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isSubmitting: false,

  bindingsAttached: false,
  rootAbortController: null,
  rootCleanups: [],

  lastActiveElement: null,
  escHandler: null,

  commentDraft: "",
  feedbackMessage: "",
  feedbackType: "info",

  pendingFiles: [],

  openingAttachmentId: "",
  downloadingAttachmentId: "",

  previewFile: null,
  previewObjectUrl: "",

  bodyLocked: false,

  openTicketId: "",
  lastOpenAt: 0,
  lastOpenHash: "",
  lastRenderedHash: "",
  renderQueued: false,
};

/* =========================================================
   LOCAL HELPERS
========================================================= */

function isBrowser() {
  return Boolean(BrowserWindow && BrowserDocument);
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function tooltipAttrs(tooltip = "", ariaLabel = "") {
  const cleanTooltip = safeText(tooltip, "");
  const cleanAria = safeText(ariaLabel, cleanTooltip);

  return htmlAttrs({
    "aria-label": cleanAria || false,
    "data-tooltip": cleanTooltip || false,
  });
}

function disabledAttr(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function emit(eventName = "", payload = {}) {
  return safeEmit(eventName, payload);
}

function getObjectHash(value = {}) {
  try {
    const obj = safeObject(value);

    return JSON.stringify({
      id: first(obj.ticketId, obj.id, obj.raw?.ticketId, obj.raw?.id),
      status: first(obj.status, obj.estado, obj.raw?.status, obj.raw?.estado),
      updatedAt: first(obj.updatedAt, obj.lastActivityAt, obj.raw?.updatedAt, obj.raw?.lastActivityAt, obj.raw?._ts),
      attachmentsCount: safeArray(first(obj.attachments, obj.files, obj.adjuntos, obj.raw?.attachments)).length,
      commentsCount: safeArray(first(obj.comments, obj.raw?.comments)).length,
    });
  } catch {
    return String(Date.now());
  }
}

/* =========================================================
   STATE HELPERS
========================================================= */

function setFeedback(message = "", type = "info") {
  modalState.feedbackMessage = safeText(message, "");
  modalState.feedbackType = safeText(type, "info");
}

function clearFeedback() {
  modalState.feedbackMessage = "";
  modalState.feedbackType = "info";
}

function clearAttachmentBusyState() {
  modalState.openingAttachmentId = "";
  modalState.downloadingAttachmentId = "";
}

function revokePreviewObjectUrl() {
  const url = safeText(modalState.previewObjectUrl, "");

  if (!url) return;

  try {
    URL.revokeObjectURL(url);
  } catch {}

  modalState.previewObjectUrl = "";
}

function clearAttachmentPreview() {
  revokePreviewObjectUrl();
  modalState.previewFile = null;
}

function setAttachmentPreview(file = {}) {
  const next = safeObject(file);
  const url = safeExternalUrl(first(next.url, next.viewUrl, next.openUrl, next.downloadUrl, ""));

  if (!url) {
    clearAttachmentPreview();
    return false;
  }

  revokePreviewObjectUrl();

  modalState.previewFile = {
    ...next,
    url,
    viewUrl: safeExternalUrl(first(next.viewUrl, next.openUrl, url)),
    openUrl: safeExternalUrl(first(next.openUrl, next.viewUrl, url)),
    downloadUrl: safeExternalUrl(first(next.downloadUrl, url)),
  };

  if (next.managedObjectUrl) {
    modalState.previewObjectUrl = url;
  }

  return true;
}

function resetTransientStateForNewTicket() {
  modalState.isSubmitting = false;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];
  clearFeedback();
  clearAttachmentBusyState();
  clearAttachmentPreview();
}

/* =========================================================
   FILE HELPERS
========================================================= */

function dedupeFiles(files = []) {
  const map = new Map();

  safeArray(files).forEach((file, index) => {
    if (!isFile(file) && !isBlob(file)) return;

    const key = [
      safeText(file.name, `blob-${index + 1}`),
      safeNumber(file.size, 0),
      safeNumber(file.lastModified, 0),
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) map.set(key, file);
  });

  return Array.from(map.values());
}

/* =========================================================
   DETAIL PICKERS
========================================================= */

function getDetail(detail = {}) {
  const source = safeObject(detail);

  try {
    return normalizeIncidenciaModel(source);
  } catch {
    return source;
  }
}

function getTicketId(detail = {}) {
  return safeText(
    first(
      detail.ticketId,
      detail.id,
      detail.code,
      detail.ticketCode,
      detail.incidenciaId,
      detail.raw?.ticketId,
      detail.raw?.id,
      detail.raw?.code,
      detail.raw?.ticketCode,
      detail.raw?.incidenciaId
    ),
    ""
  );
}

function getDisplayTicketId(detail = {}) {
  return safeText(getTicketId(detail), "—");
}

function getClientName(detail = {}) {
  return safeText(
    first(
      detail.clientName,
      detail.clienteNombre,
      detail.name,
      detail.cliente?.nombre,
      detail.cliente?.name,
      detail.cliente?.displayName,
      detail.client?.name,
      detail.client?.displayName,
      detail.receptor?.name,
      detail.receptor?.nombre,
      detail.createdBy?.name,
      detail.requesterSnapshot?.name,
      detail.requesterSnapshot?.displayName,
      detail.raw?.clientName,
      detail.raw?.clienteNombre,
      detail.raw?.name,
      detail.raw?.cliente?.nombre,
      detail.raw?.cliente?.name,
      detail.raw?.client?.name,
      detail.raw?.receptor?.name,
      detail.raw?.createdBy?.name,
      detail.raw?.requesterSnapshot?.name
    ),
    "Cliente"
  );
}

function getClientAvatar(detail = {}) {
  return safeImageSrc(
    first(
      detail.clientAvatar,
      detail.avatar,
      detail.avatarUrl,
      detail.cliente?.avatar,
      detail.cliente?.avatarUrl,
      detail.client?.avatar,
      detail.client?.avatarUrl,
      detail.requesterSnapshot?.avatar,
      detail.requesterSnapshot?.avatarUrl,
      detail.receptor?.avatar,
      detail.receptor?.avatarUrl,
      detail.raw?.clientAvatar,
      detail.raw?.avatar,
      detail.raw?.avatarUrl,
      detail.raw?.client?.avatar,
      detail.raw?.client?.avatarUrl,
      detail.raw?.cliente?.avatar,
      detail.raw?.cliente?.avatarUrl,
      detail.raw?.requesterSnapshot?.avatar,
      detail.raw?.requesterSnapshot?.avatarUrl
    )
  );
}

function getTitle(detail = {}) {
  return safeText(
    first(
      detail.title,
      detail.subject,
      detail.asunto,
      detail.raw?.title,
      detail.raw?.subject,
      detail.raw?.asunto
    ),
    "Incidencia"
  );
}

function getDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail.descripcion,
      detail.message,
      detail.preview,
      detail.raw?.description,
      detail.raw?.descripcion,
      detail.raw?.message,
      detail.raw?.preview
    ),
    "Sin descripción."
  );
}

function getTecnico(detail = {}) {
  return safeText(
    first(
      detail.technician?.name,
      detail.technician?.nombre,
      detail.technician?.displayName,
      detail.tecnico?.name,
      detail.tecnico?.nombre,
      detail.tecnico?.displayName,
      detail.assignedToName,
      detail.technicianName,
      detail.assignedTo?.name,
      detail.assignedTo?.nombre,
      detail.assignedTo?.displayName,
      detail.assignment?.assignedToName,
      detail.assignment?.technicianName,
      detail.assignment?.agentName,
      detail.assignment?.name,
      detail.raw?.technician?.name,
      detail.raw?.tecnico?.name,
      detail.raw?.tecnico?.nombre,
      detail.raw?.assignedTo?.name,
      detail.raw?.assignedTo?.nombre,
      detail.raw?.assignedToName,
      detail.raw?.technicianName,
      detail.raw?.assignment?.assignedToName,
      detail.raw?.assignment?.agentName,
      detail.raw?.assignment?.name
    ),
    "No asignado"
  );
}

function getTecnicoAvatar(detail = {}) {
  return safeImageSrc(
    first(
      detail.technicianAvatarUrl,
      detail.technicianAvatar,
      detail.assignedToAvatarUrl,
      detail.assignedToAvatar,
      detail.tecnicoAvatarUrl,
      detail.tecnicoAvatar,

      detail.technician?.avatarUrl,
      detail.technician?.avatar,
      detail.tecnico?.avatarUrl,
      detail.tecnico?.avatar,
      detail.assignedTo?.avatarUrl,
      detail.assignedTo?.avatar,

      detail.assignment?.assignedToAvatarUrl,
      detail.assignment?.assignedToAvatar,
      detail.assignment?.technicianAvatarUrl,
      detail.assignment?.technicianAvatar,
      detail.assignment?.avatarUrl,
      detail.assignment?.avatar,

      detail.meta?.technicianAvatarUrl,
      detail.meta?.technicianAvatar,

      detail.raw?.technicianAvatarUrl,
      detail.raw?.technicianAvatar,
      detail.raw?.assignedToAvatarUrl,
      detail.raw?.assignedToAvatar,
      detail.raw?.tecnicoAvatarUrl,
      detail.raw?.tecnicoAvatar,
      detail.raw?.technician?.avatarUrl,
      detail.raw?.tecnico?.avatarUrl,
      detail.raw?.assignedTo?.avatarUrl,
      detail.raw?.assignment?.assignedToAvatarUrl,
      detail.raw?.assignment?.assignedToAvatar,
      detail.raw?.meta?.technicianAvatarUrl,
      detail.raw?.meta?.technicianAvatar
    )
  );
}

function getFacturaRelacionada(detail = {}) {
  const raw = safeObject(detail.raw);
  const linked = safeObject(first(detail.linkedInvoices, raw.linkedInvoices));

  const code = safeText(
    first(
      detail.numeroFacturaLegal,
      detail.numeroFactura,
      detail.invoiceNumber,
      detail.facturaId,
      detail.invoiceId,
      linked.numeroFacturaLegal,
      linked.numeroFactura,
      linked.invoiceNumber,
      linked.primaryInvoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.invoiceNumber,
      raw.facturaId,
      raw.invoiceId
    ),
    ""
  );

  const amount = first(
    detail.facturasTotal,
    detail.invoicesTotal,
    detail.importeFacturas,
    detail.invoiceTotal,
    detail.facturaTotal,
    detail.facturaImporte,
    detail.importeFactura,
    detail.totalFactura,
    detail.invoiceAmount,
    linked.total,
    linked.amount,
    linked.importe,
    detail.meta?.invoiceTotal,
    detail.meta?.invoicesTotal,
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.facturaTotal,
    raw.facturaImporte,
    raw.importeFactura,
    raw.totalFactura,
    raw.invoiceAmount,
    raw.meta?.invoiceTotal,
    raw.meta?.invoicesTotal
  );

  const currency = safeText(
    first(
      detail.currency,
      detail.moneda,
      linked.currency,
      linked.moneda,
      detail.meta?.invoiceCurrency,
      raw.currency,
      raw.moneda,
      raw.meta?.invoiceCurrency,
      "EUR"
    ),
    "EUR"
  );

  const numericAmount = safeNumber(amount, Number.NaN);

  if (code && Number.isFinite(numericAmount)) return `${code} · ${formatMoney(numericAmount, currency)}`;
  if (code) return code;
  if (Number.isFinite(numericAmount)) return formatMoney(numericAmount, currency);

  const paymentStatus = normalizeKey(first(detail.paymentStatus, detail.estadoPago, linked.paymentStatus, linked.estadoPago, raw.paymentStatus, raw.estadoPago));

  if (["paid", "pagada", "pagado", "cobrada"].includes(paymentStatus)) return "Pagado";
  if (["pending", "pendiente"].includes(paymentStatus)) return "Pendiente";
  if (["partial", "parcial"].includes(paymentStatus)) return "Parcial";
  if (["overdue", "vencida"].includes(paymentStatus)) return "Vencido";

  return "No vinculada";
}

function getAttachments(detail = {}) {
  const raw = safeObject(detail.raw);

  return safeArray(
    first(
      detail.attachments,
      detail.files,
      detail.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos
    )
  ).map((file, index) => {
    const item = safeObject(file);
    const itemRaw = safeObject(item.raw);

    const name = safeFilename(
      first(item.name, item.filename, item.fileName, item.title, itemRaw.name, itemRaw.filename, itemRaw.fileName, itemRaw.title),
      `archivo_${index + 1}`
    );

    const id = safeText(
      first(
        item.id,
        item.fileId,
        item.attachmentId,
        item.blobName,
        item.storageKey,
        item.path,
        item.key,
        itemRaw.id,
        itemRaw.fileId,
        itemRaw.attachmentId,
        itemRaw.blobName,
        itemRaw.storageKey,
        itemRaw.path,
        itemRaw.key
      ),
      `attachment-${index + 1}`
    );

    const url = safeExternalUrl(first(item.viewUrl, item.openUrl, item.signedUrl, item.url, item.blobUrl, item.publicUrl, item.downloadUrl, itemRaw.viewUrl, itemRaw.openUrl, itemRaw.signedUrl, itemRaw.url, itemRaw.blobUrl, itemRaw.publicUrl, itemRaw.downloadUrl));

    return {
      ...item,
      id,
      attachmentId: safeText(first(item.attachmentId, itemRaw.attachmentId, id), id),
      name,
      filename: safeFilename(first(item.filename, item.fileName, item.name, itemRaw.filename, itemRaw.fileName, itemRaw.name), name),
      fileName: safeFilename(first(item.fileName, item.filename, item.name, itemRaw.fileName, itemRaw.filename, itemRaw.name), name),
      size: safeNumber(first(item.size, item.sizeBytes, item.contentLength, itemRaw.size, itemRaw.sizeBytes, itemRaw.contentLength), 0),
      type: safeText(first(item.type, item.contentType, item.mimetype, item.mimeType, itemRaw.type, itemRaw.contentType, itemRaw.mimetype, itemRaw.mimeType), ""),
      contentType: safeText(first(item.contentType, item.mimetype, item.mimeType, item.type, itemRaw.contentType, itemRaw.mimetype, itemRaw.mimeType, itemRaw.type), ""),
      uploadedAt: first(item.uploadedAt, item.createdAt, item.date, itemRaw.uploadedAt, itemRaw.createdAt, itemRaw.date, null),
      url,
      viewUrl: safeExternalUrl(first(item.viewUrl, item.openUrl, item.signedUrl, item.url, url)),
      openUrl: safeExternalUrl(first(item.openUrl, item.viewUrl, item.signedUrl, item.url, url)),
      downloadUrl: safeExternalUrl(first(item.downloadUrl, item.signedUrl, item.url, url)),
      raw: {
        ...itemRaw,
        ...item,
      },
    };
  });
}

function normalizeTimelineEntry(entry = {}, index = 0) {
  const item = safeObject(entry);
  const kind = safeText(first(item.kind, item.type === "comment" ? "comment" : "event"), "event");
  const type = safeText(first(item.type, item.action), kind === "comment" ? "comment" : "update");

  const body = safeText(
    first(item.body, item.message, item.text, item.comment, item.description, item.detail),
    kind === "comment" ? "" : "Actualización registrada."
  );

  return {
    id: safeText(first(item.id, item.eventId, item.historyId, item.commentId), `${kind}-${index + 1}`),
    kind,
    type,
    title: safeText(first(item.title, kind === "comment" ? "Comentario" : type === "created" ? "Incidencia creada" : "Actualización"), "Actualización"),
    body,
    author: safeText(first(item.author, item.byName, item.user, item.name, item.createdBy?.name, item.createdBy?.email), kind === "comment" ? "Usuario" : "Sistema"),
    createdAt: first(item.createdAt, item.date, item.timestamp, item.updatedAt, null),
    raw: item,
  };
}

function getTimeline(detail = {}) {
  const raw = safeObject(detail.raw);

  const timeline = safeArray(first(detail.timeline, raw.timeline));

  if (timeline.length) {
    return timeline.map((entry, index) => normalizeTimelineEntry(entry, index));
  }

  const history = safeArray(first(detail.history, raw.history, raw.events));
  const comments = safeArray(first(detail.comments, detail.notes, detail.messages, raw.comments, raw.notes, raw.messages));

  return [
    ...history.map((entry, index) => normalizeTimelineEntry(entry, index)),
    ...comments.map((entry, index) => normalizeTimelineEntry({ ...safeObject(entry), kind: "comment", type: "comment" }, index)),
  ].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

function getStatusClassKey(value = "") {
  const key = normalizeKey(value);

  if (["open", "abierta", "abierto"].includes(key)) return "open";
  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["progress", "in_progress", "inprogress", "en_proceso", "proceso", "working", "trabajando"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado", "archived", "archivada", "cancelled", "canceled"].includes(key)) return "closed";

  return "neutral";
}

function getPriorityClassKey(value = "") {
  const key = normalizeKey(value);

  if (["low", "baja", "minor", "p3"].includes(key)) return "low";
  if (["medium", "media", "normal", "p2"].includes(key)) return "medium";
  if (["high", "alta", "urgent", "urgente", "p1"].includes(key)) return "high";
  if (["critical", "critica", "critico", "crítica", "crítico", "p0"].includes(key)) return "critical";

  return "medium";
}

function getFeedbackClassKey(value = "info") {
  const key = normalizeKey(value);

  if (["success", "ok", "done"].includes(key)) return "success";
  if (["error", "danger", "fail", "failed"].includes(key)) return "error";
  if (["warning", "warn"].includes(key)) return "warning";

  return "info";
}

function isImageLikeAttachment(file = {}) {
  const type = safeText(first(file.contentType, file.type, file.mimeType, file.mimetype, file.raw?.contentType, file.raw?.type, file.raw?.mimeType, file.raw?.mimetype), "").toLowerCase();
  const name = safeText(first(file.filename, file.fileName, file.name, file.raw?.filename, file.raw?.fileName, file.raw?.name), "").toLowerCase();

  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

function isPreviewImage(file = {}) {
  return safeText(first(file.contentType, file.type, file.mimeType, file.mimetype), "").toLowerCase().startsWith("image/");
}

function isPreviewPdf(file = {}) {
  const type = safeText(first(file.contentType, file.type, file.mimeType, file.mimetype), "").toLowerCase();
  const name = safeText(first(file.filename, file.fileName, file.name), "").toLowerCase();

  return type.includes("application/pdf") || name.endsWith(".pdf");
}

/* =========================================================
   RENDER PARTIALS
========================================================= */

function renderChip(label = "", modifier = "neutral") {
  const key = normalizeKey(modifier) || "neutral";

  return `
    <span class="incidencias-modal-chip incidencias-modal-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderInlineSpinner(label = "") {
  return `
    <span class="incidencias-modal-inline-spinner">
      <span aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(detail = {}) {
  const clientName = getClientName(detail);
  const initials = safeText(detail.initials, getInitials(clientName || "ON"));
  const avatarUrl = getClientAvatar(detail);
  const theme = safeText(getAvatarTheme(safeText(first(detail.ticketId, clientName), "onion")), "violet");

  if (avatarUrl) {
    return `
      <div class="incidencias-modal-avatar incidencias-modal-avatar--${escapeHtml(theme)}" ${tooltipAttrs(clientName, clientName)}>
        <div class="incidencias-modal-avatar-frame" data-modal-avatar-frame="true" data-fallback="false">
          <img
            src="${escapeHtml(avatarUrl)}"
            alt="${escapeHtml(clientName)}"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            data-modal-avatar-img="true"
          />
          <span class="incidencias-modal-avatar-fallback">${escapeHtml(initials)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="incidencias-modal-avatar incidencias-modal-avatar--${escapeHtml(theme)}" ${tooltipAttrs(clientName, clientName)}>
      <div class="incidencias-modal-avatar-frame incidencias-modal-avatar-frame--fallback" data-modal-avatar-frame="true" data-fallback="true">
        <span class="incidencias-modal-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    </div>
  `;
}

function renderTechnicianValue(detail = {}) {
  const name = getTecnico(detail);
  const avatarUrl = getTecnicoAvatar(detail);
  const initials = getInitials(name);

  if (!avatarUrl) {
    return `
      <span class="incidencias-modal-technician-inline">
        <span class="incidencias-modal-technician-avatar incidencias-modal-technician-avatar--fallback">${escapeHtml(initials)}</span>
        <strong>${escapeHtml(name)}</strong>
      </span>
    `;
  }

  return `
    <span class="incidencias-modal-technician-inline">
      <span class="incidencias-modal-technician-avatar" data-modal-technician-avatar-frame="true" data-fallback="false">
        <img
          src="${escapeHtml(avatarUrl)}"
          alt=""
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          data-modal-technician-avatar-img="true"
        />
        <span>${escapeHtml(initials)}</span>
      </span>
      <strong>${escapeHtml(name)}</strong>
    </span>
  `;
}

function renderMetaField(label = "", value = "", options = {}) {
  const rawHtml = Boolean(options.html);

  return `
    <div class="incidencias-modal-meta-card">
      <span>${escapeHtml(label)}</span>
      ${rawHtml ? value : `<strong>${escapeHtml(safeText(value, "—"))}</strong>`}
    </div>
  `;
}

function renderFeedbackBox() {
  const message = safeText(modalState.feedbackMessage, "");

  if (!message) return "";

  const type = getFeedbackClassKey(modalState.feedbackType);

  return `
    <div class="incidencias-modal-feedback incidencias-modal-feedback--${escapeHtml(type)}">
      <strong>
        ${
          type === "error"
            ? "No se ha podido completar la acción"
            : type === "success"
              ? "Acción completada"
              : type === "warning"
                ? "Aviso"
                : "Información"
        }
      </strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderPendingFiles() {
  const files = safeArray(modalState.pendingFiles);

  if (!files.length) {
    return `
      <div class="incidencias-modal-pending-empty">
        No has seleccionado archivos nuevos.
      </div>
    `;
  }

  return `
    <div class="incidencias-modal-pending-list">
      ${files.map((file, index) => `
        <div class="incidencias-modal-pending-file">
          <div>
            <strong>${escapeHtml(safeFilename(file.name || `archivo_${index + 1}`, `archivo_${index + 1}`))}</strong>
            <span>${escapeHtml([safeText(file.type, ""), formatBytes(file.size)].filter(Boolean).join(" · ") || "Archivo preparado")}</span>
          </div>

          <button type="button" data-modal-action="remove-pending-file" data-file-index="${escapeHtml(String(index))}">
            Quitar
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderComposer() {
  const draft = modalState.commentDraft || "";
  const disabled = disabledAttr(modalState.isSubmitting, modalState.isSubmitting);

  return `
    <section class="incidencias-modal-composer">
      <div class="incidencias-modal-composer-head">
        <div class="incidencias-modal-composer-icon" aria-hidden="true">+</div>
        <div class="incidencias-modal-composer-copy">
          <h3>Añadir comentario y adjuntos</h3>
          <span>Redacta la actualización y adjunta archivos en este mismo bloque.</span>
        </div>
      </div>

      <textarea
        id="incidencias-modal-comment-input"
        data-modal-field="comment"
        placeholder="Ejemplo: He probado de nuevo y adjunto captura..."
        ${disabled}
        class="incidencias-modal-comment-textarea"
      >${escapeHtml(draft)}</textarea>

      <div class="incidencias-modal-composer-foot">
        <span>Al pulsar “Actualizar incidencia”, se enviará esta información y la incidencia volverá a estado abierta.</span>
      </div>

      <label for="incidencias-modal-attachments-input" class="incidencias-modal-dropzone">
        <input
          id="incidencias-modal-attachments-input"
          type="file"
          data-modal-field="attachments"
          multiple
          ${disabled}
        />
        <span>Seleccionar archivos</span>
        <small>Imágenes, PDFs y documentos de soporte</small>
      </label>

      ${renderPendingFiles()}
    </section>
  `;
}

function renderAttachmentIconSvg(kind = "view") {
  if (kind === "download") {
    return `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" class="incidencias-modal-svg-icon">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    `;
  }

  return `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" class="incidencias-modal-svg-icon">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="2" />
    </svg>
  `;
}

function getAttachmentBusyMeta(file = {}) {
  const attachmentId = safeText(file.id, "");

  return {
    attachmentId,
    isOpening: Boolean(attachmentId && modalState.openingAttachmentId === attachmentId),
    isDownloading: Boolean(attachmentId && modalState.downloadingAttachmentId === attachmentId),
  };
}

function renderAttachmentActionButtons(file = {}) {
  const busy = getAttachmentBusyMeta(file);
  const isImage = isImageLikeAttachment(file);
  const name = safeFilename(file.name || file.filename || "archivo", "archivo");

  return `
    <div class="incidencias-modal-attachment-actions">
      <button
        type="button"
        data-modal-action="open-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        ${disabledAttr(busy.isOpening || modalState.isSubmitting, busy.isOpening)}
        class="incidencias-modal-view-btn"
        ${tooltipAttrs(isImage ? "Ampliar imagen" : "Ver documento", `${isImage ? "Ampliar imagen" : "Ver documento"} ${name}`)}
      >
        ${
          busy.isOpening
            ? renderInlineSpinner("Abriendo...")
            : `<span class="incidencias-modal-action-icon">${renderAttachmentIconSvg("view")}</span><span>${isImage ? "Ampliar" : "Ver"}</span>`
        }
      </button>

      <button
        type="button"
        data-modal-action="download-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        ${disabledAttr(busy.isDownloading || modalState.isSubmitting, busy.isDownloading)}
        class="incidencias-modal-download-btn"
        ${tooltipAttrs("Descargar", `Descargar ${name}`)}
      >
        ${
          busy.isDownloading
            ? renderInlineSpinner("Bajando...")
            : `<span class="incidencias-modal-action-icon">${renderAttachmentIconSvg("download")}</span><span>Descargar</span>`
        }
      </button>
    </div>
  `;
}

function renderAttachmentPreviewSquare(file = {}) {
  const isImage = isImageLikeAttachment(file);
  const url = isImage
    ? safeImageSrc(first(file.viewUrl, file.openUrl, file.signedUrl, file.url, file.blobUrl, file.publicUrl))
    : "";
  const name = safeFilename(file.name || file.filename || "archivo", "archivo");

  if (!isImage || !url) {
    return `
      <button
        type="button"
        data-modal-action="open-attachment"
        data-attachment-id="${escapeHtml(file.id)}"
        class="incidencias-modal-file-square${isImage ? " incidencias-modal-file-square--image" : ""}"
        aria-label="Ver ${escapeHtml(name)}"
      >
        <span>${isImage ? "IMG" : "DOC"}</span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      data-modal-action="open-attachment"
      data-attachment-id="${escapeHtml(file.id)}"
      class="incidencias-modal-image-thumb-wrap"
      aria-label="Ampliar ${escapeHtml(name)}"
      data-modal-thumb-frame="true"
      data-thumb-error="false"
    >
      <img
        src="${escapeHtml(url)}"
        alt="${escapeHtml(name)}"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        class="incidencias-modal-image-thumb"
        data-modal-thumb-img="true"
      />
      <span class="incidencias-modal-image-thumb-fallback">IMG</span>
      <span class="incidencias-modal-image-open-badge">Ampliar</span>
    </button>
  `;
}

function renderAttachments(detail = {}) {
  const files = getAttachments(detail);

  return `
    <div class="incidencias-modal-files-block incidencias-modal-files-block--compact">
      <section class="incidencias-modal-current-files">
        <div class="incidencias-modal-section-head">
          <h3>Documentos actuales</h3>
          <span>${escapeHtml(String(files.length))} adjunto${files.length === 1 ? "" : "s"}</span>
        </div>

        ${
          !files.length
            ? `<div class="incidencias-modal-empty-box">No hay archivos adjuntos en esta incidencia.</div>`
            : `
              <div class="incidencias-modal-attachments-grid">
                ${files.map((file) => {
                  const name = safeFilename(file.name || file.filename || "Archivo", "Archivo");

                  return `
                    <article class="incidencias-modal-attachment-card">
                      <div class="incidencias-modal-attachment-row">
                        ${renderAttachmentPreviewSquare(file)}

                        <div class="incidencias-modal-attachment-copy">
                          <strong>${escapeHtml(name)}</strong>
                          <span>${escapeHtml([file.contentType || file.type, formatBytes(file.size), file.uploadedAt ? formatDate(file.uploadedAt) : ""].filter(Boolean).join(" · ") || "Archivo adjunto")}</span>
                        </div>

                        ${renderAttachmentActionButtons(file)}
                      </div>
                    </article>
                  `;
                }).join("")}
              </div>
            `
        }
      </section>
    </div>
  `;
}

function renderAttachmentPreview() {
  const file = safeObject(modalState.previewFile);
  const url = safeExternalUrl(file.url || file.viewUrl || file.openUrl || file.downloadUrl);

  if (!url) return "";

  const filename = safeFilename(first(file.filename, file.name), "Documento");
  const type = safeText(first(file.contentType, file.type, file.mimeType, file.mimetype), "");
  const size = formatBytes(file.size);
  const image = isPreviewImage(file);
  const pdf = isPreviewPdf(file);
  const meta = [type || "Vista previa", size].filter(Boolean).join(" · ");

  return `
    <section class="incidencias-modal-preview">
      <div class="incidencias-modal-preview-head">
        <div class="incidencias-modal-preview-copy">
          <strong>${escapeHtml(filename)}</strong>
          <span>${escapeHtml(meta || "Documento preparado")}</span>
        </div>

        <div class="incidencias-modal-preview-actions">
          ${
            !image
              ? `<button type="button" data-modal-action="download-preview" class="incidencias-modal-preview-btn">Descargar</button>`
              : ""
          }

          <button type="button" data-modal-action="close-preview" class="incidencias-modal-preview-btn" aria-label="Cerrar vista previa">
            Cerrar vista
          </button>
        </div>
      </div>

      <div class="incidencias-modal-preview-frame ${image ? "is-image" : ""}">
        ${
          image
            ? `<img src="${escapeHtml(safeImageSrc(url))}" alt="${escapeHtml(filename)}" class="incidencias-modal-preview-image" />`
            : `<iframe src="${escapeHtml(url)}" title="${escapeHtml(filename)}" class="incidencias-modal-preview-iframe" loading="lazy" referrerpolicy="no-referrer"></iframe>`
        }
      </div>

      ${
        !image && !pdf
          ? `<p class="incidencias-modal-preview-note">Si el navegador no puede previsualizar este tipo de archivo, usa “Descargar”.</p>`
          : ""
      }
    </section>
  `;
}

function renderTimeline(detail = {}) {
  const timeline = getTimeline(detail);

  if (!timeline.length) {
    return `<div class="incidencias-timeline-empty">Sin actividad</div>`;
  }

  return `
    <div class="incidencias-timeline-list">
      ${timeline.map((entry) => {
        const kind = safeText(entry.kind, "event");
        const type = safeText(entry.type, "update");
        const isComment = kind === "comment";
        const isCreated = type === "created";
        const title = safeText(entry.title, isComment ? "Comentario" : isCreated ? "Incidencia creada" : "Actualización");
        const body = safeText(entry.body, "Actualización registrada.");

        return `
          <article class="incidencias-timeline-card ${isComment ? "is-comment" : ""} ${isCreated ? "is-created" : ""}">
            <div class="incidencias-timeline-accent"></div>
            <div class="incidencias-timeline-main">
              <div class="incidencias-timeline-title-row">
                <strong class="incidencias-timeline-title">${escapeHtml(title)}</strong>
                <span class="incidencias-timeline-kind">${escapeHtml(isComment ? "Comentario" : isCreated ? "Sistema" : "Cambio")}</span>
              </div>
              <p class="incidencias-timeline-body">${escapeHtml(body)}</p>
            </div>
            <div class="incidencias-timeline-meta">
              <strong>${escapeHtml(safeText(entry.author, "Sistema"))}</strong>
              <span>${escapeHtml(formatDate(entry.createdAt))}</span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderLoadingOverlay(label = "Procesando...") {
  return `
    <div class="incidencias-modal-loading-overlay">
      <div class="incidencias-modal-loading-box">
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

function renderFooter(detail = {}) {
  const ticketId = getDisplayTicketId(detail);

  return `
    <footer class="incidencias-modal-footer">
      <button
        type="button"
        data-modal-action="submit-update"
        data-ticket-id="${escapeHtml(ticketId)}"
        ${disabledAttr(modalState.isSubmitting, modalState.isSubmitting)}
        class="incidencias-modal-submit-btn"
      >
        ${modalState.isSubmitting ? renderInlineSpinner("Actualizando...") : "Actualizar incidencia"}
      </button>
    </footer>
  `;
}

/* =========================================================
   MODAL RENDER
========================================================= */

function renderModalInner(detail = {}) {
  const item = getDetail(detail);
  const ticketId = getDisplayTicketId(item);
  const title = getTitle(item);
  const description = getDescription(item);
  const facturaRelacionada = getFacturaRelacionada(item);
  const createdAt = formatDate(first(item.createdAt, item.raw?.createdAt));
  const updatedAgo = formatRelativeDate(first(item.updatedAt, item.lastActivityAt, item.raw?.updatedAt, item.raw?.lastActivityAt, item.raw?.createdAt));
  const attachments = getAttachments(item);

  const statusRaw = safeText(first(item.status, item.raw?.status, item.raw?.estado), "open");
  const priorityRaw = safeText(first(item.priority, item.raw?.priority, item.raw?.prioridad), "medium");

  const statusLabel = getStatusLabel(statusRaw);
  const priorityLabel = getPriorityLabel(priorityRaw);
  const statusClass = getStatusClassKey(statusRaw);
  const priorityClass = getPriorityClassKey(priorityRaw);
  const busyLabel = modalState.isSubmitting ? "Actualizando incidencia..." : "";

  return `
    <div data-incidencias-modal-overlay="true" class="incidencias-modal-overlay">
      <div
        id="${PANEL_ID}"
        data-incidencias-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-modal-title"
        tabindex="-1"
        class="incidencias-modal-panel"
      >
        ${busyLabel ? renderLoadingOverlay(busyLabel) : ""}

        <header class="incidencias-modal-header">
          <div class="incidencias-modal-hero">
            ${renderAvatar(item)}

            <div class="incidencias-modal-hero-content">
              <div class="incidencias-modal-hero-chips">
                <button
                  type="button"
                  data-modal-action="copy"
                  data-ticket-id="${escapeHtml(ticketId)}"
                  class="incidencias-modal-id-chip"
                  ${tooltipAttrs("Copiar ID", "Copiar ID")}
                >
                  ${escapeHtml(ticketId)}
                </button>

                ${renderChip(statusLabel, `status-${statusClass}`)}
                ${renderChip(priorityLabel, `priority-${priorityClass}`)}
              </div>

              <h2 id="incidencias-modal-title" class="incidencias-modal-title">
                ${escapeHtml(title)}
              </h2>

              <span class="incidencias-modal-updated">
                Última actualización ${escapeHtml(updatedAgo)}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${disabledAttr(modalState.isSubmitting, modalState.isSubmitting)}
            class="incidencias-modal-close-btn"
          >
            ✕
          </button>
        </header>

        <main class="incidencias-modal-body">
          ${renderFeedbackBox()}
          ${renderAttachmentPreview()}

          <div class="incidencias-modal-meta-grid">
            ${renderMetaField("Técnico", renderTechnicianValue(item), { html: true })}
            ${renderMetaField("Factura", facturaRelacionada)}
            ${renderMetaField("Creada", createdAt)}
            ${renderMetaField("Adjuntos", String(attachments.length))}
          </div>

          <section class="incidencias-modal-description-section">
            <div class="incidencias-modal-section-head">
              <h3>Descripción de la incidencia</h3>
            </div>
            <div class="incidencias-modal-description-box">${escapeHtml(description)}</div>
          </section>

          ${renderComposer(item)}
          ${renderAttachments(item)}

          <section class="incidencias-modal-history-section">
            <div class="incidencias-modal-section-head">
              <h3>Historial y actividad</h3>
            </div>
            ${renderTimeline(item)}
          </section>

          ${renderFooter(item)}
        </main>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  if (!isBrowser()) return null;
  return BrowserDocument.getElementById(MODAL_ID);
}

function ensureRoot() {
  if (!isBrowser()) return null;

  const existing = Array.from(BrowserDocument.querySelectorAll(`#${MODAL_ID}`));
  let root = existing[0];

  existing.slice(1).forEach((duplicate) => {
    try {
      duplicate.remove();
    } catch {}
  });

  if (root) return root;

  root = BrowserDocument.createElement("div");
  root.id = MODAL_ID;
  BrowserDocument.body.appendChild(root);

  return root;
}

function lockBody() {
  if (!isBrowser() || !BrowserDocument.body) return false;
  if (modalState.bodyLocked) return true;

  try {
    BrowserDocument.body.classList.add("modal-open", "incidencias-modal-open");
  } catch {}

  modalState.bodyLocked = true;
  return true;
}

function unlockBody() {
  if (!isBrowser() || !BrowserDocument.body) return false;
  if (!modalState.bodyLocked) return true;

  try {
    BrowserDocument.body.classList.remove("modal-open", "incidencias-modal-open");
  } catch {}

  modalState.bodyLocked = false;

  return true;
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

function detachEscHandler() {
  if (!modalState.escHandler || !isBrowser()) return;

  try {
    BrowserDocument.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  if (!isBrowser()) return;

  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape" && !modalState.isSubmitting) {
      closeIncidenciasModal();
    }
  };

  try {
    BrowserDocument.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

function focusPanel() {
  try {
    BrowserDocument.getElementById(PANEL_ID)?.focus?.();
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function getRenderHash() {
  return [
    getObjectHash(modalState.detail),
    modalState.isSubmitting ? "submitting" : "idle",
    modalState.feedbackType,
    modalState.feedbackMessage,
    modalState.commentDraft,
    modalState.pendingFiles.map((file) => `${file.name || "blob"}:${file.size || 0}`).join("|"),
    modalState.openingAttachmentId,
    modalState.downloadingAttachmentId,
    safeText(modalState.previewFile?.url, ""),
  ].join("::");
}

function renderModal({ preserveFocus = true } = {}) {
  const root = ensureRoot();

  if (!root) return null;

  if (!modalState.detail) {
    detachRootBindings();
    root.innerHTML = "";
    modalState.lastRenderedHash = "";
    return root;
  }

  const renderHash = getRenderHash();

  if (renderHash === modalState.lastRenderedHash && root.innerHTML) {
    attachRootBindings();
    return root;
  }

  const activeId = preserveFocus ? safeText(BrowserDocument?.activeElement?.id, "") : "";

  detachRootBindings();
  root.innerHTML = renderModalInner(modalState.detail);
  modalState.lastRenderedHash = renderHash;
  modalState.bindingsAttached = false;

  attachRootBindings();

  if (activeId) {
    try {
      BrowserDocument.getElementById(activeId)?.focus?.();
    } catch {}
  }

  return root;
}

function scheduleModalRender() {
  if (modalState.renderQueued) return;

  modalState.renderQueued = true;

  const run = () => {
    modalState.renderQueued = false;
    if (!modalState.isOpen) return;

    renderModal({ preserveFocus: true });
  };

  try {
    BrowserWindow?.requestAnimationFrame?.(run) || setTimeout(run, 0);
  } catch {
    setTimeout(run, 0);
  }
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

function shouldIgnoreDuplicateOpen(ticketId = "", detail = {}) {
  const id = safeText(ticketId, "");
  if (!id || !modalState.isOpen) return false;

  const now = Date.now();
  const hash = getObjectHash(detail);

  const sameTicket = id === modalState.openTicketId;
  const sameHash = hash === modalState.lastOpenHash;
  const tooSoon = now - safeNumber(modalState.lastOpenAt, 0) < DUPLICATE_OPEN_WINDOW_MS;

  return sameTicket && (sameHash || tooSoon);
}

export function openIncidenciasModal(detail = {}, options = {}) {
  if (!isBrowser()) return false;

  const nextDetail = getDetail(detail);
  const ticketId = getTicketId(nextDetail);
  const now = Date.now();
  const hash = getObjectHash(nextDetail);

  if (shouldIgnoreDuplicateOpen(ticketId, nextDetail)) {
    if (modalState.isOpen && ticketId === modalState.openTicketId) {
      updateIncidenciasModal(nextDetail, {
        silent: true,
        preserveTransient: true,
        preserveFocus: true,
        focus: false,
      });
    }

    return true;
  }

  const wasOpen = modalState.isOpen;
  const previousTicketId = modalState.openTicketId;
  const newTicket = ticketId && ticketId !== previousTicketId;

  if (!wasOpen) {
    modalState.lastActiveElement = BrowserDocument.activeElement || null;
  }

  modalState.detail = nextDetail;
  modalState.isOpen = true;
  modalState.openTicketId = ticketId;
  modalState.lastOpenAt = now;
  modalState.lastOpenHash = hash;

  if (!wasOpen || newTicket) {
    resetTransientStateForNewTicket();
  }

  renderModal({ preserveFocus: wasOpen });
  lockBody();
  attachEscHandler();

  if (!wasOpen) focusPanel();

  if (!options.silent && !wasOpen) {
    emit("incidencias:modal:opened", {
      detail: modalState.detail,
      ticketId,
    });
  }

  return true;
}

export function closeIncidenciasModal(options = {}) {
  if (modalState.isSubmitting && !options.force) return false;

  const root = getRoot();

  modalState.isOpen = false;
  modalState.isSubmitting = false;
  modalState.detail = null;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];
  modalState.openTicketId = "";
  modalState.lastOpenHash = "";
  modalState.lastRenderedHash = "";
  modalState.renderQueued = false;

  clearFeedback();
  clearAttachmentBusyState();
  clearAttachmentPreview();

  detachRootBindings();

  if (root) root.innerHTML = "";

  unlockBody();
  detachEscHandler();

  if (!options.skipFocusRestore) restoreFocus();

  if (!options.silent) emit("incidencias:modal:closed", {});

  return true;
}

export function updateIncidenciasModal(detail = {}, options = {}) {
  const nextDetail = getDetail(detail);
  const ticketId = getTicketId(nextDetail);

  if (!modalState.isOpen) {
    return openIncidenciasModal(nextDetail, options);
  }

  const sameTicket = ticketId && ticketId === modalState.openTicketId;

  modalState.detail = nextDetail;
  modalState.openTicketId = ticketId || modalState.openTicketId;
  modalState.lastOpenHash = getObjectHash(nextDetail);

  if (!sameTicket || options.preserveTransient === false) {
    resetTransientStateForNewTicket();
  } else {
    clearAttachmentBusyState();
  }

  renderModal({ preserveFocus: options.preserveFocus !== false });

  if (options.focus !== false) focusPanel();

  return true;
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function waitForPaint() {
  return new Promise((resolve) => {
    try {
      BrowserWindow?.requestAnimationFrame?.(() => BrowserWindow.requestAnimationFrame(resolve));
    } catch {
      setTimeout(resolve, 0);
    }
  });
}

async function handleCopy(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    setFeedback("No hay ID disponible para copiar.", "error");
    renderModal();
    return false;
  }

  const copied = await copyTicketIdAction({
    ticketId: id,
    silent: true,
  });

  if (copied) {
    setFeedback(`ID ${id} copiado al portapapeles.`, "success");
    showToast("ID copiado", "success");
  } else {
    setFeedback(`No se pudo copiar automáticamente el ID ${id}.`, "warning");
    showToast("No se pudo copiar el ID.", "warning");
  }

  renderModal();
  return copied;
}

async function handleSubmitUpdate(ticketId = "") {
  if (modalState.isSubmitting) return false;

  const id = safeText(ticketId, "");
  const message = normalizeWhitespace(modalState.commentDraft);
  const files = dedupeFiles(modalState.pendingFiles);

  if (!id) {
    setFeedback("No se ha podido identificar la incidencia.", "error");
    renderModal();
    return false;
  }

  if (!message && !files.length) {
    setFeedback("Añade una actualización o selecciona al menos un archivo antes de continuar.", "error");
    renderModal();
    return false;
  }

  if (message && message.length < 4) {
    setFeedback("Añade un poco más de detalle antes de enviar la actualización.", "error");
    renderModal();
    return false;
  }

  modalState.isSubmitting = true;
  clearFeedback();
  renderModal();

  await waitForPaint();

  try {
    let nextDetail = getDetail(modalState.detail);

    if (files.length) {
      const uploadDetail = await uploadTicketAttachmentsAction({
        ticketId: id,
        files,
        detail: nextDetail,
        status: "open",
        silent: true,
      });

      if (uploadDetail) nextDetail = getDetail(uploadDetail);
    }

    if (message) {
      const commentDetail = await commentTicketAction({
        ticketId: id,
        message,
        detail: nextDetail,
        status: "open",
        silent: true,
      });

      if (commentDetail) nextDetail = getDetail(commentDetail);
    } else if (files.length) {
      const reopenedDetail = await reopenTicketAction({
        ticketId: id,
        detail: nextDetail,
        silent: true,
      });

      if (reopenedDetail) nextDetail = getDetail(reopenedDetail);
    }

    modalState.detail = getDetail(nextDetail);
    modalState.commentDraft = "";
    modalState.pendingFiles = [];

    if (message && files.length) {
      setFeedback("La actualización y los documentos se han enviado correctamente. La incidencia vuelve a abierta.", "success");
    } else if (message) {
      setFeedback("Tu actualización se ha añadido correctamente y la incidencia vuelve a abierta.", "success");
    } else {
      setFeedback("Los documentos se han añadido correctamente y la incidencia vuelve a abierta.", "success");
    }

    showToast("Incidencia actualizada", "success");

    emit("incidencias:modal:updated", {
      ticketId: id,
      detail: modalState.detail,
    });

    emit("incidencias:ticket:updated", {
      ticketId: id,
      detail: modalState.detail,
    });

    return true;
  } catch (error) {
    const messageError = getErrorMessage(error, "No se pudo actualizar la incidencia.");

    setFeedback(messageError, "error");
    showToast(messageError, "error");

    emit("incidencias:modal:update:error", {
      ticketId: id,
      error,
    });

    return false;
  } finally {
    modalState.isSubmitting = false;
    renderModal();
    focusPanel();
  }
}

function getAttachmentById(attachmentId = "") {
  const id = safeText(attachmentId, "");

  return getAttachments(modalState.detail).find((file) => safeText(file.id, "") === id) || null;
}

async function handleAttachmentAction(attachmentId = "", mode = "download") {
  const finalMode = mode === "open" ? "open" : "download";
  const attachment = getAttachmentById(attachmentId);
  const ticketId = getTicketId(modalState.detail);

  if (!attachment) {
    setFeedback("No se ha encontrado el adjunto solicitado.", "error");
    showToast("Adjunto no encontrado.", "error");
    renderModal();
    return false;
  }

  if (finalMode === "download") {
    modalState.downloadingAttachmentId = safeText(attachment.id, "");
  } else {
    modalState.openingAttachmentId = safeText(attachment.id, "");
  }

  renderModal();

  try {
    if (finalMode === "download") {
      const file = await downloadTicketAttachmentAction({
        ticketId,
        attachment,
        attachmentId,
        detail: modalState.detail,
        silent: true,
        autoDownload: true,
      });

      if (!file) throw new Error("ATTACHMENT_DOWNLOAD_FAILED");

      showToast("Descarga iniciada.", "success");
      return true;
    }

    const file = await openTicketAttachmentAction({
      ticketId,
      attachment,
      attachmentId,
      detail: modalState.detail,
      silent: true,
      autoOpen: false,
    });

    if (!file?.url) throw new Error("ATTACHMENT_OPEN_FAILED");

    setAttachmentPreview(file);
    showToast("Documento cargado en la vista.", "success");
    return true;
  } catch (error) {
    const message = getErrorMessage(
      error,
      finalMode === "download"
        ? "No se pudo descargar el adjunto."
        : "No se pudo cargar el adjunto en la vista."
    );

    setFeedback(message, "error");
    showToast(message, "error");
    return false;
  } finally {
    clearAttachmentBusyState();
    renderModal();
    focusPanel();
  }
}

function downloadResolvedPreviewFile() {
  const file = safeObject(modalState.previewFile);
  const url = safeExternalUrl(file.downloadUrl || file.url);

  if (!url || !isBrowser()) return false;

  try {
    const anchor = BrowserDocument.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    anchor.target = "_blank";
    anchor.download = safeFilename(first(file.filename, file.fileName, file.name), "archivo");
    anchor.className = "incidencias-modal-hidden-download-link";

    BrowserDocument.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function addRootListener(root, eventName, handler, options = {}) {
  if (!root || typeof root.addEventListener !== "function") return false;

  try {
    root.addEventListener(eventName, handler, options);

    if (!options.signal) {
      modalState.rootCleanups.push(() => {
        try {
          root.removeEventListener(eventName, handler, options);
        } catch {}
      });
    }

    return true;
  } catch {
    return false;
  }
}

function bindImageFallbacks(root) {
  root.querySelectorAll("[data-modal-avatar-img='true']").forEach((img) => {
    if (img.dataset.modalFallbackBound === "true") return;

    img.dataset.modalFallbackBound = "true";

    const frame = img.closest("[data-modal-avatar-frame='true']");

    const setFallback = () => {
      if (frame) {
        frame.setAttribute("data-fallback", "true");
        frame.classList.add("incidencias-modal-avatar-frame--fallback");
      }

      try {
        img.hidden = true;
      } catch {}
    };

    addRootListener(img, "error", setFallback, {
      passive: true,
      signal: modalState.rootAbortController?.signal,
    });

    if (img.complete && img.naturalWidth === 0) setFallback();
  });

  root.querySelectorAll("[data-modal-technician-avatar-img='true']").forEach((img) => {
    if (img.dataset.modalTechnicianFallbackBound === "true") return;

    img.dataset.modalTechnicianFallbackBound = "true";

    const frame = img.closest("[data-modal-technician-avatar-frame='true']");

    const setFallback = () => {
      if (frame) {
        frame.setAttribute("data-fallback", "true");
        frame.classList.add("incidencias-modal-technician-avatar--fallback");
      }

      try {
        img.hidden = true;
      } catch {}
    };

    addRootListener(img, "error", setFallback, {
      passive: true,
      signal: modalState.rootAbortController?.signal,
    });

    if (img.complete && img.naturalWidth === 0) setFallback();
  });

  root.querySelectorAll("[data-modal-thumb-img='true']").forEach((img) => {
    if (img.dataset.modalThumbFallbackBound === "true") return;

    img.dataset.modalThumbFallbackBound = "true";

    const frame = img.closest("[data-modal-thumb-frame='true']");

    const setFallback = () => {
      if (frame) frame.setAttribute("data-thumb-error", "true");
      try {
        img.hidden = true;
      } catch {}
    };

    addRootListener(img, "error", setFallback, {
      passive: true,
      signal: modalState.rootAbortController?.signal,
    });

    if (img.complete && img.naturalWidth === 0) setFallback();
  });
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    const root = getRoot();
    if (root) bindImageFallbacks(root);
    return;
  }

  const root = ensureRoot();
  if (!root) return;

  detachRootBindings();

  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;

  modalState.rootAbortController = controller;
  modalState.rootCleanups = [];

  const listenerOptions = controller
    ? { signal: controller.signal }
    : {};

  const onInput = (event) => {
    const field = event.target?.closest?.("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "comment") {
      modalState.commentDraft = field.value || "";
    }
  };

  const onChange = (event) => {
    const field = event.target?.closest?.("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "attachments") {
      modalState.pendingFiles = dedupeFiles([
        ...safeArray(modalState.pendingFiles),
        ...Array.from(field.files || []),
      ]);

      renderModal();
      focusPanel();
    }
  };

  const onClick = async (event) => {
    const target = event.target;
    if (!target?.closest) return;

    const closeButton = target.closest("[data-modal-close='true']");

    if (closeButton) {
      event.preventDefault();
      if (!modalState.isSubmitting) closeIncidenciasModal();
      return;
    }

    const copyButton = target.closest('[data-modal-action="copy"]');

    if (copyButton) {
      event.preventDefault();
      await handleCopy(copyButton.dataset.ticketId || "");
      return;
    }

    const submitButton = target.closest('[data-modal-action="submit-update"]');

    if (submitButton) {
      event.preventDefault();
      await handleSubmitUpdate(submitButton.dataset.ticketId || "");
      return;
    }

    const openAttachmentButton = target.closest('[data-modal-action="open-attachment"]');

    if (openAttachmentButton) {
      event.preventDefault();
      await handleAttachmentAction(openAttachmentButton.dataset.attachmentId || "", "open");
      return;
    }

    const downloadAttachmentButton = target.closest('[data-modal-action="download-attachment"]');

    if (downloadAttachmentButton) {
      event.preventDefault();
      await handleAttachmentAction(downloadAttachmentButton.dataset.attachmentId || "", "download");
      return;
    }

    const closePreviewButton = target.closest('[data-modal-action="close-preview"]');

    if (closePreviewButton) {
      event.preventDefault();
      clearAttachmentPreview();
      renderModal();
      focusPanel();
      return;
    }

    const downloadPreviewButton = target.closest('[data-modal-action="download-preview"]');

    if (downloadPreviewButton) {
      event.preventDefault();

      if (downloadResolvedPreviewFile()) {
        showToast("Descarga iniciada.", "success");
      } else {
        showToast("No se pudo descargar el documento.", "error");
      }

      return;
    }

    const removePendingButton = target.closest('[data-modal-action="remove-pending-file"]');

    if (removePendingButton) {
      event.preventDefault();

      const index = safeNumber(removePendingButton.dataset.fileIndex, -1);

      if (index >= 0) {
        modalState.pendingFiles = safeArray(modalState.pendingFiles).filter((_, currentIndex) => currentIndex !== index);
        renderModal();
        focusPanel();
      }

      return;
    }

    const overlay = target.closest("[data-incidencias-modal-overlay='true']");
    const panel = target.closest("[data-incidencias-modal-panel='true']");

    if (overlay && !panel && target === overlay && !modalState.isSubmitting) {
      closeIncidenciasModal();
    }
  };

  addRootListener(root, "input", onInput, listenerOptions);
  addRootListener(root, "change", onChange, listenerOptions);
  addRootListener(root, "click", onClick, listenerOptions);

  modalState.bindingsAttached = true;
  bindImageFallbacks(root);
}

function detachRootBindings() {
  try {
    modalState.rootAbortController?.abort?.();
  } catch {}

  safeArray(modalState.rootCleanups).forEach((cleanup) => {
    try {
      cleanup();
    } catch {}
  });

  modalState.rootCleanups = [];
  modalState.rootAbortController = null;
  modalState.bindingsAttached = false;
}

/* =========================================================
   PUBLIC API
========================================================= */

export const OnionIncidenciasModal = Object.freeze({
  version: INCIDENCIAS_MODAL_VERSION,

  open(detail = {}, options = {}) {
    return openIncidenciasModal(detail, options);
  },

  close(options = {}) {
    return closeIncidenciasModal(options);
  },

  update(detail = {}, options = {}) {
    return updateIncidenciasModal(detail, options);
  },

  render() {
    if (!modalState.isOpen) return null;
    return renderModal({ preserveFocus: true });
  },

  scheduleRender() {
    scheduleModalRender();
    return true;
  },

  setFeedback(message = "", type = "info") {
    setFeedback(message, type);

    if (modalState.isOpen) renderModal();

    return true;
  },

  clearFeedback() {
    clearFeedback();

    if (modalState.isOpen) renderModal();

    return true;
  },

  getState() {
    return {
      isOpen: modalState.isOpen,
      isSubmitting: modalState.isSubmitting,
      openTicketId: modalState.openTicketId,
      detail: modalState.detail ? { ...modalState.detail } : null,
      commentDraft: modalState.commentDraft,
      feedbackMessage: modalState.feedbackMessage,
      feedbackType: modalState.feedbackType,
      pendingFiles: [...safeArray(modalState.pendingFiles)],
      openingAttachmentId: modalState.openingAttachmentId,
      downloadingAttachmentId: modalState.downloadingAttachmentId,
      previewFile: modalState.previewFile ? { ...modalState.previewFile } : null,
      bodyLocked: modalState.bodyLocked,
      bindingsAttached: modalState.bindingsAttached,
    };
  },

  destroy(options = {}) {
    closeIncidenciasModal({
      force: true,
      silent: Boolean(options.silent),
      skipFocusRestore: true,
    });

    clearAttachmentPreview();
    detachEscHandler();
    detachRootBindings();

    const root = getRoot();

    try {
      root?.remove?.();
    } catch {}

    return true;
  },
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasModal;

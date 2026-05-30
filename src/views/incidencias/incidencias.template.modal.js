/* =========================================================
   Onion Support - Incidencias Detail Template
   Archivo: /src/views/incidencias/incidencias.template.modal.js

   Responsabilidad:
   - Render HTML puro del modal detalle de incidencia.
   - Pintar detalle, técnico, factura vinculada, adjuntos,
     preview, comentario y timeline.
   - Exponer data-action/data-field para index.js.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin State externo.
   - Sin listeners.
   - Sin DOM API.
   - Sin Toast.
   - Sin acciones reales.
========================================================= */

export const INCIDENCIAS_MODAL_TEMPLATE_VERSION =
  "incidencias.template.modal.v1";

export const DETAIL_ACTIONS = Object.freeze({
  CLOSE: "detail-close",
  COPY_ID: "detail-copy-id",

  COMMENT_SUBMIT: "detail-submit-update",
  COMMENT_CHANGE: "detail-comment-change",

  ATTACHMENTS_ADD: "detail-attachments-add",
  PENDING_FILE_REMOVE: "detail-pending-file-remove",

  ATTACHMENT_OPEN: "detail-attachment-open",
  ATTACHMENT_DOWNLOAD: "detail-attachment-download",

  PREVIEW_CLOSE: "detail-preview-close",
  PREVIEW_DOWNLOAD: "detail-preview-download",
});

const MODAL_ID = "incidencias-detail-modal-root";
const PANEL_ID = "incidencias-detail-modal-panel";

const DEFAULT_CURRENCY = "EUR";

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(
    String(value)
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (!key) return "";
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => cleanText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function redact(value = "") {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  if (/^blob:/i.test(raw)) return raw;

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function safeImageSrc(value = "") {
  const raw = safeUrl(value);

  if (!raw) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  if (/^https:\/\//i.test(raw)) return raw;

  return "";
}

function safeFilename(value = "", fallback = "archivo") {
  const clean = cleanText(value, fallback)
    .replace(/[\\/:*?"<>|#]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 180);

  return clean || fallback;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatBytes(bytes = 0) {
  const size = number(bytes, 0);

  if (!size || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = number(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: cleanText(currency, DEFAULT_CURRENCY).toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} €`;
  }
}

function toTimestamp(value = null) {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = cleanText(value, "");

  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(raw);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffMs = timestamp - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";
  if (absMin < 60) return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    copy: `<svg ${common}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    download: `<svg ${common}><path d="M12 3v11"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 18H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   DETAIL PICKERS
========================================================= */

function getRaw(detail = {}) {
  return safeObject(detail?.raw);
}

function getTicketId(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.ticketId,
      detail.incidenciaId,
      detail.id,
      detail.code,
      detail.numero,
      detail.ticketCode,
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw.code,
      raw.numero,
      raw.ticketCode
    ),
    ""
  );
}

function getTitle(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.title,
      detail.subject,
      detail.asunto,
      raw.title,
      raw.subject,
      raw.asunto
    ),
    "Incidencia"
  );
}

function getDescription(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.description,
      detail.descripcion,
      detail.message,
      detail.preview,
      raw.description,
      raw.descripcion,
      raw.message,
      raw.preview
    ),
    "Sin descripción."
  );
}

function getClientName(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.requesterName,
      detail.clientName,
      detail.clienteNombre,
      detail.name,
      detail.userName,
      detail.requesterSnapshot?.displayName,
      detail.requesterSnapshot?.name,
      detail.cliente?.displayName,
      detail.cliente?.name,
      detail.client?.displayName,
      detail.client?.name,
      raw.requesterName,
      raw.clientName,
      raw.clienteNombre,
      raw.name,
      raw.userName,
      raw.requesterSnapshot?.displayName,
      raw.requesterSnapshot?.name
    ),
    "Cliente"
  );
}

function getClientAvatar(detail = {}) {
  const raw = getRaw(detail);

  return safeImageSrc(
    first(
      detail.avatarUrl,
      detail.requesterAvatarUrl,
      detail.userAvatarUrl,
      detail.clientAvatar,
      detail.avatar,
      detail.cliente?.avatarUrl,
      detail.client?.avatarUrl,
      detail.requesterSnapshot?.avatarUrl,
      raw.avatarUrl,
      raw.requesterAvatarUrl,
      raw.userAvatarUrl,
      raw.clientAvatar,
      raw.avatar,
      raw.requesterSnapshot?.avatarUrl
    )
  );
}

function getTechnicianName(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.assignedToName,
      detail.technicianName,
      detail.tecnicoName,
      detail.assignedTo?.displayName,
      detail.assignedTo?.name,
      detail.technician?.displayName,
      detail.technician?.name,
      detail.tecnico?.displayName,
      detail.tecnico?.name,
      detail.assignment?.assignedToName,
      detail.assignment?.technicianName,
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.assignedTo?.displayName,
      raw.assignedTo?.name,
      raw.assignment?.assignedToName
    ),
    "Sin asignar"
  );
}

function getTechnicianAvatar(detail = {}) {
  const raw = getRaw(detail);

  return safeImageSrc(
    first(
      detail.assignedToAvatarUrl,
      detail.technicianAvatarUrl,
      detail.tecnicoAvatarUrl,
      detail.assignedTo?.avatarUrl,
      detail.technician?.avatarUrl,
      detail.tecnico?.avatarUrl,
      detail.assignment?.assignedToAvatarUrl,
      detail.assignment?.technicianAvatarUrl,
      raw.assignedToAvatarUrl,
      raw.technicianAvatarUrl,
      raw.tecnicoAvatarUrl,
      raw.assignedTo?.avatarUrl,
      raw.assignment?.assignedToAvatarUrl
    )
  );
}

function getStatus(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.status, detail.estado, detail.state, raw.status, raw.estado), "open");
}

function getPriority(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.priority, detail.prioridad, raw.priority, raw.prioridad), "medium");
}

function statusLabel(value = "") {
  const key = normalizeKey(value);

  if (["open", "abierta", "abierto"].includes(key)) return "Abierta";
  if (["pending", "pendiente"].includes(key)) return "Pendiente";
  if (["in_progress", "progress", "proceso", "en_proceso"].includes(key)) return "En proceso";
  if (["resolved", "resuelta", "resuelto"].includes(key)) return "Resuelta";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "Cerrada";

  return cleanText(value, "Abierta");
}

function statusClass(value = "") {
  const key = normalizeKey(value);

  if (["open", "abierta", "abierto"].includes(key)) return "open";
  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["in_progress", "progress", "proceso", "en_proceso"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "closed";

  return "neutral";
}

function priorityLabel(value = "") {
  const key = normalizeKey(value);

  if (["critical", "critica", "critico"].includes(key)) return "Crítica";
  if (["urgent", "urgente", "high", "alta"].includes(key)) return "Urgente";
  if (["low", "baja"].includes(key)) return "Baja";
  if (["medium", "media", "normal"].includes(key)) return "Media";

  return cleanText(value, "Media");
}

function priorityClass(value = "") {
  const key = normalizeKey(value);

  if (["critical", "critica", "critico"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta"].includes(key)) return "high";
  if (["low", "baja"].includes(key)) return "low";

  return "medium";
}

function getInvoiceLabel(detail = {}) {
  const raw = getRaw(detail);

  const code = cleanText(
    first(
      detail.numeroFacturaLegal,
      detail.numeroFactura,
      detail.invoiceNumber,
      detail.facturaId,
      detail.invoiceId,
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
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.facturaTotal,
    raw.facturaImporte,
    raw.importeFactura
  );

  const currency = cleanText(first(detail.currency, detail.moneda, raw.currency, raw.moneda), DEFAULT_CURRENCY);
  const numeric = number(amount, NaN);

  if (code && Number.isFinite(numeric)) return `${code} · ${formatMoney(numeric, currency)}`;
  if (code) return code;
  if (Number.isFinite(numeric)) return formatMoney(numeric, currency);

  const payment = normalizeKey(first(detail.paymentStatus, detail.estadoPago, raw.paymentStatus, raw.estadoPago));

  if (["paid", "pagada", "pagado"].includes(payment)) return "Pagado";
  if (["pending", "pendiente"].includes(payment)) return "Pendiente";
  if (["partial", "parcial"].includes(payment)) return "Parcial";
  if (["overdue", "vencida", "vencido"].includes(payment)) return "Vencido";

  return "No vinculada";
}

function getAttachments(detail = {}) {
  const raw = getRaw(detail);

  return safeArray(
    first(
      detail.attachments,
      detail.files,
      detail.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos,
      []
    )
  ).map((file, index) => {
    const item = safeObject(file);
    const id = cleanText(
      first(
        item.id,
        item.fileId,
        item.attachmentId,
        item.blobName,
        item.storageKey,
        item.path,
        item.key
      ),
      `attachment-${index + 1}`
    );

    const name = safeFilename(
      first(item.name, item.filename, item.fileName, item.title),
      `archivo_${index + 1}`
    );

    const url = safeUrl(
      first(
        item.viewUrl,
        item.openUrl,
        item.signedUrl,
        item.url,
        item.blobUrl,
        item.publicUrl,
        item.downloadUrl
      )
    );

    return {
      ...item,
      id,
      attachmentId: cleanText(first(item.attachmentId, id), id),
      name,
      filename: safeFilename(first(item.filename, item.fileName, item.name), name),
      fileName: safeFilename(first(item.fileName, item.filename, item.name), name),
      size: number(first(item.size, item.sizeBytes, item.contentLength), 0),
      type: cleanText(first(item.type, item.contentType, item.mimetype, item.mimeType), ""),
      contentType: cleanText(first(item.contentType, item.mimetype, item.mimeType, item.type), ""),
      uploadedAt: first(item.uploadedAt, item.createdAt, item.date, null),
      url,
      viewUrl: safeUrl(first(item.viewUrl, item.openUrl, item.signedUrl, item.url, url)),
      openUrl: safeUrl(first(item.openUrl, item.viewUrl, item.signedUrl, item.url, url)),
      downloadUrl: safeUrl(first(item.downloadUrl, item.signedUrl, item.url, url)),
    };
  });
}

function getTimeline(detail = {}) {
  const raw = getRaw(detail);

  const timeline = safeArray(first(detail.timeline, raw.timeline));

  if (timeline.length) {
    return timeline.map(normalizeTimelineEntry);
  }

  const history = safeArray(first(detail.history, detail.events, raw.history, raw.events));
  const comments = safeArray(first(detail.comments, detail.notes, detail.messages, raw.comments, raw.notes, raw.messages));

  return [
    ...history.map((entry, index) => normalizeTimelineEntry(entry, index)),
    ...comments.map((entry, index) =>
      normalizeTimelineEntry(
        {
          ...safeObject(entry),
          kind: "comment",
          type: "comment",
        },
        index
      )
    ),
  ].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

function normalizeTimelineEntry(entry = {}, index = 0) {
  const item = safeObject(entry);
  const kind = cleanText(first(item.kind, item.type === "comment" ? "comment" : "event"), "event");
  const type = cleanText(first(item.type, item.action), kind === "comment" ? "comment" : "update");

  return {
    id: cleanText(first(item.id, item.eventId, item.historyId, item.commentId), `${kind}-${index + 1}`),
    kind,
    type,
    title: cleanText(
      first(
        item.title,
        kind === "comment" ? "Comentario" : type === "created" ? "Incidencia creada" : "Actualización"
      ),
      "Actualización"
    ),
    body: cleanText(
      first(item.body, item.message, item.text, item.comment, item.description, item.detail),
      kind === "comment" ? "" : "Actualización registrada."
    ),
    author: cleanText(
      first(item.author, item.byName, item.user, item.name, item.createdBy?.name, item.createdBy?.displayName),
      kind === "comment" ? "Usuario" : "Sistema"
    ),
    createdAt: first(item.createdAt, item.date, item.timestamp, item.updatedAt, null),
  };
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data = safeObject(input);
  const detail = safeObject(first(data.detail, data.ticket, data.incidencia, {}), {});
  const ticketId = getTicketId(detail);

  return {
    open: data.open === true && Boolean(ticketId),
    detail,
    ticketId,

    submitting: data.submitting === true,
    commentDraft: cleanText(data.commentDraft, ""),
    pendingFiles: safeArray(data.pendingFiles),

    feedbackMessage: cleanText(data.feedbackMessage, ""),
    feedbackType: cleanText(data.feedbackType, "info"),

    openingAttachmentId: cleanText(data.openingAttachmentId, ""),
    downloadingAttachmentId: cleanText(data.downloadingAttachmentId, ""),

    previewFile: safeObject(data.previewFile, null),
  };
}

/* =========================================================
   SMALL PARTIALS
========================================================= */

function disabledAttrs(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function renderInlineSpinner(label = "") {
  return `
    <span class="incidencias-modal-inline-spinner">
      <span aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderChip(label = "", modifier = "neutral") {
  const key = normalizeKey(modifier) || "neutral";

  return `
    <span class="incidencias-modal-chip incidencias-modal-chip--${attr(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(detail = {}) {
  const name = getClientName(detail);
  const initials = initialsFrom(name);
  const avatarUrl = getClientAvatar(detail);

  if (avatarUrl) {
    return `
      <div class="incidencias-modal-avatar" title="${attr(name)}">
        <div class="incidencias-modal-avatar-frame" data-modal-avatar-frame="true" data-fallback="false">
          <img
            src="${attr(avatarUrl)}"
            alt="${attr(name)}"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            data-modal-avatar-img="true"
          >
          <span class="incidencias-modal-avatar-fallback">${escapeHtml(initials)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="incidencias-modal-avatar" title="${attr(name)}">
      <div class="incidencias-modal-avatar-frame incidencias-modal-avatar-frame--fallback" data-modal-avatar-frame="true" data-fallback="true">
        <span class="incidencias-modal-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    </div>
  `;
}

function renderTechnicianValue(detail = {}) {
  const name = getTechnicianName(detail);
  const avatarUrl = getTechnicianAvatar(detail);
  const initials = initialsFrom(name);

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
          src="${attr(avatarUrl)}"
          alt=""
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          data-modal-technician-avatar-img="true"
        >
        <span>${escapeHtml(initials)}</span>
      </span>
      <strong>${escapeHtml(name)}</strong>
    </span>
  `;
}

function renderMetaField(label = "", value = "", options = {}) {
  return `
    <div class="incidencias-modal-meta-card">
      <span>${escapeHtml(label)}</span>
      ${options.html ? value : `<strong>${escapeHtml(cleanText(value, "—"))}</strong>`}
    </div>
  `;
}

function renderFeedbackBox(vm = {}) {
  const message = cleanText(vm.feedbackMessage, "");

  if (!message) return "";

  const type = normalizeKey(vm.feedbackType || "info");

  return `
    <div class="incidencias-modal-feedback incidencias-modal-feedback--${attr(type)}">
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

/* =========================================================
   COMPOSER / PENDING FILES
========================================================= */

function renderPendingFiles(vm = {}) {
  const files = safeArray(vm.pendingFiles);

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
            <span>${escapeHtml([cleanText(file.type, ""), formatBytes(file.size)].filter(Boolean).join(" · ") || "Archivo preparado")}</span>
          </div>

          <button
            type="button"
            data-detail-action="${DETAIL_ACTIONS.PENDING_FILE_REMOVE}"
            data-incidencias-action="${DETAIL_ACTIONS.PENDING_FILE_REMOVE}"
            data-action="${DETAIL_ACTIONS.PENDING_FILE_REMOVE}"
            data-file-index="${attr(String(index))}"
            ${disabledAttrs(vm.submitting, vm.submitting)}
          >
            Quitar
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderComposer(vm = {}) {
  const disabled = disabledAttrs(vm.submitting, vm.submitting);

  return `
    <section class="incidencias-modal-composer">
      <div class="incidencias-modal-composer-head">
        <div class="incidencias-modal-composer-icon" aria-hidden="true">${icon("plus")}</div>
        <div class="incidencias-modal-composer-copy">
          <h3>Añadir comentario y adjuntos</h3>
          <span>Redacta la actualización y adjunta archivos en este mismo bloque.</span>
        </div>
      </div>

      <textarea
        id="incidencias-modal-comment-input"
        data-detail-field="comment"
        data-field="comment"
        placeholder="Ejemplo: He probado de nuevo y adjunto captura..."
        ${disabled}
        class="incidencias-modal-comment-textarea"
      >${escapeHtml(vm.commentDraft)}</textarea>

      <div class="incidencias-modal-composer-foot">
        <span>Al pulsar “Actualizar incidencia”, se enviará esta información y la incidencia volverá a estado abierta.</span>
      </div>

      <label for="incidencias-modal-attachments-input" class="incidencias-modal-dropzone">
        <input
          id="incidencias-modal-attachments-input"
          type="file"
          data-detail-field="attachments"
          data-field="attachments"
          multiple
          ${disabled}
        >
        <span>Seleccionar archivos</span>
        <small>Imágenes, PDFs y documentos de soporte</small>
      </label>

      ${renderPendingFiles(vm)}
    </section>
  `;
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function isImageLikeAttachment(file = {}) {
  const type = cleanText(first(file.contentType, file.type, file.mimeType, file.mimetype), "").toLowerCase();
  const name = cleanText(first(file.filename, file.fileName, file.name), "").toLowerCase();

  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

function getAttachmentBusyMeta(file = {}, vm = {}) {
  const attachmentId = cleanText(file.id, "");

  return {
    attachmentId,
    isOpening: Boolean(attachmentId && vm.openingAttachmentId === attachmentId),
    isDownloading: Boolean(attachmentId && vm.downloadingAttachmentId === attachmentId),
  };
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
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-incidencias-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-attachment-id="${attr(file.id)}"
        class="incidencias-modal-file-square"
        aria-label="Ver ${attr(name)}"
      >
        <span>${isImage ? "IMG" : "DOC"}</span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
      data-incidencias-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
      data-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
      data-attachment-id="${attr(file.id)}"
      class="incidencias-modal-image-thumb-wrap"
      aria-label="Ampliar ${attr(name)}"
      data-modal-thumb-frame="true"
      data-thumb-error="false"
    >
      <img
        src="${attr(url)}"
        alt="${attr(name)}"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        class="incidencias-modal-image-thumb"
        data-modal-thumb-img="true"
      >
      <span class="incidencias-modal-image-thumb-fallback">IMG</span>
      <span class="incidencias-modal-image-open-badge">Ampliar</span>
    </button>
  `;
}

function renderAttachmentActionButtons(file = {}, vm = {}) {
  const busy = getAttachmentBusyMeta(file, vm);
  const name = safeFilename(file.name || file.filename || "archivo", "archivo");

  return `
    <div class="incidencias-modal-attachment-actions">
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-incidencias-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-attachment-id="${attr(file.id)}"
        ${disabledAttrs(busy.isOpening || vm.submitting, busy.isOpening)}
        class="incidencias-modal-view-btn"
        aria-label="Ver ${attr(name)}"
      >
        ${
          busy.isOpening
            ? renderInlineSpinner("Abriendo...")
            : `<span class="incidencias-modal-action-icon">${icon("eye")}</span><span>Ver</span>`
        }
      </button>

      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD}"
        data-incidencias-action="${DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD}"
        data-action="${DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD}"
        data-attachment-id="${attr(file.id)}"
        ${disabledAttrs(busy.isDownloading || vm.submitting, busy.isDownloading)}
        class="incidencias-modal-download-btn"
        aria-label="Descargar ${attr(name)}"
      >
        ${
          busy.isDownloading
            ? renderInlineSpinner("Bajando...")
            : `<span class="incidencias-modal-action-icon">${icon("download")}</span><span>Descargar</span>`
        }
      </button>
    </div>
  `;
}

function renderAttachments(vm = {}) {
  const files = getAttachments(vm.detail);

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

                        ${renderAttachmentActionButtons(file, vm)}
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

/* =========================================================
   PREVIEW
========================================================= */

function isPreviewImage(file = {}) {
  const type = cleanText(first(file.contentType, file.type, file.mimeType, file.mimetype), "").toLowerCase();
  const name = cleanText(first(file.filename, file.fileName, file.name), "").toLowerCase();

  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

function isPreviewPdf(file = {}) {
  const type = cleanText(first(file.contentType, file.type, file.mimeType, file.mimetype), "").toLowerCase();
  const name = cleanText(first(file.filename, file.fileName, file.name), "").toLowerCase();

  return type.includes("application/pdf") || name.endsWith(".pdf");
}

function renderAttachmentPreview(vm = {}) {
  const file = safeObject(vm.previewFile, null);
  const url = safeUrl(file?.url || file?.viewUrl || file?.openUrl || file?.downloadUrl);

  if (!file || !url) return "";

  const filename = safeFilename(first(file.filename, file.fileName, file.name), "Documento");
  const type = cleanText(first(file.contentType, file.type, file.mimeType, file.mimetype), "");
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
              ? `
                <button
                  type="button"
                  data-detail-action="${DETAIL_ACTIONS.PREVIEW_DOWNLOAD}"
                  data-incidencias-action="${DETAIL_ACTIONS.PREVIEW_DOWNLOAD}"
                  data-action="${DETAIL_ACTIONS.PREVIEW_DOWNLOAD}"
                  class="incidencias-modal-preview-btn"
                >
                  Descargar
                </button>
              `
              : ""
          }

          <button
            type="button"
            data-detail-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"
            data-incidencias-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"
            data-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"
            class="incidencias-modal-preview-btn"
            aria-label="Cerrar vista previa"
          >
            Cerrar vista
          </button>
        </div>
      </div>

      <div class="incidencias-modal-preview-frame ${image ? "is-image" : ""}">
        ${
          image
            ? `<img src="${attr(safeImageSrc(url))}" alt="${attr(filename)}" class="incidencias-modal-preview-image">`
            : `<iframe src="${attr(url)}" title="${attr(filename)}" class="incidencias-modal-preview-iframe" loading="lazy" referrerpolicy="no-referrer"></iframe>`
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

/* =========================================================
   TIMELINE
========================================================= */

function renderTimeline(detail = {}) {
  const timeline = getTimeline(detail);

  if (!timeline.length) {
    return `<div class="incidencias-timeline-empty">Sin actividad</div>`;
  }

  return `
    <div class="incidencias-timeline-list">
      ${timeline.map((entry) => {
        const kind = cleanText(entry.kind, "event");
        const type = cleanText(entry.type, "update");
        const isComment = kind === "comment";
        const isCreated = type === "created";
        const title = cleanText(entry.title, isComment ? "Comentario" : isCreated ? "Incidencia creada" : "Actualización");
        const body = cleanText(entry.body, "Actualización registrada.");

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
              <strong>${escapeHtml(cleanText(entry.author, "Sistema"))}</strong>
              <span>${escapeHtml(formatDate(entry.createdAt))}</span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

/* =========================================================
   FOOTER
========================================================= */

function renderFooter(vm = {}) {
  return `
    <footer class="incidencias-modal-footer">
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.COMMENT_SUBMIT}"
        data-incidencias-action="${DETAIL_ACTIONS.COMMENT_SUBMIT}"
        data-action="${DETAIL_ACTIONS.COMMENT_SUBMIT}"
        data-ticket-id="${attr(vm.ticketId)}"
        ${disabledAttrs(vm.submitting, vm.submitting)}
        class="incidencias-modal-submit-btn"
      >
        ${vm.submitting ? renderInlineSpinner("Actualizando...") : "Actualizar incidencia"}
      </button>
    </footer>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderIncidenciasDetailModal(input = {}) {
  const vm = buildVm(input);

  if (!vm.open) return "";

  const detail = vm.detail;
  const ticketId = vm.ticketId;
  const title = getTitle(detail);
  const description = getDescription(detail);
  const createdAt = formatDate(first(detail.createdAt, detail.raw?.createdAt));
  const updatedAt = first(detail.updatedAt, detail.lastActivityAt, detail.raw?.updatedAt, detail.raw?.lastActivityAt, detail.createdAt);
  const updatedAgo = formatRelativeDate(updatedAt);
  const attachments = getAttachments(detail);

  const status = getStatus(detail);
  const priority = getPriority(detail);

  return `
    <section
      id="${MODAL_ID}"
      class="incidencias-detail-modal-root"
      data-incidencias-detail-root="true"
      data-template-version="${attr(INCIDENCIAS_MODAL_TEMPLATE_VERSION)}"
      data-ticket-id="${attr(ticketId)}"
    >
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
          ${vm.submitting ? renderLoadingOverlay("Actualizando incidencia...") : ""}

          <header class="incidencias-modal-header">
            <div class="incidencias-modal-hero">
              ${renderAvatar(detail)}

              <div class="incidencias-modal-hero-content">
                <div class="incidencias-modal-hero-chips">
                  <button
                    type="button"
                    data-detail-action="${DETAIL_ACTIONS.COPY_ID}"
                    data-incidencias-action="${DETAIL_ACTIONS.COPY_ID}"
                    data-action="${DETAIL_ACTIONS.COPY_ID}"
                    data-ticket-id="${attr(ticketId)}"
                    class="incidencias-modal-id-chip"
                    aria-label="Copiar ID"
                  >
                    ${escapeHtml(ticketId || "—")}
                  </button>

                  ${renderChip(statusLabel(status), `status-${statusClass(status)}`)}
                  ${renderChip(priorityLabel(priority), `priority-${priorityClass(priority)}`)}
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
              data-detail-action="${DETAIL_ACTIONS.CLOSE}"
              data-incidencias-action="${DETAIL_ACTIONS.CLOSE}"
              data-action="${DETAIL_ACTIONS.CLOSE}"
              aria-label="Cerrar modal"
              ${disabledAttrs(vm.submitting, vm.submitting)}
              class="incidencias-modal-close-btn"
            >
              ${icon("close")}
            </button>
          </header>

          <main class="incidencias-modal-body">
            ${renderFeedbackBox(vm)}
            ${renderAttachmentPreview(vm)}

            <div class="incidencias-modal-meta-grid">
              ${renderMetaField("Técnico", renderTechnicianValue(detail), { html: true })}
              ${renderMetaField("Factura", getInvoiceLabel(detail))}
              ${renderMetaField("Creada", createdAt)}
              ${renderMetaField("Adjuntos", String(attachments.length))}
            </div>

            <section class="incidencias-modal-description-section">
              <div class="incidencias-modal-section-head">
                <h3>Descripción de la incidencia</h3>
              </div>
              <div class="incidencias-modal-description-box">
                ${escapeHtml(description)}
              </div>
            </section>

            ${renderComposer(vm)}
            ${renderAttachments(vm)}

            <section class="incidencias-modal-history-section">
              <div class="incidencias-modal-section-head">
                <h3>Historial y actividad</h3>
              </div>
              ${renderTimeline(detail)}
            </section>

            ${renderFooter(vm)}
          </main>
        </div>
      </div>
    </section>
  `;
}

export function renderIncidenciasDetailModalClosed() {
  return "";
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getDetailCommentValue(formLike = {}) {
  return cleanText(
    first(
      formLike.comment,
      formLike.message,
      formLike.text,
      formLike.body,
      ""
    ),
    ""
  );
}

export function validateDetailUpdate({
  comment = "",
  pendingFiles = [],
} = {}) {
  const message = cleanText(comment, "");
  const files = safeArray(pendingFiles);

  if (!message && !files.length) {
    return {
      valid: false,
      message: "Añade una actualización o selecciona al menos un archivo.",
    };
  }

  if (message && message.length < 4) {
    return {
      valid: false,
      message: "Añade un poco más de detalle antes de enviar la actualización.",
    };
  }

  return {
    valid: true,
    message: "",
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getDetailTemplateSnapshot() {
  return {
    version: INCIDENCIAS_MODAL_TEMPLATE_VERSION,

    actions: DETAIL_ACTIONS,

    fields: [
      "comment",
      "attachments",
    ],

    policy: {
      templateOnly: true,

      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStateExternal: true,
      noListeners: true,
      noDomApi: true,
      noToast: true,

      detailModal: true,
      commentMarkup: true,
      attachmentsMarkup: true,
      previewMarkup: true,
      timelineMarkup: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderDetailModal = renderIncidenciasDetailModal;
export const renderDetailModalClosed = renderIncidenciasDetailModalClosed;

export default renderIncidenciasDetailModal;

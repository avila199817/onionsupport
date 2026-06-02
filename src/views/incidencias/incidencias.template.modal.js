/* =========================================================
   Onion Support - Incidencias Detail Template
   Archivo: /src/views/incidencias/incidencias.template.modal.js

   Responsabilidad:
   - Render HTML puro del modal detalle de incidencia.
   - Pintar detalle, cliente, técnico, factura vinculada,
     adjuntos, preview, comentario y timeline.
   - Exponer data-detail-action/data-field para index.js.
   - Alineado 1:1 con incidencias.index.js.
   - Alineado con incidencias.api.js.
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
  "incidencias.template.modal.productive.v4";

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
const MAX_COMMENT_LENGTH = 4000;

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

function cleanMultiline(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values.flat(Infinity)) {
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

  if (typeof value === "string") {
    let clean = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!clean || clean === "-" || clean === "+") return fallback;

    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");

    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean.replace(/\./g, "").replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean = clean.replace(/,/g, ".");
    }

    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
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

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@") ? email : "";
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

function safePublicText(value = "", fallback = "") {
  const text = redact(cleanText(value, ""));

  if (!text) return fallback;

  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature)=/i.test(text)) {
    return fallback;
  }

  return text;
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

  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstUrl(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      const nested = firstUrl(
        value.viewUrl,
        value.openUrl,
        value.downloadUrl,
        value.signedUrl,
        value.url,
        value.blobUrl,
        value.publicUrl,
        value.href,
        value.src
      );

      if (nested) return nested;
      continue;
    }

    const url = safeUrl(value);
    if (url) return url;
  }

  return "";
}

function safeImageSrc(value = "") {
  const raw = safeUrl(value);

  if (!raw) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) return raw;

  return "";
}

function firstImageSrc(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      const nested = firstImageSrc(
        value.avatarUrl,
        value.avatar,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.picture,
        value.viewUrl,
        value.openUrl,
        value.signedUrl,
        value.url,
        value.href,
        value.src,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.photoUrl,
        value.profile?.photoURL,
        value.profile?.picture
      );

      if (nested) return nested;
      continue;
    }

    const src = safeImageSrc(value);
    if (src) return src;
  }

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

function hashText(value = "") {
  const text = cleanText(value, "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
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

  return safePublicText(
    first(
      detail.title,
      detail.subject,
      detail.asunto,
      detail.name,
      raw.title,
      raw.subject,
      raw.asunto,
      raw.name
    ),
    "Incidencia"
  );
}

function getDescription(detail = {}) {
  const raw = getRaw(detail);

  return cleanMultiline(
    first(
      detail.description,
      detail.descripcion,
      detail.message,
      detail.preview,
      detail.text,
      detail.body,
      raw.description,
      raw.descripcion,
      raw.message,
      raw.preview,
      raw.text,
      raw.body
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
      detail.clienteName,
      detail.clienteNombre,
      detail.userName,
      detail.name,
      detail.requesterSnapshot?.displayName,
      detail.requesterSnapshot?.name,
      detail.requesterSnapshot?.nombre,
      detail.cliente?.displayName,
      detail.cliente?.name,
      detail.cliente?.nombre,
      detail.client?.displayName,
      detail.client?.name,
      detail.user?.displayName,
      detail.user?.name,
      raw.requesterName,
      raw.clientName,
      raw.clienteName,
      raw.clienteNombre,
      raw.userName,
      raw.name,
      raw.requesterSnapshot?.displayName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.nombre,
      raw.cliente?.displayName,
      raw.cliente?.name,
      raw.client?.displayName,
      raw.client?.name
    ),
    "Cliente"
  );
}

function getClientEmail(detail = {}) {
  const raw = getRaw(detail);

  return normalizeEmail(
    first(
      detail.requesterEmail,
      detail.requesterEmailLower,
      detail.clientEmail,
      detail.clientEmailLower,
      detail.clienteEmail,
      detail.clienteEmailLower,
      detail.userEmail,
      detail.userEmailLower,
      detail.email,
      detail.emailLower,
      detail.requesterSnapshot?.email,
      detail.requesterSnapshot?.emailLower,
      detail.cliente?.email,
      detail.cliente?.emailLower,
      detail.client?.email,
      detail.client?.emailLower,
      detail.user?.email,
      detail.user?.emailLower,
      detail.meta?.requesterEmail,
      detail.meta?.clientEmail,
      detail.meta?.clienteEmail,
      raw.requesterEmail,
      raw.requesterEmailLower,
      raw.clientEmail,
      raw.clientEmailLower,
      raw.clienteEmail,
      raw.clienteEmailLower,
      raw.userEmail,
      raw.userEmailLower,
      raw.email,
      raw.emailLower,
      raw.requesterSnapshot?.email,
      raw.requesterSnapshot?.emailLower,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.client?.email,
      raw.client?.emailLower,
      raw.user?.email,
      raw.user?.emailLower,
      raw.meta?.requesterEmail,
      raw.meta?.clientEmail,
      raw.meta?.clienteEmail
    )
  );
}

function getClientAvatar(detail = {}) {
  const raw = getRaw(detail);

  return firstImageSrc(
    detail.requesterAvatarUrl,
    detail.requesterAvatar,
    detail.userAvatarUrl,
    detail.userAvatar,
    detail.clientAvatarUrl,
    detail.clientAvatar,
    detail.clienteAvatarUrl,
    detail.clienteAvatar,
    detail.avatarUrl,
    detail.avatar,
    detail.photoUrl,
    detail.photoURL,
    detail.imageUrl,
    detail.picture,
    detail.cliente,
    detail.client,
    detail.user,
    detail.requesterSnapshot,
    detail.meta?.requesterAvatarUrl,
    detail.meta?.requesterAvatar,
    detail.meta?.clientAvatarUrl,
    raw.requesterAvatarUrl,
    raw.requesterAvatar,
    raw.userAvatarUrl,
    raw.userAvatar,
    raw.clientAvatarUrl,
    raw.clientAvatar,
    raw.clienteAvatarUrl,
    raw.clienteAvatar,
    raw.avatarUrl,
    raw.avatar,
    raw.photoUrl,
    raw.photoURL,
    raw.imageUrl,
    raw.picture,
    raw.cliente,
    raw.client,
    raw.user,
    raw.requesterSnapshot,
    raw.meta?.requesterAvatarUrl,
    raw.meta?.requesterAvatar,
    raw.meta?.clientAvatarUrl
  );
}

function getTechnicianName(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.assignedToName,
      detail.technicianName,
      detail.tecnicoName,
      detail.agentName,
      detail.assignedTo?.displayName,
      detail.assignedTo?.name,
      detail.assignedTo?.nombre,
      detail.technician?.displayName,
      detail.technician?.name,
      detail.technician?.nombre,
      detail.tecnico?.displayName,
      detail.tecnico?.name,
      detail.tecnico?.nombre,
      detail.agent?.displayName,
      detail.agent?.name,
      detail.assignment?.assignedToName,
      detail.assignment?.technicianName,
      detail.assignment?.agentName,
      detail.assignment?.name,
      detail.meta?.technicianName,
      detail.meta?.assignedTechnicianName,
      detail.meta?.lastTechnicianName,
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.agentName,
      raw.assignedTo?.displayName,
      raw.assignedTo?.name,
      raw.technician?.displayName,
      raw.technician?.name,
      raw.tecnico?.displayName,
      raw.tecnico?.name,
      raw.assignment?.assignedToName,
      raw.assignment?.technicianName,
      raw.meta?.technicianName,
      raw.meta?.assignedTechnicianName,
      raw.meta?.lastTechnicianName
    ),
    "Sin asignar"
  );
}

function getTechnicianEmail(detail = {}) {
  const raw = getRaw(detail);

  return normalizeEmail(
    first(
      detail.assignedToEmail,
      detail.technicianEmail,
      detail.tecnicoEmail,
      detail.agentEmail,
      detail.assignedTo?.email,
      detail.assignedTo?.emailLower,
      detail.technician?.email,
      detail.technician?.emailLower,
      detail.tecnico?.email,
      detail.tecnico?.emailLower,
      detail.agent?.email,
      detail.assignment?.assignedToEmail,
      detail.assignment?.technicianEmail,
      detail.assignment?.agentEmail,
      detail.assignment?.email,
      detail.meta?.technicianEmail,
      detail.meta?.assignedTechnicianEmail,
      detail.meta?.lastTechnicianEmail,
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail,
      raw.agentEmail,
      raw.assignedTo?.email,
      raw.technician?.email,
      raw.tecnico?.email,
      raw.assignment?.assignedToEmail,
      raw.assignment?.technicianEmail,
      raw.assignment?.email,
      raw.meta?.technicianEmail,
      raw.meta?.assignedTechnicianEmail,
      raw.meta?.lastTechnicianEmail
    )
  );
}

function getTechnicianAvatar(detail = {}) {
  const raw = getRaw(detail);

  return firstImageSrc(
    detail.assignedToAvatarUrl,
    detail.assignedToAvatar,
    detail.technicianAvatarUrl,
    detail.technicianAvatar,
    detail.tecnicoAvatarUrl,
    detail.tecnicoAvatar,
    detail.agentAvatarUrl,
    detail.agentAvatar,
    detail.assignedTo,
    detail.technician,
    detail.tecnico,
    detail.agent,
    detail.assignment?.assignedToAvatarUrl,
    detail.assignment?.assignedToAvatar,
    detail.assignment?.technicianAvatarUrl,
    detail.assignment?.technicianAvatar,
    detail.assignment?.agentAvatarUrl,
    detail.assignment?.agentAvatar,
    detail.assignment?.avatarUrl,
    detail.assignment?.avatar,
    detail.assignment?.technician,
    detail.assignment?.assignedTo,
    detail.meta?.technicianAvatarUrl,
    detail.meta?.technicianAvatar,
    detail.meta?.assignedTechnicianAvatarUrl,
    detail.meta?.assignedTechnicianAvatar,
    detail.meta?.lastTechnicianAvatarUrl,
    detail.meta?.lastTechnicianAvatar,
    raw.assignedToAvatarUrl,
    raw.assignedToAvatar,
    raw.technicianAvatarUrl,
    raw.technicianAvatar,
    raw.tecnicoAvatarUrl,
    raw.tecnicoAvatar,
    raw.agentAvatarUrl,
    raw.agentAvatar,
    raw.assignedTo,
    raw.technician,
    raw.tecnico,
    raw.assignment?.assignedToAvatarUrl,
    raw.assignment?.assignedToAvatar,
    raw.assignment?.technicianAvatarUrl,
    raw.assignment?.technicianAvatar,
    raw.assignment?.avatarUrl,
    raw.assignment?.avatar,
    raw.meta?.technicianAvatarUrl,
    raw.meta?.technicianAvatar,
    raw.meta?.assignedTechnicianAvatarUrl,
    raw.meta?.assignedTechnicianAvatar,
    raw.meta?.lastTechnicianAvatarUrl,
    raw.meta?.lastTechnicianAvatar
  );
}

function getStatus(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.status,
      detail.estado,
      detail.state,
      detail.lifecycle?.status,
      raw.status,
      raw.estado,
      raw.state,
      raw.lifecycle?.status
    ),
    "open"
  );
}

function getPriority(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.priority,
      detail.prioridad,
      detail.severity,
      detail.urgency,
      raw.priority,
      raw.prioridad,
      raw.severity,
      raw.urgency
    ),
    "medium"
  );
}

function getCategory(detail = {}) {
  const raw = getRaw(detail);

  return cleanText(
    first(
      detail.category,
      detail.categoria,
      detail.type,
      detail.tipo,
      detail.subcategory,
      raw.category,
      raw.categoria,
      raw.type,
      raw.tipo,
      raw.subcategory
    ),
    "General"
  );
}

function statusLabel(value = "") {
  const key = normalizeKey(value);

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "Abierta";
  if (["pending", "pendiente", "new", "nueva", "nuevo"].includes(key)) return "Pendiente";
  if (["in_progress", "progress", "inprogress", "proceso", "en_proceso", "working"].includes(key)) return "En proceso";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "Resuelta";
  if (["closed", "close", "cerrada", "cerrado"].includes(key)) return "Cerrada";
  if (["cancelled", "canceled", "cancelada", "cancelado"].includes(key)) return "Cancelada";
  if (["archived", "archivada", "archivado"].includes(key)) return "Archivada";

  return cleanText(value, "Abierta");
}

function statusClass(value = "") {
  const key = normalizeKey(value);

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["pending", "pendiente", "new", "nueva", "nuevo"].includes(key)) return "pending";
  if (["in_progress", "progress", "inprogress", "proceso", "en_proceso", "working"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "cancelada", "cancelado", "archived", "archivada", "archivado"].includes(key)) {
    return "closed";
  }

  return "neutral";
}

function priorityLabel(value = "") {
  const key = normalizeKey(value);

  if (["critical", "critica", "crítico", "critico", "crítica", "p0"].includes(key)) return "Crítica";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "Urgente";
  if (["low", "baja", "minor", "p3"].includes(key)) return "Baja";
  if (["medium", "media", "normal", "p2"].includes(key)) return "Media";

  return cleanText(value, "Media");
}

function priorityClass(value = "") {
  const key = normalizeKey(value);

  if (["critical", "critica", "crítico", "critico", "crítica", "p0"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "high";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

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
    detail.amount,
    detail.total,
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.facturaTotal,
    raw.facturaImporte,
    raw.importeFactura,
    raw.amount,
    raw.total
  );

  const currency = cleanText(
    first(
      detail.currency,
      detail.moneda,
      detail.facturaCurrency,
      detail.facturaMoneda,
      detail.meta?.invoiceCurrency,
      raw.currency,
      raw.moneda,
      raw.facturaCurrency,
      raw.facturaMoneda,
      raw.meta?.invoiceCurrency
    ),
    DEFAULT_CURRENCY
  );

  const numeric = number(amount, NaN);

  if (code && Number.isFinite(numeric) && numeric > 0) return `${code} · ${formatMoney(numeric, currency)}`;
  if (code) return code;
  if (Number.isFinite(numeric) && numeric > 0) return formatMoney(numeric, currency);

  const payment = normalizeKey(first(detail.paymentStatus, detail.estadoPago, raw.paymentStatus, raw.estadoPago));

  if (["paid", "pagada", "pagado"].includes(payment)) return "Pagado";
  if (["pending", "pendiente"].includes(payment)) return "Pendiente";
  if (["partial", "parcial"].includes(payment)) return "Parcial";
  if (["overdue", "vencida", "vencido"].includes(payment)) return "Vencido";

  return "No vinculada";
}

function normalizeAttachment(file = {}, index = 0) {
  const item = safeObject(file);
  const nested = safeObject(item.raw);

  const id = cleanText(
    first(
      item.id,
      item.fileId,
      item.attachmentId,
      item.blobName,
      item.storageKey,
      item.path,
      item.key,
      nested.id,
      nested.fileId,
      nested.attachmentId,
      nested.blobName,
      nested.storageKey,
      nested.path,
      nested.key
    ),
    `attachment-${index + 1}`
  );

  const name = safeFilename(
    first(
      item.name,
      item.filename,
      item.fileName,
      item.title,
      nested.name,
      nested.filename,
      nested.fileName,
      nested.title
    ),
    `archivo_${index + 1}`
  );

  const url = firstUrl(
    item.viewUrl,
    item.openUrl,
    item.signedUrl,
    item.url,
    item.blobUrl,
    item.publicUrl,
    item.downloadUrl,
    nested.viewUrl,
    nested.openUrl,
    nested.signedUrl,
    nested.url,
    nested.blobUrl,
    nested.publicUrl,
    nested.downloadUrl
  );

  return {
    ...item,
    id,
    attachmentId: cleanText(first(item.attachmentId, nested.attachmentId, id), id),
    name,
    filename: safeFilename(first(item.filename, item.fileName, item.name, nested.filename, nested.fileName, nested.name), name),
    fileName: safeFilename(first(item.fileName, item.filename, item.name, nested.fileName, nested.filename, nested.name), name),
    size: number(first(item.size, item.sizeBytes, item.contentLength, nested.size, nested.sizeBytes, nested.contentLength), 0),
    type: cleanText(first(item.type, item.contentType, item.mimetype, item.mimeType, nested.type), ""),
    contentType: cleanText(first(item.contentType, item.mimetype, item.mimeType, item.type, nested.contentType), ""),
    uploadedAt: first(item.uploadedAt, item.createdAt, item.date, nested.uploadedAt, nested.createdAt, null),
    url,
    viewUrl: firstUrl(item.viewUrl, item.openUrl, item.signedUrl, item.url, url),
    openUrl: firstUrl(item.openUrl, item.viewUrl, item.signedUrl, item.url, url),
    downloadUrl: firstUrl(item.downloadUrl, item.signedUrl, item.url, url),
  };
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
  ).map(normalizeAttachment);
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
    body: cleanMultiline(
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
    commentDraft: cleanMultiline(data.commentDraft, ""),
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
  const email = getClientEmail(detail);
  const initials = initialsFrom(name);
  const avatarUrl = getClientAvatar(detail);
  const tone = hashText(`${name}:${email}:${getTicketId(detail)}`) % 10;

  return `
    <div class="incidencias-modal-avatar" title="${attr(name)}">
      <div
        class="${joinClasses(
          "incidencias-modal-avatar-frame",
          avatarUrl ? "" : "incidencias-modal-avatar-frame--fallback"
        )}"
        data-modal-avatar-frame="true"
        data-has-avatar="${avatarUrl ? "true" : "false"}"
        data-fallback="${avatarUrl ? "false" : "true"}"
        data-avatar-tone="${attr(String(tone))}"
      >
        ${
          avatarUrl
            ? `
              <img
                src="${attr(avatarUrl)}"
                alt="${attr(name)}"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
                data-modal-avatar-img="true"
              >
            `
            : ""
        }
        <span class="incidencias-modal-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    </div>
  `;
}

function renderTechnicianValue(detail = {}) {
  const name = getTechnicianName(detail);
  const email = getTechnicianEmail(detail);
  const avatarUrl = getTechnicianAvatar(detail);
  const initials = initialsFrom(name);
  const tone = hashText(`${name}:${email}`) % 10;

  return `
    <span class="incidencias-modal-technician-inline" data-modal-technician="true">
      <span
        class="${joinClasses(
          "incidencias-modal-technician-avatar",
          avatarUrl ? "" : "incidencias-modal-technician-avatar--fallback"
        )}"
        data-modal-technician-avatar-frame="true"
        data-has-avatar="${avatarUrl ? "true" : "false"}"
        data-fallback="${avatarUrl ? "false" : "true"}"
        data-avatar-tone="${attr(String(tone))}"
      >
        ${
          avatarUrl
            ? `
              <img
                src="${attr(avatarUrl)}"
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
                data-modal-technician-avatar-img="true"
              >
            `
            : ""
        }
        <span>${escapeHtml(initials)}</span>
      </span>

      <span class="incidencias-modal-technician-copy">
        <strong>${escapeHtml(name)}</strong>
        ${email ? `<small>${escapeHtml(email)}</small>` : ""}
      </span>
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
    <div class="incidencias-modal-feedback incidencias-modal-feedback--${attr(type)}" role="${type === "error" ? "alert" : "status"}">
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
    <div class="incidencias-modal-loading-overlay" aria-live="polite" aria-busy="true">
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
    <div class="incidencias-modal-pending-list" data-modal-pending-files="true">
      ${files.map((file, index) => {
        const name = safeFilename(file.name || `archivo_${index + 1}`, `archivo_${index + 1}`);
        const meta = [cleanText(file.type, ""), formatBytes(file.size)].filter(Boolean).join(" · ");

        return `
          <div class="incidencias-modal-pending-file" data-file-index="${attr(String(index))}">
            <div>
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(meta || "Archivo preparado")}</span>
            </div>

            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.PENDING_FILE_REMOVE}"
              data-file-index="${attr(String(index))}"
              data-remove-attachment="${attr(String(index))}"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              Quitar
            </button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderComposer(vm = {}) {
  const disabled = disabledAttrs(vm.submitting, vm.submitting);

  return `
    <section class="incidencias-modal-composer" data-modal-composer="true">
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
        name="comment"
        maxlength="${attr(String(MAX_COMMENT_LENGTH))}"
        placeholder="Ejemplo: He probado de nuevo y adjunto captura..."
        ${disabled}
        class="incidencias-modal-comment-textarea"
      >${escapeHtml(vm.commentDraft)}</textarea>

      <div class="incidencias-modal-composer-foot">
        <span>Al pulsar “Actualizar incidencia”, se enviará esta información y la incidencia volverá a estado abierta.</span>
        <strong>${escapeHtml(`${vm.commentDraft.length}/${MAX_COMMENT_LENGTH}`)}</strong>
      </div>

      <label
        for="incidencias-modal-attachments-input"
        class="incidencias-modal-dropzone"
        data-dropzone="detail-attachments"
      >
        <input
          id="incidencias-modal-attachments-input"
          type="file"
          data-detail-field="attachments"
          data-field="attachments"
          name="attachments"
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

function getAttachmentId(file = {}) {
  return cleanText(first(file.attachmentId, file.id, file.fileId), "");
}

function isImageLikeAttachment(file = {}) {
  const type = cleanText(first(file.contentType, file.type, file.mimeType, file.mimetype), "").toLowerCase();
  const name = cleanText(first(file.filename, file.fileName, file.name), "").toLowerCase();

  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

function getAttachmentBusyMeta(file = {}, vm = {}) {
  const attachmentId = getAttachmentId(file);

  return {
    attachmentId,
    isOpening: Boolean(attachmentId && vm.openingAttachmentId === attachmentId),
    isDownloading: Boolean(attachmentId && vm.downloadingAttachmentId === attachmentId),
  };
}

function renderAttachmentPreviewSquare(file = {}, vm = {}) {
  const busy = getAttachmentBusyMeta(file, vm);
  const isImage = isImageLikeAttachment(file);
  const url = isImage
    ? firstImageSrc(file.viewUrl, file.openUrl, file.signedUrl, file.url, file.blobUrl, file.publicUrl)
    : "";

  const name = safeFilename(first(file.name, file.filename, file.fileName), "archivo");
  const disabled = vm.submitting || busy.isOpening || !busy.attachmentId;

  if (!isImage || !url) {
    return `
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-attachment-id="${attr(busy.attachmentId)}"
        class="incidencias-modal-file-square"
        aria-label="Ver ${attr(name)}"
        ${disabledAttrs(disabled, busy.isOpening)}
      >
        <span>${isImage ? "IMG" : "DOC"}</span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
      data-attachment-id="${attr(busy.attachmentId)}"
      class="${joinClasses("incidencias-modal-image-thumb-wrap", busy.isOpening ? "is-loading" : "")}"
      aria-label="Ampliar ${attr(name)}"
      data-modal-thumb-frame="true"
      data-thumb-error="false"
      ${disabledAttrs(disabled, busy.isOpening)}
    >
      <img
        src="${attr(url)}"
        alt="${attr(name)}"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        draggable="false"
        class="incidencias-modal-image-thumb"
        data-modal-thumb-img="true"
      >

      <span class="incidencias-modal-image-thumb-fallback">IMG</span>

      <span class="incidencias-modal-image-open-badge">
        ${busy.isOpening ? "Abriendo..." : "Ver"}
      </span>
    </button>
  `;
}

function renderAttachmentActionButtons(file = {}, vm = {}) {
  const busy = getAttachmentBusyMeta(file, vm);
  const name = safeFilename(first(file.name, file.filename, file.fileName), "archivo");
  const noId = !busy.attachmentId;

  return `
    <div class="incidencias-modal-attachment-actions">
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-attachment-id="${attr(busy.attachmentId)}"
        ${disabledAttrs(noId || busy.isOpening || vm.submitting, busy.isOpening)}
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
        data-attachment-id="${attr(busy.attachmentId)}"
        ${disabledAttrs(noId || busy.isDownloading || vm.submitting, busy.isDownloading)}
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
    <div class="incidencias-modal-files-block incidencias-modal-files-block--compact" data-modal-files-block="true">
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
                  const id = getAttachmentId(file);
                  const name = safeFilename(first(file.name, file.filename, file.fileName), "Archivo");
                  const meta = [
                    cleanText(first(file.contentType, file.type), ""),
                    formatBytes(file.size),
                    file.uploadedAt ? formatDate(file.uploadedAt) : "",
                  ].filter(Boolean).join(" · ");

                  return `
                    <article class="incidencias-modal-attachment-card" data-attachment-id="${attr(id)}">
                      <div class="incidencias-modal-attachment-row">
                        ${renderAttachmentPreviewSquare(file, vm)}

                        <div class="incidencias-modal-attachment-copy">
                          <strong>${escapeHtml(name)}</strong>
                          <span>${escapeHtml(meta || "Archivo adjunto")}</span>
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
  const url = firstUrl(file?.url, file?.viewUrl, file?.openUrl, file?.downloadUrl, file?.signedUrl);

  if (!file || !url) return "";

  const filename = safeFilename(first(file.filename, file.fileName, file.name), "Documento");
  const type = cleanText(first(file.contentType, file.type, file.mimeType, file.mimetype), "");
  const size = formatBytes(file.size);
  const image = isPreviewImage(file);
  const pdf = isPreviewPdf(file);
  const meta = [type || "Vista previa", size].filter(Boolean).join(" · ");

  return `
    <section class="incidencias-modal-preview" data-modal-preview="true">
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
            class="incidencias-modal-preview-btn"
            aria-label="Cerrar vista previa"
          >
            Cerrar vista
          </button>
        </div>
      </div>

      <div class="${joinClasses("incidencias-modal-preview-frame", image ? "is-image" : "", pdf ? "is-pdf" : "")}">
        ${
          image
            ? `
              <img
                src="${attr(safeImageSrc(url))}"
                alt="${attr(filename)}"
                class="incidencias-modal-preview-image"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
              >
            `
            : `
              <iframe
                src="${attr(url)}"
                title="${attr(filename)}"
                class="incidencias-modal-preview-iframe"
                loading="lazy"
                referrerpolicy="no-referrer"
              ></iframe>
            `
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
        const body = cleanMultiline(entry.body, "Actualización registrada.");

        return `
          <article class="${joinClasses("incidencias-timeline-card", isComment ? "is-comment" : "", isCreated ? "is-created" : "")}">
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
  const clientName = getClientName(detail);
  const clientEmail = getClientEmail(detail);
  const category = getCategory(detail);

  const createdAtRaw = first(detail.createdAt, detail.raw?.createdAt, detail.lifecycle?.createdAt);
  const updatedAtRaw = first(
    detail.lastActivityAt,
    detail.updatedAt,
    detail.raw?.lastActivityAt,
    detail.raw?.updatedAt,
    detail.lifecycle?.lastActivityAt,
    detail.lifecycle?.updatedAt,
    createdAtRaw
  );

  const createdAt = formatDate(createdAtRaw);
  const updatedAgo = formatRelativeDate(updatedAtRaw);
  const attachments = getAttachments(detail);

  const status = getStatus(detail);
  const priority = getPriority(detail);

  return `
    <section
      id="${MODAL_ID}"
      class="incidencias-modal-root"
      data-incidencias-modal-root="true"
      data-template-version="${attr(INCIDENCIAS_MODAL_TEMPLATE_VERSION)}"
      data-ticket-id="${attr(ticketId)}"
      data-open="true"
      data-submitting="${vm.submitting ? "true" : "false"}"
    >
      <div
        class="incidencias-modal-overlay"
        data-incidencias-modal-overlay="true"
      >
        <div
          id="${PANEL_ID}"
          class="${joinClasses("incidencias-modal-panel", vm.submitting ? "is-submitting" : "")}"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incidencias-modal-title"
          tabindex="-1"
          data-incidencias-modal-panel="true"
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
                    data-ticket-id="${attr(ticketId)}"
                    class="incidencias-modal-id-chip"
                    aria-label="Copiar ID"
                    ${disabledAttrs(vm.submitting, vm.submitting)}
                  >
                    ${escapeHtml(ticketId || "—")}
                  </button>

                  ${renderChip(statusLabel(status), `status-${statusClass(status)}`)}
                  ${renderChip(priorityLabel(priority), `priority-${priorityClass(priority)}`)}
                  ${renderChip(category, "category")}
                </div>

                <h2 id="incidencias-modal-title" class="incidencias-modal-title">
                  ${escapeHtml(title)}
                </h2>

                <span class="incidencias-modal-updated">
                  ${escapeHtml(clientName)}
                  ${clientEmail ? ` · ${escapeHtml(clientEmail)}` : ""}
                  · Última actualización ${escapeHtml(updatedAgo)}
                </span>
              </div>
            </div>

            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.CLOSE}"
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
  return cleanMultiline(
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
  const message = cleanMultiline(comment, "");
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

  if (message.length > MAX_COMMENT_LENGTH) {
    return {
      valid: false,
      message: `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres.`,
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

    limits: {
      maxCommentLength: MAX_COMMENT_LENGTH,
    },

    policy: {
      templateOnly: true,

      indexCompatible: true,
      detailActionsStable: true,
      dataDetailActionOnly: true,
      dataFieldCompatibility: true,

      apiNormalizedTicketCompatible: true,
      requesterAliasCompatibility: true,
      requesterEmailAliasCompatibility: true,
      technicianAliasCompatibility: true,
      technicianAvatarAliasCompatibility: true,
      attachmentAliasCompatibility: true,
      timelineAliasCompatibility: true,
      invoiceAliasCompatibility: true,

      blobPreviewSupport: true,
      localhostImageSupport: true,
      sensitiveUrlProtection: true,

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

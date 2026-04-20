/* =========================================================
   Onion SPA - Incidencias Modal
   Archivo: src/views/incidencias/incidencias.modal.js

   CLIENT EXPERIENCE PRO · DETAIL MODAL · 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de incidencia
   - abrir / cerrar modal limpio
   - copiar el ID de la incidencia pulsando sobre el propio ID
   - permitir añadir nuevos comentarios / detalles
   - permitir adjuntar nuevos archivos desde el mismo modal
   - usar un único CTA final en el footer: "Actualizar incidencia"
   - al actualizar, subir adjuntos nuevos + comentar y forzar estado abierta
   - visualizar actividad, timeline y adjuntos existentes
   - abrir / descargar adjuntos existentes con bridge externo y toast
   - exponer bridge global para incidenciasView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - avatar fallback -> iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de submit
   - bridge flexible para acciones externas
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeIncidenciaModel,
  getStatusLabel,
  getPriorityLabel,
  getAvatarTheme,
  getInitials,
} from "./incidencias.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "incidencias-detail-modal-root";
const PANEL_ID = "incidencias-detail-modal-panel";

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isSubmitting: false,
  bindingsAttached: false,
  lastActiveElement: null,
  escHandler: null,
  commentDraft: "",
  feedbackMessage: "",
  feedbackType: "info",
  pendingFiles: [],
};

/* =========================================================
   HELPERS CORE
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function safeOn(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.on?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeOff(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function showToast(message = "", type = "info") {
  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](message);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(message);
  } catch {}
}

function setFeedback(message = "", type = "info") {
  modalState.feedbackMessage = safeText(message, "");
  modalState.feedbackType = safeText(type, "info");
}

function clearFeedback() {
  modalState.feedbackMessage = "";
  modalState.feedbackType = "info";
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function formatBytes(bytes = 0) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function dedupeFiles(files = []) {
  const map = new Map();

  safeArray(files).forEach((file) => {
    if (!(file instanceof File)) return;

    const key = [
      safeText(file.name, ""),
      safeNumber(file.size, 0),
      safeNumber(file.lastModified, 0),
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) {
      map.set(key, file);
    }
  });

  return Array.from(map.values());
}

function buildUrl(base = "", path = "") {
  const cleanBase = safeText(base, "").replace(/\/+$/, "");
  const cleanPath = safeText(path, "").replace(/^\/+/, "");

  if (!cleanBase || !cleanPath) return "";
  return `${cleanBase}/${cleanPath}`;
}

function joinApiPath(...parts) {
  return parts
    .map((part) => safeText(part, "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

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

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function getDetail(detail = {}) {
  return normalizeIncidenciaModel(safeObject(detail));
}

function getTicketId(detail = {}) {
  return safeText(
    first(
      detail.ticketId,
      detail.id,
      detail?.raw?.ticketId,
      detail?.raw?.id
    ),
    "—"
  );
}

function getClientAvatar(detail = {}) {
  return safeText(
    first(
      detail.clientAvatar,
      detail.avatar,
      detail.avatarUrl,
      detail?.cliente?.avatar,
      detail?.client?.avatar,
      detail?.client?.avatarUrl,
      detail?.raw?.clientAvatar,
      detail?.raw?.avatar,
      detail?.raw?.avatarUrl,
      detail?.raw?.client?.avatar,
      detail?.raw?.client?.avatarUrl,
      detail?.raw?.cliente?.avatar,
      detail?.raw?.cliente?.avatarUrl
    ),
    ""
  );
}

function getClientName(detail = {}) {
  return safeText(
    first(
      detail.clientName,
      detail.name,
      detail?.cliente?.nombre,
      detail?.cliente?.name,
      detail?.client?.name,
      detail?.receptor?.name,
      detail?.createdBy?.name,
      detail?.raw?.clientName,
      detail?.raw?.name,
      detail?.raw?.cliente?.nombre,
      detail?.raw?.cliente?.name,
      detail?.raw?.client?.name,
      detail?.raw?.receptor?.name,
      detail?.raw?.createdBy?.name
    ),
    "Cliente"
  );
}

function getDisplayDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail.message,
      detail.preview,
      detail?.raw?.description,
      detail?.raw?.descripcion,
      detail?.raw?.message,
      detail?.raw?.preview
    ),
    "Sin descripción."
  );
}

function getTecnico(detail = {}) {
  return safeText(
    first(
      detail.tecnico?.name,
      detail.assignedToName,
      detail?.raw?.tecnico?.name,
      detail?.raw?.assignedTo?.name,
      detail?.raw?.assignedToName
    ),
    "No asignado"
  );
}

function getFacturaRelacionada(detail = {}) {
  return safeText(
    first(
      detail.invoiceId,
      detail.facturaId,
      detail.factura,
      detail.invoiceCode,
      detail?.raw?.invoiceId,
      detail?.raw?.facturaId,
      detail?.raw?.factura,
      detail?.raw?.invoiceCode,
      detail?.raw?.facturaRelacionada,
      detail?.raw?.invoice?.id,
      detail?.raw?.factura?.id,
      detail?.raw?.invoice?.code,
      detail?.raw?.factura?.code
    ),
    "No vinculada"
  );
}

function resolveAttachmentUrl(item = {}, detail = {}) {
  const file = safeObject(item);
  const raw = safeObject(detail?.raw);

  const directUrl = safeText(
    first(
      file.url,
      file.href,
      file.downloadUrl,
      file.viewUrl,
      file.signedUrl,
      file.publicUrl,
      file.previewUrl,
      file.openUrl,
      file?.links?.download,
      file?.links?.view,
      file?.raw?.url,
      file?.raw?.downloadUrl,
      file?.raw?.viewUrl,
      file?.raw?.signedUrl
    ),
    ""
  );

  if (isAbsoluteUrl(directUrl)) {
    return directUrl;
  }

  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase
    ),
    ""
  );

  const ticketId = getTicketId(detail);

  const relativeDirectUrl = safeText(directUrl, "");
  if (relativeDirectUrl && apiBase) {
    return buildUrl(apiBase, relativeDirectUrl);
  }

  const candidatePath = safeText(
    first(
      file.path,
      file.storagePath,
      file.blobName,
      file.key,
      file.filename,
      file.fileName,
      file.name,
      file?.raw?.path,
      file?.raw?.storagePath,
      file?.raw?.blobName,
      file?.raw?.key
    ),
    ""
  );

  if (candidatePath && apiBase) {
    const normalized = candidatePath.replace(/^\/+/, "");

    const routeCandidates = [
      joinApiPath("tickets", ticketId, "attachments", file.id, "download"),
      joinApiPath("tickets", ticketId, "attachments", file.id),
      joinApiPath("incidencias", ticketId, "attachments", file.id, "download"),
      joinApiPath("incidencias", ticketId, "attachments", file.id),
      joinApiPath("uploads", normalized),
      normalized,
    ].filter(Boolean);

    for (const candidate of routeCandidates) {
      const built = buildUrl(apiBase, candidate);
      if (built) return built;
    }
  }

  const detailLevelDownloadBase = safeText(
    first(
      raw.attachmentsBaseUrl,
      raw.filesBaseUrl,
      raw.downloadBaseUrl
    ),
    ""
  );

  if (detailLevelDownloadBase) {
    const output = file.id
      ? buildUrl(detailLevelDownloadBase, file.id)
      : candidatePath
        ? buildUrl(detailLevelDownloadBase, candidatePath)
        : "";

    if (output) return output;
  }

  return "";
}

function getAttachments(detail = {}) {
  const attachments = first(
    detail.attachments,
    detail?.raw?.attachments,
    detail?.raw?.files,
    detail?.raw?.adjuntos
  );

  return safeArray(attachments).map((file, index) => {
    const item = safeObject(file);

    const attachment = {
      id: safeText(
        first(item.id, item.fileId, item.blobName),
        `attachment-${index + 1}`
      ),
      name: safeText(
        first(item.name, item.filename, item.fileName, item.title),
        `archivo_${index + 1}`
      ),
      url: "",
      path: safeText(first(item.path, item.storagePath, item.key), ""),
      size: safeNumber(item.size, 0),
      type: safeText(
        first(item.type, item.contentType, item.mimeType, item.mime),
        ""
      ),
      uploadedAt: first(item.uploadedAt, item.createdAt, item.date, null),
      raw: item,
    };

    attachment.url = resolveAttachmentUrl(item, detail);

    return attachment;
  });
}

function getTimeline(detail = {}) {
  const history = safeArray(
    first(
      detail.history,
      detail?.raw?.history,
      detail?.raw?.timeline,
      detail?.raw?.events
    )
  );

  const comments = safeArray(
    first(
      detail.comments,
      detail?.raw?.comments,
      detail?.raw?.notes,
      detail?.raw?.messages
    )
  );

  const normalizedHistory = history.map((entry, index) => {
    const item = safeObject(entry);

    return {
      id: safeText(first(item.id, item.eventId), `h-${index + 1}`),
      kind: "event",
      title: safeText(
        first(item.title, item.action, item.type, item.message, item.text),
        "Actualización"
      ),
      body: safeText(first(item.description, item.detail, item.body, ""), ""),
      author: safeText(
        first(item.byName, item.user, item.author, item.name),
        "Sistema"
      ),
      createdAt: first(item.createdAt, item.date, item.timestamp),
    };
  });

  const normalizedComments = comments.map((entry, index) => {
    const item = safeObject(entry);

    return {
      id: safeText(first(item.id, item.commentId), `c-${index + 1}`),
      kind: "comment",
      title: "Comentario",
      body: safeText(
        first(item.message, item.text, item.body, item.comment),
        ""
      ),
      author: safeText(
        first(item.byName, item.user, item.author, item.name),
        "Usuario"
      ),
      createdAt: first(item.createdAt, item.date, item.timestamp),
    };
  });

  return [...normalizedHistory, ...normalizedComments].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime() || 0;
    const timeB = new Date(b.createdAt || 0).getTime() || 0;
    return timeB - timeA;
  });
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["open", "abierta", "abierto"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["pending", "pendiente"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["progress", "in_progress", "in-progress", "en_proceso", "en proceso"].includes(key)) {
    return `
      color:#7dd3fc;
      background:color-mix(in srgb, #7dd3fc 14%, transparent);
      border:1px solid color-mix(in srgb, #7dd3fc 26%, transparent);
    `;
  }

  if (["resolved", "resuelta", "resuelto"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["closed", "cerrada", "cerrado"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getPriorityChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["low", "baja"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["medium", "media", "normal"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["high", "alta"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["urgent", "urgente", "critical", "critica", "crítica"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getFeedbackStyle(type = "info") {
  const key = safeText(type, "info").toLowerCase();

  if (key === "success") {
    return `
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 30%, var(--border-soft));
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 10%, transparent), transparent 85%),
        var(--surface-1, var(--surface-glass));
    `;
  }

  if (key === "error") {
    return `
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 30%, var(--border-soft));
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 85%),
        var(--surface-1, var(--surface-glass));
    `;
  }

  return `
    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 85%),
      var(--surface-1, var(--surface-glass));
  `;
}

function renderChip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold, 700);
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(detail = {}) {
  const initials = safeText(detail.initials, getInitials(getClientName(detail) || "ON"));
  const avatarUrl = getClientAvatar(detail);
  const theme = getAvatarTheme(
    safeText(first(detail.ticketId, getClientName(detail)), "onion")
  );

  const themeMap = {
    violet: {
      bg: "linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12))",
      border: "rgba(124,92,255,.28)",
      text: "#efeaff",
      glow: "rgba(124,92,255,.22)",
    },
    emerald: {
      bg: "linear-gradient(135deg, rgba(54,198,144,.28), rgba(35,131,95,.12))",
      border: "rgba(54,198,144,.28)",
      text: "#ddfff1",
      glow: "rgba(54,198,144,.22)",
    },
    blue: {
      bg: "linear-gradient(135deg, rgba(96,165,250,.28), rgba(37,99,235,.12))",
      border: "rgba(96,165,250,.28)",
      text: "#e7f2ff",
      glow: "rgba(96,165,250,.22)",
    },
    amber: {
      bg: "linear-gradient(135deg, rgba(255,188,66,.28), rgba(217,119,6,.12))",
      border: "rgba(255,188,66,.28)",
      text: "#fff4d8",
      glow: "rgba(255,188,66,.22)",
    },
    rose: {
      bg: "linear-gradient(135deg, rgba(255,107,107,.28), rgba(190,24,93,.12))",
      border: "rgba(255,107,107,.28)",
      text: "#ffe4e4",
      glow: "rgba(255,107,107,.22)",
    },
    purple: {
      bg: "linear-gradient(135deg, rgba(179,136,255,.28), rgba(109,40,217,.12))",
      border: "rgba(179,136,255,.28)",
      text: "#f3e8ff",
      glow: "rgba(179,136,255,.22)",
    },
    cyan: {
      bg: "linear-gradient(135deg, rgba(34,211,238,.28), rgba(8,145,178,.12))",
      border: "rgba(34,211,238,.28)",
      text: "#e6fcff",
      glow: "rgba(34,211,238,.22)",
    },
    orange: {
      bg: "linear-gradient(135deg, rgba(251,146,60,.28), rgba(194,65,12,.12))",
      border: "rgba(251,146,60,.28)",
      text: "#fff0e4",
      glow: "rgba(251,146,60,.22)",
    },
  };

  const palette = themeMap[theme] || themeMap.violet;

  if (avatarUrl) {
    return `
      <div
        style="
          position:relative;
          flex:0 0 68px;
          width:68px;
          height:68px;
          border-radius:20px;
          overflow:hidden;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          box-shadow:0 16px 36px rgba(0,0,0,.24);
        "
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
          style="
            display:block;
            width:100%;
            height:100%;
            object-fit:cover;
          "
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-modal-avatar-fallback','true');"
        />
        <span
          style="
            position:absolute;
            inset:0;
            display:none;
            place-items:center;
            background:${palette.bg};
            border:1px solid ${palette.border};
            color:${palette.text};
            font-size:22px;
            font-weight:var(--weight-black, 800);
            letter-spacing:.03em;
            box-shadow:0 12px 28px ${palette.glow};
          "
        >
          ${escapeHtml(initials)}
        </span>
      </div>
    `;
  }

  return `
    <div
      style="
        position:relative;
        flex:0 0 68px;
        width:68px;
        height:68px;
        border-radius:20px;
        display:grid;
        place-items:center;
        background:${palette.bg};
        border:1px solid ${palette.border};
        color:${palette.text};
        font-size:22px;
        font-weight:var(--weight-black, 800);
        letter-spacing:.03em;
        box-shadow:0 12px 28px ${palette.glow};
      "
    >
      ${escapeHtml(initials)}
    </div>
  `;
}

/* =========================================================
   RENDER PARTIALS
========================================================= */

function renderMetaField(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint, #8b8b8b);
          text-transform:uppercase;
          letter-spacing:.08em;
          font-weight:var(--weight-bold, 700);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong, #fff);
          font-size:14px;
          line-height:1.4;
          word-break:break-word;
        "
      >
        ${escapeHtml(safeText(value, "—"))}
      </strong>
    </div>
  `;
}

function renderFeedbackBox() {
  const message = safeText(modalState.feedbackMessage, "");
  if (!message) return "";

  const type = safeText(modalState.feedbackType, "info");

  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:14px 16px;
        border-radius:16px;
        ${getFeedbackStyle(type)}
      "
    >
      <strong style="color:var(--text-strong); font-size:14px;">
        ${
          type === "error"
            ? "No se ha podido completar la acción"
            : type === "success"
              ? "Acción completada"
              : "Información"
        }
      </strong>

      <span
        style="
          color:var(--text-dim);
          font-size:13px;
          line-height:1.5;
        "
      >
        ${escapeHtml(message)}
      </span>
    </div>
  `;
}

function renderPendingFiles() {
  const files = safeArray(modalState.pendingFiles);

  if (!files.length) {
    return `
      <div
        style="
          color:var(--text-dim);
          font-size:12px;
          line-height:1.45;
        "
      >
        No has seleccionado archivos nuevos.
      </div>
    `;
  }

  return `
    <div style="display:grid; gap:8px;">
      ${files
        .map((file, index) => `
          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:12px;
              padding:12px 14px;
              border-radius:14px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
            "
          >
            <div style="display:grid; gap:4px; min-width:0;">
              <strong
                style="
                  color:var(--text-strong);
                  font-size:13px;
                  line-height:1.35;
                  word-break:break-word;
                "
              >
                ${escapeHtml(file.name || `archivo_${index + 1}`)}
              </strong>

              <span
                style="
                  color:var(--text-dim);
                  font-size:12px;
                "
              >
                ${escapeHtml(
                  [
                    safeText(file.type, ""),
                    formatBytes(file.size),
                  ].filter(Boolean).join(" · ") || "Archivo preparado"
                )}
              </span>
            </div>

            <button
              type="button"
              data-modal-action="remove-pending-file"
              data-file-index="${index}"
              style="
                min-height:36px;
                padding:0 12px;
                border-radius:12px;
                border:1px solid var(--border-soft);
                background:transparent;
                color:var(--text-dim);
                font-weight:var(--weight-bold, 700);
                cursor:pointer;
                flex:0 0 auto;
              "
            >
              Quitar
            </button>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderAttachments(detail = {}) {
  const files = getAttachments(detail);

  return `
    <div style="display:grid; gap:14px;">
      <div
        style="
          display:grid;
          gap:10px;
          padding:16px;
          border-radius:18px;
          border:1px dashed var(--border-soft);
          background:var(--surface-1, var(--surface-glass));
        "
      >
        <div style="display:grid; gap:6px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:14px;
              line-height:1.35;
            "
          >
            Añadir documentos
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.5;
            "
          >
            Puedes adjuntar capturas, PDFs u otros archivos útiles. Se enviarán cuando pulses “Actualizar incidencia”.
          </span>
        </div>

        <input
          id="incidencias-modal-attachments-input"
          type="file"
          data-modal-field="attachments"
          multiple
          ${modalState.isSubmitting ? "disabled" : ""}
          style="
            width:100%;
            color:var(--text-soft);
          "
        />

        ${renderPendingFiles()}
      </div>

      <div style="display:grid; gap:10px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:18px;
            letter-spacing:-.02em;
          "
        >
          Documentos actuales
        </h3>

        ${
          !files.length
            ? `
              <div
                style="
                  padding:14px;
                  border-radius:16px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-dim);
                "
              >
                No hay archivos adjuntos en esta incidencia.
              </div>
            `
            : `
              <div
                style="
                  display:grid;
                  gap:10px;
                "
              >
                ${files
                  .map((file) => {
                    const hasLink = isAbsoluteUrl(file.url);

                    return `
                      <article
                        style="
                          display:grid;
                          gap:12px;
                          padding:14px 16px;
                          border-radius:16px;
                          border:1px solid var(--border-soft);
                          background:var(--surface-glass);
                        "
                      >
                        <div
                          style="
                            display:flex;
                            justify-content:space-between;
                            align-items:flex-start;
                            gap:14px;
                            flex-wrap:wrap;
                          "
                        >
                          <div style="display:grid; gap:4px; min-width:0; flex:1 1 320px;">
                            <strong
                              style="
                                min-width:0;
                                font-weight:var(--weight-semibold, 600);
                                word-break:break-word;
                                color:var(--text-strong);
                              "
                            >
                              ${escapeHtml(file.name)}
                            </strong>

                            <span
                              style="
                                color:var(--text-dim);
                                font-size:12px;
                              "
                            >
                              ${escapeHtml(
                                [
                                  file.type,
                                  formatBytes(file.size),
                                  file.uploadedAt ? formatDate(file.uploadedAt) : "",
                                ].filter(Boolean).join(" · ") || "Archivo adjunto"
                              )}
                            </span>
                          </div>

                          <div
                            style="
                              display:flex;
                              gap:8px;
                              flex-wrap:wrap;
                              justify-content:flex-end;
                              flex:0 0 auto;
                            "
                          >
                            <button
                              type="button"
                              data-modal-action="open-attachment"
                              data-attachment-id="${escapeHtml(file.id)}"
                              style="
                                min-height:38px;
                                padding:0 12px;
                                border-radius:12px;
                                border:1px solid var(--border-soft);
                                background:transparent;
                                color:var(--text-soft);
                                font-weight:var(--weight-bold, 700);
                                cursor:pointer;
                              "
                            >
                              ${hasLink ? "Visualizar" : "Abrir"}
                            </button>

                            <button
                              type="button"
                              data-modal-action="download-attachment"
                              data-attachment-id="${escapeHtml(file.id)}"
                              style="
                                min-height:38px;
                                padding:0 12px;
                                border-radius:12px;
                                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                                color:var(--text-strong);
                                font-weight:var(--weight-bold, 700);
                                cursor:pointer;
                              "
                            >
                              Descargar
                            </button>
                          </div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderTimeline(detail = {}) {
  const timeline = getTimeline(detail);

  if (!timeline.length) {
    return `
      <div
        style="
          padding:14px;
          border-radius:16px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-dim);
        "
      >
        Todavía no hay actividad registrada en esta incidencia.
      </div>
    `;
  }

  return `
    <div
      style="
        display:grid;
        gap:12px;
      "
    >
      ${timeline
        .map((entry) => {
          const kind = safeText(entry.kind, "event");
          const rawTitle = safeText(entry.title, "");
          const rawBody = safeText(entry.body, "");
          const normalizedTitle = rawTitle.toLowerCase();

          const showTitle =
            !!rawTitle &&
            !["created", "creation", "creada", "creado"].includes(normalizedTitle);

          const content = rawBody || rawTitle || "Actualización registrada";

          return `
            <article
              style="
                display:grid;
                gap:10px;
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  gap:10px;
                  align-items:flex-start;
                  flex-wrap:wrap;
                "
              >
                <div style="display:grid; gap:6px; min-width:0; flex:1 1 240px;">
                  ${
                    showTitle
                      ? `
                        <strong
                          style="
                            color:var(--text-strong);
                            font-size:14px;
                            line-height:1.35;
                            word-break:break-word;
                          "
                        >
                          ${escapeHtml(rawTitle)}
                        </strong>
                      `
                      : ""
                  }

                  <p
                    style="
                      margin:0;
                      color:${kind === "comment" ? "var(--text-soft)" : "var(--text-dim)"};
                      font-size:13px;
                      line-height:1.6;
                      white-space:pre-wrap;
                      word-break:break-word;
                    "
                  >
                    ${escapeHtml(content)}
                  </p>
                </div>

                <div
                  style="
                    display:grid;
                    gap:4px;
                    justify-items:end;
                    flex:0 0 auto;
                  "
                >
                  <span
                    style="
                      color:var(--text-soft);
                      font-size:12px;
                      font-weight:var(--weight-semibold, 600);
                    "
                  >
                    ${escapeHtml(safeText(entry.author, "Sistema"))}
                  </span>

                  <span
                    style="
                      color:var(--text-dim);
                      font-size:12px;
                    "
                  >
                    ${escapeHtml(formatDate(entry.createdAt))}
                  </span>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderComposer() {
  const draft = safeText(modalState.commentDraft, "");

  return `
    <section
      style="
        display:grid;
        gap:12px;
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:10px;
          align-items:flex-start;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid; gap:4px;">
          <h3
            style="
              margin:0;
              color:var(--text-strong);
              font-size:20px;
              letter-spacing:-.02em;
            "
          >
            Añadir más información
          </h3>

          <span
            style="
              color:var(--text-dim);
              font-size:13px;
              line-height:1.5;
            "
          >
            Puedes escribir una actualización, adjuntar archivos o hacer ambas cosas a la vez.
          </span>
        </div>
      </div>

      <div
        style="
          display:grid;
          gap:10px;
        "
      >
        <textarea
          id="incidencias-modal-comment-input"
          data-modal-field="comment"
          placeholder="Escribe aquí nuevos detalles, contexto adicional o cualquier actualización que quieras añadir..."
          ${modalState.isSubmitting ? "disabled" : ""}
          style="
            width:100%;
            min-height:140px;
            padding:14px;
            border-radius:16px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
            color:var(--text-strong);
            outline:none;
            resize:vertical;
            line-height:1.6;
          "
        >${escapeHtml(draft)}</textarea>

        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            align-items:center;
            flex-wrap:wrap;
          "
        >
          <span
            style="
              color:var(--text-dim);
              font-size:12px;
            "
          >
            Al actualizar, la incidencia volverá a abierta y se procesarán también los documentos pendientes.
          </span>
        </div>
      </div>
    </section>
  `;
}

function renderLoadingOverlay(label = "Procesando...") {
  return `
    <div
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:20px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 76%, transparent);
        backdrop-filter:blur(4px);
        z-index:5;
      "
    >
      <div
        style="
          display:grid;
          justify-items:center;
          gap:12px;
          min-width:min(100%, 240px);
          padding:18px 20px;
          border-radius:18px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent), var(--surface-1, var(--surface-glass));
          box-shadow:0 20px 40px rgba(0,0,0,.22);
        "
      >
        <span
          aria-hidden="true"
          style="
            width:28px;
            height:28px;
            border-radius:999px;
            border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
            border-top-color:var(--accent, #7c5cff);
            animation:incidenciasModalSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(label)}
        </strong>
      </div>
    </div>
  `;
}

function renderFooter(detail = {}) {
  const ticketId = getTicketId(detail);

  return `
    <div
      style="
        position:sticky;
        bottom:0;
        z-index:3;
        display:flex;
        justify-content:flex-end;
        gap:10px;
        padding:18px 24px 24px;
        border-top:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, rgba(18,18,18,.55), rgba(18,18,18,.92)),
          var(--surface-1, #121212);
        backdrop-filter:blur(12px);
      "
    >
      <button
        type="button"
        data-modal-action="submit-update"
        data-ticket-id="${escapeHtml(ticketId)}"
        ${modalState.isSubmitting ? "disabled" : ""}
        style="
          min-height:46px;
          padding:0 18px;
          border-radius:14px;
          border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
          background:var(--btn-primary-bg, var(--accent, #7c5cff));
          color:var(--btn-primary-text, #fff);
          font-weight:var(--weight-bold, 700);
          cursor:${modalState.isSubmitting ? "wait" : "pointer"};
          opacity:${modalState.isSubmitting ? ".82" : "1"};
          box-shadow:0 16px 36px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
        "
      >
        ${
          modalState.isSubmitting
            ? `
              <span style="display:inline-flex; align-items:center; gap:8px;">
                <span
                  aria-hidden="true"
                  style="
                    width:14px;
                    height:14px;
                    border-radius:999px;
                    border:2px solid rgba(255,255,255,.28);
                    border-top-color:#fff;
                    animation:incidenciasModalSpin .8s linear infinite;
                  "
                ></span>
                Actualizando...
              </span>
            `
            : "Actualizar incidencia"
        }
      </button>
    </div>
  `;
}

function renderModalInner(detail = {}) {
  const item = getDetail(detail);

  const ticketId = getTicketId(item);
  const title = safeText(
    first(
      item.title,
      item.subject,
      item?.raw?.title,
      item?.raw?.subject,
      item?.raw?.asunto
    ),
    "Incidencia"
  );

  const description = getDisplayDescription(item);
  const tecnico = getTecnico(item);
  const facturaRelacionada = getFacturaRelacionada(item);

  const createdAt = formatDate(first(item.createdAt, item?.raw?.createdAt));
  const updatedAgo = formatRelativeDate(
    first(item.updatedAt, item?.raw?.updatedAt, item?.raw?.createdAt)
  );

  const attachments = getAttachments(item);

  const statusRaw = safeText(first(item.status, item?.raw?.status, item?.raw?.estado), "open");
  const priorityRaw = safeText(first(item.priority, item?.raw?.priority, item?.raw?.prioridad), "medium");

  const statusLabel = getStatusLabel(statusRaw);
  const priorityLabel = getPriorityLabel(priorityRaw);

  const busyLabel = modalState.isSubmitting ? "Actualizando incidencia..." : "";

  return `
    <div
      data-incidencias-modal-overlay="true"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:24px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.68);
        backdrop-filter:blur(10px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-modal-title"
        tabindex="-1"
        style="
          position:relative;
          width:min(1240px, 100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >
        ${busyLabel ? renderLoadingOverlay(busyLabel) : ""}

        <div
          style="
            padding:24px;
            border-bottom:1px solid var(--border-soft);
            display:flex;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div
            style="
              display:flex;
              gap:16px;
              align-items:flex-start;
              min-width:min(100%, 560px);
            "
          >
            ${renderAvatar(item)}

            <div style="display:grid; gap:10px; min-width:0;">
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <button
                  type="button"
                  data-modal-action="copy"
                  data-ticket-id="${escapeHtml(ticketId)}"
                  title="Copiar ID"
                  style="
                    display:inline-flex;
                    align-items:center;
                    min-height:28px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:12px;
                    font-weight:var(--weight-bold, 700);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                    cursor:pointer;
                  "
                >
                  ${escapeHtml(ticketId)}
                </button>

                ${renderChip(statusLabel, getStatusChipStyle(statusRaw))}
                ${renderChip(priorityLabel, getPriorityChipStyle(priorityRaw))}
              </div>

              <div style="display:grid; gap:6px; min-width:0;">
                <h2
                  id="incidencias-modal-title"
                  style="
                    margin:0;
                    color:var(--text-strong);
                    font-size:clamp(28px, 4vw, 42px);
                    line-height:1;
                    letter-spacing:-.04em;
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(title)}
                </h2>

                <span
                  style="
                    color:var(--text-dim);
                    font-size:14px;
                    line-height:1.5;
                  "
                >
                  Última actualización ${escapeHtml(updatedAgo)}
                </span>
              </div>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:flex-start;
            "
          >
            <button
              type="button"
              data-modal-close="true"
              aria-label="Cerrar modal"
              style="
                width:48px;
                height:48px;
                border:none;
                border-radius:16px;
                cursor:pointer;
                font-size:20px;
                background:var(--surface-glass);
                color:var(--text-strong);
                border:1px solid var(--border-soft);
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style="
            padding:24px;
            display:grid;
            gap:22px;
          "
        >
          ${renderFeedbackBox()}

          <div
            style="
              display:grid;
              grid-template-columns:repeat(4, minmax(0, 1fr));
              gap:14px;
            "
            class="incidencias-modal-meta-grid"
          >
            ${renderMetaField("Técnico", tecnico)}
            ${renderMetaField("Factura", facturaRelacionada)}
            ${renderMetaField("Creada", createdAt)}
            ${renderMetaField("Adjuntos", String(attachments.length))}
          </div>

          <section
            style="
              display:grid;
              gap:10px;
            "
          >
            <div
              style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                flex-wrap:wrap;
              "
            >
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Descripción de la incidencia
              </h3>
            </div>

            <div
              style="
                padding:18px;
                border-radius:18px;
                background:var(--surface-glass);
                border:1px solid var(--border-soft);
                color:var(--text-soft);
                line-height:1.7;
                white-space:pre-wrap;
                word-break:break-word;
              "
            >
              ${escapeHtml(description)}
            </div>
          </section>

          ${renderComposer(item)}

          <div
            style="
              display:grid;
              grid-template-columns:minmax(0, 1.32fr) minmax(360px, .88fr);
              gap:18px;
              align-items:start;
            "
            class="incidencias-modal-lower-grid"
          >
            <section
              style="
                display:grid;
                gap:10px;
              "
            >
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Documentos
              </h3>

              ${renderAttachments(item)}
            </section>

            <section
              style="
                display:grid;
                gap:10px;
              "
            >
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Historial y actividad
              </h3>

              ${renderTimeline(item)}
            </section>
          </div>
        </div>

        ${renderFooter(item)}

        <style>
          @keyframes incidenciasModalSpin {
            to { transform: rotate(360deg); }
          }

          #${PANEL_ID} [data-modal-avatar-fallback="true"] > img {
            display:none !important;
          }

          #${PANEL_ID} [data-modal-avatar-fallback="true"] > span {
            display:grid !important;
          }

          @media (max-width: 1120px) {
            .incidencias-modal-lower-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 980px) {
            .incidencias-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }

          @media (max-width: 640px) {
            .incidencias-modal-meta-grid {
              grid-template-columns: 1fr !important;
            }
          }
        </style>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  let root = getRoot();

  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = MODAL_ID;
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  try {
    document.body.classList.add("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "";
  } catch {}
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

/* =========================================================
   ESC HANDLER
========================================================= */

function detachEscHandler() {
  if (!modalState.escHandler) {
    return;
  }

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape") {
      closeIncidenciasModal();
    }
  };

  try {
    document.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

/* =========================================================
   EXTERNAL ACTION BRIDGE
========================================================= */

async function callExternalAction(action = "", payload = {}) {
  const actionName = safeText(action, "");

  if (!actionName) return null;

  const candidates = [
    AppCore?.modules?.IncidenciasModalActions?.[actionName],
    AppCore?.modules?.IncidenciasActions?.[actionName],
    AppCore?.modules?.Incidencias?.[actionName],
    window?.OnionIncidenciasModalActions?.[actionName],
    window?.OnionIncidenciasActions?.[actionName],
    window?.IncidenciasActions?.[actionName],
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "function") {
      continue;
    }

    try {
      return await candidate(payload);
    } catch (error) {
      throw error;
    }
  }

  return null;
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal() {
  const root = ensureRoot();

  if (!modalState.detail) {
    detachRootBindings();
    root.innerHTML = "";
    return root;
  }

  detachRootBindings();

  root.innerHTML = renderModalInner(modalState.detail);
  modalState.bindingsAttached = false;

  return root;
}

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function openIncidenciasModal(detail = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = getDetail(detail);
  modalState.isOpen = true;
  modalState.isSubmitting = false;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];
  clearFeedback();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:modal:opened", {
    detail: modalState.detail,
    ticketId: getTicketId(modalState.detail),
  });

  return true;
}

export function closeIncidenciasModal() {
  const root = getRoot();

  modalState.isOpen = false;
  modalState.isSubmitting = false;
  modalState.detail = null;
  modalState.commentDraft = "";
  modalState.pendingFiles = [];
  clearFeedback();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("incidencias:modal:closed", {});

  return true;
}

export function updateIncidenciasModal(detail = {}) {
  if (!modalState.isOpen) {
    return openIncidenciasModal(detail);
  }

  modalState.detail = getDetail(detail);
  modalState.isSubmitting = false;

  renderModal();
  attachRootBindings();
  focusPanel();

  return true;
}

/* =========================================================
   ACTIONS
========================================================= */

async function handleCopy(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    setFeedback("No hay ID disponible para copiar.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  let copied = false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(id);
      copied = true;
    }
  } catch {}

  safeEmit("incidencias:modal:copy", {
    ticketId: id,
  });

  if (copied) {
    setFeedback(`ID ${id} copiado al portapapeles.`, "success");
    showToast("ID copiado", "success");
  } else {
    setFeedback(`Se ha solicitado copiar el ID ${id}.`, "info");
    showToast("No se pudo copiar automáticamente el ID.", "info");
  }

  renderModal();
  attachRootBindings();

  return true;
}

function mergeDetailWithOpenStatus(detail = {}, response = null) {
  const currentDetail = getDetail(detail);
  const raw = safeObject(currentDetail.raw);
  const responseObject = safeObject(response);

  if (Object.keys(responseObject).length) {
    return getDetail({
      ...currentDetail,
      ...responseObject,
      status: "open",
      raw: {
        ...raw,
        ...(safeObject(responseObject?.raw || responseObject)),
        status: "open",
        estado: "open",
      },
    });
  }

  return getDetail({
    ...currentDetail,
    status: "open",
    raw: {
      ...raw,
      status: "open",
      estado: "open",
    },
  });
}

async function handleSubmitUpdate(ticketId = "") {
  const id = safeText(ticketId, "");
  const message = normalizeWhitespace(modalState.commentDraft);
  const files = dedupeFiles(modalState.pendingFiles);

  if (!id) {
    setFeedback("No se ha podido identificar la incidencia.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  if (!message && !files.length) {
    setFeedback("Añade una actualización o selecciona al menos un archivo antes de continuar.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  if (message && message.length < 4) {
    setFeedback("Añade un poco más de detalle antes de enviar la actualización.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  modalState.isSubmitting = true;
  clearFeedback();
  renderModal();
  attachRootBindings();

  try {
    let nextDetail = getDetail(modalState.detail);

    if (files.length) {
      const uploadResponse = await callExternalAction("uploadTicketAttachments", {
        ticketId: id,
        files,
        detail: nextDetail,
      });

      safeEmit("incidencias:modal:upload", {
        ticketId: id,
        files,
      });

      if (uploadResponse && typeof uploadResponse === "object") {
        nextDetail = getDetail(uploadResponse);
      } else {
        const raw = safeObject(nextDetail.raw);

        const localAttachments = files.map((file, index) => ({
          id: `local-file-${Date.now()}-${index}`,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString(),
          url: "",
          path: "",
        }));

        const nextAttachments = [
          ...safeArray(first(nextDetail.attachments, raw.attachments)),
          ...localAttachments,
        ];

        nextDetail = getDetail({
          ...nextDetail,
          attachments: nextAttachments,
          raw: {
            ...raw,
            attachments: nextAttachments,
          },
        });
      }
    }

    if (message) {
      const commentResponse = await callExternalAction("commentTicket", {
        ticketId: id,
        message,
        detail: nextDetail,
        status: "open",
      });

      safeEmit("incidencias:modal:comment", {
        ticketId: id,
        message,
        status: "open",
      });

      if (commentResponse && typeof commentResponse === "object") {
        nextDetail = mergeDetailWithOpenStatus(nextDetail, commentResponse);
      } else {
        const currentDetail = getDetail(nextDetail);
        const raw = safeObject(currentDetail.raw);

        const nextComments = [
          {
            id: `local-${Date.now()}`,
            message,
            author: "Tú",
            createdAt: new Date().toISOString(),
          },
          ...safeArray(first(currentDetail.comments, raw.comments)),
        ];

        nextDetail = getDetail({
          ...currentDetail,
          status: "open",
          comments: nextComments,
          raw: {
            ...raw,
            status: "open",
            estado: "open",
            comments: nextComments,
          },
        });
      }
    } else {
      nextDetail = mergeDetailWithOpenStatus(nextDetail, null);
    }

    modalState.detail = nextDetail;
    modalState.commentDraft = "";
    modalState.pendingFiles = [];

    if (message && files.length) {
      setFeedback("La actualización y los documentos se han enviado correctamente. La incidencia vuelve a abierta.", "success");
    } else if (message) {
      setFeedback("Tu actualización se ha añadido correctamente y la incidencia vuelve a abierta.", "success");
    } else {
      setFeedback("Los documentos se han añadido correctamente y la incidencia permanece abierta.", "success");
    }

    showToast("Incidencia actualizada", "success");
    return true;
  } catch (error) {
    setFeedback(
      safeText(
        first(
          error?.message,
          error?.response?.message,
          error?.data?.message,
          "No se pudo actualizar la incidencia."
        ),
        "No se pudo actualizar la incidencia."
      ),
      "error"
    );

    showToast("No se pudo actualizar la incidencia.", "error");
    return false;
  } finally {
    modalState.isSubmitting = false;
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

function getAttachmentById(attachmentId = "") {
  const files = getAttachments(modalState.detail);
  return files.find((file) => safeText(file.id, "") === safeText(attachmentId, ""));
}

async function handleAttachmentAction(attachmentId = "", mode = "open") {
  const attachment = getAttachmentById(attachmentId);
  const ticketId = getTicketId(modalState.detail);

  if (!attachment) {
    setFeedback("No se ha encontrado el adjunto solicitado.", "error");
    showToast("Adjunto no encontrado.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  const resolvedUrl = safeText(attachment.url, "");

  try {
    const response = await callExternalAction(
      mode === "download" ? "downloadTicketAttachment" : "openTicketAttachment",
      {
        ticketId,
        attachment,
        detail: modalState.detail,
      }
    );

    if (typeof response === "string" && isAbsoluteUrl(response)) {
      window.open(response, "_blank", "noopener,noreferrer");
      showToast(
        mode === "download" ? "Descarga iniciada." : "Abriendo documento.",
        "success"
      );
      return true;
    }

    if (response && typeof response === "object") {
      const responseUrl = safeText(
        first(
          response.url,
          response.downloadUrl,
          response.viewUrl,
          response.href
        ),
        ""
      );

      if (isAbsoluteUrl(responseUrl)) {
        window.open(responseUrl, "_blank", "noopener,noreferrer");
        showToast(
          mode === "download" ? "Descarga iniciada." : "Abriendo documento.",
          "success"
        );
        return true;
      }
    }
  } catch (error) {
    setFeedback(
      safeText(
        first(
          error?.message,
          error?.response?.message,
          error?.data?.message,
          "No se pudo abrir el adjunto."
        ),
        "No se pudo abrir el adjunto."
      ),
      "error"
    );

    showToast(
      mode === "download"
        ? "No se pudo descargar el adjunto."
        : "No se pudo abrir el adjunto.",
      "error"
    );

    renderModal();
    attachRootBindings();
    return false;
  }

  if (resolvedUrl) {
    try {
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
      showToast(
        mode === "download" ? "Descarga iniciada." : "Abriendo documento.",
        "success"
      );
      return true;
    } catch {}
  }

  safeEmit("incidencias:modal:attachment", {
    ticketId,
    attachment,
    mode,
  });

  setFeedback(
    "Este adjunto no trae una URL pública directa. Conecta el endpoint de apertura/descarga en el bridge de incidencias para resolverlo.",
    "info"
  );

  showToast(
    "Este adjunto todavía no tiene enlace resuelto.",
    "info"
  );

  renderModal();
  attachRootBindings();
  return false;
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-modal-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.modalField, "");

    if (fieldName === "comment") {
      modalState.commentDraft = field.value || "";
      return;
    }

    if (fieldName === "attachments") {
      modalState.pendingFiles = dedupeFiles([
        ...safeArray(modalState.pendingFiles),
        ...Array.from(field.files || []),
      ]);

      renderModal();
      attachRootBindings();
      focusPanel();
    }
  };

  const onClick = async (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");
    if (closeBtn) {
      event.preventDefault();
      closeIncidenciasModal();
      return;
    }

    const copyBtn = event.target.closest('[data-modal-action="copy"]');
    if (copyBtn) {
      event.preventDefault();
      await handleCopy(copyBtn.dataset.ticketId || "");
      return;
    }

    const submitBtn = event.target.closest('[data-modal-action="submit-update"]');
    if (submitBtn) {
      event.preventDefault();
      await handleSubmitUpdate(submitBtn.dataset.ticketId || "");
      return;
    }

    const openAttachmentBtn = event.target.closest('[data-modal-action="open-attachment"]');
    if (openAttachmentBtn) {
      event.preventDefault();
      await handleAttachmentAction(openAttachmentBtn.dataset.attachmentId || "", "open");
      return;
    }

    const downloadAttachmentBtn = event.target.closest('[data-modal-action="download-attachment"]');
    if (downloadAttachmentBtn) {
      event.preventDefault();
      await handleAttachmentAction(downloadAttachmentBtn.dataset.attachmentId || "", "download");
      return;
    }

    const removePendingBtn = event.target.closest('[data-modal-action="remove-pending-file"]');
    if (removePendingBtn) {
      event.preventDefault();

      const index = safeNumber(removePendingBtn.dataset.fileIndex, -1);

      if (index >= 0) {
        modalState.pendingFiles = safeArray(modalState.pendingFiles).filter((_, i) => i !== index);
        renderModal();
        attachRootBindings();
        focusPanel();
      }

      return;
    }

    const overlay = event.target.closest("[data-incidencias-modal-overlay='true']");
    const panel = event.target.closest("[data-incidencias-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeIncidenciasModal();
    }
  };

  root.__incidenciasModalInputHandler = onInput;
  root.__incidenciasModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__incidenciasModalInputHandler) {
    try {
      root.removeEventListener("input", root.__incidenciasModalInputHandler);
    } catch {}
    delete root.__incidenciasModalInputHandler;
  }

  if (root.__incidenciasModalClickHandler) {
    try {
      root.removeEventListener("click", root.__incidenciasModalClickHandler);
    } catch {}
    delete root.__incidenciasModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;
  openIncidenciasModal(detail);
}

function handleCloseEvent() {
  closeIncidenciasModal();
}

function handleOpenedDetailEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  if (modalState.isOpen) {
    updateIncidenciasModal(detail);
  }
}

function handleUpdateEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;
  updateIncidenciasModal(detail);
}

function handleCommentSuccess(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail || !modalState.isOpen) return;

  modalState.commentDraft = "";
  modalState.detail = getDetail({
    ...detail,
    status: "open",
    raw: {
      ...safeObject(detail?.raw || detail),
      status: "open",
      estado: "open",
    },
  });

  setFeedback("Tu actualización se ha registrado correctamente y la incidencia vuelve a abierta.", "success");
  renderModal();
  attachRootBindings();
  focusPanel();
}

function handleUploadSuccess(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail || !modalState.isOpen) return;

  modalState.pendingFiles = [];
  modalState.detail = getDetail(detail);
  setFeedback("Los documentos se han añadido correctamente.", "success");
  renderModal();
  attachRootBindings();
  focusPanel();
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("incidencias:modal:open", handleOpenEvent);
  safeOn("incidencias:modal:close", handleCloseEvent);
  safeOn("incidencias:modal:update", handleUpdateEvent);
  safeOn("incidencias:open:success", handleOpenedDetailEvent);
  safeOn("incidencias:comment:success", handleCommentSuccess);
  safeOn("incidencias:upload:success", handleUploadSuccess);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("incidencias:modal:open", handleOpenEvent);
  safeOff("incidencias:modal:close", handleCloseEvent);
  safeOff("incidencias:modal:update", handleUpdateEvent);
  safeOff("incidencias:open:success", handleOpenedDetailEvent);
  safeOff("incidencias:comment:success", handleCommentSuccess);
  safeOff("incidencias:upload:success", handleUploadSuccess);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionIncidenciasModal = {
  open(detail = {}) {
    return openIncidenciasModal(detail);
  },

  close() {
    return closeIncidenciasModal();
  },

  update(detail = {}) {
    return updateIncidenciasModal(detail);
  },

  setFeedback(message = "", type = "info") {
    setFeedback(message, type);
    if (modalState.isOpen) {
      renderModal();
      attachRootBindings();
    }
    return true;
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
      pendingFiles: [...safeArray(modalState.pendingFiles)],
    };
  },

  destroy() {
    closeIncidenciasModal();
    detachEscHandler();
    detachRootBindings();
    detachBus();

    const root = getRoot();
    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionIncidenciasModal = OnionIncidenciasModal;
  window.renderIncidenciaTicketModal = OnionIncidenciasModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasModal;

/* =========================================================
   Onion SPA - Incidencias Modal
   Archivo: src/views/incidencias/incidencias.modal.js

   CLIENT EXPERIENCE PRO · DETAIL MODAL · 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de incidencia
   - abrir / cerrar modal limpio
   - refrescar contenido del ticket desde el modal
   - copiar referencia desde el modal
   - permitir reabrir incidencia cuando proceda
   - permitir añadir nuevos comentarios / detalles
   - visualizar actividad, timeline y adjuntos
   - exponer bridge global para incidenciasView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - avatar fallback -> iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de refresh / comment / reopen
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
  isRefreshing: false,
  isCommentSubmitting: false,
  isReopening: false,
  bindingsAttached: false,
  lastActiveElement: null,
  escHandler: null,
  commentDraft: "",
  feedbackMessage: "",
  feedbackType: "info",
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
    return diffMin > 0
      ? `En ${absMin} min`
      : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);
  if (diffHours < 24) {
    return diffMin > 0
      ? `En ${diffHours} h`
      : `Hace ${diffHours} h`;
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

function getTicketCode(detail = {}) {
  return safeText(
    first(
      detail.ticketCode,
      detail.code,
      detail.ticketId,
      detail.id,
      detail?.raw?.ticketCode,
      detail?.raw?.code,
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

function getClientEmail(detail = {}) {
  return safeText(
    first(
      detail.clientEmail,
      detail.email,
      detail?.cliente?.email,
      detail?.client?.email,
      detail?.receptor?.email,
      detail?.createdBy?.email,
      detail?.raw?.clientEmail,
      detail?.raw?.email,
      detail?.raw?.cliente?.email,
      detail?.raw?.client?.email,
      detail?.raw?.receptor?.email,
      detail?.raw?.createdBy?.email
    ),
    "Sin email"
  );
}

function getAssignedTo(detail = {}) {
  return safeText(
    first(
      detail.assignedToName,
      detail?.tecnico?.name,
      detail?.assignedTo?.name,
      detail?.raw?.assignedToName,
      detail?.raw?.tecnico?.name,
      detail?.raw?.assignedTo?.name
    ),
    "No asignado"
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

function getCategory(detail = {}) {
  return safeText(
    first(
      detail.category,
      detail.categoria,
      detail.tipo,
      detail?.raw?.category,
      detail?.raw?.categoria,
      detail?.raw?.tipo
    ),
    "General"
  );
}

function getSource(detail = {}) {
  return safeText(
    first(
      detail.source,
      detail.origen,
      detail.channel,
      detail?.raw?.source,
      detail?.raw?.origen,
      detail?.raw?.channel,
      "panel"
    ),
    "panel"
  );
}

function getTags(detail = {}) {
  const rawTags = first(
    detail.tags,
    detail?.raw?.tags,
    detail?.raw?.labels
  );

  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  if (typeof rawTags === "string") {
    return rawTags
      .split(",")
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  return [];
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

    return {
      id: safeText(
        first(item.id, item.fileId, item.blobName),
        `attachment-${index + 1}`
      ),
      name: safeText(
        first(item.name, item.filename, item.fileName, item.title),
        `archivo_${index + 1}`
      ),
      url: safeText(
        first(item.url, item.href, item.downloadUrl),
        ""
      ),
      path: safeText(item.path, ""),
      size: safeNumber(item.size, 0),
      type: safeText(
        first(item.type, item.contentType, item.mimeType, item.mime),
        ""
      ),
      uploadedAt: first(item.uploadedAt, item.createdAt, item.date, null),
    };
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
      body: safeText(
        first(item.description, item.detail, item.body, ""),
        ""
      ),
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
      title: "Nuevo comentario",
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

function canReopen(detail = {}) {
  const status = safeText(detail.status, "").toLowerCase();
  return ["resolved", "resuelta", "resuelto", "closed", "cerrada", "cerrado"].includes(status);
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
    safeText(
      first(
        detail.ticketId,
        getClientName(detail),
        getClientEmail(detail)
      ),
      "onion"
    )
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
        ${type === "error" ? "No se ha podido completar la acción" : type === "success" ? "Acción completada" : "Información"}
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

function renderTags(detail = {}) {
  const tags = getTags(detail);

  if (!tags.length) {
    return `
      <span
        style="
          color:var(--text-dim);
          font-size:13px;
        "
      >
        Sin etiquetas
      </span>
    `;
  }

  return `
    <div
      style="
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      "
    >
      ${tags
        .map(
          (tag) => `
            <span
              style="
                display:inline-flex;
                align-items:center;
                min-height:28px;
                padding:0 10px;
                border-radius:999px;
                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold, 700);
              "
            >
              ${escapeHtml(tag)}
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAttachments(detail = {}) {
  const files = getAttachments(detail);

  if (!files.length) {
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
        No hay archivos adjuntos en esta incidencia.
      </div>
    `;
  }

  return `
    <div
      style="
        display:grid;
        gap:10px;
      "
    >
      ${files
        .map((file) => {
          const hasLink = Boolean(file.url);

          return `
            <${hasLink ? "a" : "div"}
              ${hasLink ? `href="${escapeHtml(file.url)}" target="_blank" rel="noopener"` : ""}
              style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:14px;
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                text-decoration:none;
                color:var(--text-strong);
              "
            >
              <div style="display:grid; gap:4px; min-width:0;">
                <strong
                  style="
                    min-width:0;
                    font-weight:var(--weight-semibold, 600);
                    word-break:break-word;
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

              ${
                hasLink
                  ? `
                    <span
                      style="
                        flex:0 0 auto;
                        color:var(--text-soft);
                        font-size:12px;
                        font-weight:var(--weight-bold, 700);
                      "
                    >
                      Abrir
                    </span>
                  `
                  : ""
              }
            </${hasLink ? "a" : "div"}>
          `;
        })
        .join("")}
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
                <div style="display:grid; gap:6px;">
                  <div
                    style="
                      display:flex;
                      gap:8px;
                      flex-wrap:wrap;
                      align-items:center;
                    "
                  >
                    <strong
                      style="
                        color:var(--text-strong);
                        font-size:14px;
                        line-height:1.35;
                      "
                    >
                      ${escapeHtml(safeText(entry.title, "Actualización"))}
                    </strong>

                    <span
                      style="
                        display:inline-flex;
                        align-items:center;
                        min-height:24px;
                        padding:0 8px;
                        border-radius:999px;
                        border:1px solid ${
                          kind === "comment"
                            ? "color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft))"
                            : "var(--border-soft)"
                        };
                        background:${
                          kind === "comment"
                            ? "color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent)"
                            : "var(--surface-1, var(--surface-glass))"
                        };
                        color:var(--text-soft);
                        font-size:11px;
                        font-weight:var(--weight-bold, 700);
                        text-transform:uppercase;
                        letter-spacing:.04em;
                      "
                    >
                      ${kind === "comment" ? "Comentario" : "Histórico"}
                    </span>
                  </div>

                  ${
                    entry.body
                      ? `
                        <p
                          style="
                            margin:0;
                            color:var(--text-dim);
                            font-size:13px;
                            line-height:1.6;
                            white-space:pre-wrap;
                            word-break:break-word;
                          "
                        >
                          ${escapeHtml(entry.body)}
                        </p>
                      `
                      : ""
                  }
                </div>

                <div
                  style="
                    display:grid;
                    gap:4px;
                    justify-items:end;
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

function renderComposer(detail = {}) {
  const ticketId = getTicketId(detail);
  const canReopenTicket = canReopen(detail);
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
            Puedes escribir nuevos detalles para ampliar el contexto de la incidencia.
          </span>
        </div>

        ${
          canReopenTicket
            ? `
              <button
                type="button"
                data-modal-action="reopen"
                data-ticket-id="${escapeHtml(ticketId)}"
                ${modalState.isReopening ? "disabled" : ""}
                style="
                  min-height:42px;
                  padding:0 14px;
                  border-radius:14px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-soft);
                  font-weight:var(--weight-bold, 700);
                  cursor:${modalState.isReopening ? "wait" : "pointer"};
                  opacity:${modalState.isReopening ? ".78" : "1"};
                "
              >
                ${
                  modalState.isReopening
                    ? `
                      <span style="display:inline-flex; align-items:center; gap:8px;">
                        <span
                          aria-hidden="true"
                          style="
                            width:14px;
                            height:14px;
                            border-radius:999px;
                            border:2px solid color-mix(in srgb, var(--text-soft) 22%, transparent);
                            border-top-color:var(--text-soft);
                            animation:incidenciasModalSpin .8s linear infinite;
                          "
                        ></span>
                        Reabriendo...
                      </span>
                    `
                    : "Reabrir incidencia"
                }
              </button>
            `
            : ""
        }
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
          ${modalState.isCommentSubmitting ? "disabled" : ""}
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
            Esta acción añadirá una nueva actualización a la incidencia.
          </span>

          <button
            type="button"
            data-modal-action="comment"
            data-ticket-id="${escapeHtml(ticketId)}"
            ${modalState.isCommentSubmitting ? "disabled" : ""}
            style="
              min-height:42px;
              padding:0 16px;
              border-radius:14px;
              border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
              background:var(--btn-primary-bg, var(--accent, #7c5cff));
              color:var(--btn-primary-text, #fff);
              font-weight:var(--weight-bold, 700);
              cursor:${modalState.isCommentSubmitting ? "wait" : "pointer"};
              opacity:${modalState.isCommentSubmitting ? ".82" : "1"};
            "
          >
            ${
              modalState.isCommentSubmitting
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
                    Enviando...
                  </span>
                `
                : "Añadir comentario"
            }
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderLoadingOverlay(label = "Actualizando incidencia...") {
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

function renderModalInner(detail = {}, {
  isRefreshing = false,
  isCommentSubmitting = false,
  isReopening = false,
} = {}) {
  const item = getDetail(detail);
  const ticketId = getTicketId(item);
  const ticketCode = getTicketCode(item);
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
  const createdAt = formatDate(first(item.createdAt, item?.raw?.createdAt));
  const updatedAt = formatDate(first(item.updatedAt, item?.raw?.updatedAt, item?.raw?.createdAt));
  const updatedAgo = formatRelativeDate(first(item.updatedAt, item?.raw?.updatedAt, item?.raw?.createdAt));
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item);
  const assignedTo = getAssignedTo(item);
  const category = getCategory(item);
  const source = getSource(item);
  const attachments = getAttachments(item);
  const statusRaw = safeText(first(item.status, item?.raw?.status, item?.raw?.estado), "open");
  const priorityRaw = safeText(first(item.priority, item?.raw?.priority, item?.raw?.prioridad), "medium");
  const statusLabel = getStatusLabel(statusRaw);
  const priorityLabel = getPriorityLabel(priorityRaw);
  const busyLabel = isRefreshing
    ? "Actualizando incidencia..."
    : isCommentSubmitting
      ? "Enviando comentario..."
      : isReopening
        ? "Reabriendo incidencia..."
        : "";

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
          width:min(1180px, 100%);
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
                <span
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
                  "
                >
                  Referencia ${escapeHtml(ticketCode)}
                </span>

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
              data-modal-action="refresh"
              data-ticket-id="${escapeHtml(ticketId)}"
              ${(isRefreshing || isCommentSubmitting || isReopening) ? "disabled" : ""}
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold, 700);
                cursor:${(isRefreshing || isCommentSubmitting || isReopening) ? "wait" : "pointer"};
                opacity:${(isRefreshing || isCommentSubmitting || isReopening) ? ".78" : "1"};
              "
            >
              Actualizar
            </button>

            <button
              type="button"
              data-modal-action="copy"
              data-ticket-id="${escapeHtml(ticketId)}"
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold, 700);
                cursor:pointer;
              "
            >
              Copiar referencia
            </button>

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
            ${renderMetaField("Solicitante", clientName)}
            ${renderMetaField("Email", clientEmail)}
            ${renderMetaField("Seguimiento", assignedTo)}
            ${renderMetaField("Categoría", category)}
            ${renderMetaField("Creada", createdAt)}
            ${renderMetaField("Actualizada", updatedAt)}
            ${renderMetaField("Origen", source)}
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

              <span
                style="
                  color:var(--text-dim);
                  font-size:12px;
                "
              >
                Ticket ${escapeHtml(ticketId)}
              </span>
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
              Etiquetas
            </h3>

            ${renderTags(item)}
          </section>

          ${renderComposer(item)}

          <div
            style="
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:18px;
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
                Adjuntos
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

          @media (max-width: 980px) {
            .incidencias-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .incidencias-modal-lower-grid {
              grid-template-columns: 1fr !important;
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

  root.innerHTML = renderModalInner(modalState.detail, {
    isRefreshing: modalState.isRefreshing,
    isCommentSubmitting: modalState.isCommentSubmitting,
    isReopening: modalState.isReopening,
  });

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
  modalState.isRefreshing = false;
  modalState.isCommentSubmitting = false;
  modalState.isReopening = false;
  modalState.commentDraft = "";
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
  modalState.isRefreshing = false;
  modalState.isCommentSubmitting = false;
  modalState.isReopening = false;
  modalState.detail = null;
  modalState.commentDraft = "";
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
  modalState.isRefreshing = false;
  modalState.isCommentSubmitting = false;
  modalState.isReopening = false;

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
    setFeedback("No hay referencia disponible para copiar.", "error");
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
    setFeedback(`Referencia ${id} copiada al portapapeles.`, "success");
    showToast("Referencia copiada", "success");
  } else {
    setFeedback(`Se ha solicitado copiar la referencia ${id}.`, "info");
    showToast("Referencia enviada a la acción de copia", "info");
  }

  renderModal();
  attachRootBindings();

  return true;
}

async function handleRefresh(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id || modalState.isRefreshing) {
    return false;
  }

  modalState.isRefreshing = true;
  clearFeedback();
  renderModal();
  attachRootBindings();

  try {
    const response = await callExternalAction("refreshTicketDetail", {
      ticketId: id,
      silent: true,
    });

    safeEmit("incidencias:modal:refresh", {
      ticketId: id,
    });

    if (response && typeof response === "object") {
      modalState.detail = getDetail(response);
      setFeedback("La incidencia se ha actualizado correctamente.", "success");
    } else {
      setFeedback("Se ha solicitado la actualización de la incidencia.", "info");
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
    modalState.isRefreshing = false;
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

async function handleComment(ticketId = "") {
  const id = safeText(ticketId, "");
  const message = normalizeWhitespace(modalState.commentDraft);

  if (!id) {
    setFeedback("No se ha podido identificar la incidencia.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  if (!message) {
    setFeedback("Escribe un comentario antes de enviarlo.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  if (message.length < 4) {
    setFeedback("Añade un poco más de detalle antes de enviar el comentario.", "error");
    renderModal();
    attachRootBindings();
    return false;
  }

  modalState.isCommentSubmitting = true;
  clearFeedback();
  renderModal();
  attachRootBindings();

  try {
    const response = await callExternalAction("commentTicket", {
      ticketId: id,
      message,
      detail: modalState.detail,
    });

    safeEmit("incidencias:modal:comment", {
      ticketId: id,
      message,
    });

    if (response && typeof response === "object") {
      modalState.detail = getDetail(response);
      modalState.commentDraft = "";
      setFeedback("Tu comentario se ha añadido correctamente.", "success");
    } else {
      const currentDetail = getDetail(modalState.detail);
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

      modalState.detail = getDetail({
        ...currentDetail,
        comments: nextComments,
        raw: {
          ...raw,
          comments: nextComments,
        },
      });

      modalState.commentDraft = "";
      setFeedback("Comentario añadido y pendiente de sincronización externa.", "info");
    }

    showToast("Comentario añadido", "success");
    return true;
  } catch (error) {
    setFeedback(
      safeText(
        first(
          error?.message,
          error?.response?.message,
          error?.data?.message,
          "No se pudo añadir el comentario."
        ),
        "No se pudo añadir el comentario."
      ),
      "error"
    );

    showToast("No se pudo añadir el comentario.", "error");
    return false;
  } finally {
    modalState.isCommentSubmitting = false;
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

async function handleReopen(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id || modalState.isReopening) {
    return false;
  }

  modalState.isReopening = true;
  clearFeedback();
  renderModal();
  attachRootBindings();

  try {
    const response = await callExternalAction("reopenTicket", {
      ticketId: id,
      detail: modalState.detail,
    });

    safeEmit("incidencias:modal:reopen", {
      ticketId: id,
    });

    if (response && typeof response === "object") {
      modalState.detail = getDetail(response);
      setFeedback("La incidencia se ha reabierto correctamente.", "success");
    } else {
      const currentDetail = getDetail(modalState.detail);
      const raw = safeObject(currentDetail.raw);

      modalState.detail = getDetail({
        ...currentDetail,
        status: "open",
        raw: {
          ...raw,
          status: "open",
          estado: "open",
        },
      });

      setFeedback("La incidencia se ha marcado como reabierta.", "info");
    }

    showToast("Incidencia reabierta", "success");
    return true;
  } catch (error) {
    setFeedback(
      safeText(
        first(
          error?.message,
          error?.response?.message,
          error?.data?.message,
          "No se pudo reabrir la incidencia."
        ),
        "No se pudo reabrir la incidencia."
      ),
      "error"
    );

    showToast("No se pudo reabrir la incidencia.", "error");
    return false;
  } finally {
    modalState.isReopening = false;
    renderModal();
    attachRootBindings();
    focusPanel();
  }
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
    if (fieldName !== "comment") return;

    modalState.commentDraft = field.value || "";
  };

  const onClick = async (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");
    if (closeBtn) {
      event.preventDefault();
      closeIncidenciasModal();
      return;
    }

    const refreshBtn = event.target.closest('[data-modal-action="refresh"]');
    if (refreshBtn) {
      event.preventDefault();
      await handleRefresh(refreshBtn.dataset.ticketId || "");
      return;
    }

    const copyBtn = event.target.closest('[data-modal-action="copy"]');
    if (copyBtn) {
      event.preventDefault();
      await handleCopy(copyBtn.dataset.ticketId || "");
      return;
    }

    const commentBtn = event.target.closest('[data-modal-action="comment"]');
    if (commentBtn) {
      event.preventDefault();
      await handleComment(commentBtn.dataset.ticketId || "");
      return;
    }

    const reopenBtn = event.target.closest('[data-modal-action="reopen"]');
    if (reopenBtn) {
      event.preventDefault();
      await handleReopen(reopenBtn.dataset.ticketId || "");
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
  setFeedback("Tu comentario se ha registrado correctamente.", "success");
  updateIncidenciasModal(detail);
}

function handleReopenSuccess(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail || !modalState.isOpen) return;

  setFeedback("La incidencia se ha reabierto correctamente.", "success");
  updateIncidenciasModal(detail);
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("incidencias:modal:open", handleOpenEvent);
  safeOn("incidencias:modal:close", handleCloseEvent);
  safeOn("incidencias:modal:update", handleUpdateEvent);
  safeOn("incidencias:open:success", handleOpenedDetailEvent);
  safeOn("incidencias:comment:success", handleCommentSuccess);
  safeOn("incidencias:reopen:success", handleReopenSuccess);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("incidencias:modal:open", handleOpenEvent);
  safeOff("incidencias:modal:close", handleCloseEvent);
  safeOff("incidencias:modal:update", handleUpdateEvent);
  safeOff("incidencias:open:success", handleOpenedDetailEvent);
  safeOff("incidencias:comment:success", handleCommentSuccess);
  safeOff("incidencias:reopen:success", handleReopenSuccess);

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

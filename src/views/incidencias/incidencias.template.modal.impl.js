/* =========================================================
   Onion Support - Incidencias Detail Template
   Archivo: /src/views/incidencias/incidencias.template.modal.js

   PRODUCTIVO · PREVIEW SAS SAFE · V16

   Responsabilidad:
   - Renderizar HTML puro del detalle de una incidencia.
   - Sin DOM, listeners, HTTP, Store, Router ni Storage.
   - Contrato estable con index.js mediante DETAIL_ACTIONS.
   - Compatible con DTOs legacy/v2/v3 de tickets/incidencias.
   - Mantener arrays de attachments/history/comments intactos.
   - Header fijo + body scroll mediante detail.css.
   - CTA de actualización junto al composer.
   - No inventar técnico cuando no existe asignación real.
   - Preview inline únicamente para imagen/PDF.
   - Nunca usar un Blob privado sin SAS como URL renderizable.
   - Vista de adjuntos restringida a /tickets/ del Blob Storage Onion.
   - Descargar sigue delegado al controlador/API.
   - Límites de comentario/adjuntos visibles para el usuario.
   - Semántica explícita cuando una actualización reabre la incidencia.

   IMPORTANTE:
   - Este archivo NO implementa focus trap ni confirmación de borrador.
     Eso corresponde a /src/views/incidencias/index.js.
   - Este archivo NO cambia contratos HTTP.
   - Este archivo NO genera SAS.
     La SAS debe venir ya validada desde incidencias.api.js.
========================================================= */

import { cleanText } from "../../core/presentation-text.js";
import { escapeHtml } from "../../core/escape-html.js";
import { userNameFromIdentity } from "../../core/user-identity.js";
import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";
import { renderModalCloseButton, renderModalShell, renderModalState } from "../../features/entity-overlay/modal-host.js";
import { persistedCommentId, requesterIdentity, technicianIdentity } from "../../features/incidencias-comment-identity/index.js";
import { canUpdateDetail, describePendingParts, resolveDetailPending } from "./incidencias.detail-pending.js";
import {
  INCIDENCIA_STATUS_OPTIONS,
  INCIDENCIA_PRIORITY_OPTIONS,
  INCIDENCIA_CATEGORY_OPTIONS,
  incidenciaStatusLabel,
  incidenciaPriorityLabel,
  incidenciaCategoryLabel,
  normalizeIncidenciaStatus,
  normalizeIncidenciaPriority,
  normalizeIncidenciaCategory,
} from "./incidencias.options.js";
import { isObject, safeObject, firstNonEmpty } from "../../core/objects.js";
import { arrayFrom } from "../../core/arrays.js";
import { slugKey } from "../../core/slug-key.js";
import { TIMESTAMP_POLICIES, toTimestamp } from "../../core/dates.js";
import { CURRENCY_POLICIES, DATE_PRESETS, currencyCode, currencyFormatter, dateFormatter } from "../../core/format.js";
import { AMOUNT_POLICIES, parseAmount } from "../../core/amounts.js";

export const INCIDENCIAS_MODAL_TEMPLATE_VERSION =
  "incidencias.template.modal.extreme.v36-owned-attachment-delete-confirm";

export const DETAIL_ACTIONS = Object.freeze({
  CLOSE: "detail-close",
  DISCARD_CLOSE_CONFIRM: "detail-discard-close-confirm",
  DISCARD_CLOSE_CANCEL: "detail-discard-close-cancel",
  COPY_ID: "detail-copy-id",

  COMMENT_SUBMIT: "detail-submit-update",
  COMMENT_CHANGE: "detail-comment-change",
  TICKET_CLOSE: "detail-ticket-close",
  TICKET_CLOSE_CONFIRM: "detail-ticket-close-confirm",
  TICKET_CLOSE_CANCEL: "detail-ticket-close-cancel",
  HISTORY_TOGGLE: "detail-history-toggle",
  HISTORY_REVEAL: "detail-history-reveal",

  ATTACHMENTS_ADD: "detail-attachments-add",
  PENDING_FILE_REMOVE: "detail-pending-file-remove",

  ATTACHMENT_OPEN: "detail-attachment-open",
  ATTACHMENT_DOWNLOAD: "detail-attachment-download",
  ATTACHMENT_DELETE: "detail-attachment-delete",
  ATTACHMENT_DELETE_CONFIRM: "detail-attachment-delete-confirm",
  ATTACHMENT_DELETE_CANCEL: "detail-attachment-delete-cancel",

  PREVIEW_CLOSE: "detail-preview-close",
  PREVIEW_DOWNLOAD: "detail-preview-download",
});

const MODAL_ID = "incidencias-detail-modal-root";
const PANEL_ID = "incidencias-detail-modal-panel";
const TITLE_ID = "incidencias-modal-title";
const DESCRIPTION_ID = "incidencias-modal-description";
const COMMENT_ID = "incidencias-modal-comment-input";
const ATTACHMENTS_INPUT_ID = "incidencias-modal-attachments-input";

const DEFAULT_CURRENCY = "EUR";

const MAX_COMMENT_LENGTH = 4000;
const MAX_PENDING_FILES = 10;
const MAX_PENDING_FILE_SIZE =
  100 * 1024 * 1024;

/*
   Contrato exacto del storage de tickets.
   No ampliar a *.blob.core.windows.net:
   una URL de adjunto renderizable debe pertenecer al storage real
   de Onion Support y al contenedor tickets.
*/
const TRUSTED_ATTACHMENT_BLOB_HOST =
  "onionassets.blob.core.windows.net";

const TRUSTED_ATTACHMENT_CONTAINER_PREFIX =
  "/tickets/";

/* =========================================================
   BASICS
========================================================= */

function cleanMultiline(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

  return output || fallback;
}

/*
   NO aplanar arrays aquí.
   attachments/history/comments son valores completos.
*/
function attr(value = "") {
  return escapeHtml(
    cleanText(value, "")
  );
}

function htmlAttrs(attrs = {}) {
  return Object.entries(
    safeObject(attrs)
  )
    .map(
      ([key, value]) => {
        if (!key) {
          return "";
        }

        if (
          value === false ||
          value === null ||
          value === undefined
        ) {
          return "";
        }

        if (value === true) {
          return escapeHtml(key);
        }

        return (
          `${escapeHtml(key)}=` +
          `"${escapeHtml(value)}"`
        );
      }
    )
    .filter(Boolean)
    .join(" ");
}

/*
   El flatten aquí es deliberado y local:
   sólo compone clases CSS, nunca datos de dominio.
*/
function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map(
      (value) =>
        cleanText(value, "")
    )
    .filter(Boolean)
    .join(" ");
}

/* =========================================================
   GENERIC URLS
   Sólo para avatar/personas.
   Adjuntos usan una política distinta y más estricta.
========================================================= */

function safeUrl(value = "") {
  const raw =
    cleanText(value, "");

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  const localHttp =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    );

  if (localHttp) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstUrl(...values) {
  const queue =
    [...values];

  while (queue.length) {
    const value =
      queue.shift();

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      queue.unshift(...value);
      continue;
    }

    if (isObject(value)) {
      queue.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.src,
        value.href,
        value.url,

        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.picture
      );

      continue;
    }

    const url =
      safeUrl(value);

    if (url) {
      return url;
    }
  }

  return "";
}

/* =========================================================
   ATTACHMENT URL POLICY
========================================================= */

function hasAzureSasSignature(
  url = null
) {
  try {
    return Boolean(
      url?.searchParams?.get("sig")
    );
  } catch {
    return false;
  }
}

function isTrustedTicketBlobUrl(
  url = null
) {
  if (!url) {
    return false;
  }

  try {
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() ===
        TRUSTED_ATTACHMENT_BLOB_HOST &&
      url.pathname
        .toLowerCase()
        .startsWith(
          TRUSTED_ATTACHMENT_CONTAINER_PREFIX
        )
    );
  } catch {
    return false;
  }
}

/*
   Política:
   - blob: únicamente para preview local del runtime.
   - /ruta-relativa únicamente para same-origin.
   - Azure: HTTPS + host exacto + /tickets/ + SAS firmada.
   - Ningún otro host absoluto.
   - Nunca transformar un blobUrl privado en "público".
*/
function safeAttachmentUrl(
  value = "",
  {
    allowBlob = true,
    requireAzureSas = true,
  } = {}
) {
  const raw =
    cleanText(value, "");

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    return allowBlob
      ? raw
      : "";
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (!/^https:\/\//i.test(raw)) {
    return "";
  }

  try {
    const url =
      new URL(raw);

    if (
      !isTrustedTicketBlobUrl(url)
    ) {
      return "";
    }

    if (
      requireAzureSas &&
      !hasAzureSasSignature(url)
    ) {
      /*
         El contenedor tickets es privado.
         Una URL Blob sin sig no es una URL de visualización.
      */
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function firstAttachmentUrl(
  ...values
) {
  const queue =
    [...values];

  while (queue.length) {
    const value =
      queue.shift();

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      queue.unshift(...value);
      continue;
    }

    if (isObject(value)) {
      /*
         Orden deliberado:
         vista inline > aliases SAS > url ya normalizada.
         downloadUrl NO se usa como vista inline.
         blobUrl/publicUrl NO se usan como fallback.
      */
      queue.unshift(
        value.viewUrl,
        value.openUrl,
        value.signedUrl,
        value.sasUrl,
        value.url,
        value.href,
        value.src
      );

      continue;
    }

    const url =
      safeAttachmentUrl(value);

    if (url) {
      return url;
    }
  }

  return "";
}

/* =========================================================
   TEXT / FILE HELPERS
========================================================= */

function safeFilename(
  value = "",
  fallback = "archivo"
) {
  const raw =
    cleanText(
      value,
      fallback
    )
      .split(/[\\/]/)
      .pop();

  return (
    raw
      .replace(
        /[\0\r\n\t]/g,
        ""
      )
      .replace(
        /[/:*?"<>|]+/g,
        "_"
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) ||
    fallback
  );
}

function fileExtension(value = "") {
  const name =
    cleanText(
      value,
      ""
    ).toLowerCase();

  const index =
    name.lastIndexOf(".");

  return index > 0
    ? name.slice(index)
    : "";
}

function formatLimitBytes(
  value = MAX_PENDING_FILE_SIZE
) {
  const mb =
    parseAmount(value, 0, AMOUNT_POLICIES.textOnly) /
    1024 /
    1024;

  return Number.isInteger(mb)
    ? `${mb} MB`
    : `${mb.toFixed(1)} MB`;
}

/* =========================================================
   ICONS
========================================================= */

const MODAL_ICON_CACHE = new Map();

function icon(name = "") {
  if (MODAL_ICON_CACHE.has(name)) return MODAL_ICON_CACHE.get(name);

  const common =
    `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close:
      `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,

    plus:
      `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,

    check:
      `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,

    history:
      `<svg ${common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`,

    trash:
      `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,

    alertTriangle:
      `<svg ${common}><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,

    chevronDown:
      `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,

    ticket:
      `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,

    copy:
      `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,

    eye:
      `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,

    download:
      `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,

    paperclip:
      `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,

    mail:
      `<svg ${common}><rect width="18" height="14" x="3" y="5" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,

    phone:
      `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/></svg>`,

    file:
      `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,

    alert:
      `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  const result = icons[name] || icons.file;
  MODAL_ICON_CACHE.set(name, result);
  return result;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatBytes(bytes = 0) {
  const value =
    parseAmount(bytes, 0, AMOUNT_POLICIES.textOnly);

  if (
    !value ||
    value <= 0
  ) {
    return "";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (
    value <
    1024 * 1024
  ) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }

  if (
    value <
    1024 *
      1024 *
      1024
  ) {
    return `${(
      value /
      1024 /
      1024
    ).toFixed(1)} MB`;
  }

  return `${(
    value /
    1024 /
    1024 /
    1024
  ).toFixed(1)} GB`;
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const formatter = currencyFormatter(currencyCode(currency, DEFAULT_CURRENCY), CURRENCY_POLICIES.currencyDigits);
  return formatter ? formatter.format(parseAmount(value, 0, AMOUNT_POLICIES.textOnly)) : `${parseAmount(value, 0, AMOUNT_POLICIES.textOnly).toFixed(2)} €`;
}

function formatDate(value = "") {
  const raw = firstNonEmpty(value, "");
  if (!raw) return "—";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return cleanText(raw, "—");
  try { return dateFormatter(DATE_PRESETS.dateTime).format(date); }
  catch { return date.toISOString(); }
}

function formatRelativeDate(
  value = ""
) {
  const raw =
    firstNonEmpty(
      value,
      ""
    );

  if (!raw) {
    return "—";
  }

  const date =
    new Date(raw);

  const ms =
    date.getTime();

  if (!Number.isFinite(ms)) {
    return cleanText(
      raw,
      "—"
    );
  }

  const diff =
    Math.abs(
      Date.now() - ms
    );

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (diff < minute) {
    return "ahora";
  }

  if (diff < hour) {
    return (
      `hace ${Math.max(
        1,
        Math.round(
          diff / minute
        )
      )} min`
    );
  }

  if (diff < day) {
    return (
      `hace ${Math.max(
        1,
        Math.round(
          diff / hour
        )
      )} h`
    );
  }

  if (diff < 7 * day) {
    return (
      `hace ${Math.max(
        1,
        Math.round(
          diff / day
        )
      )} d`
    );
  }

  return formatDate(raw);
}

/* =========================================================
   DATA GETTERS
========================================================= */

function getRaw(detail = {}) {
  return safeObject(
    detail?.raw,
    detail
  );
}

function getTicketId(detail = {}) {
  const raw =
    getRaw(detail);

  return cleanText(
    firstNonEmpty(
      detail.ticketId,
      detail.incidenciaId,
      detail.id,

      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw.code,
      raw.numero
    ),
    ""
  );
}

function getTitle(detail = {}) {
  const raw =
    getRaw(detail);

  return cleanText(
    firstNonEmpty(
      detail.subject,
      detail.asunto,
      detail.title,

      raw.subject,
      raw.asunto,
      raw.title
    ),
    "Sin asunto"
  );
}

function getDescription(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanMultiline(
    firstNonEmpty(
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

function getStatus(detail = {}) {
  const raw =
    getRaw(detail);

  const status =
    slugKey(
      firstNonEmpty(
        detail.status,
        detail.estado,

        raw.status,
        raw.estado,

        "open"
      )
    );

  const map = {
    open: "open",
    opened: "open",
    abierta: "open",
    abierto: "open",

    pending: "pending",
    pendiente: "pending",

    in_progress: "progress",
    inprogress: "progress",
    progress: "progress",
    proceso: "progress",
    en_proceso: "progress",

    resolved: "resolved",
    resuelta: "resolved",
    resuelto: "resolved",

    closed: "closed",
    cerrada: "closed",
    cerrado: "closed",
  };

  return (
    map[status] ||
    status ||
    "open"
  );
}

function statusClass(
  status = ""
) {
  return (
    status === "progress"
      ? "in-progress"
      : status || "open"
  );
}

function statusWillReopen(
  status = ""
) {
  return [
    "closed",
    "resolved",
  ].includes(
    slugKey(status)
  );
}

function getPriority(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return normalizeIncidenciaPriority(
    firstNonEmpty(
      detail.priority,
      detail.prioridad,
      detail.severity,

      raw.priority,
      raw.prioridad,
      raw.severity,

      "medium"
    ),
    "medium"
  );
}

function priorityClass(
  priority = ""
) {
  return normalizeIncidenciaPriority(priority, "medium");
}

function getCategory(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    firstNonEmpty(
      detail.category,
      detail.categoria,
      detail.tipo,
      detail.type,

      raw.category,
      raw.categoria,
      raw.tipo,
      raw.type
    ),
    "General"
  );
}

function getRequester(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return safeObject(
    firstNonEmpty(
      detail.requesterSnapshot,
      detail.cliente,
      detail.receptor,
      detail.user,

      raw.requesterSnapshot,
      raw.cliente,
      raw.receptor,
      raw.user,

      {}
    )
  );
}

function getClientName(detail = {}) {
  return userNameFromIdentity(detail) || userNameFromIdentity(getRequester(detail)) ||
    userNameFromIdentity(getRaw(detail)) ||
    cleanText(firstNonEmpty(detail.requesterName, detail.clientName, detail.clienteNombre, detail.email), "Usuario");
}

function getClientEmail(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const requester =
    getRequester(detail);

  return cleanText(
    firstNonEmpty(
      detail.email,
      detail.emailLower,
      detail.userEmail,
      detail.clienteEmail,

      requester.email,
      requester.emailLower,

      raw.email,
      raw.emailLower
    ),
    ""
  );
}

function getClientPhone(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const requester =
    getRequester(detail);

  return cleanText(
    firstNonEmpty(
      detail.phone,
      detail.telefono,

      requester.phone,
      requester.telefono,

      raw.phone,
      raw.telefono
    ),
    ""
  );
}

function getClientAvatar(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return firstUrl(
    detail.avatarUrl,
    detail.avatar,
    detail.userAvatarUrl,
    detail.userAvatar,
    detail.clienteAvatarUrl,
    detail.clienteAvatar,

    detail.requesterSnapshot,
    detail.cliente,
    detail.receptor,
    detail.user,

    raw.avatarUrl,
    raw.avatar,
    raw.requesterSnapshot,
    raw.cliente,
    raw.receptor,
    raw.user
  );
}

function getAssignment(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return safeObject(
    firstNonEmpty(
      detail.assignment,
      raw.assignment,
      {}
    )
  );
}

function getTechnicianObject(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const assignment =
    getAssignment(detail);

  return safeObject(
    firstNonEmpty(
      detail.tecnico,
      detail.assignedTo,
      detail.technician,
      assignment.technician,

      raw.tecnico,
      raw.assignedTo,
      raw.technician,

      {}
    )
  );
}

function getTechnicianName(
  detail = {}
) {
  const assignment =
    getAssignment(detail);

  const technician =
    getTechnicianObject(detail);

  return cleanText(
    firstNonEmpty(
      detail.assignedToName,
      detail.technicianName,
      detail.tecnicoName,

      assignment.assignedToName,

      technician.displayName,
      technician.name,
      technician.nombre
    ),
    ""
  );
}

function getTechnicianEmail(
  detail = {}
) {
  const assignment =
    getAssignment(detail);

  const technician =
    getTechnicianObject(detail);

  return cleanText(
    firstNonEmpty(
      detail.assignedToEmail,
      detail.technicianEmail,
      detail.tecnicoEmail,

      assignment.assignedToEmail,

      technician.email,
      technician.emailLower
    ),
    ""
  );
}

function getTechnicianAvatar(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const assignment =
    getAssignment(detail);

  return firstUrl(
    detail.assignedToAvatarUrl,
    detail.assignedToAvatar,
    detail.technicianAvatarUrl,
    detail.technicianAvatar,
    detail.tecnicoAvatarUrl,
    detail.tecnicoAvatar,
    detail.agentAvatarUrl,
    detail.agentAvatar,

    assignment.assignedToAvatarUrl,
    assignment.assignedToAvatar,
    assignment.technicianAvatarUrl,
    assignment.technicianAvatar,
    assignment.avatarUrl,
    assignment.avatar,
    assignment.technician,

    detail.tecnico,
    detail.assignedTo,
    detail.technician,

    raw.tecnico,
    raw.assignedTo,
    raw.technician
  );
}

function hasAssignedTechnician(
  detail = {}
) {
  return Boolean(
    getTechnicianName(detail) ||
    getTechnicianEmail(detail) ||
    getTechnicianAvatar(detail)
  );
}

function getInvoiceTotal(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return parseAmount(
    firstNonEmpty(
      detail.invoiceTotal,
      detail.invoicesTotal,
      detail.facturasTotal,
      detail.importeFacturas,
      detail.facturaTotal,
      detail.facturaImporte,
      detail.importeFactura,
      detail.totalFactura,
      detail.invoiceAmount,
      detail.amount,

      detail.linkedInvoices?.total,
      detail.linkedInvoices?.amount,

      detail.billing?.total,
      detail.billing?.amount,

      raw.invoiceTotal,
      raw.facturaTotal,
      raw.linkedInvoices?.total,

      0
    ),
    0,
    AMOUNT_POLICIES.textOnly
  );
}

function getCurrency(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    firstNonEmpty(
      detail.currency,
      detail.moneda,
      detail.facturaCurrency,
      detail.facturaMoneda,

      raw.currency,
      raw.moneda,

      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function getInvoiceLabel(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const invoiceId =
    cleanText(
      firstNonEmpty(
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

  const total =
    getInvoiceTotal(detail);

  if (
    !invoiceId &&
    total <= 0
  ) {
    return "Sin factura vinculada";
  }

  if (
    invoiceId &&
    total > 0
  ) {
    return (
      `${invoiceId} · ${formatMoney(
        total,
        getCurrency(detail)
      )}`
    );
  }

  if (invoiceId) {
    return invoiceId;
  }

  return formatMoney(
    total,
    getCurrency(detail)
  );
}

function getCreatedAt(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return firstNonEmpty(
    detail.createdAt,
    raw.createdAt,

    detail.lifecycle?.createdAt,
    raw.lifecycle?.createdAt,

    null
  );
}

function getUpdatedAt(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return firstNonEmpty(
    detail.lastActivityAt,
    detail.updatedAt,

    raw.lastActivityAt,
    raw.updatedAt,

    detail.lifecycle?.lastActivityAt,
    detail.lifecycle?.updatedAt,

    getCreatedAt(detail),
    null
  );
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function canonicalAttachmentId(
  file = {},
  index = 0
) {
  const raw =
    safeObject(file);

  return cleanText(
    firstNonEmpty(
      raw.id,
      raw.attachmentId,
      raw.fileId,
      raw.storageKey,
      raw.path,
      raw.blobPath,
      raw.blobName,
      `att_${index}`
    ),
    `att_${index}`
  );
}

function normalizeAttachment(
  file = {},
  index = 0
) {
  const raw =
    safeObject(file);

  const id =
    canonicalAttachmentId(
      raw,
      index
    );

  const name =
    safeFilename(
      firstNonEmpty(
        raw.name,
        raw.filename,
        raw.fileName,
        raw.originalName,
        `Adjunto ${index + 1}`
      ),
      `Adjunto ${index + 1}`
    );

  const contentType =
    cleanText(
      firstNonEmpty(
        raw.contentType,
        raw.mimeType,
        raw.mimetype,
        raw.type
      ),
      ""
    );

  /*
     Sólo URLs de visualización.
     blobUrl privado y downloadUrl no participan como fallback.
  */
  const viewUrl =
    firstAttachmentUrl(
      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.sasUrl,
      raw.url
    );

  return {
    ...raw,

    /*
       Contrato frontend canónico:
       una única identidad lógica para nuevos/normalizados.
       El endpoint backend sigue resolviendo aliases legacy.
    */
    id,
    attachmentId: id,

    name,
    filename: name,
    fileName: name,

    contentType,
    mimeType: contentType,
    mimetype: contentType,

    type:
      contentType ||
      cleanText(
        raw.type,
        ""
      ),

    size:
      parseAmount(
        firstNonEmpty(
          raw.size,
          raw.sizeBytes
        ),
        0,
        AMOUNT_POLICIES.textOnly
      ),

    sizeBytes:
      parseAmount(
        firstNonEmpty(
          raw.sizeBytes,
          raw.size
        ),
        0,
        AMOUNT_POLICIES.textOnly
      ),

    /*
       La URL renderizable es siempre la misma vista segura.
       NO copiamos blobUrl/downloadUrl privado a estos aliases.
    */
    url:
      viewUrl,

    viewUrl,
    openUrl:
      viewUrl,

    signedUrl:
      viewUrl,

    sasUrl:
      viewUrl,

    /*
       downloadUrl se conserva únicamente si ya es una URL de adjunto
       válida; el controlador no la usa para descargar: solicita una
       SAS nueva al endpoint de descarga.
    */
    downloadUrl:
      safeAttachmentUrl(
        raw.downloadUrl
      ),

    /*
       Locator interno/legacy: se conserva como dato, nunca se usa
       directamente para <img>/<iframe>.
    */
    blobUrl:
      cleanText(
        raw.blobUrl,
        ""
      ),

    publicUrl:
      cleanText(
        raw.publicUrl,
        ""
      ),

    path:
      cleanText(
        firstNonEmpty(
          raw.path,
          raw.blobPath,
          ""
        ),
        ""
      ),

    blobPath:
      cleanText(
        firstNonEmpty(
          raw.blobPath,
          raw.path,
          ""
        ),
        ""
      ),

    storageKey:
      cleanText(
        raw.storageKey,
        ""
      ),

    blobName:
      cleanText(
        raw.blobName,
        ""
      ),

    uploadedAt:
      firstNonEmpty(
        raw.uploadedAt,
        raw.createdAt,
        null
      ),

    meta: {
      ...safeObject(
        raw.meta
      ),

      attachmentIdPolicy:
        "id_equals_attachmentId",

      renderUrlPolicy:
        "signed_view_only",

      renderableView:
        Boolean(viewUrl),
    },
  };
}

function getAttachments(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return arrayFrom(
    firstNonEmpty(
      detail.attachments,
      detail.files,
      detail.adjuntos,

      raw.attachments,
      raw.files,
      raw.adjuntos,

      []
    )
  )
    .map(normalizeAttachment)
    .filter(
      (file) =>
        file.attachmentId ||
        file.name
    );
}

function getAttachmentId(
  file = {}
) {
  return cleanText(
    firstNonEmpty(
      file.id,
      file.attachmentId,
      file.fileId
    ),
    ""
  );
}

function getAttachmentViewUrl(
  file = {}
) {
  return firstAttachmentUrl(
    file.viewUrl,
    file.openUrl,
    file.signedUrl,
    file.sasUrl,
    file.url
  );
}

function isImageLikeAttachment(
  file = {}
) {
  const type =
    cleanText(
      firstNonEmpty(
        file.contentType,
        file.type,
        file.mimeType,
        file.mimetype
      ),
      ""
    ).toLowerCase();

  const name =
    cleanText(
      firstNonEmpty(
        file.filename,
        file.fileName,
        file.name
      ),
      ""
    ).toLowerCase();

  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(
      name
    )
  );
}

function isPdfLikeAttachment(
  file = {}
) {
  const type =
    cleanText(
      firstNonEmpty(
        file.contentType,
        file.type,
        file.mimeType,
        file.mimetype
      ),
      ""
    ).toLowerCase();

  const name =
    cleanText(
      firstNonEmpty(
        file.filename,
        file.fileName,
        file.name
      ),
      ""
    ).toLowerCase();

  return (
    type.includes(
      "application/pdf"
    ) ||
    name.endsWith(".pdf")
  );
}

function attachmentTypeLabel(
  file = {}
) {
  if (
    isImageLikeAttachment(file)
  ) {
    return "IMG";
  }

  if (
    isPdfLikeAttachment(file)
  ) {
    return "PDF";
  }

  const name =
    safeFilename(
      firstNonEmpty(
        file.name,
        file.filename,
        file.fileName
      ),
      "archivo"
    );

  return (
    fileExtension(name)
      .replace(".", "")
      .slice(0, 4)
      .toUpperCase() ||
    "DOC"
  );
}

/* =========================================================
   TIMELINE
========================================================= */

function normalizeTimelineEntry(
  item = {},
  index = 0
) {
  const raw =
    safeObject(item);

  const rawKind =
    slugKey(
      firstNonEmpty(
        raw.kind,
        raw.type,
        raw.action,
        raw.event,
        "event"
      )
    );

  const isComment =
    rawKind === "comment" ||
    rawKind === "comentario";

  const isCreated =
    [
      "created",
      "create",
      "ticket_created",
      "incidencia_creada",
    ].includes(rawKind);

  return {
    id:
      cleanText(
        firstNonEmpty(
          raw.id,
          raw.commentId,
          raw.eventId,
          `entry_${index}`
        ),
        `entry_${index}`
      ),
    persistedCommentId: persistedCommentId(raw),

    kind:
      isComment
        ? "comment"
        : "event",

    type:
      isCreated
        ? "created"
        : rawKind || "update",

    title:
      cleanText(
        firstNonEmpty(
          raw.title,
          raw.label
        ),
        isComment
          ? "Comentario"
          : isCreated
            ? "Incidencia creada"
            : "Actualización"
      ),

    body:
      cleanMultiline(
        firstNonEmpty(
          raw.body,
          raw.message,
          raw.text,
          raw.comment,
          raw.description,
          raw.descripcion,
          raw.summary,
          raw.title
        ),
        "Actualización registrada."
      ),

    author:
      cleanText(
        firstNonEmpty(
          raw.author,
          raw.byName,
          raw.createdByName,
          raw.userName,
          raw.name,
          raw.by?.name,
          raw.createdBy?.name,
          raw.role
        ),
        isComment
          ? "Usuario"
          : "Sistema"
      ),

    createdAt:
      firstNonEmpty(
        raw.createdAt,
        raw.date,
        raw.timestamp,
        raw.updatedAt,
        null
      ),
  };
}

function getTimeline(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const direct =
    arrayFrom(
      firstNonEmpty(
        detail.timeline,
        raw.timeline,
        []
      )
    );

  if (direct.length) {
    return direct
      .map(normalizeTimelineEntry)
      .sort(
        (a, b) =>
          toTimestamp(
            b.createdAt,
            TIMESTAMP_POLICIES.epoch
          ) -
          toTimestamp(
            a.createdAt,
            TIMESTAMP_POLICIES.epoch
          )
      );
  }

  const history =
    arrayFrom(
      firstNonEmpty(
        detail.history,
        detail.events,

        raw.history,
        raw.events,

        []
      )
    );

  const comments =
    arrayFrom(
      firstNonEmpty(
        detail.comments,
        detail.notes,
        detail.messages,

        raw.comments,
        raw.notes,
        raw.messages,

        []
      )
    );

  return [
    ...history.map(
      (entry, index) =>
        normalizeTimelineEntry(
          entry,
          index
        )
    ),

    ...comments.map(
      (entry, index) =>
        normalizeTimelineEntry(
          {
            ...safeObject(entry),

            kind:
              "comment",

            type:
              "comment",
          },
          index
        )
    ),
  ].sort(
    (a, b) =>
      toTimestamp(
        b.createdAt,
        TIMESTAMP_POLICIES.epoch
      ) -
      toTimestamp(
        a.createdAt,
        TIMESTAMP_POLICIES.epoch
      )
  );
}

function getTimelineCount(detail = {}) {
  const raw = getRaw(detail);
  const direct = arrayFrom(firstNonEmpty(detail.timeline, raw.timeline, []));
  if (direct.length) return direct.length;

  const history = arrayFrom(
    firstNonEmpty(
      detail.history,
      detail.events,
      raw.history,
      raw.events,
      []
    )
  );

  const comments = arrayFrom(
    firstNonEmpty(
      detail.comments,
      detail.notes,
      detail.messages,
      raw.comments,
      raw.notes,
      raw.messages,
      []
    )
  );

  return history.length + comments.length;
}

function getTimelineTone(entry = {}) {
  const kind = slugKey(entry.kind || "event");
  const type = slugKey(entry.type || "update");

  if (kind === "comment") return "comment";
  if (type === "created") return "created";

  const text = slugKey(
    [
      type,
      entry.title,
      entry.body,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    /adjunt|attach|archivo|document|file/.test(text)
  ) {
    return "attachment";
  }

  if (
    /cerrad|closed|resolved|resuelt/.test(text)
  ) {
    return "closed";
  }

  if (
    /reabiert|reopen|abiert|opened/.test(text)
  ) {
    return "reopened";
  }

  if (
    /prioridad|priority|urgent|urgente/.test(text)
  ) {
    return "priority";
  }

  if (
    /tecnico|técnico|technician|asign/.test(text)
  ) {
    return "assignment";
  }

  if (
    /factura|invoice/.test(text)
  ) {
    return "invoice";
  }

  return "update";
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data =
    safeObject(input);

  const detail =
    safeObject(
      firstNonEmpty(
        data.detail,
        data.ticket,
        data.incidencia,
        data.item,
        data.data,
        {}
      ),
      {}
    );

  const ticketId =
    getTicketId(detail);

  const status =
    getStatus(detail);

  const commentDraft =
    cleanMultiline(
      data.commentDraft,
      ""
    );

  const pendingFiles =
    arrayFrom(
      data.pendingFiles
    );

  const adminDraft =
    safeObject(
      data.adminDraft,
      {}
    );

  const currentPriority =
    normalizeIncidenciaPriority(
      getPriority(detail),
      "medium"
    );

  const currentCategory =
    normalizeIncidenciaCategory(
      getCategory(detail),
      "general"
    );

  const desiredStatus =
    normalizeIncidenciaStatus(
      adminDraft.status || status,
      status || "open"
    );

  const desiredPriority =
    normalizeIncidenciaPriority(
      adminDraft.priority || currentPriority,
      currentPriority
    );

  const desiredCategory =
    normalizeIncidenciaCategory(
      adminDraft.category || currentCategory,
      currentCategory
    );

  /* Only an admin may edit the classification, so a non-admin never has a readable
     editor and therefore never has field changes. That gate is permission, not
     pending-state, so it stays here and the authority is asked only what changed. */
  const editableDesired =
    data.admin === true &&
    Boolean(
      adminDraft.status ||
      adminDraft.priority ||
      adminDraft.category
    )
      ? {
          status: desiredStatus,
          priority: desiredPriority,
          category: desiredCategory,
        }
      : null;

  const pending = resolveDetailPending({
    current: {
      status,
      priority: currentPriority,
      category: currentCategory,
    },
    desired: editableDesired,
    comment: commentDraft,
    pendingFiles,
  });

  const hasAdminChanges = pending.fields;

  const previewSource =
    safeObject(
      data.previewFile,
      null
    );

  const previewFile =
    previewSource
      ? normalizeAttachment(
          previewSource,
          0
        )
      : null;

  const attachmentDeleteConfirmId =
    cleanText(
      data.attachmentDeleteConfirmId,
      ""
    );

  const attachmentDeleteConfirmOpen =
    data.admin === true &&
    data.attachmentDeleteConfirmOpen === true &&
    Boolean(attachmentDeleteConfirmId);

  return {
    open:
      data.open === true &&
      Boolean(ticketId),

    detail,
    ticketId,
    status,

    submitting:
      data.submitting === true,

    operation:
      cleanText(data.operation, ""),

    closeConfirmOpen:
      data.closeConfirmOpen === true,

    discardConfirmOpen:
      data.discardConfirmOpen === true,

    attachmentDeleteConfirmOpen,
    attachmentDeleteConfirmId,

    attachmentDeleteConfirmName:
      cleanText(
        data.attachmentDeleteConfirmName,
        "este adjunto"
      ).slice(0, 160),

    commentDraft,
    pendingFiles,
    adminDraft,
    hasAdminChanges,

    pending,

    hasContentDraft: pending.comment || pending.attachments,

    hasDraft: pending.hasChanges,

    /* The button is the global confirmation of this edit, so it is enabled only when
       there is really something to confirm. The submit handler asks the same authority
       again: `disabled` is a courtesy, never the protection. */
    canUpdate: canUpdateDetail({
      pending,
      submitting: Boolean(data.submitting),
    }),

    requiresReopen:
      statusWillReopen(
        status
      ),

    canCloseTicket:
      !statusWillReopen(
        status
      ),

    historyOpen:
      data.historyOpen === true,

    historyCount:
      getTimelineCount(detail),

    admin:
      data.admin === true,

    canDeleteAttachments:
      data.admin === true,

    deletingAttachmentId:
      cleanText(
        data.deletingAttachmentId,
        ""
      ),

    feedbackMessage:
      cleanText(
        data.feedbackMessage,
        ""
      ),

    feedbackType:
      cleanText(
        data.feedbackType,
        "info"
      ),

    openingAttachmentId:
      cleanText(
        data.openingAttachmentId,
        ""
      ),

    downloadingAttachmentId:
      cleanText(
        data.downloadingAttachmentId,
        ""
      ),

    previewFile,
  };
}

/* =========================================================
   SMALL PARTIALS
========================================================= */

function disabledAttrs(
  disabled = false,
  busy = false
) {
  return htmlAttrs({
    disabled:
      Boolean(disabled),

    "aria-disabled":
      disabled
        ? "true"
        : false,

    "aria-busy":
      busy
        ? "true"
        : false,
  });
}

function renderInlineSpinner(
  label = ""
) {
  return `
    <span class="incidencias-modal-inline-spinner">
      <span aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function shortTicketId(
  value = ""
) {
  const id =
    cleanText(value, "");

  if (!id) {
    return "ID";
  }

  if (id.length <= 18) {
    return id;
  }

  return (
    `${id.slice(0, 7)}` +
    `…${id.slice(-6)}`
  );
}

function renderTicketIdChip(
  ticketId = "",
  vm = {}
) {
  const fullId =
    cleanText(
      ticketId,
      ""
    );

  const label =
    shortTicketId(
      fullId
    );

  return `
    <button
      type="button"
      data-detail-action="${DETAIL_ACTIONS.COPY_ID}"
      data-ticket-id="${attr(fullId)}"
      class="incidencias-modal-id-chip"
      title="${attr(
        fullId
          ? `Copiar ID: ${fullId}`
          : "ID de incidencia no disponible"
      )}"
      aria-label="${attr(
        fullId
          ? `Copiar ID ${fullId}`
          : "ID de incidencia"
      )}"
      ${disabledAttrs(
        vm.submitting,
        vm.submitting
      )}
    >
      <span class="incidencias-modal-id-chip-text">
        ${escapeHtml(label)}
      </span>
    </button>
  `;
}

function renderHeaderActions(vm = {}) {
  return `
    <div
      class="incidencias-modal-header-actions"
      data-modal-header-actions="true"
    >
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.HISTORY_REVEAL}"
        class="${joinClasses(
          "incidencias-modal-history-jump-btn",
          vm.historyOpen
            ? "is-active"
            : ""
        )}"
        aria-label="${attr(
          vm.historyOpen
            ? "Volver al detalle de la incidencia"
            : "Abrir historial y actividad"
        )}"
        title="${attr(
          vm.historyOpen
            ? "Volver al ticket"
            : "Ver historial y actividad"
        )}"
        aria-pressed="${vm.historyOpen ? "true" : "false"}"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
        <span class="incidencias-modal-history-jump-icon">
          ${icon("history")}
        </span>
        <span class="incidencias-modal-history-jump-label">
          Historial
        </span>
        <span class="incidencias-modal-history-jump-count" aria-hidden="true">
          ${escapeHtml(String(vm.historyCount))}
        </span>
      </button>

      ${
        vm.canCloseTicket
          ? `
            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE}"
              data-ticket-id="${attr(vm.ticketId)}"
              class="incidencias-modal-close-ticket-btn"
              aria-label="Cerrar incidencia"
              title="Cerrar esta incidencia"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              <span class="incidencias-modal-close-ticket-icon">
                ${icon("check")}
              </span>
              <span class="incidencias-modal-close-ticket-label">
                Cerrar incidencia
              </span>
            </button>
          `
          : ""
      }

      ${renderModalCloseButton({
        label: "Cerrar modal",
        attributes: {
          "data-detail-action": DETAIL_ACTIONS.CLOSE,
          title: "Cerrar ventana",
          disabled: Boolean(vm.submitting),
          "aria-disabled": vm.submitting ? "true" : false,
          "aria-busy": vm.submitting ? "true" : false,
        },
      })}
    </div>
  `;
}

function renderChip(
  label = "",
  modifier = "neutral"
) {
  const safeLabel =
    cleanText(
      label,
      "—"
    );

  const safeModifier =
    slugKey(
      modifier
    ) ||
    "neutral";

  return `
    <span
      class="incidencias-modal-chip ui-detail-modal-chip incidencias-modal-chip--${attr(safeModifier)} ui-detail-modal-chip--${attr(safeModifier)}"
      title="${attr(safeLabel)}"
    >${escapeHtml(safeLabel)}</span>
  `;
}

function renderAvatar(
  detail = {}
) {
  const name =
    getClientName(detail);

  const email =
    getClientEmail(detail);

  const avatarUrl =
    getClientAvatar(detail);

  const presentation = resolveAvatarPresentation({
    ...requesterIdentity(detail),
    displayName: name,
    name,
    email,
  });

  const tone = presentation.tone;

  return `
    <div
      class="incidencias-modal-avatar ui-detail-modal-avatar"
      title="${attr(name)}"
    >
      <div
        class="${joinClasses(
          "incidencias-modal-avatar-frame ui-detail-modal-avatar-frame",

          avatarUrl
            ? ""
            : "incidencias-modal-avatar-frame--fallback"
        )}"
        data-modal-avatar-frame="true"
        data-avatar-system="true"
        data-avatar-host="true"
        data-avatar-source="incidencias-detail"
        data-avatar-name="${attr(presentation.name)}"
        data-avatar-email="${attr(presentation.email)}"
        data-avatar-user-id="${attr(presentation.userId)}"
        data-avatar-username="${attr(presentation.username)}"
        data-has-avatar="${avatarUrl ? "true" : "false"}"
        data-fallback="${avatarUrl ? "false" : "true"}"
        data-avatar-tone="${attr(String(tone))}"
        data-avatar-identity="${attr(presentation.fingerprint)}"
        data-avatar-initials="${attr(presentation.initials)}"
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
                data-avatar-image="true"
                data-modal-avatar-img="true"
              >
            `
            : ""
        }

        <span class="incidencias-modal-avatar-fallback ui-detail-modal-avatar-fallback" data-avatar-fallback="true">
          ${escapeHtml(
            presentation.initials
          )}
        </span>
      </div>
    </div>
  `;
}


function contactEmailHref(value = "") {
  const email = cleanText(value, "");

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return "";
  }

  return `mailto:${email}`;
}

function contactPhoneHref(value = "") {
  const raw = cleanText(value, "");

  if (!raw) {
    return "";
  }

  const compact = raw
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");

  const digits = compact.replace(/\D/g, "");

  if (digits.length < 6) {
    return "";
  }

  return `tel:${compact}`;
}

function renderContactAction({
  label = "",
  value = "",
  href = "",
  iconName = "file",
  actionLabel = "Abrir",
} = {}) {
  const displayValue = cleanText(value, "—");
  const safeHref = cleanText(href, "");

  if (!safeHref) {
    return renderMetaField(label, displayValue);
  }

  return `
    <a
      class="incidencias-modal-meta-card ui-detail-modal-meta-card incidencias-modal-contact-link"
      href="${attr(safeHref)}"
      aria-label="${attr(`${actionLabel}: ${displayValue}`)}"
      title="${attr(actionLabel)}"
    >
      <span class="incidencias-modal-contact-label">
        <span class="incidencias-modal-contact-icon" aria-hidden="true">
          ${icon(iconName)}
        </span>
        <span>${escapeHtml(label)}</span>
      </span>

      <strong>${escapeHtml(displayValue)}</strong>

      <small class="incidencias-modal-contact-action-copy">
        ${escapeHtml(actionLabel)}
      </small>
    </a>
  `;
}

function renderTechnicianValue(
  detail = {}
) {
  if (
    !hasAssignedTechnician(
      detail
    )
  ) {
    return `
      <span
        class="incidencias-modal-technician-inline incidencias-modal-technician-inline--unassigned"
        data-modal-technician="true"
        data-technician-assigned="false"
      >
        <span
          class="incidencias-modal-technician-avatar incidencias-modal-technician-avatar--fallback"
          data-modal-technician-avatar-frame="true"
          data-has-avatar="false"
          data-fallback="true"
          aria-hidden="true"
        >
          <span>—</span>
        </span>

        <span class="incidencias-modal-technician-copy">
          <strong>Sin técnico asignado</strong>
          <small>Pendiente de asignación</small>
        </span>
      </span>
    `;
  }

  const name =
    getTechnicianName(detail) ||
    "Técnico asignado";

  const email =
    getTechnicianEmail(detail);

  const avatarUrl =
    getTechnicianAvatar(detail);

  const emailHref =
    contactEmailHref(email);

  const presentation = resolveAvatarPresentation({
    ...technicianIdentity(detail),
    displayName: name,
    name,
    email,
  });

  const tone = presentation.tone;

  return `
    <span
      class="incidencias-modal-technician-inline"
      data-modal-technician="true"
      data-technician-assigned="true"
    >
      <span
        class="${joinClasses(
          "incidencias-modal-technician-avatar",

          avatarUrl
            ? ""
            : "incidencias-modal-technician-avatar--fallback"
        )}"
        data-modal-technician-avatar-frame="true"
        data-has-avatar="${avatarUrl ? "true" : "false"}"
        data-fallback="${avatarUrl ? "false" : "true"}"
        data-avatar-tone="${attr(String(tone))}"
        data-avatar-identity="${attr(presentation.fingerprint)}"
        data-avatar-initials="${attr(presentation.initials)}"
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

        <span>
          ${escapeHtml(
            presentation.initials
          )}
        </span>
      </span>

      <span class="incidencias-modal-technician-copy">
        <strong>${escapeHtml(name)}</strong>

        ${
          email
            ? emailHref
              ? `
                <a
                  class="incidencias-modal-technician-email"
                  href="${attr(emailHref)}"
                  aria-label="${attr(`Enviar correo a ${email}`)}"
                  title="Enviar correo"
                >${escapeHtml(email)}</a>
              `
              : `<small>${escapeHtml(email)}</small>`
            : ""
        }
      </span>
    </span>
  `;
}

function renderMetaField(
  label = "",
  value = "",
  options = {}
) {
  const html =
    options.html === true;

  return `
    <div class="incidencias-modal-meta-card ui-detail-modal-meta-card">
      <span>${escapeHtml(label)}</span>

      ${
        html
          ? value
          : `
            <strong>
              ${escapeHtml(
                cleanText(
                  value,
                  "—"
                )
              )}
            </strong>
          `
      }
    </div>
  `;
}

function renderFeedbackBox(
  vm = {}
) {
  const message =
    cleanText(
      vm.feedbackMessage,
      ""
    );

  if (!message) {
    return "";
  }

  const type =
    slugKey(
      vm.feedbackType ||
      "info"
    );

  const title =
    type === "error"
      ? "No se ha podido completar la acción"
      : type === "success"
        ? "Acción completada"
        : type === "warning"
          ? "Aviso"
          : "Información";

  return `
    <div
      class="incidencias-modal-feedback incidencias-modal-feedback--${attr(type)}"
      role="${type === "error" ? "alert" : "status"}"
      aria-live="${type === "error" ? "assertive" : "polite"}"
      data-modal-feedback="true"
    >
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}


function renderDetailConfirmation(vm = {}) {
  const attachmentDelete =
    vm.attachmentDeleteConfirmOpen === true;

  const discard =
    vm.discardConfirmOpen === true;

  const closeTicket =
    vm.closeConfirmOpen === true;

  if (
    !attachmentDelete &&
    !discard &&
    !closeTicket
  ) {
    return "";
  }

  const kind =
    attachmentDelete
      ? "attachment-delete"
      : discard
        ? "discard"
        : "ticket-close";

  const eyebrow =
    attachmentDelete
      ? "Eliminar adjunto"
      : discard
        ? "Cambios sin guardar"
        : "Confirmar cierre";

  const title =
    attachmentDelete
      ? "¿Eliminar este archivo?"
      : discard
        ? "¿Descartar los cambios?"
        : "¿Cerrar esta incidencia?";

  const description =
    attachmentDelete
      ? "Se quitará de la incidencia y del almacenamiento. Esta acción no se puede deshacer."
      : discard
        ? "Si cierras ahora, perderás el comentario, los archivos seleccionados o los cambios de gestión que todavía no se hayan guardado."
        : "La incidencia pasará a estado cerrado. Podrás volver a abrirla más adelante enviando una nueva actualización.";

  const cancelAction =
    attachmentDelete
      ? DETAIL_ACTIONS.ATTACHMENT_DELETE_CANCEL
      : discard
        ? DETAIL_ACTIONS.DISCARD_CLOSE_CANCEL
        : DETAIL_ACTIONS.TICKET_CLOSE_CANCEL;

  const confirmAction =
    attachmentDelete
      ? DETAIL_ACTIONS.ATTACHMENT_DELETE_CONFIRM
      : discard
        ? DETAIL_ACTIONS.DISCARD_CLOSE_CONFIRM
        : DETAIL_ACTIONS.TICKET_CLOSE_CONFIRM;

  const cancelLabel =
    attachmentDelete
      ? "Conservar archivo"
      : discard
        ? "Seguir editando"
        : "Cancelar";

  const confirmLabel =
    attachmentDelete
      ? "Sí, eliminar adjunto"
      : discard
        ? "Sí, descartar y cerrar"
        : "Sí, cerrar incidencia";

  const titleId =
    `incidencias-${kind}-confirm-title`;

  const descriptionId =
    `incidencias-${kind}-confirm-description`;

  const filenameId =
    "incidencias-attachment-delete-confirm-filename";

  return `
    <div
      class="incidencias-modal-confirm-overlay"
      data-detail-confirm-overlay="true"
      data-detail-close-confirm-overlay="true"
      data-confirm-kind="${kind}"
    >
      <section
        class="incidencias-modal-confirm-dialog"
        data-detail-confirm-dialog="true"
        data-detail-close-confirm-dialog="true"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="${titleId}"
        aria-describedby="${descriptionId}${attachmentDelete ? ` ${filenameId}` : ""}"
        tabindex="-1"
      >
        <div class="incidencias-modal-confirm-icon" aria-hidden="true">
          ${icon("alertTriangle")}
        </div>

        <div class="incidencias-modal-confirm-copy">
          <span class="incidencias-modal-confirm-eyebrow">
            ${escapeHtml(eyebrow)}
          </span>

          <h3 id="${titleId}">
            ${escapeHtml(title)}
          </h3>

          <p id="${descriptionId}">
            ${escapeHtml(description)}
          </p>

          ${
            attachmentDelete
              ? `<div
                  id="${filenameId}"
                  class="incidencias-modal-confirm-filename"
                  data-detail-attachment-delete-name="true"
                  title="${attr(vm.attachmentDeleteConfirmName)}"
                >
                  <span aria-hidden="true">${icon("trash")}</span>
                  <strong>${escapeHtml(vm.attachmentDeleteConfirmName)}</strong>
                </div>`
              : ""
          }

          ${
            !attachmentDelete &&
            !discard &&
            vm.hasDraft
              ? `<div class="incidencias-modal-confirm-warning" role="note">Tienes cambios sin guardar. Si confirmas el cierre, se descartarán cuando se cierre esta ventana.</div>`
              : ""
          }
        </div>

        <div class="incidencias-modal-confirm-actions">
          <button
            type="button"
            class="incidencias-modal-confirm-btn incidencias-modal-confirm-btn--cancel"
            data-detail-action="${cancelAction}"
          >${escapeHtml(cancelLabel)}</button>

          <button
            type="button"
            class="incidencias-modal-confirm-btn incidencias-modal-confirm-btn--danger"
            data-detail-action="${confirmAction}"
          >
            <span
              class="incidencias-modal-confirm-btn-icon"
              aria-hidden="true"
            >${icon(attachmentDelete ? "trash" : "check")}</span>

            <span>${escapeHtml(confirmLabel)}</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderLoadingOverlay(
  label = "Procesando..."
) {
  return `
    <div
      class="incidencias-modal-loading-overlay"
      aria-live="polite"
      aria-busy="true"
    >
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

function renderPendingFiles(
  vm = {}
) {
  const files =
    arrayFrom(
      vm.pendingFiles
    );

  if (!files.length) {
    return `
      <div
        class="incidencias-modal-pending-empty"
        data-modal-pending-files="true"
      >
        No has seleccionado archivos nuevos.
      </div>
    `;
  }

  return `
    <div
      class="incidencias-modal-pending-list"
      data-modal-pending-files="true"
      aria-label="Archivos nuevos seleccionados"
    >
      ${files
        .map(
          (file, index) => {
            const name =
              safeFilename(
                file?.name ||
                  `archivo_${index + 1}`,
                `archivo_${index + 1}`
              );

            const meta =
              [
                cleanText(
                  file?.type,
                  ""
                ),

                formatBytes(
                  file?.size
                ),
              ]
                .filter(Boolean)
                .join(" · ");

            return `
              <div
                class="incidencias-modal-pending-file"
                data-file-index="${attr(String(index))}"
              >
                <div>
                  <strong>${escapeHtml(name)}</strong>
                  <span>${escapeHtml(meta || "Archivo preparado")}</span>
                </div>

                <button
                  type="button"
                  data-detail-action="${DETAIL_ACTIONS.PENDING_FILE_REMOVE}"
                  data-file-index="${attr(String(index))}"
                  data-remove-attachment="${attr(String(index))}"
                  aria-label="${attr(`Quitar ${name}`)}"
                  ${disabledAttrs(
                    vm.submitting,
                    vm.submitting
                  )}
                >Quitar</button>
              </div>
            `;
          }
        )
        .join("")}
    </div>
  `;
}

function submitButtonLabel(
  vm = {}
) {
  if (vm.submitting) {
    return vm.operation === "admin-update"
      ? "Aplicando cambios..."
      : "Actualizando...";
  }

  if (vm.hasAdminChanges && vm.hasContentDraft) {
    return vm.requiresReopen
      ? "Actualizar incidencia y reabrir"
      : "Actualizar incidencia";
  }

  if (vm.hasAdminChanges) {
    return "Actualizar incidencia";
  }

  return vm.requiresReopen
    ? "Actualizar incidencia y reabrir"
    : "Actualizar incidencia";
}

function renderSubmitButton(
  vm = {}
) {
  const label =
    submitButtonLabel(vm);

  return `
    <button
      type="button"
      data-detail-action="${DETAIL_ACTIONS.COMMENT_SUBMIT}"
      data-ticket-id="${attr(vm.ticketId)}"
      data-reopens-ticket="${vm.requiresReopen ? "true" : "false"}"
      data-detail-pending="${(vm.pending?.parts || []).join(" ")}"
      ${disabledAttrs(
        !vm.canUpdate,
        vm.submitting
      )}
      class="incidencias-modal-submit-btn ui-detail-modal-submit-btn"
    >
      ${
        vm.submitting
          ? renderInlineSpinner(
              label
            )
          : escapeHtml(label)
      }
    </button>
  `;
}

function renderComposer(
  vm = {}
) {
  const disabled =
    disabledAttrs(
      vm.submitting,
      vm.submitting
    );

  const reopenCopy =
    vm.hasAdminChanges && !vm.hasContentDraft
      ? "Los cambios de gestión se aplicarán al guardar desde esta misma acción."
      : vm.requiresReopen
        ? "Esta incidencia está cerrada o resuelta. Al enviar, volverá a estado abierta."
        : "La actualización se añadirá al historial de la incidencia.";

  return `
    <section
      class="incidencias-modal-composer"
      data-modal-composer="true"
      data-modal-has-draft="${vm.hasDraft ? "true" : "false"}"
      data-modal-requires-reopen="${vm.requiresReopen ? "true" : "false"}"
      aria-labelledby="incidencias-modal-composer-title"
    >
      <div class="incidencias-modal-composer-head">
        <div
          class="incidencias-modal-composer-icon"
          aria-hidden="true"
        >${icon("plus")}</div>

        <div class="incidencias-modal-composer-copy">
          <h3 id="incidencias-modal-composer-title">
            Añadir actualización
          </h3>

          <span>
            Escribe un comentario y, si lo necesitas, adjunta archivos de soporte.
          </span>
        </div>
      </div>

      <textarea
        id="${COMMENT_ID}"
        data-detail-field="comment"
        data-field="comment"
        name="comment"
        maxlength="${attr(String(MAX_COMMENT_LENGTH))}"
        placeholder="Ejemplo: He probado de nuevo y adjunto una captura..."
        aria-describedby="incidencias-modal-comment-help"
        ${disabled}
        class="incidencias-modal-comment-textarea"
      >${escapeHtml(vm.commentDraft)}</textarea>

      <div
        id="incidencias-modal-comment-help"
        class="incidencias-modal-composer-foot"
        data-modal-composer-foot="true"
      >
        <span>${escapeHtml(reopenCopy)}</span>

        <strong>
          ${escapeHtml(
            `${vm.commentDraft.length}/${MAX_COMMENT_LENGTH}`
          )}
        </strong>
      </div>

      <label
        for="${ATTACHMENTS_INPUT_ID}"
        class="incidencias-modal-dropzone"
        data-dropzone="detail-attachments"
        data-modal-dropzone="true"
      >
        <input
          id="${ATTACHMENTS_INPUT_ID}"
          type="file"
          data-detail-field="attachments"
          data-field="attachments"
          name="attachments"
          multiple
          aria-describedby="incidencias-modal-attachments-help"
          ${disabled}
        >

        <span>Seleccionar archivos</span>

        <small id="incidencias-modal-attachments-help">
          Imágenes, PDFs y documentos · Máximo ${MAX_PENDING_FILES} archivos · ${formatLimitBytes(MAX_PENDING_FILE_SIZE)} por archivo
        </small>
      </label>

      ${renderPendingFiles(vm)}
    </section>
  `;
}

/* The global action of the edit, in the shell's own footer slot -- the same slot every
   other dialog uses. It lives outside the "Añadir actualización" card on purpose: it
   confirms every pending change of the incidencia, not just the comment. */
function renderDetailFooter(
  vm = {}
) {
  const parts = vm.pending?.parts || [];

  const summary =
    vm.submitting
      ? "Guardando los cambios pendientes…"
      : parts.length
        ? `Se guardarán: ${describePendingParts(parts)}.`
        : "No hay cambios pendientes.";

  return `
    <p
      class="incidencias-modal-footer-summary ui-detail-modal-footer-summary"
      data-detail-pending-summary="true"
    >${escapeHtml(summary)}</p>

    ${renderSubmitButton(vm)}
  `;
}


/* =========================================================
   ATTACHMENT CARDS
========================================================= */

function getAttachmentBusyMeta(
  file = {},
  vm = {}
) {
  const attachmentId =
    getAttachmentId(file);

  return {
    attachmentId,

    isOpening:
      Boolean(
        attachmentId &&
        vm.openingAttachmentId ===
          attachmentId
      ),

    isDownloading:
      Boolean(
        attachmentId &&
        vm.downloadingAttachmentId ===
          attachmentId
      ),

    isDeleting:
      Boolean(
        attachmentId &&
        vm.deletingAttachmentId ===
          attachmentId
      ),
  };
}

function renderAttachmentPreviewSquare(
  file = {},
  vm = {}
) {
  const busy =
    getAttachmentBusyMeta(
      file,
      vm
    );

  const isImage =
    isImageLikeAttachment(file);

  const url =
    isImage
      ? getAttachmentViewUrl(file)
      : "";

  const name =
    safeFilename(
      firstNonEmpty(
        file.name,
        file.filename,
        file.fileName
      ),
      "archivo"
    );

  const disabled =
    vm.submitting ||
    busy.isOpening ||
    !busy.attachmentId;

  /*
     Si el detalle no trae una SAS inline válida:
     NO pintamos un <img> roto con blobUrl privado.
     Mostramos el tipo y "Ver" solicitará una SAS nueva al backend.
  */
  if (
    !isImage ||
    !url
  ) {
    return `
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-attachment-id="${attr(busy.attachmentId)}"
        class="incidencias-modal-file-square"
        aria-label="${attr(`Ver ${name}`)}"
        data-renderable-thumbnail="false"
        ${disabledAttrs(
          disabled,
          busy.isOpening
        )}
      >
        <span>
          ${escapeHtml(
            attachmentTypeLabel(file)
          )}
        </span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
      data-attachment-id="${attr(busy.attachmentId)}"
      class="${joinClasses(
        "incidencias-modal-image-thumb-wrap",

        busy.isOpening
          ? "is-loading"
          : ""
      )}"
      aria-label="${attr(`Ampliar ${name}`)}"
      data-modal-thumb-frame="true"
      data-renderable-thumbnail="true"
      data-thumb-error="false"
      ${disabledAttrs(
        disabled,
        busy.isOpening
      )}
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

      <span class="incidencias-modal-image-thumb-fallback">
        IMG
      </span>

      <span class="incidencias-modal-image-open-badge">
        ${
          busy.isOpening
            ? "Abriendo..."
            : "Ver"
        }
      </span>
    </button>
  `;
}

function renderAttachmentActionButtons(
  file = {},
  vm = {}
) {
  const busy =
    getAttachmentBusyMeta(
      file,
      vm
    );

  const name =
    safeFilename(
      firstNonEmpty(
        file.name,
        file.filename,
        file.fileName
      ),
      "archivo"
    );

  const noId =
    !busy.attachmentId;

  return `
    <div class="incidencias-modal-attachment-actions">
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_OPEN}"
        data-attachment-id="${attr(busy.attachmentId)}"
        ${disabledAttrs(
          noId ||
          busy.isOpening ||
          vm.submitting,
          busy.isOpening
        )}
        class="incidencias-modal-view-btn ui-detail-modal-view-btn"
        aria-label="${attr(`Ver ${name}`)}"
      >
        ${
          busy.isOpening
            ? renderInlineSpinner(
                "Abriendo..."
              )
            : `
              <span class="incidencias-modal-action-icon ui-detail-modal-action-icon">
                ${icon("eye")}
              </span>
              <span>Ver</span>
            `
        }
      </button>

      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD}"
        data-attachment-id="${attr(busy.attachmentId)}"
        ${disabledAttrs(
          noId ||
          busy.isDownloading ||
          vm.submitting,
          busy.isDownloading
        )}
        class="incidencias-modal-download-btn"
        aria-label="${attr(`Descargar ${name}`)}"
      >
        ${
          busy.isDownloading
            ? renderInlineSpinner(
                "Bajando..."
              )
            : `
              <span class="incidencias-modal-action-icon ui-detail-modal-action-icon">
                ${icon("download")}
              </span>
              <span>Descargar</span>
            `
        }
      </button>

      ${
        vm.canDeleteAttachments
          ? `
            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_DELETE}"
              data-attachment-id="${attr(busy.attachmentId)}"
              ${disabledAttrs(
                noId ||
                busy.isDeleting ||
                vm.submitting,
                busy.isDeleting
              )}
              class="incidencias-modal-delete-btn"
              aria-label="${attr(`Eliminar ${name}`)}"
              title="Eliminar este adjunto"
            >
              ${
                busy.isDeleting
                  ? renderInlineSpinner(
                      "Eliminando..."
                    )
                  : `
                    <span class="incidencias-modal-action-icon ui-detail-modal-action-icon">
                      ${icon("trash")}
                    </span>
                    <span>Eliminar</span>
                  `
              }
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderAttachments(
  vm = {}
) {
  const files =
    getAttachments(
      vm.detail
    );

  return `
    <div
      class="incidencias-modal-files-block incidencias-modal-files-block--compact"
      data-modal-files-block="true"
    >
      <section
        class="incidencias-modal-current-files"
        data-modal-current-files="true"
        aria-labelledby="incidencias-modal-files-title"
      >
        <div class="incidencias-modal-section-head ui-detail-modal-section-head">
          <h3 id="incidencias-modal-files-title">
            Documentos actuales
          </h3>

          <span>
            ${escapeHtml(String(files.length))}
            adjunto${files.length === 1 ? "" : "s"}
          </span>
        </div>

        ${
          !files.length
            ? `
              <div class="incidencias-modal-empty-box">
                No hay archivos adjuntos en esta incidencia.
              </div>
            `
            : `
              <div class="incidencias-modal-attachments-grid">
                ${files
                  .map(
                    (file) => {
                      const id =
                        getAttachmentId(file);

                      const name =
                        safeFilename(
                          firstNonEmpty(
                            file.name,
                            file.filename,
                            file.fileName
                          ),
                          "Archivo"
                        );

                      const meta =
                        [
                          cleanText(
                            firstNonEmpty(
                              file.contentType,
                              file.type,
                              file.mimeType,
                              file.mimetype
                            ),
                            ""
                          ),

                          formatBytes(
                            file.size
                          ),

                          file.uploadedAt
                            ? formatDate(
                                file.uploadedAt
                              )
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ");

                      return `
                        <article
                          class="incidencias-modal-attachment-card"
                          data-attachment-id="${attr(id)}"
                          data-attachment-view-ready="${getAttachmentViewUrl(file) ? "true" : "false"}"
                        >
                          <div class="incidencias-modal-attachment-row">
                            ${renderAttachmentPreviewSquare(file, vm)}

                            <div class="incidencias-modal-attachment-copy">
                              <strong>${escapeHtml(name)}</strong>

                              <span>
                                ${escapeHtml(
                                  meta ||
                                  "Archivo adjunto"
                                )}
                              </span>
                            </div>

                            ${renderAttachmentActionButtons(file, vm)}
                          </div>
                        </article>
                      `;
                    }
                  )
                  .join("")}
              </div>
            `
        }
      </section>
    </div>
  `;
}

/* =========================================================
   ATTACHMENT PREVIEW
========================================================= */

function renderAttachmentPreview(
  vm = {}
) {
  const file =
    safeObject(
      vm.previewFile,
      null
    );

  if (!file) {
    return "";
  }

  /*
     NUNCA:
     - downloadUrl
     - blobUrl
     - publicUrl

     Para vista inline sólo usamos la URL que pasó la política
     de adjuntos y que procede del endpoint /view.
  */
  const url =
    getAttachmentViewUrl(
      file
    );

  if (!url) {
    return "";
  }

  const filename =
    safeFilename(
      firstNonEmpty(
        file.filename,
        file.fileName,
        file.name
      ),
      "Documento"
    );

  const type =
    cleanText(
      firstNonEmpty(
        file.contentType,
        file.type,
        file.mimeType,
        file.mimetype
      ),
      ""
    );

  const size =
    formatBytes(
      file.size
    );

  const image =
    isImageLikeAttachment(
      file
    );

  const pdf =
    isPdfLikeAttachment(
      file
    );

  const inlinePreview =
    image ||
    pdf;

  const meta =
    [
      type ||
        (
          inlinePreview
            ? "Vista previa"
            : "Documento"
        ),

      size,
    ]
      .filter(Boolean)
      .join(" · ");

  return `
    <section
      class="incidencias-modal-preview"
      data-modal-preview="true"
      data-preview-kind="${
        image
          ? "image"
          : pdf
            ? "pdf"
            : "document"
      }"
      data-preview-url-policy="signed-view-only"
      data-preview-attachment-id="${attr(getAttachmentId(file))}"
      aria-labelledby="incidencias-modal-preview-title"
      tabindex="-1"
    >
      <div class="incidencias-modal-preview-head">
        <div class="incidencias-modal-preview-copy">
          <strong id="incidencias-modal-preview-title">
            ${escapeHtml(filename)}
          </strong>

          <span>
            ${escapeHtml(
              meta ||
              "Documento preparado"
            )}
          </span>
        </div>

        <div class="incidencias-modal-preview-actions">
          ${
            !image
              ? `
                <button
                  type="button"
                  data-detail-action="${DETAIL_ACTIONS.PREVIEW_DOWNLOAD}"
                  class="incidencias-modal-preview-btn"
                >Descargar</button>
              `
              : ""
          }

          <button
            type="button"
            data-detail-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"
            class="incidencias-modal-preview-btn"
            aria-label="Cerrar vista previa"
          >Cerrar vista</button>
        </div>
      </div>

      ${
        image
          ? `
            <div class="incidencias-modal-preview-frame is-image">
              <img
                src="${attr(url)}"
                alt="${attr(filename)}"
                class="incidencias-modal-preview-image"
                loading="eager"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
                data-modal-preview-image="true"
              >
            </div>
          `
          : pdf
            ? `
              <div class="incidencias-modal-preview-frame is-pdf">
                <iframe
                  src="${attr(url)}"
                  title="${attr(filename)}"
                  class="incidencias-modal-preview-iframe"
                  loading="eager"
                  referrerpolicy="no-referrer"
                  data-modal-preview-pdf="true"
                ></iframe>
              </div>
            `
            : `
              <div class="incidencias-modal-empty-box">
                Este tipo de archivo no se previsualiza dentro del panel.
                Utiliza “Descargar” para abrirlo con una aplicación compatible.
              </div>
            `
      }
    </section>
  `;
}

/* =========================================================
   CONTENT
========================================================= */

function renderAdminSelect({
  label = "",
  name = "",
  value = "",
  options = [],
  disabled = false,
} = {}) {
  return `
    <label class="incidencias-modal-admin-field">
      <span class="incidencias-modal-admin-label">${escapeHtml(label)}</span>
      <span class="incidencias-modal-admin-select-wrap">
        <select
class="incidencias-modal-admin-select"
name="${attr(name)}"
data-detail-field="${attr(name)}"
${disabledAttrs(disabled, false)}
        >
${arrayFrom(options).map((item) => `
  <option value="${attr(item.value)}"${item.value === value ? " selected" : ""}>${escapeHtml(item.label)}</option>
`).join("")}
        </select>
        <span class="incidencias-modal-admin-select-chevron" aria-hidden="true">⌄</span>
      </span>
    </label>
  `;
}

function renderAdminTicketEditor(vm = {}) {
  if (!vm.admin) return "";

  const detail = safeObject(vm.detail);
  const draft = safeObject(vm.adminDraft);
  const status = normalizeIncidenciaStatus(draft.status || vm.status, "open");
  const priority = normalizeIncidenciaPriority(draft.priority || getPriority(detail), "medium");
  const category = normalizeIncidenciaCategory(draft.category || getCategory(detail), "general");

  return `
    <section
      class="incidencias-modal-admin-editor"
      data-modal-admin-editor="true"
      data-admin-ticket-dirty="${vm.hasAdminChanges ? "true" : "false"}"
      aria-labelledby="incidencias-modal-admin-editor-title"
    >
      <div class="incidencias-modal-section-head ui-detail-modal-section-head incidencias-modal-admin-head">
        <div>
          <h3 id="incidencias-modal-admin-editor-title">Gestión del ticket</h3>
          <span>Estado, prioridad y tipo de incidencia</span>
        </div>
        <span class="incidencias-modal-admin-badge">Administrador</span>
      </div>

      <div
        class="incidencias-modal-admin-form"
        data-admin-ticket-editor="true"
        role="group"
        aria-label="Gestión administrativa del ticket"
      >
        <div class="incidencias-modal-admin-grid">
          ${renderAdminSelect({
            label: "Estado",
            name: "status",
            value: status,
            options: INCIDENCIA_STATUS_OPTIONS,
            disabled: vm.submitting,
          })}
          ${renderAdminSelect({
            label: "Prioridad",
            name: "priority",
            value: priority,
            options: INCIDENCIA_PRIORITY_OPTIONS,
            disabled: vm.submitting,
          })}
          ${renderAdminSelect({
            label: "Tipo de incidencia",
            name: "category",
            value: category,
            options: INCIDENCIA_CATEGORY_OPTIONS,
            disabled: vm.submitting,
          })}
        </div>
      </div>
    </section>
  `;
}

function renderDescription(
  detail = {}
) {
  return `
    <section
      class="incidencias-modal-description-section ui-detail-modal-description-section"
      aria-labelledby="incidencias-modal-description-title"
    >
      <div class="incidencias-modal-section-head ui-detail-modal-section-head">
        <h3 id="incidencias-modal-description-title">
          Descripción
        </h3>
      </div>

      <p
        id="${DESCRIPTION_ID}"
        class="incidencias-modal-description"
      >${escapeHtml(
        getDescription(detail)
      )}</p>
    </section>
  `;
}

function renderContactBlock(
  detail = {}
) {
  const email =
    getClientEmail(detail);

  const phone =
    getClientPhone(detail);

  if (
    !email &&
    !phone
  ) {
    return "";
  }

  const emailHref =
    contactEmailHref(email);

  const phoneHref =
    contactPhoneHref(phone);

  return `
    <section
      class="incidencias-modal-contact-section ui-detail-modal-contact-section"
      aria-labelledby="incidencias-modal-contact-title"
    >
      <div class="incidencias-modal-section-head ui-detail-modal-section-head">
        <h3 id="incidencias-modal-contact-title">
          Contacto
        </h3>
      </div>

      <div class="incidencias-modal-contact-grid ui-detail-modal-contact-grid">
        ${
          email
            ? renderContactAction({
                label: "Email",
                value: email,
                href: emailHref,
                iconName: "mail",
                actionLabel: "Enviar correo",
              })
            : ""
        }

        ${
          phone
            ? renderContactAction({
                label: "Teléfono",
                value: phone,
                href: phoneHref,
                iconName: "phone",
                actionLabel: "Llamar",
              })
            : ""
        }
      </div>
    </section>
  `;
}

function renderTimeline(
  detail = {}
) {
  const timeline =
    getTimeline(detail);

  if (!timeline.length) {
    return `
      <div class="incidencias-timeline-empty">
        Sin actividad
      </div>
    `;
  }

  return `
    <div class="incidencias-timeline-list">
      ${timeline
        .map(
          (entry) => {
            const kind =
              cleanText(
                entry.kind,
                "event"
              );

            const type =
              cleanText(
                entry.type,
                "update"
              );

            const isComment =
              kind === "comment";

            const isCreated =
              type === "created";

            const tone =
              getTimelineTone(entry);

            const title =
              cleanText(
                entry.title,

                isComment
                  ? "Comentario"
                  : isCreated
                    ? "Incidencia creada"
                    : "Actualización"
              );

            const body =
              cleanMultiline(
                entry.body,
                "Actualización registrada."
              );

            return `
              <article
                class="${joinClasses(
                  "incidencias-timeline-card",
                  `tone-${tone}`,

                  isComment
                    ? "is-comment"
                    : "",

                  isCreated
                    ? "is-created"
                    : ""
                )}"
                data-timeline-tone="${attr(tone)}"
                ${isComment && entry.persistedCommentId ? `data-comment-id="${attr(entry.persistedCommentId)}"` : ""}
              >
                <div class="incidencias-timeline-accent"></div>

                <div class="incidencias-timeline-main">
                  <div class="incidencias-timeline-title-row">
                    <strong class="incidencias-timeline-title">
                      ${escapeHtml(title)}
                    </strong>

                    <span class="incidencias-timeline-kind">
                      ${escapeHtml(
                        isComment
                          ? "Comentario"
                          : isCreated
                            ? "Sistema"
                            : "Cambio"
                      )}
                    </span>
                  </div>

                  <p class="incidencias-timeline-body">
                    ${escapeHtml(body)}
                  </p>
                </div>

                <div class="incidencias-timeline-meta">
                  <strong>
                    ${escapeHtml(
                      cleanText(
                        entry.author,
                        "Sistema"
                      )
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      formatDate(
                        entry.createdAt
                      )
                    )}
                  </span>
                </div>
              </article>
            `;
          }
        )
        .join("")}
    </div>
  `;
}

function renderHistorySection(vm = {}) {
  const count = getTimelineCount(vm.detail);
  const countLabel = count
    ? `${count} registro${count === 1 ? "" : "s"}`
    : "Sin actividad registrada";

  return `
    <section
      class="incidencias-modal-history-section ui-detail-modal-history-section incidencias-modal-history-view"
      data-modal-history-slot="true"
      data-history-open="true"
      aria-labelledby="incidencias-modal-history-title"
      tabindex="-1"
    >
      <div class="incidencias-modal-history-view-head">
        <div class="incidencias-modal-history-view-heading">
          <span class="incidencias-modal-history-view-icon" aria-hidden="true">
            ${icon("history")}
          </span>

          <div>
            <h3 id="incidencias-modal-history-title">
              Historial y actividad
            </h3>
            <span>${escapeHtml(countLabel)}</span>
          </div>
        </div>

        <button
          type="button"
          class="incidencias-modal-history-back-btn"
          data-detail-action="${DETAIL_ACTIONS.HISTORY_REVEAL}"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >
          Volver al ticket
        </button>
      </div>

      <div
        id="incidencias-modal-history-content"
        class="incidencias-modal-history-content incidencias-modal-history-content--standalone"
      >
        ${renderTimeline(vm.detail)}
      </div>
    </section>
  `;
}

function renderTicketBody(
  vm = {},
  {
    detail = {},
    attachments = [],
    createdAt = "—",
  } = {}
) {
  return `
    <div
      data-modal-feedback-slot="true"
      aria-live="polite"
    >
      ${renderFeedbackBox(vm)}
    </div>

    <div
      data-modal-preview-slot="true"
      data-preview-active="${vm.previewFile ? "true" : "false"}"
      aria-live="polite"
    >
      ${renderAttachmentPreview(vm)}
    </div>

    <div class="incidencias-modal-meta-grid ui-detail-modal-meta-grid">
      ${renderMetaField(
        "Técnico",
        renderTechnicianValue(detail),
        {
          html: true,
        }
      )}

      ${renderMetaField(
        "Factura",
        getInvoiceLabel(detail)
      )}

      ${renderMetaField(
        "Creada",
        createdAt
      )}

      ${renderMetaField(
        "Adjuntos",
        String(
          attachments.length
        )
      )}
    </div>

    ${renderAdminTicketEditor(vm)}

    ${renderDescription(detail)}

    ${vm.admin ? renderContactBlock(detail) : ""}

    <div data-modal-files-slot="true">
      ${renderAttachments(vm)}
    </div>

    <div data-modal-composer-slot="true">
      ${renderComposer(vm)}
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

function renderDetailLoadState(input = {}) {
  const failed = Boolean(input.error);
  const title = failed ? "No se pudo cargar la incidencia" : "Cargando incidencia…";
  return renderModalShell({
    id: MODAL_ID,
    rootClass: "incidencias-modal-root",
    rootAttributes: {
      "data-incidencias-modal-root": "true",
      "data-detail-load-state": failed ? "error" : "loading",
      "data-submitting": "false",
      "data-ticket-id": input.loadingId || "",
    },
    overlayAttributes: { "data-incidencias-modal-overlay": "true" },
    panelId: PANEL_ID,
    panelAttributes: { "data-incidencias-modal-panel": "true" },
    labelledBy: TITLE_ID,
    describedBy: DESCRIPTION_ID,
    header: `<h2 id="${TITLE_ID}" class="ui-detail-modal-title">${title}</h2>${renderModalCloseButton({
      label: "Cerrar detalle",
      attributes: { "data-detail-action": DETAIL_ACTIONS.CLOSE },
    })}`,
    bodyAttributes: { "data-history-mode": "ticket", "aria-busy": failed ? "false" : "true" },
    body: renderModalState({
      kind: failed ? "error" : "loading",
      title: failed ? "No se pudo cargar el detalle" : "Cargando detalle…",
      message: failed ? input.error : "Preparando el detalle y sus actualizaciones.",
      id: DESCRIPTION_ID,
      action: failed ? { label: "Reintentar", attributes: { "data-detail-action": "detail-retry" } } : null,
    }),
  });
}

export function renderIncidenciasDetailModal(
  input = {}
) {
  if (input.open && !input.detail && (input.loading || input.error)) {
    return renderDetailLoadState(input);
  }

  const vm =
    buildVm(input);

  if (!vm.open) {
    return "";
  }

  const detail =
    vm.detail;

  const ticketId =
    vm.ticketId;

  const status =
    vm.status;

  const priority =
    getPriority(detail);

  const title =
    getTitle(detail);

  const clientName =
    getClientName(detail);

  const clientEmail =
    getClientEmail(detail);

  const category =
    getCategory(detail);

  const createdAt =
    formatDate(
      getCreatedAt(detail)
    );

  const updatedAgo =
    formatRelativeDate(
      getUpdatedAt(detail)
    );

  const attachments =
    getAttachments(detail);

  return renderModalShell({
    id: MODAL_ID,
    rootClass: "incidencias-modal-root",
    rootAttributes: {
      "data-incidencias-modal-root": "true",
      "data-template-version": INCIDENCIAS_MODAL_TEMPLATE_VERSION,
      "data-ticket-id": ticketId,
      "data-submitting": vm.submitting ? "true" : "false",
      "data-operation": vm.operation,
      "data-close-confirm-open": vm.closeConfirmOpen ? "true" : "false",
      "data-discard-confirm-open": vm.discardConfirmOpen ? "true" : "false",
      "data-attachment-delete-confirm-open": vm.attachmentDeleteConfirmOpen ? "true" : "false",
      "data-has-draft": vm.hasDraft ? "true" : "false",
      "data-requires-reopen": vm.requiresReopen ? "true" : "false",
      "data-attachment-view-policy": "signed-view-only",
    },
    overlayAttributes: { "data-incidencias-modal-overlay": "true" },
    panelId: PANEL_ID,
    panelAttributes: { "data-incidencias-modal-panel": "true" },
    labelledBy: TITLE_ID,
    describedBy: DESCRIPTION_ID,
    submitting: vm.submitting,
    footer: renderDetailFooter(vm),
    footerClass: "incidencias-modal-footer",
    prelude: `${renderDetailConfirmation(vm)}${vm.submitting
      ? renderLoadingOverlay(
          vm.operation === "close"
            ? "Cerrando incidencia..."
            : vm.operation === "delete-attachment"
              ? "Eliminando adjunto..."
              : "Actualizando incidencia..."
        )
      : ""}`,
    header: `
    <div
      class="incidencias-modal-hero ui-detail-modal-hero"
      data-modal-hero="true"
    >
      ${renderAvatar(detail)}

      <div class="incidencias-modal-hero-content ui-detail-modal-hero-content">
        <div
          class="incidencias-modal-hero-chips ui-detail-modal-hero-chips"
          data-modal-header-chips="true"
        >
          ${renderTicketIdChip(
            ticketId,
            vm
          )}

          ${renderChip(
            incidenciaStatusLabel(status),
            `status-${statusClass(status)}`
          )}

          ${renderChip(
            incidenciaPriorityLabel(priority),
            `priority-${priorityClass(priority)}`
          )}

          ${renderChip(
            incidenciaCategoryLabel(category),
            "category"
          )}
        </div>

        <h2
          id="${TITLE_ID}"
          class="ui-detail-modal-title"
          title="${attr(title)}"
        >${escapeHtml(title)}</h2>

        <span
          class="incidencias-modal-updated ui-detail-modal-updated"
          data-modal-updated="true"
        >
          ${escapeHtml(clientName)}
          ${
            clientEmail
              ? ` · ${escapeHtml(clientEmail)}`
              : ""
          }
          · Última actualización ${escapeHtml(updatedAgo)}
        </span>
      </div>
    </div>
    ${renderHeaderActions(vm)}
    `,
    bodyAttributes: { "data-history-mode": vm.historyOpen ? "history" : "ticket" },
    body: vm.historyOpen
      ? renderHistorySection(vm)
      : renderTicketBody(vm, { detail, attachments, createdAt }),
  });
}

export function renderIncidenciasDetailModalClosed() {
  return "";
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getDetailCommentValue(
  formLike = {}
) {
  return cleanMultiline(
    firstNonEmpty(
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
  const message =
    cleanMultiline(
      comment,
      ""
    );

  const files =
    arrayFrom(
      pendingFiles
    );

  if (
    !message &&
    !files.length
  ) {
    return {
      valid: false,

      message:
        "Añade una actualización o selecciona al menos un archivo.",
    };
  }

  if (
    message &&
    message.length < 4
  ) {
    return {
      valid: false,

      message:
        "Añade un poco más de detalle antes de enviar la actualización.",
    };
  }

  if (
    message.length >
    MAX_COMMENT_LENGTH
  ) {
    return {
      valid: false,

      message:
        `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres.`,
    };
  }

  if (
    files.length >
    MAX_PENDING_FILES
  ) {
    return {
      valid: false,

      message:
        `No puedes adjuntar más de ${MAX_PENDING_FILES} archivos en una actualización.`,
    };
  }

  for (const file of files) {
    if (
      parseAmount(
        file?.size,
        0,
        AMOUNT_POLICIES.textOnly
      ) >
      MAX_PENDING_FILE_SIZE
    ) {
      return {
        valid: false,

        message:
          `El archivo ${safeFilename(
            file?.name,
            "seleccionado"
          )} supera el tamaño máximo permitido de ${formatLimitBytes(MAX_PENDING_FILE_SIZE)}.`,
      };
    }
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
    version:
      INCIDENCIAS_MODAL_TEMPLATE_VERSION,

    actions:
      DETAIL_ACTIONS,

    fields: [
      "comment",
      "attachments",
    ],

    adminFields: [
      "status",
      "priority",
      "category",
    ],

    limits: {
      maxCommentLength:
        MAX_COMMENT_LENGTH,

      maxPendingFiles:
        MAX_PENDING_FILES,

      maxPendingFileSize:
        MAX_PENDING_FILE_SIZE,
    },

    attachmentView: {
      host:
        TRUSTED_ATTACHMENT_BLOB_HOST,

      containerPrefix:
        TRUSTED_ATTACHMENT_CONTAINER_PREFIX,

      requireAzureSas:
        true,

      allowRelativeSameOrigin:
        true,

      allowBlobRuntime:
        true,

      usePrivateBlobLocatorAsView:
        false,

      useDownloadUrlAsView:
        false,

      inlineImage:
        true,

      inlinePdf:
        true,

      inlineOther:
        false,
    },

    policy: {
      templateOnly:
        true,

      spaIslandCompatible:
        true,

      detailActionsStable:
        true,

      dataFieldCompatibility:
        true,

      noArrayFlatten:
        true,

      requesterAliasCompatibility:
        true,

      technicianUsesRealAssignmentOnly:
        true,

      noFixedTechnicianFallback:
        true,

      attachmentAliasCompatibility:
        true,

      attachmentCanonicalId:
        "id_equals_attachmentId",

      attachmentViewSignedOnly:
        true,

      attachmentExactBlobHost:
        true,

      attachmentExactTicketsContainer:
        true,

      attachmentPrivateBlobUrlNotRendered:
        true,

      attachmentDownloadUrlNotUsedForPreview:
        true,

      attachmentThumbnailFallbackWithoutSas:
        true,

      timelineAliasCompatibility:
        true,

      invoiceAliasCompatibility:
        true,

      previewImage:
        true,

      previewPdf:
        true,

      previewOtherDocumentsInline:
        false,

      submitActionNearComposer:
        true,

      manualTicketClose:
        true,

      historyCollapsedByDefault:
        true,

      historyLazyRender:
        true,

      historyHeaderAccess:
        true,

      adminAttachmentDelete:
        true,

      applicationOwnedAttachmentDeleteConfirmation:
        true,

      nativeBrowserAttachmentConfirm:
        false,

      attachmentDeleteRequiresExplicitConfirmAction:
        true,

      categoryDisplayTitleCase:
        true,

      explicitReopenCopy:
        true,

      visibleUploadLimits:
        true,

      exposesDirtyState:
        true,

      noAuth:
        true,

      noRouter:
        true,

      noHttp:
        true,

      noStore:
        true,

      noStorage:
        true,

      noDomApi:
        true,

      noListeners:
        true,
    },
  };
}

export const getSnapshot =
  getDetailTemplateSnapshot;

export const renderDetailModal =
  renderIncidenciasDetailModal;

export const renderDetailModalClosed =
  renderIncidenciasDetailModalClosed;

export default renderIncidenciasDetailModal;

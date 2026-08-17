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

export const INCIDENCIAS_MODAL_TEMPLATE_VERSION =
  "incidencias.template.modal.extreme.v25.history-mode";

export const DETAIL_ACTIONS = Object.freeze({
  CLOSE: "detail-close",
  COPY_ID: "detail-copy-id",

  COMMENT_SUBMIT: "detail-submit-update",
  COMMENT_CHANGE: "detail-comment-change",
  TICKET_CLOSE: "detail-ticket-close",
  HISTORY_TOGGLE: "detail-history-toggle",
  HISTORY_REVEAL: "detail-history-reveal",

  ATTACHMENTS_ADD: "detail-attachments-add",
  PENDING_FILE_REMOVE: "detail-pending-file-remove",

  ATTACHMENT_OPEN: "detail-attachment-open",
  ATTACHMENT_DOWNLOAD: "detail-attachment-download",
  ATTACHMENT_DELETE: "detail-attachment-delete",

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

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

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
function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function number(
  value = 0,
  fallback = 0
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (
    typeof value === "boolean" ||
    typeof value === "object"
  ) {
    return fallback;
  }

  if (typeof value === "string") {
    let clean =
      value
        .trim()
        .replace(/[€$£¥%]/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s+/g, "");

    if (
      !clean ||
      clean === "-" ||
      clean === "+"
    ) {
      return fallback;
    }

    const hasComma =
      clean.includes(",");

    const hasDot =
      clean.includes(".");

    if (
      hasComma &&
      hasDot
    ) {
      const lastComma =
        clean.lastIndexOf(",");

      const lastDot =
        clean.lastIndexOf(".");

      clean =
        lastComma > lastDot
          ? clean
              .replace(/\./g, "")
              .replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean =
        clean.replace(/,/g, ".");
    }

    const parsed =
      Number(clean);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
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

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function displayLabel(value = "", fallback = "") {
  const text = cleanText(value, fallback)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return fallback;

  return text
    .split(" ")
    .map((word) =>
      word
        ? `${word.charAt(0).toLocaleUpperCase("es-ES")}${word.slice(1)}`
        : ""
    )
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

function hashText(value = "") {
  const text =
    cleanText(value, "");

  let hash = 0;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash =
      ((hash << 5) - hash) +
      text.charCodeAt(index);

    hash |= 0;
  }

  return Math.abs(hash);
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]
            ?.toUpperCase() ||
          ""
      )
      .join("")
      .slice(0, 2) ||
    "ON"
  );
}

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
    number(value, 0) /
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
    number(bytes, 0);

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

const MODAL_MONEY_FORMATTERS = new Map();
const MODAL_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const code = cleanText(currency, DEFAULT_CURRENCY).toUpperCase();
  let formatter = MODAL_MONEY_FORMATTERS.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: code, maximumFractionDigits: 2 });
      MODAL_MONEY_FORMATTERS.set(code, formatter);
    } catch {
      return `${number(value, 0).toFixed(2)} €`;
    }
  }
  return formatter.format(number(value, 0));
}

function formatDate(value = "") {
  const raw = first(value, "");
  if (!raw) return "—";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return cleanText(raw, "—");
  try { return MODAL_DATE_FORMATTER.format(date); }
  catch { return date.toISOString(); }
}

function formatRelativeDate(
  value = ""
) {
  const raw =
    first(
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

function toTimestamp(value = "") {
  const raw =
    first(
      value,
      ""
    );

  if (!raw) {
    return 0;
  }

  const ms =
    new Date(raw).getTime();

  return Number.isFinite(ms)
    ? ms
    : 0;
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
    first(
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
    first(
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

function getStatus(detail = {}) {
  const raw =
    getRaw(detail);

  const status =
    normalizeKey(
      first(
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

function statusLabel(
  status = ""
) {
  return (
    {
      open: "Abierta",
      pending: "Pendiente",
      progress: "En proceso",
      resolved: "Resuelta",
      closed: "Cerrada",
    }[status] ||
    cleanText(
      status,
      "Abierta"
    )
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
    normalizeKey(status)
  );
}

function getPriority(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const priority =
    normalizeKey(
      first(
        detail.priority,
        detail.prioridad,
        detail.severity,

        raw.priority,
        raw.prioridad,
        raw.severity,

        "medium"
      )
    );

  const map = {
    low: "low",
    baja: "low",

    medium: "medium",
    media: "medium",
    normal: "medium",

    high: "high",
    alta: "high",

    urgent: "urgent",
    urgente: "urgent",

    critical: "critical",
    critica: "critical",
    critico: "critical",
  };

  return (
    map[priority] ||
    priority ||
    "medium"
  );
}

function priorityLabel(
  priority = ""
) {
  return (
    {
      low: "Baja",
      medium: "Media",
      high: "Alta",
      urgent: "Urgente",
      critical: "Crítica",
    }[priority] ||
    cleanText(
      priority,
      "Media"
    )
  );
}

function priorityClass(
  priority = ""
) {
  return (
    priority ||
    "medium"
  );
}

function getCategory(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
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
    first(
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

function getClientName(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const requester =
    getRequester(detail);

  return cleanText(
    first(
      detail.displayName,
      detail.name,
      detail.nombre,
      detail.clientName,
      detail.clienteNombre,

      requester.displayName,
      requester.name,
      requester.nombre,

      raw.displayName,
      raw.name,
      raw.nombre,
      raw.email,

      getTicketId(detail)
    ),
    "Usuario"
  );
}

function getClientEmail(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const requester =
    getRequester(detail);

  return cleanText(
    first(
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
    first(
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
    first(
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
    first(
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
    first(
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
    first(
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

  return number(
    first(
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
    0
  );
}

function getCurrency(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
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

  return first(
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

  return first(
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
    first(
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
      first(
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
      first(
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
      number(
        first(
          raw.size,
          raw.sizeBytes
        ),
        0
      ),

    sizeBytes:
      number(
        first(
          raw.sizeBytes,
          raw.size
        ),
        0
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
        first(
          raw.path,
          raw.blobPath,
          ""
        ),
        ""
      ),

    blobPath:
      cleanText(
        first(
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
      first(
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
    first(
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
      first(
        file.contentType,
        file.type,
        file.mimeType,
        file.mimetype
      ),
      ""
    ).toLowerCase();

  const name =
    cleanText(
      first(
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
      first(
        file.contentType,
        file.type,
        file.mimeType,
        file.mimetype
      ),
      ""
    ).toLowerCase();

  const name =
    cleanText(
      first(
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
      first(
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
    normalizeKey(
      first(
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
        first(
          raw.id,
          raw.commentId,
          raw.eventId,
          `entry_${index}`
        ),
        `entry_${index}`
      ),

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
        first(
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
        first(
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
        first(
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
      first(
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
    safeArray(
      first(
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
            b.createdAt
          ) -
          toTimestamp(
            a.createdAt
          )
      );
  }

  const history =
    safeArray(
      first(
        detail.history,
        detail.events,

        raw.history,
        raw.events,

        []
      )
    );

  const comments =
    safeArray(
      first(
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
        b.createdAt
      ) -
      toTimestamp(
        a.createdAt
      )
  );
}

function getTimelineCount(detail = {}) {
  const raw = getRaw(detail);
  const direct = safeArray(first(detail.timeline, raw.timeline, []));
  if (direct.length) return direct.length;

  const history = safeArray(
    first(
      detail.history,
      detail.events,
      raw.history,
      raw.events,
      []
    )
  );

  const comments = safeArray(
    first(
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
  const kind = normalizeKey(entry.kind || "event");
  const type = normalizeKey(entry.type || "update");

  if (kind === "comment") return "comment";
  if (type === "created") return "created";

  const text = normalizeKey(
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
      first(
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
    safeArray(
      data.pendingFiles
    );

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

  return {
    open:
      data.open === true &&
      Boolean(ticketId),

    detail,
    ticketId,
    status,

    submitting:
      data.submitting === true,

    commentDraft,
    pendingFiles,

    hasDraft:
      Boolean(
        commentDraft ||
        pendingFiles.length
      ),

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
              aria-label="Cerrar ticket"
              title="Cerrar esta incidencia manualmente"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              <span class="incidencias-modal-close-ticket-icon">
                ${icon("check")}
              </span>
              <span class="incidencias-modal-close-ticket-label">
                Cerrar ticket
              </span>
            </button>
          `
          : ""
      }

      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.CLOSE}"
        aria-label="Cerrar modal"
        title="Cerrar ventana"
        ${disabledAttrs(vm.submitting, vm.submitting)}
        class="incidencias-modal-close-btn"
      >${icon("close")}</button>
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
    normalizeKey(
      modifier
    ) ||
    "neutral";

  return `
    <span
      class="incidencias-modal-chip incidencias-modal-chip--${attr(safeModifier)}"
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

  const tone =
    hashText(
      `${name}:${email}:${getTicketId(detail)}`
    ) % 10;

  return `
    <div
      class="incidencias-modal-avatar"
      title="${attr(name)}"
    >
      <div
        class="${joinClasses(
          "incidencias-modal-avatar-frame",

          avatarUrl
            ? ""
            : "incidencias-modal-avatar-frame--fallback"
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

        <span class="incidencias-modal-avatar-fallback">
          ${escapeHtml(
            initialsFrom(name)
          )}
        </span>
      </div>
    </div>
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

  const tone =
    hashText(
      `${name}:${email}`
    ) % 10;

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
            initialsFrom(name)
          )}
        </span>
      </span>

      <span class="incidencias-modal-technician-copy">
        <strong>${escapeHtml(name)}</strong>

        ${
          email
            ? `<small>${escapeHtml(email)}</small>`
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
    <div class="incidencias-modal-meta-card">
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
    normalizeKey(
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
    safeArray(
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
    return "Actualizando...";
  }

  return vm.requiresReopen
    ? "Enviar actualización y reabrir"
    : "Enviar actualización";
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
      ${disabledAttrs(
        vm.submitting,
        vm.submitting
      )}
      class="incidencias-modal-submit-btn"
    >
      ${
        vm.submitting
          ? renderInlineSpinner(
              "Actualizando..."
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
    vm.requiresReopen
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

      <footer
        class="incidencias-modal-footer incidencias-modal-footer--composer"
        data-modal-footer="true"
        data-modal-footer-placement="composer"
      >
        ${renderSubmitButton(vm)}
      </footer>
    </section>
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
      first(
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
      first(
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
        class="incidencias-modal-view-btn"
        aria-label="${attr(`Ver ${name}`)}"
      >
        ${
          busy.isOpening
            ? renderInlineSpinner(
                "Abriendo..."
              )
            : `
              <span class="incidencias-modal-action-icon">
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
              <span class="incidencias-modal-action-icon">
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
                    <span class="incidencias-modal-action-icon">
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
        <div class="incidencias-modal-section-head">
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
                          first(
                            file.name,
                            file.filename,
                            file.fileName
                          ),
                          "Archivo"
                        );

                      const meta =
                        [
                          cleanText(
                            first(
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
      first(
        file.filename,
        file.fileName,
        file.name
      ),
      "Documento"
    );

  const type =
    cleanText(
      first(
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

function renderDescription(
  detail = {}
) {
  return `
    <section
      class="incidencias-modal-description-section"
      aria-labelledby="incidencias-modal-description-title"
    >
      <div class="incidencias-modal-section-head">
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

  return `
    <section
      class="incidencias-modal-contact-section"
      aria-labelledby="incidencias-modal-contact-title"
    >
      <div class="incidencias-modal-section-head">
        <h3 id="incidencias-modal-contact-title">
          Contacto
        </h3>
      </div>

      <div class="incidencias-modal-contact-grid">
        ${
          email
            ? renderMetaField(
                "Email",
                email
              )
            : ""
        }

        ${
          phone
            ? renderMetaField(
                "Teléfono",
                phone
              )
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
      class="incidencias-modal-history-section incidencias-modal-history-view"
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

    <div class="incidencias-modal-meta-grid">
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

    ${renderDescription(detail)}

    ${renderContactBlock(detail)}

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

export function renderIncidenciasDetailModal(
  input = {}
) {
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

  return `
    <section
      id="${MODAL_ID}"
      class="incidencias-modal-root"
      data-incidencias-modal-root="true"
      data-template-version="${attr(INCIDENCIAS_MODAL_TEMPLATE_VERSION)}"
      data-ticket-id="${attr(ticketId)}"
      data-open="true"
      data-submitting="${vm.submitting ? "true" : "false"}"
      data-has-draft="${vm.hasDraft ? "true" : "false"}"
      data-requires-reopen="${vm.requiresReopen ? "true" : "false"}"
      data-attachment-view-policy="signed-view-only"
    >
      <div
        class="incidencias-modal-overlay"
        data-incidencias-modal-overlay="true"
      >
        <div
          id="${PANEL_ID}"
          class="${joinClasses(
            "incidencias-modal-panel",

            vm.submitting
              ? "is-submitting"
              : ""
          )}"
          role="dialog"
          aria-modal="true"
          aria-labelledby="${TITLE_ID}"
          aria-describedby="${DESCRIPTION_ID}"
          tabindex="-1"
          data-incidencias-modal-panel="true"
        >
          ${
            vm.submitting
              ? renderLoadingOverlay(
                  "Actualizando incidencia..."
                )
              : ""
          }

          <header
            class="incidencias-modal-header"
            data-modal-header="true"
          >
            <div
              class="incidencias-modal-hero"
              data-modal-hero="true"
            >
              ${renderAvatar(detail)}

              <div class="incidencias-modal-hero-content">
                <div
                  class="incidencias-modal-hero-chips"
                  data-modal-header-chips="true"
                >
                  ${renderTicketIdChip(
                    ticketId,
                    vm
                  )}

                  ${renderChip(
                    statusLabel(status),
                    `status-${statusClass(status)}`
                  )}

                  ${renderChip(
                    priorityLabel(priority),
                    `priority-${priorityClass(priority)}`
                  )}

                  ${renderChip(
                    displayLabel(category, "General"),
                    "category"
                  )}
                </div>

                <h2
                  id="${TITLE_ID}"
                  class="incidencias-modal-title"
                  title="${attr(title)}"
                >${escapeHtml(title)}</h2>

                <span
                  class="incidencias-modal-updated"
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
          </header>

          <main
            class="incidencias-modal-body"
            data-modal-body="true"
            data-history-mode="${vm.historyOpen ? "history" : "ticket"}"
          >
            ${
              vm.historyOpen
                ? renderHistorySection(vm)
                : renderTicketBody(
                    vm,
                    {
                      detail,
                      attachments,
                      createdAt,
                    }
                  )
            }
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

export function getDetailCommentValue(
  formLike = {}
) {
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
  const message =
    cleanMultiline(
      comment,
      ""
    );

  const files =
    safeArray(
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
      number(
        file?.size,
        0
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

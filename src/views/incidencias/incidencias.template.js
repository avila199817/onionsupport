/* =========================================================
   Onion Support - Incidencias Template
   Archivo: /src/views/incidencias/incidencias.template.js

   PRODUCTIVO · 1:1 · TABLE PAINT GUARANTEED · 10/10

   Responsabilidad:
   - Render HTML puro de la vista Incidencias.
   - Header/hero, stats, filtros, búsqueda y listado.
   - No renderizar modales: index.js monta modales como isla externa.
   - Exponer data-incidencias-action/data-field estables para index.js.
   - Tabla sin columna Acciones: click en fila abre detalle.
   - Blindaje anti “total > 0 pero items vacíos”: acepta items/tickets/
     incidencias/rows/results/data.items/data.rows/payload.items/etc.
   - No Auth, no Router, no HTTP, no Store, no DOM API, no listeners.
========================================================= */

export const INCIDENCIAS_TEMPLATE_VERSION =
  "incidencias.template.productive.v11.paint-safe";

export const INCIDENCIAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  CREATE_OPEN: "create-open",

  FILTER: "filter",
  SORT_TOGGLE: "sort-toggle",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",

  OPEN_DETAIL: "open-detail",
  LOAD_MORE: "load-more",
});

const DEFAULT_ROUTE = "/incidencias";
const DEFAULT_VISIBLE_ROWS = 20;
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_SORT_ORDER = "desc";
const TABLE_SCALE = "110";

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Abiertas" },
  { key: "closed", label: "Cerradas" },
]);

export const INCIDENCIAS_TABLE_COLUMNS = Object.freeze([
  {
    key: "main",
    label: "Incidencia",
    colClass: "incidencias-col--main",
    thClass: "incidencias-th incidencias-th--main",
    cellClass: "incidencias-cell incidencias-cell--main",
  },
  {
    key: "status",
    label: "Estado",
    colClass: "incidencias-col--status",
    thClass: "incidencias-th incidencias-th--status",
    cellClass: "incidencias-cell incidencias-cell--status",
  },
  {
    key: "created",
    label: "Creada",
    colClass: "incidencias-col--created",
    thClass: "incidencias-th incidencias-th--created",
    cellClass: "incidencias-cell incidencias-cell--date incidencias-cell--created",
  },
  {
    key: "updated",
    label: "Última novedad",
    colClass: "incidencias-col--updated",
    thClass: "incidencias-th incidencias-th--updated",
    cellClass: "incidencias-cell incidencias-cell--date incidencias-cell--updated",
  },
  {
    key: "amount",
    label: "Importe",
    colClass: "incidencias-col--amount incidencias-col--importe",
    thClass: "incidencias-th incidencias-th--amount incidencias-th--importe",
    cellClass: "incidencias-cell incidencias-cell--amount incidencias-cell--importe",
  },
  {
    key: "attachments",
    label: "Adjuntos",
    colClass: "incidencias-col--attachments",
    thClass: "incidencias-th incidencias-th--attachments",
    cellClass: "incidencias-cell incidencias-cell--attachments",
  },
]);

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
  if (Array.isArray(value)) return value;

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

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
      clean = lastComma > lastDot
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

function normalizeText(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(value = "") {
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

function firstImageSrc(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      const nested = firstImageSrc(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.userAvatar,
        value.userAvatarUrl,
        value.clienteAvatar,
        value.clienteAvatarUrl,
        value.clientAvatar,
        value.clientAvatarUrl,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.picture,
        value.profile?.photoUrl,
        value.profile?.photoURL,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture
      );

      if (nested) return nested;
      continue;
    }

    const src = safeImageSrc(value);
    if (src) return src;
  }

  return "";
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
    `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M21 21v-5h-5"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>`,
    chevronDown: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
    calendar: `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    user: `<svg ${common}><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
    hash: `<svg ${common}><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/></svg>`,
  };

  return icons[name] || icons.ticket;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(number(value, 0));
  } catch {
    return String(number(value, 0));
  }
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: cleanText(currency, DEFAULT_CURRENCY).toUpperCase(),
      maximumFractionDigits: 2,
    }).format(number(value, 0));
  } catch {
    return `${number(value, 0).toFixed(2)} €`;
  }
}

function formatDate(value = "") {
  const raw = first(value, "");
  if (!raw) return "—";

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return cleanText(raw, "—");

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

function formatShortDate(value = "") {
  const raw = first(value, "");
  if (!raw) return "—";

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return cleanText(raw, "—");

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatRelativeDate(value = "") {
  const raw = first(value, "");
  if (!raw) return "—";

  const date = new Date(raw);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return cleanText(raw, "—");

  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return "ahora";
  if (abs < hour) return `hace ${Math.max(1, Math.round(abs / minute))} min`;
  if (abs < day) return `hace ${Math.max(1, Math.round(abs / hour))} h`;
  if (abs < 7 * day) return `hace ${Math.max(1, Math.round(abs / day))} d`;

  return formatShortDate(raw);
}

function sortTime(value = "") {
  const raw = first(value, "");
  if (!raw) return 0;

  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/* =========================================================
   ITEM GETTERS
========================================================= */

function unwrapItem(value = {}) {
  const item = safeObject(value, {});

  return safeObject(
    first(
      item.ticket,
      item.incidencia,
      item.item,
      item.detail,
      item.data?.ticket,
      item.data?.incidencia,
      item.data?.item,
      item.data,
      item
    ),
    item
  );
}

function getTicketId(item = {}) {
  const raw = unwrapItem(item);

  return cleanText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw.entityId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.reference,
      raw.ref,
      ""
    ),
    ""
  );
}

function getSubject(item = {}) {
  const raw = unwrapItem(item);
  return cleanText(first(raw.subject, raw.asunto, raw.title, raw.name, "Sin asunto"), "Sin asunto");
}

function getDescription(item = {}) {
  const raw = unwrapItem(item);
  return cleanText(first(raw.preview, raw.description, raw.descripcion, raw.message, raw.body, ""), "");
}

function getStatusRaw(item = {}) {
  const raw = unwrapItem(item);
  return cleanText(first(raw.status, raw.estado, raw.statusKey, raw.lifecycle?.status, "open"), "open");
}

function getPriorityRaw(item = {}) {
  const raw = unwrapItem(item);
  return cleanText(first(raw.priority, raw.prioridad, raw.severity, "medium"), "medium");
}

function getCategory(item = {}) {
  const raw = unwrapItem(item);
  return cleanText(first(raw.category, raw.categoria, raw.tipo, raw.type, "general"), "general");
}

function getClientName(item = {}) {
  const raw = unwrapItem(item);
  const requester = safeObject(raw.requesterSnapshot);
  const cliente = safeObject(raw.cliente);
  const receptor = safeObject(raw.receptor);
  const user = safeObject(raw.user);

  return cleanText(
    first(
      raw.displayName,
      raw.name,
      raw.nombre,
      raw.clientName,
      raw.clienteNombre,
      raw.requesterName,
      requester.displayName,
      requester.name,
      requester.nombre,
      cliente.displayName,
      cliente.name,
      cliente.nombre,
      receptor.displayName,
      receptor.name,
      receptor.nombre,
      user.displayName,
      user.name,
      user.nombre,
      raw.email,
      getTicketId(raw),
      "Usuario"
    ),
    "Usuario"
  );
}

function getClientEmail(item = {}) {
  const raw = unwrapItem(item);
  const requester = safeObject(raw.requesterSnapshot);
  const cliente = safeObject(raw.cliente);
  const receptor = safeObject(raw.receptor);
  const user = safeObject(raw.user);

  return cleanText(
    first(
      raw.email,
      raw.emailLower,
      raw.userEmail,
      raw.clienteEmail,
      requester.email,
      requester.emailLower,
      cliente.email,
      cliente.emailLower,
      receptor.email,
      receptor.emailLower,
      user.email,
      user.emailLower,
      ""
    ),
    ""
  );
}

function getClientUserId(item = {}) {
  const raw = unwrapItem(item);
  const requester = safeObject(raw.requesterSnapshot);
  const cliente = safeObject(raw.cliente);
  const receptor = safeObject(raw.receptor);

  return cleanText(
    first(raw.userId, requester.userId, requester.id, receptor.userId, receptor.id, cliente.userId, ""),
    ""
  );
}

function getClientId(item = {}) {
  const raw = unwrapItem(item);
  const requester = safeObject(raw.requesterSnapshot);
  const cliente = safeObject(raw.cliente);
  const receptor = safeObject(raw.receptor);

  return cleanText(
    first(raw.clienteId, requester.clienteId, cliente.clienteId, cliente.id, receptor.clienteId, ""),
    ""
  );
}

function getAvatarUrl(item = {}) {
  const raw = unwrapItem(item);

  return firstImageSrc(
    raw.avatarUrl,
    raw.avatar,
    raw.userAvatarUrl,
    raw.userAvatar,
    raw.clienteAvatarUrl,
    raw.clienteAvatar,
    raw.requesterSnapshot,
    raw.cliente,
    raw.receptor,
    raw.user
  );
}

function getAssignedTo(item = {}) {
  const raw = unwrapItem(item);
  const assignment = safeObject(raw.assignment);
  const tecnico = safeObject(raw.tecnico);
  const assignedTo = safeObject(raw.assignedTo);
  const technician = safeObject(raw.technician);

  return cleanText(
    first(
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.agentName,
      assignment.assignedToName,
      assignment.technician?.name,
      assignment.technician?.displayName,
      tecnico.displayName,
      tecnico.name,
      tecnico.nombre,
      assignedTo.displayName,
      assignedTo.name,
      assignedTo.nombre,
      technician.displayName,
      technician.name,
      technician.nombre,
      "Cristian Ávila Luque"
    ),
    "Cristian Ávila Luque"
  );
}

function getAssignedEmail(item = {}) {
  const raw = unwrapItem(item);
  const assignment = safeObject(raw.assignment);
  const tecnico = safeObject(raw.tecnico);
  const assignedTo = safeObject(raw.assignedTo);
  const technician = safeObject(raw.technician);

  return cleanText(
    first(
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail,
      raw.agentEmail,
      assignment.assignedToEmail,
      assignment.technician?.email,
      tecnico.email,
      assignedTo.email,
      technician.email,
      ""
    ),
    ""
  );
}

function getAssignedAvatarUrl(item = {}) {
  const raw = unwrapItem(item);
  const assignment = safeObject(raw.assignment);

  return firstImageSrc(
    raw.assignedToAvatarUrl,
    raw.assignedToAvatar,
    raw.technicianAvatarUrl,
    raw.technicianAvatar,
    raw.tecnicoAvatarUrl,
    raw.tecnicoAvatar,
    raw.agentAvatarUrl,
    raw.agentAvatar,
    assignment.assignedToAvatarUrl,
    assignment.assignedToAvatar,
    assignment.technicianAvatarUrl,
    assignment.technicianAvatar,
    assignment.agentAvatarUrl,
    assignment.agentAvatar,
    assignment.avatarUrl,
    assignment.avatar,
    assignment.technician,
    raw.tecnico,
    raw.assignedTo,
    raw.technician
  );
}

function getCreatedAt(item = {}) {
  const raw = unwrapItem(item);
  return first(raw.createdAt, raw.fechaCreacion, raw.created_at, raw.lifecycle?.createdAt, "");
}

function getUpdatedAt(item = {}) {
  const raw = unwrapItem(item);
  return first(raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.updated_at, raw.lifecycle?.lastActivityAt, raw.lifecycle?.updatedAt, getCreatedAt(raw), "");
}

function getAttachmentsCount(item = {}) {
  const raw = unwrapItem(item);
  const attachments = safeArray(first(raw.attachments, raw.files, raw.adjuntos, []));

  return Math.max(
    attachments.length,
    number(raw.attachmentsCount, 0),
    number(raw.attachmentCount, 0),
    number(raw.filesCount, 0),
    number(raw.adjuntosCount, 0),
    number(raw.meta?.attachmentsCount, 0),
    number(raw.meta?.filesCount, 0)
  );
}

function getInvoiceTotal(item = {}) {
  const raw = unwrapItem(item);

  return number(
    first(
      raw.invoiceTotal,
      raw.invoicesTotal,
      raw.facturasTotal,
      raw.importeFacturas,
      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.totalFactura,
      raw.invoiceAmount,
      raw.billing?.total,
      raw.billing?.amount,
      raw.linkedInvoices?.total,
      raw.linkedInvoices?.amount,
      raw.meta?.invoiceTotal,
      0
    ),
    0
  );
}

function getCurrency(item = {}) {
  const raw = unwrapItem(item);

  return cleanText(
    first(
      raw.currency,
      raw.moneda,
      raw.facturaCurrency,
      raw.facturaMoneda,
      raw.billing?.currency,
      raw.linkedInvoices?.currency,
      raw.meta?.invoiceCurrency,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

/* =========================================================
   STATUS / PRIORITY
========================================================= */

function getStatusKey(value = "") {
  const key = normalizeKey(value || "open");

  const map = {
    open: "open",
    opened: "open",
    abierta: "open",
    abierto: "open",

    pending: "pending",
    pendiente: "pending",
    new: "pending",
    nueva: "pending",
    nuevo: "pending",

    in_progress: "in_progress",
    inprogress: "in_progress",
    progress: "in_progress",
    proceso: "in_progress",
    en_proceso: "in_progress",
    working: "in_progress",
    assigned: "in_progress",
    asignada: "in_progress",
    asignado: "in_progress",

    resolved: "closed",
    resuelta: "closed",
    resuelto: "closed",
    solved: "closed",
    closed: "closed",
    close: "closed",
    cerrada: "closed",
    cerrado: "closed",

    cancelled: "closed",
    canceled: "closed",
    cancelada: "closed",
    cancelado: "closed",
    archived: "closed",
    archivada: "closed",
    archivado: "closed",
  };

  return map[key] || key || "open";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  const map = {
    open: "Abierta",
    pending: "Pendiente",
    in_progress: "En proceso",
    closed: "Cerrada",
  };

  return map[key] || cleanText(value, "Abierta");
}

function getPriorityKey(item = {}) {
  const key = normalizeKey(getPriorityRaw(item) || "medium");

  const map = {
    low: "low",
    baja: "low",
    minor: "low",
    p3: "low",

    medium: "medium",
    media: "medium",
    normal: "medium",
    p2: "medium",

    high: "high",
    alta: "high",
    p1: "high",

    urgent: "urgent",
    urgente: "urgent",
    critical: "urgent",
    critica: "urgent",
    critico: "urgent",
    crítica: "urgent",
    crítico: "urgent",
    p0: "urgent",
  };

  return map[key] || key || "medium";
}

function getPriorityLabel(item = {}) {
  const key = getPriorityKey(item);

  const map = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    urgent: "Urgente",
  };

  return map[key] || key;
}

function getPriorityIconName(key = "") {
  if (key === "urgent" || key === "high") return "alert";
  return "ticket";
}

function isOpenItem(item = {}) {
  return ["open", "pending", "in_progress"].includes(getStatusKey(getStatusRaw(item)));
}

function isClosedItem(item = {}) {
  return getStatusKey(getStatusRaw(item)) === "closed";
}

function isUrgentItem(item = {}) {
  return ["urgent", "high"].includes(getPriorityKey(item));
}

function getImporteKey(item = {}) {
  return getInvoiceTotal(item) > 0 ? "money" : "none";
}

function getImporteLabel(item = {}) {
  const total = getInvoiceTotal(item);

  if (total <= 0) return "—";
  return formatMoney(total, getCurrency(item));
}

/* =========================================================
   FILTER / SORT / STATS
========================================================= */

function normalizeFilter(value = "all") {
  const key = normalizeKey(value || "all");

  if (["all", "todas", "todos"].includes(key)) return "all";
  if (["open", "abiertas", "abiertos", "active", "activas", "activos", "pending", "in_progress"].includes(key)) return "open";
  if (["closed", "cerradas", "cerrados", "resolved", "resueltas", "resueltos"].includes(key)) return "closed";

  return "all";
}

function normalizeSortOrder(value = DEFAULT_SORT_ORDER) {
  const key = normalizeKey(value || DEFAULT_SORT_ORDER);

  if (["asc", "ascending", "menor", "menor_mayor", "menor_a_mayor", "menor-a-mayor", "oldest"].includes(key)) {
    return "asc";
  }

  return "desc";
}

function getSortLabel(order = DEFAULT_SORT_ORDER) {
  return normalizeSortOrder(order) === "asc" ? "Fecha ↑" : "Fecha ↓";
}

function getNextSortOrder(order = DEFAULT_SORT_ORDER) {
  return normalizeSortOrder(order) === "asc" ? "desc" : "asc";
}

function itemSortTime(item = {}) {
  const updated = sortTime(getUpdatedAt(item));
  if (updated) return updated;

  const created = sortTime(getCreatedAt(item));
  if (created) return created;

  return 0;
}

function sortItems(items = [], order = DEFAULT_SORT_ORDER) {
  const direction = normalizeSortOrder(order) === "asc" ? 1 : -1;

  return [...safeArray(items)].sort((a, b) => {
    const diff = itemSortTime(a) - itemSortTime(b);
    if (diff !== 0) return diff * direction;

    return getTicketId(a).localeCompare(getTicketId(b), "es", {
      numeric: true,
      sensitivity: "base",
    }) * direction;
  });
}

function matchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);

  if (key === "open") return isOpenItem(item);
  if (key === "closed") return isClosedItem(item);

  return true;
}

function itemSearchText(item = {}) {
  return normalizeText([
    getTicketId(item),
    getSubject(item),
    getDescription(item),
    getClientName(item),
    getClientEmail(item),
    getClientUserId(item),
    getClientId(item),
    getAssignedTo(item),
    getAssignedEmail(item),
    getCategory(item),
    getStatusLabel(getStatusRaw(item)),
    getPriorityLabel(item),
  ].join(" "));
}

function matchesSearch(item = {}, query = "") {
  const q = normalizeText(query);

  if (!q) return true;

  return itemSearchText(item).includes(q);
}

function computeLocalStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      acc.total += 1;
      if (isOpenItem(item)) acc.open += 1;
      if (isClosedItem(item)) acc.closed += 1;
      if (isUrgentItem(item)) acc.urgent += 1;

      acc.attachments += getAttachmentsCount(item);
      acc.invoiceTotal += getInvoiceTotal(item);

      const updated = itemSortTime(item);
      if (updated > acc.lastUpdateTs) acc.lastUpdateTs = updated;

      return acc;
    },
    {
      total: 0,
      open: 0,
      closed: 0,
      urgent: 0,
      attachments: 0,
      invoiceTotal: 0,
      lastUpdateTs: 0,
    }
  );
}

function mergeStats(items = [], provided = {}) {
  const local = computeLocalStats(items);
  const stats = safeObject(provided);
  const useLocal = local.total > 0;

  return {
    total: useLocal ? local.total : number(first(stats.total, local.total), local.total),
    open: useLocal ? local.open : number(first(stats.open, local.open), local.open),
    closed: useLocal ? local.closed : number(first(stats.closed, local.closed), local.closed),
    urgent: useLocal ? local.urgent : number(first(stats.urgent, local.urgent), local.urgent),
    attachments: useLocal ? local.attachments : number(first(stats.attachments, local.attachments), local.attachments),
    invoiceTotal: useLocal ? local.invoiceTotal : number(first(stats.invoiceTotal, local.invoiceTotal), local.invoiceTotal),
    lastUpdateTs: useLocal ? local.lastUpdateTs : number(first(stats.lastUpdateTs, local.lastUpdateTs), local.lastUpdateTs),
  };
}

function countByFilter(items = []) {
  const rows = safeArray(items);

  return {
    all: rows.length,
    open: rows.filter(isOpenItem).length,
    closed: rows.filter(isClosedItem).length,
  };
}

/* =========================================================
   ITEM EXTRACTION DEFENSIVO
========================================================= */

function collectArrayCandidates(input = {}) {
  const data = safeObject(input);
  const nestedData = safeObject(data.data);
  const nestedPayload = safeObject(data.payload);
  const nestedResult = safeObject(data.result);
  const nestedResponse = safeObject(data.response);
  const nestedBody = safeObject(data.body);
  const nestedMeta = safeObject(data.meta);

  return [
    data.items,
    data.visibleItems,
    data.filteredItems,
    data.rows,
    data.results,
    data.records,
    data.docs,
    data.documents,
    data.value,
    data.list,
    data.tickets,
    data.incidencias,

    Array.isArray(data.data) ? data.data : null,
    nestedData.items,
    nestedData.visibleItems,
    nestedData.filteredItems,
    nestedData.rows,
    nestedData.results,
    nestedData.records,
    nestedData.docs,
    nestedData.documents,
    nestedData.value,
    nestedData.list,
    nestedData.tickets,
    nestedData.incidencias,

    Array.isArray(data.payload) ? data.payload : null,
    nestedPayload.items,
    nestedPayload.rows,
    nestedPayload.results,
    nestedPayload.tickets,
    nestedPayload.incidencias,

    Array.isArray(data.result) ? data.result : null,
    nestedResult.items,
    nestedResult.rows,
    nestedResult.results,
    nestedResult.tickets,
    nestedResult.incidencias,

    Array.isArray(data.response) ? data.response : null,
    nestedResponse.items,
    nestedResponse.rows,
    nestedResponse.results,
    nestedResponse.tickets,
    nestedResponse.incidencias,

    Array.isArray(data.body) ? data.body : null,
    nestedBody.items,
    nestedBody.rows,
    nestedBody.results,
    nestedBody.tickets,
    nestedBody.incidencias,

    nestedMeta.items,
    nestedMeta.rows,
  ].filter(Array.isArray);
}

function normalizeItems(input = {}) {
  const candidates = Array.isArray(input) ? [input] : collectArrayCandidates(input);
  const map = new Map();

  for (const candidate of candidates) {
    for (const originalItem of safeArray(candidate)) {
      const item = unwrapItem(originalItem);
      const id = getTicketId(item);

      if (!id) continue;

      const previous = map.get(id);
      map.set(id, previous ? { ...previous, ...item } : item);
    }

    if (map.size > 0) break;
  }

  return sortItems([...map.values()], DEFAULT_SORT_ORDER);
}

function getRemoteTotal(data = {}, fallback = 0) {
  const source = safeObject(data);
  const nestedData = safeObject(source.data);
  const nestedPayload = safeObject(source.payload);
  const nestedResult = safeObject(source.result);
  const nestedResponse = safeObject(source.response);

  return Math.max(
    fallback,
    number(
      first(
        source.total,
        source.count,
        source.totalCount,
        source.remoteCount,
        source.meta?.total,
        source.meta?.count,
        source.pagination?.total,
        source.pagination?.totalCount,
        nestedData.total,
        nestedData.count,
        nestedData.totalCount,
        nestedData.meta?.total,
        nestedPayload.total,
        nestedPayload.count,
        nestedResult.total,
        nestedResult.count,
        nestedResponse.total,
        nestedResponse.count,
        fallback
      ),
      fallback
    )
  );
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data = safeObject(input);
  const allItems = normalizeItems(data);
  const filter = normalizeFilter(data.filter);
  const search = cleanText(data.search, "");
  const sortOrder = normalizeSortOrder(first(data.sortOrder, data.order, data.sort?.order, data.sort?.direction, DEFAULT_SORT_ORDER));
  const visibleLimit = Math.max(1, number(data.visibleLimit, DEFAULT_VISIBLE_ROWS));

  const filteredItems = sortItems(
    allItems
      .filter((item) => matchesFilter(item, filter))
      .filter((item) => matchesSearch(item, search)),
    sortOrder
  );

  const visibleItems = filteredItems.slice(0, visibleLimit);
  const total = getRemoteTotal(data, allItems.length);
  const filteredTotal = filteredItems.length;
  const visibleCount = visibleItems.length;
  const remainingCount = Math.max(0, filteredTotal - visibleCount);
  const stats = mergeStats(allItems, data.stats);

  return {
    data,

    route: cleanText(first(data.route, data.routes?.incidencias, DEFAULT_ROUTE), DEFAULT_ROUTE),
    routes: safeObject(data.routes),
    admin: Boolean(data.admin || data.role === "admin"),

    items: allItems,
    filteredItems,
    visibleItems,

    total,
    filteredTotal,
    visibleCount,
    visibleLimit,
    remainingCount,
    hasMore: remainingCount > 0,

    loading: data.loading === true,
    refreshing: data.refreshing === true,
    creating: data.creating === true,
    loadingMore: data.loadingMore === true,

    error: cleanText(data.error, ""),
    filter,
    search,
    sortOrder,
    sortLabel: getSortLabel(sortOrder),
    nextSortOrder: getNextSortOrder(sortOrder),
    nextSortLabel: getSortLabel(getNextSortOrder(sortOrder)),
    filterCounts: countByFilter(allItems),
    stats,

    openingTicketId: cleanText(data.openingTicketId, ""),

    diagnostics: {
      totalGreaterThanItems: total > 0 && allItems.length === 0,
      extractedItems: allItems.length,
      sourceKeys: Object.keys(data).filter(Boolean),
      templateVersion: INCIDENCIAS_TEMPLATE_VERSION,
    },
  };
}

/* =========================================================
   ROW PARTIALS
========================================================= */

function renderAvatar(item = {}) {
  const name = getClientName(item);
  const src = getAvatarUrl(item);
  const initials = initialsFrom(name);
  const tone = hashText(`${getTicketId(item)}:${name}`) % 10;

  return `
    <span
      class="incidencias-avatar${src ? " has-image" : " is-fallback"}"
      data-avatar-tone="${attr(String(tone))}"
      data-has-avatar="${src ? "true" : "false"}"
      aria-hidden="true"
    >
      ${
        src
          ? `
            <img
              src="${attr(src)}"
              alt=""
              width="48"
              height="48"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
              class="incidencias-avatar-img"
            >
          `
          : ""
      }
      <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
    </span>
  `;
}

function renderStatusChip(item = {}) {
  const raw = getStatusRaw(item);
  const key = getStatusKey(raw);
  const label = getStatusLabel(raw);

  return `
    <span class="incidencias-status-chip incidencias-status-chip--${attr(key)} is-${attr(key)}" data-status-chip="${attr(key)}">
      <span class="incidencias-status-dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getPriorityKey(item);
  const label = getPriorityLabel(item);

  return `
    <span class="incidencias-priority-badge incidencias-priority-badge--${attr(key)}" data-priority-badge="${attr(key)}">
      <span class="incidencias-badge-icon incidencias-priority-badge-icon" aria-hidden="true">${icon(getPriorityIconName(key))}</span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAssignedBadge(item = {}) {
  const assignedTo = getAssignedTo(item);
  const normalized = normalizeKey(assignedTo);

  if (!assignedTo || normalized === "sin_asignar") return "";

  const avatar = getAssignedAvatarUrl(item);
  const initials = initialsFrom(assignedTo);

  return `
    <span class="incidencias-assigned-badge" data-assigned="true" title="${attr(assignedTo)}">
      <span class="incidencias-assigned-avatar${avatar ? " has-image" : " is-fallback"}" aria-hidden="true">
        ${
          avatar
            ? `
              <img
                src="${attr(avatar)}"
                alt=""
                width="20"
                height="20"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
              >
            `
            : ""
        }
        <span>${escapeHtml(initials)}</span>
      </span>
      <span class="incidencias-assigned-name">${escapeHtml(assignedTo)}</span>
    </span>
  `;
}

function renderImporteChip(item = {}) {
  const key = getImporteKey(item);
  const label = getImporteLabel(item);

  return `
    <span class="incidencias-importe-chip incidencias-importe-chip--${attr(key)}" data-importe-status="${attr(key)}">
      ${key === "money" ? icon("euro") : ""}
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAttachmentPill(item = {}) {
  const count = getAttachmentsCount(item);

  return `
    <span class="incidencias-attachments-pill${count > 0 ? " has-attachments" : " is-empty"}" data-attachments-count="${attr(String(count))}">
      ${icon("paperclip")}
      <span>${escapeHtml(formatNumber(count))}</span>
    </span>
  `;
}

function renderRow(item = {}, vm = {}) {
  const ticketId = getTicketId(item);
  const subject = getSubject(item);
  const description = getDescription(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item);
  const userId = getClientUserId(item);
  const clienteId = getClientId(item);
  const createdAt = getCreatedAt(item);
  const updatedAt = getUpdatedAt(item);
  const isOpening = vm.openingTicketId && vm.openingTicketId === ticketId;

  return `
    <tr
      class="incidencias-row${isOpening ? " is-opening" : ""}"
      data-ticket-row="true"
      data-incidencia-row="true"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      data-incidencias-action="${INCIDENCIAS_ACTIONS.OPEN_DETAIL}"
      tabindex="0"
      role="button"
      aria-label="Abrir incidencia ${attr(ticketId)}"
    >
      <td class="incidencias-cell incidencias-cell--main" data-column="main">
        <div class="incidencias-main-cell">
          ${renderAvatar(item)}
          <div class="incidencias-main-copy">
            <div class="incidencias-main-line">
              <strong class="incidencias-row-title">${escapeHtml(subject)}</strong>
              ${renderPriorityBadge(item)}
            </div>
            <p class="incidencias-row-description">${escapeHtml(description || "Sin descripción.")}</p>
            <div class="incidencias-row-meta">
              <span class="incidencias-row-code">${icon("hash")} ${escapeHtml(ticketId || "Sin ID")}</span>
              <span class="incidencias-row-client">${icon("user")} ${escapeHtml(clientName)}</span>
              ${clientEmail ? `<span class="incidencias-row-email">${escapeHtml(clientEmail)}</span>` : ""}
              ${userId ? `<span class="incidencias-row-userid">${escapeHtml(userId)}</span>` : ""}
              ${clienteId ? `<span class="incidencias-row-clienteid">${escapeHtml(clienteId)}</span>` : ""}
              ${renderAssignedBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="incidencias-cell incidencias-cell--status" data-column="status">
        ${renderStatusChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--date incidencias-cell--created" data-column="created">
        <span title="${attr(formatDate(createdAt))}">${escapeHtml(formatShortDate(createdAt))}</span>
      </td>

      <td class="incidencias-cell incidencias-cell--date incidencias-cell--updated" data-column="updated">
        <span title="${attr(formatDate(updatedAt))}">${escapeHtml(formatRelativeDate(updatedAt))}</span>
      </td>

      <td class="incidencias-cell incidencias-cell--amount incidencias-cell--importe" data-column="amount">
        ${renderImporteChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--attachments" data-column="attachments">
        ${renderAttachmentPill(item)}
      </td>
    </tr>
  `;
}

/* =========================================================
   HEADER / HERO
========================================================= */

function renderSpinner(label = "Cargando...") {
  return `
    <span class="incidencias-spinner" aria-hidden="true"></span>
    <span class="incidencias-spinner-label">${escapeHtml(label)}</span>
  `;
}

function renderHeader(vm = {}) {
  const stats = vm.stats;
  const updatedAt = stats.lastUpdateTs ? new Date(stats.lastUpdateTs).toISOString() : null;

  return `
    <section class="incidencias-hero" data-incidencias-hero="true">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-title">Tus incidencias y solicitudes</h1>
          <p class="incidencias-subtitle">
            Consulta el estado de tus incidencias, revisa actualizaciones y crea nuevas solicitudes.
          </p>
        </div>

        <div class="incidencias-hero-actions">
          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--primary incidencias-btn--create"
            data-incidencias-action="${INCIDENCIAS_ACTIONS.CREATE_OPEN}"
            ${htmlAttrs({
              disabled: vm.creating || vm.loading,
              "aria-disabled": vm.creating || vm.loading ? "true" : false,
              "aria-busy": vm.creating ? "true" : false,
            })}
          >
            ${vm.creating ? renderSpinner("Creando...") : `${icon("plus")}<span class="incidencias-btn-text">Nueva incidencia</span>`}
          </button>

          <button
            type="button"
            id="incidencias-refresh-btn"
            class="incidencias-btn incidencias-btn--accent incidencias-btn--refresh${vm.refreshing ? " is-loading" : ""}"
            data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}"
            ${htmlAttrs({
              disabled: vm.refreshing || vm.loading,
              "aria-disabled": vm.refreshing || vm.loading ? "true" : false,
              "aria-busy": vm.refreshing ? "true" : false,
            })}
          >
            ${vm.refreshing ? renderSpinner("Actualizando...") : `${icon("refresh")}<span class="incidencias-btn-text">Actualizar</span>`}
          </button>
        </div>
      </div>

      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill" data-meta="total">
          ${icon("ticket")}
          <span>${escapeHtml(`${formatNumber(vm.total)} solicitudes registradas`)}</span>
        </span>

        <span class="incidencias-meta-pill" data-meta="updated">
          ${icon("refresh")}
          <span>${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span>
        </span>

        <span class="incidencias-meta-pill" data-meta="attachments">
          ${icon("paperclip")}
          <span>${escapeHtml(`${formatNumber(stats.attachments)} adjuntos`)}</span>
        </span>

        <span class="incidencias-meta-pill" data-meta="amount">
          ${icon("euro")}
          <span>${escapeHtml(formatMoney(stats.invoiceTotal, DEFAULT_CURRENCY))}</span>
        </span>
      </div>

      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open" data-stat="open">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(formatNumber(stats.open))}</div>
          <div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed" data-stat="closed">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(formatNumber(stats.closed))}</div>
          <div class="incidencias-stat-text">Casos resueltos o cerrados.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--urgent" data-stat="urgent">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${escapeHtml(formatNumber(stats.urgent))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--amount" data-stat="amount">
          <div class="incidencias-stat-label">Importe asociado</div>
          <div class="incidencias-stat-value">${escapeHtml(formatMoney(stats.invoiceTotal, DEFAULT_CURRENCY))}</div>
          <div class="incidencias-stat-text">Total vinculado a facturas visibles.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function renderSearch(vm = {}) {
  return `
    <div class="incidencias-search" role="search" aria-label="Buscar incidencias">
      <span class="incidencias-search-icon" aria-hidden="true">${icon("search")}</span>

      <input
        id="incidencias-search-input"
        class="incidencias-search-input"
        type="search"
        value="${attr(vm.search)}"
        placeholder="Buscar cliente, asunto, ID..."
        autocomplete="off"
        spellcheck="false"
        data-incidencias-search-input="true"
        data-incidencias-field="search"
        data-field="search"
        aria-label="Buscar incidencias por cliente, asunto o identificador"
      >

      ${
        vm.search
          ? `
            <button
              type="button"
              class="incidencias-search-clear"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_SEARCH}"
              aria-label="Limpiar búsqueda"
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderSortButton(vm = {}) {
  const order = normalizeSortOrder(vm.sortOrder);
  const label = getSortLabel(order);
  const nextOrder = getNextSortOrder(order);
  const nextLabel = getSortLabel(nextOrder);

  return `
    <button
      type="button"
      class="incidencias-sort-btn"
      data-incidencias-action="${INCIDENCIAS_ACTIONS.SORT_TOGGLE}"
      data-sort-order="${attr(order)}"
      data-next-sort-order="${attr(nextOrder)}"
      aria-label="Cambiar orden a ${attr(nextLabel)}"
      title="Cambiar orden a ${attr(nextLabel)}"
    >
      ${icon("calendar")}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderFilters(vm = {}) {
  return `
    <div class="incidencias-toolbar" data-incidencias-toolbar="true">
      <div class="incidencias-filter-group" role="tablist" aria-label="Filtrar incidencias">
        ${FILTERS.map((item) => {
          const active = item.key === vm.filter;
          const count = number(vm.filterCounts?.[item.key], 0);

          return `
            <button
              type="button"
              role="tab"
              class="incidencias-filter-btn${active ? " is-active" : ""}"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.FILTER}"
              data-filter="${attr(item.key)}"
              aria-selected="${active ? "true" : "false"}"
            >
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(formatNumber(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      <div class="incidencias-toolbar-side">
        ${renderSortButton(vm)}
        ${renderSearch(vm)}
      </div>
    </div>
  `;
}

/* =========================================================
   TABLE
========================================================= */

function renderTableColgroup() {
  return `
    <colgroup>
      ${INCIDENCIAS_TABLE_COLUMNS.map((column) => `<col class="${attr(column.colClass)}">`).join("")}
    </colgroup>
  `;
}

function renderTableHead() {
  return `
    <thead>
      <tr>
        ${INCIDENCIAS_TABLE_COLUMNS.map((column) => `
          <th class="${attr(column.thClass)}" scope="col" data-column="${attr(column.key)}">
            ${escapeHtml(column.label)}
          </th>
        `).join("")}
      </tr>
    </thead>
  `;
}

function renderTableLoading(rows = DEFAULT_VISIBLE_ROWS) {
  const totalRows = Math.max(4, number(rows, DEFAULT_VISIBLE_ROWS));

  return `
    <div class="incidencias-table-wrap is-loading" data-incidencias-table-wrap="true">
      <div class="incidencias-table-shell">
        <table
          class="incidencias-table incidencias-table--no-actions incidencias-table--scale-110 incidencias-table--loading"
          role="table"
          aria-label="Cargando incidencias"
          data-table-columns="6"
          data-table-actions="false"
          data-table-scale="${attr(TABLE_SCALE)}"
        >
          ${renderTableColgroup()}
          ${renderTableHead()}
          <tbody>
            ${Array.from({ length: totalRows }).map((_, index) => `
              <tr class="incidencias-row incidencias-row--skeleton" aria-hidden="true" data-skeleton-row="${index + 1}">
                ${INCIDENCIAS_TABLE_COLUMNS.map((column) => `
                  <td class="${attr(column.cellClass)}" data-column="${attr(column.key)}">
                    <span class="incidencias-skeleton incidencias-skeleton--${attr(column.key)}"></span>
                  </td>
                `).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="incidencias-refresh-overlay" aria-live="polite" aria-busy="true">
      <span class="incidencias-spinner" aria-hidden="true"></span>
      <span>Actualizando incidencias...</span>
    </div>
  `;
}

function renderEmptyState(vm = {}) {
  const hasError = Boolean(vm.error);
  const filtering = vm.filter !== "all" || Boolean(vm.search);
  const totalWithoutRows = vm.total > 0 && !vm.visibleItems.length && !filtering && !hasError;

  const title = hasError
    ? "No se pudieron cargar las incidencias"
    : filtering
      ? "No hay incidencias con esos filtros"
      : totalWithoutRows
        ? "Hay incidencias, pero no llegaron filas al listado"
        : "Todavía no hay incidencias";

  const text = hasError
    ? vm.error
    : filtering
      ? "Prueba a limpiar la búsqueda o cambia el filtro activo para volver al historial completo."
      : totalWithoutRows
        ? "El backend o la capa API está entregando total, pero no está entregando items/tickets/incidencias/rows. Este template ya acepta todos los aliases; revisa /api/tickets?debug=true si sigue ocurriendo."
        : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos y facturación asociada.";

  return `
    <div class="incidencias-empty${totalWithoutRows ? " is-data-mismatch" : ""}" data-incidencias-empty="true">
      <div class="incidencias-empty-icon" aria-hidden="true">
        ${hasError || totalWithoutRows ? icon("alert") : icon("ticket")}
      </div>

      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>

      ${
        hasError || totalWithoutRows
          ? `
            <button
              type="button"
              class="incidencias-btn incidencias-btn--primary"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}"
            >
              ${icon("refresh")}
              <span class="incidencias-btn-text">Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="incidencias-btn"
                data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_FILTERS}"
              >
                ${icon("close")}
                <span class="incidencias-btn-text">Limpiar filtros</span>
              </button>
            `
            : ""
      }
    </div>
  `;
}

function renderFeedFooter(vm = {}) {
  if (!vm.total || !vm.visibleCount) {
    return `
      <div
        class="incidencias-feed-sentinel"
        data-incidencias-load-more="true"
        data-incidencias-infinite-sentinel="true"
        aria-hidden="true"
      ></div>
    `;
  }

  if (!vm.hasMore) {
    return `
      <div
        class="incidencias-feed-end"
        data-incidencias-feed-end="true"
        data-incidencias-load-more="false"
      >
        <span class="incidencias-feed-end-text">
          Has visto todas las incidencias disponibles.
        </span>
      </div>
    `;
  }

  return `
    <div class="incidencias-feed-more" data-incidencias-feed-more="true">
      <button
        type="button"
        class="incidencias-load-more-btn${vm.loadingMore ? " is-loading" : ""}"
        data-incidencias-action="${INCIDENCIAS_ACTIONS.LOAD_MORE}"
        data-incidencias-load-more-button="true"
        ${htmlAttrs({
          disabled: vm.loadingMore,
          "aria-disabled": vm.loadingMore ? "true" : false,
          "aria-busy": vm.loadingMore ? "true" : false,
        })}
      >
        ${
          vm.loadingMore
            ? renderSpinner("Cargando más incidencias...")
            : `
              ${icon("chevronDown")}
              <span class="incidencias-btn-text">Mostrar más</span>
              <span class="incidencias-load-more-count">
                ${escapeHtml(`${formatNumber(vm.remainingCount)} restantes`)}
              </span>
            `
        }
      </button>

      <div
        class="incidencias-feed-sentinel"
        data-incidencias-load-more="true"
        data-incidencias-infinite-sentinel="true"
        data-load-more-sentinel="true"
        aria-hidden="true"
      ></div>
    </div>
  `;
}

function renderTable(vm = {}) {
  if (!vm.visibleItems.length) {
    return renderEmptyState(vm);
  }

  return `
    <div class="incidencias-table-shell">
      <table
        class="incidencias-table incidencias-table--no-actions incidencias-table--scale-110"
        role="table"
        aria-label="Listado de incidencias"
        data-table-columns="6"
        data-table-actions="false"
        data-table-scale="${attr(TABLE_SCALE)}"
        data-sort-order="${attr(vm.sortOrder)}"
      >
        ${renderTableColgroup()}
        ${renderTableHead()}

        <tbody>
          ${vm.visibleItems.map((item) => renderRow(item, vm)).join("")}
        </tbody>
      </table>
    </div>

    ${renderFeedFooter(vm)}
  `;
}

function renderHistory(vm = {}) {
  const showInitialLoading = vm.loading && !vm.visibleItems.length;
  const showRefreshOverlay = vm.refreshing && vm.visibleItems.length;
  const activeFilterLabel = FILTERS.find((item) => item.key === vm.filter)?.label || "Todas";
  const activeCriteria = [
    vm.filter !== "all" ? activeFilterLabel : "",
    vm.search ? `búsqueda “${vm.search}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando incidencias..."
    : vm.filter !== "all" || vm.search
      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${activeCriteria.length ? ` · ${activeCriteria.join(" · ")}` : ""} · orden ${getSortLabel(vm.sortOrder).toLowerCase()}`
      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · orden ${getSortLabel(vm.sortOrder).toLowerCase()}`;

  return `
    <section
      class="incidencias-history"
      data-incidencias-scroll-host="true"
      data-incidencias-scroll-mode="infinite"
    >
      <div class="incidencias-history-head" data-incidencias-history-head="true">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderFilters(vm)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(DEFAULT_VISIBLE_ROWS)
          : `
            <div
              class="incidencias-table-wrap${vm.refreshing ? " is-refreshing" : ""}"
              data-incidencias-table-wrap="true"
              data-incidencias-scroll-mode="infinite"
            >
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}
              ${renderTable(vm)}
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderIncidenciasLoadingState(input = {}) {
  const vm = buildVm({
    ...safeObject(input),
    loading: true,
  });

  return `
    <section
      class="incidencias-view-root incidencias-view-root--loading is-loading"
      data-incidencias-scope="true"
      data-template-version="${attr(INCIDENCIAS_TEMPLATE_VERSION)}"
      data-total="${attr(String(vm.total))}"
      data-visible="${attr(String(vm.visibleCount))}"
      data-filter="${attr(vm.filter)}"
      data-sort-order="${attr(vm.sortOrder)}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      aria-busy="true"
    >
      ${renderHeader(vm)}
      ${renderHistory(vm)}
    </section>
  `;
}

export function renderIncidenciasErrorState(message = "No se pudieron cargar las incidencias.") {
  return `
    <section
      class="incidencias-view-root incidencias-view-root--error has-error"
      data-incidencias-scope="true"
      data-template-version="${attr(INCIDENCIAS_TEMPLATE_VERSION)}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      aria-busy="false"
    >
      <section class="incidencias-error">
        <h3 class="incidencias-error-title">No se pudo renderizar la vista de incidencias</h3>
        <p class="incidencias-error-text">${escapeHtml(cleanText(message, "Error desconocido al cargar la vista."))}</p>

        <button
          type="button"
          class="incidencias-btn incidencias-btn--primary"
          data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}"
        >
          ${icon("refresh")}
          <span class="incidencias-btn-text">Reintentar</span>
        </button>
      </section>
    </section>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderIncidenciasTemplate(input = {}) {
  const vm = buildVm(input);

  return `
    <section
      class="${joinClasses(
        "incidencias-view-root",
        vm.loading ? "is-loading" : "",
        vm.refreshing ? "is-refreshing" : "",
        vm.creating ? "is-creating" : "",
        vm.error ? "has-error" : ""
      )}"
      data-incidencias-scope="true"
      data-template-version="${attr(INCIDENCIAS_TEMPLATE_VERSION)}"
      data-route="${attr(vm.route)}"
      data-total="${attr(String(vm.total))}"
      data-visible="${attr(String(vm.visibleCount))}"
      data-filter="${attr(vm.filter)}"
      data-search-active="${vm.search ? "true" : "false"}"
      data-sort-order="${attr(vm.sortOrder)}"
      data-loading="${vm.loading ? "true" : "false"}"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      data-items-extracted="${attr(String(vm.items.length))}"
      data-total-greater-than-items="${vm.diagnostics.totalGreaterThanItems ? "true" : "false"}"
      aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}"
    >
      ${
        vm.error
          ? `
            <div class="incidencias-alert incidencias-alert--error" role="alert">
              ${icon("alert")}
              <span>${escapeHtml(vm.error)}</span>
            </div>
          `
          : ""
      }

      ${renderHeader(vm)}
      ${renderHistory(vm)}
    </section>
  `;
}

export function getIncidenciasTemplateSnapshot(input = {}) {
  const vm = buildVm(input);

  return {
    version: INCIDENCIAS_TEMPLATE_VERSION,
    total: vm.total,
    extractedItems: vm.items.length,
    visibleCount: vm.visibleCount,
    filteredTotal: vm.filteredTotal,
    filter: vm.filter,
    searchLength: vm.search.length,
    sortOrder: vm.sortOrder,
    totalGreaterThanItems: vm.diagnostics.totalGreaterThanItems,
    acceptedArrayAliases: [
      "items",
      "visibleItems",
      "filteredItems",
      "tickets",
      "incidencias",
      "rows",
      "results",
      "records",
      "data.items",
      "data.rows",
      "data.tickets",
      "data.incidencias",
      "payload.items",
      "result.items",
      "response.items",
      "body.items",
    ],
  };
}

export const getSnapshot = getIncidenciasTemplateSnapshot;
export const renderTemplate = renderIncidenciasTemplate;
export default renderIncidenciasTemplate;

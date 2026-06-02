/* =========================================================
   Onion Support - Incidencias Template
   Archivo: /src/views/incidencias/incidencias.template.js

   Responsabilidad:
   - Render HTML puro de la vista Incidencias.
   - Header/hero, stats, filtros, búsqueda y listado.
   - No renderizar modales: index.js los monta como isla externa estable.
   - Exponer data-incidencias-action/data-field para index.js.
   - Mantener columnas 1:1 con CSS.
   - Tabla sin columna Acciones: la fila abre el detalle.
   - Tabla marcada para escala visual 110%.
   - Botón de filtro por fecha preparado para el controlador.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin State externo.
   - Sin Model externo.
   - Sin listeners.
   - Sin DOM API.
   - Sin Toast.
========================================================= */

export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.productive.v7";

export const INCIDENCIAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  CREATE_OPEN: "create-open",

  FILTER: "filter",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",

  DATE_FILTER: "date-filter",
  CLEAR_DATE_FILTER: "clear-date-filter",

  OPEN_DETAIL: "open-detail",
  LOAD_MORE: "load-more",
});

const DEFAULT_ROUTE = "/incidencias";
const DEFAULT_VISIBLE_ROWS = 20;
const DEFAULT_CURRENCY = "EUR";
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
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.picture,
        value.url,
        value.src,
        value.href,
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

function firstEmail(...values) {
  for (const value of values.flat(Infinity)) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function valueAt(source = {}, path = "") {
  if (!isObject(source) || !path) return undefined;

  return path.split(".").reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, source);
}

function pickValue(item = {}, paths = []) {
  const raw = safeObject(item?.raw);

  for (const path of paths) {
    const value = first(valueAt(item, path), valueAt(raw, path));
    if (value !== null && value !== undefined) return value;
  }

  return null;
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

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
  } catch {
    return String(Number(value) || 0);
  }
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

function formatDateTime(value = null) {
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

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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

  return formatDateShort(value);
}

function formatLastUpdate(value = null) {
  const timestamp = toTimestamp(value);

  if (!timestamp) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - timestamp) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
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
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    calendar: `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,
    chevronDown: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
    user: `<svg ${common}><path d="M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.75 20.75a7.25 7.25 0 0 1 14.5 0"/></svg>`,

    badgeBolt: `<svg ${common}><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/></svg>`,
    badgeSignal: `<svg ${common}><path d="M4 13h3v7H4z"/><path d="M10.5 9h3v11h-3z"/><path d="M17 4h3v16h-3z"/></svg>`,
    badgeShield: `<svg ${common}><path d="M12 3 20 7v5c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V7l8-4Z"/><path d="M9.5 12.2 11.3 14l3.5-4"/></svg>`,
    badgeLeaf: `<svg ${common}><path d="M19 4c-7.5.6-12 4.5-12 10.5 0 3.2 2.3 5.5 5.5 5.5C18.5 20 21.4 13.5 19 4Z"/><path d="M7 17c2.2-3.7 5.2-6.2 9-7.5"/></svg>`,
    badgeUser: `<svg ${common}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>`,
  };

  return icons[name] || "";
}

function renderSpinner(label = "Cargando...") {
  return `
    <span class="incidencias-spinner" aria-hidden="true"></span>
    <span class="incidencias-btn-text">${escapeHtml(label)}</span>
  `;
}

/* =========================================================
   ITEM PICKERS
========================================================= */

function getTicketId(item = {}) {
  return cleanText(
    pickValue(item, [
      "ticketId",
      "incidenciaId",
      "code",
      "numero",
      "ticketCode",
      "id",
      "_id",
    ]),
    "INC-SIN-ID"
  );
}

function getSubject(item = {}) {
  return cleanText(
    pickValue(item, ["subject", "title", "asunto", "name", "preview"]),
    "Incidencia sin asunto"
  );
}

function getDescription(item = {}) {
  return cleanText(
    pickValue(item, ["description", "descripcion", "message", "body", "preview", "text"]),
    "Sin descripción."
  );
}

function getClientName(item = {}) {
  return cleanText(
    pickValue(item, [
      "clientName",
      "clienteNombre",
      "clienteName",
      "requesterName",
      "userName",
      "name",
      "requesterSnapshot.displayName",
      "requesterSnapshot.name",
      "requesterSnapshot.nombre",
      "cliente.displayName",
      "cliente.name",
      "cliente.nombre",
      "client.displayName",
      "client.name",
      "user.displayName",
      "user.name",
    ]),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  return firstEmail(
    pickValue(item, ["requesterEmail"]),
    pickValue(item, ["requesterEmailLower"]),
    pickValue(item, ["clientEmail"]),
    pickValue(item, ["clientEmailLower"]),
    pickValue(item, ["clienteEmail"]),
    pickValue(item, ["clienteEmailLower"]),
    pickValue(item, ["userEmail"]),
    pickValue(item, ["userEmailLower"]),
    pickValue(item, ["email"]),
    pickValue(item, ["emailLower"]),
    pickValue(item, ["requesterSnapshot.email"]),
    pickValue(item, ["requesterSnapshot.emailLower"]),
    pickValue(item, ["cliente.email"]),
    pickValue(item, ["cliente.emailLower"]),
    pickValue(item, ["client.email"]),
    pickValue(item, ["client.emailLower"]),
    pickValue(item, ["user.email"]),
    pickValue(item, ["user.emailLower"]),
    pickValue(item, ["meta.requesterEmail"]),
    pickValue(item, ["meta.clientEmail"]),
    pickValue(item, ["meta.clienteEmail"]),
    pickValue(item, ["meta.userEmail"])
  );
}

function getAvatarUrl(item = {}) {
  return firstImageSrc(
    pickValue(item, ["requesterAvatarUrl"]),
    pickValue(item, ["requesterAvatar"]),
    pickValue(item, ["userAvatarUrl"]),
    pickValue(item, ["userAvatar"]),
    pickValue(item, ["clientAvatarUrl"]),
    pickValue(item, ["clientAvatar"]),
    pickValue(item, ["clienteAvatarUrl"]),
    pickValue(item, ["clienteAvatar"]),
    pickValue(item, ["avatarUrl"]),
    pickValue(item, ["avatar"]),
    pickValue(item, ["photoUrl"]),
    pickValue(item, ["photoURL"]),
    pickValue(item, ["imageUrl"]),
    pickValue(item, ["picture"]),
    pickValue(item, ["requesterSnapshot"]),
    pickValue(item, ["cliente"]),
    pickValue(item, ["client"]),
    pickValue(item, ["user"]),
    pickValue(item, ["meta.requesterAvatarUrl"]),
    pickValue(item, ["meta.requesterAvatar"]),
    pickValue(item, ["meta.clientAvatarUrl"]),
    pickValue(item, ["meta.clientAvatar"])
  );
}

function getStatusRaw(item = {}) {
  return first(
    pickValue(item, ["status"]),
    pickValue(item, ["estado"]),
    pickValue(item, ["state"]),
    pickValue(item, ["lifecycle.status"]),
    "open"
  );
}

function getPriorityRaw(item = {}) {
  return first(
    pickValue(item, ["priority"]),
    pickValue(item, ["prioridad"]),
    pickValue(item, ["severity"]),
    pickValue(item, ["urgency"]),
    pickValue(item, ["sla.priority"]),
    "medium"
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["open", "opened", "abierta", "abierto"].includes(key)) return "open";
  if (["pending", "pendiente", "new", "nueva", "nuevo"].includes(key)) return "pending";
  if (["in_progress", "progress", "inprogress", "proceso", "en_proceso", "working"].includes(key)) return "progress";
  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "close", "cerrada", "cerrado", "cancelled", "canceled", "archived", "archivada"].includes(key)) return "closed";

  return "pending";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return "Pendiente";
}

function getPriorityKey(item = {}) {
  const key = normalizeKey(getPriorityRaw(item));

  if (["critical", "critica", "crítica", "critico", "crítico", "p0"].includes(key)) return "critical";
  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) return "urgent";
  if (["low", "baja", "minor", "p3"].includes(key)) return "low";

  return "medium";
}

function getPriorityLabel(item = {}) {
  const key = getPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Urgente";
  if (key === "low") return "Baja";

  return "Media";
}

function getPriorityIconName(key = "") {
  if (key === "critical") return "badgeBolt";
  if (key === "urgent") return "badgeSignal";
  if (key === "low") return "badgeLeaf";

  return "badgeShield";
}

function getCategory(item = {}) {
  return cleanText(
    pickValue(item, ["category", "categoria", "type", "tipo", "subcategory", "subcategoria"]),
    "Soporte"
  );
}

function getAssignedTo(item = {}) {
  return cleanText(
    pickValue(item, [
      "assignedToName",
      "technicianName",
      "tecnicoName",
      "agentName",
      "assignmentAssignedToName",
      "assignmentTechnicianName",
      "assignment.name",
      "assignment.assignedToName",
      "assignment.technicianName",
      "assignment.agentName",
      "assignedTo.displayName",
      "assignedTo.name",
      "assignedTo.nombre",
      "technician.displayName",
      "technician.name",
      "tecnico.displayName",
      "tecnico.name",
      "agent.displayName",
      "agent.name",
      "meta.technicianName",
      "meta.assignedTechnicianName",
      "meta.lastTechnicianName",
    ]),
    "Sin asignar"
  );
}

function getAssignedAvatarUrl(item = {}) {
  return firstImageSrc(
    pickValue(item, ["assignedToAvatarUrl"]),
    pickValue(item, ["assignedToAvatar"]),
    pickValue(item, ["technicianAvatarUrl"]),
    pickValue(item, ["technicianAvatar"]),
    pickValue(item, ["tecnicoAvatarUrl"]),
    pickValue(item, ["tecnicoAvatar"]),
    pickValue(item, ["agentAvatarUrl"]),
    pickValue(item, ["agentAvatar"]),
    pickValue(item, ["assignment.assignedToAvatarUrl"]),
    pickValue(item, ["assignment.assignedToAvatar"]),
    pickValue(item, ["assignment.technicianAvatarUrl"]),
    pickValue(item, ["assignment.technicianAvatar"]),
    pickValue(item, ["assignment.agentAvatarUrl"]),
    pickValue(item, ["assignment.agentAvatar"]),
    pickValue(item, ["assignment.avatarUrl"]),
    pickValue(item, ["assignment.avatar"]),
    pickValue(item, ["assignedTo"]),
    pickValue(item, ["technician"]),
    pickValue(item, ["tecnico"]),
    pickValue(item, ["agent"]),
    pickValue(item, ["meta.technicianAvatarUrl"]),
    pickValue(item, ["meta.technicianAvatar"]),
    pickValue(item, ["meta.assignedTechnicianAvatarUrl"]),
    pickValue(item, ["meta.assignedTechnicianAvatar"]),
    pickValue(item, ["meta.lastTechnicianAvatarUrl"]),
    pickValue(item, ["meta.lastTechnicianAvatar"])
  );
}

function getInvoiceTotal(item = {}) {
  return number(
    first(
      pickValue(item, ["invoiceTotal"]),
      pickValue(item, ["invoicesTotal"]),
      pickValue(item, ["facturasTotal"]),
      pickValue(item, ["importeFacturas"]),
      pickValue(item, ["facturaTotal"]),
      pickValue(item, ["facturaImporte"]),
      pickValue(item, ["importeFactura"]),
      pickValue(item, ["invoiceAmount"]),
      pickValue(item, ["amount"]),
      pickValue(item, ["total"]),
      pickValue(item, ["meta.invoiceTotal"]),
      pickValue(item, ["meta.invoicesTotal"]),
      0
    ),
    0
  );
}

function getInvoiceCurrency(item = {}) {
  return cleanText(
    first(
      pickValue(item, ["currency"]),
      pickValue(item, ["moneda"]),
      pickValue(item, ["facturaCurrency"]),
      pickValue(item, ["facturaMoneda"]),
      pickValue(item, ["meta.invoiceCurrency"]),
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function getImporteLabel(item = {}) {
  const amount = getInvoiceTotal(item);

  if (amount > 0) {
    return formatMoney(amount, getInvoiceCurrency(item));
  }

  const paymentKey = normalizeKey(first(pickValue(item, ["paymentStatus"]), pickValue(item, ["estadoPago"]), ""));

  if (["paid", "pagada", "pagado"].includes(paymentKey)) return "Pagado";
  if (["pending", "pendiente"].includes(paymentKey)) return "Pendiente";
  if (["partial", "parcial"].includes(paymentKey)) return "Parcial";
  if (["overdue", "vencida", "vencido"].includes(paymentKey)) return "Vencido";

  return "—";
}

function getImporteKey(item = {}) {
  const amount = getInvoiceTotal(item);

  if (amount > 0) return "money";

  const paymentKey = normalizeKey(first(pickValue(item, ["paymentStatus"]), pickValue(item, ["estadoPago"]), ""));

  if (["paid", "pagada", "pagado"].includes(paymentKey)) return "paid";
  if (["pending", "pendiente"].includes(paymentKey)) return "pending";
  if (["partial", "parcial"].includes(paymentKey)) return "partial";
  if (["overdue", "vencida", "vencido"].includes(paymentKey)) return "overdue";

  return "idle";
}

function getCreatedAt(item = {}) {
  return first(
    pickValue(item, ["createdAt"]),
    pickValue(item, ["fechaCreacion"]),
    pickValue(item, ["created_at"]),
    pickValue(item, ["lifecycle.createdAt"]),
    null
  );
}

function getUpdatedAt(item = {}) {
  return first(
    pickValue(item, ["lastActivityAt"]),
    pickValue(item, ["updatedAt"]),
    pickValue(item, ["updated_at"]),
    pickValue(item, ["modifiedAt"]),
    pickValue(item, ["closedAt"]),
    pickValue(item, ["createdAt"]),
    pickValue(item, ["lifecycle.lastActivityAt"]),
    pickValue(item, ["lifecycle.updatedAt"]),
    pickValue(item, ["lifecycle.closedAt"]),
    pickValue(item, ["lifecycle.createdAt"]),
    null
  );
}

function getAttachmentsCount(item = {}) {
  const attachments = first(
    pickValue(item, ["attachments"]),
    pickValue(item, ["files"]),
    pickValue(item, ["adjuntos"])
  );

  if (Array.isArray(attachments)) return attachments.length;

  return number(
    first(
      pickValue(item, ["attachmentsCount"]),
      pickValue(item, ["filesCount"]),
      pickValue(item, ["adjuntosCount"]),
      pickValue(item, ["meta.attachmentsCount"]),
      pickValue(item, ["meta.filesCount"]),
      0
    ),
    0
  );
}

function itemSortTime(item = {}) {
  return Math.max(toTimestamp(getUpdatedAt(item)), toTimestamp(getCreatedAt(item)), 0);
}

/* =========================================================
   FILTER / STATS
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (["all", "todo", "todos", "todas", "total", "totales"].includes(key)) return "all";
  if (["open", "opened", "abierta", "abierto", "pending", "pendiente", "progress", "in_progress", "proceso", "en_proceso"].includes(key)) return "open";
  if (["closed", "close", "cerrada", "cerrado", "resolved", "resuelta", "resuelto", "cancelled", "archived"].includes(key)) return "closed";

  return "all";
}

function isClosedItem(item = {}) {
  return ["closed", "resolved"].includes(getStatusKey(getStatusRaw(item)));
}

function isOpenItem(item = {}) {
  return !isClosedItem(item);
}

function isUrgentItem(item = {}) {
  return ["urgent", "critical"].includes(getPriorityKey(item));
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
    getAssignedTo(item),
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

function getDateFilterTimestamp(item = {}) {
  return toTimestamp(getCreatedAt(item)) || itemSortTime(item);
}

function getDateBoundary(value = "", mode = "start") {
  const raw = cleanText(value, "");

  if (!raw) return 0;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const suffix = mode === "end" ? "T23:59:59.999" : "T00:00:00.000";
    return toTimestamp(`${raw}${suffix}`);
  }

  const timestamp = toTimestamp(raw);

  if (!timestamp) return 0;

  const date = new Date(timestamp);

  if (mode === "end") {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date.getTime();
}

function matchesDateFilter(item = {}, dateFrom = "", dateTo = "") {
  const from = getDateBoundary(dateFrom, "start");
  const to = getDateBoundary(dateTo, "end");

  if (!from && !to) return true;

  const itemTime = getDateFilterTimestamp(item);

  if (!itemTime) return false;
  if (from && itemTime < from) return false;
  if (to && itemTime > to) return false;

  return true;
}

function getDateFilterLabel(vm = {}) {
  const explicit = cleanText(vm.dateLabel, "");

  if (explicit) return explicit;
  if (vm.dateFrom && vm.dateTo) return `${formatDateShort(vm.dateFrom)} - ${formatDateShort(vm.dateTo)}`;
  if (vm.dateFrom) return `Desde ${formatDateShort(vm.dateFrom)}`;
  if (vm.dateTo) return `Hasta ${formatDateShort(vm.dateTo)}`;

  return "Fecha";
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

      const updatedAt = itemSortTime(item);
      if (updatedAt > acc.lastUpdateTs) acc.lastUpdateTs = updatedAt;

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

  return {
    total: number(first(stats.total, local.total), local.total),
    open: number(first(stats.open, local.open), local.open),
    closed: number(first(stats.closed, local.closed), local.closed),
    urgent: number(first(stats.urgent, local.urgent), local.urgent),
    attachments: number(first(stats.attachments, local.attachments), local.attachments),
    invoiceTotal: number(first(stats.invoiceTotal, local.invoiceTotal), local.invoiceTotal),
    lastUpdateTs: number(first(stats.lastUpdateTs, local.lastUpdateTs), local.lastUpdateTs),
  };
}

function countByFilter(items = []) {
  return {
    all: safeArray(items).length,
    open: safeArray(items).filter(isOpenItem).length,
    closed: safeArray(items).filter(isClosedItem).length,
  };
}

function normalizeItems(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const id = getTicketId(item);

    if (!id) continue;
    if (!map.has(id)) map.set(id, item);
  }

  return [...map.values()].sort((a, b) => {
    const diff = itemSortTime(b) - itemSortTime(a);

    if (diff !== 0) return diff;

    return getTicketId(b).localeCompare(getTicketId(a), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data = safeObject(input);
  const allItems = normalizeItems(data.items);
  const filter = normalizeFilter(data.filter);
  const search = cleanText(data.search, "");
  const dateFrom = cleanText(first(data.dateFrom, data.filters?.dateFrom, data.dateFilter?.from, data.date?.from), "");
  const dateTo = cleanText(first(data.dateTo, data.filters?.dateTo, data.dateFilter?.to, data.date?.to), "");
  const dateLabel = cleanText(first(data.dateLabel, data.filters?.dateLabel, data.dateFilter?.label, data.date?.label), "");
  const dateFilterActive = Boolean(dateFrom || dateTo || dateLabel || data.dateFilterActive === true);
  const visibleLimit = Math.max(1, number(data.visibleLimit, DEFAULT_VISIBLE_ROWS));
  const stats = mergeStats(allItems, data.stats);

  const filteredItems = allItems
    .filter((item) => matchesFilter(item, filter))
    .filter((item) => matchesSearch(item, search))
    .filter((item) => matchesDateFilter(item, dateFrom, dateTo));

  const visibleItems = filteredItems.slice(0, visibleLimit);
  const total = Math.max(number(data.total, allItems.length), allItems.length);
  const filteredTotal = filteredItems.length;
  const visibleCount = visibleItems.length;
  const remainingCount = Math.max(0, filteredTotal - visibleCount);

  return {
    data,

    route: cleanText(first(data.route, data.routes?.incidencias, DEFAULT_ROUTE), DEFAULT_ROUTE),
    routes: safeObject(data.routes),

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
    dateFrom,
    dateTo,
    dateLabel,
    dateFilterActive,
    filterCounts: countByFilter(allItems),
    stats,

    openingTicketId: cleanText(data.openingTicketId, ""),
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
    <span class="incidencias-assigned-badge" data-assigned="true">
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
      <span class="incidencias-badge-icon incidencias-assigned-badge-icon" aria-hidden="true">${icon("badgeUser")}</span>
      <span>${escapeHtml(assignedTo)}</span>
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

/* =========================================================
   HEADER / HERO
========================================================= */

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

        <div class="incidencias-hero-actions" aria-label="Acciones de incidencias">
          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--primary incidencias-btn--create${vm.creating ? " is-loading" : ""}"
            data-incidencias-action="${INCIDENCIAS_ACTIONS.CREATE_OPEN}"
            ${htmlAttrs({
              disabled: vm.creating,
              "aria-disabled": vm.creating ? "true" : false,
              "aria-busy": vm.creating ? "true" : false,
            })}
          >
            ${vm.creating ? renderSpinner("Creando...") : `${icon("plus")}<span class="incidencias-btn-text">Crear incidencia</span>`}
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

function renderDateFilterButton(vm = {}) {
  const active = vm.dateFilterActive === true;
  const label = getDateFilterLabel(vm);

  return `
    <span
      class="incidencias-date-filter${active ? " is-active" : ""}"
      data-incidencias-date-filter="true"
      data-date-filter-active="${active ? "true" : "false"}"
      data-date-from="${attr(vm.dateFrom)}"
      data-date-to="${attr(vm.dateTo)}"
    >
      <button
        type="button"
        class="incidencias-filter-pill incidencias-filter-pill--date${active ? " is-active" : ""}"
        data-incidencias-action="${INCIDENCIAS_ACTIONS.DATE_FILTER}"
        data-date-filter-action="open"
        aria-pressed="${active ? "true" : "false"}"
        aria-label="Filtrar incidencias por fecha"
      >
        ${icon("calendar")}
        <span>${escapeHtml(label)}</span>
      </button>

      ${
        active
          ? `
            <button
              type="button"
              class="incidencias-date-filter-clear"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_DATE_FILTER}"
              data-date-filter-action="clear"
              aria-label="Limpiar filtro de fecha"
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </span>
  `;
}

function renderFilters(vm = {}) {
  return `
    <div class="incidencias-filters" aria-label="Filtros y búsqueda de incidencias">
      <div class="incidencias-filter-pills" role="group" aria-label="Filtrar incidencias por estado">
        ${FILTERS.map((filter) => {
          const active = filter.key === vm.filter;
          const count = vm.filterCounts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="incidencias-filter-pill${active ? " is-active" : ""}"
              data-incidencias-action="${INCIDENCIAS_ACTIONS.FILTER}"
              data-filter="${attr(filter.key)}"
              data-filter-status="${attr(filter.key)}"
              aria-pressed="${active ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(formatNumber(count))}</strong>
            </button>
          `;
        }).join("")}

        <span class="incidencias-filter-divider" aria-hidden="true"></span>
        ${renderDateFilterButton(vm)}
      </div>

      ${renderSearch(vm)}
    </div>
  `;
}

/* =========================================================
   TABLE
========================================================= */

function renderTableColgroup() {
  return `
    <colgroup>
      ${INCIDENCIAS_TABLE_COLUMNS.map((column) => `
        <col
          class="incidencias-col ${attr(column.colClass)}"
          data-column="${attr(column.key)}"
        >
      `).join("")}
    </colgroup>
  `;
}

function renderTableHead() {
  return `
    <thead>
      <tr>
        ${INCIDENCIAS_TABLE_COLUMNS.map((column) => `
          <th
            class="${attr(column.thClass)}"
            scope="col"
            data-column="${attr(column.key)}"
          >
            ${escapeHtml(column.label)}
          </th>
        `).join("")}
      </tr>
    </thead>
  `;
}

function renderRow(item = {}, vm = {}) {
  const ticketId = getTicketId(item);
  const subject = getSubject(item);
  const description = getDescription(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item) || "Sin email";
  const createdAtRaw = getCreatedAt(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAt = formatDateTime(createdAtRaw);
  const updatedAt = formatLastUpdate(updatedAtRaw);
  const attachmentsCount = getAttachmentsCount(item);
  const category = getCategory(item);
  const statusKey = getStatusKey(getStatusRaw(item));
  const priorityKey = getPriorityKey(item);
  const opening = vm.openingTicketId === ticketId;

  return `
    <tr
      class="incidencias-row incidencias-row--${attr(statusKey)} incidencias-row--clickable${opening ? " is-loading" : ""}"
      data-ticket-row="true"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      data-detail-target="true"
      data-status="${attr(statusKey)}"
      data-priority="${attr(priorityKey)}"
      role="button"
      tabindex="0"
      aria-label="Abrir detalle de incidencia ${attr(ticketId)}"
      ${htmlAttrs({
        "aria-busy": opening ? "true" : false,
      })}
    >
      <td class="${attr(INCIDENCIAS_TABLE_COLUMNS[0].cellClass)}" data-column="main">
        <div class="incidencias-main">
          ${renderAvatar(item)}

          <div class="incidencias-main-copy">
            <div class="incidencias-ticket-line">
              <span class="incidencias-ticket-id">${escapeHtml(ticketId)}</span>
              <span class="incidencias-category-pill">${escapeHtml(category)}</span>
            </div>

            <div class="incidencias-ticket-subject">${escapeHtml(subject)}</div>
            <div class="incidencias-ticket-description">${escapeHtml(description)}</div>

            <div class="incidencias-client-line">
              <span class="incidencias-client-name">${escapeHtml(clientName)}</span>
              <span class="incidencias-client-separator">·</span>
              <span class="incidencias-client-email">${escapeHtml(clientEmail)}</span>
            </div>

            <div class="incidencias-row-badges">
              ${renderPriorityBadge(item)}
              ${renderAssignedBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="${attr(INCIDENCIAS_TABLE_COLUMNS[1].cellClass)}" data-column="status">
        ${renderStatusChip(item)}
      </td>

      <td class="${attr(INCIDENCIAS_TABLE_COLUMNS[2].cellClass)}" data-column="created">
        <span class="incidencias-date-inline" title="${attr(createdAt)}">
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="${attr(INCIDENCIAS_TABLE_COLUMNS[3].cellClass)}" data-column="updated">
        <span class="incidencias-date-inline" title="${attr(formatDateTime(updatedAtRaw))}">
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="${attr(INCIDENCIAS_TABLE_COLUMNS[4].cellClass)}" data-column="amount">
        ${renderImporteChip(item)}
      </td>

      <td class="${attr(INCIDENCIAS_TABLE_COLUMNS[5].cellClass)}" data-column="attachments">
        <span
          class="incidencias-attachments-pill"
          title="${attr(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
        >
          ${icon("paperclip")}
          <span>${escapeHtml(formatNumber(attachmentsCount))}</span>
        </span>
      </td>
    </tr>
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
  const filtering = vm.filter !== "all" || Boolean(vm.search) || vm.dateFilterActive === true;

  return `
    <div class="incidencias-empty" data-incidencias-empty="true">
      <div class="incidencias-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : icon("ticket")}
      </div>

      <h3>${hasError ? "No se pudieron cargar las incidencias" : filtering ? "No hay incidencias con esos filtros" : "Todavía no hay incidencias"}</h3>
      <p>
        ${
          hasError
            ? escapeHtml(vm.error)
            : filtering
              ? "Prueba a limpiar la búsqueda o cambia el filtro activo para volver al historial completo."
              : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos y facturación asociada."
        }
      </p>

      ${
        hasError
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
    vm.dateFilterActive ? `fecha “${getDateFilterLabel(vm)}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando incidencias..."
    : vm.filter !== "all" || vm.search || vm.dateFilterActive
      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${activeCriteria.length ? ` · ${activeCriteria.join(" · ")}` : ""}`
      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · ordenadas de más nuevas a más antiguas`;

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
    ...input,
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
      data-date-filter-active="${vm.dateFilterActive ? "true" : "false"}"
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
      data-date-filter-active="${vm.dateFilterActive ? "true" : "false"}"
      data-date-from="${attr(vm.dateFrom)}"
      data-date-to="${attr(vm.dateTo)}"
      data-loading="${vm.loading ? "true" : "false"}"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
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

/* =========================================================
   SNAPSHOT
========================================================= */

export function getIncidenciasTemplateSnapshot() {
  return {
    version: INCIDENCIAS_TEMPLATE_VERSION,

    actions: INCIDENCIAS_ACTIONS,
    filters: FILTERS,
    tableScale: TABLE_SCALE,
    tableColumns: INCIDENCIAS_TABLE_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      colClass: column.colClass,
      cellClass: column.cellClass,
    })),

    policy: {
      templateOnly: true,

      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStateExternal: true,
      noModelExternal: true,
      noListeners: true,
      noDomApi: true,
      noToast: true,

      preservesHeaderHero: true,
      removesOnlyEyebrowText: true,
      centralizedTableColumns: true,
      noActionsColumn: true,
      rowClickOpensDetail: true,
      noGenericDataActionDuplication: true,
      amountImporteClassCompatibility: true,
      fullHdNoActionsLayout: true,
      tableScale110: true,

      dateFilterButtonMarkup: true,
      dateFilterPureVmSupport: true,
      improvedBadgeSvgIcons: true,

      preservesTechnicianAvatarData: true,
      requesterEmailAliasCompatibility: true,
      technicianAvatarAliasCompatibility: true,
      blobAvatarSupport: true,

      externalModalIslands: true,
      doesNotRenderCreateModal: true,
      doesNotRenderDetailModal: true,

      tableMarkup: true,
      searchMarkup: true,
      filtersMarkup: true,
      infiniteFeedMarkup: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderIncidenciasViewTemplate = renderIncidenciasTemplate;
export const renderIncidenciasDashboardTemplate = renderIncidenciasTemplate;
export const renderIncidencias = renderIncidenciasTemplate;

export default renderIncidenciasTemplate;

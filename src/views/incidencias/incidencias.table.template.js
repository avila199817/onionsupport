/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   FINAL PRODUCTION TEMPLATE · LIST VIEW · EXTREME SAAS MODE · 12/10
   JS ONLY · NO CSS INLINE · NO <style> · CSP CLEAN · TOKEN READY

   RESPONSABILIDADES:
   - render del hero/header de incidencias
   - render de tabla productiva con paginación real
   - render de filtros visuales compatibles con state/props/bindings
   - render de búsqueda compatible con state/props/bindings
   - compatibilidad con IncidenciasView.js
   - estado loading visual en "Ver detalle" sin mover tabla
   - estado loading visual en "Crear nueva incidencia"
   - estado loading visual en refresh / retry / export
   - título compacto y responsive
   - fechas siempre en una sola línea
   - botón "Detalle" mantiene tamaño fijo durante loading
   - loader centrado dentro del botón sin cambiar layout
   - loading de tabla suave en carga / refresh
   - acciones compatibles con data-incidencias-action y data-action
   - pintar importe total de facturas asociadas al ticket
   - avatares fallback con tono pseudo-RNG estable por data-avatar-tone
   - avatar real del técnico actual en badge de asignación
   - fila completa clicable para abrir modal de detalle
   - dark/light mode 100% delegado a CSS externo
   - chips de estado alineados con tokens globales
   - tabla blindada por clases, no por CSS inline
   - diseño premium coherente con Facturas

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - responsive delegado al CSS externo
   - prioridad eliminada como columna, badge interno conservado
   - importe blindado contra normalizadores intermedios
   - loading inline icon-only centrado sin cambiar tamaño del botón
   - CSS aplicable a .incidencias-view-root y [data-incidencias-scope]
   - no usa eventos inline
   - no usa style=""
   - avatar de técnico compatible con payload rico o fallback local

   IMPORTANTE:
   - El CSS debe vivir en:
     src/css/views/incidencias.css
   - Este módulo no emite <style>, style="", ni eventos inline.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURRENCY = "EUR";
const AVATAR_TONE_COUNT = 10;

const CURRENT_TECHNICIAN_NAME = "Cristian Ávila Luque";
const CURRENT_TECHNICIAN_EMAIL = "avila199817@gmail.com";
const CURRENT_TECHNICIAN_USERNAME = "avila199817";
const CURRENT_TECHNICIAN_AVATAR_URL = "/src/media/img/Usuario.png";

const CURRENT_TECHNICIAN_MATCH_VALUES = Object.freeze([
  CURRENT_TECHNICIAN_NAME,
  "Cristian Avila Luque",
  CURRENT_TECHNICIAN_EMAIL,
  CURRENT_TECHNICIAN_USERNAME,
  "CA",
]);

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Abiertas" },
  { key: "closed", label: "Cerradas" },
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/\$/g, "")
      .replace(/£/g, "")
      .replace(/%/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      if (lastComma > lastDot) {
        normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const n = Number(normalized);

    return Number.isFinite(n) ? n : fallback;
  }

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
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
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

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hashString(value = "") {
  const text = safeText(value, "onion");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const esMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (esMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;

    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/* =========================================================
   FORMATTERS
========================================================= */

const moneyFormatterCache = new Map();
const dateTimeFormatterCache = new Map();

function getMoneyFormatter(currency = DEFAULT_CURRENCY) {
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  if (moneyFormatterCache.has(code)) {
    return moneyFormatterCache.get(code);
  }

  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  moneyFormatterCache.set(code, formatter);

  return formatter;
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = safeNumber(value, NaN);

  if (!Number.isFinite(amount)) return "—";

  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return getMoneyFormatter(code).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

function getDateTimeFormatter() {
  const key = "es-ES:date-time";

  if (dateTimeFormatterCache.has(key)) {
    return dateTimeFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  dateTimeFormatterCache.set(key, formatter);

  return formatter;
}

function getDateFormatter() {
  const key = "es-ES:date";

  if (dateTimeFormatterCache.has(key)) {
    return dateTimeFormatterCache.get(key);
  }

  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  dateTimeFormatterCache.set(key, formatter);

  return formatter;
}

function formatDateTime(value = null) {
  if (!value) return "—";

  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return getDateTimeFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  if (!value) return "—";

  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return getDateFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const ts = toTimestamp(value);
  if (!ts) return "Sin fecha";

  const diffMs = ts - Date.now();
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

  return formatDateShort(value);
}

function formatLastUpdate(value = null) {
  if (!value) return "Sin fecha";

  const ts = toTimestamp(value);
  if (!ts) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - ts) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    'aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getTicketId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id,
      item._id,
      raw.ticketId,
      raw.incidenciaId,
      raw.code,
      raw.numero,
      raw.ticketCode,
      raw.id,
      raw._id
    ),
    "INC-SIN-ID"
  );
}

function getSubject(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item.preview,
      raw.subject,
      raw.title,
      raw.asunto,
      raw.name,
      raw.preview
    ),
    "Incidencia sin asunto"
  );
}

function getDescription(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.body,
      item.preview,
      item.text,
      raw.description,
      raw.descripcion,
      raw.message,
      raw.body,
      raw.preview,
      raw.text
    ),
    "Sin descripción."
  );
}

function getClientName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.requesterName,
      item.requesterSnapshot?.name,
      item.requesterSnapshot?.displayName,
      item.createdBy?.name,
      item.createdBy?.displayName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.client?.name,
      item.customer?.name,
      item.receptor?.name,
      item.name,
      raw.clientName,
      raw.clienteNombre,
      raw.requesterName,
      raw.requesterSnapshot?.name,
      raw.requesterSnapshot?.displayName,
      raw.createdBy?.name,
      raw.createdBy?.displayName,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.client?.name,
      raw.customer?.name,
      raw.receptor?.name,
      raw.name
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.emailCliente,
      item.requesterSnapshot?.email,
      item.createdBy?.email,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.client?.email,
      item.customer?.email,
      item.receptor?.email,
      raw.clientEmail,
      raw.clienteEmail,
      raw.email,
      raw.emailCliente,
      raw.requesterSnapshot?.email,
      raw.createdBy?.email,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.client?.email,
      raw.customer?.email,
      raw.receptor?.email
    ),
    ""
  ).toLowerCase();
}

function getAvatarUrl(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.requesterSnapshot?.avatar,
      item.requesterSnapshot?.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.requesterSnapshot?.avatar,
      raw.requesterSnapshot?.avatarUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl,
      raw.customer?.avatar,
      raw.customer?.avatarUrl
    ),
    ""
  );
}

function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getAvatarTone(item = {}) {
  const ticketId = getTicketId(item);
  const clientName = getClientName(item);
  const seed = `${ticketId}|${clientName}`;

  return String(hashString(seed) % AVATAR_TONE_COUNT);
}

function getStatusRaw(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.status,
    item.estado,
    item.state,
    item.lifecycle?.status,
    raw.status,
    raw.estado,
    raw.state,
    raw.lifecycle?.status
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente", "new", "nueva", "nuevo", "created"].includes(key)) {
    return "pending";
  }

  if (["open", "abierta", "abierto"].includes(key)) {
    return "open";
  }

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) {
    return "resolved";
  }

  if (
    [
      "closed",
      "cerrada",
      "cerrado",
      "cancelled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
    ].includes(key)
  ) {
    return "closed";
  }

  return "pending";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return safeText(value, "Pendiente");
}

function getPriorityRaw(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.priority,
    item.prioridad,
    item.severity,
    item.urgency,
    item.sla?.priority,
    raw.priority,
    raw.prioridad,
    raw.severity,
    raw.urgency,
    raw.sla?.priority,
    "medium"
  );
}

function getPriorityKey(item = {}) {
  const key = normalizeKey(getPriorityRaw(item));

  if (["critical", "critica", "crítica", "critico", "crítico", "p0"].includes(key)) {
    return "critical";
  }

  if (["urgent", "urgente", "high", "alta", "p1"].includes(key)) {
    return "urgent";
  }

  if (["medium", "media", "normal", "p2"].includes(key)) {
    return "medium";
  }

  if (["low", "baja", "minor", "p3"].includes(key)) {
    return "low";
  }

  return "medium";
}

function getPriorityLabel(item = {}) {
  const key = getPriorityKey(item);

  if (key === "critical") return "Crítica";
  if (key === "urgent") return "Urgente";
  if (key === "medium") return "Media";
  if (key === "low") return "Baja";

  return "Media";
}

function getCategory(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.category,
      item.categoria,
      item.type,
      item.tipo,
      item.subcategory,
      item.subcategoria,
      raw.category,
      raw.categoria,
      raw.type,
      raw.tipo,
      raw.subcategory,
      raw.subcategoria
    ),
    "Soporte"
  );
}

function getAssignedTo(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.assignedTo?.name,
      item.assignedTo?.displayName,
      item.assignment?.agentName,
      item.assignment?.name,
      item.tecnico?.name,
      item.tecnico?.displayName,
      item.tecnico,
      item.agent,
      raw.assignedTo?.name,
      raw.assignedTo?.displayName,
      raw.assignment?.agentName,
      raw.assignment?.name,
      raw.tecnico?.name,
      raw.tecnico?.displayName,
      raw.tecnico,
      raw.agent
    ),
    "Sin asignar"
  );
}

function getAssignedEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.assignedTo?.email,
      item.assignedTo?.mail,
      item.assignment?.agentEmail,
      item.assignment?.email,
      item.tecnico?.email,
      item.tecnico?.mail,
      item.agentEmail,
      item.agent?.email,
      raw.assignedTo?.email,
      raw.assignedTo?.mail,
      raw.assignment?.agentEmail,
      raw.assignment?.email,
      raw.tecnico?.email,
      raw.tecnico?.mail,
      raw.agentEmail,
      raw.agent?.email
    ),
    ""
  ).toLowerCase();
}

function getAssignedId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.assignedTo?.id,
      item.assignedTo?.userId,
      item.assignedTo?.username,
      item.assignment?.agentId,
      item.assignment?.userId,
      item.tecnico?.id,
      item.tecnico?.userId,
      item.tecnico?.username,
      item.agentId,
      item.agent?.id,
      item.agent?.userId,
      raw.assignedTo?.id,
      raw.assignedTo?.userId,
      raw.assignedTo?.username,
      raw.assignment?.agentId,
      raw.assignment?.userId,
      raw.tecnico?.id,
      raw.tecnico?.userId,
      raw.tecnico?.username,
      raw.agentId,
      raw.agent?.id,
      raw.agent?.userId
    ),
    ""
  );
}

function getRuntimeUserAvatar(state = {}) {
  const runtime = safeObject(state);
  const user = safeObject(first(runtime.user, runtime.currentUser, runtime.sessionUser));
  const raw = safeObject(user.raw);

  return safeText(
    first(
      runtime.avatar,
      runtime.avatarUrl,
      runtime.userAvatar,
      runtime.userAvatarUrl,
      user.avatar,
      user.avatarUrl,
      user.photo,
      user.photoUrl,
      user.picture,
      user.image,
      raw.avatar,
      raw.avatarUrl,
      raw.photo,
      raw.photoUrl,
      raw.picture,
      raw.image
    ),
    ""
  );
}

function getAssignedAvatarUrl(item = {}, state = {}) {
  const raw = safeObject(item?.raw);

  const explicitAvatar = safeText(
    first(
      item.assignedTo?.avatar,
      item.assignedTo?.avatarUrl,
      item.assignedTo?.photo,
      item.assignedTo?.photoUrl,
      item.assignment?.agentAvatar,
      item.assignment?.avatar,
      item.assignment?.avatarUrl,
      item.tecnico?.avatar,
      item.tecnico?.avatarUrl,
      item.tecnico?.photo,
      item.tecnico?.photoUrl,
      item.agentAvatar,
      item.agent?.avatar,
      item.agent?.avatarUrl,
      raw.assignedTo?.avatar,
      raw.assignedTo?.avatarUrl,
      raw.assignedTo?.photo,
      raw.assignedTo?.photoUrl,
      raw.assignment?.agentAvatar,
      raw.assignment?.avatar,
      raw.assignment?.avatarUrl,
      raw.tecnico?.avatar,
      raw.tecnico?.avatarUrl,
      raw.tecnico?.photo,
      raw.tecnico?.photoUrl,
      raw.agentAvatar,
      raw.agent?.avatar,
      raw.agent?.avatarUrl
    ),
    ""
  );

  if (explicitAvatar) {
    return explicitAvatar;
  }

  if (isCurrentTechnicianAssigned(item, state)) {
    return safeText(getRuntimeUserAvatar(state), CURRENT_TECHNICIAN_AVATAR_URL);
  }

  return "";
}

function isCurrentTechnicianAssigned(item = {}, state = {}) {
  const assigned = normalizeText(getAssignedTo(item));
  const assignedEmail = normalizeText(getAssignedEmail(item));
  const assignedId = normalizeText(getAssignedId(item));

  const runtime = safeObject(state);
  const user = safeObject(first(runtime.user, runtime.currentUser, runtime.sessionUser));

  const runtimeValues = [
    user.name,
    user.displayName,
    user.fullName,
    user.email,
    user.username,
    user.userId,
    user.id,
    runtime.username,
    runtime.email,
    runtime.userId,
  ].map((value) => normalizeText(value));

  const knownValues = CURRENT_TECHNICIAN_MATCH_VALUES.map((value) => normalizeText(value));

  const candidates = [
    assigned,
    assignedEmail,
    assignedId,
  ].filter(Boolean);

  const matchesKnown = candidates.some((candidate) => {
    return knownValues.some((known) => {
      return known && (candidate === known || candidate.includes(known) || known.includes(candidate));
    });
  });

  if (matchesKnown) {
    return true;
  }

  const matchesRuntime = candidates.some((candidate) => {
    return runtimeValues.some((runtimeValue) => {
      return runtimeValue && (candidate === runtimeValue || candidate.includes(runtimeValue) || runtimeValue.includes(candidate));
    });
  });

  return matchesRuntime;
}

function getImporteAmount(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.total,
    item.amount,
    item.importe,
    item.price,
    item.facturasTotal,
    item.invoicesTotal,
    item.importeFacturas,
    item.invoiceTotal,
    item.linkedInvoices?.total,
    item.linkedInvoices?.amount,
    item.linkedInvoices?.importe,
    item.meta?.invoicesTotal,
    item.meta?.invoiceTotal,
    raw.total,
    raw.amount,
    raw.importe,
    raw.price,
    raw.facturasTotal,
    raw.invoicesTotal,
    raw.importeFacturas,
    raw.invoiceTotal,
    raw.linkedInvoices?.total,
    raw.linkedInvoices?.amount,
    raw.linkedInvoices?.importe,
    raw.meta?.invoicesTotal,
    raw.meta?.invoiceTotal
  );
}

function getImporteCurrency(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.currency,
      item.moneda,
      item.linkedInvoices?.currency,
      item.linkedInvoices?.moneda,
      item.meta?.invoiceCurrency,
      item.meta?.currency,
      item.meta?.moneda,
      raw.currency,
      raw.moneda,
      raw.linkedInvoices?.currency,
      raw.linkedInvoices?.moneda,
      raw.meta?.invoiceCurrency,
      raw.meta?.currency,
      raw.meta?.moneda,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  );
}

function getPaymentStatusKey(item = {}) {
  const raw = safeObject(item?.raw);

  const key = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.linkedInvoices?.paymentStatus,
      item.linkedInvoices?.estadoPago,
      raw.paymentStatus,
      raw.estadoPago,
      raw.linkedInvoices?.paymentStatus,
      raw.linkedInvoices?.estadoPago
    )
  );

  if (["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)) return "paid";
  if (["pending", "pendiente", "unpaid"].includes(key)) return "pending";
  if (["partial", "parcial", "pago_parcial"].includes(key)) return "partial";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";

  return "";
}

function getImporteLabel(item = {}) {
  const amount = getImporteAmount(item);

  if (amount !== null && amount !== undefined && amount !== "") {
    const numericAmount = safeNumber(amount, NaN);

    if (Number.isFinite(numericAmount)) {
      return formatMoney(numericAmount, getImporteCurrency(item));
    }
  }

  const paymentKey = getPaymentStatusKey(item);

  if (paymentKey === "paid") return "Pagado";
  if (paymentKey === "pending") return "Pendiente";
  if (paymentKey === "partial") return "Parcial";
  if (paymentKey === "overdue") return "Vencido";

  return "—";
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.createdAt,
    item.fechaCreacion,
    item.createdAtES,
    item.date,
    item.lifecycle?.createdAt,
    raw.createdAt,
    raw.fechaCreacion,
    raw.createdAtES,
    raw.date,
    raw.lifecycle?.createdAt
  );
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item.lifecycle?.updatedAt,
    item.lifecycle?.lastUpdateAt,
    item.audit?.updatedAt,
    raw.updatedAt,
    raw.lastUpdateAt,
    raw.ultimaNovedad,
    raw.modifiedAt,
    raw.closedAt,
    raw.createdAt,
    raw.lifecycle?.updatedAt,
    raw.lifecycle?.lastUpdateAt,
    raw.audit?.updatedAt
  );
}

function getSortTimestamp(item = {}) {
  const raw = safeObject(item?.raw);

  return (
    safeNumber(item?.meta?.updatedAtMs, 0) ||
    safeNumber(item?.meta?.timestampMs, 0) ||
    safeNumber(raw?.meta?.updatedAtMs, 0) ||
    safeNumber(raw?.meta?.timestampMs, 0) ||
    toTimestamp(getUpdatedAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    toTimestamp(raw?._ts) ||
    0
  );
}

function getAttachmentsCount(item = {}) {
  const raw = safeObject(item?.raw);

  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    raw.attachments,
    raw.files,
    raw.adjuntos
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      raw.attachmentsCount,
      raw.filesCount,
      raw.adjuntosCount,
      0
    ),
    0
  );
}

/* =========================================================
   STATUS LOGIC
========================================================= */

function compareIncidenciasNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getTicketId(b), "").localeCompare(safeText(getTicketId(a), ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortIncidenciasNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareIncidenciasNewestFirst);
}

function isClosedLike(item = {}) {
  return ["closed", "resolved"].includes(getStatusKey(getStatusRaw(item)));
}

function isOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(getStatusKey(getStatusRaw(item)));
}

function isUrgentLike(item = {}) {
  return ["urgent", "critical"].includes(getPriorityKey(item));
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (!key || key === "todos" || key === "todas") return "all";

  if (["all", "todo", "todos", "todas", "total", "totales"].includes(key)) {
    return "all";
  }

  if (
    [
      "open",
      "opened",
      "abierta",
      "abierto",
      "abiertas",
      "abiertos",
      "active",
      "activa",
      "activo",
      "activas",
      "activos",
      "pending",
      "pendiente",
      "pendientes",
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "open";
  }

  if (
    [
      "closed",
      "close",
      "cerrada",
      "cerrado",
      "cerradas",
      "cerrados",
      "resolved",
      "resuelta",
      "resuelto",
      "resueltas",
      "resueltos",
      "solved",
      "cancelled",
      "cancelada",
      "cancelado",
      "archived",
      "archivada",
      "archivado",
    ].includes(key)
  ) {
    return "closed";
  }

  return "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeFilter(
    first(
      data.filter,
      data.statusFilter,
      data.activeFilter,
      runtime.filter,
      runtime.statusFilter,
      runtime.activeFilter,
      "all"
    )
  );
}

function getFilterLabel(filter = "all") {
  const key = normalizeFilter(filter);

  return FILTERS.find((item) => item.key === key)?.label || "Todas";
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeWhitespace(
    first(
      data.search,
      data.searchQuery,
      data.query,
      data.q,
      data.term,
      data.keyword,
      runtime.search,
      runtime.searchQuery,
      runtime.query,
      runtime.q,
      runtime.term,
      runtime.keyword,
      ""
    )
  );
}

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);

  if (key === "all") return true;
  if (key === "open") return isOpenLike(item);
  if (key === "closed") return isClosedLike(item);

  return true;
}

function getSearchHaystack(item = {}) {
  const raw = safeObject(item?.raw);

  return [
    getTicketId(item),
    getSubject(item),
    getDescription(item),
    getClientName(item),
    getClientEmail(item),
    getCategory(item),
    getAssignedTo(item),
    getAssignedEmail(item),
    getStatusLabel(getStatusRaw(item)),
    getPriorityLabel(item),
    getImporteLabel(item),

    item.userId,
    item.clienteId,
    item.requesterId,
    item.createdBy?.id,
    item.createdBy?.userId,
    item.requesterSnapshot?.id,
    item.requesterSnapshot?.userId,

    raw.userId,
    raw.clienteId,
    raw.requesterId,
    raw.createdBy?.id,
    raw.createdBy?.userId,
    raw.requesterSnapshot?.id,
    raw.requesterSnapshot?.userId,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" · ");
}

function itemMatchesSearch(item = {}, query = "") {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  const haystack = getSearchHaystack(item);

  return terms.every((term) => haystack.includes(term));
}

function filterAndSortIncidencias(items = [], input = {}) {
  const activeFilter = getActiveFilter(input);
  const searchQuery = getSearchQuery(input);

  return sortIncidenciasNewestFirst(items).filter((item) => {
    return itemMatchesFilter(item, activeFilter) && itemMatchesSearch(item, searchQuery);
  });
}

function isFilterActive(input = {}) {
  return getActiveFilter(input) !== "all" || Boolean(getSearchQuery(input));
}

function computeFilterCounts(items = [], input = {}) {
  const rows = safeArray(items);
  const searchQuery = getSearchQuery(input);
  const searchableRows = rows.filter((item) => itemMatchesSearch(item, searchQuery));

  return FILTERS.reduce((acc, filter) => {
    acc[filter.key] = searchableRows.filter((item) =>
      itemMatchesFilter(item, filter.key)
    ).length;

    return acc;
  }, {});
}

/* =========================================================
   STATS / PAGINATION
========================================================= */

function computeStats(items = []) {
  const rows = safeArray(items);

  return rows.reduce(
    (acc, item) => {
      const amount = safeNumber(getImporteAmount(item), 0);

      acc.total += 1;
      acc.totalImporte += amount;
      acc.attachmentsCount += getAttachmentsCount(item);

      if (isOpenLike(item)) acc.openCount += 1;
      if (isClosedLike(item)) acc.closedCount += 1;
      if (isUrgentLike(item)) acc.urgentCount += 1;

      return acc;
    },
    {
      total: 0,
      openCount: 0,
      closedCount: 0,
      urgentCount: 0,
      attachmentsCount: 0,
      totalImporte: 0,
    }
  );
}

function normalizePageSize(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return clamp(
    safeNumber(
      first(
        data.pageSize,
        runtime.pageSize,
        runtime.limit,
        runtime.incidenciasPageSize,
        DEFAULT_PAGE_SIZE
      ),
      DEFAULT_PAGE_SIZE
    ),
    1,
    50
  );
}

function getPagination(items = [], input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const allItems = filterAndSortIncidencias(items, data);
  const pageSize = normalizePageSize(data);
  const filtering = isFilterActive(data);

  const remoteTotal = Math.max(
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.total,
        allItems.length
      ),
      allItems.length
    ),
    allItems.length
  );

  const reportedTotal = filtering ? allItems.length : remoteTotal;

  const totalPagesFromProps = filtering
    ? 0
    : safeNumber(first(data.totalPages, runtime.totalPages), 0);

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = clamp(
    safeNumber(
      first(data.page, runtime.page, runtime.currentPage, runtime.incidenciasPage, 1),
      1
    ),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    unfilteredCount: safeArray(items).length,
    remoteTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    filtering,
    activeFilter: getActiveFilter(data),
    searchQuery: getSearchQuery(data),
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="incidencias-inline-loading">
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="incidencias-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="incidencias-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="incidencias-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(item);
  const tone = getAvatarTone(item);

  if (avatarUrl) {
    return `
      <div
        class="incidencias-avatar"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
        data-avatar-tone="${escapeHtml(tone)}"
        data-has-avatar="true"
      >
        <img
          class="incidencias-avatar-img"
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          data-incidencias-avatar-img="true"
        />
        <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-avatar incidencias-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-tone="${escapeHtml(tone)}"
      data-fallback="true"
    >
      <span class="incidencias-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusRaw(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="incidencias-chip incidencias-chip--${escapeHtml(key)}">
      <span class="incidencias-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getPriorityKey(item);
  const label = getPriorityLabel(item);

  return `
    <span
      class="incidencias-mini-badge incidencias-mini-badge--${escapeHtml(key)}"
      title="${escapeHtml(`Prioridad ${label}`)}"
      data-tooltip="${escapeHtml(`Prioridad ${label}`)}"
    >
      ${key === "critical" || key === "urgent" ? icon("alert") : icon("activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAssignedAvatar(item = {}, state = {}) {
  const assigned = getAssignedTo(item);
  const assignedEmail = getAssignedEmail(item);
  const assignedAvatar = getAssignedAvatarUrl(item, state);
  const assignedInitials = getInitials(assigned);

  if (!assignedAvatar) {
    return `
      <span
        class="incidencias-agent-avatar incidencias-agent-avatar--icon"
        aria-hidden="true"
      >
        ${icon("users")}
      </span>
    `;
  }

  return `
    <span
      class="incidencias-agent-avatar incidencias-agent-avatar--image"
      title="${escapeHtml(assignedEmail || assigned)}"
      data-tooltip="${escapeHtml(assignedEmail || assigned)}"
      data-technician-avatar="true"
      data-current-technician="${isCurrentTechnicianAssigned(item, state) ? "true" : "false"}"
      aria-hidden="true"
    >
      <img
        class="incidencias-agent-avatar-img"
        src="${escapeHtml(assignedAvatar)}"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        draggable="false"
      />
      <span class="incidencias-agent-avatar-fallback">
        ${escapeHtml(assignedInitials)}
      </span>
    </span>
  `;
}

function renderAssignedBadge(item = {}, state = {}) {
  const assigned = getAssignedTo(item);
  const assignedEmail = getAssignedEmail(item);
  const isCurrent = isCurrentTechnicianAssigned(item, state);

  return `
    <span
      class="incidencias-mini-badge incidencias-mini-badge--agent${isCurrent ? " incidencias-mini-badge--current-agent" : ""}"
      title="${escapeHtml(`Técnico · ${assigned}${assignedEmail ? ` · ${assignedEmail}` : ""}`)}"
      data-tooltip="${escapeHtml(`Técnico · ${assigned}${assignedEmail ? ` · ${assignedEmail}` : ""}`)}"
      data-assigned-technician="${escapeHtml(assigned)}"
      data-assigned-email="${escapeHtml(assignedEmail)}"
      data-current-technician="${isCurrent ? "true" : "false"}"
    >
      ${renderAssignedAvatar(item, state)}
      ${escapeHtml(assigned)}
    </span>
  `;
}

function renderImporteChip(item = {}) {
  const label = getImporteLabel(item);
  const isMoney = /€|EUR|\$|USD|£|GBP/i.test(label);
  const paymentKey = getPaymentStatusKey(item) || "idle";

  if (isMoney) {
    return `
      <span class="incidencias-importe incidencias-importe--money incidencias-importe--${escapeHtml(paymentKey)}">
        ${icon("euro")}
        ${escapeHtml(label)}
      </span>
    `;
  }

  return `
    <span class="incidencias-importe incidencias-importe--status incidencias-importe--${escapeHtml(paymentKey)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionButton({
  action = "detail",
  ticketId = "",
  label = "Detalle",
  loadingLabel = "Cargando detalle",
  loading = false,
  disabled = false,
  iconName = "eye",
  tooltip = "",
} = {}) {
  const finalDisabled = disabled || loading;
  const finalTooltip = tooltip || label;

  return `
    <button
      type="button"
      class="incidencias-detail-btn${loading ? " is-loading" : ""}"
      data-incidencias-action="${escapeHtml(action)}"
      data-action="${escapeHtml(action === "detail" ? "open-ticket" : action)}"
      data-ticket-id="${escapeHtml(ticketId)}"
      data-incidencia-id="${escapeHtml(ticketId)}"
      title="${escapeHtml(finalTooltip)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${loading ? 'aria-busy="true"' : ""}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel)
          : `
            <span class="incidencias-action-icon">${icon(iconName)}</span>
            <span class="incidencias-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

/* =========================================================
   ROW / TABLE PARTIALS
========================================================= */

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);

  const ticketId = getTicketId(item);
  const subject = getSubject(item);
  const description = getDescription(item);
  const clientName = getClientName(item);
  const clientEmail = getClientEmail(item) || "Sin email";
  const createdAtRaw = getCreatedAt(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAt = formatDateTime(createdAtRaw);
  const updatedAt = formatLastUpdate(updatedAtRaw);
  const updatedAtFull = formatDateTime(updatedAtRaw);
  const attachmentsCount = getAttachmentsCount(item);
  const category = getCategory(item);
  const statusKey = getStatusKey(getStatusRaw(item));

  const openingTicketId = safeText(
    first(
      runtime.openingTicketId,
      runtime.openingIncidenciaId,
      runtime.detailTicketId,
      runtime.loadingTicketId
    ),
    ""
  );

  const isOpening = openingTicketId === ticketId;

  return `
    <tr
      class="incidencias-row incidencias-row--${escapeHtml(statusKey)} incidencias-row--clickable"
      data-ticket-row="true"
      data-ticket-id="${escapeHtml(ticketId)}"
      data-incidencia-id="${escapeHtml(ticketId)}"
      data-incidencias-action="detail"
      data-action="open-ticket"
      data-row-action="open-ticket"
      data-detail-target="true"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(`Abrir detalle de incidencia ${ticketId}`)}"
      title="${escapeHtml(`Abrir detalle de incidencia ${ticketId}`)}"
      data-tooltip="${escapeHtml(`Abrir detalle de incidencia ${ticketId}`)}"
    >
      <td class="incidencias-cell incidencias-cell--main">
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
              ${renderAssignedBadge(item, runtime)}
            </div>
          </div>
        </div>
      </td>

      <td class="incidencias-cell incidencias-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span
          class="incidencias-date-inline"
          title="${escapeHtml(createdAt)}"
          data-tooltip="${escapeHtml(createdAt)}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--date">
        <span
          class="incidencias-date-inline"
          title="${escapeHtml(updatedAtFull)}"
          data-tooltip="${escapeHtml(updatedAtFull)}"
        >
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--importe">
        ${renderImporteChip(item)}
      </td>

      <td class="incidencias-cell incidencias-cell--attachments">
        <span
          class="incidencias-attachments-pill"
          title="${escapeHtml(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
          data-tooltip="${escapeHtml(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
        >
          ${icon("paperclip")}
          ${escapeHtml(String(attachmentsCount))}
        </span>
      </td>

      <td class="incidencias-cell incidencias-cell--actions">
        ${renderActionButton({
          ticketId,
          loading: isOpening,
          label: "Detalle",
          loadingLabel: "Cargando detalle",
          iconName: "eye",
          tooltip: "Abrir detalle de incidencia",
        })}
      </td>
    </tr>
  `;
}

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  return `
    <div class="incidencias-pagination" aria-label="Paginación de incidencias">
      <button
        type="button"
        class="incidencias-pagination-btn"
        data-incidencias-action="prev-page"
        data-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <span class="incidencias-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="incidencias-pagination-btn incidencias-pagination-btn--next"
        data-incidencias-action="next-page"
        data-action="next-page"
        data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
        ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Siguiente
      </button>
    </div>
  `;
}

function renderSearch(input = {}) {
  const searchQuery = getSearchQuery(input);

  return `
    <div class="incidencias-search" role="search" aria-label="Buscar incidencias">
      <span class="incidencias-search-icon" aria-hidden="true">
        ${icon("search")}
      </span>

      <input
        id="incidencias-search-input"
        class="incidencias-search-input"
        type="search"
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar cliente, email, asunto, ID..."
        autocomplete="off"
        spellcheck="false"
        data-incidencias-action="search"
        data-action="search-incidencias"
        data-incidencias-search-input="true"
        aria-label="Buscar incidencias por cliente, email, asunto o identificador"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="incidencias-search-clear"
              data-incidencias-action="clear-search"
              data-action="clear-search"
              title="Limpiar búsqueda"
              data-tooltip="Limpiar búsqueda"
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

function renderFilters(input = {}, pagination = {}) {
  const data = safeObject(input);
  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));

  return `
    <div class="incidencias-filters" aria-label="Filtros y búsqueda de incidencias">
      <div class="incidencias-filter-pills">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="incidencias-filter-pill${isActive ? " is-active" : ""}"
              data-incidencias-action="filter"
              data-action="filter-incidencias"
              data-filter="${escapeHtml(filter.key)}"
              data-filter-status="${escapeHtml(filter.key)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(data)}
    </div>
  `;
}

function renderEmptyState({ hasError = false, filtering = false, searchQuery = "" } = {}) {
  return `
    <div class="incidencias-empty">
      <div class="incidencias-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : icon("ticket")}
      </div>

      <h3 class="incidencias-empty-title">
        ${
          hasError
            ? "No se pudieron cargar las incidencias"
            : filtering
              ? "No hay incidencias con este criterio"
              : "No hay incidencias para mostrar"
        }
      </h3>

      <p class="incidencias-empty-text">
        ${
          hasError
            ? "Puedes reintentar la carga desde el botón de actualizar."
            : filtering
              ? searchQuery
                ? `No se encontraron incidencias para “${escapeHtml(searchQuery)}”. Prueba con otro nombre, email, asunto o identificador.`
                : "Cambia el filtro activo para volver al historial completo."
              : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos, facturación asociada y acciones disponibles."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="incidencias-btn incidencias-btn--primary"
              data-incidencias-action="retry"
              data-action="retry"
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
                data-incidencias-action="clear-filters"
                data-action="clear-filters"
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

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  return `
    <div class="incidencias-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="incidencias-table-loading-row">
              <div class="incidencias-skeleton incidencias-skeleton--avatar"></div>

              <div class="incidencias-table-loading-copy">
                <div class="incidencias-skeleton incidencias-skeleton--xs"></div>
                <div class="incidencias-skeleton incidencias-skeleton--lg"></div>
                <div class="incidencias-skeleton incidencias-skeleton--md"></div>
              </div>

              <div class="incidencias-skeleton incidencias-skeleton--pill"></div>
              <div class="incidencias-skeleton incidencias-skeleton--date"></div>
              <div class="incidencias-skeleton incidencias-skeleton--date"></div>
              <div class="incidencias-skeleton incidencias-skeleton--amount"></div>
              <div class="incidencias-skeleton incidencias-skeleton--attach"></div>
              <div class="incidencias-skeleton incidencias-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="incidencias-refresh-overlay" aria-live="polite">
      <div class="incidencias-refresh-card">
        ${renderSpinner("Actualizando historial...")}
      </div>
    </div>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);

  const items = sortIncidenciasNewestFirst(
    safeArray(first(data.items, data.rows, data.tickets, data.incidencias))
  );

  const state = safeObject(data.state);
  const stats = computeStats(items);

  const remoteCount = Math.max(
    stats.total,
    safeNumber(
      first(data.remoteCount, data.totalCount, state.remoteCount, state.totalCount, stats.total),
      stats.total
    )
  );

  const updatedAt = first(
    data.lastUpdatedAt,
    state.lastSyncAt,
    data.updatedAt,
    state.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  const title = safeText(
    first(data.title, state.title, "Tus incidencias y solicitudes"),
    "Tus incidencias y solicitudes"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      state.subtitle,
      "Consulta el estado de tus incidencias, revisa las actualizaciones más recientes y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir."
    ),
    ""
  );

  const creating = Boolean(first(state.creating, state.creatingIncidencia, data.creating));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const loading = Boolean(first(state.loading, data.loading));

  return `
    <section class="incidencias-hero">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-page-title">${escapeHtml(title)}</h1>
          <p class="incidencias-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="incidencias-hero-actions">
          <button
            type="button"
            id="incidencias-refresh-btn"
            class="incidencias-btn${refreshing ? " is-loading" : ""}"
            data-incidencias-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="incidencias-btn-text">Actualizar</span>`
            }
          </button>

          <button
            type="button"
            id="incidencias-export-btn"
            class="incidencias-btn"
            data-incidencias-action="export"
            data-action="export-csv"
            ${loading || refreshing || !items.length ? "disabled" : ""}
          >
            ${icon("export")}
            <span class="incidencias-btn-text">Exportar historial</span>
          </button>

          <button
            type="button"
            id="incidencias-create-btn"
            class="incidencias-btn incidencias-btn--primary incidencias-btn--create${creating ? " is-loading" : ""}"
            data-incidencias-action="create"
            data-action="create-incidencia"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : `${icon("plus")}<span class="incidencias-btn-text">Crear incidencia</span>`
            }
          </button>
        </div>
      </div>

      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill">
          ${icon("ticket")}
          ${escapeHtml(`${remoteCount} solicitudes registradas`)}
        </span>

        <span class="incidencias-meta-pill">
          ${icon("refresh")}
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin actualizaciones recientes"
          }
        </span>

        <span class="incidencias-meta-pill">
          ${icon("paperclip")}
          ${escapeHtml(`${stats.attachmentsCount} adjuntos`)}
        </span>

        <span class="incidencias-meta-pill">
          ${icon("euro")}
          ${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}
        </span>
      </div>

      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open">
          <div class="incidencias-stat-label">Abiertas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.openCount))}</div>
          <div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--closed">
          <div class="incidencias-stat-label">Cerradas</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.closedCount))}</div>
          <div class="incidencias-stat-text">Casos resueltos, cerrados o archivados.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--urgent">
          <div class="incidencias-stat-label">Urgentes</div>
          <div class="incidencias-stat-value">${escapeHtml(String(stats.urgentCount))}</div>
          <div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div>
        </article>

        <article class="incidencias-stat-card incidencias-stat-card--amount">
          <div class="incidencias-stat-label">Importe asociado</div>
          <div class="incidencias-stat-value">${escapeHtml(formatMoney(stats.totalImporte, DEFAULT_CURRENCY))}</div>
          <div class="incidencias-stat-text">Total vinculado a facturas visibles.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR
========================================================= */

export function renderLoadingState() {
  return `
    <section class="incidencias-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(message = "No se pudieron cargar las incidencias.") {
  return `
    <section class="incidencias-error">
      <h3 class="incidencias-error-title">No se pudo renderizar la vista de incidencias</h3>
      <p class="incidencias-error-text">${escapeHtml(
        safeText(message, "Error desconocido al cargar la vista.")
      )}</p>
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

export function renderTable(input = {}) {
  const data = safeObject(input);

  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const state = safeObject(data.state);

  const pagination = getPagination(items, data);

  const loading = Boolean(first(state.loading, data.loading));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const hasError = Boolean(safeText(first(state.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  const activeFilterLabel = getFilterLabel(pagination.activeFilter);
  const searchQuery = pagination.searchQuery;

  const activeCriteria = [
    pagination.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando incidencias..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    <section class="incidencias-history">
      <div class="incidencias-history-head">
        <div class="incidencias-history-copy">
          <h2 class="incidencias-history-title">Historial de incidencias</h2>
          <p class="incidencias-history-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${renderPagination(pagination, state)}
        ${renderFilters(data, pagination)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="incidencias-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="incidencias-table-shell">
                      <table class="incidencias-table" role="table" aria-label="Listado de incidencias">
                        <colgroup>
                          <col class="incidencias-col incidencias-col--main">
                          <col class="incidencias-col incidencias-col--status">
                          <col class="incidencias-col incidencias-col--created">
                          <col class="incidencias-col incidencias-col--updated">
                          <col class="incidencias-col incidencias-col--importe">
                          <col class="incidencias-col incidencias-col--attachments">
                          <col class="incidencias-col incidencias-col--actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Incidencia / cliente</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Creación</th>
                            <th scope="col">Última novedad</th>
                            <th scope="col">Importe</th>
                            <th scope="col">Adj.</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderRow(item, state)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyState({
                      hasError,
                      filtering: pagination.filtering,
                      searchQuery,
                    })
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   ALIAS PARA COMPATIBILIDAD
========================================================= */

export const renderCards = renderTable;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderIncidenciasTableTemplate(input = {}) {
  const data = safeObject(input);

  const items = safeArray(first(data.items, data.rows, data.tickets, data.incidencias));
  const state = safeObject(data.state);

  if (state.error && !items.length) {
    return `
      <section class="incidencias-view-root" data-incidencias-scope="true">
        ${renderErrorState(state.error)}
      </section>
    `;
  }

  const payload = {
    ...data,
    items,
    state,
  };

  return `
    <section class="incidencias-view-root" data-incidencias-scope="true">
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderIncidenciasTableTemplate;

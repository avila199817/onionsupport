/* =========================================================
   Onion SPA - Clientes Table Template
   Archivo: src/views/clientes/clientes.table.template.js

   FINAL PRODUCTION TEMPLATE · CLIENTES VIEW · EXTREME SAAS MODE · 13/10
   CSP CLEAN · NO CSS IN JS · NO INLINE STYLE · TOKEN READY

   RESPONSABILIDADES:
   - render del hero/header de clientes
   - render de tabla productiva con paginación real
   - render de filtros visuales compatibles con state/props/bindings
   - render de búsqueda compatible con state/props/bindings
   - compatibilidad con clientesView.js
   - loading visual en detalle / nuevo cliente / refresh / retry / export
   - soporte para payloads backend heterogéneos y envelopes anidados
   - acciones compatibles con data-clientes-action y data-action
   - avatares fallback pseudo-RNG estables mediante clases
   - dark/light conectado a variables.css + ui.css desde CSS externo
   - chips de estado y nivel alineados con tokens globales desde CSS externo
   - tabla blindada por CSS externo contra reset/core/layout/ui global
   - row accent seguro por CSS externo sin pseudo-elementos sobre <tr>
   - límite fijo de 5 clientes por hoja
   - orden descendente por actualización / actividad / creación

   HARDENING PRO:
   - no depende de imports externos
   - tolera state + props directas
   - paginación defensiva
   - responsive delegado a /src/css/views/clientes/index.css
   - restricción admin no duplicada: la controla la View,
     pero soporta forbidden/accessDenied si se llama directamente
   - sin renderStyles()
   - sin <style>
   - sin style=""
   - sin handlers inline
========================================================= */


/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
  { key: "vip", label: "VIP" },
]);

const AVATAR_TONE_COUNT = 10;


/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

      normalized =
        lastComma > lastDot
          ? normalized.replace(/\./g, "").replace(/,/g, ".")
          : normalized.replace(/,/g, "");
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
    .replace(/[^\w:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function truncate(value = "", max = 96) {
  const text = normalizeWhitespace(value);
  const limit = Math.max(1, safeNumber(max, 96));

  if (!text) return "";
  if (text.length <= limit) return text;

  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
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

function clamp(value, min, max) {
  const n = safeNumber(value, min);
  return Math.min(Math.max(n, min), max);
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

function getNamedText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  if (typeof value !== "object") {
    return safeText(value, fallback);
  }

  const obj = safeObject(value);

  return safeText(
    first(
      obj.fullName,
      obj.displayName,
      obj.name,
      obj.nombre,
      obj.username,
      obj.userName,
      obj.email,
      obj.id,
      obj.userId,
      obj.codigo,
      obj.code
    ),
    fallback
  );
}

function isRenderableImageUrl(value = "") {
  const raw = safeText(value, "");
  if (!raw) return false;

  if (raw.startsWith("data:image/")) return true;
  if (raw.startsWith("blob:")) return true;
  if (raw.startsWith("/")) return true;
  if (raw.startsWith("./")) return true;
  if (raw.startsWith("../")) return true;

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}


/* =========================================================
   FORMATTERS
========================================================= */

const dateTimeFormatterCache = new Map();

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
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return getDateTimeFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return getDateFormatter().format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
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
  const ts = toTimestamp(value);

  if (!ts) return "Sin actualización";

  const diffHours = Math.abs(Date.now() - ts) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
}


/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    briefcase: `<svg ${common}><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect x="2" y="7" width="20" height="13" rx="2"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    mail: `<svg ${common}><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>`,
    map: `<svg ${common}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`,
    star: `<svg ${common}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  return icons[name] || "";
}


/* =========================================================
   BACKEND ENVELOPE
========================================================= */

function unwrapItemsEnvelope(value) {
  if (Array.isArray(value)) return value;

  const obj = safeObject(value);

  if (Array.isArray(obj.clientes)) return obj.clientes;
  if (Array.isArray(obj.clients)) return obj.clients;
  if (Array.isArray(obj.customers)) return obj.customers;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.records)) return obj.records;

  if (obj.data && typeof obj.data === "object") {
    return unwrapItemsEnvelope(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapItemsEnvelope(obj.payload);
  }

  if (obj.response && typeof obj.response === "object") {
    return unwrapItemsEnvelope(obj.response);
  }

  if (obj.result && typeof obj.result === "object") {
    return unwrapItemsEnvelope(obj.result);
  }

  if (obj.body && typeof obj.body === "object") {
    return unwrapItemsEnvelope(obj.body);
  }

  return [];
}

function getResolvedItems(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const candidates = [
    data.items,
    data.rows,
    data.clientes,
    data.clients,
    data.customers,
    data.data,
    data.results,
    data.records,
    data.payload,
    data.response,
    data.result,
    data.body,

    state.items,
    state.rows,
    state.clientes,
    state.clients,
    state.customers,
    state.data,
    state.results,
    state.records,
    state.payload,
    state.response,
    state.result,
    state.body,

    input,
  ];

  for (const candidate of candidates) {
    const rows = unwrapItemsEnvelope(candidate);

    if (rows.length) {
      return sortClientesNewestFirst(rows);
    }
  }

  return [];
}

function resolveRemoteCount(input = {}, items = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const payload = safeObject(first(data.payload, state.payload));
  const response = safeObject(first(data.response, state.response));
  const result = safeObject(first(data.result, state.result));
  const lastResponse = safeObject(first(data.lastResponse, state.lastResponse));
  const stats = safeObject(first(data.stats, state.stats));

  return Math.max(
    safeArray(items).length,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.count,
        data.total,
        state.remoteCount,
        state.totalCount,
        state.count,
        state.total,
        stats.total,
        payload.count,
        payload.total,
        response.count,
        response.total,
        result.count,
        result.total,
        lastResponse.count,
        lastResponse.total,
        safeArray(items).length
      ),
      safeArray(items).length
    )
  );
}

function shouldRenderRestricted(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return Boolean(
    data.forbidden === true ||
      data.accessDenied === true ||
      data.restricted === true ||
      state.forbidden === true ||
      state.accessDenied === true ||
      state.restricted === true
  );
}


/* =========================================================
   DATA PICKERS
========================================================= */

function getClienteId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientId,
      item.clienteId,
      item.customerId,
      item.id,
      item._id,
      item.code,
      item.clientCode,
      item.clienteCode,
      item.customerCode,
      item.email,
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.code,
      raw.clientCode,
      raw.clienteCode,
      raw.customerCode,
      raw.email
    ),
    ""
  );
}

function getClienteCode(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientCode,
      item.clienteCode,
      item.customerCode,
      item.clientId,
      item.clienteId,
      item.customerId,
      item.id,
      item._id,
      item.code,
      item.email,
      raw.clientCode,
      raw.clienteCode,
      raw.customerCode,
      raw.clientId,
      raw.clienteId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.code,
      raw.email
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientName,
      item.clienteName,
      item.customerName,
      item.nombre,
      item.name,
      item.fullName,
      item.displayName,
      item.company,
      item.empresa,
      item.businessName,
      item.razonSocial,
      item.cliente?.nombre,
      item.cliente?.name,
      item.client?.name,
      item.customer?.name,
      item.profile?.name,
      item.profile?.displayName,
      raw.clientName,
      raw.clienteName,
      raw.customerName,
      raw.nombre,
      raw.name,
      raw.fullName,
      raw.displayName,
      raw.company,
      raw.empresa,
      raw.businessName,
      raw.razonSocial,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.client?.name,
      raw.customer?.name,
      raw.profile?.name,
      raw.profile?.displayName,
      item.email,
      raw.email
    ),
    "Cliente"
  );
}

function getClienteDescription(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.description,
      item.descripcion,
      item.notes,
      item.tipo,
      item.segment,
      item.category,
      item.categoria,
      item.cliente?.phone,
      item.cliente?.telefono,
      item.client?.phone,
      item.customer?.phone,
      item.profile?.phone,
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.description,
      raw.descripcion,
      raw.notes,
      raw.tipo,
      raw.segment,
      raw.category,
      raw.categoria,
      raw.cliente?.phone,
      raw.cliente?.telefono,
      raw.client?.phone,
      raw.customer?.phone,
      raw.profile?.phone
    ),
    "Sin teléfono"
  );
}

function getClienteEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.customerEmail,
      item.email,
      item.mail,
      item.cliente?.email,
      item.client?.email,
      item.customer?.email,
      item.profile?.email,
      item.contact?.email,
      raw.clientEmail,
      raw.clienteEmail,
      raw.customerEmail,
      raw.email,
      raw.mail,
      raw.cliente?.email,
      raw.client?.email,
      raw.customer?.email,
      raw.profile?.email,
      raw.contact?.email
    ),
    "Sin email"
  ).toLowerCase();
}

function getClienteLocation(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.city,
      item.ciudad,
      item.locationCity,
      item.location?.city,
      item.location?.ciudad,
      item.ubicacion?.city,
      item.ubicacion?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,
      item.profile?.city,
      item.profile?.ciudad,
      item.cliente?.city,
      item.cliente?.ciudad,
      item.client?.city,
      item.client?.ciudad,
      item.customer?.city,
      item.customer?.ciudad,
      raw.city,
      raw.ciudad,
      raw.locationCity,
      raw.location?.city,
      raw.location?.ciudad,
      raw.ubicacion?.city,
      raw.ubicacion?.ciudad,
      raw.address?.city,
      raw.address?.ciudad,
      raw.direccion?.city,
      raw.direccion?.ciudad,
      raw.profile?.city,
      raw.profile?.ciudad,
      raw.cliente?.city,
      raw.cliente?.ciudad,
      raw.client?.city,
      raw.client?.ciudad,
      raw.customer?.city,
      raw.customer?.ciudad
    ),
    "Sin ciudad"
  );
}

function getClienteManager(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.managerName,
      item.responsableName,
      item.ownerName,
      item.assignedToName,
      item.accountManagerName,
      getNamedText(item.manager),
      getNamedText(item.assignedTo),
      getNamedText(item.owner),
      getNamedText(item.responsable),
      getNamedText(item.accountManager),
      raw.managerName,
      raw.responsableName,
      raw.ownerName,
      raw.assignedToName,
      raw.accountManagerName,
      getNamedText(raw.manager),
      getNamedText(raw.assignedTo),
      getNamedText(raw.owner),
      getNamedText(raw.responsable),
      getNamedText(raw.accountManager)
    ),
    "No asignado"
  );
}

function getClienteAvatarUrl(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clientAvatar,
      item.clientAvatarUrl,
      item.clienteAvatar,
      item.clienteAvatarUrl,
      item.customerAvatar,
      item.customerAvatarUrl,
      item.avatar,
      item.avatarUrl,
      item.logo,
      item.logoUrl,
      item.image,
      item.imageUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      item.profile?.avatar,
      item.profile?.avatarUrl,
      raw.clientAvatar,
      raw.clientAvatarUrl,
      raw.clienteAvatar,
      raw.clienteAvatarUrl,
      raw.customerAvatar,
      raw.customerAvatarUrl,
      raw.avatar,
      raw.avatarUrl,
      raw.logo,
      raw.logoUrl,
      raw.image,
      raw.imageUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl,
      raw.customer?.avatar,
      raw.customer?.avatarUrl,
      raw.profile?.avatar,
      raw.profile?.avatarUrl
    ),
    ""
  );
}

function getClienteInitials(item = {}) {
  const raw = safeObject(item?.raw);

  const text = normalizeWhitespace(
    first(
      item.clientInitials,
      item.clienteInitials,
      item.customerInitials,
      item.initials,
      raw.clientInitials,
      raw.clienteInitials,
      raw.customerInitials,
      raw.initials,
      getClienteName(item),
      getClienteCode(item),
      "CL"
    )
  );

  if (!text) return "CL";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "CL";
}

function getClienteAvatarTone(item = {}) {
  const seed = `${getClienteId(item)}|${getClienteEmail(item)}|${getClienteName(item)}`;
  return hashString(seed) % AVATAR_TONE_COUNT;
}

function getStatusValue(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.status,
    item.estado,
    item.state,
    item.accountStatus,
    item.clientStatus,
    item.customerStatus,
    item.lifecycle?.status,
    raw.status,
    raw.estado,
    raw.state,
    raw.accountStatus,
    raw.clientStatus,
    raw.customerStatus,
    raw.lifecycle?.status,
    typeof item.isActive === "boolean" ? (item.isActive ? "active" : "inactive") : null,
    typeof item.enabled === "boolean" ? (item.enabled ? "active" : "inactive") : null,
    typeof item.disabled === "boolean" ? (item.disabled ? "inactive" : "active") : null,
    typeof item.blocked === "boolean" ? (item.blocked ? "blocked" : null) : null,
    typeof raw.isActive === "boolean" ? (raw.isActive ? "active" : "inactive") : null,
    typeof raw.enabled === "boolean" ? (raw.enabled ? "active" : "inactive") : null,
    typeof raw.disabled === "boolean" ? (raw.disabled ? "inactive" : "active") : null,
    typeof raw.blocked === "boolean" ? (raw.blocked ? "blocked" : null) : null,
    "active"
  );
}

function getTierValue(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.tier,
    item.plan,
    item.segment,
    item.category,
    item.categoria,
    item.tipo,
    item.customerType,
    item.clientType,
    item.level,
    item.nivel,
    raw.tier,
    raw.plan,
    raw.segment,
    raw.category,
    raw.categoria,
    raw.tipo,
    raw.customerType,
    raw.clientType,
    raw.level,
    raw.nivel,
    "standard"
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["active", "activo", "activa", "enabled", "habilitado", "habilitada", "ok"].includes(key)) {
    return "active";
  }

  if (["pending", "pendiente", "invited", "invitado", "invitada", "invite", "new"].includes(key)) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "suspended",
      "suspendido",
      "suspendida",
      "locked",
      "restricted",
      "restringido",
      "restringida",
    ].includes(key)
  ) {
    return "blocked";
  }

  if (
    [
      "disabled",
      "inactive",
      "inactivo",
      "inactiva",
      "deshabilitado",
      "deshabilitada",
      "archived",
      "archivado",
      "archivada",
    ].includes(key)
  ) {
    return "inactive";
  }

  return "active";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "active") return "Activo";
  if (key === "pending") return "Pendiente";
  if (key === "blocked") return "Bloqueado";
  if (key === "inactive") return "Inactivo";

  return safeText(value, "Activo");
}

function getTierKey(value = "") {
  const key = normalizeKey(value);

  if (["vip", "priority", "prioritario", "prioritaria"].includes(key)) {
    return "vip";
  }

  if (
    [
      "enterprise",
      "empresa_enterprise",
      "empresa",
      "company",
      "corporate",
      "corporativo",
      "corporativa",
    ].includes(key)
  ) {
    return "enterprise";
  }

  if (["pro", "premium", "professional", "profesional"].includes(key)) {
    return "pro";
  }

  if (["starter", "basic", "basico", "básico", "trial"].includes(key)) {
    return "starter";
  }

  if (["particular", "personal", "standard", "estandar", "estándar"].includes(key)) {
    return "standard";
  }

  return "standard";
}

function getTierLabel(value = "") {
  const key = getTierKey(value);

  if (key === "vip") return "VIP";
  if (key === "enterprise") return "Enterprise";
  if (key === "pro") return "Pro";
  if (key === "starter") return "Starter";

  return "Estándar";
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.registeredAt,
    item.created,
    item.date,
    item.lifecycle?.createdAt,
    item.audit?.createdAt,
    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    raw.registeredAt,
    raw.created,
    raw.date,
    raw.lifecycle?.createdAt,
    raw.audit?.createdAt
  );
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.updatedAt,
    item.updated_at,
    item.lastContactAt,
    item.last_contact_at,
    item.modifiedAt,
    item.lastModifiedAt,
    item.lastActivityAt,
    item.activityAt,
    item.lifecycle?.updatedAt,
    item.audit?.updatedAt,
    item.createdAt,
    item.created_at,
    raw.updatedAt,
    raw.updated_at,
    raw.lastContactAt,
    raw.last_contact_at,
    raw.modifiedAt,
    raw.lastModifiedAt,
    raw.lastActivityAt,
    raw.activityAt,
    raw.lifecycle?.updatedAt,
    raw.audit?.updatedAt,
    raw.createdAt,
    raw.created_at
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

function compareClientesNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getClienteCode(b), "").localeCompare(
    safeText(getClienteCode(a), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function sortClientesNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareClientesNewestFirst);
}

function isActiveLike(item = {}) {
  return getStatusKey(getStatusValue(item)) === "active";
}

function isPendingLike(item = {}) {
  return getStatusKey(getStatusValue(item)) === "pending";
}

function isBlockedLike(item = {}) {
  return ["blocked", "inactive"].includes(getStatusKey(getStatusValue(item)));
}

function isVipLike(item = {}) {
  return ["vip", "enterprise"].includes(getTierKey(getTierValue(item)));
}


/* =========================================================
   FILTERS / SEARCH
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (!key || ["all", "todo", "todos", "todas", "total", "totales"].includes(key)) {
    return "all";
  }

  if (["active", "activo", "activa", "activos", "activas", "enabled", "habilitado"].includes(key)) {
    return "active";
  }

  if (["pending", "pendiente", "pendientes", "invited", "invitado", "invitada", "invite"].includes(key)) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "bloqueados",
      "bloqueadas",
      "inactive",
      "inactivo",
      "inactiva",
      "inactivos",
      "inactivas",
      "disabled",
      "deshabilitado",
      "deshabilitada",
      "suspended",
      "suspendido",
      "suspendida",
      "locked",
    ].includes(key)
  ) {
    return "blocked";
  }

  if (
    [
      "vip",
      "priority",
      "prioritario",
      "prioritaria",
      "enterprise",
      "empresa",
      "corporate",
      "corporativo",
      "corporativa",
    ].includes(key)
  ) {
    return "vip";
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
      data.tierFilter,
      runtime.filter,
      runtime.statusFilter,
      runtime.activeFilter,
      runtime.tierFilter,
      "all"
    )
  );
}

function getFilterLabel(filter = "all") {
  const key = normalizeFilter(filter);
  return FILTERS.find((item) => item.key === key)?.label || "Todos";
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
  if (key === "active") return isActiveLike(item);
  if (key === "pending") return isPendingLike(item);
  if (key === "blocked") return isBlockedLike(item);
  if (key === "vip") return isVipLike(item);

  return true;
}

function getSearchHaystack(item = {}) {
  const raw = safeObject(item?.raw);

  return [
    getClienteId(item),
    getClienteCode(item),
    getClienteName(item),
    getClienteDescription(item),
    getClienteEmail(item),
    getClienteLocation(item),
    getClienteManager(item),
    getStatusLabel(getStatusValue(item)),
    getTierLabel(getTierValue(item)),
    item.clientId,
    item.clienteId,
    item.customerId,
    item.company,
    item.empresa,
    item.razonSocial,
    item.phone,
    item.telefono,
    raw.clientId,
    raw.clienteId,
    raw.customerId,
    raw.company,
    raw.empresa,
    raw.razonSocial,
    raw.phone,
    raw.telefono,
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

function filterAndSortClientes(items = [], input = {}) {
  const activeFilter = getActiveFilter(input);
  const searchQuery = getSearchQuery(input);

  return sortClientesNewestFirst(items).filter((item) => {
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
    acc[filter.key] = searchableRows.filter((item) => itemMatchesFilter(item, filter.key)).length;
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
      acc.total += 1;

      if (isActiveLike(item)) acc.activeCount += 1;
      if (isPendingLike(item)) acc.pendingCount += 1;
      if (isBlockedLike(item)) acc.blockedCount += 1;
      if (isVipLike(item)) acc.vipCount += 1;

      return acc;
    },
    {
      total: 0,
      activeCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      vipCount: 0,
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
        runtime.clientesPageSize,
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

  const allItems = filterAndSortClientes(items, data);
  const pageSize = normalizePageSize(data);
  const filtering = isFilterActive(data);

  const remoteTotal = Math.max(
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        data.count,
        data.total,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.count,
        runtime.total,
        allItems.length
      ),
      allItems.length
    ),
    allItems.length
  );

  const reportedTotal = filtering ? allItems.length : remoteTotal;
  const totalPagesFromProps = filtering ? 0 : safeNumber(first(data.totalPages, runtime.totalPages), 0);

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = clamp(
    safeNumber(
      first(
        data.page,
        runtime.page,
        runtime.currentPage,
        runtime.clientesPage,
        1
      ),
      1
    ),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal ? Math.min(startIndex + pageItems.length, reportedTotal) : 0;

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
    <span class="clientes-inline-loading">
      <span class="clientes-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="clientes-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="clientes-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="clientes-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClienteName(item);
  const initials = getClienteInitials(item);
  const avatarUrl = getClienteAvatarUrl(item);
  const tone = getClienteAvatarTone(item);
  const hasImage = isRenderableImageUrl(avatarUrl);

  return `
    <div
      class="clientes-avatar clientes-avatar--tone-${escapeHtml(String(tone))}${hasImage ? " has-image" : " clientes-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-url="${escapeHtml(hasImage ? avatarUrl : "")}"
      data-has-avatar="${hasImage ? "true" : "false"}"
    >
      ${
        hasImage
          ? `
            <img
              class="clientes-avatar-img"
              src="${escapeHtml(avatarUrl)}"
              alt="${escapeHtml(fullName)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
          `
          : ""
      }

      <span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusValue(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="clientes-chip clientes-chip--${escapeHtml(key)}">
      <span class="clientes-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderTierChip(item = {}) {
  const rawTier = getTierValue(item);
  const key = getTierKey(rawTier);
  const label = getTierLabel(rawTier);

  return `
    <span class="clientes-chip clientes-chip--tier-${escapeHtml(key)}">
      <span class="clientes-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionButton({
  action = "detail",
  clienteId = "",
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
      class="clientes-detail-btn${loading ? " is-loading" : ""}"
      data-clientes-action="${escapeHtml(action)}"
      data-action="${escapeHtml(action === "detail" ? "open-cliente" : action)}"
      data-cliente-id="${escapeHtml(clienteId)}"
      data-client-id="${escapeHtml(clienteId)}"
      data-customer-id="${escapeHtml(clienteId)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      aria-label="${escapeHtml(finalTooltip)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${loading ? 'aria-busy="true"' : ""}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel)
          : `
            <span class="clientes-action-icon">${icon(iconName)}</span>
            <span class="clientes-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);

  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClienteDescription(item), 96);
  const email = getClienteEmail(item);
  const city = getClienteLocation(item);
  const manager = getClienteManager(item);
  const createdAtRaw = getCreatedAt(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAt = formatDateShort(createdAtRaw);
  const updatedAt = updatedAtRaw ? formatLastUpdate(updatedAtRaw) : "Sin actualización";
  const statusKey = getStatusKey(getStatusValue(item));

  const openingClienteId = safeText(
    first(
      runtime.openingClienteId,
      runtime.openingClientId,
      runtime.openingCustomerId,
      runtime.detailClienteId,
      runtime.detailClientId,
      runtime.loadingClienteId,
      runtime.loadingClientId
    ),
    ""
  );

  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <tr
      class="clientes-row clientes-row--${escapeHtml(statusKey)}"
      data-cliente-row="true"
      data-cliente-id="${escapeHtml(clienteId)}"
      data-client-id="${escapeHtml(clienteId)}"
      data-customer-id="${escapeHtml(clienteId)}"
    >
      <td class="clientes-cell clientes-cell--main">
        <div class="clientes-main">
          ${renderAvatar(item)}

          <div class="clientes-main-copy">
            <div class="clientes-client-line">
              <span class="clientes-client-id">${escapeHtml(code)}</span>
              <span class="clientes-role-pill">Cliente</span>
            </div>

            <div class="clientes-client-subject">${escapeHtml(name)}</div>
            <div class="clientes-client-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td class="clientes-cell clientes-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--tier">
        ${renderTierChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--date">
        <span
          class="clientes-date-inline"
          data-tooltip="${escapeHtml(formatDateTime(createdAtRaw))}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--email">
        <span
          class="clientes-email-inline"
          data-tooltip="${escapeHtml(email)}"
        >
          ${escapeHtml(email)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--location">
        <span
          class="clientes-location-inline"
          data-tooltip="${escapeHtml(city)}"
        >
          ${escapeHtml(city)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--manager">
        <span
          class="clientes-manager-inline"
          data-tooltip="${escapeHtml(manager)}"
        >
          ${escapeHtml(manager)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--activity">
        <span
          class="clientes-activity-inline"
          data-tooltip="${escapeHtml(updatedAtRaw ? formatDateTime(updatedAtRaw) : "Sin actualización")}"
        >
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--actions">
        ${renderActionButton({
          clienteId,
          loading: isOpening,
          label: "Detalle",
          loadingLabel: "Cargando detalle",
          iconName: "eye",
          tooltip: "Abrir detalle de cliente",
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
    <div class="clientes-pagination" aria-label="Paginación de clientes">
      <button
        type="button"
        class="clientes-pagination-btn"
        data-clientes-action="prev-page"
        data-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <span class="clientes-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="clientes-pagination-btn clientes-pagination-btn--next"
        data-clientes-action="next-page"
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
    <div class="clientes-search" role="search" aria-label="Buscar clientes">
      <span class="clientes-search-icon" aria-hidden="true">
        ${icon("search")}
      </span>

      <input
        id="clientes-search-input"
        class="clientes-search-input"
        type="search"
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar nombre, email, ciudad, responsable, teléfono, ID..."
        autocomplete="off"
        spellcheck="false"
        data-clientes-action="search"
        data-action="search-clientes"
        data-clientes-search-input="true"
        aria-label="Buscar clientes por nombre, email, ciudad, responsable, teléfono o identificador"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="clientes-search-clear"
              data-clientes-action="clear-search"
              data-action="clear-search"
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
  const items = getResolvedItems(data);
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));

  return `
    <div class="clientes-filters" aria-label="Filtros y búsqueda de clientes">
      <div class="clientes-filter-pills">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="clientes-filter-pill${isActive ? " is-active" : ""}"
              data-clientes-action="filter"
              data-action="filter-clientes"
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

function renderEmptyContent({
  hasError = false,
  filtering = false,
  searchQuery = "",
  message = "",
  restricted = false,
} = {}) {
  if (restricted) {
    return `
      <div class="clientes-empty clientes-empty--forbidden">
        <div class="clientes-empty-icon" aria-hidden="true">${icon("shield")}</div>
        <h3 class="clientes-empty-title">Acceso restringido</h3>
        <p class="clientes-empty-text">La vista de clientes está reservada para administradores.</p>
      </div>
    `;
  }

  return `
    <div class="clientes-empty">
      <div class="clientes-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : icon("briefcase")}
      </div>

      <h3 class="clientes-empty-title">
        ${
          hasError
            ? "No se pudieron cargar los clientes"
            : filtering
              ? "No hay clientes con este criterio"
              : "No hay clientes para mostrar"
        }
      </h3>

      <p class="clientes-empty-text">
        ${
          hasError
            ? escapeHtml(safeText(message, "Puedes reintentar la carga desde el botón de actualizar."))
            : filtering
              ? searchQuery
                ? `No se encontraron clientes para “${escapeHtml(searchQuery)}”. Prueba con otro nombre, email, ciudad, responsable o identificador.`
                : "Cambia el filtro activo para volver al listado completo."
              : "Cuando haya clientes registrados aparecerán aquí con su estado, nivel, alta, email, ciudad, responsable, última actualización y acciones disponibles."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="clientes-btn clientes-btn--primary"
              data-clientes-action="retry"
              data-action="retry"
            >
              ${icon("refresh")}
              <span class="clientes-btn-text">Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="clientes-btn"
                data-clientes-action="clear-filters"
                data-action="clear-filters"
              >
                ${icon("close")}
                <span class="clientes-btn-text">Limpiar filtros</span>
              </button>
            `
            : `
              <button
                type="button"
                class="clientes-btn clientes-btn--primary clientes-btn--create"
                data-clientes-action="create"
                data-action="create-cliente"
              >
                ${icon("plus")}
                <span class="clientes-btn-text">Crear cliente</span>
              </button>
            `
      }
    </div>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  const totalRows = Math.max(1, safeNumber(rows, DEFAULT_PAGE_SIZE));

  return `
    <div class="clientes-table-loading" aria-hidden="true">
      ${Array.from({ length: totalRows })
        .map(
          () => `
            <div class="clientes-table-loading-row">
              <div class="clientes-skeleton clientes-skeleton--avatar"></div>

              <div class="clientes-table-loading-copy">
                <div class="clientes-skeleton clientes-skeleton--xs"></div>
                <div class="clientes-skeleton clientes-skeleton--lg"></div>
                <div class="clientes-skeleton clientes-skeleton--md"></div>
              </div>

              <div class="clientes-skeleton clientes-skeleton--pill"></div>
              <div class="clientes-skeleton clientes-skeleton--pill"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--email"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="clientes-refresh-overlay" aria-live="polite">
      <div class="clientes-refresh-card">
        ${renderSpinner("Actualizando clientes...")}
      </div>
    </div>
  `;
}


/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  const stats = computeStats(items);
  const remoteCount = resolveRemoteCount(data, items);

  const updatedAt = first(
    data.lastUpdatedAt,
    data.updatedAt,
    state.lastSyncAt,
    state.lastUpdatedAt,
    state.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  const title = safeText(
    first(data.title, state.title, "Centro de control de clientes"),
    "Centro de control de clientes"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      state.subtitle,
      "Consulta clientes registrados, revisa su estado, nivel de cuenta, responsable y última actualización desde una vista clara, compacta y alineada con el sistema."
    ),
    ""
  );

  const creating = Boolean(first(state.creating, state.creatingCliente, data.creating));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const loading = Boolean(first(state.loading, data.loading));
  const exporting = Boolean(first(state.exporting, data.exporting));

  return `
    <section class="clientes-hero">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-page-title">${escapeHtml(title)}</h1>
          <p class="clientes-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="clientes-hero-actions">
          <button
            type="button"
            id="clientes-refresh-btn"
            class="clientes-btn${refreshing ? " is-loading" : ""}"
            data-clientes-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="clientes-btn-text">Actualizar</span>`
            }
          </button>

          <button
            type="button"
            id="clientes-export-btn"
            class="clientes-btn${exporting ? " is-loading" : ""}"
            data-clientes-action="export"
            data-action="export-csv"
            ${loading || refreshing || exporting || !items.length ? 'disabled aria-disabled="true"' : ""}
          >
            ${
              exporting
                ? renderSpinner("Exportando...")
                : `${icon("export")}<span class="clientes-btn-text">Exportar CSV</span>`
            }
          </button>

          <button
            type="button"
            id="clientes-create-btn"
            class="clientes-btn clientes-btn--primary clientes-btn--create${creating ? " is-loading" : ""}"
            data-clientes-action="create"
            data-action="create-cliente"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : `${icon("plus")}<span class="clientes-btn-text">Nuevo cliente</span>`
            }
          </button>
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill">
          ${icon("shield")}
          Panel admin
        </span>

        <span class="clientes-meta-pill">
          ${icon("briefcase")}
          ${escapeHtml(`${remoteCount} clientes registrados`)}
        </span>

        <span class="clientes-meta-pill">
          ${icon("refresh")}
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin sincronización reciente"
          }
        </span>

        <span class="clientes-meta-pill">
          ${icon("star")}
          ${escapeHtml(`${stats.vipCount} prioritarios`)}
        </span>
      </div>

      <div class="clientes-stats">
        <article class="clientes-stat-card clientes-stat-card--total">
          <div class="clientes-stat-label">Clientes visibles</div>
          <div class="clientes-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="clientes-stat-text">Registros cargados en la colección actual.</div>
        </article>

        <article class="clientes-stat-card clientes-stat-card--active">
          <div class="clientes-stat-label">Activos</div>
          <div class="clientes-stat-value">${escapeHtml(String(stats.activeCount))}</div>
          <div class="clientes-stat-text">Cuentas operativas o habilitadas actualmente.</div>
        </article>

        <article class="clientes-stat-card clientes-stat-card--pending">
          <div class="clientes-stat-label">Pendientes</div>
          <div class="clientes-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="clientes-stat-text">Cuentas pendientes de completar o revisar.</div>
        </article>

        <article class="clientes-stat-card clientes-stat-card--blocked">
          <div class="clientes-stat-label">Bloqueados / VIP</div>
          <div class="clientes-stat-value">${escapeHtml(`${stats.blockedCount} / ${stats.vipCount}`)}</div>
          <div class="clientes-stat-text">Cuentas restringidas y clientes prioritarios.</div>
        </article>
      </div>
    </section>
  `;
}


/* =========================================================
   LOADING / ERROR
========================================================= */

export function renderLoadingState(options = {}) {
  const rows =
    typeof options === "number"
      ? options
      : safeNumber(options?.rows, DEFAULT_PAGE_SIZE);

  return `
    <section class="clientes-history">
      ${renderTableLoading(Math.max(3, safeNumber(rows, DEFAULT_PAGE_SIZE)))}
    </section>
  `;
}

export function renderErrorState(message = "No se pudieron cargar los clientes.") {
  return `
    <section class="clientes-error">
      <h3 class="clientes-error-title">No se pudo renderizar la vista de clientes</h3>
      <p class="clientes-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

export function renderAccessDeniedState() {
  return `
    <section class="clientes-history">
      ${renderEmptyContent({ restricted: true })}
    </section>
  `;
}

export function renderEmptyClientesState(options = {}) {
  return `
    <section class="clientes-history">
      ${renderEmptyContent(options)}
    </section>
  `;
}


/* =========================================================
   TABLE
========================================================= */

export function renderTable(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  const pagination = getPagination(items, {
    ...data,
    remoteCount: resolveRemoteCount(data, items),
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const loading = Boolean(first(state.loading, data.loading));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const hasError = Boolean(safeText(first(state.error, data.error), ""));
  const errorMessage = safeText(first(state.error, data.error), "");

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  const activeFilterLabel = getFilterLabel(pagination.activeFilter);
  const searchQuery = pagination.searchQuery;

  const activeCriteria = [
    pagination.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando clientes..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    <section class="clientes-history">
      <div class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">
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
            <div class="clientes-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="clientes-table-shell">
                      <table class="clientes-table" role="table" aria-label="Listado de clientes">
                        <colgroup>
                          <col class="clientes-table-col clientes-table-col--main">
                          <col class="clientes-table-col clientes-table-col--status">
                          <col class="clientes-table-col clientes-table-col--tier">
                          <col class="clientes-table-col clientes-table-col--date">
                          <col class="clientes-table-col clientes-table-col--email">
                          <col class="clientes-table-col clientes-table-col--location">
                          <col class="clientes-table-col clientes-table-col--manager">
                          <col class="clientes-table-col clientes-table-col--activity">
                          <col class="clientes-table-col clientes-table-col--actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Cliente</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Nivel</th>
                            <th scope="col">Alta</th>
                            <th scope="col">Email</th>
                            <th scope="col">Ciudad</th>
                            <th scope="col">Responsable</th>
                            <th scope="col">Actualización</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderRow(item, state)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyContent({
                      hasError,
                      filtering: pagination.filtering,
                      searchQuery,
                      message: errorMessage,
                    })
              }
            </div>
          `
      }
    </section>
  `;
}


/* =========================================================
   BACKWARD COMPAT EXPORTS
========================================================= */

export function renderEmptyState(options = {}) {
  return `
    <section class="clientes-history">
      ${renderEmptyContent({
        hasError: Boolean(options?.hasError),
        filtering: Boolean(options?.filtering),
        searchQuery: safeText(options?.searchQuery, ""),
        message: safeText(options?.message, ""),
      })}
    </section>
  `;
}

export const renderCards = renderTable;


/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderClientesTableTemplate(input = {}) {
  const data = safeObject(input);

  if (shouldRenderRestricted(data)) {
    return `
      <section class="clientes-view-root" data-clientes-scope="true">
        ${renderAccessDeniedState()}
      </section>
    `;
  }

  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  if (state.error && !items.length) {
    return `
      <section class="clientes-view-root" data-clientes-scope="true">
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
    <section class="clientes-view-root" data-clientes-scope="true">
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}


/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderClientesTableTemplate;

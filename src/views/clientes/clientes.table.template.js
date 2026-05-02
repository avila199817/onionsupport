/* =========================================================
   Onion SPA - Clientes Table Template
   Archivo: src/views/clientes/clientes.table.template.js

   FINAL PRODUCTION TEMPLATE · CLIENTES VIEW · EXTREME SAAS MODE · 12/10
   ALIGNED WITH INCIDENCIAS / USUARIOS / FACTURAS · PRO SAAS PANEL

   RESPONSABILIDADES:
   - render del hero/header de clientes
   - render de tabla productiva con paginación real
   - render de filtros visuales compatibles con state/props/bindings
   - render de búsqueda compatible con state/props/bindings
   - compatibilidad con clientesView.js
   - loading visual en detalle / nuevo cliente / refresh / retry / export
   - soporte para payloads backend heterogéneos y envelopes anidados
   - acciones compatibles con data-clientes-action y data-action
   - avatares fallback pseudo-RNG estables
   - dark/light conectado a variables.css + ui.css
   - chips de estado y nivel alineados con tokens globales
   - tabla blindada contra reset/core/layout/ui global
   - row accent seguro sin pseudo-elementos sobre <tr>
   - límite fijo de 5 clientes por hoja
   - orden descendente por actualización / actividad / creación

   HARDENING PRO:
   - no depende de imports externos
   - tolera state + props directas
   - paginación defensiva
   - responsive robusto
   - restricción admin no duplicada: la controla la View, pero soporta forbidden/accessDenied
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;
const STYLE_ID = "onion-clientes-table-template-styles-v13";

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
  { key: "vip", label: "VIP" },
]);

/* =========================================================
   HELPERS
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
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

  if (!text) return "";
  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
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

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
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

  if (obj.data && typeof obj.data === "object") return unwrapItemsEnvelope(obj.data);
  if (obj.payload && typeof obj.payload === "object") return unwrapItemsEnvelope(obj.payload);
  if (obj.response && typeof obj.response === "object") return unwrapItemsEnvelope(obj.response);
  if (obj.result && typeof obj.result === "object") return unwrapItemsEnvelope(obj.result);
  if (obj.body && typeof obj.body === "object") return unwrapItemsEnvelope(obj.body);

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
   AVATAR PALETTE
========================================================= */

const AVATAR_PALETTE = Object.freeze([
  ["#7c3aed", "#ec4899"],
  ["#2563eb", "#06b6d4"],
  ["#f97316", "#ef4444"],
  ["#16a34a", "#14b8a6"],
  ["#db2777", "#9333ea"],
  ["#ca8a04", "#ea580c"],
  ["#0891b2", "#4f46e5"],
  ["#e11d48", "#f59e0b"],
  ["#0f766e", "#84cc16"],
  ["#4338ca", "#c026d3"],
]);

function getAvatarStyle(item = {}) {
  const seed = `${getClienteId(item)}|${getClienteEmail(item)}|${getClienteName(item)}`;
  const [a, b] = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];

  return [
    `--clientes-avatar-a:${a}`,
    `--clientes-avatar-b:${b}`,
    `--clientes-avatar-bg:linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
  ].join(";");
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

  if (["vip", "priority", "prioritario", "prioritaria"].includes(key)) return "vip";

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

  if (["pro", "premium", "professional", "profesional"].includes(key)) return "pro";
  if (["starter", "basic", "basico", "básico", "trial"].includes(key)) return "starter";

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

  if (!key || ["all", "todo", "todos", "todas", "total", "totales"].includes(key)) return "all";

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

function renderMaybeStyles(includeStyles = false) {
  return includeStyles ? renderStyles() : "";
}

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
      title="${escapeHtml(label)}"
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
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="clientes-avatar"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
        style="${escapeHtml(avatarStyle)}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        />
        <span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="clientes-avatar clientes-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
    >
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
      title="${escapeHtml(finalTooltip)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
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
          title="${escapeHtml(formatDateTime(createdAtRaw))}"
          data-tooltip="${escapeHtml(formatDateTime(createdAtRaw))}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--email">
        <span
          class="clientes-email-inline"
          title="${escapeHtml(email)}"
          data-tooltip="${escapeHtml(email)}"
        >
          ${escapeHtml(email)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--location">
        <span
          class="clientes-location-inline"
          title="${escapeHtml(city)}"
          data-tooltip="${escapeHtml(city)}"
        >
          ${escapeHtml(city)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--manager">
        <span
          class="clientes-manager-inline"
          title="${escapeHtml(manager)}"
          data-tooltip="${escapeHtml(manager)}"
        >
          ${escapeHtml(manager)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--activity">
        <span
          class="clientes-activity-inline"
          title="${escapeHtml(updatedAtRaw ? formatDateTime(updatedAtRaw) : "Sin actualización")}"
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
  return `
    <div class="clientes-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
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
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style id="${STYLE_ID}">
      :where(.clientes-view-root, [data-clientes-scope]){
        --cli-row-accent:var(--accent, #6f59d9);
        --cli-row-accent-soft:var(--accent-soft, rgba(111,89,217,.12));
        --cli-create-bg:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #6f59d9 0%, #5f45d8 55%, #4f37bf 100%)));
        --cli-create-bg-hover:var(--cli-create-bg);
        --cli-create-border:var(--btn-primary-border, color-mix(in srgb, var(--accent, #6f59d9) 46%, transparent));
        --cli-table-row-height:88px;

        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
        min-inline-size:0;
        inline-size:100%;
        max-inline-size:100%;
        container-type:inline-size;
      }

      :where(.clientes-view-root, [data-clientes-scope]) *,
      :where(.clientes-view-root, [data-clientes-scope]) *::before,
      :where(.clientes-view-root, [data-clientes-scope]) *::after{
        box-sizing:border-box;
      }

      .clientes-hero{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 12%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 10%, transparent), transparent 34%),
          radial-gradient(circle at 68% 110%, color-mix(in srgb, var(--success, #22c55e) 7%, transparent), transparent 36%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
        padding:var(--space-xl, 22px) var(--space-xl, 24px);
        isolation:isolate;
        min-inline-size:0;
        max-inline-size:100%;
      }

      .clientes-hero::after{
        content:"";
        position:absolute;
        inset:auto -8% -38% 48%;
        block-size:220px;
        pointer-events:none;
        background:radial-gradient(circle, color-mix(in srgb, var(--accent, #6f59d9) 10%, transparent), transparent 68%);
        filter:blur(10px);
        opacity:.82;
        z-index:0;
      }

      .clientes-hero > *{
        position:relative;
        z-index:1;
      }

      .clientes-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .clientes-hero-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .clientes-page-title{
        margin:0;
        max-inline-size:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, 1.08);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
      }

      .clientes-page-subtitle{
        margin:0;
        max-inline-size:900px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .clientes-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .clientes-btn{
        appearance:none;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--btn-radius, var(--radius-md, 13px));
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        text-decoration:none;
        white-space:nowrap;
        box-shadow:var(--btn-secondary-shadow, var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-btn svg{
        inline-size:16px;
        block-size:16px;
      }

      .clientes-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .clientes-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .clientes-btn--primary,
      .clientes-btn--create{
        border-color:var(--cli-create-border);
        background:var(--cli-create-bg);
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:
          0 12px 28px color-mix(in srgb, var(--accent, #6f59d9), transparent 78%),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.10));
      }

      .clientes-btn--primary:hover,
      .clientes-btn--create:hover{
        transform:translateY(-2px);
        border-color:var(--cli-create-border);
        background:var(--cli-create-bg-hover);
        color:var(--btn-primary-text, #ffffff);
        box-shadow:
          0 16px 34px color-mix(in srgb, var(--accent, #6f59d9), transparent 74%),
          0 0 0 1px color-mix(in srgb, var(--text-on-accent, #ffffff) 18%, transparent) inset;
      }

      .clientes-btn:focus-visible,
      .clientes-detail-btn:focus-visible,
      .clientes-pagination-btn:focus-visible,
      .clientes-filter-pill:focus-visible,
      .clientes-search-input:focus-visible,
      .clientes-search-clear:focus-visible{
        outline:none;
        box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
      }

      .clientes-btn.is-loading,
      .clientes-detail-btn.is-loading{
        cursor:wait;
        opacity:.94;
      }

      .clientes-btn:disabled,
      .clientes-btn[aria-disabled="true"],
      .clientes-detail-btn:disabled,
      .clientes-detail-btn[aria-disabled="true"]{
        pointer-events:none;
        opacity:.54;
        filter:saturate(.75);
      }

      .clientes-hero-meta{
        margin-block-start:var(--space-md, 14px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .clientes-meta-pill{
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--badge-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .clientes-meta-pill svg{
        inline-size:14px;
        block-size:14px;
      }

      .clientes-stats{
        margin-block-start:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .clientes-stat-card{
        --cli-stat-color:var(--accent, #6f59d9);

        position:relative;
        display:grid;
        gap:var(--space-xs, 8px);
        min-block-size:calc(124px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
        overflow:hidden;
      }

      .clientes-stat-card::after{
        content:"";
        position:absolute;
        inset:auto -20% -44% auto;
        inline-size:120px;
        block-size:120px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--cli-stat-color) 16%, transparent);
        filter:blur(8px);
      }

      .clientes-stat-card--total{
        --cli-stat-color:var(--accent, #6f59d9);
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .clientes-stat-card--active{
        --cli-stat-color:var(--success, #22c55e);
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .clientes-stat-card--pending{
        --cli-stat-color:var(--warning, #f59e0b);
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .clientes-stat-card--blocked{
        --cli-stat-color:var(--error, #ef4444);
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .clientes-stat-label{
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .clientes-stat-value{
        font-size:clamp(28px, 3vw, var(--font-5xl, 40px));
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
        color:var(--text-strong, #ffffff);
      }

      .clientes-stat-text{
        font-size:var(--font-base, 14px);
        line-height:var(--line-normal, 1.42);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .clientes-history{
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
        min-inline-size:0;
        max-inline-size:100%;
      }

      .clientes-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .clientes-history-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .clientes-history-title{
        margin:0;
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
        color:var(--section-title-color, var(--text-strong, #ffffff));
      }

      .clientes-history-subtitle{
        margin:0;
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
      }

      .clientes-pagination{
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .clientes-pagination-status{
        min-block-size:calc(34px * var(--ui-scale, 1));
        padding-inline:10px;
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--badge-bg, rgba(255,255,255,.048));
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
      }

      .clientes-pagination-btn{
        appearance:none;
        min-block-size:calc(38px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 14px);
        border-radius:var(--radius-md, 13px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-sm, 12px);
        font-weight:var(--weight-bold, 700);
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-pagination-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .clientes-pagination-btn[disabled],
      .clientes-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
        transform:none;
      }

      .clientes-filters{
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:minmax(0, 1fr) minmax(250px, 420px);
        gap:var(--space-sm, 12px);
        align-items:center;
        padding-block-start:var(--space-xs, 4px);
      }

      .clientes-filter-pills{
        min-inline-size:0;
        display:flex;
        align-items:center;
        gap:var(--space-2xs, 6px);
        overflow-x:auto;
        scrollbar-width:none;
        padding-block:2px;
      }

      .clientes-filter-pills::-webkit-scrollbar{
        display:none;
      }

      .clientes-filter-pill{
        appearance:none;
        min-block-size:calc(34px * var(--ui-scale, 1));
        padding-inline:11px 8px;
        border-radius:999px;
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        font:inherit;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        white-space:nowrap;
        cursor:pointer;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-filter-pill strong{
        min-inline-size:22px;
        min-block-size:20px;
        padding-inline:6px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:inherit;
        background:color-mix(in srgb, currentColor 10%, transparent);
        font-size:10px;
        font-weight:900;
      }

      .clientes-filter-pill:hover{
        transform:translateY(-1px);
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
      }

      .clientes-filter-pill.is-active{
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12)));
        background:color-mix(in srgb, var(--accent, #6f59d9) 14%, var(--badge-bg, rgba(255,255,255,.048)));
        color:var(--accent-active, var(--text-strong, #ffffff));
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #6f59d9), transparent 88%);
      }

      .clientes-search{
        position:relative;
        min-inline-size:0;
        inline-size:100%;
        display:flex;
        align-items:center;
      }

      .clientes-search-icon{
        position:absolute;
        inset-inline-start:12px;
        inset-block:0;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:var(--text-dim, rgba(245,245,245,.50));
        pointer-events:none;
      }

      .clientes-search-icon svg{
        inline-size:14px;
        block-size:14px;
      }

      .clientes-search-input{
        appearance:none;
        inline-size:100%;
        min-inline-size:0;
        min-block-size:calc(36px * var(--ui-scale, 1));
        border-radius:999px;
        border:1px solid var(--input-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--input-bg, rgba(255,255,255,.045));
        color:var(--input-text, var(--text, #f5f5f5));
        padding:0 38px 0 36px;
        font:inherit;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-semibold, 600);
        line-height:1;
        outline:none;
        box-shadow:var(--input-shadow, none);
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-search-input::placeholder{
        color:var(--input-placeholder, var(--text-faint, rgba(245,245,245,.34)));
      }

      .clientes-search-input:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--input-bg-hover, var(--btn-secondary-bg-hover, rgba(255,255,255,.062)));
      }

      .clientes-search-input:focus{
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12)));
        background:var(--input-bg-focus, var(--input-bg, rgba(255,255,255,.045)));
      }

      .clientes-search-clear{
        appearance:none;
        position:absolute;
        inset-inline-end:6px;
        inset-block:50% auto;
        transform:translateY(-50%);
        inline-size:26px;
        block-size:26px;
        border-radius:999px;
        border:1px solid transparent;
        background:transparent;
        color:var(--text-dim, rgba(245,245,245,.50));
        display:inline-flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
        padding:0;
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-search-clear:hover{
        color:var(--text-strong, #ffffff);
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-default, rgba(255,255,255,.09));
      }

      .clientes-search-clear svg{
        inline-size:13px;
        block-size:13px;
      }

      .clientes-table-wrap{
        position:relative;
        min-block-size:120px;
        min-inline-size:0;
        max-inline-size:100%;
      }

      .clientes-table-wrap.is-refreshing .clientes-table-shell{
        opacity:.56;
        filter:blur(.7px);
      }

      .clientes-table-shell{
        inline-size:100%;
        max-inline-size:100%;
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-width:thin;
        scrollbar-color:var(--scrollbar-thumb, rgba(255,255,255,.12)) transparent;
      }

      .clientes-table-shell::-webkit-scrollbar{
        block-size:var(--scrollbar-size, 10px);
      }

      .clientes-table-shell::-webkit-scrollbar-track{
        background:transparent;
      }

      .clientes-table-shell::-webkit-scrollbar-thumb{
        border:2px solid transparent;
        border-radius:999px;
        background:var(--scrollbar-thumb, rgba(255,255,255,.12));
        background-clip:padding-box;
      }

      .clientes-table{
        display:table !important;
        inline-size:100%;
        min-inline-size:0;
        max-inline-size:100%;
        table-layout:fixed;
        border-collapse:separate;
        border-spacing:0;
        background:var(--table-bg, transparent);
        margin:0;
      }

      .clientes-table colgroup{
        display:table-column-group !important;
      }

      .clientes-table col{
        display:table-column !important;
      }

      .clientes-table thead{
        display:table-header-group !important;
      }

      .clientes-table tbody{
        display:table-row-group !important;
      }

      .clientes-table tr{
        display:table-row !important;
      }

      .clientes-table th,
      .clientes-table td{
        display:table-cell !important;
      }

      .clientes-table thead th{
        position:sticky;
        top:0;
        z-index:2;
        block-size:44px;
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 12px);
        text-align:center;
        vertical-align:middle;
        font-size:var(--data-table-head-font-size, var(--font-xs, 11px));
        font-weight:var(--data-table-head-font-weight, var(--weight-bold, 700));
        letter-spacing:var(--data-table-head-letter, .075em);
        text-transform:uppercase;
        color:var(--data-table-head-text, var(--text-dim, rgba(245,245,245,.50)));
        background:var(--data-table-head-bg, var(--table-head-bg, rgba(255,255,255,.020)));
        border-bottom:1px solid var(--table-head-border, var(--border-default, rgba(255,255,255,.082)));
        white-space:nowrap;
      }

      .clientes-table thead th:first-child{
        text-align:left;
        padding-inline-start:24px;
      }

      .clientes-table thead th:last-child,
      .clientes-table tbody td:last-child{
        padding-inline-end:18px;
      }

      .clientes-table tbody tr{
        block-size:var(--cli-table-row-height);
      }

      .clientes-table tbody td{
        padding:calc(12px * var(--ui-scale, 1)) var(--table-cell-padding-x, 12px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
        background:transparent;
      }

      .clientes-table tbody tr:last-child td{
        border-bottom:none;
      }

      .clientes-table tbody tr:nth-child(even) td{
        background:color-mix(in srgb, var(--surface-elevated, rgba(39,39,42,.88)) 86%, transparent);
      }

      .clientes-row:hover{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .clientes-row--active{
        --cli-row-accent:var(--success, #22c55e);
      }

      .clientes-row--pending{
        --cli-row-accent:var(--warning, #f59e0b);
      }

      .clientes-row--blocked{
        --cli-row-accent:var(--error, #ef4444);
      }

      .clientes-row--inactive{
        --cli-row-accent:var(--text-dim, rgba(245,245,245,.50));
      }

      .clientes-cell{
        min-inline-size:0;
      }

      .clientes-cell--main{
        position:relative;
        text-align:left;
        padding-inline-start:18px !important;
      }

      .clientes-cell--main::before{
        content:"";
        position:absolute;
        inset-block:10px;
        inset-inline-start:0;
        inline-size:3px;
        border-radius:0 999px 999px 0;
        background:var(--cli-row-accent);
        opacity:.68;
        transform:scaleY(.72);
        transition:
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-row:hover .clientes-cell--main::before{
        opacity:1;
        transform:scaleY(1);
      }

      .clientes-cell--status,
      .clientes-cell--tier,
      .clientes-cell--date,
      .clientes-cell--email,
      .clientes-cell--location,
      .clientes-cell--manager,
      .clientes-cell--activity,
      .clientes-cell--actions{
        text-align:center;
      }

      .clientes-cell--status > *,
      .clientes-cell--tier > *,
      .clientes-cell--actions > *{
        margin-inline:auto;
      }

      .clientes-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-inline-size:0;
        padding-inline-start:6px;
      }

      .clientes-avatar{
        position:relative;
        inline-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        block-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--clientes-avatar-bg, linear-gradient(135deg, #55555d 0%, #303036 100%));
        box-shadow:
          0 10px 22px color-mix(in srgb, var(--clientes-avatar-b, #000000) 22%, transparent),
          0 0 0 3px color-mix(in srgb, var(--clientes-avatar-a, #71717a) 24%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .clientes-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08));
        pointer-events:none;
        mix-blend-mode:screen;
      }

      .clientes-avatar img{
        position:relative;
        z-index:1;
        display:block;
        inline-size:100%;
        block-size:100%;
        object-fit:cover;
      }

      .clientes-avatar-fallback{
        position:absolute;
        inset:0;
        z-index:2;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:var(--font-2xl, 19px);
        font-weight:var(--weight-black, 800);
        color:var(--avatar-text, #ffffff);
        letter-spacing:-.035em;
        text-shadow:
          0 1px 2px rgba(0,0,0,.22),
          0 0 16px rgba(255,255,255,.20);
      }

      .clientes-avatar[data-fallback="true"] .clientes-avatar-fallback,
      .clientes-avatar--fallback .clientes-avatar-fallback{
        display:flex;
      }

      .clientes-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .clientes-main-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .clientes-client-line{
        display:flex;
        align-items:center;
        gap:7px;
        min-inline-size:0;
      }

      .clientes-client-id{
        min-inline-size:0;
        font-size:var(--font-sm, 12px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.055em;
        color:var(--text-dim, rgba(245,245,245,.50));
        text-transform:uppercase;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .clientes-role-pill{
        flex:0 0 auto;
        max-inline-size:130px;
        min-block-size:20px;
        padding-inline:7px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        font-size:10px;
        font-weight:800;
        letter-spacing:.045em;
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--badge-bg, rgba(255,255,255,.048));
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        text-transform:uppercase;
      }

      .clientes-client-subject{
        font-size:var(--font-lg, 15px);
        line-height:1.14;
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .clientes-client-description{
        font-size:var(--font-md, 13px);
        line-height:1.3;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .clientes-chip{
        min-block-size:var(--chip-height, calc(26px * var(--ui-scale, 1)));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
        box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .clientes-chip-dot{
        inline-size:6px;
        block-size:6px;
        border-radius:999px;
        background:currentColor;
        box-shadow:0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
      }

      .clientes-chip--active{
        color:var(--success, #22c55e);
        background:var(--success-bg, rgba(34,197,94,.10));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .clientes-chip--pending{
        color:var(--warning, #f59e0b);
        background:var(--warning-bg, rgba(245,158,11,.10));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .clientes-chip--blocked{
        color:var(--error, #ef4444);
        background:var(--error-bg, rgba(239,68,68,.10));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .clientes-chip--inactive{
        color:var(--text-dim, rgba(245,245,245,.50));
        background:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 12%, transparent);
        border-color:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 22%, transparent);
      }

      .clientes-chip--tier-vip{
        color:var(--warning, #f97316);
        background:color-mix(in srgb, rgba(249,115,22,.14) 82%, var(--surface-active, transparent));
        border-color:rgba(249,115,22,.32);
      }

      .clientes-chip--tier-enterprise{
        color:var(--accent, #a78bfa);
        background:color-mix(in srgb, rgba(167,139,250,.14) 82%, var(--surface-active, transparent));
        border-color:rgba(167,139,250,.32);
      }

      .clientes-chip--tier-pro{
        color:var(--info, #38bdf8);
        background:color-mix(in srgb, rgba(56,189,248,.13) 82%, var(--surface-active, transparent));
        border-color:rgba(56,189,248,.30);
      }

      .clientes-chip--tier-starter{
        color:var(--warning, #facc15);
        background:color-mix(in srgb, rgba(250,204,21,.12) 82%, var(--surface-active, transparent));
        border-color:rgba(250,204,21,.28);
      }

      .clientes-chip--tier-standard{
        color:var(--text-dim, rgba(245,245,245,.50));
        background:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 10%, transparent);
        border-color:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 18%, transparent);
      }

      .clientes-date-inline,
      .clientes-email-inline,
      .clientes-location-inline,
      .clientes-manager-inline,
      .clientes-activity-inline{
        display:inline-flex;
        justify-content:center;
        inline-size:100%;
        max-inline-size:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
        font-size:var(--font-sm, 12px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
      }

      .clientes-email-inline,
      .clientes-manager-inline{
        justify-content:flex-start;
        text-align:left;
      }

      .clientes-cell--email,
      .clientes-cell--manager{
        text-align:left;
      }

      .clientes-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .clientes-detail-btn{
        appearance:none;
        inline-size:calc(96px * var(--ui-scale, 1));
        min-inline-size:calc(96px * var(--ui-scale, 1));
        max-inline-size:calc(96px * var(--ui-scale, 1));
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding-inline:var(--space-xs, 8px);
        border-radius:var(--radius-md, 10px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-action-icon{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .clientes-action-icon svg{
        inline-size:14px;
        block-size:14px;
      }

      .clientes-detail-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        transform:translateY(var(--ui-hover-lift, -1px));
      }

      .clientes-detail-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .clientes-detail-btn.is-loading{
        justify-content:center;
      }

      .clientes-loader-only{
        display:inline-flex;
        inline-size:16px;
        block-size:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .clientes-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .clientes-inline-loading-text{
        display:inline-block;
      }

      .clientes-inline-spinner{
        inline-size:14px;
        block-size:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:clientesSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .clientes-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:color-mix(in srgb, var(--backdrop-bg, rgba(10,10,12,.28)) 72%, transparent);
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .clientes-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--radius-md, 14px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-soft, rgba(245,245,245,.88));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .clientes-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .clientes-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(220px, 1fr) 96px 92px 108px 160px 88px 132px 132px 96px;
        gap:var(--space-sm, 12px);
        align-items:center;
      }

      .clientes-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .clientes-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .clientes-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          var(--skeleton-shine, rgba(255,255,255,.095)),
          transparent
        );
        animation:clientesSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .clientes-skeleton--avatar{
        inline-size:var(--avatar-size-lg, 44px);
        block-size:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .clientes-skeleton--xs{
        inline-size:120px;
        block-size:var(--skeleton-height-sm, 10px);
      }

      .clientes-skeleton--lg{
        inline-size:74%;
        block-size:var(--skeleton-height-md, 14px);
      }

      .clientes-skeleton--md{
        inline-size:56%;
        block-size:12px;
      }

      .clientes-skeleton--pill{
        inline-size:92px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .clientes-skeleton--date{
        inline-size:112px;
        block-size:12px;
      }

      .clientes-skeleton--email{
        inline-size:160px;
        block-size:12px;
      }

      .clientes-skeleton--btn{
        inline-size:calc(96px * var(--ui-scale, 1));
        block-size:var(--btn-height-sm, 34px);
        border-radius:var(--radius-md, 12px);
      }

      .clientes-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 8px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .clientes-empty-icon{
        inline-size:54px;
        block-size:54px;
        display:grid;
        place-items:center;
        border-radius:var(--radius-xl, 18px);
        border:1px solid var(--state-empty-border, rgba(148,163,184,.20));
        background:var(--state-empty-bg, rgba(148,163,184,.10));
        color:var(--state-empty-icon, var(--info, #94a3b8));
        box-shadow:var(--shadow-soft, 0 8px 18px rgba(0,0,0,.13));
      }

      .clientes-empty-icon svg{
        inline-size:24px;
        block-size:24px;
      }

      .clientes-empty-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .clientes-empty-text{
        margin:0;
        max-inline-size:58ch;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .clientes-error{
        display:grid;
        justify-items:start;
        gap:var(--space-xs, 10px);
        padding:var(--space-xl, 24px) var(--space-xl, 22px);
        border-radius:var(--card-radius-lg, 22px);
        border:1px solid var(--border-error, rgba(239,68,68,.30));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 46%, var(--card-bg, transparent));
        box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
      }

      .clientes-error-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .clientes-error-text{
        margin:0;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      @keyframes clientesSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes clientesSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .clientes-hero,
      [data-theme="light"] .clientes-history{
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 7%, transparent), transparent 34%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .clientes-stat-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .clientes-btn--create{
        --cli-create-bg:var(--btn-primary-bg, linear-gradient(135deg, var(--accent, #6f59d9) 0%, var(--accent-hover, #5f45d8) 100%));
        --cli-create-bg-hover:var(--cli-create-bg);
        --cli-create-border:color-mix(in srgb, var(--accent, #6f59d9) 44%, transparent);
      }

      [data-theme="light"] .clientes-filter-pill.is-active{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      [data-theme="light"] .clientes-search-input{
        color:var(--input-text, var(--text, #111827));
        background:var(--input-bg, rgba(255,255,255,.76));
        border-color:var(--input-border, var(--border-default, rgba(15,23,42,.10)));
      }

      [data-theme="light"] .clientes-search-icon,
      [data-theme="light"] .clientes-search-clear{
        color:var(--text-dim, rgba(15,23,42,.50));
      }

      [data-theme="light"] .clientes-search-clear:hover{
        color:var(--text-strong, #111827);
        background:var(--btn-secondary-bg-hover, rgba(15,23,42,.052));
      }

      [data-theme="light"] .clientes-chip--active{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .clientes-chip--pending{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .clientes-chip--blocked{
        color:var(--error-hover, #b52a39);
        background:var(--error-soft, rgba(216,60,77,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      [data-theme="light"] .clientes-chip--inactive{
        color:var(--text-muted, #64748b);
        background:color-mix(in srgb, var(--text-muted, #64748b) 10%, transparent);
        border-color:color-mix(in srgb, var(--text-muted, #64748b) 18%, transparent);
      }

      [data-theme="light"] .clientes-chip--tier-vip{
        color:#c2410c;
        background:rgba(251,146,60,.12);
        border-color:rgba(251,146,60,.24);
      }

      [data-theme="light"] .clientes-chip--tier-enterprise{
        color:#6d28d9;
        background:rgba(167,139,250,.12);
        border-color:rgba(167,139,250,.24);
      }

      [data-theme="light"] .clientes-chip--tier-pro{
        color:#0369a1;
        background:rgba(56,189,248,.12);
        border-color:rgba(56,189,248,.24);
      }

      [data-theme="light"] .clientes-chip--tier-starter{
        color:#a16207;
        background:rgba(250,204,21,.12);
        border-color:rgba(250,204,21,.24);
      }

      [data-theme="light"] .clientes-chip--tier-standard{
        color:#475569;
        background:rgba(148,163,184,.10);
        border-color:rgba(148,163,184,.20);
      }

      @media (max-width: 1240px){
        .clientes-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }

        .clientes-filters{
          grid-template-columns:1fr;
        }

        .clientes-search{
          max-inline-size:560px;
        }
      }

      @media (max-width: 1180px){
        .clientes-hero{
          padding:var(--space-lg, 20px);
        }

        .clientes-hero-top{
          grid-template-columns:1fr;
        }

        .clientes-hero-actions{
          justify-content:flex-start;
        }
      }

      @media (max-width: 1200px){
        .clientes-table{
          min-inline-size:1180px;
        }
      }

      @media (max-width: 760px){
        :where(.clientes-view-root, [data-clientes-scope]){
          gap:var(--space-md, 16px);
        }

        .clientes-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
          border-radius:var(--radius-xl, 18px);
        }

        .clientes-history{
          border-radius:var(--radius-xl, 18px);
        }

        .clientes-history-head{
          grid-template-columns:1fr;
          padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
        }

        .clientes-pagination{
          justify-content:flex-start;
        }

        .clientes-stats{
          grid-template-columns:1fr;
        }

        .clientes-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
        }

        .clientes-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .clientes-hero-actions{
          inline-size:100%;
        }

        .clientes-btn{
          flex:1 1 auto;
        }

        .clientes-search{
          max-inline-size:none;
        }
      }

      @media (max-width: 520px){
        .clientes-meta-pill{
          inline-size:100%;
          justify-content:center;
        }

        .clientes-hero-actions{
          display:grid;
          grid-template-columns:1fr;
        }

        .clientes-btn{
          inline-size:100%;
        }

        .clientes-filter-pills{
          margin-inline:-2px;
        }
      }

      @media (prefers-reduced-motion: reduce){
        :where(.clientes-view-root, [data-clientes-scope]) *,
        :where(.clientes-view-root, [data-clientes-scope]) *::before,
        :where(.clientes-view-root, [data-clientes-scope]) *::after{
          animation:none !important;
          transition:none !important;
        }
      }
    </style>
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

  const includeStyles = data.includeStyles !== false;

  return `
    ${renderMaybeStyles(includeStyles)}

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

  const includeStyles =
    typeof options === "object" && options !== null
      ? Boolean(options.includeStyles)
      : false;

  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="clientes-history">
      ${renderTableLoading(Math.max(3, safeNumber(rows, DEFAULT_PAGE_SIZE)))}
    </section>
  `;
}

export function renderErrorState(
  message = "No se pudieron cargar los clientes.",
  { includeStyles = false } = {}
) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="clientes-error">
      <h3 class="clientes-error-title">No se pudo renderizar la vista de clientes</h3>
      <p class="clientes-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

export function renderAccessDeniedState({ includeStyles = false } = {}) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="clientes-history">
      ${renderEmptyContent({ restricted: true })}
    </section>
  `;
}

export function renderEmptyClientesState(options = {}) {
  return `
    ${renderMaybeStyles(Boolean(options?.includeStyles))}

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

  const includeStyles = Boolean(data.includeStyles);

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
    ${renderMaybeStyles(includeStyles)}

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
                          <col>
                          <col style="width:118px;">
                          <col style="width:112px;">
                          <col style="width:112px;">
                          <col style="width:210px;">
                          <col style="width:112px;">
                          <col style="width:150px;">
                          <col style="width:146px;">
                          <col style="width:116px;">
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
    ${renderMaybeStyles(Boolean(options?.includeStyles))}

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
        ${renderStyles()}
        ${renderAccessDeniedState({ includeStyles: false })}
      </section>
    `;
  }

  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  if (state.error && !items.length) {
    return `
      <section class="clientes-view-root" data-clientes-scope="true">
        ${renderStyles()}
        ${renderErrorState(state.error, { includeStyles: false })}
      </section>
    `;
  }

  const payload = {
    ...data,
    items,
    state,
    includeStyles: false,
  };

  return `
    <section class="clientes-view-root" data-clientes-scope="true">
      ${renderStyles()}
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderClientesTableTemplate;

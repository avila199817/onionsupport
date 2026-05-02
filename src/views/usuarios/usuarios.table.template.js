/* =========================================================
   Onion SPA - Usuarios Table Template
   Archivo: src/views/usuarios/usuarios.table.template.js

   FINAL PRODUCTION TEMPLATE · USERS VIEW · EXTREME SAAS MODE · 12/10
   ALIGNED WITH INCIDENCIAS / FACTURAS · PRO SAAS PANEL

   RESPONSABILIDADES:
   - render del hero/header de usuarios
   - render de tabla productiva con paginación real
   - render de filtros visuales compatibles con state/props/bindings
   - render de búsqueda compatible con state/props/bindings
   - compatibilidad con usuariosView.js
   - loading visual en detalle / nuevo usuario / refresh / retry / export
   - soporte para payloads backend heterogéneos y envelopes anidados
   - acciones compatibles con data-usuarios-action y data-action
   - avatares fallback pseudo-RNG estables
   - dark/light conectado a variables.css + ui.css
   - chips de estado alineados con tokens globales
   - tabla blindada contra reset/core/layout/ui global
   - row accent seguro sin pseudo-elementos sobre <tr>
   - límite fijo de 5 usuarios por hoja
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
const STYLE_ID = "onion-usuarios-table-template-styles-v13";

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
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
      normalized = lastComma > lastDot
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

/* =========================================================
   FORMATTERS
========================================================= */

const dateTimeFormatterCache = new Map();

function getDateTimeFormatter() {
  const key = "es-ES:date-time";
  if (dateTimeFormatterCache.has(key)) return dateTimeFormatterCache.get(key);

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
  if (dateTimeFormatterCache.has(key)) return dateTimeFormatterCache.get(key);

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
  if (!ts) return "Sin acceso";

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
    user: `<svg ${common}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    mail: `<svg ${common}><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>`,
    map: `<svg ${common}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`,
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

  if (Array.isArray(obj.usuarios)) return obj.usuarios;
  if (Array.isArray(obj.users)) return obj.users;
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
    data.users,
    data.usuarios,
    data.data,
    data.results,
    data.records,
    data.payload,
    data.response,
    data.result,
    data.body,

    state.items,
    state.rows,
    state.users,
    state.usuarios,
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
    if (rows.length) return sortUsuariosNewestFirst(rows);
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
  const seed = `${getUsuarioId(item)}|${getUsuarioEmail(item)}|${getUsuarioName(item)}`;
  const [a, b] = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];

  return [
    `--usuarios-avatar-a:${a}`,
    `--usuarios-avatar-b:${b}`,
    `--usuarios-avatar-bg:linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
  ].join(";");
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getUsuarioId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.userId,
      item.usuarioId,
      item.id,
      item._id,
      item.code,
      item.username,
      item.userName,
      item.email,
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.code,
      raw.username,
      raw.userName,
      raw.email
    ),
    ""
  );
}

function getUsuarioCode(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.username,
      item.userName,
      item.userId,
      item.usuarioId,
      item.id,
      item._id,
      item.code,
      item.email,
      raw.username,
      raw.userName,
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.code,
      raw.email
    ),
    "USR-SIN-ID"
  );
}

function getUsuarioName(item = {}) {
  const raw = safeObject(item?.raw);

  const composedName = [
    safeText(first(item.firstName, item.nombre), ""),
    safeText(first(item.lastName, item.apellidos), ""),
  ]
    .filter(Boolean)
    .join(" ");

  const rawComposedName = [
    safeText(first(raw.firstName, raw.nombre), ""),
    safeText(first(raw.lastName, raw.apellidos), ""),
  ]
    .filter(Boolean)
    .join(" ");

  return safeText(
    first(
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      item.usuario?.nombre,
      item.usuario?.name,
      item.profile?.name,
      item.profile?.displayName,
      composedName,
      item.username,
      item.userName,
      item.email,
      raw.fullName,
      raw.displayName,
      raw.name,
      raw.nombre,
      raw.usuario?.nombre,
      raw.usuario?.name,
      raw.profile?.name,
      raw.profile?.displayName,
      rawComposedName,
      raw.username,
      raw.userName,
      raw.email
    ),
    "Usuario"
  );
}

function getUsuarioDescription(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.profile?.phone,
      item.usuario?.phone,
      item.usuario?.telefono,
      item.description,
      item.descripcion,
      item.notes,
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.profile?.phone,
      raw.usuario?.phone,
      raw.usuario?.telefono,
      raw.description,
      raw.descripcion,
      raw.notes
    ),
    "Sin teléfono"
  );
}

function getUsuarioEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.email,
      item.mail,
      item.userEmail,
      item.usuario?.email,
      item.profile?.email,
      item.contact?.email,
      raw.email,
      raw.mail,
      raw.userEmail,
      raw.usuario?.email,
      raw.profile?.email,
      raw.contact?.email
    ),
    "Sin email"
  ).toLowerCase();
}

function getUsuarioLocation(item = {}) {
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
      item.usuario?.city,
      item.usuario?.ciudad,
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
      raw.usuario?.city,
      raw.usuario?.ciudad
    ),
    "Sin ciudad"
  );
}

function getUsuarioAvatarUrl(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.userAvatar,
      item.userAvatarUrl,
      item.photo,
      item.photoUrl,
      item.image,
      item.imageUrl,
      item.picture,
      item.usuario?.avatar,
      item.usuario?.avatarUrl,
      item.profile?.avatar,
      item.profile?.avatarUrl,
      item.profile?.photoUrl,
      raw.avatar,
      raw.avatarUrl,
      raw.userAvatar,
      raw.userAvatarUrl,
      raw.photo,
      raw.photoUrl,
      raw.image,
      raw.imageUrl,
      raw.picture,
      raw.usuario?.avatar,
      raw.usuario?.avatarUrl,
      raw.profile?.avatar,
      raw.profile?.avatarUrl,
      raw.profile?.photoUrl
    ),
    ""
  );
}

function getUsuarioInitials(item = {}) {
  const raw = safeObject(item?.raw);

  const text = normalizeWhitespace(
    first(
      item.userInitials,
      item.initials,
      raw.userInitials,
      raw.initials,
      getUsuarioName(item),
      getUsuarioCode(item),
      "US"
    )
  );

  if (!text) return "US";

  const parts = text.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "US";
}

function getStatusValue(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.status,
    item.estado,
    item.state,
    item.accountStatus,
    item.userStatus,
    item.lifecycle?.status,
    raw.status,
    raw.estado,
    raw.state,
    raw.accountStatus,
    raw.userStatus,
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

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["active", "activo", "activa", "enabled", "habilitado", "habilitada", "ok"].includes(key)) return "active";
  if (["pending", "pendiente", "invited", "invitado", "invitada", "invite", "new"].includes(key)) return "pending";

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
    item.modifiedAt,
    item.lastModifiedAt,
    item.lastLoginAt,
    item.last_login_at,
    item.lastAccessAt,
    item.ultimoAcceso,
    item.lastSeenAt,
    item.lastActivityAt,
    item.lifecycle?.updatedAt,
    item.audit?.updatedAt,
    item.createdAt,
    item.created_at,
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastModifiedAt,
    raw.lastLoginAt,
    raw.last_login_at,
    raw.lastAccessAt,
    raw.ultimoAcceso,
    raw.lastSeenAt,
    raw.lastActivityAt,
    raw.lifecycle?.updatedAt,
    raw.audit?.updatedAt,
    raw.createdAt,
    raw.created_at
  );
}

function getLastLoginAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.lastLoginAt,
    item.last_login_at,
    item.lastAccessAt,
    item.ultimoAcceso,
    item.lastSeenAt,
    item.lastActivityAt,
    item.session?.lastLoginAt,
    item.session?.lastSeenAt,
    raw.lastLoginAt,
    raw.last_login_at,
    raw.lastAccessAt,
    raw.ultimoAcceso,
    raw.lastSeenAt,
    raw.lastActivityAt,
    raw.session?.lastLoginAt,
    raw.session?.lastSeenAt
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
    toTimestamp(getLastLoginAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    toTimestamp(raw?._ts) ||
    0
  );
}

function compareUsuariosNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);
  if (diff !== 0) return diff;

  return safeText(getUsuarioCode(b), "").localeCompare(safeText(getUsuarioCode(a), ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortUsuariosNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareUsuariosNewestFirst);
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

function hasAccessLike(item = {}) {
  return Boolean(toTimestamp(getLastLoginAt(item)));
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (!key || ["all", "todo", "todos", "todas", "total", "totales"].includes(key)) return "all";
  if (["active", "activo", "activa", "activos", "activas", "enabled", "habilitado"].includes(key)) return "active";
  if (["pending", "pendiente", "pendientes", "invited", "invitado", "invitada", "invite"].includes(key)) return "pending";

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
  return true;
}

function getSearchHaystack(item = {}) {
  const raw = safeObject(item?.raw);

  return [
    getUsuarioId(item),
    getUsuarioCode(item),
    getUsuarioName(item),
    getUsuarioDescription(item),
    getUsuarioEmail(item),
    getUsuarioLocation(item),
    getStatusLabel(getStatusValue(item)),
    item.userId,
    item.usuarioId,
    item.username,
    item.userName,
    item.clienteId,
    item.phone,
    item.telefono,
    raw.userId,
    raw.usuarioId,
    raw.username,
    raw.userName,
    raw.clienteId,
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

function filterAndSortUsuarios(items = [], input = {}) {
  const activeFilter = getActiveFilter(input);
  const searchQuery = getSearchQuery(input);

  return sortUsuariosNewestFirst(items).filter((item) => {
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
      if (hasAccessLike(item)) acc.withAccessCount += 1;
      return acc;
    },
    {
      total: 0,
      activeCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      withAccessCount: 0,
    }
  );
}

function normalizePageSize(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return clamp(
    safeNumber(
      first(data.pageSize, runtime.pageSize, runtime.limit, runtime.usuariosPageSize, DEFAULT_PAGE_SIZE),
      DEFAULT_PAGE_SIZE
    ),
    1,
    50
  );
}

function getPagination(items = [], input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const allItems = filterAndSortUsuarios(items, data);
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
  const totalPages = Math.max(1, totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize));

  const currentPage = clamp(
    safeNumber(first(data.page, runtime.page, runtime.currentPage, runtime.usuariosPage, 1), 1),
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
    <span class="usuarios-inline-loading">
      <span class="usuarios-inline-spinner" aria-hidden="true"></span>
      ${label ? `<span class="usuarios-inline-loading-text">${escapeHtml(label)}</span>` : ""}
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="usuarios-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="usuarios-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getUsuarioName(item);
  const initials = getUsuarioInitials(item);
  const avatarUrl = getUsuarioAvatarUrl(item);
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="usuarios-avatar"
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
        <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="usuarios-avatar usuarios-avatar--fallback"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
    >
      <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusValue(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="usuarios-chip usuarios-chip--${escapeHtml(key)}">
      <span class="usuarios-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderActionButton({
  action = "detail",
  userId = "",
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
      class="usuarios-detail-btn${loading ? " is-loading" : ""}"
      data-usuarios-action="${escapeHtml(action)}"
      data-action="${escapeHtml(action === "detail" ? "open-user" : action)}"
      data-user-id="${escapeHtml(userId)}"
      title="${escapeHtml(finalTooltip)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${loading ? 'aria-busy="true"' : ""}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel)
          : `
            <span class="usuarios-action-icon">${icon(iconName)}</span>
            <span class="usuarios-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);

  const userId = getUsuarioId(item);
  const code = getUsuarioCode(item);
  const name = getUsuarioName(item);
  const preview = truncate(getUsuarioDescription(item), 96);
  const email = getUsuarioEmail(item);
  const city = getUsuarioLocation(item);
  const createdAtRaw = getCreatedAt(item);
  const createdAt = formatDateShort(createdAtRaw);
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw ? formatLastUpdate(lastLoginAtRaw) : "Sin acceso";
  const statusKey = getStatusKey(getStatusValue(item));

  const openingUserId = safeText(
    first(runtime.openingUserId, runtime.detailUserId, runtime.loadingUserId),
    ""
  );

  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <tr
      class="usuarios-row usuarios-row--${escapeHtml(statusKey)}"
      data-user-row="true"
      data-user-id="${escapeHtml(userId)}"
      data-usuario-id="${escapeHtml(userId)}"
    >
      <td class="usuarios-cell usuarios-cell--main">
        <div class="usuarios-main">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-line">
              <span class="usuarios-user-id">${escapeHtml(code)}</span>
              <span class="usuarios-role-pill">Usuario</span>
            </div>

            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td class="usuarios-cell usuarios-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="usuarios-cell usuarios-cell--date">
        <span
          class="usuarios-date-inline"
          title="${escapeHtml(formatDateTime(createdAtRaw))}"
          data-tooltip="${escapeHtml(formatDateTime(createdAtRaw))}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--email">
        <span
          class="usuarios-email-inline"
          title="${escapeHtml(email)}"
          data-tooltip="${escapeHtml(email)}"
        >
          ${escapeHtml(email)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--location">
        <span
          class="usuarios-location-inline"
          title="${escapeHtml(city)}"
          data-tooltip="${escapeHtml(city)}"
        >
          ${escapeHtml(city)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--activity">
        <span
          class="usuarios-activity-inline"
          title="${escapeHtml(lastLoginAtRaw ? formatDateTime(lastLoginAtRaw) : "Sin acceso") }"
          data-tooltip="${escapeHtml(lastLoginAtRaw ? formatDateTime(lastLoginAtRaw) : "Sin acceso") }"
        >
          ${escapeHtml(lastLoginAt)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--actions">
        ${renderActionButton({
          userId,
          loading: isOpening,
          label: "Detalle",
          loadingLabel: "Cargando detalle",
          iconName: "eye",
          tooltip: "Abrir detalle de usuario",
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
    <div class="usuarios-pagination" aria-label="Paginación de usuarios">
      <button
        type="button"
        class="usuarios-pagination-btn"
        data-usuarios-action="prev-page"
        data-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <span class="usuarios-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="usuarios-pagination-btn usuarios-pagination-btn--next"
        data-usuarios-action="next-page"
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
    <div class="usuarios-search" role="search" aria-label="Buscar usuarios">
      <span class="usuarios-search-icon" aria-hidden="true">
        ${icon("search")}
      </span>

      <input
        id="usuarios-search-input"
        class="usuarios-search-input"
        type="search"
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar nombre, email, ciudad, teléfono, ID..."
        autocomplete="off"
        spellcheck="false"
        data-usuarios-action="search"
        data-action="search-usuarios"
        data-usuarios-search-input="true"
        aria-label="Buscar usuarios por nombre, email, ciudad, teléfono o identificador"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="usuarios-search-clear"
              data-usuarios-action="clear-search"
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
    <div class="usuarios-filters" aria-label="Filtros y búsqueda de usuarios">
      <div class="usuarios-filter-pills">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="usuarios-filter-pill${isActive ? " is-active" : ""}"
              data-usuarios-action="filter"
              data-action="filter-usuarios"
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

function renderEmptyContent({ hasError = false, filtering = false, searchQuery = "", message = "", restricted = false } = {}) {
  if (restricted) {
    return `
      <div class="usuarios-empty usuarios-empty--forbidden">
        <div class="usuarios-empty-icon" aria-hidden="true">${icon("shield")}</div>
        <h3 class="usuarios-empty-title">Acceso restringido</h3>
        <p class="usuarios-empty-text">La vista de usuarios está reservada para administradores.</p>
      </div>
    `;
  }

  return `
    <div class="usuarios-empty">
      <div class="usuarios-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : icon("users")}
      </div>

      <h3 class="usuarios-empty-title">
        ${
          hasError
            ? "No se pudieron cargar los usuarios"
            : filtering
              ? "No hay usuarios con este criterio"
              : "No hay usuarios para mostrar"
        }
      </h3>

      <p class="usuarios-empty-text">
        ${
          hasError
            ? escapeHtml(safeText(message, "Puedes reintentar la carga desde el botón de actualizar."))
            : filtering
              ? searchQuery
                ? `No se encontraron usuarios para “${escapeHtml(searchQuery)}”. Prueba con otro nombre, email, ciudad o identificador.`
                : "Cambia el filtro activo para volver al listado completo."
              : "Cuando haya usuarios registrados aparecerán aquí con su estado, alta, email, ubicación, última conexión y acciones disponibles."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="usuarios-btn usuarios-btn--primary"
              data-usuarios-action="retry"
              data-action="retry"
            >
              ${icon("refresh")}
              <span class="usuarios-btn-text">Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="usuarios-btn"
                data-usuarios-action="clear-filters"
                data-action="clear-filters"
              >
                ${icon("close")}
                <span class="usuarios-btn-text">Limpiar filtros</span>
              </button>
            `
            : `
              <button
                type="button"
                class="usuarios-btn usuarios-btn--primary usuarios-btn--create"
                data-usuarios-action="create"
                data-action="create-user"
              >
                ${icon("plus")}
                <span class="usuarios-btn-text">Crear usuario</span>
              </button>
            `
      }
    </div>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  return `
    <div class="usuarios-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="usuarios-table-loading-row">
              <div class="usuarios-skeleton usuarios-skeleton--avatar"></div>

              <div class="usuarios-table-loading-copy">
                <div class="usuarios-skeleton usuarios-skeleton--xs"></div>
                <div class="usuarios-skeleton usuarios-skeleton--lg"></div>
                <div class="usuarios-skeleton usuarios-skeleton--md"></div>
              </div>

              <div class="usuarios-skeleton usuarios-skeleton--pill"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--email"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="usuarios-refresh-overlay" aria-live="polite">
      <div class="usuarios-refresh-card">
        ${renderSpinner("Actualizando usuarios...")}
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
      :where(.usuarios-view-root, [data-usuarios-scope]){
        --usr-row-accent:var(--accent, #6f59d9);
        --usr-row-accent-soft:var(--accent-soft, rgba(111,89,217,.12));
        --usr-create-bg:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #6f59d9 0%, #5f45d8 55%, #4f37bf 100%)));
        --usr-create-bg-hover:var(--usr-create-bg);
        --usr-create-border:var(--btn-primary-border, color-mix(in srgb, var(--accent, #6f59d9) 46%, transparent));
        --usr-table-row-height:84px;

        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
        min-inline-size:0;
        inline-size:100%;
        max-inline-size:100%;
        container-type:inline-size;
      }

      :where(.usuarios-view-root, [data-usuarios-scope]) *,
      :where(.usuarios-view-root, [data-usuarios-scope]) *::before,
      :where(.usuarios-view-root, [data-usuarios-scope]) *::after{ box-sizing:border-box; }

      .usuarios-hero{
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

      .usuarios-hero::after{
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

      .usuarios-hero > *{ position:relative; z-index:1; }

      .usuarios-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .usuarios-hero-copy{ min-inline-size:0; display:grid; gap:var(--space-xs, 10px); }

      .usuarios-page-title{
        margin:0;
        max-inline-size:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, 1.08);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
      }

      .usuarios-page-subtitle{
        margin:0;
        max-inline-size:900px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .usuarios-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .usuarios-btn{
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
        transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease, color .16s ease, opacity .16s ease, filter .16s ease;
      }

      .usuarios-btn svg{ inline-size:16px; block-size:16px; }
      .usuarios-btn:hover{ transform:translateY(var(--ui-hover-lift, -1px)); background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062)); color:var(--text-strong, #fff); box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22)); }
      .usuarios-btn:active{ transform:translateY(0) scale(var(--ui-active-scale, .985)); }

      .usuarios-btn--primary,
      .usuarios-btn--create{
        border-color:var(--usr-create-border);
        background:var(--usr-create-bg);
        color:var(--btn-primary-text, var(--text-on-accent, #fff));
        box-shadow:0 12px 28px color-mix(in srgb, var(--accent, #6f59d9), transparent 78%), var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.10));
      }

      .usuarios-btn--primary:hover,
      .usuarios-btn--create:hover{
        transform:translateY(-2px);
        background:var(--usr-create-bg-hover);
        color:var(--btn-primary-text, #fff);
        box-shadow:0 16px 34px color-mix(in srgb, var(--accent, #6f59d9), transparent 74%), 0 0 0 1px color-mix(in srgb, var(--text-on-accent, #fff) 18%, transparent) inset;
      }

      .usuarios-btn:focus-visible,
      .usuarios-detail-btn:focus-visible,
      .usuarios-pagination-btn:focus-visible,
      .usuarios-filter-pill:focus-visible,
      .usuarios-search-input:focus-visible,
      .usuarios-search-clear:focus-visible{ outline:none; box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16)); }

      .usuarios-btn.is-loading,
      .usuarios-detail-btn.is-loading{ cursor:wait; opacity:.94; }

      .usuarios-btn:disabled,
      .usuarios-btn[aria-disabled="true"],
      .usuarios-detail-btn:disabled,
      .usuarios-detail-btn[aria-disabled="true"]{ pointer-events:none; opacity:.54; filter:saturate(.75); }

      .usuarios-hero-meta{ margin-block-start:var(--space-md, 14px); display:flex; align-items:center; gap:var(--space-xs, 8px); flex-wrap:wrap; }

      .usuarios-meta-pill{
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

      .usuarios-meta-pill svg{ inline-size:14px; block-size:14px; }

      .usuarios-stats{ margin-block-start:var(--space-md, 16px); display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:var(--space-sm, 12px); }

      .usuarios-stat-card{
        --usr-stat-color:var(--accent, #6f59d9);
        position:relative;
        display:grid;
        gap:var(--space-xs, 8px);
        min-block-size:calc(124px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)), var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
        overflow:hidden;
      }

      .usuarios-stat-card::after{
        content:"";
        position:absolute;
        inset:auto -20% -44% auto;
        inline-size:120px;
        block-size:120px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--usr-stat-color) 16%, transparent);
        filter:blur(8px);
      }

      .usuarios-stat-card--total{ --usr-stat-color:var(--accent, #6f59d9); border-color:var(--accent-border, rgba(113,113,122,.30)); }
      .usuarios-stat-card--active{ --usr-stat-color:var(--success, #22c55e); border-color:var(--border-success, rgba(34,197,94,.30)); }
      .usuarios-stat-card--pending{ --usr-stat-color:var(--warning, #f59e0b); border-color:var(--border-warning, rgba(245,158,11,.30)); }
      .usuarios-stat-card--blocked{ --usr-stat-color:var(--error, #ef4444); border-color:var(--border-error, rgba(239,68,68,.30)); }

      .usuarios-stat-label{ font-size:var(--font-xs, 11px); font-weight:var(--weight-bold, 700); letter-spacing:var(--letter-wider, .08em); text-transform:uppercase; color:var(--text-dim, rgba(245,245,245,.50)); }
      .usuarios-stat-value{ font-size:clamp(28px, 3vw, var(--font-5xl, 40px)); line-height:.92; letter-spacing:var(--letter-tight, -.03em); font-weight:var(--weight-black, 800); color:var(--text-strong, #fff); }
      .usuarios-stat-text{ font-size:var(--font-base, 14px); line-height:var(--line-normal, 1.42); color:var(--text-muted, rgba(245,245,245,.70)); }

      .usuarios-history{
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)), var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
        min-inline-size:0;
        max-inline-size:100%;
      }

      .usuarios-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .usuarios-history-copy{ min-inline-size:0; display:grid; gap:var(--space-3xs, 2px); }
      .usuarios-history-title{ margin:0; font-size:var(--section-title-size, var(--font-xl, 16px)); line-height:var(--line-snug, 1.22); font-weight:var(--section-title-weight, var(--weight-bold, 700)); color:var(--section-title-color, var(--text-strong, #fff)); }
      .usuarios-history-subtitle{ margin:0; font-size:var(--section-subtitle-size, var(--font-sm, 12px)); line-height:var(--line-normal, 1.42); color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50))); }

      .usuarios-pagination{ display:flex; align-items:center; gap:var(--space-xs, 8px); flex-wrap:wrap; justify-content:flex-end; }
      .usuarios-pagination-status{ min-block-size:calc(34px * var(--ui-scale, 1)); padding-inline:10px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:var(--font-xs, 11px); font-weight:var(--weight-bold, 700); color:var(--text-dim, rgba(245,245,245,.50)); background:var(--badge-bg, rgba(255,255,255,.048)); border:1px solid var(--badge-border, rgba(255,255,255,.07)); }

      .usuarios-pagination-btn{
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
        transition:transform .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease;
      }

      .usuarios-pagination-btn:hover{ transform:translateY(var(--ui-hover-lift, -1px)); background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062)); border-color:var(--border-strong, rgba(255,255,255,.12)); }
      .usuarios-pagination-btn[disabled], .usuarios-pagination-btn[aria-disabled="true"]{ opacity:.48; cursor:not-allowed; pointer-events:none; transform:none; }

      .usuarios-filters{
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:minmax(0, 1fr) minmax(250px, 390px);
        gap:var(--space-sm, 12px);
        align-items:center;
        padding-block-start:var(--space-xs, 4px);
      }

      .usuarios-filter-pills{ min-inline-size:0; display:flex; align-items:center; gap:var(--space-2xs, 6px); overflow-x:auto; scrollbar-width:none; padding-block:2px; }
      .usuarios-filter-pills::-webkit-scrollbar{ display:none; }

      .usuarios-filter-pill{
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
        transition:transform .16s ease, background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease;
      }

      .usuarios-filter-pill strong{ min-inline-size:22px; min-block-size:20px; padding-inline:6px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; color:inherit; background:color-mix(in srgb, currentColor 10%, transparent); font-size:10px; font-weight:900; }
      .usuarios-filter-pill:hover{ transform:translateY(-1px); border-color:var(--border-strong, rgba(255,255,255,.12)); background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062)); color:var(--text-strong, #fff); }
      .usuarios-filter-pill.is-active{ border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12))); background:color-mix(in srgb, var(--accent, #6f59d9) 14%, var(--badge-bg, rgba(255,255,255,.048))); color:var(--accent-active, var(--text-strong, #fff)); box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #6f59d9), transparent 88%); }

      .usuarios-search{ position:relative; min-inline-size:0; inline-size:100%; display:flex; align-items:center; }
      .usuarios-search-icon{ position:absolute; inset-inline-start:12px; inset-block:0; display:inline-flex; align-items:center; justify-content:center; color:var(--text-dim, rgba(245,245,245,.50)); pointer-events:none; }
      .usuarios-search-icon svg{ inline-size:14px; block-size:14px; }

      .usuarios-search-input{
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
        transition:border-color .16s ease, background .16s ease, color .16s ease, box-shadow .16s ease;
      }

      .usuarios-search-input::placeholder{ color:var(--input-placeholder, var(--text-faint, rgba(245,245,245,.34))); }
      .usuarios-search-input:hover{ border-color:var(--border-strong, rgba(255,255,255,.12)); background:var(--input-bg-hover, var(--btn-secondary-bg-hover, rgba(255,255,255,.062))); }
      .usuarios-search-input:focus{ border-color:color-mix(in srgb, var(--accent, #6f59d9) 42%, var(--border-strong, rgba(255,255,255,.12))); background:var(--input-bg-focus, var(--input-bg, rgba(255,255,255,.045))); }

      .usuarios-search-clear{ appearance:none; position:absolute; inset-inline-end:6px; inset-block:50% auto; transform:translateY(-50%); inline-size:26px; block-size:26px; border-radius:999px; border:1px solid transparent; background:transparent; color:var(--text-dim, rgba(245,245,245,.50)); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0; transition:background .16s ease, color .16s ease, border-color .16s ease; }
      .usuarios-search-clear:hover{ color:var(--text-strong, #fff); background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062)); border-color:var(--border-default, rgba(255,255,255,.09)); }
      .usuarios-search-clear svg{ inline-size:13px; block-size:13px; }

      .usuarios-table-wrap{ position:relative; min-block-size:120px; min-inline-size:0; max-inline-size:100%; }
      .usuarios-table-wrap.is-refreshing .usuarios-table-shell{ opacity:.56; filter:blur(.7px); }

      .usuarios-table-shell{ inline-size:100%; max-inline-size:100%; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; scrollbar-color:var(--scrollbar-thumb, rgba(255,255,255,.12)) transparent; }
      .usuarios-table-shell::-webkit-scrollbar{ block-size:var(--scrollbar-size, 10px); }
      .usuarios-table-shell::-webkit-scrollbar-track{ background:transparent; }
      .usuarios-table-shell::-webkit-scrollbar-thumb{ border:2px solid transparent; border-radius:999px; background:var(--scrollbar-thumb, rgba(255,255,255,.12)); background-clip:padding-box; }

      .usuarios-table{
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

      .usuarios-table colgroup{ display:table-column-group !important; }
      .usuarios-table col{ display:table-column !important; }
      .usuarios-table thead{ display:table-header-group !important; }
      .usuarios-table tbody{ display:table-row-group !important; }
      .usuarios-table tr{ display:table-row !important; }
      .usuarios-table th, .usuarios-table td{ display:table-cell !important; }

      .usuarios-table thead th{
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

      .usuarios-table thead th:first-child{ text-align:left; padding-inline-start:24px; }
      .usuarios-table thead th:last-child, .usuarios-table tbody td:last-child{ padding-inline-end:18px; }
      .usuarios-table tbody tr{ block-size:var(--usr-table-row-height); }

      .usuarios-table tbody td{
        padding:calc(12px * var(--ui-scale, 1)) var(--table-cell-padding-x, 12px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
        background:transparent;
      }

      .usuarios-table tbody tr:last-child td{ border-bottom:none; }
      .usuarios-table tbody tr:nth-child(even) td{ background:color-mix(in srgb, var(--surface-elevated, rgba(39,39,42,.88)) 86%, transparent); }
      .usuarios-row:hover{ background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024))); }

      .usuarios-row--active{ --usr-row-accent:var(--success, #22c55e); }
      .usuarios-row--pending{ --usr-row-accent:var(--warning, #f59e0b); }
      .usuarios-row--blocked{ --usr-row-accent:var(--error, #ef4444); }
      .usuarios-row--inactive{ --usr-row-accent:var(--text-dim, rgba(245,245,245,.50)); }

      .usuarios-cell{ min-inline-size:0; }
      .usuarios-cell--main{ position:relative; text-align:left; padding-inline-start:18px !important; }
      .usuarios-cell--main::before{ content:""; position:absolute; inset-block:10px; inset-inline-start:0; inline-size:3px; border-radius:0 999px 999px 0; background:var(--usr-row-accent); opacity:.68; transform:scaleY(.72); transition:opacity .16s ease, transform .16s ease; }
      .usuarios-row:hover .usuarios-cell--main::before{ opacity:1; transform:scaleY(1); }

      .usuarios-cell--status,
      .usuarios-cell--date,
      .usuarios-cell--email,
      .usuarios-cell--location,
      .usuarios-cell--activity,
      .usuarios-cell--actions{ text-align:center; }

      .usuarios-cell--status > *, .usuarios-cell--actions > *{ margin-inline:auto; }

      .usuarios-main{ display:grid; grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr); gap:var(--space-sm, 12px); align-items:center; min-inline-size:0; padding-inline-start:6px; }

      .usuarios-avatar{
        position:relative;
        inline-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        block-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--usuarios-avatar-bg, linear-gradient(135deg, #55555d 0%, #303036 100%));
        box-shadow:0 10px 22px color-mix(in srgb, var(--usuarios-avatar-b, #000) 22%, transparent), 0 0 0 3px color-mix(in srgb, var(--usuarios-avatar-a, #71717a) 24%, transparent), var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .usuarios-avatar::after{ content:""; position:absolute; inset:0; border-radius:inherit; background:radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%), linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08)); pointer-events:none; mix-blend-mode:screen; }
      .usuarios-avatar img{ position:relative; z-index:1; display:block; inline-size:100%; block-size:100%; object-fit:cover; }

      .usuarios-avatar-fallback{ position:absolute; inset:0; z-index:2; display:none; align-items:center; justify-content:center; font-size:var(--font-2xl, 19px); font-weight:var(--weight-black, 800); color:var(--avatar-text, #fff); letter-spacing:-.035em; text-shadow:0 1px 2px rgba(0,0,0,.22), 0 0 16px rgba(255,255,255,.20); }
      .usuarios-avatar[data-fallback="true"] .usuarios-avatar-fallback, .usuarios-avatar--fallback .usuarios-avatar-fallback{ display:flex; }
      .usuarios-avatar[data-fallback="true"] img{ display:none !important; }

      .usuarios-main-copy{ min-inline-size:0; display:grid; gap:var(--space-3xs, 3px); }
      .usuarios-user-line{ display:flex; align-items:center; gap:7px; min-inline-size:0; }
      .usuarios-user-id{ min-inline-size:0; font-size:var(--font-sm, 12px); line-height:1.22; font-weight:var(--weight-bold, 700); letter-spacing:.055em; color:var(--text-dim, rgba(245,245,245,.50)); text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

      .usuarios-role-pill{ flex:0 0 auto; max-inline-size:130px; min-block-size:20px; padding-inline:7px; border-radius:999px; display:inline-flex; align-items:center; font-size:10px; font-weight:800; letter-spacing:.045em; color:var(--text-dim, rgba(245,245,245,.50)); background:var(--badge-bg, rgba(255,255,255,.048)); border:1px solid var(--badge-border, rgba(255,255,255,.07)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:uppercase; }

      .usuarios-user-subject{ font-size:var(--font-lg, 15px); line-height:1.14; font-weight:var(--weight-black, 800); letter-spacing:var(--letter-tight, -.03em); color:var(--text-strong, #fff); overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
      .usuarios-user-description{ font-size:var(--font-md, 13px); line-height:1.3; color:var(--text-dim, rgba(245,245,245,.50)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

      .usuarios-chip{ min-block-size:var(--chip-height, calc(26px * var(--ui-scale, 1))); padding-inline:var(--space-sm, 12px); border-radius:999px; display:inline-flex; align-items:center; justify-content:center; gap:7px; font-size:var(--font-xs, 11px); font-weight:var(--weight-bold, 700); letter-spacing:.045em; text-transform:uppercase; white-space:nowrap; border:1px solid transparent; box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04)); }
      .usuarios-chip-dot{ inline-size:6px; block-size:6px; border-radius:999px; background:currentColor; box-shadow:0 0 0 3px color-mix(in srgb, currentColor 16%, transparent); }
      .usuarios-chip--active{ color:var(--success, #22c55e); background:var(--success-bg, rgba(34,197,94,.10)); border-color:var(--border-success, rgba(34,197,94,.30)); }
      .usuarios-chip--pending{ color:var(--warning, #f59e0b); background:var(--warning-bg, rgba(245,158,11,.10)); border-color:var(--border-warning, rgba(245,158,11,.30)); }
      .usuarios-chip--blocked{ color:var(--error, #ef4444); background:var(--error-bg, rgba(239,68,68,.10)); border-color:var(--border-error, rgba(239,68,68,.30)); }
      .usuarios-chip--inactive{ color:var(--text-dim, rgba(245,245,245,.50)); background:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 12%, transparent); border-color:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 22%, transparent); }

      .usuarios-date-inline,
      .usuarios-email-inline,
      .usuarios-location-inline,
      .usuarios-activity-inline{ display:inline-flex; justify-content:center; inline-size:100%; max-inline-size:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88))); font-size:var(--font-sm, 12px); line-height:1.2; font-weight:var(--weight-semibold, 600); font-variant-numeric:tabular-nums; }

      .usuarios-email-inline{ justify-content:flex-start; text-align:left; }
      .usuarios-cell--email{ text-align:left; }
      .usuarios-cell--actions{ width:1%; white-space:nowrap; }

      .usuarios-detail-btn{
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
        transition:border-color .16s ease, background .16s ease, transform .16s ease, opacity .16s ease, color .16s ease, box-shadow .16s ease, filter .16s ease;
      }

      .usuarios-action-icon{ display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; }
      .usuarios-action-icon svg{ inline-size:14px; block-size:14px; }
      .usuarios-detail-btn:hover{ border-color:var(--border-strong, rgba(255,255,255,.12)); background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062)); color:var(--text-strong, #fff); transform:translateY(var(--ui-hover-lift, -1px)); }
      .usuarios-detail-btn:active{ transform:translateY(0) scale(var(--ui-active-scale, .985)); }
      .usuarios-detail-btn.is-loading{ justify-content:center; }

      .usuarios-loader-only{ display:inline-flex; inline-size:16px; block-size:16px; align-items:center; justify-content:center; flex:0 0 auto; }
      .usuarios-inline-loading{ display:inline-flex; align-items:center; justify-content:center; gap:var(--space-xs, 7px); white-space:nowrap; }
      .usuarios-inline-loading-text{ display:inline-block; }
      .usuarios-inline-spinner{ inline-size:14px; block-size:14px; border-radius:999px; border:2px solid var(--loader-ring, rgba(255,255,255,.12)); border-top-color:currentColor; animation:usuariosSpin .78s linear infinite; flex:0 0 auto; }

      .usuarios-refresh-overlay{ position:absolute; inset:0; z-index:3; display:grid; place-items:center; pointer-events:none; background:color-mix(in srgb, var(--backdrop-bg, rgba(10,10,12,.28)) 72%, transparent); backdrop-filter:var(--blur-sm, blur(8px)); -webkit-backdrop-filter:var(--blur-sm, blur(8px)); }
      .usuarios-refresh-card{ display:inline-flex; align-items:center; justify-content:center; min-block-size:var(--btn-height, 42px); padding-inline:var(--space-md, 16px); border-radius:var(--radius-md, 14px); border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082))); background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94))); color:var(--text-soft, rgba(245,245,245,.88)); font-size:var(--font-md, 13px); font-weight:var(--weight-bold, 700); box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28)); }

      .usuarios-table-loading{ padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px); display:grid; gap:var(--space-sm, 12px); }
      .usuarios-table-loading-row{ display:grid; grid-template-columns:var(--avatar-size-lg, 44px) minmax(220px, 1fr) 98px 98px 170px 92px 122px 96px; gap:var(--space-sm, 12px); align-items:center; }
      .usuarios-table-loading-copy{ display:grid; gap:var(--space-xs, 7px); }
      .usuarios-skeleton{ position:relative; overflow:hidden; border-radius:var(--skeleton-radius, var(--radius-md, 13px)); background:var(--skeleton-bg, rgba(255,255,255,.050)); }
      .usuarios-skeleton::after{ content:""; position:absolute; inset:0; transform:translateX(-100%); background:linear-gradient(90deg, transparent, var(--skeleton-shine, rgba(255,255,255,.095)), transparent); animation:usuariosSkeleton 1.2s ease-in-out infinite; }
      .usuarios-skeleton--avatar{ inline-size:44px; block-size:44px; border-radius:999px; }
      .usuarios-skeleton--xs{ inline-size:120px; block-size:10px; }
      .usuarios-skeleton--lg{ inline-size:74%; block-size:14px; }
      .usuarios-skeleton--md{ inline-size:56%; block-size:12px; }
      .usuarios-skeleton--pill{ inline-size:92px; block-size:30px; border-radius:999px; }
      .usuarios-skeleton--date{ inline-size:112px; block-size:12px; }
      .usuarios-skeleton--email{ inline-size:160px; block-size:12px; }
      .usuarios-skeleton--btn{ inline-size:96px; block-size:34px; border-radius:12px; }

      .usuarios-empty{ display:grid; justify-items:center; gap:var(--space-xs, 8px); padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px); text-align:center; }
      .usuarios-empty-icon{ inline-size:54px; block-size:54px; display:grid; place-items:center; border-radius:var(--radius-xl, 18px); border:1px solid var(--state-empty-border, rgba(148,163,184,.20)); background:var(--state-empty-bg, rgba(148,163,184,.10)); color:var(--state-empty-icon, var(--info, #94a3b8)); box-shadow:var(--shadow-soft, 0 8px 18px rgba(0,0,0,.13)); }
      .usuarios-empty-icon svg{ inline-size:24px; block-size:24px; }
      .usuarios-empty-title{ margin:0; font-size:var(--font-2xl, 18px); font-weight:var(--weight-bold, 700); color:var(--text-strong, #fff); }
      .usuarios-empty-text{ margin:0; max-inline-size:58ch; font-size:var(--font-md, 13px); line-height:var(--line-relaxed, 1.62); color:var(--text-muted, rgba(245,245,245,.70)); }

      .usuarios-error{ display:grid; justify-items:start; gap:var(--space-xs, 10px); padding:var(--space-xl, 24px) var(--space-xl, 22px); border-radius:22px; border:1px solid var(--border-error, rgba(239,68,68,.30)); background:var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)), color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 46%, var(--card-bg, transparent)); box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)); }
      .usuarios-error-title{ margin:0; font-size:var(--font-2xl, 18px); font-weight:var(--weight-bold, 700); color:var(--text-strong, #fff); }
      .usuarios-error-text{ margin:0; font-size:var(--font-md, 13px); line-height:1.62; color:var(--text-muted, rgba(245,245,245,.70)); }

      @keyframes usuariosSpin{ to{ transform:rotate(360deg); } }
      @keyframes usuariosSkeleton{ to{ transform:translateX(100%); } }

      [data-theme="light"] .usuarios-hero,
      [data-theme="light"] .usuarios-history{
        background:radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 38%), radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 7%, transparent), transparent 34%), var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)), var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #fff))));
      }

      [data-theme="light"] .usuarios-stat-card{ background:var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)), var(--card-bg, var(--surface-elevated, #fff)); }
      [data-theme="light"] .usuarios-btn--create{ --usr-create-bg:var(--btn-primary-bg, linear-gradient(135deg, var(--accent, #6f59d9) 0%, var(--accent-hover, #5f45d8) 100%)); --usr-create-bg-hover:var(--usr-create-bg); --usr-create-border:color-mix(in srgb, var(--accent, #6f59d9) 44%, transparent); }
      [data-theme="light"] .usuarios-filter-pill.is-active{ color:var(--accent-active, #533cb6); background:var(--accent-soft, rgba(111,89,217,.125)); border-color:var(--accent-border-strong, rgba(111,89,217,.36)); }
      [data-theme="light"] .usuarios-search-input{ color:var(--input-text, var(--text, #111827)); background:var(--input-bg, rgba(255,255,255,.76)); border-color:var(--input-border, var(--border-default, rgba(15,23,42,.10))); }
      [data-theme="light"] .usuarios-search-icon, [data-theme="light"] .usuarios-search-clear{ color:var(--text-dim, rgba(15,23,42,.50)); }
      [data-theme="light"] .usuarios-search-clear:hover{ color:var(--text-strong, #111827); background:var(--btn-secondary-bg-hover, rgba(15,23,42,.052)); }
      [data-theme="light"] .usuarios-chip--active{ color:var(--success-hover, #157a4f); background:var(--success-soft, rgba(31,157,104,.12)); border-color:var(--border-success, rgba(22,163,74,.245)); }
      [data-theme="light"] .usuarios-chip--pending{ color:var(--warning-hover, #9c6110); background:var(--warning-soft, rgba(192,122,22,.12)); border-color:var(--border-warning, rgba(217,119,6,.245)); }
      [data-theme="light"] .usuarios-chip--blocked{ color:var(--error-hover, #b52a39); background:var(--error-soft, rgba(216,60,77,.12)); border-color:var(--border-error, rgba(220,38,38,.245)); }
      [data-theme="light"] .usuarios-chip--inactive{ color:var(--text-muted, #64748b); background:color-mix(in srgb, var(--text-muted, #64748b) 10%, transparent); border-color:color-mix(in srgb, var(--text-muted, #64748b) 18%, transparent); }

      @media (max-width:1240px){
        .usuarios-stats{ grid-template-columns:repeat(2, minmax(0, 1fr)); }
        .usuarios-filters{ grid-template-columns:1fr; }
        .usuarios-search{ max-inline-size:520px; }
      }

      @media (max-width:1180px){
        .usuarios-hero{ padding:var(--space-lg, 20px); }
        .usuarios-hero-top{ grid-template-columns:1fr; }
        .usuarios-hero-actions{ justify-content:flex-start; }
      }

      @media (max-width:1100px){ .usuarios-table{ min-inline-size:980px; } }

      @media (max-width:760px){
        :where(.usuarios-view-root, [data-usuarios-scope]){ gap:var(--space-md, 16px); }
        .usuarios-hero{ padding:var(--space-lg, 18px) var(--space-md, 16px); border-radius:var(--radius-xl, 18px); }
        .usuarios-history{ border-radius:var(--radius-xl, 18px); }
        .usuarios-history-head{ grid-template-columns:1fr; padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px); }
        .usuarios-pagination{ justify-content:flex-start; }
        .usuarios-stats{ grid-template-columns:1fr; }
        .usuarios-page-title{ font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px)); line-height:1; }
        .usuarios-page-subtitle{ font-size:var(--font-base, 14px); }
        .usuarios-hero-actions{ inline-size:100%; }
        .usuarios-btn{ flex:1 1 auto; }
        .usuarios-search{ max-inline-size:none; }
      }

      @media (max-width:520px){
        .usuarios-meta-pill{ inline-size:100%; justify-content:center; }
        .usuarios-hero-actions{ display:grid; grid-template-columns:1fr; }
        .usuarios-btn{ inline-size:100%; }
        .usuarios-filter-pills{ margin-inline:-2px; }
      }

      @media (prefers-reduced-motion: reduce){
        :where(.usuarios-view-root, [data-usuarios-scope]) *,
        :where(.usuarios-view-root, [data-usuarios-scope]) *::before,
        :where(.usuarios-view-root, [data-usuarios-scope]) *::after{ animation:none !important; transition:none !important; }
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

  const title = safeText(first(data.title, state.title, "Centro de control de usuarios"), "Centro de control de usuarios");

  const subtitle = safeText(
    first(
      data.subtitle,
      state.subtitle,
      "Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara, compacta y alineada con el sistema."
    ),
    ""
  );

  const creating = Boolean(first(state.creating, state.creatingUsuario, data.creating));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const loading = Boolean(first(state.loading, data.loading));
  const exporting = Boolean(first(state.exporting, data.exporting));
  const includeStyles = data.includeStyles !== false;

  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="usuarios-hero">
      <div class="usuarios-hero-top">
        <div class="usuarios-hero-copy">
          <h1 class="usuarios-page-title">${escapeHtml(title)}</h1>
          <p class="usuarios-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="usuarios-hero-actions">
          <button
            type="button"
            id="usuarios-refresh-btn"
            class="usuarios-btn${refreshing ? " is-loading" : ""}"
            data-usuarios-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${refreshing ? renderSpinner("Actualizando...") : `${icon("refresh")}<span class="usuarios-btn-text">Actualizar</span>`}
          </button>

          <button
            type="button"
            id="usuarios-export-btn"
            class="usuarios-btn${exporting ? " is-loading" : ""}"
            data-usuarios-action="export"
            data-action="export-csv"
            ${loading || refreshing || exporting || !items.length ? 'disabled aria-disabled="true"' : ""}
          >
            ${exporting ? renderSpinner("Exportando...") : `${icon("export")}<span class="usuarios-btn-text">Exportar CSV</span>`}
          </button>

          <button
            type="button"
            id="usuarios-create-btn"
            class="usuarios-btn usuarios-btn--primary usuarios-btn--create${creating ? " is-loading" : ""}"
            data-usuarios-action="create"
            data-action="create-user"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${creating ? renderSpinner("Abriendo...") : `${icon("plus")}<span class="usuarios-btn-text">Nuevo usuario</span>`}
          </button>
        </div>
      </div>

      <div class="usuarios-hero-meta">
        <span class="usuarios-meta-pill">${icon("shield")}Panel admin</span>
        <span class="usuarios-meta-pill">${icon("users")}${escapeHtml(`${remoteCount} usuarios registrados`)}</span>
        <span class="usuarios-meta-pill">${icon("refresh")}${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin sincronización reciente"}</span>
        <span class="usuarios-meta-pill">${icon("clock")}${escapeHtml(`${stats.withAccessCount} con actividad`)}</span>
      </div>

      <div class="usuarios-stats">
        <article class="usuarios-stat-card usuarios-stat-card--total">
          <div class="usuarios-stat-label">Usuarios visibles</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="usuarios-stat-text">Cuentas cargadas en la colección actual.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--active">
          <div class="usuarios-stat-label">Activos</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.activeCount))}</div>
          <div class="usuarios-stat-text">Usuarios operativos o habilitados actualmente.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--pending">
          <div class="usuarios-stat-label">Pendientes</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="usuarios-stat-text">Invitaciones o accesos pendientes de completar.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--blocked">
          <div class="usuarios-stat-label">Bloqueados</div>
          <div class="usuarios-stat-value">${escapeHtml(String(stats.blockedCount))}</div>
          <div class="usuarios-stat-text">Cuentas bloqueadas, inactivas o restringidas.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR
========================================================= */

export function renderLoadingState({ includeStyles = false } = {}) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="usuarios-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(
  message = "No se pudieron cargar los usuarios.",
  { includeStyles = false } = {}
) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="usuarios-error">
      <h3 class="usuarios-error-title">No se pudo renderizar la vista de usuarios</h3>
      <p class="usuarios-error-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
    </section>
  `;
}

export function renderAccessDeniedState({ includeStyles = false } = {}) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="usuarios-history">
      ${renderEmptyContent({ restricted: true })}
    </section>
  `;
}

export function renderEmptyUsuariosState(options = {}) {
  return `
    ${renderMaybeStyles(Boolean(options?.includeStyles))}

    <section class="usuarios-history">
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
    ? "Cargando usuarios..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="usuarios-history">
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Historial de usuarios</h2>
          <p class="usuarios-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderPagination(pagination, state)}
        ${renderFilters(data, pagination)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="usuarios-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="usuarios-table-shell">
                      <table class="usuarios-table" role="table" aria-label="Listado de usuarios">
                        <colgroup>
                          <col>
                          <col style="width:118px;">
                          <col style="width:118px;">
                          <col style="width:220px;">
                          <col style="width:116px;">
                          <col style="width:146px;">
                          <col style="width:116px;">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Usuario</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Alta</th>
                            <th scope="col">Email</th>
                            <th scope="col">Ciudad</th>
                            <th scope="col">Última conexión</th>
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

    <section class="usuarios-history">
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

export function renderUsuariosTableTemplate(input = {}) {
  const data = safeObject(input);

  if (shouldRenderRestricted(data)) {
    return `
      <section class="usuarios-view-root" data-usuarios-scope="true">
        ${renderStyles()}
        ${renderAccessDeniedState({ includeStyles: false })}
      </section>
    `;
  }

  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  if (state.error && !items.length) {
    return `
      <section class="usuarios-view-root" data-usuarios-scope="true">
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
    <section class="usuarios-view-root" data-usuarios-scope="true">
      ${renderStyles()}
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderUsuariosTableTemplate;

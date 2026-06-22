/* =========================================================
   Onion Support - Clientes Template
   Archivo: /src/views/clientes/clientes.template.js

   PRODUCTIVO · TEMPLATE PURO · SIN PÁGINAS · LOAD MORE · 10/10

   Responsabilidad:
   - Render del hero/header de Clientes.
   - Render de stats.
   - Render de historial/tabla.
   - Filtros + búsqueda.
   - Sin paginación clásica.
   - Compatible con index.js controlador único.
   - Compatible de transición con clientes.table.template.js.
   - Compatible con CSS /src/css/views/clientes/index.css.
   - Sin imports.
   - Sin HTTP.
   - Sin DOM directo.
   - Sin Store.
   - Sin Router.
   - Sin modales.
   - Sin <style>.
   - Sin style="".
   - Sin handlers inline.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const CLIENTES_TEMPLATE_VERSION =
  "clientes.template.productive.v1.no-pages.load-more";

export const CLIENTES_TABLE_TEMPLATE_VERSION = CLIENTES_TEMPLATE_VERSION;
export const CLIENTES_VIEW_TEMPLATE_VERSION = CLIENTES_TEMPLATE_VERSION;

export const CLIENTES_ACTIONS = Object.freeze({
  DETAIL: "detail",
  CREATE: "create",
  REFRESH: "refresh",
  RETRY: "retry",
  EXPORT: "export",
  FILTER: "filter",
  CLEAR_SEARCH: "clear-search",
  CLEAR_FILTERS: "clear-filters",
  LOAD_MORE: "load-more",
});

export const CLIENTES_TABLE_ACTIONS = CLIENTES_ACTIONS;

export const CLIENTES_DEFAULT_VISIBLE_ROWS = 20;
export const CLIENTES_DEFAULT_PAGE_SIZE = CLIENTES_DEFAULT_VISIBLE_ROWS;

const DEFAULT_VISIBLE_ROWS = CLIENTES_DEFAULT_VISIBLE_ROWS;
const VISIBLE_STEP = 20;
const AVATAR_TONE_COUNT = 10;

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
  { key: "vip", label: "VIP" },
]);

export const CLIENTES_TABLE_COLUMNS = Object.freeze([
  { key: "main", label: "Cliente", colClass: "clientes-col clientes-col--main" },
  { key: "status", label: "Estado", colClass: "clientes-col clientes-col--status" },
  { key: "date", label: "Alta", colClass: "clientes-col clientes-col--date" },
  { key: "email", label: "Email", colClass: "clientes-col clientes-col--email" },
  { key: "location", label: "Ciudad", colClass: "clientes-col clientes-col--location" },
  { key: "amount", label: "Importe", colClass: "clientes-col clientes-col--amount" },
  { key: "actions", label: "Acciones", colClass: "clientes-col clientes-col--actions" },
]);

/* =========================================================
   SAFE HELPERS
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

function safeText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

/*
  IMPORTANTE:
  No aplanar arrays en first().
  Si payload trae { items: [...] }, aplanar rompe el listado.
*/
function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

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

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(safeNumber(value, min), min), max);
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
  return escapeHtml(safeText(value, ""));
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

function normalizeSearch(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/* =========================================================
   DATE / FORMAT
========================================================= */

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
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

    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  const ms = date.getTime();

  return Number.isFinite(ms) ? ms : 0;
}

function formatDateShort(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatDateTime(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
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

  if (!ts) return "Sin actividad";

  const diffHours = Math.abs(Date.now() - ts) / 3600000;

  return diffHours <= 72 ? formatRelativeDate(value) : formatDateTime(value);
}

function formatAmount(value = 0) {
  const amount = safeNumber(value, 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} €`;
  }
}

function formatPhone(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";

  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return raw;

  let prefix = "";
  let national = digits;

  if (digits.length === 11 && digits.startsWith("34")) {
    prefix = "+34 ";
    national = digits.slice(2);
  } else if (raw.trim().startsWith("+34") && digits.length >= 11) {
    prefix = "+34 ";
    national = digits.slice(-9);
  }

  if (national.length === 9) {
    return `${prefix}${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }

  return raw;
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = [
    'aria-hidden="true"',
    'focusable="false"',
    'width="16"',
    'height="16"',
    'viewBox="0 0 24 24"',
    'fill="none"',
    'stroke="currentColor"',
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(" ");

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h10"/><path d="M19 5.5A7 7 0 1 0 19 18.5"/></svg>`,
    phone: `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,
    mail: `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`,
    map: `<svg ${common}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   PAYLOAD / MODEL
========================================================= */

function unwrapItemsEnvelope(payload = null, maxDepth = 8) {
  if (Array.isArray(payload)) return payload;

  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);

    for (const key of [
      "items",
      "rows",
      "clients",
      "clientes",
      "customers",
      "results",
      "records",
      "docs",
      "documents",
      "list",
      "value",
    ]) {
      if (Array.isArray(value[key])) return value[key];
    }

    for (const key of ["data", "payload", "result", "response", "body"]) {
      const nested = value[key];

      if (Array.isArray(nested)) return nested;
      if (isObject(nested)) queue.push({ value: nested, depth: depth + 1 });
    }
  }

  return [];
}

function getResolvedItems(input = {}) {
  const data = safeObject(input);

  return unwrapItemsEnvelope(
    first(
      data.items,
      data.clientes,
      data.clients,
      data.customers,
      data.rows,
      data.results,
      data.data,
      data.payload,
      data.response,
      data.state?.items,
      data.state?.clientes,
      data.state?.clients,
      []
    )
  );
}

function resolveRemoteCount(input = {}, items = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return Math.max(
    safeArray(items).length,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.total,
        data.count,
        state.remoteCount,
        state.totalCount,
        state.total,
        state.count,
        safeArray(items).length
      ),
      safeArray(items).length
    )
  );
}

function getRaw(item = {}) {
  return safeObject(item?.raw, {});
}

function getClienteId(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item.uid,
      item._id,
      item.code,
      item.codigo,
      item.nif,
      item.cif,
      item.email,

      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw.uid,
      raw._id,
      raw.code,
      raw.codigo,
      raw.nif,
      raw.cif,
      raw.email,
      ""
    ),
    ""
  );
}

function getClienteCode(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.code,
      item.codigo,
      item.clienteCode,
      item.clienteId,
      item.clientId,
      item.id,
      item.nif,
      item.cif,
      raw.code,
      raw.codigo,
      raw.clienteCode,
      raw.clienteId,
      raw.clientId,
      raw.id,
      raw.nif,
      raw.cif,
      "CLI-SIN-ID"
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(item = {}) {
  const raw = getRaw(item);

  const firstName = safeText(first(item.firstName, item.nombre, raw.firstName, raw.nombre), "");
  const lastName = safeText(first(item.lastName, item.apellidos, raw.lastName, raw.apellidos), "");
  const composed = safeText(`${firstName} ${lastName}`, "");

  return safeText(
    first(
      item.razonSocial,
      item.businessName,
      item.companyName,
      item.empresa,
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      composed,
      item.email,

      raw.razonSocial,
      raw.businessName,
      raw.companyName,
      raw.empresa,
      raw.fullName,
      raw.displayName,
      raw.name,
      raw.nombre,
      raw.email,
      "Cliente"
    ),
    "Cliente"
  );
}

function getClienteEmail(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.email,
      item.mail,
      item.emailLower,
      item.contactEmail,
      item.billingEmail,
      item.facturacionEmail,

      raw.email,
      raw.mail,
      raw.emailLower,
      raw.contactEmail,
      raw.billingEmail,
      raw.facturacionEmail,
      ""
    ),
    ""
  ).toLowerCase();
}

function getClientePhone(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.movil,
      item.phoneNumber,
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.movil,
      raw.phoneNumber,
      ""
    ),
    ""
  );
}

function getClienteLocation(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.city,
      item.ciudad,
      item.locationCity,
      item.location?.city,
      item.location?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,

      raw.city,
      raw.ciudad,
      raw.locationCity,
      raw.location?.city,
      raw.location?.ciudad,
      raw.address?.city,
      raw.address?.ciudad,
      raw.direccion?.city,
      raw.direccion?.ciudad,
      ""
    ),
    ""
  );
}

function getClienteNif(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.nif,
      item.cif,
      item.taxId,
      item.vat,
      item.documentId,
      raw.nif,
      raw.cif,
      raw.taxId,
      raw.vat,
      raw.documentId,
      ""
    ),
    ""
  ).toUpperCase();
}

function getClienteAvatarUrl(item = {}) {
  const raw = getRaw(item);

  return safeText(
    first(
      item.avatarUrl,
      item.avatar,
      item.picture,
      item.photoUrl,
      item.photoURL,
      item.imageUrl,
      raw.avatarUrl,
      raw.avatar,
      raw.picture,
      raw.photoUrl,
      raw.photoURL,
      raw.imageUrl,
      ""
    ),
    ""
  );
}

function getClienteInitials(item = {}) {
  const text = getClienteName(item);
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || "CL";

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "CL";
}

function getClienteType(item = {}) {
  const raw = getRaw(item);

  return normalizeKey(
    first(
      item.type,
      item.tipo,
      item.kind,
      item.segment,
      item.category,
      raw.type,
      raw.tipo,
      raw.kind,
      raw.segment,
      raw.category,
      "cliente"
    )
  );
}

function getClienteTypeLabel(item = {}) {
  const type = getClienteType(item);

  if (type === "empresa" || type === "company" || type === "business" || type === "b2b") return "Empresa";
  if (type === "particular" || type === "persona" || type === "individual" || type === "b2c") return "Particular";
  if (type === "vip" || type === "premium") return "VIP";

  return "Cliente";
}

function getStatusValue(item = {}) {
  const raw = getRaw(item);

  const explicit = first(
    item.status,
    item.estado,
    item.state,
    item.clientStatus,
    raw.status,
    raw.estado,
    raw.state,
    raw.clientStatus
  );

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return normalizeKey(explicit);
  }

  if (item.vip === true || item.isVip === true || raw.vip === true || raw.isVip === true) return "vip";

  const active = first(
    item.active,
    item.isActive,
    item.enabled,
    raw.active,
    raw.isActive,
    raw.enabled
  );

  if (active === false) return "blocked";
  if (active === true) return "active";

  return "active";
}

function statusBucket(item = {}) {
  const status = getStatusValue(item);

  if (["vip", "premium"].includes(status)) return "vip";
  if (["pending", "pendiente", "new", "nuevo", "invited", "invitation_pending", "unverified"].includes(status)) return "pending";
  if (["blocked", "bloqueado", "bloqueada", "inactive", "inactivo", "inactiva", "disabled", "suspended", "deleted", "archived"].includes(status)) return "blocked";

  return "active";
}

function getStatusLabel(itemOrStatus = {}) {
  const status =
    typeof itemOrStatus === "object"
      ? statusBucket(itemOrStatus)
      : statusBucket({ status: itemOrStatus });

  if (status === "active") return "Activa";
  if (status === "pending") return "Pendiente";
  if (status === "blocked") return "Bloqueada";
  if (status === "vip") return "VIP";

  return safeText(itemOrStatus, "Activa");
}

function getCreatedAt(item = {}) {
  const raw = getRaw(item);

  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.registeredAt,
    item.created,
    item.fechaAlta,
    item.altaAt,
    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    raw.registeredAt,
    raw.created,
    raw.fechaAlta,
    raw.altaAt,
    null
  );
}

function getUpdatedAt(item = {}) {
  const raw = getRaw(item);

  return first(
    item.lastActivityAt,
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.lastInvoiceAt,
    item.lastTicketAt,
    item.lastContactAt,
    item.createdAt,

    raw.lastActivityAt,
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastInvoiceAt,
    raw.lastTicketAt,
    raw.lastContactAt,
    raw.createdAt,
    null
  );
}

function getSortTimestamp(item = {}) {
  return (
    toTimestamp(getUpdatedAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    0
  );
}

function compareClientesNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);

  if (diff !== 0) return diff;

  return getClienteCode(a).localeCompare(getClienteCode(b), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortClientesNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareClientesNewestFirst);
}

function normalizeClienteModel(item = {}) {
  const raw = safeObject(item);
  const id = getClienteId(raw);
  const email = getClienteEmail(raw);
  const name = getClienteName(raw);
  const status = getStatusValue(raw);
  const type = getClienteType(raw);
  const avatarUrl = getClienteAvatarUrl(raw);

  return {
    ...raw,
    raw,

    id: id || email,
    clienteId: first(raw.clienteId, raw.clientId, id, email, ""),
    clientId: first(raw.clientId, raw.clienteId, id, email, ""),
    customerId: first(raw.customerId, id, email, ""),
    uid: first(raw.uid, id, email, ""),

    code: getClienteCode(raw),
    codigo: getClienteCode(raw),

    name,
    nombre: name,
    fullName: name,
    displayName: name,
    razonSocial: first(raw.razonSocial, raw.businessName, raw.companyName, name),

    email,
    emailLower: email,
    mail: email,

    phone: getClientePhone(raw),
    telefono: getClientePhone(raw),
    mobile: getClientePhone(raw),

    city: getClienteLocation(raw),
    ciudad: getClienteLocation(raw),
    nif: getClienteNif(raw),
    cif: getClienteNif(raw),

    type,
    tipo: type,
    role: type,
    rol: type,
    segment: normalizeKey(first(raw.segment, type, "")),

    status,
    estado: status,
    state: status,
    active: status === "active" || status === "vip",
    blocked: status === "blocked",
    vip: status === "vip" || raw.vip === true || raw.isVip === true,
    isVip: status === "vip" || raw.vip === true || raw.isVip === true,

    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),
    lastActivityAt: first(raw.lastActivityAt, raw.lastInvoiceAt, raw.lastTicketAt, raw.updatedAt, ""),

    invoicesCount: safeNumber(first(raw.invoicesCount, raw.facturasCount, raw.invoiceCount), 0),
    ticketsCount: safeNumber(first(raw.ticketsCount, raw.incidenciasCount, raw.ticketCount), 0),
    totalAmount: safeNumber(first(raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.invoicesTotal, raw.amount), 0),

    avatarUrl,
    avatar: avatarUrl,
    hasAvatar: Boolean(avatarUrl),
  };
}

function normalizeClientesCollection(items = []) {
  const map = new Map();
  let anonymousIndex = 0;

  for (const value of safeArray(items)) {
    if (!isObject(value)) continue;

    const normalized = normalizeClienteModel(value);
    const id = getClienteId(normalized) || normalized.email || `anonymous:${anonymousIndex++}`;

    if (map.has(id)) {
      map.set(id, {
        ...map.get(id),
        ...normalized,
        raw: {
          ...safeObject(map.get(id)?.raw),
          ...safeObject(normalized.raw),
        },
      });
      continue;
    }

    map.set(id, normalized);
  }

  return [...map.values()].sort(compareClientesNewestFirst);
}

/* =========================================================
   FILTERS / STATS / VM
========================================================= */

function normalizeFilter(value = "all") {
  const filter = normalizeKey(value || "all");

  if (["all", "todos", "todas", "todo"].includes(filter)) return "all";
  if (["active", "activo", "activa", "activos", "activas"].includes(filter)) return "active";
  if (["pending", "pendiente", "pendientes", "new", "nuevo"].includes(filter)) return "pending";
  if (["blocked", "bloqueado", "bloqueada", "bloqueados", "inactivo", "inactive"].includes(filter)) return "blocked";
  if (["vip", "premium"].includes(filter)) return "vip";

  return "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return normalizeFilter(first(data.filter, data.activeFilter, state.filter, state.activeFilter, "all"));
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return safeText(first(data.search, data.query, data.q, state.search, state.query, state.q, ""), "");
}

function itemMatchesFilter(item = {}, filter = "all") {
  const active = normalizeFilter(filter);

  if (active === "all") return true;

  return statusBucket(item) === active;
}

function getSearchHaystack(item = {}) {
  return normalizeSearch(
    [
      getClienteId(item),
      getClienteCode(item),
      getClienteName(item),
      getClienteEmail(item),
      getClientePhone(item),
      getClienteLocation(item),
      getClienteNif(item),
      getClienteType(item),
      getClienteTypeLabel(item),
      getStatusLabel(item),
      item.segment,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function itemMatchesSearch(item = {}, query = "") {
  const needle = normalizeSearch(query);
  if (!needle) return true;

  const terms = needle.split(" ").filter(Boolean);
  const haystack = getSearchHaystack(item);

  return terms.every((term) => haystack.includes(term));
}

function filterAndSortClientes(items = [], input = {}) {
  const filter = getActiveFilter(input);
  const search = getSearchQuery(input);

  return sortClientesNewestFirst(items).filter((item) => {
    return itemMatchesFilter(item, filter) && itemMatchesSearch(item, search);
  });
}

function computeStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      acc.total += 1;

      const bucket = statusBucket(item);

      if (bucket === "active") acc.activeCount += 1;
      if (bucket === "pending") acc.pendingCount += 1;
      if (bucket === "blocked") acc.blockedCount += 1;
      if (bucket === "vip") acc.vipCount += 1;

      acc.invoicesCount += safeNumber(item.invoicesCount, 0);
      acc.ticketsCount += safeNumber(item.ticketsCount, 0);
      acc.totalAmount += safeNumber(item.totalAmount, 0);

      return acc;
    },
    {
      total: 0,
      activeCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      vipCount: 0,
      invoicesCount: 0,
      ticketsCount: 0,
      totalAmount: 0,
    }
  );
}

function normalizeVisibleLimit(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return clamp(
    safeNumber(
      first(
        data.visibleLimit,
        data.limit,
        state.visibleLimit,
        state.clientesVisibleLimit,
        state.limit,
        DEFAULT_VISIBLE_ROWS
      ),
      DEFAULT_VISIBLE_ROWS
    ),
    1,
    500
  );
}

function getViewModel(input = {}) {
  const data = safeObject(input);
  const rawItems = getResolvedItems(data);
  const items = normalizeClientesCollection(rawItems);
  const filteredItems = filterAndSortClientes(items, data);
  const visibleLimit = normalizeVisibleLimit(data);
  const visibleItems = filteredItems.slice(0, visibleLimit);

  const remoteCount = resolveRemoteCount(data, items);
  const stats = computeStats(items);
  const activeFilter = getActiveFilter(data);
  const searchQuery = getSearchQuery(data);
  const filtering = activeFilter !== "all" || Boolean(searchQuery);

  return {
    data,
    items,
    filteredItems,
    visibleItems,
    stats,

    remoteCount,
    totalCount: filtering ? filteredItems.length : Math.max(remoteCount, items.length),
    filteredCount: filteredItems.length,

    visibleLimit,
    visibleCount: visibleItems.length,
    remainingCount: Math.max(0, filteredItems.length - visibleItems.length),
    hasMore: visibleItems.length < filteredItems.length,

    activeFilter,
    searchQuery,
    filtering,

    loading: Boolean(first(data.loading, data.state?.loading, false)),
    refreshing: Boolean(first(data.refreshing, data.state?.refreshing, false)),
    error: safeText(first(data.error, data.state?.error, ""), ""),

    lastSyncAt: first(data.lastSyncAt, data.state?.lastSyncAt, null),
    forbidden: Boolean(first(data.forbidden, data.accessDenied, data.restricted, data.state?.forbidden, false)),
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "Cargando") {
  return `
    <span class="clientes-spinner" aria-hidden="true"></span>
    <span class="clientes-visually-hidden">${escapeHtml(label)}</span>
  `;
}

function getAvatarToneClass(item = {}) {
  const seed = getClienteId(item) || getClienteEmail(item) || getClienteName(item);
  return `clientes-avatar-tone-${hashString(seed) % AVATAR_TONE_COUNT}`;
}

function renderAvatar(item = {}) {
  const avatarUrl = getClienteAvatarUrl(item);
  const initials = getClienteInitials(item);
  const tone = getAvatarToneClass(item);

  return `
    <span class="clientes-avatar ${tone} ${avatarUrl ? "has-image" : "is-fallback"}" data-has-avatar="${avatarUrl ? "true" : "false"}">
      ${
        avatarUrl && isRenderableImageUrl(avatarUrl)
          ? `<img class="clientes-avatar-img" src="${attr(avatarUrl)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
          : `<span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>`
      }
    </span>
  `;
}

function renderStatusChip(item = {}) {
  const bucket = statusBucket(item);

  return `
    <span class="clientes-status-chip clientes-status-chip--${attr(bucket)} is-${attr(bucket)}" data-status="${attr(bucket)}">
      <span class="clientes-status-dot" aria-hidden="true"></span>
      <span>${escapeHtml(getStatusLabel(bucket))}</span>
    </span>
  `;
}

function renderTypeChip(item = {}) {
  const type = getClienteType(item);

  return `
    <span class="clientes-type-chip clientes-type-chip--${attr(type)}" data-client-type="${attr(type)}">
      ${escapeHtml(getClienteTypeLabel(item))}
    </span>
  `;
}

function renderActionButton(item = {}) {
  const id = getClienteId(item);

  return `
    <button
      type="button"
      class="clientes-detail-btn"
      data-clientes-action="detail"
      data-action="detail"
      data-client-id="${attr(id)}"
      data-cliente-id="${attr(id)}"
      aria-label="Ver detalle de ${attr(getClienteName(item))}"
    >
      ${icon("eye")}
      <span>Ver</span>
    </button>
  `;
}

function renderRow(item = {}) {
  const id = getClienteId(item);
  const status = statusBucket(item);
  const email = getClienteEmail(item);
  const phone = getClientePhone(item);
  const location = getClienteLocation(item);
  const nif = getClienteNif(item);
  const description = [email, nif || phone].filter(Boolean).join(" · ");
  const amount = safeNumber(item.totalAmount, 0);

  return `
    <tr
      class="clientes-row clientes-row--${attr(status)}"
      data-client-row="true"
      data-cliente-row="true"
      data-client-id="${attr(id)}"
      data-cliente-id="${attr(id)}"
      data-clientes-action="detail"
      data-action="detail"
      tabindex="0"
    >
      <td class="clientes-cell clientes-cell--main" data-column="main">
        <div class="clientes-main">
          ${renderAvatar(item)}

          <div class="clientes-main-copy">
            <span class="clientes-code">${escapeHtml(getClienteCode(item))}</span>
            <strong class="clientes-name">${escapeHtml(getClienteName(item))}</strong>
            <span class="clientes-description">${escapeHtml(description || "Sin datos fiscales")}</span>

            <span class="clientes-row-tags">
              ${renderTypeChip(item)}
              ${nif ? `<span class="clientes-nif-chip">${escapeHtml(nif)}</span>` : ""}
            </span>
          </div>
        </div>
      </td>

      <td class="clientes-cell clientes-cell--status" data-column="status">
        ${renderStatusChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--date" data-column="date">
        <span class="clientes-date">${escapeHtml(formatDateShort(getCreatedAt(item)))}</span>
      </td>

      <td class="clientes-cell clientes-cell--email" data-column="email">
        <span class="clientes-email">${escapeHtml(email || "Sin email")}</span>
      </td>

      <td class="clientes-cell clientes-cell--location" data-column="location">
        <span class="clientes-location">${escapeHtml(location || "Sin ciudad")}</span>
      </td>

      <td class="clientes-cell clientes-cell--amount" data-column="amount">
        <span class="clientes-amount">${escapeHtml(formatAmount(amount))}</span>
      </td>

      <td class="clientes-cell clientes-cell--actions" data-column="actions">
        ${renderActionButton(item)}
      </td>
    </tr>
  `;
}

function renderLoadMore(vm = {}) {
  if (!vm.hasMore) return "";

  const nextLimit = Math.max(
    safeNumber(vm.visibleLimit, DEFAULT_VISIBLE_ROWS) + VISIBLE_STEP,
    safeNumber(vm.visibleCount, 0) + VISIBLE_STEP
  );

  return `
    <div class="clientes-load-more" aria-label="Cargar más clientes">
      <button
        type="button"
        class="clientes-load-more-btn clientes-pagination-btn clientes-pagination-btn--next"
        data-clientes-action="load-more"
        data-action="load-more"
        data-visible-limit="${attr(String(nextLimit))}"
        ${vm.loading || vm.refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Cargar más
      </button>

      <span class="clientes-load-more-status clientes-pagination-status">
        ${escapeHtml(`Mostrando ${vm.visibleCount} de ${vm.filteredCount}`)}
      </span>
    </div>
  `;
}

function renderSearch(vm = {}) {
  const search = vm.searchQuery;

  return `
    <label class="clientes-search">
      <span class="clientes-search-icon">${icon("search")}</span>

      <input
        class="clientes-search-input"
        type="search"
        value="${attr(search)}"
        placeholder="Buscar cliente, email, NIF..."
        data-clientes-search-input="true"
        data-search-input="clientes"
        autocomplete="off"
        spellcheck="false"
      >

      <button
        type="button"
        class="clientes-search-clear"
        data-clientes-action="clear-search"
        data-action="clear-search"
        ${search ? "" : "hidden"}
        aria-label="Limpiar búsqueda"
      >
        ${icon("close")}
      </button>
    </label>
  `;
}

function renderFilters(vm = {}) {
  const stats = vm.stats;
  const active = vm.activeFilter;
  const counts = {
    all: vm.items.length,
    active: stats.activeCount,
    pending: stats.pendingCount,
    blocked: stats.blockedCount,
    vip: stats.vipCount,
  };

  return `
    <div class="clientes-filters">
      <div class="clientes-filter-pills" role="toolbar" aria-label="Filtros de clientes">
        ${FILTERS.map((filter) => {
          const selected = active === filter.key;

          return `
            <button
              type="button"
              class="clientes-filter-pill ${selected ? "is-active" : ""}"
              data-clientes-action="filter"
              data-action="filter"
              data-filter="${attr(filter.key)}"
              aria-pressed="${selected ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(counts[filter.key] ?? 0))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(vm)}
    </div>
  `;
}

function renderEmptyContent(vm = {}) {
  const activeCriteria = [
    vm.activeFilter !== "all" ? `Filtro: ${vm.activeFilter}` : "",
    vm.searchQuery ? `Búsqueda: ${vm.searchQuery}` : "",
  ].filter(Boolean);

  return `
    <tr class="clientes-empty-row">
      <td colspan="${CLIENTES_TABLE_COLUMNS.length}">
        <div class="clientes-empty">
          <div class="clientes-empty-icon" aria-hidden="true">${icon("users")}</div>

          <div class="clientes-empty-copy">
            <strong>No hay clientes para mostrar.</strong>
            <span>
              ${
                activeCriteria.length
                  ? "Prueba a limpiar filtros o cambiar la búsqueda."
                  : "Todavía no hay clientes registrados."
              }
            </span>
          </div>

          ${
            activeCriteria.length
              ? `
                <button
                  type="button"
                  class="clientes-btn clientes-btn--ghost"
                  data-clientes-action="clear-filters"
                  data-action="clear-filters"
                >
                  Limpiar filtros
                </button>
              `
              : ""
          }
        </div>
      </td>
    </tr>
  `;
}

function renderTableLoading(rows = 6) {
  const count = clamp(rows, 1, 12);

  return `
    <div class="clientes-table-shell">
      <table class="clientes-table" aria-busy="true">
        <thead>
          <tr>
            ${CLIENTES_TABLE_COLUMNS.map((column) => `<th class="${attr(column.colClass)}">${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>

        <tbody>
          ${Array.from({ length: count }).map(() => `
            <tr class="clientes-row clientes-row--skeleton">
              ${CLIENTES_TABLE_COLUMNS.map(() => `
                <td class="clientes-cell">
                  <span class="clientes-skeleton-line"></span>
                </td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="clientes-refresh-overlay" role="status" aria-live="polite">
      ${renderSpinner("Actualizando clientes")}
      <span>Actualizando…</span>
    </div>
  `;
}

/* =========================================================
   EXPORTED PARTIALS
========================================================= */

export function renderHeader(input = {}) {
  const vm = getViewModel(input);
  const stats = vm.stats;

  return `
    <section class="clientes-hero">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-title clientes-page-title">Tus clientes</h1>
          <p class="clientes-subtitle clientes-page-subtitle">
            Consulta clientes, revisa actividad y gestiona contactos desde un único panel.
          </p>
        </div>

        <div class="clientes-hero-actions">
          <button
            id="clientes-create-btn"
            type="button"
            class="clientes-btn clientes-btn--create clientes-btn--primary"
            data-clientes-action="create"
            data-action="create"
          >
            ${icon("plus")}
            <span>Nuevo cliente</span>
          </button>

          <button
            id="clientes-refresh-btn"
            type="button"
            class="clientes-btn"
            data-clientes-action="refresh"
            data-action="refresh"
            ${vm.refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            ${icon("refresh")}
            <span>${vm.refreshing ? "Actualizando" : "Actualizar"}</span>
          </button>
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill">
          ${icon("users")}
          <span>${escapeHtml(`${vm.items.length} clientes registrados`)}</span>
        </span>

        <span class="clientes-meta-pill">
          ${icon("clock")}
          <span>${vm.lastSyncAt ? `Última actualización · ${escapeHtml(formatRelativeDate(vm.lastSyncAt))}` : "Pendiente de sincronizar"}</span>
        </span>

        <span class="clientes-meta-pill">
          ${icon("euro")}
          <span>${escapeHtml(formatAmount(stats.totalAmount))}</span>
        </span>
      </div>

      <div class="clientes-stats">
        <article class="clientes-stat-card clientes-stat-card--total">
          <span class="clientes-stat-label">Clientes</span>
          <strong class="clientes-stat-value">${escapeHtml(String(stats.total))}</strong>
          <span class="clientes-stat-text">Registros totales visibles.</span>
        </article>

        <article class="clientes-stat-card clientes-stat-card--active">
          <span class="clientes-stat-label">Activos</span>
          <strong class="clientes-stat-value">${escapeHtml(String(stats.activeCount))}</strong>
          <span class="clientes-stat-text">Clientes operativos.</span>
        </article>

        <article class="clientes-stat-card clientes-stat-card--pending">
          <span class="clientes-stat-label">Pendientes</span>
          <strong class="clientes-stat-value">${escapeHtml(String(stats.pendingCount))}</strong>
          <span class="clientes-stat-text">Altas o validaciones pendientes.</span>
        </article>

        <article class="clientes-stat-card clientes-stat-card--blocked">
          <span class="clientes-stat-label">Bloqueados</span>
          <strong class="clientes-stat-value">${escapeHtml(String(stats.blockedCount))}</strong>
          <span class="clientes-stat-text">Cuentas restringidas o inactivas.</span>
        </article>
      </div>
    </section>
  `;
}

export function renderLoadingState(input = {}) {
  const vm = getViewModel(input);

  return `
    <section class="clientes-view-root" data-clientes-scope="true" data-view="clientes" data-loading="true">
      ${renderHeader({ ...input, loading: true })}

      <section class="clientes-history">
        <header class="clientes-history-head">
          <div class="clientes-history-copy">
            <h2 class="clientes-history-title">Historial de clientes</h2>
            <p class="clientes-history-subtitle">Cargando clientes…</p>
          </div>

          ${renderFilters(vm)}
        </header>

        <div class="clientes-table-wrap">
          ${renderTableLoading(6)}
        </div>
      </section>
    </section>
  `;
}

export function renderErrorState(input = {}) {
  const vm = getViewModel(input);
  const error = safeText(vm.error, "No se pudieron cargar los clientes.");

  return `
    <section class="clientes-view-root" data-clientes-scope="true" data-view="clientes" data-error="true">
      <div class="clientes-error" role="alert">
        <div class="clientes-error-icon" aria-hidden="true">${icon("alert")}</div>

        <div class="clientes-error-copy">
          <h1>Error de clientes</h1>
          <p>${escapeHtml(error)}</p>
        </div>

        <button
          type="button"
          class="clientes-btn"
          data-clientes-action="retry"
          data-action="retry"
        >
          ${icon("refresh")}
          <span>Reintentar</span>
        </button>
      </div>
    </section>
  `;
}

export function renderAccessDeniedState() {
  return `
    <section class="clientes-view-root" data-clientes-scope="true" data-view="clientes" data-forbidden="true">
      <div class="clientes-error clientes-error--forbidden" role="alert">
        <div class="clientes-error-icon" aria-hidden="true">${icon("shield")}</div>

        <div class="clientes-error-copy">
          <h1>Acceso restringido</h1>
          <p>No tienes permisos suficientes para acceder a la gestión de clientes.</p>
        </div>
      </div>
    </section>
  `;
}

export function renderEmptyClientesState(input = {}) {
  const vm = getViewModel(input);

  return `
    <section class="clientes-history">
      <header class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">Sin clientes registrados.</p>
        </div>

        ${renderFilters(vm)}
      </header>

      <div class="clientes-table-wrap">
        <div class="clientes-table-shell">
          <table class="clientes-table">
            <thead>
              <tr>
                ${CLIENTES_TABLE_COLUMNS.map((column) => `<th class="${attr(column.colClass)}">${escapeHtml(column.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${renderEmptyContent(vm)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

export function renderTable(input = {}) {
  const vm = getViewModel(input);

  const subtitle = vm.filtering
    ? `Mostrando ${vm.visibleCount} de ${vm.filteredCount} · filtros activos`
    : `Mostrando ${vm.visibleCount} de ${vm.totalCount}`;

  return `
    <section class="clientes-history">
      <header class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <button
          type="button"
          class="clientes-btn"
          data-clientes-action="export"
          data-action="export"
          ${!vm.items.length ? 'disabled aria-disabled="true"' : ""}
        >
          ${icon("export")}
          <span>Exportar</span>
        </button>

        ${renderFilters(vm)}
      </header>

      <div class="clientes-table-wrap ${vm.refreshing ? "is-refreshing" : ""}">
        ${
          vm.loading && !vm.items.length
            ? renderTableLoading(6)
            : `
              <div class="clientes-table-shell">
                <table class="clientes-table">
                  <colgroup>
                    ${CLIENTES_TABLE_COLUMNS.map((column) => `<col class="${attr(column.colClass)}">`).join("")}
                  </colgroup>

                  <thead>
                    <tr>
                      ${CLIENTES_TABLE_COLUMNS.map((column) => `<th class="${attr(column.colClass)}">${escapeHtml(column.label)}</th>`).join("")}
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      vm.visibleItems.length
                        ? vm.visibleItems.map((item) => renderRow(item)).join("")
                        : renderEmptyContent(vm)
                    }
                  </tbody>
                </table>
              </div>

              ${renderLoadMore(vm)}
            `
        }

        ${vm.refreshing && vm.items.length ? renderRefreshOverlay() : ""}
      </div>
    </section>
  `;
}

export const renderEmptyState = renderEmptyClientesState;
export const renderCards = renderTable;

/* =========================================================
   MAIN RENDER
========================================================= */

export function renderClientesTableTemplate(input = {}) {
  const vm = getViewModel(input);

  if (vm.forbidden) {
    return renderAccessDeniedState(input);
  }

  if (vm.error) {
    return renderErrorState(input);
  }

  if (vm.loading && !vm.items.length) {
    return renderLoadingState(input);
  }

  return `
    <section
      class="clientes-view-root"
      data-clientes-scope="true"
      data-view="clientes"
      data-loading="${vm.loading ? "true" : "false"}"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
      data-total="${attr(String(vm.totalCount))}"
      data-visible="${attr(String(vm.visibleCount))}"
      data-visible-limit="${attr(String(vm.visibleLimit))}"
      data-has-more="${vm.hasMore ? "true" : "false"}"
      data-filter="${attr(vm.activeFilter)}"
      data-search-active="${vm.searchQuery ? "true" : "false"}"
    >
      ${renderHeader(input)}
      ${renderTable(input)}
    </section>
  `;
}

export function renderClientesTemplate(input = {}) {
  return renderClientesTableTemplate(input);
}

export function renderTemplate(input = {}) {
  return renderClientesTableTemplate(input);
}

export function getClientesTableTemplateSnapshot(input = {}) {
  const vm = getViewModel(input);

  return {
    version: CLIENTES_TEMPLATE_VERSION,
    total: vm.totalCount,
    visible: vm.visibleCount,
    visibleLimit: vm.visibleLimit,
    remainingCount: vm.remainingCount,
    hasMore: vm.hasMore,
    filter: vm.activeFilter,
    searchLength: vm.searchQuery.length,
    loading: vm.loading,
    refreshing: vm.refreshing,
    columns: CLIENTES_TABLE_COLUMNS.map((column) => column.key),
    actions: { ...CLIENTES_ACTIONS },
  };
}

export function getSnapshot(input = {}) {
  return getClientesTableTemplateSnapshot(input);
}

export default renderClientesTableTemplate;

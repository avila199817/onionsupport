/* =========================================================
   Onion Support - Clientes Template
   Archivo: /src/views/clientes/clientes.template.js

   CSS 1:1 · PRODUCTIVO
   - Vista Clientes alineada con el patrón visual/DOM de Incidencias.
   - Template puro: sin HTTP, sin DOM directo, sin Store, sin Router.
   - Sin modales, sin <style>, sin style="", sin handlers inline.
   - Acepta items/clientes/clients/rows/results/data.items/etc.
========================================================= */

export const CLIENTES_TEMPLATE_VERSION = "clientes.template.css-1-1.incidencias-aligned.v2";
export const CLIENTES_TABLE_TEMPLATE_VERSION = CLIENTES_TEMPLATE_VERSION;
export const CLIENTES_VIEW_TEMPLATE_VERSION = CLIENTES_TEMPLATE_VERSION;

export const CLIENTES_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  CREATE_OPEN: "create-open",
  CREATE: "create-open",
  FILTER: "filter",
  SORT_TOGGLE: "sort-toggle",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",
  OPEN_DETAIL: "open-detail",
  DETAIL: "open-detail",
  LOAD_MORE: "load-more",
  EXPORT: "export",
});

export const CLIENTES_TABLE_ACTIONS = CLIENTES_ACTIONS;

const DEFAULT_ROUTE = "/clientes";
const DEFAULT_VISIBLE_ROWS = 20;
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_SORT_ORDER = "desc";
const TABLE_SCALE = "110";
const AVATAR_TONE_COUNT = 10;

export const CLIENTES_DEFAULT_VISIBLE_ROWS = DEFAULT_VISIBLE_ROWS;
export const CLIENTES_DEFAULT_PAGE_SIZE = DEFAULT_VISIBLE_ROWS;

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
  { key: "vip", label: "VIP" },
]);

export const CLIENTES_TABLE_COLUMNS = Object.freeze([
  {
    key: "main",
    label: "Cliente",
    colClass: "clientes-col clientes-col--main",
    thClass: "clientes-th clientes-th--main clientes-col clientes-col--main",
    cellClass: "clientes-cell clientes-cell--main",
  },
  {
    key: "status",
    label: "Estado",
    colClass: "clientes-col clientes-col--status",
    thClass: "clientes-th clientes-th--status clientes-col clientes-col--status",
    cellClass: "clientes-cell clientes-cell--status",
  },
  {
    key: "created",
    label: "Alta",
    colClass: "clientes-col clientes-col--date clientes-col--created",
    thClass: "clientes-th clientes-th--date clientes-th--created clientes-col clientes-col--date clientes-col--created",
    cellClass: "clientes-cell clientes-cell--date clientes-cell--created",
  },
  {
    key: "updated",
    label: "Actividad",
    colClass: "clientes-col clientes-col--date clientes-col--updated",
    thClass: "clientes-th clientes-th--date clientes-th--updated clientes-col clientes-col--date clientes-col--updated",
    cellClass: "clientes-cell clientes-cell--date clientes-cell--updated",
  },
  {
    key: "contact",
    label: "Contacto",
    colClass: "clientes-col clientes-col--email clientes-col--contact",
    thClass: "clientes-th clientes-th--email clientes-th--contact clientes-col clientes-col--email clientes-col--contact",
    cellClass: "clientes-cell clientes-cell--email clientes-cell--contact",
  },
  {
    key: "amount",
    label: "Importe",
    colClass: "clientes-col clientes-col--amount clientes-col--importe",
    thClass: "clientes-th clientes-th--amount clientes-th--importe clientes-col clientes-col--amount clientes-col--importe",
    cellClass: "clientes-cell clientes-cell--amount clientes-cell--importe",
  },
]);

/* =========================================================
   HELPERS
========================================================= */

const isObj = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const obj = (value, fallback = {}) => (isObj(value) ? value : fallback);

function arr(value) {
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

function txt(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  No se aplanan arrays: si llega { items: [...] }, aplanarlo convertiría
  el array en el primer cliente y rompería el listado.
*/
function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObj(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function num(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

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

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(num(value, min), min), max);
}

function esc(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const at = (value = "") => esc(txt(value, ""));
const cls = (...values) => values.flat(Infinity).map((value) => txt(value, "")).filter(Boolean).join(" ");

function key(value = "") {
  return txt(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function searchKey(value = "") {
  return txt(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlAttrs(attrs = {}) {
  return Object.entries(obj(attrs))
    .map(([name, value]) => {
      if (!name || value === false || value === null || value === undefined) return "";
      if (value === true) return esc(name);
      return `${esc(name)}="${esc(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function safeUrl(value = "") {
  const raw = txt(value, "");

  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw) && !raw.startsWith("data:image/")) return "";
  if (raw.startsWith("data:image/")) return raw;
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (raw.startsWith("./") || raw.startsWith("../")) return raw;

  if (/^https:\/\//i.test(raw) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstUrl(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (isObj(value)) {
      const nested = firstUrl(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.logoUrl,
        value.logo,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.picture,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture,
        value.raw?.logoUrl
      );

      if (nested) return nested;
      continue;
    }

    const url = safeUrl(value);
    if (url) return url;
  }

  return "";
}

function hash(value = "") {
  const source = txt(value, "onion");
  let output = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    output ^= source.charCodeAt(index);
    output +=
      (output << 1) +
      (output << 4) +
      (output << 7) +
      (output << 8) +
      (output << 24);
  }

  return Math.abs(output >>> 0);
}

function initials(value = "") {
  return txt(value, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "ON";
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M21 21v-5h-5"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>`,
    chevronDown: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
    calendar: `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
    mail: `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    phone: `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  };

  return icons[name] || icons.users;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(num(value, 0));
  } catch {
    return String(num(value, 0));
  }
}

function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: txt(currency, DEFAULT_CURRENCY).toUpperCase(),
      maximumFractionDigits: 2,
    }).format(num(value, 0));
  } catch {
    return `${num(value, 0).toFixed(2).replace(".", ",")} €`;
  }
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9_999_999_999 ? value : value * 1000;
  }

  const raw = txt(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9_999_999_999 ? numeric : numeric * 1000;
  }

  const esMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (esMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", ss = "0"] = esMatch;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatDate(value = null) {
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
    return new Date(ts).toISOString();
  }
}

function formatShortDate(value = null) {
  const ts = toTimestamp(value);
  if (!ts) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

function formatRelativeDate(value = null) {
  const ts = toTimestamp(value);
  if (!ts) return "Sin actividad";

  const diffMs = ts - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";
  if (absMin < 60) return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;

  const diffHours = Math.round(absMin / 60);
  if (diffHours < 24) return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatShortDate(value);
}

function normalizeSort(value = "") {
  const order = key(value || DEFAULT_SORT_ORDER);
  if (["asc", "ascending", "oldest", "antiguos", "menor", "menor_mayor", "menor_a_mayor"].includes(order)) return "asc";
  return "desc";
}

const nextSort = (value = DEFAULT_SORT_ORDER) => (normalizeSort(value) === "asc" ? "desc" : "asc");
const sortLabel = (value = DEFAULT_SORT_ORDER) => (normalizeSort(value) === "asc" ? "Antiguos primero" : "Recientes primero");

/* =========================================================
   DATA GETTERS
========================================================= */

function unwrap(value = {}) {
  const item = obj(value, {});
  return obj(
    first(
      item.cliente,
      item.client,
      item.customer,
      item.item,
      item.detail,
      item.data?.cliente,
      item.data?.client,
      item.data?.customer,
      item.data?.item,
      item.data,
      item
    ),
    item
  );
}

const rawOf = (item = {}) => obj(unwrap(item).raw, {});

function getId(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return txt(
    first(
      r.clienteId,
      r.clientId,
      r.customerId,
      r.id,
      r.uid,
      r._id,
      r.code,
      r.codigo,
      r.nif,
      r.cif,
      r.email,
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

function getCode(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return txt(
    first(
      r.code,
      r.codigo,
      r.clienteCode,
      r.clienteId,
      r.clientId,
      r.id,
      r.nif,
      r.cif,
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

function getName(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  const firstName = txt(first(r.firstName, r.nombre, raw.firstName, raw.nombre), "");
  const lastName = txt(first(r.lastName, r.apellidos, raw.lastName, raw.apellidos), "");
  const composed = txt(`${firstName} ${lastName}`, "");

  return txt(
    first(
      r.razonSocial,
      r.businessName,
      r.companyName,
      r.empresa,
      r.fullName,
      r.displayName,
      r.name,
      r.nombre,
      composed,
      r.email,
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

function getEmail(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return txt(first(r.email, r.mail, r.emailLower, r.contactEmail, r.billingEmail, r.facturacionEmail, raw.email, raw.mail, raw.emailLower, raw.contactEmail, raw.billingEmail, raw.facturacionEmail, ""), "").toLowerCase();
}

function getPhone(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return txt(first(r.phone, r.telefono, r.mobile, r.movil, r.phoneNumber, raw.phone, raw.telefono, raw.mobile, raw.movil, raw.phoneNumber, ""), "");
}

function formatPhone(value = "") {
  const raw = txt(value, "");
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

  if (national.length === 9) return `${prefix}${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  return raw;
}

function getLocation(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return txt(
    first(
      r.city,
      r.ciudad,
      r.location?.city,
      r.location?.ciudad,
      r.address?.city,
      r.address?.ciudad,
      r.direccion?.city,
      r.direccion?.ciudad,
      raw.city,
      raw.ciudad,
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

function getNif(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return txt(first(r.nif, r.cif, r.taxId, r.vat, r.documentId, raw.nif, raw.cif, raw.taxId, raw.vat, raw.documentId, ""), "").toUpperCase();
}

function getAvatar(item = {}) {
  const r = unwrap(item);
  return firstUrl(r, r.profile, r.raw);
}

function getType(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return key(first(r.tipo, r.type, r.kind, r.segment, r.category, raw.tipo, raw.type, raw.kind, raw.segment, raw.category, "cliente"));
}

function getTypeLabel(item = {}) {
  const value = getType(item);
  const labels = {
    empresa: "Empresa",
    company: "Empresa",
    autonomo: "Autónomo",
    freelance: "Autónomo",
    particular: "Particular",
    persona: "Particular",
    vip: "VIP",
    premium: "Premium",
    cliente: "Cliente",
  };

  return labels[value] || txt(value.replace(/_/g, " "), "Cliente").replace(/^./, (letter) => letter.toUpperCase());
}

function getStatusRaw(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  const explicit = first(r.status, r.estado, r.state, r.statusKey, raw.status, raw.estado, raw.state, raw.statusKey);

  if (explicit !== null && explicit !== undefined && explicit !== "") return key(explicit);

  const active = first(r.active, r.isActive, r.enabled, raw.active, raw.isActive, raw.enabled);
  if (active === false) return "blocked";
  if (active === true) return "active";

  return "active";
}

function statusKey(item = {}) {
  const status = getStatusRaw(item);

  if (["pending", "pendiente", "new", "nuevo", "invited", "invitation_pending", "unverified", "sin_validar"].includes(status)) return "pending";
  if (["blocked", "bloqueado", "bloqueada", "inactive", "inactivo", "inactiva", "disabled", "suspended", "deleted", "archived", "banned"].includes(status)) return "blocked";
  if (["vip", "premium"].includes(status)) return "vip";
  if (getType(item) === "vip" || unwrap(item).vip === true || unwrap(item).isVip === true) return "vip";

  return "active";
}

function statusLabel(itemOrStatus = {}) {
  const status = typeof itemOrStatus === "string" ? key(itemOrStatus) : statusKey(itemOrStatus);
  const labels = {
    active: "Activo",
    pending: "Pendiente",
    blocked: "Bloqueado",
    vip: "VIP",
  };

  return labels[status] || txt(status.replace(/_/g, " "), "Activo").replace(/^./, (letter) => letter.toUpperCase());
}

function getCreated(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return first(r.createdAt, r.created, r.registeredAt, r.altaAt, r.fechaAlta, r.createdOn, raw.createdAt, raw.created, raw.registeredAt, raw.altaAt, raw.fechaAlta, raw.createdOn, "");
}

function getUpdated(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return first(r.lastActivityAt, r.updatedAt, r.modifiedAt, r.lastInvoiceAt, r.lastTicketAt, r.lastContactAt, r.createdAt, raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.lastInvoiceAt, raw.lastTicketAt, raw.lastContactAt, raw.createdAt, "");
}

function getAmount(item = {}) {
  const r = unwrap(item);
  const raw = rawOf(item);
  return num(first(r.totalAmount, r.totalImporte, r.facturasTotal, r.invoicesTotal, r.amount, r.importe, raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.invoicesTotal, raw.amount, raw.importe, 0), 0);
}

function sortTime(item = {}) {
  const ts = toTimestamp(getUpdated(item)) || toTimestamp(getCreated(item));
  return Number.isFinite(ts) ? ts : 0;
}

export function normalizeClienteModel(item = {}) {
  const raw = obj(item, {});
  const id = getId(raw);
  const email = getEmail(raw);
  const name = getName(raw);
  const status = getStatusRaw(raw);
  const type = getType(raw);

  return {
    ...raw,
    raw,

    id: id || email,
    uid: first(raw.uid, id, email, ""),
    clienteId: first(raw.clienteId, raw.clientId, id, email, ""),
    clientId: first(raw.clientId, raw.clienteId, id, email, ""),
    customerId: first(raw.customerId, id, email, ""),

    code: getCode(raw),
    codigo: getCode(raw),

    fullName: name,
    displayName: txt(first(raw.displayName, raw.fullName, raw.name, raw.nombre, name), name),
    name,
    nombre: txt(first(raw.nombre, raw.name, name), name),
    razonSocial: txt(first(raw.razonSocial, raw.businessName, raw.companyName, name), name),

    email,
    phone: getPhone(raw),
    telefono: getPhone(raw),
    city: getLocation(raw),
    ciudad: getLocation(raw),
    nif: getNif(raw),
    cif: getNif(raw),

    status,
    estado: status,
    type,
    tipo: type,

    createdAt: first(raw.createdAt, raw.created, raw.registeredAt, raw.altaAt, raw.fechaAlta, ""),
    updatedAt: first(raw.updatedAt, raw.modifiedAt, raw.lastActivityAt, raw.lastContactAt, raw.createdAt, ""),
    lastActivityAt: first(raw.lastActivityAt, raw.updatedAt, raw.modifiedAt, raw.lastContactAt, raw.createdAt, ""),

    totalAmount: getAmount(raw),
  };
}

export function normalizeClientesCollection(items = []) {
  const map = new Map();

  for (const item of arr(items)) {
    if (!isObj(item)) continue;

    const normalized = normalizeClienteModel(item);
    const id = getId(normalized) || getEmail(normalized) || getCode(normalized);
    if (!id) continue;

    const previous = map.get(id) || {};
    map.set(id, { ...previous, ...normalized });
  }

  return [...map.values()].sort((a, b) => {
    const diff = sortTime(b) - sortTime(a);
    if (diff !== 0) return diff;

    return getName(a).localeCompare(getName(b), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/* =========================================================
   ENVELOPE / VIEW MODEL
========================================================= */

function envelopeObjects(payload = null, maxDepth = 8) {
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();
  const output = [];

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!isObj(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);
    output.push(value);

    for (const keyName of ["data", "payload", "response", "result", "results", "body"]) {
      if (isObj(value[keyName])) queue.push({ value: value[keyName], depth: depth + 1 });
    }
  }

  return output;
}

function getResolvedItems(input = {}) {
  if (Array.isArray(input)) return input;

  for (const source of envelopeObjects(input)) {
    const candidate = first(
      source.items,
      source.clientes,
      source.clients,
      source.customers,
      source.rows,
      source.results,
      source.documents,
      source.resources,
      source.data?.items,
      source.data?.clientes,
      source.data?.clients,
      source.data?.rows,
      source.data?.results
    );

    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function resolveRemoteTotal(input = {}, items = []) {
  for (const source of envelopeObjects(input)) {
    const total = first(
      source.total,
      source.remoteCount,
      source.totalCount,
      source.count,
      source.totalItems,
      source.totalResults,
      source.data?.total,
      source.data?.remoteCount,
      source.data?.totalCount,
      source.data?.count
    );

    const parsed = num(total, -1);
    if (parsed >= 0) return Math.max(parsed, arr(items).length);
  }

  return arr(items).length;
}

function normalizeFilter(value = "all") {
  const filter = key(value || "all") || "all";
  return FILTERS.some((item) => item.key === filter) ? filter : "all";
}

function getSearch(input = {}) {
  return txt(first(input.search, input.query, input.q, input.filters?.search, input.state?.search, ""), "");
}

function matchesFilter(item = {}, filter = "all") {
  if (filter === "all") return true;
  return statusKey(item) === filter;
}

function haystack(item = {}) {
  return searchKey([
    getId(item),
    getCode(item),
    getName(item),
    getEmail(item),
    getPhone(item),
    getLocation(item),
    getNif(item),
    getTypeLabel(item),
    statusLabel(item),
  ].join(" "));
}

function matchesSearch(item = {}, query = "") {
  const term = searchKey(query);
  if (!term) return true;

  const source = haystack(item);
  return term.split(/\s+/).filter(Boolean).every((part) => source.includes(part));
}

function filterAndSort(items = [], input = {}) {
  const filter = normalizeFilter(first(input.filter, input.status, input.state?.filter, "all"));
  const search = getSearch(input);
  const order = normalizeSort(first(input.sortOrder, input.order, input.state?.sortOrder, DEFAULT_SORT_ORDER));

  const filtered = normalizeClientesCollection(items).filter((item) => matchesFilter(item, filter) && matchesSearch(item, search));

  return filtered.sort((a, b) => {
    const diff = order === "asc" ? sortTime(a) - sortTime(b) : sortTime(b) - sortTime(a);
    if (diff !== 0) return diff;

    return getName(a).localeCompare(getName(b), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function filterCounts(items = []) {
  const base = { all: 0, active: 0, pending: 0, blocked: 0, vip: 0 };

  for (const item of normalizeClientesCollection(items)) {
    const status = statusKey(item);
    base.all += 1;
    if (base[status] !== undefined) base[status] += 1;
  }

  return base;
}

function mergeStats(items = [], incoming = {}) {
  const normalized = normalizeClientesCollection(items);
  const counts = filterCounts(normalized);
  const stats = obj(incoming, {});

  let totalAmount = 0;
  let lastUpdateTs = 0;

  for (const item of normalized) {
    totalAmount += getAmount(item);
    lastUpdateTs = Math.max(lastUpdateTs, sortTime(item));
  }

  return {
    total: Math.max(num(first(stats.total, stats.count, normalized.length), normalized.length), normalized.length),
    activeCount: num(first(stats.activeCount, stats.active, counts.active), counts.active),
    pendingCount: num(first(stats.pendingCount, stats.pending, counts.pending), counts.pending),
    blockedCount: num(first(stats.blockedCount, stats.blocked, counts.blocked), counts.blocked),
    vipCount: num(first(stats.vipCount, stats.vip, counts.vip), counts.vip),
    totalAmount: num(first(stats.totalAmount, stats.invoiceTotal, stats.amount, totalAmount), totalAmount),
    invoiceTotal: num(first(stats.invoiceTotal, stats.totalAmount, totalAmount), totalAmount),
    lastUpdateTs: num(first(stats.lastUpdateTs, stats.lastUpdateAt ? toTimestamp(stats.lastUpdateAt) : 0, lastUpdateTs), lastUpdateTs),
  };
}

function buildVm(input = {}) {
  const data = obj(input, {});
  const rawItems = getResolvedItems(data);
  const items = normalizeClientesCollection(rawItems);
  const filter = normalizeFilter(first(data.filter, data.status, data.state?.filter, "all"));
  const search = getSearch(data);
  const sortOrder = normalizeSort(first(data.sortOrder, data.order, data.state?.sortOrder, DEFAULT_SORT_ORDER));
  const filtered = filterAndSort(items, { ...data, filter, search, sortOrder });
  const visibleLimit = clamp(first(data.visibleLimit, data.limit, data.state?.visibleLimit, DEFAULT_VISIBLE_ROWS), 1, 1000);
  const visibleItems = filtered.slice(0, visibleLimit);
  const total = resolveRemoteTotal(data, items);
  const stats = mergeStats(items, data.stats);

  return {
    data,
    route: txt(first(data.route, data.routes?.clientes, DEFAULT_ROUTE), DEFAULT_ROUTE),
    admin: Boolean(data.admin || data.role === "admin"),
    items,
    filteredItems: filtered,
    visibleItems,
    total,
    filteredTotal: filtered.length,
    visibleCount: visibleItems.length,
    visibleLimit,
    remainingCount: Math.max(0, filtered.length - visibleItems.length),
    hasMore: filtered.length > visibleItems.length,
    loading: data.loading === true,
    refreshing: data.refreshing === true,
    creating: data.creating === true,
    loadingMore: data.loadingMore === true,
    error: txt(first(data.error, data.state?.error, ""), ""),
    filter,
    search,
    sortOrder,
    sortLabel: sortLabel(sortOrder),
    nextSortOrder: nextSort(sortOrder),
    nextSortLabel: sortLabel(nextSort(sortOrder)),
    filterCounts: filterCounts(items),
    stats,
    openingClienteId: txt(first(data.openingClienteId, data.openingClientId, ""), ""),
    diagnostics: {
      totalGreaterThanItems: total > 0 && items.length === 0,
      extractedItems: items.length,
      templateVersion: CLIENTES_TEMPLATE_VERSION,
    },
  };
}

/* =========================================================
   ROWS
========================================================= */

function renderAvatar(item = {}) {
  const name = getName(item);
  const src = getAvatar(item);
  const tone = hash(`${getId(item)}:${name}`) % AVATAR_TONE_COUNT;

  return `
    <span class="clientes-avatar${src ? " has-image" : " is-fallback"} clientes-avatar-tone-${at(String(tone))}" data-avatar-tone="${at(String(tone))}" data-has-avatar="${src ? "true" : "false"}" data-fallback="${src ? "false" : "true"}" aria-hidden="true">
      ${src ? `<img class="clientes-avatar-img" src="${at(src)}" alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
      <span class="clientes-avatar-fallback">${esc(initials(name))}</span>
    </span>
  `;
}

function renderStatusChip(item = {}) {
  const status = statusKey(item);

  return `
    <span class="clientes-status-chip clientes-status-chip--${at(status)} is-${at(status)}" data-status-chip="${at(status)}" data-status="${at(status)}">
      <span class="clientes-status-dot" aria-hidden="true"></span>
      <span>${esc(statusLabel(status))}</span>
    </span>
  `;
}

function renderTypeChip(item = {}) {
  const type = getType(item);

  return `
    <span class="clientes-type-chip clientes-type-chip--${at(type)}" data-client-type="${at(type)}">
      ${esc(getTypeLabel(item))}
    </span>
  `;
}

function renderAmountChip(item = {}) {
  const amount = getAmount(item);
  const state = amount > 0 ? "positive" : "idle";

  return `
    <span class="clientes-importe-chip clientes-amount-chip clientes-amount-chip--${at(state)}" data-importe-status="${at(state)}" data-amount-status="${at(state)}">
      ${state !== "idle" ? icon("euro") : ""}
      <span>${esc(formatMoney(amount, DEFAULT_CURRENCY))}</span>
    </span>
  `;
}

function renderContactLine(item = {}) {
  const email = getEmail(item);
  const phone = formatPhone(getPhone(item));

  if (!email && !phone) return `<span class="clientes-contact-empty">Sin contacto</span>`;

  return `
    <span class="clientes-contact-line">
      ${email ? `<span class="clientes-email">${icon("mail")}<span>${esc(email)}</span></span>` : ""}
      ${email && phone ? `<span class="clientes-client-separator">·</span>` : ""}
      ${phone ? `<span class="clientes-phone">${icon("phone")}<span>${esc(phone)}</span></span>` : ""}
    </span>
  `;
}

function renderRow(item = {}, vm = {}) {
  const id = getId(item);
  const status = statusKey(item);
  const email = getEmail(item);
  const location = getLocation(item);
  const nif = getNif(item);
  const isOpening = vm.openingClienteId && vm.openingClienteId === id;

  return `
    <tr
      class="clientes-row clientes-row--clickable clientes-row--${at(status)}${isOpening ? " is-loading" : ""}"
      data-client-row="true"
      data-cliente-row="true"
      data-detail-target="true"
      data-client-id="${at(id)}"
      data-cliente-id="${at(id)}"
      data-clientes-action="${CLIENTES_ACTIONS.OPEN_DETAIL}"
      data-action="${CLIENTES_ACTIONS.OPEN_DETAIL}"
      tabindex="0"
      role="button"
      aria-label="Abrir cliente ${at(getName(item))}"
      ${htmlAttrs({ "aria-busy": isOpening ? "true" : false })}
    >
      <td class="clientes-cell clientes-cell--main" data-column="main">
        <div class="clientes-main">
          ${renderAvatar(item)}
          <div class="clientes-main-copy">
            <div class="clientes-ticket-line clientes-client-line-top">
              <span class="clientes-code clientes-ticket-id">${esc(getCode(item) || "Sin ID")}</span>
              <span class="clientes-category-pill">${esc(getTypeLabel(item))}</span>
            </div>
            <div class="clientes-name clientes-ticket-subject">${esc(getName(item))}</div>
            <div class="clientes-description clientes-ticket-description">${esc([email, nif || location].filter(Boolean).join(" · ") || "Sin datos fiscales")}</div>
            <div class="clientes-client-line">
              ${location ? `<span class="clientes-location">${esc(location)}</span>` : `<span class="clientes-location is-empty">Sin ciudad</span>`}
            </div>
            <div class="clientes-row-badges">
              ${renderTypeChip(item)}
              ${nif ? `<span class="clientes-nif-chip">${esc(nif)}</span>` : ""}
            </div>
          </div>
        </div>
      </td>
      <td class="clientes-cell clientes-cell--status" data-column="status">${renderStatusChip(item)}</td>
      <td class="clientes-cell clientes-cell--date clientes-cell--created" data-column="created"><span class="clientes-date-inline clientes-date" title="${at(formatDate(getCreated(item)))}">${esc(formatShortDate(getCreated(item)))}</span></td>
      <td class="clientes-cell clientes-cell--date clientes-cell--updated" data-column="updated"><span class="clientes-date-inline clientes-date" title="${at(formatDate(getUpdated(item)))}">${esc(formatRelativeDate(getUpdated(item)))}</span></td>
      <td class="clientes-cell clientes-cell--email clientes-cell--contact" data-column="contact">${renderContactLine(item)}</td>
      <td class="clientes-cell clientes-cell--amount clientes-cell--importe" data-column="amount">${renderAmountChip(item)}</td>
    </tr>
  `;
}

/* =========================================================
   HEADER / FILTERS
========================================================= */

const spinner = (label = "Cargando...") => `<span class="clientes-spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;

function renderHeader(vm = {}) {
  const stats = vm.stats;
  const updatedAt = stats.lastUpdateTs ? new Date(stats.lastUpdateTs).toISOString() : "";

  return `
    <section class="clientes-hero" data-clientes-hero="true">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-title clientes-page-title">Centro de control de clientes</h1>
          <p class="clientes-subtitle clientes-page-subtitle">Consulta clientes, revisa actividad, facturación y contactos desde un único panel.</p>
        </div>
        <div class="clientes-hero-actions">
          <button type="button" id="clientes-create-btn" class="clientes-btn clientes-btn--create clientes-btn--primary" data-clientes-action="${CLIENTES_ACTIONS.CREATE_OPEN}" data-action="${CLIENTES_ACTIONS.CREATE_OPEN}" ${htmlAttrs({ disabled: vm.creating || vm.loading, "aria-disabled": vm.creating || vm.loading ? "true" : false, "aria-busy": vm.creating ? "true" : false })}>
            ${vm.creating ? spinner("Creando...") : `${icon("plus")}<span>Nuevo cliente</span>`}
          </button>
          <button type="button" id="clientes-refresh-btn" class="clientes-btn${vm.refreshing ? " is-loading" : ""}" data-clientes-action="${CLIENTES_ACTIONS.REFRESH}" data-action="${CLIENTES_ACTIONS.REFRESH}" ${htmlAttrs({ disabled: vm.refreshing || vm.loading, "aria-disabled": vm.refreshing || vm.loading ? "true" : false, "aria-busy": vm.refreshing ? "true" : false })}>
            ${vm.refreshing ? spinner("Actualizando...") : `${icon("refresh")}<span>Actualizar</span>`}
          </button>
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill" data-meta="total">${icon("users")}<span>${esc(`${formatNumber(vm.total)} clientes registrados`)}</span></span>
        <span class="clientes-meta-pill" data-meta="updated">${icon("refresh")}<span>${updatedAt ? esc(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span></span>
        <span class="clientes-meta-pill" data-meta="amount">${icon("euro")}<span>${esc(formatMoney(stats.totalAmount, DEFAULT_CURRENCY))}</span></span>
      </div>

      <div class="clientes-stats">
        <article class="clientes-stat-card clientes-stat-card--total" data-stat="total"><div class="clientes-stat-label">Clientes</div><div class="clientes-stat-value">${esc(formatNumber(stats.total))}</div><div class="clientes-stat-text">Registros totales visibles.</div></article>
        <article class="clientes-stat-card clientes-stat-card--active" data-stat="active"><div class="clientes-stat-label">Activos</div><div class="clientes-stat-value">${esc(formatNumber(stats.activeCount))}</div><div class="clientes-stat-text">Clientes operativos.</div></article>
        <article class="clientes-stat-card clientes-stat-card--pending" data-stat="pending"><div class="clientes-stat-label">Pendientes</div><div class="clientes-stat-value">${esc(formatNumber(stats.pendingCount))}</div><div class="clientes-stat-text">Altas o validaciones pendientes.</div></article>
        <article class="clientes-stat-card clientes-stat-card--blocked" data-stat="blocked"><div class="clientes-stat-label">Bloqueados</div><div class="clientes-stat-value">${esc(formatNumber(stats.blockedCount))}</div><div class="clientes-stat-text">Cuentas restringidas o inactivas.</div></article>
      </div>
    </section>
  `;
}

function renderSearch(vm = {}) {
  return `
    <div class="clientes-search" role="search" aria-label="Buscar clientes">
      <span class="clientes-search-icon" aria-hidden="true">${icon("search")}</span>
      <input id="clientes-search-input" class="clientes-search-input" type="search" value="${at(vm.search)}" placeholder="Buscar cliente, email, NIF..." autocomplete="off" spellcheck="false" data-clientes-search-input="true" data-clientes-field="search" data-field="search" data-search-input="clientes" aria-label="Buscar clientes por nombre, email, NIF o identificador">
      ${vm.search ? `<button type="button" class="clientes-search-clear" data-clientes-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}" data-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}" aria-label="Limpiar búsqueda">${icon("close")}</button>` : ""}
    </div>
  `;
}

function renderFilters(vm = {}) {
  const order = normalizeSort(vm.sortOrder);
  const next = nextSort(order);

  return `
    <div class="clientes-filters" data-clientes-filters="true">
      <div class="clientes-filter-pills" role="tablist" aria-label="Filtrar clientes">
        ${FILTERS.map((filter) => {
          const active = filter.key === vm.filter;
          return `<button type="button" role="tab" class="clientes-filter-pill${active ? " is-active" : ""}" data-clientes-action="${CLIENTES_ACTIONS.FILTER}" data-action="${CLIENTES_ACTIONS.FILTER}" data-filter="${at(filter.key)}" aria-selected="${active ? "true" : "false"}" aria-pressed="${active ? "true" : "false"}"><span>${esc(filter.label)}</span><strong>${esc(formatNumber(vm.filterCounts?.[filter.key] || 0))}</strong></button>`;
        }).join("")}
      </div>
      <div class="clientes-sort-pills" data-clientes-sort-pills="true">
        <button type="button" class="clientes-sort-pill is-active" data-clientes-action="${CLIENTES_ACTIONS.SORT_TOGGLE}" data-action="${CLIENTES_ACTIONS.SORT_TOGGLE}" data-sort-order="${at(order)}" data-next-sort-order="${at(next)}" aria-pressed="true" aria-label="Cambiar orden a ${at(sortLabel(next))}" title="Cambiar orden a ${at(sortLabel(next))}">${icon("calendar")}<span>${esc(sortLabel(order))}</span></button>
      </div>
      ${renderSearch(vm)}
    </div>
  `;
}

/* =========================================================
   TABLE / STATES
========================================================= */

function renderColgroup() {
  return `<colgroup>${CLIENTES_TABLE_COLUMNS.map((column) => `<col class="${at(column.colClass)}">`).join("")}</colgroup>`;
}

function renderThead() {
  return `<thead><tr>${CLIENTES_TABLE_COLUMNS.map((column) => `<th class="${at(column.thClass)}" scope="col" data-column="${at(column.key)}">${esc(column.label)}</th>`).join("")}</tr></thead>`;
}

function renderTableLoading(rows = DEFAULT_VISIBLE_ROWS) {
  const count = Math.max(4, num(rows, DEFAULT_VISIBLE_ROWS));

  return `
    <div class="clientes-table-wrap is-loading" data-clientes-table-wrap="true">
      <div class="clientes-table-loading" aria-hidden="true">
        <div class="clientes-table-shell">
          <table class="clientes-table clientes-table--no-actions clientes-table--scale-110" role="table" aria-label="Cargando clientes" data-table-columns="${at(String(CLIENTES_TABLE_COLUMNS.length))}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}">
            ${renderColgroup()}${renderThead()}
            <tbody>${Array.from({ length: count }).map((_, index) => `<tr class="clientes-row clientes-row--skeleton" aria-hidden="true" data-skeleton-row="${index + 1}">${CLIENTES_TABLE_COLUMNS.map((column) => `<td class="${at(column.cellClass)}" data-column="${at(column.key)}"><span class="clientes-skeleton clientes-skeleton--${at(column.key)}"></span></td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderRefreshOverlay() {
  return `<div class="clientes-refresh-overlay" aria-live="polite" aria-busy="true"><span class="clientes-inline-loading"><span class="clientes-inline-spinner" aria-hidden="true"></span><span>Actualizando clientes...</span></span></div>`;
}

function renderEmpty(vm = {}) {
  const hasError = Boolean(vm.error);
  const filtering = vm.filter !== "all" || Boolean(vm.search);
  const mismatch = vm.total > 0 && !vm.visibleItems.length && !filtering && !hasError;
  const title = hasError
    ? "No se pudieron cargar los clientes"
    : filtering
      ? "No hay clientes con esos filtros"
      : mismatch
        ? "Hay clientes, pero no llegaron filas al listado"
        : "Todavía no hay clientes";
  const text = hasError
    ? vm.error
    : filtering
      ? "Prueba a limpiar la búsqueda o cambia el filtro activo para volver al historial completo."
      : mismatch
        ? "La API está entregando total, pero no está entregando ningún array de filas compatible."
        : "Cuando haya clientes registrados aparecerán aquí con su estado, actividad, contacto y facturación asociada.";

  return `
    <div class="clientes-empty${mismatch ? " is-data-mismatch" : ""}" data-clientes-empty="true">
      <div class="clientes-empty-icon" aria-hidden="true">${hasError || mismatch ? icon("alert") : icon("users")}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${hasError || mismatch ? `<button type="button" class="clientes-btn" data-clientes-action="${CLIENTES_ACTIONS.REFRESH}" data-action="${CLIENTES_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button>` : filtering ? `<button type="button" class="clientes-btn" data-clientes-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}" data-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}">${icon("close")}<span>Limpiar filtros</span></button>` : ""}
    </div>
  `;
}

function renderFeedFooter(vm = {}) {
  if (!vm.total || !vm.visibleCount) {
    return `<div class="clientes-feed-sentinel" data-clientes-load-more="true" data-clientes-infinite-sentinel="true" aria-hidden="true"></div>`;
  }

  if (!vm.hasMore) {
    return `<div class="clientes-feed-end" data-clientes-feed-end="true" data-clientes-load-more="false"><span class="clientes-feed-end-text">Has visto todos los clientes disponibles.</span></div>`;
  }

  return `
    <div class="clientes-feed-more" data-clientes-feed-more="true">
      <button type="button" class="clientes-load-more-btn${vm.loadingMore ? " is-loading" : ""}" data-clientes-action="${CLIENTES_ACTIONS.LOAD_MORE}" data-action="${CLIENTES_ACTIONS.LOAD_MORE}" data-clientes-load-more-button="true" ${htmlAttrs({ disabled: vm.loadingMore, "aria-disabled": vm.loadingMore ? "true" : false, "aria-busy": vm.loadingMore ? "true" : false })}>
        ${vm.loadingMore ? spinner("Cargando más clientes...") : `${icon("chevronDown")}<span>Mostrar más</span><span class="clientes-load-more-count">${esc(`${formatNumber(vm.remainingCount)} restantes`)}</span>`}
      </button>
      <div class="clientes-feed-sentinel" data-clientes-load-more="true" data-clientes-infinite-sentinel="true" data-load-more-sentinel="true" aria-hidden="true"></div>
    </div>
  `;
}

function renderTable(vm = {}) {
  if (!vm.visibleItems.length) return renderEmpty(vm);

  return `
    <div class="clientes-table-shell">
      <table class="clientes-table clientes-table--no-actions clientes-table--scale-110" role="table" aria-label="Listado de clientes" data-table-columns="${at(String(CLIENTES_TABLE_COLUMNS.length))}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" data-sort-order="${at(vm.sortOrder)}">
        ${renderColgroup()}${renderThead()}
        <tbody>${vm.visibleItems.map((item) => renderRow(item, vm)).join("")}</tbody>
      </table>
    </div>
    ${renderFeedFooter(vm)}
  `;
}

function renderHistory(vm = {}) {
  const initialLoading = vm.loading && !vm.visibleItems.length;
  const refreshing = vm.refreshing && vm.visibleItems.length;
  const activeLabel = FILTERS.find((filter) => filter.key === vm.filter)?.label || "Todos";
  const criteria = [vm.filter !== "all" ? activeLabel : "", vm.search ? `búsqueda “${vm.search}”` : ""].filter(Boolean);
  const subtitle = initialLoading
    ? "Cargando clientes..."
    : vm.filter !== "all" || vm.search
      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${criteria.length ? ` · ${criteria.join(" · ")}` : ""} · orden ${sortLabel(vm.sortOrder).toLowerCase()}`
      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · orden ${sortLabel(vm.sortOrder).toLowerCase()}`;

  return `
    <section class="clientes-history" data-clientes-scroll-host="true" data-clientes-scroll-mode="infinite">
      <div class="clientes-history-head" data-clientes-history-head="true">
        <div class="clientes-history-copy"><h2 class="clientes-history-title">Historial de clientes</h2><p class="clientes-history-subtitle">${esc(subtitle)}</p></div>
        <button type="button" class="clientes-btn clientes-btn--export" data-clientes-action="${CLIENTES_ACTIONS.EXPORT}" data-action="${CLIENTES_ACTIONS.EXPORT}" ${htmlAttrs({ disabled: !vm.items.length, "aria-disabled": !vm.items.length ? "true" : false })}>${icon("chevronDown")}<span>Exportar</span></button>
        ${renderFilters(vm)}
      </div>
      ${initialLoading ? renderTableLoading(DEFAULT_VISIBLE_ROWS) : `<div class="clientes-table-wrap${refreshing ? " is-refreshing" : ""}" data-clientes-table-wrap="true" data-clientes-scroll-mode="infinite">${refreshing ? renderRefreshOverlay() : ""}${renderTable(vm)}</div>`}
    </section>
  `;
}

/* =========================================================
   EXPORTS
========================================================= */

export function renderClientesLoadingState(input = {}) {
  const vm = buildVm({ ...obj(input), loading: true });

  return `
    <section class="clientes-view-root clientes-view-root--loading is-loading" data-clientes-scope="true" data-template-version="${at(CLIENTES_TEMPLATE_VERSION)}" data-total="${at(String(vm.total))}" data-visible="${at(String(vm.visibleCount))}" data-filter="${at(vm.filter)}" data-sort-order="${at(vm.sortOrder)}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" aria-busy="true">
      ${renderHeader(vm)}${renderHistory(vm)}
    </section>
  `;
}

export function renderClientesErrorState(input = {}) {
  const data = typeof input === "string" ? { error: input } : obj(input, {});
  const message = txt(first(data.error, data.message, "No se pudieron cargar los clientes."), "No se pudieron cargar los clientes.");

  return `
    <section class="clientes-view-root clientes-view-root--error has-error" data-clientes-scope="true" data-template-version="${at(CLIENTES_TEMPLATE_VERSION)}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" aria-busy="false">
      <section class="clientes-error" role="alert">
        <div class="clientes-error-icon" aria-hidden="true">${icon("alert")}</div>
        <div class="clientes-error-copy">
          <h3 class="clientes-error-title">No se pudo renderizar la vista de clientes</h3>
          <p class="clientes-error-text">${esc(message)}</p>
        </div>
        <button type="button" class="clientes-btn" data-clientes-action="${CLIENTES_ACTIONS.REFRESH}" data-action="${CLIENTES_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button>
      </section>
    </section>
  `;
}

export function renderLoadingState(input = {}) {
  return renderClientesLoadingState(input);
}

export function renderErrorState(input = {}) {
  return renderClientesErrorState(input);
}

export function renderAccessDeniedState() {
  return `
    <section class="clientes-view-root clientes-view-root--forbidden has-error" data-clientes-scope="true" data-template-version="${at(CLIENTES_TEMPLATE_VERSION)}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" aria-busy="false">
      <section class="clientes-error clientes-error--forbidden" role="alert">
        <div class="clientes-error-icon" aria-hidden="true">${icon("shield")}</div>
        <div class="clientes-error-copy">
          <h3 class="clientes-error-title">Acceso restringido</h3>
          <p class="clientes-error-text">No tienes permisos suficientes para acceder a la gestión de clientes.</p>
        </div>
      </section>
    </section>
  `;
}

export function renderClientesTemplate(input = {}) {
  const vm = buildVm(input);

  if (vm.data.forbidden || vm.data.accessDenied || vm.data.restricted) {
    return renderAccessDeniedState(input);
  }

  return `
    <section class="${cls("clientes-view-root", vm.loading ? "is-loading" : "", vm.refreshing ? "is-refreshing" : "", vm.creating ? "is-creating" : "", vm.error ? "has-error" : "")}" data-clientes-scope="true" data-template-version="${at(CLIENTES_TEMPLATE_VERSION)}" data-route="${at(vm.route)}" data-total="${at(String(vm.total))}" data-visible="${at(String(vm.visibleCount))}" data-filter="${at(vm.filter)}" data-search-active="${vm.search ? "true" : "false"}" data-sort-order="${at(vm.sortOrder)}" data-loading="${vm.loading ? "true" : "false"}" data-refreshing="${vm.refreshing ? "true" : "false"}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" data-items-extracted="${at(String(vm.items.length))}" data-total-greater-than-items="${vm.diagnostics.totalGreaterThanItems ? "true" : "false"}" aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}">
      ${vm.error ? `<div class="clientes-alert" role="alert">${icon("alert")}<span>${esc(vm.error)}</span></div>` : ""}
      ${renderHeader(vm)}${renderHistory(vm)}
    </section>
  `;
}

export function renderClientesTableTemplate(input = {}) {
  return renderClientesTemplate(input);
}

export function renderTemplate(input = {}) {
  return renderClientesTemplate(input);
}

export const renderEmptyState = renderClientesTemplate;
export const renderCards = renderClientesTemplate;
export const renderTableTemplate = renderClientesTemplate;

export function getClientesTemplateSnapshot(input = {}) {
  const vm = buildVm(input);

  return {
    version: CLIENTES_TEMPLATE_VERSION,
    total: vm.total,
    extractedItems: vm.items.length,
    visibleCount: vm.visibleCount,
    filteredTotal: vm.filteredTotal,
    filter: vm.filter,
    searchLength: vm.search.length,
    sortOrder: vm.sortOrder,
    columns: CLIENTES_TABLE_COLUMNS.map((column) => column.key),
    actions: { ...CLIENTES_ACTIONS },
    tableScale: TABLE_SCALE,
  };
}

export function getClientesTableTemplateSnapshot(input = {}) {
  return getClientesTemplateSnapshot(input);
}

export function getSnapshot(input = {}) {
  return getClientesTemplateSnapshot(input);
}

export default renderClientesTemplate;

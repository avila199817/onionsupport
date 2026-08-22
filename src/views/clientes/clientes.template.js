/* =========================================================
Onion Support - Clientes Template
Archivo: /src/views/clientes/clientes.template.js
PRODUCTIVO · INCIDENCIAS / FACTURAS PARITY · V9
- Template puro: sin HTTP, Router, Store ni side effects.
- Tarjetas KPI interactivas conectadas al filtro canónico existente.
- Avatares deterministas por identidad, con foto real cuando existe.
- Cinco columnas: Cliente / Estado / Alta / Contacto / Importe.
========================================================= */

export const CLIENTES_TEMPLATE_VERSION =
  "clientes.template.productivo.v9.interactive-stats-parity";

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

const DEFAULT_VISIBLE_ROWS = 20;
const MAX_VISIBLE_ROWS = 500;
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_SORT_ORDER = "desc";

export const CLIENTES_DEFAULT_VISIBLE_ROWS = DEFAULT_VISIBLE_ROWS;
export const CLIENTES_DEFAULT_PAGE_SIZE = DEFAULT_VISIBLE_ROWS;
export const CLIENTES_MAX_VISIBLE_ROWS = MAX_VISIBLE_ROWS;

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
]);

export const CLIENTES_TABLE_COLUMNS = Object.freeze([
  { key: "main", label: "Cliente" },
  { key: "status", label: "Estado" },
  { key: "created", label: "Alta" },
  { key: "contact", label: "Contacto" },
  { key: "amount", label: "Importe" },
]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  let raw = String(value)
    .trim()
    .replace(/[€$£¥%]/g, "")
    .replace(/[^\d.,+\-\s]/g, "")
    .replace(/\s+/g, "");

  if (!raw || raw === "+" || raw === "-") return fallback;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    raw =
      comma > dot
        ? raw.replace(/\./g, "").replace(/,/g, ".")
        : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    raw = raw.replace(/,/g, ".");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(number(value, min), min), max);
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

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBoolean(value, fallback = null) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const key = normalizeKey(value);

  if (["true", "yes", "si", "on", "enabled", "active", "activo"].includes(key)) {
    return true;
  }

  if (
    ["false", "no", "off", "disabled", "inactive", "inactivo"].includes(key)
  ) {
    return false;
  }

  return fallback;
}

function toTimestamp(value = null) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9_999_999_999 ? value : value * 1000;
  }

  const raw = cleanText(value, "");
  if (!raw) return 0;

  if (/^[+\-]?\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return numeric > 9_999_999_999 ? numeric : numeric * 1000;
    }
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number(value, 0));
  } catch {
    return `${number(value, 0).toFixed(2).replace(".", ",")} €`;
  }
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
    return new Date(timestamp).toISOString();
  }
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin actividad";

  const diffMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const absolute = Math.abs(diffMinutes);

  if (absolute < 1) return "Ahora mismo";
  if (absolute < 60) return diffMinutes > 0 ? `En ${absolute} min` : `Hace ${absolute} min`;

  const hours = Math.round(absolute / 60);
  if (hours < 24) return diffMinutes > 0 ? `En ${hours} h` : `Hace ${hours} h`;

  const days = Math.round(hours / 24);
  if (days <= 7) {
    return diffMinutes > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDateShort(timestamp);
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  return email && email.includes("@") ? email : "";
}

function normalizeStatus(value = "", source = {}) {
  const raw = safeObject(source);
  const key = normalizeKey(first(value, raw.status, raw.estado, raw.state, ""));

  if (["pending", "pendiente", "new", "nuevo", "invited"].includes(key)) {
    return "pending";
  }

  if (["blocked", "bloqueado", "suspended", "locked"].includes(key)) {
    return "blocked";
  }

  if (["inactive", "inactivo", "disabled", "archived", "deleted"].includes(key)) {
    return "inactive";
  }

  if (["vip", "premium"].includes(key)) return "vip";
  if (["active", "activo", "enabled", "ok"].includes(key)) return "active";

  if (parseBoolean(raw.blocked, false) === true) return "blocked";

  if (
    parseBoolean(raw.active, true) === false ||
    parseBoolean(raw.disabled, false) === true
  ) {
    return "inactive";
  }

  return "active";
}

function normalizeType(value = "") {
  const key = normalizeKey(value);

  if (["empresa", "company", "business", "b2b", "autonomo"].includes(key)) {
    return "empresa";
  }

  if (["particular", "persona", "individual", "b2c"].includes(key)) {
    return "particular";
  }

  return "cliente";
}

function safeAvatarUrl(value = "") {
  const raw = cleanText(value, "");

  if (
    !raw ||
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(raw)
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (!/^https:\/\//i.test(raw)) return "";

  try {
    const url = new URL(raw);

    if (
      url.searchParams.has("sig") &&
      !url.hostname.toLowerCase().endsWith(".blob.core.windows.net")
    ) {
      return "";
    }

    if (
      /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|jwt|authorization|reset_token|activation_token)=/i.test(
        url.href
      )
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

export function normalizeClienteModel(value = {}) {
  const source = safeObject(
    first(value?.cliente, value?.client, value?.customer, value?.detail, value?.data, value),
    {}
  );
  const raw = safeObject(source.raw, source);
  const contacto = safeObject(first(source.contacto, raw.contacto, {}), {});
  const direccion = safeObject(
    first(source.direccion, source.address, raw.direccion, raw.address, {}),
    {}
  );

  const clienteId = cleanText(
    first(
      source.clienteId,
      source.clientId,
      source.customerId,
      source.id,
      source._id,
      source.uid,
      raw.clienteId,
      raw.id,
      ""
    ),
    ""
  );

  const nombreFiscal = cleanText(
    first(
      source.nombreFiscal,
      source.razonSocial,
      source.businessName,
      source.companyName,
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      raw.nombreFiscal,
      raw.razonSocial,
      raw.displayName,
      clienteId,
      "Cliente"
    ),
    "Cliente"
  );

  const contactoNombre = cleanText(
    first(
      source.contactoNombre,
      source.nombreContacto,
      contacto.nombre,
      contacto.name,
      raw.contactoNombre,
      nombreFiscal,
      ""
    ),
    ""
  );

  const email = normalizeEmail(
    first(
      source.email,
      source.emailLower,
      source.contactoEmail,
      source.contactEmail,
      contacto.email,
      contacto.emailLower,
      raw.email,
      raw.contactoEmail,
      ""
    )
  );

  const phone = cleanText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      source.movil,
      source.contactoPhone,
      contacto.phone,
      contacto.telefono,
      raw.phone,
      raw.telefono,
      ""
    ),
    ""
  );

  const nif = cleanText(
    first(source.nif, source.cif, source.taxId, raw.nif, raw.cif, raw.taxId, ""),
    ""
  ).toUpperCase();

  const city = cleanText(
    first(
      source.city,
      source.ciudad,
      direccion.city,
      direccion.ciudad,
      raw.city,
      raw.ciudad,
      ""
    ),
    ""
  );

  const status = normalizeStatus(
    first(source.status, source.estado, source.state, raw.status, raw.estado, ""),
    { ...raw, ...source }
  );

  const tipo = normalizeType(
    first(source.tipo, source.type, source.clienteTipo, raw.tipo, raw.type, "")
  );

  const createdAt = first(source.createdAt, raw.createdAt, null);
  const updatedAt = first(
    source.updatedAt,
    source.lastActivityAt,
    raw.updatedAt,
    raw.lastActivityAt,
    createdAt,
    null
  );

  const totalAmount = number(
    first(
      source.totalAmount,
      source.totalImporte,
      source.facturasTotal,
      raw.totalAmount,
      raw.totalImporte,
      raw.facturasTotal,
      0
    ),
    0
  );

  const avatar = safeAvatarUrl(
    first(
      source.avatar,
      source.avatarUrl,
      source.photoUrl,
      source.picture,
      raw.avatar,
      raw.avatarUrl,
      raw.photoUrl,
      raw.picture,
      ""
    )
  );

  return {
    ...source,
    id: clienteId,
    clienteId,
    clientId: cleanText(first(source.clientId, clienteId), clienteId),
    customerId: cleanText(first(source.customerId, clienteId), clienteId),
    userId: cleanText(first(source.userId, source.usuarioId, raw.userId, raw.usuarioId, ""), ""),
    code: cleanText(first(source.code, source.codigo, clienteId, nif, email, "CLI-SIN-ID"), "CLI-SIN-ID"),
    codigo: cleanText(first(source.codigo, source.code, clienteId, nif, email, "CLI-SIN-ID"), "CLI-SIN-ID"),
    nombreFiscal,
    razonSocial: cleanText(first(source.razonSocial, nombreFiscal), nombreFiscal),
    displayName: cleanText(first(source.displayName, nombreFiscal), nombreFiscal),
    fullName: cleanText(first(source.fullName, nombreFiscal), nombreFiscal),
    name: cleanText(first(source.name, nombreFiscal), nombreFiscal),
    nombre: cleanText(first(source.nombre, nombreFiscal), nombreFiscal),
    contactoNombre,
    nombreContacto: contactoNombre,
    email,
    emailLower: email,
    phone,
    telefono: phone,
    nif,
    cif: nif,
    city,
    ciudad: city,
    direccion,
    address: direccion,
    tipo,
    type: tipo,
    status,
    estado: status,
    active: !["blocked", "inactive"].includes(status),
    blocked: ["blocked", "inactive"].includes(status),
    vip: status === "vip",
    avatar,
    avatarUrl: avatar,
    createdAt,
    updatedAt,
    lastActivityAt: first(source.lastActivityAt, updatedAt, createdAt, null),
    totalAmount,
    totalImporte: totalAmount,
    facturasTotal: totalAmount,
    invoicesCount: Math.max(
      0,
      number(first(source.invoicesCount, source.facturasCount, source.invoiceCount, 0), 0)
    ),
    ticketsCount: Math.max(
      0,
      number(first(source.ticketsCount, source.incidenciasCount, source.ticketCount, 0), 0)
    ),
  };
}

function stableId(item = {}) {
  const current = normalizeClienteModel(item);
  return cleanText(
    first(current.clienteId, current.id, current.nif, current.email, ""),
    ""
  );
}

function sortTime(item = {}) {
  const current = normalizeClienteModel(item);
  return toTimestamp(first(current.lastActivityAt, current.updatedAt, current.createdAt, 0));
}

export function normalizeClientesCollection(items = []) {
  const map = new Map();
  let anon = 0;

  for (const value of safeArray(items)) {
    if (!isObject(value)) continue;

    const current = normalizeClienteModel(value);
    const id = stableId(current);
    const key = id ? id.toLowerCase() : `anon:${anon++}`;

    if (map.has(key)) {
      map.set(key, normalizeClienteModel({ ...map.get(key), ...current }));
    } else {
      map.set(key, current);
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      sortTime(b) - sortTime(a) ||
      a.nombreFiscal.localeCompare(b.nombreFiscal, "es", {
        numeric: true,
        sensitivity: "base",
      })
  );
}

function statusBucket(item = {}) {
  const status = normalizeClienteModel(item).status;

  if (status === "pending") return "pending";
  if (["blocked", "inactive"].includes(status)) return "blocked";

  return "active";
}

function resolveItems(input = {}) {
  if (Array.isArray(input)) return input;

  const data = safeObject(input);

  for (const key of ["items", "clientes", "clients", "customers", "rows", "results"]) {
    if (Array.isArray(data[key])) return data[key];
  }

  return [];
}

function clientSearchText(item = {}) {
  const current = normalizeClienteModel(item);

  return normalizeSearch(
    [
      current.clienteId,
      current.userId,
      current.code,
      current.nombreFiscal,
      current.contactoNombre,
      current.email,
      current.phone,
      current.city,
      current.nif,
      current.tipo,
      current.status,
    ].join(" ")
  );
}

function buildVm(input = {}) {
  const data = safeObject(input);
  const items = normalizeClientesCollection(resolveItems(data));

  const requestedFilter = normalizeKey(data.filter);
  const filter = FILTERS.some((entry) => entry.key === requestedFilter)
    ? requestedFilter
    : "all";

  const search = cleanText(first(data.search, data.query, data.q, ""), "");
  const sortOrder = ["asc", "ascending", "oldest", "antiguos"].includes(
    normalizeKey(first(data.sortOrder, data.order, DEFAULT_SORT_ORDER))
  )
    ? "asc"
    : "desc";

  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);

  const filteredItems = items
    .filter((item) => filter === "all" || statusBucket(item) === filter)
    .filter(
      (item) =>
        !terms.length ||
        terms.every((term) => clientSearchText(item).includes(term))
    )
    .sort(
      (a, b) =>
        (sortOrder === "asc" ? sortTime(a) - sortTime(b) : sortTime(b) - sortTime(a)) ||
        a.nombreFiscal.localeCompare(b.nombreFiscal, "es", {
          numeric: true,
          sensitivity: "base",
        })
    );

  const visibleLimit = clamp(
    first(data.visibleLimit, data.limit, DEFAULT_VISIBLE_ROWS),
    1,
    MAX_VISIBLE_ROWS
  );

  const visibleItems = filteredItems.slice(0, visibleLimit);

  const counts = {
    all: items.length,
    active: 0,
    pending: 0,
    blocked: 0,
  };

  let totalAmount = 0;
  let lastUpdateTs = 0;

  for (const item of items) {
    counts[statusBucket(item)] += 1;
    totalAmount += number(item.totalAmount, 0);
    lastUpdateTs = Math.max(lastUpdateTs, sortTime(item));
  }

  const incomingStats = safeObject(data.stats);
  const stats = {
    total: items.length,
    activeCount: counts.active,
    pendingCount: counts.pending,
    blockedCount: counts.blocked,
    vipCount: items.filter((item) => item.status === "vip").length,
    totalAmount: number(
      first(incomingStats.totalAmount, incomingStats.invoiceTotal, totalAmount),
      totalAmount
    ),
    lastUpdateTs: number(
      first(data.lastSyncAt, incomingStats.lastUpdateTs, lastUpdateTs),
      lastUpdateTs
    ),
  };

  return {
    data,
    admin: data.admin === true || normalizeKey(data.role) === "admin",
    items,
    filteredItems,
    visibleItems,
    visibleLimit,
    total: items.length,
    reportedTotal: Math.max(
      items.length,
      number(first(data.total, data.remoteCount, data.totalCount, items.length), items.length)
    ),
    filteredTotal: filteredItems.length,
    visibleCount: visibleItems.length,
    remainingCount: Math.max(0, filteredItems.length - visibleItems.length),
    hasMore: filteredItems.length > visibleItems.length,
    filter,
    search,
    sortOrder,
    nextSortOrder: sortOrder === "asc" ? "desc" : "asc",
    filterCounts: counts,
    stats,
    loading: data.loading === true,
    refreshing: data.refreshing === true,
    creating: data.creating === true,
    loadingMore: data.loadingMore === true,
    error: cleanText(data.error, ""),
    openingClienteId: cleanText(
      first(data.openingClienteId, data.openingClientId, ""),
      ""
    ),
    lastSyncAt: number(data.lastSyncAt, stats.lastUpdateTs),
  };
}

function icon(name = "") {
  const common =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    export:
      '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    refresh:
      '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
    euro: '<path d="M4 10h10M4 14h9"/><path d="M18 6.5A7 7 0 1 0 18 17.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone:
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };

  return `<svg ${common}>${paths[name] || paths.chevron}</svg>`;
}

function initials(value = "") {
  const words = cleanText(value, "CL").split(/\s+/).filter(Boolean);

  return (
    (words.length >= 2
      ? `${words[0][0]}${words[1][0]}`
      : words[0].slice(0, 2)
    ).toUpperCase()
  );
}

function avatarTone(item = {}) {
  const current = normalizeClienteModel(item);
  const seed = cleanText(
    first(current.email, current.nombreFiscal, current.clienteId, "cliente"),
    "cliente"
  );

  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }

  return Math.abs(hash) % 10;
}

function renderAvatar(item = {}) {
  const current = normalizeClienteModel(item);
  const src = safeAvatarUrl(current.avatar);
  const label = cleanText(
    first(current.contactoNombre, current.nombreFiscal, current.email, "Cliente"),
    "Cliente"
  );

  return `
    <span
      class="clientes-avatar clientes-avatar--tone-${avatarTone(current)}${src ? " has-image" : ""}"
      data-has-avatar="${src ? "true" : "false"}"
      aria-hidden="true"
    >
      ${
        src
          ? `<img class="clientes-avatar-img" src="${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
          : ""
      }
      <span class="clientes-avatar-fallback">${escapeHtml(initials(label))}</span>
    </span>
  `;
}

function statusLabel(item = {}) {
  const status = normalizeClienteModel(item).status;

  return (
    {
      active: "Activo",
      vip: "VIP",
      pending: "Pendiente",
      blocked: "Bloqueado",
      inactive: "Inactivo",
    }[status] || "Activo"
  );
}

function typeLabel(item = {}) {
  const type = normalizeClienteModel(item).tipo;
  if (type === "empresa") return "Empresa";
  if (type === "particular") return "Particular";
  return "Cliente";
}

function formatPhone(value = "") {
  const raw = cleanText(value, "");
  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return raw;

  let national = digits;
  let prefix = "";

  if (digits.length === 11 && digits.startsWith("34")) {
    prefix = "+34 ";
    national = digits.slice(2);
  } else if (raw.startsWith("+34") && digits.length >= 11) {
    prefix = "+34 ";
    national = digits.slice(-9);
  }

  if (national.length === 9) {
    return `${prefix}${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }

  return raw;
}

function mailtoHref(email = "") {
  return `mailto:${encodeURIComponent(email)}`;
}

function telHref(phone = "") {
  return `tel:${cleanText(phone, "").replace(/[^\d+]/g, "")}`;
}

function renderStatusChip(item = {}) {
  const bucket = statusBucket(item);

  return `
    <span class="clientes-chip clientes-chip--${attr(bucket)}">
      <span class="clientes-chip-dot" aria-hidden="true"></span>
      <span>${escapeHtml(statusLabel(item))}</span>
    </span>
  `;
}

function renderContact(item = {}) {
  const current = normalizeClienteModel(item);
  const phone = formatPhone(current.phone);

  if (!current.email && !phone) {
    return `<span class="clientes-contact-empty">Sin contacto</span>`;
  }

  return `
    <div class="clientes-contact-stack">
      ${
        current.email
          ? `<a class="clientes-contact-link" href="${attr(mailtoHref(current.email))}" data-stop-row="true">${icon("mail")}<span>${escapeHtml(current.email)}</span></a>`
          : ""
      }
      ${
        phone
          ? `<a class="clientes-contact-link" href="${attr(telHref(current.phone))}" data-stop-row="true">${icon("phone")}<span>${escapeHtml(phone)}</span></a>`
          : ""
      }
    </div>
  `;
}

function renderRow(item = {}, vm = {}) {
  const current = normalizeClienteModel(item);
  const id = current.clienteId;
  const opening = Boolean(id && vm.openingClienteId === id);
  const secondary =
    [current.email, current.nif].filter(Boolean).join(" · ") || "Sin datos fiscales";

  return `
    <tr
      class="clientes-table-row clientes-table-row--${attr(statusBucket(current))}${opening ? " is-loading" : ""}"
      data-client-row="true"
      data-cliente-row="true"
      data-client-id="${attr(id)}"
      data-cliente-id="${attr(id)}"
      data-clientes-action="${CLIENTES_ACTIONS.OPEN_DETAIL}"
      data-action="${CLIENTES_ACTIONS.OPEN_DETAIL}"
      tabindex="0"
      role="button"
      aria-label="Abrir cliente ${attr(current.nombreFiscal)}"
      aria-busy="${opening ? "true" : "false"}"
    >
      <td class="clientes-cell clientes-cell--main">
        <div class="clientes-main">
          ${renderAvatar(current)}
          <div class="clientes-main-copy">
            <div class="clientes-client-line-top">
              <span class="clientes-client-id">${escapeHtml(current.code)}</span>
              <span class="clientes-category-pill">${escapeHtml(typeLabel(current))}</span>
            </div>
            <div class="clientes-client-name">${escapeHtml(current.nombreFiscal)}</div>
            <div class="clientes-client-description">${escapeHtml(secondary)}</div>
            <div class="clientes-client-meta">
              <span>${escapeHtml(current.city || "Sin ciudad")}</span>
              ${
                current.nif
                  ? `<span class="clientes-mini-badge">${escapeHtml(current.nif)}</span>`
                  : ""
              }
            </div>
          </div>
        </div>
      </td>
      <td class="clientes-cell clientes-cell--status">${renderStatusChip(current)}</td>
      <td class="clientes-cell clientes-cell--date">
        <span class="clientes-date-inline" title="${attr(formatDateTime(current.createdAt))}">
          ${escapeHtml(formatDateShort(current.createdAt))}
        </span>
      </td>
      <td class="clientes-cell clientes-cell--contact">${renderContact(current)}</td>
      <td class="clientes-cell clientes-cell--amount">
        <div class="clientes-total-stack">
          <span class="clientes-total-value">${escapeHtml(formatMoney(current.totalAmount))}</span>
          <span class="clientes-total-caption">Facturación acumulada</span>
        </div>
      </td>
    </tr>
  `;
}

function renderSpinner(label = "Cargando") {
  return `
    <span class="clientes-inline-loading">
      <span class="clientes-inline-spinner" aria-hidden="true"></span>
      ${label ? `<span>${escapeHtml(label)}</span>` : ""}
    </span>
  `;
}

function renderTableLoading(rows = 6) {
  return `
    <div class="clientes-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="clientes-table-loading-row">
              <span class="clientes-skeleton clientes-skeleton--avatar"></span>
              <div class="clientes-table-loading-copy">
                <span class="clientes-skeleton clientes-skeleton--xs"></span>
                <span class="clientes-skeleton clientes-skeleton--lg"></span>
                <span class="clientes-skeleton clientes-skeleton--md"></span>
              </div>
              <span class="clientes-skeleton clientes-skeleton--pill"></span>
              <span class="clientes-skeleton clientes-skeleton--date"></span>
              <span class="clientes-skeleton clientes-skeleton--contact"></span>
              <span class="clientes-skeleton clientes-skeleton--amount"></span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStatCard({
  filter,
  tone,
  iconName,
  label,
  value,
  description,
  vm,
} = {}) {
  const active = vm.filter === filter;

  return `
    <button
      type="button"
      class="clientes-stat-card clientes-stat-card--${attr(tone)}${active ? " is-active" : ""}"
      data-clientes-action="${CLIENTES_ACTIONS.FILTER}"
      data-action="${CLIENTES_ACTIONS.FILTER}"
      data-filter="${attr(filter)}"
      aria-pressed="${active ? "true" : "false"}"
      aria-label="Filtrar clientes: ${attr(label)}"
    >
      <span class="clientes-stat-topline">
        <span class="clientes-stat-label">${escapeHtml(label)}</span>
        <span class="clientes-stat-icon" aria-hidden="true">${icon(iconName)}</span>
      </span>
      <span class="clientes-stat-value">${escapeHtml(formatNumber(value))}</span>
      <span class="clientes-stat-text">${escapeHtml(description)}</span>
    </button>
  `;
}

function renderHeader(vm = {}) {
  const stats = vm.stats;

  return `
    <section class="clientes-hero" data-clientes-hero="true">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-page-title">Clientes</h1>
          <p class="clientes-page-subtitle">
            Gestiona clientes, altas, facturación y contactos desde un único historial.
          </p>
        </div>

        <div class="clientes-hero-actions">
          <button
            type="button"
            id="clientes-export-btn"
            class="clientes-btn"
            data-clientes-action="${CLIENTES_ACTIONS.EXPORT}"
            data-action="${CLIENTES_ACTIONS.EXPORT}"
            ${vm.items.length ? "" : 'disabled aria-disabled="true"'}
          >
            ${icon("export")}
            <span>Exportar CSV</span>
          </button>

          ${
            vm.admin
              ? `
                <button
                  type="button"
                  id="clientes-create-btn"
                  class="clientes-btn clientes-btn--create"
                  data-clientes-action="${CLIENTES_ACTIONS.CREATE_OPEN}"
                  data-action="${CLIENTES_ACTIONS.CREATE_OPEN}"
                  ${vm.creating ? 'disabled aria-disabled="true" aria-busy="true"' : ""}
                >
                  ${
                    vm.creating
                      ? renderSpinner("Abriendo...")
                      : `${icon("plus")}<span>Nuevo cliente</span>`
                  }
                </button>
              `
              : ""
          }
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill">
          ${icon("users")}
          <span>${escapeHtml(`${formatNumber(vm.reportedTotal)} clientes`)}</span>
        </span>
        <span class="clientes-meta-pill">
          ${icon("refresh")}
          <span>
            ${
              vm.lastSyncAt
                ? escapeHtml(`Última actualización · ${formatRelativeDate(vm.lastSyncAt)}`)
                : "Sin actualizaciones recientes"
            }
          </span>
        </span>
        <span class="clientes-meta-pill">
          ${icon("euro")}
          <span>${escapeHtml(formatMoney(stats.totalAmount))}</span>
        </span>
      </div>

      <div class="clientes-stats" role="group" aria-label="Filtrar clientes por resumen">
        ${renderStatCard({
          filter: "all",
          tone: "accent",
          iconName: "users",
          label: "Clientes",
          value: stats.total,
          description: "Todos los registros disponibles.",
          vm,
        })}
        ${renderStatCard({
          filter: "active",
          tone: "success",
          iconName: "check",
          label: "Activos",
          value: stats.activeCount,
          description: "Clientes operativos.",
          vm,
        })}
        ${renderStatCard({
          filter: "pending",
          tone: "warning",
          iconName: "clock",
          label: "Pendientes",
          value: stats.pendingCount,
          description: "Altas o validaciones pendientes.",
          vm,
        })}
        ${renderStatCard({
          filter: "blocked",
          tone: "danger",
          iconName: "lock",
          label: "Bloqueados",
          value: stats.blockedCount,
          description: "Cuentas restringidas o inactivas.",
          vm,
        })}
      </div>
    </section>
  `;
}

function renderSearch(vm = {}) {
  return `
    <div class="clientes-search" role="search" aria-label="Buscar clientes">
      <span class="clientes-search-icon" aria-hidden="true">${icon("search")}</span>
      <input
        id="clientes-search-input"
        class="clientes-search-input"
        type="search"
        value="${attr(vm.search)}"
        placeholder="Buscar cliente, email, NIF..."
        autocomplete="off"
        spellcheck="false"
        data-clientes-search-input="true"
        data-clientes-field="search"
        data-search-input="clientes"
        aria-label="Buscar clientes por nombre, email, NIF o identificador"
      >
      ${
        vm.search
          ? `
            <button
              type="button"
              class="clientes-search-clear"
              data-clientes-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}"
              data-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}"
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

function renderFilters(vm = {}) {
  return `
    <div class="clientes-filters" aria-label="Filtros, orden y búsqueda de clientes">
      <div class="clientes-filter-pills" role="group" aria-label="Filtrar clientes por estado">
        ${FILTERS.map((filter) => {
          const active = filter.key === vm.filter;

          return `
            <button
              type="button"
              class="clientes-filter-pill${active ? " is-active" : ""}"
              data-clientes-action="${CLIENTES_ACTIONS.FILTER}"
              data-action="${CLIENTES_ACTIONS.FILTER}"
              data-filter="${attr(filter.key)}"
              aria-pressed="${active ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(formatNumber(vm.filterCounts[filter.key] || 0))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      <div class="clientes-sort-pills" role="group" aria-label="Ordenar listado">
        <button
          type="button"
          class="clientes-sort-pill is-active"
          data-clientes-action="${CLIENTES_ACTIONS.SORT_TOGGLE}"
          data-action="${CLIENTES_ACTIONS.SORT_TOGGLE}"
          data-next-sort-order="${attr(vm.nextSortOrder)}"
          aria-pressed="true"
          title="Cambiar orden"
        >
          ${icon("calendar")}
          <span>${vm.sortOrder === "asc" ? "Fecha ↑" : "Fecha ↓"}</span>
        </button>
      </div>

      ${renderSearch(vm)}
    </div>
  `;
}

function renderEmpty(vm = {}) {
  const filtering = vm.filter !== "all" || Boolean(vm.search);

  const title =
    vm.error && !vm.items.length
      ? "No se pudieron cargar los clientes"
      : filtering
        ? "No hay clientes con esos filtros"
        : "Todavía no hay clientes";

  const message =
    vm.error && !vm.items.length
      ? vm.error
      : filtering
        ? "Prueba con otro estado o cambia la búsqueda."
        : "Cuando haya clientes registrados aparecerán aquí.";

  return `
    <div class="clientes-empty">
      <div class="clientes-empty-icon" aria-hidden="true">
        ${icon(filtering ? "search" : "users")}
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${
        filtering
          ? `
            <button
              type="button"
              class="clientes-btn"
              data-clientes-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}"
              data-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}"
            >
              ${icon("close")}
              <span>Limpiar filtros</span>
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderTable(vm = {}) {
  if (vm.loading && !vm.items.length) return renderTableLoading();
  if (!vm.visibleItems.length) return renderEmpty(vm);

  return `
    <div class="clientes-table-shell">
      <table class="clientes-table">
        <colgroup>
          <col class="clientes-col--main">
          <col class="clientes-col--status">
          <col class="clientes-col--date">
          <col class="clientes-col--contact">
          <col class="clientes-col--amount">
        </colgroup>
        <thead>
          <tr>
            ${CLIENTES_TABLE_COLUMNS.map(
              (column) =>
                `<th scope="col" class="clientes-th clientes-th--${attr(column.key)}">${escapeHtml(column.label)}</th>`
            ).join("")}
          </tr>
        </thead>
        <tbody>
          ${vm.visibleItems.map((item) => renderRow(item, vm)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFooter(vm = {}) {
  if (!vm.items.length) return "";

  if (!vm.hasMore) {
    return `
      <div class="clientes-list-footer">
        <span>Has visto todos los clientes disponibles.</span>
      </div>
    `;
  }

  return `
    <div class="clientes-list-footer">
      <button
        type="button"
        class="clientes-load-more-btn"
        data-clientes-action="${CLIENTES_ACTIONS.LOAD_MORE}"
        data-action="${CLIENTES_ACTIONS.LOAD_MORE}"
        data-visible-limit="${attr(
          String(Math.min(MAX_VISIBLE_ROWS, vm.visibleLimit + DEFAULT_VISIBLE_ROWS))
        )}"
        ${vm.loadingMore ? 'disabled aria-busy="true"' : ""}
      >
        ${
          vm.loadingMore
            ? renderSpinner("Cargando...")
            : `<span>Cargar ${Math.min(DEFAULT_VISIBLE_ROWS, vm.remainingCount)} más</span>`
        }
      </button>
      <span>${escapeHtml(`${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}`)}</span>
    </div>
  `;
}

function renderHistory(vm = {}) {
  return `
    <section class="clientes-history" data-clientes-history="true">
      <div class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">
            Mostrando ${escapeHtml(formatNumber(vm.filteredTotal))}
            de ${escapeHtml(formatNumber(vm.total))}
            · orden fecha ${vm.sortOrder === "asc" ? "↑" : "↓"}
          </p>
        </div>
        ${renderFilters(vm)}
      </div>

      ${
        vm.error && vm.items.length
          ? `
            <div class="clientes-inline-error" role="status">
              No se pudo sincronizar ahora. Se muestran los últimos datos disponibles.
            </div>
          `
          : ""
      }

      ${renderTable(vm)}
      ${renderFooter(vm)}
    </section>
  `;
}

export function renderClientesTemplate(input = {}) {
  const vm = buildVm(input);

  return `
    <section
      class="clientes-view-root"
      data-clientes-scope="true"
      data-template-version="${attr(CLIENTES_TEMPLATE_VERSION)}"
      data-filter="${attr(vm.filter)}"
      data-loading="${vm.loading ? "true" : "false"}"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
    >
      ${renderHeader(vm)}
      ${renderHistory(vm)}
    </section>
  `;
}

export function renderClientesLoadingState(input = {}) {
  return renderClientesTemplate({ ...safeObject(input), loading: true });
}

export function renderClientesErrorState(input = {}) {
  const data = typeof input === "string" ? { error: input } : safeObject(input);

  return renderClientesTemplate({
    ...data,
    loading: false,
    error: cleanText(data.error, "No se pudieron cargar los clientes."),
  });
}

export const renderClientesViewTemplate = renderClientesTemplate;

export function getClientesTemplateSnapshot() {
  return {
    version: CLIENTES_TEMPLATE_VERSION,
    actions: CLIENTES_ACTIONS,
    filters: FILTERS,
    policy: {
      noManualRefreshButton: true,
      nonBlockingInitialShell: true,
      facturasVisualParity: true,
      incidenciasVisualParity: true,
      interactiveStatCards: true,
      deterministicAvatarPalette: true,
      tableMarkup: true,
      searchMarkup: true,
      filtersMarkup: true,
      pureTemplate: true,
    },
  };
}

export default {
  CLIENTES_TEMPLATE_VERSION,
  CLIENTES_ACTIONS,
  CLIENTES_TABLE_COLUMNS,
  normalizeClienteModel,
  normalizeClientesCollection,
  renderClientesTemplate,
  renderClientesViewTemplate,
  renderClientesLoadingState,
  renderClientesErrorState,
  getClientesTemplateSnapshot,
};

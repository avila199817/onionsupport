/* =========================================================
   Onion SPA - Facturas Template
   Archivo: src/views/facturas/facturas.template.js

   FINAL PRO SAAS PANEL · FACTURAS TEMPLATE · CSP CLEAN · 10/10
   PATCH · EXTERNAL CSS ONLY · NO STYLE INJECTION
   PATCH · NO INLINE STYLE · NO INLINE EVENTS
   PATCH · REAL TABLE LOCK · NO ::BEFORE ON <TR>
   PATCH · FILTERS + SORT + SEARCH · SINGLE DATA FLOW
   PATCH · AVATAR TONES VIA CSS CLASSES
   PATCH · DATA-CONTRACT READY FOR VIEW.JS

   RESPONSABILIDADES:
   - Render premium de vista de facturas.
   - Consumir el CSS externo /src/css/views/facturas.css.
   - No inyectar <style> desde JS.
   - No usar style="" dinámico.
   - No usar eventos inline.
   - Tabla real blindada.
   - Filtros visuales: todas / pendientes / pagadas / vencidas.
   - Orden visual: fecha descendente / número de factura descendente.
   - Búsqueda por factura, cliente, email, importe, forma de pago e incidencia.
   - Paginación real de 5 items por defecto sobre resultados filtrados.
   - Acciones compatibles con data-facturas-action y data-action.
   - Botón admin "Crear factura".
   - Envío de factura conectado a send-factura.
   - Estado "Enviar / Reenviar" según delivery/meta.
   - Bloqueo seguro de acciones sin PDF/email.
   - Loader icon-only estable sin mover layout.
   - Refresh overlay sin desplazar columnas.
   - Avatares fallback con color estable por cliente.
   - Chips de pago con contraste real dark/light.
   - Incidencia relacionada lista para modal.
   - Estados loading/error/empty blindados.
   - HTML endurecido con escape/fallbacks.

   NOTA CSP:
   - Para fallback de imagen sin onerror inline, llamar a:
     bindFacturasTemplateDom(root)
     desde facturas.view.js después de pintar la vista.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURRENCY = "EUR";

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "root",
  "owner",
]);

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendientes" },
  { key: "paid", label: "Pagadas" },
  { key: "overdue", label: "Vencidas" },
]);

const SORT_OPTIONS = Object.freeze([
  {
    key: "date_desc",
    label: "Fecha ↓",
    title: "Ordenar por fecha de emisión de mayor a menor",
  },
  {
    key: "invoice_desc",
    label: "Nº factura ↓",
    title: "Ordenar por número de factura de mayor a menor",
  },
]);

/* =========================================================
   BASE HELPERS
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

function normalizeRole(value = "") {
  return safeText(value, "").toLowerCase();
}

function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const key = normalizeText(value);

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
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
  return Math.min(Math.max(value, min), max);
}

function getInputItems(input = {}) {
  const data = safeObject(input);

  return safeArray(first(data.items, data.rows, data.facturas, data.invoices, []));
}

function getRuntimeState(input = {}) {
  const data = safeObject(input);

  return safeObject(data.state);
}

/* =========================================================
   DATE HELPERS
========================================================= */

function isDateOnlyValue(value = null) {
  if (value === null || value === undefined) return false;

  const raw = safeText(value, "");

  if (!raw) return false;

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)
  );
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

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
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

function formatDateTitle(value = null) {
  if (isDateOnlyValue(value)) {
    return formatDateShort(value);
  }

  return formatDateTime(value);
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

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    detail: `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    download: `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    send: `<svg ${common}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    pdf: `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17v-5"/><path d="M8 12h2a1.5 1.5 0 0 1 0 3H8"/><path d="M13 17v-5h1.5a2.5 2.5 0 0 1 0 5H13"/><path d="M18 12h-2v5"/></svg>`,
    lock: `<svg ${common}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
    mail: `<svg ${common}><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    filter: `<svg ${common}><path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   AUTH / ROLE
========================================================= */

function hasPermission(state = {}, permission = "") {
  const runtime = safeObject(state);
  const target = safeText(permission, "");

  if (!target) return false;

  const permissions = first(
    runtime.permissions,
    runtime.user?.permissions,
    runtime.currentUser?.permissions,
    runtime.session?.user?.permissions,
    runtime.auth?.user?.permissions
  );

  if (Array.isArray(permissions)) {
    return permissions.includes(target);
  }

  if (typeof permissions === "string") {
    return permissions
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .includes(target);
  }

  return false;
}

function isAdminState(state = {}) {
  const runtime = safeObject(state);

  if (
    runtime.canCreateFactura === true ||
    runtime.view?.canCreateFactura === true ||
    hasPermission(runtime, "facturas:create")
  ) {
    return true;
  }

  const role = normalizeRole(
    first(
      runtime.role,
      runtime.rol,
      runtime.user?.role,
      runtime.user?.rol,
      runtime.currentUser?.role,
      runtime.currentUser?.rol,
      runtime.session?.user?.role,
      runtime.session?.user?.rol,
      runtime.auth?.role,
      runtime.auth?.user?.role,
      runtime.auth?.user?.rol
    )
  );

  return ADMIN_ROLES.has(role);
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function pickTicketIdFromArray(value = []) {
  const items = safeArray(value);

  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }

    if (!item || typeof item !== "object") continue;

    const candidate = first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.numero,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId
    );

    if (candidate) return safeText(candidate, "");
  }

  return "";
}

function getFacturaId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.numero,
      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numero
    ),
    "FAC-SIN-ID"
  );
}

function getFacturaNumero(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.legalInvoiceNumber,
      item.numero,
      item.invoiceNumber,
      item.code,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaSistema,
      item.id,
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.legalInvoiceNumber,
      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaSistema,
      raw.id
    ),
    "Factura sin número"
  );
}

function getFacturaDisplayId(item = {}) {
  return getFacturaNumero(item);
}

function getFacturaSistema(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.numeroFacturaSistema,
      item.systemInvoiceNumber,
      raw.numeroFacturaSistema,
      raw.systemInvoiceNumber,
      ""
    ),
    ""
  );
}

function getCompanyName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteEmpresa,
      item.empresa,
      item.company,
      item.companyName,
      item.razonSocial,
      item.cliente?.razonSocial,
      item.cliente?.companyName,
      item.cliente?.empresa,
      item.cliente?.company,
      item.client?.razonSocial,
      item.client?.companyName,
      item.client?.empresa,
      item.client?.company,
      item.customer?.razonSocial,
      item.customer?.companyName,
      item.customer?.empresa,
      item.customer?.company,
      item.clienteSnapshot?.razonSocial,
      item.clienteSnapshot?.companyName,
      item.clienteSnapshot?.empresa,
      raw.clienteEmpresa,
      raw.empresa,
      raw.company,
      raw.companyName,
      raw.razonSocial,
      raw.cliente?.razonSocial,
      raw.cliente?.companyName,
      raw.cliente?.empresa,
      raw.cliente?.company,
      raw.client?.razonSocial,
      raw.client?.companyName,
      raw.client?.empresa,
      raw.client?.company,
      raw.customer?.razonSocial,
      raw.customer?.companyName,
      raw.customer?.empresa,
      raw.customer?.company,
      raw.clienteSnapshot?.razonSocial,
      raw.clienteSnapshot?.companyName,
      raw.clienteSnapshot?.empresa
    ),
    ""
  );
}

function getContactName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteNombre,
      item.nombreContacto,
      item.contactName,
      item.cliente?.nombreContacto,
      item.cliente?.nombre,
      item.cliente?.name,
      item.cliente?.displayName,
      item.clienteSnapshot?.nombreContacto,
      item.clientName,
      item.client?.nombreContacto,
      item.client?.name,
      item.customer?.nombreContacto,
      item.customer?.name,
      item.name,
      item.nombre,
      raw.clienteNombre,
      raw.nombreContacto,
      raw.contactName,
      raw.cliente?.nombreContacto,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.cliente?.displayName,
      raw.clienteSnapshot?.nombreContacto,
      raw.clientName,
      raw.client?.nombreContacto,
      raw.client?.name,
      raw.customer?.nombreContacto,
      raw.customer?.name,
      raw.name,
      raw.nombre
    ),
    ""
  );
}

function getClientName(item = {}) {
  return safeText(first(getCompanyName(item), getContactName(item)), "Cliente");
}

function getClientSecondaryName(item = {}) {
  const company = getCompanyName(item);
  const contact = getContactName(item);

  if (company && contact && normalizeText(company) !== normalizeText(contact)) {
    return contact;
  }

  return "";
}

function getClientEmail(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteEmail,
      item.emailCliente,
      item.cliente?.email,
      item.cliente?.emailLower,
      item.clienteSnapshot?.email,
      item.email,
      item.clientEmail,
      item.client?.email,
      item.customer?.email,
      raw.clienteEmail,
      raw.emailCliente,
      raw.cliente?.email,
      raw.cliente?.emailLower,
      raw.clienteSnapshot?.email,
      raw.email,
      raw.clientEmail,
      raw.client?.email,
      raw.customer?.email
    ),
    ""
  ).toLowerCase();
}

function getClientEmailLabel(item = {}) {
  return getClientEmail(item) || "Sin email";
}

function getClientAvatar(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteAvatar,
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      raw.clienteAvatar,
      raw.clientAvatar,
      raw.avatar,
      raw.avatarUrl,
      raw.cliente?.avatar,
      raw.cliente?.avatarUrl,
      raw.client?.avatar,
      raw.client?.avatarUrl
    ),
    ""
  );
}

function getClientStableKey(item = {}) {
  const raw = safeObject(item?.raw);

  return normalizeKey(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.userId,
      item.uid,
      item.cliente?.id,
      item.cliente?.userId,
      item.client?.id,
      item.client?.userId,
      item.customer?.id,
      item.customer?.userId,
      item.clienteEmail,
      item.emailCliente,
      item.clientEmail,
      item.email,
      item.cliente?.email,
      item.client?.email,
      item.customer?.email,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.userId,
      raw.uid,
      raw.cliente?.id,
      raw.cliente?.userId,
      raw.client?.id,
      raw.client?.userId,
      raw.customer?.id,
      raw.customer?.userId,
      raw.clienteEmail,
      raw.emailCliente,
      raw.clientEmail,
      raw.email,
      raw.cliente?.email,
      raw.client?.email,
      raw.customer?.email,
      getClientName(item)
    )
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

function getAvatarToneClass(item = {}) {
  const seed = getClientStableKey(item);
  const index = hashString(seed) % 10;

  return `facturas-avatar--tone-${index}`;
}

function getEstadoPagoKey(value = "") {
  const key = normalizeKey(value);

  if (
    ["paid", "pagada", "pagado", "cobrada", "cobrado", "abonada", "abonado"].includes(
      key
    )
  ) {
    return "paid";
  }

  if (["pending", "pendiente", "unpaid", "sin_pagar"].includes(key)) {
    return "pending";
  }

  if (["partial", "parcial", "pago_parcial"].includes(key)) {
    return "partial";
  }

  if (["overdue", "vencida", "vencido"].includes(key)) {
    return "overdue";
  }

  if (
    ["cancelled", "canceled", "cancelada", "cancelado", "anulada", "anulado"].includes(
      key
    )
  ) {
    return "cancelled";
  }

  if (["draft", "borrador"].includes(key)) {
    return "draft";
  }

  return "pending";
}

function getEstadoPagoLabel(value = "") {
  const key = getEstadoPagoKey(value);

  if (key === "paid") return "Pagada";
  if (key === "pending") return "Pendiente";
  if (key === "partial") return "Pago parcial";
  if (key === "overdue") return "Vencida";
  if (key === "cancelled") return "Cancelada";
  if (key === "draft") return "Borrador";

  return safeText(value, "Pendiente");
}

function getEstadoPagoChipClass(value = "") {
  return `facturas-chip--${getEstadoPagoKey(value) || "pending"}`;
}

function getPaymentRaw(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.estadoPago,
    item.paymentStatus,
    item.payment?.status,
    item.billing?.paymentStatus,
    raw.estadoPago,
    raw.paymentStatus,
    raw.payment?.status,
    raw.billing?.paymentStatus
  );
}

function getIncidenciaId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.incidencia?.id,
      item.incidencia?.ticketId,
      item.incidencia?.incidenciaId,
      item.ticket?.id,
      item.ticket?.ticketId,
      item.ticket?.incidenciaId,
      item.linkedTicket?.id,
      item.linkedTicket?.ticketId,
      item.linkedTicket?.incidenciaId,
      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,
      item.meta?.ticketId,
      item.meta?.linkedTicketId,
      item.meta?.incidenciaId,
      pickTicketIdFromArray(item.ticketIds),
      pickTicketIdFromArray(item.incidenciaIds),
      pickTicketIdFromArray(item.relatedTicketIds),
      pickTicketIdFromArray(item.relatedIncidentIds),
      pickTicketIdFromArray(item.linkedTickets),
      pickTicketIdFromArray(item.incidencias),
      pickTicketIdFromArray(item.tickets),
      pickTicketIdFromArray(item.relatedTickets),
      pickTicketIdFromArray(item.facturasRelacionadas),
      pickTicketIdFromArray(item.linkedInvoices?.tickets),
      pickTicketIdFromArray(item.relations),
      raw.ticketId,
      raw.incidenciaId,
      raw.incidencia?.id,
      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,
      raw.ticket?.id,
      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,
      raw.linkedTicket?.id,
      raw.linkedTicket?.ticketId,
      raw.linkedTicket?.incidenciaId,
      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,
      raw.meta?.ticketId,
      raw.meta?.linkedTicketId,
      raw.meta?.incidenciaId,
      pickTicketIdFromArray(raw.ticketIds),
      pickTicketIdFromArray(raw.incidenciaIds),
      pickTicketIdFromArray(raw.relatedTicketIds),
      pickTicketIdFromArray(raw.relatedIncidentIds),
      pickTicketIdFromArray(raw.linkedTickets),
      pickTicketIdFromArray(raw.incidencias),
      pickTicketIdFromArray(raw.tickets),
      pickTicketIdFromArray(raw.relatedTickets),
      pickTicketIdFromArray(raw.facturasRelacionadas),
      pickTicketIdFromArray(raw.linkedInvoices?.tickets),
      pickTicketIdFromArray(raw.relations)
    ),
    ""
  );
}

function getIncidenciaSubject(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.incidencia?.subject,
      item.incidencia?.asunto,
      item.incidencia?.title,
      item.ticket?.subject,
      item.ticket?.asunto,
      item.ticket?.title,
      item.linkedTicket?.subject,
      item.linkedTicket?.asunto,
      item.linkedTicket?.title,
      raw.incidencia?.subject,
      raw.incidencia?.asunto,
      raw.incidencia?.title,
      raw.ticket?.subject,
      raw.ticket?.asunto,
      raw.ticket?.title,
      raw.linkedTicket?.subject,
      raw.linkedTicket?.asunto,
      raw.linkedTicket?.title,
      ""
    ),
    ""
  );
}

function getTotalRaw(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.total,
    item.amount,
    item.importe,
    item.importeTotal,
    item.totalFactura,
    item.facturaTotal,
    item.invoiceAmount,
    item.totales?.total,
    raw.total,
    raw.amount,
    raw.importe,
    raw.importeTotal,
    raw.totalFactura,
    raw.facturaTotal,
    raw.invoiceAmount,
    raw.totales?.total,
    0
  );
}

function getCurrency(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.moneda,
      item.currency,
      item.facturaCurrency,
      item.totales?.currency,
      item.payment?.currency,
      item.meta?.currency,
      raw.moneda,
      raw.currency,
      raw.facturaCurrency,
      raw.totales?.currency,
      raw.payment?.currency,
      raw.meta?.currency,
      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  );
}

function getTotalLabel(item = {}) {
  return formatMoney(getTotalRaw(item), getCurrency(item));
}

function getTotalCaption(item = {}) {
  const raw = safeObject(item?.raw);

  const taxIncluded = first(
    item.taxIncluded,
    item.impuestosIncluidos,
    item.ivaIncluido,
    raw.taxIncluded,
    raw.impuestosIncluidos,
    raw.ivaIncluido
  );

  if (taxIncluded === false) return "Impuestos no incl.";

  return "Impuestos incl.";
}

function getFormaPago(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.formaPago,
      item.metodoPago,
      item.paymentMethod,
      item.payment?.methodLabel,
      item.payment?.method,
      raw.formaPago,
      raw.metodoPago,
      raw.paymentMethod,
      raw.payment?.methodLabel,
      raw.payment?.method
    ),
    "—"
  );
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.fechaFactura,
    item.fechaFacturaISO,
    item.lifecycle?.issuedAt,
    item.issueDate,
    item.issuedAt,
    item.fecha,
    raw.fechaFactura,
    raw.fechaFacturaISO,
    raw.lifecycle?.issuedAt,
    raw.issueDate,
    raw.issuedAt,
    raw.fecha,
    item.createdAt,
    item.lifecycle?.createdAt,
    item.fechaCreacion,
    raw.createdAt,
    raw.lifecycle?.createdAt,
    raw.fechaCreacion
  );
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.updatedAt,
    item.lifecycle?.updatedAt,
    item.lastActivityAt,
    item.lifecycle?.lastActivityAt,
    item.fechaEnvio,
    item.delivery?.lastSentAt,
    item.sentAt,
    item.mailSentAt,
    item.fechaActualizacion,
    item.lastUpdateAt,
    raw.updatedAt,
    raw.lifecycle?.updatedAt,
    raw.lastActivityAt,
    raw.lifecycle?.lastActivityAt,
    raw.fechaEnvio,
    raw.delivery?.lastSentAt,
    raw.sentAt,
    raw.mailSentAt,
    raw.fechaActualizacion,
    raw.lastUpdateAt
  );
}

function getSentAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.fechaEnvio,
    item.sentAt,
    item.mailSentAt,
    item.email?.sentAt,
    item.delivery?.lastSentAt,
    item.lifecycle?.sentAt,
    item.meta?.lastSentAt,
    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.email?.sentAt,
    raw.delivery?.lastSentAt,
    raw.lifecycle?.sentAt,
    raw.meta?.lastSentAt
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

function getEmissionTimestamp(item = {}) {
  return toTimestamp(getCreatedAt(item)) || getSortTimestamp(item);
}

function compareFacturasNewestFirst(a = {}, b = {}) {
  const diff = getEmissionTimestamp(b) - getEmissionTimestamp(a);

  if (diff !== 0) return diff;

  return safeText(getFacturaNumero(b), "").localeCompare(
    safeText(getFacturaNumero(a), ""),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function sortFacturasNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareFacturasNewestFirst);
}

function sortFacturasByInvoiceDesc(items = []) {
  return [...safeArray(items)].sort((a, b) =>
    safeText(getFacturaNumero(b), "").localeCompare(
      safeText(getFacturaNumero(a), ""),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    )
  );
}

function hasPdf(item = {}) {
  const raw = safeObject(item?.raw);

  if (
    bool(
      first(
        item.pdfAvailable,
        item.hasPdf,
        item.document?.available,
        item.meta?.hasPdf,
        raw.pdfAvailable,
        raw.hasPdf,
        raw.document?.available,
        raw.meta?.hasPdf
      ),
      false
    )
  ) {
    return true;
  }

  if (
    first(
      item.blobPath,
      item.blobName,
      item.pdfPath,
      item.pdfUrl,
      item.downloadUrl,
      item.viewUrl,
      item.pdf,
      item.document?.blobPath,
      item.document?.fileName,
      raw.blobPath,
      raw.blobName,
      raw.pdfPath,
      raw.pdfUrl,
      raw.downloadUrl,
      raw.viewUrl,
      raw.pdf,
      raw.document?.blobPath,
      raw.document?.fileName
    )
  ) {
    return true;
  }

  const files = safeArray(
    first(
      item.attachments,
      item.files,
      item.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos,
      []
    )
  );

  return files.some((file) => {
    const value = safeObject(file);

    const type = normalizeText(
      first(value.contentType, value.mimeType, value.mimetype, value.type)
    );

    const name = normalizeText(
      first(value.name, value.filename, value.fileName, value.url)
    );

    return type.includes("pdf") || name.endsWith(".pdf");
  });
}

function isFacturaSent(item = {}) {
  const raw = safeObject(item?.raw);

  const sentDate = first(
    item.fechaEnvio,
    item.sentAt,
    item.mailSentAt,
    item.email?.sentAt,
    item.delivery?.lastSentAt,
    item.lifecycle?.sentAt,
    item.meta?.lastSentAt,
    raw.fechaEnvio,
    raw.sentAt,
    raw.mailSentAt,
    raw.email?.sentAt,
    raw.delivery?.lastSentAt,
    raw.lifecycle?.sentAt,
    raw.meta?.lastSentAt
  );

  if (sentDate) return true;

  return bool(
    first(
      item.email?.sent,
      item.delivery?.sent,
      item.lifecycle?.sent,
      item.meta?.isSent,
      item.meta?.hasEmailSent,
      raw.email?.sent,
      raw.delivery?.sent,
      raw.lifecycle?.sent,
      raw.meta?.isSent,
      raw.meta?.hasEmailSent
    ),
    false
  );
}

function canSendFactura(item = {}) {
  return hasPdf(item) && isValidEmail(getClientEmail(item));
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  if (!key || ["all", "todo", "todos", "todas", "total"].includes(key)) return "all";

  if (
    [
      "pending",
      "pendiente",
      "pendientes",
      "partial",
      "parcial",
      "draft",
      "borrador",
      "unpaid",
      "sin_pagar",
    ].includes(key)
  ) {
    return "pending";
  }

  if (
    ["paid", "pagada", "pagado", "pagadas", "cobrada", "cobrado"].includes(key)
  ) {
    return "paid";
  }

  if (["overdue", "vencida", "vencido", "vencidas"].includes(key)) {
    return "overdue";
  }

  return "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeFilter(
    first(
      data.filter,
      data.paymentFilter,
      data.statusFilter,
      data.activeFilter,
      data.facturasFilter,
      runtime.filter,
      runtime.paymentFilter,
      runtime.statusFilter,
      runtime.activeFilter,
      runtime.facturasFilter,
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
      data.facturasSearch,
      runtime.search,
      runtime.searchQuery,
      runtime.query,
      runtime.q,
      runtime.term,
      runtime.keyword,
      runtime.facturasSearch,
      ""
    )
  );
}

function normalizeSort(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "invoice_desc",
      "factura_desc",
      "numero_desc",
      "n_factura_desc",
      "num_factura_desc",
      "number_desc",
    ].includes(key)
  ) {
    return "invoice_desc";
  }

  return "date_desc";
}

function getSortMode(input = {}) {
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  return normalizeSort(
    first(
      data.sort,
      data.sortBy,
      data.orderBy,
      data.sortMode,
      data.facturasSort,
      runtime.sort,
      runtime.sortBy,
      runtime.orderBy,
      runtime.sortMode,
      runtime.facturasSort,
      "date_desc"
    )
  );
}

function itemMatchesFilter(item = {}, filter = "all") {
  const key = normalizeFilter(filter);
  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

  if (key === "all") return true;
  if (key === "pending") return ["pending", "partial", "draft"].includes(paymentKey);
  if (key === "paid") return paymentKey === "paid";
  if (key === "overdue") return paymentKey === "overdue";

  return true;
}

function getSearchHaystack(item = {}) {
  const raw = safeObject(item?.raw);

  return [
    getFacturaId(item),
    getFacturaNumero(item),
    getFacturaSistema(item),
    getCompanyName(item),
    getContactName(item),
    getClientName(item),
    getClientSecondaryName(item),
    getClientEmail(item),
    getClientEmailLabel(item),
    getEstadoPagoLabel(getPaymentRaw(item)),
    getTotalLabel(item),
    getFormaPago(item),
    getIncidenciaId(item),
    getIncidenciaSubject(item),
    getCreatedAt(item),
    getUpdatedAt(item),

    item.clienteId,
    item.clientId,
    item.customerId,
    item.userId,
    item.uid,
    item.blobPath,
    item.blobName,
    item.pdfPath,

    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.userId,
    raw.uid,
    raw.blobPath,
    raw.blobName,
    raw.pdfPath,
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

function filterFacturas(items = [], input = {}) {
  const activeFilter = getActiveFilter(input);
  const searchQuery = getSearchQuery(input);

  return safeArray(items).filter((item) => {
    return itemMatchesFilter(item, activeFilter) && itemMatchesSearch(item, searchQuery);
  });
}

function sortFacturas(items = [], input = {}) {
  const sortMode = getSortMode(input);

  return sortMode === "invoice_desc"
    ? sortFacturasByInvoiceDesc(items)
    : sortFacturasNewestFirst(items);
}

function filterAndSortFacturas(items = [], input = {}) {
  return sortFacturas(filterFacturas(items, input), input);
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
      const total = safeNumber(getTotalRaw(item), 0);
      const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

      acc.total += 1;
      acc.totalImporte += total;

      if (paymentKey === "paid") {
        acc.paidCount += 1;
        acc.totalPagado += total;
      }

      if (["pending", "partial", "draft"].includes(paymentKey)) {
        acc.pendingCount += 1;
        acc.totalPendiente += total;
      }

      if (paymentKey === "overdue") {
        acc.overdueCount += 1;
        acc.totalVencido += total;
      }

      if (hasPdf(item)) acc.pdfCount += 1;
      if (isFacturaSent(item)) acc.sentCount += 1;
      if (getIncidenciaId(item)) acc.incidenciaCount += 1;

      return acc;
    },
    {
      total: 0,
      totalImporte: 0,
      totalPagado: 0,
      totalPendiente: 0,
      totalVencido: 0,
      pendingCount: 0,
      paidCount: 0,
      overdueCount: 0,
      pdfCount: 0,
      sentCount: 0,
      incidenciaCount: 0,
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
        runtime.facturasPageSize,
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

  const rawItems = safeArray(items);
  const filteredAndSortedItems = filterAndSortFacturas(rawItems, data);
  const pageSize = normalizePageSize(data);
  const filtering = isFilterActive(data);

  const remoteTotal = Math.max(
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        data.totalMatched,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.totalMatched,
        runtime.total,
        rawItems.length
      ),
      rawItems.length
    ),
    rawItems.length
  );

  const reportedTotal = filtering ? filteredAndSortedItems.length : remoteTotal;

  const totalPagesFromProps = filtering
    ? 0
    : safeNumber(first(data.totalPages, runtime.totalPages), 0);

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = clamp(
    safeNumber(
      first(data.page, runtime.page, runtime.currentPage, runtime.facturasPage, 1),
      1
    ),
    1,
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filteredAndSortedItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems: filteredAndSortedItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    unfilteredCount: rawItems.length,
    remoteTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
    filtering,
    activeFilter: getActiveFilter(data),
    searchQuery: getSearchQuery(data),
    sortMode: getSortMode(data),
  };
}

/* =========================================================
   BUSY STATE
========================================================= */

function resolveBusyMeta(item = {}, state = {}) {
  const runtime = safeObject(state);
  const facturaId = getFacturaId(item);

  return {
    facturaId,
    isOpening: safeText(runtime.openingFacturaId, "") === facturaId,
    isViewingPdf: safeText(runtime.viewingFacturaId, "") === facturaId,
    isDownloading: safeText(runtime.downloadingFacturaId, "") === facturaId,
    isSending: safeText(runtime.sendingFacturaId, "") === facturaId,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="facturas-inline-loading">
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="facturas-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="facturas-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="facturas-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClientName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getClientAvatar(item);
  const toneClass = getAvatarToneClass(item);

  if (avatarUrl) {
    return `
      <div
        class="facturas-avatar ${escapeHtml(toneClass)}"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
        data-fallback="false"
        data-facturas-avatar="true"
      >
        <img
          class="facturas-avatar-img"
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          data-facturas-avatar-img="true"
        />
        <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="facturas-avatar facturas-avatar--fallback ${escapeHtml(toneClass)}"
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-fallback="true"
      data-facturas-avatar="true"
    >
      <span class="facturas-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderEstadoPagoChip(item = {}) {
  const rawStatus = getPaymentRaw(item);
  const label = getEstadoPagoLabel(rawStatus);
  const klass = getEstadoPagoChipClass(rawStatus);

  return `
    <span class="facturas-chip ${escapeHtml(klass)}">
      <span class="facturas-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderDeliveryBadge(item = {}) {
  const sent = isFacturaSent(item);
  const sentAt = getSentAt(item);

  if (sent) {
    const title = sentAt
      ? `Enviada · ${formatDateTitle(sentAt)}`
      : "Factura enviada";

    return `
      <span
        class="facturas-mini-badge facturas-mini-badge--sent"
        title="${escapeHtml(title)}"
        data-tooltip="${escapeHtml(title)}"
      >
        ${icon("check")}
        Enviada
      </span>
    `;
  }

  return `
    <span
      class="facturas-mini-badge facturas-mini-badge--idle"
      title="Factura no enviada todavía"
      data-tooltip="Factura no enviada todavía"
    >
      ${icon("mail")}
      No enviada
    </span>
  `;
}

function renderPdfBadge(item = {}) {
  if (hasPdf(item)) {
    return `
      <span
        class="facturas-mini-badge facturas-mini-badge--pdf"
        title="PDF disponible"
        data-tooltip="PDF disponible"
      >
        ${icon("pdf")}
        PDF
      </span>
    `;
  }

  return `
    <span
      class="facturas-mini-badge facturas-mini-badge--blocked"
      title="PDF no disponible"
      data-tooltip="PDF no disponible"
    >
      ${icon("lock")}
      Sin PDF
    </span>
  `;
}

function renderIncidenciaLink(item = {}) {
  const incidenciaId = getIncidenciaId(item);
  const incidenciaSubject = getIncidenciaSubject(item);
  const facturaId = getFacturaId(item);

  if (!incidenciaId) {
    return `<span class="facturas-incidencia-empty">—</span>`;
  }

  const tooltip = incidenciaSubject
    ? `Abrir incidencia · ${incidenciaSubject}`
    : "Abrir incidencia relacionada";

  return `
    <button
      type="button"
      class="facturas-incidencia-link"
      data-action="open-incidencia"
      data-facturas-action="open-incidencia"
      data-ticket-id="${escapeHtml(incidenciaId)}"
      data-incidencia-id="${escapeHtml(incidenciaId)}"
      data-factura-id="${escapeHtml(facturaId)}"
      title="${escapeHtml(tooltip)}"
      data-tooltip="${escapeHtml(tooltip)}"
    >
      ${icon("ticket")}
      <span>${escapeHtml(incidenciaId)}</span>
    </button>
  `;
}

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  return `
    <div class="facturas-pagination" aria-label="Paginación de facturas">
      <button
        type="button"
        class="facturas-pagination-btn"
        data-action="prev-page"
        data-facturas-action="prev-page"
        data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
        ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
      >
        Anterior
      </button>

      <span class="facturas-pagination-status">
        ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
      </span>

      <button
        type="button"
        class="facturas-pagination-btn facturas-pagination-btn--next"
        data-action="next-page"
        data-facturas-action="next-page"
        data-page="${escapeHtml(
          String(Math.min(pagination.totalPages, pagination.currentPage + 1))
        )}"
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
    <div class="facturas-search" role="search" aria-label="Buscar facturas">
      <span class="facturas-search-icon" aria-hidden="true">
        ${icon("search")}
      </span>

      <input
        id="facturas-search-input"
        class="facturas-search-input"
        type="search"
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar factura, cliente, email, importe..."
        autocomplete="off"
        spellcheck="false"
        data-facturas-action="search"
        data-action="search-facturas"
        data-facturas-search-input="true"
        aria-label="Buscar facturas por cliente, email, importe o número de factura"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="facturas-search-clear"
              data-facturas-action="clear-search"
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
  const items = getInputItems(data);
  const counts = computeFilterCounts(items, data);
  const activeFilter = normalizeFilter(pagination.activeFilter || getActiveFilter(data));
  const sortMode = normalizeSort(pagination.sortMode || getSortMode(data));

  return `
    <div class="facturas-filters" aria-label="Filtros, orden y búsqueda de facturas">
      <div class="facturas-filter-pills" aria-label="Filtrar facturas por estado de pago">
        ${FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          const count = counts[filter.key] ?? 0;

          return `
            <button
              type="button"
              class="facturas-filter-pill${isActive ? " is-active" : ""}"
              data-facturas-action="filter"
              data-action="filter-facturas"
              data-filter="${escapeHtml(filter.key)}"
              data-filter-status="${escapeHtml(filter.key)}"
              data-payment-filter="${escapeHtml(filter.key)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(filter.label)}</span>
              <strong>${escapeHtml(String(count))}</strong>
            </button>
          `;
        }).join("")}
      </div>

      <div class="facturas-sort-pills" role="group" aria-label="Ordenar listado de facturas">
        ${SORT_OPTIONS.map((option) => {
          const isActive = option.key === sortMode;

          return `
            <button
              type="button"
              class="facturas-sort-pill${isActive ? " is-active" : ""}"
              data-facturas-action="sort"
              data-action="sort-facturas"
              data-sort="${escapeHtml(option.key)}"
              data-sort-mode="${escapeHtml(option.key)}"
              data-facturas-sort="${escapeHtml(option.key)}"
              title="${escapeHtml(option.title)}"
              data-tooltip="${escapeHtml(option.title)}"
              aria-label="${escapeHtml(option.title)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              <span>${escapeHtml(option.label)}</span>
            </button>
          `;
        }).join("")}
      </div>

      ${renderSearch(data)}
    </div>
  `;
}

function renderActionButton({
  klass = "",
  action = "",
  facturaId = "",
  label = "",
  loadingLabel = "",
  iconName = "",
  loading = false,
  disabled = false,
  tooltip = "",
  ariaBusy = false,
} = {}) {
  const finalDisabled = disabled || loading;
  const finalTooltip = tooltip || label;
  const classes = ["facturas-action-btn", klass, loading ? "is-loading" : ""]
    .map((item) => safeText(item, ""))
    .filter(Boolean)
    .join(" ");

  return `
    <button
      type="button"
      class="${escapeHtml(classes)}"
      data-action="${escapeHtml(action)}"
      data-facturas-action="${escapeHtml(action)}"
      data-factura-id="${escapeHtml(facturaId)}"
      title="${escapeHtml(finalTooltip)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${ariaBusy || loading ? 'aria-busy="true"' : ""}
    >
      ${
        loading
          ? renderLoaderOnly(loadingLabel || label)
          : `
            <span class="facturas-action-icon">${icon(iconName)}</span>
            <span class="facturas-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

function renderRow(item = {}, state = {}) {
  const busy = resolveBusyMeta(item, state);

  const facturaId = busy.facturaId;
  const numero = getFacturaDisplayId(item);
  const numeroSistema = getFacturaSistema(item);
  const clientName = getClientName(item);
  const secondaryName = getClientSecondaryName(item);
  const clientEmail = getClientEmailLabel(item);
  const createdAtRaw = getCreatedAt(item);
  const createdAt = formatDateShort(createdAtRaw);
  const createdAtTitle = formatDateTitle(createdAtRaw);
  const total = getTotalLabel(item);
  const totalCaption = getTotalCaption(item);
  const formaPago = getFormaPago(item);
  const pdfAvailable = hasPdf(item);
  const sent = isFacturaSent(item);
  const canSend = canSendFactura(item);

  const sendLabel = sent ? "Reenviar" : "Enviar";
  const sendTooltip = !pdfAvailable
    ? "No se puede enviar: falta PDF"
    : !isValidEmail(getClientEmail(item))
      ? "No se puede enviar: falta email válido"
      : sent
        ? "Reenviar factura al cliente"
        : "Enviar factura al cliente";

  const paymentKey = getEstadoPagoKey(getPaymentRaw(item));

  return `
    <tr
      class="facturas-table-row facturas-table-row--${escapeHtml(paymentKey)}"
      data-factura-id="${escapeHtml(facturaId)}"
      data-sent="${sent ? "true" : "false"}"
      data-has-pdf="${pdfAvailable ? "true" : "false"}"
      data-row-click-disabled="true"
    >
      <td class="facturas-cell facturas-cell--main">
        <div class="facturas-main">
          ${renderAvatar(item)}

          <div class="facturas-main-copy">
            <div class="facturas-factura-line">
              <span class="facturas-factura-id">${escapeHtml(numero)}</span>
              ${
                numeroSistema && numeroSistema !== numero
                  ? `<span class="facturas-system-id">${escapeHtml(numeroSistema)}</span>`
                  : ""
              }
            </div>

            <div class="facturas-factura-client">${escapeHtml(clientName)}</div>

            ${
              secondaryName
                ? `<div class="facturas-factura-contact">${escapeHtml(secondaryName)}</div>`
                : ""
            }

            <div class="facturas-factura-email">
              ${escapeHtml(clientEmail)}
            </div>

            <div class="facturas-row-badges">
              ${renderDeliveryBadge(item)}
              ${renderPdfBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="facturas-cell facturas-cell--status">
        ${renderEstadoPagoChip(item)}
      </td>

      <td class="facturas-cell facturas-cell--date">
        <span
          class="facturas-date-inline"
          title="${escapeHtml(createdAtTitle)}"
          data-tooltip="${escapeHtml(createdAtTitle)}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="facturas-cell facturas-cell--amount">
        <div class="facturas-total-stack">
          <span class="facturas-total-value">${escapeHtml(total)}</span>
          <span class="facturas-total-caption">${escapeHtml(totalCaption)}</span>
          <span class="facturas-total-meta">${escapeHtml(formaPago)}</span>
        </div>
      </td>

      <td class="facturas-cell facturas-cell--incidencia">
        ${renderIncidenciaLink(item)}
      </td>

      <td class="facturas-cell facturas-cell--actions">
        <div class="facturas-actions">
          ${renderActionButton({
            action: "open-factura",
            facturaId,
            label: "Detalle",
            loadingLabel: "Abriendo detalle",
            iconName: "detail",
            loading: busy.isOpening,
            tooltip: "Abrir detalle de factura",
            ariaBusy: busy.isOpening,
          })}

          ${renderActionButton({
            action: "view-factura-pdf",
            facturaId,
            label: "Ver PDF",
            loadingLabel: "Abriendo PDF",
            iconName: "eye",
            loading: busy.isViewingPdf,
            disabled: !pdfAvailable,
            tooltip: pdfAvailable ? "Ver PDF de factura" : "PDF no disponible",
            ariaBusy: busy.isViewingPdf,
          })}

          ${renderActionButton({
            klass: "facturas-action-btn--primary",
            action: "download-factura",
            facturaId,
            label: "Descargar",
            loadingLabel: "Descargando factura",
            iconName: "download",
            loading: busy.isDownloading,
            disabled: !pdfAvailable,
            tooltip: pdfAvailable ? "Descargar factura PDF" : "PDF no disponible",
            ariaBusy: busy.isDownloading,
          })}

          ${renderActionButton({
            klass: "facturas-action-btn--success",
            action: "send-factura",
            facturaId,
            label: sendLabel,
            loadingLabel: "Enviando factura",
            iconName: "send",
            loading: busy.isSending,
            disabled: !canSend,
            tooltip: sendTooltip,
            ariaBusy: busy.isSending,
          })}
        </div>
      </td>
    </tr>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  return `
    <div class="facturas-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="facturas-table-loading-row">
              <div class="facturas-skeleton facturas-skeleton--avatar"></div>

              <div class="facturas-table-loading-copy">
                <div class="facturas-skeleton facturas-skeleton--xs"></div>
                <div class="facturas-skeleton facturas-skeleton--lg"></div>
                <div class="facturas-skeleton facturas-skeleton--md"></div>
              </div>

              <div class="facturas-skeleton facturas-skeleton--pill"></div>
              <div class="facturas-skeleton facturas-skeleton--date"></div>
              <div class="facturas-skeleton facturas-skeleton--amount"></div>
              <div class="facturas-skeleton facturas-skeleton--ticket"></div>
              <div class="facturas-skeleton facturas-skeleton--actions"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="facturas-refresh-overlay" aria-live="polite">
      <div class="facturas-refresh-card">
        ${renderSpinner("Actualizando facturas...")}
      </div>
    </div>
  `;
}

function renderEmptyState({ hasError = false, filtering = false, searchQuery = "" } = {}) {
  return `
    <div class="facturas-empty">
      <div class="facturas-empty-icon" aria-hidden="true">
        ${hasError ? icon("lock") : filtering ? icon("filter") : icon("detail")}
      </div>

      <h3 class="facturas-empty-title">
        ${
          hasError
            ? "No se pudieron cargar las facturas"
            : filtering
              ? "No hay facturas con este criterio"
              : "No hay facturas para mostrar"
        }
      </h3>

      <p class="facturas-empty-text">
        ${
          hasError
            ? "Puedes reintentar la carga desde el botón de actualizar."
            : filtering
              ? searchQuery
                ? `No se encontraron facturas para “${escapeHtml(searchQuery)}”. Prueba con otro cliente, email, número de factura o incidencia.`
                : "Cambia el filtro activo para volver al historial completo."
              : "Cuando haya documentos registrados aparecerán aquí con su PDF, estado de pago, incidencia relacionada y acciones disponibles."
        }
      </p>

      ${
        filtering
          ? `
            <button
              type="button"
              class="facturas-btn"
              data-facturas-action="clear-filters"
              data-action="clear-filters"
            >
              ${icon("close")}
              <span class="facturas-btn-text">Limpiar filtros</span>
            </button>
          `
          : ""
      }
    </div>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const rows = sortFacturasNewestFirst(getInputItems(data));
  const runtime = getRuntimeState(data);

  const stats = computeStats(rows);
  const canCreateFactura = isAdminState(runtime);

  const updatedAt = first(
    data.lastUpdatedAt,
    runtime.lastSyncAt,
    data.updatedAt,
    runtime.updatedAt,
    ...rows.map((item) => getUpdatedAt(item))
  );

  const remoteCount = Math.max(
    stats.total,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.totalMatched,
        runtime.remoteCount,
        runtime.totalCount,
        runtime.totalMatched,
        stats.total
      ),
      stats.total
    )
  );

  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const loading = Boolean(first(runtime.loading, data.loading));
  const creating = Boolean(first(runtime.creating, runtime.creatingFactura, data.creating));

  return `
    <section class="facturas-hero">
      <div class="facturas-hero-top">
        <div class="facturas-hero-copy">
          <h1 class="facturas-page-title">Centro de control de facturas</h1>
          <p class="facturas-page-subtitle">
            Gestiona emisión, seguimiento, consulta, descarga y envío de documentos fiscales desde una vista clara, premium y conectada con sus incidencias relacionadas.
          </p>
        </div>

        <div class="facturas-hero-actions">
          <button
            type="button"
            id="facturas-export-btn"
            class="facturas-btn"
            data-action="export"
            data-facturas-action="export"
            ${loading || refreshing || !rows.length ? 'disabled aria-disabled="true"' : ""}
          >
            ${icon("export")}
            <span class="facturas-btn-text">Exportar CSV</span>
          </button>

          ${
            canCreateFactura
              ? `
                <button
                  type="button"
                  id="facturas-create-btn"
                  class="facturas-btn facturas-btn--create${creating ? " is-loading" : ""}"
                  data-action="create-factura"
                  data-facturas-action="create-factura"
                  aria-label="Crear nueva factura"
                  ${creating ? 'disabled aria-disabled="true" aria-busy="true"' : ""}
                >
                  ${
                    creating
                      ? renderSpinner("Abriendo...")
                      : `${icon("plus")}<span class="facturas-btn-text">Crear factura</span>`
                  }
                </button>
              `
              : ""
          }

          <button
            type="button"
            id="facturas-refresh-btn"
            class="facturas-btn facturas-btn--primary${refreshing ? " is-loading" : ""}"
            data-action="refresh"
            data-facturas-action="refresh"
            ${refreshing || loading ? 'disabled aria-disabled="true" aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="facturas-btn-text">Actualizar</span>`
            }
          </button>
        </div>
      </div>

      <div class="facturas-hero-meta">
        <span class="facturas-meta-pill">
          ${icon("detail")}
          ${escapeHtml(`${remoteCount} registros remotos`)}
        </span>

        <span class="facturas-meta-pill">
          ${icon("refresh")}
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin actualizaciones recientes"
          }
        </span>

        <span class="facturas-meta-pill">
          ${icon("pdf")}
          ${escapeHtml(`${stats.pdfCount} con PDF`)}
        </span>

        <span class="facturas-meta-pill">
          ${icon("mail")}
          ${escapeHtml(`${stats.sentCount} enviadas`)}
        </span>
      </div>

      <div class="facturas-stats">
        <article class="facturas-stat-card facturas-stat-card--accent">
          <div class="facturas-stat-label">Facturas visibles</div>
          <div class="facturas-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="facturas-stat-text">Documentos actualmente cargados en pantalla.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--success">
          <div class="facturas-stat-label">Importe agregado</div>
          <div class="facturas-stat-value">${escapeHtml(
            formatMoney(stats.totalImporte, DEFAULT_CURRENCY)
          )}</div>
          <div class="facturas-stat-text">Suma de la colección actualmente visible.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--warning">
          <div class="facturas-stat-label">Pendientes</div>
          <div class="facturas-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="facturas-stat-text">Facturas con cobro pendiente, parcial o en borrador.</div>
        </article>

        <article class="facturas-stat-card facturas-stat-card--danger">
          <div class="facturas-stat-label">Vencidas / pagadas</div>
          <div class="facturas-stat-value">${escapeHtml(
            `${stats.overdueCount} / ${stats.paidCount}`
          )}</div>
          <div class="facturas-stat-text">Balance rápido entre deuda vencida y cobros cerrados.</div>
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
    <section class="facturas-history">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderErrorState(message = "No se pudieron cargar las facturas.") {
  return `
    <section class="facturas-error">
      <h3 class="facturas-error-title">No se pudo renderizar la vista de facturas</h3>
      <p class="facturas-error-text">${escapeHtml(
        safeText(message, "Error desconocido al cargar la vista.")
      )}</p>
    </section>
  `;
}

/* =========================================================
   MAIN TABLE
========================================================= */

export function renderCards(input = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const runtime = getRuntimeState(data);

  const pagination = getPagination(items, data);

  const loading = Boolean(first(runtime.loading, data.loading));
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
  const hasError = Boolean(safeText(first(runtime.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  const activeFilterLabel = getFilterLabel(pagination.activeFilter);
  const searchQuery = pagination.searchQuery;

  const activeCriteria = [
    pagination.activeFilter !== "all" ? activeFilterLabel : "",
    searchQuery ? `búsqueda “${searchQuery}”` : "",
  ].filter(Boolean);

  const subtitle = showInitialLoading
    ? "Cargando facturas..."
    : pagination.filtering
      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
      : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`;

  return `
    <section class="facturas-history">
      <div class="facturas-history-head">
        <div class="facturas-history-copy">
          <h2 class="facturas-history-title">Historial de facturas</h2>
          <p class="facturas-history-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${renderPagination(pagination, runtime)}
        ${renderFilters(data, pagination)}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="facturas-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="facturas-table-shell">
                      <table class="facturas-table" role="table" aria-label="Listado de facturas">
                        <colgroup>
                          <col class="facturas-table-col--main">
                          <col class="facturas-table-col--status">
                          <col class="facturas-table-col--date">
                          <col class="facturas-table-col--amount">
                          <col class="facturas-table-col--incidencia">
                          <col class="facturas-table-col--actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Factura / cliente</th>
                            <th scope="col">Pago</th>
                            <th scope="col">Fecha de emisión</th>
                            <th scope="col">Total</th>
                            <th scope="col">Incidencia</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderRow(item, runtime)).join("")}
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

export const renderTable = renderCards;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderFacturasTemplate(input = {}) {
  const data = safeObject(input);
  const items = getInputItems(data);
  const runtime = getRuntimeState(data);

  if (runtime.error && !items.length) {
    return `
      <section class="facturas-view-root" data-facturas-scope="true">
        ${renderErrorState(runtime.error)}
      </section>
    `;
  }

  const payload = {
    ...data,
    items,
    state: runtime,
  };

  return `
    <section class="facturas-view-root" data-facturas-scope="true">
      ${renderHeader(payload)}
      ${renderCards(payload)}
    </section>
  `;
}

/* =========================================================
   DOM BINDINGS · CSP CLEAN
========================================================= */

export function bindFacturasTemplateDom(root = null) {
  const scope =
    root ||
    (typeof document !== "undefined"
      ? document.querySelector(".facturas-view-root, [data-facturas-scope]")
      : null);

  if (!scope || typeof scope.querySelectorAll !== "function") {
    return;
  }

  const images = scope.querySelectorAll("[data-facturas-avatar-img='true']");

  images.forEach((img) => {
    if (!img || img.dataset.facturasAvatarBound === "true") return;

    img.dataset.facturasAvatarBound = "true";

    const avatar = img.closest("[data-facturas-avatar='true']");

    const setFallback = () => {
      if (avatar) {
        avatar.setAttribute("data-fallback", "true");
        avatar.classList.add("facturas-avatar--fallback");
      }
    };

    img.addEventListener("error", setFallback, { passive: true });

    if (img.complete && img.naturalWidth === 0) {
      setFallback();
    }
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  renderHeader,
  renderCards,
  renderTable,
  renderLoadingState,
  renderErrorState,
  renderFacturasTemplate,
  bindFacturasTemplateDom,
};

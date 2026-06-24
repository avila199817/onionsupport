/* =========================================================
   Onion Support - Clientes Detail Template
   Archivo: /src/views/clientes/clientes.template.modal.js

   MODAL DETALLE · CLIENTES · SPA SAFE · 1:1 INCIDENCIAS · 10/10

   Contrato productivo:
   - Render HTML del modal detalle de Clientes.
   - Compatible con documentos Cosmos clientes schemaVersion 2.
   - Compatible con index.js actual: exporta render + bridge open/show/render.
   - Sin HTTP, sin Store, sin Router, sin Auth.
   - No modifica datos: sólo visualiza, enlaza mailto/tel y copia campos.
   - Mantiene clases incidencias-modal-* para reutilizar estética 1:1.
   - Añade clases clientes-modal-* para CSS propio si se desea.
   - Blindado: no aplana arrays de audit/stats/relations.
========================================================= */

export const CLIENTES_MODAL_TEMPLATE_VERSION =
  "clientes.template.modal.cosmos.v2.1-1-incidencias.v1";

export const DETAIL_ACTIONS = Object.freeze({
  CLOSE: "detail-close",
  COPY_ID: "detail-copy-id",
  COPY_EMAIL: "detail-copy-email",
  COPY_PHONE: "detail-copy-phone",
  COPY_FIELD: "detail-copy-field",
});

export const CLIENTES_DETAIL_ACTIONS = DETAIL_ACTIONS;

const MODAL_ID = "clientes-detail-modal-root";
const PANEL_ID = "clientes-detail-modal-panel";
const DEFAULT_CURRENCY = "EUR";
const MODAL_HOST_SELECTOR = "[data-clientes-detail-modal-host='true']";

let bridgeHost = null;
let bridgeState = {
  open: false,
  detail: null,
  feedbackMessage: "",
  feedbackType: "info",
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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

function cleanMultiline(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return output || fallback;
}

/*
  No aplanar arrays. El modal puede leer audit, permissions, relations
  o snapshots con arrays. Aplanar convertiría arrays válidos en su primer item.
*/
function first(...values) {
  for (const value of values) {
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

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";
  if (["null", "undefined", "none", "sin email", "sin_email", "no email", "no_email", "__no_email__"].includes(email)) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function safeUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }

  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }

  return "";
}

function firstUrl(...values) {
  const queue = [...values];

  while (queue.length) {
    const value = queue.shift();
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      queue.unshift(
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
        value.userSnapshot?.avatarUrl,
        value.userSnapshot?.avatar,
        value.contacto?.avatarUrl,
        value.contacto?.avatar,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture
      );
      continue;
    }

    const url = safeUrl(value);
    if (url) return url;
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

function initialsFrom(value = "", fallback = "CL") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || fallback
  );
}

function initialsFromNameParts(firstName = "", lastName = "", fallbackSource = "") {
  const firstPart = cleanText(firstName, "");
  const lastPart = cleanText(lastName, "");

  if (firstPart && lastPart) {
    return `${firstPart[0] || ""}${lastPart[0] || ""}`.toUpperCase() || initialsFrom(fallbackSource);
  }

  return initialsFrom(first(firstPart, fallbackSource, "Cliente"), "CL");
}

function redactIban(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 8) return raw;
  return `${compact.slice(0, 4)} ${"•".repeat(Math.max(4, compact.length - 8))} ${compact.slice(-4)}`;
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    user: `<svg ${common}><path d="M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.75 20.75a7.25 7.25 0 0 1 14.5 0"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    mail: `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7"/></svg>`,
    phone: `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,
    map: `<svg ${common}><path d="M14.1 2.6a2 2 0 0 0-1.8 0L7 5 2.6 3.3A1 1 0 0 0 1.2 4.2v15.6a1 1 0 0 0 .6.9L7 23l5-2.3 5.3 2.1a2 2 0 0 0 2.7-1.9V5.2a1 1 0 0 0-.6-.9L14.1 2.6Z"/><path d="M7 5v18"/><path d="M12 2.5v18.2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    calendar: `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
    hash: `<svg ${common}><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/></svg>`,
    file: `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  return icons[name] || icons.file;
}

/* =========================================================
   FORMATTERS
========================================================= */

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

  const diff = Math.abs(Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "ahora";
  if (diff < hour) return `hace ${Math.max(1, Math.round(diff / minute))} min`;
  if (diff < day) return `hace ${Math.max(1, Math.round(diff / hour))} h`;
  if (diff < 7 * day) return `hace ${Math.max(1, Math.round(diff / day))} d`;

  return formatShortDate(raw);
}

function formatPercent(value = 0) {
  const amount = number(value, 0);
  return `${String(amount).replace(".", ",")}%`;
}

function formatPhoneHref(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";
  const normalized = raw.replace(/[^+\d]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

function formatMailHref(value = "") {
  const email = normalizeEmail(value);
  return email ? `mailto:${email}` : "";
}

function formatAddress(address = {}) {
  const a = safeObject(address);
  return [
    first(a.calle, a.line1, a.addressLine1, a.direccion, ""),
    first(a.linea2, a.line2, a.addressLine2, ""),
    [first(a.cp, a.postalCode, a.zip, ""), first(a.ciudad, a.city, "")].filter(Boolean).join(" "),
    first(a.provincia, a.region, a.state, ""),
    first(a.pais, a.country, ""),
  ].map((item) => cleanText(item, "")).filter(Boolean).join(" · ");
}

/* =========================================================
   DATA GETTERS
========================================================= */

function getRaw(detail = {}) {
  return safeObject(detail?.raw, detail);
}

function getContacto(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.contacto, detail.contact, detail.primaryContact, raw.contacto, raw.contact, raw.primaryContact, {}));
}

function getBilling(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.billing, detail.facturacion, raw.billing, raw.facturacion, {}));
}

function getFacturacion(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.facturacion, detail.billing, raw.facturacion, raw.billing, {}));
}

function getStats(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.stats, raw.stats, {}));
}

function getUserSnapshot(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.userSnapshot, raw.userSnapshot, detail.user, raw.user, {}));
}

function getClienteId(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.clienteId, detail.clientId, detail.customerId, detail.id, detail._id, detail.uid, detail.code, detail.codigo, raw.clienteId, raw.clientId, raw.customerId, raw.id, raw._id, raw.code, raw.codigo), "");
}

function getCodigoCliente(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.codigoCliente, detail.numeroCliente, detail.code, detail.codigo, detail.clienteId, raw.codigoCliente, raw.numeroCliente, raw.code, raw.codigo, raw.clienteId), getClienteId(detail));
}

function getUserId(detail = {}) {
  const raw = getRaw(detail);
  const user = getUserSnapshot(detail);
  return cleanText(first(detail.userId, detail.usuarioId, raw.userId, raw.usuarioId, user.userId, user.id), "");
}

function getFirstName(detail = {}) {
  const raw = getRaw(detail);
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);
  return cleanText(first(detail.firstName, detail.nombre, raw.firstName, raw.nombre, contact.firstName, contact.nombre, user.firstName, user.nombre), "");
}

function getLastName(detail = {}) {
  const raw = getRaw(detail);
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);
  return cleanText(first(detail.lastName, detail.apellidos, raw.lastName, raw.apellidos, contact.lastName, contact.apellidos, user.lastName, user.apellidos), "");
}

function getDisplayName(detail = {}) {
  const raw = getRaw(detail);
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);
  const composed = [getFirstName(detail), getLastName(detail)].filter(Boolean).join(" ");

  return cleanText(
    first(
      detail.nombreFiscal,
      detail.razonSocial,
      detail.empresa,
      detail.nombreComercial,
      detail.displayName,
      detail.fullName,
      detail.name,
      detail.nombre,
      composed,
      raw.nombreFiscal,
      raw.razonSocial,
      raw.empresa,
      raw.nombreComercial,
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      contact.displayName,
      contact.name,
      contact.nombre,
      user.displayName,
      user.name,
      user.nombre,
      getEmail(detail),
      getClienteId(detail)
    ),
    "Cliente"
  );
}

function getFiscalName(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.nombreFiscal, detail.razonSocial, detail.businessName, detail.companyName, raw.nombreFiscal, raw.razonSocial, raw.businessName, raw.companyName, getDisplayName(detail)), getDisplayName(detail));
}

function getCommercialName(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.nombreComercial, detail.empresa, detail.displayName, detail.name, raw.nombreComercial, raw.empresa, raw.displayName, raw.name, getFiscalName(detail)), getFiscalName(detail));
}

function getContactName(detail = {}) {
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);

  return cleanText(first(contact.displayName, contact.name, contact.nombre, user.displayName, user.name, user.nombre, getDisplayName(detail)), getDisplayName(detail));
}

function getEmail(detail = {}) {
  const raw = getRaw(detail);
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);
  const billing = getBilling(detail);
  const facturacion = getFacturacion(detail);

  return normalizeEmail(
    first(
      detail.email,
      detail.emailLower,
      detail.emailCliente,
      detail.emailFacturacion,
      detail.contactEmail,
      detail.billingEmail,
      raw.email,
      raw.emailLower,
      raw.emailCliente,
      raw.emailFacturacion,
      contact.email,
      contact.emailLower,
      user.email,
      user.emailLower,
      billing.emailFacturacion,
      facturacion.email
    )
  );
}

function getBillingEmail(detail = {}) {
  const raw = getRaw(detail);
  const billing = getBilling(detail);
  const facturacion = getFacturacion(detail);

  return normalizeEmail(first(detail.emailFacturacion, detail.billingEmail, raw.emailFacturacion, raw.billingEmail, billing.emailFacturacion, facturacion.email, getEmail(detail)));
}

function getPhone(detail = {}) {
  const raw = getRaw(detail);
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);

  return cleanText(first(detail.phone, detail.telefono, detail.mobile, detail.movil, raw.phone, raw.telefono, raw.mobile, raw.movil, contact.phone, contact.telefono, user.phone, user.telefono), "");
}

function getUsername(detail = {}) {
  const raw = getRaw(detail);
  const contact = getContacto(detail);
  const user = getUserSnapshot(detail);

  return cleanText(first(detail.username, detail.usernameLower, detail.slug, raw.username, raw.usernameLower, raw.slug, contact.username, contact.usernameLower, contact.slug, user.username, user.usernameLower, user.slug), "");
}

function getNif(detail = {}) {
  const raw = getRaw(detail);
  return cleanText(first(detail.nif, detail.cif, detail.taxId, detail.vatNumber, detail.vat, raw.nif, raw.cif, raw.taxId, raw.vatNumber, raw.vat), "").toUpperCase();
}

function getType(detail = {}) {
  const raw = getRaw(detail);
  const type = normalizeKey(first(detail.tipo, detail.clienteTipo, detail.segmento, detail.type, detail.kind, raw.tipo, raw.clienteTipo, raw.segmento, raw.type, raw.kind, "cliente"));

  if (["empresa", "company", "business", "b2b", "sl", "sa", "autonomo_empresa"].includes(type)) return "empresa";
  if (["particular", "persona", "individual", "b2c", "cliente"].includes(type)) return "particular";

  return type || "cliente";
}

function typeLabel(type = "") {
  const key = normalizeKey(type);
  return {
    empresa: "Empresa",
    particular: "Particular",
    cliente: "Cliente",
  }[key] || cleanText(type, "Cliente");
}

function getStatus(detail = {}) {
  const raw = getRaw(detail);
  const explicit = first(detail.status, detail.estado, detail.state, raw.status, raw.estado, raw.state);

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    const status = normalizeKey(explicit);

    if (["active", "activo", "activa", "enabled", "habilitado", "habilitada", "ok"].includes(status)) return "active";
    if (["pending", "pendiente", "new", "nuevo", "invited", "invitado", "invitada"].includes(status)) return "pending";
    if (["blocked", "bloqueado", "bloqueada", "suspended", "locked", "restricted"].includes(status)) return "blocked";
    if (["disabled", "inactive", "inactivo", "inactiva", "archived", "deleted"].includes(status)) return "inactive";

    return status || "active";
  }

  if (detail.active === false || raw.active === false || detail.enabled === false || raw.enabled === false) return "inactive";
  if (detail.blocked === true || raw.blocked === true) return "blocked";

  return "active";
}

function statusLabel(status = "") {
  return {
    active: "Activo",
    pending: "Pendiente",
    blocked: "Bloqueado",
    inactive: "Inactivo",
  }[normalizeKey(status)] || cleanText(status, "Activo");
}

function statusClass(status = "") {
  const key = normalizeKey(status);
  if (key === "inactive") return "closed";
  if (key === "active") return "resolved";
  if (key === "blocked") return "urgent";
  return key || "active";
}

function getAvatar(detail = {}) {
  return firstUrl(detail, getRaw(detail), getContacto(detail), getUserSnapshot(detail));
}

function getCreatedAt(detail = {}) {
  const raw = getRaw(detail);
  return first(detail.createdAt, raw.createdAt, detail.audit?.createdAt, raw.audit?.createdAt, null);
}

function getUpdatedAt(detail = {}) {
  const raw = getRaw(detail);
  const stats = getStats(detail);
  return first(detail.updatedAt, detail.lastActivityAt, raw.updatedAt, raw.lastActivityAt, stats.lastActivityAt, getCreatedAt(detail), null);
}

function getMainAddress(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.direccion, detail.address, detail.location, raw.direccion, raw.address, raw.location, {}));
}

function getFiscalAddress(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.direccionFiscal, raw.direccionFiscal, detail.direccion, raw.direccion, {}));
}

function getServiceAddress(detail = {}) {
  const raw = getRaw(detail);
  return safeObject(first(detail.direccionServicio, raw.direccionServicio, detail.direccion, raw.direccion, {}));
}

function getCity(detail = {}) {
  const address = getMainAddress(detail);
  const fiscal = getFiscalAddress(detail);
  const raw = getRaw(detail);
  return cleanText(first(detail.city, detail.ciudad, raw.city, raw.ciudad, address.ciudad, address.city, fiscal.ciudad, fiscal.city), "");
}

function getProvince(detail = {}) {
  const address = getMainAddress(detail);
  const fiscal = getFiscalAddress(detail);
  const raw = getRaw(detail);
  return cleanText(first(detail.provincia, detail.region, raw.provincia, raw.region, address.provincia, address.region, fiscal.provincia, fiscal.region), "");
}

function getCurrency(detail = {}) {
  const billing = getBilling(detail);
  const facturacion = getFacturacion(detail);
  const raw = getRaw(detail);
  return cleanText(first(detail.currency, detail.moneda, raw.currency, raw.moneda, billing.currency, billing.moneda, facturacion.currency, facturacion.moneda, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();
}

function getTotalFacturado(detail = {}) {
  const stats = getStats(detail);
  const raw = getRaw(detail);
  return number(first(detail.totalFacturado, detail.facturasTotal, detail.invoicesTotal, detail.totalAmount, raw.totalFacturado, raw.facturasTotal, raw.invoicesTotal, raw.totalAmount, stats.totalFacturado, stats.totalAmount, stats.facturasTotal, 0), 0);
}

function getTotalPagado(detail = {}) {
  const stats = getStats(detail);
  const raw = getRaw(detail);
  return number(first(detail.totalPagado, raw.totalPagado, stats.totalPagado, 0), 0);
}

function getTotalPendiente(detail = {}) {
  const stats = getStats(detail);
  const raw = getRaw(detail);
  return number(first(detail.totalPendiente, raw.totalPendiente, stats.totalPendiente, 0), 0);
}

function getTicketsCount(detail = {}) {
  const stats = getStats(detail);
  return number(first(detail.ticketsCount, detail.incidenciasCount, stats.ticketsCount, stats.incidenciasCount, 0), 0);
}

function getFacturasCount(detail = {}) {
  const stats = getStats(detail);
  return number(first(detail.facturasCount, detail.invoicesCount, stats.facturasCount, stats.invoicesCount, 0), 0);
}

function getOpenTicketsCount(detail = {}) {
  const stats = getStats(detail);
  return number(first(detail.openTicketsCount, stats.openTicketsCount, 0), 0);
}

function getClosedTicketsCount(detail = {}) {
  const stats = getStats(detail);
  return number(first(detail.closedTicketsCount, stats.closedTicketsCount, 0), 0);
}

function getAuditEntries(detail = {}) {
  const raw = getRaw(detail);
  return safeArray(first(detail.audit, raw.audit, []));
}

function getPermissions(detail = {}) {
  const raw = getRaw(detail);
  const user = getUserSnapshot(detail);
  return safeArray(first(detail.permissions, raw.permissions, user.permissions, []));
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data = safeObject(input);
  const detail = safeObject(first(data.detail, data.cliente, data.client, data.customer, data.item, data.data, data), {});
  const clienteId = getClienteId(detail);

  return {
    open: data.open !== false && Boolean(clienteId || getDisplayName(detail)),
    detail,
    clienteId,
    submitting: data.submitting === true,
    feedbackMessage: cleanText(data.feedbackMessage, ""),
    feedbackType: cleanText(data.feedbackType, "info"),
  };
}

/* =========================================================
   SMALL PARTIALS
========================================================= */

function disabledAttrs(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function renderChip(label = "", modifier = "neutral") {
  const safeModifier = normalizeKey(modifier) || "neutral";
  return `<span class="clientes-modal-chip incidencias-modal-chip incidencias-modal-chip--${attr(safeModifier)} clientes-modal-chip--${attr(safeModifier)}">${escapeHtml(label)}</span>`;
}

function renderAvatar(detail = {}) {
  const name = getDisplayName(detail);
  const contactName = getContactName(detail);
  const email = getEmail(detail);
  const avatarUrl = getAvatar(detail);
  const tone = hashText(`${name}:${contactName}:${email}:${getClienteId(detail)}`) % 10;
  const initials = initialsFromNameParts(getFirstName(detail), getLastName(detail), contactName || name);

  return `
    <div class="clientes-modal-avatar incidencias-modal-avatar" title="${attr(name)}">
      <div class="${joinClasses("clientes-modal-avatar-frame incidencias-modal-avatar-frame", avatarUrl ? "" : "clientes-modal-avatar-frame--fallback incidencias-modal-avatar-frame--fallback")}" data-modal-avatar-frame="true" data-has-avatar="${avatarUrl ? "true" : "false"}" data-fallback="${avatarUrl ? "false" : "true"}" data-avatar-tone="${attr(String(tone))}">
        ${avatarUrl ? `<img src="${attr(avatarUrl)}" alt="${attr(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-modal-avatar-img="true">` : ""}
        <span class="clientes-modal-avatar-fallback incidencias-modal-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    </div>
  `;
}

function renderMetaField(label = "", value = "", options = {}) {
  const classes = joinClasses("clientes-modal-meta-card incidencias-modal-meta-card", options.className || "");
  return `<div class="${classes}"><span>${escapeHtml(label)}</span>${options.html ? value : `<strong>${escapeHtml(cleanText(value, "—"))}</strong>`}</div>`;
}

function renderFeedbackBox(vm = {}) {
  const message = cleanText(vm.feedbackMessage, "");
  if (!message) return "";

  const type = normalizeKey(vm.feedbackType || "info");
  const title = type === "error" ? "No se ha podido completar la acción" : type === "success" ? "Acción completada" : type === "warning" ? "Aviso" : "Información";

  return `<div class="clientes-modal-feedback incidencias-modal-feedback incidencias-modal-feedback--${attr(type)} clientes-modal-feedback--${attr(type)}" role="${type === "error" ? "alert" : "status"}" data-modal-feedback="true"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
}

function renderCopyButton(action = DETAIL_ACTIONS.COPY_FIELD, value = "", label = "Copiar") {
  const clean = cleanText(value, "");
  if (!clean) return "";

  return `
    <button
      type="button"
      class="clientes-modal-copy-btn incidencias-modal-view-btn"
      data-detail-action="${attr(action)}"
      data-copy-value="${attr(clean)}"
      aria-label="${attr(label)}"
    >
      <span class="incidencias-modal-action-icon">${icon("copy")}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderLinkedValue({ label = "", value = "", href = "", action = "", iconName = "file" } = {}) {
  const clean = cleanText(value, "");
  if (!clean) return "";

  return `
    <div class="clientes-modal-linked-field incidencias-modal-meta-card">
      <span>${escapeHtml(label)}</span>
      <strong>
        ${href ? `<a href="${attr(href)}" class="clientes-modal-link" data-clientes-link="true">${icon(iconName)} ${escapeHtml(clean)}</a>` : escapeHtml(clean)}
      </strong>
      ${renderCopyButton(action || DETAIL_ACTIONS.COPY_FIELD, clean, "Copiar")}
    </div>
  `;
}

function renderSectionHeader(title = "", subtitle = "") {
  return `
    <div class="clientes-modal-section-head incidencias-modal-section-head">
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
    </div>
  `;
}

function renderInfoRow(label = "", value = "", options = {}) {
  const safeValue = cleanText(value, "");
  if (!safeValue && options.hideEmpty !== false) return "";

  return `
    <div class="clientes-modal-info-row">
      <span>${escapeHtml(label)}</span>
      <strong>${options.html ? value : escapeHtml(safeValue || "—")}</strong>
    </div>
  `;
}

function renderAddressCard(title = "", address = {}) {
  const formatted = formatAddress(address);
  if (!formatted) return "";

  const a = safeObject(address);

  return `
    <article class="clientes-modal-address-card incidencias-modal-meta-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(formatted)}</strong>
      <small>${escapeHtml([a.cp || a.postalCode, a.ciudad || a.city, a.provincia || a.region, a.pais || a.country].filter(Boolean).join(" · ") || "Dirección registrada")}</small>
    </article>
  `;
}

/* =========================================================
   CONTENT BLOCKS
========================================================= */

function renderFiscalBlock(detail = {}) {
  const type = getType(detail);
  const fiscalName = getFiscalName(detail);
  const commercialName = getCommercialName(detail);
  const nif = getNif(detail);
  const clienteId = getClienteId(detail);
  const codigo = getCodigoCliente(detail);
  const userId = getUserId(detail);

  return `
    <section class="clientes-modal-section clientes-modal-fiscal-section incidencias-modal-description-section">
      ${renderSectionHeader("Datos fiscales", "Identificación del cliente")}
      <div class="clientes-modal-info-grid">
        ${renderInfoRow("Nombre fiscal", fiscalName, { hideEmpty: false })}
        ${commercialName !== fiscalName ? renderInfoRow("Nombre comercial", commercialName) : ""}
        ${renderInfoRow("Tipo", typeLabel(type), { hideEmpty: false })}
        ${renderInfoRow("NIF / CIF", nif || "—", { hideEmpty: false })}
        ${renderInfoRow("Código cliente", codigo || clienteId || "—", { hideEmpty: false })}
        ${renderInfoRow("Usuario vinculado", userId || "—", { hideEmpty: false })}
      </div>
    </section>
  `;
}

function renderContactBlock(detail = {}) {
  const contactName = getContactName(detail);
  const email = getEmail(detail);
  const phone = getPhone(detail);
  const username = getUsername(detail);

  return `
    <section class="clientes-modal-section clientes-modal-contact-section incidencias-modal-contact-section">
      ${renderSectionHeader("Contacto", "Accesos rápidos de comunicación")}
      <div class="clientes-modal-contact-grid incidencias-modal-contact-grid">
        ${renderLinkedValue({ label: "Email", value: email, href: formatMailHref(email), action: DETAIL_ACTIONS.COPY_EMAIL, iconName: "mail" })}
        ${renderLinkedValue({ label: "Teléfono", value: phone, href: formatPhoneHref(phone), action: DETAIL_ACTIONS.COPY_PHONE, iconName: "phone" })}
        ${renderMetaField("Contacto", contactName || "—")}
        ${username ? renderMetaField("Usuario / slug", username) : ""}
      </div>
    </section>
  `;
}

function renderAddressesBlock(detail = {}) {
  const main = renderAddressCard("Dirección principal", getMainAddress(detail));
  const fiscal = renderAddressCard("Dirección fiscal", getFiscalAddress(detail));
  const service = renderAddressCard("Dirección servicio", getServiceAddress(detail));

  if (!main && !fiscal && !service) return "";

  return `
    <section class="clientes-modal-section clientes-modal-address-section">
      ${renderSectionHeader("Direcciones", "Fiscal, principal y servicio")}
      <div class="clientes-modal-address-grid">
        ${main}
        ${fiscal}
        ${service}
      </div>
    </section>
  `;
}

function renderBillingBlock(detail = {}) {
  const billing = getBilling(detail);
  const facturacion = getFacturacion(detail);
  const currency = getCurrency(detail);
  const ivaEnabled = first(billing.aplicaIVA, facturacion.iva?.enabled, billing.iva?.enabled, true) !== false;
  const irpfEnabled = first(billing.aplicaIRPF, facturacion.irpf?.enabled, billing.irpf?.enabled, false) === true;
  const iva = number(first(billing.porcentajeIVA, facturacion.iva?.porcentaje, billing.iva?.porcentaje, 21), 21);
  const irpf = number(first(billing.porcentajeIRPF, facturacion.irpf?.porcentaje, billing.irpf?.porcentaje, 0), 0);
  const payment = cleanText(first(billing.formaPagoDefault, billing.metodoPagoDefault, facturacion.formaPago, facturacion.metodoPago, "—"), "—");
  const account = cleanText(first(billing.cuentaPagoDefault, facturacion.cuentaPago, ""), "");
  const terms = number(first(billing.paymentTermsDays, facturacion.paymentTermsDays, 0), 0);
  const email = getBillingEmail(detail);
  const enabled = first(billing.enabled, facturacion.enabled, true) !== false;

  return `
    <section class="clientes-modal-section clientes-modal-billing-section">
      ${renderSectionHeader("Facturación", enabled ? "Configuración fiscal activa" : "Facturación desactivada")}
      <div class="clientes-modal-info-grid">
        ${renderInfoRow("Estado", enabled ? "Activa" : "Desactivada", { hideEmpty: false })}
        ${renderInfoRow("Moneda", currency, { hideEmpty: false })}
        ${renderInfoRow("IVA", ivaEnabled ? formatPercent(iva) : "No aplica", { hideEmpty: false })}
        ${renderInfoRow("IRPF", irpfEnabled ? formatPercent(irpf) : "No aplica", { hideEmpty: false })}
        ${renderInfoRow("Forma de pago", payment, { hideEmpty: false })}
        ${terms ? renderInfoRow("Vencimiento", `${terms} días`) : ""}
        ${renderInfoRow("Email facturación", email || "—", { hideEmpty: false })}
        ${account ? renderInfoRow("Cuenta de pago", redactIban(account)) : ""}
      </div>
    </section>
  `;
}

function renderStatsBlock(detail = {}) {
  const currency = getCurrency(detail);
  const tickets = getTicketsCount(detail);
  const openTickets = getOpenTicketsCount(detail);
  const closedTickets = getClosedTicketsCount(detail);
  const facturas = getFacturasCount(detail);
  const total = getTotalFacturado(detail);
  const paid = getTotalPagado(detail);
  const pending = getTotalPendiente(detail);
  const stats = getStats(detail);
  const lastTicketAt = first(stats.lastTicketAt, detail.lastTicketAt, null);
  const lastInvoiceAt = first(stats.lastInvoiceAt, detail.lastInvoiceAt, null);

  return `
    <section class="clientes-modal-section clientes-modal-stats-section">
      ${renderSectionHeader("Actividad", "Resumen operativo y económico")}
      <div class="clientes-modal-stat-grid">
        ${renderMetaField("Tickets", `${tickets} total · ${openTickets} abiertos · ${closedTickets} cerrados`)}
        ${renderMetaField("Facturas", `${facturas} documentos`)}
        ${renderMetaField("Facturado", formatMoney(total, currency))}
        ${renderMetaField("Pagado", formatMoney(paid, currency))}
        ${renderMetaField("Pendiente", formatMoney(pending, currency))}
        ${renderMetaField("Último ticket", lastTicketAt ? formatRelativeDate(lastTicketAt) : "—")}
        ${renderMetaField("Última factura", lastInvoiceAt ? formatRelativeDate(lastInvoiceAt) : "—")}
      </div>
    </section>
  `;
}

function renderPrivacyBlock(detail = {}) {
  const raw = getRaw(detail);
  const privacy = safeObject(first(detail.privacy, raw.privacy, {}));
  const visibility = safeObject(first(detail.visibility, raw.visibility, {}));
  const meta = safeObject(first(detail.meta, raw.meta, {}));
  const permissions = getPermissions(detail);

  const items = [
    privacy.containsPersonalData ? "Datos personales" : "Sin marca personal",
    privacy.containsAddress ? "Dirección" : "Sin dirección",
    privacy.containsBillingData ? "Facturación" : "Sin datos fiscales",
    visibility.adminVisible !== false ? "Visible admin" : "Oculto admin",
    visibility.userVisible !== false ? "Visible usuario" : "Oculto usuario",
    meta.hasUser ? "Usuario vinculado" : "Sin usuario",
  ];

  return `
    <section class="clientes-modal-section clientes-modal-privacy-section">
      ${renderSectionHeader("Visibilidad y permisos", permissions.length ? `${permissions.length} permisos` : "Control interno")}
      <div class="clientes-modal-chip-list">
        ${items.map((item) => renderChip(item, "category")).join("")}
      </div>
      ${permissions.length ? `<div class="clientes-modal-permissions-list">${permissions.map((permission) => `<span>${escapeHtml(cleanText(permission, ""))}</span>`).join("")}</div>` : ""}
    </section>
  `;
}

function normalizeAuditEntry(item = {}, index = 0) {
  const raw = safeObject(item);

  return {
    id: cleanText(first(raw.id, raw.eventId, `audit_${index}`), `audit_${index}`),
    event: cleanText(first(raw.event, raw.type, raw.action, "cliente.updated"), "cliente.updated"),
    source: cleanText(first(raw.source, raw.by, raw.actor, "sistema"), "sistema"),
    at: first(raw.at, raw.createdAt, raw.date, raw.timestamp, null),
    schemaVersion: cleanText(first(raw.schemaVersion, raw.version, ""), ""),
  };
}

function renderAuditBlock(detail = {}) {
  const audit = getAuditEntries(detail).map(normalizeAuditEntry);

  if (!audit.length) {
    return `
      <section class="clientes-modal-section clientes-modal-history-section incidencias-modal-history-section">
        ${renderSectionHeader("Historial", "Sin auditoría extendida")}
        <div class="clientes-timeline-empty incidencias-timeline-empty">Sin actividad registrada.</div>
      </section>
    `;
  }

  return `
    <section class="clientes-modal-section clientes-modal-history-section incidencias-modal-history-section">
      ${renderSectionHeader("Historial", `${audit.length} evento${audit.length === 1 ? "" : "s"}`)}
      <div class="clientes-timeline-list incidencias-timeline-list">
        ${audit.map((entry) => `
          <article class="clientes-timeline-card incidencias-timeline-card ${entry.event.includes("created") ? "is-created" : ""}">
            <div class="clientes-timeline-accent incidencias-timeline-accent"></div>
            <div class="clientes-timeline-main incidencias-timeline-main">
              <div class="clientes-timeline-title-row incidencias-timeline-title-row">
                <strong class="clientes-timeline-title incidencias-timeline-title">${escapeHtml(entry.event)}</strong>
                <span class="clientes-timeline-kind incidencias-timeline-kind">${escapeHtml(entry.source)}</span>
              </div>
              <p class="clientes-timeline-body incidencias-timeline-body">${escapeHtml(entry.schemaVersion ? `schemaVersion ${entry.schemaVersion}` : "Evento registrado")}</p>
            </div>
            <div class="clientes-timeline-meta incidencias-timeline-meta">
              <strong>${escapeHtml(entry.source)}</strong>
              <span>${escapeHtml(formatDate(entry.at))}</span>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFooter(vm = {}) {
  const detail = vm.detail;
  const email = getEmail(detail);
  const phone = getPhone(detail);

  return `
    <footer class="clientes-modal-footer incidencias-modal-footer" data-modal-footer="true">
      <button type="button" data-detail-action="${DETAIL_ACTIONS.CLOSE}" class="clientes-modal-submit-btn incidencias-modal-submit-btn">
        Cerrar cliente
      </button>
      <div class="clientes-modal-footer-actions">
        ${email ? `<a href="${attr(formatMailHref(email))}" class="clientes-modal-footer-link incidencias-modal-view-btn">${icon("mail")} Email</a>` : ""}
        ${phone ? `<a href="${attr(formatPhoneHref(phone))}" class="clientes-modal-footer-link incidencias-modal-view-btn">${icon("phone")} Llamar</a>` : ""}
      </div>
    </footer>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderClientesDetailModal(input = {}) {
  const vm = buildVm(input);
  if (!vm.open) return "";

  const detail = vm.detail;
  const clienteId = vm.clienteId || getClienteId(detail);
  const status = getStatus(detail);
  const type = getType(detail);
  const title = getDisplayName(detail);
  const fiscalName = getFiscalName(detail);
  const contactName = getContactName(detail);
  const email = getEmail(detail);
  const phone = getPhone(detail);
  const city = getCity(detail);
  const province = getProvince(detail);
  const updatedAgo = formatRelativeDate(getUpdatedAt(detail));
  const createdAt = formatDate(getCreatedAt(detail));
  const total = getTotalFacturado(detail);
  const currency = getCurrency(detail);

  return `
    <section
      id="${MODAL_ID}"
      class="clientes-modal-root incidencias-modal-root"
      data-clientes-modal-root="true"
      data-incidencias-modal-root="true"
      data-template-version="${attr(CLIENTES_MODAL_TEMPLATE_VERSION)}"
      data-cliente-id="${attr(clienteId)}"
      data-open="true"
      data-submitting="${vm.submitting ? "true" : "false"}"
    >
      <div class="clientes-modal-overlay incidencias-modal-overlay" data-clientes-modal-overlay="true" data-incidencias-modal-overlay="true">
        <div
          id="${PANEL_ID}"
          class="${joinClasses("clientes-modal-panel incidencias-modal-panel", vm.submitting ? "is-submitting" : "") }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clientes-modal-title"
          tabindex="-1"
          data-clientes-modal-panel="true"
          data-incidencias-modal-panel="true"
        >
          <header class="clientes-modal-header incidencias-modal-header">
            <div class="clientes-modal-hero incidencias-modal-hero">
              ${renderAvatar(detail)}
              <div class="clientes-modal-hero-content incidencias-modal-hero-content">
                <div class="clientes-modal-hero-chips incidencias-modal-hero-chips">
                  <button type="button" data-detail-action="${DETAIL_ACTIONS.COPY_ID}" data-cliente-id="${attr(clienteId)}" data-copy-value="${attr(clienteId)}" class="clientes-modal-id-chip incidencias-modal-id-chip" aria-label="Copiar ID">${escapeHtml(clienteId || "—")}</button>
                  ${renderChip(statusLabel(status), `status-${statusClass(status)}`)}
                  ${renderChip(typeLabel(type), "category")}
                  ${city ? renderChip(city, "category") : ""}
                </div>
                <h2 id="clientes-modal-title" class="clientes-modal-title incidencias-modal-title">${escapeHtml(title)}</h2>
                <span class="clientes-modal-updated incidencias-modal-updated">
                  ${escapeHtml(contactName)}${email ? ` · ${escapeHtml(email)}` : ""}${phone ? ` · ${escapeHtml(phone)}` : ""} · Última actualización ${escapeHtml(updatedAgo)}
                </span>
              </div>
            </div>

            <button type="button" data-detail-action="${DETAIL_ACTIONS.CLOSE}" aria-label="Cerrar modal" class="clientes-modal-close-btn incidencias-modal-close-btn">${icon("close")}</button>
          </header>

          <main class="clientes-modal-body incidencias-modal-body">
            <div data-modal-feedback-slot="true">${renderFeedbackBox(vm)}</div>

            <div class="clientes-modal-meta-grid incidencias-modal-meta-grid">
              ${renderMetaField("Cliente", getCodigoCliente(detail) || clienteId)}
              ${renderMetaField("NIF/CIF", getNif(detail) || "—")}
              ${renderMetaField("Creado", createdAt)}
              ${renderMetaField("Facturado", formatMoney(total, currency))}
              ${renderMetaField("Ubicación", [city, province].filter(Boolean).join(" · ") || "—")}
              ${renderMetaField("Nombre fiscal", fiscalName)}
            </div>

            ${renderFiscalBlock(detail)}
            ${renderContactBlock(detail)}
            ${renderAddressesBlock(detail)}
            ${renderBillingBlock(detail)}
            ${renderStatsBlock(detail)}
            ${renderPrivacyBlock(detail)}
            ${renderAuditBlock(detail)}
            ${renderFooter(vm)}
          </main>
        </div>
      </div>
    </section>
  `;
}

export function renderClientesDetailModalClosed() {
  return "";
}

/* =========================================================
   BRIDGE OPCIONAL PARA INDEX.JS ACTUAL
   - Permite que index.js llame module.default.open(normalized)
   - Sin HTTP y sin depender de AppCore.
========================================================= */

function ensureBridgeHost() {
  if (!isBrowser()) return null;

  if (bridgeHost?.isConnected) return bridgeHost;

  bridgeHost = document.querySelector(MODAL_HOST_SELECTOR) || document.createElement("div");
  bridgeHost.setAttribute("data-clientes-detail-modal-host", "true");
  bridgeHost.setAttribute("data-owner", CLIENTES_MODAL_TEMPLATE_VERSION);

  if (!bridgeHost.isConnected) document.body.appendChild(bridgeHost);

  if (!bridgeHost.__clientesDetailModalBound) {
    bridgeHost.addEventListener("click", onBridgeClick, true);
    bridgeHost.__clientesDetailModalBound = true;
  }

  return bridgeHost;
}

function syncBodyModalClass(open = false) {
  if (!isBrowser()) return false;

  try {
    document.body?.classList.toggle("modal-open", Boolean(open));
    document.body?.classList.toggle("clientes-modal-open", Boolean(open));
    document.body?.classList.toggle("clientes-detail-open", Boolean(open));
    return true;
  } catch {
    return false;
  }
}

function paintBridge() {
  const host = ensureBridgeHost();
  if (!host) return false;

  host.innerHTML = bridgeState.open
    ? renderClientesDetailModal({
        open: true,
        detail: bridgeState.detail,
        feedbackMessage: bridgeState.feedbackMessage,
        feedbackType: bridgeState.feedbackType,
      })
    : "";

  syncBodyModalClass(bridgeState.open);

  try {
    host.querySelector?.("[data-clientes-modal-panel='true'], [data-incidencias-modal-panel='true']")?.focus?.({ preventScroll: true });
  } catch {
    // noop
  }

  return true;
}

function closeBridge() {
  bridgeState = {
    ...bridgeState,
    open: false,
    feedbackMessage: "",
    feedbackType: "info",
  };

  paintBridge();
  return true;
}

async function copyText(value = "") {
  const text = cleanText(value, "");
  if (!text || !isBrowser()) return false;

  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "true");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function setFeedback(message = "", type = "info") {
  bridgeState = {
    ...bridgeState,
    feedbackMessage: cleanText(message, ""),
    feedbackType: cleanText(type, "info"),
  };

  paintBridge();

  if (message) {
    window.setTimeout?.(() => {
      if (bridgeState.feedbackMessage === message) {
        bridgeState = { ...bridgeState, feedbackMessage: "", feedbackType: "info" };
        paintBridge();
      }
    }, 1600);
  }

  return true;
}

async function onBridgeClick(event = null) {
  const target = event?.target?.closest?.("[data-detail-action], [data-clientes-modal-overlay='true']");
  if (!target) return;

  const overlayClick = target?.matches?.("[data-clientes-modal-overlay='true']") && event?.target === target;
  const action = cleanText(target?.dataset?.detailAction, "");

  if (overlayClick || action === DETAIL_ACTIONS.CLOSE) {
    event?.preventDefault?.();
    closeBridge();
    return;
  }

  if ([DETAIL_ACTIONS.COPY_ID, DETAIL_ACTIONS.COPY_EMAIL, DETAIL_ACTIONS.COPY_PHONE, DETAIL_ACTIONS.COPY_FIELD].includes(action)) {
    event?.preventDefault?.();
    const value = first(target?.dataset?.copyValue, target?.dataset?.clienteId, "");
    const ok = await copyText(value);
    setFeedback(ok ? "Copiado al portapapeles." : "No se pudo copiar automáticamente.", ok ? "success" : "warning");
  }
}

export function openClientesDetailModal(detail = {}, options = {}) {
  bridgeState = {
    open: true,
    detail: safeObject(detail, {}),
    feedbackMessage: cleanText(options.feedbackMessage, ""),
    feedbackType: cleanText(options.feedbackType, "info"),
  };

  paintBridge();
  return true;
}

export function showClientesDetailModal(detail = {}, options = {}) {
  return openClientesDetailModal(detail, options);
}

export function renderClientesModal(detail = {}, options = {}) {
  return openClientesDetailModal(detail, options);
}

export function closeClientesDetailModal() {
  return closeBridge();
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getClienteDetailId(detail = {}) {
  return getClienteId(detail);
}

export function getClienteDetailContact(detail = {}) {
  return {
    name: getContactName(detail),
    email: getEmail(detail),
    phone: getPhone(detail),
    username: getUsername(detail),
  };
}

export function validateDetailUpdate() {
  return {
    valid: true,
    message: "",
  };
}

export function getDetailTemplateSnapshot() {
  return {
    version: CLIENTES_MODAL_TEMPLATE_VERSION,
    actions: DETAIL_ACTIONS,
    fields: [],
    sections: [
      "hero",
      "meta",
      "fiscal",
      "contact",
      "addresses",
      "billing",
      "stats",
      "privacy",
      "audit",
    ],
    policy: {
      templateOnlyRender: true,
      bridgeOpenCompatible: true,
      spaIslandCompatible: true,
      detailActionsStable: true,
      noHttp: true,
      noStore: true,
      noRouter: true,
      noAuth: true,
      noArrayFlatten: true,
      mailtoLinks: true,
      telLinks: true,
      copyActions: true,
      cosmosClienteSchemaV2: true,
      incidenciasCssCompatibility: true,
    },
  };
}

export const getSnapshot = getDetailTemplateSnapshot;
export const renderClienteDetailModal = renderClientesDetailModal;
export const renderClienteDetailModalClosed = renderClientesDetailModalClosed;
export const renderDetailModal = renderClientesDetailModal;
export const renderDetailModalClosed = renderClientesDetailModalClosed;
export const open = openClientesDetailModal;
export const show = showClientesDetailModal;
export const render = renderClientesModal;
export const close = closeClientesDetailModal;

const ClientesDetailModalBridge = Object.freeze({
  open: openClientesDetailModal,
  show: showClientesDetailModal,
  render: renderClientesModal,
  close: closeClientesDetailModal,
  renderHtml: renderClientesDetailModal,
  renderClosed: renderClientesDetailModalClosed,
  getSnapshot: getDetailTemplateSnapshot,
  version: CLIENTES_MODAL_TEMPLATE_VERSION,
  actions: DETAIL_ACTIONS,
});

export default ClientesDetailModalBridge;

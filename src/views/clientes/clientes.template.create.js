/* =========================================================
   Onion Support - Clientes Create Template
   Archivo: /src/views/clientes/clientes.template.create.js

   PRODUCTIVO · TEMPLATE PURO · 1:1 INCIDENCIAS · COSMOS READY

   Contrato productivo:
   - Sólo renderiza HTML y valida forma local.
   - No hace HTTP, no toca Auth, no toca Store, no toca DOM.
   - Expone data-field y data-create-action estables para index.js.
   - Compatible con backend admin POST /api/clientes.
   - Compatible con documento Cosmos clientes schemaVersion 2.
   - Admin: busca/selecciona userId real y no inventa userId.
   - Sin adjuntos, sin Blob, sin fetch propio.
========================================================= */

export const CLIENTES_CREATE_TEMPLATE_VERSION =
  "clientes.template.create.cosmos.v2.1-1-incidencias";

export const CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  SUBMIT: "create-submit",

  USER_SEARCH: "create-user-search",
  USER_SELECT: "create-user-select",
  USER_CLEAR: "create-user-clear",

  COPY_USER_CONTACT: "create-copy-user-contact",
  BILLING_TOGGLE: "create-billing-toggle",
});

export const CLIENTES_CREATE_ACTIONS = CREATE_ACTIONS;

const MODAL_ID = "clientes-create-modal-root";
const PANEL_ID = "clientes-create-modal-panel";
const FORM_ID = "clientes-create-form";

const USER_SEARCH_MIN_LENGTH = 2;

const CLIENTE_TYPE_OPTIONS = Object.freeze([
  { value: "particular", label: "Particular" },
  { value: "empresa", label: "Empresa" },
]);

const COUNTRY_OPTIONS = Object.freeze([
  { value: "España", label: "España" },
  { value: "Portugal", label: "Portugal" },
  { value: "Francia", label: "Francia" },
  { value: "Italia", label: "Italia" },
  { value: "Alemania", label: "Alemania" },
]);

const PAYMENT_METHOD_OPTIONS = Object.freeze([
  { value: "transferencia bancaria", label: "Transferencia bancaria" },
  { value: "domiciliacion bancaria", label: "Domiciliación bancaria" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
]);

const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetClienteId: "",
  targetUserName: "",
  targetUserEmail: "",
  targetUserPhone: "",
  targetUserAvatar: "",
  targetUsername: "",

  userId: "",

  tipo: "empresa",
  clienteTipo: "empresa",
  segmento: "empresa",
  active: true,
  status: "active",
  estado: "activo",
  source: "panel_admin",

  nombreFiscal: "",
  razonSocial: "",
  empresa: "",
  nombreComercial: "",
  displayName: "",
  name: "",
  nif: "",
  vatNumber: "",
  taxId: "",

  contactoNombre: "",
  contactoEmail: "",
  contactoPhone: "",
  username: "",
  slug: "",

  email: "",
  emailFacturacion: "",
  emailCliente: "",
  emailLower: "",
  phone: "",
  telefono: "",

  calle: "",
  linea2: "",
  cp: "",
  ciudad: "",
  provincia: "",
  pais: "España",

  billingEnabled: true,
  currency: "EUR",
  moneda: "EUR",
  aplicaIVA: true,
  porcentajeIVA: 21,
  aplicaIRPF: true,
  porcentajeIRPF: 7,
  formaPagoDefault: "transferencia bancaria",
  metodoPagoDefault: "transferencia bancaria",
  cuentaPagoDefault: "",
  requiresInvoice: true,
  invoiceLanguage: "es",
  paymentTermsDays: 30,
});

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
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

/*
  IMPORTANTE:
  No aplanar arrays aquí. Este template sigue el patrón corregido de
  Clientes/Incidencias para no romper envelopes con items: [..].
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

function bool(value = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;

  const raw = cleanText(value, "").toLowerCase();
  if (["true", "1", "yes", "si", "sí", "on", "enabled", "activo", "active"].includes(raw)) return true;
  if (["false", "0", "no", "off", "disabled", "inactivo", "inactive"].includes(raw)) return false;

  return Boolean(value);
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
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function normalizePhone(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";

  return raw
    .replace(/[^\d+()\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function slugify(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/@.*$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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
    try { return new URL(raw).href; } catch { return ""; }
  }

  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }

  return "";
}

function firstImageSrc(...values) {
  const stack = [...values];

  while (stack.length) {
    const value = stack.shift();
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      stack.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.userAvatar,
        value.userAvatarUrl,
        value.clienteAvatar,
        value.clienteAvatarUrl,
        value.clientAvatar,
        value.clientAvatarUrl,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.photoUrl,
        value.profile?.photoURL,
        value.profile?.picture,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture,
        value.raw?.photoUrl,
        value.raw?.photoURL,
        value.raw?.imageUrl
      );
      continue;
    }

    const src = safeImageSrc(value);
    if (src) return src;
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

function isValidEmail(value = "") {
  const email = normalizeEmail(value);
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateEs(value = null) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";

  try {
    const datePart = new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);

    return `${datePart} - ${timePart}`;
  } catch {
    return date.toISOString();
  }
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    client: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    building: `<svg ${common}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/></svg>`,
    user: `<svg ${common}><path d="M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.75 20.75a7.25 7.25 0 0 1 14.5 0"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    mail: `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`,
    phone: `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,
    location: `<svg ${common}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h10"/><path d="M19 5.5A7 7 0 1 0 19 18.5"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  };

  return icons[name] || icons.client;
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeUserResult(user = {}) {
  const raw = safeObject(user);
  const nested = safeObject(raw.raw);
  const profile = safeObject(first(raw.profile, nested.profile, {}));

  const userId = cleanText(
    first(
      raw.userId,
      raw.id,
      raw.uid,
      raw.sub,
      raw.usuarioId,
      raw.lookup?.userId,
      raw.lookup?.id,
      raw.auth?.userId,
      profile.userId,
      nested.userId,
      nested.id,
      nested.uid,
      nested.sub,
      nested.usuarioId,
      ""
    ),
    ""
  );

  const clienteId = cleanText(
    first(
      raw.targetClienteId,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.lookup?.clienteId,
      raw.lookup?.clientId,
      raw.tenant?.clienteId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      raw.client?.clienteId,
      raw.client?.id,
      profile.clienteId,
      profile.clientId,
      nested.targetClienteId,
      nested.clienteId,
      nested.clientId,
      nested.customerId,
      nested.cliente?.clienteId,
      nested.cliente?.id,
      nested.client?.clienteId,
      nested.client?.id,
      ""
    ),
    ""
  );

  const name = cleanText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.publicName,
      raw.clienteNombre,
      raw.clientName,
      profile.publicName,
      profile.displayName,
      profile.name,
      raw.lookup?.displayName,
      raw.lookup?.name,
      [raw.firstName, raw.lastName].filter(Boolean).join(" "),
      [raw.nombre, raw.apellidos].filter(Boolean).join(" "),
      nested.displayName,
      nested.fullName,
      nested.name,
      nested.nombre,
      raw.username,
      userId
    ),
    "Usuario"
  );

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.userEmail,
    raw.clienteEmail,
    raw.clientEmail,
    profile.email,
    raw.lookup?.email,
    nested.email,
    nested.emailLower,
    ""
  );

  const phone = normalizePhone(
    first(
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.movil,
      profile.phone,
      profile.telefono,
      nested.phone,
      nested.telefono,
      ""
    )
  );

  const username = cleanText(
    first(
      raw.username,
      raw.usernameLower,
      raw.userName,
      profile.username,
      nested.username,
      nested.usernameLower,
      slugify(email || name),
      ""
    ),
    ""
  );

  const avatarUrl = firstImageSrc(raw, nested, profile);

  return {
    id: userId,
    userId,
    uid: userId,
    targetUserId: userId,
    clienteId,
    targetClienteId: clienteId,
    clientId: clienteId,
    name,
    nombre: name,
    fullName: name,
    displayName: name,
    email,
    emailLower: email,
    username,
    usernameLower: username.toLowerCase(),
    role: cleanText(first(raw.role, raw.rol, nested.role, nested.rol, "user"), "user"),
    phone,
    telefono: phone,
    avatarUrl,
    avatar: avatarUrl || null,
    picture: avatarUrl || "",
    initials: cleanText(raw.initials, initialsFrom(name)),
    tone: hashText(`${userId}:${clienteId}:${email}:${name}`) % 10,
    raw,
  };
}

function normalizeClienteType(value = "") {
  const key = normalizeKey(value || "empresa");

  if (["particular", "persona", "individual", "b2c"].includes(key)) return "particular";
  if (["empresa", "company", "business", "b2b", "autonomo", "autónomo"].includes(key)) return "empresa";

  return "empresa";
}

function normalizeForm(form = {}) {
  const input = {
    ...DEFAULT_FORM,
    ...safeObject(form),
  };

  const selectedUser = normalizeUserResult(first(input.selectedUser, input.user, input.usuario, {}));

  const userId = cleanText(
    first(
      input.userId,
      input.targetUserId,
      selectedUser.userId,
      selectedUser.id,
      input.usuarioId,
      input.uid,
      ""
    ),
    ""
  );

  const targetClienteId = cleanText(
    first(
      input.targetClienteId,
      input.clienteId,
      input.clientId,
      selectedUser.targetClienteId,
      selectedUser.clienteId,
      ""
    ),
    ""
  );

  const tipo = normalizeClienteType(first(input.tipo, input.clienteTipo, input.segmento, "empresa"));

  const selectedName = cleanText(first(input.targetUserName, selectedUser.displayName, selectedUser.name), "");
  const selectedEmail = firstEmail(input.targetUserEmail, selectedUser.email, "");
  const selectedPhone = normalizePhone(first(input.targetUserPhone, selectedUser.phone, selectedUser.telefono, ""));
  const selectedUsername = cleanText(first(input.targetUsername, selectedUser.username, slugify(selectedEmail || selectedName)), "");
  const selectedAvatar = firstImageSrc(input.targetUserAvatar, selectedUser.avatarUrl, selectedUser.avatar);

  const nombreFiscal = cleanText(
    first(
      input.nombreFiscal,
      input.razonSocial,
      input.empresa,
      input.nombreComercial,
      input.displayName,
      input.name,
      tipo === "particular" ? selectedName : "",
      ""
    ),
    ""
  ).slice(0, 150);

  const contactoNombre = cleanText(first(input.contactoNombre, input.contactName, input.contacto?.nombre, selectedName, nombreFiscal), "").slice(0, 150);
  const contactoEmail = firstEmail(input.contactoEmail, input.email, input.emailCliente, input.emailFacturacion, input.contacto?.email, selectedEmail);
  const contactoPhone = normalizePhone(first(input.contactoPhone, input.phone, input.telefono, input.contacto?.phone, input.contacto?.telefono, selectedPhone));
  const username = cleanText(first(input.username, input.usernameLower, selectedUsername, slugify(contactoEmail || contactoNombre)), "").slice(0, 64);
  const slug = cleanText(first(input.slug, slugify(username || contactoEmail || contactoNombre)), "").slice(0, 64);

  const nif = cleanText(first(input.nif, input.cif, input.vatNumber, input.taxId, ""), "").toUpperCase().slice(0, 20);

  const emailFacturacion = firstEmail(input.emailFacturacion, input.billing?.emailFacturacion, input.facturacion?.email, contactoEmail, selectedEmail);
  const iva = number(first(input.porcentajeIVA, input.ivaPorcentaje, input.billing?.porcentajeIVA, input.facturacion?.iva?.porcentaje), 21);
  const irpf = number(first(input.porcentajeIRPF, input.irpfPorcentaje, input.billing?.porcentajeIRPF, input.facturacion?.irpf?.porcentaje), 7);
  const paymentTermsDays = Math.max(0, Math.min(number(first(input.paymentTermsDays, input.billing?.paymentTermsDays), 30), 365));
  const formaPagoDefault = cleanText(first(input.formaPagoDefault, input.metodoPagoDefault, input.facturacion?.formaPago, "transferencia bancaria"), "transferencia bancaria").slice(0, 80);
  const cuentaPagoDefault = cleanText(first(input.cuentaPagoDefault, input.facturacion?.cuentaPago, ""), "").slice(0, 80);

  const calle = cleanText(first(input.calle, input.direccion?.calle, input.address?.street, ""), "").slice(0, 150);
  const linea2 = cleanText(first(input.linea2, input.direccion?.linea2, input.address?.line2, ""), "").slice(0, 150);
  const cp = cleanText(first(input.cp, input.postalCode, input.codigoPostal, input.direccion?.cp, ""), "").slice(0, 10);
  const ciudad = cleanText(first(input.ciudad, input.city, input.direccion?.ciudad, ""), "").slice(0, 100);
  const provincia = cleanText(first(input.provincia, input.province, input.direccion?.provincia, ""), "").slice(0, 100);
  const pais = cleanText(first(input.pais, input.country, input.direccion?.pais, "España"), "España").slice(0, 100);

  const razonSocial = cleanText(first(input.razonSocial, nombreFiscal), nombreFiscal).slice(0, 150);
  const empresa = cleanText(first(input.empresa, nombreFiscal), nombreFiscal).slice(0, 150);
  const nombreComercial = cleanText(first(input.nombreComercial, nombreFiscal), nombreFiscal).slice(0, 150);
  const displayName = cleanText(first(input.displayName, nombreComercial, razonSocial, contactoNombre), "Cliente").slice(0, 150);

  return {
    targetUserId: userId,
    targetClienteId,
    targetUserName: selectedName || contactoNombre,
    targetUserEmail: selectedEmail || contactoEmail,
    targetUserPhone: selectedPhone || contactoPhone,
    targetUserAvatar: selectedAvatar,
    targetUsername: selectedUsername || username,

    userId,

    tipo,
    clienteTipo: tipo,
    segmento: tipo,
    active: bool(input.active !== undefined ? input.active : true),
    status: normalizeKey(first(input.status, "active")) || "active",
    estado: cleanText(first(input.estado, "activo"), "activo"),
    source: cleanText(input.source, "panel_admin"),

    nombreFiscal,
    razonSocial,
    empresa,
    nombreComercial,
    displayName,
    name: displayName,

    nif,
    vatNumber: nif,
    taxId: nif,

    contactoNombre,
    contactoEmail,
    contactoPhone,
    username,
    usernameLower: username.toLowerCase(),
    slug,

    email: contactoEmail,
    emailLower: contactoEmail,
    emailCliente: contactoEmail,
    emailFacturacion,
    phone: contactoPhone,
    telefono: contactoPhone,

    calle,
    linea2,
    cp,
    ciudad,
    provincia,
    pais,

    billingEnabled: bool(input.billingEnabled !== undefined ? input.billingEnabled : first(input.billing?.enabled, true)),
    currency: cleanText(first(input.currency, input.moneda, input.billing?.currency, "EUR"), "EUR").toUpperCase(),
    moneda: cleanText(first(input.moneda, input.currency, input.billing?.moneda, "EUR"), "EUR").toUpperCase(),
    aplicaIVA: bool(input.aplicaIVA !== undefined ? input.aplicaIVA : first(input.billing?.aplicaIVA, input.facturacion?.iva?.enabled, true)),
    porcentajeIVA: iva,
    aplicaIRPF: bool(input.aplicaIRPF !== undefined ? input.aplicaIRPF : first(input.billing?.aplicaIRPF, input.facturacion?.irpf?.enabled, tipo === "empresa")),
    porcentajeIRPF: irpf,
    formaPagoDefault,
    metodoPagoDefault: cleanText(first(input.metodoPagoDefault, formaPagoDefault), formaPagoDefault).slice(0, 80),
    cuentaPagoDefault,
    requiresInvoice: bool(input.requiresInvoice !== undefined ? input.requiresInvoice : first(input.billing?.requiresInvoice, true)),
    invoiceLanguage: cleanText(first(input.invoiceLanguage, input.billing?.invoiceLanguage, "es"), "es").slice(0, 10),
    paymentTermsDays,
  };
}

function buildSelectedUser(form = {}, userSearch = {}) {
  const selected = safeObject(userSearch.selectedUser);

  if (!form.targetUserId && !selected.id && !selected.userId) return null;

  return normalizeUserResult({
    ...selected,
    userId: first(selected.userId, selected.id, form.targetUserId),
    id: first(selected.id, selected.userId, form.targetUserId),
    targetClienteId: first(selected.targetClienteId, selected.clienteId, selected.clientId, form.targetClienteId),
    clienteId: first(selected.clienteId, selected.targetClienteId, selected.clientId, form.targetClienteId),
    clientId: first(selected.clientId, selected.clienteId, selected.targetClienteId, form.targetClienteId),
    displayName: first(selected.displayName, selected.fullName, selected.name, selected.nombre, form.targetUserName),
    name: first(selected.name, selected.displayName, selected.fullName, selected.nombre, form.targetUserName),
    email: first(selected.email, selected.emailLower, form.targetUserEmail),
    phone: first(selected.phone, selected.telefono, form.targetUserPhone),
    username: first(selected.username, selected.usernameLower, form.targetUsername),
    avatarUrl: first(selected.avatarUrl, selected.avatar, form.targetUserAvatar),
  });
}

function buildVm(input = {}) {
  const raw = safeObject(input);
  const form = normalizeForm(raw.form || raw.values || raw);
  const userSearch = {
    query: cleanText(raw.userSearch?.query, ""),
    loading: Boolean(raw.userSearch?.loading),
    error: cleanText(raw.userSearch?.error, ""),
    empty: Boolean(raw.userSearch?.empty),
    results: safeArray(raw.userSearch?.results).map(normalizeUserResult),
    selectedUser: raw.userSearch?.selectedUser ? normalizeUserResult(raw.userSearch.selectedUser) : null,
  };

  return {
    open: raw.open !== false,
    admin: Boolean(raw.admin || raw.isAdmin || raw.role === "admin"),
    role: cleanText(raw.role, "user"),
    submitting: Boolean(raw.submitting || raw.loading || raw.creating),
    serverError: cleanText(raw.serverError || raw.error, ""),
    successMessage: cleanText(raw.successMessage, ""),
    createdClienteId: cleanText(raw.createdClienteId || raw.clienteId || raw.clientId, ""),
    errors: safeObject(raw.errors),
    form,
    userSearch,
    selectedUser: buildSelectedUser(form, userSearch),
  };
}

/* =========================================================
   PAYLOAD BUILDER
========================================================= */

export function buildClienteCreatePayload(form = {}) {
  const current = normalizeForm(form);
  const createdAt = nowIso();
  const createdAtES = formatDateEs(createdAt);

  const direccion = {
    calle: current.calle,
    linea2: current.linea2,
    cp: current.cp,
    ciudad: current.ciudad,
    provincia: current.provincia,
    pais: current.pais,
  };

  const contacto = {
    nombre: current.contactoNombre || current.displayName,
    name: current.contactoNombre || current.displayName,
    displayName: current.contactoNombre || current.displayName,
    email: current.contactoEmail,
    emailLower: current.contactoEmail,
    phone: current.contactoPhone,
    telefono: current.contactoPhone,
    username: current.username,
    usernameLower: current.usernameLower,
    slug: current.slug,
  };

  const billing = {
    enabled: current.billingEnabled,
    currency: current.currency,
    moneda: current.moneda,
    aplicaIVA: current.aplicaIVA,
    porcentajeIVA: current.porcentajeIVA,
    aplicaIRPF: current.aplicaIRPF,
    porcentajeIRPF: current.porcentajeIRPF,
    formaPagoDefault: current.formaPagoDefault,
    metodoPagoDefault: current.metodoPagoDefault,
    cuentaPagoDefault: current.cuentaPagoDefault,
    emailFacturacion: current.emailFacturacion,
    clienteTipo: current.tipo,
    requiresInvoice: current.requiresInvoice,
    invoiceLanguage: current.invoiceLanguage,
    paymentTermsDays: current.paymentTermsDays,
  };

  const facturacion = {
    enabled: current.billingEnabled,
    moneda: current.moneda,
    currency: current.currency,
    iva: {
      enabled: current.aplicaIVA,
      porcentaje: current.porcentajeIVA,
    },
    irpf: {
      enabled: current.aplicaIRPF,
      porcentaje: current.porcentajeIRPF,
    },
    formaPago: current.formaPagoDefault,
    metodoPago: current.metodoPagoDefault,
    cuentaPago: current.cuentaPagoDefault,
    email: current.emailFacturacion,
  };

  return {
    ...current,

    entityType: "cliente",
    tipoDocumento: "cliente",
    schemaVersion: 2,
    versionEsquema: 2,

    clienteTipo: current.tipo,
    segmento: current.tipo,

    nombreFiscal: current.nombreFiscal,
    razonSocial: current.razonSocial,
    empresa: current.empresa,
    nombreComercial: current.nombreComercial,
    displayName: current.displayName,
    name: current.name,

    nif: current.nif || null,
    vatNumber: current.nif || null,
    taxId: current.nif || null,

    contacto,

    email: current.contactoEmail,
    emailLower: current.contactoEmail,
    emailCliente: current.contactoEmail,
    emailFacturacion: current.emailFacturacion,
    phone: current.contactoPhone,
    telefono: current.contactoPhone,
    username: current.username,
    usernameLower: current.usernameLower,
    slug: current.slug,

    direccion,
    direccionFiscal: direccion,
    direccionServicio: direccion,

    billing,
    facturacion,

    visibility: {
      adminVisible: true,
      userVisible: true,
      clientVisible: true,
      internalOnly: false,
    },

    privacy: {
      containsPersonalData: true,
      containsSensitiveData: false,
      containsAddress: Boolean(current.calle || current.ciudad || current.cp),
      containsBillingData: current.billingEnabled,
      containsAuthData: false,
      redactionRequired: false,
    },

    stats: {
      ticketsCount: 0,
      openTicketsCount: 0,
      closedTicketsCount: 0,
      facturasCount: 0,
      facturasPaidCount: 0,
      facturasPendingCount: 0,
      totalFacturado: 0,
      totalPagado: 0,
      totalPendiente: 0,
      currency: current.currency,
      lastTicketAt: null,
      lastInvoiceAt: null,
      lastActivityAt: createdAt,
    },

    createdAt,
    createdAtES,

    search: {
      text: normalizeSearch([
        current.targetClienteId,
        current.userId,
        current.nombreFiscal,
        current.razonSocial,
        current.empresa,
        current.nombreComercial,
        current.contactoNombre,
        current.username,
        current.contactoEmail,
        current.nif,
        current.tipo,
        current.ciudad,
        current.provincia,
        current.pais,
        current.calle,
        "facturacion tickets soporte",
      ].filter(Boolean).join(" ")),
      normalizedClienteId: normalizeSearch(current.targetClienteId),
      normalizedUserId: normalizeSearch(current.userId),
      normalizedName: normalizeSearch(current.displayName),
      normalizedDisplayName: normalizeSearch(current.displayName),
      normalizedFiscalName: normalizeSearch(current.nombreFiscal),
      normalizedContactName: normalizeSearch(current.contactoNombre),
      normalizedEmail: normalizeSearch(current.contactoEmail),
      normalizedUsername: normalizeSearch(current.username),
      normalizedNif: normalizeSearch(current.nif),
      normalizedCity: normalizeSearch(current.ciudad),
      normalizedProvince: normalizeSearch(current.provincia),
      normalizedType: current.tipo,
    },

    meta: {
      schemaVersion: 2,
      createdFrom: current.source || "admin_panel",
      lastUpdateSource: "admin_panel",
      isActive: true,
      isCompany: current.tipo === "empresa",
      isParticular: current.tipo === "particular",
      hasUser: Boolean(current.userId),
      hasFiscalData: Boolean(current.nombreFiscal || current.nif),
      hasBillingData: current.billingEnabled,
      hasContact: Boolean(current.contactoNombre || current.contactoEmail || current.contactoPhone),
      hasAddress: Boolean(current.calle || current.cp || current.ciudad || current.provincia),
      hasEmail: Boolean(current.contactoEmail),
      hasPhone: Boolean(current.contactoPhone),
      hasAvatar: Boolean(current.targetUserAvatar),
      hasTickets: false,
      hasFacturas: false,
      visibleToCurrentUser: true,
      visibleBy: "role_or_ownership",
      container: "clientes",
    },
  };
}

/* =========================================================
   HTML PARTS
========================================================= */

function disabledAttrs(disabled = false, busy = false) {
  return disabled
    ? `disabled aria-disabled="true"${busy ? " aria-busy=\"true\"" : ""}`
    : "";
}

function checkedAttr(value = false) {
  return bool(value) ? "checked" : "";
}

function renderFieldError(error = "") {
  const text = cleanText(error, "");

  if (!text) return "";

  return `<p class="cli-create-field-error inc-create-field-error" role="alert">${escapeHtml(text)}</p>`;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  placeholder = "",
  type = "text",
  required = false,
  error = "",
  disabled = false,
  autocomplete = "off",
  inputmode = "",
  iconName = "",
  maxLength = "",
} = {}) {
  const id = `clientes-create-${name}`;

  return `
    <label class="cli-create-field inc-create-field ${error ? "is-error" : ""}" data-create-field="${attr(name)}">
      <span class="cli-create-label inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>
      <span class="cli-create-input-wrap ${iconName ? "has-icon" : ""}">
        ${iconName ? `<span class="cli-create-input-icon inc-create-search-icon" aria-hidden="true">${icon(iconName)}</span>` : ""}
        <input
          id="${attr(id)}"
          class="cli-create-input inc-create-input ${iconName ? "cli-create-input--with-icon inc-create-input--with-icon" : ""}"
          data-field="${attr(name)}"
          name="${attr(name)}"
          type="${attr(type)}"
          value="${attr(value)}"
          placeholder="${attr(placeholder)}"
          autocomplete="${attr(autocomplete)}"
          ${inputmode ? `inputmode="${attr(inputmode)}"` : ""}
          ${maxLength ? `maxlength="${attr(maxLength)}"` : ""}
          ${required ? "required" : ""}
          ${disabledAttrs(disabled, disabled)}
        >
      </span>
      ${renderFieldError(error)}
    </label>
  `;
}

function renderSelect({
  label = "",
  name = "",
  value = "",
  options = [],
  required = false,
  error = "",
  disabled = false,
} = {}) {
  const id = `clientes-create-${name}`;
  const current = cleanText(value, "");

  return `
    <label class="cli-create-field inc-create-field ${error ? "is-error" : ""}" data-create-field="${attr(name)}">
      <span class="cli-create-label inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>
      <span class="cli-create-select-wrap inc-create-select-wrap">
        <select
          id="${attr(id)}"
          class="cli-create-select inc-create-select"
          data-field="${attr(name)}"
          name="${attr(name)}"
          ${required ? "required" : ""}
          ${disabledAttrs(disabled, disabled)}
        >
          ${safeArray(options).map((option) => {
            const optionValue = cleanText(option.value, "");
            return `
              <option value="${attr(optionValue)}" ${optionValue === current ? "selected" : ""}>
                ${escapeHtml(option.label || optionValue)}
              </option>
            `;
          }).join("")}
        </select>
        <span class="cli-create-select-chevron inc-create-select-chevron" aria-hidden="true">⌄</span>
      </span>
      ${renderFieldError(error)}
    </label>
  `;
}

function renderCheckbox({
  label = "",
  name = "",
  checked = false,
  help = "",
  disabled = false,
} = {}) {
  const id = `clientes-create-${name}`;

  return `
    <label class="cli-create-check inc-create-check" data-create-field="${attr(name)}">
      <input
        id="${attr(id)}"
        class="cli-create-check-input inc-create-check-input"
        data-field="${attr(name)}"
        name="${attr(name)}"
        type="checkbox"
        value="true"
        ${checkedAttr(checked)}
        ${disabledAttrs(disabled, disabled)}
      >
      <span class="cli-create-check-box inc-create-check-box" aria-hidden="true">${icon("check")}</span>
      <span class="cli-create-check-copy inc-create-check-copy">
        <strong>${escapeHtml(label)}</strong>
        ${help ? `<span>${escapeHtml(help)}</span>` : ""}
      </span>
    </label>
  `;
}

function renderBlock(title = "", subtitle = "", body = "", className = "") {
  return `
    <section class="cli-create-block inc-create-block ${attr(className)}">
      <div class="cli-create-block-head inc-create-block-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
        </div>
      </div>
      ${body}
    </section>
  `;
}

function renderUserAvatar(user = {}, className = "cli-create-user-avatar inc-create-user-avatar") {
  const safeUser = normalizeUserResult(user);
  const avatar = safeImageSrc(safeUser.avatarUrl || safeUser.avatar);

  if (avatar) {
    return `
      <span class="${attr(className)} has-image" data-user-tone="${attr(String(safeUser.tone))}">
        <img src="${attr(avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      </span>
    `;
  }

  return `
    <span class="${attr(className)}" data-user-tone="${attr(String(safeUser.tone))}">
      ${escapeHtml(safeUser.initials || initialsFrom(safeUser.displayName || safeUser.name))}
    </span>
  `;
}

function renderSelectedUser(vm = {}) {
  const selected = vm.selectedUser;
  const form = vm.form;

  if (!selected?.id && !form.targetUserId) return "";

  const user = normalizeUserResult({
    ...selected,
    userId: form.targetUserId || selected?.userId || selected?.id,
    targetClienteId: form.targetClienteId || selected?.targetClienteId || selected?.clienteId,
    displayName: form.targetUserName || selected?.displayName || selected?.name,
    email: form.targetUserEmail || selected?.email,
    phone: form.targetUserPhone || selected?.phone,
    username: form.targetUsername || selected?.username,
    avatarUrl: form.targetUserAvatar || selected?.avatarUrl || selected?.avatar,
  });

  const subtitle = [user.email, user.phone, user.username, user.clienteId].filter(Boolean).join(" · ");

  return `
    <section
      class="cli-create-selected-user cli-create-target-user inc-create-selected-user inc-create-target-user"
      data-create-selected-user="true"
      data-user-id="${attr(user.userId || user.id)}"
      data-user-cliente-id="${attr(user.targetClienteId || user.clienteId || "") }"
      data-cliente-id="${attr(user.targetClienteId || user.clienteId || "") }"
    >
      <div class="cli-create-selected-user-main cli-create-target-user-main inc-create-selected-user-main inc-create-target-user-main" data-create-selected-user-main="true">
        ${renderUserAvatar(user, "cli-create-target-user-avatar inc-create-target-user-avatar")}
        <span class="cli-create-selected-user-copy cli-create-target-user-copy inc-create-selected-user-copy inc-create-target-user-copy">
          <strong>${escapeHtml(user.displayName || "Usuario seleccionado")}</strong>
          <span>${escapeHtml(subtitle || user.userId || "Usuario seleccionado")}</span>
        </span>
      </div>

      <button
        type="button"
        class="cli-create-selected-user-clear cli-create-target-user-clear inc-create-selected-user-clear inc-create-target-user-clear"
        data-create-action="${CREATE_ACTIONS.USER_CLEAR}"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
        Quitar
      </button>
    </section>
  `;
}

function renderUserSearchResults(vm = {}) {
  const search = vm.userSearch;

  if (search.loading) {
    return `
      <div class="cli-create-user-search-state cli-create-search-state inc-create-user-search-state inc-create-search-state" data-user-search-state="loading" aria-live="polite">
        <span class="cli-create-spinner inc-create-spinner" aria-hidden="true"></span>
        <span>Buscando usuarios...</span>
      </div>
    `;
  }

  if (search.error) {
    return `
      <div class="cli-create-user-search-state cli-create-search-state inc-create-user-search-state inc-create-search-state is-error" data-user-search-state="error" role="alert">
        ${escapeHtml(search.error)}
      </div>
    `;
  }

  if (search.empty) {
    return `
      <div class="cli-create-user-search-state cli-create-search-state inc-create-user-search-state inc-create-search-state" data-user-search-state="empty" aria-live="polite">
        No hay usuarios para esta búsqueda.
      </div>
    `;
  }

  if (!search.results.length) return "";

  return `
    <div class="cli-create-user-results cli-create-search-results inc-create-user-results inc-create-search-results" role="listbox" data-create-user-results="true" aria-label="Resultados de búsqueda de usuarios">
      ${search.results.map((user) => {
        const item = normalizeUserResult(user);
        const subtitle = [item.email, item.phone, item.username, item.role, item.clienteId].filter(Boolean).join(" · ");

        return `
          <button
            type="button"
            class="cli-create-user-result cli-create-search-item inc-create-user-result inc-create-search-item"
            role="option"
            data-create-action="${CREATE_ACTIONS.USER_SELECT}"
            data-user-id="${attr(item.userId || item.id)}"
            data-user-cliente-id="${attr(item.targetClienteId || item.clienteId || "") }"
            data-cliente-id="${attr(item.targetClienteId || item.clienteId || "") }"
            data-user-name="${attr(item.displayName)}"
            data-user-email="${attr(item.email)}"
            data-email="${attr(item.email)}"
            data-user-phone="${attr(item.phone)}"
            data-user-username="${attr(item.username)}"
            data-user-avatar="${attr(item.avatarUrl)}"
            ${disabledAttrs(vm.submitting, vm.submitting)}
          >
            ${renderUserAvatar(item)}
            <span class="cli-create-user-result-copy cli-create-search-item-copy inc-create-user-result-copy inc-create-search-item-copy">
              <strong>${escapeHtml(item.displayName)}</strong>
              <span>${escapeHtml(subtitle || item.userId || item.id)}</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderAdminUserSearch(vm = {}) {
  if (!vm.admin) return "";

  return `
    <section
      class="cli-create-block cli-create-block--user-search cli-create-block--target inc-create-block inc-create-block--user-search inc-create-block--target"
      data-create-admin-user-search="true"
      data-user-search-active="${vm.userSearch.query ? "true" : "false"}"
      data-user-selected="${vm.form.targetUserId ? "true" : "false"}"
    >
      <div class="cli-create-block-head inc-create-block-head">
        <div>
          <strong>Usuario vinculado</strong>
          <span>Busca el usuario real para crear el cliente 1:1 contra Cosmos.</span>
        </div>
      </div>

      <div class="cli-create-selected-user-slot inc-create-selected-user-slot" data-create-selected-user-slot="true">
        ${renderSelectedUser(vm)}
      </div>

      <label class="cli-create-field inc-create-field" data-create-field="targetUserSearch">
        <span class="cli-create-label inc-create-label">Buscar usuario</span>
        <span class="cli-create-search-control cli-create-search-input-wrap inc-create-search-control inc-create-search-input-wrap">
          <span class="cli-create-search-icon cli-create-search-input-icon inc-create-search-icon inc-create-search-input-icon" aria-hidden="true">${icon("search")}</span>
          <input
            class="cli-create-input cli-create-input--with-icon cli-create-user-search-input inc-create-input inc-create-input--with-icon inc-create-user-search-input"
            data-field="targetUserSearch"
            data-create-user-search-input="true"
            name="targetUserSearch"
            type="search"
            value="${attr(vm.userSearch.query)}"
            placeholder="Nombre, usuario, email o ID"
            autocomplete="off"
            spellcheck="false"
            aria-autocomplete="list"
            aria-expanded="${vm.userSearch.results.length ? "true" : "false"}"
            ${disabledAttrs(vm.submitting, vm.submitting)}
          >
        </span>
      </label>

      <input type="hidden" data-field="targetUserId" name="targetUserId" value="${attr(vm.form.targetUserId)}">
      <input type="hidden" data-field="userId" name="userId" value="${attr(vm.form.userId || vm.form.targetUserId)}">
      <input type="hidden" data-field="targetClienteId" name="targetClienteId" value="${attr(vm.form.targetClienteId)}">
      <input type="hidden" data-field="targetUserName" name="targetUserName" value="${attr(vm.form.targetUserName)}">
      <input type="hidden" data-field="targetUserEmail" name="targetUserEmail" value="${attr(vm.form.targetUserEmail)}">
      <input type="hidden" data-field="targetUserPhone" name="targetUserPhone" value="${attr(vm.form.targetUserPhone)}">
      <input type="hidden" data-field="targetUsername" name="targetUsername" value="${attr(vm.form.targetUsername)}">
      <input type="hidden" data-field="targetUserAvatar" name="targetUserAvatar" value="${attr(vm.form.targetUserAvatar)}">

      <div class="cli-create-user-search-slot inc-create-user-search-slot" data-create-user-search-slot="true">
        ${renderUserSearchResults(vm)}
      </div>

      <div class="cli-create-target-error-slot inc-create-target-error-slot">
        ${renderFieldError(vm.errors.userId || vm.errors.targetUserId || vm.errors.targetUser)}
      </div>
    </section>
  `;
}

function renderFiscalBlock(vm = {}) {
  const form = vm.form;

  return renderBlock(
    "Datos fiscales",
    "Identidad del cliente y tipo de documento.",
    `
      <input type="hidden" data-field="source" name="source" value="${attr(form.source || "panel_admin")}">
      <input type="hidden" data-field="active" name="active" value="true">
      <input type="hidden" data-field="status" name="status" value="active">
      <input type="hidden" data-field="estado" name="estado" value="activo">
      <input type="hidden" data-field="clienteTipo" name="clienteTipo" value="${attr(form.tipo)}">
      <input type="hidden" data-field="segmento" name="segmento" value="${attr(form.tipo)}">

      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderSelect({
          label: "Tipo de cliente",
          name: "tipo",
          value: form.tipo,
          options: CLIENTE_TYPE_OPTIONS,
          required: true,
          error: vm.errors.tipo,
          disabled: vm.submitting,
        })}

        ${renderInput({
          label: form.tipo === "empresa" ? "NIF / CIF" : "NIF / DNI",
          name: "nif",
          value: form.nif,
          placeholder: "Ej. B22627012",
          error: vm.errors.nif,
          disabled: vm.submitting,
          maxLength: "20",
        })}
      </div>

      ${renderInput({
        label: form.tipo === "empresa" ? "Nombre fiscal / Razón social" : "Nombre completo fiscal",
        name: "nombreFiscal",
        value: form.nombreFiscal,
        placeholder: form.tipo === "empresa" ? "Ej. EFC SYSTEMS AUTOMOTIVE IBERICA SL" : "Ej. Javier Harandou",
        required: true,
        error: vm.errors.nombreFiscal,
        disabled: vm.submitting,
        iconName: form.tipo === "empresa" ? "building" : "user",
        maxLength: "150",
      })}

      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderInput({
          label: "Nombre comercial",
          name: "nombreComercial",
          value: form.nombreComercial,
          placeholder: "Nombre visible en panel",
          error: vm.errors.nombreComercial,
          disabled: vm.submitting,
          maxLength: "150",
        })}

        ${renderInput({
          label: "Slug / usuario",
          name: "slug",
          value: form.slug,
          placeholder: "efc-systems",
          error: vm.errors.slug,
          disabled: vm.submitting,
          maxLength: "64",
        })}
      </div>
    `,
    "cli-create-block--fiscal inc-create-block--fiscal"
  );
}

function renderContactBlock(vm = {}) {
  const form = vm.form;

  return renderBlock(
    "Contacto principal",
    "Datos visibles para soporte, facturación y acceso rápido desde la tabla.",
    `
      ${renderInput({
        label: "Nombre de contacto",
        name: "contactoNombre",
        value: form.contactoNombre,
        placeholder: "Ej. Javier Harandou",
        required: true,
        error: vm.errors.contactoNombre,
        disabled: vm.submitting,
        iconName: "user",
        maxLength: "150",
      })}

      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderInput({
          label: "Email",
          name: "contactoEmail",
          value: form.contactoEmail,
          placeholder: "cliente@empresa.com",
          type: "email",
          required: true,
          error: vm.errors.contactoEmail,
          disabled: vm.submitting,
          autocomplete: "email",
          iconName: "mail",
          maxLength: "150",
        })}

        ${renderInput({
          label: "Teléfono",
          name: "contactoPhone",
          value: form.contactoPhone,
          placeholder: "+34 600 000 000",
          type: "tel",
          error: vm.errors.contactoPhone,
          disabled: vm.submitting,
          autocomplete: "tel",
          inputmode: "tel",
          iconName: "phone",
          maxLength: "30",
        })}
      </div>

      <input type="hidden" data-field="email" name="email" value="${attr(form.contactoEmail)}">
      <input type="hidden" data-field="emailCliente" name="emailCliente" value="${attr(form.contactoEmail)}">
      <input type="hidden" data-field="phone" name="phone" value="${attr(form.contactoPhone)}">
      <input type="hidden" data-field="telefono" name="telefono" value="${attr(form.contactoPhone)}">
      <input type="hidden" data-field="username" name="username" value="${attr(form.username)}">
    `,
    "cli-create-block--contact inc-create-block--contact"
  );
}

function renderAddressBlock(vm = {}) {
  const form = vm.form;

  return renderBlock(
    "Dirección",
    "Dirección fiscal y de servicio. Se replica en direccionFiscal/direccionServicio.",
    `
      ${renderInput({
        label: "Calle y número",
        name: "calle",
        value: form.calle,
        placeholder: "C/ Marqués de San Esteban 2 Centro",
        error: vm.errors.calle,
        disabled: vm.submitting,
        iconName: "location",
        maxLength: "150",
      })}

      ${renderInput({
        label: "Línea 2",
        name: "linea2",
        value: form.linea2,
        placeholder: "Piso, puerta, nave, departamento...",
        error: vm.errors.linea2,
        disabled: vm.submitting,
        maxLength: "150",
      })}

      <div class="cli-create-grid cli-create-grid--3 inc-create-grid inc-create-grid--3">
        ${renderInput({
          label: "CP",
          name: "cp",
          value: form.cp,
          placeholder: "33206",
          error: vm.errors.cp,
          disabled: vm.submitting,
          inputmode: "numeric",
          maxLength: "10",
        })}

        ${renderInput({
          label: "Ciudad",
          name: "ciudad",
          value: form.ciudad,
          placeholder: "Gijón",
          error: vm.errors.ciudad,
          disabled: vm.submitting,
          maxLength: "100",
        })}

        ${renderInput({
          label: "Provincia",
          name: "provincia",
          value: form.provincia,
          placeholder: "Asturias",
          error: vm.errors.provincia,
          disabled: vm.submitting,
          maxLength: "100",
        })}
      </div>

      ${renderSelect({
        label: "País",
        name: "pais",
        value: form.pais,
        options: COUNTRY_OPTIONS,
        required: true,
        error: vm.errors.pais,
        disabled: vm.submitting,
      })}
    `,
    "cli-create-block--address inc-create-block--address"
  );
}

function renderBillingBlock(vm = {}) {
  const form = vm.form;

  return renderBlock(
    "Facturación",
    "IVA, IRPF, cuenta de pago y términos por defecto.",
    `
      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderCheckbox({
          label: "Facturación activa",
          name: "billingEnabled",
          checked: form.billingEnabled,
          help: "Permite emitir facturas vinculadas al cliente.",
          disabled: vm.submitting,
        })}

        ${renderCheckbox({
          label: "Requiere factura",
          name: "requiresInvoice",
          checked: form.requiresInvoice,
          help: "Marca el cliente como facturable por defecto.",
          disabled: vm.submitting,
        })}
      </div>

      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderCheckbox({
          label: "Aplicar IVA",
          name: "aplicaIVA",
          checked: form.aplicaIVA,
          help: "Por defecto 21%.",
          disabled: vm.submitting,
        })}

        ${renderCheckbox({
          label: "Aplicar IRPF",
          name: "aplicaIRPF",
          checked: form.aplicaIRPF,
          help: "Por defecto 7% para este esquema.",
          disabled: vm.submitting,
        })}
      </div>

      <div class="cli-create-grid cli-create-grid--3 inc-create-grid inc-create-grid--3">
        ${renderInput({
          label: "IVA %",
          name: "porcentajeIVA",
          value: String(form.porcentajeIVA),
          placeholder: "21",
          type: "number",
          error: vm.errors.porcentajeIVA,
          disabled: vm.submitting,
          inputmode: "decimal",
        })}

        ${renderInput({
          label: "IRPF %",
          name: "porcentajeIRPF",
          value: String(form.porcentajeIRPF),
          placeholder: "7",
          type: "number",
          error: vm.errors.porcentajeIRPF,
          disabled: vm.submitting,
          inputmode: "decimal",
        })}

        ${renderInput({
          label: "Pago días",
          name: "paymentTermsDays",
          value: String(form.paymentTermsDays),
          placeholder: "30",
          type: "number",
          error: vm.errors.paymentTermsDays,
          disabled: vm.submitting,
          inputmode: "numeric",
        })}
      </div>

      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderSelect({
          label: "Forma de pago",
          name: "formaPagoDefault",
          value: form.formaPagoDefault,
          options: PAYMENT_METHOD_OPTIONS,
          required: true,
          error: vm.errors.formaPagoDefault,
          disabled: vm.submitting,
        })}

        ${renderInput({
          label: "Email facturación",
          name: "emailFacturacion",
          value: form.emailFacturacion,
          placeholder: "facturacion@empresa.com",
          type: "email",
          error: vm.errors.emailFacturacion,
          disabled: vm.submitting,
          autocomplete: "email",
          iconName: "mail",
          maxLength: "150",
        })}
      </div>

      ${renderInput({
        label: "Cuenta de pago",
        name: "cuentaPagoDefault",
        value: form.cuentaPagoDefault,
        placeholder: "ES00 0000 0000 00 0000000000",
        error: vm.errors.cuentaPagoDefault,
        disabled: vm.submitting,
        iconName: "euro",
        maxLength: "80",
      })}

      <input type="hidden" data-field="currency" name="currency" value="${attr(form.currency)}">
      <input type="hidden" data-field="moneda" name="moneda" value="${attr(form.moneda)}">
      <input type="hidden" data-field="metodoPagoDefault" name="metodoPagoDefault" value="${attr(form.metodoPagoDefault)}">
      <input type="hidden" data-field="invoiceLanguage" name="invoiceLanguage" value="${attr(form.invoiceLanguage)}">
    `,
    "cli-create-block--billing inc-create-block--billing"
  );
}

function renderAlert(type = "info", title = "", body = "") {
  const safeTitle = cleanText(title, "");
  const safeBody = cleanText(body, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="cli-create-alert inc-create-alert is-${attr(type)}" role="${type === "error" ? "alert" : "status"}">
      <span class="cli-create-alert-icon inc-create-alert-icon">${type === "success" ? icon("check") : type === "error" ? icon("alert") : icon("client")}</span>
      <span class="cli-create-alert-copy inc-create-alert-copy">
        ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
        ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
      </span>
    </div>
  `;
}

function renderLoadingOverlay(label = "Creando cliente...") {
  return `
    <div class="cli-create-loading-overlay inc-create-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="cli-create-loading-card inc-create-loading-card">
        <span class="cli-create-loading-spinner inc-create-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderClientesCreateModal(input = {}) {
  const vm = buildVm(input);

  if (!vm.open) return "";

  return `
    <section
      id="${MODAL_ID}"
      data-clientes-create-root="true"
      data-clientes-modal="create"
      data-open="true"
      class="cli-create-root inc-create-root"
      role="presentation"
    >
      <div class="cli-create-overlay inc-create-overlay" data-clientes-create-modal-overlay="true">
        <div
          id="${PANEL_ID}"
          data-clientes-create-modal-panel="true"
          class="cli-create-panel inc-create-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clientes-create-title"
          tabindex="-1"
        >
          <header class="cli-create-header inc-create-header">
            <div class="cli-create-title-wrap inc-create-title-wrap">
              <span class="cli-create-title-icon inc-create-title-icon">${icon("client")}</span>
              <div>
                <h2 id="clientes-create-title">Crear cliente</h2>
                <p>Contrato 1:1 con Cosmos · cliente schemaVersion 2.</p>
              </div>
            </div>
            <button
              type="button"
              class="cli-create-close inc-create-close"
              data-create-action="${CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              ${icon("close")}
            </button>
          </header>

          <div class="cli-create-body inc-create-body">
            ${vm.successMessage ? renderAlert("success", "Cliente creado.", vm.successMessage) : ""}
            ${vm.serverError ? renderAlert("error", "No se pudo crear el cliente.", vm.serverError) : ""}

            <form
              id="${FORM_ID}"
              data-clientes-create-form="true"
              novalidate
              class="cli-create-form inc-create-form"
            >
              ${renderAdminUserSearch(vm)}
              ${renderFiscalBlock(vm)}
              ${renderContactBlock(vm)}
              ${renderAddressBlock(vm)}
              ${renderBillingBlock(vm)}

              <div class="cli-create-actions inc-create-actions">
                <button
                  id="clientes-create-submit-btn"
                  type="submit"
                  data-create-action="${CREATE_ACTIONS.SUBMIT}"
                  ${disabledAttrs(vm.submitting, vm.submitting)}
                  class="cli-create-submit inc-create-submit"
                >
                  <span class="cli-create-submit-inner inc-create-submit-inner">
                    ${vm.submitting ? `<span class="cli-create-spinner inc-create-spinner" aria-hidden="true"></span>Creando...` : "Crear cliente"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          ${vm.submitting ? renderLoadingOverlay("Creando cliente y sincronizando usuario...") : ""}
        </div>
      </div>
    </section>
  `;
}

export function renderClientesCreateModalClosed() {
  return "";
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getCreateFormDefaults() {
  return {
    ...DEFAULT_FORM,
  };
}

export function validateCreateForm(form = {}) {
  const current = normalizeForm(form);
  const errors = {};

  if (!current.userId) {
    errors.userId = "Selecciona un usuario real antes de crear el cliente.";
    errors.targetUserId = errors.userId;
  }

  if (!CLIENTE_TYPE_OPTIONS.some((item) => item.value === current.tipo)) {
    errors.tipo = "Selecciona un tipo de cliente válido.";
  }

  if (!current.nombreFiscal) {
    errors.nombreFiscal = "El nombre fiscal es obligatorio.";
  } else if (current.nombreFiscal.length < 3) {
    errors.nombreFiscal = "Mínimo 3 caracteres.";
  }

  if (current.nif && current.nif.length < 5) {
    errors.nif = "El NIF/CIF parece demasiado corto.";
  }

  if (!current.contactoNombre) {
    errors.contactoNombre = "El contacto principal es obligatorio.";
  }

  if (!current.contactoEmail) {
    errors.contactoEmail = "El email de contacto es obligatorio.";
  } else if (!isValidEmail(current.contactoEmail)) {
    errors.contactoEmail = "Introduce un email válido.";
  }

  if (current.emailFacturacion && !isValidEmail(current.emailFacturacion)) {
    errors.emailFacturacion = "Introduce un email de facturación válido.";
  }

  if (current.cp && current.cp.length < 4) {
    errors.cp = "El código postal parece incompleto.";
  }

  if (current.porcentajeIVA < 0 || current.porcentajeIVA > 100) {
    errors.porcentajeIVA = "El IVA debe estar entre 0 y 100.";
  }

  if (current.porcentajeIRPF < 0 || current.porcentajeIRPF > 100) {
    errors.porcentajeIRPF = "El IRPF debe estar entre 0 y 100.";
  }

  if (current.paymentTermsDays < 0 || current.paymentTermsDays > 365) {
    errors.paymentTermsDays = "Los días de pago deben estar entre 0 y 365.";
  }

  const payload = buildClienteCreatePayload(current);

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: current,
    payload,
  };
}

export function getCreateTemplateSnapshot() {
  return {
    version: CLIENTES_CREATE_TEMPLATE_VERSION,
    actions: CREATE_ACTIONS,
    fields: [
      "targetUserSearch",
      "targetUserId",
      "userId",
      "targetClienteId",
      "targetUserName",
      "targetUserEmail",
      "targetUserPhone",
      "targetUsername",
      "targetUserAvatar",
      "tipo",
      "clienteTipo",
      "segmento",
      "nombreFiscal",
      "razonSocial",
      "empresa",
      "nombreComercial",
      "displayName",
      "nif",
      "vatNumber",
      "taxId",
      "contactoNombre",
      "contactoEmail",
      "contactoPhone",
      "email",
      "emailCliente",
      "emailFacturacion",
      "phone",
      "telefono",
      "username",
      "slug",
      "calle",
      "linea2",
      "cp",
      "ciudad",
      "provincia",
      "pais",
      "billingEnabled",
      "currency",
      "moneda",
      "aplicaIVA",
      "porcentajeIVA",
      "aplicaIRPF",
      "porcentajeIRPF",
      "formaPagoDefault",
      "metodoPagoDefault",
      "cuentaPagoDefault",
      "requiresInvoice",
      "invoiceLanguage",
      "paymentTermsDays",
      "source",
      "active",
      "status",
      "estado",
    ],
    admin: {
      userSearch: true,
      userSearchMinLength: USER_SEARCH_MIN_LENGTH,
      actionSearch: CREATE_ACTIONS.USER_SEARCH,
      actionSelect: CREATE_ACTIONS.USER_SELECT,
      actionClear: CREATE_ACTIONS.USER_CLEAR,
      preservesTargetClienteId: true,
      requiresUserId: true,
      doesNotInventUserId: true,
    },
    cosmos: {
      entityType: "cliente",
      tipoDocumento: "cliente",
      schemaVersion: 2,
      versionEsquema: 2,
      buildsContacto: true,
      buildsDireccionFiscal: true,
      buildsDireccionServicio: true,
      buildsBilling: true,
      buildsFacturacion: true,
      buildsPrivacy: true,
      buildsStats: true,
      buildsSearch: true,
      container: "clientes",
    },
    policy: {
      templateOnly: true,
      modalIslandReady: true,
      stableSlots: true,
      createPayloadCompatible: true,
      hiddenTargetFields: true,
      adminUserSearchOnly: true,
      backendRouteCompatible: true,
      requiredBackendFields: ["userId", "tipo", "nombreFiscal"],
      noFetch: true,
      noDom: true,
      noStore: true,
    },
  };
}

export const validateCreateClienteForm = validateCreateForm;
export const getClientesCreateFormDefaults = getCreateFormDefaults;
export const renderCreateClienteModal = renderClientesCreateModal;
export const renderClienteCreateModal = renderClientesCreateModal;
export const renderCreateModal = renderClientesCreateModal;

export default renderClientesCreateModal;


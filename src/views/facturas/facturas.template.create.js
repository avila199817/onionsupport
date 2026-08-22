/* =========================================================
   Onion Support - Facturas Create Template
   Archivo: /src/views/facturas/facturas.template.create.js

   PRODUCTIVO · TAX PROFILE AWARE · V6

   Política de negocio de Onion Support:
   - Particular: IVA 21 %, IRPF 0 %.
   - Empresa / profesional / autónomo: IVA 21 %, IRPF 7 %.
   - El tipo explícito de cliente manda sobre el identificador fiscal.
   - Si falta el tipo, un NIF/CIF jurídico puede identificar empresa.
   - Si no hay evidencia empresarial, fallback seguro: sin IRPF.

   Template puro: sin HTTP, Router, Store, listeners ni DOM API.
========================================================= */

export const FACTURAS_CREATE_TEMPLATE_VERSION =
  "facturas.template.create.v6.tax-profile-aware";

export const FACTURA_CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  SUBMIT: "create-submit",
  CLIENT_SELECT: "create-client-select",
  CLIENT_REMOVE: "create-client-remove",
  CLIENT_PRIMARY: "create-client-primary",
  CLIENT_CLEAR: "create-client-clear",
  TICKET_SELECT: "create-ticket-select",
  TICKET_REMOVE: "create-ticket-remove",
  TICKET_PRIMARY: "create-ticket-primary",
  TICKET_CLEAR: "create-ticket-clear",
  TICKET_REFRESH: "create-ticket-refresh",
});

const MODAL_ID = "facturas-create-modal-root";
const PANEL_ID = "facturas-create-modal-panel";
const FORM_ID = "facturas-create-form";

const DEFAULT_IVA_RATE = 21;
const DEFAULT_IRPF_RATE = 7;

const PARTICULAR_TYPES = new Set([
  "particular",
  "persona",
  "persona_fisica",
  "individual",
  "b2c",
  "consumer",
  "cliente_particular",
]);

const BUSINESS_TYPES = new Set([
  "empresa",
  "company",
  "business",
  "b2b",
  "autonomo",
  "profesional",
  "professional",
  "sociedad",
  "corporate",
]);

const PAYMENT_OPTIONS = Object.freeze([
  { value: "transferencia bancaria", label: "Transferencia bancaria" },
  { value: "efectivo", label: "Efectivo" },
]);

const PAYMENT_STATUS_OPTIONS = Object.freeze([
  { value: "pendiente", label: "Pendiente" },
  { value: "pagada", label: "Pagada" },
]);

const DEFAULT_FORM = Object.freeze({
  concepto: "Servicios de soporte y asistencia técnica informática",
  descripcion: "",
  cantidad: 1,
  precioUnitario: 20,
  fechaServicio: "",
  formaPago: "transferencia bancaria",
  estadoPago: "pendiente",
  sendEmail: true,

  clienteId: "",
  clienteUserId: "",
  clienteNombre: "",
  clienteEmail: "",
  clienteAvatar: "",
  clienteTipo: "",
  clienteNif: "",
  clienteEsEmpresa: null,
  aplicaIrpf: null,

  ticketId: "",
  incidenciaId: "",
  incidenciaSubject: "",
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
  return Array.isArray(value) ? value : [];
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
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return fallback;

  let raw = String(value)
    .trim()
    .replace(/[€$£¥%]/g, "")
    .replace(/[^\d.,+\-\s]/g, "")
    .replace(/\s+/g, "");

  if (!raw || raw === "+" || raw === "-") return fallback;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    raw = comma > dot
      ? raw.replace(/\./g, "").replace(/,/g, ".")
      : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    raw = raw.replace(/,/g, ".");
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value = 0) {
  const parsed = number(value, 0);
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
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

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const key = normalizeKey(value);
  if (["true", "yes", "si", "on", "enabled", "active"].includes(key)) return true;
  if (["false", "no", "off", "disabled", "inactive"].includes(key)) return false;

  return fallback;
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseBoolean(value, null);
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

function todayInputValue() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw) || hasSensitiveQuery(raw)) return "";
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (!/^https:\/\//i.test(raw)) return "";

  try {
    return new URL(raw).href;
  } catch {
    return "";
  }
}

function formatMoney(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number(value, 0));
  } catch {
    return `${number(value, 0).toFixed(2).replace(".", ",")} €`;
  }
}

function initialsFrom(value = "", fallback = "CL") {
  const parts = cleanText(value, fallback).split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase() || fallback;
}

function icon(name = "") {
  const common =
    'aria-hidden="true" focusable="false" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

  const paths = {
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.7-4M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4M20 20v-5h-5"/>',
    ticket: '<path d="M4 6h16v12H4z"/><path d="M8 6v12M16 6v12"/>',
  };

  return `<svg ${common}>${paths[name] || paths.check}</svg>`;
}

/* =========================================================
   TAX PROFILE
========================================================= */

function looksLikeBusinessTaxId(value = "") {
  const taxId = cleanText(value, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!taxId) return false;

  // Persona jurídica / entidad. DNI y NIE de particular quedan fuera.
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(taxId);
}

export function getFacturaCreateTaxProfile(source = {}) {
  const raw = safeObject(source);

  const type = normalizeKey(
    first(
      raw.clienteTipo,
      raw.tipo,
      raw.type,
      raw.clienteType,
      raw.segmento,
      raw.segment,
      raw.profile?.tipo,
      ""
    )
  );

  const nif = cleanText(
    first(raw.clienteNif, raw.nif, raw.cif, raw.taxId, raw.vatId, ""),
    ""
  ).toUpperCase();

  // La clasificación explícita tiene prioridad absoluta.
  if (PARTICULAR_TYPES.has(type)) {
    return {
      type: "particular",
      sourceType: type,
      nif,
      isBusiness: false,
      aplicaIrpf: false,
      ivaRate: DEFAULT_IVA_RATE,
      irpfRate: 0,
      label: "Particular · Solo IVA",
      detail: "IVA 21 % · IRPF no aplica",
      source: "tipo",
    };
  }

  if (BUSINESS_TYPES.has(type)) {
    return {
      type: type === "autonomo" ? "autonomo" : "empresa",
      sourceType: type,
      nif,
      isBusiness: true,
      aplicaIrpf: true,
      ivaRate: DEFAULT_IVA_RATE,
      irpfRate: DEFAULT_IRPF_RATE,
      label: "Empresa / profesional · IVA + IRPF",
      detail: "IVA 21 % · IRPF 7 %",
      source: "tipo",
    };
  }

  const explicitIrpf = parseOptionalBoolean(
    first(raw.aplicaIrpf, raw.applyIrpf, raw.retencionIrpf, raw.withholdingIrpf, null)
  );

  if (explicitIrpf !== null) {
    return {
      type: explicitIrpf ? "empresa" : "particular",
      sourceType: type,
      nif,
      isBusiness: explicitIrpf,
      aplicaIrpf: explicitIrpf,
      ivaRate: DEFAULT_IVA_RATE,
      irpfRate: explicitIrpf ? DEFAULT_IRPF_RATE : 0,
      label: explicitIrpf
        ? "Empresa / profesional · IVA + IRPF"
        : "Particular · Solo IVA",
      detail: explicitIrpf ? "IVA 21 % · IRPF 7 %" : "IVA 21 % · IRPF no aplica",
      source: "explicit",
    };
  }

  const explicitBusiness = parseOptionalBoolean(
    first(raw.clienteEsEmpresa, raw.esEmpresa, raw.isCompany, raw.business, null)
  );

  if (explicitBusiness !== null) {
    return {
      type: explicitBusiness ? "empresa" : "particular",
      sourceType: type,
      nif,
      isBusiness: explicitBusiness,
      aplicaIrpf: explicitBusiness,
      ivaRate: DEFAULT_IVA_RATE,
      irpfRate: explicitBusiness ? DEFAULT_IRPF_RATE : 0,
      label: explicitBusiness
        ? "Empresa / profesional · IVA + IRPF"
        : "Particular · Solo IVA",
      detail: explicitBusiness ? "IVA 21 % · IRPF 7 %" : "IVA 21 % · IRPF no aplica",
      source: "business-flag",
    };
  }

  if (looksLikeBusinessTaxId(nif)) {
    return {
      type: "empresa",
      sourceType: type,
      nif,
      isBusiness: true,
      aplicaIrpf: true,
      ivaRate: DEFAULT_IVA_RATE,
      irpfRate: DEFAULT_IRPF_RATE,
      label: "Empresa · IVA + IRPF",
      detail: "IVA 21 % · IRPF 7 %",
      source: "nif-juridico",
    };
  }

  // Fallback conservador: nunca cargar IRPF a un particular/no clasificado.
  return {
    type: type || "particular",
    sourceType: type,
    nif,
    isBusiness: false,
    aplicaIrpf: false,
    ivaRate: DEFAULT_IVA_RATE,
    irpfRate: 0,
    label: type ? "Particular · Solo IVA" : "Solo IVA · Perfil no empresarial",
    detail: "IVA 21 % · IRPF no aplica",
    source: "safe-default",
  };
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeClient(item = {}) {
  const raw = safeObject(item);

  const id = cleanText(
    first(raw.clienteId, raw.clientId, raw.customerId, raw.id, raw.userId, raw.username),
    ""
  );

  const name = cleanText(
    first(
      raw.name,
      raw.nombre,
      raw.displayName,
      raw.nombreContacto,
      raw.razonSocial,
      raw.companyName,
      raw.empresa,
      raw.username
    ),
    id ? `Cliente ${id}` : "Cliente"
  );

  const email = cleanText(
    first(raw.email, raw.mail, raw.emailCliente, raw.clienteEmail, raw.clientEmail, raw.emailLower),
    ""
  ).toLowerCase();

  const userId = cleanText(first(raw.userId, raw.usuarioId, raw.uid, raw.id), "");
  const clienteId = cleanText(first(raw.clienteId, raw.clientId, raw.customerId, id), id);
  const tipo = cleanText(first(raw.clienteTipo, raw.tipo, raw.type, raw.clienteType, raw.segmento), "");
  const nif = cleanText(first(raw.nif, raw.cif, raw.taxId, raw.vatId), "").toUpperCase();

  const avatarUrl = safeImageSrc(
    first(
      raw.avatarUrl,
      raw.avatar,
      raw.logoUrl,
      raw.logo,
      raw.photoUrl,
      raw.picture,
      raw.userAvatarUrl,
      raw.clientAvatarUrl,
      raw.profile?.avatarUrl
    )
  );

  const normalized = {
    ...raw,
    id,
    clienteId,
    clientId: clienteId,
    userId,
    name,
    nombre: name,
    displayName: name,
    nombreContacto: cleanText(first(raw.nombreContacto, raw.contactName, name), name),
    razonSocial: cleanText(first(raw.razonSocial, raw.companyName, raw.empresa, name), name),
    email,
    telefono: cleanText(first(raw.telefono, raw.phone, raw.mobile, raw.movil), ""),
    nif,
    cif: cleanText(first(raw.cif, nif), nif),
    tipo,
    type: tipo,
    clienteTipo: tipo,
    username: cleanText(first(raw.username, raw.slug, email ? email.split("@")[0] : ""), ""),
    avatarUrl,
    avatar: avatarUrl,
    initials: initialsFrom(name, "CL"),
  };

  const taxProfile = getFacturaCreateTaxProfile(normalized);

  return {
    ...normalized,
    clienteEsEmpresa: taxProfile.isBusiness,
    aplicaIrpf: taxProfile.aplicaIrpf,
    taxProfile,
    subtitle: cleanText(
      first(
        email,
        raw.razonSocial && raw.razonSocial !== name ? raw.razonSocial : "",
        nif,
        clienteId || userId
      ),
      clienteId || userId || id
    ),
  };
}

function normalizeTicket(item = {}) {
  const raw = safeObject(item);
  const id = cleanText(first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero), "");
  const subject = cleanText(
    first(raw.subject, raw.asunto, raw.title, raw.name, raw.preview, raw.description),
    id || "Incidencia"
  );
  const status = cleanText(first(raw.status, raw.estado, raw.state), "");
  const category = cleanText(first(raw.category, raw.categoria, raw.tipo), "");

  return {
    ...raw,
    id,
    ticketId: id,
    incidenciaId: id,
    subject,
    asunto: subject,
    title: subject,
    clienteId: cleanText(first(raw.clienteId, raw.clientId, raw.cliente?.clienteId), ""),
    userId: cleanText(first(raw.userId, raw.usuarioId, raw.userRef?.userId), ""),
    status,
    estado: status,
    category,
    categoria: category,
    facturaLinked: Boolean(
      raw.facturaLinked ||
      raw.meta?.facturaLinked ||
      raw.meta?.hasFactura ||
      raw.facturaId ||
      raw.invoiceId
    ),
    subtitle: [
      status ? `Estado: ${status}` : "",
      category ? `Tipo: ${category}` : "",
      raw.facturaLinked || raw.meta?.hasFactura ? "Ya facturada" : "",
    ].filter(Boolean).join(" · ") || id,
  };
}

function enrichFormWithPrimaryClient(form = {}, selectedClientes = []) {
  const primary = safeArray(selectedClientes).length
    ? normalizeClient(selectedClientes[0])
    : null;

  if (!primary) return safeObject(form);

  return {
    ...safeObject(form),
    clienteId: cleanText(first(primary.clienteId, primary.id, form.clienteId), ""),
    clienteUserId: cleanText(first(primary.userId, form.clienteUserId), ""),
    clienteNombre: cleanText(first(primary.name, form.clienteNombre), ""),
    clienteEmail: cleanText(first(primary.email, form.clienteEmail), ""),
    clienteAvatar: safeImageSrc(first(primary.avatarUrl, primary.avatar, form.clienteAvatar)),
    clienteTipo: cleanText(first(primary.clienteTipo, primary.tipo, primary.type, form.clienteTipo), ""),
    clienteNif: cleanText(first(primary.nif, primary.cif, primary.taxId, form.clienteNif), "").toUpperCase(),
    clienteEsEmpresa: primary.taxProfile.isBusiness,
    aplicaIrpf: primary.taxProfile.aplicaIrpf,
  };
}

function normalizeForm(form = {}) {
  const input = {
    ...DEFAULT_FORM,
    fechaServicio: todayInputValue(),
    ...safeObject(form),
  };

  const clienteTipo = cleanText(
    first(input.clienteTipo, input.tipoCliente, input.tipo, input.type),
    ""
  );
  const clienteNif = cleanText(
    first(input.clienteNif, input.nif, input.cif, input.taxId),
    ""
  ).toUpperCase();

  const taxProfile = getFacturaCreateTaxProfile({
    ...input,
    clienteTipo,
    clienteNif,
  });

  return {
    concepto: cleanText(input.concepto, DEFAULT_FORM.concepto),
    descripcion: String(input.descripcion ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
    cantidad: number(input.cantidad, DEFAULT_FORM.cantidad),
    precioUnitario: number(input.precioUnitario, DEFAULT_FORM.precioUnitario),
    fechaServicio: cleanText(input.fechaServicio, todayInputValue()),
    formaPago: cleanText(input.formaPago, DEFAULT_FORM.formaPago),
    estadoPago: cleanText(input.estadoPago, DEFAULT_FORM.estadoPago),
    sendEmail: parseBoolean(input.sendEmail, true),

    clienteId: cleanText(input.clienteId, ""),
    clienteUserId: cleanText(input.clienteUserId, ""),
    clienteNombre: cleanText(input.clienteNombre, ""),
    clienteEmail: cleanText(input.clienteEmail, "").toLowerCase(),
    clienteAvatar: safeImageSrc(input.clienteAvatar),
    clienteTipo,
    clienteNif,
    clienteEsEmpresa: taxProfile.isBusiness,
    aplicaIrpf: taxProfile.aplicaIrpf,

    ticketId: cleanText(input.ticketId, ""),
    incidenciaId: cleanText(input.incidenciaId, ""),
    incidenciaSubject: cleanText(input.incidenciaSubject, ""),
  };
}

function getInvoiceBreakdown(form = {}) {
  const current = normalizeForm(form);
  const taxProfile = getFacturaCreateTaxProfile(current);

  const cantidad = Math.max(0, number(current.cantidad, 0));
  const precioUnitario = Math.max(0, number(current.precioUnitario, 0));
  const base = round2(cantidad * precioUnitario);

  const ivaRate = DEFAULT_IVA_RATE;
  const irpfRate = taxProfile.aplicaIrpf ? DEFAULT_IRPF_RATE : 0;
  const ivaTotal = round2(base * (ivaRate / 100));
  const irpfTotal = taxProfile.aplicaIrpf
    ? round2(-(base * (irpfRate / 100)))
    : 0;
  const totalFactura = round2(base + ivaTotal + irpfTotal);

  return {
    cantidad,
    precioUnitario,
    base,
    ivaRate,
    irpfRate,
    ivaTotal,
    irpfTotal,
    totalFactura,
    aplicaIrpf: taxProfile.aplicaIrpf,
    clienteEsEmpresa: taxProfile.isBusiness,
    taxProfile,
  };
}

function buildVm(input = {}) {
  const data = safeObject(input);
  const selectedClientes = safeArray(data.selectedClientes || data.clientes).map(normalizeClient);
  const selectedTickets = safeArray(data.selectedTickets || data.tickets || data.incidencias).map(normalizeTicket);
  const enrichedForm = enrichFormWithPrimaryClient(data.form || data.draft || {}, selectedClientes);
  const form = normalizeForm(enrichedForm);
  const breakdown = getInvoiceBreakdown(form);
  const primaryClient = selectedClientes[0] || null;

  const clientSearch = safeObject(data.clientSearch || data.clienteSearch);
  const ticketSearch = safeObject(data.ticketSearch || data.incidenciaSearch);

  return {
    open: data.open === true,
    canCreate: data.canCreate !== false && data.canCreateFactura !== false,
    submitting: data.submitting === true,
    serverError: cleanText(data.serverError, ""),
    successMessage: cleanText(data.successMessage, ""),
    errors: safeObject(data.errors),
    form,
    breakdown,
    taxProfile: primaryClient?.taxProfile || breakdown.taxProfile,
    primaryClient,
    selectedClientes,
    selectedTickets,
    clientSearch: {
      query: cleanText(clientSearch.query, ""),
      loading: clientSearch.loading === true,
      error: cleanText(clientSearch.error, ""),
      results: safeArray(clientSearch.results).map(normalizeClient),
      empty: clientSearch.empty === true,
    },
    ticketSearch: {
      query: cleanText(ticketSearch.query, ""),
      loading: ticketSearch.loading === true,
      error: cleanText(ticketSearch.error, ""),
      results: safeArray(ticketSearch.results).map(normalizeTicket),
      empty: ticketSearch.empty === true,
    },
  };
}

/* =========================================================
   RENDER HELPERS
========================================================= */

function renderSpinner(label = "Cargando...") {
  return `<span class="fac-create-loading"><span class="fac-create-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span></span>`;
}

function renderFieldError(message = "") {
  const text = cleanText(message, "");
  return text ? `<p class="fac-create-field-error" role="alert">${escapeHtml(text)}</p>` : "";
}

function renderAvatar(client = {}) {
  const current = normalizeClient(client);
  const src = safeImageSrc(current.avatarUrl);

  return `
    <span class="fac-create-avatar${src ? " has-image" : ""}" aria-hidden="true">
      ${src ? `<img src="${attr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      <span>${escapeHtml(current.initials)}</span>
    </span>
  `;
}

function renderTaxBadge(profile = {}) {
  const current = safeObject(profile);
  const business = current.aplicaIrpf === true;

  return `
    <span class="fac-create-tax-badge ${business ? "is-business" : "is-particular"}">
      ${icon("shield")}
      <span>${escapeHtml(current.label || (business ? "IVA + IRPF" : "Solo IVA"))}</span>
    </span>
  `;
}

function renderClientSearchResults(vm = {}) {
  const search = vm.clientSearch;
  if (search.loading) return `<div class="fac-create-search-state">${renderSpinner("Buscando clientes...")}</div>`;
  if (search.error) return `<div class="fac-create-search-state is-error">${escapeHtml(search.error)}</div>`;
  if (search.empty) return `<div class="fac-create-search-state">No hay clientes para esa búsqueda.</div>`;
  if (!search.results.length) return search.query.length >= 2
    ? `<div class="fac-create-search-state">No hay resultados todavía.</div>`
    : "";

  return `
    <div class="fac-create-search-results" role="listbox" aria-label="Resultados de clientes">
      ${search.results.map((client, index) => `
        <button
          type="button"
          class="fac-create-search-result"
          data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_SELECT}"
          data-client-index="${index}"
          role="option"
        >
          ${renderAvatar(client)}
          <span class="fac-create-result-copy">
            <strong>${escapeHtml(client.name)}</strong>
            <span>${escapeHtml(client.subtitle || client.clienteId || client.userId)}</span>
            <span class="fac-create-result-tax">${escapeHtml(client.taxProfile.detail)}</span>
          </span>
          <span class="fac-create-result-plus" aria-hidden="true">${icon("plus")}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderTicketSearchResults(vm = {}) {
  const search = vm.ticketSearch;
  if (!vm.selectedClientes.length) {
    return `<div class="fac-create-search-state">Selecciona primero el cliente principal.</div>`;
  }
  if (search.loading) return `<div class="fac-create-search-state">${renderSpinner("Cargando incidencias...")}</div>`;
  if (search.error) return `<div class="fac-create-search-state is-error">${escapeHtml(search.error)}</div>`;
  if (search.empty) return `<div class="fac-create-search-state">No hay incidencias disponibles para este cliente.</div>`;
  if (!search.results.length) return "";

  return `
    <div class="fac-create-search-results" role="listbox" aria-label="Resultados de incidencias">
      ${search.results.map((ticket, index) => `
        <button
          type="button"
          class="fac-create-search-result fac-create-search-result--ticket"
          data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_SELECT}"
          data-ticket-index="${index}"
          role="option"
        >
          <span class="fac-create-result-icon" aria-hidden="true">${icon("ticket")}</span>
          <span class="fac-create-result-copy">
            <strong>${escapeHtml(ticket.subject || ticket.id)}</strong>
            <span>${escapeHtml(ticket.subtitle || ticket.id)}</span>
          </span>
          <span class="fac-create-result-plus" aria-hidden="true">${icon("plus")}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderSelectedClientes(vm = {}) {
  if (!vm.selectedClientes.length) return "";

  return `
    <div class="fac-create-selected-stack">
      ${vm.selectedClientes.map((client, index) => `
        <article class="fac-create-selected-card${index === 0 ? " is-primary" : ""}">
          ${renderAvatar(client)}
          <div class="fac-create-selected-copy">
            <div class="fac-create-selected-top">
              <strong>${escapeHtml(client.name)}</strong>
              ${index === 0 ? `<span class="fac-create-selected-kicker">Principal</span>` : ""}
            </div>
            <span>${escapeHtml(client.email || client.clienteId || client.userId)}</span>
            <div class="fac-create-selected-fiscal">${renderTaxBadge(client.taxProfile)}</div>
          </div>
          <div class="fac-create-selected-actions">
            ${index > 0 ? `
              <button
                type="button"
                class="fac-create-chip-btn"
                data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_PRIMARY}"
                data-client-index="${index}"
              >Principal</button>
            ` : ""}
            <button
              type="button"
              class="fac-create-icon-btn"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_REMOVE}"
              data-client-index="${index}"
              aria-label="Quitar ${attr(client.name)}"
            >${icon("close")}</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSelectedTickets(vm = {}) {
  if (!vm.selectedTickets.length) return "";

  return `
    <div class="fac-create-selected-stack">
      ${vm.selectedTickets.map((ticket, index) => `
        <article class="fac-create-selected-card fac-create-selected-card--ticket${index === 0 ? " is-primary" : ""}">
          <span class="fac-create-result-icon" aria-hidden="true">${icon("ticket")}</span>
          <div class="fac-create-selected-copy">
            <div class="fac-create-selected-top">
              <strong>${escapeHtml(ticket.subject || ticket.id)}</strong>
              ${index === 0 ? `<span class="fac-create-selected-kicker">Principal</span>` : ""}
            </div>
            <span>${escapeHtml(ticket.id || ticket.ticketId)}</span>
          </div>
          <div class="fac-create-selected-actions">
            ${index > 0 ? `
              <button
                type="button"
                class="fac-create-chip-btn"
                data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_PRIMARY}"
                data-ticket-index="${index}"
              >Principal</button>
            ` : ""}
            <button
              type="button"
              class="fac-create-icon-btn"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_REMOVE}"
              data-ticket-index="${index}"
              aria-label="Quitar incidencia ${attr(ticket.id)}"
            >${icon("close")}</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderInput({
  label,
  name,
  value = "",
  type = "text",
  placeholder = "",
  min = "",
  step = "",
  required = false,
  error = "",
  disabled = false,
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>
      <input
        class="fac-create-input${error ? " is-error" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        type="${attr(type)}"
        value="${attr(value)}"
        ${placeholder ? `placeholder="${attr(placeholder)}"` : ""}
        ${min !== "" ? `min="${attr(min)}"` : ""}
        ${step !== "" ? `step="${attr(step)}"` : ""}
        ${disabled ? "disabled" : ""}
        ${error ? 'aria-invalid="true"' : ""}
      >
      ${renderFieldError(error)}
    </label>
  `;
}

function renderSelect({ label, name, value = "", options = [], error = "", disabled = false } = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}</span>
      <select
        class="fac-create-input fac-create-select${error ? " is-error" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        ${disabled ? "disabled" : ""}
        ${error ? 'aria-invalid="true"' : ""}
      >
        ${safeArray(options).map((option) => `
          <option value="${attr(option.value)}"${option.value === value ? " selected" : ""}>
            ${escapeHtml(option.label)}
          </option>
        `).join("")}
      </select>
      ${renderFieldError(error)}
    </label>
  `;
}

function renderTotalStrip(vm = {}) {
  const b = vm.breakdown;
  const profile = vm.taxProfile || b.taxProfile;

  return `
    <section class="fac-create-total-strip" aria-label="Resumen de impuestos y total">
      <div class="fac-create-total-cell">
        <span>Base imponible</span>
        <strong data-role="base-preview-inline">${escapeHtml(formatMoney(b.base))}</strong>
      </div>
      <div class="fac-create-total-cell">
        <span>IVA / IRPF</span>
        <strong data-role="tax-preview-inline">${escapeHtml(formatMoney(b.ivaTotal))} / ${escapeHtml(formatMoney(b.irpfTotal))}</strong>
        <small>${escapeHtml(profile.detail)}</small>
      </div>
      <div class="fac-create-total-cell is-total">
        <span>Total factura</span>
        <strong data-role="total-preview-inline">${escapeHtml(formatMoney(b.totalFactura))}</strong>
      </div>
    </section>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderFacturasCreateModal(input = {}) {
  const vm = buildVm(input);
  if (!vm.open) return "";

  const errors = vm.errors;
  const clientCount = vm.selectedClientes.length;
  const ticketCount = vm.selectedTickets.length;
  const disabled = vm.submitting || !vm.canCreate;

  return `
    <section
      id="${MODAL_ID}"
      class="fac-create-root"
      data-facturas-create-root="true"
      data-open="true"
      data-template-version="${attr(FACTURAS_CREATE_TEMPLATE_VERSION)}"
    >
      <div class="fac-create-overlay" data-facturas-create-modal-overlay="true">
        <div
          id="${PANEL_ID}"
          class="fac-create-panel"
          data-facturas-create-modal-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="${PANEL_ID}-title"
          tabindex="-1"
        >
          <header class="fac-create-header">
            <div class="fac-create-header-icon" aria-hidden="true">${icon("receipt")}</div>
            <div class="fac-create-header-copy">
              <span class="fac-create-eyebrow">Facturación</span>
              <h2 id="${PANEL_ID}-title">Nueva factura</h2>
              <p>Selecciona el cliente, vincula la incidencia y confirma el perfil fiscal antes de crearla.</p>
            </div>
            <button
              type="button"
              class="fac-create-close"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${vm.submitting ? "disabled" : ""}
            >${icon("close")}</button>
          </header>

          <form id="${FORM_ID}" data-facturas-create-form="true" novalidate>
            <div class="fac-create-body" data-facturas-create-body="true">
              ${vm.serverError ? `<div class="fac-create-alert is-error" role="alert">${escapeHtml(vm.serverError)}</div>` : ""}
              ${vm.successMessage ? `<div class="fac-create-alert is-success" role="status">${escapeHtml(vm.successMessage)}</div>` : ""}

              <section class="fac-create-section">
                <div class="fac-create-section-head">
                  <div>
                    <span class="fac-create-step">01</span>
                    <h3>Cliente y perfil fiscal</h3>
                    <p>El cliente principal determina los impuestos. Un particular nunca lleva IRPF.</p>
                  </div>
                  ${clientCount ? `
                    <button type="button" class="fac-create-link-btn" data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_CLEAR}">
                      Limpiar
                    </button>
                  ` : ""}
                </div>

                <div data-slot="selected-clientes">${renderSelectedClientes(vm)}</div>
                <div data-error-slot="clienteId">${renderFieldError(errors.clienteId)}</div>

                <label class="fac-create-field fac-create-field--search">
                  <span class="fac-create-label">${clientCount ? "Añadir otro cliente" : "Buscar cliente"}</span>
                  <span class="fac-create-search-shell">
                    <span aria-hidden="true">${icon("search")}</span>
                    <input
                      class="fac-create-input${errors.clienteId ? " is-error" : ""}"
                      data-field="clienteSearch"
                      data-create-field="clienteSearch"
                      name="clienteSearch"
                      type="search"
                      value="${attr(vm.clientSearch.query)}"
                      placeholder="Nombre, email, empresa o usuario..."
                      autocomplete="off"
                      spellcheck="false"
                      ${disabled ? "disabled" : ""}
                    >
                  </span>
                </label>

                <div
                  class="fac-create-search-slot"
                  data-slot="client-search-results"
                  aria-live="polite"
                  aria-busy="${vm.clientSearch.loading ? "true" : "false"}"
                >${renderClientSearchResults(vm)}</div>

                ${vm.primaryClient ? `
                  <div class="fac-create-tax-policy ${vm.taxProfile.aplicaIrpf ? "is-business" : "is-particular"}">
                    <span class="fac-create-tax-policy-icon">${icon("shield")}</span>
                    <div>
                      <strong>${escapeHtml(vm.taxProfile.label)}</strong>
                      <span>${escapeHtml(vm.taxProfile.detail)}${vm.primaryClient.nif ? ` · ${escapeHtml(vm.primaryClient.nif)}` : ""}</span>
                    </div>
                  </div>
                ` : ""}
              </section>

              <section class="fac-create-section">
                <div class="fac-create-section-head">
                  <div>
                    <span class="fac-create-step">02</span>
                    <h3>Incidencia vinculada</h3>
                    <p>La incidencia principal quedará asociada a la factura.</p>
                  </div>
                  <div class="fac-create-section-actions">
                    ${ticketCount ? `
                      <button type="button" class="fac-create-link-btn" data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_CLEAR}">
                        Limpiar
                      </button>
                    ` : ""}
                    <button
                      type="button"
                      class="fac-create-link-btn"
                      data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_REFRESH}"
                      ${disabled || !clientCount || vm.ticketSearch.loading ? "disabled" : ""}
                      aria-busy="${vm.ticketSearch.loading ? "true" : "false"}"
                    >${vm.ticketSearch.loading ? "Cargando..." : "Recargar"}</button>
                  </div>
                </div>

                <div data-slot="selected-tickets">${renderSelectedTickets(vm)}</div>
                <div data-error-slot="incidenciaId">${renderFieldError(errors.incidenciaId)}</div>

                <label class="fac-create-field fac-create-field--search">
                  <span class="fac-create-label">${ticketCount ? "Añadir otra incidencia" : "Buscar incidencia"}</span>
                  <span class="fac-create-search-shell">
                    <span aria-hidden="true">${icon("search")}</span>
                    <input
                      class="fac-create-input${errors.incidenciaId ? " is-error" : ""}"
                      data-field="ticketSearch"
                      data-create-field="ticketSearch"
                      name="ticketSearch"
                      type="search"
                      value="${attr(vm.ticketSearch.query)}"
                      placeholder="ID, asunto o estado..."
                      autocomplete="off"
                      spellcheck="false"
                      ${disabled || !clientCount ? "disabled" : ""}
                    >
                  </span>
                </label>

                <div
                  class="fac-create-search-slot"
                  data-slot="ticket-search-results"
                  aria-live="polite"
                  aria-busy="${vm.ticketSearch.loading ? "true" : "false"}"
                >${renderTicketSearchResults(vm)}</div>
              </section>

              <section class="fac-create-section">
                <div class="fac-create-section-head">
                  <div>
                    <span class="fac-create-step">03</span>
                    <h3>Detalle económico</h3>
                    <p>Importes calculados con el perfil fiscal del cliente principal.</p>
                  </div>
                </div>

                <div class="fac-create-form-grid">
                  ${renderInput({
                    label: "Concepto",
                    name: "concepto",
                    value: vm.form.concepto,
                    placeholder: "Ej. Servicios de soporte técnico",
                    required: true,
                    error: errors.concepto,
                    disabled,
                  })}

                  <label class="fac-create-field fac-create-field--wide">
                    <span class="fac-create-label">Descripción *</span>
                    <textarea
                      class="fac-create-input fac-create-textarea${errors.descripcion ? " is-error" : ""}"
                      data-field="descripcion"
                      name="descripcion"
                      rows="4"
                      placeholder="Describe el servicio realizado..."
                      ${disabled ? "disabled" : ""}
                      ${errors.descripcion ? 'aria-invalid="true"' : ""}
                    >${escapeHtml(vm.form.descripcion)}</textarea>
                    ${renderFieldError(errors.descripcion)}
                  </label>

                  ${renderInput({
                    label: "Cantidad",
                    name: "cantidad",
                    value: vm.form.cantidad,
                    type: "number",
                    min: "0.01",
                    step: "0.01",
                    required: true,
                    error: errors.cantidad,
                    disabled,
                  })}

                  ${renderInput({
                    label: "Precio unitario",
                    name: "precioUnitario",
                    value: vm.form.precioUnitario,
                    type: "number",
                    min: "0",
                    step: "0.01",
                    required: true,
                    error: errors.precioUnitario,
                    disabled,
                  })}

                  ${renderInput({
                    label: "Fecha de servicio",
                    name: "fechaServicio",
                    value: vm.form.fechaServicio,
                    type: "date",
                    required: true,
                    error: errors.fechaServicio,
                    disabled,
                  })}

                  ${renderSelect({
                    label: "Forma de pago",
                    name: "formaPago",
                    value: vm.form.formaPago,
                    options: PAYMENT_OPTIONS,
                    error: errors.formaPago,
                    disabled,
                  })}

                  ${renderSelect({
                    label: "Estado de pago",
                    name: "estadoPago",
                    value: vm.form.estadoPago,
                    options: PAYMENT_STATUS_OPTIONS,
                    error: errors.estadoPago,
                    disabled,
                  })}

                  <label class="fac-create-toggle">
                    <span>
                      <strong>Enviar por email</strong>
                      <small>Enviar la factura al cliente al finalizar.</small>
                    </span>
                    <span class="fac-create-toggle-control">
                      <input
                        data-field="sendEmail"
                        name="sendEmail"
                        type="checkbox"
                        ${vm.form.sendEmail ? "checked" : ""}
                        ${disabled ? "disabled" : ""}
                      >
                      <span aria-hidden="true"></span>
                    </span>
                  </label>
                </div>
              </section>

              ${renderTotalStrip(vm)}

              <div class="fac-create-tax-footnote">
                ${icon("shield")}
                <span>
                  Política automática: <strong>particular = IVA 21 % sin IRPF</strong>;
                  empresa/profesional/autónomo = IVA 21 % + IRPF 7 %. El cliente principal manda.
                </span>
              </div>
            </div>

            <footer class="fac-create-footer">
              <div class="fac-create-footer-summary">
                <span>${clientCount ? escapeHtml(vm.primaryClient?.name || "Cliente seleccionado") : "Falta cliente"}</span>
                <strong>${escapeHtml(formatMoney(vm.breakdown.totalFactura))}</strong>
              </div>
              <div class="fac-create-footer-actions">
                <button
                  type="button"
                  class="fac-create-btn fac-create-btn--ghost"
                  data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLOSE}"
                  ${vm.submitting ? "disabled" : ""}
                >Cancelar</button>
                <button
                  type="submit"
                  class="fac-create-btn fac-create-btn--primary"
                  data-factura-create-action="${FACTURA_CREATE_ACTIONS.SUBMIT}"
                  ${disabled ? "disabled" : ""}
                  aria-busy="${vm.submitting ? "true" : "false"}"
                >
                  ${vm.submitting ? renderSpinner("Creando factura...") : `${icon("check")}<span>Crear factura</span>`}
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    </section>
  `;
}

export function renderFacturasCreateModalClosed() {
  return "";
}

/* =========================================================
   STABLE DOM ISLANDS
========================================================= */

export function renderFacturaCreateClientSearchSlot(input = {}) {
  return renderClientSearchResults(buildVm(input));
}

export function renderFacturaCreateTicketSearchSlot(input = {}) {
  return renderTicketSearchResults(buildVm(input));
}

export function renderFacturaCreateSelectedClientsSlot(input = {}) {
  return renderSelectedClientes(buildVm(input));
}

export function renderFacturaCreateSelectedTicketsSlot(input = {}) {
  return renderSelectedTickets(buildVm(input));
}

export function renderFacturaCreateTotalsSlot(input = {}) {
  return renderTotalStrip(buildVm(input));
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getFacturaCreateFormDefaults() {
  return {
    ...DEFAULT_FORM,
    fechaServicio: todayInputValue(),
  };
}

export function getFacturaCreateBreakdown(form = {}) {
  return getInvoiceBreakdown(form);
}

export function validateFacturaCreateForm({
  form = {},
  selectedClientes = [],
  selectedTickets = [],
} = {}) {
  const normalizedClients = safeArray(selectedClientes).map(normalizeClient);
  const normalizedTickets = safeArray(selectedTickets).map(normalizeTicket);

  const enriched = enrichFormWithPrimaryClient(form, normalizedClients);
  const current = normalizeForm(enriched);
  const errors = {};

  if (!normalizedClients.length) {
    errors.clienteId = "Selecciona al menos un cliente.";
  }

  if (!normalizedTickets.length) {
    errors.incidenciaId = "Selecciona al menos una incidencia vinculada.";
  }

  if (!current.concepto || current.concepto.length < 3) {
    errors.concepto = "Indica un concepto válido.";
  }

  if (!current.descripcion || current.descripcion.length < 4) {
    errors.descripcion = "Indica una descripción mínima.";
  }

  if (!(current.cantidad > 0)) {
    errors.cantidad = "La cantidad debe ser mayor que cero.";
  }

  if (current.precioUnitario < 0) {
    errors.precioUnitario = "El precio no puede ser negativo.";
  }

  if (!current.fechaServicio) {
    errors.fechaServicio = "Indica la fecha de servicio.";
  }

  const breakdown = getInvoiceBreakdown(current);

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: {
      ...current,
      aplicaIrpf: breakdown.aplicaIrpf,
      clienteEsEmpresa: breakdown.clienteEsEmpresa,
      ivaRate: breakdown.ivaRate,
      irpfRate: breakdown.irpfRate,
      regimenFiscal: breakdown.aplicaIrpf ? "iva_irpf" : "iva",
    },
    breakdown,
    taxProfile: breakdown.taxProfile,
  };
}

export function getFacturaCreateTemplateSnapshot() {
  return {
    version: FACTURAS_CREATE_TEMPLATE_VERSION,
    actions: FACTURA_CREATE_ACTIONS,
    policy: {
      pureTemplate: true,
      primaryClientTaxProfile: true,
      particularesOnlyIva: true,
      businessIvaAndIrpf: true,
      explicitTypeWins: true,
      safeUnknownDefaultsToNoIrpf: true,
      juridicalNifFallback: true,
      stableSearchIslands: true,
      noHttp: true,
      noRouter: true,
      noStore: true,
    },
    taxes: {
      iva: DEFAULT_IVA_RATE,
      irpfBusiness: DEFAULT_IRPF_RATE,
      irpfParticular: 0,
    },
  };
}

export default {
  FACTURAS_CREATE_TEMPLATE_VERSION,
  FACTURA_CREATE_ACTIONS,
  renderFacturasCreateModal,
  renderFacturasCreateModalClosed,
  renderFacturaCreateClientSearchSlot,
  renderFacturaCreateTicketSearchSlot,
  renderFacturaCreateSelectedClientsSlot,
  renderFacturaCreateSelectedTicketsSlot,
  renderFacturaCreateTotalsSlot,
  getFacturaCreateFormDefaults,
  getFacturaCreateBreakdown,
  getFacturaCreateTaxProfile,
  validateFacturaCreateForm,
  getFacturaCreateTemplateSnapshot,
};

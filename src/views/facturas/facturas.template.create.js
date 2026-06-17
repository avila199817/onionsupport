/* =========================================================
   Onion Support - Facturas Create Template
   Archivo: /src/views/facturas/facturas.template.create.js

   Responsabilidad:
   - Render HTML puro del modal de creación de factura.
   - Buscador visual de cliente.
   - Selección multi-cliente.
   - Buscador visual de incidencias vinculadas.
   - Selección multi-incidencia.
   - Formulario de concepto, descripción, cantidad, precio y pago.
   - Vista previa de totales.
   - Exponer data-field/data-action para index.js.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin State externo.
   - Sin listeners.
   - Sin DOM API.
   - Sin Toast.
   - Sin bridge global.
========================================================= */

export const FACTURAS_CREATE_TEMPLATE_VERSION =
  "facturas.template.create.v3.stable-dom-islands";

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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "object") {
    return fallback;
  }

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
      clean =
        clean.lastIndexOf(",") > clean.lastIndexOf(".")
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

function round2(value = 0) {
  const parsed = number(value, 0);
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
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

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = normalizeKey(value);

    if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
    if (["false", "0", "no", "off"].includes(key)) return false;
  }

  return fallback;
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

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatMoney(value = 0) {
  const amount = number(value, 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} €`;
  }
}

function initialsFrom(value = "", fallback = "CL") {
  const text = cleanText(value, "");

  if (!text) return fallback;

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || fallback;
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeClient(item = {}) {
  const raw = safeObject(item);

  const id = cleanText(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw.userId,
      raw.username
    ),
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
    first(
      raw.email,
      raw.mail,
      raw.emailCliente,
      raw.clienteEmail,
      raw.clientEmail,
      raw.emailLower
    ),
    ""
  ).toLowerCase();

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

  const userId = cleanText(first(raw.userId, raw.usuarioId, raw.uid, raw.id), "");
  const clienteId = cleanText(first(raw.clienteId, raw.clientId, raw.customerId, id), id);

  return {
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
    nif: cleanText(first(raw.nif, raw.cif, raw.taxId, raw.vatId), ""),
    username: cleanText(first(raw.username, raw.slug, email ? email.split("@")[0] : ""), ""),

    avatarUrl,
    avatar: avatarUrl,
    initials: initialsFrom(name, "CL"),

    subtitle: cleanText(
      first(
        email,
        raw.razonSocial && raw.razonSocial !== name ? raw.razonSocial : "",
        raw.telefono,
        raw.nif,
        clienteId || userId
      ),
      clienteId || userId || id
    ),
  };
}

function normalizeTicket(item = {}) {
  const raw = safeObject(item);

  const id = cleanText(
    first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero),
    ""
  );

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

    subtitle:
      [
        status ? `Estado: ${status}` : "",
        category ? `Tipo: ${category}` : "",
        raw.facturaLinked || raw.meta?.hasFactura ? "Ya facturada" : "",
      ]
        .filter(Boolean)
        .join(" · ") || id,
  };
}

function normalizeForm(form = {}) {
  const input = {
    ...DEFAULT_FORM,
    fechaServicio: todayInputValue(),
    ...safeObject(form),
  };

  return {
    concepto: cleanText(input.concepto, DEFAULT_FORM.concepto),
    descripcion: cleanText(input.descripcion, ""),
    cantidad: number(input.cantidad, DEFAULT_FORM.cantidad),
    precioUnitario: number(input.precioUnitario, DEFAULT_FORM.precioUnitario),
    fechaServicio: cleanText(input.fechaServicio, todayInputValue()),
    formaPago: cleanText(input.formaPago, DEFAULT_FORM.formaPago),
    estadoPago: cleanText(input.estadoPago, DEFAULT_FORM.estadoPago),
    sendEmail: parseBoolean(input.sendEmail, true),

    clienteId: cleanText(input.clienteId, ""),
    clienteUserId: cleanText(input.clienteUserId, ""),
    clienteNombre: cleanText(input.clienteNombre, ""),
    clienteEmail: cleanText(input.clienteEmail, ""),
    clienteAvatar: safeImageSrc(input.clienteAvatar),

    ticketId: cleanText(input.ticketId, ""),
    incidenciaId: cleanText(input.incidenciaId, ""),
    incidenciaSubject: cleanText(input.incidenciaSubject, ""),
  };
}

function getInvoiceBreakdown(form = {}) {
  const current = normalizeForm(form);

  const cantidad = number(current.cantidad, 0);
  const precioUnitario = number(current.precioUnitario, 0);

  const base = round2(cantidad * precioUnitario);
  const ivaTotal = round2(base * (DEFAULT_IVA_RATE / 100));
  const irpfTotal = round2(-(base * (DEFAULT_IRPF_RATE / 100)));
  const totalFactura = round2(base + ivaTotal + irpfTotal);

  return {
    cantidad,
    precioUnitario,
    base,
    ivaRate: DEFAULT_IVA_RATE,
    irpfRate: DEFAULT_IRPF_RATE,
    ivaTotal,
    irpfTotal,
    totalFactura,
  };
}

function buildVm(input = {}) {
  const data = safeObject(input);
  const form = normalizeForm(data.form || data.draft || {});

  const clientSearch = safeObject(data.clientSearch || data.clienteSearch);
  const ticketSearch = safeObject(data.ticketSearch || data.incidenciaSearch);

  const selectedClientes = safeArray(
    first(data.selectedClientes, data.clientes, data.clients, [])
  )
    .map(normalizeClient)
    .filter((item) => item.id);

  const selectedTickets = safeArray(
    first(data.selectedTickets, data.tickets, data.incidencias, [])
  )
    .map(normalizeTicket)
    .filter((item) => item.id);

  const clientResults = safeArray(
    first(clientSearch.results, clientSearch.items, clientSearch.clientes, [])
  )
    .map(normalizeClient)
    .filter((item) => item.id);

  const ticketResults = safeArray(
    first(ticketSearch.results, ticketSearch.items, ticketSearch.tickets, ticketSearch.incidencias, [])
  )
    .map(normalizeTicket)
    .filter((item) => item.id);

  const clientQuery = cleanText(
    first(clientSearch.query, data.clientSearchQuery, data.clienteSearchQuery, ""),
    ""
  );

  const ticketQuery = cleanText(
    first(ticketSearch.query, data.ticketSearchQuery, data.incidenciaSearchQuery, ""),
    ""
  );

  return {
    open: data.open === true,
    canCreate: data.canCreate !== false,

    submitting: data.submitting === true,
    loading: data.loading === true,

    form,
    errors: safeObject(data.errors),

    serverError: cleanText(data.serverError || data.error, ""),
    successMessage: cleanText(data.successMessage, ""),
    createdFacturaId: cleanText(data.createdFacturaId, ""),

    selectedClientes,
    selectedTickets,

    clientSearch: {
      query: clientQuery,
      loading: clientSearch.loading === true,
      error: cleanText(clientSearch.error, ""),
      results: clientResults,
      empty:
        clientSearch.empty === true ||
        (
          clientQuery.length >= 2 &&
          clientSearch.loading !== true &&
          !clientResults.length
        ),
    },

    ticketSearch: {
      query: ticketQuery,
      loading: ticketSearch.loading === true,
      error: cleanText(ticketSearch.error, ""),
      results: ticketResults,
      empty:
        ticketSearch.empty === true ||
        (
          ticketQuery.length >= 2 &&
          ticketSearch.loading !== true &&
          !ticketResults.length
        ),
    },

    breakdown: getInvoiceBreakdown(form),
  };
}

/* =========================================================
   FORM HELPERS
========================================================= */

function disabledAttrs(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function renderFieldError(message = "") {
  const text = cleanText(message, "");

  if (!text) return "";

  return `<span class="fac-create-error">${escapeHtml(text)}</span>`;
}

function renderAlert(type = "info", title = "", body = "") {
  const safeTitle = cleanText(title, "");
  const safeBody = cleanText(body, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="fac-create-alert is-${attr(type)}">
      ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
      ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
    </div>
  `;
}

function renderAvatar({
  name = "",
  email = "",
  avatarUrl = "",
  fallback = "CL",
  className = "fac-create-avatar",
} = {}) {
  const displayName = cleanText(first(name, email, "Cliente"), "Cliente");
  const initials = initialsFrom(displayName, fallback);
  const image = safeImageSrc(avatarUrl);

  return `
    <span
      class="${attr(className)}${image ? " has-image" : ""}"
      aria-label="${attr(displayName)}"
      title="${attr(displayName)}"
      ${image ? 'data-has-avatar="true"' : 'data-fallback="true"'}
    >
      ${
        image
          ? `
            <img
              class="fac-create-avatar-img"
              src="${attr(image)}"
              alt="${attr(displayName)}"
              loading="lazy"
              referrerpolicy="no-referrer"
              data-avatar-img="true"
            >
          `
          : ""
      }

      <span class="fac-create-avatar-fallback">
        ${escapeHtml(initials)}
      </span>
    </span>
  `;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  type = "text",
  placeholder = "",
  error = "",
  required = false,
  step = "",
  min = "",
  readonly = false,
  inputmode = "",
  disabled = false,
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <input
        class="fac-create-input ${error ? "is-error" : ""}${readonly ? " is-readonly" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        type="${attr(type)}"
        value="${attr(value)}"
        placeholder="${attr(placeholder)}"
        ${step ? `step="${attr(step)}"` : ""}
        ${min ? `min="${attr(min)}"` : ""}
        ${inputmode ? `inputmode="${attr(inputmode)}"` : ""}
        ${readonly ? "readonly" : ""}
        ${disabledAttrs(disabled, disabled)}
      >

      ${renderFieldError(error)}
    </label>
  `;
}

function renderTextarea({
  label = "",
  name = "",
  value = "",
  placeholder = "",
  error = "",
  required = false,
  disabled = false,
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <textarea
        class="fac-create-textarea ${error ? "is-error" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        rows="4"
        placeholder="${attr(placeholder)}"
        ${disabledAttrs(disabled, disabled)}
      >${escapeHtml(value)}</textarea>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderSelect({
  label = "",
  name = "",
  value = "",
  options = [],
  error = "",
  required = false,
  disabled = false,
} = {}) {
  return `
    <label class="fac-create-field">
      <span class="fac-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <select
        class="fac-create-select ${error ? "is-error" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        ${disabledAttrs(disabled, disabled)}
      >
        ${safeArray(options).map((option) => {
          const optionValue = cleanText(option.value, "");
          const optionLabel = cleanText(option.label, optionValue);

          return `
            <option value="${attr(optionValue)}" ${optionValue === cleanText(value, "") ? "selected" : ""}>
              ${escapeHtml(optionLabel)}
            </option>
          `;
        }).join("")}
      </select>

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
  return `
    <label class="fac-create-check">
      <input
        data-field="${attr(name)}"
        name="${attr(name)}"
        type="checkbox"
        ${checked ? "checked" : ""}
        ${disabledAttrs(disabled, disabled)}
      >

      <span>
        <strong>${escapeHtml(label)}</strong>
        ${help ? `<small>${escapeHtml(help)}</small>` : ""}
      </span>
    </label>
  `;
}

/* =========================================================
   CLIENTS
========================================================= */

function hasClientSelected(vm = {}, client = {}) {
  const id = cleanText(first(client.clienteId, client.id), "");
  const userId = cleanText(client.userId, "");

  return vm.selectedClientes.some((item) => {
    return (
      (id && (item.id === id || item.clienteId === id)) ||
      (userId && item.userId === userId)
    );
  });
}

function renderClientSearchResults(vm = {}) {
  const search = vm.clientSearch;

  if (!search.query) return "";

  if (search.loading) {
    return `<div class="fac-create-search-state">Buscando cliente...</div>`;
  }

  if (search.error) {
    return `<div class="fac-create-search-state is-error">${escapeHtml(search.error)}</div>`;
  }

  if (search.query.length < 2) {
    return `<div class="fac-create-search-state">Mínimo 2 caracteres.</div>`;
  }

  if (search.empty) {
    return `<div class="fac-create-search-state">Sin resultados.</div>`;
  }

  if (!search.results.length) return "";

  return `
    <div class="fac-create-search-results">
      ${search.results.map((item, index) => {
        const selected = hasClientSelected(vm, item);

        return `
          <button
            type="button"
            class="fac-create-search-item fac-create-search-item--client ${selected ? "is-selected" : ""}"
            data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_SELECT}"
            data-action="${FACTURA_CREATE_ACTIONS.CLIENT_SELECT}"
            data-client-index="${attr(String(index))}"
            ${disabledAttrs(vm.submitting || selected, vm.submitting)}
          >
            ${renderAvatar({
              name: item.name,
              email: item.email,
              avatarUrl: item.avatarUrl,
              fallback: "CL",
              className: "fac-create-avatar fac-create-avatar--search",
            })}

            <span class="fac-create-search-copy">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.subtitle || item.email || item.id)}</span>
            </span>

            <span class="fac-create-add-pill">
              ${selected ? "Añadido" : "Añadir"}
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderSelectedClientes(vm = {}) {
  if (!vm.selectedClientes.length) {
    return `
      <div class="fac-create-empty-pro">
        <strong>Sin clientes seleccionados</strong>
        <span>Busca y añade el cliente destino para esta factura.</span>
      </div>
    `;
  }

  return `
    <div class="fac-create-selected-stack">
      ${vm.selectedClientes.map((item, index) => {
        const name = cleanText(first(item.name, item.nombreContacto, item.razonSocial), "Cliente");
        const email = cleanText(item.email, "");
        const id = cleanText(first(item.clienteId, item.id), "");
        const avatarUrl = safeImageSrc(first(item.avatarUrl, item.avatar));
        const primary = index === 0;

        return `
          <div class="fac-create-selected-card fac-create-selected-card--client ${primary ? "is-primary" : ""}">
            <div class="fac-create-selected-main">
              ${renderAvatar({
                name,
                email,
                avatarUrl,
                fallback: "CL",
                className: "fac-create-avatar fac-create-avatar--selected",
              })}

              <div class="fac-create-selected-copy">
                <span>${primary ? "Cliente principal" : "Cliente adicional"}</span>
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml(email || id)}</small>
              </div>
            </div>

            <div class="fac-create-selected-actions">
              ${
                !primary
                  ? `
                    <button
                      type="button"
                      class="fac-create-icon-button"
                      data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_PRIMARY}"
                      data-action="${FACTURA_CREATE_ACTIONS.CLIENT_PRIMARY}"
                      data-client-index="${attr(String(index))}"
                      ${disabledAttrs(vm.submitting, vm.submitting)}
                    >
                      Principal
                    </button>
                  `
                  : ""
              }

              <button
                type="button"
                class="fac-create-icon-button is-danger"
                data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_REMOVE}"
                data-action="${FACTURA_CREATE_ACTIONS.CLIENT_REMOVE}"
                data-client-index="${attr(String(index))}"
                ${disabledAttrs(vm.submitting, vm.submitting)}
                aria-label="Quitar cliente"
              >
                Quitar
              </button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* =========================================================
   TICKETS
========================================================= */

function hasTicketSelected(vm = {}, ticket = {}) {
  const id = cleanText(first(ticket.ticketId, ticket.incidenciaId, ticket.id), "");

  return Boolean(
    id &&
      vm.selectedTickets.some((item) => {
        return item.id === id || item.ticketId === id || item.incidenciaId === id;
      })
  );
}

function renderSelectedTickets(vm = {}) {
  if (!vm.selectedClientes.length) {
    return `
      <div class="fac-create-empty-pro is-locked">
        <strong>Selecciona primero cliente</strong>
        <span>Después se cargarán incidencias compatibles.</span>
      </div>
    `;
  }

  if (!vm.selectedTickets.length) {
    return `
      <div class="fac-create-empty-pro">
        <strong>Sin incidencias seleccionadas</strong>
        <span>Selecciona una o varias incidencias para vincularlas a la factura.</span>
      </div>
    `;
  }

  return `
    <div class="fac-create-selected-stack">
      ${vm.selectedTickets.map((item, index) => {
        const id = cleanText(first(item.id, item.ticketId, item.incidenciaId), "");
        const subject = cleanText(first(item.subject, item.asunto, item.title), id);
        const primary = index === 0;

        return `
          <div class="fac-create-selected-card fac-create-selected-card--ticket ${primary ? "is-primary" : ""}">
            <div class="fac-create-selected-main">
              <div class="fac-create-ticket-badge" aria-hidden="true">
                <span>I</span>
              </div>

              <div class="fac-create-selected-copy">
                <span>${primary ? "Incidencia principal" : "Incidencia adicional"}</span>
                <strong>${escapeHtml(id)}</strong>
                <small>${escapeHtml(subject)}</small>
              </div>
            </div>

            <div class="fac-create-selected-actions">
              ${
                !primary
                  ? `
                    <button
                      type="button"
                      class="fac-create-icon-button"
                      data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_PRIMARY}"
                      data-action="${FACTURA_CREATE_ACTIONS.TICKET_PRIMARY}"
                      data-ticket-index="${attr(String(index))}"
                      ${disabledAttrs(vm.submitting, vm.submitting)}
                    >
                      Principal
                    </button>
                  `
                  : ""
              }

              <button
                type="button"
                class="fac-create-icon-button is-danger"
                data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_REMOVE}"
                data-action="${FACTURA_CREATE_ACTIONS.TICKET_REMOVE}"
                data-ticket-index="${attr(String(index))}"
                ${disabledAttrs(vm.submitting, vm.submitting)}
                aria-label="Quitar incidencia"
              >
                Quitar
              </button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTicketSearchResults(vm = {}) {
  const search = vm.ticketSearch;

  if (!vm.selectedClientes.length) return "";

  if (search.loading) {
    return `<div class="fac-create-search-state">Cargando incidencias...</div>`;
  }

  if (search.error) {
    return `<div class="fac-create-search-state is-error">${escapeHtml(search.error)}</div>`;
  }

  if (search.empty) {
    return `<div class="fac-create-search-state">Sin incidencias disponibles para los clientes seleccionados.</div>`;
  }

  if (!search.results.length) return "";

  return `
    <div class="fac-create-ticket-list">
      ${search.results.map((item, index) => {
        const id = cleanText(first(item.id, item.ticketId, item.incidenciaId), "");
        const subject = cleanText(first(item.subject, item.asunto, item.title), id);
        const selected = hasTicketSelected(vm, item);

        return `
          <button
            type="button"
            class="fac-create-ticket-option ${selected ? "is-selected" : ""}"
            data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_SELECT}"
            data-action="${FACTURA_CREATE_ACTIONS.TICKET_SELECT}"
            data-ticket-index="${attr(String(index))}"
            ${disabledAttrs(vm.submitting || selected, vm.submitting)}
          >
            <span class="fac-create-ticket-mini-badge" aria-hidden="true">I</span>

            <span class="fac-create-ticket-option-copy">
              <strong>${escapeHtml(id)} · ${escapeHtml(subject)}</strong>
              <small>${escapeHtml(item.subtitle || item.clienteId || id)}</small>
            </span>

            <span class="fac-create-add-pill">
              ${selected ? "Vinculada" : "Vincular"}
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

/* =========================================================
   MAIN BLOCKS
========================================================= */

function renderTargetBlock(vm = {}) {
  const errors = vm.errors;
  const clientCount = vm.selectedClientes.length;
  const ticketCount = vm.selectedTickets.length;

  return `
    <section class="fac-create-target fac-create-target--pro">
      <div class="fac-create-target-head fac-create-target-head--pro">
        <div class="fac-create-target-title-block">
          <span>Destino</span>
          <h3>Clientes e incidencias</h3>
          <p>Vincula la factura al cliente y a sus incidencias reales.</p>
        </div>

        <div class="fac-create-target-metrics">
          <div>
            <strong data-client-count="true">${escapeHtml(String(clientCount))}</strong>
            <span>Clientes</span>
          </div>
          <div>
            <strong data-ticket-count="true">${escapeHtml(String(ticketCount))}</strong>
            <span>Incidencias</span>
          </div>
        </div>
      </div>

      <div class="fac-create-pro-grid">
        <article class="fac-create-pro-card fac-create-pro-card--clients">
          <div class="fac-create-pro-card-head">
            <div>
              <span>Clientes destino</span>
              <strong>Selecciona cliente</strong>
            </div>

            <button
              type="button"
              class="fac-create-mini-button"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLIENT_CLEAR}"
              data-action="${FACTURA_CREATE_ACTIONS.CLIENT_CLEAR}"
              ${disabledAttrs(vm.submitting || !clientCount, vm.submitting)}
            >
              Limpiar
            </button>
          </div>

          <div data-slot="selected-clientes">
            ${renderSelectedClientes(vm)}
          </div>

          <div data-error-slot="clienteId">
            ${renderFieldError(errors.clienteId)}
          </div>

          <label class="fac-create-field fac-create-field--search">
            <span class="fac-create-label">${clientCount ? "Añadir otro cliente" : "Buscar cliente"}</span>

            <span class="fac-create-search-control">
              <span class="fac-create-search-icon" aria-hidden="true">${icon("search")}</span>

              <input
                class="fac-create-input ${errors.clienteId ? "is-error" : ""}"
                data-field="clienteSearch"
                name="clienteSearch"
                type="search"
                value="${attr(vm.clientSearch.query)}"
                placeholder="Nombre, email, empresa o usuario..."
                autocomplete="off"
                spellcheck="false"
                ${disabledAttrs(vm.submitting, vm.submitting || vm.clientSearch.loading)}
              >
            </span>
          </label>

          <div
            data-slot="client-search-results"
            aria-live="polite"
            aria-busy="${vm.clientSearch.loading ? "true" : "false"}"
          >
            ${renderClientSearchResults(vm)}
          </div>
        </article>

        <article class="fac-create-pro-card fac-create-pro-card--tickets">
          <div class="fac-create-pro-card-head">
            <div>
              <span>Incidencias vinculadas</span>
              <strong>Selecciona referencias</strong>
            </div>

            <button
              type="button"
              class="fac-create-mini-button"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_REFRESH}"
              data-action="${FACTURA_CREATE_ACTIONS.TICKET_REFRESH}"
              ${disabledAttrs(vm.submitting || vm.ticketSearch.loading || !clientCount, vm.ticketSearch.loading)}
            >
              ${vm.ticketSearch.loading ? "Cargando..." : "Recargar"}
            </button>
          </div>

          <div data-slot="selected-tickets">
            ${renderSelectedTickets(vm)}
          </div>

          <div data-error-slot="incidenciaId">
            ${renderFieldError(errors.incidenciaId)}
          </div>

          <label class="fac-create-field fac-create-field--search">
            <span class="fac-create-label">Filtrar incidencias</span>

            <span class="fac-create-search-control">
              <span class="fac-create-search-icon" aria-hidden="true">${icon("ticket")}</span>

              <input
                class="fac-create-input ${errors.incidenciaId ? "is-error" : ""}"
                data-field="ticketSearch"
                name="ticketSearch"
                type="search"
                value="${attr(vm.ticketSearch.query)}"
                placeholder="Código, asunto o estado..."
                autocomplete="off"
                spellcheck="false"
                ${disabledAttrs(vm.submitting || !clientCount, vm.ticketSearch.loading)}
              >
            </span>
          </label>

          <div
            data-slot="ticket-search-results"
            aria-live="polite"
            aria-busy="${vm.ticketSearch.loading ? "true" : "false"}"
          >
            ${renderTicketSearchResults(vm)}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderTotalStrip(vm = {}) {
  const breakdown = vm.breakdown;

  return `
    <div class="fac-create-total-strip">
      <div>
        <span>Base imponible</span>
        <strong data-role="base-preview-inline">${escapeHtml(formatMoney(breakdown.base))}</strong>
      </div>

      <div>
        <span>IVA / IRPF</span>
        <strong data-role="tax-preview-inline">
          ${escapeHtml(`${formatMoney(breakdown.ivaTotal)} / ${formatMoney(breakdown.irpfTotal)}`)}
        </strong>
      </div>

      <div class="is-total">
        <span>Total estimado</span>
        <strong data-role="total-preview-inline">${escapeHtml(formatMoney(breakdown.totalFactura))}</strong>
      </div>
    </div>
  `;
}

function renderLoadingOverlay() {
  return `
    <div class="fac-create-loading-overlay">
      <div class="fac-create-loading-card">
        <span class="fac-create-loading-spinner" aria-hidden="true"></span>
        <strong>Creando factura...</strong>
        <small>Generando documento, PDF, auditoría y envío.</small>
      </div>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderFacturasCreateModal(input = {}) {
  const vm = buildVm(input);

  if (!vm.open) return "";

  return `
    <section
      id="${MODAL_ID}"
      class="fac-create-modal-root"
      data-facturas-scope="true"
      data-facturas-create-root="true"
      data-template-version="${attr(FACTURAS_CREATE_TEMPLATE_VERSION)}"
    >
      <div class="fac-create-overlay" data-facturas-create-modal-overlay="true">
        <div
          id="${PANEL_ID}"
          class="fac-create-panel ${vm.submitting ? "is-submitting" : ""}"
          data-facturas-create-modal-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="facturas-create-modal-title"
          tabindex="-1"
        >
          ${vm.submitting ? renderLoadingOverlay() : ""}

          <div class="fac-create-header">
            <div class="fac-create-header-copy">
              <h2 id="facturas-create-modal-title">Crear factura</h2>
              <p>Factura vinculada a cliente e incidencias reales.</p>
            </div>

            <button
              type="button"
              class="fac-create-close"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLOSE}"
              data-action="${FACTURA_CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar modal"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              ${icon("close")}
            </button>
          </div>

          <div class="fac-create-body">
            ${
              vm.successMessage
                ? renderAlert(
                    "success",
                    "Factura creada.",
                    vm.createdFacturaId
                      ? `Referencia: ${vm.createdFacturaId}`
                      : vm.successMessage
                  )
                : ""
            }

            ${
              vm.serverError
                ? renderAlert("error", "No se pudo crear la factura.", vm.serverError)
                : ""
            }

            ${
              !vm.canCreate
                ? renderAlert("error", "Acceso no permitido.", "No tienes permisos para crear facturas.")
                : ""
            }

            <form
              id="${FORM_ID}"
              class="fac-create-form"
              data-facturas-create-form="true"
              novalidate
            >
              <div class="fac-create-grid fac-create-grid--2">
                ${renderInput({
                  label: "Fecha servicio",
                  name: "fechaServicio",
                  type: "date",
                  value: vm.form.fechaServicio,
                  disabled: vm.submitting || !vm.canCreate,
                })}

                ${renderSelect({
                  label: "Forma de pago",
                  name: "formaPago",
                  value: vm.form.formaPago,
                  options: PAYMENT_OPTIONS,
                  disabled: vm.submitting || !vm.canCreate,
                })}
              </div>

              ${renderInput({
                label: "Concepto",
                name: "concepto",
                value: vm.form.concepto,
                placeholder: "Ej. Servicios de soporte técnico",
                required: true,
                error: vm.errors.concepto,
                disabled: vm.submitting || !vm.canCreate,
              })}

              ${renderTextarea({
                label: "Descripción",
                name: "descripcion",
                value: vm.form.descripcion,
                placeholder: "Detalle del trabajo facturable...",
                required: true,
                error: vm.errors.descripcion,
                disabled: vm.submitting || !vm.canCreate,
              })}

              <div class="fac-create-grid fac-create-grid--2">
                ${renderInput({
                  label: "Cantidad / horas",
                  name: "cantidad",
                  type: "number",
                  value: vm.form.cantidad,
                  min: "0.01",
                  step: "0.01",
                  inputmode: "decimal",
                  required: true,
                  error: vm.errors.cantidad,
                  disabled: vm.submitting || !vm.canCreate,
                })}

                ${renderInput({
                  label: "Precio unitario",
                  name: "precioUnitario",
                  type: "number",
                  value: vm.form.precioUnitario,
                  min: "0.01",
                  step: "0.01",
                  inputmode: "decimal",
                  required: true,
                  error: vm.errors.precioUnitario,
                  disabled: vm.submitting || !vm.canCreate,
                })}
              </div>

              <div class="fac-create-grid fac-create-grid--2">
                ${renderSelect({
                  label: "Estado de pago",
                  name: "estadoPago",
                  value: vm.form.estadoPago,
                  options: PAYMENT_STATUS_OPTIONS,
                  disabled: vm.submitting || !vm.canCreate,
                })}

                ${renderCheckbox({
                  label: "Enviar email al cliente",
                  name: "sendEmail",
                  checked: vm.form.sendEmail,
                  help: "Adjunta el PDF generado si el backend lo permite.",
                  disabled: vm.submitting || !vm.canCreate,
                })}
              </div>

              ${renderTotalStrip(vm)}
              ${renderTargetBlock(vm)}

              <div class="fac-create-actions fac-create-actions--compact">
                <div aria-hidden="true"></div>

                <div class="fac-create-action-buttons">
                  <button
                    type="submit"
                    class="fac-create-submit"
                    data-factura-create-action="${FACTURA_CREATE_ACTIONS.SUBMIT}"
                    data-action="${FACTURA_CREATE_ACTIONS.SUBMIT}"
                    ${disabledAttrs(vm.submitting || !vm.canCreate, vm.submitting)}
                  >
                    ${
                      vm.submitting
                        ? `
                          <span class="fac-create-submit-inner">
                            <span class="fac-create-spinner" aria-hidden="true"></span>
                            Creando...
                          </span>
                        `
                        : "Crear factura"
                    }
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderFacturasCreateModalClosed() {
  return "";
}

/* =========================================================
   STABLE DOM ISLAND RENDERERS
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
  const current = normalizeForm(form);
  const errors = {};

  if (!safeArray(selectedClientes).length) {
    errors.clienteId = "Selecciona al menos un cliente.";
  }

  if (!safeArray(selectedTickets).length) {
    errors.incidenciaId = "Selecciona al menos una incidencia vinculada.";
  }

  if (!current.concepto || current.concepto.length < 3) {
    errors.concepto = "Indica un concepto válido.";
  }

  if (!current.descripcion || current.descripcion.length < 4) {
    errors.descripcion = "Indica una descripción mínima.";
  }

  if (number(current.cantidad, 0) <= 0) {
    errors.cantidad = "Cantidad inválida.";
  }

  if (number(current.precioUnitario, 0) <= 0) {
    errors.precioUnitario = "Precio inválido.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: current,
    breakdown: getInvoiceBreakdown(current),
  };
}

export function getFacturaCreateTemplateSnapshot() {
  return {
    version: FACTURAS_CREATE_TEMPLATE_VERSION,

    actions: FACTURA_CREATE_ACTIONS,

    fields: [
      "fechaServicio",
      "formaPago",
      "estadoPago",
      "sendEmail",
      "concepto",
      "descripcion",
      "cantidad",
      "precioUnitario",
      "clienteSearch",
      "ticketSearch",
    ],

    policy: {
      templateOnly: true,
      noAppCore: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStateExternal: true,
      noListeners: true,
      noDomApi: true,
      noToast: true,
      noBridgeGlobal: true,

      clientSearchMarkup: true,
      ticketSearchMarkup: true,
      multiClientMarkup: true,
      multiTicketMarkup: true,
      totalsPreview: true,
      stableDomIslands: true,
      searchInputsRemainMounted: true,
      liveTotalsWithoutFullRender: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderCreateModal = renderFacturasCreateModal;
export const renderCreateModalClosed = renderFacturasCreateModalClosed;

export default renderFacturasCreateModal;

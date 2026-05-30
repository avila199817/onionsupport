/* =========================================================
   Onion Support - Incidencias Create Template
   Archivo: /src/views/incidencias/incidencias.template.create.js

   Responsabilidad:
   - Render HTML puro del modal de creación de incidencia.
   - Formulario de creación.
   - Buscador de usuario afectado sólo para admin.
   - Adjuntos iniciales.
   - Estados visuales: loading, errors, success.
   - Exponer data-field/data-action para index.js.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin State externo.
   - Sin listeners.
   - Sin DOM API.
   - Sin Toast.
   - Sin lógica de creación real.
========================================================= */

export const INCIDENCIAS_CREATE_TEMPLATE_VERSION =
  "incidencias.template.create.v1";

export const CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  SUBMIT: "create-submit",

  USER_SEARCH: "create-user-search",
  USER_SELECT: "create-user-select",
  USER_CLEAR: "create-user-clear",

  ATTACHMENTS_ADD: "create-attachments-add",
  ATTACHMENT_REMOVE: "create-attachment-remove",
});

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";
const FORM_ID = "incidencias-create-form";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const CATEGORY_OPTIONS = Object.freeze([
  { value: "general", label: "General" },
  { value: "technical", label: "Técnica" },
  { value: "billing", label: "Facturación" },
  { value: "access", label: "Acceso" },
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "account", label: "Cuenta" },
]);

const PRIORITY_OPTIONS = Object.freeze([
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
]);

const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetUserName: "",
  targetUserEmail: "",
  targetUserAvatar: "",

  subject: "",
  description: "",

  priority: "medium",
  status: "open",
  category: "general",
  source: "panel",

  attachments: [],
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

function formatBytes(bytes = 0) {
  const size = number(bytes, 0);

  if (!size || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 18H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    user: `<svg ${common}><path d="M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.75 20.75a7.25 7.25 0 0 1 14.5 0"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   VIEW MODEL
========================================================= */

function normalizeUserResult(user = {}) {
  const raw = safeObject(user);
  const id = cleanText(first(raw.userId, raw.id, raw.uid, raw.sub, raw.username), "");
  const name = cleanText(
    first(raw.displayName, raw.fullName, raw.name, raw.nombre, raw.username),
    "Usuario"
  );

  return {
    id,
    userId: id,
    displayName: name,
    name,
    username: cleanText(first(raw.username, raw.userName, ""), ""),
    role: cleanText(first(raw.role, raw.rol, Array.isArray(raw.roles) ? raw.roles[0] : ""), "user"),
    avatarUrl: safeImageSrc(first(raw.avatarUrl, raw.avatar, raw.picture, raw.photoUrl, raw.profile?.avatarUrl, "")),
    initials: cleanText(raw.initials, initialsFrom(name)),
  };
}

function normalizeForm(form = {}) {
  const input = {
    ...DEFAULT_FORM,
    ...safeObject(form),
  };

  return {
    targetUserId: cleanText(first(input.targetUserId, input.userId, input.usuarioId), ""),
    targetUserName: cleanText(first(input.targetUserName, input.userName, input.clienteNombre, input.clientName), ""),
    targetUserEmail: cleanText(first(input.targetUserEmail, input.userEmail, input.clienteEmail, input.clientEmail), ""),
    targetUserAvatar: safeImageSrc(first(input.targetUserAvatar, input.userAvatar, input.clienteAvatar, input.avatar, input.avatarUrl)),

    subject: cleanText(first(input.subject, input.asunto, input.title), ""),
    description: cleanText(first(input.description, input.descripcion, input.message, input.body), ""),

    priority: cleanText(input.priority, "medium"),
    status: cleanText(input.status, "open"),
    category: cleanText(input.category, "general"),
    source: cleanText(input.source, "panel"),

    attachments: safeArray(input.attachments),
  };
}

function buildVm(input = {}) {
  const data = safeObject(input);
  const form = normalizeForm(data.form || data.draft || {});
  const errors = safeObject(data.errors);
  const userSearch = safeObject(data.userSearch);

  const selectedUser = form.targetUserId
    ? normalizeUserResult({
        userId: form.targetUserId,
        displayName: form.targetUserName,
        avatarUrl: form.targetUserAvatar,
      })
    : normalizeUserResult(userSearch.selectedUser || {});

  return {
    open: data.open === true,

    admin: data.admin === true || data.role === "admin",

    submitting: data.submitting === true,
    loading: data.loading === true,
    dragActive: data.dragActive === true,

    serverError: cleanText(data.serverError || data.error, ""),
    successMessage: cleanText(data.successMessage, ""),
    createdTicketId: cleanText(data.createdTicketId, ""),

    form,
    errors,

    userSearch: {
      query: cleanText(userSearch.query || data.userSearchQuery, ""),
      loading: userSearch.loading === true,
      error: cleanText(userSearch.error, ""),
      results: safeArray(userSearch.results).map(normalizeUserResult).filter((item) => item.id),
      selectedUser: selectedUser.id ? selectedUser : null,
      empty:
        userSearch.empty === true ||
        (
          cleanText(userSearch.query || "", "").length >= 2 &&
          userSearch.loading !== true &&
          !safeArray(userSearch.results).length
        ),
    },
  };
}

/* =========================================================
   FIELD PARTIALS
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

  return `<span class="inc-create-error">${escapeHtml(text)}</span>`;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  type = "text",
  placeholder = "",
  required = false,
  error = "",
  autocomplete = "off",
  disabled = false,
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <input
        class="inc-create-input ${error ? "is-error" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        type="${attr(type)}"
        value="${attr(value)}"
        placeholder="${attr(placeholder)}"
        autocomplete="${attr(autocomplete)}"
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
  required = false,
  error = "",
  rows = 5,
  disabled = false,
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <textarea
        class="inc-create-textarea ${error ? "is-error" : ""}"
        data-field="${attr(name)}"
        name="${attr(name)}"
        rows="${number(rows, 5)}"
        placeholder="${attr(placeholder)}"
        ${disabledAttrs(disabled, disabled)}
      >${escapeHtml(value)}</textarea>

      ${renderFieldError(error)}
    </label>
  `;
}

function optionSelected(value = "", current = "") {
  return String(value) === String(current) ? "selected" : "";
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
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <span class="inc-create-select-wrap">
        <select
          class="inc-create-select ${error ? "is-error" : ""}"
          data-field="${attr(name)}"
          name="${attr(name)}"
          ${disabledAttrs(disabled, disabled)}
        >
          ${safeArray(options).map((option) => {
            const optionValue = cleanText(option.value, "");
            const optionLabel = cleanText(option.label, optionValue);

            return `
              <option value="${attr(optionValue)}" ${optionSelected(optionValue, value)}>
                ${escapeHtml(optionLabel)}
              </option>
            `;
          }).join("")}
        </select>

        <span class="inc-create-select-chevron" aria-hidden="true">⌄</span>
      </span>

      ${renderFieldError(error)}
    </label>
  `;
}

/* =========================================================
   ADMIN USER SEARCH
========================================================= */

function renderUserAvatar(user = {}) {
  const item = normalizeUserResult(user);
  const image = safeImageSrc(item.avatarUrl);

  return `
    <span
      class="inc-create-user-avatar ${image ? "has-image" : "is-fallback"}"
      aria-hidden="true"
    >
      ${
        image
          ? `<img src="${attr(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
          : ""
      }
      <span>${escapeHtml(item.initials || initialsFrom(item.displayName))}</span>
    </span>
  `;
}

function renderSelectedUser(vm = {}) {
  const selected = vm.userSearch.selectedUser;
  const form = vm.form;

  if (!selected?.id && !form.targetUserId) return "";

  const user = selected?.id
    ? selected
    : normalizeUserResult({
        userId: form.targetUserId,
        displayName: form.targetUserName,
        avatarUrl: form.targetUserAvatar,
      });

  return `
    <section class="inc-create-selected-user" data-create-selected-user="true">
      <div class="inc-create-selected-user-main">
        ${renderUserAvatar(user)}

        <span class="inc-create-selected-user-copy">
          <strong>${escapeHtml(user.displayName || "Usuario seleccionado")}</strong>
          <span>${escapeHtml(user.username || user.userId || user.id)}</span>
        </span>
      </div>

      <button
        type="button"
        class="inc-create-selected-user-clear"
        data-create-action="${CREATE_ACTIONS.USER_CLEAR}"
        data-incidencias-action="${CREATE_ACTIONS.USER_CLEAR}"
        data-action="${CREATE_ACTIONS.USER_CLEAR}"
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
      <div class="inc-create-user-search-state" data-user-search-state="loading">
        <span class="inc-create-spinner" aria-hidden="true"></span>
        Buscando usuarios...
      </div>
    `;
  }

  if (search.error) {
    return `
      <div class="inc-create-user-search-state is-error" data-user-search-state="error">
        ${escapeHtml(search.error)}
      </div>
    `;
  }

  if (search.empty) {
    return `
      <div class="inc-create-user-search-state" data-user-search-state="empty">
        No hay usuarios para esta búsqueda.
      </div>
    `;
  }

  if (!search.results.length) return "";

  return `
    <div class="inc-create-user-results" role="listbox" data-create-user-results="true">
      ${search.results.map((user) => `
        <button
          type="button"
          class="inc-create-user-result"
          role="option"
          data-create-action="${CREATE_ACTIONS.USER_SELECT}"
          data-incidencias-action="${CREATE_ACTIONS.USER_SELECT}"
          data-action="${CREATE_ACTIONS.USER_SELECT}"
          data-user-id="${attr(user.userId || user.id)}"
          data-user-name="${attr(user.displayName)}"
          data-user-avatar="${attr(user.avatarUrl)}"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >
          ${renderUserAvatar(user)}

          <span class="inc-create-user-result-copy">
            <strong>${escapeHtml(user.displayName)}</strong>
            <span>${escapeHtml([user.username, user.role].filter(Boolean).join(" · "))}</span>
          </span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderAdminUserSearch(vm = {}) {
  if (!vm.admin) return "";

  return `
    <section class="inc-create-block inc-create-block--user-search" data-create-admin-user-search="true">
      <div class="inc-create-block-head">
        <div>
          <strong>Usuario afectado</strong>
          <span>Busca el usuario para crear la incidencia en su nombre.</span>
        </div>
      </div>

      ${renderSelectedUser(vm)}

      <label class="inc-create-field">
        <span class="inc-create-label">Buscar usuario</span>

        <span class="inc-create-search-control">
          <span class="inc-create-search-icon" aria-hidden="true">${icon("search")}</span>

          <input
            class="inc-create-input inc-create-user-search-input"
            data-field="targetUserSearch"
            data-create-user-search-input="true"
            name="targetUserSearch"
            type="search"
            value="${attr(vm.userSearch.query)}"
            placeholder="Nombre, usuario o ID"
            autocomplete="off"
            spellcheck="false"
            aria-autocomplete="list"
            aria-expanded="${vm.userSearch.results.length ? "true" : "false"}"
            ${disabledAttrs(vm.submitting, vm.submitting)}
          >
        </span>
      </label>

      <input type="hidden" data-field="targetUserId" name="targetUserId" value="${attr(vm.form.targetUserId)}">
      <input type="hidden" data-field="targetUserName" name="targetUserName" value="${attr(vm.form.targetUserName)}">
      <input type="hidden" data-field="targetUserAvatar" name="targetUserAvatar" value="${attr(vm.form.targetUserAvatar)}">

      ${renderUserSearchResults(vm)}
    </section>
  `;
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function fileName(file = {}, index = 0) {
  return cleanText(file.name || file.filename || file.fileName, `Adjunto ${index + 1}`);
}

function fileSize(file = {}) {
  return number(file.size || file.sizeBytes, 0);
}

function renderFilesSummary(files = []) {
  const items = safeArray(files);

  if (!items.length) return "";

  return `
    <div class="inc-create-files-list">
      ${items.map((file, index) => `
        <div class="inc-create-file-row">
          <div class="inc-create-file-meta">
            <strong class="inc-create-file-name">${escapeHtml(fileName(file, index))}</strong>
            <span class="inc-create-file-size">
              ${escapeHtml([cleanText(file.type || file.contentType, ""), formatBytes(fileSize(file))].filter(Boolean).join(" · "))}
            </span>
          </div>

          <button
            type="button"
            data-create-action="${CREATE_ACTIONS.ATTACHMENT_REMOVE}"
            data-incidencias-action="${CREATE_ACTIONS.ATTACHMENT_REMOVE}"
            data-action="${CREATE_ACTIONS.ATTACHMENT_REMOVE}"
            data-remove-attachment="${attr(String(index))}"
            class="inc-create-file-remove"
          >
            ${icon("trash")}
            <span>Quitar</span>
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFileInput(vm = {}) {
  const files = safeArray(vm.form.attachments);
  const error = cleanText(vm.errors.attachments, "");
  const countText = files.length === 0
    ? "Opcional"
    : files.length === 1
      ? "1 archivo"
      : `${files.length} archivos`;

  return `
    <section class="inc-create-files-card">
      <div class="inc-create-files-head">
        <strong>${icon("paperclip")} Adjuntos</strong>
        <span>${escapeHtml(countText)}</span>
      </div>

      <label
        data-dropzone="attachments"
        class="inc-create-dropzone ${vm.dragActive ? "is-active" : ""} ${error ? "is-error" : ""}"
      >
        <input
          id="incidencias-create-attachments-input"
          data-field="attachments"
          name="attachments"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          class="inc-create-hidden-input"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >

        <div class="inc-create-dropzone-copy">
          <strong>Arrastra archivos o pulsa para seleccionar</strong>
          <span>Máximo ${MAX_FILES} archivos · ${formatBytes(MAX_FILE_SIZE)} por archivo.</span>
        </div>
      </label>

      ${renderFieldError(error)}
      ${renderFilesSummary(files)}
    </section>
  `;
}

/* =========================================================
   ALERTS / STATES
========================================================= */

function renderAlert(type = "info", title = "", body = "") {
  const safeTitle = cleanText(title, "");
  const safeBody = cleanText(body, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${attr(type)}">
      <span class="inc-create-alert-icon">
        ${type === "success" ? icon("check") : type === "error" ? icon("alert") : icon("ticket")}
      </span>

      <span class="inc-create-alert-copy">
        ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
        ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
      </span>
    </div>
  `;
}

function renderLoadingOverlay(label = "Creando incidencia...") {
  return `
    <div class="inc-create-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="inc-create-loading-card">
        <span class="inc-create-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderIncidenciasCreateModal(input = {}) {
  const vm = buildVm(input);

  if (!vm.open) return "";

  return `
    <section
      id="${MODAL_ID}"
      class="inc-create-modal-root"
      data-incidencias-create-root="true"
      data-template-version="${attr(INCIDENCIAS_CREATE_TEMPLATE_VERSION)}"
    >
      <div data-incidencias-create-modal-overlay="true" class="inc-create-overlay">
        <div
          id="${PANEL_ID}"
          data-incidencias-create-modal-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incidencias-create-modal-title"
          tabindex="-1"
          class="inc-create-panel ${vm.submitting ? "is-submitting" : ""}"
        >
          ${vm.submitting ? renderLoadingOverlay("Creando incidencia...") : ""}

          <div class="inc-create-header">
            <div class="inc-create-header-copy">
              <h2 id="incidencias-create-modal-title">Crear incidencia</h2>
              <p>
                Define el asunto, clasifica el caso y adjunta documentos si hace falta.
              </p>
            </div>

            <button
              type="button"
              data-create-action="${CREATE_ACTIONS.CLOSE}"
              data-incidencias-action="${CREATE_ACTIONS.CLOSE}"
              data-action="${CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar modal"
              ${disabledAttrs(vm.submitting, vm.submitting)}
              class="inc-create-close"
            >
              ${icon("close")}
            </button>
          </div>

          <div class="inc-create-body">
            ${vm.successMessage
              ? renderAlert(
                  "success",
                  "Incidencia creada.",
                  vm.createdTicketId ? `Referencia: ${vm.createdTicketId}` : vm.successMessage
                )
              : ""
            }

            ${vm.serverError
              ? renderAlert("error", "No se pudo crear la incidencia.", vm.serverError)
              : ""
            }

            <form
              id="${FORM_ID}"
              data-incidencias-create-form="true"
              novalidate
              class="inc-create-form"
            >
              ${renderAdminUserSearch(vm)}

              ${renderInput({
                label: "Asunto",
                name: "subject",
                value: vm.form.subject,
                placeholder: "Ej. Error al pagar, acceso bloqueado, factura incorrecta...",
                required: true,
                error: vm.errors.subject,
                disabled: vm.submitting,
              })}

              <div class="inc-create-grid inc-create-grid--2">
                ${renderSelect({
                  label: "Categoría",
                  name: "category",
                  value: vm.form.category,
                  options: CATEGORY_OPTIONS,
                  required: true,
                  error: vm.errors.category,
                  disabled: vm.submitting,
                })}

                ${renderSelect({
                  label: "Prioridad",
                  name: "priority",
                  value: vm.form.priority,
                  options: PRIORITY_OPTIONS,
                  required: true,
                  error: vm.errors.priority,
                  disabled: vm.submitting,
                })}
              </div>

              ${renderTextarea({
                label: "Descripción",
                name: "description",
                value: vm.form.description,
                placeholder: "Describe qué ocurre, desde cuándo pasa y qué necesita revisar soporte.",
                required: true,
                error: vm.errors.description,
                rows: 5,
                disabled: vm.submitting,
              })}

              ${renderFileInput(vm)}

              <div class="inc-create-actions">
                <button
                  id="incidencias-create-submit-btn"
                  type="submit"
                  data-create-action="${CREATE_ACTIONS.SUBMIT}"
                  data-incidencias-action="${CREATE_ACTIONS.SUBMIT}"
                  data-action="${CREATE_ACTIONS.SUBMIT}"
                  ${disabledAttrs(vm.submitting, vm.submitting)}
                  class="inc-create-submit"
                >
                  <span class="inc-create-submit-inner">
                    ${
                      vm.submitting
                        ? `<span class="inc-create-spinner" aria-hidden="true"></span>Creando...`
                        : "Crear incidencia"
                    }
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderIncidenciasCreateModalClosed() {
  return "";
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getCreateFormDefaults() {
  return {
    ...DEFAULT_FORM,
    attachments: [],
  };
}

export function validateCreateForm(form = {}) {
  const current = normalizeForm(form);
  const errors = {};

  if (!current.subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (current.subject.length < 4) {
    errors.subject = "Mínimo 4 caracteres.";
  }

  if (!current.description) {
    errors.description = "La descripción es obligatoria.";
  } else if (current.description.length < 8) {
    errors.description = "Mínimo 8 caracteres.";
  }

  const category = normalizeKey(current.category);
  const priority = normalizeKey(current.priority);

  if (!CATEGORY_OPTIONS.some((item) => item.value === category)) {
    errors.category = "Selecciona una categoría válida.";
  }

  if (!PRIORITY_OPTIONS.some((item) => item.value === priority)) {
    errors.priority = "Selecciona una prioridad válida.";
  }

  if (current.attachments.length > MAX_FILES) {
    errors.attachments = `No puedes adjuntar más de ${MAX_FILES} archivos.`;
  }

  for (const file of current.attachments) {
    if (number(file?.size, 0) > MAX_FILE_SIZE) {
      errors.attachments = `El archivo ${cleanText(file?.name, "archivo")} supera el máximo de ${formatBytes(MAX_FILE_SIZE)}.`;
      break;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: current,
  };
}

export function getCreateTemplateSnapshot() {
  return {
    version: INCIDENCIAS_CREATE_TEMPLATE_VERSION,

    actions: CREATE_ACTIONS,

    fields: [
      "targetUserSearch",
      "targetUserId",
      "targetUserName",
      "targetUserAvatar",
      "subject",
      "category",
      "priority",
      "description",
      "attachments",
    ],

    admin: {
      userSearch: true,
      actionSearch: CREATE_ACTIONS.USER_SEARCH,
      actionSelect: CREATE_ACTIONS.USER_SELECT,
      actionClear: CREATE_ACTIONS.USER_CLEAR,
    },

    policy: {
      templateOnly: true,
      adminUserSearchMarkup: true,

      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStateExternal: true,
      noListeners: true,
      noDomApi: true,
      noToast: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderCreateModal = renderIncidenciasCreateModal;
export const renderCreateModalClosed = renderIncidenciasCreateModalClosed;

export default renderIncidenciasCreateModal;

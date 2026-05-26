/* =========================================================
   Onion Support - Incidencias Create Modal
   Archivo: /src/views/incidencias/incidencias.create.modal.js

   Responsabilidad:
   - Modal singleton de creación de incidencia.
   - Renderizar formulario, validación básica y adjuntos iniciales.
   - Delegar creación real a incidencias.actions.js.
   - Sin llamadas HTTP directas.
   - Sin búsqueda de usuarios directa.
   - Sin registrar globals.
   - Sin rutas inventadas.
   - Sin estilos ni eventos inline.
   - Sin leer Router/Auth/Store.
========================================================= */

import {
  incidenciasState,
  setCreating,
  setCreateDraft,
  clearCreateDraft,
  patchCreateViewState,
  resetCreateViewState,
} from "./incidencias.state.js";

import {
  createIncidenciaAction,
} from "./incidencias.actions.js";

import {
  BrowserDocument,
  BrowserWindow,

  isObject,
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  first,

  escapeHtml,
  normalizeWhitespace,
  safeImageSrc,
  formatBytes,
  showToast,
  safeEmit,
  getErrorMessage,
} from "./incidencias.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_CREATE_MODAL_VERSION = "incidencias.create.modal.v2.optimized";

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const BODY_CLASS_MODAL_OPEN = "modal-open";
const BODY_CLASS_INCIDENCIAS_CREATE_OPEN = "incidencias-create-open";
const BODY_CLASS_INCIDENCIAS_MODAL_OPEN = "incidencias-modal-open";

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

const ALLOWED_EXTENSIONS = Object.freeze([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "pdf",
  "txt",
  "csv",
  "zip",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

const ALLOWED_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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
   LOCAL STATE
========================================================= */

const modalState = {
  isOpen: false,
  bindingsAttached: false,
  rootAbortController: null,
  rootCleanups: [],

  escHandler: null,
  lastActiveElement: null,

  submitting: false,
  dragActive: false,

  errors: {},
  serverError: "",
  successMessage: "",
  createdTicketId: "",

  form: {
    ...DEFAULT_FORM,
    attachments: [],
  },
};

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return Boolean(BrowserWindow && BrowserDocument);
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length);
}

function htmlAttrs(attrs = {}) {
  return Object.entries(safeObject(attrs))
    .map(([key, value]) => {
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return escapeHtml(key);

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function disabledAttr(disabled = false, busy = false) {
  return htmlAttrs({
    disabled: Boolean(disabled),
    "aria-disabled": disabled ? "true" : false,
    "aria-busy": busy ? "true" : false,
  });
}

function getDocument() {
  return isBrowser() ? BrowserDocument : null;
}

function rootContains(root = null, element = null) {
  try {
    return Boolean(root && element && (root === element || root.contains(element)));
  } catch {
    return false;
  }
}

function emit(eventName = "", payload = {}) {
  return safeEmit(eventName, payload);
}

function setCreatingSafe(value = false) {
  try {
    setCreating(Boolean(value));
  } catch {
    try {
      incidenciasState.creating = Boolean(value);
    } catch {}
  }
}

/* =========================================================
   FILE HELPERS
========================================================= */

function getFileListFromInput(target) {
  try {
    return Array.from(target?.files || []);
  } catch {
    return [];
  }
}

function formatFileSize(bytes = 0) {
  try {
    return formatBytes(bytes);
  } catch {
    const size = Number(bytes);

    if (!Number.isFinite(size) || size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;

    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

function getFileExtension(filename = "") {
  const clean = safeLower(filename, "");
  const index = clean.lastIndexOf(".");

  return index === -1 ? "" : clean.slice(index + 1);
}

function dedupeFiles(files = []) {
  const map = new Map();

  safeArray(files).forEach((file, index) => {
    if (!isFile(file) && !isBlob(file)) return;

    const key = [
      safeText(file.name, `blob-${index + 1}`),
      safeNumber(file.size, 0),
      safeNumber(file.lastModified, 0),
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) map.set(key, file);
  });

  return Array.from(map.values());
}

function isAllowedFile(file = null) {
  if (!isFile(file) && !isBlob(file)) return false;

  const mimetype = safeLower(file.type, "");
  const ext = getFileExtension(file.name);

  if (mimetype && ALLOWED_MIME_TYPES.includes(mimetype)) return true;

  return Boolean(ext && ALLOWED_EXTENSIONS.includes(ext));
}

function validateFiles(files = []) {
  const list = dedupeFiles(files);
  const errors = [];

  if (list.length > MAX_FILES) {
    errors.push(`No puedes adjuntar más de ${MAX_FILES} archivos.`);
  }

  for (const file of list) {
    if (!isAllowedFile(file)) {
      errors.push(`Tipo de archivo no permitido: ${safeText(file.name, "archivo")}.`);
      continue;
    }

    if (safeNumber(file.size, 0) > MAX_FILE_SIZE) {
      errors.push(`El archivo ${safeText(file.name, "archivo")} supera el máximo de ${formatFileSize(MAX_FILE_SIZE)}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    files: list.slice(0, MAX_FILES),
  };
}

/* =========================================================
   STATE HELPERS
========================================================= */

function validateOption(value = "", options = [], fallback = "") {
  const key = safeText(value, fallback);

  return safeArray(options).some((item) => item.value === key)
    ? key
    : fallback;
}

function getInitialForm(draft = {}) {
  const stateDraft = safeObject(incidenciasState?.createDraft);
  const input = {
    ...stateDraft,
    ...safeObject(draft),
  };

  return {
    targetUserId: safeText(first(input.targetUserId, input.userId), ""),
    targetUserName: safeText(first(input.targetUserName, input.userName, input.clientName, input.clienteNombre), ""),
    targetUserEmail: safeText(first(input.targetUserEmail, input.userEmail, input.clientEmail, input.clienteEmail), ""),
    targetUserAvatar: safeImageSrc(first(input.targetUserAvatar, input.userAvatar, input.clientAvatar, input.avatar, input.avatarUrl)),

    subject: safeText(first(input.subject, input.asunto, input.title), ""),
    description: safeText(first(input.description, input.descripcion, input.message, input.body), ""),

    priority: validateOption(first(input.priority, input.prioridad, "medium"), PRIORITY_OPTIONS, "medium"),
    status: safeText(first(input.status, input.estado, "open"), "open"),
    category: validateOption(first(input.category, input.categoria, input.tipo, "general"), CATEGORY_OPTIONS, "general"),
    source: safeText(first(input.source, input.origen, "panel"), "panel"),

    attachments: dedupeFiles(input.attachments),
  };
}

function persistDraft() {
  const form = safeObject(modalState.form);

  const draft = {
    targetUserId: safeText(form.targetUserId, ""),
    targetUserName: safeText(form.targetUserName, ""),
    targetUserEmail: safeText(form.targetUserEmail, ""),
    targetUserAvatar: safeImageSrc(form.targetUserAvatar),

    userId: safeText(form.targetUserId, ""),
    userName: safeText(form.targetUserName, ""),
    userEmail: safeText(form.targetUserEmail, ""),
    userAvatar: safeImageSrc(form.targetUserAvatar),

    subject: safeText(form.subject, ""),
    description: safeText(form.description, ""),
    priority: safeText(form.priority, "medium"),
    status: safeText(form.status, "open"),
    category: safeText(form.category, "general"),
    source: safeText(form.source, "panel"),
  };

  try {
    setCreateDraft(draft);
  } catch {
    try {
      incidenciasState.createDraft = draft;
    } catch {}
  }

  try {
    patchCreateViewState({
      form: draft,
    });
  } catch {}

  return draft;
}

function clearDraft() {
  try {
    clearCreateDraft();
  } catch {}

  try {
    patchCreateViewState({
      form: {
        ...DEFAULT_FORM,
        attachments: [],
      },
    });
  } catch {}
}

function setFormPatch(patch = {}) {
  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(patch),
  };

  modalState.form.priority = validateOption(modalState.form.priority, PRIORITY_OPTIONS, "medium");
  modalState.form.category = validateOption(modalState.form.category, CATEGORY_OPTIONS, "general");
  modalState.form.status = safeText(modalState.form.status, "open");
  modalState.form.source = safeText(modalState.form.source, "panel");
  modalState.form.targetUserAvatar = safeImageSrc(modalState.form.targetUserAvatar);
  modalState.form.attachments = dedupeFiles(modalState.form.attachments);

  persistDraft();

  return modalState.form;
}

function resetFeedbackState() {
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";

  try {
    patchCreateViewState({
      errors: {},
      serverError: "",
      createdTicketId: "",
      successMessage: "",
    });
  } catch {}
}

function resetFormState() {
  modalState.form = {
    ...DEFAULT_FORM,
    attachments: [],
  };
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const subject = normalizeWhitespace(current.subject);
  const description = normalizeWhitespace(current.description);

  if (!subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (subject.length < 4) {
    errors.subject = "Mínimo 4 caracteres.";
  }

  if (!description) {
    errors.description = "La descripción es obligatoria.";
  } else if (description.length < 8) {
    errors.description = "Mínimo 8 caracteres.";
  }

  const priority = validateOption(current.priority, PRIORITY_OPTIONS, "medium");
  const category = validateOption(current.category, CATEGORY_OPTIONS, "general");

  if (!priority) errors.priority = "Selecciona una prioridad válida.";
  if (!category) errors.category = "Selecciona una categoría válida.";

  const fileValidation = validateFiles(current.attachments);

  if (!fileValidation.valid) {
    errors.attachments = fileValidation.errors[0] || "Adjuntos no válidos.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    files: fileValidation.files,
  };
}

function buildPayload(form = {}) {
  const current = safeObject(form);

  const subject = normalizeWhitespace(current.subject);
  const description = normalizeWhitespace(current.description);
  const priority = validateOption(current.priority, PRIORITY_OPTIONS, "medium");
  const status = safeText(current.status, "open");
  const category = validateOption(current.category, CATEGORY_OPTIONS, "general");
  const source = safeText(current.source, "panel");
  const targetUserId = safeText(current.targetUserId, "");
  const targetUserName = safeText(current.targetUserName, "");
  const targetUserEmail = safeText(current.targetUserEmail, "");
  const targetUserAvatar = safeImageSrc(current.targetUserAvatar);

  return {
    subject,
    asunto: subject,
    title: subject,

    description,
    descripcion: description,
    message: description,
    body: description,

    priority,
    prioridad: priority,

    status,
    estado: status,

    category,
    categoria: category,
    tipo: category,

    source,
    origen: source,
    channel: source,

    ...(targetUserId
      ? {
          userId: targetUserId,
          clienteId: targetUserId,
          targetUserId,
          receptorUserId: targetUserId,
          targetUserName,
          targetUserEmail,
          targetUserAvatar,
          clienteNombre: targetUserName,
          clienteEmail: targetUserEmail,
          clienteAvatar: targetUserAvatar,
          clientName: targetUserName,
          clientEmail: targetUserEmail,
          clientAvatar: targetUserAvatar,
          name: targetUserName,
          email: targetUserEmail,
          avatar: targetUserAvatar,
          avatarUrl: targetUserAvatar,
        }
      : {}),

    attachments: dedupeFiles(current.attachments),
  };
}

function resolveCreatedTicketId(detail = null) {
  const item = safeObject(detail);

  return safeText(
    first(
      item.ticketId,
      item.id,
      item.code,
      item.ticketCode,
      item.incidenciaId,
      item.raw?.ticketId,
      item.raw?.id,
      item.raw?.code,
      item.raw?.ticketCode,
      item.raw?.incidenciaId
    ),
    ""
  );
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = "aria-hidden=\"true\" focusable=\"false\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"";

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 18H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   TEMPLATE HELPERS
========================================================= */

function renderFieldError(message = "") {
  const text = safeText(message, "");
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
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <input
        class="inc-create-input ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="${escapeHtml(autocomplete)}"
        ${disabledAttr(modalState.submitting, modalState.submitting)}
      />

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
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <textarea
        class="inc-create-textarea ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        rows="${Number(rows) || 5}"
        placeholder="${escapeHtml(placeholder)}"
        ${disabledAttr(modalState.submitting, modalState.submitting)}
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
  required = false,
  error = "",
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>

      <span class="inc-create-select-wrap">
        <select
          class="inc-create-select ${error ? "is-error" : ""}"
          data-field="${escapeHtml(name)}"
          name="${escapeHtml(name)}"
          ${disabledAttr(modalState.submitting, modalState.submitting)}
        >
          ${safeArray(options).map((option) => {
            const optionValue = safeText(option.value, "");
            const optionLabel = safeText(option.label, optionValue);

            return `
              <option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>
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

function renderTargetUserSummary() {
  const form = safeObject(modalState.form);
  const targetUserId = safeText(form.targetUserId, "");

  if (!targetUserId) return "";

  const name = safeText(form.targetUserName, "Usuario seleccionado");
  const email = safeText(form.targetUserEmail, "");

  return `
    <section class="inc-create-block inc-create-block--target">
      <div class="inc-create-block-head">
        <div>
          <strong>Usuario afectado</strong>
          <span>${escapeHtml(email ? `${name} · ${email}` : `${name} · ${targetUserId}`)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderFilesSummary(files = []) {
  const items = safeArray(files);

  if (!items.length) return "";

  return `
    <div class="inc-create-files-list">
      ${items.map((file, index) => `
        <div class="inc-create-file-row">
          <div class="inc-create-file-meta">
            <strong class="inc-create-file-name">${escapeHtml(safeText(file?.name, `Adjunto ${index + 1}`))}</strong>
            <span class="inc-create-file-size">${escapeHtml([safeText(file?.type, ""), formatFileSize(file?.size)].filter(Boolean).join(" · "))}</span>
          </div>

          <button
            type="button"
            data-modal-action="remove-attachment"
            data-remove-attachment="${escapeHtml(String(index))}"
            class="inc-create-file-remove"
            ${disabledAttr(modalState.submitting, modalState.submitting)}
          >
            ${icon("trash")}
            <span>Quitar</span>
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFileInput({ files = [], dragActive = false, error = "" } = {}) {
  const items = safeArray(files);
  const countText = items.length === 0
    ? "Opcional"
    : items.length === 1
      ? "1 archivo"
      : `${items.length} archivos`;

  return `
    <section class="inc-create-files-card">
      <div class="inc-create-files-head">
        <strong>${icon("paperclip")} Adjuntos</strong>
        <span>${escapeHtml(countText)}</span>
      </div>

      <label
        data-dropzone="attachments"
        class="inc-create-dropzone ${dragActive ? "is-active" : ""} ${error ? "is-error" : ""}"
      >
        <input
          id="incidencias-create-attachments-input"
          data-field="attachments"
          name="attachments"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          class="inc-create-hidden-input"
          ${disabledAttr(modalState.submitting, modalState.submitting)}
        />

        <div class="inc-create-dropzone-copy">
          <strong>Arrastra archivos o pulsa para seleccionar</strong>
          <span>Máximo ${MAX_FILES} archivos · ${formatFileSize(MAX_FILE_SIZE)} por archivo.</span>
        </div>
      </label>

      ${renderFieldError(error)}
      ${renderFilesSummary(items)}
    </section>
  `;
}

function renderAlert(type = "info", title = "", text = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${escapeHtml(type)}">
      <span class="inc-create-alert-icon">${type === "success" ? icon("check") : type === "error" ? icon("alert") : icon("ticket")}</span>
      <span class="inc-create-alert-copy">
        ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
        ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
      </span>
    </div>
  `;
}

function renderCreateLoadingOverlay(label = "Creando incidencia...") {
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
   MODAL TEMPLATE
========================================================= */

function renderModalInner() {
  const form = safeObject(modalState.form);
  const errors = safeObject(modalState.errors);
  const submitting = Boolean(modalState.submitting);
  const serverError = safeText(modalState.serverError, "");
  const successMessage = safeText(modalState.successMessage, "");
  const createdTicketId = safeText(modalState.createdTicketId, "");

  return `
    <div data-incidencias-create-modal-overlay="true" class="inc-create-overlay">
      <div
        id="${PANEL_ID}"
        data-incidencias-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-create-modal-title"
        tabindex="-1"
        class="inc-create-panel${submitting ? " is-submitting" : ""}"
      >
        ${submitting ? renderCreateLoadingOverlay("Creando incidencia...") : ""}

        <div class="inc-create-header">
          <div class="inc-create-header-copy">
            <h2 id="incidencias-create-modal-title">Crear incidencia</h2>
            <p>Define el asunto, clasifica el caso y adjunta documentos si hace falta.</p>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${disabledAttr(submitting, submitting)}
            class="inc-create-close"
          >
            ${icon("close")}
          </button>
        </div>

        <div class="inc-create-body">
          ${successMessage ? renderAlert("success", "Incidencia creada.", createdTicketId ? `Referencia: ${createdTicketId}` : successMessage) : ""}
          ${serverError ? renderAlert("error", "No se pudo crear la incidencia.", serverError) : ""}

          <form id="incidencias-create-form" novalidate class="inc-create-form">
            ${renderTargetUserSummary()}

            ${renderInput({
              label: "Asunto",
              name: "subject",
              value: form.subject,
              placeholder: "Ej. Error al pagar, acceso bloqueado, factura incorrecta...",
              required: true,
              error: errors.subject,
            })}

            <div class="inc-create-grid inc-create-grid--2">
              ${renderSelect({
                label: "Categoría",
                name: "category",
                value: validateOption(form.category, CATEGORY_OPTIONS, "general"),
                options: CATEGORY_OPTIONS,
                required: true,
                error: errors.category,
              })}

              ${renderSelect({
                label: "Prioridad",
                name: "priority",
                value: validateOption(form.priority, PRIORITY_OPTIONS, "medium"),
                options: PRIORITY_OPTIONS,
                required: true,
                error: errors.priority,
              })}
            </div>

            ${renderTextarea({
              label: "Descripción",
              name: "description",
              value: form.description,
              placeholder: "Describe qué ocurre, desde cuándo pasa y qué necesita revisar soporte.",
              required: true,
              error: errors.description,
              rows: 5,
            })}

            ${renderFileInput({
              files: safeArray(form.attachments),
              dragActive: Boolean(modalState.dragActive),
              error: errors.attachments,
            })}

            <div class="inc-create-actions">
              <button
                id="incidencias-create-submit-btn"
                type="submit"
                ${disabledAttr(submitting, submitting)}
                class="inc-create-submit"
              >
                <span class="inc-create-submit-inner">
                  ${submitting ? `<span class="inc-create-spinner" aria-hidden="true"></span>Creando...` : "Crear incidencia"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  return getDocument()?.getElementById?.(MODAL_ID) || null;
}

function ensureRoot() {
  const doc = getDocument();
  if (!doc) return null;

  const existing = Array.from(doc.querySelectorAll(`#${MODAL_ID}`));
  let root = existing[0];

  existing.slice(1).forEach((duplicate) => {
    try {
      duplicate.remove();
    } catch {}
  });

  if (root) return root;

  root = doc.createElement("div");
  root.id = MODAL_ID;
  root.setAttribute("data-incidencias-create-root", "true");
  doc.body.appendChild(root);

  return root;
}

function lockBody() {
  const doc = getDocument();
  if (!doc?.body) return false;

  try {
    doc.body.classList.add(
      BODY_CLASS_MODAL_OPEN,
      BODY_CLASS_INCIDENCIAS_CREATE_OPEN,
      BODY_CLASS_INCIDENCIAS_MODAL_OPEN
    );
    return true;
  } catch {
    return false;
  }
}

function unlockBody() {
  const doc = getDocument();
  if (!doc?.body) return false;

  try {
    doc.body.classList.remove(
      BODY_CLASS_INCIDENCIAS_CREATE_OPEN,
      BODY_CLASS_INCIDENCIAS_MODAL_OPEN
    );

    const hasAnyKnownModal =
      doc.querySelector?.(".inc-create-overlay") ||
      doc.querySelector?.(".incidencias-modal-overlay") ||
      doc.querySelector?.(".facturas-detail-overlay") ||
      doc.querySelector?.(".fac-create-overlay") ||
      doc.querySelector?.("[data-modal-open='true']");

    if (!hasAnyKnownModal) {
      doc.body.classList.remove(BODY_CLASS_MODAL_OPEN);
    }

    return true;
  } catch {
    return false;
  }
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

/* =========================================================
   ESC HANDLER
========================================================= */

function detachEscHandler() {
  const doc = getDocument();

  if (!modalState.escHandler || !doc) return;

  try {
    doc.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  const doc = getDocument();
  if (!doc) return;

  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape" && !modalState.submitting) {
      closeIncidenciasCreateModal();
    }
  };

  try {
    doc.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal() {
  const root = ensureRoot();

  if (!root) return null;

  if (!modalState.isOpen) {
    detachRootBindings();
    root.innerHTML = "";
    return root;
  }

  detachRootBindings();
  root.innerHTML = renderModalInner();
  modalState.bindingsAttached = false;

  attachRootBindings();

  return root;
}

function focusPanel() {
  try {
    getDocument()?.getElementById?.(PANEL_ID)?.focus?.();
  } catch {}
}

function focusField(fieldName = "") {
  try {
    const field = getRoot()?.querySelector?.(`[data-field="${fieldName}"]`);
    field?.focus?.();

    if (field && typeof field.setSelectionRange === "function" && typeof field.value === "string") {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }

    return Boolean(field);
  } catch {
    return false;
  }
}

function focusFirstInvalidField() {
  const errors = safeObject(modalState.errors);

  if (errors.subject && focusField("subject")) return true;
  if (errors.category && focusField("category")) return true;
  if (errors.priority && focusField("priority")) return true;
  if (errors.description && focusField("description")) return true;

  return false;
}

function focusPreferredField() {
  if (!safeText(modalState.form?.subject, "") && focusField("subject")) return true;
  if (!safeText(modalState.form?.description, "") && focusField("description")) return true;

  focusPanel();
  return true;
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

export function openIncidenciasCreateModal(draft = {}) {
  const doc = getDocument();
  if (!doc) return false;

  modalState.lastActiveElement = doc.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;
  modalState.dragActive = false;

  resetFeedbackState();

  modalState.form = getInitialForm(draft);
  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();

  setTimeout(() => {
    focusPreferredField();
  }, 0);

  emit("incidencias:create-modal:opened", {
    draft: persistDraft(),
  });

  return true;
}

export function closeIncidenciasCreateModal() {
  if (modalState.submitting) return false;

  const root = getRoot();

  modalState.isOpen = false;
  modalState.submitting = false;
  modalState.dragActive = false;

  resetFeedbackState();
  resetFormState();

  detachRootBindings();

  if (root) root.innerHTML = "";

  unlockBody();
  detachEscHandler();
  restoreFocus();

  emit("incidencias:create-modal:closed", {});

  return true;
}

export function updateIncidenciasCreateModal(draft = {}) {
  if (!modalState.isOpen) {
    return openIncidenciasCreateModal(draft);
  }

  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(draft),
    attachments: safeArray(modalState.form.attachments),
  };

  modalState.form.priority = validateOption(modalState.form.priority, PRIORITY_OPTIONS, "medium");
  modalState.form.category = validateOption(modalState.form.category, CATEGORY_OPTIONS, "general");
  modalState.form.targetUserAvatar = safeImageSrc(modalState.form.targetUserAvatar);

  persistDraft();
  renderModal();

  setTimeout(() => {
    focusPreferredField();
  }, 0);

  return true;
}

/* =========================================================
   SUBMIT FLOW
========================================================= */

async function handleSubmit() {
  if (modalState.submitting) return false;

  modalState.successMessage = "";
  modalState.createdTicketId = "";
  modalState.serverError = "";

  const validation = validateForm(modalState.form);
  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    focusFirstInvalidField();
    showToast("Revisa los campos obligatorios.", "warning");
    return false;
  }

  modalState.form.attachments = validation.files;

  const payload = buildPayload(modalState.form);

  modalState.submitting = true;
  setCreatingSafe(true);

  try {
    patchCreateViewState({
      submitting: true,
      serverError: "",
      errors: {},
      form: payload,
    });
  } catch {}

  renderModal();
  focusPanel();

  emit("incidencias:create:submit", {
    subject: payload.subject,
    priority: payload.priority,
    category: payload.category,
    attachmentsCount: safeArray(payload.attachments).length,
    targetUserId: safeText(payload.targetUserId, ""),
  });

  try {
    const detail = await createIncidenciaAction({
      payload,
      silent: true,
    });

    if (!detail) {
      throw new Error("CREATE_INCIDENCIA_EMPTY_RESPONSE");
    }

    const createdTicketId = resolveCreatedTicketId(detail);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "Incidencia creada.";
    modalState.createdTicketId = createdTicketId;

    setCreatingSafe(false);

    try {
      patchCreateViewState({
        submitting: false,
        errors: {},
        serverError: "",
        createdTicketId,
        successMessage: "Incidencia creada.",
      });
    } catch {}

    clearDraft();
    resetFormState();

    renderModal();
    focusPanel();

    showToast("Incidencia creada correctamente.", "success");

    emit("incidencias:create-modal:success", {
      ticketId: createdTicketId,
      detail,
    });

    setTimeout(() => {
      if (modalState.isOpen && !modalState.submitting) {
        closeIncidenciasCreateModal();
      }
    }, 420);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = getErrorMessage(error, "No se pudo crear la incidencia.");

    setCreatingSafe(false);

    try {
      patchCreateViewState({
        submitting: false,
        serverError: modalState.serverError,
      });
    } catch {}

    emit("incidencias:create-modal:error", {
      error,
      message: modalState.serverError,
    });

    renderModal();
    focusPreferredField();
    showToast(modalState.serverError, "error");

    return false;
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function addRootListener(root, eventName, handler, options = {}) {
  if (!root || typeof root.addEventListener !== "function") return false;

  try {
    root.addEventListener(eventName, handler, options);

    if (!options.signal) {
      modalState.rootCleanups.push(() => {
        try {
          root.removeEventListener(eventName, handler, options);
        } catch {}
      });
    }

    return true;
  } catch {
    return false;
  }
}

function addAttachments(files = []) {
  const merged = dedupeFiles([
    ...safeArray(modalState.form.attachments),
    ...safeArray(files),
  ]);

  const validation = validateFiles(merged);

  setFormPatch({
    attachments: validation.files,
  });

  if (!validation.valid) {
    modalState.errors = {
      ...safeObject(modalState.errors),
      attachments: validation.errors[0] || "Adjuntos no válidos.",
    };
  } else if (modalState.errors.attachments) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.attachments;
    modalState.errors = nextErrors;
  }

  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";
}

function handleFieldChange(target) {
  const field = safeText(target?.dataset?.field, "");

  if (!field) return;

  if (field === "attachments") {
    addAttachments(getFileListFromInput(target));
    renderModal();
    focusPanel();
    return;
  }

  setFormPatch({
    [field]: target?.value,
  });

  if (modalState.errors[field]) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors[field];
    modalState.errors = nextErrors;
  }

  if (modalState.serverError) modalState.serverError = "";
  if (modalState.successMessage || modalState.createdTicketId) {
    modalState.successMessage = "";
    modalState.createdTicketId = "";
  }
}

function attachRootBindings() {
  if (modalState.bindingsAttached) return;

  const root = ensureRoot();
  if (!root) return;

  detachRootBindings();

  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;

  modalState.rootAbortController = controller;
  modalState.rootCleanups = [];

  const listenerOptions = controller
    ? { signal: controller.signal }
    : {};

  const onInput = (event) => {
    const field = event.target?.closest?.("[data-field]");
    if (!field || !rootContains(root, field) || field.type === "file") return;

    handleFieldChange(field);
  };

  const onChange = (event) => {
    const field = event.target?.closest?.("[data-field]");
    if (!field || !rootContains(root, field)) return;

    handleFieldChange(field);
  };

  const onSubmit = async (event) => {
    const form = event.target?.closest?.("#incidencias-create-form");
    if (!form || !rootContains(root, form)) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onDragEnter = (event) => {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");
    if (!dropzone || !rootContains(root, dropzone) || modalState.submitting) return;

    event.preventDefault();

    if (!modalState.dragActive) {
      modalState.dragActive = true;
      renderModal();
    }
  };

  const onDragOver = (event) => {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");
    if (!dropzone || !rootContains(root, dropzone) || modalState.submitting) return;

    event.preventDefault();

    if (!modalState.dragActive) {
      modalState.dragActive = true;
      renderModal();
    }
  };

  const onDragLeave = (event) => {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");
    if (!dropzone || !rootContains(root, dropzone) || modalState.submitting) return;

    const related = event.relatedTarget;
    if (related && dropzone.contains(related)) return;

    event.preventDefault();
    modalState.dragActive = false;
    renderModal();
  };

  const onDrop = (event) => {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");
    if (!dropzone || !rootContains(root, dropzone) || modalState.submitting) return;

    event.preventDefault();
    modalState.dragActive = false;

    addAttachments(Array.from(event.dataTransfer?.files || []));
    renderModal();
    focusPanel();
  };

  const onClick = (event) => {
    const target = event.target;
    if (!target?.closest) return;

    const closeButton = target.closest("[data-modal-close='true']");

    if (closeButton && rootContains(root, closeButton)) {
      event.preventDefault();
      closeIncidenciasCreateModal();
      return;
    }

    const removeAttachmentButton = target.closest("[data-modal-action='remove-attachment'], [data-remove-attachment]");

    if (removeAttachmentButton && rootContains(root, removeAttachmentButton)) {
      event.preventDefault();

      if (modalState.submitting) return;

      const index = Number(removeAttachmentButton.dataset.removeAttachment);
      const files = safeArray(modalState.form.attachments).filter((_, currentIndex) => currentIndex !== index);

      setFormPatch({ attachments: files });

      if (modalState.errors.attachments) {
        const nextErrors = { ...modalState.errors };
        delete nextErrors.attachments;
        modalState.errors = nextErrors;
      }

      renderModal();
      focusPanel();
      return;
    }

    const overlay = target.closest("[data-incidencias-create-modal-overlay='true']");
    const panel = target.closest("[data-incidencias-create-modal-panel='true']");

    if (overlay && rootContains(root, overlay) && !panel && event.target === overlay && !modalState.submitting) {
      closeIncidenciasCreateModal();
    }
  };

  addRootListener(root, "input", onInput, listenerOptions);
  addRootListener(root, "change", onChange, listenerOptions);
  addRootListener(root, "submit", onSubmit, listenerOptions);
  addRootListener(root, "dragenter", onDragEnter, listenerOptions);
  addRootListener(root, "dragover", onDragOver, listenerOptions);
  addRootListener(root, "dragleave", onDragLeave, listenerOptions);
  addRootListener(root, "drop", onDrop, listenerOptions);
  addRootListener(root, "click", onClick, listenerOptions);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  try {
    modalState.rootAbortController?.abort?.();
  } catch {}

  safeArray(modalState.rootCleanups).forEach((cleanup) => {
    try {
      cleanup();
    } catch {}
  });

  modalState.rootCleanups = [];
  modalState.rootAbortController = null;
  modalState.bindingsAttached = false;
}

/* =========================================================
   PUBLIC API
========================================================= */

export const OnionIncidenciasCreateModal = Object.freeze({
  version: INCIDENCIAS_CREATE_MODAL_VERSION,

  open(draft = {}) {
    return openIncidenciasCreateModal(draft);
  },

  init(draft = {}) {
    return openIncidenciasCreateModal(draft);
  },

  mount(draft = {}) {
    return openIncidenciasCreateModal(draft);
  },

  close() {
    return closeIncidenciasCreateModal();
  },

  update(draft = {}) {
    return updateIncidenciasCreateModal(draft);
  },

  render() {
    if (!modalState.isOpen) return null;
    return renderModal();
  },

  getState() {
    return {
      isOpen: modalState.isOpen,
      submitting: modalState.submitting,
      dragActive: modalState.dragActive,
      errors: { ...safeObject(modalState.errors) },
      serverError: modalState.serverError,
      successMessage: modalState.successMessage,
      createdTicketId: modalState.createdTicketId,
      form: {
        ...safeObject(modalState.form),
        attachments: [...safeArray(modalState.form.attachments)],
      },
      bindingsAttached: modalState.bindingsAttached,
    };
  },

  destroy() {
    closeIncidenciasCreateModal();
    detachRootBindings();
    detachEscHandler();

    try {
      getRoot()?.remove?.();
    } catch {}

    try {
      resetCreateViewState?.();
    } catch {}

    return true;
  },
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasCreateModal;

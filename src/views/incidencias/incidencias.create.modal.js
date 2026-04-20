/* =========================================================
   Onion SPA - Incidencias Create Modal
   Archivo: src/views/incidencias/incidencias.create.modal.js

   CLIENT EXPERIENCE PRO · CREATE MODAL · COMPACT 10/10
========================================================= */

import { AppCore } from "../../core/index.js";
import { incidenciasState } from "./incidencias.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";

const DEFAULT_FORM = Object.freeze({
  subject: "",
  description: "",
  attachments: [],
});

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  isOpen: false,
  bindingsAttached: false,
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
   HELPERS CORE
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function safeOn(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.on?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeOff(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function showToast(message = "", type = "info") {
  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](message);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(message);
  } catch {}
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
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

function getApiBase() {
  const apiBase = safeText(AppCore?.config?.apiBase, "");
  return apiBase.replace(/\/+$/, "");
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : "",
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : ""
    ),
    ""
  );
}

function safeErrorMessage(error = null) {
  if (!error) {
    return "No se pudo enviar la incidencia.";
  }

  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      "No se pudo enviar la incidencia."
    ),
    "No se pudo enviar la incidencia."
  );
}

function getFileListFromInput(target) {
  try {
    return Array.from(target?.files || []);
  } catch {
    return [];
  }
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function dedupeFiles(files = []) {
  const input = safeArray(files);
  const map = new Map();

  input.forEach((file) => {
    if (!(file instanceof File)) return;

    const key = [
      safeText(file.name, ""),
      Number(file.size) || 0,
      Number(file.lastModified) || 0,
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) {
      map.set(key, file);
    }
  });

  return Array.from(map.values());
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getInitialForm() {
  const draft = safeObject(incidenciasState?.createDraft);

  return {
    subject: safeText(draft.subject, ""),
    description: safeText(draft.description, ""),
    attachments: [],
  };
}

function persistDraft() {
  incidenciasState.createDraft = {
    subject: safeText(modalState.form?.subject, ""),
    description: safeText(modalState.form?.description, ""),
  };
}

function clearDraft() {
  incidenciasState.createDraft = {
    subject: "",
    description: "",
  };
}

function setFormPatch(patch = {}) {
  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(patch),
  };

  persistDraft();

  return modalState.form;
}

function resetFeedbackState() {
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";
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

  const subject = safeText(current.subject, "");
  const description = safeText(current.description, "");

  if (!subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (subject.length < 4) {
    errors.subject = "El asunto debe tener al menos 4 caracteres.";
  }

  if (!description) {
    errors.description = "La descripción es obligatoria.";
  } else if (description.length < 12) {
    errors.description = "La descripción debe tener al menos 12 caracteres.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function buildPayload(form = {}) {
  const current = safeObject(form);
  const fd = new FormData();

  fd.append("subject", normalizeWhitespace(current.subject));
  fd.append("description", normalizeWhitespace(current.description));

  safeArray(current.attachments).forEach((file) => {
    if (file instanceof File) {
      fd.append("attachments", file, file.name);
    }
  });

  return fd;
}

/* =========================================================
   CREATE ADAPTERS
========================================================= */

async function createViaAppCoreRequest(payload = null) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request("/api/tickets", {
    method: "POST",
    body: payload,
  });
}

async function createViaHttpModule(payload = null) {
  const Http = AppCore?.modules?.Http || AppCore?.Http || window?.Http || null;

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  if (typeof Http.post === "function") {
    return Http.post("/api/tickets", payload);
  }

  if (typeof Http.request === "function") {
    return Http.request("/api/tickets", {
      method: "POST",
      body: payload,
    });
  }

  throw new Error("HTTP_POST_UNAVAILABLE");
}

async function createViaFetch(payload = null) {
  const apiBase = getApiBase();
  const token = getAuthToken();
  const url = `${apiBase || ""}/api/tickets`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      safeText(
        first(
          data?.message,
          data?.error,
          `HTTP ${response.status} al crear incidencia.`
        ),
        "No se pudo enviar la incidencia."
      )
    );
    error.response = data;
    throw error;
  }

  return data;
}

function pickCreatedTicket(response = null) {
  const obj = safeObject(response);

  return obj.ticket || obj.item || obj.data || obj.result || obj.payload || obj;
}

function resolveCreatedTicketId(response = null) {
  const ticket = safeObject(pickCreatedTicket(response));

  return safeText(
    first(ticket.ticketId, ticket.id, ticket.code, ticket.ticketCode),
    ""
  );
}

async function createIncidenciaRequest(payload = null) {
  const adapters = [
    createViaAppCoreRequest,
    createViaHttpModule,
    createViaFetch,
  ];

  let lastError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("CREATE_ADAPTERS_FAILED");
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
      <span class="inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <input
        class="inc-create-input ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="${escapeHtml(autocomplete)}"
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
  rows = 6,
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <textarea
        class="inc-create-textarea ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        rows="${Number(rows) || 6}"
        placeholder="${escapeHtml(placeholder)}"
      >${escapeHtml(value)}</textarea>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderFilesSummary(files = []) {
  const items = safeArray(files);

  if (!items.length) {
    return `
      <div class="inc-create-files-empty">
        No has añadido archivos todavía.
      </div>
    `;
  }

  return `
    <div class="inc-create-files-list">
      ${items
        .map(
          (file, index) => `
            <div class="inc-create-file-row">
              <div class="inc-create-file-meta">
                <strong class="inc-create-file-name">
                  ${escapeHtml(safeText(file?.name, `Adjunto ${index + 1}`))}
                </strong>
                <span class="inc-create-file-size">
                  ${escapeHtml(formatFileSize(file?.size))}
                </span>
              </div>

              <button
                type="button"
                data-remove-attachment="${index}"
                class="inc-create-file-remove"
              >
                Quitar
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFileInput({ files = [], dragActive = false } = {}) {
  const items = safeArray(files);
  const countText =
    items.length === 0
      ? "Opcional"
      : items.length === 1
        ? "1 archivo"
        : `${items.length} archivos`;

  return `
    <section class="inc-create-side-card">
      <div class="inc-create-side-head">
        <div class="inc-create-side-head-copy">
          <strong class="inc-create-side-title">Adjuntos</strong>
          <span class="inc-create-side-text">
            Añade capturas, PDFs u otros documentos útiles.
          </span>
        </div>

        <span class="inc-create-side-pill">
          ${escapeHtml(countText)}
        </span>
      </div>

      <label
        data-dropzone="attachments"
        class="inc-create-dropzone ${dragActive ? "is-active" : ""}"
      >
        <input
          id="incidencias-create-attachments-input"
          data-field="attachments"
          name="attachments"
          type="file"
          multiple
          class="inc-create-hidden-input"
        />

        <div class="inc-create-dropzone-copy">
          <strong>Arrastra archivos aquí</strong>
          <span>o pulsa para seleccionarlos</span>
        </div>
      </label>

      ${renderFilesSummary(items)}
    </section>
  `;
}

function renderInfoCard() {
  return `
    <section class="inc-create-side-card inc-create-side-note">
      <strong class="inc-create-side-title">Antes de enviar</strong>
      <div class="inc-create-note-list">
        <span>Se generará una referencia automáticamente.</span>
        <span>Cuanto más claro sea el asunto, mejor.</span>
        <span>Los adjuntos se enviarán junto con la incidencia.</span>
      </div>
    </section>
  `;
}

function renderAlert(type = "info", title = "", text = "", extra = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");
  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${escapeHtml(type)}">
      ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
      ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
      ${extra || ""}
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
    <div
      data-incidencias-create-modal-overlay="true"
      class="inc-create-overlay"
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-create-modal-title"
        tabindex="-1"
        class="inc-create-panel"
      >
        <div class="inc-create-header">
          <div class="inc-create-header-copy">
            <span class="inc-create-badge">Nueva incidencia</span>

            <div class="inc-create-header-text">
              <h2 id="incidencias-create-modal-title">
                Cuéntanos qué ha ocurrido
              </h2>

              <p>
                Describe el problema de forma clara y añade archivos si ayudan a entenderlo mejor.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${submitting ? "disabled" : ""}
            class="inc-create-close"
          >
            ✕
          </button>
        </div>

        <div class="inc-create-body">
          ${
            successMessage
              ? renderAlert(
                  "success",
                  "Tu incidencia se ha enviado correctamente.",
                  createdTicketId
                    ? `Referencia generada: ${createdTicketId}`
                    : ""
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo enviar la incidencia",
                  serverError
                )
              : ""
          }

          <form id="incidencias-create-form" novalidate class="inc-create-form">
            <div class="inc-create-grid">
              <div class="inc-create-main">
                ${renderInput({
                  label: "Asunto",
                  name: "subject",
                  value: form.subject,
                  placeholder: "Ej. No puedo acceder, error al pagar, problema con mi factura...",
                  required: true,
                  error: errors.subject,
                })}

                ${renderTextarea({
                  label: "Descripción",
                  name: "description",
                  value: form.description,
                  placeholder:
                    "Explícanos qué está pasando, desde cuándo ocurre y qué has intentado antes de llegar aquí.",
                  required: true,
                  error: errors.description,
                  rows: 6,
                })}
              </div>

              <aside class="inc-create-side">
                ${renderFileInput({
                  files: safeArray(form.attachments),
                  dragActive: Boolean(modalState.dragActive),
                })}

                ${renderInfoCard()}
              </aside>
            </div>

            <div class="inc-create-actions">
              <button
                id="incidencias-create-submit-btn"
                type="submit"
                ${submitting ? "disabled" : ""}
                class="inc-create-submit"
              >
                ${
                  submitting
                    ? `
                      <span class="inc-create-submit-inner">
                        <span class="inc-create-spinner" aria-hidden="true"></span>
                        Enviando...
                      </span>
                    `
                    : "Enviar incidencia"
                }
              </button>
            </div>
          </form>
        </div>

        <style>
          @keyframes incidenciasCreateSpin {
            to { transform: rotate(360deg); }
          }

          .inc-create-overlay{
            position:fixed;
            inset:0;
            z-index:9999;
            padding:18px;
            display:grid;
            place-items:center;
            background:rgba(0,0,0,.66);
            backdrop-filter:blur(10px);
            -webkit-backdrop-filter:blur(10px);
          }

          .inc-create-panel{
            position:relative;
            width:min(860px, 100%);
            max-height:90vh;
            overflow:auto;
            border-radius:24px;
            border:1px solid var(--border-soft, #2b2b2b);
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
            box-shadow:0 34px 84px rgba(0,0,0,.42);
          }

          .inc-create-header{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:14px;
            padding:18px 18px 14px;
            border-bottom:1px solid var(--border-soft);
          }

          .inc-create-header-copy{
            display:grid;
            gap:10px;
            min-width:0;
            flex:1 1 auto;
          }

          .inc-create-badge{
            display:inline-flex;
            align-items:center;
            width:max-content;
            min-height:26px;
            padding:0 10px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
            background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
            color:var(--text-soft);
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.06em;
            text-transform:uppercase;
          }

          .inc-create-header-text{
            display:grid;
            gap:6px;
          }

          .inc-create-header-text h2{
            margin:0;
            color:var(--text-strong);
            font-size:clamp(24px, 3.6vw, 34px);
            line-height:1;
            letter-spacing:-.045em;
          }

          .inc-create-header-text p{
            margin:0;
            max-width:680px;
            color:var(--text-dim);
            font-size:13px;
            line-height:1.55;
          }

          .inc-create-close{
            width:42px;
            height:42px;
            flex:0 0 auto;
            border:none;
            border-radius:14px;
            cursor:pointer;
            font-size:18px;
            background:var(--surface-glass);
            color:var(--text-strong);
            border:1px solid var(--border-soft);
            opacity:1;
          }

          .inc-create-close:disabled{
            opacity:.7;
            cursor:not-allowed;
          }

          .inc-create-body{
            padding:16px 18px 18px;
            display:grid;
            gap:14px;
          }

          .inc-create-alert{
            display:grid;
            gap:4px;
            padding:12px 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
          }

          .inc-create-alert strong{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
          }

          .inc-create-alert span{
            color:var(--text-dim);
            font-size:12px;
            line-height:1.5;
          }

          .inc-create-alert.is-success{
            border-color:color-mix(in srgb, var(--success-strong, #36c690) 28%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 10%, transparent), transparent 85%),
              var(--surface-1, var(--surface-glass));
          }

          .inc-create-alert.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 28%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 85%),
              var(--surface-1, var(--surface-glass));
          }

          .inc-create-form{
            display:grid;
            gap:14px;
          }

          .inc-create-grid{
            display:grid;
            grid-template-columns:minmax(0, 1.26fr) minmax(280px, .82fr);
            gap:14px;
            align-items:start;
          }

          .inc-create-main{
            display:grid;
            gap:14px;
            min-width:0;
          }

          .inc-create-side{
            display:grid;
            gap:12px;
            min-width:0;
          }

          .inc-create-field{
            display:grid;
            gap:8px;
            min-width:0;
          }

          .inc-create-label{
            color:var(--text-soft);
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.05em;
            text-transform:uppercase;
          }

          .inc-create-input,
          .inc-create-textarea{
            width:100%;
            outline:none;
            color:var(--text-strong);
            background:var(--surface-1, var(--surface-glass));
            border:1px solid var(--border-soft);
            transition:
              border-color .18s ease,
              box-shadow .18s ease,
              background .18s ease;
          }

          .inc-create-input{
            min-height:46px;
            padding:0 14px;
            border-radius:14px;
            font-size:14px;
          }

          .inc-create-textarea{
            min-height:168px;
            padding:12px 14px;
            border-radius:16px;
            resize:vertical;
            line-height:1.55;
            font-size:13px;
          }

          .inc-create-input::placeholder,
          .inc-create-textarea::placeholder{
            color:var(--text-faint);
          }

          .inc-create-input:focus,
          .inc-create-textarea:focus{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 30%, var(--border-soft));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          }

          .inc-create-input.is-error,
          .inc-create-textarea.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 38%, var(--border-soft));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent);
          }

          .inc-create-error{
            color:var(--danger-strong, #ff6b6b);
            font-size:11px;
            line-height:1.35;
            font-weight:var(--weight-semibold, 600);
          }

          .inc-create-side-card{
            display:grid;
            gap:10px;
            padding:14px;
            border-radius:16px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
          }

          .inc-create-side-head{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:10px;
          }

          .inc-create-side-head-copy{
            display:grid;
            gap:4px;
            min-width:0;
          }

          .inc-create-side-title{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.3;
          }

          .inc-create-side-text{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-side-pill{
            display:inline-flex;
            align-items:center;
            min-height:24px;
            padding:0 8px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-dim);
            font-size:10px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.04em;
            text-transform:uppercase;
            white-space:nowrap;
          }

          .inc-create-dropzone{
            display:grid;
            gap:8px;
            min-height:110px;
            align-content:center;
            padding:14px;
            border-radius:14px;
            border:1px dashed var(--border-soft);
            background:transparent;
            cursor:pointer;
            transition:
              border-color .18s ease,
              background .18s ease,
              transform .18s ease;
          }

          .inc-create-dropzone.is-active{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 32%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent),
              var(--surface-glass);
          }

          .inc-create-dropzone-copy{
            display:grid;
            gap:4px;
          }

          .inc-create-dropzone-copy strong{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
          }

          .inc-create-dropzone-copy span{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-hidden-input{
            display:none;
          }

          .inc-create-files-empty{
            color:var(--text-dim);
            font-size:12px;
            line-height:1.45;
          }

          .inc-create-files-list{
            display:grid;
            gap:8px;
          }

          .inc-create-file-row{
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            padding:10px 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
          }

          .inc-create-file-meta{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .inc-create-file-name{
            color:var(--text-strong);
            font-size:12px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-file-size{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.3;
          }

          .inc-create-file-remove{
            min-height:32px;
            padding:0 10px;
            border-radius:10px;
            border:1px solid var(--border-soft);
            background:transparent;
            color:var(--text-dim);
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            flex:0 0 auto;
          }

          .inc-create-side-note{
            gap:8px;
          }

          .inc-create-note-list{
            display:grid;
            gap:6px;
          }

          .inc-create-note-list span{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-actions{
            display:flex;
            justify-content:flex-end;
            gap:12px;
            padding-top:2px;
          }

          .inc-create-submit{
            min-height:42px;
            padding:0 16px;
            border-radius:12px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-size:13px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            box-shadow:0 12px 26px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
          }

          .inc-create-submit:disabled{
            opacity:.8;
            cursor:wait;
          }

          .inc-create-submit-inner{
            display:inline-flex;
            align-items:center;
            gap:8px;
          }

          .inc-create-spinner{
            width:14px;
            height:14px;
            border-radius:999px;
            border:2px solid rgba(255,255,255,.28);
            border-top-color:#fff;
            animation:incidenciasCreateSpin .8s linear infinite;
          }

          [data-theme="light"] .inc-create-panel{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,255,.94));
            box-shadow:
              0 28px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.65) inset;
          }

          [data-theme="light"] .inc-create-side-card,
          [data-theme="light"] .inc-create-alert,
          [data-theme="light"] .inc-create-input,
          [data-theme="light"] .inc-create-textarea,
          [data-theme="light"] .inc-create-file-row{
            box-shadow:0 6px 16px rgba(15,23,42,.04);
          }

          @media (max-width: 920px){
            .inc-create-grid{
              grid-template-columns:1fr;
            }
          }

          @media (max-width: 640px){
            .inc-create-overlay{
              padding:10px;
            }

            .inc-create-panel{
              width:100%;
              max-height:94vh;
              border-radius:18px;
            }

            .inc-create-header{
              padding:14px 14px 12px;
            }

            .inc-create-body{
              padding:14px;
            }

            .inc-create-header-text h2{
              font-size:28px;
            }

            .inc-create-textarea{
              min-height:146px;
            }
          }
        </style>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  let root = getRoot();

  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = MODAL_ID;
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  try {
    document.body.classList.add("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "";
  } catch {}
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
  if (!modalState.escHandler) {
    return;
  }

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape" && !modalState.submitting) {
      closeIncidenciasCreateModal();
    }
  };

  try {
    document.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal() {
  const root = ensureRoot();

  if (!modalState.isOpen) {
    detachRootBindings();
    root.innerHTML = "";
    return root;
  }

  detachRootBindings();
  root.innerHTML = renderModalInner();
  modalState.bindingsAttached = false;

  return root;
}

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

export function openIncidenciasCreateModal(draft = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;
  modalState.dragActive = false;
  resetFeedbackState();

  modalState.form = {
    ...getInitialForm(),
    ...safeObject(draft),
    attachments: [],
  };

  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:create-modal:opened", {
    draft: {
      subject: modalState.form.subject,
      description: modalState.form.description,
    },
  });

  return true;
}

export function closeIncidenciasCreateModal() {
  if (modalState.submitting) {
    return false;
  }

  const root = getRoot();

  modalState.isOpen = false;
  modalState.submitting = false;
  modalState.dragActive = false;
  resetFeedbackState();
  resetFormState();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("incidencias:create-modal:closed", {});

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

  persistDraft();
  renderModal();
  attachRootBindings();
  focusPanel();

  return true;
}

/* =========================================================
   SUBMIT FLOW
========================================================= */

async function handleSubmit() {
  if (modalState.submitting) {
    return false;
  }

  modalState.successMessage = "";
  modalState.createdTicketId = "";
  modalState.serverError = "";

  const validation = validateForm(modalState.form);
  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    attachRootBindings();
    focusPanel();
    showToast("Revisa los campos obligatorios.", "warning");
    return false;
  }

  const payload = buildPayload(modalState.form);

  modalState.submitting = true;
  renderModal();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:create:submit", {
    subject: safeText(modalState.form.subject, ""),
    description: safeText(modalState.form.description, ""),
    attachmentsCount: safeArray(modalState.form.attachments).length,
  });

  try {
    const response = await createIncidenciaRequest(payload);
    const createdTicketId = resolveCreatedTicketId(response);
    const detail = pickCreatedTicket(response);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "Tu incidencia se ha enviado correctamente.";
    modalState.createdTicketId = createdTicketId;

    clearDraft();
    resetFormState();

    renderModal();
    attachRootBindings();
    focusPanel();

    showToast("Incidencia enviada correctamente.", "success");

    safeEmit("incidencias:create:success", {
      ticketId: createdTicketId,
      response,
      detail,
    });

    setTimeout(() => {
      closeIncidenciasCreateModal();
    }, 450);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(error);

    safeEmit("incidencias:create:error", {
      error,
    });

    renderModal();
    attachRootBindings();
    focusPanel();

    showToast(modalState.serverError, "error");

    return false;
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function addAttachments(files = []) {
  const merged = dedupeFiles([
    ...safeArray(modalState.form.attachments),
    ...safeArray(files),
  ]);

  setFormPatch({
    attachments: merged,
  });

  if (modalState.errors.attachments) {
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
    const files = getFileListFromInput(target);
    addAttachments(files);
  } else {
    setFormPatch({
      [field]: target?.value,
    });
  }

  if (modalState.errors[field]) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors[field];
    modalState.errors = nextErrors;
  }

  if (modalState.serverError) {
    modalState.serverError = "";
  }

  if (modalState.successMessage || modalState.createdTicketId) {
    modalState.successMessage = "";
    modalState.createdTicketId = "";
  }

  if (field === "attachments") {
    renderModal();
    attachRootBindings();
    focusPanel();
  }
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;
    if (field.type === "file") return;

    handleFieldChange(field);
  };

  const onChange = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    handleFieldChange(field);
  };

  const onSubmit = async (event) => {
    const form = event.target.closest("#incidencias-create-form");
    if (!form) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onDragEnter = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    event.preventDefault();
    modalState.dragActive = true;
    renderModal();
    attachRootBindings();
  };

  const onDragOver = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    event.preventDefault();

    if (!modalState.dragActive) {
      modalState.dragActive = true;
      renderModal();
      attachRootBindings();
    }
  };

  const onDragLeave = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    const related = event.relatedTarget;
    if (related && dropzone.contains(related)) {
      return;
    }

    event.preventDefault();
    modalState.dragActive = false;
    renderModal();
    attachRootBindings();
  };

  const onDrop = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    event.preventDefault();
    modalState.dragActive = false;

    const files = Array.from(event.dataTransfer?.files || []);
    addAttachments(files);

    renderModal();
    attachRootBindings();
    focusPanel();
  };

  const onClick = async (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");
    if (closeBtn) {
      event.preventDefault();
      closeIncidenciasCreateModal();
      return;
    }

    const overlay = event.target.closest("[data-incidencias-create-modal-overlay='true']");
    const panel = event.target.closest("[data-incidencias-create-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeIncidenciasCreateModal();
      return;
    }

    const removeAttachmentBtn = event.target.closest("[data-remove-attachment]");
    if (removeAttachmentBtn) {
      event.preventDefault();

      const index = Number(removeAttachmentBtn.dataset.removeAttachment);
      const files = safeArray(modalState.form.attachments).filter((_, i) => i !== index);

      setFormPatch({
        attachments: files,
      });

      renderModal();
      attachRootBindings();
      focusPanel();
    }
  };

  root.__incidenciasCreateModalInputHandler = onInput;
  root.__incidenciasCreateModalChangeHandler = onChange;
  root.__incidenciasCreateModalSubmitHandler = onSubmit;
  root.__incidenciasCreateModalDragEnterHandler = onDragEnter;
  root.__incidenciasCreateModalDragOverHandler = onDragOver;
  root.__incidenciasCreateModalDragLeaveHandler = onDragLeave;
  root.__incidenciasCreateModalDropHandler = onDrop;
  root.__incidenciasCreateModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("dragenter", onDragEnter);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("drop", onDrop);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__incidenciasCreateModalInputHandler) {
    try {
      root.removeEventListener("input", root.__incidenciasCreateModalInputHandler);
    } catch {}
    delete root.__incidenciasCreateModalInputHandler;
  }

  if (root.__incidenciasCreateModalChangeHandler) {
    try {
      root.removeEventListener("change", root.__incidenciasCreateModalChangeHandler);
    } catch {}
    delete root.__incidenciasCreateModalChangeHandler;
  }

  if (root.__incidenciasCreateModalSubmitHandler) {
    try {
      root.removeEventListener("submit", root.__incidenciasCreateModalSubmitHandler);
    } catch {}
    delete root.__incidenciasCreateModalSubmitHandler;
  }

  if (root.__incidenciasCreateModalDragEnterHandler) {
    try {
      root.removeEventListener("dragenter", root.__incidenciasCreateModalDragEnterHandler);
    } catch {}
    delete root.__incidenciasCreateModalDragEnterHandler;
  }

  if (root.__incidenciasCreateModalDragOverHandler) {
    try {
      root.removeEventListener("dragover", root.__incidenciasCreateModalDragOverHandler);
    } catch {}
    delete root.__incidenciasCreateModalDragOverHandler;
  }

  if (root.__incidenciasCreateModalDragLeaveHandler) {
    try {
      root.removeEventListener("dragleave", root.__incidenciasCreateModalDragLeaveHandler);
    } catch {}
    delete root.__incidenciasCreateModalDragLeaveHandler;
  }

  if (root.__incidenciasCreateModalDropHandler) {
    try {
      root.removeEventListener("drop", root.__incidenciasCreateModalDropHandler);
    } catch {}
    delete root.__incidenciasCreateModalDropHandler;
  }

  if (root.__incidenciasCreateModalClickHandler) {
    try {
      root.removeEventListener("click", root.__incidenciasCreateModalClickHandler);
    } catch {}
    delete root.__incidenciasCreateModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const draft = event?.detail?.draft || event?.detail || event || {};
  openIncidenciasCreateModal(safeObject(draft));
}

function handleCloseEvent() {
  closeIncidenciasCreateModal();
}

function handleUpdateEvent(event) {
  const draft = event?.detail?.draft || event?.detail || event || {};
  updateIncidenciasCreateModal(safeObject(draft));
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("incidencias:create-modal:open", handleOpenEvent);
  safeOn("incidencias:create-modal:close", handleCloseEvent);
  safeOn("incidencias:create-modal:update", handleUpdateEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("incidencias:create-modal:open", handleOpenEvent);
  safeOff("incidencias:create-modal:close", handleCloseEvent);
  safeOff("incidencias:create-modal:update", handleUpdateEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionIncidenciasCreateModal = {
  open(draft = {}) {
    return openIncidenciasCreateModal(draft);
  },

  close() {
    return closeIncidenciasCreateModal();
  },

  update(draft = {}) {
    return updateIncidenciasCreateModal(draft);
  },

  getState() {
    return {
      ...modalState,
      errors: { ...safeObject(modalState.errors) },
      form: {
        ...safeObject(modalState.form),
        attachments: [...safeArray(modalState.form.attachments)],
      },
    };
  },

  destroy() {
    detachRootBindings();
    closeIncidenciasCreateModal();
    detachEscHandler();
    detachBus();

    const root = getRoot();
    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionIncidenciasCreateModal = OnionIncidenciasCreateModal;
  window.renderIncidenciasCreateModal = OnionIncidenciasCreateModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasCreateModal;

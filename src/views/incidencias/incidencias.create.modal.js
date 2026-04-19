/* =========================================================
   Onion SPA - Incidencias Create Modal
   Archivo: src/views/incidencias/incidencias.create.modal.js

   FINAL PRO SYSTEM · CREATE MODAL · 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de creación de incidencias
   - gestionar formulario premium de alta
   - validar campos clave
   - construir payload limpio para backend
   - enviar creación por adapters tolerantes
   - mostrar estados loading / success / error dentro del modal
   - evitar navegación a nueva URL
   - evitar doble bind de listeners
   - soportar destroy limpio

   HARDENING PRO:
   - validación defensiva
   - serialización coherente
   - adapter chain para create request
   - fallback a fetch directo
   - modal singleton
   - escape / overlay close
   - anti-race submit
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
  priority: "medium",
  status: "open",
  clientName: "",
  clientEmail: "",
  assignedTo: "",
  category: "",
  source: "panel",
  tags: "",
  notifyClient: true,
  internalOnly: false,
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
  errors: {},
  serverError: "",
  successMessage: "",
  createdTicketId: "",
  form: { ...DEFAULT_FORM },
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

function isEmail(value = "") {
  const text = safeText(value, "");
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function slugifyTag(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
      localStorage.getItem("token"),
      sessionStorage.getItem("token")
    ),
    ""
  );
}

function safeErrorMessage(error = null) {
  if (!error) {
    return "No se pudo crear la incidencia.";
  }

  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      "No se pudo crear la incidencia."
    ),
    "No se pudo crear la incidencia."
  );
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getInitialForm() {
  const draft = safeObject(incidenciasState?.createDraft);

  return {
    ...DEFAULT_FORM,
    ...draft,
    notifyClient:
      typeof draft.notifyClient === "boolean"
        ? draft.notifyClient
        : DEFAULT_FORM.notifyClient,
    internalOnly:
      typeof draft.internalOnly === "boolean"
        ? draft.internalOnly
        : DEFAULT_FORM.internalOnly,
  };
}

function resetLocalState({ preserveDraft = true } = {}) {
  modalState.submitting = false;
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";
  modalState.form = preserveDraft ? getInitialForm() : { ...DEFAULT_FORM };
}

function persistDraft() {
  incidenciasState.createDraft = { ...modalState.form };
}

function clearDraft() {
  incidenciasState.createDraft = { ...DEFAULT_FORM };
}

function setFormPatch(patch = {}) {
  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(patch),
  };

  persistDraft();

  return modalState.form;
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

function buildPayload(form = {}) {
  const current = safeObject(form);

  const tags = safeText(current.tags, "")
    .split(",")
    .map((tag) => slugifyTag(tag))
    .filter(Boolean);

  const payload = {
    subject: normalizeWhitespace(current.subject),
    description: normalizeWhitespace(current.description),
    priority: safeText(current.priority, "medium").toLowerCase(),
    status: safeText(current.status, "open").toLowerCase(),
    client: {
      name: normalizeWhitespace(current.clientName),
      email: safeText(current.clientEmail, ""),
    },
    assignedTo: safeText(current.assignedTo, ""),
    category: safeText(current.category, ""),
    source: safeText(current.source, "panel"),
    tags,
    meta: {
      notifyClient: Boolean(current.notifyClient),
      internalOnly: Boolean(current.internalOnly),
      createdFrom: "onion-spa-panel",
    },
  };

  if (!payload.client.email) {
    delete payload.client.email;
  }

  if (!payload.assignedTo) {
    delete payload.assignedTo;
  }

  if (!payload.category) {
    delete payload.category;
  }

  if (!payload.tags.length) {
    delete payload.tags;
  }

  return payload;
}

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  if (!safeText(current.subject, "")) {
    errors.subject = "El asunto es obligatorio.";
  } else if (safeText(current.subject, "").length < 4) {
    errors.subject = "El asunto debe tener al menos 4 caracteres.";
  }

  if (!safeText(current.description, "")) {
    errors.description = "La descripción es obligatoria.";
  } else if (safeText(current.description, "").length < 12) {
    errors.description = "La descripción debe tener al menos 12 caracteres.";
  }

  if (!safeText(current.clientName, "")) {
    errors.clientName = "El nombre del cliente es obligatorio.";
  }

  if (!isEmail(current.clientEmail)) {
    errors.clientEmail = "El email no tiene un formato válido.";
  }

  const validPriorities = ["low", "medium", "high", "urgent"];
  if (!validPriorities.includes(safeText(current.priority, "medium").toLowerCase())) {
    errors.priority = "Prioridad inválida.";
  }

  const validStatuses = ["open", "pending", "in_progress", "resolved", "closed"];
  if (!validStatuses.includes(safeText(current.status, "open").toLowerCase())) {
    errors.status = "Estado inválido.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/* =========================================================
   CREATE ADAPTERS
========================================================= */

async function createViaAppCoreRequest(payload = {}) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request("/api/tickets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function createViaHttpModule(payload = {}) {
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

async function createViaFetch(payload = {}) {
  const apiBase = getApiBase();
  const token = getAuthToken();
  const url = `${apiBase || ""}/api/tickets`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
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
        "No se pudo crear la incidencia."
      )
    );
    error.response = data;
    throw error;
  }

  return data;
}

function pickCreatedTicket(response = null) {
  const obj = safeObject(response);

  return (
    obj.ticket ||
    obj.item ||
    obj.data ||
    obj.result ||
    obj.payload ||
    obj
  );
}

function resolveCreatedTicketId(response = null) {
  const ticket = safeObject(pickCreatedTicket(response));

  return safeText(
    first(
      ticket.ticketId,
      ticket.id,
      ticket.code,
      ticket.ticketCode
    ),
    ""
  );
}

async function createIncidenciaRequest(payload = {}) {
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

  return `
    <span
      style="
        display:block;
        margin-top:8px;
        color:var(--danger-strong, #ff6b6b);
        font-size:12px;
        line-height:1.35;
        font-weight:var(--weight-semibold, 600);
      "
    >
      ${escapeHtml(text)}
    </span>
  `;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  type = "text",
  placeholder = "",
  required = false,
  error = "",
  hint = "",
  autocomplete = "off",
} = {}) {
  return `
    <label style="display:grid; gap:8px;">
      <span
        style="
          color:var(--text-soft);
          font-size:12px;
          font-weight:var(--weight-bold, 700);
          letter-spacing:.05em;
          text-transform:uppercase;
        "
      >
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <input
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="${escapeHtml(autocomplete)}"
        style="
          width:100%;
          min-height:48px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid ${
            error
              ? "color-mix(in srgb, var(--danger-strong, #ff6b6b) 38%, var(--border-soft))"
              : "var(--border-soft)"
          };
          background:var(--surface-1, var(--surface-glass));
          color:var(--text-strong);
          outline:none;
          box-shadow:${error ? "0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent)" : "none"};
        "
      />

      ${
        hint
          ? `
            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
              "
            >
              ${escapeHtml(hint)}
            </span>
          `
          : ""
      }

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
  hint = "",
  rows = 8,
} = {}) {
  return `
    <label style="display:grid; gap:8px;">
      <span
        style="
          color:var(--text-soft);
          font-size:12px;
          font-weight:var(--weight-bold, 700);
          letter-spacing:.05em;
          text-transform:uppercase;
        "
      >
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <textarea
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        rows="${Number(rows) || 8}"
        placeholder="${escapeHtml(placeholder)}"
        style="
          width:100%;
          min-height:160px;
          padding:14px;
          border-radius:16px;
          border:1px solid ${
            error
              ? "color-mix(in srgb, var(--danger-strong, #ff6b6b) 38%, var(--border-soft))"
              : "var(--border-soft)"
          };
          background:var(--surface-1, var(--surface-glass));
          color:var(--text-strong);
          outline:none;
          resize:vertical;
          line-height:1.55;
          box-shadow:${error ? "0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent)" : "none"};
        "
      >${escapeHtml(value)}</textarea>

      ${
        hint
          ? `
            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
              "
            >
              ${escapeHtml(hint)}
            </span>
          `
          : ""
      }

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
  hint = "",
} = {}) {
  return `
    <label style="display:grid; gap:8px;">
      <span
        style="
          color:var(--text-soft);
          font-size:12px;
          font-weight:var(--weight-bold, 700);
          letter-spacing:.05em;
          text-transform:uppercase;
        "
      >
        ${escapeHtml(label)}
      </span>

      <select
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        style="
          width:100%;
          min-height:48px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid ${
            error
              ? "color-mix(in srgb, var(--danger-strong, #ff6b6b) 38%, var(--border-soft))"
              : "var(--border-soft)"
          };
          background:var(--surface-1, var(--surface-glass));
          color:var(--text-strong);
          outline:none;
        "
      >
        ${safeArray(options)
          .map((option) => {
            const item = safeObject(option);
            const optionValue = safeText(item.value, "");
            const selected = optionValue === safeText(value, "") ? "selected" : "";

            return `
              <option value="${escapeHtml(optionValue)}" ${selected}>
                ${escapeHtml(safeText(item.label, optionValue))}
              </option>
            `;
          })
          .join("")}
      </select>

      ${
        hint
          ? `
            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
              "
            >
              ${escapeHtml(hint)}
            </span>
          `
          : ""
      }

      ${renderFieldError(error)}
    </label>
  `;
}

function renderCheckbox({
  label = "",
  name = "",
  checked = false,
  hint = "",
} = {}) {
  return `
    <label
      style="
        display:flex;
        align-items:flex-start;
        gap:12px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <input
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="checkbox"
        ${checked ? "checked" : ""}
        style="
          margin-top:2px;
          width:16px;
          height:16px;
        "
      />

      <span style="display:grid; gap:4px;">
        <span
          style="
            color:var(--text-strong);
            font-size:14px;
            font-weight:var(--weight-semibold, 600);
            line-height:1.35;
          "
        >
          ${escapeHtml(label)}
        </span>

        ${
          hint
            ? `
              <span
                style="
                  color:var(--text-dim);
                  font-size:12px;
                  line-height:1.4;
                "
              >
                ${escapeHtml(hint)}
              </span>
            `
            : ""
        }
      </span>
    </label>
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
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:24px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.68);
        backdrop-filter:blur(10px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-create-modal-title"
        tabindex="-1"
        style="
          position:relative;
          width:min(1120px, 100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >
        <div
          style="
            padding:24px;
            border-bottom:1px solid var(--border-soft);
            display:flex;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:10px; min-width:min(100%, 540px);">
            <span
              style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                min-height:28px;
                padding:0 12px;
                border-radius:999px;
                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold, 700);
                letter-spacing:.06em;
                text-transform:uppercase;
              "
            >
              Nueva incidencia
            </span>

            <div style="display:grid; gap:8px;">
              <h2
                id="incidencias-create-modal-title"
                style="
                  margin:0;
                  font-size:clamp(28px, 4vw, 42px);
                  line-height:.98;
                  letter-spacing:-.05em;
                  color:var(--text-strong);
                "
              >
                Alta manual de ticket
              </h2>

              <p
                style="
                  margin:0;
                  max-width:860px;
                  color:var(--text-dim);
                  font-size:14px;
                  line-height:1.6;
                "
              >
                Registra una incidencia con contexto operativo, prioridad, cliente y asignación inicial
                desde un formulario premium preparado para backend real.
              </p>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:flex-start;
            "
          >
            <button
              type="button"
              data-create-modal-action="close"
              ${submitting ? "disabled" : ""}
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:transparent;
                color:var(--text-dim);
                font-weight:var(--weight-bold, 700);
                cursor:${submitting ? "not-allowed" : "pointer"};
                opacity:${submitting ? ".7" : "1"};
              "
            >
              Cancelar
            </button>

            <button
              type="button"
              data-modal-close="true"
              aria-label="Cerrar modal"
              ${submitting ? "disabled" : ""}
              style="
                width:48px;
                height:48px;
                border:none;
                border-radius:16px;
                cursor:${submitting ? "not-allowed" : "pointer"};
                font-size:20px;
                background:var(--surface-glass);
                color:var(--text-strong);
                border:1px solid var(--border-soft);
                opacity:${submitting ? ".7" : "1"};
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div style="padding:20px 24px 24px;">
          ${
            successMessage
              ? `
                <div
                  style="
                    margin-bottom:18px;
                    display:grid;
                    gap:6px;
                    padding:16px;
                    border-radius:16px;
                    border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 30%, var(--border-soft));
                    background:
                      linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 10%, transparent), transparent 85%),
                      var(--surface-1, var(--surface-glass));
                  "
                >
                  <strong style="color:var(--text-strong);">
                    ${escapeHtml(successMessage)}
                  </strong>
                  ${
                    createdTicketId
                      ? `
                        <span style="color:var(--text-dim); font-size:13px;">
                          Ticket generado: ${escapeHtml(createdTicketId)}
                        </span>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }

          ${
            serverError
              ? `
                <div
                  style="
                    margin-bottom:18px;
                    display:grid;
                    gap:6px;
                    padding:16px;
                    border-radius:16px;
                    border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 30%, var(--border-soft));
                    background:
                      linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 85%),
                      var(--surface-1, var(--surface-glass));
                  "
                >
                  <strong style="color:var(--text-strong);">
                    No se pudo crear la incidencia
                  </strong>
                  <span style="color:var(--text-dim); font-size:13px; line-height:1.45;">
                    ${escapeHtml(serverError)}
                  </span>
                </div>
              `
              : ""
          }

          <form
            id="incidencias-create-form"
            novalidate
            style="
              display:grid;
              gap:18px;
            "
          >
            <div
              style="
                display:grid;
                grid-template-columns:1.4fr .8fr .8fr;
                gap:16px;
              "
              class="incidencias-create-grid-top"
            >
              ${renderInput({
                label: "Asunto",
                name: "subject",
                value: form.subject,
                placeholder: "Ej. Error en factura, acceso bloqueado, bug en dashboard...",
                required: true,
                error: errors.subject,
                hint: "Usa un asunto corto pero muy reconocible para operación.",
              })}

              ${renderSelect({
                label: "Prioridad",
                name: "priority",
                value: form.priority,
                error: errors.priority,
                options: [
                  { value: "low", label: "Baja" },
                  { value: "medium", label: "Media" },
                  { value: "high", label: "Alta" },
                  { value: "urgent", label: "Urgente" },
                ],
              })}

              ${renderSelect({
                label: "Estado inicial",
                name: "status",
                value: form.status,
                error: errors.status,
                options: [
                  { value: "open", label: "Abierta" },
                  { value: "pending", label: "Pendiente" },
                  { value: "in_progress", label: "En proceso" },
                  { value: "resolved", label: "Resuelta" },
                  { value: "closed", label: "Cerrada" },
                ],
              })}
            </div>

            ${renderTextarea({
              label: "Descripción",
              name: "description",
              value: form.description,
              placeholder:
                "Describe el problema con el mayor contexto posible: qué falla, desde cuándo, a quién afecta, pasos realizados y cualquier dato que acelere la respuesta.",
              required: true,
              error: errors.description,
              hint: "Cuanto mejor venga el contexto, mejor quedará la operativa posterior.",
              rows: 8,
            })}

            <div
              style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:16px;
              "
              class="incidencias-create-grid-client"
            >
              ${renderInput({
                label: "Cliente",
                name: "clientName",
                value: form.clientName,
                placeholder: "Nombre del cliente o empresa",
                required: true,
                error: errors.clientName,
                autocomplete: "name",
              })}

              ${renderInput({
                label: "Email cliente",
                name: "clientEmail",
                value: form.clientEmail,
                type: "email",
                placeholder: "cliente@dominio.com",
                error: errors.clientEmail,
                autocomplete: "email",
              })}
            </div>

            <div
              style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:16px;
              "
              class="incidencias-create-grid-meta"
            >
              ${renderInput({
                label: "Asignado a",
                name: "assignedTo",
                value: form.assignedTo,
                placeholder: "Usuario, técnico o responsable",
                hint: "Puede quedar vacío si aún no se asigna.",
              })}

              ${renderInput({
                label: "Categoría",
                name: "category",
                value: form.category,
                placeholder: "facturación, soporte, acceso, traducción...",
              })}

              ${renderInput({
                label: "Tags",
                name: "tags",
                value: form.tags,
                placeholder: "vip, bug, backend, cliente-fr",
                hint: "Separados por coma.",
              })}
            </div>

            <div
              style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:16px;
              "
              class="incidencias-create-grid-flags"
            >
              ${renderCheckbox({
                label: "Notificar al cliente",
                name: "notifyClient",
                checked: Boolean(form.notifyClient),
                hint: "Marca esta opción si el backend debe tratar el ticket como notificable al cliente.",
              })}

              ${renderCheckbox({
                label: "Solo uso interno",
                name: "internalOnly",
                checked: Boolean(form.internalOnly),
                hint: "Útil para incidencias operativas que no deben exponerse externamente.",
              })}
            </div>

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:12px;
                flex-wrap:wrap;
                padding-top:6px;
              "
            >
              <div
                style="
                  display:flex;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <button
                  id="incidencias-create-submit-btn"
                  type="submit"
                  ${submitting ? "disabled" : ""}
                  style="
                    min-height:44px;
                    padding:0 18px;
                    border-radius:14px;
                    border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                    background:var(--btn-primary-bg, var(--accent, #7c5cff));
                    color:var(--btn-primary-text, #fff);
                    font-weight:var(--weight-bold, 700);
                    cursor:${submitting ? "wait" : "pointer"};
                    opacity:${submitting ? ".8" : "1"};
                    box-shadow:0 12px 26px color-mix(in srgb, var(--accent, #7c5cff) 20%, transparent);
                  "
                >
                  ${
                    submitting
                      ? `
                        <span style="display:inline-flex; align-items:center; gap:8px;">
                          <span
                            aria-hidden="true"
                            style="
                              width:14px;
                              height:14px;
                              border-radius:999px;
                              border:2px solid rgba(255,255,255,.28);
                              border-top-color:#fff;
                              animation:incidenciasCreateSpin .8s linear infinite;
                            "
                          ></span>
                          Creando...
                        </span>
                      `
                      : "Crear incidencia"
                  }
                </button>

                <button
                  id="incidencias-create-reset-btn"
                  type="button"
                  ${submitting ? "disabled" : ""}
                  style="
                    min-height:44px;
                    padding:0 16px;
                    border-radius:14px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-soft);
                    font-weight:var(--weight-bold, 700);
                    cursor:${submitting ? "not-allowed" : "pointer"};
                    opacity:${submitting ? ".7" : "1"};
                  "
                >
                  Limpiar formulario
                </button>
              </div>

              <div
                style="
                  display:flex;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <button
                  id="incidencias-create-save-draft-btn"
                  type="button"
                  ${submitting ? "disabled" : ""}
                  style="
                    min-height:44px;
                    padding:0 16px;
                    border-radius:14px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-soft);
                    font-weight:var(--weight-bold, 700);
                    cursor:${submitting ? "not-allowed" : "pointer"};
                    opacity:${submitting ? ".7" : "1"};
                  "
                >
                  Guardar borrador
                </button>
              </div>
            </div>
          </form>
        </div>

        <style>
          @keyframes incidenciasCreateSpin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 1080px) {
            .incidencias-create-grid-top,
            .incidencias-create-grid-meta {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 860px) {
            .incidencias-create-grid-client,
            .incidencias-create-grid-flags {
              grid-template-columns: 1fr !important;
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
    root.innerHTML = "";
    return root;
  }

  root.innerHTML = renderModalInner();

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
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";

  modalState.form = {
    ...getInitialForm(),
    ...safeObject(draft),
  };

  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:create-modal:opened", {
    draft: { ...modalState.form },
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
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";

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
  };

  persistDraft();
  renderModal();
  attachRootBindings();

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

  safeEmit("incidencias:create:submit", {
    payload,
  });

  try {
    const response = await createIncidenciaRequest(payload);
    const createdTicketId = resolveCreatedTicketId(response);
    const detail = pickCreatedTicket(response);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "Incidencia creada correctamente.";
    modalState.createdTicketId = createdTicketId;

    clearDraft();
    modalState.form = { ...DEFAULT_FORM };

    renderModal();
    attachRootBindings();

    showToast("Incidencia creada correctamente.", "success");

    safeEmit("incidencias:create:success", {
      ticketId: createdTicketId,
      response,
      payload,
      detail,
    });

    setTimeout(() => {
      closeIncidenciasCreateModal();
    }, 250);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(error);

    safeEmit("incidencias:create:error", {
      error,
      payload,
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

function handleFieldChange(target) {
  const field = safeText(target?.dataset?.field, "");
  if (!field) return;

  const value =
    target?.type === "checkbox"
      ? Boolean(target.checked)
      : target?.value;

  setFormPatch({
    [field]: value,
  });

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
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

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

    const cancelBtn = event.target.closest('[data-create-modal-action="close"]');
    if (cancelBtn) {
      event.preventDefault();
      closeIncidenciasCreateModal();
      return;
    }

    const resetBtn = event.target.closest("#incidencias-create-reset-btn");
    if (resetBtn) {
      event.preventDefault();

      modalState.form = { ...DEFAULT_FORM };
      modalState.errors = {};
      modalState.serverError = "";
      modalState.successMessage = "";
      modalState.createdTicketId = "";

      clearDraft();

      renderModal();
      attachRootBindings();
      focusPanel();

      showToast("Formulario limpio.", "info");
      return;
    }

    const draftBtn = event.target.closest("#incidencias-create-save-draft-btn");
    if (draftBtn) {
      event.preventDefault();
      persistDraft();
      showToast("Borrador guardado.", "success");
      return;
    }
  };

  root.__incidenciasCreateModalInputHandler = onInput;
  root.__incidenciasCreateModalChangeHandler = onChange

import { createModalLifecycle, restoreModalFocus } from "../../features/entity-overlay/modal-lifecycle.js";
/* =========================================================
   Onion Support - Usuarios Create Modal
   Archivo: /src/views/usuarios/usuarios.template.create.js

   PRODUCTIVO · BACKEND CONTRACT REAL · ACTIVATION FLOW · V3

   Backend:
   POST /api/users/create

   Body persistido:
   - name
   - email
   - phone
   - tipo
   - nif
   - direccion
   - privacyMode
   - darkMode

   El backend:
   - genera userId
   - genera username único desde email
   - fija role=user
   - crea el usuario inactive
   - genera token de activación
   - envía correo de activación
   - no recibe contraseña desde este formulario

   Responsabilidad de este archivo:
   - modal singleton de alta
   - formulario alineado 1:1 con el create real
   - validación previa al POST
   - llamada exclusivamente mediante usuarios.api.js
   - no guardar/exponer activationUrl ni tokens
   - emitir eventos compatibles con usuarios/index.js
   - Escape, overlay, focus trap y retorno de foco
   - sin CSS inyectado
========================================================= */

import { AppCore } from "../../core/index.js";
import {
  createUsuario,
  USUARIOS_CREATE_ENDPOINT as API_CREATE_ENDPOINT,
  USUARIOS_API_VERSION,
} from "./usuarios.api.js";

/* =========================================================
   META / CONSTANTS
========================================================= */

export const USUARIOS_CREATE_MODAL_VERSION =
  "usuarios.create.modal.backend-contract.v3.activation-flow";

export const USUARIOS_CREATE_ENDPOINT =
  API_CREATE_ENDPOINT;

export const USUARIOS_CREATE_API_VERSION =
  USUARIOS_API_VERSION;

const ROOT_ID = "usuarios-create-modal-root";
const PANEL_ID = "usuarios-create-modal-panel";
const FORM_ID = "usuarios-create-form";

const ALLOWED_TYPES = new Set([
  "particular",
  "empresa",
]);

const DEFAULT_FORM = Object.freeze({
  name: "",
  email: "",
  phone: "",
  tipo: "particular",
  nif: "",

  calle: "",
  cp: "",
  ciudad: "",
  provincia: "",
  pais: "",

  privacyMode: false,
  darkMode: true,
});

const CREATE_SUCCESS_EVENTS = Object.freeze([
  "usuarios:create:success",
  "usuarios:create:created",
  "usuarios:created",
  "usuario:created",
]);

const CREATE_CLOSE_EVENTS = Object.freeze([
  "usuarios:create:closed",
  "usuarios:create:close",
]);

/* =========================================================
   STATE
========================================================= */

const state = {
  isOpen: false,
  submitting: false,

  error: "",
  errors: {},

  form: { ...DEFAULT_FORM },

  root: null,
  panel: null,
  lastActiveElement: null,

  clickHandler: null,
  inputHandler: null,
  submitHandler: null,

  openSequence: 0,
  submitSequence: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
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

function normalizeEmail(value = "") {
  const email =
    cleanText(value, "").toLowerCase();

  if (!email) return "";

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  )
    ? email
    : "";
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1") {
    return true;
  }

  if (value === 0 || value === "0") {
    return false;
  }

  const key = normalizeKey(value);

  if (
    [
      "true",
      "yes",
      "si",
      "on",
      "active",
      "enabled",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "no",
      "off",
      "inactive",
      "disabled",
    ].includes(key)
  ) {
    return false;
  }

  return fallback;
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
  return escapeHtml(
    cleanText(value, "")
  );
}

function safeError(
  error = null,
  fallback = "No se pudo crear el usuario."
) {
  return cleanText(
    error?.data?.message ||
      error?.payload?.message ||
      error?.response?.data?.message ||
      error?.response?.message ||
      error?.message ||
      error?.error ||
      fallback,
    fallback
  );
}

function getErrorCode(error = null) {
  return cleanText(
    error?.data?.code ||
      error?.payload?.code ||
      error?.response?.data?.code ||
      error?.response?.code ||
      error?.code ||
      "",
    ""
  ).toUpperCase();
}

/*
  Whitelist deliberada.
  Si código legacy intenta abrir el modal pasando password,
  role, status, activationUrl, etc., NO se retienen en state.
*/
function cloneForm(form = {}) {
  const source = safeObject(form);

  const direccion = safeObject(
    source.direccion ||
      source.address
  );

  return {
    name: cleanText(
      source.name ??
        source.displayName ??
        source.fullName ??
        source.nombre ??
        "",
      ""
    ).slice(0, 140),

    email: cleanText(
      source.email ??
        source.emailLower ??
        source.mail ??
        "",
      ""
    ).toLowerCase().slice(0, 254),

    phone: cleanText(
      source.phone ??
        source.telefono ??
        source.mobile ??
        "",
      ""
    ).slice(0, 40),

    tipo:
      normalizeKey(
        source.tipo ??
          source.clienteTipo ??
          "particular"
      ) === "empresa"
        ? "empresa"
        : "particular",

    nif: cleanText(
      source.nif ??
        source.cif ??
        source.taxId ??
        "",
      ""
    ).toUpperCase().slice(0, 32),

    calle: cleanText(
      source.calle ??
        direccion.calle ??
        direccion.street ??
        "",
      ""
    ).slice(0, 150),

    cp: cleanText(
      source.cp ??
        direccion.cp ??
        direccion.postalCode ??
        direccion.zip ??
        "",
      ""
    ).slice(0, 20),

    ciudad: cleanText(
      source.ciudad ??
        source.city ??
        direccion.ciudad ??
        direccion.city ??
        "",
      ""
    ).slice(0, 100),

    provincia: cleanText(
      source.provincia ??
        direccion.provincia ??
        direccion.province ??
        direccion.region ??
        "",
      ""
    ).slice(0, 100),

    pais: cleanText(
      source.pais ??
        direccion.pais ??
        direccion.country ??
        "",
      ""
    ).slice(0, 100),

    privacyMode: parseBoolean(
      source.privacyMode,
      false
    ),

    darkMode: parseBoolean(
      source.darkMode,
      true
    ),
  };
}

/* =========================================================
   ROOT / EVENTS / UI SERVICES
========================================================= */

function getRoot() {
  if (!isBrowser()) return null;

  const current =
    document.getElementById(
      ROOT_ID
    );

  if (current) {
    state.root = current;
    return current;
  }

  return null;
}

function removeDuplicateRoots(keep = null) {
  if (!isBrowser()) return 0;

  let removed = 0;

  for (
    const node of
    document.querySelectorAll(
      `#${ROOT_ID}`
    )
  ) {
    if (node === keep) continue;

    try {
      node.remove();
      removed += 1;
    } catch {
      // noop
    }
  }

  return removed;
}

const modalLifecycle = createModalLifecycle({
  getPanel: () => state.panel,
  onEscape: () => { if (!state.submitting) close(); },
  bodyClasses: ['usuarios-modal-open', 'usuarios-create-modal-open'],
});

function setBodyLock(open = false) {
  return open
    ? modalLifecycle.activate({ opener: state.lastActiveElement })
    : modalLifecycle.deactivate({ restoreFocus: false });
}

function emitEvent(
  name = "",
  payload = {}
) {
  const eventName =
    cleanText(name, "");

  if (!eventName) return false;

  let emitted = false;

  try {
    if (
      isFunction(
        AppCore?.events?.emit
      )
    ) {
      AppCore.events.emit(
        eventName,
        payload
      );

      emitted = true;
    }
  } catch {
    // window debajo
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(
          eventName,
          {
            detail: payload,
          }
        )
      );

      emitted = true;
    }
  } catch {
    // noop
  }

  return emitted;
}

function emitMany(
  events = [],
  payload = {}
) {
  for (const eventName of events) {
    emitEvent(
      eventName,
      payload
    );
  }
}

function showToast(
  message = "",
  type = "info"
) {
  const text =
    cleanText(message, "");

  if (!text) return false;

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ];

  for (const toast of candidates) {
    try {
      if (
        isFunction(
          toast?.[type]
        )
      ) {
        toast[type](text);
        return true;
      }

      if (
        isFunction(
          toast?.show
        )
      ) {
        toast.show(
          text,
          type
        );

        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

export function validateCreateUsuarioForm(
  form = {}
) {
  const current =
    cloneForm(form);

  const errors = {};

  const name =
    cleanText(
      current.name,
      ""
    );

  const rawEmail =
    cleanText(
      current.email,
      ""
    ).toLowerCase();

  const email =
    normalizeEmail(rawEmail);

  const phone =
    cleanText(
      current.phone,
      ""
    );

  const tipo =
    ALLOWED_TYPES.has(
      normalizeKey(
        current.tipo
      )
    )
      ? normalizeKey(
          current.tipo
        )
      : "particular";

  const nif =
    cleanText(
      current.nif,
      ""
    ).toUpperCase();

  if (name.length < 2) {
    errors.name =
      "Indica un nombre válido.";
  }

  if (!email) {
    errors.email =
      "Indica un email válido.";
  }

  if (phone.length > 40) {
    errors.phone =
      "El teléfono es demasiado largo.";
  }

  if (
    tipo === "empresa" &&
    !nif
  ) {
    errors.nif =
      "El NIF/CIF es obligatorio para empresa.";
  }

  if (nif.length > 32) {
    errors.nif =
      "El NIF/CIF es demasiado largo.";
  }

  const limits = {
    calle: 150,
    cp: 20,
    ciudad: 100,
    provincia: 100,
    pais: 100,
  };

  for (
    const [field, maxLength] of
    Object.entries(limits)
  ) {
    if (
      String(
        current[field] || ""
      ).length > maxLength
    ) {
      errors[field] =
        "El valor es demasiado largo.";
    }
  }

  return {
    valid:
      Object.keys(errors)
        .length === 0,

    errors,

    form: {
      ...current,
      name,
      email:
        email || rawEmail,
      phone,
      tipo,
      nif,
    },
  };
}

export function buildCreateUsuarioPayload(
  form = {}
) {
  const validation =
    validateCreateUsuarioForm(
      form
    );

  if (!validation.valid) {
    const error =
      new Error(
        "USUARIO_CREATE_FORM_INVALID"
      );

    error.code =
      "USUARIO_CREATE_FORM_INVALID";

    error.errors = {
      ...validation.errors,
    };

    throw error;
  }

  const current =
    validation.form;

  return {
    name:
      current.name,

    email:
      current.email,

    phone:
      current.phone,

    tipo:
      current.tipo,

    nif:
      current.nif,

    direccion: {
      calle:
        current.calle,

      cp:
        current.cp,

      ciudad:
        current.ciudad,

      provincia:
        current.provincia,

      pais:
        current.pais,
    },

    privacyMode:
      Boolean(
        current.privacyMode
      ),

    darkMode:
      Boolean(
        current.darkMode
      ),
  };
}

/* =========================================================
   TEMPLATE HELPERS
========================================================= */

function renderField({
  label = "",
  name = "",
  type = "text",
  value = "",
  placeholder = "",
  autocomplete = "off",
  required = false,
  error = "",
  disabled = false,
  maxLength = null,
  hint = "",
} = {}) {
  return `
    <label class="usr-create-field">
      <span class="usr-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <input
        class="usr-create-input${error ? " is-error" : ""}"
        data-usr-create-field="${attr(name)}"
        name="${attr(name)}"
        type="${attr(type)}"
        value="${attr(value)}"
        placeholder="${attr(placeholder)}"
        autocomplete="${attr(autocomplete)}"
        ${required ? "required" : ""}
        ${disabled ? "disabled" : ""}
        ${
          Number.isInteger(maxLength)
            ? `maxlength="${maxLength}"`
            : ""
        }
      >

      ${
        error
          ? `<span class="usr-create-error">${escapeHtml(error)}</span>`
          : hint
            ? `<span class="usr-create-hint">${escapeHtml(hint)}</span>`
            : ""
      }
    </label>
  `;
}

function renderSelect({
  label = "",
  name = "",
  value = "",
  options = [],
  error = "",
  disabled = false,
  hint = "",
} = {}) {
  return `
    <label class="usr-create-field">
      <span class="usr-create-label">
        ${escapeHtml(label)}
      </span>

      <select
        class="usr-create-select${error ? " is-error" : ""}"
        data-usr-create-field="${attr(name)}"
        name="${attr(name)}"
        ${disabled ? "disabled" : ""}
      >
        ${options
          .map(
            (option) => `
              <option
                value="${attr(option.value)}"
                ${
                  String(
                    option.value
                  ) ===
                  String(value)
                    ? "selected"
                    : ""
                }
              >
                ${escapeHtml(option.label)}
              </option>
            `
          )
          .join("")}
      </select>

      ${
        error
          ? `<span class="usr-create-error">${escapeHtml(error)}</span>`
          : hint
            ? `<span class="usr-create-hint">${escapeHtml(hint)}</span>`
            : ""
      }
    </label>
  `;
}

function renderAlert() {
  if (!state.error) return "";

  const warning = state.error.startsWith("El usuario se creó");

  return `
    <div
      class="usr-create-alert inc-create-alert ${warning ? "is-warning" : "is-error"}"
      role="${warning ? "status" : "alert"}"
    >
      <span class="usr-create-alert-icon inc-create-alert-icon" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/></svg>
      </span>
      <span class="usr-create-alert-copy inc-create-alert-copy">
        <strong>${warning ? "Atención con el alta" : "No se pudo crear el usuario"}</strong>
        <span>${escapeHtml(state.error)}</span>
      </span>
    </div>
  `;
}

function renderLoadingOverlay() {
  if (!state.submitting) return "";

  return `
    <div
      class="usr-create-loading-overlay inc-create-loading-overlay"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="usr-create-loading-card inc-create-loading-card" role="status">
        <span class="usr-create-loading-spinner inc-create-loading-spinner" aria-hidden="true"></span>
        <span class="usr-create-loading-copy inc-create-loading-copy">
          <strong>Creando usuario y enviando activación...</strong>
          <small>Guardando la cuenta y preparando el correo de activación.</small>
        </span>
      </div>
    </div>
  `;
}

function renderModalHtml() {
  const form = cloneForm(state.form);
  const errors = safeObject(state.errors);
  const disabled = state.submitting;
  const empresa = form.tipo === "empresa";

  return `
    <section
      id="${ROOT_ID}"
      class="usuarios-create-modal-host is-open inc-create-root"
      data-usuarios-create-root="true"
      data-version="${attr(USUARIOS_CREATE_MODAL_VERSION)}"
      data-api-version="${attr(USUARIOS_API_VERSION)}"
      data-create-endpoint="${attr(USUARIOS_CREATE_ENDPOINT)}"
      data-activation-flow="true"
      role="presentation"
    >
      <div
        class="usr-create-overlay inc-create-overlay"
        data-usr-create-action="overlay"
        aria-hidden="false"
      >
        <div
          id="${PANEL_ID}"
          class="usr-create-panel inc-create-panel${state.submitting ? " is-submitting" : ""}"
          data-usuarios-create-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usuarios-create-title"
          aria-describedby="usuarios-create-description"
          tabindex="-1"
        >
          <header class="usr-create-header inc-create-header">
            <div class="usr-create-header-copy inc-create-header-copy">
              <h2 id="usuarios-create-title">Crear usuario</h2>
              <p id="usuarios-create-description">Completa los datos de la cuenta. Se enviará un correo para que el usuario active su acceso.</p>
            </div>

            <button
              type="button"
              class="usr-create-close inc-create-close"
              data-usr-create-action="close"
              aria-label="Cerrar"
              ${disabled ? "disabled" : ""}
            >
              <svg aria-hidden="true" focusable="false" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </header>

          <div class="usr-create-body inc-create-body">
            ${renderAlert()}

            <form
              id="${FORM_ID}"
              class="usr-create-form inc-create-form"
              data-usuarios-create-form="true"
              novalidate
            >
              <section class="usr-create-main inc-create-block">
                <div class="usr-create-inline-grid inc-create-grid inc-create-grid--2">
                  ${renderField({
                    label: "Nombre completo",
                    name: "name",
                    value: form.name,
                    placeholder: "Nombre y apellidos",
                    autocomplete: "name",
                    required: true,
                    error: errors.name,
                    disabled,
                    maxLength: 140,
                  })}

                  ${renderField({
                    label: "Email",
                    name: "email",
                    type: "email",
                    value: form.email,
                    placeholder: "usuario@dominio.com",
                    autocomplete: "email",
                    required: true,
                    error: errors.email,
                    disabled,
                    maxLength: 254,
                    hint: "Aquí recibirá el enlace de activación.",
                  })}
                </div>

                <div class="usr-create-inline-grid usr-create-inline-grid--3 inc-create-grid inc-create-grid--3">
                  ${renderField({
                    label: "Teléfono",
                    name: "phone",
                    type: "tel",
                    value: form.phone,
                    placeholder: "+34 600 000 000",
                    autocomplete: "tel",
                    error: errors.phone,
                    disabled,
                    maxLength: 40,
                  })}

                  ${renderSelect({
                    label: "Tipo",
                    name: "tipo",
                    value: form.tipo,
                    error: errors.tipo,
                    disabled,
                    options: [
                      { value: "particular", label: "Particular" },
                      { value: "empresa", label: "Empresa" },
                    ],
                  })}

                  ${renderField({
                    label: "NIF / CIF",
                    name: "nif",
                    value: form.nif,
                    placeholder: empresa ? "Obligatorio para empresa" : "Opcional",
                    autocomplete: "off",
                    required: empresa,
                    error: errors.nif,
                    disabled,
                    maxLength: 32,
                    hint: empresa ? "" : "Solo es obligatorio cuando el tipo es Empresa.",
                  })}
                </div>

                <div class="usr-create-inline-grid inc-create-grid inc-create-grid--2">
                  ${renderField({
                    label: "Calle / dirección",
                    name: "calle",
                    value: form.calle,
                    placeholder: "Calle, número, piso...",
                    autocomplete: "street-address",
                    error: errors.calle,
                    disabled,
                    maxLength: 150,
                  })}

                  ${renderField({
                    label: "Código postal",
                    name: "cp",
                    value: form.cp,
                    placeholder: "00000",
                    autocomplete: "postal-code",
                    error: errors.cp,
                    disabled,
                    maxLength: 20,
                  })}
                </div>

                <div class="usr-create-inline-grid usr-create-inline-grid--3 inc-create-grid inc-create-grid--3">
                  ${renderField({
                    label: "Ciudad",
                    name: "ciudad",
                    value: form.ciudad,
                    placeholder: "Ciudad",
                    autocomplete: "address-level2",
                    error: errors.ciudad,
                    disabled,
                    maxLength: 100,
                  })}

                  ${renderField({
                    label: "Provincia",
                    name: "provincia",
                    value: form.provincia,
                    placeholder: "Provincia",
                    autocomplete: "address-level1",
                    error: errors.provincia,
                    disabled,
                    maxLength: 100,
                  })}

                  ${renderField({
                    label: "País",
                    name: "pais",
                    value: form.pais,
                    placeholder: "País",
                    autocomplete: "country-name",
                    error: errors.pais,
                    disabled,
                    maxLength: 100,
                  })}
                </div>

                <div class="usr-create-inline-grid inc-create-grid inc-create-grid--2">
                  ${renderSelect({
                    label: "Privacidad",
                    name: "privacyMode",
                    value: String(Boolean(form.privacyMode)),
                    disabled,
                    options: [
                      { value: "false", label: "Modo estándar" },
                      { value: "true", label: "Modo privacidad" },
                    ],
                  })}

                  ${renderSelect({
                    label: "Apariencia inicial",
                    name: "darkMode",
                    value: String(Boolean(form.darkMode)),
                    disabled,
                    options: [
                      { value: "true", label: "Modo oscuro" },
                      { value: "false", label: "Modo claro" },
                    ],
                  })}
                </div>

                <div
                  class="usr-create-alert inc-create-alert"
                  role="note"
                  data-usuarios-create-activation-note="true"
                >
                  <span class="usr-create-alert-icon inc-create-alert-icon" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </span>
                  <span class="usr-create-alert-copy inc-create-alert-copy">
                    <strong>Activación por correo</strong>
                    <span>El usuario se crea pendiente de activación. El nombre de usuario se genera automáticamente desde su email.</span>
                  </span>
                </div>
              </section>

              <div class="usr-create-actions inc-create-actions">
                <span class="usr-create-actions-note inc-create-actions-note">El usuario recibirá el enlace de activación en el email indicado.</span>
                <button
                  type="submit"
                  class="usr-create-submit inc-create-submit"
                  data-usr-create-action="submit"
                  ${disabled ? "disabled" : ""}
                >
                  ${state.submitting ? `<span class="usr-create-spinner inc-create-spinner" aria-hidden="true"></span><span>Creando...</span>` : `<span>Crear y enviar activación</span>`}
                </button>
              </div>
            </form>
          </div>

          ${renderLoadingOverlay()}
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   DOM / FOCUS
========================================================= */

function safeCssEscape(value = "") {
  const text = String(value ?? "");

  try {
    if (
      typeof CSS !== "undefined" &&
      isFunction(CSS.escape)
    ) {
      return CSS.escape(text);
    }
  } catch {
    // fallback debajo
  }

  return text.replace(
    /["\\]/g,
    "\\$&"
  );
}

function findField(name = "") {
  const fieldName =
    cleanText(name, "");

  if (!fieldName) return null;

  return state.root?.querySelector?.(
    `[data-usr-create-field="${safeCssEscape(fieldName)}"]`
  ) || null;
}

function captureFocus() {
  if (!isBrowser()) return null;

  const active =
    document.activeElement;

  const fieldName =
    active?.getAttribute?.(
      "data-usr-create-field"
    ) || "";

  return {
    fieldName,

    selectionStart:
      typeof active?.selectionStart ===
        "number"
        ? active.selectionStart
        : null,

    selectionEnd:
      typeof active?.selectionEnd ===
        "number"
        ? active.selectionEnd
        : null,
  };
}

function restoreFocus(snapshot = null) {
  const fieldName =
    cleanText(
      snapshot?.fieldName,
      ""
    );

  if (fieldName) {
    const field =
      findField(fieldName);

    try {
      field?.focus?.({
        preventScroll: true,
      });

      if (
        isFunction(
          field?.setSelectionRange
        ) &&
        Number.isInteger(
          snapshot?.selectionStart
        ) &&
        Number.isInteger(
          snapshot?.selectionEnd
        )
      ) {
        field.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd
        );
      }

      return true;
    } catch {
      // panel debajo
    }
  }

  try {
    state.panel?.focus?.({
      preventScroll: true,
    });

    return true;
  } catch {
    return false;
  }
}

function render({
  preserveFocus = true,
} = {}) {
  if (
    !isBrowser() ||
    !state.isOpen
  ) {
    return false;
  }

  const focusSnapshot =
    preserveFocus
      ? captureFocus()
      : null;

  const current =
    getRoot();

  const template =
    document.createElement(
      "template"
    );

  template.innerHTML =
    renderModalHtml().trim();

  const nextRoot =
    template.content
      .firstElementChild;

  if (!nextRoot) {
    return false;
  }

  if (current?.parentNode) {
    current.replaceWith(
      nextRoot
    );
  } else {
    document.body.appendChild(
      nextRoot
    );
  }

  state.root = nextRoot;

  state.panel =
    nextRoot.querySelector(
      "[data-usuarios-create-panel='true']"
    );

  removeDuplicateRoots(
    nextRoot
  );

  bind();

  if (focusSnapshot) {
    restoreFocus(
      focusSnapshot
    );
  }

  return true;
}

/* =========================================================
   BINDINGS
========================================================= */

function readFieldValue(target = null) {
  if (!target) return "";

  const name =
    cleanText(
      target.getAttribute?.(
        "data-usr-create-field"
      ) ||
        target.name,
      ""
    );

  if (
    name === "privacyMode" ||
    name === "darkMode"
  ) {
    return parseBoolean(
      target.value,
      name === "darkMode"
    );
  }

  return target.value;
}

function bind() {
  const root = state.root;

  if (!root) return false;

  unbind();

  state.clickHandler =
    (event) => {
      const target =
        event.target;

      if (
        typeof Element ===
          "undefined" ||
        !(target instanceof Element)
      ) {
        return;
      }

      const actionNode =
        target.closest(
          "[data-usr-create-action]"
        );

      const action =
        normalizeKey(
          actionNode?.getAttribute?.(
            "data-usr-create-action"
          ) || ""
        );

      if (action === "close") {
        event.preventDefault();
        close();
        return;
      }

      if (
        action === "overlay" &&
        target === actionNode
      ) {
        close();
      }
    };

  state.inputHandler =
    (event) => {
      const target =
        event.target;

      const isInput =
        typeof HTMLInputElement !==
          "undefined" &&
        target instanceof
          HTMLInputElement;

      const isSelect =
        typeof HTMLSelectElement !==
          "undefined" &&
        target instanceof
          HTMLSelectElement;

      if (
        !isInput &&
        !isSelect
      ) {
        return;
      }

      const name =
        cleanText(
          target.getAttribute(
            "data-usr-create-field"
          ) ||
            target.name,
          ""
        );

      if (
        !name ||
        !Object.prototype.hasOwnProperty.call(
          state.form,
          name
        )
      ) {
        return;
      }

      const previousType =
        state.form.tipo;

      state.form[name] =
        readFieldValue(
          target
        );

      if (name === "nif") {
        state.form.nif =
          cleanText(
            state.form.nif,
            ""
          ).toUpperCase();
      }

      if (state.errors[name]) {
        delete state.errors[name];

        target.classList.remove(
          "is-error"
        );

        target
          .closest(
            ".usr-create-field"
          )
          ?.querySelector(
            ".usr-create-error"
          )
          ?.remove();
      }

      if (
        name === "tipo" &&
        previousType !==
          state.form.tipo
      ) {
        /*
          Actualiza required/hint del NIF sin perder foco.
        */
        render({
          preserveFocus: true,
        });

        return;
      }

      if (state.error) {
        state.error = "";

        state.root
          ?.querySelector(
            ".usr-create-alert.is-error, .usr-create-alert.is-warning"
          )
          ?.remove();
      }
    };

  state.submitHandler =
    (event) => {
      event.preventDefault();
      void submit();
    };

  root.addEventListener(
    "click",
    state.clickHandler
  );

  root.addEventListener(
    "input",
    state.inputHandler
  );

  root.addEventListener(
    "change",
    state.inputHandler
  );

  const form =
    root.querySelector(
      "[data-usuarios-create-form='true']"
    );

  form?.addEventListener(
    "submit",
    state.submitHandler
  );

  return true;
}

function unbind() {
  const root = state.root;

  try {
    if (
      root &&
      state.clickHandler
    ) {
      root.removeEventListener(
        "click",
        state.clickHandler
      );
    }

    if (
      root &&
      state.inputHandler
    ) {
      root.removeEventListener(
        "input",
        state.inputHandler
      );

      root.removeEventListener(
        "change",
        state.inputHandler
      );
    }

    const form =
      root?.querySelector?.(
        "[data-usuarios-create-form='true']"
      );

    if (
      form &&
      state.submitHandler
    ) {
      form.removeEventListener(
        "submit",
        state.submitHandler
      );
    }

  } catch {
    // noop
  }

  state.clickHandler = null;
  state.inputHandler = null;
  state.submitHandler = null;

  return true;
}

/* =========================================================
   PUBLIC METHODS
========================================================= */

export async function open(options = {}) {
  if (!isBrowser()) {
    return false;
  }

  state.openSequence += 1;

  const current =
    getRoot();

  if (
    state.isOpen &&
    current?.isConnected
  ) {
    state.panel?.focus?.({
      preventScroll: true,
    });

    return true;
  }

  removeDuplicateRoots();

  state.isOpen = true;
  state.submitting = false;

  state.error = "";
  state.errors = {};

  state.form =
    cloneForm(
      options?.form ||
        DEFAULT_FORM
    );

  state.lastActiveElement =
    document.activeElement;

  render({
    preserveFocus: false,
  });

  setBodyLock(true);

  try {
    const firstField =
      findField("name");

    (
      firstField ||
      state.panel
    )?.focus?.({
      preventScroll: true,
    });
  } catch {
    // noop
  }

  emitEvent(
    "usuarios:create:opened",
    {
      source:
        "usuarios.create.modal",

      version:
        USUARIOS_CREATE_MODAL_VERSION,

      endpoint:
        USUARIOS_CREATE_ENDPOINT,

      activationFlow: true,
    }
  );

  return true;
}

export const mount = open;
export const init = open;

export function close() {
  state.openSequence += 1;
  state.submitSequence += 1;

  if (!isBrowser()) {
    state.root = null;
    state.panel = null;
    state.isOpen = false;
    state.submitting = false;
    state.error = "";
    state.errors = {};
    state.form = {
      ...DEFAULT_FORM,
    };
    return true;
  }

  unbind();

  const root =
    getRoot();

  try {
    root?.remove?.();
  } catch {
    // noop
  }

  removeDuplicateRoots();

  const previousFocus =
    state.lastActiveElement;

  state.root = null;
  state.panel = null;

  state.isOpen = false;
  state.submitting = false;

  state.error = "";
  state.errors = {};

  state.form = {
    ...DEFAULT_FORM,
  };

  state.lastActiveElement =
    null;

  setBodyLock(false);

  restoreModalFocus(previousFocus);

  emitMany(
    CREATE_CLOSE_EVENTS,
    {
      source:
        "usuarios.create.modal",

      version:
        USUARIOS_CREATE_MODAL_VERSION,
    }
  );

  return true;
}

export const destroy = close;
export const unmount = close;

export function reset() {
  state.form = {
    ...DEFAULT_FORM,
  };

  state.errors = {};
  state.error = "";
  state.submitting = false;

  if (state.isOpen) {
    render({
      preserveFocus: false,
    });
  }

  return true;
}

function creationFailureMessage(
  error = null
) {
  const code =
    getErrorCode(error);

  if (
    code ===
    "CREATE_USER_MAIL_FAILED"
  ) {
    return (
      "El usuario se creó, pero no se pudo enviar el correo de activación. " +
      "No repitas el alta: revisa el usuario existente y el envío del correo."
    );
  }

  if (
    code ===
    "USER_ALREADY_EXISTS"
  ) {
    return (
      "Ya existe un usuario con ese email."
    );
  }

  if (
    code ===
    "USER_LOOKUP_CONFLICT"
  ) {
    return (
      "Ese email o usuario ya está registrado en los índices de acceso."
    );
  }

  return safeError(
    error,
    "No se pudo crear el usuario."
  );
}

export async function submit(
  payload = null
) {
  if (state.submitting) {
    return null;
  }

  if (isObject(payload)) {
    state.form =
      cloneForm({
        ...state.form,
        ...payload,
        direccion: {
          calle:
            payload.calle ??
            payload.direccion?.calle ??
            state.form.calle,

          cp:
            payload.cp ??
            payload.direccion?.cp ??
            state.form.cp,

          ciudad:
            payload.ciudad ??
            payload.direccion?.ciudad ??
            state.form.ciudad,

          provincia:
            payload.provincia ??
            payload.direccion?.provincia ??
            state.form.provincia,

          pais:
            payload.pais ??
            payload.direccion?.pais ??
            state.form.pais,
        },
      });
  }

  const validation =
    validateCreateUsuarioForm(
      state.form
    );

  state.form =
    validation.form;

  state.errors =
    validation.errors;

  state.error = "";

  if (!validation.valid) {
    if (state.isOpen) {
      render({
        preserveFocus: false,
      });

      const firstErrorName =
        Object.keys(
          validation.errors
        )[0];

      findField(
        firstErrorName
      )?.focus?.({
        preventScroll: true,
      });
    }

    return null;
  }

  const submitId =
    ++state.submitSequence;

  state.submitting = true;

  if (state.isOpen) {
    render();
  }

  try {
    const createPayload =
      buildCreateUsuarioPayload(
        validation.form
      );

    const created =
      await createUsuario(
        createPayload
      );

    if (
      submitId !==
      state.submitSequence
    ) {
      return null;
    }

    /*
      usuarios.api.js devuelve exclusivamente el usuario
      normalizado y ya ha eliminado activationUrl/tokens.
    */
    const safeCreated =
      safeObject(
        created,
        null
      );

    if (!safeCreated) {
      throw new Error(
        "USUARIO_CREATE_INVALID_RESPONSE"
      );
    }

    showToast(
      "Usuario creado. Se ha enviado el correo de activación.",
      "success"
    );

    emitMany(
      CREATE_SUCCESS_EVENTS,
      {
        source:
          "usuarios.create.modal",

        version:
          USUARIOS_CREATE_MODAL_VERSION,

        activationRequired:
          true,

        user:
          safeCreated,

        usuario:
          safeCreated,

        item:
          safeCreated,

        detail:
          safeCreated,
      }
    );

    close();

    return safeCreated;
  } catch (error) {
    if (
      submitId !==
      state.submitSequence
    ) {
      return null;
    }

    state.error =
      creationFailureMessage(
        error
      );

    state.submitting = false;

    if (state.isOpen) {
      render();
    }

    showToast(
      state.error,
      getErrorCode(error) ===
        "CREATE_USER_MAIL_FAILED"
        ? "warning"
        : "error"
    );

    return null;
  }
}

export const submitCreate = submit;
export const save = submit;

export function getState() {
  return {
    version:
      USUARIOS_CREATE_MODAL_VERSION,

    apiVersion:
      USUARIOS_API_VERSION,

    endpoint:
      USUARIOS_CREATE_ENDPOINT,

    isOpen:
      state.isOpen,

    submitting:
      state.submitting,

    error:
      state.error,

    errors: {
      ...state.errors,
    },

    form:
      cloneForm(
        state.form
      ),

    activationFlow: true,

    contract: {
      generatedByBackend: [
        "userId",
        "username",
        "role",
        "active",
        "activation",
      ],

      requestFields: [
        "name",
        "email",
        "phone",
        "tipo",
        "nif",
        "direccion",
        "privacyMode",
        "darkMode",
      ],
    },
  };
}

export function getCreateTemplateSnapshot() {
  return {
    version:
      USUARIOS_CREATE_MODAL_VERSION,

    apiVersion:
      USUARIOS_API_VERSION,

    endpoint:
      USUARIOS_CREATE_ENDPOINT,

    activationFlow: true,

    fields: [
      "name",
      "email",
      "phone",
      "tipo",
      "nif",
      "calle",
      "cp",
      "ciudad",
      "provincia",
      "pais",
      "privacyMode",
      "darkMode",
    ],

    requestFields: [
      "name",
      "email",
      "phone",
      "tipo",
      "nif",
      "direccion",
      "privacyMode",
      "darkMode",
    ],

    generatedByBackend: [
      "userId",
      "username",
      "role",
      "active",
      "activation",
    ],

    policy: {
      singleton: true,
      staticApiImport: true,
      noPasswordFromAdmin: true,
      noRoleSelection: true,
      noStatusSelection: true,
      noUsernameSelection: true,
      activationTokenNotExposed: true,
      noCssInjection: true,
      focusTrap: true,
      restoreFocus: true,
      escapeToClose: true,
      overlayToClose: true,
    },
  };
}

export const getSnapshot =
  getCreateTemplateSnapshot;

export const renderCreateModal =
  render;

/* =========================================================
   DEFAULT BRIDGE
========================================================= */

const UsuariosCreateModal =
  Object.freeze({
    version:
      USUARIOS_CREATE_MODAL_VERSION,

    apiVersion:
      USUARIOS_API_VERSION,

    endpoint:
      USUARIOS_CREATE_ENDPOINT,

    open,
    mount,
    init,

    close,
    destroy,
    unmount,

    render,
    renderCreateModal,
    reset,

    submit,
    submitCreate,
    save,

    getState,
    getSnapshot,
  });

export default UsuariosCreateModal;

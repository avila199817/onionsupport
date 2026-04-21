/* =========================================================
   Onion SPA - Usuarios Create Modal
   Archivo: src/views/usuarios/usuarios.create.modal.js

   USERS EXPERIENCE PRO · CREATE MODAL · EXTENDED REAL DATA
========================================================= */

import { AppCore } from "../../core/index.js";
import { usuariosState } from "./usuarios.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "usuarios-create-modal-root";
const PANEL_ID = "usuarios-create-modal-panel";

const CUSTOMER_TYPE_OPTIONS = Object.freeze([
  { value: "particular", label: "Particular" },
  { value: "empresa", label: "Empresa" },
]);

const ROLE_OPTIONS = Object.freeze([
  { value: "admin", label: "Admin" },
  { value: "support", label: "Support" },
  { value: "manager", label: "Manager" },
  { value: "user", label: "User" },
]);

const DEFAULT_FORM = Object.freeze({
  name: "",
  username: "",
  email: "",
  phone: "",
  role: "user",
  active: true,
  customerType: "particular",
  nif: "",
  clienteId: "",
  password: "",
  privacyMode: false,
  darkMode: true,
  addressStreet: "",
  addressCp: "",
  addressCity: "",
  addressProvince: "",
  addressCountry: "España",
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
  createdUserId: "",
  form: {
    ...DEFAULT_FORM,
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
    return "No se pudo crear el usuario.";
  }

  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      "No se pudo crear el usuario."
    ),
    "No se pudo crear el usuario."
  );
}

function sanitizePhone(value = "") {
  return safeText(value, "").replace(/[^\d+()\-\s]/g, "").trim();
}

function sanitizeUsername(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function isValidEmail(value = "") {
  const text = safeText(value, "");
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function isValidPhone(value = "") {
  const normalized = safeText(value, "").replace(/[^\d]/g, "");
  return normalized.length >= 7;
}

function normalizeCustomerType(value = "") {
  const raw = safeText(value, "particular").toLowerCase();

  if (raw === "empresa" || raw === "company") return "empresa";
  return "particular";
}

function normalizeRole(value = "") {
  const raw = safeText(value, "user").toLowerCase();

  if (["admin", "support", "manager", "user"].includes(raw)) {
    return raw;
  }

  return "user";
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getInitialForm() {
  const draft = safeObject(usuariosState?.createDraft);
  const direccion = safeObject(draft.direccion);

  return {
    name: safeText(first(draft.name, draft.fullName), ""),
    username: safeText(draft.username, ""),
    email: safeText(draft.email, ""),
    phone: safeText(draft.phone, ""),
    role: normalizeRole(draft.role),
    active: toBoolean(draft.active, true),
    customerType: normalizeCustomerType(first(draft.customerType, draft.tipo)),
    nif: safeText(draft.nif, ""),
    clienteId: safeText(draft.clienteId, ""),
    password: "",
    privacyMode: toBoolean(draft.privacyMode, false),
    darkMode: toBoolean(draft.darkMode, true),
    addressStreet: safeText(first(draft.addressStreet, direccion.calle), ""),
    addressCp: safeText(first(draft.addressCp, direccion.cp), ""),
    addressCity: safeText(first(draft.addressCity, direccion.ciudad), ""),
    addressProvince: safeText(first(draft.addressProvince, direccion.provincia), ""),
    addressCountry: safeText(first(draft.addressCountry, direccion.pais), "España"),
  };
}

function persistDraft() {
  usuariosState.createDraft = {
    name: safeText(modalState.form?.name, ""),
    username: safeText(modalState.form?.username, ""),
    email: safeText(modalState.form?.email, ""),
    phone: safeText(modalState.form?.phone, ""),
    role: normalizeRole(modalState.form?.role),
    active: Boolean(modalState.form?.active),
    customerType: normalizeCustomerType(modalState.form?.customerType),
    tipo: normalizeCustomerType(modalState.form?.customerType),
    nif: safeText(modalState.form?.nif, ""),
    clienteId: safeText(modalState.form?.clienteId, ""),
    privacyMode: Boolean(modalState.form?.privacyMode),
    darkMode: Boolean(modalState.form?.darkMode),
    direccion: {
      calle: safeText(modalState.form?.addressStreet, ""),
      cp: safeText(modalState.form?.addressCp, ""),
      ciudad: safeText(modalState.form?.addressCity, ""),
      provincia: safeText(modalState.form?.addressProvince, ""),
      pais: safeText(modalState.form?.addressCountry, ""),
    },
  };
}

function clearDraft() {
  usuariosState.createDraft = {
    ...DEFAULT_FORM,
    tipo: "particular",
    direccion: {
      calle: "",
      cp: "",
      ciudad: "",
      provincia: "",
      pais: "España",
    },
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
  modalState.createdUserId = "";
}

function resetFormState() {
  modalState.form = {
    ...DEFAULT_FORM,
  };
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const name = safeText(current.name, "");
  const username = sanitizeUsername(current.username);
  const phone = sanitizePhone(current.phone);
  const email = safeText(current.email, "");
  const nif = safeText(current.nif, "");
  const password = safeText(current.password, "");
  const customerType = normalizeCustomerType(current.customerType);
  const addressStreet = safeText(current.addressStreet, "");
  const addressCp = safeText(current.addressCp, "");
  const addressCity = safeText(current.addressCity, "");
  const addressProvince = safeText(current.addressProvince, "");
  const addressCountry = safeText(current.addressCountry, "");

  if (!name) {
    errors.name = "El nombre completo es obligatorio.";
  } else if (name.length < 3) {
    errors.name = "El nombre debe tener al menos 3 caracteres.";
  }

  if (!username) {
    errors.username = "El username es obligatorio.";
  } else if (username.length < 3) {
    errors.username = "El username debe tener al menos 3 caracteres.";
  }

  if (!email) {
    errors.email = "El email es obligatorio.";
  } else if (!isValidEmail(email)) {
    errors.email = "Introduce un email válido.";
  }

  if (!phone) {
    errors.phone = "El teléfono es obligatorio.";
  } else if (!isValidPhone(phone)) {
    errors.phone = "Introduce un teléfono válido.";
  }

  if (!password) {
    errors.password = "La contraseña es obligatoria.";
  } else if (password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  }

  if (!customerType) {
    errors.customerType = "Selecciona si es particular o empresa.";
  }

  if (customerType === "empresa" && !nif) {
    errors.nif = "El NIF/CIF es obligatorio para empresas.";
  }

  if (!addressStreet) {
    errors.addressStreet = "La calle es obligatoria.";
  }

  if (!addressCp) {
    errors.addressCp = "El código postal es obligatorio.";
  }

  if (!addressCity) {
    errors.addressCity = "La ciudad es obligatoria.";
  }

  if (!addressProvince) {
    errors.addressProvince = "La provincia es obligatoria.";
  }

  if (!addressCountry) {
    errors.addressCountry = "El país es obligatorio.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function buildPayload(form = {}) {
  const current = safeObject(form);

  return {
    name: normalizeWhitespace(current.name),
    username: sanitizeUsername(current.username),
    email: safeText(current.email, "").toLowerCase(),
    phone: sanitizePhone(current.phone),
    role: normalizeRole(current.role),
    active: Boolean(current.active),
    tipo: normalizeCustomerType(current.customerType),
    nif: safeText(current.nif, "").toUpperCase(),
    clienteId: safeText(current.clienteId, ""),
    password: safeText(current.password, ""),
    privacyMode: Boolean(current.privacyMode),
    darkMode: Boolean(current.darkMode),
    direccion: {
      calle: normalizeWhitespace(current.addressStreet),
      cp: safeText(current.addressCp, ""),
      ciudad: normalizeWhitespace(current.addressCity),
      provincia: normalizeWhitespace(current.addressProvince),
      pais: normalizeWhitespace(current.addressCountry),
    },
  };
}

/* =========================================================
   CREATE ADAPTERS
========================================================= */

async function createViaAppCoreRequest(payload = null) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request("/api/users", {
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
    return Http.post("/api/users", payload);
  }

  if (typeof Http.request === "function") {
    return Http.request("/api/users", {
      method: "POST",
      body: payload,
    });
  }

  throw new Error("HTTP_POST_UNAVAILABLE");
}

async function createViaFetch(payload = null) {
  const apiBase = getApiBase();
  const token = getAuthToken();
  const url = `${apiBase || ""}/api/users`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload || {}),
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
          `HTTP ${response.status} al crear usuario.`
        ),
        "No se pudo crear el usuario."
      )
    );
    error.response = data;
    throw error;
  }

  return data;
}

function pickCreatedUser(response = null) {
  const obj = safeObject(response);

  return obj.user || obj.item || obj.data || obj.result || obj.payload || obj;
}

function resolveCreatedUserId(response = null) {
  const user = safeObject(pickCreatedUser(response));

  return safeText(
    first(
      user.userId,
      user.id,
      user.code,
      user.uid,
      user.username,
      user.email
    ),
    ""
  );
}

async function createUsuarioRequest(payload = null) {
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

  return `<span class="usr-create-error">${escapeHtml(text)}</span>`;
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
    <label class="usr-create-field">
      <span class="usr-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <input
        class="usr-create-input ${error ? "is-error" : ""}"
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

function renderSelect({
  label = "",
  name = "",
  value = "",
  required = false,
  error = "",
  options = [],
} = {}) {
  const items = Array.isArray(options) ? options : [];

  return `
    <label class="usr-create-field">
      <span class="usr-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <select
        class="usr-create-select ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
      >
        ${items
          .map((option) => {
            const optionValue = safeText(option?.value, "");
            const optionLabel = safeText(option?.label, optionValue);
            const selected = optionValue === value ? "selected" : "";

            return `
              <option value="${escapeHtml(optionValue)}" ${selected}>
                ${escapeHtml(optionLabel)}
              </option>
            `;
          })
          .join("")}
      </select>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderToggle({
  label = "",
  name = "",
  checked = false,
} = {}) {
  return `
    <label class="usr-create-toggle">
      <input
        type="checkbox"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        ${checked ? "checked" : ""}
      />
      <span class="usr-create-toggle-ui"></span>
      <span class="usr-create-toggle-label">${escapeHtml(label)}</span>
    </label>
  `;
}

function renderInfoCard(customerType = "particular") {
  const isCompany = normalizeCustomerType(customerType) === "empresa";

  return `
    <section class="usr-create-side-card usr-create-side-note">
      <strong class="usr-create-side-title">Antes de guardar</strong>

      <div class="usr-create-note-list">
        <span>Se crearán identidad, acceso y datos base del usuario.</span>
        <span>${isCompany ? "Para empresa conviene registrar el NIF y la dirección fiscal completa." : "Para particular puedes dejar clienteId vacío si aún no está vinculado."}</span>
        <span>El username y el email deberían ser únicos.</span>
      </div>
    </section>
  `;
}

function renderTypeCard(customerType = "particular") {
  const normalized = normalizeCustomerType(customerType);
  const title =
    normalized === "empresa" ? "Perfil empresa" : "Perfil particular";
  const text =
    normalized === "empresa"
      ? "Pensado para cuentas con datos fiscales y posible vinculación con cliente."
      : "Pensado para usuarios o clientes finales a título personal.";

  return `
    <section class="usr-create-side-card">
      <div class="usr-create-side-head">
        <div class="usr-create-side-head-copy">
          <strong class="usr-create-side-title">${escapeHtml(title)}</strong>
          <span class="usr-create-side-text">${escapeHtml(text)}</span>
        </div>

        <span class="usr-create-side-pill">
          ${escapeHtml(normalized)}
        </span>
      </div>
    </section>
  `;
}

function renderAlert(type = "info", title = "", text = "", extra = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");
  if (!safeTitle && !safeBody) return "";

  return `
    <div class="usr-create-alert is-${escapeHtml(type)}">
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
  const createdUserId = safeText(modalState.createdUserId, "");

  return `
    <div
      data-usuarios-create-modal-overlay="true"
      class="usr-create-overlay"
    >
      <div
        id="${PANEL_ID}"
        data-usuarios-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usuarios-create-modal-title"
        tabindex="-1"
        class="usr-create-panel"
      >
        <div class="usr-create-header">
          <div class="usr-create-header-copy">
            <div class="usr-create-header-text">
              <h2 id="usuarios-create-modal-title">
                Crear ficha de usuario
              </h2>

              <p>
                Añade los datos principales del usuario y deja la base lista para seguir trabajando después.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${submitting ? "disabled" : ""}
            class="usr-create-close"
          >
            ✕
          </button>
        </div>

        <div class="usr-create-body">
          ${
            successMessage
              ? renderAlert(
                  "success",
                  "El usuario se ha creado correctamente.",
                  createdUserId ? `Referencia generada: ${createdUserId}` : ""
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo crear el usuario",
                  serverError
                )
              : ""
          }

          <form id="usuarios-create-form" novalidate class="usr-create-form">
            <div class="usr-create-grid">
              <div class="usr-create-main">
                ${renderInput({
                  label: "Nombre completo",
                  name: "name",
                  value: form.name,
                  placeholder: "Ej. Cristian Ávila Luque",
                  required: true,
                  error: errors.name,
                  autocomplete: "name",
                })}

                <div class="usr-create-inline-grid">
                  ${renderInput({
                    label: "Username",
                    name: "username",
                    value: form.username,
                    placeholder: "Ej. cristian",
                    required: true,
                    error: errors.username,
                    autocomplete: "username",
                  })}

                  ${renderSelect({
                    label: "Rol",
                    name: "role",
                    value: normalizeRole(form.role),
                    required: true,
                    error: errors.role,
                    options: ROLE_OPTIONS,
                  })}
                </div>

                <div class="usr-create-inline-grid">
                  ${renderInput({
                    label: "Email",
                    name: "email",
                    value: form.email,
                    type: "email",
                    placeholder: "Ej. usuario@correo.com",
                    required: true,
                    error: errors.email,
                    autocomplete: "email",
                  })}

                  ${renderInput({
                    label: "Teléfono",
                    name: "phone",
                    value: form.phone,
                    placeholder: "Ej. +34 600 123 456",
                    required: true,
                    error: errors.phone,
                    autocomplete: "tel",
                  })}
                </div>

                <div class="usr-create-inline-grid">
                  ${renderSelect({
                    label: "Tipo",
                    name: "customerType",
                    value: normalizeCustomerType(form.customerType),
                    required: true,
                    error: errors.customerType,
                    options: CUSTOMER_TYPE_OPTIONS,
                  })}

                  ${renderInput({
                    label: "NIF / CIF",
                    name: "nif",
                    value: form.nif,
                    placeholder: "Ej. 12345678Z / B12345678",
                    required: normalizeCustomerType(form.customerType) === "empresa",
                    error: errors.nif,
                    autocomplete: "off",
                  })}
                </div>

                <div class="usr-create-inline-grid">
                  ${renderInput({
                    label: "Cliente ID",
                    name: "clienteId",
                    value: form.clienteId,
                    placeholder: "Ej. CON-20260316631627",
                    required: false,
                    error: errors.clienteId,
                    autocomplete: "off",
                  })}

                  ${renderInput({
                    label: "Contraseña",
                    name: "password",
                    value: form.password,
                    type: "password",
                    placeholder: "Mínimo 8 caracteres",
                    required: true,
                    error: errors.password,
                    autocomplete: "new-password",
                  })}
                </div>

                <div class="usr-create-inline-grid usr-create-inline-grid--3">
                  ${renderInput({
                    label: "Calle",
                    name: "addressStreet",
                    value: form.addressStreet,
                    placeholder: "Ej. Calle Rafael de Casanova 54 1ro 3ra",
                    required: true,
                    error: errors.addressStreet,
                    autocomplete: "street-address",
                  })}

                  ${renderInput({
                    label: "CP",
                    name: "addressCp",
                    value: form.addressCp,
                    placeholder: "Ej. 08295",
                    required: true,
                    error: errors.addressCp,
                    autocomplete: "postal-code",
                  })}

                  ${renderInput({
                    label: "Ciudad",
                    name: "addressCity",
                    value: form.addressCity,
                    placeholder: "Ej. Sant Vicenç de Castellet",
                    required: true,
                    error: errors.addressCity,
                    autocomplete: "address-level2",
                  })}
                </div>

                <div class="usr-create-inline-grid">
                  ${renderInput({
                    label: "Provincia",
                    name: "addressProvince",
                    value: form.addressProvince,
                    placeholder: "Ej. Barcelona",
                    required: true,
                    error: errors.addressProvince,
                    autocomplete: "address-level1",
                  })}

                  ${renderInput({
                    label: "País",
                    name: "addressCountry",
                    value: form.addressCountry,
                    placeholder: "Ej. España",
                    required: true,
                    error: errors.addressCountry,
                    autocomplete: "country-name",
                  })}
                </div>

                <div class="usr-create-toggle-grid">
                  ${renderToggle({
                    label: "Usuario activo",
                    name: "active",
                    checked: Boolean(form.active),
                  })}

                  ${renderToggle({
                    label: "Privacy mode",
                    name: "privacyMode",
                    checked: Boolean(form.privacyMode),
                  })}

                  ${renderToggle({
                    label: "Dark mode",
                    name: "darkMode",
                    checked: Boolean(form.darkMode),
                  })}
                </div>
              </div>

              <aside class="usr-create-side">
                ${renderTypeCard(form.customerType)}
                ${renderInfoCard(form.customerType)}
              </aside>
            </div>

            <div class="usr-create-actions">
              <button
                id="usuarios-create-submit-btn"
                type="submit"
                ${submitting ? "disabled" : ""}
                class="usr-create-submit"
              >
                ${
                  submitting
                    ? `
                      <span class="usr-create-submit-inner">
                        <span class="usr-create-spinner" aria-hidden="true"></span>
                        Creando...
                      </span>
                    `
                    : "Crear usuario"
                }
              </button>
            </div>
          </form>
        </div>

        <style>
          @keyframes usuariosCreateSpin {
            to { transform: rotate(360deg); }
          }

          .usr-create-overlay{
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

          .usr-create-panel{
            position:relative;
            width:min(1080px, 100%);
            max-height:90vh;
            overflow:auto;
            border-radius:24px;
            border:1px solid var(--border-soft, #2b2b2b);
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
            box-shadow:0 34px 84px rgba(0,0,0,.42);
          }

          .usr-create-header{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:14px;
            padding:18px 18px 14px;
            border-bottom:1px solid var(--border-soft);
          }

          .usr-create-header-copy{
            display:grid;
            gap:10px;
            min-width:0;
            flex:1 1 auto;
          }

          .usr-create-header-text{
            display:grid;
            gap:6px;
          }

          .usr-create-header-text h2{
            margin:0;
            color:var(--text-strong);
            font-size:clamp(24px, 3.6vw, 34px);
            line-height:1;
            letter-spacing:-.045em;
          }

          .usr-create-header-text p{
            margin:0;
            max-width:760px;
            color:var(--text-dim);
            font-size:13px;
            line-height:1.55;
          }

          .usr-create-close{
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

          .usr-create-close:disabled{
            opacity:.7;
            cursor:not-allowed;
          }

          .usr-create-body{
            padding:16px 18px 18px;
            display:grid;
            gap:14px;
          }

          .usr-create-alert{
            display:grid;
            gap:4px;
            padding:12px 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
          }

          .usr-create-alert strong{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
          }

          .usr-create-alert span{
            color:var(--text-dim);
            font-size:12px;
            line-height:1.5;
          }

          .usr-create-alert.is-success{
            border-color:color-mix(in srgb, var(--success-strong, #36c690) 28%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 10%, transparent), transparent 85%),
              var(--surface-1, var(--surface-glass));
          }

          .usr-create-alert.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 28%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 85%),
              var(--surface-1, var(--surface-glass));
          }

          .usr-create-form{
            display:grid;
            gap:14px;
          }

          .usr-create-grid{
            display:grid;
            grid-template-columns:minmax(0, 1.45fr) minmax(280px, .7fr);
            gap:14px;
            align-items:start;
          }

          .usr-create-main{
            display:grid;
            gap:14px;
            min-width:0;
          }

          .usr-create-inline-grid{
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:14px;
          }

          .usr-create-inline-grid--3{
            grid-template-columns:1.6fr .7fr 1fr;
          }

          .usr-create-toggle-grid{
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:12px;
            padding-top:2px;
          }

          .usr-create-side{
            display:grid;
            gap:12px;
            min-width:0;
          }

          .usr-create-field{
            display:grid;
            gap:8px;
            min-width:0;
          }

          .usr-create-label{
            color:var(--text-soft);
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.05em;
            text-transform:uppercase;
          }

          .usr-create-input,
          .usr-create-select{
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

          .usr-create-input,
          .usr-create-select{
            min-height:46px;
            padding:0 14px;
            border-radius:14px;
            font-size:14px;
          }

          .usr-create-select{
            appearance:none;
            -webkit-appearance:none;
            -moz-appearance:none;
            cursor:pointer;
            background-image:
              linear-gradient(45deg, transparent 50%, currentColor 50%),
              linear-gradient(135deg, currentColor 50%, transparent 50%);
            background-position:
              calc(100% - 18px) calc(50% - 3px),
              calc(100% - 12px) calc(50% - 3px);
            background-size:6px 6px, 6px 6px;
            background-repeat:no-repeat;
          }

          .usr-create-input::placeholder{
            color:var(--text-faint);
          }

          .usr-create-input:focus,
          .usr-create-select:focus{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 30%, var(--border-soft));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          }

          .usr-create-input.is-error,
          .usr-create-select.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 38%, var(--border-soft));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent);
          }

          .usr-create-error{
            color:var(--danger-strong, #ff6b6b);
            font-size:11px;
            line-height:1.35;
            font-weight:var(--weight-semibold, 600);
          }

          .usr-create-side-card{
            display:grid;
            gap:10px;
            padding:14px;
            border-radius:16px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
          }

          .usr-create-side-head{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:10px;
          }

          .usr-create-side-head-copy{
            display:grid;
            gap:4px;
            min-width:0;
          }

          .usr-create-side-title{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.3;
          }

          .usr-create-side-text{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .usr-create-side-pill{
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

          .usr-create-side-note{
            gap:8px;
          }

          .usr-create-note-list{
            display:grid;
            gap:6px;
          }

          .usr-create-note-list span{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .usr-create-toggle{
            display:flex;
            align-items:center;
            gap:10px;
            min-height:46px;
            padding:0 12px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
            cursor:pointer;
          }

          .usr-create-toggle input{
            display:none;
          }

          .usr-create-toggle-ui{
            position:relative;
            width:44px;
            height:24px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            flex:0 0 auto;
          }

          .usr-create-toggle-ui::after{
            content:"";
            position:absolute;
            top:2px;
            left:2px;
            width:18px;
            height:18px;
            border-radius:999px;
            background:#fff;
            box-shadow:0 4px 10px rgba(0,0,0,.24);
            transition:left .18s ease, background .18s ease;
          }

          .usr-create-toggle input:checked + .usr-create-toggle-ui{
            background:color-mix(in srgb, var(--accent, #7c5cff) 20%, transparent);
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 34%, transparent);
          }

          .usr-create-toggle input:checked + .usr-create-toggle-ui::after{
            left:22px;
            background:var(--accent, #7c5cff);
          }

          .usr-create-toggle-label{
            color:var(--text-soft);
            font-size:13px;
            font-weight:var(--weight-semibold, 600);
            line-height:1.3;
          }

          .usr-create-actions{
            display:flex;
            justify-content:flex-end;
            gap:12px;
            padding-top:2px;
          }

          .usr-create-submit{
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

          .usr-create-submit:disabled{
            opacity:.8;
            cursor:wait;
          }

          .usr-create-submit-inner{
            display:inline-flex;
            align-items:center;
            gap:8px;
          }

          .usr-create-spinner{
            width:14px;
            height:14px;
            border-radius:999px;
            border:2px solid rgba(255,255,255,.28);
            border-top-color:#fff;
            animation:usuariosCreateSpin .8s linear infinite;
          }

          [data-theme="light"] .usr-create-panel{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,255,.94));
            box-shadow:
              0 28px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.65) inset;
          }

          [data-theme="light"] .usr-create-side-card,
          [data-theme="light"] .usr-create-alert,
          [data-theme="light"] .usr-create-input,
          [data-theme="light"] .usr-create-select,
          [data-theme="light"] .usr-create-toggle{
            box-shadow:0 6px 16px rgba(15,23,42,.04);
          }

          @media (max-width: 980px){
            .usr-create-grid{
              grid-template-columns:1fr;
            }
          }

          @media (max-width: 820px){
            .usr-create-inline-grid,
            .usr-create-inline-grid--3,
            .usr-create-toggle-grid{
              grid-template-columns:1fr;
            }
          }

          @media (max-width: 640px){
            .usr-create-overlay{
              padding:10px;
            }

            .usr-create-panel{
              width:100%;
              max-height:94vh;
              border-radius:18px;
            }

            .usr-create-header{
              padding:14px 14px 12px;
            }

            .usr-create-body{
              padding:14px;
            }

            .usr-create-header-text h2{
              font-size:28px;
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
      closeUsuariosCreateModal();
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

export function openUsuariosCreateModal(draft = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;
  resetFeedbackState();

  modalState.form = {
    ...getInitialForm(),
    ...safeObject(draft),
  };

  modalState.form.customerType = normalizeCustomerType(
    first(modalState.form.customerType, modalState.form.tipo)
  );
  modalState.form.role = normalizeRole(modalState.form.role);
  modalState.form.active = toBoolean(modalState.form.active, true);
  modalState.form.privacyMode = toBoolean(modalState.form.privacyMode, false);
  modalState.form.darkMode = toBoolean(modalState.form.darkMode, true);

  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("usuarios:create-modal:opened", {
    draft: { ...modalState.form },
  });

  return true;
}

export function closeUsuariosCreateModal() {
  if (modalState.submitting) {
    return false;
  }

  const root = getRoot();

  modalState.isOpen = false;
  modalState.submitting = false;
  resetFeedbackState();
  resetFormState();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("usuarios:create-modal:closed", {});

  return true;
}

export function updateUsuariosCreateModal(draft = {}) {
  if (!modalState.isOpen) {
    return openUsuariosCreateModal(draft);
  }

  modalState.form = {
    ...safeObject(modalState.form),
    ...safeObject(draft),
  };

  modalState.form.customerType = normalizeCustomerType(
    first(modalState.form.customerType, modalState.form.tipo)
  );
  modalState.form.role = normalizeRole(modalState.form.role);

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
  modalState.createdUserId = "";
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

  safeEmit("usuarios:create:submit", {
    ...payload,
  });

  try {
    const response = await createUsuarioRequest(payload);
    const createdUserId = resolveCreatedUserId(response);
    const detail = pickCreatedUser(response);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "El usuario se ha creado correctamente.";
    modalState.createdUserId = createdUserId;

    clearDraft();
    resetFormState();

    renderModal();
    attachRootBindings();
    focusPanel();

    showToast("Usuario creado correctamente.", "success");

    safeEmit("usuarios:create:success", {
      userId: createdUserId,
      response,
      detail,
    });

    setTimeout(() => {
      closeUsuariosCreateModal();
    }, 450);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(error);

    safeEmit("usuarios:create:error", {
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

function handleFieldChange(target) {
  const field = safeText(target?.dataset?.field, "");
  if (!field) return;

  let value = target?.value;

  if (field === "customerType") {
    value = normalizeCustomerType(value);
  } else if (field === "role") {
    value = normalizeRole(value);
  } else if (field === "username") {
    value = sanitizeUsername(value);
  } else if (target?.type === "checkbox") {
    value = Boolean(target.checked);
  }

  setFormPatch({
    [field]: value,
  });

  if (modalState.errors[field]) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors[field];
    modalState.errors = nextErrors;
  }

  if (field === "customerType" && value === "particular" && modalState.errors.nif) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.nif;
    modalState.errors = nextErrors;
  }

  if (modalState.serverError) {
    modalState.serverError = "";
  }

  if (modalState.successMessage || modalState.createdUserId) {
    modalState.successMessage = "";
    modalState.createdUserId = "";
  }

  if (field === "customerType") {
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
    if (field.tagName === "SELECT" || field.type === "checkbox") return;

    handleFieldChange(field);
  };

  const onChange = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    handleFieldChange(field);
  };

  const onSubmit = async (event) => {
    const form = event.target.closest("#usuarios-create-form");
    if (!form) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onClick = (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");
    if (closeBtn) {
      event.preventDefault();
      closeUsuariosCreateModal();
      return;
    }

    const overlay = event.target.closest("[data-usuarios-create-modal-overlay='true']");
    const panel = event.target.closest("[data-usuarios-create-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeUsuariosCreateModal();
    }
  };

  root.__usuariosCreateModalInputHandler = onInput;
  root.__usuariosCreateModalChangeHandler = onChange;
  root.__usuariosCreateModalSubmitHandler = onSubmit;
  root.__usuariosCreateModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__usuariosCreateModalInputHandler) {
    try {
      root.removeEventListener("input", root.__usuariosCreateModalInputHandler);
    } catch {}
    delete root.__usuariosCreateModalInputHandler;
  }

  if (root.__usuariosCreateModalChangeHandler) {
    try {
      root.removeEventListener("change", root.__usuariosCreateModalChangeHandler);
    } catch {}
    delete root.__usuariosCreateModalChangeHandler;
  }

  if (root.__usuariosCreateModalSubmitHandler) {
    try {
      root.removeEventListener("submit", root.__usuariosCreateModalSubmitHandler);
    } catch {}
    delete root.__usuariosCreateModalSubmitHandler;
  }

  if (root.__usuariosCreateModalClickHandler) {
    try {
      root.removeEventListener("click", root.__usuariosCreateModalClickHandler);
    } catch {}
    delete root.__usuariosCreateModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const draft = event?.detail?.draft || event?.detail || event || {};
  openUsuariosCreateModal(safeObject(draft));
}

function handleCloseEvent() {
  closeUsuariosCreateModal();
}

function handleUpdateEvent(event) {
  const draft = event?.detail?.draft || event?.detail || event || {};
  updateUsuariosCreateModal(safeObject(draft));
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("usuarios:create-modal:open", handleOpenEvent);
  safeOn("usuarios:create-modal:close", handleCloseEvent);
  safeOn("usuarios:create-modal:update", handleUpdateEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("usuarios:create-modal:open", handleOpenEvent);
  safeOff("usuarios:create-modal:close", handleCloseEvent);
  safeOff("usuarios:create-modal:update", handleUpdateEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionUsuariosCreateModal = {
  open(draft = {}) {
    return openUsuariosCreateModal(draft);
  },

  close() {
    return closeUsuariosCreateModal();
  },

  update(draft = {}) {
    return updateUsuariosCreateModal(draft);
  },

  getState() {
    return {
      ...modalState,
      errors: { ...safeObject(modalState.errors) },
      form: {
        ...safeObject(modalState.form),
      },
    };
  },

  destroy() {
    detachRootBindings();
    closeUsuariosCreateModal();
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
  window.OnionUsuariosCreateModal = OnionUsuariosCreateModal;
  window.renderUsuariosCreateModal = OnionUsuariosCreateModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionUsuariosCreateModal;

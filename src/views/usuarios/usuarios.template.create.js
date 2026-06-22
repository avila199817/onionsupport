/* =========================================================
   Onion Support - Usuarios Create Modal
   Archivo: /src/views/usuarios/usuarios.template.create.js

   PRODUCTIVO · SINGLETON · NO DUPLICIDADES · CSP CLEAN · 10/10 · V2

   Responsabilidad:
   - Crear el módulo que index.js importa de forma obligatoria.
   - Montar un único modal de alta de usuario.
   - Validar datos antes del POST.
   - Crear mediante usuarios.api.js.
   - Emitir eventos compatibles con el controlador de Usuarios.
   - Cerrar con botón, overlay y Escape.
   - Mantener bloqueo de scroll y restauración de foco.
   - Sin CSS inyectado.
   - Sin listeners duplicados.
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   META / CONSTANTS
========================================================= */

export const USUARIOS_CREATE_MODAL_VERSION = "usuarios.create.modal.productive.v2.singleton.no-pages-ready";

const ROOT_ID = "usuarios-create-modal-root";
const PANEL_ID = "usuarios-create-modal-panel";
const FORM_ID = "usuarios-create-form";

const DEFAULT_FORM = Object.freeze({
  name: "",
  email: "",
  username: "",
  phone: "",
  role: "user",
  status: "active",
  password: "",
  confirmPassword: "",
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
  keydownHandler: null,

  openSequence: 0,
  submitSequence: 0,
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

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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

function cloneForm(form = {}) {
  return {
    ...DEFAULT_FORM,
    ...safeObject(form),
  };
}

function safeError(error = null, fallback = "No se pudo crear el usuario.") {
  return cleanText(
    error?.message ||
      error?.data?.message ||
      error?.payload?.message ||
      error?.response?.data?.message ||
      error?.response?.message ||
      error?.error ||
      fallback,
    fallback
  );
}

function getRoot() {
  if (!isBrowser()) return null;

  const current = document.getElementById(ROOT_ID);

  if (current) {
    state.root = current;
    return current;
  }

  return null;
}

function removeDuplicateRoots(keep = null) {
  if (!isBrowser()) return 0;

  let removed = 0;

  for (const node of document.querySelectorAll(`#${ROOT_ID}`)) {
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

function setBodyLock(open = false) {
  if (!isBrowser()) return false;

  try {
    document.body.classList.toggle("modal-open", open);
    document.body.classList.toggle("usuarios-modal-open", open);
    document.body.classList.toggle("usuarios-create-modal-open", open);
    return true;
  } catch {
    return false;
  }
}

function emitEvent(name = "", payload = {}) {
  const eventName = cleanText(name, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(eventName, payload);
      emitted = true;
    }
  } catch {
    // fallback debajo
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      emitted = true;
    }
  } catch {
    // noop
  }

  return emitted;
}

function emitMany(events = [], payload = {}) {
  for (const eventName of events) {
    emitEvent(eventName, payload);
  }
}

function showToast(message = "", type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ];

  for (const toast of candidates) {
    try {
      if (isFunction(toast?.[type])) {
        toast[type](text);
        return true;
      }

      if (isFunction(toast?.show)) {
        toast.show(text, type);
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

function validateForm(form = {}) {
  const current = cloneForm(form);
  const errors = {};

  const name = cleanText(current.name, "");
  const email = cleanText(current.email, "").toLowerCase();
  const username = cleanText(current.username, "").toLowerCase();
  const phone = cleanText(current.phone, "");
  const role = normalizeKey(current.role || "user");
  const status = normalizeKey(current.status || "active");
  const password = String(current.password || "");
  const confirmPassword = String(current.confirmPassword || "");

  if (name.length < 2) {
    errors.name = "Indica un nombre válido.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Indica un email válido.";
  }

  if (username && !/^[a-z0-9._-]{3,80}$/i.test(username)) {
    errors.username =
      "El usuario debe tener al menos 3 caracteres válidos.";
  }

  if (password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  if (!["admin", "user"].includes(role)) {
    errors.role = "Selecciona un rol válido.";
  }

  if (!["active", "pending", "blocked"].includes(status)) {
    errors.status = "Selecciona un estado válido.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: {
      ...current,
      name,
      email,
      username,
      phone,
      role,
      status,
      password,
      confirmPassword,
    },
  };
}

function buildCreatePayload(form = {}) {
  const current = cloneForm(form);

  const name = cleanText(current.name, "");
  const email = cleanText(current.email, "").toLowerCase();
  const username =
    cleanText(current.username, "").toLowerCase() ||
    email.split("@")[0] ||
    "";

  const phone = cleanText(current.phone, "");
  const role = normalizeKey(current.role || "user") || "user";
  const status = normalizeKey(current.status || "active") || "active";
  const active = status === "active";

  return {
    name,
    nombre: name,
    displayName: name,
    fullName: name,

    email,
    emailLower: email,

    username,
    userName: username,
    usernameLower: username.toLowerCase(),

    phone,
    telefono: phone,
    mobile: phone,

    role,
    rol: role,

    status,
    estado: status,
    active,
    enabled: active,
    isActive: active,

    password: String(current.password || ""),

    source: "admin_panel",
    origen: "admin_panel",
    createdFrom: "usuarios_create_admin",
  };
}

/* =========================================================
   TEMPLATE
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
      >

      ${error ? `<span class="usr-create-error">${escapeHtml(error)}</span>` : ""}
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
} = {}) {
  return `
    <label class="usr-create-field">
      <span class="usr-create-label">${escapeHtml(label)}</span>

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
                ${String(option.value) === String(value) ? "selected" : ""}
              >
                ${escapeHtml(option.label)}
              </option>
            `
          )
          .join("")}
      </select>

      ${error ? `<span class="usr-create-error">${escapeHtml(error)}</span>` : ""}
    </label>
  `;
}

function renderAlert() {
  if (!state.error) return "";

  return `
    <div class="usr-create-alert is-error" role="alert">
      <strong>No se pudo crear el usuario</strong>
      <span>${escapeHtml(state.error)}</span>
    </div>
  `;
}

function renderLoadingOverlay() {
  if (!state.submitting) return "";

  return `
    <div class="usr-create-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="usr-create-loading-card">
        <span class="usr-create-loading-spinner" aria-hidden="true"></span>
        <strong>Creando usuario...</strong>
      </div>
    </div>
  `;
}

function renderModalHtml() {
  const form = cloneForm(state.form);
  const errors = safeObject(state.errors);
  const disabled = state.submitting;

  return `
    <section
      id="${ROOT_ID}"
      class="usuarios-create-modal-host is-open"
      data-usuarios-create-root="true"
      data-version="${attr(USUARIOS_CREATE_MODAL_VERSION)}"
    >
      <div
        class="usr-create-overlay"
        data-usr-create-action="overlay"
        aria-hidden="false"
      >
        <div
          id="${PANEL_ID}"
          class="usr-create-panel${state.submitting ? " is-submitting" : ""}"
          data-usuarios-create-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usuarios-create-title"
          tabindex="-1"
        >
          ${renderLoadingOverlay()}

          <header class="usr-create-header">
            <div class="usr-create-header-copy">
              <div class="usr-create-header-text">
                <h2 id="usuarios-create-title">Crear usuario</h2>
                <p>Registra un nuevo acceso en Onion Support.</p>
              </div>
            </div>

            <button
              type="button"
              class="usr-create-close"
              data-usr-create-action="close"
              aria-label="Cerrar"
              ${disabled ? "disabled" : ""}
            >
              ×
            </button>
          </header>

          <div class="usr-create-body">
            ${renderAlert()}

            <form
              id="${FORM_ID}"
              class="usr-create-form"
              data-usuarios-create-form="true"
              novalidate
            >
              <section class="usr-create-main">
                <div class="usr-create-inline-grid">
                  ${renderField({
                    label: "Nombre completo",
                    name: "name",
                    value: form.name,
                    placeholder: "Nombre y apellidos",
                    autocomplete: "name",
                    required: true,
                    error: errors.name,
                    disabled,
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
                  })}
                </div>

                <div class="usr-create-inline-grid usr-create-inline-grid--3">
                  ${renderField({
                    label: "Usuario",
                    name: "username",
                    value: form.username,
                    placeholder: "usuario",
                    autocomplete: "username",
                    error: errors.username,
                    disabled,
                  })}

                  ${renderSelect({
                    label: "Rol",
                    name: "role",
                    value: form.role,
                    error: errors.role,
                    disabled,
                    options: [
                      { value: "user", label: "Usuario" },
                      { value: "admin", label: "Administrador" },
                    ],
                  })}

                  ${renderSelect({
                    label: "Estado",
                    name: "status",
                    value: form.status,
                    error: errors.status,
                    disabled,
                    options: [
                      { value: "active", label: "Activo" },
                      { value: "pending", label: "Pendiente" },
                      { value: "blocked", label: "Bloqueado" },
                    ],
                  })}
                </div>

                <div class="usr-create-inline-grid">
                  ${renderField({
                    label: "Teléfono",
                    name: "phone",
                    type: "tel",
                    value: form.phone,
                    placeholder: "+34 600 000 000",
                    autocomplete: "tel",
                    disabled,
                  })}

                  <div aria-hidden="true"></div>
                </div>

                <div class="usr-create-inline-grid">
                  ${renderField({
                    label: "Contraseña",
                    name: "password",
                    type: "password",
                    value: form.password,
                    placeholder: "Mínimo 8 caracteres",
                    autocomplete: "new-password",
                    required: true,
                    error: errors.password,
                    disabled,
                  })}

                  ${renderField({
                    label: "Repetir contraseña",
                    name: "confirmPassword",
                    type: "password",
                    value: form.confirmPassword,
                    placeholder: "Repite la contraseña",
                    autocomplete: "new-password",
                    required: true,
                    error: errors.confirmPassword,
                    disabled,
                  })}
                </div>
              </section>

              <footer class="usr-create-actions">
                <button
                  type="submit"
                  class="usr-create-submit"
                  data-usr-create-action="submit"
                  ${disabled ? "disabled" : ""}
                >
                  ${
                    state.submitting
                      ? `
                        <span class="usr-create-submit-inner">
                          <span class="usr-create-spinner" aria-hidden="true"></span>
                          Creando...
                        </span>
                      `
                      : "Crear usuario"
                  }
                </button>
              </footer>
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   DOM / BINDINGS
========================================================= */

function findField(name = "") {
  return state.root?.querySelector?.(
    `[data-usr-create-field="${CSS.escape(name)}"]`
  );
}

function captureFocus() {
  if (!isBrowser()) return null;

  const active = document.activeElement;
  const fieldName = active?.getAttribute?.("data-usr-create-field") || "";

  return {
    fieldName,
    selectionStart:
      typeof active?.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd:
      typeof active?.selectionEnd === "number" ? active.selectionEnd : null,
  };
}

function restoreFocus(snapshot = null) {
  const fieldName = cleanText(snapshot?.fieldName, "");

  if (fieldName) {
    const field = findField(fieldName);

    try {
      field?.focus?.({ preventScroll: true });

      if (
        isFunction(field?.setSelectionRange) &&
        Number.isInteger(snapshot?.selectionStart) &&
        Number.isInteger(snapshot?.selectionEnd)
      ) {
        field.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd
        );
      }

      return true;
    } catch {
      // fallback debajo
    }
  }

  try {
    state.panel?.focus?.({ preventScroll: true });
    return true;
  } catch {
    return false;
  }
}

function render({ preserveFocus = true } = {}) {
  if (!isBrowser() || !state.isOpen) return false;

  const focusSnapshot = preserveFocus ? captureFocus() : null;
  const current = getRoot();

  const template = document.createElement("template");
  template.innerHTML = renderModalHtml().trim();

  const nextRoot = template.content.firstElementChild;
  if (!nextRoot) return false;

  if (current?.parentNode) {
    current.replaceWith(nextRoot);
  } else {
    document.body.appendChild(nextRoot);
  }

  state.root = nextRoot;
  state.panel = nextRoot.querySelector("[data-usuarios-create-panel='true']");

  removeDuplicateRoots(nextRoot);
  bind();

  if (focusSnapshot) {
    restoreFocus(focusSnapshot);
  }

  return true;
}

function bind() {
  const root = state.root;
  if (!root) return false;

  unbind();

  state.clickHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const actionNode = target.closest("[data-usr-create-action]");
    const action = normalizeKey(
      actionNode?.getAttribute?.("data-usr-create-action") || ""
    );

    if (action === "close") {
      event.preventDefault();
      close();
      return;
    }

    if (action === "overlay" && target === actionNode) {
      close();
    }
  };

  state.inputHandler = (event) => {
    const target = event.target;

    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }

    const name = cleanText(
      target.getAttribute("data-usr-create-field") || target.name,
      ""
    );

    if (!name || !(name in state.form)) return;

    state.form[name] = target.value;

    if (state.errors[name]) {
      delete state.errors[name];
      target.classList.remove("is-error");
      target
        .closest(".usr-create-field")
        ?.querySelector(".usr-create-error")
        ?.remove();
    }

    if (state.error) {
      state.error = "";
      state.root?.querySelector(".usr-create-alert")?.remove();
    }
  };

  state.submitHandler = (event) => {
    event.preventDefault();
    void submit();
  };

  state.keydownHandler = (event) => {
    if (event.key === "Escape" && state.isOpen && !state.submitting) {
      event.preventDefault();
      close();
    }
  };

  root.addEventListener("click", state.clickHandler);
  root.addEventListener("input", state.inputHandler);
  root.addEventListener("change", state.inputHandler);

  const form = root.querySelector("[data-usuarios-create-form='true']");
  form?.addEventListener("submit", state.submitHandler);

  window.addEventListener("keydown", state.keydownHandler);
  return true;
}

function unbind() {
  const root = state.root;

  try {
    if (root && state.clickHandler) {
      root.removeEventListener("click", state.clickHandler);
    }

    if (root && state.inputHandler) {
      root.removeEventListener("input", state.inputHandler);
      root.removeEventListener("change", state.inputHandler);
    }

    const form = root?.querySelector?.(
      "[data-usuarios-create-form='true']"
    );

    if (form && state.submitHandler) {
      form.removeEventListener("submit", state.submitHandler);
    }

    if (isBrowser() && state.keydownHandler) {
      window.removeEventListener("keydown", state.keydownHandler);
    }
  } catch {
    // noop
  }

  state.clickHandler = null;
  state.inputHandler = null;
  state.submitHandler = null;
  state.keydownHandler = null;

  return true;
}

/* =========================================================
   API
========================================================= */

async function createUser(payload = {}) {
  const module = await import("./usuarios.api.js");

  const create =
    module?.createUsuario ||
    module?.createUsuarioRequest ||
    module?.default?.createUsuario ||
    module?.default?.createUsuarioRequest;

  if (!isFunction(create)) {
    throw new Error("USUARIOS_CREATE_API_UNAVAILABLE");
  }

  return create(payload);
}

/* =========================================================
   PUBLIC METHODS
========================================================= */

export async function open(options = {}) {
  if (!isBrowser()) return false;

  state.openSequence += 1;

  const current = getRoot();

  if (state.isOpen && current?.isConnected) {
    state.panel?.focus?.({ preventScroll: true });
    return true;
  }

  removeDuplicateRoots();

  state.isOpen = true;
  state.submitting = false;
  state.error = "";
  state.errors = {};
  state.form = cloneForm(options?.form || DEFAULT_FORM);
  state.lastActiveElement = document.activeElement;

  setBodyLock(true);
  render({ preserveFocus: false });

  try {
    state.panel?.focus?.({ preventScroll: true });
  } catch {
    // noop
  }

  emitEvent("usuarios:create:opened", {
    source: "usuarios.create.modal",
    version: USUARIOS_CREATE_MODAL_VERSION,
  });

  return true;
}

export const mount = open;
export const init = open;

export function close() {
  if (!isBrowser()) return true;

  state.openSequence += 1;
  state.submitSequence += 1;

  unbind();

  const root = getRoot();

  try {
    root?.remove?.();
  } catch {
    // noop
  }

  removeDuplicateRoots();

  state.root = null;
  state.panel = null;
  state.isOpen = false;
  state.submitting = false;
  state.error = "";
  state.errors = {};

  setBodyLock(false);

  try {
    if (state.lastActiveElement?.isConnected) {
      state.lastActiveElement.focus({ preventScroll: true });
    }
  } catch {
    // noop
  }

  emitMany(CREATE_CLOSE_EVENTS, {
    source: "usuarios.create.modal",
    version: USUARIOS_CREATE_MODAL_VERSION,
  });

  return true;
}

export const destroy = close;
export const unmount = close;

export function reset() {
  state.form = { ...DEFAULT_FORM };
  state.errors = {};
  state.error = "";
  state.submitting = false;

  if (state.isOpen) {
    render({ preserveFocus: false });
  }

  return true;
}

export async function submit(payload = null) {
  if (state.submitting) return null;

  if (isObject(payload)) {
    state.form = {
      ...state.form,
      ...payload,
    };
  }

  const validation = validateForm(state.form);

  state.form = validation.form;
  state.errors = validation.errors;
  state.error = "";

  if (!validation.valid) {
    render({ preserveFocus: false });

    const firstErrorName = Object.keys(validation.errors)[0];
    findField(firstErrorName)?.focus?.({ preventScroll: true });

    return null;
  }

  const submitId = ++state.submitSequence;
  state.submitting = true;
  render();

  try {
    const createPayload = buildCreatePayload(validation.form);
    const created = await createUser(createPayload);

    if (submitId !== state.submitSequence) {
      return null;
    }

    showToast("Usuario creado correctamente.", "success");

    emitMany(CREATE_SUCCESS_EVENTS, {
      source: "usuarios.create.modal",
      version: USUARIOS_CREATE_MODAL_VERSION,
      user: created,
      usuario: created,
      item: created,
      detail: created,
    });

    close();
    return created;
  } catch (error) {
    if (submitId !== state.submitSequence) {
      return null;
    }

    state.error = safeError(error);
    state.submitting = false;

    render();
    showToast(state.error, "error");

    return null;
  }
}

export const submitCreate = submit;
export const save = submit;

export function getState() {
  return {
    version: USUARIOS_CREATE_MODAL_VERSION,
    isOpen: state.isOpen,
    submitting: state.submitting,
    error: state.error,
    errors: { ...state.errors },
    form: {
      ...state.form,
      password: state.form.password ? "***" : "",
      confirmPassword: state.form.confirmPassword ? "***" : "",
    },
  };
}

export const renderCreateModal = render;

const UsuariosCreateModal = Object.freeze({
  version: USUARIOS_CREATE_MODAL_VERSION,

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
});

export default UsuariosCreateModal;

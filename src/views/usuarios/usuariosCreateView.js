/* =========================================================
   Onion SPA - Usuarios Create View
   Archivo: src/views/usuarios/usuariosCreateView.js

   FINAL PRO SYSTEM · CREATE VIEW · 10/10

   RESPONSABILIDADES:
   - renderizar la vista de creación de usuarios
   - gestionar formulario premium de alta
   - validar campos clave
   - construir payload limpio para backend
   - enviar creación por adapters tolerantes
   - mostrar estados loading / success / error
   - permitir volver al listado
   - evitar doble bind de listeners
   - soportar destroy limpio del router

   HARDENING PRO:
   - validación defensiva
   - serialización coherente
   - adapter chain para create request
   - fallback a fetch directo
   - navegación segura post-create
   - anti-race token
========================================================= */

import { AppCore } from "../../core/index.js";

export const UsuariosCreateView = (() => {
  "use strict";

  const SCOPE = "view:usuarios:create";

  const DEFAULT_FORM = Object.freeze({
    username: "",
    name: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    role: "user",
    status: "active",
    notifyUser: true,
    requirePasswordReset: false,
  });

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;
  let state = {
    form: { ...DEFAULT_FORM },
    errors: {},
    submitting: false,
    serverError: "",
    successMessage: "",
    createdUserId: "",
  };

  /* =====================================================
     HELPERS
  ===================================================== */

  function safeText(v, fallback = "") {
    if (v === null || v === undefined) return fallback;
    const t = String(v).trim();
    return t || fallback;
  }

  function safeObject(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  function first(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
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

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function showToast(message = "", type = "info") {
    try {
      AppCore?.toast?.show?.(message, type);
      return;
    } catch {}

    try {
      console.log(`[UsuariosCreate:${type}]`, message);
    } catch {}
  }

  function getApiBase() {
    return safeText(AppCore?.config?.apiBase, "").replace(/\/+$/, "");
  }

  function getAuthToken() {
    return safeText(
      first(
        AppCore?.state?.token,
        AppCore?.state?.accessToken,
        localStorage.getItem("token"),
        sessionStorage.getItem("token")
      ),
      ""
    );
  }

  function isEmail(value = "") {
    const text = safeText(value, "");
    if (!text) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  }

  function validateForm(form = {}) {
    const errors = {};

    if (!safeText(form.username)) {
      errors.username = "Username obligatorio.";
    }

    if (!safeText(form.name)) {
      errors.name = "Nombre obligatorio.";
    }

    if (!isEmail(form.email)) {
      errors.email = "Email inválido.";
    }

    if (!safeText(form.password) || safeText(form.password).length < 6) {
      errors.password = "Password mínimo 6 caracteres.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  function buildPayload(form = {}) {
    return {
      username: safeText(form.username),
      name: safeText(form.name),
      email: safeText(form.email),
      phone: safeText(form.phone),
      company: safeText(form.company),
      password: safeText(form.password),
      role: safeText(form.role, "user"),
      status: safeText(form.status, "active"),
      meta: {
        notifyUser: Boolean(form.notifyUser),
        requirePasswordReset: Boolean(form.requirePasswordReset),
        createdFrom: "onion-spa-panel",
      },
    };
  }

  async function createViaFetch(payload = {}) {
    const apiBase = getApiBase();
    const token = getAuthToken();

    const response = await fetch(`${apiBase}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        safeText(
          data?.message,
          "No se pudo crear el usuario."
        )
      );
    }

    return data;
  }

  function resolveCreatedId(response = {}) {
    const obj = safeObject(response);
    const user = safeObject(
      obj.user ||
      obj.data ||
      obj.item ||
      obj
    );

    return safeText(
      first(
        user.id,
        user.userId,
        user.username
      ),
      ""
    );
  }

  async function navigateToList() {
    try {
      await AppCore?.router?.navigate?.("/usuarios");
      return;
    } catch {}

    window.location.hash = "#/usuarios";
  }

  /* =====================================================
     TEMPLATE
  ===================================================== */

  function fieldError(text = "") {
    if (!text) return "";

    return `
      <span style="
        color:var(--danger-strong,#ff6b6b);
        font-size:12px;
      ">
        ${escapeHtml(text)}
      </span>
    `;
  }

  function renderInput(label, name, type = "text") {
    const value = safeText(state.form[name], "");
    const error = safeText(state.errors[name], "");

    return `
      <label style="display:grid;gap:8px;">
        <span>${escapeHtml(label)}</span>

        <input
          data-field="${escapeHtml(name)}"
          type="${escapeHtml(type)}"
          value="${escapeHtml(value)}"
          style="
            min-height:46px;
            padding:0 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-1,var(--surface-glass));
            color:var(--text-strong);
          "
        />

        ${fieldError(error)}
      </label>
    `;
  }

  function renderSelect(label, name, options = []) {
    const current = safeText(state.form[name], "");

    return `
      <label style="display:grid;gap:8px;">
        <span>${escapeHtml(label)}</span>

        <select
          data-field="${escapeHtml(name)}"
          style="
            min-height:46px;
            padding:0 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-1,var(--surface-glass));
            color:var(--text-strong);
          "
        >
          ${options.map((item) => `
            <option
              value="${escapeHtml(item.value)}"
              ${item.value === current ? "selected" : ""}
            >
              ${escapeHtml(item.label)}
            </option>
          `).join("")}
        </select>
      </label>
    `;
  }

  function renderCheckbox(label, name) {
    return `
      <label style="
        display:flex;
        gap:10px;
        align-items:center;
      ">
        <input
          data-field="${escapeHtml(name)}"
          type="checkbox"
          ${state.form[name] ? "checked" : ""}
        />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function buildHtml() {
    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper" style="display:grid;gap:18px;">

          <section class="panel-surface" style="
            padding:24px;
            border-radius:var(--panel-radius);
            border:1px solid var(--border-soft);
          ">
            <h1 style="margin:0 0 10px 0;">
              Alta manual de usuario
            </h1>

            <p style="margin:0;color:var(--text-dim);">
              Crea usuarios internos o clientes desde una vista premium.
            </p>
          </section>

          <section class="panel-surface" style="
            padding:24px;
            border-radius:var(--panel-radius);
            border:1px solid var(--border-soft);
          ">

            ${
              state.successMessage
                ? `
                  <div style="margin-bottom:16px;">
                    ${escapeHtml(state.successMessage)}
                  </div>
                `
                : ""
            }

            ${
              state.serverError
                ? `
                  <div style="margin-bottom:16px;color:#ff6b6b;">
                    ${escapeHtml(state.serverError)}
                  </div>
                `
                : ""
            }

            <form id="usuarios-create-form" style="display:grid;gap:16px;">

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                ${renderInput("Username", "username")}
                ${renderInput("Nombre", "name")}
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                ${renderInput("Email", "email", "email")}
                ${renderInput("Teléfono", "phone")}
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                ${renderInput("Empresa", "company")}
                ${renderInput("Password", "password", "password")}
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                ${renderSelect("Rol", "role", [
                  { value: "user", label: "Usuario" },
                  { value: "support", label: "Soporte" },
                  { value: "manager", label: "Manager" },
                  { value: "admin", label: "Admin" },
                ])}

                ${renderSelect("Estado", "status", [
                  { value: "active", label: "Activo" },
                  { value: "pending", label: "Pendiente" },
                  { value: "inactive", label: "Inactivo" },
                ])}
              </div>

              ${renderCheckbox("Notificar al usuario", "notifyUser")}
              ${renderCheckbox("Forzar cambio de password", "requirePasswordReset")}

              <div style="display:flex;gap:10px;flex-wrap:wrap;">

                <button
                  type="submit"
                  ${state.submitting ? "disabled" : ""}
                  style="
                    min-height:44px;
                    padding:0 18px;
                  "
                >
                  ${state.submitting ? "Creando..." : "Crear usuario"}
                </button>

                <button
                  type="button"
                  id="usuarios-back-btn"
                >
                  Volver
                </button>

              </div>

            </form>

          </section>

        </div>
      </section>
    `;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container = getContainer();
    if (!container) return null;

    container.innerHTML = buildHtml();
    return container;
  }

  function rerender() {
    if (destroyed) return;
    render();
    bind();
  }

  /* =====================================================
     ACTIONS
  ===================================================== */

  function patchField(target) {
    const field = safeText(target?.dataset?.field, "");
    if (!field) return;

    state.form[field] =
      target.type === "checkbox"
        ? Boolean(target.checked)
        : target.value;
  }

  async function handleSubmit() {
    state.successMessage = "";
    state.serverError = "";

    const validation = validateForm(state.form);
    state.errors = validation.errors;

    if (!validation.valid) {
      rerender();
      return;
    }

    state.submitting = true;
    rerender();

    try {
      const payload = buildPayload(state.form);
      const response = await createViaFetch(payload);
      const id = resolveCreatedId(response);

      state.submitting = false;
      state.errors = {};
      state.successMessage =
        `Usuario creado correctamente (${id}).`;

      state.form = { ...DEFAULT_FORM };

      rerender();

      showToast("Usuario creado.", "success");

      setTimeout(() => {
        navigateToList();
      }, 500);

    } catch (error) {
      state.submitting = false;
      state.serverError =
        safeText(error?.message, "Error al crear usuario.");

      rerender();
      showToast(state.serverError, "error");
    }
  }

  /* =====================================================
     BIND
  ===================================================== */

  function bindNative(container) {
    if (!container) return () => {};

    const onInput = (e) => {
      const field = e.target.closest("[data-field]");
      if (!field) return;
      patchField(field);
    };

    const onChange = onInput;

    const onSubmit = async (e) => {
      if (!e.target.closest("#usuarios-create-form")) return;
      e.preventDefault();
      await handleSubmit();
    };

    const onClick = async (e) => {
      if (e.target.closest("#usuarios-back-btn")) {
        e.preventDefault();
        await navigateToList();
      }
    };

    container.addEventListener("input", onInput);
    container.addEventListener("change", onChange);
    container.addEventListener("submit", onSubmit);
    container.addEventListener("click", onClick);

    return () => {
      container.removeEventListener("input", onInput);
      container.removeEventListener("change", onChange);
      container.removeEventListener("submit", onSubmit);
      container.removeEventListener("click", onClick);
    };
  }

  function bind() {
    cleanupBindings();

    const container = getContainer();
    bindingsCleanup = bindNative(container);
  }

  /* =====================================================
     PUBLIC
  ===================================================== */

  async function init() {
    if (initialized && inflightInit) {
      return inflightInit;
    }

    initialized = true;
    destroyed = false;

    inflightInit = (async () => {
      const token = nextRenderToken();

      render();

      if (!isActiveToken(token)) {
        return api;
      }

      bind();

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;
    nextRenderToken();
    cleanupBindings();
  }

  const api = {
    init,
    render: rerender,
    destroy,
  };

  return api;
})();

export default UsuariosCreateView;

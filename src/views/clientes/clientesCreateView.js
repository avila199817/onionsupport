/* =========================================================
   Onion SPA - Clientes Create View
   Archivo: src/views/clientes/clientesCreateView.js

   FINAL PRO SYSTEM · CREATE VIEW · 10/10

   RESPONSABILIDADES:
   - renderizar la vista de creación de clientes
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

import { clientesState } from "./clientes.state.js";

export const ClientesCreateView = (() => {
  "use strict";

  const SCOPE = "view:clientes:create";

  const DEFAULT_FORM = Object.freeze({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    status: "active",
    tier: "standard",
    source: "panel",
    assignedTo: "",
    notes: "",
    tags: "",
    notifyClient: true,
    internalOnly: false,
  });

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let bindingsCleanup = null;
  let renderToken = 0;

  /* =====================================================
     CORE HELPERS
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[ClientesCreateView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[ClientesCreateView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    try {
      AppCore?.events?.emit?.(event, payload);
    } catch {}
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

  function getInitialForm() {
    const draft = safeObject(clientesState?.createDraft);

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

  function ensureCreateState() {
    if (!clientesState.createView) {
      clientesState.createView = {};
    }

    const state = clientesState.createView;

    state.form = safeObject(state.form);
    state.errors = safeObject(state.errors);
    state.submitting = Boolean(state.submitting);
    state.serverError = safeText(state.serverError, "");
    state.createdClientId = safeText(state.createdClientId, "");
    state.successMessage = safeText(state.successMessage, "");

    if (!Object.keys(state.form).length) {
      state.form = getInitialForm();
    }

    return state;
  }

  function getCreateState() {
    return ensureCreateState();
  }

  function persistDraft() {
    const state = getCreateState();
    clientesState.createDraft = { ...state.form };
  }

  function clearDraft() {
    clientesState.createDraft = { ...DEFAULT_FORM };
  }

  function setFormPatch(patch = {}) {
    const state = getCreateState();
    state.form = {
      ...state.form,
      ...patch,
    };
    persistDraft();
    return state.form;
  }

  function setErrors(errors = {}) {
    const state = getCreateState();
    state.errors = { ...errors };
    return state.errors;
  }

  function setSubmitting(value = false) {
    const state = getCreateState();
    state.submitting = Boolean(value);
    return state.submitting;
  }

  function setServerError(message = "") {
    const state = getCreateState();
    state.serverError = safeText(message, "");
    return state.serverError;
  }

  function setSuccess({
    clientId = "",
    message = "",
  } = {}) {
    const state = getCreateState();
    state.createdClientId = safeText(clientId, "");
    state.successMessage = safeText(message, "");
    return state;
  }

  function resetSuccess() {
    const state = getCreateState();
    state.createdClientId = "";
    state.successMessage = "";
    return state;
  }

  function resetForm() {
    const state = getCreateState();
    state.form = { ...DEFAULT_FORM };
    state.errors = {};
    state.serverError = "";
    state.createdClientId = "";
    state.successMessage = "";
    clearDraft();
    return state.form;
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
      return "No se pudo crear el cliente.";
    }

    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo crear el cliente."
      ),
      "No se pudo crear el cliente."
    );
  }

  function buildPayload(form = {}) {
    const current = safeObject(form);

    const tags = safeText(current.tags, "")
      .split(",")
      .map((tag) => slugifyTag(tag))
      .filter(Boolean);

    const payload = {
      name: normalizeWhitespace(current.name),
      companyName: normalizeWhitespace(current.companyName),
      email: safeText(current.email, ""),
      phone: normalizeWhitespace(current.phone),
      status: safeText(current.status, "active").toLowerCase(),
      tier: safeText(current.tier, "standard").toLowerCase(),
      source: safeText(current.source, "panel"),
      assignedTo: safeText(current.assignedTo, ""),
      notes: normalizeWhitespace(current.notes),
      tags,
      meta: {
        notifyClient: Boolean(current.notifyClient),
        internalOnly: Boolean(current.internalOnly),
        createdFrom: "onion-spa-panel",
      },
    };

    if (!payload.companyName) {
      delete payload.companyName;
    }

    if (!payload.email) {
      delete payload.email;
    }

    if (!payload.phone) {
      delete payload.phone;
    }

    if (!payload.assignedTo) {
      delete payload.assignedTo;
    }

    if (!payload.notes) {
      delete payload.notes;
    }

    if (!payload.tags.length) {
      delete payload.tags;
    }

    return payload;
  }

  function validateForm(form = {}) {
    const current = safeObject(form);
    const errors = {};

    if (!safeText(current.name, "")) {
      errors.name = "El nombre del cliente es obligatorio.";
    } else if (safeText(current.name, "").length < 2) {
      errors.name = "El nombre debe tener al menos 2 caracteres.";
    }

    if (!safeText(current.companyName, "") && !safeText(current.name, "")) {
      errors.companyName = "Debes indicar nombre o empresa.";
    }

    if (!safeText(current.email, "") && !safeText(current.phone, "")) {
      errors.email = "Debes indicar email o teléfono.";
      errors.phone = "Debes indicar email o teléfono.";
    }

    if (!isEmail(current.email)) {
      errors.email = "El email no tiene un formato válido.";
    }

    const validStatuses = ["active", "pending", "blocked", "disabled"];
    if (!validStatuses.includes(safeText(current.status, "active").toLowerCase())) {
      errors.status = "Estado inválido.";
    }

    const validTiers = ["standard", "vip", "enterprise"];
    if (!validTiers.includes(safeText(current.tier, "standard").toLowerCase())) {
      errors.tier = "Tier inválido.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /* =====================================================
     CREATE ADAPTERS
  ===================================================== */

  async function createViaAppCoreRequest(payload = {}) {
    if (typeof AppCore?.request !== "function") {
      throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
    }

    return AppCore.request("/api/clientes", {
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
      return Http.post("/api/clientes", payload);
    }

    if (typeof Http.request === "function") {
      return Http.request("/api/clientes", {
        method: "POST",
        body: payload,
      });
    }

    throw new Error("HTTP_POST_UNAVAILABLE");
  }

  async function createViaFetch(payload = {}) {
    const apiBase = getApiBase();
    const token = getAuthToken();

    const url = `${apiBase || ""}/api/clientes`;

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
            `HTTP ${response.status} al crear cliente.`
          ),
          "No se pudo crear el cliente."
        )
      );
      error.response = data;
      throw error;
    }

    return data;
  }

  function pickCreatedClient(response = null) {
    const obj = safeObject(response);

    return (
      obj.client ||
      obj.cliente ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload ||
      obj
    );
  }

  function resolveCreatedClientId(response = null) {
    const client = safeObject(pickCreatedClient(response));

    return safeText(
      first(
        client.clientId,
        client.clienteId,
        client.userId,
        client.id,
        client.code
      ),
      ""
    );
  }

  async function createClienteRequest(payload = {}) {
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

  /* =====================================================
     NAVIGATION
  ===================================================== */

  async function navigateToClientesList() {
    try {
      if (AppCore?.router?.navigate) {
        await AppCore.router.navigate("/clientes");
        return true;
      }
    } catch {}

    try {
      if (AppCore?.Router?.navigate) {
        await AppCore.Router.navigate("/clientes");
        return true;
      }
    } catch {}

    try {
      window.location.hash = "#/clientes";
      return true;
    } catch {}

    return false;
  }

  /* =====================================================
     TEMPLATE
  ===================================================== */

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

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function renderHero() {
    return `
      <section
        style="
          position:relative;
          overflow:hidden;
          border-radius:calc(var(--panel-radius) + 6px);
          border:1px solid var(--border-soft);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, var(--surface-glass)), var(--surface-1, var(--surface-glass)));
          box-shadow:var(--shadow-md);
        "
      >
        <div
          style="
            display:grid;
            gap:18px;
            padding:clamp(20px, 3vw, 30px);
          "
        >
          <div
            style="
              display:flex;
              align-items:flex-start;
              justify-content:space-between;
              gap:16px;
              flex-wrap:wrap;
            "
          >
            <div style="display:grid; gap:10px;">
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
                Nuevo cliente
              </span>

              <div style="display:grid; gap:8px;">
                <h1
                  style="
                    margin:0;
                    font-size:clamp(30px, 5vw, 46px);
                    line-height:.98;
                    letter-spacing:-.05em;
                    color:var(--text-strong);
                  "
                >
                  Alta manual de cliente
                </h1>

                <p
                  style="
                    margin:0;
                    max-width:860px;
                    color:var(--text-dim);
                    font-size:clamp(14px, 2vw, 16px);
                    line-height:1.6;
                  "
                >
                  Registra un cliente con información comercial, contacto, estado y
                  segmentación inicial desde un formulario premium preparado para backend real.
                </p>
              </div>
            </div>

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                align-items:center;
              "
            >
              <button
                id="clientes-create-back-btn"
                type="button"
                style="
                  min-height:42px;
                  padding:0 14px;
                  border-radius:var(--btn-radius);
                  border:1px solid var(--btn-secondary-border, var(--border-soft));
                  background:var(--btn-secondary-bg, var(--surface-glass));
                  color:var(--btn-secondary-text, var(--text-soft));
                  font-weight:var(--weight-bold, 700);
                  cursor:pointer;
                "
              >
                Volver al listado
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderForm() {
    const state = getCreateState();
    const form = safeObject(state.form);
    const errors = safeObject(state.errors);
    const submitting = Boolean(state.submitting);
    const serverError = safeText(state.serverError, "");
    const successMessage = safeText(state.successMessage, "");
    const createdClientId = safeText(state.createdClientId, "");

    return `
      <section
        class="panel-surface"
        style="
          overflow:hidden;
          border-radius:var(--panel-radius);
          border:1px solid var(--border-soft);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 60%, transparent), transparent),
            var(--surface-1, var(--surface-glass));
          box-shadow:var(--shadow-sm);
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:14px;
            padding:18px 20px;
            border-bottom:1px solid var(--border-soft);
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:4px;">
            <strong
              style="
                color:var(--text-strong);
                font-size:var(--font-base);
                letter-spacing:-.02em;
              "
            >
              Formulario de creación
            </strong>

            <span
              style="
                color:var(--text-dim);
                font-size:var(--font-sm);
              "
            >
              Completa los datos mínimos para registrar un cliente en el sistema.
            </span>
          </div>

          <div
            style="
              display:flex;
              align-items:center;
              gap:8px;
              flex-wrap:wrap;
            "
          >
            <span
              style="
                display:inline-flex;
                align-items:center;
                min-height:30px;
                padding:0 10px;
                border-radius:999px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-dim);
                font-size:12px;
                font-weight:var(--weight-bold, 700);
                letter-spacing:.04em;
                text-transform:uppercase;
              "
            >
              Create view
            </span>
          </div>
        </div>

        <div style="padding:20px;">
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
                    createdClientId
                      ? `
                        <span style="color:var(--text-dim); font-size:13px;">
                          Cliente generado: ${escapeHtml(createdClientId)}
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
                    No se pudo crear el cliente
                  </strong>
                  <span style="color:var(--text-dim); font-size:13px; line-height:1.45;">
                    ${escapeHtml(serverError)}
                  </span>
                </div>
              `
              : ""
          }

          <form
            id="clientes-create-form"
            novalidate
            style="
              display:grid;
              gap:18px;
            "
          >
            <div
              style="
                display:grid;
                grid-template-columns:1.2fr 1fr 1fr;
                gap:16px;
              "
              class="clientes-create-grid-top"
            >
              ${renderInput({
                label: "Nombre contacto",
                name: "name",
                value: form.name,
                placeholder: "Ej. Cristian Ávila",
                required: true,
                error: errors.name,
                hint: "Nombre principal del contacto o responsable.",
                autocomplete: "name",
              })}

              ${renderInput({
                label: "Empresa",
                name: "companyName",
                value: form.companyName,
                placeholder: "Ej. Onion Tech SL",
                error: errors.companyName,
                hint: "Opcional si el cliente es particular.",
                autocomplete: "organization",
              })}

              ${renderSelect({
                label: "Estado inicial",
                name: "status",
                value: form.status,
                error: errors.status,
                options: [
                  { value: "active", label: "Activo" },
                  { value: "pending", label: "Pendiente" },
                  { value: "blocked", label: "Bloqueado" },
                  { value: "disabled", label: "Deshabilitado" },
                ],
              })}
            </div>

            <div
              style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:16px;
              "
              class="clientes-create-grid-contact"
            >
              ${renderInput({
                label: "Email",
                name: "email",
                value: form.email,
                type: "email",
                placeholder: "cliente@dominio.com",
                error: errors.email,
                autocomplete: "email",
              })}

              ${renderInput({
                label: "Teléfono",
                name: "phone",
                value: form.phone,
                type: "tel",
                placeholder: "+34 600 000 000",
                error: errors.phone,
                autocomplete: "tel",
              })}

              ${renderSelect({
                label: "Tier",
                name: "tier",
                value: form.tier,
                error: errors.tier,
                options: [
                  { value: "standard", label: "Standard" },
                  { value: "vip", label: "VIP" },
                  { value: "enterprise", label: "Enterprise" },
                ],
              })}
            </div>

            <div
              style="
                display:grid;
                grid-template-columns:1fr 1fr 1fr;
                gap:16px;
              "
              class="clientes-create-grid-meta"
            >
              ${renderInput({
                label: "Asignado a",
                name: "assignedTo",
                value: form.assignedTo,
                placeholder: "Comercial o account manager",
                hint: "Puede quedar vacío si aún no se asigna.",
              })}

              ${renderInput({
                label: "Origen",
                name: "source",
                value: form.source,
                placeholder: "panel, web, campaña, referido...",
              })}

              ${renderInput({
                label: "Tags",
                name: "tags",
                value: form.tags,
                placeholder: "vip, lead, b2b, francia",
                hint: "Separados por coma.",
              })}
            </div>

            ${renderTextarea({
              label: "Notas",
              name: "notes",
              value: form.notes,
              placeholder:
                "Añade contexto comercial, observaciones internas, preferencias del cliente o cualquier información útil para el seguimiento.",
              error: errors.notes,
              hint: "Las notas ayudan a ventas, soporte y gestión de cuenta.",
              rows: 7,
            })}

            <div
              style="
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:16px;
              "
              class="clientes-create-grid-flags"
            >
              ${renderCheckbox({
                label: "Notificar al cliente",
                name: "notifyClient",
                checked: Boolean(form.notifyClient),
                hint: "Marca esta opción si el backend debe tratar el alta como notificable al cliente.",
              })}

              ${renderCheckbox({
                label: "Solo uso interno",
                name: "internalOnly",
                checked: Boolean(form.internalOnly),
                hint: "Útil para leads internos o registros que aún no deben exponerse externamente.",
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
                  id="clientes-create-submit-btn"
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
                              animation:clientesCreateSpin .8s linear infinite;
                            "
                          ></span>
                          Creando...
                        </span>
                      `
                      : "Crear cliente"
                  }
                </button>

                <button
                  id="clientes-create-reset-btn"
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
                  id="clientes-create-save-draft-btn"
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

                <button
                  id="clientes-create-cancel-btn"
                  type="button"
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
              </div>
            </div>
          </form>
        </div>

        <style>
          @keyframes clientesCreateSpin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 1080px) {
            .clientes-create-grid-top,
            .clientes-create-grid-contact,
            .clientes-create-grid-meta {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 860px) {
            .clientes-create-grid-flags {
              grid-template-columns: 1fr !important;
            }
          }
        </style>
      </section>
    `;
  }

  function buildHtml() {
    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper" style="display:grid; gap:18px;">
          ${renderHero()}
          ${renderForm()}
        </div>
      </section>
    `;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No se encontró #view-container.");
      return null;
    }

    ensureCreateState();

    try {
      AppCore?.setDocumentTitle?.("Nuevo cliente");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =====================================================
     FORM HELPERS
  ===================================================== */

  function getFieldValue(target) {
    if (!target) return "";

    if (target.type === "checkbox") {
      return Boolean(target.checked);
    }

    return target.value;
  }

  function handleFieldChange(target) {
    const field = safeText(target?.dataset?.field, "");
    if (!field) return;

    setFormPatch({
      [field]: getFieldValue(target),
    });

    const state = getCreateState();
    if (state.errors[field]) {
      const nextErrors = { ...state.errors };
      delete nextErrors[field];
      setErrors(nextErrors);
    }

    if (state.serverError) {
      setServerError("");
    }

    if (state.successMessage || state.createdClientId) {
      resetSuccess();
    }
  }

  async function handleSubmit() {
    const state = getCreateState();
    const form = safeObject(state.form);

    resetSuccess();
    setServerError("");

    const validation = validateForm(form);
    setErrors(validation.errors);

    if (!validation.valid) {
      rerender();
      showToast("Revisa los campos obligatorios.", "warning");
      return false;
    }

    const payload = buildPayload(form);

    setSubmitting(true);
    rerender();

    safeEmit("clientes:create:submit", {
      payload,
    });

    try {
      const response = await createClienteRequest(payload);
      const createdClientId = resolveCreatedClientId(response);

      setSubmitting(false);
      setErrors({});
      setServerError("");
      setSuccess({
        clientId: createdClientId,
        message: "Cliente creado correctamente.",
      });

      clearDraft();

      showToast("Cliente creado correctamente.", "success");

      safeEmit("clientes:create:success", {
        clientId: createdClientId,
        response,
        payload,
      });

      rerender();

      setTimeout(() => {
        navigateToClientesList().catch(() => {});
      }, 450);

      return true;
    } catch (error) {
      const message = safeErrorMessage(error);

      setSubmitting(false);
      setServerError(message);

      safeEmit("clientes:create:error", {
        error,
        payload,
      });

      showToast(message, "error");
      rerender();

      return false;
    }
  }

  /* =====================================================
     BINDINGS
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

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
      const form = event.target.closest("#clientes-create-form");
      if (!form) return;

      event.preventDefault();
      await handleSubmit();
    };

    const onClick = async (event) => {
      const backBtn = event.target.closest("#clientes-create-back-btn");
      if (backBtn) {
        event.preventDefault();
        await navigateToClientesList();
        return;
      }

      const cancelBtn = event.target.closest("#clientes-create-cancel-btn");
      if (cancelBtn) {
        event.preventDefault();
        await navigateToClientesList();
        return;
      }

      const resetBtn = event.target.closest("#clientes-create-reset-btn");
      if (resetBtn) {
        event.preventDefault();
        resetForm();
        rerender();
        showToast("Formulario limpio.", "info");
        return;
      }

      const draftBtn = event.target.closest("#clientes-create-save-draft-btn");
      if (draftBtn) {
        event.preventDefault();
        persistDraft();
        showToast("Borrador guardado.", "success");
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
    const cleanups = [];

    cleanups.push(bindNativeActions(container));

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =====================================================
     PUBLIC
  ===================================================== */

  async function init() {
    if (initialized && inflightInit) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    inflightInit = (async () => {
      const token = nextRenderToken();

      safeLog("init");

      ensureCreateState();
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

  async function reload() {
    if (destroyed) return api;

    rerender();

    return api;
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderToken();
    cleanupBindings();

    safeLog("destroy");
  }

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    submit: handleSubmit,
    goBack: navigateToClientesList,
    resetForm,
    getState: getCreateState,
    getPayload: () => buildPayload(getCreateState().form),

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default ClientesCreateView;

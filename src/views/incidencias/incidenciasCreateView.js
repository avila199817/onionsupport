/* =========================================================
   Onion SPA - Incidencias Create View
   Archivo: src/views/incidencias/incidenciasCreateView.js

   FINAL PRO SYSTEM · CREATE VIEW · 10/10

   RESPONSABILIDADES:
   - renderizar la vista de creación de incidencias
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

import { incidenciasState } from "./incidencias.state.js";

export const IncidenciasCreateView = (() => {
  "use strict";

  const SCOPE = "view:incidencias:create";

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
      AppCore?.utils?.log?.("[IncidenciasCreateView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[IncidenciasCreateView]", ...args);
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

  function ensureCreateState() {
    if (!incidenciasState.createView) {
      incidenciasState.createView = {};
    }

    const state = incidenciasState.createView;

    state.form = safeObject(state.form);
    state.errors = safeObject(state.errors);
    state.submitting = Boolean(state.submitting);
    state.serverError = safeText(state.serverError, "");
    state.createdTicketId = safeText(state.createdTicketId, "");
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
    incidenciasState.createDraft = { ...state.form };
  }

  function clearDraft() {
    incidenciasState.createDraft = { ...DEFAULT_FORM };
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
    ticketId = "",
    message = "",
  } = {}) {
    const state = getCreateState();
    state.createdTicketId = safeText(ticketId, "");
    state.successMessage = safeText(message, "");
    return state;
  }

  function resetSuccess() {
    const state = getCreateState();
    state.createdTicketId = "";
    state.successMessage = "";
    return state;
  }

  function resetForm() {
    const state = getCreateState();
    state.form = { ...DEFAULT_FORM };
    state.errors = {};
    state.serverError = "";
    state.createdTicketId = "";
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

  /* =====================================================
     CREATE ADAPTERS
  ===================================================== */

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

  /* =====================================================
     NAVIGATION
  ===================================================== */

  async function navigateToIncidenciasList() {
    try {
      if (AppCore?.router?.navigate) {
        await AppCore.router.navigate("/incidencias");
        return true;
      }
    } catch {}

    try {
      if (AppCore?.Router?.navigate) {
        await AppCore.Router.navigate("/incidencias");
        return true;
      }
    } catch {}

    try {
      window.location.hash = "#/incidencias";
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
                Nueva incidencia
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
                  Alta manual de ticket
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
                  Registra una incidencia con contexto operativo, prioridad, cliente y
                  asignación inicial desde un formulario premium preparado para backend real.
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
                id="incidencias-create-back-btn"
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
    const createdTicketId = safeText(state.createdTicketId, "");

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
              Completa los datos mínimos para registrar una incidencia operativa.
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

                <button
                  id="incidencias-create-cancel-btn"
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
      AppCore?.setDocumentTitle?.("Nueva incidencia");
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

    if (state.successMessage || state.createdTicketId) {
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

    safeEmit("incidencias:create:submit", {
      payload,
    });

    try {
      const response = await createIncidenciaRequest(payload);
      const createdTicketId = resolveCreatedTicketId(response);

      setSubmitting(false);
      setErrors({});
      setServerError("");
      setSuccess({
        ticketId: createdTicketId,
        message: "Incidencia creada correctamente.",
      });

      clearDraft();

      showToast("Incidencia creada correctamente.", "success");

      safeEmit("incidencias:create:success", {
        ticketId: createdTicketId,
        response,
        payload,
      });

      rerender();

      setTimeout(() => {
        navigateToIncidenciasList().catch(() => {});
      }, 450);

      return true;
    } catch (error) {
      const message = safeErrorMessage(error);

      setSubmitting(false);
      setServerError(message);

      safeEmit("incidencias:create:error", {
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
      const form = event.target.closest("#incidencias-create-form");
      if (!form) return;

      event.preventDefault();
      await handleSubmit();
    };

    const onClick = async (event) => {
      const backBtn = event.target.closest("#incidencias-create-back-btn");
      if (backBtn) {
        event.preventDefault();
        await navigateToIncidenciasList();
        return;
      }

      const cancelBtn = event.target.closest("#incidencias-create-cancel-btn");
      if (cancelBtn) {
        event.preventDefault();
        await navigateToIncidenciasList();
        return;
      }

      const resetBtn = event.target.closest("#incidencias-create-reset-btn");
      if (resetBtn) {
        event.preventDefault();
        resetForm();
        rerender();
        showToast("Formulario limpio.", "info");
        return;
      }

      const draftBtn = event.target.closest("#incidencias-create-save-draft-btn");
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
    goBack: navigateToIncidenciasList,
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

export default IncidenciasCreateView;

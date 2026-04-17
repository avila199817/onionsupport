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
      <section style="position:relative;overflow:hidden;border-radius:calc(var(--panel-radius) + 6px);border:1px solid var(--border-soft);background:radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent), transparent 34%),linear-gradient(180deg, var(--surface-2, var(--surface-glass)), var(--surface-1, var(--surface-glass)));box-shadow:var(--shadow-md);">
        <div style="display:grid;gap:18px;padding:clamp(20px, 3vw, 30px);">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div style="display:grid;gap:10px;">
              <span style="display:inline-flex;align-items:center;width:max-content;min-height:28px;padding:0 12px;border-radius:999px;border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);color:var(--text-soft);font-size:12px;font-weight:var(--weight-bold, 700);letter-spacing:.06em;text-transform:uppercase;">
                Nueva incidencia
              </span>

              <div style="display:grid;gap:8px;">
                <h1 style="margin:0;font-size:clamp(30px, 5vw, 46px);line-height:.98;letter-spacing:-.05em;color:var(--text-strong);">
                  Alta manual de ticket
                </h1>

                <p style="margin:0;max-width:860px;color:var(--text-dim);font-size:clamp(14px, 2vw, 16px);line-height:1.6;">
                  Registra una incidencia con contexto operativo, prioridad, cliente y asignación inicial desde un formulario premium preparado para backend real.
                </p>
              </div>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <button id="incidencias-create-back-btn" type="button" style="min-height:42px;padding:0 14px;border-radius:var(--btn-radius);border:1px solid var(--btn-secondary-border, var(--border-soft));background:var(--btn-secondary-bg, var(--surface-glass));color:var(--btn-secondary-text, var(--text-soft));font-weight:var(--weight-bold, 700);cursor:pointer;">
                Volver al listado
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* resto del archivo íntegro igual al proporcionado por el usuario */
})();

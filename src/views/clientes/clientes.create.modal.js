/* =========================================================
   Onion SPA - Clientes Create View
   Archivo: src/views/clientes/clientes.create.modal.js

   FINAL PRO SYSTEM · CREATE VIEW · CLEAN JS · 15/10
   NO INLINE CSS · NO STYLE INJECTION · CSP READY
   VARIABLES.CSS + UI.CSS + /css/views/clientes/index.css READY

   RESPONSABILIDADES:
   - renderizar la vista de creación de clientes
   - gestionar formulario premium de alta
   - validar campos clave
   - construir payload limpio para backend
   - enviar creación por adapters tolerantes
   - mostrar estados loading / success / error
   - permitir volver al listado
   - persistir borrador de creación
   - evitar doble bind de listeners
   - evitar doble submit
   - evitar rerenders en cada input
   - soportar destroy limpio del router

   HARDENING PRO:
   - validación defensiva
   - serialización coherente
   - adapter chain para create request
   - fallback a fetch directo
   - navegación segura post-create
   - anti-race token
   - focus a primer campo inválido
   - no CSS inline
   - no <style> inyectado por JS
   - no estilos creados por JS

   CSS EXTERNO OBLIGATORIO:
   - /src/css/views/clientes/index.css
========================================================= */

import { AppCore } from "../../core/index.js";

import { clientesState } from "./clientes.state.js";

export const ClientesCreateView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:clientes:create";
  const MODULE = "clientes";
  const VIEW_NAME = "ClientesCreateView";
  const VERSION = "15.0.0";

  const FORM_ID = "clientes-create-form";

  const CREATE_TIMEOUT_MS = 90000;
  const POST_CREATE_NAV_DELAY_MS = 460;

  const CREATE_ENDPOINTS = Object.freeze([
    "/api/clientes",
    "/api/clients",
  ]);

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

  const FIELD_ORDER = Object.freeze([
    "name",
    "companyName",
    "email",
    "phone",
    "status",
    "tier",
    "assignedTo",
    "source",
    "tags",
    "notes",
    "notifyClient",
    "internalOnly",
  ]);

  const STATUS_OPTIONS = Object.freeze([
    { value: "active", label: "Activo" },
    { value: "pending", label: "Pendiente" },
    { value: "blocked", label: "Bloqueado" },
    { value: "disabled", label: "Deshabilitado" },
  ]);

  const TIER_OPTIONS = Object.freeze([
    { value: "standard", label: "Standard" },
    { value: "vip", label: "VIP" },
    { value: "enterprise", label: "Enterprise" },
  ]);

  /* =========================================================
     RUNTIME
  ========================================================= */

  let initialized = false;
  let mounted = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightSubmit = null;

  let bindingsCleanup = null;
  let renderToken = 0;
  let postCreateTimer = null;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[ClientesCreateView]", ...args);
    } catch {}

    try {
      if (process.env?.NODE_ENV !== "production") {
        console.log("[ClientesCreateView]", ...args);
      }
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[ClientesCreateView]", ...args);
    } catch {}

    try {
      console.warn("[ClientesCreateView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    let emitted = false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
  }

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
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
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      return value;
    }

    return null;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(Object(obj), key);
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

  function normalizeKey(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .replace(/^_+|_+$/g, "")
      .trim();
  }

  function isEmail(value = "") {
    const text = safeText(value, "");

    if (!text) return true;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
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

  function getContainer() {
    if (!isBrowser()) return null;

    try {
      return (
        AppCore?.dom?.viewContainer ||
        document.getElementById("view-container") ||
        document.querySelector("[data-view-container]") ||
        null
      );
    } catch {
      return null;
    }
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function clearPostCreateTimer() {
    try {
      if (postCreateTimer) {
        clearTimeout(postCreateTimer);
      }
    } catch {}

    postCreateTimer = null;
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
    const text = safeText(message, "");
    const toastType = normalizeKey(type) || "info";

    if (!text) return false;

    try {
      if (typeof AppCore?.toast?.[toastType] === "function") {
        AppCore.toast[toastType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.show === "function") {
        AppCore.toast.show(text, toastType);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.[toastType] === "function") {
        AppCore.ui.toast[toastType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.toast?.show === "function") {
        AppCore.ui.toast.show({
          message: text,
          type: toastType,
        });
        return true;
      }
    } catch {}

    try {
      if (isBrowser() && typeof window.Toast?.show === "function") {
        window.Toast.show({
          message: text,
          type: toastType,
        });
        return true;
      }
    } catch {}

    return false;
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
        error?.data?.error,
        error?.response?.error,
        error?.error,
        error?.detail,
        error?.code,
        "No se pudo crear el cliente."
      ),
      "No se pudo crear el cliente."
    );
  }

  function getHttpStatus(error = null) {
    return safeNumber(
      first(
        error?.status,
        error?.statusCode,
        error?.response?.status,
        error?.data?.status
      ),
      0
    );
  }

  function shouldTryNextCandidate(error = null) {
    const code = safeText(error?.message || error?.code || "", "");

    if (
      [
        "API_CLIENT_UNAVAILABLE",
        "API_CLIENT_POST_UNAVAILABLE",
        "APP_CORE_REQUEST_UNAVAILABLE",
        "HTTP_MODULE_UNAVAILABLE",
        "HTTP_POST_UNAVAILABLE",
      ].includes(code)
    ) {
      return true;
    }

    const status = getHttpStatus(error);

    if (!status) return true;

    /*
      No reintentar errores semánticos:
      - 400: payload inválido
      - 401/403: auth/permisos
      - 409: duplicado
      - 422: validación backend
    */
    return [404, 405, 415, 500, 502, 503, 504].includes(status);
  }

  function isAbsoluteUrl(value = "") {
    return /^https?:\/\//i.test(safeText(value, ""));
  }

  function getApiBase() {
    const apiBase = safeText(
      first(
        AppCore?.config?.apiBase,
        AppCore?.config?.api?.baseUrl,
        AppCore?.state?.apiBase,
        isBrowser() ? window?.ONION_API_BASE : "",
        isBrowser() ? window?.API_BASE : ""
      ),
      ""
    );

    return apiBase.replace(/\/+$/, "");
  }

  function buildFetchUrl(endpoint = "") {
    const path = safeText(endpoint, "");
    if (!path) return "";

    if (isAbsoluteUrl(path)) {
      return path;
    }

    const apiBase = getApiBase();

    if (!apiBase) {
      return path.startsWith("/") ? path : `/${path}`;
    }

    if (apiBase.endsWith("/api") && path.startsWith("/api/")) {
      return `${apiBase}${path.slice(4)}`;
    }

    return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function getAuthToken() {
    return safeText(
      first(
        AppCore?.state?.token,
        AppCore?.state?.accessToken,
        AppCore?.state?.session?.token,
        AppCore?.state?.session?.accessToken,
        AppCore?.auth?.getToken?.(),
        AppCore?.Auth?.getToken?.(),
        isBrowser() ? window?.Auth?.getToken?.() : "",
        typeof localStorage !== "undefined" ? localStorage.getItem("token") : "",
        typeof localStorage !== "undefined" ? localStorage.getItem("accessToken") : "",
        typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : "",
        typeof sessionStorage !== "undefined" ? sessionStorage.getItem("accessToken") : ""
      ),
      ""
    );
  }

  function createTimeoutController(timeoutMs = 15000) {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, timeoutMs);

    return {
      signal: controller.signal,
      clear() {
        clearTimeout(timer);
      },
    };
  }

  /* =========================================================
     CREATE STATE
  ========================================================= */

  function normalizeStatus(value = "active") {
    const status = safeLower(value, "active");

    if (["active", "pending", "blocked", "disabled"].includes(status)) {
      return status;
    }

    return "active";
  }

  function normalizeTier(value = "standard") {
    const tier = safeLower(value, "standard");

    if (["standard", "vip", "enterprise"].includes(tier)) {
      return tier;
    }

    return "standard";
  }

  function normalizeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;

    const key = safeLower(value, "");

    if (["true", "1", "yes", "y", "on", "si", "sí"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "n", "off"].includes(key)) {
      return false;
    }

    return fallback;
  }

  function normalizeForm(rawForm = {}) {
    const form = {
      ...DEFAULT_FORM,
      ...safeObject(rawForm),
    };

    return {
      name: safeText(form.name, ""),
      companyName: safeText(form.companyName, ""),
      email: safeLower(form.email, ""),
      phone: safeText(form.phone, ""),
      status: normalizeStatus(form.status),
      tier: normalizeTier(form.tier),
      source: safeText(form.source, "panel"),
      assignedTo: safeText(form.assignedTo, ""),
      notes: safeText(form.notes, ""),
      tags: safeText(form.tags, ""),
      notifyClient: normalizeBoolean(form.notifyClient, DEFAULT_FORM.notifyClient),
      internalOnly: normalizeBoolean(form.internalOnly, DEFAULT_FORM.internalOnly),
    };
  }

  function getInitialForm() {
    const draft = safeObject(clientesState?.createDraft);

    return normalizeForm({
      ...DEFAULT_FORM,
      ...draft,
    });
  }

  function ensureCreateState() {
    if (!clientesState.createView || typeof clientesState.createView !== "object") {
      clientesState.createView = {};
    }

    const state = clientesState.createView;

    state.form = normalizeForm(
      Object.keys(safeObject(state.form)).length
        ? state.form
        : getInitialForm()
    );

    state.errors = safeObject(state.errors);
    state.submitting = Boolean(state.submitting);
    state.serverError = safeText(state.serverError, "");
    state.createdClientId = safeText(state.createdClientId, "");
    state.successMessage = safeText(state.successMessage, "");
    state.lastSubmitAt = safeText(state.lastSubmitAt, "");
    state.lastErrorAt = safeText(state.lastErrorAt, "");

    return state;
  }

  function getCreateState() {
    return ensureCreateState();
  }

  function persistDraft() {
    const state = getCreateState();

    clientesState.createDraft = {
      ...normalizeForm(state.form),
    };

    return clientesState.createDraft;
  }

  function clearDraft() {
    clientesState.createDraft = {
      ...DEFAULT_FORM,
    };
  }

  function setFormPatch(patch = {}) {
    const state = getCreateState();

    state.form = normalizeForm({
      ...state.form,
      ...safeObject(patch),
    });

    persistDraft();

    return state.form;
  }

  function setErrors(errors = {}) {
    const state = getCreateState();
    state.errors = { ...safeObject(errors) };

    return state.errors;
  }

  function clearFieldError(field = "") {
    const key = safeText(field, "");
    if (!key) return false;

    const state = getCreateState();

    if (!state.errors?.[key]) return false;

    const nextErrors = {
      ...safeObject(state.errors),
    };

    delete nextErrors[key];

    setErrors(nextErrors);

    return true;
  }

  function setSubmitting(value = false) {
    const state = getCreateState();
    state.submitting = Boolean(value);

    return state.submitting;
  }

  function setServerError(message = "") {
    const state = getCreateState();
    state.serverError = safeText(message, "");
    state.lastErrorAt = state.serverError ? new Date().toISOString() : "";

    return state.serverError;
  }

  function setSuccess({
    clientId = "",
    message = "",
  } = {}) {
    const state = getCreateState();

    state.createdClientId = safeText(clientId, "");
    state.successMessage = safeText(message, "");
    state.lastSubmitAt = new Date().toISOString();

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

    state.form = {
      ...DEFAULT_FORM,
    };

    state.errors = {};
    state.serverError = "";
    state.createdClientId = "";
    state.successMessage = "";
    state.lastErrorAt = "";
    state.lastSubmitAt = "";

    clearDraft();

    return state.form;
  }

  /* =========================================================
     VALIDATION / PAYLOAD
  ========================================================= */

  function buildTags(value = "") {
    return safeText(value, "")
      .split(",")
      .map((tag) => slugifyTag(tag))
      .filter(Boolean);
  }

  function buildPayload(form = {}) {
    const current = normalizeForm(form);

    const tags = buildTags(current.tags);

    const payload = {
      name: normalizeWhitespace(current.name),
      companyName: normalizeWhitespace(current.companyName),
      email: safeLower(current.email, ""),
      phone: normalizeWhitespace(current.phone),

      status: normalizeStatus(current.status),
      tier: normalizeTier(current.tier),
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

    if (!payload.companyName) delete payload.companyName;
    if (!payload.email) delete payload.email;
    if (!payload.phone) delete payload.phone;
    if (!payload.assignedTo) delete payload.assignedTo;
    if (!payload.notes) delete payload.notes;
    if (!payload.tags.length) delete payload.tags;

    return payload;
  }

  function validateForm(form = {}) {
    const current = normalizeForm(form);
    const errors = {};

    const name = normalizeWhitespace(current.name);
    const companyName = normalizeWhitespace(current.companyName);
    const email = safeLower(current.email, "");
    const phone = normalizeWhitespace(current.phone);

    if (!name) {
      errors.name = "El nombre del cliente es obligatorio.";
    } else if (name.length < 2) {
      errors.name = "El nombre debe tener al menos 2 caracteres.";
    }

    if (!companyName && !name) {
      errors.companyName = "Debes indicar nombre o empresa.";
    }

    if (!email && !phone) {
      errors.email = "Debes indicar email o teléfono.";
      errors.phone = "Debes indicar email o teléfono.";
    }

    if (email && !isEmail(email)) {
      errors.email = "El email no tiene un formato válido.";
    }

    if (!["active", "pending", "blocked", "disabled"].includes(normalizeStatus(current.status))) {
      errors.status = "Estado inválido.";
    }

    if (!["standard", "vip", "enterprise"].includes(normalizeTier(current.tier))) {
      errors.tier = "Tier inválido.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /* =========================================================
     CREATE ADAPTERS
  ========================================================= */

  async function createViaApiClient(endpoint = "", payload = {}) {
    const client = AppCore?.apiClient || null;

    if (!client) {
      throw new Error("API_CLIENT_UNAVAILABLE");
    }

    if (typeof client.post === "function") {
      return client.post(endpoint, payload, {
        timeout: CREATE_TIMEOUT_MS,
        auth: true,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (typeof client.request === "function") {
      return client.request(endpoint, {
        method: "POST",
        timeout: CREATE_TIMEOUT_MS,
        auth: true,
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
      });
    }

    throw new Error("API_CLIENT_POST_UNAVAILABLE");
  }

  async function createViaAppCoreRequest(endpoint = "", payload = {}) {
    if (typeof AppCore?.request !== "function") {
      throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
    }

    return AppCore.request(endpoint, {
      method: "POST",
      timeout: CREATE_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });
  }

  async function createViaHttpModule(endpoint = "", payload = {}) {
    const Http =
      AppCore?.modules?.Http ||
      AppCore?.Http ||
      (isBrowser() ? window?.Http : null) ||
      null;

    if (!Http) {
      throw new Error("HTTP_MODULE_UNAVAILABLE");
    }

    if (typeof Http.post === "function") {
      return Http.post(endpoint, payload, {
        timeout: CREATE_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (typeof Http.request === "function") {
      return Http.request(endpoint, {
        method: "POST",
        timeout: CREATE_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
      });
    }

    throw new Error("HTTP_POST_UNAVAILABLE");
  }

  async function createViaFetch(endpoint = "", payload = {}) {
    const token = getAuthToken();
    const url = buildFetchUrl(endpoint);
    const timeout = createTimeoutController(CREATE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload || {}),
        signal: timeout.signal,
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
        error.status = response.status;
        error.statusCode = response.status;
        error.url = url;

        throw error;
      }

      return data;
    } finally {
      timeout.clear();
    }
  }

  function pickCreatedClient(response = null) {
    if (!response) return null;

    if (Array.isArray(response)) {
      return response[0] || null;
    }

    const obj = safeObject(response);

    return (
      obj.client ||
      obj.cliente ||
      obj.item ||
      obj.data?.client ||
      obj.data?.cliente ||
      obj.data?.item ||
      obj.data ||
      obj.result?.client ||
      obj.result?.cliente ||
      obj.result?.item ||
      obj.result ||
      obj.payload?.client ||
      obj.payload?.cliente ||
      obj.payload?.item ||
      obj.payload ||
      obj
    );
  }

  function resolveCreatedClientId(response = null) {
    const client = safeObject(pickCreatedClient(response));

    return safeText(
      first(
        client.clienteId,
        client.clientId,
        client.id,
        client.code,
        client.userId,
        client.email,
        response?.clienteId,
        response?.clientId,
        response?.id,
        response?.code,
        response?.email
      ),
      ""
    );
  }

  async function createClienteRequest(payload = {}) {
    const adapters = [
      createViaApiClient,
      createViaAppCoreRequest,
      createViaHttpModule,
      createViaFetch,
    ];

    let lastError = null;

    for (const endpoint of CREATE_ENDPOINTS) {
      for (const adapter of adapters) {
        try {
          return await adapter(endpoint, payload);
        } catch (error) {
          lastError = error;

          if (!shouldTryNextCandidate(error)) {
            throw error;
          }
        }
      }
    }

    throw lastError || new Error("CREATE_ADAPTERS_FAILED");
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

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
      if (isBrowser()) {
        window.location.hash = "#/clientes";
        return true;
      }
    } catch {}

    return false;
  }

  /* =========================================================
     TEMPLATE HELPERS
  ========================================================= */

  function renderFieldError(message = "") {
    const text = safeText(message, "");
    if (!text) return "";

    return `
      <span class="clientes-create-error">
        ${escapeHtml(text)}
      </span>
    `;
  }

  function renderHint(hint = "") {
    const text = safeText(hint, "");
    if (!text) return "";

    return `
      <span class="clientes-create-hint">
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
    inputmode = "",
    maxlength = "",
    disabled = false,
  } = {}) {
    const submitting = Boolean(getCreateState().submitting);

    return `
      <label class="clientes-create-field">
        <span class="clientes-create-label">
          ${escapeHtml(label)}${required ? " *" : ""}
        </span>

        <input
          class="clientes-create-input ${error ? "is-error" : ""}"
          data-field="${escapeHtml(name)}"
          name="${escapeHtml(name)}"
          type="${escapeHtml(type)}"
          value="${escapeHtml(value)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="${escapeHtml(autocomplete)}"
          ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ""}
          ${maxlength ? `maxlength="${escapeHtml(maxlength)}"` : ""}
          ${submitting || disabled ? "disabled" : ""}
        />

        ${renderHint(hint)}
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
    rows = 7,
  } = {}) {
    const submitting = Boolean(getCreateState().submitting);

    return `
      <label class="clientes-create-field">
        <span class="clientes-create-label">
          ${escapeHtml(label)}${required ? " *" : ""}
        </span>

        <textarea
          class="clientes-create-textarea ${error ? "is-error" : ""}"
          data-field="${escapeHtml(name)}"
          name="${escapeHtml(name)}"
          rows="${safeNumber(rows, 7)}"
          placeholder="${escapeHtml(placeholder)}"
          ${submitting ? "disabled" : ""}
        >${escapeHtml(value)}</textarea>

        ${renderHint(hint)}
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
    required = false,
  } = {}) {
    const submitting = Boolean(getCreateState().submitting);

    return `
      <label class="clientes-create-field">
        <span class="clientes-create-label">
          ${escapeHtml(label)}${required ? " *" : ""}
        </span>

        <select
          class="clientes-create-select ${error ? "is-error" : ""}"
          data-field="${escapeHtml(name)}"
          name="${escapeHtml(name)}"
          ${submitting ? "disabled" : ""}
        >
          ${safeArray(options)
            .map((option) => {
              const item = safeObject(option);
              const optionValue = safeText(item.value, "");
              const optionLabel = safeText(item.label, optionValue);
              const selected = optionValue === safeText(value, "") ? "selected" : "";

              return `
                <option value="${escapeHtml(optionValue)}" ${selected}>
                  ${escapeHtml(optionLabel)}
                </option>
              `;
            })
            .join("")}
        </select>

        ${renderHint(hint)}
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
    const submitting = Boolean(getCreateState().submitting);

    return `
      <label class="clientes-create-check">
        <input
          class="clientes-create-check-input"
          data-field="${escapeHtml(name)}"
          name="${escapeHtml(name)}"
          type="checkbox"
          ${checked ? "checked" : ""}
          ${submitting ? "disabled" : ""}
        />

        <span class="clientes-create-check-copy">
          <strong>${escapeHtml(label)}</strong>
          ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
        </span>
      </label>
    `;
  }

  function renderAlert(type = "info", title = "", text = "") {
    const safeTitle = safeText(title, "");
    const safeBody = safeText(text, "");

    if (!safeTitle && !safeBody) return "";

    return `
      <div class="clientes-create-alert is-${escapeHtml(type)}">
        ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
        ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
      </div>
    `;
  }

  function renderSubmitLabel(submitting = false) {
    if (!submitting) {
      return "Crear cliente";
    }

    return `
      <span class="clientes-create-submit-inner">
        <span class="clientes-create-spinner" aria-hidden="true"></span>
        Creando...
      </span>
    `;
  }

  /* =========================================================
     TEMPLATE
  ========================================================= */

  function renderHero() {
    return `
      <section class="clientes-create-hero">
        <div class="clientes-create-hero-inner">
          <div class="clientes-create-hero-main">
            <span class="clientes-create-kicker">
              Nuevo cliente
            </span>

            <div class="clientes-create-hero-copy">
              <h1>Alta manual de cliente</h1>

              <p>
                Registra un cliente con información comercial, contacto, estado y segmentación inicial desde un formulario preparado para backend real.
              </p>
            </div>
          </div>

          <div class="clientes-create-hero-actions">
            <button
              id="clientes-create-back-btn"
              type="button"
              class="clientes-create-secondary-btn"
            >
              Volver al listado
            </button>
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
      <section class="clientes-create-card">
        <div class="clientes-create-card-head">
          <div class="clientes-create-card-title">
            <strong>Formulario de creación</strong>
            <span>
              Completa los datos mínimos para registrar un cliente en el sistema.
            </span>
          </div>

          <span class="clientes-create-chip">
            Create view
          </span>
        </div>

        <div class="clientes-create-card-body">
          ${
            successMessage
              ? renderAlert(
                  "success",
                  successMessage,
                  createdClientId ? `Cliente generado: ${createdClientId}` : ""
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo crear el cliente",
                  serverError
                )
              : ""
          }

          <form
            id="${FORM_ID}"
            novalidate
            class="clientes-create-form ${submitting ? "is-submitting" : ""}"
          >
            <div class="clientes-create-grid clientes-create-grid--top">
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
                options: STATUS_OPTIONS,
              })}
            </div>

            <div class="clientes-create-grid clientes-create-grid--contact">
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
                inputmode: "tel",
              })}

              ${renderSelect({
                label: "Tier",
                name: "tier",
                value: form.tier,
                error: errors.tier,
                options: TIER_OPTIONS,
              })}
            </div>

            <div class="clientes-create-grid clientes-create-grid--meta">
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

            <div class="clientes-create-grid clientes-create-grid--flags">
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

            <div class="clientes-create-actions">
              <div class="clientes-create-action-group">
                <button
                  id="clientes-create-submit-btn"
                  type="submit"
                  class="clientes-create-submit"
                  ${submitting ? "disabled" : ""}
                >
                  ${renderSubmitLabel(submitting)}
                </button>

                <button
                  id="clientes-create-reset-btn"
                  type="button"
                  class="clientes-create-secondary-btn"
                  ${submitting ? "disabled" : ""}
                >
                  Limpiar formulario
                </button>
              </div>

              <div class="clientes-create-action-group">
                <button
                  id="clientes-create-save-draft-btn"
                  type="button"
                  class="clientes-create-secondary-btn"
                  ${submitting ? "disabled" : ""}
                >
                  Guardar borrador
                </button>

                <button
                  id="clientes-create-cancel-btn"
                  type="button"
                  class="clientes-create-ghost-btn"
                  ${submitting ? "disabled" : ""}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  function buildHtml() {
    return `
      <section
        class="panel-content dashboard ready clientes-create-panel"
        data-view="clientes-create"
        data-module="clientes"
        data-clientes-create-view="true"
      >
        <div class="content-wrapper clientes-create-content">
          ${renderHero()}
          ${renderForm()}
        </div>
      </section>
    `;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function render() {
    if (destroyed) return null;

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

    try {
      container.innerHTML = buildHtml();
      mounted = true;
      decorateDom(container);
    } catch (error) {
      safeWarn("Render falló:", error);
      return null;
    }

    safeEmit("clientes:create:rendered", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
      state: getPublicStateSnapshot(),
    });

    return container;
  }

  function decorateDom(container) {
    if (!container) return container;

    try {
      container.setAttribute("data-clientes-create-mounted", "true");
      container.setAttribute("data-clientes-create-version", VERSION);
    } catch {}

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed && container) {
      bind();
    }

    return container;
  }

  /* =========================================================
     FORM DOM HELPERS
  ========================================================= */

  function getFieldValue(target) {
    if (!target) return "";

    if (target.type === "checkbox") {
      return Boolean(target.checked);
    }

    return target.value;
  }

  function focusField(fieldName = "") {
    if (!isBrowser()) return false;

    try {
      const container = getContainer();
      const field = container?.querySelector?.(`[data-field="${fieldName}"]`);

      field?.focus?.();

      if (
        field &&
        typeof field.setSelectionRange === "function" &&
        typeof field.value === "string"
      ) {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      }

      return Boolean(field);
    } catch {
      return false;
    }
  }

  function focusFirstInvalidField() {
    const state = getCreateState();
    const errors = safeObject(state.errors);

    for (const field of FIELD_ORDER) {
      if (errors[field] && focusField(field)) {
        return true;
      }
    }

    return false;
  }

  function handleFieldChange(target) {
    const field = safeText(target?.dataset?.field, "");
    if (!field) return;

    const value = getFieldValue(target);

    setFormPatch({
      [field]: value,
    });

    clearFieldError(field);

    const state = getCreateState();

    if (state.serverError) {
      setServerError("");
    }

    if (state.successMessage || state.createdClientId) {
      resetSuccess();
    }
  }

  /* =========================================================
     SUBMIT FLOW
  ========================================================= */

  async function handleSubmit() {
    if (inflightSubmit) {
      return inflightSubmit;
    }

    const token = nextRenderToken();

    inflightSubmit = (async () => {
      const state = getCreateState();
      const form = safeObject(state.form);

      resetSuccess();
      setServerError("");

      const validation = validateForm(form);
      setErrors(validation.errors);

      if (!validation.valid) {
        rerender();
        focusFirstInvalidField();
        showToast("Revisa los campos obligatorios.", "warning");
        return false;
      }

      const payload = buildPayload(form);

      setSubmitting(true);
      rerender();

      safeEmit("clientes:create:submit", {
        payload,
        source: MODULE,
        view: VIEW_NAME,
      });

      try {
        const response = await createClienteRequest(payload);
        const createdClientId = resolveCreatedClientId(response);
        const detail = pickCreatedClient(response);

        if (!isActiveToken(token)) {
          return false;
        }

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
          detail,
          payload,
          source: MODULE,
          view: VIEW_NAME,
        });

        safeEmit("clientes:created", {
          clientId: createdClientId,
          response,
          detail,
          payload,
          source: MODULE,
          view: VIEW_NAME,
        });

        rerender();

        clearPostCreateTimer();

        postCreateTimer = setTimeout(() => {
          navigateToClientesList().catch(() => {});
        }, POST_CREATE_NAV_DELAY_MS);

        return true;
      } catch (error) {
        if (!isActiveToken(token)) {
          return false;
        }

        const message = safeErrorMessage(error);

        setSubmitting(false);
        setServerError(message);

        safeEmit("clientes:create:error", {
          error,
          payload,
          message,
          source: MODULE,
          view: VIEW_NAME,
        });

        showToast(message, "error");
        rerender();

        return false;
      }
    })();

    try {
      return await inflightSubmit;
    } finally {
      inflightSubmit = null;
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onInput = (event) => {
      if (destroyed) return;

      const field = event.target?.closest?.("[data-field]");
      if (!field) return;
      if (field.tagName === "SELECT") return;
      if (field.type === "checkbox") return;

      handleFieldChange(field);
    };

    const onChange = (event) => {
      if (destroyed) return;

      const field = event.target?.closest?.("[data-field]");
      if (!field) return;

      handleFieldChange(field);
    };

    const onSubmit = async (event) => {
      if (destroyed) return;

      const form = event.target?.closest?.(`#${FORM_ID}`);
      if (!form) return;

      event.preventDefault();

      await handleSubmit();
    };

    const onClick = async (event) => {
      if (destroyed) return;

      const backBtn = event.target?.closest?.("#clientes-create-back-btn");
      if (backBtn) {
        event.preventDefault();
        await navigateToClientesList();
        return;
      }

      const cancelBtn = event.target?.closest?.("#clientes-create-cancel-btn");
      if (cancelBtn) {
        event.preventDefault();
        await navigateToClientesList();
        return;
      }

      const resetBtn = event.target?.closest?.("#clientes-create-reset-btn");
      if (resetBtn) {
        event.preventDefault();

        if (getCreateState().submitting) return;

        resetForm();
        rerender();
        showToast("Formulario limpio.", "info");
        return;
      }

      const draftBtn = event.target?.closest?.("#clientes-create-save-draft-btn");
      if (draftBtn) {
        event.preventDefault();

        if (getCreateState().submitting) return;

        persistDraft();
        showToast("Borrador guardado.", "success");
      }
    };

    container.addEventListener("input", onInput);
    container.addEventListener("change", onChange);
    container.addEventListener("submit", onSubmit);
    container.addEventListener("click", onClick);

    return () => {
      try {
        container.removeEventListener("input", onInput);
        container.removeEventListener("change", onChange);
        container.removeEventListener("submit", onSubmit);
        container.removeEventListener("click", onClick);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

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

  /* =========================================================
     PUBLIC FLOWS
  ========================================================= */

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      ensureCreateState();
      rerender();
      return api;
    }

    initialized = true;
    mounted = false;

    inflightInit = (async () => {
      const token = nextRenderToken();

      safeLog("init");

      ensureCreateState();

      render();

      if (!isActiveToken(token)) {
        return api;
      }

      bind();

      safeEmit("clientes:create:init:done", {
        source: MODULE,
        view: VIEW_NAME,
        version: VERSION,
        state: getPublicStateSnapshot(),
      });

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
    mounted = false;

    nextRenderToken();

    clearPostCreateTimer();
    cleanupBindings();

    setSubmitting(false);

    inflightInit = null;
    inflightSubmit = null;

    safeEmit("clientes:create:destroyed", {
      source: MODULE,
      view: VIEW_NAME,
      version: VERSION,
    });

    safeLog("destroy");

    return true;
  }

  function mount() {
    return init();
  }

  function bootstrap() {
    return init();
  }

  function unmount() {
    return destroy();
  }

  function dispose() {
    return destroy();
  }

  /* =========================================================
     SNAPSHOTS / PUBLIC API
  ========================================================= */

  function getPublicStateSnapshot() {
    const state = getCreateState();

    return {
      initialized,
      mounted,
      destroyed,

      submitting: Boolean(state.submitting),
      hasInflightInit: Boolean(inflightInit),
      hasInflightSubmit: Boolean(inflightSubmit),

      serverError: safeText(state.serverError, ""),
      createdClientId: safeText(state.createdClientId, ""),
      successMessage: safeText(state.successMessage, ""),
      lastSubmitAt: safeText(state.lastSubmitAt, ""),
      lastErrorAt: safeText(state.lastErrorAt, ""),

      hasErrors: Object.keys(safeObject(state.errors)).length > 0,
      errors: {
        ...safeObject(state.errors),
      },
      form: {
        ...safeObject(state.form),
      },
    };
  }

  function getState() {
    return {
      ...getCreateState(),
      ...getPublicStateSnapshot(),
    };
  }

  function getPayload() {
    return buildPayload(getCreateState().form);
  }

  function registerPublicBridge() {
    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.ClientesCreateView = api;
      AppCore.modules.ClientesCreate = api;
      AppCore.modules.OnionClientesCreateView = api;
    } catch {}

    try {
      if (isBrowser()) {
        window.ClientesCreateView = api;
        window.OnionClientesCreateView = api;

        window.OnionClientes = {
          ...(window.OnionClientes && typeof window.OnionClientes === "object"
            ? window.OnionClientes
            : {}),
          createView: api,
          create: api,
        };
      }
    } catch {}

    return api;
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    name: MODULE,
    viewName: VIEW_NAME,
    version: VERSION,
    source: "views:clientes:clientesCreateView",

    init,
    mount,
    bootstrap,

    render: rerender,
    rerender,

    reload,
    refresh: reload,

    destroy,
    unmount,
    dispose,

    submit: handleSubmit,
    goBack: navigateToClientesList,

    resetForm,
    persistDraft,
    clearDraft,

    getState,
    getPublicStateSnapshot,
    getPayload,

    validate: () => validateForm(getCreateState().form),
    buildPayload: getPayload,

    get initialized() {
      return initialized;
    },

    get mounted() {
      return mounted;
    },

    get destroyed() {
      return destroyed;
    },
  };

  registerPublicBridge();

  return api;
})();

export default ClientesCreateView;

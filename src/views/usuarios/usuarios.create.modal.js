/* =========================================================
   Onion SPA - Usuarios Create Modal
   Archivo: src/views/usuarios/usuarios.create.modal.js

   USERS EXPERIENCE PRO · CREATE MODAL · CLEAN JS · FINAL 15/10
   NO INLINE CSS · NO STYLE INJECTION · CSP READY
   VARIABLES.CSS + UI.CSS + /css/views/usuarios/index.css READY

   RESPONSABILIDADES:
   - abrir/cerrar modal de creación de usuario
   - crear ficha de usuario / cliente desde panel admin
   - validar campos obligatorios
   - teléfono español con prefijo fijo +34
   - formatear teléfono visualmente como +34 629 946 615
   - limitar teléfono a 9 dígitos nacionales
   - enviar payload JSON limpio
   - emitir usuarios:create:success / usuarios:created para refrescar la vista
   - persistir draft mínimo mientras el modal está abierto
   - evitar doble submit y doble binding
   - mostrar loader overlay premium al crear usuario
   - puente global compatible con usuariosView.js
   - no inyectar estilos
   - no mutar style="" en runtime
   - no duplicar listeners AppCore/window
   - no parpadeos innecesarios en input
   - clase body modal-open para bloqueo visual externo

   CSS EXTERNO OBLIGATORIO:
   - /src/css/views/usuarios/index.css
========================================================= */

import { AppCore } from "../../core/index.js";
import { usuariosState } from "./usuarios.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "usuarios-create-modal-root";
const PANEL_ID = "usuarios-create-modal-panel";
const FORM_ID = "usuarios-create-form";

const USERS_CREATE_ENDPOINT = "/api/users/create";
const USERS_FALLBACK_CREATE_ENDPOINT = "/api/users";

const CREATE_TIMEOUT_MS = 90000;
const AUTO_CLOSE_SUCCESS_MS = 420;

const PHONE_PREFIX = "+34";
const PHONE_NATIONAL_DIGITS = 9;

const CUSTOMER_TYPE_OPTIONS = Object.freeze([
  { value: "particular", label: "Particular" },
  { value: "empresa", label: "Empresa" },
]);

const DEFAULT_FORM = Object.freeze({
  name: "",
  email: "",
  phone: `${PHONE_PREFIX} `,
  customerType: "particular",
  nif: "",
  addressStreet: "",
  addressCp: "",
  addressCity: "",
  addressProvince: "",
  addressCountry: "España",
});

const FIELD_ORDER = Object.freeze([
  "name",
  "email",
  "phone",
  "customerType",
  "nif",
  "addressStreet",
  "addressCp",
  "addressCity",
  "addressProvince",
  "addressCountry",
]);

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  isOpen: false,
  bindingsAttached: false,
  busAttached: false,

  escHandler: null,
  lastActiveElement: null,
  successCloseTimer: null,

  submitting: false,

  errors: {},
  serverError: "",
  successMessage: "",
  createdUserId: "",

  form: {
    ...DEFAULT_FORM,
  },
};

let busCleanup = null;

const eventDedupe = {
  name: "",
  key: "",
  at: 0,
};

/* =========================================================
   HELPERS CORE
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

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

function addEventBusListener(event = "", handler = null) {
  const eventName = safeText(event, "");
  if (!eventName || typeof handler !== "function") return () => {};

  const cleanups = [];

  try {
    if (typeof AppCore?.events?.on === "function") {
      AppCore.events.on(eventName, handler);

      cleanups.push(() => {
        try {
          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.addEventListener(eventName, handler);

      cleanups.push(() => {
        try {
          window.removeEventListener(eventName, handler);
        } catch {}
      });
    }
  } catch {}

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup?.();
      } catch {}
    }
  };
}

function dedupeEvent(eventName = "", payload = {}) {
  const now = Date.now();

  let key = "";

  try {
    key = JSON.stringify(payload || {});
  } catch {
    key = String(payload || "");
  }

  if (
    eventDedupe.name === eventName &&
    eventDedupe.key === key &&
    now - eventDedupe.at < 80
  ) {
    return true;
  }

  eventDedupe.name = eventName;
  eventDedupe.key = key;
  eventDedupe.at = now;

  return false;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");
  if (!text) return false;

  const toastType = safeLower(type, "info") || "info";

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

function safeErrorMessage(
  error = null,
  fallback = "No se pudo crear el usuario."
) {
  if (!error) return fallback;

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
      fallback
    ),
    fallback
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
    No se reintenta 400/401/403/409/422:
    - 409: email/usuario duplicado.
    - 422: validación backend.
    Reintentar contra otro endpoint puede duplicar efectos o ensuciar errores.
  */
  return [404, 405, 415, 500, 502, 503, 504].includes(status);
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

function clearSuccessCloseTimer() {
  try {
    if (modalState.successCloseTimer) {
      clearTimeout(modalState.successCloseTimer);
    }
  } catch {}

  modalState.successCloseTimer = null;
}

/* =========================================================
   PHONE HELPERS
========================================================= */

function extractSpanishPhoneDigits(value = "") {
  const raw = String(value ?? "");
  const trimmed = raw.trim();

  let digits = raw.replace(/\D/g, "");

  const startsWithPrefix =
    /^\+?34(?:\s|$)/.test(trimmed) ||
    /^\+?34/.test(trimmed) ||
    (digits.startsWith("34") && digits.length > PHONE_NATIONAL_DIGITS);

  if (startsWithPrefix && digits.startsWith("34")) {
    digits = digits.slice(2);
  }

  return digits.slice(0, PHONE_NATIONAL_DIGITS);
}

function groupSpanishPhoneDigits(digits = "") {
  const clean = String(digits || "")
    .replace(/\D/g, "")
    .slice(0, PHONE_NATIONAL_DIGITS);

  return clean
    .replace(/(\d{3})(?=\d)/g, "$1 ")
    .trim();
}

function formatSpanishPhoneForInput(value = "") {
  const digits = extractSpanishPhoneDigits(value);
  const grouped = groupSpanishPhoneDigits(digits);

  return grouped ? `${PHONE_PREFIX} ${grouped}` : `${PHONE_PREFIX} `;
}

function normalizePhoneForPayload(value = "") {
  const digits = extractSpanishPhoneDigits(value);

  return digits.length === PHONE_NATIONAL_DIGITS
    ? `${PHONE_PREFIX}${digits}`
    : "";
}

function isValidSpanishPhone(value = "") {
  return extractSpanishPhoneDigits(value).length === PHONE_NATIONAL_DIGITS;
}

function sanitizeUsername(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function isValidEmail(value = "") {
  const text = safeText(value, "");
  if (!text) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function normalizeCustomerType(value = "") {
  const raw = safeLower(value, "particular");

  if (raw === "empresa" || raw === "company") return "empresa";
  return "particular";
}

function buildUsernameFromForm(form = {}) {
  const current = safeObject(form);
  const email = safeLower(current.email, "");

  if (email.includes("@")) {
    return sanitizeUsername(email.split("@")[0]);
  }

  return sanitizeUsername(current.name || "usuario");
}

/* =========================================================
   STATE HELPERS
========================================================= */

function normalizeDraftToForm(draft = {}) {
  const source = safeObject(draft);
  const direccion = safeObject(source.direccion || source.address || source.location);

  return {
    name: safeText(first(source.name, source.fullName, source.displayName, source.nombre), ""),
    email: safeText(first(source.email, source.mail), ""),
    phone: formatSpanishPhoneForInput(first(source.phone, source.telefono, `${PHONE_PREFIX} `)),

    customerType: normalizeCustomerType(first(source.customerType, source.tipo, "particular")),
    nif: safeText(first(source.nif, source.cif, source.taxId), ""),

    addressStreet: safeText(first(source.addressStreet, direccion.calle, direccion.street), ""),
    addressCp: safeText(first(source.addressCp, direccion.cp, direccion.postalCode), ""),
    addressCity: safeText(first(source.addressCity, direccion.ciudad, direccion.city), ""),
    addressProvince: safeText(first(source.addressProvince, direccion.provincia, direccion.province), ""),
    addressCountry: safeText(first(source.addressCountry, direccion.pais, direccion.country), "España"),
  };
}

function getInitialForm() {
  return {
    ...DEFAULT_FORM,
    ...normalizeDraftToForm(usuariosState?.createDraft || {}),
  };
}

function syncCreateViewState(patch = {}) {
  try {
    usuariosState.createView = {
      ...safeObject(usuariosState.createView),
      ...safeObject(patch),
      form: {
        ...safeObject(usuariosState.createView?.form),
        ...safeObject(patch.form),
      },
    };
  } catch {}
}

function persistDraft() {
  const form = safeObject(modalState.form);

  usuariosState.createDraft = {
    name: safeText(form.name, ""),
    email: safeLower(form.email, ""),
    phone: formatSpanishPhoneForInput(form.phone),

    customerType: normalizeCustomerType(form.customerType),
    tipo: normalizeCustomerType(form.customerType),

    nif: safeText(form.nif, "").toUpperCase(),

    direccion: {
      calle: safeText(form.addressStreet, ""),
      cp: safeText(form.addressCp, ""),
      ciudad: safeText(form.addressCity, ""),
      provincia: safeText(form.addressProvince, ""),
      pais: safeText(form.addressCountry, "España"),
    },
  };

  syncCreateViewState({
    form: usuariosState.createDraft,
  });
}

function clearDraft() {
  usuariosState.createDraft = {
    ...DEFAULT_FORM,
    phone: `${PHONE_PREFIX} `,
    tipo: "particular",
    direccion: {
      calle: "",
      cp: "",
      ciudad: "",
      provincia: "",
      pais: "España",
    },
  };

  syncCreateViewState({
    form: usuariosState.createDraft,
  });
}

function setFormPatch(patch = {}) {
  const nextPatch = {
    ...safeObject(patch),
  };

  if (hasOwn(nextPatch, "phone")) {
    nextPatch.phone = formatSpanishPhoneForInput(nextPatch.phone);
  }

  if (hasOwn(nextPatch, "email")) {
    nextPatch.email = safeLower(nextPatch.email, "");
  }

  if (hasOwn(nextPatch, "customerType")) {
    nextPatch.customerType = normalizeCustomerType(nextPatch.customerType);
  }

  modalState.form = {
    ...safeObject(modalState.form),
    ...nextPatch,
  };

  persistDraft();

  return modalState.form;
}

function resetFeedbackState() {
  modalState.errors = {};
  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdUserId = "";

  syncCreateViewState({
    errors: {},
    serverError: "",
    createdUserId: "",
    successMessage: "",
  });
}

function resetFormState() {
  modalState.form = {
    ...DEFAULT_FORM,
    phone: `${PHONE_PREFIX} `,
  };
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const name = normalizeWhitespace(current.name);
  const email = safeLower(current.email, "");
  const phone = safeText(current.phone, "");
  const nif = safeText(current.nif, "");
  const customerType = normalizeCustomerType(current.customerType);

  const addressStreet = normalizeWhitespace(current.addressStreet);
  const addressCp = safeText(current.addressCp, "");
  const addressCity = normalizeWhitespace(current.addressCity);
  const addressProvince = normalizeWhitespace(current.addressProvince);
  const addressCountry = normalizeWhitespace(current.addressCountry);

  if (!name) {
    errors.name = "El nombre completo es obligatorio.";
  } else if (name.length < 3) {
    errors.name = "El nombre debe tener al menos 3 caracteres.";
  }

  if (!email) {
    errors.email = "El email es obligatorio.";
  } else if (!isValidEmail(email)) {
    errors.email = "Introduce un email válido.";
  }

  if (!extractSpanishPhoneDigits(phone)) {
    errors.phone = "El teléfono es obligatorio.";
  } else if (!isValidSpanishPhone(phone)) {
    errors.phone = "El teléfono debe tener 9 números.";
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
  const customerType = normalizeCustomerType(current.customerType);
  const phone = normalizePhoneForPayload(current.phone);

  return {
    name: normalizeWhitespace(current.name),
    username: buildUsernameFromForm(current),
    email: safeLower(current.email, ""),
    phone,

    role: "user",
    active: false,

    tipo: customerType,
    customerType,

    nif: safeText(current.nif, "").toUpperCase(),

    privacyMode: false,
    darkMode: true,

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

function buildCreateEndpoints() {
  return [
    USERS_CREATE_ENDPOINT,
    USERS_FALLBACK_CREATE_ENDPOINT,
  ];
}

async function createViaApiClient(endpoint = "", payload = null) {
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

async function createViaAppCoreRequest(endpoint = "", payload = null) {
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

async function createViaHttpModule(endpoint = "", payload = null) {
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

async function createViaFetch(endpoint = "", payload = null) {
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
            `HTTP ${response.status} al crear usuario.`
          ),
          "No se pudo crear el usuario."
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

function pickCreatedUser(response = null) {
  if (!response) return null;

  if (Array.isArray(response)) {
    return response[0] || null;
  }

  const obj = safeObject(response);

  return (
    obj.user ||
    obj.usuario ||
    obj.item ||
    obj.data?.user ||
    obj.data?.usuario ||
    obj.data?.item ||
    obj.data ||
    obj.result?.user ||
    obj.result?.usuario ||
    obj.result?.item ||
    obj.result ||
    obj.payload?.user ||
    obj.payload?.usuario ||
    obj.payload?.item ||
    obj.payload ||
    obj
  );
}

function resolveCreatedUserId(response = null) {
  const user = safeObject(pickCreatedUser(response));

  return safeText(
    first(
      user.userId,
      user.usuarioId,
      user.id,
      user.code,
      user.uid,
      user.username,
      user.email,
      response?.userId,
      response?.usuarioId,
      response?.id,
      response?.code,
      response?.uid,
      response?.username,
      response?.email
    ),
    ""
  );
}

async function createUsuarioRequest(payload = null) {
  const endpoints = buildCreateEndpoints();

  const adapters = [
    createViaApiClient,
    createViaAppCoreRequest,
    createViaHttpModule,
    createViaFetch,
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
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
  inputmode = "",
  maxlength = "",
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
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ""}
        ${maxlength ? `maxlength="${escapeHtml(maxlength)}"` : ""}
        ${modalState.submitting ? "disabled" : ""}
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
        ${modalState.submitting ? "disabled" : ""}
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

function renderAlert(type = "info", title = "", text = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="usr-create-alert is-${escapeHtml(type)}">
      ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
      ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
    </div>
  `;
}

function renderCreateLoadingOverlay(label = "Creando usuario...") {
  return `
    <div
      class="usr-create-loading-overlay"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="usr-create-loading-card">
        <span class="usr-create-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
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

  const normalizedCustomerType = normalizeCustomerType(form.customerType);
  const phoneValue = formatSpanishPhoneForInput(form.phone);

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
        class="usr-create-panel${submitting ? " is-submitting" : ""}"
      >
        ${submitting ? renderCreateLoadingOverlay("Creando usuario...") : ""}

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
                  createdUserId ? `Referencia generada: ${createdUserId}` : successMessage
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo crear el usuario.",
                  serverError
                )
              : ""
          }

          <form id="${FORM_ID}" novalidate class="usr-create-form">
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
                  value: phoneValue,
                  type: "tel",
                  placeholder: "+34 629 946 615",
                  required: true,
                  error: errors.phone,
                  autocomplete: "tel",
                  inputmode: "numeric",
                  maxlength: "15",
                })}
              </div>

              <div class="usr-create-inline-grid">
                ${renderSelect({
                  label: "Tipo",
                  name: "customerType",
                  value: normalizedCustomerType,
                  required: true,
                  error: errors.customerType,
                  options: CUSTOMER_TYPE_OPTIONS,
                })}

                ${renderInput({
                  label: "NIF / CIF",
                  name: "nif",
                  value: form.nif,
                  placeholder: "Ej. 12345678Z / B12345678",
                  required: normalizedCustomerType === "empresa",
                  error: errors.nif,
                  autocomplete: "off",
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
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  if (!isBrowser()) return null;
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  if (!isBrowser()) return null;

  let root = getRoot();

  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = MODAL_ID;
  root.className = "usuarios-create-modal-host";
  root.setAttribute("data-usuarios-create-modal-root", "true");

  document.body.appendChild(root);

  return root;
}

function lockBody() {
  if (!isBrowser()) return;

  try {
    document.body.classList.add("modal-open", "usuarios-create-modal-open");
  } catch {}
}

function unlockBody() {
  if (!isBrowser()) return;

  try {
    document.body.classList.remove("usuarios-create-modal-open");
  } catch {}

  /*
    No se elimina modal-open si otros modales siguen abiertos.
  */
  try {
    const hasOtherOpenModal =
      document.querySelector("[data-usuarios-modal-root='true'] .is-open") ||
      document.querySelector("[data-modal-root='true'] .is-open") ||
      document.querySelector("[aria-modal='true']");

    if (!hasOtherOpenModal) {
      document.body.classList.remove("modal-open");
    }
  } catch {
    try {
      document.body.classList.remove("modal-open");
    } catch {}
  }
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
  if (!modalState.escHandler || !isBrowser()) {
    modalState.escHandler = null;
    return;
  }

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  if (!isBrowser()) return;

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

  if (!root) return null;

  if (!modalState.isOpen) {
    detachRootBindings();
    root.innerHTML = "";
    root.classList.remove("is-open");
    return root;
  }

  detachRootBindings();

  root.classList.add("is-open");
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

function focusField(fieldName = "") {
  try {
    const root = getRoot();
    const field = root?.querySelector?.(`[data-field="${fieldName}"]`);

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
  const errors = safeObject(modalState.errors);

  for (const field of FIELD_ORDER) {
    if (errors[field] && focusField(field)) {
      return true;
    }
  }

  focusPanel();
  return false;
}

function focusPreferredField() {
  const form = safeObject(modalState.form);

  if (!safeText(form.name, "") && focusField("name")) return true;
  if (!safeText(form.email, "") && focusField("email")) return true;
  if (!isValidSpanishPhone(form.phone) && focusField("phone")) return true;

  focusPanel();
  return true;
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

export function openUsuariosCreateModal(draft = {}) {
  if (!isBrowser()) return false;

  clearSuccessCloseTimer();

  modalState.lastActiveElement = document.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;

  resetFeedbackState();

  modalState.form = {
    ...getInitialForm(),
    ...normalizeDraftToForm(draft),
  };

  modalState.form.customerType = normalizeCustomerType(
    first(modalState.form.customerType, modalState.form.tipo)
  );

  modalState.form.phone = formatSpanishPhoneForInput(
    first(modalState.form.phone, `${PHONE_PREFIX} `)
  );

  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPreferredField();

  safeEmit("usuarios:create-modal:opened", {
    draft: { ...modalState.form },
  });

  return true;
}

export function closeUsuariosCreateModal() {
  if (modalState.submitting) {
    return false;
  }

  clearSuccessCloseTimer();

  const root = getRoot();

  modalState.isOpen = false;
  modalState.submitting = false;

  resetFeedbackState();
  resetFormState();
  clearDraft();

  detachRootBindings();

  if (root) {
    root.innerHTML = "";
    root.classList.remove("is-open");
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

  clearSuccessCloseTimer();

  modalState.form = {
    ...safeObject(modalState.form),
    ...normalizeDraftToForm(draft),
  };

  modalState.form.customerType = normalizeCustomerType(
    first(modalState.form.customerType, modalState.form.tipo)
  );

  modalState.form.phone = formatSpanishPhoneForInput(
    first(modalState.form.phone, `${PHONE_PREFIX} `)
  );

  persistDraft();

  renderModal();
  attachRootBindings();
  focusPreferredField();

  return true;
}

/* =========================================================
   SUBMIT FLOW
========================================================= */

async function handleSubmit() {
  if (modalState.submitting) {
    return false;
  }

  clearSuccessCloseTimer();

  modalState.successMessage = "";
  modalState.createdUserId = "";
  modalState.serverError = "";
  modalState.form.phone = formatSpanishPhoneForInput(modalState.form.phone);

  const validation = validateForm(modalState.form);
  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    attachRootBindings();
    focusFirstInvalidField();

    showToast("Revisa los campos obligatorios.", "warning");

    return false;
  }

  const payload = buildPayload(modalState.form);

  modalState.submitting = true;

  syncCreateViewState({
    submitting: true,
    serverError: "",
    errors: {},
  });

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

    syncCreateViewState({
      submitting: false,
      errors: {},
      serverError: "",
      createdUserId,
      successMessage: "El usuario se ha creado correctamente.",
    });

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

    safeEmit("usuarios:created", {
      userId: createdUserId,
      response,
      detail,
    });

    modalState.successCloseTimer = setTimeout(() => {
      if (modalState.isOpen && !modalState.submitting) {
        closeUsuariosCreateModal();
      }
    }, AUTO_CLOSE_SUCCESS_MS);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(error);

    syncCreateViewState({
      submitting: false,
      serverError: modalState.serverError,
    });

    safeEmit("usuarios:create:error", {
      error,
      message: modalState.serverError,
    });

    renderModal();
    attachRootBindings();
    focusPreferredField();

    showToast(modalState.serverError, "error");

    return false;
  }
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function clearFieldError(field = "") {
  const key = safeText(field, "");

  if (!key || !modalState.errors[key]) return;

  const nextErrors = { ...safeObject(modalState.errors) };
  delete nextErrors[key];

  modalState.errors = nextErrors;
}

function clearTransientFeedback() {
  if (modalState.serverError) {
    modalState.serverError = "";
  }

  if (modalState.successMessage || modalState.createdUserId) {
    modalState.successMessage = "";
    modalState.createdUserId = "";
  }
}

function handleFieldChange(target) {
  const field = safeText(target?.dataset?.field, "");
  if (!field) return;

  let value = target?.value;

  if (field === "phone") {
    value = formatSpanishPhoneForInput(value);

    try {
      target.value = value;
    } catch {}
  }

  if (field === "email") {
    value = safeLower(value, "");
  }

  if (field === "customerType") {
    value = normalizeCustomerType(value);
  }

  setFormPatch({
    [field]: value,
  });

  clearFieldError(field);

  if (
    field === "customerType" &&
    value === "particular" &&
    modalState.errors.nif
  ) {
    clearFieldError("nif");
  }

  clearTransientFeedback();

  /*
    Solo se rerenderiza cuando cambia el tipo:
    - cambia required de NIF/CIF
    - evita parpadeos por input normal
  */
  if (field === "customerType") {
    renderModal();
    attachRootBindings();
    focusField("customerType");
  }
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();
  if (!root) return;

  const onInput = (event) => {
    const field = event.target?.closest?.("[data-field]");
    if (!field) return;
    if (field.tagName === "SELECT") return;

    handleFieldChange(field);
  };

  const onChange = (event) => {
    const field = event.target?.closest?.("[data-field]");
    if (!field) return;

    handleFieldChange(field);
  };

  const onSubmit = async (event) => {
    const form = event.target?.closest?.(`#${FORM_ID}`);
    if (!form) return;

    event.preventDefault();

    await handleSubmit();
  };

  const onClick = (event) => {
    const closeBtn = event.target?.closest?.("[data-modal-close='true']");

    if (closeBtn) {
      event.preventDefault();

      if (!modalState.submitting) {
        closeUsuariosCreateModal();
      }

      return;
    }

    const overlay = event.target?.closest?.("[data-usuarios-create-modal-overlay='true']");
    const panel = event.target?.closest?.("[data-usuarios-create-modal-panel='true']");

    if (
      overlay &&
      !panel &&
      event.target === overlay &&
      !modalState.submitting
    ) {
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

function unwrapEventDraft(event) {
  const payload = event?.detail ?? event ?? {};
  return safeObject(payload?.draft ?? payload);
}

function handleOpenEvent(event) {
  const draft = unwrapEventDraft(event);

  if (dedupeEvent("usuarios:create-modal:open", draft)) {
    return;
  }

  openUsuariosCreateModal(draft);
}

function handleCloseEvent(event) {
  const payload = event?.detail ?? event ?? {};

  if (dedupeEvent("usuarios:create-modal:close", payload)) {
    return;
  }

  closeUsuariosCreateModal();
}

function handleUpdateEvent(event) {
  const draft = unwrapEventDraft(event);

  if (dedupeEvent("usuarios:create-modal:update", draft)) {
    return;
  }

  updateUsuariosCreateModal(draft);
}

function attachBus() {
  if (modalState.busAttached) return;

  const cleanups = [];

  cleanups.push(
    addEventBusListener("usuarios:create-modal:open", handleOpenEvent)
  );

  cleanups.push(
    addEventBusListener("usuarios:create-modal:close", handleCloseEvent)
  );

  cleanups.push(
    addEventBusListener("usuarios:create-modal:update", handleUpdateEvent)
  );

  busCleanup = () => {
    for (const cleanup of cleanups) {
      try {
        cleanup?.();
      } catch {}
    }
  };

  modalState.busAttached = true;
}

function detachBus() {
  if (!modalState.busAttached) return;

  try {
    busCleanup?.();
  } catch {}

  busCleanup = null;
  modalState.busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionUsuariosCreateModal = {
  open(draft = {}) {
    return openUsuariosCreateModal(draft);
  },

  show(draft = {}) {
    return openUsuariosCreateModal(draft);
  },

  close() {
    return closeUsuariosCreateModal();
  },

  hide() {
    return closeUsuariosCreateModal();
  },

  update(draft = {}) {
    return updateUsuariosCreateModal(draft);
  },

  getState() {
    return {
      isOpen: Boolean(modalState.isOpen),
      submitting: Boolean(modalState.submitting),
      errors: { ...safeObject(modalState.errors) },
      serverError: safeText(modalState.serverError, ""),
      successMessage: safeText(modalState.successMessage, ""),
      createdUserId: safeText(modalState.createdUserId, ""),
      form: {
        ...safeObject(modalState.form),
      },
      bindingsAttached: Boolean(modalState.bindingsAttached),
      busAttached: Boolean(modalState.busAttached),
    };
  },

  destroy() {
    clearSuccessCloseTimer();

    detachRootBindings();

    modalState.submitting = false;
    modalState.isOpen = false;

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
  if (isBrowser()) {
    window.OnionUsuariosCreateModal = OnionUsuariosCreateModal;

    window.renderUsuariosCreateModal = OnionUsuariosCreateModal.open;
    window.renderUsuarioCreateModal = OnionUsuariosCreateModal.open;
    window.openUsuarioCreateModal = OnionUsuariosCreateModal.open;
    window.openUsuariosCreateModal = OnionUsuariosCreateModal.open;
  }
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionUsuariosCreateModal;

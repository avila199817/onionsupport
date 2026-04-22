/* =========================================================
   Onion SPA - Incidencias Create Modal
   Archivo: src/views/incidencias/incidencias.create.modal.js

   INCIDENCIAS EXPERIENCE PRO · CREATE MODAL · ADMIN READY 10/10
========================================================= */

import { AppCore } from "../../core/index.js";
import { incidenciasState } from "./incidencias.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";

const TICKETS_CREATE_ENDPOINT = "/api/tickets";
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE = 260;

const ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "root",
]);

const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetUserName: "",
  targetUserEmail: "",
  subject: "",
  description: "",
  attachments: [],
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
  dragActive: false,

  userSearchQuery: "",
  userSearchResults: [],
  userSearchLoading: false,
  userSearchError: "",
  userSearchDebounce: null,
  userSearchSeq: 0,

  errors: {},
  serverError: "",
  successMessage: "",
  createdTicketId: "",

  form: {
    ...DEFAULT_FORM,
    attachments: [],
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function safeErrorMessage(error = null, fallback = "No se pudo completar la operación.") {
  if (!error) {
    return fallback;
  }

  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      fallback
    ),
    fallback
  );
}

function getFileListFromInput(target) {
  try {
    return Array.from(target?.files || []);
  } catch {
    return [];
  }
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function dedupeFiles(files = []) {
  const input = safeArray(files);
  const map = new Map();

  input.forEach((file) => {
    if (!(file instanceof File)) return;

    const key = [
      safeText(file.name, ""),
      Number(file.size) || 0,
      Number(file.lastModified) || 0,
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) {
      map.set(key, file);
    }
  });

  return Array.from(map.values());
}

/* =========================================================
   PERMISSIONS / TARGET USER
========================================================= */

function normalizeTokenList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => safeText(item, "").toLowerCase())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => safeText(key, "").toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|;]+/g)
      .map((item) => safeText(item, "").toLowerCase())
      .filter(Boolean);
  }

  return [];
}

function getCurrentRole() {
  return safeText(
    first(
      AppCore?.state?.user?.role,
      AppCore?.state?.role,
      AppCore?.auth?.getRole?.(),
      AppCore?.Auth?.getRole?.()
    ),
    ""
  ).toLowerCase();
}

function canSelectTargetUser() {
  const role = getCurrentRole();

  if (ADMIN_ROLE_KEYS.includes(role)) {
    return true;
  }

  const permissions = [
    ...normalizeTokenList(AppCore?.state?.permissions),
    ...normalizeTokenList(AppCore?.state?.user?.permissions),
    ...normalizeTokenList(AppCore?.auth?.getPermissions?.()),
    ...normalizeTokenList(AppCore?.Auth?.getPermissions?.()),
  ];

  return permissions.some((permission) =>
    [
      "admin",
      "users:read",
      "users:search",
      "tickets:create:any",
      "tickets:write:any",
      "incidencias:create:any",
      "incidencias:write:any",
    ].includes(permission)
  );
}

function normalizeUserCandidate(raw = null) {
  const obj = safeObject(raw);
  const nestedUser = safeObject(obj.user);
  const nestedProfile = safeObject(obj.profile);

  const id = safeText(
    first(
      obj.userId,
      obj.id,
      obj.uid,
      obj._id,
      obj.code,
      nestedUser.userId,
      nestedUser.id,
      nestedUser.uid,
      nestedUser._id
    ),
    ""
  );

  if (!id) return null;

  const name = safeText(
    first(
      obj.name,
      obj.fullName,
      obj.displayName,
      obj.username,
      nestedUser.name,
      nestedUser.fullName,
      nestedUser.displayName,
      nestedUser.username,
      nestedProfile.name
    ),
    ""
  );

  const email = safeText(
    first(
      obj.email,
      nestedUser.email,
      nestedProfile.email
    ),
    ""
  );

  const username = safeText(
    first(
      obj.username,
      nestedUser.username
    ),
    ""
  );

  const phone = safeText(
    first(
      obj.phone,
      obj.telefono,
      nestedUser.phone,
      nestedProfile.phone
    ),
    ""
  );

  const role = safeText(
    first(
      obj.role,
      nestedUser.role
    ),
    ""
  );

  const title = safeText(first(name, username, email, `Usuario ${id}`), `Usuario ${id}`);

  return {
    id,
    name: title,
    email,
    username,
    phone,
    role,
  };
}

function dedupeUsers(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const user = normalizeUserCandidate(item);
    if (!user?.id) return;

    if (!map.has(user.id)) {
      map.set(user.id, user);
    }
  });

  return Array.from(map.values());
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getInitialForm() {
  const draft = safeObject(incidenciasState?.createDraft);

  return {
    targetUserId: safeText(first(draft.targetUserId, draft.userId), ""),
    targetUserName: safeText(first(draft.targetUserName, draft.userName), ""),
    targetUserEmail: safeText(first(draft.targetUserEmail, draft.userEmail), ""),
    subject: safeText(draft.subject, ""),
    description: safeText(draft.description, ""),
    attachments: [],
  };
}

function persistDraft() {
  incidenciasState.createDraft = {
    targetUserId: safeText(modalState.form?.targetUserId, ""),
    targetUserName: safeText(modalState.form?.targetUserName, ""),
    targetUserEmail: safeText(modalState.form?.targetUserEmail, ""),
    userId: safeText(modalState.form?.targetUserId, ""),
    userName: safeText(modalState.form?.targetUserName, ""),
    userEmail: safeText(modalState.form?.targetUserEmail, ""),
    subject: safeText(modalState.form?.subject, ""),
    description: safeText(modalState.form?.description, ""),
  };
}

function clearDraft() {
  incidenciasState.createDraft = {
    targetUserId: "",
    targetUserName: "",
    targetUserEmail: "",
    userId: "",
    userName: "",
    userEmail: "",
    subject: "",
    description: "",
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
  modalState.createdTicketId = "";
}

function resetFormState() {
  modalState.form = {
    ...DEFAULT_FORM,
    attachments: [],
  };
}

function clearUserSearchTimer() {
  if (!modalState.userSearchDebounce) return;

  try {
    clearTimeout(modalState.userSearchDebounce);
  } catch {}

  modalState.userSearchDebounce = null;
}

function resetUserSearchState({ preserveQuery = false } = {}) {
  clearUserSearchTimer();

  modalState.userSearchResults = [];
  modalState.userSearchLoading = false;
  modalState.userSearchError = "";
  modalState.userSearchSeq += 1;

  if (!preserveQuery) {
    modalState.userSearchQuery = "";
  }
}

function clearTargetUserSelection() {
  setFormPatch({
    targetUserId: "",
    targetUserName: "",
    targetUserEmail: "",
  });

  if (modalState.errors.targetUserId) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.targetUserId;
    modalState.errors = nextErrors;
  }
}

/* =========================================================
   VALIDATION / PAYLOAD
========================================================= */

function validateForm(form = {}) {
  const current = safeObject(form);
  const errors = {};

  const targetUserId = safeText(current.targetUserId, "");
  const subject = safeText(current.subject, "");
  const description = safeText(current.description, "");

  if (canSelectTargetUser() && !targetUserId) {
    errors.targetUserId = "Selecciona el usuario para el que se va a crear la incidencia.";
  }

  if (!subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (subject.length < 4) {
    errors.subject = "El asunto debe tener al menos 4 caracteres.";
  }

  if (!description) {
    errors.description = "La descripción es obligatoria.";
  } else if (description.length < 12) {
    errors.description = "La descripción debe tener al menos 12 caracteres.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function buildPayload(form = {}) {
  const current = safeObject(form);
  const fd = new FormData();

  fd.append("subject", normalizeWhitespace(current.subject));
  fd.append("description", normalizeWhitespace(current.description));

  if (canSelectTargetUser()) {
    const targetUserId = safeText(current.targetUserId, "");
    if (targetUserId) {
      fd.append("userId", targetUserId);
    }
  }

  safeArray(current.attachments).forEach((file) => {
    if (file instanceof File) {
      fd.append("attachments", file, file.name);
    }
  });

  return fd;
}

/* =========================================================
   CREATE ADAPTERS
========================================================= */

async function createViaAppCoreRequest(payload = null) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(TICKETS_CREATE_ENDPOINT, {
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
    return Http.post(TICKETS_CREATE_ENDPOINT, payload);
  }

  if (typeof Http.request === "function") {
    return Http.request(TICKETS_CREATE_ENDPOINT, {
      method: "POST",
      body: payload,
    });
  }

  throw new Error("HTTP_POST_UNAVAILABLE");
}

async function createViaFetch(payload = null) {
  const apiBase = getApiBase();
  const token = getAuthToken();
  const url = `${apiBase || ""}${TICKETS_CREATE_ENDPOINT}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
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
        "No se pudo enviar la incidencia."
      )
    );
    error.response = data;
    throw error;
  }

  return data;
}

function pickCreatedTicket(response = null) {
  const obj = safeObject(response);

  return obj.ticket || obj.item || obj.data || obj.result || obj.payload || obj;
}

function resolveCreatedTicketId(response = null) {
  const ticket = safeObject(pickCreatedTicket(response));

  return safeText(
    first(ticket.ticketId, ticket.id, ticket.code, ticket.ticketCode),
    ""
  );
}

async function createIncidenciaRequest(payload = null) {
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
   USER SEARCH ADAPTERS
========================================================= */

function buildUserSearchUrls(query = "") {
  const q = encodeURIComponent(safeText(query, ""));
  const limit = USER_SEARCH_LIMIT;

  return [
    `/api/users/search?q=${q}&limit=${limit}`,
    `/api/users/search?search=${q}&limit=${limit}`,
    `/api/users?q=${q}&limit=${limit}`,
    `/api/users?search=${q}&limit=${limit}`,
    `/api/usuarios/search?q=${q}&limit=${limit}`,
    `/api/usuarios/search?search=${q}&limit=${limit}`,
    `/api/usuarios?q=${q}&limit=${limit}`,
    `/api/usuarios?search=${q}&limit=${limit}`,
  ].filter(Boolean);
}

function readUsersCollection(response = null) {
  if (Array.isArray(response)) {
    return {
      recognized: true,
      items: response,
    };
  }

  const obj = safeObject(response);
  const data = safeObject(obj.data);
  const payload = safeObject(obj.payload);
  const result = safeObject(obj.result);

  const candidates = [
    obj.users,
    obj.items,
    obj.results,
    obj.list,
    obj.rows,
    obj.records,

    data.users,
    data.items,
    data.results,
    data.list,
    data.rows,
    data.records,

    payload.users,
    payload.items,
    payload.results,
    payload.list,
    payload.rows,
    payload.records,

    result.users,
    result.items,
    result.results,
    result.list,
    result.rows,
    result.records,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return {
        recognized: true,
        items: candidate,
      };
    }
  }

  return {
    recognized: false,
    items: [],
  };
}

function extractUsersFromSearchResponse(response = null) {
  const collection = readUsersCollection(response);

  if (!collection.recognized) {
    return {
      recognized: false,
      items: [],
    };
  }

  return {
    recognized: true,
    items: dedupeUsers(collection.items).slice(0, USER_SEARCH_LIMIT),
  };
}

async function searchUsersViaAppCore(url = "") {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(url, {
    method: "GET",
  });
}

async function searchUsersViaHttpModule(url = "") {
  const Http = AppCore?.modules?.Http || AppCore?.Http || window?.Http || null;

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  if (typeof Http.get === "function") {
    return Http.get(url);
  }

  if (typeof Http.request === "function") {
    return Http.request(url, {
      method: "GET",
    });
  }

  throw new Error("HTTP_GET_UNAVAILABLE");
}

async function searchUsersViaFetch(url = "") {
  const apiBase = getApiBase();
  const token = getAuthToken();

  const response = await fetch(`${apiBase || ""}${url}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
          `HTTP ${response.status} al buscar usuarios.`
        ),
        "No se pudieron cargar usuarios."
      )
    );
    error.response = data;
    throw error;
  }

  return data;
}

async function searchUsersRequest(query = "") {
  const urls = buildUserSearchUrls(query);
  const adapters = [
    searchUsersViaAppCore,
    searchUsersViaHttpModule,
    searchUsersViaFetch,
  ];

  let lastError = null;

  for (const url of urls) {
    for (const adapter of adapters) {
      try {
        const response = await adapter(url);
        const parsed = extractUsersFromSearchResponse(response);

        if (parsed.recognized) {
          return parsed.items;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

async function performUserSearch(query = "") {
  if (!canSelectTargetUser()) {
    return [];
  }

  const normalized = normalizeWhitespace(query);
  const currentSeq = ++modalState.userSearchSeq;

  if (normalized.length < 2) {
    modalState.userSearchLoading = false;
    modalState.userSearchError = "";
    modalState.userSearchResults = [];

    renderModal();
    attachRootBindings();
    focusUserSearchInput();

    return [];
  }

  modalState.userSearchLoading = true;
  modalState.userSearchError = "";
  modalState.userSearchResults = [];

  renderModal();
  attachRootBindings();
  focusUserSearchInput();

  try {
    const items = await searchUsersRequest(normalized);

    if (currentSeq !== modalState.userSearchSeq) {
      return [];
    }

    modalState.userSearchLoading = false;
    modalState.userSearchError = "";
    modalState.userSearchResults = safeArray(items);

    renderModal();
    attachRootBindings();
    focusUserSearchInput();

    return items;
  } catch (error) {
    if (currentSeq !== modalState.userSearchSeq) {
      return [];
    }

    modalState.userSearchLoading = false;
    modalState.userSearchResults = [];
    modalState.userSearchError = safeErrorMessage(
      error,
      "No se pudieron cargar usuarios."
    );

    renderModal();
    attachRootBindings();
    focusUserSearchInput();

    return [];
  }
}

function scheduleUserSearch(query = "") {
  clearUserSearchTimer();

  const normalized = normalizeWhitespace(query);

  if (normalized.length < 2) {
    modalState.userSearchLoading = false;
    modalState.userSearchError = "";
    modalState.userSearchResults = [];

    renderModal();
    attachRootBindings();
    focusUserSearchInput();

    return;
  }

  modalState.userSearchDebounce = setTimeout(() => {
    performUserSearch(normalized);
  }, USER_SEARCH_DEBOUNCE);
}

/* =========================================================
   TEMPLATE HELPERS
========================================================= */

function renderFieldError(message = "") {
  const text = safeText(message, "");
  if (!text) return "";

  return `<span class="inc-create-error">${escapeHtml(text)}</span>`;
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
    <label class="inc-create-field">
      <span class="inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <input
        class="inc-create-input ${error ? "is-error" : ""}"
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

function renderTextarea({
  label = "",
  name = "",
  value = "",
  placeholder = "",
  required = false,
  error = "",
  rows = 6,
} = {}) {
  return `
    <label class="inc-create-field">
      <span class="inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <textarea
        class="inc-create-textarea ${error ? "is-error" : ""}"
        data-field="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        rows="${Number(rows) || 6}"
        placeholder="${escapeHtml(placeholder)}"
      >${escapeHtml(value)}</textarea>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderFilesSummary(files = []) {
  const items = safeArray(files);

  if (!items.length) {
    return `
      <div class="inc-create-files-empty">
        No has añadido archivos todavía.
      </div>
    `;
  }

  return `
    <div class="inc-create-files-list">
      ${items
        .map(
          (file, index) => `
            <div class="inc-create-file-row">
              <div class="inc-create-file-meta">
                <strong class="inc-create-file-name">
                  ${escapeHtml(safeText(file?.name, `Adjunto ${index + 1}`))}
                </strong>
                <span class="inc-create-file-size">
                  ${escapeHtml(formatFileSize(file?.size))}
                </span>
              </div>

              <button
                type="button"
                data-remove-attachment="${index}"
                class="inc-create-file-remove"
              >
                Quitar
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFileInput({ files = [], dragActive = false } = {}) {
  const items = safeArray(files);
  const countText =
    items.length === 0
      ? "Opcional"
      : items.length === 1
        ? "1 archivo"
        : `${items.length} archivos`;

  return `
    <section class="inc-create-side-card">
      <div class="inc-create-side-head">
        <div class="inc-create-side-head-copy">
          <strong class="inc-create-side-title">Adjuntos</strong>
          <span class="inc-create-side-text">
            Añade capturas, PDFs u otros documentos útiles.
          </span>
        </div>

        <span class="inc-create-side-pill">
          ${escapeHtml(countText)}
        </span>
      </div>

      <label
        data-dropzone="attachments"
        class="inc-create-dropzone ${dragActive ? "is-active" : ""}"
      >
        <input
          id="incidencias-create-attachments-input"
          data-field="attachments"
          name="attachments"
          type="file"
          multiple
          class="inc-create-hidden-input"
        />

        <div class="inc-create-dropzone-copy">
          <strong>Arrastra archivos aquí</strong>
          <span>o pulsa para seleccionarlos</span>
        </div>
      </label>

      ${renderFilesSummary(items)}
    </section>
  `;
}

function renderInfoCard() {
  return `
    <section class="inc-create-side-card inc-create-side-note">
      <strong class="inc-create-side-title">Antes de enviar</strong>

      <div class="inc-create-note-list">
        <span>Se generará una referencia automáticamente.</span>
        <span>Cuanto más claro sea el asunto, mejor.</span>
        <span>Los adjuntos se enviarán junto con la incidencia.</span>
        ${
          canSelectTargetUser()
            ? `<span>Como admin puedes crear incidencias para cualquier usuario existente.</span>`
            : `<span>La incidencia quedará vinculada a tu usuario actual.</span>`
        }
      </div>
    </section>
  `;
}

function renderSelectedUserCard() {
  const form = safeObject(modalState.form);
  const targetUserId = safeText(form.targetUserId, "");

  if (!targetUserId) return "";

  const targetUserName = safeText(form.targetUserName, "Usuario seleccionado");
  const targetUserEmail = safeText(form.targetUserEmail, "");

  return `
    <div class="inc-create-target-user-card">
      <div class="inc-create-target-user-copy">
        <strong class="inc-create-target-user-name">
          ${escapeHtml(targetUserName)}
        </strong>

        <span class="inc-create-target-user-meta">
          ${
            targetUserEmail
              ? `${escapeHtml(targetUserEmail)} · `
              : ""
          }ID ${escapeHtml(targetUserId)}
        </span>
      </div>

      <button
        type="button"
        data-clear-selected-user="true"
        class="inc-create-target-user-clear"
      >
        Cambiar
      </button>
    </div>
  `;
}

function renderUserSearchResults() {
  const query = safeText(modalState.userSearchQuery, "");
  const results = safeArray(modalState.userSearchResults);
  const loading = Boolean(modalState.userSearchLoading);
  const error = safeText(modalState.userSearchError, "");

  if (loading) {
    return `
      <div class="inc-create-search-state">
        Buscando usuarios...
      </div>
    `;
  }

  if (error) {
    return `
      <div class="inc-create-search-state is-error">
        ${escapeHtml(error)}
      </div>
    `;
  }

  if (query.length < 2) {
    return `
      <div class="inc-create-search-state">
        Escribe al menos 2 caracteres para buscar por nombre, email o username.
      </div>
    `;
  }

  if (!results.length) {
    return `
      <div class="inc-create-search-state">
        No hemos encontrado usuarios con ese criterio.
      </div>
    `;
  }

  return `
    <div class="inc-create-search-results">
      ${results
        .map(
          (user, index) => `
            <button
              type="button"
              data-select-target-user="${index}"
              class="inc-create-search-item"
            >
              <div class="inc-create-search-item-copy">
                <strong class="inc-create-search-item-name">
                  ${escapeHtml(safeText(user?.name, `Usuario ${index + 1}`))}
                </strong>

                <span class="inc-create-search-item-meta">
                  ${
                    safeText(user?.email, "")
                      ? `${escapeHtml(user.email)}`
                      : "Sin email"
                  }
                  ${
                    safeText(user?.username, "")
                      ? ` · @${escapeHtml(user.username)}`
                      : ""
                  }
                  ${
                    safeText(user?.phone, "")
                      ? ` · ${escapeHtml(user.phone)}`
                      : ""
                  }
                </span>
              </div>

              <span class="inc-create-search-item-pill">
                ID ${escapeHtml(safeText(user?.id, ""))}
              </span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAdminTargetUserBlock() {
  if (!canSelectTargetUser()) return "";

  const targetUserId = safeText(modalState.form?.targetUserId, "");
  const queryValue = safeText(modalState.userSearchQuery, "");
  const error = safeText(modalState.errors?.targetUserId, "");

  return `
    <section class="inc-create-block">
      <div class="inc-create-block-head">
        <div class="inc-create-block-copy">
          <strong class="inc-create-block-title">Usuario destino</strong>
          <span class="inc-create-block-text">
            Busca un usuario existente y crea la incidencia directamente para él.
          </span>
        </div>
      </div>

      ${targetUserId ? renderSelectedUserCard() : ""}

      <label class="inc-create-field">
        <span class="inc-create-label">Buscar usuario *</span>

        <input
          class="inc-create-input ${error ? "is-error" : ""}"
          data-field="targetUserSearch"
          name="targetUserSearch"
          type="text"
          value="${escapeHtml(queryValue)}"
          placeholder="${
            targetUserId
              ? "Buscar otro usuario..."
              : "Ej. Cristian, cristian@email.com, cavila..."
          }"
          autocomplete="off"
        />

        ${renderFieldError(error)}
      </label>

      ${renderUserSearchResults()}
    </section>
  `;
}

function renderAlert(type = "info", title = "", text = "", extra = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");
  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${escapeHtml(type)}">
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
  const createdTicketId = safeText(modalState.createdTicketId, "");

  return `
    <div
      data-incidencias-create-modal-overlay="true"
      class="inc-create-overlay"
    >
      <div
        id="${PANEL_ID}"
        data-incidencias-create-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencias-create-modal-title"
        tabindex="-1"
        class="inc-create-panel"
      >
        <div class="inc-create-header">
          <div class="inc-create-header-copy">
            <div class="inc-create-header-text">
              <h2 id="incidencias-create-modal-title">
                Crear incidencia
              </h2>

              <p>
                Registra una nueva incidencia con el mismo nivel visual del sistema pro.
                ${
                  canSelectTargetUser()
                    ? " Como admin puedes localizar cualquier usuario y abrirla directamente para él."
                    : " Añade toda la información necesaria para que soporte pueda actuar rápido."
                }
              </p>
            </div>
          </div>

          <button
            type="button"
            data-modal-close="true"
            aria-label="Cerrar modal"
            ${submitting ? "disabled" : ""}
            class="inc-create-close"
          >
            ✕
          </button>
        </div>

        <div class="inc-create-body">
          ${
            successMessage
              ? renderAlert(
                  "success",
                  "La incidencia se ha creado correctamente.",
                  createdTicketId ? `Referencia generada: ${createdTicketId}` : ""
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo crear la incidencia",
                  serverError
                )
              : ""
          }

          <form id="incidencias-create-form" novalidate class="inc-create-form">
            <div class="inc-create-main">
              ${renderAdminTargetUserBlock()}

              ${renderInput({
                label: "Asunto",
                name: "subject",
                value: form.subject,
                placeholder: "Ej. Error al pagar, acceso bloqueado, incidencia en factura...",
                required: true,
                error: errors.subject,
              })}

              ${renderTextarea({
                label: "Descripción",
                name: "description",
                value: form.description,
                placeholder:
                  "Describe qué está ocurriendo, desde cuándo pasa, a qué usuario afecta y qué pruebas o pasos previos ya se han hecho.",
                required: true,
                error: errors.description,
                rows: 8,
              })}

              <div class="inc-create-inline-grid">
                ${renderFileInput({
                  files: safeArray(form.attachments),
                  dragActive: Boolean(modalState.dragActive),
                })}

                ${renderInfoCard()}
              </div>
            </div>

            <div class="inc-create-actions">
              <button
                id="incidencias-create-submit-btn"
                type="submit"
                ${submitting ? "disabled" : ""}
                class="inc-create-submit"
              >
                ${
                  submitting
                    ? `
                      <span class="inc-create-submit-inner">
                        <span class="inc-create-spinner" aria-hidden="true"></span>
                        Creando...
                      </span>
                    `
                    : "Crear incidencia"
                }
              </button>
            </div>
          </form>
        </div>

        <style>
          @keyframes incidenciasCreateSpin {
            to { transform: rotate(360deg); }
          }

          .inc-create-overlay{
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

          .inc-create-panel{
            position:relative;
            width:min(1180px, 100%);
            max-height:90vh;
            overflow:auto;
            border-radius:24px;
            border:1px solid var(--border-soft, #2b2b2b);
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
            box-shadow:0 34px 84px rgba(0,0,0,.42);
          }

          .inc-create-header{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:14px;
            padding:18px 18px 14px;
            border-bottom:1px solid var(--border-soft);
          }

          .inc-create-header-copy{
            display:grid;
            gap:10px;
            min-width:0;
            flex:1 1 auto;
          }

          .inc-create-header-text{
            display:grid;
            gap:6px;
          }

          .inc-create-header-text h2{
            margin:0;
            color:var(--text-strong);
            font-size:clamp(24px, 3.6vw, 34px);
            line-height:1;
            letter-spacing:-.045em;
          }

          .inc-create-header-text p{
            margin:0;
            max-width:900px;
            color:var(--text-dim);
            font-size:13px;
            line-height:1.55;
          }

          .inc-create-close{
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

          .inc-create-close:disabled{
            opacity:.7;
            cursor:not-allowed;
          }

          .inc-create-body{
            padding:16px 18px 18px;
            display:grid;
            gap:14px;
          }

          .inc-create-alert{
            display:grid;
            gap:4px;
            padding:12px 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
          }

          .inc-create-alert strong{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
          }

          .inc-create-alert span{
            color:var(--text-dim);
            font-size:12px;
            line-height:1.5;
          }

          .inc-create-alert.is-success{
            border-color:color-mix(in srgb, var(--success-strong, #36c690) 28%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 10%, transparent), transparent 85%),
              var(--surface-1, var(--surface-glass));
          }

          .inc-create-alert.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 28%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 85%),
              var(--surface-1, var(--surface-glass));
          }

          .inc-create-form{
            display:grid;
            gap:14px;
          }

          .inc-create-main{
            display:grid;
            gap:14px;
            min-width:0;
          }

          .inc-create-inline-grid{
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:14px;
            align-items:start;
          }

          .inc-create-block{
            display:grid;
            gap:12px;
            padding:14px;
            border-radius:18px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
          }

          .inc-create-block-head{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:12px;
          }

          .inc-create-block-copy{
            display:grid;
            gap:4px;
          }

          .inc-create-block-title{
            color:var(--text-strong);
            font-size:14px;
            line-height:1.3;
          }

          .inc-create-block-text{
            color:var(--text-dim);
            font-size:12px;
            line-height:1.45;
          }

          .inc-create-target-user-card{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            padding:12px 14px;
            border-radius:14px;
            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 120%),
              var(--surface-glass);
          }

          .inc-create-target-user-copy{
            display:grid;
            gap:4px;
            min-width:0;
          }

          .inc-create-target-user-name{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-target-user-meta{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.4;
            word-break:break-word;
          }

          .inc-create-target-user-clear{
            min-height:34px;
            padding:0 12px;
            border-radius:10px;
            border:1px solid var(--border-soft);
            background:transparent;
            color:var(--text-dim);
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            flex:0 0 auto;
          }

          .inc-create-field{
            display:grid;
            gap:8px;
            min-width:0;
          }

          .inc-create-label{
            color:var(--text-soft);
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.05em;
            text-transform:uppercase;
          }

          .inc-create-input,
          .inc-create-textarea{
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

          .inc-create-input{
            min-height:46px;
            padding:0 14px;
            border-radius:14px;
            font-size:14px;
          }

          .inc-create-textarea{
            min-height:188px;
            padding:12px 14px;
            border-radius:16px;
            resize:vertical;
            line-height:1.55;
            font-size:13px;
          }

          .inc-create-input::placeholder,
          .inc-create-textarea::placeholder{
            color:var(--text-faint);
          }

          .inc-create-input:focus,
          .inc-create-textarea:focus{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 30%, var(--border-soft));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          }

          .inc-create-input.is-error,
          .inc-create-textarea.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 38%, var(--border-soft));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent);
          }

          .inc-create-error{
            color:var(--danger-strong, #ff6b6b);
            font-size:11px;
            line-height:1.35;
            font-weight:var(--weight-semibold, 600);
          }

          .inc-create-search-state{
            display:grid;
            gap:4px;
            padding:12px 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-dim);
            font-size:12px;
            line-height:1.45;
          }

          .inc-create-search-state.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 28%, var(--border-soft));
            color:var(--danger-strong, #ff6b6b);
          }

          .inc-create-search-results{
            display:grid;
            gap:8px;
          }

          .inc-create-search-item{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:12px;
            width:100%;
            padding:12px 14px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            text-align:left;
            cursor:pointer;
            transition:
              border-color .18s ease,
              transform .18s ease,
              background .18s ease;
          }

          .inc-create-search-item:hover{
            transform:translateY(-1px);
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          }

          .inc-create-search-item-copy{
            display:grid;
            gap:4px;
            min-width:0;
          }

          .inc-create-search-item-name{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-search-item-meta{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
            word-break:break-word;
          }

          .inc-create-search-item-pill{
            display:inline-flex;
            align-items:center;
            min-height:24px;
            padding:0 8px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:transparent;
            color:var(--text-dim);
            font-size:10px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.04em;
            text-transform:uppercase;
            white-space:nowrap;
          }

          .inc-create-side-card{
            display:grid;
            gap:10px;
            padding:14px;
            border-radius:16px;
            border:1px solid var(--border-soft);
            background:var(--surface-1, var(--surface-glass));
            min-width:0;
          }

          .inc-create-side-head{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:10px;
          }

          .inc-create-side-head-copy{
            display:grid;
            gap:4px;
            min-width:0;
          }

          .inc-create-side-title{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.3;
          }

          .inc-create-side-text{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-side-pill{
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

          .inc-create-dropzone{
            display:grid;
            gap:8px;
            min-height:118px;
            align-content:center;
            padding:14px;
            border-radius:14px;
            border:1px dashed var(--border-soft);
            background:transparent;
            cursor:pointer;
            transition:
              border-color .18s ease,
              background .18s ease,
              transform .18s ease;
          }

          .inc-create-dropzone.is-active{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 32%, var(--border-soft));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent),
              var(--surface-glass);
          }

          .inc-create-dropzone-copy{
            display:grid;
            gap:4px;
          }

          .inc-create-dropzone-copy strong{
            color:var(--text-strong);
            font-size:13px;
            line-height:1.35;
          }

          .inc-create-dropzone-copy span{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-hidden-input{
            display:none;
          }

          .inc-create-files-empty{
            color:var(--text-dim);
            font-size:12px;
            line-height:1.45;
          }

          .inc-create-files-list{
            display:grid;
            gap:8px;
          }

          .inc-create-file-row{
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            padding:10px 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
          }

          .inc-create-file-meta{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .inc-create-file-name{
            color:var(--text-strong);
            font-size:12px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-file-size{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.3;
          }

          .inc-create-file-remove{
            min-height:32px;
            padding:0 10px;
            border-radius:10px;
            border:1px solid var(--border-soft);
            background:transparent;
            color:var(--text-dim);
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            flex:0 0 auto;
          }

          .inc-create-side-note{
            gap:8px;
          }

          .inc-create-note-list{
            display:grid;
            gap:6px;
          }

          .inc-create-note-list span{
            color:var(--text-dim);
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-actions{
            display:flex;
            justify-content:flex-end;
            gap:12px;
            padding-top:8px;
          }

          .inc-create-submit{
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

          .inc-create-submit:disabled{
            opacity:.8;
            cursor:wait;
          }

          .inc-create-submit-inner{
            display:inline-flex;
            align-items:center;
            gap:8px;
          }

          .inc-create-spinner{
            width:14px;
            height:14px;
            border-radius:999px;
            border:2px solid rgba(255,255,255,.28);
            border-top-color:#fff;
            animation:incidenciasCreateSpin .8s linear infinite;
          }

          [data-theme="light"] .inc-create-panel{
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,255,.94));
            box-shadow:
              0 28px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.65) inset;
          }

          [data-theme="light"] .inc-create-block,
          [data-theme="light"] .inc-create-side-card,
          [data-theme="light"] .inc-create-alert,
          [data-theme="light"] .inc-create-input,
          [data-theme="light"] .inc-create-textarea,
          [data-theme="light"] .inc-create-file-row,
          [data-theme="light"] .inc-create-search-item,
          [data-theme="light"] .inc-create-target-user-card,
          [data-theme="light"] .inc-create-search-state{
            box-shadow:0 6px 16px rgba(15,23,42,.04);
          }

          @media (max-width: 920px){
            .inc-create-inline-grid{
              grid-template-columns:1fr;
            }
          }

          @media (max-width: 640px){
            .inc-create-overlay{
              padding:10px;
            }

            .inc-create-panel{
              width:100%;
              max-height:94vh;
              border-radius:18px;
            }

            .inc-create-header{
              padding:14px 14px 12px;
            }

            .inc-create-body{
              padding:14px;
            }

            .inc-create-header-text h2{
              font-size:28px;
            }

            .inc-create-textarea{
              min-height:156px;
            }

            .inc-create-target-user-card,
            .inc-create-search-item,
            .inc-create-file-row{
              flex-direction:column;
              align-items:flex-start;
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

function focusField(fieldName = "") {
  try {
    const root = getRoot();
    const field = root?.querySelector?.(`[data-field="${fieldName}"]`);
    field?.focus?.();
    return Boolean(field);
  } catch {
    return false;
  }
}

function focusUserSearchInput() {
  if (!canSelectTargetUser()) return false;
  return focusField("targetUserSearch");
}

function focusPreferredField() {
  if (canSelectTargetUser() && !safeText(modalState.form?.targetUserId, "")) {
    if (focusUserSearchInput()) return true;
  }

  if (!safeText(modalState.form?.subject, "")) {
    if (focusField("subject")) return true;
  }

  if (focusField("description")) return true;

  focusPanel();
  return true;
}

/* =========================================================
   OPEN / CLOSE / UPDATE
========================================================= */

export function openIncidenciasCreateModal(draft = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.isOpen = true;
  modalState.submitting = false;
  modalState.dragActive = false;

  resetFeedbackState();
  resetUserSearchState();

  modalState.form = {
    ...getInitialForm(),
    ...safeObject(draft),
    attachments: [],
  };

  persistDraft();

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPreferredField();

  safeEmit("incidencias:create-modal:opened", {
    draft: {
      targetUserId: modalState.form.targetUserId,
      targetUserName: modalState.form.targetUserName,
      targetUserEmail: modalState.form.targetUserEmail,
      subject: modalState.form.subject,
      description: modalState.form.description,
    },
    adminMode: canSelectTargetUser(),
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
  modalState.dragActive = false;

  resetFeedbackState();
  resetFormState();
  resetUserSearchState();

  detachRootBindings();

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
    attachments: safeArray(modalState.form.attachments),
  };

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

  modalState.successMessage = "";
  modalState.createdTicketId = "";
  modalState.serverError = "";

  const validation = validateForm(modalState.form);
  modalState.errors = validation.errors;

  if (!validation.valid) {
    renderModal();
    attachRootBindings();
    focusPreferredField();
    showToast("Revisa los campos obligatorios.", "warning");
    return false;
  }

  const payload = buildPayload(modalState.form);

  modalState.submitting = true;
  renderModal();
  attachRootBindings();
  focusPanel();

  safeEmit("incidencias:create:submit", {
    userId: safeText(modalState.form.targetUserId, ""),
    userName: safeText(modalState.form.targetUserName, ""),
    subject: safeText(modalState.form.subject, ""),
    description: safeText(modalState.form.description, ""),
    attachmentsCount: safeArray(modalState.form.attachments).length,
    adminMode: canSelectTargetUser(),
  });

  try {
    const response = await createIncidenciaRequest(payload);
    const createdTicketId = resolveCreatedTicketId(response);
    const detail = pickCreatedTicket(response);

    modalState.submitting = false;
    modalState.errors = {};
    modalState.serverError = "";
    modalState.successMessage = "La incidencia se ha creado correctamente.";
    modalState.createdTicketId = createdTicketId;

    clearDraft();
    resetFormState();
    resetUserSearchState();

    renderModal();
    attachRootBindings();
    focusPanel();

    showToast("Incidencia creada correctamente.", "success");

    safeEmit("incidencias:create:success", {
      ticketId: createdTicketId,
      response,
      detail,
    });

    setTimeout(() => {
      closeIncidenciasCreateModal();
    }, 450);

    return true;
  } catch (error) {
    modalState.submitting = false;
    modalState.serverError = safeErrorMessage(
      error,
      "No se pudo crear la incidencia."
    );

    safeEmit("incidencias:create:error", {
      error,
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

function addAttachments(files = []) {
  const merged = dedupeFiles([
    ...safeArray(modalState.form.attachments),
    ...safeArray(files),
  ]);

  setFormPatch({
    attachments: merged,
  });

  if (modalState.errors.attachments) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.attachments;
    modalState.errors = nextErrors;
  }

  modalState.serverError = "";
  modalState.successMessage = "";
  modalState.createdTicketId = "";
}

function handleTargetUserSearchInput(target) {
  const value = safeText(target?.value, "");

  modalState.userSearchQuery = value;

  if (safeText(modalState.form?.targetUserId, "")) {
    clearTargetUserSelection();
  }

  if (modalState.errors.targetUserId) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.targetUserId;
    modalState.errors = nextErrors;
  }

  if (modalState.serverError) {
    modalState.serverError = "";
  }

  if (modalState.successMessage || modalState.createdTicketId) {
    modalState.successMessage = "";
    modalState.createdTicketId = "";
  }

  scheduleUserSearch(value);
}

function handleFieldChange(target) {
  const field = safeText(target?.dataset?.field, "");
  if (!field) return;

  if (field === "attachments") {
    const files = getFileListFromInput(target);
    addAttachments(files);
  } else {
    setFormPatch({
      [field]: target?.value,
    });
  }

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

  if (field === "attachments") {
    renderModal();
    attachRootBindings();
    focusPreferredField();
  }
}

function selectTargetUserByIndex(index = -1) {
  const user = safeArray(modalState.userSearchResults)[Number(index)];

  if (!user?.id) return false;

  setFormPatch({
    targetUserId: safeText(user.id, ""),
    targetUserName: safeText(user.name, ""),
    targetUserEmail: safeText(user.email, ""),
  });

  modalState.userSearchQuery = "";
  modalState.userSearchResults = [];
  modalState.userSearchLoading = false;
  modalState.userSearchError = "";

  if (modalState.errors.targetUserId) {
    const nextErrors = { ...modalState.errors };
    delete nextErrors.targetUserId;
    modalState.errors = nextErrors;
  }

  renderModal();
  attachRootBindings();
  focusField("subject");

  return true;
}

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onInput = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.field, "");

    if (fieldName === "targetUserSearch") {
      handleTargetUserSearchInput(field);
      return;
    }

    if (field.type === "file") return;

    handleFieldChange(field);
  };

  const onChange = (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    const fieldName = safeText(field.dataset.field, "");

    if (fieldName === "targetUserSearch") {
      handleTargetUserSearchInput(field);
      return;
    }

    handleFieldChange(field);
  };

  const onSubmit = async (event) => {
    const form = event.target.closest("#incidencias-create-form");
    if (!form) return;

    event.preventDefault();
    await handleSubmit();
  };

  const onDragEnter = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    event.preventDefault();
    modalState.dragActive = true;
    renderModal();
    attachRootBindings();
  };

  const onDragOver = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    event.preventDefault();

    if (!modalState.dragActive) {
      modalState.dragActive = true;
      renderModal();
      attachRootBindings();
    }
  };

  const onDragLeave = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    const related = event.relatedTarget;
    if (related && dropzone.contains(related)) {
      return;
    }

    event.preventDefault();
    modalState.dragActive = false;
    renderModal();
    attachRootBindings();
  };

  const onDrop = (event) => {
    const dropzone = event.target.closest("[data-dropzone='attachments']");
    if (!dropzone) return;

    event.preventDefault();
    modalState.dragActive = false;

    const files = Array.from(event.dataTransfer?.files || []);
    addAttachments(files);

    renderModal();
    attachRootBindings();
    focusPreferredField();
  };

  const onClick = (event) => {
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

    const removeAttachmentBtn = event.target.closest("[data-remove-attachment]");
    if (removeAttachmentBtn) {
      event.preventDefault();

      const index = Number(removeAttachmentBtn.dataset.removeAttachment);
      const files = safeArray(modalState.form.attachments).filter((_, i) => i !== index);

      setFormPatch({
        attachments: files,
      });

      renderModal();
      attachRootBindings();
      focusPreferredField();
      return;
    }

    const selectUserBtn = event.target.closest("[data-select-target-user]");
    if (selectUserBtn) {
      event.preventDefault();
      selectTargetUserByIndex(selectUserBtn.dataset.selectTargetUser);
      return;
    }

    const clearUserBtn = event.target.closest("[data-clear-selected-user='true']");
    if (clearUserBtn) {
      event.preventDefault();

      clearTargetUserSelection();
      modalState.userSearchQuery = "";
      modalState.userSearchResults = [];
      modalState.userSearchLoading = false;
      modalState.userSearchError = "";

      renderModal();
      attachRootBindings();
      focusUserSearchInput();
    }
  };

  root.__incidenciasCreateModalInputHandler = onInput;
  root.__incidenciasCreateModalChangeHandler = onChange;
  root.__incidenciasCreateModalSubmitHandler = onSubmit;
  root.__incidenciasCreateModalDragEnterHandler = onDragEnter;
  root.__incidenciasCreateModalDragOverHandler = onDragOver;
  root.__incidenciasCreateModalDragLeaveHandler = onDragLeave;
  root.__incidenciasCreateModalDropHandler = onDrop;
  root.__incidenciasCreateModalClickHandler = onClick;

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("dragenter", onDragEnter);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("drop", onDrop);
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) {
    modalState.bindingsAttached = false;
    return;
  }

  if (root.__incidenciasCreateModalInputHandler) {
    try {
      root.removeEventListener("input", root.__incidenciasCreateModalInputHandler);
    } catch {}
    delete root.__incidenciasCreateModalInputHandler;
  }

  if (root.__incidenciasCreateModalChangeHandler) {
    try {
      root.removeEventListener("change", root.__incidenciasCreateModalChangeHandler);
    } catch {}
    delete root.__incidenciasCreateModalChangeHandler;
  }

  if (root.__incidenciasCreateModalSubmitHandler) {
    try {
      root.removeEventListener("submit", root.__incidenciasCreateModalSubmitHandler);
    } catch {}
    delete root.__incidenciasCreateModalSubmitHandler;
  }

  if (root.__incidenciasCreateModalDragEnterHandler) {
    try {
      root.removeEventListener("dragenter", root.__incidenciasCreateModalDragEnterHandler);
    } catch {}
    delete root.__incidenciasCreateModalDragEnterHandler;
  }

  if (root.__incidenciasCreateModalDragOverHandler) {
    try {
      root.removeEventListener("dragover", root.__incidenciasCreateModalDragOverHandler);
    } catch {}
    delete root.__incidenciasCreateModalDragOverHandler;
  }

  if (root.__incidenciasCreateModalDragLeaveHandler) {
    try {
      root.removeEventListener("dragleave", root.__incidenciasCreateModalDragLeaveHandler);
    } catch {}
    delete root.__incidenciasCreateModalDragLeaveHandler;
  }

  if (root.__incidenciasCreateModalDropHandler) {
    try {
      root.removeEventListener("drop", root.__incidenciasCreateModalDropHandler);
    } catch {}
    delete root.__incidenciasCreateModalDropHandler;
  }

  if (root.__incidenciasCreateModalClickHandler) {
    try {
      root.removeEventListener("click", root.__incidenciasCreateModalClickHandler);
    } catch {}
    delete root.__incidenciasCreateModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const draft = event?.detail?.draft || event?.detail || event || {};
  openIncidenciasCreateModal(safeObject(draft));
}

function handleCloseEvent() {
  closeIncidenciasCreateModal();
}

function handleUpdateEvent(event) {
  const draft = event?.detail?.draft || event?.detail || event || {};
  updateIncidenciasCreateModal(safeObject(draft));
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("incidencias:create-modal:open", handleOpenEvent);
  safeOn("incidencias:create-modal:close", handleCloseEvent);
  safeOn("incidencias:create-modal:update", handleUpdateEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("incidencias:create-modal:open", handleOpenEvent);
  safeOff("incidencias:create-modal:close", handleCloseEvent);
  safeOff("incidencias:create-modal:update", handleUpdateEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionIncidenciasCreateModal = {
  open(draft = {}) {
    return openIncidenciasCreateModal(draft);
  },

  close() {
    return closeIncidenciasCreateModal();
  },

  update(draft = {}) {
    return updateIncidenciasCreateModal(draft);
  },

  getState() {
    return {
      ...modalState,
      errors: { ...safeObject(modalState.errors) },
      userSearchResults: [...safeArray(modalState.userSearchResults)],
      form: {
        ...safeObject(modalState.form),
        attachments: [...safeArray(modalState.form.attachments)],
      },
    };
  },

  destroy() {
    detachRootBindings();
    closeIncidenciasCreateModal();
    detachEscHandler();
    detachBus();
    clearUserSearchTimer();

    const root = getRoot();
    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionIncidenciasCreateModal = OnionIncidenciasCreateModal;
  window.renderIncidenciasCreateModal = OnionIncidenciasCreateModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasCreateModal;

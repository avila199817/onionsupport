/* =========================================================
   Onion SPA - Incidencias Create Modal
   Archivo: src/views/incidencias/incidencias.create.modal.js

   INCIDENCIAS EXPERIENCE PRO · CREATE MODAL · CLEAN ADMIN 10/10
========================================================= */

import { AppCore } from "../../core/index.js";
import { incidenciasState } from "./incidencias.state.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";

const TICKETS_CREATE_ENDPOINT = "/api/tickets";
const USER_SEARCH_ENDPOINT = "/api/search/users";

const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE = 240;

const ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "root",
  "owner",
]);

const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetUserName: "",
  targetUserEmail: "",
  subject: "",
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

function buildFetchUrl(endpoint = "") {
  const apiBase = getApiBase();
  const path = safeText(endpoint, "");

  if (!apiBase) {
    return path;
  }

  /*
    Si AppCore.config.apiBase ya termina en /api y el endpoint empieza por /api,
    evitamos URLs tipo /api/api/search/users en fetch directo.
  */
  if (apiBase.endsWith("/api") && path.startsWith("/api/")) {
    return `${apiBase}${path.slice(4)}`;
  }

  return `${apiBase}${path}`;
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
      nestedUser.username,
      nestedProfile.username
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
      obj.rol,
      nestedUser.role,
      nestedUser.rol
    ),
    ""
  );

  const name = safeText(
    first(
      obj.name,
      obj.fullName,
      obj.displayName,
      nestedUser.name,
      nestedUser.fullName,
      nestedUser.displayName,
      nestedProfile.name,
      username,
      email,
      obj.label,
      `Usuario ${id}`
    ),
    `Usuario ${id}`
  );

  const label = safeText(
    first(
      obj.label,
      `${name}${email ? ` · ${email}` : ""}`
    ),
    name
  );

  const subtitle = safeText(
    first(
      obj.subtitle,
      email,
      username ? `@${username}` : "",
      phone
    ),
    ""
  );

  return {
    id,
    userId: id,
    name,
    email,
    username,
    phone,
    role,
    label,
    subtitle,
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
  const subject = normalizeWhitespace(current.subject);

  if (canSelectTargetUser() && !targetUserId) {
    errors.targetUserId = "Selecciona un usuario.";
  }

  if (!subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (subject.length < 4) {
    errors.subject = "Mínimo 4 caracteres.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function buildAutoDescription(form = {}) {
  const subject = normalizeWhitespace(form?.subject);

  return normalizeWhitespace(
    `Incidencia creada desde el panel admin. Asunto: ${subject}`
  );
}

function buildPayload(form = {}) {
  const current = safeObject(form);
  const fd = new FormData();

  const subject = normalizeWhitespace(current.subject);
  const description = buildAutoDescription(current);

  fd.append("subject", subject);
  fd.append("description", description);

  if (canSelectTargetUser()) {
    const targetUserId = safeText(current.targetUserId, "");
    if (targetUserId) {
      fd.append("userId", targetUserId);
      fd.append("targetUserId", targetUserId);
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
  const token = getAuthToken();
  const url = buildFetchUrl(TICKETS_CREATE_ENDPOINT);

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
  const params = new URLSearchParams();

  params.set("q", safeText(query, ""));
  params.set("mode", "incidencias");
  params.set("limit", String(USER_SEARCH_LIMIT));

  /*
    Endpoint correcto:
    - /api/search/users si tu servidor monta la API completa en /api.
    - /search/users como fallback si AppCore.config.apiBase ya incluye /api.
  */
  return [
    `${USER_SEARCH_ENDPOINT}?${params.toString()}`,
    `/search/users?${params.toString()}`,
  ];
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
  const token = getAuthToken();
  const finalUrl = buildFetchUrl(url);

  const response = await fetch(finalUrl, {
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

function renderFilesSummary(files = []) {
  const items = safeArray(files);

  if (!items.length) return "";

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
    <section class="inc-create-files-card">
      <div class="inc-create-files-head">
        <strong>Adjuntos</strong>
        <span>${escapeHtml(countText)}</span>
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
          <strong>Arrastra o pulsa</strong>
          <span>Capturas, PDF o documentos.</span>
        </div>
      </label>

      ${renderFilesSummary(items)}
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
        <strong>${escapeHtml(targetUserName)}</strong>
        <span>
          ${
            targetUserEmail
              ? escapeHtml(targetUserEmail)
              : `ID ${escapeHtml(targetUserId)}`
          }
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

  if (!query) return "";

  if (loading) {
    return `
      <div class="inc-create-search-state">
        Buscando...
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
        Mínimo 2 caracteres.
      </div>
    `;
  }

  if (!results.length) {
    return `
      <div class="inc-create-search-state">
        Sin resultados.
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
                <strong>
                  ${escapeHtml(safeText(user?.name, `Usuario ${index + 1}`))}
                </strong>

                <span>
                  ${escapeHtml(
                    safeText(
                      first(
                        user?.subtitle,
                        user?.email,
                        user?.username ? `@${user.username}` : "",
                        user?.phone,
                        user?.id
                      ),
                      "Sin datos secundarios"
                    )
                  )}
                </span>
              </div>
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
      <div class="inc-create-mini-title">
        Usuario
      </div>

      ${targetUserId ? renderSelectedUserCard() : ""}

      <label class="inc-create-field">
        <input
          class="inc-create-input ${error ? "is-error" : ""}"
          data-field="targetUserSearch"
          name="targetUserSearch"
          type="text"
          value="${escapeHtml(queryValue)}"
          placeholder="${
            targetUserId
              ? "Buscar otro usuario..."
              : "Buscar por nombre, email, username, teléfono..."
          }"
          autocomplete="off"
        />

        ${renderFieldError(error)}
      </label>

      ${renderUserSearchResults()}
    </section>
  `;
}

function renderAlert(type = "info", title = "", text = "") {
  const safeTitle = safeText(title, "");
  const safeBody = safeText(text, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${escapeHtml(type)}">
      ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
      ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
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
            <h2 id="incidencias-create-modal-title">
              Crear incidencia
            </h2>
            <p>Usuario, asunto, adjuntos y enviar.</p>
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
                  "Incidencia creada.",
                  createdTicketId ? `Referencia: ${createdTicketId}` : ""
                )
              : ""
          }

          ${
            serverError
              ? renderAlert(
                  "error",
                  "No se pudo crear la incidencia.",
                  serverError
                )
              : ""
          }

          <form id="incidencias-create-form" novalidate class="inc-create-form">
            ${renderAdminTargetUserBlock()}

            ${renderInput({
              label: "Asunto",
              name: "subject",
              value: form.subject,
              placeholder: "Ej. Error al pagar, acceso bloqueado, factura incorrecta...",
              required: true,
              error: errors.subject,
            })}

            ${renderFileInput({
              files: safeArray(form.attachments),
              dragActive: Boolean(modalState.dragActive),
            })}

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
            display:grid;
            place-items:center;
            padding:16px;
            background:rgba(0,0,0,.62);
            backdrop-filter:blur(10px);
            -webkit-backdrop-filter:blur(10px);
          }

          .inc-create-panel{
            width:min(760px, 100%);
            max-height:92vh;
            overflow:auto;
            border-radius:22px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
              linear-gradient(180deg, var(--surface-2, #171717), var(--surface-1, #111));
            box-shadow:0 34px 84px rgba(0,0,0,.45);
          }

          .inc-create-header{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:14px;
            padding:18px 18px 14px;
            border-bottom:1px solid var(--border-soft, rgba(255,255,255,.10));
          }

          .inc-create-header-copy{
            display:grid;
            gap:5px;
            min-width:0;
          }

          .inc-create-header-copy h2{
            margin:0;
            color:var(--text-strong, #fff);
            font-size:clamp(24px, 3.6vw, 32px);
            line-height:1;
            letter-spacing:-.045em;
          }

          .inc-create-header-copy p{
            margin:0;
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            line-height:1.45;
          }

          .inc-create-close{
            width:40px;
            height:40px;
            flex:0 0 auto;
            border-radius:14px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            color:var(--text-strong, #fff);
            cursor:pointer;
            font-size:17px;
          }

          .inc-create-close:disabled{
            opacity:.7;
            cursor:not-allowed;
          }

          .inc-create-body{
            display:grid;
            gap:14px;
            padding:16px 18px 18px;
          }

          .inc-create-alert{
            display:grid;
            gap:4px;
            padding:11px 13px;
            border-radius:14px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
          }

          .inc-create-alert strong{
            color:var(--text-strong, #fff);
            font-size:13px;
            line-height:1.35;
          }

          .inc-create-alert span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            line-height:1.45;
          }

          .inc-create-alert.is-success{
            border-color:color-mix(in srgb, var(--success-strong, #36c690) 30%, var(--border-soft, rgba(255,255,255,.12)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--success-strong, #36c690) 11%, transparent), transparent 90%),
              var(--surface-glass, rgba(255,255,255,.05));
          }

          .inc-create-alert.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 34%, var(--border-soft, rgba(255,255,255,.12)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 11%, transparent), transparent 90%),
              var(--surface-glass, rgba(255,255,255,.05));
          }

          .inc-create-form{
            display:grid;
            gap:14px;
          }

          .inc-create-block,
          .inc-create-files-card{
            display:grid;
            gap:10px;
            padding:13px;
            border-radius:17px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-1, rgba(255,255,255,.04));
          }

          .inc-create-mini-title{
            color:var(--text-soft, rgba(255,255,255,.74));
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.05em;
            text-transform:uppercase;
          }

          .inc-create-field{
            display:grid;
            gap:7px;
            min-width:0;
          }

          .inc-create-label{
            color:var(--text-soft, rgba(255,255,255,.74));
            font-size:11px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.05em;
            text-transform:uppercase;
          }

          .inc-create-input{
            width:100%;
            min-height:46px;
            padding:0 14px;
            border-radius:14px;
            outline:none;
            color:var(--text-strong, #fff);
            background:var(--surface-1, rgba(255,255,255,.04));
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            font-size:14px;
            transition:
              border-color .18s ease,
              box-shadow .18s ease,
              background .18s ease;
          }

          .inc-create-input::placeholder{
            color:var(--text-faint, rgba(255,255,255,.36));
          }

          .inc-create-input:focus{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 34%, var(--border-soft, rgba(255,255,255,.12)));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
          }

          .inc-create-input.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 42%, var(--border-soft, rgba(255,255,255,.12)));
            box-shadow:0 0 0 4px color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent);
          }

          .inc-create-error{
            color:var(--danger-strong, #ff6b6b);
            font-size:11px;
            line-height:1.35;
            font-weight:var(--weight-semibold, 600);
          }

          .inc-create-target-user-card{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            padding:11px 13px;
            border-radius:14px;
            border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, var(--border-soft, rgba(255,255,255,.12)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 120%),
              var(--surface-glass, rgba(255,255,255,.05));
          }

          .inc-create-target-user-copy{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .inc-create-target-user-copy strong{
            color:var(--text-strong, #fff);
            font-size:13px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-target-user-copy span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-target-user-clear{
            min-height:32px;
            padding:0 11px;
            border-radius:10px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:transparent;
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            flex:0 0 auto;
          }

          .inc-create-search-state{
            padding:10px 12px;
            border-radius:13px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            line-height:1.4;
          }

          .inc-create-search-state.is-error{
            border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 30%, var(--border-soft, rgba(255,255,255,.12)));
            color:var(--danger-strong, #ff6b6b);
          }

          .inc-create-search-results{
            display:grid;
            gap:7px;
          }

          .inc-create-search-item{
            display:flex;
            width:100%;
            padding:11px 13px;
            border-radius:13px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            text-align:left;
            cursor:pointer;
            transition:
              border-color .18s ease,
              transform .18s ease,
              background .18s ease;
          }

          .inc-create-search-item:hover{
            transform:translateY(-1px);
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft, rgba(255,255,255,.12)));
          }

          .inc-create-search-item-copy{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .inc-create-search-item-copy strong{
            color:var(--text-strong, #fff);
            font-size:13px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-search-item-copy span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            line-height:1.4;
            word-break:break-word;
          }

          .inc-create-files-head{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
          }

          .inc-create-files-head strong{
            color:var(--text-strong, #fff);
            font-size:13px;
            line-height:1.3;
          }

          .inc-create-files-head span{
            display:inline-flex;
            align-items:center;
            min-height:23px;
            padding:0 8px;
            border-radius:999px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:10px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.04em;
            text-transform:uppercase;
            white-space:nowrap;
          }

          .inc-create-dropzone{
            display:grid;
            min-height:104px;
            align-content:center;
            padding:14px;
            border-radius:14px;
            border:1px dashed var(--border-soft, rgba(255,255,255,.16));
            background:transparent;
            cursor:pointer;
            transition:
              border-color .18s ease,
              background .18s ease;
          }

          .inc-create-dropzone.is-active{
            border-color:color-mix(in srgb, var(--accent, #7c5cff) 36%, var(--border-soft, rgba(255,255,255,.12)));
            background:
              linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent),
              var(--surface-glass, rgba(255,255,255,.05));
          }

          .inc-create-dropzone-copy{
            display:grid;
            gap:4px;
          }

          .inc-create-dropzone-copy strong{
            color:var(--text-strong, #fff);
            font-size:13px;
            line-height:1.35;
          }

          .inc-create-dropzone-copy span{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            line-height:1.45;
          }

          .inc-create-hidden-input{
            display:none;
          }

          .inc-create-files-list{
            display:grid;
            gap:8px;
          }

          .inc-create-file-row{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            padding:10px 12px;
            border-radius:12px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:var(--surface-glass, rgba(255,255,255,.05));
          }

          .inc-create-file-meta{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .inc-create-file-name{
            color:var(--text-strong, #fff);
            font-size:12px;
            line-height:1.35;
            word-break:break-word;
          }

          .inc-create-file-size{
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:11px;
            line-height:1.3;
          }

          .inc-create-file-remove{
            min-height:31px;
            padding:0 10px;
            border-radius:10px;
            border:1px solid var(--border-soft, rgba(255,255,255,.12));
            background:transparent;
            color:var(--text-dim, rgba(255,255,255,.62));
            font-size:12px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            flex:0 0 auto;
          }

          .inc-create-actions{
            display:flex;
            justify-content:flex-end;
            padding-top:2px;
          }

          .inc-create-submit{
            min-height:43px;
            padding:0 18px;
            border-radius:13px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-size:13px;
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
            box-shadow:0 12px 26px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
          }

          .inc-create-submit:disabled{
            opacity:.82;
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
              linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,255,.96));
            box-shadow:
              0 28px 70px rgba(15,23,42,.14),
              0 0 0 1px rgba(255,255,255,.68) inset;
          }

          [data-theme="light"] .inc-create-block,
          [data-theme="light"] .inc-create-files-card,
          [data-theme="light"] .inc-create-alert,
          [data-theme="light"] .inc-create-input,
          [data-theme="light"] .inc-create-file-row,
          [data-theme="light"] .inc-create-search-item,
          [data-theme="light"] .inc-create-target-user-card,
          [data-theme="light"] .inc-create-search-state{
            box-shadow:0 6px 16px rgba(15,23,42,.04);
          }

          @media (max-width: 640px){
            .inc-create-overlay{
              padding:10px;
            }

            .inc-create-panel{
              max-height:94vh;
              border-radius:18px;
            }

            .inc-create-header{
              padding:14px 14px 12px;
            }

            .inc-create-body{
              padding:14px;
            }

            .inc-create-header-copy h2{
              font-size:27px;
            }

            .inc-create-target-user-card,
            .inc-create-file-row{
              flex-direction:column;
              align-items:flex-start;
            }

            .inc-create-actions{
              justify-content:stretch;
            }

            .inc-create-submit{
              width:100%;
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

function focusUserSearchInput() {
  if (!canSelectTargetUser()) return false;
  return focusField("targetUserSearch");
}

function focusPreferredField() {
  if (canSelectTargetUser() && !safeText(modalState.form?.targetUserId, "")) {
    if (focusUserSearchInput()) return true;
  }

  if (focusField("subject")) return true;

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
    modalState.successMessage = "Incidencia creada.";
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
    }, 380);

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
    focusPanel();
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
    focusPanel();
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
      focusPanel();
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

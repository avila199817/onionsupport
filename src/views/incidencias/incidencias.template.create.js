/* =========================================================
   Onion Support - Incidencias Create Template
   Archivo: /src/views/incidencias/incidencias.template.create.js

   Contrato productivo:
   - Sólo renderiza HTML y valida forma local.
   - No hace HTTP, no toca Auth, no toca Store, no toca DOM.
   - Expone data-field y data-create-action estables para index.js.
   - El input de adjuntos SIEMPRE se llama attachments.
   - Compatible con backend /api/tickets + multer upload.any().
   - Compatible con Cosmos tickets 1:1: targetUserId/targetClienteId reales.
========================================================= */

export const INCIDENCIAS_CREATE_TEMPLATE_VERSION =
  "incidencias.template.create.productivo.clean-header.v11";

export const CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  SUBMIT: "create-submit",

  USER_SEARCH: "create-user-search",
  USER_SELECT: "create-user-select",
  USER_CLEAR: "create-user-clear",

  ATTACHMENTS_ADD: "create-attachments-add",
  ATTACHMENT_REMOVE: "create-attachment-remove",
});

const MODAL_ID = "incidencias-create-modal-root";
const PANEL_ID = "incidencias-create-modal-panel";
const FORM_ID = "incidencias-create-form";

const USER_SEARCH_MIN_LENGTH = 2;
const MAX_FILES = 10;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ACCEPT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".pdf",
  ".txt",
  ".log",
  ".csv",
  ".json",
  ".zip",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".wmv",
  ".mpeg",
  ".mpg",
  ".ogv",
  ".3gp",
  ".mp3",
  ".m4a",
  ".wav",
  ".weba",
];

const CATEGORY_OPTIONS = Object.freeze([
  { value: "general", label: "General" },
  { value: "technical", label: "Técnica" },
  { value: "billing", label: "Facturación" },
  { value: "access", label: "Acceso" },
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "account", label: "Cuenta" },
  { value: "network", label: "Redes" },
  { value: "documentation", label: "Documentación" },
  { value: "sales", label: "Ventas" },
]);

const PRIORITY_OPTIONS = Object.freeze([
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
]);

const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetClienteId: "",
  targetUserName: "",
  targetUserEmail: "",
  targetUserAvatar: "",

  subject: "",
  description: "",

  priority: "medium",
  status: "open",
  category: "general",
  source: "panel_admin",

  attachments: [],
});

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function first(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => cleanText(value, ""))
    .filter(Boolean)
    .join(" ");
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

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstImageSrc(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null) continue;

    if (isObject(value)) {
      const nested = firstImageSrc(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.userAvatar,
        value.userAvatarUrl,
        value.clienteAvatar,
        value.clienteAvatarUrl,
        value.clientAvatar,
        value.clientAvatarUrl,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.photoUrl,
        value.profile?.photoURL,
        value.profile?.picture,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture,
        value.raw?.photoUrl,
        value.raw?.photoURL,
        value.raw?.imageUrl
      );

      if (nested) return nested;
      continue;
    }

    const src = safeImageSrc(value);
    if (src) return src;
  }

  return "";
}

function hashText(value = "") {
  const text = cleanText(value, "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function formatBytes(bytes = 0) {
  const size = number(bytes, 0);

  if (!size || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;

  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

function fileExtension(value = "") {
  const name = cleanText(value, "").toLowerCase();
  const index = name.lastIndexOf(".");

  if (index <= 0) return "";

  return name.slice(index);
}

function isFileLike(value = null) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.name === "string" &&
      typeof value.size === "number"
  );
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    check: `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 18H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    user: `<svg ${common}><path d="M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.75 20.75a7.25 7.25 0 0 1 14.5 0"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeUserResult(user = {}) {
  const raw = safeObject(user);
  const nested = safeObject(raw.raw);

  const userId = cleanText(
    first(
      raw.userId,
      raw.id,
      raw.uid,
      raw.sub,
      raw.usuarioId,
      raw.lookup?.userId,
      raw.lookup?.id,
      raw.profile?.userId,
      raw.auth?.userId,
      nested.userId,
      nested.id,
      nested.uid,
      nested.sub,
      nested.usuarioId,
      ""
    ),
    ""
  );

  const clienteId = cleanText(
    first(
      raw.targetClienteId,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.lookup?.clienteId,
      raw.lookup?.clientId,
      raw.tenant?.clienteId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      raw.client?.clienteId,
      raw.client?.id,
      nested.targetClienteId,
      nested.clienteId,
      nested.clientId,
      nested.customerId,
      nested.cliente?.clienteId,
      nested.cliente?.id,
      nested.client?.clienteId,
      nested.client?.id,
      ""
    ),
    ""
  );

  const name = cleanText(
    first(
      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.publicName,
      raw.clienteNombre,
      raw.clientName,
      raw.profile?.publicName,
      raw.profile?.displayName,
      raw.profile?.name,
      raw.lookup?.displayName,
      raw.lookup?.name,
      [raw.firstName, raw.lastName].filter(Boolean).join(" "),
      [raw.nombre, raw.apellidos].filter(Boolean).join(" "),
      nested.displayName,
      nested.fullName,
      nested.name,
      nested.nombre,
      raw.username,
      userId
    ),
    "Usuario"
  );

  const email = normalizeEmail(
    first(
      raw.email,
      raw.emailLower,
      raw.userEmail,
      raw.clienteEmail,
      raw.clientEmail,
      raw.profile?.email,
      raw.lookup?.email,
      nested.email,
      nested.emailLower,
      ""
    )
  );

  const username = cleanText(
    first(
      raw.username,
      raw.usernameLower,
      raw.userName,
      raw.profile?.username,
      nested.username,
      nested.usernameLower,
      ""
    ),
    ""
  );

  const avatarUrl = firstImageSrc(raw, nested);

  return {
    id: userId,
    userId,
    uid: userId,
    targetUserId: userId,
    clienteId,
    targetClienteId: clienteId,
    clientId: clienteId,
    name,
    nombre: name,
    fullName: name,
    displayName: name,
    email,
    emailLower: email,
    username,
    usernameLower: username.toLowerCase(),
    role: cleanText(first(raw.role, raw.rol, nested.role, nested.rol, "user"), "user"),
    phone: cleanText(first(raw.phone, raw.telefono, nested.phone, nested.telefono, ""), ""),
    avatarUrl,
    avatar: avatarUrl || null,
    picture: avatarUrl || "",
    initials: cleanText(raw.initials, initialsFrom(name)),
    tone: hashText(`${userId}:${clienteId}:${email}:${name}`) % 10,
    raw,
  };
}

function normalizeForm(form = {}) {
  const input = {
    ...DEFAULT_FORM,
    ...safeObject(form),
  };

  const targetUserEmail = normalizeEmail(
    first(
      input.targetUserEmail,
      input.userEmail,
      input.clienteEmail,
      input.clientEmail,
      input.email,
      ""
    )
  );

  const targetUserAvatar = firstImageSrc(
    input.targetUserAvatar,
    input.userAvatar,
    input.userAvatarUrl,
    input.clienteAvatar,
    input.clienteAvatarUrl,
    input.clientAvatar,
    input.clientAvatarUrl,
    input.avatar,
    input.avatarUrl
  );

  return {
    targetUserId: cleanText(
      first(input.targetUserId, input.userId, input.usuarioId, input.uid, ""),
      ""
    ),

    targetClienteId: cleanText(
      first(input.targetClienteId, input.clienteId, input.clientId, input.customerId, ""),
      ""
    ),

    targetUserName: cleanText(
      first(input.targetUserName, input.userName, input.clienteNombre, input.clientName, input.name, input.nombre, ""),
      ""
    ),

    targetUserEmail,
    targetUserAvatar,

    subject: cleanText(first(input.subject, input.asunto, input.title), ""),
    description: cleanText(first(input.description, input.descripcion, input.message, input.body), ""),

    priority: normalizeKey(input.priority) || "medium",
    status: normalizeKey(input.status) || "open",
    category: normalizeKey(input.category) || "general",
    source: cleanText(input.source, "panel_admin"),

    attachments: safeArray(input.attachments),
  };
}

function buildSelectedUser(form = {}, userSearch = {}) {
  const selected = safeObject(userSearch.selectedUser);

  if (!form.targetUserId && !selected.id && !selected.userId) return null;

  return normalizeUserResult({
    ...selected,
    userId: first(selected.userId, selected.id, form.targetUserId),
    id: first(selected.id, selected.userId, form.targetUserId),
    targetClienteId: first(selected.targetClienteId, selected.clienteId, selected.clientId, form.targetClienteId),
    clienteId: first(selected.clienteId, selected.targetClienteId, selected.clientId, form.targetClienteId),
    clientId: first(selected.clientId, selected.clienteId, selected.targetClienteId, form.targetClienteId),
    displayName: first(selected.displayName, selected.fullName, selected.name, selected.nombre, form.targetUserName),
    name: first(selected.name, selected.displayName, selected.fullName, selected.nombre, form.targetUserName),
    email: first(selected.email, selected.emailLower, form.targetUserEmail),
    avatarUrl: first(selected.avatarUrl, selected.avatar, form.targetUserAvatar),
  });
}

function buildVm(input = {}) {
  const raw = safeObject(input);
  const form = normalizeForm(raw.form || raw.values || raw);
  const userSearch = {
    query: cleanText(raw.userSearch?.query, ""),
    loading: Boolean(raw.userSearch?.loading),
    error: cleanText(raw.userSearch?.error, ""),
    empty: Boolean(raw.userSearch?.empty),
    results: safeArray(raw.userSearch?.results).map(normalizeUserResult),
    selectedUser: raw.userSearch?.selectedUser ? normalizeUserResult(raw.userSearch.selectedUser) : null,
  };

  return {
    open: raw.open !== false,
    admin: Boolean(raw.admin || raw.isAdmin || raw.role === "admin"),
    role: cleanText(raw.role, "user"),
    submitting: Boolean(raw.submitting || raw.loading || raw.creating),
    dragActive: Boolean(raw.dragActive),
    serverError: cleanText(raw.serverError || raw.error, ""),
    successMessage: cleanText(raw.successMessage, ""),
    createdTicketId: cleanText(raw.createdTicketId || raw.ticketId, ""),
    errors: safeObject(raw.errors),
    form,
    userSearch,
    selectedUser: buildSelectedUser(form, userSearch),
  };
}

/* =========================================================
   HTML PARTS
========================================================= */

function disabledAttrs(disabled = false, busy = false) {
  return disabled
    ? `disabled aria-disabled="true"${busy ? " aria-busy=\"true\"" : ""}`
    : "";
}

function renderFieldError(error = "") {
  const text = cleanText(error, "");

  if (!text) return "";

  return `<p class="inc-create-field-error" role="alert">${escapeHtml(text)}</p>`;
}

function renderInput({
  label = "",
  name = "",
  value = "",
  placeholder = "",
  type = "text",
  required = false,
  error = "",
  disabled = false,
} = {}) {
  const id = `incidencias-create-${name}`;

  return `
    <label class="inc-create-field ${error ? "is-error" : ""}" data-create-field="${attr(name)}">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>
      <input
        id="${attr(id)}"
        class="inc-create-input"
        data-field="${attr(name)}"
        name="${attr(name)}"
        type="${attr(type)}"
        value="${attr(value)}"
        placeholder="${attr(placeholder)}"
        autocomplete="off"
        ${required ? "required" : ""}
        ${disabledAttrs(disabled, disabled)}
      >
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
  rows = 5,
  disabled = false,
} = {}) {
  const id = `incidencias-create-${name}`;

  return `
    <label class="inc-create-field ${error ? "is-error" : ""}" data-create-field="${attr(name)}">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>
      <textarea
        id="${attr(id)}"
        class="inc-create-textarea"
        data-field="${attr(name)}"
        name="${attr(name)}"
        rows="${attr(String(rows))}"
        placeholder="${attr(placeholder)}"
        ${required ? "required" : ""}
        ${disabledAttrs(disabled, disabled)}
      >${escapeHtml(value)}</textarea>
      ${renderFieldError(error)}
    </label>
  `;
}

function renderSelect({
  label = "",
  name = "",
  value = "",
  options = [],
  required = false,
  error = "",
  disabled = false,
} = {}) {
  const id = `incidencias-create-${name}`;
  const current = normalizeKey(value);

  return `
    <label class="inc-create-field ${error ? "is-error" : ""}" data-create-field="${attr(name)}">
      <span class="inc-create-label">${escapeHtml(label)}${required ? " *" : ""}</span>
      <span class="inc-create-select-wrap">
        <select
          id="${attr(id)}"
          class="inc-create-select"
          data-field="${attr(name)}"
          name="${attr(name)}"
          ${required ? "required" : ""}
          ${disabledAttrs(disabled, disabled)}
        >
          ${safeArray(options).map((option) => {
            const optionValue = cleanText(option.value, "");
            return `
              <option value="${attr(optionValue)}" ${normalizeKey(optionValue) === current ? "selected" : ""}>
                ${escapeHtml(option.label || optionValue)}
              </option>
            `;
          }).join("")}
        </select>
        <span class="inc-create-select-chevron" aria-hidden="true">⌄</span>
      </span>
      ${renderFieldError(error)}
    </label>
  `;
}

function renderUserAvatar(user = {}, className = "inc-create-user-avatar") {
  const safeUser = normalizeUserResult(user);
  const avatar = safeImageSrc(safeUser.avatarUrl || safeUser.avatar);

  if (avatar) {
    return `
      <span class="${attr(className)} has-image" data-user-tone="${attr(String(safeUser.tone))}">
        <img src="${attr(avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      </span>
    `;
  }

  return `
    <span class="${attr(className)}" data-user-tone="${attr(String(safeUser.tone))}">
      ${escapeHtml(safeUser.initials || initialsFrom(safeUser.displayName || safeUser.name))}
    </span>
  `;
}

function renderSelectedUser(vm = {}) {
  const selected = vm.selectedUser;
  const form = vm.form;

  if (!selected?.id && !form.targetUserId) return "";

  const user = normalizeUserResult({
    ...selected,
    userId: form.targetUserId || selected?.userId || selected?.id,
    targetClienteId: form.targetClienteId || selected?.targetClienteId || selected?.clienteId,
    displayName: form.targetUserName || selected?.displayName || selected?.name,
    email: form.targetUserEmail || selected?.email,
    avatarUrl: form.targetUserAvatar || selected?.avatarUrl || selected?.avatar,
  });

  const subtitle = [user.email, user.username, user.clienteId].filter(Boolean).join(" · ");

  return `
    <section
      class="inc-create-selected-user inc-create-target-user"
      data-create-selected-user="true"
      data-user-id="${attr(user.userId || user.id)}"
      data-user-cliente-id="${attr(user.targetClienteId || user.clienteId || "") }"
      data-cliente-id="${attr(user.targetClienteId || user.clienteId || "") }"
    >
      <div class="inc-create-selected-user-main" data-create-selected-user-main="true">
        ${renderUserAvatar(user, "inc-create-target-user-avatar")}
        <span class="inc-create-selected-user-copy inc-create-target-user-copy">
          <strong>${escapeHtml(user.displayName || "Usuario seleccionado")}</strong>
          <span>${escapeHtml(subtitle || user.userId || "Usuario seleccionado")}</span>
        </span>
      </div>

      <button
        type="button"
        class="inc-create-selected-user-clear inc-create-target-user-clear"
        data-create-action="${CREATE_ACTIONS.USER_CLEAR}"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
        Quitar
      </button>
    </section>
  `;
}

function renderUserSearchResults(vm = {}) {
  const search = vm.userSearch;

  if (search.loading) {
    return `
      <div class="inc-create-user-search-state inc-create-search-state" data-user-search-state="loading" aria-live="polite">
        <span class="inc-create-spinner" aria-hidden="true"></span>
        <span>Buscando usuarios...</span>
      </div>
    `;
  }

  if (search.error) {
    return `
      <div class="inc-create-user-search-state inc-create-search-state is-error" data-user-search-state="error" role="alert">
        ${escapeHtml(search.error)}
      </div>
    `;
  }

  if (search.empty) {
    return `
      <div class="inc-create-user-search-state inc-create-search-state" data-user-search-state="empty" aria-live="polite">
        No hay usuarios para esta búsqueda.
      </div>
    `;
  }

  if (!search.results.length) return "";

  return `
    <div class="inc-create-user-results inc-create-search-results" role="listbox" data-create-user-results="true" aria-label="Resultados de búsqueda de usuarios">
      ${search.results.map((user) => {
        const item = normalizeUserResult(user);
        const subtitle = [item.email, item.username, item.role, item.clienteId].filter(Boolean).join(" · ");

        return `
          <button
            type="button"
            class="inc-create-user-result inc-create-search-item"
            role="option"
            data-create-action="${CREATE_ACTIONS.USER_SELECT}"
            data-user-id="${attr(item.userId || item.id)}"
            data-user-cliente-id="${attr(item.targetClienteId || item.clienteId || "") }"
            data-cliente-id="${attr(item.targetClienteId || item.clienteId || "") }"
            data-user-name="${attr(item.displayName)}"
            data-user-email="${attr(item.email)}"
            data-email="${attr(item.email)}"
            data-user-avatar="${attr(item.avatarUrl)}"
            ${disabledAttrs(vm.submitting, vm.submitting)}
          >
            ${renderUserAvatar(item)}
            <span class="inc-create-user-result-copy inc-create-search-item-copy">
              <strong>${escapeHtml(item.displayName)}</strong>
              <span>${escapeHtml(subtitle || item.userId || item.id)}</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderAdminUserSearch(vm = {}) {
  if (!vm.admin) return "";

  return `
    <section
      class="inc-create-block inc-create-block--user-search inc-create-block--target"
      data-create-admin-user-search="true"
      data-user-search-active="${vm.userSearch.query ? "true" : "false"}"
      data-user-selected="${vm.form.targetUserId ? "true" : "false"}"
    >
      <div class="inc-create-block-head">
        <div>
          <strong>Usuario afectado</strong>
          <span>Busca el usuario para crear la incidencia 1:1 contra su documento de Cosmos.</span>
        </div>
      </div>

      <div class="inc-create-selected-user-slot" data-create-selected-user-slot="true">
        ${renderSelectedUser(vm)}
      </div>

      <label class="inc-create-field" data-create-field="targetUserSearch">
        <span class="inc-create-label">Buscar usuario</span>
        <span class="inc-create-search-control inc-create-search-input-wrap">
          <span class="inc-create-search-icon inc-create-search-input-icon" aria-hidden="true">${icon("search")}</span>
          <input
            class="inc-create-input inc-create-input--with-icon inc-create-user-search-input"
            data-field="targetUserSearch"
            data-create-user-search-input="true"
            name="targetUserSearch"
            type="search"
            value="${attr(vm.userSearch.query)}"
            placeholder="Nombre, usuario, email o ID"
            autocomplete="off"
            spellcheck="false"
            aria-autocomplete="list"
            aria-expanded="${vm.userSearch.results.length ? "true" : "false"}"
            ${disabledAttrs(vm.submitting, vm.submitting)}
          >
        </span>
      </label>

      <input type="hidden" data-field="targetUserId" name="targetUserId" value="${attr(vm.form.targetUserId)}">
      <input type="hidden" data-field="targetClienteId" name="targetClienteId" value="${attr(vm.form.targetClienteId)}">
      <input type="hidden" data-field="targetUserName" name="targetUserName" value="${attr(vm.form.targetUserName)}">
      <input type="hidden" data-field="targetUserEmail" name="targetUserEmail" value="${attr(vm.form.targetUserEmail)}">
      <input type="hidden" data-field="targetUserAvatar" name="targetUserAvatar" value="${attr(vm.form.targetUserAvatar)}">

      <div class="inc-create-user-search-slot" data-create-user-search-slot="true">
        ${renderUserSearchResults(vm)}
      </div>

      <div class="inc-create-target-error-slot">
        ${renderFieldError(vm.errors.targetUserId || vm.errors.targetUser)}
      </div>
    </section>
  `;
}

function fileName(file = {}, index = 0) {
  return cleanText(file.name || file.filename || file.fileName, `Adjunto ${index + 1}`);
}

function fileSize(file = {}) {
  return number(file.size || file.sizeBytes, 0);
}

function fileType(file = {}) {
  return cleanText(file.type || file.contentType || file.mimetype || file.mimeType, "");
}

function renderFilesSummary(files = [], vm = {}) {
  const items = safeArray(files);

  if (!items.length) return "";

  return `
    <div class="inc-create-files-list" data-create-files-list="true">
      ${items.map((file, index) => {
        const name = fileName(file, index);
        const size = fileSize(file);
        const type = fileType(file);
        const meta = [type, formatBytes(size)].filter(Boolean).join(" · ");

        return `
          <div class="inc-create-file-row" data-create-file-row="true" data-file-index="${attr(String(index))}">
            <div class="inc-create-file-meta">
              <strong class="inc-create-file-name">${escapeHtml(name)}</strong>
              <span class="inc-create-file-size">${escapeHtml(meta || "Archivo preparado")}</span>
            </div>
            <button
              type="button"
              data-create-action="${CREATE_ACTIONS.ATTACHMENT_REMOVE}"
              data-remove-attachment="${attr(String(index))}"
              data-file-index="${attr(String(index))}"
              class="inc-create-file-remove"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              ${icon("trash")}
              <span>Quitar</span>
            </button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderFileInput(vm = {}) {
  const files = safeArray(vm.form.attachments);
  const error = cleanText(vm.errors.attachments, "");
  const countText = files.length === 0
    ? "Opcional"
    : files.length === 1
      ? "1 archivo"
      : `${files.length} archivos`;

  return `
    <section class="inc-create-files-card" data-create-files-card="true" data-files-count="${attr(String(files.length))}">
      <div class="inc-create-files-head">
        <strong>${icon("paperclip")} Adjuntos</strong>
        <span>${escapeHtml(countText)}</span>
      </div>

      <label
        data-dropzone="attachments"
        class="${joinClasses("inc-create-dropzone", vm.dragActive ? "is-active" : "", error ? "is-error" : "") }"
      >
        <input
          id="incidencias-create-attachments-input"
          data-field="attachments"
          name="attachments"
          type="file"
          multiple
          accept="${attr(ACCEPT_EXTENSIONS.join(","))}"
          class="inc-create-hidden-input"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >

        <div class="inc-create-dropzone-copy">
          <strong>Arrastra archivos o pulsa para seleccionar</strong>
          <span>Máximo ${MAX_FILES} archivos · ${formatBytes(MAX_FILE_SIZE)} por archivo. Se subirán al container tickets.</span>
        </div>
      </label>

      ${renderFieldError(error)}
      ${renderFilesSummary(files, vm)}
    </section>
  `;
}

function renderAlert(type = "info", title = "", body = "") {
  const safeTitle = cleanText(title, "");
  const safeBody = cleanText(body, "");

  if (!safeTitle && !safeBody) return "";

  return `
    <div class="inc-create-alert is-${attr(type)}" role="${type === "error" ? "alert" : "status"}">
      <span class="inc-create-alert-icon">${type === "success" ? icon("check") : type === "error" ? icon("alert") : icon("ticket")}</span>
      <span class="inc-create-alert-copy">
        ${safeTitle ? `<strong>${escapeHtml(safeTitle)}</strong>` : ""}
        ${safeBody ? `<span>${escapeHtml(safeBody)}</span>` : ""}
      </span>
    </div>
  `;
}

function renderLoadingOverlay(label = "Creando incidencia...") {
  return `
    <div class="inc-create-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="inc-create-loading-card">
        <span class="inc-create-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderIncidenciasCreateModal(input = {}) {
  const vm = buildVm(input);

  if (!vm.open) return "";

  return `
    <section
      id="${MODAL_ID}"
      data-incidencias-create-root="true"
      data-incidencias-modal="create"
      data-open="true"
      class="inc-create-root"
      role="presentation"
    >
      <div class="inc-create-overlay" data-incidencias-create-modal-overlay="true">
        <div
          id="${PANEL_ID}"
          data-incidencias-create-modal-panel="true"
          class="inc-create-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incidencias-create-title"
          tabindex="-1"
        >
          <header class="inc-create-header">
            <div class="inc-create-header-copy" data-create-title-block="true">
              <h2 id="incidencias-create-title">Crear incidencia</h2>
            </div>

            <button
              type="button"
              class="inc-create-close"
              data-create-action="${CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              ${icon("close")}
            </button>
          </header>

          <div class="inc-create-body">
            ${vm.successMessage ? renderAlert("success", "Incidencia creada.", vm.successMessage) : ""}
            ${vm.serverError ? renderAlert("error", "No se pudo crear la incidencia.", vm.serverError) : ""}

            <form
              id="${FORM_ID}"
              data-incidencias-create-form="true"
              novalidate
              class="inc-create-form"
              enctype="multipart/form-data"
            >
              <input type="hidden" data-field="source" name="source" value="${attr(vm.form.source || "panel_admin")}">
              <input type="hidden" data-field="status" name="status" value="${attr(vm.form.status || "open")}">

              ${renderAdminUserSearch(vm)}

              ${renderInput({
                label: "Asunto",
                name: "subject",
                value: vm.form.subject,
                placeholder: "Ej. Error al pagar, acceso bloqueado, factura incorrecta...",
                required: true,
                error: vm.errors.subject,
                disabled: vm.submitting,
              })}

              <div class="inc-create-grid inc-create-grid--2">
                ${renderSelect({
                  label: "Categoría",
                  name: "category",
                  value: vm.form.category,
                  options: CATEGORY_OPTIONS,
                  required: true,
                  error: vm.errors.category,
                  disabled: vm.submitting,
                })}

                ${renderSelect({
                  label: "Prioridad",
                  name: "priority",
                  value: vm.form.priority,
                  options: PRIORITY_OPTIONS,
                  required: true,
                  error: vm.errors.priority,
                  disabled: vm.submitting,
                })}
              </div>

              ${renderTextarea({
                label: "Descripción",
                name: "description",
                value: vm.form.description,
                placeholder: "Describe qué ocurre, desde cuándo pasa y qué necesita revisar soporte.",
                required: true,
                error: vm.errors.description,
                rows: 5,
                disabled: vm.submitting,
              })}

              ${renderFileInput(vm)}

              <div class="inc-create-actions">
                <button
                  id="incidencias-create-submit-btn"
                  type="submit"
                  data-create-action="${CREATE_ACTIONS.SUBMIT}"
                  ${disabledAttrs(vm.submitting, vm.submitting)}
                  class="inc-create-submit"
                >
                  <span class="inc-create-submit-inner">
                    ${vm.submitting ? `<span class="inc-create-spinner" aria-hidden="true"></span>Creando...` : "Crear incidencia"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          ${vm.submitting ? renderLoadingOverlay("Creando incidencia y subiendo adjuntos...") : ""}
        </div>
      </div>
    </section>
  `;
}

export function renderIncidenciasCreateModalClosed() {
  return "";
}

/* =========================================================
   HELPERS FOR INDEX.JS
========================================================= */

export function getCreateFormDefaults() {
  return {
    ...DEFAULT_FORM,
    attachments: [],
  };
}

export function validateCreateForm(form = {}) {
  const current = normalizeForm(form);
  const errors = {};

  if (!current.subject) {
    errors.subject = "El asunto es obligatorio.";
  } else if (current.subject.length < 4) {
    errors.subject = "Mínimo 4 caracteres.";
  }

  if (!current.description) {
    errors.description = "La descripción es obligatoria.";
  } else if (current.description.length < 8) {
    errors.description = "Mínimo 8 caracteres.";
  }

  const category = normalizeKey(current.category);
  const priority = normalizeKey(current.priority);

  if (!CATEGORY_OPTIONS.some((item) => item.value === category)) {
    errors.category = "Selecciona una categoría válida.";
  }

  if (!PRIORITY_OPTIONS.some((item) => item.value === priority)) {
    errors.priority = "Selecciona una prioridad válida.";
  }

  if (current.attachments.length > MAX_FILES) {
    errors.attachments = `No puedes adjuntar más de ${MAX_FILES} archivos.`;
  }

  for (const file of current.attachments) {
    if (!isFileLike(file)) continue;

    const extension = fileExtension(file.name);

    if (extension && !ACCEPT_EXTENSIONS.includes(extension)) {
      errors.attachments = `El archivo ${cleanText(file.name, "archivo")} tiene una extensión no permitida.`;
      break;
    }

    if (number(file.size, 0) > MAX_FILE_SIZE) {
      errors.attachments = `El archivo ${cleanText(file.name, "archivo")} supera el máximo de ${formatBytes(MAX_FILE_SIZE)}.`;
      break;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: {
      ...current,
      category,
      priority,
      status: current.status || "open",
      source: current.source || "panel_admin",
    },
  };
}

export function getCreateTemplateSnapshot() {
  return {
    version: INCIDENCIAS_CREATE_TEMPLATE_VERSION,
    actions: CREATE_ACTIONS,
    fields: [
      "targetUserSearch",
      "targetUserId",
      "targetClienteId",
      "targetUserName",
      "targetUserEmail",
      "targetUserAvatar",
      "subject",
      "category",
      "priority",
      "description",
      "source",
      "status",
      "attachments",
    ],
    admin: {
      userSearch: true,
      userSearchMinLength: USER_SEARCH_MIN_LENGTH,
      actionSearch: CREATE_ACTIONS.USER_SEARCH,
      actionSelect: CREATE_ACTIONS.USER_SELECT,
      actionClear: CREATE_ACTIONS.USER_CLEAR,
      preservesTargetClienteId: true,
    },
    limits: {
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE_SIZE,
      accept: ACCEPT_EXTENSIONS,
    },
    policy: {
      templateOnly: true,
      modalIslandReady: true,
      stableSlots: true,
      targetClienteIdCompatible: true,
      doesNotInventClienteId: true,
      createPayloadCompatible: true,
      hiddenTargetFields: true,
      adminUserSearchOnly: true,
      cleanHeader: true,
      headerIcon: false,
      headerSubtitle: false,
      blobFieldName: "attachments",
      formEncoding: "multipart/form-data",
    },
  };
}

export const renderCreateIncidenciaModal = renderIncidenciasCreateModal;
export const renderCreateModal = renderIncidenciasCreateModal;

export default renderIncidenciasCreateModal;

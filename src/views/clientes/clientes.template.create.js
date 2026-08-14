/* =========================================================
   Onion Support - Clientes Create Template
   Archivo: /src/views/clientes/clientes.template.create.js

   PRODUCTIVO · TEMPLATE PURO · BACKEND CONTRACT V3

   Responsabilidad:
   - Renderizar el modal de creación de Clientes.
   - Validar únicamente reglas que existen en el contrato real.
   - Construir EXACTAMENTE el body aceptado por POST /api/clientes.
   - Mantener los data-field/data-create-action consumidos por index.js.
   - No crear schema Cosmos en frontend.
   - No hacer HTTP, DOM directo, Store, Router ni Auth.
========================================================= */

export const CLIENTES_CREATE_TEMPLATE_VERSION =
  "clientes.template.create.backend-contract.v3";

export const CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  SUBMIT: "create-submit",

  USER_SEARCH: "create-user-search",
  USER_SELECT: "create-user-select",
  USER_CLEAR: "create-user-clear",

  COPY_USER_CONTACT: "create-copy-user-contact",

  /*
    Compatibilidad con consumidores antiguos.
    Ya no existe bloque de facturación en este formulario porque
    POST /api/clientes no persiste esos campos.
  */
  BILLING_TOGGLE: "create-billing-toggle",
});

export const CLIENTES_CREATE_ACTIONS = CREATE_ACTIONS;

const MODAL_ID = "clientes-create-modal-root";
const PANEL_ID = "clientes-create-modal-panel";
const FORM_ID = "clientes-create-form";

const USER_SEARCH_MIN_LENGTH = 2;

const CLIENTE_TYPE_OPTIONS = Object.freeze([
  { value: "particular", label: "Particular" },
  { value: "empresa", label: "Empresa" },
]);

const BACKEND_PAYLOAD_FIELDS = Object.freeze([
  "userId",
  "tipo",
  "nombreFiscal",
  "nif",
  "calle",
  "cp",
  "ciudad",
  "provincia",
  "pais",
  "contactoNombre",
  "contactoEmail",
  "contactoPhone",
]);

/*
  Se conservan algunas claves auxiliares que index.js usa al seleccionar
  un usuario. No forman parte del body final.
*/
const DEFAULT_FORM = Object.freeze({
  targetUserId: "",
  targetClienteId: "",
  targetUserName: "",
  targetUserEmail: "",
  targetUserPhone: "",
  targetUserAvatar: "",
  targetUsername: "",

  userId: "",

  tipo: "empresa",
  clienteTipo: "empresa",
  segmento: "empresa",

  nombreFiscal: "",
  nif: "",

  contactoNombre: "",
  contactoEmail: "",
  contactoPhone: "",

  calle: "",
  cp: "",
  ciudad: "",
  provincia: "",
  pais: "España",

  /*
    Compatibilidad temporal con el controlador v5.
    No se renderizan ni se envían a /api/clientes.
  */
  email: "",
  emailCliente: "",
  emailFacturacion: "",
  phone: "",
  telefono: "",
  username: "",
  slug: "",
});

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

/*
  No se aplanan arrays.
*/
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
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

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
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
      "sin_email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function normalizePhone(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";

  return raw
    .replace(/[^\d+()\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function normalizeClienteType(value = "") {
  const key = normalizeKey(value || "empresa");

  if (
    ["particular", "persona", "individual", "b2c"].includes(key)
  ) {
    return "particular";
  }

  if (
    [
      "empresa",
      "company",
      "business",
      "b2b",
      "autonomo",
    ].includes(key)
  ) {
    return "empresa";
  }

  return "";
}

function isValidEmail(value = "") {
  const email = normalizeEmail(value);

  return Boolean(
    email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
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

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstImageSrc(...values) {
  const queue = [...values];

  while (queue.length) {
    const value = queue.shift();

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (isObject(value)) {
      queue.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.profile?.avatarUrl,
        value.profile?.avatar,
        value.profile?.picture,
        value.raw?.avatarUrl,
        value.raw?.avatar,
        value.raw?.picture
      );

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

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash =
      ((hash << 5) - hash) +
      text.charCodeAt(index);

    hash |= 0;
  }

  return Math.abs(hash);
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase() ||
          ""
      )
      .join("")
      .slice(0, 2) ||
    "ON"
  );
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close:
      `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,

    client:
      `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,

    building:
      `<svg ${common}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/></svg>`,

    user:
      `<svg ${common}><path d="M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.75 20.75a7.25 7.25 0 0 1 14.5 0"/></svg>`,

    search:
      `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,

    check:
      `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,

    alert:
      `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,

    mail:
      `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`,

    phone:
      `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,

    location:
      `<svg ${common}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  };

  return icons[name] || icons.client;
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeUserResult(user = {}) {
  const raw = safeObject(user);
  const nested = safeObject(
    raw.raw
  );

  const profile = safeObject(
    first(
      raw.profile,
      nested.profile,
      {}
    )
  );

  const userId = cleanText(
    first(
      raw.userId,
      raw.id,
      raw.uid,
      raw.sub,
      raw.usuarioId,
      raw.lookup?.userId,
      raw.lookup?.id,
      raw.auth?.userId,
      profile.userId,
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
      profile.clienteId,
      profile.clientId,
      nested.targetClienteId,
      nested.clienteId,
      nested.clientId,
      nested.customerId,
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
      profile.publicName,
      profile.displayName,
      profile.name,
      raw.lookup?.displayName,
      raw.lookup?.name,
      [
        raw.firstName,
        raw.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      [
        raw.nombre,
        raw.apellidos,
      ]
        .filter(Boolean)
        .join(" "),
      nested.displayName,
      nested.fullName,
      nested.name,
      nested.nombre,
      raw.username,
      userId
    ),
    "Usuario"
  );

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.userEmail,
    profile.email,
    raw.lookup?.email,
    nested.email,
    nested.emailLower,
    ""
  );

  const phone = normalizePhone(
    first(
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.movil,
      profile.phone,
      profile.telefono,
      nested.phone,
      nested.telefono,
      ""
    )
  );

  const username = cleanText(
    first(
      raw.username,
      raw.usernameLower,
      raw.userName,
      profile.username,
      nested.username,
      nested.usernameLower,
      ""
    ),
    ""
  );

  const avatarUrl =
    firstImageSrc(
      raw,
      nested,
      profile
    );

  return {
    ...raw,
    raw,

    id: userId,
    userId,
    uid: userId,
    targetUserId: userId,

    clienteId,
    targetClienteId:
      clienteId,
    clientId:
      clienteId,

    name,
    nombre: name,
    fullName: name,
    displayName: name,

    email,
    emailLower: email,

    username,
    usernameLower:
      username.toLowerCase(),

    role: cleanText(
      first(
        raw.role,
        raw.rol,
        nested.role,
        nested.rol,
        "user"
      ),
      "user"
    ),

    phone,
    telefono: phone,

    avatarUrl,
    avatar:
      avatarUrl || null,
    picture:
      avatarUrl || "",

    initials:
      cleanText(
        raw.initials,
        initialsFrom(name)
      ),

    tone:
      hashText(
        `${userId}:${clienteId}:${email}:${name}`
      ) % 10,
  };
}

function normalizeForm(form = {}) {
  const input = {
    ...DEFAULT_FORM,
    ...safeObject(form),
  };

  const selectedUser =
    normalizeUserResult(
      first(
        input.selectedUser,
        input.user,
        input.usuario,
        {}
      )
    );

  const userId =
    cleanText(
      first(
        input.userId,
        input.targetUserId,
        selectedUser.userId,
        selectedUser.id,
        input.usuarioId,
        input.uid,
        ""
      ),
      ""
    );

  const targetClienteId =
    cleanText(
      first(
        input.targetClienteId,
        input.clienteId,
        input.clientId,
        selectedUser.targetClienteId,
        selectedUser.clienteId,
        ""
      ),
      ""
    );

  const tipo =
    normalizeClienteType(
      first(
        input.tipo,
        input.clienteTipo,
        input.segmento,
        "empresa"
      )
    );

  const hasSelectedUser =
    Boolean(
      selectedUser.userId ||
      selectedUser.id
    );

  const selectedName =
    cleanText(
      first(
        input.targetUserName,
        hasSelectedUser
          ? selectedUser.displayName
          : "",
        hasSelectedUser
          ? selectedUser.name
          : "",
        ""
      ),
      ""
    );

  const selectedEmail =
    firstEmail(
      input.targetUserEmail,
      hasSelectedUser
        ? selectedUser.email
        : "",
      ""
    );

  const selectedPhone =
    normalizePhone(
      first(
        input.targetUserPhone,
        hasSelectedUser
          ? selectedUser.phone
          : "",
        hasSelectedUser
          ? selectedUser.telefono
          : "",
        ""
      )
    );

  const selectedUsername =
    cleanText(
      first(
        input.targetUsername,
        hasSelectedUser
          ? selectedUser.username
          : "",
        ""
      ),
      ""
    );

  const selectedAvatar =
    firstImageSrc(
      input.targetUserAvatar,
      hasSelectedUser
        ? selectedUser.avatarUrl
        : "",
      hasSelectedUser
        ? selectedUser.avatar
        : ""
    );

  const nombreFiscal =
    cleanText(
      first(
        input.nombreFiscal,
        input.razonSocial,
        input.businessName,
        input.companyName,
        tipo === "particular"
          ? selectedName
          : "",
        ""
      ),
      ""
    ).slice(
      0,
      150
    );

  const nif =
    cleanText(
      first(
        input.nif,
        input.cif,
        input.vatNumber,
        input.taxId,
        ""
      ),
      ""
    )
      .toUpperCase()
      .slice(
        0,
        20
      );

  const contactoNombre =
    cleanText(
      first(
        input.contactoNombre,
        input.contactName,
        input.contacto?.nombre,
        selectedName,
        nombreFiscal,
        ""
      ),
      ""
    ).slice(
      0,
      150
    );

  const contactoEmail =
    firstEmail(
      input.contactoEmail,
      input.email,
      input.emailCliente,
      input.contacto?.email,
      selectedEmail,
      ""
    ).slice(
      0,
      150
    );

  const contactoPhone =
    normalizePhone(
      first(
        input.contactoPhone,
        input.phone,
        input.telefono,
        input.contacto?.phone,
        input.contacto?.telefono,
        selectedPhone,
        ""
      )
    );

  const calle =
    cleanText(
      first(
        input.calle,
        input.direccion?.calle,
        input.address?.street,
        ""
      ),
      ""
    ).slice(
      0,
      150
    );

  const cp =
    cleanText(
      first(
        input.cp,
        input.postalCode,
        input.codigoPostal,
        input.direccion?.cp,
        ""
      ),
      ""
    ).slice(
      0,
      10
    );

  const ciudad =
    cleanText(
      first(
        input.ciudad,
        input.city,
        input.direccion?.ciudad,
        ""
      ),
      ""
    ).slice(
      0,
      100
    );

  const provincia =
    cleanText(
      first(
        input.provincia,
        input.province,
        input.direccion?.provincia,
        ""
      ),
      ""
    ).slice(
      0,
      100
    );

  const pais =
    cleanText(
      first(
        input.pais,
        input.country,
        input.direccion?.pais,
        "España"
      ),
      "España"
    ).slice(
      0,
      100
    );

  return {
    ...input,

    targetUserId:
      userId,

    targetClienteId,

    targetUserName:
      selectedName ||
      contactoNombre,

    targetUserEmail:
      selectedEmail ||
      contactoEmail,

    targetUserPhone:
      selectedPhone ||
      contactoPhone,

    targetUserAvatar:
      selectedAvatar,

    targetUsername:
      selectedUsername,

    userId,

    tipo,
    clienteTipo:
      tipo,
    segmento:
      tipo,

    nombreFiscal,
    nif,

    contactoNombre,
    contactoEmail,
    contactoPhone,

    calle,
    cp,
    ciudad,
    provincia,
    pais,

    /*
      Aliases sólo para compatibilidad con index.js.
    */
    email:
      contactoEmail,

    emailCliente:
      contactoEmail,

    phone:
      contactoPhone,

    telefono:
      contactoPhone,

    emailFacturacion:
      firstEmail(
        input.emailFacturacion,
        contactoEmail
      ),

    username:
      cleanText(
        first(
          input.username,
          selectedUsername,
          ""
        ),
        ""
      ),

    slug:
      cleanText(
        input.slug,
        ""
      ),
  };
}

export function normalizeClienteCreateForm(
  form = {}
) {
  return normalizeForm(form);
}

function buildSelectedUser(
  form = {},
  userSearch = {}
) {
  const selected =
    safeObject(
      userSearch.selectedUser
    );

  if (
    !form.targetUserId &&
    !selected.id &&
    !selected.userId
  ) {
    return null;
  }

  return normalizeUserResult({
    ...selected,

    userId:
      first(
        selected.userId,
        selected.id,
        form.targetUserId
      ),

    id:
      first(
        selected.id,
        selected.userId,
        form.targetUserId
      ),

    targetClienteId:
      first(
        selected.targetClienteId,
        selected.clienteId,
        selected.clientId,
        form.targetClienteId
      ),

    clienteId:
      first(
        selected.clienteId,
        selected.targetClienteId,
        selected.clientId,
        form.targetClienteId
      ),

    displayName:
      first(
        selected.displayName,
        selected.fullName,
        selected.name,
        selected.nombre,
        form.targetUserName
      ),

    name:
      first(
        selected.name,
        selected.displayName,
        selected.fullName,
        selected.nombre,
        form.targetUserName
      ),

    email:
      first(
        selected.email,
        selected.emailLower,
        form.targetUserEmail
      ),

    phone:
      first(
        selected.phone,
        selected.telefono,
        form.targetUserPhone
      ),

    username:
      first(
        selected.username,
        selected.usernameLower,
        form.targetUsername
      ),

    avatarUrl:
      first(
        selected.avatarUrl,
        selected.avatar,
        form.targetUserAvatar
      ),
  });
}

function buildVm(input = {}) {
  const raw =
    safeObject(input);

  const form =
    normalizeForm(
      raw.form ||
      raw.values ||
      raw
    );

  const userSearch = {
    query:
      cleanText(
        raw.userSearch?.query,
        ""
      ),

    loading:
      Boolean(
        raw.userSearch?.loading
      ),

    error:
      cleanText(
        raw.userSearch?.error,
        ""
      ),

    empty:
      Boolean(
        raw.userSearch?.empty
      ),

    results:
      safeArray(
        raw.userSearch?.results
      ).map(
        normalizeUserResult
      ),

    selectedUser:
      raw.userSearch
        ?.selectedUser
        ? normalizeUserResult(
            raw.userSearch
              .selectedUser
          )
        : null,
  };

  return {
    open:
      raw.open !== false,

    admin:
      Boolean(
        raw.admin ||
        raw.isAdmin ||
        raw.role === "admin"
      ),

    role:
      cleanText(
        raw.role,
        "user"
      ),

    submitting:
      Boolean(
        raw.submitting ||
        raw.loading ||
        raw.creating
      ),

    serverError:
      cleanText(
        raw.serverError ||
        raw.error,
        ""
      ),

    successMessage:
      cleanText(
        raw.successMessage,
        ""
      ),

    createdClienteId:
      cleanText(
        raw.createdClienteId ||
        raw.clienteId ||
        raw.clientId,
        ""
      ),

    errors:
      safeObject(
        raw.errors
      ),

    form,

    userSearch,

    selectedUser:
      buildSelectedUser(
        form,
        userSearch
      ),
  };
}

/* =========================================================
   PAYLOAD BUILDER · CONTRATO REAL
========================================================= */

export function buildClienteCreatePayload(
  form = {}
) {
  const current =
    normalizeForm(form);

  /*
    Este objeto coincide 1:1 con el destructuring del backend:
    create_client_admin.js.
  */
  return {
    userId:
      current.userId,

    tipo:
      current.tipo,

    nombreFiscal:
      current.nombreFiscal,

    nif:
      current.nif || "",

    calle:
      current.calle,

    cp:
      current.cp,

    ciudad:
      current.ciudad,

    provincia:
      current.provincia,

    pais:
      current.pais ||
      "España",

    contactoNombre:
      current.contactoNombre ||
      current.nombreFiscal,

    contactoEmail:
      current.contactoEmail,

    contactoPhone:
      current.contactoPhone,
  };
}

/* =========================================================
   HTML HELPERS
========================================================= */

function disabledAttrs(
  disabled = false,
  busy = false
) {
  return disabled
    ? `disabled aria-disabled="true"${busy ? ` aria-busy="true"` : ""}`
    : "";
}

function renderFieldError(
  error = ""
) {
  const text =
    cleanText(
      error,
      ""
    );

  if (!text) return "";

  return `
    <p
      class="cli-create-field-error inc-create-field-error"
      role="alert"
    >${escapeHtml(text)}</p>
  `;
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
  autocomplete = "off",
  inputmode = "",
  iconName = "",
  maxLength = "",
  help = "",
} = {}) {
  const id =
    `clientes-create-${name}`;

  return `
    <label
      class="cli-create-field inc-create-field ${error ? "is-error" : ""}"
      data-create-field="${attr(name)}"
      for="${attr(id)}"
    >
      <span class="cli-create-label inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <span class="cli-create-input-wrap ${iconName ? "has-icon" : ""}">
        ${
          iconName
            ? `<span class="cli-create-input-icon inc-create-search-icon" aria-hidden="true">${icon(iconName)}</span>`
            : ""
        }

        <input
          id="${attr(id)}"
          class="cli-create-input inc-create-input ${iconName ? "cli-create-input--with-icon inc-create-input--with-icon" : ""}"
          data-field="${attr(name)}"
          name="${attr(name)}"
          type="${attr(type)}"
          value="${attr(value)}"
          placeholder="${attr(placeholder)}"
          autocomplete="${attr(autocomplete)}"
          ${inputmode ? `inputmode="${attr(inputmode)}"` : ""}
          ${maxLength ? `maxlength="${attr(maxLength)}"` : ""}
          ${required ? "required" : ""}
          ${disabledAttrs(disabled, disabled)}
        >
      </span>

      ${
        help
          ? `<span class="cli-create-help inc-create-help">${escapeHtml(help)}</span>`
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
  required = false,
  error = "",
  disabled = false,
} = {}) {
  const id =
    `clientes-create-${name}`;

  return `
    <label
      class="cli-create-field inc-create-field ${error ? "is-error" : ""}"
      data-create-field="${attr(name)}"
      for="${attr(id)}"
    >
      <span class="cli-create-label inc-create-label">
        ${escapeHtml(label)}${required ? " *" : ""}
      </span>

      <select
        id="${attr(id)}"
        class="cli-create-input cli-create-select inc-create-input inc-create-select"
        data-field="${attr(name)}"
        name="${attr(name)}"
        ${required ? "required" : ""}
        ${disabledAttrs(disabled, disabled)}
      >
        ${safeArray(options)
          .map(
            (option) => `
              <option
                value="${attr(option.value)}"
                ${cleanText(option.value) === cleanText(value) ? "selected" : ""}
              >${escapeHtml(option.label)}</option>
            `
          )
          .join("")}
      </select>

      ${renderFieldError(error)}
    </label>
  `;
}

function renderBlock(
  title = "",
  subtitle = "",
  body = "",
  extraClass = ""
) {
  return `
    <section
      class="cli-create-block inc-create-block ${attr(extraClass)}"
    >
      <div class="cli-create-block-head inc-create-block-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          ${
            subtitle
              ? `<span>${escapeHtml(subtitle)}</span>`
              : ""
          }
        </div>
      </div>

      <div class="cli-create-block-body inc-create-block-body">
        ${body}
      </div>
    </section>
  `;
}

function renderUserAvatar(
  user = {},
  extraClass = ""
) {
  const current =
    normalizeUserResult(user);

  const src =
    safeImageSrc(
      current.avatarUrl
    );

  const name =
    current.displayName ||
    current.name ||
    current.userId ||
    "Usuario";

  const initials =
    current.initials ||
    initialsFrom(name);

  const tone =
    Number.isFinite(
      Number(current.tone)
    )
      ? Number(current.tone)
      : hashText(
          `${current.userId}:${name}`
        ) % 10;

  return `
    <span
      class="cli-create-user-avatar inc-create-user-avatar cli-create-user-avatar-tone-${attr(String(tone))} ${attr(extraClass)}"
      data-avatar-tone="${attr(String(tone))}"
      aria-hidden="true"
    >
      ${
        src
          ? `<img
              class="cli-create-user-avatar-img inc-create-user-avatar-img"
              src="${attr(src)}"
              alt=""
              width="40"
              height="40"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
            >`
          : ""
      }

      <span class="cli-create-user-avatar-fallback inc-create-user-avatar-fallback">
        ${escapeHtml(initials)}
      </span>
    </span>
  `;
}

function renderSelectedUser(
  vm = {}
) {
  const selected =
    vm.selectedUser;

  const form =
    vm.form;

  if (
    !selected?.id &&
    !form.targetUserId
  ) {
    return "";
  }

  const user =
    normalizeUserResult({
      ...selected,

      userId:
        form.targetUserId ||
        selected?.userId ||
        selected?.id,

      targetClienteId:
        form.targetClienteId ||
        selected
          ?.targetClienteId ||
        selected?.clienteId,

      displayName:
        form.targetUserName ||
        selected?.displayName ||
        selected?.name,

      email:
        form.targetUserEmail ||
        selected?.email,

      phone:
        form.targetUserPhone ||
        selected?.phone,

      username:
        form.targetUsername ||
        selected?.username,

      avatarUrl:
        form.targetUserAvatar ||
        selected?.avatarUrl ||
        selected?.avatar,
    });

  const subtitle =
    [
      user.email,
      user.phone,
      user.username,
      user.clienteId,
    ]
      .filter(Boolean)
      .join(" · ");

  return `
    <section
      class="cli-create-selected-user cli-create-target-user inc-create-selected-user inc-create-target-user"
      data-create-selected-user="true"
      data-user-id="${attr(user.userId || user.id)}"
      data-user-cliente-id="${attr(user.targetClienteId || user.clienteId || "")}"
      data-cliente-id="${attr(user.targetClienteId || user.clienteId || "")}"
    >
      <div
        class="cli-create-selected-user-main cli-create-target-user-main inc-create-selected-user-main inc-create-target-user-main"
        data-create-selected-user-main="true"
      >
        ${renderUserAvatar(
          user,
          "cli-create-target-user-avatar inc-create-target-user-avatar"
        )}

        <span
          class="cli-create-selected-user-copy cli-create-target-user-copy inc-create-selected-user-copy inc-create-target-user-copy"
        >
          <strong>${escapeHtml(user.displayName || "Usuario seleccionado")}</strong>
          <span>${escapeHtml(subtitle || user.userId || "Usuario seleccionado")}</span>
        </span>
      </div>

      <div class="cli-create-selected-user-actions inc-create-selected-user-actions">
        <button
          type="button"
          class="cli-create-selected-user-copy-action inc-create-selected-user-copy-action"
          data-create-action="${CREATE_ACTIONS.COPY_USER_CONTACT}"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >
          Copiar contacto
        </button>

        <button
          type="button"
          class="cli-create-selected-user-clear cli-create-target-user-clear inc-create-selected-user-clear inc-create-target-user-clear"
          data-create-action="${CREATE_ACTIONS.USER_CLEAR}"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >
          Quitar
        </button>
      </div>
    </section>
  `;
}

function renderUserSearchResults(
  vm = {}
) {
  const search =
    vm.userSearch;

  if (search.loading) {
    return `
      <div
        class="cli-create-user-search-state cli-create-search-state inc-create-user-search-state inc-create-search-state"
        data-user-search-state="loading"
        aria-live="polite"
      >
        <span class="cli-create-spinner inc-create-spinner" aria-hidden="true"></span>
        <span>Buscando usuarios...</span>
      </div>
    `;
  }

  if (search.error) {
    return `
      <div
        class="cli-create-user-search-state cli-create-search-state inc-create-user-search-state inc-create-search-state is-error"
        data-user-search-state="error"
        role="alert"
      >
        ${escapeHtml(search.error)}
      </div>
    `;
  }

  if (search.empty) {
    return `
      <div
        class="cli-create-user-search-state cli-create-search-state inc-create-user-search-state inc-create-search-state"
        data-user-search-state="empty"
        aria-live="polite"
      >
        No hay usuarios para esta búsqueda.
      </div>
    `;
  }

  if (!search.results.length) {
    return "";
  }

  return `
    <div
      class="cli-create-user-results cli-create-search-results inc-create-user-results inc-create-search-results"
      role="listbox"
      data-create-user-results="true"
      aria-label="Resultados de búsqueda de usuarios"
    >
      ${search.results
        .map(
          (user) => {
            const item =
              normalizeUserResult(
                user
              );

            const subtitle =
              [
                item.email,
                item.phone,
                item.username,
                item.role,
                item.clienteId,
              ]
                .filter(Boolean)
                .join(" · ");

            return `
              <button
                type="button"
                class="cli-create-user-result cli-create-search-item inc-create-user-result inc-create-search-item"
                role="option"
                data-create-action="${CREATE_ACTIONS.USER_SELECT}"
                data-user-id="${attr(item.userId || item.id)}"
                data-user-cliente-id="${attr(item.targetClienteId || item.clienteId || "")}"
                data-cliente-id="${attr(item.targetClienteId || item.clienteId || "")}"
                data-user-name="${attr(item.displayName)}"
                data-user-email="${attr(item.email)}"
                data-email="${attr(item.email)}"
                data-user-phone="${attr(item.phone)}"
                data-user-username="${attr(item.username)}"
                data-user-avatar="${attr(item.avatarUrl)}"
                ${disabledAttrs(vm.submitting, vm.submitting)}
              >
                ${renderUserAvatar(item)}

                <span
                  class="cli-create-user-result-copy cli-create-search-item-copy inc-create-user-result-copy inc-create-search-item-copy"
                >
                  <strong>${escapeHtml(item.displayName)}</strong>
                  <span>${escapeHtml(subtitle || item.userId || item.id)}</span>
                </span>
              </button>
            `;
          }
        )
        .join("")}
    </div>
  `;
}

function renderAdminUserSearch(
  vm = {}
) {
  if (!vm.admin) {
    return renderAlert(
      "error",
      "Acceso restringido.",
      "La creación de clientes requiere rol administrador."
    );
  }

  return `
    <section
      class="cli-create-block cli-create-block--user-search cli-create-block--target inc-create-block inc-create-block--user-search inc-create-block--target"
      data-create-admin-user-search="true"
      data-user-search-active="${vm.userSearch.query ? "true" : "false"}"
      data-user-selected="${vm.form.targetUserId ? "true" : "false"}"
    >
      <div class="cli-create-block-head inc-create-block-head">
        <div>
          <strong>Usuario vinculado</strong>
          <span>
            Selecciona el usuario real. El backend crea un único cliente por userId.
          </span>
        </div>
      </div>

      <div
        class="cli-create-selected-user-slot inc-create-selected-user-slot"
        data-create-selected-user-slot="true"
      >
        ${renderSelectedUser(vm)}
      </div>

      <label
        class="cli-create-field inc-create-field"
        data-create-field="targetUserSearch"
      >
        <span class="cli-create-label inc-create-label">
          Buscar usuario
        </span>

        <span
          class="cli-create-search-control cli-create-search-input-wrap inc-create-search-control inc-create-search-input-wrap"
        >
          <span
            class="cli-create-search-icon cli-create-search-input-icon inc-create-search-icon inc-create-search-input-icon"
            aria-hidden="true"
          >${icon("search")}</span>

          <input
            class="cli-create-input cli-create-input--with-icon cli-create-user-search-input inc-create-input inc-create-input--with-icon inc-create-user-search-input"
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

      <input
        type="hidden"
        data-field="targetUserId"
        name="targetUserId"
        value="${attr(vm.form.targetUserId)}"
      >

      <input
        type="hidden"
        data-field="userId"
        name="userId"
        value="${attr(vm.form.userId || vm.form.targetUserId)}"
      >

      <input
        type="hidden"
        data-field="targetClienteId"
        name="targetClienteId"
        value="${attr(vm.form.targetClienteId)}"
      >

      <input
        type="hidden"
        data-field="targetUserName"
        name="targetUserName"
        value="${attr(vm.form.targetUserName)}"
      >

      <input
        type="hidden"
        data-field="targetUserEmail"
        name="targetUserEmail"
        value="${attr(vm.form.targetUserEmail)}"
      >

      <input
        type="hidden"
        data-field="targetUserPhone"
        name="targetUserPhone"
        value="${attr(vm.form.targetUserPhone)}"
      >

      <input
        type="hidden"
        data-field="targetUsername"
        name="targetUsername"
        value="${attr(vm.form.targetUsername)}"
      >

      <input
        type="hidden"
        data-field="targetUserAvatar"
        name="targetUserAvatar"
        value="${attr(vm.form.targetUserAvatar)}"
      >

      <div
        class="cli-create-user-search-slot inc-create-user-search-slot"
        data-create-user-search-slot="true"
      >
        ${renderUserSearchResults(vm)}
      </div>

      <div class="cli-create-target-error-slot inc-create-target-error-slot">
        ${renderFieldError(
          vm.errors.userId ||
          vm.errors.targetUserId ||
          vm.errors.targetUser
        )}
      </div>
    </section>
  `;
}

function renderFiscalBlock(
  vm = {}
) {
  const form =
    vm.form;

  return renderBlock(
    "Datos fiscales",
    "Sólo se muestran los datos que POST /api/clientes persiste realmente.",
    `
      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderSelect({
          label:
            "Tipo de cliente",

          name:
            "tipo",

          value:
            form.tipo,

          options:
            CLIENTE_TYPE_OPTIONS,

          required:
            true,

          error:
            vm.errors.tipo,

          disabled:
            vm.submitting,
        })}

        ${renderInput({
          label:
            form.tipo === "empresa"
              ? "NIF / CIF"
              : "NIF / DNI",

          name:
            "nif",

          value:
            form.nif,

          placeholder:
            "Ej. B22627012",

          error:
            vm.errors.nif,

          disabled:
            vm.submitting,

          maxLength:
            "20",

          help:
            "Opcional.",
        })}
      </div>

      ${renderInput({
        label:
          form.tipo === "empresa"
            ? "Nombre fiscal / Razón social"
            : "Nombre completo fiscal",

        name:
          "nombreFiscal",

        value:
          form.nombreFiscal,

        placeholder:
          form.tipo === "empresa"
            ? "Ej. Empresa SL"
            : "Ej. Javier Harandou",

        required:
          true,

        error:
          vm.errors.nombreFiscal,

        disabled:
          vm.submitting,

        iconName:
          form.tipo === "empresa"
            ? "building"
            : "user",

        maxLength:
          "150",
      })}

      <input
        type="hidden"
        data-field="clienteTipo"
        name="clienteTipo"
        value="${attr(form.tipo)}"
      >

      <input
        type="hidden"
        data-field="segmento"
        name="segmento"
        value="${attr(form.tipo)}"
      >
    `,
    "cli-create-block--fiscal inc-create-block--fiscal"
  );
}

function renderContactBlock(
  vm = {}
) {
  const form =
    vm.form;

  return renderBlock(
    "Contacto",
    "Opcional: si se deja vacío, el backend usa los datos del usuario vinculado cuando corresponde.",
    `
      ${renderInput({
        label:
          "Nombre de contacto",

        name:
          "contactoNombre",

        value:
          form.contactoNombre,

        placeholder:
          "Nombre de la persona de contacto",

        error:
          vm.errors.contactoNombre,

        disabled:
          vm.submitting,

        iconName:
          "user",

        maxLength:
          "150",

        help:
          "Si queda vacío, el backend usa el nombre fiscal.",
      })}

      <div class="cli-create-grid cli-create-grid--2 inc-create-grid inc-create-grid--2">
        ${renderInput({
          label:
            "Email",

          name:
            "contactoEmail",

          value:
            form.contactoEmail,

          placeholder:
            "cliente@empresa.com",

          type:
            "email",

          error:
            vm.errors.contactoEmail,

          disabled:
            vm.submitting,

          autocomplete:
            "email",

          iconName:
            "mail",

          maxLength:
            "150",

          help:
            "Opcional; el backend puede usar el email del usuario.",
        })}

        ${renderInput({
          label:
            "Teléfono",

          name:
            "contactoPhone",

          value:
            form.contactoPhone,

          placeholder:
            "+34 600 000 000",

          type:
            "tel",

          error:
            vm.errors.contactoPhone,

          disabled:
            vm.submitting,

          autocomplete:
            "tel",

          inputmode:
            "tel",

          iconName:
            "phone",

          maxLength:
            "30",
        })}
      </div>

      <input
        type="hidden"
        data-field="email"
        name="email"
        value="${attr(form.contactoEmail)}"
      >

      <input
        type="hidden"
        data-field="emailCliente"
        name="emailCliente"
        value="${attr(form.contactoEmail)}"
      >

      <input
        type="hidden"
        data-field="phone"
        name="phone"
        value="${attr(form.contactoPhone)}"
      >

      <input
        type="hidden"
        data-field="telefono"
        name="telefono"
        value="${attr(form.contactoPhone)}"
      >
    `,
    "cli-create-block--contact inc-create-block--contact"
  );
}

function renderAddressBlock(
  vm = {}
) {
  const form =
    vm.form;

  return renderBlock(
    "Dirección",
    "Todos los campos son opcionales; se guardan dentro de direccion.",
    `
      ${renderInput({
        label:
          "Calle y número",

        name:
          "calle",

        value:
          form.calle,

        placeholder:
          "C/ Ejemplo 10",

        error:
          vm.errors.calle,

        disabled:
          vm.submitting,

        iconName:
          "location",

        maxLength:
          "150",
      })}

      <div class="cli-create-grid cli-create-grid--3 inc-create-grid inc-create-grid--3">
        ${renderInput({
          label:
            "CP",

          name:
            "cp",

          value:
            form.cp,

          placeholder:
            "08295",

          error:
            vm.errors.cp,

          disabled:
            vm.submitting,

          inputmode:
            "numeric",

          maxLength:
            "10",
        })}

        ${renderInput({
          label:
            "Ciudad",

          name:
            "ciudad",

          value:
            form.ciudad,

          placeholder:
            "Barcelona",

          error:
            vm.errors.ciudad,

          disabled:
            vm.submitting,

          maxLength:
            "100",
        })}

        ${renderInput({
          label:
            "Provincia",

          name:
            "provincia",

          value:
            form.provincia,

          placeholder:
            "Barcelona",

          error:
            vm.errors.provincia,

          disabled:
            vm.submitting,

          maxLength:
            "100",
        })}
      </div>

      ${renderInput({
        label:
          "País",

        name:
          "pais",

        value:
          form.pais,

        placeholder:
          "España",

        required:
          true,

        error:
          vm.errors.pais,

        disabled:
          vm.submitting,

        maxLength:
          "100",
      })}
    `,
    "cli-create-block--address inc-create-block--address"
  );
}

function renderAlert(
  type = "info",
  title = "",
  body = ""
) {
  const safeTitle =
    cleanText(
      title,
      ""
    );

  const safeBody =
    cleanText(
      body,
      ""
    );

  if (
    !safeTitle &&
    !safeBody
  ) {
    return "";
  }

  return `
    <div
      class="cli-create-alert inc-create-alert is-${attr(type)}"
      role="${type === "error" ? "alert" : "status"}"
    >
      <span class="cli-create-alert-icon inc-create-alert-icon">
        ${
          type === "success"
            ? icon("check")
            : type === "error"
              ? icon("alert")
              : icon("client")
        }
      </span>

      <span class="cli-create-alert-copy inc-create-alert-copy">
        ${
          safeTitle
            ? `<strong>${escapeHtml(safeTitle)}</strong>`
            : ""
        }

        ${
          safeBody
            ? `<span>${escapeHtml(safeBody)}</span>`
            : ""
        }
      </span>
    </div>
  `;
}

function renderLoadingOverlay(
  label = "Creando cliente..."
) {
  return `
    <div
      class="cli-create-loading-overlay inc-create-loading-overlay"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="cli-create-loading-card inc-create-loading-card">
        <span class="cli-create-loading-spinner inc-create-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderClientesCreateModal(
  input = {}
) {
  const vm =
    buildVm(input);

  if (!vm.open) {
    return "";
  }

  return `
    <section
      id="${MODAL_ID}"
      data-clientes-create-root="true"
      data-clientes-modal="create"
      data-open="true"
      class="cli-create-root inc-create-root"
      role="presentation"
    >
      <div
        class="cli-create-overlay inc-create-overlay"
        data-clientes-create-modal-overlay="true"
      >
        <div
          id="${PANEL_ID}"
          data-clientes-create-modal-panel="true"
          class="cli-create-panel inc-create-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clientes-create-title"
          tabindex="-1"
        >
          <header class="cli-create-header inc-create-header">
            <div class="cli-create-title-wrap inc-create-title-wrap">
              <span class="cli-create-title-icon inc-create-title-icon">
                ${icon("client")}
              </span>

              <div>
                <h2 id="clientes-create-title">Crear cliente</h2>
                <p>
                  Vinculado a un usuario real · contrato productivo /api/clientes.
                </p>
              </div>
            </div>

            <button
              type="button"
              class="cli-create-close inc-create-close"
              data-create-action="${CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              ${icon("close")}
            </button>
          </header>

          <div class="cli-create-body inc-create-body">
            ${
              vm.successMessage
                ? renderAlert(
                    "success",
                    "Cliente creado.",
                    vm.successMessage
                  )
                : ""
            }

            ${
              vm.serverError
                ? renderAlert(
                    "error",
                    "No se pudo crear el cliente.",
                    vm.serverError
                  )
                : ""
            }

            <form
              id="${FORM_ID}"
              data-clientes-create-form="true"
              novalidate
              class="cli-create-form inc-create-form"
            >
              ${renderAdminUserSearch(vm)}
              ${renderFiscalBlock(vm)}
              ${renderContactBlock(vm)}
              ${renderAddressBlock(vm)}

              <div class="cli-create-actions inc-create-actions">
                <button
                  id="clientes-create-submit-btn"
                  type="submit"
                  data-create-action="${CREATE_ACTIONS.SUBMIT}"
                  ${disabledAttrs(
                    vm.submitting ||
                    !vm.admin,
                    vm.submitting
                  )}
                  class="cli-create-submit inc-create-submit"
                >
                  <span class="cli-create-submit-inner inc-create-submit-inner">
                    ${
                      vm.submitting
                        ? `<span class="cli-create-spinner inc-create-spinner" aria-hidden="true"></span>Creando...`
                        : "Crear cliente"
                    }
                  </span>
                </button>
              </div>
            </form>
          </div>

          ${
            vm.submitting
              ? renderLoadingOverlay(
                  "Creando cliente y sincronizando usuario..."
                )
              : ""
          }
        </div>
      </div>
    </section>
  `;
}

export function renderClientesCreateModalClosed() {
  return "";
}

/* =========================================================
   VALIDATION / PUBLIC HELPERS
========================================================= */

export function getCreateFormDefaults() {
  return {
    ...DEFAULT_FORM,
  };
}

export function validateCreateForm(
  form = {}
) {
  const current =
    normalizeForm(form);

  const errors = {};

  if (!current.userId) {
    errors.userId =
      "Selecciona un usuario real antes de crear el cliente.";

    errors.targetUserId =
      errors.userId;
  }

  if (
    !CLIENTE_TYPE_OPTIONS.some(
      (item) =>
        item.value ===
        current.tipo
    )
  ) {
    errors.tipo =
      "Selecciona un tipo de cliente válido.";
  }

  if (!current.nombreFiscal) {
    errors.nombreFiscal =
      "El nombre fiscal es obligatorio.";
  } else if (
    current.nombreFiscal.length >
    150
  ) {
    errors.nombreFiscal =
      "Máximo 150 caracteres.";
  }

  if (
    current.nif &&
    current.nif.length >
    20
  ) {
    errors.nif =
      "Máximo 20 caracteres.";
  }

  if (
    current.contactoEmail &&
    !isValidEmail(
      current.contactoEmail
    )
  ) {
    errors.contactoEmail =
      "Introduce un email válido.";
  }

  if (
    current.contactoPhone &&
    current.contactoPhone.length >
    30
  ) {
    errors.contactoPhone =
      "Máximo 30 caracteres.";
  }

  if (
    current.calle.length >
    150
  ) {
    errors.calle =
      "Máximo 150 caracteres.";
  }

  if (
    current.cp.length >
    10
  ) {
    errors.cp =
      "Máximo 10 caracteres.";
  }

  if (
    current.ciudad.length >
    100
  ) {
    errors.ciudad =
      "Máximo 100 caracteres.";
  }

  if (
    current.provincia.length >
    100
  ) {
    errors.provincia =
      "Máximo 100 caracteres.";
  }

  if (
    current.pais.length >
    100
  ) {
    errors.pais =
      "Máximo 100 caracteres.";
  }

  const payload =
    buildClienteCreatePayload(
      current
    );

  return {
    valid:
      Object.keys(errors)
        .length === 0,

    errors,

    form:
      current,

    payload,
  };
}

export function getCreateTemplateSnapshot() {
  return {
    version:
      CLIENTES_CREATE_TEMPLATE_VERSION,

    actions:
      CREATE_ACTIONS,

    fields: [
      "targetUserSearch",
      "targetUserId",
      "userId",
      "targetClienteId",
      "targetUserName",
      "targetUserEmail",
      "targetUserPhone",
      "targetUsername",
      "targetUserAvatar",

      "tipo",
      "clienteTipo",
      "segmento",

      "nombreFiscal",
      "nif",

      "contactoNombre",
      "contactoEmail",
      "contactoPhone",

      "calle",
      "cp",
      "ciudad",
      "provincia",
      "pais",
    ],

    backendContract: {
      route:
        "POST /api/clientes",

      adminOnly:
        true,

      required: [
        "userId",
        "tipo",
        "nombreFiscal",
      ],

      optional: [
        "nif",
        "calle",
        "cp",
        "ciudad",
        "provincia",
        "pais",
        "contactoNombre",
        "contactoEmail",
        "contactoPhone",
      ],

      payloadFields:
        [...BACKEND_PAYLOAD_FIELDS],

      oneClientPerUser:
        true,

      response:
        "{ ok, clienteId, userId, synced }",
    },

    admin: {
      userSearch:
        true,

      userSearchMinLength:
        USER_SEARCH_MIN_LENGTH,

      actionSearch:
        CREATE_ACTIONS.USER_SEARCH,

      actionSelect:
        CREATE_ACTIONS.USER_SELECT,

      actionClear:
        CREATE_ACTIONS.USER_CLEAR,

      preservesTargetClienteId:
        true,

      requiresUserId:
        true,

      doesNotInventUserId:
        true,
    },

    safeguards: {
      templateOnly:
        true,

      noFetch:
        true,

      noDom:
        true,

      noStore:
        true,

      noRouter:
        true,

      exactBackendPayload:
        true,

      noFrontendCosmosDocument:
        true,

      noIgnoredBillingFields:
        true,

      noFakeSchemaVersion:
        true,

      optionalContactMatchesBackend:
        true,

      payloadFieldCount:
        BACKEND_PAYLOAD_FIELDS.length,
    },
  };
}

export const validateCreateClienteForm =
  validateCreateForm;

export const getClientesCreateFormDefaults =
  getCreateFormDefaults;

export const renderCreateClienteModal =
  renderClientesCreateModal;

export const renderClienteCreateModal =
  renderClientesCreateModal;

export const renderCreateModal =
  renderClientesCreateModal;

export default renderClientesCreateModal;

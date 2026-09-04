import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";
/* =========================================================
   Onion Support - Clientes Create Template
   Archivo: /src/views/clientes/clientes.template.create.js

   PRODUCTIVO · TEMPLATE PURO · BACKEND CONTRACT V4

   Responsabilidad:
   - Renderizar el modal de creación de Clientes.
   - Mantener el contrato DOM consumido por clientes/index.js V6.
   - Validar únicamente reglas compatibles con el backend real.
   - Construir EXACTAMENTE el body de POST /api/clientes.
   - Mantener búsqueda/selección de usuario como estado de presentación.
   - Permitir avatar SAS de Azure en runtime sin exponer URLs firmadas
     de hosts externos.
   - No hacer HTTP, fetch, DOM imperativo, Store, Router ni Auth.
========================================================= */

export const CLIENTES_CREATE_TEMPLATE_VERSION =
  "clientes.template.create.backend-contract.v4.index-v6-api-v4";

export const CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  SUBMIT: "create-submit",

  USER_SEARCH: "create-user-search",
  USER_SELECT: "create-user-select",
  USER_CLEAR: "create-user-clear",

  COPY_USER_CONTACT: "create-copy-user-contact",

  /*
    Compatibilidad pública antigua.
    No existe bloque de facturación en el contrato actual.
  */
  BILLING_TOGGLE: "create-billing-toggle",
});

export const CLIENTES_CREATE_ACTIONS =
  CREATE_ACTIONS;

const MODAL_ID =
  "clientes-create-modal-root";

const PANEL_ID =
  "clientes-create-modal-panel";

const FORM_ID =
  "clientes-create-form";

const USER_SEARCH_INPUT_ID =
  "clientes-create-target-user-search";

const USER_RESULTS_ID =
  "clientes-create-user-results";

const USER_SEARCH_MIN_LENGTH = 2;

const MAX_USER_RESULTS = 12;

const CLIENTE_TYPE_OPTIONS =
  Object.freeze([
    {
      value: "particular",
      label: "Particular",
    },
    {
      value: "empresa",
      label: "Empresa",
    },
  ]);

const BACKEND_PAYLOAD_FIELDS =
  Object.freeze([
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

const FIELD_LIMITS =
  Object.freeze({
    userId: 160,
    clienteId: 160,
    nombreFiscal: 150,
    nif: 20,
    calle: 150,
    cp: 10,
    ciudad: 100,
    provincia: 100,
    pais: 100,
    contactoNombre: 150,
    contactoEmail: 150,
    contactoPhone: 30,
    username: 160,
  });

/*
  Campos auxiliares usados por index.js.
  No se incluyen en buildClienteCreatePayload().
*/
const DEFAULT_FORM =
  Object.freeze({
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
      Aliases temporales para el controlador.
      No forman parte del POST /api/clientes.
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

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

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

function cleanText(
  value = "",
  fallback = ""
) {
  const text =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

/*
  No aplanar arrays.
*/
function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function escapeHtml(
  value = ""
) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(
  value = ""
) {
  return escapeHtml(
    cleanText(
      value,
      ""
    )
  );
}

function normalizeKey(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function trimField(
  value = "",
  maxLength = 0,
  fallback = ""
) {
  const text =
    cleanText(
      value,
      fallback
    );

  if (
    !maxLength ||
    maxLength < 1
  ) {
    return text;
  }

  return text.slice(
    0,
    maxLength
  );
}

function normalizeEmailText(
  value = ""
) {
  const email =
    cleanText(value, "")
      .toLowerCase();

  if (!email) {
    return "";
  }

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

  return email.slice(
    0,
    FIELD_LIMITS.contactoEmail
  );
}

function isValidEmail(
  value = ""
) {
  const email =
    normalizeEmailText(
      value
    );

  return Boolean(
    email &&
    email.length <=
      FIELD_LIMITS.contactoEmail &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

function firstValidEmail(
  ...values
) {
  for (const value of values) {
    const email =
      normalizeEmailText(
        value
      );

    if (
      email &&
      isValidEmail(email)
    ) {
      return email;
    }
  }

  return "";
}

function normalizePhone(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  return raw
    .replace(
      /[^\d+()\s.\-]/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(
      0,
      FIELD_LIMITS.contactoPhone
    );
}

function normalizeClienteType(
  value = ""
) {
  const key =
    normalizeKey(
      value ||
      "empresa"
    );

  if (
    [
      "particular",
      "persona",
      "individual",
      "b2c",
    ].includes(key)
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

/* =========================================================
   SAFE AVATAR URL
========================================================= */

function hasAppSecretQuery(
  value = ""
) {
  return /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
    String(value || "")
  );
}

function isAzureBlobHost(
  hostname = ""
) {
  const host =
    cleanText(
      hostname,
      ""
    ).toLowerCase();

  return (
    host.endsWith(
      ".blob.core.windows.net"
    ) ||
    host ===
      "blob.core.windows.net"
  );
}

function hasAzureSignature(
  parsed = null
) {
  return Boolean(
    parsed
      ?.searchParams &&
    (
      parsed.searchParams
        .has("sig") ||
      parsed.searchParams
        .has("signature") ||
      parsed.searchParams
        .has("sas")
    )
  );
}

function safeImageSrc(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(?:javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (
    /^blob:/i.test(raw)
  ) {
    return raw;
  }

  if (
    raw.startsWith("/")
  ) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (
    raw.startsWith("./") ||
    raw.startsWith("../")
  ) {
    return raw;
  }

  if (
    /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    !/^https:\/\//i.test(
      raw
    )
  ) {
    return "";
  }

  try {
    const parsed =
      new URL(raw);

    if (
      hasAppSecretQuery(
        parsed.href
      )
    ) {
      return "";
    }

    /*
      `sig` sólo es aceptable en un Blob Azure.
      Así mantenemos avatares SAS runtime sin permitir un
      query firmado arbitrario en un host externo.
    */
    if (
      hasAzureSignature(
        parsed
      ) &&
      !isAzureBlobHost(
        parsed.hostname
      )
    ) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function firstImageSrc(
  ...values
) {
  const queue =
    [...values];

  const seen =
    new Set();

  while (
    queue.length
  ) {
    const value =
      queue.shift();

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      isObject(value)
    ) {
      if (
        seen.has(value)
      ) {
        continue;
      }

      seen.add(value);

      queue.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,

        value.profile
          ?.avatarUrl,

        value.profile
          ?.avatar,

        value.profile
          ?.picture,

        value.raw
          ?.avatarUrl,

        value.raw
          ?.avatar,

        value.raw
          ?.picture
      );

      continue;
    }

    const src =
      safeImageSrc(
        value
      );

    if (src) {
      return src;
    }
  }

  return "";
}

/* =========================================================
   ICONS
========================================================= */

function icon(
  name = ""
) {
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

  return (
    icons[name] ||
    icons.client
  );
}

/* =========================================================
   USER NORMALIZER
========================================================= */

function normalizeUserResult(
  user = {}
) {
  const raw =
    safeObject(
      user,
      {}
    );

  const nested =
    safeObject(
      raw.raw,
      {}
    );

  const profile =
    safeObject(
      first(
        raw.profile,
        nested.profile,
        {}
      ),
      {}
    );

  const userId =
    trimField(
      first(
        raw.userId,
        raw.id,
        raw.uid,
        raw.sub,
        raw.usuarioId,

        raw.lookup
          ?.userId,

        raw.lookup
          ?.id,

        raw.auth
          ?.userId,

        profile.userId,

        nested.userId,
        nested.id,
        nested.uid,
        nested.sub,
        nested.usuarioId,
        ""
      ),
      FIELD_LIMITS.userId
    );

  const clienteId =
    trimField(
      first(
        raw.targetClienteId,
        raw.clienteId,
        raw.clientId,
        raw.customerId,

        raw.lookup
          ?.clienteId,

        raw.lookup
          ?.clientId,

        raw.tenant
          ?.clienteId,

        raw.cliente
          ?.clienteId,

        raw.cliente
          ?.id,

        raw.client
          ?.clienteId,

        raw.client
          ?.id,

        profile.clienteId,
        profile.clientId,

        nested.targetClienteId,
        nested.clienteId,
        nested.clientId,
        nested.customerId,
        ""
      ),
      FIELD_LIMITS.clienteId
    );

  const name =
    trimField(
      first(
        raw.displayName,
        raw.fullName,
        raw.name,
        raw.nombre,
        raw.publicName,

        profile.publicName,
        profile.displayName,
        profile.name,

        raw.lookup
          ?.displayName,

        raw.lookup
          ?.name,

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
      FIELD_LIMITS.nombreFiscal,
      "Usuario"
    );

  const email =
    firstValidEmail(
      raw.email,
      raw.emailLower,
      raw.userEmail,
      profile.email,

      raw.lookup
        ?.email,

      nested.email,
      nested.emailLower,
      ""
    );

  const phone =
    normalizePhone(
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

  const username =
    trimField(
      first(
        raw.username,
        raw.usernameLower,
        raw.userName,
        profile.username,
        nested.username,
        nested.usernameLower,
        ""
      ),
      FIELD_LIMITS.username
    );

  const avatarUrl =
    firstImageSrc(
      raw,
      nested,
      profile
    );

  const role =
    trimField(
      first(
        raw.role,
        raw.rol,
        nested.role,
        nested.rol,
        "user"
      ),
      40,
      "user"
    );

  const presentation = resolveAvatarPresentation({ name, email, userId, username });

  return {
    ...raw,

    /*
      Sólo para el VM del template.
      No se usa en el payload de creación.
    */
    raw,

    id:
      userId,

    userId,
    uid:
      userId,

    targetUserId:
      userId,

    clienteId,

    targetClienteId:
      clienteId,

    clientId:
      clienteId,

    name,
    nombre:
      name,

    fullName:
      name,

    displayName:
      name,

    email,
    emailLower:
      email,

    username,
    usernameLower:
      username.toLowerCase(),

    role,
    rol:
      role,

    phone,
    telefono:
      phone,

    avatarUrl,
    avatar:
      avatarUrl ||
      null,

    picture:
      avatarUrl ||
      "",

    initials: presentation.initials,
    tone: presentation.tone,
  };
}

/* =========================================================
   FORM NORMALIZER
========================================================= */

function normalizeForm(
  form = {}
) {
  const input = {
    ...DEFAULT_FORM,
    ...safeObject(
      form,
      {}
    ),
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

  const hasSelectedUser =
    Boolean(
      selectedUser.userId ||
      selectedUser.id
    );

  const userId =
    trimField(
      first(
        input.userId,
        input.targetUserId,

        hasSelectedUser
          ? selectedUser.userId
          : "",

        hasSelectedUser
          ? selectedUser.id
          : "",

        input.usuarioId,
        input.uid,
        ""
      ),
      FIELD_LIMITS.userId
    );

  const targetClienteId =
    trimField(
      first(
        input.targetClienteId,
        input.clienteId,
        input.clientId,

        hasSelectedUser
          ? selectedUser.targetClienteId
          : "",

        hasSelectedUser
          ? selectedUser.clienteId
          : "",

        ""
      ),
      FIELD_LIMITS.clienteId
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

  const selectedName =
    trimField(
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
      FIELD_LIMITS.nombreFiscal
    );

  const selectedEmail =
    firstValidEmail(
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
    trimField(
      first(
        input.targetUsername,

        hasSelectedUser
          ? selectedUser.username
          : "",

        ""
      ),
      FIELD_LIMITS.username
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
    trimField(
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
      FIELD_LIMITS.nombreFiscal
    );

  const nif =
    trimField(
      first(
        input.nif,
        input.cif,
        input.vatNumber,
        input.taxId,
        ""
      ),
      FIELD_LIMITS.nif
    ).toUpperCase();

  const contactoNombre =
    trimField(
      first(
        input.contactoNombre,
        input.contactName,

        input.contacto
          ?.nombre,

        selectedName,
        nombreFiscal,
        ""
      ),
      FIELD_LIMITS.contactoNombre
    );

  /*
    IMPORTANTE:
    preservamos el texto inválido para que validateCreateForm()
    pueda marcarlo. No se convierte silenciosamente en "".
  */
  const explicitContactEmail =
    normalizeEmailText(
      first(
        input.contactoEmail,
        input.email,
        input.emailCliente,

        input.contacto
          ?.email,

        ""
      )
    );

  const contactoEmail =
    explicitContactEmail ||
    selectedEmail;

  const contactoPhone =
    normalizePhone(
      first(
        input.contactoPhone,
        input.phone,
        input.telefono,

        input.contacto
          ?.phone,

        input.contacto
          ?.telefono,

        selectedPhone,
        ""
      )
    );

  const calle =
    trimField(
      first(
        input.calle,

        input.direccion
          ?.calle,

        input.address
          ?.street,

        ""
      ),
      FIELD_LIMITS.calle
    );

  const cp =
    trimField(
      first(
        input.cp,
        input.postalCode,
        input.codigoPostal,

        input.direccion
          ?.cp,

        ""
      ),
      FIELD_LIMITS.cp
    );

  const ciudad =
    trimField(
      first(
        input.ciudad,
        input.city,

        input.direccion
          ?.ciudad,

        ""
      ),
      FIELD_LIMITS.ciudad
    );

  const provincia =
    trimField(
      first(
        input.provincia,
        input.province,

        input.direccion
          ?.provincia,

        ""
      ),
      FIELD_LIMITS.provincia
    );

  const pais =
    trimField(
      first(
        input.pais,
        input.country,

        input.direccion
          ?.pais,

        "España"
      ),
      FIELD_LIMITS.pais,
      "España"
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
      (
        isValidEmail(
          contactoEmail
        )
          ? contactoEmail
          : ""
      ),

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
      firstValidEmail(
        input.emailFacturacion,
        contactoEmail
      ),

    username:
      trimField(
        first(
          input.username,
          selectedUsername,
          ""
        ),
        FIELD_LIMITS.username
      ),

    slug:
      trimField(
        input.slug,
        FIELD_LIMITS.username
      ),
  };
}

export function normalizeClienteCreateForm(
  form = {}
) {
  return normalizeForm(
    form
  );
}

function buildSelectedUser(
  form = {},
  userSearch = {}
) {
  const selected =
    safeObject(
      userSearch.selectedUser,
      {}
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

function buildVm(
  input = {}
) {
  const raw =
    safeObject(
      input,
      {}
    );

  const form =
    normalizeForm(
      raw.form ||
      raw.values ||
      raw
    );

  const userResults =
    safeArray(
      raw.userSearch
        ?.results
    )
      .map(
        normalizeUserResult
      )
      .filter(
        (user) =>
          Boolean(
            user.userId ||
            user.id
          )
      )
      .slice(
        0,
        MAX_USER_RESULTS
      );

  const userSearch = {
    query:
      cleanText(
        raw.userSearch
          ?.query,
        ""
      ),

    loading:
      Boolean(
        raw.userSearch
          ?.loading
      ),

    error:
      cleanText(
        raw.userSearch
          ?.error,
        ""
      ),

    empty:
      Boolean(
        raw.userSearch
          ?.empty
      ),

    results:
      userResults,

    selectedUser:
      raw.userSearch
        ?.selectedUser
        ? normalizeUserResult(
            raw.userSearch
              .selectedUser
          )
        : null,
  };

  const role =
    cleanText(
      raw.role,
      "user"
    );

  return {
    open:
      raw.open !== false,

    admin:
      Boolean(
        raw.admin === true ||
        raw.isAdmin === true ||
        normalizeKey(role) ===
          "admin"
      ),

    role,

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
      trimField(
        raw.createdClienteId ||
        raw.clienteId ||
        raw.clientId,
        FIELD_LIMITS.clienteId
      ),

    errors:
      safeObject(
        raw.errors,
        {}
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
    normalizeForm(
      form
    );

  /*
    EXACTAMENTE los 12 campos aceptados por POST /api/clientes.
    Ningún alias auxiliar sale de este template.
  */
  return {
    userId:
      current.userId,

    tipo:
      current.tipo,

    nombreFiscal:
      current.nombreFiscal,

    nif:
      current.nif ||
      "",

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
  error = "",
  fieldName = ""
) {
  const text =
    cleanText(
      error,
      ""
    );

  if (!text) {
    return "";
  }

  const id =
    fieldName
      ? `clientes-create-${fieldName}-error`
      : "";

  return `
    <p
      ${id ? `id="${attr(id)}"` : ""}
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

  const errorId =
    error
      ? `${id}-error`
      : "";

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
          ${errorId ? `aria-invalid="true" aria-describedby="${attr(errorId)}"` : ""}
          ${disabledAttrs(disabled, disabled)}
        >
      </span>

      ${
        help
          ? `<span class="cli-create-help inc-create-help">${escapeHtml(help)}</span>`
          : ""
      }

      ${renderFieldError(error, name)}
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

  const errorId =
    error
      ? `${id}-error`
      : "";

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
        ${errorId ? `aria-invalid="true" aria-describedby="${attr(errorId)}"` : ""}
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

      ${renderFieldError(error, name)}
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
    normalizeUserResult(
      user
    );

  const src =
    safeImageSrc(
      current.avatarUrl
    );

  const name =
    current.displayName ||
    current.name ||
    current.userId ||
    "Usuario";

  const presentation = resolveAvatarPresentation({
    ...current,
    name,
    displayName: name,
  });

  return `
    <span
      class="cli-create-user-avatar inc-create-user-avatar ${attr(extraClass)}"
      data-avatar-system="true"
      data-avatar-host="true"
      data-avatar-name="${attr(presentation.name)}"
      data-avatar-email="${attr(presentation.email)}"
      data-avatar-user-id="${attr(presentation.userId)}"
      data-avatar-username="${attr(presentation.username)}"
      data-avatar-initials="${attr(presentation.initials)}"
      data-avatar-identity="${attr(presentation.fingerprint)}"
      data-avatar-tone="${attr(String(presentation.tone))}"
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
        ${escapeHtml(presentation.initials)}
      </span>
    </span>
  `;
}

/* =========================================================
   USER SEARCH
========================================================= */

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
        selected
          ?.clienteId,

      displayName:
        form.targetUserName ||
        selected
          ?.displayName ||
        selected
          ?.name,

      email:
        form.targetUserEmail ||
        selected
          ?.email,

      phone:
        form.targetUserPhone ||
        selected
          ?.phone,

      username:
        form.targetUsername ||
        selected
          ?.username,

      avatarUrl:
        form.targetUserAvatar ||
        selected
          ?.avatarUrl ||
        selected
          ?.avatar,
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

  const query =
    cleanText(
      search.query,
      ""
    );

  if (
    query.length <
      USER_SEARCH_MIN_LENGTH &&
    !search.loading
  ) {
    return "";
  }

  if (
    search.loading
  ) {
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

  if (
    search.error
  ) {
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

  if (
    search.empty ||
    (
      query.length >=
        USER_SEARCH_MIN_LENGTH &&
      !search.results.length
    )
  ) {
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

  if (
    !search.results.length
  ) {
    return "";
  }

  return `
    <div
      id="${USER_RESULTS_ID}"
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
                aria-selected="false"
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
  if (
    !vm.admin
  ) {
    return renderAlert(
      "error",
      "Acceso restringido.",
      "La creación de clientes requiere rol administrador."
    );
  }

  const userError =
    vm.errors.userId ||
    vm.errors.targetUserId ||
    vm.errors.targetUser ||
    "";

  const query =
    cleanText(
      vm.userSearch.query,
      ""
    );

  const expanded =
    query.length >=
      USER_SEARCH_MIN_LENGTH &&
    (
      vm.userSearch.loading ||
      vm.userSearch.error ||
      vm.userSearch.empty ||
      vm.userSearch.results.length >
        0
    );

  return `
    <section
      class="cli-create-block cli-create-block--user-search cli-create-block--target inc-create-block inc-create-block--user-search inc-create-block--target"
      data-create-admin-user-search="true"
      data-user-search-active="${query ? "true" : "false"}"
      data-user-selected="${vm.form.targetUserId ? "true" : "false"}"
    >
      <div class="cli-create-block-head inc-create-block-head">
        <div>
          <strong>Usuario vinculado</strong>
          <span>
            Selecciona el usuario real. El backend vincula el cliente por userId.
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
        class="cli-create-field inc-create-field ${userError ? "is-error" : ""}"
        data-create-field="targetUserSearch"
        for="${USER_SEARCH_INPUT_ID}"
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
            id="${USER_SEARCH_INPUT_ID}"
            class="cli-create-input cli-create-input--with-icon cli-create-user-search-input inc-create-input inc-create-input--with-icon inc-create-user-search-input"
            data-field="targetUserSearch"
            data-create-user-search-input="true"
            name="targetUserSearch"
            type="search"
            value="${attr(query)}"
            placeholder="Nombre, usuario, email o ID"
            autocomplete="off"
            spellcheck="false"
            aria-autocomplete="list"
            aria-controls="${USER_RESULTS_ID}"
            aria-expanded="${expanded ? "true" : "false"}"
            ${userError ? `aria-invalid="true" aria-describedby="clientes-create-targetUserId-error"` : ""}
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
          userError,
          "targetUserId"
        )}
      </div>
    </section>
  `;
}

/* =========================================================
   FORM BLOCKS
========================================================= */

function renderFiscalBlock(
  vm = {}
) {
  const form =
    vm.form;

  return renderBlock(
    "Datos fiscales",
    "Datos persistidos por POST /api/clientes.",
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
            form.tipo ===
              "empresa"
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
            String(
              FIELD_LIMITS.nif
            ),

          help:
            "Opcional.",
        })}
      </div>

      ${renderInput({
        label:
          form.tipo ===
            "empresa"
            ? "Nombre fiscal / Razón social"
            : "Nombre completo fiscal",

        name:
          "nombreFiscal",

        value:
          form.nombreFiscal,

        placeholder:
          form.tipo ===
            "empresa"
            ? "Ej. Empresa SL"
            : "Ej. Javier Harandou",

        required:
          true,

        error:
          vm.errors.nombreFiscal,

        disabled:
          vm.submitting,

        iconName:
          form.tipo ===
            "empresa"
            ? "building"
            : "user",

        maxLength:
          String(
            FIELD_LIMITS.nombreFiscal
          ),
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
    "Opcional; puedes copiar los datos del usuario vinculado.",
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
          String(
            FIELD_LIMITS.contactoNombre
          ),

        help:
          "Si queda vacío, se utilizará el nombre fiscal al construir el POST.",
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
            String(
              FIELD_LIMITS.contactoEmail
            ),

          help:
            "Opcional.",
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
            String(
              FIELD_LIMITS.contactoPhone
            ),
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
    "Campos opcionales del cliente.",
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
          String(
            FIELD_LIMITS.calle
          ),
      })}

      <div class="cli-create-grid cli-create-grid--3 inc-create-grid inc-create-grid--3">
        ${renderInput({
          label:
            "Código postal",

          name:
            "cp",

          value:
            form.cp,

          placeholder:
            "08001",

          error:
            vm.errors.cp,

          disabled:
            vm.submitting,

          inputmode:
            "numeric",

          autocomplete:
            "postal-code",

          maxLength:
            String(
              FIELD_LIMITS.cp
            ),
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

          autocomplete:
            "address-level2",

          maxLength:
            String(
              FIELD_LIMITS.ciudad
            ),
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

          autocomplete:
            "address-level1",

          maxLength:
            String(
              FIELD_LIMITS.provincia
            ),
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

        error:
          vm.errors.pais,

        disabled:
          vm.submitting,

        autocomplete:
          "country-name",

        maxLength:
          String(
            FIELD_LIMITS.pais
          ),

        help:
          "Si queda vacío, se enviará España.",
      })}
    `,
    "cli-create-block--address inc-create-block--address"
  );
}

/* =========================================================
   ALERTS / LOADING
========================================================= */

function renderAlert(
  type = "info",
  title = "",
  body = ""
) {
  const safeType =
    [
      "info",
      "success",
      "error",
      "warning",
    ].includes(
      normalizeKey(type)
    )
      ? normalizeKey(type)
      : "info";

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
      class="cli-create-alert inc-create-alert is-${attr(safeType)}"
      role="${safeType === "error" ? "alert" : "status"}"
      aria-live="${safeType === "error" ? "assertive" : "polite"}"
    >
      <span class="cli-create-alert-icon inc-create-alert-icon" aria-hidden="true">
        ${
          safeType ===
            "success"
            ? icon("check")
            : safeType ===
                "error"
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
      data-create-loading-overlay="true"
    >
      <div class="cli-create-loading-card inc-create-loading-card" role="status">
        <span class="cli-create-loading-spinner inc-create-loading-spinner" aria-hidden="true"></span>
        <span class="cli-create-loading-copy inc-create-loading-copy">
          <strong>${escapeHtml(label)}</strong>
          <small>Guardando el cliente y sincronizando la vinculación con el usuario.</small>
        </span>
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
  const vm = buildVm(input);
  if (!vm.open) return "";

  return `
    <section
      id="${MODAL_ID}"
      data-clientes-create-root="true"
      data-clientes-modal="create"
      data-open="true"
      data-template-version="${attr(CLIENTES_CREATE_TEMPLATE_VERSION)}"
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
          aria-describedby="clientes-create-subtitle"
          tabindex="-1"
        >
          <header class="cli-create-header inc-create-header">
            <div class="cli-create-header-copy inc-create-header-copy">
              <h2 id="clientes-create-title">Crear cliente</h2>
              <p id="clientes-create-subtitle">Vincula un usuario real y completa los datos fiscales, de contacto y dirección del cliente.</p>
            </div>

            <button
              type="button"
              class="cli-create-close inc-create-close"
              data-create-action="${CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >${icon("close")}</button>
          </header>

          <div class="cli-create-body inc-create-body">
            ${vm.successMessage ? renderAlert("success", "Cliente creado.", vm.successMessage) : ""}
            ${vm.serverError ? renderAlert("error", "No se pudo crear el cliente.", vm.serverError) : ""}

            <form
              id="${FORM_ID}"
              data-clientes-create-form="true"
              novalidate
              class="cli-create-form inc-create-form"
              autocomplete="off"
            >
              ${renderAdminUserSearch(vm)}
              ${renderFiscalBlock(vm)}
              ${renderContactBlock(vm)}
              ${renderAddressBlock(vm)}

              <div class="cli-create-actions inc-create-actions">
                <span class="cli-create-actions-note inc-create-actions-note">El cliente quedará vinculado al usuario seleccionado y disponible en las vistas privadas.</span>
                <button
                  id="clientes-create-submit-btn"
                  type="submit"
                  data-create-action="${CREATE_ACTIONS.SUBMIT}"
                  ${disabledAttrs(vm.submitting || !vm.admin, vm.submitting)}
                  class="cli-create-submit inc-create-submit"
                >
                  <span class="cli-create-submit-inner inc-create-submit-inner">
                    ${vm.submitting ? `<span class="cli-create-spinner inc-create-spinner" aria-hidden="true"></span>Creando...` : "Crear cliente"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          ${vm.submitting ? renderLoadingOverlay("Creando cliente y sincronizando usuario...") : ""}
        </div>
      </div>
    </section>
  `;
}

export function renderClientesCreateModalClosed() {
  return "";
}

/* =========================================================
   VALIDATION
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
    normalizeForm(
      form
    );

  const errors = {};

  if (
    !current.userId
  ) {
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

  if (
    !current.nombreFiscal
  ) {
    errors.nombreFiscal =
      "El nombre fiscal es obligatorio.";
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

  /*
    Los límites ya se aplican al normalizar y coinciden con la API.
    Se mantienen comprobaciones defensivas por si cambia el normalizador.
  */
  if (
    current.nombreFiscal.length >
      FIELD_LIMITS.nombreFiscal
  ) {
    errors.nombreFiscal =
      `Máximo ${FIELD_LIMITS.nombreFiscal} caracteres.`;
  }

  if (
    current.nif.length >
      FIELD_LIMITS.nif
  ) {
    errors.nif =
      `Máximo ${FIELD_LIMITS.nif} caracteres.`;
  }

  if (
    current.contactoNombre.length >
      FIELD_LIMITS.contactoNombre
  ) {
    errors.contactoNombre =
      `Máximo ${FIELD_LIMITS.contactoNombre} caracteres.`;
  }

  if (
    current.contactoEmail.length >
      FIELD_LIMITS.contactoEmail
  ) {
    errors.contactoEmail =
      `Máximo ${FIELD_LIMITS.contactoEmail} caracteres.`;
  }

  if (
    current.contactoPhone.length >
      FIELD_LIMITS.contactoPhone
  ) {
    errors.contactoPhone =
      `Máximo ${FIELD_LIMITS.contactoPhone} caracteres.`;
  }

  if (
    current.calle.length >
      FIELD_LIMITS.calle
  ) {
    errors.calle =
      `Máximo ${FIELD_LIMITS.calle} caracteres.`;
  }

  if (
    current.cp.length >
      FIELD_LIMITS.cp
  ) {
    errors.cp =
      `Máximo ${FIELD_LIMITS.cp} caracteres.`;
  }

  if (
    current.ciudad.length >
      FIELD_LIMITS.ciudad
  ) {
    errors.ciudad =
      `Máximo ${FIELD_LIMITS.ciudad} caracteres.`;
  }

  if (
    current.provincia.length >
      FIELD_LIMITS.provincia
  ) {
    errors.provincia =
      `Máximo ${FIELD_LIMITS.provincia} caracteres.`;
  }

  if (
    current.pais.length >
      FIELD_LIMITS.pais
  ) {
    errors.pais =
      `Máximo ${FIELD_LIMITS.pais} caracteres.`;
  }

  const payload =
    buildClienteCreatePayload(
      current
    );

  return {
    valid:
      Object.keys(
        errors
      ).length === 0,

    errors,

    form:
      current,

    payload,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

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
        [
          ...BACKEND_PAYLOAD_FIELDS,
        ],

      payloadFieldCount:
        BACKEND_PAYLOAD_FIELDS.length,

      response:
        "{ ok, clienteId, userId, synced }",
    },

    admin: {
      userSearch:
        true,

      userSearchMinLength:
        USER_SEARCH_MIN_LENGTH,

      maxRenderedUserResults:
        MAX_USER_RESULTS,

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

      noDomImperative:
        true,

      noStore:
        true,

      noRouter:
        true,

      noAuth:
        true,

      exactBackendPayload:
        true,

      noFrontendCosmosDocument:
        true,

      noIgnoredBillingFields:
        true,

      preservesInvalidEmailForValidation:
        true,

      azureSasAvatarRuntimeSafe:
        true,

      externalSignedAvatarRejected:
        true,

      htmlEscaped:
        true,

      compatibleWithClientesIndexV6:
        true,

      compatibleWithClientesApiV4:
        true,
    },
  };
}

/* =========================================================
   COMPAT ALIASES
========================================================= */

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

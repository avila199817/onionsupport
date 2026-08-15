/* =========================================================
   Onion Support - Clientes API
   Archivo: /src/views/clientes/clientes.api.js

   PRODUCTIVO · CONTRATO BACKEND REAL · HTTP ÚNICO · V4

   Responsabilidad:
   - Ser el único adaptador HTTP de la vista Clientes.
   - Ajustarse al contrato productivo actual:
       GET  /api/clientes
       GET  /api/clientes/:id
       POST /api/clientes
   - NO inventar PATCH / PUT / DELETE.
   - Mantener store canónico, cache de lectura y single-flight.
   - Tratar el POST de creación como ACK, nunca como cliente completo.
   - Invalidar cargas obsoletas tras mutaciones.
   - Dedupe de detalle y creación para evitar peticiones duplicadas.
   - Cachear únicamente una proyección segura de listado.
   - No persistir URLs temporales/SAS ni campos sensibles.
   - Sin fetch, DOM operativo, Router, Auth ni navegación propios.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const CLIENTES_API_VERSION =
  "clientes.api.backend-contract.v4.safe-cache-singleflight";

export const CLIENTES_ENDPOINT = "/api/clientes";

export const CLIENTES_CACHE_SCHEMA_VERSION = 4;
export const CLIENTES_CACHE_KEY =
  "onion.support.clientes.api.cache.v4";

const LEGACY_CACHE_KEYS = Object.freeze([
  "onion.support.clientes.api.cache.v3",
]);

export const CLIENTES_CACHE_TTL_MS = 60_000;

export const CLIENTES_TIMEOUT = 15_000;
export const CLIENTES_DETAIL_TIMEOUT = 20_000;
export const CLIENTES_MUTATION_TIMEOUT = 25_000;

/*
  Compatibilidad de exports.
  El backend actual entrega el listado completo y no pagina.
*/
export const CLIENTES_FETCH_LIMIT = 250;
export const CLIENTES_LIST_LIMIT = CLIENTES_FETCH_LIMIT;
export const CLIENTES_MAX_LIMIT = 500;
export const CLIENTES_MAX_PAGES = 1;

const CLIENTE_ID_MAX_LENGTH = 160;
const USER_ID_MAX_LENGTH = 160;
const TYPE_MAX_LENGTH = 20;

const NAME_MAX_LENGTH = 150;
const NIF_MAX_LENGTH = 20;
const STREET_MAX_LENGTH = 150;
const POSTAL_CODE_MAX_LENGTH = 10;
const CITY_MAX_LENGTH = 100;
const PROVINCE_MAX_LENGTH = 100;
const COUNTRY_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 150;
const PHONE_MAX_LENGTH = 30;

const CACHE_ARRAY_LIMIT = 10_000;
const SAFE_OBJECT_MAX_DEPTH = 8;

let lastLoadToken = 0;
let stateEpoch = 0;

const detailInflight = new Map();
const createInflight = new Map();

const clientesState = {
  items: [],
  remoteCount: 0,

  loading: false,
  refreshing: false,

  loaded: false,
  hydrated: false,

  error: "",
  lastSyncAt: 0,

  inflightLoad: null,
};

let clientesStore = [];

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
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
  const output =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

/*
  No aplanar arrays.
  `{ clientes: [] }` y `{ items: [] }` son envelopes válidos.
*/
function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
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

function number(
  value = 0,
  fallback = 0
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (
    typeof value === "string"
  ) {
    let normalized =
      value
        .trim()
        .replace(/[€$£¥%]/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s+/g, "");

    if (
      !normalized ||
      normalized === "-" ||
      normalized === "+"
    ) {
      return fallback;
    }

    const comma =
      normalized.lastIndexOf(",");

    const dot =
      normalized.lastIndexOf(".");

    if (
      comma >= 0 &&
      dot >= 0
    ) {
      normalized =
        comma > dot
          ? normalized
              .replace(/\./g, "")
              .replace(/,/g, ".")
          : normalized
              .replace(/,/g, "");
    } else if (comma >= 0) {
      normalized =
        normalized.replace(/,/g, ".");
    }

    const parsed =
      Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
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

function normalizeSearch(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9@._+\-\s]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(
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

  return email;
}

function isValidEmail(
  value = ""
) {
  const email =
    normalizeEmail(value);

  return Boolean(
    email &&
    email.length <=
      EMAIL_MAX_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

function firstEmail(
  ...values
) {
  for (const value of values) {
    const email =
      normalizeEmail(value);

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
    cleanText(value, "");

  if (!raw) {
    return "";
  }

  return raw
    .replace(/[^\d+()\s.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(
      0,
      PHONE_MAX_LENGTH
    );
}

function parseBoolean(
  value,
  fallback = null
) {
  if (
    value === true ||
    value === false
  ) {
    return value;
  }

  if (
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  if (
    typeof value === "string"
  ) {
    const key =
      normalizeKey(value);

    if (
      [
        "true",
        "yes",
        "si",
        "on",
        "enabled",
        "active",
        "activo",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "no",
        "off",
        "disabled",
        "inactive",
        "inactivo",
      ].includes(key)
    ) {
      return false;
    }
  }

  return fallback;
}

function normalizeClienteType(
  value = ""
) {
  const type =
    normalizeKey(value)
      .slice(
        0,
        TYPE_MAX_LENGTH
      );

  if (
    [
      "empresa",
      "company",
      "business",
      "b2b",
      "autonomo",
    ].includes(type)
  ) {
    return "empresa";
  }

  if (
    [
      "particular",
      "persona",
      "individual",
      "b2c",
    ].includes(type)
  ) {
    return "particular";
  }

  return "";
}

function redactText(
  value = ""
) {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function safeError(
  error = null,
  fallback =
    "No se pudieron cargar los clientes."
) {
  const raw =
    cleanText(
      first(
        error?.message,
        error?.data?.message,
        error?.payload?.message,
        error?.response?.data?.message,
        error?.response?.message,
        error?.error,
        error?.code,
        fallback
      ),
      fallback
    );

  return cleanText(
    redactText(raw),
    fallback
  ).slice(0, 500);
}

function createContractError(
  code = "CLIENTES_CONTRACT_ERROR",
  message = code,
  status = 400
) {
  const error =
    new Error(
      cleanText(
        redactText(message),
        code
      )
    );

  error.code =
    cleanText(
      code,
      "CLIENTES_CONTRACT_ERROR"
    );

  error.status =
    Math.max(
      0,
      number(
        status,
        400
      )
    );

  return error;
}

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(
  token
) {
  return (
    token ===
    lastLoadToken
  );
}

function bumpStateEpoch() {
  stateEpoch += 1;
  return stateEpoch;
}

function isActiveEpoch(
  epoch
) {
  return (
    epoch ===
    stateEpoch
  );
}

/* =========================================================
   SECURITY / SAFE OBJECTS
========================================================= */

const SENSITIVE_KEY_RE =
  /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|pwd|secret|authorization|cookie|jwt|api[_-]?key|connection[_-]?string|sas|sig|signature|activation[_-]?token|reset[_-]?token|activationUrl|resetUrl|signedUrl|sasUrl)$/i;

const PROTOTYPE_KEY_RE =
  /^(?:__proto__|prototype|constructor)$/i;

function sanitizeDomainValue(
  value,
  depth = 0,
  seen = new WeakSet()
) {
  if (
    depth >
    SAFE_OBJECT_MAX_DEPTH
  ) {
    return null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }

  const type =
    typeof value;

  if (
    type === "string"
  ) {
    return redactText(value)
      .slice(0, 10_000);
  }

  if (
    type === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (
    type === "boolean"
  ) {
    return value;
  }

  if (
    type === "bigint"
  ) {
    return String(value);
  }

  if (
    type === "function" ||
    type === "symbol"
  ) {
    return undefined;
  }

  if (
    value instanceof Date
  ) {
    return Number.isFinite(
      value.getTime()
    )
      ? value.toISOString()
      : null;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(
        0,
        CACHE_ARRAY_LIMIT
      )
      .map(
        (item) =>
          sanitizeDomainValue(
            item,
            depth + 1,
            seen
          )
      )
      .filter(
        (item) =>
          item !==
          undefined
      );
  }

  if (
    !isObject(value)
  ) {
    return null;
  }

  try {
    if (
      seen.has(value)
    ) {
      return null;
    }

    seen.add(value);
  } catch {
    // WeakSet sólo falla con no-objetos; ya filtrado.
  }

  const output = {};

  for (
    const [
      key,
      child,
    ]
    of Object.entries(value)
  ) {
    if (
      !key ||
      PROTOTYPE_KEY_RE.test(
        key
      ) ||
      SENSITIVE_KEY_RE.test(
        key
      )
    ) {
      continue;
    }

    const clean =
      sanitizeDomainValue(
        child,
        depth + 1,
        seen
      );

    if (
      clean !==
      undefined
    ) {
      output[key] =
        clean;
    }
  }

  return output;
}

/* =========================================================
   URL / AVATAR POLICY
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
  if (!parsed?.searchParams) {
    return false;
  }

  return (
    parsed.searchParams
      .has("sig") ||
    parsed.searchParams
      .has("signature") ||
    parsed.searchParams
      .has("sas")
  );
}

function safeAvatarUrl(
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

function safeAvatarUrlForCache(
  value = ""
) {
  const safe =
    safeAvatarUrl(value);

  if (!safe) {
    return "";
  }

  if (
    /^blob:/i.test(safe)
  ) {
    return "";
  }

  if (
    !/^https:\/\//i.test(
      safe
    )
  ) {
    return safe;
  }

  try {
    const parsed =
      new URL(safe);

    /*
      Nunca persistimos una URL firmada/SAS.
      En cache se usa fallback de iniciales y la revalidación
      silenciosa recupera el avatar temporal actual.
    */
    if (
      hasAzureSignature(
        parsed
      )
    ) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

/* =========================================================
   MODEL
========================================================= */

function getRaw(
  item = {}
) {
  return safeObject(
    item?.raw,
    safeObject(item)
  );
}

function normalizeStatusValue(
  value = "",
  source = {}
) {
  const raw =
    safeObject(
      source,
      {}
    );

  const explicit =
    normalizeKey(
      first(
        value,
        raw.status,
        raw.estado,
        raw.state,
        ""
      )
    );

  if (
    [
      "inactive",
      "inactivo",
      "disabled",
      "archived",
      "deleted",
    ].includes(explicit)
  ) {
    return "inactive";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "suspended",
      "locked",
    ].includes(explicit)
  ) {
    return "blocked";
  }

  if (
    [
      "pending",
      "pendiente",
      "new",
      "nuevo",
      "invited",
    ].includes(explicit)
  ) {
    return "pending";
  }

  if (
    [
      "vip",
      "premium",
    ].includes(explicit)
  ) {
    return "vip";
  }

  if (
    [
      "active",
      "activo",
      "enabled",
      "ok",
    ].includes(explicit)
  ) {
    return "active";
  }

  const active =
    parseBoolean(
      first(
        raw.active,
        raw.isActive,
        raw.enabled,
        null
      ),
      null
    );

  const disabled =
    parseBoolean(
      raw.disabled,
      null
    );

  const blocked =
    parseBoolean(
      raw.blocked,
      null
    );

  if (
    blocked === true
  ) {
    return "blocked";
  }

  if (
    disabled === true ||
    active === false
  ) {
    return "inactive";
  }

  return "active";
}

function normalizeClienteModel(
  item = {}
) {
  const original =
    safeObject(
      item,
      {}
    );

  const raw =
    safeObject(
      sanitizeDomainValue(
        original
      ),
      {}
    );

  const contacto =
    safeObject(
      first(
        raw.contacto,
        raw.contact,
        raw.profile,
        {}
      ),
      {}
    );

  const direccion =
    safeObject(
      first(
        raw.direccion,
        raw.address,
        raw.location,
        {}
      ),
      {}
    );

  const clienteId =
    cleanText(
      first(
        raw.clienteId,
        raw.clientId,
        raw.customerId,
        raw.id,
        raw._id,
        raw.uid,
        ""
      ),
      ""
    ).slice(
      0,
      CLIENTE_ID_MAX_LENGTH
    );

  const userId =
    cleanText(
      first(
        raw.userId,
        raw.usuarioId,
        raw.ownerUserId,
        raw.user?.userId,
        raw.user?.id,
        ""
      ),
      ""
    ).slice(
      0,
      USER_ID_MAX_LENGTH
    );

  const normalizedType =
    normalizeClienteType(
      first(
        raw.tipo,
        raw.type,
        raw.clienteTipo,
        raw.segmento,
        ""
      )
    );

  const tipo =
    normalizedType ||
    cleanText(
      first(
        raw.tipo,
        raw.type,
        "cliente"
      ),
      "cliente"
    )
      .toLowerCase()
      .slice(
        0,
        TYPE_MAX_LENGTH
      );

  const nombreFiscal =
    cleanText(
      first(
        raw.nombreFiscal,
        raw.razonSocial,
        raw.businessName,
        raw.companyName,
        raw.displayName,
        raw.name,
        raw.nombre,
        contacto.nombre,
        clienteId,
        "Cliente"
      ),
      "Cliente"
    ).slice(
      0,
      NAME_MAX_LENGTH
    );

  const nombreContacto =
    cleanText(
      first(
        raw.nombreContacto,
        raw.contactoNombre,
        contacto.nombre,
        contacto.name,
        contacto.displayName,
        nombreFiscal,
        ""
      ),
      ""
    ).slice(
      0,
      NAME_MAX_LENGTH
    );

  const email =
    firstEmail(
      raw.email,
      raw.emailLower,
      raw.contactoEmail,
      raw.contactEmail,
      contacto.email,
      contacto.emailLower,
      ""
    );

  const phone =
    normalizePhone(
      first(
        raw.phone,
        raw.telefono,
        raw.contactoPhone,
        contacto.phone,
        contacto.telefono,
        ""
      )
    );

  const nif =
    cleanText(
      first(
        raw.nif,
        raw.cif,
        raw.taxId,
        raw.vatNumber,
        ""
      ),
      ""
    )
      .toUpperCase()
      .slice(
        0,
        NIF_MAX_LENGTH
      );

  const city =
    cleanText(
      first(
        raw.city,
        raw.ciudad,
        direccion.ciudad,
        direccion.city,
        ""
      ),
      ""
    ).slice(
      0,
      CITY_MAX_LENGTH
    );

  const avatar =
    safeAvatarUrl(
      first(
        raw.avatar,
        raw.avatarUrl,
        raw.photoUrl,
        raw.picture,
        ""
      )
    );

  const status =
    normalizeStatusValue(
      first(
        raw.status,
        raw.estado,
        raw.state,
        ""
      ),
      raw
    );

  const active =
    status === "active" ||
    status === "vip";

  const createdAt =
    first(
      raw.createdAt,
      raw.created_at,
      raw.fechaCreacion,
      null
    );

  const updatedAt =
    first(
      raw.updatedAt,
      raw.updated_at,
      raw.modifiedAt,
      createdAt,
      null
    );

  const invoicesCount =
    Math.max(
      0,
      number(
        first(
          raw.invoicesCount,
          raw.facturasCount,
          raw.invoiceCount,
          raw.stats
            ?.facturasCount,
          0
        ),
        0
      )
    );

  const ticketsCount =
    Math.max(
      0,
      number(
        first(
          raw.ticketsCount,
          raw.incidenciasCount,
          raw.ticketCount,
          raw.stats
            ?.ticketsCount,
          0
        ),
        0
      )
    );

  const totalAmount =
    number(
      first(
        raw.totalAmount,
        raw.totalImporte,
        raw.facturasTotal,
        raw.stats
          ?.totalFacturado,
        0
      ),
      0
    );

  const normalizedAddress = {
    ...direccion,

    calle:
      cleanText(
        first(
          direccion.calle,
          direccion.street,
          raw.calle,
          ""
        ),
        ""
      ).slice(
        0,
        STREET_MAX_LENGTH
      ),

    cp:
      cleanText(
        first(
          direccion.cp,
          direccion.postalCode,
          raw.cp,
          ""
        ),
        ""
      ).slice(
        0,
        POSTAL_CODE_MAX_LENGTH
      ),

    ciudad:
      city,

    city,

    provincia:
      cleanText(
        first(
          direccion.provincia,
          direccion.province,
          raw.provincia,
          ""
        ),
        ""
      ).slice(
        0,
        PROVINCE_MAX_LENGTH
      ),

    pais:
      cleanText(
        first(
          direccion.pais,
          direccion.country,
          raw.pais,
          ""
        ),
        ""
      ).slice(
        0,
        COUNTRY_MAX_LENGTH
      ),
  };

  const normalizedContact = {
    ...contacto,

    nombre:
      nombreContacto,

    name:
      nombreContacto,

    email,
    emailLower:
      email,

    phone,
    telefono:
      phone,
  };

  return {
    ...raw,

    /*
      `raw` ya está saneado y no conserva campos sensibles conocidos.
    */
    raw,

    id:
      clienteId,

    _id:
      cleanText(
        first(
          raw._id,
          clienteId
        ),
        clienteId
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      ),

    uid:
      cleanText(
        first(
          raw.uid,
          clienteId
        ),
        clienteId
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      ),

    clienteId,

    clientId:
      cleanText(
        first(
          raw.clientId,
          clienteId
        ),
        clienteId
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      ),

    customerId:
      cleanText(
        first(
          raw.customerId,
          clienteId
        ),
        clienteId
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      ),

    userId,

    code:
      cleanText(
        first(
          raw.code,
          raw.codigo,
          clienteId,
          nif,
          email
        ),
        "CLI-SIN-ID"
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      ),

    codigo:
      cleanText(
        first(
          raw.codigo,
          raw.code,
          clienteId,
          nif,
          email
        ),
        "CLI-SIN-ID"
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      ),

    tipo,
    type:
      tipo,

    clienteTipo:
      tipo,

    segment:
      tipo,

    nombreFiscal,

    razonSocial:
      cleanText(
        first(
          raw.razonSocial,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    businessName:
      cleanText(
        first(
          raw.businessName,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    companyName:
      cleanText(
        first(
          raw.companyName,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    displayName:
      cleanText(
        first(
          raw.displayName,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    fullName:
      cleanText(
        first(
          raw.fullName,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    name:
      cleanText(
        first(
          raw.name,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    nombre:
      cleanText(
        first(
          raw.nombre,
          nombreFiscal
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    nombreContacto,
    contactoNombre:
      nombreContacto,

    contacto:
      normalizedContact,

    email,
    emailLower:
      email,

    mail:
      email,

    contactEmail:
      email,

    billingEmail:
      firstEmail(
        raw.billingEmail,
        raw.emailFacturacion,
        email
      ),

    phone,
    telefono:
      phone,

    mobile:
      normalizePhone(
        first(
          raw.mobile,
          raw.movil,
          phone
        )
      ),

    nif,

    cif:
      cleanText(
        first(
          raw.cif,
          nif
        ),
        nif
      )
        .toUpperCase()
        .slice(
          0,
          NIF_MAX_LENGTH
        ),

    taxId:
      cleanText(
        first(
          raw.taxId,
          nif
        ),
        nif
      )
        .toUpperCase()
        .slice(
          0,
          NIF_MAX_LENGTH
        ),

    direccion:
      normalizedAddress,

    address:
      normalizedAddress,

    city,
    ciudad:
      city,

    avatar,
    avatarUrl:
      avatar,

    photoUrl:
      avatar,

    picture:
      avatar,

    hasAvatar:
      Boolean(avatar),

    status,
    estado:
      status,

    state:
      status,

    active,
    isActive:
      active,

    enabled:
      active,

    blocked:
      status === "blocked",

    vip:
      status === "vip",

    isVip:
      status === "vip",

    createdAt,
    updatedAt,

    lastActivityAt:
      first(
        raw.lastActivityAt,
        updatedAt,
        createdAt,
        null
      ),

    lastContactAt:
      first(
        raw.lastContactAt,
        null
      ),

    lastInvoiceAt:
      first(
        raw.lastInvoiceAt,
        null
      ),

    lastTicketAt:
      first(
        raw.lastTicketAt,
        null
      ),

    invoicesCount,
    facturasCount:
      invoicesCount,

    invoiceCount:
      invoicesCount,

    ticketsCount,
    incidenciasCount:
      ticketsCount,

    ticketCount:
      ticketsCount,

    totalAmount,
    totalImporte:
      totalAmount,

    facturasTotal:
      totalAmount,
  };
}

function getClienteStableId(
  item = {}
) {
  const raw =
    getRaw(item);

  return cleanText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.uid,

      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.uid,
      ""
    ),
    ""
  ).slice(
    0,
    CLIENTE_ID_MAX_LENGTH
  );
}

function getSortTimestamp(
  item = {}
) {
  const value =
    first(
      item.lastActivityAt,
      item.updatedAt,
      item.createdAt,
      item.raw
        ?.lastActivityAt,
      item.raw
        ?.updatedAt,
      item.raw
        ?.createdAt,
      0
    );

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value >
      9_999_999_999
        ? value
        : value * 1000;
  }

  const text =
    cleanText(value, "");

  if (!text) {
    return 0;
  }

  if (
    /^[+\-]?\d+(?:\.\d+)?$/.test(
      text
    )
  ) {
    const numeric =
      Number(text);

    if (
      Number.isFinite(numeric)
    ) {
      return numeric >
        9_999_999_999
          ? numeric
          : numeric * 1000;
    }
  }

  const parsedDate =
    Date.parse(text);

  return Number.isFinite(
    parsedDate
  )
    ? parsedDate
    : 0;
}

function compareClientesNewestFirst(
  a = {},
  b = {}
) {
  const diff =
    getSortTimestamp(b) -
    getSortTimestamp(a);

  if (diff !== 0) {
    return diff;
  }

  return getClienteStableId(a)
    .localeCompare(
      getClienteStableId(b),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
}

function dedupeClientes(
  items = []
) {
  const map =
    new Map();

  let anonymousIndex = 0;

  for (
    const value
    of safeArray(items)
  ) {
    if (
      !isObject(value)
    ) {
      continue;
    }

    const normalized =
      normalizeClienteModel(
        value
      );

    const stableId =
      getClienteStableId(
        normalized
      );

    const key =
      stableId
        ? stableId
            .toLowerCase()
        : `anonymous:${anonymousIndex++}`;

    if (
      map.has(key)
    ) {
      const previous =
        map.get(key);

      map.set(
        key,
        normalizeClienteModel({
          ...previous,
          ...normalized,

          raw: {
            ...safeObject(
              previous?.raw
            ),

            ...safeObject(
              normalized?.raw
            ),
          },
        })
      );

      continue;
    }

    map.set(
      key,
      normalized
    );
  }

  return [
    ...map.values(),
  ].sort(
    compareClientesNewestFirst
  );
}

function normalizeClientesCollection(
  items = []
) {
  return dedupeClientes(
    items
  );
}

function findClienteById(
  items = [],
  id = ""
) {
  const target =
    cleanText(
      id,
      ""
    ).toLowerCase();

  if (!target) {
    return null;
  }

  return (
    safeArray(items)
      .find(
        (item) => {
          const normalized =
            normalizeClienteModel(
              item
            );

          const candidates = [
            normalized.clienteId,
            normalized.clientId,
            normalized.customerId,
            normalized.id,
            normalized._id,
            normalized.uid,
            normalized.nif,
            normalized.email,
          ];

          return candidates.some(
            (candidate) =>
              cleanText(
                candidate,
                ""
              )
                .toLowerCase() ===
              target
          );
        }
      ) ||
    null
  );
}

function statusBucket(
  item = {}
) {
  const status =
    normalizeStatusValue(
      first(
        item.status,
        item.estado,
        item.state,
        ""
      ),
      item
    );

  if (
    status === "vip"
  ) {
    return "vip";
  }

  if (
    status === "pending"
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "inactive",
    ].includes(status)
  ) {
    return "blocked";
  }

  return "active";
}

function clienteSearchText(
  item = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  return normalizeSearch(
    [
      current.clienteId,
      current.userId,
      current.code,
      current.nombreFiscal,
      current.nombreContacto,
      current.email,
      current.phone,
      current.city,
      current.nif,
      current.tipo,
      current.status,
    ].join(" ")
  );
}

function filterClientes(
  items = [],
  {
    filter = "all",
    search = "",
    query = "",
    q = "",
  } = {}
) {
  const normalizedFilter =
    normalizeKey(
      filter ||
      "all"
    );

  const needle =
    normalizeSearch(
      first(
        search,
        query,
        q,
        ""
      )
    );

  const terms =
    needle
      .split(/\s+/)
      .filter(Boolean);

  return safeArray(items)
    .filter(
      (item) => {
        if (
          normalizedFilter !==
            "all" &&
          statusBucket(
            item
          ) !==
            normalizedFilter
        ) {
          return false;
        }

        if (
          !terms.length
        ) {
          return true;
        }

        const haystack =
          clienteSearchText(
            item
          );

        return terms.every(
          (term) =>
            haystack.includes(
              term
            )
        );
      }
    );
}

function computeClientesStats(
  items = []
) {
  return safeArray(items)
    .reduce(
      (acc, item) => {
        const current =
          normalizeClienteModel(
            item
          );

        const bucket =
          statusBucket(
            current
          );

        acc.total += 1;

        if (
          bucket === "active"
        ) {
          acc.activeCount += 1;
        }

        if (
          bucket === "pending"
        ) {
          acc.pendingCount += 1;
        }

        if (
          bucket === "blocked"
        ) {
          acc.blockedCount += 1;
        }

        if (
          bucket === "vip"
        ) {
          acc.vipCount += 1;
        }

        acc.invoicesCount +=
          Math.max(
            0,
            number(
              current.invoicesCount,
              0
            )
          );

        acc.ticketsCount +=
          Math.max(
            0,
            number(
              current.ticketsCount,
              0
            )
          );

        acc.totalAmount +=
          number(
            current.totalAmount,
            0
          );

        return acc;
      },
      {
        total: 0,
        activeCount: 0,
        pendingCount: 0,
        blockedCount: 0,
        vipCount: 0,
        invoicesCount: 0,
        ticketsCount: 0,
        totalAmount: 0,
      }
    );
}

/* =========================================================
   RESPONSE READERS
========================================================= */

function envelopeObjects(
  payload = null,
  maxDepth = 6
) {
  const output = [];

  const queue = [
    {
      value:
        payload,

      depth:
        0,
    },
  ];

  const seen =
    new Set();

  while (
    queue.length
  ) {
    const {
      value,
      depth,
    } =
      queue.shift();

    if (
      !isObject(value) ||
      seen.has(value) ||
      depth > maxDepth
    ) {
      continue;
    }

    seen.add(value);
    output.push(value);

    for (
      const key
      of [
        "data",
        "payload",
        "result",
        "response",
        "body",
        "value",
      ]
    ) {
      if (
        isObject(
          value[key]
        )
      ) {
        queue.push({
          value:
            value[key],

          depth:
            depth + 1,
        });
      }
    }
  }

  return output;
}

function pickItemsResult(
  payload = null
) {
  if (
    Array.isArray(payload)
  ) {
    return {
      found: true,
      items:
        payload,
      source:
        payload,
    };
  }

  for (
    const source
    of envelopeObjects(
      payload
    )
  ) {
    for (
      const key
      of [
        "clientes",
        "items",
        "rows",
        "clients",
        "customers",
        "results",
      ]
    ) {
      if (
        Array.isArray(
          source[key]
        )
      ) {
        return {
          found:
            true,

          items:
            source[key],

          source,
          key,
        };
      }
    }
  }

  return {
    found: false,
    items: [],
    source: null,
    key: "",
  };
}

function pickDetail(
  payload = null
) {
  if (!payload) {
    return null;
  }

  if (
    Array.isArray(payload)
  ) {
    return payload[0] ||
      null;
  }

  for (
    const source
    of envelopeObjects(
      payload
    )
  ) {
    for (
      const key
      of [
        "cliente",
        "client",
        "customer",
        "item",
        "detail",
        "record",
      ]
    ) {
      if (
        isObject(
          source[key]
        )
      ) {
        return source[key];
      }
    }
  }

  const direct =
    safeObject(
      payload,
      null
    );

  if (!direct) {
    return null;
  }

  return (
    direct.clienteId ||
    direct.clientId ||
    direct.customerId ||
    direct.id ||
    direct.nombreFiscal
  )
    ? direct
    : null;
}

function normalizeListResponse(
  response = null
) {
  const picked =
    pickItemsResult(
      response
    );

  if (!picked.found) {
    throw createContractError(
      "CLIENTES_LIST_INVALID_RESPONSE",
      "El backend no devolvió una colección de clientes válida.",
      502
    );
  }

  const items =
    normalizeClientesCollection(
      picked.items
    );

  const safeResponse =
    safeObject(
      sanitizeDomainValue(
        safeObject(
          response,
          {}
        )
      ),
      {}
    );

  return {
    ...safeResponse,

    ok:
      safeResponse.ok !==
      false,

    success:
      safeResponse.ok !==
      false,

    items,
    clientes:
      items,

    clients:
      items,

    customers:
      items,

    rows:
      items,

    results:
      items,

    /*
      Sin paginación backend, total real = colección devuelta.
    */
    total:
      items.length,

    totalCount:
      items.length,

    remoteCount:
      items.length,

    count:
      items.length,

    returned:
      items.length,

    hasMore:
      false,

    continuationToken:
      null,

    nextContinuationToken:
      null,
  };
}

function normalizeDetailResponse(
  response = null
) {
  const detail =
    pickDetail(
      response
    );

  return detail
    ? normalizeClienteModel(
        detail
      )
    : null;
}

function pickCreateAck(
  response = null
) {
  const objects =
    envelopeObjects(
      response
    );

  if (
    isObject(response)
  ) {
    objects.unshift(
      response
    );
  }

  for (
    const source
    of objects
  ) {
    const clienteId =
      cleanText(
        first(
          source.clienteId,
          source.clientId,
          source.id,
          ""
        ),
        ""
      ).slice(
        0,
        CLIENTE_ID_MAX_LENGTH
      );

    if (clienteId) {
      return {
        ok:
          source.ok !==
          false,

        clienteId,

        userId:
          cleanText(
            first(
              source.userId,
              source.usuarioId,
              ""
            ),
            ""
          ).slice(
            0,
            USER_ID_MAX_LENGTH
          ),

        synced:
          parseBoolean(
            source.synced,
            false
          ) === true,
      };
    }
  }

  return {
    ok:
      safeObject(response)
        ?.ok !== false,

    clienteId: "",
    userId: "",
    synced: false,
  };
}

/* =========================================================
   CACHE PROJECTION
========================================================= */

function cacheClienteProjection(
  item = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  return {
    id:
      current.clienteId,

    clienteId:
      current.clienteId,

    clientId:
      current.clienteId,

    customerId:
      current.clienteId,

    userId:
      current.userId,

    code:
      current.code,

    codigo:
      current.codigo,

    tipo:
      current.tipo,

    nombreFiscal:
      current.nombreFiscal,

    razonSocial:
      current.razonSocial,

    displayName:
      current.displayName,

    nombreContacto:
      current.nombreContacto,

    contactoNombre:
      current.contactoNombre,

    contacto: {
      nombre:
        current.nombreContacto,

      name:
        current.nombreContacto,

      email:
        current.email,

      emailLower:
        current.email,

      phone:
        current.phone,

      telefono:
        current.phone,
    },

    email:
      current.email,

    emailLower:
      current.email,

    phone:
      current.phone,

    telefono:
      current.phone,

    nif:
      current.nif,

    cif:
      current.nif,

    direccion: {
      calle:
        cleanText(
          current.direccion
            ?.calle,
          ""
        ),

      cp:
        cleanText(
          current.direccion
            ?.cp,
          ""
        ),

      ciudad:
        current.city,

      city:
        current.city,

      provincia:
        cleanText(
          current.direccion
            ?.provincia,
          ""
        ),

      pais:
        cleanText(
          current.direccion
            ?.pais,
          ""
        ),
    },

    city:
      current.city,

    ciudad:
      current.city,

    avatar:
      safeAvatarUrlForCache(
        current.avatar
      ),

    avatarUrl:
      safeAvatarUrlForCache(
        current.avatarUrl
      ),

    status:
      current.status,

    estado:
      current.status,

    active:
      current.active,

    blocked:
      current.blocked,

    vip:
      current.vip,

    createdAt:
      current.createdAt,

    updatedAt:
      current.updatedAt,

    lastActivityAt:
      current.lastActivityAt,

    lastContactAt:
      current.lastContactAt,

    lastInvoiceAt:
      current.lastInvoiceAt,

    lastTicketAt:
      current.lastTicketAt,

    invoicesCount:
      current.invoicesCount,

    ticketsCount:
      current.ticketsCount,

    totalAmount:
      current.totalAmount,
  };
}

function cacheItemsProjection(
  items = []
) {
  return normalizeClientesCollection(
    items
  ).map(
    cacheClienteProjection
  );
}

/* =========================================================
   STORAGE / STATE
========================================================= */

function isStorageAvailable() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.localStorage
    );
  } catch {
    return false;
  }
}

function getCacheKeys() {
  return [
    CLIENTES_CACHE_KEY,
    ...LEGACY_CACHE_KEYS,
  ];
}

function readCachePayload() {
  if (
    !isStorageAvailable()
  ) {
    return null;
  }

  for (
    const key
    of getCacheKeys()
  ) {
    try {
      const raw =
        window.localStorage
          .getItem(key);

      if (!raw) {
        continue;
      }

      const parsed =
        JSON.parse(raw);

      if (
        !isObject(parsed)
      ) {
        continue;
      }

      if (
        !Array.isArray(
          parsed.items
        )
      ) {
        continue;
      }

      return {
        key,
        payload:
          parsed,
      };
    } catch {
      /*
        Cache corrupta de esta key: la retiramos y probamos la siguiente.
      */
      try {
        window.localStorage
          .removeItem(key);
      } catch {
        // noop
      }
    }
  }

  return null;
}

function removeCachePayload() {
  if (
    !isStorageAvailable()
  ) {
    return false;
  }

  let changed =
    false;

  for (
    const key
    of getCacheKeys()
  ) {
    try {
      if (
        window.localStorage
          .getItem(key) !==
        null
      ) {
        changed =
          true;
      }

      window.localStorage
        .removeItem(key);
    } catch {
      // noop
    }
  }

  return changed;
}

function writeCachePayload() {
  if (
    !isStorageAvailable()
  ) {
    return false;
  }

  try {
    const payload = {
      schemaVersion:
        CLIENTES_CACHE_SCHEMA_VERSION,

      version:
        CLIENTES_API_VERSION,

      items:
        cacheItemsProjection(
          clientesState.items
        ),

      remoteCount:
        clientesState.items
          .length,

      lastSyncAt:
        clientesState.lastSyncAt ||
        Date.now(),

      cachedAt:
        Date.now(),
    };

    window.localStorage
      .setItem(
        CLIENTES_CACHE_KEY,
        JSON.stringify(
          payload
        )
      );

    for (
      const legacy
      of LEGACY_CACHE_KEYS
    ) {
      window.localStorage
        .removeItem(
          legacy
        );
    }

    return true;
  } catch {
    return false;
  }
}

function hydrateStateFromCache({
  freshOnly = true,
} = {}) {
  /*
    loaded=true también es válido con una lista vacía.
  */
  if (
    clientesState.loaded &&
    clientesState.hydrated
  ) {
    return true;
  }

  const cached =
    readCachePayload();

  if (!cached) {
    return false;
  }

  const payload =
    safeObject(
      cached.payload,
      {}
    );

  if (
    !Array.isArray(
      payload.items
    )
  ) {
    return false;
  }

  const cachedAt =
    number(
      first(
        payload.cachedAt,
        payload.lastSyncAt,
        0
      ),
      0
    );

  const age =
    cachedAt
      ? Math.max(
          0,
          Date.now() -
          cachedAt
        )
      : Number
          .POSITIVE_INFINITY;

  if (
    freshOnly &&
    age >
      CLIENTES_CACHE_TTL_MS
  ) {
    return false;
  }

  const items =
    normalizeClientesCollection(
      payload.items
    );

  clientesState.items =
    items;

  clientesState.remoteCount =
    items.length;

  clientesState.lastSyncAt =
    number(
      payload.lastSyncAt,
      cachedAt ||
      Date.now()
    );

  clientesState.hydrated =
    true;

  clientesState.loaded =
    true;

  clientesState.error =
    "";

  clientesStore =
    items;

  /*
    Migración de v3 -> v4 tras sanear la proyección.
  */
  if (
    cached.key !==
    CLIENTES_CACHE_KEY
  ) {
    writeCachePayload();
  }

  return true;
}

export function hydrateClientesFromCache(
  options = {}
) {
  hydrateStateFromCache({
    freshOnly:
      options.freshOnly !==
        false &&
      options.stale !==
        true,
  });

  const items =
    [...clientesState.items];

  const lastSyncAt =
    number(
      clientesState.lastSyncAt,
      0
    );

  const ageMs =
    lastSyncAt
      ? Math.max(
          0,
          Date.now() -
          lastSyncAt
        )
      : Number
          .POSITIVE_INFINITY;

  const ttlMs =
    Math.max(
      0,
      number(
        options.ttlMs ??
        options.cacheTtlMs,
        CLIENTES_CACHE_TTL_MS
      )
    );

  return {
    /*
      Una cache válida puede contener cero clientes.
    */
    ok:
      Boolean(
        clientesState.loaded ||
        clientesState.hydrated
      ),

    cached:
      Boolean(
        clientesState.hydrated
      ),

    stale:
      !lastSyncAt ||
      ageMs > ttlMs,

    items,
    clientes:
      items,

    clients:
      items,

    customers:
      items,

    rows:
      items,

    results:
      items,

    total:
      items.length,

    totalCount:
      items.length,

    remoteCount:
      items.length,

    count:
      items.length,

    loadedAt:
      lastSyncAt
        ? new Date(
            lastSyncAt
          ).toISOString()
        : null,

    lastSyncAt,

    loading:
      clientesState.loading,

    refreshing:
      clientesState.refreshing,

    error:
      clientesState.error,

    cache: {
      hydrated:
        clientesState.hydrated,

      ageMs,
      ttlMs,

      fresh:
        Boolean(
          lastSyncAt
        ) &&
        ageMs <=
          ttlMs,

      key:
        CLIENTES_CACHE_KEY,

      schemaVersion:
        CLIENTES_CACHE_SCHEMA_VERSION,
    },
  };
}

function setLoading(
  value = false
) {
  clientesState.loading =
    Boolean(value);

  return clientesState.loading;
}

function setRefreshing(
  value = false
) {
  clientesState.refreshing =
    Boolean(value);

  return clientesState.refreshing;
}

function setError(
  value = ""
) {
  clientesState.error =
    cleanText(
      redactText(value),
      ""
    ).slice(
      0,
      500
    );

  return clientesState.error;
}

function clearError() {
  clientesState.error =
    "";

  return true;
}

function setItems(
  items = [],
  {
    remoteCount = null,
  } = {}
) {
  const list =
    normalizeClientesCollection(
      items
    );

  clientesState.items =
    list;

  clientesStore =
    list;

  clientesState.remoteCount =
    Math.max(
      list.length,
      number(
        remoteCount,
        list.length
      )
    );

  return list;
}

function setRemoteCount(
  value = 0
) {
  clientesState.remoteCount =
    Math.max(
      0,
      number(
        value,
        clientesState
          .items.length
      )
    );

  return clientesState
    .remoteCount;
}

function setLastSyncAt(
  value = Date.now()
) {
  clientesState.lastSyncAt =
    number(
      value,
      Date.now()
    );

  return clientesState
    .lastSyncAt;
}

function touchLastSyncAt() {
  return setLastSyncAt(
    Date.now()
  );
}

function setLoaded(
  value = true
) {
  clientesState.loaded =
    Boolean(value);

  return clientesState.loaded;
}

function setHydrated(
  value = true
) {
  clientesState.hydrated =
    Boolean(value);

  return clientesState
    .hydrated;
}

function getInflightLoad() {
  return clientesState
    .inflightLoad ||
    null;
}

function setInflightLoad(
  task = null
) {
  clientesState.inflightLoad =
    task ||
    null;

  return clientesState
    .inflightLoad;
}

function clearInflightLoad(
  task = null
) {
  if (
    !task ||
    clientesState
      .inflightLoad ===
      task
  ) {
    clientesState.inflightLoad =
      null;
  }

  return true;
}

function replaceClientesStore(
  items = []
) {
  const list =
    normalizeClientesCollection(
      items
    );

  clientesStore =
    list;

  clientesState.items =
    list;

  clientesState.remoteCount =
    Math.max(
      clientesState
        .remoteCount,
      list.length
    );

  return list;
}

function upsertClienteStore(
  item = {}
) {
  const normalized =
    normalizeClienteModel(
      item
    );

  const stableId =
    getClienteStableId(
      normalized
    );

  if (!stableId) {
    return normalized;
  }

  const current =
    [...clientesStore];

  const target =
    stableId.toLowerCase();

  const index =
    current.findIndex(
      (row) =>
        getClienteStableId(
          row
        )
          .toLowerCase() ===
        target
    );

  let stored =
    normalized;

  if (
    index >= 0
  ) {
    stored =
      normalizeClienteModel({
        ...current[index],
        ...normalized,

        raw: {
          ...safeObject(
            current[index]?.raw
          ),

          ...safeObject(
            normalized?.raw
          ),
        },
      });

    current[index] =
      stored;
  } else {
    current.unshift(
      normalized
    );
  }

  clientesStore =
    normalizeClientesCollection(
      current
    );

  clientesState.items =
    clientesStore;

  clientesState.remoteCount =
    Math.max(
      clientesState
        .remoteCount,
      clientesStore.length
    );

  return stored;
}

function removeClienteStore(
  id = ""
) {
  const target =
    cleanText(
      id,
      ""
    ).toLowerCase();

  if (!target) {
    return false;
  }

  const before =
    clientesStore.length;

  clientesStore =
    clientesStore.filter(
      (item) =>
        getClienteStableId(
          item
        )
          .toLowerCase() !==
        target
    );

  clientesState.items =
    clientesStore;

  clientesState.remoteCount =
    clientesStore.length;

  return (
    before !==
    clientesStore.length
  );
}

function invalidateReadCache({
  invalidateInflight = true,
} = {}) {
  clientesState.loaded =
    false;

  clientesState.hydrated =
    false;

  clientesState.lastSyncAt =
    0;

  /*
    Invalida una GET de listado que hubiera empezado antes
    de la mutación. Su respuesta ya no podrá pisar el store.
  */
  if (
    invalidateInflight
  ) {
    nextLoadToken();
    bumpStateEpoch();

    clientesState.inflightLoad =
      null;
  }

  removeCachePayload();

  return true;
}

/* =========================================================
   HTTP
========================================================= */

async function httpRequest(
  method = "GET",
  endpoint = "",
  body = null,
  options = {}
) {
  const verb =
    cleanText(
      method,
      "GET"
    ).toUpperCase();

  const path =
    cleanText(
      endpoint,
      ""
    );

  if (!path) {
    throw createContractError(
      "CLIENTES_ENDPOINT_REQUIRED",
      "Falta el endpoint de Clientes.",
      500
    );
  }

  if (
    ![
      "GET",
      "POST",
    ].includes(verb)
  ) {
    throw createContractError(
      `CLIENTES_HTTP_${verb}_BLOCKED`,
      `${verb} no forma parte del contrato HTTP de Clientes.`,
      405
    );
  }

  const timeout =
    Math.max(
      1,
      number(
        options.timeout,
        CLIENTES_TIMEOUT
      )
    );

  const query =
    safeObject(
      options.query ||
      options.params
    );

  const headers =
    safeObject(
      options.headers
    );

  const source =
    cleanText(
      options.source,
      "views.clientes.api"
    );

  if (
    verb === "GET" &&
    isFunction(
      Http?.get
    )
  ) {
    return Http.get(
      path,
      {
        timeout,
        query,
        headers,
        source,
        signal:
          options.signal,
      }
    );
  }

  if (
    verb === "POST" &&
    isFunction(
      Http?.post
    )
  ) {
    return Http.post(
      path,
      body,
      {
        timeout,
        query,
        headers,
        source,
        signal:
          options.signal,
      }
    );
  }

  if (
    isFunction(
      Http?.request
    )
  ) {
    return Http.request(
      path,
      {
        method:
          verb,

        body,
        data:
          body,

        timeout,
        query,
        headers,
        source,
        signal:
          options.signal,
      }
    );
  }

  throw createContractError(
    `CLIENTES_HTTP_${verb}_UNAVAILABLE`,
    `El cliente HTTP no expone ${verb} para Clientes.`,
    500
  );
}

/* =========================================================
   PUBLIC LIST API
========================================================= */

export async function fetchClientesRequest(
  options = {}
) {
  const response =
    await httpRequest(
      "GET",
      CLIENTES_ENDPOINT,
      null,
      {
        timeout:
          number(
            options.timeout,
            CLIENTES_TIMEOUT
          ),

        source:
          cleanText(
            options.source,
            "views.clientes.api.list"
          ),

        signal:
          options.signal,
      }
    );

  return normalizeListResponse(
    response
  );
}

export async function loadClientes(
  options = {}
) {
  hydrateStateFromCache({
    freshOnly: true,
  });

  const activeInflight =
    getInflightLoad();

  /*
    Single-flight también en refresh.
    `dedupe:false` es la única forma explícita de permitir otra GET.
  */
  if (
    activeInflight &&
    options.dedupe !==
      false
  ) {
    return activeInflight;
  }

  const token =
    nextLoadToken();

  const epoch =
    stateEpoch;

  const hadItems =
    clientesState.items
      .length > 0;

  setLoading(
    !hadItems
  );

  setRefreshing(
    hadItems
  );

  clearError();

  let task = null;

  task =
    fetchClientesRequest(
      options
    )
      .then(
        (response) => {
          if (
            !isActiveLoadToken(
              token
            ) ||
            !isActiveEpoch(
              epoch
            )
          ) {
            return getClientesStoreSnapshot();
          }

          const items =
            setItems(
              response.items,
              {
                remoteCount:
                  response.items
                    .length,
              }
            );

          setRemoteCount(
            items.length
          );

          touchLastSyncAt();

          setLoaded(
            true
          );

          setHydrated(
            true
          );

          clearError();

          writeCachePayload();

          return {
            ...response,

            items,
            clientes:
              items,

            clients:
              items,

            customers:
              items,

            rows:
              items,

            results:
              items,

            total:
              items.length,

            totalCount:
              items.length,

            remoteCount:
              items.length,

            count:
              items.length,

            lastSyncAt:
              clientesState
                .lastSyncAt,
          };
        }
      )
      .catch(
        (error) => {
          if (
            isActiveLoadToken(
              token
            ) &&
            isActiveEpoch(
              epoch
            )
          ) {
            setError(
              safeError(
                error
              )
            );
          }

          throw error;
        }
      )
      .finally(
        () => {
          if (
            isActiveLoadToken(
              token
            ) &&
            isActiveEpoch(
              epoch
            )
          ) {
            setLoading(
              false
            );

            setRefreshing(
              false
            );
          }

          clearInflightLoad(
            task
          );
        }
      );

  setInflightLoad(
    task
  );

  return task;
}

export const fetchClientes =
  loadClientes;

export const listClientes =
  loadClientes;

export const getClientes =
  loadClientes;

export async function refreshClientes(
  options = {}
) {
  return loadClientes({
    ...options,

    force: true,
    refresh: true,
  });
}

/* =========================================================
   PUBLIC DETAIL API
========================================================= */

function detailInflightKey(
  id = ""
) {
  return cleanText(
    id,
    ""
  )
    .toLowerCase()
    .slice(
      0,
      CLIENTE_ID_MAX_LENGTH
    );
}

export function getClienteByIdRequest(
  id = "",
  options = {}
) {
  const clienteId =
    cleanText(
      id,
      ""
    ).slice(
      0,
      CLIENTE_ID_MAX_LENGTH
    );

  if (!clienteId) {
    return Promise.reject(
      createContractError(
        "CLIENTE_ID_REQUIRED",
        "Falta el identificador del cliente."
      )
    );
  }

  const key =
    detailInflightKey(
      clienteId
    );

  if (
    options.dedupe !==
      false &&
    detailInflight.has(
      key
    )
  ) {
    return detailInflight
      .get(key);
  }

  const epoch =
    stateEpoch;

  let task = null;

  task =
    httpRequest(
      "GET",
      `${CLIENTES_ENDPOINT}/${encodeURIComponent(
        clienteId
      )}`,
      null,
      {
        timeout:
          number(
            options.timeout,
            CLIENTES_DETAIL_TIMEOUT
          ),

        source:
          cleanText(
            options.source,
            "views.clientes.api.detail"
          ),

        signal:
          options.signal,
      }
    )
      .then(
        (response) => {
          const detail =
            normalizeDetailResponse(
              response
            );

          if (
            !detail ||
            !getClienteStableId(
              detail
            )
          ) {
            throw createContractError(
              "CLIENTE_DETAIL_INVALID_RESPONSE",
              "El backend no devolvió un cliente válido.",
              502
            );
          }

          const returnedId =
            getClienteStableId(
              detail
            );

          if (
            returnedId
              .toLowerCase() !==
            clienteId
              .toLowerCase()
          ) {
            throw createContractError(
              "CLIENTE_DETAIL_ID_MISMATCH",
              "El backend devolvió un cliente distinto al solicitado.",
              502
            );
          }

          if (
            isActiveEpoch(
              epoch
            )
          ) {
            upsertClienteStore(
              detail
            );
          }

          return detail;
        }
      )
      .finally(
        () => {
          if (
            detailInflight
              .get(key) ===
            task
          ) {
            detailInflight
              .delete(key);
          }
        }
      );

  detailInflight.set(
    key,
    task
  );

  return task;
}

/*
  Compat:
  - Por defecto puede devolver el snapshot ya disponible.
  - `force:true` o `preferCache:false` fuerza GET de detalle.
*/
export async function getClienteById(
  id = "",
  options = {}
) {
  const cached =
    findClienteById(
      clientesStore,
      id
    );

  if (
    cached &&
    options.force !==
      true &&
    options.preferCache !==
      false
  ) {
    return cached;
  }

  return getClienteByIdRequest(
    id,
    options
  );
}

export const fetchClienteById =
  getClienteById;

export const fetchClienteDetail =
  getClienteById;

export const loadClienteDetail =
  getClienteByIdRequest;

export const getCliente =
  getClienteById;

/* =========================================================
   CREATE CONTRACT
========================================================= */

function buildCreateClienteBody(
  payload = {}
) {
  const source =
    safeObject(
      payload,
      {}
    );

  const contacto =
    safeObject(
      source.contacto,
      {}
    );

  const direccion =
    safeObject(
      source.direccion,
      {}
    );

  const userId =
    cleanText(
      first(
        source.userId,
        source.targetUserId,
        source.usuarioId,
        ""
      ),
      ""
    ).slice(
      0,
      USER_ID_MAX_LENGTH
    );

  const tipo =
    normalizeClienteType(
      first(
        source.tipo,
        source.clienteTipo,
        source.segmento,
        source.type,
        ""
      )
    );

  const nombreFiscal =
    cleanText(
      first(
        source.nombreFiscal,
        source.razonSocial,
        source.businessName,
        source.companyName,
        source.displayName,
        source.name,
        ""
      ),
      ""
    ).slice(
      0,
      NAME_MAX_LENGTH
    );

  const rawContactEmail =
    normalizeEmail(
      first(
        source.contactoEmail,
        source.email,
        contacto.email,
        source.targetUserEmail,
        ""
      )
    ).slice(
      0,
      EMAIL_MAX_LENGTH
    );

  const body = {
    userId,
    tipo,
    nombreFiscal,

    nif:
      cleanText(
        first(
          source.nif,
          source.cif,
          source.taxId,
          source.vatNumber,
          ""
        ),
        ""
      )
        .toUpperCase()
        .slice(
          0,
          NIF_MAX_LENGTH
        ),

    calle:
      cleanText(
        first(
          source.calle,
          direccion.calle,
          direccion.street,
          ""
        ),
        ""
      ).slice(
        0,
        STREET_MAX_LENGTH
      ),

    cp:
      cleanText(
        first(
          source.cp,
          source.postalCode,
          direccion.cp,
          direccion.postalCode,
          ""
        ),
        ""
      ).slice(
        0,
        POSTAL_CODE_MAX_LENGTH
      ),

    ciudad:
      cleanText(
        first(
          source.ciudad,
          source.city,
          direccion.ciudad,
          direccion.city,
          ""
        ),
        ""
      ).slice(
        0,
        CITY_MAX_LENGTH
      ),

    provincia:
      cleanText(
        first(
          source.provincia,
          source.province,
          direccion.provincia,
          direccion.province,
          ""
        ),
        ""
      ).slice(
        0,
        PROVINCE_MAX_LENGTH
      ),

    pais:
      cleanText(
        first(
          source.pais,
          source.country,
          direccion.pais,
          direccion.country,
          "España"
        ),
        "España"
      ).slice(
        0,
        COUNTRY_MAX_LENGTH
      ),

    contactoNombre:
      cleanText(
        first(
          source.contactoNombre,
          source.nombreContacto,
          contacto.nombre,
          contacto.name,
          nombreFiscal,
          ""
        ),
        nombreFiscal
      ).slice(
        0,
        NAME_MAX_LENGTH
      ),

    contactoEmail:
      rawContactEmail,

    contactoPhone:
      normalizePhone(
        first(
          source.contactoPhone,
          source.phone,
          source.telefono,
          contacto.phone,
          contacto.telefono,
          source.targetUserPhone,
          ""
        )
      ),
  };

  if (!body.userId) {
    throw createContractError(
      "CLIENTE_USER_ID_REQUIRED",
      "Selecciona un usuario real antes de crear el cliente."
    );
  }

  if (!body.tipo) {
    throw createContractError(
      "CLIENTE_TYPE_INVALID",
      "El tipo de cliente debe ser particular o empresa."
    );
  }

  if (!body.nombreFiscal) {
    throw createContractError(
      "CLIENTE_FISCAL_NAME_REQUIRED",
      "El nombre fiscal es obligatorio."
    );
  }

  if (
    rawContactEmail &&
    !isValidEmail(
      rawContactEmail
    )
  ) {
    throw createContractError(
      "CLIENTE_CONTACT_EMAIL_INVALID",
      "El email de contacto no es válido."
    );
  }

  return body;
}

function createInflightKey(
  body = {}
) {
  return cleanText(
    body.userId,
    ""
  )
    .toLowerCase()
    .slice(
      0,
      USER_ID_MAX_LENGTH
    );
}

export function createCliente(
  payload = {},
  options = {}
) {
  let body;

  try {
    body =
      buildCreateClienteBody(
        payload
      );
  } catch (error) {
    return Promise.reject(
      error
    );
  }

  const key =
    createInflightKey(
      body
    );

  if (
    key &&
    options.dedupe !==
      false &&
    createInflight.has(
      key
    )
  ) {
    return createInflight
      .get(key);
  }

  let task = null;

  task =
    httpRequest(
      "POST",
      CLIENTES_ENDPOINT,
      body,
      {
        timeout:
          number(
            options.timeout,
            CLIENTES_MUTATION_TIMEOUT
          ),

        source:
          cleanText(
            options.source,
            "views.clientes.api.create"
          ),

        signal:
          options.signal,
      }
    )
      .then(
        (response) => {
          const top =
            safeObject(
              response,
              {}
            );

          if (
            top.ok === false
          ) {
            throw createContractError(
              "CLIENTE_CREATE_REJECTED",
              safeError(
                response,
                "El backend rechazó la creación del cliente."
              ),
              number(
                response?.status,
                400
              )
            );
          }

          const ack =
            pickCreateAck(
              response
            );

          if (
            ack.ok === false
          ) {
            throw createContractError(
              "CLIENTE_CREATE_REJECTED",
              "El backend rechazó la creación del cliente.",
              400
            );
          }

          if (
            !ack.clienteId
          ) {
            throw createContractError(
              "CLIENTE_CREATE_INVALID_RESPONSE",
              "El backend no devolvió el identificador del cliente creado.",
              502
            );
          }

          /*
            CRÍTICO:
            el POST devuelve ACK, no detalle.
            Invalidamos cualquier GET de listado anterior al POST
            para impedir que una respuesta vieja vuelva a cachearse.
          */
          invalidateReadCache({
            invalidateInflight:
              true,
          });

          return {
            ok: true,

            clienteId:
              ack.clienteId,

            id:
              ack.clienteId,

            userId:
              cleanText(
                first(
                  ack.userId,
                  body.userId
                ),
                body.userId
              ).slice(
                0,
                USER_ID_MAX_LENGTH
              ),

            synced:
              ack.synced === true,
          };
        }
      )
      .finally(
        () => {
          if (
            key &&
            createInflight
              .get(key) ===
              task
          ) {
            createInflight
              .delete(key);
          }
        }
      );

  if (key) {
    createInflight.set(
      key,
      task
    );
  }

  return task;
}

export const createClienteRequest =
  createCliente;

/* =========================================================
   UNSUPPORTED MUTATIONS
========================================================= */

function unsupportedMutation(
  method = "PATCH"
) {
  const verb =
    cleanText(
      method,
      "PATCH"
    ).toUpperCase();

  return createContractError(
    `CLIENTES_${verb}_NOT_SUPPORTED`,
    `${verb} /api/clientes/:id no forma parte del contrato productivo actual.`,
    405
  );
}

/*
  Compatibilidad con imports antiguos:
  fallan antes de cualquier llamada de red.
*/
export async function updateCliente() {
  throw unsupportedMutation(
    "PATCH"
  );
}

export const updateClienteRequest =
  updateCliente;

export async function patchCliente() {
  throw unsupportedMutation(
    "PATCH"
  );
}

export async function putCliente() {
  throw unsupportedMutation(
    "PUT"
  );
}

export async function deleteCliente() {
  throw unsupportedMutation(
    "DELETE"
  );
}

export const deleteClienteRequest =
  deleteCliente;

/* =========================================================
   STORE / SNAPSHOT
========================================================= */

export function getClienteByIdStore(
  id = ""
) {
  return findClienteById(
    clientesStore,
    id
  );
}

export function getClientesStoreSnapshot() {
  const items =
    [...clientesState.items];

  return {
    version:
      CLIENTES_API_VERSION,

    items,
    clientes:
      items,

    clients:
      items,

    customers:
      items,

    rows:
      items,

    store:
      [...clientesStore],

    remoteCount:
      clientesState.remoteCount,

    total:
      clientesState.remoteCount,

    totalCount:
      clientesState.remoteCount,

    count:
      items.length,

    loading:
      clientesState.loading,

    refreshing:
      clientesState.refreshing,

    loaded:
      clientesState.loaded,

    hydrated:
      clientesState.hydrated,

    error:
      clientesState.error,

    lastSyncAt:
      clientesState.lastSyncAt,

    stats:
      computeClientesStats(
        items
      ),
  };
}

export function getClientesStateSnapshot() {
  return getClientesStoreSnapshot();
}

export function getClientesApiSnapshot() {
  const snapshot =
    getClientesStoreSnapshot();

  const lastSyncAt =
    number(
      clientesState.lastSyncAt,
      0
    );

  const ageMs =
    lastSyncAt
      ? Math.max(
          0,
          Date.now() -
          lastSyncAt
        )
      : Number
          .POSITIVE_INFINITY;

  return {
    ...snapshot,

    endpoint:
      CLIENTES_ENDPOINT,

    cacheKey:
      CLIENTES_CACHE_KEY,

    cacheSchemaVersion:
      CLIENTES_CACHE_SCHEMA_VERSION,

    cacheAgeMs:
      ageMs,

    cached:
      Boolean(
        clientesState.loaded ||
        clientesState.hydrated
      ),

    lastLoadedAt:
      lastSyncAt
        ? new Date(
            lastSyncAt
          ).toISOString()
        : null,

    inFlight:
      Boolean(
        clientesState
          .inflightLoad
      ),

    detailInFlight:
      detailInflight.size,

    createInFlight:
      createInflight.size,

    stateEpoch,

    lastError:
      clientesState.error
        ? {
            message:
              clientesState.error,

            code:
              "CLIENTES_ERROR",
          }
        : null,

    backendContract:
      Object.freeze({
        list:
          "GET /api/clientes",

        detail:
          "GET /api/clientes/:id",

        create:
          "POST /api/clientes",

        update:
          false,

        delete:
          false,

        pagination:
          false,
      }),

    safeguards:
      Object.freeze({
        singleHttpLayer:
          true,

        noMethodMasquerading:
          true,

        noFakeCreateDetail:
          true,

        createPayloadWhitelisted:
          true,

        createAckWhitelisted:
          true,

        listUsesSingleRequest:
          true,

        listSingleFlight:
          true,

        detailSingleFlight:
          true,

        createSingleFlightByUser:
          true,

        staleLoadInvalidationAfterCreate:
          true,

        malformedListCannotWipeStore:
          true,

        validEmptyCache:
          true,

        safeCacheProjection:
          true,

        noSasPersisted:
          true,

        sensitiveRawKeysRemoved:
          true,

        strictCreateEmail:
          true,

        strictBooleanStatus:
          true,
      }),
  };
}

export async function loadClientesStats() {
  return computeClientesStats(
    clientesState.items
  );
}

export function getState() {
  return getClientesStoreSnapshot();
}

export function getSnapshot() {
  return getClientesApiSnapshot();
}

export const getDebugSnapshot =
  getClientesApiSnapshot;

export function getItems() {
  return [
    ...clientesState.items,
  ];
}

export function getClientesCount() {
  return clientesState.items
    .length;
}

export function hasClientes() {
  return (
    getClientesCount() >
    0
  );
}

export function clearClientesCache() {
  nextLoadToken();
  bumpStateEpoch();

  clientesState.items = [];
  clientesState.remoteCount = 0;

  clientesState.loading = false;
  clientesState.refreshing = false;

  clientesState.loaded = false;
  clientesState.hydrated = false;

  clientesState.error = "";
  clientesState.lastSyncAt = 0;

  clientesState.inflightLoad = null;

  clientesStore = [];

  detailInflight.clear();
  createInflight.clear();

  removeCachePayload();

  return true;
}

export {
  clientesState,
  clientesStore,

  setLoading,
  setRefreshing,
  setError,
  clearError,

  setItems,
  setRemoteCount,
  setLastSyncAt,
  touchLastSyncAt,
  setLoaded,
  setHydrated,

  replaceClientesStore,
  upsertClienteStore,
  removeClienteStore,

  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  filterClientes,
  computeClientesStats,
  statusBucket,
  getClienteStableId,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default Object.freeze({
  version:
    CLIENTES_API_VERSION,

  endpoint:
    CLIENTES_ENDPOINT,

  loadClientes,
  fetchClientes,
  listClientes,
  getClientes,
  refreshClientes,
  fetchClientesRequest,
  hydrateClientesFromCache,

  getClienteById,
  getClienteByIdRequest,
  fetchClienteById,
  fetchClienteDetail,
  loadClienteDetail,
  getCliente,

  createCliente,
  createClienteRequest,

  updateCliente,
  updateClienteRequest,
  patchCliente,
  putCliente,
  deleteCliente,
  deleteClienteRequest,

  getClienteByIdStore,
  getClientesStoreSnapshot,
  getClientesStateSnapshot,
  getClientesApiSnapshot,

  getState,
  getSnapshot,
  getDebugSnapshot,

  getItems,
  getClientesCount,
  hasClientes,
  clearClientesCache,

  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  filterClientes,
  computeClientesStats,
  loadClientesStats,
  statusBucket,
});

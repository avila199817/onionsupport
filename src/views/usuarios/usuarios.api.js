/* =========================================================
   Onion Support - Usuarios API
   Archivo: /src/views/usuarios/usuarios.api.js

   PRODUCTIVO · BACKEND CONTRACT REAL · HTTP ÚNICO · V4

   Backend productivo:
   - GET    /api/users
   - GET    /api/users/:id
   - POST   /api/users/create
   - PUT    /api/users/:id
   - PATCH  /api/users/:id
   - GET    /api/users/stats
   - DELETE /api/users/:id NO EXISTE

   Responsabilidad:
   - Ser la única capa HTTP del dominio Usuarios.
   - Mantener un único store/cache del dominio.
   - Conservar continuation tokens sin exponerlos innecesariamente.
   - Normalizar listado, detalle, creación y actualización.
   - Whitelist estricta de create/update.
   - PUT y PATCH reales, sin masquerading de método.
   - No intentar DELETE inexistente.
   - No persistir activationUrl, tokens, secretos ni SAS.
   - No persistir blob: URLs temporales.
   - Distinguir correctamente pending / active / inactive / blocked.
   - Sin DOM, Router, Toast ni listeners.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const USUARIOS_API_VERSION =
  "usuarios.api.backend-contract.v4.canonical-user-state";

export const USUARIOS_ENDPOINT = "/api/users";
export const USUARIOS_CREATE_ENDPOINT = "/api/users/create";
export const USUARIOS_STATS_ENDPOINT = "/api/users/stats";

export const USUARIOS_CACHE_KEY =
  "onion.support.usuarios.cache.v4";

export const USUARIOS_CACHE_TTL_MS = 60_000;

export const USUARIOS_TIMEOUT = 15_000;
export const USUARIOS_LIST_TIMEOUT = 20_000;
export const USUARIOS_DETAIL_TIMEOUT = 18_000;
export const USUARIOS_CREATE_TIMEOUT = 30_000;
export const USUARIOS_UPDATE_TIMEOUT = 30_000;
export const USUARIOS_DELETE_TIMEOUT = 30_000;

export const USUARIOS_FETCH_LIMIT = 250;
export const USUARIOS_MAX_LIMIT = 500;
export const USUARIOS_MAX_PAGES = 20;

export const USUARIOS_DEFAULT_SORT_BY = "updatedAt";
export const USUARIOS_DEFAULT_SORT_DIR = "DESC";

const CACHE_SCHEMA_VERSION = 4;

const ALLOWED_ROLES = new Set([
  "admin",
  "user",
]);

const ALLOWED_TYPES = new Set([
  "empresa",
  "particular",
]);

const ALLOWED_UPDATE_METHODS = new Set([
  "PUT",
  "PATCH",
]);

const ALLOWED_SORT_FIELDS = new Set([
  "updatedAt",
  "createdAt",
  "lastLoginAt",
  "name",
  "email",
  "username",
]);

const ALLOWED_FILTER_KEYS = new Set([
  "role",
  "rol",
  "tipo",
  "clienteTipo",
  "type",
  "active",
  "enabled",
  "emailVerified",
  "hasAvatar",
  "has2fa",
  "twofa",
  "search",
  "q",
]);

const ACTIVE_STATUS_VALUES = new Set([
  "active",
  "activo",
  "enabled",
  "habilitado",
  "verified",
  "activated",
]);

const PENDING_STATUS_VALUES = new Set([
  "pending",
  "pendiente",
  "invited",
  "invitado",
  "invite",
  "new",
  "unverified",
  "awaiting_activation",
  "awaitingactivation",
]);

const BLOCKED_STATUS_VALUES = new Set([
  "blocked",
  "bloqueado",
  "suspended",
  "suspendido",
  "locked",
  "restricted",
  "banned",
  "revoked",
]);

const INACTIVE_STATUS_VALUES = new Set([
  "disabled",
  "inactive",
  "inactivo",
  "archived",
  "deleted",
  "deactivated",
  "desactivado",
]);

let lastLoadToken = 0;
let lastError = null;
let lastLoadedAt = 0;
let lastResponseMeta = null;

const detailInflight = new Map();

export const usuariosState = {
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

let usuariosStore = [];

/* =========================================================
   BASICS
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

function cleanText(value = "", fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  No aplanar arrays:
  varios campos del dominio (roles, permissions, etc.)
  necesitan conservar su identidad como colección.
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

function number(value = 0, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(
    Math.max(
      number(value, min),
      min
    ),
    max
  );
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

function hasOwn(source = {}, key = "") {
  return (
    isObject(source) &&
    Object.prototype.hasOwnProperty.call(
      source,
      key
    )
  );
}

function uniqueStrings(
  values = [],
  {
    maxItems = 100,
    maxLength = 120,
    lower = false,
  } = {}
) {
  const output = [];
  const seen = new Set();

  const push = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        push(item);
      }

      return;
    }

    const raw = cleanText(value, "");

    if (!raw) return;

    const text = (
      lower
        ? raw.toLowerCase()
        : raw
    ).slice(
      0,
      Math.max(
        1,
        number(maxLength, 120)
      )
    );

    if (
      !text ||
      seen.has(text)
    ) {
      return;
    }

    seen.add(text);
    output.push(text);
  };

  push(values);

  return output.slice(
    0,
    Math.max(
      1,
      number(maxItems, 100)
    )
  );
}

/* =========================================================
   BOOLEAN / EMAIL / DATE
========================================================= */

function parseBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized =
    normalizeKey(value);

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "on",
      "active",
      "activo",
      "enabled",
      "habilitado",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
      "inactive",
      "inactivo",
      "disabled",
      "deshabilitado",
    ].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

function parseStrictBoolean(
  value,
  fieldName = "boolean"
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1") {
    return true;
  }

  if (value === 0 || value === "0") {
    return false;
  }

  const normalized =
    normalizeKey(value);

  if (
    [
      "true",
      "yes",
      "si",
      "on",
      "active",
      "activo",
      "enabled",
      "habilitado",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "no",
      "off",
      "inactive",
      "inactivo",
      "disabled",
      "deshabilitado",
    ].includes(normalized)
  ) {
    return false;
  }

  throw createContractError(
    "USUARIO_BOOLEAN_INVALID",
    `El campo ${fieldName} debe ser booleano.`
  );
}

function normalizeEmail(value = "") {
  const email =
    cleanText(
      value,
      ""
    ).toLowerCase();

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

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  )
    ? email
    : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email =
      normalizeEmail(value);

    if (email) {
      return email;
    }
  }

  return "";
}

function toTimestamp(value = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (value instanceof Date) {
    const ms =
      value.getTime();

    return Number.isFinite(ms)
      ? ms
      : 0;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    if (value <= 0) return 0;

    return value >
      9_999_999_999
      ? value
      : value * 1000;
  }

  const raw =
    cleanText(value, "");

  if (!raw) return 0;

  const numeric =
    Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return numeric >
      9_999_999_999
      ? numeric
      : numeric * 1000;
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

/* =========================================================
   ERROR CONTRACT
========================================================= */

function safeError(
  error = null,
  fallback = "Error de API de usuarios."
) {
  return cleanText(
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
}

function getErrorCode(
  source = null,
  fallback = ""
) {
  return cleanText(
    first(
      source?.code,
      source?.error,
      source?.data?.code,
      source?.data?.error,
      source?.payload?.code,
      source?.payload?.error,
      source?.response?.data?.code,
      source?.response?.data?.error,
      fallback
    ),
    fallback
  );
}

function getErrorStatus(
  source = null,
  fallback = 400
) {
  const status = number(
    first(
      source?.status,
      source?.statusCode,
      source?.data?.status,
      source?.response?.status,
      source?.response?.statusCode,
      fallback
    ),
    fallback
  );

  return clamp(
    status,
    100,
    599
  );
}

function createContractError(
  code = "USUARIOS_CONTRACT_ERROR",
  message = code,
  status = 400,
  extra = {}
) {
  const error =
    new Error(
      cleanText(
        message,
        code
      )
    );

  error.code =
    cleanText(
      code,
      "USUARIOS_CONTRACT_ERROR"
    );

  error.status =
    getErrorStatus(
      { status },
      400
    );

  const data =
    safeObject(extra);

  if (Object.keys(data).length) {
    error.data = data;
  }

  return error;
}

function createResponseError(
  response = null,
  {
    fallbackCode =
      "USUARIOS_REQUEST_REJECTED",
    fallbackMessage =
      "El backend rechazó la operación.",
    fallbackStatus = 400,
  } = {}
) {
  const source =
    safeObject(response);

  return createContractError(
    getErrorCode(
      source,
      fallbackCode
    ),
    safeError(
      source,
      fallbackMessage
    ),
    getErrorStatus(
      source,
      fallbackStatus
    ),
    {
      requestId:
        cleanText(
          first(
            source.requestId,
            source.meta?.requestId,
            ""
          ),
          ""
        ) || null,
    }
  );
}

/* =========================================================
   URL SECURITY
========================================================= */

function isSensitiveQueryParam(
  key = ""
) {
  return [
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "id_token",
    "idtoken",
    "token",
    "code",
    "secret",
    "session",
    "sessionid",
    "password",
    "pwd",
    "key",
    "jwt",
    "authorization",
    "reset_token",
    "resettoken",
    "activation_token",
    "activationtoken",
  ].includes(
    normalizeKey(key)
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
    host ===
      "onionassets.blob.core.windows.net" ||
    host.endsWith(
      ".blob.core.windows.net"
    )
  );
}

function safeAvatarUrl(value = "") {
  const raw =
    cleanText(value, "");

  if (!raw) return "";

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    /*
      Sólo runtime.
      Nunca se persiste en cache.
    */
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  const allowHttpLocal =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    );

  if (
    !/^https:\/\//i.test(raw) &&
    !allowHttpLocal
  ) {
    return "";
  }

  try {
    const url =
      new URL(raw);

    for (
      const key
      of url.searchParams.keys()
    ) {
      if (
        isSensitiveQueryParam(key)
      ) {
        return "";
      }
    }

    /*
      Azure SAS es válido para avatar si procede de Blob.
      No se considera credencial de sesión de la aplicación.
      Aun así, nunca se guarda en localStorage.
    */
    if (
      [...url.searchParams.keys()]
        .some((key) =>
          [
            "sig",
            "se",
            "sp",
            "sv",
            "sr",
            "spr",
            "st",
            "skoid",
            "sktid",
            "skt",
            "ske",
            "sks",
            "skv",
          ].includes(
            String(key)
              .toLowerCase()
          )
        ) &&
      !isAzureBlobHost(
        url.hostname
      )
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function avatarUrlForCache(
  value = ""
) {
  const url =
    safeAvatarUrl(value);

  if (!url) return "";

  if (/^blob:/i.test(url)) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(url)) {
      const parsed =
        new URL(url);

      /*
        Una SAS no debe persistirse.
        Conservamos sólo la URL estable del blob.
      */
      if (
        isAzureBlobHost(
          parsed.hostname
        )
      ) {
        parsed.search = "";
        parsed.hash = "";
        return parsed.href;
      }
    }
  } catch {
    return "";
  }

  return url;
}

/* =========================================================
   RAW SANITIZATION
========================================================= */

const SENSITIVE_RAW_EXACT_KEYS =
  new Set([
    "password",
    "passwordhash",
    "activationurl",
    "activateurl",
    "reseturl",
    "token",
    "tokenhash",
    "tokenversion",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "jwt",
    "secret",
    "twofasecret",
    "otp",
    "authorization",
    "cookie",
    "connectionstring",
    "sas",
    "signature",
    "clientsecret",
  ]);

function isSensitiveRawKey(
  key = ""
) {
  const normalized =
    normalizeKey(key)
      .replace(/[:.]/g, "");

  if (
    SENSITIVE_RAW_EXACT_KEYS.has(
      normalized
    )
  ) {
    return true;
  }

  return (
    /(password|token|secret|authorization|cookie|credential|connectionstring|activationurl|activateurl|reseturl|signature|(^|_)sas($|_))/i.test(
      normalized
    ) ||
    /^_rid$|^_self$|^_etag$|^_attachments$|^_ts$/i.test(
      cleanText(key, "")
    )
  );
}

function sanitizeRawValue(
  value,
  depth = 0
) {
  if (depth > 6) {
    return null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    return value.slice(
      0,
      2000
    );
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((item) =>
        sanitizeRawValue(
          item,
          depth + 1
        )
      );
  }

  if (!isObject(value)) {
    return null;
  }

  const output = {};

  for (
    const [key, item]
    of Object.entries(value)
  ) {
    if (
      isSensitiveRawKey(key)
    ) {
      continue;
    }

    const sanitized =
      sanitizeRawValue(
        item,
        depth + 1
      );

    if (
      sanitized !== undefined
    ) {
      output[key] =
        sanitized;
    }
  }

  return output;
}

function sanitizeRawUsuario(
  value = {}
) {
  return safeObject(
    sanitizeRawValue(
      safeObject(value)
    ),
    {}
  );
}

/* =========================================================
   MODEL
========================================================= */

function normalizeRoleValue(
  value = ""
) {
  const values =
    Array.isArray(value)
      ? value
      : [value];

  const roles =
    values
      .map((item) =>
        normalizeKey(item)
      )
      .filter(Boolean);

  if (
    roles.some((role) =>
      [
        "admin",
        "administrator",
        "administrador",
        "superadmin",
        "super_admin",
        "root",
        "owner",
      ].includes(role)
    )
  ) {
    return "admin";
  }

  return "user";
}

function normalizeTypeValue(
  value = ""
) {
  const type =
    normalizeKey(value);

  if (
    [
      "empresa",
      "company",
      "business",
      "b2b",
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

function normalizeDireccion(
  value = {}
) {
  const source =
    safeObject(value);

  return {
    calle:
      cleanText(
        first(
          source.calle,
          source.street,
          source.line1,
          ""
        ),
        ""
      ).slice(
        0,
        150
      ),

    cp:
      cleanText(
        first(
          source.cp,
          source.postalCode,
          source.zip,
          ""
        ),
        ""
      ).slice(
        0,
        20
      ),

    ciudad:
      cleanText(
        first(
          source.ciudad,
          source.city,
          ""
        ),
        ""
      ).slice(
        0,
        100
      ),

    provincia:
      cleanText(
        first(
          source.provincia,
          source.province,
          source.region,
          ""
        ),
        ""
      ).slice(
        0,
        100
      ),

    pais:
      cleanText(
        first(
          source.pais,
          source.country,
          ""
        ),
        ""
      ).slice(
        0,
        100
      ),
  };
}

function normalizePermissions(
  value = []
) {
  return uniqueStrings(
    value,
    {
      maxItems: 100,
      maxLength: 80,
    }
  );
}

function hasBlockedFlag(
  source = {}
) {
  const raw =
    safeObject(source);

  return Boolean(
    raw.blocked === true ||
    raw.suspended === true ||
    raw.banned === true ||
    raw.revoked === true ||
    raw.locked === true
  );
}

function looksLikeNeverActivated(
  source = {}
) {
  const raw =
    safeObject(source);

  return Boolean(
    raw.active !== true &&
    raw.isActive !== true &&
    raw.enabled !== true &&
    raw.emailVerified !== true &&
    !toTimestamp(
      first(
        raw.activatedAt,
        null
      )
    ) &&
    !toTimestamp(
      first(
        raw.deactivatedAt,
        null
      )
    ) &&
    !raw.deleted &&
    !raw.archived
  );
}

function normalizeStatusValue(
  value = "",
  source = {}
) {
  const raw =
    safeObject(source);

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
    PENDING_STATUS_VALUES.has(
      explicit
    )
  ) {
    return "pending";
  }

  if (
    BLOCKED_STATUS_VALUES.has(
      explicit
    ) ||
    hasBlockedFlag(raw)
  ) {
    return "blocked";
  }

  const explicitInactive =
    INACTIVE_STATUS_VALUES.has(
      explicit
    );

  const explicitlyDisabled =
    raw.active === false ||
    raw.isActive === false ||
    raw.enabled === false ||
    raw.disabled === true;

  /*
    El backend de listado usa "disabled" para active=false.
    Los usuarios recién creados también nacen active=false,
    emailVerified=false y todavía no tienen activatedAt/deactivatedAt.

    Por tanto, antes de llamar "inactive" a un disabled genérico,
    comprobamos lifecycle para distinguir una invitación pendiente.
  */
  if (
    (explicitInactive ||
      explicitlyDisabled) &&
    looksLikeNeverActivated(raw)
  ) {
    return "pending";
  }

  if (
    explicitInactive ||
    explicitlyDisabled ||
    raw.deleted === true ||
    raw.archived === true
  ) {
    return "inactive";
  }

  if (
    ACTIVE_STATUS_VALUES.has(
      explicit
    ) ||
    raw.active === true ||
    raw.isActive === true ||
    raw.enabled === true
  ) {
    return "active";
  }

  return "active";
}

function normalizeSecurity(
  source = {}
) {
  const raw =
    safeObject(source);

  const activation =
    safeObject(
      raw.activation,
      {}
    );

  const reset =
    safeObject(
      raw.reset,
      {}
    );

  return {
    twofaEnabled:
      parseBoolean(
        first(
          raw.twofaEnabled,
          raw.twofa_enabled,
          false
        ),
        false
      ),

    twofaMethod:
      cleanText(
        first(
          raw.twofaMethod,
          raw.twofa_method,
          ""
        ),
        ""
      ) || null,

    twofaCreatedAt:
      first(
        raw.twofaCreatedAt,
        raw.twofa_createdAt,
        null
      ),

    lastPasswordChangeAt:
      first(
        raw.lastPasswordChangeAt,
        null
      ),

    emailChangePending:
      parseBoolean(
        raw.emailChangePending,
        false
      ),

    activation:
      Object.keys(activation).length
        ? sanitizeRawUsuario(
            activation
          )
        : {},

    reset:
      Object.keys(reset).length
        ? sanitizeRawUsuario(
            reset
          )
        : {},
  };
}

export function normalizeUsuarioModel(
  item = {}
) {
  const original =
    safeObject(item);

  const raw =
    sanitizeRawUsuario(
      original
    );

  const profile =
    safeObject(
      first(
        raw.profile,
        raw.usuario,
        raw.user,
        {}
      )
    );

  const direccion =
    normalizeDireccion(
      first(
        raw.direccion,
        raw.address,
        raw.location,
        profile.direccion,
        profile.address,
        {}
      )
    );

  const userId =
    cleanText(
      first(
        raw.userId,
        raw.usuarioId,
        raw.id,
        raw._id,
        raw.uid,
        profile.userId,
        profile.id,
        raw.email,
        raw.username,
        ""
      ),
      ""
    );

  const firstName =
    cleanText(
      first(
        raw.firstName,
        profile.firstName,
        ""
      ),
      ""
    );

  const lastName =
    cleanText(
      first(
        raw.lastName,
        raw.apellidos,
        profile.lastName,
        profile.apellidos,
        ""
      ),
      ""
    );

  const composedName =
    cleanText(
      [
        firstName,
        lastName,
      ]
        .filter(Boolean)
        .join(" "),
      ""
    );

  const name =
    cleanText(
      first(
        raw.name,
        raw.displayName,
        raw.fullName,
        raw.nombre,
        raw.nombreCompleto,
        composedName,
        profile.name,
        profile.displayName,
        profile.fullName,
        raw.username,
        raw.email,
        userId,
        "Usuario"
      ),
      "Usuario"
    ).slice(
      0,
      160
    );

  const email =
    firstEmail(
      raw.email,
      raw.emailLower,
      raw.mail,
      raw.userEmail,
      profile.email,
      profile.emailLower
    );

  const username =
    cleanText(
      first(
        raw.username,
        raw.userName,
        raw.usernameLower,
        profile.username,
        profile.userName,
        ""
      ),
      ""
    ).slice(
      0,
      100
    );

  const role =
    normalizeRoleValue(
      first(
        raw.role,
        raw.rol,
        raw.roles,
        profile.role,
        profile.rol,
        "user"
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

  const phone =
    cleanText(
      first(
        raw.phone,
        raw.telefono,
        raw.mobile,
        raw.movil,
        profile.phone,
        profile.telefono,
        ""
      ),
      ""
    ).slice(
      0,
      40
    );

  const tipo =
    normalizeTypeValue(
      first(
        raw.tipo,
        raw.clienteTipo,
        profile.tipo,
        ""
      )
    ) ||
    cleanText(
      first(
        raw.tipo,
        profile.tipo,
        ""
      ),
      ""
    );

  const nif =
    cleanText(
      first(
        raw.nif,
        raw.NIF,
        raw.cif,
        raw.taxId,
        ""
      ),
      ""
    )
      .toUpperCase()
      .slice(
        0,
        32
      );

  const avatar =
    safeAvatarUrl(
      first(
        raw.avatarUrl,
        raw.avatar,
        raw.photoUrl,
        raw.picture,
        profile.avatarUrl,
        profile.avatar,
        profile.photoUrl,
        profile.picture,
        ""
      )
    );

  const createdAt =
    first(
      raw.createdAt,
      raw.created_at,
      raw.fechaCreacion,
      raw.registeredAt,
      null
    );

  const updatedAt =
    first(
      raw.updatedAt,
      raw.updated_at,
      raw.modifiedAt,
      raw.lastActivityAt,
      createdAt,
      null
    );

  const lastLoginAt =
    first(
      raw.lastLoginAt,
      raw.last_login_at,
      raw.lastAccessAt,
      raw.ultimoAcceso,
      null
    );

  const active =
    status === "active";

  const securitySource = {
    ...safeObject(
      raw.security
    ),

    twofaEnabled:
      first(
        raw.security?.twofaEnabled,
        raw.twofa_enabled,
        raw.has2FA,
        false
      ),

    twofaMethod:
      first(
        raw.security?.twofaMethod,
        raw.twofa_method,
        raw.twofaMethod,
        ""
      ),

    twofaCreatedAt:
      first(
        raw.security?.twofaCreatedAt,
        raw.twofa_createdAt,
        raw.twofaCreatedAt,
        null
      ),

    lastPasswordChangeAt:
      first(
        raw.security?.lastPasswordChangeAt,
        raw.lastPasswordChangeAt,
        null
      ),
  };

  const permissions =
    normalizePermissions(
      first(
        raw.permissions,
        []
      )
    );

  const roles =
    uniqueStrings(
      first(
        raw.roles,
        [
          role,
        ]
      ),
      {
        maxItems: 20,
        maxLength: 40,
        lower: true,
      }
    );

  const normalized = {
    ...raw,

    id: userId,
    userId,
    usuarioId: userId,

    uid:
      cleanText(
        first(
          raw.uid,
          userId
        ),
        userId
      ),

    code:
      cleanText(
        first(
          raw.code,
          raw.username,
          userId,
          email
        ),
        userId || email
      ),

    clienteId:
      cleanText(
        first(
          raw.clienteId,
          raw.clientId,
          ""
        ),
        ""
      ),

    clientId:
      cleanText(
        first(
          raw.clientId,
          raw.clienteId,
          ""
        ),
        ""
      ),

    fullName: name,
    displayName: name,
    name,
    nombre: name,

    firstName,
    lastName,
    apellidos: lastName,

    email,
    emailLower: email,
    mail: email,

    username,
    userName: username,
    usernameLower:
      username.toLowerCase(),

    slug:
      cleanText(
        first(
          raw.slug,
          username
        ),
        username
      ),

    role,
    rol: role,
    roles:
      roles.length
        ? roles
        : [role],

    tipo,
    nif,

    status,
    estado: status,
    state: status,

    active,
    isActive: active,
    enabled: active,

    blocked:
      status === "blocked",

    disabled:
      status === "inactive",

    phone,
    telefono: phone,

    mobile:
      cleanText(
        first(
          raw.mobile,
          raw.movil,
          phone
        ),
        phone
      ),

    direccion,

    address: {
      ...direccion,
      street:
        direccion.calle,
      postalCode:
        direccion.cp,
      city:
        direccion.ciudad,
      ciudad:
        direccion.ciudad,
      province:
        direccion.provincia,
      country:
        direccion.pais,
    },

    location: {
      city:
        direccion.ciudad,
      ciudad:
        direccion.ciudad,
      province:
        direccion.provincia,
      country:
        direccion.pais,
    },

    city:
      direccion.ciudad,

    ciudad:
      direccion.ciudad,

    provincia:
      direccion.provincia,

    pais:
      direccion.pais,

    avatar,
    avatarUrl: avatar,
    photoUrl: avatar,
    picture: avatar,

    hasAvatar:
      Boolean(
        avatar ||
        raw.hasAvatar
      ),

    avatarUpdatedAt:
      first(
        raw.avatarUpdatedAt,
        null
      ),

    emailVerified:
      parseBoolean(
        first(
          raw.emailVerified,
          raw.meta?.emailVerified,
          false
        ),
        false
      ),

    privacyMode:
      parseBoolean(
        raw.privacyMode,
        false
      ),

    darkMode:
      parseBoolean(
        raw.darkMode,
        true
      ),

    permissions,

    security:
      normalizeSecurity(
        securitySource
      ),

    createdAt,
    updatedAt,
    lastLoginAt,

    lastAccessAt:
      first(
        raw.lastAccessAt,
        lastLoginAt,
        null
      ),

    lastActivityAt:
      first(
        raw.lastActivityAt,
        updatedAt,
        lastLoginAt,
        createdAt,
        null
      ),

    activatedAt:
      first(
        raw.activatedAt,
        null
      ),

    activatedBy:
      cleanText(
        first(
          raw.activatedBy,
          ""
        ),
        ""
      ) || null,

    activatedByRole:
      cleanText(
        first(
          raw.activatedByRole,
          ""
        ),
        ""
      ) || null,

    deactivatedAt:
      first(
        raw.deactivatedAt,
        null
      ),

    deactivatedBy:
      cleanText(
        first(
          raw.deactivatedBy,
          ""
        ),
        ""
      ) || null,

    deactivatedByRole:
      cleanText(
        first(
          raw.deactivatedByRole,
          ""
        ),
        ""
      ) || null,

    deactivationReason:
      cleanText(
        first(
          raw.deactivationReason,
          ""
        ),
        ""
      ) || null,

    updatedBy:
      cleanText(
        first(
          raw.updatedBy,
          ""
        ),
        ""
      ) || null,

    raw,

    meta: {
      ...safeObject(
        raw.meta
      ),

      frontendReady: true,

      canonicalStatus:
        status,

      canonicalRole:
        role,

      timestampMs:
        toTimestamp(
          first(
            updatedAt,
            lastLoginAt,
            createdAt
          )
        ),
    },
  };

  return normalized;
}

function getUsuarioStableId(
  item = {}
) {
  const source =
    safeObject(item);

  return cleanText(
    first(
      source.userId,
      source.usuarioId,
      source.id,
      source._id,
      source.uid,
      source.email,
      source.username,
      ""
    ),
    ""
  );
}

function getUsuarioMergeKey(
  item = {}
) {
  const source =
    normalizeUsuarioModel(item);

  const stableId =
    getUsuarioStableId(
      source
    );

  if (stableId) {
    return `id:${stableId.toLowerCase()}`;
  }

  if (source.email) {
    return `email:${source.email.toLowerCase()}`;
  }

  if (source.username) {
    return `username:${source.username.toLowerCase()}`;
  }

  return "";
}

function mergeUsuarioModels(
  previous = {},
  incoming = {}
) {
  const left =
    normalizeUsuarioModel(
      previous
    );

  const right =
    normalizeUsuarioModel(
      incoming
    );

  /*
    El detalle suele traer más datos que el listado.
    Para no borrar información segura existente cuando llega
    una fila parcial, fusionamos campos anidados explícitamente.
  */
  return normalizeUsuarioModel({
    ...left,
    ...right,

    direccion: {
      ...safeObject(
        left.direccion
      ),
      ...safeObject(
        right.direccion
      ),
    },

    security: {
      ...safeObject(
        left.security
      ),
      ...safeObject(
        right.security
      ),
    },

    permissions:
      right.permissions?.length
        ? right.permissions
        : left.permissions,

    raw: {
      ...safeObject(
        left.raw
      ),
      ...safeObject(
        right.raw
      ),
    },
  });
}

function dedupeUsuarios(
  items = []
) {
  const map = new Map();
  let anonymousIndex = 0;

  for (
    const value
    of safeArray(items)
  ) {
    if (!isObject(value)) {
      continue;
    }

    const normalized =
      normalizeUsuarioModel(
        value
      );

    const key =
      getUsuarioMergeKey(
        normalized
      ) ||
      `anonymous:${anonymousIndex++}`;

    if (map.has(key)) {
      map.set(
        key,
        mergeUsuarioModels(
          map.get(key),
          normalized
        )
      );

      continue;
    }

    map.set(
      key,
      normalized
    );
  }

  return [...map.values()]
    .sort((a, b) => {
      const diff =
        toTimestamp(
          first(
            b.updatedAt,
            b.lastActivityAt,
            b.lastLoginAt,
            b.createdAt
          )
        ) -
        toTimestamp(
          first(
            a.updatedAt,
            a.lastActivityAt,
            a.lastLoginAt,
            a.createdAt
          )
        );

      if (diff !== 0) {
        return diff;
      }

      return getUsuarioStableId(a)
        .localeCompare(
          getUsuarioStableId(b),
          "es",
          {
            numeric: true,
            sensitivity: "base",
          }
        );
    });
}

export function normalizeUsuariosCollection(
  items = []
) {
  return dedupeUsuarios(
    items
  );
}

export function findUsuarioById(
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
    safeArray(items).find(
      (item) => {
        const normalized =
          normalizeUsuarioModel(
            item
          );

        const candidates = [
          normalized.userId,
          normalized.usuarioId,
          normalized.id,
          normalized.uid,
          normalized.username,
          normalized.email,
        ];

        return candidates.some(
          (candidate) =>
            cleanText(
              candidate,
              ""
            ).toLowerCase() ===
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
  const current =
    normalizeUsuarioModel(
      item
    );

  if (
    current.status ===
    "pending"
  ) {
    return "pending";
  }

  if (
    current.status ===
      "blocked" ||
    current.status ===
      "inactive"
  ) {
    return "blocked";
  }

  return "active";
}

/* =========================================================
   ENDPOINTS / QUERY
========================================================= */

export function normalizeUsuarioId(
  id = ""
) {
  const value =
    cleanText(
      id,
      ""
    );

  if (!value) {
    throw createContractError(
      "USUARIO_ID_REQUIRED",
      "Falta el identificador del usuario."
    );
  }

  if (
    value.length > 254 ||
    /[\r\n\t]/.test(value)
  ) {
    throw createContractError(
      "USUARIO_ID_INVALID",
      "El identificador del usuario no es válido."
    );
  }

  return value;
}

export function getUsuariosEndpoint() {
  return USUARIOS_ENDPOINT;
}

export function getUsuarioEndpoint(
  id = ""
) {
  return (
    `${USUARIOS_ENDPOINT}/` +
    encodeURIComponent(
      normalizeUsuarioId(id)
    )
  );
}

function normalizeSortField(
  value = ""
) {
  const field =
    cleanText(
      value,
      USUARIOS_DEFAULT_SORT_BY
    );

  return ALLOWED_SORT_FIELDS.has(
    field
  )
    ? field
    : USUARIOS_DEFAULT_SORT_BY;
}

function normalizeSortDirection(
  value = ""
) {
  return (
    cleanText(
      value,
      USUARIOS_DEFAULT_SORT_DIR
    ).toUpperCase() === "ASC"
      ? "ASC"
      : "DESC"
  );
}

function cleanQueryValue(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : undefined;
  }

  const text =
    cleanText(
      value,
      ""
    );

  return text || undefined;
}

export function buildUsuariosListQuery({
  limit = USUARIOS_FETCH_LIMIT,

  ct = "",
  continuationToken = "",
  nextToken = "",

  includeTotal = true,

  sortBy =
    USUARIOS_DEFAULT_SORT_BY,

  sortDir =
    USUARIOS_DEFAULT_SORT_DIR,

  role = "",
  rol = "",

  tipo = "",
  clienteTipo = "",
  type = "",

  active,
  enabled,

  emailVerified,
  hasAvatar,
  has2fa,
  twofa,

  search = "",
  q = "",

  filters = {},
} = {}) {
  const query = {
    limit:
      clamp(
        limit,
        1,
        USUARIOS_MAX_LIMIT
      ),

    includeTotal:
      Boolean(
        includeTotal
      ),

    sortBy:
      normalizeSortField(
        sortBy
      ),

    sortDir:
      normalizeSortDirection(
        sortDir
      ),
  };

  const token =
    cleanText(
      first(
        ct,
        continuationToken,
        nextToken,
        ""
      ),
      ""
    );

  const finalRole =
    normalizeRoleValue(
      first(
        role,
        rol,
        ""
      )
    );

  const rawRole =
    cleanText(
      first(
        role,
        rol,
        ""
      ),
      ""
    );

  const finalType =
    normalizeTypeValue(
      first(
        tipo,
        clienteTipo,
        type,
        ""
      )
    );

  const finalSearch =
    cleanText(
      first(
        search,
        q,
        ""
      ),
      ""
    ).slice(
      0,
      200
    );

  const finalActive =
    active !== undefined
      ? active
      : enabled;

  const finalTwofa =
    has2fa !== undefined
      ? has2fa
      : twofa;

  if (token) {
    query.ct = token;
  }

  if (rawRole) {
    query.role =
      finalRole;
  }

  if (finalType) {
    query.tipo =
      finalType;
  }

  if (finalSearch) {
    /*
      El backend acepta search/q.
      Enviamos ambos por compatibilidad del contrato actual.
    */
    query.search =
      finalSearch;

    query.q =
      finalSearch;
  }

  if (
    finalActive !==
    undefined
  ) {
    query.active =
      parseBoolean(
        finalActive,
        true
      );
  }

  if (
    emailVerified !==
    undefined
  ) {
    query.emailVerified =
      parseBoolean(
        emailVerified,
        false
      );
  }

  if (
    hasAvatar !==
    undefined
  ) {
    query.hasAvatar =
      parseBoolean(
        hasAvatar,
        false
      );
  }

  if (
    finalTwofa !==
    undefined
  ) {
    query.has2fa =
      parseBoolean(
        finalTwofa,
        false
      );
  }

  /*
    Compat controlada:
    filters no puede inyectar claves arbitrarias ni pisar
    continuation/sort/paginación.
  */
  for (
    const [key, value]
    of Object.entries(
      safeObject(filters)
    )
  ) {
    if (
      !ALLOWED_FILTER_KEYS.has(
        key
      )
    ) {
      continue;
    }

    const cleanValue =
      cleanQueryValue(
        value
      );

    if (
      cleanValue ===
      undefined
    ) {
      continue;
    }

    if (
      key === "active" ||
      key === "enabled" ||
      key === "emailVerified" ||
      key === "hasAvatar" ||
      key === "has2fa" ||
      key === "twofa"
    ) {
      query[
        key === "enabled"
          ? "active"
          : key === "twofa"
            ? "has2fa"
            : key
      ] = parseBoolean(
        cleanValue,
        false
      );

      continue;
    }

    if (
      key === "role" ||
      key === "rol"
    ) {
      query.role =
        normalizeRoleValue(
          cleanValue
        );

      continue;
    }

    if (
      key === "tipo" ||
      key === "clienteTipo" ||
      key === "type"
    ) {
      const normalized =
        normalizeTypeValue(
          cleanValue
        );

      if (normalized) {
        query.tipo =
          normalized;
      }

      continue;
    }

    if (
      key === "search" ||
      key === "q"
    ) {
      const text =
        cleanText(
          cleanValue,
          ""
        ).slice(
          0,
          200
        );

      if (text) {
        query.search =
          text;

        query.q =
          text;
      }
    }
  }

  return query;
}

/* =========================================================
   HTTP ÚNICO
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
      "USUARIOS_ENDPOINT_REQUIRED",
      "Falta el endpoint de Usuarios.",
      500
    );
  }

  const timeout =
    clamp(
      number(
        options.timeout,
        USUARIOS_TIMEOUT
      ),
      1_000,
      120_000
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
      "views.usuarios.api"
    );

  if (
    verb === "GET" &&
    isFunction(Http?.get)
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
    isFunction(Http?.post)
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
    verb === "PUT" &&
    isFunction(Http?.put)
  ) {
    return Http.put(
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
    verb === "PATCH" &&
    isFunction(Http?.patch)
  ) {
    return Http.patch(
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
        method: verb,
        body,
        data: body,
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
    `USUARIOS_HTTP_${verb}_UNAVAILABLE`,
    `El cliente HTTP no expone ${verb} para Usuarios.`,
    500
  );
}

/* =========================================================
   RESPONSE READERS
========================================================= */

function envelopeObjects(
  payload = null,
  maxDepth = 7
) {
  const output = [];

  const queue = [
    {
      value: payload,
      depth: 0,
    },
  ];

  const seen = new Set();

  while (queue.length) {
    const {
      value,
      depth,
    } = queue.shift();

    if (
      !isObject(value) ||
      seen.has(value) ||
      depth > maxDepth
    ) {
      continue;
    }

    seen.add(value);
    output.push(value);

    for (const key of [
      "data",
      "payload",
      "result",
      "response",
      "body",
      "value",
    ]) {
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

function pickItems(
  payload = null
) {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (
    const source
    of envelopeObjects(payload)
  ) {
    for (const key of [
      "items",
      "rows",
      "users",
      "usuarios",
      "results",
      "records",
      "docs",
      "documents",
      "list",
    ]) {
      if (
        Array.isArray(
          source[key]
        )
      ) {
        return source[key];
      }
    }
  }

  return [];
}

function pickTotal(
  payload = null,
  fallback = 0
) {
  for (
    const source
    of envelopeObjects(payload)
  ) {
    for (const value of [
      source.total,
      source.totalCount,
      source.remoteCount,
      source.count,
      source.pagination?.total,
      source.pagination?.totalCount,
    ]) {
      const parsed =
        Number(value);

      if (
        Number.isFinite(parsed) &&
        parsed >= 0
      ) {
        return parsed;
      }
    }
  }

  return Math.max(
    0,
    number(
      fallback,
      0
    )
  );
}

function pickContinuationToken(
  payload = null
) {
  for (
    const source
    of envelopeObjects(payload)
  ) {
    const token =
      cleanText(
        first(
          source.continuationToken,
          source.nextContinuationToken,
          source.nextToken,
          source.ct,
          source.pagination?.continuationToken,
          source.pagination?.nextContinuationToken,
          source.pagination?.nextToken,
          ""
        ),
        ""
      );

    if (token) {
      return token;
    }
  }

  return "";
}

function pickHasMore(
  payload = null
) {
  for (
    const source
    of envelopeObjects(payload)
  ) {
    const value =
      first(
        source.hasMore,
        source.more,
        source.pagination?.hasMore
      );

    if (
      value === true ||
      value === false
    ) {
      return value;
    }

    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return parseBoolean(
        value,
        false
      );
    }
  }

  return Boolean(
    pickContinuationToken(
      payload
    )
  );
}

function looksLikeUsuario(
  value = null
) {
  const item =
    safeObject(
      value,
      null
    );

  if (!item) {
    return false;
  }

  return Boolean(
    item.userId ||
    item.usuarioId ||
    item.id ||
    item.username ||
    item.email ||
    item.name ||
    item.displayName ||
    item.fullName
  );
}

/*
  CREATE devuelve un envelope que incluye activationUrl.
  Se prioriza SIEMPRE user/usuario/item/detail antes que
  el envelope superior para no contaminar el modelo.
*/
function pickDetail(
  payload = null
) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return (
      payload.find(
        looksLikeUsuario
      ) ||
      payload[0] ||
      null
    );
  }

  for (
    const source
    of envelopeObjects(payload)
  ) {
    for (const key of [
      "user",
      "usuario",
      "item",
      "detail",
      "record",
    ]) {
      if (
        looksLikeUsuario(
          source[key]
        )
      ) {
        return source[key];
      }
    }
  }

  if (
    looksLikeUsuario(
      payload
    )
  ) {
    return payload;
  }

  return null;
}

function normalizeDetailResponse(
  payload = null
) {
  const detail =
    pickDetail(payload);

  return detail
    ? normalizeUsuarioModel(
        detail
      )
    : null;
}

function normalizeCreateDetailResponse(
  payload = null
) {
  const raw =
    pickDetail(payload);

  if (!raw) {
    return null;
  }

  /*
    Contrato real create:
    active=false + activación por correo.
    Aunque el safe user del create no incluya emailVerified,
    el estado de presentación correcto es pending.
  */
  const normalized =
    normalizeUsuarioModel({
      ...safeObject(raw),
      status:
        "pending",
      active:
        false,
      isActive:
        false,
      enabled:
        false,
      emailVerified:
        false,
    });

  return normalized;
}

function mergeListResponses(
  responses = []
) {
  const pages =
    safeArray(responses)
      .filter(
        (page) =>
          page !== null &&
          page !== undefined
      );

  const items =
    normalizeUsuariosCollection(
      pages.flatMap(
        pickItems
      )
    );

  const totals =
    pages
      .map((page) =>
        pickTotal(
          page,
          0
        )
      )
      .filter(
        (value) =>
          Number.isFinite(
            Number(value)
          )
      );

  const total =
    Math.max(
      items.length,
      ...totals,
      0
    );

  const last =
    pages.at(-1) ||
    {};

  const continuationToken =
    pickContinuationToken(
      last
    );

  const hasMore =
    pickHasMore(last);

  return {
    ...safeObject(last),

    ok: true,
    success: true,

    total,
    totalCount: total,
    remoteCount: total,

    count:
      items.length,

    returned:
      items.length,

    items,
    users: items,
    usuarios: items,
    rows: items,
    results: items,

    hasMore,

    continuationToken:
      continuationToken ||
      null,

    nextContinuationToken:
      continuationToken ||
      null,

    pagination: {
      ...safeObject(
        last?.pagination
      ),

      pages:
        pages.length,

      total,
      totalCount: total,

      returned:
        items.length,

      hasMore,

      continuationToken:
        continuationToken ||
        null,

      nextContinuationToken:
        continuationToken ||
        null,
    },
  };
}

/* =========================================================
   CACHE
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

function readCachePayload() {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        USUARIOS_CACHE_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    return isObject(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function removeCachePayload() {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.removeItem(
      USUARIOS_CACHE_KEY
    );

    return true;
  } catch {
    return false;
  }
}

function toCacheUsuario(
  item = {}
) {
  const user =
    normalizeUsuarioModel(
      item
    );

  const avatar =
    avatarUrlForCache(
      user.avatarUrl
    );

  /*
    Cache deliberadamente reducida:
    - sin raw duplicado
    - sin envelopes
    - sin URLs temporales
    - sin tokens
    - sin secretos
  */
  return {
    id: user.userId,
    userId: user.userId,
    usuarioId: user.userId,
    uid: user.uid,
    code: user.code,

    clienteId: user.clienteId,

    name: user.name,
    fullName: user.fullName,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,

    email: user.email,
    emailLower: user.email,

    username: user.username,
    usernameLower:
      user.usernameLower,
    slug: user.slug,

    role: user.role,
    roles: user.roles,

    tipo: user.tipo,
    nif: user.nif,

    status: user.status,
    active: user.active,

    phone: user.phone,

    direccion: {
      ...safeObject(
        user.direccion
      ),
    },

    avatar,
    avatarUrl: avatar,
    hasAvatar:
      Boolean(
        avatar ||
        user.hasAvatar
      ),

    avatarUpdatedAt:
      user.avatarUpdatedAt,

    emailVerified:
      user.emailVerified,

    privacyMode:
      user.privacyMode,

    darkMode:
      user.darkMode,

    permissions:
      normalizePermissions(
        user.permissions
      ),

    security: {
      twofaEnabled:
        user.security
          ?.twofaEnabled === true,

      twofaMethod:
        cleanText(
          user.security
            ?.twofaMethod,
          ""
        ) || null,

      twofaCreatedAt:
        user.security
          ?.twofaCreatedAt ||
        null,

      lastPasswordChangeAt:
        user.security
          ?.lastPasswordChangeAt ||
        null,

      emailChangePending:
        user.security
          ?.emailChangePending === true,
    },

    createdAt:
      user.createdAt,

    updatedAt:
      user.updatedAt,

    lastLoginAt:
      user.lastLoginAt,

    activatedAt:
      user.activatedAt,

    deactivatedAt:
      user.deactivatedAt,

    deactivationReason:
      user.deactivationReason,

    activatedBy:
      user.activatedBy,

    activatedByRole:
      user.activatedByRole,

    deactivatedBy:
      user.deactivatedBy,

    deactivatedByRole:
      user.deactivatedByRole,

    updatedBy:
      user.updatedBy,

    meta: {
      frontendReady: true,
      canonicalStatus:
        user.status,
      canonicalRole:
        user.role,
      timestampMs:
        toTimestamp(
          first(
            user.updatedAt,
            user.lastLoginAt,
            user.createdAt
          )
        ),
    },
  };
}

function writeCachePayload() {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const safeItems =
      usuariosState.items
        .map(
          toCacheUsuario
        );

    const now =
      Date.now();

    window.localStorage.setItem(
      USUARIOS_CACHE_KEY,
      JSON.stringify({
        schemaVersion:
          CACHE_SCHEMA_VERSION,

        apiVersion:
          USUARIOS_API_VERSION,

        items:
          safeItems,

        remoteCount:
          usuariosState.remoteCount,

        lastSyncAt:
          usuariosState.lastSyncAt ||
          now,

        cachedAt:
          now,
      })
    );

    return true;
  } catch {
    return false;
  }
}

function hydrateStateFromCache({
  freshOnly = true,
} = {}) {
  const payload =
    readCachePayload();

  if (!payload) {
    return false;
  }

  if (
    number(
      payload.schemaVersion,
      0
    ) !==
    CACHE_SCHEMA_VERSION
  ) {
    removeCachePayload();
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
      ? Date.now() -
        cachedAt
      : Number
          .POSITIVE_INFINITY;

  if (
    freshOnly &&
    age >
      USUARIOS_CACHE_TTL_MS
  ) {
    return false;
  }

  const items =
    normalizeUsuariosCollection(
      payload.items
    );

  /*
    Una colección vacía cacheada sí es válida si el backend
    confirmó remoteCount=0.
  */
  const remoteCount =
    Math.max(
      0,
      number(
        payload.remoteCount,
        items.length
      )
    );

  if (
    !items.length &&
    remoteCount > 0
  ) {
    return false;
  }

  usuariosState.items =
    items;

  usuariosStore =
    items;

  usuariosState.remoteCount =
    Math.max(
      items.length,
      remoteCount
    );

  usuariosState.lastSyncAt =
    number(
      payload.lastSyncAt,
      cachedAt ||
      Date.now()
    );

  usuariosState.hydrated =
    true;

  usuariosState.loaded =
    true;

  usuariosState.error =
    "";

  return true;
}

/* =========================================================
   STATE / STORE
========================================================= */

function setLoading(
  value = false
) {
  usuariosState.loading =
    Boolean(value);

  return usuariosState.loading;
}

function setRefreshing(
  value = false
) {
  usuariosState.refreshing =
    Boolean(value);

  return usuariosState.refreshing;
}

function setError(
  value = ""
) {
  usuariosState.error =
    cleanText(
      value,
      ""
    );

  return usuariosState.error;
}

function clearError() {
  usuariosState.error = "";
  return true;
}

function setItems(
  items = [],
  {
    remoteCount = null,
  } = {}
) {
  const list =
    normalizeUsuariosCollection(
      items
    );

  usuariosState.items =
    list;

  usuariosStore =
    list;

  if (
    remoteCount ===
      null ||
    remoteCount ===
      undefined
  ) {
    usuariosState.remoteCount =
      Math.max(
        list.length,
        usuariosState
          .remoteCount
      );
  } else {
    usuariosState.remoteCount =
      Math.max(
        list.length,
        number(
          remoteCount,
          list.length
        )
      );
  }

  return list;
}

function setRemoteCount(
  value = 0
) {
  usuariosState.remoteCount =
    Math.max(
      usuariosState
        .items.length,
      number(
        value,
        usuariosState
          .items.length
      )
    );

  return usuariosState
    .remoteCount;
}

function setLastSyncAt(
  value = Date.now()
) {
  usuariosState.lastSyncAt =
    number(
      value,
      Date.now()
    );

  return usuariosState
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
  usuariosState.loaded =
    Boolean(value);

  return usuariosState.loaded;
}

function setHydrated(
  value = true
) {
  usuariosState.hydrated =
    Boolean(value);

  return usuariosState.hydrated;
}

function getInflightLoad() {
  return (
    usuariosState
      .inflightLoad ||
    null
  );
}

function setInflightLoad(
  task = null
) {
  usuariosState.inflightLoad =
    task || null;

  return usuariosState
    .inflightLoad;
}

function clearInflightLoad(
  task = null
) {
  if (
    !task ||
    usuariosState
      .inflightLoad ===
      task
  ) {
    usuariosState
      .inflightLoad =
      null;
  }

  return true;
}

export function getUsuarios() {
  return usuariosStore;
}

export function replaceUsuariosStore(
  items = []
) {
  const list =
    normalizeUsuariosCollection(
      items
    );

  usuariosStore =
    list;

  usuariosState.items =
    list;

  usuariosState.remoteCount =
    Math.max(
      usuariosState
        .remoteCount,
      list.length
    );

  return list;
}

export function upsertUsuarioStore(
  item = {}
) {
  const normalized =
    normalizeUsuarioModel(
      item
    );

  const key =
    getUsuarioMergeKey(
      normalized
    );

  if (!key) {
    return normalized;
  }

  const current = [
    ...usuariosStore,
  ];

  const index =
    current.findIndex(
      (row) =>
        getUsuarioMergeKey(
          row
        ) === key
    );

  if (index >= 0) {
    current[index] =
      mergeUsuarioModels(
        current[index],
        normalized
      );
  } else {
    current.unshift(
      normalized
    );
  }

  usuariosStore =
    normalizeUsuariosCollection(
      current
    );

  usuariosState.items =
    usuariosStore;

  usuariosState.remoteCount =
    Math.max(
      usuariosState
        .remoteCount,
      usuariosStore.length
    );

  return normalized;
}

export function getUsuarioByIdStore(
  id = ""
) {
  return findUsuarioById(
    usuariosStore,
    id
  );
}

function syncUsuariosCollection({
  items = [],
  remoteCount = null,
  lastSyncAt = Date.now(),
  writeCache = true,
} = {}) {
  const list =
    setItems(
      items,
      {
        remoteCount,
      }
    );

  setRemoteCount(
    remoteCount ===
      null ||
    remoteCount ===
      undefined
      ? list.length
      : remoteCount
  );

  setLastSyncAt(
    lastSyncAt
  );

  setLoaded(true);
  setHydrated(true);
  clearError();

  if (writeCache) {
    writeCachePayload();
  }

  return list;
}

function syncUsuarioDetail(
  detail = null,
  {
    incrementRemote = false,
  } = {}
) {
  if (!detail) {
    return null;
  }

  const normalized =
    normalizeUsuarioModel(
      detail
    );

  const id =
    getUsuarioStableId(
      normalized
    );

  const existed =
    Boolean(
      id &&
      getUsuarioByIdStore(
        id
      )
    );

  upsertUsuarioStore(
    normalized
  );

  if (
    incrementRemote &&
    !existed
  ) {
    setRemoteCount(
      Math.max(
        usuariosStore.length,
        usuariosState
          .remoteCount + 1
      )
    );
  } else {
    setRemoteCount(
      Math.max(
        usuariosStore.length,
        usuariosState
          .remoteCount
      )
    );
  }

  touchLastSyncAt();
  setLoaded(true);
  setHydrated(true);
  clearError();

  writeCachePayload();

  return normalized;
}

/* =========================================================
   CREATE / UPDATE PAYLOADS
========================================================= */

function buildCreateUsuarioBody(
  payload = {}
) {
  const source =
    safeObject(payload);

  const name =
    cleanText(
      first(
        source.name,
        source.displayName,
        source.fullName,
        source.nombre,
        ""
      ),
      ""
    ).slice(
      0,
      140
    );

  const email =
    firstEmail(
      source.email,
      source.emailLower,
      source.mail,
      ""
    ).slice(
      0,
      254
    );

  const phone =
    cleanText(
      first(
        source.phone,
        source.telefono,
        source.mobile,
        ""
      ),
      ""
    ).slice(
      0,
      40
    );

  const tipo =
    normalizeTypeValue(
      first(
        source.tipo,
        source.clienteTipo,
        source.type,
        "particular"
      )
    ) ||
    "particular";

  const nif =
    cleanText(
      first(
        source.nif,
        source.cif,
        source.taxId,
        ""
      ),
      ""
    )
      .toUpperCase()
      .slice(
        0,
        32
      );

  const direccion =
    normalizeDireccion(
      first(
        source.direccion,
        source.address,
        {}
      )
    );

  if (!name) {
    throw createContractError(
      "USUARIO_NAME_REQUIRED",
      "El nombre del usuario es obligatorio."
    );
  }

  if (!email) {
    throw createContractError(
      "USUARIO_EMAIL_REQUIRED",
      "Introduce un email válido."
    );
  }

  if (
    tipo === "empresa" &&
    !nif
  ) {
    throw createContractError(
      "USUARIO_NIF_REQUIRED",
      "El NIF/CIF es obligatorio para usuarios de tipo empresa."
    );
  }

  return {
    name,
    email,
    phone,
    tipo,
    nif,
    direccion,

    privacyMode:
      parseBoolean(
        source.privacyMode,
        false
      ),

    darkMode:
      parseBoolean(
        source.darkMode,
        true
      ),
  };
}

function buildUpdateUsuarioBody(
  payload = {}
) {
  const source =
    safeObject(payload);

  const body = {};

  if (
    hasOwn(source, "name") ||
    hasOwn(source, "displayName") ||
    hasOwn(source, "fullName") ||
    hasOwn(source, "nombre")
  ) {
    const value =
      cleanText(
        first(
          source.name,
          source.displayName,
          source.fullName,
          source.nombre,
          ""
        ),
        ""
      ).slice(
        0,
        140
      );

    if (!value) {
      throw createContractError(
        "USUARIO_NAME_INVALID",
        "El nombre del usuario no puede quedar vacío."
      );
    }

    body.name = value;
  }

  if (
    hasOwn(source, "email") ||
    hasOwn(source, "emailLower") ||
    hasOwn(source, "mail")
  ) {
    const email =
      firstEmail(
        source.email,
        source.emailLower,
        source.mail,
        ""
      ).slice(
        0,
        254
      );

    if (!email) {
      throw createContractError(
        "USUARIO_EMAIL_INVALID",
        "Introduce un email válido."
      );
    }

    body.email = email;
  }

  if (
    hasOwn(source, "username") ||
    hasOwn(source, "userName")
  ) {
    const username =
      cleanText(
        first(
          source.username,
          source.userName,
          ""
        ),
        ""
      ).slice(
        0,
        100
      );

    if (!username) {
      throw createContractError(
        "USUARIO_USERNAME_INVALID",
        "El nombre de usuario no puede quedar vacío."
      );
    }

    body.username =
      username;
  }

  if (
    hasOwn(source, "phone") ||
    hasOwn(source, "telefono") ||
    hasOwn(source, "mobile")
  ) {
    body.phone =
      cleanText(
        first(
          source.phone,
          source.telefono,
          source.mobile,
          ""
        ),
        ""
      ).slice(
        0,
        40
      );
  }

  if (
    hasOwn(source, "nif") ||
    hasOwn(source, "cif") ||
    hasOwn(source, "taxId")
  ) {
    body.nif =
      cleanText(
        first(
          source.nif,
          source.cif,
          source.taxId,
          ""
        ),
        ""
      )
        .toUpperCase()
        .slice(
          0,
          32
        );
  }

  if (
    hasOwn(source, "tipo") ||
    hasOwn(source, "clienteTipo") ||
    hasOwn(source, "type")
  ) {
    const tipo =
      normalizeTypeValue(
        first(
          source.tipo,
          source.clienteTipo,
          source.type,
          ""
        )
      );

    if (
      !ALLOWED_TYPES.has(
        tipo
      )
    ) {
      throw createContractError(
        "USUARIO_TYPE_INVALID",
        "El tipo de usuario debe ser particular o empresa."
      );
    }

    body.tipo = tipo;
  }

  if (
    hasOwn(source, "role") ||
    hasOwn(source, "rol")
  ) {
    const role =
      normalizeKey(
        first(
          source.role,
          source.rol,
          ""
        )
      );

    if (
      !ALLOWED_ROLES.has(
        role
      )
    ) {
      throw createContractError(
        "USUARIO_ROLE_INVALID",
        "El rol debe ser admin o user."
      );
    }

    body.role = role;
  }

  if (
    hasOwn(
      source,
      "active"
    )
  ) {
    body.active =
      parseStrictBoolean(
        source.active,
        "active"
      );
  } else if (
    hasOwn(source, "status") ||
    hasOwn(source, "estado") ||
    hasOwn(source, "state")
  ) {
    const status =
      normalizeKey(
        first(
          source.status,
          source.estado,
          source.state,
          ""
        )
      );

    if (
      ACTIVE_STATUS_VALUES.has(
        status
      )
    ) {
      body.active = true;
    } else if (
      PENDING_STATUS_VALUES.has(
        status
      ) ||
      BLOCKED_STATUS_VALUES.has(
        status
      ) ||
      INACTIVE_STATUS_VALUES.has(
        status
      )
    ) {
      /*
        El backend de update expone active, no un enum status.
        No inventamos un campo que el backend no consume.
      */
      body.active = false;
    } else {
      throw createContractError(
        "USUARIO_STATUS_INVALID",
        "El estado del usuario no es válido."
      );
    }
  }

  for (const key of [
    "emailVerified",
    "privacyMode",
    "darkMode",
  ]) {
    if (hasOwn(source, key)) {
      body[key] =
        parseStrictBoolean(
          source[key],
          key
        );
    }
  }

  if (
    hasOwn(
      source,
      "twofa_enabled"
    ) ||
    hasOwn(
      source,
      "twofaEnabled"
    )
  ) {
    body.twofa_enabled =
      parseStrictBoolean(
        first(
          source.twofa_enabled,
          source.twofaEnabled
        ),
        "twofa_enabled"
      );
  }

  if (
    hasOwn(source, "direccion") ||
    hasOwn(source, "address")
  ) {
    body.direccion =
      normalizeDireccion(
        first(
          source.direccion,
          source.address,
          {}
        )
      );
  }

  if (
    hasOwn(
      source,
      "permissions"
    )
  ) {
    body.permissions =
      normalizePermissions(
        source.permissions
      );
  }

  if (
    hasOwn(
      source,
      "slug"
    )
  ) {
    body.slug =
      cleanText(
        source.slug,
        ""
      ).slice(
        0,
        100
      );
  }

  if (
    hasOwn(
      source,
      "deactivationReason"
    )
  ) {
    body.deactivationReason =
      cleanText(
        source.deactivationReason,
        ""
      ).slice(
        0,
        500
      );
  }

  if (
    !Object.keys(body).length
  ) {
    throw createContractError(
      "USUARIO_UPDATE_EMPTY",
      "No hay cambios válidos para actualizar."
    );
  }

  return body;
}

/* =========================================================
   RAW REQUESTS
========================================================= */

async function fetchUsuariosPageRequest(
  options = {}
) {
  return httpRequest(
    "GET",
    USUARIOS_ENDPOINT,
    null,
    {
      timeout:
        number(
          options.timeout,
          USUARIOS_LIST_TIMEOUT
        ),

      query:
        buildUsuariosListQuery(
          options
        ),

      source:
        "views.usuarios.api.list.page",

      signal:
        options.signal,
    }
  );
}

export async function fetchUsuariosRequest(
  options = {}
) {
  const all =
    options.all !== false;

  if (!all) {
    const response =
      await fetchUsuariosPageRequest(
        options
      );

    if (
      safeObject(response)?.ok ===
      false
    ) {
      throw createResponseError(
        response,
        {
          fallbackCode:
            "USUARIOS_LIST_REJECTED",

          fallbackMessage:
            "El backend rechazó el listado de usuarios.",
        }
      );
    }

    const items =
      normalizeUsuariosCollection(
        pickItems(response)
      );

    const total =
      Math.max(
        items.length,
        pickTotal(
          response,
          items.length
        )
      );

    const continuationToken =
      pickContinuationToken(
        response
      );

    return {
      ...safeObject(response),

      items,
      users: items,
      usuarios: items,
      rows: items,
      results: items,

      total,
      totalCount: total,
      remoteCount: total,

      returned:
        items.length,

      hasMore:
        pickHasMore(
          response
        ),

      continuationToken:
        continuationToken ||
        null,

      nextContinuationToken:
        continuationToken ||
        null,
    };
  }

  const pages = [];
  const seenTokens =
    new Set();

  let continuationToken =
    cleanText(
      first(
        options.ct,
        options.continuationToken,
        options.nextToken,
        ""
      ),
      ""
    );

  let page = 0;

  const maxPages =
    clamp(
      options.maxPages ||
      USUARIOS_MAX_PAGES,
      1,
      USUARIOS_MAX_PAGES
    );

  do {
    if (continuationToken) {
      if (
        seenTokens.has(
          continuationToken
        )
      ) {
        break;
      }

      seenTokens.add(
        continuationToken
      );
    }

    page += 1;

    const response =
      await fetchUsuariosPageRequest({
        ...options,

        ct:
          continuationToken,

        includeTotal:
          page === 1
            ? options.includeTotal !==
              false
            : false,
      });

    if (
      safeObject(response)?.ok ===
      false
    ) {
      throw createResponseError(
        response,
        {
          fallbackCode:
            "USUARIOS_LIST_REJECTED",

          fallbackMessage:
            "El backend rechazó el listado de usuarios.",
        }
      );
    }

    pages.push(response);

    const nextToken =
      pickContinuationToken(
        response
      );

    const hasMore =
      pickHasMore(
        response
      );

    if (
      !hasMore ||
      !nextToken ||
      nextToken ===
        continuationToken
    ) {
      break;
    }

    continuationToken =
      nextToken;
  } while (
    page < maxPages
  );

  return mergeListResponses(
    pages
  );
}

export async function getUsuarioByIdRequest(
  id = "",
  options = {}
) {
  const userId =
    normalizeUsuarioId(id);

  const key =
    `detail:${userId.toLowerCase()}`;

  if (
    options.dedupe !== false &&
    detailInflight.has(key)
  ) {
    return detailInflight.get(
      key
    );
  }

  const task =
    (async () => {
      const response =
        await httpRequest(
          "GET",
          getUsuarioEndpoint(
            userId
          ),
          null,
          {
            timeout:
              number(
                options.timeout,
                USUARIOS_DETAIL_TIMEOUT
              ),

            source:
              "views.usuarios.api.detail",

            signal:
              options.signal,
          }
        );

      if (
        safeObject(response)?.ok ===
        false
      ) {
        throw createResponseError(
          response,
          {
            fallbackCode:
              "USUARIO_DETAIL_REJECTED",

            fallbackMessage:
              "El backend rechazó el detalle del usuario.",
          }
        );
      }

      const detail =
        normalizeDetailResponse(
          response
        );

      if (
        !detail ||
        !getUsuarioStableId(
          detail
        )
      ) {
        throw createContractError(
          "USUARIO_DETAIL_INVALID_RESPONSE",
          "El backend no devolvió un usuario válido.",
          502
        );
      }

      return detail;
    })();

  detailInflight.set(
    key,
    task
  );

  try {
    return await task;
  } finally {
    if (
      detailInflight.get(key) ===
      task
    ) {
      detailInflight.delete(
        key
      );
    }
  }
}

export async function createUsuarioRequest(
  payload = {},
  options = {}
) {
  const body =
    buildCreateUsuarioBody(
      payload
    );

  const response =
    await httpRequest(
      "POST",
      USUARIOS_CREATE_ENDPOINT,
      body,
      {
        timeout:
          number(
            options.timeout,
            USUARIOS_CREATE_TIMEOUT
          ),

        source:
          "views.usuarios.api.create",

        signal:
          options.signal,
      }
    );

  if (
    safeObject(response)?.ok ===
      false ||
    safeObject(response)?.success ===
      false
  ) {
    throw createResponseError(
      response,
      {
        fallbackCode:
          "USUARIO_CREATE_REJECTED",

        fallbackMessage:
          "El backend rechazó la creación del usuario.",
      }
    );
  }

  const detail =
    normalizeCreateDetailResponse(
      response
    );

  if (
    !detail ||
    !getUsuarioStableId(
      detail
    )
  ) {
    throw createContractError(
      "USUARIO_CREATE_INVALID_RESPONSE",
      "El backend no devolvió el usuario creado.",
      502
    );
  }

  /*
    Nunca devolvemos el envelope superior:
    contiene activationUrl en el backend actual.
  */
  return detail;
}

export async function updateUsuarioRequest(
  id = "",
  payload = {},
  options = {}
) {
  const userId =
    normalizeUsuarioId(id);

  const body =
    buildUpdateUsuarioBody(
      payload
    );

  const method =
    cleanText(
      options.method,
      "PATCH"
    ).toUpperCase();

  if (
    !ALLOWED_UPDATE_METHODS.has(
      method
    )
  ) {
    throw createContractError(
      "USUARIO_UPDATE_METHOD_INVALID",
      "Usuarios sólo permite PUT o PATCH para actualizar.",
      400
    );
  }

  const response =
    await httpRequest(
      method,
      getUsuarioEndpoint(
        userId
      ),
      body,
      {
        timeout:
          number(
            options.timeout,
            USUARIOS_UPDATE_TIMEOUT
          ),

        source:
          `views.usuarios.api.update.${method.toLowerCase()}`,

        signal:
          options.signal,
      }
    );

  if (
    safeObject(response)?.ok ===
    false
  ) {
    throw createResponseError(
      response,
      {
        fallbackCode:
          "USUARIO_UPDATE_REJECTED",

        fallbackMessage:
          "El backend rechazó la actualización del usuario.",
      }
    );
  }

  const detail =
    normalizeDetailResponse(
      response
    );

  if (
    !detail ||
    !getUsuarioStableId(
      detail
    )
  ) {
    throw createContractError(
      "USUARIO_UPDATE_INVALID_RESPONSE",
      "El backend no devolvió el usuario actualizado.",
      502
    );
  }

  return detail;
}

export async function deleteUsuarioRequest(
  id = "",
  options = {}
) {
  void options;

  normalizeUsuarioId(id);

  throw createContractError(
    "USUARIOS_DELETE_NOT_SUPPORTED",
    "DELETE /api/users/:id no forma parte del contrato productivo actual.",
    405
  );
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache({
  freshOnly = true,
} = {}) {
  hydrateStateFromCache({
    freshOnly,
  });

  return [
    ...usuariosState.items,
  ];
}

export const hydrateUsuariosFromCache =
  hydrateFromCache;

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadUsuarios({
  force = false,
  silent = false,
  filters = {},
  timeout = USUARIOS_LIST_TIMEOUT,
  signal = undefined,
} = {}) {
  hydrateStateFromCache({
    freshOnly: true,
  });

  const existingInflight =
    getInflightLoad();

  if (
    existingInflight &&
    !force
  ) {
    return existingInflight;
  }

  const loadToken =
    ++lastLoadToken;

  const hadItems =
    usuariosState.items.length >
    0;

  if (!silent) {
    setLoading(!hadItems);
    setRefreshing(hadItems);
  }

  clearError();
  lastError = null;

  let task = null;

  task =
    fetchUsuariosRequest({
      all: true,

      limit:
        USUARIOS_FETCH_LIMIT,

      includeTotal:
        true,

      sortBy:
        USUARIOS_DEFAULT_SORT_BY,

      sortDir:
        USUARIOS_DEFAULT_SORT_DIR,

      timeout,
      signal,

      ...safeObject(
        filters
      ),
    })
      .then(
        (response) => {
          if (
            loadToken !==
            lastLoadToken
          ) {
            return [
              ...usuariosState.items,
            ];
          }

          const items =
            normalizeUsuariosCollection(
              pickItems(
                response
              )
            );

          const remoteCount =
            Math.max(
              items.length,
              pickTotal(
                response,
                items.length
              )
            );

          lastLoadedAt =
            Date.now();

          const continuationToken =
            pickContinuationToken(
              response
            );

          lastResponseMeta = {
            total:
              remoteCount,

            returned:
              items.length,

            pages:
              number(
                response
                  ?.pagination
                  ?.pages,
                1
              ),

            hasMore:
              pickHasMore(
                response
              ),

            continuationTokenPresent:
              Boolean(
                continuationToken
              ),
          };

          return syncUsuariosCollection({
            items,
            remoteCount,
            lastSyncAt:
              lastLoadedAt,
            writeCache:
              true,
          });
        }
      )
      .catch(
        (error) => {
          lastError =
            error;

          if (
            loadToken ===
            lastLoadToken
          ) {
            setError(
              safeError(
                error,
                "No se pudieron cargar los usuarios."
              )
            );
          }

          throw error;
        }
      )
      .finally(
        () => {
          if (
            loadToken ===
            lastLoadToken
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

export const listUsuarios =
  loadUsuarios;

/* =========================================================
   DETAIL
========================================================= */

export async function loadUsuarioDetail(
  userId = "",
  options = {}
) {
  const id =
    normalizeUsuarioId(
      userId
    );

  const cached =
    getUsuarioByIdStore(id) ||
    findUsuarioById(
      usuariosState.items,
      id
    );

  if (
    options.cacheOnly ===
    true
  ) {
    return (
      cached ||
      null
    );
  }

  if (
    cached &&
    options.force !== true
  ) {
    return cached;
  }

  try {
    const detail =
      await getUsuarioByIdRequest(
        id,
        options
      );

    return syncUsuarioDetail(
      detail
    );
  } catch (error) {
    if (
      cached &&
      options.allowCacheFallback !==
        false
    ) {
      return cached;
    }

    throw error;
  }
}

export const getUsuarioById =
  loadUsuarioDetail;

/* =========================================================
   CREATE / UPDATE / DELETE
========================================================= */

export async function createUsuario(
  payload = {},
  options = {}
) {
  const detail =
    await createUsuarioRequest(
      payload,
      options
    );

  return syncUsuarioDetail(
    detail,
    {
      incrementRemote:
        true,
    }
  );
}

export async function updateUsuario(
  id = "",
  payload = {},
  options = {}
) {
  const detail =
    await updateUsuarioRequest(
      id,
      payload,
      options
    );

  return syncUsuarioDetail(
    detail
  );
}

export async function deleteUsuario(
  id = "",
  options = {}
) {
  return deleteUsuarioRequest(
    id,
    options
  );
}

/* =========================================================
   STATS
========================================================= */

export async function fetchUsuariosStatsRequest(
  options = {}
) {
  const response =
    await httpRequest(
      "GET",
      USUARIOS_STATS_ENDPOINT,
      null,
      {
        timeout:
          number(
            options.timeout,
            USUARIOS_TIMEOUT
          ),

        source:
          "views.usuarios.api.stats",

        signal:
          options.signal,
      }
    );

  if (
    safeObject(response)?.ok ===
    false
  ) {
    throw createResponseError(
      response,
      {
        fallbackCode:
          "USUARIOS_STATS_REJECTED",

        fallbackMessage:
          "El backend rechazó las estadísticas de usuarios.",
      }
    );
  }

  const source =
    safeObject(response);

  const total =
    Math.max(
      0,
      number(
        first(
          source.total,
          source.totalCount,
          source.remoteCount,
          source.count,
          0
        ),
        0
      )
    );

  return {
    ok:
      source.ok !==
      false,

    total,
    count: total,
    totalCount: total,
    remoteCount: total,

    scope:
      cleanText(
        source.scope,
        "users"
      ),

    timestamp:
      first(
        source.timestamp,
        null
      ),
  };
}

/* =========================================================
   STORE SNAPSHOTS / UTILITIES
========================================================= */

export function unwrapUsuariosPayload(
  payload = null
) {
  return pickItems(
    payload
  );
}

export function getUsuariosStateSnapshot() {
  return {
    ...usuariosState,

    items: [
      ...usuariosState.items,
    ],

    inflightLoad:
      Boolean(
        usuariosState.inflightLoad
      ),

    lastError:
      lastError
        ? safeError(
            lastError
          )
        : "",
  };
}

export function getUsuariosStoreSnapshot() {
  return {
    items: [
      ...usuariosStore,
    ],

    count:
      usuariosStore.length,

    remoteCount:
      Math.max(
        usuariosState
          .remoteCount,
        usuariosStore.length
      ),

    lastSyncAt:
      usuariosState
        .lastSyncAt ||
      0,
  };
}

export function getUsuariosCount() {
  return usuariosStore.length;
}

export function hasUsuarios() {
  return (
    getUsuariosCount() >
    0
  );
}

export function getSortedUsuariosStore() {
  return normalizeUsuariosCollection(
    usuariosStore
  );
}

export function paginateUsuarios(
  items = [],
  {
    page = 1,
    pageSize = 20,
  } = {}
) {
  const rows =
    safeArray(items);

  const size =
    clamp(
      pageSize,
      1,
      500
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        rows.length /
        size
      )
    );

  const currentPage =
    clamp(
      page,
      1,
      totalPages
    );

  const start =
    (currentPage - 1) *
    size;

  return {
    items:
      rows.slice(
        start,
        start + size
      ),

    page:
      currentPage,

    currentPage,

    pageSize:
      size,

    total:
      rows.length,

    totalCount:
      rows.length,

    totalPages,

    hasPrev:
      currentPage > 1,

    hasNext:
      currentPage <
      totalPages,
  };
}

export function computeUsuariosStats(
  items = []
) {
  return safeArray(items)
    .reduce(
      (acc, item) => {
        const current =
          normalizeUsuarioModel(
            item
          );

        acc.total += 1;

        const bucket =
          statusBucket(
            current
          );

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
          toTimestamp(
            first(
              current.lastLoginAt,
              current.lastAccessAt,
              null
            )
          )
        ) {
          acc.withAccessCount += 1;
        }

        return acc;
      },
      {
        total: 0,
        activeCount: 0,
        pendingCount: 0,
        blockedCount: 0,
        withAccessCount: 0,
      }
    );
}

/* =========================================================
   SNAPSHOT / DEBUG CONTRACT
========================================================= */

export function getUsuariosApiSnapshot() {
  return {
    version:
      USUARIOS_API_VERSION,

    endpoint:
      USUARIOS_ENDPOINT,

    createEndpoint:
      USUARIOS_CREATE_ENDPOINT,

    statsEndpoint:
      USUARIOS_STATS_ENDPOINT,

    cacheKey:
      USUARIOS_CACHE_KEY,

    cacheSchema:
      CACHE_SCHEMA_VERSION,

    loading:
      usuariosState.loading,

    refreshing:
      usuariosState.refreshing,

    loaded:
      usuariosState.loaded,

    hydrated:
      usuariosState.hydrated,

    items:
      usuariosStore.length,

    remoteCount:
      usuariosState.remoteCount,

    lastLoadedAt,

    lastResponseMeta:
      lastResponseMeta
        ? {
            ...lastResponseMeta,
          }
        : null,

    lastError:
      lastError
        ? safeError(
            lastError
          )
        : "",

    inflightDetailCount:
      detailInflight.size,

    backendContract: {
      list:
        "GET /api/users",

      detail:
        "GET /api/users/:id",

      create:
        "POST /api/users/create",

      update:
        "PUT|PATCH /api/users/:id",

      delete:
        false,

      stats:
        "GET /api/users/stats",

      pagination:
        "continuation-token",

      createState:
        "pending_activation",
    },

    policy: {
      httpSingle:
        true,

      continuationToken:
        true,

      continuationTokenHiddenFromSnapshot:
        true,

      raceProtected:
        true,

      cacheFallback:
        true,

      cacheSchemaVersioned:
        true,

      cacheRawRemoved:
        true,

      cacheTransientBlobUrlRemoved:
        true,

      cacheSasRemoved:
        true,

      createPayloadWhitelisted:
        true,

      updatePayloadWhitelisted:
        true,

      updateBooleanStrict:
        true,

      putPatchExplicit:
        true,

      noMethodMasquerading:
        true,

      deleteUnsupported:
        true,

      activationUrlNotReturned:
        true,

      activationUrlNotPersisted:
        true,

      sensitiveRawSanitized:
        true,

      pendingLifecycleAware:
        true,

      roles: [
        "admin",
        "user",
      ],

      types: [
        "empresa",
        "particular",
      ],
    },
  };
}

/* =========================================================
   CLEAR
========================================================= */

export function clearUsuariosCache() {
  lastLoadToken += 1;

  usuariosState.items = [];
  usuariosState.remoteCount = 0;
  usuariosState.loading = false;
  usuariosState.refreshing = false;
  usuariosState.loaded = false;
  usuariosState.hydrated = false;
  usuariosState.error = "";
  usuariosState.lastSyncAt = 0;
  usuariosState.inflightLoad = null;

  usuariosStore = [];

  lastError = null;
  lastLoadedAt = 0;
  lastResponseMeta = null;

  detailInflight.clear();

  removeCachePayload();

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default Object.freeze({
  version:
    USUARIOS_API_VERSION,

  endpoint:
    USUARIOS_ENDPOINT,

  createEndpoint:
    USUARIOS_CREATE_ENDPOINT,

  statsEndpoint:
    USUARIOS_STATS_ENDPOINT,

  fetchUsuariosRequest,
  getUsuarioByIdRequest,
  createUsuarioRequest,
  updateUsuarioRequest,
  deleteUsuarioRequest,
  fetchUsuariosStatsRequest,

  hydrateFromCache,
  hydrateUsuariosFromCache,

  loadUsuarios,
  listUsuarios,

  loadUsuarioDetail,
  getUsuarioById,

  createUsuario,
  updateUsuario,
  deleteUsuario,

  getUsuariosApiSnapshot,
  getUsuariosStateSnapshot,
  getUsuariosStoreSnapshot,

  getUsuarios,
  replaceUsuariosStore,
  upsertUsuarioStore,
  getSortedUsuariosStore,
  getUsuarioByIdStore,
  getUsuariosCount,
  hasUsuarios,

  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,

  paginateUsuarios,
  computeUsuariosStats,
  clearUsuariosCache,

  unwrapUsuariosPayload,

  buildUsuariosListQuery,
  normalizeUsuarioId,
  getUsuariosEndpoint,
  getUsuarioEndpoint,
});

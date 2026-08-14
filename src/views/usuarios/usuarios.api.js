/* =========================================================
   Onion Support - Usuarios API
   Archivo: /src/views/usuarios/usuarios.api.js

   PRODUCTIVO · BACKEND CONTRACT REAL · HTTP ÚNICO · V3

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
   - Conservar la paginación real por continuation token.
   - Normalizar listado, detalle, creación y actualización.
   - Whitelist estricta para create/update.
   - No convertir PUT en PATCH ni PATCH en POST.
   - No intentar DELETE inexistente.
   - No persistir activationUrl/tokens/secretos en cache.
   - Sin DOM, Router, Toast ni listeners.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const USUARIOS_API_VERSION =
  "usuarios.api.backend-contract.v3";

export const USUARIOS_ENDPOINT = "/api/users";
export const USUARIOS_CREATE_ENDPOINT = "/api/users/create";
export const USUARIOS_STATS_ENDPOINT = "/api/users/stats";

export const USUARIOS_CACHE_KEY = "onion.support.usuarios.cache.v3";
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

const ALLOWED_ROLES = new Set(["admin", "user"]);
const ALLOWED_TYPES = new Set(["empresa", "particular"]);

let lastLoadToken = 0;
let lastError = null;
let lastLoadedAt = 0;
let lastResponseMeta = null;

const detailInflight = new Map();

const usuariosState = {
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
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(number(value, min), min), max);
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

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = normalizeKey(value);

  if (["true", "1", "yes", "si", "on", "active", "activo"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off", "inactive", "inactivo", "disabled"].includes(normalized)) {
    return false;
  }

  return fallback;
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

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function safeError(error = null, fallback = "Error de API de usuarios.") {
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

function createContractError(
  code = "USUARIOS_CONTRACT_ERROR",
  message = code,
  status = 400
) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function hasOwn(source = {}, key = "") {
  return isObject(source) &&
    Object.prototype.hasOwnProperty.call(source, key);
}

function safeUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";

  if (
    /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
      raw
    )
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9_999_999_999 ? value : value * 1000;
  }

  const raw = cleanText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9_999_999_999 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* =========================================================
   SAFE RAW
   Nunca conservar secretos devueltos accidentalmente o
   heredados de cache antigua.
========================================================= */

const SENSITIVE_RAW_KEYS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "activation",
  "activationUrl",
  "activateUrl",
  "reset",
  "resetUrl",
  "token",
  "tokenHash",
  "tokenVersion",
  "accessToken",
  "refreshToken",
  "idToken",
  "jwt",
  "secret",
  "twofa_secret",
  "twoFactorSecret",
  "otp",
  "emailChange",
  "phoneChange",
  "authorization",
  "cookie",
]);

function sanitizeRawValue(value, depth = 0) {
  if (depth > 5) return null;

  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((item) => sanitizeRawValue(item, depth + 1));
  }

  if (!isObject(value)) return value;

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_RAW_KEYS.has(key)) continue;

    if (
      /(password|token|secret|authorization|cookie|activationurl|reseturl|signature|sas)$/i.test(
        key
      )
    ) {
      continue;
    }

    output[key] = sanitizeRawValue(item, depth + 1);
  }

  return output;
}

function sanitizeRawUsuario(value = {}) {
  return safeObject(sanitizeRawValue(safeObject(value)), {});
}

/* =========================================================
   MODEL
========================================================= */

function normalizeRoleValue(value = "") {
  const role = normalizeKey(value || "user");

  if (role === "admin") return "admin";
  return "user";
}

function normalizeTypeValue(value = "") {
  const type = normalizeKey(value);

  if (["empresa", "company", "business", "b2b"].includes(type)) {
    return "empresa";
  }

  if (["particular", "persona", "individual", "b2c"].includes(type)) {
    return "particular";
  }

  return "";
}

function normalizeStatusValue(value = "", source = {}) {
  const explicit = normalizeKey(
    first(value, source.status, source.estado, source.state, "")
  );

  if (
    [
      "pending",
      "pendiente",
      "invited",
      "invitado",
      "invite",
      "new",
      "unverified",
    ].includes(explicit)
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "suspended",
      "locked",
      "restricted",
    ].includes(explicit)
  ) {
    return "blocked";
  }

  if (
    [
      "disabled",
      "inactive",
      "inactivo",
      "archived",
      "deleted",
    ].includes(explicit)
  ) {
    return "inactive";
  }

  if (
    source.active === false ||
    source.isActive === false ||
    source.enabled === false ||
    source.disabled === true
  ) {
    /*
      Usuarios recién creados por /api/users/create nacen inactive
      hasta completar activación.
    */
    if (
      source.emailVerified === false &&
      !source.activatedAt &&
      source.createdAt
    ) {
      return "pending";
    }

    return "inactive";
  }

  if (source.blocked === true) return "blocked";

  return "active";
}

function normalizeDireccion(value = {}) {
  const source = safeObject(value);

  return {
    calle: cleanText(
      first(source.calle, source.street, source.line1, ""),
      ""
    ).slice(0, 150),
    cp: cleanText(
      first(source.cp, source.postalCode, source.zip, ""),
      ""
    ).slice(0, 20),
    ciudad: cleanText(
      first(source.ciudad, source.city, ""),
      ""
    ).slice(0, 100),
    provincia: cleanText(
      first(source.provincia, source.province, source.region, ""),
      ""
    ).slice(0, 100),
    pais: cleanText(
      first(source.pais, source.country, ""),
      ""
    ).slice(0, 100),
  };
}

function normalizeUsuarioModel(item = {}) {
  const original = safeObject(item);
  const raw = sanitizeRawUsuario(original);

  const profile = safeObject(
    first(raw.profile, raw.usuario, raw.user, {})
  );

  const direccion = normalizeDireccion(
    first(
      raw.direccion,
      raw.address,
      raw.location,
      profile.direccion,
      profile.address,
      {}
    )
  );

  const userId = cleanText(
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

  const firstName = cleanText(
    first(raw.firstName, profile.firstName, ""),
    ""
  );

  const lastName = cleanText(
    first(raw.lastName, raw.apellidos, profile.lastName, profile.apellidos, ""),
    ""
  );

  const composedName = cleanText(
    [firstName, lastName].filter(Boolean).join(" "),
    ""
  );

  const name = cleanText(
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
  );

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.mail,
    raw.userEmail,
    profile.email,
    profile.emailLower
  );

  const username = cleanText(
    first(
      raw.username,
      raw.userName,
      raw.usernameLower,
      profile.username,
      profile.userName,
      ""
    ),
    ""
  );

  const role = normalizeRoleValue(
    first(raw.role, raw.rol, profile.role, profile.rol, "user")
  );

  const status = normalizeStatusValue(
    first(raw.status, raw.estado, raw.state, ""),
    raw
  );

  const phone = cleanText(
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
  );

  const tipo =
    normalizeTypeValue(
      first(raw.tipo, raw.clienteTipo, profile.tipo, "")
    ) || cleanText(first(raw.tipo, profile.tipo, ""), "");

  const nif = cleanText(
    first(raw.nif, raw.cif, raw.taxId, ""),
    ""
  ).toUpperCase();

  const avatar = safeUrl(
    first(
      raw.avatarUrl,
      raw.avatar,
      raw.photoUrl,
      raw.picture,
      profile.avatarUrl,
      profile.avatar,
      ""
    )
  );

  const createdAt = first(
    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    raw.registeredAt,
    null
  );

  const updatedAt = first(
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastActivityAt,
    createdAt,
    null
  );

  const lastLoginAt = first(
    raw.lastLoginAt,
    raw.last_login_at,
    raw.lastAccessAt,
    raw.ultimoAcceso,
    null
  );

  const active =
    raw.active === true ||
    raw.isActive === true ||
    raw.enabled === true ||
    status === "active";

  const security = safeObject(raw.security);

  return {
    ...raw,
    raw,

    id: userId,
    userId,
    usuarioId: userId,
    uid: cleanText(first(raw.uid, userId), userId),
    code: cleanText(
      first(raw.code, raw.username, userId, email),
      userId || email
    ),

    clienteId: cleanText(
      first(raw.clienteId, raw.clientId, ""),
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
    usernameLower: username.toLowerCase(),
    slug: cleanText(first(raw.slug, username), username),

    role,
    rol: role,

    tipo,
    nif,

    status,
    estado: status,
    state: status,

    active,
    isActive: active,
    enabled: active,
    blocked: status === "blocked",

    phone,
    telefono: phone,
    mobile: cleanText(first(raw.mobile, raw.movil, phone), phone),

    direccion,
    address: {
      ...direccion,
      city: direccion.ciudad,
      ciudad: direccion.ciudad,
    },
    location: {
      city: direccion.ciudad,
      ciudad: direccion.ciudad,
    },
    city: direccion.ciudad,
    ciudad: direccion.ciudad,

    avatar,
    avatarUrl: avatar,
    photoUrl: avatar,
    picture: avatar,
    hasAvatar: Boolean(avatar),

    emailVerified: raw.emailVerified === true,
    privacyMode: raw.privacyMode === true,
    darkMode: raw.darkMode === true,

    permissions: safeArray(raw.permissions)
      .map((value) => cleanText(value, ""))
      .filter(Boolean),

    security: {
      ...security,
      twofaEnabled: Boolean(
        first(
          security.twofaEnabled,
          raw.twofa_enabled,
          false
        )
      ),
      lastPasswordChangeAt: first(
        security.lastPasswordChangeAt,
        raw.lastPasswordChangeAt,
        null
      ),
    },

    createdAt,
    updatedAt,
    lastLoginAt,
    lastAccessAt: first(raw.lastAccessAt, lastLoginAt, null),
    lastActivityAt: first(
      raw.lastActivityAt,
      updatedAt,
      lastLoginAt,
      createdAt,
      null
    ),

    activatedAt: first(raw.activatedAt, null),
    deactivatedAt: first(raw.deactivatedAt, null),
    deactivationReason: cleanText(
      first(raw.deactivationReason, ""),
      ""
    ),

    meta: {
      ...safeObject(raw.meta),
      frontendReady: true,
      timestampMs: toTimestamp(
        first(updatedAt, lastLoginAt, createdAt)
      ),
    },
  };
}

function getUsuarioStableId(item = {}) {
  const source = safeObject(item);

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

function dedupeUsuarios(items = []) {
  const map = new Map();
  let anonymousIndex = 0;

  for (const value of safeArray(items)) {
    if (!isObject(value)) continue;

    const normalized = normalizeUsuarioModel(value);
    const id =
      getUsuarioStableId(normalized) ||
      `anonymous:${anonymousIndex++}`;

    if (map.has(id)) {
      const previous = map.get(id);

      map.set(
        id,
        normalizeUsuarioModel({
          ...previous,
          ...normalized,
          raw: {
            ...safeObject(previous?.raw),
            ...safeObject(normalized?.raw),
          },
        })
      );

      continue;
    }

    map.set(id, normalized);
  }

  return [...map.values()].sort((a, b) => {
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

    if (diff !== 0) return diff;

    return getUsuarioStableId(a).localeCompare(
      getUsuarioStableId(b),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  });
}

function normalizeUsuariosCollection(items = []) {
  return dedupeUsuarios(items);
}

function findUsuarioById(items = [], id = "") {
  const target = cleanText(id, "").toLowerCase();
  if (!target) return null;

  return (
    safeArray(items).find((item) => {
      const normalized = normalizeUsuarioModel(item);

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
          cleanText(candidate, "").toLowerCase() === target
      );
    }) || null
  );
}

function statusBucket(item = {}) {
  const current = normalizeUsuarioModel(item);

  if (current.status === "pending") return "pending";

  if (
    current.status === "blocked" ||
    current.status === "inactive"
  ) {
    return "blocked";
  }

  return "active";
}

/* =========================================================
   ENDPOINTS / QUERY
========================================================= */

export function normalizeUsuarioId(id = "") {
  const value = cleanText(id, "");

  if (!value) {
    throw createContractError(
      "USUARIO_ID_REQUIRED",
      "Falta el identificador del usuario."
    );
  }

  return value;
}

export function getUsuariosEndpoint() {
  return USUARIOS_ENDPOINT;
}

export function getUsuarioEndpoint(id = "") {
  return `${USUARIOS_ENDPOINT}/${encodeURIComponent(
    normalizeUsuarioId(id)
  )}`;
}

function cleanQueryValue(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const text = cleanText(value, "");
  return text || undefined;
}

export function buildUsuariosListQuery({
  limit = USUARIOS_FETCH_LIMIT,
  ct = "",
  continuationToken = "",
  includeTotal = true,
  sortBy = USUARIOS_DEFAULT_SORT_BY,
  sortDir = USUARIOS_DEFAULT_SORT_DIR,
  role = "",
  rol = "",
  tipo = "",
  type = "",
  active,
  enabled,
  emailVerified,
  hasAvatar,
  has2fa,
  search = "",
  q = "",
  filters = {},
} = {}) {
  const query = {
    limit: clamp(limit, 1, USUARIOS_MAX_LIMIT),
    includeTotal: Boolean(includeTotal),
    sortBy: cleanText(
      sortBy,
      USUARIOS_DEFAULT_SORT_BY
    ),
    sortDir: cleanText(
      sortDir,
      USUARIOS_DEFAULT_SORT_DIR
    ).toUpperCase(),
  };

  const token = cleanText(
    first(ct, continuationToken, ""),
    ""
  );

  const finalRole = cleanText(first(role, rol, ""), "");
  const finalType = cleanText(first(tipo, type, ""), "");
  const finalSearch = cleanText(first(search, q, ""), "");
  const finalActive =
    active !== undefined ? active : enabled;

  if (token) query.ct = token;
  if (finalRole) query.role = finalRole;
  if (finalType) query.tipo = finalType;

  if (finalSearch) {
    query.search = finalSearch;
    query.q = finalSearch;
  }

  if (finalActive !== undefined) {
    query.active = parseBoolean(finalActive, true);
  }

  if (emailVerified !== undefined) {
    query.emailVerified = parseBoolean(
      emailVerified,
      false
    );
  }

  if (hasAvatar !== undefined) {
    query.hasAvatar = parseBoolean(hasAvatar, false);
  }

  if (has2fa !== undefined) {
    query.has2fa = parseBoolean(has2fa, false);
  }

  for (const [key, value] of Object.entries(
    safeObject(filters)
  )) {
    const cleanKey = cleanText(key, "");
    const cleanValue = cleanQueryValue(value);

    if (!cleanKey || cleanValue === undefined) continue;

    query[cleanKey] = cleanValue;
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
  const verb = cleanText(method, "GET").toUpperCase();
  const path = cleanText(endpoint, "");

  if (!path) {
    throw createContractError(
      "USUARIOS_ENDPOINT_REQUIRED",
      "Falta el endpoint de Usuarios.",
      500
    );
  }

  const timeout = number(options.timeout, USUARIOS_TIMEOUT);
  const query = safeObject(
    options.query || options.params
  );

  const headers = safeObject(options.headers);
  const source = cleanText(
    options.source,
    "views.usuarios.api"
  );

  if (verb === "GET" && isFunction(Http?.get)) {
    return Http.get(path, {
      timeout,
      query,
      headers,
      source,
    });
  }

  if (verb === "POST" && isFunction(Http?.post)) {
    return Http.post(path, body, {
      timeout,
      query,
      headers,
      source,
    });
  }

  if (verb === "PUT" && isFunction(Http?.put)) {
    return Http.put(path, body, {
      timeout,
      query,
      headers,
      source,
    });
  }

  if (verb === "PATCH" && isFunction(Http?.patch)) {
    return Http.patch(path, body, {
      timeout,
      query,
      headers,
      source,
    });
  }

  if (isFunction(Http?.request)) {
    return Http.request(path, {
      method: verb,
      body,
      data: body,
      timeout,
      query,
      headers,
      source,
    });
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

function envelopeObjects(payload = null, maxDepth = 7) {
  const output = [];
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, depth } = queue.shift();

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
      if (isObject(value[key])) {
        queue.push({
          value: value[key],
          depth: depth + 1,
        });
      }
    }
  }

  return output;
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
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
      if (Array.isArray(source[key])) {
        return source[key];
      }
    }
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  for (const source of envelopeObjects(payload)) {
    for (const value of [
      source.total,
      source.totalCount,
      source.remoteCount,
      source.count,
      source.pagination?.total,
      source.pagination?.totalCount,
    ]) {
      const parsed = Number(value);

      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }

  return Math.max(0, number(fallback, 0));
}

function pickContinuationToken(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const token = cleanText(
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

    if (token) return token;
  }

  return "";
}

function pickHasMore(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const value = first(
      source.hasMore,
      source.more,
      source.pagination?.hasMore
    );

    if (value === true || value === false) return value;

    if (typeof value === "string") {
      return parseBoolean(value, false);
    }
  }

  return Boolean(pickContinuationToken(payload));
}

function looksLikeUsuario(value = null) {
  const item = safeObject(value, null);
  if (!item) return false;

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
  IMPORTANTE:
  En create el backend devuelve:
  {
    ok,
    userId,
    activationUrl,
    user: { ...safe user... },
    data: ...
  }

  Hay que preferir SIEMPRE user/usuario antes del envelope
  superior para no convertir activationUrl en parte del usuario.
*/
function pickDetail(payload = null) {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return (
      payload.find(looksLikeUsuario) ||
      payload[0] ||
      null
    );
  }

  for (const source of envelopeObjects(payload)) {
    for (const key of [
      "user",
      "usuario",
      "item",
      "detail",
      "record",
    ]) {
      if (looksLikeUsuario(source[key])) {
        return source[key];
      }
    }
  }

  if (looksLikeUsuario(payload)) return payload;

  return null;
}

function normalizeDetailResponse(payload = null) {
  const detail = pickDetail(payload);
  return detail ? normalizeUsuarioModel(detail) : null;
}

function mergeListResponses(responses = []) {
  const pages = safeArray(responses).filter(
    (page) => page !== null && page !== undefined
  );

  const items = normalizeUsuariosCollection(
    pages.flatMap(pickItems)
  );

  const total = Math.max(
    items.length,
    ...pages.map((page) => pickTotal(page, 0)),
    0
  );

  const last = pages.at(-1) || {};
  const continuationToken =
    pickContinuationToken(last);
  const hasMore = pickHasMore(last);

  return {
    ...safeObject(last),

    ok: true,
    success: true,

    total,
    totalCount: total,
    remoteCount: total,

    count: items.length,
    returned: items.length,

    items,
    users: items,
    usuarios: items,
    rows: items,
    results: items,

    hasMore,
    continuationToken:
      continuationToken || null,
    nextContinuationToken:
      continuationToken || null,

    pagination: {
      ...safeObject(last?.pagination),
      pages: pages.length,
      total,
      totalCount: total,
      returned: items.length,
      hasMore,
      continuationToken:
        continuationToken || null,
      nextContinuationToken:
        continuationToken || null,
    },
  };
}

/* =========================================================
   CACHE / STATE
========================================================= */

function isStorageAvailable() {
  if (!isBrowser()) return false;

  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readCachePayload() {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(
      USUARIOS_CACHE_KEY
    );

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function removeCachePayload() {
  if (!isStorageAvailable()) return false;

  try {
    window.localStorage.removeItem(
      USUARIOS_CACHE_KEY
    );
    return true;
  } catch {
    return false;
  }
}

function writeCachePayload() {
  if (!isStorageAvailable()) return false;

  try {
    const safeItems = normalizeUsuariosCollection(
      usuariosState.items
    );

    window.localStorage.setItem(
      USUARIOS_CACHE_KEY,
      JSON.stringify({
        version: USUARIOS_API_VERSION,
        items: safeItems,
        remoteCount: usuariosState.remoteCount,
        lastSyncAt:
          usuariosState.lastSyncAt || Date.now(),
        cachedAt: Date.now(),
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
  const payload = readCachePayload();
  if (!payload) return false;

  const cachedAt = number(
    payload.cachedAt || payload.lastSyncAt,
    0
  );

  const age = cachedAt
    ? Date.now() - cachedAt
    : Number.POSITIVE_INFINITY;

  if (
    freshOnly &&
    age > USUARIOS_CACHE_TTL_MS
  ) {
    return false;
  }

  const items = normalizeUsuariosCollection(
    payload.items
  );

  if (!items.length) return false;

  usuariosState.items = items;
  usuariosStore = items;
  usuariosState.remoteCount = Math.max(
    items.length,
    number(payload.remoteCount, items.length)
  );
  usuariosState.lastSyncAt = number(
    payload.lastSyncAt,
    cachedAt || Date.now()
  );
  usuariosState.hydrated = true;
  usuariosState.loaded = true;
  usuariosState.error = "";

  return true;
}

function setLoading(value = false) {
  usuariosState.loading = Boolean(value);
  return usuariosState.loading;
}

function setRefreshing(value = false) {
  usuariosState.refreshing = Boolean(value);
  return usuariosState.refreshing;
}

function setError(value = "") {
  usuariosState.error = cleanText(value, "");
  return usuariosState.error;
}

function clearError() {
  usuariosState.error = "";
  return true;
}

function setItems(
  items = [],
  { remoteCount = null } = {}
) {
  const list = normalizeUsuariosCollection(items);

  usuariosState.items = list;
  usuariosStore = list;

  usuariosState.remoteCount = Math.max(
    list.length,
    number(
      remoteCount,
      usuariosState.remoteCount || list.length
    )
  );

  return list;
}

function setRemoteCount(value = 0) {
  usuariosState.remoteCount = Math.max(
    0,
    number(value, usuariosState.items.length)
  );

  return usuariosState.remoteCount;
}

function setLastSyncAt(value = Date.now()) {
  usuariosState.lastSyncAt = number(
    value,
    Date.now()
  );

  return usuariosState.lastSyncAt;
}

function touchLastSyncAt() {
  return setLastSyncAt(Date.now());
}

function setLoaded(value = true) {
  usuariosState.loaded = Boolean(value);
  return usuariosState.loaded;
}

function setHydrated(value = true) {
  usuariosState.hydrated = Boolean(value);
  return usuariosState.hydrated;
}

function getInflightLoad() {
  return usuariosState.inflightLoad || null;
}

function setInflightLoad(task = null) {
  usuariosState.inflightLoad = task || null;
  return usuariosState.inflightLoad;
}

function clearInflightLoad(task = null) {
  if (!task || usuariosState.inflightLoad === task) {
    usuariosState.inflightLoad = null;
  }

  return true;
}

function getUsuarios() {
  return usuariosStore;
}

function replaceUsuariosStore(items = []) {
  const list = normalizeUsuariosCollection(items);

  usuariosStore = list;
  usuariosState.items = list;
  usuariosState.remoteCount = Math.max(
    usuariosState.remoteCount,
    list.length
  );

  return list;
}

function upsertUsuarioStore(item = {}) {
  const normalized = normalizeUsuarioModel(item);
  const id = getUsuarioStableId(normalized);

  if (!id) return normalized;

  const current = [...usuariosStore];

  const index = current.findIndex(
    (row) => getUsuarioStableId(row) === id
  );

  if (index >= 0) {
    current[index] = normalizeUsuarioModel({
      ...current[index],
      ...normalized,
      raw: {
        ...safeObject(current[index]?.raw),
        ...safeObject(normalized?.raw),
      },
    });
  } else {
    current.unshift(normalized);
  }

  usuariosStore =
    normalizeUsuariosCollection(current);

  usuariosState.items = usuariosStore;

  usuariosState.remoteCount = Math.max(
    usuariosState.remoteCount,
    usuariosStore.length
  );

  return normalized;
}

function getUsuarioByIdStore(id = "") {
  return findUsuarioById(usuariosStore, id);
}

function syncUsuariosCollection({
  items = [],
  remoteCount = null,
  lastSyncAt = Date.now(),
  writeCache = true,
} = {}) {
  const list = setItems(items, {
    remoteCount,
  });

  setRemoteCount(
    Math.max(
      list.length,
      number(remoteCount, list.length)
    )
  );

  setLastSyncAt(lastSyncAt);
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
  { incrementRemote = false } = {}
) {
  if (!detail) return null;

  const normalized = normalizeUsuarioModel(detail);
  const id = getUsuarioStableId(normalized);
  const existed = Boolean(
    id && getUsuarioByIdStore(id)
  );

  upsertUsuarioStore(normalized);

  if (incrementRemote && !existed) {
    setRemoteCount(
      Math.max(
        usuariosStore.length,
        usuariosState.remoteCount + 1
      )
    );
  } else {
    setRemoteCount(
      Math.max(
        usuariosStore.length,
        usuariosState.remoteCount
      )
    );
  }

  touchLastSyncAt();
  setLoaded(true);
  setHydrated(true);
  writeCachePayload();

  return normalized;
}

/* =========================================================
   CREATE / UPDATE PAYLOADS
========================================================= */

function buildCreateUsuarioBody(payload = {}) {
  const source = safeObject(payload);

  const name = cleanText(
    first(
      source.name,
      source.displayName,
      source.fullName,
      source.nombre,
      ""
    ),
    ""
  ).slice(0, 140);

  const email = firstEmail(
    source.email,
    source.emailLower,
    source.mail,
    ""
  ).slice(0, 254);

  const phone = cleanText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      ""
    ),
    ""
  ).slice(0, 40);

  const tipo =
    normalizeTypeValue(
      first(
        source.tipo,
        source.clienteTipo,
        source.type,
        "particular"
      )
    ) || "particular";

  const nif = cleanText(
    first(
      source.nif,
      source.cif,
      source.taxId,
      ""
    ),
    ""
  ).toUpperCase().slice(0, 32);

  const direccion = normalizeDireccion(
    first(source.direccion, source.address, {})
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

  if (tipo === "empresa" && !nif) {
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
    privacyMode: parseBoolean(
      source.privacyMode,
      false
    ),
    darkMode: parseBoolean(
      source.darkMode,
      true
    ),
  };
}

function normalizePermissions(value = []) {
  const output = [];
  const seen = new Set();

  for (const item of safeArray(value)) {
    const permission = cleanText(item, "").slice(
      0,
      80
    );

    if (!permission || seen.has(permission)) {
      continue;
    }

    seen.add(permission);
    output.push(permission);

    if (output.length >= 100) break;
  }

  return output;
}

function buildUpdateUsuarioBody(payload = {}) {
  const source = safeObject(payload);
  const body = {};

  if (
    hasOwn(source, "name") ||
    hasOwn(source, "displayName") ||
    hasOwn(source, "fullName") ||
    hasOwn(source, "nombre")
  ) {
    const value = cleanText(
      first(
        source.name,
        source.displayName,
        source.fullName,
        source.nombre,
        ""
      ),
      ""
    ).slice(0, 120);

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
    const email = firstEmail(
      source.email,
      source.emailLower,
      source.mail,
      ""
    ).slice(0, 180);

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
    const username = cleanText(
      first(source.username, source.userName, ""),
      ""
    ).slice(0, 60);

    if (!username) {
      throw createContractError(
        "USUARIO_USERNAME_INVALID",
        "El nombre de usuario no puede quedar vacío."
      );
    }

    body.username = username;
  }

  if (
    hasOwn(source, "phone") ||
    hasOwn(source, "telefono") ||
    hasOwn(source, "mobile")
  ) {
    body.phone = cleanText(
      first(
        source.phone,
        source.telefono,
        source.mobile,
        ""
      ),
      ""
    ).slice(0, 30);
  }

  if (
    hasOwn(source, "nif") ||
    hasOwn(source, "cif") ||
    hasOwn(source, "taxId")
  ) {
    body.nif = cleanText(
      first(source.nif, source.cif, source.taxId, ""),
      ""
    ).toUpperCase().slice(0, 32);
  }

  if (
    hasOwn(source, "tipo") ||
    hasOwn(source, "clienteTipo") ||
    hasOwn(source, "type")
  ) {
    const tipo = normalizeTypeValue(
      first(
        source.tipo,
        source.clienteTipo,
        source.type,
        ""
      )
    );

    if (!ALLOWED_TYPES.has(tipo)) {
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
    const role = normalizeKey(
      first(source.role, source.rol, "")
    );

    if (!ALLOWED_ROLES.has(role)) {
      throw createContractError(
        "USUARIO_ROLE_INVALID",
        "El rol debe ser admin o user."
      );
    }

    body.role = role;
  }

  if (hasOwn(source, "active")) {
    body.active = Boolean(source.active);
  } else if (
    hasOwn(source, "status") ||
    hasOwn(source, "estado") ||
    hasOwn(source, "state")
  ) {
    const status = normalizeKey(
      first(
        source.status,
        source.estado,
        source.state,
        ""
      )
    );

    if (
      [
        "active",
        "activo",
        "enabled",
      ].includes(status)
    ) {
      body.active = true;
    } else if (
      [
        "pending",
        "pendiente",
        "blocked",
        "bloqueado",
        "inactive",
        "inactivo",
        "disabled",
      ].includes(status)
    ) {
      body.active = false;
    }
  }

  for (const key of [
    "emailVerified",
    "privacyMode",
    "darkMode",
  ]) {
    if (hasOwn(source, key)) {
      body[key] = Boolean(source[key]);
    }
  }

  if (
    hasOwn(source, "twofa_enabled")
  ) {
    body.twofa_enabled =
      Boolean(source.twofa_enabled);
  }

  if (
    hasOwn(source, "direccion") ||
    hasOwn(source, "address")
  ) {
    body.direccion = normalizeDireccion(
      first(
        source.direccion,
        source.address,
        {}
      )
    );
  }

  if (hasOwn(source, "permissions")) {
    body.permissions = normalizePermissions(
      source.permissions
    );
  }

  if (hasOwn(source, "slug")) {
    body.slug = cleanText(
      source.slug,
      ""
    ).slice(0, 80);
  }

  if (hasOwn(source, "deactivationReason")) {
    body.deactivationReason = cleanText(
      source.deactivationReason,
      ""
    ).slice(0, 500);
  }

  if (!Object.keys(body).length) {
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
      timeout: number(
        options.timeout,
        USUARIOS_LIST_TIMEOUT
      ),
      query: buildUsuariosListQuery(options),
      source: "views.usuarios.api.list.page",
    }
  );
}

export async function fetchUsuariosRequest(
  options = {}
) {
  const all = options.all !== false;

  if (!all) {
    const response =
      await fetchUsuariosPageRequest(options);

    const items = normalizeUsuariosCollection(
      pickItems(response)
    );

    const total = Math.max(
      items.length,
      pickTotal(response, items.length)
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
      returned: items.length,
      hasMore: pickHasMore(response),
      continuationToken:
        pickContinuationToken(response) || null,
      nextContinuationToken:
        pickContinuationToken(response) || null,
    };
  }

  const pages = [];
  const seenTokens = new Set();

  let continuationToken = cleanText(
    first(
      options.ct,
      options.continuationToken,
      ""
    ),
    ""
  );

  let page = 0;

  do {
    if (continuationToken) {
      if (seenTokens.has(continuationToken)) {
        break;
      }

      seenTokens.add(continuationToken);
    }

    page += 1;

    const response =
      await fetchUsuariosPageRequest({
        ...options,
        ct: continuationToken,
        includeTotal:
          page === 1
            ? options.includeTotal !== false
            : false,
      });

    pages.push(response);

    const nextToken =
      pickContinuationToken(response);

    const hasMore =
      pickHasMore(response);

    if (
      !hasMore ||
      !nextToken ||
      nextToken === continuationToken
    ) {
      break;
    }

    continuationToken = nextToken;
  } while (
    page <
    clamp(
      options.maxPages || USUARIOS_MAX_PAGES,
      1,
      USUARIOS_MAX_PAGES
    )
  );

  return mergeListResponses(pages);
}

export async function getUsuarioByIdRequest(
  id = "",
  options = {}
) {
  const userId = normalizeUsuarioId(id);
  const key = `detail:${userId}`;

  if (
    options.dedupe !== false &&
    detailInflight.has(key)
  ) {
    return detailInflight.get(key);
  }

  const task = (async () => {
    const response = await httpRequest(
      "GET",
      getUsuarioEndpoint(userId),
      null,
      {
        timeout: number(
          options.timeout,
          USUARIOS_DETAIL_TIMEOUT
        ),
        source: "views.usuarios.api.detail",
      }
    );

    const detail =
      normalizeDetailResponse(response);

    if (
      !detail ||
      !getUsuarioStableId(detail)
    ) {
      throw createContractError(
        "USUARIO_DETAIL_INVALID_RESPONSE",
        "El backend no devolvió un usuario válido.",
        502
      );
    }

    return detail;
  })();

  detailInflight.set(key, task);

  try {
    return await task;
  } finally {
    if (detailInflight.get(key) === task) {
      detailInflight.delete(key);
    }
  }
}

export async function createUsuarioRequest(
  payload = {},
  options = {}
) {
  const body = buildCreateUsuarioBody(payload);

  const response = await httpRequest(
    "POST",
    USUARIOS_CREATE_ENDPOINT,
    body,
    {
      timeout: number(
        options.timeout,
        USUARIOS_CREATE_TIMEOUT
      ),
      source: "views.usuarios.api.create",
    }
  );

  if (safeObject(response)?.ok === false) {
    throw createContractError(
      "USUARIO_CREATE_REJECTED",
      safeError(
        response,
        "El backend rechazó la creación del usuario."
      ),
      number(response?.status, 400)
    );
  }

  const detail =
    normalizeDetailResponse(response);

  if (
    !detail ||
    !getUsuarioStableId(detail)
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
  const userId = normalizeUsuarioId(id);
  const body = buildUpdateUsuarioBody(payload);

  const response = await httpRequest(
    "PATCH",
    getUsuarioEndpoint(userId),
    body,
    {
      timeout: number(
        options.timeout,
        USUARIOS_UPDATE_TIMEOUT
      ),
      source: "views.usuarios.api.update",
    }
  );

  if (safeObject(response)?.ok === false) {
    throw createContractError(
      "USUARIO_UPDATE_REJECTED",
      safeError(
        response,
        "El backend rechazó la actualización del usuario."
      ),
      number(response?.status, 400)
    );
  }

  const detail =
    normalizeDetailResponse(response);

  if (
    !detail ||
    !getUsuarioStableId(detail)
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
  hydrateStateFromCache({ freshOnly });

  return [...usuariosState.items];
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
} = {}) {
  hydrateStateFromCache({ freshOnly: true });

  const existingInflight = getInflightLoad();

  if (existingInflight && !force) {
    return existingInflight;
  }

  const loadToken = ++lastLoadToken;
  const hadItems =
    usuariosState.items.length > 0;

  if (!silent) {
    setLoading(!hadItems);
    setRefreshing(hadItems);
  }

  clearError();
  lastError = null;

  let task = null;

  task = fetchUsuariosRequest({
    all: true,
    limit: USUARIOS_FETCH_LIMIT,
    includeTotal: true,
    sortBy: USUARIOS_DEFAULT_SORT_BY,
    sortDir: USUARIOS_DEFAULT_SORT_DIR,
    timeout,
    ...safeObject(filters),
  })
    .then((response) => {
      if (loadToken !== lastLoadToken) {
        return [...usuariosState.items];
      }

      const items =
        normalizeUsuariosCollection(
          pickItems(response)
        );

      const remoteCount = Math.max(
        items.length,
        pickTotal(response, items.length)
      );

      lastLoadedAt = Date.now();

      lastResponseMeta = {
        total: remoteCount,
        returned: items.length,
        pages: number(
          response?.pagination?.pages,
          1
        ),
        continuationToken:
          pickContinuationToken(response) || null,
        hasMore: pickHasMore(response),
      };

      return syncUsuariosCollection({
        items,
        remoteCount,
        lastSyncAt: lastLoadedAt,
        writeCache: true,
      });
    })
    .catch((error) => {
      lastError = error;

      if (loadToken === lastLoadToken) {
        setError(
          safeError(
            error,
            "No se pudieron cargar los usuarios."
          )
        );
      }

      throw error;
    })
    .finally(() => {
      if (loadToken === lastLoadToken) {
        setLoading(false);
        setRefreshing(false);
      }

      clearInflightLoad(task);
    });

  setInflightLoad(task);

  return task;
}

export const listUsuarios = loadUsuarios;

/* =========================================================
   DETAIL
========================================================= */

export async function loadUsuarioDetail(
  userId = "",
  options = {}
) {
  const id = normalizeUsuarioId(userId);

  const cached =
    getUsuarioByIdStore(id) ||
    findUsuarioById(
      usuariosState.items,
      id
    );

  if (options.cacheOnly === true) {
    return cached || null;
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

    return syncUsuarioDetail(detail);
  } catch (error) {
    if (
      cached &&
      options.allowCacheFallback !== false
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

  return syncUsuarioDetail(detail, {
    incrementRemote: true,
  });
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

  return syncUsuarioDetail(detail);
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
  const response = await httpRequest(
    "GET",
    USUARIOS_STATS_ENDPOINT,
    null,
    {
      timeout: number(
        options.timeout,
        USUARIOS_TIMEOUT
      ),
      source: "views.usuarios.api.stats",
    }
  );

  const source = safeObject(response);

  return {
    ok: source.ok !== false,
    total: Math.max(
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
    ),
  };
}

/* =========================================================
   SNAPSHOTS / COMPAT
========================================================= */

export function getUsuariosApiSnapshot() {
  return {
    version: USUARIOS_API_VERSION,
    endpoint: USUARIOS_ENDPOINT,
    createEndpoint:
      USUARIOS_CREATE_ENDPOINT,

    loading: usuariosState.loading,
    refreshing:
      usuariosState.refreshing,
    loaded: usuariosState.loaded,
    hydrated: usuariosState.hydrated,

    items: usuariosStore.length,
    remoteCount:
      usuariosState.remoteCount,

    lastLoadedAt,
    lastResponseMeta,

    lastError: lastError
      ? safeError(lastError)
      : "",

    inflightDetailCount:
      detailInflight.size,

    backendContract: {
      list: "GET /api/users",
      detail: "GET /api/users/:id",
      create: "POST /api/users/create",
      update:
        "PUT|PATCH /api/users/:id",
      delete: false,
      pagination:
        "continuation-token",
    },

    policy: {
      httpSingle: true,
      continuationToken: true,
      raceProtected: true,
      cacheFallback: true,
      createPayloadWhitelisted: true,
      updatePayloadWhitelisted: true,
      noMethodMasquerading: true,
      deleteUnsupported: true,
      activationUrlNotPersisted: true,
      sensitiveRawSanitized: true,
      roles: ["admin", "user"],
    },
  };
}

export {
  usuariosState,
  getUsuarios,
  replaceUsuariosStore,
  upsertUsuarioStore,
  getUsuarioByIdStore,
  findUsuarioById,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
};

export function unwrapUsuariosPayload(
  payload = null
) {
  return pickItems(payload);
}

export function getUsuariosStateSnapshot() {
  return {
    ...usuariosState,
    items: [...usuariosState.items],
    lastError: lastError
      ? safeError(lastError)
      : "",
  };
}

export function getUsuariosStoreSnapshot() {
  return {
    items: [...usuariosStore],
    count: usuariosStore.length,
    remoteCount: Math.max(
      usuariosState.remoteCount,
      usuariosStore.length
    ),
    lastSyncAt:
      usuariosState.lastSyncAt || 0,
  };
}

export function getUsuariosCount() {
  return usuariosStore.length;
}

export function hasUsuarios() {
  return getUsuariosCount() > 0;
}

export function getSortedUsuariosStore() {
  return normalizeUsuariosCollection(
    usuariosStore
  );
}

export function paginateUsuarios(
  items = [],
  { page = 1, pageSize = 5 } = {}
) {
  const rows = safeArray(items);
  const size = clamp(pageSize, 1, 100);

  const totalPages = Math.max(
    1,
    Math.ceil(rows.length / size)
  );

  const currentPage = clamp(
    page,
    1,
    totalPages
  );

  const start =
    (currentPage - 1) * size;

  return {
    items: rows.slice(
      start,
      start + size
    ),
    page: currentPage,
    currentPage,
    pageSize: size,
    total: rows.length,
    totalCount: rows.length,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext:
      currentPage < totalPages,
  };
}

export function computeUsuariosStats(
  items = []
) {
  return safeArray(items).reduce(
    (acc, item) => {
      const current =
        normalizeUsuarioModel(item);

      acc.total += 1;

      const bucket =
        statusBucket(current);

      if (bucket === "active") {
        acc.activeCount += 1;
      }

      if (bucket === "pending") {
        acc.pendingCount += 1;
      }

      if (bucket === "blocked") {
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
  version: USUARIOS_API_VERSION,
  endpoint: USUARIOS_ENDPOINT,
  createEndpoint:
    USUARIOS_CREATE_ENDPOINT,

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

  buildUsuariosListQuery,
  normalizeUsuarioId,
  getUsuariosEndpoint,
  getUsuarioEndpoint,
});

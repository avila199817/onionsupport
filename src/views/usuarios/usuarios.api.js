/* =========================================================
   Onion Support - Usuarios API
   Archivo: /src/views/usuarios/usuarios.api.js

   PRODUCTIVO · HTTP ÚNICO · PAINT SAFE · AUTÓNOMO · 10/10 · V14

   Responsabilidad:
   - HTTP único mediante /core/http.js.
   - Listado completo con continuation token.
   - Dedupe de peticiones de listado.
   - Protección contra carreras de respuestas.
   - Detalle, creación, actualización y eliminación.
   - Normalización de envelopes heterogéneos.
   - Sin fetch propio y sin reintentos mutantes duplicados.
   - Sin DOM, Router, Toast ni listeners.
   - Sin borrar cache válida ante respuestas incompletas.
   - Cache interno en memoria + localStorage opcional.
   - Sin imports a módulos externos de estado, store o modelo.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   CACHE / STATE INTERNO

   Punto cerrado:
   - Este archivo NO importa módulos externos de estado, store o modelo.
   - La vista Usuarios puede existir solo con index.js + usuarios.api.js + template.
   - Estado/cache en memoria con localStorage opcional.
   - Sin DOM, sin Router, sin Toast, sin listeners.
========================================================= */

const USUARIOS_CACHE_KEY = "onion.support.usuarios.cache.v2";
const USUARIOS_CACHE_TTL_MS = 60000;

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

function isStorageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readCachePayload() {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(USUARIOS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachePayload() {
  if (!isStorageAvailable()) return false;

  try {
    const payload = {
      version: USUARIOS_API_VERSION,
      items: usuariosState.items,
      remoteCount: usuariosState.remoteCount,
      lastSyncAt: usuariosState.lastSyncAt || Date.now(),
      cachedAt: Date.now(),
    };

    window.localStorage.setItem(USUARIOS_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function hydrateStateFromCache({ freshOnly = true } = {}) {
  const payload = readCachePayload();
  if (!payload) return false;

  const cachedAt = Number(payload.cachedAt || payload.lastSyncAt || 0);
  const age = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;

  if (freshOnly && age > USUARIOS_CACHE_TTL_MS) return false;

  const items = normalizeUsuariosCollection(payload.items);
  if (!items.length) return false;

  usuariosState.items = items;
  usuariosState.remoteCount = Math.max(items.length, number(payload.remoteCount, items.length));
  usuariosState.lastSyncAt = number(payload.lastSyncAt, cachedAt || Date.now());
  usuariosState.hydrated = true;
  usuariosState.loaded = true;
  usuariosState.error = "";
  usuariosStore = items;

  return true;
}

function getInflightLoad() {
  return usuariosState.inflightLoad || null;
}

function setInflightLoad(task = null) {
  usuariosState.inflightLoad = task || null;
  return usuariosState.inflightLoad;
}

function clearInflightLoad() {
  usuariosState.inflightLoad = null;
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

function setItems(items = [], { remoteCount = null } = {}) {
  const list = dedupeUsuarios(normalizeUsuariosCollection(items));
  usuariosState.items = list;
  usuariosStore = list;
  usuariosState.remoteCount = Math.max(list.length, number(remoteCount, usuariosState.remoteCount || list.length));
  return list;
}

function setRemoteCount(value = 0) {
  usuariosState.remoteCount = Math.max(0, number(value, usuariosState.items.length));
  return usuariosState.remoteCount;
}

function setLastSyncAt(value = Date.now()) {
  usuariosState.lastSyncAt = number(value, Date.now());
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

function getUsuarios() {
  return usuariosStore;
}

function replaceUsuariosStore(items = []) {
  usuariosStore = dedupeUsuarios(normalizeUsuariosCollection(items));
  return usuariosStore;
}

function upsertUsuarioStore(item = {}) {
  const normalized = normalizeUsuarioModel(item);
  const id = getUsuarioStableId(normalized);

  if (!id) {
    usuariosStore = dedupeUsuarios([...usuariosStore, normalized]);
    return normalized;
  }

  const current = dedupeUsuarios(usuariosStore);
  const index = current.findIndex((row) => getUsuarioStableId(row) === id);

  if (index >= 0) {
    current[index] = {
      ...current[index],
      ...normalized,
      raw: {
        ...safeObject(current[index]?.raw),
        ...safeObject(normalized?.raw),
      },
    };
  } else {
    current.unshift(normalized);
  }

  usuariosStore = dedupeUsuarios(current);
  return normalized;
}

function findUsuarioById(items = [], id = "") {
  const target = cleanText(id, "");
  if (!target) return null;

  const targetLower = target.toLowerCase();

  return safeArray(items).find((item = {}) => {
    const raw = safeObject(item?.raw);
    const candidates = [
      item.userId,
      item.usuarioId,
      item.id,
      item._id,
      item.uid,
      item.code,
      item.username,
      item.userName,
      item.email,
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.uid,
      raw.code,
      raw.username,
      raw.userName,
      raw.email,
    ];

    return candidates.some((candidate) => cleanText(candidate, "").toLowerCase() === targetLower);
  }) || null;
}

function getUsuarioByIdStore(id = "") {
  return findUsuarioById(usuariosStore, id);
}

function normalizeRoleValue(value = "") {
  const role = normalizeKey(value || "user");

  if (["admin", "administrator", "administrador", "superadmin", "super_admin", "root", "owner"].includes(role)) return "admin";
  if (["client", "cliente"].includes(role)) return "cliente";
  if (["support", "soporte"].includes(role)) return "support";
  if (["technician", "tecnico", "técnico"].includes(role)) return "tecnico";

  return role || "user";
}

function normalizeStatusValue(value = "", source = {}) {
  const explicit = first(value, source.status, source.estado, source.state, source.accountStatus, source.userStatus);

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    const status = normalizeKey(explicit);

    if (["active", "activo", "activa", "enabled", "habilitado", "habilitada", "ok"].includes(status)) return "active";
    if (["pending", "pendiente", "invited", "invitado", "invitada", "invite", "new"].includes(status)) return "pending";
    if (["blocked", "bloqueado", "bloqueada", "suspended", "locked", "restricted"].includes(status)) return "blocked";
    if (["disabled", "inactive", "inactivo", "inactiva", "archived"].includes(status)) return "inactive";

    return status || "active";
  }

  if (source.active === false || source.isActive === false || source.enabled === false || source.disabled === true) return "inactive";
  if (source.blocked === true) return "blocked";

  return "active";
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  if (!email) return "";
  if (["null", "undefined", "none", "sin email", "no email", "no_email"].includes(email)) return "";
  return email.includes("@") ? email : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function normalizeUsuarioModel(item = {}) {
  const raw = safeObject(item);
  const profile = safeObject(first(raw.profile, raw.usuario, raw.user, {}));
  const address = safeObject(first(raw.address, raw.direccion, raw.location, raw.ubicacion, profile.address, profile.direccion, {}));

  const userId = cleanText(
    first(
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw._id,
      raw.uid,
      raw.sub,
      raw.code,
      profile.userId,
      profile.id,
      profile.uid,
      raw.email,
      raw.username,
      raw.userName
    ),
    ""
  );

  const firstName = cleanText(first(raw.firstName, raw.nombre, profile.firstName, profile.nombre), "");
  const lastName = cleanText(first(raw.lastName, raw.apellidos, profile.lastName, profile.apellidos), "");
  const composedName = [firstName, lastName].filter(Boolean).join(" ");

  const name = cleanText(
    first(
      raw.fullName,
      raw.displayName,
      raw.name,
      raw.nombreCompleto,
      composedName,
      profile.fullName,
      profile.displayName,
      profile.name,
      raw.username,
      raw.userName,
      raw.email,
      userId
    ),
    "Usuario"
  );

  const email = firstEmail(raw.email, raw.emailLower, raw.mail, raw.userEmail, profile.email, profile.emailLower, profile.mail);
  const username = cleanText(first(raw.username, raw.userName, raw.usernameLower, profile.username, profile.userName), "");
  const role = normalizeRoleValue(first(raw.role, raw.rol, raw.accountRole, profile.role, profile.rol, "user"));
  const status = normalizeStatusValue(first(raw.status, raw.estado, raw.state), raw);
  const phone = cleanText(first(raw.phone, raw.telefono, raw.mobile, raw.movil, profile.phone, profile.telefono, profile.mobile), "");
  const city = cleanText(first(raw.city, raw.ciudad, raw.locationCity, address.city, address.ciudad, profile.city, profile.ciudad), "");
  const avatar = cleanText(first(raw.avatarUrl, raw.avatar, raw.photoUrl, raw.photoURL, raw.picture, raw.imageUrl, profile.avatarUrl, profile.avatar, profile.photoUrl, profile.picture), "");

  const createdAt = first(raw.createdAt, raw.created_at, raw.fechaCreacion, raw.registeredAt, raw.created, raw.lifecycle?.createdAt, raw.audit?.createdAt, null);
  const updatedAt = first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastModifiedAt, raw.lastActivityAt, raw.lastLoginAt, raw.lastAccessAt, raw.ultimoAcceso, raw.lifecycle?.updatedAt, raw.audit?.updatedAt, createdAt, null);
  const lastLoginAt = first(raw.lastLoginAt, raw.last_login_at, raw.lastAccessAt, raw.ultimoAcceso, raw.lastSeenAt, raw.session?.lastLoginAt, raw.session?.lastSeenAt, null);

  return {
    ...raw,
    raw,

    id: userId,
    userId,
    usuarioId: userId,
    uid: cleanText(first(raw.uid, userId), userId),
    code: cleanText(first(raw.code, raw.username, raw.userName, userId, email), userId || email),

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

    role,
    rol: role,
    status,
    estado: status,
    state: status,
    active: status === "active",
    isActive: status === "active",
    enabled: status === "active",
    blocked: status === "blocked",

    phone,
    telefono: phone,
    mobile: cleanText(first(raw.mobile, raw.movil, phone), phone),
    ciudad: city,
    city,
    location: {
      ...safeObject(raw.location),
      city,
      ciudad: city,
    },
    address: {
      ...address,
      city,
      ciudad: city,
    },

    avatar,
    avatarUrl: avatar,
    photoUrl: cleanText(first(raw.photoUrl, avatar), avatar),
    picture: cleanText(first(raw.picture, avatar), avatar),
    hasAvatar: Boolean(avatar),

    createdAt,
    updatedAt,
    lastLoginAt,
    lastAccessAt: first(raw.lastAccessAt, raw.ultimoAcceso, lastLoginAt, null),
    lastActivityAt: first(raw.lastActivityAt, updatedAt, lastLoginAt, createdAt, null),

    meta: {
      ...safeObject(raw.meta),
      frontendReady: true,
      normalizedAt: Date.now(),
      timestampMs: toTimestamp(first(updatedAt, lastLoginAt, createdAt)),
    },
  };
}

function normalizeUsuariosCollection(items = []) {
  return dedupeUsuarios(safeArray(items).map(normalizeUsuarioModel).filter((item) => getUsuarioStableId(item) || item.email || item.username));
}

function unwrapUsuariosPayload(payload = null) {
  if (Array.isArray(payload)) return payload;

  const queue = [payload];
  const seen = new WeakSet();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const key of ["items", "rows", "users", "usuarios", "results", "records", "docs", "documents", "list", "value"]) {
      if (Array.isArray(current[key])) return current[key];
    }

    for (const key of ["data", "payload", "result", "response", "body"]) {
      const nested = current[key];
      if (Array.isArray(nested)) return nested;
      if (nested && typeof nested === "object") queue.push(nested);
    }
  }

  return [];
}

function toTimestamp(value = null) {
  if (!value) return 0;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value > 9999999999 ? value : value * 1000;

  const raw = cleanText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 9999999999 ? numeric : numeric * 1000;

  const ms = Date.parse(raw.includes("T") ? raw : `${raw}T00:00:00`);
  return Number.isFinite(ms) ? ms : 0;
}

/* =========================================================
   META / CONFIG
========================================================= */

export const USUARIOS_API_VERSION = "usuarios.api.productive.v14.http-single.autonomous";

export const USUARIOS_ENDPOINT = "/api/users";
export { USUARIOS_CACHE_KEY, USUARIOS_CACHE_TTL_MS };

export const USUARIOS_TIMEOUT = 15000;
export const USUARIOS_LIST_TIMEOUT = 20000;
export const USUARIOS_DETAIL_TIMEOUT = 18000;
export const USUARIOS_CREATE_TIMEOUT = 30000;
export const USUARIOS_UPDATE_TIMEOUT = 30000;
export const USUARIOS_DELETE_TIMEOUT = 30000;

export const USUARIOS_FETCH_LIMIT = 250;
export const USUARIOS_MAX_LIMIT = 500;
export const USUARIOS_MAX_PAGES = 20;

export const USUARIOS_DEFAULT_SORT_BY = "updatedAt";
export const USUARIOS_DEFAULT_SORT_DIR = "DESC";

let lastLoadToken = 0;
let lastError = null;
let lastLoadedAt = 0;
let lastResponseMeta = null;

const detailInflight = new Map();

/* =========================================================
   BASICS
========================================================= */

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

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/*
  IMPORTANTE:
  No aplanar arrays aquí. Si el backend devuelve items: [..],
  first(items, ...) debe devolver el array completo, no el primer usuario.
*/
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

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const key = cleanText(value, "").toLowerCase();

  if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
  if (["false", "0", "no", "off"].includes(key)) return false;

  return fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(number(value, min), min), max);
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

function getUsuarioStableId(item = {}) {
  const source = safeObject(item);

  return cleanText(
    first(
      source.userId,
      source.usuarioId,
      source.id,
      source._id,
      source.uid,
      source.code,
      source.email,
      source.username,
      source.userName
    ),
    ""
  );
}

function normalizeUsuarioSafe(item = {}) {
  try {
    return normalizeUsuarioModel(safeObject(item));
  } catch {
    return safeObject(item);
  }
}

function normalizeUsuariosSafe(items = []) {
  try {
    return normalizeUsuariosCollection(safeArray(items));
  } catch {
    return safeArray(items).map(normalizeUsuarioSafe);
  }
}

function dedupeUsuarios(items = []) {
  const map = new Map();
  let anonymousIndex = 0;

  for (const raw of safeArray(items)) {
    if (!isObject(raw)) continue;

    const normalized = normalizeUsuarioSafe(raw);
    const id = getUsuarioStableId(normalized) || getUsuarioStableId(raw);
    const key = id || `anonymous:${anonymousIndex++}`;

    if (map.has(key)) {
      map.set(key, {
        ...map.get(key),
        ...raw,
        ...normalized,
      });
      continue;
    }

    map.set(key, normalized);
  }

  return [...map.values()];
}

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token = 0) {
  return token === lastLoadToken;
}

/* =========================================================
   ENDPOINTS / QUERY
========================================================= */

export function normalizeUsuarioId(id = "") {
  const value = cleanText(id, "");

  if (!value) {
    throw new Error("USUARIO_ID_REQUIRED");
  }

  return value;
}

export function getUsuariosEndpoint() {
  return USUARIOS_ENDPOINT;
}

export function getUsuarioEndpoint(id = "") {
  return `${USUARIOS_ENDPOINT}/${encodeURIComponent(normalizeUsuarioId(id))}`;
}

function cleanQueryValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

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
    sortBy: cleanText(sortBy, USUARIOS_DEFAULT_SORT_BY),
    sortDir: cleanText(sortDir, USUARIOS_DEFAULT_SORT_DIR).toUpperCase(),
  };

  const token = cleanText(first(ct, continuationToken), "");
  const finalRole = cleanText(first(role, rol), "");
  const finalType = cleanText(first(tipo, type), "");
  const finalSearch = cleanText(first(search, q), "");
  const finalActive = active !== undefined ? active : enabled;

  if (token) query.ct = token;
  if (finalRole) query.role = finalRole;
  if (finalType) query.tipo = finalType;
  if (finalSearch) {
    query.search = finalSearch;
    query.q = finalSearch;
  }

  if (finalActive !== undefined) query.active = parseBoolean(finalActive, true);
  if (emailVerified !== undefined) query.emailVerified = parseBoolean(emailVerified, false);
  if (hasAvatar !== undefined) query.hasAvatar = parseBoolean(hasAvatar, false);
  if (has2fa !== undefined) query.has2fa = parseBoolean(has2fa, false);

  for (const [key, value] of Object.entries(safeObject(filters))) {
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

async function httpRequest(method = "GET", endpoint = "", body = null, options = {}) {
  const verb = cleanText(method, "GET").toUpperCase();
  const path = cleanText(endpoint, "");

  if (!path) {
    throw new Error("USUARIOS_ENDPOINT_REQUIRED");
  }

  const timeout = number(options.timeout, USUARIOS_TIMEOUT);
  const query = safeObject(options.query || options.params);
  const headers = safeObject(options.headers);
  const source = cleanText(options.source, "views.usuarios");

  if (verb === "GET" && isFunction(Http?.get)) {
    return Http.get(path, { timeout, query, headers, source });
  }

  if (verb === "POST" && isFunction(Http?.post)) {
    return Http.post(path, body, { timeout, query, headers, source });
  }

  if (verb === "PUT" && isFunction(Http?.put)) {
    return Http.put(path, body, { timeout, query, headers, source });
  }

  if (verb === "PATCH" && isFunction(Http?.patch)) {
    return Http.patch(path, body, { timeout, query, headers, source });
  }

  if (verb === "DELETE") {
    const remove = Http?.delete || Http?.del;

    if (isFunction(remove)) {
      return remove.call(Http, path, { timeout, query, headers, source });
    }
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

  if (verb === "PUT") {
    return httpRequest("PATCH", path, body, options);
  }

  if (verb === "PATCH") {
    return httpRequest("POST", path, body, options);
  }

  throw new Error(`USUARIOS_HTTP_${verb}_UNAVAILABLE`);
}

function getJson(endpoint = "", options = {}) {
  return httpRequest("GET", endpoint, null, options);
}

function postJson(endpoint = "", body = {}, options = {}) {
  return httpRequest("POST", endpoint, safeObject(body), options);
}

function patchJson(endpoint = "", body = {}, options = {}) {
  return httpRequest("PATCH", endpoint, safeObject(body), options);
}

function deleteJson(endpoint = "", options = {}) {
  return httpRequest("DELETE", endpoint, null, options);
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function envelopeObjects(payload = null, maxDepth = 8) {
  const output = [];
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);
    output.push(value);

    for (const key of ["data", "payload", "result", "response", "body", "value"]) {
      if (isObject(value[key])) {
        queue.push({ value: value[key], depth: depth + 1 });
      }
    }
  }

  return output;
}

function hasExplicitListPayload(payload = null) {
  if (Array.isArray(payload)) return true;

  return envelopeObjects(payload).some((source) => {
    return [
      "items",
      "rows",
      "users",
      "usuarios",
      "results",
      "records",
      "docs",
      "documents",
      "list",
    ].some((key) => Array.isArray(source[key]));
  });
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  try {
    const modelItems = unwrapUsuariosPayload(payload);
    if (Array.isArray(modelItems) && modelItems.length) return modelItems;
  } catch {
    // Continúa con envelopes genéricos.
  }

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
      if (Array.isArray(source[key])) return source[key];
    }
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  const candidates = [];

  for (const source of envelopeObjects(payload)) {
    candidates.push(
      source.total,
      source.totalCount,
      source.remoteCount,
      source.count,
      source.pagination?.total,
      source.pagination?.totalCount,
      source.meta?.total,
      source.meta?.totalCount,
      source.pageInfo?.total,
      source.pageInfo?.totalCount
    );
  }

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
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
        source.pagination?.ct,
        source.pageInfo?.continuationToken,
        source.pageInfo?.nextContinuationToken,
        source.pageInfo?.nextToken,
        source.pageInfo?.ct
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
      source.pagination?.hasMore,
      source.pageInfo?.hasMore
    );

    if (value === true || value === false) return value;
    if (typeof value === "string") return parseBoolean(value, false);
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
      item._id ||
      item.uid ||
      item.username ||
      item.userName ||
      item.email ||
      item.mail ||
      item.name ||
      item.nombre ||
      item.displayName ||
      item.fullName
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.find(looksLikeUsuario) || payload[0] || null;
  if (looksLikeUsuario(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    for (const key of ["user", "usuario", "item", "detail"]) {
      if (looksLikeUsuario(source[key])) return source[key];
    }
  }

  return null;
}

function normalizeDetailResponse(payload = null) {
  const detail = pickDetail(payload);
  return detail ? normalizeUsuarioSafe(detail) : null;
}

function mergeListResponses(responses = []) {
  const pages = safeArray(responses).filter((page) => page !== null && page !== undefined);
  const merged = dedupeUsuarios(pages.flatMap(pickItems));
  const totals = pages.map((page) => pickTotal(page, 0));
  const total = Math.max(merged.length, ...totals, 0);
  const last = pages.at(-1) || {};
  const continuationToken = pickContinuationToken(last);
  const hasMore = pickHasMore(last);

  return {
    ...safeObject(last),
    ok: true,
    success: true,

    total,
    totalCount: total,
    remoteCount: total,
    count: merged.length,
    returned: merged.length,

    items: merged,
    users: merged,
    usuarios: merged,
    rows: merged,
    results: merged,

    hasMore,
    continuationToken: continuationToken || null,
    nextContinuationToken: continuationToken || null,

    pagination: {
      ...safeObject(last?.pagination),
      total,
      totalCount: total,
      returned: merged.length,
      hasMore,
      continuationToken: continuationToken || null,
      nextContinuationToken: continuationToken || null,
    },
  };
}

/* =========================================================
   STORE / STATE SYNC
========================================================= */

function writeCacheSafe() {
  try {
    writeCachePayload?.();
    return true;
  } catch {
    return false;
  }
}

function syncUsuariosCollection({
  items = [],
  remoteCount = null,
  lastSyncAt = Date.now(),
  writeCache = true,
} = {}) {
  const list = dedupeUsuarios(normalizeUsuariosSafe(items));
  const count = Math.max(list.length, number(remoteCount, list.length));

  replaceUsuariosStore?.(list);
  setItems?.(list, { remoteCount: count });
  setRemoteCount?.(count);
  setLastSyncAt?.(lastSyncAt);
  setLoaded?.(true);
  setHydrated?.(true);
  clearError?.();

  if (writeCache) writeCacheSafe();

  return list;
}

function syncUsuarioDetail(detail = null, { incrementRemote = false } = {}) {
  if (!detail) return null;

  const normalized = normalizeUsuarioSafe(detail);
  const id = getUsuarioStableId(normalized);
  const existed = Boolean(id && findUsuarioById?.(safeArray(getUsuarios?.()), id));

  upsertUsuarioStore?.(normalized);

  const current = dedupeUsuarios(normalizeUsuariosSafe(safeArray(getUsuarios?.())));
  const previousRemote = Math.max(0, number(usuariosState?.remoteCount, 0));
  const nextRemote = Math.max(
    current.length,
    previousRemote + (incrementRemote && !existed ? 1 : 0)
  );

  setItems?.(current, { remoteCount: nextRemote });
  setRemoteCount?.(nextRemote);
  setLoaded?.(true);
  setHydrated?.(true);
  touchLastSyncAt?.();
  writeCacheSafe();

  return normalized;
}

/* =========================================================
   RAW REQUESTS
========================================================= */

async function fetchUsuariosPageRequest(options = {}) {
  return getJson(USUARIOS_ENDPOINT, {
    timeout: number(options.timeout, USUARIOS_LIST_TIMEOUT),
    query: buildUsuariosListQuery(options),
    source: "views.usuarios.list.page",
  });
}

export async function fetchUsuariosRequest(options = {}) {
  const all = options.all !== false;

  if (!all) {
    return fetchUsuariosPageRequest(options);
  }

  const pages = [];
  const seenTokens = new Set();
  let continuationToken = cleanText(first(options.ct, options.continuationToken), "");
  let page = 0;

  do {
    if (continuationToken) {
      if (seenTokens.has(continuationToken)) break;
      seenTokens.add(continuationToken);
    }

    page += 1;

    const response = await fetchUsuariosPageRequest({
      ...options,
      ct: continuationToken,
      includeTotal: page === 1 ? options.includeTotal !== false : false,
    });

    pages.push(response);

    const nextToken = pickContinuationToken(response);
    const hasMore = pickHasMore(response);

    if (!hasMore || !nextToken || nextToken === continuationToken) break;

    continuationToken = nextToken;
  } while (page < clamp(options.maxPages || USUARIOS_MAX_PAGES, 1, USUARIOS_MAX_PAGES));

  return mergeListResponses(pages);
}

export async function getUsuarioByIdRequest(id = "", options = {}) {
  const userId = normalizeUsuarioId(id);
  const key = `detail:${userId}`;

  if (options.dedupe !== false && detailInflight.has(key)) {
    return detailInflight.get(key);
  }

  const task = (async () => {
    const response = await getJson(getUsuarioEndpoint(userId), {
      timeout: number(options.timeout, USUARIOS_DETAIL_TIMEOUT),
      source: "views.usuarios.detail",
    });

    const detail = normalizeDetailResponse(response);

    if (!detail) {
      throw new Error("USUARIO_DETAIL_INVALID_RESPONSE");
    }

    return detail;
  })();

  detailInflight.set(key, task);

  try {
    return await task;
  } finally {
    if (detailInflight.get(key) === task) detailInflight.delete(key);
  }
}

export async function createUsuarioRequest(payload = {}, options = {}) {
  const response = await postJson(USUARIOS_ENDPOINT, safeObject(payload), {
    timeout: number(options.timeout, USUARIOS_CREATE_TIMEOUT),
    source: "views.usuarios.create",
  });

  return normalizeDetailResponse(response) || response;
}

export async function updateUsuarioRequest(id = "", payload = {}, options = {}) {
  const response = await patchJson(
    getUsuarioEndpoint(id),
    safeObject(payload),
    {
      timeout: number(options.timeout, USUARIOS_UPDATE_TIMEOUT),
      source: "views.usuarios.update",
    }
  );

  return normalizeDetailResponse(response) || response;
}

export async function deleteUsuarioRequest(id = "", options = {}) {
  return deleteJson(getUsuarioEndpoint(id), {
    timeout: number(options.timeout, USUARIOS_DELETE_TIMEOUT),
    source: "views.usuarios.delete",
  });
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache({ freshOnly = true } = {}) {
  try {
    const hydrated = hydrateStateFromCache?.({ freshOnly });

    if (hydrated) {
      const stateItems = dedupeUsuarios(normalizeUsuariosSafe(safeArray(usuariosState?.items)));
      replaceUsuariosStore?.(stateItems);
      return stateItems;
    }
  } catch {
    // Continúa con state/store en memoria.
  }

  const stateItems = dedupeUsuarios(normalizeUsuariosSafe(safeArray(usuariosState?.items)));

  if (stateItems.length) {
    replaceUsuariosStore?.(stateItems);
    setHydrated?.(true);
    setLoaded?.(true);
    return stateItems;
  }

  const storeItems = dedupeUsuarios(normalizeUsuariosSafe(safeArray(getUsuarios?.())));

  if (storeItems.length) {
    return syncUsuariosCollection({
      items: storeItems,
      remoteCount: Math.max(number(usuariosState?.remoteCount, 0), storeItems.length),
      lastSyncAt: number(usuariosState?.lastSyncAt, Date.now()),
      writeCache: false,
    });
  }

  return [];
}

export const hydrateUsuariosFromCache = hydrateFromCache;

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadUsuarios({
  force = false,
  silent = false,
  filters = {},
  timeout = USUARIOS_LIST_TIMEOUT,
} = {}) {
  const existingInflight = getInflightLoad?.();

  if (existingInflight && !force) {
    return existingInflight;
  }

  const loadToken = nextLoadToken();
  const currentItems = dedupeUsuarios(normalizeUsuariosSafe(safeArray(getUsuarios?.())));
  const stateItems = dedupeUsuarios(normalizeUsuariosSafe(safeArray(usuariosState?.items)));
  const hasVisibleData = currentItems.length > 0 || stateItems.length > 0;

  const task = (async () => {
    try {
      lastError = null;
      clearError?.();

      if (!hasVisibleData && !silent) {
        setLoading?.(true);
      } else if (!silent) {
        setRefreshing?.(true);
      }

      const response = await fetchUsuariosRequest({
        all: true,
        limit: USUARIOS_FETCH_LIMIT,
        includeTotal: true,
        sortBy: USUARIOS_DEFAULT_SORT_BY,
        sortDir: USUARIOS_DEFAULT_SORT_DIR,
        timeout,
        ...safeObject(filters),
      });

      const explicitList = hasExplicitListPayload(response);
      const list = dedupeUsuarios(normalizeUsuariosSafe(pickItems(response)));
      const remoteCount = pickTotal(response, list.length);

      if (!explicitList) {
        throw new Error("USUARIOS_LIST_INVALID_RESPONSE");
      }

      if (!list.length && remoteCount > 0) {
        throw new Error("USUARIOS_LIST_TOTAL_WITHOUT_ITEMS");
      }

      if (!isActiveLoadToken(loadToken)) {
        return dedupeUsuarios(normalizeUsuariosSafe(safeArray(usuariosState?.items)));
      }

      lastLoadedAt = Date.now();
      lastResponseMeta = {
        total: remoteCount,
        returned: list.length,
        pages: number(response?.pagination?.pages, 0),
        continuationToken: pickContinuationToken(response) || null,
        hasMore: pickHasMore(response),
      };

      return syncUsuariosCollection({
        items: list,
        remoteCount,
        lastSyncAt: lastLoadedAt,
        writeCache: true,
      });
    } catch (error) {
      lastError = error;

      if (isActiveLoadToken(loadToken)) {
        setError?.(safeError(error, "No se pudieron cargar los usuarios."));
        setLoaded?.(true);

        const cached = hydrateFromCache({ freshOnly: true });

        if (!cached.length && currentItems.length) {
          syncUsuariosCollection({
            items: currentItems,
            remoteCount: Math.max(number(usuariosState?.remoteCount, 0), currentItems.length),
            lastSyncAt: number(usuariosState?.lastSyncAt, 0),
            writeCache: false,
          });
        }
      }

      throw error;
    } finally {
      if (isActiveLoadToken(loadToken)) {
        setLoading?.(false);
        setRefreshing?.(false);
      }
    }
  })();

  setInflightLoad?.(task);

  try {
    return await task;
  } finally {
    if (getInflightLoad?.() === task) {
      clearInflightLoad?.();
    }
  }
}

export const listUsuarios = loadUsuarios;

/* =========================================================
   DETAIL
========================================================= */

export async function loadUsuarioDetail(userId = "", options = {}) {
  const id = normalizeUsuarioId(userId);
  const cached =
    findUsuarioById?.(safeArray(getUsuarios?.()), id) ||
    getUsuarioByIdStore?.(id) ||
    null;

  if (options.cacheOnly === true) return cached;

  try {
    const detail = await getUsuarioByIdRequest(id, options);
    return syncUsuarioDetail(detail) || cached;
  } catch (error) {
    if (cached && options.allowCacheFallback !== false) return cached;
    throw error;
  }
}

export const getUsuarioById = loadUsuarioDetail;

/* =========================================================
   CREATE / UPDATE / DELETE
========================================================= */

export async function createUsuario(payload = {}, options = {}) {
  const created = await createUsuarioRequest(payload, options);
  const detail = normalizeDetailResponse(created) || (looksLikeUsuario(created) ? created : null);

  if (!detail) {
    throw new Error("USUARIO_CREATE_INVALID_RESPONSE");
  }

  return syncUsuarioDetail(detail, { incrementRemote: true });
}

export async function updateUsuario(id = "", payload = {}, options = {}) {
  const userId = normalizeUsuarioId(id);
  const updated = await updateUsuarioRequest(userId, payload, options);
  const detail = normalizeDetailResponse(updated) || (looksLikeUsuario(updated) ? updated : null);

  if (detail) {
    return syncUsuarioDetail(detail);
  }

  return loadUsuarioDetail(userId, {
    ...options,
    dedupe: false,
    allowCacheFallback: true,
  });
}

export async function deleteUsuario(id = "", options = {}) {
  const userId = normalizeUsuarioId(id);
  const response = await deleteUsuarioRequest(userId, options);

  const previousRemote = Math.max(0, number(usuariosState?.remoteCount, 0));
  const remaining = dedupeUsuarios(normalizeUsuariosSafe(safeArray(getUsuarios?.()))).filter(
    (item) => getUsuarioStableId(item) !== userId
  );

  syncUsuariosCollection({
    items: remaining,
    remoteCount: Math.max(remaining.length, previousRemote - 1),
    lastSyncAt: Date.now(),
    writeCache: true,
  });

  return response;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getUsuariosApiSnapshot() {
  return {
    version: USUARIOS_API_VERSION,
    endpoint: USUARIOS_ENDPOINT,
    loading: Boolean(usuariosState?.loading),
    refreshing: Boolean(usuariosState?.refreshing),
    loaded: Boolean(usuariosState?.loaded),
    hydrated: Boolean(usuariosState?.hydrated),
    items: safeArray(getUsuarios?.()).length,
    remoteCount: Math.max(0, number(usuariosState?.remoteCount, 0)),
    lastLoadedAt,
    lastResponseMeta,
    lastError: lastError ? safeError(lastError) : "",
    inflightDetailCount: detailInflight.size,
    policy: {
      httpSingle: true,
      noFetchOwn: true,
      noDuplicateMutations: true,
      continuationToken: true,
      raceProtected: true,
      cacheFallback: true,
      malformedEmptyProtection: true,
    },
  };
}

/* =========================================================
   STORE / MODEL COMPAT EXPORTS
========================================================= */

export {
  usuariosState,
  getUsuarios,
  replaceUsuariosStore,
  upsertUsuarioStore,
  getUsuarioByIdStore,
  findUsuarioById,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  unwrapUsuariosPayload,
};

export function getUsuariosStateSnapshot() {
  return {
    ...usuariosState,
    items: safeArray(usuariosState.items),
    storeItems: safeArray(usuariosStore).length,
    lastError: lastError ? safeError(lastError) : "",
  };
}

export function getUsuariosStoreSnapshot() {
  return {
    items: safeArray(usuariosStore),
    count: safeArray(usuariosStore).length,
    remoteCount: Math.max(number(usuariosState.remoteCount, 0), safeArray(usuariosStore).length),
    lastSyncAt: usuariosState.lastSyncAt || 0,
  };
}

export function getUsuariosCount() {
  return safeArray(usuariosStore).length;
}

export function hasUsuarios() {
  return getUsuariosCount() > 0;
}

export function getSortedUsuariosStore() {
  return [...safeArray(usuariosStore)].sort((a, b) => {
    const diff = toTimestamp(first(b.updatedAt, b.lastActivityAt, b.lastLoginAt, b.createdAt)) -
      toTimestamp(first(a.updatedAt, a.lastActivityAt, a.lastLoginAt, a.createdAt));

    if (diff !== 0) return diff;

    return cleanText(getUsuarioStableId(b), "").localeCompare(cleanText(getUsuarioStableId(a), ""), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function statusBucket(item = {}) {
  const status = normalizeStatusValue(first(item.status, item.estado, item.state), item);
  if (status === "pending") return "pending";
  if (["blocked", "inactive"].includes(status)) return "blocked";
  return "active";
}

export function paginateUsuarios(items = [], { page = 1, pageSize = 5 } = {}) {
  const rows = safeArray(items);
  const size = clamp(pageSize, 1, 100);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const currentPage = clamp(page, 1, totalPages);
  const start = (currentPage - 1) * size;

  return {
    items: rows.slice(start, start + size),
    page: currentPage,
    pageSize: size,
    total: rows.length,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

export function computeUsuariosStats(items = []) {
  return safeArray(items).reduce((acc, item) => {
    acc.total += 1;

    const bucket = statusBucket(item);
    if (bucket === "active") acc.activeCount += 1;
    if (bucket === "pending") acc.pendingCount += 1;
    if (bucket === "blocked") acc.blockedCount += 1;
    if (toTimestamp(first(item.lastLoginAt, item.lastAccessAt, item.ultimoAcceso))) acc.withAccessCount += 1;

    return acc;
  }, {
    total: 0,
    activeCount: 0,
    pendingCount: 0,
    blockedCount: 0,
    withAccessCount: 0,
  });
}

export function clearUsuariosCache() {
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

  try {
    if (isStorageAvailable()) window.localStorage.removeItem(USUARIOS_CACHE_KEY);
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  version: USUARIOS_API_VERSION,

  fetchUsuariosRequest,
  getUsuarioByIdRequest,
  createUsuarioRequest,
  updateUsuarioRequest,
  deleteUsuarioRequest,

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
};

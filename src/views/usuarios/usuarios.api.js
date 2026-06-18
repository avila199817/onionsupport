/* =========================================================
   Onion Support - Usuarios API
   Archivo: /src/views/usuarios/usuarios.api.js

   PRODUCTIVO · HTTP ÚNICO · LÓGICA FACTURAS · 10/10

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
   - Sincronización compatible con usuarios.state/store/model.
========================================================= */

import Http from "../../core/http.js";

import {
  usuariosState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

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

  writeCachePayload,
  hydrateStateFromCache,
} from "./usuarios.state.js";

import {
  getUsuarios,
  replaceUsuariosStore,
  upsertUsuarioStore,
  getUsuarioByIdStore,
} from "./usuarios.store.js";

import {
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  unwrapUsuariosPayload,
  findUsuarioById,
} from "./usuarios.model.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const USUARIOS_API_VERSION =
  "usuarios.api.productive.v12.http-single.facturas-logic";

export const USUARIOS_ENDPOINT = "/api/users";

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
  return Array.isArray(value) ? value : [];
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

function first(...values) {
  for (const value of values.flat(Infinity)) {
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
};

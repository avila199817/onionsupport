/* =========================================================
   Onion SPA - Usuarios API
   Archivo: src/views/usuarios/usuarios.api.js

   FINAL PRO SYSTEM · USERS DOMAIN API · 10/10

   Responsabilidades:
   - cargar listado real de usuarios
   - consumir backend /api/users con contrato tolerante
   - aplicar estrategia cache-first inteligente
   - hidratar store del módulo
   - persistir cache local por usuario autenticado
   - tolerar payload plano / envuelto / legacy
   - preservar contrato esperado por template / view
   - evitar dobles fetch concurrentes
   - exponer helpers de stats, detalle, create y update
   - degradar con elegancia si falla backend
   - normalizar paginación, filtros, orden y errores
========================================================= */

import { AppCore } from "../../core/index.js";
import { Http } from "../../services/index.js";

import {
  USUARIOS_CACHE_KEY,
  USUARIOS_CACHE_TTL,
  USUARIOS_DEFAULT_PAGE,
  USUARIOS_DEFAULT_PAGE_SIZE,
  USUARIOS_DEFAULT_SORT_BY,
  USUARIOS_DEFAULT_SORT_DIR,
  USUARIOS_SOURCES,
} from "./usuarios.state.js";

import {
  beginUsuariosLoad,
  completeUsuariosLoad,
  rejectUsuariosLoad,
} from "./usuarios.store.js";

/* =========================================================
   INTERNAL
========================================================= */

const ENDPOINT = "/api/users";
const STATS_ENDPOINT = "/api/users/stats";
const META_ENDPOINT = "/api/users/_meta";

let inflightListLoad = null;

/* =========================================================
   BASICS
========================================================= */

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBool(value, fallback = false) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function safePositiveInt(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function nowMs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {
    console.warn(...args);
  }
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {
    console.error(...args);
  }
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, payload);
  } catch {}
}

function getStorageApi() {
  return AppCore?.storage || null;
}

function getCurrentUser() {
  return AppCore?.state?.user || null;
}

function getCurrentUserId() {
  const user = getCurrentUser();

  return (
    safeText(
      user?.userId ||
        user?.id,
      ""
    ) || null
  );
}

function getHttpClient() {
  if (Http && typeof Http.get === "function") {
    return Http;
  }

  if (
    AppCore?.apiClient &&
    typeof AppCore.apiClient.get === "function"
  ) {
    return AppCore.apiClient;
  }

  if (
    AppCore?.request &&
    typeof AppCore.request === "function"
  ) {
    return {
      get(path, options = {}) {
        return AppCore.request(path, {
          ...options,
          method: "GET",
        });
      },
      post(path, body, options = {}) {
        return AppCore.request(path, {
          ...options,
          method: "POST",
          body,
        });
      },
      put(path, body, options = {}) {
        return AppCore.request(path, {
          ...options,
          method: "PUT",
          body,
        });
      },
      delete(path, options = {}) {
        return AppCore.request(path, {
          ...options,
          method: "DELETE",
        });
      },
    };
  }

  return null;
}

function isFreshTimestamp(savedAt = 0, ttl = USUARIOS_CACHE_TTL) {
  return (
    safeNumber(savedAt, 0) > 0 &&
    nowMs() - safeNumber(savedAt, 0) <= safeNumber(ttl, 0)
  );
}

function joinSearchParams(params = {}) {
  const query = new URLSearchParams();

  Object.entries(safeObject(params)).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === "string" && !value.trim()) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const text = safeText(entry, "");
        if (text) {
          query.append(key, text);
        }
      });
      return;
    }

    query.set(key, String(value));
  });

  const built = query.toString();
  return built ? `?${built}` : "";
}

function normalizeSortDir(value = USUARIOS_DEFAULT_SORT_DIR) {
  const dir = safeText(value, USUARIOS_DEFAULT_SORT_DIR).toLowerCase();
  return dir === "asc" ? "asc" : "desc";
}

function normalizeListParams(params = {}) {
  const source = safeObject(params);

  return {
    page: safePositiveInt(
      source.page,
      safePositiveInt(USUARIOS_DEFAULT_PAGE, 1)
    ),
    pageSize: safePositiveInt(
      source.pageSize,
      safePositiveInt(USUARIOS_DEFAULT_PAGE_SIZE, 20)
    ),
    sortBy: safeText(
      source.sortBy,
      safeText(USUARIOS_DEFAULT_SORT_BY, "createdAt")
    ),
    sortDir: normalizeSortDir(source.sortDir),
    q: safeText(source.q || source.search || source.query, ""),
    role: safeText(source.role, ""),
    status: safeText(source.status, ""),
    includeStats: safeBool(source.includeStats, false),
  };
}

function buildListRequestPath(params = {}) {
  const normalized = normalizeListParams(params);

  return `${ENDPOINT}${joinSearchParams({
    page: normalized.page,
    pageSize: normalized.pageSize,
    sortBy: normalized.sortBy,
    sortDir: normalized.sortDir,
    q: normalized.q || undefined,
    role: normalized.role || undefined,
    status: normalized.status || undefined,
  })}`;
}

/* =========================================================
   CACHE
========================================================= */

function buildCachePayload(payload = {}) {
  const source = safeObject(payload);

  return {
    savedAt: nowMs(),
    userId: getCurrentUserId(),
    params: clone(source.params || {}),
    list: clone(source.list || createFallbackListResult()),
  };
}

function buildCacheKey(params = {}) {
  const normalized = normalizeListParams(params);

  return `${USUARIOS_CACHE_KEY}::${JSON.stringify({
    page: normalized.page,
    pageSize: normalized.pageSize,
    sortBy: normalized.sortBy,
    sortDir: normalized.sortDir,
    q: normalized.q,
    role: normalized.role,
    status: normalized.status,
  })}`;
}

function saveCache(payload = {}) {
  try {
    const storage = getStorageApi();

    if (!storage || typeof storage.set !== "function") {
      return false;
    }

    const params = normalizeListParams(payload.params);
    const cacheKey = buildCacheKey(params);

    storage.set(
      cacheKey,
      buildCachePayload({
        params,
        list: payload.list,
      })
    );

    return true;
  } catch (error) {
    safeWarn("[UsuariosAPI] saveCache warning", error);
    return false;
  }
}

function clearCache(params = null) {
  try {
    const storage = getStorageApi();

    if (!storage || typeof storage.remove !== "function") {
      return false;
    }

    if (params) {
      storage.remove(buildCacheKey(params));
      return true;
    }

    if (typeof storage.keys === "function") {
      const keys = safeArray(storage.keys());

      keys
        .filter((key) => safeText(key, "").startsWith(`${USUARIOS_CACHE_KEY}::`))
        .forEach((key) => {
          try {
            storage.remove(key);
          } catch {}
        });

      return true;
    }

    storage.remove(USUARIOS_CACHE_KEY);
    return true;
  } catch (error) {
    safeWarn("[UsuariosAPI] clearCache warning", error);
    return false;
  }
}

function readCache(params = {}) {
  try {
    const storage = getStorageApi();

    if (!storage || typeof storage.get !== "function") {
      return null;
    }

    const normalizedParams = normalizeListParams(params);
    const payload = safeObject(
      storage.get(buildCacheKey(normalizedParams))
    );

    const savedAt = safeNumber(payload.savedAt, 0);
    const list = safeObject(payload.list);
    const cachedUserId = safeText(payload.userId, "") || null;
    const currentUserId = getCurrentUserId();

    if (!savedAt || !Object.keys(list).length) {
      clearCache(normalizedParams);
      return null;
    }

    if (
      currentUserId &&
      cachedUserId &&
      cachedUserId !== currentUserId
    ) {
      clearCache(normalizedParams);
      return null;
    }

    return {
      savedAt,
      userId: cachedUserId,
      params: normalizedParams,
      list,
      isFresh: isFreshTimestamp(savedAt, USUARIOS_CACHE_TTL),
      isStale: !isFreshTimestamp(savedAt, USUARIOS_CACHE_TTL),
    };
  } catch (error) {
    safeWarn("[UsuariosAPI] readCache warning", error);
    clearCache(params);
    return null;
  }
}

/* =========================================================
   USERS NORMALIZATION
========================================================= */

function createBaseMeta(params = {}) {
  const normalized = normalizeListParams(params);

  return {
    page: normalized.page,
    pageSize: normalized.pageSize,
    total: 0,
    totalPages: 0,
    count: 0,
    hasNextPage: false,
    hasPrevPage: normalized.page > 1,
    sortBy: normalized.sortBy,
    sortDir: normalized.sortDir,
    q: normalized.q,
    role: normalized.role,
    status: normalized.status,
  };
}

function createBaseStats() {
  return {
    total: 0,
    admins: 0,
    active: 0,
    inactive: 0,
    withAvatar: 0,
  };
}

function createFallbackListResult(params = {}) {
  return {
    rows: [],
    meta: createBaseMeta(params),
    stats: createBaseStats(),
    alerts: [
      {
        level: "info",
        code: "USUARIOS_FALLBACK",
        message: "Listado local cargado sin datos remotos.",
      },
    ],
    sourceDetails: {
      endpoint: ENDPOINT,
      contract: "fallback",
    },
    generatedAt: nowIso(),
  };
}

function safeEmail(value, fallback = "") {
  const text = safeText(value, fallback);
  return text.toLowerCase();
}

function getDisplayName(user = {}) {
  const source = safeObject(user);

  return (
    safeText(source.displayName, "") ||
    safeText(source.nombreCompleto, "") ||
    safeText(source.fullName, "") ||
    safeText(source.name, "") ||
    safeText(
      `${safeText(source.firstName, "")} ${safeText(source.lastName, "")}`,
      ""
    ) ||
    safeText(source.username, "") ||
    safeText(source.email, "") ||
    "Usuario"
  );
}

function getUserRole(user = {}) {
  const source = safeObject(user);
  return safeText(
    source.role ||
      source.rol ||
      source.userRole,
    "user"
  ).toLowerCase();
}

function getUserStatus(user = {}) {
  const source = safeObject(user);

  const raw =
    safeText(
      source.status ||
        source.estado ||
        (safeBool(source.active, false) ? "active" : "") ||
        (safeBool(source.isActive, false) ? "active" : ""),
      ""
    ).toLowerCase();

  if (
    raw === "activo" ||
    raw === "active" ||
    raw === "enabled" ||
    raw === "habilitado"
  ) {
    return "active";
  }

  if (
    raw === "inactive" ||
    raw === "inactivo" ||
    raw === "disabled" ||
    raw === "deshabilitado"
  ) {
    return "inactive";
  }

  if (
    raw === "pending" ||
    raw === "pendiente"
  ) {
    return "pending";
  }

  if (
    raw === "blocked" ||
    raw === "bloqueado"
  ) {
    return "blocked";
  }

  return raw || "unknown";
}

function normalizeUserRow(user = {}, index = 0) {
  const source = safeObject(user);

  const id =
    safeText(
      source.userId ||
        source.id,
      ""
    ) || `user-${index + 1}`;

  const username = safeText(
    source.username ||
      source.userName ||
      source.nick,
    ""
  );

  const email = safeEmail(
    source.email ||
      source.mail,
    ""
  );

  const role = getUserRole(source);
  const status = getUserStatus(source);

  const avatar =
    safeText(
      source.avatar ||
        source.avatarUrl ||
        source.photoURL ||
        source.photoUrl,
      ""
    ) || "";

  const hasAvatar =
    safeBool(
      source.hasAvatar,
      Boolean(avatar)
    ) || Boolean(avatar);

  const createdAt = safeText(
    source.createdAt ||
      source.created_at,
    ""
  );

  const updatedAt = safeText(
    source.updatedAt ||
      source.updated_at,
    createdAt
  );

  return {
    id,
    userId: id,
    username,
    displayName: getDisplayName(source),
    email,
    role,
    status,
    avatar,
    hasAvatar,
    phone: safeText(
      source.phone ||
        source.telefono,
      ""
    ),
    emailVerified: safeBool(
      source.emailVerified,
      safeBool(source.isEmailVerified, false)
    ),
    lastLoginAt: safeText(
      source.lastLoginAt ||
        source.last_login_at,
      ""
    ),
    createdAt,
    updatedAt,
    raw: clone(source),
  };
}

function normalizeUsersStats(rows = []) {
  const list = safeArray(rows);

  return list.reduce(
    (acc, row) => {
      const item = safeObject(row);

      acc.total += 1;

      if (safeText(item.role, "").toLowerCase() === "admin") {
        acc.admins += 1;
      }

      if (safeText(item.status, "") === "active") {
        acc.active += 1;
      }

      if (safeText(item.status, "") === "inactive") {
        acc.inactive += 1;
      }

      if (item.hasAvatar === true) {
        acc.withAvatar += 1;
      }

      return acc;
    },
    createBaseStats()
  );
}

function looksLikeUsersListPayload(value = {}) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj.items) ||
      Array.isArray(obj.rows) ||
      Array.isArray(obj.users) ||
      Array.isArray(obj.data) ||
      Array.isArray(obj.results) ||
      obj.total !== undefined ||
      obj.page !== undefined ||
      obj.pageSize !== undefined ||
      obj.count !== undefined
  );
}

function unwrapUsersPayload(payload = {}) {
  const raw = safeObject(payload);

  if (looksLikeUsersListPayload(raw)) {
    return raw;
  }

  const data = safeObject(raw.data);
  if (looksLikeUsersListPayload(data)) {
    return data;
  }

  const nestedData = safeObject(data.data);
  if (looksLikeUsersListPayload(nestedData)) {
    return nestedData;
  }

  const result = safeObject(raw.result);
  if (looksLikeUsersListPayload(result)) {
    return result;
  }

  const users = safeObject(raw.users);
  if (looksLikeUsersListPayload(users)) {
    return users;
  }

  return {};
}

function extractUsersRows(source = {}) {
  const payload = safeObject(source);

  return (
    safeArray(payload.items).length
      ? safeArray(payload.items)
      : safeArray(payload.rows).length
      ? safeArray(payload.rows)
      : safeArray(payload.users).length
      ? safeArray(payload.users)
      : safeArray(payload.results).length
      ? safeArray(payload.results)
      : Array.isArray(payload.data)
      ? safeArray(payload.data)
      : []
  );
}

function normalizeUsersList(payload = {}, params = {}) {
  const source = unwrapUsersPayload(payload);
  const normalizedParams = normalizeListParams(params);

  const rawRows = extractUsersRows(source);
  const rows = rawRows
    .map(normalizeUserRow)
    .filter(Boolean);

  const rawTotal = safePositiveInt(
    source.total ??
      source.totalItems ??
      source.totalCount ??
      source.count ??
      rows.length,
    rows.length
  );

  const page = safePositiveInt(
    source.page,
    normalizedParams.page
  );

  const pageSize = safePositiveInt(
    source.pageSize ??
      source.limit,
    normalizedParams.pageSize
  );

  const totalPages =
    safePositiveInt(
      source.totalPages,
      pageSize > 0
        ? Math.ceil(rawTotal / pageSize)
        : 0
    );

  const meta = {
    page,
    pageSize,
    total: rawTotal,
    totalPages,
    count: rows.length,
    hasNextPage:
      safeBool(
        source.hasNextPage,
        page < totalPages
      ),
    hasPrevPage:
      safeBool(
        source.hasPrevPage,
        page > 1
      ),
    sortBy: safeText(
      source.sortBy,
      normalizedParams.sortBy
    ),
    sortDir: normalizeSortDir(
      source.sortDir || normalizedParams.sortDir
    ),
    q: normalizedParams.q,
    role: normalizedParams.role,
    status: normalizedParams.status,
  };

  const alerts = safeArray(source.alerts).map((item, index) => ({
    level: safeText(item?.level, "info"),
    code: safeText(item?.code, `USERS_ALERT_${index + 1}`),
    message: safeText(item?.message, "Aviso"),
  }));

  const computedStats = normalizeUsersStats(rows);

  const stats = {
    total: safePositiveInt(
      source?.stats?.total,
      safePositiveInt(source.total, computedStats.total)
    ),
    admins: safePositiveInt(
      source?.stats?.admins,
      computedStats.admins
    ),
    active: safePositiveInt(
      source?.stats?.active,
      computedStats.active
    ),
    inactive: safePositiveInt(
      source?.stats?.inactive,
      computedStats.inactive
    ),
    withAvatar: safePositiveInt(
      source?.stats?.withAvatar,
      computedStats.withAvatar
    ),
  };

  return {
    rows,
    meta,
    stats,
    alerts,
    sourceDetails: {
      endpoint: ENDPOINT,
      contract:
        rows.length > 0
          ? "remote:list"
          : "remote:empty",
    },
    generatedAt: nowIso(),
  };
}

function normalizeStatsPayload(payload = {}) {
  const source = safeObject(
    payload?.data || payload
  );

  return {
    ok: safeBool(source.ok, true),
    total: safePositiveInt(source.total, 0),
  };
}

function normalizeMetaPayload(payload = {}) {
  const source = safeObject(payload?.data || payload);

  return {
    ok: safeBool(source.ok, true),
    scope: safeText(source.scope, "users"),
    basePathHint: safeText(source.basePathHint, ENDPOINT),
    endpoints: safeObject(source.endpoints),
    authenticatedUserId: safeText(
      source.authenticatedUserId,
      ""
    ) || null,
    timestamp: safeText(source.timestamp, nowIso()),
  };
}

function normalizeSingleUser(payload = {}) {
  const source = safeObject(payload?.data || payload);

  if (source.user && typeof source.user === "object") {
    return normalizeUserRow(source.user);
  }

  return normalizeUserRow(source);
}

/* =========================================================
   FALLBACK / REMOTE
========================================================= */

function buildLocalListResult(params = {}) {
  const appName = safeText(
    AppCore?.config?.appName,
    "Onion Support"
  );

  const fallback = createFallbackListResult(params);

  fallback.alerts = [
    {
      level: "info",
      code: "LOCAL_USERS_LIST",
      message: `${appName} operativo sin listado remoto de usuarios.`,
    },
  ];

  fallback.sourceDetails = {
    endpoint: ENDPOINT,
    contract: "fallback:local",
  };

  return fallback;
}

function getErrorStatus(error) {
  return safePositiveInt(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status,
    0
  );
}

function isNotFoundError(error) {
  return getErrorStatus(error) === 404;
}

function normalizeError(error) {
  const source = safeObject(error);

  return {
    name: safeText(source.name, "Error"),
    code: safeText(
      source.code ||
        source.error ||
        source.type,
      "UNKNOWN_ERROR"
    ),
    message: safeText(
      source.message ||
        source?.data?.error ||
        source?.data?.message,
      "Ha ocurrido un error."
    ),
    status: getErrorStatus(source),
    data: safeObject(source.data),
    raw: source,
  };
}

async function fetchRemoteUsersList(params = {}) {
  const client = getHttpClient();

  if (!client) {
    const error = new Error("No hay cliente HTTP disponible.");

    return {
      ok: false,
      remoteOk: false,
      degraded: true,
      source: USUARIOS_SOURCES.FALLBACK_LOCAL,
      list: buildLocalListResult(params),
      error,
    };
  }

  const requestPath = buildListRequestPath(params);

  try {
    safeLog("[UsuariosAPI] list request", {
      endpoint: requestPath,
      params: normalizeListParams(params),
    });

    const response = await client.get(requestPath, {
      auth: true,
      retries: 1,
    });

    const data = safeObject(response?.data || response);
    const list = normalizeUsersList(data, params);

    return {
      ok: true,
      remoteOk: true,
      degraded: false,
      source: USUARIOS_SOURCES.REMOTE,
      list,
      error: null,
    };
  } catch (error) {
    const normalizedError = normalizeError(error);

    safeWarn("[UsuariosAPI] remote users list unavailable", normalizedError);

    return {
      ok: false,
      remoteOk: false,
      degraded: true,
      source: USUARIOS_SOURCES.FALLBACK_LOCAL,
      list: buildLocalListResult(params),
      error: normalizedError,
      notFound: isNotFoundError(normalizedError),
    };
  }
}

/* =========================================================
   STORE HYDRATION
========================================================= */

function hydrateListIntoStore({
  list,
  params = {},
  source = USUARIOS_SOURCES.IDLE,
  remoteOk = false,
  degraded = false,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
  error = null,
} = {}) {
  completeUsuariosLoad({
    rows: safeArray(list?.rows),
    meta: safeObject(list?.meta),
    stats: safeObject(list?.stats),
    alerts: safeArray(list?.alerts),
    source,
    remoteOk: remoteOk === true,
    degraded: degraded === true,
    syncedAt: safeText(syncedAt, nowIso()),
    hydratedAt: safeText(hydratedAt, nowIso()),
    cacheHit: cacheHit === true,
    params: normalizeListParams(params),
    error: error || null,
  });
}

/* =========================================================
   LOADERS
========================================================= */

export async function loadUsuariosList(options = {}) {
  const source = safeObject(options);
  const params = normalizeListParams(source);
  const force = safeBool(source.force, false);
  const preferCache = safeBool(
    source.preferCache,
    true
  );

  if (inflightListLoad) {
    return inflightListLoad;
  }

  inflightListLoad = (async () => {
    beginUsuariosLoad(params);

    try {
      const cached = readCache(params);

      if (
        force !== true &&
        preferCache === true &&
        cached?.isFresh &&
        cached?.list
      ) {
        const list = normalizeUsersList(cached.list, params);
        const hydratedAt = nowIso();

        hydrateListIntoStore({
          list,
          params,
          source: USUARIOS_SOURCES.CACHE_FRESH,
          remoteOk: false,
          degraded: false,
          syncedAt: new Date(cached.savedAt).toISOString(),
          hydratedAt,
          cacheHit: true,
        });

        safeEmit("usuarios:list:loaded", {
          source: USUARIOS_SOURCES.CACHE_FRESH,
          cachedAt: cached.savedAt,
          params,
          remoteOk: false,
          degraded: false,
        });

        return {
          ok: true,
          source: USUARIOS_SOURCES.CACHE_FRESH,
          remoteOk: false,
          degraded: false,
          cacheHit: true,
          list,
          error: null,
        };
      }

      const remote = await fetchRemoteUsersList(params);

      if (remote.remoteOk !== true && cached?.list) {
        const list = normalizeUsersList(cached.list, params);
        const hydratedAt = nowIso();

        hydrateListIntoStore({
          list,
          params,
          source: USUARIOS_SOURCES.CACHE_STALE,
          remoteOk: false,
          degraded: true,
          syncedAt: new Date(cached.savedAt).toISOString(),
          hydratedAt,
          cacheHit: true,
          error: remote.error || null,
        });

        safeEmit("usuarios:list:loaded", {
          source: USUARIOS_SOURCES.CACHE_STALE,
          cachedAt: cached.savedAt,
          params,
          remoteOk: false,
          degraded: true,
          error: remote.error || null,
        });

        return {
          ok: true,
          source: USUARIOS_SOURCES.CACHE_STALE,
          remoteOk: false,
          degraded: true,
          cacheHit: true,
          list,
          error: remote.error || null,
        };
      }

      const list = normalizeUsersList(remote.list, params);
      const syncedAt =
        remote.source === USUARIOS_SOURCES.REMOTE
          ? nowIso()
          : list.generatedAt || nowIso();

      const hydratedAt = nowIso();

      hydrateListIntoStore({
        list,
        params,
        source: remote.source,
        remoteOk: remote.remoteOk === true,
        degraded: remote.degraded === true,
        syncedAt,
        hydratedAt,
        cacheHit: false,
        error: remote.error || null,
      });

      if (remote.source === USUARIOS_SOURCES.REMOTE) {
        saveCache({
          params,
          list,
        });
      }

      safeEmit("usuarios:list:loaded", {
        source: remote.source,
        ok: remote.ok === true,
        remoteOk: remote.remoteOk === true,
        degraded: remote.degraded === true,
        params,
        error: remote.error || null,
      });

      return {
        ok: true,
        source: remote.source,
        remoteOk: remote.remoteOk === true,
        degraded: remote.degraded === true,
        cacheHit: false,
        list,
        error: remote.error || null,
      };
    } catch (error) {
      safeError("[UsuariosAPI] loadUsuariosList error", error);

      rejectUsuariosLoad(error);

      return {
        ok: false,
        source: USUARIOS_SOURCES.ERROR,
        remoteOk: false,
        degraded: true,
        cacheHit: false,
        error,
        list: null,
      };
    } finally {
      inflightListLoad = null;
    }
  })();

  return inflightListLoad;
}

export async function refreshUsuariosList(params = {}) {
  return loadUsuariosList({
    ...safeObject(params),
    force: true,
    preferCache: false,
  });
}

export function getCachedUsuariosList(params = {}) {
  const cached = readCache(params);

  if (!cached?.list) {
    return null;
  }

  return normalizeUsersList(cached.list, params);
}

export function primeUsuariosCache(list = {}, params = {}) {
  const normalizedList = normalizeUsersList(list, params);

  saveCache({
    params,
    list: normalizedList,
  });

  return normalizedList;
}

export function clearUsuariosCache(params = null) {
  return clearCache(params);
}

/* =========================================================
   STATS / META / DETAIL
========================================================= */

export async function fetchUsuariosStats() {
  const client = getHttpClient();

  if (!client) {
    return {
      ok: false,
      error: normalizeError(
        new Error("No hay cliente HTTP disponible.")
      ),
      stats: createBaseStats(),
    };
  }

  try {
    const response = await client.get(STATS_ENDPOINT, {
      auth: true,
      retries: 1,
    });

    const normalized = normalizeStatsPayload(response?.data || response);

    return {
      ok: true,
      error: null,
      stats: {
        ...createBaseStats(),
        total: normalized.total,
      },
    };
  } catch (error) {
    const normalizedError = normalizeError(error);

    safeWarn("[UsuariosAPI] fetchUsuariosStats warning", normalizedError);

    return {
      ok: false,
      error: normalizedError,
      stats: createBaseStats(),
    };
  }
}

export async function fetchUsuariosMeta() {
  const client = getHttpClient();

  if (!client) {
    return {
      ok: false,
      error: normalizeError(
        new Error("No hay cliente HTTP disponible.")
      ),
      meta: null,
    };
  }

  try {
    const response = await client.get(META_ENDPOINT, {
      auth: true,
      retries: 1,
    });

    return {
      ok: true,
      error: null,
      meta: normalizeMetaPayload(response?.data || response),
    };
  } catch (error) {
    const normalizedError = normalizeError(error);

    safeWarn("[UsuariosAPI] fetchUsuariosMeta warning", normalizedError);

    return {
      ok: false,
      error: normalizedError,
      meta: null,
    };
  }
}

export async function getUsuarioById(userId) {
  const id = safeText(userId, "");
  const client = getHttpClient();

  if (!id) {
    return {
      ok: false,
      error: {
        code: "INVALID_USER_ID",
        message: "userId inválido.",
        status: 400,
      },
      user: null,
    };
  }

  if (!client) {
    return {
      ok: false,
      error: normalizeError(
        new Error("No hay cliente HTTP disponible.")
      ),
      user: null,
    };
  }

  try {
    const response = await client.get(`${ENDPOINT}/${encodeURIComponent(id)}`, {
      auth: true,
      retries: 1,
    });

    return {
      ok: true,
      error: null,
      user: normalizeSingleUser(response?.data || response),
    };
  } catch (error) {
    const normalizedError = normalizeError(error);

    safeWarn("[UsuariosAPI] getUsuarioById warning", normalizedError);

    return {
      ok: false,
      error: normalizedError,
      user: null,
    };
  }
}

/* =========================================================
   CREATE / UPDATE
========================================================= */

function buildCreatePayload(payload = {}) {
  const source = safeObject(payload);

  return {
    username: safeText(source.username, ""),
    email: safeEmail(source.email, ""),
    role: safeText(source.role, "user"),
    displayName: safeText(
      source.displayName ||
        source.name,
      ""
    ),
    phone: safeText(source.phone, ""),
    password: safeText(source.password, ""),
  };
}

function buildUpdatePayload(payload = {}) {
  const source = safeObject(payload);

  return {
    username: safeText(source.username, ""),
    email: safeEmail(source.email, ""),
    role: safeText(source.role, ""),
    displayName: safeText(
      source.displayName ||
        source.name,
      ""
    ),
    phone: safeText(source.phone, ""),
    status: safeText(source.status, ""),
  };
}

function compactObject(value = {}) {
  return Object.entries(safeObject(value)).reduce((acc, [key, entry]) => {
    if (entry === null || entry === undefined) {
      return acc;
    }

    if (typeof entry === "string" && !entry.trim()) {
      return acc;
    }

    acc[key] = entry;
    return acc;
  }, {});
}

export async function createUsuario(payload = {}) {
  const client = getHttpClient();

  if (!client || typeof client.post !== "function") {
    return {
      ok: false,
      error: normalizeError(
        new Error("No hay cliente HTTP disponible.")
      ),
      user: null,
    };
  }

  try {
    const body = compactObject(buildCreatePayload(payload));

    const response = await client.post(ENDPOINT, body, {
      auth: true,
      retries: 0,
    });

    clearUsuariosCache();

    return {
      ok: true,
      error: null,
      user: normalizeSingleUser(response?.data || response),
      data: safeObject(response?.data || response),
    };
  } catch (error) {
    const normalizedError = normalizeError(error);

    safeWarn("[UsuariosAPI] createUsuario warning", normalizedError);

    return {
      ok: false,
      error: normalizedError,
      user: null,
    };
  }
}

export async function updateUsuario(userId, payload = {}) {
  const id = safeText(userId, "");
  const client = getHttpClient();

  if (!id) {
    return {
      ok: false,
      error: {
        code: "INVALID_USER_ID",
        message: "userId inválido.",
        status: 400,
      },
      user: null,
    };
  }

  if (!client || typeof client.put !== "function") {
    return {
      ok: false,
      error: normalizeError(
        new Error("No hay cliente HTTP disponible.")
      ),
      user: null,
    };
  }

  try {
    const body = compactObject(buildUpdatePayload(payload));

    const response = await client.put(
      `${ENDPOINT}/${encodeURIComponent(id)}`,
      body,
      {
        auth: true,
        retries: 0,
      }
    );

    clearUsuariosCache();

    return {
      ok: true,
      error: null,
      user: normalizeSingleUser(response?.data || response),
      data: safeObject(response?.data || response),
    };
  } catch (error) {
    const normalizedError = normalizeError(error);

    safeWarn("[UsuariosAPI] updateUsuario warning", normalizedError);

    return {
      ok: false,
      error: normalizedError,
      user: null,
    };
  }
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const UsuariosAPI = {
  loadUsuariosList,
  refreshUsuariosList,
  getCachedUsuariosList,
  primeUsuariosCache,
  clearUsuariosCache,
  fetchUsuariosStats,
  fetchUsuariosMeta,
  getUsuarioById,
  createUsuario,
  updateUsuario,
};

export default UsuariosAPI;

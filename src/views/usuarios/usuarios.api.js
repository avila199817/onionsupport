/* =========================================================
   Onion SPA - Usuarios API
   Archivo: src/views/usuarios/usuarios.api.js

   FINAL PRO SYSTEM · ADMIN USERS API · 10/10

   Responsabilidades:
   - cargar listado real de usuarios de la plataforma
   - consumir endpoint admin de usuarios
   - soportar backend plano o envuelto
   - normalizar contrato para store / template / view
   - aplicar estrategia cache-first opcional
   - soportar búsqueda, paginación y refresh
   - evitar dobles fetch concurrentes
   - exponer stats útiles para panel admin
   - diferenciar source real remote / cache:fresh / cache:stale / fallback:local
========================================================= */

import { AppCore } from "../../core/index.js";
import { Http } from "../../services/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const ENDPOINT = "/api/users";
const USUARIOS_CACHE_KEY =
  "onion.usuarios.list";
const USUARIOS_CACHE_TTL =
  1000 * 60 * 3;

const USUARIOS_SOURCES =
  Object.freeze({
    IDLE: "idle",
    REMOTE: "remote",
    CACHE_FRESH: "cache:fresh",
    CACHE_STALE: "cache:stale",
    FALLBACK_LOCAL: "fallback:local",
    ERROR: "error",
  });

/* =========================================================
   INTERNAL
========================================================= */

const inflightRequests =
  new Map();

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

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(
  value,
  fallback = 0
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBool(
  value,
  fallback = false
) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function nowMs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }

  try {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
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

function getStorageApi() {
  return AppCore?.storage || null;
}

function getHttpClient() {
  if (
    Http &&
    typeof Http.get ===
      "function"
  ) {
    return Http;
  }

  if (
    AppCore?.apiClient &&
    typeof AppCore.apiClient.get ===
      "function"
  ) {
    return AppCore.apiClient;
  }

  if (
    AppCore?.request &&
    typeof AppCore.request ===
      "function"
  ) {
    return {
      get(path, options = {}) {
        return AppCore.request(path, {
          ...options,
          method: "GET",
        });
      },
    };
  }

  return null;
}

function isFreshTimestamp(
  savedAt = 0,
  ttl = USUARIOS_CACHE_TTL
) {
  return (
    safeNumber(savedAt, 0) > 0 &&
    nowMs() - safeNumber(savedAt, 0) <=
      safeNumber(ttl, 0)
  );
}

function normalizeQueryParams(
  options = {}
) {
  const source =
    safeObject(options);

  const page = Math.max(
    1,
    safeNumber(source.page, 1)
  );

  const pageSize = Math.max(
    1,
    safeNumber(
      source.pageSize ||
        source.limit,
      20
    )
  );

  const search = safeText(
    source.search ||
      source.q,
    ""
  );

  const role = safeText(
    source.role,
    ""
  );

  const status = safeText(
    source.status,
    ""
  );

  const sortBy = safeText(
    source.sortBy,
    "createdAt"
  );

  const sortDir =
    safeText(
      source.sortDir,
      "desc"
    ).toLowerCase() === "asc"
      ? "asc"
      : "desc";

  return {
    page,
    pageSize,
    search,
    role,
    status,
    sortBy,
    sortDir,
  };
}

function buildRequestKey(
  options = {}
) {
  const normalized =
    normalizeQueryParams(options);

  return JSON.stringify(
    normalized
  );
}

function buildQueryString(
  options = {}
) {
  const params =
    normalizeQueryParams(options);

  const query =
    new URLSearchParams();

  query.set(
    "page",
    String(params.page)
  );

  query.set(
    "pageSize",
    String(params.pageSize)
  );

  if (params.search) {
    query.set(
      "search",
      params.search
    );
  }

  if (params.role) {
    query.set("role", params.role);
  }

  if (params.status) {
    query.set(
      "status",
      params.status
    );
  }

  if (params.sortBy) {
    query.set(
      "sortBy",
      params.sortBy
    );
  }

  if (params.sortDir) {
    query.set(
      "sortDir",
      params.sortDir
    );
  }

  return query.toString();
}

/* =========================================================
   CACHE
========================================================= */

function buildCachePayload(
  options = {},
  data = {}
) {
  return {
    savedAt: nowMs(),
    requestKey:
      buildRequestKey(options),
    data: clone(data),
  };
}

function saveCache(
  options = {},
  data = {}
) {
  try {
    const storage =
      getStorageApi();

    if (
      !storage ||
      typeof storage.set !==
        "function"
    ) {
      return false;
    }

    storage.set(
      USUARIOS_CACHE_KEY,
      buildCachePayload(
        options,
        data
      )
    );

    return true;
  } catch (error) {
    safeWarn(
      "[UsuariosAPI] saveCache warning",
      error
    );
    return false;
  }
}

function clearCache() {
  try {
    const storage =
      getStorageApi();

    if (
      !storage ||
      typeof storage.remove !==
        "function"
    ) {
      return false;
    }

    storage.remove(
      USUARIOS_CACHE_KEY
    );

    return true;
  } catch (error) {
    safeWarn(
      "[UsuariosAPI] clearCache warning",
      error
    );
    return false;
  }
}

function readCache(
  options = {}
) {
  try {
    const storage =
      getStorageApi();

    if (
      !storage ||
      typeof storage.get !==
        "function"
    ) {
      return null;
    }

    const payload =
      safeObject(
        storage.get(
          USUARIOS_CACHE_KEY
        )
      );

    const savedAt =
      safeNumber(
        payload.savedAt,
        0
      );

    const requestKey =
      safeText(
        payload.requestKey,
        ""
      );

    const data =
      safeObject(payload.data);

    if (
      !savedAt ||
      !requestKey ||
      !Object.keys(data).length
    ) {
      clearCache();
      return null;
    }

    if (
      requestKey !==
      buildRequestKey(options)
    ) {
      return null;
    }

    return {
      savedAt,
      requestKey,
      data,
      isFresh:
        isFreshTimestamp(
          savedAt,
          USUARIOS_CACHE_TTL
        ),
      isStale:
        !isFreshTimestamp(
          savedAt,
          USUARIOS_CACHE_TTL
        ),
    };
  } catch (error) {
    safeWarn(
      "[UsuariosAPI] readCache warning",
      error
    );
    clearCache();
    return null;
  }
}

/* =========================================================
   RESPONSE SHAPE HELPERS
========================================================= */

function looksLikeUsersPayload(
  value = {}
) {
  const obj =
    safeObject(value);

  return Boolean(
    obj.items ||
      obj.users ||
      obj.rows ||
      obj.meta ||
      obj.pagination ||
      obj.stats
  );
}

function unwrapUsersPayload(
  payload = {}
) {
  const raw =
    safeObject(payload);

  if (
    looksLikeUsersPayload(raw)
  ) {
    return raw;
  }

  const rawData =
    safeObject(raw.data);

  if (
    looksLikeUsersPayload(rawData)
  ) {
    return rawData;
  }

  const rawDataData =
    safeObject(rawData.data);

  if (
    looksLikeUsersPayload(
      rawDataData
    )
  ) {
    return rawDataData;
  }

  const rawResult =
    safeObject(raw.result);

  if (
    looksLikeUsersPayload(
      rawResult
    )
  ) {
    return rawResult;
  }

  return {};
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function getUserDisplayName(
  user = {}
) {
  return safeText(
    user.displayName ||
      user.name ||
      user.fullName ||
      user.username ||
      user.email,
    "Usuario"
  );
}

function getUserEmail(
  user = {}
) {
  return safeText(
    user.email,
    ""
  );
}

function getUserRole(
  user = {}
) {
  return safeText(
    user.role ||
      user.rol,
    "user"
  ).toLowerCase();
}

function getUserStatus(
  user = {}
) {
  const raw = safeText(
    user.status,
    ""
  ).toLowerCase();

  if (
    raw === "active" ||
    raw === "activo"
  ) {
    return "active";
  }

  if (
    raw === "inactive" ||
    raw === "inactivo"
  ) {
    return "inactive";
  }

  if (
    raw === "blocked" ||
    raw === "bloqueado"
  ) {
    return "blocked";
  }

  if (
    raw === "pending" ||
    raw === "pendiente"
  ) {
    return "pending";
  }

  if (
    safeBool(
      user.isActive,
      false
    ) === true
  ) {
    return "active";
  }

  return raw || "unknown";
}

function normalizeUserItem(
  user,
  index = 0
) {
  const item =
    safeObject(user);

  const id =
    safeText(
      item.userId ||
        item.id ||
        item._id,
      ""
    ) || `user-${index + 1}`;

  const email =
    getUserEmail(item);

  const displayName =
    getUserDisplayName(item);

  const role =
    getUserRole(item);

  const status =
    getUserStatus(item);

  return {
    id,
    userId: id,
    username: safeText(
      item.username,
      ""
    ),
    displayName,
    name: displayName,
    email,
    phone: safeText(
      item.phone ||
        item.telefono,
      ""
    ),
    role,
    status,
    avatarUrl: safeText(
      item.avatarUrl ||
        item.avatar ||
        item.photoURL,
      ""
    ),
    createdAt: safeText(
      item.createdAt ||
        item.fechaAlta,
      ""
    ),
    updatedAt: safeText(
      item.updatedAt ||
        item.modifiedAt,
      ""
    ),
    lastLoginAt: safeText(
      item.lastLoginAt ||
        item.lastAccessAt,
      ""
    ),
    emailVerified: safeBool(
      item.emailVerified,
      false
    ),
    isActive:
      status === "active",
    raw: clone(item),
  };
}

function normalizeUsersList(
  payload = {}
) {
  const source =
    unwrapUsersPayload(
      payload
    );

  const rawItems =
    safeArray(source.items).length
      ? safeArray(source.items)
      : safeArray(source.users).length
      ? safeArray(source.users)
      : safeArray(source.rows);

  return rawItems
    .map(normalizeUserItem)
    .filter(Boolean);
}

function computeUsersStats(
  items = []
) {
  const rows =
    safeArray(items);

  let total = rows.length;
  let active = 0;
  let inactive = 0;
  let blocked = 0;
  let pending = 0;
  let admins = 0;

  rows.forEach((item) => {
    const role = safeText(
      item?.role,
      ""
    );
    const status = safeText(
      item?.status,
      ""
    );

    if (role === "admin") {
      admins += 1;
    }

    if (status === "active") {
      active += 1;
    } else if (
      status === "inactive"
    ) {
      inactive += 1;
    } else if (
      status === "blocked"
    ) {
      blocked += 1;
    } else if (
      status === "pending"
    ) {
      pending += 1;
    }
  });

  return {
    total,
    active,
    inactive,
    blocked,
    pending,
    admins,
  };
}

function normalizeMeta(
  payload = {},
  items = [],
  query = {}
) {
  const source =
    unwrapUsersPayload(
      payload
    );

  const pagination =
    safeObject(
      source.pagination ||
        source.meta
    );

  const total =
    safeNumber(
      pagination.total ||
        source.total ||
        items.length,
      items.length
    );

  const page = Math.max(
    1,
    safeNumber(
      pagination.page ||
        query.page,
      1
    )
  );

  const pageSize = Math.max(
    1,
    safeNumber(
      pagination.pageSize ||
        pagination.limit ||
        query.pageSize,
      items.length || 20
    )
  );

  const totalPages = Math.max(
    1,
    safeNumber(
      pagination.totalPages ||
        Math.ceil(total / pageSize),
      1
    )
  );

  return {
    total,
    page,
    pageSize,
    totalPages,
    hasNext:
      page < totalPages,
    hasPrev:
      page > 1,
  };
}

function normalizeUsuariosResponse(
  payload = {},
  query = {}
) {
  const items =
    normalizeUsersList(payload);

  const stats =
    computeUsersStats(items);

  const meta =
    normalizeMeta(
      payload,
      items,
      query
    );

  return {
    generatedAt: nowIso(),
    items,
    stats,
    meta,
    query:
      normalizeQueryParams(
        query
      ),
  };
}

function createFallbackResponse(
  query = {}
) {
  return {
    generatedAt: nowIso(),
    items: [],
    stats: {
      total: 0,
      active: 0,
      inactive: 0,
      blocked: 0,
      pending: 0,
      admins: 0,
    },
    meta: {
      total: 0,
      page: normalizeQueryParams(query).page,
      pageSize:
        normalizeQueryParams(query)
          .pageSize,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    query:
      normalizeQueryParams(
        query
      ),
  };
}

/* =========================================================
   REMOTE
========================================================= */

async function fetchRemoteUsuarios(
  options = {}
) {
  const client =
    getHttpClient();

  if (!client) {
    const error = new Error(
      "No hay cliente HTTP disponible."
    );

    return {
      ok: false,
      remoteOk: false,
      degraded: true,
      source:
        USUARIOS_SOURCES.FALLBACK_LOCAL,
      data:
        createFallbackResponse(
          options
        ),
      error,
    };
  }

  try {
    const qs =
      buildQueryString(options);

    const url = qs
      ? `${ENDPOINT}?${qs}`
      : ENDPOINT;

    const response =
      await client.get(url, {
        auth: true,
        retries: 1,
      });

    const payload =
      safeObject(
        response?.data ||
          response
      );

    const data =
      normalizeUsuariosResponse(
        payload,
        options
      );

    return {
      ok: true,
      remoteOk: true,
      degraded: false,
      source:
        USUARIOS_SOURCES.REMOTE,
      data,
      error: null,
    };
  } catch (error) {
    safeWarn(
      "[UsuariosAPI] remote fetch warning",
      error
    );

    return {
      ok: false,
      remoteOk: false,
      degraded: true,
      source:
        USUARIOS_SOURCES.FALLBACK_LOCAL,
      data:
        createFallbackResponse(
          options
        ),
      error,
    };
  }
}

/* =========================================================
   PUBLIC LOADERS
========================================================= */

export async function loadUsuarios(
  options = {}
) {
  const {
    force = false,
    preferCache = true,
  } = safeObject(options);

  const requestKey =
    buildRequestKey(options);

  if (
    inflightRequests.has(
      requestKey
    )
  ) {
    return inflightRequests.get(
      requestKey
    );
  }

  const task =
    (async () => {
      try {
        const cached =
          readCache(options);

        if (
          force !== true &&
          preferCache === true &&
          cached?.isFresh &&
          cached?.data
        ) {
          safeEmit(
            "usuarios:list:loaded",
            {
              source:
                USUARIOS_SOURCES.CACHE_FRESH,
              cachedAt:
                cached.savedAt,
              query:
                normalizeQueryParams(
                  options
                ),
            }
          );

          return {
            ok: true,
            source:
              USUARIOS_SOURCES.CACHE_FRESH,
            remoteOk: false,
            degraded: false,
            cacheHit: true,
            data: clone(
              cached.data
            ),
            error: null,
          };
        }

        const remote =
          await fetchRemoteUsuarios(
            options
          );

        if (
          remote.remoteOk !== true &&
          cached?.data
        ) {
          safeEmit(
            "usuarios:list:loaded",
            {
              source:
                USUARIOS_SOURCES.CACHE_STALE,
              cachedAt:
                cached.savedAt,
              query:
                normalizeQueryParams(
                  options
                ),
              error:
                remote.error ||
                null,
            }
          );

          return {
            ok: true,
            source:
              USUARIOS_SOURCES.CACHE_STALE,
            remoteOk: false,
            degraded: true,
            cacheHit: true,
            data: clone(
              cached.data
            ),
            error:
              remote.error ||
              null,
          };
        }

        if (
          remote.source ===
          USUARIOS_SOURCES.REMOTE
        ) {
          saveCache(
            options,
            remote.data
          );
        }

        safeEmit(
          "usuarios:list:loaded",
          {
            source:
              remote.source,
            remoteOk:
              remote.remoteOk ===
              true,
            degraded:
              remote.degraded ===
              true,
            query:
              normalizeQueryParams(
                options
              ),
          }
        );

        return {
          ok: true,
          source:
            remote.source,
          remoteOk:
            remote.remoteOk ===
            true,
          degraded:
            remote.degraded ===
            true,
          cacheHit: false,
          data: clone(
            remote.data
          ),
          error:
            remote.error ||
            null,
        };
      } catch (error) {
        safeError(
          "[UsuariosAPI] loadUsuarios error",
          error
        );

        return {
          ok: false,
          source:
            USUARIOS_SOURCES.ERROR,
          remoteOk: false,
          degraded: true,
          cacheHit: false,
          data: null,
          error,
        };
      } finally {
        inflightRequests.delete(
          requestKey
        );
      }
    })();

  inflightRequests.set(
    requestKey,
    task
  );

  return task;
}

export async function refreshUsuarios(
  options = {}
) {
  return loadUsuarios({
    ...safeObject(options),
    force: true,
    preferCache: false,
  });
}

export function getCachedUsuarios(
  options = {}
) {
  const cached =
    readCache(options);

  if (!cached?.data) {
    return null;
  }

  return clone(cached.data);
}

export function primeUsuariosCache(
  options = {},
  data = {}
) {
  const normalized =
    normalizeUsuariosResponse(
      data,
      options
    );

  saveCache(
    options,
    normalized
  );

  return normalized;
}

export function clearUsuariosCache() {
  return clearCache();
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const UsuariosAPI = {
  USUARIOS_SOURCES,
  loadUsuarios,
  refreshUsuarios,
  getCachedUsuarios,
  primeUsuariosCache,
  clearUsuariosCache,
};

export default UsuariosAPI;

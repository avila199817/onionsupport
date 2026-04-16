/* =========================================================
   Onion SPA - Usuarios State
   Archivo: src/views/usuarios/usuarios.state.js

   FINAL PRO SYSTEM · REAL CONTRACT · 10/10

   Responsabilidades:
   - centralizar el estado interno de la vista Usuarios
   - exponer snapshot inicial robusto e inmutable por copia
   - controlar loading / loaded / error
   - almacenar rows, meta, stats y alerts
   - modelar source / degraded / remoteOk / cacheHit
   - mantener params de listado consistentes
   - preservar contrato esperado por usuarios.api.js y usuarios.view.js
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const USUARIOS_CACHE_KEY =
  "onion.usuarios.list";

export const USUARIOS_CACHE_TTL =
  1000 * 60 * 5;

export const USUARIOS_DEFAULT_PAGE = 1;
export const USUARIOS_DEFAULT_PAGE_SIZE = 20;
export const USUARIOS_DEFAULT_SORT_BY = "createdAt";
export const USUARIOS_DEFAULT_SORT_DIR = "desc";

export const USUARIOS_SOURCES = Object.freeze({
  IDLE: "idle",
  REMOTE: "remote",
  CACHE_FRESH: "cache:fresh",
  CACHE_STALE: "cache:stale",
  FALLBACK_LOCAL: "fallback:local",
  ERROR: "error",
});

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

function safePositiveInt(
  value,
  fallback = 0
) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) &&
    number > 0
    ? number
    : fallback;
}

function safeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
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

/* =========================================================
   FACTORIES
========================================================= */

export function createInitialUsuarioRow() {
  return {
    id: "",
    userId: "",
    username: "",
    displayName: "",
    email: "",
    role: "user",
    status: "unknown",
    avatar: "",
    hasAvatar: false,
    phone: "",
    emailVerified: false,
    lastLoginAt: "",
    createdAt: "",
    updatedAt: "",
    raw: {},
  };
}

export function createInitialUsuariosMeta() {
  return {
    page: USUARIOS_DEFAULT_PAGE,
    pageSize: USUARIOS_DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    count: 0,
    hasNextPage: false,
    hasPrevPage: false,
    sortBy: USUARIOS_DEFAULT_SORT_BY,
    sortDir: USUARIOS_DEFAULT_SORT_DIR,
    q: "",
    role: "",
    status: "",
  };
}

export function createInitialUsuariosStats() {
  return {
    total: 0,
    admins: 0,
    active: 0,
    inactive: 0,
    withAvatar: 0,
  };
}

export function createInitialUsuariosParams() {
  return {
    page: USUARIOS_DEFAULT_PAGE,
    pageSize: USUARIOS_DEFAULT_PAGE_SIZE,
    sortBy: USUARIOS_DEFAULT_SORT_BY,
    sortDir: USUARIOS_DEFAULT_SORT_DIR,
    q: "",
    role: "",
    status: "",
    includeStats: false,
  };
}

export function createInitialUsuariosState() {
  return {
    loading: false,
    loaded: false,
    error: null,
    lastError: null,

    rows: [],
    meta: createInitialUsuariosMeta(),
    stats: createInitialUsuariosStats(),
    alerts: [],

    params: createInitialUsuariosParams(),

    source: USUARIOS_SOURCES.IDLE,
    remoteOk: false,
    degraded: false,

    lastSyncAt: "",
    hydratedAt: "",
    cacheHit: false,

    ui: {
      mounted: false,
      selectedUserId: "",
      activeFilter: "",
      lastAction: "",
      searchDraft: "",
    },
  };
}

/* =========================================================
   STATE
========================================================= */

export const usuariosState =
  createInitialUsuariosState();

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeSource(
  value = ""
) {
  const source = safeText(
    value,
    USUARIOS_SOURCES.IDLE
  );

  const allowed =
    Object.values(USUARIOS_SOURCES);

  return allowed.includes(source)
    ? source
    : USUARIOS_SOURCES.IDLE;
}

function normalizeSortDir(
  value = USUARIOS_DEFAULT_SORT_DIR
) {
  const dir = safeText(
    value,
    USUARIOS_DEFAULT_SORT_DIR
  ).toLowerCase();

  return dir === "asc"
    ? "asc"
    : "desc";
}

function normalizeUsuarioRow(
  value = {}
) {
  const row =
    safeObject(value);

  return {
    id: safeText(
      row.id ||
        row.userId,
      ""
    ),
    userId: safeText(
      row.userId ||
        row.id,
      ""
    ),
    username: safeText(
      row.username,
      ""
    ),
    displayName: safeText(
      row.displayName ||
        row.fullName ||
        row.name,
      ""
    ),
    email: safeText(
      row.email,
      ""
    ).toLowerCase(),
    role: safeText(
      row.role,
      "user"
    ).toLowerCase(),
    status: safeText(
      row.status,
      "unknown"
    ).toLowerCase(),
    avatar: safeText(
      row.avatar,
      ""
    ),
    hasAvatar: safeBoolean(
      row.hasAvatar,
      false
    ),
    phone: safeText(
      row.phone,
      ""
    ),
    emailVerified: safeBoolean(
      row.emailVerified,
      false
    ),
    lastLoginAt: safeText(
      row.lastLoginAt,
      ""
    ),
    createdAt: safeText(
      row.createdAt,
      ""
    ),
    updatedAt: safeText(
      row.updatedAt,
      ""
    ),
    raw: safeObject(row.raw || {}),
  };
}

function normalizeUsuariosRows(
  value = []
) {
  return safeArray(value)
    .map(normalizeUsuarioRow)
    .filter(Boolean);
}

function normalizeUsuariosMeta(
  value = {}
) {
  const meta =
    safeObject(value);

  const page = safePositiveInt(
    meta.page,
    USUARIOS_DEFAULT_PAGE
  );

  const pageSize =
    safePositiveInt(
      meta.pageSize,
      USUARIOS_DEFAULT_PAGE_SIZE
    );

  const total = safePositiveInt(
    meta.total,
    0
  );

  const totalPages =
    safePositiveInt(
      meta.totalPages,
      pageSize > 0
        ? Math.ceil(total / pageSize)
        : 0
    );

  return {
    page,
    pageSize,
    total,
    totalPages,
    count: safePositiveInt(
      meta.count,
      0
    ),
    hasNextPage: safeBoolean(
      meta.hasNextPage,
      page < totalPages
    ),
    hasPrevPage: safeBoolean(
      meta.hasPrevPage,
      page > 1
    ),
    sortBy: safeText(
      meta.sortBy,
      USUARIOS_DEFAULT_SORT_BY
    ),
    sortDir: normalizeSortDir(
      meta.sortDir
    ),
    q: safeText(meta.q, ""),
    role: safeText(meta.role, ""),
    status: safeText(
      meta.status,
      ""
    ),
  };
}

function normalizeUsuariosStats(
  value = {}
) {
  const stats =
    safeObject(value);

  return {
    total: safePositiveInt(
      stats.total,
      0
    ),
    admins: safePositiveInt(
      stats.admins,
      0
    ),
    active: safePositiveInt(
      stats.active,
      0
    ),
    inactive: safePositiveInt(
      stats.inactive,
      0
    ),
    withAvatar: safePositiveInt(
      stats.withAvatar,
      0
    ),
  };
}

function normalizeUsuariosAlert(
  value = {},
  index = 0
) {
  const item =
    safeObject(value);

  return {
    level: safeText(
      item.level,
      "info"
    ),
    code: safeText(
      item.code,
      `USERS_ALERT_${index + 1}`
    ),
    message: safeText(
      item.message,
      "Aviso"
    ),
  };
}

function normalizeUsuariosAlerts(
  value = []
) {
  return safeArray(value)
    .map(normalizeUsuariosAlert)
    .filter(Boolean);
}

function normalizeUsuariosParams(
  value = {}
) {
  const params =
    safeObject(value);

  return {
    page: safePositiveInt(
      params.page,
      USUARIOS_DEFAULT_PAGE
    ),
    pageSize: safePositiveInt(
      params.pageSize,
      USUARIOS_DEFAULT_PAGE_SIZE
    ),
    sortBy: safeText(
      params.sortBy,
      USUARIOS_DEFAULT_SORT_BY
    ),
    sortDir: normalizeSortDir(
      params.sortDir
    ),
    q: safeText(
      params.q ||
        params.search ||
        params.query,
      ""
    ),
    role: safeText(
      params.role,
      ""
    ),
    status: safeText(
      params.status,
      ""
    ),
    includeStats: safeBoolean(
      params.includeStats,
      false
    ),
  };
}

function normalizeUsuariosUiState(
  value = {}
) {
  const ui =
    safeObject(value);

  return {
    mounted: safeBoolean(
      ui.mounted,
      false
    ),
    selectedUserId: safeText(
      ui.selectedUserId,
      ""
    ),
    activeFilter: safeText(
      ui.activeFilter,
      ""
    ),
    lastAction: safeText(
      ui.lastAction,
      ""
    ),
    searchDraft: safeText(
      ui.searchDraft,
      ""
    ),
  };
}

/* =========================================================
   READ HELPERS
========================================================= */

export function getUsuariosState() {
  return clone(usuariosState);
}

export function getUsuariosRows() {
  return clone(usuariosState.rows);
}

export function getUsuariosMeta() {
  return clone(usuariosState.meta);
}

export function getUsuariosStats() {
  return clone(usuariosState.stats);
}

export function getUsuariosAlerts() {
  return clone(
    usuariosState.alerts
  );
}

export function getUsuariosParams() {
  return clone(
    usuariosState.params
  );
}

export function getUsuariosSource() {
  return normalizeSource(
    usuariosState.source
  );
}

export function isUsuariosLoading() {
  return usuariosState.loading === true;
}

export function isUsuariosLoaded() {
  return usuariosState.loaded === true;
}

export function isUsuariosDegraded() {
  return usuariosState.degraded === true;
}

export function isUsuariosRemoteOk() {
  return usuariosState.remoteOk === true;
}

export function getUsuariosError() {
  return usuariosState.error || null;
}

export function getUsuariosLastError() {
  return usuariosState.lastError || null;
}

export function getUsuariosLastSyncAt() {
  return safeText(
    usuariosState.lastSyncAt,
    ""
  );
}

export function getUsuariosHydratedAt() {
  return safeText(
    usuariosState.hydratedAt,
    ""
  );
}

export function getUsuariosCacheHit() {
  return safeBoolean(
    usuariosState.cacheHit,
    false
  );
}

export function getUsuariosUiState() {
  return clone(
    usuariosState.ui
  );
}

export function getUsuarioByIdFromState(
  userId = ""
) {
  const id = safeText(userId, "");

  if (!id) {
    return null;
  }

  const found =
    safeArray(usuariosState.rows).find(
      (row) =>
        safeText(
          row?.userId ||
            row?.id,
          ""
        ) === id
    ) || null;

  return found
    ? clone(found)
    : null;
}

/* =========================================================
   WRITE HELPERS
========================================================= */

export function resetUsuariosState() {
  const next =
    createInitialUsuariosState();

  Object.keys(usuariosState).forEach(
    (key) => {
      delete usuariosState[key];
    }
  );

  Object.assign(
    usuariosState,
    next
  );

  return getUsuariosState();
}

export function setUsuariosLoading(
  value = true
) {
  usuariosState.loading =
    value === true;

  if (value === true) {
    usuariosState.error = null;
  }

  return usuariosState.loading;
}

export function setUsuariosLoaded(
  value = true
) {
  usuariosState.loaded =
    value === true;

  return usuariosState.loaded;
}

export function setUsuariosError(
  error = null
) {
  usuariosState.error =
    error || null;

  if (error) {
    usuariosState.loading = false;
    usuariosState.lastError =
      error || null;
  }

  return usuariosState.error;
}

export function clearUsuariosError() {
  usuariosState.error = null;
  return null;
}

export function clearUsuariosLastError() {
  usuariosState.lastError = null;
  return null;
}

export function setUsuariosRows(
  rows = []
) {
  usuariosState.rows =
    normalizeUsuariosRows(rows);

  return getUsuariosRows();
}

export function patchUsuarioRow(
  userId = "",
  patch = {}
) {
  const id = safeText(userId, "");

  if (!id) {
    return getUsuariosRows();
  }

  usuariosState.rows =
    safeArray(usuariosState.rows).map(
      (row) => {
        const currentId =
          safeText(
            row?.userId ||
              row?.id,
            ""
          );

        if (currentId !== id) {
          return row;
        }

        return normalizeUsuarioRow({
          ...safeObject(row),
          ...safeObject(patch),
        });
      }
    );

  return getUsuariosRows();
}

export function prependUsuarioRow(
  row = {}
) {
  const normalized =
    normalizeUsuarioRow(row);

  const existingId =
    safeText(
      normalized.userId ||
        normalized.id,
      ""
    );

  if (!existingId) {
    return getUsuariosRows();
  }

  const filtered =
    safeArray(usuariosState.rows).filter(
      (item) =>
        safeText(
          item?.userId ||
            item?.id,
          ""
        ) !== existingId
    );

  usuariosState.rows = [
    normalized,
    ...filtered,
  ];

  return getUsuariosRows();
}

export function removeUsuarioRow(
  userId = ""
) {
  const id = safeText(userId, "");

  usuariosState.rows =
    safeArray(usuariosState.rows).filter(
      (row) =>
        safeText(
          row?.userId ||
            row?.id,
          ""
        ) !== id
    );

  return getUsuariosRows();
}

export function clearUsuariosRows() {
  usuariosState.rows = [];
  return getUsuariosRows();
}

export function setUsuariosMeta(
  meta = {}
) {
  usuariosState.meta =
    normalizeUsuariosMeta(meta);

  return getUsuariosMeta();
}

export function patchUsuariosMeta(
  patch = {}
) {
  return setUsuariosMeta({
    ...safeObject(
      usuariosState.meta
    ),
    ...safeObject(patch),
  });
}

export function setUsuariosStats(
  stats = {}
) {
  usuariosState.stats =
    normalizeUsuariosStats(stats);

  return getUsuariosStats();
}

export function patchUsuariosStats(
  patch = {}
) {
  return setUsuariosStats({
    ...safeObject(
      usuariosState.stats
    ),
    ...safeObject(patch),
  });
}

export function setUsuariosAlerts(
  alerts = []
) {
  usuariosState.alerts =
    normalizeUsuariosAlerts(alerts);

  return getUsuariosAlerts();
}

export function clearUsuariosAlerts() {
  usuariosState.alerts = [];
  return [];
}

export function setUsuariosParams(
  params = {}
) {
  usuariosState.params =
    normalizeUsuariosParams(
      params
    );

  return getUsuariosParams();
}

export function patchUsuariosParams(
  patch = {}
) {
  return setUsuariosParams({
    ...safeObject(
      usuariosState.params
    ),
    ...safeObject(patch),
  });
}

export function setUsuariosSource(
  value = USUARIOS_SOURCES.IDLE
) {
  usuariosState.source =
    normalizeSource(value);

  return usuariosState.source;
}

export function setUsuariosRemoteOk(
  value = false
) {
  usuariosState.remoteOk =
    value === true;

  return usuariosState.remoteOk;
}

export function setUsuariosDegraded(
  value = false
) {
  usuariosState.degraded =
    value === true;

  return usuariosState.degraded;
}

export function setUsuariosLastSyncAt(
  value = ""
) {
  usuariosState.lastSyncAt =
    safeText(value, "");

  return usuariosState.lastSyncAt;
}

export function setUsuariosHydratedAt(
  value = ""
) {
  usuariosState.hydratedAt =
    safeText(value, "");

  return usuariosState.hydratedAt;
}

export function setUsuariosCacheHit(
  value = false
) {
  usuariosState.cacheHit =
    value === true;

  return usuariosState.cacheHit;
}

export function setUsuariosMounted(
  value = true
) {
  usuariosState.ui.mounted =
    value === true;

  return usuariosState.ui.mounted;
}

export function setUsuariosSelectedUserId(
  value = ""
) {
  usuariosState.ui.selectedUserId =
    safeText(value, "");

  return usuariosState.ui.selectedUserId;
}

export function setUsuariosActiveFilter(
  value = ""
) {
  usuariosState.ui.activeFilter =
    safeText(value, "");

  return usuariosState.ui.activeFilter;
}

export function setUsuariosLastAction(
  value = ""
) {
  usuariosState.ui.lastAction =
    safeText(value, "");

  return usuariosState.ui.lastAction;
}

export function setUsuariosSearchDraft(
  value = ""
) {
  usuariosState.ui.searchDraft =
    safeText(value, "");

  return usuariosState.ui.searchDraft;
}

export function patchUsuariosUiState(
  patch = {}
) {
  usuariosState.ui =
    normalizeUsuariosUiState({
      ...safeObject(
        usuariosState.ui
      ),
      ...safeObject(patch),
    });

  return getUsuariosUiState();
}

/* =========================================================
   LIFECYCLE HELPERS
========================================================= */

export function startUsuariosLoad(
  params = {}
) {
  clearUsuariosError();
  setUsuariosLoading(true);
  setUsuariosLoaded(false);
  setUsuariosCacheHit(false);
  setUsuariosRemoteOk(false);
  setUsuariosDegraded(false);
  setUsuariosParams(params);

  if (
    getUsuariosSource() ===
    USUARIOS_SOURCES.ERROR
  ) {
    setUsuariosSource(
      USUARIOS_SOURCES.IDLE
    );
  }

  return getUsuariosState();
}

export function finishUsuariosLoad({
  rows = [],
  meta = {},
  stats = {},
  alerts = [],
  params = {},
  source = USUARIOS_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
  error = null,
} = {}) {
  setUsuariosRows(rows);
  setUsuariosMeta(meta);
  setUsuariosStats(stats);
  setUsuariosAlerts(alerts);
  setUsuariosParams(params);

  setUsuariosLoading(false);
  setUsuariosLoaded(true);
  setUsuariosSource(source);
  setUsuariosRemoteOk(
    remoteOk === true
  );
  setUsuariosDegraded(
    degraded === true
  );
  setUsuariosCacheHit(
    cacheHit === true
  );

  if (syncedAt) {
    setUsuariosLastSyncAt(
      syncedAt
    );
  }

  if (hydratedAt) {
    setUsuariosHydratedAt(
      hydratedAt
    );
  }

  if (error) {
    setUsuariosError(error);
    clearUsuariosError();
  }

  return getUsuariosState();
}

export function failUsuariosLoad(
  error = null
) {
  setUsuariosLoading(false);
  setUsuariosLoaded(false);
  setUsuariosSource(
    USUARIOS_SOURCES.ERROR
  );
  setUsuariosRemoteOk(false);
  setUsuariosDegraded(true);
  setUsuariosError(error);

  return getUsuariosState();
}

/* =========================================================
   COMPAT API HELPERS
   Alias explícito para mantener coherencia con usuarios.api.js
========================================================= */

export function beginUsuariosLoad(
  params = {}
) {
  return startUsuariosLoad(params);
}

export function completeUsuariosLoad({
  rows = [],
  meta = {},
  stats = {},
  alerts = [],
  params = {},
  source = USUARIOS_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
  error = null,
} = {}) {
  return finishUsuariosLoad({
    rows,
    meta,
    stats,
    alerts,
    params,
    source,
    remoteOk,
    degraded,
    syncedAt,
    hydratedAt,
    cacheHit,
    error,
  });
}

export function rejectUsuariosLoad(
  error = null
) {
  return failUsuariosLoad(error);
}

export function writeUsuariosRows(
  rows = []
) {
  return setUsuariosRows(rows);
}

export function writeUsuariosMeta(
  meta = {}
) {
  return setUsuariosMeta(meta);
}

export function writeUsuariosStats(
  stats = {}
) {
  return setUsuariosStats(stats);
}

export function setUsuariosSyncTimestamp(
  value = ""
) {
  return setUsuariosLastSyncAt(value);
}

export function setUsuariosHydrationTimestamp(
  value = ""
) {
  return setUsuariosHydratedAt(value);
}

export function markUsuariosCacheHit(
  value = false
) {
  return setUsuariosCacheHit(value);
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const UsuariosState = {
  USUARIOS_CACHE_KEY,
  USUARIOS_CACHE_TTL,
  USUARIOS_DEFAULT_PAGE,
  USUARIOS_DEFAULT_PAGE_SIZE,
  USUARIOS_DEFAULT_SORT_BY,
  USUARIOS_DEFAULT_SORT_DIR,
  USUARIOS_SOURCES,

  createInitialUsuarioRow,
  createInitialUsuariosMeta,
  createInitialUsuariosStats,
  createInitialUsuariosParams,
  createInitialUsuariosState,

  getUsuariosState,
  getUsuariosRows,
  getUsuariosMeta,
  getUsuariosStats,
  getUsuariosAlerts,
  getUsuariosParams,
  getUsuariosSource,
  isUsuariosLoading,
  isUsuariosLoaded,
  isUsuariosDegraded,
  isUsuariosRemoteOk,
  getUsuariosError,
  getUsuariosLastError,
  getUsuariosLastSyncAt,
  getUsuariosHydratedAt,
  getUsuariosCacheHit,
  getUsuariosUiState,
  getUsuarioByIdFromState,

  resetUsuariosState,
  setUsuariosLoading,
  setUsuariosLoaded,
  setUsuariosError,
  clearUsuariosError,
  clearUsuariosLastError,
  setUsuariosRows,
  patchUsuarioRow,
  prependUsuarioRow,
  removeUsuarioRow,
  clearUsuariosRows,
  setUsuariosMeta,
  patchUsuariosMeta,
  setUsuariosStats,
  patchUsuariosStats,
  setUsuariosAlerts,
  clearUsuariosAlerts,
  setUsuariosParams,
  patchUsuariosParams,
  setUsuariosSource,
  setUsuariosRemoteOk,
  setUsuariosDegraded,
  setUsuariosLastSyncAt,
  setUsuariosHydratedAt,
  setUsuariosCacheHit,
  setUsuariosMounted,
  setUsuariosSelectedUserId,
  setUsuariosActiveFilter,
  setUsuariosLastAction,
  setUsuariosSearchDraft,
  patchUsuariosUiState,

  startUsuariosLoad,
  finishUsuariosLoad,
  failUsuariosLoad,

  beginUsuariosLoad,
  completeUsuariosLoad,
  rejectUsuariosLoad,
  writeUsuariosRows,
  writeUsuariosMeta,
  writeUsuariosStats,
  setUsuariosSyncTimestamp,
  setUsuariosHydrationTimestamp,
  markUsuariosCacheHit,
};

export default UsuariosState;

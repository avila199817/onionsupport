/* =========================================================
   Onion SPA - Usuarios State
   Archivo: src/views/usuarios/usuarios.state.js

   FINAL PRO SYSTEM · ADMIN USERS STATE · 10/10

   Responsabilidades:
   - centralizar el estado interno de la vista Usuarios
   - exponer snapshot inicial robusto e inmutable por copia
   - controlar loading / loaded / error
   - almacenar listado, stats, meta y query normalizados
   - modelar source / degraded / remoteOk / cacheHit
   - mantener selección y estado UI predecibles
   - preservar contrato esperado por usuarios.api.js, store y template
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const USUARIOS_SOURCES =
  Object.freeze({
    IDLE: "idle",
    REMOTE: "remote",
    CACHE_FRESH: "cache:fresh",
    CACHE_STALE: "cache:stale",
    FALLBACK_LOCAL: "fallback:local",
    ERROR: "error",
  });

export const USUARIOS_VIEW_MODES =
  Object.freeze({
    TABLE: "table",
    GRID: "grid",
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
   FACTORIES · USER ITEM
========================================================= */

export function createInitialUsuarioItem() {
  return {
    id: "",
    userId: "",
    username: "",
    displayName: "",
    name: "",
    email: "",
    phone: "",
    role: "user",
    status: "unknown",
    avatarUrl: "",
    createdAt: "",
    updatedAt: "",
    lastLoginAt: "",
    emailVerified: false,
    isActive: false,
    raw: {},
  };
}

/* =========================================================
   FACTORIES · DATA
========================================================= */

export function createInitialUsuariosStats() {
  return {
    total: 0,
    active: 0,
    inactive: 0,
    blocked: 0,
    pending: 0,
    admins: 0,
  };
}

export function createInitialUsuariosMeta() {
  return {
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  };
}

export function createInitialUsuariosQuery() {
  return {
    page: 1,
    pageSize: 20,
    search: "",
    role: "",
    status: "",
    sortBy: "createdAt",
    sortDir: "desc",
  };
}

export function createInitialUsuariosData() {
  return {
    generatedAt: "",
    items: [],
    stats:
      createInitialUsuariosStats(),
    meta:
      createInitialUsuariosMeta(),
    query:
      createInitialUsuariosQuery(),
  };
}

/* =========================================================
   FACTORIES · SELECTION / UI
========================================================= */

export function createInitialUsuariosSelection() {
  return {
    selectedIds: [],
    activeUserId: "",
  };
}

export function createInitialUsuariosUiState() {
  return {
    mounted: false,
    viewMode:
      USUARIOS_VIEW_MODES.TABLE,
    lastAction: "",
    searchDraft: "",
    filtersOpen: false,
  };
}

/* =========================================================
   ROOT STATE FACTORY
========================================================= */

export function createInitialUsuariosState() {
  return {
    loading: false,
    loaded: false,
    error: null,
    lastError: null,

    source:
      USUARIOS_SOURCES.IDLE,
    remoteOk: false,
    degraded: false,
    cacheHit: false,

    data:
      createInitialUsuariosData(),

    selection:
      createInitialUsuariosSelection(),

    ui:
      createInitialUsuariosUiState(),
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

function normalizeUsuarioItem(
  value = {}
) {
  const item =
    safeObject(value);

  const id =
    safeText(
      item.id ||
        item.userId,
      ""
    );

  const status = safeText(
    item.status,
    "unknown"
  ).toLowerCase();

  return {
    id,
    userId: safeText(
      item.userId || id,
      ""
    ),
    username: safeText(
      item.username,
      ""
    ),
    displayName: safeText(
      item.displayName ||
        item.name,
      ""
    ),
    name: safeText(
      item.name ||
        item.displayName,
      ""
    ),
    email: safeText(
      item.email,
      ""
    ),
    phone: safeText(
      item.phone,
      ""
    ),
    role: safeText(
      item.role,
      "user"
    ).toLowerCase(),
    status,
    avatarUrl: safeText(
      item.avatarUrl,
      ""
    ),
    createdAt: safeText(
      item.createdAt,
      ""
    ),
    updatedAt: safeText(
      item.updatedAt,
      ""
    ),
    lastLoginAt: safeText(
      item.lastLoginAt,
      ""
    ),
    emailVerified: safeBoolean(
      item.emailVerified,
      false
    ),
    isActive:
      safeBoolean(
        item.isActive,
        status === "active"
      ) === true,
    raw: safeObject(item.raw || item),
  };
}

function normalizeUsuariosStats(
  value = {}
) {
  const stats =
    safeObject(value);

  return {
    total: safeNumber(
      stats.total,
      0
    ),
    active: safeNumber(
      stats.active,
      0
    ),
    inactive: safeNumber(
      stats.inactive,
      0
    ),
    blocked: safeNumber(
      stats.blocked,
      0
    ),
    pending: safeNumber(
      stats.pending,
      0
    ),
    admins: safeNumber(
      stats.admins,
      0
    ),
  };
}

function normalizeUsuariosMeta(
  value = {}
) {
  const meta =
    safeObject(value);

  const page = Math.max(
    1,
    safeNumber(meta.page, 1)
  );

  const pageSize = Math.max(
    1,
    safeNumber(
      meta.pageSize,
      20
    )
  );

  const total = Math.max(
    0,
    safeNumber(meta.total, 0)
  );

  const totalPages = Math.max(
    1,
    safeNumber(
      meta.totalPages,
      1
    )
  );

  return {
    total,
    page,
    pageSize,
    totalPages,
    hasNext: safeBoolean(
      meta.hasNext,
      page < totalPages
    ),
    hasPrev: safeBoolean(
      meta.hasPrev,
      page > 1
    ),
  };
}

function normalizeUsuariosQuery(
  value = {}
) {
  const query =
    safeObject(value);

  return {
    page: Math.max(
      1,
      safeNumber(query.page, 1)
    ),
    pageSize: Math.max(
      1,
      safeNumber(
        query.pageSize,
        20
      )
    ),
    search: safeText(
      query.search,
      ""
    ),
    role: safeText(
      query.role,
      ""
    ),
    status: safeText(
      query.status,
      ""
    ),
    sortBy: safeText(
      query.sortBy,
      "createdAt"
    ),
    sortDir:
      safeText(
        query.sortDir,
        "desc"
      ).toLowerCase() === "asc"
        ? "asc"
        : "desc",
  };
}

function normalizeUsuariosData(
  value = {}
) {
  const data =
    safeObject(value);

  return {
    generatedAt: safeText(
      data.generatedAt,
      ""
    ),
    items: safeArray(data.items)
      .map(
        normalizeUsuarioItem
      )
      .filter(Boolean),
    stats:
      normalizeUsuariosStats(
        data.stats
      ),
    meta: normalizeUsuariosMeta(
      data.meta
    ),
    query:
      normalizeUsuariosQuery(
        data.query
      ),
  };
}

function normalizeUsuariosSource(
  value = ""
) {
  const source = safeText(
    value,
    USUARIOS_SOURCES.IDLE
  );

  const allowed =
    Object.values(
      USUARIOS_SOURCES
    );

  return allowed.includes(source)
    ? source
    : USUARIOS_SOURCES.IDLE;
}

function normalizeSelectedIds(
  value = []
) {
  const seen = new Set();

  return safeArray(value)
    .map((id) =>
      safeText(id, "")
    )
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });
}

function normalizeUsuariosSelection(
  value = {}
) {
  const selection =
    safeObject(value);

  const selectedIds =
    normalizeSelectedIds(
      selection.selectedIds
    );

  const activeUserId =
    safeText(
      selection.activeUserId,
      ""
    );

  return {
    selectedIds,
    activeUserId,
  };
}

function normalizeViewMode(
  value = USUARIOS_VIEW_MODES.TABLE
) {
  const mode = safeText(
    value,
    USUARIOS_VIEW_MODES.TABLE
  );

  const allowed =
    Object.values(
      USUARIOS_VIEW_MODES
    );

  return allowed.includes(mode)
    ? mode
    : USUARIOS_VIEW_MODES.TABLE;
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
    viewMode: normalizeViewMode(
      ui.viewMode
    ),
    lastAction: safeText(
      ui.lastAction,
      ""
    ),
    searchDraft: safeText(
      ui.searchDraft,
      ""
    ),
    filtersOpen: safeBoolean(
      ui.filtersOpen,
      false
    ),
  };
}

/* =========================================================
   READ HELPERS
========================================================= */

export function getUsuariosState() {
  return clone(usuariosState);
}

export function getUsuariosData() {
  return clone(
    usuariosState.data
  );
}

export function getUsuariosItems() {
  return clone(
    usuariosState.data?.items ||
      []
  );
}

export function getUsuariosStats() {
  return clone(
    usuariosState.data?.stats ||
      createInitialUsuariosStats()
  );
}

export function getUsuariosMeta() {
  return clone(
    usuariosState.data?.meta ||
      createInitialUsuariosMeta()
  );
}

export function getUsuariosQuery() {
  return clone(
    usuariosState.data?.query ||
      createInitialUsuariosQuery()
  );
}

export function getUsuariosSelection() {
  return clone(
    usuariosState.selection
  );
}

export function getUsuariosUiState() {
  return clone(
    usuariosState.ui
  );
}

export function isUsuariosLoading() {
  return usuariosState.loading === true;
}

export function isUsuariosLoaded() {
  return usuariosState.loaded === true;
}

export function isUsuariosDegraded() {
  return (
    usuariosState.degraded === true
  );
}

export function isUsuariosRemoteOk() {
  return (
    usuariosState.remoteOk === true
  );
}

export function getUsuariosError() {
  return usuariosState.error || null;
}

export function getUsuariosLastError() {
  return (
    usuariosState.lastError || null
  );
}

export function getUsuariosSource() {
  return normalizeUsuariosSource(
    usuariosState.source
  );
}

export function getUsuariosCacheHit() {
  return safeBoolean(
    usuariosState.cacheHit,
    false
  );
}

/* =========================================================
   WRITE HELPERS
========================================================= */

export function resetUsuariosState() {
  const next =
    createInitialUsuariosState();

  Object.keys(
    usuariosState
  ).forEach((key) => {
    delete usuariosState[key];
  });

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

export function setUsuariosSource(
  value = USUARIOS_SOURCES.IDLE
) {
  usuariosState.source =
    normalizeUsuariosSource(value);

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

export function setUsuariosCacheHit(
  value = false
) {
  usuariosState.cacheHit =
    value === true;

  return usuariosState.cacheHit;
}

export function setUsuariosData(
  data = {}
) {
  usuariosState.data =
    normalizeUsuariosData(data);

  return getUsuariosData();
}

export function patchUsuariosData(
  patch = {}
) {
  const current =
    safeObject(
      usuariosState.data
    );

  return setUsuariosData({
    ...current,
    ...safeObject(patch),
  });
}

export function clearUsuariosData() {
  usuariosState.data =
    createInitialUsuariosData();

  return getUsuariosData();
}

export function setUsuariosItems(
  items = []
) {
  usuariosState.data.items =
    safeArray(items)
      .map(
        normalizeUsuarioItem
      )
      .filter(Boolean);

  return getUsuariosItems();
}

export function setUsuariosStats(
  stats = {}
) {
  usuariosState.data.stats =
    normalizeUsuariosStats(
      stats
    );

  return getUsuariosStats();
}

export function setUsuariosMeta(
  meta = {}
) {
  usuariosState.data.meta =
    normalizeUsuariosMeta(
      meta
    );

  return getUsuariosMeta();
}

export function setUsuariosQuery(
  query = {}
) {
  usuariosState.data.query =
    normalizeUsuariosQuery(
      query
    );

  return getUsuariosQuery();
}

export function patchUsuariosQuery(
  patch = {}
) {
  const current =
    safeObject(
      usuariosState.data?.query
    );

  return setUsuariosQuery({
    ...current,
    ...safeObject(patch),
  });
}

export function setUsuariosSelection(
  selection = {}
) {
  usuariosState.selection =
    normalizeUsuariosSelection(
      selection
    );

  return getUsuariosSelection();
}

export function patchUsuariosSelection(
  patch = {}
) {
  const current =
    safeObject(
      usuariosState.selection
    );

  return setUsuariosSelection({
    ...current,
    ...safeObject(patch),
  });
}

export function clearUsuariosSelection() {
  usuariosState.selection =
    createInitialUsuariosSelection();

  return getUsuariosSelection();
}

export function setUsuariosSelectedIds(
  ids = []
) {
  usuariosState.selection.selectedIds =
    normalizeSelectedIds(ids);

  return clone(
    usuariosState.selection
      .selectedIds
  );
}

export function addUsuariosSelectedId(
  id = ""
) {
  const next = new Set(
    normalizeSelectedIds(
      usuariosState.selection
        ?.selectedIds
    )
  );

  const normalized =
    safeText(id, "");

  if (normalized) {
    next.add(normalized);
  }

  return setUsuariosSelectedIds(
    Array.from(next)
  );
}

export function removeUsuariosSelectedId(
  id = ""
) {
  const normalized =
    safeText(id, "");

  const next =
    normalizeSelectedIds(
      usuariosState.selection
        ?.selectedIds
    ).filter(
      (item) => item !== normalized
    );

  return setUsuariosSelectedIds(
    next
  );
}

export function setUsuariosActiveUserId(
  value = ""
) {
  usuariosState.selection.activeUserId =
    safeText(value, "");

  return usuariosState.selection
    .activeUserId;
}

export function setUsuariosMounted(
  value = true
) {
  usuariosState.ui.mounted =
    value === true;

  return usuariosState.ui.mounted;
}

export function setUsuariosViewMode(
  value = USUARIOS_VIEW_MODES.TABLE
) {
  usuariosState.ui.viewMode =
    normalizeViewMode(value);

  return usuariosState.ui.viewMode;
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

export function setUsuariosFiltersOpen(
  value = false
) {
  usuariosState.ui.filtersOpen =
    value === true;

  return usuariosState.ui.filtersOpen;
}

export function patchUsuariosUiState(
  patch = {}
) {
  const current =
    safeObject(usuariosState.ui);

  usuariosState.ui =
    normalizeUsuariosUiState({
      ...current,
      ...safeObject(patch),
    });

  return getUsuariosUiState();
}

/* =========================================================
   LIFECYCLE HELPERS
========================================================= */

export function startUsuariosLoad() {
  clearUsuariosError();
  setUsuariosLoading(true);
  setUsuariosLoaded(false);
  setUsuariosRemoteOk(false);
  setUsuariosDegraded(false);
  setUsuariosCacheHit(false);

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
  data = null,
  source = USUARIOS_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  cacheHit = false,
} = {}) {
  if (data) {
    setUsuariosData(data);
  }

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
========================================================= */

export function beginUsuariosLoad() {
  return startUsuariosLoad();
}

export function completeUsuariosLoad({
  data = null,
  source = USUARIOS_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  cacheHit = false,
} = {}) {
  return finishUsuariosLoad({
    data,
    source,
    remoteOk,
    degraded,
    cacheHit,
  });
}

export function rejectUsuariosLoad(
  error = null
) {
  return failUsuariosLoad(error);
}

export function writeUsuariosData(
  data = {}
) {
  return setUsuariosData(data);
}

export function writeUsuariosQuery(
  query = {}
) {
  return setUsuariosQuery(query);
}

export function writeUsuariosSelection(
  selection = {}
) {
  return setUsuariosSelection(
    selection
  );
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const UsuariosState = {
  USUARIOS_SOURCES,
  USUARIOS_VIEW_MODES,

  createInitialUsuarioItem,
  createInitialUsuariosStats,
  createInitialUsuariosMeta,
  createInitialUsuariosQuery,
  createInitialUsuariosData,
  createInitialUsuariosSelection,
  createInitialUsuariosUiState,
  createInitialUsuariosState,

  getUsuariosState,
  getUsuariosData,
  getUsuariosItems,
  getUsuariosStats,
  getUsuariosMeta,
  getUsuariosQuery,
  getUsuariosSelection,
  getUsuariosUiState,
  isUsuariosLoading,
  isUsuariosLoaded,
  isUsuariosDegraded,
  isUsuariosRemoteOk,
  getUsuariosError,
  getUsuariosLastError,
  getUsuariosSource,
  getUsuariosCacheHit,

  resetUsuariosState,
  setUsuariosLoading,
  setUsuariosLoaded,
  setUsuariosError,
  clearUsuariosError,
  clearUsuariosLastError,
  setUsuariosSource,
  setUsuariosRemoteOk,
  setUsuariosDegraded,
  setUsuariosCacheHit,

  setUsuariosData,
  patchUsuariosData,
  clearUsuariosData,
  setUsuariosItems,
  setUsuariosStats,
  setUsuariosMeta,
  setUsuariosQuery,
  patchUsuariosQuery,

  setUsuariosSelection,
  patchUsuariosSelection,
  clearUsuariosSelection,
  setUsuariosSelectedIds,
  addUsuariosSelectedId,
  removeUsuariosSelectedId,
  setUsuariosActiveUserId,

  setUsuariosMounted,
  setUsuariosViewMode,
  setUsuariosLastAction,
  setUsuariosSearchDraft,
  setUsuariosFiltersOpen,
  patchUsuariosUiState,

  startUsuariosLoad,
  finishUsuariosLoad,
  failUsuariosLoad,

  beginUsuariosLoad,
  completeUsuariosLoad,
  rejectUsuariosLoad,
  writeUsuariosData,
  writeUsuariosQuery,
  writeUsuariosSelection,
};

export default UsuariosState;

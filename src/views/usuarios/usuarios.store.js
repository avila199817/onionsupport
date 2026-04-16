/* =========================================================
   Onion SPA - Usuarios Store
   Archivo: src/views/usuarios/usuarios.store.js

   FINAL PRO SYSTEM · ADMIN USERS STORE · 10/10

   Responsabilidades:
   - exponer acceso semántico al estado Usuarios
   - desacoplar consumers del shape interno de usuarios.state.js
   - ofrecer getters y setters de alto nivel
   - facilitar integración con api / view / bindings / actions
   - centralizar lectura de flags, selección, query y metadatos
   - mantener coherencia con usuarios.api.js y usuarios.state.js
========================================================= */

import {
  USUARIOS_SOURCES,
  USUARIOS_VIEW_MODES,

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
  resetUsuariosState,
} from "./usuarios.state.js";

/* =========================================================
   BASICS
========================================================= */

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

function safeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function normalizeUsuariosSource(
  value = USUARIOS_SOURCES.IDLE
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

/* =========================================================
   SNAPSHOTS
========================================================= */

export function getUsuariosSnapshot() {
  return getUsuariosState();
}

export function getUsuariosDataSnapshot() {
  return getUsuariosData();
}

export function getUsuariosUiSnapshot() {
  return getUsuariosUiState();
}

export function getUsuariosSelectionSnapshot() {
  return getUsuariosSelection();
}

/* =========================================================
   STATUS
========================================================= */

export function getUsuariosStatus() {
  return {
    loading: isUsuariosLoading(),
    loaded: isUsuariosLoaded(),
    degraded: isUsuariosDegraded(),
    remoteOk: isUsuariosRemoteOk(),
    source: getUsuariosSource(),
    error: getUsuariosError(),
    lastError: getUsuariosLastError(),
    cacheHit: getUsuariosCacheHit(),
  };
}

export function getUsuariosSourceStatus() {
  return {
    source: getUsuariosSource(),
    remoteOk: isUsuariosRemoteOk(),
    degraded: isUsuariosDegraded(),
    cacheHit: getUsuariosCacheHit(),
  };
}

export function hasUsuariosError() {
  return Boolean(
    getUsuariosError()
  );
}

export function hasUsuariosLastError() {
  return Boolean(
    getUsuariosLastError()
  );
}

export function isUsuariosReady() {
  return (
    isUsuariosLoaded() === true &&
    isUsuariosLoading() !== true &&
    !getUsuariosError()
  );
}

export function isUsuariosIdleSource() {
  return (
    getUsuariosSource() ===
    USUARIOS_SOURCES.IDLE
  );
}

export function isUsuariosRemoteSource() {
  return (
    getUsuariosSource() ===
    USUARIOS_SOURCES.REMOTE
  );
}

export function isUsuariosFreshCacheSource() {
  return (
    getUsuariosSource() ===
    USUARIOS_SOURCES.CACHE_FRESH
  );
}

export function isUsuariosStaleCacheSource() {
  return (
    getUsuariosSource() ===
    USUARIOS_SOURCES.CACHE_STALE
  );
}

export function isUsuariosFallbackSource() {
  return (
    getUsuariosSource() ===
    USUARIOS_SOURCES.FALLBACK_LOCAL
  );
}

export function isUsuariosErrorSource() {
  return (
    getUsuariosSource() ===
    USUARIOS_SOURCES.ERROR
  );
}

/* =========================================================
   DATA
========================================================= */

export function readUsuariosData() {
  return getUsuariosData();
}

export function readUsuariosItems() {
  return getUsuariosItems();
}

export function readUsuariosStats() {
  return getUsuariosStats();
}

export function readUsuariosMeta() {
  return getUsuariosMeta();
}

export function readUsuariosQuery() {
  return getUsuariosQuery();
}

export function getUsuariosTotal() {
  const stats = getUsuariosStats();
  return Number(stats?.total || 0);
}

export function getUsuariosPage() {
  const meta = getUsuariosMeta();
  return Number(meta?.page || 1);
}

export function getUsuariosPageSize() {
  const meta = getUsuariosMeta();
  return Number(
    meta?.pageSize || 20
  );
}

export function getUsuariosTotalPages() {
  const meta = getUsuariosMeta();
  return Number(
    meta?.totalPages || 1
  );
}

export function hasUsuariosNextPage() {
  const meta = getUsuariosMeta();
  return meta?.hasNext === true;
}

export function hasUsuariosPrevPage() {
  const meta = getUsuariosMeta();
  return meta?.hasPrev === true;
}

export function findUsuarioById(
  userId = ""
) {
  const normalized =
    safeText(userId, "");

  if (!normalized) {
    return null;
  }

  const items = getUsuariosItems();

  return (
    items.find(
      (item) =>
        safeText(
          item?.id ||
            item?.userId,
          ""
        ) === normalized
    ) || null
  );
}

export function writeUsuariosData(
  data = {}
) {
  return setUsuariosData(data);
}

export function mergeUsuariosData(
  patch = {}
) {
  return patchUsuariosData(
    safeObject(patch)
  );
}

export function clearUsuariosDataStore() {
  return clearUsuariosData();
}

export function writeUsuariosItems(
  items = []
) {
  return setUsuariosItems(items);
}

export function writeUsuariosStats(
  stats = {}
) {
  return setUsuariosStats(stats);
}

export function writeUsuariosMeta(
  meta = {}
) {
  return setUsuariosMeta(meta);
}

/* =========================================================
   QUERY / FILTERS
========================================================= */

export function writeUsuariosQuery(
  query = {}
) {
  return setUsuariosQuery(query);
}

export function mergeUsuariosQuery(
  patch = {}
) {
  return patchUsuariosQuery(
    safeObject(patch)
  );
}

export function setUsuariosSearchQuery(
  value = ""
) {
  return patchUsuariosQuery({
    search: safeText(
      value,
      ""
    ),
    page: 1,
  });
}

export function setUsuariosRoleFilter(
  value = ""
) {
  return patchUsuariosQuery({
    role: safeText(value, ""),
    page: 1,
  });
}

export function setUsuariosStatusFilter(
  value = ""
) {
  return patchUsuariosQuery({
    status: safeText(value, ""),
    page: 1,
  });
}

export function setUsuariosSort(
  sortBy = "createdAt",
  sortDir = "desc"
) {
  return patchUsuariosQuery({
    sortBy: safeText(
      sortBy,
      "createdAt"
    ),
    sortDir:
      safeText(
        sortDir,
        "desc"
      ).toLowerCase() === "asc"
        ? "asc"
        : "desc",
  });
}

export function setUsuariosPage(
  page = 1
) {
  return patchUsuariosQuery({
    page: Math.max(1, Number(page) || 1),
  });
}

export function setUsuariosPageSize(
  pageSize = 20
) {
  return patchUsuariosQuery({
    page: 1,
    pageSize: Math.max(
      1,
      Number(pageSize) || 20
    ),
  });
}

export function resetUsuariosFilters() {
  return setUsuariosQuery({
    page: 1,
    pageSize: getUsuariosPageSize(),
    search: "",
    role: "",
    status: "",
    sortBy: "createdAt",
    sortDir: "desc",
  });
}

/* =========================================================
   SELECTION
========================================================= */

export function readUsuariosSelection() {
  return getUsuariosSelection();
}

export function readUsuariosSelectedIds() {
  const selection =
    getUsuariosSelection();

  return selection?.selectedIds || [];
}

export function readUsuariosActiveUserId() {
  const selection =
    getUsuariosSelection();

  return safeText(
    selection?.activeUserId,
    ""
  );
}

export function getUsuariosSelectedCount() {
  return readUsuariosSelectedIds()
    .length;
}

export function isUsuarioSelected(
  userId = ""
) {
  const normalized =
    safeText(userId, "");

  if (!normalized) {
    return false;
  }

  return readUsuariosSelectedIds().includes(
    normalized
  );
}

export function writeUsuariosSelection(
  selection = {}
) {
  return setUsuariosSelection(
    selection
  );
}

export function mergeUsuariosSelection(
  patch = {}
) {
  return patchUsuariosSelection(
    safeObject(patch)
  );
}

export function clearUsuariosSelectionState() {
  return clearUsuariosSelection();
}

export function setUsuariosSelectionIds(
  ids = []
) {
  return setUsuariosSelectedIds(ids);
}

export function addUsuariosSelectionId(
  id = ""
) {
  return addUsuariosSelectedId(id);
}

export function removeUsuariosSelectionId(
  id = ""
) {
  return removeUsuariosSelectedId(id);
}

export function toggleUsuariosSelectionId(
  id = ""
) {
  const normalized =
    safeText(id, "");

  if (!normalized) {
    return readUsuariosSelectedIds();
  }

  if (
    isUsuarioSelected(
      normalized
    )
  ) {
    return removeUsuariosSelectedId(
      normalized
    );
  }

  return addUsuariosSelectedId(
    normalized
  );
}

export function selectAllUsuarios() {
  const ids = readUsuariosItems()
    .map((item) =>
      safeText(
        item?.id ||
          item?.userId,
        ""
      )
    )
    .filter(Boolean);

  return setUsuariosSelectedIds(ids);
}

export function clearAllUsuariosSelected() {
  return setUsuariosSelectedIds([]);
}

export function setUsuariosActiveUser(
  userId = ""
) {
  return setUsuariosActiveUserId(
    safeText(userId, "")
  );
}

/* =========================================================
   UI
========================================================= */

export function readUsuariosUi() {
  return getUsuariosUiState();
}

export function readUsuariosViewMode() {
  const ui = getUsuariosUiState();
  return normalizeViewMode(
    ui?.viewMode
  );
}

export function isUsuariosTableMode() {
  return (
    readUsuariosViewMode() ===
    USUARIOS_VIEW_MODES.TABLE
  );
}

export function isUsuariosGridMode() {
  return (
    readUsuariosViewMode() ===
    USUARIOS_VIEW_MODES.GRID
  );
}

export function isUsuariosFiltersOpen() {
  const ui = getUsuariosUiState();
  return ui?.filtersOpen === true;
}

export function readUsuariosSearchDraft() {
  const ui = getUsuariosUiState();
  return safeText(
    ui?.searchDraft,
    ""
  );
}

export function markUsuariosMounted(
  value = true
) {
  return setUsuariosMounted(
    value === true
  );
}

export function setUsuariosMode(
  value = USUARIOS_VIEW_MODES.TABLE
) {
  return setUsuariosViewMode(
    normalizeViewMode(value)
  );
}

export function setUsuariosAction(
  value = ""
) {
  return setUsuariosLastAction(
    safeText(value, "")
  );
}

export function setUsuariosSearchInput(
  value = ""
) {
  return setUsuariosSearchDraft(
    safeText(value, "")
  );
}

export function openUsuariosFilters() {
  return setUsuariosFiltersOpen(true);
}

export function closeUsuariosFilters() {
  return setUsuariosFiltersOpen(false);
}

export function toggleUsuariosFilters() {
  return setUsuariosFiltersOpen(
    !isUsuariosFiltersOpen()
  );
}

export function patchUsuariosUi(
  patch = {}
) {
  return patchUsuariosUiState(
    safeObject(patch)
  );
}

/* =========================================================
   METADATA
========================================================= */

export function readUsuariosMetadata() {
  return {
    source: getUsuariosSource(),
    remoteOk: isUsuariosRemoteOk(),
    degraded: isUsuariosDegraded(),
    cacheHit: getUsuariosCacheHit(),
  };
}

export function setUsuariosSourceState(
  value = USUARIOS_SOURCES.IDLE
) {
  return setUsuariosSource(
    normalizeUsuariosSource(value)
  );
}

export function setUsuariosRemoteOkState(
  value = false
) {
  return setUsuariosRemoteOk(
    value === true
  );
}

export function setUsuariosDegradedState(
  value = false
) {
  return setUsuariosDegraded(
    value === true
  );
}

export function markUsuariosCacheHit(
  value = false
) {
  return setUsuariosCacheHit(
    value === true
  );
}

/* =========================================================
   LOAD FLOW
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
    source:
      normalizeUsuariosSource(
        source
      ),
    remoteOk:
      remoteOk === true,
    degraded:
      degraded === true,
    cacheHit:
      cacheHit === true,
  });
}

export function rejectUsuariosLoad(
  error = null
) {
  return failUsuariosLoad(error);
}

/* =========================================================
   LOW LEVEL FLAGS
========================================================= */

export function setUsuariosLoadingState(
  value = true
) {
  return setUsuariosLoading(
    value === true
  );
}

export function setUsuariosLoadedState(
  value = true
) {
  return setUsuariosLoaded(
    value === true
  );
}

export function setUsuariosErrorState(
  error = null
) {
  return setUsuariosError(error);
}

export function clearUsuariosErrorState() {
  return clearUsuariosError();
}

export function clearUsuariosLastErrorState() {
  return clearUsuariosLastError();
}

/* =========================================================
   RESET
========================================================= */

export function resetUsuariosStore() {
  return resetUsuariosState();
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const UsuariosStore = {
  USUARIOS_SOURCES,
  USUARIOS_VIEW_MODES,

  getUsuariosSnapshot,
  getUsuariosDataSnapshot,
  getUsuariosUiSnapshot,
  getUsuariosSelectionSnapshot,

  getUsuariosStatus,
  getUsuariosSourceStatus,
  hasUsuariosError,
  hasUsuariosLastError,
  isUsuariosReady,
  isUsuariosIdleSource,
  isUsuariosRemoteSource,
  isUsuariosFreshCacheSource,
  isUsuariosStaleCacheSource,
  isUsuariosFallbackSource,
  isUsuariosErrorSource,

  readUsuariosData,
  readUsuariosItems,
  readUsuariosStats,
  readUsuariosMeta,
  readUsuariosQuery,
  getUsuariosTotal,
  getUsuariosPage,
  getUsuariosPageSize,
  getUsuariosTotalPages,
  hasUsuariosNextPage,
  hasUsuariosPrevPage,
  findUsuarioById,
  writeUsuariosData,
  mergeUsuariosData,
  clearUsuariosDataStore,
  writeUsuariosItems,
  writeUsuariosStats,
  writeUsuariosMeta,

  writeUsuariosQuery,
  mergeUsuariosQuery,
  setUsuariosSearchQuery,
  setUsuariosRoleFilter,
  setUsuariosStatusFilter,
  setUsuariosSort,
  setUsuariosPage,
  setUsuariosPageSize,
  resetUsuariosFilters,

  readUsuariosSelection,
  readUsuariosSelectedIds,
  readUsuariosActiveUserId,
  getUsuariosSelectedCount,
  isUsuarioSelected,
  writeUsuariosSelection,
  mergeUsuariosSelection,
  clearUsuariosSelectionState,
  setUsuariosSelectionIds,
  addUsuariosSelectionId,
  removeUsuariosSelectionId,
  toggleUsuariosSelectionId,
  selectAllUsuarios,
  clearAllUsuariosSelected,
  setUsuariosActiveUser,

  readUsuariosUi,
  readUsuariosViewMode,
  isUsuariosTableMode,
  isUsuariosGridMode,
  isUsuariosFiltersOpen,
  readUsuariosSearchDraft,
  markUsuariosMounted,
  setUsuariosMode,
  setUsuariosAction,
  setUsuariosSearchInput,
  openUsuariosFilters,
  closeUsuariosFilters,
  toggleUsuariosFilters,
  patchUsuariosUi,

  readUsuariosMetadata,
  setUsuariosSourceState,
  setUsuariosRemoteOkState,
  setUsuariosDegradedState,
  markUsuariosCacheHit,

  beginUsuariosLoad,
  completeUsuariosLoad,
  rejectUsuariosLoad,

  setUsuariosLoadingState,
  setUsuariosLoadedState,
  setUsuariosErrorState,
  clearUsuariosErrorState,
  clearUsuariosLastErrorState,

  resetUsuariosStore,
};

export default UsuariosStore;

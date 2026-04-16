/* =========================================================
   Onion SPA - Usuarios Store
   Archivo: src/views/usuarios/usuarios.store.js

   FINAL PRO SYSTEM · SEMANTIC STORE · 10/10

   Responsabilidades:
   - exponer acceso semántico al estado Usuarios
   - desacoplar consumers del shape interno de usuarios.state.js
   - ofrecer getters y setters de alto nivel
   - facilitar integración con api / view / bindings
   - centralizar lectura de flags, rows, meta y stats
   - mantener coherencia con usuarios.api.js y usuarios.state.js
========================================================= */

import {
  USUARIOS_SOURCES,

  getUsuariosState,
  getUsuariosRows,
  getUsuariosMeta,
  getUsuariosStats,
  getUsuariosAlerts,
  getUsuariosParams,
  getUsuariosSource,
  getUsuariosUiState,
  getUsuariosError,
  getUsuariosLastError,
  getUsuariosLastSyncAt,
  getUsuariosHydratedAt,
  getUsuariosCacheHit,
  getUsuarioByIdFromState,

  isUsuariosLoading,
  isUsuariosLoaded,
  isUsuariosDegraded,
  isUsuariosRemoteOk,

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

  setUsuariosMounted,
  setUsuariosSelectedUserId,
  setUsuariosActiveFilter,
  setUsuariosLastAction,
  setUsuariosSearchDraft,
  patchUsuariosUiState,

  setUsuariosLastSyncAt,
  setUsuariosHydratedAt,
  setUsuariosCacheHit,

  setUsuariosLoading,
  setUsuariosLoaded,
  setUsuariosError,
  clearUsuariosError,
  clearUsuariosLastError,

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

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
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

/* =========================================================
   SNAPSHOTS
========================================================= */

export function getUsuariosSnapshot() {
  return getUsuariosState();
}

export function getUsuariosRowsSnapshot() {
  return getUsuariosRows();
}

export function getUsuariosUiSnapshot() {
  return getUsuariosUiState();
}

/* =========================================================
   STATUS
========================================================= */

export function getUsuariosStatus() {
  return {
    loading:
      isUsuariosLoading(),
    loaded:
      isUsuariosLoaded(),
    degraded:
      isUsuariosDegraded(),
    remoteOk:
      isUsuariosRemoteOk(),
    source:
      getUsuariosSource(),
    error:
      getUsuariosError(),
    lastError:
      getUsuariosLastError(),
    lastSyncAt:
      getUsuariosLastSyncAt(),
    hydratedAt:
      getUsuariosHydratedAt(),
    cacheHit:
      getUsuariosCacheHit(),
  };
}

export function getUsuariosSourceStatus() {
  return {
    source:
      getUsuariosSource(),
    remoteOk:
      isUsuariosRemoteOk(),
    degraded:
      isUsuariosDegraded(),
    cacheHit:
      getUsuariosCacheHit(),
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
    isUsuariosLoaded() ===
      true &&
    isUsuariosLoading() !==
      true &&
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

export function readUsuariosRows() {
  return getUsuariosRows();
}

export function readUsuariosMeta() {
  return getUsuariosMeta();
}

export function readUsuariosStats() {
  return getUsuariosStats();
}

export function readUsuariosAlerts() {
  return getUsuariosAlerts();
}

export function readUsuariosParams() {
  return getUsuariosParams();
}

export function readUsuarioById(
  userId = ""
) {
  return getUsuarioByIdFromState(
    safeText(userId, "")
  );
}

export function getUsuariosCount() {
  return getUsuariosRows()
    .length;
}

export function getUsuariosTotal() {
  return safePositiveInt(
    getUsuariosMeta()?.total,
    0
  );
}

/* =========================================================
   ROWS
========================================================= */

export function writeUsuariosRows(
  rows = []
) {
  return setUsuariosRows(rows);
}

export function patchUsuario(
  userId = "",
  patch = {}
) {
  return patchUsuarioRow(
    safeText(userId, ""),
    safeObject(patch)
  );
}

export function prependUsuario(
  row = {}
) {
  return prependUsuarioRow(
    safeObject(row)
  );
}

export function removeUsuario(
  userId = ""
) {
  return removeUsuarioRow(
    safeText(userId, "")
  );
}

export function clearUsuariosRowsStore() {
  return clearUsuariosRows();
}

/* =========================================================
   META / STATS / ALERTS
========================================================= */

export function writeUsuariosMeta(
  meta = {}
) {
  return setUsuariosMeta(
    safeObject(meta)
  );
}

export function mergeUsuariosMeta(
  patch = {}
) {
  return patchUsuariosMeta(
    safeObject(patch)
  );
}

export function writeUsuariosStats(
  stats = {}
) {
  return setUsuariosStats(
    safeObject(stats)
  );
}

export function mergeUsuariosStats(
  patch = {}
) {
  return patchUsuariosStats(
    safeObject(patch)
  );
}

export function writeUsuariosAlerts(
  alerts = []
) {
  return setUsuariosAlerts(
    alerts
  );
}

export function clearUsuariosAlertsStore() {
  return clearUsuariosAlerts();
}

/* =========================================================
   PARAMS
========================================================= */

export function writeUsuariosParams(
  params = {}
) {
  return setUsuariosParams(
    safeObject(params)
  );
}

export function mergeUsuariosParams(
  patch = {}
) {
  return patchUsuariosParams(
    safeObject(patch)
  );
}

export function setUsuariosPage(
  page = 1
) {
  return patchUsuariosParams({
    page:
      safePositiveInt(
        page,
        1
      ),
  });
}

export function setUsuariosPageSize(
  pageSize = 20
) {
  return patchUsuariosParams({
    pageSize:
      safePositiveInt(
        pageSize,
        20
      ),
  });
}

export function setUsuariosSearch(
  q = ""
) {
  return patchUsuariosParams({
    q: safeText(q, ""),
    page: 1,
  });
}

export function setUsuariosRoleFilter(
  role = ""
) {
  return patchUsuariosParams({
    role: safeText(role, ""),
    page: 1,
  });
}

export function setUsuariosStatusFilter(
  status = ""
) {
  return patchUsuariosParams({
    status: safeText(
      status,
      ""
    ),
    page: 1,
  });
}

export function setUsuariosSort(
  sortBy = "createdAt",
  sortDir = "desc"
) {
  return patchUsuariosParams({
    sortBy: safeText(
      sortBy,
      "createdAt"
    ),
    sortDir:
      safeText(
        sortDir,
        "desc"
      ) === "asc"
        ? "asc"
        : "desc",
  });
}

/* =========================================================
   UI
========================================================= */

export function readUsuariosUi() {
  return getUsuariosUiState();
}

export function markUsuariosMounted(
  value = true
) {
  return setUsuariosMounted(
    value === true
  );
}

export function selectUsuario(
  userId = ""
) {
  return setUsuariosSelectedUserId(
    safeText(userId, "")
  );
}

export function clearAllUsuariosSelected() {
  return setUsuariosSelectedUserId("");
}

export function setUsuariosActiveFilterUi(
  value = ""
) {
  return setUsuariosActiveFilter(
    safeText(value, "")
  );
}

export function setUsuariosAction(
  value = ""
) {
  return setUsuariosLastAction(
    safeText(value, "")
  );
}

export function setUsuariosSearchDraftUi(
  value = ""
) {
  return setUsuariosSearchDraft(
    safeText(value, "")
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
    source:
      getUsuariosSource(),
    remoteOk:
      isUsuariosRemoteOk(),
    degraded:
      isUsuariosDegraded(),
    lastSyncAt:
      getUsuariosLastSyncAt(),
    hydratedAt:
      getUsuariosHydratedAt(),
    cacheHit:
      getUsuariosCacheHit(),
  };
}

export function setUsuariosSourceState(
  value = USUARIOS_SOURCES.IDLE
) {
  return setUsuariosSource(
    normalizeUsuariosSource(
      value
    )
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

export function setUsuariosSyncTimestamp(
  value = ""
) {
  return setUsuariosLastSyncAt(
    safeText(value, "")
  );
}

export function setUsuariosHydrationTimestamp(
  value = ""
) {
  return setUsuariosHydratedAt(
    safeText(value, "")
  );
}

export function markUsuariosCacheHit(
  value = true
) {
  return setUsuariosCacheHit(
    value === true
  );
}

/* =========================================================
   LOAD FLOW
========================================================= */

export function beginUsuariosLoad(
  params = {}
) {
  return startUsuariosLoad(
    safeObject(params)
  );
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
    source:
      normalizeUsuariosSource(
        source
      ),
    remoteOk:
      remoteOk === true,
    degraded:
      degraded === true,
    syncedAt: safeText(
      syncedAt,
      ""
    ),
    hydratedAt: safeText(
      hydratedAt,
      ""
    ),
    cacheHit:
      cacheHit === true,
    error:
      error || null,
  });
}

export function rejectUsuariosLoad(
  error = null
) {
  return failUsuariosLoad(
    error
  );
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
  return setUsuariosError(
    error
  );
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

  getUsuariosSnapshot,
  getUsuariosRowsSnapshot,
  getUsuariosUiSnapshot,

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

  readUsuariosRows,
  readUsuariosMeta,
  readUsuariosStats,
  readUsuariosAlerts,
  readUsuariosParams,
  readUsuarioById,
  getUsuariosCount,
  getUsuariosTotal,

  writeUsuariosRows,
  patchUsuario,
  prependUsuario,
  removeUsuario,
  clearUsuariosRowsStore,

  writeUsuariosMeta,
  mergeUsuariosMeta,
  writeUsuariosStats,
  mergeUsuariosStats,
  writeUsuariosAlerts,
  clearUsuariosAlertsStore,

  writeUsuariosParams,
  mergeUsuariosParams,
  setUsuariosPage,
  setUsuariosPageSize,
  setUsuariosSearch,
  setUsuariosRoleFilter,
  setUsuariosStatusFilter,
  setUsuariosSort,

  readUsuariosUi,
  markUsuariosMounted,
  selectUsuario,
  clearAllUsuariosSelected,
  setUsuariosActiveFilterUi,
  setUsuariosAction,
  setUsuariosSearchDraftUi,
  patchUsuariosUi,

  readUsuariosMetadata,
  setUsuariosSourceState,
  setUsuariosRemoteOkState,
  setUsuariosDegradedState,
  setUsuariosSyncTimestamp,
  setUsuariosHydrationTimestamp,
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

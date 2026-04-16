/* =========================================================
   Onion SPA - Home State
   Archivo: src/views/home/home.state.js

   FINAL PRO SYSTEM · REAL CONTRACT · 10/10

   Responsabilidades:
   - centralizar el estado interno de la vista Home
   - exponer snapshot inicial robusto e inmutable por copia
   - controlar loading / loaded / error
   - almacenar summary real y metadatos de sincronización
   - modelar source / degraded / remoteOk / cacheHit
   - mantener mutaciones predecibles y limpias
   - preservar contrato esperado por home.api.js y home.template.js
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_CACHE_KEY =
  "onion.home.summary";

export const HOME_CACHE_TTL =
  1000 * 60 * 5;

export const HOME_SOURCES = Object.freeze({
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
   SUMMARY FACTORIES
========================================================= */

export function createInitialHomeUser() {
  return {
    id: null,
    role: "unknown",
  };
}

export function createInitialHomeKpis() {
  return {
    ticketsOpen: 0,
    ticketsUrgent: 0,
    clientesTotal: 0,
    facturasPending: 0,
    usersTotal: 0,
    facturacionTotal: 0,
  };
}

export function createInitialHomeHealth() {
  return {
    tickets: false,
    clientes: false,
    facturas: false,
    users: false,
  };
}

export function createInitialHomeSummary() {
  return {
    user: createInitialHomeUser(),
    generatedAt: "",
    kpis: createInitialHomeKpis(),
    alerts: [],
    recentActivity: [],
    quickActions: [],
    health: createInitialHomeHealth(),
  };
}

/* =========================================================
   ROOT STATE FACTORY
========================================================= */

export function createInitialHomeState() {
  return {
    loading: false,
    loaded: false,
    error: null,
    lastError: null,

    summary:
      createInitialHomeSummary(),

    source: HOME_SOURCES.IDLE,
    remoteOk: false,
    degraded: false,

    lastSyncAt: "",
    hydratedAt: "",
    cacheHit: false,

    ui: {
      mounted: false,
      activeCard: "",
      lastAction: "",
    },
  };
}

/* =========================================================
   STATE
========================================================= */

export const homeState =
  createInitialHomeState();

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeHomeUser(
  value = {}
) {
  const user =
    safeObject(value);

  return {
    id:
      safeText(user.id, "") ||
      null,
    role: safeText(
      user.role,
      "unknown"
    ),
  };
}

function normalizeHomeKpis(
  value = {}
) {
  const kpis =
    safeObject(value);

  return {
    ticketsOpen: safeNumber(
      kpis.ticketsOpen,
      0
    ),
    ticketsUrgent: safeNumber(
      kpis.ticketsUrgent,
      0
    ),
    clientesTotal: safeNumber(
      kpis.clientesTotal,
      0
    ),
    facturasPending: safeNumber(
      kpis.facturasPending,
      0
    ),
    usersTotal: safeNumber(
      kpis.usersTotal,
      0
    ),
    facturacionTotal: safeNumber(
      kpis.facturacionTotal,
      0
    ),
  };
}

function normalizeHomeAlert(
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
      `ALERT_${index + 1}`
    ),
    message: safeText(
      item.message,
      "Alerta"
    ),
  };
}

function normalizeHomeActivityItem(
  value = {},
  index = 0
) {
  const item =
    safeObject(value);

  return {
    id: safeText(
      item.id,
      `activity-${index + 1}`
    ),
    text: safeText(
      item.text ||
        item.label ||
        item.title,
      "Movimiento"
    ),
    label: safeText(
      item.label ||
        item.text ||
        item.title,
      "Movimiento"
    ),
    date: safeText(
      item.date ||
        item.createdAt,
      ""
    ),
    createdAt: safeText(
      item.createdAt ||
        item.date,
      ""
    ),
  };
}

function normalizeHomeQuickAction(
  value = {},
  index = 0
) {
  const item =
    safeObject(value);

  return {
    key: safeText(
      item.key,
      `action-${index + 1}`
    ),
    label: safeText(
      item.label,
      "Acción"
    ),
    href: safeText(
      item.href,
      "#"
    ),
  };
}

function normalizeHomeHealth(
  value = {}
) {
  const health =
    safeObject(value);

  return {
    tickets: safeBoolean(
      health.tickets,
      false
    ),
    clientes: safeBoolean(
      health.clientes,
      false
    ),
    facturas: safeBoolean(
      health.facturas,
      false
    ),
    users: safeBoolean(
      health.users,
      false
    ),
  };
}

function normalizeHomeSummary(
  summary = {}
) {
  const next =
    safeObject(summary);

  return {
    user: normalizeHomeUser(
      next.user
    ),

    generatedAt: safeText(
      next.generatedAt,
      ""
    ),

    kpis: normalizeHomeKpis(
      next.kpis
    ),

    alerts: safeArray(next.alerts)
      .map(normalizeHomeAlert)
      .filter(Boolean),

    recentActivity: safeArray(
      next.recentActivity
    )
      .map(
        normalizeHomeActivityItem
      )
      .filter(Boolean),

    quickActions: safeArray(
      next.quickActions
    )
      .map(
        normalizeHomeQuickAction
      )
      .filter(Boolean),

    health: normalizeHomeHealth(
      next.health
    ),
  };
}

function normalizeSource(
  value = ""
) {
  const source = safeText(
    value,
    HOME_SOURCES.IDLE
  );

  const allowed =
    Object.values(HOME_SOURCES);

  return allowed.includes(source)
    ? source
    : HOME_SOURCES.IDLE;
}

/* =========================================================
   READ HELPERS
========================================================= */

export function getHomeState() {
  return clone(homeState);
}

export function getHomeSummary() {
  return clone(
    homeState.summary
  );
}

export function getHomeSource() {
  return normalizeSource(
    homeState.source
  );
}

export function isHomeLoading() {
  return homeState.loading === true;
}

export function isHomeLoaded() {
  return homeState.loaded === true;
}

export function isHomeDegraded() {
  return homeState.degraded === true;
}

export function isHomeRemoteOk() {
  return homeState.remoteOk === true;
}

export function getHomeError() {
  return homeState.error || null;
}

export function getHomeLastError() {
  return homeState.lastError || null;
}

export function getHomeLastSyncAt() {
  return safeText(
    homeState.lastSyncAt,
    ""
  );
}

export function getHomeHydratedAt() {
  return safeText(
    homeState.hydratedAt,
    ""
  );
}

export function getHomeCacheHit() {
  return safeBoolean(
    homeState.cacheHit,
    false
  );
}

export function getHomeUiState() {
  return clone(
    homeState.ui
  );
}

export function getHomeKpis() {
  return clone(
    homeState.summary?.kpis ||
      createInitialHomeKpis()
  );
}

export function getHomeAlerts() {
  return clone(
    homeState.summary?.alerts || []
  );
}

export function getHomeRecentActivity() {
  return clone(
    homeState.summary
      ?.recentActivity || []
  );
}

export function getHomeQuickActions() {
  return clone(
    homeState.summary
      ?.quickActions || []
  );
}

export function getHomeHealth() {
  return clone(
    homeState.summary?.health ||
      createInitialHomeHealth()
  );
}

/* =========================================================
   WRITE HELPERS
========================================================= */

export function resetHomeState() {
  const next =
    createInitialHomeState();

  Object.keys(homeState).forEach(
    (key) => {
      delete homeState[key];
    }
  );

  Object.assign(homeState, next);

  return getHomeState();
}

export function setHomeLoading(
  value = true
) {
  homeState.loading =
    value === true;

  if (value === true) {
    homeState.error = null;
  }

  return homeState.loading;
}

export function setHomeLoaded(
  value = true
) {
  homeState.loaded =
    value === true;

  return homeState.loaded;
}

export function setHomeError(
  error = null
) {
  homeState.error =
    error || null;

  if (error) {
    homeState.loading = false;
    homeState.lastError =
      error || null;
  }

  return homeState.error;
}

export function clearHomeError() {
  homeState.error = null;
  return null;
}

export function clearHomeLastError() {
  homeState.lastError = null;
  return null;
}

export function setHomeSummary(
  summary = {}
) {
  homeState.summary =
    normalizeHomeSummary(
      summary
    );

  return getHomeSummary();
}

export function patchHomeSummary(
  patch = {}
) {
  const current =
    safeObject(homeState.summary);

  return setHomeSummary({
    ...current,
    ...safeObject(patch),
  });
}

export function clearHomeSummary() {
  homeState.summary =
    createInitialHomeSummary();

  return getHomeSummary();
}

export function setHomeSource(
  value = HOME_SOURCES.IDLE
) {
  homeState.source =
    normalizeSource(value);

  return homeState.source;
}

export function setHomeRemoteOk(
  value = false
) {
  homeState.remoteOk =
    value === true;

  return homeState.remoteOk;
}

export function setHomeDegraded(
  value = false
) {
  homeState.degraded =
    value === true;

  return homeState.degraded;
}

export function setHomeLastSyncAt(
  value = ""
) {
  homeState.lastSyncAt =
    safeText(value, "");

  return homeState.lastSyncAt;
}

export function setHomeHydratedAt(
  value = ""
) {
  homeState.hydratedAt =
    safeText(value, "");

  return homeState.hydratedAt;
}

export function setHomeCacheHit(
  value = false
) {
  homeState.cacheHit =
    value === true;

  return homeState.cacheHit;
}

export function setHomeMounted(
  value = true
) {
  homeState.ui.mounted =
    value === true;

  return homeState.ui.mounted;
}

export function setHomeActiveCard(
  value = ""
) {
  homeState.ui.activeCard =
    safeText(value, "");

  return homeState.ui.activeCard;
}

export function setHomeLastAction(
  value = ""
) {
  homeState.ui.lastAction =
    safeText(value, "");

  return homeState.ui.lastAction;
}

export function patchHomeUiState(
  patch = {}
) {
  const next =
    safeObject(patch);

  homeState.ui = {
    ...homeState.ui,
    ...next,
    mounted: Object.prototype.hasOwnProperty.call(
      next,
      "mounted"
    )
      ? safeBoolean(
          next.mounted,
          homeState.ui.mounted
        )
      : homeState.ui.mounted,
    activeCard:
      Object.prototype.hasOwnProperty.call(
        next,
        "activeCard"
      )
        ? safeText(
            next.activeCard,
            ""
          )
        : homeState.ui.activeCard,
    lastAction:
      Object.prototype.hasOwnProperty.call(
        next,
        "lastAction"
      )
        ? safeText(
            next.lastAction,
            ""
          )
        : homeState.ui.lastAction,
  };

  return getHomeUiState();
}

/* =========================================================
   LIFECYCLE HELPERS
========================================================= */

export function startHomeLoad() {
  clearHomeError();
  setHomeLoading(true);
  setHomeLoaded(false);
  setHomeCacheHit(false);
  setHomeRemoteOk(false);
  setHomeDegraded(false);

  if (
    getHomeSource() ===
    HOME_SOURCES.ERROR
  ) {
    setHomeSource(
      HOME_SOURCES.IDLE
    );
  }

  return getHomeState();
}

export function finishHomeLoad({
  summary = null,
  source = HOME_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
} = {}) {
  if (summary) {
    setHomeSummary(summary);
  }

  setHomeLoading(false);
  setHomeLoaded(true);
  setHomeSource(source);
  setHomeRemoteOk(
    remoteOk === true
  );
  setHomeDegraded(
    degraded === true
  );
  setHomeCacheHit(
    cacheHit === true
  );

  if (syncedAt) {
    setHomeLastSyncAt(
      syncedAt
    );
  }

  if (hydratedAt) {
    setHomeHydratedAt(
      hydratedAt
    );
  }

  return getHomeState();
}

export function failHomeLoad(
  error = null
) {
  setHomeLoading(false);
  setHomeLoaded(false);
  setHomeSource(
    HOME_SOURCES.ERROR
  );
  setHomeRemoteOk(false);
  setHomeDegraded(true);
  setHomeError(error);

  return getHomeState();
}

/* =========================================================
   COMPAT API HELPERS
   Alias explícito para mantener coherencia con home.api.js
========================================================= */

export function beginHomeLoad() {
  return startHomeLoad();
}

export function completeHomeLoad({
  summary = null,
  source = HOME_SOURCES.REMOTE,
  remoteOk = false,
  degraded = false,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
} = {}) {
  return finishHomeLoad({
    summary,
    source,
    remoteOk,
    degraded,
    syncedAt,
    hydratedAt,
    cacheHit,
  });
}

export function rejectHomeLoad(
  error = null
) {
  return failHomeLoad(error);
}

export function writeHomeSummary(
  summary = {}
) {
  return setHomeSummary(summary);
}

export function setHomeSyncTimestamp(
  value = ""
) {
  return setHomeLastSyncAt(value);
}

export function setHomeHydrationTimestamp(
  value = ""
) {
  return setHomeHydratedAt(value);
}

export function markHomeCacheHit(
  value = false
) {
  return setHomeCacheHit(value);
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const HomeState = {
  HOME_CACHE_KEY,
  HOME_CACHE_TTL,
  HOME_SOURCES,

  createInitialHomeUser,
  createInitialHomeKpis,
  createInitialHomeHealth,
  createInitialHomeSummary,
  createInitialHomeState,

  getHomeState,
  getHomeSummary,
  getHomeSource,
  getHomeKpis,
  getHomeAlerts,
  getHomeRecentActivity,
  getHomeQuickActions,
  getHomeHealth,
  isHomeLoading,
  isHomeLoaded,
  isHomeDegraded,
  isHomeRemoteOk,
  getHomeError,
  getHomeLastError,
  getHomeLastSyncAt,
  getHomeHydratedAt,
  getHomeCacheHit,
  getHomeUiState,

  resetHomeState,
  setHomeLoading,
  setHomeLoaded,
  setHomeError,
  clearHomeError,
  clearHomeLastError,
  setHomeSummary,
  patchHomeSummary,
  clearHomeSummary,
  setHomeSource,
  setHomeRemoteOk,
  setHomeDegraded,
  setHomeLastSyncAt,
  setHomeHydratedAt,
  setHomeCacheHit,
  setHomeMounted,
  setHomeActiveCard,
  setHomeLastAction,
  patchHomeUiState,

  startHomeLoad,
  finishHomeLoad,
  failHomeLoad,

  beginHomeLoad,
  completeHomeLoad,
  rejectHomeLoad,
  writeHomeSummary,
  setHomeSyncTimestamp,
  setHomeHydrationTimestamp,
  markHomeCacheHit,
};

export default HomeState;

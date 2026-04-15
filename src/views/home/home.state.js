/* =========================================================
   Onion SPA - Home State
   Archivo: src/views/home/home.state.js

   Responsabilidades:
   - centralizar el estado interno de la vista Home
   - exponer snapshot inicial inmutable
   - controlar loading / loaded / error
   - almacenar summary y metadatos de sincronización
   - mantener mutaciones predecibles y limpias
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_CACHE_KEY =
  "onion.home.summary";

export const HOME_CACHE_TTL =
  1000 * 60 * 5;

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

export function createInitialHomeSummary() {
  return {
    status: "idle",
    cards: 0,
    metrics: [],
    recentActivity: [],
    generatedAt: "",
  };
}

export function createInitialHomeState() {
  return {
    loading: false,
    loaded: false,
    error: null,

    summary:
      createInitialHomeSummary(),

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

export function isHomeLoading() {
  return homeState.loading === true;
}

export function isHomeLoaded() {
  return homeState.loaded === true;
}

export function getHomeError() {
  return homeState.error || null;
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
  }

  return homeState.error;
}

export function clearHomeError() {
  homeState.error = null;
  return null;
}

export function setHomeSummary(
  summary = {}
) {
  const next =
    safeObject(summary);

  homeState.summary = {
    ...createInitialHomeSummary(),
    ...next,
    metrics: safeArray(
      next.metrics
    ),
    recentActivity: safeArray(
      next.recentActivity
    ),
    status: safeText(
      next.status,
      "idle"
    ),
    generatedAt: safeText(
      next.generatedAt,
      ""
    ),
  };

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
    mounted: safeBoolean(
      next.mounted,
      homeState.ui.mounted
    ),
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

  return getHomeState();
}

export function finishHomeLoad({
  summary = null,
  syncedAt = "",
  hydratedAt = "",
  cacheHit = false,
} = {}) {
  if (summary) {
    setHomeSummary(summary);
  }

  setHomeLoading(false);
  setHomeLoaded(true);
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
  setHomeError(error);

  return getHomeState();
}

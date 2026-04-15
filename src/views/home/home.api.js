/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   EXTREME MODE · BACKEND REAL SUMMARY · CONTRACT SAFE

   Responsabilidades:
   - cargar summary real de la Home
   - consumir /api/dashboard/summary
   - aplicar estrategia cache-first
   - hidratar store del módulo
   - persistir cache local
   - tolerar backend envuelto o plano
   - dejar preparado un punto único para resumen remoto
   - preservar el contrato real esperado por home.template.js

   CONTRATO OBJETIVO:
   {
     generatedAt: string,
     kpis: {
       ticketsOpen: number,
       ticketsUrgent: number,
       clientesTotal: number,
       facturasPending: number,
       usersTotal: number,
       facturacionTotal: number
     },
     alerts: [],
     recentActivity: [],
     quickActions: [],
     health: {}
   }
========================================================= */

import { AppCore } from "../../core/index.js";
import { Http } from "../../services/index.js";

import {
  HOME_CACHE_KEY,
  HOME_CACHE_TTL,
} from "./home.state.js";

import {
  beginHomeLoad,
  completeHomeLoad,
  rejectHomeLoad,
  writeHomeSummary,
  setHomeSyncTimestamp,
  setHomeHydrationTimestamp,
  markHomeCacheHit,
} from "./home.store.js";

/* =========================================================
   INTERNAL
========================================================= */

const ENDPOINT = "/api/dashboard/summary";

let inflightLoad = null;

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
  if (value === null || value === undefined) {
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

function getStorageApi() {
  return AppCore?.storage || null;
}

function getCurrentUser() {
  return AppCore?.state?.user || null;
}

/* =========================================================
   CACHE
========================================================= */

function buildCachePayload(summary) {
  return {
    savedAt: Date.now(),
    summary: clone(summary),
  };
}

function saveCache(summary) {
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
      HOME_CACHE_KEY,
      buildCachePayload(summary)
    );

    return true;
  } catch (error) {
    console.warn(
      "[HomeAPI] saveCache warning",
      error
    );
    return false;
  }
}

function readCache() {
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
      storage.get(HOME_CACHE_KEY);

    const normalized =
      safeObject(payload);

    const savedAt =
      safeNumber(
        normalized.savedAt,
        0
      );

    const summary =
      safeObject(
        normalized.summary
      );

    if (
      !savedAt ||
      !Object.keys(summary).length
    ) {
      return null;
    }

    return {
      savedAt,
      summary,
      isFresh:
        Date.now() - savedAt <=
        HOME_CACHE_TTL,
    };
  } catch (error) {
    console.warn(
      "[HomeAPI] readCache warning",
      error
    );
    return null;
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
      HOME_CACHE_KEY
    );

    return true;
  } catch (error) {
    console.warn(
      "[HomeAPI] clearCache warning",
      error
    );
    return false;
  }
}

/* =========================================================
   SUMMARY NORMALIZATION
========================================================= */

function createFallbackSummary() {
  const user =
    getCurrentUser();

  return {
    user: {
      id: safeText(
        user?.userId || user?.id,
        null
      ),
      role: safeText(
        user?.role || user?.rol,
        "unknown"
      ),
    },

    generatedAt: nowIso(),

    kpis: {
      ticketsOpen: 0,
      ticketsUrgent: 0,
      clientesTotal: 0,
      facturasPending: 0,
      usersTotal: 0,
      facturacionTotal: 0,
    },

    alerts: [
      {
        level: "info",
        code: "HOME_FALLBACK",
        message:
          "Resumen local cargado sin datos remotos.",
      },
    ],

    recentActivity: [],

    quickActions: [],

    health: {
      tickets: false,
      clientes: false,
      facturas: false,
      users: false,
    },
  };
}

function looksLikeDashboardSummary(
  value = {}
) {
  const obj =
    safeObject(value);

  return Boolean(
    obj?.generatedAt ||
      obj?.kpis ||
      obj?.alerts ||
      obj?.recentActivity ||
      obj?.quickActions ||
      obj?.health
  );
}

function unwrapDashboardPayload(
  payload = {}
) {
  const raw =
    safeObject(payload);

  if (
    looksLikeDashboardSummary(raw)
  ) {
    return raw;
  }

  const level1 =
    safeObject(raw?.data);

  if (
    looksLikeDashboardSummary(level1)
  ) {
    return level1;
  }

  const level2 =
    safeObject(level1?.data);

  if (
    looksLikeDashboardSummary(level2)
  ) {
    return level2;
  }

  if (
    looksLikeDashboardSummary(
      raw?.summary
    )
  ) {
    return safeObject(raw.summary);
  }

  if (
    looksLikeDashboardSummary(
      level1?.summary
    )
  ) {
    return safeObject(
      level1.summary
    );
  }

  return {};
}

function normalizeAlert(
  alert,
  index = 0
) {
  const item =
    safeObject(alert);

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

function normalizeActivityItem(
  activity,
  index = 0
) {
  const item =
    safeObject(activity);

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

function normalizeQuickAction(
  action,
  index = 0
) {
  const item =
    safeObject(action);

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

function normalizeSummary(
  payload = {}
) {
  const source =
    unwrapDashboardPayload(
      payload
    );

  const fallback =
    createFallbackSummary();

  const rawKpis =
    safeObject(source.kpis);

  const alerts =
    safeArray(source.alerts)
      .map(normalizeAlert)
      .filter(Boolean);

  const recentActivity =
    safeArray(
      source.recentActivity
    )
      .map(
        normalizeActivityItem
      )
      .filter(Boolean);

  const quickActions =
    safeArray(
      source.quickActions
    )
      .map(normalizeQuickAction)
      .filter(Boolean);

  return {
    user: {
      id: safeText(
        source?.user?.id,
        fallback.user.id
      ),
      role: safeText(
        source?.user?.role,
        fallback.user.role
      ),
    },

    generatedAt: safeText(
      source.generatedAt,
      nowIso()
    ),

    kpis: {
      ticketsOpen: safeNumber(
        rawKpis.ticketsOpen,
        fallback.kpis.ticketsOpen
      ),

      ticketsUrgent: safeNumber(
        rawKpis.ticketsUrgent,
        fallback.kpis.ticketsUrgent
      ),

      clientesTotal: safeNumber(
        rawKpis.clientesTotal,
        fallback.kpis.clientesTotal
      ),

      facturasPending: safeNumber(
        rawKpis.facturasPending,
        fallback.kpis.facturasPending
      ),

      usersTotal: safeNumber(
        rawKpis.usersTotal,
        fallback.kpis.usersTotal
      ),

      facturacionTotal: safeNumber(
        rawKpis.facturacionTotal,
        fallback.kpis.facturacionTotal
      ),
    },

    alerts:
      alerts.length > 0
        ? alerts
        : fallback.alerts,

    recentActivity,

    quickActions,

    health: {
      tickets:
        source?.health?.tickets === true,
      clientes:
        source?.health?.clientes === true,
      facturas:
        source?.health?.facturas === true,
      users:
        source?.health?.users === true,
    },
  };
}

/* =========================================================
   REMOTE
========================================================= */

async function fetchRemoteSummary() {
  try {
    if (
      Http &&
      typeof Http.get ===
        "function"
    ) {
      const response =
        await Http.get(ENDPOINT);

      const data =
        safeObject(
          response?.data ||
            response
        );

      if (
        Object.keys(data).length
      ) {
        const normalized =
          normalizeSummary(data);

        return normalized;
      }
    }
  } catch (error) {
    console.warn(
      "[HomeAPI] remote summary unavailable",
      error
    );
  }

  return buildLocalSummary();
}

function buildLocalSummary() {
  const user =
    getCurrentUser();

  const appName = safeText(
    AppCore?.config?.appName,
    "Onion Support"
  );

  return normalizeSummary({
    user: {
      id: safeText(
        user?.userId || user?.id,
        null
      ),
      role: safeText(
        user?.role || user?.rol,
        "unknown"
      ),
    },

    generatedAt: nowIso(),

    kpis: {
      ticketsOpen: 0,
      ticketsUrgent: 0,
      clientesTotal: 0,
      facturasPending: 0,
      usersTotal: 0,
      facturacionTotal: 0,
    },

    alerts: [
      {
        level: "info",
        code: "LOCAL_SUMMARY",
        message: `${appName} operativo sin resumen remoto disponible.`,
      },
    ],

    recentActivity: [],

    quickActions: [],

    health: {
      tickets: false,
      clientes: false,
      facturas: false,
      users: false,
    },
  });
}

/* =========================================================
   LOADERS
========================================================= */

export async function loadHomeSummary(
  options = {}
) {
  const {
    force = false,
    preferCache = true,
  } = safeObject(options);

  if (inflightLoad) {
    return inflightLoad;
  }

  inflightLoad =
    (async () => {
      beginHomeLoad();

      try {
        if (
          force !== true &&
          preferCache === true
        ) {
          const cached =
            readCache();

          if (
            cached?.isFresh &&
            cached?.summary
          ) {
            const summary =
              normalizeSummary(
                cached.summary
              );

            writeHomeSummary(
              summary
            );
            markHomeCacheHit(
              true
            );
            setHomeSyncTimestamp(
              new Date(
                cached.savedAt
              ).toISOString()
            );
            setHomeHydrationTimestamp(
              nowIso()
            );

            completeHomeLoad({
              summary,
              syncedAt: new Date(
                cached.savedAt
              ).toISOString(),
              hydratedAt: nowIso(),
              cacheHit: true,
            });

            return {
              ok: true,
              source: "cache",
              summary,
            };
          }
        }

        const summary =
          await fetchRemoteSummary();

        writeHomeSummary(
          summary
        );
        markHomeCacheHit(false);
        setHomeSyncTimestamp(
          nowIso()
        );
        setHomeHydrationTimestamp(
          nowIso()
        );
        saveCache(summary);

        completeHomeLoad({
          summary,
          syncedAt: nowIso(),
          hydratedAt: nowIso(),
          cacheHit: false,
        });

        return {
          ok: true,
          source: "remote",
          summary,
        };
      } catch (error) {
        console.error(
          "[HomeAPI] loadHomeSummary error",
          error
        );

        rejectHomeLoad(error);

        return {
          ok: false,
          source: "error",
          error,
          summary: null,
        };
      } finally {
        inflightLoad = null;
      }
    })();

  return inflightLoad;
}

export async function refreshHomeSummary() {
  return loadHomeSummary({
    force: true,
    preferCache: false,
  });
}

export function getCachedHomeSummary() {
  const cached =
    readCache();

  if (!cached?.summary) {
    return null;
  }

  return normalizeSummary(
    cached.summary
  );
}

export function primeHomeSummaryCache(
  summary = {}
) {
  const normalized =
    normalizeSummary(summary);

  saveCache(normalized);

  return normalized;
}

export function clearHomeSummaryCache() {
  return clearCache();
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const HomeAPI = {
  loadHomeSummary,
  refreshHomeSummary,
  getCachedHomeSummary,
  primeHomeSummaryCache,
  clearHomeSummaryCache,
};

export default HomeAPI;

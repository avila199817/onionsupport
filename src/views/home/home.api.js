/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   EXTREME MODE · BACKEND REAL SUMMARY · CONTRACT SAFE

   Responsabilidades:
   - cargar summary real de la Home
   - consumir /api/dashboard/summary
   - aplicar estrategia cache-first inteligente
   - hidratar store del módulo
   - persistir cache local
   - tolerar backend envuelto o plano
   - preservar contrato esperado por home.template.js
   - evitar dobles fetch concurrentes
   - diferenciar origen real cache/remote/fallback

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

function safeBool(value) {
  return value === true;
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

function getStorageApi() {
  return AppCore?.storage || null;
}

function getCurrentUser() {
  return AppCore?.state?.user || null;
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
  ttl = HOME_CACHE_TTL
) {
  return (
    safeNumber(savedAt, 0) > 0 &&
    nowMs() - safeNumber(savedAt, 0) <=
      safeNumber(ttl, 0)
  );
}

/* =========================================================
   CACHE
========================================================= */

function buildCachePayload(summary) {
  return {
    savedAt: nowMs(),
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
    safeWarn(
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
      safeObject(
        storage.get(
          HOME_CACHE_KEY
        )
      );

    const savedAt =
      safeNumber(
        payload.savedAt,
        0
      );

    const summary =
      safeObject(
        payload.summary
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
        isFreshTimestamp(
          savedAt,
          HOME_CACHE_TTL
        ),
    };
  } catch (error) {
    safeWarn(
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
    safeWarn(
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
      id:
        safeText(
          user?.userId ||
            user?.id,
          ""
        ) || null,
      role: safeText(
        user?.role ||
          user?.rol,
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
    obj.generatedAt ||
      obj.kpis ||
      obj.alerts ||
      obj.recentActivity ||
      obj.quickActions ||
      obj.health
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

  const rawData =
    safeObject(raw.data);

  if (
    looksLikeDashboardSummary(rawData)
  ) {
    return rawData;
  }

  const rawDataData =
    safeObject(rawData.data);

  if (
    looksLikeDashboardSummary(
      rawDataData
    )
  ) {
    return rawDataData;
  }

  const rawSummary =
    safeObject(raw.summary);

  if (
    looksLikeDashboardSummary(
      rawSummary
    )
  ) {
    return rawSummary;
  }

  const rawDataSummary =
    safeObject(rawData.summary);

  if (
    looksLikeDashboardSummary(
      rawDataSummary
    )
  ) {
    return rawDataSummary;
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

function normalizeHealth(
  source = {},
  fallback = {}
) {
  const health =
    safeObject(source);

  return {
    tickets:
      safeBool(
        health.tickets
      ) ||
      safeBool(
        fallback.tickets
      ),

    clientes:
      safeBool(
        health.clientes
      ) ||
      safeBool(
        fallback.clientes
      ),

    facturas:
      safeBool(
        health.facturas
      ) ||
      safeBool(
        fallback.facturas
      ),

    users:
      safeBool(
        health.users
      ) ||
      safeBool(
        fallback.users
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
      .map(
        normalizeQuickAction
      )
      .filter(Boolean);

  return {
    user: {
      id:
        safeText(
          source?.user?.id,
          ""
        ) ||
        fallback.user.id,
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

    health: normalizeHealth(
      source.health,
      fallback.health
    ),
  };
}

/* =========================================================
   FALLBACK / REMOTE
========================================================= */

function buildLocalSummary() {
  const user =
    getCurrentUser();

  const appName = safeText(
    AppCore?.config?.appName,
    "Onion Support"
  );

  return normalizeSummary({
    user: {
      id:
        safeText(
          user?.userId ||
            user?.id,
          ""
        ) || null,
      role: safeText(
        user?.role ||
          user?.rol,
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

async function fetchRemoteSummary() {
  const client =
    getHttpClient();

  if (!client) {
    safeWarn(
      "[HomeAPI] no hay cliente HTTP disponible"
    );
    return {
      ok: false,
      source: "fallback",
      summary:
        buildLocalSummary(),
      error: new Error(
        "No hay cliente HTTP disponible."
      ),
    };
  }

  try {
    const response =
      await client.get(
        ENDPOINT,
        {
          auth: true,
          retries: 1,
        }
      );

    const data =
      safeObject(
        response?.data ||
          response
      );

    if (
      !Object.keys(data).length
    ) {
      const summary =
        buildLocalSummary();

      return {
        ok: true,
        source: "fallback",
        summary,
      };
    }

    return {
      ok: true,
      source: "remote",
      summary:
        normalizeSummary(
          data
        ),
    };
  } catch (error) {
    safeWarn(
      "[HomeAPI] remote summary unavailable",
      error
    );

    return {
      ok: false,
      source: "fallback",
      summary:
        buildLocalSummary(),
      error,
    };
  }
}

/* =========================================================
   STORE HYDRATION
========================================================= */

function hydrateSummaryIntoStore({
  summary,
  syncedAt,
  hydratedAt,
  cacheHit = false,
} = {}) {
  writeHomeSummary(
    summary
  );

  markHomeCacheHit(
    cacheHit === true
  );

  setHomeSyncTimestamp(
    safeText(
      syncedAt,
      nowIso()
    )
  );

  setHomeHydrationTimestamp(
    safeText(
      hydratedAt,
      nowIso()
    )
  );

  completeHomeLoad({
    summary,
    syncedAt: safeText(
      syncedAt,
      nowIso()
    ),
    hydratedAt: safeText(
      hydratedAt,
      nowIso()
    ),
    cacheHit:
      cacheHit === true,
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
            const hydratedAt =
              nowIso();

            const summary =
              normalizeSummary(
                cached.summary
              );

            hydrateSummaryIntoStore({
              summary,
              syncedAt:
                new Date(
                  cached.savedAt
                ).toISOString(),
              hydratedAt,
              cacheHit: true,
            });

            safeEmit(
              "home:summary:loaded",
              {
                source: "cache",
                cachedAt:
                  cached.savedAt,
              }
            );

            return {
              ok: true,
              source: "cache",
              summary,
            };
          }
        }

        const remote =
          await fetchRemoteSummary();

        const summary =
          normalizeSummary(
            remote.summary
          );

        const syncedAt =
          remote.source ===
          "remote"
            ? nowIso()
            : summary.generatedAt ||
              nowIso();

        const hydratedAt =
          nowIso();

        hydrateSummaryIntoStore({
          summary,
          syncedAt,
          hydratedAt,
          cacheHit: false,
        });

        if (
          remote.source ===
          "remote"
        ) {
          saveCache(summary);
        }

        safeEmit(
          "home:summary:loaded",
          {
            source:
              remote.source,
            ok:
              remote.ok ===
              true,
          }
        );

        return {
          ok: true,
          source:
            remote.source,
          summary,
          fallback:
            remote.source !==
            "remote",
          error:
            remote.error ||
            null,
        };
      } catch (error) {
        safeError(
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

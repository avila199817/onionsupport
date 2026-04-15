/* =========================================================
   Onion SPA - Home API
   Archivo: src/views/home/home.api.js

   Responsabilidades:
   - cargar summary de la Home
   - aplicar estrategia cache-first
   - hidratar store del módulo
   - persistir cache local
   - tolerar ausencia de backend específico
   - dejar preparado un punto único para resumen remoto
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

const ENDPOINT = "/api/home/summary";

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
   NORMALIZATION
========================================================= */

function createFallbackSummary() {
  return {
    status: "idle",
    cards: 1,
    metrics: [
      {
        id: "home",
        label: "Vista",
        value: "Home",
        hint: "Base inicial montada",
      },
      {
        id: "shell",
        label: "Sistema",
        value: "Operativo",
        hint: "Shell y router activos",
      },
      {
        id: "project",
        label: "Proyecto",
        value: "Onion Support",
        hint: "Preparado para crecer",
      },
    ],
    recentActivity: [],
    generatedAt: nowIso(),
  };
}

function normalizeMetric(
  metric,
  index = 0
) {
  const item =
    safeObject(metric);

  return {
    id: safeText(
      item.id,
      `metric-${index + 1}`
    ),
    label: safeText(
      item.label,
      "Métrica"
    ),
    value: safeText(
      item.value,
      "—"
    ),
    hint: safeText(
      item.hint,
      ""
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
    title: safeText(
      item.title,
      "Actividad"
    ),
    description: safeText(
      item.description,
      ""
    ),
    createdAt: safeText(
      item.createdAt,
      ""
    ),
  };
}

function normalizeSummary(
  payload = {}
) {
  const source =
    safeObject(payload);

  const fallback =
    createFallbackSummary();

  const metrics =
    safeArray(source.metrics)
      .map(normalizeMetric)
      .filter(Boolean);

  const recentActivity =
    safeArray(
      source.recentActivity
    )
      .map(normalizeActivityItem)
      .filter(Boolean);

  return {
    status: safeText(
      source.status,
      fallback.status
    ),
    cards: safeNumber(
      source.cards,
      metrics.length ||
        fallback.cards
    ),
    metrics:
      metrics.length > 0
        ? metrics
        : fallback.metrics,
    recentActivity,
    generatedAt: safeText(
      source.generatedAt,
      nowIso()
    ),
  };
}

/* =========================================================
   REMOTE
========================================================= */

async function fetchRemoteSummary() {
  /*
    Fase inicial:
    intentamos endpoint real.
    Si no existe o falla, degradamos a summary local.
  */

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
        return normalizeSummary(
          data.summary || data
        );
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
    status: "local",
    cards: 1,
    metrics: [
      {
        id: "home",
        label: "Vista",
        value: "Home",
        hint: "Base inicial montada",
      },
      {
        id: "session",
        label: "Sesión",
        value:
          user
            ? "Activa"
            : "Sin sesión",
        hint: user
          ? "Usuario autenticado"
          : "Sin usuario resuelto",
      },
      {
        id: "project",
        label: "Proyecto",
        value: appName,
        hint: "Dashboard preparado",
      },
    ],
    recentActivity: [],
    generatedAt: nowIso(),
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

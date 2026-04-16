/* =========================================================
   Onion SPA - Usuarios Actions
   Archivo: src/views/usuarios/usuarios.actions.js

   FINAL PRO SYSTEM · ADMIN USERS ACTIONS · 10/10

   Responsabilidades:
   - centralizar acciones reales de la vista Usuarios
   - coordinar API + Store del módulo
   - encapsular hydrate / refresh / search / filtros / paginación
   - gestionar selección y usuario activo
   - devolver resultados estables para la vista
   - emitir eventos consistentes para tracing
   - mantener coherencia estricta con usuarios.api.js y usuarios.store.js
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";

import {
  loadUsuariosList,
  refreshUsuariosList as refreshUsuariosListApi,
} from "./usuarios.api.js";

import {
  getUsuariosSnapshot,
  getUsuariosStatus,

  readUsuariosRows,
  readUsuariosMeta,
  readUsuariosStats,
  readUsuariosAlerts,
  readUsuariosParams,
  readUsuariosUi,
  readUsuarioById,

  beginUsuariosLoad,
  completeUsuariosLoad,
  rejectUsuariosLoad,

  writeUsuariosRows,
  writeUsuariosMeta,
  writeUsuariosStats,
  writeUsuariosAlerts,
  writeUsuariosParams,

  mergeUsuariosParams,

  setUsuariosSearch,
  setUsuariosRoleFilter,
  setUsuariosStatusFilter,
  setUsuariosSort,
  setUsuariosPage,
  setUsuariosPageSize,

  setUsuariosAction,
  setUsuariosSearchDraftUi,
  setUsuariosActiveFilterUi,

  selectUsuario as selectUsuarioInStore,
  clearAllUsuariosSelected,
} from "./usuarios.store.js";

/* =========================================================
   INTERNAL
========================================================= */

let inflightHydrate = null;
let inflightRefresh = null;

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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch (error) {
    console.warn(
      "[UsuariosActions] emit warning",
      error
    );
  }
}

function buildMeta(
  extra = {}
) {
  return {
    usuariosStatus:
      getUsuariosStatus(),
    params:
      readUsuariosParams(),
    ...safeObject(extra),
  };
}

function createResult({
  ok = true,
  action = "",
  data = null,
  error = null,
  meta = {},
} = {}) {
  return {
    ok: ok === true,
    action: safeText(action),
    data,
    error: error || null,
    meta: safeObject(meta),
  };
}

function getRouter() {
  if (
    Router &&
    typeof Router.navigate ===
      "function"
  ) {
    return Router;
  }

  if (
    AppCore?.modules?.Router &&
    typeof AppCore.modules.Router
      .navigate === "function"
  ) {
    return AppCore.modules.Router;
  }

  if (
    AppCore?.Router &&
    typeof AppCore.Router.navigate ===
      "function"
  ) {
    return AppCore.Router;
  }

  return null;
}

function resolveUsuarioPath(
  userId = ""
) {
  const normalized =
    safeText(userId, "");

  return normalized
    ? `/usuarios/${normalized}`
    : "/usuarios";
}

function normalizeApiListResult(
  result = {}
) {
  const payload =
    safeObject(result);

  const list = safeObject(
    payload.list
  );

  return {
    rows: safeArray(list.rows),
    meta: safeObject(list.meta),
    stats: safeObject(list.stats),
    alerts: safeArray(list.alerts),
    source: safeText(
      payload.source,
      ""
    ),
    remoteOk:
      payload.remoteOk === true,
    degraded:
      payload.degraded === true,
    cacheHit:
      payload.cacheHit === true,
    error:
      payload.error || null,
  };
}

function applyApiResultToStore(
  result = {}
) {
  const normalized =
    normalizeApiListResult(result);

  completeUsuariosLoad({
    rows: normalized.rows,
    meta: normalized.meta,
    stats: normalized.stats,
    alerts: normalized.alerts,
    params: readUsuariosParams(),
    source: normalized.source,
    remoteOk:
      normalized.remoteOk === true,
    degraded:
      normalized.degraded === true,
    cacheHit:
      normalized.cacheHit === true,
    error:
      normalized.error || null,
  });

  return {
    rows: normalized.rows,
    meta: normalized.meta,
    stats: normalized.stats,
    alerts: normalized.alerts,
  };
}

function getCurrentData() {
  return {
    rows: readUsuariosRows(),
    meta: readUsuariosMeta(),
    stats: readUsuariosStats(),
    alerts: readUsuariosAlerts(),
  };
}

/* =========================================================
   LOAD / HYDRATE
========================================================= */

export async function hydrateUsuarios(
  options = {}
) {
  if (inflightHydrate) {
    return inflightHydrate;
  }

  const config =
    safeObject(options);

  inflightHydrate =
    (async () => {
      try {
        setUsuariosAction(
          "hydrate"
        );

        safeEmit(
          "usuarios:action:hydrate:start",
          {
            options: config,
          }
        );

        const currentParams =
          readUsuariosParams();

        const finalParams = {
          ...currentParams,
          ...safeObject(
            config.params ||
              config.query
          ),
        };

        writeUsuariosParams(
          finalParams
        );

        beginUsuariosLoad(
          finalParams
        );

        const result =
          await loadUsuariosList({
            ...finalParams,
            force:
              config.force === true,
            preferCache:
              config.preferCache !==
              false,
          });

        if (
          result?.ok !== true ||
          !result?.list
        ) {
          rejectUsuariosLoad(
            result?.error || null
          );

          return createResult({
            ok: false,
            action: "hydrate",
            data: null,
            error:
              result?.error ||
              new Error(
                "No se pudo cargar el listado de usuarios."
              ),
            meta: buildMeta({
              source:
                result?.source ||
                "",
            }),
          });
        }

        const data =
          applyApiResultToStore(
            result
          );

        safeEmit(
          "usuarios:action:hydrate:success",
          {
            source:
              result?.source ||
              "",
            rows:
              data?.rows?.length || 0,
          }
        );

        return createResult({
          ok: true,
          action: "hydrate",
          data,
          meta: buildMeta({
            source:
              result?.source ||
              "",
            remoteOk:
              result?.remoteOk ===
              true,
            degraded:
              result?.degraded ===
              true,
            cacheHit:
              result?.cacheHit ===
              true,
          }),
        });
      } catch (error) {
        rejectUsuariosLoad(error);

        safeEmit(
          "usuarios:action:hydrate:error",
          {
            error,
          }
        );

        return createResult({
          ok: false,
          action: "hydrate",
          error,
          meta: buildMeta(),
        });
      } finally {
        inflightHydrate = null;
      }
    })();

  return inflightHydrate;
}

export async function refreshUsuariosList(
  options = {}
) {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  const config =
    safeObject(options);

  inflightRefresh =
    (async () => {
      try {
        setUsuariosAction(
          "refresh"
        );

        safeEmit(
          "usuarios:action:refresh:start",
          {
            options: config,
          }
        );

        const params = {
          ...readUsuariosParams(),
          ...safeObject(
            config.params ||
              config.query
          ),
        };

        writeUsuariosParams(
          params
        );
        beginUsuariosLoad(
          params
        );

        const result =
          await refreshUsuariosListApi(
            params
          );

        if (
          result?.ok !== true ||
          !result?.list
        ) {
          rejectUsuariosLoad(
            result?.error || null
          );

          return createResult({
            ok: false,
            action: "refresh",
            data: null,
            error:
              result?.error ||
              new Error(
                "No se pudo refrescar el listado de usuarios."
              ),
            meta: buildMeta({
              source:
                result?.source ||
                "",
            }),
          });
        }

        const data =
          applyApiResultToStore(
            result
          );

        safeEmit(
          "usuarios:action:refresh:success",
          {
            source:
              result?.source ||
              "",
            rows:
              data?.rows?.length || 0,
          }
        );

        return createResult({
          ok: true,
          action: "refresh",
          data,
          meta: buildMeta({
            source:
              result?.source ||
              "",
            remoteOk:
              result?.remoteOk ===
              true,
            degraded:
              result?.degraded ===
              true,
            cacheHit:
              result?.cacheHit ===
              true,
          }),
        });
      } catch (error) {
        rejectUsuariosLoad(error);

        safeEmit(
          "usuarios:action:refresh:error",
          {
            error,
          }
        );

        return createResult({
          ok: false,
          action: "refresh",
          error,
          meta: buildMeta(),
        });
      } finally {
        inflightRefresh = null;
      }
    })();

  return inflightRefresh;
}

/* =========================================================
   SEARCH / FILTERS / SORT / PAGINATION
========================================================= */

export async function searchUsuarios(
  value = "",
  options = {}
) {
  const search =
    safeText(value, "");

  setUsuariosAction("search");
  setUsuariosSearchDraftUi(
    search
  );
  setUsuariosSearch(search);

  safeEmit(
    "usuarios:action:search",
    {
      search,
    }
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

export async function applyUsuariosRoleFilter(
  value = "",
  options = {}
) {
  const role = safeText(
    value,
    ""
  );

  setUsuariosAction(
    "filter-role"
  );
  setUsuariosActiveFilterUi(
    role ? "role" : ""
  );
  setUsuariosRoleFilter(role);

  safeEmit(
    "usuarios:action:filter:role",
    {
      role,
    }
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

export async function applyUsuariosStatusFilter(
  value = "",
  options = {}
) {
  const status =
    safeText(value, "");

  setUsuariosAction(
    "filter-status"
  );
  setUsuariosActiveFilterUi(
    status ? "status" : ""
  );
  setUsuariosStatusFilter(
    status
  );

  safeEmit(
    "usuarios:action:filter:status",
    {
      status,
    }
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

export async function changeUsuariosSort(
  sortBy = "createdAt",
  sortDir = "desc",
  options = {}
) {
  setUsuariosAction("sort");
  setUsuariosSort(
    sortBy,
    sortDir
  );

  safeEmit(
    "usuarios:action:sort",
    {
      sortBy,
      sortDir,
    }
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

export async function changeUsuariosPage(
  page = 1,
  options = {}
) {
  const nextPage = Math.max(
    1,
    safeNumber(page, 1)
  );

  setUsuariosAction("page");
  setUsuariosPage(nextPage);

  safeEmit(
    "usuarios:action:page",
    {
      page: nextPage,
    }
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

export async function changeUsuariosPageSize(
  pageSize = 20,
  options = {}
) {
  const nextPageSize = Math.max(
    1,
    safeNumber(pageSize, 20)
  );

  setUsuariosAction(
    "page-size"
  );
  setUsuariosPageSize(
    nextPageSize
  );

  safeEmit(
    "usuarios:action:page-size",
    {
      pageSize:
        nextPageSize,
    }
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

export async function nextUsuariosPage(
  options = {}
) {
  const meta = readUsuariosMeta();

  if (
    meta?.hasNextPage !== true
  ) {
    return createResult({
      ok: false,
      action: "next-page",
      error: new Error(
        "No hay siguiente página."
      ),
      meta: buildMeta(),
    });
  }

  return changeUsuariosPage(
    safeNumber(
      meta.page,
      1
    ) + 1,
    options
  );
}

export async function prevUsuariosPage(
  options = {}
) {
  const meta = readUsuariosMeta();

  if (
    meta?.hasPrevPage !== true
  ) {
    return createResult({
      ok: false,
      action: "prev-page",
      error: new Error(
        "No hay página anterior."
      ),
      meta: buildMeta(),
    });
  }

  return changeUsuariosPage(
    Math.max(
      1,
      safeNumber(
        meta.page,
        1
      ) - 1
    ),
    options
  );
}

export async function resetUsuariosListFilters(
  options = {}
) {
  setUsuariosAction(
    "reset-filters"
  );

  const nextParams = {
    ...readUsuariosParams(),
    q: "",
    role: "",
    status: "",
    page: 1,
  };

  writeUsuariosParams(
    nextParams
  );
  setUsuariosSearchDraftUi("");
  setUsuariosActiveFilterUi(
    ""
  );

  safeEmit(
    "usuarios:action:filters:reset",
    {}
  );

  return hydrateUsuarios({
    ...safeObject(options),
    force:
      options?.force === true,
    preferCache:
      options?.preferCache !==
      false,
  });
}

/* =========================================================
   SELECTION / ACTIVE USER
========================================================= */

export function selectUsuario(
  userId = ""
) {
  const normalized =
    safeText(userId, "");

  if (!normalized) {
    return createResult({
      ok: false,
      action: "select-user",
      error: new Error(
        "userId requerido."
      ),
      meta: buildMeta(),
    });
  }

  setUsuariosAction(
    "select-user"
  );
  selectUsuarioInStore(
    normalized
  );

  safeEmit(
    "usuarios:action:select-user",
    {
      userId: normalized,
    }
  );

  return createResult({
    ok: true,
    action: "select-user",
    data: readUsuarioById(
      normalized
    ),
    meta: buildMeta({
      activeUserId:
        normalized,
    }),
  });
}

export function clearUsuariosSelectionAction() {
  setUsuariosAction(
    "clear-selection"
  );
  clearAllUsuariosSelected();

  safeEmit(
    "usuarios:action:clear-selection",
    {}
  );

  return createResult({
    ok: true,
    action:
      "clear-selection",
    data: {
      selectedIds: [],
    },
    meta: buildMeta(),
  });
}

/* =========================================================
   DETAIL / NAVIGATION
========================================================= */

export function getUsuariosActionContext() {
  return {
    snapshot:
      getUsuariosSnapshot(),
    status: getUsuariosStatus(),
    data: getCurrentData(),
    params:
      readUsuariosParams(),
    ui: readUsuariosUi(),
  };
}

export async function openUsuarioDetail(
  userId = "",
  options = {}
) {
  const normalized =
    safeText(userId, "");

  if (!normalized) {
    return createResult({
      ok: false,
      action: "open-detail",
      error: new Error(
        "userId requerido."
      ),
      meta: buildMeta(),
    });
  }

  setUsuariosAction(
    "open-detail"
  );
  selectUsuarioInStore(
    normalized
  );

  const router =
    getRouter();

  if (
    router &&
    typeof router.navigate ===
      "function"
  ) {
    try {
      const target =
        resolveUsuarioPath(
          normalized
        );

      await Promise.resolve(
        router.navigate(target, {
          ...safeObject(options),
          force:
            options?.force ===
            true,
        })
      );

      return createResult({
        ok: true,
        action: "open-detail",
        data: {
          target,
          user:
            readUsuarioById(
              normalized
            ),
        },
        meta: buildMeta({
          target,
          activeUserId:
            normalized,
        }),
      });
    } catch (error) {
      return createResult({
        ok: false,
        action: "open-detail",
        error,
        meta: buildMeta({
          activeUserId:
            normalized,
        }),
      });
    }
  }

  return createResult({
    ok: true,
    action: "open-detail",
    data: {
      target:
        resolveUsuarioPath(
          normalized
        ),
      user:
        readUsuarioById(
          normalized
        ),
    },
    meta: buildMeta({
      activeUserId:
        normalized,
    }),
  });
}

/* =========================================================
   LOW LEVEL SYNC HELPERS
========================================================= */

export function hydrateUsuariosDataDirect(
  payload = {}
) {
  const source =
    safeObject(payload);

  if (
    Array.isArray(source.rows)
  ) {
    writeUsuariosRows(
      source.rows
    );
  }

  if (
    source.meta &&
    typeof source.meta ===
      "object"
  ) {
    writeUsuariosMeta(
      source.meta
    );
  }

  if (
    source.stats &&
    typeof source.stats ===
      "object"
  ) {
    writeUsuariosStats(
      source.stats
    );
  }

  if (
    Array.isArray(
      source.alerts
    )
  ) {
    writeUsuariosAlerts(
      source.alerts
    );
  }

  if (
    source.params &&
    typeof source.params ===
      "object"
  ) {
    mergeUsuariosParams(
      source.params
    );
  }

  return createResult({
    ok: true,
    action:
      "hydrate-direct",
    data: getCurrentData(),
    meta: buildMeta(),
  });
}

/* =========================================================
   EXPORTS
========================================================= */

export const UsuariosActions = {
  hydrateUsuarios,
  refreshUsuariosList,

  searchUsuarios,
  applyUsuariosRoleFilter,
  applyUsuariosStatusFilter,
  changeUsuariosSort,
  changeUsuariosPage,
  changeUsuariosPageSize,
  nextUsuariosPage,
  prevUsuariosPage,
  resetUsuariosListFilters,

  selectUsuario,
  clearUsuariosSelectionAction,

  openUsuarioDetail,
  getUsuariosActionContext,
  hydrateUsuariosDataDirect,
};

export default UsuariosActions;

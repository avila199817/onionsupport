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
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";

import {
  loadUsuarios,
  refreshUsuarios,
} from "./usuarios.api.js";

import {
  getUsuariosSnapshot,
  getUsuariosStatus,
  readUsuariosData,
  readUsuariosItems,
  readUsuariosMeta,
  readUsuariosQuery,
  readUsuariosSelection,
  findUsuarioById,

  beginUsuariosLoad,
  completeUsuariosLoad,
  rejectUsuariosLoad,

  writeUsuariosData,
  writeUsuariosQuery,
  mergeUsuariosQuery,

  setUsuariosSearchQuery,
  setUsuariosRoleFilter,
  setUsuariosStatusFilter,
  setUsuariosSort,
  setUsuariosPage,
  setUsuariosPageSize,
  resetUsuariosFilters,

  setUsuariosAction,
  setUsuariosSearchInput,
  openUsuariosFilters,
  closeUsuariosFilters,
  toggleUsuariosFilters,

  setUsuariosActiveUser,
  setUsuariosSelectionIds,
  toggleUsuariosSelectionId,
  selectAllUsuarios,
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

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {
    console.warn(...args);
  }
}

function buildMeta(
  extra = {}
) {
  return {
    usuariosStatus:
      getUsuariosStatus(),
    query: readUsuariosQuery(),
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

function applyApiResultToStore(
  result = {}
) {
  const payload =
    safeObject(result);

  if (!payload?.data) {
    return null;
  }

  completeUsuariosLoad({
    data: payload.data,
    source: payload.source,
    remoteOk:
      payload.remoteOk === true,
    degraded:
      payload.degraded === true,
    cacheHit:
      payload.cacheHit === true,
  });

  return payload.data;
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

        beginUsuariosLoad();

        const currentQuery =
          readUsuariosQuery();

        const finalQuery = {
          ...currentQuery,
          ...safeObject(
            config.query
          ),
        };

        if (
          Object.keys(finalQuery)
            .length
        ) {
          writeUsuariosQuery(
            finalQuery
          );
        }

        const result =
          await loadUsuarios({
            ...finalQuery,
            force:
              config.force === true,
            preferCache:
              config.preferCache !==
              false,
          });

        if (
          result?.ok !== true ||
          !result?.data
        ) {
          rejectUsuariosLoad(
            result?.error || null
          );

          return createResult({
            ok: false,
            action: "hydrate",
            data: result?.data || null,
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
            result,
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

        beginUsuariosLoad();

        const query = {
          ...readUsuariosQuery(),
          ...safeObject(
            config.query
          ),
        };

        const result =
          await refreshUsuarios(
            query
          );

        if (
          result?.ok !== true ||
          !result?.data
        ) {
          rejectUsuariosLoad(
            result?.error || null
          );

          return createResult({
            ok: false,
            action: "refresh",
            data: result?.data || null,
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
            result,
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
  setUsuariosSearchInput(
    search
  );
  setUsuariosSearchQuery(
    search
  );

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

  if (meta?.hasNext !== true) {
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

  if (meta?.hasPrev !== true) {
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
  resetUsuariosFilters();
  closeUsuariosFilters();

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
   UI FILTERS
========================================================= */

export function openUsuariosFiltersPanel() {
  setUsuariosAction(
    "open-filters"
  );
  openUsuariosFilters();

  return createResult({
    ok: true,
    action: "open-filters",
    data: {
      filtersOpen: true,
    },
    meta: buildMeta(),
  });
}

export function closeUsuariosFiltersPanel() {
  setUsuariosAction(
    "close-filters"
  );
  closeUsuariosFilters();

  return createResult({
    ok: true,
    action: "close-filters",
    data: {
      filtersOpen: false,
    },
    meta: buildMeta(),
  });
}

export function toggleUsuariosFiltersPanel() {
  setUsuariosAction(
    "toggle-filters"
  );
  toggleUsuariosFilters();

  return createResult({
    ok: true,
    action: "toggle-filters",
    data: {
      filtersOpen:
        readUsuariosSelection()
          ?.filtersOpen === true,
    },
    meta: buildMeta(),
  });
}

/* =========================================================
   SELECTION
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
  setUsuariosActiveUser(
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
    data: findUsuarioById(
      normalized
    ),
    meta: buildMeta({
      activeUserId:
        normalized,
    }),
  });
}

export function setUsuariosSelection(
  ids = []
) {
  setUsuariosAction(
    "set-selection"
  );
  setUsuariosSelectionIds(ids);

  return createResult({
    ok: true,
    action: "set-selection",
    data: {
      selectedIds:
        readUsuariosSelection()
          ?.selectedIds || [],
    },
    meta: buildMeta(),
  });
}

export function toggleUsuarioSelection(
  userId = ""
) {
  const normalized =
    safeText(userId, "");

  if (!normalized) {
    return createResult({
      ok: false,
      action:
        "toggle-selection",
      error: new Error(
        "userId requerido."
      ),
      meta: buildMeta(),
    });
  }

  setUsuariosAction(
    "toggle-selection"
  );
  toggleUsuariosSelectionId(
    normalized
  );

  safeEmit(
    "usuarios:action:toggle-selection",
    {
      userId: normalized,
    }
  );

  return createResult({
    ok: true,
    action:
      "toggle-selection",
    data: {
      selectedIds:
        readUsuariosSelection()
          ?.selectedIds || [],
    },
    meta: buildMeta(),
  });
}

export function selectAllVisibleUsuarios() {
  setUsuariosAction(
    "select-all"
  );
  selectAllUsuarios();

  safeEmit(
    "usuarios:action:select-all",
    {
      count:
        readUsuariosItems()
          .length,
    }
  );

  return createResult({
    ok: true,
    action: "select-all",
    data: {
      selectedIds:
        readUsuariosSelection()
          ?.selectedIds || [],
    },
    meta: buildMeta(),
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
    data: readUsuariosData(),
    query: readUsuariosQuery(),
    selection:
      readUsuariosSelection(),
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
  setUsuariosActiveUser(
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
            findUsuarioById(
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
        findUsuarioById(
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

  openUsuariosFiltersPanel,
  closeUsuariosFiltersPanel,
  toggleUsuariosFiltersPanel,

  selectUsuario,
  setUsuariosSelection,
  toggleUsuarioSelection,
  selectAllVisibleUsuarios,
  clearUsuariosSelectionAction,

  openUsuarioDetail,
  getUsuariosActionContext,
};

export default UsuariosActions;

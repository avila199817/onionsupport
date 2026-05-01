/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 13/10
   EXTREME MODULE BRIDGE · ROUTER READY · LEGACY READY

   RESPONSABILIDADES:
   - punto de entrada único del módulo incidencias
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y incidenciasView.js
   - init / mount / render / reload / destroy seguros
   - exponer create / modal / helpers públicos
   - exponer filtros y búsqueda pública
   - evitar duplicidad de lógica en index.js
   - no reimplementar lógica del View: solo delegar
   - registrar bridge global estable para topbar/search/router

   HARDENING PRO:
   - import por namespace para tolerar default/named exports
   - fallback si cambia nombre del módulo exportado
   - re-export default + named
   - superficie pública estable
   - compatible con imports antiguos
   - lazy wrappers seguros
   - no rompe si un submódulo cambia su forma de export
   - no pisa globals existentes sin fusionar
   - bridge AppCore.modules si AppCore está expuesto en window/globalThis
========================================================= */

import * as IncidenciasViewModule from "./incidenciasView.js";
import * as IncidenciasCreateModalModule from "./incidencias.create.modal.js";
import * as IncidenciasModalModule from "./incidencias.modal.js";

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function getGlobalRoot() {
  try {
    if (typeof globalThis !== "undefined") return globalThis;
  } catch {}

  try {
    if (typeof window !== "undefined") return window;
  } catch {}

  return {};
}

function pickModuleExport(moduleObject = {}, names = []) {
  const source = safeObject(moduleObject);

  for (const name of names) {
    const value = source?.[name];

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

export const IncidenciasView =
  pickModuleExport(IncidenciasViewModule, [
    "default",
    "IncidenciasView",
    "OnionIncidenciasView",
    "View",
  ]) || null;

export const IncidenciasCreateModal =
  pickModuleExport(IncidenciasCreateModalModule, [
    "default",
    "IncidenciasCreateModal",
    "IncidenciasCreateView",
    "OnionIncidenciasCreateModal",
    "OnionIncidenciasCreateView",
    "CreateModal",
  ]) || null;

export const IncidenciasModal =
  pickModuleExport(IncidenciasModalModule, [
    "default",
    "IncidenciasModal",
    "OnionIncidenciasModal",
    "TicketModal",
    "OnionTicketModal",
    "DetailModal",
  ]) || null;

export default IncidenciasView;

/* =========================================================
   LIVE TARGETS
========================================================= */

function getViewTarget() {
  const root = getGlobalRoot();

  return (
    IncidenciasView ||
    root?.OnionIncidenciasView ||
    root?.IncidenciasView ||
    root?.OnionIncidenciasUI ||
    root?.OnionIncidencias?.view ||
    null
  );
}

function getCreateModalTarget() {
  const root = getGlobalRoot();

  return (
    IncidenciasCreateModal ||
    root?.OnionIncidenciasCreateModal ||
    root?.IncidenciasCreateModal ||
    root?.OnionIncidencias?.createModal ||
    null
  );
}

function getDetailModalTarget() {
  const root = getGlobalRoot();

  return (
    IncidenciasModal ||
    root?.OnionIncidenciasModal ||
    root?.IncidenciasModal ||
    root?.OnionIncidencias?.modal ||
    null
  );
}

/* =========================================================
   INTERNAL SAFE CALL
========================================================= */

function safeCall(target, method, args = [], fallback = undefined) {
  try {
    const fn = target?.[method];

    if (typeof fn === "function") {
      return fn.apply(target, args);
    }
  } catch (error) {
    safeWarn(`safeCall falló: ${method}`, error);
  }

  return fallback;
}

function safeCallAny(target, methods = [], args = [], fallback = undefined) {
  const names = Array.isArray(methods) ? methods : [methods];

  for (const method of names) {
    const result = safeCall(target, method, args, undefined);

    if (result !== undefined) {
      return result;
    }
  }

  return fallback;
}

function safeWarn(...args) {
  try {
    const root = getGlobalRoot();
    root?.AppCore?.utils?.warn?.("[IncidenciasIndex]", ...args);
  } catch {}

  try {
    console.warn("[IncidenciasIndex]", ...args);
  } catch {}
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;
  const root = getGlobalRoot();

  try {
    root?.AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      emitted = true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  safeCallAny(getViewTarget(), ["init", "mount"], args);

export const mount = (...args) =>
  safeCallAny(getViewTarget(), ["mount", "init"], args);

export const render = (...args) =>
  safeCallAny(getViewTarget(), ["render", "scheduleRender"], args);

export const scheduleRender = (...args) =>
  safeCallAny(getViewTarget(), ["scheduleRender", "render"], args);

export const reload = (...args) =>
  safeCallAny(getViewTarget(), ["reload", "refresh"], args);

export const refresh = (...args) =>
  safeCallAny(getViewTarget(), ["refresh", "reload"], args);

export const destroy = (...args) =>
  safeCallAny(getViewTarget(), ["destroy", "unmount"], args);

export const unmount = (...args) =>
  safeCallAny(getViewTarget(), ["unmount", "destroy"], args);

/* =========================================================
   ACTIONS API
========================================================= */

export const openTicket = (...args) =>
  safeCallAny(getViewTarget(), ["openTicket", "open", "openById"], args);

export const openTicketById = (...args) =>
  safeCallAny(getViewTarget(), ["openTicket", "openById", "open"], args);

export const openById = openTicketById;

export const openTicketFromExternalRequest = (...args) =>
  safeCallAny(getViewTarget(), ["openTicketFromExternalRequest", "open"], args);

export const openTicketFromLocationOnce = (...args) =>
  safeCallAny(getViewTarget(), ["openTicketFromLocationOnce"], args);

export const closeTicket = (...args) =>
  safeCallAny(getViewTarget(), ["closeTicket", "close"], args);

export const createIncidencia = (...args) =>
  safeCallAny(getViewTarget(), ["createIncidencia", "create"], args);

export const create = createIncidencia;

export const exportCsv = (...args) =>
  safeCallAny(getViewTarget(), ["exportCsv", "export"], args);

export const copyTicketId = (...args) =>
  safeCallAny(getViewTarget(), ["copyTicketId", "copy"], args);

export const refreshTicketDetail = (...args) =>
  safeCallAny(getViewTarget(), ["refreshTicketDetail", "refreshDetail"], args);

/* =========================================================
   FILTER / SEARCH API
========================================================= */

export const setFilter = (...args) =>
  safeCallAny(getViewTarget(), ["setFilter"], args);

export const setSearchQuery = (...args) =>
  safeCallAny(getViewTarget(), ["setSearchQuery", "search"], args);

export const search = setSearchQuery;

export const clearFilters = (...args) =>
  safeCallAny(getViewTarget(), ["clearFilters"], args);

export const clearSearchOnly = (...args) =>
  safeCallAny(getViewTarget(), ["clearSearchOnly", "clearSearch"], args);

export const clearSearch = clearSearchOnly;

/* =========================================================
   PAGINATION API
========================================================= */

export const goToPage = (...args) =>
  safeCallAny(getViewTarget(), ["goToPage"], args);

export const goPrevPage = (...args) =>
  safeCallAny(getViewTarget(), ["goPrevPage", "prevPage"], args);

export const goNextPage = (...args) =>
  safeCallAny(getViewTarget(), ["goNextPage", "nextPage"], args);

export const changePageSize = (...args) =>
  safeCallAny(getViewTarget(), ["changePageSize", "setPageSize"], args);

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  safeCallAny(getViewTarget(), ["getItems"], args, []);

export const getFilteredItems = (...args) =>
  safeCallAny(getViewTarget(), ["getFilteredItems"], args, []);

export const getPageItems = (...args) =>
  safeCallAny(getViewTarget(), ["getPageItems"], args, []);

export const getPagination = (...args) =>
  safeCallAny(getViewTarget(), ["getPagination"], args, null);

export const getTicketById = (...args) =>
  safeCallAny(getViewTarget(), ["getTicketById", "findTicketById"], args, null);

export const findTicketById = (...args) =>
  safeCallAny(getViewTarget(), ["findTicketById", "getTicketById"], args, null);

export const mergeTicketDetailWithStoreSnapshot = (...args) =>
  safeCallAny(getViewTarget(), ["mergeTicketDetailWithStoreSnapshot"], args, null);

export const getState = (...args) =>
  safeCallAny(getViewTarget(), ["getState"], args, null);

/* =========================================================
   CREATE MODAL API
========================================================= */

export const openCreate = (...args) => {
  const result = safeCallAny(getCreateModalTarget(), ["open", "mount"], args);

  if (result !== undefined) return result;

  return createIncidencia(...args);
};

export const closeCreate = (...args) =>
  safeCallAny(getCreateModalTarget(), ["close", "destroy", "unmount"], args);

export const updateCreate = (...args) =>
  safeCallAny(getCreateModalTarget(), ["update", "setState"], args);

export const destroyCreate = (...args) =>
  safeCallAny(getCreateModalTarget(), ["destroy", "unmount", "close"], args);

export const getCreateState = (...args) =>
  safeCallAny(getCreateModalTarget(), ["getState", "state"], args, null);

/* =========================================================
   DETAIL MODAL API
========================================================= */

export const openModal = (...args) => {
  const result = safeCallAny(getDetailModalTarget(), ["open", "mount"], args);

  if (result !== undefined) return result;

  const payload = first(...args);

  return openTicketFromExternalRequest(payload);
};

export const closeModal = (...args) =>
  safeCallAny(getDetailModalTarget(), ["close", "destroy", "unmount"], args);

export const updateModal = (...args) =>
  safeCallAny(getDetailModalTarget(), ["update", "setState"], args);

export const destroyModal = (...args) =>
  safeCallAny(getDetailModalTarget(), ["destroy", "unmount", "close"], args);

export const getModalState = (...args) =>
  safeCallAny(getDetailModalTarget(), ["getState", "state"], args, null);

/* =========================================================
   COMPOSITE API
========================================================= */

export const destroyAll = (...args) => {
  const results = [];

  results.push(destroy(...args));
  results.push(destroyModal(...args));
  results.push(destroyCreate(...args));

  return results;
};

export const closeAll = (...args) => {
  const results = [];

  results.push(closeModal(...args));
  results.push(closeCreate(...args));
  results.push(closeTicket(...args));

  return results;
};

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(getViewTarget()?.initialized);

export const isDestroyed = () =>
  Boolean(getViewTarget()?.destroyed);

export const isReady = () =>
  Boolean(getViewTarget() && !isDestroyed());

/* =========================================================
   PUBLIC BRIDGE BUILDER
========================================================= */

export function buildBridge() {
  return {
    view: getViewTarget(),
    modal: getDetailModalTarget(),
    createModal: getCreateModalTarget(),

    init,
    mount,
    render,
    scheduleRender,
    reload,
    refresh,
    destroy,
    unmount,

    openTicket,
    openTicketById,
    openById,
    openTicketFromExternalRequest,
    openTicketFromLocationOnce,
    closeTicket,

    createIncidencia,
    create,
    exportCsv,
    copyTicketId,
    refreshTicketDetail,

    setFilter,
    setSearchQuery,
    search,
    clearFilters,
    clearSearchOnly,
    clearSearch,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems,
    getFilteredItems,
    getPageItems,
    getPagination,
    getTicketById,
    findTicketById,
    mergeTicketDetailWithStoreSnapshot,
    getState,

    openModal,
    closeModal,
    updateModal,
    destroyModal,
    getModalState,

    openCreate,
    closeCreate,
    updateCreate,
    destroyCreate,
    getCreateState,

    closeAll,
    destroyAll,

    isInitialized,
    isDestroyed,
    isReady,
  };
}

/* =========================================================
   LEGACY GLOBAL BRIDGE
========================================================= */

export function registerGlobalBridge() {
  const root = getGlobalRoot();
  const bridge = buildBridge();

  try {
    const globalKeys = [
      "OnionIncidencias",
      "OnionIncidenciasUI",
      "OnionIncidenciasView",
      "IncidenciasView",
      "IncidenciasBridge",
      "OnionIncidenciasBridge",
      "OnionIncidenciaBridge",
    ];

    globalKeys.forEach((key) => {
      const previous = safeObject(root?.[key]);

      root[key] = {
        ...previous,
        ...bridge,
      };
    });

    root.openIncidenciaModal = (...args) => openTicketFromExternalRequest(...args);
    root.openIncidenciaFicha = (...args) => openTicketFromExternalRequest(...args);
    root.openTicketModal = (...args) => openTicketFromExternalRequest(...args);
    root.openTicketFicha = (...args) => openTicketFromExternalRequest(...args);
    root.renderIncidenciaModal = (...args) => openTicketFromExternalRequest(...args);
  } catch (error) {
    safeWarn("No se pudo registrar bridge global window/globalThis.", error);
  }

  try {
    const appCore = root?.AppCore;

    if (appCore) {
      if (!appCore.modules || typeof appCore.modules !== "object") {
        appCore.modules = {};
      }

      appCore.modules.Incidencias = bridge;
      appCore.modules.IncidenciasView = bridge;
      appCore.modules.OnionIncidencias = bridge;
      appCore.modules.OnionIncidenciasUI = bridge;
      appCore.modules.OnionIncidenciasBridge = bridge;
      appCore.modules.OnionIncidenciaBridge = bridge;
    }
  } catch (error) {
    safeWarn("No se pudo registrar bridge en AppCore.modules.", error);
  }

  safeEmit("incidencias:index:ready", {
    source: "incidencias/index.js",
    hasView: Boolean(getViewTarget()),
    hasCreateModal: Boolean(getCreateModalTarget()),
    hasDetailModal: Boolean(getDetailModalTarget()),
  });

  return bridge;
}

/* =========================================================
   READY
========================================================= */

export const bridge = registerGlobalBridge();

export const ready = true;

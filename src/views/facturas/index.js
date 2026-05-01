/* =========================================================
   Onion SPA - Facturas Module Index
   Archivo: src/views/facturas/index.js

   FINAL PRO SYSTEM · ENTRYPOINT REAL · 10/10 EXTREME
   PATCH · ROUTER SAFE · LEGACY SAFE · NAMESPACE EXPORT SAFE
   PATCH · VIEW/ACTIONS/LOADERS FALLBACK CHAIN
   PATCH · PUBLIC API STABLE · GLOBAL BRIDGE SAFE

   RESPONSABILIDADES:
   - punto de entrada único del módulo facturas
   - export limpio del módulo principal
   - compatibilidad router legacy y moderna
   - puente entre router y facturasView.js
   - init / mount / render / reload / destroy seguros
   - exponer modal / helpers públicos
   - evitar duplicidad de lógica en index.js
   - mantener superficie pública estable aunque cambien exports internos

   HARDENING PRO:
   - fallback si cambia nombre del método en FacturasView
   - wrappers seguros contra exports ausentes
   - namespace imports para no romper por named exports inexistentes
   - no lanza errores por métodos ausentes
   - no sobreescribe brutalmente window.OnionFacturas
   - compatible con imports antiguos
   - compatible con router que consume default, named, view o component

   NOTA TÉCNICA:
   - Este entrypoint asume que los archivos existen físicamente.
   - Si un archivo no existe, ESM fallará al resolver el import.
   - Si un método/export concreto no existe dentro del archivo, este index
     sí lo tolera mediante wrappers seguros.
========================================================= */

import FacturasView from "./facturasView.js";

import * as Model from "./facturas.model.js";
import * as Utils from "./facturas.utils.js";
import * as State from "./facturas.state.js";
import * as Store from "./facturas.store.js";
import * as Api from "./facturas.api.js";
import * as Loaders from "./facturas.loaders.js";
import * as Actions from "./facturas.actions.js";
import * as Bindings from "./facturas.bindings.js";
import * as Template from "./facturas.template.js";
import * as DetailTemplate from "./facturas.detail.template.js";

/* =========================================================
   MODULE META
========================================================= */

export const FACTURAS_MODULE_NAME = "facturas";
export const FACTURAS_VIEW_NAME = "FacturasView";
export const FACTURAS_MODULE_VERSION = "10.0.0";

/* =========================================================
   CORE EXPORTS
========================================================= */

export { FacturasView };

export const view = FacturasView;
export const component = FacturasView;
export const page = FacturasView;

export default FacturasView;

/* =========================================================
   LOCAL FALLBACK HELPERS
========================================================= */

function localSafeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function localSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function localSafeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function localSafeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function localSafeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function localFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function localNormalizeWhitespace(value = "") {
  return localSafeText(value, "").replace(/\s+/g, " ").trim();
}

function localEscapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localTruncate(value = "", max = 140) {
  const text = localSafeText(value, "");

  if (!text) return "";
  if (!Number.isFinite(Number(max)) || Number(max) <= 0) return text;
  if (text.length <= Number(max)) return text;

  return `${text.slice(0, Number(max)).trim()}…`;
}

function noop() {
  return undefined;
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
    try {
      if (
        typeof console !== "undefined" &&
        typeof console.warn === "function" &&
        typeof window !== "undefined" &&
        window.__ONION_DEBUG__ === true
      ) {
        console.warn(`[Facturas:index] Error calling ${method}`, error);
      }
    } catch {}
  }

  return fallback;
}

function callAny(candidates = [], args = [], fallback = undefined) {
  for (const candidate of candidates) {
    const target = candidate?.[0];
    const method = candidate?.[1];

    if (!target || !method) continue;

    try {
      const fn = target?.[method];

      if (typeof fn === "function") {
        return fn.apply(target, args);
      }
    } catch (error) {
      try {
        if (
          typeof console !== "undefined" &&
          typeof console.warn === "function" &&
          typeof window !== "undefined" &&
          window.__ONION_DEBUG__ === true
        ) {
          console.warn(`[Facturas:index] Error calling ${method}`, error);
        }
      } catch {}
    }
  }

  return fallback;
}

function moduleMethod(moduleRef, method, fallback = undefined) {
  return (...args) => safeCall(moduleRef, method, args, fallback);
}

/* =========================================================
   VIEW API
========================================================= */

export const init = (...args) =>
  callAny(
    [
      [FacturasView, "init"],
      [FacturasView, "mount"],
      [FacturasView, "render"],
    ],
    args
  );

export const mount = (...args) =>
  callAny(
    [
      [FacturasView, "mount"],
      [FacturasView, "init"],
      [FacturasView, "render"],
    ],
    args
  );

export const render = (...args) =>
  callAny(
    [
      [FacturasView, "render"],
      [FacturasView, "mount"],
      [FacturasView, "init"],
    ],
    args
  );

export const reload = (...args) =>
  callAny(
    [
      [FacturasView, "reload"],
      [FacturasView, "refresh"],
      [FacturasView, "loadFacturas"],
      [Loaders, "loadFacturasCollection"],
    ],
    args
  );

export const refresh = reload;

export const destroy = (...args) =>
  callAny(
    [
      [FacturasView, "destroy"],
      [FacturasView, "unmount"],
      [FacturasView, "dispose"],
    ],
    args
  );

export const unmount = (...args) =>
  callAny(
    [
      [FacturasView, "unmount"],
      [FacturasView, "destroy"],
      [FacturasView, "dispose"],
    ],
    args
  );

export const dispose = destroy;
export const bootstrap = init;

/* =========================================================
   ACTIONS API · VIEW FIRST + ACTION FALLBACK
========================================================= */

export const loadFacturas = (...args) =>
  callAny(
    [
      [FacturasView, "loadFacturas"],
      [FacturasView, "reload"],
      [Loaders, "loadFacturasCollection"],
    ],
    args
  );

export const openFactura = (...args) =>
  callAny(
    [
      [FacturasView, "openFactura"],
      [Actions, "openFacturaAction"],
    ],
    args
  );

export const openFacturaPdf = (...args) =>
  callAny(
    [
      [FacturasView, "openFacturaPdf"],
      [FacturasView, "viewFacturaPdf"],
      [Actions, "openFacturaPdfAction"],
    ],
    args
  );

export const viewFacturaPdf = openFacturaPdf;

export const downloadFacturaPdf = (...args) =>
  callAny(
    [
      [FacturasView, "downloadFacturaPdf"],
      [Actions, "downloadFacturaPdfAction"],
    ],
    args
  );

export const sendFacturaToClient = (...args) =>
  callAny(
    [
      [FacturasView, "sendFacturaToClient"],
      [FacturasView, "sendFactura"],
      [Actions, "sendFacturaToClientAction"],
    ],
    args
  );

export const closeDetail = (...args) =>
  callAny(
    [
      [FacturasView, "closeDetail"],
      [FacturasView, "closeFacturaDetail"],
      [State, "closeFacturasDetail"],
    ],
    args
  );

export const exportFacturasCsv = (...args) =>
  callAny(
    [
      [FacturasView, "exportFacturasCsv"],
      [Actions, "exportFacturasCsvAction"],
    ],
    args
  );

/* =========================================================
   DATA API
========================================================= */

export const getItems = (...args) =>
  callAny(
    [
      [FacturasView, "getItems"],
      [FacturasView, "getFacturas"],
      [Store, "getFacturasStore"],
    ],
    args,
    []
  );

export const getFacturasView = () => FacturasView;

export const getModuleSnapshot = () => ({
  module: FACTURAS_MODULE_NAME,
  viewName: FACTURAS_VIEW_NAME,
  version: FACTURAS_MODULE_VERSION,
  initialized: isInitialized(),
  destroyed: isDestroyed(),
  items: getItems(),
});

/* =========================================================
   MODEL PÚBLICO
========================================================= */

export const truncate = (...args) =>
  callAny([[Model, "truncate"]], args, localTruncate(...args));

export const formatMoney = (...args) =>
  callAny([[Model, "formatMoney"]], args, undefined);

export const formatDate = (...args) =>
  callAny([[Model, "formatDate"]], args, undefined);

export const formatDateTime = (...args) =>
  callAny([[Model, "formatDateTime"]], args, undefined);

export const formatRelativeDate = (...args) =>
  callAny([[Model, "formatRelativeDate"]], args, undefined);

export const getInitials = (...args) =>
  callAny([[Model, "getInitials"]], args, undefined);

export const normalizeEstadoPago = (...args) =>
  callAny([[Model, "normalizeEstadoPago"]], args, undefined);

export const normalizeEstado = (...args) =>
  callAny([[Model, "normalizeEstado"]], args, undefined);

export const getEstadoPagoLabel = (...args) =>
  callAny([[Model, "getEstadoPagoLabel"]], args, undefined);

export const getEstadoLabel = (...args) =>
  callAny([[Model, "getEstadoLabel"]], args, undefined);

export const getEstadoPagoChipStyle = (...args) =>
  callAny([[Model, "getEstadoPagoChipStyle"]], args, undefined);

export const getEstadoChipStyle = (...args) =>
  callAny([[Model, "getEstadoChipStyle"]], args, undefined);

export const getFacturaNumero = (...args) =>
  callAny([[Model, "getFacturaNumero"]], args, undefined);

export const getFacturaFecha = (...args) =>
  callAny([[Model, "getFacturaFecha"]], args, undefined);

export const getFacturaUpdatedAt = (...args) =>
  callAny([[Model, "getFacturaUpdatedAt"]], args, undefined);

export const getFacturaClienteNombre = (...args) =>
  callAny([[Model, "getFacturaClienteNombre"]], args, undefined);

export const getFacturaClienteEmpresa = (...args) =>
  callAny([[Model, "getFacturaClienteEmpresa"]], args, undefined);

export const getFacturaClienteEmail = (...args) =>
  callAny([[Model, "getFacturaClienteEmail"]], args, undefined);

export const getFacturaPreview = (...args) =>
  callAny([[Model, "getFacturaPreview"]], args, undefined);

export const getFacturaCurrency = (...args) =>
  callAny([[Model, "getFacturaCurrency"]], args, undefined);

export const getFacturaTotal = (...args) =>
  callAny([[Model, "getFacturaTotal"]], args, undefined);

export const getFacturaBaseImponible = (...args) =>
  callAny([[Model, "getFacturaBaseImponible"]], args, undefined);

export const getFacturaImpuestosTotal = (...args) =>
  callAny([[Model, "getFacturaImpuestosTotal"]], args, undefined);

export const getFacturaDescuentoTotal = (...args) =>
  callAny([[Model, "getFacturaDescuentoTotal"]], args, undefined);

export const isFacturaPaid = (...args) =>
  callAny([[Model, "isFacturaPaid"]], args, false);

export const isFacturaPending = (...args) =>
  callAny([[Model, "isFacturaPending"]], args, false);

export const isFacturaOverdue = (...args) =>
  callAny([[Model, "isFacturaOverdue"]], args, false);

export const normalizeFactura = (...args) =>
  callAny([[Model, "normalizeFactura"]], args, undefined);

export const extractFacturas = (...args) =>
  callAny([[Model, "extractFacturas"]], args, []);

export const extractNormalizedFacturas = (...args) =>
  callAny([[Model, "extractNormalizedFacturas"]], args, []);

export const getRemoteCount = (...args) =>
  callAny([[Model, "getRemoteCount"]], args, 0);

export const extractStats = (...args) =>
  callAny([[Model, "extractStats"]], args, undefined);

export const sumFacturasTotal = (...args) =>
  callAny([[Model, "sumFacturasTotal"]], args, 0);

export const sumFacturasBase = (...args) =>
  callAny([[Model, "sumFacturasBase"]], args, 0);

export const countFacturasByEstadoPago = (...args) =>
  callAny([[Model, "countFacturasByEstadoPago"]], args, 0);

export const countFacturasByEstado = (...args) =>
  callAny([[Model, "countFacturasByEstado"]], args, 0);

export const sortFacturas = (...args) =>
  callAny([[Model, "sortFacturas"]], args, localSafeArray(args[0], []));

export const filterFacturas = (...args) =>
  callAny([[Model, "filterFacturas"]], args, localSafeArray(args[0], []));

/* =========================================================
   UTILS REUTILIZABLES
========================================================= */

export const safeText = (...args) =>
  callAny([[Utils, "safeText"]], args, localSafeText(...args));

export const safeNumber = (...args) =>
  callAny([[Utils, "safeNumber"]], args, localSafeNumber(...args));

export const safeArray = (...args) =>
  callAny([[Utils, "safeArray"]], args, localSafeArray(...args));

export const safeObject = (...args) =>
  callAny([[Utils, "safeObject"]], args, localSafeObject(...args));

export const safeBoolean = (...args) =>
  callAny([[Utils, "safeBoolean"]], args, localSafeBoolean(...args));

export const first = (...args) =>
  callAny([[Utils, "first"]], args, localFirst(...args));

export const normalizeWhitespace = (...args) =>
  callAny([[Utils, "normalizeWhitespace"]], args, localNormalizeWhitespace(...args));

export const escapeHtml = (...args) =>
  callAny([[Utils, "escapeHtml"]], args, localEscapeHtml(...args));

export const truncateText = (...args) =>
  callAny([[Utils, "truncate"]], args, localTruncate(...args));

export const showToast = (...args) =>
  callAny([[Utils, "showToast"]], args, false);

/* =========================================================
   STATE
========================================================= */

export const createFacturasState = moduleMethod(State, "createFacturasState");
export const resetFacturasViewState = moduleMethod(State, "resetFacturasViewState");
export const resetFacturasDetailState = moduleMethod(State, "resetFacturasDetailState");
export const resetFacturasInflightState = moduleMethod(State, "resetFacturasInflightState");
export const resetFacturasState = moduleMethod(State, "resetFacturasState");

export const getFacturasViewState = moduleMethod(State, "getFacturasViewState", {});
export const getFacturasDetailState = moduleMethod(State, "getFacturasDetailState", {});
export const getFacturasActionsState = moduleMethod(State, "getFacturasActionsState", {});
export const getFacturasInflightState = moduleMethod(State, "getFacturasInflightState", {});

export const isFacturasHydrated = moduleMethod(State, "isFacturasHydrated", false);
export const isFacturasLoading = moduleMethod(State, "isFacturasLoading", false);
export const isFacturasLoaded = moduleMethod(State, "isFacturasLoaded", false);
export const isFacturasRefreshing = moduleMethod(State, "isFacturasRefreshing", false);
export const isFacturasBootstrapped = moduleMethod(State, "isFacturasBootstrapped", false);

export const getFacturasError = moduleMethod(State, "getFacturasError", null);
export const getFacturasRemoteCount = moduleMethod(State, "getFacturasRemoteCount", 0);
export const getFacturasLastSyncAt = moduleMethod(State, "getFacturasLastSyncAt", null);
export const getFacturasPage = moduleMethod(State, "getFacturasPage", 1);
export const getFacturasPageSize = moduleMethod(State, "getFacturasPageSize", 5);

export const isFacturasDetailOpen = moduleMethod(State, "isFacturasDetailOpen", false);
export const isFacturasDetailLoading = moduleMethod(State, "isFacturasDetailLoading", false);
export const getFacturasDetailData = moduleMethod(State, "getFacturasDetailData", null);

export const getFacturasSendingFacturaId = moduleMethod(State, "getFacturasSendingFacturaId", "");
export const getFacturasDownloadingFacturaId = moduleMethod(State, "getFacturasDownloadingFacturaId", "");
export const getFacturasViewingFacturaId = moduleMethod(State, "getFacturasViewingFacturaId", "");
export const getFacturasOpeningFacturaId = moduleMethod(State, "getFacturasOpeningFacturaId", "");

export const getFacturasInflightLoad = moduleMethod(State, "getFacturasInflightLoad", null);
export const getFacturasInflightDetail = moduleMethod(State, "getFacturasInflightDetail", null);

export const setFacturasHydrated = moduleMethod(State, "setFacturasHydrated");
export const setFacturasLoading = moduleMethod(State, "setFacturasLoading");
export const setFacturasLoaded = moduleMethod(State, "setFacturasLoaded");
export const setFacturasError = moduleMethod(State, "setFacturasError");
export const clearFacturasError = moduleMethod(State, "clearFacturasError");
export const setFacturasRefreshing = moduleMethod(State, "setFacturasRefreshing");
export const setFacturasBootstrapped = moduleMethod(State, "setFacturasBootstrapped");
export const setFacturasRemoteCount = moduleMethod(State, "setFacturasRemoteCount");
export const setFacturasLastSyncAt = moduleMethod(State, "setFacturasLastSyncAt");
export const setFacturasPage = moduleMethod(State, "setFacturasPage");
export const setFacturasPageSize = moduleMethod(State, "setFacturasPageSize");

export const setFacturasDetailOpen = moduleMethod(State, "setFacturasDetailOpen");
export const setFacturasDetailLoading = moduleMethod(State, "setFacturasDetailLoading");
export const setFacturasDetailData = moduleMethod(State, "setFacturasDetailData");
export const openFacturasDetail = moduleMethod(State, "openFacturasDetail");
export const closeFacturasDetail = moduleMethod(State, "closeFacturasDetail");

export const setFacturasSendingFacturaId = moduleMethod(State, "setFacturasSendingFacturaId");
export const setFacturasDownloadingFacturaId = moduleMethod(State, "setFacturasDownloadingFacturaId");
export const setFacturasViewingFacturaId = moduleMethod(State, "setFacturasViewingFacturaId");
export const setFacturasOpeningFacturaId = moduleMethod(State, "setFacturasOpeningFacturaId");
export const clearFacturasActionIds = moduleMethod(State, "clearFacturasActionIds");

export const setFacturasInflightLoad = moduleMethod(State, "setFacturasInflightLoad");
export const setFacturasInflightDetail = moduleMethod(State, "setFacturasInflightDetail");

export const patchFacturasViewState = moduleMethod(State, "patchFacturasViewState");
export const patchFacturasDetailState = moduleMethod(State, "patchFacturasDetailState");

export const getFacturasTemplateState = moduleMethod(State, "getFacturasTemplateState", {});
export const getFacturasStateSnapshot = moduleMethod(State, "getFacturasStateSnapshot", {});

/* =========================================================
   STORE
========================================================= */

export const getFacturasStore = moduleMethod(Store, "getFacturasStore", []);
export const getSortedFacturasStore = moduleMethod(Store, "getSortedFacturasStore", []);
export const getFacturaByIdStore = moduleMethod(Store, "getFacturaByIdStore", null);
export const hasFacturasStore = moduleMethod(Store, "hasFacturasStore", false);
export const countFacturasStore = moduleMethod(Store, "countFacturasStore", 0);
export const setFacturasStore = moduleMethod(Store, "setFacturasStore");
export const appendFacturasStore = moduleMethod(Store, "appendFacturasStore");
export const upsertFacturaStore = moduleMethod(Store, "upsertFacturaStore");
export const removeFacturaByIdStore = moduleMethod(Store, "removeFacturaByIdStore");
export const clearFacturasStore = moduleMethod(Store, "clearFacturasStore");

/* =========================================================
   API
========================================================= */

export const fetchFacturasRequest = moduleMethod(Api, "fetchFacturasRequest");
export const fetchFacturaDetailRequest = moduleMethod(Api, "fetchFacturaDetailRequest");
export const fetchFacturaPdfUrlRequest = moduleMethod(Api, "fetchFacturaPdfUrlRequest");
export const sendFacturaRequest = moduleMethod(Api, "sendFacturaRequest");

/* =========================================================
   LOADERS
========================================================= */

export const loadFacturasCollection = moduleMethod(Loaders, "loadFacturasCollection");
export const loadFacturaDetailById = moduleMethod(Loaders, "loadFacturaDetailById");

/* =========================================================
   ACTIONS
========================================================= */

export const getFacturaDetailFromStoreAction = moduleMethod(Actions, "getFacturaDetailFromStoreAction");
export const getFacturaDetailAction = moduleMethod(Actions, "getFacturaDetailAction");
export const openFacturaAction = moduleMethod(Actions, "openFacturaAction");
export const refreshFacturaDetailAction = moduleMethod(Actions, "refreshFacturaDetailAction");
export const openFacturaPdfAction = moduleMethod(Actions, "openFacturaPdfAction");
export const downloadFacturaPdfAction = moduleMethod(Actions, "downloadFacturaPdfAction");
export const sendFacturaToClientAction = moduleMethod(Actions, "sendFacturaToClientAction");
export const copyFacturaIdAction = moduleMethod(Actions, "copyFacturaIdAction");
export const exportFacturasCsvAction = moduleMethod(Actions, "exportFacturasCsvAction");

export const getFacturaIdAction = moduleMethod(Actions, "getFacturaIdAction");
export const getFacturaNumberAction = moduleMethod(Actions, "getFacturaNumberAction");
export const getFacturaClientAction = moduleMethod(Actions, "getFacturaClientAction");
export const getFacturaEmailAction = moduleMethod(Actions, "getFacturaEmailAction");
export const getFacturaDateAction = moduleMethod(Actions, "getFacturaDateAction");
export const getFacturaEstadoPagoAction = moduleMethod(Actions, "getFacturaEstadoPagoAction");
export const getFacturaEstadoAction = moduleMethod(Actions, "getFacturaEstadoAction");
export const getFacturaFormaPagoAction = moduleMethod(Actions, "getFacturaFormaPagoAction");
export const getFacturaMonedaAction = moduleMethod(Actions, "getFacturaMonedaAction");
export const getFacturaTotalAction = moduleMethod(Actions, "getFacturaTotalAction");
export const normalizeFacturaDetailAction = moduleMethod(Actions, "normalizeFacturaDetailAction");

/* =========================================================
   BINDINGS
========================================================= */

export const bindFacturasView = moduleMethod(Bindings, "bindFacturasView");

/* =========================================================
   TEMPLATES
========================================================= */

export const renderHeader = moduleMethod(Template, "renderHeader", "");
export const renderCards = moduleMethod(Template, "renderCards", "");
export const renderLoadingState = moduleMethod(Template, "renderLoadingState", "");
export const renderErrorState = moduleMethod(Template, "renderErrorState", "");
export const renderFacturasTemplate = moduleMethod(Template, "renderFacturasTemplate", "");

export const renderMiniMeta = moduleMethod(DetailTemplate, "renderMiniMeta", "");
export const renderDetailStat = moduleMethod(DetailTemplate, "renderDetailStat", "");
export const renderSectionCard = moduleMethod(DetailTemplate, "renderSectionCard", "");
export const renderHeaderActions = moduleMethod(DetailTemplate, "renderHeaderActions", "");
export const renderFacturasDetailContent = moduleMethod(DetailTemplate, "renderFacturasDetailContent", "");
export const renderFacturasDetailModal = moduleMethod(DetailTemplate, "renderFacturasDetailModal", "");

/* =========================================================
   FLAGS
========================================================= */

export const isInitialized = () =>
  Boolean(
    FacturasView?.initialized ||
      FacturasView?.isInitialized ||
      safeCall(FacturasView, "isInitialized", [], false)
  );

export const isDestroyed = () =>
  Boolean(
    FacturasView?.destroyed ||
      FacturasView?.isDestroyed ||
      safeCall(FacturasView, "isDestroyed", [], false)
  );

export const isMounted = () =>
  Boolean(
    FacturasView?.mounted ||
      FacturasView?.isMounted ||
      safeCall(FacturasView, "isMounted", [], false)
  );

/* =========================================================
   PUBLIC API OBJECT
========================================================= */

export const FacturasModule = {
  name: FACTURAS_MODULE_NAME,
  viewName: FACTURAS_VIEW_NAME,
  version: FACTURAS_MODULE_VERSION,

  View: FacturasView,
  FacturasView,
  view,
  component,
  page,

  init,
  mount,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,
  bootstrap,

  loadFacturas,
  openFactura,
  openFacturaPdf,
  viewFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,

  getItems,
  getFacturasView,
  getModuleSnapshot,

  isInitialized,
  isDestroyed,
  isMounted,
};

/* =========================================================
   LEGACY GLOBAL BRIDGE
========================================================= */

try {
  if (typeof window !== "undefined") {
    const previous =
      window.OnionFacturas &&
      typeof window.OnionFacturas === "object"
        ? window.OnionFacturas
        : {};

    window.OnionFacturas = {
      ...previous,
      ...FacturasModule,
    };
  }
} catch {}

/* =========================================================
   READY
========================================================= */

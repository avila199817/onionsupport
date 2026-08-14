/* =========================================================
   Onion Support - Usuarios Index
   Archivo: /src/views/usuarios/index.js

   PRODUCTIVO · CONTROLADOR PURO · API BOUNDARY · V3

   Responsabilidad:
   - Controlar la vista /usuarios y su ciclo SPA.
   - Delegar TODA la red/cache/modelo a usuarios.api.js. 
   - Mantener sólo estado de presentación:
     búsqueda, filtro, visibleLimit y modales.
   - Sin Http/fetch/localStorage/continuation tokens propios.
   - Sin fallback de métodos ni segunda API paralela.
   - No saltarse la validación del modal de creación.
   - Deduplicar los múltiples eventos compatibles de create success.
   - Mantener bridge/exports legacy de Usuarios.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  renderUsuariosTableTemplate,
  renderHeader,
  renderTable,
  renderLoadingState,
  renderErrorState,
  renderAccessDeniedState,
} from "./usuarios.template.js";

import UsuariosCreateModal from "./usuarios.template.create.js";
import UsuariosDetailModal from "./usuarios.template.modal.js";

import {
  USUARIOS_API_VERSION,
  USUARIOS_ENDPOINT,
  USUARIOS_CREATE_ENDPOINT,
  USUARIOS_STATS_ENDPOINT,
  USUARIOS_CACHE_KEY,
  USUARIOS_CACHE_TTL_MS,
  USUARIOS_FETCH_LIMIT,
  USUARIOS_MAX_LIMIT,
  USUARIOS_MAX_PAGES,

  fetchUsuariosRequest as fetchUsuariosRequestApi,
  getUsuarioByIdRequest as getUsuarioByIdRequestApi,
  createUsuarioRequest as createUsuarioRequestApi,
  updateUsuarioRequest as updateUsuarioRequestApi,
  deleteUsuarioRequest as deleteUsuarioRequestApi,
  fetchUsuariosStatsRequest,

  hydrateFromCache as hydrateFromCacheApi,
  hydrateUsuariosFromCache as hydrateUsuariosFromCacheApi,
  loadUsuarios as loadUsuariosApi,
  listUsuarios as listUsuariosApi,
  loadUsuarioDetail as loadUsuarioDetailApi,
  getUsuarioById as getUsuarioByIdApiRequest,
  createUsuario as createUsuarioApiRequest,
  updateUsuario as updateUsuarioApiRequest,
  deleteUsuario as deleteUsuarioApiRequest,

  usuariosState as usuariosApiState,
  getUsuarios as getUsuariosApiStore,
  getSortedUsuariosStore as getSortedUsuariosApiStore,
  getUsuarioByIdStore as getUsuarioByIdApiStore,
  getUsuariosCount as getUsuariosApiCount,
  hasUsuarios as hasUsuariosApi,
  getUsuariosStoreSnapshot as getUsuariosApiStoreSnapshot,
  getUsuariosStateSnapshot as getUsuariosApiStateSnapshot,
  getUsuariosApiSnapshot,

  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,
} from "./usuarios.api.js";

/* =========================================================
   META / COMPAT CONSTANTS
========================================================= */

export const USUARIOS_MODULE_NAME = "usuarios";
export const USUARIOS_VIEW_NAME = "UsuariosView";
export const USUARIOS_CANONICAL_PATH = "/usuarios";

export const USUARIOS_INDEX_VERSION =
  "usuarios.index.api-boundary.v5.backend-contract-v3";

export const USUARIOS_VIEW_VERSION = USUARIOS_INDEX_VERSION;
export const USUARIOS_MODULE_VERSION = USUARIOS_INDEX_VERSION;
export const USUARIOS_INDEX_SOURCE = "views.usuarios.index";

export {
  USUARIOS_API_VERSION,
  USUARIOS_ENDPOINT,
  USUARIOS_CREATE_ENDPOINT,
  USUARIOS_STATS_ENDPOINT,
  USUARIOS_CACHE_KEY,
  USUARIOS_CACHE_TTL_MS,
  USUARIOS_FETCH_LIMIT,
  USUARIOS_MAX_LIMIT,
  USUARIOS_MAX_PAGES,
};

const DEFAULT_VISIBLE_ROWS = 20;
const SEARCH_DEBOUNCE_MS = 220;

const USUARIOS_CONTROLLER_KEY = Symbol.for(
  "onion.support.usuarios.controller"
);

const USUARIOS_GLOBAL_CONTROLLER_KEY = Symbol.for(
  "onion.support.usuarios.active-controller"
);

const DETAIL_ACTION = "detail";
const CREATE_ACTION = "create";
const REFRESH_ACTION = "refresh";
const RETRY_ACTION = "retry";
const EXPORT_ACTION = "export";
const FILTER_ACTION = "filter";
const CLEAR_SEARCH_ACTION = "clear-search";
const CLEAR_FILTERS_ACTION = "clear-filters";
const LOAD_MORE_ACTION = "load-more";

const CREATE_SUCCESS_EVENTS = Object.freeze([
  "usuarios:create:success",
  "usuarios:create:created",
  "usuarios:created",
  "usuario:created",
]);

const CREATE_CLOSE_EVENTS = Object.freeze([
  "usuarios:create:closed",
  "usuarios:create:close",
]);

const DETAIL_CLOSE_EVENTS = Object.freeze([
  "usuarios:modal:closed",
]);

let controllerSequence = 0;
let lastController = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }
    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }
    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(
    Math.max(number(value, min), min),
    max
  );
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeError(
  error = null,
  fallback = "No se pudieron cargar los usuarios."
) {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function cloneItems(items = []) {
  return safeArray(items).map((item) => ({
    ...safeObject(item),
    raw: {
      ...safeObject(item?.raw),
    },
  }));
}

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}

function nextFrame(callback = null) {
  if (!isBrowser() || !isFunction(callback)) {
    return 0;
  }

  try {
    return window.requestAnimationFrame(callback);
  } catch {
    return window.setTimeout(callback, 0);
  }
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    window.cancelAnimationFrame?.(id);
    window.clearTimeout?.(id);
    return true;
  } catch {
    return false;
  }
}

function safeCall(
  target = null,
  method = "",
  args = [],
  fallback = null
) {
  try {
    const fn = target?.[method];

    return isFunction(fn)
      ? fn.apply(target, safeArray(args))
      : fallback;
  } catch {
    return fallback;
  }
}

async function safeAsyncCall(
  target = null,
  methods = [],
  args = [],
  fallback = null
) {
  for (const method of safeArray(methods)) {
    const fn = target?.[method];

    if (isFunction(fn)) {
      return fn.apply(
        target,
        safeArray(args)
      );
    }
  }

  return fallback;
}

/* =========================================================
   APP / AUTH / ROUTE
========================================================= */

function getAppState() {
  try {
    return (
      AppCore.getState?.() ||
      AppCore.state ||
      {}
    );
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getAppState();

  try {
    return (
      AppCore.getCurrentUser?.() ||
      state.user ||
      state.currentUser ||
      null
    );
  } catch {
    return (
      state.user ||
      state.currentUser ||
      null
    );
  }
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value
      .map(normalizeRole)
      .filter(Boolean);

    if (roles.includes("admin")) {
      return "admin";
    }

    return roles[0] || "";
  }

  const role = normalizeKey(value);

  if (
    [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(role)
  ) {
    return "admin";
  }

  return role || "user";
}

function getCurrentRole(context = {}) {
  const state = getAppState();
  const user = safeObject(
    getCurrentUser(),
    {}
  );

  return (
    normalizeRole(
      first(
        context.role,
        context.rol,
        context.user?.role,
        context.user?.rol,
        AppCore.getCurrentRole?.(),
        state.role,
        state.rol,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) || "user"
  );
}

function isAdminContext(context = {}) {
  return (
    context.admin === true ||
    getCurrentRole(context) === "admin"
  );
}

function normalizePathname(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value.split("?")[0].split("#")[0] ||
    "/";

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  const segments = value
    .split("/")
    .filter(Boolean);

  if (segments[0]?.startsWith("@")) {
    value =
      `/${segments.slice(1).join("/")}` ||
      "/";
  }

  return value;
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash =
      window.location.hash || "";

    if (hash.startsWith("#/")) {
      return normalizePathname(
        hash.slice(1)
      );
    }

    if (hash.startsWith("#!/")) {
      return normalizePathname(
        hash.slice(2)
      );
    }

    return normalizePathname(
      window.location.pathname || "/"
    );
  } catch {
    return "";
  }
}

function routePathFromContext(context = {}) {
  return cleanText(
    first(
      context.canonicalPath,
      context.routePath,
      context.route?.path,
      context.publicPath,
      context.requestedPath,
      context.path,
      context.options?.canonicalPath,
      context.options?.routePath,
      context.options?.path,
      ""
    ),
    ""
  );
}

function isUsuariosRoute(context = {}) {
  const explicit =
    routePathFromContext(context);

  if (explicit) {
    return (
      normalizePathname(explicit) ===
      USUARIOS_CANONICAL_PATH
    );
  }

  const browserPath = getBrowserPath();

  if (browserPath) {
    return (
      browserPath ===
      USUARIOS_CANONICAL_PATH
    );
  }

  return true;
}

function resolveHost(
  host = null,
  context = {}
) {
  if (host?.nodeType === 1) return host;
  if (context.host?.nodeType === 1) {
    return context.host;
  }
  if (context.root?.nodeType === 1) {
    return context.root;
  }
  if (context.container?.nodeType === 1) {
    return context.container;
  }

  if (!isBrowser()) return null;

  return (
    document.querySelector(
      "[data-view-host='usuarios']"
    ) ||
    document.querySelector(
      "[data-usuarios-host='true']"
    ) ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
}

/* =========================================================
   TOAST / EVENTS
========================================================= */

function showToast(
  message = "",
  type = "info"
) {
  const text = cleanText(message, "");
  if (!text) return false;

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ];

  for (const toast of candidates) {
    try {
      if (isFunction(toast?.[type])) {
        toast[type](text);
        return true;
      }

      if (isFunction(toast?.show)) {
        toast.show(text, type);
        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

function subscribeEvent(
  eventName = "",
  handler = null
) {
  const name = cleanText(eventName, "");

  if (!name || !isFunction(handler)) {
    return () => {};
  }

  let appBound = false;
  let windowBound = false;

  try {
    if (isFunction(AppCore?.events?.on)) {
      AppCore.events.on(name, handler);
      appBound = true;
    }
  } catch {
    // noop
  }

  try {
    if (isBrowser()) {
      window.addEventListener(
        name,
        handler
      );
      windowBound = true;
    }
  } catch {
    // noop
  }

  return () => {
    try {
      if (
        appBound &&
        isFunction(AppCore?.events?.off)
      ) {
        AppCore.events.off(
          name,
          handler
        );
      }
    } catch {
      // noop
    }

    try {
      if (
        windowBound &&
        isBrowser()
      ) {
        window.removeEventListener(
          name,
          handler
        );
      }
    } catch {
      // noop
    }
  };
}

function emitEvent(
  eventName = "",
  payload = {}
) {
  const name = cleanText(
    eventName,
    ""
  );

  if (!name) return false;

  let emitted = false;

  try {
    if (
      isFunction(
        AppCore?.events?.emit
      )
    ) {
      AppCore.events.emit(
        name,
        payload
      );
      emitted = true;
    }
  } catch {
    // noop
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {
    // noop
  }

  return emitted;
}

function eventPayload(event = null) {
  return safeObject(
    first(
      event?.detail?.detail,
      event?.detail?.payload,
      event?.detail,
      event?.payload,
      event,
      {}
    ),
    {}
  );
}

/* =========================================================
   CANONICAL UI READERS
   El modelo ya viene normalizado por usuarios.api.js.
========================================================= */

function getUsuarioId(item = {}) {
  return cleanText(
    first(
      item.userId,
      item.usuarioId,
      item.id,
      item.uid,
      item.email,
      ""
    ),
    ""
  );
}

function getUsuarioName(item = {}) {
  return cleanText(
    first(
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      item.username,
      item.email,
      "Usuario"
    ),
    "Usuario"
  );
}

function getUsuarioEmail(item = {}) {
  return cleanText(
    first(
      item.email,
      item.emailLower,
      item.mail,
      ""
    ),
    ""
  ).toLowerCase();
}

function getUsuarioPhone(item = {}) {
  return cleanText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      ""
    ),
    ""
  );
}

function getUsuarioCity(item = {}) {
  return cleanText(
    first(
      item.city,
      item.ciudad,
      item.direccion?.ciudad,
      item.address?.ciudad,
      ""
    ),
    ""
  );
}

function getUsuarioRole(item = {}) {
  return cleanText(
    first(
      item.role,
      item.rol,
      "user"
    ),
    "user"
  );
}

function getUsuarioStatus(item = {}) {
  return normalizeKey(
    first(
      item.status,
      item.estado,
      item.state,
      item.active === false
        ? "inactive"
        : "active"
    )
  );
}

function statusBucket(item = {}) {
  const status =
    getUsuarioStatus(item);

  if (status === "pending") {
    return "pending";
  }

  if (
    status === "blocked" ||
    status === "inactive"
  ) {
    return "blocked";
  }

  return "active";
}

function usuarioSearchText(item = {}) {
  return normalizeSearch(
    [
      getUsuarioId(item),
      getUsuarioName(item),
      getUsuarioEmail(item),
      getUsuarioPhone(item),
      getUsuarioCity(item),
      getUsuarioRole(item),
      getUsuarioStatus(item),
      item.username,
      item.clienteId,
      item.nif,
      item.tipo,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function filterUsuarios(
  items = [],
  {
    filter = "all",
    search = "",
  } = {}
) {
  const normalizedFilter =
    normalizeKey(filter || "all");

  const terms = normalizeSearch(
    search
  )
    .split(" ")
    .filter(Boolean);

  return safeArray(items).filter(
    (item) => {
      if (
        normalizedFilter !== "all" &&
        statusBucket(item) !==
          normalizedFilter
      ) {
        return false;
      }

      if (!terms.length) {
        return true;
      }

      const haystack =
        usuarioSearchText(item);

      return terms.every((term) =>
        haystack.includes(term)
      );
    }
  );
}

/* =========================================================
   API COMPAT WRAPPERS
   Ninguno implementa HTTP propio.
========================================================= */

export const fetchUsuariosRequest = (
  options = {}
) => fetchUsuariosRequestApi(options);

export const getUsuarioByIdRequest = (
  id = "",
  options = {}
) =>
  getUsuarioByIdRequestApi(
    id,
    options
  );

export const createUsuarioRequest = (
  payload = {},
  options = {}
) =>
  createUsuarioRequestApi(
    payload,
    options
  );

export const updateUsuarioRequest = (
  id = "",
  payload = {},
  options = {}
) =>
  updateUsuarioRequestApi(
    id,
    payload,
    options
  );

export const deleteUsuarioRequest = (
  id = "",
  options = {}
) =>
  deleteUsuarioRequestApi(
    id,
    options
  );

export const hydrateFromCache = (
  options = {}
) =>
  hydrateFromCacheApi(options);

export const hydrateUsuariosFromCache = (
  options = {}
) =>
  hydrateUsuariosFromCacheApi(
    options
  );

export const loadUsuarios = (
  options = {}
) =>
  loadUsuariosApi(options);

export const listUsuarios = (
  options = {}
) =>
  listUsuariosApi(options);

export const loadUsuarioDetail = (
  id = "",
  options = {}
) =>
  loadUsuarioDetailApi(
    id,
    options
  );

export const getUsuarioByIdApi =
  loadUsuarioDetail;

export const createUsuarioApi = (
  payload = {},
  options = {}
) =>
  createUsuarioApiRequest(
    payload,
    options
  );

export const updateUsuarioApi = (
  id = "",
  payload = {},
  options = {}
) =>
  updateUsuarioApiRequest(
    id,
    payload,
    options
  );

export const deleteUsuarioApi = (
  id = "",
  options = {}
) =>
  deleteUsuarioApiRequest(
    id,
    options
  );

/* =========================================================
   CSV
========================================================= */

function csvSafeCell(value = "") {
  let text = String(
    value ?? ""
  )
    .replace(/[\r\n]+/g, " ")
    .replace(/\t/g, " ")
    .trim();

  /*
    Evita CSV/Formula Injection al abrir con Excel/LibreOffice.
    Se preserva el contenido visible prefijándolo con apostrofe.
  */
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return text;
}

function csvEscape(value = "") {
  const text =
    csvSafeCell(value);

  return `"${text.replace(
    /"/g,
    '""'
  )}"`;
}

function buildUsuariosCsv(
  items = []
) {
  const header = [
    "ID",
    "Nombre",
    "Email",
    "Teléfono",
    "Ciudad",
    "Rol",
    "Estado",
  ];

  const rows = safeArray(items).map(
    (item) => [
      getUsuarioId(item),
      getUsuarioName(item),
      getUsuarioEmail(item),
      getUsuarioPhone(item),
      getUsuarioCity(item),
      getUsuarioRole(item),
      getUsuarioStatus(item),
    ]
  );

  return [header, ...rows]
    .map((row) =>
      row
        .map(csvEscape)
        .join(";")
    )
    .join("\r\n");
}

function downloadTextFile(
  content = "",
  filename = "usuarios.csv",
  type = "text/csv;charset=utf-8"
) {
  if (!isBrowser()) return false;

  try {
    const blob = new Blob(
      [
        "\uFEFF",
        String(content || ""),
      ],
      { type }
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download = cleanText(
      filename,
      "usuarios.csv"
    );
    anchor.rel = "noopener";
    anchor.hidden = true;

    document.body.appendChild(
      anchor
    );
    anchor.click();
    anchor.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CONTROLLER
========================================================= */

function createUsuariosController(
  rawHost = null,
  rawContext = {}
) {
  const context = safeObject(
    rawContext,
    {}
  );

  const host = resolveHost(
    rawHost,
    context
  );

  const ownerId =
    `${USUARIOS_VIEW_VERSION}:${++controllerSequence}`;

  let mounted = false;
  let destroyed = false;

  let loading = false;
  let refreshing = false;
  let exporting = false;
  let creating = false;

  let createOpen = false;
  let openingUserId = "";
  let error = "";

  let items = [];
  let remoteCount = 0;
  let lastSyncAt = 0;

  let filter = "all";
  let search = "";
  let searchDraft = "";
  let visibleLimit =
    DEFAULT_VISIBLE_ROWS;

  let loadSequence = 0;
  let renderFrame = 0;
  let searchTimer = 0;
  let deferredRender = null;

  let createRefreshTask = null;

  let hostClickHandler = null;
  let hostInputHandler = null;
  let hostKeydownHandler = null;

  const unsubscribers = [];

  function isAlive() {
    return (
      !destroyed &&
      mounted &&
      Boolean(host?.isConnected)
    );
  }

  function isRouteActive() {
    return isUsuariosRoute(context);
  }

  function syncFromApiSnapshot(
    fallbackItems = null
  ) {
    const snapshot =
      getUsuariosApiStoreSnapshot();

    const snapshotItems =
      safeArray(snapshot?.items);

    const sourceItems =
      snapshotItems.length ||
      fallbackItems === null
        ? snapshotItems
        : safeArray(fallbackItems);

    items =
      normalizeUsuariosCollection(
        sourceItems
      );

    remoteCount = Math.max(
      items.length,
      number(
        snapshot?.remoteCount,
        items.length
      )
    );

    lastSyncAt = number(
      snapshot?.lastSyncAt,
      lastSyncAt
    );

    return items;
  }

  function syncItems(
    nextItems = [],
    meta = {}
  ) {
    items =
      normalizeUsuariosCollection(
        nextItems
      );

    remoteCount = Math.max(
      items.length,
      number(
        first(
          meta.remoteCount,
          meta.total,
          meta.totalCount,
          items.length
        ),
        items.length
      )
    );

    lastSyncAt = number(
      first(
        meta.lastSyncAt,
        Date.now()
      ),
      Date.now()
    );

    return items;
  }

  function selectFilteredItems() {
    return filterUsuarios(items, {
      filter,
      search:
        searchDraft || search,
    });
  }

  function normalizeVisibleLimit(
    value = visibleLimit
  ) {
    visibleLimit = clamp(
      value,
      1,
      500
    );

    return visibleLimit;
  }

  function resetVisibleLimit() {
    visibleLimit =
      DEFAULT_VISIBLE_ROWS;

    return visibleLimit;
  }

  function selectVisibleItems() {
    normalizeVisibleLimit();

    return selectFilteredItems()
      .slice(0, visibleLimit);
  }

  function getRemainingCount() {
    return Math.max(
      0,
      selectFilteredItems().length -
        selectVisibleItems().length
    );
  }

  function hasMoreVisibleItems() {
    return getRemainingCount() > 0;
  }

  function detailModalOpen() {
    try {
      return (
        UsuariosDetailModal?.getState?.()
          ?.isOpen === true
      );
    } catch {
      return false;
    }
  }

  function createModalOpen() {
    if (createOpen) return true;

    try {
      return (
        UsuariosCreateModal?.getState?.()
          ?.isOpen === true
      );
    } catch {
      return false;
    }
  }

  function anyModalOpen() {
    return (
      detailModalOpen() ||
      createModalOpen()
    );
  }

  function viewState() {
    return {
      loading,
      refreshing,
      exporting,
      creating,

      openingUserId,
      loadingUserId: openingUserId,
      detailUserId: openingUserId,

      error,

      filter,
      activeFilter: filter,
      statusFilter: filter,

      search:
        searchDraft || search,
      searchQuery:
        searchDraft || search,

      visibleLimit,
      usuariosVisibleLimit:
        visibleLimit,

      page: 1,
      currentPage: 1,
      usuariosPage: 1,

      pageSize: visibleLimit,
      usuariosPageSize:
        visibleLimit,

      remoteCount,
      totalCount: remoteCount,
      total: remoteCount,

      lastSyncAt,
      lastUpdatedAt: lastSyncAt,
      updatedAt: lastSyncAt,
    };
  }

  function viewPayload() {
    const admin =
      isAdminContext(context);

    return {
      items,
      users: items,
      usuarios: items,
      rows: items,

      state: viewState(),

      loading,
      refreshing,
      exporting,
      creating,
      openingUserId,
      error,

      filter,
      activeFilter: filter,

      search:
        searchDraft || search,
      searchQuery:
        searchDraft || search,

      visibleLimit,
      usuariosVisibleLimit:
        visibleLimit,

      page: 1,
      currentPage: 1,
      pageSize: visibleLimit,

      remoteCount,
      totalCount: remoteCount,
      total: remoteCount,

      lastSyncAt,
      lastUpdatedAt: lastSyncAt,
      updatedAt: lastSyncAt,

      admin,
      role: getCurrentRole(context),
      forbidden: !admin,
      restricted: !admin,
      accessDenied: !admin,

      route:
        USUARIOS_CANONICAL_PATH,
      source:
        USUARIOS_INDEX_SOURCE,
      version:
        USUARIOS_VIEW_VERSION,

      apiFallbackActive: false,
      singleApiAuthority: true,
    };
  }

  function captureDomState() {
    if (!host || !isBrowser()) {
      return {};
    }

    const active =
      document.activeElement;

    const searchInput =
      host.querySelector(
        "[data-usuarios-search-input='true']"
      );

    const activeIsSearch =
      active === searchInput;

    return {
      scrollTop:
        host.scrollTop,

      activeIsSearch,

      selectionStart:
        activeIsSearch
          ? searchInput.selectionStart
          : null,

      selectionEnd:
        activeIsSearch
          ? searchInput.selectionEnd
          : null,
    };
  }

  function restoreDomState(
    snapshot = {}
  ) {
    if (!host || !isBrowser()) {
      return false;
    }

    try {
      host.scrollTop = number(
        snapshot.scrollTop,
        0
      );

      if (snapshot.activeIsSearch) {
        const input =
          host.querySelector(
            "[data-usuarios-search-input='true']"
          );

        input?.focus?.({
          preventScroll: true,
        });

        if (
          input &&
          typeof input.setSelectionRange ===
            "function" &&
          Number.isInteger(
            snapshot.selectionStart
          ) &&
          Number.isInteger(
            snapshot.selectionEnd
          )
        ) {
          input.setSelectionRange(
            snapshot.selectionStart,
            snapshot.selectionEnd
          );
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function htmlFragment(html = "") {
    if (!isBrowser()) return null;

    const template =
      document.createElement(
        "template"
      );

    template.innerHTML =
      String(html || "").trim();

    return template.content;
  }

  function commitFull(html = "") {
    if (!host || destroyed) {
      return false;
    }

    const snapshot =
      captureDomState();

    const fragment =
      htmlFragment(html);

    if (!fragment) return false;

    host.replaceChildren(fragment);

    host.setAttribute(
      "data-usuarios-controller",
      ownerId
    );

    host.setAttribute(
      "data-usuarios-version",
      USUARIOS_VIEW_VERSION
    );

    restoreDomState(snapshot);
    return true;
  }

  function replaceSection(
    selector = "",
    html = ""
  ) {
    if (!host || !selector) {
      return false;
    }

    const current =
      host.querySelector(selector);

    const fragment =
      htmlFragment(html);

    const next =
      fragment?.querySelector?.(
        selector
      );

    if (!current || !next) {
      return false;
    }

    current.replaceWith(next);
    return true;
  }

  function renderNow({
    full = false,
    header = false,
    history = false,
    force = false,
  } = {}) {
    if (
      destroyed ||
      !host ||
      !isRouteActive()
    ) {
      return false;
    }

    if (
      !force &&
      anyModalOpen()
    ) {
      deferredRender = {
        full: Boolean(
          deferredRender?.full ||
            full
        ),
        header: Boolean(
          deferredRender?.header ||
            header
        ),
        history: Boolean(
          deferredRender?.history ||
            history
        ),
        force: false,
      };

      return true;
    }

    deferredRender = null;
    normalizeVisibleLimit();

    const payload =
      viewPayload();

    const hasRoot = Boolean(
      host.querySelector(
        "[data-usuarios-scope='true']"
      )
    );

    if (full || !hasRoot) {
      return commitFull(
        renderUsuariosTableTemplate(
          payload
        )
      );
    }

    const snapshot =
      captureDomState();

    let changed = false;

    if (header) {
      changed =
        replaceSection(
          ".usuarios-hero",
          renderHeader(payload)
        ) || changed;
    }

    if (history) {
      changed =
        replaceSection(
          ".usuarios-history",
          renderTable(payload)
        ) || changed;
    }

    if (
      !changed &&
      (header || history)
    ) {
      return commitFull(
        renderUsuariosTableTemplate(
          payload
        )
      );
    }

    restoreDomState(snapshot);
    return true;
  }

  function render(options = {}) {
    if (destroyed || !host) {
      return false;
    }

    const next = {
      full:
        options.full === true,
      header:
        options.header === true,
      history:
        options.history === true,
      force:
        options.force === true,
    };

    if (options.immediate === true) {
      cancelFrame(renderFrame);
      renderFrame = 0;

      return renderNow(next);
    }

    deferredRender = {
      full: Boolean(
        deferredRender?.full ||
          next.full
      ),
      header: Boolean(
        deferredRender?.header ||
          next.header
      ),
      history: Boolean(
        deferredRender?.history ||
          next.history
      ),
      force: Boolean(
        deferredRender?.force ||
          next.force
      ),
    };

    if (renderFrame) return true;

    renderFrame = nextFrame(() => {
      const pending =
        deferredRender || {};

      renderFrame = 0;
      deferredRender = null;

      renderNow(pending);
    });

    return true;
  }

  function flushDeferredRender() {
    if (
      !deferredRender ||
      anyModalOpen()
    ) {
      return false;
    }

    const pending =
      deferredRender;

    deferredRender = null;

    return render({
      ...pending,
      immediate: true,
      force: true,
    });
  }

  function renderInitialLoading() {
    if (!host || destroyed) {
      return false;
    }

    if (!isAdminContext(context)) {
      return commitFull(`
        <section class="usuarios-view-root is-restricted" data-usuarios-scope="true">
          ${renderAccessDeniedState()}
        </section>
      `);
    }

    return commitFull(`
      <section class="usuarios-view-root is-loading" data-usuarios-scope="true" aria-busy="true">
        ${renderHeader(viewPayload())}
        ${renderLoadingState()}
      </section>
    `);
  }

  function renderFatalError(
    message = ""
  ) {
    if (!host || destroyed) {
      return false;
    }

    return commitFull(`
      <section class="usuarios-view-root has-error" data-usuarios-scope="true">
        ${renderErrorState(
          cleanText(
            message,
            "No se pudieron cargar los usuarios."
          )
        )}
      </section>
    `);
  }

  async function load({
    force = false,
    silent = false,
  } = {}) {
    if (
      destroyed ||
      !isRouteActive()
    ) {
      return items;
    }

    if (!isAdminContext(context)) {
      return items;
    }

    const sequence =
      ++loadSequence;

    const hadItems =
      items.length > 0;

    error = "";

    if (!silent) {
      loading = !hadItems;
      refreshing = hadItems;
    } else {
      loading =
        !hadItems &&
        loading;
      refreshing =
        hadItems &&
        refreshing;
    }

    render({
      full: !hadItems,
      header: hadItems,
      history: hadItems,
      immediate: true,
    });

    try {
      const result =
        await loadUsuariosApi({
          force,
          silent: true,
        });

      if (
        destroyed ||
        sequence !== loadSequence ||
        !isRouteActive()
      ) {
        return items;
      }

      const snapshot =
        getUsuariosApiStoreSnapshot();

      syncItems(
        safeArray(result),
        {
          remoteCount:
            snapshot?.remoteCount,
          lastSyncAt:
            snapshot?.lastSyncAt,
        }
      );

      error = "";
      loading = false;
      refreshing = false;

      normalizeVisibleLimit();

      render({
        full: true,
        immediate: true,
      });

      return items;
    } catch (loadError) {
      if (
        destroyed ||
        sequence !== loadSequence
      ) {
        return items;
      }

      /*
        La única cache válida es la del API.
        No existe fallback HTTP ni localStorage propio aquí.
      */
      syncFromApiSnapshot(items);

      error = safeError(
        loadError
      );

      loading = false;
      refreshing = false;

      if (items.length) {
        render({
          header: true,
          history: true,
          immediate: true,
        });

        showToast(
          error,
          "error"
        );
      } else {
        renderFatalError(error);
      }

      return items;
    }
  }

  async function refresh() {
    if (
      refreshing ||
      loading
    ) {
      return items;
    }

    return load({
      force: true,
      silent: false,
    });
  }

  async function openUsuario(
    userId = ""
  ) {
    const id = cleanText(
      userId,
      ""
    );

    if (
      !id ||
      openingUserId ||
      destroyed
    ) {
      return null;
    }

    openingUserId = id;
    error = "";

    render({
      history: true,
      immediate: true,
    });

    try {
      const cached =
        findUsuarioById(
          items,
          id
        );

      const detail =
        (await loadUsuarioDetailApi(
          id,
          {
            force: true,
            allowCacheFallback: true,
          }
        )) || cached;

      if (
        destroyed ||
        !detail
      ) {
        throw new Error(
          "USUARIO_DETAIL_NOT_FOUND"
        );
      }

      syncFromApiSnapshot([
        detail,
        ...items,
      ]);

      openingUserId = "";

      UsuariosDetailModal?.open?.(
        detail
      );

      render({
        history: true,
      });

      emitEvent(
        "usuarios:detail:opened",
        {
          detail,
          userId: id,
        }
      );

      return detail;
    } catch (detailError) {
      openingUserId = "";

      render({
        history: true,
        immediate: true,
        force: true,
      });

      showToast(
        safeError(
          detailError,
          "No se pudo abrir el usuario."
        ),
        "error"
      );

      return null;
    }
  }

  async function refreshUsuario(
    userId = ""
  ) {
    const modalState =
      safeObject(
        UsuariosDetailModal?.getState?.(),
        {}
      );

    const id = cleanText(
      first(
        userId,
        modalState.userId,
        getUsuarioId(
          modalState.detail
        ),
        ""
      ),
      ""
    );

    if (!id || destroyed) {
      return null;
    }

    try {
      const detail =
        await loadUsuarioDetailApi(
          id,
          {
            force: true,
            dedupe: false,
            allowCacheFallback: true,
          }
        );

      if (detail) {
        UsuariosDetailModal?.update?.(
          detail
        );

        syncFromApiSnapshot([
          detail,
          ...items,
        ]);

        render({
          full: true,
        });
      }

      return detail;
    } catch (detailError) {
      showToast(
        safeError(
          detailError,
          "No se pudo actualizar el usuario."
        ),
        "error"
      );

      return null;
    }
  }

  async function copyUsuarioId(
    userId = ""
  ) {
    const modalState =
      safeObject(
        UsuariosDetailModal?.getState?.(),
        {}
      );

    const id = cleanText(
      first(
        userId,
        modalState.userId,
        getUsuarioId(
          modalState.detail
        ),
        ""
      ),
      ""
    );

    if (!id || !isBrowser()) {
      return false;
    }

    try {
      if (
        !navigator.clipboard
          ?.writeText
      ) {
        throw new Error(
          "CLIPBOARD_UNAVAILABLE"
        );
      }

      await navigator.clipboard
        .writeText(id);

      showToast(
        "ID de usuario copiado.",
        "success"
      );

      return true;
    } catch {
      try {
        const textarea =
          document.createElement(
            "textarea"
          );

        textarea.value = id;
        textarea.readOnly = true;
        textarea.hidden = true;

        document.body.appendChild(
          textarea
        );

        textarea.hidden = false;
        textarea.style.position =
          "fixed";
        textarea.style.opacity = "0";
        textarea.select();

        const copied =
          document.execCommand(
            "copy"
          );

        textarea.remove();

        if (copied) {
          showToast(
            "ID de usuario copiado.",
            "success"
          );
        }

        return Boolean(copied);
      } catch {
        showToast(
          "No se pudo copiar el ID del usuario.",
          "error"
        );

        return false;
      }
    }
  }

  async function openCreate() {
    if (
      destroyed ||
      creating ||
      createModalOpen()
    ) {
      return false;
    }

    creating = true;

    render({
      header: true,
      immediate: true,
    });

    try {
      const result =
        await safeAsyncCall(
          UsuariosCreateModal,
          [
            "open",
            "mount",
            "init",
          ],
          [
            {
              source:
                USUARIOS_INDEX_SOURCE,
              context,
            },
          ],
          false
        );

      createOpen =
        result !== false;

      if (!createOpen) {
        createOpen = emitEvent(
          "usuarios:create:open",
          {
            source:
              USUARIOS_INDEX_SOURCE,
          }
        );
      }

      return createOpen;
    } catch (createError) {
      createOpen = false;

      showToast(
        safeError(
          createError,
          "No se pudo abrir el alta de usuario."
        ),
        "error"
      );

      return false;
    } finally {
      creating = false;

      render({
        header: true,
      });
    }
  }

  function closeCreate() {
    createOpen = false;

    const closed =
      safeCall(
        UsuariosCreateModal,
        "close",
        [],
        null
      ) ??
      safeCall(
        UsuariosCreateModal,
        "unmount",
        [],
        null
      ) ??
      emitEvent(
        "usuarios:create:close",
        {}
      );

    flushDeferredRender();

    return Boolean(
      closed !== false
    );
  }

  async function submitCreateUsuario(
    payload = {}
  ) {
    /*
      El modal es la autoridad de validación del formulario.
      Si submit devuelve null por validación/error NO hacemos
      un POST directo por detrás.
    */
    const submit =
      UsuariosCreateModal?.submit ||
      UsuariosCreateModal?.submitCreate ||
      UsuariosCreateModal?.save;

    if (!isFunction(submit)) {
      throw new Error(
        "USUARIOS_CREATE_MODAL_SUBMIT_UNAVAILABLE"
      );
    }

    return submit.call(
      UsuariosCreateModal,
      safeObject(payload)
    );
  }

  async function exportCsv() {
    if (
      exporting ||
      !items.length ||
      destroyed
    ) {
      return false;
    }

    exporting = true;

    render({
      header: true,
      immediate: true,
    });

    try {
      const csv =
        buildUsuariosCsv(items);

      const date =
        new Date()
          .toISOString()
          .slice(0, 10);

      const ok =
        downloadTextFile(
          csv,
          `usuarios-${date}.csv`
        );

      if (!ok) {
        throw new Error(
          "USUARIOS_CSV_DOWNLOAD_FAILED"
        );
      }

      showToast(
        "CSV de usuarios generado.",
        "success"
      );

      return true;
    } catch (exportError) {
      showToast(
        safeError(
          exportError,
          "No se pudo exportar el CSV."
        ),
        "error"
      );

      return false;
    } finally {
      exporting = false;

      render({
        header: true,
      });
    }
  }

  function setFilter(
    value = "all"
  ) {
    const normalized =
      normalizeKey(value);

    filter = [
      "all",
      "active",
      "pending",
      "blocked",
    ].includes(normalized)
      ? normalized
      : "all";

    resetVisibleLimit();

    render({
      history: true,
    });

    return filter;
  }

  function setSearch(
    value = ""
  ) {
    searchDraft =
      cleanText(value, "");

    search = searchDraft;

    resetVisibleLimit();

    render({
      history: true,
    });

    return search;
  }

  function scheduleSearch(
    value = ""
  ) {
    searchDraft =
      String(value ?? "");

    if (!isBrowser()) {
      return setSearch(
        searchDraft
      );
    }

    if (searchTimer) {
      window.clearTimeout(
        searchTimer
      );

      searchTimer = 0;
    }

    searchTimer =
      window.setTimeout(
        () => {
          searchTimer = 0;
          setSearch(
            searchDraft
          );
        },
        SEARCH_DEBOUNCE_MS
      );

    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    searchDraft = "";

    resetVisibleLimit();

    render({
      history: true,
    });

    return true;
  }

  function loadMore(
    value = null
  ) {
    const nextLimit =
      value === null ||
      value === undefined ||
      value === ""
        ? visibleLimit +
          DEFAULT_VISIBLE_ROWS
        : value;

    visibleLimit = clamp(
      nextLimit,
      1,
      500
    );

    render({
      history: true,
    });

    return visibleLimit;
  }

  function setVisibleLimit(
    value =
      DEFAULT_VISIBLE_ROWS
  ) {
    visibleLimit = clamp(
      value,
      1,
      500
    );

    render({
      history: true,
    });

    return visibleLimit;
  }

  /*
    Compat legacy de paginación:
    la UI sigue siendo load-more.
  */
  function goToPage(
    value = 1
  ) {
    const numeric =
      number(value, 1);

    if (numeric > 1) {
      return loadMore(
        numeric *
          DEFAULT_VISIBLE_ROWS
      );
    }

    resetVisibleLimit();

    render({
      history: true,
    });

    return 1;
  }

  function goPrevPage() {
    resetVisibleLimit();

    render({
      history: true,
    });

    return 1;
  }

  function goNextPage() {
    return loadMore();
  }

  function changePageSize(
    value =
      DEFAULT_VISIBLE_ROWS
  ) {
    return setVisibleLimit(
      value
    );
  }

  function actionFrom(
    node = null
  ) {
    return normalizeKey(
      first(
        node?.getAttribute?.(
          "data-usuarios-action"
        ),
        node?.getAttribute?.(
          "data-action"
        ),
        ""
      )
    );
  }

  async function handleAction(
    node = null,
    event = null
  ) {
    const action =
      actionFrom(node);

    if (!action) return false;

    const userId = cleanText(
      first(
        node?.getAttribute?.(
          "data-user-id"
        ),
        node
          ?.closest?.(
            "[data-user-id]"
          )
          ?.getAttribute?.(
            "data-user-id"
          ),
        ""
      ),
      ""
    );

    switch (action) {
      case DETAIL_ACTION:
      case "open_user":
        event?.preventDefault?.();
        await openUsuario(userId);
        return true;

      case CREATE_ACTION:
      case "create_user":
        event?.preventDefault?.();
        await openCreate();
        return true;

      case REFRESH_ACTION:
      case RETRY_ACTION:
        event?.preventDefault?.();
        await refresh();
        return true;

      case EXPORT_ACTION:
      case "export_csv":
        event?.preventDefault?.();
        await exportCsv();
        return true;

      case FILTER_ACTION:
      case "filter_usuarios":
        event?.preventDefault?.();

        setFilter(
          first(
            node?.getAttribute?.(
              "data-filter"
            ),
            node?.getAttribute?.(
              "data-filter-status"
            ),
            "all"
          )
        );

        return true;

      case CLEAR_SEARCH_ACTION:
      case "clear_search":
        event?.preventDefault?.();
        setSearch("");
        return true;

      case CLEAR_FILTERS_ACTION:
      case "clear_filters":
        event?.preventDefault?.();
        clearFilters();
        return true;

      case LOAD_MORE_ACTION:
      case "load_more":
        event?.preventDefault?.();

        loadMore(
          first(
            node?.getAttribute?.(
              "data-visible-limit"
            ),
            node?.getAttribute?.(
              "data-limit"
            ),
            null
          )
        );

        return true;

      default:
        return false;
    }
  }

  function bindHost() {
    if (
      !host ||
      hostClickHandler
    ) {
      return false;
    }

    hostClickHandler =
      async (event) => {
        const target =
          event.target;

        if (
          typeof Element ===
            "undefined" ||
          !(target instanceof Element)
        ) {
          return;
        }

        const actionNode =
          target.closest(
            "[data-usuarios-action], [data-action]"
          );

        if (
          !actionNode ||
          !host.contains(
            actionNode
          )
        ) {
          return;
        }

        await handleAction(
          actionNode,
          event
        );
      };

    hostInputHandler =
      (event) => {
        const target =
          event.target;

        if (
          typeof HTMLInputElement ===
            "undefined" ||
          !(
            target instanceof
            HTMLInputElement
          )
        ) {
          return;
        }

        if (
          target.matches(
            "[data-usuarios-search-input='true']"
          )
        ) {
          scheduleSearch(
            target.value
          );
        }
      };

    hostKeydownHandler =
      async (event) => {
        const target =
          event.target;

        if (
          typeof Element ===
            "undefined" ||
          !(target instanceof Element)
        ) {
          return;
        }

        if (
          (
            event.key === "Enter" ||
            event.key === " "
          ) &&
          target.matches(
            "[data-user-row='true'][data-user-id]"
          )
        ) {
          event.preventDefault();

          await openUsuario(
            target.getAttribute(
              "data-user-id"
            )
          );
        }
      };

    host.addEventListener(
      "click",
      hostClickHandler
    );

    host.addEventListener(
      "input",
      hostInputHandler
    );

    host.addEventListener(
      "keydown",
      hostKeydownHandler
    );

    return true;
  }

  function unbindHost() {
    if (!host) return false;

    try {
      if (hostClickHandler) {
        host.removeEventListener(
          "click",
          hostClickHandler
        );
      }

      if (hostInputHandler) {
        host.removeEventListener(
          "input",
          hostInputHandler
        );
      }

      if (hostKeydownHandler) {
        host.removeEventListener(
          "keydown",
          hostKeydownHandler
        );
      }
    } catch {
      // noop
    }

    hostClickHandler = null;
    hostInputHandler = null;
    hostKeydownHandler = null;

    return true;
  }

  function bindEvents() {
    const onModalRefresh =
      async (event) => {
        const payload =
          eventPayload(event);

        await refreshUsuario(
          first(
            payload.userId,
            payload.usuarioId,
            payload.id,
            ""
          )
        );
      };

    const onModalCopy =
      async (event) => {
        const payload =
          eventPayload(event);

        await copyUsuarioId(
          first(
            payload.userId,
            payload.usuarioId,
            payload.id,
            ""
          )
        );
      };

    const onModalClosed =
      () => {
        openingUserId = "";
        flushDeferredRender();
      };

    const onCreateSuccess =
      () => {
        createOpen = false;

        /*
          El modal emite varios aliases y puede emitir por
          AppCore.events + window. Todos comparten este task.
        */
        if (!createRefreshTask) {
          createRefreshTask =
            Promise.resolve()
              .then(() =>
                load({
                  force: true,
                  silent: true,
                })
              )
              .finally(() => {
                createRefreshTask =
                  null;

                flushDeferredRender();
              });
        }

        return createRefreshTask;
      };

    const onCreateClosed =
      () => {
        createOpen = false;
        flushDeferredRender();
      };

    unsubscribers.push(
      subscribeEvent(
        "usuarios:modal:refresh",
        onModalRefresh
      ),
      subscribeEvent(
        "usuarios:modal:copy",
        onModalCopy
      )
    );

    for (
      const eventName of
      DETAIL_CLOSE_EVENTS
    ) {
      unsubscribers.push(
        subscribeEvent(
          eventName,
          onModalClosed
        )
      );
    }

    for (
      const eventName of
      CREATE_SUCCESS_EVENTS
    ) {
      unsubscribers.push(
        subscribeEvent(
          eventName,
          onCreateSuccess
        )
      );
    }

    for (
      const eventName of
      CREATE_CLOSE_EVENTS
    ) {
      unsubscribers.push(
        subscribeEvent(
          eventName,
          onCreateClosed
        )
      );
    }

    return true;
  }

  function unbindEvents() {
    while (
      unsubscribers.length
    ) {
      const unsubscribe =
        unsubscribers.pop();

      try {
        unsubscribe?.();
      } catch {
        // noop
      }
    }

    return true;
  }

  function clearTimers() {
    if (
      searchTimer &&
      isBrowser()
    ) {
      window.clearTimeout(
        searchTimer
      );

      searchTimer = 0;
    }

    cancelFrame(renderFrame);

    renderFrame = 0;
    deferredRender = null;

    return true;
  }

  const controller = {
    version:
      USUARIOS_VIEW_VERSION,

    name:
      USUARIOS_MODULE_NAME,

    ownerId,
    host,
    context,

    async mount() {
      if (destroyed) {
        return controller;
      }

      if (!host) {
        throw new Error(
          "USUARIOS_HOST_REQUIRED"
        );
      }

      mounted = true;

      bindHost();
      bindEvents();

      if (!isRouteActive()) {
        return controller;
      }

      if (!isAdminContext(context)) {
        render({
          full: true,
          immediate: true,
          force: true,
        });

        return controller;
      }

      const cached =
        hydrateUsuariosFromCacheApi({
          freshOnly: true,
        });

      syncItems(
        safeArray(cached),
        getUsuariosApiStoreSnapshot()
      );

      if (items.length) {
        loading = false;
        refreshing = false;

        render({
          full: true,
          immediate: true,
          force: true,
        });
      } else {
        loading = true;
        renderInitialLoading();
      }

      void load({
        force: false,
        silent: true,
      });

      return controller;
    },

    render(options = {}) {
      return render({
        full: true,
        ...safeObject(
          options,
          {}
        ),
      });
    },

    reload() {
      return refresh();
    },

    refresh,
    load,

    openUsuario,
    refreshUsuario,
    copyUsuarioId,

    openCreate,
    closeCreate,
    submitCreateUsuario,

    exportCsv,

    setFilter,
    setSearch,
    clearFilters,
    loadMore,
    setVisibleLimit,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems() {
      return cloneItems(items);
    },

    getFilteredItems() {
      return cloneItems(
        selectFilteredItems()
      );
    },

    getPageItems() {
      return cloneItems(
        selectVisibleItems()
      );
    },

    getVisibleItems() {
      return cloneItems(
        selectVisibleItems()
      );
    },

    getPagination() {
      normalizeVisibleLimit();

      const filtered =
        selectFilteredItems();

      const visible =
        selectVisibleItems();

      return {
        page: 1,
        currentPage: 1,

        pageSize:
          visibleLimit,

        visibleLimit,
        visibleCount:
          visible.length,

        remainingCount:
          Math.max(
            0,
            filtered.length -
              visible.length
          ),

        totalPages: 1,
        totalCount:
          filtered.length,

        remoteCount,

        hasPrev: false,
        hasNext: false,

        hasMore:
          filtered.length >
          visible.length,
      };
    },

    getUsuarioById(id = "") {
      return (
        findUsuarioById(
          items,
          id
        ) || null
      );
    },

    getState() {
      return {
        ...viewState(),
        items:
          cloneItems(items),
      };
    },

    isAdmin() {
      return isAdminContext(
        context
      );
    },

    isInitialized() {
      return (
        mounted &&
        !destroyed
      );
    },

    isMounted() {
      return (
        mounted &&
        !destroyed
      );
    },

    isDestroyed() {
      return destroyed;
    },

    getSnapshot() {
      return {
        version:
          USUARIOS_VIEW_VERSION,

        apiVersion:
          USUARIOS_API_VERSION,

        ownerId,
        mounted,
        destroyed,

        routeActive:
          isRouteActive(),

        admin:
          isAdminContext(
            context
          ),

        role:
          getCurrentRole(
            context
          ),

        loading,
        refreshing,
        exporting,
        creating,

        createOpen:
          createModalOpen(),

        detailOpen:
          detailModalOpen(),

        openingUserId:
          openingUserId
            ? "***"
            : "",

        count:
          items.length,

        filteredCount:
          selectFilteredItems()
            .length,

        remoteCount,

        page: 1,
        visibleLimit,

        visibleCount:
          selectVisibleItems()
            .length,

        remainingCount:
          getRemainingCount(),

        hasMore:
          hasMoreVisibleItems(),

        pageSize:
          visibleLimit,

        totalPages: 1,
        filter,

        searchLength:
          (
            searchDraft ||
            search
          ).length,

        lastSyncAt,
        error,

        architecture: {
          singleApiAuthority: true,
          indexHttp: false,
          indexLocalStorage: false,
          indexPaginationBackend: false,
          apiContinuationTokens: true,
          duplicateCreateRefreshProtected: true,
          modalValidationBypass: false,
          csvFormulaInjectionProtected: true,
        },
      };
    },

    destroy() {
      if (destroyed) {
        return true;
      }

      destroyed = true;
      mounted = false;
      loadSequence += 1;

      clearTimers();
      unbindHost();
      unbindEvents();

      try {
        UsuariosDetailModal
          ?.close?.();
      } catch {
        // noop
      }

      try {
        UsuariosCreateModal
          ?.close?.();
      } catch {
        // noop
      }

      if (
        host?.[
          USUARIOS_CONTROLLER_KEY
        ] === controller
      ) {
        try {
          delete host[
            USUARIOS_CONTROLLER_KEY
          ];
        } catch {
          host[
            USUARIOS_CONTROLLER_KEY
          ] = null;
        }
      }

      const root =
        getGlobalObject();

      if (
        root?.[
          USUARIOS_GLOBAL_CONTROLLER_KEY
        ] === controller
      ) {
        try {
          delete root[
            USUARIOS_GLOBAL_CONTROLLER_KEY
          ];
        } catch {
          root[
            USUARIOS_GLOBAL_CONTROLLER_KEY
          ] = null;
        }
      }

      if (
        lastController ===
        controller
      ) {
        lastController = null;
      }

      if (host) {
        host.replaceChildren();
      }

      return true;
    },

    unmount() {
      return controller.destroy();
    },

    cleanup() {
      return controller.destroy();
    },
  };

  return controller;
}

/* =========================================================
   VIEW ENTRY
========================================================= */

export async function UsuariosView(
  host = null,
  context = {}
) {
  const resolvedHost =
    resolveHost(host, context);

  const root =
    getGlobalObject();

  const hostController =
    resolvedHost?.[
      USUARIOS_CONTROLLER_KEY
    ] || null;

  const globalController =
    root?.[
      USUARIOS_GLOBAL_CONTROLLER_KEY
    ] || null;

  const seen = new Set();

  for (const previous of [
    hostController,
    globalController,
  ]) {
    if (
      !previous ||
      seen.has(previous)
    ) {
      continue;
    }

    seen.add(previous);

    if (
      isFunction(
        previous.destroy
      )
    ) {
      try {
        previous.destroy();
      } catch {
        // noop
      }
    }
  }

  const controller =
    createUsuariosController(
      resolvedHost,
      context
    );

  if (resolvedHost) {
    resolvedHost[
      USUARIOS_CONTROLLER_KEY
    ] = controller;
  }

  root[
    USUARIOS_GLOBAL_CONTROLLER_KEY
  ] = controller;

  lastController = controller;

  registerGlobalBridge(
    controller
  );

  return controller.mount();
}

export const UsuariosIndex =
  UsuariosView;

export const view =
  UsuariosView;

export const component =
  UsuariosView;

export const page =
  UsuariosView;

export default UsuariosView;

/* =========================================================
   ACTIVE CONTROLLER / LEGACY WRAPPERS
========================================================= */

export function getActiveUsuariosController() {
  const root =
    getGlobalObject();

  return (
    root?.[
      USUARIOS_GLOBAL_CONTROLLER_KEY
    ] ||
    lastController ||
    null
  );
}

export const init = (...args) =>
  UsuariosView(...args);

export const mount = (...args) =>
  UsuariosView(...args);

export const bootstrap = (...args) =>
  UsuariosView(...args);

export const render = (
  options = {}
) =>
  getActiveUsuariosController()
    ?.render?.(options) ||
  false;

export const reload = () =>
  getActiveUsuariosController()
    ?.reload?.() ||
  Promise.resolve([]);

export const refresh = () =>
  getActiveUsuariosController()
    ?.refresh?.() ||
  Promise.resolve([]);

export const destroy = () =>
  getActiveUsuariosController()
    ?.destroy?.() ||
  true;

export const unmount = destroy;
export const dispose = destroy;

export const openUsuario = (
  userId = ""
) =>
  getActiveUsuariosController()
    ?.openUsuario?.(userId) ||
  Promise.resolve(null);

export const refreshUsuario = (
  userId = ""
) =>
  getActiveUsuariosController()
    ?.refreshUsuario?.(userId) ||
  Promise.resolve(null);

export const copyUsuarioId = (
  userId = ""
) =>
  getActiveUsuariosController()
    ?.copyUsuarioId?.(userId) ||
  Promise.resolve(false);

export const openCreate = () =>
  getActiveUsuariosController()
    ?.openCreate?.() ||
  Promise.resolve(false);

export const createUsuario =
  openCreate;

export const createUsuarioView =
  openCreate;

export const initCreate =
  openCreate;

export const closeCreate = () =>
  getActiveUsuariosController()
    ?.closeCreate?.() ||
  true;

export const renderCreate = () =>
  safeCall(
    UsuariosCreateModal,
    "render",
    [],
    null
  );

export const resetCreate = () =>
  safeCall(
    UsuariosCreateModal,
    "reset",
    [],
    undefined
  );

export const getCreateState = () =>
  safeCall(
    UsuariosCreateModal,
    "getState",
    [],
    null
  );

export const submitCreateUsuario = (
  payload = {}
) => {
  const controller =
    getActiveUsuariosController();

  if (
    controller
      ?.submitCreateUsuario
  ) {
    return controller
      .submitCreateUsuario(
        payload
      );
  }

  /*
    Sin controlador activo seguimos usando el modal
    para no saltarnos su validación.
  */
  const submit =
    UsuariosCreateModal?.submit ||
    UsuariosCreateModal?.submitCreate ||
    UsuariosCreateModal?.save;

  return isFunction(submit)
    ? submit.call(
        UsuariosCreateModal,
        safeObject(payload)
      )
    : Promise.resolve(null);
};

export const exportCsv = () =>
  getActiveUsuariosController()
    ?.exportCsv?.() ||
  Promise.resolve(false);

export const loadMore = (
  limit = null
) =>
  getActiveUsuariosController()
    ?.loadMore?.(limit) ||
  DEFAULT_VISIBLE_ROWS;

export const setVisibleLimit = (
  limit =
    DEFAULT_VISIBLE_ROWS
) =>
  getActiveUsuariosController()
    ?.setVisibleLimit?.(limit) ||
  DEFAULT_VISIBLE_ROWS;

export const goToPage = (
  pageNumber = 1
) =>
  getActiveUsuariosController()
    ?.goToPage?.(pageNumber) ||
  1;

export const goPrevPage = () =>
  getActiveUsuariosController()
    ?.goPrevPage?.() ||
  1;

export const goNextPage = () =>
  getActiveUsuariosController()
    ?.goNextPage?.() ||
  DEFAULT_VISIBLE_ROWS;

export const changePageSize = (
  size =
    DEFAULT_VISIBLE_ROWS
) =>
  getActiveUsuariosController()
    ?.changePageSize?.(size) ||
  DEFAULT_VISIBLE_ROWS;

/* =========================================================
   STORE / MODEL COMPAT
   Delegado al API; no hay segunda cache.
========================================================= */

export const usuariosState =
  usuariosApiState;

export const getUsuarios = () => {
  const controller =
    getActiveUsuariosController();

  if (controller?.getItems) {
    return controller.getItems();
  }

  return cloneItems(
    getUsuariosApiStore()
  );
};

export const getSortedUsuariosStore =
  () => {
    const controller =
      getActiveUsuariosController();

    if (controller?.getItems) {
      return normalizeUsuariosCollection(
        controller.getItems()
      );
    }

    return cloneItems(
      getSortedUsuariosApiStore()
    );
  };

export const getUsuariosCount =
  () =>
    getActiveUsuariosController()
      ?.getItems?.().length ??
    getUsuariosApiCount();

export const hasUsuarios =
  () =>
    getActiveUsuariosController()
      ?.getItems?.().length
      ? true
      : hasUsuariosApi();

export const getUsuariosStoreSnapshot =
  () => {
    const controller =
      getActiveUsuariosController();

    if (!controller) {
      return getUsuariosApiStoreSnapshot();
    }

    const state =
      controller.getState();

    return {
      version:
        USUARIOS_VIEW_VERSION,

      apiVersion:
        USUARIOS_API_VERSION,

      items:
        cloneItems(
          state.items
        ),

      count:
        safeArray(
          state.items
        ).length,

      remoteCount:
        number(
          state.remoteCount,
          safeArray(
            state.items
          ).length
        ),

      lastSyncAt:
        number(
          state.lastSyncAt,
          0
        ),
    };
  };

export const getUsuariosStateSnapshot =
  () => ({
    ...getUsuariosApiStateSnapshot(),
    view:
      getActiveUsuariosController()
        ?.getState?.() ||
      null,
  });

export const getItems =
  getUsuarios;

export const getPageItems = () =>
  getActiveUsuariosController()
    ?.getPageItems?.() ||
  [];

export const getVisibleItems = () =>
  getActiveUsuariosController()
    ?.getVisibleItems?.() ||
  getPageItems();

export const getPagination = () =>
  getActiveUsuariosController()
    ?.getPagination?.() ||
  null;

export const getUsuarioByIdStore =
  (id = "") => {
    const controller =
      getActiveUsuariosController();

    return (
      controller
        ?.getUsuarioById?.(id) ||
      getUsuarioByIdApiStore(id) ||
      null
    );
  };

export const getUsuarioById =
  getUsuarioByIdStore;

export const getState = () =>
  getActiveUsuariosController()
    ?.getState?.() || {
      ...getUsuariosApiStateSnapshot(),
      items:
        getUsuarios(),
    };

export const getSnapshot = () =>
  getActiveUsuariosController()
    ?.getSnapshot?.() || {
      version:
        USUARIOS_VIEW_VERSION,
      apiVersion:
        USUARIOS_API_VERSION,
      mounted: false,
      destroyed: false,
      api:
        getUsuariosApiSnapshot(),
      architecture: {
        singleApiAuthority: true,
        indexHttp: false,
        indexLocalStorage: false,
      },
    };

export const isAdmin = () =>
  getActiveUsuariosController()
    ?.isAdmin?.() ||
  isAdminContext({});

export const isInitialized = () =>
  getActiveUsuariosController()
    ?.isInitialized?.() ||
  false;

export const isDestroyed = () =>
  getActiveUsuariosController()
    ?.isDestroyed?.() ??
  true;

export const isMounted = () =>
  getActiveUsuariosController()
    ?.isMounted?.() ||
  false;

export const canRenderUsuariosNow =
  (context = {}) =>
    isUsuariosRoute(
      safeObject(
        context,
        {}
      )
    );

export const getUsuariosRouteDebug =
  (context = {}) => ({
    browserPath:
      getBrowserPath(),

    contextPath:
      routePathFromContext(
        context
      ),

    canonicalPath:
      USUARIOS_CANONICAL_PATH,

    allowed:
      isUsuariosRoute(
        context
      ),

    role:
      getCurrentRole(
        context
      ),

    admin:
      isAdminContext(
        context
      ),

    apiVersion:
      USUARIOS_API_VERSION,

    singleApiAuthority: true,
    apiFallbackActive: false,
  });

/* =========================================================
   MODAL COMPAT
========================================================= */

export const openModal = (
  detail = {}
) =>
  UsuariosDetailModal?.open?.(
    normalizeUsuarioModel(detail)
  ) ||
  false;

export const closeModal = () =>
  UsuariosDetailModal?.close?.() ||
  true;

export const refreshModal = () =>
  UsuariosDetailModal?.refresh?.() ||
  false;

export const updateModal = (
  detail = {}
) =>
  UsuariosDetailModal?.update?.(
    normalizeUsuarioModel(detail)
  ) ||
  false;

export const getModalState = () =>
  UsuariosDetailModal?.getState?.() ||
  null;

/* =========================================================
   PUBLIC MODULE / GLOBAL BRIDGE
========================================================= */

export const UsuariosModule = {
  name:
    USUARIOS_MODULE_NAME,

  viewName:
    USUARIOS_VIEW_NAME,

  version:
    USUARIOS_VIEW_VERSION,

  source:
    USUARIOS_INDEX_SOURCE,

  UsuariosView,
  UsuariosIndex,

  View: UsuariosView,
  view,
  component,
  page,

  init,
  mount,
  bootstrap,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,

  openUsuario,
  refreshUsuario,
  copyUsuarioId,

  openCreate,
  createUsuario,
  createUsuarioView,
  closeCreate,
  renderCreate,
  resetCreate,
  getCreateState,
  submitCreateUsuario,

  exportCsv,

  loadMore,
  setVisibleLimit,
  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  getUsuarios,
  getItems,
  getPageItems,
  getVisibleItems,
  getPagination,
  getUsuarioByIdStore,
  getUsuarioById,
  getState,
  getSnapshot,

  openModal,
  closeModal,
  refreshModal,
  updateModal,
  getModalState,

  isAdmin,
  isInitialized,
  isDestroyed,
  isMounted,
  canRenderUsuariosNow,
  getUsuariosRouteDebug,

  api: {
    fetchUsuariosRequest,
    getUsuarioByIdRequest,
    createUsuarioRequest,
    updateUsuarioRequest,
    deleteUsuarioRequest,
    fetchUsuariosStatsRequest,

    hydrateFromCache,
    hydrateUsuariosFromCache,

    loadUsuarios,
    listUsuarios,

    loadUsuarioDetail,
    getUsuarioById:
      getUsuarioByIdApi,

    createUsuario:
      createUsuarioApi,

    updateUsuario:
      updateUsuarioApi,

    deleteUsuario:
      deleteUsuarioApi,

    getSnapshot:
      getUsuariosApiSnapshot,
  },

  store: {
    getUsuarios,
    getSortedUsuariosStore,
    getUsuarioByIdStore,
    getUsuariosCount,
    hasUsuarios,
    getUsuariosStoreSnapshot,
  },

  model: {
    normalizeUsuarioModel,
    normalizeUsuariosCollection,
    findUsuarioById,
    paginateUsuarios,
    computeUsuariosStats,
  },

  state:
    usuariosState,
};

export function registerGlobalBridge(
  controller = null
) {
  const root =
    getGlobalObject();

  const active =
    controller ||
    getActiveUsuariosController();

  try {
    root.OnionUsuarios = {
      ...safeObject(
        root.OnionUsuarios,
        {}
      ),
      ...UsuariosModule,
      controller: active,
    };

    root.OnionUsuariosView =
      UsuariosView;

    root.UsuariosView =
      UsuariosView;

    if (!root.OnionUsuariosModal) {
      root.OnionUsuariosModal =
        UsuariosDetailModal;
    }

    if (
      !root.OnionUsuariosCreateModal
    ) {
      root.OnionUsuariosCreateModal =
        UsuariosCreateModal;
    }
  } catch {
    // noop
  }

  try {
    if (AppCore) {
      if (
        !isObject(
          AppCore.modules
        )
      ) {
        AppCore.modules = {};
      }

      AppCore.modules.Usuarios =
        UsuariosModule;

      AppCore.modules.UsuariosView =
        UsuariosModule;

      AppCore.modules.OnionUsuarios =
        UsuariosModule;
    }
  } catch {
    // noop
  }

  emitEvent(
    "usuarios:index:ready",
    {
      version:
        USUARIOS_VIEW_VERSION,

      apiVersion:
        USUARIOS_API_VERSION,

      source:
        USUARIOS_INDEX_SOURCE,

      mounted: Boolean(
        active?.isMounted?.()
      ),

      route:
        getBrowserPath(),

      singleApiAuthority: true,
    }
  );

  return UsuariosModule;
}

export const bridge =
  registerGlobalBridge();

export const ready = true;

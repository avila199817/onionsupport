/* =========================================================
   Onion Support - Usuarios Index
   Archivo: /src/views/usuarios/index.js

   PRODUCTIVO · CONTROLADOR ÚNICO · LÓGICA FACTURAS · 10/10

   Responsabilidad:
   - Punto de entrada real de la vista Usuarios.
   - Montaje inmediato desde cache/store sin bloquear el Router.
   - Carga remota en background mediante usuarios.api.js.
   - Un único controlador activo por host y por aplicación.
   - Sin dependencia de usuariosView.js ni usuarios.actions.js.
   - Delegación de HTML en usuarios.table.template.js.
   - Integración directa con usuarios.modal.js.
   - Integración compatible con usuarios.create.modal.js.
   - Búsqueda, filtros y paginación local estable.
   - Apertura de detalle con API + fallback de cache.
   - Exportación CSV segura.
   - Render diferido mientras existe un modal abierto.
   - Limpieza total de listeners, timers y renders tardíos.
   - Compatible con /usuarios y /@usuario/usuarios.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  hydrateFromCache,
  loadUsuarios,
  loadUsuarioDetail,
  createUsuario as createUsuarioApi,
  updateUsuario as updateUsuarioApi,
  deleteUsuario as deleteUsuarioApi,
  fetchUsuariosRequest,
  getUsuarioByIdRequest,
  createUsuarioRequest,
  updateUsuarioRequest,
  deleteUsuarioRequest,
} from "./usuarios.api.js";

import {
  renderUsuariosTableTemplate,
  renderHeader,
  renderTable,
  renderLoadingState,
  renderErrorState,
  renderAccessDeniedState,
} from "./usuarios.table.template.js";

import UsuariosCreateModal from "./usuarios.create.modal.js";
import UsuariosDetailModal from "./usuarios.modal.js";

import {
  usuariosState,
  getUsuariosStateSnapshot,
} from "./usuarios.state.js";

import {
  getUsuarios,
  getSortedUsuariosStore,
  getUsuarioByIdStore,
  getUsuariosCount,
  hasUsuarios,
  getUsuariosStoreSnapshot,
} from "./usuarios.store.js";

import {
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,
} from "./usuarios.model.js";

/* =========================================================
   META / CONSTANTS
========================================================= */

export const USUARIOS_MODULE_NAME = "usuarios";
export const USUARIOS_VIEW_NAME = "UsuariosView";
export const USUARIOS_CANONICAL_PATH = "/usuarios";
export const USUARIOS_INDEX_VERSION =
  "usuarios.index.productive.v12.facturas-controller";
export const USUARIOS_VIEW_VERSION = USUARIOS_INDEX_VERSION;
export const USUARIOS_MODULE_VERSION = USUARIOS_INDEX_VERSION;
export const USUARIOS_INDEX_SOURCE = "views.usuarios.index";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
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
const PREV_PAGE_ACTION = "prev-page";
const NEXT_PAGE_ACTION = "next-page";

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
   RE-EXPORTS COMPATIBLES
========================================================= */

export {
  usuariosState,
  getUsuariosStateSnapshot,

  getUsuarios,
  getSortedUsuariosStore,
  getUsuarioByIdStore,
  getUsuariosCount,
  hasUsuarios,
  getUsuariosStoreSnapshot,

  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,

  hydrateFromCache,
  loadUsuarios,
  loadUsuarioDetail,

  fetchUsuariosRequest,
  getUsuarioByIdRequest,
  createUsuarioRequest,
  updateUsuarioRequest,
  deleteUsuarioRequest,

  createUsuarioApi,
  updateUsuarioApi,
  deleteUsuarioApi,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values.flat(Infinity)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(number(value, min), min), max);
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
    .replace(/\s+/g, " ")
    .trim();
}

function safeError(error = null, fallback = "No se pudieron cargar los usuarios.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.payload?.message,
      error?.error,
      fallback
    ),
    fallback
  );
}

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}

function nextFrame(callback = null) {
  if (!isBrowser() || !isFunction(callback)) return 0;

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

function safeCall(target = null, method = "", args = [], fallback = null) {
  try {
    const fn = target?.[method];
    return isFunction(fn) ? fn.apply(target, safeArray(args)) : fallback;
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
    try {
      const fn = target?.[method];

      if (isFunction(fn)) {
        return await fn.apply(target, safeArray(args));
      }
    } catch (error) {
      throw error;
    }
  }

  return fallback;
}

/* =========================================================
   APP / AUTH / ROUTE
========================================================= */

function getAppState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getAppState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
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

  return role;
}

function getCurrentRole(context = {}) {
  const state = getAppState();
  const user = safeObject(getCurrentUser(), {});

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
  return context.admin === true || getCurrentRole(context) === "admin";
}

function normalizePathname(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  const segments = value.split("/").filter(Boolean);

  if (segments[0]?.startsWith("@")) {
    value = `/${segments.slice(1).join("/")}` || "/";
  }

  return value;
}

function getBrowserPath() {
  if (!isBrowser()) return "";

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/")) {
      return normalizePathname(hash.slice(1));
    }

    if (hash.startsWith("#!/")) {
      return normalizePathname(hash.slice(2));
    }

    return normalizePathname(window.location.pathname || "/");
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
  const explicit = routePathFromContext(context);

  if (explicit) {
    return normalizePathname(explicit) === USUARIOS_CANONICAL_PATH;
  }

  const browserPath = getBrowserPath();

  if (browserPath) {
    return browserPath === USUARIOS_CANONICAL_PATH;
  }

  return true;
}

function resolveHost(host = null, context = {}) {
  if (host?.nodeType === 1) return host;
  if (context.host?.nodeType === 1) return context.host;
  if (context.root?.nodeType === 1) return context.root;
  if (context.container?.nodeType === 1) return context.container;

  if (!isBrowser()) return null;

  return (
    document.querySelector("[data-view-host='usuarios']") ||
    document.querySelector("[data-usuarios-host='true']") ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
}

/* =========================================================
   TOAST / EVENT BUS
========================================================= */

function showToast(message = "", type = "info") {
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

function subscribeEvent(eventName = "", handler = null) {
  const name = cleanText(eventName, "");
  if (!name || !isFunction(handler)) return () => {};

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
      window.addEventListener(name, handler);
      windowBound = true;
    }
  } catch {
    // noop
  }

  return () => {
    try {
      if (appBound && isFunction(AppCore?.events?.off)) {
        AppCore.events.off(name, handler);
      }
    } catch {
      // noop
    }

    try {
      if (windowBound && isBrowser()) {
        window.removeEventListener(name, handler);
      }
    } catch {
      // noop
    }
  };
}

function emitEvent(eventName = "", payload = {}) {
  const name = cleanText(eventName, "");
  if (!name) return false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      return true;
    }
  } catch {
    // noop
  }

  return false;
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
   USER HELPERS
========================================================= */

function getUsuarioId(item = {}) {
  const raw = safeObject(item?.raw, {});

  return cleanText(
    first(
      item.userId,
      item.usuarioId,
      item.id,
      item.uid,
      item._id,
      item.username,
      item.email,
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw.uid,
      raw._id,
      raw.username,
      raw.email,
      ""
    ),
    ""
  );
}

function getUsuarioName(item = {}) {
  const raw = safeObject(item?.raw, {});

  return cleanText(
    first(
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      item.username,
      item.email,
      raw.fullName,
      raw.displayName,
      raw.name,
      raw.nombre,
      raw.username,
      raw.email,
      "Usuario"
    ),
    "Usuario"
  );
}

function getUsuarioEmail(item = {}) {
  const raw = safeObject(item?.raw, {});

  return cleanText(
    first(item.email, item.mail, raw.email, raw.mail, ""),
    ""
  ).toLowerCase();
}

function getUsuarioPhone(item = {}) {
  const raw = safeObject(item?.raw, {});

  return cleanText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      raw.phone,
      raw.telefono,
      raw.mobile,
      ""
    ),
    ""
  );
}

function getUsuarioCity(item = {}) {
  const raw = safeObject(item?.raw, {});

  return cleanText(
    first(
      item.city,
      item.ciudad,
      item.location?.city,
      item.location?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,
      raw.city,
      raw.ciudad,
      raw.location?.city,
      raw.location?.ciudad,
      raw.address?.city,
      raw.address?.ciudad,
      raw.direccion?.city,
      raw.direccion?.ciudad,
      ""
    ),
    ""
  );
}

function getUsuarioRole(item = {}) {
  const raw = safeObject(item?.raw, {});

  return cleanText(
    first(item.role, item.rol, item.userRole, raw.role, raw.rol, raw.userRole, "user"),
    "user"
  );
}

function getUsuarioStatus(item = {}) {
  const raw = safeObject(item?.raw, {});

  const explicit = first(
    item.status,
    item.estado,
    item.state,
    raw.status,
    raw.estado,
    raw.state
  );

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    return normalizeKey(explicit);
  }

  const active = first(
    item.active,
    item.isActive,
    item.enabled,
    raw.active,
    raw.isActive,
    raw.enabled
  );

  if (active === false) return "blocked";
  if (active === true) return "active";

  return "active";
}

function statusBucket(item = {}) {
  const status = getUsuarioStatus(item);

  if (
    [
      "pending",
      "pendiente",
      "invited",
      "invitation_pending",
      "unverified",
      "email_pending",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "inactive",
      "inactivo",
      "inactiva",
      "disabled",
      "suspended",
      "deleted",
    ].includes(status)
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
      item.userName,
      item.clienteId,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function filterUsuarios(items = [], { filter = "all", search = "" } = {}) {
  const normalizedFilter = normalizeKey(filter || "all");
  const query = normalizeSearch(search);
  const terms = query.split(" ").filter(Boolean);

  return safeArray(items).filter((item) => {
    if (normalizedFilter !== "all" && statusBucket(item) !== normalizedFilter) {
      return false;
    }

    if (!terms.length) return true;

    const haystack = usuarioSearchText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

function cloneItems(items = []) {
  return safeArray(items).map((item) => ({ ...safeObject(item, {}) }));
}

/* =========================================================
   CSV
========================================================= */

function csvEscape(value = "") {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function buildUsuariosCsv(items = []) {
  const header = [
    "ID",
    "Nombre",
    "Email",
    "Teléfono",
    "Ciudad",
    "Rol",
    "Estado",
  ];

  const rows = safeArray(items).map((item) => [
    getUsuarioId(item),
    getUsuarioName(item),
    getUsuarioEmail(item),
    getUsuarioPhone(item),
    getUsuarioCity(item),
    getUsuarioRole(item),
    getUsuarioStatus(item),
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvEscape).join(";"))
    .join("\r\n");
}

function downloadTextFile(content = "", filename = "usuarios.csv", type = "text/csv;charset=utf-8") {
  if (!isBrowser()) return false;

  try {
    const blob = new Blob(["\uFEFF", String(content || "")], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = cleanText(filename, "usuarios.csv");
    anchor.rel = "noopener";
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CONTROLLER
========================================================= */

function createUsuariosController(rawHost = null, rawContext = {}) {
  const context = safeObject(rawContext, {});
  const host = resolveHost(rawHost, context);
  const ownerId = `${USUARIOS_VIEW_VERSION}:${++controllerSequence}`;

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
  let lastSyncAt = null;

  let filter = "all";
  let search = "";
  let searchDraft = "";
  let page = DEFAULT_PAGE;
  let pageSize = DEFAULT_PAGE_SIZE;

  let loadSequence = 0;
  let renderFrame = 0;
  let searchTimer = 0;
  let deferredRender = null;

  let hostClickHandler = null;
  let hostInputHandler = null;
  let hostKeydownHandler = null;

  const unsubscribers = [];

  function isAlive() {
    return !destroyed && mounted && Boolean(host?.isConnected);
  }

  function isRouteActive() {
    return isUsuariosRoute(context);
  }

  function readStateSnapshot() {
    try {
      return safeObject(getUsuariosStateSnapshot?.(), usuariosState);
    } catch {
      return safeObject(usuariosState, {});
    }
  }

  function syncFromStore() {
    const state = readStateSnapshot();
    const storeItems = safeArray(getUsuarios?.());
    const stateItems = safeArray(state.items);
    const nextItems = storeItems.length ? storeItems : stateItems;

    items = normalizeUsuariosCollection(nextItems);
    remoteCount = Math.max(
      items.length,
      number(first(state.remoteCount, state.totalCount, state.count, items.length), items.length)
    );
    lastSyncAt = first(state.lastSyncAt, state.updatedAt, state.lastUpdatedAt, lastSyncAt);

    return items;
  }

  function getFilteredItems() {
    return filterUsuarios(items, { filter, search: searchDraft || search });
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(getFilteredItems().length / pageSize));
  }

  function normalizePage() {
    page = clamp(page, 1, getTotalPages());
    return page;
  }

  function getPageItemsInternal() {
    normalizePage();
    const filtered = getFilteredItems();
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }

  function detailModalOpen() {
    try {
      return UsuariosDetailModal?.getState?.()?.isOpen === true;
    } catch {
      return false;
    }
  }

  function createModalOpen() {
    if (createOpen) return true;

    try {
      return UsuariosCreateModal?.getState?.()?.isOpen === true;
    } catch {
      return false;
    }
  }

  function anyModalOpen() {
    return detailModalOpen() || createModalOpen();
  }

  function viewState() {
    const source = readStateSnapshot();

    return {
      ...source,

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
      search: searchDraft || search,
      searchQuery: searchDraft || search,
      page,
      currentPage: page,
      usuariosPage: page,
      pageSize,
      usuariosPageSize: pageSize,

      remoteCount,
      totalCount: remoteCount,
      total: remoteCount,
      lastSyncAt,
    };
  }

  function viewPayload() {
    const admin = isAdminContext(context);

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
      search: searchDraft || search,
      searchQuery: searchDraft || search,
      page,
      currentPage: page,
      pageSize,

      remoteCount,
      totalCount: remoteCount,
      total: remoteCount,
      lastSyncAt,

      admin,
      role: getCurrentRole(context),
      forbidden: !admin,
      restricted: !admin,
      accessDenied: !admin,

      route: USUARIOS_CANONICAL_PATH,
      source: USUARIOS_INDEX_SOURCE,
      version: USUARIOS_VIEW_VERSION,
    };
  }

  function captureDomState() {
    if (!host || !isBrowser()) return {};

    const active = document.activeElement;
    const searchInput = host.querySelector("[data-usuarios-search-input='true']");
    const activeIsSearch = active === searchInput;

    return {
      scrollTop: host.scrollTop,
      activeIsSearch,
      selectionStart: activeIsSearch ? searchInput.selectionStart : null,
      selectionEnd: activeIsSearch ? searchInput.selectionEnd : null,
    };
  }

  function restoreDomState(snapshot = {}) {
    if (!host || !isBrowser()) return false;

    try {
      host.scrollTop = number(snapshot.scrollTop, 0);

      if (snapshot.activeIsSearch) {
        const input = host.querySelector("[data-usuarios-search-input='true']");

        input?.focus?.({ preventScroll: true });

        if (
          input &&
          typeof input.setSelectionRange === "function" &&
          Number.isInteger(snapshot.selectionStart) &&
          Number.isInteger(snapshot.selectionEnd)
        ) {
          input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function htmlFragment(html = "") {
    if (!isBrowser()) return null;

    const template = document.createElement("template");
    template.innerHTML = String(html || "").trim();
    return template.content;
  }

  function commitFull(html = "") {
    if (!host || destroyed) return false;

    const snapshot = captureDomState();
    const fragment = htmlFragment(html);

    if (!fragment) return false;

    host.replaceChildren(fragment);
    host.setAttribute("data-usuarios-controller", ownerId);
    host.setAttribute("data-usuarios-version", USUARIOS_VIEW_VERSION);

    restoreDomState(snapshot);
    return true;
  }

  function replaceSection(selector = "", html = "") {
    if (!host || !selector) return false;

    const current = host.querySelector(selector);
    const fragment = htmlFragment(html);
    const next = fragment?.querySelector?.(selector);

    if (!current || !next) return false;

    current.replaceWith(next);
    return true;
  }

  function renderNow({ full = false, header = false, history = false, force = false } = {}) {
    if (destroyed || !host || !isRouteActive()) return false;

    if (!force && anyModalOpen()) {
      deferredRender = {
        full: Boolean(deferredRender?.full || full),
        header: Boolean(deferredRender?.header || header),
        history: Boolean(deferredRender?.history || history),
        force: false,
      };

      return true;
    }

    deferredRender = null;
    normalizePage();

    const payload = viewPayload();
    const hasRoot = Boolean(host.querySelector("[data-usuarios-scope='true']"));

    if (full || !hasRoot) {
      return commitFull(renderUsuariosTableTemplate(payload));
    }

    const snapshot = captureDomState();
    let changed = false;

    if (header) {
      changed = replaceSection(".usuarios-hero", renderHeader(payload)) || changed;
    }

    if (history) {
      changed = replaceSection(".usuarios-history", renderTable(payload)) || changed;
    }

    if (!changed && (header || history)) {
      return commitFull(renderUsuariosTableTemplate(payload));
    }

    restoreDomState(snapshot);
    return true;
  }

  function render(options = {}) {
    if (destroyed || !host) return false;

    const next = {
      full: options.full === true,
      header: options.header === true,
      history: options.history === true,
      force: options.force === true,
    };

    if (options.immediate === true) {
      cancelFrame(renderFrame);
      renderFrame = 0;
      return renderNow(next);
    }

    deferredRender = {
      full: Boolean(deferredRender?.full || next.full),
      header: Boolean(deferredRender?.header || next.header),
      history: Boolean(deferredRender?.history || next.history),
      force: Boolean(deferredRender?.force || next.force),
    };

    if (renderFrame) return true;

    renderFrame = nextFrame(() => {
      const pending = deferredRender || {};
      renderFrame = 0;
      deferredRender = null;
      renderNow(pending);
    });

    return true;
  }

  function flushDeferredRender() {
    if (!deferredRender || anyModalOpen()) return false;

    const pending = deferredRender;
    deferredRender = null;
    return render({ ...pending, immediate: true, force: true });
  }

  function renderInitialLoading() {
    if (!host || destroyed) return false;

    const admin = isAdminContext(context);

    if (!admin) {
      return commitFull(`
        <section class="usuarios-view-root" data-usuarios-scope="true">
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

  function renderFatalError(message = "") {
    if (!host || destroyed) return false;

    return commitFull(`
      <section class="usuarios-view-root has-error" data-usuarios-scope="true">
        ${renderErrorState(cleanText(message, "No se pudieron cargar los usuarios."))}
      </section>
    `);
  }

  async function load({ force = false, silent = false } = {}) {
    if (destroyed || !isRouteActive()) return items;
    if (!isAdminContext(context)) return items;

    const sequence = ++loadSequence;
    const hadItems = items.length > 0;

    error = "";
    loading = !hadItems;
    refreshing = hadItems;

    render({
      full: !hadItems,
      header: hadItems,
      history: hadItems,
      immediate: true,
    });

    try {
      await loadUsuarios({
        force,
        silent: true,
      });

      if (destroyed || sequence !== loadSequence || !isRouteActive()) {
        return items;
      }

      syncFromStore();
      error = "";
      loading = false;
      refreshing = false;
      normalizePage();

      render({ full: true, immediate: true });
      return items;
    } catch (loadError) {
      if (destroyed || sequence !== loadSequence) return items;

      syncFromStore();
      error = safeError(loadError);
      loading = false;
      refreshing = false;

      if (items.length) {
        render({ header: true, history: true, immediate: true });
        showToast(error, "error");
      } else {
        renderFatalError(error);
      }

      return items;
    }
  }

  async function refresh() {
    if (refreshing || loading) return items;
    return load({ force: true, silent: true });
  }

  async function openUsuario(userId = "") {
    const id = cleanText(userId, "");

    if (!id || openingUserId || destroyed) return null;

    openingUserId = id;
    error = "";
    render({ history: true, immediate: true });

    try {
      const cached = findUsuarioById(items, id) || getUsuarioByIdStore?.(id) || null;
      const detail = (await loadUsuarioDetail(id)) || cached;

      if (destroyed || !detail) {
        throw new Error("USUARIO_DETAIL_NOT_FOUND");
      }

      openingUserId = "";
      UsuariosDetailModal?.open?.(detail);

      // El loader de la fila se limpia al cerrar el modal sin repintar
      // la vista que queda detrás del backdrop.
      render({ history: true });

      emitEvent("usuarios:detail:opened", { detail, userId: id });
      return detail;
    } catch (detailError) {
      openingUserId = "";
      render({ history: true, immediate: true, force: true });
      showToast(safeError(detailError, "No se pudo abrir el usuario."), "error");
      return null;
    }
  }

  async function refreshUsuario(userId = "") {
    const modalState = safeObject(UsuariosDetailModal?.getState?.(), {});
    const id = cleanText(
      first(userId, modalState.userId, getUsuarioId(modalState.detail), ""),
      ""
    );

    if (!id || destroyed) return null;

    try {
      const detail = await loadUsuarioDetail(id);

      if (detail) {
        UsuariosDetailModal?.update?.(detail);
        syncFromStore();
        render({ full: true });
      }

      return detail;
    } catch (detailError) {
      showToast(safeError(detailError, "No se pudo actualizar el usuario."), "error");
      return null;
    }
  }

  async function copyUsuarioId(userId = "") {
    const modalState = safeObject(UsuariosDetailModal?.getState?.(), {});
    const id = cleanText(
      first(userId, modalState.userId, getUsuarioId(modalState.detail), ""),
      ""
    );

    if (!id || !isBrowser()) return false;

    try {
      await navigator.clipboard.writeText(id);
      showToast("ID de usuario copiado.", "success");
      return true;
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = id;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();

        if (copied) showToast("ID de usuario copiado.", "success");
        return copied;
      } catch {
        showToast("No se pudo copiar el ID del usuario.", "error");
        return false;
      }
    }
  }

  async function openCreate() {
    if (destroyed || creating || createModalOpen()) return false;

    creating = true;
    render({ header: true, immediate: true });

    try {
      const result = await safeAsyncCall(
        UsuariosCreateModal,
        ["open", "mount", "init"],
        [
          {
            source: USUARIOS_INDEX_SOURCE,
            context,
          },
        ],
        false
      );

      createOpen = result !== false;

      if (!createOpen) {
        createOpen = emitEvent("usuarios:create:open", {
          source: USUARIOS_INDEX_SOURCE,
        });
      }

      return createOpen;
    } catch (createError) {
      createOpen = false;
      showToast(safeError(createError, "No se pudo abrir el alta de usuario."), "error");
      return false;
    } finally {
      creating = false;
      render({ header: true });
    }
  }

  function closeCreate() {
    createOpen = false;

    const closed =
      safeCall(UsuariosCreateModal, "close", [], null) ??
      safeCall(UsuariosCreateModal, "unmount", [], null) ??
      emitEvent("usuarios:create:close", {});

    flushDeferredRender();
    return Boolean(closed !== false);
  }

  async function submitCreateUsuario(payload = {}) {
    try {
      const direct = await safeAsyncCall(
        UsuariosCreateModal,
        ["submit", "submitCreate", "save"],
        [payload],
        null
      );

      if (direct !== null && direct !== undefined) {
        return direct;
      }

      const created = await createUsuarioApi(safeObject(payload, {}));

      if (created) {
        syncFromStore();
        page = DEFAULT_PAGE;
        render({ full: true, force: true });
        showToast("Usuario creado correctamente.", "success");
      }

      return created;
    } catch (createError) {
      showToast(safeError(createError, "No se pudo crear el usuario."), "error");
      throw createError;
    }
  }

  async function exportCsv() {
    if (exporting || !items.length || destroyed) return false;

    exporting = true;
    render({ header: true, immediate: true });

    try {
      const csv = buildUsuariosCsv(items);
      const date = new Date().toISOString().slice(0, 10);
      const ok = downloadTextFile(csv, `usuarios-${date}.csv`);

      if (!ok) throw new Error("USUARIOS_CSV_DOWNLOAD_FAILED");

      showToast("CSV de usuarios generado.", "success");
      return true;
    } catch (exportError) {
      showToast(safeError(exportError, "No se pudo exportar el CSV."), "error");
      return false;
    } finally {
      exporting = false;
      render({ header: true });
    }
  }

  function setFilter(value = "all") {
    filter = ["all", "active", "pending", "blocked"].includes(normalizeKey(value))
      ? normalizeKey(value)
      : "all";
    page = DEFAULT_PAGE;
    render({ history: true });
    return filter;
  }

  function setSearch(value = "") {
    searchDraft = cleanText(value, "");
    search = searchDraft;
    page = DEFAULT_PAGE;
    render({ history: true });
    return search;
  }

  function scheduleSearch(value = "") {
    searchDraft = String(value ?? "");

    if (searchTimer) {
      window.clearTimeout(searchTimer);
      searchTimer = 0;
    }

    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      setSearch(searchDraft);
    }, SEARCH_DEBOUNCE_MS);

    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    searchDraft = "";
    page = DEFAULT_PAGE;
    render({ history: true });
    return true;
  }

  function goToPage(value = DEFAULT_PAGE) {
    page = clamp(value, 1, getTotalPages());
    render({ history: true });
    return page;
  }

  function goPrevPage() {
    return goToPage(page - 1);
  }

  function goNextPage() {
    return goToPage(page + 1);
  }

  function changePageSize(value = DEFAULT_PAGE_SIZE) {
    pageSize = clamp(value, 1, 50);
    page = DEFAULT_PAGE;
    render({ history: true });
    return pageSize;
  }

  function actionFrom(node = null) {
    return normalizeKey(
      first(
        node?.getAttribute?.("data-usuarios-action"),
        node?.getAttribute?.("data-action"),
        ""
      )
    );
  }

  async function handleAction(node = null, event = null) {
    const action = actionFrom(node);
    if (!action) return false;

    const userId = cleanText(
      first(
        node?.getAttribute?.("data-user-id"),
        node?.closest?.("[data-user-id]")?.getAttribute?.("data-user-id"),
        ""
      ),
      ""
    );

    switch (action) {
      case DETAIL_ACTION:
      case "open_user":
      case "open-user":
        event?.preventDefault?.();
        await openUsuario(userId);
        return true;

      case CREATE_ACTION:
      case "create_user":
      case "create-user":
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
      case "export-csv":
        event?.preventDefault?.();
        await exportCsv();
        return true;

      case FILTER_ACTION:
      case "filter_usuarios":
      case "filter-usuarios":
        event?.preventDefault?.();
        setFilter(
          first(
            node?.getAttribute?.("data-filter"),
            node?.getAttribute?.("data-filter-status"),
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

      case PREV_PAGE_ACTION:
      case "prev_page":
        event?.preventDefault?.();
        goToPage(first(node?.getAttribute?.("data-page"), page - 1));
        return true;

      case NEXT_PAGE_ACTION:
      case "next_page":
        event?.preventDefault?.();
        goToPage(first(node?.getAttribute?.("data-page"), page + 1));
        return true;

      default:
        return false;
    }
  }

  function bindHost() {
    if (!host || hostClickHandler) return false;

    hostClickHandler = async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionNode = target.closest("[data-usuarios-action], [data-action]");
      if (!actionNode || !host.contains(actionNode)) return;

      await handleAction(actionNode, event);
    };

    hostInputHandler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.matches("[data-usuarios-search-input='true']")) {
        scheduleSearch(target.value);
      }
    };

    hostKeydownHandler = async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        (event.key === "Enter" || event.key === " ") &&
        target.matches("[data-user-row='true'][data-user-id]")
      ) {
        event.preventDefault();
        await openUsuario(target.getAttribute("data-user-id"));
      }
    };

    host.addEventListener("click", hostClickHandler);
    host.addEventListener("input", hostInputHandler);
    host.addEventListener("keydown", hostKeydownHandler);
    return true;
  }

  function unbindHost() {
    if (!host) return false;

    try {
      if (hostClickHandler) host.removeEventListener("click", hostClickHandler);
      if (hostInputHandler) host.removeEventListener("input", hostInputHandler);
      if (hostKeydownHandler) host.removeEventListener("keydown", hostKeydownHandler);
    } catch {
      // noop
    }

    hostClickHandler = null;
    hostInputHandler = null;
    hostKeydownHandler = null;
    return true;
  }

  function bindEvents() {
    const onModalRefresh = async (event) => {
      const payload = eventPayload(event);
      await refreshUsuario(
        first(payload.userId, payload.usuarioId, payload.id, "")
      );
    };

    const onModalCopy = async (event) => {
      const payload = eventPayload(event);
      await copyUsuarioId(
        first(payload.userId, payload.usuarioId, payload.id, "")
      );
    };

    const onModalClosed = () => {
      openingUserId = "";
      flushDeferredRender();
    };

    const onCreateSuccess = async () => {
      createOpen = false;
      await load({ force: true, silent: true });
      flushDeferredRender();
    };

    const onCreateClosed = () => {
      createOpen = false;
      flushDeferredRender();
    };

    unsubscribers.push(
      subscribeEvent("usuarios:modal:refresh", onModalRefresh),
      subscribeEvent("usuarios:modal:copy", onModalCopy)
    );

    for (const eventName of DETAIL_CLOSE_EVENTS) {
      unsubscribers.push(subscribeEvent(eventName, onModalClosed));
    }

    for (const eventName of CREATE_SUCCESS_EVENTS) {
      unsubscribers.push(subscribeEvent(eventName, onCreateSuccess));
    }

    for (const eventName of CREATE_CLOSE_EVENTS) {
      unsubscribers.push(subscribeEvent(eventName, onCreateClosed));
    }

    return true;
  }

  function unbindEvents() {
    while (unsubscribers.length) {
      const unsubscribe = unsubscribers.pop();

      try {
        unsubscribe?.();
      } catch {
        // noop
      }
    }

    return true;
  }

  function clearTimers() {
    if (searchTimer) {
      window.clearTimeout?.(searchTimer);
      searchTimer = 0;
    }

    cancelFrame(renderFrame);
    renderFrame = 0;
    deferredRender = null;
    return true;
  }

  const controller = {
    version: USUARIOS_VIEW_VERSION,
    name: USUARIOS_MODULE_NAME,
    ownerId,
    host,
    context,

    async mount() {
      if (destroyed) return controller;
      if (!host) throw new Error("USUARIOS_HOST_REQUIRED");

      mounted = true;
      bindHost();
      bindEvents();

      if (!isRouteActive()) {
        return controller;
      }

      if (!isAdminContext(context)) {
        render({ full: true, immediate: true, force: true });
        return controller;
      }

      try {
        hydrateFromCache({ freshOnly: true });
      } catch {
        // cache opcional
      }

      syncFromStore();

      if (items.length) {
        loading = false;
        refreshing = false;
        render({ full: true, immediate: true, force: true });
      } else {
        loading = true;
        renderInitialLoading();
      }

      void load({ force: false, silent: true });
      return controller;
    },

    render(options = {}) {
      return render({ full: true, ...safeObject(options, {}) });
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
    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems() {
      return cloneItems(items);
    },

    getFilteredItems() {
      return cloneItems(getFilteredItems());
    },

    getPageItems() {
      return cloneItems(getPageItemsInternal());
    },

    getPagination() {
      normalizePage();
      const filtered = getFilteredItems();

      return {
        page,
        currentPage: page,
        pageSize,
        totalPages: getTotalPages(),
        totalCount: filtered.length,
        remoteCount,
        hasPrev: page > 1,
        hasNext: page < getTotalPages(),
      };
    },

    getUsuarioById(id = "") {
      return findUsuarioById(items, id) || getUsuarioByIdStore?.(id) || null;
    },

    getState() {
      return {
        ...viewState(),
        items: cloneItems(items),
      };
    },

    isAdmin() {
      return isAdminContext(context);
    },

    isInitialized() {
      return mounted && !destroyed;
    },

    isMounted() {
      return mounted && !destroyed;
    },

    isDestroyed() {
      return destroyed;
    },

    getSnapshot() {
      return {
        version: USUARIOS_VIEW_VERSION,
        ownerId,
        mounted,
        destroyed,
        routeActive: isRouteActive(),
        admin: isAdminContext(context),
        role: getCurrentRole(context),

        loading,
        refreshing,
        exporting,
        creating,
        createOpen: createModalOpen(),
        detailOpen: detailModalOpen(),
        openingUserId: openingUserId ? "***" : "",

        count: items.length,
        filteredCount: getFilteredItems().length,
        remoteCount,
        page,
        pageSize,
        totalPages: getTotalPages(),
        filter,
        searchLength: (searchDraft || search).length,
        lastSyncAt,
        error,
      };
    },

    destroy() {
      if (destroyed) return true;

      destroyed = true;
      mounted = false;
      loadSequence += 1;

      clearTimers();
      unbindHost();
      unbindEvents();

      try {
        UsuariosDetailModal?.close?.();
      } catch {
        // noop
      }

      try {
        UsuariosCreateModal?.close?.();
      } catch {
        // noop
      }

      if (host?.[USUARIOS_CONTROLLER_KEY] === controller) {
        try {
          delete host[USUARIOS_CONTROLLER_KEY];
        } catch {
          host[USUARIOS_CONTROLLER_KEY] = null;
        }
      }

      const root = getGlobalObject();

      if (root?.[USUARIOS_GLOBAL_CONTROLLER_KEY] === controller) {
        try {
          delete root[USUARIOS_GLOBAL_CONTROLLER_KEY];
        } catch {
          root[USUARIOS_GLOBAL_CONTROLLER_KEY] = null;
        }
      }

      if (lastController === controller) {
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

export async function UsuariosView(host = null, context = {}) {
  const resolvedHost = resolveHost(host, context);
  const root = getGlobalObject();

  const hostController = resolvedHost?.[USUARIOS_CONTROLLER_KEY] || null;
  const globalController = root?.[USUARIOS_GLOBAL_CONTROLLER_KEY] || null;

  for (const previous of [hostController, globalController]) {
    if (previous && previous !== hostController && isFunction(previous.destroy)) {
      try {
        previous.destroy();
      } catch {
        // noop
      }
    }
  }

  if (hostController && isFunction(hostController.destroy)) {
    try {
      hostController.destroy();
    } catch {
      // noop
    }
  }

  const controller = createUsuariosController(resolvedHost, context);

  if (resolvedHost) {
    resolvedHost[USUARIOS_CONTROLLER_KEY] = controller;
  }

  root[USUARIOS_GLOBAL_CONTROLLER_KEY] = controller;
  lastController = controller;

  registerGlobalBridge(controller);
  return controller.mount();
}

export const UsuariosIndex = UsuariosView;
export const view = UsuariosView;
export const component = UsuariosView;
export const page = UsuariosView;
export default UsuariosView;

/* =========================================================
   ACTIVE CONTROLLER / LEGACY WRAPPERS
========================================================= */

export function getActiveUsuariosController() {
  const root = getGlobalObject();
  return root?.[USUARIOS_GLOBAL_CONTROLLER_KEY] || lastController || null;
}

export const init = (...args) => UsuariosView(...args);
export const mount = (...args) => UsuariosView(...args);
export const bootstrap = (...args) => UsuariosView(...args);

export const render = (options = {}) =>
  getActiveUsuariosController()?.render?.(options) || false;

export const reload = () =>
  getActiveUsuariosController()?.reload?.() || Promise.resolve([]);

export const refresh = () =>
  getActiveUsuariosController()?.refresh?.() || Promise.resolve([]);

export const destroy = () =>
  getActiveUsuariosController()?.destroy?.() || true;

export const unmount = destroy;
export const dispose = destroy;

export const openUsuario = (userId = "") =>
  getActiveUsuariosController()?.openUsuario?.(userId) || Promise.resolve(null);

export const refreshUsuario = (userId = "") =>
  getActiveUsuariosController()?.refreshUsuario?.(userId) || Promise.resolve(null);

export const copyUsuarioId = (userId = "") =>
  getActiveUsuariosController()?.copyUsuarioId?.(userId) || Promise.resolve(false);

export const createUsuario = () =>
  getActiveUsuariosController()?.openCreate?.() || Promise.resolve(false);

export const openCreate = createUsuario;
export const initCreate = createUsuario;

export const closeCreate = () =>
  getActiveUsuariosController()?.closeCreate?.() || true;

export const renderCreate = () =>
  safeCall(UsuariosCreateModal, "render", [], null);

export const resetCreate = () =>
  safeCall(UsuariosCreateModal, "reset", [], undefined);

export const getCreateState = () =>
  safeCall(UsuariosCreateModal, "getState", [], null);

export const submitCreateUsuario = (payload = {}) =>
  getActiveUsuariosController()?.submitCreateUsuario?.(payload) ||
  createUsuarioApi(payload);

export const exportCsv = () =>
  getActiveUsuariosController()?.exportCsv?.() || Promise.resolve(false);

export const goToPage = (pageNumber = 1) =>
  getActiveUsuariosController()?.goToPage?.(pageNumber) || 1;

export const goPrevPage = () =>
  getActiveUsuariosController()?.goPrevPage?.() || 1;

export const goNextPage = () =>
  getActiveUsuariosController()?.goNextPage?.() || 1;

export const changePageSize = (size = DEFAULT_PAGE_SIZE) =>
  getActiveUsuariosController()?.changePageSize?.(size) || DEFAULT_PAGE_SIZE;

export const getItems = () =>
  getActiveUsuariosController()?.getItems?.() || safeArray(getUsuarios?.());

export const getPageItems = () =>
  getActiveUsuariosController()?.getPageItems?.() || [];

export const getPagination = () =>
  getActiveUsuariosController()?.getPagination?.() || null;

export const getUsuarioById = (id = "") =>
  getActiveUsuariosController()?.getUsuarioById?.(id) ||
  getUsuarioByIdStore?.(id) ||
  null;

export const getState = () =>
  getActiveUsuariosController()?.getState?.() ||
  getUsuariosStateSnapshot?.() ||
  usuariosState;

export const getSnapshot = () =>
  getActiveUsuariosController()?.getSnapshot?.() || {
    version: USUARIOS_VIEW_VERSION,
    mounted: false,
    destroyed: false,
  };

export const isAdmin = () =>
  getActiveUsuariosController()?.isAdmin?.() || isAdminContext({});

export const isInitialized = () =>
  getActiveUsuariosController()?.isInitialized?.() || false;

export const isDestroyed = () =>
  getActiveUsuariosController()?.isDestroyed?.() ?? true;

export const isMounted = () =>
  getActiveUsuariosController()?.isMounted?.() || false;

export const canRenderUsuariosNow = (context = {}) =>
  isUsuariosRoute(safeObject(context, {}));

export const getUsuariosRouteDebug = (context = {}) => ({
  browserPath: getBrowserPath(),
  contextPath: routePathFromContext(context),
  canonicalPath: USUARIOS_CANONICAL_PATH,
  allowed: isUsuariosRoute(context),
  role: getCurrentRole(context),
  admin: isAdminContext(context),
});

export const openModal = (detail = {}) =>
  UsuariosDetailModal?.open?.(detail) || false;

export const closeModal = () =>
  UsuariosDetailModal?.close?.() || true;

export const refreshModal = () =>
  UsuariosDetailModal?.refresh?.() || false;

export const updateModal = (detail = {}) =>
  UsuariosDetailModal?.update?.(detail) || false;

export const getModalState = () =>
  UsuariosDetailModal?.getState?.() || null;

/* =========================================================
   PUBLIC MODULE / GLOBAL BRIDGE
========================================================= */

export const UsuariosModule = {
  name: USUARIOS_MODULE_NAME,
  viewName: USUARIOS_VIEW_NAME,
  version: USUARIOS_VIEW_VERSION,
  source: USUARIOS_INDEX_SOURCE,

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

  createUsuario,
  openCreate,
  closeCreate,
  renderCreate,
  resetCreate,
  getCreateState,
  submitCreateUsuario,

  exportCsv,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  getItems,
  getPageItems,
  getPagination,
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
    hydrateFromCache,
    loadUsuarios,
    loadUsuarioDetail,
    createUsuario: createUsuarioApi,
    updateUsuario: updateUsuarioApi,
    deleteUsuario: deleteUsuarioApi,
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

  state: usuariosState,
};

export function registerGlobalBridge(controller = null) {
  const root = getGlobalObject();
  const active = controller || getActiveUsuariosController();

  try {
    root.OnionUsuarios = {
      ...safeObject(root.OnionUsuarios, {}),
      ...UsuariosModule,
      controller: active,
    };

    root.OnionUsuariosView = UsuariosView;
    root.UsuariosView = UsuariosView;

    if (!root.OnionUsuariosModal) {
      root.OnionUsuariosModal = UsuariosDetailModal;
    }

    if (!root.OnionUsuariosCreateModal) {
      root.OnionUsuariosCreateModal = UsuariosCreateModal;
    }
  } catch {
    // noop
  }

  try {
    if (AppCore) {
      if (!isObject(AppCore.modules)) AppCore.modules = {};

      AppCore.modules.Usuarios = UsuariosModule;
      AppCore.modules.UsuariosView = UsuariosModule;
      AppCore.modules.OnionUsuarios = UsuariosModule;
    }
  } catch {
    // noop
  }

  emitEvent("usuarios:index:ready", {
    version: USUARIOS_VIEW_VERSION,
    source: USUARIOS_INDEX_SOURCE,
    mounted: Boolean(active?.isMounted?.()),
    route: getBrowserPath(),
  });

  return UsuariosModule;
}

export const bridge = registerGlobalBridge();
export const ready = true;

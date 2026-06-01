/* =========================================================
   Onion Support - Incidencias Index
   Archivo: /src/views/incidencias/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Incidencias.
   - Montar template principal.
   - Hidratar desde cache en memoria.
   - Pintar inmediatamente sin bloquear el Router.
   - Cargar/listar incidencias desde incidencias.api.js en background.
   - Crear incidencia.
   - Abrir detalle.
   - Comentar/reabrir/subir adjuntos.
   - Abrir/descargar adjuntos.
   - Buscador admin de usuario afectado para creación.
   - Delegar HTML en templates.
   - Renderizar create modal como isla estable para evitar flicker.
   - Sin Store.
   - Sin State externo.
   - Sin actions/bindings/model/utils/homeView legacy.
   - Sin fetch propio.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  listIncidencias,
  hydrateIncidenciasFromCache,
  createIncidencia,
  loadIncidenciaDetail,
  commentIncidencia,
  reopenIncidencia,
  uploadIncidenciaAttachments,
  openIncidenciaAttachment,
  downloadIncidenciaAttachment,
  computeIncidenciasStats,
} from "./incidencias.api.js";

import {
  renderIncidenciasTemplate,
  renderIncidenciasLoadingState,
  renderIncidenciasErrorState,
  INCIDENCIAS_ACTIONS,
} from "./incidencias.template.js";

import {
  renderIncidenciasCreateModal,
  CREATE_ACTIONS,
  getCreateFormDefaults,
  validateCreateForm,
} from "./incidencias.template.create.js";

import {
  DETAIL_ACTIONS,
  validateDetailUpdate,
} from "./incidencias.template.modal.js";

export const INCIDENCIAS_INDEX_VERSION = "incidencias.index.fast.v4.modal-island";
export const INCIDENCIAS_VIEW_VERSION = INCIDENCIAS_INDEX_VERSION;

const DEFAULT_VISIBLE_LIMIT = 20;
const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE_MS = 220;

const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const CREATE_MODAL_ROOT_ID = "incidencias-create-modal-root";
const CREATE_MODAL_PANEL_SELECTOR = "[data-incidencias-create-modal-panel='true']";
const CREATE_MODAL_OVERLAY_SELECTOR = "[data-incidencias-create-modal-overlay='true']";

const INSTANCES = new WeakMap();

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function isDomNode(value = null) {
  return Boolean(
    typeof Node !== "undefined" &&
      value &&
      value instanceof Node
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
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
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

  return "";
}

function safeError(error = null, fallback = "No se pudieron cargar las incidencias.") {
  return cleanText(
    error?.message ||
      error?.data?.message ||
      error?.payload?.message ||
      error?.response?.message ||
      fallback,
    fallback
  );
}

function getTicketId(item = {}) {
  return cleanText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.numero,
      item.ticketCode
    ),
    ""
  );
}

function shouldPreserveExisting(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (isObject(value) && !Object.keys(value).length) return true;

  return false;
}

function mergeTicketData(current = {}, next = {}) {
  const base = safeObject(current, {});
  const incoming = safeObject(next, {});
  const output = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    const previous = output[key];

    if (isObject(previous) && isObject(value)) {
      output[key] = mergeTicketData(previous, value);
      continue;
    }

    output[key] =
      shouldPreserveExisting(value) && previous !== undefined && previous !== null
        ? previous
        : value;
  }

  return output;
}

function ticketSortTime(item = {}) {
  const timestamp = Date.parse(
    first(
      item.lastActivityAt,
      item.updatedAt,
      item.modifiedAt,
      item.closedAt,
      item.createdAt,
      item.lifecycle?.lastActivityAt,
      item.lifecycle?.updatedAt,
      item.lifecycle?.closedAt,
      item.lifecycle?.createdAt,
      0
    )
  );

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function upsertByTicketId(items = [], item = null) {
  const next = safeObject(item, null);

  if (!next) return safeArray(items);

  const id = getTicketId(next);

  if (!id) return safeArray(items);

  const currentItems = safeArray(items);
  const existing = currentItems.find((current) => getTicketId(current) === id) || null;
  const merged = existing ? mergeTicketData(existing, next) : next;
  const map = new Map();

  map.set(id, merged);

  for (const current of currentItems) {
    const currentId = getTicketId(current);

    if (!currentId || map.has(currentId)) continue;

    map.set(currentId, current);
  }

  return [...map.values()].sort((a, b) => {
    const diff = ticketSortTime(b) - ticketSortTime(a);

    if (diff !== 0) return diff;

    return getTicketId(b).localeCompare(getTicketId(a), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function nextFrame(callback) {
  if (!isBrowser()) return 0;

  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(callback, 0);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(id);
    }

    window.clearTimeout?.(id);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CORE / AUTH
========================================================= */

function getState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function getCurrentRole() {
  const state = getState();
  const user = safeObject(getCurrentUser(), {});

  return (
    normalizeRole(
      first(
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

function isAdmin() {
  return getCurrentRole() === "admin";
}

function getRoutes() {
  return {
    incidencias: ROUTES.incidencias || "/incidencias",
    facturas: ROUTES.facturas || "/facturas",
    clientes: ROUTES.clientes || "/clientes",
    usuarios: ROUTES.usuarios || "/usuarios",
  };
}

/* =========================================================
   USER SEARCH
========================================================= */

function unwrapList(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, {});

  return safeArray(
    first(
      object.items,
      object.rows,
      object.results,
      object.records,
      object.users,
      object.usuarios,
      object.data?.items,
      object.data?.rows,
      object.data?.results,
      object.data?.users,
      object.payload?.items,
      object.payload?.users,
      object.result?.items,
      object.result?.users,
      []
    )
  );
}

function normalizeUserResult(user = {}) {
  const raw = safeObject(user);
  const id = cleanText(first(raw.userId, raw.id, raw.uid, raw.sub, raw.username), "");
  const name = cleanText(
    first(raw.displayName, raw.fullName, raw.name, raw.nombre, raw.username),
    "Usuario"
  );
  const email = cleanText(
    first(
      raw.email,
      raw.emailLower,
      raw.userEmail,
      raw.mail,
      raw.profile?.email,
      raw.auth?.email,
      raw.lookup?.emailLower
    ),
    ""
  ).toLowerCase();

  return {
    id,
    userId: id,
    displayName: name,
    name,
    email,
    emailLower: email,
    username: cleanText(first(raw.username, raw.userName, raw.slug), ""),
    role: normalizeRole(first(raw.role, raw.rol, raw.roles, "user")) || "user",
    avatarUrl: cleanText(first(raw.avatarUrl, raw.avatar, raw.picture, raw.photoUrl, raw.profile?.avatarUrl), ""),
  };
}

async function searchUsers(query = "") {
  const q = cleanText(query, "");

  if (!isAdmin() || q.length < USER_SEARCH_MIN_LENGTH) return [];

  const request =
    AppCore.request ||
    AppCore.http?.get ||
    AppCore.Http?.get ||
    AppCore.getHttpClient?.()?.get ||
    null;

  if (!isFunction(request)) return [];

  const response =
    request === AppCore.request
      ? await request.call(AppCore, "/api/users", {
          method: "GET",
          query: {
            q,
            search: q,
            limit: USER_SEARCH_LIMIT,
          },
          source: "views.incidencias.user-search",
        })
      : await request.call(AppCore.http || AppCore.Http, "/api/users", {
          query: {
            q,
            search: q,
            limit: USER_SEARCH_LIMIT,
          },
          source: "views.incidencias.user-search",
        });

  return unwrapList(response)
    .map(normalizeUserResult)
    .filter((user) => user.id)
    .slice(0, USER_SEARCH_LIMIT);
}

/* =========================================================
   FORM HELPERS
========================================================= */

function readField(form = null, name = "") {
  if (!form || !name) return "";

  const field = form.querySelector?.(`[data-field="${name}"], [name="${name}"]`);

  if (!field) return "";

  return cleanText(field.value, "");
}

function filesFromInput(input = null) {
  try {
    return Array.from(input?.files || []);
  } catch {
    return [];
  }
}

function dedupeFiles(files = []) {
  const map = new Map();

  for (const file of safeArray(files)) {
    if (!file) continue;

    const key = [
      file.name || "archivo",
      file.size || 0,
      file.lastModified || 0,
      file.type || "",
    ].join("::");

    if (!map.has(key)) map.set(key, file);
  }

  return [...map.values()];
}

function fileIndexFromNode(node = null) {
  const value = node?.dataset?.removeAttachment || node?.dataset?.fileIndex || "";
  const index = Number(value);

  return Number.isFinite(index) ? index : -1;
}

/* =========================================================
   BODY STATE
========================================================= */

function syncBodyModalClass(open = false) {
  if (!isBrowser()) return false;

  try {
    document.body?.classList.toggle("modal-open", open);
    document.body?.classList.toggle("incidencias-modal-open", open);
    document.body?.classList.toggle("incidencias-create-open", open);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function destroyPrevious(host = null) {
  const previous = host ? INSTANCES.get(host) : null;

  if (previous?.destroy) {
    previous.destroy({
      remount: true,
    });

    return true;
  }

  return false;
}

function storeInstance(host = null, instance = null) {
  if (!host || !instance) return false;

  INSTANCES.set(host, instance);
  lastInstance = instance;

  return true;
}

function clearInstance(host = null, instance = null) {
  if (host && INSTANCES.get(host) === instance) {
    INSTANCES.delete(host);
  }

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   CONTROLLER
========================================================= */

function createIncidenciasController(host = null, context = {}) {
  const cached = hydrateIncidenciasFromCache();

  let destroyed = false;
  let mounted = false;

  let items = safeArray(cached.items);
  let total = Number(cached.total || items.length) || items.length;

  let loading = false;
  let refreshing = false;
  let creating = false;
  let loadingMore = false;

  let error = "";
  let filter = "all";
  let search = "";
  let visibleLimit = DEFAULT_VISIBLE_LIMIT;
  let openingTicketId = "";

  let renderFrame = 0;
  let pendingRenderOptions = null;

  let createModalFrame = 0;
  let pendingCreateModalOptions = null;

  let modalHost = null;
  let modalHostBound = false;

  let loadSeq = 0;
  let userSearchSeq = 0;
  let userSearchTimer = 0;

  const createModal = {
    open: false,
    submitting: false,
    dragActive: false,
    serverError: "",
    successMessage: "",
    createdTicketId: "",
    errors: {},
    form: getCreateFormDefaults(),
    userSearch: {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    },
  };

  const detailModal = {
    open: false,
    detail: null,
    submitting: false,
    commentDraft: "",
    pendingFiles: [],
    feedbackMessage: "",
    feedbackType: "info",
    openingAttachmentId: "",
    downloadingAttachmentId: "",
    previewFile: null,
  };

  function payload(extra = {}) {
    return {
      user: getCurrentUser(),
      role: getCurrentRole(),
      admin: isAdmin(),
      routes: getRoutes(),

      items,
      total,

      loading,
      refreshing,
      creating,
      loadingMore,
      error,

      filter,
      search,
      visibleLimit,
      openingTicketId,

      stats: computeIncidenciasStats(items),

      createModal,
      detailModal,

      ...extra,
    };
  }

  function viewPayload(extra = {}) {
    return payload({
      /*
        El create modal se renderiza como isla estable fuera del host.
        Así la vista puede re-renderizarse sin destruir el modal.
      */
      createModal: {
        ...createModal,
        open: false,
      },
      ...extra,
    });
  }

  function createModalPayload() {
    return {
      ...createModal,
      admin: isAdmin(),
      role: getCurrentRole(),
    };
  }

  function ensureModalHost() {
    if (!isBrowser()) return null;

    if (modalHost?.isConnected) return modalHost;

    modalHost = document.createElement("div");
    modalHost.setAttribute("data-incidencias-modal-host", "true");
    modalHost.setAttribute("data-owner", INCIDENCIAS_VIEW_VERSION);

    document.body.appendChild(modalHost);

    if (mounted && !modalHostBound) {
      bindTarget(modalHost);
      modalHostBound = true;
    }

    return modalHost;
  }

  function removeModalHost() {
    if (!modalHost) return false;

    try {
      if (modalHostBound) {
        unbindTarget(modalHost);
      }

      modalHost.remove();
    } catch {
      // noop
    }

    modalHost = null;
    modalHostBound = false;

    return true;
  }

  function ownsNode(node = null) {
    if (!node) return false;

    return Boolean(
      host?.contains?.(node) ||
        modalHost?.contains?.(node)
    );
  }

  function focusAfterRender(selector = "", placeEnd = true, root = host) {
    if (!selector || !root) return false;

    try {
      const node = root.querySelector(selector);

      if (!node) return false;

      node.focus({
        preventScroll: true,
      });

      if (placeEnd && typeof node.setSelectionRange === "function") {
        const end = String(node.value || "").length;
        node.setSelectionRange(end, end);
      }

      return true;
    } catch {
      return false;
    }
  }

  function mergeRenderOptions(current = {}, next = {}) {
    return {
      ...current,
      ...next,
      focusSelector: next.focusSelector || current.focusSelector || "",
      focusEnd:
        next.focusEnd !== undefined
          ? next.focusEnd
          : current.focusEnd,
      preserveFocus:
        next.preserveFocus !== undefined
          ? next.preserveFocus
          : current.preserveFocus,
    };
  }

  function cancelScheduledRender() {
    if (!renderFrame) return false;

    cancelFrame(renderFrame);
    renderFrame = 0;
    pendingRenderOptions = null;

    return true;
  }

  function cancelScheduledCreateModalRender() {
    if (!createModalFrame) return false;

    cancelFrame(createModalFrame);
    createModalFrame = 0;
    pendingCreateModalOptions = null;

    return true;
  }

  function parseHtmlElement(html = "") {
    if (!isBrowser()) return null;

    const template = document.createElement("template");
    template.innerHTML = String(html || "").trim();

    return template.content.firstElementChild || null;
  }

  function patchElementAttributes(current = null, next = null) {
    if (!current || !next) return false;

    const keep = new Set(["id"]);

    for (const attr of Array.from(current.attributes || [])) {
      if (keep.has(attr.name)) continue;
      if (!next.hasAttribute(attr.name)) {
        current.removeAttribute(attr.name);
      }
    }

    for (const attr of Array.from(next.attributes || [])) {
      current.setAttribute(attr.name, attr.value);
    }

    return true;
  }

  function directChildByClass(parent = null, className = "") {
    if (!parent || !className) return null;

    return Array.from(parent.children || []).find((child) => {
      return child.classList?.contains(className);
    }) || null;
  }

  function captureCreateModalDomState(root = null) {
    if (!isBrowser() || !root) return null;

    const panel = root.querySelector(CREATE_MODAL_PANEL_SELECTOR);
    const active = document.activeElement;

    const state = {
      panelScrollTop: panel?.scrollTop || 0,
      activeField: "",
      activeName: "",
      activeId: "",
      selectionStart: null,
      selectionEnd: null,
    };

    if (!active || !root.contains(active)) return state;

    if (active.matches?.("input[type='file']")) {
      return state;
    }

    state.activeField = cleanText(active.dataset?.field, "");
    state.activeName = cleanText(active.getAttribute?.("name"), "");
    state.activeId = cleanText(active.id, "");

    try {
      if (typeof active.selectionStart === "number") {
        state.selectionStart = active.selectionStart;
        state.selectionEnd = active.selectionEnd;
      }
    } catch {
      // noop
    }

    return state;
  }

  function findRestorableField(root = null, state = null, explicitSelector = "") {
    if (!root) return null;

    if (explicitSelector) {
      return root.querySelector(explicitSelector);
    }

    if (!state) return null;

    if (state.activeId) {
      const byId = root.querySelector(`#${state.activeId}`);
      if (byId) return byId;
    }

    const candidates = Array.from(root.querySelectorAll("[data-field], [name]"));

    if (state.activeField) {
      const byField = candidates.find((node) => {
        return cleanText(node.dataset?.field, "") === state.activeField;
      });

      if (byField) return byField;
    }

    if (state.activeName) {
      const byName = candidates.find((node) => {
        return cleanText(node.getAttribute("name"), "") === state.activeName;
      });

      if (byName) return byName;
    }

    return null;
  }

  function restoreCreateModalDomState(root = null, state = null, options = {}) {
    if (!isBrowser() || !root) return false;

    const panel = root.querySelector(CREATE_MODAL_PANEL_SELECTOR);

    if (panel && state) {
      panel.scrollTop = state.panelScrollTop || 0;

      nextFrame(() => {
        try {
          panel.scrollTop = state.panelScrollTop || 0;
        } catch {
          // noop
        }
      });
    }

    if (options.preserveFocus === false || createModal.submitting) return true;

    const target = findRestorableField(root, state, options.focusSelector || "");

    if (!target) return true;

    try {
      target.focus({
        preventScroll: true,
      });

      if (
        options.focusEnd !== false &&
        typeof target.setSelectionRange === "function"
      ) {
        const valueLength = String(target.value || "").length;
        const start = Number.isFinite(state?.selectionStart)
          ? Math.min(state.selectionStart, valueLength)
          : valueLength;
        const end = Number.isFinite(state?.selectionEnd)
          ? Math.min(state.selectionEnd, valueLength)
          : valueLength;

        target.setSelectionRange(start, end);
      }
    } catch {
      // noop
    }

    return true;
  }

  function patchCreateModalDom(currentRoot = null, nextRoot = null, options = {}) {
    if (!currentRoot || !nextRoot) return false;

    const state = captureCreateModalDomState(currentRoot);

    patchElementAttributes(currentRoot, nextRoot);

    const currentOverlay = currentRoot.querySelector(CREATE_MODAL_OVERLAY_SELECTOR);
    const nextOverlay = nextRoot.querySelector(CREATE_MODAL_OVERLAY_SELECTOR);

    if (!currentOverlay || !nextOverlay) return false;

    patchElementAttributes(currentOverlay, nextOverlay);

    const currentPanel = currentRoot.querySelector(CREATE_MODAL_PANEL_SELECTOR);
    const nextPanel = nextRoot.querySelector(CREATE_MODAL_PANEL_SELECTOR);

    if (!currentPanel || !nextPanel) return false;

    patchElementAttributes(currentPanel, nextPanel);

    const currentLoading = directChildByClass(currentPanel, "inc-create-loading-overlay");
    const nextLoading = directChildByClass(nextPanel, "inc-create-loading-overlay");

    if (nextLoading && currentLoading) {
      currentLoading.replaceWith(nextLoading.cloneNode(true));
    } else if (nextLoading && !currentLoading) {
      currentPanel.prepend(nextLoading.cloneNode(true));
    } else if (!nextLoading && currentLoading) {
      currentLoading.remove();
    }

    const currentHeader = directChildByClass(currentPanel, "inc-create-header");
    const nextHeader = directChildByClass(nextPanel, "inc-create-header");

    if (currentHeader && nextHeader) {
      currentHeader.replaceWith(nextHeader.cloneNode(true));
    }

    const currentBody = directChildByClass(currentPanel, "inc-create-body");
    const nextBody = directChildByClass(nextPanel, "inc-create-body");

    if (currentBody && nextBody) {
      currentBody.replaceWith(nextBody.cloneNode(true));
    }

    restoreCreateModalDomState(currentRoot, state, options);

    return true;
  }

  function renderCreateModalNow(options = {}) {
    if (destroyed || !isBrowser()) return false;

    cancelScheduledCreateModalRender();

    const target = ensureModalHost();

    if (!target) return false;

    const html = renderIncidenciasCreateModal(createModalPayload());
    const currentRoot = target.querySelector(`#${CREATE_MODAL_ROOT_ID}`);

    if (!html) {
      if (currentRoot) currentRoot.remove();

      syncBodyModalClass(createModal.open || detailModal.open);
      return true;
    }

    const nextRoot = parseHtmlElement(html);

    if (!nextRoot) return false;

    if (!currentRoot) {
      target.replaceChildren(nextRoot);

      syncBodyModalClass(createModal.open || detailModal.open);

      if (options.focusSelector) {
        focusAfterRender(options.focusSelector, options.focusEnd !== false, target);
      }

      return true;
    }

    const patched = patchCreateModalDom(currentRoot, nextRoot, {
      preserveFocus: options.preserveFocus !== false,
      focusSelector: options.focusSelector || "",
      focusEnd: options.focusEnd,
    });

    if (!patched) {
      target.replaceChildren(nextRoot);

      if (options.focusSelector) {
        focusAfterRender(options.focusSelector, options.focusEnd !== false, target);
      }
    }

    syncBodyModalClass(createModal.open || detailModal.open);

    return true;
  }

  function renderCreateModal(options = {}) {
    if (destroyed || !isBrowser()) return false;

    if (options.immediate === true) {
      return renderCreateModalNow(options);
    }

    pendingCreateModalOptions = mergeRenderOptions(
      pendingCreateModalOptions || {},
      options
    );

    if (createModalFrame) return true;

    createModalFrame = nextFrame(() => {
      const nextOptions = pendingCreateModalOptions || {};

      createModalFrame = 0;
      pendingCreateModalOptions = null;

      renderCreateModalNow(nextOptions);
    });

    return true;
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasTemplate(viewPayload());

    renderCreateModalNow({
      preserveFocus: true,
    });

    syncBodyModalClass(createModal.open || detailModal.open);

    if (options.focusSelector) {
      focusAfterRender(options.focusSelector, options.focusEnd !== false);
    }

    return true;
  }

  function render(options = {}) {
    if (destroyed || !host) return false;

    if (options.immediate === true) {
      return renderNow(options);
    }

    pendingRenderOptions = mergeRenderOptions(pendingRenderOptions || {}, options);

    if (renderFrame) return true;

    renderFrame = nextFrame(() => {
      const nextOptions = pendingRenderOptions || {};

      renderFrame = 0;
      pendingRenderOptions = null;

      renderNow(nextOptions);
    });

    return true;
  }

  function renderLoading(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasLoadingState(viewPayload());

    renderCreateModalNow({
      preserveFocus: true,
    });

    syncBodyModalClass(createModal.open || detailModal.open);

    if (options.focusSelector) {
      focusAfterRender(options.focusSelector, options.focusEnd !== false);
    }

    return true;
  }

  function renderError(message = "No se pudieron cargar las incidencias.") {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasErrorState(message);

    renderCreateModalNow({
      preserveFocus: true,
    });

    syncBodyModalClass(createModal.open || detailModal.open);

    return true;
  }

  function clearUserSearchTimer() {
    if (!userSearchTimer) return false;

    try {
      window.clearTimeout(userSearchTimer);
    } catch {
      // noop
    }

    userSearchTimer = 0;

    return true;
  }

  async function load(options = {}) {
    const seq = ++loadSeq;
    const silent = options.silent === true;
    const force = options.force === true;

    const hasItems = items.length > 0;

    error = "";

    if (!silent) {
      loading = !hasItems;
      refreshing = force && hasItems;

      if (loading) {
        renderLoading();
      } else {
        render();
      }
    }

    try {
      const response = await listIncidencias({
        returnStaleOnError: true,
        force,
      });

      if (destroyed || seq !== loadSeq) {
        return response;
      }

      items = safeArray(response.items);
      total = Number(response.total || items.length) || items.length;

      error = response.stale ? cleanText(response.error?.message, "") : "";
      loading = false;
      refreshing = false;

      render();

      return response;
    } catch (loadError) {
      if (destroyed || seq !== loadSeq) {
        return null;
      }

      error = safeError(loadError);
      loading = false;
      refreshing = false;

      if (items.length) {
        render();
        return null;
      }

      renderError(error);
      return null;
    }
  }

  function resetCreateModal() {
    createModal.open = false;
    createModal.submitting = false;
    createModal.dragActive = false;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";
    createModal.errors = {};
    createModal.form = {
      ...getCreateFormDefaults(),
      attachments: [],
    };
    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };
  }

  function openCreateModal() {
    creating = false;

    createModal.open = true;
    createModal.submitting = false;
    createModal.dragActive = false;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";
    createModal.errors = {};
    createModal.form = {
      ...getCreateFormDefaults(),
      attachments: [],
    };
    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    renderCreateModal({
      focusSelector: "[data-field='subject']",
      immediate: true,
    });

    return true;
  }

  function closeCreateModal() {
    if (createModal.submitting) return false;

    clearUserSearchTimer();
    userSearchSeq += 1;

    resetCreateModal();

    renderCreateModal({
      immediate: true,
    });

    return true;
  }

  function patchCreateFormFromField(field = null) {
    if (!field) return false;

    const name = cleanText(field.dataset?.field || field.name, "");

    if (!name || name === "attachments" || name === "targetUserSearch") return false;

    createModal.form = {
      ...createModal.form,
      [name]: field.value,
    };

    if (createModal.errors[name]) {
      const next = { ...createModal.errors };
      delete next[name];
      createModal.errors = next;
    }

    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";

    return true;
  }

  async function runUserSearch(query = "", seq = userSearchSeq) {
    try {
      const results = await searchUsers(query);

      if (destroyed || seq !== userSearchSeq) return false;

      createModal.userSearch.results = results;
      createModal.userSearch.loading = false;
      createModal.userSearch.empty = results.length === 0;
      createModal.userSearch.error = "";

      renderCreateModal({
        focusSelector: "[data-create-user-search-input]",
        preserveFocus: true,
      });

      return true;
    } catch (searchError) {
      if (destroyed || seq !== userSearchSeq) return false;

      createModal.userSearch.results = [];
      createModal.userSearch.loading = false;
      createModal.userSearch.empty = false;
      createModal.userSearch.error = safeError(searchError, "No se pudieron buscar usuarios.");

      renderCreateModal({
        focusSelector: "[data-create-user-search-input]",
        preserveFocus: true,
      });

      return false;
    }
  }

  function handleUserSearch(value = "") {
    const query = cleanText(value, "");
    const seq = ++userSearchSeq;

    clearUserSearchTimer();

    const hadVisibleSearchState =
      createModal.userSearch.loading ||
      createModal.userSearch.error ||
      createModal.userSearch.empty ||
      createModal.userSearch.results.length > 0;

    createModal.userSearch.query = query;
    createModal.userSearch.error = "";
    createModal.userSearch.results = [];
    createModal.userSearch.empty = false;

    if (!isAdmin() || query.length < USER_SEARCH_MIN_LENGTH) {
      createModal.userSearch.loading = false;

      if (hadVisibleSearchState) {
        renderCreateModal({
          focusSelector: "[data-create-user-search-input]",
          preserveFocus: true,
        });
      }

      return true;
    }

    /*
      No re-render inmediato por cada tecla.
      El input ya tiene el valor real en DOM; sólo pintamos cuando llegan resultados.
      Esto evita el flicker principal del modal.
    */
    createModal.userSearch.loading = true;

    userSearchTimer = window.setTimeout(() => {
      userSearchTimer = 0;
      void runUserSearch(query, seq);
    }, USER_SEARCH_DEBOUNCE_MS);

    return true;
  }

  function selectCreateUser(node = null) {
    const userId = cleanText(node?.dataset?.userId, "");

    if (!userId) return false;

    const selected =
      safeArray(createModal.userSearch.results).find((user) => {
        return cleanText(first(user.userId, user.id), "") === userId;
      }) || {};

    const userName = cleanText(
      first(
        node?.dataset?.userName,
        selected.displayName,
        selected.name,
        selected.username
      ),
      "Usuario"
    );
    const userEmail = cleanText(
      first(
        node?.dataset?.userEmail,
        node?.dataset?.email,
        selected.email,
        selected.emailLower
      ),
      ""
    ).toLowerCase();
    const userAvatar = cleanText(
      first(
        node?.dataset?.userAvatar,
        selected.avatarUrl,
        selected.avatar
      ),
      ""
    );

    createModal.form = {
      ...createModal.form,
      targetUserId: userId,
      targetUserName: userName,
      targetUserEmail: userEmail,
      targetUserAvatar: userAvatar,
    };

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: {
        id: userId,
        userId,
        displayName: userName,
        name: userName,
        email: userEmail,
        emailLower: userEmail,
        avatarUrl: userAvatar,
      },
      empty: false,
    };

    renderCreateModal({
      preserveFocus: false,
    });

    return true;
  }

  function clearCreateUser() {
    createModal.form = {
      ...createModal.form,
      targetUserId: "",
      targetUserName: "",
      targetUserEmail: "",
      targetUserAvatar: "",
    };

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    renderCreateModal({
      focusSelector: "[data-create-user-search-input]",
      preserveFocus: true,
    });

    return true;
  }

  function addCreateAttachments(files = []) {
    createModal.form.attachments = dedupeFiles([
      ...safeArray(createModal.form.attachments),
      ...safeArray(files),
    ]);

    if (createModal.errors.attachments) {
      const next = { ...createModal.errors };
      delete next.attachments;
      createModal.errors = next;
    }

    createModal.serverError = "";

    renderCreateModal({
      preserveFocus: true,
    });

    return true;
  }

  function removeCreateAttachment(index = -1) {
    if (index < 0) return false;

    createModal.form.attachments = safeArray(createModal.form.attachments).filter(
      (_, currentIndex) => currentIndex !== index
    );

    renderCreateModal({
      preserveFocus: true,
    });

    return true;
  }

  async function submitCreate(formNode = null) {
    if (createModal.submitting) return false;

    if (formNode) {
      createModal.form = {
        ...createModal.form,
        subject: readField(formNode, "subject"),
        category: readField(formNode, "category"),
        priority: readField(formNode, "priority"),
        description: readField(formNode, "description"),
        targetUserId: readField(formNode, "targetUserId") || createModal.form.targetUserId,
        targetUserName: readField(formNode, "targetUserName") || createModal.form.targetUserName,
        targetUserEmail: readField(formNode, "targetUserEmail") || createModal.form.targetUserEmail,
        targetUserAvatar: readField(formNode, "targetUserAvatar") || createModal.form.targetUserAvatar,
      };
    }

    const validation = validateCreateForm(createModal.form);

    createModal.errors = validation.errors;
    createModal.form = {
      ...createModal.form,
      ...validation.form,
    };

    if (!validation.valid) {
      renderCreateModal({
        focusSelector:
          createModal.errors.subject
            ? "[data-field='subject']"
            : createModal.errors.description
              ? "[data-field='description']"
              : "",
        preserveFocus: false,
      });

      return false;
    }

    createModal.submitting = true;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";

    renderCreateModal({
      immediate: true,
      preserveFocus: false,
    });

    try {
      const created = await createIncidencia({
        ...createModal.form,
        attachments: safeArray(createModal.form.attachments),
      });

      if (created) {
        items = upsertByTicketId(items, created);
        total = Math.max(total, items.length);
      }

      createModal.submitting = false;
      createModal.successMessage = "Incidencia creada.";
      createModal.createdTicketId = getTicketId(created);

      resetCreateModal();

      render();

      return true;
    } catch (createError) {
      createModal.submitting = false;
      createModal.serverError = safeError(createError, "No se pudo crear la incidencia.");

      renderCreateModal({
        focusSelector: "[data-field='subject']",
        preserveFocus: false,
      });

      return false;
    }
  }

  function resetDetailModal() {
    detailModal.open = false;
    detailModal.detail = null;
    detailModal.submitting = false;
    detailModal.commentDraft = "";
    detailModal.pendingFiles = [];
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";
    detailModal.openingAttachmentId = "";
    detailModal.downloadingAttachmentId = "";
    detailModal.previewFile = null;
  }

  function closeDetailModal() {
    if (detailModal.submitting) return false;

    resetDetailModal();

    render();
    return true;
  }

  async function openDetail(ticketId = "") {
    const id = cleanText(ticketId, "");

    if (!id) return false;

    const local = items.find((item) => getTicketId(item) === id) || null;

    openingTicketId = id;

    if (local) {
      detailModal.open = true;
      detailModal.detail = local;
      detailModal.submitting = false;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
      detailModal.previewFile = null;

      render({
        focusSelector: "[data-incidencias-modal-panel='true']",
        focusEnd: false,
      });
    } else {
      render();
    }

    try {
      const detail = await loadIncidenciaDetail(id);

      if (destroyed || openingTicketId !== id) {
        return false;
      }

      const mergedDetail = detail
        ? mergeTicketData(local || {}, detail)
        : local;

      detailModal.open = true;
      detailModal.detail = mergedDetail;
      detailModal.submitting = false;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
      detailModal.previewFile = null;

      if (mergedDetail) {
        items = upsertByTicketId(items, mergedDetail);
      }

      openingTicketId = "";

      render({
        focusSelector: "[data-incidencias-modal-panel='true']",
        focusEnd: false,
      });

      return true;
    } catch (detailError) {
      if (destroyed || openingTicketId !== id) {
        return false;
      }

      openingTicketId = "";

      if (local) {
        detailModal.feedbackMessage = safeError(detailError, "No se pudo actualizar el detalle.");
        detailModal.feedbackType = "error";

        render({
          focusSelector: "[data-incidencias-modal-panel='true']",
          focusEnd: false,
        });

        return false;
      }

      error = safeError(detailError, "No se pudo abrir el detalle.");

      render();

      return false;
    }
  }

  function patchDetailComment(field = null) {
    detailModal.commentDraft = cleanText(field?.value || "", "");

    if (detailModal.feedbackMessage) {
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
    }

    return true;
  }

  function addDetailPendingFiles(files = []) {
    detailModal.pendingFiles = dedupeFiles([
      ...safeArray(detailModal.pendingFiles),
      ...safeArray(files),
    ]);

    render({
      focusSelector: "[data-field='comment']",
    });

    return true;
  }

  function removeDetailPendingFile(index = -1) {
    if (index < 0) return false;

    detailModal.pendingFiles = safeArray(detailModal.pendingFiles).filter(
      (_, currentIndex) => currentIndex !== index
    );

    render({
      focusSelector: "[data-field='comment']",
    });

    return true;
  }

  async function submitDetailUpdate() {
    if (detailModal.submitting) return false;

    const ticketId = getTicketId(detailModal.detail);
    const validation = validateDetailUpdate({
      comment: detailModal.commentDraft,
      pendingFiles: detailModal.pendingFiles,
    });

    if (!ticketId) return false;

    if (!validation.valid) {
      detailModal.feedbackMessage = validation.message;
      detailModal.feedbackType = "error";

      render({
        focusSelector: "[data-field='comment']",
      });

      return false;
    }

    detailModal.submitting = true;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    render();

    try {
      let nextDetail = detailModal.detail;

      if (detailModal.pendingFiles.length) {
        nextDetail = await uploadIncidenciaAttachments(
          ticketId,
          detailModal.pendingFiles,
          {
            status: "open",
          }
        ) || nextDetail;
      }

      if (detailModal.commentDraft) {
        nextDetail = await commentIncidencia(
          ticketId,
          detailModal.commentDraft,
          {
            status: "open",
          }
        ) || nextDetail;
      } else if (detailModal.pendingFiles.length) {
        nextDetail = await reopenIncidencia(ticketId) || nextDetail;
      }

      nextDetail = mergeTicketData(detailModal.detail || {}, nextDetail || {});

      detailModal.submitting = false;
      detailModal.detail = nextDetail;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];
      detailModal.feedbackMessage = "Incidencia actualizada correctamente.";
      detailModal.feedbackType = "success";

      items = upsertByTicketId(items, nextDetail);

      render({
        focusSelector: "[data-incidencias-modal-panel='true']",
        focusEnd: false,
      });

      return true;
    } catch (updateError) {
      detailModal.submitting = false;
      detailModal.feedbackMessage = safeError(updateError, "No se pudo actualizar la incidencia.");
      detailModal.feedbackType = "error";

      render({
        focusSelector: "[data-field='comment']",
      });

      return false;
    }
  }

  function getAttachmentById(attachmentId = "") {
    const id = cleanText(attachmentId, "");

    const attachments = safeArray(
      first(
        detailModal.detail?.attachments,
        detailModal.detail?.files,
        detailModal.detail?.adjuntos,
        []
      )
    );

    return (
      attachments.find((file) => {
        return cleanText(first(file.id, file.attachmentId, file.fileId), "") === id;
      }) || null
    );
  }

  async function openAttachment(attachmentId = "") {
    const id = cleanText(attachmentId, "");
    const ticketId = getTicketId(detailModal.detail);

    if (!id || !ticketId) return false;

    detailModal.openingAttachmentId = id;

    render();

    try {
      const file = await openIncidenciaAttachment({
        ticketId,
        attachmentId: id,
      });

      detailModal.previewFile = {
        ...safeObject(getAttachmentById(id)),
        ...safeObject(file),
        id,
        attachmentId: id,
      };

      detailModal.openingAttachmentId = "";

      render();

      return true;
    } catch (attachmentError) {
      detailModal.openingAttachmentId = "";
      detailModal.feedbackMessage = safeError(attachmentError, "No se pudo abrir el adjunto.");
      detailModal.feedbackType = "error";

      render();

      return false;
    }
  }

  async function downloadAttachment(attachmentId = "") {
    const id = cleanText(attachmentId, "");
    const ticketId = getTicketId(detailModal.detail);
    const attachment = getAttachmentById(id);

    if (!id || !ticketId) return false;

    detailModal.downloadingAttachmentId = id;

    render();

    try {
      await downloadIncidenciaAttachment({
        ticketId,
        attachmentId: id,
        filename: cleanText(first(attachment?.filename, attachment?.fileName, attachment?.name), "archivo"),
      });

      detailModal.downloadingAttachmentId = "";

      render();

      return true;
    } catch (downloadError) {
      detailModal.downloadingAttachmentId = "";
      detailModal.feedbackMessage = safeError(downloadError, "No se pudo descargar el adjunto.");
      detailModal.feedbackType = "error";

      render();

      return false;
    }
  }

  async function downloadPreview() {
    const file = safeObject(detailModal.previewFile, null);

    if (!file) return false;

    const attachmentId = cleanText(first(file.attachmentId, file.id), "");

    return downloadAttachment(attachmentId);
  }

  function closePreview() {
    detailModal.previewFile = null;

    render();

    return true;
  }

  function copyTicketId(ticketId = "") {
    const id = cleanText(ticketId, "");

    if (!id) return false;

    try {
      navigator.clipboard?.writeText?.(id);
      detailModal.feedbackMessage = `ID ${id} copiado.`;
      detailModal.feedbackType = "success";
    } catch {
      detailModal.feedbackMessage = `No se pudo copiar automáticamente el ID ${id}.`;
      detailModal.feedbackType = "warning";
    }

    render();

    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    visibleLimit = DEFAULT_VISIBLE_LIMIT;

    render({
      focusSelector: "[data-incidencias-search-input]",
    });

    return true;
  }

  function setFilter(value = "all") {
    filter = cleanText(value, "all");
    visibleLimit = DEFAULT_VISIBLE_LIMIT;

    render();

    return true;
  }

  function setSearch(value = "") {
    search = cleanText(value, "");
    visibleLimit = DEFAULT_VISIBLE_LIMIT;

    render({
      focusSelector: "[data-incidencias-search-input]",
    });

    return true;
  }

  function loadMore() {
    visibleLimit += DEFAULT_VISIBLE_LIMIT;

    render();

    return true;
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
    });
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");

    if (!type) return false;

    if (type === INCIDENCIAS_ACTIONS.REFRESH) return refresh();
    if (type === INCIDENCIAS_ACTIONS.CREATE_OPEN) return openCreateModal();
    if (type === INCIDENCIAS_ACTIONS.FILTER) return setFilter(node?.dataset?.filter || "all");
    if (type === INCIDENCIAS_ACTIONS.CLEAR_FILTERS) return clearFilters();
    if (type === INCIDENCIAS_ACTIONS.CLEAR_SEARCH) return setSearch("");
    if (type === INCIDENCIAS_ACTIONS.OPEN_DETAIL) return openDetail(node?.dataset?.ticketId || node?.dataset?.incidenciaId || "");
    if (type === INCIDENCIAS_ACTIONS.LOAD_MORE) return loadMore();

    if (type === CREATE_ACTIONS.CLOSE) return closeCreateModal();
    if (type === CREATE_ACTIONS.SUBMIT) return submitCreate(node?.closest?.("form"));
    if (type === CREATE_ACTIONS.USER_SELECT) return selectCreateUser(node);
    if (type === CREATE_ACTIONS.USER_CLEAR) return clearCreateUser();
    if (type === CREATE_ACTIONS.ATTACHMENT_REMOVE) return removeCreateAttachment(fileIndexFromNode(node));

    if (type === DETAIL_ACTIONS.CLOSE) return closeDetailModal();
    if (type === DETAIL_ACTIONS.COPY_ID) return copyTicketId(node?.dataset?.ticketId || "");
    if (type === DETAIL_ACTIONS.COMMENT_SUBMIT) return submitDetailUpdate();
    if (type === DETAIL_ACTIONS.PENDING_FILE_REMOVE) return removeDetailPendingFile(fileIndexFromNode(node));
    if (type === DETAIL_ACTIONS.ATTACHMENT_OPEN) return openAttachment(node?.dataset?.attachmentId || "");
    if (type === DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD) return downloadAttachment(node?.dataset?.attachmentId || "");
    if (type === DETAIL_ACTIONS.PREVIEW_CLOSE) return closePreview();
    if (type === DETAIL_ACTIONS.PREVIEW_DOWNLOAD) return downloadPreview();

    return false;
  }

  function actionFrom(node = null) {
    return cleanText(
      node?.dataset?.incidenciasAction ||
        node?.dataset?.createAction ||
        node?.dataset?.detailAction ||
        node?.dataset?.action ||
        "",
      ""
    );
  }

  function onClick(event) {
    const target = event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

    if (!target?.closest) return;

    const actionNode = target.closest("[data-incidencias-action], [data-create-action], [data-detail-action], [data-action]");

    if (actionNode && ownsNode(actionNode)) {
      const action = actionFrom(actionNode);

      if (action) {
        event.preventDefault();
        event.stopPropagation();
        event[ROUTER_EVENT_HANDLED_KEY] = true;

        void handleAction(action, actionNode);
        return;
      }
    }

    const row = target.closest("[data-ticket-row='true']");

    if (row && host?.contains(row)) {
      event.preventDefault();
      event.stopPropagation();
      event[ROUTER_EVENT_HANDLED_KEY] = true;

      void openDetail(row.dataset.ticketId || row.dataset.incidenciaId || "");
      return;
    }

    const createOverlay = target.closest("[data-incidencias-create-modal-overlay='true']");
    const createPanel = target.closest("[data-incidencias-create-modal-panel='true']");

    if (createOverlay && !createPanel && target === createOverlay) {
      closeCreateModal();
      return;
    }

    const detailOverlay = target.closest("[data-incidencias-modal-overlay='true']");
    const detailPanel = target.closest("[data-incidencias-modal-panel='true']");

    if (detailOverlay && !detailPanel && target === detailOverlay) {
      closeDetailModal();
    }
  }

  function onInput(event) {
    const target = event.target;
    const field = cleanText(target?.dataset?.field || target?.dataset?.incidenciasField || "", "");

    if (!field || !ownsNode(target)) return;

    if (field === "search") {
      setSearch(target.value || "");
      return;
    }

    if (field === "targetUserSearch") {
      handleUserSearch(target.value || "");
      return;
    }

    if (createModal.open) {
      patchCreateFormFromField(target);
    }

    if (detailModal.open && field === "comment") {
      patchDetailComment(target);
    }
  }

  function onChange(event) {
    const target = event.target;
    const field = cleanText(target?.dataset?.field || target?.dataset?.detailField || "", "");

    if (!field || !ownsNode(target)) return;

    if (createModal.open && field === "attachments") {
      addCreateAttachments(filesFromInput(target));
      return;
    }

    if (detailModal.open && field === "attachments") {
      addDetailPendingFiles(filesFromInput(target));
      return;
    }

    if (createModal.open) {
      patchCreateFormFromField(target);
    }
  }

  function onSubmit(event) {
    const form = event.target?.closest?.("form");

    if (!form || !ownsNode(form)) return;

    if (form.matches("#incidencias-create-form, [data-incidencias-create-form='true']")) {
      event.preventDefault();
      event.stopPropagation();
      event[ROUTER_EVENT_HANDLED_KEY] = true;

      void submitCreate(form);
    }
  }

  function onKeydown(event) {
    if (!ownsNode(event.target)) return;

    if (event.key === "Escape") {
      if (detailModal.open) {
        event.preventDefault();
        closeDetailModal();
        return;
      }

      if (createModal.open) {
        event.preventDefault();
        closeCreateModal();
        return;
      }
    }

    if (event.key !== "Enter" && event.key !== " ") return;

    const row = event.target?.closest?.("[data-ticket-row='true']");

    if (!row || !host?.contains(row)) return;

    event.preventDefault();
    event.stopPropagation();
    event[ROUTER_EVENT_HANDLED_KEY] = true;

    void openDetail(row.dataset.ticketId || row.dataset.incidenciaId || "");
  }

  function onDragOver(event) {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");

    if (!dropzone || !ownsNode(dropzone) || !createModal.open) return;

    event.preventDefault();

    if (!createModal.dragActive) {
      createModal.dragActive = true;
      renderCreateModal({
        preserveFocus: true,
      });
    }
  }

  function onDragLeave(event) {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");

    if (!dropzone || !ownsNode(dropzone) || !createModal.open) return;

    const related = event.relatedTarget;

    if (related && dropzone.contains(related)) return;

    createModal.dragActive = false;
    renderCreateModal({
      preserveFocus: true,
    });
  }

  function onDrop(event) {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");

    if (!dropzone || !ownsNode(dropzone) || !createModal.open) return;

    event.preventDefault();

    createModal.dragActive = false;
    addCreateAttachments(Array.from(event.dataTransfer?.files || []));
  }

  function bindTarget(target = null) {
    target?.addEventListener?.("click", onClick);
    target?.addEventListener?.("input", onInput);
    target?.addEventListener?.("change", onChange);
    target?.addEventListener?.("submit", onSubmit);
    target?.addEventListener?.("keydown", onKeydown);
    target?.addEventListener?.("dragover", onDragOver);
    target?.addEventListener?.("dragleave", onDragLeave);
    target?.addEventListener?.("drop", onDrop);

    return true;
  }

  function unbindTarget(target = null) {
    target?.removeEventListener?.("click", onClick);
    target?.removeEventListener?.("input", onInput);
    target?.removeEventListener?.("change", onChange);
    target?.removeEventListener?.("submit", onSubmit);
    target?.removeEventListener?.("keydown", onKeydown);
    target?.removeEventListener?.("dragover", onDragOver);
    target?.removeEventListener?.("dragleave", onDragLeave);
    target?.removeEventListener?.("drop", onDrop);

    return true;
  }

  function bind() {
    bindTarget(host);

    ensureModalHost();

    return true;
  }

  function unbind() {
    unbindTarget(host);

    if (modalHostBound) {
      unbindTarget(modalHost);
      modalHostBound = false;
    }

    return true;
  }

  const controller = {
    version: INCIDENCIAS_VIEW_VERSION,

    mount() {
      if (destroyed || !host) return controller;
      if (mounted) return controller;

      mounted = true;
      bind();

      const hasCache = items.length > 0;

      if (hasCache) {
        loading = false;
        refreshing = false;
        error = "";
        renderNow();
      } else {
        loading = true;
        refreshing = false;
        error = "";
        renderLoading();
      }

      void load({
        silent: true,
        source: "incidencias.mount.background",
      });

      return controller;
    },

    destroy() {
      destroyed = true;
      mounted = false;

      loadSeq += 1;
      userSearchSeq += 1;

      clearUserSearchTimer();
      cancelScheduledRender();
      cancelScheduledCreateModalRender();

      unbind();

      resetCreateModal();
      resetDetailModal();

      removeModalHost();
      syncBodyModalClass(false);

      clearInstance(host, controller);

      /*
        El Router controla el host y hace swap atómico.
        No vaciamos host aquí para evitar doble clear y flashes.
      */
      return true;
    },

    unmount() {
      return this.destroy();
    },

    cleanup() {
      return this.destroy();
    },

    dispose() {
      return this.destroy();
    },

    refresh,

    reload: refresh,

    getSnapshot() {
      return {
        version: INCIDENCIAS_VIEW_VERSION,

        mounted,
        destroyed,

        loading,
        refreshing,
        creating,
        loadingMore,

        total,
        count: items.length,
        visibleLimit,

        filter,
        searchLength: search.length,

        createModalOpen: createModal.open,
        detailModalOpen: detailModal.open,

        createModalIsland: Boolean(modalHost?.isConnected),
        createModalBound: modalHostBound,

        openingTicketId: openingTicketId ? "***" : "",
        role: getCurrentRole(),
        admin: isAdmin(),

        error: redact(error),
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  return controller;
}

/* =========================================================
   VIEW ENTRY
========================================================= */

export async function IncidenciasView(host = null, context = {}) {
  if (!isDomNode(host)) {
    return null;
  }

  destroyPrevious(host);

  const controller = createIncidenciasController(host, context);

  storeInstance(host, controller);

  return controller.mount();
}

export const IncidenciasIndex = IncidenciasView;

export function destroy() {
  try {
    return Boolean(lastInstance?.destroy?.());
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: INCIDENCIAS_VIEW_VERSION,
    mounted: false,
    hasInstance: false,
    role: getCurrentRole(),
    admin: isAdmin(),
  };
}

export const getDebugSnapshot = getSnapshot;

export default IncidenciasView;

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
   - Admin: buscar usuarios y crear incidencias para usuarios.
   - Abrir detalle.
   - Comentar/reabrir/subir adjuntos.
   - Abrir/descargar adjuntos.
   - Renderizar modales en isla única.
   - Cero reconstrucción del modal durante búsqueda admin.
   - Cero reconstrucción del modal al adjuntar/quitar archivos en create.
   - Cero reconstrucción del modal por renders de vista/listado.
   - Delegar búsqueda de usuarios en incidencias.api.js.
   - Delegar HTML en templates.
   - Controlar orden visual mayor/menor para el template.
   - Sin Store.
   - Sin State externo.
   - Sin actions/bindings/model/utils/homeView legacy.
   - Sin fetch propio.
   - Sin HTTP duplicado.
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
  searchIncidenciaUsers,
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
  renderIncidenciasDetailModal,
  DETAIL_ACTIONS,
  validateDetailUpdate,
} from "./incidencias.template.modal.js";

export const INCIDENCIAS_INDEX_VERSION = "incidencias.index.lean.v14.zero-create-flicker";
export const INCIDENCIAS_VIEW_VERSION = INCIDENCIAS_INDEX_VERSION;

const DEFAULT_VISIBLE_LIMIT = 20;
const DEFAULT_SORT_ORDER = "desc";

const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE_MS = 220;

const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

const MODAL_HOST_SELECTOR = "[data-incidencias-modal-host='true']";
const CREATE_ROOT_SELECTOR = "[data-incidencias-create-root='true']";
const CREATE_MODAL_PANEL_SELECTOR = "[data-incidencias-create-modal-panel='true']";
const DETAIL_MODAL_PANEL_SELECTOR = "[data-incidencias-modal-panel='true']";
const CREATE_MODAL_OVERLAY_SELECTOR = "[data-incidencias-create-modal-overlay='true']";
const DETAIL_MODAL_OVERLAY_SELECTOR = "[data-incidencias-modal-overlay='true']";

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

function normalizeSortOrder(value = "") {
  const order = cleanText(value, DEFAULT_SORT_ORDER).toLowerCase();

  if (
    order === "asc" ||
    order === "ascending" ||
    order === "menor" ||
    order === "menor_mayor" ||
    order === "menor-a-mayor" ||
    order === "menor_a_mayor" ||
    order === "oldest"
  ) {
    return "asc";
  }

  return "desc";
}

function getNextSortOrder(value = DEFAULT_SORT_ORDER) {
  return normalizeSortOrder(value) === "asc" ? "desc" : "asc";
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
  const raw = safeObject(item);

  return cleanText(
    first(
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      raw.code,
      raw.numero,
      raw.ticketCode
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
  const raw = safeObject(item);
  const timestamp = Date.parse(
    first(
      raw.lastActivityAt,
      raw.updatedAt,
      raw.modifiedAt,
      raw.closedAt,
      raw.createdAt,
      raw.lifecycle?.lastActivityAt,
      raw.lifecycle?.updatedAt,
      raw.lifecycle?.closedAt,
      raw.lifecycle?.createdAt,
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

  const map = new Map();
  const existing = safeArray(items).find((current) => getTicketId(current) === id) || null;

  map.set(id, existing ? mergeTicketData(existing, next) : next);

  for (const current of safeArray(items)) {
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
    servidor: ROUTES.servidor || "/servidor",
  };
}

/* =========================================================
   FORM HELPERS
========================================================= */

function getCreateDefaults() {
  return {
    ...getCreateFormDefaults(),
    targetClienteId: "",
    attachments: [],
  };
}

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
  let sortOrder = DEFAULT_SORT_ORDER;
  let visibleLimit = DEFAULT_VISIBLE_LIMIT;
  let openingTicketId = "";

  let renderFrame = 0;
  let pendingRenderOptions = null;

  let modalFrame = 0;
  let pendingModalOptions = null;
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
    form: getCreateDefaults(),
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
      sortOrder,
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
      createModal: {
        ...createModal,
        open: false,
      },
      detailModal: {
        ...detailModal,
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

  function modalsOpen() {
    return createModal.open || detailModal.open;
  }

  function syncBodyModalClass() {
    if (!isBrowser()) return false;

    try {
      document.body?.classList.toggle("modal-open", modalsOpen());
      document.body?.classList.toggle("incidencias-modal-open", modalsOpen());
      document.body?.classList.toggle("incidencias-create-open", createModal.open);
      document.body?.classList.toggle("incidencias-detail-open", detailModal.open);
      return true;
    } catch {
      return false;
    }
  }

  function ownsNode(node = null) {
    if (!node) return false;

    return Boolean(
      host?.contains?.(node) ||
        modalHost?.contains?.(node)
    );
  }

  function ensureModalHost() {
    if (!isBrowser()) return null;

    if (modalHost?.isConnected) return modalHost;

    modalHost = document.querySelector(MODAL_HOST_SELECTOR) || document.createElement("div");
    modalHost.setAttribute("data-incidencias-modal-host", "true");
    modalHost.setAttribute("data-owner", INCIDENCIAS_VIEW_VERSION);

    if (!modalHost.isConnected) {
      document.body.appendChild(modalHost);
    }

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

      modalHost.replaceChildren();
      modalHost.remove();
    } catch {
      // noop
    }

    modalHost = null;
    modalHostBound = false;

    return true;
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

  function captureModalDomState(root = null) {
    if (!isBrowser() || !root) return null;

    const active = document.activeElement;
    const createPanel = root.querySelector(CREATE_MODAL_PANEL_SELECTOR);
    const detailPanel = root.querySelector(DETAIL_MODAL_PANEL_SELECTOR);

    const state = {
      createScrollTop: createPanel?.scrollTop || 0,
      detailScrollTop: detailPanel?.scrollTop || 0,
      activeField: "",
      activeName: "",
      activeId: "",
      selectionStart: null,
      selectionEnd: null,
    };

    if (!active || !root.contains(active)) return state;
    if (active.matches?.("input[type='file']")) return state;

    state.activeField = cleanText(active.dataset?.field || active.dataset?.detailField, "");
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

    const candidates = Array.from(root.querySelectorAll("[data-field], [data-detail-field], [name]"));

    if (state.activeField) {
      const byField = candidates.find((node) => {
        return cleanText(node.dataset?.field || node.dataset?.detailField, "") === state.activeField;
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

  function restoreModalDomState(root = null, state = null, options = {}) {
    if (!isBrowser() || !root) return false;

    const createPanel = root.querySelector(CREATE_MODAL_PANEL_SELECTOR);
    const detailPanel = root.querySelector(DETAIL_MODAL_PANEL_SELECTOR);

    if (createPanel && state) createPanel.scrollTop = state.createScrollTop || 0;
    if (detailPanel && state) detailPanel.scrollTop = state.detailScrollTop || 0;

    nextFrame(() => {
      try {
        if (createPanel && state) createPanel.scrollTop = state.createScrollTop || 0;
        if (detailPanel && state) detailPanel.scrollTop = state.detailScrollTop || 0;
      } catch {
        // noop
      }
    });

    if (options.preserveFocus === false) return true;

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

  function cancelScheduledModalRender() {
    if (!modalFrame) return false;

    cancelFrame(modalFrame);
    modalFrame = 0;
    pendingModalOptions = null;

    return true;
  }

  function renderModalsNow(options = {}) {
    if (destroyed || !isBrowser()) return false;

    cancelScheduledModalRender();

    if (!modalsOpen()) {
      removeModalHost();
      syncBodyModalClass();
      return true;
    }

    const target = ensureModalHost();

    if (!target) return false;

    const state = captureModalDomState(target);
    const createHtml = createModal.open ? renderIncidenciasCreateModal(createModalPayload()) : "";
    const detailHtml = detailModal.open ? renderIncidenciasDetailModal(detailModal) : "";

    target.innerHTML = `${createHtml}${detailHtml}`;

    syncBodyModalClass();
    restoreModalDomState(target, state, options);

    return true;
  }

  function renderModals(options = {}) {
    if (destroyed || !isBrowser()) return false;

    if (options.immediate === true) {
      return renderModalsNow(options);
    }

    pendingModalOptions = mergeRenderOptions(pendingModalOptions || {}, options);

    if (modalFrame) return true;

    modalFrame = nextFrame(() => {
      const nextOptions = pendingModalOptions || {};

      modalFrame = 0;
      pendingModalOptions = null;

      renderModalsNow(nextOptions);
    });

    return true;
  }

  function patchCreateDomSlots(options = {}) {
    if (destroyed || !isBrowser() || !createModal.open) return false;

    const target = ensureModalHost();
    const currentRoot = target?.querySelector?.(CREATE_ROOT_SELECTOR);

    if (!target || !currentRoot) {
      return renderModals(options);
    }

    const template = document.createElement("template");
    template.innerHTML = renderIncidenciasCreateModal(createModalPayload());

    const nextRoot = template.content.querySelector(CREATE_ROOT_SELECTOR);

    if (!nextRoot) return false;

    const selectors = safeArray(options.selectors).length
      ? safeArray(options.selectors)
      : [
          "[data-create-selected-user-slot='true']",
          "[data-create-user-search-slot='true']",
          ".inc-create-target-error-slot",
          "[data-create-files-card='true']",
        ];

    for (const selector of selectors) {
      const currentNode = currentRoot.querySelector(selector);
      const nextNode = nextRoot.querySelector(selector);

      if (currentNode && nextNode) {
        currentNode.replaceWith(nextNode);
        continue;
      }

      if (currentNode && !nextNode) {
        currentNode.replaceChildren();
      }
    }

    const hiddenFields = [
      "targetUserId",
      "targetClienteId",
      "targetUserName",
      "targetUserEmail",
      "targetUserAvatar",
    ];

    for (const fieldName of hiddenFields) {
      const currentField = currentRoot.querySelector(`[data-field="${fieldName}"]`);
      const nextField = nextRoot.querySelector(`[data-field="${fieldName}"]`);

      if (currentField && nextField) {
        currentField.value = nextField.value || "";
      }
    }

    if (options.syncInputValue === true) {
      const currentInput = currentRoot.querySelector("[data-create-user-search-input]");
      const nextInput = nextRoot.querySelector("[data-create-user-search-input]");

      if (currentInput && nextInput) {
        currentInput.value = nextInput.value || "";
      }
    }

    syncBodyModalClass();

    if (options.focusSelector) {
      focusAfterRender(
        options.focusSelector,
        options.focusEnd !== false,
        target
      );
    }

    return true;
  }

  function patchCreateUserDom(options = {}) {
    return patchCreateDomSlots({
      ...options,
      selectors: [
        "[data-create-selected-user-slot='true']",
        "[data-create-user-search-slot='true']",
        ".inc-create-target-error-slot",
      ],
    });
  }

  function patchCreateFilesDom(options = {}) {
    return patchCreateDomSlots({
      ...options,
      selectors: [
        "[data-create-files-card='true']",
      ],
    });
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasTemplate(viewPayload());

    /*
      Cero flicker:
      - Los renders de la vista/listado NO reconstruyen modales abiertos.
      - El modal sólo se crea/destruye con acciones explícitas.
    */
    if (options.skipModals !== true && !modalsOpen()) {
      renderModalsNow({ preserveFocus: true });
    }

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

    if (!modalsOpen()) {
      renderModalsNow({ preserveFocus: true });
    }

    if (options.focusSelector) {
      focusAfterRender(options.focusSelector, options.focusEnd !== false);
    }

    return true;
  }

  function renderError(message = "No se pudieron cargar las incidencias.") {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasErrorState(message);

    if (!modalsOpen()) {
      renderModalsNow({ preserveFocus: true });
    }

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
    createModal.form = getCreateDefaults();
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
    createModal.form = getCreateDefaults();
    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    renderModals({
      immediate: true,
      focusSelector: isAdmin() ? "[data-create-user-search-input]" : "[data-field='subject']",
      preserveFocus: false,
    });

    return true;
  }

  function closeCreateModal() {
    if (createModal.submitting) return false;

    creating = false;

    clearUserSearchTimer();
    userSearchSeq += 1;

    resetCreateModal();
    renderModals({ immediate: true });

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

  async function searchUsers(query = "") {
    const q = cleanText(query, "");

    if (!isAdmin() || q.length < USER_SEARCH_MIN_LENGTH) return [];

    return searchIncidenciaUsers(q, {
      limit: USER_SEARCH_LIMIT,
    });
  }

  async function runUserSearch(query = "", seq = userSearchSeq) {
    try {
      const results = await searchUsers(query);

      if (destroyed || seq !== userSearchSeq) return false;

      createModal.userSearch.results = safeArray(results);
      createModal.userSearch.loading = false;
      createModal.userSearch.empty = safeArray(results).length === 0;
      createModal.userSearch.error = "";

      patchCreateUserDom({
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

      patchCreateUserDom({
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
    createModal.userSearch.loading = false;

    if (createModal.errors.targetUserId || createModal.errors.targetUser) {
      const next = { ...createModal.errors };
      delete next.targetUserId;
      delete next.targetUser;
      createModal.errors = next;
    }

    createModal.serverError = "";

    if (!isAdmin() || query.length < USER_SEARCH_MIN_LENGTH) {
      if (hadVisibleSearchState) {
        patchCreateUserDom({
          focusSelector: "[data-create-user-search-input]",
          preserveFocus: true,
        });
      }

      return true;
    }

    userSearchTimer = window.setTimeout(() => {
      if (destroyed || seq !== userSearchSeq) return;

      createModal.userSearch.loading = true;

      patchCreateUserDom({
        focusSelector: "[data-create-user-search-input]",
        preserveFocus: true,
      });

      void runUserSearch(query, seq);
    }, USER_SEARCH_DEBOUNCE_MS);

    return true;
  }

  function selectCreateUser(node = null) {
    const userId = cleanText(node?.dataset?.userId, "");

    if (!userId) return false;

    clearUserSearchTimer();
    userSearchSeq += 1;

    const selected =
      safeArray(createModal.userSearch.results).find((user) => {
        return cleanText(first(user.userId, user.id), "") === userId;
      }) || {};

    const clienteId = cleanText(
      first(
        node?.dataset?.userClienteId,
        node?.dataset?.clienteId,
        selected.targetClienteId,
        selected.clienteId,
        selected.clientId
      ),
      ""
    );

    const userName = cleanText(
      first(
        node?.dataset?.userName,
        selected.displayName,
        selected.fullName,
        selected.name,
        selected.nombre,
        selected.username
      ),
      "Usuario"
    );

    const userEmail = cleanText(
      first(
        node?.dataset?.userEmail,
        node?.dataset?.email,
        selected.email,
        selected.emailLower,
        selected.userEmail,
        selected.mail
      ),
      ""
    ).toLowerCase();

    const userAvatar = cleanText(
      first(
        node?.dataset?.userAvatar,
        selected.avatarUrl,
        selected.avatar,
        selected.picture,
        selected.photoUrl
      ),
      ""
    );

    createModal.form = {
      ...createModal.form,
      targetUserId: userId,
      targetClienteId: clienteId,
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

        clienteId,
        clientId: clienteId,
        targetClienteId: clienteId,

        displayName: userName,
        fullName: userName,
        name: userName,
        nombre: userName,

        email: userEmail,
        emailLower: userEmail,
        userEmail,
        mail: userEmail,

        avatar: userAvatar,
        avatarUrl: userAvatar,

        username: cleanText(first(selected.username, selected.userName, ""), ""),
        role: cleanText(first(selected.role, selected.rol, "user"), "user"),
      },
      empty: false,
    };

    if (createModal.errors.targetUserId || createModal.errors.targetUser) {
      const next = { ...createModal.errors };
      delete next.targetUserId;
      delete next.targetUser;
      createModal.errors = next;
    }

    createModal.serverError = "";

    patchCreateUserDom({
      focusSelector: "[data-field='subject']",
      syncInputValue: true,
      preserveFocus: false,
    });

    return true;
  }

  function clearCreateUser() {
    clearUserSearchTimer();
    userSearchSeq += 1;

    createModal.form = {
      ...createModal.form,
      targetUserId: "",
      targetClienteId: "",
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

    patchCreateUserDom({
      focusSelector: "[data-create-user-search-input]",
      syncInputValue: true,
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

    patchCreateFilesDom({
      preserveFocus: true,
    });

    return true;
  }

  function removeCreateAttachment(index = -1) {
    if (index < 0) return false;

    createModal.form.attachments = safeArray(createModal.form.attachments).filter(
      (_, currentIndex) => currentIndex !== index
    );

    patchCreateFilesDom({
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
        targetClienteId: readField(formNode, "targetClienteId") || createModal.form.targetClienteId,
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

    if (isAdmin() && !createModal.form.targetUserId) {
      createModal.errors = {
        ...createModal.errors,
        targetUserId: "Selecciona el usuario afectado antes de crear la incidencia.",
      };
    }

    if (Object.keys(createModal.errors).length > 0 || !validation.valid) {
      renderModals({
        focusSelector:
          createModal.errors.targetUserId || createModal.errors.targetUser
            ? "[data-create-user-search-input]"
            : createModal.errors.subject
              ? "[data-field='subject']"
              : createModal.errors.description
                ? "[data-field='description']"
                : "",
        preserveFocus: false,
      });

      return false;
    }

    creating = true;
    createModal.submitting = true;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";

    renderModals({
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

      creating = false;
      resetCreateModal();

      renderModals({ immediate: true });
      render();

      return true;
    } catch (createError) {
      creating = false;
      createModal.submitting = false;
      createModal.serverError = safeError(createError, "No se pudo crear la incidencia.");

      renderModals({
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
    renderModals({ immediate: true });

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

      render({ skipModals: true });
      renderModals({
        immediate: true,
        focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
        focusEnd: false,
        preserveFocus: false,
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

      detailModal.open = Boolean(mergedDetail);
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

      render({ skipModals: true });
      renderModals({
        focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
        focusEnd: false,
        preserveFocus: false,
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

        render({ skipModals: true });
        renderModals({
          focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
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

    if (detailModal.feedbackMessage) {
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
    }

    renderModals({
      focusSelector: "[data-field='comment']",
    });

    return true;
  }

  function removeDetailPendingFile(index = -1) {
    if (index < 0) return false;

    detailModal.pendingFiles = safeArray(detailModal.pendingFiles).filter(
      (_, currentIndex) => currentIndex !== index
    );

    renderModals({
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

      renderModals({
        focusSelector: "[data-field='comment']",
      });

      return false;
    }

    detailModal.submitting = true;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals();

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

      render({ skipModals: true });
      renderModals({
        focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
        focusEnd: false,
      });

      return true;
    } catch (updateError) {
      detailModal.submitting = false;
      detailModal.feedbackMessage = safeError(updateError, "No se pudo actualizar la incidencia.");
      detailModal.feedbackType = "error";

      renderModals({
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

    renderModals();

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

      renderModals();

      return true;
    } catch (attachmentError) {
      detailModal.openingAttachmentId = "";
      detailModal.feedbackMessage = safeError(attachmentError, "No se pudo abrir el adjunto.");
      detailModal.feedbackType = "error";

      renderModals();

      return false;
    }
  }

  async function downloadAttachment(attachmentId = "") {
    const id = cleanText(attachmentId, "");
    const ticketId = getTicketId(detailModal.detail);
    const attachment = getAttachmentById(id);

    if (!id || !ticketId) return false;

    detailModal.downloadingAttachmentId = id;

    renderModals();

    try {
      await downloadIncidenciaAttachment({
        ticketId,
        attachmentId: id,
        filename: cleanText(first(attachment?.filename, attachment?.fileName, attachment?.name), "archivo"),
      });

      detailModal.downloadingAttachmentId = "";

      renderModals();

      return true;
    } catch (downloadError) {
      detailModal.downloadingAttachmentId = "";
      detailModal.feedbackMessage = safeError(downloadError, "No se pudo descargar el adjunto.");
      detailModal.feedbackType = "error";

      renderModals();

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

    renderModals();
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

    renderModals();
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

  function toggleSortOrder() {
    sortOrder = getNextSortOrder(sortOrder);
    visibleLimit = DEFAULT_VISIBLE_LIMIT;

    render();
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
    if (type === INCIDENCIAS_ACTIONS.SORT_TOGGLE) return toggleSortOrder();
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

    const createOverlay = target.closest(CREATE_MODAL_OVERLAY_SELECTOR);
    const createPanel = target.closest(CREATE_MODAL_PANEL_SELECTOR);

    if (createOverlay && !createPanel && target === createOverlay) {
      closeCreateModal();
      return;
    }

    const detailOverlay = target.closest(DETAIL_MODAL_OVERLAY_SELECTOR);
    const detailPanel = target.closest(DETAIL_MODAL_PANEL_SELECTOR);

    if (detailOverlay && !detailPanel && target === detailOverlay) {
      closeDetailModal();
    }
  }

  function onInput(event) {
    const target = event.target;
    const field = cleanText(target?.dataset?.field || target?.dataset?.incidenciasField || target?.dataset?.detailField || "", "");

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
      if (createModal.open) {
        event.preventDefault();
        closeCreateModal();
        return;
      }

      if (detailModal.open) {
        event.preventDefault();
        closeDetailModal();
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

  function getDropzone(target = null) {
    const dropzone = target?.closest?.("[data-dropzone]") || null;

    if (!dropzone || !ownsNode(dropzone)) return null;

    const kind = cleanText(dropzone.dataset?.dropzone, "");

    if (kind === "attachments" && createModal.open) return { dropzone, kind: "create" };
    if (kind === "detail-attachments" && detailModal.open) return { dropzone, kind: "detail" };

    return null;
  }

  function onDragOver(event) {
    const zone = getDropzone(event.target);

    if (!zone) return;

    event.preventDefault();

    if (zone.kind !== "create") return;

    if (!createModal.dragActive) {
      createModal.dragActive = true;

      patchCreateFilesDom({
        preserveFocus: true,
      });
    }
  }

  function onDragLeave(event) {
    const zone = getDropzone(event.target);

    if (!zone || zone.kind !== "create") return;

    const related = event.relatedTarget;

    if (related && zone.dropzone.contains(related)) return;

    createModal.dragActive = false;

    patchCreateFilesDom({
      preserveFocus: true,
    });
  }

  function onDrop(event) {
    const zone = getDropzone(event.target);

    if (!zone) return;

    event.preventDefault();

    const files = Array.from(event.dataTransfer?.files || []);

    if (zone.kind === "create") {
      createModal.dragActive = false;
      addCreateAttachments(files);
      return;
    }

    addDetailPendingFiles(files);
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
      cancelScheduledModalRender();

      unbind();

      resetCreateModal();
      resetDetailModal();

      removeModalHost();
      syncBodyModalClass();

      clearInstance(host, controller);

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
        sortOrder,

        createModalOpen: createModal.open,
        detailModalOpen: detailModal.open,

        modalHost: Boolean(modalHost?.isConnected),
        modalHostBound,

        userSearch: {
          queryLength: createModal.userSearch.query.length,
          loading: createModal.userSearch.loading,
          results: createModal.userSearch.results.length,
          empty: createModal.userSearch.empty,
          hasError: Boolean(createModal.userSearch.error),
          hasSelectedUser: Boolean(createModal.form.targetUserId),
        },

        createAttachments: safeArray(createModal.form.attachments).length,

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

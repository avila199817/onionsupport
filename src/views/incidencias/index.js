/* =========================================================
   Onion Support - Incidencias Index
   Archivo: /src/views/incidencias/index.js

   Contrato productivo:
   - Controlador de la vista Incidencias.
   - Sin fetch propio: todas las llamadas salen por incidencias.api.js.
   - Crear incidencia con adjuntos reales File/Blob.
   - Antes de submit re-lee el input file vivo y lo fusiona con memoria.
   - Admin: crear incidencia 1:1 para targetUserId real de Cosmos.
   - No inventa targetClienteId/clienteId.
   - Mantiene modal en isla propia para no destruir estado del listado.
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

export const INCIDENCIAS_INDEX_VERSION = "incidencias.index.aligned.blob.v10";
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
  return Boolean(typeof Node !== "undefined" && value && value instanceof Node);
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

function isFileLike(value = null) {
  if (!value || typeof value !== "object") return false;
  if (isFile(value) || isBlob(value)) return true;

  return Boolean(
    typeof value.name === "string" &&
      typeof value.size === "number" &&
      (
        typeof value.arrayBuffer === "function" ||
        typeof value.stream === "function" ||
        typeof value.slice === "function"
      )
  );
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

  if (["admin", "administrator", "administrador", "owner", "superadmin"].includes(role)) return "admin";
  if (["user", "usuario", "client", "cliente"].includes(role)) return "user";

  return role || "";
}

function normalizeSortOrder(value = "") {
  const order = cleanText(value, DEFAULT_SORT_ORDER).toLowerCase();

  if (["asc", "ascending", "menor", "menor_mayor", "menor-a-mayor", "menor_a_mayor", "oldest"].includes(order)) {
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
    first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero, raw.ticketCode),
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

    output[key] = shouldPreserveExisting(value) && previous !== undefined && previous !== null
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
  if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
  return window.setTimeout(callback, 0);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
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

  return normalizeRole(
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
  ) || "user";
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
    source: "panel_admin",
    status: "open",
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
    return Array.from(input?.files || []).filter(isFileLike);
  } catch {
    return [];
  }
}

function filesFromForm(form = null) {
  if (!form) return [];

  const input = form.querySelector?.(`[data-field="attachments"], input[name="attachments"], input[type="file"]`);
  return filesFromInput(input);
}

function dedupeFiles(files = []) {
  const map = new Map();

  for (const file of safeArray(files).flat()) {
    if (!isFileLike(file)) continue;

    const key = [file.name || "archivo", file.size || 0, file.lastModified || 0, file.type || ""].join("::");
    if (!map.has(key)) map.set(key, file);
  }

  return [...map.values()];
}

function fileIndexFromNode(node = null) {
  const value = node?.dataset?.removeAttachment || node?.dataset?.fileIndex || "";
  const index = Number(value);

  return Number.isFinite(index) ? index : -1;
}

function ensureCreateFormFiles(formNode = null) {
  const liveFiles = filesFromForm(formNode);

  if (liveFiles.length) {
    return dedupeFiles([
      ...safeArray(formNode?.__onionCreateFiles || []),
      ...liveFiles,
    ]);
  }

  return [];
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function storeInstance(host = null, controller = null) {
  if (!host || !controller) return false;
  INSTANCES.set(host, controller);
  lastInstance = controller;
  return true;
}

function clearInstance(host = null, controller = null) {
  if (host && INSTANCES.get(host) === controller) INSTANCES.delete(host);
  if (lastInstance === controller) lastInstance = null;
  return true;
}

function destroyPrevious(host = null) {
  const previous = host ? INSTANCES.get(host) : null;

  if (previous?.destroy) {
    try {
      previous.destroy();
    } catch {
      // noop
    }
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
  let modalFrame = 0;
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

  function ownsNode(node = null) {
    if (!node) return false;
    return Boolean(host?.contains?.(node) || modalHost?.contains?.(node));
  }

  function payload(extra = {}) {
    return {
      user: getCurrentUser(),
      role: getCurrentRole(),
      admin: isAdmin(),
      routes: getRoutes(),
      context: safeObject(context),

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

  function detailModalPayload() {
    return {
      ...detailModal,
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

  function ensureModalHost() {
    if (!isBrowser()) return null;

    if (modalHost?.isConnected) return modalHost;

    modalHost = document.querySelector(MODAL_HOST_SELECTOR) || document.createElement("div");
    modalHost.setAttribute("data-incidencias-modal-host", "true");
    modalHost.setAttribute("data-owner", INCIDENCIAS_VIEW_VERSION);

    if (!modalHost.isConnected) document.body.appendChild(modalHost);

    if (mounted && !modalHostBound) {
      bindTarget(modalHost);
      modalHostBound = true;
    }

    return modalHost;
  }

  function removeModalHost() {
    if (!modalHost) return false;

    try {
      if (modalHostBound) unbindTarget(modalHost);
      modalHost.replaceChildren();
      modalHost.remove();
    } catch {
      // noop
    }

    modalHost = null;
    modalHostBound = false;
    return true;
  }

  function focusAfterRender(selector = "", root = modalHost || host) {
    if (!selector || !root) return false;

    try {
      const node = root.querySelector(selector);
      if (!node) return false;

      node.focus({ preventScroll: true });

      if (typeof node.setSelectionRange === "function") {
        const end = String(node.value || "").length;
        node.setSelectionRange(end, end);
      }

      return true;
    } catch {
      return false;
    }
  }

  function cancelScheduledRender() {
    if (!renderFrame) return false;
    cancelFrame(renderFrame);
    renderFrame = 0;
    return true;
  }

  function cancelScheduledModalRender() {
    if (!modalFrame) return false;
    cancelFrame(modalFrame);
    modalFrame = 0;
    return true;
  }

  function renderModalsNow(options = {}) {
    if (destroyed || !isBrowser()) return false;

    const target = ensureModalHost();
    if (!target) return false;

    const createHtml = createModal.open ? renderIncidenciasCreateModal(createModalPayload()) : "";
    const detailHtml = detailModal.open ? renderIncidenciasDetailModal(detailModalPayload()) : "";

    target.innerHTML = `${createHtml}${detailHtml}`;
    syncBodyModalClass();

    if (options.focusSelector) focusAfterRender(options.focusSelector, target);

    return true;
  }

  function renderModals(options = {}) {
    if (options.immediate === true) return renderModalsNow(options);
    if (modalFrame) return true;

    modalFrame = nextFrame(() => {
      modalFrame = 0;
      renderModalsNow(options);
    });

    return true;
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasTemplate(viewPayload());

    if (!options.skipModals) renderModalsNow();

    return true;
  }

  function render(options = {}) {
    if (options.immediate === true) return renderNow(options);
    if (renderFrame) return true;

    renderFrame = nextFrame(() => {
      renderFrame = 0;
      renderNow(options);
    });

    return true;
  }

  function renderLoading() {
    if (!host) return false;
    host.innerHTML = renderIncidenciasLoadingState(payload());
    renderModalsNow();
    return true;
  }

  function renderError(message = "") {
    if (!host) return false;
    host.innerHTML = renderIncidenciasErrorState(message);
    renderModalsNow();
    return true;
  }

  function clearUserSearchTimer() {
    if (!userSearchTimer) return false;
    try { window.clearTimeout(userSearchTimer); } catch {}
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
      if (loading) renderLoading();
      else render();
    }

    try {
      const response = await listIncidencias({ returnStaleOnError: true, force });

      if (destroyed || seq !== loadSeq) return response;

      items = safeArray(response.items);
      total = Number(response.total || items.length) || items.length;
      error = response.stale ? cleanText(response.error?.message, "") : "";
      loading = false;
      refreshing = false;

      render();
      return response;
    } catch (loadError) {
      if (destroyed || seq !== loadSeq) return null;

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
    resetCreateModal();
    createModal.open = true;

    renderModals({
      immediate: true,
      focusSelector: isAdmin() ? "[data-create-user-search-input]" : "[data-field='subject']",
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
    return true;
  }

  async function runUserSearch(query = "") {
    const q = cleanText(query, "");
    const seq = ++userSearchSeq;

    createModal.userSearch.query = q;

    if (q.length < USER_SEARCH_MIN_LENGTH) {
      createModal.userSearch.loading = false;
      createModal.userSearch.error = "";
      createModal.userSearch.results = [];
      createModal.userSearch.empty = false;
      renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });
      return [];
    }

    createModal.userSearch.loading = true;
    createModal.userSearch.error = "";
    createModal.userSearch.empty = false;
    renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });

    try {
      const results = await searchIncidenciaUsers(q, {
        limit: USER_SEARCH_LIMIT,
      });

      if (destroyed || seq !== userSearchSeq) return [];

      createModal.userSearch.loading = false;
      createModal.userSearch.results = safeArray(results);
      createModal.userSearch.empty = q.length >= USER_SEARCH_MIN_LENGTH && !results.length;
      createModal.userSearch.error = "";

      renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });
      return results;
    } catch (searchError) {
      if (destroyed || seq !== userSearchSeq) return [];

      createModal.userSearch.loading = false;
      createModal.userSearch.results = [];
      createModal.userSearch.empty = false;
      createModal.userSearch.error = safeError(searchError, "No se pudo buscar usuarios.");

      renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });
      return [];
    }
  }

  function handleUserSearch(query = "") {
    const q = cleanText(query, "");
    createModal.userSearch.query = q;

    clearUserSearchTimer();

    if (q.length < USER_SEARCH_MIN_LENGTH) {
      userSearchSeq += 1;
      createModal.userSearch.loading = false;
      createModal.userSearch.error = "";
      createModal.userSearch.results = [];
      createModal.userSearch.empty = false;
      renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });
      return true;
    }

    createModal.userSearch.loading = true;
    renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });

    userSearchTimer = window.setTimeout(() => {
      userSearchTimer = 0;
      void runUserSearch(q);
    }, USER_SEARCH_DEBOUNCE_MS);

    return true;
  }

  function selectCreateUser(node = null) {
    if (!node) return false;

    const targetUserId = cleanText(node.dataset?.userId || node.dataset?.targetUserId || "", "");
    const targetClienteId = cleanText(
      node.dataset?.userClienteId ||
        node.dataset?.clienteId ||
        node.dataset?.targetClienteId ||
        "",
      ""
    );
    const targetUserName = cleanText(node.dataset?.userName || node.dataset?.name || node.textContent || "", "");
    const targetUserEmail = cleanText(node.dataset?.userEmail || node.dataset?.email || "", "");
    const targetUserAvatar = cleanText(node.dataset?.userAvatar || node.dataset?.avatar || "", "");

    if (!targetUserId) return false;

    const selectedUser = {
      userId: targetUserId,
      id: targetUserId,
      targetClienteId,
      clienteId: targetClienteId,
      name: targetUserName,
      displayName: targetUserName,
      email: targetUserEmail,
      avatar: targetUserAvatar,
      avatarUrl: targetUserAvatar,
    };

    createModal.form = {
      ...createModal.form,
      targetUserId,
      targetClienteId,
      targetUserName,
      targetUserEmail,
      targetUserAvatar,
    };

    createModal.errors = {
      ...createModal.errors,
    };
    delete createModal.errors.targetUserId;
    delete createModal.errors.targetUser;

    createModal.userSearch = {
      ...createModal.userSearch,
      query: targetUserName || targetUserEmail || targetUserId,
      loading: false,
      error: "",
      results: [],
      selectedUser,
      empty: false,
    };

    createModal.serverError = "";

    renderModals({ immediate: true, focusSelector: "[data-field='subject']" });
    return true;
  }

  function clearCreateUser() {
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

    renderModals({ immediate: true, focusSelector: "[data-create-user-search-input]" });
    return true;
  }

  function addCreateAttachments(files = []) {
    const incoming = dedupeFiles(files);

    if (!incoming.length) return false;

    createModal.form.attachments = dedupeFiles([
      ...safeArray(createModal.form.attachments),
      ...incoming,
    ]);

    if (createModal.errors.attachments) {
      const next = { ...createModal.errors };
      delete next.attachments;
      createModal.errors = next;
    }

    createModal.serverError = "";
    renderModals({ immediate: true });
    return true;
  }

  function removeCreateAttachment(index = -1) {
    if (index < 0) return false;

    createModal.form.attachments = safeArray(createModal.form.attachments).filter((_, currentIndex) => currentIndex !== index);
    renderModals({ immediate: true });
    return true;
  }

  function readCreateForm(formNode = null) {
    if (!formNode) return createModal.form;

    const liveFiles = filesFromForm(formNode);

    if (liveFiles.length) {
      createModal.form.attachments = dedupeFiles([
        ...safeArray(createModal.form.attachments),
        ...liveFiles,
      ]);
    }

    createModal.form = {
      ...createModal.form,
      subject: readField(formNode, "subject") || createModal.form.subject,
      category: readField(formNode, "category") || createModal.form.category,
      priority: readField(formNode, "priority") || createModal.form.priority,
      description: readField(formNode, "description") || createModal.form.description,
      source: readField(formNode, "source") || createModal.form.source || "panel_admin",
      status: readField(formNode, "status") || createModal.form.status || "open",
      targetUserId: readField(formNode, "targetUserId") || createModal.form.targetUserId,
      targetClienteId: readField(formNode, "targetClienteId") || createModal.form.targetClienteId,
      targetUserName: readField(formNode, "targetUserName") || createModal.form.targetUserName,
      targetUserEmail: readField(formNode, "targetUserEmail") || createModal.form.targetUserEmail,
      targetUserAvatar: readField(formNode, "targetUserAvatar") || createModal.form.targetUserAvatar,
    };

    return createModal.form;
  }

  async function submitCreate(formNode = null) {
    if (createModal.submitting) return false;

    readCreateForm(formNode);

    const validation = validateCreateForm(createModal.form);

    createModal.errors = validation.errors;
    createModal.form = {
      ...createModal.form,
      ...validation.form,
      attachments: dedupeFiles(createModal.form.attachments),
    };

    if (isAdmin() && !createModal.form.targetUserId) {
      createModal.errors = {
        ...createModal.errors,
        targetUserId: "Selecciona el usuario afectado antes de crear la incidencia.",
      };
    }

    if (Object.keys(createModal.errors).length > 0 || !validation.valid) {
      renderModals({
        immediate: true,
        focusSelector:
          createModal.errors.targetUserId || createModal.errors.targetUser
            ? "[data-create-user-search-input]"
            : createModal.errors.subject
              ? "[data-field='subject']"
              : createModal.errors.description
                ? "[data-field='description']"
                : "",
      });

      return false;
    }

    creating = true;
    createModal.submitting = true;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";

    renderModals({ immediate: true });

    try {
      const attachments = dedupeFiles(createModal.form.attachments);

      const created = await createIncidencia({
        ...createModal.form,
        attachments,
        files: attachments,
        adjuntos: attachments,
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

      renderModals({ immediate: true, focusSelector: "[data-field='subject']" });
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
      renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });
    } else {
      render();
    }

    try {
      const detail = await loadIncidenciaDetail(id);

      if (destroyed || openingTicketId !== id) return false;

      const mergedDetail = detail ? mergeTicketData(local || {}, detail) : local;

      detailModal.open = Boolean(mergedDetail);
      detailModal.detail = mergedDetail;
      detailModal.submitting = false;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
      detailModal.previewFile = null;

      if (mergedDetail) items = upsertByTicketId(items, mergedDetail);

      openingTicketId = "";
      render({ skipModals: true });
      renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });

      return true;
    } catch (detailError) {
      if (destroyed || openingTicketId !== id) return false;

      openingTicketId = "";

      if (local) {
        detailModal.feedbackMessage = safeError(detailError, "No se pudo actualizar el detalle.");
        detailModal.feedbackType = "error";
        render({ skipModals: true });
        renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });
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
    const incoming = dedupeFiles(files);
    if (!incoming.length) return false;

    detailModal.pendingFiles = dedupeFiles([
      ...safeArray(detailModal.pendingFiles),
      ...incoming,
    ]);

    if (detailModal.feedbackMessage) {
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
    }

    renderModals({ immediate: true, focusSelector: "[data-field='comment']" });
    return true;
  }

  function removeDetailPendingFile(index = -1) {
    if (index < 0) return false;

    detailModal.pendingFiles = safeArray(detailModal.pendingFiles).filter((_, currentIndex) => currentIndex !== index);
    renderModals({ immediate: true, focusSelector: "[data-field='comment']" });
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
      renderModals({ immediate: true, focusSelector: "[data-field='comment']" });
      return false;
    }

    detailModal.submitting = true;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";
    renderModals({ immediate: true });

    try {
      let nextDetail = detailModal.detail;

      if (detailModal.pendingFiles.length) {
        nextDetail = await uploadIncidenciaAttachments(ticketId, detailModal.pendingFiles, { status: "open" }) || nextDetail;
      }

      if (detailModal.commentDraft) {
        nextDetail = await commentIncidencia(ticketId, detailModal.commentDraft, { status: "open" }) || nextDetail;
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
      renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });
      return true;
    } catch (updateError) {
      detailModal.submitting = false;
      detailModal.feedbackMessage = safeError(updateError, "No se pudo actualizar la incidencia.");
      detailModal.feedbackType = "error";
      renderModals({ immediate: true, focusSelector: "[data-field='comment']" });
      return false;
    }
  }

  function getAttachmentById(attachmentId = "") {
    const id = cleanText(attachmentId, "");
    const attachments = safeArray(first(detailModal.detail?.attachments, detailModal.detail?.files, detailModal.detail?.adjuntos, []));

    return attachments.find((file) => cleanText(first(file.id, file.attachmentId, file.fileId), "") === id) || null;
  }

  async function openAttachment(attachmentId = "") {
    const id = cleanText(attachmentId, "");
    const ticketId = getTicketId(detailModal.detail);

    if (!id || !ticketId) return false;

    detailModal.openingAttachmentId = id;
    renderModals({ immediate: true });

    try {
      const file = await openIncidenciaAttachment({ ticketId, attachmentId: id });

      detailModal.previewFile = {
        ...safeObject(getAttachmentById(id)),
        ...safeObject(file),
        id,
        attachmentId: id,
      };
      detailModal.openingAttachmentId = "";
      renderModals({ immediate: true });
      return true;
    } catch (attachmentError) {
      detailModal.openingAttachmentId = "";
      detailModal.feedbackMessage = safeError(attachmentError, "No se pudo abrir el adjunto.");
      detailModal.feedbackType = "error";
      renderModals({ immediate: true });
      return false;
    }
  }

  async function downloadAttachment(attachmentId = "") {
    const id = cleanText(attachmentId, "");
    const ticketId = getTicketId(detailModal.detail);
    const attachment = getAttachmentById(id);

    if (!id || !ticketId) return false;

    detailModal.downloadingAttachmentId = id;
    renderModals({ immediate: true });

    try {
      await downloadIncidenciaAttachment({
        ticketId,
        attachmentId: id,
        filename: cleanText(first(attachment?.name, attachment?.filename), ""),
      });

      detailModal.downloadingAttachmentId = "";
      renderModals({ immediate: true });
      return true;
    } catch (downloadError) {
      detailModal.downloadingAttachmentId = "";
      detailModal.feedbackMessage = safeError(downloadError, "No se pudo descargar el adjunto.");
      detailModal.feedbackType = "error";
      renderModals({ immediate: true });
      return false;
    }
  }

  function closePreview() {
    detailModal.previewFile = null;
    renderModals({ immediate: true });
    return true;
  }

  async function downloadPreview() {
    const file = safeObject(detailModal.previewFile, null);
    if (!file) return false;

    return downloadAttachment(cleanText(first(file.id, file.attachmentId), ""));
  }

  function filteredItems() {
    let output = safeArray(items);

    const q = cleanText(search, "").toLowerCase();
    if (q) {
      output = output.filter((item) => {
        const haystack = [
          item.ticketId,
          item.id,
          item.subject,
          item.asunto,
          item.title,
          item.message,
          item.description,
          item.descripcion,
          item.name,
          item.displayName,
          item.email,
          item.username,
          item.category,
          item.categoria,
          item.tipo,
          item.priority,
          item.status,
        ].filter(Boolean).join(" ").toLowerCase();

        return haystack.includes(q);
      });
    }

    if (filter && filter !== "all") {
      output = output.filter((item) => {
        const status = cleanText(first(item.status, item.estado), "").toLowerCase();
        const priority = cleanText(first(item.priority, item.prioridad), "").toLowerCase();

        if (filter === "open") return ["open", "pending", "in_progress"].includes(status);
        if (filter === "closed") return ["closed", "resolved"].includes(status);
        if (filter === "urgent") return ["urgent", "high"].includes(priority);

        return true;
      });
    }

    output = [...output].sort((a, b) => {
      const diff = ticketSortTime(b) - ticketSortTime(a);
      return normalizeSortOrder(sortOrder) === "asc" ? -diff : diff;
    });

    return output.slice(0, visibleLimit);
  }

  function renderWithFilteredItems(options = {}) {
    const previousItems = items;
    const visible = filteredItems();

    // El template recibe items visibles, pero mantenemos total real.
    const payloadItems = items;
    items = visible;
    render(options);
    items = payloadItems || previousItems;

    return true;
  }

  function setSearch(value = "") {
    search = cleanText(value, "");
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    renderWithFilteredItems();
    return true;
  }

  function setFilter(value = "all") {
    filter = cleanText(value, "all") || "all";
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    renderWithFilteredItems();
    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    renderWithFilteredItems();
    return true;
  }

  function toggleSortOrder() {
    sortOrder = getNextSortOrder(sortOrder);
    renderWithFilteredItems();
    return true;
  }

  function loadMore() {
    loadingMore = true;
    visibleLimit += DEFAULT_VISIBLE_LIMIT;
    renderWithFilteredItems();
    loadingMore = false;
    return true;
  }

  async function refresh() {
    return load({ force: true, silent: false });
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
    const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
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

    if (detailOverlay && !detailPanel && target === detailOverlay) closeDetailModal();
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

    if (createModal.open) patchCreateFormFromField(target);
    if (detailModal.open && field === "comment") patchDetailComment(target);
  }

  function onChange(event) {
    const target = event.target;
    const field = cleanText(target?.dataset?.field || target?.dataset?.detailField || "", "");
    if (!field || !ownsNode(target)) return;

    if (createModal.open && field === "attachments") {
      addCreateAttachments(filesFromInput(target));
      try { target.value = ""; } catch {}
      return;
    }

    if (detailModal.open && field === "attachments") {
      addDetailPendingFiles(filesFromInput(target));
      try { target.value = ""; } catch {}
      return;
    }

    if (createModal.open) patchCreateFormFromField(target);
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
      renderModals({ immediate: true });
    }
  }

  function onDragLeave(event) {
    const zone = getDropzone(event.target);
    if (!zone || zone.kind !== "create") return;

    const related = event.relatedTarget;
    if (related && zone.dropzone.contains(related)) return;

    createModal.dragActive = false;
    renderModals({ immediate: true });
  }

  function onDrop(event) {
    const zone = getDropzone(event.target);
    if (!zone) return;

    event.preventDefault();

    const files = Array.from(event.dataTransfer?.files || []).filter(isFileLike);

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

  async function copyTicketId(ticketId = "") {
    const id = cleanText(ticketId, "");
    if (!id || !isBrowser()) return false;

    try {
      await navigator.clipboard?.writeText?.(id);
      return true;
    } catch {
      return false;
    }
  }

  const controller = {
    version: INCIDENCIAS_VIEW_VERSION,

    mount() {
      if (destroyed || mounted || !host) return controller;

      mounted = true;
      destroyed = false;

      bindTarget(host);
      ensureModalHost();

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

      void load({ silent: true, source: "incidencias.mount.background" });
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
      unbindTarget(host);
      resetCreateModal();
      resetDetailModal();
      removeModalHost();
      syncBodyModalClass();
      clearInstance(host, controller);
      return true;
    },

    unmount() { return this.destroy(); },
    cleanup() { return this.destroy(); },
    dispose() { return this.destroy(); },

    refresh,
    reload: refresh,
    openCreateModal,
    closeCreateModal,

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
        createFilesAreReal: safeArray(createModal.form.attachments).every(isFileLike),
        openingTicketId: openingTicketId ? "***" : "",
        role: getCurrentRole(),
        admin: isAdmin(),
        error: redact(error),
        blob: {
          createField: "attachments",
          submitRereadsLiveFileInput: true,
          sendsFilesAliases: ["attachments", "files", "adjuntos"],
        },
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
  if (!isDomNode(host)) return null;

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
  if (lastInstance?.getSnapshot) return lastInstance.getSnapshot();

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

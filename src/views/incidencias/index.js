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
  CREATE_ACTIONS,
  getCreateFormDefaults,
  validateCreateForm,
} from "./incidencias.template.create.js";

import {
  DETAIL_ACTIONS,
  validateDetailUpdate,
} from "./incidencias.template.modal.js";

export const INCIDENCIAS_INDEX_VERSION = "incidencias.index.fast.v2";
export const INCIDENCIAS_VIEW_VERSION = INCIDENCIAS_INDEX_VERSION;

const DEFAULT_VISIBLE_LIMIT = 20;
const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE_MS = 220;

const ROUTER_EVENT_HANDLED_KEY = "__onionRouterHandled";

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
  for (const value of values) {
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

function upsertByTicketId(items = [], item = null) {
  const next = safeObject(item, null);

  if (!next) return safeArray(items);

  const id = getTicketId(next);

  if (!id) return safeArray(items);

  const map = new Map();

  map.set(id, next);

  for (const current of safeArray(items)) {
    const currentId = getTicketId(current);

    if (!currentId || map.has(currentId)) continue;

    map.set(currentId, current);
  }

  return [...map.values()].sort((a, b) => {
    const left = Date.parse(a.lastActivityAt || a.updatedAt || a.createdAt || 0);
    const right = Date.parse(b.lastActivityAt || b.updatedAt || b.createdAt || 0);

    return right - left;
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

  return {
    id,
    userId: id,
    displayName: name,
    name,
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

  function focusAfterRender(selector = "", placeEnd = true) {
    if (!selector || !host) return false;

    try {
      const node = host.querySelector(selector);

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
    };
  }

  function cancelScheduledRender() {
    if (!renderFrame) return false;

    cancelFrame(renderFrame);
    renderFrame = 0;
    pendingRenderOptions = null;

    return true;
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderIncidenciasTemplate(payload());

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

    host.innerHTML = renderIncidenciasLoadingState(payload());

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

    syncBodyModalClass(false);

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

    render({
      focusSelector: "[data-field='subject']",
    });

    return true;
  }

  function closeCreateModal() {
    if (createModal.submitting) return false;

    clearUserSearchTimer();
    userSearchSeq += 1;

    resetCreateModal();

    render();
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

      render({
        focusSelector: "[data-create-user-search-input]",
      });

      return true;
    } catch (searchError) {
      if (destroyed || seq !== userSearchSeq) return false;

      createModal.userSearch.results = [];
      createModal.userSearch.loading = false;
      createModal.userSearch.empty = false;
      createModal.userSearch.error = safeError(searchError, "No se pudieron buscar usuarios.");

      render({
        focusSelector: "[data-create-user-search-input]",
      });

      return false;
    }
  }

  function handleUserSearch(value = "") {
    const query = cleanText(value, "");
    const seq = ++userSearchSeq;

    clearUserSearchTimer();

    createModal.userSearch.query = query;
    createModal.userSearch.error = "";
    createModal.userSearch.results = [];
    createModal.userSearch.empty = false;

    if (!isAdmin() || query.length < USER_SEARCH_MIN_LENGTH) {
      createModal.userSearch.loading = false;

      render({
        focusSelector: "[data-create-user-search-input]",
      });

      return true;
    }

    createModal.userSearch.loading = true;

    render({
      focusSelector: "[data-create-user-search-input]",
    });

    userSearchTimer = window.setTimeout(() => {
      userSearchTimer = 0;
      void runUserSearch(query, seq);
    }, USER_SEARCH_DEBOUNCE_MS);

    return true;
  }

  function selectCreateUser(node = null) {
    const userId = cleanText(node?.dataset?.userId, "");
    const userName = cleanText(node?.dataset?.userName, "");
    const userAvatar = cleanText(node?.dataset?.userAvatar, "");

    if (!userId) return false;

    createModal.form = {
      ...createModal.form,
      targetUserId: userId,
      targetUserName: userName,
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
        avatarUrl: userAvatar,
      },
      empty: false,
    };

    render();
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

    render({
      focusSelector: "[data-create-user-search-input]",
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

    render();

    return true;
  }

  function removeCreateAttachment(index = -1) {
    if (index < 0) return false;

    createModal.form.attachments = safeArray(createModal.form.attachments).filter(
      (_, currentIndex) => currentIndex !== index
    );

    render();
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
      render({
        focusSelector:
          createModal.errors.subject
            ? "[data-field='subject']"
            : createModal.errors.description
              ? "[data-field='description']"
              : "",
      });

      return false;
    }

    createModal.submitting = true;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";

    render();

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

      render({
        focusSelector: "[data-field='subject']",
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

      detailModal.open = true;
      detailModal.detail = detail || local;
      detailModal.submitting = false;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
      detailModal.previewFile = null;

      if (detail) {
        items = upsertByTicketId(items, detail);
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

    if (actionNode && host?.contains(actionNode)) {
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

    if (!field) return;

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

    if (!field) return;

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

    if (!form || !host?.contains(form)) return;

    if (form.matches("#incidencias-create-form, [data-incidencias-create-form='true']")) {
      event.preventDefault();
      event.stopPropagation();
      event[ROUTER_EVENT_HANDLED_KEY] = true;

      void submitCreate(form);
    }
  }

  function onKeydown(event) {
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

    if (!dropzone || !host?.contains(dropzone) || !createModal.open) return;

    event.preventDefault();

    if (!createModal.dragActive) {
      createModal.dragActive = true;
      render();
    }
  }

  function onDragLeave(event) {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");

    if (!dropzone || !host?.contains(dropzone) || !createModal.open) return;

    const related = event.relatedTarget;

    if (related && dropzone.contains(related)) return;

    createModal.dragActive = false;
    render();
  }

  function onDrop(event) {
    const dropzone = event.target?.closest?.("[data-dropzone='attachments']");

    if (!dropzone || !host?.contains(dropzone) || !createModal.open) return;

    event.preventDefault();

    createModal.dragActive = false;
    addCreateAttachments(Array.from(event.dataTransfer?.files || []));
  }

  function bind() {
    host?.addEventListener?.("click", onClick);
    host?.addEventListener?.("input", onInput);
    host?.addEventListener?.("change", onChange);
    host?.addEventListener?.("submit", onSubmit);
    host?.addEventListener?.("keydown", onKeydown);
    host?.addEventListener?.("dragover", onDragOver);
    host?.addEventListener?.("dragleave", onDragLeave);
    host?.addEventListener?.("drop", onDrop);

    return true;
  }

  function unbind() {
    host?.removeEventListener?.("click", onClick);
    host?.removeEventListener?.("input", onInput);
    host?.removeEventListener?.("change", onChange);
    host?.removeEventListener?.("submit", onSubmit);
    host?.removeEventListener?.("keydown", onKeydown);
    host?.removeEventListener?.("dragover", onDragOver);
    host?.removeEventListener?.("dragleave", onDragLeave);
    host?.removeEventListener?.("drop", onDrop);

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

      unbind();

      resetCreateModal();
      resetDetailModal();
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

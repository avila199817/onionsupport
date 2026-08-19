/* =========================================================
   Onion Support - Incidencias Index
   Archivo: /src/views/incidencias/index.js

   PRODUCTIVO · MODAL DETAIL 10/10 · PREVIEW UX · V14

   Contrato:
   - Controlador de la vista Incidencias.
   - Sin fetch propio: todas las llamadas salen por incidencias.api.js.
   - Crear incidencia con adjuntos reales File/Blob.
   - Admin: crear incidencia para targetUserId real.
   - Modal en isla propia para no destruir estado del listado.
   - Detail modal compatible con incidencias.template.modal.js V15.
   - Protege borradores del detalle antes de cerrar.
   - Focus trap real para create/detail.
   - Restaura el foco al elemento que abrió el modal.
   - Escape cierra primero preview; luego modal.
   - Ver adjunto revela la preview inmediatamente dentro del modal.
   - Preview protegida contra respuestas SAS fuera de orden.
   - Preserva comentarios multilínea mientras se escribe.
   - Evita re-subir adjuntos si una actualización falla después del upload.
   - Advierte ante refresh/cierre de pestaña con borrador sin enviar.
   - No aplana arrays de dominio con first().
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  listIncidencias,
  hydrateIncidenciasFromCache,
  createIncidencia,
  updateIncidencia,
  loadIncidenciaDetail,
  commentIncidencia,
  reopenIncidencia,
  closeIncidencia,
  uploadIncidenciaAttachments,
  openIncidenciaAttachment,
  downloadIncidenciaAttachment,
  deleteIncidenciaAttachment,
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
  getDetailTemplateSnapshot,
} from "./incidencias.template.modal.js";

import {
  normalizeIncidenciaStatus,
  normalizeIncidenciaPriority,
  normalizeIncidenciaCategory,
} from "./incidencias.options.js";

export const INCIDENCIAS_INDEX_VERSION =
  "incidencias.index.extreme.v32.single-detail-submit";

export const INCIDENCIAS_VIEW_VERSION =
  INCIDENCIAS_INDEX_VERSION;

const DEFAULT_VISIBLE_LIMIT = 20;
const DEFAULT_SORT_ORDER = "desc";
const DEFAULT_SORT_MODE = "date";

const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE_MS = 220;

const ROUTER_EVENT_HANDLED_KEY =
  "__onionRouterHandled";

const MODAL_HOST_SELECTOR =
  "[data-incidencias-modal-host='true']";

const CREATE_ROOT_SELECTOR =
  "[data-incidencias-create-root='true']";

const DETAIL_ROOT_SELECTOR =
  "[data-incidencias-modal-root='true']";

const CREATE_MODAL_PANEL_SELECTOR =
  "[data-incidencias-create-modal-panel='true']";

const DETAIL_MODAL_PANEL_SELECTOR =
  "[data-incidencias-modal-panel='true']";

const CREATE_MODAL_OVERLAY_SELECTOR =
  "[data-incidencias-create-modal-overlay='true']";

const DETAIL_MODAL_OVERLAY_SELECTOR =
  "[data-incidencias-modal-overlay='true']";

const DETAIL_PREVIEW_SELECTOR =
  "[data-modal-preview='true']";

const DETAIL_PREVIEW_SLOT_SELECTOR =
  "[data-modal-preview-slot='true']";

const DETAIL_PREVIEW_CLOSE_SELECTOR =
  `[data-detail-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"]`;

const DETAIL_CLOSE_CONFIRM_SELECTOR =
  "[data-detail-close-confirm-dialog='true']";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const INSTANCES = new WeakMap();
let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isDomNode(value = null) {
  return Boolean(
    typeof Node !== "undefined" &&
      value &&
      value instanceof Node
  );
}

function isBlob(value) {
  return Boolean(
    typeof Blob !== "undefined" &&
      value instanceof Blob
  );
}

function isFile(value) {
  return Boolean(
    typeof File !== "undefined" &&
      value instanceof File
  );
}

function isFileLike(value = null) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  if (
    isFile(value) ||
    isBlob(value)
  ) {
    return true;
  }

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
  if (Array.isArray(value)) {
    return value;
  }

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

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

function multilineValue(
  value = ""
) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/*
   Importante:
   NO usar flat(Infinity) aquí.
   Arrays de adjuntos/historial/comentarios son valores completos.
*/
function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

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

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles =
      value
        .map(normalizeRole)
        .filter(Boolean);

    if (roles.includes("admin")) {
      return "admin";
    }

    if (roles.includes("user")) {
      return "user";
    }

    return "";
  }

  const role =
    cleanText(value, "")
      .toLowerCase();

  if (
    [
      "admin",
      "administrator",
      "administrador",
      "owner",
      "superadmin",
      "super_admin",
      "root",
    ].includes(role)
  ) {
    return "admin";
  }

  if (
    [
      "user",
      "usuario",
      "client",
      "cliente",
    ].includes(role)
  ) {
    return "user";
  }

  return role || "";
}

function normalizeSortOrder(
  value = ""
) {
  const order =
    cleanText(
      value,
      DEFAULT_SORT_ORDER
    ).toLowerCase();

  if (
    [
      "asc",
      "ascending",
      "menor",
      "menor_mayor",
      "menor-a-mayor",
      "menor_a_mayor",
      "oldest",
    ].includes(order)
  ) {
    return "asc";
  }

  return "desc";
}

function getNextSortOrder(
  value = DEFAULT_SORT_ORDER
) {
  return (
    normalizeSortOrder(value) === "asc"
      ? "desc"
      : "asc"
  );
}

function safeError(
  error = null,
  fallback =
    "No se pudieron cargar las incidencias."
) {
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
  const raw =
    safeObject(item);

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

function shouldPreserveExisting(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return true;
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    return true;
  }

  if (
    Array.isArray(value) &&
    value.length === 0
  ) {
    return true;
  }

  if (
    isObject(value) &&
    Object.keys(value).length === 0
  ) {
    return true;
  }

  return false;
}

function mergeTicketData(
  current = {},
  next = {}
) {
  const base =
    safeObject(current, {});

  const incoming =
    safeObject(next, {});

  const output = {
    ...base,
  };

  for (
    const [key, value]
    of Object.entries(incoming)
  ) {
    const previous =
      output[key];

    if (
      isObject(previous) &&
      isObject(value)
    ) {
      output[key] =
        mergeTicketData(
          previous,
          value
        );

      continue;
    }

    output[key] =
      (
        shouldPreserveExisting(value) &&
        previous !== undefined &&
        previous !== null
      )
        ? previous
        : value;
  }

  return output;
}

function ticketSortTime(
  item = {}
) {
  const raw =
    safeObject(item);

  const timestamp =
    Date.parse(
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

  return Number.isFinite(timestamp)
    ? timestamp
    : 0;
}

function upsertByTicketId(
  items = [],
  item = null
) {
  const next =
    safeObject(
      item,
      null
    );

  if (!next) {
    return safeArray(items);
  }

  const id =
    getTicketId(next);

  if (!id) {
    return safeArray(items);
  }

  const map =
    new Map();

  const existing =
    safeArray(items)
      .find(
        (current) =>
          getTicketId(current) === id
      ) || null;

  map.set(
    id,
    existing
      ? mergeTicketData(
          existing,
          next
        )
      : next
  );

  for (
    const current
    of safeArray(items)
  ) {
    const currentId =
      getTicketId(current);

    if (
      !currentId ||
      map.has(currentId)
    ) {
      continue;
    }

    map.set(
      currentId,
      current
    );
  }

  return [...map.values()]
    .sort((a, b) => {
      const diff =
        ticketSortTime(b) -
        ticketSortTime(a);

      if (diff !== 0) {
        return diff;
      }

      return getTicketId(b)
        .localeCompare(
          getTicketId(a),
          "es",
          {
            numeric: true,
            sensitivity: "base",
          }
        );
    });
}


function replaceByTicketId(
  items = [],
  item = null
) {
  const next =
    safeObject(
      item,
      null
    );

  if (!next) {
    return safeArray(items);
  }

  const id =
    getTicketId(next);

  if (!id) {
    return safeArray(items);
  }

  let found = false;

  const output =
    safeArray(items).map((current) => {
      if (getTicketId(current) !== id) {
        return current;
      }

      found = true;
      return next;
    });

  if (!found) {
    output.push(next);
  }

  return output.sort((a, b) => {
    const diff =
      ticketSortTime(b) -
      ticketSortTime(a);

    if (diff !== 0) {
      return diff;
    }

    return getTicketId(b)
      .localeCompare(
        getTicketId(a),
        "es",
        {
          numeric: true,
          sensitivity: "base",
        }
      );
  });
}

function nextFrame(callback) {
  if (!isBrowser()) {
    return 0;
  }

  if (
    typeof window.requestAnimationFrame ===
    "function"
  ) {
    return window.requestAnimationFrame(
      callback
    );
  }

  return window.setTimeout(
    callback,
    0
  );
}

function cancelFrame(id = 0) {
  if (
    !id ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    if (
      typeof window.cancelAnimationFrame ===
      "function"
    ) {
      window.cancelAnimationFrame(id);
    }

    window.clearTimeout?.(id);
    return true;
  } catch {
    return false;
  }
}

function isElementVisible(
  element = null
) {
  if (
    !element ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    if (
      element.hidden ||
      element.getAttribute?.("aria-hidden") ===
        "true"
    ) {
      return false;
    }

    const style =
      window.getComputedStyle?.(element);

    if (
      style?.display === "none" ||
      style?.visibility === "hidden"
    ) {
      return false;
    }

    return (
      element.getClientRects?.().length > 0
    );
  } catch {
    return true;
  }
}

function focusableElements(
  root = null
) {
  if (
    !root ||
    !isBrowser()
  ) {
    return [];
  }

  try {
    return Array.from(
      root.querySelectorAll(
        FOCUSABLE_SELECTOR
      )
    ).filter((node) => {
      if (
        node.disabled ||
        node.getAttribute?.("aria-disabled") ===
          "true"
      ) {
        return false;
      }

      return isElementVisible(node);
    });
  } catch {
    return [];
  }
}

/* =========================================================
   DETAIL TEMPLATE LIMITS
========================================================= */

function getDetailLimits() {
  try {
    const snapshot =
      getDetailTemplateSnapshot?.();

    const limits =
      safeObject(
        snapshot?.limits,
        {}
      );

    return {
      maxCommentLength:
        Number(
          limits.maxCommentLength
        ) || 4000,

      maxPendingFiles:
        Number(
          limits.maxPendingFiles
        ) || 10,

      maxPendingFileSize:
        Number(
          limits.maxPendingFileSize
        ) ||
        100 * 1024 * 1024,
    };
  } catch {
    return {
      maxCommentLength: 4000,
      maxPendingFiles: 10,
      maxPendingFileSize:
        100 * 1024 * 1024,
    };
  }
}

const DETAIL_LIMITS =
  Object.freeze(
    getDetailLimits()
  );

/* =========================================================
   CORE / AUTH
========================================================= */

function getState() {
  try {
    return (
      AppCore.getState?.() ||
      AppCore.state ||
      {}
    );
  } catch {
    return (
      AppCore.state ||
      {}
    );
  }
}

function getCurrentUser() {
  const state =
    getState();

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

function getCurrentRole() {
  const state =
    getState();

  const user =
    safeObject(
      getCurrentUser(),
      {}
    );

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
    ) ||
    "user"
  );
}

function isAdmin() {
  return (
    getCurrentRole() === "admin"
  );
}

function getRoutes() {
  return {
    incidencias:
      ROUTES.incidencias ||
      "/incidencias",

    facturas:
      ROUTES.facturas ||
      "/facturas",

    clientes:
      ROUTES.clientes ||
      "/clientes",

    usuarios:
      ROUTES.usuarios ||
      "/usuarios",

    servidor:
      ROUTES.servidor ||
      "/servidor",
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

function readField(
  form = null,
  name = ""
) {
  if (
    !form ||
    !name
  ) {
    return "";
  }

  const field =
    form.querySelector?.(
      `[data-field="${name}"], [name="${name}"]`
    );

  if (!field) {
    return "";
  }

  return cleanText(
    field.value,
    ""
  );
}

function filesFromInput(
  input = null
) {
  try {
    return Array.from(
      input?.files ||
      []
    ).filter(isFileLike);
  } catch {
    return [];
  }
}

function filesFromForm(
  form = null
) {
  if (!form) {
    return [];
  }

  const input =
    form.querySelector?.(
      `[data-field="attachments"], input[name="attachments"], input[type="file"]`
    );

  return filesFromInput(input);
}

function dedupeFiles(
  files = []
) {
  const map =
    new Map();

  for (
    const file
    of safeArray(files).flat()
  ) {
    if (!isFileLike(file)) {
      continue;
    }

    const key =
      [
        file.name ||
          "archivo",

        file.size ||
          0,

        file.lastModified ||
          0,

        file.type ||
          "",
      ].join("::");

    if (!map.has(key)) {
      map.set(
        key,
        file
      );
    }
  }

  return [...map.values()];
}

function fileIndexFromNode(
  node = null
) {
  const value =
    node?.dataset?.removeAttachment ||
    node?.dataset?.fileIndex ||
    "";

  const index =
    Number(value);

  return Number.isFinite(index)
    ? index
    : -1;
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function storeInstance(
  host = null,
  controller = null
) {
  if (
    !host ||
    !controller
  ) {
    return false;
  }

  INSTANCES.set(
    host,
    controller
  );

  lastInstance =
    controller;

  return true;
}

function clearInstance(
  host = null,
  controller = null
) {
  if (
    host &&
    INSTANCES.get(host) ===
      controller
  ) {
    INSTANCES.delete(host);
  }

  if (
    lastInstance === controller
  ) {
    lastInstance = null;
  }

  return true;
}

function destroyPrevious(
  host = null
) {
  const previous =
    host
      ? INSTANCES.get(host)
      : null;

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

function createIncidenciasController(
  host = null,
  context = {}
) {
  const cached =
    hydrateIncidenciasFromCache();

  let destroyed = false;
  let mounted = false;

  let items =
    safeArray(cached.items);

  let total =
    Number(
      cached.total ||
      items.length
    ) ||
    items.length;

  let loading = false;
  let refreshing = false;
  let creating = false;
  let loadingMore = false;

  let error = "";
  let filter = "all";
  let search = "";
  let sortOrder =
    DEFAULT_SORT_ORDER;

  let sortMode =
    DEFAULT_SORT_MODE;

  let visibleLimit =
    DEFAULT_VISIBLE_LIMIT;

  let openingTicketId = "";

  let renderFrame = 0;
  let modalFrame = 0;
  let modalHost = null;
  let modalHostBound = false;

  let loadSeq = 0;
  let userSearchSeq = 0;
  let userSearchTimer = 0;
  let attachmentPreviewSeq = 0;

  let loadController = null;
  let detailController = null;
  let detailLoadSeq = 0;

  /*
     Elemento al que devolvemos el foco al cerrar el modal.
     No guardamos selectores ni IDs sensibles; sólo referencia DOM viva.
  */
  let modalReturnFocus = null;

  const createModal = {
    open: false,
    submitting: false,
    dragActive: false,

    serverError: "",
    successMessage: "",
    createdTicketId: "",

    errors: {},

    form:
      getCreateDefaults(),

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
    operation: "",
    closeConfirmOpen: false,

    commentDraft: "",
    pendingFiles: [],
    adminDraft: null,

    feedbackMessage: "",
    feedbackType: "info",

    openingAttachmentId: "",
    downloadingAttachmentId: "",
    deletingAttachmentId: "",

    previewFile: null,
    historyOpen: false,
  };

  /* =======================================================
     MODAL STATE
  ======================================================= */

  function ownsNode(
    node = null
  ) {
    if (!node) {
      return false;
    }

    return Boolean(
      host?.contains?.(node) ||
      modalHost?.contains?.(node)
    );
  }

  function detailHasDraft() {
    return Boolean(
      multilineValue(
        detailModal.commentDraft
      ).trim() ||
      safeArray(
        detailModal.pendingFiles
      ).length ||
      hasPendingAdminChanges()
    );
  }

  function rememberModalReturnFocus() {
    if (!isBrowser()) {
      return false;
    }

    if (modalsOpen()) {
      return false;
    }

    const active =
      document.activeElement;

    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !modalHost?.contains?.(active)
    ) {
      modalReturnFocus =
        active;
    }

    return true;
  }

  function restoreModalReturnFocus() {
    if (!isBrowser()) {
      modalReturnFocus = null;
      return false;
    }

    const target =
      modalReturnFocus;

    modalReturnFocus = null;

    if (
      !target ||
      !target.isConnected ||
      typeof target.focus !== "function"
    ) {
      return false;
    }

    nextFrame(() => {
      try {
        target.focus({
          preventScroll: true,
        });
      } catch {
        try {
          target.focus();
        } catch {
          // noop
        }
      }
    });

    return true;
  }

  function confirmDiscardDetailDraft() {
    if (
      !detailHasDraft()
    ) {
      return true;
    }

    if (!isBrowser()) {
      return false;
    }

    try {
      return window.confirm(
        "Tienes cambios sin guardar. Si cierras ahora, perderás el comentario, los archivos seleccionados o los cambios de gestión del ticket. ¿Quieres descartarlos?"
      );
    } catch {
      return false;
    }
  }

  function currentModalPanel() {
    if (
      !modalHost?.isConnected
    ) {
      return null;
    }

    if (detailModal.open) {
      if (detailModal.closeConfirmOpen) {
        return (
          modalHost.querySelector(DETAIL_CLOSE_CONFIRM_SELECTOR) ||
          modalHost.querySelector(DETAIL_MODAL_PANEL_SELECTOR)
        );
      }

      return modalHost.querySelector(
        DETAIL_MODAL_PANEL_SELECTOR
      );
    }

    if (createModal.open) {
      return modalHost.querySelector(
        CREATE_MODAL_PANEL_SELECTOR
      );
    }

    return null;
  }

  function trapFocus(event) {
    if (
      event?.key !== "Tab" ||
      !modalsOpen()
    ) {
      return false;
    }

    const panel =
      currentModalPanel();

    if (!panel) {
      return false;
    }

    const focusables =
      focusableElements(panel);

    if (!focusables.length) {
      event.preventDefault();

      try {
        panel.focus({
          preventScroll: true,
        });
      } catch {
        panel.focus?.();
      }

      return true;
    }

    const firstNode =
      focusables[0];

    const lastNode =
      focusables[
        focusables.length - 1
      ];

    const active =
      document.activeElement;

    if (
      !panel.contains(active)
    ) {
      event.preventDefault();

      (
        event.shiftKey
          ? lastNode
          : firstNode
      ).focus?.();

      return true;
    }

    if (
      event.shiftKey &&
      active === firstNode
    ) {
      event.preventDefault();
      lastNode.focus?.();
      return true;
    }

    if (
      !event.shiftKey &&
      active === lastNode
    ) {
      event.preventDefault();
      firstNode.focus?.();
      return true;
    }

    return false;
  }

  function onBeforeUnload(event) {
    if (
      !detailModal.open ||
      !detailHasDraft() ||
      detailModal.submitting
    ) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  }

  /* =======================================================
     PAYLOADS
  ======================================================= */

  function payload(extra = {}) {
    return {
      user:
        getCurrentUser(),

      role:
        getCurrentRole(),

      admin:
        isAdmin(),

      routes:
        getRoutes(),

      context:
        safeObject(context),

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
      sortMode,
      visibleLimit,
      openingTicketId,

      stats:
        computeIncidenciasStats(
          items
        ),

      createModal,
      detailModal,

      ...extra,
    };
  }

  function viewPayload(extra = {}) {
    return payload({
      canonical: true,
      items,
      createModal: { ...createModal, open: false },
      detailModal: { ...detailModal, open: false },
      ...extra,
    });
  }

  function createModalPayload() {
    return {
      ...createModal,

      admin:
        isAdmin(),

      role:
        getCurrentRole(),
    };
  }

  function detailModalPayload() {
    return {
      ...detailModal,

      admin:
        isAdmin(),

      role:
        getCurrentRole(),
    };
  }

  function modalsOpen() {
    return Boolean(
      createModal.open ||
      detailModal.open
    );
  }

  function syncBodyModalClass() {
    if (!isBrowser()) {
      return false;
    }

    try {
      document.body?.classList.toggle(
        "modal-open",
        modalsOpen()
      );

      document.body?.classList.toggle(
        "incidencias-modal-open",
        modalsOpen()
      );

      document.body?.classList.toggle(
        "incidencias-create-open",
        createModal.open
      );

      document.body?.classList.toggle(
        "incidencias-detail-open",
        detailModal.open
      );

      document.body?.classList.toggle(
        "incidencias-detail-dirty",
        detailModal.open &&
          detailHasDraft()
      );

      return true;
    } catch {
      return false;
    }
  }

  /* =======================================================
     MODAL HOST / FOCUS
  ======================================================= */

  function ensureModalHost() {
    if (!isBrowser()) {
      return null;
    }

    if (
      modalHost?.isConnected
    ) {
      return modalHost;
    }

    modalHost =
      document.querySelector(
        MODAL_HOST_SELECTOR
      ) ||
      document.createElement("div");

    modalHost.setAttribute(
      "data-incidencias-modal-host",
      "true"
    );

    modalHost.setAttribute(
      "data-owner",
      INCIDENCIAS_VIEW_VERSION
    );

    if (!modalHost.isConnected) {
      document.body.appendChild(
        modalHost
      );
    }

    if (
      mounted &&
      !modalHostBound
    ) {
      bindTarget(modalHost);
      modalHostBound = true;
    }

    return modalHost;
  }

  function removeModalHost() {
    if (!modalHost) {
      return false;
    }

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

  function focusAfterRender(
    selector = "",
    root = modalHost || host
  ) {
    if (
      !selector ||
      !root
    ) {
      return false;
    }

    try {
      const node =
        root.querySelector(
          selector
        );

      if (!node) {
        return false;
      }

      node.focus({
        preventScroll: true,
      });

      if (
        typeof node.setSelectionRange ===
        "function"
      ) {
        const end =
          String(
            node.value ||
            ""
          ).length;

        node.setSelectionRange(
          end,
          end
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function prefersReducedMotion() {
    if (!isBrowser()) {
      return true;
    }

    try {
      return Boolean(
        window.matchMedia?.(
          "(prefers-reduced-motion: reduce)"
        )?.matches
      );
    } catch {
      return true;
    }
  }

  function revealDetailPreview({
    focus = true,
  } = {}) {
    if (
      !isBrowser() ||
      destroyed ||
      !detailModal.open ||
      !detailModal.previewFile ||
      !modalHost?.isConnected
    ) {
      return false;
    }

    const root =
      modalHost.querySelector(
        DETAIL_ROOT_SELECTOR
      );

    const preview =
      root?.querySelector?.(
        DETAIL_PREVIEW_SELECTOR
      ) ||
      root?.querySelector?.(
        DETAIL_PREVIEW_SLOT_SELECTOR
      ) ||
      null;

    if (!preview) {
      return false;
    }

    try {
      preview.scrollIntoView?.({
        behavior:
          prefersReducedMotion()
            ? "auto"
            : "smooth",

        block: "center",
        inline: "nearest",
      });
    } catch {
      try {
        preview.scrollIntoView?.();
      } catch {
        // noop
      }
    }

    if (!focus) {
      return true;
    }

    const focusTarget =
      preview.querySelector?.(
        DETAIL_PREVIEW_CLOSE_SELECTOR
      ) ||
      preview;

    if (
      focusTarget === preview &&
      !preview.hasAttribute?.("tabindex")
    ) {
      preview.setAttribute?.(
        "tabindex",
        "-1"
      );
    }

    nextFrame(() => {
      if (
        destroyed ||
        !detailModal.open ||
        !detailModal.previewFile ||
        !focusTarget?.isConnected
      ) {
        return;
      }

      try {
        focusTarget.focus?.({
          preventScroll: true,
        });
      } catch {
        try {
          focusTarget.focus?.();
        } catch {
          // noop
        }
      }
    });

    return true;
  }


  function revealDetailHistory({
    focus = true,
  } = {}) {
    if (
      !isBrowser() ||
      destroyed ||
      !detailModal.open ||
      !modalHost?.isConnected
    ) {
      return false;
    }

    const root =
      modalHost.querySelector(
        DETAIL_ROOT_SELECTOR
      );

    const history =
      root?.querySelector?.(
        "[data-modal-history-slot='true']"
      ) ||
      null;

    if (!history) {
      return false;
    }

    try {
      history.scrollIntoView?.({
        behavior:
          prefersReducedMotion()
            ? "auto"
            : "smooth",
        block: "start",
        inline: "nearest",
      });
    } catch {
      try {
        history.scrollIntoView?.();
      } catch {
        // noop
      }
    }

    if (!focus) {
      return true;
    }

    const toggle =
      history.querySelector?.(
        `[data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"]`
      );

    nextFrame(() => {
      try {
        toggle?.focus?.({
          preventScroll: true,
        });
      } catch {
        toggle?.focus?.();
      }
    });

    return true;
  }

  function activeElementInside(
    root = null
  ) {
    if (
      !isBrowser() ||
      !root
    ) {
      return null;
    }

    const active =
      document.activeElement;

    if (
      !active ||
      active === document.body ||
      active === document.documentElement
    ) {
      return null;
    }

    try {
      return root.contains(active)
        ? active
        : null;
    } catch {
      return null;
    }
  }

  function cloneTemplateRoot(
    html = "",
    selector = ""
  ) {
    if (
      !html ||
      !selector ||
      !isBrowser()
    ) {
      return null;
    }

    try {
      const template =
        document.createElement(
          "template"
        );

      template.innerHTML =
        String(html).trim();

      return template.content
        .querySelector(
          selector
        );
    } catch {
      return null;
    }
  }

  function syncAttributes(
    target = null,
    source = null
  ) {
    if (
      !target ||
      !source
    ) {
      return false;
    }

    try {
      for (
        const attribute
        of Array.from(
          target.attributes ||
          []
        )
      ) {
        if (
          !source.hasAttribute(
            attribute.name
          )
        ) {
          target.removeAttribute(
            attribute.name
          );
        }
      }

      for (
        const attribute
        of Array.from(
          source.attributes ||
          []
        )
      ) {
        if (
          target.getAttribute(
            attribute.name
          ) !==
          attribute.value
        ) {
          target.setAttribute(
            attribute.name,
            attribute.value
          );
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function replacePart(
    currentRoot = null,
    nextRoot = null,
    selector = "",
    options = {}
  ) {
    if (
      !currentRoot ||
      !nextRoot ||
      !selector
    ) {
      return false;
    }

    const current =
      currentRoot.querySelector(
        selector
      );

    const next =
      nextRoot.querySelector(
        selector
      );

    if (
      !current &&
      !next
    ) {
      return true;
    }

    if (
      !current &&
      next
    ) {
      return false;
    }

    const active =
      activeElementInside(
        current
      );

    if (
      active &&
      options.preserveFocus !== false
    ) {
      syncAttributes(
        current,
        next || current
      );

      return true;
    }

    if (!next) {
      current.remove();
      return true;
    }

    current.replaceWith(
      next.cloneNode(true)
    );

    return true;
  }

  function syncInputValue(
    currentRoot = null,
    nextRoot = null,
    selector = ""
  ) {
    if (
      !currentRoot ||
      !nextRoot ||
      !selector
    ) {
      return false;
    }

    const current =
      currentRoot.querySelector(
        selector
      );

    const next =
      nextRoot.querySelector(
        selector
      );

    if (
      !current ||
      !next
    ) {
      return false;
    }

    try {
      if (
        current.type === "file"
      ) {
        return true;
      }

      const active =
        activeElementInside(
          currentRoot
        );

      if (
        active === current
      ) {
        return true;
      }

      current.value =
        next.value;

      syncAttributes(
        current,
        next
      );

      return true;
    } catch {
      return false;
    }
  }

  /* =======================================================
     LIST PATCHING
     Hot interactions never replace the active search input or the full view.
  ======================================================= */

  function syncListSearch(currentRoot = null, nextRoot = null) {
    const currentSearch = currentRoot?.querySelector?.(".incidencias-search");
    const nextSearch = nextRoot?.querySelector?.(".incidencias-search");
    if (!currentSearch || !nextSearch) return false;

    const currentInput = currentSearch.querySelector("[data-incidencias-search-input='true']");
    const nextInput = nextSearch.querySelector("[data-incidencias-search-input='true']");
    if (currentInput && nextInput && document.activeElement !== currentInput) {
      currentInput.value = nextInput.value;
      syncAttributes(currentInput, nextInput);
    }

    const currentClear = currentSearch.querySelector(".incidencias-search-clear");
    const nextClear = nextSearch.querySelector(".incidencias-search-clear");
    if (!currentClear && nextClear) currentSearch.appendChild(nextClear.cloneNode(true));
    else if (currentClear && !nextClear) currentClear.remove();
    else if (currentClear && nextClear) syncAttributes(currentClear, nextClear);

    return true;
  }

  function patchListDom(html = "") {
    if (!html || !host?.isConnected) return false;

    const currentRoot = host.querySelector("[data-incidencias-scope='true']");
    const nextRoot = cloneTemplateRoot(html, "[data-incidencias-scope='true']");
    if (!currentRoot || !nextRoot) return false;

    try {
      syncAttributes(currentRoot, nextRoot);
      syncListSearch(currentRoot, nextRoot);

      for (const selector of [
        ".incidencias-history-copy",
        ".incidencias-filter-pills",
        ".incidencias-sort-pills",
        "[data-incidencias-table-wrap='true']",
      ]) {
        if (!replacePart(currentRoot, nextRoot, selector, { preserveFocus: false })) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /* =======================================================
     CREATE MODAL PATCHING
  ======================================================= */

  function syncCreateAlerts(
    currentRoot = null,
    nextRoot = null
  ) {
    const currentBody =
      currentRoot?.querySelector?.(
        ".inc-create-body"
      );

    const nextBody =
      nextRoot?.querySelector?.(
        ".inc-create-body"
      );

    if (
      !currentBody ||
      !nextBody
    ) {
      return false;
    }

    try {
      currentBody
        .querySelectorAll(
          ":scope > .inc-create-alert"
        )
        .forEach(
          (node) =>
            node.remove()
        );

      const form =
        currentBody.querySelector(
          ".inc-create-form"
        );

      const nextAlerts =
        Array.from(
          nextBody.querySelectorAll(
            ":scope > .inc-create-alert"
          )
        );

      for (
        const alert
        of nextAlerts
      ) {
        currentBody.insertBefore(
          alert.cloneNode(true),
          form ||
            currentBody.firstChild
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function syncCreateLoadingOverlay(
    currentRoot = null,
    nextRoot = null
  ) {
    const currentPanel =
      currentRoot?.querySelector?.(
        CREATE_MODAL_PANEL_SELECTOR
      );

    const nextPanel =
      nextRoot?.querySelector?.(
        CREATE_MODAL_PANEL_SELECTOR
      );

    if (
      !currentPanel ||
      !nextPanel
    ) {
      return false;
    }

    try {
      currentPanel
        .querySelectorAll(
          ":scope > .inc-create-loading-overlay"
        )
        .forEach(
          (node) =>
            node.remove()
        );

      const nextOverlay =
        nextPanel.querySelector(
          ":scope > .inc-create-loading-overlay"
        );

      if (nextOverlay) {
        currentPanel.appendChild(
          nextOverlay.cloneNode(true)
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function patchCreateModalDom(
    createHtml = "",
    options = {}
  ) {
    if (
      !createHtml ||
      !modalHost?.isConnected ||
      options.fullRender === true
    ) {
      return false;
    }

    const currentRoot =
      modalHost.querySelector(
        CREATE_ROOT_SELECTOR
      );

    const nextRoot =
      cloneTemplateRoot(
        createHtml,
        CREATE_ROOT_SELECTOR
      );

    if (
      !currentRoot ||
      !nextRoot
    ) {
      return false;
    }

    try {
      const currentPanel =
        currentRoot.querySelector(
          CREATE_MODAL_PANEL_SELECTOR
        );

      const nextPanel =
        nextRoot.querySelector(
          CREATE_MODAL_PANEL_SELECTOR
        );

      const currentForm =
        currentRoot.querySelector(
          ".inc-create-form"
        );

      const nextForm =
        nextRoot.querySelector(
          ".inc-create-form"
        );

      const currentBlock =
        currentRoot.querySelector(
          ".inc-create-block--target"
        );

      const nextBlock =
        nextRoot.querySelector(
          ".inc-create-block--target"
        );

      syncAttributes(
        currentRoot,
        nextRoot
      );

      syncAttributes(
        currentPanel,
        nextPanel
      );

      syncAttributes(
        currentForm,
        nextForm
      );

      syncAttributes(
        currentBlock,
        nextBlock
      );

      syncCreateAlerts(
        currentRoot,
        nextRoot
      );

      for (
        const selector
        of [
          ".inc-create-selected-user-slot",
          ".inc-create-user-search-slot",
          ".inc-create-target-error-slot",
          ".inc-create-files-card",
          ".inc-create-actions",
        ]
      ) {
        replacePart(
          currentRoot,
          nextRoot,
          selector,
          {
            preserveFocus: false,
          }
        );
      }

      for (
        const field
        of [
          "targetUserSearch",
          "subject",
          "category",
          "priority",
          "description",
        ]
      ) {
        replacePart(
          currentRoot,
          nextRoot,
          `[data-create-field="${field}"]`
        );
      }

      for (
        const field
        of [
          "source",
          "status",
          "targetUserId",
          "targetClienteId",
          "targetUserName",
          "targetUserEmail",
          "targetUserAvatar",
        ]
      ) {
        syncInputValue(
          currentRoot,
          nextRoot,
          `[data-field="${field}"]`
        );
      }

      syncCreateLoadingOverlay(
        currentRoot,
        nextRoot
      );

      if (options.focusSelector) {
        focusAfterRender(
          options.focusSelector,
          currentRoot
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  /* =======================================================
     DETAIL MODAL PATCHING
  ======================================================= */


  function syncDetailCloseConfirmOverlay(
    currentRoot = null,
    nextRoot = null
  ) {
    const currentPanel =
      currentRoot?.querySelector?.(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    const nextPanel =
      nextRoot?.querySelector?.(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    if (!currentPanel || !nextPanel) {
      return false;
    }

    try {
      currentPanel
        .querySelectorAll(
          ":scope > .incidencias-modal-confirm-overlay"
        )
        .forEach((node) => node.remove());

      const nextOverlay =
        nextPanel.querySelector(
          ":scope > .incidencias-modal-confirm-overlay"
        );

      if (nextOverlay) {
        currentPanel.insertBefore(
          nextOverlay.cloneNode(true),
          currentPanel.firstChild
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function syncDetailLoadingOverlay(
    currentRoot = null,
    nextRoot = null
  ) {
    const currentPanel =
      currentRoot?.querySelector?.(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    const nextPanel =
      nextRoot?.querySelector?.(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    if (
      !currentPanel ||
      !nextPanel
    ) {
      return false;
    }

    try {
      currentPanel
        .querySelectorAll(
          ":scope > .incidencias-modal-loading-overlay"
        )
        .forEach(
          (node) =>
            node.remove()
        );

      const nextOverlay =
        nextPanel.querySelector(
          ":scope > .incidencias-modal-loading-overlay"
        );

      if (nextOverlay) {
        currentPanel.insertBefore(
          nextOverlay.cloneNode(true),
          currentPanel.firstChild
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function syncDetailTextarea(
    currentRoot = null,
    nextRoot = null
  ) {
    const selector =
      "[data-detail-field='comment'], [data-field='comment']";

    const current =
      currentRoot?.querySelector?.(
        selector
      );

    const next =
      nextRoot?.querySelector?.(
        selector
      );

    if (
      !current ||
      !next
    ) {
      return false;
    }

    try {
      syncAttributes(
        current,
        next
      );

      if (
        document.activeElement !==
        current
      ) {
        current.value =
          next.value;
      }

      return true;
    } catch {
      return false;
    }
  }

  function patchDetailModalDom(
    detailHtml = "",
    options = {}
  ) {
    if (
      !detailHtml ||
      !modalHost?.isConnected ||
      options.fullRender === true
    ) {
      return false;
    }

    const currentRoot =
      modalHost.querySelector(
        DETAIL_ROOT_SELECTOR
      );

    const nextRoot =
      cloneTemplateRoot(
        detailHtml,
        DETAIL_ROOT_SELECTOR
      );

    if (
      !currentRoot ||
      !nextRoot
    ) {
      return false;
    }

    const currentTicketId =
      cleanText(
        currentRoot.dataset?.ticketId,
        ""
      );

    const nextTicketId =
      cleanText(
        nextRoot.dataset?.ticketId,
        ""
      );

    if (
      currentTicketId &&
      nextTicketId &&
      currentTicketId !==
        nextTicketId
    ) {
      return false;
    }

    try {
      const currentPanel =
        currentRoot.querySelector(
          DETAIL_MODAL_PANEL_SELECTOR
        );

      const nextPanel =
        nextRoot.querySelector(
          DETAIL_MODAL_PANEL_SELECTOR
        );

      const currentBody =
        currentRoot.querySelector(
          ".incidencias-modal-body"
        );

      const nextBody =
        nextRoot.querySelector(
          ".incidencias-modal-body"
        );

      const currentComposer =
        currentRoot.querySelector(
          "[data-modal-composer='true']"
        );

      const nextComposer =
        nextRoot.querySelector(
          "[data-modal-composer='true']"
        );

      /*
         Leer el modo ANTES de sincronizar atributos: si copiamos primero
         data-history-mode del nextBody al currentBody perdemos precisamente
         la transición que debemos detectar.
      */
      const currentHistoryMode =
        cleanText(
          currentBody?.dataset?.historyMode,
          "ticket"
        );

      const nextHistoryMode =
        cleanText(
          nextBody?.dataset?.historyMode,
          "ticket"
        );

      syncAttributes(
        currentRoot,
        nextRoot
      );

      syncAttributes(
        currentPanel,
        nextPanel
      );

      syncAttributes(
        currentBody,
        nextBody
      );

      syncAttributes(
        currentComposer,
        nextComposer
      );

      syncDetailCloseConfirmOverlay(
        currentRoot,
        nextRoot
      );

      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );

      if (
        currentBody &&
        nextBody &&
        currentHistoryMode !== nextHistoryMode
      ) {
        /*
           Historial es un modo de contenido del modal, no un scroll-jump.
           Sustituimos exclusivamente el body para mantener vivo el header,
           el host y sus listeners. Así no hay parpadeo del panel y el
           histórico nunca puede quedar fuera del viewport detrás del composer.
        */
        replacePart(
          currentRoot,
          nextRoot,
          "[data-modal-header-actions='true']",
          {
            preserveFocus: false,
          }
        );

        currentBody.replaceWith(
          nextBody.cloneNode(true)
        );

        if (options.focusSelector) {
          focusAfterRender(
            options.focusSelector,
            currentRoot
          );
        }

        return true;
      }

      for (
        const selector
        of [
          "[data-modal-feedback-slot='true']",
          "[data-modal-preview-slot='true']",
          "[data-modal-header-chips='true']",
          "[data-modal-header-actions='true']",
          "[data-modal-updated='true']",
          ".incidencias-modal-meta-grid",
          ".incidencias-modal-admin-editor",
          ".incidencias-modal-description-section",
          ".incidencias-modal-contact-section",
          "[data-modal-files-slot='true']",
          "[data-modal-history-slot='true']",
        ]
      ) {
        replacePart(
          currentRoot,
          nextRoot,
          selector,
          {
            preserveFocus: false,
          }
        );
      }

      syncDetailTextarea(
        currentRoot,
        nextRoot
      );

      for (
        const selector
        of [
          ".incidencias-modal-composer-head",
          ".incidencias-modal-composer-foot",
          ".incidencias-modal-dropzone",
          "[data-modal-pending-files='true']",
          "[data-modal-footer='true']",
        ]
      ) {
        replacePart(
          currentRoot,
          nextRoot,
          selector,
          {
            preserveFocus: false,
          }
        );
      }

      const currentInput =
        currentRoot.querySelector(
          "[data-detail-field='attachments'], [data-field='attachments']"
        );

      const nextInput =
        nextRoot.querySelector(
          "[data-detail-field='attachments'], [data-field='attachments']"
        );

      if (
        currentInput &&
        nextInput
      ) {
        syncAttributes(
          currentInput,
          nextInput
        );
      }

      if (options.focusSelector) {
        focusAfterRender(
          options.focusSelector,
          currentRoot
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function cancelScheduledRender() {
    if (!renderFrame) {
      return false;
    }

    cancelFrame(renderFrame);
    renderFrame = 0;

    return true;
  }

  function cancelScheduledModalRender() {
    if (!modalFrame) {
      return false;
    }

    cancelFrame(modalFrame);
    modalFrame = 0;

    return true;
  }

  function renderModalsNow(
    options = {}
  ) {
    if (
      destroyed ||
      !isBrowser()
    ) {
      return false;
    }

    const target =
      ensureModalHost();

    if (!target) {
      return false;
    }

    const createHtml =
      createModal.open
        ? renderIncidenciasCreateModal(
            createModalPayload()
          )
        : "";

    const detailHtml =
      detailModal.open
        ? renderIncidenciasDetailModal(
            detailModalPayload()
          )
        : "";

    const hasCreateRoot =
      Boolean(
        target.querySelector(
          CREATE_ROOT_SELECTOR
        )
      );

    const hasDetailRoot =
      Boolean(
        target.querySelector(
          DETAIL_ROOT_SELECTOR
        )
      );

    const canPatchCreate =
      Boolean(
        createHtml &&
        hasCreateRoot &&
        !detailHtml
      );

    const canPatchDetail =
      Boolean(
        detailHtml &&
        hasDetailRoot &&
        !createHtml
      );

    if (
      canPatchCreate &&
      patchCreateModalDom(
        createHtml,
        options
      )
    ) {
      syncBodyModalClass();
      return true;
    }

    if (
      canPatchDetail &&
      patchDetailModalDom(
        detailHtml,
        options
      )
    ) {
      syncBodyModalClass();
      return true;
    }

    target.innerHTML =
      `${createHtml}${detailHtml}`;

    syncBodyModalClass();

    if (options.focusSelector) {
      focusAfterRender(
        options.focusSelector,
        target
      );
    }

    return true;
  }

  function renderModals(
    options = {}
  ) {
    if (
      options.immediate === true
    ) {
      return renderModalsNow(
        options
      );
    }

    if (modalFrame) {
      return true;
    }

    modalFrame =
      nextFrame(() => {
        modalFrame = 0;
        renderModalsNow(options);
      });

    return true;
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();
    const html = renderIncidenciasTemplate(viewPayload());
    const patched = options.listPatch === true && patchListDom(html);
    if (!patched) host.innerHTML = html;

    if (!options.skipModals) renderModalsNow();
    return true;
  }

  function render(
    options = {}
  ) {
    if (
      options.immediate === true
    ) {
      return renderNow(options);
    }

    if (renderFrame) {
      return true;
    }

    renderFrame =
      nextFrame(() => {
        renderFrame = 0;
        renderNow(options);
      });

    return true;
  }

  function renderLoading() {
    if (!host) {
      return false;
    }

    host.innerHTML =
      renderIncidenciasLoadingState(
        payload()
      );

    renderModalsNow();

    return true;
  }

  function renderError(
    message = ""
  ) {
    if (!host) {
      return false;
    }

    host.innerHTML =
      renderIncidenciasErrorState(
        message
      );

    renderModalsNow();

    return true;
  }

  /* =======================================================
     LOAD
  ======================================================= */

  function clearUserSearchTimer() {
    if (!userSearchTimer) {
      return false;
    }

    try {
      window.clearTimeout(
        userSearchTimer
      );
    } catch {
      // noop
    }

    userSearchTimer = 0;
    return true;
  }

  async function load(
    options = {}
  ) {
    const seq =
      ++loadSeq;

    const silent =
      options.silent === true;

    const force =
      options.force === true;

    const hasItems =
      items.length > 0;

    error = "";

    if (!silent) {
      loading =
        !hasItems;

      refreshing =
        force &&
        hasItems;

      if (loading) {
        renderLoading();
      } else {
        render();
      }
    }

    loadController?.abort?.();
    const requestController = typeof AbortController !== "undefined" ? new AbortController() : null;
    loadController = requestController;

    try {
      const response =
        await listIncidencias({
          returnStaleOnError: true,
          force,
          signal: requestController?.signal,
        });

      if (
        destroyed ||
        seq !== loadSeq
      ) {
        return response;
      }

      items =
        safeArray(
          response.items
        );

      total =
        Number(
          response.total ||
          items.length
        ) ||
        items.length;

      error =
        response.stale
          ? cleanText(
              response.error?.message,
              ""
            )
          : "";

      loading = false;
      refreshing = false;

      render();

      return response;
    } catch (loadError) {
      if (
        destroyed ||
        seq !== loadSeq
      ) {
        return null;
      }

      error =
        safeError(loadError);

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

  /* =======================================================
     CREATE MODAL
  ======================================================= */

  function resetCreateModal() {
    createModal.open = false;
    createModal.submitting = false;
    createModal.dragActive = false;

    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdTicketId = "";

    createModal.errors = {};
    createModal.form =
      getCreateDefaults();

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };
  }

  function openCreateModal(
    openerNode = null
  ) {
    rememberModalReturnFocus();

    if (
      openerNode?.isConnected &&
      !modalHost?.contains?.(openerNode)
    ) {
      modalReturnFocus =
        openerNode;
    }

    creating = false;
    resetCreateModal();
    createModal.open = true;

    renderModals({
      immediate: true,

      focusSelector:
        isAdmin()
          ? "[data-create-user-search-input]"
          : "[data-field='subject']",
    });

    return true;
  }

  function closeCreateModal() {
    if (
      createModal.submitting
    ) {
      return false;
    }

    creating = false;

    clearUserSearchTimer();
    userSearchSeq += 1;

    resetCreateModal();

    renderModals({
      immediate: true,
    });

    restoreModalReturnFocus();

    return true;
  }

  function patchCreateFormFromField(
    field = null
  ) {
    if (!field) {
      return false;
    }

    const name =
      cleanText(
        field.dataset?.field ||
        field.name,
        ""
      );

    if (
      !name ||
      name === "attachments" ||
      name === "targetUserSearch"
    ) {
      return false;
    }

    createModal.form = {
      ...createModal.form,
      [name]: field.value,
    };

    if (
      createModal.errors[name]
    ) {
      const next = {
        ...createModal.errors,
      };

      delete next[name];
      createModal.errors = next;
    }

    createModal.serverError = "";

    return true;
  }

  async function runUserSearch(
    query = ""
  ) {
    const q =
      cleanText(query, "");

    const seq =
      ++userSearchSeq;

    createModal.userSearch.query =
      q;

    if (
      q.length <
      USER_SEARCH_MIN_LENGTH
    ) {
      createModal.userSearch.loading = false;
      createModal.userSearch.error = "";
      createModal.userSearch.results = [];
      createModal.userSearch.empty = false;

      renderModals({
        immediate: true,
        focusSelector:
          "[data-create-user-search-input]",
      });

      return [];
    }

    createModal.userSearch.loading = true;
    createModal.userSearch.error = "";
    createModal.userSearch.empty = false;

    renderModals({
      immediate: true,
      focusSelector:
        "[data-create-user-search-input]",
    });

    try {
      const results =
        await searchIncidenciaUsers(
          q,
          {
            limit:
              USER_SEARCH_LIMIT,
          }
        );

      if (
        destroyed ||
        seq !== userSearchSeq
      ) {
        return [];
      }

      createModal.userSearch.loading = false;
      createModal.userSearch.results =
        safeArray(results);

      createModal.userSearch.empty =
        q.length >=
          USER_SEARCH_MIN_LENGTH &&
        !results.length;

      createModal.userSearch.error = "";

      renderModals({
        immediate: true,
        focusSelector:
          "[data-create-user-search-input]",
      });

      return results;
    } catch (searchError) {
      if (
        destroyed ||
        seq !== userSearchSeq
      ) {
        return [];
      }

      createModal.userSearch.loading = false;
      createModal.userSearch.results = [];
      createModal.userSearch.empty = false;

      createModal.userSearch.error =
        safeError(
          searchError,
          "No se pudo buscar usuarios."
        );

      renderModals({
        immediate: true,
        focusSelector:
          "[data-create-user-search-input]",
      });

      return [];
    }
  }

  function handleUserSearch(
    query = ""
  ) {
    const q =
      cleanText(query, "");

    createModal.userSearch.query =
      q;

    clearUserSearchTimer();

    if (
      q.length <
      USER_SEARCH_MIN_LENGTH
    ) {
      userSearchSeq += 1;

      createModal.userSearch.loading = false;
      createModal.userSearch.error = "";
      createModal.userSearch.results = [];
      createModal.userSearch.empty = false;

      renderModals({
        immediate: true,
        focusSelector:
          "[data-create-user-search-input]",
      });

      return true;
    }

    createModal.userSearch.loading = true;

    renderModals({
      immediate: true,
      focusSelector:
        "[data-create-user-search-input]",
    });

    userSearchTimer =
      window.setTimeout(() => {
        userSearchTimer = 0;
        void runUserSearch(q);
      }, USER_SEARCH_DEBOUNCE_MS);

    return true;
  }

  function selectCreateUser(
    node = null
  ) {
    if (!node) {
      return false;
    }

    const targetUserId =
      cleanText(
        node.dataset?.userId ||
        node.dataset?.targetUserId ||
        "",
        ""
      );

    const targetClienteId =
      cleanText(
        node.dataset?.userClienteId ||
        node.dataset?.clienteId ||
        node.dataset?.targetClienteId ||
        "",
        ""
      );

    const targetUserName =
      cleanText(
        node.dataset?.userName ||
        node.dataset?.name ||
        node.textContent ||
        "",
        ""
      );

    const targetUserEmail =
      cleanText(
        node.dataset?.userEmail ||
        node.dataset?.email ||
        "",
        ""
      );

    const targetUserAvatar =
      cleanText(
        node.dataset?.userAvatar ||
        node.dataset?.avatar ||
        "",
        ""
      );

    if (!targetUserId) {
      return false;
    }

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

      query:
        targetUserName ||
        targetUserEmail ||
        targetUserId,

      loading: false,
      error: "",
      results: [],
      selectedUser,
      empty: false,
    };

    createModal.serverError = "";

    renderModals({
      immediate: true,
      focusSelector:
        "[data-field='subject']",
    });

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

    renderModals({
      immediate: true,
      focusSelector:
        "[data-create-user-search-input]",
    });

    return true;
  }

  function addCreateAttachments(
    files = []
  ) {
    const incoming =
      dedupeFiles(files);

    if (!incoming.length) {
      return false;
    }

    createModal.form.attachments =
      dedupeFiles([
        ...safeArray(
          createModal.form.attachments
        ),
        ...incoming,
      ]);

    if (
      createModal.errors.attachments
    ) {
      const next = {
        ...createModal.errors,
      };

      delete next.attachments;
      createModal.errors = next;
    }

    createModal.serverError = "";

    renderModals({
      immediate: true,
    });

    return true;
  }

  function removeCreateAttachment(
    index = -1
  ) {
    if (index < 0) {
      return false;
    }

    createModal.form.attachments =
      safeArray(
        createModal.form.attachments
      ).filter(
        (_, currentIndex) =>
          currentIndex !== index
      );

    renderModals({
      immediate: true,
    });

    return true;
  }

  function readCreateForm(
    formNode = null
  ) {
    if (!formNode) {
      return createModal.form;
    }

    const liveFiles =
      filesFromForm(formNode);

    if (liveFiles.length) {
      createModal.form.attachments =
        dedupeFiles([
          ...safeArray(
            createModal.form.attachments
          ),
          ...liveFiles,
        ]);
    }

    createModal.form = {
      ...createModal.form,

      subject:
        readField(
          formNode,
          "subject"
        ) ||
        createModal.form.subject,

      category:
        readField(
          formNode,
          "category"
        ) ||
        createModal.form.category,

      priority:
        readField(
          formNode,
          "priority"
        ) ||
        createModal.form.priority,

      description:
        readField(
          formNode,
          "description"
        ) ||
        createModal.form.description,

      source:
        readField(
          formNode,
          "source"
        ) ||
        createModal.form.source ||
        "panel_admin",

      status:
        readField(
          formNode,
          "status"
        ) ||
        createModal.form.status ||
        "open",

      targetUserId:
        readField(
          formNode,
          "targetUserId"
        ) ||
        createModal.form.targetUserId,

      targetClienteId:
        readField(
          formNode,
          "targetClienteId"
        ) ||
        createModal.form.targetClienteId,

      targetUserName:
        readField(
          formNode,
          "targetUserName"
        ) ||
        createModal.form.targetUserName,

      targetUserEmail:
        readField(
          formNode,
          "targetUserEmail"
        ) ||
        createModal.form.targetUserEmail,

      targetUserAvatar:
        readField(
          formNode,
          "targetUserAvatar"
        ) ||
        createModal.form.targetUserAvatar,
    };

    return createModal.form;
  }

  async function submitCreate(
    formNode = null
  ) {
    if (
      createModal.submitting
    ) {
      return false;
    }

    readCreateForm(
      formNode
    );

    const validation =
      safeObject(
        validateCreateForm(
          createModal.form
        ),
        {}
      );

    createModal.errors =
      safeObject(
        validation.errors,
        {}
      );

    createModal.form = {
      ...createModal.form,
      ...safeObject(
        validation.form,
        {}
      ),

      attachments:
        dedupeFiles(
          createModal.form.attachments
        ),
    };

    if (
      isAdmin() &&
      !createModal.form.targetUserId
    ) {
      createModal.errors = {
        ...createModal.errors,

        targetUserId:
          "Selecciona el usuario afectado antes de crear la incidencia.",
      };
    }

    if (
      Object.keys(
        createModal.errors
      ).length > 0 ||
      !validation.valid
    ) {
      renderModals({
        immediate: true,

        focusSelector:
          (
            createModal.errors.targetUserId ||
            createModal.errors.targetUser
          )
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

    renderModals({
      immediate: true,
    });

    try {
      const attachments =
        dedupeFiles(
          createModal.form.attachments
        );

      const created =
        await createIncidencia({
          ...createModal.form,

          attachments,
          files: attachments,
          adjuntos: attachments,
        });

      if (created) {
        items =
          upsertByTicketId(
            items,
            created
          );

        total =
          Math.max(
            total,
            items.length
          );
      }

      creating = false;

      resetCreateModal();

      renderModals({
        immediate: true,
      });

      restoreModalReturnFocus();
      render();

      return true;
    } catch (createError) {
      creating = false;
      createModal.submitting = false;

      createModal.serverError =
        safeError(
          createError,
          "No se pudo crear la incidencia."
        );

      renderModals({
        immediate: true,
        focusSelector:
          "[data-field='subject']",
      });

      return false;
    }
  }

  /* =======================================================
     DETAIL MODAL
  ======================================================= */

  function resetDetailModal() {
    detailController?.abort?.();
    detailController = null;
    detailLoadSeq += 1;
    attachmentPreviewSeq += 1;

    detailModal.open = false;
    detailModal.detail = null;

    detailModal.submitting = false;
    detailModal.operation = "";
    detailModal.closeConfirmOpen = false;

    detailModal.commentDraft = "";
    detailModal.pendingFiles = [];
    detailModal.adminDraft = null;

    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    detailModal.openingAttachmentId = "";
    detailModal.downloadingAttachmentId = "";
    detailModal.deletingAttachmentId = "";

    detailModal.previewFile = null;
    detailModal.historyOpen = false;

    openingTicketId = "";
  }

  function closeDetailModal(
    options = {}
  ) {
    if (
      detailModal.submitting
    ) {
      return false;
    }

    if (
      detailModal.closeConfirmOpen &&
      options.force !== true
    ) {
      return cancelDetailTicketClose();
    }

    const force =
      options.force === true;

    if (
      !force &&
      detailHasDraft() &&
      !confirmDiscardDetailDraft()
    ) {
      focusAfterRender(
        "[data-field='comment']",
        modalHost
      );

      return false;
    }

    resetDetailModal();

    renderModals({
      immediate: true,
    });

    restoreModalReturnFocus();

    return true;
  }

  async function openDetail(
    ticketId = "",
    openerNode = null
  ) {
    const id =
      cleanText(
        ticketId,
        ""
      );

    if (!id) {
      return false;
    }

    const detailSeq = ++detailLoadSeq;
    rememberModalReturnFocus();

    if (
      openerNode?.isConnected &&
      !modalHost?.contains?.(openerNode)
    ) {
      modalReturnFocus =
        openerNode;
    }

    const local =
      items.find(
        (item) =>
          getTicketId(item) === id
      ) ||
      null;

    openingTicketId = id;

    if (local) {
      detailModal.open = true;
      detailModal.detail = local;

      detailModal.submitting = false;
      detailModal.operation = "";
      detailModal.closeConfirmOpen = false;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];

      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";

      detailModal.openingAttachmentId = "";
      detailModal.downloadingAttachmentId = "";
      detailModal.deletingAttachmentId = "";

      detailModal.previewFile = null;
      detailModal.historyOpen = false;

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });
    } else {
      render();
    }

    detailController?.abort?.();
    const requestController = typeof AbortController !== "undefined" ? new AbortController() : null;
    detailController = requestController;

    try {
      const detail =
        await loadIncidenciaDetail(
          id,
          { signal: requestController?.signal }
        );

      if (
        destroyed ||
        detailSeq !== detailLoadSeq ||
        openingTicketId !== id
      ) {
        return false;
      }

      const mergedDetail =
        detail
          ? mergeTicketData(
              local || {},
              detail
            )
          : local;

      detailModal.open =
        Boolean(mergedDetail);

      detailModal.detail =
        mergedDetail;

      detailModal.submitting = false;
      detailModal.operation = "";
      detailModal.closeConfirmOpen = false;
      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];

      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";

      detailModal.openingAttachmentId = "";
      detailModal.downloadingAttachmentId = "";
      detailModal.deletingAttachmentId = "";
      detailModal.previewFile = null;
      detailModal.historyOpen = false;

      if (mergedDetail) {
        items =
          upsertByTicketId(
            items,
            mergedDetail
          );
      }

      openingTicketId = "";

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });

      return true;
    } catch (detailError) {
      if (
        destroyed ||
        detailSeq !== detailLoadSeq ||
        openingTicketId !== id
      ) {
        return false;
      }

      openingTicketId = "";

      if (local) {
        detailModal.feedbackMessage =
          safeError(
            detailError,
            "No se pudo actualizar el detalle."
          );

        detailModal.feedbackType =
          "error";

        render({
          skipModals: true,
        });

        renderModals({
          immediate: true,
          focusSelector:
            DETAIL_MODAL_PANEL_SELECTOR,
        });

        return false;
      }

      resetDetailModal();

      error =
        safeError(
          detailError,
          "No se pudo abrir el detalle."
        );

      render();
      restoreModalReturnFocus();

      return false;
    }
  }

  function patchDetailComment(
    field = null
  ) {
    detailModal.commentDraft =
      multilineValue(
        field?.value ||
        ""
      );

    if (
      detailModal.feedbackMessage
    ) {
      detailModal.feedbackMessage = "";
      detailModal.feedbackType = "info";
    }

    syncBodyModalClass();

    /*
       Actualiza contador, feedback y data-has-draft como máximo
       una vez por frame, sin reemplazar el textarea activo.
    */
    renderModals();

    return true;
  }

  function validateIncomingDetailFiles(
    incoming = []
  ) {
    const files =
      dedupeFiles(incoming);

    if (!files.length) {
      return {
        valid: false,
        files: [],
        message: "",
      };
    }

    const tooLarge =
      files.find(
        (file) =>
          Number(file?.size || 0) >
          DETAIL_LIMITS.maxPendingFileSize
      );

    if (tooLarge) {
      return {
        valid: false,
        files: [],
        message:
          `El archivo ${cleanText(tooLarge.name, "seleccionado")} supera el tamaño máximo permitido.`,
      };
    }

    const combined =
      dedupeFiles([
        ...safeArray(
          detailModal.pendingFiles
        ),
        ...files,
      ]);

    if (
      combined.length >
      DETAIL_LIMITS.maxPendingFiles
    ) {
      return {
        valid: false,
        files: [],
        message:
          `No puedes adjuntar más de ${DETAIL_LIMITS.maxPendingFiles} archivos en una actualización.`,
      };
    }

    return {
      valid: true,
      files: combined,
      message: "",
    };
  }

  function addDetailPendingFiles(
    files = []
  ) {
    const validation =
      validateIncomingDetailFiles(
        files
      );

    if (!validation.valid) {
      if (validation.message) {
        detailModal.feedbackMessage =
          validation.message;

        detailModal.feedbackType =
          "error";

        renderModals({
          immediate: true,
          focusSelector:
            "[data-field='comment']",
        });
      }

      return false;
    }

    detailModal.pendingFiles =
      validation.files;

    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
      focusSelector:
        "[data-field='comment']",
    });

    return true;
  }

  function removeDetailPendingFile(
    index = -1
  ) {
    if (index < 0) {
      return false;
    }

    detailModal.pendingFiles =
      safeArray(
        detailModal.pendingFiles
      ).filter(
        (_, currentIndex) =>
          currentIndex !== index
      );

    renderModals({
      immediate: true,
      focusSelector:
        "[data-field='comment']",
    });

    return true;
  }

  async function submitDetailUpdate() {
    if (
      detailModal.submitting
    ) {
      return false;
    }

    const ticketId =
      getTicketId(
        detailModal.detail
      );

    const validation =
      validateDetailUpdate({
        comment:
          detailModal.commentDraft,

        pendingFiles:
          detailModal.pendingFiles,
      });

    if (!ticketId) {
      return false;
    }

    if (!validation.valid) {
      detailModal.feedbackMessage =
        validation.message;

      detailModal.feedbackType =
        "error";

      renderModals({
        immediate: true,
        focusSelector:
          "[data-field='comment']",
      });

      return false;
    }

    /*
       Snapshot inmutable del intento:
       - si upload termina bien y luego falla el comentario,
         vaciamos pendingFiles para evitar duplicar el upload al reintentar.
       - el comentario permanece para permitir reintento.
    */
    const commentSnapshot =
      multilineValue(
        detailModal.commentDraft
      ).trim();

    const filesSnapshot =
      dedupeFiles(
        detailModal.pendingFiles
      );

    detailModal.submitting = true;
    detailModal.operation = "update";
    detailModal.closeConfirmOpen = false;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
    });

    let nextDetail =
      detailModal.detail;

    let uploaded = false;
    let commented = false;
    let reopened = false;
    let phase = "start";

    try {
      if (filesSnapshot.length) {
        phase = "upload";

        const uploadResult =
          await uploadIncidenciaAttachments(
            ticketId,
            filesSnapshot,
            {
              status: "open",
            }
          );

        nextDetail =
          mergeTicketData(
            nextDetail || {},
            uploadResult || {}
          );

        uploaded = true;

        /*
           El servidor ya recibió estos ficheros.
           Se quitan inmediatamente del retry-state.
        */
        detailModal.pendingFiles = [];
        detailModal.detail = nextDetail;

        items =
          upsertByTicketId(
            items,
            nextDetail
          );

        render({
          skipModals: true,
        });

        renderModals({
          immediate: true,
        });
      }

      if (commentSnapshot) {
        phase = "comment";

        const commentResult =
          await commentIncidencia(
            ticketId,
            commentSnapshot,
            {
              status: "open",
            }
          );

        nextDetail =
          mergeTicketData(
            nextDetail || {},
            commentResult || {}
          );

        commented = true;
      } else if (
        filesSnapshot.length
      ) {
        phase = "reopen";

        const reopenResult =
          await reopenIncidencia(
            ticketId
          );

        nextDetail =
          mergeTicketData(
            nextDetail || {},
            reopenResult || {}
          );

        reopened = true;
      }

      phase = "complete";

      nextDetail =
        mergeTicketData(
          detailModal.detail || {},
          nextDetail || {}
        );

      detailModal.submitting = false;
      detailModal.operation = "";
      detailModal.detail = nextDetail;

      detailModal.commentDraft = "";
      detailModal.pendingFiles = [];

      detailModal.feedbackMessage =
        "Incidencia actualizada correctamente.";

      detailModal.feedbackType =
        "success";

      items =
        upsertByTicketId(
          items,
          nextDetail
        );

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });

      return true;
    } catch (updateError) {
      detailModal.submitting = false;
      detailModal.operation = "";

      /*
         Conservamos cualquier resultado confirmado.
      */
      detailModal.detail =
        mergeTicketData(
          detailModal.detail || {},
          nextDetail || {}
        );

      items =
        upsertByTicketId(
          items,
          detailModal.detail
        );

      let fallback =
        "No se pudo actualizar la incidencia.";

      if (
        uploaded &&
        !commented &&
        phase === "comment"
      ) {
        fallback =
          "Los archivos se subieron correctamente, pero no se pudo publicar el comentario. Puedes reintentar el comentario sin volver a adjuntar los archivos.";
      } else if (
        uploaded &&
        !reopened &&
        phase === "reopen"
      ) {
        fallback =
          "Los archivos se subieron correctamente, pero no se pudo reabrir la incidencia. Los archivos no se volverán a subir al reintentar.";
      }

      detailModal.feedbackMessage =
        safeError(
          updateError,
          fallback
        );

      detailModal.feedbackType =
        "error";

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          "[data-field='comment']",
      });

      return false;
    }
  }

  function openDetailHistory() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    detailModal.historyOpen =
      !detailModal.historyOpen;

    const openingHistory =
      detailModal.historyOpen === true;

    renderModals({
      immediate: true,
      focusSelector:
        openingHistory
          ? "[data-modal-history-slot='true']"
          : DETAIL_MODAL_PANEL_SELECTOR,
    });

    return true;
  }

  function toggleDetailHistory() {
    return openDetailHistory();
  }

  function getCurrentAdminClassification(sourceDetail = detailModal.detail) {
    const detail = safeObject(sourceDetail, {});

    return {
      status: normalizeIncidenciaStatus(
        first(detail.status, detail.estado, detail.statusKey, detail.lifecycle?.status, "open"),
        "open"
      ),
      priority: normalizeIncidenciaPriority(
        first(detail.priority, detail.prioridad, detail.severity, "medium"),
        "medium"
      ),
      category: normalizeIncidenciaCategory(
        first(detail.category, detail.categoria, detail.tipo, detail.type, "general"),
        "general"
      ),
    };
  }

  function readAdminTicketEditor(formNode = null) {
    if (!formNode) return null;

    const status = normalizeIncidenciaStatus(readField(formNode, "status"), "");
    const priority = normalizeIncidenciaPriority(readField(formNode, "priority"), "");
    const category = normalizeIncidenciaCategory(readField(formNode, "category"), "");

    return status && priority && category
      ? { status, priority, category }
      : null;
  }

  function adminClassificationChanged(
    desired = null,
    detail = detailModal.detail
  ) {
    if (!isAdmin() || !isObject(desired)) return false;

    const current = getCurrentAdminClassification(detail);

    return (
      desired.status !== current.status ||
      desired.priority !== current.priority ||
      desired.category !== current.category
    );
  }

  function hasPendingAdminChanges() {
    return adminClassificationChanged(
      detailModal.adminDraft,
      detailModal.detail
    );
  }

  async function saveAdminTicketChanges(formNode = null, desiredOverride = null, options = {}) {
    if (!detailModal.open || detailModal.submitting) return false;

    if (!isAdmin()) {
      detailModal.feedbackMessage = "Solo un administrador puede modificar la clasificación de una incidencia.";
      detailModal.feedbackType = "error";
      renderModals({ immediate: true });
      return false;
    }

    const ticketId = getTicketId(detailModal.detail);
    const desired = isObject(desiredOverride)
      ? desiredOverride
      : readAdminTicketEditor(formNode);

    if (!ticketId || !desired) {
      detailModal.feedbackMessage = "No se pudieron leer los cambios administrativos del ticket.";
      detailModal.feedbackType = "error";
      renderModals({ immediate: true });
      return false;
    }

    const current = getCurrentAdminClassification();
    const forceStatusWrite = options.forceStatusWrite === true;
    const statusChanged = forceStatusWrite || desired.status !== current.status;
    const priorityChanged = desired.priority !== current.priority;
    const categoryChanged = desired.category !== current.category;

    if (!statusChanged && !priorityChanged && !categoryChanged) {
      detailModal.adminDraft = null;
      detailModal.feedbackMessage = "No hay cambios administrativos pendientes.";
      detailModal.feedbackType = "info";
      renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });
      return true;
    }

    detailModal.adminDraft = { ...desired };
    detailModal.submitting = true;
    detailModal.operation = "admin-update";
    detailModal.closeConfirmOpen = false;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";
    renderModals({ immediate: true });

    let nextDetail = detailModal.detail;
    let reopened = false;

    try {
      if (!forceStatusWrite && current.status === "closed" && desired.status !== "closed") {
        const reopenResult = await reopenIncidencia(ticketId);
        if (!reopenResult) {
throw new Error("El backend no confirmó la reapertura de la incidencia.");
        }
        nextDetail = mergeTicketData(nextDetail || {}, reopenResult);
        reopened = true;
      }

      const changes = {};

      if (priorityChanged) {
        changes.priority = desired.priority;
        changes.prioridad = desired.priority;
      }

      if (categoryChanged) {
        changes.category = desired.category;
        changes.categoria = desired.category;
        changes.tipo = desired.category;
        changes.type = desired.category;
      }

      const effectiveStatus = reopened ? "open" : current.status;
      if (forceStatusWrite || desired.status !== effectiveStatus) {
        changes.status = desired.status;
        changes.estado = desired.status;
      }

      if (Object.keys(changes).length) {
        let updated = await updateIncidencia(ticketId, changes);
        if (!updated) {
updated = await loadIncidenciaDetail(ticketId, { force: true, cache: false });
        }
        if (!updated) {
throw new Error("El backend no devolvió la incidencia actualizada.");
        }
        nextDetail = mergeTicketData(nextDetail || {}, updated);
      }

      detailModal.detail = nextDetail;
      detailModal.adminDraft = null;
      detailModal.submitting = false;
      detailModal.operation = "";
      detailModal.feedbackMessage = "Estado, prioridad y tipo actualizados correctamente.";
      detailModal.feedbackType = "success";

      items = upsertByTicketId(items, nextDetail);
      render({ skipModals: true });
      renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });
      return true;
    } catch (adminUpdateError) {
      detailModal.detail = nextDetail;
      detailModal.submitting = false;
      detailModal.operation = "";
      items = upsertByTicketId(items, nextDetail);

      detailModal.feedbackMessage = safeError(
        adminUpdateError,
        reopened
? "La incidencia se reabrió, pero no se pudieron guardar el resto de cambios."
: "No se pudieron guardar los cambios administrativos."
      );
      detailModal.feedbackType = "error";

      render({ skipModals: true });
      renderModals({ immediate: true, focusSelector: DETAIL_MODAL_PANEL_SELECTOR });
      return false;
    }
  }

  async function submitDetailChanges() {
    if (detailModal.submitting) return false;

    const editor =
      modalHost?.querySelector?.(
        "[data-admin-ticket-editor='true']"
      ) || null;

    const liveAdminDraft =
      isAdmin()
        ? (
            readAdminTicketEditor(editor) ||
            (isObject(detailModal.adminDraft)
              ? detailModal.adminDraft
              : null)
          )
        : null;

    if (liveAdminDraft) {
      detailModal.adminDraft = { ...liveAdminDraft };
    }

    const hasAdminChanges =
      adminClassificationChanged(
        liveAdminDraft,
        detailModal.detail
      );

    const hasContentDraft =
      Boolean(
        multilineValue(
          detailModal.commentDraft
        ).trim() ||
        safeArray(
          detailModal.pendingFiles
        ).length
      );

    if (!hasAdminChanges) {
      detailModal.adminDraft = null;
      return submitDetailUpdate();
    }

    if (!hasContentDraft) {
      return saveAdminTicketChanges(
        null,
        liveAdminDraft
      );
    }

    const contentSaved =
      await submitDetailUpdate();

    if (!contentSaved) {
      return false;
    }

    return saveAdminTicketChanges(
      null,
      liveAdminDraft,
      { forceStatusWrite: true }
    );
  }

  function ticketIsAlreadyClosed() {
    const status =
      cleanText(
        first(
          detailModal.detail?.status,
          detailModal.detail?.estado,
          detailModal.detail?.statusKey,
          detailModal.detail?.lifecycle?.status,
          ""
        ),
        ""
      )
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    return [
      "closed",
      "resolved",
      "cerrada",
      "cerrado",
      "resuelta",
      "resuelto",
    ].includes(status);
  }

  function closeDetailTicket() {
    if (
      !detailModal.open ||
      detailModal.submitting ||
      ticketIsAlreadyClosed()
    ) {
      return false;
    }

    if (!getTicketId(detailModal.detail)) {
      return false;
    }

    detailModal.closeConfirmOpen = true;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE_CONFIRM}"]`,
    });

    return true;
  }

  function cancelDetailTicketClose() {
    if (
      !detailModal.open ||
      detailModal.submitting ||
      !detailModal.closeConfirmOpen
    ) {
      return false;
    }

    detailModal.closeConfirmOpen = false;

    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE}"]`,
    });

    return true;
  }

  async function confirmDetailTicketClose() {
    if (
      !detailModal.open ||
      detailModal.submitting ||
      !detailModal.closeConfirmOpen ||
      ticketIsAlreadyClosed()
    ) {
      return false;
    }

    const ticketId =
      getTicketId(detailModal.detail);

    if (!ticketId) {
      return false;
    }

    detailModal.closeConfirmOpen = false;
    detailModal.submitting = true;
    detailModal.operation = "close";
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
    });

    try {
      const closed =
        await closeIncidencia(ticketId);

      const nextDetail =
        mergeTicketData(
          detailModal.detail || {},
          closed || {}
        );

      items =
        upsertByTicketId(
          items,
          nextDetail
        );

      render({
        skipModals: true,
      });

      detailModal.submitting = false;
      detailModal.operation = "";

      resetDetailModal();

      renderModals({
        immediate: true,
      });

      restoreModalReturnFocus();
      return true;
    } catch (closeError) {
      detailModal.submitting = false;
      detailModal.operation = "";
      detailModal.closeConfirmOpen = false;
      detailModal.feedbackMessage =
        safeError(
          closeError,
          "No se pudo cerrar la incidencia."
        );
      detailModal.feedbackType = "error";

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });

      return false;
    }
  }

  /* =======================================================
     ATTACHMENTS
  ======================================================= */

  function getAttachmentById(
    attachmentId = ""
  ) {
    const id =
      cleanText(
        attachmentId,
        ""
      );

    const attachments =
      safeArray(
        first(
          detailModal.detail?.attachments,
          detailModal.detail?.files,
          detailModal.detail?.adjuntos,
          []
        )
      );

    return (
      attachments.find(
        (file) =>
          cleanText(
            first(
              file.id,
              file.attachmentId,
              file.fileId
            ),
            ""
          ) === id
      ) ||
      null
    );
  }

  async function openAttachment(
    attachmentId = ""
  ) {
    const id =
      cleanText(
        attachmentId,
        ""
      );

    const ticketId =
      getTicketId(
        detailModal.detail
      );

    if (
      !id ||
      !ticketId ||
      !detailModal.open
    ) {
      return false;
    }

    const sequence =
      ++attachmentPreviewSeq;

    detailModal.openingAttachmentId =
      id;

    detailModal.feedbackMessage =
      "";

    detailModal.feedbackType =
      "info";

    renderModals({
      immediate: true,
    });

    try {
      const file =
        await openIncidenciaAttachment({
          ticketId,
          attachmentId: id,
        });

      /*
         Carrera protegida:
         si el usuario abre otro adjunto, cambia de incidencia,
         cierra la preview o cierra el modal mientras llega la SAS,
         esta respuesta deja de tener autoridad para pintar.
      */
      if (
        destroyed ||
        sequence !== attachmentPreviewSeq ||
        !detailModal.open ||
        getTicketId(
          detailModal.detail
        ) !== ticketId
      ) {
        return false;
      }

      const normalizedFile =
        safeObject(
          file,
          {}
        );

      const previewUrl =
        cleanText(
          first(
            normalizedFile.viewUrl,
            normalizedFile.openUrl,
            normalizedFile.signedUrl,
            normalizedFile.sasUrl,
            normalizedFile.url
          ),
          ""
        );

      /*
         La allowlist y la validación SAS pertenecen exclusivamente
         a incidencias.api.js. Aquí no relajamos seguridad ni volvemos
         a interpretar URLs: sólo exigimos que /view haya producido una
         URL renderizable después de pasar por esa capa.
      */
      if (!previewUrl) {
        const previewError =
          new Error(
            "El backend no devolvió una URL temporal válida para visualizar el adjunto."
          );

        previewError.code =
          "INCIDENCIA_ATTACHMENT_VIEW_URL_MISSING";

        throw previewError;
      }

      detailModal.previewFile = {
        ...safeObject(
          getAttachmentById(id)
        ),

        ...normalizedFile,

        id,
        attachmentId: id,

        url: previewUrl,

        viewUrl:
          cleanText(
            normalizedFile.viewUrl,
            previewUrl
          ),

        openUrl:
          cleanText(
            normalizedFile.openUrl,
            previewUrl
          ),

        signedUrl:
          cleanText(
            normalizedFile.signedUrl,
            previewUrl
          ),

        sasUrl:
          cleanText(
            normalizedFile.sasUrl,
            previewUrl
          ),
      };

      detailModal.openingAttachmentId =
        "";

      renderModals({
        immediate: true,
      });

      /*
         La preview del template está situada por encima de
         "Documentos actuales". immediate=true garantiza que ya existe
         en DOM antes de revelarla.
      */
      revealDetailPreview({
        focus: true,
      });

      return true;
    } catch (attachmentError) {
      if (
        sequence !== attachmentPreviewSeq
      ) {
        return false;
      }

      detailModal.openingAttachmentId =
        "";

      detailModal.feedbackMessage =
        safeError(
          attachmentError,
          "No se pudo abrir el adjunto."
        );

      detailModal.feedbackType =
        "error";

      renderModals({
        immediate: true,
      });

      return false;
    }
  }

  async function downloadAttachment(
    attachmentId = ""
  ) {
    const id =
      cleanText(
        attachmentId,
        ""
      );

    const ticketId =
      getTicketId(
        detailModal.detail
      );

    const attachment =
      getAttachmentById(id);

    if (
      !id ||
      !ticketId
    ) {
      return false;
    }

    detailModal.downloadingAttachmentId =
      id;

    renderModals({
      immediate: true,
    });

    try {
      await downloadIncidenciaAttachment({
        ticketId,
        attachmentId: id,

        filename:
          cleanText(
            first(
              attachment?.name,
              attachment?.filename
            ),
            ""
          ),
      });

      detailModal.downloadingAttachmentId =
        "";

      renderModals({
        immediate: true,
      });

      return true;
    } catch (downloadError) {
      detailModal.downloadingAttachmentId =
        "";

      detailModal.feedbackMessage =
        safeError(
          downloadError,
          "No se pudo descargar el adjunto."
        );

      detailModal.feedbackType =
        "error";

      renderModals({
        immediate: true,
      });

      return false;
    }
  }

  async function deleteAttachment(
    attachmentId = ""
  ) {
    const id =
      cleanText(
        attachmentId,
        ""
      );

    const ticketId =
      getTicketId(
        detailModal.detail
      );

    if (
      !id ||
      !ticketId ||
      !detailModal.open ||
      detailModal.deletingAttachmentId
    ) {
      return false;
    }

    if (!isAdmin()) {
      detailModal.feedbackMessage =
        "Solo un administrador puede eliminar adjuntos.";
      detailModal.feedbackType =
        "error";
      renderModals({ immediate: true });
      return false;
    }

    const attachment =
      getAttachmentById(id);

    const filename =
      cleanText(
        first(
          attachment?.name,
          attachment?.filename,
          attachment?.fileName,
          "este adjunto"
        ),
        "este adjunto"
      );

    if (
      isBrowser() &&
      typeof window.confirm === "function"
    ) {
      const accepted = window.confirm(
        `¿Eliminar definitivamente “${filename}”?

Se quitará de la incidencia y del almacenamiento. Esta acción no se puede deshacer.`
      );

      if (!accepted) {
        return false;
      }
    }

    detailModal.deletingAttachmentId = id;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
    });

    try {
      const updated =
        await deleteIncidenciaAttachment({
          ticketId,
          attachmentId: id,
        });

      if (!updated) {
        throw new Error(
          "El backend no devolvió la incidencia actualizada."
        );
      }

      detailModal.deletingAttachmentId = "";
      detailModal.detail = updated;

      if (
        cleanText(
          first(
            detailModal.previewFile?.id,
            detailModal.previewFile?.attachmentId,
            ""
          ),
          ""
        ) === id
      ) {
        attachmentPreviewSeq += 1;
        detailModal.previewFile = null;
        detailModal.openingAttachmentId = "";
      }

      detailModal.feedbackMessage =
        `Adjunto “${filename}” eliminado correctamente.`;
      detailModal.feedbackType =
        "success";

      items =
        replaceByTicketId(
          items,
          updated
        );

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          "[data-modal-files-slot='true'] button, [data-modal-history-slot='true'] button",
      });

      return true;
    } catch (deleteError) {
      detailModal.deletingAttachmentId = "";
      detailModal.feedbackMessage =
        safeError(
          deleteError,
          "No se pudo eliminar el adjunto."
        );
      detailModal.feedbackType =
        "error";

      renderModals({
        immediate: true,
      });

      return false;
    }
  }

  function closePreview() {
    attachmentPreviewSeq += 1;

    detailModal.openingAttachmentId =
      "";

    detailModal.previewFile =
      null;

    renderModals({
      immediate: true,
      focusSelector:
        "[data-modal-files-slot='true'] button",
    });

    return true;
  }

  async function downloadPreview() {
    const file =
      safeObject(
        detailModal.previewFile,
        null
      );

    if (!file) {
      return false;
    }

    return downloadAttachment(
      cleanText(
        first(
          file.id,
          file.attachmentId
        ),
        ""
      )
    );
  }

  /* =======================================================
     LIST CONTROLS
  ======================================================= */

  function renderWithFilteredItems(
    options = {}
  ) {
    /*
       El template aplica filtro y orden desde viewPayload().
       `items` sigue siendo la colección canónica; evitamos duplicar
       la lógica de filtrado/orden en el controlador.
    */
    render({ ...options, listPatch: true });
    return true;
  }

  function setSearch(
    value = ""
  ) {
    search =
      cleanText(
        value,
        ""
      );

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    renderWithFilteredItems();

    return true;
  }

  function setFilter(
    value = "all"
  ) {
    filter =
      cleanText(
        value,
        "all"
      ) ||
      "all";

    sortMode =
      DEFAULT_SORT_MODE;

    sortOrder =
      DEFAULT_SORT_ORDER;

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    renderWithFilteredItems();

    return true;
  }

  function applyStatAction(
    value = ""
  ) {
    const stat =
      cleanText(
        value,
        ""
      ).toLowerCase();

    if (
      ![
        "open",
        "closed",
        "urgent",
        "amount",
        "attachments",
      ].includes(stat)
    ) {
      return false;
    }

    search = "";
    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    if (stat === "amount" || stat === "attachments") {
      filter = "all";
      sortMode = stat;
      sortOrder = "desc";
    } else {
      filter = stat;
      sortMode = DEFAULT_SORT_MODE;
      sortOrder = DEFAULT_SORT_ORDER;
    }

    renderWithFilteredItems();
    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    sortMode = DEFAULT_SORT_MODE;
    sortOrder = DEFAULT_SORT_ORDER;

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    renderWithFilteredItems();

    return true;
  }

  function toggleSortOrder() {
    sortOrder =
      getNextSortOrder(
        sortOrder
      );

    renderWithFilteredItems();

    return true;
  }

  function loadMore() {
    loadingMore = true;

    visibleLimit +=
      DEFAULT_VISIBLE_LIMIT;

    renderWithFilteredItems();

    loadingMore = false;

    return true;
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
    });
  }

  /* =======================================================
     ACTIONS
  ======================================================= */

  async function copyTicketId(
    ticketId = ""
  ) {
    const id =
      cleanText(
        ticketId,
        ""
      );

    if (
      !id ||
      !isBrowser()
    ) {
      return false;
    }

    try {
      await navigator.clipboard
        ?.writeText?.(id);

      if (detailModal.open) {
        detailModal.feedbackMessage =
          "ID de incidencia copiado.";

        detailModal.feedbackType =
          "success";

        renderModals({
          immediate: true,
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  async function handleAction(
    action = "",
    node = null
  ) {
    const type =
      cleanText(
        action,
        ""
      );

    if (!type) {
      return false;
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.REFRESH
    ) {
      return refresh();
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.CREATE_OPEN
    ) {
      return openCreateModal(
        node
      );
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.STAT_APPLY
    ) {
      return applyStatAction(
        node?.dataset?.stat ||
        ""
      );
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.FILTER
    ) {
      return setFilter(
        node?.dataset?.filter ||
        "all"
      );
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.SORT_TOGGLE
    ) {
      return toggleSortOrder();
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.CLEAR_FILTERS
    ) {
      return clearFilters();
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.CLEAR_SEARCH
    ) {
      return setSearch("");
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.OPEN_DETAIL
    ) {
      return openDetail(
        node?.dataset?.ticketId ||
        node?.dataset?.incidenciaId ||
        "",
        node
      );
    }

    if (
      type ===
      INCIDENCIAS_ACTIONS.LOAD_MORE
    ) {
      return loadMore();
    }

    if (
      type ===
      CREATE_ACTIONS.CLOSE
    ) {
      return closeCreateModal();
    }

    if (
      type ===
      CREATE_ACTIONS.SUBMIT
    ) {
      return submitCreate(
        node?.closest?.("form")
      );
    }

    if (
      type ===
      CREATE_ACTIONS.USER_SELECT
    ) {
      return selectCreateUser(node);
    }

    if (
      type ===
      CREATE_ACTIONS.USER_CLEAR
    ) {
      return clearCreateUser();
    }

    if (
      type ===
      CREATE_ACTIONS.ATTACHMENT_REMOVE
    ) {
      return removeCreateAttachment(
        fileIndexFromNode(node)
      );
    }

    if (
      type ===
      DETAIL_ACTIONS.CLOSE
    ) {
      return closeDetailModal();
    }

    if (
      type ===
      DETAIL_ACTIONS.COPY_ID
    ) {
      return copyTicketId(
        node?.dataset?.ticketId ||
        ""
      );
    }

    if (
      type ===
      DETAIL_ACTIONS.COMMENT_SUBMIT
    ) {
      return submitDetailChanges();
    }

    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE
    ) {
      return closeDetailTicket();
    }

    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE_CANCEL
    ) {
      return cancelDetailTicketClose();
    }

    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE_CONFIRM
    ) {
      return confirmDetailTicketClose();
    }

    if (
      type ===
      DETAIL_ACTIONS.HISTORY_REVEAL
    ) {
      return openDetailHistory();
    }

    if (
      type ===
      DETAIL_ACTIONS.HISTORY_TOGGLE
    ) {
      return toggleDetailHistory();
    }

    if (
      type ===
      DETAIL_ACTIONS.PENDING_FILE_REMOVE
    ) {
      return removeDetailPendingFile(
        fileIndexFromNode(node)
      );
    }

    if (
      type ===
      DETAIL_ACTIONS.ATTACHMENT_OPEN
    ) {
      return openAttachment(
        node?.dataset?.attachmentId ||
        ""
      );
    }

    if (
      type ===
      DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD
    ) {
      return downloadAttachment(
        node?.dataset?.attachmentId ||
        ""
      );
    }

    if (
      type ===
      DETAIL_ACTIONS.ATTACHMENT_DELETE
    ) {
      return deleteAttachment(
        node?.dataset?.attachmentId ||
        ""
      );
    }

    if (
      type ===
      DETAIL_ACTIONS.PREVIEW_CLOSE
    ) {
      return closePreview();
    }

    if (
      type ===
      DETAIL_ACTIONS.PREVIEW_DOWNLOAD
    ) {
      return downloadPreview();
    }

    return false;
  }

  function actionFrom(
    node = null
  ) {
    return cleanText(
      node?.dataset?.incidenciasAction ||
      node?.dataset?.createAction ||
      node?.dataset?.detailAction ||
      node?.dataset?.action ||
      "",
      ""
    );
  }

  /* =======================================================
     EVENTS
  ======================================================= */

  function onClick(event) {
    const target =
      event.target?.nodeType === 3
        ? event.target.parentElement
        : event.target;

    if (!target?.closest) {
      return;
    }

    const actionNode =
      target.closest(
        "[data-incidencias-action], [data-create-action], [data-detail-action], [data-action]"
      );

    if (
      actionNode &&
      ownsNode(actionNode)
    ) {
      const action =
        actionFrom(actionNode);

      if (action) {
        event.preventDefault();
        event.stopPropagation();

        event[
          ROUTER_EVENT_HANDLED_KEY
        ] = true;

        void handleAction(
          action,
          actionNode
        );

        return;
      }
    }

    const row =
      target.closest(
        "[data-ticket-row='true']"
      );

    if (
      row &&
      host?.contains(row)
    ) {
      event.preventDefault();
      event.stopPropagation();

      event[
        ROUTER_EVENT_HANDLED_KEY
      ] = true;

      void openDetail(
        row.dataset.ticketId ||
        row.dataset.incidenciaId ||
        "",
        row
      );

      return;
    }

    const createOverlay =
      target.closest(
        CREATE_MODAL_OVERLAY_SELECTOR
      );

    const createPanel =
      target.closest(
        CREATE_MODAL_PANEL_SELECTOR
      );

    if (
      createOverlay &&
      !createPanel &&
      target === createOverlay
    ) {
      closeCreateModal();
      return;
    }

    const detailOverlay =
      target.closest(
        DETAIL_MODAL_OVERLAY_SELECTOR
      );

    const detailPanel =
      target.closest(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    if (
      detailOverlay &&
      !detailPanel &&
      target === detailOverlay
    ) {
      closeDetailModal();
    }
  }

  function onInput(event) {
    const target =
      event.target;

    const field =
      cleanText(
        target?.dataset?.field ||
        target?.dataset?.incidenciasField ||
        target?.dataset?.detailField ||
        "",
        ""
      );

    if (
      !field ||
      !ownsNode(target)
    ) {
      return;
    }

    if (field === "search") {
      setSearch(
        target.value ||
        ""
      );

      return;
    }

    if (
      field ===
      "targetUserSearch"
    ) {
      handleUserSearch(
        target.value ||
        ""
      );

      return;
    }

    if (createModal.open) {
      patchCreateFormFromField(
        target
      );
    }

    if (
      detailModal.open &&
      field === "comment"
    ) {
      patchDetailComment(
        target
      );
    }
  }

  function onChange(event) {
    const target =
      event.target;

    const field =
      cleanText(
        target?.dataset?.field ||
        target?.dataset?.detailField ||
        "",
        ""
      );

    if (
      !field ||
      !ownsNode(target)
    ) {
      return;
    }

    if (
      createModal.open &&
      field === "attachments"
    ) {
      addCreateAttachments(
        filesFromInput(target)
      );

      try {
        target.value = "";
      } catch {
        // noop
      }

      return;
    }

    if (
      detailModal.open &&
      field === "attachments"
    ) {
      addDetailPendingFiles(
        filesFromInput(target)
      );

      try {
        target.value = "";
      } catch {
        // noop
      }

      return;
    }

    if (
      detailModal.open &&
      isAdmin() &&
      ["status", "priority", "category"].includes(field)
    ) {
      const editor =
        target.closest?.(
          "[data-admin-ticket-editor='true']"
        ) || null;

      const desired =
        readAdminTicketEditor(editor);

      if (desired) {
        detailModal.adminDraft = { ...desired };
        detailModal.feedbackMessage = "";
        detailModal.feedbackType = "info";
        syncBodyModalClass();

        renderModals({
          immediate: true,
          focusSelector: `[data-field="${field}"]`,
        });
      }

      return;
    }

    if (createModal.open) {
      patchCreateFormFromField(
        target
      );
    }
  }

  function onSubmit(event) {
    const form =
      event.target?.closest?.(
        "form"
      );

    if (
      !form ||
      !ownsNode(form)
    ) {
      return;
    }

    if (
      form.matches(
        "#incidencias-create-form, [data-incidencias-create-form='true']"
      )
    ) {
      event.preventDefault();
      event.stopPropagation();

      event[
        ROUTER_EVENT_HANDLED_KEY
      ] = true;

      void submitCreate(form);
    }
  }

  function onKeydown(event) {
    if (!ownsNode(event.target)) {
      return;
    }

    if (
      event.key === "Tab" &&
      modalsOpen()
    ) {
      trapFocus(event);
      return;
    }

    if (
      event.key === "Escape"
    ) {
      if (createModal.open) {
        event.preventDefault();
        closeCreateModal();
        return;
      }

      if (detailModal.open) {
        event.preventDefault();

        /*
           UX:
           Escape cierra primero la preview de archivo.
           Segundo Escape cierra el modal (con protección de borrador).
        */
        if (
          detailModal.closeConfirmOpen
        ) {
          cancelDetailTicketClose();
          return;
        }

        if (
          detailModal.previewFile
        ) {
          closePreview();
          return;
        }

        closeDetailModal();
        return;
      }
    }

    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    const row =
      event.target?.closest?.(
        "[data-ticket-row='true']"
      );

    if (
      !row ||
      !host?.contains(row)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event[
      ROUTER_EVENT_HANDLED_KEY
    ] = true;

    void openDetail(
      row.dataset.ticketId ||
      row.dataset.incidenciaId ||
      "",
      row
    );
  }

  function getDropzone(
    target = null
  ) {
    const dropzone =
      target?.closest?.(
        "[data-dropzone]"
      ) ||
      null;

    if (
      !dropzone ||
      !ownsNode(dropzone)
    ) {
      return null;
    }

    const kind =
      cleanText(
        dropzone.dataset?.dropzone,
        ""
      );

    if (
      kind === "attachments" &&
      createModal.open
    ) {
      return {
        dropzone,
        kind: "create",
      };
    }

    if (
      kind === "detail-attachments" &&
      detailModal.open
    ) {
      return {
        dropzone,
        kind: "detail",
      };
    }

    return null;
  }

  function onDragOver(event) {
    const zone =
      getDropzone(
        event.target
      );

    if (!zone) {
      return;
    }

    event.preventDefault();

    if (
      zone.kind !== "create"
    ) {
      return;
    }

    if (
      !createModal.dragActive
    ) {
      createModal.dragActive = true;

      renderModals({
        immediate: true,
      });
    }
  }

  function onDragLeave(event) {
    const zone =
      getDropzone(
        event.target
      );

    if (
      !zone ||
      zone.kind !== "create"
    ) {
      return;
    }

    const related =
      event.relatedTarget;

    if (
      related &&
      zone.dropzone.contains(
        related
      )
    ) {
      return;
    }

    createModal.dragActive = false;

    renderModals({
      immediate: true,
    });
  }

  function onDrop(event) {
    const zone =
      getDropzone(
        event.target
      );

    if (!zone) {
      return;
    }

    event.preventDefault();

    const files =
      Array.from(
        event.dataTransfer?.files ||
        []
      ).filter(isFileLike);

    if (
      zone.kind === "create"
    ) {
      createModal.dragActive = false;

      addCreateAttachments(
        files
      );

      return;
    }

    addDetailPendingFiles(
      files
    );
  }

  function bindTarget(
    target = null
  ) {
    target?.addEventListener?.(
      "click",
      onClick
    );

    target?.addEventListener?.(
      "input",
      onInput
    );

    target?.addEventListener?.(
      "change",
      onChange
    );

    target?.addEventListener?.(
      "submit",
      onSubmit
    );

    target?.addEventListener?.(
      "keydown",
      onKeydown
    );

    target?.addEventListener?.(
      "dragover",
      onDragOver
    );

    target?.addEventListener?.(
      "dragleave",
      onDragLeave
    );

    target?.addEventListener?.(
      "drop",
      onDrop
    );

    return true;
  }

  function unbindTarget(
    target = null
  ) {
    target?.removeEventListener?.(
      "click",
      onClick
    );

    target?.removeEventListener?.(
      "input",
      onInput
    );

    target?.removeEventListener?.(
      "change",
      onChange
    );

    target?.removeEventListener?.(
      "submit",
      onSubmit
    );

    target?.removeEventListener?.(
      "keydown",
      onKeydown
    );

    target?.removeEventListener?.(
      "dragover",
      onDragOver
    );

    target?.removeEventListener?.(
      "dragleave",
      onDragLeave
    );

    target?.removeEventListener?.(
      "drop",
      onDrop
    );

    return true;
  }

  /* =======================================================
     CONTROLLER PUBLIC
  ======================================================= */

  const controller = {
    version:
      INCIDENCIAS_VIEW_VERSION,

    mount() {
      if (
        destroyed ||
        mounted ||
        !host
      ) {
        return controller;
      }

      mounted = true;
      destroyed = false;

      bindTarget(host);
      ensureModalHost();

      if (isBrowser()) {
        window.addEventListener(
          "beforeunload",
          onBeforeUnload
        );
      }

      const hasCache =
        items.length > 0;

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
        source:
          "incidencias.mount.background",
      });

      return controller;
    },

    destroy() {
      destroyed = true;
      mounted = false;

      loadSeq += 1;
      userSearchSeq += 1;

      loadController?.abort?.();
      detailController?.abort?.();
      loadController = null;
      detailController = null;

      clearUserSearchTimer();

      cancelScheduledRender();
      cancelScheduledModalRender();

      if (isBrowser()) {
        window.removeEventListener(
          "beforeunload",
          onBeforeUnload
        );
      }

      unbindTarget(host);

      /*
         Destroy/unmount es una decisión del Router.
         No mostramos confirm() durante destrucción del árbol.
      */
      resetCreateModal();
      resetDetailModal();

      removeModalHost();
      syncBodyModalClass();

      modalReturnFocus = null;

      clearInstance(
        host,
        controller
      );

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

    openCreateModal,
    closeCreateModal,

    openDetail,
    closeDetailModal,

    getSnapshot() {
      return {
        version:
          INCIDENCIAS_VIEW_VERSION,

        mounted,
        destroyed,

        loading,
        refreshing,
        creating,
        loadingMore,

        total,
        count:
          items.length,

        visibleCount:
          filteredItems().length,

        visibleLimit,
        filter,

        searchLength:
          search.length,

        sortOrder,
        sortMode,

        createModalOpen:
          createModal.open,

        detailModalOpen:
          detailModal.open,

        detailDraft:
          detailHasDraft(),

        detailSubmitting:
          detailModal.submitting,

        detailPreviewOpen:
          Boolean(
            detailModal.previewFile
          ),

        detailHistoryOpen:
          detailModal.historyOpen === true,

        deletingAttachmentId:
          detailModal.deletingAttachmentId
            ? "***"
            : "",

        attachmentPreviewBusy:
          Boolean(
            detailModal.openingAttachmentId
          ),

        attachmentPreviewRaceSeq:
          attachmentPreviewSeq,

        modalHost:
          Boolean(
            modalHost?.isConnected
          ),

        modalHostBound,

        focusTrap: true,
        restoresModalFocus: true,
        protectsDetailDraft: true,

        userSearch: {
          queryLength:
            createModal.userSearch.query.length,

          loading:
            createModal.userSearch.loading,

          results:
            createModal.userSearch.results.length,

          empty:
            createModal.userSearch.empty,

          hasError:
            Boolean(
              createModal.userSearch.error
            ),

          hasSelectedUser:
            Boolean(
              createModal.form.targetUserId
            ),
        },

        createAttachments:
          safeArray(
            createModal.form.attachments
          ).length,

        createFilesAreReal:
          safeArray(
            createModal.form.attachments
          ).every(isFileLike),

        detailAttachmentsPending:
          safeArray(
            detailModal.pendingFiles
          ).length,

        openingTicketId:
          openingTicketId
            ? "***"
            : "",

        role:
          getCurrentRole(),

        admin:
          isAdmin(),

        error:
          redact(error),

        detailLimits: {
          ...DETAIL_LIMITS,
        },

        blob: {
          createField:
            "attachments",

          submitRereadsLiveFileInput:
            true,

          sendsFilesAliases: [
            "attachments",
            "files",
            "adjuntos",
          ],

          detailAvoidsDuplicateRetryUpload:
            true,
        },

        policy: {
          noFetch: true,
          noStorage: true,

          modalIsland: true,
          focusTrap: true,
          focusRestore: true,
          dirtyCloseProtection: true,
          beforeUnloadProtection: true,

          detailMultilinePreserved: true,
          detailUploadLimitsEarly: true,
          detailPartialSuccessAware: true,
          detailManualClose: true,
          detailHistoryCollapsedByDefault: true,
          detailHistoryLazyRender: true,
          detailHistoryHeaderAccess: true,
          adminAttachmentDelete: true,

          attachmentPreviewUsesApiViewContract: true,
          attachmentPreviewRequiresValidatedUrl: true,
          attachmentPreviewScrollIntoView: true,
          attachmentPreviewFocusAfterOpen: true,
          attachmentPreviewRaceProtected: true,

          filteredListNoStateMutation: true,
          firstDoesNotFlattenArrays: true,
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

export async function IncidenciasView(
  host = null,
  context = {}
) {
  if (!isDomNode(host)) {
    return null;
  }

  destroyPrevious(host);

  const controller =
    createIncidenciasController(
      host,
      context
    );

  storeInstance(
    host,
    controller
  );

  return controller.mount();
}

export const IncidenciasIndex =
  IncidenciasView;

export function destroy() {
  try {
    return Boolean(
      lastInstance?.destroy?.()
    );
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (
    lastInstance?.getSnapshot
  ) {
    return lastInstance.getSnapshot();
  }

  return {
    version:
      INCIDENCIAS_VIEW_VERSION,

    mounted: false,
    hasInstance: false,

    role:
      getCurrentRole(),

    admin:
      isAdmin(),
  };
}

export const getDebugSnapshot =
  getSnapshot;

export default IncidenciasView;

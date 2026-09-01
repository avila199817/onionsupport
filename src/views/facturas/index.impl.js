/* =========================================================
   Onion Support - Facturas Index
   Archivo: /src/views/facturas/index.js

   PRODUCTIVO · SINGLE MOUNT DETAIL MODAL · V17

   FIX PRINCIPAL
   - El modal detalle se monta una sola vez por apertura.
   - Las actualizaciones posteriores NO recrean overlay/panel.
   - Si existe factura local, se muestra inmediatamente.
   - getFacturaById() enriquece el contenido en segundo plano.
   - Evita el efecto abrir -> cerrar -> abrir.
   - Registro de cobro admin como command explícito e idempotente.
========================================================= */

import { AppCore } from "../../core/index.js";
import { ROUTES } from "../../core/config.js";

import {
  listFacturas,
  loadFacturasStats,
  hydrateFacturasFromCache,
  syncFacturasListCache,
  getFacturasListContextKey,
  getFacturaById,
  createFactura,
  sendFactura,
  markFacturaPaid,
  viewFacturaPdfRequest,
  downloadFacturaPdfRequest,
  computeFacturasStats,
} from "./facturas.api.js";

import {
  renderFacturasTemplate,
  renderFacturasLoadingState,
  renderFacturasErrorState,
  bindFacturasTemplateDom,
  FACTURAS_ACTIONS,
} from "./facturas.template.js";

import {
  renderFacturasCreateModal,
  FACTURA_CREATE_ACTIONS,
  getFacturaCreateFormDefaults,
  validateFacturaCreateForm,
  getFacturaCreateBreakdown,
  renderFacturaCreateClientSearchSlot,
  renderFacturaCreateTicketSearchSlot,
} from "./facturas.template.create.js";

import {
  FACTURA_MODAL_ACTIONS,
  renderFacturasDetailModal,
  renderFacturasDetailContent,
} from "./facturas.template.modal.js";

export const FACTURAS_INDEX_VERSION =
  "facturas.index.productivo.v21.owner-authority-performance";

export const FACTURAS_VIEW_VERSION = FACTURAS_INDEX_VERSION;

const DEFAULT_PAGE = 1;
const DEFAULT_BATCH_SIZE = 50;
const MIN_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 200;

const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 10;
const TICKET_LIMIT = 60;
const SEARCH_DEBOUNCE_MS = 180;
const LIST_SEARCH_DEBOUNCE_MS = 280;
const INFINITE_ROOT_MARGIN = "900px 0px 900px 0px";

const DETAIL_MODAL_HOST_ID = "facturas-detail-root";
const DETAIL_MODAL_HOST_SELECTOR = `#${DETAIL_MODAL_HOST_ID}`;
const DETAIL_MODAL_ROOT_SELECTOR = "[data-facturas-detail-root='true']";
const DETAIL_MODAL_PANEL_SELECTOR =
  "[data-facturas-detail-modal='true'], [data-role='facturas-detail-modal']";
const DETAIL_MODAL_SCROLL_SELECTOR =
  "[data-facturas-detail-body-shell='true']";
const DETAIL_MODAL_OVERLAY_SELECTOR =
  "[data-facturas-detail-overlay='true']";

const CREATE_MODAL_HOST_ID = "facturas-create-modal-host";
const CREATE_MODAL_HOST_SELECTOR = `#${CREATE_MODAL_HOST_ID}`;
const CREATE_MODAL_PANEL_SELECTOR =
  "[data-facturas-create-modal-panel='true']";
const CREATE_MODAL_SCROLL_SELECTOR =
  "[data-facturas-create-body='true']";
const CREATE_MODAL_OVERLAY_SELECTOR =
  "[data-facturas-create-modal-overlay='true']";

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

const FACTURAS_CONTROLLER_KEY =
  Symbol.for("onion.support.facturas.controller");

let FACTURAS_CONTROLLER_SEQUENCE = 0;
let lastFacturasController = null;

/*
  Búsquedas de selección para alta de Facturas.
  La entidad seleccionable es exclusivamente Cliente. El backend ya expone
  /api/search/clientes como router canónico sobre el contenedor de clientes;
  nunca degradar a /api/search/users ni /api/users porque mezclaría usuarios
  internos con entidades facturables.
*/
const CLIENT_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/clientes",
]);

const TICKET_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/incidencias",
]);

/* =========================================================
   HELPERS
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

function multilineValue(value = "") {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/* No aplanar arrays de dominio. */
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
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

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = normalizeKey(value);

    if (["true", "1", "yes", "si", "on"].includes(key)) return true;
    if (["false", "0", "no", "off"].includes(key)) return false;
  }

  return fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function safeError(
  error = null,
  fallback = "No se pudieron cargar las facturas."
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

function nextFrame(callback = null) {
  if (!isBrowser() || !isFunction(callback)) return 0;

  if (isFunction(window.requestAnimationFrame)) {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(callback, 0);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    if (isFunction(window.cancelAnimationFrame)) {
      window.cancelAnimationFrame(id);
    }

    window.clearTimeout?.(id);
    return true;
  } catch {
    return false;
  }
}

function isElementVisible(element = null) {
  if (!element || !isBrowser()) return false;

  try {
    if (
      element.hidden ||
      element.getAttribute?.("aria-hidden") === "true"
    ) {
      return false;
    }

    const style = window.getComputedStyle?.(element);

    if (
      style?.display === "none" ||
      style?.visibility === "hidden"
    ) {
      return false;
    }

    return element.getClientRects?.().length > 0;
  } catch {
    return true;
  }
}

function focusableElements(root = null) {
  if (!root || !isBrowser()) return [];

  try {
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((node) => {
        if (
          node.disabled ||
          node.getAttribute?.("aria-disabled") === "true"
        ) {
          return false;
        }

        return isElementVisible(node);
      });
  } catch {
    return [];
  }
}

const FACTURAS_RESEND_CONFIRM_ROOT_ID = "facturas-resend-confirm-root";
let activeResendConfirm = null;

function ensureFacturaResendConfirmRoot() {
  if (!isBrowser()) return null;
  let root = document.getElementById(FACTURAS_RESEND_CONFIRM_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = FACTURAS_RESEND_CONFIRM_ROOT_ID;
    root.dataset.facturasResendConfirmRoot = "true";
    document.body.appendChild(root);
  }
  return root;
}

function confirmFacturaResend({ factura = {}, recipient = "" } = {}) {
  if (!isBrowser()) return Promise.resolve(true);

  const facturaId = getFacturaId(factura);
  if (activeResendConfirm) {
    return activeResendConfirm.facturaId === facturaId
      ? activeResendConfirm.promise
      : Promise.resolve(false);
  }

  const root = ensureFacturaResendConfirmRoot();
  if (!root) return Promise.resolve(false);

  const opener = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  const promise = new Promise((resolve) => {
    root.replaceChildren();

    const overlay = document.createElement("div");
    overlay.className = "facturas-resend-confirm-overlay";
    overlay.dataset.facturasResendConfirmOverlay = "true";

    const dialog = document.createElement("section");
    dialog.className = "facturas-resend-confirm-dialog";
    dialog.dataset.facturasResendConfirmDialog = "true";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "facturas-resend-confirm-title");
    dialog.setAttribute("aria-describedby", "facturas-resend-confirm-description");
    dialog.tabIndex = -1;

    const iconBox = document.createElement("div");
    iconBox.className = "facturas-resend-confirm-icon";
    iconBox.setAttribute("aria-hidden", "true");
    const iconMark = document.createElement("span");
    iconMark.textContent = "↻";
    iconBox.appendChild(iconMark);

    const copy = document.createElement("div");
    copy.className = "facturas-resend-confirm-copy";

    const eyebrow = document.createElement("span");
    eyebrow.className = "facturas-resend-confirm-eyebrow";
    eyebrow.textContent = "Reenvío de factura";

    const title = document.createElement("h3");
    title.id = "facturas-resend-confirm-title";
    title.textContent = "Esta factura ya fue enviada";

    const description = document.createElement("p");
    description.id = "facturas-resend-confirm-description";
    description.textContent = recipient
      ? `Ya existe un envío a ${recipient}. Confirma solo si quieres volver a enviar la misma factura.`
      : "Ya existe un envío registrado. Confirma solo si quieres volver a enviar la misma factura.";

    const meta = document.createElement("div");
    meta.className = "facturas-resend-confirm-meta";

    const invoiceChip = document.createElement("span");
    invoiceChip.textContent = getFacturaLabel(factura) || "Factura";
    meta.appendChild(invoiceChip);

    if (recipient) {
      const recipientChip = document.createElement("span");
      recipientChip.textContent = recipient;
      meta.appendChild(recipientChip);
    }

    copy.append(eyebrow, title, description, meta);

    const actions = document.createElement("div");
    actions.className = "facturas-resend-confirm-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "facturas-resend-confirm-btn facturas-resend-confirm-btn--cancel";
    cancelButton.dataset.facturasResendConfirmAction = "cancel";
    cancelButton.textContent = "Cancelar";

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "facturas-resend-confirm-btn facturas-resend-confirm-btn--confirm";
    confirmButton.dataset.facturasResendConfirmAction = "confirm";
    confirmButton.textContent = "Reenviar factura";

    actions.append(cancelButton, confirmButton);
    dialog.append(iconBox, copy, actions);
    overlay.appendChild(dialog);
    root.appendChild(overlay);
    document.body.classList.add("facturas-resend-confirm-open");

    let settled = false;

    const onRouteChange = () => settle(false);
    const onCancel = () => settle(false);
    const onConfirm = () => settle(true);
    const onOverlayClick = (event) => {
      if (event.target === overlay) settle(false);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = focusableElements(dialog);
      if (!focusables.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const firstNode = focusables[0];
      const lastNode = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus({ preventScroll: true });
      }
    };
    const cleanup = () => {
      dialog.removeEventListener("keydown", onKeydown);
      overlay.removeEventListener("click", onOverlayClick);
      cancelButton.removeEventListener("click", onCancel);
      confirmButton.removeEventListener("click", onConfirm);
      window.removeEventListener("popstate", onRouteChange);
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("pagehide", onRouteChange);
      root.replaceChildren();
      document.body.classList.remove("facturas-resend-confirm-open");
    };
    function settle(value) {
      if (settled) return;
      settled = true;
      cleanup();
      activeResendConfirm = null;
      try { opener?.focus?.({ preventScroll: true }); } catch { /* noop */ }
      resolve(Boolean(value));
    }

    dialog.addEventListener("keydown", onKeydown);
    overlay.addEventListener("click", onOverlayClick);
    cancelButton.addEventListener("click", onCancel);
    confirmButton.addEventListener("click", onConfirm);
    window.addEventListener("popstate", onRouteChange, { once: true });
    window.addEventListener("hashchange", onRouteChange, { once: true });
    window.addEventListener("pagehide", onRouteChange, { once: true });

    nextFrame(() => {
      try { cancelButton.focus({ preventScroll: true }); } catch { /* noop */ }
    });
  });

  activeResendConfirm = { facturaId, promise };
  return promise;
}

/* =========================================================
   CORE / ROLE / ROUTER
========================================================= */

function getState() {
  try {
    if (
      typeof AppCore?.runtimeState?.read ===
      "function"
    ) {
      return (
        AppCore.runtimeState.read() ||
        {}
      );
    }
  } catch {
    // noop
  }

  return {};
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
    AppCore.normalizeRole(
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

function getRouter(context = {}) {
  return (
    context.Router ||
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
    null
  );
}

function getRoutes() {
  return {
    facturas: ROUTES.facturas || "/facturas",
    incidencias: ROUTES.incidencias || "/incidencias",
    clientes: ROUTES.clientes || "/clientes",
    usuarios: ROUTES.usuarios || "/usuarios",
  };
}

/* =========================================================
   FACTURA HELPERS
========================================================= */

function getFacturaId(item = {}) {
  const raw = safeObject(item);

  return cleanText(
    first(
      raw.id,
      raw.facturaId,
      raw.invoiceId,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.numeroFactura,
      raw.numero,
      raw.number
    ),
    ""
  );
}

function getFacturaLabel(item = {}) {
  const raw = safeObject(item);

  return cleanText(
    first(
      raw.numeroFacturaLegal,
      raw.numeroFactura,
      raw.number,
      raw.invoiceNumber,
      raw.facturaId,
      raw.invoiceId,
      raw.id
    ),
    "Factura"
  );
}

function getFacturaEmail(item = {}) {
  const raw = safeObject(item);

  return cleanText(
    first(
      raw.sentTo,
      raw.enviadoA,
      raw.recipientEmail,
      raw.clienteEmail,
      raw.emailCliente,
      raw.clientEmail,
      raw.email,
      raw.cliente?.email,
      raw.clienteSnapshot?.email,
      raw.client?.email,
      raw.customer?.email
    ),
    ""
  );
}

function isFacturaSent(item = {}) {
  const raw = safeObject(item);

  if (
    first(
      raw.sentAt,
      raw.fechaEnvio,
      raw.emailSentAt,
      raw.delivery?.sentAt,
      raw.mail?.sentAt,
      null
    )
  ) {
    return true;
  }

  const explicit = first(
    raw.sent,
    raw.isSent,
    raw.emailSent,
    raw.delivery?.sent,
    raw.mail?.sent,
    null
  );

  if (explicit !== null && explicit !== undefined) {
    return parseBoolean(explicit, false);
  }

  const status = normalizeKey(
    first(raw.estado, raw.status, raw.invoiceStatus, "")
  );

  return ["enviada", "enviado", "sent"].includes(status);
}

function isFacturaPaidState(item = {}) {
  const raw = safeObject(item);

  const status = normalizeKey(
    first(
      raw.paymentStatus,
      raw.estadoPago,
      raw.payment?.status,
      raw.raw?.paymentStatus,
      raw.raw?.estadoPago,
      raw.raw?.payment?.status,
      ""
    )
  );

  return [
    "paid",
    "pagada",
    "pagado",
    "cobrada",
    "cobrado",
    "abonada",
    "abonado",
  ].includes(status);
}

function mergeFacturaData(current = {}, next = {}) {
  const base = safeObject(current, {});
  const incoming = safeObject(next, {});
  const output = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (isObject(output[key]) && isObject(value)) {
      output[key] = mergeFacturaData(output[key], value);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (
      typeof value === "string" &&
      value.trim() === "" &&
      output[key] !== undefined
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0 &&
      Array.isArray(output[key]) &&
      output[key].length
    ) {
      continue;
    }

    output[key] = value;
  }

  return output;
}

function mergeFacturas(
  currentItems = [],
  nextItems = [],
  { append = true } = {}
) {
  const map = new Map();

  const push = (item = {}) => {
    const factura = safeObject(item, null);
    if (!factura) return;

    const id = getFacturaId(factura);
    if (!id) return;

    if (map.has(id)) {
      map.set(id, mergeFacturaData(map.get(id), factura));
      return;
    }

    map.set(id, factura);
  };

  if (append) safeArray(currentItems).forEach(push);
  safeArray(nextItems).forEach(push);

  return [...map.values()];
}

export function mergeFacturasFreshPageFirst(
  currentItems = [],
  freshItems = [],
  replacedPageSize = DEFAULT_BATCH_SIZE
) {
  const freshPage = mergeFacturas([], freshItems, { append: false });
  const freshIds = new Set(freshPage.map((item) => getFacturaId(item)));
  const retainedTail = safeArray(currentItems)
    .slice(
      Math.min(
        safeArray(currentItems).length,
        Math.max(0, Number(replacedPageSize) || freshPage.length)
      )
    )
    .filter((item) => {
      const id = getFacturaId(item);
      return id && !freshIds.has(id);
    });

  return mergeFacturas(freshPage, retainedTail, { append: true });
}

export function facturasFirstPageIdentityMatches(
  currentItems = [],
  freshItems = [],
  pageSize = DEFAULT_BATCH_SIZE
) {
  const size = Math.max(1, Number(pageSize) || DEFAULT_BATCH_SIZE);
  const previousPage = mergeFacturas(
    [],
    safeArray(currentItems).slice(0, size),
    { append: false }
  );
  const freshPage = mergeFacturas([], freshItems, { append: false });

  return previousPage.length === freshPage.length &&
    previousPage.every(
      (item, index) => getFacturaId(item) === getFacturaId(freshPage[index])
    );
}

function upsertFactura(items = [], factura = null, sortMode = "date_desc") {
  const next = safeObject(factura, null);
  if (!next) return safeArray(items);

  const id = getFacturaId(next);
  if (!id) return safeArray(items);

  const current = safeArray(items);
  const index = current.findIndex((item) => getFacturaId(item) === id);

  if (index >= 0) {
    const copy = [...current];
    copy[index] = mergeFacturaData(copy[index], next);
    return copy;
  }

  return normalizeKey(sortMode).endsWith("_asc")
    ? [...current, next]
    : [next, ...current];
}

export function facturasCanOptimisticallyInsertCreated({
  created = null,
  filter = "all",
  search = "",
  hasMore = false,
  sort = "date_desc",
  currentQuery = true,
} = {}) {
  return Boolean(
    created &&
    normalizeKey(filter) === "all" &&
    !cleanText(search, "") &&
    currentQuery === true &&
    (hasMore !== true || normalizeKey(sort) === "date_desc")
  );
}

/* =========================================================
   SEARCH HELPERS
========================================================= */

function getHttpClient() {
  try {
    return AppCore.getHttpClient?.() || AppCore.http || AppCore.Http || null;
  } catch {
    return AppCore.http || AppCore.Http || null;
  }
}

async function requestGet(
  endpoint = "",
  query = {},
  source = "views.facturas"
) {
  const path = cleanText(endpoint, "");

  if (!path) {
    throw new Error("FACTURAS_SEARCH_ENDPOINT_REQUIRED");
  }

  if (isFunction(AppCore.request)) {
    return AppCore.request(path, {
      method: "GET",
      query: safeObject(query),
      source,
    });
  }

  const client = getHttpClient();

  if (isFunction(client?.get)) {
    return client.get(path, {
      query: safeObject(query),
      source,
    });
  }

  if (isFunction(client?.request)) {
    return client.request(path, {
      method: "GET",
      query: safeObject(query),
      source,
    });
  }

  throw new Error("FACTURAS_HTTP_CLIENT_UNAVAILABLE");
}

function unwrapList(payload = null) {
  if (Array.isArray(payload)) return payload;

  const object = safeObject(payload, {});

  return safeArray(
    first(
      object.items,
      object.rows,
      object.results,
      object.records,
      object.list,
      object.data,
      object.clientes,
      object.clients,
      object.customers,
      object.users,
      object.usuarios,
      object.tickets,
      object.incidencias,
      object.data?.items,
      object.data?.rows,
      object.data?.results,
      object.data?.clientes,
      object.data?.clients,
      object.data?.customers,
      object.data?.users,
      object.data?.usuarios,
      object.data?.tickets,
      object.data?.incidencias,
      object.payload?.items,
      object.payload?.clientes,
      object.payload?.users,
      object.payload?.tickets,
      object.payload?.incidencias,
      object.result?.items,
      object.result?.clientes,
      object.result?.users,
      object.result?.tickets,
      object.result?.incidencias,
      []
    )
  );
}

function normalizeClientCandidate(raw = {}) {
  const item = safeObject(raw);

  const id = cleanText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item.userId,
      item.username
    ),
    ""
  );

  const userId = cleanText(
    first(item.userId, item.usuarioId, item.uid, item.id),
    ""
  );

  const clienteId = cleanText(
    first(item.clienteId, item.clientId, item.customerId, id),
    id
  );

  if (!id && !clienteId && !userId) return null;

  const name = cleanText(
    first(
      item.name,
      item.nombre,
      item.displayName,
      item.nombreContacto,
      item.fullName,
      item.razonSocial,
      item.companyName,
      item.empresa,
      item.username
    ),
    id ? `Cliente ${id}` : "Cliente"
  );

  const email = cleanText(
    first(
      item.email,
      item.mail,
      item.emailCliente,
      item.clienteEmail,
      item.clientEmail,
      item.emailLower
    ),
    ""
  ).toLowerCase();

  const avatarUrl = cleanText(
    first(
      item.avatarUrl,
      item.avatar,
      item.logoUrl,
      item.logo,
      item.photoUrl,
      item.picture,
      item.userAvatarUrl,
      item.clientAvatarUrl,
      item.profile?.avatarUrl,
      ""
    ),
    ""
  );

  return {
    ...item,
    id: clienteId || userId || id,
    clienteId: clienteId || id,
    clientId: clienteId || id,
    userId,
    name,
    nombre: name,
    displayName: name,
    nombreContacto: cleanText(
      first(item.nombreContacto, item.contactName, name),
      name
    ),
    razonSocial: cleanText(
      first(item.razonSocial, item.companyName, item.empresa, name),
      name
    ),
    email,
    telefono: cleanText(
      first(item.telefono, item.phone, item.mobile, item.movil),
      ""
    ),
    nif: cleanText(
      first(item.nif, item.cif, item.taxId, item.vatId),
      ""
    ),
    username: cleanText(
      first(
        item.username,
        item.slug,
        email ? email.split("@")[0] : ""
      ),
      ""
    ),
    avatarUrl,
    avatar: avatarUrl,
    subtitle: cleanText(
      first(
        email,
        item.razonSocial && item.razonSocial !== name
          ? item.razonSocial
          : "",
        item.telefono,
        item.nif,
        clienteId || userId || id
      ),
      clienteId || userId || id
    ),
  };
}

function normalizeTicketCandidate(raw = {}) {
  const item = safeObject(raw);

  const id = cleanText(
    first(item.ticketId, item.incidenciaId, item.id, item.code, item.numero),
    ""
  );

  if (!id) return null;

  const subject = cleanText(
    first(
      item.subject,
      item.asunto,
      item.title,
      item.name,
      item.preview,
      item.description
    ),
    id
  );

  const status = cleanText(
    first(item.status, item.estado, item.state),
    ""
  );

  const category = cleanText(
    first(item.category, item.categoria, item.tipo),
    ""
  );

  return {
    ...item,
    id,
    ticketId: id,
    incidenciaId: id,
    subject,
    asunto: subject,
    title: subject,
    clienteId: cleanText(
      first(item.clienteId, item.clientId, item.cliente?.clienteId),
      ""
    ),
    userId: cleanText(
      first(item.userId, item.usuarioId, item.userRef?.userId),
      ""
    ),
    status,
    estado: status,
    category,
    categoria: category,
    facturaLinked: Boolean(
      item.facturaLinked ||
        item.meta?.facturaLinked ||
        item.meta?.hasFactura ||
        item.facturaId ||
        item.invoiceId
    ),
    subtitle:
      [
        status ? `Estado: ${status}` : "",
        category ? `Tipo: ${category}` : "",
        item.facturaLinked || item.meta?.hasFactura
          ? "Ya facturada"
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || id,
  };
}

function dedupeClients(items = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeClientCandidate(item);
    if (!normalized?.id) continue;

    const key =
      normalized.clienteId ||
      normalized.userId ||
      normalized.id;

    if (!map.has(key)) map.set(key, normalized);
  }

  return [...map.values()].slice(0, SEARCH_LIMIT);
}

function selectedClienteIds(clients = []) {
  return [
    ...new Set(
      safeArray(clients)
        .map((item) =>
          cleanText(first(item.clienteId, item.id), "")
        )
        .filter(Boolean)
    ),
  ];
}

function selectedUserIds(clients = []) {
  return [
    ...new Set(
      safeArray(clients)
        .map((item) => cleanText(item.userId, ""))
        .filter(Boolean)
    ),
  ];
}

function ticketBelongsToClients(ticket = {}, clients = []) {
  const selected = safeArray(clients);
  if (!selected.length) return true;

  const ticketClienteId = cleanText(ticket.clienteId, "");
  const ticketUserId = cleanText(ticket.userId, "");

  if (!ticketClienteId && !ticketUserId) return false;

  return selected.some((client) => {
    const clienteId = cleanText(first(client.clienteId, client.id), "");
    const userId = cleanText(client.userId, "");

    return (
      (clienteId && ticketClienteId === clienteId) ||
      (userId && ticketUserId === userId)
    );
  });
}

function dedupeTickets(items = [], selectedClientes = []) {
  const map = new Map();

  for (const item of safeArray(items)) {
    const normalized = normalizeTicketCandidate(item);

    if (!normalized?.id) continue;
    if (!ticketBelongsToClients(normalized, selectedClientes)) continue;

    if (!map.has(normalized.id)) {
      map.set(normalized.id, normalized);
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      const left = Date.parse(
        a.updatedAt || a.lastActivityAt || a.createdAt || 0
      );

      const right = Date.parse(
        b.updatedAt || b.lastActivityAt || b.createdAt || 0
      );

      return (
        (Number.isFinite(right) ? right : 0) -
        (Number.isFinite(left) ? left : 0)
      );
    })
    .slice(0, TICKET_LIMIT);
}

async function searchClients(query = "") {
  const q = cleanText(query, "");

  if (!isAdmin() || q.length < SEARCH_MIN_LENGTH) return [];

  let lastError = null;

  for (const endpoint of CLIENT_SEARCH_ENDPOINTS) {
    try {
      const response = await requestGet(
        endpoint,
        {
          q,
          search: q,
          query: q,
          term: q,
          text: q,
          limit: SEARCH_LIMIT,
          includeTotal: false,
        },
        "views.facturas.client-search"
      );

      const items = dedupeClients(unwrapList(response));
      if (items.length) return items;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

async function searchTickets(query = "", selectedClientes = []) {
  const q = cleanText(query, "");
  const clienteIds = selectedClienteIds(selectedClientes);
  const userIds = selectedUserIds(selectedClientes);

  if (!safeArray(selectedClientes).length) return [];

  let lastError = null;

  for (const endpoint of TICKET_SEARCH_ENDPOINTS) {
    try {
      const response = await requestGet(
        endpoint,
        {
          ...(q ? { q, search: q } : {}),
          limit: TICKET_LIMIT,
          includeTotal: false,
          includeClosed: true,
          includeAll: true,
          onlyMine: false,
          ...(clienteIds[0] ? { clienteId: clienteIds[0] } : {}),
          ...(userIds[0] ? { userId: userIds[0] } : {}),
          ...(clienteIds.length
            ? { clienteIds: clienteIds.join(",") }
            : {}),
          ...(userIds.length
            ? { userIds: userIds.join(",") }
            : {}),
        },
        "views.facturas.ticket-search"
      );

      const items = dedupeTickets(
        unwrapList(response),
        selectedClientes
      );

      if (items.length) return items;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

/* =========================================================
   BODY / DOCUMENTS
========================================================= */

function syncBodyModalClass(
  open = false,
  { detailOpen = false, createOpen = false } = {}
) {
  if (!isBrowser()) return false;

  try {
    document.body?.classList.toggle("modal-open", open);
    document.body?.classList.toggle("facturas-modal-open", open);
    document.body?.classList.toggle("facturas-detail-open", detailOpen);
    document.body?.classList.toggle("facturas-create-open", createOpen);
    document.body?.classList.toggle(
      "facturas-create-modal-open",
      createOpen
    );

    return true;
  } catch {
    return false;
  }
}

function safeDocumentUrl(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function openUrl(url = "") {
  if (!isBrowser()) return false;

  const target = safeDocumentUrl(url);
  if (!target) return false;

  try {
    window.open(target, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

function isBlob(value = null) {
  return Boolean(
    typeof Blob !== "undefined" &&
    value instanceof Blob
  );
}

function isResponse(value = null) {
  return Boolean(
    typeof Response !== "undefined" &&
    value instanceof Response
  );
}

function getContentType(value = null) {
  return cleanText(
    value?.type ||
      value?.headers?.get?.("content-type") ||
      value?.contentType ||
      value?.mimeType ||
      value?.mimetype ||
      "",
    ""
  ).toLowerCase();
}

function isJsonContentType(type = "") {
  const contentType = cleanText(type, "").toLowerCase();

  return (
    contentType.includes("application/json") ||
    contentType.includes("text/json") ||
    contentType.includes("+json") ||
    contentType.includes("text/plain")
  );
}

function isPdfContentType(type = "") {
  return cleanText(type, "")
    .toLowerCase()
    .includes("application/pdf");
}

function isPdfUrl(url = "") {
  const value = cleanText(url, "");
  if (!value) return false;

  return (
    /\.pdf(?:[?#]|$)/i.test(value) ||
    /rsct=application%2Fpdf/i.test(value) ||
    /rsct=application\/pdf/i.test(value)
  );
}

async function blobStartsWithPdf(blob = null) {
  if (!isBlob(blob)) return false;

  try {
    return (await blob.slice(0, 5).text()) === "%PDF-";
  } catch {
    return false;
  }
}

async function readJsonBlob(blob = null) {
  if (!isBlob(blob)) return null;

  try {
    if (await blobStartsWithPdf(blob)) return null;

    const clean = String(await blob.text()).trim();

    if (
      !clean ||
      (!clean.startsWith("{") && !clean.startsWith("["))
    ) {
      return null;
    }

    return JSON.parse(clean);
  } catch {
    return null;
  }
}

async function readJsonResponse(response = null) {
  if (!isResponse(response)) return null;

  try {
    const type = getContentType(response);

    if (isPdfContentType(type)) return null;

    const clone = response.clone?.() || response;

    if (isJsonContentType(type)) {
      return await clone.json();
    }

    const clean = String(await clone.text()).trim();

    if (
      !clean ||
      (!clean.startsWith("{") && !clean.startsWith("["))
    ) {
      return null;
    }

    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function getFacturaPdfFilename(
  payload = null,
  fallback = "factura.pdf"
) {
  const data = safeObject(payload, {});

  const filename = cleanText(
    first(
      data.filename,
      data.fileName,
      data.name,
      data.originalName,

      data.file?.filename,
      data.file?.fileName,
      data.file?.name,

      data.pdf?.filename,
      data.pdf?.fileName,
      data.pdf?.name,

      data.document?.filename,
      data.document?.fileName,
      data.document?.name,

      data.factura?.document?.filename,
      data.factura?.document?.fileName,

      data.factura?.numeroFacturaLegal
        ? `${data.factura.numeroFacturaLegal}.pdf`
        : "",

      data.item?.numeroFacturaLegal
        ? `${data.item.numeroFacturaLegal}.pdf`
        : "",

      data.data?.numeroFacturaLegal
        ? `${data.data.numeroFacturaLegal}.pdf`
        : "",

      data.invoice?.numeroFacturaLegal
        ? `${data.invoice.numeroFacturaLegal}.pdf`
        : "",

      data.numeroFacturaLegal
        ? `${data.numeroFacturaLegal}.pdf`
        : "",

      data.invoiceNumber
        ? `${data.invoiceNumber}.pdf`
        : ""
    ),
    fallback
  );

  return filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`;
}

function pickFacturaPdfUrl(payload = null, mode = "view") {
  const data = safeObject(payload, {});
  const download = mode === "download";

  return safeDocumentUrl(
    cleanText(
      first(
        download ? data.downloadUrl : data.viewUrl,
        data.signedUrl,
        data.sasUrl,
        data.url,

        download ? data.file?.downloadUrl : data.file?.viewUrl,
        data.file?.signedUrl,
        data.file?.sasUrl,
        data.file?.url,

        download ? data.pdf?.downloadUrl : data.pdf?.viewUrl,
        data.pdf?.signedUrl,
        data.pdf?.sasUrl,
        data.pdf?.url,

        download ? data.document?.downloadUrl : data.document?.viewUrl,
        data.document?.signedUrl,
        data.document?.sasUrl,
        data.document?.pdfUrl,
        data.document?.blobUrl,
        data.document?.url,

        download
          ? data.factura?.document?.downloadUrl
          : data.factura?.document?.viewUrl,
        data.factura?.document?.signedUrl,
        data.factura?.document?.sasUrl,
        data.factura?.document?.pdfUrl,
        data.factura?.document?.blobUrl,
        data.factura?.document?.url,

        download ? data.factura?.downloadUrl : data.factura?.viewUrl,
        data.factura?.signedUrl,
        data.factura?.sasUrl,
        data.factura?.pdfUrl,
        data.factura?.blobUrl,

        download ? data.item?.downloadUrl : data.item?.viewUrl,
        data.item?.signedUrl,
        data.item?.sasUrl,
        data.item?.pdfUrl,
        data.item?.blobUrl,

        download ? data.data?.downloadUrl : data.data?.viewUrl,
        data.data?.signedUrl,
        data.data?.sasUrl,
        data.data?.pdfUrl,
        data.data?.blobUrl,

        download ? data.invoice?.downloadUrl : data.invoice?.viewUrl,
        data.invoice?.signedUrl,
        data.invoice?.sasUrl,
        data.invoice?.pdfUrl,
        data.invoice?.blobUrl
      ),
      ""
    )
  );
}

async function resolveBlobPdfResult(
  blob = null,
  { mode = "view", payload = null, objectUrls = null } = {}
) {
  if (!isBlob(blob)) {
    return {
      url: "",
      filename: getFacturaPdfFilename(payload),
      payload,
    };
  }

  const type = getContentType(blob);

  if (isJsonContentType(type)) {
    const json = await readJsonBlob(blob);

    return {
      url: pickFacturaPdfUrl(json, mode),
      filename: getFacturaPdfFilename(json),
      payload: json,
    };
  }

  if (
    isPdfContentType(type) ||
    await blobStartsWithPdf(blob)
  ) {
    const objectUrl = URL.createObjectURL(blob);
    objectUrls?.add?.(objectUrl);

    return {
      url: objectUrl,
      filename: getFacturaPdfFilename(payload),
      payload,
    };
  }

  const json = await readJsonBlob(blob);

  if (json) {
    return {
      url: pickFacturaPdfUrl(json, mode),
      filename: getFacturaPdfFilename(json),
      payload: json,
    };
  }

  return {
    url: "",
    filename: getFacturaPdfFilename(payload),
    payload,
  };
}

async function resolveFacturaPdfResult(
  result = null,
  { mode = "view", objectUrls = null } = {}
) {
  if (typeof result === "string") {
    return {
      url: safeDocumentUrl(result),
      filename: "factura.pdf",
      payload: null,
    };
  }

  if (isResponse(result)) {
    if (isPdfContentType(getContentType(result))) {
      return resolveBlobPdfResult(
        await result.blob(),
        { mode, payload: null, objectUrls }
      );
    }

    const json = await readJsonResponse(result);

    return {
      url: pickFacturaPdfUrl(json, mode),
      filename: getFacturaPdfFilename(json),
      payload: json,
    };
  }

  if (isBlob(result)) {
    return resolveBlobPdfResult(
      result,
      { mode, payload: null, objectUrls }
    );
  }

  const payload = safeObject(result, null);
  const url = pickFacturaPdfUrl(payload, mode);

  if (url) {
    return {
      url,
      filename: getFacturaPdfFilename(payload),
      payload,
    };
  }

  if (isBlob(result?.blob)) {
    const resolved = await resolveBlobPdfResult(
      result.blob,
      { mode, payload, objectUrls }
    );

    if (resolved.url) return resolved;

    if (resolved.payload) {
      return {
        ...resolved,
        url: pickFacturaPdfUrl(resolved.payload, mode),
        filename: getFacturaPdfFilename(resolved.payload),
      };
    }
  }

  const objectUrl = cleanText(result?.objectUrl, "");

  if (objectUrl) {
    if (objectUrl.startsWith("blob:")) {
      try {
        const response = await fetch(objectUrl);
        const blob = await response.blob();

        const resolved = await resolveBlobPdfResult(
          blob,
          { mode, payload, objectUrls }
        );

        if (resolved.url) return resolved;

        if (resolved.payload) {
          return {
            ...resolved,
            url: pickFacturaPdfUrl(resolved.payload, mode),
            filename: getFacturaPdfFilename(resolved.payload),
          };
        }
      } catch {
        // noop
      }
    }

    if (isPdfUrl(objectUrl)) {
      return {
        url: safeDocumentUrl(objectUrl),
        filename: getFacturaPdfFilename(payload),
        payload,
      };
    }
  }

  return {
    url: "",
    filename: getFacturaPdfFilename(payload),
    payload,
  };
}

function openPendingWindow(title = "Abriendo factura…") {
  if (!isBrowser()) return null;

  try {
    const popup = window.open("about:blank", "_blank");
    if (!popup) return null;

    try {
      popup.opener = null;
    } catch {
      // noop
    }

    try {
      popup.document.title = title;

      const body = popup.document.body;
      body.style.margin = "0";
      body.style.background = "#111";
      body.style.color = "#fff";
      body.style.fontFamily =
        "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      body.style.display = "grid";
      body.style.placeItems = "center";
      body.style.minHeight = "100vh";

      const loading = popup.document.createElement("div");
      loading.textContent = title;
      loading.style.fontSize = "14px";
      loading.style.fontWeight = "700";
      loading.style.opacity = ".86";

      body.replaceChildren(loading);
    } catch {
      // noop
    }

    return popup;
  } catch {
    return null;
  }
}

function navigateWindowOrOpen(url = "", popup = null) {
  const target = safeDocumentUrl(url);
  if (!target) return false;

  try {
    if (popup && !popup.closed) {
      popup.location.replace(target);
      return true;
    }
  } catch {
    // noop
  }

  return openUrl(target);
}

function closePendingWindow(popup = null) {
  try {
    if (popup && !popup.closed) {
      popup.close();
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function triggerDownloadLink(
  url = "",
  filename = "factura.pdf"
) {
  if (!isBrowser()) return false;

  const target = safeDocumentUrl(url);
  if (!target) return false;

  try {
    const link = document.createElement("a");

    link.href = target;
    link.download = getFacturaPdfFilename({ filename }, "factura.pdf");
    link.rel = "noopener";
    link.target = "_blank";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    return true;
  } catch {
    return openUrl(target);
  }
}

async function downloadRemotePdf(
  url = "",
  filename = "factura.pdf",
  objectUrls = null
) {
  if (!isBrowser()) return false;

  const target = safeDocumentUrl(url);
  if (!target) return false;

  const safeFilename =
    getFacturaPdfFilename({ filename }, "factura.pdf");

  try {
    const response = await fetch(target, {
      method: "GET",
      credentials: "omit",
    });

    if (response.ok) {
      const blob = await response.blob();

      if (
        isPdfContentType(getContentType(blob)) ||
        await blobStartsWithPdf(blob)
      ) {
        const objectUrl = URL.createObjectURL(blob);
        objectUrls?.add?.(objectUrl);

        return triggerDownloadLink(
          objectUrl,
          safeFilename
        );
      }
    }
  } catch {
    // SAS directo como fallback.
  }

  return triggerDownloadLink(target, safeFilename);
}

function downloadTextFile(
  filename = "facturas.csv",
  content = ""
) {
  if (!isBrowser()) return false;

  try {
    const blob = new Blob([content], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // noop
      }
    }, 1000);

    return true;
  } catch {
    return false;
  }
}

function csvCell(value = "") {
  const text = String(value ?? "").replace(/"/g, '""');

  const safe =
    /^[=+\-@]/.test(text)
      ? `'${text}`
      : text;

  return `"${safe}"`;
}

function exportCsv(rows = []) {
  const data = safeArray(rows);

  const header = [
    "Factura",
    "Cliente",
    "Email",
    "Estado pago",
    "Total",
    "Incidencia",
    "Fecha",
  ];

  const lines = data.map((item) =>
    [
      getFacturaLabel(item),
      cleanText(
        first(
          item.clientName,
          item.clienteNombre,
          item.clienteName,
          item.customerName,
          item.cliente?.nombre
        ),
        ""
      ),
      cleanText(
        first(
          item.clienteEmail,
          item.emailCliente,
          item.clientEmail,
          item.email,
          item.cliente?.email
        ),
        ""
      ),
      cleanText(first(item.paymentStatus, item.estadoPago), ""),
      cleanText(first(item.total, item.amount, item.importe), ""),
      cleanText(
        first(
          item.ticketId,
          item.incidenciaId,
          item.relatedTicketId
        ),
        ""
      ),
      cleanText(
        first(
          item.issuedAt,
          item.fechaFactura,
          item.fechaEmision,
          item.createdAt
        ),
        ""
      ),
    ]
      .map(csvCell)
      .join(";")
  );

  return downloadTextFile(
    "facturas.csv",
    [
      header.map(csvCell).join(";"),
      ...lines,
    ].join("\n")
  );
}

/* =========================================================
   FORM
========================================================= */

function readField(form = null, name = "") {
  if (!form || !name) return "";

  const field = form.querySelector?.(
    `[data-field="${name}"], [name="${name}"]`
  );

  if (!field) return "";

  if (field.type === "checkbox") {
    return Boolean(field.checked);
  }

  if (field.tagName === "TEXTAREA") {
    return multilineValue(field.value).trim();
  }

  return cleanText(field.value, "");
}

function clientIndexFromNode(node = null) {
  const index = Number(node?.dataset?.clientIndex || "");
  return Number.isInteger(index) ? index : -1;
}

function ticketIndexFromNode(node = null) {
  const index = Number(node?.dataset?.ticketIndex || "");
  return Number.isInteger(index) ? index : -1;
}

function facturaIdFromNode(node = null) {
  return cleanText(
    first(
      node?.dataset?.facturaId,
      node?.dataset?.invoiceId,
      node?.dataset?.id,
      node?.closest?.("[data-factura-id]")?.dataset?.facturaId,
      ""
    ),
    ""
  );
}

/* =========================================================
   CONTROLLER
========================================================= */

function createFacturasController(host = null, context = {}) {
  let destroyed = false;
  let mounted = false;

  const controllerOwner =
    `${FACTURAS_VIEW_VERSION}:${++FACTURAS_CONTROLLER_SEQUENCE}`;

  const cache = safeObject(
    hydrateFacturasFromCache?.(),
    {}
  );

  let items = safeArray(cache.items);
  let itemsContextKey = cleanText(cache.contextKey, "");
  let total = Math.max(
    number(cache.total, items.length),
    items.length
  );
  let totalKnown = cache.totalKnown === true;
  let authoritativeStats = null;
  let authoritativeStatsLoading = false;
  let authoritativeStatsSeq = 0;

  let loading = false;
  let refreshing = false;
  let loadingMore = false;
  let creating = false;
  let error = "";
  let loadMoreError = "";

  let page = Math.max(
    DEFAULT_PAGE,
    number(cache.page, DEFAULT_PAGE)
  );
  const cachedHasMore = Boolean(
    items.length &&
    (cache.hasMore === true || total > items.length)
  );
  let nextPage =
    cachedHasMore
      ? Math.max(
          page + 1,
          number(
            cache.nextPage,
            Math.floor(items.length / DEFAULT_BATCH_SIZE) + 1
          )
        )
      : null;

  let pageSize = DEFAULT_BATCH_SIZE;
  let hasMore = cachedHasMore;

  let filter = "all";
  let search = "";
  let sort = "date_desc";

  let openingFacturaId = "";
  let viewingFacturaId = "";
  let downloadingFacturaId = "";
  let sendingFacturaId = "";
  let markingPaidFacturaId = "";

  let listSeq = 0;
  let clientSearchSeq = 0;
  let ticketSearchSeq = 0;
  let detailSessionSeq = 0;

  let listSearchTimer = null;
  let listSearchComposing = false;
  let clientSearchTimer = null;
  let ticketSearchTimer = null;

  let infiniteObserver = null;
  let infiniteScrollRoot = null;
  let scrollTicking = false;

  let renderFrame = 0;
  let pendingRenderOptions = null;
  let deferredRenderOptions = null;

  let detailRenderFrame = 0;
  let pendingDetailRenderOptions = null;
  let detailModalHost = null;
  let detailModalHostBound = false;

  let createRenderFrame = 0;
  let pendingCreateRenderOptions = null;
  let createModalHost = null;
  let createModalHostBound = false;

  let modalReturnFocus = null;

  const objectUrls = new Set();

  const createModal = {
    open: false,
    canCreate: isAdmin(),
    submitting: false,
    serverError: "",
    successMessage: "",
    createdFacturaId: "",
    errors: {},
    form: getFacturaCreateFormDefaults(),
    selectedClientes: [],
    selectedTickets: [],

    clientSearch: {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    },

    ticketSearch: {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    },
  };

  const detailModal = {
    open: false,
    detailOpen: false,
    detailLoading: false,
    factura: null,
    markingPaidFacturaId: "",
    sendingFacturaId: "",
    viewingFacturaId: "",
    downloadingFacturaId: "",
    feedbackMessage: "",
    feedbackType: "info",
  };

  /* ---------------------------------------------------------
     Lifecycle helpers
  --------------------------------------------------------- */

  function clearCreateTimers() {
    if (clientSearchTimer) {
      window.clearTimeout(clientSearchTimer);
      clientSearchTimer = null;
    }

    if (ticketSearchTimer) {
      window.clearTimeout(ticketSearchTimer);
      ticketSearchTimer = null;
    }
  }

  function cancelListSearchTimer() {
    if (listSearchTimer) {
      window.clearTimeout(listSearchTimer);
      listSearchTimer = null;
      return true;
    }

    return false;
  }

  function clearTimers() {
    cancelListSearchTimer();
    clearCreateTimers();
  }

  function disposeInfiniteObserver(observer = null) {
    if (!observer) return false;
    try {
      observer.takeRecords?.();
      observer.disconnect?.();
    } catch {
      // noop
    }

    return true;
  }

  function disconnectInfiniteObserver() {
    const observer = infiniteObserver;
    infiniteObserver = null;
    return disposeInfiniteObserver(observer);
  }

  function resolveInfiniteScrollRoot() {
    if (!isBrowser()) return null;
    const mainContent = document.getElementById("main-content");
    if (mainContent?.contains?.(host)) return mainContent;
    return host?.closest?.(".main-content, [data-main-content='true']") || null;
  }

  function revokeObjectUrls() {
    for (const url of objectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // noop
      }
    }

    objectUrls.clear();
  }

  /* ---------------------------------------------------------
     Modal focus / body
  --------------------------------------------------------- */

  function detailModalIsOpen() {
    return (
      detailModal.open === true ||
      detailModal.detailOpen === true
    );
  }

  function anyModalIsOpen() {
    return (
      createModal.open === true ||
      detailModalIsOpen()
    );
  }

  function syncModalBodyState() {
    return syncBodyModalClass(
      createModal.open || detailModalIsOpen(),
      {
        createOpen: createModal.open,
        detailOpen: detailModalIsOpen(),
      }
    );
  }

  function ownsNode(node = null) {
    return Boolean(
      node &&
      (
        host?.contains?.(node) ||
        createModalHost?.contains?.(node) ||
        detailModalHost?.contains?.(node)
      )
    );
  }

  function rememberModalReturnFocus(explicitNode = null) {
    if (!isBrowser()) return false;

    const snapshotFor = (node = null) => {
      if (!node) return null;
      const row = node.closest?.("[data-facturas-row='true']");
      const actionNode = node.closest?.(
        "[data-facturas-action], [data-action]"
      );
      return {
        node,
        elementId: cleanText(node.id, ""),
        facturaId: cleanText(row?.dataset?.facturaId, ""),
        action: cleanText(
          actionNode?.dataset?.facturasAction ||
          actionNode?.dataset?.action ||
          "",
          ""
        ),
      };
    };

    if (
      explicitNode?.isConnected &&
      !createModalHost?.contains?.(explicitNode) &&
      !detailModalHost?.contains?.(explicitNode)
    ) {
      modalReturnFocus = snapshotFor(explicitNode);
      return true;
    }

    if (anyModalIsOpen()) return false;

    const active = document.activeElement;

    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !createModalHost?.contains?.(active) &&
      !detailModalHost?.contains?.(active)
    ) {
      modalReturnFocus = snapshotFor(active);
    }

    return true;
  }

  function restoreModalReturnFocus() {
    const snapshot = modalReturnFocus;
    modalReturnFocus = null;

    if (!isBrowser() || !snapshot) {
      return false;
    }

    nextFrame(() => {
      let target = snapshot.node?.isConnected
        ? snapshot.node
        : null;

      if (!target && snapshot.elementId) {
        const candidate = document.getElementById(snapshot.elementId);
        if (candidate && host?.contains?.(candidate)) target = candidate;
      }

      if (!target && snapshot.facturaId) {
        const row = [...host.querySelectorAll("[data-facturas-row='true']")]
          .find((candidate) =>
            cleanText(candidate?.dataset?.facturaId, "") === snapshot.facturaId
          ) || null;
        if (row && snapshot.action) {
          target = [...row.querySelectorAll(
            "[data-facturas-action], [data-action]"
          )].find((candidate) =>
            cleanText(
              candidate?.dataset?.facturasAction ||
              candidate?.dataset?.action ||
              "",
              ""
            ) === snapshot.action
          ) || row;
        } else {
          target = row;
        }
      }

      if (!target && snapshot.action) {
        target = [...host.querySelectorAll(
          "[data-facturas-action], [data-action]"
        )].find((candidate) =>
          cleanText(
            candidate?.dataset?.facturasAction ||
            candidate?.dataset?.action ||
            "",
            ""
          ) === snapshot.action
        ) || null;
      }

      target = target ||
        host.querySelector("[data-facturas-infinite='true']") ||
        host.querySelector("#facturas-empty-state") ||
        host.querySelector("#facturas-list-status") ||
        host.querySelector(".facturas-history-title");

      if (!target || !isFunction(target.focus)) return;

      try {
        target.focus({ preventScroll: true });
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

  function currentModalPanel() {
    if (detailModalIsOpen() && detailModalHost?.isConnected) {
      return detailModalHost.querySelector(
        DETAIL_MODAL_PANEL_SELECTOR
      );
    }

    if (createModal.open && createModalHost?.isConnected) {
      return createModalHost.querySelector(
        CREATE_MODAL_PANEL_SELECTOR
      );
    }

    return null;
  }

  function trapModalFocus(event = null) {
    if (event?.key !== "Tab" || !anyModalIsOpen()) return false;

    const panel = currentModalPanel();
    if (!panel) return false;

    const focusables = focusableElements(panel);

    if (!focusables.length) {
      event.preventDefault();

      try {
        panel.focus({ preventScroll: true });
      } catch {
        panel.focus?.();
      }

      return true;
    }

    const firstNode = focusables[0];
    const lastNode = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!panel.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? lastNode : firstNode).focus?.();
      return true;
    }

    if (event.shiftKey && active === firstNode) {
      event.preventDefault();
      lastNode.focus?.();
      return true;
    }

    if (!event.shiftKey && active === lastNode) {
      event.preventDefault();
      firstNode.focus?.();
      return true;
    }

    return false;
  }

  /* ---------------------------------------------------------
     Render helpers
  --------------------------------------------------------- */

  function mergeRenderOptions(current = {}, next = {}) {
    return {
      ...current,
      ...next,
      focusSelector:
        next.focusSelector ||
        current.focusSelector ||
        "",
      focusEnd:
        next.focusEnd !== undefined
          ? next.focusEnd
          : current.focusEnd,
      preserveFocus:
        next.preserveFocus !== undefined
          ? next.preserveFocus
          : current.preserveFocus,
      forceShell:
        next.forceShell !== undefined
          ? next.forceShell
          : current.forceShell,
    };
  }

  function focusAfterRender(
    selector = "",
    placeEnd = true,
    root = host
  ) {
    if (!selector || !root) return false;

    try {
      const node = root.querySelector(selector);
      if (!node) return false;

      node.focus({ preventScroll: true });

      if (
        placeEnd &&
        isFunction(node.setSelectionRange)
      ) {
        const end = String(node.value || "").length;
        node.setSelectionRange(end, end);
      }

      return true;
    } catch {
      return false;
    }
  }

  function captureStableListFocus() {
    if (!isBrowser() || !host) return null;

    const active = document.activeElement;
    if (!active || !host.contains(active)) return null;

    const row = active.closest?.("[data-facturas-row='true']");
    const facturaId = cleanText(row?.dataset?.facturaId, "");

    const actionNode = active.closest?.(
      "[data-facturas-action], [data-action]"
    );
    const action = actionNode && (!row || row.contains(actionNode))
      ? cleanText(
          actionNode?.dataset?.facturasAction ||
          actionNode?.dataset?.action ||
          "",
          ""
        )
      : "";
    const actionScope = row || host;
    const actionPeers = action
      ? [...actionScope.querySelectorAll("[data-facturas-action], [data-action]")]
          .filter((node) => cleanText(
            node?.dataset?.facturasAction || node?.dataset?.action || "",
            ""
          ) === action)
      : [];

    return {
      facturaId,
      action,
      actionIndex: actionNode ? Math.max(0, actionPeers.indexOf(actionNode)) : 0,
      rowFocused: active === row,
      elementId: cleanText(active.id, ""),
      field: cleanText(active.getAttribute?.("data-field"), ""),
      filter: cleanText(actionNode?.getAttribute?.("data-filter"), ""),
      sort: cleanText(actionNode?.getAttribute?.("data-sort"), ""),
      sortKey: cleanText(actionNode?.getAttribute?.("data-sort-key"), ""),
      inputValue:
        cleanText(active.getAttribute?.("data-field"), "") === "search"
          ? String(active.value ?? "")
          : null,
      selectionStart: Number.isInteger(active.selectionStart)
        ? active.selectionStart
        : null,
      selectionEnd: Number.isInteger(active.selectionEnd)
        ? active.selectionEnd
        : null,
      feedFocused: Boolean(active.closest?.("[data-facturas-infinite='true']")),
    };
  }

  function restoreStableListFocus(state = null) {
    if (!state || !host || !isBrowser()) return false;

    const row = state.facturaId
      ? [...host.querySelectorAll("[data-facturas-row='true']")]
          .find((node) => cleanText(node?.dataset?.facturaId, "") === state.facturaId)
      : null;

    let target = row || null;
    if (row && !state.rowFocused && state.action) {
      const candidates = [
        ...row.querySelectorAll("[data-facturas-action], [data-action]"),
      ].filter((node) => cleanText(
        node?.dataset?.facturasAction || node?.dataset?.action || "",
        ""
      ) === state.action);
      target = candidates[state.actionIndex] || candidates[0] || row;
    }

    if (!target && state.elementId) {
      const candidate = document.getElementById(state.elementId);
      if (candidate && host.contains(candidate)) target = candidate;
    }

    if (!target && state.field) {
      target = [...host.querySelectorAll("[data-field]")]
        .find((node) => cleanText(node.getAttribute("data-field"), "") === state.field) || null;
    }

    if (!target && state.action) {
      const candidates = [
        ...host.querySelectorAll("[data-facturas-action], [data-action]"),
      ].filter((node) => {
        const action = cleanText(
          node?.dataset?.facturasAction || node?.dataset?.action || "",
          ""
        );
        const filter = cleanText(node.getAttribute?.("data-filter"), "");
        const sort = cleanText(node.getAttribute?.("data-sort"), "");
        const sortKey = cleanText(node.getAttribute?.("data-sort-key"), "");
        return action === state.action &&
          (!state.filter || filter === state.filter) &&
          (!state.sortKey || sortKey === state.sortKey) &&
          (!state.sort || state.action === FACTURAS_ACTIONS.SORT || sort === state.sort);
      });
      target = candidates[state.actionIndex] || candidates[0] || null;
    }

    if (!target && state.action === FACTURAS_ACTIONS.CLEAR_SEARCH) {
      target = host.querySelector("[data-field='search']");
    }

    if (!target && state.action === FACTURAS_ACTIONS.CLEAR_FILTERS) {
      target = host.querySelector(
        `[data-facturas-action="${FACTURAS_ACTIONS.FILTER}"][data-filter="all"]`
      );
    }

    if (
      !target &&
      (state.feedFocused || state.action === FACTURAS_ACTIONS.RETRY_PAGE)
    ) {
      target = host.querySelector("[data-facturas-infinite='true']");
    }

    if (!target && state.elementId === "facturas-list-status") {
      target =
        host.querySelector("[data-facturas-infinite='true']") ||
        host.querySelector("#facturas-empty-state");
    }

    if (!target) return false;

    if (target?.disabled || target?.getAttribute?.("aria-disabled") === "true") {
      target = row || (
        state.action === FACTURAS_ACTIONS.REFRESH
          ? (
              host.querySelector("[data-facturas-infinite='true']") ||
              host.querySelector("#facturas-list-status") ||
              host.querySelector("#facturas-empty-state")
            )
          : null
      );
    }

    if (!target) return false;

    try {
      if (
        state.field === "search" &&
        typeof state.inputValue === "string" &&
        "value" in target
      ) {
        target.value = state.inputValue;
      }
      target.focus({ preventScroll: true });
      if (
        Number.isInteger(state.selectionStart) &&
        Number.isInteger(state.selectionEnd) &&
        isFunction(target.setSelectionRange)
      ) {
        const max = String(target.value || "").length;
        target.setSelectionRange(
          Math.min(state.selectionStart, max),
          Math.min(state.selectionEnd, max)
        );
      }
      return document.activeElement === target;
    } catch {
      try {
        target.focus?.();
        return document.activeElement === target;
      } catch {
        return false;
      }
    }
  }

  function captureModalDomState(
    root = null,
    panelSelector = "",
    scrollSelector = ""
  ) {
    if (!isBrowser() || !root) return null;

    const active = document.activeElement;
    const panel = root.querySelector(panelSelector);
    const scrollOwner =
      (scrollSelector
        ? root.querySelector(scrollSelector)
        : null) ||
      panel;

    return {
      scrollTop: scrollOwner?.scrollTop || 0,
      activeId:
        active && root.contains(active)
          ? cleanText(active.id, "")
          : "",
      activeName:
        active && root.contains(active)
          ? cleanText(active.getAttribute?.("name"), "")
          : "",
    };
  }

  function restoreModalDomState(
    root = null,
    state = null,
    {
      panelSelector = "",
      scrollSelector = "",
      focusSelector = "",
      preserveFocus = true,
    } = {}
  ) {
    if (!isBrowser() || !root) return false;

    const panel = root.querySelector(panelSelector);
    const scrollOwner =
      (scrollSelector
        ? root.querySelector(scrollSelector)
        : null) ||
      panel;

    if (scrollOwner && state) {
      scrollOwner.scrollTop = state.scrollTop || 0;
    }

    nextFrame(() => {
      if (scrollOwner && state) {
        scrollOwner.scrollTop = state.scrollTop || 0;
      }
    });

    if (preserveFocus === false) {
      return focusAfterRender(
        focusSelector || panelSelector,
        false,
        root
      );
    }

    let target = null;

    if (focusSelector) {
      target = root.querySelector(focusSelector);
    }

    if (!target && state?.activeId) {
      target = [...root.querySelectorAll("[id]")]
        .find((node) => node.id === state.activeId);
    }

    if (!target && state?.activeName) {
      target = [...root.querySelectorAll("[name]")]
        .find(
          (node) =>
            cleanText(node.getAttribute("name"), "") ===
            state.activeName
        );
    }

    if (target?.focus) {
      try {
        target.focus({ preventScroll: true });
        return true;
      } catch {
        // noop
      }
    }

    if (
      document.activeElement &&
      root.contains(document.activeElement)
    ) {
      return true;
    }

    return focusAfterRender(panelSelector, false, root);
  }

  /* ---------------------------------------------------------
     Main payload/list
  --------------------------------------------------------- */

  function getSortParts() {
    const normalized = normalizeKey(sort || "date_desc");
    const sortMode =
      normalized.endsWith("_asc")
        ? "date_asc"
        : "date_desc";

    const direction =
      sortMode.endsWith("_asc")
        ? "asc"
        : "desc";

    return {
      sortMode,
      sort: sortMode,
      sortBy: sortMode,
      direction,
      sortDir: direction,
    };
  }

  function getListFilters() {
    if (filter === "pending") return { estadoPago: "pending" };
    if (filter === "paid") return { estadoPago: "paid" };
    if (filter === "overdue") return { estadoPago: "overdue" };
    return {};
  }

  function getListContextKey() {
    const sortParts = getSortParts();
    return getFacturasListContextKey({
      limit: pageSize,
      search,
      q: search,
      sortMode: sortParts.sortMode,
      sort: sortParts.sort,
      sortBy: sortParts.sortBy,
      direction: sortParts.direction,
      sortDir: sortParts.sortDir,
      includeStats: false,
      includeStatsAll: false,
      filters: getListFilters(),
    });
  }

  function itemsBelongToCurrentQuery() {
    return Boolean(
      items.length &&
      itemsContextKey &&
      itemsContextKey === getListContextKey()
    );
  }

  function syncListCacheSnapshot() {
    if (!itemsContextKey) return false;

    try {
      syncFacturasListCache({
        items,
        total,
        totalKnown,
        contextKey: itemsContextKey,
        page,
        nextPage,
        hasMore,
      });
      return true;
    } catch {
      return false;
    }
  }

  function updatePagingFromResponse(
    response = {},
    requestedPage = DEFAULT_PAGE
  ) {
    const responseTotalKnown = Boolean(
      response.totalKnown === true ||
      response.paging?.totalKnown === true ||
      response.meta?.totalKnown === true
    );
    const previousTotalKnown = totalKnown;
    total = Math.max(
      number(
        first(
          response.total,
          response.remoteCount,
          response.totalMatched,
          response.meta?.total,
          response.meta?.remoteCount,
          response.paging?.total,
          total,
          items.length
        ),
        items.length
      ),
      items.length
    );
    totalKnown = responseTotalKnown || (
      requestedPage > DEFAULT_PAGE && previousTotalKnown
    );

    page = Math.max(
      DEFAULT_PAGE,
      number(
        first(
          response.page,
          response.paging?.page,
          requestedPage
        ),
        requestedPage
      )
    );

    const responseHasMore = first(
      response.hasMore,
      response.more,
      response.canLoadMore,
      response.paging?.hasMore,
      null
    );

    hasMore =
      responseHasMore === null
        ? items.length < total
        : parseBoolean(
            responseHasMore,
            items.length < total
          );

    nextPage = hasMore
      ? Math.max(
          page + 1,
          number(
            first(
              response.nextPage,
              response.paging?.nextPage,
              page + 1
            ),
            page + 1
          )
        )
      : null;
  }

  function getViewStats() {
    return authoritativeStats || computeFacturasStats(items);
  }

  async function refreshAuthoritativeStats({ renderOnSuccess = true } = {}) {
    const seq = ++authoritativeStatsSeq;
    authoritativeStatsLoading = true;

    try {
      const stats = safeObject(
        await loadFacturasStats({ dedupe: true }),
        {}
      );

      if (destroyed || seq !== authoritativeStatsSeq) return null;
      if (Object.keys(stats).length) authoritativeStats = stats;
      return authoritativeStats;
    } catch {
      return null;
    } finally {
      if (!destroyed && seq === authoritativeStatsSeq) {
        authoritativeStatsLoading = false;
        if (renderOnSuccess && authoritativeStats) {
          render({ preserveFocus: true });
        }
      }
    }
  }

  function payload(extra = {}) {
    return {
      user: getCurrentUser(),
      role: getCurrentRole(),
      admin: isAdmin(),
      canCreateFactura: isAdmin(),
      routes: getRoutes(),

      items,
      facturas: items,
      total,
      totalKnown,
      remoteCount: total,
      totalMatched: total,

      page,
      nextPage,
      pageSize,
      batchSize: pageSize,
      limit: pageSize,
      hasMore,
      loadingMore,
      loadMoreError,

      filter,
      search,
      sort,

      loading,
      refreshing,
      creating,
      error,

      stats: getViewStats(),
      statsAuthoritative: Boolean(authoritativeStats),
      statsLoading: authoritativeStatsLoading,

      state: {
        loading,
        refreshing,
        loadingMore,
        loadMoreError,
        creating,
        error,
        page,
        nextPage,
        pageSize,
        batchSize: pageSize,
        limit: pageSize,
        hasMore,
        totalKnown,
        statsAuthoritative: Boolean(authoritativeStats),
        statsLoading: authoritativeStatsLoading,
        filter,
        search,
        sort,
        openingFacturaId,
        viewingFacturaId,
        downloadingFacturaId,
        sendingFacturaId,
        markingPaidFacturaId,
        role: getCurrentRole(),
        admin: isAdmin(),
        canCreateFactura: isAdmin(),
      },

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
        detailOpen: false,
      },

      ...extra,
    });
  }

  /* ---------------------------------------------------------
     Main render deferral
  --------------------------------------------------------- */

  function cancelScheduledRender() {
    if (!renderFrame) return false;

    cancelFrame(renderFrame);
    renderFrame = 0;
    pendingRenderOptions = null;
    return true;
  }

  function deferMainRender(options = {}) {
    deferredRenderOptions = mergeRenderOptions(
      deferredRenderOptions || {},
      options
    );

    return true;
  }

  function suspendScheduledMainRender() {
    if (!renderFrame) return false;

    cancelFrame(renderFrame);
    renderFrame = 0;

    if (pendingRenderOptions) {
      deferMainRender(pendingRenderOptions);
    }

    pendingRenderOptions = null;
    return true;
  }

  function flushDeferredMainRender({ immediate = true } = {}) {
    if (!deferredRenderOptions || anyModalIsOpen()) return false;

    const options = deferredRenderOptions;
    deferredRenderOptions = null;

    return render({
      ...options,
      immediate,
      allowWhileModal: true,
    });
  }

  /* ---------------------------------------------------------
     Create modal host/render
  --------------------------------------------------------- */

  function cancelScheduledCreateRender() {
    if (!createRenderFrame) return false;

    cancelFrame(createRenderFrame);
    createRenderFrame = 0;
    pendingCreateRenderOptions = null;
    return true;
  }

  function ensureCreateModalHost() {
    if (!isBrowser()) return null;

    if (createModalHost?.isConnected) {
      return createModalHost;
    }

    document
      .querySelectorAll(CREATE_MODAL_HOST_SELECTOR)
      .forEach((node) => {
        try {
          node.remove();
        } catch {
          // noop
        }
      });

    createModalHost = document.createElement("div");
    createModalHost.id = CREATE_MODAL_HOST_ID;
    createModalHost.setAttribute(
      "data-facturas-create-host",
      "true"
    );
    createModalHost.setAttribute("data-owner", controllerOwner);

    document.body.appendChild(createModalHost);

    if (mounted && !createModalHostBound) {
      bindTarget(createModalHost);
      createModalHostBound = true;
    }

    return createModalHost;
  }

  function removeCreateModalHost() {
    cancelScheduledCreateRender();

    const current = createModalHost;
    if (!current) return false;

    try {
      if (createModalHostBound) {
        unbindTarget(current);
      }

      current.replaceChildren();
      current.remove();
    } catch {
      // noop
    }

    createModalHost = null;
    createModalHostBound = false;
    return true;
  }

  function createModalRenderPayload() {
    return {
      ...createModal,
      canCreate: isAdmin(),
      admin: isAdmin(),
      role: getCurrentRole(),
    };
  }

  function patchCreateSearchIsland(
    slotName = "",
    html = "",
    { busy = false } = {}
  ) {
    if (
      destroyed ||
      !createModal.open ||
      !createModalHost?.isConnected ||
      !slotName
    ) {
      return false;
    }

    const slot = createModalHost.querySelector(
      `[data-slot="${slotName}"]`
    );

    if (!slot) return false;

    if (slot.innerHTML !== html) {
      slot.innerHTML = html;
    }

    slot.setAttribute(
      "aria-busy",
      busy ? "true" : "false"
    );

    return true;
  }

  function patchCreateClientSearchDom() {
    const html = renderFacturaCreateClientSearchSlot(
      createModalRenderPayload()
    );

    return patchCreateSearchIsland(
      "client-search-results",
      html,
      { busy: createModal.clientSearch.loading }
    );
  }

  function patchCreateTicketSearchDom() {
    const html = renderFacturaCreateTicketSearchSlot(
      createModalRenderPayload()
    );

    const patched = patchCreateSearchIsland(
      "ticket-search-results",
      html,
      { busy: createModal.ticketSearch.loading }
    );

    const refreshButton = createModalHost?.querySelector?.(
      `[data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_REFRESH}"]`
    );

    if (refreshButton) {
      const disabled = Boolean(
        createModal.submitting ||
        createModal.ticketSearch.loading ||
        !createModal.selectedClientes.length
      );

      refreshButton.disabled = disabled;
      refreshButton.setAttribute(
        "aria-disabled",
        disabled ? "true" : "false"
      );
      refreshButton.setAttribute(
        "aria-busy",
        createModal.ticketSearch.loading ? "true" : "false"
      );
      refreshButton.textContent =
        createModal.ticketSearch.loading
          ? "Cargando..."
          : "Recargar";
    }

    return patched;
  }

  function renderCreateModalNow(options = {}) {
    if (destroyed || !isBrowser()) return false;

    cancelScheduledCreateRender();

    if (!createModal.open) {
      removeCreateModalHost();
      syncModalBodyState();
      return true;
    }

    const target = ensureCreateModalHost();
    if (!target) return false;

    const state = captureModalDomState(
      target,
      CREATE_MODAL_PANEL_SELECTOR,
      CREATE_MODAL_SCROLL_SELECTOR
    );

    target.innerHTML = renderFacturasCreateModal(
      createModalRenderPayload()
    );

    syncModalBodyState();

    restoreModalDomState(target, state, {
      panelSelector: CREATE_MODAL_PANEL_SELECTOR,
      scrollSelector: CREATE_MODAL_SCROLL_SELECTOR,
      focusSelector: options.focusSelector || "",
      preserveFocus: options.preserveFocus !== false,
    });

    return true;
  }

  function renderCreateModal(options = {}) {
    if (destroyed || !isBrowser()) return false;

    if (options.immediate === true) {
      return renderCreateModalNow(options);
    }

    pendingCreateRenderOptions = mergeRenderOptions(
      pendingCreateRenderOptions || {},
      options
    );

    if (createRenderFrame) return true;

    createRenderFrame = nextFrame(() => {
      const nextOptions = pendingCreateRenderOptions || {};

      createRenderFrame = 0;
      pendingCreateRenderOptions = null;

      renderCreateModalNow(nextOptions);
    });

    return true;
  }

  function patchCreateTotalsDom() {
    if (!createModalHost) return false;

    const breakdown = getFacturaCreateBreakdown(createModal.form);

    const formatMoney = (value = 0) => {
      try {
        return new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(number(value, 0));
      } catch {
        return `${number(value, 0)
          .toFixed(2)
          .replace(".", ",")} €`;
      }
    };

    const base = createModalHost.querySelector(
      "[data-role='base-preview-inline']"
    );

    const taxes = createModalHost.querySelector(
      "[data-role='tax-preview-inline']"
    );

    const totalNode = createModalHost.querySelector(
      "[data-role='total-preview-inline']"
    );

    if (base) base.textContent = formatMoney(breakdown.base);

    if (taxes) {
      taxes.textContent =
        `${formatMoney(breakdown.ivaTotal)} / ` +
        `${formatMoney(breakdown.irpfTotal)}`;
    }

    if (totalNode) {
      totalNode.textContent = formatMoney(breakdown.totalFactura);
    }

    safeArray(breakdown.lineas).forEach((linea, index) => {
      const node = createModalHost.querySelector(`[data-line-total="${index}"]`);
      if (node) node.textContent = formatMoney(linea.base);
    });

    return true;
  }

  /* ---------------------------------------------------------
     Detail modal host/render
     SINGLE MOUNT
  --------------------------------------------------------- */

  function cancelScheduledDetailRender() {
    if (!detailRenderFrame) return false;

    cancelFrame(detailRenderFrame);
    detailRenderFrame = 0;
    pendingDetailRenderOptions = null;
    return true;
  }

  function ensureDetailModalHost() {
    if (!isBrowser()) return null;

    if (detailModalHost?.isConnected) {
      return detailModalHost;
    }

    document
      .querySelectorAll(DETAIL_MODAL_HOST_SELECTOR)
      .forEach((node) => {
        try {
          node.remove();
        } catch {
          // noop
        }
      });

    detailModalHost = document.createElement("div");
    detailModalHost.id = DETAIL_MODAL_HOST_ID;
    detailModalHost.setAttribute(
      "data-facturas-detail-host",
      "true"
    );
    detailModalHost.setAttribute("data-owner", controllerOwner);

    document.body.appendChild(detailModalHost);

    if (mounted && !detailModalHostBound) {
      bindTarget(detailModalHost);
      detailModalHostBound = true;
    }

    return detailModalHost;
  }

  function removeDetailModalHost() {
    cancelScheduledDetailRender();

    const current = detailModalHost;
    if (!current) return false;

    try {
      if (detailModalHostBound) {
        unbindTarget(current);
      }

      current.replaceChildren();
      current.remove();
    } catch {
      // noop
    }

    detailModalHost = null;
    detailModalHostBound = false;
    return true;
  }

  function detailContentPayload() {
    return {
      factura: detailModal.factura,
      loading: detailModal.detailLoading,
      admin: isAdmin(),
      markingPaidFacturaId: detailModal.markingPaidFacturaId,
      sendingFacturaId: detailModal.sendingFacturaId,
      viewingFacturaId: detailModal.viewingFacturaId,
      downloadingFacturaId: detailModal.downloadingFacturaId,
      feedbackMessage: detailModal.feedbackMessage,
      feedbackType: detailModal.feedbackType,
    };
  }

  function mountDetailShell(target = null) {
    if (!target) return false;

    target.innerHTML = renderFacturasDetailModal({
      ...detailModal,
      admin: isAdmin(),
    });
    target.setAttribute("data-detail-shell-mounted", "true");

    return Boolean(
      target.querySelector(DETAIL_MODAL_PANEL_SELECTOR)
    );
  }

  function patchDetailContent(target = null) {
    if (!target) return false;

    const panel = target.querySelector(
      DETAIL_MODAL_PANEL_SELECTOR
    );

    if (!panel) return false;

    /*
       FIX:
       Sólo sustituimos el contenido interno.
       Overlay + panel sobreviven.
       Las animaciones de entrada no se reinician.
    */
    panel.innerHTML = renderFacturasDetailContent(
      detailContentPayload()
    );

    const facturaId = getFacturaId(
      detailModal.factura || {}
    );

    const root = target.querySelector(
      DETAIL_MODAL_ROOT_SELECTOR
    );

    if (root) {
      root.dataset.facturaId = facturaId;
      root.dataset.open = "true";
      root.dataset.detailShell = "single-mount";
    }

    panel.dataset.facturaId = facturaId;
    panel.dataset.detailPatch = "true";

    return true;
  }

  function setDetailFeedback(
    message = "",
    type = "info",
    { renderNow = true, focusSelector = "" } = {}
  ) {
    detailModal.feedbackMessage = cleanText(message, "");

    const normalized = normalizeKey(type);

    detailModal.feedbackType = [
      "success",
      "warning",
      "error",
      "info",
    ].includes(normalized)
      ? normalized
      : "info";

    if (renderNow && detailModalIsOpen()) {
      renderDetailModal({
        immediate: true,
        preserveFocus: true,
        focusSelector,
      });
    }

    return true;
  }

  function clearDetailFeedback({ renderNow = false } = {}) {
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    if (renderNow && detailModalIsOpen()) {
      renderDetailModal({
        immediate: true,
        preserveFocus: true,
      });
    }

    return true;
  }

  function renderDetailModalNow(options = {}) {
    if (destroyed || !isBrowser()) return false;

    cancelScheduledDetailRender();

    if (!detailModalIsOpen()) {
      removeDetailModalHost();
      syncModalBodyState();
      return true;
    }

    const target = ensureDetailModalHost();
    if (!target) return false;

    const existingPanel = target.querySelector(
      DETAIL_MODAL_PANEL_SELECTOR
    );

    const state = existingPanel
      ? captureModalDomState(
          target,
          DETAIL_MODAL_PANEL_SELECTOR,
          DETAIL_MODAL_SCROLL_SELECTOR
        )
      : null;

    const forceShell = options.forceShell === true;

    let mountedShell = false;

    if (!existingPanel || forceShell) {
      mountedShell = mountDetailShell(target);
    } else if (!patchDetailContent(target)) {
      mountedShell = mountDetailShell(target);
    }

    syncModalBodyState();

    restoreModalDomState(target, state, {
      panelSelector: DETAIL_MODAL_PANEL_SELECTOR,
      scrollSelector: DETAIL_MODAL_SCROLL_SELECTOR,
      focusSelector: options.focusSelector || "",
      preserveFocus:
        mountedShell
          ? options.preserveFocus !== false
          : true,
    });

    return true;
  }

  function renderDetailModal(options = {}) {
    if (destroyed || !isBrowser()) return false;

    if (options.immediate === true) {
      return renderDetailModalNow(options);
    }

    pendingDetailRenderOptions = mergeRenderOptions(
      pendingDetailRenderOptions || {},
      options
    );

    if (detailRenderFrame) return true;

    detailRenderFrame = nextFrame(() => {
      const nextOptions = pendingDetailRenderOptions || {};

      detailRenderFrame = 0;
      pendingDetailRenderOptions = null;

      renderDetailModalNow(nextOptions);
    });

    return true;
  }

  /* ---------------------------------------------------------
     Main render/list
  --------------------------------------------------------- */

  function syncInfiniteObserver() {
    if (
      !isBrowser() ||
      destroyed ||
      !host
    ) {
      return false;
    }

    disconnectInfiniteObserver();

    if (
      !hasMore ||
      loading ||
      refreshing ||
      loadingMore ||
      Boolean(listSearchTimer) ||
      listSearchComposing ||
      Boolean(error) ||
      Boolean(loadMoreError) ||
      !itemsBelongToCurrentQuery() ||
      anyModalIsOpen()
    ) {
      return false;
    }

    const sentinel = host.querySelector?.(
      "[data-facturas-infinite-sentinel='true']"
    );
    const scrollRoot = resolveInfiniteScrollRoot();

    if (
      !sentinel ||
      !scrollRoot ||
      !isFunction(window.IntersectionObserver)
    ) {
      return false;
    }

    try {
      const observer = new window.IntersectionObserver(
        (entries) => {
          if (infiniteObserver !== observer) {
            disposeInfiniteObserver(observer);
            return;
          }

          if (
            destroyed ||
            loading ||
            refreshing ||
            loadingMore ||
            Boolean(listSearchTimer) ||
            listSearchComposing ||
            Boolean(error) ||
            Boolean(loadMoreError) ||
            !itemsBelongToCurrentQuery() ||
            !hasMore ||
            anyModalIsOpen()
          ) {
            return;
          }

          if (entries.some((entry) => entry.isIntersecting)) {
            disconnectInfiniteObserver();
            void loadMore();
          }
        },
        {
          root: scrollRoot,
          rootMargin: INFINITE_ROOT_MARGIN,
          threshold: 0.01,
        }
      );

      infiniteObserver = observer;
      observer.observe(sentinel);
      return true;
    } catch {
      disconnectInfiniteObserver();
      return false;
    }
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    if (
      anyModalIsOpen() &&
      options.allowWhileModal !== true
    ) {
      syncModalBodyState();
      return deferMainRender(options);
    }

    const stableFocus = options.preserveFocus === false
      ? null
      : captureStableListFocus();

    host.innerHTML = renderFacturasTemplate(viewPayload());
    bindFacturasTemplateDom(host);
    syncModalBodyState();

    if (options.focusSelector) {
      focusAfterRender(
        options.focusSelector,
        options.focusEnd !== false
      );
    } else {
      restoreStableListFocus(stableFocus);
    }

    syncInfiniteObserver();
    return true;
  }

  function render(options = {}) {
    if (destroyed || !host) return false;

    if (options.immediate === true) {
      return renderNow(options);
    }

    pendingRenderOptions = mergeRenderOptions(
      pendingRenderOptions || {},
      options
    );

    if (renderFrame) return true;

    renderFrame = nextFrame(() => {
      const nextOptions = pendingRenderOptions || {};

      renderFrame = 0;
      pendingRenderOptions = null;

      renderNow(nextOptions);
    });

    return true;
  }

  function renderLoading() {
    if (destroyed || !host) return false;

    if (anyModalIsOpen()) {
      return deferMainRender({ loadingState: true });
    }

    host.innerHTML = renderFacturasLoadingState(viewPayload());
    bindFacturasTemplateDom(host);
    syncModalBodyState();
    return true;
  }

  function renderError(
    message = "No se pudieron cargar las facturas."
  ) {
    if (destroyed || !host) return false;

    if (anyModalIsOpen()) {
      return deferMainRender({ errorMessage: message });
    }

    host.innerHTML = renderFacturasErrorState(message);
    syncModalBodyState();
    disconnectInfiniteObserver();
    const alert = host.querySelector("#facturas-fatal-error");
    try {
      alert?.focus?.({ preventScroll: true });
    } catch {
      alert?.focus?.();
    }
    return true;
  }

  async function fetchList({
    mode = "replace",
    requestPage = DEFAULT_PAGE,
    force = false,
    silent = false,
    preservePages = false,
  } = {}) {
    if (destroyed) return null;

    const append = mode === "append";
    const requestedPage = Math.max(
      DEFAULT_PAGE,
      number(requestPage, DEFAULT_PAGE)
    );

    const sortParts = getSortParts();
    const requestContextKey = getListContextKey();
    const compatibleItems = itemsBelongToCurrentQuery();
    const preserveLoadedPages = Boolean(
      !append &&
      preservePages === true &&
      requestedPage === DEFAULT_PAGE &&
      compatibleItems &&
      items.length
    );
    const previousPageState = {
      items,
      total,
      totalKnown,
      page,
      nextPage,
      hasMore,
      itemsContextKey,
      loadMoreError,
    };

    if (
      append &&
      (
        loading ||
        refreshing ||
        loadingMore ||
        listSearchTimer ||
        listSearchComposing ||
        Boolean(error) ||
        !hasMore ||
        !compatibleItems
      )
    ) {
      return null;
    }

    const seq = ++listSeq;
    error = "";
    if (!preserveLoadedPages) loadMoreError = "";

    if (append) {
      loadingMore = true;
    } else if (silent && items.length && compatibleItems) {
      /*
        Silent revalidation keeps the current DOM, but it still owns the list
        request slot. Marking it as refreshing prevents the sentinel and the
        scroll fallback from racing an append request against this first page.
      */
      refreshing = true;
      loading = false;
      loadingMore = false;
    } else if (force && compatibleItems) {
      refreshing = true;
      loading = false;
      loadingMore = false;
    } else {
      loading = true;
      refreshing = false;
      loadingMore = false;
    }

    if (!silent) render();

    try {
      const response = await listFacturas({
        page: requestedPage,
        limit: pageSize,
        search,
        q: search,

        sortMode: sortParts.sortMode,
        sort: sortParts.sort,
        sortBy: sortParts.sortBy,
        direction: sortParts.direction,
        sortDir: sortParts.sortDir,

        includeStats: false,
        includeStatsAll: false,

        filters: getListFilters(),
        cacheAppend: append,
        returnStaleOnError: false,
        dedupe: true,
        force: force === true,
      });

      if (
        seq !== listSeq ||
        destroyed ||
        requestContextKey !== getListContextKey()
      ) {
        return null;
      }

      const rows = safeArray(
        first(
          response?.items,
          response?.facturas,
          response?.data,
          response?.invoices,
          []
        )
      );
      const normalizedRows = mergeFacturas([], rows, { append: false });
      const responseAdvertisesMore = parseBoolean(
        first(
          response?.hasMore,
          response?.more,
          response?.canLoadMore,
          response?.paging?.hasMore,
          false
        ),
        false
      );
      if (!append && responseAdvertisesMore && normalizedRows.length === 0) {
        const progressError = new Error(
          "La primera página continuable no incluyó facturas con identidad estable."
        );
        progressError.code = "FACTURAS_FIRST_PAGE_DID_NOT_ADVANCE";
        throw progressError;
      }

      const freshWithLoaded = preserveLoadedPages
        ? mergeFacturasFreshPageFirst(
            previousPageState.items,
            rows,
            pageSize
          )
        : mergeFacturas([], rows, { append: false });
      items = append
        ? mergeFacturas(previousPageState.items, rows, { append: true })
        : freshWithLoaded;
      itemsContextKey = requestContextKey;

      updatePagingFromResponse(
        response || {},
        requestedPage
      );

      const responseTotalKnown = Boolean(
        response?.totalKnown === true ||
        response?.paging?.totalKnown === true ||
        response?.meta?.totalKnown === true
      );
      const responseTotal = Math.max(
        0,
        number(
          first(
            response?.total,
            response?.remoteCount,
            response?.totalMatched,
            response?.meta?.total,
            response?.paging?.total,
            rows.length
          ),
          rows.length
        )
      );
      const totalContracted = Boolean(
        preserveLoadedPages &&
        responseTotalKnown &&
        (
          responseTotal < previousPageState.items.length ||
          (
            previousPageState.totalKnown &&
            responseTotal < previousPageState.total
          )
        )
      );
      const totalChanged = Boolean(
        preserveLoadedPages &&
        responseTotalKnown &&
        previousPageState.totalKnown &&
        responseTotal !== previousPageState.total
      );
      const firstPageIdentityChanged = Boolean(
        preserveLoadedPages &&
        !facturasFirstPageIdentityMatches(
          previousPageState.items,
          rows,
          pageSize
        )
      );
      const stableKnownTotal = Boolean(
        responseTotalKnown &&
        previousPageState.totalKnown &&
        responseTotal === previousPageState.total
      );
      const retainedRowsExceedTotal = Boolean(
        preserveLoadedPages &&
        responseTotalKnown &&
        freshWithLoaded.length > responseTotal
      );
      const preserveContinuation = Boolean(
        preserveLoadedPages &&
        hasMore &&
        previousPageState.hasMore &&
        previousPageState.nextPage &&
        stableKnownTotal &&
        !totalContracted &&
        !totalChanged &&
        !firstPageIdentityChanged &&
        !retainedRowsExceedTotal
      );
      const preserveCompletedHistory = Boolean(
        preserveLoadedPages &&
        hasMore &&
        !previousPageState.hasMore &&
        !previousPageState.nextPage &&
        stableKnownTotal &&
        !totalContracted &&
        !totalChanged &&
        !firstPageIdentityChanged &&
        !retainedRowsExceedTotal &&
        (
          !responseTotalKnown ||
          freshWithLoaded.length === responseTotal
        )
      );
      const preserveAccumulatedRows =
        preserveContinuation || preserveCompletedHistory;

      if (preserveAccumulatedRows) {
        items = freshWithLoaded;
        page = previousPageState.page;
        nextPage = preserveContinuation
          ? previousPageState.nextPage
          : null;
        hasMore = preserveContinuation;
        totalKnown = responseTotalKnown || previousPageState.totalKnown;
        const knownTotal = responseTotalKnown
          ? responseTotal
          : previousPageState.total;
        total = totalKnown
          ? Math.max(items.length, knownTotal)
          : Math.max(items.length, total);
      } else if (preserveLoadedPages) {
        items = mergeFacturas([], rows, { append: false });
        updatePagingFromResponse(response || {}, requestedPage);
      }

      if (
        append &&
        hasMore &&
        items.length <= previousPageState.items.length
      ) {
        items = previousPageState.items;
        total = previousPageState.total;
        totalKnown = previousPageState.totalKnown;
        page = previousPageState.page;
        nextPage = previousPageState.nextPage;
        hasMore = previousPageState.hasMore;
        itemsContextKey = previousPageState.itemsContextKey;
        const progressError = new Error(
          "La siguiente página de facturas no añadió registros nuevos."
        );
        progressError.code = "FACTURAS_PAGE_DID_NOT_ADVANCE";
        throw progressError;
      }

      error = response?.stale
        ? cleanText(response.error?.message, "")
        : "";
      loadMoreError = preserveContinuation
        ? previousPageState.loadMoreError
        : "";
      syncListCacheSnapshot();

      loading = false;
      refreshing = false;
      loadingMore = false;

      render();
      return response;
    } catch (loadError) {
      if (
        seq !== listSeq ||
        destroyed ||
        requestContextKey !== getListContextKey()
      ) {
        return null;
      }

      const message = safeError(loadError);
      if (append && items.length) {
        loadMoreError = message;
        error = "";
      } else if (preserveLoadedPages && items.length) {
        loadMoreError = previousPageState.loadMoreError;
        error = message;
      } else {
        loadMoreError = "";
        error = message;
      }
      loading = false;
      refreshing = false;
      loadingMore = false;

      if (items.length) {
        syncListCacheSnapshot();
        render();
        return null;
      }

      renderError(error);
      return null;
    }
  }

  function resetListState({ keepItems = true } = {}) {
    listSeq += 1;
    loading = false;
    refreshing = false;
    loadingMore = false;
    error = "";
    loadMoreError = "";

    if (!keepItems) {
      items = [];
      itemsContextKey = "";
      total = 0;
      totalKnown = false;
      page = DEFAULT_PAGE;
      nextPage = DEFAULT_PAGE;
      hasMore = true;
    } else {
      total = Math.max(total, items.length);
    }

    disconnectInfiniteObserver();
    return true;
  }

  async function load(options = {}) {
    void refreshAuthoritativeStats();
    return fetchList({
      mode: "replace",
      requestPage: options.page || DEFAULT_PAGE,
      force: options.force === true,
      silent: options.silent === true,
      preservePages:
        options.preservePages !== false &&
        itemsBelongToCurrentQuery(),
    });
  }

  async function refresh() {
    void refreshAuthoritativeStats();
    cancelListSearchTimer();
    const preservePages = itemsBelongToCurrentQuery();
    if (!preservePages) resetListState({ keepItems: false });
    else disconnectInfiniteObserver();

    return fetchList({
      mode: "replace",
      requestPage: DEFAULT_PAGE,
      force: true,
      silent: false,
      preservePages,
    });
  }

  async function reloadFromStart({
    force = false,
    silent = false,
    keepItems = true,
  } = {}) {
    const preservePages = Boolean(
      keepItems && itemsBelongToCurrentQuery()
    );
    if (!preservePages) resetListState({ keepItems: false });
    else disconnectInfiniteObserver();

    return fetchList({
      mode: "replace",
      requestPage: DEFAULT_PAGE,
      force,
      silent,
      preservePages,
    });
  }

  async function loadMore() {
    if (
      destroyed ||
      loading ||
      refreshing ||
      loadingMore ||
      listSearchTimer ||
      listSearchComposing ||
      Boolean(error) ||
      !itemsBelongToCurrentQuery() ||
      !hasMore
    ) {
      return false;
    }

    await fetchList({
      mode: "append",
      requestPage: Math.max(
        DEFAULT_PAGE,
        number(nextPage, page + 1)
      ),
      force: false,
      silent: false,
    });

    return true;
  }

  function scheduleListReload() {
    cancelListSearchTimer();

    listSearchTimer = window.setTimeout(() => {
      listSearchTimer = null;

      void fetchList({
        mode: "replace",
        requestPage: DEFAULT_PAGE,
        force: false,
        silent: true,
        preservePages: false,
      });
    }, LIST_SEARCH_DEBOUNCE_MS);
  }

  function reloadChangedQuery(options = {}) {
    resetListState({ keepItems: false });
    loading = true;
    render(options);

    void fetchList({
      mode: "replace",
      requestPage: DEFAULT_PAGE,
      force: false,
      silent: true,
      preservePages: false,
    });

    return true;
  }

  function setFilter(value = "all") {
    const next = normalizeKey(value || "all") || "all";
    const nextFilter = ["all", "pending", "paid", "overdue"].includes(next)
      ? next
      : "all";
    const hadPendingSearch = cancelListSearchTimer();
    if (nextFilter === filter && !hadPendingSearch) return true;

    filter = nextFilter;
    return reloadChangedQuery();
  }

  function setSearch(value = "") {
    const nextSearch = cleanText(value, "");
    if (nextSearch === search && !listSearchTimer) return true;
    search = nextSearch;

    resetListState({ keepItems: false });
    loading = true;
    scheduleListReload();

    render({ preserveFocus: true });

    return true;
  }

  function clearFilters() {
    cancelListSearchTimer();
    filter = "all";
    search = "";
    sort = "date_desc";

    return reloadChangedQuery();
  }

  function setSort(value = "date_desc") {
    const nextSort =
      normalizeKey(value) === "date_asc"
        ? "date_asc"
        : "date_desc";
    const hadPendingSearch = cancelListSearchTimer();
    if (nextSort === sort && !hadPendingSearch) return true;

    sort = nextSort;
    return reloadChangedQuery();
  }

  async function setPage(value = DEFAULT_PAGE) {
    return fetchList({
      mode: "replace",
      requestPage: Math.max(
        DEFAULT_PAGE,
        number(value, DEFAULT_PAGE)
      ),
      force: false,
      silent: false,
    });
  }

  /* ---------------------------------------------------------
     Create modal state/search
  --------------------------------------------------------- */

  function resetCreateModal() {
    createModal.open = false;
    createModal.canCreate = isAdmin();
    createModal.submitting = false;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdFacturaId = "";
    createModal.errors = {};
    createModal.form = getFacturaCreateFormDefaults();
    createModal.selectedClientes = [];
    createModal.selectedTickets = [];

    createModal.clientSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    createModal.ticketSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    return true;
  }

  function openCreateModal(openerNode = null) {
    if (!isAdmin()) return false;

    rememberModalReturnFocus(openerNode);
    suspendScheduledMainRender();
    disconnectInfiniteObserver();
    clearCreateTimers();

    resetCreateModal();
    createModal.open = true;
    creating = false;

    renderCreateModal({
      immediate: true,
      preserveFocus: false,
      focusSelector:
        "[data-field='clienteSearch'], [data-create-field='clienteSearch'], input[name='clienteSearch']",
    });

    return true;
  }

  function closeCreateModal() {
    if (createModal.submitting) return false;

    clientSearchSeq += 1;
    ticketSearchSeq += 1;

    clearCreateTimers();
    resetCreateModal();
    removeCreateModalHost();
    syncModalBodyState();

    const flushedMain = flushDeferredMainRender({ immediate: true });
    if (!flushedMain) syncInfiniteObserver();
    restoreModalReturnFocus();

    return true;
  }

  function patchCreateFormFromField(field = null) {
    if (!field) return false;

    const lineField = cleanText(field.dataset?.lineField, "");
    const lineIndex = number(field.dataset?.lineIndex, -1);
    const value =
      field.type === "checkbox"
        ? Boolean(field.checked)
        : field.tagName === "TEXTAREA"
          ? multilineValue(field.value)
          : field.value;

    if (lineField && Number.isInteger(lineIndex) && lineIndex >= 0) {
      const lineas = safeArray(createModal.form.lineas).map((linea) => ({ ...safeObject(linea) }));
      if (!lineas[lineIndex]) return false;

      lineas[lineIndex] = {
        ...lineas[lineIndex],
        [lineField]: value,
      };
      createModal.form = {
        ...createModal.form,
        lineas,
      };

      const errorKey = `lineas.${lineIndex}.${lineField}`;
      if (createModal.errors[errorKey]) {
        const next = { ...createModal.errors };
        delete next[errorKey];
        createModal.errors = next;
      }

      createModal.serverError = "";
      patchCreateTotalsDom();
      return true;
    }

    const name = cleanText(
      field.dataset?.field || field.name,
      ""
    );

    if (
      !name ||
      name === "clienteSearch" ||
      name === "ticketSearch"
    ) {
      return false;
    }

    createModal.form = {
      ...createModal.form,
      [name]: value,
    };

    if (createModal.errors[name]) {
      const next = { ...createModal.errors };
      delete next[name];
      createModal.errors = next;
    }

    createModal.serverError = "";
    patchCreateTotalsDom();
    return true;
  }

  function syncPrimaryClientToForm() {
    const primary = createModal.selectedClientes[0] || null;

    createModal.form = {
      ...createModal.form,
      clienteId: cleanText(
        first(primary?.clienteId, primary?.id, ""),
        ""
      ),
      clienteUserId: cleanText(
        first(primary?.userId, ""),
        ""
      ),
      clienteNombre: cleanText(
        first(primary?.name, primary?.displayName, ""),
        ""
      ),
      clienteEmail: cleanText(
        first(primary?.email, ""),
        ""
      ),
      clienteAvatar: cleanText(
        first(primary?.avatarUrl, primary?.avatar, ""),
        ""
      ),
    };
  }

  function syncPrimaryTicketToForm() {
    const primary = createModal.selectedTickets[0] || null;

    const id = cleanText(
      first(
        primary?.ticketId,
        primary?.incidenciaId,
        primary?.id,
        ""
      ),
      ""
    );

    createModal.form = {
      ...createModal.form,
      ticketId: id,
      incidenciaId: id,
      incidenciaSubject: cleanText(
        first(
          primary?.subject,
          primary?.asunto,
          primary?.title,
          id
        ),
        id
      ),
    };
  }

  function rerenderCreateWithFocus(selector = "") {
    return renderCreateModal({
      immediate: true,
      preserveFocus: true,
      focusSelector: selector,
    });
  }

  function scheduleClientSearch(value = "") {
    const query = cleanText(value, "");
    const seq = ++clientSearchSeq;

    createModal.clientSearch.query = query;
    createModal.clientSearch.error = "";
    createModal.clientSearch.empty = false;

    if (clientSearchTimer) {
      window.clearTimeout(clientSearchTimer);
      clientSearchTimer = null;
    }

    if (query.length < SEARCH_MIN_LENGTH) {
      createModal.clientSearch.loading = false;
      createModal.clientSearch.results = [];
      patchCreateClientSearchDom();
      return true;
    }

    createModal.clientSearch.loading = true;
    createModal.clientSearch.results = [];
    patchCreateClientSearchDom();

    clientSearchTimer = window.setTimeout(() => {
      clientSearchTimer = null;
      void runClientSearch(query, seq);
    }, SEARCH_DEBOUNCE_MS);

    return true;
  }

  async function runClientSearch(query = "", seq = null) {
    const requestQuery = cleanText(query, "");

    const requestSeq =
      Number.isInteger(seq)
        ? seq
        : ++clientSearchSeq;

    try {
      const results = await searchClients(requestQuery);

      if (
        requestSeq !== clientSearchSeq ||
        requestQuery !== createModal.clientSearch.query ||
        destroyed ||
        !createModal.open
      ) {
        return false;
      }

      createModal.clientSearch.loading = false;
      createModal.clientSearch.error = "";
      createModal.clientSearch.results = results;
      createModal.clientSearch.empty = results.length === 0;

      patchCreateClientSearchDom();
      return true;
    } catch (searchError) {
      if (
        requestSeq !== clientSearchSeq ||
        destroyed ||
        !createModal.open
      ) {
        return false;
      }

      createModal.clientSearch.loading = false;
      createModal.clientSearch.results = [];
      createModal.clientSearch.empty = false;
      createModal.clientSearch.error = safeError(
        searchError,
        "No se pudo buscar cliente."
      );

      patchCreateClientSearchDom();
      return false;
    }
  }

  function selectClient(index = -1) {
    const item = createModal.clientSearch.results[index];
    if (!item?.id) return false;

    clientSearchSeq += 1;
    ticketSearchSeq += 1;
    clearCreateTimers();

    const exists = createModal.selectedClientes.some(
      (client) =>
        client.id === item.id ||
        client.clienteId === item.clienteId ||
        (
          client.userId &&
          client.userId === item.userId
        )
    );

    if (!exists) {
      createModal.selectedClientes = [
        ...createModal.selectedClientes,
        item,
      ];
    }

    syncPrimaryClientToForm();

    const nextErrors = { ...createModal.errors };
    delete nextErrors.clienteId;
    delete nextErrors.incidenciaId;
    createModal.errors = nextErrors;

    createModal.clientSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    createModal.ticketSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    rerenderCreateWithFocus(
      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
    );

    void loadTicketsForSelectedClients({
      autoSelectLatest: false,
    });

    return true;
  }

  function removeClient(index = -1) {
    if (
      index < 0 ||
      index >= createModal.selectedClientes.length
    ) {
      return false;
    }

    ticketSearchSeq += 1;

    createModal.selectedClientes =
      createModal.selectedClientes.filter(
        (_, currentIndex) => currentIndex !== index
      );

    syncPrimaryClientToForm();

    createModal.selectedTickets =
      createModal.selectedTickets.filter(
        (ticket) =>
          ticketBelongsToClients(
            ticket,
            createModal.selectedClientes
          )
      );

    if (!createModal.selectedClientes.length) {
      createModal.selectedTickets = [];
    }

    syncPrimaryTicketToForm();

    createModal.ticketSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    rerenderCreateWithFocus(
      createModal.selectedClientes.length
        ? "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
        : "[data-field='clienteSearch'], [data-create-field='clienteSearch'], input[name='clienteSearch']"
    );

    if (createModal.selectedClientes.length) {
      void loadTicketsForSelectedClients({
        autoSelectLatest:
          createModal.selectedTickets.length === 0,
      });
    }

    return true;
  }

  function makeClientPrimary(index = -1) {
    if (
      index <= 0 ||
      index >= createModal.selectedClientes.length
    ) {
      return false;
    }

    const item = createModal.selectedClientes[index];

    createModal.selectedClientes = [
      item,
      ...createModal.selectedClientes.filter(
        (_, currentIndex) => currentIndex !== index
      ),
    ];

    syncPrimaryClientToForm();
    syncPrimaryTicketToForm();

    rerenderCreateWithFocus(
      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
    );

    return true;
  }

  function clearClients() {
    clientSearchSeq += 1;
    ticketSearchSeq += 1;
    clearCreateTimers();

    createModal.selectedClientes = [];
    createModal.selectedTickets = [];

    createModal.clientSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    createModal.ticketSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    syncPrimaryClientToForm();
    syncPrimaryTicketToForm();

    rerenderCreateWithFocus(
      "[data-field='clienteSearch'], [data-create-field='clienteSearch'], input[name='clienteSearch']"
    );

    return true;
  }

  function scheduleTicketSearch(value = "") {
    const query = cleanText(value, "");
    const seq = ++ticketSearchSeq;

    createModal.ticketSearch.query = query;
    createModal.ticketSearch.error = "";
    createModal.ticketSearch.empty = false;

    if (ticketSearchTimer) {
      window.clearTimeout(ticketSearchTimer);
      ticketSearchTimer = null;
    }

    if (!createModal.selectedClientes.length) {
      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.results = [];
      patchCreateTicketSearchDom();
      return true;
    }

    createModal.ticketSearch.loading = true;
    patchCreateTicketSearchDom();

    ticketSearchTimer = window.setTimeout(() => {
      ticketSearchTimer = null;

      void loadTicketsForSelectedClients({
        query,
        autoSelectLatest: false,
        seq,
      });
    }, SEARCH_DEBOUNCE_MS);

    return true;
  }

  async function loadTicketsForSelectedClients({
    query = createModal.ticketSearch.query,
    autoSelectLatest = false,
    seq = null,
  } = {}) {
    if (!createModal.selectedClientes.length) {
      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.results = [];
      createModal.ticketSearch.empty = false;
      patchCreateTicketSearchDom();
      return [];
    }

    const requestQuery = cleanText(query, "");

    const requestSeq =
      Number.isInteger(seq)
        ? seq
        : ++ticketSearchSeq;

    const clientKey = [
      ...selectedClienteIds(createModal.selectedClientes),
      ...selectedUserIds(createModal.selectedClientes),
    ]
      .sort()
      .join("|");

    createModal.ticketSearch.query = requestQuery;
    createModal.ticketSearch.loading = true;
    createModal.ticketSearch.error = "";
    createModal.ticketSearch.empty = false;

    patchCreateTicketSearchDom();

    try {
      const results = await searchTickets(
        requestQuery,
        createModal.selectedClientes
      );

      const currentClientKey = [
        ...selectedClienteIds(createModal.selectedClientes),
        ...selectedUserIds(createModal.selectedClientes),
      ]
        .sort()
        .join("|");

      if (
        requestSeq !== ticketSearchSeq ||
        clientKey !== currentClientKey ||
        destroyed ||
        !createModal.open
      ) {
        return [];
      }

      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.error = "";
      createModal.ticketSearch.results = results;
      createModal.ticketSearch.empty = results.length === 0;

      if (
        autoSelectLatest &&
        results[0]?.id &&
        !createModal.selectedTickets.length
      ) {
        createModal.selectedTickets = [results[0]];
        syncPrimaryTicketToForm();

        rerenderCreateWithFocus(
          "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
        );

        return results;
      }

      patchCreateTicketSearchDom();
      return results;
    } catch (searchError) {
      if (
        requestSeq !== ticketSearchSeq ||
        destroyed ||
        !createModal.open
      ) {
        return [];
      }

      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.empty = createModal.ticketSearch.results.length === 0;
      createModal.ticketSearch.error = safeError(
        searchError,
        "No se pudieron cargar incidencias."
      );

      patchCreateTicketSearchDom();
      return [];
    }
  }

  function selectTicket(index = -1) {
    const item = createModal.ticketSearch.results[index];
    if (!item?.id) return false;

    const exists = createModal.selectedTickets.some(
      (ticket) =>
        ticket.id === item.id ||
        ticket.ticketId === item.id ||
        ticket.incidenciaId === item.id
    );

    if (!exists) {
      createModal.selectedTickets = [
        ...createModal.selectedTickets,
        item,
      ];
    }

    syncPrimaryTicketToForm();

    const nextErrors = { ...createModal.errors };
    delete nextErrors.incidenciaId;
    createModal.errors = nextErrors;

    createModal.ticketSearch = {
      ...createModal.ticketSearch,
      loading: false,
      error: "",
      empty: createModal.ticketSearch.results.length === 0,
    };

    rerenderCreateWithFocus(
      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
    );

    return true;
  }

  function removeTicket(index = -1) {
    if (
      index < 0 ||
      index >= createModal.selectedTickets.length
    ) {
      return false;
    }

    createModal.selectedTickets =
      createModal.selectedTickets.filter(
        (_, currentIndex) => currentIndex !== index
      );

    syncPrimaryTicketToForm();

    rerenderCreateWithFocus(
      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
    );

    return true;
  }

  function makeTicketPrimary(index = -1) {
    if (
      index <= 0 ||
      index >= createModal.selectedTickets.length
    ) {
      return false;
    }

    const item = createModal.selectedTickets[index];

    createModal.selectedTickets = [
      item,
      ...createModal.selectedTickets.filter(
        (_, currentIndex) => currentIndex !== index
      ),
    ];

    syncPrimaryTicketToForm();

    rerenderCreateWithFocus(
      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
    );

    return true;
  }

  function clearTickets() {
    ticketSearchSeq += 1;

    createModal.selectedTickets = [];

    createModal.ticketSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      empty: false,
    };

    syncPrimaryTicketToForm();

    rerenderCreateWithFocus(
      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"
    );

    return true;
  }

  function addCreateLineItem() {
    const lineas = safeArray(createModal.form.lineas).map((linea) => ({ ...safeObject(linea) }));
    const id = `linea-${Date.now()}-${lineas.length + 1}`;
    lineas.push({
      id,
      concepto: "",
      descripcion: "",
      cantidad: 1,
      unidad: "ud",
      precioUnitario: 0,
    });

    createModal.form = {
      ...createModal.form,
      lineas,
    };
    createModal.serverError = "";

    renderCreateModal({
      immediate: true,
      preserveFocus: true,
      focusSelector: `[data-line-index="${lineas.length - 1}"][data-line-field="concepto"]`,
    });
    return true;
  }

  function removeCreateLineItem(index = -1) {
    const lineas = safeArray(createModal.form.lineas).map((linea) => ({ ...safeObject(linea) }));
    const targetIndex = number(index, -1);
    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= lineas.length ||
      lineas.length <= 1
    ) {
      return false;
    }

    lineas.splice(targetIndex, 1);
    createModal.form = {
      ...createModal.form,
      lineas,
    };
    createModal.errors = {};
    createModal.serverError = "";

    renderCreateModal({
      immediate: true,
      preserveFocus: true,
      focusSelector: `[data-line-index="${Math.max(0, targetIndex - 1)}"][data-line-field="concepto"]`,
    });
    return true;
  }

  function readCreateLineItems(formNode = null) {
    if (!formNode?.querySelectorAll) {
      return safeArray(createModal.form.lineas);
    }

    return Array.from(
      formNode.querySelectorAll("[data-line-item='true']")
    ).map((row, index) => {
      const read = (field) =>
        row.querySelector(`[data-line-field="${field}"]`)?.value ?? "";

      return {
        id: cleanText(
          first(
            safeArray(createModal.form.lineas)[index]?.id,
            `linea-${index + 1}`
          ),
          `linea-${index + 1}`
        ),
        concepto: cleanText(read("concepto"), ""),
        descripcion: multilineValue(read("descripcion")),
        cantidad: number(read("cantidad"), 0),
        unidad: cleanText(read("unidad"), "ud"),
        precioUnitario: number(read("precioUnitario"), 0),
      };
    });
  }

  function buildFacturaPayload() {
    syncPrimaryClientToForm();
    syncPrimaryTicketToForm();

    const form = createModal.form;
    const breakdown = getFacturaCreateBreakdown(form);

    const primaryCliente =
      createModal.selectedClientes[0] || null;

    const primaryTicket =
      createModal.selectedTickets[0] || null;

    const clienteIds =
      selectedClienteIds(createModal.selectedClientes);

    const userIds =
      selectedUserIds(createModal.selectedClientes);

    const ticketIds = [
      ...new Set(
        createModal.selectedTickets
          .map((ticket) =>
            cleanText(
              first(
                ticket.ticketId,
                ticket.incidenciaId,
                ticket.id
              ),
              ""
            )
          )
          .filter(Boolean)
      ),
    ];

    const clienteId = cleanText(
      first(
        primaryCliente?.clienteId,
        primaryCliente?.id,
        form.clienteId
      ),
      ""
    );

    const userId = cleanText(
      first(
        primaryCliente?.userId,
        form.clienteUserId
      ),
      ""
    );

    const clienteNombre = cleanText(
      first(
        primaryCliente?.name,
        primaryCliente?.displayName,
        form.clienteNombre
      ),
      ""
    );

    const clienteEmail = cleanText(
      first(
        primaryCliente?.email,
        form.clienteEmail
      ),
      ""
    ).toLowerCase();

    const clienteAvatar = cleanText(
      first(
        primaryCliente?.avatarUrl,
        primaryCliente?.avatar,
        form.clienteAvatar
      ),
      ""
    );

    const ticketId = cleanText(
      first(
        primaryTicket?.ticketId,
        primaryTicket?.incidenciaId,
        primaryTicket?.id,
        form.ticketId,
        form.incidenciaId
      ),
      ""
    );

    const incidenciaSubject = cleanText(
      first(
        primaryTicket?.subject,
        primaryTicket?.asunto,
        form.incidenciaSubject,
        ticketId
      ),
      ticketId
    );

    return {
      ...form,

      clienteId,
      userId,
      clienteUserId: userId,
      clienteNombre,
      clienteEmail,
      clienteAvatar,

      clienteIds,
      userIds,
      clientes: createModal.selectedClientes,

      ticketId,
      incidenciaId: ticketId,
      relatedTicketId: ticketId,
      relatedIncidentId: ticketId,
      incidenciaSubject,
      ticketSubject: incidenciaSubject,

      ticketIds,
      incidenciaIds: ticketIds,
      tickets: createModal.selectedTickets,
      incidencias: createModal.selectedTickets,

      total: breakdown.totalFactura,
      amount: breakdown.totalFactura,
      importe: breakdown.totalFactura,
      totalFactura: breakdown.totalFactura,

      subtotal: breakdown.base,
      baseImponible: breakdown.base,

      iva: breakdown.ivaTotal,
      ivaTotal: breakdown.ivaTotal,

      irpf: Math.abs(breakdown.irpfTotal),
      irpfTotal: breakdown.irpfTotal,

      currency: "EUR",
      moneda: "EUR",

      lineas: safeArray(breakdown.lineas).map((linea, index) => {
        const baseLinea = number(linea.base, 0);
        const ivaImporte = Math.round(
          (baseLinea * (breakdown.ivaRate / 100) + Number.EPSILON) * 100
        ) / 100;
        const irpfImporte = breakdown.aplicaIrpf
          ? -Math.round(
              (baseLinea * (breakdown.irpfRate / 100) + Number.EPSILON) * 100
            ) / 100
          : 0;

        return {
          id: cleanText(
            first(linea.id, `linea-${index + 1}`),
            `linea-${index + 1}`
          ),
          lineNumber: index + 1,
          concepto: cleanText(linea.concepto, ""),
          descripcion: cleanText(
            first(linea.descripcion, linea.concepto),
            ""
          ),
          cantidad: number(linea.cantidad, 0),
          unidad: cleanText(linea.unidad, "ud"),
          precioUnitario: number(linea.precioUnitario, 0),
          subtotal: baseLinea,
          base: baseLinea,
          baseImponible: baseLinea,
          totalLinea: baseLinea,
          total: baseLinea,
          importe: baseLinea,
          iva: {
            porcentaje: breakdown.ivaRate,
            importe: ivaImporte,
          },
          irpf: {
            porcentaje: breakdown.irpfRate,
            importe: irpfImporte,
          },
        };
      }),

      impuestos: [
        {
          tipo: "IVA",
          porcentaje: breakdown.ivaRate,
          base: breakdown.base,
          importe: breakdown.ivaTotal,
        },
        {
          tipo: "IRPF",
          porcentaje: breakdown.irpfRate,
          base: breakdown.base,
          importe: breakdown.irpfTotal,
        },
      ],
    };
  }

  async function submitCreate(formNode = null) {
    if (createModal.submitting || !isAdmin()) return false;

    if (formNode) {
      createModal.form = {
        ...createModal.form,
        lineas: readCreateLineItems(formNode),
        fechaServicio: readField(formNode, "fechaServicio"),
        formaPago: readField(formNode, "formaPago"),
        estadoPago: readField(formNode, "estadoPago"),
        sendEmail: readField(formNode, "sendEmail"),
      };
    }

    const validation = safeObject(
      validateFacturaCreateForm({
        form: createModal.form,
        selectedClientes: createModal.selectedClientes,
        selectedTickets: createModal.selectedTickets,
      }),
      {}
    );

    createModal.errors = safeObject(validation.errors, {});

    createModal.form = {
      ...createModal.form,
      ...safeObject(validation.form, {}),
    };

    if (
      validation.valid !== true ||
      Object.keys(createModal.errors).length
    ) {
      renderCreateModal({
        immediate: true,
        preserveFocus: true,
      });

      return false;
    }

    creating = true;
    createModal.submitting = true;
    createModal.serverError = "";

    renderCreateModal({
      immediate: true,
      preserveFocus: true,
    });

    try {
      const created = await createFactura(
        buildFacturaPayload()
      );

      const canOptimisticallyInsert = facturasCanOptimisticallyInsertCreated({
        created,
        filter,
        search,
        hasMore,
        sort,
        currentQuery: itemsBelongToCurrentQuery(),
      });
      if (canOptimisticallyInsert) {
        const previousCount = items.length;
        items = upsertFactura(items, created, sort);
        total = Math.max(
          total + (items.length > previousCount ? 1 : 0),
          items.length
        );
        syncListCacheSnapshot();
      }

      creating = false;
      resetCreateModal();
      removeCreateModalHost();
      syncModalBodyState();

      deferredRenderOptions = null;

      render({
        immediate: true,
        allowWhileModal: true,
      });

      restoreModalReturnFocus();
      void reloadFromStart({
        force: true,
        silent: true,
        keepItems: itemsBelongToCurrentQuery(),
      });
      return true;
    } catch (createError) {
      creating = false;
      createModal.submitting = false;
      createModal.serverError = safeError(
        createError,
        "No se pudo crear la factura."
      );

      renderCreateModal({
        immediate: true,
        preserveFocus: true,
      });

      return false;
    }
  }

  /* ---------------------------------------------------------
     Detail state/open
  --------------------------------------------------------- */

  function resetDetailModal() {
    detailModal.open = false;
    detailModal.detailOpen = false;
    detailModal.detailLoading = false;
    detailModal.factura = null;
    detailModal.markingPaidFacturaId = "";
    detailModal.sendingFacturaId = "";
    detailModal.viewingFacturaId = "";
    detailModal.downloadingFacturaId = "";
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";
    openingFacturaId = "";
  }

  function closeDetailModal() {
    if (
      markingPaidFacturaId ||
      detailModal.markingPaidFacturaId
    ) {
      return false;
    }

    detailSessionSeq += 1;

    resetDetailModal();

    renderDetailModal({
      immediate: true,
    });

    const flushedMain = flushDeferredMainRender({
      immediate: true,
    });
    if (!flushedMain) syncInfiniteObserver();

    restoreModalReturnFocus();
    return true;
  }

  async function openFactura(facturaId = "", openerNode = null) {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    /*
       Guard contra eventos duplicados.
    */
    if (
      detailModalIsOpen() &&
      getFacturaId(detailModal.factura || {}) === id
    ) {
      return true;
    }

    rememberModalReturnFocus(openerNode);
    suspendScheduledMainRender();
    disconnectInfiniteObserver();

    const local =
      items.find((item) => getFacturaId(item) === id) || null;

    const session = ++detailSessionSeq;
    openingFacturaId = id;

    detailModal.open = true;
    detailModal.detailOpen = true;

    /*
       Si ya tenemos datos del listado:
       no mostramos skeleton.
    */
    detailModal.detailLoading = !local;
    detailModal.factura = local;
    detailModal.markingPaidFacturaId = "";
    detailModal.sendingFacturaId = "";
    detailModal.viewingFacturaId = "";
    detailModal.downloadingFacturaId = "";

    clearDetailFeedback();

    /*
       ÚNICO montaje del shell.
    */
    renderDetailModal({
      immediate: true,
      forceShell: true,
      focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
      preserveFocus: false,
    });

    try {
      const detail = await getFacturaById(id);

      if (
        destroyed ||
        session !== detailSessionSeq ||
        !detailModalIsOpen()
      ) {
        return false;
      }

      const merged = detail
        ? mergeFacturaData(local || {}, detail)
        : local;

      if (merged) {
        detailModal.factura = merged;
        items = upsertFactura(items, merged, sort);
      }

      detailModal.detailLoading = false;
      openingFacturaId = "";

      /*
         Patch interno:
         NO recrea overlay/panel.
      */
      renderDetailModal({
        immediate: true,
        preserveFocus: true,
      });

      return Boolean(merged);
    } catch (detailError) {
      if (
        destroyed ||
        session !== detailSessionSeq ||
        !detailModalIsOpen()
      ) {
        return false;
      }

      detailModal.detailLoading = false;
      openingFacturaId = "";

      if (local) {
        setDetailFeedback(
          safeError(
            detailError,
            "No se pudo actualizar el detalle completo de la factura."
          ),
          "error"
        );

        return false;
      }

      error = safeError(
        detailError,
        "No se pudo abrir el detalle de factura."
      );

      closeDetailModal();
      render();

      return false;
    }
  }

  function getFacturaForAction(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return null;

    const detail = safeObject(detailModal.factura, null);

    if (detail && getFacturaId(detail) === id) {
      return detail;
    }

    return (
      items.find((item) => getFacturaId(item) === id) ||
      null
    );
  }

  function detailMatchesFactura(facturaId = "") {
    const id = cleanText(facturaId, "");

    return Boolean(
      detailModalIsOpen() &&
      detailModal.factura &&
      getFacturaId(detailModal.factura) === id
    );
  }

  /* ---------------------------------------------------------
     PDF / SEND / PAYMENT
  --------------------------------------------------------- */

  async function viewPdf(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    const popup = openPendingWindow("Abriendo factura…");

    viewingFacturaId = id;

    if (detailMatchesFactura(id)) {
      detailModal.viewingFacturaId = id;
      clearDetailFeedback();

      renderDetailModal({
        immediate: true,
        preserveFocus: true,
      });
    } else {
      render();
    }

    try {
      const factura = getFacturaForAction(id);

      const result = await viewFacturaPdfRequest(id, {
        factura,
      });

      const resolved = await resolveFacturaPdfResult(result, {
        mode: "view",
        objectUrls,
      });

      if (!resolved.url) {
        throw new Error("FACTURA_PDF_URL_NOT_FOUND");
      }

      navigateWindowOrOpen(resolved.url, popup);

      viewingFacturaId = "";

      if (detailMatchesFactura(id)) {
        detailModal.viewingFacturaId = "";

        setDetailFeedback(
          "PDF abierto correctamente.",
          "success"
        );
      } else {
        render();
      }

      return true;
    } catch (pdfError) {
      closePendingWindow(popup);
      viewingFacturaId = "";

      const message = safeError(
        pdfError,
        "No se pudo abrir el PDF."
      );

      if (detailMatchesFactura(id)) {
        detailModal.viewingFacturaId = "";
        setDetailFeedback(message, "error");
      } else {
        error = message;
        render();
      }

      return false;
    }
  }

  async function downloadPdf(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    downloadingFacturaId = id;

    if (detailMatchesFactura(id)) {
      detailModal.downloadingFacturaId = id;
      clearDetailFeedback();

      renderDetailModal({
        immediate: true,
        preserveFocus: true,
      });
    } else {
      render();
    }

    try {
      const factura = getFacturaForAction(id);

      let result = await downloadFacturaPdfRequest(id, {
        autoDownload: false,
        factura,
      });

      let resolved = await resolveFacturaPdfResult(result, {
        mode: "download",
        objectUrls,
      });

      if (!resolved.url) {
        result = await viewFacturaPdfRequest(id, {
          factura,
        });

        resolved = await resolveFacturaPdfResult(result, {
          mode: "download",
          objectUrls,
        });
      }

      if (!resolved.url) {
        throw new Error("FACTURA_PDF_DOWNLOAD_URL_NOT_FOUND");
      }

      await downloadRemotePdf(
        resolved.url,
        resolved.filename || "factura.pdf",
        objectUrls
      );

      downloadingFacturaId = "";

      if (detailMatchesFactura(id)) {
        detailModal.downloadingFacturaId = "";

        setDetailFeedback(
          "Descarga de factura preparada.",
          "success"
        );
      } else {
        render();
      }

      return true;
    } catch (downloadError) {
      downloadingFacturaId = "";

      const message = safeError(
        downloadError,
        "No se pudo descargar la factura."
      );

      if (detailMatchesFactura(id)) {
        detailModal.downloadingFacturaId = "";
        setDetailFeedback(message, "error");
      } else {
        error = message;
        render();
      }

      return false;
    }
  }

  async function sendFacturaToClient(
    facturaId = "",
    { confirmResend = true } = {}
  ) {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    const before = getFacturaForAction(id);
    const alreadySent = isFacturaSent(before || {});

    if (alreadySent && confirmResend && isBrowser()) {

      const recipient = getFacturaEmail(before || {});

      const confirmed = await confirmFacturaResend({

        factura: before || {},

        recipient,

      });

      if (!confirmed) return false;

    }

    sendingFacturaId = id;

    if (detailMatchesFactura(id)) {
      detailModal.sendingFacturaId = id;
      clearDetailFeedback();

      renderDetailModal({
        immediate: true,
        preserveFocus: true,
      });
    } else {
      render();
    }

    try {
      const result = await sendFactura(id);
      const resultObject = safeObject(result, null);

      if (
        resultObject &&
        (
          resultObject.id ||
          resultObject.facturaId ||
          resultObject.invoiceId ||
          resultObject.numeroFacturaLegal
        )
      ) {
        items = upsertFactura(items, resultObject, sort);
      }

      let refreshed = null;

      try {
        refreshed = await getFacturaById(id);
      } catch {
        refreshed = null;
      }

      if (refreshed) {
        items = upsertFactura(items, refreshed, sort);
      }

      const latest = refreshed || resultObject || before;
      sendingFacturaId = "";

      if (detailMatchesFactura(id)) {
        detailModal.sendingFacturaId = "";

        if (latest) {
          detailModal.factura = mergeFacturaData(
            detailModal.factura || {},
            latest
          );
        }

        setDetailFeedback(
          alreadySent
            ? "Factura reenviada correctamente."
            : "Factura enviada correctamente.",
          "success"
        );
      } else {
        render();
      }

      return true;
    } catch (sendError) {
      sendingFacturaId = "";

      const message = safeError(
        sendError,
        alreadySent
          ? "No se pudo reenviar la factura."
          : "No se pudo enviar la factura."
      );

      if (detailMatchesFactura(id)) {
        detailModal.sendingFacturaId = "";
        setDetailFeedback(message, "error");
      } else {
        error = message;
        render();
      }

      return false;
    }
  }

  async function markFacturaAsPaid(facturaId = "") {
    const id = cleanText(facturaId, "");

    if (
      !id ||
      !isAdmin() ||
      markingPaidFacturaId
    ) {
      return false;
    }

    const before = getFacturaForAction(id);
    if (!before) return false;

    if (isFacturaPaidState(before)) {
      if (detailMatchesFactura(id)) {
        setDetailFeedback(
          "La factura ya está marcada como pagada.",
          "info"
        );
      }

      return true;
    }

    if (isBrowser()) {
      const label = getFacturaLabel(before);
      const amount = number(
        first(
          before.total,
          before.totalFactura,
          before.amount,
          before.importe,
          0
        ),
        0
      );

      const currency = cleanText(
        first(before.currency, before.moneda, "EUR"),
        "EUR"
      ).toUpperCase();

      let formattedAmount = "";

      try {
        formattedAmount = new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        formattedAmount = `${amount
          .toFixed(2)
          .replace(".", ",")} ${currency}`;
      }

      const question =
        `¿Marcar la factura ${label} como pagada por ${formattedAmount}?\n\n` +
        "Se registrará el cobro completo y el pendiente quedará a 0. " +
        "Esta acción no reenviará la factura ni regenerará el PDF.";

      if (!window.confirm(question)) {
        return false;
      }
    }

    markingPaidFacturaId = id;

    if (detailMatchesFactura(id)) {
      detailModal.markingPaidFacturaId = id;
      clearDetailFeedback();

      renderDetailModal({
        immediate: true,
        preserveFocus: true,
      });
    } else {
      render();
    }

    try {
      const result = await markFacturaPaid(id);
      const resultObject = safeObject(result, null);

      if (resultObject) {
        items = upsertFactura(items, resultObject, sort);
      }

      let refreshed = null;

      try {
        refreshed = await getFacturaById(id);
      } catch {
        refreshed = null;
      }

      if (refreshed) {
        items = upsertFactura(items, refreshed, sort);
      }

      const latest = refreshed || resultObject || before;
      markingPaidFacturaId = "";

      if (detailMatchesFactura(id)) {
        detailModal.markingPaidFacturaId = "";

        if (latest) {
          detailModal.factura = mergeFacturaData(
            detailModal.factura || {},
            latest
          );
        }

        setDetailFeedback(
          "Factura marcada como pagada correctamente.",
          "success"
        );
      } else {
        render();
      }

      void reloadFromStart({
        force: true,
        silent: true,
        keepItems: true,
      });

      return true;
    } catch (paymentError) {
      markingPaidFacturaId = "";

      const message = safeError(
        paymentError,
        "No se pudo registrar el pago de la factura."
      );

      if (detailMatchesFactura(id)) {
        detailModal.markingPaidFacturaId = "";
        setDetailFeedback(message, "error");
      } else {
        error = message;
        render();
      }

      return false;
    }
  }

  async function openIncidencia(ticketId = "") {
    const id = cleanText(ticketId, "");
    if (!id) return false;

    const Router = getRouter(context);
    const route = ROUTES.incidencias || "/incidencias";

    if (isFunction(Router?.navigate)) {
      modalReturnFocus = null;

      await Router.navigate(route, {
        source: "facturas.open-incidencia",
        ticketId: id,
      });

      return true;
    }

    return false;
  }

  /* ---------------------------------------------------------
     Actions/events
  --------------------------------------------------------- */

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");
    if (!type) return false;

    if (type === FACTURAS_ACTIONS.REFRESH) return refresh();
    if (type === FACTURAS_ACTIONS.EXPORT) return exportCsv(items);

    if (type === FACTURAS_ACTIONS.CREATE_OPEN) {
      return openCreateModal(node);
    }

    if (type === FACTURAS_ACTIONS.FILTER) {
      return setFilter(node?.dataset?.filter || "all");
    }

    if (type === FACTURAS_ACTIONS.CLEAR_FILTERS) {
      return clearFilters();
    }

    if (type === FACTURAS_ACTIONS.CLEAR_SEARCH) {
      return setSearch("");
    }

    if (type === FACTURAS_ACTIONS.SORT) {
      return setSort(
        node?.dataset?.sort ||
        node?.dataset?.sortMode ||
        "date_desc"
      );
    }

    if (type === FACTURAS_ACTIONS.RETRY_PAGE) {
      return loadMore();
    }

    if (
      FACTURAS_ACTIONS.PREV_PAGE &&
      type === FACTURAS_ACTIONS.PREV_PAGE
    ) {
      return setPage(
        node?.dataset?.page ||
        Math.max(DEFAULT_PAGE, page - 1)
      );
    }

    if (
      FACTURAS_ACTIONS.NEXT_PAGE &&
      type === FACTURAS_ACTIONS.NEXT_PAGE
    ) {
      return setPage(
        node?.dataset?.page ||
        page + 1
      );
    }

    if (type === FACTURAS_ACTIONS.OPEN_FACTURA) {
      return openFactura(
        facturaIdFromNode(node),
        node
      );
    }

    if (type === FACTURA_MODAL_ACTIONS.CLOSE) {
      return closeDetailModal();
    }

    if (
      type === FACTURAS_ACTIONS.VIEW_PDF ||
      type === FACTURA_MODAL_ACTIONS.VIEW_PDF
    ) {
      return viewPdf(facturaIdFromNode(node));
    }

    if (
      type === FACTURAS_ACTIONS.DOWNLOAD_PDF ||
      type === FACTURA_MODAL_ACTIONS.DOWNLOAD_PDF
    ) {
      return downloadPdf(facturaIdFromNode(node));
    }

    if (
      type === FACTURAS_ACTIONS.SEND_FACTURA ||
      type === FACTURA_MODAL_ACTIONS.SEND
    ) {
      return sendFacturaToClient(
        facturaIdFromNode(node),
        { confirmResend: true }
      );
    }

    if (type === FACTURA_MODAL_ACTIONS.MARK_PAID) {
      return markFacturaAsPaid(
        facturaIdFromNode(node)
      );
    }

    if (
      type === FACTURAS_ACTIONS.OPEN_INCIDENCIA ||
      type === FACTURA_MODAL_ACTIONS.OPEN_INCIDENCIA
    ) {
      return openIncidencia(
        node?.dataset?.ticketId ||
        node?.dataset?.incidenciaId ||
        ""
      );
    }

    if (type === FACTURA_CREATE_ACTIONS.CLOSE) {
      return closeCreateModal();
    }

    if (type === FACTURA_CREATE_ACTIONS.LINE_ADD) {
      return addCreateLineItem();
    }

    if (type === FACTURA_CREATE_ACTIONS.LINE_REMOVE) {
      return removeCreateLineItem(
        number(node?.dataset?.lineIndex, -1)
      );
    }

    if (type === FACTURA_CREATE_ACTIONS.SUBMIT) {
      return submitCreate(
        node?.closest?.("form") ||
        createModalHost?.querySelector?.(
          "#facturas-create-form, [data-facturas-create-form='true']"
        ) ||
        null
      );
    }

    if (type === FACTURA_CREATE_ACTIONS.CLIENT_SELECT) {
      return selectClient(clientIndexFromNode(node));
    }

    if (type === FACTURA_CREATE_ACTIONS.CLIENT_REMOVE) {
      return removeClient(clientIndexFromNode(node));
    }

    if (type === FACTURA_CREATE_ACTIONS.CLIENT_PRIMARY) {
      return makeClientPrimary(clientIndexFromNode(node));
    }


    if (type === FACTURA_CREATE_ACTIONS.TICKET_SELECT) {
      return selectTicket(ticketIndexFromNode(node));
    }

    if (type === FACTURA_CREATE_ACTIONS.TICKET_REMOVE) {
      return removeTicket(ticketIndexFromNode(node));
    }

    if (type === FACTURA_CREATE_ACTIONS.TICKET_PRIMARY) {
      return makeTicketPrimary(ticketIndexFromNode(node));
    }


    if (type === FACTURA_CREATE_ACTIONS.TICKET_REFRESH) {
      return loadTicketsForSelectedClients({
        autoSelectLatest: false,
      });
    }

    return false;
  }

  function actionFrom(node = null) {
    return cleanText(
      node?.dataset?.facturasAction ||
      node?.dataset?.facturaCreateAction ||
      node?.dataset?.action ||
      "",
      ""
    );
  }

  function onClick(event) {
    const target =
      event.target?.nodeType === 3
        ? event.target.parentElement
        : event.target;

    if (!target?.closest) return;

    const actionNode = target.closest(
      "[data-facturas-action], [data-factura-create-action], [data-action]"
    );

    if (actionNode && ownsNode(actionNode)) {
      const action = actionFrom(actionNode);

      if (action) {
        event.preventDefault();
        event.stopPropagation();

        void handleAction(action, actionNode);
        return;
      }
    }

    const row = target.closest(
      "[data-facturas-row='true']"
    );

    if (row && host?.contains(row)) {
      event.preventDefault();
      event.stopPropagation();

      void openFactura(
        row.dataset.facturaId || "",
        row
      );

      return;
    }

    const createOverlay = target.closest(
      CREATE_MODAL_OVERLAY_SELECTOR
    );

    const createPanel = target.closest(
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

    const detailOverlay = target.closest(
      DETAIL_MODAL_OVERLAY_SELECTOR
    );

    const detailPanel = target.closest(
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
    const target = event.target;

    if (!target || !ownsNode(target)) return;

    const field = cleanText(
      target?.dataset?.field ||
      target?.name ||
      "",
      ""
    );

    if (field === "search") {
      if (event.isComposing || listSearchComposing) return;
      setSearch(target.value || "");
      return;
    }

    if (field === "clienteSearch") {
      scheduleClientSearch(target.value || "");
      return;
    }

    if (field === "ticketSearch") {
      scheduleTicketSearch(target.value || "");
      return;
    }

    if (createModal.open) {
      patchCreateFormFromField(target);
    }
  }

  function onCompositionStart(event) {
    const target = event.target;
    if (
      target &&
      ownsNode(target) &&
      cleanText(target?.dataset?.field || target?.name || "", "") === "search"
    ) {
      listSearchComposing = true;
      cancelListSearchTimer();
      disconnectInfiniteObserver();
    }
  }

  function onCompositionEnd(event) {
    const target = event.target;
    if (
      !target ||
      !ownsNode(target) ||
      cleanText(target?.dataset?.field || target?.name || "", "") !== "search"
    ) {
      return;
    }

    listSearchComposing = false;
    setSearch(target.value || "");
  }

  function onChange(event) {
    const target = event.target;

    if (
      target &&
      ownsNode(target) &&
      createModal.open
    ) {
      patchCreateFormFromField(target);
    }
  }

  function onSubmit(event) {
    const form = event.target?.closest?.("form");

    if (!form || !ownsNode(form)) return;

    if (
      form.matches(
        "#facturas-create-form, [data-facturas-create-form='true']"
      )
    ) {
      event.preventDefault();
      event.stopPropagation();

      void submitCreate(form);
    }
  }

  function onKeydown(event) {
    if (anyModalIsOpen() && event.key === "Tab") {
      trapModalFocus(event);
      return;
    }

    if (event.key === "Escape") {
      if (detailModalIsOpen()) {
        event.preventDefault();
        event.stopPropagation();

        closeDetailModal();
        return;
      }

      if (createModal.open) {
        event.preventDefault();
        event.stopPropagation();

        closeCreateModal();
        return;
      }
    }

    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    const row = event.target?.closest?.(
      "[data-facturas-row='true']"
    );

    if (!row || !host?.contains(row)) return;

    event.preventDefault();
    event.stopPropagation();

    void openFactura(
      row.dataset.facturaId || "",
      row
    );
  }

  function shouldLoadMoreByScroll() {
    if (
      !isBrowser() ||
      destroyed ||
      loading ||
      refreshing ||
      loadingMore ||
      Boolean(listSearchTimer) ||
      listSearchComposing ||
      Boolean(error) ||
      Boolean(loadMoreError) ||
      !itemsBelongToCurrentQuery() ||
      !hasMore ||
      anyModalIsOpen()
    ) {
      return false;
    }

    try {
      const scrollRoot = infiniteScrollRoot || resolveInfiniteScrollRoot();
      if (!scrollRoot) return false;
      return scrollRoot.scrollHeight - (
        scrollRoot.scrollTop + scrollRoot.clientHeight
      ) < 900;
    } catch {
      return false;
    }
  }

  function onWindowScroll() {
    if (scrollTicking) return;

    scrollTicking = true;

    nextFrame(() => {
      scrollTicking = false;

      if (shouldLoadMoreByScroll()) {
        void loadMore();
      }
    });
  }

  function bindTarget(target = null) {
    target?.addEventListener?.("click", onClick);
    target?.addEventListener?.("input", onInput);
    target?.addEventListener?.("compositionstart", onCompositionStart);
    target?.addEventListener?.("compositionend", onCompositionEnd);
    target?.addEventListener?.("change", onChange);
    target?.addEventListener?.("submit", onSubmit);
    target?.addEventListener?.("keydown", onKeydown);
  }

  function unbindTarget(target = null) {
    target?.removeEventListener?.("click", onClick);
    target?.removeEventListener?.("input", onInput);
    target?.removeEventListener?.("compositionstart", onCompositionStart);
    target?.removeEventListener?.("compositionend", onCompositionEnd);
    target?.removeEventListener?.("change", onChange);
    target?.removeEventListener?.("submit", onSubmit);
    target?.removeEventListener?.("keydown", onKeydown);
  }

  function bind() {
    bindTarget(host);

    if (isBrowser()) {
      infiniteScrollRoot = resolveInfiniteScrollRoot();
      infiniteScrollRoot?.addEventListener?.("scroll", onWindowScroll, {
        passive: true,
      });

      window.addEventListener("resize", onWindowScroll, {
        passive: true,
      });
    }
  }

  function unbind() {
    unbindTarget(host);

    if (createModalHostBound) {
      unbindTarget(createModalHost);
      createModalHostBound = false;
    }

    if (detailModalHostBound) {
      unbindTarget(detailModalHost);
      detailModalHostBound = false;
    }

    if (isBrowser()) {
      infiniteScrollRoot?.removeEventListener?.("scroll", onWindowScroll);
      window.removeEventListener("resize", onWindowScroll);
      infiniteScrollRoot = null;
    }
  }

  /* ---------------------------------------------------------
     Public controller
  --------------------------------------------------------- */

  const controller = {
    version: FACTURAS_VIEW_VERSION,

    mount() {
      if (destroyed || mounted || !host) return controller;

      mounted = true;
      bind();

      pageSize = clamp(
        number(
          context.pageSize ||
          context.limit ||
          DEFAULT_BATCH_SIZE,
          DEFAULT_BATCH_SIZE
        ),
        MIN_BATCH_SIZE,
        MAX_BATCH_SIZE
      );

      if (items.length && !itemsBelongToCurrentQuery()) {
        resetListState({ keepItems: false });
      }

      if (items.length) {
        loading = false;
        render({ immediate: true });
      } else {
        loading = true;
        renderLoading();
      }

      void load({
        page: DEFAULT_PAGE,
        silent: true,
        preservePages: items.length > 0,
      });

      return controller;
    },

    destroy() {
      if (destroyed) return true;

      destroyed = true;
      mounted = false;

      listSeq += 1;
      clientSearchSeq += 1;
      ticketSearchSeq += 1;
      detailSessionSeq += 1;
      markingPaidFacturaId = "";
      listSearchComposing = false;

      clearTimers();
      cancelScheduledRender();
      cancelScheduledCreateRender();
      cancelScheduledDetailRender();

      deferredRenderOptions = null;

      disconnectInfiniteObserver();
      unbind();

      if (
        createModalHost?.dataset?.owner === controllerOwner
      ) {
        removeCreateModalHost();
      }

      if (
        detailModalHost?.dataset?.owner === controllerOwner
      ) {
        removeDetailModalHost();
      }

      revokeObjectUrls();

      syncBodyModalClass(false, {
        createOpen: false,
        detailOpen: false,
      });

      modalReturnFocus = null;

      if (
        host?.[FACTURAS_CONTROLLER_KEY] === controller
      ) {
        host.replaceChildren();

        try {
          delete host[FACTURAS_CONTROLLER_KEY];
        } catch {
          host[FACTURAS_CONTROLLER_KEY] = null;
        }
      }

      if (lastFacturasController === controller) {
        lastFacturasController = null;
      }

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
    loadMore,

    openCreateModal,
    closeCreateModal,

    openFactura,
    closeDetailModal,

    getSnapshot() {
      return {
        version: FACTURAS_VIEW_VERSION,
        mounted,
        destroyed,

        loading,
        refreshing,
        loadingMore,
        loadMoreError: Boolean(loadMoreError),
        creating,

        total,
        count: items.length,
        hasMore,
        page,
        nextPage,
        pageSize,

        filter,
        searchLength: search.length,
        sort,

        createModalOpen: createModal.open,
        detailModalOpen: detailModalIsOpen(),

        detailShellMounted: Boolean(
          detailModalHost?.querySelector?.(
            DETAIL_MODAL_PANEL_SELECTOR
          )
        ),

        openingFacturaId: openingFacturaId ? "***" : "",
        viewingFacturaId: viewingFacturaId ? "***" : "",
        downloadingFacturaId: downloadingFacturaId ? "***" : "",
        sendingFacturaId: sendingFacturaId ? "***" : "",
        markingPaidFacturaId: markingPaidFacturaId ? "***" : "",

        error: redact(error),

        policy: {
          noStore: true,
          singleDetailHost: true,
          mainRenderDeferredWhileModal: true,
          detailRequestRaceGuard: true,
          detailShellSingleMount: true,
          detailOverlayPersistent: true,
          detailPanelPersistent: true,
          detailContentPatchOnly: true,
          localDetailImmediate: true,
          createSearchDomIslands: true,
          createSearchNoFullRender: true,
          createSearchRaceGuard: true,
          noSecondOpenAnimation: true,
          duplicateOpenGuard: true,
          adminPaymentCommand: true,
          paymentMutationSingleFlight: true,
          paymentModalCloseGuard: true,
          ownerAuthorityBridge: true,
          initialBatchSize: DEFAULT_BATCH_SIZE,
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

export async function FacturasView(host = null, context = {}) {
  if (!isDomNode(host)) return null;

  const previous = host?.[FACTURAS_CONTROLLER_KEY] || null;

  if (previous && isFunction(previous.destroy)) {
    try {
      previous.destroy();
    } catch {
      // noop
    }
  }

  const controller = createFacturasController(host, context);
  host[FACTURAS_CONTROLLER_KEY] = controller;
  lastFacturasController = controller;

  return controller.mount();
}

export const FacturasIndex = FacturasView;

export async function openFacturaDetailById(
  facturaId = "",
  openerNode = null
) {
  try {
    if (
      !lastFacturasController ||
      typeof lastFacturasController.openFactura !== "function"
    ) {
      return false;
    }

    return Boolean(
      await lastFacturasController.openFactura(
        facturaId,
        openerNode
      )
    );
  } catch {
    return false;
  }
}

export default FacturasView;

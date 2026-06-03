/* =========================================================
   Onion Support - Facturas Index
   Archivo: /src/views/facturas/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Facturas.
   - Montar template principal.
   - Hidratar desde cache en memoria.
   - Pintar inmediatamente sin bloquear el Router.
   - Cargar/listar facturas desde facturas.api.js en background.
   - Scroll infinito real: page + limit + hasMore + nextPage.
   - Respetar orden/paginación del backend y API de Facturas.
   - Evitar renders innecesarios en búsqueda y modal de creación.
   - Crear factura.
   - Abrir detalle.
   - Ver/descargar PDF resolviendo respuestas JSON/SAS/blob de forma segura.
   - Enviar factura.
   - Buscar cliente para crear factura.
   - Buscar incidencias vinculables para crear factura.
   - Delegar HTML en templates.
   - Sin Store.
   - Sin State externo.
   - Sin actions/bindings/model/utils/facturasView legacy.
   - Sin fetch propio salvo resolución segura de blob/objectUrl/pdf.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  listFacturas,
  hydrateFacturasFromCache,
  getFacturaById,
  createFactura,
  sendFactura,
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
  FACTURA_CREATE_ACTIONS,
  getFacturaCreateFormDefaults,
  validateFacturaCreateForm,
  getFacturaCreateBreakdown,
} from "./facturas.template.create.js";

import {
  FACTURA_MODAL_ACTIONS,
  renderFacturasDetailModal,
} from "./facturas.template.modal.js";

export const FACTURAS_INDEX_VERSION = "facturas.index.productive.v7.modal-island-zero-flicker";
export const FACTURAS_VIEW_VERSION = FACTURAS_INDEX_VERSION;

const DEFAULT_PAGE = 1;
const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 200;

const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 10;
const TICKET_LIMIT = 60;
const SEARCH_DEBOUNCE_MS = 260;
const LIST_SEARCH_DEBOUNCE_MS = 280;
const INFINITE_ROOT_MARGIN = "900px 0px 900px 0px";

const DETAIL_MODAL_HOST_ID = "facturas-detail-root";
const DETAIL_MODAL_HOST_SELECTOR = `#${DETAIL_MODAL_HOST_ID}`;
const DETAIL_MODAL_PANEL_SELECTOR =
  "[data-facturas-detail-modal='true'], [data-role='facturas-detail-modal']";

const LOAD_MORE_ACTION = FACTURAS_ACTIONS.LOAD_MORE || "load-more";

const CLIENT_SEARCH_ENDPOINTS = Object.freeze([
  "/api/clientes",
  "/api/users",
  "/api/clientes/search",
  "/api/users/search",
  "/api/usuarios/search",
  "/api/search/clientes",
  "/api/search/users",
]);

const TICKET_SEARCH_ENDPOINTS = Object.freeze([
  "/api/tickets",
  "/api/incidencias",
  "/api/tickets/search",
  "/api/incidencias/search",
  "/api/search/tickets",
  "/api/search/incidencias",
]);

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

function number(value = 0, fallback = 0) {
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

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeError(error = null, fallback = "No se pudieron cargar las facturas.") {
  return cleanText(
    error?.message ||
      error?.data?.message ||
      error?.payload?.message ||
      error?.response?.message ||
      fallback,
    fallback
  );
}

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = normalizeKey(value);

  if (["admin", "administrator", "superadmin", "super_admin", "root", "owner"].includes(role)) return "admin";
  if (["user", "usuario", "client", "cliente", "customer"].includes(role)) return "user";

  return "";
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = normalizeKey(value);

    if (["true", "1", "yes", "si", "sí", "on"].includes(key)) return true;
    if (["false", "0", "no", "off"].includes(key)) return false;
  }

  return fallback;
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

function nextAnimationFrame(callback = null) {
  return Boolean(nextFrame(callback));
}

/* =========================================================
   CORE / ROUTER
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
  return cleanText(
    first(
      item.id,
      item.facturaId,
      item.invoiceId,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.numeroFactura,
      item.numero,
      item.number
    ),
    ""
  );
}

function mergeFacturas(currentItems = [], nextItems = [], { append = true } = {}) {
  const map = new Map();

  const push = (item = {}) => {
    const factura = safeObject(item, null);
    if (!factura) return;

    const id = getFacturaId(factura);
    if (!id) return;

    if (map.has(id)) {
      map.set(id, {
        ...map.get(id),
        ...factura,
      });
      return;
    }

    map.set(id, factura);
  };

  if (append) {
    safeArray(currentItems).forEach(push);
  }

  safeArray(nextItems).forEach(push);

  return [...map.values()];
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
    copy[index] = {
      ...copy[index],
      ...next,
    };
    return copy;
  }

  return normalizeKey(sortMode).endsWith("_asc")
    ? [...current, next]
    : [next, ...current];
}

function getFacturaLabel(item = {}) {
  return cleanText(
    first(
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.number,
      item.invoiceNumber,
      item.facturaId,
      item.invoiceId,
      item.id
    ),
    "Factura"
  );
}

/* =========================================================
   HTTP SEARCH HELPERS
========================================================= */

function getHttpClient() {
  try {
    return AppCore.getHttpClient?.() || AppCore.http || AppCore.Http || null;
  } catch {
    return AppCore.http || AppCore.Http || null;
  }
}

async function requestGet(endpoint = "", query = {}, source = "views.facturas") {
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

  const userId = cleanText(first(item.userId, item.usuarioId, item.uid, item.id), "");
  const clienteId = cleanText(first(item.clienteId, item.clientId, item.customerId, id), id);

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
    nombreContacto: cleanText(first(item.nombreContacto, item.contactName, name), name),
    razonSocial: cleanText(first(item.razonSocial, item.companyName, item.empresa, name), name),

    email,
    telefono: cleanText(first(item.telefono, item.phone, item.mobile, item.movil), ""),
    nif: cleanText(first(item.nif, item.cif, item.taxId, item.vatId), ""),
    username: cleanText(first(item.username, item.slug, email ? email.split("@")[0] : ""), ""),

    avatarUrl,
    avatar: avatarUrl,

    subtitle: cleanText(
      first(
        email,
        item.razonSocial && item.razonSocial !== name ? item.razonSocial : "",
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
    first(item.subject, item.asunto, item.title, item.name, item.preview, item.description),
    id
  );

  const status = cleanText(first(item.status, item.estado, item.state), "");
  const category = cleanText(first(item.category, item.categoria, item.tipo), "");

  return {
    ...item,

    id,
    ticketId: id,
    incidenciaId: id,

    subject,
    asunto: subject,
    title: subject,

    clienteId: cleanText(first(item.clienteId, item.clientId, item.cliente?.clienteId), ""),
    userId: cleanText(first(item.userId, item.usuarioId, item.userRef?.userId), ""),

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
        item.facturaLinked || item.meta?.hasFactura ? "Ya facturada" : "",
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

    const key = normalized.clienteId || normalized.userId || normalized.id;

    if (!map.has(key)) {
      map.set(key, normalized);
    }
  }

  return [...map.values()].slice(0, SEARCH_LIMIT);
}

function ticketBelongsToClients(ticket = {}, clients = []) {
  const selected = safeArray(clients);

  if (!selected.length) return true;

  const ticketClienteId = cleanText(ticket.clienteId, "");
  const ticketUserId = cleanText(ticket.userId, "");

  if (!ticketClienteId && !ticketUserId) return true;

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
      const left = Date.parse(a.updatedAt || a.lastActivityAt || a.createdAt || 0);
      const right = Date.parse(b.updatedAt || b.lastActivityAt || b.createdAt || 0);
      return right - left;
    })
    .slice(0, TICKET_LIMIT);
}

function selectedClienteIds(clients = []) {
  return [
    ...new Set(
      safeArray(clients)
        .map((item) => cleanText(first(item.clienteId, item.id), ""))
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

  if (!selectedClientes.length) return [];

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

          ...(clienteIds.length ? { clienteIds: clienteIds.join(",") } : {}),
          ...(userIds.length ? { userIds: userIds.join(",") } : {}),
        },
        "views.facturas.ticket-search"
      );

      const items = dedupeTickets(unwrapList(response), selectedClientes);

      if (items.length) return items;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;

  return [];
}

/* =========================================================
   BODY / FILE / CSV / PDF RESOLUTION
========================================================= */

function syncBodyModalClass(open = false, { detailOpen = false, createOpen = false } = {}) {
  if (!isBrowser()) return false;

  try {
    document.body?.classList.toggle("modal-open", open);
    document.body?.classList.toggle("facturas-modal-open", open);
    document.body?.classList.toggle("facturas-detail-open", detailOpen);
    document.body?.classList.toggle("facturas-create-open", createOpen);
    return true;
  } catch {
    return false;
  }
}

function openUrl(url = "") {
  if (!isBrowser()) return false;

  const target = cleanText(url, "");
  if (!target) return false;

  try {
    window.open(target, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

function isBlob(value = null) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isResponse(value = null) {
  return typeof Response !== "undefined" && value instanceof Response;
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
  return cleanText(type, "").toLowerCase().includes("application/pdf");
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
    const head = await blob.slice(0, 5).text();
    return head === "%PDF-";
  } catch {
    return false;
  }
}

async function readJsonBlob(blob = null) {
  if (!isBlob(blob)) return null;

  try {
    if (await blobStartsWithPdf(blob)) return null;

    const text = await blob.text();
    const clean = String(text || "").trim();

    if (!clean || (!clean.startsWith("{") && !clean.startsWith("["))) {
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

    const text = await clone.text();
    const clean = String(text || "").trim();

    if (!clean || (!clean.startsWith("{") && !clean.startsWith("["))) {
      return null;
    }

    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function getFacturaPdfFilename(payload = null, fallback = "factura.pdf") {
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
      data.file?.originalName,

      data.pdf?.filename,
      data.pdf?.fileName,
      data.pdf?.name,
      data.pdf?.originalName,

      data.blob?.filename,
      data.blob?.fileName,
      data.blob?.name,
      data.blob?.originalName,

      data.document?.filename,
      data.document?.fileName,
      data.document?.name,
      data.document?.originalName,

      data.factura?.document?.filename,
      data.factura?.document?.fileName,
      data.factura?.document?.name,

      data.factura?.numeroFacturaLegal ? `${data.factura.numeroFacturaLegal}.pdf` : "",
      data.item?.numeroFacturaLegal ? `${data.item.numeroFacturaLegal}.pdf` : "",
      data.data?.numeroFacturaLegal ? `${data.data.numeroFacturaLegal}.pdf` : "",
      data.invoice?.numeroFacturaLegal ? `${data.invoice.numeroFacturaLegal}.pdf` : "",

      data.numeroFacturaLegal ? `${data.numeroFacturaLegal}.pdf` : "",
      data.invoiceNumber ? `${data.invoiceNumber}.pdf` : ""
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

  return cleanText(
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

      download ? data.blob?.downloadUrl : data.blob?.viewUrl,
      data.blob?.signedUrl,
      data.blob?.sasUrl,
      data.blob?.url,

      download ? data.document?.downloadUrl : data.document?.viewUrl,
      data.document?.signedUrl,
      data.document?.sasUrl,
      data.document?.pdfUrl,
      data.document?.blobUrl,
      data.document?.url,

      download ? data.factura?.downloadUrl : data.factura?.viewUrl,
      data.factura?.signedUrl,
      data.factura?.sasUrl,
      data.factura?.pdfUrl,
      data.factura?.blobUrl,

      download ? data.factura?.document?.downloadUrl : data.factura?.document?.viewUrl,
      data.factura?.document?.signedUrl,
      data.factura?.document?.sasUrl,
      data.factura?.document?.pdfUrl,
      data.factura?.document?.blobUrl,
      data.factura?.document?.url,

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
  );
}

async function resolveBlobPdfResult(blob = null, {
  mode = "view",
  payload = null,
  objectUrls = null,
} = {}) {
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

  if (isPdfContentType(type) || await blobStartsWithPdf(blob)) {
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

async function resolveFacturaPdfResult(result = null, {
  mode = "view",
  objectUrls = null,
} = {}) {
  if (typeof result === "string") {
    return {
      url: cleanText(result, ""),
      filename: "factura.pdf",
      payload: null,
    };
  }

  if (isResponse(result)) {
    const type = getContentType(result);

    if (isPdfContentType(type)) {
      const blob = await result.blob();

      return resolveBlobPdfResult(blob, {
        mode,
        payload: null,
        objectUrls,
      });
    }

    const json = await readJsonResponse(result);

    return {
      url: pickFacturaPdfUrl(json, mode),
      filename: getFacturaPdfFilename(json),
      payload: json,
    };
  }

  if (isBlob(result)) {
    return resolveBlobPdfResult(result, {
      mode,
      payload: null,
      objectUrls,
    });
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
    const resolved = await resolveBlobPdfResult(result.blob, {
      mode,
      payload,
      objectUrls,
    });

    if (resolved.url || resolved.payload) {
      return resolved.payload
        ? {
            ...resolved,
            url: pickFacturaPdfUrl(resolved.payload, mode),
            filename: getFacturaPdfFilename(resolved.payload),
          }
        : resolved;
    }
  }

  const objectUrl = cleanText(result?.objectUrl, "");

  if (objectUrl) {
    if (objectUrl.startsWith("blob:")) {
      try {
        const response = await fetch(objectUrl);
        const blob = await response.blob();

        const resolved = await resolveBlobPdfResult(blob, {
          mode,
          payload,
          objectUrls,
        });

        if (resolved.url || resolved.payload) {
          return resolved.payload
            ? {
                ...resolved,
                url: pickFacturaPdfUrl(resolved.payload, mode),
                filename: getFacturaPdfFilename(resolved.payload),
              }
            : resolved;
        }
      } catch {
        // No abrir blob local a ciegas si puede ser JSON.
      }
    }

    if (isPdfUrl(objectUrl)) {
      return {
        url: objectUrl,
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
      popup.document.body.style.margin = "0";
      popup.document.body.style.background = "#111";
      popup.document.body.style.color = "#fff";
      popup.document.body.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      popup.document.body.style.display = "grid";
      popup.document.body.style.placeItems = "center";
      popup.document.body.style.minHeight = "100vh";
      popup.document.body.innerHTML = `<div style="font-size:14px;font-weight:700;opacity:.86">${title}</div>`;
    } catch {
      // noop
    }

    return popup;
  } catch {
    return null;
  }
}

function navigateWindowOrOpen(url = "", popup = null) {
  const target = cleanText(url, "");

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

function triggerDownloadLink(url = "", filename = "factura.pdf") {
  if (!isBrowser()) return false;

  const target = cleanText(url, "");
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

async function downloadRemotePdf(url = "", filename = "factura.pdf", objectUrls = null) {
  if (!isBrowser()) return false;

  const target = cleanText(url, "");
  if (!target) return false;

  const safeFilename = getFacturaPdfFilename({ filename }, "factura.pdf");

  try {
    const response = await fetch(target, {
      method: "GET",
      credentials: "omit",
    });

    if (response.ok) {
      const blob = await response.blob();

      if (isPdfContentType(getContentType(blob)) || await blobStartsWithPdf(blob)) {
        const objectUrl = URL.createObjectURL(blob);
        objectUrls?.add?.(objectUrl);

        return triggerDownloadLink(objectUrl, safeFilename);
      }
    }
  } catch {
    // Puede fallar por CORS de Azure. Fallback: navegación al SAS.
  }

  return triggerDownloadLink(target, safeFilename);
}

function downloadTextFile(filename = "facturas.csv", content = "") {
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

    setTimeout(() => {
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
  return `"${text}"`;
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

  const lines = data.map((item) => [
    getFacturaLabel(item),
    cleanText(first(item.clientName, item.clienteNombre, item.clienteName, item.customerName, item.cliente?.nombre), ""),
    cleanText(first(item.clienteEmail, item.emailCliente, item.clientEmail, item.email, item.cliente?.email), ""),
    cleanText(first(item.paymentStatus, item.estadoPago), ""),
    cleanText(first(item.total, item.amount, item.importe), ""),
    cleanText(first(item.ticketId, item.incidenciaId, item.relatedTicketId), ""),
    cleanText(first(item.issuedAt, item.fechaFactura, item.fechaEmision, item.createdAt), ""),
  ].map(csvCell).join(";"));

  const csv = [
    header.map(csvCell).join(";"),
    ...lines,
  ].join("\n");

  return downloadTextFile("facturas.csv", csv);
}

/* =========================================================
   FORM HELPERS
========================================================= */

function readField(form = null, name = "") {
  if (!form || !name) return "";

  const field = form.querySelector?.(`[data-field="${name}"], [name="${name}"]`);

  if (!field) return "";

  if (field.type === "checkbox") {
    return Boolean(field.checked);
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

  const cache = hydrateFacturasFromCache();

  let items = safeArray(cache.items);
  let total = Math.max(number(cache.total, items.length), items.length);

  let loading = false;
  let refreshing = false;
  let loadingMore = false;
  let creating = false;
  let error = "";

  let page = DEFAULT_PAGE;
  let nextPage = items.length && total > items.length
    ? Math.max(2, Math.floor(items.length / DEFAULT_BATCH_SIZE) + 1)
    : DEFAULT_PAGE;
  let pageSize = DEFAULT_BATCH_SIZE;
  let hasMore = total > items.length;

  let filter = "all";
  let search = "";
  let sort = "date_desc";

  let openingFacturaId = "";
  let viewingFacturaId = "";
  let downloadingFacturaId = "";
  let sendingFacturaId = "";

  let listSeq = 0;
  let clientSearchSeq = 0;
  let ticketSearchSeq = 0;

  let listSearchTimer = null;
  let clientSearchTimer = null;
  let ticketSearchTimer = null;

  let infiniteObserver = null;
  let scrollTicking = false;

  let renderFrame = 0;
  let pendingRenderOptions = null;

  let detailRenderFrame = 0;
  let pendingDetailRenderOptions = null;
  let detailModalHost = null;
  let detailModalHostBound = false;

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
    sendingFacturaId: "",
    viewingFacturaId: "",
    downloadingFacturaId: "",
  };

  function clearTimers() {
    if (listSearchTimer) {
      clearTimeout(listSearchTimer);
      listSearchTimer = null;
    }

    if (clientSearchTimer) {
      clearTimeout(clientSearchTimer);
      clientSearchTimer = null;
    }

    if (ticketSearchTimer) {
      clearTimeout(ticketSearchTimer);
      ticketSearchTimer = null;
    }
  }

  function disconnectInfiniteObserver() {
    if (infiniteObserver) {
      try {
        infiniteObserver.disconnect();
      } catch {
        // noop
      }
    }

    infiniteObserver = null;
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

  function mergeDetailRenderOptions(current = {}, next = {}) {
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

  function cancelScheduledDetailRender() {
    if (!detailRenderFrame) return false;

    cancelFrame(detailRenderFrame);
    detailRenderFrame = 0;
    pendingDetailRenderOptions = null;

    return true;
  }

  function getSortParts() {
    const normalized = normalizeKey(sort || "date_desc");
    const sortMode = normalized.endsWith("_asc") ? "date_asc" : "date_desc";
    const direction = sortMode.endsWith("_asc") ? "asc" : "desc";

    return {
      sortMode,
      sort: sortMode,
      sortBy: sortMode,
      direction,
      sortDir: direction,
    };
  }

  function getListFilters() {
    if (filter === "pending") {
      return { estadoPago: "pending" };
    }

    if (filter === "paid") {
      return { estadoPago: "paid" };
    }

    if (filter === "overdue") {
      return { estadoPago: "overdue" };
    }

    return {};
  }

  function updatePagingFromResponse(response = {}, requestedPage = DEFAULT_PAGE) {
    const remoteTotal = number(
      first(
        response.total,
        response.remoteCount,
        response.totalMatched,
        response.meta?.total,
        response.meta?.remoteCount,
        response.paging?.total,
        response.paging?.remoteCount,
        total,
        items.length
      ),
      items.length
    );

    total = Math.max(remoteTotal, items.length);

    page = Math.max(
      DEFAULT_PAGE,
      number(first(response.page, response.paging?.page, requestedPage), requestedPage)
    );

    const responseHasMore = first(
      response.hasMore,
      response.more,
      response.canLoadMore,
      response.paging?.hasMore,
      response.paging?.more,
      response.paging?.canLoadMore,
      null
    );

    hasMore = responseHasMore === null
      ? items.length < total
      : parseBoolean(responseHasMore, items.length < total);

    const rawNextPage = first(
      response.nextPage,
      response.paging?.nextPage,
      hasMore ? page + 1 : null
    );

    nextPage = hasMore
      ? Math.max(page + 1, number(rawNextPage, page + 1))
      : null;
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
      remoteCount: total,
      totalMatched: total,

      page,
      nextPage,
      pageSize,
      batchSize: pageSize,
      limit: pageSize,
      hasMore,
      loadingMore,

      filter,
      search,
      sort,

      loading,
      refreshing,
      creating,
      error,

      state: {
        loading,
        refreshing,
        loadingMore,
        creating,
        error,

        page,
        nextPage,
        pageSize,
        batchSize: pageSize,
        limit: pageSize,
        hasMore,

        filter,
        search,
        sort,

        openingFacturaId,
        viewingFacturaId,
        downloadingFacturaId,
        sendingFacturaId,

        role: getCurrentRole(),
        admin: isAdmin(),
        canCreateFactura: isAdmin(),
      },

      createModal,
      detailModal,

      ...extra,
    };
  }

  function focusAfterRender(selector = "", placeEnd = true, root = host) {
    if (!selector || !root) return false;

    try {
      const node = root.querySelector(selector);

      if (!node) return false;

      node.focus({ preventScroll: true });

      if (placeEnd && typeof node.setSelectionRange === "function") {
        const end = String(node.value || "").length;
        node.setSelectionRange(end, end);
      }

      return true;
    } catch {
      return false;
    }
  }

  function detailModalIsOpen() {
    return detailModal.open === true || detailModal.detailOpen === true;
  }

  function syncModalBodyState() {
    return syncBodyModalClass(createModal.open || detailModalIsOpen(), {
      createOpen: createModal.open,
      detailOpen: detailModalIsOpen(),
    });
  }

  function ownsNode(node = null) {
    return Boolean(
      node &&
        (
          host?.contains?.(node) ||
          detailModalHost?.contains?.(node)
        )
    );
  }

  function ensureDetailModalHost() {
    if (!isBrowser()) return null;

    if (detailModalHost?.isConnected) return detailModalHost;

    detailModalHost =
      document.querySelector(DETAIL_MODAL_HOST_SELECTOR) ||
      document.createElement("div");

    detailModalHost.id = DETAIL_MODAL_HOST_ID;
    detailModalHost.setAttribute("data-facturas-detail-host", "true");
    detailModalHost.setAttribute("data-owner", FACTURAS_VIEW_VERSION);

    if (!detailModalHost.isConnected) {
      document.body.appendChild(detailModalHost);
    }

    if (mounted && !detailModalHostBound) {
      bindTarget(detailModalHost);
      detailModalHostBound = true;
    }

    return detailModalHost;
  }

  function removeDetailModalHost() {
    cancelScheduledDetailRender();

    if (!detailModalHost) return false;

    try {
      if (detailModalHostBound) {
        unbindTarget(detailModalHost);
      }

      detailModalHost.replaceChildren();
      detailModalHost.remove();
    } catch {
      // noop
    }

    detailModalHost = null;
    detailModalHostBound = false;

    return true;
  }

  function captureDetailModalDomState(root = null) {
    if (!isBrowser() || !root) return null;

    const active = document.activeElement;
    const panel = root.querySelector(DETAIL_MODAL_PANEL_SELECTOR);

    const state = {
      scrollTop: panel?.scrollTop || 0,
      activeField: "",
      activeName: "",
      activeId: "",
      selectionStart: null,
      selectionEnd: null,
      hadFocus: false,
    };

    if (!active || !root.contains(active)) return state;

    state.hadFocus = true;
    state.activeField = cleanText(active.dataset?.field || active.dataset?.detailField || "", "");
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

  function findRestorableDetailNode(root = null, state = null, explicitSelector = "") {
    if (!root) return null;

    if (explicitSelector) {
      return root.querySelector(explicitSelector);
    }

    if (!state) return null;

    if (state.activeId) {
      const byId = root.querySelector(`#${state.activeId}`);
      if (byId) return byId;
    }

    const candidates = Array.from(root.querySelectorAll("[data-field], [data-detail-field], [name], button, [tabindex]"));

    if (state.activeField) {
      const byField = candidates.find((node) => {
        return cleanText(node.dataset?.field || node.dataset?.detailField || "", "") === state.activeField;
      });

      if (byField) return byField;
    }

    if (state.activeName) {
      const byName = candidates.find((node) => cleanText(node.getAttribute("name"), "") === state.activeName);
      if (byName) return byName;
    }

    return null;
  }

  function restoreDetailModalDomState(root = null, state = null, options = {}) {
    if (!isBrowser() || !root) return false;

    const panel = root.querySelector(DETAIL_MODAL_PANEL_SELECTOR);

    if (panel && state) {
      panel.scrollTop = state.scrollTop || 0;
    }

    nextFrame(() => {
      try {
        if (panel && state) panel.scrollTop = state.scrollTop || 0;
      } catch {
        // noop
      }
    });

    if (options.preserveFocus === false) {
      return focusAfterRender(
        options.focusSelector || DETAIL_MODAL_PANEL_SELECTOR,
        options.focusEnd !== false,
        root
      );
    }

    const target = findRestorableDetailNode(root, state, options.focusSelector || "");

    if (!target) {
      return focusAfterRender(DETAIL_MODAL_PANEL_SELECTOR, false, root);
    }

    try {
      target.focus({ preventScroll: true });

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

    const state = captureDetailModalDomState(target);

    target.innerHTML = renderFacturasDetailModal(detailModal);

    syncModalBodyState();
    restoreDetailModalDomState(target, state, options);

    return true;
  }

  function renderDetailModal(options = {}) {
    if (destroyed || !isBrowser()) return false;

    if (options.immediate === true) {
      return renderDetailModalNow(options);
    }

    pendingDetailRenderOptions = mergeDetailRenderOptions(pendingDetailRenderOptions || {}, options);

    if (detailRenderFrame) return true;

    detailRenderFrame = nextFrame(() => {
      const nextOptions = pendingDetailRenderOptions || {};

      detailRenderFrame = 0;
      pendingDetailRenderOptions = null;

      renderDetailModalNow(nextOptions);
    });

    return true;
  }

  function viewPayload(extra = {}) {
    return payload({
      detailModal: {
        ...detailModal,
        open: false,
        detailOpen: false,
      },
      ...extra,
    });
  }

  function syncInfiniteObserver() {
    if (!isBrowser() || destroyed || !host) return false;

    disconnectInfiniteObserver();

    if (!hasMore || loading || refreshing || loadingMore) return false;

    const sentinel = host.querySelector?.("[data-facturas-infinite-sentinel='true']");

    if (!sentinel) return false;

    if (!isFunction(window.IntersectionObserver)) return false;

    try {
      infiniteObserver = new IntersectionObserver(
        (entries) => {
          if (destroyed || loading || refreshing || loadingMore || !hasMore) return;

          const visible = entries.some((entry) => entry.isIntersecting);

          if (visible) {
            void loadMore();
          }
        },
        {
          root: null,
          rootMargin: INFINITE_ROOT_MARGIN,
          threshold: 0.01,
        }
      );

      infiniteObserver.observe(sentinel);
      return true;
    } catch {
      disconnectInfiniteObserver();
      return false;
    }
  }

  function renderNow(options = {}) {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderFacturasTemplate(viewPayload());
    bindFacturasTemplateDom(host);
    syncModalBodyState();

    if (options.focusSelector) {
      focusAfterRender(options.focusSelector, options.focusEnd !== false);
    }

    syncInfiniteObserver();

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

  function renderLoading() {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderFacturasLoadingState(viewPayload());
    bindFacturasTemplateDom(host);
    syncModalBodyState();

    return true;
  }

  function renderError(message = "No se pudieron cargar las facturas.") {
    if (destroyed || !host) return false;

    cancelScheduledRender();

    host.innerHTML = renderFacturasErrorState(message);
    syncModalBodyState();
    disconnectInfiniteObserver();

    return true;
  }

  async function fetchList({
    mode = "replace",
    requestPage = DEFAULT_PAGE,
    force = false,
    silent = false,
  } = {}) {
    if (destroyed) return null;

    const append = mode === "append";
    const seq = ++listSeq;
    const requestedPage = Math.max(DEFAULT_PAGE, number(requestPage, DEFAULT_PAGE));
    const sortParts = getSortParts();

    error = "";

    if (append) {
      if (loading || refreshing || loadingMore || !hasMore) return null;
      loadingMore = true;
    } else if (force && items.length) {
      refreshing = true;
      loading = false;
      loadingMore = false;
    } else {
      loading = !silent;
      refreshing = false;
      loadingMore = false;
    }

    if (!silent) {
      render();
    }

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
        returnStaleOnError: !append,
        dedupe: true,
        force: force === true,
      });

      if (seq !== listSeq || destroyed) return null;

      const rows = safeArray(
        first(
          response?.items,
          response?.facturas,
          response?.data,
          response?.invoices,
          []
        )
      );

      items = append ? mergeFacturas(items, rows, { append: true }) : mergeFacturas([], rows, { append: false });
      updatePagingFromResponse(response || {}, requestedPage);

      error = response?.stale ? cleanText(response.error?.message, "") : "";
      loading = false;
      refreshing = false;
      loadingMore = false;

      render();

      return response;
    } catch (loadError) {
      if (seq !== listSeq || destroyed) return null;

      error = safeError(loadError);
      loading = false;
      refreshing = false;
      loadingMore = false;

      if (items.length) {
        render();
        return null;
      }

      renderError(error);
      return null;
    }
  }

  function resetListState({ keepItems = true } = {}) {
    listSeq += 1;
    page = DEFAULT_PAGE;
    nextPage = DEFAULT_PAGE;
    hasMore = true;
    total = keepItems ? Math.max(total, items.length) : 0;

    if (!keepItems) {
      items = [];
    }

    disconnectInfiniteObserver();
    return true;
  }

  async function load(options = {}) {
    return fetchList({
      mode: "replace",
      requestPage: options.page || DEFAULT_PAGE,
      force: options.force === true,
      silent: options.silent === true,
    });
  }

  async function refresh() {
    resetListState({ keepItems: true });

    return fetchList({
      mode: "replace",
      requestPage: DEFAULT_PAGE,
      force: true,
      silent: false,
    });
  }

  async function reloadFromStart({ force = false, silent = false, keepItems = true } = {}) {
    resetListState({ keepItems });

    return fetchList({
      mode: "replace",
      requestPage: DEFAULT_PAGE,
      force,
      silent,
    });
  }

  async function loadMore() {
    if (destroyed || loading || refreshing || loadingMore || !hasMore) return false;

    const requestedPage = Math.max(
      DEFAULT_PAGE,
      number(nextPage, page + 1)
    );

    await fetchList({
      mode: "append",
      requestPage: requestedPage,
      force: false,
      silent: false,
    });

    return true;
  }

  function scheduleListReload() {
    if (listSearchTimer) {
      clearTimeout(listSearchTimer);
      listSearchTimer = null;
    }

    listSearchTimer = setTimeout(() => {
      listSearchTimer = null;
      void reloadFromStart({
        force: false,
        silent: true,
        keepItems: true,
      });
    }, LIST_SEARCH_DEBOUNCE_MS);
  }

  function setFilter(value = "all") {
    const next = normalizeKey(value || "all") || "all";
    filter = ["all", "pending", "paid", "overdue"].includes(next) ? next : "all";

    resetListState({ keepItems: true });
    render();

    void reloadFromStart({
      force: false,
      silent: true,
      keepItems: true,
    });

    return true;
  }

  function setSearch(value = "") {
    search = cleanText(value, "");
    resetListState({ keepItems: true });

    render({
      focusSelector: "[data-facturas-search-input]",
    });

    scheduleListReload();
    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    resetListState({ keepItems: true });

    render({
      focusSelector: "[data-facturas-search-input]",
    });

    void reloadFromStart({
      force: false,
      silent: true,
      keepItems: true,
    });

    return true;
  }

  function setSort(value = "date_desc") {
    const next = normalizeKey(value || "date_desc");
    sort = next.endsWith("_asc") ? "date_asc" : "date_desc";

    resetListState({ keepItems: true });
    render();

    void reloadFromStart({
      force: false,
      silent: true,
      keepItems: true,
    });

    return true;
  }

  function setPage(value = DEFAULT_PAGE) {
    const requestedPage = Math.max(DEFAULT_PAGE, number(value, DEFAULT_PAGE));

    page = requestedPage;
    nextPage = requestedPage;
    hasMore = true;

    return fetchList({
      mode: "replace",
      requestPage: requestedPage,
      force: false,
      silent: false,
    });
  }

  function closeCreateModal() {
    if (createModal.submitting) return false;

    clearTimers();

    createModal.open = false;
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

    render();
    return true;
  }

  function openCreateModal(draft = {}) {
    if (!isAdmin()) return false;

    creating = true;

    createModal.open = true;
    createModal.canCreate = true;
    createModal.submitting = false;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdFacturaId = "";
    createModal.errors = {};
    createModal.form = {
      ...getFacturaCreateFormDefaults(),
      ...safeObject(draft),
    };
    createModal.selectedClientes = safeArray(draft.selectedClientes || draft.clientes)
      .map(normalizeClientCandidate)
      .filter(Boolean);
    createModal.selectedTickets = safeArray(draft.selectedTickets || draft.tickets || draft.incidencias)
      .map(normalizeTicketCandidate)
      .filter(Boolean);
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

    creating = false;

    render({
      focusSelector: createModal.selectedClientes.length
        ? "[data-field='descripcion']"
        : "[data-field='clienteSearch']",
    });

    if (createModal.selectedClientes.length && !createModal.selectedTickets.length) {
      void loadTicketsForSelectedClients({
        autoSelectLatest: true,
      });
    }

    return true;
  }

  function syncPrimaryClientToForm() {
    const primary = createModal.selectedClientes[0] || null;

    if (!primary) {
      createModal.form = {
        ...createModal.form,
        clienteId: "",
        clienteUserId: "",
        clienteNombre: "",
        clienteEmail: "",
        clienteAvatar: "",
      };

      return null;
    }

    createModal.form = {
      ...createModal.form,
      clienteId: primary.clienteId || primary.id || "",
      clienteUserId: primary.userId || "",
      clienteNombre: primary.name || primary.nombreContacto || primary.razonSocial || "",
      clienteEmail: primary.email || "",
      clienteAvatar: primary.avatarUrl || primary.avatar || "",
    };

    return primary;
  }

  function syncPrimaryTicketToForm() {
    const primary = createModal.selectedTickets[0] || null;

    if (!primary) {
      createModal.form = {
        ...createModal.form,
        ticketId: "",
        incidenciaId: "",
        incidenciaSubject: "",
      };

      return null;
    }

    createModal.form = {
      ...createModal.form,
      ticketId: primary.ticketId || primary.id || "",
      incidenciaId: primary.incidenciaId || primary.id || "",
      incidenciaSubject: primary.subject || primary.asunto || primary.title || primary.id || "",
    };

    return primary;
  }

  function patchCreateFormFromField(field = null) {
    if (!field) return false;

    const name = cleanText(field.dataset?.field || field.name, "");

    if (!name || name === "clienteSearch" || name === "ticketSearch") return false;

    const hadError = Boolean(createModal.errors[name]);
    const hadFeedback = Boolean(createModal.serverError || createModal.successMessage || createModal.createdFacturaId);

    createModal.form = {
      ...createModal.form,
      [name]: field.type === "checkbox" ? Boolean(field.checked) : field.value,
    };

    if (hadError) {
      const next = { ...createModal.errors };
      delete next[name];
      createModal.errors = next;
    }

    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdFacturaId = "";

    const liveFields = new Set([
      "cantidad",
      "precioUnitario",
      "precio",
      "unitPrice",
      "ivaRate",
      "ivaPorcentaje",
      "porcentajeIVA",
      "irpfRate",
      "irpfPorcentaje",
      "porcentajeIRPF",
      "aplicaIVA",
      "aplicaIRPF",
      "sendEmail",
      "estadoPago",
    ]);

    if (hadError || hadFeedback || liveFields.has(name)) {
      render({
        focusSelector: `[data-field='${name}']`,
      });
    }

    return true;
  }

  function scheduleClientSearch(value = "") {
    const query = cleanText(value, "");

    createModal.clientSearch.query = query;
    createModal.clientSearch.error = "";
    createModal.clientSearch.empty = false;

    if (clientSearchTimer) {
      clearTimeout(clientSearchTimer);
      clientSearchTimer = null;
    }

    if (query.length < SEARCH_MIN_LENGTH) {
      createModal.clientSearch.loading = false;
      createModal.clientSearch.results = [];
      render({ focusSelector: "[data-field='clienteSearch']" });
      return true;
    }

    createModal.clientSearch.loading = true;
    render({ focusSelector: "[data-field='clienteSearch']" });

    clientSearchTimer = setTimeout(() => {
      void runClientSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return true;
  }

  async function runClientSearch(query = "") {
    const seq = ++clientSearchSeq;

    try {
      const results = await searchClients(query);

      if (seq !== clientSearchSeq || destroyed) return false;

      createModal.clientSearch.loading = false;
      createModal.clientSearch.error = "";
      createModal.clientSearch.results = results;
      createModal.clientSearch.empty = results.length === 0;

      render({ focusSelector: "[data-field='clienteSearch']" });

      return true;
    } catch (searchError) {
      if (seq !== clientSearchSeq || destroyed) return false;

      createModal.clientSearch.loading = false;
      createModal.clientSearch.results = [];
      createModal.clientSearch.empty = false;
      createModal.clientSearch.error = safeError(searchError, "No se pudo buscar cliente.");

      render({ focusSelector: "[data-field='clienteSearch']" });

      return false;
    }
  }

  function selectClient(index = -1) {
    const item = createModal.clientSearch.results[index];

    if (!item?.id) return false;

    const exists = createModal.selectedClientes.some((client) => {
      return (
        client.id === item.id ||
        client.clienteId === item.clienteId ||
        (client.userId && client.userId === item.userId)
      );
    });

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

    createModal.ticketSearch.query = "";
    createModal.ticketSearch.error = "";
    createModal.ticketSearch.results = [];
    createModal.ticketSearch.empty = false;

    render({ focusSelector: "[data-field='ticketSearch']" });

    void loadTicketsForSelectedClients({
      autoSelectLatest: createModal.selectedTickets.length === 0,
    });

    return true;
  }

  function removeClient(index = -1) {
    if (index < 0) return false;

    createModal.selectedClientes = createModal.selectedClientes.filter((_, currentIndex) => currentIndex !== index);

    syncPrimaryClientToForm();

    if (!createModal.selectedClientes.length) {
      createModal.selectedTickets = [];
      createModal.ticketSearch = {
        query: "",
        loading: false,
        error: "",
        results: [],
        empty: false,
      };
      syncPrimaryTicketToForm();

      render({ focusSelector: "[data-field='clienteSearch']" });
      return true;
    }

    createModal.selectedTickets = createModal.selectedTickets.filter((ticket) => {
      return ticketBelongsToClients(ticket, createModal.selectedClientes);
    });

    syncPrimaryTicketToForm();
    render();

    void loadTicketsForSelectedClients({
      autoSelectLatest: createModal.selectedTickets.length === 0,
    });

    return true;
  }

  function makeClientPrimary(index = -1) {
    if (index <= 0 || index >= createModal.selectedClientes.length) return false;

    const item = createModal.selectedClientes[index];

    createModal.selectedClientes = [
      item,
      ...createModal.selectedClientes.filter((_, currentIndex) => currentIndex !== index),
    ];

    syncPrimaryClientToForm();
    render();

    void loadTicketsForSelectedClients({
      autoSelectLatest: createModal.selectedTickets.length === 0,
    });

    return true;
  }

  function clearClients() {
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

    render({ focusSelector: "[data-field='clienteSearch']" });

    return true;
  }

  function scheduleTicketSearch(value = "") {
    const query = cleanText(value, "");

    createModal.ticketSearch.query = query;
    createModal.ticketSearch.error = "";
    createModal.ticketSearch.empty = false;

    if (ticketSearchTimer) {
      clearTimeout(ticketSearchTimer);
      ticketSearchTimer = null;
    }

    if (!createModal.selectedClientes.length) {
      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.results = [];
      render({ focusSelector: "[data-field='ticketSearch']" });
      return true;
    }

    createModal.ticketSearch.loading = true;
    render({ focusSelector: "[data-field='ticketSearch']" });

    ticketSearchTimer = setTimeout(() => {
      void loadTicketsForSelectedClients({
        query,
        autoSelectLatest: false,
      });
    }, SEARCH_DEBOUNCE_MS);

    return true;
  }

  async function loadTicketsForSelectedClients({
    query = createModal.ticketSearch.query,
    autoSelectLatest = false,
  } = {}) {
    if (!createModal.selectedClientes.length) {
      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.results = [];
      createModal.ticketSearch.empty = false;
      return [];
    }

    const seq = ++ticketSearchSeq;

    createModal.ticketSearch.loading = true;
    createModal.ticketSearch.error = "";
    createModal.ticketSearch.empty = false;

    render({ focusSelector: "[data-field='ticketSearch']" });

    try {
      const results = await searchTickets(query, createModal.selectedClientes);

      if (seq !== ticketSearchSeq || destroyed) return [];

      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.error = "";
      createModal.ticketSearch.results = results;
      createModal.ticketSearch.empty = results.length === 0;

      if (autoSelectLatest && results[0]?.id && !createModal.selectedTickets.length) {
        createModal.selectedTickets = [results[0]];
        syncPrimaryTicketToForm();
      }

      render({ focusSelector: "[data-field='ticketSearch']" });

      return results;
    } catch (searchError) {
      if (seq !== ticketSearchSeq || destroyed) return [];

      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.results = [];
      createModal.ticketSearch.empty = false;
      createModal.ticketSearch.error = safeError(searchError, "No se pudieron cargar incidencias.");

      render({ focusSelector: "[data-field='ticketSearch']" });

      return [];
    }
  }

  function selectTicket(index = -1) {
    const item = createModal.ticketSearch.results[index];

    if (!item?.id) return false;

    const exists = createModal.selectedTickets.some((ticket) => {
      return ticket.id === item.id || ticket.ticketId === item.id || ticket.incidenciaId === item.id;
    });

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

    createModal.ticketSearch.query = "";

    render({ focusSelector: "[data-field='ticketSearch']" });

    return true;
  }

  function removeTicket(index = -1) {
    if (index < 0) return false;

    createModal.selectedTickets = createModal.selectedTickets.filter((_, currentIndex) => currentIndex !== index);
    syncPrimaryTicketToForm();

    render({ focusSelector: "[data-field='ticketSearch']" });

    return true;
  }

  function makeTicketPrimary(index = -1) {
    if (index <= 0 || index >= createModal.selectedTickets.length) return false;

    const item = createModal.selectedTickets[index];

    createModal.selectedTickets = [
      item,
      ...createModal.selectedTickets.filter((_, currentIndex) => currentIndex !== index),
    ];

    syncPrimaryTicketToForm();

    render({ focusSelector: "[data-field='ticketSearch']" });

    return true;
  }

  function clearTickets() {
    createModal.selectedTickets = [];
    createModal.ticketSearch.query = "";
    syncPrimaryTicketToForm();

    render({ focusSelector: "[data-field='ticketSearch']" });

    return true;
  }

  function buildFacturaPayload() {
    syncPrimaryClientToForm();
    syncPrimaryTicketToForm();

    const form = createModal.form;
    const breakdown = getFacturaCreateBreakdown(form);

    const primaryCliente = createModal.selectedClientes[0] || null;
    const primaryTicket = createModal.selectedTickets[0] || null;

    const clienteIds = selectedClienteIds(createModal.selectedClientes);
    const userIds = selectedUserIds(createModal.selectedClientes);

    const ticketIds = [
      ...new Set(
        createModal.selectedTickets
          .map((ticket) => cleanText(first(ticket.ticketId, ticket.incidenciaId, ticket.id), ""))
          .filter(Boolean)
      ),
    ];

    const clienteId = cleanText(first(primaryCliente?.clienteId, primaryCliente?.id, form.clienteId), "");
    const userId = cleanText(first(primaryCliente?.userId, form.clienteUserId), "");
    const clienteNombre = cleanText(first(primaryCliente?.name, primaryCliente?.displayName, form.clienteNombre), "");
    const clienteEmail = cleanText(first(primaryCliente?.email, form.clienteEmail), "").toLowerCase();
    const clienteAvatar = cleanText(first(primaryCliente?.avatarUrl, primaryCliente?.avatar, form.clienteAvatar), "");

    const ticketId = cleanText(first(primaryTicket?.ticketId, primaryTicket?.incidenciaId, primaryTicket?.id, form.ticketId, form.incidenciaId), "");
    const incidenciaSubject = cleanText(first(primaryTicket?.subject, primaryTicket?.asunto, form.incidenciaSubject, ticketId), ticketId);

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

      lineas: [
        {
          id: "linea-1",
          concepto: form.concepto,
          descripcion: form.descripcion,
          cantidad: breakdown.cantidad,
          precioUnitario: breakdown.precioUnitario,
          subtotal: breakdown.base,
          base: breakdown.base,
          baseImponible: breakdown.base,
          ivaPorcentaje: breakdown.ivaRate,
          ivaImporte: breakdown.ivaTotal,
          irpfPorcentaje: breakdown.irpfRate,
          irpfImporte: breakdown.irpfTotal,
          total: breakdown.totalFactura,
        },
      ],

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
        fechaServicio: readField(formNode, "fechaServicio"),
        formaPago: readField(formNode, "formaPago"),
        estadoPago: readField(formNode, "estadoPago"),
        sendEmail: readField(formNode, "sendEmail"),
        concepto: readField(formNode, "concepto"),
        descripcion: readField(formNode, "descripcion"),
        cantidad: readField(formNode, "cantidad"),
        precioUnitario: readField(formNode, "precioUnitario"),
      };
    }

    const validation = validateFacturaCreateForm({
      form: createModal.form,
      selectedClientes: createModal.selectedClientes,
      selectedTickets: createModal.selectedTickets,
    });

    createModal.errors = validation.errors;
    createModal.form = validation.form;

    if (!validation.valid) {
      render({
        focusSelector:
          createModal.errors.clienteId
            ? "[data-field='clienteSearch']"
            : createModal.errors.incidenciaId
              ? "[data-field='ticketSearch']"
              : createModal.errors.concepto
                ? "[data-field='concepto']"
                : createModal.errors.descripcion
                  ? "[data-field='descripcion']"
                  : "",
      });

      return false;
    }

    createModal.submitting = true;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdFacturaId = "";

    render();

    try {
      const created = await createFactura(buildFacturaPayload());

      if (created) {
        items = upsertFactura(items, created, sort);
        total = Math.max(total + 1, items.length);
      }

      createModal.submitting = false;
      createModal.successMessage = "Factura creada.";
      createModal.createdFacturaId = getFacturaId(created);
      createModal.open = false;
      createModal.errors = {};
      createModal.form = getFacturaCreateFormDefaults();
      createModal.selectedClientes = [];
      createModal.selectedTickets = [];

      render();

      return true;
    } catch (createError) {
      createModal.submitting = false;
      createModal.serverError = safeError(createError, "No se pudo crear la factura.");

      render({ focusSelector: "[data-field='concepto']" });

      return false;
    }
  }

  function closeDetailModal() {
    detailModal.open = false;
    detailModal.detailOpen = false;
    detailModal.detailLoading = false;
    detailModal.factura = null;
    detailModal.sendingFacturaId = "";
    detailModal.viewingFacturaId = "";
    detailModal.downloadingFacturaId = "";

    renderDetailModal({ immediate: true });
    render();

    return true;
  }

  async function openFactura(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    const local = items.find((item) => getFacturaId(item) === id) || null;

    openingFacturaId = id;

    detailModal.open = true;
    detailModal.detailOpen = true;
    detailModal.detailLoading = true;
    detailModal.factura = local;
    detailModal.sendingFacturaId = "";
    detailModal.viewingFacturaId = "";
    detailModal.downloadingFacturaId = "";

    render();
    renderDetailModal({
      immediate: true,
      focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
      focusEnd: false,
      preserveFocus: false,
    });

    try {
      const detail = await getFacturaById(id);

      if (detail) {
        detailModal.factura = detail;
        items = upsertFactura(items, detail, sort);
      }

      detailModal.detailLoading = false;
      openingFacturaId = "";

      render();
      renderDetailModal({
        focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
        focusEnd: false,
        preserveFocus: false,
      });

      return true;
    } catch (detailError) {
      detailModal.detailLoading = false;
      openingFacturaId = "";
      error = safeError(detailError, "No se pudo abrir el detalle de factura.");

      if (local) {
        render();
        renderDetailModal({
          focusSelector: DETAIL_MODAL_PANEL_SELECTOR,
          focusEnd: false,
        });
        return false;
      }

      closeDetailModal();
      render();
      return false;
    }
  }

  function getFacturaForPdf(facturaId = "") {
    const id = cleanText(facturaId, "");

    if (!id) return null;

    const detail = safeObject(detailModal.factura, null);

    if (detail && getFacturaId(detail) === id) {
      return detail;
    }

    return items.find((item) => getFacturaId(item) === id) || null;
  }

  async function viewPdf(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    const popup = openPendingWindow("Abriendo factura…");

    viewingFacturaId = id;
    detailModal.viewingFacturaId = id;

    render();
    renderDetailModal();

    try {
      const factura = getFacturaForPdf(id);

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
      detailModal.viewingFacturaId = "";
      render();
      renderDetailModal();

      return true;
    } catch (pdfError) {
      closePendingWindow(popup);

      viewingFacturaId = "";
      detailModal.viewingFacturaId = "";
      error = safeError(pdfError, "No se pudo abrir el PDF.");

      render();
      renderDetailModal();
      return false;
    }
  }

  async function downloadPdf(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    downloadingFacturaId = id;
    detailModal.downloadingFacturaId = id;

    render();
    renderDetailModal();

    try {
      const factura = getFacturaForPdf(id);

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
      detailModal.downloadingFacturaId = "";
      render();
      renderDetailModal();

      return true;
    } catch (downloadError) {
      downloadingFacturaId = "";
      detailModal.downloadingFacturaId = "";
      error = safeError(downloadError, "No se pudo descargar la factura.");

      render();
      renderDetailModal();
      return false;
    }
  }

  async function sendFacturaToClient(facturaId = "") {
    const id = cleanText(facturaId, "");
    if (!id) return false;

    sendingFacturaId = id;
    detailModal.sendingFacturaId = id;

    render();
    renderDetailModal();

    try {
      const result = await sendFactura(id);

      if (isObject(result) && (result.id || result.facturaId || result.invoiceId)) {
        items = upsertFactura(items, result, sort);

        if (detailModal.factura && getFacturaId(detailModal.factura) === id) {
          detailModal.factura = result;
        }
      }

      sendingFacturaId = "";
      detailModal.sendingFacturaId = "";
      render();
      renderDetailModal();

      return true;
    } catch (sendError) {
      sendingFacturaId = "";
      detailModal.sendingFacturaId = "";
      error = safeError(sendError, "No se pudo enviar la factura.");

      render();
      renderDetailModal();
      return false;
    }
  }

  async function openIncidencia(ticketId = "") {
    const id = cleanText(ticketId, "");
    if (!id) return false;

    const Router = getRouter(context);
    const route = ROUTES.incidencias || "/incidencias";

    if (isFunction(Router?.navigate)) {
      await Router.navigate(route, {
        source: "facturas.open-incidencia",
        ticketId: id,
      });

      return true;
    }

    return false;
  }

  async function handleAction(action = "", node = null) {
    const type = cleanText(action, "");
    if (!type) return false;

    if (type === FACTURAS_ACTIONS.REFRESH) return refresh();
    if (type === FACTURAS_ACTIONS.EXPORT) return exportCsv(items);
    if (type === FACTURAS_ACTIONS.CREATE_OPEN) return openCreateModal();

    if (type === FACTURAS_ACTIONS.FILTER) return setFilter(node?.dataset?.filter || "all");
    if (type === FACTURAS_ACTIONS.CLEAR_FILTERS) return clearFilters();
    if (type === FACTURAS_ACTIONS.CLEAR_SEARCH) return setSearch("");
    if (type === FACTURAS_ACTIONS.SORT) return setSort(node?.dataset?.sort || node?.dataset?.sortMode || "date_desc");
    if (type === LOAD_MORE_ACTION) return loadMore();

    if (type === FACTURAS_ACTIONS.PREV_PAGE || type === FACTURAS_ACTIONS.NEXT_PAGE) {
      return setPage(node?.dataset?.page || DEFAULT_PAGE);
    }

    if (type === FACTURAS_ACTIONS.OPEN_FACTURA || type === FACTURA_MODAL_ACTIONS.CLOSE) {
      if (type === FACTURA_MODAL_ACTIONS.CLOSE) return closeDetailModal();
      return openFactura(facturaIdFromNode(node));
    }

    if (type === FACTURAS_ACTIONS.VIEW_PDF || type === FACTURA_MODAL_ACTIONS.VIEW_PDF) {
      return viewPdf(facturaIdFromNode(node));
    }

    if (type === FACTURAS_ACTIONS.DOWNLOAD_PDF || type === FACTURA_MODAL_ACTIONS.DOWNLOAD_PDF) {
      return downloadPdf(facturaIdFromNode(node));
    }

    if (type === FACTURAS_ACTIONS.SEND_FACTURA || type === FACTURA_MODAL_ACTIONS.SEND) {
      return sendFacturaToClient(facturaIdFromNode(node));
    }

    if (type === FACTURAS_ACTIONS.OPEN_INCIDENCIA || type === FACTURA_MODAL_ACTIONS.OPEN_INCIDENCIA) {
      return openIncidencia(node?.dataset?.ticketId || node?.dataset?.incidenciaId || "");
    }

    if (type === FACTURA_CREATE_ACTIONS.CLOSE) return closeCreateModal();
    if (type === FACTURA_CREATE_ACTIONS.SUBMIT) return submitCreate(host?.querySelector?.("#facturas-create-form, [data-facturas-create-form='true']"));

    if (type === FACTURA_CREATE_ACTIONS.CLIENT_SELECT) return selectClient(clientIndexFromNode(node));
    if (type === FACTURA_CREATE_ACTIONS.CLIENT_REMOVE) return removeClient(clientIndexFromNode(node));
    if (type === FACTURA_CREATE_ACTIONS.CLIENT_PRIMARY) return makeClientPrimary(clientIndexFromNode(node));
    if (type === FACTURA_CREATE_ACTIONS.CLIENT_CLEAR) return clearClients();

    if (type === FACTURA_CREATE_ACTIONS.TICKET_SELECT) return selectTicket(ticketIndexFromNode(node));
    if (type === FACTURA_CREATE_ACTIONS.TICKET_REMOVE) return removeTicket(ticketIndexFromNode(node));
    if (type === FACTURA_CREATE_ACTIONS.TICKET_PRIMARY) return makeTicketPrimary(ticketIndexFromNode(node));
    if (type === FACTURA_CREATE_ACTIONS.TICKET_CLEAR) return clearTickets();

    if (type === FACTURA_CREATE_ACTIONS.TICKET_REFRESH) {
      return loadTicketsForSelectedClients({
        autoSelectLatest: createModal.selectedTickets.length === 0,
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
    const target = event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

    if (!target?.closest) return;

    const actionNode = target.closest("[data-facturas-action], [data-factura-create-action], [data-action]");

    if (actionNode && ownsNode(actionNode)) {
      const action = actionFrom(actionNode);

      if (action) {
        event.preventDefault();
        event.stopPropagation();
        void handleAction(action, actionNode);
        return;
      }
    }

    const row = target.closest("[data-facturas-row='true']");

    if (row && host?.contains(row)) {
      event.preventDefault();
      void openFactura(row.dataset.facturaId || "");
      return;
    }

    const createOverlay = target.closest("[data-facturas-create-modal-overlay='true']");
    const createPanel = target.closest("[data-facturas-create-modal-panel='true']");

    if (createOverlay && !createPanel && target === createOverlay) {
      closeCreateModal();
      return;
    }

    const detailOverlay = target.closest("[data-facturas-detail-overlay='true']");
    const detailPanel = target.closest("[data-facturas-detail-modal='true'], [data-role='facturas-detail-modal']");

    if (detailOverlay && !detailPanel && target === detailOverlay) {
      closeDetailModal();
    }
  }

  function onInput(event) {
    const target = event.target;
    const field = cleanText(target?.dataset?.field || "", "");

    if (!field) return;

    if (field === "search") {
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

  function onChange(event) {
    const target = event.target;
    const field = cleanText(target?.dataset?.field || target?.name || "", "");

    if (!field) return;

    if (createModal.open) {
      patchCreateFormFromField(target);
    }
  }

  function onSubmit(event) {
    const form = event.target?.closest?.("form");

    if (!form || !ownsNode(form)) return;

    if (form.matches("#facturas-create-form, [data-facturas-create-form='true']")) {
      event.preventDefault();
      void submitCreate(form);
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      if (detailModalIsOpen()) {
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

    const row = event.target?.closest?.("[data-facturas-row='true']");

    if (!row || !host?.contains(row)) return;

    event.preventDefault();
    void openFactura(row.dataset.facturaId || "");
  }

  function shouldLoadMoreByScroll() {
    if (!isBrowser() || destroyed || loading || refreshing || loadingMore || !hasMore) return false;

    try {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const viewport = window.innerHeight || doc.clientHeight || 0;
      const height = Math.max(doc.scrollHeight || 0, document.body?.scrollHeight || 0);

      return height - (scrollTop + viewport) < 900;
    } catch {
      return false;
    }
  }

  function onWindowScroll() {
    if (scrollTicking) return;

    scrollTicking = true;

    nextAnimationFrame(() => {
      scrollTicking = false;

      if (shouldLoadMoreByScroll()) {
        void loadMore();
      }
    });
  }

  function bindTarget(target = null) {
    target?.addEventListener?.("click", onClick);
    target?.addEventListener?.("input", onInput);
    target?.addEventListener?.("change", onChange);
    target?.addEventListener?.("submit", onSubmit);
    target?.addEventListener?.("keydown", onKeydown);

    return true;
  }

  function unbindTarget(target = null) {
    target?.removeEventListener?.("click", onClick);
    target?.removeEventListener?.("input", onInput);
    target?.removeEventListener?.("change", onChange);
    target?.removeEventListener?.("submit", onSubmit);
    target?.removeEventListener?.("keydown", onKeydown);

    return true;
  }

  function bind() {
    bindTarget(host);

    if (isBrowser()) {
      window.addEventListener("scroll", onWindowScroll, { passive: true });
      window.addEventListener("resize", onWindowScroll, { passive: true });
    }
  }

  function unbind() {
    unbindTarget(host);

    if (detailModalHostBound) {
      unbindTarget(detailModalHost);
      detailModalHostBound = false;
    }

    if (isBrowser()) {
      window.removeEventListener("scroll", onWindowScroll);
      window.removeEventListener("resize", onWindowScroll);
    }
  }

  return {
    version: FACTURAS_VIEW_VERSION,

    mount() {
      if (destroyed || !host) return this;
      if (mounted) return this;

      mounted = true;
      bind();

      pageSize = clamp(number(context.pageSize || context.limit || DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE), MIN_BATCH_SIZE, MAX_BATCH_SIZE);

      if (items.length) {
        loading = false;
        refreshing = false;
        loadingMore = false;
        error = "";

        render({
          immediate: true,
        });
      } else {
        loading = true;
        refreshing = false;
        loadingMore = false;
        error = "";

        renderLoading();
      }

      void load({
        page: DEFAULT_PAGE,
        silent: true,
      });

      return this;
    },

    destroy() {
      destroyed = true;
      mounted = false;
      listSeq += 1;
      clientSearchSeq += 1;
      ticketSearchSeq += 1;

      clearTimers();
      cancelScheduledRender();
      cancelScheduledDetailRender();
      disconnectInfiniteObserver();
      unbind();
      removeDetailModalHost();
      revokeObjectUrls();

      createModal.open = false;
      detailModal.open = false;
      detailModal.detailOpen = false;

      syncBodyModalClass(false, { createOpen: false, detailOpen: false });

      if (host) {
        host.replaceChildren();
      }

      return true;
    },

    unmount() {
      return this.destroy();
    },

    cleanup() {
      return this.destroy();
    },

    refresh,
    loadMore,

    getSnapshot() {
      return {
        version: FACTURAS_VIEW_VERSION,

        mounted,
        destroyed,
        loading,
        refreshing,
        loadingMore,
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
        detailModalHost: Boolean(detailModalHost?.isConnected),
        detailModalHostBound,

        openingFacturaId: openingFacturaId ? "***" : "",
        viewingFacturaId: viewingFacturaId ? "***" : "",
        downloadingFacturaId: downloadingFacturaId ? "***" : "",
        sendingFacturaId: sendingFacturaId ? "***" : "",

        role: getCurrentRole(),
        admin: isAdmin(),

        stats: computeFacturasStats(items),

        error: redact(error),
      };
    },
  };
}

/* =========================================================
   VIEW ENTRY
========================================================= */

export async function FacturasView(host = null, context = {}) {
  const controller = createFacturasController(host, context);
  return controller.mount();
}

export const FacturasIndex = FacturasView;

export default FacturasView;

/* =========================================================
   Onion Support - Facturas Index
   Archivo: /src/views/facturas/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Facturas.
   - Montar template principal.
   - Cargar/listar facturas desde facturas.api.js.
   - Crear factura.
   - Abrir detalle.
   - Ver/descargar PDF.
   - Enviar factura.
   - Buscar cliente para crear factura.
   - Buscar incidencias vinculables para crear factura.
   - Delegar HTML en templates.
   - Sin Store.
   - Sin State externo.
   - Sin actions/bindings/model/utils/facturasView legacy.
   - Sin fetch propio.
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
} from "./facturas.template.modal.js";

export const FACTURAS_INDEX_VERSION = "facturas.index.minimal.v1";
export const FACTURAS_VIEW_VERSION = FACTURAS_INDEX_VERSION;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 10;
const TICKET_LIMIT = 60;
const SEARCH_DEBOUNCE_MS = 260;

const CLIENT_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/clientes",
  "/api/clientes/search",
  "/api/search/users",
  "/api/users/search",
  "/api/usuarios/search",
  "/api/clientes",
  "/api/users",
]);

const TICKET_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/tickets",
  "/api/search/incidencias",
  "/api/tickets/search",
  "/api/incidencias/search",
  "/api/tickets",
  "/api/incidencias",
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

  const role = cleanText(value, "").toLowerCase();

  if (role === "admin") return "admin";
  if (role === "user") return "user";

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

function upsertFactura(items = [], factura = null) {
  const next = safeObject(factura, null);

  if (!next) return safeArray(items);

  const id = getFacturaId(next);

  if (!id) return safeArray(items);

  const map = new Map();

  map.set(id, next);

  for (const current of safeArray(items)) {
    const currentId = getFacturaId(current);

    if (!currentId || map.has(currentId)) continue;

    map.set(currentId, current);
  }

  return [...map.values()].sort((a, b) => {
    const left = Date.parse(a.issuedAt || a.updatedAt || a.createdAt || 0);
    const right = Date.parse(b.issuedAt || b.updatedAt || b.createdAt || 0);

    return right - left;
  });
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
          limit: SEARCH_LIMIT,
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
  let collected = [];

  for (const endpoint of TICKET_SEARCH_ENDPOINTS) {
    try {
      const response = await requestGet(
        endpoint,
        {
          ...(q
            ? {
                q,
                search: q,
              }
            : {}),

          limit: TICKET_LIMIT,
          includeTotal: true,
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

      const rows = unwrapList(response);

      if (rows.length) {
        collected = collected.concat(rows);
      }
    } catch (error) {
      lastError = error;
    }
  }

  const normalized = dedupeTickets(collected, selectedClientes);

  if (normalized.length) return normalized;

  if (lastError && !collected.length) throw lastError;

  return [];
}

/* =========================================================
   BODY / FILE / CSV
========================================================= */

function syncBodyModalClass(open = false) {
  if (!isBrowser()) return false;

  try {
    document.body?.classList.toggle("modal-open", open);
    document.body?.classList.toggle("facturas-modal-open", open);
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

function exportCsv(items = []) {
  const rows = safeArray(items);
  const header = [
    "Factura",
    "Cliente",
    "Email",
    "Estado pago",
    "Total",
    "Incidencia",
    "Fecha",
  ];

  const lines = rows.map((item) => [
    getFacturaLabel(item),
    cleanText(first(item.clientName, item.clienteNombre, item.clienteName, item.customerName), ""),
    cleanText(first(item.clienteEmail, item.emailCliente, item.email), ""),
    cleanText(first(item.paymentStatus, item.estadoPago), ""),
    cleanText(first(item.total, item.amount, item.importe), ""),
    cleanText(first(item.ticketId, item.incidenciaId, item.relatedTicketId), ""),
    cleanText(first(item.issuedAt, item.fechaEmision, item.createdAt), ""),
  ].map(csvCell).join(";"));

  const csv = [
    header.map(csvCell).join(";"),
    ...lines,
  ].join("\n");

  return downloadTextFile("facturas.csv", csv);
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

/* =========================================================
   CONTROLLER
========================================================= */

function createFacturasController(host = null, context = {}) {
  let destroyed = false;

  const cache = hydrateFacturasFromCache();

  let items = safeArray(cache.items);
  let total = number(cache.total, items.length);

  let loading = false;
  let refreshing = false;
  let creating = false;
  let error = "";

  let page = DEFAULT_PAGE;
  let pageSize = DEFAULT_PAGE_SIZE;
  let filter = "all";
  let search = "";
  let sort = "date_desc";

  let openingFacturaId = "";
  let viewingFacturaId = "";
  let downloadingFacturaId = "";
  let sendingFacturaId = "";

  let clientSearchSeq = 0;
  let ticketSearchSeq = 0;
  let clientSearchTimer = null;
  let ticketSearchTimer = null;

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
    if (clientSearchTimer) {
      clearTimeout(clientSearchTimer);
      clientSearchTimer = null;
    }

    if (ticketSearchTimer) {
      clearTimeout(ticketSearchTimer);
      ticketSearchTimer = null;
    }
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

      page,
      pageSize,
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
        creating,
        error,

        page,
        pageSize,
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

  function render(options = {}) {
    if (destroyed || !host) return false;

    host.innerHTML = renderFacturasTemplate(payload());

    bindFacturasTemplateDom(host);

    syncBodyModalClass(createModal.open || detailModal.open);

    if (options.focusSelector) {
      focusAfterRender(options.focusSelector, options.focusEnd !== false);
    }

    return true;
  }

  function renderLoading() {
    if (destroyed || !host) return false;

    host.innerHTML = renderFacturasLoadingState(payload());
    bindFacturasTemplateDom(host);

    return true;
  }

  function renderError(message = "No se pudieron cargar las facturas.") {
    if (destroyed || !host) return false;

    host.innerHTML = renderFacturasErrorState(message);
    return true;
  }

  async function load(options = {}) {
    loading = options.silent ? loading : true;
    refreshing = options.force === true;
    error = "";

    if (!options.silent) {
      render();
    }

    try {
      const response = await listFacturas({
        page,
        limit: Math.max(pageSize * 4, 50),
        search,
        sortBy: "recent",
        sortDir: "desc",
        returnStaleOnError: true,
        force: options.force === true,
      });

      items = safeArray(response.items);
      total = number(response.total, items.length);

      error = response.stale ? cleanText(response.error?.message, "") : "";
      loading = false;
      refreshing = false;

      render();

      return response;
    } catch (loadError) {
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

  async function refresh() {
    return load({
      force: true,
    });
  }

  function setFilter(value = "all") {
    filter = cleanText(value, "all");
    page = DEFAULT_PAGE;
    render();

    return true;
  }

  function setSearch(value = "") {
    search = cleanText(value, "");
    page = DEFAULT_PAGE;

    render({
      focusSelector: "[data-facturas-search-input]",
    });

    return true;
  }

  function clearFilters() {
    filter = "all";
    search = "";
    page = DEFAULT_PAGE;
    render({
      focusSelector: "[data-facturas-search-input]",
    });

    return true;
  }

  function setSort(value = "date_desc") {
    sort = cleanText(value, "date_desc");
    page = DEFAULT_PAGE;
    render();

    return true;
  }

  function setPage(value = DEFAULT_PAGE) {
    page = Math.max(1, number(value, DEFAULT_PAGE));
    render();

    return true;
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
    createModal.selectedClientes = safeArray(draft.selectedClientes || draft.clientes).map(normalizeClientCandidate).filter(Boolean);
    createModal.selectedTickets = safeArray(draft.selectedTickets || draft.tickets || draft.incidencias).map(normalizeTicketCandidate).filter(Boolean);
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

    createModal.form = {
      ...createModal.form,
      [name]: field.type === "checkbox" ? Boolean(field.checked) : field.value,
    };

    if (createModal.errors[name]) {
      const next = { ...createModal.errors };
      delete next[name];
      createModal.errors = next;
    }

    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdFacturaId = "";

    render({
      focusSelector: `[data-field='${name}']`,
    });

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
      render({
        focusSelector: "[data-field='clienteSearch']",
      });
      return true;
    }

    createModal.clientSearch.loading = true;
    render({
      focusSelector: "[data-field='clienteSearch']",
    });

    clientSearchTimer = setTimeout(() => {
      void runClientSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return true;
  }

  async function runClientSearch(query = "") {
    const seq = ++clientSearchSeq;

    try {
      const results = await searchClients(query);

      if (seq !== clientSearchSeq) return false;

      createModal.clientSearch.loading = false;
      createModal.clientSearch.error = "";
      createModal.clientSearch.results = results;
      createModal.clientSearch.empty = results.length === 0;

      render({
        focusSelector: "[data-field='clienteSearch']",
      });

      return true;
    } catch (searchError) {
      if (seq !== clientSearchSeq) return false;

      createModal.clientSearch.loading = false;
      createModal.clientSearch.results = [];
      createModal.clientSearch.empty = false;
      createModal.clientSearch.error = safeError(searchError, "No se pudo buscar cliente.");

      render({
        focusSelector: "[data-field='clienteSearch']",
      });

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

    render({
      focusSelector: "[data-field='ticketSearch']",
    });

    void loadTicketsForSelectedClients({
      autoSelectLatest: createModal.selectedTickets.length === 0,
    });

    return true;
  }

  function removeClient(index = -1) {
    if (index < 0) return false;

    createModal.selectedClientes = createModal.selectedClientes.filter((_, currentIndex) => {
      return currentIndex !== index;
    });

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

      render({
        focusSelector: "[data-field='clienteSearch']",
      });

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

    render({
      focusSelector: "[data-field='clienteSearch']",
    });

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
      render({
        focusSelector: "[data-field='ticketSearch']",
      });
      return true;
    }

    createModal.ticketSearch.loading = true;
    render({
      focusSelector: "[data-field='ticketSearch']",
    });

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

    render({
      focusSelector: "[data-field='ticketSearch']",
    });

    try {
      const results = await searchTickets(query, createModal.selectedClientes);

      if (seq !== ticketSearchSeq) return [];

      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.error = "";
      createModal.ticketSearch.results = results;
      createModal.ticketSearch.empty = results.length === 0;

      if (autoSelectLatest && results[0]?.id && !createModal.selectedTickets.length) {
        createModal.selectedTickets = [results[0]];
        syncPrimaryTicketToForm();
      }

      render({
        focusSelector: "[data-field='ticketSearch']",
      });

      return results;
    } catch (searchError) {
      if (seq !== ticketSearchSeq) return [];

      createModal.ticketSearch.loading = false;
      createModal.ticketSearch.results = [];
      createModal.ticketSearch.empty = false;
      createModal.ticketSearch.error = safeError(searchError, "No se pudieron cargar incidencias.");

      render({
        focusSelector: "[data-field='ticketSearch']",
      });

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

    render({
      focusSelector: "[data-field='ticketSearch']",
    });

    return true;
  }

  function removeTicket(index = -1) {
    if (index < 0) return false;

    createModal.selectedTickets = createModal.selectedTickets.filter((_, currentIndex) => {
      return currentIndex !== index;
    });

    syncPrimaryTicketToForm();

    render({
      focusSelector: "[data-field='ticketSearch']",
    });

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

    render({
      focusSelector: "[data-field='ticketSearch']",
    });

    return true;
  }

  function clearTickets() {
    createModal.selectedTickets = [];
    createModal.ticketSearch.query = "";
    syncPrimaryTicketToForm();

    render({
      focusSelector: "[data-field='ticketSearch']",
    });

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
          total: breakdown.base,
          importe: breakdown.base,
          iva: {
            porcentaje: breakdown.ivaRate,
            importe: breakdown.ivaTotal,
          },
          irpf: {
            porcentaje: breakdown.irpfRate,
            importe: breakdown.irpfTotal,
          },
          totalConImpuestos: breakdown.totalFactura,
        },
      ],

      sendEmail: parseBoolean(form.sendEmail, true),
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
        items = upsertFactura(items, created);
        total = Math.max(total, items.length);
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

      render({
        focusSelector: "[data-field='concepto']",
      });

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

    render();

    return true;
  }

  async function openFactura(facturaId = "") {
    const id = cleanText(facturaId, "");

    if (!id) return false;

    openingFacturaId = id;

    detailModal.open = true;
    detailModal.detailOpen = true;
    detailModal.detailLoading = true;
    detailModal.factura = items.find((item) => getFacturaId(item) === id) || null;

    render({
      focusSelector: "[data-facturas-detail-modal='true']",
      focusEnd: false,
    });

    try {
      const detail = await getFacturaById(id);

      if (detail) {
        detailModal.factura = detail;
        items = upsertFactura(items, detail);
      }

      detailModal.detailLoading = false;
      openingFacturaId = "";

      render({
        focusSelector: "[data-facturas-detail-modal='true']",
        focusEnd: false,
      });

      return true;
    } catch (detailError) {
      detailModal.detailLoading = false;
      openingFacturaId = "";
      error = safeError(detailError, "No se pudo abrir el detalle de factura.");

      render();

      return false;
    }
  }

  async function viewPdf(facturaId = "") {
    const id = cleanText(facturaId, "");

    if (!id) return false;

    viewingFacturaId = id;
    detailModal.viewingFacturaId = id;

    render();

    try {
      const result = await viewFacturaPdfRequest(id);

      let url = cleanText(first(result?.url, result?.viewUrl, result?.objectUrl), "");

      if (!url && result?.blob && isBrowser()) {
        url = URL.createObjectURL(result.blob);
        objectUrls.add(url);
      }

      if (url) {
        openUrl(url);
      }

      viewingFacturaId = "";
      detailModal.viewingFacturaId = "";
      render();

      return true;
    } catch (pdfError) {
      viewingFacturaId = "";
      detailModal.viewingFacturaId = "";
      error = safeError(pdfError, "No se pudo abrir el PDF.");

      render();

      return false;
    }
  }

  async function downloadPdf(facturaId = "") {
    const id = cleanText(facturaId, "");

    if (!id) return false;

    downloadingFacturaId = id;
    detailModal.downloadingFacturaId = id;

    render();

    try {
      await downloadFacturaPdfRequest(id, {
        autoDownload: true,
        filename: `${id}.pdf`,
      });

      downloadingFacturaId = "";
      detailModal.downloadingFacturaId = "";
      render();

      return true;
    } catch (downloadError) {
      downloadingFacturaId = "";
      detailModal.downloadingFacturaId = "";
      error = safeError(downloadError, "No se pudo descargar la factura.");

      render();

      return false;
    }
  }

  async function sendFacturaToClient(facturaId = "") {
    const id = cleanText(facturaId, "");

    if (!id) return false;

    sendingFacturaId = id;
    detailModal.sendingFacturaId = id;

    render();

    try {
      const result = await sendFactura(id);

      if (isObject(result) && (result.id || result.facturaId || result.invoiceId)) {
        items = upsertFactura(items, result);

        if (detailModal.factura && getFacturaId(detailModal.factura) === id) {
          detailModal.factura = result;
        }
      }

      sendingFacturaId = "";
      detailModal.sendingFacturaId = "";
      render();

      return true;
    } catch (sendError) {
      sendingFacturaId = "";
      detailModal.sendingFacturaId = "";
      error = safeError(sendError, "No se pudo enviar la factura.");

      render();

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
    if (type === FACTURAS_ACTIONS.PREV_PAGE || type === FACTURAS_ACTIONS.NEXT_PAGE) return setPage(node?.dataset?.page || DEFAULT_PAGE);

    if (type === FACTURAS_ACTIONS.OPEN_FACTURA || type === FACTURA_MODAL_ACTIONS.CLOSE) {
      if (type === FACTURA_MODAL_ACTIONS.CLOSE) return closeDetailModal();
      return openFactura(node?.dataset?.facturaId || "");
    }

    if (type === FACTURAS_ACTIONS.VIEW_PDF || type === FACTURA_MODAL_ACTIONS.VIEW_PDF) {
      return viewPdf(node?.dataset?.facturaId || "");
    }

    if (type === FACTURAS_ACTIONS.DOWNLOAD_PDF || type === FACTURA_MODAL_ACTIONS.DOWNLOAD_PDF) {
      return downloadPdf(node?.dataset?.facturaId || "");
    }

    if (type === FACTURAS_ACTIONS.SEND_FACTURA || type === FACTURA_MODAL_ACTIONS.SEND) {
      return sendFacturaToClient(node?.dataset?.facturaId || "");
    }

    if (type === FACTURAS_ACTIONS.OPEN_INCIDENCIA || type === FACTURA_MODAL_ACTIONS.OPEN_INCIDENCIA) {
      return openIncidencia(node?.dataset?.ticketId || node?.dataset?.incidenciaId || "");
    }

    if (type === FACTURA_CREATE_ACTIONS.CLOSE) return closeCreateModal();
    if (type === FACTURA_CREATE_ACTIONS.SUBMIT) return submitCreate(node?.closest?.("form"));

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

    if (actionNode && host?.contains(actionNode)) {
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

    if (!form || !host?.contains(form)) return;

    if (form.matches("#facturas-create-form, [data-facturas-create-form='true']")) {
      event.preventDefault();
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

    const row = event.target?.closest?.("[data-facturas-row='true']");

    if (!row || !host?.contains(row)) return;

    event.preventDefault();
    void openFactura(row.dataset.facturaId || "");
  }

  function bind() {
    host?.addEventListener?.("click", onClick);
    host?.addEventListener?.("input", onInput);
    host?.addEventListener?.("change", onChange);
    host?.addEventListener?.("submit", onSubmit);
    host?.addEventListener?.("keydown", onKeydown);
  }

  function unbind() {
    host?.removeEventListener?.("click", onClick);
    host?.removeEventListener?.("input", onInput);
    host?.removeEventListener?.("change", onChange);
    host?.removeEventListener?.("submit", onSubmit);
    host?.removeEventListener?.("keydown", onKeydown);
  }

  return {
    version: FACTURAS_VIEW_VERSION,

    async mount() {
      bind();

      loading = true;
      renderLoading();

      await load({
        silent: false,
      });

      return this;
    },

    destroy() {
      destroyed = true;

      clearTimers();
      unbind();
      revokeObjectUrls();

      createModal.open = false;
      detailModal.open = false;
      detailModal.detailOpen = false;

      syncBodyModalClass(false);

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

    getSnapshot() {
      return {
        version: FACTURAS_VIEW_VERSION,

        destroyed,
        loading,
        refreshing,
        creating,

        total,
        count: items.length,

        page,
        pageSize,
        filter,
        searchLength: search.length,
        sort,

        createModalOpen: createModal.open,
        detailModalOpen: detailModal.open,

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

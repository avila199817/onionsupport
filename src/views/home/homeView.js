/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/homeView.js

   HOME EXPERIENCE MODE · USER + ADMIN · HARDENED · FINAL 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista Home
   - render principal con template unificado home.template.js
   - soportar Home para user y admin con la misma lógica
   - reutilizar incidencias como fuente principal de actividad
   - cargar incidencias reales con store/api/model existente
   - carga opcional de facturas/clientes/usuarios SOLO si están configurados
   - evitar escaneo ciego de endpoints inexistentes
   - paginación visual fija a 5 incidencias por vista
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - refresh con loader suave
   - apertura de incidencia con estado visual de loading
   - apertura de modal de creación de incidencia
   - navegación por accesos rápidos
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro

   FIX CRÍTICO:
   - eliminado fallback bruto contra:
     /facturas, /invoices, /billing/invoices,
     /users, /usuarios, /clients, /clientes, /customers.
   - la Home ya no debe llenar consola con 404.
   - los endpoints opcionales se leen únicamente desde AppCore.config.

   HARDENING PRO:
   - estado local autocontenido
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si endpoints opcionales no existen
   - bloqueo de acciones antes de app ready sin perder intención
   - anti spam click en crear incidencia
   - compatible con template data-home-action y data-action
   - no rompe si facturas/clientes/usuarios aún no están montados
========================================================= */

import { AppCore } from "../../core/index.js";

import renderHomeTemplate from "./home.template.js";

import {
  loadIncidencias,
  hydrateFromCache as hydrateIncidenciasFromCache,
} from "../incidencias/incidencias.api.js";

import {
  getIncidencias,
} from "../incidencias/incidencias.store.js";

import {
  DEFAULT_PAGE_SIZE as MODEL_DEFAULT_PAGE_SIZE,
  normalizeIncidenciasCollection,
  sortIncidenciasByUpdatedDesc,
  paginateIncidencias,
  findIncidenciaById,
} from "../incidencias/incidencias.model.js";

import {
  openTicketAction,
  copyTicketIdAction,
} from "../incidencias/incidencias.actions.js";

import IncidenciasCreateView from "../incidencias/incidencias.create.modal.js";

export const HomeView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:home";
  const PAGE_SIZE = Number(MODEL_DEFAULT_PAGE_SIZE || 5) || 5;
  const CREATE_CLICK_THROTTLE_MS = 450;
  const HOME_CACHE_KEY = "onion.home.cache.v1";
  const HOME_CACHE_TTL_MS = 1000 * 60 * 10;

  /*
    IMPORTANTE:
    No declarar aquí endpoints por defecto.

    Antes existía un escaneo bruto:
      /facturas
      /invoices
      /billing/invoices
      /users
      /usuarios
      /clientes
      /clients
      /customers

    Eso provoca 404 si el backend no tiene esas rutas montadas.

    Para activar opcionales, configura explícitamente en AppCore.config:

      homeOptionalEndpoints: {
        invoices: ["/ruta-real-facturas"],
        users: ["/ruta-real-usuarios"],
        clients: ["/ruta-real-clientes"],
      }

    También soporta:
      homeEndpoints
      dashboardEndpoints
      optionalEndpoints
      endpoints
      apiEndpoints
  */

  const OPTIONAL_ENDPOINT_ALIASES = {
    invoices: [
      "invoices",
      "invoice",
      "facturas",
      "factura",
      "billingInvoices",
      "billing_invoices",
      "billing",
    ],

    users: [
      "users",
      "user",
      "usuarios",
      "usuario",
    ],

    clients: [
      "clients",
      "client",
      "clientes",
      "cliente",
      "customers",
      "customer",
    ],
  };

  const OPTIONAL_DIRECT_CONFIG_KEYS = {
    invoices: [
      "homeInvoicesEndpoint",
      "homeInvoicesUrl",
      "invoicesEndpoint",
      "invoicesUrl",
      "facturasEndpoint",
      "facturasUrl",
    ],

    users: [
      "homeUsersEndpoint",
      "homeUsersUrl",
      "usersEndpoint",
      "usersUrl",
      "usuariosEndpoint",
      "usuariosUrl",
    ],

    clients: [
      "homeClientsEndpoint",
      "homeClientsUrl",
      "clientsEndpoint",
      "clientsUrl",
      "clientesEndpoint",
      "clientesUrl",
      "customersEndpoint",
      "customersUrl",
    ],
  };

  const OPTIONAL_CONFIG_BUCKETS = [
    "homeOptionalEndpoints",
    "homeEndpoints",
    "dashboardEndpoints",
    "optionalEndpoints",
    "endpoints",
    "apiEndpoints",
  ];

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let inflightReload = null;
  let bindingsCleanup = null;
  let renderToken = 0;
  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;

  const homeState = {
    hydrated: false,
    loaded: false,

    loading: false,
    refreshing: false,
    creating: false,

    openingTicketId: "",
    navigatingAction: "",

    error: "",

    page: 1,
    pageSize: PAGE_SIZE,

    remoteCount: 0,
    ticketsRemoteCount: 0,
    invoicesRemoteCount: 0,
    usersRemoteCount: 0,
    clientsRemoteCount: 0,

    lastSyncAt: "",

    tickets: [],
    invoices: [],
    users: [],
    clients: [],
    activity: [],
  };

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[HomeView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[HomeView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      return true;
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      return true;
    } catch {}

    return false;
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value).trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;

      if (typeof value === "string" && value.trim() === "") {
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      return value;
    }

    return null;
  }

  function normalizeKey(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .trim();
  }

  function hasOwnKeys(value = {}) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
    );
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (typeof window === "undefined") {
          resolve();
          return;
        }

        if (typeof window.requestAnimationFrame !== "function") {
          window.setTimeout(resolve, 0);
          return;
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return String(Date.now());
    }
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");
    if (!text) return;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(text);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo cargar el Home."
      ),
      "No se pudo cargar el Home."
    );
  }

  function getEventPayload(event = null) {
    return safeObject(
      first(
        event?.detail,
        event?.payload,
        event
      )
    );
  }

  /* =========================================================
     APP / USER / ROLE
  ========================================================= */

  function getCurrentUser() {
    return safeObject(
      first(
        AppCore?.state?.user,
        AppCore?.state?.currentUser,
        AppCore?.state?.profile,
        AppCore?.session?.user,
        AppCore?.auth?.user,
        {}
      )
    );
  }

  function getCurrentRole() {
    const user = getCurrentUser();

    return normalizeKey(
      first(
        AppCore?.state?.role,
        AppCore?.state?.currentRole,
        AppCore?.state?.userRole,
        user.role,
        user.rol,
        user.type,
        user.userType,
        user.permissions?.role,
        "user"
      )
    );
  }

  function isAdminRole(role = "") {
    const key = normalizeKey(role);

    return [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "owner",
      "root",
      "staff",
      "support",
    ].includes(key);
  }

  function isDomReady() {
    return Boolean(
      typeof document !== "undefined" &&
        document.body &&
        document.readyState !== "loading"
    );
  }

  function isAppReady() {
    return Boolean(
      AppCore?.state?.ready ||
        AppCore?.state?.bootCompleted ||
        AppCore?.state?.appReady ||
        AppCore?.state?.authenticated !== undefined
    );
  }

  function canInteract() {
    return !destroyed && isDomReady() && isAppReady();
  }

  function throttleCreateClick() {
    const now = Date.now();

    if (now - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = now;
    return true;
  }

  /* =========================================================
     CACHE
  ========================================================= */

  function readCachePayload() {
    try {
      const raw = window.localStorage.getItem(HOME_CACHE_KEY);
      if (!raw) return null;

      const payload = JSON.parse(raw);
      const savedAt = safeNumber(payload?.savedAt, 0);

      if (!savedAt || Date.now() - savedAt > HOME_CACHE_TTL_MS) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  function writeCachePayload() {
    try {
      const payload = {
        savedAt: Date.now(),
        state: {
          tickets: homeState.tickets,
          invoices: homeState.invoices,
          users: homeState.users,
          clients: homeState.clients,
          activity: homeState.activity,

          remoteCount: homeState.remoteCount,
          ticketsRemoteCount: homeState.ticketsRemoteCount,
          invoicesRemoteCount: homeState.invoicesRemoteCount,
          usersRemoteCount: homeState.usersRemoteCount,
          clientsRemoteCount: homeState.clientsRemoteCount,

          lastSyncAt: homeState.lastSyncAt,
        },
      };

      window.localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function hydrateHomeFromCache() {
    const payload = readCachePayload();
    const state = safeObject(payload?.state);

    if (!hasOwnKeys(state)) {
      return false;
    }

    homeState.tickets = safeArray(state.tickets);
    homeState.invoices = safeArray(state.invoices);
    homeState.users = safeArray(state.users);
    homeState.clients = safeArray(state.clients);
    homeState.activity = safeArray(state.activity);

    homeState.remoteCount = safeNumber(state.remoteCount, homeState.tickets.length);
    homeState.ticketsRemoteCount = safeNumber(state.ticketsRemoteCount, homeState.tickets.length);
    homeState.invoicesRemoteCount = safeNumber(state.invoicesRemoteCount, homeState.invoices.length);
    homeState.usersRemoteCount = safeNumber(state.usersRemoteCount, homeState.users.length);
    homeState.clientsRemoteCount = safeNumber(state.clientsRemoteCount, homeState.clients.length);

    homeState.lastSyncAt = safeText(state.lastSyncAt, "");

    homeState.hydrated = true;
    homeState.loaded = Boolean(
      homeState.tickets.length ||
        homeState.invoices.length ||
        homeState.users.length ||
        homeState.clients.length ||
        homeState.activity.length
    );

    return homeState.loaded;
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      hydrateIncidenciasFromCache?.();
      hydrated = true;
    } catch {}

    try {
      hydrated = hydrateHomeFromCache() || hydrated;
    } catch {}

    try {
      const tickets = getTicketsFromStore();

      if (tickets.length) {
        homeState.tickets = tickets;
        homeState.ticketsRemoteCount = Math.max(
          homeState.ticketsRemoteCount,
          tickets.length
        );
        homeState.remoteCount = Math.max(homeState.remoteCount, tickets.length);
        homeState.hydrated = true;
        homeState.loaded = true;
        hydrated = true;
      }
    } catch {}

    return hydrated;
  }

  /* =========================================================
     DATA NORMALIZATION
  ========================================================= */

  function normalizeCollectionPayload(payload = null) {
    if (Array.isArray(payload)) {
      return {
        items: payload,
        total: payload.length,
      };
    }

    const data = safeObject(payload);

    const items = safeArray(
      first(
        data.items,
        data.rows,
        data.data,
        data.results,
        data.value,
        data.docs,
        data.facturas,
        data.invoices,
        data.users,
        data.usuarios,
        data.clients,
        data.clientes,
        data.customers,
        []
      )
    );

    const total = Math.max(
      items.length,
      safeNumber(
        first(
          data.totalCount,
          data.remoteCount,
          data.total,
          data.count,
          data.meta?.total,
          data.pagination?.total,
          data.page?.total,
          items.length
        ),
        items.length
      )
    );

    return {
      items,
      total,
    };
  }

  function getStableTicketId(item = {}) {
    return safeText(
      first(
        item?.ticketId,
        item?.id,
        item?.code,
        item?.numero,
        item?.ticketCode,
        item?.raw?.ticketId,
        item?.raw?.id,
        item?.raw?.code,
        item?.raw?.numero,
        item?.raw?.ticketCode
      ),
      ""
    );
  }

  function getTicketUpdatedAt(item = {}) {
    return first(
      item.updatedAt,
      item.lastUpdateAt,
      item.ultimaNovedad,
      item.modifiedAt,
      item.closedAt,
      item.createdAt,
      item.raw?.updatedAt,
      item.raw?.lastUpdateAt,
      item.raw?.ultimaNovedad,
      item.raw?.modifiedAt,
      item.raw?.closedAt,
      item.raw?.createdAt
    );
  }

  function getTicketCreatedAt(item = {}) {
    return first(
      item.createdAt,
      item.fechaCreacion,
      item.createdAtES,
      item.date,
      item.raw?.createdAt,
      item.raw?.fechaCreacion,
      item.raw?.createdAtES,
      item.raw?.date
    );
  }

  function getTicketSubject(item = {}) {
    return safeText(
      first(
        item.subject,
        item.title,
        item.asunto,
        item.name,
        item.raw?.subject,
        item.raw?.title,
        item.raw?.asunto,
        item.raw?.name
      ),
      "Incidencia sin asunto"
    );
  }

  function getTicketStatus(item = {}) {
    return safeText(
      first(
        item.status,
        item.estado,
        item.state,
        item.raw?.status,
        item.raw?.estado,
        item.raw?.state,
        "pending"
      ),
      "pending"
    );
  }

  function getTicketStatusLabel(item = {}) {
    const key = normalizeKey(getTicketStatus(item));

    if (["open", "abierta", "abierto"].includes(key)) return "Abierta";
    if (["pending", "pendiente"].includes(key)) return "Pendiente";

    if (
      [
        "progress",
        "in_progress",
        "inprogress",
        "en_proceso",
        "proceso",
        "working",
        "trabajando",
      ].includes(key)
    ) {
      return "En proceso";
    }

    if (["resolved", "resuelta", "resuelto"].includes(key)) return "Resuelta";
    if (["closed", "cerrada", "cerrado"].includes(key)) return "Cerrada";
    if (["cancelled", "cancelada", "cancelado"].includes(key)) return "Cerrada";

    return safeText(getTicketStatus(item), "Pendiente");
  }

  function getInvoiceId(item = {}) {
    return safeText(
      first(
        item.invoiceId,
        item.facturaId,
        item.number,
        item.numero,
        item.code,
        item.id,
        item.raw?.invoiceId,
        item.raw?.facturaId,
        item.raw?.number,
        item.raw?.numero,
        item.raw?.code,
        item.raw?.id
      ),
      ""
    );
  }

  function getInvoiceAmount(item = {}) {
    return safeNumber(
      first(
        item.total,
        item.amount,
        item.importe,
        item.price,
        item.subtotal,
        item.raw?.total,
        item.raw?.amount,
        item.raw?.importe,
        item.raw?.price,
        item.raw?.subtotal,
        0
      ),
      0
    );
  }

  function getInvoiceCurrency(item = {}) {
    return safeText(
      first(
        item.currency,
        item.moneda,
        item.raw?.currency,
        item.raw?.moneda,
        "EUR"
      ),
      "EUR"
    );
  }

  function formatMoney(value = 0, currency = "EUR") {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return "—";
    }

    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: safeText(currency, "EUR"),
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${safeText(currency, "EUR")}`;
    }
  }

  function getTicketsFromStore() {
    try {
      const rawItems = safeArray(getIncidencias());

      const normalizedItems = safeArray(
        normalizeIncidenciasCollection(rawItems)
      );

      return sortIncidenciasByUpdatedDesc(normalizedItems);
    } catch (error) {
      safeWarn("getTicketsFromStore falló:", error);
      return safeArray(homeState.tickets);
    }
  }

  function getTickets() {
    const storeTickets = getTicketsFromStore();

    if (storeTickets.length) {
      return storeTickets;
    }

    return safeArray(homeState.tickets);
  }

  function getPaginationMeta(items = []) {
    const page = safeNumber(homeState.page, 1);
    const pageSize = safeNumber(homeState.pageSize, PAGE_SIZE);

    try {
      return paginateIncidencias(
        safeArray(items),
        page,
        pageSize || PAGE_SIZE
      );
    } catch {
      const rows = safeArray(items);
      const size = Math.max(1, pageSize || PAGE_SIZE);
      const totalPages = Math.max(1, Math.ceil((rows.length || 1) / size));
      const nextPage = Math.min(Math.max(1, page), totalPages);
      const start = (nextPage - 1) * size;

      return {
        items: rows.slice(start, start + size),
        page: nextPage,
        pageSize: size,
        totalPages,
        total: rows.length,
      };
    }
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(homeState.page, 1) !== pagination.page) {
      homeState.page = pagination.page;
    }

    return pagination;
  }

  function buildActivityFromData() {
    const ticketActivity = getTickets()
      .slice(0, 6)
      .map((item) => {
        const ticketId = getStableTicketId(item);

        return {
          type: "ticket",
          title: getTicketSubject(item),
          text: `Incidencia ${ticketId || "sin ID"} · ${getTicketStatusLabel(item)}`,
          date: getTicketUpdatedAt(item) || getTicketCreatedAt(item),
          route: "/incidencias",
          action: "open-ticket",
          entityId: ticketId,
        };
      });

    const invoiceActivity = safeArray(homeState.invoices)
      .slice(0, 4)
      .map((item) => {
        const invoiceId = getInvoiceId(item);
        const amount = getInvoiceAmount(item);
        const currency = getInvoiceCurrency(item);

        return {
          type: "invoice",
          title: invoiceId ? `Factura ${invoiceId}` : "Factura registrada",
          text: formatMoney(amount, currency),
          date: first(
            item.updatedAt,
            item.createdAt,
            item.date,
            item.raw?.updatedAt,
            item.raw?.createdAt,
            item.raw?.date
          ),
          route: "/facturas",
          action: "go-facturas",
          entityId: invoiceId,
        };
      });

    return [...ticketActivity, ...invoiceActivity]
      .filter((item) => item.title || item.text)
      .sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();

        return db - da;
      });
  }

  /* =========================================================
     OPTIONAL ENDPOINT CONFIG
  ========================================================= */

  function normalizeEndpointPath(value = "") {
    const text = safeText(value, "");
    if (!text) return "";

    if (/^https?:\/\//i.test(text)) {
      return text;
    }

    return text.startsWith("/")
      ? text
      : `/${text}`;
  }

  function normalizeEndpointValue(value = null) {
    if (!value) {
      return [];
    }

    if (typeof value === "string") {
      const endpoint = normalizeEndpointPath(value);
      return endpoint ? [endpoint] : [];
    }

    if (Array.isArray(value)) {
      const output = [];

      for (const item of value) {
        output.push(...normalizeEndpointValue(item));
      }

      return output;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const output = [];

      const preferred = [
        value.list,
        value.index,
        value.all,
        value.get,
        value.path,
        value.url,
        value.endpoint,
        value.href,
      ];

      for (const item of preferred) {
        output.push(...normalizeEndpointValue(item));
      }

      return output;
    }

    return [];
  }

  function uniqueEndpoints(values = []) {
    const output = [];
    const seen = new Set();

    for (const value of safeArray(values)) {
      const endpoint = normalizeEndpointPath(value);
      const key = endpoint.toLowerCase();

      if (!endpoint || seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(endpoint);
    }

    return output;
  }

  function getOptionalEndpointCandidates(kind = "") {
    const key = safeText(kind, "");
    if (!key) return [];

    const aliases = safeArray(OPTIONAL_ENDPOINT_ALIASES[key]);
    const directKeys = safeArray(OPTIONAL_DIRECT_CONFIG_KEYS[key]);
    const cfg = safeObject(AppCore?.config);
    const collected = [];

    for (const directKey of directKeys) {
      collected.push(...normalizeEndpointValue(cfg?.[directKey]));
    }

    for (const bucketName of OPTIONAL_CONFIG_BUCKETS) {
      const bucket = safeObject(cfg?.[bucketName]);

      if (!hasOwnKeys(bucket)) {
        continue;
      }

      for (const alias of aliases) {
        collected.push(...normalizeEndpointValue(bucket?.[alias]));
      }
    }

    return uniqueEndpoints(collected);
  }

  function getCurrentOptionalCollection(kind = "") {
    const key = safeText(kind, "");

    if (key === "invoices") {
      return {
        items: safeArray(homeState.invoices),
        total: Math.max(
          safeArray(homeState.invoices).length,
          safeNumber(homeState.invoicesRemoteCount, 0)
        ),
      };
    }

    if (key === "users") {
      return {
        items: safeArray(homeState.users),
        total: Math.max(
          safeArray(homeState.users).length,
          safeNumber(homeState.usersRemoteCount, 0)
        ),
      };
    }

    if (key === "clients") {
      return {
        items: safeArray(homeState.clients),
        total: Math.max(
          safeArray(homeState.clients).length,
          safeNumber(homeState.clientsRemoteCount, 0)
        ),
      };
    }

    return {
      items: [],
      total: 0,
    };
  }

  /* =========================================================
     REQUEST HELPERS
  ========================================================= */

  function joinUrl(base = "", path = "") {
    const left = safeText(base, "").replace(/\/+$/, "");
    const right = safeText(path, "").replace(/^\/+/, "");

    if (!left) return `/${right}`;
    if (!right) return left;

    return `${left}/${right}`;
  }

  function getApiBase() {
    return safeText(
      first(
        AppCore?.config?.apiBase,
        AppCore?.config?.apiBaseUrl,
        AppCore?.config?.baseUrl,
        AppCore?.state?.apiBase,
        ""
      ),
      ""
    );
  }

  function getAuthToken() {
    return safeText(
      first(
        AppCore?.state?.token,
        AppCore?.state?.accessToken,
        AppCore?.auth?.token,
        AppCore?.session?.token,
        (() => {
          try {
            return window.localStorage.getItem("accessToken");
          } catch {
            return "";
          }
        })(),
        (() => {
          try {
            return window.localStorage.getItem("token");
          } catch {
            return "";
          }
        })()
      ),
      ""
    );
  }

  async function callPossibleClientGet(endpoint = "") {
    const path = safeText(endpoint, "");
    if (!path) return null;

    const requestOptions = {
      silent: true,
      emitEvents: false,
      storeError: false,
      expectedStatuses: [404],
      dedupe: true,
    };

    const candidates = [
      {
        context: AppCore?.api,
        fn: AppCore?.api?.get,
      },
      {
        context: AppCore?.http,
        fn: AppCore?.http?.get,
      },
      {
        context: AppCore?.request,
        fn: AppCore?.request?.get,
      },
      {
        context: AppCore?.apiClient,
        fn: AppCore?.apiClient?.get,
      },
    ].filter((item) => typeof item.fn === "function");

    for (const candidate of candidates) {
      try {
        const response = await candidate.fn.call(
          candidate.context,
          path,
          requestOptions
        );

        if (
          response &&
          typeof response === "object" &&
          safeNumber(response.status, 0) >= 400
        ) {
          continue;
        }

        return response;
      } catch {}
    }

    try {
      if (typeof AppCore?.request === "function") {
        const response = await AppCore.request(path, {
          method: "GET",
          ...requestOptions,
        });

        if (
          response &&
          typeof response === "object" &&
          safeNumber(response.status, 0) >= 400
        ) {
          return null;
        }

        return response;
      }
    } catch {}

    return null;
  }

  async function parseFetchJsonResponse(response = null) {
    if (!response) return null;

    if (!response.ok) {
      return null;
    }

    try {
      return await response.json();
    } catch {
      try {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    }
  }

  async function fetchJsonBestEffort(endpoint = "") {
    const path = safeText(endpoint, "");
    if (!path) return null;

    const clientResponse = await callPossibleClientGet(path);

    if (clientResponse !== null && clientResponse !== undefined) {
      return clientResponse?.data ?? clientResponse;
    }

    if (typeof window === "undefined" || typeof window.fetch !== "function") {
      return null;
    }

    const apiBase = getApiBase();
    const url = /^https?:\/\//i.test(path)
      ? path
      : joinUrl(apiBase, path);

    const token = getAuthToken();

    try {
      const response = await window.fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      return await parseFetchJsonResponse(response);
    } catch {
      return null;
    }
  }

  async function loadOptionalCollection(kind = "") {
    const key = safeText(kind, "");
    const endpoints = getOptionalEndpointCandidates(key);

    if (!key) {
      return {
        items: [],
        total: 0,
      };
    }

    if (!endpoints.length) {
      return getCurrentOptionalCollection(key);
    }

    for (const endpoint of endpoints) {
      const payload = await fetchJsonBestEffort(endpoint);
      const normalized = normalizeCollectionPayload(payload);

      if (normalized.items.length || normalized.total > 0) {
        return normalized;
      }
    }

    return getCurrentOptionalCollection(key);
  }

  /* =========================================================
     STATE
  ========================================================= */

  function ensureBaseState() {
    homeState.page = Math.max(1, safeNumber(homeState.page, 1));
    homeState.pageSize = Math.max(1, safeNumber(homeState.pageSize, PAGE_SIZE));

    homeState.loading = Boolean(homeState.loading);
    homeState.refreshing = Boolean(homeState.refreshing);
    homeState.creating = Boolean(homeState.creating);

    homeState.openingTicketId = safeText(homeState.openingTicketId, "");
    homeState.navigatingAction = safeText(homeState.navigatingAction, "");
    homeState.error = safeText(homeState.error, "");

    homeState.tickets = safeArray(homeState.tickets);
    homeState.invoices = safeArray(homeState.invoices);
    homeState.users = safeArray(homeState.users);
    homeState.clients = safeArray(homeState.clients);
    homeState.activity = safeArray(homeState.activity);

    homeState.remoteCount = Math.max(0, safeNumber(homeState.remoteCount, 0));
    homeState.ticketsRemoteCount = Math.max(0, safeNumber(homeState.ticketsRemoteCount, homeState.tickets.length));
    homeState.invoicesRemoteCount = Math.max(0, safeNumber(homeState.invoicesRemoteCount, homeState.invoices.length));
    homeState.usersRemoteCount = Math.max(0, safeNumber(homeState.usersRemoteCount, homeState.users.length));
    homeState.clientsRemoteCount = Math.max(0, safeNumber(homeState.clientsRemoteCount, homeState.clients.length));

    return homeState;
  }

  function markIdle() {
    homeState.loading = false;
    homeState.refreshing = false;
  }

  function markLoadedOk() {
    const tickets = getTickets();

    homeState.tickets = tickets;
    homeState.remoteCount = Math.max(homeState.remoteCount, tickets.length);
    homeState.ticketsRemoteCount = Math.max(homeState.ticketsRemoteCount, tickets.length);

    homeState.loaded = true;
    homeState.hydrated = true;
    homeState.error = "";

    markIdle();
  }

  function clearTransientState() {
    homeState.creating = false;
    homeState.openingTicketId = "";
    homeState.navigatingAction = "";
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =========================================================
     MODAL / NAVIGATION BRIDGES
  ========================================================= */

  function getRouterCandidate() {
    return (
      AppCore?.router ||
      AppCore?.Router ||
      AppCore?.modules?.router ||
      window?.Router ||
      window?.OnionRouter ||
      null
    );
  }

  async function navigateTo(route = "", options = {}) {
    const target = safeText(route, "");
    if (!target) return false;

    const opts = safeObject(options);
    const router = getRouterCandidate();

    try {
      if (typeof router?.navigate === "function") {
        router.navigate(target, opts);
        return true;
      }

      if (typeof router?.go === "function") {
        router.go(target, opts);
        return true;
      }

      if (typeof router?.push === "function") {
        router.push(target, opts);
        return true;
      }

      if (typeof AppCore?.navigate === "function") {
        AppCore.navigate(target, opts);
        return true;
      }
    } catch (error) {
      safeWarn("navigateTo vía router falló:", error);
    }

    try {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    } catch {}

    try {
      window.location.assign(target);
      return true;
    } catch {}

    return false;
  }

  function openTicketModalBridge(detail = null) {
    if (!detail) return false;

    try {
      const modal = window?.OnionIncidenciasModal;

      if (modal?.getState?.()?.isOpen && typeof modal.update === "function") {
        modal.update(detail);
        return true;
      }

      if (typeof modal?.open === "function") {
        modal.open(detail);
        return true;
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderIncidenciaTicketModal ||
        window?.renderTicketModal;

      if (typeof hook === "function") {
        hook(detail);
        return true;
      }
    } catch (error) {
      safeWarn("ticket modal hook falló:", error);
    }

    safeEmit("incidencias:modal:open", { detail });

    return true;
  }

  function openCreateModalBridge(draft = {}) {
    try {
      const modal = window?.OnionIncidenciasCreateModal;

      if (typeof modal?.open === "function") {
        modal.open(draft);
        return true;
      }
    } catch (error) {
      safeWarn("OnionIncidenciasCreateModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderIncidenciasCreateModal ||
        window?.renderIncidenciaCreateModal ||
        IncidenciasCreateView?.open;

      if (typeof hook === "function") {
        hook(draft);
        return true;
      }
    } catch (error) {
      safeWarn("create modal hook falló:", error);
    }

    safeEmit("incidencias:create-modal:open", { draft });

    return true;
  }

  function flushPendingCreate() {
    if (!pendingCreateRequest) return false;
    if (!canInteract()) return false;

    pendingCreateRequest = false;
    lastCreateClickAt = 0;
    homeState.creating = false;

    void handleCreateIncidencia({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
  }

  /* =========================================================
     DOM POST-RENDER
  ========================================================= */

  function applyErrorStateToDom(container) {
    if (!container) return;

    const oldBanner = container.querySelector(
      "[data-home-error-banner='true']"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const message = safeText(homeState.error, "");
    if (!message) return;

    const anchor =
      container.querySelector(".home-tickets .home-panel-head") ||
      container.querySelector(".home-panel-head") ||
      container.querySelector(".content-wrapper");

    if (!anchor) return;

    const banner = document.createElement("div");
    banner.setAttribute("data-home-error-banner", "true");

    Object.assign(banner.style, {
      margin: "0 18px 14px",
      padding: "11px 13px",
      borderRadius: "14px",
      border:
        "1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 22%, var(--border-soft, rgba(15,23,42,.08)))",
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 6%, transparent), transparent), var(--surface-1, rgba(255,255,255,.78))",
      color: "var(--text-soft, #4b5563)",
      fontSize: "12px",
      lineHeight: "1.5",
    });

    banner.textContent = message;
    anchor.insertAdjacentElement("afterend", banner);
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    ensureBaseState();

    const tickets = getTickets();
    const pagination = clampPageAgainstItems(tickets);

    const role = getCurrentRole();
    const user = getCurrentUser();

    const remoteCount = Math.max(
      tickets.length,
      safeNumber(homeState.remoteCount, tickets.length),
      safeNumber(homeState.ticketsRemoteCount, tickets.length)
    );

    homeState.tickets = tickets;
    homeState.remoteCount = remoteCount;
    homeState.ticketsRemoteCount = remoteCount;

    const activity = homeState.activity.length
      ? homeState.activity
      : buildActivityFromData();

    return `
      <section class="panel-content dashboard ready" data-view="home">
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);">
          ${renderHomeTemplate({
            user,
            role,

            tickets,
            incidencias: tickets,

            facturas: homeState.invoices,
            invoices: homeState.invoices,

            users: homeState.users,
            usuarios: homeState.users,

            clients: homeState.clients,
            clientes: homeState.clients,

            activity,

            totalCount: remoteCount,
            remoteCount,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages: pagination.totalPages,

            lastUpdatedAt: homeState.lastSyncAt || "",

            state: {
              ...homeState,
              user,
              role,

              items: tickets,
              tickets,
              incidencias: tickets,

              facturas: homeState.invoices,
              invoices: homeState.invoices,

              users: homeState.users,
              usuarios: homeState.users,

              clients: homeState.clients,
              clientes: homeState.clients,

              activity,

              totalCount: remoteCount,
              remoteCount,
              page: pagination.page,
              pageSize: pagination.pageSize,
              totalPages: pagination.totalPages,
            },
          })}
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar Home.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Home");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();
    decorateDom(container);

    homeState.hydrated = true;

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =========================================================
     DATA
  ========================================================= */

  async function loadOptionalDashboardCollections(admin = false) {
    const invoicesPayload = await loadOptionalCollection("invoices");

    homeState.invoices = invoicesPayload.items;
    homeState.invoicesRemoteCount = invoicesPayload.total;

    if (!admin) {
      return;
    }

    const [usersPayload, clientsPayload] = await Promise.all([
      loadOptionalCollection("users"),
      loadOptionalCollection("clients"),
    ]);

    homeState.users = usersPayload.items;
    homeState.usersRemoteCount = usersPayload.total;

    homeState.clients = clientsPayload.items;
    homeState.clientsRemoteCount = clientsPayload.total;
  }

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getTickets();

    const ticketsBefore = getTickets();
    const hasVisibleData =
      ticketsBefore.length ||
      homeState.invoices.length ||
      homeState.users.length ||
      homeState.clients.length ||
      homeState.activity.length;

    try {
      homeState.error = "";

      if (!hasVisibleData && !silent) {
        homeState.loading = true;
      } else if (asRefresh) {
        homeState.refreshing = true;
      }
    } catch {
      homeState.loading = !hasVisibleData && !silent;
      homeState.refreshing = hasVisibleData && asRefresh;
    }

    render();

    try {
      await loadIncidencias({
        force,
      });

      const tickets = getTicketsFromStore();

      homeState.tickets = tickets;
      homeState.ticketsRemoteCount = Math.max(tickets.length, homeState.ticketsRemoteCount);
      homeState.remoteCount = Math.max(tickets.length, homeState.remoteCount);

      const role = getCurrentRole();
      const admin = isAdminRole(role);

      await loadOptionalDashboardCollections(admin);

      homeState.activity = buildActivityFromData();
      homeState.lastSyncAt = nowIso();

      markLoadedOk();
      writeCachePayload();

      return getTickets();
    } catch (error) {
      const message = safeErrorMessage(error);

      homeState.error = message;
      homeState.loaded = true;
      homeState.hydrated = true;

      markIdle();

      if (!silent) {
        showToast(message, "error");
      }

      return getTickets();
    } finally {
      markIdle();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    /*
      Igual que en incidencias:
      1. Pintamos pantalla.
      2. Bindeamos contenedor inmediatamente.
      3. Después cargamos datos.
    */
    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    await loadData({
      force,
      silent,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    return api;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (homeState.loading || homeState.refreshing) {
      return homeState.page || 1;
    }

    const items = getTickets();

    const pagination = getPaginationMeta(items);
    const totalPages = Math.max(1, safeNumber(pagination.totalPages, 1));

    homeState.page = Math.min(
      Math.max(1, safeNumber(page, homeState.page || 1)),
      totalPages
    );

    rerender();

    return homeState.page;
  }

  function goPrevPage() {
    return goToPage((homeState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((homeState.page || 1) + 1);
  }

  function changePageSize(value = PAGE_SIZE) {
    const nextSize = Math.max(1, safeNumber(value, PAGE_SIZE));

    homeState.pageSize = nextSize;
    homeState.page = 1;

    rerender();

    return nextSize;
  }

  async function handleOpenTicket(ticketId = "") {
    const id = safeText(ticketId, "");
    if (!id) return null;

    if (homeState.openingTicketId) {
      return null;
    }

    homeState.openingTicketId = id;

    rerender();
    await waitForPaint();

    try {
      const detail = await openTicketAction({
        ticketId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir la incidencia.", "error");
        return null;
      }

      openTicketModalBridge(detail);

      return detail;
    } catch (error) {
      safeWarn("handleOpenTicket falló:", error);
      showToast("No se pudo abrir la incidencia.", "error");
      return null;
    } finally {
      homeState.openingTicketId = "";

      if (!destroyed) rerender();
    }
  }

  async function handleCopyTicketId(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    try {
      return await copyTicketIdAction({
        ticketId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyTicketId falló:", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  async function handleCreateIncidencia(options = {}) {
    const opts = safeObject(options);
    const skipThrottle = Boolean(opts.skipThrottle);

    if (homeState.creating && !pendingCreateRequest) {
      return false;
    }

    if (!skipThrottle && !throttleCreateClick()) {
      return false;
    }

    if (!canInteract()) {
      pendingCreateRequest = true;
      homeState.creating = true;

      rerender();

      showToast("Preparando formulario...", "info");

      return false;
    }

    pendingCreateRequest = false;
    homeState.creating = true;

    rerender();
    await waitForPaint();

    try {
      const opened = openCreateModalBridge({});

      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
      }

      return opened;
    } finally {
      homeState.creating = false;

      if (!destroyed) rerender();
    }
  }

  async function handleNavigateAction(action = "", route = "") {
    const actionName = safeText(action, "navigate");
    const target = safeText(route, "");

    if (!target) return false;

    if (homeState.navigatingAction) {
      return false;
    }

    homeState.navigatingAction = actionName;

    rerender();
    await waitForPaint();

    try {
      return await navigateTo(target, {
        source: "home",
        action: actionName,
      });
    } finally {
      homeState.navigatingAction = "";

      if (!destroyed) rerender();
    }
  }

  async function handleOpenInvoice(invoiceId = "") {
    const id = safeText(invoiceId, "");

    await handleNavigateAction("go-facturas", "/facturas");

    if (id) {
      safeEmit("facturas:open-requested", {
        invoiceId: id,
        source: "home",
      });
    }

    return true;
  }

  async function handleActivityAction(element = null) {
    const route = safeText(
      first(
        element?.dataset?.route,
        element?.getAttribute?.("data-route")
      ),
      ""
    );

    const entityId = safeText(
      first(
        element?.dataset?.entityId,
        element?.getAttribute?.("data-entity-id")
      ),
      ""
    );

    const action = safeText(
      first(
        element?.dataset?.homeAction,
        element?.dataset?.action,
        element?.getAttribute?.("data-home-action"),
        element?.getAttribute?.("data-action")
      ),
      "open-activity"
    );

    if (action === "open-ticket" && entityId) {
      return handleOpenTicket(entityId);
    }

    if (route) {
      return handleNavigateAction(action, route);
    }

    return false;
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = actions
      .map((action) => {
        return [
          `[data-home-action="${action}"]`,
          `[data-action="${action}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function getTicketIdFromElement(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.ticketId,
        element.dataset?.ticketCode,
        element.dataset?.entityId,
        element.getAttribute?.("data-ticket-id"),
        element.getAttribute?.("data-ticket-code"),
        element.getAttribute?.("data-entity-id")
      ),
      ""
    );
  }

  function getRouteFromElement(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.route,
        element.dataset?.href,
        element.getAttribute?.("data-route"),
        element.getAttribute?.("href")
      ),
      ""
    );
  }

  function getInvoiceIdFromElement(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.invoiceId,
        element.dataset?.facturaId,
        element.dataset?.entityId,
        element.getAttribute?.("data-invoice-id"),
        element.getAttribute?.("data-factura-id"),
        element.getAttribute?.("data-entity-id")
      ),
      ""
    );
  }

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) return;

      const ticketBtn = getActionTarget(event, [
        "open-ticket",
        "detail",
        "open",
        "view-ticket",
      ]);

      if (ticketBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket(getTicketIdFromElement(ticketBtn));
        return;
      }

      const activityBtn = getActionTarget(event, [
        "open-activity",
      ]);

      if (activityBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleActivityAction(activityBtn);
        return;
      }

      const copyBtn = getActionTarget(event, [
        "copy",
        "copy-ticket-id",
        "copy-id",
      ]);

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyTicketId(getTicketIdFromElement(copyBtn));
        return;
      }

      const pageBtn = getActionTarget(event, [
        "page",
        "go-page",
      ]);

      if (pageBtn) {
        event.preventDefault();

        const page = safeNumber(
          first(
            pageBtn.dataset?.page,
            pageBtn.getAttribute?.("data-page")
          ),
          homeState.page || 1
        );

        goToPage(page);
        return;
      }

      const prevBtn = getActionTarget(event, [
        "prev-page",
        "pagination-prev",
      ]);

      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn = getActionTarget(event, [
        "next-page",
        "pagination-next",
      ]);

      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const createBtn =
        getActionTarget(event, [
          "create",
          "new",
          "new-ticket",
          "create-ticket",
          "create-incidencia",
        ]) ||
        event.target?.closest?.("#home-create-ticket-btn");

      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateIncidencia();
        return;
      }

      const invoiceBtn = getActionTarget(event, [
        "open-invoice",
        "go-facturas",
        "facturas",
        "invoices",
      ]);

      if (invoiceBtn) {
        event.preventDefault();

        const invoiceId = getInvoiceIdFromElement(invoiceBtn);
        const route = getRouteFromElement(invoiceBtn) || "/facturas";

        if (invoiceId) {
          await handleOpenInvoice(invoiceId);
        } else {
          await handleNavigateAction("go-facturas", route);
        }

        return;
      }

      const navBtn = getActionTarget(event, [
        "navigate",
        "go-home",
        "go-incidencias",
        "go-users",
        "go-usuarios",
        "go-clientes",
        "go-clients",
        "go-account",
        "go-settings",
      ]);

      if (navBtn) {
        event.preventDefault();

        const route = getRouteFromElement(navBtn);
        const action = safeText(
          first(
            navBtn.dataset?.homeAction,
            navBtn.dataset?.action,
            navBtn.getAttribute?.("data-home-action"),
            navBtn.getAttribute?.("data-action")
          ),
          "navigate"
        );

        await handleNavigateAction(action, route);
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
        ]) ||
        event.target?.closest?.("#home-retry-btn");

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
        });

        return;
      }

      const refreshBtn =
        getActionTarget(event, [
          "refresh",
          "reload",
        ]) ||
        event.target?.closest?.("#home-refresh-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
        });
      }
    };

    const onChange = (event) => {
      if (destroyed) return;

      const pageSizeField =
        event.target?.closest?.("[data-home-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(pageSizeField.value);
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("change", onChange);
      } catch {}
    };
  }

  function bindBusEvents() {
    const bus = AppCore?.events;

    if (!bus?.on) {
      return () => {};
    }

    const onMutated = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
    };

    const onRefreshTicket = async (event) => {
      const payload = getEventPayload(event);

      await handleOpenTicket(
        payload.ticketId ||
          payload.detail?.ticketId ||
          payload.detail?.id ||
          ""
      );
    };

    try {
      bus.on("home:reload", onMutated);

      bus.on("incidencias:create:success", onMutated);
      bus.on("incidencias:modal:updated", onMutated);
      bus.on("incidencias:upload:success", onMutated);
      bus.on("incidencias:comment:success", onMutated);
      bus.on("incidencias:reopen:success", onMutated);

      bus.on("facturas:create:success", onMutated);
      bus.on("facturas:update:success", onMutated);
      bus.on("clientes:update:success", onMutated);
      bus.on("users:update:success", onMutated);

      bus.on("home:ticket:open", onRefreshTicket);

      bus.on("app:ready", onReady);
      bus.on("app:boot:ready", onReady);
      bus.on("app:boot:complete", onReady);
      bus.on("router:rendered", onReady);
    } catch {}

    return () => {
      try { bus.off("home:reload", onMutated); } catch {}

      try { bus.off("incidencias:create:success", onMutated); } catch {}
      try { bus.off("incidencias:modal:updated", onMutated); } catch {}
      try { bus.off("incidencias:upload:success", onMutated); } catch {}
      try { bus.off("incidencias:comment:success", onMutated); } catch {}
      try { bus.off("incidencias:reopen:success", onMutated); } catch {}

      try { bus.off("facturas:create:success", onMutated); } catch {}
      try { bus.off("facturas:update:success", onMutated); } catch {}
      try { bus.off("clientes:update:success", onMutated); } catch {}
      try { bus.off("users:update:success", onMutated); } catch {}

      try { bus.off("home:ticket:open", onRefreshTicket); } catch {}

      try { bus.off("app:ready", onReady); } catch {}
      try { bus.off("app:boot:ready", onReady); } catch {}
      try { bus.off("app:boot:complete", onReady); } catch {}
      try { bus.off("router:rendered", onReady); } catch {}
    };
  }

  function bindWindowEvents() {
    const onMutated = async () => {
      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
    };

    const onOpenTicket = async (event) => {
      const payload = getEventPayload(event);

      await handleOpenTicket(
        payload.ticketId ||
          payload.detail?.ticketId ||
          payload.detail?.id ||
          ""
      );
    };

    try {
      window.addEventListener("home:reload", onMutated);

      window.addEventListener("incidencias:create:success", onMutated);
      window.addEventListener("incidencias:modal:updated", onMutated);
      window.addEventListener("incidencias:upload:success", onMutated);
      window.addEventListener("incidencias:comment:success", onMutated);
      window.addEventListener("incidencias:reopen:success", onMutated);

      window.addEventListener("facturas:create:success", onMutated);
      window.addEventListener("facturas:update:success", onMutated);
      window.addEventListener("clientes:update:success", onMutated);
      window.addEventListener("users:update:success", onMutated);

      window.addEventListener("home:ticket:open", onOpenTicket);

      window.addEventListener("app:ready", onReady);
      window.addEventListener("app:boot:ready", onReady);
      window.addEventListener("app:boot:complete", onReady);
      window.addEventListener("router:rendered", onReady);
    } catch {}

    return () => {
      try {
        window.removeEventListener("home:reload", onMutated);

        window.removeEventListener("incidencias:create:success", onMutated);
        window.removeEventListener("incidencias:modal:updated", onMutated);
        window.removeEventListener("incidencias:upload:success", onMutated);
        window.removeEventListener("incidencias:comment:success", onMutated);
        window.removeEventListener("incidencias:reopen:success", onMutated);

        window.removeEventListener("facturas:create:success", onMutated);
        window.removeEventListener("facturas:update:success", onMutated);
        window.removeEventListener("clientes:update:success", onMutated);
        window.removeEventListener("users:update:success", onMutated);

        window.removeEventListener("home:ticket:open", onOpenTicket);

        window.removeEventListener("app:ready", onReady);
        window.removeEventListener("app:boot:ready", onReady);
        window.removeEventListener("app:boot:complete", onReady);
        window.removeEventListener("router:rendered", onReady);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindBusEvents());
    cleanups.push(bindWindowEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PUBLIC
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) return api;

    if (inflightReload) {
      return inflightReload;
    }

    inflightReload = (async () => {
      await renderAndLoad(options);

      if (!destroyed) {
        bind();
      }

      return api;
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
    }
  }

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      ensureBaseState();
      rerender();
      flushPendingCreate();
      return api;
    }

    initialized = true;

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();

      await renderAndLoad({
        force: false,
        asRefresh: false,
        silent: false,
      });

      if (!destroyed) {
        bind();
      }

      flushPendingCreate();

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderToken();
    cleanupBindings();

    markIdle();
    clearTransientState();

    pendingCreateRequest = false;
    inflightReload = null;

    safeLog("destroy");
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openTicket: handleOpenTicket,
    copyTicketId: handleCopyTicketId,
    createIncidencia: handleCreateIncidencia,
    navigateTo,
    openInvoice: handleOpenInvoice,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems: () => getTickets(),
    getTickets: () => getTickets(),
    getInvoices: () => safeArray(homeState.invoices),
    getUsers: () => safeArray(homeState.users),
    getClients: () => safeArray(homeState.clients),
    getActivity: () => safeArray(homeState.activity),

    getPageItems: () => getPaginationMeta(getTickets()).items,
    getPagination: () => getPaginationMeta(getTickets()),
    getTicketById: (ticketId = "") =>
      findIncidenciaById(getTickets(), ticketId),

    getOptionalEndpointCandidates,

    getState: () => ({
      ...homeState,
      user: getCurrentUser(),
      role: getCurrentRole(),
      initialized,
      destroyed,
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      pendingCreateRequest,
      optionalEndpoints: {
        invoices: getOptionalEndpointCandidates("invoices"),
        users: getOptionalEndpointCandidates("users"),
        clients: getOptionalEndpointCandidates("clients"),
      },
    }),

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default HomeView;

/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/homeView.js

   HOME EXPERIENCE MODE · USER + ADMIN · DASHBOARD API FIRST · FINAL PRO 10/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista Home
   - render principal con template unificado home.template.js
   - usar home.api.js como fuente principal de datos
   - consumir /api/dashboard/summary normalizado por HomeApi
   - mantener fallback elegante a incidencias si el dashboard no trae tickets
   - Home para user/admin con la misma lógica
   - paginación visual fija a 5 incidencias por vista
   - render inicial inmediato
   - bind inmediato tras primer render
   - refresh con loader suave
   - apertura de incidencia con estado visual de loading
   - apertura de modal de creación de incidencia
   - navegación por accesos rápidos
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro

   HARDENING PRO:
   - View = UX, render, eventos y bridges
   - API = request, normalización, dashboard summary y collections
   - estado local autocontenido
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback si /api/dashboard/summary no entrega tickets
   - anti spam click en crear incidencia
   - compatible con template data-home-action y data-action
   - no escanea endpoints opcionales desde la vista
========================================================= */

import { AppCore } from "../../core/index.js";

import renderHomeTemplate from "./home.template.js";

import {
  loadHomeDashboard,
  refreshHomeDashboard,
  hydrateHomeFromCache as hydrateHomeApiFromCache,
  normalizeHomeDashboardResponse,
  getHomeApiSnapshot,
} from "./home.api.js";

import {
  loadIncidencias,
  hydrateFromCache as hydrateIncidenciasFromCache,
} from "../incidencias/incidencias.api.js";

import {
  getIncidencias,
} from "../incidencias/incidencias.store.js";

import {
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

  const PAGE_SIZE = 5;
  const CREATE_CLICK_THROTTLE_MS = 450;

  const HOME_CACHE_KEY = "onion.home.view.cache.v2";
  const HOME_CACHE_TTL_MS = 1000 * 60 * 10;

  const ROUTE_ALIASES = Object.freeze({
    "/users": "/usuarios",
    "/user": "/usuarios",
    "/clients": "/clientes",
    "/client": "/clientes",
    "/customers": "/clientes",
    "/customer": "/clientes",
    "/account": "/cuenta",
    "/profile": "/cuenta",
    "/settings": "/ajustes",
  });

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

    requestId: "",
    lastSyncAt: "",

    dashboard: {},
    summary: {},
    widgets: [],

    tickets: [],
    invoices: [],
    users: [],
    clients: [],
    activity: [],
  };

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

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
    return isObject(value) ? value : {};
  }

  function hasOwnKeys(value = {}) {
    return Boolean(
      isObject(value) &&
        Object.keys(value).length
    );
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

      if (isObject(value) && Object.keys(value).length === 0) {
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
      .replace(/[^a-z0-9_:.]/g, "")
      .trim();
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return String(Date.now());
    }
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[HomeView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[HomeView]", ...args);
    } catch {}

    try {
      console.warn("[HomeView]", ...args);
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
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
          })
        );

        return true;
      }
    } catch {}

    return false;
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (!isBrowser()) {
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

  function getContainer() {
    if (!isBrowser()) {
      return null;
    }

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
     TOAST BRIDGE
  ========================================================= */

  function normalizeToastType(type = "info") {
    const key = normalizeKey(type);

    if (key === "warn") {
      return "warning";
    }

    if (
      [
        "success",
        "error",
        "warning",
        "info",
        "loading",
      ].includes(key)
    ) {
      return key;
    }

    return "info";
  }

  function getToastCandidates() {
    const candidates = [];

    try {
      if (isFunction(AppCore?.modules?.get)) {
        candidates.push(AppCore.modules.get("toast"));
        candidates.push(AppCore.modules.get("Toast"));
      }
    } catch {}

    try {
      if (AppCore?.toast) candidates.push(AppCore.toast);
    } catch {}

    try {
      if (AppCore?.ui?.toast) candidates.push(AppCore.ui.toast);
    } catch {}

    try {
      if (isBrowser() && window.Toast) candidates.push(window.Toast);
    } catch {}

    try {
      if (isBrowser() && window.OnionToast) candidates.push(window.OnionToast);
    } catch {}

    return candidates.filter(Boolean);
  }

  function showToast(message = "", type = "info", options = {}) {
    const text = safeText(message, "");
    if (!text) return false;

    const toastType = normalizeToastType(type);
    const opts = safeObject(options);

    const payload = {
      ...opts,
      type: toastType,
      message: text,
    };

    for (const toast of getToastCandidates()) {
      try {
        const directMethod =
          toastType === "warning"
            ? toast.warning || toast.warn
            : toast?.[toastType];

        if (isFunction(directMethod)) {
          directMethod.call(toast, text, opts);
          return true;
        }
      } catch {}

      try {
        if (isFunction(toast?.show)) {
          toast.show(payload);
          return true;
        }
      } catch {}
    }

    try {
      safeEmit(`toast:${toastType}`, payload);
      return true;
    } catch {}

    try {
      const logger =
        toastType === "error"
          ? console.error
          : toastType === "warning"
            ? console.warn
            : console.log;

      logger(`[HomeToast:${toastType}]`, text);
    } catch {}

    return false;
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
        AppCore?.state?.session?.user,
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
        AppCore?.state?.session?.role,
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
      isBrowser() &&
        document.body &&
        document.readyState !== "loading"
    );
  }

  function isAppReady() {
    const state = safeObject(AppCore?.state);

    const knownReadyKeys = [
      "ready",
      "booted",
      "initialized",
      "bootCompleted",
      "appReady",
    ];

    const hasReadyMarker = knownReadyKeys.some((key) => key in state);

    if (!hasReadyMarker) {
      return true;
    }

    return Boolean(
      state.ready ||
        state.booted ||
        state.initialized ||
        state.bootCompleted ||
        state.appReady
    );
  }

  function canInteract() {
    return (
      !destroyed &&
      isDomReady() &&
      isAppReady()
    );
  }

  function throttleCreateClick() {
    const current = Date.now();

    if (current - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = current;
    return true;
  }

  /* =========================================================
     ROUTES
  ========================================================= */

  function normalizeRoute(route = "") {
    const raw = safeText(route, "");

    if (!raw) return "";

    const lowered = raw.toLowerCase();

    if (
      lowered.startsWith("javascript:") ||
      lowered.startsWith("mailto:") ||
      lowered.startsWith("tel:")
    ) {
      return "";
    }

    if (/^https?:\/\//i.test(raw)) {
      try {
        if (
          isBrowser() &&
          new URL(raw).origin !== window.location.origin
        ) {
          return raw;
        }

        return new URL(raw).pathname || "/";
      } catch {
        return raw;
      }
    }

    const normalized = raw.startsWith("/") ? raw : `/${raw}`;
    const clean = normalized.replace(/\/{2,}/g, "/");

    return ROUTE_ALIASES[clean] || clean;
  }

  /* =========================================================
     CACHE
  ========================================================= */

  function readCachePayload() {
    if (!isBrowser()) {
      return null;
    }

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
    if (!isBrowser()) {
      return false;
    }

    try {
      const payload = {
        savedAt: Date.now(),
        state: {
          dashboard: homeState.dashboard,
          summary: homeState.summary,
          widgets: homeState.widgets,

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

          requestId: homeState.requestId,
          lastSyncAt: homeState.lastSyncAt,
        },
      };

      window.localStorage.setItem(
        HOME_CACHE_KEY,
        JSON.stringify(payload)
      );

      return true;
    } catch {
      return false;
    }
  }

  function hydrateLocalHomeCache() {
    const payload = readCachePayload();
    const state = safeObject(payload?.state);

    if (!hasOwnKeys(state)) {
      return false;
    }

    homeState.dashboard = safeObject(state.dashboard);
    homeState.summary = safeObject(state.summary);
    homeState.widgets = safeArray(state.widgets);

    homeState.tickets = safeArray(state.tickets);
    homeState.invoices = safeArray(state.invoices);
    homeState.users = safeArray(state.users);
    homeState.clients = safeArray(state.clients);
    homeState.activity = safeArray(state.activity);

    homeState.remoteCount = safeNumber(
      state.remoteCount,
      homeState.tickets.length
    );

    homeState.ticketsRemoteCount = safeNumber(
      state.ticketsRemoteCount,
      homeState.tickets.length
    );

    homeState.invoicesRemoteCount = safeNumber(
      state.invoicesRemoteCount,
      homeState.invoices.length
    );

    homeState.usersRemoteCount = safeNumber(
      state.usersRemoteCount,
      homeState.users.length
    );

    homeState.clientsRemoteCount = safeNumber(
      state.clientsRemoteCount,
      homeState.clients.length
    );

    homeState.requestId = safeText(state.requestId, "");
    homeState.lastSyncAt = safeText(state.lastSyncAt, "");

    homeState.hydrated = true;

    homeState.loaded = Boolean(
      homeState.tickets.length ||
        homeState.invoices.length ||
        homeState.users.length ||
        homeState.clients.length ||
        homeState.activity.length ||
        hasOwnKeys(homeState.summary) ||
        hasOwnKeys(homeState.dashboard)
    );

    return homeState.loaded;
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      const apiCache = hydrateHomeApiFromCache?.();

      if (apiCache?.dashboard && hasOwnKeys(apiCache.dashboard)) {
        syncDashboardPayload(apiCache.dashboard, {
          requestId: apiCache.requestId || "",
          lastSyncAt: apiCache.lastSyncAt || "",
          writeCache: false,
        });

        hydrated = true;
      }
    } catch {}

    try {
      hydrated = hydrateLocalHomeCache() || hydrated;
    } catch {}

    try {
      hydrateIncidenciasFromCache?.();
      hydrated = true;
    } catch {}

    try {
      const tickets = getTicketsFromStore();

      if (tickets.length && !homeState.tickets.length) {
        homeState.tickets = tickets;

        homeState.ticketsRemoteCount = Math.max(
          homeState.ticketsRemoteCount,
          tickets.length
        );

        homeState.remoteCount = Math.max(
          homeState.remoteCount,
          tickets.length
        );

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

  function getStableTicketId(item = {}) {
    return safeText(
      first(
        item?.ticketId,
        item?.incidenciaId,
        item?.id,
        item?.code,
        item?.numero,
        item?.ticketCode,
        item?.raw?.ticketId,
        item?.raw?.incidenciaId,
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

  function normalizeTickets(items = []) {
    try {
      const normalized = normalizeIncidenciasCollection(safeArray(items));
      return sortIncidenciasByUpdatedDesc(normalized);
    } catch {
      return safeArray(items);
    }
  }

  function getTicketsFromStore() {
    try {
      const rawItems = safeArray(getIncidencias());
      return normalizeTickets(rawItems);
    } catch (error) {
      safeWarn("getTicketsFromStore falló:", error);
      return safeArray(homeState.tickets);
    }
  }

  function getTickets() {
    const stateTickets = normalizeTickets(homeState.tickets);

    if (stateTickets.length) {
      return stateTickets;
    }

    const storeTickets = getTicketsFromStore();

    if (storeTickets.length) {
      return storeTickets;
    }

    return [];
  }

  function buildCollectionInput(items = [], remoteCount = 0) {
    const list = safeArray(items);

    return {
      items: list,
      rows: list,
      data: list,
      total: Math.max(list.length, safeNumber(remoteCount, list.length)),
      count: list.length,
      remoteCount: Math.max(list.length, safeNumber(remoteCount, list.length)),
    };
  }

  function normalizePaginationResult(result = {}, sourceItems = []) {
    const rows = safeArray(sourceItems);
    const data = safeObject(result);

    const items = safeArray(
      first(
        data.items,
        data.pageItems,
        data.rows,
        data.data,
        []
      )
    );

    const page = Math.max(
      1,
      safeNumber(
        first(data.page, data.currentPage),
        homeState.page || 1
      )
    );

    const pageSize = Math.max(
      1,
      safeNumber(
        first(data.pageSize, data.limit),
        homeState.pageSize || PAGE_SIZE
      )
    );

    const total = Math.max(
      rows.length,
      safeNumber(
        first(data.total, data.totalCount),
        rows.length
      )
    );

    const totalPages = Math.max(
      1,
      safeNumber(
        first(data.totalPages, data.pages),
        Math.ceil((total || 1) / pageSize)
      )
    );

    return {
      ...data,
      items,
      page: Math.min(page, totalPages),
      pageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };
  }

  function getPaginationMeta(items = []) {
    const rows = safeArray(items);
    const page = safeNumber(homeState.page, 1);
    const pageSize = safeNumber(homeState.pageSize, PAGE_SIZE);

    try {
      const result = paginateIncidencias(
        rows,
        page,
        pageSize || PAGE_SIZE
      );

      return normalizePaginationResult(result, rows);
    } catch {
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
        hasPrev: nextPage > 1,
        hasNext: nextPage < totalPages,
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
          action: "open-invoice",
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

  function syncDashboardPayload(payload = null, options = {}) {
    const opts = safeObject(options);
    const normalizedResponse = normalizeHomeDashboardResponse(payload);
    const dashboard = safeObject(normalizedResponse.dashboard);

    const tickets = normalizeTickets(
      first(
        dashboard.tickets,
        dashboard.incidencias,
        normalizedResponse.tickets,
        normalizedResponse.incidencias,
        []
      )
    );

    const invoices = safeArray(
      first(
        dashboard.facturas,
        dashboard.invoices,
        normalizedResponse.facturas,
        normalizedResponse.invoices,
        []
      )
    );

    const users = safeArray(
      first(
        dashboard.users,
        dashboard.usuarios,
        normalizedResponse.users,
        normalizedResponse.usuarios,
        []
      )
    );

    const clients = safeArray(
      first(
        dashboard.clients,
        dashboard.clientes,
        normalizedResponse.clients,
        normalizedResponse.clientes,
        []
      )
    );

    const activity = safeArray(
      first(
        dashboard.activity,
        dashboard.recentActivity,
        dashboard.recent,
        normalizedResponse.activity,
        normalizedResponse.recent,
        []
      )
    );

    const summary = safeObject(
      first(
        dashboard.summary,
        normalizedResponse.summary,
        {}
      )
    );

    homeState.dashboard = dashboard;
    homeState.summary = summary;
    homeState.widgets = safeArray(dashboard.widgets);

    homeState.tickets = tickets;
    homeState.invoices = invoices;
    homeState.users = users;
    homeState.clients = clients;

    homeState.remoteCount = Math.max(
      tickets.length,
      safeNumber(
        first(
          dashboard.ticketsTotal,
          dashboard.incidenciasTotal,
          summary.totalTickets,
          summary.ticketsTotal,
          summary.incidenciasTotal
        ),
        tickets.length
      )
    );

    homeState.ticketsRemoteCount = homeState.remoteCount;

    homeState.invoicesRemoteCount = Math.max(
      invoices.length,
      safeNumber(
        first(
          dashboard.facturasTotal,
          dashboard.invoicesTotal,
          summary.totalInvoices,
          summary.invoicesTotal,
          summary.facturasTotal
        ),
        invoices.length
      )
    );

    homeState.usersRemoteCount = Math.max(
      users.length,
      safeNumber(
        first(
          dashboard.usersTotal,
          dashboard.usuariosTotal,
          summary.usersCount,
          summary.usuariosCount
        ),
        users.length
      )
    );

    homeState.clientsRemoteCount = Math.max(
      clients.length,
      safeNumber(
        first(
          dashboard.clientsTotal,
          dashboard.clientesTotal,
          summary.clientsCount,
          summary.clientesCount
        ),
        clients.length
      )
    );

    homeState.activity = activity.length
      ? activity
      : buildActivityFromData();

    homeState.requestId = safeText(
      first(
        opts.requestId,
        normalizedResponse.requestId,
        dashboard.requestId,
        ""
      ),
      ""
    );

    homeState.lastSyncAt = safeText(
      first(
        opts.lastSyncAt,
        dashboard.updatedAt,
        dashboard.generatedAt,
        dashboard.meta?.updatedAt,
        nowIso()
      ),
      nowIso()
    );

    homeState.loaded = true;
    homeState.hydrated = true;
    homeState.error = "";

    if (opts.writeCache !== false) {
      writeCachePayload();
    }

    return dashboard;
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

    homeState.dashboard = safeObject(homeState.dashboard);
    homeState.summary = safeObject(homeState.summary);
    homeState.widgets = safeArray(homeState.widgets);

    homeState.tickets = safeArray(homeState.tickets);
    homeState.invoices = safeArray(homeState.invoices);
    homeState.users = safeArray(homeState.users);
    homeState.clients = safeArray(homeState.clients);
    homeState.activity = safeArray(homeState.activity);

    homeState.remoteCount = Math.max(0, safeNumber(homeState.remoteCount, 0));

    homeState.ticketsRemoteCount = Math.max(
      0,
      safeNumber(homeState.ticketsRemoteCount, homeState.tickets.length)
    );

    homeState.invoicesRemoteCount = Math.max(
      0,
      safeNumber(homeState.invoicesRemoteCount, homeState.invoices.length)
    );

    homeState.usersRemoteCount = Math.max(
      0,
      safeNumber(homeState.usersRemoteCount, homeState.users.length)
    );

    homeState.clientsRemoteCount = Math.max(
      0,
      safeNumber(homeState.clientsRemoteCount, homeState.clients.length)
    );

    homeState.requestId = safeText(homeState.requestId, "");
    homeState.lastSyncAt = safeText(homeState.lastSyncAt, "");

    return homeState;
  }

  function markIdle() {
    homeState.loading = false;
    homeState.refreshing = false;
  }

  function markLoadedOk() {
    const tickets = getTickets();

    homeState.tickets = tickets;

    homeState.remoteCount = Math.max(
      homeState.remoteCount,
      tickets.length
    );

    homeState.ticketsRemoteCount = Math.max(
      homeState.ticketsRemoteCount,
      tickets.length
    );

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
    try {
      if (isFunction(AppCore?.modules?.get)) {
        const routerModule =
          AppCore.modules.get("router") ||
          AppCore.modules.get("Router");

        if (routerModule) return routerModule;
      }
    } catch {}

    try {
      return (
        AppCore?.router ||
        AppCore?.Router ||
        AppCore?.modules?.router ||
        AppCore?.modules?.Router ||
        (isBrowser() ? window.Router : null) ||
        (isBrowser() ? window.OnionRouter : null) ||
        null
      );
    } catch {
      return null;
    }
  }

  async function navigateTo(route = "", options = {}) {
    const target = normalizeRoute(route);
    if (!target) return false;

    const opts = safeObject(options);
    const router = getRouterCandidate();

    try {
      if (isFunction(router?.navigate)) {
        router.navigate(target, opts);
        return true;
      }

      if (isFunction(router?.go)) {
        router.go(target, opts);
        return true;
      }

      if (isFunction(router?.push)) {
        router.push(target, opts);
        return true;
      }

      if (isFunction(AppCore?.navigate)) {
        AppCore.navigate(target, opts);
        return true;
      }
    } catch (error) {
      safeWarn("navigateTo vía router falló:", error);
    }

    try {
      if (isBrowser()) {
        window.history.pushState({}, "", target);
        window.dispatchEvent(new PopStateEvent("popstate"));
        return true;
      }
    } catch {}

    try {
      if (isBrowser()) {
        window.location.assign(target);
        return true;
      }
    } catch {}

    return false;
  }

  function openTicketModalBridge(detail = null) {
    if (!detail) return false;

    try {
      if (isBrowser()) {
        const modal = window.OnionIncidenciasModal;

        if (modal?.getState?.()?.isOpen && isFunction(modal.update)) {
          modal.update(detail);
          return true;
        }

        if (isFunction(modal?.open)) {
          modal.open(detail);
          return true;
        }
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal hook falló:", error);
    }

    try {
      if (isBrowser()) {
        const hook =
          window.renderIncidenciaTicketModal ||
          window.renderTicketModal;

        if (isFunction(hook)) {
          hook(detail);
          return true;
        }
      }
    } catch (error) {
      safeWarn("ticket modal hook falló:", error);
    }

    safeEmit("incidencias:modal:open", {
      detail,
    });

    return true;
  }

  function openCreateModalBridge(draft = {}) {
    try {
      if (isBrowser()) {
        const modal = window.OnionIncidenciasCreateModal;

        if (isFunction(modal?.open)) {
          modal.open(draft);
          return true;
        }
      }
    } catch (error) {
      safeWarn("OnionIncidenciasCreateModal hook falló:", error);
    }

    try {
      if (isBrowser()) {
        const hook =
          window.renderIncidenciasCreateModal ||
          window.renderIncidenciaCreateModal;

        if (isFunction(hook)) {
          hook(draft);
          return true;
        }
      }
    } catch (error) {
      safeWarn("create modal global hook falló:", error);
    }

    try {
      if (isFunction(IncidenciasCreateView?.open)) {
        IncidenciasCreateView.open(draft);
        return true;
      }
    } catch (error) {
      safeWarn("IncidenciasCreateView.open falló:", error);
    }

    safeEmit("incidencias:create-modal:open", {
      draft,
    });

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

    const ticketsInput = buildCollectionInput(tickets, remoteCount);
    const invoicesInput = buildCollectionInput(
      homeState.invoices,
      homeState.invoicesRemoteCount
    );
    const usersInput = buildCollectionInput(
      homeState.users,
      homeState.usersRemoteCount
    );
    const clientsInput = buildCollectionInput(
      homeState.clients,
      homeState.clientsRemoteCount
    );
    const activityInput = buildCollectionInput(activity, activity.length);

    return `
      <section class="panel-content dashboard ready" data-view="home">
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);">
          ${renderHomeTemplate({
            user,
            role,

            dashboard: homeState.dashboard,
            summary: homeState.summary,
            widgets: homeState.widgets,

            tickets: ticketsInput,
            incidencias: ticketsInput,

            facturas: invoicesInput,
            invoices: invoicesInput,

            users: usersInput,
            usuarios: usersInput,

            clients: clientsInput,
            clientes: clientsInput,

            activity: activityInput,
            recentActivity: activityInput,

            totalCount: remoteCount,
            remoteCount,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages: pagination.totalPages,

            requestId: homeState.requestId,
            lastUpdatedAt: homeState.lastSyncAt || "",

            state: {
              ...homeState,
              user,
              role,

              items: tickets,
              tickets: ticketsInput,
              incidencias: ticketsInput,

              facturas: invoicesInput,
              invoices: invoicesInput,

              users: usersInput,
              usuarios: usersInput,

              clients: clientsInput,
              clientes: clientsInput,

              activity: activityInput,
              recentActivity: activityInput,

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

  async function loadTicketsFallback({
    force = false,
  } = {}) {
    try {
      await loadIncidencias({
        force,
      });

      const tickets = getTicketsFromStore();

      if (tickets.length) {
        homeState.tickets = tickets;

        homeState.ticketsRemoteCount = Math.max(
          tickets.length,
          homeState.ticketsRemoteCount
        );

        homeState.remoteCount = Math.max(
          tickets.length,
          homeState.remoteCount
        );

        homeState.activity = buildActivityFromData();
      }

      return tickets;
    } catch (error) {
      safeWarn("Fallback incidencias falló:", error);
      return getTickets();
    }
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
      homeState.activity.length ||
      hasOwnKeys(homeState.summary);

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
      const dashboard = asRefresh
        ? await refreshHomeDashboard({
            force: true,
            returnStaleOnError: true,
          })
        : await loadHomeDashboard({
            force,
            returnStaleOnError: true,
          });

      syncDashboardPayload(dashboard, {
        lastSyncAt: nowIso(),
        writeCache: true,
      });

      if (!homeState.tickets.length) {
        await loadTicketsFallback({
          force,
        });
      }

      homeState.activity = homeState.activity.length
        ? homeState.activity
        : buildActivityFromData();

      homeState.lastSyncAt = homeState.lastSyncAt || nowIso();

      markLoadedOk();
      writeCachePayload();

      return getTickets();
    } catch (error) {
      const message = safeErrorMessage(error);

      await loadTicketsFallback({
        force,
      });

      const recoveredTickets = getTickets();

      if (recoveredTickets.length) {
        homeState.error = "";
        homeState.loaded = true;
        homeState.hydrated = true;
        homeState.activity = buildActivityFromData();
        homeState.lastSyncAt = homeState.lastSyncAt || nowIso();

        markIdle();
        writeCachePayload();

        return recoveredTickets;
      }

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

    const totalPages = Math.max(
      1,
      safeNumber(pagination.totalPages, 1)
    );

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
    const nextSize = Math.max(
      1,
      safeNumber(value, PAGE_SIZE)
    );

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
    const target = normalizeRoute(route);

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
        facturaId: id,
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

    if (action === "open-invoice" && entityId) {
      return handleOpenInvoice(entityId);
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

    return normalizeRoute(
      first(
        element.dataset?.route,
        element.dataset?.href,
        element.getAttribute?.("data-route"),
        element.getAttribute?.("data-href"),
        element.getAttribute?.("href")
      )
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
        "navigate-home",
        "go-home",
        "go-incidencias",
        "go-users",
        "go-usuarios",
        "go-clientes",
        "go-clients",
        "go-account",
        "go-cuenta",
        "go-settings",
        "go-ajustes",
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
          payload.incidenciaId ||
          payload.detail?.ticketId ||
          payload.detail?.incidenciaId ||
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
      bus.on("usuarios:update:success", onMutated);

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
      try { bus.off("usuarios:update:success", onMutated); } catch {}

      try { bus.off("home:ticket:open", onRefreshTicket); } catch {}

      try { bus.off("app:ready", onReady); } catch {}
      try { bus.off("app:boot:ready", onReady); } catch {}
      try { bus.off("app:boot:complete", onReady); } catch {}
      try { bus.off("router:rendered", onReady); } catch {}
    };
  }

  function bindWindowEvents() {
    if (!isBrowser()) {
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

    const onOpenTicket = async (event) => {
      const payload = getEventPayload(event);

      await handleOpenTicket(
        payload.ticketId ||
          payload.incidenciaId ||
          payload.detail?.ticketId ||
          payload.detail?.incidenciaId ||
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
      window.addEventListener("usuarios:update:success", onMutated);

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
        window.removeEventListener("usuarios:update:success", onMutated);

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
    inflightInit = null;
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

    bind,

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
    getDashboard: () => safeObject(homeState.dashboard),
    getSummary: () => safeObject(homeState.summary),
    getWidgets: () => safeArray(homeState.widgets),

    getPageItems: () => getPaginationMeta(getTickets()).items,
    getPagination: () => getPaginationMeta(getTickets()),

    getTicketById: (ticketId = "") =>
      findIncidenciaById(getTickets(), ticketId),

    getHomeApiSnapshot,

    getState: () => ({
      ...homeState,
      user: getCurrentUser(),
      role: getCurrentRole(),
      initialized,
      destroyed,
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      pendingCreateRequest,
      apiSnapshot: getHomeApiSnapshot?.(),
    }),

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  try {
    if (isBrowser()) {
      window.OnionHomeView = api;
    }
  } catch {}

  return api;
})();

export default HomeView;

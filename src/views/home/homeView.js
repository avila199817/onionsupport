/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/homeView.js

   HOME EXPERIENCE MODE · USER + ADMIN · DASHBOARD API FIRST
   EXTREME PRO SYSTEM · FINAL PATCH 12/10

   RESPONSABILIDADES:
   - punto de entrada real de la vista Home
   - render principal con template unificado home.template.js
   - usar home.api.js como fuente principal de datos
   - consumir /api/dashboard/summary normalizado por HomeApi
   - mantener fallback elegante a incidencias si dashboard no trae tickets
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
   - registrar bridge público para topbar/global search
   - preservar datos de dashboard y fallback de incidencias
   - evitar que refresh empobrezca el Home si API devuelve parcial
   - trabajar alineado con el template Home premium

   HARDENING PRO:
   - View = UX, render, eventos y bridges
   - API = request, normalización, dashboard summary y collections
   - estado local autocontenido
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback si /api/dashboard/summary no entrega tickets
   - anti spam click en crear incidencia
   - anti spam apertura rápida de tickets
   - compatible con template data-home-action y data-action
   - no escanea endpoints opcionales desde la vista
   - reload con cola segura
   - eventos AppCore + window
   - bridge AppCore.modules + window
   - modal directo por import + fallback global
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
import { OnionIncidenciasModal } from "../incidencias/incidencias.modal.js";

export const HomeView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:home";

  const PAGE_SIZE = 5;
  const CREATE_CLICK_THROTTLE_MS = 450;
  const OPEN_TICKET_THROTTLE_MS = 350;

  const HOME_CACHE_KEY = "onion.home.view.cache.v3";
  const HOME_CACHE_TTL_MS = 1000 * 60 * 10;

  const ROUTES = Object.freeze({
    HOME: "/",
    INCIDENCIAS: "/incidencias",
    FACTURAS: "/facturas",
    USUARIOS: "/usuarios",
    CLIENTES: "/clientes",
    CUENTA: "/cuenta",
    AJUSTES: "/ajustes",
  });

  const ROUTE_ALIASES = Object.freeze({
    "/home": "/",
    "/dashboard": "/",

    "/tickets": "/incidencias",
    "/ticket": "/incidencias",
    "/incidents": "/incidencias",
    "/incident": "/incidencias",
    "/issues": "/incidencias",
    "/issue": "/incidencias",

    "/invoices": "/facturas",
    "/invoice": "/facturas",
    "/bills": "/facturas",
    "/bill": "/facturas",
    "/billing": "/facturas",

    "/users": "/usuarios",
    "/user": "/usuarios",
    "/members": "/usuarios",
    "/member": "/usuarios",

    "/clients": "/clientes",
    "/client": "/clientes",
    "/customers": "/clientes",
    "/customer": "/clientes",

    "/account": "/cuenta",
    "/profile": "/cuenta",

    "/settings": "/ajustes",
  });

  const HOME_RELOAD_EVENTS = Object.freeze([
    "home:reload",
    "dashboard:reload",
    "dashboard:summary:updated",

    "incidencias:create:success",
    "incidencias:modal:updated",
    "incidencias:ticket:updated",
    "incidencias:upload:success",
    "incidencias:comment:success",
    "incidencias:reopen:success",
    "incidencias:delete:success",
    "incidencias:status:changed",

    "facturas:create:success",
    "facturas:update:success",
    "facturas:delete:success",

    "clientes:create:success",
    "clientes:update:success",
    "clientes:delete:success",

    "users:create:success",
    "users:update:success",
    "users:delete:success",
    "usuarios:create:success",
    "usuarios:update:success",
    "usuarios:delete:success",
  ]);

  const HOME_OPEN_TICKET_EVENTS = Object.freeze([
    "home:ticket:open",
    "home:incidencia:open",
    "home:open-ticket",
    "home:open-incidencia",

    "topbar:search:open-ticket",
    "topbar:search:open-incidencia",
    "search:open-ticket",
    "search:open-incidencia",
    "global-search:open-ticket",
    "global-search:open-incidencia",
  ]);

  const READY_EVENTS = Object.freeze([
    "app:ready",
    "app:boot:ready",
    "app:boot:complete",
    "router:rendered",
  ]);

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let inflightOpenTicket = null;

  let queuedReloadOptions = null;

  let bindingsCleanup = null;
  let bridgeCleanup = null;

  let renderToken = 0;

  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;
  let lastOpenTicketClickAt = 0;

  let inflightOpenTicketId = "";

  const homeState = {
    hydrated: false,
    loaded: false,

    loading: false,
    refreshing: false,
    creating: false,

    openingTicketId: "",
    selectedTicketId: "",
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

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value === "string") {
      let normalized = value
        .trim()
        .replace(/€/g, "")
        .replace(/\$/g, "")
        .replace(/£/g, "")
        .replace(/%/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s/g, "");

      const hasComma = normalized.includes(",");
      const hasDot = normalized.includes(".");

      if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(",");
        const lastDot = normalized.lastIndexOf(".");

        if (lastComma > lastDot) {
          normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
        } else {
          normalized = normalized.replace(/,/g, "");
        }
      } else if (hasComma) {
        normalized = normalized.replace(/,/g, ".");
      }

      const parsed = Number(normalized);

      return Number.isFinite(parsed) ? parsed : fallback;
    }

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

  function normalizeText(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value = "") {
    return normalizeText(value)
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .replace(/^_+|_+$/g, "");
  }

  function uniqueStrings(values = []) {
    return [
      ...new Set(
        safeArray(values)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .map((value) => safeText(value, ""))
          .filter(Boolean)
      ),
    ];
  }

  function uniqueBy(items = [], picker = (item) => item) {
    const rows = safeArray(items);
    const seen = new Set();
    const output = [];

    for (const item of rows) {
      const key = safeText(picker(item), "");

      if (!key) {
        output.push(item);
        continue;
      }

      const normalized = normalizeText(key);

      if (seen.has(normalized)) continue;

      seen.add(normalized);
      output.push(item);
    }

    return output;
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return String(Date.now());
    }
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

  function getEventPayload(eventOrPayload = {}) {
    if (
      typeof eventOrPayload === "string" ||
      typeof eventOrPayload === "number"
    ) {
      return {
        ticketId: safeText(eventOrPayload, ""),
      };
    }

    return safeObject(
      first(
        eventOrPayload?.detail?.payload,
        eventOrPayload?.detail,
        eventOrPayload?.payload,
        eventOrPayload
      )
    );
  }

  function sameIdentity(a = "", b = "") {
    const left = normalizeText(a);
    const right = normalizeText(b);

    return Boolean(left && right && left === right);
  }

  /* =========================================================
     LOG / EVENTS
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

    try {
      console.warn("[HomeView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    let emitted = false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  function safeOn(event = "", handler = null) {
    const eventName = safeText(event, "");

    if (!eventName || !isFunction(handler)) {
      return () => {};
    }

    let busAttached = false;
    let windowAttached = false;
    let busCleanup = null;

    const windowHandler = (domEvent) => handler(domEvent);

    try {
      const maybeCleanup = AppCore?.events?.on?.(eventName, handler);

      if (isFunction(maybeCleanup)) {
        busCleanup = maybeCleanup;
      }

      busAttached = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.addEventListener(eventName, windowHandler);
        windowAttached = true;
      }
    } catch {}

    return () => {
      if (busCleanup) {
        try {
          busCleanup();
        } catch {}
      } else if (busAttached) {
        try {
          AppCore?.events?.off?.(eventName, handler);
        } catch {}
      }

      if (windowAttached) {
        try {
          window.removeEventListener(eventName, windowHandler);
        } catch {}
      }
    };
  }

  /* =========================================================
     TOAST BRIDGE
  ========================================================= */

  function normalizeToastType(type = "info") {
    const key = normalizeKey(type);

    if (key === "warn") return "warning";

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

    safeEmit(`toast:${toastType}`, payload);

    return true;
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
      "super_administrador",
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

  function throttleOpenTicketClick() {
    const current = Date.now();

    if (current - lastOpenTicketClickAt < OPEN_TICKET_THROTTLE_MS) {
      return false;
    }

    lastOpenTicketClickAt = current;
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

        const url = new URL(raw);

        return normalizeRoute(`${url.pathname}${url.search || ""}${url.hash || ""}`);
      } catch {
        return raw;
      }
    }

    const normalized = raw.startsWith("/") ? raw : `/${raw}`;
    const [pathWithMaybeQuery, hash = ""] = normalized.split("#");
    const [path, query = ""] = pathWithMaybeQuery.split("?");

    const cleanPath = path.replace(/\/{2,}/g, "/") || "/";
    const mappedPath = ROUTE_ALIASES[cleanPath] || cleanPath;

    return [
      mappedPath,
      query ? `?${query}` : "",
      hash ? `#${hash}` : "",
    ].join("");
  }

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
        await router.navigate(target, opts);
        return true;
      }

      if (isFunction(router?.go)) {
        await router.go(target, opts);
        return true;
      }

      if (isFunction(router?.push)) {
        await router.push(target, opts);
        return true;
      }

      if (isFunction(AppCore?.navigate)) {
        await AppCore.navigate(target, opts);
        return true;
      }
    } catch (error) {
      safeWarn("navigateTo vía router falló:", error);
    }

    try {
      if (isBrowser() && target.startsWith("/")) {
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

      if (apiCache?.dashboard || hasOwnKeys(apiCache)) {
        syncDashboardPayload(
          apiCache.dashboard || apiCache,
          {
            requestId: apiCache.requestId || "",
            lastSyncAt: apiCache.lastSyncAt || "",
            writeCache: false,
            preserveExisting: true,
          }
        );

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
     COLLECTION HELPERS
  ========================================================= */

  function unwrapCollectionPayload(value = null, depth = 0) {
    if (value === null || value === undefined) {
      return {};
    }

    if (depth > 10) {
      return value;
    }

    if (Array.isArray(value)) {
      return {
        items: value,
        total: value.length,
        count: value.length,
      };
    }

    const object = safeObject(value);

    if (!hasOwnKeys(object)) {
      return {};
    }

    if (
      Array.isArray(object.items) ||
      Array.isArray(object.rows) ||
      Array.isArray(object.data) ||
      Array.isArray(object.results) ||
      Array.isArray(object.records) ||
      Array.isArray(object.value) ||
      Array.isArray(object.docs) ||
      Array.isArray(object.documents) ||
      Array.isArray(object.collection) ||
      Array.isArray(object.list)
    ) {
      return object;
    }

    const directArray = first(
      object.tickets,
      object.incidencias,
      object.facturas,
      object.invoices,
      object.users,
      object.usuarios,
      object.clients,
      object.clientes,
      object.activity,
      object.activities,
      object.recent,
      object.recentActivity,
      object.timeline
    );

    if (Array.isArray(directArray)) {
      return {
        ...object,
        items: directArray,
        total: first(
          object.total,
          object.count,
          object.totalCount,
          object.remoteCount,
          directArray.length
        ),
      };
    }

    const nested = first(
      object.payload,
      object.result,
      object.response,
      object.body,
      object.content,
      object.data
    );

    if (isObject(nested) || Array.isArray(nested)) {
      return unwrapCollectionPayload(nested, depth + 1);
    }

    return object;
  }

  function normalizeCollection(value) {
    if (Array.isArray(value)) return value;

    const object = safeObject(unwrapCollectionPayload(value));

    return safeArray(
      first(
        object.items,
        object.rows,
        object.data,
        object.results,
        object.records,
        object.value,
        object.docs,
        object.documents,
        object.collection,
        object.list,
        []
      )
    );
  }

  function getRemoteCountFromCollection(value, fallback = 0) {
    const object = safeObject(unwrapCollectionPayload(value));

    return Math.max(
      fallback,
      safeNumber(
        first(
          object.totalCount,
          object.remoteCount,
          object.total,
          object.count,
          object.length,
          object.meta?.totalCount,
          object.meta?.remoteCount,
          object.meta?.total,
          object.meta?.count,
          object.pagination?.totalCount,
          object.pagination?.remoteCount,
          object.pagination?.total,
          object.pagination?.count,
          object.page?.total,
          object.pageInfo?.total,
          object.pageInfo?.totalCount,
          fallback
        ),
        fallback
      )
    );
  }

  function buildCollectionInput(items = [], remoteCount = 0) {
    const list = safeArray(items);
    const total = Math.max(
      list.length,
      safeNumber(remoteCount, list.length)
    );

    return {
      items: list,
      rows: list,
      data: list,
      results: list,
      total,
      count: list.length,
      totalCount: total,
      remoteCount: total,
    };
  }

  /* =========================================================
     DATA NORMALIZATION
  ========================================================= */

  function getStableTicketId(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return safeText(item, "");
    }

    return safeText(
      first(
        item?.ticketId,
        item?.incidenciaId,
        item?.id,
        item?._id,
        item?.code,
        item?.numero,
        item?.ticketCode,
        item?.entityId,

        item?.raw?.ticketId,
        item?.raw?.incidenciaId,
        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.code,
        item?.raw?.numero,
        item?.raw?.ticketCode,
        item?.raw?.entityId
      ),
      ""
    );
  }

  function getTicketIdentityList(item = {}) {
    if (typeof item === "string" || typeof item === "number") {
      return [safeText(item, "")].filter(Boolean);
    }

    return uniqueStrings([
      item.ticketId,
      item.incidenciaId,
      item.id,
      item._id,
      item.code,
      item.numero,
      item.ticketCode,
      item.entityId,

      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.id,
      item.raw?._id,
      item.raw?.code,
      item.raw?.numero,
      item.raw?.ticketCode,
      item.raw?.entityId,
    ]);
  }

  function getTicketUpdatedAt(item = {}) {
    return first(
      item.updatedAt,
      item.lastUpdateAt,
      item.ultimaNovedad,
      item.modifiedAt,
      item.closedAt,
      item.createdAt,
      item.lifecycle?.updatedAt,
      item.lifecycle?.lastUpdateAt,
      item.audit?.updatedAt,

      item.raw?.updatedAt,
      item.raw?.lastUpdateAt,
      item.raw?.ultimaNovedad,
      item.raw?.modifiedAt,
      item.raw?.closedAt,
      item.raw?.createdAt,
      item.raw?.lifecycle?.updatedAt,
      item.raw?.lifecycle?.lastUpdateAt,
      item.raw?.audit?.updatedAt
    );
  }

  function getTicketCreatedAt(item = {}) {
    return first(
      item.createdAt,
      item.fechaCreacion,
      item.createdAtES,
      item.date,
      item.lifecycle?.createdAt,

      item.raw?.createdAt,
      item.raw?.fechaCreacion,
      item.raw?.createdAtES,
      item.raw?.date,
      item.raw?.lifecycle?.createdAt
    );
  }

  function getTicketSubject(item = {}) {
    return safeText(
      first(
        item.subject,
        item.title,
        item.asunto,
        item.name,
        item.preview,

        item.raw?.subject,
        item.raw?.title,
        item.raw?.asunto,
        item.raw?.name,
        item.raw?.preview
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
        item.lifecycle?.status,

        item.raw?.status,
        item.raw?.estado,
        item.raw?.state,
        item.raw?.lifecycle?.status,

        "pending"
      ),
      "pending"
    );
  }

  function getTicketStatusKey(item = {}) {
    const key = normalizeKey(getTicketStatus(item));

    if (["pending", "pendiente", "new", "nueva", "nuevo", "created"].includes(key)) {
      return "pending";
    }

    if (["open", "opened", "abierta", "abierto"].includes(key)) {
      return "open";
    }

    if (
      [
        "progress",
        "in_progress",
        "inprogress",
        "en_proceso",
        "proceso",
        "working",
        "trabajando",
        "assigned",
        "asignada",
        "asignado",
      ].includes(key)
    ) {
      return "progress";
    }

    if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) {
      return "resolved";
    }

    if (
      [
        "closed",
        "close",
        "cerrada",
        "cerrado",
        "cancelled",
        "cancelada",
        "cancelado",
        "archived",
        "archivada",
        "archivado",
      ].includes(key)
    ) {
      return "closed";
    }

    return "pending";
  }

  function getTicketStatusLabel(item = {}) {
    const key = getTicketStatusKey(item);

    if (key === "open") return "Abierta";
    if (key === "pending") return "Pendiente";
    if (key === "progress") return "En proceso";
    if (key === "resolved") return "Resuelta";
    if (key === "closed") return "Cerrada";

    return safeText(getTicketStatus(item), "Pendiente");
  }

  function getInvoiceId(item = {}) {
    return safeText(
      first(
        item.invoiceId,
        item.facturaId,
        item.number,
        item.numero,
        item.numeroFacturaLegal,
        item.numeroFactura,
        item.code,
        item.id,
        item._id,

        item.raw?.invoiceId,
        item.raw?.facturaId,
        item.raw?.number,
        item.raw?.numero,
        item.raw?.numeroFacturaLegal,
        item.raw?.numeroFactura,
        item.raw?.code,
        item.raw?.id,
        item.raw?._id
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
        item.base,

        item.raw?.total,
        item.raw?.amount,
        item.raw?.importe,
        item.raw?.price,
        item.raw?.subtotal,
        item.raw?.base,

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
    const storeTickets = getTicketsFromStore();

    const merged = uniqueBy(
      [
        ...stateTickets,
        ...storeTickets,
      ],
      getStableTicketId
    );

    return normalizeTickets(merged);
  }

  function findTicketById(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) return null;

    return (
      getTickets().find((item) =>
        getTicketIdentityList(item).some((candidate) =>
          sameIdentity(candidate, id)
        )
      ) || null
    );
  }

  function getTicketIdFromPayload(payload = {}) {
    if (
      typeof payload === "string" ||
      typeof payload === "number"
    ) {
      return safeText(payload, "");
    }

    const source = safeObject(payload);
    const item = safeObject(source.item);
    const detail = safeObject(source.detail);
    const ticket = safeObject(source.ticket);
    const incidencia = safeObject(source.incidencia);
    const raw = safeObject(
      first(source.raw, item.raw, detail.raw, ticket.raw, incidencia.raw)
    );

    return safeText(
      first(
        source.ticketId,
        source.incidenciaId,
        source.id,
        source._id,
        source.entityId,
        source.value,
        source.key,
        source.code,
        source.ticketCode,

        detail.ticketId,
        detail.incidenciaId,
        detail.id,
        detail._id,
        detail.code,
        detail.ticketCode,

        ticket.ticketId,
        ticket.incidenciaId,
        ticket.id,
        ticket._id,
        ticket.code,
        ticket.ticketCode,

        incidencia.ticketId,
        incidencia.incidenciaId,
        incidencia.id,
        incidencia._id,
        incidencia.code,
        incidencia.ticketCode,

        item.entityId,
        item.ticketId,
        item.incidenciaId,
        item.id,
        item._id,
        item.value,
        item.key,
        item.code,
        item.ticketCode,

        raw.ticketId,
        raw.incidenciaId,
        raw.id,
        raw._id,
        raw.code,
        raw.ticketCode
      ),
      ""
    );
  }

  function buildActivityFromData() {
    const ticketActivity = getTickets()
      .slice(0, 8)
      .map((item) => {
        const ticketId = getStableTicketId(item);

        return {
          type: "ticket",
          title: getTicketSubject(item),
          text: `Incidencia ${ticketId || "sin ID"} · ${getTicketStatusLabel(item)}`,
          date: getTicketUpdatedAt(item) || getTicketCreatedAt(item),
          route: ROUTES.INCIDENCIAS,
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
            item.modifiedAt,
            item.createdAt,
            item.date,
            item.raw?.updatedAt,
            item.raw?.modifiedAt,
            item.raw?.createdAt,
            item.raw?.date
          ),
          route: ROUTES.FACTURAS,
          action: "open-invoice",
          entityId: invoiceId,
        };
      });

    const clientActivity = safeArray(homeState.clients)
      .slice(0, 3)
      .map((item) => ({
        type: "client",
        title: safeText(
          first(
            item.name,
            item.nombre,
            item.razonSocial,
            item.email,
            item.raw?.name,
            item.raw?.nombre,
            item.raw?.razonSocial,
            item.raw?.email
          ),
          "Cliente"
        ),
        text: "Cliente sincronizado en el panel.",
        date: first(
          item.updatedAt,
          item.createdAt,
          item.raw?.updatedAt,
          item.raw?.createdAt
        ),
        route: ROUTES.CLIENTES,
        action: "navigate-home",
        entityId: safeText(
          first(
            item.clienteId,
            item.clientId,
            item.customerId,
            item.id,
            item._id,
            item.email,
            item.raw?.clienteId,
            item.raw?.clientId,
            item.raw?.customerId,
            item.raw?.id,
            item.raw?._id,
            item.raw?.email
          ),
          ""
        ),
      }));

    const userActivity = safeArray(homeState.users)
      .slice(0, 3)
      .map((item) => ({
        type: "user",
        title: safeText(
          first(
            item.name,
            item.nombre,
            item.username,
            item.email,
            item.raw?.name,
            item.raw?.nombre,
            item.raw?.username,
            item.raw?.email
          ),
          "Usuario"
        ),
        text: "Usuario disponible en el sistema.",
        date: first(
          item.lastLoginAt,
          item.updatedAt,
          item.createdAt,
          item.raw?.lastLoginAt,
          item.raw?.updatedAt,
          item.raw?.createdAt
        ),
        route: ROUTES.USUARIOS,
        action: "navigate-home",
        entityId: safeText(
          first(
            item.userId,
            item.id,
            item._id,
            item.email,
            item.username,
            item.raw?.userId,
            item.raw?.id,
            item.raw?._id,
            item.raw?.email,
            item.raw?.username
          ),
          ""
        ),
      }));

    return [
      ...ticketActivity,
      ...invoiceActivity,
      ...clientActivity,
      ...userActivity,
    ]
      .filter((item) => item.title || item.text)
      .sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();

        return db - da;
      });
  }

  function syncDashboardPayload(payload = null, options = {}) {
    const opts = safeObject(options);

    const normalizedResponse = safeObject(
      normalizeHomeDashboardResponse?.(payload) || payload
    );

    const dashboard = safeObject(
      first(
        normalizedResponse.dashboard,
        normalizedResponse.data?.dashboard,
        normalizedResponse.payload?.dashboard,
        normalizedResponse.result?.dashboard,
        normalizedResponse
      )
    );

    const summary = safeObject(
      first(
        dashboard.summary,
        dashboard.stats,
        dashboard.metrics,
        dashboard.totals,
        dashboard.counts,

        normalizedResponse.summary,
        normalizedResponse.stats,
        normalizedResponse.metrics,
        normalizedResponse.totals,
        normalizedResponse.counts,

        {}
      )
    );

    const ticketsSource = first(
      dashboard.tickets,
      dashboard.incidencias,
      dashboard.supportTickets,
      dashboard.issues,

      normalizedResponse.tickets,
      normalizedResponse.incidencias,
      normalizedResponse.supportTickets,
      normalizedResponse.issues,

      normalizedResponse.data?.tickets,
      normalizedResponse.data?.incidencias,

      []
    );

    const invoicesSource = first(
      dashboard.facturas,
      dashboard.invoices,
      dashboard.billing,
      dashboard.bills,

      normalizedResponse.facturas,
      normalizedResponse.invoices,
      normalizedResponse.billing,
      normalizedResponse.bills,

      normalizedResponse.data?.facturas,
      normalizedResponse.data?.invoices,

      []
    );

    const usersSource = first(
      dashboard.users,
      dashboard.usuarios,
      dashboard.members,

      normalizedResponse.users,
      normalizedResponse.usuarios,
      normalizedResponse.members,

      normalizedResponse.data?.users,
      normalizedResponse.data?.usuarios,

      []
    );

    const clientsSource = first(
      dashboard.clients,
      dashboard.clientes,
      dashboard.customers,

      normalizedResponse.clients,
      normalizedResponse.clientes,
      normalizedResponse.customers,

      normalizedResponse.data?.clients,
      normalizedResponse.data?.clientes,

      []
    );

    const activitySource = first(
      dashboard.activity,
      dashboard.recentActivity,
      dashboard.recent,
      dashboard.activities,
      dashboard.timeline,

      normalizedResponse.activity,
      normalizedResponse.recentActivity,
      normalizedResponse.recent,
      normalizedResponse.activities,
      normalizedResponse.timeline,

      normalizedResponse.data?.activity,
      normalizedResponse.data?.recentActivity,

      []
    );

    const tickets = normalizeTickets(normalizeCollection(ticketsSource));
    const invoices = safeArray(normalizeCollection(invoicesSource));
    const users = safeArray(normalizeCollection(usersSource));
    const clients = safeArray(normalizeCollection(clientsSource));
    const activity = safeArray(normalizeCollection(activitySource));

    const preserveExisting = opts.preserveExisting !== false;

    homeState.dashboard = {
      ...(preserveExisting ? safeObject(homeState.dashboard) : {}),
      ...dashboard,
    };

    homeState.summary = {
      ...(preserveExisting ? safeObject(homeState.summary) : {}),
      ...summary,
    };

    const widgets = safeArray(
      first(
        dashboard.widgets,
        dashboard.cards,
        dashboard.kpis,
        normalizedResponse.widgets,
        normalizedResponse.cards,
        normalizedResponse.kpis,
        []
      )
    );

    if (widgets.length || !preserveExisting) {
      homeState.widgets = widgets;
    }

    if (tickets.length || !preserveExisting) {
      homeState.tickets = tickets;
    }

    if (invoices.length || !preserveExisting) {
      homeState.invoices = invoices;
    }

    if (users.length || !preserveExisting) {
      homeState.users = users;
    }

    if (clients.length || !preserveExisting) {
      homeState.clients = clients;
    }

    const ticketsRemoteCount = Math.max(
      homeState.tickets.length,
      getRemoteCountFromCollection(ticketsSource, homeState.tickets.length),
      safeNumber(
        first(
          dashboard.ticketsTotal,
          dashboard.incidenciasTotal,
          dashboard.totalTickets,
          dashboard.totalIncidencias,

          homeState.summary.totalTickets,
          homeState.summary.ticketsTotal,
          homeState.summary.incidenciasTotal,
          homeState.summary.totalIncidencias,
          homeState.summary.ticketsCount,
          homeState.summary.incidenciasCount,
          homeState.summary.tickets?.total,
          homeState.summary.incidencias?.total
        ),
        homeState.tickets.length
      )
    );

    const invoicesRemoteCount = Math.max(
      homeState.invoices.length,
      getRemoteCountFromCollection(invoicesSource, homeState.invoices.length),
      safeNumber(
        first(
          dashboard.facturasTotal,
          dashboard.invoicesTotal,
          dashboard.totalFacturas,
          dashboard.totalInvoices,

          homeState.summary.totalInvoices,
          homeState.summary.invoicesTotal,
          homeState.summary.facturasTotal,
          homeState.summary.totalFacturas,
          homeState.summary.invoicesCount,
          homeState.summary.facturasCount,
          homeState.summary.invoices?.total,
          homeState.summary.facturas?.total
        ),
        homeState.invoices.length
      )
    );

    const usersRemoteCount = Math.max(
      homeState.users.length,
      getRemoteCountFromCollection(usersSource, homeState.users.length),
      safeNumber(
        first(
          dashboard.usersTotal,
          dashboard.usuariosTotal,
          dashboard.totalUsers,
          dashboard.totalUsuarios,

          homeState.summary.usersCount,
          homeState.summary.usuariosCount,
          homeState.summary.totalUsers,
          homeState.summary.totalUsuarios,
          homeState.summary.users?.total,
          homeState.summary.usuarios?.total
        ),
        homeState.users.length
      )
    );

    const clientsRemoteCount = Math.max(
      homeState.clients.length,
      getRemoteCountFromCollection(clientsSource, homeState.clients.length),
      safeNumber(
        first(
          dashboard.clientsTotal,
          dashboard.clientesTotal,
          dashboard.customersTotal,
          dashboard.totalClients,
          dashboard.totalClientes,

          homeState.summary.clientsCount,
          homeState.summary.clientesCount,
          homeState.summary.customersCount,
          homeState.summary.totalClients,
          homeState.summary.totalClientes,
          homeState.summary.clients?.total,
          homeState.summary.clientes?.total
        ),
        homeState.clients.length
      )
    );

    homeState.remoteCount = Math.max(
      homeState.remoteCount,
      ticketsRemoteCount,
      homeState.tickets.length
    );

    homeState.ticketsRemoteCount = ticketsRemoteCount;
    homeState.invoicesRemoteCount = invoicesRemoteCount;
    homeState.usersRemoteCount = usersRemoteCount;
    homeState.clientsRemoteCount = clientsRemoteCount;

    if (activity.length || !preserveExisting) {
      homeState.activity = activity.length ? activity : buildActivityFromData();
    } else if (!homeState.activity.length) {
      homeState.activity = buildActivityFromData();
    }

    homeState.requestId = safeText(
      first(
        opts.requestId,
        normalizedResponse.requestId,
        normalizedResponse.id,
        dashboard.requestId,
        dashboard.meta?.requestId,
        homeState.requestId,
        ""
      ),
      ""
    );

    homeState.lastSyncAt = safeText(
      first(
        opts.lastSyncAt,
        normalizedResponse.lastSyncAt,
        normalizedResponse.updatedAt,
        normalizedResponse.generatedAt,
        dashboard.updatedAt,
        dashboard.generatedAt,
        dashboard.meta?.updatedAt,
        homeState.lastSyncAt,
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

    return homeState.dashboard;
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
    homeState.selectedTicketId = safeText(homeState.selectedTicketId, "");
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

    if (!homeState.activity.length) {
      homeState.activity = buildActivityFromData();
    }

    homeState.loaded = true;
    homeState.hydrated = true;
    homeState.error = "";

    markIdle();
  }

  function clearTransientState() {
    homeState.creating = false;
    homeState.openingTicketId = "";
    homeState.selectedTicketId = "";
    homeState.navigatingAction = "";
  }

  /* =========================================================
     PAGINATION
  ========================================================= */

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

    const currentPage = Math.min(page, totalPages);

    return {
      ...data,
      items,
      page: currentPage,
      pageSize,
      total,
      totalPages,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages,
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

  /* =========================================================
     CLEANUP
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      bridgeCleanup?.();
    } catch {}

    bridgeCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =========================================================
     MODAL BRIDGES
  ========================================================= */

  function openTicketModalBridge(detail = null) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) return false;

    try {
      if (isFunction(OnionIncidenciasModal?.getState)) {
        const modalState = OnionIncidenciasModal.getState();

        if (
          modalState?.isOpen &&
          isFunction(OnionIncidenciasModal.update)
        ) {
          OnionIncidenciasModal.update(payload);
          return true;
        }

        if (isFunction(OnionIncidenciasModal.open)) {
          OnionIncidenciasModal.open(payload);
          return true;
        }
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal import directo falló:", error);
    }

    try {
      if (isBrowser()) {
        const modal = window.OnionIncidenciasModal;

        if (
          modal?.getState?.()?.isOpen &&
          isFunction(modal.update)
        ) {
          modal.update(payload);
          return true;
        }

        if (isFunction(modal?.open)) {
          modal.open(payload);
          return true;
        }
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal hook global falló:", error);
    }

    try {
      if (isBrowser()) {
        const hook =
          window.renderIncidenciaTicketModal ||
          window.renderTicketModal ||
          window.renderIncidenciaModal;

        if (isFunction(hook)) {
          hook(payload);
          return true;
        }
      }
    } catch (error) {
      safeWarn("ticket modal hook legacy falló:", error);
    }

    safeEmit("incidencias:modal:open", {
      detail: payload,
      ticketId: getStableTicketId(payload),
      source: "homeView:fallback",
    });

    return true;
  }

  function updateTicketModalBridge(detail = {}) {
    const payload = safeObject(detail);

    try {
      if (isFunction(OnionIncidenciasModal?.update)) {
        OnionIncidenciasModal.update(payload);
        return true;
      }
    } catch {}

    try {
      if (isBrowser() && isFunction(window?.OnionIncidenciasModal?.update)) {
        window.OnionIncidenciasModal.update(payload);
        return true;
      }
    } catch {}

    return openTicketModalBridge(payload);
  }

  function openCreateModalBridge(draft = {}) {
    const payload = safeObject(draft);

    try {
      if (isBrowser()) {
        const modal = window.OnionIncidenciasCreateModal;

        if (isFunction(modal?.open)) {
          modal.open(payload);
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
          hook(payload);
          return true;
        }
      }
    } catch (error) {
      safeWarn("create modal global hook falló:", error);
    }

    try {
      if (isFunction(IncidenciasCreateView?.open)) {
        IncidenciasCreateView.open(payload);
        return true;
      }
    } catch (error) {
      safeWarn("IncidenciasCreateView.open falló:", error);
    }

    safeEmit("incidencias:create-modal:open", {
      draft: payload,
      source: "homeView:fallback",
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

  function decorateAvatarFallbacks(container) {
    if (!container) return;

    const images = container.querySelectorAll(
      "[data-avatar-image='true']"
    );

    images.forEach((img) => {
      if (img.dataset.homeFallbackBound === "true") return;

      img.dataset.homeFallbackBound = "true";

      img.addEventListener(
        "error",
        () => {
          try {
            img.style.display = "none";
            img.closest("[data-avatar-root='true']")?.setAttribute("data-fallback", "true");
          } catch {}
        },
        {
          once: true,
        }
      );
    });
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);
    decorateAvatarFallbacks(container);

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

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
      <section
        class="panel-content dashboard ready"
        data-view="home"
        data-home-scope="${SCOPE}"
      >
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);min-width:0;max-width:100%;">
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

    if (destroyed) return null;

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
      hasOwnKeys(homeState.summary) ||
      hasOwnKeys(homeState.dashboard);

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

    if (!destroyed) {
      rerender();
    }

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
        preserveExisting: true,
      });

      if (!getTickets().length) {
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

      safeEmit("home:loaded", {
        dashboard: homeState.dashboard,
        summary: homeState.summary,
        tickets: getTickets(),
        force,
        silent,
        asRefresh,
      });

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

        safeEmit("home:loaded:fallback", {
          tickets: recoveredTickets,
          error,
          message,
        });

        return recoveredTickets;
      }

      homeState.error = message;
      homeState.loaded = true;
      homeState.hydrated = true;

      markIdle();

      if (!silent) {
        showToast(message, "error");
      }

      safeEmit("home:load:error", {
        error,
        message,
      });

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

  async function handleOpenTicket(ticketId = "", options = {}) {
    const id = safeText(ticketId, "");
    const opts = safeObject(options);

    if (!id) return null;

    if (!opts.skipThrottle && !throttleOpenTicketClick()) {
      return null;
    }

    if (
      inflightOpenTicket &&
      inflightOpenTicketId &&
      sameIdentity(inflightOpenTicketId, id)
    ) {
      return inflightOpenTicket;
    }

    if (
      homeState.openingTicketId &&
      !sameIdentity(homeState.openingTicketId, id)
    ) {
      return null;
    }

    inflightOpenTicketId = id;

    inflightOpenTicket = (async () => {
      homeState.openingTicketId = id;
      homeState.selectedTicketId = id;

      const localSnapshot =
        findTicketById(id) ||
        safeObject(
          first(
            opts.detail,
            opts.payload?.detail,
            opts.payload?.ticket,
            opts.payload?.incidencia,
            opts.payload?.item,
            opts.payload
          )
        );

      if (hasOwnKeys(localSnapshot) && opts.openImmediate !== false) {
        openTicketModalBridge({
          ...localSnapshot,
          meta: {
            ...safeObject(localSnapshot.meta),
            openingFromHome: true,
            detailLoading: true,
          },
        });
      }

      rerender();
      await waitForPaint();

      try {
        const detail = await openTicketAction({
          ticketId: id,
          preferFresh: opts.preferFresh !== false,
          silent: opts.silent !== false,
        });

        const finalDetail =
          hasOwnKeys(detail)
            ? {
                ...safeObject(localSnapshot),
                ...safeObject(detail),
                meta: {
                  ...safeObject(localSnapshot?.meta),
                  ...safeObject(detail?.meta),
                  openingFromHome: false,
                  detailLoading: false,
                },
              }
            : {
                ...safeObject(localSnapshot),
                meta: {
                  ...safeObject(localSnapshot?.meta),
                  openingFromHome: false,
                  detailLoading: false,
                  detailFallback: true,
                },
              };

        if (!hasOwnKeys(finalDetail)) {
          showToast("No se pudo abrir la incidencia.", "error");
          return null;
        }

        updateTicketModalBridge(finalDetail);

        safeEmit("home:ticket:open:success", {
          ticketId: id,
          incidenciaId: id,
          detail: finalDetail,
          source: safeText(opts.source, "home"),
        });

        return finalDetail;
      } catch (error) {
        safeWarn("handleOpenTicket falló:", error);

        if (hasOwnKeys(localSnapshot)) {
          updateTicketModalBridge({
            ...localSnapshot,
            meta: {
              ...safeObject(localSnapshot.meta),
              openingFromHome: false,
              detailLoading: false,
              detailFallback: true,
            },
          });

          showToast(
            "Incidencia abierta con datos locales. No se pudo cargar el detalle remoto.",
            "warning"
          );

          safeEmit("home:ticket:open:fallback", {
            ticketId: id,
            incidenciaId: id,
            detail: localSnapshot,
            error,
          });

          return localSnapshot;
        }

        showToast("No se pudo abrir la incidencia.", "error");

        safeEmit("home:ticket:open:error", {
          ticketId: id,
          incidenciaId: id,
          error,
        });

        return null;
      } finally {
        homeState.openingTicketId = "";
        inflightOpenTicket = null;
        inflightOpenTicketId = "";

        if (!destroyed) rerender();
      }
    })();

    return inflightOpenTicket;
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
      const opened = openCreateModalBridge(opts.draft || {});

      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
      }

      safeEmit("home:create:open", {
        draft: opts.draft || {},
        source: "home",
      });

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

    await handleNavigateAction("go-facturas", ROUTES.FACTURAS);

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
      return handleOpenTicket(entityId, {
        source: "home:activity",
      });
    }

    if (action === "open-invoice" && entityId) {
      return handleOpenInvoice(entityId);
    }

    if (route) {
      return handleNavigateAction(action, route);
    }

    return false;
  }

  async function openTicketFromExternalRequest(payload = {}) {
    const source = getEventPayload(payload);
    const ticketId = getTicketIdFromPayload(source);

    if (!ticketId) {
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    if (!getTickets().length && !homeState.loaded) {
      await reload({
        force: false,
        silent: true,
        asRefresh: false,
      });
    }

    return handleOpenTicket(ticketId, {
      skipThrottle: true,
      source: safeText(source.source, "external"),
      payload: source,
      detail: first(
        source.detail,
        source.ticket,
        source.incidencia,
        source.item,
        source
      ),
    });
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

    const closestRow =
      element.closest?.("[data-ticket-id]") ||
      element.closest?.("[data-incidencia-id]") ||
      element.closest?.("[data-entity-id]") ||
      null;

    return safeText(
      first(
        element.dataset?.ticketId,
        element.dataset?.incidenciaId,
        element.dataset?.ticketCode,
        element.dataset?.entityId,

        element.getAttribute?.("data-ticket-id"),
        element.getAttribute?.("data-incidencia-id"),
        element.getAttribute?.("data-ticket-code"),
        element.getAttribute?.("data-entity-id"),

        closestRow?.dataset?.ticketId,
        closestRow?.dataset?.incidenciaId,
        closestRow?.dataset?.ticketCode,
        closestRow?.dataset?.entityId,

        closestRow?.getAttribute?.("data-ticket-id"),
        closestRow?.getAttribute?.("data-incidencia-id"),
        closestRow?.getAttribute?.("data-ticket-code"),
        closestRow?.getAttribute?.("data-entity-id")
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

        await handleOpenTicket(getTicketIdFromElement(ticketBtn), {
          source: "home:table",
        });
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
        const route = getRouteFromElement(invoiceBtn) || ROUTES.FACTURAS;

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
        "go-tickets",
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

      const widgetBtn = getActionTarget(event, [
        "open-widget",
      ]);

      if (widgetBtn) {
        event.preventDefault();

        const route = getRouteFromElement(widgetBtn);

        if (route) {
          await handleNavigateAction("open-widget", route);
        }

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

  function attachExternalListeners() {
    const cleanups = [];

    const onMutated = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = getEventPayload(eventOrPayload);

      await reload({
        force: true,
        asRefresh: true,
        silent: payload.silent !== false,
      });
    };

    const onOpenTicket = async (eventOrPayload = {}) => {
      if (destroyed) return;

      const payload = getEventPayload(eventOrPayload);

      await openTicketFromExternalRequest({
        ...payload,
        source: safeText(payload.source, "home:event"),
      });
    };

    const onReady = () => {
      flushPendingCreate();
    };

    HOME_RELOAD_EVENTS.forEach((eventName) => {
      cleanups.push(safeOn(eventName, onMutated));
    });

    HOME_OPEN_TICKET_EVENTS.forEach((eventName) => {
      cleanups.push(safeOn(eventName, onOpenTicket));
    });

    READY_EVENTS.forEach((eventName) => {
      cleanups.push(safeOn(eventName, onReady));
    });

    bridgeCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {}
      });
    };

    return bridgeCleanup;
  }

  function registerHomeBridge() {
    const bridge = {
      openTicket(payload = {}) {
        return openTicketFromExternalRequest(payload);
      },

      openTicketById(ticketId = "") {
        return openTicketFromExternalRequest({ ticketId });
      },

      openIncidencia(payload = {}) {
        return openTicketFromExternalRequest(payload);
      },

      openIncidenciaById(ticketId = "") {
        return openTicketFromExternalRequest({ ticketId });
      },

      create(draft = {}) {
        return handleCreateIncidencia({
          draft,
          skipThrottle: true,
        });
      },

      refresh(options = {}) {
        return reload({
          force: true,
          silent: Boolean(options.silent),
          asRefresh: true,
        });
      },

      reload(options = {}) {
        return reload(options);
      },

      navigate(route = "", options = {}) {
        return navigateTo(route, {
          source: "home-bridge",
          ...safeObject(options),
        });
      },

      getState() {
        return api.getState();
      },

      getItems() {
        return api.getItems();
      },
    };

    try {
      if (!AppCore.modules || typeof AppCore.modules !== "object") {
        AppCore.modules = {};
      }

      AppCore.modules.Home = api;
      AppCore.modules.HomeView = api;
      AppCore.modules.OnionHomeView = api;
      AppCore.modules.OnionHomeBridge = bridge;
    } catch {}

    try {
      if (isBrowser()) {
        window.OnionHomeView = api;
        window.HomeView = api;
        window.OnionHomeBridge = bridge;
        window.HomeBridge = bridge;

        window.openHomeTicket = (payload = {}) =>
          openTicketFromExternalRequest(payload);

        window.openHomeIncidencia = (payload = {}) =>
          openTicketFromExternalRequest(payload);
      }
    } catch {}

    return true;
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    registerHomeBridge();

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(attachExternalListeners());

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

    const incomingOptions = safeObject(options);

    if (inflightReload) {
      queuedReloadOptions = {
        ...(queuedReloadOptions || {}),
        ...incomingOptions,
        force: Boolean(queuedReloadOptions?.force || incomingOptions.force),
        asRefresh: Boolean(
          queuedReloadOptions?.asRefresh || incomingOptions.asRefresh
        ),
        silent: Boolean(
          queuedReloadOptions?.silent ?? incomingOptions.silent
        ),
      };

      return inflightReload;
    }

    inflightReload = (async () => {
      let currentOptions = incomingOptions;

      do {
        queuedReloadOptions = null;

        await renderAndLoad(currentOptions);

        if (!destroyed) {
          bind();
        }

        currentOptions = queuedReloadOptions;
      } while (currentOptions && !destroyed);

      return api;
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
      queuedReloadOptions = null;
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
      registerHomeBridge();
      ensureBaseState();
      rerender();
      flushPendingCreate();

      if (!homeState.loaded && !inflightReload) {
        await reload({
          force: false,
          silent: true,
          asRefresh: false,
        });
      }

      return api;
    }

    initialized = true;

    registerHomeBridge();

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
    queuedReloadOptions = null;

    inflightInit = null;
    inflightReload = null;
    inflightOpenTicket = null;
    inflightOpenTicketId = "";

    safeLog("destroy");
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    mount: init,

    render: rerender,
    scheduleRender: rerender,

    reload,
    destroy,
    unmount: destroy,

    bind,
    registerHomeBridge,

    openTicket: handleOpenTicket,
    openTicketFromExternalRequest,
    openIncidencia: handleOpenTicket,

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
      findIncidenciaById(getTickets(), ticketId) || findTicketById(ticketId),

    findTicketById,

    getHomeApiSnapshot,

    getState: () => ({
      ...homeState,

      user: getCurrentUser(),
      role: getCurrentRole(),
      isAdmin: isAdminRole(getCurrentRole()),

      initialized,
      destroyed,

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasQueuedReload: Boolean(queuedReloadOptions),
      hasInflightOpenTicket: Boolean(inflightOpenTicket),
      inflightOpenTicketId,

      pendingCreateRequest,

      itemsCount: getTickets().length,
      pageItems: getPaginationMeta(getTickets()).items,
      pagination: getPaginationMeta(getTickets()),

      apiSnapshot: getHomeApiSnapshot?.(),
    }),

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  registerHomeBridge();

  return api;
})();

export default HomeView;

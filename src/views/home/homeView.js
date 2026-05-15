/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/homeView.js

   ONION SUPPORT · HOME VIEW
   DASHBOARD API FIRST · MODULAR BACKEND FALLBACK · ROUTE SAFE
   CLEAN VIEW · NO INLINE CSS · NO STALE RENDER

   Responsabilidades:
   - Punto de entrada real de la vista Home.
   - Render principal con home.template.js.
   - API-first con home.api.js.
   - Consumir dashboard summary normalizado.
   - Fallback fuerte a incidencias/clientes/usuarios/facturas.
   - Home común para user/admin/support.
   - Paginación visual fija a 5 incidencias.
   - Render inicial inmediato con datos cacheados si existen.
   - Bind inmediato después del primer render.
   - Refresh suave sin empobrecer datos existentes.
   - Apertura de incidencia con estado visual loading.
   - Apertura de modal de creación de incidencia.
   - Navegación por accesos rápidos.
   - Bind de eventos sin duplicidad bus + window.
   - Destroy limpio para Router.
   - Reload con cola segura.
   - Bridge público para topbar/global search.
   - Protección contra renders stale encima de otras vistas.
   - Sin CSS inline.
   - Sin <style>.
   - Sin Object.assign(style).
========================================================= */

import { AppCore } from "../../core/index.js";

import renderHomeTemplate, {
  renderHomeErrorState,
} from "./home.template.js";

import {
  loadHomeDashboard,
  refreshHomeDashboard,
  hydrateHomeFromCache as hydrateHomeApiFromCache,
  normalizeHomeDashboardResponse,
  getHomeApiSnapshot,
} from "./home.api.js";

import {
  homeState,
  syncHomeStateFromDashboard,
  getHomeStateSnapshot,
  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setError,
  clearHomeError,
  setDashboard,
  setSummary,
  setTickets,
  setInvoices,
  setUsers,
  setClients,
  setRecent,
  setRequestId,
  setLastSyncAt,
  setPage,
  setPageSize,
  setOpeningTicketId,
  setSelectedTicketId,
  setCreating,
  setNavigatingAction,
} from "./home.state.js";

import {
  replaceHomeStore,
  mergeHomeStore,
  getHomeDashboardStore,
  getHomeTicketsStore,
  getHomeInvoicesStore,
  getHomeUsersStore,
  getHomeClientsStore,
  getHomeActivityStore,
  getHomeStoreSnapshot,
} from "./home.store.js";

import {
  normalizeHomeDashboard,
  normalizeHomeTickets,
  normalizeHomeInvoices,
  normalizeHomeUsers,
  normalizeHomeClients,
  normalizeHomeActivityList,
  buildHomeActivityFromCollections,
  findHomeTicketById,
  paginateHomeItems,
} from "./home.model.js";

import {
  bindHomeEvents,
  getHomeBindingsSnapshot,
} from "./home.bindings.js";

import {
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  getHomeActionsSnapshot,
} from "./home.actions.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  isObject,
  isFunction,
  hasOwnKeys,
  first,
  normalizeKey,
  normalizeText,
  nowIso,
  nextFrame,
  sanitizePayload,
  showToast,
  safeEmit as emitHomeEvent,
  safeOn,
  safeWarn,
  safeLog,
  safeError,
} from "./home.utils.js";

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
  findIncidenciaById,
} from "../incidencias/incidencias.model.js";

import {
  openTicketAction,
  copyTicketIdAction,
} from "../incidencias/incidencias.actions.js";

import IncidenciasCreateView from "../incidencias/incidencias.create.modal.js";
import { OnionIncidenciasModal } from "../incidencias/incidencias.modal.js";

/* =========================================================
   MODULE
========================================================= */

export const HomeView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SOURCE = "views:home:homeView";
  const VERSION = "13.0.0";
  const SCOPE = "view:home";

  const HOME_PATH = "/";
  const PAGE_SIZE = 5;

  const CREATE_CLICK_THROTTLE_MS = 450;
  const OPEN_TICKET_THROTTLE_MS = 350;

  const HOME_CACHE_KEY = "onion:home:view:cache:v13";
  const HOME_CACHE_LEGACY_KEYS = Object.freeze([
    "onion.home.view.cache.v12",
    "onion.home.view.cache.v11",
  ]);

  const HOME_CACHE_TTL_MS = 1000 * 60 * 10;
  const OPTIONAL_IMPORT_TIMEOUT_MS = 7000;

  const ROUTES = Object.freeze({
    HOME: "/",
    INCIDENCIAS: "/incidencias",
    INCIDENCIAS_NUEVA: "/incidencias/nueva",
    FACTURAS: "/facturas",
    USUARIOS: "/usuarios",
    CLIENTES: "/clientes",
    CUENTA: "/cuenta",
    AJUSTES: "/ajustes",
  });

  const ROUTE_ALIASES = Object.freeze({
    "/home": "/",
    "/dashboard": "/",
    "/inicio": "/",

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

  const HOME_VIEW_KEYS = Object.freeze(
    new Set([
      "home",
      "homeview",
      "dashboard",
      "inicio",
      "root",
      "index",
    ])
  );

  const KNOWN_ROOT_ROUTE_SEGMENTS = Object.freeze(
    new Set([
      "login",
      "logout",
      "2fa",
      "otp",
      "mfa",

      "home",
      "dashboard",
      "inicio",

      "incidencias",
      "tickets",
      "ticket",
      "incidents",
      "incident",
      "issues",
      "issue",

      "facturas",
      "invoices",
      "invoice",
      "bills",
      "bill",
      "billing",

      "usuarios",
      "users",
      "user",
      "members",
      "member",

      "clientes",
      "clients",
      "client",
      "customers",
      "customer",

      "cuenta",
      "account",
      "profile",

      "ajustes",
      "settings",

      "servidor",
      "server",
      "health",
      "status",

      "activate-account",
      "activation",
      "reset-password",
      "reset-password-confirm",
      "forgot-password",
      "recover-password",
      "password-reset",
    ])
  );

  const HOME_RELOAD_EVENTS = Object.freeze([
    "home:reload",
    "home:refresh",
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
    "facturas:send:success",

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

  const NATIVE_ACTION_SELECTOR = [
    "[data-home-action]",
    "[data-action]",
    "[data-ticket-id]",
    "[data-incidencia-id]",
    "[data-page]",
    "#home-retry-btn",
    "#home-refresh-btn",
    "#home-create-ticket-btn",
  ].join(",");

  /* =========================================================
     RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let inflightOpenTicket = null;

  let queuedReloadOptions = null;

  let bindingsCleanup = null;
  let nativeCleanup = null;
  let bridgeCleanup = null;

  let renderToken = 0;

  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;
  let lastOpenTicketClickAt = 0;

  let inflightOpenTicketId = "";

  const optionalModulesCache = new Map();
  const optionalModuleWarned = new Set();

  /* =========================================================
     GENERIC HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function waitForPaint() {
    return nextFrame();
  }

  function sameIdentity(a = "", b = "") {
    const left = normalizeText(a);
    const right = normalizeText(b);

    return Boolean(left && right && left === right);
  }

  function uniqueStrings(values = []) {
    return [
      ...new Set(
        safeArray(values)
          .flatMap((value) => (
            Array.isArray(value)
              ? value
              : [value]
          ))
          .map((value) => safeText(value, ""))
          .filter(Boolean)
      ),
    ];
  }

  function uniqueBy(items = [], picker = (item) => item) {
    const seen = new Set();
    const output = [];

    safeArray(items).forEach((item, index) => {
      const key = safeText(picker(item, index), "");

      if (!key) {
        output.push(item);
        return;
      }

      const normalized = normalizeKey(key);

      if (seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      output.push(item);
    });

    return output;
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

  function timeoutPromise(
    ms = OPTIONAL_IMPORT_TIMEOUT_MS,
    label = "OPTIONAL_IMPORT_TIMEOUT"
  ) {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error(label));
      }, Math.max(0, Number(ms) || 0));
    });
  }

  async function withTimeout(
    promise,
    ms = OPTIONAL_IMPORT_TIMEOUT_MS,
    label = "timeout"
  ) {
    return Promise.race([
      Promise.resolve(promise),
      timeoutPromise(ms, label),
    ]);
  }

  function defineGlobalBridge(name = "", value = null) {
    if (!isBrowser()) {
      return false;
    }

    const finalName = safeText(name, "");

    if (!finalName) {
      return false;
    }

    try {
      Object.defineProperty(
        window,
        finalName,
        {
          value,
          configurable: true,
          enumerable: false,
          writable: false,
        }
      );

      return true;
    } catch {
      try {
        window[finalName] = value;
        return true;
      } catch {
        return false;
      }
    }
  }

  /* =========================================================
     ROUTE GUARD
  ========================================================= */

  function getBaseOrigin() {
    try {
      if (
        isBrowser() &&
        window.location?.origin
      ) {
        return window.location.origin;
      }
    } catch {}

    return "http://localhost";
  }

  function isHashRouterPath(value = "") {
    const raw = safeText(value, "");

    return (
      raw.startsWith("#/") ||
      raw.startsWith("#!")
    );
  }

  function normalizeHashRouterPath(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return HOME_PATH;
    }

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/");
    }

    return raw.replace(/^#\/?/, "/");
  }

  function normalizePathnameOnly(pathname = HOME_PATH) {
    let value = safeText(pathname, HOME_PATH)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value) {
      value = HOME_PATH;
    }

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME_PATH;
    }

    return value;
  }

  function normalizeSearch(search = "") {
    const value = safeText(search, "");

    if (!value) {
      return "";
    }

    return value.startsWith("?")
      ? value
      : `?${value.replace(/^\?+/, "")}`;
  }

  function normalizeHash(hash = "") {
    const value = safeText(hash, "");

    if (!value) {
      return "";
    }

    return value.startsWith("#")
      ? value
      : `#${value.replace(/^#+/, "")}`;
  }

  function splitFullPath(value = HOME_PATH) {
    const raw = safeText(value, HOME_PATH);

    if (isHashRouterPath(raw)) {
      return splitFullPath(
        normalizeHashRouterPath(raw)
      );
    }

    let pathname = raw;
    let search = "";
    let hash = "";

    const hashIndex = pathname.indexOf("#");

    if (hashIndex >= 0) {
      hash = pathname.slice(hashIndex);
      pathname = pathname.slice(0, hashIndex) || HOME_PATH;
    }

    const searchIndex = pathname.indexOf("?");

    if (searchIndex >= 0) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex) || HOME_PATH;
    }

    return {
      pathname: normalizePathnameOnly(pathname),
      search: normalizeSearch(search),
      hash: normalizeHash(hash),
    };
  }

  function normalizeFullPath(path = HOME_PATH) {
    const raw = safeText(path, HOME_PATH);

    if (!raw) {
      return HOME_PATH;
    }

    if (isHashRouterPath(raw)) {
      return normalizeFullPath(
        normalizeHashRouterPath(raw)
      );
    }

    try {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
        const parsed = new URL(raw, getBaseOrigin());

        if (
          parsed.hash &&
          isHashRouterPath(parsed.hash)
        ) {
          return normalizeFullPath(
            normalizeHashRouterPath(parsed.hash)
          );
        }

        return normalizeFullPath(
          `${parsed.pathname || HOME_PATH}${parsed.search || ""}${parsed.hash || ""}`
        );
      }
    } catch {}

    const { pathname, search, hash } = splitFullPath(raw);

    return `${pathname}${search}${hash}`;
  }

  function stripSearchAndHash(path = HOME_PATH) {
    return (
      normalizeFullPath(path)
        .split("?")[0]
        .split("#")[0] ||
      HOME_PATH
    );
  }

  function getPathSegments(path = HOME_PATH) {
    return stripSearchAndHash(path)
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function normalizeUsernameSegment(value = "") {
    return safeText(value, "")
      .replace(/^@+/, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]/g, "")
      .trim();
  }

  function getCurrentUser() {
    return safeObject(
      first(
        AppCore?.state?.user,
        AppCore?.state?.currentUser,
        AppCore?.state?.profile,
        AppCore?.state?.session?.user,
        AppCore?.session?.user,
        AppCore?.Auth?.user,
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

  function isAdminRoleKey(role = "") {
    return [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "super_administrador",
      "owner",
      "root",
    ].includes(normalizeKey(role));
  }

  function getKnownUsernameCandidates() {
    const state = safeObject(AppCore?.state);
    const user = getCurrentUser();
    const raw = safeObject(user.raw);

    return uniqueStrings([
      state.currentResolvedUsername,
      state.resolvedUsername,
      state.username,
      state.userName,
      state.user_name,
      state.publicUsername,
      state.slug,

      user.username,
      user.userName,
      user.user_name,
      user.slug,
      user.alias,
      user.login,
      user.email,

      raw.username,
      raw.userName,
      raw.user_name,
      raw.slug,
      raw.alias,
      raw.login,
      raw.email,

      isBrowser() ? window.__ONION_USERNAME__ : "",
      isBrowser() ? window.__ONION_PUBLIC_USERNAME__ : "",
      isBrowser() ? window.__ONION_RESOLVED_USERNAME__ : "",
    ])
      .map(normalizeUsernameSegment)
      .filter(Boolean);
  }

  function getRouterCandidate() {
    try {
      if (isFunction(AppCore?.modules?.get)) {
        return (
          AppCore.modules.get("router") ||
          AppCore.modules.get("Router") ||
          null
        );
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

  function getStateRouteObject() {
    return safeObject(
      first(
        AppCore?.state?.currentRoute,
        AppCore?.state?.route,
        AppCore?.state?.routeMeta,
        {}
      )
    );
  }

  function getRoutePathFromValue(value = null) {
    if (typeof value === "string") {
      return safeText(value, "");
    }

    if (!isObject(value)) {
      return "";
    }

    return safeText(
      first(
        value.canonicalPath,
        value.path,
        value.href,
        value.to,
        value.routePath,
        value.requestedPath,
        value.route?.canonicalPath,
        value.route?.path,
        value.route?.href,
        value.route?.to,
        ""
      ),
      ""
    );
  }

  function getRawAppRouteValue() {
    const route = getStateRouteObject();

    return safeText(
      first(
        getRoutePathFromValue(route),
        AppCore?.state?.canonicalPath,
        AppCore?.state?.currentPath,
        AppCore?.state?.path,
        ""
      ),
      ""
    );
  }

  function isRawAppRouteHome() {
    const raw = getRawAppRouteValue();

    if (!raw) {
      return false;
    }

    return stripSearchAndHash(raw) === HOME_PATH;
  }

  function getAppRoutePath() {
    const router = getRouterCandidate();
    const route = getStateRouteObject();

    try {
      return safeText(
        first(
          router?.getCurrentCanonicalPath?.(),
          getRoutePathFromValue(route),
          AppCore?.state?.canonicalPath,
          AppCore?.state?.currentPath,
          AppCore?.state?.path,
          ""
        ),
        ""
      );
    } catch {
      return safeText(
        first(
          getRoutePathFromValue(route),
          AppCore?.state?.canonicalPath,
          AppCore?.state?.currentPath,
          AppCore?.state?.path,
          ""
        ),
        ""
      );
    }
  }

  function getAppPublicPath() {
    const router = getRouterCandidate();
    const route = getStateRouteObject();

    try {
      return safeText(
        first(
          router?.getCurrentPublicPath?.(),
          route.publicPath,
          route.routePublicPath,
          AppCore?.state?.publicPath,
          AppCore?.state?.routePublicPath,
          router?.getCurrentPath?.(),
          ""
        ),
        ""
      );
    } catch {
      return safeText(
        first(
          route.publicPath,
          route.routePublicPath,
          AppCore?.state?.publicPath,
          AppCore?.state?.routePublicPath,
          ""
        ),
        ""
      );
    }
  }

  function getAppViewKey() {
    const route = getStateRouteObject();

    return safeText(
      first(
        AppCore?.state?.viewKey,
        AppCore?.state?.routeKey,
        AppCore?.state?.routeName,
        AppCore?.state?.currentView,

        route.viewKey,
        route.routeKey,
        route.name,
        route.key,
        route.viewName,

        AppCore?.state?.routeMeta?.viewKey,
        AppCore?.state?.routeMeta?.routeKey,
        AppCore?.state?.routeMeta?.name,
        ""
      ),
      ""
    );
  }

  function getBrowserPath() {
    if (!isBrowser()) {
      return "";
    }

    try {
      const pathname = window.location.pathname || HOME_PATH;
      const search = window.location.search || "";
      const hash = window.location.hash || "";

      if (
        hash &&
        isHashRouterPath(hash)
      ) {
        return normalizeFullPath(
          normalizeHashRouterPath(hash)
        );
      }

      return normalizeFullPath(
        `${pathname}${search}${hash}`
      );
    } catch {
      return "";
    }
  }

  function isUsernameSegment(segment = "", options = {}) {
    const raw = safeText(segment, "");
    const opts = safeObject(options);

    if (!raw) {
      return false;
    }

    if (/^@[A-Za-z0-9._-]{1,80}$/.test(raw)) {
      return true;
    }

    const clean = normalizeUsernameSegment(raw);

    if (!clean) {
      return false;
    }

    if (KNOWN_ROOT_ROUTE_SEGMENTS.has(clean)) {
      return false;
    }

    const knownUsernames = getKnownUsernameCandidates();

    if (knownUsernames.some((candidate) => candidate === clean)) {
      return true;
    }

    if (
      opts.allowUnknownSlug === true &&
      /^[a-z0-9._-]{3,80}$/i.test(clean)
    ) {
      return true;
    }

    return false;
  }

  function stripUsernamePrefix(path = HOME_PATH, options = {}) {
    const opts = safeObject(options);

    const { pathname, search, hash } = splitFullPath(
      normalizeFullPath(path)
    );

    const segments = pathname
      .split("/")
      .filter(Boolean);

    if (!segments.length) {
      return `${HOME_PATH}${search}${hash}`;
    }

    const shouldStrip =
      isUsernameSegment(
        segments[0],
        {
          allowUnknownSlug: opts.allowUnknownSlug === true,
        }
      );

    if (!shouldStrip) {
      return `${pathname}${search}${hash}`;
    }

    const rest = segments.slice(1).join("/");
    const cleanPathname =
      rest
        ? normalizePathnameOnly(`/${rest}`)
        : HOME_PATH;

    return `${cleanPathname}${search}${hash}`;
  }

  function canonicalizePath(path = HOME_PATH, options = {}) {
    return normalizeFullPath(
      stripUsernamePrefix(
        path || HOME_PATH,
        options
      )
    );
  }

  function getCleanCanonicalPath(path = HOME_PATH, options = {}) {
    return stripSearchAndHash(
      canonicalizePath(
        path || HOME_PATH,
        options
      )
    );
  }

  function isSinglePublicUsernameRoot(path = "", options = {}) {
    const clean = stripSearchAndHash(
      normalizeFullPath(path || HOME_PATH)
    );

    const segments = getPathSegments(clean);

    if (segments.length !== 1) {
      return false;
    }

    return isUsernameSegment(
      segments[0],
      {
        allowUnknownSlug: options.allowUnknownSlug === true,
      }
    );
  }

  function isHomePath(path = "", options = {}) {
    const clean =
      getCleanCanonicalPath(
        path || HOME_PATH,
        options
      );

    return clean === HOME_PATH;
  }

  function pushPathSignal(
    signals,
    label,
    value,
    strength = "explicit",
    options = {}
  ) {
    const text = safeText(value, "");

    if (!text) {
      return;
    }

    const opts = safeObject(options);

    const canonical =
      canonicalizePath(
        text,
        {
          allowUnknownSlug: opts.allowUnknownSlug === true,
        }
      );

    const clean = stripSearchAndHash(canonical);

    signals.push({
      type: "path",
      label,
      value: text,
      canonical,
      clean,
      isHome: clean === HOME_PATH,
      isPublicPath:
        label.endsWith(".publicPath") ||
        label.endsWith(".routePublicPath") ||
        label === "AppCore.state.publicPath",
      strength,
    });
  }

  function pushViewSignal(
    signals,
    label,
    value,
    strength = "explicit"
  ) {
    const text = safeText(value, "");

    if (!text) {
      return;
    }

    const normalized = normalizeKey(text);

    signals.push({
      type: "view",
      label,
      value: normalized,
      isHome: HOME_VIEW_KEYS.has(normalized),
      strength,
    });
  }

  function collectRouteLikeSignals(
    signals,
    value,
    label,
    strength
  ) {
    if (!isObject(value)) {
      return;
    }

    pushViewSignal(signals, `${label}.viewKey`, value.viewKey, strength);
    pushViewSignal(signals, `${label}.viewName`, value.viewName, strength);
    pushViewSignal(signals, `${label}.name`, value.name, strength);
    pushViewSignal(signals, `${label}.routeKey`, value.routeKey, strength);
    pushViewSignal(signals, `${label}.key`, value.key, strength);

    pushPathSignal(signals, `${label}.path`, value.path, strength);
    pushPathSignal(signals, `${label}.href`, value.href, strength);
    pushPathSignal(signals, `${label}.to`, value.to, strength);
    pushPathSignal(signals, `${label}.canonicalPath`, value.canonicalPath, strength);
    pushPathSignal(signals, `${label}.publicPath`, value.publicPath, strength);
    pushPathSignal(signals, `${label}.routePublicPath`, value.routePublicPath, strength);
    pushPathSignal(signals, `${label}.requestedPath`, value.requestedPath, strength);
  }

  function collectRouteSignalsFromObject(
    signals,
    value,
    label = "arg",
    strength = "explicit",
    depth = 0,
    seen = null
  ) {
    if (depth > 5) {
      return;
    }

    if (!isObject(value)) {
      return;
    }

    const weak = seen || new WeakSet();

    try {
      if (weak.has(value)) {
        return;
      }

      weak.add(value);
    } catch {}

    collectRouteLikeSignals(signals, value, label, strength);

    if (isObject(value.route)) {
      collectRouteLikeSignals(signals, value.route, `${label}.route`, strength);
    }

    collectRouteSignalsFromObject(signals, value.options, `${label}.options`, strength, depth + 1, weak);
    collectRouteSignalsFromObject(signals, value.payload, `${label}.payload`, strength, depth + 1, weak);
    collectRouteSignalsFromObject(signals, value.detail, `${label}.detail`, strength, depth + 1, weak);
    collectRouteSignalsFromObject(signals, value.meta, `${label}.meta`, strength, depth + 1, weak);
  }

  function collectRouteSignals(args = []) {
    const signals = [];

    safeArray(args).forEach((arg, index) => {
      if (typeof arg === "string") {
        pushPathSignal(signals, `args[${index}]`, arg, "explicit");
        return;
      }

      collectRouteSignalsFromObject(signals, arg, `args[${index}]`, "explicit");
    });

    const appViewKey = getAppViewKey();

    if (appViewKey) {
      pushViewSignal(signals, "AppCore.state.viewKey", appViewKey, "ambient");
    }

    const appRoute = getAppRoutePath();

    if (appRoute) {
      pushPathSignal(signals, "AppCore.state.canonicalPath", appRoute, "ambient", {
        allowUnknownSlug: false,
      });
    }

    const appPublicPath = getAppPublicPath();

    if (appPublicPath) {
      pushPathSignal(signals, "AppCore.state.publicPath", appPublicPath, "ambient", {
        allowUnknownSlug: isRawAppRouteHome(),
      });
    }

    const browserPath = getBrowserPath();

    if (browserPath) {
      pushPathSignal(signals, "window.location", browserPath, "browser", {
        allowUnknownSlug: isRawAppRouteHome(),
      });
    }

    return signals;
  }

  function hasPositiveHomeSignal(signals = []) {
    return signals.some((signal) => signal.isHome === true);
  }

  function hasExplicitHomeSignal(signals = []) {
    return signals.some((signal) => (
      signal.strength === "explicit" &&
      signal.isHome === true
    ));
  }

  function hasAmbientHomeSignal(signals = []) {
    return signals.some((signal) => (
      signal.strength === "ambient" &&
      signal.isHome === true
    ));
  }

  function isIgnorableUsernameRootSignal(signal = {}, signals = []) {
    if (
      !signal ||
      signal.isHome !== false
    ) {
      return false;
    }

    if (
      !isSinglePublicUsernameRoot(
        signal.value || "",
        {
          allowUnknownSlug: isRawAppRouteHome(),
        }
      )
    ) {
      return false;
    }

    return hasPositiveHomeSignal(signals);
  }

  function isIgnorablePublicPathSignal(signal = {}, signals = []) {
    if (
      !signal ||
      signal.isHome !== false ||
      !signal.isPublicPath
    ) {
      return false;
    }

    if (
      isSinglePublicUsernameRoot(
        signal.value || "",
        {
          allowUnknownSlug: isRawAppRouteHome(),
        }
      )
    ) {
      return hasExplicitHomeSignal(signals) || hasAmbientHomeSignal(signals);
    }

    return false;
  }

  function getBlockingRouteSignal(signals = []) {
    const priorities = [
      "browser",
      "explicit",
      "ambient",
    ];

    for (const strength of priorities) {
      const block = signals.find((signal) => (
        signal.strength === strength &&
        signal.type === "path" &&
        signal.isHome === false &&
        !isIgnorableUsernameRootSignal(signal, signals) &&
        !isIgnorablePublicPathSignal(signal, signals)
      ));

      if (block) {
        return block;
      }
    }

    return null;
  }

  function canRenderHomeForArgs(args = []) {
    if (!isBrowser()) {
      return true;
    }

    const signals = collectRouteSignals(args);
    const blocking = getBlockingRouteSignal(signals);

    if (blocking) {
      return false;
    }

    if (hasPositiveHomeSignal(signals)) {
      return true;
    }

    const browserPath = getBrowserPath();

    if (browserPath) {
      return isHomePath(
        browserPath,
        {
          allowUnknownSlug: isRawAppRouteHome(),
        }
      );
    }

    return true;
  }

  function getRouteDebug(args = []) {
    const signals = collectRouteSignals(args);
    const browserPath = getBrowserPath();

    return {
      source: SOURCE,
      version: VERSION,

      allowed: canRenderHomeForArgs(args),

      browserPath,
      browserCanonicalPath: getCleanCanonicalPath(
        browserPath || HOME_PATH,
        {
          allowUnknownSlug: isRawAppRouteHome(),
        }
      ),

      appRoute: getAppRoutePath(),
      appPublicPath: getAppPublicPath(),
      appViewKey: getAppViewKey(),

      signals,

      blockingSignal: getBlockingRouteSignal(signals),
      hasPositiveHomeSignal: hasPositiveHomeSignal(signals),
      hasExplicitHomeSignal: hasExplicitHomeSignal(signals),
      hasAmbientHomeSignal: hasAmbientHomeSignal(signals),
    };
  }

  function assertHomeRoute(reason = "home-route-guard", args = []) {
    const allowed = canRenderHomeForArgs(args);

    if (!allowed) {
      safeWarn("Render Home bloqueado: ruta activa no es Home.", {
        reason,
        ...getRouteDebug(args),
      });
    }

    return allowed;
  }

  /* =========================================================
     CACHE
  ========================================================= */

  function getCacheKeys() {
    return [
      HOME_CACHE_KEY,
      ...HOME_CACHE_LEGACY_KEYS,
    ];
  }

  function readStorageRaw(key = "") {
    if (!isBrowser()) {
      return "";
    }

    const finalKey = safeText(key, "");

    if (!finalKey) {
      return "";
    }

    try {
      return safeText(window.localStorage.getItem(finalKey), "");
    } catch {}

    try {
      return safeText(window.sessionStorage.getItem(finalKey), "");
    } catch {}

    return "";
  }

  function writeStorageRaw(key = "", value = "") {
    if (!isBrowser()) {
      return false;
    }

    const finalKey = safeText(key, "");
    const finalValue = safeText(value, "");

    if (
      !finalKey ||
      !finalValue
    ) {
      return false;
    }

    try {
      window.localStorage.setItem(finalKey, finalValue);
      return true;
    } catch {}

    try {
      window.sessionStorage.setItem(finalKey, finalValue);
      return true;
    } catch {}

    return false;
  }

  function readCachePayload() {
    if (!isBrowser()) {
      return null;
    }

    for (const key of getCacheKeys()) {
      try {
        const raw = readStorageRaw(key);

        if (!raw) {
          continue;
        }

        const payload = JSON.parse(raw);
        const savedAt = safeNumber(payload?.savedAt, 0);

        if (
          !savedAt ||
          Date.now() - savedAt > HOME_CACHE_TTL_MS
        ) {
          continue;
        }

        return payload;
      } catch {}
    }

    return null;
  }

  function writeCachePayload() {
    if (!isBrowser()) {
      return false;
    }

    try {
      const payload = {
        savedAt: Date.now(),
        version: VERSION,
        state: getCompactStateForCache(),
      };

      return writeStorageRaw(
        HOME_CACHE_KEY,
        JSON.stringify(payload)
      );
    } catch {
      return false;
    }
  }

  function getCompactStateForCache() {
    return {
      dashboard: safeObject(homeState.dashboard),
      summary: safeObject(homeState.summary),
      widgets: safeArray(homeState.widgets),

      tickets: safeArray(homeState.tickets),
      invoices: safeArray(homeState.invoices),
      users: safeArray(homeState.users),
      clients: safeArray(homeState.clients),
      activity: safeArray(homeState.activity),

      remoteCount: safeNumber(homeState.remoteCount, 0),
      ticketsRemoteCount: safeNumber(homeState.ticketsRemoteCount, 0),
      invoicesRemoteCount: safeNumber(homeState.invoicesRemoteCount, 0),
      usersRemoteCount: safeNumber(homeState.usersRemoteCount, 0),
      clientsRemoteCount: safeNumber(homeState.clientsRemoteCount, 0),

      requestId: safeText(homeState.requestId, ""),
      lastSyncAt: safeText(homeState.lastSyncAt, ""),
    };
  }

  function hydrateLocalHomeCache() {
    const payload = readCachePayload();
    const state = safeObject(payload?.state);

    if (!hasOwnKeys(state)) {
      return false;
    }

    syncDashboardPayload(
      {
        dashboard: {
          ...safeObject(state.dashboard),

          summary: safeObject(state.summary),
          stats: safeObject(state.summary),
          metrics: safeObject(state.summary),
          totals: safeObject(state.summary),

          widgets: safeArray(state.widgets),

          tickets: safeArray(state.tickets),
          incidencias: safeArray(state.tickets),

          invoices: safeArray(state.invoices),
          facturas: safeArray(state.invoices),

          users: safeArray(state.users),
          usuarios: safeArray(state.users),

          clients: safeArray(state.clients),
          clientes: safeArray(state.clients),
          customers: safeArray(state.clients),

          activity: safeArray(state.activity),
          recent: safeArray(state.activity),
          recentActivity: safeArray(state.activity),

          ticketsTotal: state.ticketsRemoteCount,
          incidenciasTotal: state.ticketsRemoteCount,

          invoicesTotal: state.invoicesRemoteCount,
          facturasTotal: state.invoicesRemoteCount,

          usersTotal: state.usersRemoteCount,
          usuariosTotal: state.usersRemoteCount,

          clientsTotal: state.clientsRemoteCount,
          clientesTotal: state.clientsRemoteCount,
        },
        requestId: state.requestId,
        lastSyncAt: state.lastSyncAt,
      },
      {
        preserveExisting: true,
        writeCache: false,
        source: "local-cache",
      }
    );

    setHydrated(true);
    setLoaded(true);

    return true;
  }

  /* =========================================================
     DATA NORMALIZATION
  ========================================================= */

  function getStableTicketId(item = {}) {
    if (
      typeof item === "string" ||
      typeof item === "number"
    ) {
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
    if (
      typeof item === "string" ||
      typeof item === "number"
    ) {
      return [
        safeText(item, ""),
      ].filter(Boolean);
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

  function getInvoiceId(item = {}) {
    return safeText(
      first(
        item.invoiceId,
        item.facturaId,
        item.number,
        item.numero,
        item.numeroFacturaLegal,
        item.numeroFactura,
        item.invoiceNumber,
        item.code,
        item.id,
        item._id,

        item.raw?.invoiceId,
        item.raw?.facturaId,
        item.raw?.number,
        item.raw?.numero,
        item.raw?.numeroFacturaLegal,
        item.raw?.numeroFactura,
        item.raw?.invoiceNumber,
        item.raw?.code,
        item.raw?.id,
        item.raw?._id
      ),
      ""
    );
  }

  function getUserId(item = {}) {
    return safeText(
      first(
        item.userId,
        item.usuarioId,
        item.id,
        item._id,
        item.email,
        item.mail,
        item.username,

        item.raw?.userId,
        item.raw?.usuarioId,
        item.raw?.id,
        item.raw?._id,
        item.raw?.email,
        item.raw?.mail,
        item.raw?.username
      ),
      ""
    );
  }

  function getClientId(item = {}) {
    return safeText(
      first(
        item.clienteId,
        item.clientId,
        item.customerId,
        item.id,
        item._id,
        item.email,
        item.mail,
        item.nif,
        item.cif,

        item.raw?.clienteId,
        item.raw?.clientId,
        item.raw?.customerId,
        item.raw?.id,
        item.raw?._id,
        item.raw?.email,
        item.raw?.mail,
        item.raw?.nif,
        item.raw?.cif
      ),
      ""
    );
  }

  function normalizeTickets(items = []) {
    try {
      const normalized =
        normalizeIncidenciasCollection(
          safeArray(items)
        );

      return sortIncidenciasByUpdatedDesc(normalized);
    } catch {
      return normalizeHomeTickets(items);
    }
  }

  function getTicketsFromStore() {
    try {
      const rawItems = safeArray(
        first(
          getHomeTicketsStore?.(),
          getIncidencias?.(),
          []
        )
      );

      return normalizeTickets(rawItems);
    } catch (error) {
      safeWarn("getTicketsFromStore falló.", error);
      return normalizeTickets(homeState.tickets);
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

    if (!id) {
      return null;
    }

    const tickets = getTickets();

    return (
      findHomeTicketById(tickets, id) ||
      tickets.find((item) =>
        getTicketIdentityList(item).some((candidate) =>
          sameIdentity(candidate, id)
        )
      ) ||
      null
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
      first(
        source.raw,
        item.raw,
        detail.raw,
        ticket.raw,
        incidencia.raw
      )
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
    try {
      return buildHomeActivityFromCollections({
        tickets: getTickets(),
        invoices: safeArray(homeState.invoices),
        users: safeArray(homeState.users),
        clients: safeArray(homeState.clients),
      });
    } catch {
      return normalizeHomeActivityList([
        ...getTickets().slice(0, 8).map((item) => {
          const ticketId = getStableTicketId(item);

          return {
            type: "ticket",
            title: safeText(
              first(
                item.subject,
                item.title,
                item.asunto,
                item.name
              ),
              "Incidencia"
            ),
            text: ticketId
              ? `Incidencia ${ticketId}`
              : "Incidencia registrada",
            date: first(
              item.updatedAt,
              item.lastUpdateAt,
              item.createdAt,
              item.raw?.updatedAt,
              item.raw?.createdAt
            ),
            route: ROUTES.INCIDENCIAS,
            action: "open-ticket",
            entityId: ticketId,
          };
        }),
      ]);
    }
  }

  function normalizeRemoteCount(...values) {
    return Math.max(
      0,
      ...values.map((value) => safeNumber(value, 0))
    );
  }

  function ensureSummaryAliases() {
    const dashboard = safeObject(homeState.dashboard);
    const summary = safeObject(homeState.summary);

    const tickets = getTickets();

    const invoices = normalizeHomeInvoices(
      first(
        homeState.invoices,
        getHomeInvoicesStore?.(),
        []
      )
    );

    const users = normalizeHomeUsers(
      first(
        homeState.users,
        getHomeUsersStore?.(),
        []
      )
    );

    const clients = normalizeHomeClients(
      first(
        homeState.clients,
        getHomeClientsStore?.(),
        []
      )
    );

    const activity = normalizeHomeActivityList(
      first(
        homeState.activity,
        getHomeActivityStore?.(),
        []
      )
    );

    const ticketsCount = normalizeRemoteCount(
      tickets.length,
      homeState.ticketsRemoteCount,
      summary.totalTickets,
      summary.ticketsTotal,
      summary.incidenciasTotal,
      summary.totalIncidencias,
      summary.ticketsCount,
      summary.incidenciasCount,
      dashboard.totalTickets,
      dashboard.ticketsTotal,
      dashboard.incidenciasTotal,
      dashboard.totalIncidencias
    );

    const invoicesCount = normalizeRemoteCount(
      invoices.length,
      homeState.invoicesRemoteCount,
      summary.totalInvoices,
      summary.invoicesTotal,
      summary.facturasTotal,
      summary.totalFacturas,
      summary.invoicesCount,
      summary.facturasCount,
      dashboard.totalInvoices,
      dashboard.invoicesTotal,
      dashboard.facturasTotal,
      dashboard.totalFacturas
    );

    const usersCount = normalizeRemoteCount(
      users.length,
      homeState.usersRemoteCount,
      summary.usersCount,
      summary.usuariosCount,
      summary.totalUsers,
      summary.totalUsuarios,
      summary.activeUsers,
      summary.usuariosActivos,
      dashboard.usersCount,
      dashboard.usuariosCount,
      dashboard.totalUsers,
      dashboard.totalUsuarios
    );

    const clientsCount = normalizeRemoteCount(
      clients.length,
      homeState.clientsRemoteCount,
      summary.clientsCount,
      summary.clientesCount,
      summary.customersCount,
      summary.totalClients,
      summary.totalClientes,
      summary.totalCustomers,
      summary.activeClients,
      summary.clientesActivos,
      dashboard.clientsCount,
      dashboard.clientesCount,
      dashboard.customersCount,
      dashboard.totalClients,
      dashboard.totalClientes,
      dashboard.totalCustomers
    );

    const invoiceAmount = normalizeRemoteCount(
      invoices.reduce((sum, item) => {
        const amount = safeNumber(
          first(
            item.total,
            item.amount,
            item.importe,
            item.totalFactura,
            item.importeTotal,
            item.raw?.total,
            item.raw?.amount,
            item.raw?.importe
          ),
          0
        );

        return sum + amount;
      }, 0),
      summary.invoiceAmount,
      summary.billingTotal,
      summary.totalBilling,
      summary.totalFacturado,
      summary.importeFacturas,
      summary.facturacionVisible,
      dashboard.invoiceAmount,
      dashboard.billingTotal,
      dashboard.totalFacturado
    );

    const pendingInvoices = normalizeRemoteCount(
      invoices.filter((item) => {
        const key = normalizeKey(
          first(
            item.paymentStatus,
            item.estadoPago,
            item.status,
            item.estado,
            item.raw?.paymentStatus,
            item.raw?.estadoPago,
            "pending"
          )
        );

        return [
          "pending",
          "pendiente",
          "overdue",
          "vencida",
          "partial",
          "parcial",
        ].includes(key);
      }).length,
      summary.pendingInvoices,
      summary.pendingFacturas,
      summary.facturasPendientes,
      summary.invoicesPending
    );

    const nextSummary = {
      ...summary,

      totalTickets: ticketsCount,
      ticketsTotal: ticketsCount,
      incidenciasTotal: ticketsCount,
      totalIncidencias: ticketsCount,
      ticketsCount,
      incidenciasCount: ticketsCount,

      totalInvoices: invoicesCount,
      invoicesTotal: invoicesCount,
      facturasTotal: invoicesCount,
      totalFacturas: invoicesCount,
      invoicesCount,
      facturasCount: invoicesCount,

      pendingInvoices,
      pendingFacturas: pendingInvoices,
      facturasPendientes: pendingInvoices,
      invoicesPending: pendingInvoices,

      invoiceAmount,
      billingTotal: invoiceAmount,
      totalBilling: invoiceAmount,
      totalFacturado: invoiceAmount,
      importeFacturas: invoiceAmount,
      facturacionVisible: invoiceAmount,
      facturacionTotal: invoiceAmount,

      usersCount,
      usuariosCount: usersCount,
      totalUsers: usersCount,
      totalUsuarios: usersCount,
      activeUsers: Math.max(usersCount, safeNumber(summary.activeUsers, 0)),
      usuariosActivos: Math.max(usersCount, safeNumber(summary.usuariosActivos, 0)),

      clientsCount,
      clientesCount: clientsCount,
      customersCount: clientsCount,
      totalClients: clientsCount,
      totalClientes: clientsCount,
      totalCustomers: clientsCount,
      activeClients: Math.max(clientsCount, safeNumber(summary.activeClients, 0)),
      clientesActivos: Math.max(clientsCount, safeNumber(summary.clientesActivos, 0)),
    };

    setSummary(nextSummary, {
      replace: false,
    });

    setDashboard(
      {
        ...dashboard,

        summary: nextSummary,
        stats: nextSummary,
        metrics: nextSummary,
        totals: nextSummary,
        counts: nextSummary,

        widgets: safeArray(homeState.widgets),

        tickets,
        incidencias: tickets,
        ticketsTotal: ticketsCount,
        incidenciasTotal: ticketsCount,
        totalTickets: ticketsCount,
        totalIncidencias: ticketsCount,

        invoices,
        facturas: invoices,
        invoicesTotal: invoicesCount,
        facturasTotal: invoicesCount,
        totalInvoices: invoicesCount,
        totalFacturas: invoicesCount,

        users,
        usuarios: users,
        usersTotal: usersCount,
        usuariosTotal: usersCount,
        totalUsers: usersCount,
        totalUsuarios: usersCount,

        clients,
        clientes: clients,
        customers: clients,
        clientsTotal: clientsCount,
        clientesTotal: clientsCount,
        customersTotal: clientsCount,
        totalClients: clientsCount,
        totalClientes: clientsCount,
        totalCustomers: clientsCount,

        activity,
        activities: activity,
        recent: activity,
        recentActivity: activity,
      },
      {
        replace: false,
      }
    );

    homeState.ticketsRemoteCount = Math.max(homeState.ticketsRemoteCount, ticketsCount);
    homeState.invoicesRemoteCount = Math.max(homeState.invoicesRemoteCount, invoicesCount);
    homeState.usersRemoteCount = Math.max(homeState.usersRemoteCount, usersCount);
    homeState.clientsRemoteCount = Math.max(homeState.clientsRemoteCount, clientsCount);
    homeState.remoteCount = Math.max(homeState.remoteCount, ticketsCount);

    return nextSummary;
  }

  function syncDashboardPayload(payload = null, options = {}) {
    const opts = safeObject(options);

    const normalizedResponse = safeObject(
      normalizeHomeDashboardResponse?.(payload) ||
        payload
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

    const normalizedDashboard =
      normalizeHomeDashboard(dashboard);

    const requestId = safeText(
      first(
        opts.requestId,
        normalizedResponse.requestId,
        normalizedResponse.meta?.requestId,
        normalizedDashboard.requestId,
        normalizedDashboard.meta?.requestId,
        homeState.requestId,
        ""
      ),
      ""
    );

    const lastSyncAt = safeText(
      first(
        opts.lastSyncAt,
        normalizedResponse.lastSyncAt,
        normalizedResponse.updatedAt,
        normalizedResponse.generatedAt,
        normalizedDashboard.updatedAt,
        normalizedDashboard.generatedAt,
        normalizedDashboard.meta?.updatedAt,
        homeState.lastSyncAt,
        nowIso()
      ),
      nowIso()
    );

    syncHomeStateFromDashboard(
      normalizedDashboard,
      {
        replace: opts.replace === true,
        requestId,
        lastSyncAt,
      }
    );

    replaceHomeStore(
      {
        dashboard: normalizedDashboard,
        requestId,
        lastSyncAt,
      },
      {
        preserveExisting: opts.preserveExisting !== false,
        reason: safeText(opts.source, "homeView:syncDashboardPayload"),
      }
    );

    setRequestId(requestId);
    setLastSyncAt(lastSyncAt);

    ensureSummaryAliases();

    setLoaded(true);
    setHydrated(true);
    clearHomeError();

    if (opts.writeCache !== false) {
      writeCachePayload();
    }

    safeLog("dashboard synced", {
      tickets: safeArray(homeState.tickets).length,
      invoices: safeArray(homeState.invoices).length,
      users: safeArray(homeState.users).length,
      clients: safeArray(homeState.clients).length,
      requestId,
    });

    return normalizedDashboard;
  }

  /* =========================================================
     OPTIONAL MODULE FALLBACKS
  ========================================================= */

  async function importOptionalModule(key = "", path = "") {
    const cacheKey = safeText(key || path, "");
    const modulePath = safeText(path, "");

    if (
      !cacheKey ||
      !modulePath
    ) {
      return null;
    }

    if (optionalModulesCache.has(cacheKey)) {
      return optionalModulesCache.get(cacheKey);
    }

    try {
      const module = await withTimeout(
        import(modulePath),
        OPTIONAL_IMPORT_TIMEOUT_MS,
        `OPTIONAL_IMPORT_TIMEOUT:${cacheKey}`
      );

      optionalModulesCache.set(cacheKey, module || null);

      return module || null;
    } catch (error) {
      optionalModulesCache.set(cacheKey, null);

      if (!optionalModuleWarned.has(cacheKey)) {
        optionalModuleWarned.add(cacheKey);
        safeWarn(`Módulo opcional no disponible: ${cacheKey}`, error);
      }

      return null;
    }
  }

  async function loadOptionalUsuarios({ force = false } = {}) {
    try {
      const apiModule = await importOptionalModule("usuarios.api", "../usuarios/usuarios.api.js");
      const storeModule = await importOptionalModule("usuarios.store", "../usuarios/usuarios.store.js");

      try {
        apiModule?.hydrateFromCache?.({
          freshOnly: true,
        });
      } catch {}

      if (isFunction(apiModule?.loadUsuarios)) {
        await apiModule.loadUsuarios({
          force,
          silent: true,
        });
      }

      const items = normalizeHomeUsers(
        first(
          storeModule?.getUsuarios?.(),
          storeModule?.getUsers?.(),
          apiModule?.getUsuarios?.(),
          apiModule?.getUsers?.(),
          apiModule?.usuariosState?.items,
          []
        )
      );

      if (items.length) {
        const merged = uniqueBy(
          [
            ...safeArray(homeState.users),
            ...items,
          ],
          getUserId
        );

        setUsers(merged, {
          remoteCount: merged.length,
        });

        return merged;
      }
    } catch (error) {
      safeWarn("Fallback usuarios falló.", error);
    }

    return safeArray(homeState.users);
  }

  async function loadOptionalClientes({ force = false } = {}) {
    try {
      const apiModule = await importOptionalModule("clientes.api", "../clientes/clientes.api.js");
      const storeModule = await importOptionalModule("clientes.store", "../clientes/clientes.store.js");

      try {
        apiModule?.hydrateFromCache?.();
      } catch {}

      if (isFunction(apiModule?.loadClientes)) {
        await apiModule.loadClientes({
          force,
          silent: true,
        });
      }

      const items = normalizeHomeClients(
        first(
          storeModule?.getClientes?.(),
          storeModule?.getClients?.(),
          apiModule?.getClientes?.(),
          apiModule?.getClients?.(),
          apiModule?.clientesState?.items,
          []
        )
      );

      if (items.length) {
        const merged = uniqueBy(
          [
            ...safeArray(homeState.clients),
            ...items,
          ],
          getClientId
        );

        setClients(merged, {
          remoteCount: merged.length,
        });

        return merged;
      }
    } catch (error) {
      safeWarn("Fallback clientes falló.", error);
    }

    return safeArray(homeState.clients);
  }

  async function loadOptionalFacturas({ force = false } = {}) {
    try {
      const apiModule = await importOptionalModule("facturas.api", "../facturas/facturas.api.js");
      const storeModule = await importOptionalModule("facturas.store", "../facturas/facturas.store.js");

      try {
        apiModule?.hydrateFromCache?.();
      } catch {}

      const loadFn =
        apiModule?.loadFacturas ||
        apiModule?.loadInvoices ||
        apiModule?.fetchFacturas ||
        apiModule?.fetchInvoices;

      if (isFunction(loadFn)) {
        await loadFn({
          force,
          silent: true,
        });
      }

      const items = normalizeHomeInvoices(
        first(
          storeModule?.getFacturas?.(),
          storeModule?.getInvoices?.(),
          apiModule?.getFacturas?.(),
          apiModule?.getInvoices?.(),
          apiModule?.facturasState?.items,
          []
        )
      );

      if (items.length) {
        const merged = uniqueBy(
          [
            ...safeArray(homeState.invoices),
            ...items,
          ],
          getInvoiceId
        );

        setInvoices(merged, {
          remoteCount: merged.length,
        });

        return merged;
      }
    } catch (error) {
      safeWarn("Fallback facturas falló.", error);
    }

    return safeArray(homeState.invoices);
  }

  async function loadSecondaryCollections({ force = false } = {}) {
    const before = {
      users: safeArray(homeState.users).length,
      clients: safeArray(homeState.clients).length,
      invoices: safeArray(homeState.invoices).length,
    };

    await Promise.allSettled([
      loadOptionalClientes({ force }),
      loadOptionalUsuarios({ force }),
      loadOptionalFacturas({ force }),
    ]);

    const activity = safeArray(homeState.activity).length
      ? normalizeHomeActivityList(homeState.activity)
      : buildActivityFromData();

    setRecent(activity);
    ensureSummaryAliases();

    mergeHomeStore(
      {
        dashboard: safeObject(homeState.dashboard),
        summary: safeObject(homeState.summary),
        widgets: safeArray(homeState.widgets),

        tickets: getTickets(),

        invoices: safeArray(homeState.invoices),
        facturas: safeArray(homeState.invoices),

        users: safeArray(homeState.users),
        usuarios: safeArray(homeState.users),

        clients: safeArray(homeState.clients),
        clientes: safeArray(homeState.clients),
        customers: safeArray(homeState.clients),

        activity,
        recent: activity,
        recentActivity: activity,
      },
      {
        preserveExisting: true,
        reason: "homeView:secondaryCollections",
      }
    );

    safeLog("secondary collections sync", {
      before,
      after: {
        users: safeArray(homeState.users).length,
        clients: safeArray(homeState.clients).length,
        invoices: safeArray(homeState.invoices).length,
      },
    });

    return {
      users: safeArray(homeState.users),
      clients: safeArray(homeState.clients),
      invoices: safeArray(homeState.invoices),
    };
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      const storeDashboard = getHomeDashboardStore?.();

      if (hasOwnKeys(storeDashboard)) {
        syncDashboardPayload(
          storeDashboard,
          {
            writeCache: false,
            preserveExisting: true,
            source: "store-dashboard",
          }
        );

        hydrated = true;
      }
    } catch {}

    try {
      const apiCache = hydrateHomeApiFromCache?.();

      if (
        apiCache?.dashboard ||
        hasOwnKeys(apiCache)
      ) {
        syncDashboardPayload(
          apiCache.dashboard || apiCache,
          {
            requestId: apiCache.requestId || "",
            lastSyncAt: apiCache.lastSyncAt || "",
            writeCache: false,
            preserveExisting: true,
            source: "api-cache",
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

      if (tickets.length) {
        const mergedTickets = uniqueBy(
          [
            ...safeArray(homeState.tickets),
            ...tickets,
          ],
          getStableTicketId
        );

        setTickets(mergedTickets, {
          remoteCount: Math.max(
            mergedTickets.length,
            safeNumber(homeState.ticketsRemoteCount, 0)
          ),
        });

        hydrated = true;
      }
    } catch {}

    const invoices = normalizeHomeInvoices(
      first(
        homeState.invoices,
        getHomeInvoicesStore?.(),
        []
      )
    );

    const users = normalizeHomeUsers(
      first(
        homeState.users,
        getHomeUsersStore?.(),
        []
      )
    );

    const clients = normalizeHomeClients(
      first(
        homeState.clients,
        getHomeClientsStore?.(),
        []
      )
    );

    const activity = normalizeHomeActivityList(
      first(
        homeState.activity,
        getHomeActivityStore?.(),
        []
      )
    );

    if (invoices.length) {
      setInvoices(invoices, {
        remoteCount: invoices.length,
      });
    }

    if (users.length) {
      setUsers(users, {
        remoteCount: users.length,
      });
    }

    if (clients.length) {
      setClients(clients, {
        remoteCount: clients.length,
      });
    }

    if (activity.length) {
      setRecent(activity, {
        remoteCount: activity.length,
      });
    }

    ensureSummaryAliases();

    setHydrated(Boolean(hydrated || homeState.hydrated));

    return Boolean(hydrated);
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
    homeState.ticketsRemoteCount = Math.max(0, safeNumber(homeState.ticketsRemoteCount, homeState.tickets.length));
    homeState.invoicesRemoteCount = Math.max(0, safeNumber(homeState.invoicesRemoteCount, homeState.invoices.length));
    homeState.usersRemoteCount = Math.max(0, safeNumber(homeState.usersRemoteCount, homeState.users.length));
    homeState.clientsRemoteCount = Math.max(0, safeNumber(homeState.clientsRemoteCount, homeState.clients.length));

    homeState.requestId = safeText(homeState.requestId, "");
    homeState.lastSyncAt = safeText(homeState.lastSyncAt, "");

    ensureSummaryAliases();

    return homeState;
  }

  function markIdle() {
    setLoading(false);
    setRefreshing(false);
  }

  function markLoadedOk() {
    const tickets = getTickets();

    setTickets(tickets, {
      remoteCount: Math.max(
        safeNumber(homeState.ticketsRemoteCount, 0),
        safeNumber(homeState.remoteCount, 0),
        tickets.length
      ),
    });

    if (!safeArray(homeState.activity).length) {
      setRecent(buildActivityFromData());
    }

    ensureSummaryAliases();

    setLoaded(true);
    setHydrated(true);
    clearHomeError();

    markIdle();

    return homeState;
  }

  function clearTransientState() {
    setCreating(false);
    setOpeningTicketId("");
    setSelectedTicketId("");
    setNavigatingAction("");
  }

  /* =========================================================
     PAGINATION
  ========================================================= */

  function getPaginationMeta(items = []) {
    const rows = safeArray(items);
    const page = safeNumber(homeState.page, 1);
    const pageSize = safeNumber(homeState.pageSize, PAGE_SIZE);
    const remoteCount = Math.max(
      rows.length,
      safeNumber(homeState.ticketsRemoteCount, rows.length)
    );

    try {
      return paginateHomeItems(rows, page, pageSize || PAGE_SIZE);
    } catch {
      const size = Math.max(1, pageSize || PAGE_SIZE);
      const totalPages = Math.max(1, Math.ceil((remoteCount || 1) / size));
      const nextPage = Math.min(Math.max(1, page), totalPages);
      const start = (nextPage - 1) * size;
      const pageItems = rows.slice(start, start + size);

      return {
        items: pageItems,
        pageItems,
        page: nextPage,
        currentPage: nextPage,
        pageSize: size,
        totalPages,
        total: remoteCount,
        totalCount: remoteCount,
        hasPrev: nextPage > 1,
        hasNext: nextPage < totalPages,
        from: remoteCount && pageItems.length ? start + 1 : 0,
        to: remoteCount ? Math.min(start + pageItems.length, remoteCount) : 0,
      };
    }
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(homeState.page, 1) !== pagination.page) {
      setPage(pagination.page);
    }

    return pagination;
  }

  /* =========================================================
     DOM
  ========================================================= */

  function getContainer() {
    if (!isBrowser()) {
      return null;
    }

    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("[data-view-root]") ||
      document.querySelector("[data-router-view]") ||
      null
    );
  }

  function setViewBusy(container, busy = false) {
    if (!container) {
      return false;
    }

    try {
      container.setAttribute("aria-busy", busy ? "true" : "false");
      return true;
    } catch {}

    return false;
  }

  function decorateAvatarFallbacks(container) {
    if (!container) {
      return;
    }

    const images = container.querySelectorAll("[data-avatar-image='true']");

    images.forEach((img) => {
      if (img.dataset.homeFallbackBound === "true") {
        return;
      }

      img.dataset.homeFallbackBound = "true";

      img.addEventListener(
        "error",
        () => {
          try {
            img.hidden = true;
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
    return Boolean(!destroyed && token === renderToken);
  }

  function buildDashboardForTemplate() {
    ensureSummaryAliases();

    const tickets = getTickets();
    const invoices = normalizeHomeInvoices(homeState.invoices);
    const users = normalizeHomeUsers(homeState.users);
    const clients = normalizeHomeClients(homeState.clients);

    const activity = safeArray(homeState.activity).length
      ? normalizeHomeActivityList(homeState.activity)
      : buildActivityFromData();

    const dashboard = {
      ...safeObject(homeState.dashboard),

      summary: safeObject(homeState.summary),
      stats: safeObject(homeState.summary),
      metrics: safeObject(homeState.summary),
      totals: safeObject(homeState.summary),
      counts: safeObject(homeState.summary),

      widgets: safeArray(homeState.widgets),
      cards: safeArray(homeState.widgets),
      kpis: safeArray(homeState.widgets),
      blocks: safeArray(homeState.widgets),

      tickets,
      incidencias: tickets,

      facturas: invoices,
      invoices,

      users,
      usuarios: users,

      clients,
      clientes: clients,
      customers: clients,

      activity,
      activities: activity,
      recent: activity,
      recentActivity: activity,

      ticketsTotal: Math.max(tickets.length, safeNumber(homeState.ticketsRemoteCount, tickets.length)),
      incidenciasTotal: Math.max(tickets.length, safeNumber(homeState.ticketsRemoteCount, tickets.length)),
      totalTickets: Math.max(tickets.length, safeNumber(homeState.ticketsRemoteCount, tickets.length)),
      totalIncidencias: Math.max(tickets.length, safeNumber(homeState.ticketsRemoteCount, tickets.length)),

      invoicesTotal: Math.max(invoices.length, safeNumber(homeState.invoicesRemoteCount, invoices.length)),
      facturasTotal: Math.max(invoices.length, safeNumber(homeState.invoicesRemoteCount, invoices.length)),
      totalInvoices: Math.max(invoices.length, safeNumber(homeState.invoicesRemoteCount, invoices.length)),
      totalFacturas: Math.max(invoices.length, safeNumber(homeState.invoicesRemoteCount, invoices.length)),

      usersTotal: Math.max(users.length, safeNumber(homeState.usersRemoteCount, users.length)),
      usuariosTotal: Math.max(users.length, safeNumber(homeState.usersRemoteCount, users.length)),
      totalUsers: Math.max(users.length, safeNumber(homeState.usersRemoteCount, users.length)),
      totalUsuarios: Math.max(users.length, safeNumber(homeState.usersRemoteCount, users.length)),

      clientsTotal: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),
      clientesTotal: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),
      customersTotal: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),
      totalClients: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),
      totalClientes: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),
      totalCustomers: Math.max(clients.length, safeNumber(homeState.clientsRemoteCount, clients.length)),

      updatedAt: homeState.lastSyncAt || homeState.dashboard?.updatedAt || "",
      generatedAt: homeState.dashboard?.generatedAt || homeState.lastSyncAt || "",
      requestId: homeState.requestId,
    };

    return dashboard;
  }

  function buildTemplatePayload() {
    const dashboard = buildDashboardForTemplate();
    const tickets = getTickets();
    const pagination = clampPageAgainstItems(tickets);

    const role = getCurrentRole();
    const user = getCurrentUser();

    const remoteCount = Math.max(
      tickets.length,
      safeNumber(homeState.remoteCount, tickets.length),
      safeNumber(homeState.ticketsRemoteCount, tickets.length)
    );

    return {
      user,
      role,

      dashboard,
      summary: homeState.summary,
      stats: homeState.summary,
      metrics: homeState.summary,
      totals: homeState.summary,

      widgets: safeArray(homeState.widgets),

      tickets,
      incidencias: tickets,

      facturas: safeArray(homeState.invoices),
      invoices: safeArray(homeState.invoices),

      users: safeArray(homeState.users),
      usuarios: safeArray(homeState.users),

      clients: safeArray(homeState.clients),
      clientes: safeArray(homeState.clients),
      customers: safeArray(homeState.clients),

      activity: safeArray(dashboard.activity),
      recentActivity: safeArray(dashboard.activity),
      recent: safeArray(dashboard.activity),

      totalCount: remoteCount,
      remoteCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,

      requestId: homeState.requestId,
      lastUpdatedAt: homeState.lastSyncAt || "",

      state: {
        ...getHomeStateSnapshot(),

        user,
        role,

        dashboard,
        summary: homeState.summary,
        stats: homeState.summary,
        metrics: homeState.summary,
        totals: homeState.summary,

        tickets,
        incidencias: tickets,

        facturas: safeArray(homeState.invoices),
        invoices: safeArray(homeState.invoices),

        users: safeArray(homeState.users),
        usuarios: safeArray(homeState.users),

        clients: safeArray(homeState.clients),
        clientes: safeArray(homeState.clients),
        customers: safeArray(homeState.clients),

        activity: safeArray(dashboard.activity),
        recentActivity: safeArray(dashboard.activity),
        recent: safeArray(dashboard.activity),

        totalCount: remoteCount,
        remoteCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: pagination.totalPages,
      },
    };
  }

  function buildHtml() {
    ensureBaseState();

    const payload = buildTemplatePayload();

    return `
      <section
        class="panel-content dashboard ready"
        data-view="home"
        data-home-scope="${SCOPE}"
      >
        <div class="content-wrapper home-view-wrapper">
          ${renderHomeTemplate(payload)}
        </div>
      </section>
    `;
  }

  function render(...args) {
    if (destroyed) {
      return null;
    }

    if (!assertHomeRoute("render", args)) {
      return null;
    }

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

    try {
      setViewBusy(container, Boolean(homeState.loading || homeState.refreshing));

      container.innerHTML = buildHtml();

      decorateDom(container);

      setHydrated(true);

      setViewBusy(container, false);

      emit("home:rendered", {
        route: getAppRoutePath(),
        publicPath: getAppPublicPath(),
        itemsCount: getTickets().length,
        page: homeState.page,
      });

      return container;
    } catch (error) {
      setViewBusy(container, false);
      safeError("render() falló.", error);

      try {
        container.innerHTML = renderHomeErrorState(safeErrorMessage(error));
      } catch {}

      return container;
    }
  }

  function rerender(...args) {
    if (destroyed) {
      return null;
    }

    const container = render(...args);

    if (
      container &&
      !destroyed
    ) {
      bind();
    }

    return container;
  }

  /* =========================================================
     DATA LOAD
  ========================================================= */

  async function loadTicketsFallback({ force = false } = {}) {
    try {
      await loadIncidencias({
        force,
      });

      const tickets = getTicketsFromStore();

      if (tickets.length) {
        setTickets(tickets, {
          remoteCount: Math.max(
            tickets.length,
            safeNumber(homeState.ticketsRemoteCount, tickets.length)
          ),
        });

        setRecent(buildActivityFromData());

        ensureSummaryAliases();
      }

      return tickets;
    } catch (error) {
      safeWarn("Fallback incidencias falló.", error);
      return getTickets();
    }
  }

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) {
      return getTickets();
    }

    const hasVisibleData = Boolean(
      getTickets().length ||
        safeArray(homeState.invoices).length ||
        safeArray(homeState.users).length ||
        safeArray(homeState.clients).length ||
        safeArray(homeState.activity).length ||
        hasOwnKeys(homeState.summary) ||
        hasOwnKeys(homeState.dashboard)
    );

    clearHomeError();

    if (
      !hasVisibleData &&
      !silent
    ) {
      setLoading(true);
      setRefreshing(false);
    } else if (asRefresh) {
      setLoading(false);
      setRefreshing(true);
    }

    if (!destroyed) {
      rerender({
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
        reason: "load-data:start",
      });
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
        source: asRefresh
          ? "homeView:refreshHomeDashboard"
          : "homeView:loadHomeDashboard",
      });

      await loadSecondaryCollections({
        force,
      });

      if (!getTickets().length) {
        await loadTicketsFallback({
          force,
        });
      }

      if (!safeArray(homeState.activity).length) {
        setRecent(buildActivityFromData());
      }

      setLastSyncAt(homeState.lastSyncAt || nowIso());

      markLoadedOk();
      writeCachePayload();

      emit("home:loaded", {
        dashboard: homeState.dashboard,
        summary: homeState.summary,
        tickets: getTickets(),
        facturas: homeState.invoices,
        invoices: homeState.invoices,
        users: homeState.users,
        usuarios: homeState.users,
        clients: homeState.clients,
        clientes: homeState.clients,
        force,
        silent,
        asRefresh,
      });

      safeLog("loaded", {
        tickets: getTickets().length,
        invoices: safeArray(homeState.invoices).length,
        users: safeArray(homeState.users).length,
        clients: safeArray(homeState.clients).length,
      });

      return getTickets();
    } catch (error) {
      const message = safeErrorMessage(error);

      await Promise.allSettled([
        loadTicketsFallback({
          force,
        }),
        loadSecondaryCollections({
          force,
        }),
      ]);

      const recoveredTickets = getTickets();

      if (
        recoveredTickets.length ||
        safeArray(homeState.invoices).length ||
        safeArray(homeState.users).length ||
        safeArray(homeState.clients).length ||
        hasOwnKeys(homeState.summary)
      ) {
        clearHomeError();
        setLoaded(true);
        setHydrated(true);

        if (!safeArray(homeState.activity).length) {
          setRecent(buildActivityFromData());
        }

        setLastSyncAt(homeState.lastSyncAt || nowIso());

        markIdle();
        ensureSummaryAliases();
        writeCachePayload();

        emit("home:loaded:fallback", {
          tickets: recoveredTickets,
          facturas: homeState.invoices,
          invoices: homeState.invoices,
          users: homeState.users,
          usuarios: homeState.users,
          clients: homeState.clients,
          clientes: homeState.clients,
          error,
          message,
        });

        return recoveredTickets;
      }

      setError(message);
      setLoaded(true);
      setHydrated(true);
      markIdle();

      if (!silent) {
        showToast(message, "error");
      }

      emit("home:load:error", {
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
    reason = "render-and-load",
  } = {}) {
    if (
      !assertHomeRoute(reason, [
        {
          route: {
            path: HOME_PATH,
            viewKey: "home",
          },
          canonicalPath: HOME_PATH,
          publicPath: HOME_PATH,
          reason,
        },
      ])
    ) {
      return api;
    }

    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    render({
      route: {
        path: HOME_PATH,
        viewKey: "home",
      },
      canonicalPath: HOME_PATH,
      publicPath: HOME_PATH,
      reason,
    });

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

    if (
      !assertHomeRoute(`${reason}:after-load`, [
        {
          route: {
            path: HOME_PATH,
            viewKey: "home",
          },
          canonicalPath: HOME_PATH,
          publicPath: HOME_PATH,
        },
      ])
    ) {
      return api;
    }

    render({
      route: {
        path: HOME_PATH,
        viewKey: "home",
      },
      canonicalPath: HOME_PATH,
      publicPath: HOME_PATH,
      reason: `${reason}:final-render`,
    });

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    return api;
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function normalizeSpaRoute(route = "") {
    const raw = safeText(route, "");

    if (!raw) {
      return "";
    }

    const lowered = raw.toLowerCase();

    if (
      lowered.startsWith("javascript:") ||
      lowered.startsWith("mailto:") ||
      lowered.startsWith("tel:") ||
      lowered.startsWith("data:") ||
      lowered.startsWith("vbscript:")
    ) {
      return "";
    }

    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw, getBaseOrigin());

        if (
          isBrowser() &&
          url.origin !== window.location.origin
        ) {
          return raw;
        }

        return normalizeSpaRoute(
          `${url.pathname}${url.search || ""}${url.hash || ""}`
        );
      } catch {
        return raw;
      }
    }

    const normalized = raw.startsWith("/")
      ? raw
      : `/${raw}`;

    const [pathWithMaybeQuery, hash = ""] = normalized.split("#");
    const [path, query = ""] = pathWithMaybeQuery.split("?");

    const cleanPath = normalizePathnameOnly(path || HOME_PATH);
    const mappedPath = ROUTE_ALIASES[cleanPath] || cleanPath;

    return [
      mappedPath,
      query ? `?${query}` : "",
      hash ? `#${hash}` : "",
    ].join("");
  }

  async function navigateTo(route = "", options = {}) {
    const target = normalizeSpaRoute(route);

    if (!target) {
      return false;
    }

    const opts = {
      source: SOURCE,
      ...safeObject(options),
    };

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
      safeWarn("navigateTo vía router falló.", {
        target,
        error,
      });
    }

    try {
      if (
        isBrowser() &&
        target.startsWith("/")
      ) {
        window.history.pushState({}, "", target);

        try {
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.dispatchEvent(new Event("popstate"));
        }

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

  async function handleNavigateAction(action = "", route = "", payload = {}) {
    const actionName = safeText(action, "navigate");
    const target = normalizeSpaRoute(route);

    if (!target) {
      return false;
    }

    if (homeState.navigatingAction) {
      return false;
    }

    setNavigatingAction(actionName);

    rerender({
      route: {
        path: HOME_PATH,
        viewKey: "home",
      },
      canonicalPath: HOME_PATH,
      publicPath: HOME_PATH,
      reason: "navigate:start",
    });

    await waitForPaint();

    try {
      return await navigateTo(target, {
        source: "home",
        action: actionName,
        payload,
      });
    } finally {
      setNavigatingAction("");

      if (!destroyed) {
        rerender({
          route: {
            path: HOME_PATH,
            viewKey: "home",
          },
          canonicalPath: HOME_PATH,
          publicPath: HOME_PATH,
          reason: "navigate:end",
        });
      }
    }
  }

  /* =========================================================
     MODAL BRIDGES
  ========================================================= */

  function openTicketModalBridge(detail = null) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) {
      return false;
    }

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
      safeWarn("OnionIncidenciasModal import directo falló.", error);
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
      safeWarn("OnionIncidenciasModal hook global falló.", error);
    }

    emit("incidencias:modal:open", {
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
      if (
        isBrowser() &&
        isFunction(window?.OnionIncidenciasModal?.update)
      ) {
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
      safeWarn("OnionIncidenciasCreateModal hook falló.", error);
    }

    try {
      if (isFunction(IncidenciasCreateView?.open)) {
        IncidenciasCreateView.open(payload);
        return true;
      }
    } catch (error) {
      safeWarn("IncidenciasCreateView.open falló.", error);
    }

    emit("incidencias:create-modal:open", {
      draft: payload,
      source: "homeView:fallback",
    });

    return true;
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

    const hasReadyMarker =
      knownReadyKeys.some((key) => key in state);

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
    return Boolean(
      !destroyed &&
        isDomReady() &&
        isAppReady()
    );
  }

  function throttleCreateClick() {
    const current = nowMs();

    if (current - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = current;

    return true;
  }

  function throttleOpenTicketClick() {
    const current = nowMs();

    if (current - lastOpenTicketClickAt < OPEN_TICKET_THROTTLE_MS) {
      return false;
    }

    lastOpenTicketClickAt = current;

    return true;
  }

  function flushPendingCreate() {
    if (!pendingCreateRequest) {
      return false;
    }

    if (!canInteract()) {
      return false;
    }

    pendingCreateRequest = false;
    lastCreateClickAt = 0;

    setCreating(false);

    void handleCreateIncidencia({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (
      homeState.loading ||
      homeState.refreshing
    ) {
      return homeState.page || 1;
    }

    const tickets = getTickets();
    const pagination = getPaginationMeta(tickets);

    const totalPages = Math.max(
      1,
      safeNumber(pagination.totalPages, 1)
    );

    const nextPage = Math.min(
      Math.max(1, safeNumber(page, homeState.page || 1)),
      totalPages
    );

    setPage(nextPage);

    rerender({
      route: {
        path: HOME_PATH,
        viewKey: "home",
      },
      canonicalPath: HOME_PATH,
      publicPath: HOME_PATH,
      reason: "pagination",
    });

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

    setPageSize(nextSize);
    setPage(1);

    rerender({
      route: {
        path: HOME_PATH,
        viewKey: "home",
      },
      canonicalPath: HOME_PATH,
      publicPath: HOME_PATH,
      reason: "page-size",
    });

    return nextSize;
  }

  async function handleOpenTicket(ticketId = "", options = {}) {
    const id = safeText(ticketId, "");
    const opts = safeObject(options);

    if (!id) {
      return null;
    }

    if (
      !opts.skipThrottle &&
      !throttleOpenTicketClick()
    ) {
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
      setOpeningTicketId(id);
      setSelectedTicketId(id);

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

      if (
        hasOwnKeys(localSnapshot) &&
        opts.openImmediate !== false
      ) {
        openTicketModalBridge({
          ...localSnapshot,
          meta: {
            ...safeObject(localSnapshot.meta),
            openingFromHome: true,
            detailLoading: true,
          },
        });
      }

      rerender({
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
        reason: "open-ticket:start",
      });

      await waitForPaint();

      try {
        const detail = await openTicketAction({
          ticketId: id,
          incidenciaId: id,
          preferFresh: opts.preferFresh !== false,
          silent: opts.silent !== false,
        });

        const finalDetail = hasOwnKeys(detail)
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

        emit("home:ticket:open:success", {
          ticketId: id,
          incidenciaId: id,
          detail: finalDetail,
          source: safeText(opts.source, "home"),
        });

        return finalDetail;
      } catch (error) {
        safeWarn("handleOpenTicket falló.", error);

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

          emit("home:ticket:open:fallback", {
            ticketId: id,
            incidenciaId: id,
            detail: localSnapshot,
            error,
          });

          return localSnapshot;
        }

        showToast("No se pudo abrir la incidencia.", "error");

        emit("home:ticket:open:error", {
          ticketId: id,
          incidenciaId: id,
          error,
        });

        return null;
      } finally {
        setOpeningTicketId("");

        inflightOpenTicket = null;
        inflightOpenTicketId = "";

        if (!destroyed) {
          rerender({
            route: {
              path: HOME_PATH,
              viewKey: "home",
            },
            canonicalPath: HOME_PATH,
            publicPath: HOME_PATH,
            reason: "open-ticket:end",
          });
        }
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
      safeWarn("handleCopyTicketId falló.", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  async function handleCreateIncidencia(options = {}) {
    const opts = safeObject(options);
    const skipThrottle = Boolean(opts.skipThrottle);

    if (
      homeState.creating &&
      !pendingCreateRequest
    ) {
      return false;
    }

    if (
      !skipThrottle &&
      !throttleCreateClick()
    ) {
      return false;
    }

    if (!canInteract()) {
      pendingCreateRequest = true;
      setCreating(true);

      rerender({
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
        reason: "create:pending",
      });

      showToast("Preparando formulario...", "info");

      return false;
    }

    pendingCreateRequest = false;
    setCreating(true);

    rerender({
      route: {
        path: HOME_PATH,
        viewKey: "home",
      },
      canonicalPath: HOME_PATH,
      publicPath: HOME_PATH,
      reason: "create:start",
    });

    await waitForPaint();

    try {
      const opened = openCreateModalBridge(opts.draft || {});

      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
      }

      emit("home:create:open", {
        draft: opts.draft || {},
        source: "home",
      });

      return opened;
    } finally {
      setCreating(false);

      if (!destroyed) {
        rerender({
          route: {
            path: HOME_PATH,
            viewKey: "home",
          },
          canonicalPath: HOME_PATH,
          publicPath: HOME_PATH,
          reason: "create:end",
        });
      }
    }
  }

  async function handleOpenInvoice(invoiceId = "") {
    const id = safeText(invoiceId, "");

    await handleNavigateAction("go-facturas", ROUTES.FACTURAS);

    if (id) {
      emit("facturas:open-requested", {
        invoiceId: id,
        facturaId: id,
        source: "home",
      });
    }

    return true;
  }

  async function openTicketFromExternalRequest(payload = {}) {
    const source = getEventPayload(payload);
    const ticketId = getTicketIdFromPayload(source);

    if (!ticketId) {
      showToast("No se pudo identificar la incidencia.", "error");
      return null;
    }

    if (
      !getTickets().length &&
      !homeState.loaded
    ) {
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

  async function copyHomeWidgetIdFromBindings({ widgetId = "" } = {}) {
    return handleCopyTicketId(widgetId);
  }

  async function openHomeWidgetFromBindings({
    widgetId = "",
    payload = {},
    navigate = false,
  } = {}) {
    const id = safeText(widgetId, "");

    if (!id) {
      return null;
    }

    const localTicket = findTicketById(id);

    if (localTicket) {
      return handleOpenTicket(id, {
        source: "home:bindings:widget",
        payload,
        detail: localTicket,
      });
    }

    if (navigate) {
      const route = safeText(
        first(
          payload?.route,
          payload?.href,
          ROUTES.INCIDENCIAS
        ),
        ROUTES.INCIDENCIAS
      );

      return handleNavigateAction("open-widget", route, payload);
    }

    emit("home:widget:open", {
      widgetId: id,
      payload,
    });

    return null;
  }

  async function navigateFromHomeBindingWrapper({
    route = "",
    payload = {},
    silent = false,
  } = {}) {
    const target = normalizeSpaRoute(route);

    if (!target) {
      return false;
    }

    if (
      payload?.ticketId ||
      payload?.incidenciaId
    ) {
      const ticketId = safeText(
        first(
          payload.ticketId,
          payload.incidenciaId
        ),
        ""
      );

      if (ticketId) {
        await handleOpenTicket(ticketId, {
          source: "home:bindings:navigate",
          payload,
        });

        return true;
      }
    }

    return navigateFromHomeAction({
      route: target,
      payload,
      silent,
    });
  }

  async function runHomeQuickActionWrapper({
    action = "",
    route = "",
    payload = {},
    silent = false,
  } = {}) {
    const key = normalizeKey(action);

    if (
      key === "create" ||
      key === "new" ||
      key === "create_ticket" ||
      key === "create_incidencia" ||
      key === "new_ticket" ||
      key === "new_incidencia"
    ) {
      return handleCreateIncidencia({
        draft: payload,
      });
    }

    return runHomeQuickAction({
      action,
      route,
      payload,
      silent,
    });
  }

  async function createFromHomeBindingWrapper({
    payload = {},
    draft = {},
  } = {}) {
    return handleCreateIncidencia({
      draft: first(draft, payload, {}),
    });
  }

  /* =========================================================
     NATIVE VIEW-SPECIFIC BINDINGS
  ========================================================= */

  function getNativeActionTarget(event) {
    return event?.target?.closest?.(NATIVE_ACTION_SELECTOR) || null;
  }

  function getDatasetAction(element = null) {
    return normalizeKey(
      first(
        element?.dataset?.homeAction,
        element?.dataset?.action,
        element?.getAttribute?.("data-home-action"),
        element?.getAttribute?.("data-action"),
        ""
      )
    );
  }

  function getTicketIdFromElement(element = null) {
    if (!element) {
      return "";
    }

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
        element.dataset?.widgetId,

        element.getAttribute?.("data-ticket-id"),
        element.getAttribute?.("data-incidencia-id"),
        element.getAttribute?.("data-ticket-code"),
        element.getAttribute?.("data-entity-id"),
        element.getAttribute?.("data-widget-id"),

        closestRow?.dataset?.ticketId,
        closestRow?.dataset?.incidenciaId,
        closestRow?.dataset?.ticketCode,
        closestRow?.dataset?.entityId,
        closestRow?.dataset?.widgetId,

        closestRow?.getAttribute?.("data-ticket-id"),
        closestRow?.getAttribute?.("data-incidencia-id"),
        closestRow?.getAttribute?.("data-ticket-code"),
        closestRow?.getAttribute?.("data-entity-id"),
        closestRow?.getAttribute?.("data-widget-id")
      ),
      ""
    );
  }

  function getInvoiceIdFromElement(element = null) {
    if (!element) {
      return "";
    }

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

  function shouldOpenTicketFromNativeTarget(element = null) {
    if (!element) {
      return false;
    }

    const ticketId = getTicketIdFromElement(element);

    if (!ticketId) {
      return false;
    }

    if (
      element.closest?.(".home-ticket-subject") ||
      element.closest?.(".home-detail-btn") ||
      element.closest?.("[data-ticket-row='true'] .home-ticket-subject") ||
      element.closest?.("[data-ticket-row='true'] .home-detail-btn")
    ) {
      return true;
    }

    const action = getDatasetAction(element);

    return [
      "open_ticket",
      "open_incidencia",
      "detail",
      "details",
      "view_ticket",
    ].includes(action);
  }

  function shouldCopyTicketFromNativeTarget(element = null) {
    if (!element) {
      return false;
    }

    const action = getDatasetAction(element);

    if (
      [
        "copy",
        "copy_id",
        "copy_widget_id",
        "copy_ticket_id",
        "copy_incidencia_id",
      ].includes(action)
    ) {
      return Boolean(getTicketIdFromElement(element));
    }

    return Boolean(element.closest?.(".home-ticket-id"));
  }

  function stopNativeEvent(event) {
    try {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    } catch {}
  }

  function bindNativeViewActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) {
        return;
      }

      const element = getNativeActionTarget(event);

      if (!element) {
        return;
      }

      const action = getDatasetAction(element);

      if (shouldOpenTicketFromNativeTarget(element)) {
        stopNativeEvent(event);

        await handleOpenTicket(
          getTicketIdFromElement(element),
          {
            source: "home:native",
          }
        );

        return;
      }

      if (shouldCopyTicketFromNativeTarget(element)) {
        stopNativeEvent(event);

        await handleCopyTicketId(
          getTicketIdFromElement(element)
        );

        return;
      }

      if (
        action === "prev_page" ||
        action === "pagination_prev"
      ) {
        stopNativeEvent(event);
        goPrevPage();
        return;
      }

      if (
        action === "next_page" ||
        action === "pagination_next"
      ) {
        stopNativeEvent(event);
        goNextPage();
        return;
      }

      if (
        action === "page" ||
        action === "go_page"
      ) {
        stopNativeEvent(event);

        const page = safeNumber(
          first(
            element.dataset?.page,
            element.getAttribute?.("data-page")
          ),
          homeState.page || 1
        );

        goToPage(page);

        return;
      }

      if (action === "open_invoice") {
        stopNativeEvent(event);
        await handleOpenInvoice(getInvoiceIdFromElement(element));
      }
    };

    const onChange = (event) => {
      if (destroyed) {
        return;
      }

      const target = event.target;

      const pageSizeField =
        target?.closest?.("[data-home-field='page-size']") ||
        target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(pageSizeField.value);
      }
    };

    container.addEventListener("click", onClick, true);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick, true);
        container.removeEventListener("change", onChange);
      } catch {}
    };
  }

  /* =========================================================
     EVENTS / BRIDGE
  ========================================================= */

  function emit(eventName = "", payload = {}, options = {}) {
    return emitHomeEvent(
      eventName,
      {
        source: SOURCE,
        version: VERSION,
        ...safeObject(payload),
      },
      options
    );
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      nativeCleanup?.();
    } catch {}

    nativeCleanup = null;

    try {
      bridgeCleanup?.();
    } catch {}

    bridgeCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function attachExternalListeners() {
    const cleanups = [];

    const onMutated = async (eventOrPayload = {}) => {
      if (destroyed) {
        return;
      }

      const payload = getEventPayload(eventOrPayload);

      await reload({
        force: true,
        asRefresh: true,
        silent: payload.silent !== false,
      });
    };

    const onOpenTicket = async (eventOrPayload = {}) => {
      if (destroyed) {
        return;
      }

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
        return openTicketFromExternalRequest({
          ticketId,
        });
      },

      openIncidencia(payload = {}) {
        return openTicketFromExternalRequest(payload);
      },

      openIncidenciaById(ticketId = "") {
        return openTicketFromExternalRequest({
          ticketId,
        });
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

      getTickets() {
        return api.getTickets();
      },

      getSnapshot() {
        return api.getSnapshot();
      },
    };

    try {
      if (
        AppCore?.modules &&
        isFunction(AppCore.modules.register)
      ) {
        AppCore.modules.register("Home", api, {
          overwrite: true,
          replace: true,
          source: SOURCE,
        });

        AppCore.modules.register("HomeView", api, {
          overwrite: true,
          replace: true,
          source: SOURCE,
        });

        AppCore.modules.register("OnionHomeBridge", bridge, {
          overwrite: true,
          replace: true,
          source: SOURCE,
        });
      } else if (
        AppCore?.modules &&
        typeof AppCore.modules === "object"
      ) {
        AppCore.modules.Home = api;
        AppCore.modules.HomeView = api;
        AppCore.modules.OnionHomeView = api;
        AppCore.modules.OnionHomeBridge = bridge;
      }
    } catch {}

    defineGlobalBridge("OnionHomeView", api);
    defineGlobalBridge("HomeView", api);
    defineGlobalBridge("OnionHomeBridge", bridge);
    defineGlobalBridge("HomeBridge", bridge);

    defineGlobalBridge(
      "openHomeTicket",
      (payload = {}) => openTicketFromExternalRequest(payload)
    );

    defineGlobalBridge(
      "openHomeIncidencia",
      (payload = {}) => openTicketFromExternalRequest(payload)
    );

    return true;
  }

  function bind() {
    cleanupBindings();

    if (destroyed) {
      return false;
    }

    registerHomeBridge();

    const container = getContainer();

    nativeCleanup = bindNativeViewActions(container);

    bindingsCleanup = bindHomeEvents({
      loadHomeDashboard: () =>
        reload({
          force: true,
          asRefresh: true,
        }),

      reload,

      openHomeWidgetAction: openHomeWidgetFromBindings,
      copyHomeWidgetIdAction: copyHomeWidgetIdFromBindings,
      exportHomeCsvAction,
      navigateFromHomeAction: navigateFromHomeBindingWrapper,
      runHomeQuickAction: runHomeQuickActionWrapper,
      createFromHomeAction: createFromHomeBindingWrapper,

      scope: SCOPE,
      container,
    });

    attachExternalListeners();

    return true;
  }

  /* =========================================================
     PUBLIC FLOW
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) {
      return api;
    }

    const incomingOptions = safeObject(options);

    if (
      !assertHomeRoute("reload", [
        {
          route: {
            path: HOME_PATH,
            viewKey: "home",
          },
          canonicalPath: HOME_PATH,
          publicPath: HOME_PATH,
          options: incomingOptions,
        },
      ])
    ) {
      return api;
    }

    if (inflightReload) {
      queuedReloadOptions = {
        ...(queuedReloadOptions || {}),
        ...incomingOptions,
        force: Boolean(queuedReloadOptions?.force || incomingOptions.force),
        asRefresh: Boolean(queuedReloadOptions?.asRefresh || incomingOptions.asRefresh),
        silent: Boolean(queuedReloadOptions?.silent ?? incomingOptions.silent),
      };

      return inflightReload;
    }

    inflightReload = (async () => {
      let currentOptions = incomingOptions;

      do {
        queuedReloadOptions = null;

        await renderAndLoad({
          ...currentOptions,
          reason: currentOptions.asRefresh
            ? "reload:refresh"
            : "reload",
        });

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

  async function init(...args) {
    if (destroyed) {
      destroyed = false;
    }

    if (!assertHomeRoute("init", args)) {
      return api;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (
      initialized &&
      !destroyed
    ) {
      registerHomeBridge();
      ensureBaseState();

      rerender({
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
        reason: "init:already-initialized",
      });

      flushPendingCreate();

      if (
        !homeState.loaded &&
        !inflightReload
      ) {
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
        reason: "init",
      });

      if (!destroyed) {
        bind();
      }

      flushPendingCreate();

      emit("home:init:done", {
        initialized,
        destroyed,
        itemsCount: getTickets().length,
      });

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

    emit("home:destroyed", {
      source: SOURCE,
    });

    safeLog("destroy");

    return true;
  }

  /* =========================================================
     SNAPSHOT
  ========================================================= */

  function getStateSnapshot() {
    ensureBaseState();

    const tickets = getTickets();
    const pagination = getPaginationMeta(tickets);
    const role = getCurrentRole();

    return sanitizePayload({
      ...getHomeStateSnapshot(),

      user: getCurrentUser(),
      role,
      isAdmin: isAdminRoleKey(role),

      initialized,
      destroyed,

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasQueuedReload: Boolean(queuedReloadOptions),
      hasInflightOpenTicket: Boolean(inflightOpenTicket),
      inflightOpenTicketId,

      pendingCreateRequest,

      itemsCount: tickets.length,
      ticketsCount: tickets.length,

      invoicesCount: safeArray(homeState.invoices).length,
      facturasCount: safeArray(homeState.invoices).length,

      usersCount: safeArray(homeState.users).length,
      usuariosCount: safeArray(homeState.users).length,

      clientsCount: safeArray(homeState.clients).length,
      clientesCount: safeArray(homeState.clients).length,

      ticketsRemoteCount: homeState.ticketsRemoteCount,
      invoicesRemoteCount: homeState.invoicesRemoteCount,
      usersRemoteCount: homeState.usersRemoteCount,
      clientsRemoteCount: homeState.clientsRemoteCount,

      pageItems: pagination.items,
      pagination,

      routeGuard: getRouteDebug([
        {
          route: {
            path: HOME_PATH,
            viewKey: "home",
          },
          canonicalPath: HOME_PATH,
          publicPath: HOME_PATH,
        },
      ]),

      apiSnapshot: getHomeApiSnapshot?.(),
      storeSnapshot: getHomeStoreSnapshot?.(),
      bindingsSnapshot: getHomeBindingsSnapshot?.(SCOPE),
      actionsSnapshot: getHomeActionsSnapshot?.(),
    });
  }

  function getSnapshot() {
    return sanitizePayload({
      source: SOURCE,
      version: VERSION,

      initialized,
      destroyed,

      hydrated: Boolean(homeState.hydrated),
      loaded: Boolean(homeState.loaded),
      loading: Boolean(homeState.loading),
      refreshing: Boolean(homeState.refreshing),
      creating: Boolean(homeState.creating),

      openingTicketId: homeState.openingTicketId,
      selectedTicketId: homeState.selectedTicketId,
      navigatingAction: homeState.navigatingAction,

      error: homeState.error,

      itemsCount: getTickets().length,
      invoicesCount: safeArray(homeState.invoices).length,
      usersCount: safeArray(homeState.users).length,
      clientsCount: safeArray(homeState.clients).length,
      activityCount: safeArray(homeState.activity).length,

      page: homeState.page,
      pageSize: homeState.pageSize,

      requestId: homeState.requestId,
      lastSyncAt: homeState.lastSyncAt,

      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasQueuedReload: Boolean(queuedReloadOptions),
      hasInflightOpenTicket: Boolean(inflightOpenTicket),
      inflightOpenTicketId,

      routeGuard: getRouteDebug([]),
    });
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    version: VERSION,
    source: SOURCE,

    init,
    mount: init,

    render: rerender,
    scheduleRender: rerender,

    reload,
    refresh: reload,

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
    navigate: navigateTo,

    openInvoice: handleOpenInvoice,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems: () => getTickets(),
    getTickets: () => getTickets(),

    getInvoices: () => safeArray(homeState.invoices),
    getFacturas: () => safeArray(homeState.invoices),

    getUsers: () => safeArray(homeState.users),
    getUsuarios: () => safeArray(homeState.users),

    getClients: () => safeArray(homeState.clients),
    getClientes: () => safeArray(homeState.clients),

    getActivity: () => safeArray(homeState.activity),

    getDashboard: () => safeObject(homeState.dashboard),
    getSummary: () => safeObject(homeState.summary),
    getWidgets: () => safeArray(homeState.widgets),

    getPageItems: () => getPaginationMeta(getTickets()).items,
    getPagination: () => getPaginationMeta(getTickets()),

    getTicketById: (ticketId = "") =>
      findIncidenciaById(getTickets(), ticketId) ||
      findTicketById(ticketId),

    findTicketById,

    hydrateBestEffort,

    canRenderHomeNow: (...args) => canRenderHomeForArgs(args),
    getHomeRouteDebug: (...args) => getRouteDebug(args),

    getHomeApiSnapshot,

    getState: getStateSnapshot,
    getSnapshot,
    getDebugSnapshot: getSnapshot,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },

    get ready() {
      return Boolean(initialized && !destroyed);
    },
  };

  registerHomeBridge();

  return api;
})();

export default HomeView;

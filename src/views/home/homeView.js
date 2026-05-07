/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/home/homeView.js

   ONION SUPPORT · HOME VIEW
   DASHBOARD API FIRST · ROUTE SAFE · CLEAN VIEW · 10/10

   RESPONSABILIDADES:
   - Punto de entrada real de la vista Home.
   - Render principal con home.template.js.
   - API-first con home.api.js.
   - Consumir dashboard summary normalizado.
   - Fallback fuerte a incidencias/clientes/usuarios/facturas.
   - Home común para user/admin.
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

   REGLAS:
   - Sin CSS inline.
   - Sin <style>.
   - Sin Object.assign(style).
   - Sin listeners duplicados.
   - Sin render Home si la ruta activa no es Home.
   - API/model/store externos hacen datos; la vista orquesta UX.
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

import { getIncidencias } from "../incidencias/incidencias.store.js";

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

/* =========================================================
   MODULE
========================================================= */

export const HomeView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SOURCE = "views:home:homeView";
  const SCOPE = "view:home";

  const HOME_PATH = "/";

  const PAGE_SIZE = 5;
  const CREATE_CLICK_THROTTLE_MS = 450;
  const OPEN_TICKET_THROTTLE_MS = 350;

  const HOME_CACHE_KEY = "onion.home.view.cache.v6";
  const HOME_CACHE_TTL_MS = 1000 * 60 * 10;

  const OPTIONAL_IMPORT_TIMEOUT_MS = 7000;

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

  const ACTION_SELECTOR =
    "[data-home-action],[data-action],#home-create-ticket-btn,#home-retry-btn,#home-refresh-btn";

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
  let bridgeCleanup = null;

  let renderToken = 0;

  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;
  let lastOpenTicketClickAt = 0;

  let inflightOpenTicketId = "";

  const optionalModulesCache = new Map();

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

  function isNodeLike(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.nodeType === "number"
    );
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

        normalized =
          lastComma > lastDot
            ? normalized.replace(/\./g, "").replace(/,/g, ".")
            : normalized.replace(/,/g, "");
      } else if (hasComma) {
        normalized = normalized.replace(/,/g, ".");
      }

      const parsed = Number(normalized);

      return Number.isFinite(parsed)
        ? parsed
        : fallback;
    }

    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeObject(value, fallback = {}) {
    return isObject(value)
      ? value
      : fallback;
  }

  function hasOwnKeys(value = {}) {
    return Boolean(
      isObject(value) &&
        Object.keys(value).length
    );
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }

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
          .flatMap((value) =>
            Array.isArray(value)
              ? value
              : [value]
          )
          .map((value) => safeText(value, ""))
          .filter(Boolean)
      ),
    ];
  }

  function uniqueBy(items = [], picker = (item) => item) {
    const seen = new Set();
    const output = [];

    safeArray(items).forEach((item) => {
      const key = safeText(picker(item), "");

      if (!key) {
        output.push(item);
        return;
      }

      const normalized = normalizeText(key);

      if (seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      output.push(item);
    });

    return output;
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return String(Date.now());
    }
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
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

    return Boolean(
      left &&
        right &&
        left === right
    );
  }

  function timeoutPromise(ms = OPTIONAL_IMPORT_TIMEOUT_MS, label = "timeout") {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error(label));
      }, Math.max(0, Number(ms) || 0));
    });
  }

  async function withTimeout(promise, ms = OPTIONAL_IMPORT_TIMEOUT_MS, label = "timeout") {
    return Promise.race([
      promise,
      timeoutPromise(ms, label),
    ]);
  }

  /* =========================================================
     PATH / ROUTE GUARD
  ========================================================= */

  function getBaseOrigin() {
    if (
      isBrowser() &&
      window.location?.origin
    ) {
      return window.location.origin;
    }

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

  function isUsernameSegment(segment = "") {
    return /^@[A-Za-z0-9._-]{1,80}$/.test(
      safeText(segment, "")
    );
  }

  function stripUsernamePrefix(path = HOME_PATH) {
    const { pathname, search, hash } = splitFullPath(
      normalizeFullPath(path)
    );

    const segments = pathname
      .split("/")
      .filter(Boolean);

    if (
      segments.length > 0 &&
      isUsernameSegment(segments[0])
    ) {
      const rest = segments.slice(1).join("/");

      const cleanPathname = rest
        ? normalizePathnameOnly(`/${rest}`)
        : HOME_PATH;

      return `${cleanPathname}${search}${hash}`;
    }

    return `${pathname}${search}${hash}`;
  }

  function canonicalizePath(path = HOME_PATH) {
    return normalizeFullPath(
      stripUsernamePrefix(path || HOME_PATH)
    );
  }

  function getCleanCanonicalPath(path = HOME_PATH) {
    return stripSearchAndHash(
      canonicalizePath(path || HOME_PATH)
    );
  }

  function isHomePath(path = "") {
    return getCleanCanonicalPath(path || HOME_PATH) === HOME_PATH;
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

      return normalizeFullPath(`${pathname}${search}${hash}`);
    } catch {
      return "";
    }
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

  function getAppRoutePath() {
    const router = getRouterCandidate();

    try {
      return safeText(
        first(
          router?.getCurrentCanonicalPath?.(),
          AppCore?.state?.route,
          AppCore?.state?.canonicalPath,
          ""
        ),
        ""
      );
    } catch {
      return safeText(
        first(
          AppCore?.state?.route,
          AppCore?.state?.canonicalPath,
          ""
        ),
        ""
      );
    }
  }

  function getAppPublicPath() {
    const router = getRouterCandidate();

    try {
      return safeText(
        first(
          router?.getCurrentPublicPath?.(),
          router?.getCurrentPath?.(),
          AppCore?.state?.publicPath,
          ""
        ),
        ""
      );
    } catch {
      return safeText(AppCore?.state?.publicPath, "");
    }
  }

  function pushPathSignal(signals, label, value, strength = "explicit") {
    const text = safeText(value, "");

    if (!text) {
      return;
    }

    signals.push({
      type: "path",
      label,
      value: text,
      canonical: getCleanCanonicalPath(text),
      isHome: isHomePath(text),
      strength,
    });
  }

  function pushViewSignal(signals, label, value, strength = "explicit") {
    const text = safeText(value, "");

    if (!text) {
      return;
    }

    const normalized = normalizeKey(text);

    signals.push({
      type: "view",
      label,
      value: normalized,
      isHome: normalized === "home",
      strength,
    });
  }

  function collectRouteSignalsFromObject(signals, value, label = "arg") {
    if (
      !isObject(value) ||
      isNodeLike(value)
    ) {
      return;
    }

    pushViewSignal(signals, `${label}.viewKey`, value.viewKey);
    pushViewSignal(signals, `${label}.name`, value.name);
    pushViewSignal(signals, `${label}.route.name`, value.route?.name);
    pushViewSignal(signals, `${label}.route.viewKey`, value.route?.viewKey);

    pushPathSignal(signals, `${label}.canonicalPath`, value.canonicalPath);
    pushPathSignal(signals, `${label}.routePath`, value.routePath);
    pushPathSignal(signals, `${label}.path`, value.path);
    pushPathSignal(signals, `${label}.publicPath`, value.publicPath);
    pushPathSignal(signals, `${label}.requestedPath`, value.requestedPath);
    pushPathSignal(signals, `${label}.href`, value.href);
    pushPathSignal(signals, `${label}.to`, value.to);

    pushPathSignal(signals, `${label}.route.path`, value.route?.path);
    pushPathSignal(signals, `${label}.route.canonicalPath`, value.route?.canonicalPath);
    pushPathSignal(signals, `${label}.route.publicPath`, value.route?.publicPath);

    collectRouteSignalsFromObject(signals, value.options, `${label}.options`);
    collectRouteSignalsFromObject(signals, value.payload, `${label}.payload`);
    collectRouteSignalsFromObject(signals, value.detail, `${label}.detail`);
  }

  function collectRouteSignals(args = []) {
    const signals = [];

    safeArray(args).forEach((arg, index) => {
      collectRouteSignalsFromObject(
        signals,
        arg,
        `args[${index}]`
      );
    });

    const browserPath = getBrowserPath();

    if (browserPath) {
      pushPathSignal(
        signals,
        "window.location",
        browserPath,
        "browser"
      );
    }

    const appRoute = getAppRoutePath();

    if (appRoute) {
      pushPathSignal(
        signals,
        "AppCore.state.route",
        appRoute,
        "ambient"
      );
    }

    const appPublicPath = getAppPublicPath();

    if (appPublicPath) {
      pushPathSignal(
        signals,
        "AppCore.state.publicPath",
        appPublicPath,
        "ambient"
      );
    }

    return signals;
  }

  function getBlockingRouteSignal(signals = []) {
    const browserBlock = signals.find(
      (signal) =>
        signal.strength === "browser" &&
        signal.isHome === false
    );

    if (browserBlock) {
      return browserBlock;
    }

    const explicitBlock = signals.find(
      (signal) =>
        signal.strength === "explicit" &&
        signal.isHome === false
    );

    if (explicitBlock) {
      return explicitBlock;
    }

    const ambientBlock = signals.find(
      (signal) =>
        signal.strength === "ambient" &&
        signal.isHome === false
    );

    return ambientBlock || null;
  }

  function hasPositiveHomeSignal(signals = []) {
    return signals.some((signal) => signal.isHome === true);
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
      return isHomePath(browserPath);
    }

    return true;
  }

  function getRouteDebug(args = []) {
    const signals = collectRouteSignals(args);

    return {
      source: SOURCE,
      allowed: canRenderHomeForArgs(args),
      browserPath: getBrowserPath(),
      browserCanonicalPath: getCleanCanonicalPath(getBrowserPath() || HOME_PATH),
      appRoute: getAppRoutePath(),
      appPublicPath: getAppPublicPath(),
      signals,
      blockingSignal: getBlockingRouteSignal(signals),
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
     LOG / EVENTS
  ========================================================= */

  function sanitizeEventPayload(value, depth = 0) {
    if (depth > 5) {
      return "[MaxDepth]";
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "string") {
      return value.replace(
        /([?&#](token|activationToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      );
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    if (isNodeLike(value)) {
      return {
        nodeName: safeText(value.nodeName, "Node"),
        id: safeText(value.id, ""),
        className: safeText(value.className, ""),
      };
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 60)
        .map((item) => sanitizeEventPayload(item, depth + 1));
    }

    if (value instanceof Error) {
      return {
        name: safeText(value.name, "Error"),
        message: safeText(value.message, ""),
        code: value.code || null,
        status: value.status || value.statusCode || null,
      };
    }

    if (isObject(value)) {
      const output = {};

      for (const [key, item] of Object.entries(value)) {
        if (/token|secret|password|authorization|credential/i.test(key)) {
          output[key] = "***";
          continue;
        }

        output[key] = sanitizeEventPayload(item, depth + 1);
      }

      return output;
    }

    return String(value);
  }

  function safeLog(...args) {
    const cleanArgs = args.map((item) => sanitizeEventPayload(item));

    try {
      AppCore?.utils?.log?.("[HomeView]", ...cleanArgs);
      return;
    } catch {}

    try {
      if (AppCore?.config?.debug) {
        console.log("[HomeView]", ...cleanArgs);
      }
    } catch {}
  }

  function safeWarn(...args) {
    const cleanArgs = args.map((item) => sanitizeEventPayload(item));

    let logged = false;

    try {
      if (isFunction(AppCore?.utils?.warn)) {
        AppCore.utils.warn("[HomeView]", ...cleanArgs);
        logged = true;
      }
    } catch {
      logged = false;
    }

    if (logged) {
      return;
    }

    try {
      console.warn("[HomeView]", ...cleanArgs);
    } catch {}
  }

  function safeEmit(event = "", payload = {}, options = {}) {
    const eventName = safeText(event, "");

    if (!eventName) {
      return false;
    }

    const cleanPayload = sanitizeEventPayload({
      source: SOURCE,
      ...safeObject(payload),
    });

    const opts = safeObject(options);

    let busAvailable = false;
    let busEmitted = false;

    try {
      if (isFunction(AppCore?.events?.emit)) {
        busAvailable = true;

        AppCore.events.emit(
          eventName,
          cleanPayload
        );

        busEmitted = true;
      }
    } catch {}

    if (
      opts.window === true ||
      (!busAvailable && isBrowser())
    ) {
      try {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: cleanPayload,
          })
        );

        return true;
      } catch {}
    }

    return busEmitted;
  }

  function safeOn(event = "", handler = null) {
    const eventName = safeText(event, "");

    if (
      !eventName ||
      !isFunction(handler)
    ) {
      return () => {};
    }

    const wrapped = (eventOrPayload = {}) => {
      try {
        handler(eventOrPayload);
      } catch (error) {
        safeWarn(`Handler de evento ${eventName} falló.`, error);
      }
    };

    try {
      if (isFunction(AppCore?.events?.on)) {
        const maybeCleanup = AppCore.events.on(
          eventName,
          wrapped
        );

        if (isFunction(maybeCleanup)) {
          return () => {
            try {
              maybeCleanup();
            } catch {}
          };
        }

        return () => {
          try {
            AppCore?.events?.off?.(eventName, wrapped);
          } catch {}
        };
      }
    } catch {}

    if (!isBrowser()) {
      return () => {};
    }

    try {
      window.addEventListener(eventName, wrapped);

      return () => {
        try {
          window.removeEventListener(eventName, wrapped);
        } catch {}
      };
    } catch {}

    return () => {};
  }

  /* =========================================================
     TOAST
  ========================================================= */

  function normalizeToastType(type = "info") {
    const key = normalizeKey(type);

    if (key === "warn") {
      return "warning";
    }

    if (
      ["success", "error", "warning", "info", "loading"].includes(key)
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
      candidates.push(AppCore?.Toast);
      candidates.push(AppCore?.toastModule);
      candidates.push(AppCore?.ui?.toast);
    } catch {}

    try {
      if (isBrowser()) {
        candidates.push(window.Toast);
        candidates.push(window.OnionToast);
      }
    } catch {}

    return candidates.filter(Boolean);
  }

  function showToast(message = "", type = "info", options = {}) {
    const text = safeText(message, "");

    if (!text) {
      return false;
    }

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
          directMethod.call(toast, text, payload);
          return true;
        }
      } catch {}

      try {
        if (isFunction(toast?.show)) {
          toast.show(payload);
          return true;
        }
      } catch {}

      try {
        if (isFunction(toast?.notify)) {
          toast.notify(payload);
          return true;
        }
      } catch {}
    }

    safeEmit(`toast:${toastType}`, payload);

    return true;
  }

  /* =========================================================
     USER / ROLE / APP
  ========================================================= */

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
      "soporte",
      "tecnico",
      "técnico",
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

  /* =========================================================
     ROUTER / NAVIGATION
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
      lowered.startsWith("tel:")
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

      if (!raw) {
        return null;
      }

      const payload = JSON.parse(raw);
      const savedAt = safeNumber(payload?.savedAt, 0);

      if (
        !savedAt ||
        Date.now() - savedAt > HOME_CACHE_TTL_MS
      ) {
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

    ensureSummaryAliases();

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

  /* =========================================================
     COLLECTION NORMALIZATION
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
      object.bills,
      object.billing,
      object.users,
      object.usuarios,
      object.clients,
      object.clientes,
      object.customers,
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

    if (
      isObject(nested) ||
      Array.isArray(nested)
    ) {
      return unwrapCollectionPayload(nested, depth + 1);
    }

    return object;
  }

  function normalizeCollection(value) {
    if (Array.isArray(value)) {
      return value;
    }

    const object = safeObject(
      unwrapCollectionPayload(value)
    );

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
    const object = safeObject(
      unwrapCollectionPayload(value)
    );

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

      safeWarn(`Módulo opcional no disponible: ${cacheKey}`, error);

      return null;
    }
  }

  async function loadOptionalUsuarios({ force = false } = {}) {
    try {
      const apiModule = await importOptionalModule(
        "usuarios.api",
        "../usuarios/usuarios.api.js"
      );

      const storeModule = await importOptionalModule(
        "usuarios.store",
        "../usuarios/usuarios.store.js"
      );

      try {
        if (isFunction(apiModule?.hydrateFromCache)) {
          apiModule.hydrateFromCache({
            freshOnly: true,
          });
        }
      } catch {}

      if (isFunction(apiModule?.loadUsuarios)) {
        await apiModule.loadUsuarios({
          force,
          silent: true,
        });
      }

      const items = safeArray(
        first(
          storeModule?.getUsuarios?.(),
          apiModule?.getUsuarios?.(),
          apiModule?.usuariosState?.items,
          []
        )
      );

      if (items.length) {
        homeState.users = uniqueBy(
          [
            ...homeState.users,
            ...items,
          ],
          getUserId
        );

        homeState.usersRemoteCount = Math.max(
          homeState.usersRemoteCount,
          items.length
        );

        return homeState.users;
      }
    } catch (error) {
      safeWarn("Fallback usuarios falló.", error);
    }

    return safeArray(homeState.users);
  }

  async function loadOptionalClientes({ force = false } = {}) {
    try {
      const apiModule = await importOptionalModule(
        "clientes.api",
        "../clientes/clientes.api.js"
      );

      const storeModule = await importOptionalModule(
        "clientes.store",
        "../clientes/clientes.store.js"
      );

      try {
        if (isFunction(apiModule?.hydrateFromCache)) {
          apiModule.hydrateFromCache();
        }
      } catch {}

      if (isFunction(apiModule?.loadClientes)) {
        await apiModule.loadClientes({
          force,
          silent: true,
        });
      }

      const items = safeArray(
        first(
          storeModule?.getClientes?.(),
          apiModule?.getClientes?.(),
          apiModule?.clientesState?.items,
          []
        )
      );

      if (items.length) {
        homeState.clients = uniqueBy(
          [
            ...homeState.clients,
            ...items,
          ],
          getClientId
        );

        homeState.clientsRemoteCount = Math.max(
          homeState.clientsRemoteCount,
          items.length
        );

        return homeState.clients;
      }
    } catch (error) {
      safeWarn("Fallback clientes falló.", error);
    }

    return safeArray(homeState.clients);
  }

  async function loadOptionalFacturas({ force = false } = {}) {
    try {
      const apiModule = await importOptionalModule(
        "facturas.api",
        "../facturas/facturas.api.js"
      );

      const storeModule = await importOptionalModule(
        "facturas.store",
        "../facturas/facturas.store.js"
      );

      try {
        if (isFunction(apiModule?.hydrateFromCache)) {
          apiModule.hydrateFromCache();
        }
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

      const items = safeArray(
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
        homeState.invoices = uniqueBy(
          [
            ...homeState.invoices,
            ...items,
          ],
          getInvoiceId
        );

        homeState.invoicesRemoteCount = Math.max(
          homeState.invoicesRemoteCount,
          items.length
        );

        return homeState.invoices;
      }
    } catch (error) {
      safeWarn("Fallback facturas falló.", error);
    }

    return safeArray(homeState.invoices);
  }

  async function loadSecondaryCollections({ force = false } = {}) {
    const before = {
      users: homeState.users.length,
      clients: homeState.clients.length,
      invoices: homeState.invoices.length,
    };

    await Promise.allSettled([
      loadOptionalClientes({ force }),
      loadOptionalUsuarios({ force }),
      loadOptionalFacturas({ force }),
    ]);

    ensureSummaryAliases();

    safeLog("secondary collections sync", {
      before,
      after: {
        users: homeState.users.length,
        clients: homeState.clients.length,
        invoices: homeState.invoices.length,
      },
      usersRemoteCount: homeState.usersRemoteCount,
      clientsRemoteCount: homeState.clientsRemoteCount,
      invoicesRemoteCount: homeState.invoicesRemoteCount,
    });

    return {
      users: homeState.users,
      clients: homeState.clients,
      invoices: homeState.invoices,
    };
  }

  /* =========================================================
     DATA HELPERS
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

  function getTicketUpdatedAtLocal(item = {}) {
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

  function getTicketCreatedAtLocal(item = {}) {
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

  function getTicketSubjectLocal(item = {}) {
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

  function getTicketStatusLocal(item = {}) {
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

  function getTicketStatusKeyLocal(item = {}) {
    const key = normalizeKey(
      getTicketStatusLocal(item)
    );

    if (
      ["pending", "pendiente", "new", "nueva", "nuevo", "created"].includes(key)
    ) {
      return "pending";
    }

    if (
      ["open", "opened", "abierta", "abierto"].includes(key)
    ) {
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

    if (
      ["resolved", "resuelta", "resuelto", "solved"].includes(key)
    ) {
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

  function getTicketStatusLabelLocal(item = {}) {
    const key = getTicketStatusKeyLocal(item);

    if (key === "open") return "Abierta";
    if (key === "pending") return "Pendiente";
    if (key === "progress") return "En proceso";
    if (key === "resolved") return "Resuelta";
    if (key === "closed") return "Cerrada";

    return safeText(
      getTicketStatusLocal(item),
      "Pendiente"
    );
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

  function getInvoiceAmount(item = {}) {
    return safeNumber(
      first(
        item.total,
        item.amount,
        item.importe,
        item.price,
        item.subtotal,
        item.base,
        item.totalFactura,
        item.importeTotal,
        item.facturaTotal,
        item.facturaImporte,
        item.invoiceAmount,

        item.raw?.total,
        item.raw?.amount,
        item.raw?.importe,
        item.raw?.price,
        item.raw?.subtotal,
        item.raw?.base,
        item.raw?.totalFactura,
        item.raw?.importeTotal,
        item.raw?.facturaTotal,
        item.raw?.facturaImporte,
        item.raw?.invoiceAmount,

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

  function getInvoiceStatusKey(item = {}) {
    const key = normalizeKey(
      first(
        item.paymentStatus,
        item.estadoPago,
        item.status,
        item.estado,
        item.raw?.paymentStatus,
        item.raw?.estadoPago,
        item.raw?.status,
        item.raw?.estado,
        "pending"
      )
    );

    if (
      ["paid", "pagada", "pagado", "cobrada", "cobrado"].includes(key)
    ) {
      return "paid";
    }

    if (
      ["pending", "pendiente", "unpaid"].includes(key)
    ) {
      return "pending";
    }

    if (
      ["overdue", "vencida", "vencido"].includes(key)
    ) {
      return "overdue";
    }

    if (
      ["partial", "parcial", "pago_parcial"].includes(key)
    ) {
      return "partial";
    }

    if (
      ["cancelled", "cancelada", "cancelado"].includes(key)
    ) {
      return "cancelled";
    }

    if (
      ["draft", "borrador"].includes(key)
    ) {
      return "draft";
    }

    return "pending";
  }

  function isInvoicePendingLike(item = {}) {
    return [
      "pending",
      "overdue",
      "partial",
    ].includes(getInvoiceStatusKey(item));
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

  function formatMoneyLocal(value = 0, currency = "EUR") {
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
      const normalized = normalizeIncidenciasCollection(
        safeArray(items)
      );

      return sortIncidenciasByUpdatedDesc(normalized);
    } catch {
      return safeArray(items);
    }
  }

  function getTicketsFromStore() {
    try {
      const rawItems = safeArray(
        getIncidencias()
      );

      return normalizeTickets(rawItems);
    } catch (error) {
      safeWarn("getTicketsFromStore falló.", error);
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

    if (!id) {
      return null;
    }

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
    const ticketActivity = getTickets()
      .slice(0, 8)
      .map((item) => {
        const ticketId = getStableTicketId(item);

        return {
          type: "ticket",
          title: getTicketSubjectLocal(item),
          text: `Incidencia ${ticketId || "sin ID"} · ${getTicketStatusLabelLocal(item)}`,
          date: getTicketUpdatedAtLocal(item) || getTicketCreatedAtLocal(item),
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
          text: formatMoneyLocal(amount, currency),
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
            item.company,
            item.nombreContacto,
            item.email,
            item.raw?.name,
            item.raw?.nombre,
            item.raw?.razonSocial,
            item.raw?.company,
            item.raw?.nombreContacto,
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
        entityId: getClientId(item),
      }));

    const userActivity = safeArray(homeState.users)
      .slice(0, 3)
      .map((item) => ({
        type: "user",
        title: safeText(
          first(
            item.name,
            item.nombre,
            item.displayName,
            item.fullName,
            item.username,
            item.email,
            item.raw?.name,
            item.raw?.nombre,
            item.raw?.displayName,
            item.raw?.fullName,
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
        entityId: getUserId(item),
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

  function getSummaryCount(keys = [], fallback = 0) {
    const summary = safeObject(homeState.summary);
    const dashboard = safeObject(homeState.dashboard);

    return Math.max(
      fallback,
      safeNumber(
        first(
          ...safeArray(keys).flatMap((key) => [
            summary?.[key],
            dashboard?.[key],
          ]),
          fallback
        ),
        fallback
      )
    );
  }

  function computeInvoiceAmount() {
    return safeArray(homeState.invoices).reduce(
      (sum, item) => sum + getInvoiceAmount(item),
      0
    );
  }

  function computePendingInvoices() {
    return safeArray(homeState.invoices)
      .filter((item) => isInvoicePendingLike(item))
      .length;
  }

  function ensureSummaryAliases() {
    const summary = safeObject(homeState.summary);

    const ticketsCount = Math.max(
      homeState.tickets.length,
      homeState.ticketsRemoteCount,
      getSummaryCount(
        [
          "totalTickets",
          "ticketsTotal",
          "incidenciasTotal",
          "totalIncidencias",
          "ticketsCount",
          "incidenciasCount",
        ],
        0
      )
    );

    const invoicesCount = Math.max(
      homeState.invoices.length,
      homeState.invoicesRemoteCount,
      getSummaryCount(
        [
          "totalInvoices",
          "invoicesTotal",
          "facturasTotal",
          "totalFacturas",
          "invoicesCount",
          "facturasCount",
        ],
        0
      )
    );

    const usersCount = Math.max(
      homeState.users.length,
      homeState.usersRemoteCount,
      getSummaryCount(
        [
          "usersCount",
          "usuariosCount",
          "totalUsers",
          "totalUsuarios",
          "activeUsers",
          "usuariosActivos",
        ],
        0
      )
    );

    const clientsCount = Math.max(
      homeState.clients.length,
      homeState.clientsRemoteCount,
      getSummaryCount(
        [
          "clientsCount",
          "clientesCount",
          "customersCount",
          "totalClients",
          "totalClientes",
          "totalCustomers",
          "activeClients",
          "clientesActivos",
        ],
        0
      )
    );

    const invoiceAmount = Math.max(
      computeInvoiceAmount(),
      safeNumber(
        first(
          summary.invoiceAmount,
          summary.billingTotal,
          summary.totalBilling,
          summary.totalFacturado,
          summary.importeFacturas,
          summary.facturacionVisible,
          summary.facturacionTotal,
          0
        ),
        0
      )
    );

    const pendingInvoices = Math.max(
      computePendingInvoices(),
      safeNumber(
        first(
          summary.pendingInvoices,
          summary.pendingFacturas,
          summary.facturasPendientes,
          summary.invoicesPending,
          summary.facturasVencidas,
          summary.overdueInvoices,
          0
        ),
        0
      )
    );

    const activeUsers = Math.max(
      usersCount,
      safeNumber(
        first(
          summary.activeUsers,
          summary.usuariosActivos,
          0
        ),
        0
      )
    );

    const activeClients = Math.max(
      clientsCount,
      safeNumber(
        first(
          summary.activeClients,
          summary.clientesActivos,
          0
        ),
        0
      )
    );

    homeState.summary = {
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
      activeUsers,
      usuariosActivos: activeUsers,

      clientsCount,
      clientesCount: clientsCount,
      customersCount: clientsCount,
      totalClients: clientsCount,
      totalClientes: clientsCount,
      totalCustomers: clientsCount,
      activeClients,
      clientesActivos: activeClients,
    };

    homeState.ticketsRemoteCount = Math.max(
      homeState.ticketsRemoteCount,
      ticketsCount
    );

    homeState.invoicesRemoteCount = Math.max(
      homeState.invoicesRemoteCount,
      invoicesCount
    );

    homeState.usersRemoteCount = Math.max(
      homeState.usersRemoteCount,
      usersCount
    );

    homeState.clientsRemoteCount = Math.max(
      homeState.clientsRemoteCount,
      clientsCount
    );

    homeState.dashboard = {
      ...safeObject(homeState.dashboard),

      summary: homeState.summary,
      stats: homeState.summary,
      metrics: homeState.summary,
      totals: homeState.summary,
      counts: homeState.summary,

      ticketsTotal: ticketsCount,
      incidenciasTotal: ticketsCount,
      totalTickets: ticketsCount,
      totalIncidencias: ticketsCount,

      invoicesTotal: invoicesCount,
      facturasTotal: invoicesCount,
      totalInvoices: invoicesCount,
      totalFacturas: invoicesCount,

      usersTotal: usersCount,
      usuariosTotal: usersCount,
      totalUsers: usersCount,
      totalUsuarios: usersCount,
      usersCount,
      usuariosCount: usersCount,

      clientsTotal: clientsCount,
      clientesTotal: clientsCount,
      customersTotal: clientsCount,
      totalClients: clientsCount,
      totalClientes: clientsCount,
      totalCustomers: clientsCount,
      clientsCount,
      clientesCount: clientsCount,
    };

    return homeState.summary;
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

    const tickets = normalizeTickets(
      normalizeCollection(ticketsSource)
    );

    const invoices = safeArray(
      normalizeCollection(invoicesSource)
    );

    const users = safeArray(
      normalizeCollection(usersSource)
    );

    const clients = safeArray(
      normalizeCollection(clientsSource)
    );

    const activity = safeArray(
      normalizeCollection(activitySource)
    );

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

    if (
      widgets.length ||
      !preserveExisting
    ) {
      homeState.widgets = widgets;
    }

    if (
      tickets.length ||
      !preserveExisting
    ) {
      homeState.tickets = tickets;
    }

    if (
      invoices.length ||
      !preserveExisting
    ) {
      homeState.invoices = invoices;
    }

    if (
      users.length ||
      !preserveExisting
    ) {
      homeState.users = users;
    }

    if (
      clients.length ||
      !preserveExisting
    ) {
      homeState.clients = clients;
    }

    homeState.ticketsRemoteCount = Math.max(
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

    homeState.invoicesRemoteCount = Math.max(
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

    homeState.usersRemoteCount = Math.max(
      homeState.users.length,
      getRemoteCountFromCollection(usersSource, homeState.users.length),
      safeNumber(
        first(
          dashboard.usersTotal,
          dashboard.usuariosTotal,
          dashboard.totalUsers,
          dashboard.totalUsuarios,
          dashboard.usersCount,
          dashboard.usuariosCount,

          homeState.summary.usersCount,
          homeState.summary.usuariosCount,
          homeState.summary.totalUsers,
          homeState.summary.totalUsuarios,
          homeState.summary.activeUsers,
          homeState.summary.usuariosActivos,
          homeState.summary.users?.total,
          homeState.summary.usuarios?.total
        ),
        homeState.users.length
      )
    );

    homeState.clientsRemoteCount = Math.max(
      homeState.clients.length,
      getRemoteCountFromCollection(clientsSource, homeState.clients.length),
      safeNumber(
        first(
          dashboard.clientsTotal,
          dashboard.clientesTotal,
          dashboard.customersTotal,
          dashboard.totalClients,
          dashboard.totalClientes,
          dashboard.clientsCount,
          dashboard.clientesCount,

          homeState.summary.clientsCount,
          homeState.summary.clientesCount,
          homeState.summary.customersCount,
          homeState.summary.totalClients,
          homeState.summary.totalClientes,
          homeState.summary.activeClients,
          homeState.summary.clientesActivos,
          homeState.summary.clients?.total,
          homeState.summary.clientes?.total
        ),
        homeState.clients.length
      )
    );

    homeState.remoteCount = Math.max(
      homeState.remoteCount,
      homeState.ticketsRemoteCount,
      homeState.tickets.length
    );

    if (
      activity.length ||
      !preserveExisting
    ) {
      homeState.activity = activity.length
        ? activity
        : buildActivityFromData();
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

    ensureSummaryAliases();

    homeState.loaded = true;
    homeState.hydrated = true;
    homeState.error = "";

    if (opts.writeCache !== false) {
      writeCachePayload();
    }

    safeLog("dashboard synced", {
      tickets: homeState.tickets.length,
      invoices: homeState.invoices.length,
      users: homeState.users.length,
      clients: homeState.clients.length,
      summary: homeState.summary,
    });

    return homeState.dashboard;
  }

  function hydrateBestEffort() {
    let hydrated = false;

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

      if (
        tickets.length &&
        !homeState.tickets.length
      ) {
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

    ensureSummaryAliases();

    return hydrated;
  }

  /* =========================================================
     STATE
  ========================================================= */

  function ensureBaseState() {
    homeState.page = Math.max(
      1,
      safeNumber(homeState.page, 1)
    );

    homeState.pageSize = Math.max(
      1,
      safeNumber(homeState.pageSize, PAGE_SIZE)
    );

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

    homeState.remoteCount = Math.max(
      0,
      safeNumber(homeState.remoteCount, 0)
    );

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

    ensureSummaryAliases();

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

    ensureSummaryAliases();

    homeState.loaded = true;
    homeState.hydrated = true;
    homeState.error = "";

    markIdle();

    return homeState;
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

    const currentPage = Math.min(
      page,
      totalPages
    );

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

      return normalizePaginationResult(
        result,
        rows
      );
    } catch {
      const size = Math.max(
        1,
        pageSize || PAGE_SIZE
      );

      const totalPages = Math.max(
        1,
        Math.ceil((rows.length || 1) / size)
      );

      const nextPage = Math.min(
        Math.max(1, page),
        totalPages
      );

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
      safeWarn("ticket modal hook legacy falló.", error);
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
      safeWarn("create modal global hook falló.", error);
    }

    try {
      if (isFunction(IncidenciasCreateView?.open)) {
        IncidenciasCreateView.open(payload);
        return true;
      }
    } catch (error) {
      safeWarn("IncidenciasCreateView.open falló.", error);
    }

    safeEmit("incidencias:create-modal:open", {
      draft: payload,
      source: "homeView:fallback",
    });

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
    homeState.creating = false;

    void handleCreateIncidencia({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
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

  function applyErrorStateToDom(container) {
    if (!container) {
      return;
    }

    const oldBanner = container.querySelector(
      "[data-home-error-banner='true']"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const message = safeText(homeState.error, "");

    if (!message) {
      return;
    }

    const anchor =
      container.querySelector(".home-tickets .home-panel-head") ||
      container.querySelector(".home-panel-head") ||
      container.querySelector(".home-view-wrapper") ||
      container.querySelector(".content-wrapper");

    if (!anchor) {
      return;
    }

    const banner = document.createElement("div");

    banner.className = "home-error-banner";
    banner.setAttribute("data-home-error-banner", "true");
    banner.setAttribute("role", "status");
    banner.textContent = message;

    anchor.insertAdjacentElement("afterend", banner);
  }

  function decorateAvatarFallbacks(container) {
    if (!container) {
      return;
    }

    const images = container.querySelectorAll(
      "[data-avatar-image='true']"
    );

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

            img
              .closest("[data-avatar-root='true']")
              ?.setAttribute("data-fallback", "true");
          } catch {}
        },
        {
          once: true,
        }
      );
    });
  }

  function decorateDom(container) {
    if (!container) {
      return container;
    }

    applyErrorStateToDom(container);
    decorateAvatarFallbacks(container);

    return container;
  }

  function setViewBusy(container, busy = false) {
    if (!container) {
      return false;
    }

    try {
      container.setAttribute(
        "aria-busy",
        busy ? "true" : "false"
      );

      return true;
    } catch {}

    return false;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return Boolean(
      !destroyed &&
        token === renderToken
    );
  }

  function buildDashboardForTemplate({
    ticketsInput,
    invoicesInput,
    usersInput,
    clientsInput,
    activityInput,
  } = {}) {
    ensureSummaryAliases();

    return {
      ...safeObject(homeState.dashboard),

      summary: homeState.summary,
      stats: homeState.summary,
      metrics: homeState.summary,
      totals: homeState.summary,
      counts: homeState.summary,

      widgets: homeState.widgets,
      cards: homeState.widgets,
      kpis: homeState.widgets,

      tickets: ticketsInput,
      incidencias: ticketsInput,

      facturas: invoicesInput,
      invoices: invoicesInput,

      users: usersInput,
      usuarios: usersInput,

      clients: clientsInput,
      clientes: clientsInput,
      customers: clientsInput,

      activity: activityInput,
      activities: activityInput,
      recent: activityInput,
      recentActivity: activityInput,

      ticketsTotal: homeState.ticketsRemoteCount,
      incidenciasTotal: homeState.ticketsRemoteCount,
      totalTickets: homeState.ticketsRemoteCount,
      totalIncidencias: homeState.ticketsRemoteCount,

      invoicesTotal: homeState.invoicesRemoteCount,
      facturasTotal: homeState.invoicesRemoteCount,
      totalInvoices: homeState.invoicesRemoteCount,
      totalFacturas: homeState.invoicesRemoteCount,

      usersTotal: homeState.usersRemoteCount,
      usuariosTotal: homeState.usersRemoteCount,
      totalUsers: homeState.usersRemoteCount,
      totalUsuarios: homeState.usersRemoteCount,

      clientsTotal: homeState.clientsRemoteCount,
      clientesTotal: homeState.clientsRemoteCount,
      customersTotal: homeState.clientsRemoteCount,
      totalClients: homeState.clientsRemoteCount,
      totalClientes: homeState.clientsRemoteCount,
      totalCustomers: homeState.clientsRemoteCount,

      updatedAt:
        homeState.lastSyncAt ||
        homeState.dashboard?.updatedAt ||
        "",

      generatedAt:
        homeState.dashboard?.generatedAt ||
        homeState.lastSyncAt ||
        "",
    };
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

    ensureSummaryAliases();

    const activity = homeState.activity.length
      ? homeState.activity
      : buildActivityFromData();

    const ticketsInput = buildCollectionInput(
      tickets,
      remoteCount
    );

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

    const activityInput = buildCollectionInput(
      activity,
      activity.length
    );

    const dashboardForTemplate = buildDashboardForTemplate({
      ticketsInput,
      invoicesInput,
      usersInput,
      clientsInput,
      activityInput,
    });

    return `
      <section
        class="panel-content dashboard ready"
        data-view="home"
        data-home-scope="${SCOPE}"
      >
        <div class="content-wrapper home-view-wrapper">
          ${renderHomeTemplate({
            user,
            role,

            dashboard: dashboardForTemplate,
            summary: homeState.summary,
            stats: homeState.summary,
            metrics: homeState.summary,
            totals: homeState.summary,

            widgets: homeState.widgets,

            tickets: ticketsInput,
            incidencias: ticketsInput,

            facturas: invoicesInput,
            invoices: invoicesInput,

            users: usersInput,
            usuarios: usersInput,

            clients: clientsInput,
            clientes: clientsInput,
            customers: clientsInput,

            activity: activityInput,
            recentActivity: activityInput,
            recent: activityInput,

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

              dashboard: dashboardForTemplate,
              summary: homeState.summary,
              stats: homeState.summary,
              metrics: homeState.summary,
              totals: homeState.summary,

              items: tickets,
              tickets: ticketsInput,
              incidencias: ticketsInput,

              facturas: invoicesInput,
              invoices: invoicesInput,

              users: usersInput,
              usuarios: usersInput,

              clients: clientsInput,
              clientes: clientsInput,
              customers: clientsInput,

              activity: activityInput,
              recentActivity: activityInput,
              recent: activityInput,

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

      homeState.hydrated = true;

      setViewBusy(container, false);

      safeEmit("home:rendered", {
        route: getAppRoutePath(),
        publicPath: getAppPublicPath(),
        itemsCount: getTickets().length,
        page: homeState.page,
      });

      return container;
    } catch (error) {
      setViewBusy(container, false);

      safeWarn("render() falló.", error);

      throw error;
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

    const ticketsBefore = getTickets();

    const hasVisibleData = Boolean(
      ticketsBefore.length ||
        homeState.invoices.length ||
        homeState.users.length ||
        homeState.clients.length ||
        homeState.activity.length ||
        hasOwnKeys(homeState.summary) ||
        hasOwnKeys(homeState.dashboard)
    );

    try {
      homeState.error = "";

      if (
        !hasVisibleData &&
        !silent
      ) {
        homeState.loading = true;
      } else if (asRefresh) {
        homeState.refreshing = true;
      }
    } catch {
      homeState.loading = !hasVisibleData && !silent;
      homeState.refreshing = hasVisibleData && asRefresh;
    }

    if (!destroyed) {
      rerender({
        route: HOME_PATH,
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

      syncDashboardPayload(
        dashboard,
        {
          lastSyncAt: nowIso(),
          writeCache: true,
          preserveExisting: true,
        }
      );

      await loadSecondaryCollections({
        force,
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
        invoices: homeState.invoices.length,
        users: homeState.users.length,
        clients: homeState.clients.length,
        summary: homeState.summary,
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
        homeState.invoices.length ||
        homeState.users.length ||
        homeState.clients.length ||
        hasOwnKeys(homeState.summary)
      ) {
        homeState.error = "";
        homeState.loaded = true;
        homeState.hydrated = true;

        homeState.activity = homeState.activity.length
          ? homeState.activity
          : buildActivityFromData();

        homeState.lastSyncAt = homeState.lastSyncAt || nowIso();

        markIdle();
        ensureSummaryAliases();
        writeCachePayload();

        safeEmit("home:loaded:fallback", {
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
    reason = "render-and-load",
  } = {}) {
    if (!assertHomeRoute(reason, [
      {
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
        reason,
      },
    ])) {
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

    if (!assertHomeRoute(`${reason}:after-load`, [
      {
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
      },
    ])) {
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
     ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (
      homeState.loading ||
      homeState.refreshing
    ) {
      return homeState.page || 1;
    }

    const items = getTickets();
    const pagination = getPaginationMeta(items);

    const totalPages = Math.max(
      1,
      safeNumber(pagination.totalPages, 1)
    );

    homeState.page = Math.min(
      Math.max(
        1,
        safeNumber(page, homeState.page || 1)
      ),
      totalPages
    );

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
    return goToPage(
      (homeState.page || 1) - 1
    );
  }

  function goNextPage() {
    return goToPage(
      (homeState.page || 1) + 1
    );
  }

  function changePageSize(value = PAGE_SIZE) {
    const nextSize = Math.max(
      1,
      safeNumber(value, PAGE_SIZE)
    );

    homeState.pageSize = nextSize;
    homeState.page = 1;

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
          showToast(
            "No se pudo abrir la incidencia.",
            "error"
          );

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

          safeEmit("home:ticket:open:fallback", {
            ticketId: id,
            incidenciaId: id,
            detail: localSnapshot,
            error,
          });

          return localSnapshot;
        }

        showToast(
          "No se pudo abrir la incidencia.",
          "error"
        );

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
      showToast(
        "No hay referencia para copiar.",
        "error"
      );

      return false;
    }

    try {
      return await copyTicketIdAction({
        ticketId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyTicketId falló.", error);

      showToast(
        "No se pudo copiar la referencia.",
        "error"
      );

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
      homeState.creating = true;

      rerender({
        route: {
          path: HOME_PATH,
          viewKey: "home",
        },
        canonicalPath: HOME_PATH,
        publicPath: HOME_PATH,
        reason: "create:pending",
      });

      showToast(
        "Preparando formulario...",
        "info"
      );

      return false;
    }

    pendingCreateRequest = false;
    homeState.creating = true;

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
      const opened = openCreateModalBridge(
        opts.draft || {}
      );

      if (!opened) {
        showToast(
          "No se pudo abrir el formulario.",
          "error"
        );
      }

      safeEmit("home:create:open", {
        draft: opts.draft || {},
        source: "home",
      });

      return opened;
    } finally {
      homeState.creating = false;

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

  async function handleNavigateAction(action = "", route = "") {
    const actionName = safeText(action, "navigate");
    const target = normalizeSpaRoute(route);

    if (!target) {
      return false;
    }

    if (homeState.navigatingAction) {
      return false;
    }

    homeState.navigatingAction = actionName;

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
      });
    } finally {
      homeState.navigatingAction = "";

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

  async function handleOpenInvoice(invoiceId = "") {
    const id = safeText(invoiceId, "");

    await handleNavigateAction(
      "go-facturas",
      ROUTES.FACTURAS
    );

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

    if (
      action === "open-ticket" &&
      entityId
    ) {
      return handleOpenTicket(
        entityId,
        {
          source: "home:activity",
        }
      );
    }

    if (
      action === "open-invoice" &&
      entityId
    ) {
      return handleOpenInvoice(entityId);
    }

    if (route) {
      return handleNavigateAction(
        action,
        route
      );
    }

    return false;
  }

  async function openTicketFromExternalRequest(payload = {}) {
    const source = getEventPayload(payload);
    const ticketId = getTicketIdFromPayload(source);

    if (!ticketId) {
      showToast(
        "No se pudo identificar la incidencia.",
        "error"
      );

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

    return handleOpenTicket(
      ticketId,
      {
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
      }
    );
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = safeArray(actions)
      .map((action) => {
        const clean = safeText(action, "");

        if (!clean) {
          return "";
        }

        return [
          `[data-home-action="${clean}"]`,
          `[data-action="${clean}"]`,
        ].join(",");
      })
      .filter(Boolean)
      .join(",");

    if (!selectors) {
      return null;
    }

    return event.target?.closest?.(selectors) || null;
  }

  function getAnyActionTarget(event) {
    return event.target?.closest?.(ACTION_SELECTOR) || null;
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
    if (!element) {
      return "";
    }

    return normalizeSpaRoute(
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

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) {
        return;
      }

      const anyAction = getAnyActionTarget(event);

      if (!anyAction) {
        return;
      }

      const ticketBtn = getActionTarget(event, [
        "open-ticket",
        "detail",
        "open",
        "view-ticket",
      ]);

      if (ticketBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket(
          getTicketIdFromElement(ticketBtn),
          {
            source: "home:table",
          }
        );

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

        await handleCopyTicketId(
          getTicketIdFromElement(copyBtn)
        );

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
          await handleNavigateAction(
            "go-facturas",
            route
          );
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

        await handleNavigateAction(
          action,
          route
        );

        return;
      }

      const widgetBtn = getActionTarget(event, [
        "open-widget",
      ]);

      if (widgetBtn) {
        event.preventDefault();

        const route = getRouteFromElement(widgetBtn);

        if (route) {
          await handleNavigateAction(
            "open-widget",
            route
          );
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
      if (destroyed) {
        return;
      }

      const pageSizeField =
        event.target?.closest?.("[data-home-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(pageSizeField.value);
      }
    };

    container.addEventListener(
      "click",
      onClick
    );

    container.addEventListener(
      "change",
      onChange
    );

    return () => {
      try {
        container.removeEventListener(
          "click",
          onClick
        );

        container.removeEventListener(
          "change",
          onChange
        );
      } catch {}
    };
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
      cleanups.push(
        safeOn(eventName, onMutated)
      );
    });

    HOME_OPEN_TICKET_EVENTS.forEach((eventName) => {
      cleanups.push(
        safeOn(eventName, onOpenTicket)
      );
    });

    READY_EVENTS.forEach((eventName) => {
      cleanups.push(
        safeOn(eventName, onReady)
      );
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
        AppCore.modules.register(
          "Home",
          api,
          {
            overwrite: true,
            replace: true,
            source: SOURCE,
          }
        );

        AppCore.modules.register(
          "HomeView",
          api,
          {
            overwrite: true,
            replace: true,
            source: SOURCE,
          }
        );

        AppCore.modules.register(
          "OnionHomeBridge",
          bridge,
          {
            overwrite: true,
            replace: true,
            source: SOURCE,
          }
        );
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

    if (destroyed) {
      return false;
    }

    registerHomeBridge();

    const container = getContainer();
    const cleanups = [];

    cleanups.push(
      bindNativeActions(container)
    );

    cleanups.push(
      attachExternalListeners()
    );

    bindingsCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {}
      });
    };

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
        force: Boolean(
          queuedReloadOptions?.force ||
            incomingOptions.force
        ),
        asRefresh: Boolean(
          queuedReloadOptions?.asRefresh ||
            incomingOptions.asRefresh
        ),
        silent: Boolean(
          queuedReloadOptions?.silent ??
            incomingOptions.silent
        ),
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
      } while (
        currentOptions &&
        !destroyed
      );

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

    if (
      !assertHomeRoute("init", args)
    ) {
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

      safeEmit("home:init:done", {
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

    safeEmit("home:destroyed", {
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

    return {
      ...homeState,

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

      invoicesCount: homeState.invoices.length,
      facturasCount: homeState.invoices.length,

      usersCount: homeState.users.length,
      usuariosCount: homeState.users.length,

      clientsCount: homeState.clients.length,
      clientesCount: homeState.clients.length,

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
    };
  }

  function getSnapshot() {
    return {
      source: SOURCE,

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
      invoicesCount: homeState.invoices.length,
      usersCount: homeState.users.length,
      clientsCount: homeState.clients.length,
      activityCount: homeState.activity.length,

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
    };
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

    canRenderHomeNow: (...args) =>
      canRenderHomeForArgs(args),

    getHomeRouteDebug: (...args) =>
      getRouteDebug(args),

    getHomeApiSnapshot,

    getState: getStateSnapshot,
    getSnapshot,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },

    get ready() {
      return Boolean(
        initialized &&
          !destroyed
      );
    },
  };

  registerHomeBridge();

  return api;
})();

export default HomeView;

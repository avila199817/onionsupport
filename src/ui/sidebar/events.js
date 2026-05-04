/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL EXTREME SYSTEM · SIDEBAR EVENTS / VISUAL COMMIT · BIND SAFE · 12/10
   PATCH · STALE ROUTE FIREBREAK
   PATCH · ACTIVE MENU LOCAL OVERRIDE
   PATCH · FACTURAS/INCIDENCIAS WRONG ACTIVE FIX
   PATCH · USERNAME PUBLIC PATH READY /@usuario/ruta
   PATCH · CATALAN/SPANISH/ENGLISH ROUTE ALIASES
   PATCH · ROUTER PAYLOAD STALE SAFE

   Responsabilidades:
   - bind de eventos DOM del sidebar
   - bind de eventos core/auth/router
   - sidebar manual: nunca abrir/cerrar por navegación
   - cerrar dropdown en navegación/render
   - recalcular usuario / roles tras login/logout/restore/session/user change
   - bloquear clicks sobre elementos hidden/inert/admin ocultos
   - cleanup local idempotente por scope
   - tolerar DOM re-renderizado
   - cero throws accidentales
   - sincronizar item activo del menú delegando en state.js
   - corregir item activo localmente si state/router payload llega stale
   - sincronizar indicador visual tipo Apple delegando en state.js
   - evitar indicador colgado al colapsar/expandir
   - centralizar commit visual post-router/post-resize/post-auth
   - evitar tormentas AppCore.cleanup.run / cleanup:disposed / firebreak
   - evitar doble suscripción AppCore.events + window
   - evitar doble cleanup AppCore.cleanup + cleanup local

   FIX REAL:
   - NO usa AppCore.cleanup.on/event para eventos del sidebar.
   - Usa cleanup local propio por scope.
   - Usa AppCore.events como fuente principal para eventos core.
   - Solo usa window.addEventListener como fallback si no existe AppCore.events.
   - safeEmit NO emite por AppCore.events y window a la vez.
   - NO escucha sidebar:refreshed/sidebar:repaired/sidebar:state:synced.
   - NO escucha app:user-ui:sync para evitar bucles de sync visual.
   - NO escucha router:shell:state para evitar loops con repairShell().
   - router rendered NO fuerza open/close del sidebar.
   - active item se recalcula tras router:rendered/app:route:change.
   - indicador se recalcula después del layout final.
   - durante transición se oculta el indicador para evitar burbuja flotante.
   - handlers viejos quedan invalidados por epoch aunque el bus no permita off().

   FIX CLICK SIDEBAR:
   - Los clicks del menú navegan explícitamente con Router.navigate().
   - El listener document click va en capture para ganar al Router global.
   - Ya no depende solo del listener global del Router.
   - Soporta data-route / data-href / data-to / href.
   - Respeta Ctrl/Cmd/Shift/Alt click.
   - Respeta target="_blank", download, URLs externas y href inseguros.
   - Los botones del dropdown con data-route también navegan.

   FIX ACTIVE WRONG:
   - En commits de router, la URL visible tiene prioridad.
   - Payloads viejos de router/app state no pisan el activo.
   - /@usuario/facturas se normaliza a /facturas.
   - Alias ES/CA/EN:
     /factures, /invoices => /facturas
     /incidencies, /tickets => /incidencias
     /usuaris, /users => /usuarios
     /clients, /customers => /clientes
     /compte, /account => /cuenta
========================================================= */

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  syncActiveMenuItem as syncActiveMenuItemBase,
  syncActiveMenuIndicator as syncActiveMenuIndicatorBase,
  scheduleActiveMenuIndicator as scheduleActiveMenuIndicatorBase,
  isRealShellHidden as isRealShellHiddenBase,
} from "./state.js";

/* ======================================================
   LOCAL CLEANUP / EPOCHS
====================================================== */

const localCleanups = new Map();
const scopeEpochs = new Map();

/* ======================================================
   CONSTANTS
====================================================== */

const DEFAULT_SCOPE = "ui:sidebar";

const INDICATOR_DEFAULT_DELAY = 40;
const INDICATOR_TRANSITION_MS = 380;
const ROUTER_SETTLED_DELAY = 140;
const RESIZE_DEBOUNCE_MS = 120;

const HANDLED_FLAG = "__onionSidebarHandled";
const LOCAL_HANDLED_FLAG = "__onionSidebarEventsHandled";

const ROUTE_CURRENT_VALUE = "page";

const ROUTE_ALIASES = Object.freeze({
  "/home": "/",
  "/dashboard": "/",
  "/inicio": "/",
  "/inici": "/",

  "/tickets": "/incidencias",
  "/ticket": "/incidencias",
  "/incidents": "/incidencias",
  "/incident": "/incidencias",
  "/incidencies": "/incidencias",
  "/incidencia": "/incidencias",

  "/invoices": "/facturas",
  "/invoice": "/facturas",
  "/billing": "/facturas",
  "/factures": "/facturas",
  "/factura": "/facturas",

  "/users": "/usuarios",
  "/user": "/usuarios",
  "/usuaris": "/usuarios",
  "/usuari": "/usuarios",
  "/usuario": "/usuarios",

  "/clients": "/clientes",
  "/client": "/clientes",
  "/customers": "/clientes",
  "/customer": "/clientes",
  "/cliente": "/clientes",

  "/account": "/cuenta",
  "/profile": "/cuenta",
  "/compte": "/cuenta",
  "/perfil": "/cuenta",

  "/settings": "/ajustes",
  "/config": "/ajustes",
  "/configuracion": "/ajustes",
  "/configuración": "/ajustes",
  "/configuracio": "/ajustes",
  "/configuració": "/ajustes",

  "/server": "/servidor",
  "/servidor": "/servidor",
});

/* ======================================================
   BASICS
====================================================== */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function hasWindow() {
  return typeof window !== "undefined";
}

function hasDocument() {
  return typeof document !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isFn(value) {
  return typeof value === "function";
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function resolveScope(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function resolveLocalScope(scope = DEFAULT_SCOPE, type = "local") {
  return `${resolveScope(scope)}:${safeText(type, "local")}`;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarEvents]", ...args);
  } catch {}

  try {
    console.warn("[SidebarEvents]", ...args);
  } catch {}
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[SidebarEvents]", ...args);
  } catch {}
}

/*
  Importante:
  No emitimos por AppCore.events Y window a la vez.
  Si el bus existe, usamos el bus. Si no existe, fallback a window.
*/
function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló`, error);
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function safeWindowTimeout(fn, ms = 0) {
  if (!isFn(fn)) {
    return null;
  }

  const safeFn = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (hasWindow()) {
      return window.setTimeout(safeFn, Math.max(0, Number(ms) || 0));
    }
  } catch {}

  safeFn();

  return null;
}

function clearWindowTimeout(timer) {
  if (!timer) {
    return false;
  }

  try {
    if (hasWindow()) {
      window.clearTimeout(timer);
      return true;
    }
  } catch {}

  return false;
}

function safeRequestAnimationFrame(fn) {
  if (!isFn(fn)) {
    return null;
  }

  const safeFn = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (hasWindow() && isFn(window.requestAnimationFrame)) {
      return window.requestAnimationFrame(safeFn);
    }
  } catch {}

  return safeWindowTimeout(safeFn, 0);
}

function afterFrames(fn, frames = 2) {
  const total = Math.max(1, Number(frames) || 1);

  const step = (remaining) => {
    if (remaining <= 0) {
      try {
        fn?.();
      } catch {}

      return;
    }

    safeRequestAnimationFrame(() => {
      step(remaining - 1);
    });
  };

  step(total);
}

function safeIsShellHidden(AppCore) {
  try {
    if (isFn(isRealShellHiddenBase)) {
      return Boolean(isRealShellHiddenBase(AppCore));
    }
  } catch {}

  try {
    return Boolean(isShellHidden(AppCore));
  } catch {
    return false;
  }
}

function resolveElements(AppCore, resolver) {
  if (isFn(resolver)) {
    try {
      return resolver() || getElements(AppCore);
    } catch {
      return getElements(AppCore);
    }
  }

  return getElements(AppCore);
}

function isNode(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {
    return Boolean(value && typeof value === "object");
  }
}

function isElement(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.closest === "function");
  }
}

function isConnectedElement(value = null) {
  if (!isElement(value)) {
    return false;
  }

  try {
    return value.isConnected !== false;
  } catch {
    return true;
  }
}

function containsElement(parent = null, child = null) {
  if (!parent || !child) {
    return false;
  }

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function getEventDetail(eventOrPayload = {}) {
  if (eventOrPayload?.detail && typeof eventOrPayload.detail === "object") {
    return eventOrPayload.detail;
  }

  if (eventOrPayload?.payload && typeof eventOrPayload.payload === "object") {
    return eventOrPayload.payload;
  }

  if (eventOrPayload && typeof eventOrPayload === "object") {
    return eventOrPayload;
  }

  return {};
}

function preventDefaultAndStop(event) {
  try {
    event?.preventDefault?.();
  } catch {}

  try {
    event?.stopPropagation?.();
  } catch {}

  try {
    event?.stopImmediatePropagation?.();
  } catch {}
}

/* ======================================================
   ROUTE / CURRENT PATH HELPERS
====================================================== */

function getBaseOrigin() {
  try {
    if (isBrowser() && window.location?.origin) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function isUnsafeRouteValue(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return Boolean(
    raw.startsWith("javascript:") ||
      raw.startsWith("data:") ||
      raw.startsWith("vbscript:") ||
      raw.startsWith("file:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:")
  );
}

function isProtocolHref(value = "") {
  return /^[a-z][a-z0-9+.-]*:/i.test(safeText(value, ""));
}

function isExternalHref(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return false;
  }

  if (!isProtocolHref(raw)) {
    return false;
  }

  try {
    const url = new URL(raw, getBaseOrigin());

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin !== getBaseOrigin();
    }

    return true;
  } catch {
    return true;
  }
}

function isHashOnlyHref(value = "") {
  const href = safeText(value, "");
  return href.startsWith("#") && !href.startsWith("#/") && !href.startsWith("#!");
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function stripPublicUsernamePrefix(pathname = "/") {
  const value = safeText(pathname, "/").replace(/^\/@[^/]+(?=\/|$)/i, "");
  return value || "/";
}

function normalizePathnameOnly(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function applyRouteAlias(pathname = "/") {
  const clean = normalizePathnameOnly(pathname || "/");

  if (ROUTE_ALIASES[clean]) {
    return ROUTE_ALIASES[clean];
  }

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (from !== "/" && clean.startsWith(`${from}/`)) {
      return `${to}${clean.slice(from.length)}`;
    }
  }

  return clean;
}

function normalizeRoutePath(path = "/") {
  let value = safeText(path, "/");

  if (!value) {
    return "/";
  }

  if (isUnsafeRouteValue(value) || isExternalHref(value) || isHashOnlyHref(value)) {
    return "";
  }

  if (isHashRouterPath(value)) {
    value = normalizeHashRouterPath(value);
  }

  try {
    const parsed = new URL(value, getBaseOrigin());

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      value = normalizeHashRouterPath(parsed.hash);
    } else {
      value = `${parsed.pathname || "/"}${parsed.search || ""}`;
    }
  } catch {
    value = value.split("#")[0] || "/";
  }

  value = safeText(value, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const [pathname, query = ""] = value.split("?");

  const cleanPathname = applyRouteAlias(
    stripPublicUsernamePrefix(
      normalizePathnameOnly(pathname || "/")
    )
  );

  return query ? `${cleanPathname}?${query}` : cleanPathname;
}

function stripQuery(path = "/") {
  return normalizeRoutePath(path).split("?")[0] || "/";
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizeRoutePath(normalizeHashRouterPath(hash));
    }

    return normalizeRoutePath(`${pathname}${search}`);
  } catch {
    return "/";
  }
}

function getRouterPath(Router = null) {
  const router = Router || null;

  return normalizeRoutePath(
    first(
      router?.getCurrentPublicPath?.(),
      router?.getCurrentCanonicalPath?.(),
      router?.getCurrentPath?.(),
      ""
    )
  );
}

function getAppStatePath(AppCore = null) {
  return normalizeRoutePath(
    first(
      AppCore?.state?.publicPath,
      AppCore?.state?.route,
      AppCore?.state?.canonicalPath,
      AppCore?.state?.lastRoute,
      ""
    )
  );
}

function collectExplicitRouteCandidates(payload = {}) {
  const detail = safeObject(payload);

  return [
    detail.publicPath,
    detail.path,
    detail.requestedPath,
    detail.canonicalPath,
    detail.route,
    detail.to,
    detail.url,
    detail.href,

    detail.current?.publicPath,
    detail.current?.path,
    detail.current?.route,
    detail.current?.canonicalPath,

    detail.next?.publicPath,
    detail.next?.path,
    detail.next?.route,
    detail.next?.canonicalPath,

    detail.route?.publicPath,
    detail.route?.path,
    detail.route?.canonicalPath,

    detail.payload?.publicPath,
    detail.payload?.path,
    detail.payload?.requestedPath,
    detail.payload?.canonicalPath,
    detail.payload?.route,
    detail.payload?.to,
    detail.payload?.url,

    detail.detail?.publicPath,
    detail.detail?.path,
    detail.detail?.requestedPath,
    detail.detail?.canonicalPath,
    detail.detail?.route,
    detail.detail?.to,
    detail.detail?.url,
  ]
    .map((value) => normalizeRoutePath(value || ""))
    .filter(Boolean);
}

function pushUniqueRoute(list, value) {
  const route = normalizeRoutePath(value || "");

  if (route && !list.includes(route)) {
    list.push(route);
  }

  return list;
}

function reasonPrefersExplicitRoute(reason = "") {
  const key = safeText(reason, "").toLowerCase();

  return Boolean(
    key.includes("sidebar") ||
      key.includes("navigation") ||
      key.includes("navigate") ||
      key.includes("active-route") ||
      key.includes("open-activity") ||
      key.includes("manual") ||
      key.includes("click")
  );
}

function resolveFreshRoute(payload = {}, AppCore = null, Router = null, options = {}) {
  const opts = safeObject(options);
  const detail = safeObject(payload);

  const explicit = collectExplicitRouteCandidates(detail);
  const browser = getBrowserPath();
  const router = getRouterPath(Router || AppCore?.Router || AppCore?.router);
  const appState = getAppStatePath(AppCore);

  const preferExplicit =
    opts.preferExplicitRoute === true ||
    opts.forceRoute === true ||
    detail.preferExplicitRoute === true ||
    detail.forceRoute === true ||
    reasonPrefersExplicitRoute(
      first(opts.reason, detail.reason, detail.type, detail.event, "")
    );

  const candidates = [];

  const hasNonRootExplicit = explicit.some((value) => value && stripQuery(value) !== "/");
  const shouldPrioritizeExplicit = preferExplicit && (hasNonRootExplicit || opts.forceRoute === true || detail.forceRoute === true);

  if (shouldPrioritizeExplicit) {
    explicit.forEach((value) => pushUniqueRoute(candidates, value));
    pushUniqueRoute(candidates, router);
    pushUniqueRoute(candidates, appState);
    pushUniqueRoute(candidates, browser);
  } else {
    /*
      FIX CRÍTICO:
      En commits de router/render/theme/lang, la URL visible gana.
      Esto evita que un payload atrasado de /incidencias marque el menú
      cuando el navegador ya está en /@usuario/facturas.
    */
    pushUniqueRoute(candidates, browser);
    pushUniqueRoute(candidates, router);
    pushUniqueRoute(candidates, appState);
    explicit.forEach((value) => pushUniqueRoute(candidates, value));
  }

  return candidates[0] || "/";
}

function buildRoutePayload(ctx = {}, payload = {}, reason = "", options = {}) {
  const AppCore = ctx.AppCore;
  const Router = ctx.Router || AppCore?.Router || AppCore?.router;

  const route = resolveFreshRoute(payload, AppCore, Router, {
    ...safeObject(options),
    reason,
  });

  return {
    ...safeObject(payload),
    reason,
    route,
    publicPath: route,
    path: route,
    canonicalPath: stripQuery(route),
    currentPublicPath: route,
    browserPublicPath: getBrowserPath(),
    routerPublicPath: getRouterPath(Router),
    appPublicPath: getAppStatePath(AppCore),
  };
}

/* ======================================================
   NAVIGATION HELPERS
====================================================== */

function isPrimaryClick(event) {
  if (!event) {
    return true;
  }

  if ("button" in event && event.button !== 0) {
    return false;
  }

  return true;
}

function isModifiedClick(event) {
  return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey);
}

function isDisabledInteractive(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.disabled ||
      element.hasAttribute?.("disabled") ||
      element.getAttribute?.("aria-disabled") === "true"
  );
}

function shouldLetBrowserHandleNavigation(element = null, event = null) {
  if (!element) {
    return true;
  }

  if (!isPrimaryClick(event) || isModifiedClick(event)) {
    return true;
  }

  if (isDisabledInteractive(element) || element.hasAttribute?.("download")) {
    return true;
  }

  const target = safeText(element.getAttribute?.("target"), "").toLowerCase();

  return target === "_blank";
}

function getRouteFromElement(element = null) {
  if (!element) {
    return "";
  }

  return (
    safeText(element.getAttribute?.("data-route"), "") ||
    safeText(element.getAttribute?.("data-href"), "") ||
    safeText(element.getAttribute?.("data-to"), "") ||
    safeText(element.getAttribute?.("href"), "")
  );
}

function normalizeSidebarTarget(AppCore, Router, value = "") {
  let raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isUnsafeRouteValue(raw) || isExternalHref(raw) || isHashOnlyHref(raw)) {
    return "";
  }

  try {
    if (isFn(Router?.resolveSpaHref)) {
      raw = safeText(Router.resolveSpaHref(raw), raw);
    }
  } catch {}

  if (!raw || isUnsafeRouteValue(raw) || isExternalHref(raw) || isHashOnlyHref(raw)) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw, getBaseOrigin());

      if (url.origin !== getBaseOrigin()) {
        return "";
      }

      raw = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "";
  }

  try {
    if (isFn(AppCore?.utils?.normalizePath)) {
      return AppCore.utils.normalizePath(raw || "/");
    }
  } catch {}

  return normalizeRoutePath(raw.startsWith("/") || raw.startsWith("#") ? raw : `/${raw}`);
}

async function navigateFromSidebar({
  AppCore,
  Router,
  target = "",
  source = "sidebar",
} = {}) {
  const finalRouter = Router || AppCore?.Router || AppCore?.router;

  const cleanTarget = normalizeSidebarTarget(AppCore, finalRouter, target);

  if (!cleanTarget) {
    return false;
  }

  try {
    if (isFn(finalRouter?.navigate)) {
      await Promise.resolve(
        finalRouter.navigate(cleanTarget, {
          source,
          force: false,
        })
      );

      return true;
    }

    if (isFn(finalRouter?.go)) {
      await Promise.resolve(
        finalRouter.go(cleanTarget, {
          source,
          force: false,
        })
      );

      return true;
    }

    if (isFn(finalRouter?.push)) {
      await Promise.resolve(
        finalRouter.push(cleanTarget, {
          source,
          force: false,
        })
      );

      return true;
    }
  } catch (error) {
    safeWarn(AppCore, "Navegación Router falló desde sidebar.", {
      target: cleanTarget,
      source,
      error,
    });
  }

  try {
    if (isBrowser()) {
      window.history.pushState({}, "", cleanTarget);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.location.href = cleanTarget;
      return true;
    }
  } catch {}

  return false;
}

function getSidebarNavigationElement(target = null) {
  if (!target || !isElement(target)) {
    return null;
  }

  return (
    target.closest?.(
      [
        "[data-sidebar-nav='true']",
        "a[data-sidebar-item='true']",
        "a[data-spa]",
        "a[data-route]",
        "a[data-href]",
        "a[data-to]",
        "a[href]",
        ".menu-item[data-route]",
        ".menu-item[data-href]",
        ".menu-item[data-to]",
      ].join(",")
    ) || null
  );
}

function getDropdownNavigationElement(target = null) {
  if (!target || !isElement(target)) {
    return null;
  }

  return (
    target.closest?.(
      [
        "a[data-spa]",
        "a[data-route]",
        "a[data-href]",
        "a[data-to]",
        "a[href]",
        "button[data-route]",
        "button[data-href]",
        "button[data-to]",
        "[data-sidebar-action='profile']",
        "[data-sidebar-action='settings']",
      ].join(",")
    ) || null
  );
}

/* ======================================================
   LOCAL ACTIVE MATCHER · STALE ROUTE OVERRIDE
====================================================== */

function getMenuItems(sidebarMenu = null) {
  if (!sidebarMenu) {
    return [];
  }

  try {
    return Array.from(
      sidebarMenu.querySelectorAll(
        [
          ".menu-item",
          "[data-sidebar-nav='true']",
          "a[data-sidebar-item='true']",
          "a[data-spa]",
          "a[data-route]",
          "a[data-href]",
          "a[data-to]",
          "a[href]",
        ].join(",")
      )
    ).filter((item, index, array) => item && array.indexOf(item) === index);
  } catch {
    return [];
  }
}

function getMenuItemRoute(item = null) {
  return normalizeRoutePath(getRouteFromElement(item));
}

function isVisibleMenuItem(item = null) {
  if (!item || !isConnectedElement(item)) {
    return false;
  }

  try {
    if (item.hidden) return false;

    if (
      item.closest?.(
        [
          "[hidden]",
          "[inert]",
          "[aria-hidden='true']",
          "[data-role-visible='false']",
          "[data-admin-visible='false']",
          "[data-sidebar-visible='false']",
        ].join(",")
      )
    ) {
      return false;
    }

    const style = window.getComputedStyle(item);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      safeNumber(style.opacity, 1) === 0
    ) {
      return false;
    }

    const rect = item.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
  } catch {
    return true;
  }
}

function clearActiveItemClasses(sidebarMenu = null) {
  const items = getMenuItems(sidebarMenu);

  for (const item of items) {
    try {
      item.classList?.remove?.("active", "is-active", "router-active");
      item.removeAttribute?.("aria-current");

      if (item.dataset) {
        delete item.dataset.active;
      }
    } catch {}
  }

  return true;
}

function setActiveItemClasses(item = null, matchedRoute = "") {
  if (!item) {
    return false;
  }

  try {
    item.classList?.add?.("active", "is-active", "router-active");
    item.setAttribute?.("aria-current", ROUTE_CURRENT_VALUE);

    if (item.dataset) {
      item.dataset.active = "true";
      item.dataset.matchedRoute = safeText(matchedRoute, "");
    }

    return true;
  } catch {
    return false;
  }
}

function scoreRouteMatch(routePath = "/", currentPath = "/") {
  const route = normalizeRoutePath(routePath);
  const current = normalizeRoutePath(currentPath);

  const routeClean = stripQuery(route);
  const currentClean = stripQuery(current);

  if (!route || !current) {
    return -1;
  }

  if (route === current) {
    return 10000 + route.length;
  }

  if (routeClean === currentClean) {
    return 9000 + routeClean.length;
  }

  if (routeClean !== "/" && currentClean.startsWith(`${routeClean}/`)) {
    return 5000 + routeClean.length;
  }

  if (routeClean === "/" && currentClean === "/") {
    return 1000;
  }

  return -1;
}

function findBestMenuItemForRoute(sidebarMenu = null, route = "/") {
  const targetRoute = normalizeRoutePath(route || "/");
  const items = getMenuItems(sidebarMenu);

  let best = null;
  let bestScore = -1;
  let bestRoute = "";

  for (const item of items) {
    if (!isVisibleMenuItem(item)) {
      continue;
    }

    const itemRoute = getMenuItemRoute(item);

    if (!itemRoute) {
      continue;
    }

    const score = scoreRouteMatch(itemRoute, targetRoute);

    if (score > bestScore) {
      best = item;
      bestScore = score;
      bestRoute = itemRoute;
    }
  }

  if (bestScore < 0) {
    return null;
  }

  try {
    best.dataset.matchedRoute = bestRoute;
  } catch {}

  return best;
}

function setOptimisticSidebarActiveItem(sidebarMenu = null, item = null) {
  if (!sidebarMenu || !item) {
    return false;
  }

  clearActiveItemClasses(sidebarMenu);
  return setActiveItemClasses(item, getMenuItemRoute(item));
}

function syncLocalActiveMenuItem(ctx = {}, route = "/", options = {}) {
  const AppCore = ctx.AppCore;

  const { sidebarMenu } = resolveElements(AppCore, ctx.getElements);

  if (!sidebarMenu) {
    return null;
  }

  const activeItem = findBestMenuItemForRoute(sidebarMenu, route);

  if (!activeItem) {
    return null;
  }

  if (options.mutate !== false) {
    clearActiveItemClasses(sidebarMenu);
    setActiveItemClasses(activeItem, route);
  }

  return activeItem;
}

/* ======================================================
   EVENT DEDUPE
====================================================== */

function markSidebarEventHandled(event, reason = "") {
  if (!event) {
    return false;
  }

  try {
    event[HANDLED_FLAG] = true;
    event[LOCAL_HANDLED_FLAG] = true;
    event.__onionSidebarReason = safeText(reason, "");
  } catch {}

  return true;
}

function wasSidebarEventHandled(event) {
  return Boolean(event?.[HANDLED_FLAG] || event?.[LOCAL_HANDLED_FLAG]);
}

/* ======================================================
   SCOPE EPOCH / CLEANUP
====================================================== */

function getScopeEpoch(scope) {
  const scopeName = resolveScope(scope);
  return Number(scopeEpochs.get(scopeName) || 0);
}

function bumpScopeEpoch(scope) {
  const scopeName = resolveScope(scope);
  const next = getScopeEpoch(scopeName) + 1;

  scopeEpochs.set(scopeName, next);

  return next;
}

function isCurrentScopeEpoch(scope, epoch) {
  return getScopeEpoch(scope) === epoch;
}

function pushLocalCleanup(scope, cleanup) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  cleanups.push(cleanup);
  localCleanups.set(scopeName, cleanups);
}

function runLocalCleanups(scope) {
  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  for (const cleanup of cleanups) {
    try {
      cleanup?.();
    } catch {}
  }

  localCleanups.delete(scopeName);

  return true;
}

function resetLocalScope(scope) {
  const scopeName = resolveScope(scope);
  const epoch = bumpScopeEpoch(scopeName);

  runLocalCleanups(scopeName);

  return epoch;
}

function disposeLocalScope(scope) {
  const scopeName = resolveScope(scope);

  bumpScopeEpoch(scopeName);
  runLocalCleanups(scopeName);

  return true;
}

function makeSafeHandler(AppCore, scope, epoch, label = "handler", handler) {
  if (!isFn(handler)) {
    return () => {};
  }

  const scopeName = resolveScope(scope);

  return function safeBoundHandler(...args) {
    if (!isCurrentScopeEpoch(scopeName, epoch)) {
      return undefined;
    }

    try {
      const result = handler(...args);

      if (result && typeof result === "object" && isFn(result.catch)) {
        result.catch((error) => {
          safeWarn(AppCore, `${label} falló async`, error);
        });
      }

      return result;
    } catch (error) {
      safeWarn(AppCore, `${label} falló`, error);
      return undefined;
    }
  };
}

/* ======================================================
   DOM BIND LOW LEVEL
====================================================== */

function bindDom(AppCore, scope, epoch, target, eventName, handler, options = undefined) {
  const scopeName = resolveScope(scope);

  if (!target || !eventName || !isFn(handler) || !isFn(target.addEventListener)) {
    return () => {};
  }

  const safeHandler = makeSafeHandler(
    AppCore,
    scopeName,
    epoch,
    `DOM "${eventName}"`,
    handler
  );

  const cleanup = () => {
    try {
      target.removeEventListener(eventName, safeHandler, options);
    } catch {}
  };

  try {
    target.addEventListener(eventName, safeHandler, options);
    pushLocalCleanup(scopeName, cleanup);
    return cleanup;
  } catch (error) {
    safeWarn(AppCore, `addEventListener falló para DOM "${eventName}"`, error);
    return () => {};
  }
}

/* ======================================================
   CORE EVENT BIND LOW LEVEL
====================================================== */

function bindCoreEvent(AppCore, scope, epoch, eventName, handler) {
  const scopeName = resolveScope(scope);
  const cleanEventName = safeText(eventName, "");

  if (!cleanEventName || !isFn(handler)) {
    return () => {};
  }

  const safeHandler = makeSafeHandler(
    AppCore,
    scopeName,
    epoch,
    `Core event "${cleanEventName}"`,
    handler
  );

  let busOff = null;
  let boundToBus = false;

  try {
    if (isFn(AppCore?.events?.on)) {
      const maybeOff = AppCore.events.on(cleanEventName, safeHandler);

      if (isFn(maybeOff)) {
        busOff = maybeOff;
      } else {
        busOff = () => {
          try {
            AppCore?.events?.off?.(cleanEventName, safeHandler);
          } catch {}
        };
      }

      boundToBus = true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.on falló para "${cleanEventName}"`, error);
  }

  if (boundToBus) {
    const cleanup = () => {
      try {
        busOff?.();
      } catch {}
    };

    pushLocalCleanup(scopeName, cleanup);

    return cleanup;
  }

  const windowHandler = (event) => {
    safeHandler(event);
  };

  let windowBound = false;

  try {
    if (hasWindow()) {
      window.addEventListener(cleanEventName, windowHandler);
      windowBound = true;
    }
  } catch (error) {
    safeWarn(AppCore, `window.addEventListener falló para "${cleanEventName}"`, error);
  }

  const cleanup = () => {
    if (windowBound) {
      try {
        window.removeEventListener(cleanEventName, windowHandler);
      } catch {}
    }
  };

  if (windowBound) {
    pushLocalCleanup(scopeName, cleanup);
  }

  return cleanup;
}

/* ======================================================
   ACTIVE MENU / INDICATOR BRIDGE TO state.js
====================================================== */

function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore = ctx.AppCore;
  const Router = ctx.Router || AppCore?.Router || AppCore?.router;

  const reason = safeText(
    payload?.reason || payload?.type || payload?.event || "sidebar-events:active-sync",
    "sidebar-events:active-sync"
  );

  const routePayload = buildRoutePayload(
    {
      ...ctx,
      AppCore,
      Router,
    },
    payload,
    reason,
    payload
  );

  let baseItem = null;

  try {
    baseItem = syncActiveMenuItemBase(AppCore, {
      ...routePayload,
      mutate: true,
    });
  } catch (error) {
    safeWarn(AppCore, "syncActiveMenuItemBase falló", error);
  }

  /*
    FIX CRÍTICO:
    state.js puede recibir candidatos stale desde AppCore/router.
    Esta corrección local fuerza el item correcto con la ruta fresca.
  */
  const fixedItem = syncLocalActiveMenuItem(
    {
      ...ctx,
      AppCore,
      Router,
    },
    routePayload.route,
    {
      mutate: true,
    }
  );

  if (fixedItem && fixedItem !== baseItem) {
    safeEmit(AppCore, "sidebar:active:item:overridden", {
      source: "SidebarEvents",
      reason,
      route: routePayload.route,
      previousRoute: getMenuItemRoute(baseItem),
      fixedRoute: getMenuItemRoute(fixedItem),
    });
  }

  return fixedItem || baseItem || null;
}

function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;
  const Router = ctx.Router || AppCore?.Router || AppCore?.router;

  const reason = safeText(options.reason, "sidebar-events:indicator-sync");

  const routePayload = buildRoutePayload(
    {
      ...ctx,
      AppCore,
      Router,
    },
    options,
    reason,
    options
  );

  const activeItem =
    options.activeItem ||
    syncLocalActiveMenuItem(
      {
        ...ctx,
        AppCore,
        Router,
      },
      routePayload.route,
      {
        mutate: true,
      }
    );

  try {
    return syncActiveMenuIndicatorBase(AppCore, {
      ...routePayload,
      activeItem,
      reveal: options.reveal !== false,
      force: options.force === true,
    });
  } catch (error) {
    safeWarn(AppCore, "syncActiveMenuIndicatorBase falló", error);
    return false;
  }
}

function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;
  const Router = ctx.Router || AppCore?.Router || AppCore?.router;

  const reason = safeText(options.reason, "sidebar-events:indicator-scheduled");

  const routePayload = buildRoutePayload(
    {
      ...ctx,
      AppCore,
      Router,
    },
    options,
    reason,
    options
  );

  const activeItem =
    options.activeItem ||
    syncLocalActiveMenuItem(
      {
        ...ctx,
        AppCore,
        Router,
      },
      routePayload.route,
      {
        mutate: true,
      }
    );

  try {
    return scheduleActiveMenuIndicatorBase(AppCore, {
      ...routePayload,
      activeItem,
      delayMs: Number.isFinite(Number(options.delayMs))
        ? Number(options.delayMs)
        : INDICATOR_DEFAULT_DELAY,
      reveal: options.reveal !== false,
      force: options.force === true,
    });
  } catch (error) {
    safeWarn(AppCore, "scheduleActiveMenuIndicatorBase falló", error);
    return false;
  }
}

function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  const AppCore = ctx.AppCore;

  try {
    return syncActiveMenuIndicatorBase(AppCore, {
      reason: safeText(reason, "hide"),
      reveal: false,
      force: true,
    });
  } catch {
    const { sidebarMenu } = resolveElements(AppCore, ctx.getElements);

    if (!sidebarMenu) {
      return false;
    }

    try {
      sidebarMenu.dataset.indicatorReady = "false";
      sidebarMenu.style.setProperty("--sidebar-indicator-opacity", "0");
    } catch {}

    return true;
  }
}

function beginSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const AppCore = ctx.AppCore;

  const { sidebar, body, sidebarMenu } = resolveElements(AppCore, ctx.getElements);

  hideActiveMenuIndicator(ctx, `${reason}:begin`);

  try {
    sidebar?.classList?.add?.("is-transitioning");
    body?.classList?.add?.("sidebar-transitioning");
    sidebarMenu?.classList?.add?.("is-transitioning");
  } catch {}

  safeEmit(AppCore, "sidebar:transition:begin", {
    reason,
  });

  return true;
}

function endSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const AppCore = ctx.AppCore;

  const { sidebar, body, sidebarMenu } = resolveElements(AppCore, ctx.getElements);

  try {
    sidebar?.classList?.remove?.("is-transitioning");
    body?.classList?.remove?.("sidebar-transitioning");
    sidebarMenu?.classList?.remove?.("is-transitioning");
  } catch {}

  const activeItem = syncActiveMenuItem(ctx, {
    reason: `${reason}:end`,
  });

  scheduleActiveMenuIndicator(ctx, {
    reason: `${reason}:end`,
    activeItem,
    delayMs: 24,
    reveal: true,
    force: true,
  });

  safeEmit(AppCore, "sidebar:transition:end", {
    reason,
  });

  return true;
}

/* ======================================================
   VISUAL COMMIT PIPELINE
====================================================== */

function createSidebarVisualCommitter(ctx = {}) {
  const AppCore = ctx.AppCore;

  const timers = new Map();

  let transitionTimer = null;
  let committing = false;
  let lastReason = "";

  const clearTimer = (key = "default") => {
    const timer = timers.get(key);

    if (timer) {
      clearWindowTimeout(timer);
      timers.delete(key);
    }
  };

  const commitNow = (options = {}) => {
    if (committing) {
      return false;
    }

    committing = true;

    const reason = safeText(options.reason, "visual-commit");

    lastReason = reason;

    try {
      if (options.closeDropdown === true) {
        try {
          ctx.closeDropdown?.();
        } catch (error) {
          safeWarn(AppCore, `closeDropdown falló en ${reason}`, error);
        }
      }

      if (options.renderIdentity === true) {
        try {
          ctx.renderUser?.();
        } catch (error) {
          safeWarn(AppCore, `renderUser falló en ${reason}`, error);
        }

        try {
          ctx.applyRoleVisibility?.();
        } catch (error) {
          safeWarn(AppCore, `applyRoleVisibility falló en ${reason}`, error);
        }
      }

      if (options.syncState === true && !safeIsShellHidden(AppCore)) {
        try {
          ctx.syncSidebarState?.();
        } catch (error) {
          safeWarn(AppCore, `syncSidebarState falló en ${reason}`, error);
        }
      }

      if (options.sanitize !== false) {
        try {
          sanitizeFooterTooltipState(AppCore);
        } catch (error) {
          safeWarn(AppCore, `sanitizeFooterTooltipState falló en ${reason}`, error);
        }
      }

      const payload = buildRoutePayload(ctx, safeObject(options.payload), reason, options);

      const activeItem = syncActiveMenuItem(ctx, payload);

      if (options.indicator !== false) {
        scheduleActiveMenuIndicator(ctx, {
          ...payload,
          reason,
          activeItem,
          delayMs: options.indicatorDelayMs ?? INDICATOR_DEFAULT_DELAY,
          reveal: options.reveal !== false,
          force: options.force === true,
        });
      }

      safeEmit(AppCore, "sidebar:visual:committed", {
        reason,
        lastReason,
        route: payload.route,
        browserPublicPath: payload.browserPublicPath,
        routerPublicPath: payload.routerPublicPath,
        appPublicPath: payload.appPublicPath,
      });

      return true;
    } finally {
      committing = false;
    }
  };

  const schedule = (options = {}) => {
    const key = safeText(options.key, "default");

    clearTimer(key);

    const delayMs = Number.isFinite(Number(options.delayMs))
      ? Number(options.delayMs)
      : 0;

    const timer = safeWindowTimeout(() => {
      timers.delete(key);

      afterFrames(() => {
        commitNow(options);
      }, options.frames || 1);
    }, delayMs);

    if (timer) {
      timers.set(key, timer);
    }

    return true;
  };

  const cancelAll = () => {
    timers.forEach((timer) => {
      clearWindowTimeout(timer);
    });

    timers.clear();

    clearWindowTimeout(transitionTimer);
    transitionTimer = null;

    return true;
  };

  const beginTransition = (reason = "transition") => {
    clearWindowTimeout(transitionTimer);

    beginSidebarLayoutTransition(ctx, reason);

    transitionTimer = safeWindowTimeout(() => {
      transitionTimer = null;
      endSidebarLayoutTransition(ctx, reason);
    }, INDICATOR_TRANSITION_MS);

    return true;
  };

  return {
    commitNow,
    schedule,
    cancelAll,

    hideIndicator: (reason = "hide") => hideActiveMenuIndicator(ctx, reason),

    beginTransition,

    endTransition: (reason = "transition") => {
      clearWindowTimeout(transitionTimer);
      transitionTimer = null;
      return endSidebarLayoutTransition(ctx, reason);
    },

    getLastReason: () => lastReason,
  };
}

/* ======================================================
   HIDDEN / INERT CLICK GUARD
====================================================== */

function isInsideSidebarArea(elements = {}, target = null) {
  const {
    sidebar,
    sidebarMenu,
    userToggle,
    userDropdown,
    toggleBtn,
    mobileToggleBtn,
    logoutBtn,
  } = safeObject(elements);

  return Boolean(
    containsElement(sidebar, target) ||
      containsElement(sidebarMenu, target) ||
      containsElement(userToggle, target) ||
      containsElement(userDropdown, target) ||
      containsElement(toggleBtn, target) ||
      containsElement(mobileToggleBtn, target) ||
      containsElement(logoutBtn, target)
  );
}

function shouldIgnoreHiddenTarget(target = null) {
  if (!isElement(target)) {
    return false;
  }

  const hardHidden = target.closest(
    [
      "[hidden]",
      "[inert]",
      "[data-sidebar-visible='false']",
      "[data-role-visible='false']",
      "[data-admin-visible='false']",
    ].join(",")
  );

  if (hardHidden) {
    return true;
  }

  const ariaHidden = target.closest("[aria-hidden='true']");

  if (!ariaHidden) {
    return false;
  }

  const interactiveParent = target.closest(
    [
      "a[data-spa]",
      "a[href]",
      "button",
      "[role='button']",
      "[data-route]",
      "[data-action]",
      "[data-sidebar-action]",
    ].join(",")
  );

  if (interactiveParent && interactiveParent.contains(ariaHidden)) {
    if (ariaHidden === interactiveParent) {
      return true;
    }

    return false;
  }

  return true;
}

function preventHiddenTargetClick(event) {
  const target = event?.target;

  if (!isElement(target)) {
    return false;
  }

  if (!shouldIgnoreHiddenTarget(target)) {
    return false;
  }

  preventDefaultAndStop(event);
  markSidebarEventHandled(event, "hidden-target");

  return true;
}

/* ======================================================
   DOM HANDLERS
====================================================== */

export function handleDocumentClick({
  AppCore,
  Router,
  event,
  toggleSidebar,
  toggleDropdown,
  closeDropdown,
  handleLogout,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  const elements = resolveElements(AppCore, resolver);

  const {
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
    sidebarMenu,
  } = elements;

  const target = event?.target;

  if (!isNode(target)) {
    return;
  }

  const insideSidebar = isInsideSidebarArea(elements, target);

  if (insideSidebar && preventHiddenTargetClick(event)) {
    return;
  }

  if (toggleBtn?.contains?.(target)) {
    markSidebarEventHandled(event, "document-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (mobileToggleBtn?.contains?.(target)) {
    markSidebarEventHandled(event, "document-mobile-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (userToggle?.contains?.(target)) {
    markSidebarEventHandled(event, "document-toggle-dropdown");
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (logoutBtn?.contains?.(target)) {
    markSidebarEventHandled(event, "document-logout");
    preventDefaultAndStop(event);
    void handleLogout?.();
    return;
  }

  const sidebarNav = getSidebarNavigationElement(target);

  if (sidebarNav && sidebarMenu?.contains?.(sidebarNav)) {
    if (shouldLetBrowserHandleNavigation(sidebarNav, event)) {
      return;
    }

    const finalRouter = Router || AppCore?.Router || AppCore?.router;

    const targetPath = normalizeSidebarTarget(
      AppCore,
      finalRouter,
      getRouteFromElement(sidebarNav)
    );

    if (!targetPath) {
      return;
    }

    markSidebarEventHandled(event, "document-sidebar-menu:navigate");
    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(AppCore, "sidebar:navigation:request", {
      target: targetPath,
      route: targetPath,
      publicPath: targetPath,
      path: targetPath,
      preferExplicitRoute: true,
      source: "sidebar-menu",
    });

    setOptimisticSidebarActiveItem(sidebarMenu, sidebarNav);

    const ctx = {
      AppCore,
      Router: finalRouter,
      getElements: resolver,
    };

    const activeItem = syncLocalActiveMenuItem(ctx, targetPath, {
      mutate: true,
    });

    scheduleActiveMenuIndicator(ctx, {
      reason: "sidebar-menu:navigate",
      route: targetPath,
      publicPath: targetPath,
      path: targetPath,
      preferExplicitRoute: true,
      activeItem,
      delayMs: 24,
      reveal: true,
      force: true,
    });

    void navigateFromSidebar({
      AppCore,
      Router: finalRouter,
      target: targetPath,
      source: "sidebar-menu",
    });

    return;
  }

  if (userDropdown?.contains?.(target)) {
    const routeButton = getDropdownNavigationElement(target);

    if (!routeButton) {
      return;
    }

    if (shouldLetBrowserHandleNavigation(routeButton, event)) {
      return;
    }

    const finalRouter = Router || AppCore?.Router || AppCore?.router;

    const targetPath = normalizeSidebarTarget(
      AppCore,
      finalRouter,
      getRouteFromElement(routeButton)
    );

    if (!targetPath) {
      return;
    }

    markSidebarEventHandled(event, "sidebar-dropdown:navigate");
    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(AppCore, "sidebar:dropdown:navigation:request", {
      target: targetPath,
      route: targetPath,
      publicPath: targetPath,
      path: targetPath,
      preferExplicitRoute: true,
      source: "sidebar-dropdown",
    });

    void navigateFromSidebar({
      AppCore,
      Router: finalRouter,
      target: targetPath,
      source: "sidebar-dropdown",
    });

    return;
  }

  if (!containsElement(userDropdown, target) && !containsElement(userToggle, target)) {
    closeDropdown?.();
  }
}

export function handleSidebarMenuClick({
  AppCore,
  Router,
  event,
  closeDropdown,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  if (!isPrimaryClick(event) || isModifiedClick(event)) {
    return;
  }

  const { sidebarMenu } = resolveElements(AppCore, resolver);

  if (!sidebarMenu) {
    return;
  }

  const target = event?.target;

  if (!isElement(target)) {
    return;
  }

  if (preventHiddenTargetClick(event)) {
    return;
  }

  const link = getSidebarNavigationElement(target);

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  if (shouldLetBrowserHandleNavigation(link, event)) {
    return;
  }

  const finalRouter = Router || AppCore?.Router || AppCore?.router;

  const targetPath = normalizeSidebarTarget(
    AppCore,
    finalRouter,
    getRouteFromElement(link)
  );

  if (!targetPath) {
    return;
  }

  markSidebarEventHandled(event, "sidebar-menu:navigate");
  preventDefaultAndStop(event);

  try {
    closeDropdown?.();
  } catch {}

  safeEmit(AppCore, "sidebar:navigation:request", {
    target: targetPath,
    route: targetPath,
    publicPath: targetPath,
    path: targetPath,
    preferExplicitRoute: true,
    source: "sidebar-menu",
  });

  setOptimisticSidebarActiveItem(sidebarMenu, link);

  const ctx = {
    AppCore,
    Router: finalRouter,
    getElements: resolver,
  };

  const activeItem = syncLocalActiveMenuItem(ctx, targetPath, {
    mutate: true,
  });

  scheduleActiveMenuIndicator(ctx, {
    reason: "sidebar-menu:navigate",
    route: targetPath,
    publicPath: targetPath,
    path: targetPath,
    preferExplicitRoute: true,
    activeItem,
    delayMs: 24,
    reveal: true,
    force: true,
  });

  void navigateFromSidebar({
    AppCore,
    Router: finalRouter,
    target: targetPath,
    source: "sidebar-menu",
  });
}

export function handleUserToggleKeydown({
  AppCore,
  event,
  toggleDropdown,
  closeDropdown,
  openDropdown,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  const { userToggle } = resolveElements(AppCore, resolver);

  if (!userToggle) {
    return;
  }

  if (!containsElement(userToggle, event?.target)) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    markSidebarEventHandled(event, "user-toggle-keyboard-toggle");
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (event.key === "Escape") {
    markSidebarEventHandled(event, "user-toggle-keyboard-close");
    preventDefaultAndStop(event);
    closeDropdown?.();
    return;
  }

  if (event.key === "ArrowDown") {
    markSidebarEventHandled(event, "user-toggle-keyboard-open");
    preventDefaultAndStop(event);

    openDropdown?.({
      focusFirst: true,
    });
  }
}

export function handleGlobalKeydown({ event, closeDropdown }) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  if (event?.key === "Escape") {
    closeDropdown?.();
  }
}

export function handleResize({
  AppCore,
  Router,
  syncSidebarState,
  closeDropdown,
  getElements: resolver,
}) {
  try {
    syncSidebarState?.();
  } catch {}

  try {
    closeDropdown?.();
  } catch {}

  const ctx = {
    AppCore,
    Router: Router || AppCore?.Router || AppCore?.router,
    getElements: resolver,
  };

  const payload = buildRoutePayload(ctx, {}, "resize", {
    force: true,
  });

  const activeItem = syncActiveMenuItem(ctx, payload);

  scheduleActiveMenuIndicator(ctx, {
    ...payload,
    reason: "resize",
    activeItem,
    delayMs: 96,
    reveal: true,
    force: true,
  });
}

/* ======================================================
   DOM BINDS
====================================================== */

export function bindDomEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    Router,
    handleLogout,
    toggleSidebar,
    toggleDropdown,
    openDropdown,
    closeDropdown,
    syncSidebarState,
    getElements: resolver,
  } = ctx;

  if (!isBrowser()) {
    return () => {};
  }

  const scopeName = resolveScope(scope);
  const localScope = resolveLocalScope(scopeName, "dom");
  const epoch = resetLocalScope(localScope);

  bindDom(
    AppCore,
    localScope,
    epoch,
    document,
    "click",
    (event) =>
      handleDocumentClick({
        AppCore,
        Router,
        event,
        toggleSidebar,
        toggleDropdown,
        closeDropdown,
        handleLogout,
        getElements: resolver,
      }),
    true
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
    document,
    "keydown",
    (event) => {
      handleUserToggleKeydown({
        AppCore,
        event,
        toggleDropdown,
        closeDropdown,
        openDropdown,
        getElements: resolver,
      });

      handleGlobalKeydown({
        event,
        closeDropdown,
      });
    }
  );

  const resizeHandler = isFn(AppCore?.utils?.debounce)
    ? AppCore.utils.debounce(
        () =>
          handleResize({
            AppCore,
            Router,
            syncSidebarState,
            closeDropdown,
            getElements: resolver,
          }),
        RESIZE_DEBOUNCE_MS
      )
    : () =>
        handleResize({
          AppCore,
          Router,
          syncSidebarState,
          closeDropdown,
          getElements: resolver,
        });

  bindDom(AppCore, localScope, epoch, window, "resize", resizeHandler);

  /*
    Fallback nativo:
    Si el router no emite bien, popstate/hashchange todavía corrigen el activo.
  */
  bindDom(
    AppCore,
    localScope,
    epoch,
    window,
    "popstate",
    () => {
      const localCtx = {
        AppCore,
        Router: Router || AppCore?.Router || AppCore?.router,
        getElements: resolver,
      };

      const payload = buildRoutePayload(localCtx, {}, "window:popstate", {
        force: true,
      });

      const activeItem = syncActiveMenuItem(localCtx, payload);

      scheduleActiveMenuIndicator(localCtx, {
        ...payload,
        reason: "window:popstate",
        activeItem,
        delayMs: 48,
        reveal: true,
        force: true,
      });
    }
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
    window,
    "hashchange",
    () => {
      const localCtx = {
        AppCore,
        Router: Router || AppCore?.Router || AppCore?.router,
        getElements: resolver,
      };

      const payload = buildRoutePayload(localCtx, {}, "window:hashchange", {
        force: true,
      });

      const activeItem = syncActiveMenuItem(localCtx, payload);

      scheduleActiveMenuIndicator(localCtx, {
        ...payload,
        reason: "window:hashchange",
        activeItem,
        delayMs: 48,
        reveal: true,
        force: true,
      });
    }
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
    document,
    "transitionend",
    (event) => {
      const target = event?.target;

      if (!isElement(target)) {
        return;
      }

      if (!target.closest?.(".sidebar")) {
        return;
      }

      const propertyName = safeText(event?.propertyName, "");

      if (
        propertyName &&
        ![
          "inline-size",
          "width",
          "transform",
          "margin-inline-start",
          "margin-left",
          "max-inline-size",
        ].includes(propertyName)
      ) {
        return;
      }

      const localCtx = {
        AppCore,
        Router: Router || AppCore?.Router || AppCore?.router,
        getElements: resolver,
      };

      endSidebarLayoutTransition(localCtx, "transitionend");
    },
    true
  );
  // Document-level handlers already process keydown/click for userToggle and menu navigation.
  // Avoid double-binding local handlers that can cause duplicated navigation/visual commits.

  safeEmit(AppCore, "sidebar:dom-events:bound", {
    scope: scopeName,
    localScope,
    epoch,
  });

  return () => {
    disposeLocalScope(localScope);
  };
}

/* ======================================================
   CORE EVENTS
====================================================== */

export function bindCoreEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    Router,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    closeDropdown,
    getElements: resolver,
  } = ctx;

  const scopeName = resolveScope(scope);
  const localScope = resolveLocalScope(scopeName, "core");
  const epoch = resetLocalScope(localScope);

  const visualCtx = {
    ...ctx,
    AppCore,
    Router: Router || AppCore?.Router || AppCore?.router,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    closeDropdown,
    getElements: resolver,
  };

  const visualCommitter = createSidebarVisualCommitter(visualCtx);

  const bindMany = (eventNames = [], handler) => {
    eventNames.forEach((eventName) => {
      bindCoreEvent(AppCore, localScope, epoch, eventName, handler);
    });
  };

  const commitIdentity = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity",
      reason: safeText(
        detail.reason || detail.type || detail.event || "identity",
        "identity"
      ),
      payload: detail,
      renderIdentity: true,
      syncState: false,
      closeDropdown: false,
      delayMs: 16,
      frames: 1,
      indicatorDelayMs: 48,
      force: true,
    });
  };

  const commitIdentityAndState = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity-state",
      reason: safeText(
        detail.reason || detail.type || detail.event || "identity-state",
        "identity-state"
      ),
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: false,
      delayMs: 24,
      frames: 1,
      indicatorDelayMs: 56,
      force: true,
    });
  };

  const commitSessionCleared = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "session-cleared",
      reason: safeText(
        detail.reason || detail.type || detail.event || "session-cleared",
        "session-cleared"
      ),
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: true,
      delayMs: 24,
      frames: 1,
      indicatorDelayMs: 56,
      force: true,
    });
  };

  const commitRoute = (eventName) => {
    return (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      const payload = buildRoutePayload(visualCtx, detail, eventName, {
        /*
          FIX:
          En eventos de router normales NO preferimos payload explícito.
          La URL visible gana para evitar activos viejos.
        */
        preferExplicitRoute: false,
        force: true,
      });

      visualCommitter.schedule({
        key: "route",
        reason: eventName,
        payload,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: 24,
        frames: 2,
        indicatorDelayMs: 32,
        force: true,
      });
    };
  };

  const commitRouterRendered = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    const payload = buildRoutePayload(visualCtx, detail, "router:rendered", {
      preferExplicitRoute: false,
      force: true,
    });

    visualCommitter.schedule({
      key: "router-rendered",
      reason: "router:rendered",
      payload,
      renderIdentity: false,
      syncState: false,
      closeDropdown: true,
      delayMs: 0,
      frames: 2,
      indicatorDelayMs: 48,
      force: true,
    });

    visualCommitter.schedule({
      key: "router-rendered-settled",
      reason: "router:rendered:settled",
      payload,
      renderIdentity: false,
      syncState: false,
      closeDropdown: false,
      delayMs: ROUTER_SETTLED_DELAY,
      frames: 2,
      indicatorDelayMs: 0,
      force: true,
    });
  };

  const commitSidebarTransition = (eventName) => {
    return (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.beginTransition(eventName);

      visualCommitter.schedule({
        key: "sidebar-transition-live",
        reason: eventName,
        payload: detail,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: 48,
        indicatorDelayMs: 80,
        force: true,
      });

      visualCommitter.schedule({
        key: "sidebar-transition-settled",
        reason: `${eventName}:settled`,
        payload: detail,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: INDICATOR_TRANSITION_MS,
        indicatorDelayMs: 24,
        force: true,
      });
    };
  };

  bindMany(
    [
      "app:user:change",
      "app:user:updated",
      "app:session:change",
      "app:session:restored",
      "app:auth:change",

      "auth:change",
      "auth:updated",
      "auth:restore:success",
      "auth:session:restored",
      "auth:session:applied",
    ],
    commitIdentity
  );

  bindMany(
    [
      "login:success",
      "auth:login:success",
      "app:login:success",
    ],
    commitIdentityAndState
  );

  bindMany(
    [
      "app:session:cleared",
      "auth:session:cleared",
      "auth:logout",
      "auth:logout:success",
      "logout:success",
    ],
    commitSessionCleared
  );

  bindMany(
    [
      "app:sidebar:change",
      "sidebar:state:change",
    ],
    commitSidebarTransition("sidebar:state:change")
  );

  bindCoreEvent(
    AppCore,
    localScope,
    epoch,
    "router:before-render",
    () => {
      try {
        closeDropdown?.();
      } catch {}

      visualCommitter.hideIndicator("router:before-render");
    }
  );

  bindCoreEvent(
    AppCore,
    localScope,
    epoch,
    "router:rendered",
    commitRouterRendered
  );

  [
    "app:route:change",
    "router:route:change",
    "router:navigation:complete",
    "router:render:async-complete",
    "router:rendered:complete",
  ].forEach((eventName) => {
    bindCoreEvent(AppCore, localScope, epoch, eventName, commitRoute(eventName));
  });

  bindCoreEvent(
    AppCore,
    localScope,
    epoch,
    "app:ui:repair-request",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "ui-repair-request",
        reason: "app:ui:repair-request",
        payload: detail,
        renderIdentity: true,
        syncState: detail.syncState === true,
        closeDropdown: false,
        delayMs: 32,
        frames: 2,
        indicatorDelayMs: 56,
        force: true,
      });
    }
  );

  bindMany(
    [
      "app:ready",
      "app:boot:ready",
      "app:boot:complete",
      "router:bound",
    ],
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "app-ready",
        reason: safeText(
          detail.reason || detail.type || detail.event || "app-ready",
          "app-ready"
        ),
        payload: detail,
        renderIdentity: true,
        syncState: false,
        closeDropdown: false,
        delayMs: 64,
        frames: 2,
        indicatorDelayMs: 56,
        force: true,
      });
    }
  );

  bindMany(
    [
      "app:lang:change",
      "i18n:change",
      "theme:change",
      "app:theme:change",
    ],
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      /*
        FIX:
        Cambio de idioma/tema NO debe activar una ruta vieja que venga en payload.
        Forzamos ruta visible.
      */
      const payload = buildRoutePayload(visualCtx, detail, "visual-env-change", {
        preferExplicitRoute: false,
        force: true,
      });

      visualCommitter.schedule({
        key: "visual-env-change",
        reason: safeText(
          detail.reason || detail.type || detail.event || "visual-env-change",
          "visual-env-change"
        ),
        payload,
        renderIdentity: true,
        syncState: false,
        closeDropdown: false,
        delayMs: 48,
        frames: 2,
        indicatorDelayMs: 56,
        force: true,
      });
    }
  );

  safeEmit(AppCore, "sidebar:core-events:bound", {
    scope: scopeName,
    localScope,
    epoch,
  });

  safeLog(AppCore, "core events bound", {
    scope: scopeName,
    localScope,
    epoch,
  });

  return () => {
    visualCommitter.cancelAll();
    disposeLocalScope(localScope);
  };
}

/* ======================================================
   DEFAULT EXPORT
====================================================== */

export default {
  bindDomEvents,
  bindCoreEvents,

  handleDocumentClick,
  handleSidebarMenuClick,
  handleUserToggleKeydown,
  handleGlobalKeydown,
  handleResize,

  syncActiveMenuItem,
  syncActiveMenuIndicator,
  scheduleActiveMenuIndicator,
  hideActiveMenuIndicator,

  beginSidebarLayoutTransition,
  endSidebarLayoutTransition,
};

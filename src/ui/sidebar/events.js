/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   ONION SUPPORT · SIDEBAR EVENTS · 15/10
   VISUAL COMMIT · ROUTER SAFE · STALE ROUTE FIREBREAK

   Responsabilidades:
   - Bind de eventos DOM del sidebar.
   - Bind de eventos core/auth/router.
   - Sidebar manual: nunca abrir/cerrar por navegación.
   - Cerrar dropdown en navegación/render.
   - Recalcular usuario / roles tras login/logout/restore/session/user change.
   - Bloquear clicks sobre elementos hidden/inert/admin ocultos.
   - Cleanup local idempotente por scope.
   - Tolerar DOM re-renderizado.
   - Sincronizar item activo del menú delegando en state.js.
   - Corregir item activo localmente si state/router payload llega stale.
   - Sincronizar indicador visual tipo Apple delegando en state.js.
   - Evitar indicador colgado al colapsar/expandir.
   - Centralizar commit visual post-router/post-resize/post-auth.
   - Evitar doble suscripción AppCore.events + window.
   - Evitar doble cleanup AppCore.cleanup + cleanup local.

   REGLAS:
   - No usa AppCore.cleanup.on/event para eventos del sidebar.
   - Usa cleanup local propio por scope.
   - Usa AppCore.events como fuente principal para eventos core.
   - Usa window.addEventListener sólo como fallback si no existe AppCore.events.
   - safeEmit no emite por AppCore.events y window a la vez.
   - No escucha sidebar:refreshed/sidebar:repaired/sidebar:state:synced.
   - No escucha app:user-ui:sync para evitar bucles de sync visual.
   - No escucha router:shell:state para evitar loops con repairShell().
   - router:rendered no fuerza open/close del sidebar.
   - Active item se recalcula tras router:rendered/app:route:change.
   - Indicador se recalcula después del layout final.
   - Durante transición se oculta el indicador por state.js.
   - Handlers viejos quedan invalidados por epoch aunque el bus no permita off().

   CLICK SIDEBAR:
   - Clicks del menú navegan explícitamente con Router.navigate().
   - Listener document click en capture para ganar al Router global.
   - Soporta data-route / data-href / data-to / href.
   - Respeta Ctrl/Cmd/Shift/Alt click.
   - Respeta target="_blank", download, URLs externas y href inseguros.
   - Botones del dropdown con data-route también navegan.

   ACTIVE WRONG:
   - En commits de router, la URL visible tiene prioridad.
   - Payloads viejos de router/app state no pisan el activo.
   - /@usuario/facturas se normaliza a /facturas.
   - Alias ES/CA/EN sincronizados con template.js/state.js.
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

/* =========================================================
   VERSION
========================================================= */

export const SIDEBAR_EVENTS_VERSION =
  "sidebar-events-v15-visual-commit-router-safe";

/* =========================================================
   LOCAL CLEANUP / EPOCHS
========================================================= */

const localCleanups =
  new Map();

const scopeEpochs =
  new Map();

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE =
  "SidebarEvents";

const OWNER =
  "events.js";

const DEFAULT_SCOPE =
  "ui:sidebar";

const INDICATOR_DEFAULT_DELAY =
  40;

const ROUTER_SETTLED_DELAY =
  140;

const RESIZE_DEBOUNCE_MS =
  120;

const HANDLED_FLAG =
  "__onionSidebarHandled";

const LOCAL_HANDLED_FLAG =
  "__onionSidebarEventsHandled";

const ROUTE_CURRENT_VALUE =
  "page";

const DATA_TRUE =
  "true";

const ROUTE_ALIASES =
  Object.freeze({
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
    "/incidencia-client": "/incidencias",

    "/invoices": "/facturas",
    "/invoice": "/facturas",
    "/billing": "/facturas",
    "/factures": "/facturas",
    "/factura": "/facturas",
    "/facturacio": "/facturas",
    "/facturación": "/facturas",
    "/facturacion": "/facturas",

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
    "/configuration": "/ajustes",
    "/configuracion": "/ajustes",
    "/configuración": "/ajustes",
    "/configuracio": "/ajustes",
    "/configuració": "/ajustes",

    "/server": "/servidor",
    "/servidor": "/servidor",
  });

const SIDEBAR_NAV_SELECTOR =
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
  ].join(",");

const DROPDOWN_NAV_SELECTOR =
  [
    "a[data-spa]",
    "a[data-route]",
    "a[data-href]",
    "a[data-to]",
    "a[href]",
    "button[data-route]",
    "button[data-href]",
    "button[data-to]",
  ].join(",");

const INTERACTIVE_SELECTOR =
  [
    "a[data-spa]",
    "a[href]",
    "button",
    "[role='button']",
    "[data-route]",
    "[data-action]",
    "[data-sidebar-action]",
  ].join(",");

const HIDDEN_TARGET_SELECTOR =
  [
    "[hidden]",
    "[inert]",
    "[data-sidebar-visible='false']",
    "[data-role-visible='false']",
    "[data-admin-visible='false']",
  ].join(",");

const HIDDEN_VISIBLE_SELECTOR =
  [
    "[hidden]",
    "[inert]",
    "[aria-hidden='true']",
    "[data-role-visible='false']",
    "[data-admin-visible='false']",
    "[data-sidebar-visible='false']",
  ].join(",");

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasWindow() {
  return typeof window !== "undefined";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function isFn(value) {
  return typeof value === "function";
}

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

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowTs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function resolveScope(scope = DEFAULT_SCOPE) {
  return safeText(
    scope,
    DEFAULT_SCOPE
  );
}

function resolveLocalScope(scope = DEFAULT_SCOPE, type = "local") {
  return `${resolveScope(scope)}:${safeText(type, "local")}`;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      "[SidebarEvents]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[SidebarEvents]",
      ...args
    );
  } catch {}
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[SidebarEvents]",
      ...args
    );
  } catch {}
}

/*
  No emitimos por AppCore.events Y window a la vez.
  Bus primero. Window sólo fallback.
*/
function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const finalPayload =
    {
      source:
        SOURCE,

      owner:
        OWNER,

      version:
        SIDEBAR_EVENTS_VERSION,

      at:
        safeIsoDate(),

      ts:
        nowTs(),

      ...safeObject(payload),
    };

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        finalPayload
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló`,
      error
    );
  }

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              finalPayload,
          }
        )
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

  const delay =
    Math.max(
      0,
      Number(ms) || 0
    );

  const safeFn =
    () => {
      try {
        fn();
      } catch {}
    };

  try {
    if (hasWindow()) {
      return window.setTimeout(
        safeFn,
        delay
      );
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

  const safeFn =
    () => {
      try {
        fn();
      } catch {}
    };

  try {
    if (
      hasWindow() &&
      isFn(window.requestAnimationFrame)
    ) {
      return window.requestAnimationFrame(safeFn);
    }
  } catch {}

  return safeWindowTimeout(
    safeFn,
    0
  );
}

function afterFrames(fn, frames = 2) {
  if (!isFn(fn)) {
    return;
  }

  const total =
    Math.max(
      1,
      Number(frames) || 1
    );

  const step =
    (remaining) => {
      if (remaining <= 0) {
        try {
          fn();
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
      return Boolean(
        isRealShellHiddenBase(AppCore)
      );
    }
  } catch {}

  try {
    return Boolean(
      isShellHidden(AppCore)
    );
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
    return (
      typeof Node !== "undefined" &&
      value instanceof Node
    );
  } catch {
    return Boolean(
      value &&
      typeof value === "object"
    );
  }
}

function isElement(value = null) {
  if (!value) {
    return false;
  }

  try {
    return (
      typeof Element !== "undefined" &&
      value instanceof Element
    );
  } catch {
    return Boolean(
      value &&
      typeof value.closest === "function"
    );
  }
}

function getElementTarget(eventOrTarget = null) {
  const target =
    eventOrTarget?.target || eventOrTarget;

  if (isElement(target)) {
    return target;
  }

  try {
    if (
      target &&
      target.nodeType === 3 &&
      isElement(target.parentElement)
    ) {
      return target.parentElement;
    }
  } catch {}

  return null;
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

  const elementChild =
    isElement(child)
      ? child
      : getElementTarget(child);

  try {
    return (
      parent === elementChild ||
      parent.contains(elementChild || child)
    );
  } catch {
    return false;
  }
}

function getEventDetail(eventOrPayload = {}) {
  if (
    eventOrPayload?.detail &&
    typeof eventOrPayload.detail === "object"
  ) {
    return eventOrPayload.detail;
  }

  if (
    eventOrPayload?.payload &&
    typeof eventOrPayload.payload === "object"
  ) {
    return eventOrPayload.payload;
  }

  if (
    eventOrPayload &&
    typeof eventOrPayload === "object"
  ) {
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

/* =========================================================
   ROUTE / CURRENT PATH HELPERS
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

function isUnsafeRouteValue(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase();

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
  return /^[a-z][a-z0-9+.-]*:/i.test(
    safeText(value, "")
  );
}

function isExternalHref(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (!isProtocolHref(raw)) {
    return false;
  }

  try {
    const url =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      return url.origin !== getBaseOrigin();
    }

    return true;
  } catch {
    return true;
  }
}

function isHashOnlyHref(value = "") {
  const href =
    safeText(value, "");

  return Boolean(
    href.startsWith("#") &&
      !href.startsWith("#/") &&
      !href.startsWith("#!")
  );
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function stripPublicUsernamePrefix(pathname = "/") {
  const value =
    safeText(pathname, "/")
      .replace(/^\/@[^/]+(?=\/|$)/i, "");

  return value || "/";
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .trim();

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function applyRouteAlias(pathname = "/") {
  const clean =
    normalizePathnameOnly(pathname || "/");

  if (ROUTE_ALIASES[clean]) {
    return ROUTE_ALIASES[clean];
  }

  for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
    if (
      from !== "/" &&
      clean.startsWith(`${from}/`)
    ) {
      return `${to}${clean.slice(from.length)}`;
    }
  }

  return clean;
}

function normalizeRoutePath(path = "/") {
  let value =
    safeText(path, "/");

  if (!value) {
    return "/";
  }

  if (
    isUnsafeRouteValue(value) ||
    isExternalHref(value) ||
    isHashOnlyHref(value)
  ) {
    return "";
  }

  if (isHashRouterPath(value)) {
    value =
      normalizeHashRouterPath(value);
  }

  try {
    const parsed =
      new URL(
        value,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      value =
        normalizeHashRouterPath(parsed.hash);
    } else {
      value =
        `${parsed.pathname || "/"}${parsed.search || ""}`;
    }
  } catch {
    value =
      value.split("#")[0] || "/";
  }

  value =
    safeText(value, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const queryIndex =
    value.indexOf("?");

  const pathname =
    queryIndex >= 0
      ? value.slice(0, queryIndex)
      : value;

  const query =
    queryIndex >= 0
      ? value.slice(queryIndex + 1)
      : "";

  const cleanPathname =
    applyRouteAlias(
      stripPublicUsernamePrefix(
        normalizePathnameOnly(pathname || "/")
      )
    );

  return query
    ? `${cleanPathname}?${query}`
    : cleanPathname;
}

function stripQuery(path = "/") {
  return (
    normalizeRoutePath(path)
      .split("?")[0] ||
    "/"
  );
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeRoutePath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizeRoutePath(
      `${pathname}${search}`
    );
  } catch {
    return "/";
  }
}

function getRouterPath(Router = null) {
  const router =
    Router || null;

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
  const detail =
    safeObject(payload);

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
    .map((value) =>
      normalizeRoutePath(value || "")
    )
    .filter(Boolean);
}

function pushUniqueRoute(list, value) {
  const route =
    normalizeRoutePath(value || "");

  if (
    route &&
    !list.includes(route)
  ) {
    list.push(route);
  }

  return list;
}

function reasonPrefersExplicitRoute(reason = "") {
  const key =
    safeText(reason, "")
      .toLowerCase();

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
  const opts =
    safeObject(options);

  const detail =
    safeObject(payload);

  const explicit =
    collectExplicitRouteCandidates(detail);

  const browser =
    getBrowserPath();

  const router =
    getRouterPath(
      Router ||
        AppCore?.Router ||
        AppCore?.router
    );

  const appState =
    getAppStatePath(AppCore);

  const preferExplicit =
    opts.preferExplicitRoute === true ||
    opts.forceRoute === true ||
    detail.preferExplicitRoute === true ||
    detail.forceRoute === true ||
    reasonPrefersExplicitRoute(
      first(
        opts.reason,
        detail.reason,
        detail.type,
        detail.event,
        ""
      )
    );

  const candidates =
    [];

  const hasNonRootExplicit =
    explicit.some((value) =>
      value &&
      stripQuery(value) !== "/"
    );

  const shouldPrioritizeExplicit =
    preferExplicit &&
    (
      hasNonRootExplicit ||
      opts.forceRoute === true ||
      detail.forceRoute === true
    );

  if (shouldPrioritizeExplicit) {
    explicit.forEach((value) =>
      pushUniqueRoute(candidates, value)
    );

    pushUniqueRoute(
      candidates,
      router
    );

    pushUniqueRoute(
      candidates,
      appState
    );

    pushUniqueRoute(
      candidates,
      browser
    );
  } else {
    /*
      En commits de router/render/theme/lang, la URL visible gana.
      Evita que un payload atrasado marque otra vista.
    */
    pushUniqueRoute(
      candidates,
      browser
    );

    pushUniqueRoute(
      candidates,
      router
    );

    pushUniqueRoute(
      candidates,
      appState
    );

    explicit.forEach((value) =>
      pushUniqueRoute(candidates, value)
    );
  }

  return candidates[0] || "/";
}

function buildRoutePayload(ctx = {}, payload = {}, reason = "", options = {}) {
  const AppCore =
    ctx.AppCore;

  const Router =
    ctx.Router ||
    AppCore?.Router ||
    AppCore?.router;

  const route =
    resolveFreshRoute(
      payload,
      AppCore,
      Router,
      {
        ...safeObject(options),
        reason,
      }
    );

  return {
    ...safeObject(payload),

    reason,

    route,
    publicPath:
      route,
    path:
      route,
    canonicalPath:
      stripQuery(route),
    currentPublicPath:
      route,

    browserPublicPath:
      getBrowserPath(),

    routerPublicPath:
      getRouterPath(Router),

    appPublicPath:
      getAppStatePath(AppCore),
  };
}

/* =========================================================
   NAVIGATION HELPERS
========================================================= */

function isPrimaryClick(event) {
  if (!event) {
    return true;
  }

  if (
    "button" in event &&
    event.button !== 0
  ) {
    return false;
  }

  return true;
}

function isModifiedClick(event) {
  return Boolean(
    event?.metaKey ||
      event?.ctrlKey ||
      event?.shiftKey ||
      event?.altKey
  );
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

  if (
    !isPrimaryClick(event) ||
    isModifiedClick(event)
  ) {
    return true;
  }

  if (
    isDisabledInteractive(element) ||
    element.hasAttribute?.("download")
  ) {
    return true;
  }

  const target =
    safeText(
      element.getAttribute?.("target"),
      ""
    ).toLowerCase();

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
  let raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (
    isUnsafeRouteValue(raw) ||
    isExternalHref(raw) ||
    isHashOnlyHref(raw)
  ) {
    return "";
  }

  try {
    if (isFn(Router?.resolveSpaHref)) {
      raw =
        safeText(
          Router.resolveSpaHref(raw),
          raw
        );
    }
  } catch {}

  if (
    !raw ||
    isUnsafeRouteValue(raw) ||
    isExternalHref(raw) ||
    isHashOnlyHref(raw)
  ) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (url.origin !== getBaseOrigin()) {
        return "";
      }

      raw =
        `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "";
  }

  try {
    if (isFn(AppCore?.utils?.normalizePath)) {
      const normalized =
        AppCore.utils.normalizePath(raw || "/");

      return normalizeRoutePath(normalized);
    }
  } catch {}

  return normalizeRoutePath(
    raw.startsWith("/") ||
    raw.startsWith("#")
      ? raw
      : `/${raw}`
  );
}

async function navigateFromSidebar({
  AppCore,
  Router,
  target = "",
  source = "sidebar",
} = {}) {
  const finalRouter =
    Router ||
    AppCore?.Router ||
    AppCore?.router;

  const cleanTarget =
    normalizeSidebarTarget(
      AppCore,
      finalRouter,
      target
    );

  if (!cleanTarget) {
    return false;
  }

  try {
    if (isFn(finalRouter?.navigate)) {
      await Promise.resolve(
        finalRouter.navigate(
          cleanTarget,
          {
            source,
            force:
              false,
          }
        )
      );

      return true;
    }

    if (isFn(finalRouter?.go)) {
      await Promise.resolve(
        finalRouter.go(
          cleanTarget,
          {
            source,
            force:
              false,
          }
        )
      );

      return true;
    }

    if (isFn(finalRouter?.push)) {
      await Promise.resolve(
        finalRouter.push(
          cleanTarget,
          {
            source,
            force:
              false,
          }
        )
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Navegación Router falló desde sidebar.",
      {
        target:
          cleanTarget,

        source,
        error,
      }
    );
  }

  try {
    if (isBrowser()) {
      window.history.pushState(
        {},
        "",
        cleanTarget
      );

      try {
        window.dispatchEvent(
          new PopStateEvent("popstate")
        );
      } catch {
        window.dispatchEvent(
          new Event("popstate")
        );
      }

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.location.href =
        cleanTarget;

      return true;
    }
  } catch {}

  return false;
}

function getSidebarNavigationElement(target = null) {
  const element =
    getElementTarget(target);

  if (!element) {
    return null;
  }

  return element.closest?.(SIDEBAR_NAV_SELECTOR) || null;
}

function getDropdownNavigationElement(target = null) {
  const element =
    getElementTarget(target);

  if (!element) {
    return null;
  }

  return element.closest?.(DROPDOWN_NAV_SELECTOR) || null;
}

/* =========================================================
   LOCAL ACTIVE MATCHER · STALE ROUTE OVERRIDE
========================================================= */

function getMenuItems(sidebarMenu = null) {
  if (!sidebarMenu) {
    return [];
  }

  try {
    return Array.from(
      sidebarMenu.querySelectorAll(SIDEBAR_NAV_SELECTOR)
    ).filter((item, index, array) =>
      item &&
      array.indexOf(item) === index
    );
  } catch {
    return [];
  }
}

function getMenuItemRoute(item = null) {
  return normalizeRoutePath(
    getRouteFromElement(item)
  );
}

function isVisibleMenuItem(item = null) {
  if (
    !item ||
    !isConnectedElement(item)
  ) {
    return false;
  }

  try {
    if (item.hidden) {
      return false;
    }

    if (item.closest?.(HIDDEN_VISIBLE_SELECTOR)) {
      return false;
    }

    const style =
      window.getComputedStyle(item);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      safeNumber(style.opacity, 1) === 0
    ) {
      return false;
    }

    const rect =
      item.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0
    );
  } catch {
    return true;
  }
}

function clearActiveItemClasses(sidebarMenu = null) {
  const items =
    getMenuItems(sidebarMenu);

  for (const item of items) {
    try {
      item.classList?.remove?.(
        "active",
        "is-active",
        "router-active"
      );

      item.removeAttribute?.(
        "aria-current"
      );

      if (item.dataset) {
        delete item.dataset.active;
        delete item.dataset.matchedRoute;
        delete item.dataset.matchedCurrent;
        delete item.dataset.matchCandidateIndex;
      }
    } catch {}
  }

  return true;
}

function setActiveItemClasses(item = null, matchedRoute = "", currentRoute = "") {
  if (!item) {
    return false;
  }

  try {
    item.classList?.add?.(
      "active",
      "is-active",
      "router-active"
    );

    item.setAttribute?.(
      "aria-current",
      ROUTE_CURRENT_VALUE
    );

    if (item.dataset) {
      item.dataset.active =
        DATA_TRUE;

      item.dataset.matchedRoute =
        safeText(matchedRoute, "");

      item.dataset.matchedCurrent =
        safeText(
          currentRoute || matchedRoute,
          ""
        );
    }

    return true;
  } catch {
    return false;
  }
}

function scoreRouteMatch(routePath = "/", currentPath = "/") {
  const route =
    normalizeRoutePath(routePath);

  const current =
    normalizeRoutePath(currentPath);

  const routeClean =
    stripQuery(route);

  const currentClean =
    stripQuery(current);

  if (!route || !current) {
    return -1;
  }

  if (route === current) {
    return 10000 + route.length;
  }

  if (routeClean === currentClean) {
    return 9000 + routeClean.length;
  }

  if (
    routeClean !== "/" &&
    currentClean.startsWith(`${routeClean}/`)
  ) {
    return 5000 + routeClean.length;
  }

  if (
    routeClean === "/" &&
    currentClean === "/"
  ) {
    return 1000;
  }

  return -1;
}

function findBestMenuItemForRoute(sidebarMenu = null, route = "/") {
  const targetRoute =
    normalizeRoutePath(route || "/");

  const items =
    getMenuItems(sidebarMenu);

  let best =
    null;

  let bestScore =
    -1;

  let bestRoute =
    "";

  for (const item of items) {
    if (!isVisibleMenuItem(item)) {
      continue;
    }

    const itemRoute =
      getMenuItemRoute(item);

    if (!itemRoute) {
      continue;
    }

    const score =
      scoreRouteMatch(
        itemRoute,
        targetRoute
      );

    if (score > bestScore) {
      best =
        item;

      bestScore =
        score;

      bestRoute =
        itemRoute;
    }
  }

  if (bestScore < 0) {
    return null;
  }

  try {
    best.dataset.matchedRoute =
      bestRoute;

    best.dataset.matchedCurrent =
      targetRoute;
  } catch {}

  return best;
}

function setOptimisticSidebarActiveItem(sidebarMenu = null, item = null, currentRoute = "") {
  if (
    !sidebarMenu ||
    !item
  ) {
    return false;
  }

  clearActiveItemClasses(sidebarMenu);

  return setActiveItemClasses(
    item,
    getMenuItemRoute(item),
    currentRoute
  );
}

function syncLocalActiveMenuItem(ctx = {}, route = "/", options = {}) {
  const AppCore =
    ctx.AppCore;

  const {
    sidebarMenu,
  } =
    resolveElements(
      AppCore,
      ctx.getElements
    );

  if (!sidebarMenu) {
    return null;
  }

  const currentRoute =
    normalizeRoutePath(route || "/");

  const activeItem =
    findBestMenuItemForRoute(
      sidebarMenu,
      currentRoute
    );

  if (!activeItem) {
    return null;
  }

  if (options.mutate !== false) {
    clearActiveItemClasses(sidebarMenu);

    setActiveItemClasses(
      activeItem,
      getMenuItemRoute(activeItem),
      currentRoute
    );
  }

  return activeItem;
}

/* =========================================================
   EVENT DEDUPE
========================================================= */

function markSidebarEventHandled(event, reason = "") {
  if (!event) {
    return false;
  }

  try {
    event[HANDLED_FLAG] =
      true;

    event[LOCAL_HANDLED_FLAG] =
      true;

    event.__onionSidebarReason =
      safeText(reason, "");
  } catch {}

  return true;
}

function wasSidebarEventHandled(event) {
  return Boolean(
    event?.[HANDLED_FLAG] ||
      event?.[LOCAL_HANDLED_FLAG]
  );
}

/* =========================================================
   SCOPE EPOCH / CLEANUP
========================================================= */

function getScopeEpoch(scope) {
  const scopeName =
    resolveScope(scope);

  return Number(
    scopeEpochs.get(scopeName) || 0
  );
}

function bumpScopeEpoch(scope) {
  const scopeName =
    resolveScope(scope);

  const next =
    getScopeEpoch(scopeName) + 1;

  scopeEpochs.set(
    scopeName,
    next
  );

  return next;
}

function isCurrentScopeEpoch(scope, epoch) {
  return getScopeEpoch(scope) === epoch;
}

function pushLocalCleanup(scope, cleanup) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName =
    resolveScope(scope);

  const cleanups =
    localCleanups.get(scopeName) || [];

  cleanups.push(cleanup);

  localCleanups.set(
    scopeName,
    cleanups
  );
}

function runLocalCleanups(scope) {
  const scopeName =
    resolveScope(scope);

  const cleanups =
    localCleanups.get(scopeName) || [];

  for (const cleanup of cleanups) {
    try {
      cleanup?.();
    } catch {}
  }

  localCleanups.delete(scopeName);

  return true;
}

function resetLocalScope(scope) {
  const scopeName =
    resolveScope(scope);

  const epoch =
    bumpScopeEpoch(scopeName);

  runLocalCleanups(scopeName);

  return epoch;
}

function disposeLocalScope(scope) {
  const scopeName =
    resolveScope(scope);

  bumpScopeEpoch(scopeName);

  runLocalCleanups(scopeName);

  return true;
}

function makeSafeHandler(AppCore, scope, epoch, label = "handler", handler) {
  if (!isFn(handler)) {
    return () => {};
  }

  const scopeName =
    resolveScope(scope);

  return function safeBoundHandler(...args) {
    if (!isCurrentScopeEpoch(scopeName, epoch)) {
      return undefined;
    }

    try {
      const result =
        handler(...args);

      if (
        result &&
        typeof result === "object" &&
        isFn(result.catch)
      ) {
        result.catch((error) => {
          safeWarn(
            AppCore,
            `${label} falló async`,
            error
          );
        });
      }

      return result;
    } catch (error) {
      safeWarn(
        AppCore,
        `${label} falló`,
        error
      );

      return undefined;
    }
  };
}

/* =========================================================
   DOM BIND LOW LEVEL
========================================================= */

function bindDom(AppCore, scope, epoch, target, eventName, handler, options = undefined) {
  const scopeName =
    resolveScope(scope);

  if (
    !target ||
    !eventName ||
    !isFn(handler) ||
    !isFn(target.addEventListener)
  ) {
    return () => {};
  }

  const safeHandler =
    makeSafeHandler(
      AppCore,
      scopeName,
      epoch,
      `DOM "${eventName}"`,
      handler
    );

  const cleanup =
    () => {
      try {
        target.removeEventListener(
          eventName,
          safeHandler,
          options
        );
      } catch {}
    };

  try {
    target.addEventListener(
      eventName,
      safeHandler,
      options
    );

    pushLocalCleanup(
      scopeName,
      cleanup
    );

    return cleanup;
  } catch (error) {
    safeWarn(
      AppCore,
      `addEventListener falló para DOM "${eventName}"`,
      error
    );

    return () => {};
  }
}

/* =========================================================
   CORE EVENT BIND LOW LEVEL
========================================================= */

function bindCoreEvent(AppCore, scope, epoch, eventName, handler) {
  const scopeName =
    resolveScope(scope);

  const cleanEventName =
    safeText(eventName, "");

  if (
    !cleanEventName ||
    !isFn(handler)
  ) {
    return () => {};
  }

  const safeHandler =
    makeSafeHandler(
      AppCore,
      scopeName,
      epoch,
      `Core event "${cleanEventName}"`,
      handler
    );

  let busOff =
    null;

  let boundToBus =
    false;

  try {
    if (isFn(AppCore?.events?.on)) {
      const maybeOff =
        AppCore.events.on(
          cleanEventName,
          safeHandler
        );

      if (isFn(maybeOff)) {
        busOff =
          maybeOff;
      } else {
        busOff =
          () => {
            try {
              AppCore?.events?.off?.(
                cleanEventName,
                safeHandler
              );
            } catch {}
          };
      }

      boundToBus =
        true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.on falló para "${cleanEventName}"`,
      error
    );
  }

  if (boundToBus) {
    const cleanup =
      () => {
        try {
          busOff?.();
        } catch {}
      };

    pushLocalCleanup(
      scopeName,
      cleanup
    );

    return cleanup;
  }

  const windowHandler =
    (event) => {
      safeHandler(event);
    };

  let windowBound =
    false;

  try {
    if (hasWindow()) {
      window.addEventListener(
        cleanEventName,
        windowHandler
      );

      windowBound =
        true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `window.addEventListener falló para "${cleanEventName}"`,
      error
    );
  }

  const cleanup =
    () => {
      if (windowBound) {
        try {
          window.removeEventListener(
            cleanEventName,
            windowHandler
          );
        } catch {}
      }
    };

  if (windowBound) {
    pushLocalCleanup(
      scopeName,
      cleanup
    );
  }

  return cleanup;
}

/* =========================================================
   ACTIVE MENU / INDICATOR BRIDGE TO state.js
========================================================= */

function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore =
    ctx.AppCore;

  const Router =
    ctx.Router ||
    AppCore?.Router ||
    AppCore?.router;

  const reason =
    safeText(
      payload?.reason ||
        payload?.type ||
        payload?.event ||
        "sidebar-events:active-sync",
      "sidebar-events:active-sync"
    );

  const routePayload =
    buildRoutePayload(
      {
        ...ctx,
        AppCore,
        Router,
      },
      payload,
      reason,
      payload
    );

  let baseItem =
    null;

  try {
    baseItem =
      syncActiveMenuItemBase(
        AppCore,
        {
          ...routePayload,
          mutate:
            true,
        }
      );
  } catch (error) {
    safeWarn(
      AppCore,
      "syncActiveMenuItemBase falló",
      error
    );
  }

  /*
    Firebreak local:
    si AppCore/router venía stale, forzamos el item de la ruta fresca.
  */
  const fixedItem =
    syncLocalActiveMenuItem(
      {
        ...ctx,
        AppCore,
        Router,
      },
      routePayload.route,
      {
        mutate:
          true,
      }
    );

  if (
    fixedItem &&
    fixedItem !== baseItem
  ) {
    safeEmit(
      AppCore,
      "sidebar:active:item:overridden",
      {
        reason,
        route:
          routePayload.route,

        previousRoute:
          getMenuItemRoute(baseItem),

        fixedRoute:
          getMenuItemRoute(fixedItem),
      }
    );
  }

  return fixedItem || baseItem || null;
}

function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore =
    ctx.AppCore;

  const Router =
    ctx.Router ||
    AppCore?.Router ||
    AppCore?.router;

  const reason =
    safeText(
      options.reason,
      "sidebar-events:indicator-sync"
    );

  const routePayload =
    buildRoutePayload(
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
        mutate:
          true,
      }
    );

  try {
    return syncActiveMenuIndicatorBase(
      AppCore,
      {
        ...routePayload,
        activeItem,
        reveal:
          options.reveal !== false,
        force:
          options.force === true,
      }
    );
  } catch (error) {
    safeWarn(
      AppCore,
      "syncActiveMenuIndicatorBase falló",
      error
    );

    return false;
  }
}

function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore =
    ctx.AppCore;

  const Router =
    ctx.Router ||
    AppCore?.Router ||
    AppCore?.router;

  const reason =
    safeText(
      options.reason,
      "sidebar-events:indicator-scheduled"
    );

  const routePayload =
    buildRoutePayload(
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
        mutate:
          true,
      }
    );

  try {
    return scheduleActiveMenuIndicatorBase(
      AppCore,
      {
        ...routePayload,

        activeItem,

        delayMs:
          Number.isFinite(Number(options.delayMs))
            ? Number(options.delayMs)
            : INDICATOR_DEFAULT_DELAY,

        reveal:
          options.reveal !== false,

        force:
          options.force === true,
      }
    );
  } catch (error) {
    safeWarn(
      AppCore,
      "scheduleActiveMenuIndicatorBase falló",
      error
    );

    return false;
  }
}

function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  const AppCore =
    ctx.AppCore;

  try {
    return syncActiveMenuIndicatorBase(
      AppCore,
      {
        reason:
          safeText(reason, "hide"),

        reveal:
          false,

        force:
          true,
      }
    );
  } catch {
    const {
      sidebarMenu,
    } =
      resolveElements(
        AppCore,
        ctx.getElements
      );

    if (!sidebarMenu) {
      return false;
    }

    try {
      sidebarMenu.dataset.indicatorReady =
        "false";

      sidebarMenu.dataset.indicatorReason =
        safeText(reason, "hide");

      sidebarMenu.style.setProperty(
        "--sidebar-indicator-opacity",
        "0"
      );
    } catch {}

    return true;
  }
}

/*
  Exportadas por compatibilidad, pero events.js NO debe competir
  con state.js en la transición real del sidebar.
*/
function beginSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const AppCore =
    ctx.AppCore;

  hideActiveMenuIndicator(
    ctx,
    `${reason}:begin`
  );

  safeEmit(
    AppCore,
    "sidebar:events:transition:begin",
    {
      reason,
    }
  );

  return true;
}

function endSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const AppCore =
    ctx.AppCore;

  const activeItem =
    syncActiveMenuItem(
      ctx,
      {
        reason:
          `${reason}:end`,
      }
    );

  scheduleActiveMenuIndicator(
    ctx,
    {
      reason:
        `${reason}:end`,

      activeItem,

      delayMs:
        24,

      reveal:
        true,

      force:
        true,
    }
  );

  safeEmit(
    AppCore,
    "sidebar:events:transition:end",
    {
      reason,
    }
  );

  return true;
}

/* =========================================================
   VISUAL COMMIT PIPELINE
========================================================= */

function createSidebarVisualCommitter(ctx = {}) {
  const AppCore =
    ctx.AppCore;

  const timers =
    new Map();

  let committing =
    false;

  let lastReason =
    "";

  const clearTimer =
    (key = "default") => {
      const timer =
        timers.get(key);

      if (timer) {
        clearWindowTimeout(timer);
        timers.delete(key);
      }
    };

  const commitNow =
    (options = {}) => {
      if (committing) {
        return false;
      }

      committing =
        true;

      const reason =
        safeText(
          options.reason,
          "visual-commit"
        );

      lastReason =
        reason;

      try {
        if (options.closeDropdown === true) {
          try {
            ctx.closeDropdown?.();
          } catch (error) {
            safeWarn(
              AppCore,
              `closeDropdown falló en ${reason}`,
              error
            );
          }
        }

        if (options.renderIdentity === true) {
          try {
            ctx.renderUser?.();
          } catch (error) {
            safeWarn(
              AppCore,
              `renderUser falló en ${reason}`,
              error
            );
          }

          try {
            ctx.applyRoleVisibility?.();
          } catch (error) {
            safeWarn(
              AppCore,
              `applyRoleVisibility falló en ${reason}`,
              error
            );
          }
        }

        if (
          options.syncState === true &&
          !safeIsShellHidden(AppCore)
        ) {
          try {
            ctx.syncSidebarState?.();
          } catch (error) {
            safeWarn(
              AppCore,
              `syncSidebarState falló en ${reason}`,
              error
            );
          }
        }

        if (options.sanitize !== false) {
          try {
            sanitizeFooterTooltipState(AppCore);
          } catch (error) {
            safeWarn(
              AppCore,
              `sanitizeFooterTooltipState falló en ${reason}`,
              error
            );
          }
        }

        const payload =
          buildRoutePayload(
            ctx,
            safeObject(options.payload),
            reason,
            options
          );

        const activeItem =
          syncActiveMenuItem(
            ctx,
            payload
          );

        if (options.indicator !== false) {
          scheduleActiveMenuIndicator(
            ctx,
            {
              ...payload,

              reason,

              activeItem,

              delayMs:
                options.indicatorDelayMs ?? INDICATOR_DEFAULT_DELAY,

              reveal:
                options.reveal !== false,

              force:
                options.force === true,
            }
          );
        }

        safeEmit(
          AppCore,
          "sidebar:visual:committed",
          {
            reason,
            lastReason,
            route:
              payload.route,

            browserPublicPath:
              payload.browserPublicPath,

            routerPublicPath:
              payload.routerPublicPath,

            appPublicPath:
              payload.appPublicPath,
          }
        );

        return true;
      } finally {
        committing =
          false;
      }
    };

  const schedule =
    (options = {}) => {
      const key =
        safeText(
          options.key,
          "default"
        );

      clearTimer(key);

      const delayMs =
        Number.isFinite(Number(options.delayMs))
          ? Number(options.delayMs)
          : 0;

      const timer =
        safeWindowTimeout(() => {
          timers.delete(key);

          afterFrames(() => {
            commitNow(options);
          }, options.frames || 1);
        }, delayMs);

      if (timer) {
        timers.set(
          key,
          timer
        );
      }

      return true;
    };

  const cancelAll =
    () => {
      timers.forEach((timer) => {
        clearWindowTimeout(timer);
      });

      timers.clear();

      return true;
    };

  return {
    commitNow,
    schedule,
    cancelAll,

    hideIndicator:
      (reason = "hide") =>
        hideActiveMenuIndicator(ctx, reason),

    beginTransition:
      (reason = "transition") =>
        beginSidebarLayoutTransition(ctx, reason),

    endTransition:
      (reason = "transition") =>
        endSidebarLayoutTransition(ctx, reason),

    getLastReason:
      () => lastReason,
  };
}

/* =========================================================
   HIDDEN / INERT CLICK GUARD
========================================================= */

function isInsideSidebarArea(elements = {}, target = null) {
  const {
    sidebar,
    sidebarMenu,
    userToggle,
    userDropdown,
    toggleBtn,
    mobileToggleBtn,
    logoutBtn,
  } =
    safeObject(elements);

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
  const element =
    getElementTarget(target);

  if (!element) {
    return false;
  }

  const hardHidden =
    element.closest(HIDDEN_TARGET_SELECTOR);

  if (hardHidden) {
    return true;
  }

  const ariaHidden =
    element.closest("[aria-hidden='true']");

  if (!ariaHidden) {
    return false;
  }

  const interactiveParent =
    element.closest(INTERACTIVE_SELECTOR);

  if (
    interactiveParent &&
    interactiveParent.contains(ariaHidden)
  ) {
    return ariaHidden === interactiveParent;
  }

  return true;
}

function preventHiddenTargetClick(event) {
  const target =
    getElementTarget(event);

  if (!target) {
    return false;
  }

  if (!shouldIgnoreHiddenTarget(target)) {
    return false;
  }

  preventDefaultAndStop(event);

  markSidebarEventHandled(
    event,
    "hidden-target"
  );

  return true;
}

/* =========================================================
   DOM HANDLERS
========================================================= */

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

  const elements =
    resolveElements(
      AppCore,
      resolver
    );

  const {
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
    sidebarMenu,
  } =
    elements;

  const target =
    getElementTarget(event);

  if (
    !target &&
    !isNode(event?.target)
  ) {
    return;
  }

  const insideSidebar =
    isInsideSidebarArea(
      elements,
      target || event?.target
    );

  if (
    insideSidebar &&
    preventHiddenTargetClick(event)
  ) {
    return;
  }

  if (
    toggleBtn &&
    containsElement(toggleBtn, target)
  ) {
    markSidebarEventHandled(
      event,
      "document-toggle-sidebar"
    );

    preventDefaultAndStop(event);

    toggleSidebar?.();

    return;
  }

  if (
    mobileToggleBtn &&
    containsElement(mobileToggleBtn, target)
  ) {
    markSidebarEventHandled(
      event,
      "document-mobile-toggle-sidebar"
    );

    preventDefaultAndStop(event);

    toggleSidebar?.();

    return;
  }

  if (
    userToggle &&
    containsElement(userToggle, target)
  ) {
    markSidebarEventHandled(
      event,
      "document-toggle-dropdown"
    );

    preventDefaultAndStop(event);

    toggleDropdown?.();

    return;
  }

  if (
    logoutBtn &&
    containsElement(logoutBtn, target)
  ) {
    markSidebarEventHandled(
      event,
      "document-logout"
    );

    preventDefaultAndStop(event);

    void handleLogout?.();

    return;
  }

  const sidebarNav =
    getSidebarNavigationElement(target);

  if (
    sidebarNav &&
    sidebarMenu?.contains?.(sidebarNav)
  ) {
    if (
      shouldLetBrowserHandleNavigation(
        sidebarNav,
        event
      )
    ) {
      return;
    }

    const finalRouter =
      Router ||
      AppCore?.Router ||
      AppCore?.router;

    const targetPath =
      normalizeSidebarTarget(
        AppCore,
        finalRouter,
        getRouteFromElement(sidebarNav)
      );

    if (!targetPath) {
      return;
    }

    markSidebarEventHandled(
      event,
      "document-sidebar-menu:navigate"
    );

    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(
      AppCore,
      "sidebar:navigation:request",
      {
        target:
          targetPath,

        route:
          targetPath,

        publicPath:
          targetPath,

        path:
          targetPath,

        preferExplicitRoute:
          true,

        source:
          "sidebar-menu",
      }
    );

    setOptimisticSidebarActiveItem(
      sidebarMenu,
      sidebarNav,
      targetPath
    );

    const ctx =
      {
        AppCore,
        Router:
          finalRouter,
        getElements:
          resolver,
      };

    const activeItem =
      syncLocalActiveMenuItem(
        ctx,
        targetPath,
        {
          mutate:
            true,
        }
      );

    scheduleActiveMenuIndicator(
      ctx,
      {
        reason:
          "sidebar-menu:navigate",

        route:
          targetPath,

        publicPath:
          targetPath,

        path:
          targetPath,

        preferExplicitRoute:
          true,

        activeItem,

        delayMs:
          24,

        reveal:
          true,

        force:
          true,
      }
    );

    void navigateFromSidebar(
      {
        AppCore,
        Router:
          finalRouter,

        target:
          targetPath,

        source:
          "sidebar-menu",
      }
    );

    return;
  }

  if (
    userDropdown &&
    containsElement(userDropdown, target)
  ) {
    const routeButton =
      getDropdownNavigationElement(target);

    if (!routeButton) {
      return;
    }

    if (
      shouldLetBrowserHandleNavigation(
        routeButton,
        event
      )
    ) {
      return;
    }

    const finalRouter =
      Router ||
      AppCore?.Router ||
      AppCore?.router;

    const targetPath =
      normalizeSidebarTarget(
        AppCore,
        finalRouter,
        getRouteFromElement(routeButton)
      );

    if (!targetPath) {
      return;
    }

    markSidebarEventHandled(
      event,
      "sidebar-dropdown:navigate"
    );

    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(
      AppCore,
      "sidebar:dropdown:navigation:request",
      {
        target:
          targetPath,

        route:
          targetPath,

        publicPath:
          targetPath,

        path:
          targetPath,

        preferExplicitRoute:
          true,

        source:
          "sidebar-dropdown",
      }
    );

    void navigateFromSidebar(
      {
        AppCore,
        Router:
          finalRouter,

        target:
          targetPath,

        source:
          "sidebar-dropdown",
      }
    );

    return;
  }

  if (
    !containsElement(userDropdown, target) &&
    !containsElement(userToggle, target)
  ) {
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

  if (
    !isPrimaryClick(event) ||
    isModifiedClick(event)
  ) {
    return;
  }

  const {
    sidebarMenu,
  } =
    resolveElements(
      AppCore,
      resolver
    );

  if (!sidebarMenu) {
    return;
  }

  const target =
    getElementTarget(event);

  if (!target) {
    return;
  }

  if (preventHiddenTargetClick(event)) {
    return;
  }

  const link =
    getSidebarNavigationElement(target);

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  if (
    shouldLetBrowserHandleNavigation(
      link,
      event
    )
  ) {
    return;
  }

  const finalRouter =
    Router ||
    AppCore?.Router ||
    AppCore?.router;

  const targetPath =
    normalizeSidebarTarget(
      AppCore,
      finalRouter,
      getRouteFromElement(link)
    );

  if (!targetPath) {
    return;
  }

  markSidebarEventHandled(
    event,
    "sidebar-menu:navigate"
  );

  preventDefaultAndStop(event);

  try {
    closeDropdown?.();
  } catch {}

  safeEmit(
    AppCore,
    "sidebar:navigation:request",
    {
      target:
        targetPath,

      route:
        targetPath,

      publicPath:
        targetPath,

      path:
        targetPath,

      preferExplicitRoute:
        true,

      source:
        "sidebar-menu",
    }
  );

  setOptimisticSidebarActiveItem(
    sidebarMenu,
    link,
    targetPath
  );

  const ctx =
    {
      AppCore,
      Router:
        finalRouter,
      getElements:
        resolver,
    };

  const activeItem =
    syncLocalActiveMenuItem(
      ctx,
      targetPath,
      {
        mutate:
          true,
      }
    );

  scheduleActiveMenuIndicator(
    ctx,
    {
      reason:
        "sidebar-menu:navigate",

      route:
        targetPath,

      publicPath:
        targetPath,

      path:
        targetPath,

      preferExplicitRoute:
        true,

      activeItem,

      delayMs:
        24,

      reveal:
        true,

      force:
        true,
    }
  );

  void navigateFromSidebar(
    {
      AppCore,
      Router:
        finalRouter,

      target:
        targetPath,

      source:
        "sidebar-menu",
    }
  );
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

  const {
    userToggle,
  } =
    resolveElements(
      AppCore,
      resolver
    );

  if (!userToggle) {
    return;
  }

  const target =
    getElementTarget(event);

  if (
    !target ||
    !containsElement(userToggle, target)
  ) {
    return;
  }

  if (
    event.key === "Enter" ||
    event.key === " "
  ) {
    markSidebarEventHandled(
      event,
      "user-toggle-keyboard-toggle"
    );

    preventDefaultAndStop(event);

    toggleDropdown?.();

    return;
  }

  if (event.key === "Escape") {
    markSidebarEventHandled(
      event,
      "user-toggle-keyboard-close"
    );

    preventDefaultAndStop(event);

    closeDropdown?.();

    return;
  }

  if (event.key === "ArrowDown") {
    markSidebarEventHandled(
      event,
      "user-toggle-keyboard-open"
    );

    preventDefaultAndStop(event);

    openDropdown?.(
      {
        focusFirst:
          true,
      }
    );
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

  const ctx =
    {
      AppCore,
      Router:
        Router ||
        AppCore?.Router ||
        AppCore?.router,

      getElements:
        resolver,
    };

  const payload =
    buildRoutePayload(
      ctx,
      {},
      "resize",
      {
        force:
          true,
      }
    );

  const activeItem =
    syncActiveMenuItem(
      ctx,
      payload
    );

  scheduleActiveMenuIndicator(
    ctx,
    {
      ...payload,

      reason:
        "resize",

      activeItem,

      delayMs:
        96,

      reveal:
        true,

      force:
        true,
    }
  );
}

/* =========================================================
   DOM BINDS
========================================================= */

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
  } =
    ctx;

  if (!isBrowser()) {
    return () => {};
  }

  const scopeName =
    resolveScope(scope);

  const localScope =
    resolveLocalScope(
      scopeName,
      "dom"
    );

  const epoch =
    resetLocalScope(localScope);

  bindDom(
    AppCore,
    localScope,
    epoch,
    document,
    "click",
    (event) =>
      handleDocumentClick(
        {
          AppCore,
          Router,
          event,
          toggleSidebar,
          toggleDropdown,
          closeDropdown,
          handleLogout,
          getElements:
            resolver,
        }
      ),
    true
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
    document,
    "keydown",
    (event) => {
      handleUserToggleKeydown(
        {
          AppCore,
          event,
          toggleDropdown,
          closeDropdown,
          openDropdown,
          getElements:
            resolver,
        }
      );

      handleGlobalKeydown(
        {
          event,
          closeDropdown,
        }
      );
    }
  );

  const resizeHandler =
    isFn(AppCore?.utils?.debounce)
      ? AppCore.utils.debounce(
          () =>
            handleResize(
              {
                AppCore,
                Router,
                syncSidebarState,
                closeDropdown,
                getElements:
                  resolver,
              }
            ),
          RESIZE_DEBOUNCE_MS
        )
      : () =>
          handleResize(
            {
              AppCore,
              Router,
              syncSidebarState,
              closeDropdown,
              getElements:
                resolver,
            }
          );

  bindDom(
    AppCore,
    localScope,
    epoch,
    window,
    "resize",
    resizeHandler
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
    window,
    "popstate",
    () => {
      const localCtx =
        {
          AppCore,
          Router:
            Router ||
            AppCore?.Router ||
            AppCore?.router,

          getElements:
            resolver,
        };

      const payload =
        buildRoutePayload(
          localCtx,
          {},
          "window:popstate",
          {
            force:
              true,
          }
        );

      const activeItem =
        syncActiveMenuItem(
          localCtx,
          payload
        );

      scheduleActiveMenuIndicator(
        localCtx,
        {
          ...payload,

          reason:
            "window:popstate",

          activeItem,

          delayMs:
            48,

          reveal:
            true,

          force:
            true,
        }
      );
    }
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
    window,
    "hashchange",
    () => {
      const localCtx =
        {
          AppCore,
          Router:
            Router ||
            AppCore?.Router ||
            AppCore?.router,

          getElements:
            resolver,
        };

      const payload =
        buildRoutePayload(
          localCtx,
          {},
          "window:hashchange",
          {
            force:
              true,
          }
        );

      const activeItem =
        syncActiveMenuItem(
          localCtx,
          payload
        );

      scheduleActiveMenuIndicator(
        localCtx,
        {
          ...payload,

          reason:
            "window:hashchange",

          activeItem,

          delayMs:
            48,

          reveal:
            true,

          force:
            true,
        }
      );
    }
  );

  safeEmit(
    AppCore,
    "sidebar:dom-events:bound",
    {
      scope:
        scopeName,

      localScope,
      epoch,
    }
  );

  return () => {
    disposeLocalScope(localScope);
  };
}

/* =========================================================
   CORE EVENTS
========================================================= */

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
  } =
    ctx;

  const scopeName =
    resolveScope(scope);

  const localScope =
    resolveLocalScope(
      scopeName,
      "core"
    );

  const epoch =
    resetLocalScope(localScope);

  const visualCtx =
    {
      ...ctx,

      AppCore,

      Router:
        Router ||
        AppCore?.Router ||
        AppCore?.router,

      renderUser,
      applyRoleVisibility,
      syncSidebarState,
      closeDropdown,

      getElements:
        resolver,
    };

  const visualCommitter =
    createSidebarVisualCommitter(visualCtx);

  const bindMany =
    (eventNames = [], handler) => {
      eventNames.forEach((eventName) => {
        bindCoreEvent(
          AppCore,
          localScope,
          epoch,
          eventName,
          handler
        );
      });
    };

  const commitIdentity =
    (eventOrPayload = {}) => {
      const detail =
        getEventDetail(eventOrPayload);

      visualCommitter.schedule(
        {
          key:
            "identity",

          reason:
            safeText(
              detail.reason ||
                detail.type ||
                detail.event ||
                "identity",
              "identity"
            ),

          payload:
            detail,

          renderIdentity:
            true,

          syncState:
            false,

          closeDropdown:
            false,

          delayMs:
            16,

          frames:
            1,

          indicatorDelayMs:
            48,

          force:
            true,
        }
      );
    };

  const commitIdentityAndState =
    (eventOrPayload = {}) => {
      const detail =
        getEventDetail(eventOrPayload);

      visualCommitter.schedule(
        {
          key:
            "identity-state",

          reason:
            safeText(
              detail.reason ||
                detail.type ||
                detail.event ||
                "identity-state",
              "identity-state"
            ),

          payload:
            detail,

          renderIdentity:
            true,

          syncState:
            true,

          closeDropdown:
            false,

          delayMs:
            24,

          frames:
            1,

          indicatorDelayMs:
            56,

          force:
            true,
        }
      );
    };

  const commitSessionCleared =
    (eventOrPayload = {}) => {
      const detail =
        getEventDetail(eventOrPayload);

      visualCommitter.schedule(
        {
          key:
            "session-cleared",

          reason:
            safeText(
              detail.reason ||
                detail.type ||
                detail.event ||
                "session-cleared",
              "session-cleared"
            ),

          payload:
            detail,

          renderIdentity:
            true,

          syncState:
            true,

          closeDropdown:
            true,

          delayMs:
            24,

          frames:
            1,

          indicatorDelayMs:
            56,

          force:
            true,
        }
      );
    };

  const commitRoute =
    (eventName) => {
      return (eventOrPayload = {}) => {
        const detail =
          getEventDetail(eventOrPayload);

        const payload =
          buildRoutePayload(
            visualCtx,
            detail,
            eventName,
            {
              preferExplicitRoute:
                false,

              force:
                true,
            }
          );

        visualCommitter.schedule(
          {
            key:
              "route",

            reason:
              eventName,

            payload,

            renderIdentity:
              false,

            syncState:
              false,

            closeDropdown:
              false,

            delayMs:
              24,

            frames:
              2,

            indicatorDelayMs:
              32,

            force:
              true,
          }
        );
      };
    };

  const commitRouterRendered =
    (eventOrPayload = {}) => {
      const detail =
        getEventDetail(eventOrPayload);

      const payload =
        buildRoutePayload(
          visualCtx,
          detail,
          "router:rendered",
          {
            preferExplicitRoute:
              false,

            force:
              true,
          }
        );

      visualCommitter.schedule(
        {
          key:
            "router-rendered",

          reason:
            "router:rendered",

          payload,

          renderIdentity:
            false,

          syncState:
            false,

          closeDropdown:
            true,

          delayMs:
            0,

          frames:
            2,

          indicatorDelayMs:
            48,

          force:
            true,
        }
      );

      visualCommitter.schedule(
        {
          key:
            "router-rendered-settled",

          reason:
            "router:rendered:settled",

          payload,

          renderIdentity:
            false,

          syncState:
            false,

          closeDropdown:
            false,

          delayMs:
            ROUTER_SETTLED_DELAY,

          frames:
            2,

          indicatorDelayMs:
            0,

          force:
            true,
        }
      );
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

  /*
    No escuchamos sidebar:state:synced ni sidebar:state:change.
    state.js ya es dueño de transición/estado/indicador en setSidebarOpen().
    Aquí sólo atendemos eventos externos de UI si existen.
  */
  bindMany(
    [
      "app:sidebar:change",
      "app:sidebar:toggled",
      "sidebar:external:change",
    ],
    (eventOrPayload = {}) => {
      const detail =
        getEventDetail(eventOrPayload);

      visualCommitter.schedule(
        {
          key:
            "external-sidebar-change",

          reason:
            safeText(
              detail.reason ||
                detail.type ||
                detail.event ||
                "external-sidebar-change",
              "external-sidebar-change"
            ),

          payload:
            detail,

          renderIdentity:
            false,

          syncState:
            false,

          closeDropdown:
            false,

          delayMs:
            48,

          frames:
            2,

          indicatorDelayMs:
            64,

          force:
            true,
        }
      );
    }
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

      visualCommitter.hideIndicator(
        "router:before-render"
      );
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
    bindCoreEvent(
      AppCore,
      localScope,
      epoch,
      eventName,
      commitRoute(eventName)
    );
  });

  bindCoreEvent(
    AppCore,
    localScope,
    epoch,
    "app:ui:repair-request",
    (eventOrPayload = {}) => {
      const detail =
        getEventDetail(eventOrPayload);

      visualCommitter.schedule(
        {
          key:
            "ui-repair-request",

          reason:
            "app:ui:repair-request",

          payload:
            detail,

          renderIdentity:
            true,

          syncState:
            detail.syncState === true,

          closeDropdown:
            false,

          delayMs:
            32,

          frames:
            2,

          indicatorDelayMs:
            56,

          force:
            true,
        }
      );
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
      const detail =
        getEventDetail(eventOrPayload);

      visualCommitter.schedule(
        {
          key:
            "app-ready",

          reason:
            safeText(
              detail.reason ||
                detail.type ||
                detail.event ||
                "app-ready",
              "app-ready"
            ),

          payload:
            detail,

          renderIdentity:
            true,

          syncState:
            false,

          closeDropdown:
            false,

          delayMs:
            64,

          frames:
            2,

          indicatorDelayMs:
            56,

          force:
            true,
        }
      );
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
      const detail =
        getEventDetail(eventOrPayload);

      const payload =
        buildRoutePayload(
          visualCtx,
          detail,
          "visual-env-change",
          {
            preferExplicitRoute:
              false,

            force:
              true,
          }
        );

      visualCommitter.schedule(
        {
          key:
            "visual-env-change",

          reason:
            safeText(
              detail.reason ||
                detail.type ||
                detail.event ||
                "visual-env-change",
              "visual-env-change"
            ),

          payload,

          renderIdentity:
            true,

          syncState:
            false,

          closeDropdown:
            false,

          delayMs:
            48,

          frames:
            2,

          indicatorDelayMs:
            56,

          force:
            true,
        }
      );
    }
  );

  safeEmit(
    AppCore,
    "sidebar:core-events:bound",
    {
      scope:
        scopeName,

      localScope,
      epoch,
    }
  );

  safeLog(
    AppCore,
    "core events bound",
    {
      scope:
        scopeName,

      localScope,
      epoch,
    }
  );

  return () => {
    visualCommitter.cancelAll();

    disposeLocalScope(localScope);
  };
}

/* =========================================================
   PUBLIC CLEANUP / SNAPSHOT
========================================================= */

export function disposeSidebarEvents(scope = DEFAULT_SCOPE) {
  const scopeName =
    resolveScope(scope);

  disposeLocalScope(
    resolveLocalScope(scopeName, "dom")
  );

  disposeLocalScope(
    resolveLocalScope(scopeName, "core")
  );

  disposeLocalScope(scopeName);

  return true;
}

export function getSidebarEventsSnapshot(scope = DEFAULT_SCOPE) {
  const scopeName =
    resolveScope(scope);

  const domScope =
    resolveLocalScope(scopeName, "dom");

  const coreScope =
    resolveLocalScope(scopeName, "core");

  return {
    version:
      SIDEBAR_EVENTS_VERSION,

    scope:
      scopeName,

    epochs: {
      root:
        getScopeEpoch(scopeName),

      dom:
        getScopeEpoch(domScope),

      core:
        getScopeEpoch(coreScope),
    },

    cleanupCounts: {
      root:
        localCleanups.get(scopeName)?.length || 0,

      dom:
        localCleanups.get(domScope)?.length || 0,

      core:
        localCleanups.get(coreScope)?.length || 0,
    },

    hasWindow:
      hasWindow(),

    hasBrowser:
      isBrowser(),

    currentRoute:
      getBrowserPath(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_EVENTS_VERSION,

  bindDomEvents,
  bindCoreEvents,
  disposeSidebarEvents,
  getSidebarEventsSnapshot,

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

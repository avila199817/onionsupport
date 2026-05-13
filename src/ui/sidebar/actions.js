/* =========================================================
   Onion SPA - Sidebar Actions
   Archivo: src/ui/sidebar/actions.js

   ONION SUPPORT · SIDEBAR ACTIONS · 15/10
   BUSINESS ACTIONS ONLY · LOGOUT SAFE · STATE.JS OWNER

   RESPONSABILIDADES:
   - Centralizar acciones de negocio del sidebar.
   - Delegar estado visual real en state.js.
   - No duplicar CSS ni clases visuales manuales.
   - Toggle / open / close / collapse / expand seguros.
   - Abrir sidebar antes de dropdown de usuario cuando haga falta.
   - Cerrar sidebar móvil tras navegación.
   - Navegación robusta por Router/AppCore/window fallback.
   - Logout robusto aunque falle el endpoint remoto.
   - Desactivar controles durante acciones críticas.
   - Restaurar estado previo real de controles.
   - Limpiar sesión local con fallback seguro.
   - Limpiar restos legacy de auth si Auth/AppCore fallan.
   - Limpiar storage AppCore/localStorage/sessionStorage conocido.
   - Limpiar cookies auth no HttpOnly conocidas.
   - Limpiar headers Authorization en clientes HTTP conocidos.
   - Resincronizar UI del sidebar tras logout.
   - Navegar a /login con replaceState.
   - Evitar doble logout concurrente.
   - Emitir eventos de diagnóstico sin secretos.
   - Cero throws accidentales hacia la UI.

   REGLAS:
   - state.js es dueño del estado/clases/indicator.
   - actions.js sólo decide intención.
   - events.js decide cuándo llamar acciones.
   - dropdown.js decide estado del dropdown.
   - template.js decide DOM base.
========================================================= */

import {
  setSidebarOpen as setSidebarOpenState,
  getDesiredSidebarOpenState,
  isMobileViewport,
  syncSidebarState as syncSidebarStateBase,
} from "./state.js";

/* =========================================================
   VERSION
========================================================= */

export const SIDEBAR_ACTIONS_VERSION =
  "sidebar-actions-v15-business-state-logout-safe";

/* =========================================================
   MODULE RUNTIME
========================================================= */

let logoutPromise =
  null;

let logoutGeneration =
  0;

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE =
  "SidebarActions";

const OWNER =
  "actions.js";

const LOG_PREFIX =
  "[SidebarActions]";

const LOGIN_ROUTE =
  "/login";

const REMOTE_LOGOUT_TIMEOUT_MS =
  9000;

const LOCAL_CLEAR_SETTLE_MS =
  0;

const EVENTS =
  Object.freeze({
    actionStart:
      "sidebar:action:start",

    actionComplete:
      "sidebar:action:complete",

    actionError:
      "sidebar:action:error",

    open:
      "sidebar:open",

    close:
      "sidebar:close",

    toggle:
      "sidebar:toggle",

    collapse:
      "sidebar:collapse",

    expand:
      "sidebar:expand",

    mobileCloseAfterNavigation:
      "sidebar:mobile:close-after-navigation",

    navigationStart:
      "sidebar:navigation:start",

    navigationComplete:
      "sidebar:navigation:complete",

    navigationError:
      "sidebar:navigation:error",

    logoutStart:
      "sidebar:logout:start",

    logoutRemoteStart:
      "sidebar:logout:remote:start",

    logoutRemoteSuccess:
      "sidebar:logout:remote:success",

    logoutRemoteError:
      "sidebar:logout:remote:error",

    logoutRemoteSkipped:
      "sidebar:logout:remote:skipped",

    logoutLocalCleared:
      "sidebar:logout:local-cleared",

    logoutNavigateStart:
      "sidebar:logout:navigate:start",

    logoutNavigateComplete:
      "sidebar:logout:navigate:complete",

    logoutComplete:
      "sidebar:logout:complete",

    logoutError:
      "sidebar:logout:error",

    logoutFinally:
      "sidebar:logout:finally",

    appSessionCleared:
      "app:session:cleared",

    authSessionCleared:
      "auth:session:cleared",

    authLogoutSuccess:
      "auth:logout:success",

    userUiSync:
      "app:user-ui:sync",

    uiRepairRequest:
      "app:ui:repair-request",

    sidebarStateChange:
      "sidebar:state:change",

    appSidebarChange:
      "app:sidebar:change",
  });

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

const AUTH_STATE_KEYS_TO_NULL =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",

    "refreshToken",
    "refresh_token",

    "tempToken",
    "temp_token",

    "session",
    "sessionData",
    "sessionId",
    "session_id",
    "sessionUserId",
    "session_user_id",

    "user",
    "usuario",
    "currentUser",
    "sessionUser",
    "authUser",
    "profile",
    "account",

    "avatar",
    "avatarUrl",
    "avatar_url",
    "photoURL",
    "picture",
  ]);

const AUTH_STATE_KEYS_TO_EMPTY_STRING =
  Object.freeze([
    "role",
    "rol",
    "userRole",
    "user_role",

    "username",
    "userName",
    "displayName",
    "name",
    "email",

    "currentResolvedUsername",
    "resolvedUsername",
    "publicUsername",
    "slug",
  ]);

const AUTH_STATE_KEYS_TO_EMPTY_ARRAY =
  Object.freeze([
    "roles",
    "permissions",
    "scopes",
    "groups",
    "authorities",
  ]);

const AUTH_STATE_KEYS_TO_FALSE =
  Object.freeze([
    "authenticated",
    "isAuthenticated",

    "isAdmin",
    "admin",

    "isSuperAdmin",
    "superAdmin",

    "isSupport",
    "support",

    "isManager",
    "manager",

    "loginInProgress",
    "authLoginInProgress",
    "isLoggingIn",

    "restoreInProgress",
    "sessionRestoreInProgress",
  ]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasDocument() {
  return typeof document !== "undefined";
}

function hasWindow() {
  return typeof window !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
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

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      LOG_PREFIX,
      ...args
    );
  } catch {}

  try {
    console.warn(
      LOG_PREFIX,
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(
      LOG_PREFIX,
      ...args
    );
  } catch {}

  try {
    console.error(
      LOG_PREFIX,
      ...args
    );
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const data =
    safeObject(payload);

  const finalPayload =
    {
      ...data,

      source:
        safeText(data.source, SOURCE),

      actionSource:
        SOURCE,

      owner:
        OWNER,

      version:
        SIDEBAR_ACTIONS_VERSION,

      at:
        safeText(data.at, safeIsoDate()),

      ts:
        data.ts || nowTs(),
    };

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        finalPayload
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
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

function sleep(ms = 0) {
  return new Promise((resolve) => {
    const delay =
      Math.max(
        0,
        Number(ms) || 0
      );

    try {
      if (hasWindow()) {
        window.setTimeout(
          resolve,
          delay
        );

        return;
      }
    } catch {}

    try {
      setTimeout(
        resolve,
        delay
      );

      return;
    } catch {}

    resolve();
  });
}

async function withTimeout(
  promise,
  ms = REMOTE_LOGOUT_TIMEOUT_MS,
  label = "timeout"
) {
  const timeoutMs =
    Math.max(
      1000,
      Number(ms) || REMOTE_LOGOUT_TIMEOUT_MS
    );

  let timer =
    null;

  const timeoutPromise =
    new Promise((_, reject) => {
      try {
        timer =
          setTimeout(() => {
            const error =
              new Error(`${label}:${timeoutMs}ms`);

            error.code =
              "SIDEBAR_ACTION_TIMEOUT";

            error.timeout =
              true;

            reject(error);
          }, timeoutMs);
      } catch {
        reject(
          new Error(`${label}:timeout`)
        );
      }
    });

  try {
    return await Promise.race(
      [
        promise,
        timeoutPromise,
      ]
    );
  } finally {
    try {
      clearTimeout(timer);
    } catch {}
  }
}

function cloneError(error = null) {
  return {
    name:
      safeText(error?.name, ""),

    message:
      safeText(error?.message, ""),

    code:
      safeText(error?.code, ""),

    status:
      error?.status ??
      error?.statusCode ??
      error?.response?.status ??
      null,

    timeout:
      Boolean(error?.timeout),
  };
}

function safeSetLoading(AppCore, value = false) {
  const loading =
    Boolean(value);

  try {
    if (isFunction(AppCore?.setLoading)) {
      AppCore.setLoading(loading);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState({ loading });
      return true;
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      AppCore.state.loading =
        loading;

      return true;
    }
  } catch {}

  return false;
}

function getModule(AppCore = null, name = "") {
  const cleanName =
    safeText(name, "");

  if (
    !AppCore ||
    !cleanName
  ) {
    return null;
  }

  try {
    if (isFunction(AppCore?.modules?.get)) {
      const value =
        AppCore.modules.get(cleanName);

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    return AppCore?.modules?.[cleanName] || null;
  } catch {
    return null;
  }
}

function resolveAuth(Auth, AppCore) {
  return (
    Auth ||
    AppCore?.Auth ||
    AppCore?.auth ||
    AppCore?.features?.auth ||
    getModule(AppCore, "Auth") ||
    getModule(AppCore, "auth") ||
    null
  );
}

function resolveRouter(Router, AppCore) {
  return (
    Router ||
    AppCore?.Router ||
    AppCore?.router ||
    getModule(AppCore, "Router") ||
    getModule(AppCore, "router") ||
    null
  );
}

/* =========================================================
   ROUTE HELPERS
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
    value =
      "/";
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

function dispatchPopStateSafe() {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.dispatchEvent(
      new PopStateEvent("popstate")
    );

    return true;
  } catch {}

  try {
    window.dispatchEvent(
      new Event("popstate")
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   SIDEBAR STATE ACTIONS
========================================================= */

function syncStateFallback(AppCore, closeDropdown, syncSidebarState) {
  try {
    if (isFunction(syncSidebarState)) {
      return Boolean(syncSidebarState());
    }
  } catch {}

  try {
    return Boolean(
      syncSidebarStateBase(
        AppCore,
        closeDropdown
      )
    );
  } catch {}

  return false;
}

export function setSidebarOpen({
  AppCore,
  open,
  closeDropdown,
  syncSidebarState,
  reason = "set-sidebar-open",
} = {}) {
  const nextOpen =
    Boolean(open);

  safeEmit(
    AppCore,
    EVENTS.actionStart,
    {
      action:
        "setSidebarOpen",

      open:
        nextOpen,

      reason,
    }
  );

  try {
    const result =
      setSidebarOpenState(
        AppCore,
        nextOpen,
        closeDropdown
      );

    /*
      state.js ya sincroniza clases/attrs/indicator.
      Fallback sólo si state.js no pudo completar.
    */
    if (!result) {
      syncStateFallback(
        AppCore,
        closeDropdown,
        syncSidebarState
      );
    }

    safeEmit(
      AppCore,
      EVENTS.actionComplete,
      {
        action:
          "setSidebarOpen",

        open:
          nextOpen,

        reason,

        result:
          Boolean(result),
      }
    );

    return Boolean(result);
  } catch (error) {
    safeWarn(
      AppCore,
      "setSidebarOpen falló.",
      error
    );

    const fallbackResult =
      syncStateFallback(
        AppCore,
        closeDropdown,
        syncSidebarState
      );

    safeEmit(
      AppCore,
      EVENTS.actionError,
      {
        action:
          "setSidebarOpen",

        open:
          nextOpen,

        reason,

        fallbackResult,

        error:
          cloneError(error),
      }
    );

    return Boolean(fallbackResult);
  }
}

export function openSidebar({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "open-sidebar",
} = {}) {
  const result =
    setSidebarOpen(
      {
        AppCore,
        open:
          true,
        closeDropdown,
        syncSidebarState,
        reason,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.open,
    {
      open:
        true,

      reason,
      result,
    }
  );

  return result;
}

export function closeSidebar({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "close-sidebar",
} = {}) {
  try {
    closeDropdown?.(
      {
        force:
          true,

        reason,
      }
    );
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  const result =
    setSidebarOpen(
      {
        AppCore,
        open:
          false,
        closeDropdown,
        syncSidebarState,
        reason,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.close,
    {
      open:
        false,

      reason,
      result,
    }
  );

  return result;
}

export function toggleSidebar({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "toggle-sidebar",
} = {}) {
  let currentOpen =
    true;

  try {
    currentOpen =
      Boolean(
        getDesiredSidebarOpenState(AppCore)
      );
  } catch {
    currentOpen =
      Boolean(AppCore?.state?.sidebarOpen);
  }

  const nextOpen =
    !currentOpen;

  const result =
    setSidebarOpen(
      {
        AppCore,
        open:
          nextOpen,
        closeDropdown,
        syncSidebarState,
        reason,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.toggle,
    {
      previousOpen:
        currentOpen,

      open:
        nextOpen,

      reason,
      result,
    }
  );

  return result;
}

export function collapseSidebar({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "collapse-sidebar",
} = {}) {
  if (isMobileViewport()) {
    return closeSidebar(
      {
        AppCore,
        closeDropdown,
        syncSidebarState,
        reason:
          `${reason}:mobile`,
      }
    );
  }

  try {
    closeDropdown?.(
      {
        force:
          true,

        reason,
      }
    );
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  const result =
    setSidebarOpen(
      {
        AppCore,
        open:
          false,
        closeDropdown,
        syncSidebarState,
        reason,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.collapse,
    {
      open:
        false,

      collapsed:
        true,

      mobile:
        false,

      reason,
      result,
    }
  );

  return result;
}

export function expandSidebar({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "expand-sidebar",
} = {}) {
  const result =
    setSidebarOpen(
      {
        AppCore,
        open:
          true,
        closeDropdown,
        syncSidebarState,
        reason,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.expand,
    {
      open:
        true,

      collapsed:
        false,

      mobile:
        isMobileViewport(),

      reason,
      result,
    }
  );

  return result;
}

export function ensureSidebarOpenForUserMenu({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "ensure-sidebar-open-for-user-menu",
} = {}) {
  let currentlyOpen =
    true;

  try {
    currentlyOpen =
      Boolean(
        getDesiredSidebarOpenState(AppCore)
      );
  } catch {
    currentlyOpen =
      Boolean(AppCore?.state?.sidebarOpen);
  }

  if (currentlyOpen) {
    return false;
  }

  return expandSidebar(
    {
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason,
    }
  );
}

export function closeSidebarOnMobileAfterNavigation({
  AppCore,
  closeDropdown,
  syncSidebarState,
  reason = "mobile-navigation",
} = {}) {
  if (!isMobileViewport()) {
    return false;
  }

  const result =
    closeSidebar(
      {
        AppCore,
        closeDropdown,
        syncSidebarState,
        reason,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.mobileCloseAfterNavigation,
    {
      open:
        false,

      mobile:
        true,

      reason,
      result,
    }
  );

  return result;
}

/* =========================================================
   NAVIGATION ACTIONS
========================================================= */

async function navigateToTarget({
  AppCore,
  Router,
  target = "",
  replace = false,
  source = "sidebar",
  force = false,
} = {}) {
  const resolvedRouter =
    resolveRouter(
      Router,
      AppCore
    );

  const cleanTarget =
    normalizeRoutePath(target);

  if (!cleanTarget) {
    return false;
  }

  const options =
    {
      replaceState:
        Boolean(replace),

      replace:
        Boolean(replace),

      force:
        Boolean(force),

      source,
    };

  safeEmit(
    AppCore,
    EVENTS.navigationStart,
    {
      target:
        cleanTarget,

      replace:
        Boolean(replace),

      force:
        Boolean(force),

      source,
    }
  );

  const candidates =
    [
      {
        name:
          "Router.replace",

        enabled:
          Boolean(replace),

        fn:
          resolvedRouter?.replace,

        ctx:
          resolvedRouter,

        args:
          [
            cleanTarget,
            options,
          ],
      },
      {
        name:
          "Router.navigate",

        enabled:
          true,

        fn:
          resolvedRouter?.navigate,

        ctx:
          resolvedRouter,

        args:
          [
            cleanTarget,
            options,
          ],
      },
      {
        name:
          "Router.go",

        enabled:
          true,

        fn:
          resolvedRouter?.go,

        ctx:
          resolvedRouter,

        args:
          [
            cleanTarget,
            options,
          ],
      },
      {
        name:
          "Router.push",

        enabled:
          !replace,

        fn:
          resolvedRouter?.push,

        ctx:
          resolvedRouter,

        args:
          [
            cleanTarget,
            options,
          ],
      },
      {
        name:
          "AppCore.navigate",

        enabled:
          true,

        fn:
          AppCore?.navigate,

        ctx:
          AppCore,

        args:
          [
            cleanTarget,
            options,
          ],
      },
    ];

  for (const candidate of candidates) {
    if (
      !candidate.enabled ||
      !isFunction(candidate.fn)
    ) {
      continue;
    }

    try {
      await Promise.resolve(
        candidate.fn.apply(
          candidate.ctx,
          candidate.args
        )
      );

      safeEmit(
        AppCore,
        EVENTS.navigationComplete,
        {
          ok:
            true,

          method:
            candidate.name,

          target:
            cleanTarget,

          replace:
            Boolean(replace),

          force:
            Boolean(force),

          source,
        }
      );

      return true;
    } catch (error) {
      safeWarn(
        AppCore,
        `${candidate.name}("${cleanTarget}") falló.`,
        error
      );
    }
  }

  if (!isBrowser()) {
    safeEmit(
      AppCore,
      EVENTS.navigationComplete,
      {
        ok:
          false,

        method:
          "",

        target:
          cleanTarget,

        reason:
          "not-browser",

        source,
      }
    );

    return false;
  }

  try {
    const state =
      {
        path:
          cleanTarget,

        publicPath:
          cleanTarget,

        canonicalPath:
          cleanTarget,

        source,

        ts:
          nowTs(),
      };

    if (replace) {
      window.history.replaceState(
        state,
        "",
        cleanTarget
      );
    } else {
      window.history.pushState(
        state,
        "",
        cleanTarget
      );
    }

    dispatchPopStateSafe();

    safeEmit(
      AppCore,
      EVENTS.navigationComplete,
      {
        ok:
          true,

        method:
          replace
            ? "history.replaceState"
            : "history.pushState",

        target:
          cleanTarget,

        replace:
          Boolean(replace),

        source,
      }
    );

    return true;
  } catch (error) {
    safeEmit(
      AppCore,
      EVENTS.navigationError,
      {
        target:
          cleanTarget,

        error:
          cloneError(error),

        source,
      }
    );
  }

  try {
    if (replace) {
      window.location.replace(cleanTarget);
    } else {
      window.location.href =
        cleanTarget;
    }

    return true;
  } catch {}

  return false;
}

export async function navigateFromSidebar({
  AppCore,
  Router,
  target = "",
  closeDropdown,
  closeSidebarOnMobile = true,
  syncSidebarState,
  replace = false,
  source = "sidebar",
} = {}) {
  try {
    closeDropdown?.(
      {
        force:
          true,

        reason:
          "navigate-from-sidebar",
      }
    );
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  const ok =
    await navigateToTarget(
      {
        AppCore,
        Router,
        target,
        replace,
        source,
        force:
          false,
      }
    );

  if (
    ok &&
    closeSidebarOnMobile
  ) {
    closeSidebarOnMobileAfterNavigation(
      {
        AppCore,
        closeDropdown,
        syncSidebarState,
        reason:
          "navigate-from-sidebar",
      }
    );
  }

  return ok;
}

/* =========================================================
   CONTROLS
========================================================= */

function uniqueElements(items = []) {
  return Array.from(
    new Set(
      safeArray(items).filter(Boolean)
    )
  );
}

function getActionControls(elements = {}) {
  const root =
    safeObject(elements);

  return uniqueElements(
    [
      root.logoutBtn,
      root.userToggle,
      root.toggleBtn,
      root.mobileToggleBtn,
    ]
  );
}

function captureControlState(element) {
  if (!element) {
    return null;
  }

  let disabled =
    false;

  let ariaDisabled =
    null;

  let busy =
    null;

  let inert =
    false;

  let hadDisabledAttr =
    false;

  let hadAriaDisabled =
    false;

  let hadBusy =
    false;

  let hadInertAttr =
    false;

  let hadIsDisabledClass =
    false;

  let hadIsLoadingClass =
    false;

  try {
    disabled =
      Boolean(element.disabled);
  } catch {}

  try {
    hadDisabledAttr =
      Boolean(
        element.hasAttribute?.("disabled")
      );
  } catch {}

  try {
    hadAriaDisabled =
      Boolean(
        element.hasAttribute?.("aria-disabled")
      );

    ariaDisabled =
      element.getAttribute?.("aria-disabled");
  } catch {}

  try {
    hadBusy =
      Boolean(
        element.dataset &&
          Object.prototype.hasOwnProperty.call(
            element.dataset,
            "busy"
          )
      );

    busy =
      element.dataset?.busy;
  } catch {}

  try {
    inert =
      Boolean(element.inert);
  } catch {}

  try {
    hadInertAttr =
      Boolean(
        element.hasAttribute?.("inert")
      );
  } catch {}

  try {
    hadIsDisabledClass =
      Boolean(
        element.classList?.contains?.("is-disabled")
      );

    hadIsLoadingClass =
      Boolean(
        element.classList?.contains?.("is-loading")
      );
  } catch {}

  return {
    element,

    disabled,
    inert,

    hadDisabledAttr,
    hadAriaDisabled,
    ariaDisabled,

    hadBusy,
    busy,

    hadInertAttr,
    hadIsDisabledClass,
    hadIsLoadingClass,
  };
}

function captureControlsState(elements = {}) {
  return getActionControls(elements)
    .map(captureControlState)
    .filter(Boolean);
}

function setControlDisabled(element, disabled = false) {
  if (!element) {
    return false;
  }

  const value =
    Boolean(disabled);

  try {
    if ("disabled" in element) {
      element.disabled =
        value;
    }
  } catch {}

  try {
    if (value) {
      element.setAttribute(
        "disabled",
        ""
      );
    } else {
      element.removeAttribute(
        "disabled"
      );
    }
  } catch {}

  try {
    element.setAttribute(
      "aria-disabled",
      value ? "true" : "false"
    );
  } catch {}

  try {
    element.classList?.toggle?.(
      "is-disabled",
      value
    );

    element.classList?.toggle?.(
      "is-loading",
      value
    );
  } catch {}

  try {
    element.dataset.busy =
      value ? "true" : "false";

    element.dataset.sidebarActionBusy =
      value ? "true" : "false";
  } catch {}

  return true;
}

function setControlsDisabled(elements = {}, disabled = false) {
  getActionControls(elements).forEach((element) => {
    setControlDisabled(
      element,
      disabled
    );
  });

  return true;
}

function restoreControlsState(snapshot = []) {
  safeArray(snapshot).forEach((item) => {
    const element =
      item?.element;

    if (!element) {
      return;
    }

    try {
      if ("disabled" in element) {
        element.disabled =
          Boolean(item.disabled);
      }
    } catch {}

    try {
      if (item.hadDisabledAttr) {
        element.setAttribute(
          "disabled",
          ""
        );
      } else {
        element.removeAttribute(
          "disabled"
        );
      }
    } catch {}

    try {
      if (item.hadAriaDisabled) {
        element.setAttribute(
          "aria-disabled",
          item.ariaDisabled || "false"
        );
      } else {
        element.removeAttribute(
          "aria-disabled"
        );
      }
    } catch {}

    try {
      if (item.hadBusy) {
        element.dataset.busy =
          item.busy || "false";
      } else {
        delete element.dataset.busy;
      }

      delete element.dataset.sidebarActionBusy;
    } catch {}

    try {
      if (item.hadInertAttr) {
        element.setAttribute(
          "inert",
          ""
        );
      } else {
        element.removeAttribute(
          "inert"
        );
      }
    } catch {}

    try {
      if ("inert" in element) {
        element.inert =
          Boolean(item.inert);
      }
    } catch {}

    try {
      element.classList?.toggle?.(
        "is-disabled",
        Boolean(item.hadIsDisabledClass)
      );

      element.classList?.toggle?.(
        "is-loading",
        Boolean(item.hadIsLoadingClass)
      );
    } catch {}
  });

  return true;
}

/* =========================================================
   STORAGE FALLBACK
========================================================= */

function getStoragePrefix(AppCore) {
  return safeText(
    AppCore?.config?.storagePrefix ||
      AppCore?.config?.storageKeyPrefix ||
      AppCore?.config?.appKey,
    "onion"
  );
}

function getKnownAuthStorageKeys(AppCore) {
  const prefix =
    getStoragePrefix(AppCore);

  const keys =
    [
      "auth.refreshToken",
      "auth.tempToken",
      "auth.sessionId",
      "auth.sessionUserId",

      "auth.token",
      "auth.accessToken",
      "auth.user",
      "auth.username",
      "auth.role",
      "auth.roles",
      "auth.permissions",
      "auth.scopes",

      "session.token",
      "session.accessToken",
      "session.refreshToken",
      "session.user",
      "session.username",
      "session.role",
      "session.roles",
      "session.permissions",
      "session.scopes",
      "session.id",
      "session.userId",

      "onion_token",
      "onion_access_token",
      "onion_refresh_token",
      "onion_temp_token",
      "onion_session_id",
      "onion_session_user_id",
      "onion_user_id",
      "onion_user_name",
      "onion_username",
      "onion_user",
      "onion_role",
      "onion_roles",
      "onion_permissions",
      "onion_scopes",

      "auth_token",
      "access_token",
      "refresh_token",
      "temp_token",

      "token",
      "accessToken",
      "refreshToken",
      "tempToken",

      "session",
      "sessionId",
      "sessionUserId",

      "user",
      "username",
      "currentUser",
      "authUser",
      "sessionUser",

      "role",
      "roles",
      "permissions",
      "scopes",
    ];

  const expanded =
    [];

  keys.forEach((key) => {
    expanded.push(key);
    expanded.push(`${prefix}:${key}`);

    const colonKey =
      key.replace(/\./g, ":");

    const underscoreKey =
      key.replace(/\./g, "_");

    expanded.push(colonKey);
    expanded.push(underscoreKey);

    expanded.push(`${prefix}:${colonKey}`);
    expanded.push(`${prefix}_${underscoreKey}`);
  });

  return Array.from(
    new Set(
      expanded.filter(Boolean)
    )
  );
}

function removeFromStorage(storage, key) {
  if (
    !storage ||
    !key
  ) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function removeFromAppCoreStorage(AppCore, key) {
  if (
    !AppCore ||
    !key
  ) {
    return false;
  }

  try {
    if (isFunction(AppCore?.storage?.remove)) {
      AppCore.storage.remove(key);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.storage?.delete)) {
      AppCore.storage.delete(key);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.storage?.set)) {
      AppCore.storage.set(
        key,
        null
      );

      return true;
    }
  } catch {}

  return false;
}

function normalizeStorageKeyForScan(key = "") {
  return safeText(key, "")
    .toLowerCase()
    .replace(/[\s._-]+/g, ":")
    .replace(/:+/g, ":")
    .replace(/^:+|:+$/g, "");
}

function shouldRemoveScannedStorageKey(key = "", AppCore = null) {
  const value =
    safeText(key, "");

  if (!value) {
    return false;
  }

  const prefix =
    getStoragePrefix(AppCore);

  const normalized =
    normalizeStorageKeyForScan(value);

  const prefixNormalized =
    normalizeStorageKeyForScan(prefix);

  const isKnownNamespace =
    normalized.startsWith(`${prefixNormalized}:`) ||
    normalized.startsWith("onion:") ||
    normalized.startsWith("auth:") ||
    normalized.startsWith("session:");

  if (!isKnownNamespace) {
    return false;
  }

  return (
    normalized.includes("auth") ||
    normalized.includes("session") ||
    normalized.includes("token") ||
    normalized.includes("refresh") ||
    normalized.includes("temp") ||
    normalized.includes("user") ||
    normalized.includes("role") ||
    normalized.includes("permission") ||
    normalized.includes("scope")
  );
}

function scanAndClearStorage(storage, AppCore) {
  if (!storage) {
    return 0;
  }

  let removed =
    0;

  const keys =
    [];

  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key =
        storage.key(i);

      if (key) {
        keys.push(key);
      }
    }
  } catch {
    return 0;
  }

  keys.forEach((key) => {
    if (
      !shouldRemoveScannedStorageKey(
        key,
        AppCore
      )
    ) {
      return;
    }

    if (
      removeFromStorage(
        storage,
        key
      )
    ) {
      removed += 1;
    }
  });

  return removed;
}

function clearKnownAuthStorage(AppCore) {
  const keys =
    getKnownAuthStorageKeys(AppCore);

  let removed =
    0;

  let appCoreRemoved =
    0;

  let scannedRemoved =
    0;

  keys.forEach((key) => {
    if (
      removeFromAppCoreStorage(
        AppCore,
        key
      )
    ) {
      appCoreRemoved += 1;
    }
  });

  if (!isBrowser()) {
    return {
      removed,
      appCoreRemoved,
      scannedRemoved,
    };
  }

  keys.forEach((key) => {
    if (
      removeFromStorage(
        window.localStorage,
        key
      )
    ) {
      removed += 1;
    }

    if (
      removeFromStorage(
        window.sessionStorage,
        key
      )
    ) {
      removed += 1;
    }
  });

  scannedRemoved =
    scanAndClearStorage(
      window.localStorage,
      AppCore
    ) +
    scanAndClearStorage(
      window.sessionStorage,
      AppCore
    );

  return {
    removed,
    appCoreRemoved,
    scannedRemoved,
  };
}

/* =========================================================
   COOKIE FALLBACK
========================================================= */

function getKnownAuthCookieNames(AppCore) {
  const prefix =
    getStoragePrefix(AppCore);

  return Array.from(
    new Set(
      [
        "token",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "auth_token",
        "session",
        "session_id",
        "sessionId",

        "onion_token",
        "onion_access_token",
        "onion_refresh_token",
        "onion_session",
        "onion_session_id",

        `${prefix}_token`,
        `${prefix}_access_token`,
        `${prefix}_refresh_token`,
        `${prefix}_session`,
        `${prefix}_session_id`,

        `${prefix}:token`,
        `${prefix}:access_token`,
        `${prefix}:refresh_token`,
        `${prefix}:session`,
        `${prefix}:session_id`,
      ].filter(Boolean)
    )
  );
}

function getCookieNames() {
  if (!hasDocument()) {
    return [];
  }

  try {
    return String(document.cookie || "")
      .split(";")
      .map((item) => item.split("=")[0])
      .map((item) => safeText(item, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getCookieDomainVariants() {
  const domains =
    [];

  if (!isBrowser()) {
    return domains;
  }

  try {
    const host =
      safeText(
        window.location?.hostname,
        ""
      );

    if (
      !host ||
      host === "localhost" ||
      /^[0-9.]+$/.test(host)
    ) {
      return domains;
    }

    domains.push(host);

    const parts =
      host
        .split(".")
        .filter(Boolean);

    if (parts.length >= 2) {
      domains.push(
        `.${parts.slice(-2).join(".")}`
      );
    }
  } catch {}

  return Array.from(
    new Set(domains)
  );
}

function clearCookie(name = "") {
  const cleanName =
    safeText(name, "");

  if (
    !cleanName ||
    !hasDocument()
  ) {
    return false;
  }

  const expires =
    "Thu, 01 Jan 1970 00:00:00 GMT";

  const domains =
    getCookieDomainVariants();

  const baseVariants =
    [
      `${cleanName}=; expires=${expires}; path=/`,
      `${cleanName}=; Max-Age=0; path=/`,
      `${cleanName}=; expires=${expires}; path=/; SameSite=Lax`,
      `${cleanName}=; Max-Age=0; path=/; SameSite=Lax`,
    ];

  const variants =
    [
      ...baseVariants,
    ];

  domains.forEach((domain) => {
    baseVariants.forEach((variant) => {
      variants.push(
        `${variant}; domain=${domain}`
      );
    });
  });

  let cleared =
    false;

  variants.forEach((cookieValue) => {
    try {
      document.cookie =
        cookieValue;

      cleared =
        true;
    } catch {}
  });

  return cleared;
}

function clearKnownAuthCookies(AppCore) {
  if (!hasDocument()) {
    return 0;
  }

  const known =
    getKnownAuthCookieNames(AppCore);

  const existing =
    getCookieNames();

  const targets =
    Array.from(
      new Set(
        [
          ...known,

          ...existing.filter((name) => {
            const key =
              name.toLowerCase();

            return (
              key.startsWith("onion") ||
              key.startsWith("auth") ||
              key.startsWith("session") ||
              key.includes("token")
            );
          }),
        ]
      )
    );

  let cleared =
    0;

  targets.forEach((name) => {
    if (clearCookie(name)) {
      cleared += 1;
    }
  });

  return cleared;
}

/* =========================================================
   SESSION CLEARING
========================================================= */

function buildClearedAuthPatch() {
  const patch =
    {};

  AUTH_STATE_KEYS_TO_FALSE.forEach((key) => {
    patch[key] =
      false;
  });

  AUTH_STATE_KEYS_TO_NULL.forEach((key) => {
    patch[key] =
      null;
  });

  AUTH_STATE_KEYS_TO_EMPTY_STRING.forEach((key) => {
    patch[key] =
      "";
  });

  AUTH_STATE_KEYS_TO_EMPTY_ARRAY.forEach((key) => {
    patch[key] =
      [];
  });

  return patch;
}

function patchNestedAuthObjects(AppCore) {
  let patched =
    false;

  try {
    const state =
      AppCore?.state;

    if (
      !state ||
      typeof state !== "object"
    ) {
      return false;
    }

    const nestedCandidates =
      [
        state.auth,
        state.sessionAuth,
        state.authState,
        state.session,
      ].filter((value) =>
        value &&
        typeof value === "object"
      );

    nestedCandidates.forEach((target) => {
      try {
        Object.assign(
          target,
          {
            authenticated:
              false,

            isAuthenticated:
              false,

            token:
              null,

            accessToken:
              null,

            refreshToken:
              null,

            tempToken:
              null,

            user:
              null,

            currentUser:
              null,

            profile:
              null,

            username:
              "",

            displayName:
              "",

            email:
              "",

            avatar:
              null,

            avatarUrl:
              null,

            role:
              "",

            roles:
              [],

            permissions:
              [],

            scopes:
              [],

            isAdmin:
              false,

            admin:
              false,

            isSuperAdmin:
              false,

            superAdmin:
              false,
          }
        );

        patched =
          true;
      } catch {}
    });
  } catch {}

  return patched;
}

function clearAuthHeaders(AppCore, Auth) {
  let cleared =
    false;

  const candidates =
    [
      AppCore?.http,
      AppCore?.Http,
      AppCore?.request,
      AppCore?.apiClient,
      AppCore?.client,
      AppCore?.services?.http,
      AppCore?.services?.api,
      Auth?.http,
      Auth?.api,
      Auth?.client,
    ].filter(Boolean);

  candidates.forEach((client) => {
    try {
      if (client.defaults?.headers?.common?.Authorization) {
        delete client.defaults.headers.common.Authorization;
        cleared =
          true;
      }
    } catch {}

    try {
      if (client.defaults?.headers?.Authorization) {
        delete client.defaults.headers.Authorization;
        cleared =
          true;
      }
    } catch {}

    try {
      if (client.headers?.Authorization) {
        delete client.headers.Authorization;
        cleared =
          true;
      }
    } catch {}

    try {
      if (isFunction(client.setAuthToken)) {
        client.setAuthToken(null);
        cleared =
          true;
      }
    } catch {}

    try {
      if (isFunction(client.setToken)) {
        client.setToken(null);
        cleared =
          true;
      }
    } catch {}

    try {
      if (isFunction(client.clearAuth)) {
        client.clearAuth();
        cleared =
          true;
      }
    } catch {}

    try {
      if (isFunction(client.removeHeader)) {
        client.removeHeader("Authorization");
        cleared =
          true;
      }
    } catch {}

    try {
      if (isFunction(client.setHeader)) {
        client.setHeader("Authorization", "");
        cleared =
          true;
      }
    } catch {}
  });

  return cleared;
}

async function callClearCandidate(Auth, AppCore, candidate, clearOptions) {
  if (!isFunction(candidate)) {
    return false;
  }

  try {
    await Promise.resolve(
      candidate.call(
        Auth,
        clearOptions
      )
    );

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      "Limpieza local Auth falló.",
      error
    );

    return false;
  }
}

async function clearAuthLocal(Auth, AppCore) {
  let cleared =
    false;

  const clearOptions =
    {
      silent:
        true,

      reason:
        "sidebar-logout",

      source:
        "sidebar",

      preserveRoute:
        false,

      preserveCurrentRoute:
        false,

      navigate:
        false,

      redirect:
        false,

      replaceState:
        false,

      remote:
        false,

      notifyServer:
        false,

      emit:
        false,
    };

  const candidates =
    [
      Auth?.clearSessionLocal,
      Auth?.clearLocalSession,
      Auth?.clearSession,
      Auth?.resetSession,
      Auth?.clearAuthStorage,
      Auth?.clear,
    ];

  for (const candidate of candidates) {
    const ok =
      await callClearCandidate(
        Auth,
        AppCore,
        candidate,
        clearOptions
      );

    if (ok) {
      cleared =
        true;
    }
  }

  return cleared;
}

function clearAppCoreSession(AppCore) {
  const patch =
    buildClearedAuthPatch();

  let cleared =
    false;

  try {
    if (isFunction(AppCore?.clearSession)) {
      AppCore.clearSession(
        {
          silent:
            true,

          reason:
            "sidebar-logout",

          source:
            "sidebar",

          navigate:
            false,

          redirect:
            false,

          emit:
            false,
        }
      );

      cleared =
        true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "AppCore.clearSession() falló.",
      error
    );
  }

  try {
    if (isFunction(AppCore?.setToken)) {
      AppCore.setToken(null);
      cleared =
        true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setUser)) {
      AppCore.setUser(null);
      cleared =
        true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(patch);
      cleared =
        true;
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        patch
      );

      cleared =
        true;
    }
  } catch {}

  if (patchNestedAuthObjects(AppCore)) {
    cleared =
      true;
  }

  return cleared;
}

async function clearSessionEverywhere({
  Auth,
  AppCore,
} = {}) {
  const resolvedAuth =
    resolveAuth(
      Auth,
      AppCore
    );

  const authCleared =
    await clearAuthLocal(
      resolvedAuth,
      AppCore
    );

  const coreCleared =
    clearAppCoreSession(AppCore);

  const authHeadersCleared =
    clearAuthHeaders(
      AppCore,
      resolvedAuth
    );

  const storageResult =
    clearKnownAuthStorage(AppCore);

  const cookiesCleared =
    clearKnownAuthCookies(AppCore);

  const result =
    {
      authCleared,
      coreCleared,
      authHeadersCleared,

      storageRemoved:
        storageResult.removed || 0,

      appCoreStorageRemoved:
        storageResult.appCoreRemoved || 0,

      scannedStorageRemoved:
        storageResult.scannedRemoved || 0,

      cookiesCleared,
    };

  safeEmit(
    AppCore,
    EVENTS.logoutLocalCleared,
    result
  );

  safeEmit(
    AppCore,
    EVENTS.appSessionCleared,
    {
      source:
        "sidebar:logout",

      local:
        result,
    }
  );

  safeEmit(
    AppCore,
    EVENTS.authSessionCleared,
    {
      source:
        "sidebar:logout",

      local:
        result,
    }
  );

  safeEmit(
    AppCore,
    EVENTS.authLogoutSuccess,
    {
      source:
        "sidebar:logout",

      localOnly:
        true,

      local:
        result,
    }
  );

  return result;
}

/* =========================================================
   LOADER / UI SYNC
========================================================= */

function hideGlobalLoader(AppCore, reason = "sidebar:logout") {
  safeSetLoading(
    AppCore,
    false
  );

  if (!isBrowser()) {
    return false;
  }

  let changed =
    false;

  try {
    document.documentElement?.classList?.remove?.(
      "app-loading",
      "app-booting",
      "loading"
    );

    document.body?.classList?.remove?.(
      "app-loading",
      "app-booting",
      "loading"
    );
  } catch {}

  const selectors =
    [
      "#app-loader",
      ".app-loader",
      "[data-app-loader='true']",
      "[data-loader='app']",
    ];

  selectors.forEach((selector) => {
    let loader =
      null;

    try {
      loader =
        document.querySelector(selector);
    } catch {}

    if (!loader) {
      return;
    }

    try {
      loader.classList.remove(
        "is-visible",
        "is-leaving",
        "app-loader--visible"
      );

      loader.classList.add(
        "is-hidden",
        "has-hidden"
      );

      loader.setAttribute(
        "aria-hidden",
        "true"
      );

      loader.setAttribute(
        "aria-busy",
        "false"
      );

      loader.dataset.loaderVisible =
        "false";

      loader.hidden =
        true;

      changed =
        true;
    } catch {}
  });

  safeEmit(
    AppCore,
    "app:loader:hidden",
    {
      reason,
      source:
        "sidebar.actions",
    }
  );

  return changed;
}

function syncSidebarAfterLogout({
  AppCore,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation: closeMobileFn,
  syncSidebarState,
} = {}) {
  try {
    closeDropdown?.(
      {
        force:
          true,

        reason:
          "logout",
      }
    );
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  try {
    renderUser?.();
  } catch {}

  try {
    applyRoleVisibility?.();
  } catch {}

  let shouldCloseMobile =
    false;

  try {
    shouldCloseMobile =
      closeMobileFn?.() === true;
  } catch {}

  if (!shouldCloseMobile) {
    try {
      shouldCloseMobile =
        closeSidebarOnMobileAfterNavigation(
          {
            AppCore,
            closeDropdown,
            syncSidebarState,
            reason:
              "logout",
          }
        );
    } catch {
      shouldCloseMobile =
        false;
    }
  }

  safeEmit(
    AppCore,
    EVENTS.userUiSync,
    {
      source:
        "sidebar:logout",
    }
  );

  safeEmit(
    AppCore,
    EVENTS.uiRepairRequest,
    {
      source:
        "sidebar:logout",

      reason:
        "logout",

      syncState:
        true,
    }
  );

  return true;
}

/* =========================================================
   LOGIN NAVIGATION
========================================================= */

async function navigateToLogin({
  AppCore,
  Router,
} = {}) {
  safeEmit(
    AppCore,
    EVENTS.logoutNavigateStart,
    {
      target:
        LOGIN_ROUTE,
    }
  );

  const ok =
    await navigateToTarget(
      {
        AppCore,
        Router,
        target:
          LOGIN_ROUTE,
        replace:
          true,
        force:
          true,
        source:
          "sidebar:logout",
      }
    );

  safeEmit(
    AppCore,
    EVENTS.logoutNavigateComplete,
    {
      ok,
      target:
        LOGIN_ROUTE,
    }
  );

  return ok;
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

function getRemoteLogoutCandidates(Auth) {
  const primary =
    [
      {
        name:
          "Auth.logoutRemote",

        fn:
          Auth?.logoutRemote,

        ctx:
          Auth,
      },
      {
        name:
          "Auth.remoteLogout",

        fn:
          Auth?.remoteLogout,

        ctx:
          Auth,
      },
      {
        name:
          "Auth.signOutRemote",

        fn:
          Auth?.signOutRemote,

        ctx:
          Auth,
      },
      {
        name:
          "Auth.revokeSession",

        fn:
          Auth?.revokeSession,

        ctx:
          Auth,
      },
      {
        name:
          "Auth.api.logout",

        fn:
          Auth?.api?.logout,

        ctx:
          Auth?.api,
      },
      {
        name:
          "Auth.client.logout",

        fn:
          Auth?.client?.logout,

        ctx:
          Auth?.client,
      },
    ].filter((item) =>
      isFunction(item.fn)
    );

  const fallback =
    [
      {
        name:
          "Auth.logout",

        fn:
          Auth?.logout,

        ctx:
          Auth,
      },
      {
        name:
          "Auth.signOut",

        fn:
          Auth?.signOut,

        ctx:
          Auth,
      },
    ].filter((item) =>
      isFunction(item.fn)
    );

  return primary.length
    ? primary
    : fallback;
}

async function runRemoteLogout({
  Auth,
  AppCore,
} = {}) {
  const resolvedAuth =
    resolveAuth(
      Auth,
      AppCore
    );

  const candidates =
    getRemoteLogoutCandidates(resolvedAuth);

  if (!candidates.length) {
    const result =
      {
        attempted:
          false,

        ok:
          false,

        method:
          "",

        error:
          null,
      };

    safeEmit(
      AppCore,
      EVENTS.logoutRemoteSkipped,
      result
    );

    return result;
  }

  safeEmit(
    AppCore,
    EVENTS.logoutRemoteStart,
    {
      candidates:
        candidates.map((item) => item.name),
    }
  );

  const options =
    {
      silent:
        true,

      notifyServer:
        true,

      remote:
        true,

      remoteOnly:
        true,

      source:
        "sidebar",

      reason:
        "sidebar-logout",

      local:
        false,

      clearLocal:
        false,

      navigate:
        false,

      redirect:
        false,

      replaceState:
        false,

      emit:
        false,
    };

  let lastError =
    null;

  for (const candidate of candidates) {
    const methodName =
      candidate.name ||
      candidate.fn?.name ||
      "anonymous";

    try {
      await withTimeout(
        Promise.resolve(
          candidate.fn.call(
            candidate.ctx || resolvedAuth,
            options
          )
        ),
        REMOTE_LOGOUT_TIMEOUT_MS,
        methodName
      );

      const result =
        {
          attempted:
            true,

          ok:
            true,

          method:
            methodName,

          error:
            null,
        };

      safeEmit(
        AppCore,
        EVENTS.logoutRemoteSuccess,
        result
      );

      return result;
    } catch (error) {
      lastError =
        error;

      safeWarn(
        AppCore,
        `Logout remoto falló en ${methodName}.`,
        error
      );
    }
  }

  const result =
    {
      attempted:
        true,

      ok:
        false,

      method:
        "",

      error:
        cloneError(lastError),
    };

  safeEmit(
    AppCore,
    EVENTS.logoutRemoteError,
    result
  );

  return result;
}

/* =========================================================
   MAIN LOGOUT FLOW
========================================================= */

async function runLogoutFlow({
  AppCore,
  Auth,
  Router,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation: closeMobileFn,
  syncSidebarState,
  getElements,
  setLogoutInFlight,
} = {}) {
  const generation =
    ++logoutGeneration;

  const startedAt =
    nowTs();

  const resolvedAuth =
    resolveAuth(
      Auth,
      AppCore
    );

  const resolvedRouter =
    resolveRouter(
      Router,
      AppCore
    );

  const elements =
    isFunction(getElements)
      ? safeObject(getElements())
      : {};

  const controlsSnapshot =
    captureControlsState(elements);

  try {
    setLogoutInFlight?.(true);
  } catch {}

  setControlsDisabled(
    elements,
    true
  );

  try {
    closeDropdown?.(
      {
        force:
          true,

        reason:
          "logout:start",
      }
    );
  } catch {
    try {
      closeDropdown?.();
    } catch {}
  }

  safeSetLoading(
    AppCore,
    true
  );

  safeEmit(
    AppCore,
    EVENTS.logoutStart,
    {
      source:
        "sidebar",

      generation,
      timestamp:
        startedAt,

      version:
        SIDEBAR_ACTIONS_VERSION,
    }
  );

  let remoteResult =
    {
      attempted:
        false,

      ok:
        false,

      method:
        "",

      error:
        null,
    };

  let localResult =
    {
      authCleared:
        false,

      coreCleared:
        false,

      authHeadersCleared:
        false,

      storageRemoved:
        0,

      appCoreStorageRemoved:
        0,

      scannedStorageRemoved:
        0,

      cookiesCleared:
        0,
    };

  let navigationOk =
    false;

  try {
    remoteResult =
      await runRemoteLogout(
        {
          Auth:
            resolvedAuth,

          AppCore,
        }
      );

    /*
      Limpieza local obligatoria aunque remoto falle.
    */
    localResult =
      await clearSessionEverywhere(
        {
          Auth:
            resolvedAuth,

          AppCore,
        }
      );

    syncSidebarAfterLogout(
      {
        AppCore,
        closeDropdown,
        renderUser,
        applyRoleVisibility,
        closeSidebarOnMobileAfterNavigation:
          closeMobileFn,
        syncSidebarState,
      }
    );

    hideGlobalLoader(
      AppCore,
      "sidebar:logout:local-cleared"
    );

    if (LOCAL_CLEAR_SETTLE_MS >= 0) {
      await sleep(LOCAL_CLEAR_SETTLE_MS);
    }

    navigationOk =
      await navigateToLogin(
        {
          AppCore,
          Router:
            resolvedRouter,
        }
      );

    const result =
      {
        ok:
          true,

        generation,

        remote:
          remoteResult,

        local:
          localResult,

        navigationOk,

        durationMs:
          nowTs() - startedAt,
      };

    safeEmit(
      AppCore,
      EVENTS.logoutComplete,
      result
    );

    return result;
  } catch (error) {
    safeError(
      AppCore,
      "Logout fatal inesperado.",
      error
    );

    try {
      localResult =
        await clearSessionEverywhere(
          {
            Auth:
              resolvedAuth,

            AppCore,
          }
        );
    } catch (clearError) {
      safeError(
        AppCore,
        "Limpieza local final también falló.",
        clearError
      );
    }

    try {
      syncSidebarAfterLogout(
        {
          AppCore,
          closeDropdown,
          renderUser,
          applyRoleVisibility,
          closeSidebarOnMobileAfterNavigation:
            closeMobileFn,
          syncSidebarState,
        }
      );
    } catch {}

    try {
      hideGlobalLoader(
        AppCore,
        "sidebar:logout:error"
      );
    } catch {}

    try {
      navigationOk =
        await navigateToLogin(
          {
            AppCore,
            Router:
              resolvedRouter,
          }
        );
    } catch {}

    const result =
      {
        ok:
          false,

        generation,

        error:
          cloneError(error),

        message:
          safeText(
            error?.message,
            "No se pudo cerrar sesión correctamente."
          ),

        remote:
          remoteResult,

        local:
          localResult,

        navigationOk,

        durationMs:
          nowTs() - startedAt,
      };

    safeEmit(
      AppCore,
      EVENTS.logoutError,
      result
    );

    return result;
  } finally {
    try {
      setLogoutInFlight?.(false);
    } catch {}

    restoreControlsState(
      controlsSnapshot
    );

    hideGlobalLoader(
      AppCore,
      "sidebar:logout:finally"
    );

    safeEmit(
      AppCore,
      EVENTS.logoutFinally,
      {
        generation,
        durationMs:
          nowTs() - startedAt,
      }
    );
  }
}

/* =========================================================
   MAIN LOGOUT ACTION
========================================================= */

export async function handleLogout({
  AppCore,
  Auth,
  Router,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation,
  syncSidebarState,
  getElements,
  setLogoutInFlight,
  isLogoutInFlight,
} = {}) {
  if (logoutPromise) {
    safeEmit(
      AppCore,
      EVENTS.actionComplete,
      {
        action:
          "handleLogout",

        skipped:
          true,

        reason:
          "logout-promise-in-flight",
      }
    );

    return logoutPromise;
  }

  if (
    isFunction(isLogoutInFlight) &&
    isLogoutInFlight()
  ) {
    const result =
      {
        ok:
          false,

        skipped:
          true,

        reason:
          "logout-in-flight",
      };

    safeEmit(
      AppCore,
      EVENTS.actionComplete,
      {
        action:
          "handleLogout",

        ...result,
      }
    );

    return result;
  }

  logoutPromise =
    runLogoutFlow(
      {
        AppCore,
        Auth,
        Router,
        closeDropdown,
        renderUser,
        applyRoleVisibility,
        closeSidebarOnMobileAfterNavigation,
        syncSidebarState,
        getElements,
        setLogoutInFlight,
      }
    );

  try {
    return await logoutPromise;
  } finally {
    logoutPromise =
      null;
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarActionsSnapshot() {
  return {
    version:
      SIDEBAR_ACTIONS_VERSION,

    logoutInFlight:
      Boolean(logoutPromise),

    logoutGeneration,

    remoteTimeoutMs:
      REMOTE_LOGOUT_TIMEOUT_MS,

    loginRoute:
      LOGIN_ROUTE,

    mobile:
      (() => {
        try {
          return isMobileViewport();
        } catch {
          return false;
        }
      })(),

    events:
      EVENTS,

    exports:
      [
        "setSidebarOpen",
        "openSidebar",
        "closeSidebar",
        "toggleSidebar",
        "collapseSidebar",
        "expandSidebar",
        "ensureSidebarOpenForUserMenu",
        "closeSidebarOnMobileAfterNavigation",
        "navigateFromSidebar",
        "handleLogout",
        "getSidebarActionsSnapshot",
      ],
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_ACTIONS_VERSION,

  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,
  collapseSidebar,
  expandSidebar,

  ensureSidebarOpenForUserMenu,
  closeSidebarOnMobileAfterNavigation,

  navigateFromSidebar,

  handleLogout,
  getSidebarActionsSnapshot,
};

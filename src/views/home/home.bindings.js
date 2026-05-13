/* =========================================================
   Onion SPA - Home Bindings
   Archivo: src/views/home/home.bindings.js

   ONION SUPPORT · HOME BINDINGS
   FINAL PRO SYSTEM · DELEGATED DOM · CLEAN REBIND · MODULAR HOME · 11/10

   Responsabilidades:
   - Bind DOM robusto y seguro para Home.
   - Refresh / retry dashboard.
   - Export CSV.
   - Open widget / bloque.
   - Copy widget id.
   - Quick actions / navegación.
   - Create shortcuts.
   - Rebind limpio tras rerender.
   - Cleanup sólido por scope.
   - Tolerar AppCore.cleanup parcial o ausente.
   - Evitar doble click handlers.
   - Soportar botones dinámicos.
   - Delegación premium.
   - Browser guards.
   - Bloqueo de targets hidden / inert / disabled.
   - Soporte data-action y data-home-action.
   - Soporte botones directos + delegados.
   - Busy state durante acciones async.
   - Rutas internas seguras.
   - Sin CSS inline.
   - Sin Object.assign(style).
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_BINDINGS_VERSION = "11.0.0";

const SOURCE = "views:home:home.bindings";
const DEFAULT_SCOPE = "view:home";

const DEFAULT_HOME_ROUTE = "/";
const DEFAULT_CREATE_ROUTE = "/incidencias/nueva";

const DIRECT_BUTTON_IDS = Object.freeze({
  refresh: "home-refresh-btn",
  retry: "home-retry-btn",
  export: "home-export-btn",
  create: "home-create-ticket-btn",
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
  "/billing": "/facturas",
  "/bills": "/facturas",
  "/bill": "/facturas",

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

const ACTION_SELECTOR = [
  "[data-action]",
  "[data-home-action]",
  "[data-quick-action]",
  "[data-route]",
  "[data-href]",
  "[data-widget-id]",
  "[data-widget-key]",
  "[data-entity-id]",
  "[data-home-bindable='true']",
].join(",");

const KEYBOARD_SELECTOR = [
  "[role='button'][data-action]",
  "[role='button'][data-home-action]",
  "[role='button'][data-quick-action]",
  "[tabindex][data-action]",
  "[tabindex][data-home-action]",
  "[tabindex][data-quick-action]",
  "[tabindex][data-route]",
  "[tabindex][data-href]",
].join(",");

const REFRESH_ACTIONS = new Set([
  "refresh",
  "reload",
  "retry",
  "actualizar",
  "refresh_home",
  "reload_home",
  "retry_home",
  "dashboard_refresh",
  "dashboard_reload",
]);

const EXPORT_ACTIONS = new Set([
  "export",
  "export_csv",
  "export_home",
  "export_home_csv",
  "download_csv",
  "csv",
]);

const OPEN_WIDGET_ACTIONS = new Set([
  "open",
  "open_widget",
  "open_home_widget",
  "open_block",
  "open_kpi",
  "widget_open",
  "detail",
  "details",
]);

const COPY_WIDGET_ACTIONS = new Set([
  "copy",
  "copy_id",
  "copy_widget_id",
  "copy_home_widget_id",
  "copy_key",
  "copy_ref",
]);

const QUICK_ACTIONS = new Set([
  "quick",
  "quick_action",
  "run_quick",
  "run_home_quick_action",
  "run_action",
]);

const NAVIGATE_ACTIONS = new Set([
  "navigate",
  "navigate_home",
  "go",
  "go_home",
  "go_dashboard",
  "go_incidencias",
  "go_tickets",
  "go_facturas",
  "go_invoices",
  "go_usuarios",
  "go_users",
  "go_clientes",
  "go_clients",
  "go_cuenta",
  "go_account",
  "go_ajustes",
  "go_settings",
  "open_route",
]);

const CREATE_ACTIONS = new Set([
  "create",
  "new",
  "new_ticket",
  "new_incidencia",
  "create_ticket",
  "create_incidencia",
  "open_create",
  "open_create_ticket",
  "open_create_incidencia",
]);

const SENSITIVE_KEYS = Object.freeze([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "tempToken",
  "temp_token",
  "password",
  "secret",
  "authorization",
  "credential",
  "credentials",
]);

/* =========================================================
   LOCAL RUNTIME
========================================================= */

const localCleanups = new Map();
const busyElements = new WeakMap();

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isElement(value) {
  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.closest === "function"
    );
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[HomeBindings]", ...args);
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn("[HomeBindings]", ...args);
    }
  } catch {}
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[HomeBindings]", ...args);
  } catch {}
}

/* =========================================================
   SANITIZE / EVENTS
========================================================= */

function redactTokenInText(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  try {
    if (isFn(AppCore?.utils?.redactTokenInText)) {
      return AppCore.utils.redactTokenInText(raw);
    }
  } catch {}

  let output = raw;

  try {
    output = output.replace(
      /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)([^&#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );
  } catch {}

  return output;
}

function sanitizeEventPayload(value, depth = 0) {
  if (depth > 6) {
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
    return redactTokenInText(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactTokenInText(safeText(value.message, "")),
      code: value.code || null,
      status: value.status || value.statusCode || null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) => sanitizeEventPayload(item, depth + 1));
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        SENSITIVE_KEYS.includes(key) ||
        /token|secret|password|authorization|credential/i.test(key)
      ) {
        output[key] = item ? "***" : null;
        continue;
      }

      output[key] = sanitizeEventPayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = sanitizeEventPayload({
    source: SOURCE,
    version: HOME_BINDINGS_VERSION,
    ...safeObject(payload),
  });

  const opts = safeObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, cleanPayload);
      busEmitted = true;
    }
  } catch {}

  if (opts.window === true || (!busAvailable && isBrowser())) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: cleanPayload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   SCOPE / CLEANUP
========================================================= */

function resolveScopeName(scope = DEFAULT_SCOPE) {
  if (typeof scope === "string") {
    return safeText(scope, DEFAULT_SCOPE);
  }

  if (isObject(scope)) {
    return safeText(
      scope.name ||
        scope.scope ||
        scope.id ||
        scope.key,
      DEFAULT_SCOPE
    );
  }

  return DEFAULT_SCOPE;
}

function pushLocalCleanup(scope, cleanup) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName = resolveScopeName(scope);
  const bucket = localCleanups.get(scopeName) || [];

  bucket.push(cleanup);
  localCleanups.set(scopeName, bucket);
}

function runLocalCleanups(scope) {
  const scopeName = resolveScopeName(scope);
  const bucket = localCleanups.get(scopeName) || [];

  bucket.forEach((cleanup) => {
    try {
      cleanup?.();
    } catch {}
  });

  localCleanups.delete(scopeName);
}

function cleanupScope(scope = DEFAULT_SCOPE) {
  const scopeName = resolveScopeName(scope);

  try {
    AppCore?.cleanup?.run?.(scopeName);
  } catch {}

  try {
    AppCore?.cleanup?.dispose?.(scopeName);
  } catch {}

  runLocalCleanups(scopeName);

  return true;
}

function prepareScope(scope = DEFAULT_SCOPE) {
  const scopeName = resolveScopeName(scope);

  cleanupScope(scopeName);

  try {
    AppCore?.cleanup?.scope?.(scopeName);
  } catch {}

  return scopeName;
}

function bindOn(scope, target, eventName, handler, options = undefined) {
  const scopeName = resolveScopeName(scope);

  if (!target || !eventName || !isFn(handler)) {
    return () => {};
  }

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      const maybeCleanup = AppCore.cleanup.on(
        scopeName,
        target,
        eventName,
        handler,
        options
      );

      if (isFn(maybeCleanup)) {
        pushLocalCleanup(scopeName, maybeCleanup);
        return maybeCleanup;
      }

      return () => {};
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);

    const cleanup = () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    };

    pushLocalCleanup(scopeName, cleanup);

    return cleanup;
  } catch {
    return () => {};
  }
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getContainer(explicitContainer = null) {
  if (!isBrowser()) {
    return null;
  }

  if (explicitContainer && isElement(explicitContainer)) {
    return explicitContainer;
  }

  try {
    const fromCore = AppCore?.dom?.viewContainer;

    if (fromCore && document.contains(fromCore)) {
      return fromCore;
    }
  } catch {}

  try {
    return (
      document.getElementById("view-container") ||
      document.querySelector("[data-view-root]") ||
      document.querySelector("[data-router-view]") ||
      document
    );
  } catch {
    return document;
  }
}

function contains(root, node) {
  if (!root || !node) {
    return false;
  }

  try {
    if (root === document) {
      return true;
    }

    return root === node || root.contains(node);
  } catch {
    return false;
  }
}

function closestFromEvent(event, selector, root = null) {
  const target = event?.target || null;

  if (!isElement(target)) {
    return null;
  }

  let element = null;

  try {
    element = target.closest(selector);
  } catch {
    element = null;
  }

  if (!element) {
    return null;
  }

  if (root && !contains(root, element)) {
    return null;
  }

  return element;
}

function getById(id = "") {
  if (!isBrowser()) {
    return null;
  }

  const cleanId = safeText(id, "");

  if (!cleanId) {
    return null;
  }

  try {
    return document.getElementById(cleanId);
  } catch {
    return null;
  }
}

function getAnyActionElement(event, root = null) {
  return closestFromEvent(event, ACTION_SELECTOR, root);
}

function getDatasetValue(element = null, ...names) {
  if (!element) {
    return "";
  }

  for (const name of names) {
    const key = safeText(name, "");

    if (!key) {
      continue;
    }

    try {
      const datasetValue = element.dataset?.[key];

      if (datasetValue !== undefined && datasetValue !== null && datasetValue !== "") {
        return safeText(datasetValue, "");
      }
    } catch {}

    try {
      const attrName = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const attrValue = element.getAttribute?.(`data-${attrName}`);

      if (attrValue !== undefined && attrValue !== null && attrValue !== "") {
        return safeText(attrValue, "");
      }
    } catch {}
  }

  return "";
}

function getActionName(element = null) {
  return normalizeKey(
    first(
      getDatasetValue(element, "homeAction"),
      getDatasetValue(element, "action"),
      getDatasetValue(element, "quickAction"),
      getDatasetValue(element, "actionName"),
      ""
    )
  );
}

function getQuickActionName(element = null) {
  return normalizeKey(
    first(
      getDatasetValue(element, "quickAction"),
      getDatasetValue(element, "actionName"),
      getDatasetValue(element, "homeAction"),
      getDatasetValue(element, "action"),
      ""
    )
  );
}

function getClosestSourceElement(element = null, selector = "") {
  if (!element || !selector) {
    return element;
  }

  try {
    return element.closest?.(selector) || element;
  } catch {
    return element;
  }
}

function getWidgetSourceElement(element = null) {
  return getClosestSourceElement(
    element,
    "[data-widget-id], [data-widget-key], [data-entity-id], [data-key]"
  );
}

function getWidgetId(element = null) {
  const source = getWidgetSourceElement(element);

  return safeText(
    first(
      getDatasetValue(element, "widgetId"),
      getDatasetValue(element, "widgetKey"),
      getDatasetValue(element, "entityId"),
      getDatasetValue(element, "key"),

      getDatasetValue(source, "widgetId"),
      getDatasetValue(source, "widgetKey"),
      getDatasetValue(source, "entityId"),
      getDatasetValue(source, "key")
    ),
    ""
  );
}

function getRouteSourceElement(element = null) {
  return getClosestSourceElement(
    element,
    "[data-route], [data-href], [href]"
  );
}

function getRouteFromElement(element = null) {
  const source = getRouteSourceElement(element);

  return safeText(
    first(
      getDatasetValue(element, "route"),
      getDatasetValue(element, "href"),
      element?.getAttribute?.("href"),

      getDatasetValue(source, "route"),
      getDatasetValue(source, "href"),
      source?.getAttribute?.("href")
    ),
    ""
  );
}

function getFilenameFromElement(element = null) {
  return safeText(
    first(
      getDatasetValue(element, "filename"),
      getDatasetValue(element, "fileName"),
      getDatasetValue(element, "exportFilename"),
      ""
    ),
    ""
  );
}

function getExportModeFromElement(element = null) {
  return normalizeKey(
    first(
      getDatasetValue(element, "exportMode"),
      getDatasetValue(element, "mode"),
      getDatasetValue(element, "collection"),
      "widgets"
    )
  );
}

function getPayloadFromDataset(element = null) {
  const raw = safeText(
    first(
      getDatasetValue(element, "payload"),
      getDatasetValue(element, "json"),
      getDatasetValue(element, "data"),
      ""
    ),
    ""
  );

  if (!raw) {
    return {};
  }

  try {
    return safeObject(JSON.parse(raw));
  } catch (error) {
    safeWarn("payload JSON inválido.", error);
    return {};
  }
}

/* =========================================================
   TARGET GUARDS
========================================================= */

function isModifiedClick(event) {
  return Boolean(
    event?.metaKey ||
      event?.ctrlKey ||
      event?.shiftKey ||
      event?.altKey ||
      event?.button === 1
  );
}

function isDisabledElement(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.disabled === true ||
      element.getAttribute?.("aria-disabled") === "true" ||
      element.getAttribute?.("data-disabled") === "true" ||
      element.closest?.("[disabled]") ||
      element.closest?.("[aria-disabled='true']") ||
      element.closest?.("[data-disabled='true']")
  );
}

function isHiddenElement(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.hidden === true ||
      element.getAttribute?.("aria-hidden") === "true" ||
      element.closest?.("[hidden]") ||
      element.closest?.("[inert]") ||
      element.closest?.("[aria-hidden='true']") ||
      element.closest?.("[data-home-hidden='true']") ||
      element.closest?.("[data-visible='false']")
  );
}

function shouldIgnoreEventTarget(element = null) {
  return Boolean(
    !element ||
      isDisabledElement(element) ||
      isHiddenElement(element)
  );
}

function setElementBusy(element = null, busy = false) {
  if (!element) {
    return;
  }

  const value = Boolean(busy);

  if (value && !busyElements.has(element)) {
    busyElements.set(element, {
      disabled:
        "disabled" in element
          ? Boolean(element.disabled)
          : null,
      ariaBusy: element.getAttribute?.("aria-busy"),
      ariaDisabled: element.getAttribute?.("aria-disabled"),
    });
  }

  const previous = busyElements.get(element) || {};

  try {
    if (value) {
      element.setAttribute("aria-busy", "true");
    } else if (previous.ariaBusy === null || previous.ariaBusy === undefined) {
      element.removeAttribute("aria-busy");
    } else {
      element.setAttribute("aria-busy", previous.ariaBusy);
    }
  } catch {}

  try {
    element.classList.toggle("is-busy", value);
    element.classList.toggle("is-loading", value);
    element.classList.toggle("is-processing", value);
  } catch {}

  try {
    if (
      "disabled" in element &&
      (
        element.tagName === "BUTTON" ||
        element.tagName === "INPUT" ||
        element.tagName === "SELECT"
      )
    ) {
      element.disabled = value ? true : Boolean(previous.disabled);
    }
  } catch {}

  if (!value) {
    try {
      busyElements.delete(element);
    } catch {}
  }
}

async function withBusy(element, fn) {
  if (!isFn(fn)) {
    return null;
  }

  if (element?.getAttribute?.("aria-busy") === "true") {
    return false;
  }

  setElementBusy(element, true);

  try {
    return await fn();
  } finally {
    setElementBusy(element, false);
  }
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

function isUnsafeRoute(route = "") {
  const value = safeText(route, "").toLowerCase();

  return Boolean(
    !value ||
      value === "#" ||
      value.startsWith("javascript:") ||
      value.startsWith("data:") ||
      value.startsWith("vbscript:")
  );
}

function isExternalRoute(route = "") {
  const value = safeText(route, "");

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    if (!isBrowser()) {
      return true;
    }

    return new URL(value).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function normalizePathnameOnly(pathname = DEFAULT_HOME_ROUTE) {
  let value = safeText(pathname, DEFAULT_HOME_ROUTE)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = DEFAULT_HOME_ROUTE;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_HOME_ROUTE;
  }

  return value;
}

function normalizeInternalRoute(route = "") {
  const value = safeText(route, "");

  if (isUnsafeRoute(value) || isExternalRoute(value)) {
    return "";
  }

  if (value.startsWith("?") || value.startsWith("#")) {
    return value;
  }

  const raw = value.startsWith("/")
    ? value
    : `/${value}`;

  const [pathWithMaybeQuery, hash = ""] = raw.split("#");
  const [path, query = ""] = pathWithMaybeQuery.split("?");

  const cleanPath = normalizePathnameOnly(path || DEFAULT_HOME_ROUTE);
  const mappedPath = ROUTE_ALIASES[cleanPath] || cleanPath;

  return [
    mappedPath,
    query ? `?${query}` : "",
    hash ? `#${hash}` : "",
  ].join("");
}

/* =========================================================
   ACTION FALLBACKS
========================================================= */

async function safeReload({
  reload,
  loadHomeDashboard,
} = {}) {
  try {
    if (isFn(reload)) {
      await reload({
        force: true,
        asRefresh: true,
        silent: false,
      });

      return true;
    }

    if (isFn(loadHomeDashboard)) {
      await loadHomeDashboard({
        force: true,
        returnStaleOnError: true,
      });

      safeEmit("home:reload", {
        reason: "bindings:loadHomeDashboard",
      });

      return true;
    }
  } catch (error) {
    safeWarn("reload falló.", error);
  }

  return false;
}

async function safeNavigate({
  route = "",
  navigateFromHomeAction,
  silent = false,
  payload = {},
} = {}) {
  const target = normalizeInternalRoute(route);

  if (!target) {
    return false;
  }

  try {
    if (isFn(navigateFromHomeAction)) {
      return await navigateFromHomeAction({
        route: target,
        silent,
        payload,
      });
    }
  } catch (error) {
    safeWarn("navigateFromHomeAction falló.", error);
  }

  safeEmit("home:navigate", {
    route: target,
    payload,
  });

  try {
    const router =
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.get?.("router") ||
      AppCore?.modules?.get?.("Router");

    if (isFn(router?.navigate)) {
      await router.navigate(target, {
        source: SOURCE,
      });

      return true;
    }

    if (isFn(router?.go)) {
      await router.go(target, {
        source: SOURCE,
      });

      return true;
    }

    if (isFn(AppCore?.navigate)) {
      await AppCore.navigate(target, {
        source: SOURCE,
      });

      return true;
    }
  } catch (error) {
    safeWarn("fallback router navigation falló.", error);
  }

  try {
    if (isBrowser()) {
      window.history.pushState(
        {
          path: target,
          publicPath: target,
          source: SOURCE,
        },
        "",
        target
      );

      try {
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.dispatchEvent(new Event("popstate"));
      }

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function handleRefresh({
  event,
  element,
  reload,
  loadHomeDashboard,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  safeEmit("home:ui:refresh", {
    reason: "bindings",
  });

  return withBusy(
    element,
    () =>
      safeReload({
        reload,
        loadHomeDashboard,
      })
  );
}

async function handleExport({
  event,
  element,
  exportHomeCsvAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!isFn(exportHomeCsvAction)) {
    safeWarn("exportHomeCsvAction no disponible.");
    return false;
  }

  const filename = getFilenameFromElement(element);
  const mode = getExportModeFromElement(element);

  return withBusy(
    element,
    async () => {
      try {
        await exportHomeCsvAction({
          filename: filename || undefined,
          mode: mode || "widgets",
        });

        return true;
      } catch (error) {
        safeWarn("exportHomeCsvAction falló.", error);
        return false;
      }
    }
  );
}

async function handleOpenWidget({
  event,
  element,
  openHomeWidgetAction,
  navigateFromHomeAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const widgetId = getWidgetId(element);
  const route = normalizeInternalRoute(getRouteFromElement(element));
  const payload = getPayloadFromDataset(element);

  if (!widgetId && route) {
    return safeNavigate({
      route,
      navigateFromHomeAction,
      payload,
    });
  }

  if (!widgetId) {
    safeWarn("open-home-widget sin id.");
    return false;
  }

  if (!isFn(openHomeWidgetAction)) {
    safeWarn("openHomeWidgetAction no disponible.");

    if (route) {
      return safeNavigate({
        route,
        navigateFromHomeAction,
        payload,
      });
    }

    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await openHomeWidgetAction({
          widgetId,
          payload,
          navigate: Boolean(route),
        });

        return true;
      } catch (error) {
        safeWarn("openHomeWidgetAction falló.", error);

        if (route) {
          return safeNavigate({
            route,
            navigateFromHomeAction,
            payload,
          });
        }

        return false;
      }
    }
  );
}

async function handleCopyWidgetId({
  event,
  element,
  copyHomeWidgetIdAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const widgetId = getWidgetId(element);

  if (!widgetId) {
    safeWarn("copy-home-widget-id sin id.");
    return false;
  }

  if (!isFn(copyHomeWidgetIdAction)) {
    safeWarn("copyHomeWidgetIdAction no disponible.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await copyHomeWidgetIdAction({
          widgetId,
        });

        return true;
      } catch (error) {
        safeWarn("copyHomeWidgetIdAction falló.", error);
        return false;
      }
    }
  );
}

async function handleQuickAction({
  event,
  element,
  runHomeQuickAction,
  navigateFromHomeAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const action = getQuickActionName(element);
  const route = normalizeInternalRoute(getRouteFromElement(element));
  const payload = getPayloadFromDataset(element);

  if (!action && !route) {
    safeWarn("run-home-quick-action sin action ni route.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        if (isFn(runHomeQuickAction)) {
          await runHomeQuickAction({
            action,
            route,
            payload,
          });

          return true;
        }

        if (route) {
          return safeNavigate({
            route,
            navigateFromHomeAction,
            payload,
          });
        }

        safeEmit("home:quick-action", {
          action,
          route,
          payload,
        });

        return true;
      } catch (error) {
        safeWarn("runHomeQuickAction falló.", error);

        if (route) {
          return safeNavigate({
            route,
            navigateFromHomeAction,
            payload,
          });
        }

        return false;
      }
    }
  );
}

async function handleNavigate({
  event,
  element,
  navigateFromHomeAction,
}) {
  if (isModifiedClick(event)) {
    return false;
  }

  const route = normalizeInternalRoute(getRouteFromElement(element));
  const payload = getPayloadFromDataset(element);

  if (!route) {
    safeWarn("navigate-home sin route válido.");
    return false;
  }

  event?.preventDefault?.();
  event?.stopPropagation?.();

  return withBusy(
    element,
    () =>
      safeNavigate({
        route,
        navigateFromHomeAction,
        payload,
      })
  );
}

async function handleCreate({
  event,
  element,
  createFromHomeAction,
  runHomeQuickAction,
  navigateFromHomeAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const route =
    normalizeInternalRoute(getRouteFromElement(element)) ||
    DEFAULT_CREATE_ROUTE;

  const payload = getPayloadFromDataset(element);

  return withBusy(
    element,
    async () => {
      try {
        if (isFn(createFromHomeAction)) {
          await createFromHomeAction({
            route,
            payload,
          });

          return true;
        }

        if (isFn(runHomeQuickAction)) {
          await runHomeQuickAction({
            action: "create",
            route,
            payload,
          });

          return true;
        }

        safeEmit("home:create", {
          route,
          payload,
        });

        safeEmit("incidencias:create-modal:open", {
          draft: payload,
          source: SOURCE,
        });

        return safeNavigate({
          route,
          navigateFromHomeAction,
          payload,
          silent: true,
        });
      } catch (error) {
        safeWarn("createFromHomeAction falló.", error);
        return false;
      }
    }
  );
}

/* =========================================================
   DIRECT BUTTONS
========================================================= */

function bindDirectButton({
  scope,
  id,
  handler,
}) {
  const element = getById(id);

  if (!element || !isFn(handler)) {
    return false;
  }

  bindOn(
    scope,
    element,
    "click",
    async (event) => {
      if (shouldIgnoreEventTarget(element)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      await handler(event, element);
    }
  );

  return true;
}

/* =========================================================
   DELEGATED CLICK
========================================================= */

function resolveActionKind(element = null) {
  const action = getActionName(element);

  if (REFRESH_ACTIONS.has(action)) {
    return "refresh";
  }

  if (EXPORT_ACTIONS.has(action)) {
    return "export";
  }

  if (OPEN_WIDGET_ACTIONS.has(action)) {
    return "open-widget";
  }

  if (COPY_WIDGET_ACTIONS.has(action)) {
    return "copy-widget-id";
  }

  if (QUICK_ACTIONS.has(action)) {
    return "quick-action";
  }

  if (CREATE_ACTIONS.has(action)) {
    return "create";
  }

  if (NAVIGATE_ACTIONS.has(action)) {
    return "navigate";
  }

  if (!action && getWidgetId(element)) {
    return "open-widget";
  }

  if (!action && normalizeInternalRoute(getRouteFromElement(element))) {
    return "navigate";
  }

  return "";
}

function bindDelegatedClick({
  scope,
  root,
  loadHomeDashboard,
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  createFromHomeAction,
  reload,
}) {
  if (!root) {
    return false;
  }

  bindOn(
    scope,
    root,
    "click",
    async (event) => {
      if (event.defaultPrevented) {
        return;
      }

      const element = getAnyActionElement(event, root);

      if (!element) {
        return;
      }

      if (shouldIgnoreEventTarget(element)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const kind = resolveActionKind(element);

      if (!kind) {
        return;
      }

      if (kind === "refresh") {
        await handleRefresh({
          event,
          element,
          reload,
          loadHomeDashboard,
        });

        return;
      }

      if (kind === "export") {
        await handleExport({
          event,
          element,
          exportHomeCsvAction,
        });

        return;
      }

      if (kind === "open-widget") {
        await handleOpenWidget({
          event,
          element,
          openHomeWidgetAction,
          navigateFromHomeAction,
        });

        return;
      }

      if (kind === "copy-widget-id") {
        await handleCopyWidgetId({
          event,
          element,
          copyHomeWidgetIdAction,
        });

        return;
      }

      if (kind === "quick-action") {
        await handleQuickAction({
          event,
          element,
          runHomeQuickAction,
          navigateFromHomeAction,
        });

        return;
      }

      if (kind === "create") {
        await handleCreate({
          event,
          element,
          createFromHomeAction,
          runHomeQuickAction,
          navigateFromHomeAction,
        });

        return;
      }

      if (kind === "navigate") {
        await handleNavigate({
          event,
          element,
          navigateFromHomeAction,
        });
      }
    }
  );

  return true;
}

/* =========================================================
   KEYBOARD A11Y
========================================================= */

function bindKeyboardActivation({
  scope,
  root,
}) {
  if (!root) {
    return false;
  }

  bindOn(
    scope,
    root,
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const target = event.target;

      if (!isElement(target)) {
        return;
      }

      const actionElement = target.closest?.(KEYBOARD_SELECTOR);

      if (
        !actionElement ||
        !contains(root, actionElement) ||
        shouldIgnoreEventTarget(actionElement)
      ) {
        return;
      }

      event.preventDefault();

      try {
        actionElement.click?.();
      } catch {}
    }
  );

  return true;
}

/* =========================================================
   EXTERNAL EVENT BRIDGES
========================================================= */

function bindExternalEvents({
  scope,
  reload,
  loadHomeDashboard,
} = {}) {
  const events = [
    "home:bindings:refresh",
    "home:bindings:reload",
    "dashboard:summary:updated",
  ];

  events.forEach((eventName) => {
    const handler = () => {
      void safeReload({
        reload,
        loadHomeDashboard,
      });
    };

    try {
      if (isFn(AppCore?.events?.on)) {
        const off = AppCore.events.on(eventName, handler);

        if (isFn(off)) {
          pushLocalCleanup(scope, off);
        } else {
          pushLocalCleanup(scope, () => {
            try {
              AppCore?.events?.off?.(eventName, handler);
            } catch {}
          });
        }

        return;
      }
    } catch {}

    if (isBrowser()) {
      bindOn(scope, window, eventName, handler);
    }
  });

  return true;
}

/* =========================================================
   MAIN
========================================================= */

export function bindHomeEvents({
  loadHomeDashboard,
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  createFromHomeAction,
  reload,
  scope = DEFAULT_SCOPE,
  container = null,
} = {}) {
  if (!isBrowser()) {
    return () => {};
  }

  const scopeName = prepareScope(scope);
  const root = getContainer(container);

  bindDirectButton({
    scope: scopeName,
    id: DIRECT_BUTTON_IDS.refresh,
    handler: (event, element) =>
      handleRefresh({
        event,
        element,
        reload,
        loadHomeDashboard,
      }),
  });

  bindDirectButton({
    scope: scopeName,
    id: DIRECT_BUTTON_IDS.retry,
    handler: (event, element) =>
      handleRefresh({
        event,
        element,
        reload,
        loadHomeDashboard,
      }),
  });

  bindDirectButton({
    scope: scopeName,
    id: DIRECT_BUTTON_IDS.export,
    handler: (event, element) =>
      handleExport({
        event,
        element,
        exportHomeCsvAction,
      }),
  });

  bindDirectButton({
    scope: scopeName,
    id: DIRECT_BUTTON_IDS.create,
    handler: (event, element) =>
      handleCreate({
        event,
        element,
        createFromHomeAction,
        runHomeQuickAction,
        navigateFromHomeAction,
      }),
  });

  bindDelegatedClick({
    scope: scopeName,
    root,
    loadHomeDashboard,
    openHomeWidgetAction,
    copyHomeWidgetIdAction,
    exportHomeCsvAction,
    navigateFromHomeAction,
    runHomeQuickAction,
    createFromHomeAction,
    reload,
  });

  bindKeyboardActivation({
    scope: scopeName,
    root,
  });

  bindExternalEvents({
    scope: scopeName,
    reload,
    loadHomeDashboard,
  });

  safeEmit("home:bindings:bound", {
    scope: scopeName,
    version: HOME_BINDINGS_VERSION,
    hasRoot: Boolean(root),
    rootIsDocument: root === document,
    hasRefreshBtn: Boolean(getById(DIRECT_BUTTON_IDS.refresh)),
    hasRetryBtn: Boolean(getById(DIRECT_BUTTON_IDS.retry)),
    hasExportBtn: Boolean(getById(DIRECT_BUTTON_IDS.export)),
    hasCreateBtn: Boolean(getById(DIRECT_BUTTON_IDS.create)),
    at: nowIso(),
  });

  safeLog("bound", {
    scope: scopeName,
    root,
  });

  return () => {
    cleanupScope(scopeName);

    safeEmit("home:bindings:unbound", {
      scope: scopeName,
      version: HOME_BINDINGS_VERSION,
      at: nowIso(),
    });
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getHomeBindingsSnapshot(scope = DEFAULT_SCOPE) {
  const scopeName = resolveScopeName(scope);

  return {
    version: HOME_BINDINGS_VERSION,
    source: SOURCE,
    scope: scopeName,

    browser: isBrowser(),

    localCleanupCount: localCleanups.get(scopeName)?.length || 0,

    hasAppCoreCleanup: Boolean(AppCore?.cleanup),
    hasCleanupOn: isFn(AppCore?.cleanup?.on),
    hasCleanupRun: isFn(AppCore?.cleanup?.run),

    hasContainer: Boolean(getContainer()),

    directButtons: {
      refresh: Boolean(getById(DIRECT_BUTTON_IDS.refresh)),
      retry: Boolean(getById(DIRECT_BUTTON_IDS.retry)),
      export: Boolean(getById(DIRECT_BUTTON_IDS.export)),
      create: Boolean(getById(DIRECT_BUTTON_IDS.create)),
    },

    at: nowIso(),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export const HomeBindings = Object.freeze({
  version: HOME_BINDINGS_VERSION,

  bindHomeEvents,

  getHomeBindingsSnapshot,
  getDebugSnapshot: getHomeBindingsSnapshot,
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default HomeBindings;

/* =========================================================
   Onion SPA - Login View Legacy Bridge
   Archivo: src/views/loginView.js

   AUTH VIEW LEGACY BRIDGE · CORE/APP/SHELL ALIGNED · 16/10

   RESPONSABILIDADES:
   - Mantener compatibilidad con imports legacy: src/views/loginView.js.
   - Delegar el render real en src/views/login/index.js.
   - Evitar dos orquestadores de login en paralelo.
   - Evitar doble Auth.login.
   - Evitar doble syncSession.
   - Evitar doble navegación post-login.
   - Evitar doble toast.
   - Preparar shell mínimo de auth-screen por compatibilidad.
   - Sincronizar html/body/shell/main/view sin estilos inline.
   - Ocultar chrome legacy: sidebar/topbar/tablehead, no app-shell.
   - Desbloquear loader global como fallback sin pelearse con loader.js.
   - Exponer API estable: render/init/destroy/mount/unmount/dispose.
   - Exponer snapshot debug seguro.
   - Tolerar default export function u object con render/init/mount.
   - Redactar tokens en eventos/logs/snapshots.

   REGLAS:
   - Este archivo NO ejecuta Auth.login.
   - Este archivo NO llama syncSession().
   - Este archivo NO decide redirect post-login.
   - Este archivo NO toca storage auth.
   - Este archivo NO usa CSS inline.
   - Este archivo NO renderiza toast inline.
   - El login real vive en src/views/login/index.js.
========================================================= */

import { AppCore } from "../core/index.js";

import LoginDefault, * as LoginModule from "./login/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_VIEW_BRIDGE_VERSION =
  "16.0.0-legacy-bridge";

const SOURCE =
  "LoginViewLegacyBridge";

const SCOPE =
  "view:login:legacy-bridge";

const DEFAULT_CONTAINER_ID =
  "view-container";

const DEFAULT_ROUTE =
  "/";

const LOGIN_ROUTE =
  "/login";

const RUNTIME_KEY =
  "__ONION_LOGIN_VIEW_BRIDGE__";

const EVENT_DEDUPE_MS =
  80;

const SNAPSHOT_MAX_CLASS_LENGTH =
  800;

const AUTH_SCREEN_CLASSES =
  Object.freeze([
    "auth-screen",
    "login-no-scroll",
    "route-auth",
    "route-shell-hidden",
    "route-chrome-hidden",
  ]);

const APP_SCREEN_CLASSES =
  Object.freeze([
    "route-app",
    "route-shell-visible",
    "route-chrome-visible",
  ]);

const LOADING_CLASSES =
  Object.freeze([
    "loading",
    "app-loading",
    "app-booting",
    "is-loading",
    "is-booting",
  ]);

const TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
    "resetToken",
    "reset_token",
    "passwordResetToken",
    "password_reset_token",
    "confirmToken",
    "confirm_token",
    "code",
    "t",
    "otp",
    "totp",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "authorization",
    "jwt",
    "session",
    "sid",
  ]);

const TOKEN_ROUTE_PATHS =
  Object.freeze([
    "/activate-account",
    "/activate",
    "/activation",
    "/account/activate",
    "/activate/first-user",
    "/reset-password/confirm",
    "/reset-password-confirm",
    "/password-reset/confirm",
    "/password-reset-confirm",
    "/confirm-reset-password",
  ]);

const DOM_IDS =
  Object.freeze({
    shell:
      "app-shell",

    main:
      "main-content",

    appContent:
      "app-content",

    view:
      "view-container",

    sidebarMount:
      "sidebar-mount",

    topbarMount:
      "topbar-mount",

    tablehead:
      "table-head",

    tableheadContainer:
      "tablehead-container",

    loader:
      "app-loader",
  });

const BRIDGE_EVENTS =
  Object.freeze({
    beforeRender:
      "login:view:before-render",

    rendered:
      "login:view:rendered",

    destroyed:
      "login:view:destroyed",

    error:
      "login:view:error",

    shellPrepared:
      "login:view:shell-prepared",

    debugReady:
      "login:view:debug-ready",
  });

/* =========================================================
   RUNTIME
========================================================= */

let activeController =
  null;

let activeContainer =
  null;

let activeEpoch =
  0;

let renderEpoch =
  0;

let renderInFlight =
  false;

let lastRenderAt =
  "";

let lastDestroyAt =
  "";

let lastError =
  null;

let lastEventKey =
  "";

let lastEventAt =
  0;

let debugBridgeReady =
  false;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isObjectLike(value) {
  return (
    value !== null &&
    (
      typeof value === "object" ||
      typeof value === "function"
    )
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoNow(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function isExtensibleTarget(value) {
  try {
    return (
      isObjectLike(value) &&
      Object.isExtensible(value)
    );
  } catch {}

  return false;
}

function safeDefineValue(target, key, value) {
  if (
    !target ||
    !key ||
    !isExtensibleTarget(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        enumerable: false,
        configurable: true,
        writable: true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] = value;
    return true;
  } catch {}

  return false;
}

function isDomNode(value) {
  if (
    !isBrowser() ||
    !value
  ) {
    return false;
  }

  try {
    return Boolean(
      value === document ||
        value === window ||
        value.nodeType === 1 ||
        value.nodeType === 9 ||
        value.nodeType === 11
    );
  } catch {
    return false;
  }
}

function isConnected(node) {
  if (
    !isBrowser() ||
    !node
  ) {
    return false;
  }

  try {
    if (
      node === document ||
      node === window
    ) {
      return true;
    }

    return Boolean(node.isConnected);
  } catch {}

  try {
    return document.contains(node);
  } catch {}

  return false;
}

function safeArrayFromClassList(classList) {
  try {
    return Array.from(classList || []);
  } catch {
    return [];
  }
}

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      output =
        output.replace(
          new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  for (const path of TOKEN_ROUTE_PATHS) {
    try {
      output =
        output.replace(
          new RegExp(`(${escapeRegExp(path)}\\/)([^/?#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  const source =
    error?.error ||
    error?.reason ||
    error;

  return {
    name:
      safeText(
        source?.name ||
          source?.constructor?.name,
        "Error"
      ),

    message:
      redactSensitiveText(
        safeText(
          source?.message ||
            source?.reason ||
            source,
          "Error"
        )
      ),

    status:
      source?.status ||
      source?.statusCode ||
      source?.response?.status ||
      0,

    code:
      source?.code ||
      source?.data?.code ||
      source?.response?.data?.code ||
      null,

    at:
      safeIsoNow(),
  };
}

function isDomNodeLike(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
        value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
        value.nodeName
    );
  } catch {}

  return false;
}

function sanitizePayload(value, depth = 0, seen = null) {
  if (!seen) {
    try {
      seen = new WeakSet();
    } catch {
      seen = null;
    }
  }

  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isDomNodeLike(value)) {
    return {
      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(
          value.className?.baseVal ||
            value.className,
          ""
        ).slice(0, SNAPSHOT_MAX_CLASS_LENGTH),
    };
  }

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (isObjectLike(value)) {
    try {
      if (
        seen &&
        seen.has(value)
      ) {
        return "[Circular]";
      }

      seen?.add?.(value);
    } catch {}
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1,
          seen
        )
      );
  }

  if (value instanceof Map) {
    return {
      type: "Map",
      size: value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type: "Set",
      size: value.size,
    };
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i.test(key)) {
        output[key] =
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
            ? item
            : "***";

        continue;
      }

      output[key] =
        sanitizePayload(
          item,
          depth + 1,
          seen
        );
    }

    return output;
  }

  return String(value);
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function safeLog(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    AppCore?.utils?.log?.(
      `[${SOURCE}]`,
      ...cleanArgs
    );

    return;
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.log(
        `[${SOURCE}]`,
        ...cleanArgs
      );
    }
  } catch {}
}

function safeWarn(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        `[${SOURCE}]`,
        ...cleanArgs
      );

      coreLogged =
        true;
    }
  } catch {
    coreLogged =
      false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn(
      `[${SOURCE}]`,
      ...cleanArgs
    );
  } catch {}
}

function safeError(...args) {
  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        `[${SOURCE}]`,
        ...cleanArgs
      );

      coreLogged =
        true;
    }
  } catch {
    coreLogged =
      false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.error(
      `[${SOURCE}]`,
      ...cleanArgs
    );
  } catch {}
}

function safeCreateCustomEvent(name = "", detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  const eventName =
    safeText(name, "");

  if (!eventName) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(
        eventName,
        {
          detail,
        }
      );
    }
  } catch {}

  try {
    const event =
      document.createEvent("CustomEvent");

    event.initCustomEvent(
      eventName,
      false,
      false,
      detail
    );

    return event;
  } catch {
    return null;
  }
}

function shouldDedupeEvent(eventName = "", payload = {}, force = false) {
  if (force) {
    return false;
  }

  const key =
    [
      safeText(eventName, ""),
      safeText(payload?.reason, ""),
      safeText(payload?.path, ""),
      safeText(payload?.containerId, ""),
      safeText(payload?.epoch, ""),
      payload?.ok === false ? "fail" : "ok",
    ].join("|");

  const current =
    safeNow();

  if (
    key === lastEventKey &&
    current - lastEventAt < EVENT_DEDUPE_MS
  ) {
    return true;
  }

  lastEventKey =
    key;

  lastEventAt =
    current;

  return false;
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    safeObject(options);

  if (
    opts.dedupe !== false &&
    shouldDedupeEvent(
      name,
      payload,
      opts.force === true
    )
  ) {
    return false;
  }

  const cleanPayload =
    sanitizePayload({
      source:
        SOURCE,

      version:
        LOGIN_VIEW_BRIDGE_VERSION,

      at:
        safeIsoNow(),

      ...safeObject(payload),
    });

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        cleanPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  /*
    Anti storm:
    Si existe AppCore.events, no duplicamos window.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      const event =
        safeCreateCustomEvent(
          name,
          cleanPayload
        );

      if (event) {
        window.dispatchEvent(event);
        return true;
      }
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   PATH / ROUTE HELPERS
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
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    safeText(pathname, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  const output =
    [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      output.pop();
      continue;
    }

    output.push(segment);
  }

  value =
    `/${output.join("/")}`;

  if (!value) {
    value =
      DEFAULT_ROUTE;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value;
}

function normalizeSearch(search = "") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw =
    safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return normalizeFullPath(
      raw.replace(/^#!\/?/, "/")
    );
  }

  return normalizeFullPath(
    raw.replace(/^#\/?/, "/")
  );
}

function splitFullPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function normalizeFullPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.origin !== getBaseOrigin()
      ) {
        return DEFAULT_ROUTE;
      }

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeHashRouterPath(parsed.hash);
      }

      return normalizeFullPath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {
    return DEFAULT_ROUTE;
  }

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function normalizePath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE) ||
    DEFAULT_ROUTE;

  const fallback =
    normalizeFullPath(raw);

  /*
    Con query/hash no delegamos: algunos normalizadores legacy destruyen token.
  */
  if (
    raw.includes("?") ||
    raw.includes("#")
  ) {
    return fallback;
  }

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const normalized =
        AppCore.utils.normalizePath(raw);

      if (normalized) {
        const clean =
          normalizeFullPath(normalized);

        if (
          fallback !== DEFAULT_ROUTE &&
          clean === DEFAULT_ROUTE
        ) {
          return fallback;
        }

        return clean;
      }
    }
  } catch {}

  return fallback;
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return (
    normalizePath(path)
      .split("?")[0]
      .split("#")[0] ||
    DEFAULT_ROUTE
  );
}

function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const full =
    normalizePath(path);

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(full);

  const parts =
    pathname
      .split("/")
      .filter(Boolean);

  if (
    parts.length > 0 &&
    /^@[A-Za-z0-9._-]{1,80}$/.test(parts[0])
  ) {
    const rest =
      parts.slice(1).join("/");

    return `${rest ? `/${rest}` : DEFAULT_ROUTE}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function getCurrentPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const pathname =
      window.location.pathname ||
      DEFAULT_ROUTE;

    const search =
      window.location.search ||
      "";

    const hash =
      window.location.hash ||
      "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function getCurrentCanonicalPath() {
  return stripSearchAndHash(
    stripUsernamePrefix(
      getCurrentPath()
    )
  );
}

function isLoginRoute(path = getCurrentPath()) {
  const clean =
    stripSearchAndHash(
      stripUsernamePrefix(path)
    );

  return (
    clean === LOGIN_ROUTE ||
    clean.startsWith(`${LOGIN_ROUTE}/`)
  );
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getById(id = "") {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function query(selector = "") {
  if (
    !isBrowser() ||
    !selector
  ) {
    return null;
  }

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function setAttribute(element, name, value) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
    ) {
      element.removeAttribute(name);
      return true;
    }

    element.setAttribute(
      name,
      String(value)
    );

    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key, value) {
  if (
    !element ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] =
      String(value);

    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className, enabled) {
  if (
    !element ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.toggle(
      className,
      Boolean(enabled)
    );

    return true;
  } catch {
    return false;
  }
}

function removeClasses(element, classNames = []) {
  if (!element) {
    return false;
  }

  try {
    for (const className of safeArray(classNames)) {
      if (className) {
        element.classList.remove(className);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function applyHidden(element, hidden = false) {
  if (!element) {
    return false;
  }

  const next =
    Boolean(hidden);

  try {
    element.hidden =
      next;
  } catch {}

  setAttribute(
    element,
    "aria-hidden",
    next ? "true" : "false"
  );

  return true;
}

function applyBusy(element, busy = false) {
  if (!element) {
    return false;
  }

  setAttribute(
    element,
    "aria-busy",
    Boolean(busy) ? "true" : "false"
  );

  return true;
}

function getShellElements() {
  if (!isBrowser()) {
    return {
      shell: null,
      main: null,
      appContent: null,
      view: null,
      sidebarMount: null,
      topbarMount: null,
      tablehead: null,
      tableheadContainer: null,
      loader: null,
      body: null,
      html: null,
    };
  }

  return {
    shell:
      getById(DOM_IDS.shell) ||
      query("[data-app-shell='true'],.app-shell"),

    main:
      getById(DOM_IDS.main) ||
      query("[data-main-content='true'],main.main-content,.main-content"),

    appContent:
      getById(DOM_IDS.appContent) ||
      query("[data-app-content='true'],.app-content"),

    view:
      getById(DOM_IDS.view) ||
      query("[data-view-root='true'],[data-router-view='true'],[data-view-container='true'],.view-container"),

    sidebarMount:
      getById(DOM_IDS.sidebarMount) ||
      query("[data-sidebar-mount='true'],[data-sidebar-mount]"),

    topbarMount:
      getById(DOM_IDS.topbarMount) ||
      query("[data-topbar-mount='true'],[data-topbar-mount]"),

    tablehead:
      getById(DOM_IDS.tablehead) ||
      query("[data-tablehead='true'],[data-tablehead],.table-head"),

    tableheadContainer:
      getById(DOM_IDS.tableheadContainer) ||
      query("[data-tablehead-container='true'],[data-tablehead-container]"),

    loader:
      getById(DOM_IDS.loader) ||
      query("[data-app-loader='true'],[data-app-loader],.app-loader"),

    body:
      document.body || null,

    html:
      document.documentElement || null,
  };
}

function getFallbackContainer() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      AppCore?.dom?.viewContainer ||
      AppCore?.dom?.routerView ||
      AppCore?.dom?.viewRoot ||
      getShellElements().view ||
      null
    );
  } catch {
    return null;
  }
}

function resolveContainer(candidate = null) {
  if (
    candidate &&
    isDomNode(candidate)
  ) {
    return candidate;
  }

  return getFallbackContainer();
}

function syncDomCache(container = null) {
  try {
    if (
      !AppCore ||
      typeof AppCore !== "object"
    ) {
      return false;
    }

    if (
      !AppCore.dom &&
      isExtensibleTarget(AppCore)
    ) {
      AppCore.dom =
        {};
    }

    if (!isObject(AppCore.dom)) {
      return false;
    }

    const elements =
      getShellElements();

    Object.assign(
      AppCore.dom,
      {
        appShell:
          elements.shell,
        shell:
          elements.shell,

        mainContent:
          elements.main,
        main:
          elements.main,

        appContent:
          elements.appContent,

        viewContainer:
          container || elements.view,
        routerView:
          container || elements.view,
        viewRoot:
          container || elements.view,

        sidebarMount:
          elements.sidebarMount,
        topbarMount:
          elements.topbarMount,

        tablehead:
          elements.tablehead,
        tableHead:
          elements.tablehead,

        tableheadContainer:
          elements.tableheadContainer,
        tableHeadContainer:
          elements.tableheadContainer,

        loader:
          elements.loader,
        appLoader:
          elements.loader,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   MODULE HELPERS
========================================================= */

function getCoreModule(names = []) {
  const keys =
    safeArray(names)
      .map((name) => safeText(name, ""))
      .filter(Boolean);

  for (const key of keys) {
    try {
      if (isFunction(AppCore?.modules?.get)) {
        const value =
          AppCore.modules.get(key);

        if (value) {
          return value;
        }
      }
    } catch {}

    try {
      if (AppCore?.modules?.[key]) {
        return AppCore.modules[key];
      }
    } catch {}

    try {
      if (AppCore?.[key]) {
        return AppCore[key];
      }
    } catch {}

    try {
      if (isFunction(AppCore?.registry?.modules?.get)) {
        const value =
          AppCore.registry.modules.get(key);

        if (value) {
          return value;
        }
      }
    } catch {}
  }

  return null;
}

function resolveDelegatedRenderer() {
  const candidates =
    [
      LoginDefault,
      LoginDefault?.render,
      LoginDefault?.init,
      LoginDefault?.mount,

      LoginModule?.render,
      LoginModule?.init,
      LoginModule?.mount,

      LoginModule?.default,
      LoginModule?.default?.render,
      LoginModule?.default?.init,
      LoginModule?.default?.mount,
    ];

  for (const candidate of candidates) {
    if (isFunction(candidate)) {
      return candidate;
    }
  }

  return null;
}

/* =========================================================
   SHELL / LOADER COMPAT
========================================================= */

function setAuthScreenMode(active = true) {
  if (!isBrowser()) {
    return false;
  }

  const enabled =
    Boolean(active);

  const {
    body,
    html,
    shell,
    main,
    appContent,
    view,
    sidebarMount,
    topbarMount,
    tablehead,
    tableheadContainer,
  } =
    getShellElements();

  for (const root of [
    html,
    body,
  ]) {
    if (!root) {
      continue;
    }

    for (const className of AUTH_SCREEN_CLASSES) {
      toggleClass(
        root,
        className,
        enabled
      );
    }

    for (const className of APP_SCREEN_CLASSES) {
      toggleClass(
        root,
        className,
        !enabled
      );
    }

    setDataset(
      root,
      "routeMode",
      enabled ? "auth" : "app"
    );

    setDataset(
      root,
      "authScreen",
      enabled ? "true" : "false"
    );

    setDataset(
      root,
      "chrome",
      enabled ? "hidden" : "visible"
    );

    setDataset(
      root,
      "shell",
      "visible"
    );
  }

  for (const element of [
    shell,
    main,
    appContent,
    view,
  ]) {
    if (!element) {
      continue;
    }

    try {
      element.hidden =
        false;
    } catch {}

    setAttribute(
      element,
      "aria-hidden",
      "false"
    );

    setAttribute(
      element,
      "aria-busy",
      "false"
    );

    setDataset(
      element,
      "shell",
      "visible"
    );

    setDataset(
      element,
      "routeMode",
      enabled ? "auth" : "app"
    );

    setDataset(
      element,
      "chrome",
      enabled ? "hidden" : "visible"
    );
  }

  for (const chromeElement of [
    sidebarMount,
    topbarMount,
    tablehead,
    tableheadContainer,
  ]) {
    applyHidden(
      chromeElement,
      enabled
    );
  }

  return true;
}

function releaseAuthScreenModeIfNeeded() {
  if (!isBrowser()) {
    return false;
  }

  if (isLoginRoute()) {
    return false;
  }

  return setAuthScreenMode(false);
}

function stopGlobalLoadingFallback() {
  try {
    AppCore?.setLoading?.(
      false,
      {
        source:
          SOURCE,
        silent:
          true,
      }
    );
  } catch {
    try {
      AppCore?.setLoading?.(false);
    } catch {}
  }

  try {
    AppCore?.setState?.(
      {
        loading:
          false,
        appLoading:
          false,
        loaderVisible:
          false,
      },
      {
        source:
          SOURCE,
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  const loaderModule =
    getCoreModule([
      "Loader",
      "loader",
      "AppLoader",
      "appLoader",
    ]);

  try {
    if (isFunction(loaderModule?.hide)) {
      loaderModule.hide({
        source:
          SOURCE,
        reason:
          "login-bridge-rendered",
        force:
          true,
        allowDuringBoot:
          true,
      });

      return true;
    }
  } catch {}

  try {
    if (isFunction(loaderModule?.forceHide)) {
      loaderModule.forceHide({
        source:
          SOURCE,
        reason:
          "login-bridge-rendered",
      });

      return true;
    }
  } catch {}

  try {
    if (isFunction(loaderModule?.finalize)) {
      loaderModule.finalize({
        source:
          SOURCE,
        reason:
          "login-bridge-rendered",
      });

      return true;
    }
  } catch {}

  try {
    const {
      loader,
      body,
      html,
    } =
      getShellElements();

    for (const root of [
      body,
      html,
    ]) {
      removeClasses(
        root,
        LOADING_CLASSES
      );

      setDataset(
        root,
        "appLoading",
        "false"
      );

      setDataset(
        root,
        "appBooting",
        "false"
      );
    }

    if (loader) {
      loader.hidden =
        true;

      setAttribute(
        loader,
        "aria-hidden",
        "true"
      );

      setAttribute(
        loader,
        "aria-busy",
        "false"
      );

      setDataset(
        loader,
        "loaderVisible",
        "false"
      );

      setDataset(
        loader,
        "loaderState",
        "hidden"
      );

      loader.classList?.add?.(
        "is-hidden",
        "has-hidden",
        "loader-hidden"
      );

      loader.classList?.remove?.(
        "is-visible",
        "is-entering",
        "is-leaving",
        "loader-visible"
      );
    }
  } catch {}

  return true;
}

function syncShellAuthMode() {
  const shellModule =
    getCoreModule([
      "Shell",
      "shell",
      "AppShell",
      "appShell",
    ]);

  try {
    if (isFunction(shellModule?.setVisible)) {
      shellModule.setVisible(
        false,
        {
          source:
            SOURCE,
          reason:
            "login-bridge-auth-mode",
          authLike:
            true,
          hideAppShell:
            false,
          force:
            true,
          forceChromeSync:
            true,
        }
      );

      return true;
    }
  } catch {}

  try {
    if (isFunction(shellModule?.setShellVisibility)) {
      shellModule.setShellVisibility(
        AppCore,
        false,
        {
          source:
            SOURCE,
          reason:
            "login-bridge-auth-mode",
          authLike:
            true,
          hideAppShell:
            false,
          force:
            true,
          forceChromeSync:
            true,
        }
      );

      return true;
    }
  } catch {}

  return setAuthScreenMode(true);
}

function prepareLoginShell(container = null) {
  syncDomCache(container);

  setAuthScreenMode(true);
  syncShellAuthMode();
  stopGlobalLoadingFallback();

  try {
    AppCore?.clearDynamicContainers?.({
      includeView:
        false,
      includeTopbar:
        true,
      includeTablehead:
        true,
      source:
        SOURCE,
    });
  } catch {}

  try {
    AppCore?.setDocumentTitle?.(
      AppCore?.config?.appName ||
        "Onion Support"
    );
  } catch {}

  safeEmit(
    BRIDGE_EVENTS.shellPrepared,
    {
      path:
        normalizePath(getCurrentPath()),

      canonicalPath:
        getCurrentCanonicalPath(),

      containerId:
        safeText(container?.id, ""),
    }
  );

  return true;
}

/* =========================================================
   CONTROLLER HELPERS
========================================================= */

function hasController(value = null) {
  return Boolean(
    value &&
      (
        isFunction(value.destroy) ||
        isFunction(value.unmount) ||
        isFunction(value.dispose) ||
        isFunction(value.teardown) ||
        isFunction(value.abort)
      )
  );
}

function normalizeController(value = null, epoch = 0) {
  if (hasController(value)) {
    return value;
  }

  return {
    source:
      SOURCE,

    epoch,

    destroy() {},

    getSnapshot() {
      return {
        source:
          SOURCE,
        epoch,
        delegatedController:
          false,
      };
    },
  };
}

function destroyController(controller = null, options = {}) {
  if (!controller) {
    return false;
  }

  const methods =
    [
      "destroy",
      "unmount",
      "dispose",
      "teardown",
      "abort",
    ];

  const context = {
    source:
      SOURCE,
    reason:
      safeText(
        options.reason,
        "destroy"
      ),
    epoch:
      options.epoch || activeEpoch,
  };

  for (const method of methods) {
    if (!isFunction(controller?.[method])) {
      continue;
    }

    try {
      controller[method](context);
      return true;
    } catch (error) {
      try {
        controller[method]();
        return true;
      } catch (fallbackError) {
        lastError =
          sanitizeError(fallbackError || error);

        safeWarn(
          `Error ejecutando controller.${method}().`,
          lastError
        );

        return false;
      }
    }
  }

  return false;
}

function clearScopedCleanup() {
  try {
    AppCore?.cleanup?.run?.(SCOPE);
  } catch {}

  try {
    AppCore?.cleanup?.clear?.(SCOPE);
  } catch {}

  try {
    AppCore?.cleanup?.dispose?.(SCOPE);
  } catch {}

  return true;
}

function destroyActiveController({
  preserveAuthScreen = false,
  emit = true,
  reason = "destroy-active-controller",
} = {}) {
  const controller =
    activeController;

  const hadController =
    Boolean(controller);

  try {
    destroyController(
      controller,
      {
        reason,
        epoch:
          activeEpoch,
      }
    );
  } finally {
    activeController =
      null;

    activeContainer =
      null;

    activeEpoch =
      0;

    renderInFlight =
      false;

    clearScopedCleanup();

    if (!preserveAuthScreen) {
      releaseAuthScreenModeIfNeeded();
    }

    lastDestroyAt =
      safeIsoNow();

    if (
      emit &&
      hadController
    ) {
      safeEmit(
        BRIDGE_EVENTS.destroyed,
        {
          epoch:
            renderEpoch,

          preserveAuthScreen:
            Boolean(preserveAuthScreen),

          reason,
        }
      );
    }
  }

  return hadController;
}

/* =========================================================
   ARG NORMALIZATION
========================================================= */

function normalizeRenderArgs(input = null, maybeDeps = {}) {
  let container =
    null;

  let deps =
    {};

  if (isDomNode(input)) {
    container =
      input;

    deps =
      safeObject(maybeDeps);
  } else if (isObject(input)) {
    container =
      input.container ||
      input.target ||
      input.root ||
      input.el ||
      null;

    deps = {
      ...input,
    };

    delete deps.container;
    delete deps.target;
    delete deps.root;
    delete deps.el;
  } else {
    deps =
      safeObject(maybeDeps);
  }

  return {
    container:
      resolveContainer(container),

    deps,
  };
}

function callDelegatedRenderer(renderer, container, deps = {}, epoch = 0) {
  const context = {
    source:
      SOURCE,

    legacyBridge:
      true,

    scope:
      SCOPE,

    epoch,

    AppCore,

    container,
    target:
      container,
    root:
      container,
    el:
      container,

    path:
      normalizePath(getCurrentPath()),

    canonicalPath:
      getCurrentCanonicalPath(),

    ...safeObject(deps),
  };

  /*
    Firma canónica de vistas actuales:
      render(container, context)
  */
  try {
    return renderer(
      container,
      context
    );
  } catch (firstError) {
    /*
      Compat moderna:
        render(context)
    */
    try {
      return renderer(context);
    } catch {
      /*
        Si ambas fallan, lanzamos el error original.
      */
      throw firstError;
    }
  }
}

/* =========================================================
   PUBLIC RENDER API
========================================================= */

function render(input = null, maybeDeps = {}) {
  if (!isBrowser()) {
    safeWarn(
      "Render ignorado fuera de browser."
    );

    return null;
  }

  const {
    container,
    deps,
  } =
    normalizeRenderArgs(
      input,
      maybeDeps
    );

  if (!container) {
    const error =
      new Error(
        "LoginView: no se encontró #view-container."
      );

    lastError =
      sanitizeError(error);

    safeError(
      lastError.message
    );

    safeEmit(
      BRIDGE_EVENTS.error,
      {
        error:
          lastError,
      },
      {
        force:
          true,
      }
    );

    return null;
  }

  const renderer =
    resolveDelegatedRenderer();

  if (!isFunction(renderer)) {
    const error =
      new Error(
        "LoginView: src/views/login/index.js no exporta render/init/mount válido."
      );

    lastError =
      sanitizeError(error);

    safeError(
      lastError.message
    );

    safeEmit(
      BRIDGE_EVENTS.error,
      {
        error:
          lastError,
      },
      {
        force:
          true,
      }
    );

    return null;
  }

  renderEpoch += 1;

  const epoch =
    renderEpoch;

  renderInFlight =
    true;

  destroyActiveController({
    preserveAuthScreen:
      true,
    emit:
      false,
    reason:
      "before-new-render",
  });

  activeEpoch =
    epoch;

  prepareLoginShell(container);

  safeEmit(
    BRIDGE_EVENTS.beforeRender,
    {
      epoch,
      path:
        normalizePath(
          getCurrentPath()
        ),
      canonicalPath:
        getCurrentCanonicalPath(),
      containerId:
        safeText(
          container.id,
          ""
        ),
    }
  );

  try {
    const result =
      callDelegatedRenderer(
        renderer,
        container,
        {
          ...safeObject(deps),
          source:
            SOURCE,
          legacyBridge:
            true,
        },
        epoch
      );

    /*
      Si el renderer devuelve Promise, dejamos un controller provisional.
      No bloqueamos Router con una vista congelada.
    */
    if (
      result &&
      isFunction(result.then)
    ) {
      const asyncController =
        normalizeController(
          null,
          epoch
        );

      activeController =
        asyncController;

      activeContainer =
        container;

      result
        .then((controller) => {
          if (epoch !== activeEpoch) {
            destroyController(
              controller,
              {
                reason:
                  "async-render-stale",
                epoch,
              }
            );

            return;
          }

          activeController =
            normalizeController(
              controller,
              epoch
            );

          lastRenderAt =
            safeIsoNow();

          lastError =
            null;

          stopGlobalLoadingFallback();

          safeEmit(
            BRIDGE_EVENTS.rendered,
            {
              epoch,
              async:
                true,
              containerId:
                safeText(container.id, ""),
              connected:
                isConnected(container),
            }
          );
        })
        .catch((error) => {
          if (epoch !== activeEpoch) {
            return;
          }

          lastError =
            sanitizeError(error);

          activeController =
            null;

          activeContainer =
            null;

          renderInFlight =
            false;

          releaseAuthScreenModeIfNeeded();

          safeEmit(
            BRIDGE_EVENTS.error,
            {
              epoch,
              async:
                true,
              error:
                lastError,
            },
            {
              force:
                true,
              dedupe:
                false,
            }
          );

          safeError(
            "Error async renderizando login delegado.",
            lastError
          );
        });

      lastRenderAt =
        safeIsoNow();

      lastError =
        null;

      renderInFlight =
        false;

      stopGlobalLoadingFallback();

      return asyncController;
    }

    activeController =
      normalizeController(
        result,
        epoch
      );

    activeContainer =
      container;

    lastRenderAt =
      safeIsoNow();

    lastError =
      null;

    renderInFlight =
      false;

    stopGlobalLoadingFallback();

    safeEmit(
      BRIDGE_EVENTS.rendered,
      {
        epoch,
        async:
          false,
        containerId:
          safeText(
            container.id,
            ""
          ),
        connected:
          isConnected(container),
      }
    );

    safeLog(
      "Login bridge render OK.",
      {
        epoch,
      }
    );

    return activeController;
  } catch (error) {
    lastError =
      sanitizeError(error);

    activeController =
      null;

    activeContainer =
      null;

    activeEpoch =
      0;

    renderInFlight =
      false;

    releaseAuthScreenModeIfNeeded();

    safeEmit(
      BRIDGE_EVENTS.error,
      {
        epoch,
        error:
          lastError,
      },
      {
        force:
          true,
        dedupe:
          false,
      }
    );

    safeError(
      "Error renderizando login delegado.",
      lastError
    );

    throw error;
  }
}

function init(input = null, maybeDeps = {}) {
  return render(
    input,
    maybeDeps
  );
}

function mount(input = null, maybeDeps = {}) {
  return render(
    input,
    maybeDeps
  );
}

function destroy(options = {}) {
  return destroyActiveController({
    preserveAuthScreen:
      options?.preserveAuthScreen === true,
    emit:
      options?.emit !== false,
    reason:
      options?.reason ||
      "destroy",
  });
}

function unmount(options = {}) {
  return destroy(options);
}

function dispose(options = {}) {
  return destroy(options);
}

function teardown(options = {}) {
  return destroy(options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getElementSnapshot(element = null) {
  if (!element) {
    return {
      exists:
        false,
    };
  }

  return {
    exists:
      true,

    id:
      safeText(element.id, ""),

    tag:
      safeText(
        element.tagName?.toLowerCase?.(),
        ""
      ),

    hidden:
      Boolean(element.hidden),

    ariaHidden:
      safeText(
        element.getAttribute?.("aria-hidden"),
        ""
      ),

    ariaBusy:
      safeText(
        element.getAttribute?.("aria-busy"),
        ""
      ),

    dataset: {
      shell:
        safeText(element.dataset?.shell, ""),

      chrome:
        safeText(element.dataset?.chrome, ""),

      routeMode:
        safeText(element.dataset?.routeMode, ""),

      appShellVisible:
        safeText(element.dataset?.appShellVisible, ""),

      loaderVisible:
        safeText(element.dataset?.loaderVisible, ""),

      loaderState:
        safeText(element.dataset?.loaderState, ""),
    },

    className:
      safeText(
        element.className?.baseVal ||
          element.className,
        ""
      ).slice(0, SNAPSHOT_MAX_CLASS_LENGTH),

    classes:
      safeArrayFromClassList(element.classList),

    childCount:
      (() => {
        try {
          return element.children?.length || 0;
        } catch {
          return 0;
        }
      })(),
  };
}

function getLoginViewSnapshot() {
  const elements =
    getShellElements();

  return sanitizePayload({
    version:
      LOGIN_VIEW_BRIDGE_VERSION,

    source:
      SOURCE,

    scope:
      SCOPE,

    active:
      Boolean(activeController),

    renderInFlight:
      Boolean(renderInFlight),

    hasActiveController:
      hasController(activeController),

    activeEpoch,

    activeContainer: {
      exists:
        Boolean(activeContainer),

      id:
        safeText(
          activeContainer?.id,
          ""
        ),

      connected:
        isConnected(activeContainer),
    },

    renderEpoch,

    currentPath:
      isBrowser()
        ? normalizePath(getCurrentPath())
        : "",

    canonicalPath:
      isBrowser()
        ? getCurrentCanonicalPath()
        : "",

    isLoginRoute:
      isBrowser()
        ? isLoginRoute()
        : false,

    delegatedRenderer:
      Boolean(resolveDelegatedRenderer()),

    delegatedDefaultType:
      typeof LoginDefault,

    moduleExports: {
      hasDefault:
        Boolean(LoginModule?.default),

      hasRender:
        isFunction(LoginModule?.render),

      hasInit:
        isFunction(LoginModule?.init),

      hasMount:
        isFunction(LoginModule?.mount),
    },

    dom: {
      shell:
        getElementSnapshot(elements.shell),

      main:
        getElementSnapshot(elements.main),

      appContent:
        getElementSnapshot(elements.appContent),

      view:
        getElementSnapshot(elements.view),

      sidebarMount:
        getElementSnapshot(elements.sidebarMount),

      topbarMount:
        getElementSnapshot(elements.topbarMount),

      tablehead:
        getElementSnapshot(elements.tablehead),

      tableheadContainer:
        getElementSnapshot(elements.tableheadContainer),

      loader:
        getElementSnapshot(elements.loader),

      body:
        getElementSnapshot(elements.body),

      html:
        getElementSnapshot(elements.html),
    },

    lastRenderAt,
    lastDestroyAt,

    lastError,

    lastEventKey:
      redactSensitiveText(lastEventKey),

    lastEventAt,

    lastEventAtIso:
      lastEventAt
        ? safeIsoNow(lastEventAt)
        : "",

    debugBridgeReady:
      Boolean(debugBridgeReady),

    at:
      safeIsoNow(),
  });
}

/* =========================================================
   LEGACY COMPAT OBJECT
========================================================= */

export const LoginView =
  Object.freeze({
    version:
      LOGIN_VIEW_BRIDGE_VERSION,

    render,
    init,
    mount,

    destroy,
    unmount,
    dispose,
    teardown,

    getSnapshot:
      getLoginViewSnapshot,

    getDebugSnapshot:
      getLoginViewSnapshot,
  });

/* =========================================================
   DEBUG BRIDGE
========================================================= */

function exposeDebugBridge() {
  try {
    if (isBrowser()) {
      window.LoginView =
        window.LoginView ||
        LoginView;

      window[RUNTIME_KEY] =
        LoginView;
    }
  } catch {}

  try {
    safeDefineValue(
      AppCore,
      "LoginView",
      LoginView
    );
  } catch {}

  if (!debugBridgeReady) {
    debugBridgeReady =
      true;

    safeEmit(
      BRIDGE_EVENTS.debugReady,
      {
        installed:
          true,
      },
      {
        dedupe:
          false,
      }
    );
  }

  return true;
}

exposeDebugBridge();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default LoginView;

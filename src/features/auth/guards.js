/* =========================================================
   Onion SPA - Auth Guards
   Archivo: src/features/auth/guards.js

   AUTH GUARDS · STRICT SESSION GATE · EXTREME 15/10

   RESPONSABILIDADES:
   - exponer helpers auth de estado
   - validar acceso por rol
   - bloquear navegación no autenticada
   - construir redirect seguro al login
   - exponer header Authorization
   - no bloquear rutas públicas técnicas
   - evitar estados auth fantasma
   - normalizar roles heterogéneos backend
   - servir como capa estable para Router / vistas / sidebar

   HARDENING EXTREMO:
   - authenticated sólo true con token usable + usuario usable + usuario activo
   - token usable puede existir sin user para /me durante restore, pero NO autentica
   - sync auth robusto con AppCore parcial
   - zero ghost auth
   - navegación opcional automática
   - eventos consistentes y sin tokens reales
   - roles normalizados con aliases admin/superadmin/owner/root
   - roles support/agent/helpdesk/tecnico y manager/lead normalizados
   - guards reutilizables SPA/router
   - redirects internos blindados anti open-redirect
   - soporte roles array/string/CSV/boolean-map
   - soporte rutas públicas técnicas con tokens
   - snapshot diagnóstico seguro
   - compatibilidad legacy con nombres antiguos
   - sin dependencia circular con login.js
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
  normalizePath,
  normalizeCanonicalPath,
  extractMessage,
  redactTokenInText,
} from "./helpers.js";

import {
  AUTH_PUBLIC_TECHNICAL_ROUTES,
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const GUARDS_VERSION =
  "15.0.0";

const GUARDS_SOURCE =
  "auth.guards";

const LOGIN_PATH =
  "/login";

const DEFAULT_HOME_PATH =
  "/";

const DEFAULT_FORBIDDEN_PATH =
  "/403";

const DEFAULT_TOKEN_MAX_LENGTH =
  8192;

const PUBLIC_TECHNICAL_PATHS =
  Object.freeze([
    ...(Array.isArray(AUTH_PUBLIC_TECHNICAL_ROUTES)
      ? AUTH_PUBLIC_TECHNICAL_ROUTES
      : []),

    "/activate-account",
    "/reset-password",
    "/reset-password/confirm",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/2fa",
    "/otp",
    "/mfa",
  ]);

const LOGIN_LIKE_PATHS =
  Object.freeze([
    "/login",
    "/signin",
    "/sign-in",
    "/auth",
    "/auth/login",
  ]);

const TOKEN_FALSE_VALUES =
  new Set([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "none",
    "nan",
    "[object object]",
    "{}",
    "[]",
    "\"null\"",
    "\"undefined\"",
    "\"false\"",
  ]);

const ADMIN_ROLE_KEYS =
  Object.freeze([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super-admin",
    "superadministrador",
    "super_administrador",
    "super-administrador",
    "owner",
    "root",
  ]);

const SUPPORT_ROLE_KEYS =
  Object.freeze([
    "support",
    "soporte",
    "agent",
    "agente",
    "helpdesk",
    "operator",
    "operador",
    "technician",
    "technical",
    "tecnico",
    "técnico",
    "staff",
  ]);

const MANAGER_ROLE_KEYS =
  Object.freeze([
    "manager",
    "gestor",
    "gerente",
    "lead",
    "team_lead",
    "team-lead",
    "supervisor",
  ]);

const CLIENT_ROLE_KEYS =
  Object.freeze([
    "client",
    "cliente",
    "customer",
  ]);

const USER_ROLE_KEYS =
  Object.freeze([
    "user",
    "usuario",
  ]);

const ROLE_ALIASES =
  Object.freeze({
    administrator:
      "admin",

    administrador:
      "admin",

    superadmin:
      "admin",

    super_admin:
      "admin",

    "super-admin":
      "admin",

    superadministrador:
      "admin",

    super_administrador:
      "admin",

    "super-administrador":
      "admin",

    owner:
      "admin",

    root:
      "admin",

    soporte:
      "support",

    agente:
      "support",

    agent:
      "support",

    helpdesk:
      "support",

    operator:
      "support",

    operador:
      "support",

    technician:
      "support",

    technical:
      "support",

    tecnico:
      "support",

    staff:
      "support",

    gestor:
      "manager",

    gerente:
      "manager",

    lead:
      "manager",

    team_lead:
      "manager",

    "team-lead":
      "manager",

    supervisor:
      "manager",

    cliente:
      "client",

    customer:
      "client",

    usuario:
      "user",
  });

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

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text =
    safeText(value, "")
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "sí",
      "ok",
      "on",
      "enabled",
      "active",
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
      "disabled",
      "inactive",
    ].includes(text)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  return [value];
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((value) =>
          safeText(value, "")
        )
        .filter(Boolean)
    )
  );
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function safeIsoDate(ms = Date.now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[AuthGuard]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[AuthGuard]",
        ...args
      );
    }
  } catch {}
}

function getState() {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function safeSetState(patch = {}, options = {}) {
  const cleanPatch =
    safeObject(patch);

  try {
    AppCore?.setState?.(
      cleanPatch,
      {
        source:
          GUARDS_SOURCE,
        emit:
          false,
        emitState:
          false,
        emitDerived:
          false,
        silent:
          true,
        ...safeObject(options),
      }
    );
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        cleanPatch
      );
    }
  } catch {}

  return getState();
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      )
      .replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  }
}

function sanitizeUserForEvent(user = null) {
  if (!isObject(user)) {
    return null;
  }

  return {
    id:
      user.id ??
      user.userId ??
      user.user_id ??
      user._id ??
      user.uid ??
      null,

    userId:
      user.userId ??
      user.user_id ??
      user.id ??
      user._id ??
      user.uid ??
      null,

    username:
      user.username ||
      user.userName ||
      user.user_name ||
      user.slug ||
      null,

    email:
      user.email ||
      user.mail ||
      null,

    role:
      user.role ||
      user.rol ||
      user.userRole ||
      null,

    roles:
      Array.isArray(user.roles)
        ? user.roles
        : [],
  };
}

function sanitizeGuardPayload(payload = {}, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      sanitizeGuardPayload(
        item,
        depth + 1
      )
    );
  }

  if (!isObject(payload)) {
    return typeof payload === "string"
      ? redactSafe(payload)
      : payload;
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower =
      safeText(key, "")
        .toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("password") ||
      lower.includes("secret") ||
      lower === "code" ||
      lower === "otp" ||
      lower === "totp" ||
      lower === "t"
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    if (lower === "user") {
      output[key] =
        sanitizeUserForEvent(value);
      continue;
    }

    if (
      lower.includes("path") ||
      lower.includes("url") ||
      lower.includes("redirect")
    ) {
      output[key] =
        typeof value === "string"
          ? redactSafe(value)
          : sanitizeGuardPayload(
              value,
              depth + 1
            );
      continue;
    }

    output[key] =
      sanitizeGuardPayload(
        value,
        depth + 1
      );
  }

  return output;
}

function safeEmit(eventName, payload = {}, options = {}) {
  if (
    options?.emitEvents === false ||
    options?.emit === false ||
    options?.silent === true
  ) {
    return false;
  }

  const cleanEvent =
    safeText(eventName, "");

  if (!cleanEvent) {
    return false;
  }

  const cleanPayload =
    sanitizeGuardPayload({
      source:
        GUARDS_SOURCE,

      version:
        GUARDS_VERSION,

      at:
        safeIsoDate(),

      ...safeObject(payload),
    });

  let emitted =
    false;

  try {
    AppCore?.events?.emit?.(
      cleanEvent,
      cleanPayload
    );

    emitted =
      true;
  } catch {}

  try {
    if (
      isBrowser() &&
      !emitted
    ) {
      document.dispatchEvent(
        new CustomEvent(cleanEvent, {
          detail:
            cleanPayload,
          bubbles:
            false,
          cancelable:
            false,
        })
      );

      emitted =
        true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   TOKEN VALIDATION
========================================================= */

function getTokenMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.tokenMaxLength,
    DEFAULT_TOKEN_MAX_LENGTH
  ) || DEFAULT_TOKEN_MAX_LENGTH;
}

function normalizeTokenValue(token = null) {
  if (
    token === null ||
    token === undefined
  ) {
    return "";
  }

  let value =
    String(token)
      .trim();

  if (!value) {
    return "";
  }

  if (/^bearer\s+/i.test(value)) {
    value =
      value.replace(/^bearer\s+/i, "")
        .trim();
  }

  if (
    /[\r\n\t]/.test(value) ||
    TOKEN_FALSE_VALUES.has(value.toLowerCase())
  ) {
    return "";
  }

  const max =
    getTokenMaxLength();

  /*
    Regla dura:
    no truncamos tokens. Si excede el límite, se considera corrupto.
  */
  if (
    max > 0 &&
    value.length > max
  ) {
    return "";
  }

  return value;
}

function hasUsableToken(token = null) {
  const value =
    normalizeTokenValue(token);

  if (!value) {
    return false;
  }

  try {
    if (isFunction(AppCore?.utils?.hasValidToken)) {
      return Boolean(
        AppCore.utils.hasValidToken(value)
      );
    }
  } catch {}

  return true;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathFallback(path = "/") {
  let value =
    safeText(path, "/")
      .replace(/\\/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
    "/";

  return value;
}

function normalizePublicPathSafe(path = "/") {
  const raw =
    safeText(path, "/");

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    return normalizePath(raw);
  } catch {
    return normalizePathFallback(raw);
  }
}

function normalizeCanonicalPathSafe(path = "/") {
  const raw =
    safeText(path, "/");

  if (isHashRouterPath(raw)) {
    return normalizePathFallback(
      normalizeHashRouterPath(raw)
        .split("?")[0]
        .split("#")[0] ||
        "/"
    );
  }

  try {
    return normalizeCanonicalPath(raw);
  } catch {
    return normalizePathFallback(
      raw
        .split("?")[0]
        .split("#")[0] ||
        "/"
    );
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
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
      return normalizeHashRouterPath(hash);
    }

    return normalizePublicPathSafe(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "";
  }
}

function getCurrentPath() {
  try {
    const canonical =
      getCurrentCanonicalPath?.();

    if (canonical) {
      return normalizeCanonicalPathSafe(canonical);
    }
  } catch {}

  try {
    const publicPath =
      getCurrentPublicPath?.();

    if (publicPath) {
      return normalizeCanonicalPathSafe(publicPath);
    }
  } catch {}

  try {
    const statePath =
      getState().route ||
      getState().publicPath;

    if (statePath) {
      return normalizeCanonicalPathSafe(statePath);
    }
  } catch {}

  return normalizeCanonicalPathSafe(
    getBrowserPublicPath() || "/"
  );
}

function getCurrentPublicPathSafe() {
  try {
    const publicPath =
      getCurrentPublicPath?.();

    if (publicPath) {
      return normalizePublicPathSafe(publicPath);
    }
  } catch {}

  try {
    const statePath =
      getState().publicPath ||
      getState().route;

    if (statePath) {
      return normalizePublicPathSafe(statePath);
    }
  } catch {}

  return normalizePublicPathSafe(
    getBrowserPublicPath() || "/"
  );
}

function isPublicTechnicalPath(path = "") {
  const clean =
    normalizeCanonicalPathSafe(path)
      .toLowerCase();

  return unique(PUBLIC_TECHNICAL_PATHS).some((publicPath) => {
    const normalized =
      normalizeCanonicalPathSafe(publicPath)
        .toLowerCase();

    return (
      clean === normalized ||
      clean.startsWith(`${normalized}/`)
    );
  });
}

function isLoginLikePath(path = "") {
  const clean =
    normalizeCanonicalPathSafe(path)
      .toLowerCase();

  return LOGIN_LIKE_PATHS.some((candidate) => {
    const normalized =
      normalizeCanonicalPathSafe(candidate)
        .toLowerCase();

    return (
      clean === normalized ||
      clean.startsWith(`${normalized}/`)
    );
  });
}

function hasEncodedOpenRedirectRisk(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return true;
  }

  const lower =
    raw.toLowerCase();

  if (
    lower.includes("%0d") ||
    lower.includes("%0a") ||
    lower.includes("%09") ||
    lower.includes("\\") ||
    lower.includes("%5c")
  ) {
    return true;
  }

  try {
    const decoded =
      decodeURIComponent(raw)
        .trim()
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

function isSafeInternalPath(path = "") {
  const value =
    safeText(path, "");

  if (!value) {
    return false;
  }

  if (!value.startsWith("/")) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return false;
  }

  if (/[\r\n\t]/.test(value)) {
    return false;
  }

  if (hasEncodedOpenRedirectRisk(value)) {
    return false;
  }

  return true;
}

function normalizeRedirectPath(path = "/", fallback = DEFAULT_HOME_PATH) {
  const fallbackPath =
    isSafeInternalPath(fallback)
      ? normalizePublicPathSafe(fallback)
      : DEFAULT_HOME_PATH;

  const raw =
    safeText(path, fallbackPath);

  let candidate =
    raw;

  try {
    candidate =
      normalizePublicPathSafe(raw);
  } catch {
    candidate =
      normalizePathFallback(raw);
  }

  if (!isSafeInternalPath(candidate)) {
    return fallbackPath;
  }

  return candidate;
}

function buildLoginRedirect(currentPath = "/", redirectTo = LOGIN_PATH) {
  const loginPath =
    normalizeRedirectPath(
      redirectTo,
      LOGIN_PATH
    );

  let safeCurrent =
    normalizeRedirectPath(
      currentPath,
      DEFAULT_HOME_PATH
    );

  const currentCanonical =
    normalizeCanonicalPathSafe(
      safeCurrent
    );

  if (isLoginLikePath(currentCanonical)) {
    safeCurrent =
      DEFAULT_HOME_PATH;
  }

  try {
    const url =
      new URL(
        loginPath,
        "http://localhost"
      );

    url.searchParams.set(
      "redirect",
      safeCurrent
    );

    const finalPath =
      `${url.pathname}${url.search}`;

    return isSafeInternalPath(finalPath)
      ? finalPath
      : LOGIN_PATH;
  } catch {
    const finalPath =
      `${loginPath}?redirect=${encodeURIComponent(safeCurrent)}`;

    return isSafeInternalPath(finalPath)
      ? finalPath
      : LOGIN_PATH;
  }
}

/* =========================================================
   ROUTER / NAVIGATION
========================================================= */

function getRouter() {
  const candidates = [];

  try {
    if (isFunction(AppCore?.modules?.get)) {
      candidates.push(
        AppCore.modules.get("router"),
        AppCore.modules.get("Router")
      );
    }
  } catch {}

  candidates.push(
    AppCore?.router,
    AppCore?.Router,
    AppCore?.modules?.router,
    AppCore?.modules?.Router
  );

  if (isBrowser()) {
    try {
      candidates.push(
        window.Router,
        window.AppRouter,
        window.AppCore?.router,
        window.AppCore?.Router
      );
    } catch {}
  }

  return candidates.find((candidate) =>
    candidate &&
    (
      isFunction(candidate.navigate) ||
      isFunction(candidate.go)
    )
  ) || null;
}

function navigateTo(path = "/", options = {}) {
  const target =
    normalizeRedirectPath(
      path,
      DEFAULT_HOME_PATH
    );

  const replaceState =
    options.replaceState !== false;

  const force =
    options.force !== false;

  const hardRedirect =
    options.hardRedirect === true;

  safeEmit(
    "auth:guard:navigate",
    {
      target,
      replaceState,
      force,
      hardRedirect,
      reason:
        options.reason || "guard",
    },
    options
  );

  if (!hardRedirect) {
    try {
      const router =
        getRouter();

      if (isFunction(router?.navigate)) {
        const result =
          router.navigate(
            target,
            {
              replaceState,
              force,
              source:
                GUARDS_SOURCE,
            }
          );

        if (
          result &&
          isFunction(result.catch)
        ) {
          result.catch((error) => {
            safeWarn(
              "Router.navigate falló.",
              error
            );
          });
        }

        return true;
      }

      if (isFunction(router?.go)) {
        const result =
          router.go(
            target,
            {
              replaceState,
              force,
              source:
                GUARDS_SOURCE,
            }
          );

        if (
          result &&
          isFunction(result.catch)
        ) {
          result.catch((error) => {
            safeWarn(
              "Router.go falló.",
              error
            );
          });
        }

        return true;
      }
    } catch (error) {
      safeWarn(
        "navigate router falló; fallback window.location.",
        error
      );
    }
  }

  if (isBrowser()) {
    try {
      if (replaceState) {
        window.location.replace(target);
      } else {
        window.location.assign(target);
      }

      return true;
    } catch {
      try {
        window.location.href =
          target;

        return true;
      } catch {}
    }
  }

  return false;
}

/* =========================================================
   AUTH STATE
========================================================= */

function getCurrentToken() {
  const state =
    getState();

  return (
    state.token ||
    state.accessToken ||
    state.access_token ||
    state.session?.token ||
    state.session?.accessToken ||
    state.session?.access_token ||
    state.sessionData?.token ||
    state.sessionData?.accessToken ||
    state.sessionData?.access_token ||
    null
  );
}

export function getCurrentUser() {
  const state =
    getState();

  return (
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.account ||
    state.profile ||
    state.session?.user ||
    state.session?.usuario ||
    state.session?.me ||
    state.sessionData?.user ||
    state.sessionData?.usuario ||
    state.sessionData?.me ||
    null
  );
}

function hasUsableUser(user = null) {
  if (!isObject(user)) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.uuid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "") ||
      safeText(user.displayName, "") ||
      safeText(user.name, "") ||
      safeText(user.nombre, "")
  );
}

function normalizeStatus(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function isUserActive(user = null) {
  if (!isObject(user)) {
    return false;
  }

  const status =
    normalizeStatus(
      user.status ??
      user.estado ??
      user.state ??
      user.accountStatus ??
      user.account_status ??
      ""
    );

  if (
    [
      "disabled",
      "blocked",
      "deleted",
      "archived",
      "inactive",
      "suspended",
      "locked",
      "banned",
      "deactivated",
      "revoked",
      "bloqueado",
      "eliminado",
      "inactivo",
      "suspendido",
      "desactivado",
    ].includes(status)
  ) {
    return false;
  }

  return !(
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.is_active === false ||
    user.isActive === false ||
    user.is_enabled === false ||
    user.isEnabled === false ||
    user.blocked === true ||
    user.locked === true ||
    user.deleted === true ||
    user.archived === true ||
    user.suspended === true ||
    user.banned === true ||
    user.revoked === true
  );
}

export function syncAuthState() {
  const token =
    getCurrentToken();

  const cleanToken =
    normalizeTokenValue(token);

  const user =
    getCurrentUser();

  const hasToken =
    hasUsableToken(cleanToken);

  const hasUser =
    hasUsableUser(user);

  const userActive =
    isUserActive(user);

  const authenticated =
    Boolean(
      hasToken &&
      hasUser &&
      userActive
    );

  const roles =
    authenticated
      ? getUserRoles(user)
      : [];

  const role =
    authenticated
      ? resolveCanonicalRole(roles)
      : "";

  safeSetState(
    {
      authenticated,
      hasToken,

      token:
        hasToken
          ? cleanToken
          : null,

      accessToken:
        hasToken
          ? cleanToken
          : null,

      access_token:
        hasToken
          ? cleanToken
          : null,

      user:
        authenticated
          ? user
          : null,

      currentUser:
        authenticated
          ? user
          : null,

      authUser:
        authenticated
          ? user
          : null,

      sessionUser:
        authenticated
          ? user
          : null,

      account:
        authenticated
          ? user
          : null,

      profile:
        authenticated
          ? user
          : null,

      role:
        role || "",

      rol:
        role || "",

      userRole:
        role || "",

      roles:
        authenticated
          ? roles
          : [],

      isAdmin:
        authenticated &&
        roles.some(isAdminRole),

      isSupport:
        authenticated &&
        roles.some(isSupportRole),

      isManager:
        authenticated &&
        roles.some(isManagerRole),

      isClient:
        authenticated &&
        roles.some(isClientRole),

      currentResolvedUsername:
        authenticated
          ? user?.slug ||
            user?.usernameLower ||
            user?.username ||
            null
          : null,

      resolvedUsername:
        authenticated
          ? user?.slug ||
            user?.usernameLower ||
            user?.username ||
            null
          : null,
    },
    {
      forceUnauthenticated:
        !authenticated,
      allowExplicitAuthenticated:
        authenticated,
    }
  );

  return authenticated;
}

export function isAuthenticated() {
  return Boolean(
    syncAuthState()
  );
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .replace(/^_+|_+$/g, "")
      .trim();

  return ROLE_ALIASES[raw] || raw;
}

const ADMIN_ROLE_SET =
  new Set(
    ADMIN_ROLE_KEYS.map(normalizeRole)
  );

const SUPPORT_ROLE_SET =
  new Set(
    SUPPORT_ROLE_KEYS.map(normalizeRole)
  );

const MANAGER_ROLE_SET =
  new Set(
    MANAGER_ROLE_KEYS.map(normalizeRole)
  );

const CLIENT_ROLE_SET =
  new Set(
    CLIENT_ROLE_KEYS.map(normalizeRole)
  );

const USER_ROLE_SET =
  new Set(
    USER_ROLE_KEYS.map(normalizeRole)
  );

function isTruthyPermission(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "si" ||
    value === "sí" ||
    value === "ok" ||
    value === "on"
  );
}

function extractTruthyKeys(value = {}) {
  if (!isObject(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, itemValue]) =>
      isTruthyPermission(itemValue)
    )
    .map(([key]) =>
      key
    );
}

function splitRoleValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitRoleValue);
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  if (isObject(value)) {
    return extractTruthyKeys(value)
      .map(normalizeRole)
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/g)
      .map(normalizeRole)
      .filter(Boolean);
  }

  return [
    normalizeRole(value),
  ].filter(Boolean);
}

function isAdminRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "admin" ||
    ADMIN_ROLE_SET.has(role)
  );
}

function isSupportRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "support" ||
    SUPPORT_ROLE_SET.has(role)
  );
}

function isManagerRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "manager" ||
    MANAGER_ROLE_SET.has(role)
  );
}

function isClientRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "client" ||
    CLIENT_ROLE_SET.has(role)
  );
}

function isUserRole(value = "") {
  const role =
    normalizeRole(value);

  return (
    role === "user" ||
    USER_ROLE_SET.has(role)
  );
}

function expandRoleAliases(roles = []) {
  const normalized =
    unique(
      safeArray(roles)
        .flat(Infinity)
        .flatMap(splitRoleValue)
        .map(normalizeRole)
        .filter(Boolean)
    );

  const result =
    new Set(normalized);

  if (normalized.some(isAdminRole)) {
    result.add("admin");

    ADMIN_ROLE_SET.forEach((role) =>
      result.add(role)
    );
  }

  if (normalized.some(isSupportRole)) {
    result.add("support");

    SUPPORT_ROLE_SET.forEach((role) =>
      result.add(role)
    );
  }

  if (normalized.some(isManagerRole)) {
    result.add("manager");

    MANAGER_ROLE_SET.forEach((role) =>
      result.add(role)
    );
  }

  if (normalized.some(isClientRole)) {
    result.add("client");

    CLIENT_ROLE_SET.forEach((role) =>
      result.add(role)
    );
  }

  if (normalized.some(isUserRole)) {
    result.add("user");

    USER_ROLE_SET.forEach((role) =>
      result.add(role)
    );
  }

  return unique(
    Array.from(result)
  );
}

function resolveCanonicalRole(roles = []) {
  const expanded =
    expandRoleAliases(roles);

  if (expanded.some(isAdminRole)) {
    return "admin";
  }

  if (expanded.some(isSupportRole)) {
    return "support";
  }

  if (expanded.some(isManagerRole)) {
    return "manager";
  }

  if (expanded.some(isClientRole)) {
    return "client";
  }

  if (expanded.some(isUserRole)) {
    return "user";
  }

  return expanded[0] || "";
}

function collectRoleCandidatesFromUser(user = null) {
  if (!hasUsableUser(user)) {
    return [];
  }

  const source =
    safeObject(user);

  const raw =
    safeObject(source.raw);

  const profile =
    safeObject(source.profile);

  const account =
    safeObject(source.account);

  const permissions =
    safeObject(source.permissions);

  const meta =
    safeObject(source.meta);

  const claims =
    safeObject(source.claims);

  const state =
    getState();

  const candidates = [
    source.role,
    source.rol,
    source.userRole,
    source.user_role,
    source.type,
    source.userType,
    source.user_type,
    source.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.user_role,
    profile.type,
    profile.perfil,

    account.role,
    account.rol,
    account.userRole,
    account.user_role,
    account.type,
    account.perfil,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,

    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.profile?.userRole,
    raw?.profile?.user_role,
    raw?.profile?.type,
    raw?.profile?.perfil,

    raw?.account?.role,
    raw?.account?.rol,
    raw?.account?.userRole,
    raw?.account?.type,

    meta.role,
    meta.rol,
    meta.userRole,
    meta.user_role,

    claims.role,
    claims.rol,
    claims.userRole,
    claims.user_role,
    claims["custom:role"],
    claims["https://onion/role"],

    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.session?.role,
    state.session?.rol,
    state.sessionData?.role,
    state.sessionData?.rol,
  ];

  const arrays = [
    source.roles,
    source.roleList,
    source.role_list,
    source.groups,
    source.authorities,
    source.scopes,

    profile.roles,
    profile.groups,
    profile.authorities,
    profile.scopes,

    account.roles,
    account.groups,
    account.authorities,
    account.scopes,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.groups,
    raw.authorities,
    raw.scopes,

    raw?.profile?.roles,
    raw?.profile?.groups,
    raw?.profile?.authorities,
    raw?.profile?.scopes,

    raw?.account?.roles,
    raw?.account?.groups,
    raw?.account?.authorities,
    raw?.account?.scopes,

    permissions.roles,
    permissions.scopes,
    permissions.items,
    permissions.list,

    meta.roles,
    meta.groups,
    meta.scopes,

    claims.roles,
    claims.groups,
    claims.scopes,

    state.roles,
    state.session?.roles,
    state.sessionData?.roles,
  ];

  const adminFlag =
    [
      source.isAdmin,
      source.admin,
      source.is_admin,
      source.isSuperAdmin,
      source.superAdmin,
      source.is_super_admin,
      source.canManageUsers,
      source.can_manage_users,
      source.canAccessUsers,
      source.can_access_users,

      profile.isAdmin,
      profile.admin,
      profile.isSuperAdmin,
      profile.superAdmin,
      profile.canManageUsers,
      profile.canAccessUsers,

      account.isAdmin,
      account.admin,
      account.isSuperAdmin,
      account.superAdmin,
      account.canManageUsers,
      account.canAccessUsers,

      raw.isAdmin,
      raw.admin,
      raw.is_admin,
      raw.isSuperAdmin,
      raw.superAdmin,
      raw.is_super_admin,
      raw.canManageUsers,
      raw.can_manage_users,
      raw.canAccessUsers,
      raw.can_access_users,

      raw?.profile?.isAdmin,
      raw?.profile?.admin,
      raw?.profile?.isSuperAdmin,
      raw?.profile?.superAdmin,
      raw?.profile?.canManageUsers,
      raw?.profile?.canAccessUsers,

      raw?.account?.isAdmin,
      raw?.account?.admin,
      raw?.account?.isSuperAdmin,
      raw?.account?.superAdmin,
      raw?.account?.canManageUsers,
      raw?.account?.canAccessUsers,

      meta.isAdmin,
      meta.admin,
      meta.isSuperAdmin,
      meta.superAdmin,
      meta.canManageUsers,
      meta.canAccessUsers,

      claims.isAdmin,
      claims.admin,
      claims.isSuperAdmin,
      claims.superAdmin,
      claims.canManageUsers,
      claims.canAccessUsers,

      state.isAdmin,
      state.session?.isAdmin,
      state.sessionData?.isAdmin,
    ].some((value) =>
      isTruthyPermission(value)
    );

  if (adminFlag) {
    candidates.push("admin");
  }

  return [
    ...candidates,
    ...arrays.flatMap((value) =>
      safeArray(value)
    ),
  ];
}

function getUserRoles(user = null) {
  if (!hasUsableUser(user)) {
    return [];
  }

  return expandRoleAliases(
    collectRoleCandidatesFromUser(user)
  );
}

export function getCurrentRole() {
  const user =
    getCurrentUser();

  if (!hasUsableUser(user)) {
    return "";
  }

  const roles =
    getUserRoles(user);

  return resolveCanonicalRole(roles);
}

export function getCurrentRoles() {
  const user =
    getCurrentUser();

  if (!hasUsableUser(user)) {
    return [];
  }

  return getUserRoles(user);
}

export function isCurrentUserAdmin() {
  return getCurrentRoles()
    .some(isAdminRole);
}

export function isCurrentUserSupport() {
  return getCurrentRoles()
    .some(isSupportRole);
}

export function isCurrentUserManager() {
  return getCurrentRoles()
    .some(isManagerRole);
}

export function isCurrentUserClient() {
  return getCurrentRoles()
    .some(isClientRole);
}

export function hasRole(...roles) {
  const requiredRoles =
    expandRoleAliases(
      roles
        .flat(Infinity)
        .flatMap(splitRoleValue)
    );

  if (!requiredRoles.length) {
    return true;
  }

  const currentRoles =
    new Set(
      expandRoleAliases(
        getCurrentRoles()
      )
    );

  if (!currentRoles.size) {
    return false;
  }

  return requiredRoles.some((role) =>
    currentRoles.has(role)
  );
}

export function requireRole(...roles) {
  return (
    isAuthenticated() &&
    hasRole(...roles)
  );
}

/*
  No exige user/authenticated para permitir llamadas /me durante restore si
  algún consumidor legacy usa este helper desde guards.
*/
export function getAuthHeader() {
  const token =
    normalizeTokenValue(
      getCurrentToken()
    );

  if (!hasUsableToken(token)) {
    return {};
  }

  const headerName =
    safeText(
      AppCore?.config?.auth?.tokenHeader,
      "Authorization"
    );

  const prefix =
    safeText(
      AppCore?.config?.auth?.bearerPrefix,
      "Bearer"
    );

  return {
    [headerName]:
      `${prefix} ${token}`,
  };
}

/* =========================================================
   GUARD PAYLOADS
========================================================= */

function buildBlockedPayload({
  reason,
  path,
  redirectTo,
  extra = {},
} = {}) {
  const user =
    getCurrentUser();

  const token =
    getCurrentToken();

  return {
    reason:
      safeText(reason, "blocked"),

    path:
      path || getCurrentPath(),

    publicPath:
      getCurrentPublicPathSafe(),

    redirectTo:
      redirectTo || "",

    authenticated:
      Boolean(getState().authenticated),

    hasToken:
      Boolean(hasUsableToken(token)),

    hasUser:
      Boolean(hasUsableUser(user)),

    userActive:
      Boolean(isUserActive(user)),

    currentRole:
      getCurrentRole() || null,

    currentRoles:
      getCurrentRoles(),

    user:
      sanitizeUserForEvent(user),

    ...extra,
  };
}

function buildAllowedPayload({
  reason,
  path,
  extra = {},
} = {}) {
  return {
    reason:
      safeText(reason, "allowed"),

    path:
      path || getCurrentPath(),

    publicPath:
      getCurrentPublicPathSafe(),

    authenticated:
      Boolean(getState().authenticated),

    currentRole:
      getCurrentRole() || null,

    currentRoles:
      getCurrentRoles(),

    ...extra,
  };
}

/* =========================================================
   ROUTE GUARDS
========================================================= */

export function guardAuthenticated(options = {}) {
  const opts =
    safeObject(options);

  const {
    path = "",
    redirectTo = LOGIN_PATH,
    withRedirectBack = true,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
    emitEvents = true,
  } =
    opts;

  const currentPath =
    normalizeCanonicalPathSafe(
      path || getCurrentPath()
    );

  const currentPublicPath =
    getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath)
    )
  ) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "public-technical-route",
          path:
            currentPath,
        }),
        opts
      );
    }

    return true;
  }

  if (isAuthenticated()) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "authenticated",
          path:
            currentPath,
        }),
        opts
      );
    }

    return true;
  }

  const finalRedirect =
    withRedirectBack
      ? buildLoginRedirect(
          currentPublicPath || currentPath,
          redirectTo
        )
      : normalizeRedirectPath(
          redirectTo,
          LOGIN_PATH
        );

  const payload =
    buildBlockedPayload({
      reason:
        "not-authenticated",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
    });

  if (emitEvents !== false) {
    safeEmit(
      "auth:guard:blocked",
      payload,
      opts
    );
  }

  if (
    autoNavigate ||
    hardRedirect
  ) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
        reason:
          "not-authenticated",
        emitEvents,
      }
    );
  }

  return false;
}

export function guardRole(roles = [], options = {}) {
  const roleList =
    safeArray(roles)
      .flat(Infinity);

  const opts =
    safeObject(options);

  const {
    path = "",
    redirectTo = DEFAULT_FORBIDDEN_PATH,
    fallbackRedirectTo = DEFAULT_HOME_PATH,
    loginRedirectTo = LOGIN_PATH,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
    emitEvents = true,
  } =
    opts;

  const currentPath =
    normalizeCanonicalPathSafe(
      path || getCurrentPath()
    );

  const currentPublicPath =
    getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath)
    )
  ) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "public-technical-route",
          path:
            currentPath,
        }),
        opts
      );
    }

    return true;
  }

  const requiredRoles =
    expandRoleAliases(roleList);

  if (!isAuthenticated()) {
    const loginRedirect =
      buildLoginRedirect(
        currentPublicPath || currentPath,
        loginRedirectTo
      );

    const payload =
      buildBlockedPayload({
        reason:
          "not-authenticated",
        path:
          currentPath,
        redirectTo:
          loginRedirect,
        extra: {
          requiredRoles,
        },
      });

    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:blocked",
        payload,
        opts
      );
    }

    if (autoNavigate || hardRedirect) {
      navigateTo(
        loginRedirect,
        {
          replaceState:
            true,
          force:
            true,
          hardRedirect:
            Boolean(hardRedirect),
          reason:
            "role:not-authenticated",
          emitEvents,
        }
      );
    }

    return false;
  }

  if (hasRole(...requiredRoles)) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "role-match",
          path:
            currentPath,
          extra: {
            requiredRoles,
          },
        }),
        opts
      );
    }

    return true;
  }

  const finalRedirect =
    normalizeRedirectPath(
      redirectTo,
      fallbackRedirectTo
    );

  const payload =
    buildBlockedPayload({
      reason:
        "insufficient-role",
      path:
        currentPath,
      redirectTo:
        finalRedirect,
      extra: {
        requiredRoles,
      },
    });

  if (emitEvents !== false) {
    safeEmit(
      "auth:guard:blocked",
      payload,
      opts
    );
  }

  if (autoNavigate || hardRedirect) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
        reason:
          "insufficient-role",
        emitEvents,
      }
    );
  }

  return false;
}

export function guardGuest(options = {}) {
  const opts =
    safeObject(options);

  const {
    redirectTo = DEFAULT_HOME_PATH,
    autoNavigate = false,
    hardRedirect = false,
    allowPublicTechnicalRoutes = true,
    emitEvents = true,
  } =
    opts;

  const currentPath =
    getCurrentPath();

  const currentPublicPath =
    getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath)
    )
  ) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "public-technical-route",
          path:
            currentPath,
        }),
        opts
      );
    }

    return true;
  }

  if (!isAuthenticated()) {
    if (emitEvents !== false) {
      safeEmit(
        "auth:guard:allowed",
        buildAllowedPayload({
          reason:
            "guest",
          path:
            currentPath,
        }),
        opts
      );
    }

    return true;
  }

  const finalRedirect =
    normalizeRedirectPath(
      redirectTo,
      DEFAULT_HOME_PATH
    );

  if (emitEvents !== false) {
    safeEmit(
      "auth:guard:blocked",
      buildBlockedPayload({
        reason:
          "already-authenticated",
        path:
          currentPath,
        redirectTo:
          finalRedirect,
      }),
      opts
    );
  }

  if (autoNavigate || hardRedirect) {
    navigateTo(
      finalRedirect,
      {
        replaceState:
          true,
        force:
          true,
        hardRedirect:
          Boolean(hardRedirect),
        reason:
          "already-authenticated",
        emitEvents,
      }
    );
  }

  return false;
}

export function guardAdmin(options = {}) {
  return guardRole(
    ["admin"],
    options
  );
}

export function guardSupport(options = {}) {
  return guardRole(
    ["support", "admin"],
    options
  );
}

export function guardManager(options = {}) {
  return guardRole(
    ["manager", "admin"],
    options
  );
}

export function canAccessRoute({
  path = "",
  roles = [],
  requireAuth = true,
  allowPublicTechnicalRoutes = true,
} = {}) {
  const currentPath =
    normalizeCanonicalPathSafe(
      path || getCurrentPath()
    );

  const currentPublicPath =
    getCurrentPublicPathSafe();

  if (
    allowPublicTechnicalRoutes &&
    (
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath)
    )
  ) {
    return true;
  }

  if (
    requireAuth !== false &&
    !isAuthenticated()
  ) {
    return false;
  }

  const roleList =
    safeArray(roles)
      .flat(Infinity)
      .filter(Boolean);

  if (!roleList.length) {
    return true;
  }

  return hasRole(...roleList);
}

/* =========================================================
   ERROR HELPER
========================================================= */

export function buildGuardErrorPayload(error) {
  const message =
    (() => {
      try {
        return extractMessage(error);
      } catch {
        return error?.message || String(error);
      }
    })();

  return {
    message:
      redactSafe(message),

    name:
      error?.name || "Error",

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.data?.status ||
      0,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,
  };
}

/* =========================================================
   DEBUG
========================================================= */

export function getAuthGuardsSnapshot() {
  const currentPath =
    getCurrentPath();

  const currentPublicPath =
    getCurrentPublicPathSafe();

  const user =
    getCurrentUser();

  const token =
    getCurrentToken();

  syncAuthState();

  const currentRoles =
    getCurrentRoles();

  const router =
    getRouter();

  return {
    version:
      GUARDS_VERSION,

    authenticated:
      Boolean(getState().authenticated),

    hasToken:
      Boolean(hasUsableToken(token)),

    hasUser:
      Boolean(hasUsableUser(user)),

    userActive:
      Boolean(isUserActive(user)),

    currentRole:
      getCurrentRole() || null,

    currentRoles,

    isAdmin:
      currentRoles.some(isAdminRole),

    isSupport:
      currentRoles.some(isSupportRole),

    isManager:
      currentRoles.some(isManagerRole),

    isClient:
      currentRoles.some(isClientRole),

    currentPath:
      redactSafe(currentPath),

    currentPublicPath:
      redactSafe(currentPublicPath),

    publicTechnical:
      isPublicTechnicalPath(currentPath) ||
      isPublicTechnicalPath(currentPublicPath),

    hasRouter:
      Boolean(router),

    routerCapabilities: {
      navigate:
        Boolean(isFunction(router?.navigate)),

      go:
        Boolean(isFunction(router?.go)),
    },

    state: {
      route:
        redactSafe(getState().route || ""),

      publicPath:
        redactSafe(getState().publicPath || ""),

      role:
        getState().role || null,

      roles:
        safeClone(getState().roles || [], []),

      authenticated:
        Boolean(getState().authenticated),

      hasToken:
        Boolean(getState().hasToken),
    },

    at:
      safeIsoDate(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  GUARDS_VERSION,

  syncAuthState,

  isAuthenticated,
  getCurrentUser,

  getCurrentRole,
  getCurrentRoles,

  isCurrentUserAdmin,
  isCurrentUserSupport,
  isCurrentUserManager,
  isCurrentUserClient,

  hasRole,
  requireRole,
  getAuthHeader,

  guardAuthenticated,
  guardRole,
  guardGuest,
  guardAdmin,
  guardSupport,
  guardManager,

  canAccessRoute,

  /*
    Aliases legacy/ergonómicos.
  */
  requireAuth:
    guardAuthenticated,

  ensureAuthenticated:
    guardAuthenticated,

  requireGuest:
    guardGuest,

  requireAdmin:
    guardAdmin,

  requireSupport:
    guardSupport,

  requireManager:
    guardManager,

  can:
    hasRole,

  canAccess:
    canAccessRoute,

  buildGuardErrorPayload,

  getAuthGuardsSnapshot,
  getDebugSnapshot:
    getAuthGuardsSnapshot,
};

/* =========================================================
   Onion SPA - Router Guards
   Archivo: src/router/guards.js

   FINAL EXTREME SYSTEM · ROUTER GUARDS · AUTH / ROLES / REDIRECTS · 11/10
   PUBLIC TECHNICAL ROUTES SAFE
   GHOST AUTH BLOCKED
   ROLE ALIASES HARDENED
   REDIRECTS SAFE
   USERNAME PUBLIC PATH SAFE
   HASH ROUTER TOKEN ROUTES SAFE

   RESPONSABILIDADES:
   - resolver acceso a rutas
   - guards auth / guest / roles
   - redirects centralizados
   - tolerancia config heterogénea
   - salida estable para Router
   - permitir rutas públicas técnicas aunque exista sesión
   - no bloquear /activate-account, /reset-password, confirm reset
   - no bloquear /activate-account/<token>
   - no bloquear /reset-password/confirm/<token>
   - bloquear vistas admin aunque el rol venga como alias
   - evitar redirects agresivos durante transición de login
   - evitar auth fantasma
   - evitar open redirects
   - exponer snapshot de diagnóstico seguro

   HARDENING EXTREMO:
   - rutas públicas por defecto
   - normalización robusta de roles
   - soporte meta.requiresAuth / guestOnly / roles
   - soporte roles en user.role / user.rol / user.roles / permissions
   - soporte flags isAdmin / admin / canManageUsers / canAccessUsers
   - aliases admin/support/manager expandidos
   - redirects consistentes
   - prioridad clara entre public technical / guest / auth / roles
   - compatibilidad route.public / route.private / meta.public
   - fallback seguro si Auth falla
   - bypass seguro para rutas públicas técnicas
   - preserva redirect al mandar a login
   - cero auth fantasma: token sin user no autentica
   - cero auth fantasma: user sin token no autentica
   - redirect interno seguro anti open-redirect
   - soporte same-origin absolute URL
   - soporte /@usuario/ruta sin degradar canonical
   - soporte hash-router técnico
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath,
  getDefaultHomeTarget,
  buildLoginUrl,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const GUARDS_VERSION =
  "11.0.0";

const LOGIN_PATH =
  "/login";

const HOME_PATH =
  "/";

const PUBLIC_TECHNICAL_ROUTES =
  new Set([
    "/activate-account",

    "/reset-password",
    "/reset-password/confirm",

    "/forgot-password",
    "/recover-password",
    "/password-reset",
  ]);

const PUBLIC_TECHNICAL_PREFIXES =
  Object.freeze([
    "/activate-account/",
    "/reset-password/confirm/",
  ]);

const AUTH_ROUTE_PATHS =
  new Set([
    "/login",
    "/signin",
    "/sign-in",
    "/auth",
    "/auth/login",
    "/2fa",
    "/otp",
  ]);

const AUTH_ROUTE_PREFIXES =
  Object.freeze([
    "/auth/",
  ]);

const ADMIN_ROLE_KEYS =
  new Set([
    "admin",
    "administrator",
    "administrador",

    "superadmin",
    "super_admin",
    "super_administrador",
    "super-administrador",

    "owner",
    "root",
  ]);

const SUPPORT_ROLE_KEYS =
  new Set([
    "support",
    "soporte",

    "agent",
    "agente",

    "helpdesk",

    "operator",
    "operador",

    "technician",
    "tecnico",
    "tecnica",
  ]);

const MANAGER_ROLE_KEYS =
  new Set([
    "manager",
    "gestor",
    "gerente",
    "lead",
    "leader",
    "responsable",
  ]);

const ROLE_GROUPS =
  Object.freeze({
    admin:
      ADMIN_ROLE_KEYS,

    support:
      SUPPORT_ROLE_KEYS,

    manager:
      MANAGER_ROLE_KEYS,
  });

const TOKEN_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "jwt",
    "idToken",
    "id_token",
    "bearer",
  ]);

const USER_ID_KEYS =
  Object.freeze([
    "id",
    "userId",
    "user_id",
    "_id",
    "uid",
    "sub",
    "username",
    "userName",
    "user_name",
    "email",
    "mail",
    "phone",
    "telefono",
    "mobile",
  ]);

const SENSITIVE_QUERY_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
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
  ]);

export const GUARD_REASONS =
  Object.freeze({
    allow:
      "allowed",

    routeNotFound:
      "route-not-found-delegated-to-router",

    publicTechnical:
      "public-technical-route",

    alreadyAuthenticated:
      "already-authenticated",

    notAuthenticated:
      "not-authenticated",

    insufficientRole:
      "insufficient-role",

    loginTransition:
      "login-transition-active",

    ghostAuth:
      "ghost-auth-blocked",
  });

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
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
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
    String(value).trim();

  return text || fallback;
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

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
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

    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(key)
    ) {
      return false;
    }
  }

  return fallback;
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    )
  );
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

/* =========================================================
   PATH / URL HELPERS
========================================================= */

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  const output = [];

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
    value = "/";
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
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
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function splitPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  if (isHashRouterPath(raw)) {
    return splitPath(
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
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
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

function normalizeFullPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  if (isHashRouterPath(raw)) {
    return normalizeFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    } catch {
      return "/";
    }
  }

  const {
    pathname,
    search,
    hash,
  } = splitPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  const normalized =
    normalizeFullPath(path || "/");

  const clean =
    normalized
      .split("?")[0]
      .split("#")[0] || "/";

  return normalizePathnameOnly(clean);
}

function stripPublicUsernamePrefix(path = "/") {
  const {
    pathname,
    search,
    hash,
  } = splitPath(
    normalizeFullPath(path || "/")
  );

  const clean =
    pathname.replace(/^\/@[^/]+(?=\/|$)/i, "") ||
    "/";

  return `${normalizePathnameOnly(clean)}${search}${hash}`;
}

function normalizePublicPath(path = "/") {
  const normalized =
    normalizeFullPath(path || "/");

  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }

  return normalized;
}

function safeCanonicalPath(AppCore = null, path = "/") {
  const source =
    stripPublicUsernamePrefix(path || "/");

  try {
    const normalized =
      normalizeCanonicalPath(
        AppCore,
        source
      );

    return stripSearchAndHash(
      normalized || source || "/"
    );
  } catch {
    return stripSearchAndHash(source);
  }
}

function sameCanonicalPath(a = "/", b = "/") {
  return (
    stripSearchAndHash(a) ===
    stripSearchAndHash(b)
  );
}

function isSafeRelativePath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;
  if (/[\r\n\t\\]/.test(raw)) return false;

  return true;
}

function normalizeRedirectCandidate(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  if (raw.startsWith("//")) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (parsed.origin !== getBaseOrigin()) {
        return "";
      }

      return normalizeFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    } catch {
      return "";
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return "";
  }

  return normalizeFullPath(raw);
}

function sanitizeRedirectTarget(path = "", fallback = "") {
  const candidate =
    normalizeRedirectCandidate(path);

  if (
    candidate &&
    isSafeRelativePath(candidate)
  ) {
    return candidate;
  }

  const safeFallback =
    normalizeRedirectCandidate(fallback);

  if (
    safeFallback &&
    isSafeRelativePath(safeFallback)
  ) {
    return safeFallback;
  }

  return "";
}

function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
    try {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

/* =========================================================
   RUNTIME FLAGS
========================================================= */

function getRuntimeFlags(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  return {
    loginInProgress:
      Boolean(
        state.loginInProgress ||
          state.authLoginInProgress ||
          state.isLoggingIn ||
          state.loggingIn
      ),

    loginNavigationHandled:
      Boolean(
        state.loginNavigationHandled ||
          state.authLoginNavigationHandled
      ),

    bootNavigationHandled:
      Boolean(
        state.bootNavigationHandled
      ),

    initialRouteRendered:
      Boolean(
        state.initialRouteRendered
      ),

    restoring:
      Boolean(
        state.restoring ||
          state.authRestoring ||
          state.sessionRestoring ||
          state.restoreInFlight ||
          state.authRestoreInFlight
      ),

    booting:
      Boolean(
        state.booting ||
          state.loading ||
          state.bootPhase === "booting" ||
          state.bootPhase === "restoring"
      ),
  };
}

function isLoginTransitionActive(AppCore = null) {
  const flags =
    getRuntimeFlags(AppCore);

  return Boolean(
    flags.loginInProgress ||
      flags.loginNavigationHandled
  );
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value) {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoleToken(value) {
  if (isObject(value)) {
    return normalizeRole(
      first(
        value.role,
        value.rol,
        value.name,
        value.key,
        value.id,
        value.value,
        value.authority,
        value.permission,
        ""
      )
    );
  }

  return normalizeRole(value);
}

export function normalizeGuardRoles(value) {
  if (typeof value === "string") {
    return value
      .split(/[,\s|]+/)
      .map(normalizeRole)
      .filter(Boolean);
  }

  return toArray(value)
    .flat(Infinity)
    .map(normalizeRoleToken)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function expandRoleAliases(roles = []) {
  const normalized =
    normalizeGuardRoles(roles);

  const result =
    new Set(normalized);

  if (normalized.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    result.add("admin");
  }

  if (normalized.some(isSupportRole)) {
    for (const role of SUPPORT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("support");
  }

  if (normalized.some(isManagerRole)) {
    for (const role of MANAGER_ROLE_KEYS) {
      result.add(role);
    }

    result.add("manager");
  }

  for (const role of normalized) {
    const group =
      ROLE_GROUPS[role];

    if (group instanceof Set) {
      for (const item of group) {
        result.add(item);
      }
    }
  }

  return unique(
    Array.from(result)
  );
}

/* =========================================================
   ROUTE META
========================================================= */

function routeMeta(route) {
  return isObject(route?.meta)
    ? route.meta
    : {};
}

function getRoutePath(route) {
  return stripSearchAndHash(
    first(
      route?.path,
      route?.canonicalPath,
      "/"
    )
  );
}

function isRouteExplicitlyPublic(route) {
  const meta =
    routeMeta(route);

  if (typeof route?.public === "boolean") {
    return route.public;
  }

  if (typeof meta.public === "boolean") {
    return meta.public;
  }

  if (typeof route?.requiresAuth === "boolean") {
    return route.requiresAuth === false;
  }

  if (typeof meta.requiresAuth === "boolean") {
    return meta.requiresAuth === false;
  }

  return false;
}

function isRouteExplicitlyPrivate(route) {
  const meta =
    routeMeta(route);

  if (typeof route?.requiresAuth === "boolean") {
    return route.requiresAuth;
  }

  if (typeof route?.private === "boolean") {
    return route.private;
  }

  if (typeof meta.requiresAuth === "boolean") {
    return meta.requiresAuth;
  }

  if (typeof meta.private === "boolean") {
    return meta.private;
  }

  return false;
}

function getRouteRoles(route) {
  const meta =
    routeMeta(route);

  const roleCandidates = [
    route?.role,
    route?.requiredRole,
    route?.requireRole,
    route?.allowedRole,

    meta.role,
    meta.requiredRole,
    meta.requireRole,
    meta.allowedRole,
  ];

  const roleArrays = [
    route?.roles,
    route?.allowRoles,
    route?.allowedRoles,
    route?.requiredRoles,
    route?.requireRoles,

    meta.roles,
    meta.allowRoles,
    meta.allowedRoles,
    meta.requiredRoles,
    meta.requireRoles,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) =>
      toArray(value)
    ),
  ];

  if (
    safeBoolean(route?.admin, false) ||
    safeBoolean(route?.requiresAdmin, false) ||
    safeBoolean(meta.admin, false) ||
    safeBoolean(meta.requiresAdmin, false)
  ) {
    roles.push("admin");
  }

  if (
    safeBoolean(route?.support, false) ||
    safeBoolean(route?.requiresSupport, false) ||
    safeBoolean(meta.support, false) ||
    safeBoolean(meta.requiresSupport, false)
  ) {
    roles.push("support");
  }

  if (
    safeBoolean(route?.manager, false) ||
    safeBoolean(route?.requiresManager, false) ||
    safeBoolean(meta.manager, false) ||
    safeBoolean(meta.requiresManager, false)
  ) {
    roles.push("manager");
  }

  return expandRoleAliases(roles);
}

function routeRequiresAuth(route) {
  if (isRouteExplicitlyPrivate(route)) {
    return true;
  }

  if (getRouteRoles(route).length > 0) {
    return true;
  }

  if (isRouteExplicitlyPublic(route)) {
    return false;
  }

  /*
    Política actual:
    rutas públicas por defecto.
    Las rutas privadas reales deben declarar requiresAuth/private
    o roles.
  */
  return false;
}

function routeGuestOnly(route, canonicalPath = "/") {
  const meta =
    routeMeta(route);

  const routePath =
    getRoutePath(route);

  const cleanCanonical =
    stripSearchAndHash(canonicalPath);

  if (
    AUTH_ROUTE_PATHS.has(routePath) ||
    AUTH_ROUTE_PATHS.has(cleanCanonical)
  ) {
    return true;
  }

  return Boolean(
    route?.guestOnly ??
      route?.publicOnly ??
      meta.guestOnly ??
      meta.publicOnly ??
      false
  );
}

/* =========================================================
   PUBLIC TECHNICAL ROUTES
========================================================= */

function isPublicTechnicalPath(path = "/") {
  const clean =
    stripSearchAndHash(
      stripPublicUsernamePrefix(path)
    );

  if (PUBLIC_TECHNICAL_ROUTES.has(clean)) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function isAuthRoutePath(path = "/") {
  const clean =
    stripSearchAndHash(
      stripPublicUsernamePrefix(path)
    );

  if (AUTH_ROUTE_PATHS.has(clean)) {
    return true;
  }

  return AUTH_ROUTE_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function isPublicTechnicalRoute(route, canonicalPath = "/", publicPath = null) {
  const canonical =
    stripSearchAndHash(canonicalPath);

  const visible =
    stripSearchAndHash(publicPath || canonicalPath);

  const routePath =
    getRoutePath(route);

  if (
    isPublicTechnicalPath(canonical) ||
    isPublicTechnicalPath(visible) ||
    isPublicTechnicalPath(routePath)
  ) {
    return true;
  }

  if (
    route &&
    isRouteExplicitlyPublic(route) &&
    (
      isPublicTechnicalPath(route.path) ||
      isPublicTechnicalPath(route.canonicalPath)
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   AUTH / USER RESOLUTION
========================================================= */

function getAuthUser(Auth = null) {
  try {
    if (isFunction(Auth?.getUser)) {
      return safeObject(Auth.getUser());
    }
  } catch {}

  try {
    if (isFunction(Auth?.getCurrentUser)) {
      return safeObject(Auth.getCurrentUser());
    }
  } catch {}

  try {
    if (isFunction(Auth?.currentUser)) {
      return safeObject(Auth.currentUser());
    }
  } catch {}

  try {
    if (Auth?.session?.user) {
      return safeObject(Auth.session.user);
    }
  } catch {}

  try {
    if (Auth?.user) {
      return safeObject(Auth.user);
    }
  } catch {}

  return {};
}

function getCurrentUser(AppCore = null, Auth = null) {
  return safeObject(
    first(
      AppCore?.state?.user,
      AppCore?.state?.currentUser,
      AppCore?.state?.sessionUser,
      AppCore?.state?.authUser,
      AppCore?.state?.session?.user,
      getAuthUser(Auth)
    )
  );
}

function getAuthToken(Auth = null) {
  try {
    if (isFunction(Auth?.getToken)) {
      return safeText(Auth.getToken(), "");
    }
  } catch {}

  try {
    if (isFunction(Auth?.getAccessToken)) {
      return safeText(Auth.getAccessToken(), "");
    }
  } catch {}

  try {
    if (isFunction(Auth?.getAuthHeader)) {
      const header =
        safeText(Auth.getAuthHeader(), "");

      const match =
        header.match(/^Bearer\s+(.+)$/i);

      if (match?.[1]) {
        return safeText(match[1], "");
      }

      return header;
    }
  } catch {}

  return safeText(
    first(
      Auth?.token,
      Auth?.accessToken,
      Auth?.access_token,
      Auth?.session?.token,
      Auth?.session?.accessToken,
      Auth?.session?.access_token
    ),
    ""
  );
}

function getCurrentToken(AppCore = null, Auth = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const token =
    first(
      ...TOKEN_KEYS.map((key) => state[key]),
      ...TOKEN_KEYS.map((key) => session[key]),
      getAuthToken(Auth)
    );

  return safeText(token, "");
}

function hasUsableToken(token = "") {
  const text =
    safeText(token, "");

  if (!text) {
    return false;
  }

  const lower =
    text.toLowerCase();

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "nan",
      "none",
      "[object object]",
    ].includes(lower)
  ) {
    return false;
  }

  if (/[\s\r\n\t]/.test(text)) {
    return false;
  }

  return true;
}

function hasUsableUser(user = null) {
  if (
    !user ||
    typeof user !== "object" ||
    Array.isArray(user)
  ) {
    return false;
  }

  return USER_ID_KEYS.some((key) =>
    Boolean(
      safeText(user?.[key], "")
    )
  );
}

function getUserRoleCandidates(AppCore = null, Auth = null) {
  const user =
    getCurrentUser(AppCore, Auth);

  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const rawUser =
    safeObject(user?.raw);

  const profile =
    safeObject(user?.profile);

  const rawProfile =
    safeObject(rawUser?.profile);

  const roleCandidates = [
    state.role,
    state.rol,
    state.userRole,
    state.type,
    state.perfil,

    session.role,
    session.rol,
    session.userRole,
    session.type,
    session.perfil,

    user.role,
    user.rol,
    user.userRole,
    user.user_role,
    user.type,
    user.userType,
    user.user_type,
    user.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.type,
    profile.perfil,

    rawUser.role,
    rawUser.rol,
    rawUser.userRole,
    rawUser.user_role,
    rawUser.type,
    rawUser.userType,
    rawUser.user_type,
    rawUser.perfil,

    rawProfile.role,
    rawProfile.rol,
    rawProfile.userRole,
    rawProfile.type,
    rawProfile.perfil,

    Auth?.role,
    Auth?.rol,
    Auth?.userRole,
  ];

  try {
    if (isFunction(Auth?.getRole)) {
      roleCandidates.push(
        Auth.getRole()
      );
    }
  } catch {}

  try {
    if (isFunction(Auth?.getCurrentRole)) {
      roleCandidates.push(
        Auth.getCurrentRole()
      );
    }
  } catch {}

  const roleArrays = [
    state.roles,
    state.permissions,
    state.scopes,
    state.groups,
    state.authorities,

    session.roles,
    session.permissions,
    session.scopes,
    session.groups,
    session.authorities,

    user.roles,
    user.roleList,
    user.role_list,
    user.permissions,
    user.scopes,
    user.groups,
    user.authorities,

    profile.roles,
    profile.permissions,
    profile.scopes,
    profile.groups,
    profile.authorities,

    rawUser.roles,
    rawUser.roleList,
    rawUser.role_list,
    rawUser.permissions,
    rawUser.scopes,
    rawUser.groups,
    rawUser.authorities,

    rawProfile.roles,
    rawProfile.permissions,
    rawProfile.scopes,
    rawProfile.groups,
    rawProfile.authorities,

    Auth?.roles,
    Auth?.permissions,
    Auth?.scopes,
    Auth?.groups,
    Auth?.authorities,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) =>
      toArray(value)
    ),
  ];

  const adminFlag = [
    state.isAdmin,
    state.admin,
    state.isSuperAdmin,
    state.superAdmin,
    state.canManageUsers,
    state.canAccessUsers,

    session.isAdmin,
    session.admin,
    session.isSuperAdmin,
    session.superAdmin,
    session.canManageUsers,
    session.canAccessUsers,

    user.isAdmin,
    user.admin,
    user.isSuperAdmin,
    user.superAdmin,
    user.canManageUsers,
    user.canAccessUsers,

    profile.isAdmin,
    profile.admin,
    profile.isSuperAdmin,
    profile.superAdmin,
    profile.canManageUsers,
    profile.canAccessUsers,

    rawUser.isAdmin,
    rawUser.admin,
    rawUser.isSuperAdmin,
    rawUser.superAdmin,
    rawUser.canManageUsers,
    rawUser.canAccessUsers,

    rawProfile.isAdmin,
    rawProfile.admin,
    rawProfile.isSuperAdmin,
    rawProfile.superAdmin,
    rawProfile.canManageUsers,
    rawProfile.canAccessUsers,
  ].some((value) =>
    safeBoolean(value, false)
  );

  if (adminFlag) {
    roles.push("admin");
  }

  return expandRoleAliases(roles);
}

function getUserRole(AppCore = null, Auth = null) {
  const roles =
    getUserRoleCandidates(AppCore, Auth);

  if (roles.some(isAdminRole)) return "admin";
  if (roles.some(isSupportRole)) return "support";
  if (roles.some(isManagerRole)) return "manager";

  return roles[0] || "";
}

function hasAnyAllowedRole(AppCore = null, Auth = null, allowedRoles = []) {
  const allowed =
    expandRoleAliases(allowedRoles);

  if (!allowed.length) {
    return true;
  }

  const userRoles =
    new Set(
      expandRoleAliases(
        getUserRoleCandidates(AppCore, Auth)
      )
    );

  return allowed.some((role) =>
    userRoles.has(role)
  );
}

function getAuthApiAuthenticated(Auth = null) {
  try {
    if (isFunction(Auth?.isAuthenticated)) {
      return Boolean(
        Auth.isAuthenticated()
      );
    }
  } catch {}

  return Boolean(
    Auth?.authenticated ||
      Auth?.isAuth ||
      Auth?.session?.authenticated
  );
}

function isAuthenticated(AppCore = null, Auth = null) {
  const token =
    getCurrentToken(AppCore, Auth);

  const user =
    getCurrentUser(AppCore, Auth);

  /*
    Regla anti-auth fantasma:
    - token sin user NO autentica.
    - user sin token NO autentica.
  */
  return Boolean(
    hasUsableToken(token) &&
      hasUsableUser(user)
  );
}

function hasGhostAuth(AppCore = null, Auth = null) {
  const token =
    getCurrentToken(AppCore, Auth);

  const user =
    getCurrentUser(AppCore, Auth);

  const appSaysAuth =
    Boolean(
      AppCore?.state?.authenticated ||
        getAuthApiAuthenticated(Auth)
    );

  return Boolean(
    appSaysAuth &&
      (
        !hasUsableToken(token) ||
        !hasUsableUser(user)
      )
  );
}

/* =========================================================
   REDIRECTS
========================================================= */

function getAuthenticatedRedirectTarget(AppCore, route, getRoute) {
  const explicit =
    safeText(
      first(
        route?.redirectAuthenticated,
        route?.redirectIfAuth,
        route?.meta?.redirectAuthenticated,
        route?.meta?.redirectIfAuth,
        ""
      ),
      ""
    );

  if (explicit) {
    const sanitized =
      sanitizeRedirectTarget(
        explicit,
        ""
      );

    if (
      sanitized &&
      !sameCanonicalPath(sanitized, LOGIN_PATH) &&
      !isPublicTechnicalPath(sanitized) &&
      !isAuthRoutePath(sanitized)
    ) {
      return sanitized;
    }
  }

  const home =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  return sanitizeRedirectTarget(
    home,
    HOME_PATH
  ) || HOME_PATH;
}

function buildLoginRedirectTarget(AppCore, routeNames, publicPath = "/") {
  const loginPath =
    routeNames.LOGIN || LOGIN_PATH;

  const cleanPublicPath =
    normalizePublicPath(publicPath || HOME_PATH);

  if (
    sameCanonicalPath(cleanPublicPath, loginPath) ||
    isPublicTechnicalPath(cleanPublicPath) ||
    isAuthRoutePath(cleanPublicPath)
  ) {
    return loginPath;
  }

  if (!isSafeRelativePath(cleanPublicPath)) {
    return loginPath;
  }

  try {
    const built =
      buildLoginUrl(
        AppCore,
        cleanPublicPath
      );

    return sanitizeRedirectTarget(
      built,
      loginPath
    ) || loginPath;
  } catch {
    return `${loginPath}?redirect=${encodeURIComponent(cleanPublicPath)}`;
  }
}

/* =========================================================
   RESULTS
========================================================= */

function buildAllowResult({
  route,
  canonicalPath,
  publicPath = null,
  getRoute,
  details = {},
} = {}) {
  return {
    allowed:
      true,

    reason:
      null,

    route:
      route || null,

    redirectTo:
      null,

    canonicalPath,
    publicPath,

    getRoute:
      isFunction(getRoute)
        ? getRoute
        : null,

    details:
      safeObject(details),
  };
}

function buildDenyResult({
  reason,
  route,
  redirectTo = null,
  canonicalPath,
  publicPath = null,
  details = {},
} = {}) {
  return {
    allowed:
      false,

    reason:
      reason || "blocked",

    route:
      route || null,

    redirectTo:
      redirectTo || null,

    canonicalPath,
    publicPath,

    details:
      safeObject(details),
  };
}

function buildDecisionDetails({
  AppCore,
  Auth,
  route,
  canonicalPath,
  publicPath,
  extra = {},
} = {}) {
  const user =
    getCurrentUser(AppCore, Auth);

  const token =
    getCurrentToken(AppCore, Auth);

  const userRoles =
    getUserRoleCandidates(AppCore, Auth);

  return {
    version:
      GUARDS_VERSION,

    routePath:
      getRoutePath(route),

    canonicalPath:
      redactTokenInText(canonicalPath || ""),

    publicPath:
      redactTokenInText(publicPath || ""),

    logged:
      isAuthenticated(AppCore, Auth),

    authApiAuthenticated:
      getAuthApiAuthenticated(Auth),

    ghostAuth:
      hasGhostAuth(AppCore, Auth),

    hasToken:
      hasUsableToken(token),

    hasUser:
      hasUsableUser(user),

    currentRole:
      getUserRole(AppCore, Auth),

    userRoles,

    runtime:
      getRuntimeFlags(AppCore),

    ...safeObject(extra),
  };
}

/* =========================================================
   MAIN GUARD
========================================================= */

export function shouldAllowRoute({
  AppCore,
  Auth,
  route,
  requestedCanonicalPath = "/",
  requestedPublicPath = null,
  getRoute,
} = {}) {
  const routeNames =
    getRouteNames(AppCore);

  const canonicalPath =
    safeCanonicalPath(
      AppCore,
      requestedCanonicalPath
    );

  const publicPath =
    normalizePublicPath(
      requestedPublicPath ||
        canonicalPath
    );

  /*
    Ruta inexistente:
    No bloquear aquí. El Router resuelve 404.
  */
  if (!route) {
    return buildAllowResult({
      route:
        null,
      canonicalPath,
      publicPath,
      getRoute,
      details:
        buildDecisionDetails({
          AppCore,
          Auth,
          route:
            null,
          canonicalPath,
          publicPath,
          extra: {
            reason:
              GUARD_REASONS.routeNotFound,
          },
        }),
    });
  }

  /*
    Prioridad absoluta:
    rutas públicas técnicas pasan siempre, incluso con sesión previa.
  */
  if (
    isPublicTechnicalRoute(
      route,
      canonicalPath,
      publicPath
    )
  ) {
    return buildAllowResult({
      route,
      canonicalPath,
      publicPath,
      getRoute,
      details:
        buildDecisionDetails({
          AppCore,
          Auth,
          route,
          canonicalPath,
          publicPath,
          extra: {
            reason:
              GUARD_REASONS.publicTechnical,
            publicTechnical:
              true,
          },
        }),
    });
  }

  const logged =
    isAuthenticated(
      AppCore,
      Auth
    );

  const ghostAuth =
    hasGhostAuth(
      AppCore,
      Auth
    );

  const currentRole =
    getUserRole(
      AppCore,
      Auth
    );

  const userRoles =
    getUserRoleCandidates(
      AppCore,
      Auth
    );

  const guestOnly =
    routeGuestOnly(
      route,
      canonicalPath
    );

  const allowedRoles =
    getRouteRoles(route);

  const requiresAuth =
    routeRequiresAuth(route);

  /*
    Guest-only:
    normalmente /login.
    Durante transición de login no forzamos redirect extra.
  */
  if (
    guestOnly &&
    logged
  ) {
    if (isLoginTransitionActive(AppCore)) {
      return buildAllowResult({
        route,
        canonicalPath,
        publicPath,
        getRoute,
        details:
          buildDecisionDetails({
            AppCore,
            Auth,
            route,
            canonicalPath,
            publicPath,
            extra: {
              reason:
                GUARD_REASONS.loginTransition,
              guestOnly,
              logged,
              loginTransitionActive:
                true,
              currentRole,
              userRoles,
            },
          }),
      });
    }

    return buildDenyResult({
      reason:
        GUARD_REASONS.alreadyAuthenticated,

      route,

      redirectTo:
        getAuthenticatedRedirectTarget(
          AppCore,
          route,
          getRoute
        ) ||
        routeNames.HOME ||
        HOME_PATH,

      canonicalPath,
      publicPath,

      details:
        buildDecisionDetails({
          AppCore,
          Auth,
          route,
          canonicalPath,
          publicPath,
          extra: {
            guestOnly,
            currentRole,
            userRoles,
          },
        }),
    });
  }

  /*
    Auth obligatoria.
    Si hay ghost auth, se trata como no autenticado.
  */
  if (
    requiresAuth &&
    !logged
  ) {
    return buildDenyResult({
      reason:
        ghostAuth
          ? GUARD_REASONS.ghostAuth
          : GUARD_REASONS.notAuthenticated,

      route,

      redirectTo:
        buildLoginRedirectTarget(
          AppCore,
          routeNames,
          publicPath
        ),

      canonicalPath,
      publicPath,

      details:
        buildDecisionDetails({
          AppCore,
          Auth,
          route,
          canonicalPath,
          publicPath,
          extra: {
            requiresAuth,
            allowedRoles,
            ghostAuth,
          },
        }),
    });
  }

  /*
    Roles declarados implican auth.
  */
  if (
    allowedRoles.length > 0 &&
    !logged
  ) {
    return buildDenyResult({
      reason:
        ghostAuth
          ? GUARD_REASONS.ghostAuth
          : GUARD_REASONS.notAuthenticated,

      route,

      redirectTo:
        buildLoginRedirectTarget(
          AppCore,
          routeNames,
          publicPath
        ),

      canonicalPath,
      publicPath,

      details:
        buildDecisionDetails({
          AppCore,
          Auth,
          route,
          canonicalPath,
          publicPath,
          extra: {
            requiresAuth:
              true,
            allowedRoles,
            ghostAuth,
          },
        }),
    });
  }

  /*
    Roles y sesión válida.
    Candado real para rutas admin aunque el rol venga como alias.
  */
  if (
    allowedRoles.length > 0 &&
    logged
  ) {
    const hasAllowedRole =
      hasAnyAllowedRole(
        AppCore,
        Auth,
        allowedRoles
      );

    if (!hasAllowedRole) {
      const forbiddenRedirect =
        sanitizeRedirectTarget(
          route.redirectForbidden ||
            route.meta?.redirectForbidden ||
            "",
          ""
        );

      return buildDenyResult({
        reason:
          GUARD_REASONS.insufficientRole,

        route,

        redirectTo:
          forbiddenRedirect || null,

        canonicalPath,
        publicPath,

        details:
          buildDecisionDetails({
            AppCore,
            Auth,
            route,
            canonicalPath,
            publicPath,
            extra: {
              currentRole,
              userRoles,
              allowedRoles,
            },
          }),
      });
    }
  }

  return buildAllowResult({
    route,
    canonicalPath,
    publicPath,
    getRoute,
    details:
      buildDecisionDetails({
        AppCore,
        Auth,
        route,
        canonicalPath,
        publicPath,
        extra: {
          reason:
            GUARD_REASONS.allow,
          logged,
          ghostAuth,
          currentRole,
          userRoles,
          guestOnly,
          requiresAuth,
          allowedRoles,
        },
      }),
  });
}

/* =========================================================
   DEBUG
========================================================= */

export function getGuardsSnapshot({
  AppCore = null,
  Auth = null,
  route = null,
  requestedCanonicalPath = AppCore?.state?.route || "/",
  requestedPublicPath = AppCore?.state?.publicPath || requestedCanonicalPath,
  getRoute = null,
} = {}) {
  const canonicalPath =
    safeCanonicalPath(
      AppCore,
      requestedCanonicalPath
    );

  const publicPath =
    normalizePublicPath(
      requestedPublicPath ||
        canonicalPath
    );

  const access =
    shouldAllowRoute({
      AppCore,
      Auth,
      route,
      requestedCanonicalPath:
        canonicalPath,
      requestedPublicPath:
        publicPath,
      getRoute,
    });

  const user =
    getCurrentUser(
      AppCore,
      Auth
    );

  const token =
    getCurrentToken(
      AppCore,
      Auth
    );

  return {
    version:
      GUARDS_VERSION,

    canonicalPath:
      redactTokenInText(canonicalPath),

    publicPath:
      redactTokenInText(publicPath),

    route:
      route
        ? {
            path:
              route.path || null,
            canonicalPath:
              route.canonicalPath || null,
            name:
              route.name || null,
            viewKey:
              route.viewKey || null,
            viewName:
              route.viewName || null,
            public:
              route.public,
            requiresAuth:
              route.requiresAuth,
            private:
              route.private,
            guestOnly:
              route.guestOnly,
            roles:
              route.roles || [],
            meta:
              route.meta || null,
          }
        : null,

    auth: {
      logged:
        isAuthenticated(
          AppCore,
          Auth
        ),

      ghostAuth:
        hasGhostAuth(
          AppCore,
          Auth
        ),

      authApiAuthenticated:
        getAuthApiAuthenticated(Auth),

      hasToken:
        hasUsableToken(token),

      hasUser:
        hasUsableUser(user),

      currentRole:
        getUserRole(
          AppCore,
          Auth
        ),

      userRoles:
        getUserRoleCandidates(
          AppCore,
          Auth
        ),
    },

    routeAccess: {
      routeRequiresAuth:
        route
          ? routeRequiresAuth(route)
          : false,

      guestOnly:
        route
          ? routeGuestOnly(route, canonicalPath)
          : false,

      routeRoles:
        route
          ? getRouteRoles(route)
          : [],

      publicTechnical:
        route
          ? isPublicTechnicalRoute(
              route,
              canonicalPath,
              publicPath
            )
          : false,
    },

    runtime:
      getRuntimeFlags(AppCore),

    access,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  GUARDS_VERSION,
  GUARD_REASONS,

  shouldAllowRoute,

  normalizeGuardRoles,
  getGuardsSnapshot,
};

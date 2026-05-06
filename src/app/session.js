/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   ONION SUPPORT · APP SESSION BOOTSTRAP
   AUTH RESTORE SAFE · TOKEN ROUTES SAFE · EXTREME 12/10

   RESPONSABILIDADES:
   - Restaurar sesión durante boot sin romper rutas públicas técnicas.
   - Evitar restores duplicados en paralelo.
   - Sincronizar UI de usuario tras restore.
   - Navegación post-login segura.
   - Diagnóstico robusto de sesión.
   - No romper rutas contextualizadas.
   - No pisar /activate-account?token=...
   - No pisar /activate-account/<token>
   - No pisar /reset-password/confirm?token=...
   - No pisar /reset-password/confirm/<token>
   - No redirigir activation/reset aunque exista sesión previa.
   - Evitar doble navegación después de login.
   - Evitar repaint fantasma desde /login.
   - Reparar shell/auth-screen tras navegación autenticada.
   - Emitir eventos de sesión sin duplicados.

   HARDENING:
   - Restore serializado real, incluso si state es parcial o inexistente.
   - Anti race conditions.
   - Tolerancia total si Auth falla.
   - No doble navegación durante boot.
   - No contaminar publicPath/canonicalPath.
   - Warmup aislado.
   - Snapshot consistente y con URLs sensibles redacted.
   - Rutas públicas técnicas con soporte query-token, hash-token y path-token.
   - Router.navigate/goAfterLogin esperados si devuelven Promise.
   - Soporte alias legacy reset initial URL.
   - Soporte __ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__.
   - Soporte __ONION_RESET_CONFIRM_INITIAL_URL__.
   - Soporte scrubbedResetToken y scrubbedResetPasswordToken.
   - Canonical seguro para rutas públicas /@username/...
   - Auth fantasma bloqueada: authenticated=true sin user usable NO autentica.
   - Redirect interno seguro anti open-redirect.

   FIX CRÍTICO:
   - bootNavigationHandled solo se marca cuando Router navega/renderiza.
   - Las rutas públicas técnicas bloquean navegación, pero NO bloquean render inicial.
   - syncUserUI se ejecuta una sola vez, con fallback legacy solo si falla modo moderno.
   - restoreSessionInBackground emite session:restored una sola vez.
   - emit() no duplica AppCore.events + window event.
   - No se intenta navegación post-restore si hay login en curso.
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOGIN_PATH = "/login";
const ACTIVATION_PATH = "/activate-account";
const RESET_PASSWORD_PATH = "/reset-password";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const SESSION_READY_EVENT_DEDUPE_MS = 160;

const PUBLIC_TECHNICAL_ROUTES = new Set([
  ACTIVATION_PATH,
  RESET_PASSWORD_PATH,
  RESET_CONFIRM_PATH,
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

const PUBLIC_TECHNICAL_PREFIXES = [
  `${ACTIVATION_PATH}/`,
  `${RESET_CONFIRM_PATH}/`,
];

const AUTH_LIKE_ROUTES = new Set([
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
  RESET_CONFIRM_PATH,
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  ACTIVATION_PATH,
]);

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

const RESET_TOKEN_PARAM_NAMES = [
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
];

const TOKEN_ROUTE_CONFIGS = Object.freeze([
  Object.freeze({
    key: "activation",
    path: ACTIVATION_PATH,
    initialWindowKey: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    initialWindowKeys: [
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ],
    scrubbedHistoryFlag: "scrubbedActivationToken",
    scrubbedHistoryFlags: [
      "scrubbedActivationToken",
    ],
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    key: "resetConfirm",
    path: RESET_CONFIRM_PATH,
    initialWindowKey: "__ONION_RESET_CONFIRM_INITIAL_URL__",
    initialWindowKeys: [
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ],
    scrubbedHistoryFlag: "scrubbedResetToken",
    scrubbedHistoryFlags: [
      "scrubbedResetToken",
      "scrubbedResetPasswordToken",
    ],
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

/* =========================================================
   MODULE RUNTIME
========================================================= */

let lastSessionReadyEmitKey = "";
let lastSessionReadyEmitAt = 0;
let moduleSessionRestorePromise = null;

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

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

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

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[AppSession]", ...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let coreLogged = false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn("[AppSession]", ...args);
      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.warn("[AppSession]", ...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  let coreLogged = false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error("[AppSession]", ...args);
      coreLogged = true;
    }
  } catch {
    coreLogged = false;
  }

  if (coreLogged) {
    return;
  }

  try {
    console.error("[AppSession]", ...args);
  } catch {}
}

function getState(AppCore) {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function getResolvedSessionUser(AppCore) {
  const state = getState(AppCore);

  return (
    state?.user?.username ||
    state?.user?.email ||
    state?.user?.id ||
    state?.user?.userId ||
    state?.currentUser?.username ||
    state?.currentUser?.email ||
    state?.currentUser?.id ||
    state?.sessionUser?.username ||
    state?.sessionUser?.email ||
    state?.sessionUser?.id ||
    state?.authUser?.username ||
    state?.authUser?.email ||
    state?.authUser?.id ||
    state?.session?.user?.username ||
    state?.session?.user?.email ||
    state?.session?.user?.id ||
    null
  );
}

function getResolvedSessionRole(AppCore) {
  const state = getState(AppCore);

  return (
    state?.role ||
    state?.rol ||
    state?.userRole ||
    state?.session?.role ||
    state?.session?.rol ||
    state?.user?.role ||
    state?.user?.rol ||
    state?.currentUser?.role ||
    state?.currentUser?.rol ||
    state?.sessionUser?.role ||
    state?.sessionUser?.rol ||
    state?.authUser?.role ||
    state?.authUser?.rol ||
    null
  );
}

function hasUsableSessionUser(user = null) {
  if (
    !user ||
    typeof user !== "object" ||
    Array.isArray(user)
  ) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.phone, "") ||
      safeText(user.telefono, "") ||
      safeText(user.mobile, "")
  );
}

function isAuthenticated(AppCore) {
  const state = getState(AppCore);

  if (state.authenticated !== true) {
    return false;
  }

  return hasUsableSessionUser(
    state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.session?.user ||
      null
  );
}

function isAuthLoginInProgress(Auth, state = {}) {
  try {
    if (state?.loginInProgress === true) {
      return true;
    }
  } catch {}

  try {
    if (state?.authLoginInProgress === true) {
      return true;
    }
  } catch {}

  try {
    if (state?.isLoggingIn === true) {
      return true;
    }
  } catch {}

  try {
    if (Auth?.session?.loggingIn === true) {
      return true;
    }
  } catch {}

  try {
    if (Auth?.session?.loginPromise) {
      return true;
    }
  } catch {}

  try {
    if (Auth?.loginPromise) {
      return true;
    }
  } catch {}

  return false;
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts = safeObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;
      AppCore.events.emit(name, payload);
      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  const value = safeText(path, "/");

  return normalizePathnameOnly(
    value.split("?")[0].split("#")[0] || "/"
  );
}

function normalizeInternalPath(path = "/") {
  const raw = safeText(path, "/") || "/";

  const clean = raw.startsWith("/")
    ? raw
    : `/${raw}`;

  return clean
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";
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

function isHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${normalizePathnameOnly(parsed.pathname || "/")}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex = raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash = raw.slice(hashIndex);

      if (isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }
    }

    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function getWindowValue(key = "") {
  if (!isBrowser() || !key) {
    return "";
  }

  try {
    return safeText(window[key], "");
  } catch {
    return "";
  }
}

function getWindowFirstValue(keys = []) {
  if (!Array.isArray(keys)) {
    return "";
  }

  for (const key of keys) {
    const value = getWindowValue(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function getInitialUrl() {
  return getWindowValue("__ONION_INITIAL_URL__");
}

function getActivationInitialUrl() {
  return getWindowFirstValue([
    "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
  ]);
}

function getResetConfirmInitialUrl() {
  return getWindowFirstValue([
    "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
    "__ONION_RESET_CONFIRM_INITIAL_URL__",
  ]);
}

/* =========================================================
   TOKEN / PUBLIC ROUTE HELPERS
========================================================= */

function hasTokenInSearch(search = "", names = []) {
  try {
    const params = new URLSearchParams(search || "");

    return names.some((name) =>
      Boolean(safeText(params.get(name), ""))
    );
  } catch {
    return false;
  }
}

function extractPathToken(pathOrUrl = "", basePath = ACTIVATION_PATH) {
  const normalized = pathFromUrlLike(pathOrUrl) || pathOrUrl || "";
  const pathname = stripSearchAndHash(normalized);

  const parts = pathname.split("/").filter(Boolean);
  const baseParts = basePath.split("/").filter(Boolean);

  if (!baseParts.length) {
    return "";
  }

  for (let i = 0; i <= parts.length - baseParts.length; i += 1) {
    const matches = baseParts.every((part, index) => {
      return parts[i + index] === part;
    });

    if (!matches) {
      continue;
    }

    const token = parts[i + baseParts.length];

    if (!token) {
      return "";
    }

    try {
      return safeText(decodeURIComponent(token), "");
    } catch {
      return safeText(token, "");
    }
  }

  return "";
}

function hasRouteToken({
  value = "",
  basePath = "",
  tokenParamNames = [],
} = {}) {
  const raw = safeText(value, "");

  if (!raw || !basePath) {
    return false;
  }

  if (extractPathToken(raw, basePath)) {
    return true;
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    const parsedPath =
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;

    if (extractPathToken(parsedPath, basePath)) {
      return true;
    }

    if (
      hasTokenInSearch(
        parsed.search,
        tokenParamNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query = parsed.hash
        .split("?")
        .slice(1)
        .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        tokenParamNames
      );
    }
  } catch {
    const path = pathFromUrlLike(raw) || raw;

    if (extractPathToken(path, basePath)) {
      return true;
    }

    if (raw.includes("?")) {
      const query = raw
        .split("?")
        .slice(1)
        .join("?")
        .split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          tokenParamNames
        )
      ) {
        return true;
      }
    }

    if (
      raw.includes("#") &&
      raw.includes("?")
    ) {
      const query = raw
        .split("?")
        .slice(1)
        .join("?");

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          tokenParamNames
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasActivationToken(value = "") {
  return hasRouteToken({
    value,
    basePath: ACTIVATION_PATH,
    tokenParamNames: ACTIVATION_TOKEN_PARAM_NAMES,
  });
}

function hasResetConfirmToken(value = "") {
  return hasRouteToken({
    value,
    basePath: RESET_CONFIRM_PATH,
    tokenParamNames: RESET_TOKEN_PARAM_NAMES,
  });
}

function isHistoryStateFlagEnabled(flag = "") {
  if (!isBrowser() || !flag) {
    return false;
  }

  try {
    return Boolean(window.history?.state?.[flag]);
  } catch {
    return false;
  }
}

function isActivationTokenScrubbed() {
  return isHistoryStateFlagEnabled("scrubbedActivationToken");
}

function isResetConfirmTokenScrubbed() {
  return (
    isHistoryStateFlagEnabled("scrubbedResetToken") ||
    isHistoryStateFlagEnabled("scrubbedResetPasswordToken")
  );
}

function isPublicUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

function stripPublicUsernamePrefixFromPath(path = "/") {
  const normalized = pathFromUrlLike(path) || path || "/";
  const clean = stripSearchAndHash(normalized);

  const segments = clean
    .split("/")
    .filter(Boolean);

  if (
    segments.length > 0 &&
    isPublicUsernameSegment(segments[0])
  ) {
    const rest = segments.slice(1).join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : "/";
  }

  return clean;
}

function getBootInitialPath(AppCore) {
  const state = getState(AppCore);

  return (
    safeText(state.bootProtectedInitialPath, "") ||
    safeText(state.bootActivationInitialPath, "") ||
    safeText(state.bootResetConfirmInitialPath, "") ||
    pathFromUrlLike(getActivationInitialUrl()) ||
    pathFromUrlLike(getResetConfirmInitialUrl()) ||
    pathFromUrlLike(safeText(state.bootProtectedInitialUrl, "")) ||
    pathFromUrlLike(safeText(state.bootInitialUrl, "")) ||
    pathFromUrlLike(getInitialUrl()) ||
    getBrowserPublicPath() ||
    safeText(state.publicPath, "") ||
    safeText(state.route, "/")
  );
}

function getCanonicalFromAnyPath(path = "/") {
  return stripPublicUsernamePrefixFromPath(
    pathFromUrlLike(path) || path || "/"
  );
}

function isPublicTechnicalCanonicalPath(canonicalPath = "/") {
  const clean = stripSearchAndHash(canonicalPath || "/");

  if (PUBLIC_TECHNICAL_ROUTES.has(clean)) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function isActivationCanonicalPath(canonicalPath = "/") {
  const clean = stripSearchAndHash(canonicalPath);

  return (
    clean === ACTIVATION_PATH ||
    clean.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function isResetConfirmCanonicalPath(canonicalPath = "/") {
  const clean = stripSearchAndHash(canonicalPath);

  return (
    clean === RESET_CONFIRM_PATH ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
  );
}

function isLoginCanonicalPath(canonicalPath = "/") {
  return stripSearchAndHash(canonicalPath) === LOGIN_PATH;
}

function isAuthLikeCanonicalPath(canonicalPath = "/") {
  const clean = stripSearchAndHash(canonicalPath);

  if (AUTH_LIKE_ROUTES.has(clean)) {
    return true;
  }

  return (
    clean.startsWith(`${ACTIVATION_PATH}/`) ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
  );
}

function isActivationBoot(AppCore) {
  const state = getState(AppCore);

  if (
    state.bootIsActivation === true &&
    state.bootHasActivationToken === true
  ) {
    return true;
  }

  if (isActivationTokenScrubbed()) {
    return false;
  }

  const candidates = [
    state.bootActivationInitialUrl,
    state.bootProtectedInitialUrl,
    getActivationInitialUrl(),
    state.bootInitialUrl,
    getInitialUrl(),
    getBrowserPublicPath(),
    state.publicPath,
    state.route,
  ];

  return candidates.some((candidate) => {
    const value = safeText(candidate, "");

    if (!value) {
      return false;
    }

    return (
      isActivationCanonicalPath(getCanonicalFromAnyPath(value)) &&
      hasActivationToken(value)
    );
  });
}

function isResetConfirmBoot(AppCore) {
  const state = getState(AppCore);

  if (
    state.bootIsResetConfirm === true &&
    state.bootHasResetToken === true
  ) {
    return true;
  }

  if (isResetConfirmTokenScrubbed()) {
    return false;
  }

  const candidates = [
    state.bootResetConfirmInitialUrl,
    state.bootProtectedInitialUrl,
    getResetConfirmInitialUrl(),
    state.bootInitialUrl,
    getInitialUrl(),
    getBrowserPublicPath(),
    state.publicPath,
    state.route,
  ];

  return candidates.some((candidate) => {
    const value = safeText(candidate, "");

    if (!value) {
      return false;
    }

    return (
      isResetConfirmCanonicalPath(getCanonicalFromAnyPath(value)) &&
      hasResetConfirmToken(value)
    );
  });
}

function isPublicTechnicalBoot(AppCore) {
  const bootPath = getBootInitialPath(AppCore);
  const canonical = getCanonicalFromAnyPath(bootPath || "/");

  return (
    isPublicTechnicalCanonicalPath(canonical) ||
    isActivationBoot(AppCore) ||
    isResetConfirmBoot(AppCore)
  );
}

function getCurrentCanonicalSafe(AppCore, Router) {
  try {
    const value = getCurrentCanonicalPath(AppCore, Router);

    if (value) {
      return stripSearchAndHash(
        getCanonicalFromAnyPath(value)
      );
    }
  } catch {}

  const publicPath = safeText(getState(AppCore).publicPath, "");

  if (publicPath) {
    return stripSearchAndHash(
      getCanonicalFromAnyPath(publicPath)
    );
  }

  const route = safeText(getState(AppCore).route, "");

  if (route) {
    return stripSearchAndHash(
      getCanonicalFromAnyPath(route)
    );
  }

  const bootPath = getBootInitialPath(AppCore);

  return getCanonicalFromAnyPath(bootPath || "/");
}

function getCurrentPublicSafe(AppCore, Router) {
  try {
    const value = getCurrentPublicPath(AppCore, Router);

    if (value) {
      return value;
    }
  } catch {}

  return (
    safeText(getState(AppCore).publicPath, "") ||
    getBootInitialPath(AppCore) ||
    "/"
  );
}

/* =========================================================
   REDACTION / SNAPSHOTS
========================================================= */

function redactTokenInText(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  let output = raw;

  for (const config of TOKEN_ROUTE_CONFIGS) {
    const escapedPath = config.path.replace(/\//g, "\\/");

    try {
      output = output.replace(
        new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
        "$1/***"
      );
    } catch {}

    for (const name of config.tokenParamNames) {
      try {
        output = output.replace(
          new RegExp(`([?&#]${name}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
      } catch {}
    }
  }

  return output;
}

function buildSnapshot(AppCore, extras = {}) {
  const state = getState(AppCore);

  return {
    authenticated: isAuthenticated(AppCore),
    user: state.user || null,
    username: getResolvedSessionUser(AppCore),
    role: getResolvedSessionRole(AppCore),

    route: state.route || "/",
    publicPath: state.publicPath || "/",

    bootInitialUrl:
      redactTokenInText(
        state.bootInitialUrl ||
          getInitialUrl() ||
          ""
      ) || null,

    bootProtectedInitialUrl:
      redactTokenInText(
        state.bootProtectedInitialUrl ||
          ""
      ) || null,

    bootActivationInitialUrl:
      redactTokenInText(
        state.bootActivationInitialUrl ||
          getActivationInitialUrl() ||
          ""
      ) || null,

    bootResetConfirmInitialUrl:
      redactTokenInText(
        state.bootResetConfirmInitialUrl ||
          getResetConfirmInitialUrl() ||
          ""
      ) || null,

    bootIsActivation: Boolean(state.bootIsActivation),
    bootHasActivationToken: Boolean(state.bootHasActivationToken),
    bootIsResetConfirm: Boolean(state.bootIsResetConfirm),
    bootHasResetToken: Boolean(state.bootHasResetToken),

    activationTokenScrubbed: isActivationTokenScrubbed(),
    resetConfirmTokenScrubbed: isResetConfirmTokenScrubbed(),

    ...extras,
  };
}

/* =========================================================
   UI / SHELL REPAIR
========================================================= */

async function runSyncUserUI({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  reason = "session-sync",
} = {}) {
  if (!isFunction(syncUserUI)) {
    return false;
  }

  const context = {
    AppCore,
    Auth,
    Router,
    reason,
  };

  let synced = false;

  try {
    await Promise.resolve(syncUserUI(context));
    synced = true;
  } catch (error) {
    safeWarn(
      AppCore,
      "syncUserUI(context) falló. Probando compat legacy.",
      error
    );

    try {
      await Promise.resolve(syncUserUI(AppCore));
      synced = true;
    } catch (legacyError) {
      safeWarn(
        AppCore,
        "syncUserUI(AppCore) también falló.",
        legacyError
      );
    }
  }

  emit(
    AppCore,
    "app:ui:repair-request",
    {
      reason,
      authenticated: isAuthenticated(AppCore),
      user: getState(AppCore).user || null,
      role: getResolvedSessionRole(AppCore),
      source: "AppSession",
      repairShell: false,
      hardRepair: false,
      rebind: false,
    }
  );

  return synced;
}

function clearAuthScreenDomState({
  AppCore,
  Router,
  reason = "authenticated-route",
  force = false,
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  const authenticated = isAuthenticated(AppCore);
  const canonical = getCurrentCanonicalSafe(AppCore, Router);
  const authLike = isAuthLikeCanonicalPath(canonical);

  if (
    !authenticated ||
    (!force && authLike)
  ) {
    return false;
  }

  try {
    document.documentElement?.classList?.remove?.(
      "route-auth",
      "route-shell-hidden"
    );

    document.documentElement?.classList?.add?.(
      "route-app",
      "route-shell-visible"
    );

    document.body?.classList?.remove?.(
      "auth-screen",
      "login-no-scroll",
      "route-auth",
      "route-shell-hidden"
    );

    document.body?.classList?.add?.(
      "route-app",
      "route-shell-visible"
    );

    document.body?.removeAttribute?.("data-auth-screen");

    document.body?.setAttribute?.(
      "data-authenticated",
      "true"
    );
  } catch {}

  try {
    const shell = document.getElementById("app-shell");

    if (shell) {
      shell.hidden = false;
      shell.setAttribute("aria-hidden", "false");
      shell.setAttribute("aria-busy", "false");
      shell.dataset.shellInteractive = "true";
    }
  } catch {}

  try {
    const main = document.getElementById("main-content");

    if (main) {
      main.hidden = false;
      main.setAttribute("aria-hidden", "false");
      main.setAttribute("aria-busy", "false");
    }
  } catch {}

  try {
    const view = document.getElementById("view-container");

    if (view) {
      view.hidden = false;
      view.setAttribute("aria-hidden", "false");
      view.setAttribute("aria-busy", "false");
    }
  } catch {}

  emit(
    AppCore,
    "app:shell:auth-screen-cleared",
    {
      reason,
      canonical,
      authenticated,
      source: "AppSession",
    }
  );

  return true;
}

function buildSessionReadyPayload({
  AppCore,
  reason = "session-ready",
  result = {},
} = {}) {
  return {
    reason,
    ok:
      Boolean(result?.ok) ||
      isAuthenticated(AppCore),

    authenticated:
      isAuthenticated(AppCore),

    user:
      getState(AppCore).user || null,

    username:
      getResolvedSessionUser(AppCore),

    role:
      getResolvedSessionRole(AppCore),

    route:
      getState(AppCore).route || "/",

    publicPath:
      getState(AppCore).publicPath || "/",

    navigationHandled:
      Boolean(
        result?.navigationHandled ||
          result?.navigated ||
          result?.didNavigate ||
          result?.redirected
      ),

    source:
      "AppSession",
  };
}

function emitSessionReadyEvents({
  AppCore,
  reason = "session-ready",
  result = {},
  dedupe = true,
} = {}) {
  const payload = buildSessionReadyPayload({
    AppCore,
    reason,
    result,
  });

  const key = [
    payload.authenticated ? "auth" : "anon",
    safeText(payload.username, ""),
    safeText(payload.role, ""),
    safeText(payload.route, ""),
    safeText(payload.publicPath, ""),
    payload.navigationHandled ? "nav" : "no-nav",
  ].join("|");

  const timestamp = Date.now();

  if (
    dedupe &&
    key === lastSessionReadyEmitKey &&
    timestamp - lastSessionReadyEmitAt < SESSION_READY_EVENT_DEDUPE_MS
  ) {
    return payload;
  }

  lastSessionReadyEmitKey = key;
  lastSessionReadyEmitAt = timestamp;

  emit(AppCore, "auth:session:restored", payload);
  emit(AppCore, "app:session:restored", payload);
  emit(AppCore, "app:user:change", payload);

  emit(
    AppCore,
    "app:ui:repair-request",
    {
      ...payload,
      repairShell: false,
      hardRepair: false,
      rebind: false,
    }
  );

  return payload;
}

/* =========================================================
   NAVIGATION GUARDS
========================================================= */

function shouldSkipNavigation(state, Auth = null) {
  return Boolean(
    state?.bootNavigationHandled ||
      state?.loginNavigationHandled ||
      state?.loginInProgress ||
      isAuthLoginInProgress(Auth, state)
  );
}

function markNavigationHandled(state, value = true) {
  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.bootNavigationHandled = Boolean(value);
    }
  } catch {}
}

function markNavigationSkipped(state, reason = "unknown") {
  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.postRestoreNavigationSkipped = true;
      state.postRestoreNavigationSkippedReason = reason;
    }
  } catch {}
}

function isSafeInternalTarget(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return false;
  }

  if (!raw.startsWith("/")) {
    return false;
  }

  if (raw.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return false;
  }

  if (/[\r\n\t]/.test(raw)) {
    return false;
  }

  return true;
}

function normalizeTargetPath(path = "/") {
  const raw = safeText(path, "/") || "/";

  if (!isSafeInternalTarget(raw)) {
    return "/";
  }

  const target = normalizeInternalPath(raw);

  if (!isSafeInternalTarget(target)) {
    return "/";
  }

  return target;
}

function samePath(a = "/", b = "/") {
  return (
    stripSearchAndHash(a) ===
    stripSearchAndHash(b)
  );
}

/* =========================================================
   TARGET RESOLUTION
========================================================= */

function resolvePostLoginTarget({
  AppCore,
  Auth,
} = {}) {
  const user = getState(AppCore).user || null;

  try {
    if (isFunction(Auth?.getPostLoginTarget)) {
      const next = Auth.getPostLoginTarget(user, {});

      if (
        next &&
        typeof next === "string"
      ) {
        const normalized = normalizeTargetPath(next);

        if (
          normalized &&
          normalized !== LOGIN_PATH &&
          !isAuthLikeCanonicalPath(normalized)
        ) {
          return normalized;
        }
      }
    }
  } catch {}

  const state = getState(AppCore);

  const candidates = [
    state.postLoginTarget,
    state.redirectAfterLogin,
    state.returnTo,
    state.lastPrivatePath,
  ];

  for (const candidate of candidates) {
    const value = safeText(candidate, "");

    if (!value) {
      continue;
    }

    const normalized = normalizeTargetPath(value);

    if (
      normalized &&
      normalized !== LOGIN_PATH &&
      !isAuthLikeCanonicalPath(normalized)
    ) {
      return normalized;
    }
  }

  return "/";
}

/* =========================================================
   ROUTER NAVIGATION
========================================================= */

async function runMaybePromise(value) {
  if (
    value &&
    isFunction(value.then)
  ) {
    await value;
  }

  return value;
}

async function runRouterNavigation({
  AppCore,
  Router,
  target = "/",
  replaceState = true,
  force = false,
} = {}) {
  if (!Router) {
    return false;
  }

  /*
    Preferimos goAfterLogin si existe porque algunos routers centralizan ahí:
    - replaceState
    - limpieza de returnTo
    - shell/auth-screen
    - canonical/publicPath sync
  */
  try {
    if (isFunction(Router.goAfterLogin)) {
      await runMaybePromise(
        Router.goAfterLogin(target)
      );

      return true;
    }
  } catch (error) {
    safeWarn(AppCore, "Router.goAfterLogin() falló:", error);
  }

  try {
    if (isFunction(Router.navigate)) {
      await runMaybePromise(
        Router.navigate(
          target,
          {
            replaceState,
            force,
          }
        )
      );

      return true;
    }
  } catch (error) {
    safeWarn(AppCore, "Router.navigate() falló:", error);
  }

  return false;
}

/* =========================================================
   NAVEGACIÓN POST RESTORE
========================================================= */

export async function navigateAfterSessionRestore({
  AppCore,
  Auth,
  Router,
  state,
} = {}) {
  if (
    !AppCore ||
    !Router
  ) {
    return false;
  }

  if (!isAuthenticated(AppCore)) {
    return false;
  }

  const currentCanonicalPath = getCurrentCanonicalSafe(AppCore, Router);
  const currentPublicPath = getCurrentPublicSafe(AppCore, Router);

  const publicTechnical =
    isPublicTechnicalCanonicalPath(currentCanonicalPath) ||
    isPublicTechnicalCanonicalPath(currentPublicPath) ||
    isActivationBoot(AppCore) ||
    isResetConfirmBoot(AppCore) ||
    isResetConfirmCanonicalPath(currentCanonicalPath) ||
    isResetConfirmCanonicalPath(currentPublicPath);

  /*
    No navegar nunca desde rutas públicas técnicas.
    No marcamos bootNavigationHandled: App.index aún debe poder renderizar.
  */
  if (publicTechnical) {
    markNavigationSkipped(state, "public-technical-route");

    safeLog(
      AppCore,
      "navigateAfterSessionRestore(): omitido por ruta pública técnica.",
      {
        canonical: redactTokenInText(currentCanonicalPath),
        publicPath: redactTokenInText(currentPublicPath),
        activationBoot: isActivationBoot(AppCore),
        resetConfirmBoot: isResetConfirmBoot(AppCore),
      }
    );

    return false;
  }

  if (shouldSkipNavigation(state, Auth)) {
    markNavigationSkipped(
      state,
      isAuthLoginInProgress(Auth, state)
        ? "login-in-progress"
        : "already-handled"
    );

    safeLog(
      AppCore,
      "navigateAfterSessionRestore(): omitido porque ya hay navegación/login en curso.",
      {
        canonical: currentCanonicalPath,
        publicPath: currentPublicPath,
        bootNavigationHandled: Boolean(state?.bootNavigationHandled),
        loginNavigationHandled: Boolean(state?.loginNavigationHandled),
        loginInProgress: Boolean(state?.loginInProgress),
        authLoginInProgress: isAuthLoginInProgress(Auth, state),
      }
    );

    return false;
  }

  /*
    Sólo redirigir desde /login.
    Si ya estamos en una ruta privada, no tocar navegación.
  */
  if (!isLoginCanonicalPath(currentCanonicalPath)) {
    clearAuthScreenDomState({
      AppCore,
      Router,
      reason: "already-authenticated-private-route",
      force: false,
    });

    return false;
  }

  const target = resolvePostLoginTarget({
    AppCore,
    Auth,
  });

  if (
    !target ||
    samePath(target, currentCanonicalPath)
  ) {
    markNavigationSkipped(state, "target-empty-or-same");
    return false;
  }

  safeLog(
    AppCore,
    "navigateAfterSessionRestore(): redirigiendo desde login.",
    {
      canonical: currentCanonicalPath,
      publicPath: currentPublicPath,
      target,
      authenticated: true,
      user: getResolvedSessionUser(AppCore),
      role: getResolvedSessionRole(AppCore),
    }
  );

  const navigated = await runRouterNavigation({
    AppCore,
    Router,
    target,
    replaceState: true,
    force: false,
  });

  if (navigated) {
    markNavigationHandled(state, true);

    clearAuthScreenDomState({
      AppCore,
      Router,
      reason: "post-restore-login-navigation",
      force: true,
    });

    afterPaint(() => {
      clearAuthScreenDomState({
        AppCore,
        Router,
        reason: "post-restore-login-navigation-after-paint",
        force: true,
      });

      emit(
        AppCore,
        "app:ui:repair-request",
        {
          reason: "post-restore-navigation-after-paint",
          target,
          authenticated: true,
          source: "AppSession",
          repairShell: false,
          hardRepair: false,
          rebind: false,
        }
      );
    });

    emit(
      AppCore,
      "app:auth:navigation",
      {
        reason: "post-restore-login-navigation",
        target,
        authenticated: true,
        source: "AppSession",
      }
    );

    return true;
  }

  markNavigationSkipped(state, "router-navigation-failed");

  return false;
}

/* =========================================================
   RESTORE PROMISE HOLDER
========================================================= */

function getSessionRestorePromise(state) {
  try {
    return state?.sessionRestorePromise || moduleSessionRestorePromise;
  } catch {
    return moduleSessionRestorePromise;
  }
}

function setSessionRestorePromise(state, promise) {
  moduleSessionRestorePromise = promise;

  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.sessionRestorePromise = promise;
    }
  } catch {}
}

function clearSessionRestorePromise(state, promise) {
  if (moduleSessionRestorePromise === promise) {
    moduleSessionRestorePromise = null;
  }

  try {
    if (
      state &&
      typeof state === "object" &&
      state.sessionRestorePromise === promise
    ) {
      state.sessionRestorePromise = null;
    }
  } catch {}
}

/* =========================================================
   RESTORE AUTH SESSION
========================================================= */

export async function restoreAuthSession({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  state,
  emitReadyEvents = true,
} = {}) {
  const existingPromise = getSessionRestorePromise(state);

  if (existingPromise) {
    return existingPromise;
  }

  if (
    !Auth ||
    !isFunction(Auth.restoreSession)
  ) {
    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason: "auth-module-missing",
    });

    return buildSnapshot(
      AppCore,
      {
        ok: false,
        reason: "auth-module-missing",
      }
    );
  }

  const promise = (async () => {
    try {
      const activationBoot = isActivationBoot(AppCore);
      const resetConfirmBoot = isResetConfirmBoot(AppCore);
      const publicTechnicalBoot = isPublicTechnicalBoot(AppCore);

      safeLog(
        AppCore,
        "Restore session iniciado...",
        {
          activationBoot,
          resetConfirmBoot,
          publicTechnicalBoot,
        }
      );

      const result = await Auth.restoreSession({
        silent: true,
        skipNavigation: true,

        publicRoute: publicTechnicalBoot,
        preserveCurrentRoute: publicTechnicalBoot,
        preserveRoute: publicTechnicalBoot,

        activationBoot,
        resetConfirmBoot,
      });

      await runSyncUserUI({
        AppCore,
        Auth,
        Router,
        syncUserUI,
        reason: "restore-auth-session",
      });

      if (
        emitReadyEvents &&
        isAuthenticated(AppCore)
      ) {
        emitSessionReadyEvents({
          AppCore,
          reason: "restore-auth-session",
          result,
        });
      }

      const snapshot = buildSnapshot(
        AppCore,
        {
          ok: Boolean(result?.ok) || isAuthenticated(AppCore),
          activationBoot,
          resetConfirmBoot,
          publicTechnicalBoot,
        }
      );

      safeLog(
        AppCore,
        "Restore session completado:",
        snapshot
      );

      return {
        ...(result || {}),
        ...snapshot,
      };
    } catch (error) {
      safeWarn(
        AppCore,
        "restoreAuthSession() error:",
        error
      );

      await runSyncUserUI({
        AppCore,
        Auth,
        Router,
        syncUserUI,
        reason: "restore-auth-session-error",
      });

      return buildSnapshot(
        AppCore,
        {
          ok: false,
          error,
        }
      );
    } finally {
      clearSessionRestorePromise(state, promise);
    }
  })();

  setSessionRestorePromise(state, promise);

  return promise;
}

/* =========================================================
   RESTORE DURANTE BOOT
========================================================= */

export async function restoreSessionInBackground({
  AppCore,
  Auth,
  Router,
  state,
  syncUserUI,
  warmup,
  skipPostRestoreNavigation = false,
} = {}) {
  try {
    const activationBoot = isActivationBoot(AppCore);
    const resetConfirmBoot = isResetConfirmBoot(AppCore);
    const publicTechnicalBoot = isPublicTechnicalBoot(AppCore);

    if (
      activationBoot ||
      resetConfirmBoot ||
      publicTechnicalBoot ||
      skipPostRestoreNavigation
    ) {
      markNavigationSkipped(
        state,
        activationBoot
          ? "activation-boot"
          : resetConfirmBoot
            ? "reset-confirm-boot"
            : publicTechnicalBoot
              ? "public-technical-boot"
              : "skip-post-restore-navigation"
      );
    }

    const result = await restoreAuthSession({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      state,
      emitReadyEvents: false,
    });

    try {
      await Promise.resolve(warmup?.(AppCore));
    } catch (error) {
      safeWarn(AppCore, "warmup() falló:", error);
    }

    let navigationHandled = false;

    if (
      !activationBoot &&
      !resetConfirmBoot &&
      !publicTechnicalBoot &&
      !skipPostRestoreNavigation
    ) {
      navigationHandled = await navigateAfterSessionRestore({
        AppCore,
        Auth,
        Router,
        state,
      });
    } else {
      safeLog(
        AppCore,
        "Post-restore navigation omitida.",
        {
          activationBoot,
          resetConfirmBoot,
          publicTechnicalBoot,
          skipPostRestoreNavigation,
        }
      );
    }

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason: "restore-session-background-final",
    });

    const finalResult = {
      ...(result || {}),
      navigationHandled,
      navigated: navigationHandled,
      didNavigate: navigationHandled,
      redirected: navigationHandled,
    };

    if (isAuthenticated(AppCore)) {
      clearAuthScreenDomState({
        AppCore,
        Router,
        reason: "restore-session-background-final",
        force: false,
      });

      emitSessionReadyEvents({
        AppCore,
        reason: "restore-session-background-final",
        result: finalResult,
      });
    }

    const snapshot = buildSnapshot(
      AppCore,
      {
        ok:
          Boolean(result?.ok) ||
          isAuthenticated(AppCore),

        activationBoot,
        resetConfirmBoot,
        publicTechnicalBoot,
        skipPostRestoreNavigation,

        navigationHandled,
        navigated: navigationHandled,
        didNavigate: navigationHandled,
        redirected: navigationHandled,
      }
    );

    safeLog(
      AppCore,
      "restoreSessionInBackground() completado:",
      snapshot
    );

    return {
      ...finalResult,
      ...snapshot,
    };
  } catch (error) {
    safeError(
      AppCore,
      "restoreSessionInBackground() falló:",
      error
    );

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason: "restore-session-background-error",
    });

    return buildSnapshot(
      AppCore,
      {
        ok: false,
        error,
        navigationHandled: false,
        navigated: false,
        didNavigate: false,
        redirected: false,
      }
    );
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionBootstrapSnapshot({
  AppCore,
  Auth = null,
  Router = null,
  state,
} = {}) {
  return {
    ...buildSnapshot(AppCore),

    restoring: Boolean(getSessionRestorePromise(state)),

    bootNavigationHandled: Boolean(state?.bootNavigationHandled),

    postRestoreNavigationSkipped:
      Boolean(state?.postRestoreNavigationSkipped),

    postRestoreNavigationSkippedReason:
      state?.postRestoreNavigationSkippedReason || null,

    initialRouteRendered:
      Boolean(state?.initialRouteRendered),

    loginNavigationHandled:
      Boolean(state?.loginNavigationHandled),

    loginInProgress:
      Boolean(state?.loginInProgress),

    authLoginInProgress:
      isAuthLoginInProgress(Auth, state),

    activationBoot:
      isActivationBoot(AppCore),

    resetConfirmBoot:
      isResetConfirmBoot(AppCore),

    publicTechnicalBoot:
      isPublicTechnicalBoot(AppCore),

    currentCanonicalPath:
      getCurrentCanonicalSafe(AppCore, Router),

    currentPublicPath:
      getCurrentPublicSafe(AppCore, Router),
  };
}

export default {
  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};

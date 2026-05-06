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

   HARDENING EXTREMO:
   - Restore serializado real.
   - Anti race conditions.
   - Tolerancia total si Auth falla.
   - No doble navegación durante boot.
   - No contaminar publicPath/canonicalPath.
   - Warmup aislado.
   - Snapshot consistente y con URLs sensibles redacted.
   - Rutas públicas técnicas con query-token, hash-token y path-token.
   - Router.navigate/goAfterLogin esperados si devuelven Promise.
   - Soporte alias legacy reset initial URL.
   - Soporte __ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__.
   - Soporte __ONION_RESET_CONFIRM_INITIAL_URL__.
   - Soporte scrubbedResetToken y scrubbedResetPasswordToken.
   - Canonical seguro para rutas públicas /@username/...
   - Auth fantasma bloqueada: authenticated=true sin user usable NO autentica.
   - Redirect interno seguro anti open-redirect.
   - syncUserUI una sola vez en restoreSessionInBackground().
   - session:restored una sola emisión lógica.
   - bootNavigationHandled solo si Router navega realmente.
========================================================= */

import {
  getCurrentCanonicalPath,
  getCurrentPublicPath,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const LOGIN_PATH =
  "/login";

const ACTIVATION_PATH =
  "/activate-account";

const RESET_PASSWORD_PATH =
  "/reset-password";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const FORGOT_PASSWORD_PATH =
  "/forgot-password";

const RECOVER_PASSWORD_PATH =
  "/recover-password";

const PASSWORD_RESET_PATH =
  "/password-reset";

const DEFAULT_HOME_PATH =
  "/";

const SESSION_READY_EVENT_DEDUPE_MS =
  160;

const SESSION_VERSION =
  "12.0.0";

const PUBLIC_TECHNICAL_ROUTES =
  new Set([
    ACTIVATION_PATH,
    RESET_PASSWORD_PATH,
    RESET_CONFIRM_PATH,
    FORGOT_PASSWORD_PATH,
    RECOVER_PASSWORD_PATH,
    PASSWORD_RESET_PATH,
  ]);

const PUBLIC_TECHNICAL_PREFIXES =
  Object.freeze([
    `${ACTIVATION_PATH}/`,
    `${RESET_CONFIRM_PATH}/`,
  ]);

const AUTH_LIKE_ROUTES =
  new Set([
    LOGIN_PATH,
    RESET_PASSWORD_PATH,
    RESET_CONFIRM_PATH,
    FORGOT_PASSWORD_PATH,
    RECOVER_PASSWORD_PATH,
    PASSWORD_RESET_PATH,
    ACTIVATION_PATH,
  ]);

const AUTH_LIKE_PREFIXES =
  Object.freeze([
    `${ACTIVATION_PATH}/`,
    `${RESET_CONFIRM_PATH}/`,
  ]);

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
  ]);

const TOKEN_ROUTE_CONFIGS =
  Object.freeze([
    Object.freeze({
      key:
        "activation",

      path:
        ACTIVATION_PATH,

      initialWindowKey:
        "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

      initialWindowKeys:
        Object.freeze([
          "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
        ]),

      scrubbedHistoryFlag:
        "scrubbedActivationToken",

      scrubbedHistoryFlags:
        Object.freeze([
          "scrubbedActivationToken",
        ]),

      tokenParamNames:
        ACTIVATION_TOKEN_PARAM_NAMES,
    }),

    Object.freeze({
      key:
        "resetConfirm",

      path:
        RESET_CONFIRM_PATH,

      initialWindowKey:
        "__ONION_RESET_CONFIRM_INITIAL_URL__",

      initialWindowKeys:
        Object.freeze([
          "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
          "__ONION_RESET_CONFIRM_INITIAL_URL__",
        ]),

      scrubbedHistoryFlag:
        "scrubbedResetToken",

      scrubbedHistoryFlags:
        Object.freeze([
          "scrubbedResetToken",
          "scrubbedResetPasswordToken",
        ]),

      tokenParamNames:
        RESET_TOKEN_PARAM_NAMES,
    }),
  ]);

const RUNTIME_WINDOW_KEYS =
  Object.freeze({
    initialUrl:
      "__ONION_INITIAL_URL__",

    activationInitialUrl:
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",

    resetPasswordConfirmInitialUrl:
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",

    resetConfirmInitialUrl:
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
  });

const SESSION_EVENTS =
  Object.freeze({
    restoreStart:
      "app:session:restore:start",

    restoreDone:
      "app:session:restore:done",

    restoreError:
      "app:session:restore:error",

    authRestored:
      "auth:session:restored",

    appRestored:
      "app:session:restored",

    userChange:
      "app:user:change",

    uiRepairRequest:
      "app:ui:repair-request",

    authNavigation:
      "app:auth:navigation",

    authScreenCleared:
      "app:shell:auth-screen-cleared",
  });

/* =========================================================
   MODULE RUNTIME
========================================================= */

let lastSessionReadyEmitKey =
  "";

let lastSessionReadyEmitAt =
  0;

let moduleSessionRestorePromise =
  null;

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

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === 1) return true;
  if (value === 0) return false;

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
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

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(
      "[AppSession]",
      ...args
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[AppSession]",
        ...args
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
      "[AppSession]",
      ...args
    );
  } catch {}
}

function safeError(AppCore, ...args) {
  let coreLogged =
    false;

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[AppSession]",
        ...args
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
      "[AppSession]",
      ...args
    );
  } catch {}
}

function emit(AppCore, eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    safeObject(options);

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
        payload
      );

      busEmitted =
        true;
    }
  } catch {}

  /*
    No duplicar AppCore.events + window por defecto.
    Solo espejo a window si se pide explícitamente o no hay bus.
  */
  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            payload,
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

async function runMaybePromise(value) {
  if (
    value &&
    isFunction(value.then)
  ) {
    return await value;
  }

  return value;
}

/* =========================================================
   STATE HELPERS
========================================================= */

function getState(AppCore) {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function setCoreState(AppCore, patch = {}, options = {}) {
  if (!AppCore || !isObject(patch)) {
    return false;
  }

  try {
    if (isFunction(AppCore.setState)) {
      AppCore.setState(
        patch,
        {
          source:
            "AppSession",
          ...safeObject(options),
        }
      );

      return true;
    }
  } catch {}

  try {
    if (
      AppCore.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        patch
      );

      return true;
    }
  } catch {}

  return false;
}

function getResolvedUserObject(AppCore) {
  const state =
    getState(AppCore);

  return (
    state.user ||
    state.currentUser ||
    state.sessionUser ||
    state.authUser ||
    state.session?.user ||
    null
  );
}

function getResolvedSessionUser(AppCore) {
  const user =
    getResolvedUserObject(AppCore);

  return (
    user?.username ||
    user?.userName ||
    user?.email ||
    user?.mail ||
    user?.id ||
    user?.userId ||
    null
  );
}

function getResolvedSessionRole(AppCore) {
  const state =
    getState(AppCore);

  const user =
    getResolvedUserObject(AppCore);

  return (
    state.role ||
    state.rol ||
    state.userRole ||
    state.session?.role ||
    state.session?.rol ||
    user?.role ||
    user?.rol ||
    user?.type ||
    user?.userType ||
    user?.user_type ||
    user?.profile?.role ||
    user?.profile?.rol ||
    user?.raw?.role ||
    user?.raw?.rol ||
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
  const state =
    getState(AppCore);

  if (state.authenticated !== true) {
    return false;
  }

  return hasUsableSessionUser(
    getResolvedUserObject(AppCore)
  );
}

function enforceNoGhostAuth(AppCore, reason = "ghost-auth-check") {
  const state =
    getState(AppCore);

  if (state.authenticated !== true) {
    return false;
  }

  if (
    hasUsableSessionUser(
      getResolvedUserObject(AppCore)
    )
  ) {
    return false;
  }

  setCoreState(
    AppCore,
    {
      authenticated:
        false,

      role:
        null,

      username:
        null,

      currentResolvedUsername:
        null,

      resolvedUsername:
        null,
    },
    {
      source:
        `AppSession:${reason}`,
      forceUnauthenticated:
        true,
    }
  );

  emit(
    AppCore,
    "app:auth:ghost-blocked",
    {
      reason,
      source:
        "AppSession",
      at:
        safeIsoDate(),
    }
  );

  return true;
}

/* =========================================================
   LOGIN-IN-PROGRESS DETECTION
========================================================= */

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

/* =========================================================
   PATH HELPERS
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

function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value =
      "/";
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const segments =
    value.split("/");

  const output =
    [];

  for (const segment of segments) {
    if (
      !segment ||
      segment === "."
    ) {
      continue;
    }

    if (segment === "..") {
      output.pop();
      continue;
    }

    output.push(segment);
  }

  value =
    `/${output.join("/")}` || "/";

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function stripSearchAndHash(path = "/") {
  const value =
    safeText(path, "/");

  return normalizePathnameOnly(
    value.split("?")[0].split("#")[0] || "/"
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

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

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
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${normalizePathnameOnly(parsed.pathname || "/")}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex =
      raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash =
        raw.slice(hashIndex);

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
    return safeText(
      window[key],
      ""
    );
  } catch {
    return "";
  }
}

function getWindowFirstValue(keys = []) {
  for (const key of safeArray(keys)) {
    const value =
      getWindowValue(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function getInitialUrl() {
  return getWindowValue(
    RUNTIME_WINDOW_KEYS.initialUrl
  );
}

function getActivationInitialUrl() {
  return getWindowValue(
    RUNTIME_WINDOW_KEYS.activationInitialUrl
  );
}

function getResetConfirmInitialUrl() {
  return getWindowFirstValue([
    RUNTIME_WINDOW_KEYS.resetPasswordConfirmInitialUrl,
    RUNTIME_WINDOW_KEYS.resetConfirmInitialUrl,
  ]);
}

function isPublicUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

function stripPublicUsernamePrefixFromPath(path = "/") {
  const normalized =
    pathFromUrlLike(path) ||
    path ||
    "/";

  const clean =
    stripSearchAndHash(normalized);

  const segments =
    clean
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    isPublicUsernameSegment(segments[0])
  ) {
    const rest =
      segments
        .slice(1)
        .join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : "/";
  }

  return clean;
}

function getCanonicalFromAnyPath(path = "/") {
  return stripPublicUsernamePrefixFromPath(
    pathFromUrlLike(path) ||
    path ||
    "/"
  );
}

function getBootInitialPath(AppCore) {
  const state =
    getState(AppCore);

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
    safeText(state.route, "/") ||
    "/"
  );
}

function getCurrentCanonicalSafe(AppCore, Router) {
  try {
    const value =
      getCurrentCanonicalPath(
        AppCore,
        Router
      );

    if (value) {
      return stripSearchAndHash(
        getCanonicalFromAnyPath(value)
      );
    }
  } catch {}

  const publicPath =
    safeText(
      getState(AppCore).publicPath,
      ""
    );

  if (publicPath) {
    return stripSearchAndHash(
      getCanonicalFromAnyPath(publicPath)
    );
  }

  const route =
    safeText(
      getState(AppCore).route,
      ""
    );

  if (route) {
    return stripSearchAndHash(
      getCanonicalFromAnyPath(route)
    );
  }

  return stripSearchAndHash(
    getCanonicalFromAnyPath(
      getBootInitialPath(AppCore) || "/"
    )
  );
}

function getCurrentPublicSafe(AppCore, Router) {
  try {
    const value =
      getCurrentPublicPath(
        AppCore,
        Router
      );

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
   TOKEN ROUTE HELPERS
========================================================= */

function escapeRegExp(value = "") {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTokenInSearch(search = "", names = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return safeArray(names).some((name) =>
      Boolean(
        safeText(
          params.get(name),
          ""
        )
      )
    );
  } catch {
    return false;
  }
}

function extractPathToken(pathOrUrl = "", basePath = "") {
  const normalized =
    pathFromUrlLike(pathOrUrl) ||
    pathOrUrl ||
    "";

  const pathname =
    stripSearchAndHash(normalized);

  const parts =
    pathname
      .split("/")
      .filter(Boolean);

  const baseParts =
    basePath
      .split("/")
      .filter(Boolean);

  if (!baseParts.length) {
    return "";
  }

  for (
    let i = 0;
    i <= parts.length - baseParts.length;
    i += 1
  ) {
    const matches =
      baseParts.every((part, index) =>
        parts[i + index] === part
      );

    if (!matches) {
      continue;
    }

    const token =
      parts[i + baseParts.length];

    if (!token) {
      return "";
    }

    try {
      return safeText(
        decodeURIComponent(token),
        ""
      );
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
  const raw =
    safeText(value, "");

  if (!raw || !basePath) {
    return false;
  }

  if (extractPathToken(raw, basePath)) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

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
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      if (extractPathToken(hashPath, basePath)) {
        return true;
      }

      if (hashPath.includes("?")) {
        const query =
          hashPath
            .split("?")
            .slice(1)
            .join("?")
            .split("#")[0];

        return hasTokenInSearch(
          query ? `?${query}` : "",
          tokenParamNames
        );
      }
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        tokenParamNames
      );
    }

    return false;
  } catch {
    const path =
      pathFromUrlLike(raw) ||
      raw;

    if (extractPathToken(path, basePath)) {
      return true;
    }

    if (raw.includes("?")) {
      const query =
        raw
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
      const query =
        raw
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        tokenParamNames
      );
    }
  }

  return false;
}

function hasActivationToken(value = "") {
  return hasRouteToken({
    value,
    basePath:
      ACTIVATION_PATH,
    tokenParamNames:
      ACTIVATION_TOKEN_PARAM_NAMES,
  });
}

function hasResetConfirmToken(value = "") {
  return hasRouteToken({
    value,
    basePath:
      RESET_CONFIRM_PATH,
    tokenParamNames:
      RESET_TOKEN_PARAM_NAMES,
  });
}

function isHistoryStateFlagEnabled(flag = "") {
  if (!isBrowser() || !flag) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.[flag]
    );
  } catch {
    return false;
  }
}

function isActivationTokenScrubbed() {
  return isHistoryStateFlagEnabled(
    "scrubbedActivationToken"
  );
}

function isResetConfirmTokenScrubbed() {
  return (
    isHistoryStateFlagEnabled("scrubbedResetToken") ||
    isHistoryStateFlagEnabled("scrubbedResetPasswordToken")
  );
}

/* =========================================================
   ROUTE CLASSIFICATION
========================================================= */

function isPublicTechnicalCanonicalPath(canonicalPath = "/") {
  const clean =
    stripSearchAndHash(canonicalPath || "/");

  if (PUBLIC_TECHNICAL_ROUTES.has(clean)) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function isActivationCanonicalPath(canonicalPath = "/") {
  const clean =
    stripSearchAndHash(canonicalPath);

  return (
    clean === ACTIVATION_PATH ||
    clean.startsWith(`${ACTIVATION_PATH}/`)
  );
}

function isResetConfirmCanonicalPath(canonicalPath = "/") {
  const clean =
    stripSearchAndHash(canonicalPath);

  return (
    clean === RESET_CONFIRM_PATH ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
  );
}

function isLoginCanonicalPath(canonicalPath = "/") {
  return stripSearchAndHash(canonicalPath) === LOGIN_PATH;
}

function isAuthLikeCanonicalPath(canonicalPath = "/") {
  const clean =
    stripSearchAndHash(canonicalPath);

  if (AUTH_LIKE_ROUTES.has(clean)) {
    return true;
  }

  return AUTH_LIKE_PREFIXES.some((prefix) =>
    clean.startsWith(prefix)
  );
}

function isActivationBoot(AppCore) {
  const state =
    getState(AppCore);

  if (
    state.bootIsActivation === true &&
    state.bootHasActivationToken === true
  ) {
    return true;
  }

  if (isActivationTokenScrubbed()) {
    return false;
  }

  const candidates =
    [
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
    const value =
      safeText(candidate, "");

    if (!value) {
      return false;
    }

    return (
      isActivationCanonicalPath(
        getCanonicalFromAnyPath(value)
      ) &&
      hasActivationToken(value)
    );
  });
}

function isResetConfirmBoot(AppCore) {
  const state =
    getState(AppCore);

  if (
    state.bootIsResetConfirm === true &&
    state.bootHasResetToken === true
  ) {
    return true;
  }

  if (isResetConfirmTokenScrubbed()) {
    return false;
  }

  const candidates =
    [
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
    const value =
      safeText(candidate, "");

    if (!value) {
      return false;
    }

    return (
      isResetConfirmCanonicalPath(
        getCanonicalFromAnyPath(value)
      ) &&
      hasResetConfirmToken(value)
    );
  });
}

function isPublicTechnicalBoot(AppCore) {
  const bootPath =
    getBootInitialPath(AppCore);

  const canonical =
    getCanonicalFromAnyPath(bootPath || "/");

  return (
    isPublicTechnicalCanonicalPath(canonical) ||
    isActivationBoot(AppCore) ||
    isResetConfirmBoot(AppCore)
  );
}

/* =========================================================
   REDACTION / SNAPSHOTS
========================================================= */

function redactTokenInText(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  let output =
    raw;

  for (const config of TOKEN_ROUTE_CONFIGS) {
    const escapedPath =
      escapeRegExp(config.path);

    try {
      output =
        output.replace(
          new RegExp(`(${escapedPath})\\/([^/?#\\s]+)`, "gi"),
          "$1/***"
        );
    } catch {}

    for (const name of config.tokenParamNames) {
      try {
        output =
          output.replace(
            new RegExp(`([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`, "gi"),
            "$1***"
          );
      } catch {}
    }
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
      safeText(source?.name, "Error"),

    message:
      redactTokenInText(
        safeText(
          source?.message ||
          source?.reason ||
          source,
          "Error"
        )
      ),

    status:
      safeNumber(
        source?.status ||
        source?.statusCode,
        0
      ),

    code:
      safeText(
        source?.code,
        ""
      ) || null,

    at:
      safeIsoDate(),
  };
}

function sanitizeRestoreResult(result = {}) {
  const source =
    safeObject(result);

  const output =
    safeClone(source, {}) || {};

  const sensitiveKeys =
    [
      "token",
      "accessToken",
      "access_token",
      "refreshToken",
      "refresh_token",
      "idToken",
      "id_token",
      "jwt",
      "authorization",
      "password",
      "code",
      "otp",
    ];

  for (const key of sensitiveKeys) {
    if (key in output) {
      output[key] =
        null;
    }
  }

  if (output.error) {
    output.error =
      sanitizeError(output.error);
  }

  if (output.message) {
    output.message =
      redactTokenInText(output.message);
  }

  return output;
}

function buildSnapshot(AppCore, extras = {}) {
  const state =
    getState(AppCore);

  return {
    version:
      SESSION_VERSION,

    authenticated:
      isAuthenticated(AppCore),

    user:
      getResolvedUserObject(AppCore),

    username:
      getResolvedSessionUser(AppCore),

    role:
      getResolvedSessionRole(AppCore),

    route:
      state.route || "/",

    publicPath:
      state.publicPath || "/",

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

    bootIsActivation:
      Boolean(state.bootIsActivation),

    bootHasActivationToken:
      Boolean(state.bootHasActivationToken),

    bootIsResetConfirm:
      Boolean(state.bootIsResetConfirm),

    bootHasResetToken:
      Boolean(state.bootHasResetToken),

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

    resetConfirmTokenScrubbed:
      isResetConfirmTokenScrubbed(),

    at:
      safeIsoDate(),

    ...extras,
  };
}

/* =========================================================
   RESTORE RESULT EXTRACTION
========================================================= */

function hasTokenLike(value = "") {
  const text =
    safeText(value, "");

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

function firstToken(...values) {
  for (const value of values) {
    if (hasTokenLike(value)) {
      return String(value).trim();
    }
  }

  return null;
}

function firstUsableUser(...values) {
  for (const value of values) {
    if (hasUsableSessionUser(value)) {
      return value;
    }
  }

  return null;
}

function extractSessionPayloadFromResult(result = {}) {
  const source =
    safeObject(result);

  const data =
    safeObject(source.data);

  const payload =
    safeObject(source.payload);

  const session =
    safeObject(source.session);

  const dataSession =
    safeObject(data.session);

  const payloadSession =
    safeObject(payload.session);

  const user =
    firstUsableUser(
      source.user,
      source.currentUser,
      source.sessionUser,
      source.authUser,
      session.user,
      data.user,
      data.currentUser,
      data.sessionUser,
      data.authUser,
      dataSession.user,
      payload.user,
      payload.currentUser,
      payload.sessionUser,
      payload.authUser,
      payloadSession.user
    );

  const token =
    firstToken(
      source.token,
      source.accessToken,
      source.access_token,
      source.jwt,
      source.bearer,
      session.token,
      session.accessToken,
      session.access_token,
      data.token,
      data.accessToken,
      data.access_token,
      data.jwt,
      dataSession.token,
      dataSession.accessToken,
      dataSession.access_token,
      payload.token,
      payload.accessToken,
      payload.access_token,
      payload.jwt,
      payloadSession.token,
      payloadSession.accessToken,
      payloadSession.access_token
    );

  return {
    user,
    token,
  };
}

function maybeApplyRestoreResultToCore({
  AppCore,
  result = {},
  reason = "restore-result",
} = {}) {
  if (!AppCore) {
    return false;
  }

  const {
    user,
    token,
  } =
    extractSessionPayloadFromResult(result);

  const currentState =
    getState(AppCore);

  const patch =
    {};

  if (
    token &&
    !hasTokenLike(currentState.token)
  ) {
    patch.token =
      token;
  }

  if (
    user &&
    !hasUsableSessionUser(
      getResolvedUserObject(AppCore)
    )
  ) {
    patch.user =
      user;
  }

  if (!Object.keys(patch).length) {
    return false;
  }

  try {
    if (isFunction(AppCore.applySession)) {
      AppCore.applySession(
        patch,
        {
          source:
            `AppSession:${reason}`,
          emit:
            false,
        }
      );

      return true;
    }
  } catch {}

  try {
    setCoreState(
      AppCore,
      patch,
      {
        source:
          `AppSession:${reason}`,
        emit:
          false,
      }
    );

    return true;
  } catch {}

  return false;
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

  const context =
    {
      AppCore,
      Auth,
      Router,
      reason,
      source:
        "AppSession",
    };

  let synced =
    false;

  try {
    await Promise.resolve(
      syncUserUI(context)
    );

    synced =
      true;
  } catch (error) {
    safeWarn(
      AppCore,
      "syncUserUI(context) falló. Probando compat legacy.",
      error
    );

    try {
      await Promise.resolve(
        syncUserUI(AppCore)
      );

      synced =
        true;
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
    SESSION_EVENTS.uiRepairRequest,
    {
      reason,
      authenticated:
        isAuthenticated(AppCore),
      user:
        getResolvedUserObject(AppCore),
      role:
        getResolvedSessionRole(AppCore),
      source:
        "AppSession",
      repairShell:
        false,
      hardRepair:
        false,
      rebind:
        false,
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

  const authenticated =
    isAuthenticated(AppCore);

  const canonical =
    getCurrentCanonicalSafe(
      AppCore,
      Router
    );

  const authLike =
    isAuthLikeCanonicalPath(canonical);

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

    document.body?.removeAttribute?.(
      "data-auth-screen"
    );

    document.body?.setAttribute?.(
      "data-authenticated",
      "true"
    );
  } catch {}

  try {
    const shell =
      document.getElementById("app-shell");

    if (shell) {
      shell.hidden =
        false;

      shell.setAttribute(
        "aria-hidden",
        "false"
      );

      shell.setAttribute(
        "aria-busy",
        "false"
      );

      shell.dataset.shellInteractive =
        "true";
    }
  } catch {}

  try {
    const main =
      document.getElementById("main-content");

    if (main) {
      main.hidden =
        false;

      main.setAttribute(
        "aria-hidden",
        "false"
      );

      main.setAttribute(
        "aria-busy",
        "false"
      );
    }
  } catch {}

  try {
    const view =
      document.getElementById("view-container");

    if (view) {
      view.hidden =
        false;

      view.setAttribute(
        "aria-hidden",
        "false"
      );

      view.setAttribute(
        "aria-busy",
        "false"
      );
    }
  } catch {}

  emit(
    AppCore,
    SESSION_EVENTS.authScreenCleared,
    {
      reason,
      canonical,
      authenticated,
      source:
        "AppSession",
      at:
        safeIsoDate(),
    }
  );

  return true;
}

/* =========================================================
   SESSION READY EVENTS
========================================================= */

function buildSessionReadyPayload({
  AppCore,
  reason = "session-ready",
  result = {},
} = {}) {
  return {
    version:
      SESSION_VERSION,

    reason,

    ok:
      Boolean(result?.ok) ||
      isAuthenticated(AppCore),

    authenticated:
      isAuthenticated(AppCore),

    user:
      getResolvedUserObject(AppCore),

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

    navigated:
      Boolean(
        result?.navigated ||
        result?.navigationHandled
      ),

    didNavigate:
      Boolean(
        result?.didNavigate ||
        result?.navigationHandled
      ),

    redirected:
      Boolean(
        result?.redirected ||
        result?.navigationHandled
      ),

    routeChanged:
      Boolean(result?.routeChanged),

    source:
      "AppSession",

    at:
      safeIsoDate(),
  };
}

function emitSessionReadyEvents({
  AppCore,
  reason = "session-ready",
  result = {},
  dedupe = true,
} = {}) {
  const payload =
    buildSessionReadyPayload({
      AppCore,
      reason,
      result,
    });

  const key =
    [
      payload.authenticated ? "auth" : "anon",
      safeText(payload.username, ""),
      safeText(payload.role, ""),
      safeText(payload.route, ""),
      safeText(payload.publicPath, ""),
      payload.navigationHandled ? "nav" : "no-nav",
      payload.routeChanged ? "changed" : "same",
    ].join("|");

  const timestamp =
    Date.now();

  if (
    dedupe &&
    key === lastSessionReadyEmitKey &&
    timestamp - lastSessionReadyEmitAt < SESSION_READY_EVENT_DEDUPE_MS
  ) {
    return payload;
  }

  lastSessionReadyEmitKey =
    key;

  lastSessionReadyEmitAt =
    timestamp;

  emit(
    AppCore,
    SESSION_EVENTS.authRestored,
    payload
  );

  emit(
    AppCore,
    SESSION_EVENTS.appRestored,
    payload
  );

  emit(
    AppCore,
    SESSION_EVENTS.userChange,
    payload
  );

  emit(
    AppCore,
    SESSION_EVENTS.uiRepairRequest,
    {
      ...payload,
      repairShell:
        false,
      hardRepair:
        false,
      rebind:
        false,
    }
  );

  return payload;
}

/* =========================================================
   NAVIGATION GUARDS / FLAGS
========================================================= */

function shouldSkipNavigation(state, Auth = null) {
  return Boolean(
    state?.bootNavigationHandled ||
    state?.loginNavigationHandled ||
    state?.loginInProgress ||
    isAuthLoginInProgress(Auth, state)
  );
}

function markNavigationHandled({
  AppCore,
  state,
  value = true,
} = {}) {
  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.bootNavigationHandled =
        Boolean(value);
    }
  } catch {}

  setCoreState(
    AppCore,
    {
      bootNavigationHandled:
        Boolean(value),
    },
    {
      source:
        "AppSession:navigation-handled",
      emit:
        false,
    }
  );
}

function markNavigationSkipped(state, reason = "unknown") {
  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.postRestoreNavigationSkipped =
        true;

      state.postRestoreNavigationSkippedReason =
        reason;
    }
  } catch {}
}

function isSafeInternalTarget(value = "") {
  const raw =
    safeText(value, "");

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

  if (/[\r\n\t\\]/.test(raw)) {
    return false;
  }

  return true;
}

function normalizeTargetPath(path = "/") {
  const raw =
    safeText(path, DEFAULT_HOME_PATH) ||
    DEFAULT_HOME_PATH;

  if (!isSafeInternalTarget(raw)) {
    return DEFAULT_HOME_PATH;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (parsed.origin !== getBaseOrigin()) {
      return DEFAULT_HOME_PATH;
    }

    const pathname =
      normalizePathnameOnly(
        parsed.pathname || DEFAULT_HOME_PATH
      );

    const output =
      `${pathname}${parsed.search || ""}${parsed.hash || ""}`;

    return isSafeInternalTarget(output)
      ? output
      : DEFAULT_HOME_PATH;
  } catch {
    const clean =
      normalizePathnameOnly(raw);

    return isSafeInternalTarget(clean)
      ? clean
      : DEFAULT_HOME_PATH;
  }
}

function samePath(a = "/", b = "/") {
  return (
    stripSearchAndHash(a) ===
    stripSearchAndHash(b)
  );
}

/* =========================================================
   POST LOGIN TARGET
========================================================= */

function resolvePostLoginTarget({
  AppCore,
  Auth,
} = {}) {
  const user =
    getResolvedUserObject(AppCore);

  try {
    if (isFunction(Auth?.getPostLoginTarget)) {
      const next =
        Auth.getPostLoginTarget(
          user,
          {}
        );

      if (
        next &&
        typeof next === "string"
      ) {
        const normalized =
          normalizeTargetPath(next);

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

  const state =
    getState(AppCore);

  const candidates =
    [
      state.postLoginTarget,
      state.redirectAfterLogin,
      state.returnTo,
      state.lastPrivatePath,
    ];

  for (const candidate of candidates) {
    const value =
      safeText(candidate, "");

    if (!value) {
      continue;
    }

    const normalized =
      normalizeTargetPath(value);

    if (
      normalized &&
      normalized !== LOGIN_PATH &&
      !isAuthLikeCanonicalPath(normalized)
    ) {
      return normalized;
    }
  }

  return DEFAULT_HOME_PATH;
}

/* =========================================================
   ROUTER NAVIGATION
========================================================= */

async function runRouterNavigation({
  AppCore,
  Router,
  target = DEFAULT_HOME_PATH,
  replaceState = true,
  force = false,
} = {}) {
  if (!Router) {
    return false;
  }

  const normalizedTarget =
    normalizeTargetPath(target);

  try {
    if (isFunction(Router.goAfterLogin)) {
      const result =
        await runMaybePromise(
          Router.goAfterLogin(normalizedTarget)
        );

      return result !== false;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.goAfterLogin() falló:",
      error
    );
  }

  try {
    if (isFunction(Router.navigate)) {
      const result =
        await runMaybePromise(
          Router.navigate(
            normalizedTarget,
            {
              replaceState,
              force,
            }
          )
        );

      return result !== false;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate() falló:",
      error
    );
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

  enforceNoGhostAuth(
    AppCore,
    "before-post-restore-navigation"
  );

  if (!isAuthenticated(AppCore)) {
    return false;
  }

  const currentCanonicalPath =
    getCurrentCanonicalSafe(
      AppCore,
      Router
    );

  const currentPublicPath =
    getCurrentPublicSafe(
      AppCore,
      Router
    );

  const publicTechnical =
    isPublicTechnicalCanonicalPath(currentCanonicalPath) ||
    isPublicTechnicalCanonicalPath(currentPublicPath) ||
    isActivationBoot(AppCore) ||
    isResetConfirmBoot(AppCore) ||
    isActivationCanonicalPath(currentCanonicalPath) ||
    isResetConfirmCanonicalPath(currentCanonicalPath) ||
    isActivationCanonicalPath(currentPublicPath) ||
    isResetConfirmCanonicalPath(currentPublicPath);

  /*
    Rutas públicas técnicas:
    - bloquean navegación post-restore
    - NO marcan bootNavigationHandled
    - App.index sigue pudiendo hacer render inicial.
  */
  if (publicTechnical) {
    markNavigationSkipped(
      state,
      "public-technical-route"
    );

    safeLog(
      AppCore,
      "navigateAfterSessionRestore(): omitido por ruta pública técnica.",
      {
        canonical:
          redactTokenInText(currentCanonicalPath),
        publicPath:
          redactTokenInText(currentPublicPath),
        activationBoot:
          isActivationBoot(AppCore),
        resetConfirmBoot:
          isResetConfirmBoot(AppCore),
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
        canonical:
          currentCanonicalPath,
        publicPath:
          currentPublicPath,
        bootNavigationHandled:
          Boolean(state?.bootNavigationHandled),
        loginNavigationHandled:
          Boolean(state?.loginNavigationHandled),
        loginInProgress:
          Boolean(state?.loginInProgress),
        authLoginInProgress:
          isAuthLoginInProgress(Auth, state),
      }
    );

    return false;
  }

  /*
    Solo redirigir desde /login.
    Si ya estamos en una ruta privada, no tocar navegación.
  */
  if (!isLoginCanonicalPath(currentCanonicalPath)) {
    clearAuthScreenDomState({
      AppCore,
      Router,
      reason:
        "already-authenticated-private-route",
      force:
        false,
    });

    return false;
  }

  const target =
    resolvePostLoginTarget({
      AppCore,
      Auth,
    });

  if (
    !target ||
    samePath(target, currentCanonicalPath)
  ) {
    markNavigationSkipped(
      state,
      "target-empty-or-same"
    );

    return false;
  }

  safeLog(
    AppCore,
    "navigateAfterSessionRestore(): redirigiendo desde login.",
    {
      canonical:
        currentCanonicalPath,
      publicPath:
        currentPublicPath,
      target,
      authenticated:
        true,
      user:
        getResolvedSessionUser(AppCore),
      role:
        getResolvedSessionRole(AppCore),
    }
  );

  const navigated =
    await runRouterNavigation({
      AppCore,
      Router,
      target,
      replaceState:
        true,
      force:
        false,
    });

  if (navigated) {
    markNavigationHandled({
      AppCore,
      state,
      value:
        true,
    });

    clearAuthScreenDomState({
      AppCore,
      Router,
      reason:
        "post-restore-login-navigation",
      force:
        true,
    });

    afterPaint(() => {
      clearAuthScreenDomState({
        AppCore,
        Router,
        reason:
          "post-restore-login-navigation-after-paint",
        force:
          true,
      });

      emit(
        AppCore,
        SESSION_EVENTS.uiRepairRequest,
        {
          reason:
            "post-restore-navigation-after-paint",
          target,
          authenticated:
            true,
          source:
            "AppSession",
          repairShell:
            false,
          hardRepair:
            false,
          rebind:
            false,
        }
      );
    });

    emit(
      AppCore,
      SESSION_EVENTS.authNavigation,
      {
        reason:
          "post-restore-login-navigation",
        target,
        authenticated:
          true,
        source:
          "AppSession",
        at:
          safeIsoDate(),
      }
    );

    return true;
  }

  markNavigationSkipped(
    state,
    "router-navigation-failed"
  );

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
  moduleSessionRestorePromise =
    promise;

  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.sessionRestorePromise =
        promise;
    }
  } catch {}
}

function clearSessionRestorePromise(state, promise) {
  if (moduleSessionRestorePromise === promise) {
    moduleSessionRestorePromise =
      null;
  }

  try {
    if (
      state &&
      typeof state === "object" &&
      state.sessionRestorePromise === promise
    ) {
      state.sessionRestorePromise =
        null;
    }
  } catch {}
}

/* =========================================================
   AUTH RESTORE OPTIONS
========================================================= */

function buildAuthRestoreOptions({
  publicTechnicalBoot = false,
  activationBoot = false,
  resetConfirmBoot = false,
} = {}) {
  return {
    silent:
      true,

    skipNavigation:
      true,

    preserveCurrentRoute:
      publicTechnicalBoot,

    preserveRoute:
      publicTechnicalBoot,

    publicRoute:
      publicTechnicalBoot,

    technicalPublicRoute:
      publicTechnicalBoot,

    activationBoot:
      Boolean(activationBoot),

    resetConfirmBoot:
      Boolean(resetConfirmBoot),

    resetPasswordConfirmBoot:
      Boolean(resetConfirmBoot),
  };
}

async function callAuthRestoreSession({
  Auth,
  options,
} = {}) {
  if (!Auth) {
    return null;
  }

  if (isFunction(Auth.restoreSession)) {
    return await Auth.restoreSession(options);
  }

  if (isFunction(Auth.restore)) {
    return await Auth.restore(options);
  }

  if (isFunction(Auth.session?.restore)) {
    return await Auth.session.restore(options);
  }

  return null;
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
  syncUi = true,
} = {}) {
  const existingPromise =
    getSessionRestorePromise(state);

  if (existingPromise) {
    return existingPromise;
  }

  if (
    !Auth ||
    (
      !isFunction(Auth.restoreSession) &&
      !isFunction(Auth.restore) &&
      !isFunction(Auth.session?.restore)
    )
  ) {
    if (syncUi) {
      await runSyncUserUI({
        AppCore,
        Auth,
        Router,
        syncUserUI,
        reason:
          "auth-module-missing",
      });
    }

    return buildSnapshot(
      AppCore,
      {
        ok:
          false,
        reason:
          "auth-module-missing",
        restored:
          false,
      }
    );
  }

  const promise =
    (async () => {
      const activationBoot =
        isActivationBoot(AppCore);

      const resetConfirmBoot =
        isResetConfirmBoot(AppCore);

      const publicTechnicalBoot =
        isPublicTechnicalBoot(AppCore);

      try {
        emit(
          AppCore,
          SESSION_EVENTS.restoreStart,
          {
            activationBoot,
            resetConfirmBoot,
            publicTechnicalBoot,
            source:
              "AppSession",
            at:
              safeIsoDate(),
          }
        );

        safeLog(
          AppCore,
          "Restore session iniciado...",
          {
            activationBoot,
            resetConfirmBoot,
            publicTechnicalBoot,
          }
        );

        const restoreOptions =
          buildAuthRestoreOptions({
            publicTechnicalBoot,
            activationBoot,
            resetConfirmBoot,
          });

        const result =
          await callAuthRestoreSession({
            Auth,
            options:
              restoreOptions,
          });

        maybeApplyRestoreResultToCore({
          AppCore,
          result,
          reason:
            "restore-auth-session",
        });

        enforceNoGhostAuth(
          AppCore,
          "after-auth-restore"
        );

        if (syncUi) {
          await runSyncUserUI({
            AppCore,
            Auth,
            Router,
            syncUserUI,
            reason:
              "restore-auth-session",
          });
        }

        const authenticated =
          isAuthenticated(AppCore);

        if (
          emitReadyEvents &&
          authenticated
        ) {
          emitSessionReadyEvents({
            AppCore,
            reason:
              "restore-auth-session",
            result,
          });
        }

        const snapshot =
          buildSnapshot(
            AppCore,
            {
              ok:
                Boolean(result?.ok) ||
                authenticated,

              restored:
                Boolean(result?.ok) ||
                authenticated,

              activationBoot,
              resetConfirmBoot,
              publicTechnicalBoot,
            }
          );

        emit(
          AppCore,
          SESSION_EVENTS.restoreDone,
          {
            ...snapshot,
            result:
              sanitizeRestoreResult(result),
            source:
              "AppSession",
          }
        );

        safeLog(
          AppCore,
          "Restore session completado:",
          snapshot
        );

        return {
          ...sanitizeRestoreResult(result),
          ...snapshot,
        };
      } catch (error) {
        safeWarn(
          AppCore,
          "restoreAuthSession() error:",
          error
        );

        enforceNoGhostAuth(
          AppCore,
          "auth-restore-error"
        );

        if (syncUi) {
          await runSyncUserUI({
            AppCore,
            Auth,
            Router,
            syncUserUI,
            reason:
              "restore-auth-session-error",
          });
        }

        const snapshot =
          buildSnapshot(
            AppCore,
            {
              ok:
                false,
              restored:
                false,
              activationBoot,
              resetConfirmBoot,
              publicTechnicalBoot,
              error:
                sanitizeError(error),
            }
          );

        emit(
          AppCore,
          SESSION_EVENTS.restoreError,
          {
            ...snapshot,
            source:
              "AppSession",
          }
        );

        return snapshot;
      } finally {
        clearSessionRestorePromise(
          state,
          promise
        );
      }
    })();

  setSessionRestorePromise(
    state,
    promise
  );

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
  const beforeCanonical =
    getCurrentCanonicalSafe(
      AppCore,
      Router
    );

  const beforePublic =
    getCurrentPublicSafe(
      AppCore,
      Router
    );

  try {
    const activationBoot =
      isActivationBoot(AppCore);

    const resetConfirmBoot =
      isResetConfirmBoot(AppCore);

    const publicTechnicalBoot =
      isPublicTechnicalBoot(AppCore);

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

    /*
      Importante:
      restoreAuthSession() aquí NO sincroniza UI.
      La UI se sincroniza una sola vez al final de este flujo.
    */
    const result =
      await restoreAuthSession({
        AppCore,
        Auth,
        Router,
        syncUserUI,
        state,
        emitReadyEvents:
          false,
        syncUi:
          false,
      });

    try {
      await Promise.resolve(
        warmup?.(AppCore)
      );
    } catch (error) {
      safeWarn(
        AppCore,
        "warmup() falló:",
        error
      );
    }

    enforceNoGhostAuth(
      AppCore,
      "before-background-navigation"
    );

    let navigationHandled =
      false;

    if (
      !activationBoot &&
      !resetConfirmBoot &&
      !publicTechnicalBoot &&
      !skipPostRestoreNavigation
    ) {
      navigationHandled =
        await navigateAfterSessionRestore({
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

    const afterCanonical =
      getCurrentCanonicalSafe(
        AppCore,
        Router
      );

    const afterPublic =
      getCurrentPublicSafe(
        AppCore,
        Router
      );

    const routeChanged =
      Boolean(
        navigationHandled &&
        (
          !samePath(beforeCanonical, afterCanonical) ||
          !samePath(beforePublic, afterPublic)
        )
      );

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason:
        "restore-session-background-final",
    });

    const finalResult =
      {
        ...sanitizeRestoreResult(result),

        ok:
          Boolean(result?.ok) ||
          isAuthenticated(AppCore),

        restored:
          Boolean(result?.restored) ||
          Boolean(result?.ok) ||
          isAuthenticated(AppCore),

        navigationHandled,

        navigated:
          navigationHandled,

        didNavigate:
          navigationHandled,

        redirected:
          navigationHandled,

        routeChanged,
      };

    if (isAuthenticated(AppCore)) {
      clearAuthScreenDomState({
        AppCore,
        Router,
        reason:
          "restore-session-background-final",
        force:
          false,
      });

      emitSessionReadyEvents({
        AppCore,
        reason:
          "restore-session-background-final",
        result:
          finalResult,
      });
    }

    const snapshot =
      buildSnapshot(
        AppCore,
        {
          ok:
            Boolean(finalResult.ok),

          restored:
            Boolean(finalResult.restored),

          activationBoot,
          resetConfirmBoot,
          publicTechnicalBoot,
          skipPostRestoreNavigation,

          beforeCanonical:
            redactTokenInText(beforeCanonical),

          beforePublic:
            redactTokenInText(beforePublic),

          afterCanonical:
            redactTokenInText(afterCanonical),

          afterPublic:
            redactTokenInText(afterPublic),

          navigationHandled,
          navigated:
            navigationHandled,
          didNavigate:
            navigationHandled,
          redirected:
            navigationHandled,
          routeChanged,
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

    enforceNoGhostAuth(
      AppCore,
      "background-restore-error"
    );

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason:
        "restore-session-background-error",
    });

    return buildSnapshot(
      AppCore,
      {
        ok:
          false,
        restored:
          false,
        error:
          sanitizeError(error),
        navigationHandled:
          false,
        navigated:
          false,
        didNavigate:
          false,
        redirected:
          false,
        routeChanged:
          false,
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

    restoring:
      Boolean(
        getSessionRestorePromise(state)
      ),

    bootNavigationHandled:
      Boolean(state?.bootNavigationHandled),

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
      isAuthLoginInProgress(
        Auth,
        state
      ),

    activationBoot:
      isActivationBoot(AppCore),

    resetConfirmBoot:
      isResetConfirmBoot(AppCore),

    publicTechnicalBoot:
      isPublicTechnicalBoot(AppCore),

    currentCanonicalPath:
      redactTokenInText(
        getCurrentCanonicalSafe(
          AppCore,
          Router
        )
      ),

    currentPublicPath:
      redactTokenInText(
        getCurrentPublicSafe(
          AppCore,
          Router
        )
      ),

    browserPublicPath:
      redactTokenInText(
        getBrowserPublicPath()
      ),

    bootInitialPath:
      redactTokenInText(
        getBootInitialPath(AppCore)
      ),

    ghostAuthBlocked:
      Boolean(
        getState(AppCore).authenticated === true &&
        !hasUsableSessionUser(
          getResolvedUserObject(AppCore)
        )
      ),
  };
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};

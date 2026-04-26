/* =========================================================
   Onion SPA - App Session Bootstrap
   Archivo: src/app/session.js

   RESPONSABILIDADES:
   - restaurar sesión durante boot sin romper rutas públicas técnicas
   - evitar restores duplicados en paralelo
   - sincronizar UI usuario tras restore
   - navegación post-login segura
   - diagnóstico robusto de sesión
   - no romper rutas contextualizadas
   - no pisar /activate-account?token=...
   - no pisar /activate-account/<token>
   - no pisar /reset-password/confirm?token=...
   - no pisar /reset-password/confirm/<token>
   - no redirigir activation/reset aunque exista sesión previa
   - evitar doble navegación después de login
   - evitar repaint fantasma desde /login
   - reparar shell/auth-screen tras navegación autenticada

   HARDENING EXTREMO:
   - restore serializado real
   - anti race conditions
   - no repaint fantasma login/private
   - tolerancia total si Auth falla
   - no doble navegación durante boot
   - no contaminar publicPath/canonicalPath
   - warmup aislado
   - snapshot consistente
   - rutas públicas técnicas con soporte path-token
   - activation boot compatible con query, hash y path-token
   - reset confirm boot compatible con query, hash y path-token

   FIX CRÍTICO:
   - bootNavigationHandled solo se marca cuando Router navega/renderiza
   - las rutas públicas técnicas bloquean navegación, pero NO bloquean render inicial
   - Router.navigate se espera con await si devuelve Promise
   - syncUserUI se ejecuta en modo moderno y legacy
   - emite eventos de sesión/restauración para reparar Sidebar/Topbar
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

const PUBLIC_TECHNICAL_ROUTES = new Set([
  "/activate-account",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
]);

const PUBLIC_TECHNICAL_PREFIXES = [
  "/activate-account/",
  "/reset-password/confirm/",
];

const AUTH_LIKE_ROUTES = new Set([
  "/login",
  "/reset-password",
  "/reset-password/confirm",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/activate-account",
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
  "code",
  "t",
];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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
  try {
    AppCore?.utils?.warn?.(
      "[AppSession]",
      ...args
    );
  } catch {}

  try {
    console.warn("[AppSession]", ...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(
      "[AppSession]",
      ...args
    );
  } catch {}

  try {
    console.error("[AppSession]", ...args);
  } catch {}
}

function isFunction(value) {
  return typeof value === "function";
}

function safeBool(value) {
  return value === true;
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
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function getState(AppCore) {
  try {
    return AppCore?.state || {};
  } catch {
    return {};
  }
}

function getResolvedSessionUser(AppCore) {
  const state =
    getState(AppCore);

  return (
    state?.user?.username ||
    state?.user?.email ||
    state?.user?.id ||
    state?.currentUser?.username ||
    state?.currentUser?.email ||
    state?.currentUser?.id ||
    null
  );
}

function getResolvedSessionRole(AppCore) {
  const state =
    getState(AppCore);

  return (
    state?.role ||
    state?.rol ||
    state?.userRole ||
    state?.session?.role ||
    state?.session?.rol ||
    null
  );
}

function isAuthenticated(AppCore) {
  return Boolean(
    getState(AppCore)?.authenticated
  );
}

function emit(AppCore, eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}

  try {
    window?.AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
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

function normalizeInternalPath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  const clean =
    raw.startsWith("/")
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
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(parsed.hash);
    }

    return `${normalizePathnameOnly(
      parsed.pathname || "/"
    )}${parsed.search || ""}${parsed.hash || ""}`;
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

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function getResetConfirmInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_RESET_CONFIRM_INITIAL_URL__,
    ""
  );
}

/* =========================================================
   TOKEN / PUBLIC ROUTE HELPERS
========================================================= */

function hasTokenInSearch(
  search = "",
  names = ACTIVATION_TOKEN_PARAM_NAMES
) {
  try {
    const params =
      new URLSearchParams(search || "");

    return names.some(
      (name) =>
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

function extractPathToken(pathOrUrl = "", basePath = ACTIVATION_PATH) {
  const normalized =
    pathFromUrlLike(pathOrUrl) || pathOrUrl || "";

  const pathname =
    stripSearchAndHash(normalized);

  const parts =
    pathname.split("/").filter(Boolean);

  const baseParts =
    basePath.split("/").filter(Boolean);

  if (!baseParts.length) {
    return "";
  }

  for (let i = 0; i <= parts.length - baseParts.length; i += 1) {
    const matches =
      baseParts.every((part, index) => {
        return parts[i + index] === part;
      });

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

  if (
    extractPathToken(
      raw,
      basePath
    )
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    const parsedPath =
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;

    if (
      extractPathToken(
        parsedPath,
        basePath
      )
    ) {
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
      const query =
        parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        tokenParamNames
      );
    }
  } catch {
    const path =
      pathFromUrlLike(raw) || raw;

    if (
      extractPathToken(
        path,
        basePath
      )
    ) {
      return true;
    }

    if (raw.includes("?")) {
      const query =
        raw.split("?").slice(1).join("?").split("#")[0];

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
        raw.split("?").slice(1).join("?");

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
  return isHistoryStateFlagEnabled(
    "scrubbedResetToken"
  );
}

function getBootInitialPath(AppCore) {
  const state =
    getState(AppCore);

  return (
    safeText(
      state.bootProtectedInitialPath,
      ""
    ) ||
    safeText(
      state.bootActivationInitialPath,
      ""
    ) ||
    safeText(
      state.bootResetConfirmInitialPath,
      ""
    ) ||
    pathFromUrlLike(
      getActivationInitialUrl()
    ) ||
    pathFromUrlLike(
      getResetConfirmInitialUrl()
    ) ||
    pathFromUrlLike(
      safeText(
        state.bootProtectedInitialUrl,
        ""
      )
    ) ||
    pathFromUrlLike(
      safeText(
        state.bootInitialUrl,
        ""
      )
    ) ||
    pathFromUrlLike(
      getInitialUrl()
    ) ||
    getBrowserPublicPath() ||
    safeText(
      state.publicPath,
      ""
    ) ||
    safeText(
      state.route,
      "/"
    )
  );
}

function getCanonicalFromAnyPath(path = "/") {
  return stripSearchAndHash(
    pathFromUrlLike(path) || path || "/"
  );
}

function isPublicTechnicalCanonicalPath(canonicalPath = "/") {
  const clean =
    stripSearchAndHash(
      canonicalPath || "/"
    );

  if (
    PUBLIC_TECHNICAL_ROUTES.has(clean)
  ) {
    return true;
  }

  return PUBLIC_TECHNICAL_PREFIXES.some(
    (prefix) => clean.startsWith(prefix)
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

  return (
    clean.startsWith(`${ACTIVATION_PATH}/`) ||
    clean.startsWith(`${RESET_CONFIRM_PATH}/`)
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
    getCanonicalFromAnyPath(
      bootPath || "/"
    );

  return (
    isPublicTechnicalCanonicalPath(canonical) ||
    isActivationBoot(AppCore) ||
    isResetConfirmBoot(AppCore)
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
      return stripSearchAndHash(value);
    }
  } catch {}

  const publicPath =
    safeText(
      getState(AppCore).publicPath,
      ""
    );

  if (publicPath) {
    return stripSearchAndHash(publicPath);
  }

  const route =
    safeText(
      getState(AppCore).route,
      ""
    );

  if (route) {
    return stripSearchAndHash(route);
  }

  const bootPath =
    getBootInitialPath(AppCore);

  return getCanonicalFromAnyPath(
    bootPath || "/"
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
    safeText(
      getState(AppCore).publicPath,
      ""
    ) ||
    getBootInitialPath(AppCore) ||
    "/"
  );
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

  let synced = false;

  const context = {
    AppCore,
    Auth,
    Router,
    reason,
  };

  /*
    Modo moderno:
    syncUserUI({ AppCore, Auth, Router, reason })
  */
  try {
    await Promise.resolve(
      syncUserUI(context)
    );

    synced = true;
  } catch (error) {
    safeWarn(
      AppCore,
      "syncUserUI(context) falló.",
      error
    );
  }

  /*
    Compat legacy:
    syncUserUI(AppCore)
  */
  try {
    await Promise.resolve(
      syncUserUI(AppCore)
    );

    synced = true;
  } catch {}

  emit(
    AppCore,
    "app:ui:repair-request",
    {
      reason,
      authenticated:
        isAuthenticated(AppCore),
      user:
        getState(AppCore).user || null,
      role:
        getResolvedSessionRole(AppCore),
      source:
        "AppSession",
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

  /*
    Solo quitamos auth-screen si:
    - ya hay sesión, y
    - estamos fuera de login/reset/activation, o
    - se fuerza tras navegación a ruta privada.
  */
  if (
    !authenticated ||
    (!force && authLike)
  ) {
    return false;
  }

  try {
    document.body?.classList?.remove?.(
      "auth-screen",
      "login-no-scroll"
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
      shell.setAttribute(
        "aria-busy",
        "false"
      );
    }
  } catch {}

  try {
    const main =
      document.getElementById("main-content");

    if (main) {
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
      view.setAttribute(
        "aria-busy",
        "false"
      );
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

function emitSessionReadyEvents({
  AppCore,
  reason = "session-ready",
  result = {},
} = {}) {
  const payload = {
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
    source:
      "AppSession",
  };

  emit(
    AppCore,
    "auth:session:restored",
    payload
  );

  emit(
    AppCore,
    "app:session:restored",
    payload
  );

  emit(
    AppCore,
    "app:user:change",
    payload
  );

  emit(
    AppCore,
    "app:ui:repair-request",
    payload
  );

  return payload;
}

/* =========================================================
   NAVIGATION GUARDS
========================================================= */

function shouldSkipNavigation(state) {
  return Boolean(
    state?.bootNavigationHandled ||
    state?.loginNavigationHandled ||
    state?.loginInProgress
  );
}

function markNavigationHandled(
  state,
  value = true
) {
  try {
    if (
      state &&
      typeof state === "object"
    ) {
      state.bootNavigationHandled =
        Boolean(value);
    }
  } catch {}
}

function markNavigationSkipped(
  state,
  reason = "unknown"
) {
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

function normalizeTargetPath(path = "/") {
  const target =
    normalizeInternalPath(
      safeText(path, "/") || "/"
    );

  if (!target.startsWith("/")) {
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

function buildSnapshot(
  AppCore,
  extras = {}
) {
  const state =
    getState(AppCore);

  return {
    authenticated:
      Boolean(state.authenticated),

    user:
      state.user || null,

    username:
      getResolvedSessionUser(AppCore),

    role:
      getResolvedSessionRole(AppCore),

    route:
      state.route || "/",

    publicPath:
      state.publicPath || "/",

    bootInitialUrl:
      state.bootInitialUrl ||
      getInitialUrl() ||
      null,

    bootProtectedInitialUrl:
      state.bootProtectedInitialUrl ||
      null,

    bootActivationInitialUrl:
      state.bootActivationInitialUrl ||
      getActivationInitialUrl() ||
      null,

    bootResetConfirmInitialUrl:
      state.bootResetConfirmInitialUrl ||
      getResetConfirmInitialUrl() ||
      null,

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

    ...extras,
  };
}

/* =========================================================
   TARGET RESOLUTION
========================================================= */

function resolvePostLoginTarget({
  AppCore,
  Auth,
} = {}) {
  const user =
    getState(AppCore).user || null;

  try {
    if (
      isFunction(Auth?.getPostLoginTarget)
    ) {
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
          normalized !== LOGIN_PATH
        ) {
          return normalized;
        }
      }
    }
  } catch {}

  const state =
    getState(AppCore);

  const candidates = [
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

  return "/";
}

/* =========================================================
   ROUTER NAVIGATION
========================================================= */

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

  try {
    if (
      isFunction(Router.navigate)
    ) {
      const result =
        Router.navigate(
          target,
          {
            replaceState,
            force,
          }
        );

      if (
        result &&
        isFunction(result.then)
      ) {
        await result;
      }

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate() falló:",
      error
    );
  }

  try {
    if (
      isFunction(Router.goAfterLogin)
    ) {
      const result =
        Router.goAfterLogin(target);

      if (
        result &&
        isFunction(result.then)
      ) {
        await result;
      }

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.goAfterLogin() falló:",
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

  if (
    !isAuthenticated(AppCore)
  ) {
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
    isPublicTechnicalCanonicalPath(
      currentCanonicalPath
    ) ||
    isPublicTechnicalCanonicalPath(
      currentPublicPath
    ) ||
    isActivationBoot(AppCore) ||
    isResetConfirmBoot(AppCore) ||
    isResetConfirmCanonicalPath(
      currentCanonicalPath
    ) ||
    isResetConfirmCanonicalPath(
      currentPublicPath
    );

  /*
    CRÍTICO:
    No navegar nunca desde rutas públicas técnicas.

    IMPORTANTE:
    Aquí NO se marca bootNavigationHandled.
    Bloquear navegación no significa que Router ya haya renderizado.
    Si marcamos bootNavigationHandled aquí, App.index puede saltarse
    renderInitialRoute() y dejar pantalla rota/blanca.
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
          currentCanonicalPath,
        publicPath:
          currentPublicPath,
        activationBoot:
          isActivationBoot(AppCore),
        resetConfirmBoot:
          isResetConfirmBoot(AppCore),
      }
    );

    return false;
  }

  if (
    shouldSkipNavigation(state)
  ) {
    markNavigationSkipped(
      state,
      "already-handled"
    );

    safeLog(
      AppCore,
      "navigateAfterSessionRestore(): omitido porque ya hay navegación resuelta.",
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
      }
    );

    return false;
  }

  /*
    Solo redirigir desde login.
    Si ya estamos fuera de /login, no tocar navegación.
  */
  if (
    !isLoginCanonicalPath(
      currentCanonicalPath
    )
  ) {
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
      replaceState: true,
      force: false,
    });

  if (navigated) {
    /*
      Solo aquí se marca como handled:
      significa que Router ya recibió navegación real.
    */
    markNavigationHandled(
      state,
      true
    );

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
        "app:ui:repair-request",
        {
          reason:
            "post-restore-navigation-after-paint",
          target,
          authenticated: true,
          source: "AppSession",
        }
      );
    });

    emit(
      AppCore,
      "app:auth:navigation",
      {
        reason:
          "post-restore-login-navigation",
        target,
        authenticated: true,
        source: "AppSession",
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
   RESTORE AUTH SESSION
========================================================= */

export async function restoreAuthSession({
  AppCore,
  Auth,
  Router,
  syncUserUI,
  state,
} = {}) {
  if (
    state?.sessionRestorePromise
  ) {
    return state.sessionRestorePromise;
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
      reason:
        "auth-module-missing",
    });

    return buildSnapshot(
      AppCore,
      {
        ok: false,
        reason: "auth-module-missing",
      }
    );
  }

  state.sessionRestorePromise =
    (async () => {
      try {
        const activationBoot =
          isActivationBoot(AppCore);

        const resetConfirmBoot =
          isResetConfirmBoot(AppCore);

        const publicTechnicalBoot =
          isPublicTechnicalBoot(AppCore);

        safeLog(
          AppCore,
          "Restore session iniciado...",
          {
            activationBoot,
            resetConfirmBoot,
            publicTechnicalBoot,
          }
        );

        /*
          Flags de navegación silenciosa.
          Auth.restoreSession debe restaurar sesión, no decidir navegación final.
        */
        const result =
          await Auth.restoreSession({
            silent: true,
            skipNavigation: true,

            publicRoute:
              publicTechnicalBoot,

            preserveCurrentRoute:
              publicTechnicalBoot,

            preserveRoute:
              publicTechnicalBoot,

            activationBoot,
            resetConfirmBoot,
          });

        await runSyncUserUI({
          AppCore,
          Auth,
          Router,
          syncUserUI,
          reason:
            "restore-auth-session",
        });

        if (
          isAuthenticated(AppCore)
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
                Boolean(result?.ok),
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
          reason:
            "restore-auth-session-error",
        });

        return buildSnapshot(
          AppCore,
          {
            ok: false,
            error,
          }
        );
      } finally {
        if (
          state &&
          typeof state === "object"
        ) {
          state.sessionRestorePromise = null;
        }
      }
    })();

  return state.sessionRestorePromise;
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
    const activationBoot =
      isActivationBoot(AppCore);

    const resetConfirmBoot =
      isResetConfirmBoot(AppCore);

    const publicTechnicalBoot =
      isPublicTechnicalBoot(AppCore);

    /*
      CRÍTICO:
      No marcar bootNavigationHandled aquí.
      Las rutas públicas técnicas solo bloquean navegación,
      pero App.index debe poder renderizar la ruta inicial si aún no lo hizo.
    */
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

    const result =
      await restoreAuthSession({
        AppCore,
        Auth,
        Router,
        syncUserUI,
        state,
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

    if (
      !activationBoot &&
      !resetConfirmBoot &&
      !publicTechnicalBoot &&
      !skipPostRestoreNavigation
    ) {
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

    await runSyncUserUI({
      AppCore,
      Auth,
      Router,
      syncUserUI,
      reason:
        "restore-session-background-final",
    });

    if (
      isAuthenticated(AppCore)
    ) {
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
        result,
      });
    }

    const snapshot =
      buildSnapshot(
        AppCore,
        {
          ok:
            safeBool(result?.ok) ||
            Boolean(result?.ok),
          activationBoot,
          resetConfirmBoot,
          publicTechnicalBoot,
          skipPostRestoreNavigation,
        }
      );

    safeLog(
      AppCore,
      "restoreSessionInBackground() completado:",
      snapshot
    );

    return {
      ...(result || {}),
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
      reason:
        "restore-session-background-error",
    });

    return buildSnapshot(
      AppCore,
      {
        ok: false,
        error,
      }
    );
  }
}

/* =========================================================
   DEBUG
========================================================= */

export function getSessionBootstrapSnapshot({
  AppCore,
  Router = null,
  state,
} = {}) {
  return {
    ...buildSnapshot(AppCore),

    restoring:
      Boolean(
        state?.sessionRestorePromise
      ),

    bootNavigationHandled:
      Boolean(
        state?.bootNavigationHandled
      ),

    postRestoreNavigationSkipped:
      Boolean(
        state?.postRestoreNavigationSkipped
      ),

    postRestoreNavigationSkippedReason:
      state?.postRestoreNavigationSkippedReason ||
      null,

    initialRouteRendered:
      Boolean(
        state?.initialRouteRendered
      ),

    loginNavigationHandled:
      Boolean(
        state?.loginNavigationHandled
      ),

    loginInProgress:
      Boolean(
        state?.loginInProgress
      ),

    activationBoot:
      isActivationBoot(AppCore),

    resetConfirmBoot:
      isResetConfirmBoot(AppCore),

    publicTechnicalBoot:
      isPublicTechnicalBoot(AppCore),

    currentCanonicalPath:
      getCurrentCanonicalSafe(
        AppCore,
        Router
      ),

    currentPublicPath:
      getCurrentPublicSafe(
        AppCore,
        Router
      ),
  };
}

export default {
  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};

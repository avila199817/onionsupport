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
   - no pisar /reset-password/confirm/<token>
   - no redirigir activation/reset aunque exista sesión previa
   - evitar doble navegación después de login
   - evitar repaint fantasma desde /login

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

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
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
    null
  );
}

function getResolvedSessionRole(AppCore) {
  return (
    getState(AppCore)?.role || null
  );
}

function isAuthenticated(AppCore) {
  return Boolean(
    getState(AppCore)?.authenticated
  );
}

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

/* =========================================================
   TOKEN / PUBLIC ROUTE HELPERS
========================================================= */

function hasTokenInSearch(search = "") {
  try {
    const params =
      new URLSearchParams(search || "");

    return ACTIVATION_TOKEN_PARAM_NAMES.some(
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

function hasActivationToken(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  /*
    Formato nuevo:
    /activate-account/<token>
  */
  if (
    extractPathToken(
      raw,
      ACTIVATION_PATH
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
        ACTIVATION_PATH
      )
    ) {
      return true;
    }

    if (
      hasTokenInSearch(parsed.search)
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
        query ? `?${query}` : ""
      );
    }
  } catch {
    const path =
      pathFromUrlLike(raw) || raw;

    if (
      extractPathToken(
        path,
        ACTIVATION_PATH
      )
    ) {
      return true;
    }

    if (raw.includes("?")) {
      const query =
        raw.split("?").slice(1).join("?").split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : ""
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
          query ? `?${query}` : ""
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function isActivationTokenScrubbed() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.scrubbedActivationToken
    );
  } catch {
    return false;
  }
}

function getBootInitialPath(AppCore) {
  const state =
    getState(AppCore);

  return (
    safeText(
      state.bootActivationInitialPath,
      ""
    ) ||
    pathFromUrlLike(
      getActivationInitialUrl()
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

  const activationInitialUrl =
    getActivationInitialUrl();

  if (
    activationInitialUrl &&
    isActivationCanonicalPath(
      getCanonicalFromAnyPath(
        activationInitialUrl
      )
    ) &&
    hasActivationToken(activationInitialUrl)
  ) {
    return true;
  }

  const initialUrl =
    getInitialUrl();

  if (
    initialUrl &&
    isActivationCanonicalPath(
      getCanonicalFromAnyPath(initialUrl)
    ) &&
    hasActivationToken(initialUrl)
  ) {
    return true;
  }

  const bootPath =
    getBootInitialPath(AppCore);

  return (
    isActivationCanonicalPath(
      getCanonicalFromAnyPath(bootPath)
    ) &&
    hasActivationToken(bootPath)
  );
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
    isActivationBoot(AppCore)
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
    getBootInitialPath(AppCore) ||
    "/"
  );
}

/* =========================================================
   NAVIGATION GUARDS
========================================================= */

function shouldSkipNavigation(state) {
  return Boolean(
    state?.bootNavigationHandled ||
    state?.initialRouteRendered ||
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

function markNavigationHandledTrue(state) {
  markNavigationHandled(state, true);
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

    bootActivationInitialUrl:
      state.bootActivationInitialUrl ||
      getActivationInitialUrl() ||
      null,

    bootIsActivation:
      Boolean(state.bootIsActivation),

    bootHasActivationToken:
      Boolean(state.bootHasActivationToken),

    activationTokenScrubbed:
      isActivationTokenScrubbed(),

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
  try {
    if (
      isFunction(Auth?.getPostLoginTarget)
    ) {
      const next =
        Auth.getPostLoginTarget(
          getState(AppCore).user,
          {}
        );

      if (
        next &&
        typeof next === "string"
      ) {
        return normalizeTargetPath(next);
      }
    }
  } catch {}

  return "/";
}

/* =========================================================
   NAVEGACIÓN POST RESTORE
========================================================= */

export function navigateAfterSessionRestore({
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
    isResetConfirmCanonicalPath(
      currentCanonicalPath
    ) ||
    isResetConfirmCanonicalPath(
      currentPublicPath
    );

  /*
    CRÍTICO:
    No navegar nunca desde rutas públicas técnicas.
    Ejemplos:
      /activate-account?token=...
      /activate-account/<token>
      /reset-password/confirm/<token>

    Aunque el usuario tenga sesión previa, estas vistas públicas deben seguir.
  */
  if (publicTechnical) {
    markNavigationHandledTrue(state);

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
      }
    );

    return false;
  }

  if (
    shouldSkipNavigation(state)
  ) {
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
        initialRouteRendered:
          Boolean(state?.initialRouteRendered),
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
    Si ya estamos fuera de /login, no tocar nada.
  */
  if (
    currentCanonicalPath !== LOGIN_PATH
  ) {
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
    return false;
  }

  markNavigationHandledTrue(state);

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

  /*
    Preferimos Router.navigate directo con force:false.
    Evita que goAfterLogin aplique lógica extra o fuerce segundo render.
  */
  try {
    if (
      isFunction(Router.navigate)
    ) {
      Router.navigate(
        target,
        {
          replaceState: true,
          force: false,
        }
      );

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
      Router.goAfterLogin(target);
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
   RESTORE AUTH SESSION
========================================================= */

export async function restoreAuthSession({
  AppCore,
  Auth,
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
    try {
      await Promise.resolve(
        syncUserUI?.(AppCore)
      );
    } catch {}

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

        const publicTechnicalBoot =
          isPublicTechnicalBoot(AppCore);

        safeLog(
          AppCore,
          "Restore session iniciado...",
          {
            activationBoot,
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
            activationBoot,
          });

        await Promise.resolve(
          syncUserUI?.(AppCore)
        );

        const snapshot =
          buildSnapshot(
            AppCore,
            {
              ok:
                Boolean(result?.ok),
              activationBoot,
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

        try {
          await Promise.resolve(
            syncUserUI?.(AppCore)
          );
        } catch {}

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

    const publicTechnicalBoot =
      isPublicTechnicalBoot(AppCore);

    /*
      CRÍTICO:
      No resetear bootNavigationHandled a false.
      Antes se hacía:
        markNavigationHandled(state, activationBoot || skipPostRestoreNavigation)

      Eso podía convertir un true previo en false y abrir la puerta
      a una navegación extra durante/paralela al login.

      Ahora solo marcamos true cuando hay motivo real para bloquear navegación.
    */
    if (
      activationBoot ||
      publicTechnicalBoot ||
      skipPostRestoreNavigation
    ) {
      markNavigationHandledTrue(state);
    }

    const result =
      await restoreAuthSession({
        AppCore,
        Auth,
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
      !publicTechnicalBoot &&
      !skipPostRestoreNavigation
    ) {
      navigateAfterSessionRestore({
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
          publicTechnicalBoot,
          skipPostRestoreNavigation,
        }
      );
    }

    const snapshot =
      buildSnapshot(
        AppCore,
        {
          ok:
            safeBool(result?.ok) ||
            Boolean(result?.ok),
          activationBoot,
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
    safeWarn(
      AppCore,
      "restoreSessionInBackground() falló:",
      error
    );

    try {
      await Promise.resolve(
        syncUserUI?.(AppCore)
      );
    } catch {}

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

    publicTechnicalBoot:
      isPublicTechnicalBoot(AppCore),

    currentCanonicalPath:
      getCurrentCanonicalSafe(
        AppCore,
        null
      ),

    currentPublicPath:
      getCurrentPublicSafe(
        AppCore,
        null
      ),
  };
}

export default {
  navigateAfterSessionRestore,
  restoreAuthSession,
  restoreSessionInBackground,
  getSessionBootstrapSnapshot,
};

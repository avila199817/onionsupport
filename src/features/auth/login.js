/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   RESPONSABILIDADES:
   - preparar credenciales login
   - construir payload robusto
   - redirects post-login seguros
   - ejecutar login
   - soportar 2FA opcional
   - submit desde formularios HTML
   - endurecer respuestas heterogéneas backend
   - navegación SPA consistente tras login
   - anti race conditions concurrentes
   - cero estados auth fantasma
   - evitar doble navegación / doble render post-login

   HARDENING EXTREMO:
   - mutex real de login concurrente
   - restore limpio previo a login
   - redirects blindados
   - sync inmediata AppCore/UI/router
   - tolerancia total backend legacy
   - eventos enterprise completos
   - errores normalizados
   - fallback post-login siempre a home "/"
   - sin home por rol
   - navegación deduplicada
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  isBrowser,
  sanitizeUsername,
  normalizePath,
  getCurrentCanonicalPath,
  isAuthRoute,
  configLikeRoute,
  isSafeRelativePath,
  extractMessage,
} from "./helpers.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

import {
  validateAuthResponse,
} from "./normalize.js";

import {
  persistTempToken,
} from "./storage.js";

import {
  applySession,
  clearSessionLocal,
} from "./session.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let loginPromise = null;
let loginSequence = 0;

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
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

function safeBool(value) {
  return value === true;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeSetError(error) {
  try {
    AppCore?.setError?.(
      error || null
    );
  } catch {}
}

function safeSyncUserUI() {
  try {
    AppCore?.syncUserUI?.();
  } catch {}
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.services?.http ||
    AppCore?.services?.api ||
    null
  );
}

function resolveLoginEndpoint() {
  return (
    safeText(
      AUTH_ENDPOINTS?.login,
      ""
    ) ||
    "/api/auth/login"
  );
}

function getHomeRoute() {
  return (
    configLikeRoute(
      AppCore?.config?.routes?.home ||
        "/"
    ) || "/"
  );
}

function getLoginRoute() {
  return (
    configLikeRoute(
      AppCore?.config?.routes?.login ||
        "/login"
    ) || "/login"
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

    return normalizePath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "/";
  }
}

function getBrowserCanonicalPath() {
  try {
    return configLikeRoute(
      getCurrentCanonicalPath() ||
        getBrowserPath() ||
        "/"
    );
  } catch {
    return configLikeRoute(
      getBrowserPath() || "/"
    );
  }
}

function sameCanonicalPath(
  a = "/",
  b = "/"
) {
  try {
    return (
      configLikeRoute(
        normalizePath(a)
      ) ===
      configLikeRoute(
        normalizePath(b)
      )
    );
  } catch {
    return String(a || "/") === String(b || "/");
  }
}

function shouldNavigateAfterLogin(options = {}) {
  if (
    options?.navigate === false ||
    options?.skipNavigate === true ||
    options?.manualNavigate === true
  ) {
    return false;
  }

  return true;
}

function buildPopStateEvent() {
  try {
    return new PopStateEvent(
      "popstate"
    );
  } catch {
    return new Event(
      "popstate"
    );
  }
}

function safeNavigate(
  path = "/",
  options = {}
) {
  const target =
    normalizePath(
      safeText(path, getHomeRoute())
    ) || getHomeRoute();

  const current =
    getBrowserCanonicalPath();

  const targetCanonical =
    configLikeRoute(
      target
    );

  /*
    Deduplicación:
    Si ya estamos en destino, no forzamos render.
    Esto elimina parte del parpadeo post-login.
  */
  if (
    isBrowser() &&
    sameCanonicalPath(
      current,
      targetCanonical
    )
  ) {
    return true;
  }

  try {
    const router =
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.Router ||
      null;

    if (
      router &&
      typeof router.navigate === "function"
    ) {
      router.navigate(
        target,
        {
          replaceState:
            options.replaceState !== false,
          force:
            options.force === true,
        }
      );

      return true;
    }
  } catch {}

  try {
    if (
      isBrowser() &&
      typeof window.history
        ?.replaceState ===
        "function"
    ) {
      window.history.replaceState(
        {
          path: target,
          publicPath: target,
          canonicalPath:
            configLikeRoute(target),
        },
        "",
        target
      );

      window.dispatchEvent(
        buildPopStateEvent()
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.location.assign(target);
      return true;
    }
  } catch {}

  return false;
}

function looksLikeEmail(
  value = ""
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value).trim()
  );
}

function looksLikePhone(
  value = ""
) {
  const clean =
    String(value)
      .replace(/[^\d+]/g, "")
      .trim();

  return /^\+?\d{6,20}$/.test(
    clean
  );
}

function normalizePhone(
  value = ""
) {
  return String(value)
    .replace(/[^\d+]/g, "")
    .trim();
}

/* =========================================================
   IDENTIFIER / PAYLOAD
========================================================= */

export function resolveLoginIdentifier(
  credentials = {}
) {
  return safeText(
    credentials.identifier ??
      credentials.username ??
      credentials.user ??
      credentials.email ??
      credentials.phone ??
      "",
    ""
  );
}

export function normalizeLoginPayload(
  credentials = {}
) {
  const rawIdentifier =
    resolveLoginIdentifier(
      credentials
    );

  const maxIdentifier =
    Number(
      AUTH_CONSTANTS?.identifierMaxLength
    ) || 160;

  const maxPassword =
    Number(
      AUTH_CONSTANTS?.passwordMaxLength
    ) || 256;

  const identifier =
    safeText(
      rawIdentifier
    )
      .replace(/\s+/g, " ")
      .slice(
        0,
        maxIdentifier
      );

  const password =
    String(
      credentials.password ??
        credentials.pass ??
        ""
    ).slice(
      0,
      maxPassword
    );

  return {
    identifier,
    password,
    remember:
      Boolean(
        credentials.remember
      ),
  };
}

export function buildLoginRequestBody(
  credentials = {}
) {
  const {
    identifier,
    password,
    remember,
  } =
    normalizeLoginPayload(
      credentials
    );

  const clean =
    safeText(
      identifier
    );

  const email =
    looksLikeEmail(clean)
      ? clean.toLowerCase()
      : undefined;

  const phone =
    !email &&
    looksLikePhone(clean)
      ? normalizePhone(clean)
      : undefined;

  const username =
    !email &&
    !phone
      ? sanitizeUsername(
          clean
        )
      : undefined;

  return {
    identifier: clean,
    email,
    phone,
    username,
    user: username,
    password,
    remember,
  };
}

/* =========================================================
   REDIRECTS
========================================================= */

function normalizeRedirectCandidate(value = "") {
  const candidate =
    normalizePath(
      safeText(value, "")
    );

  if (!candidate) {
    return "";
  }

  if (
    !isSafeRelativePath(
      candidate
    )
  ) {
    return "";
  }

  if (
    isAuthRoute(
      candidate
    )
  ) {
    return "";
  }

  return candidate;
}

function getRedirectFromUrl() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const redirect =
      new URLSearchParams(
        window.location.search
      ).get(
        "redirect"
      );

    return normalizeRedirectCandidate(
      redirect
    );
  } catch {
    return "";
  }
}

function getRedirectFromOptions(options = {}) {
  const opts =
    safeObject(options);

  return normalizeRedirectCandidate(
    opts.redirectTo ||
      opts.redirect ||
      opts.target ||
      ""
  );
}

export function buildLoginRedirectPath(
  targetPath = null
) {
  const loginPath =
    getLoginRoute();

  const target =
    configLikeRoute(
      targetPath ||
        getCurrentCanonicalPath() ||
        "/"
    );

  if (
    !target ||
    target === loginPath
  ) {
    return loginPath;
  }

  if (
    !isSafeRelativePath(
      target
    )
  ) {
    return loginPath;
  }

  if (
    isAuthRoute(
      target
    )
  ) {
    return loginPath;
  }

  if (!isBrowser()) {
    return `${loginPath}?redirect=${encodeURIComponent(
      target
    )}`;
  }

  const url =
    new URL(
      loginPath,
      window.location.origin
    );

  url.searchParams.set(
    "redirect",
    target
  );

  return `${url.pathname}${url.search}`;
}

/**
 * Destino post-login.
 *
 * Prioridad:
 * 1. options.redirectTo / options.redirect / options.target
 * 2. ?redirect=...
 * 3. Home configurado
 *
 * Importante:
 * - ya NO manda admin a /usuarios
 * - ya NO manda user a /@slug
 * - el fallback universal es /
 */
export function getPostLoginTarget(
  user = AppCore?.state?.user,
  options = {}
) {
  const fromOptions =
    getRedirectFromOptions(
      options
    );

  if (fromOptions) {
    return fromOptions;
  }

  const fromUrl =
    getRedirectFromUrl();

  if (fromUrl) {
    return fromUrl;
  }

  return getHomeRoute();
}

/* =========================================================
   CORE LOGIN
========================================================= */

async function executeLogin(
  credentials = {},
  sequence = 0,
  options = {}
) {
  const payload =
    normalizeLoginPayload(
      credentials
    );

  if (
    !payload.identifier ||
    !payload.password
  ) {
    throw new Error(
      "Usuario/email y contraseña son obligatorios."
    );
  }

  const apiClient =
    getApiClient();

  if (
    !apiClient ||
    typeof apiClient.post !==
      "function"
  ) {
    throw new Error(
      "No hay cliente API disponible para login."
    );
  }

  const endpoint =
    resolveLoginEndpoint();

  safeSetError(null);

  safeEmit(
    "auth:login:start",
    {
      identifier:
        payload.identifier,
      endpoint,
      sequence,
    }
  );

  const response =
    await apiClient.post(
      endpoint,
      buildLoginRequestBody(
        credentials
      ),
      {
        auth: false,
      }
    );

  const authData =
    validateAuthResponse(
      response
    );

  const requires2FA =
    authData?.status ===
      "2fa_required" ||
    authData?.requires2FA ===
      true;

  /* =====================================================
     2FA
  ===================================================== */

  if (
    requires2FA &&
    authData?.tempToken
  ) {
    persistTempToken(
      authData.tempToken
    );

    const result = {
      ok: true,
      success: true,
      status:
        "2fa_required",
      requires2FA: true,
      tempToken:
        authData.tempToken,
      redirectTo:
        safeText(
          authData.redirectTo,
          "/2fa"
        ),
      response,
    };

    safeEmit(
      "auth:login:2fa-required",
      result
    );

    if (
      shouldNavigateAfterLogin(
        options
      )
    ) {
      safeNavigate(
        result.redirectTo,
        {
          replaceState: true,
          force: false,
        }
      );
    }

    return result;
  }

  /* =====================================================
     CLEAN NORMAL LOGIN
  ===================================================== */

  persistTempToken(null);

  const snapshot =
    applySession({
      token:
        authData?.token ??
        null,

      user:
        authData?.user ??
        null,

      refreshToken:
        authData?.refreshToken ??
        null,

      sessionData:
        authData?.sessionData ??
        null,
    });

  if (
    !snapshot?.token
  ) {
    throw new Error(
      "El login devolvió sesión inválida."
    );
  }

  safeSyncUserUI();

  const redirectTo =
    getPostLoginTarget(
      snapshot.user,
      options
    );

  const result = {
    ok: true,
    success: true,
    status:
      "authenticated",
    requires2FA: false,
    ...snapshot,
    redirectTo,
    response,
  };

  safeEmit(
    "auth:login:success",
    result
  );

  if (
    shouldNavigateAfterLogin(
      options
    )
  ) {
    safeNavigate(
      redirectTo,
      {
        replaceState: true,
        force: false,
      }
    );
  }

  return result;
}

/* =========================================================
   PUBLIC LOGIN
========================================================= */

export async function login(
  credentials = {},
  options = {}
) {
  if (loginPromise) {
    return loginPromise;
  }

  const sequence =
    ++loginSequence;

  loginPromise =
    (async () => {
      try {
        clearSessionLocal({
          silent: true,
        });

        return await executeLogin(
          credentials,
          sequence,
          options
        );
      } catch (error) {
        clearSessionLocal({
          silent: true,
        });

        safeSetError(error);

        safeEmit(
          "auth:login:error",
          {
            sequence,
            error,
            message:
              extractMessage(
                error
              ),
          }
        );

        throw error;
      } finally {
        loginPromise = null;
      }
    })();

  return loginPromise;
}

/* =========================================================
   FORM SUBMIT
========================================================= */

export async function handleLoginFormSubmit(
  formElement,
  options = {}
) {
  if (
    !(
      formElement instanceof
      HTMLFormElement
    )
  ) {
    throw new Error(
      "Se esperaba un formulario HTML válido."
    );
  }

  const formData =
    new FormData(
      formElement
    );

  const credentials = {
    identifier:
      formData.get(
        "identifier"
      ) ||
      formData.get(
        "username"
      ) ||
      formData.get(
        "email"
      ) ||
      formData.get(
        "phone"
      ) ||
      formData.get(
        "user"
      ) ||
      "",

    password:
      formData.get(
        "password"
      ) || "",

    remember:
      formData.get(
        "remember"
      ) === "on" ||
      formData.get(
        "remember"
      ) === "true",
  };

  const result =
    await login(
      credentials,
      options
    );

  if (
    safeBool(
      options.resetOnSuccess
    ) &&
    result?.status ===
      "authenticated"
  ) {
    formElement.reset();
  }

  return result;
}

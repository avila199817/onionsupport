/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   Responsabilidades:
   - preparar credenciales login
   - construir payload robusto
   - redirects post-login seguros
   - ejecutar login
   - soportar 2FA opcional
   - submit desde formularios HTML
   - endurecer respuestas heterogéneas backend
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
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeBool(value) {
  return value === true;
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeSetError(error) {
  try {
    AppCore?.setError?.(error);
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

  const cleanIdentifier =
    safeText(
      rawIdentifier,
      ""
    )
      .replace(/\s+/g, " ")
      .slice(
        0,
        maxIdentifier
      );

  const password = String(
    credentials.password ??
      credentials.pass ??
      ""
  ).slice(
    0,
    maxPassword
  );

  return {
    identifier:
      cleanIdentifier,
    password,
    remember: Boolean(
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
      identifier,
      ""
    );

  const looksLikeEmail =
    clean.includes("@");

  return {
    identifier: clean,
    email:
      looksLikeEmail
        ? clean.toLowerCase()
        : undefined,

    username:
      looksLikeEmail
        ? undefined
        : sanitizeUsername(
            clean
          ),

    user:
      looksLikeEmail
        ? undefined
        : sanitizeUsername(
            clean
          ),

    password,
    remember,
  };
}

/* =========================================================
   REDIRECTS
========================================================= */

export function buildLoginRedirectPath(
  targetPath = null
) {
  const loginPath =
    configLikeRoute(
      AppCore?.config
        ?.routes
        ?.login ||
        "/login"
    );

  const canonicalTarget =
    configLikeRoute(
      targetPath ||
        getCurrentCanonicalPath() ||
        "/"
    );

  if (
    !canonicalTarget ||
    canonicalTarget ===
      loginPath
  ) {
    return loginPath;
  }

  if (
    !isSafeRelativePath(
      canonicalTarget
    )
  ) {
    return loginPath;
  }

  if (!isBrowser()) {
    return `${loginPath}?redirect=${encodeURIComponent(canonicalTarget)}`;
  }

  const url = new URL(
    loginPath,
    window.location.origin
  );

  url.searchParams.set(
    "redirect",
    canonicalTarget
  );

  return `${url.pathname}${url.search}`;
}

export function getPostLoginTarget(
  user = AppCore?.state?.user
) {
  if (isBrowser()) {
    try {
      const redirect =
        new URLSearchParams(
          window.location.search
        ).get(
          "redirect"
        );

      if (redirect) {
        const candidate =
          normalizePath(
            redirect
          );

        if (
          isSafeRelativePath(
            candidate
          ) &&
          !isAuthRoute(
            candidate
          )
        ) {
          return candidate;
        }
      }
    } catch {}
  }

  const slug =
    user?.slug ||
    AppCore?.utils?.slugify?.(
      user?.username ||
        user?.name ||
        user?.nombre ||
        ""
    ) ||
    "";

  if (slug) {
    return `/@${slug}`;
  }

  return (
    AppCore?.config
      ?.routes?.home ||
    "/"
  );
}

/* =========================================================
   LOGIN
========================================================= */

export async function login(
  credentials = {}
) {
  const payload =
    normalizeLoginPayload(
      credentials
    );

  if (
    !payload.identifier ||
    !payload.password
  ) {
    const error =
      new Error(
        "Usuario/email y contraseña son obligatorios."
      );

    safeSetError(error);
    throw error;
  }

  const endpoint =
    resolveLoginEndpoint();

  safeEmit(
    "auth:login:start",
    {
      identifier:
        payload.identifier,
      apiBase:
        AppCore?.config
          ?.apiBase,
      endpoint,
    }
  );

  const apiClient =
    getApiClient();

  if (
    !apiClient ||
    typeof apiClient.post !==
      "function"
  ) {
    const error =
      new Error(
        "No hay cliente API disponible para login."
      );

    safeSetError(error);
    throw error;
  }

  try {
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

      safeEmit(
        "auth:login:2fa-required",
        {
          identifier:
            payload.identifier,
          response,
        }
      );

      return {
        ok: true,
        success: true,
        status:
          "2fa_required",
        requires2FA:
          true,
        tempToken:
          authData.tempToken,
        redirectTo:
          safeText(
            authData.redirectTo,
            "/2fa"
          ),
        response,
      };
    }

    /* =====================================================
       LOGIN NORMAL
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

    const redirectTo =
      getPostLoginTarget(
        snapshot.user
      );

    safeEmit(
      "auth:login:success",
      {
        ...snapshot,
        redirectTo,
        response,
      }
    );

    return {
      ok: true,
      success: true,
      status:
        "authenticated",
      requires2FA:
        false,
      ...snapshot,
      redirectTo,
      response,
    };
  } catch (error) {
    clearSessionLocal();

    safeEmit(
      "auth:login:error",
      {
        error,
        message:
          extractMessage(
            error
          ),
      }
    );

    throw error;
  }
}

/* =========================================================
   FORM HELPER
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
      credentials
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

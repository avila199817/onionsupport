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

   HARDENING PRO:
   - anti doble submit concurrente
   - sanitización fuerte
   - soporte username/email/teléfono
   - redirects blindados
   - eventos consistentes
   - errores normalizados
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

/* =========================================================
   HELPERS
========================================================= */

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

function safeBool(value) {
  return value === true;
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

export function buildLoginRedirectPath(
  targetPath = null
) {
  const loginPath =
    configLikeRoute(
      AppCore?.config
        ?.routes?.login ||
        "/login"
    );

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

  if (!isBrowser()) {
    return `${loginPath}?redirect=${encodeURIComponent(target)}`;
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

  const role =
    safeText(
      user?.role ??
        user?.rol
    ).toLowerCase();

  if (role === "admin") {
    return "/usuarios";
  }

  if (
    role === "billing"
  ) {
    return "/facturas";
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
   LOGIN CORE
========================================================= */

async function executeLogin(
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

  const endpoint =
    resolveLoginEndpoint();

  safeSetError(null);

  safeEmit(
    "auth:login:start",
    {
      identifier:
        payload.identifier,
      endpoint,
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
     2FA FLOW
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

    return result;
  }

  /* =====================================================
     NORMAL LOGIN
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

  return result;
}

/* =========================================================
   PUBLIC LOGIN
========================================================= */

export async function login(
  credentials = {}
) {
  if (loginPromise) {
    return loginPromise;
  }

  loginPromise =
    (async () => {
      try {
        return await executeLogin(
          credentials
        );
      } catch (error) {
        clearSessionLocal({
          silent: true,
        });

        safeSetError(error);

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

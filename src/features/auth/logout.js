/* =========================================================
   Onion SPA - Auth Logout
   Archivo: src/features/auth/logout.js

   Responsabilidades:
   - cerrar sesión local y remota
   - invalidar refresh/session context si backend existe
   - limpiar estado AppCore
   - redirigir de forma segura
   - emitir eventos auth lifecycle
   - tolerar fallo de red sin bloquear logout local

   HARDENING PRO:
   - anti doble logout concurrente
   - timeout remoto
   - navegación robusta Router/AppCore/browser
   - snapshot consistente
   - no romper UI si backend falla
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
} from "./constants.js";

import {
  extractMessage,
  normalizePath,
  isSafeRelativePath,
} from "./helpers.js";

import {
  getStoredRefreshToken,
  getStoredSessionId,
  getStoredSessionUserId,
} from "./storage.js";

import {
  clearSessionLocal,
  buildSessionSnapshot,
} from "./session.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let logoutPromise = null;

/* =========================================================
   HELPERS
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

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      ...args
    );
  } catch {}
}

function resolveLogoutEndpoint() {
  return safeText(
    AUTH_ENDPOINTS?.logout,
    "/api/auth/logout"
  );
}

function resolveRedirect(
  target = ""
) {
  const candidate =
    normalizePath(
      safeText(
        target ||
          AppCore?.config
            ?.routes?.login ||
          "/login",
        "/login"
      )
    );

  if (
    isSafeRelativePath(
      candidate
    )
  ) {
    return candidate;
  }

  return "/login";
}

function buildLogoutBody() {
  return {
    refreshToken:
      safeText(
        getStoredRefreshToken()
      ),

    sessionId:
      safeText(
        getStoredSessionId()
      ),

    userId:
      safeText(
        getStoredSessionUserId()
      ),
  };
}

function getRouter() {
  return (
    AppCore?.modules?.get?.(
      "router"
    ) ||
    AppCore?.router ||
    null
  );
}

function navigateTo(
  path = "/login"
) {
  const finalPath =
    resolveRedirect(path);

  try {
    const router =
      getRouter();

    if (
      typeof router?.navigate ===
      "function"
    ) {
      router.navigate(
        finalPath,
        {
          replaceState: true,
          force: true,
        }
      );

      return true;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.navigate ===
      "function"
    ) {
      AppCore.navigate(
        finalPath
      );

      return true;
    }
  } catch {}

  if (
    typeof window !==
    "undefined"
  ) {
    window.location.assign(
      finalPath
    );
  }

  return true;
}

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 6000
) {
  const controller =
    typeof AbortController !==
    "undefined"
      ? new AbortController()
      : null;

  const timer =
    controller
      ? setTimeout(
          () =>
            controller.abort(),
          timeout
        )
      : null;

  try {
    return await fetch(url, {
      ...options,
      signal:
        controller?.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   REMOTE LOGOUT
========================================================= */

async function requestRemoteLogout() {
  const endpoint =
    resolveLogoutEndpoint();

  const body =
    buildLogoutBody();

  if (
    typeof AppCore
      ?.apiClient?.post ===
    "function"
  ) {
    return AppCore.apiClient.post(
      endpoint,
      body,
      {
        auth: false,
        timeout: 6000,
      }
    );
  }

  if (
    typeof AppCore?.request ===
    "function"
  ) {
    return AppCore.request(
      endpoint,
      {
        method: "POST",
        auth: false,
        body,
        timeout: 6000,
      }
    );
  }

  if (
    typeof fetch ===
    "function"
  ) {
    const response =
      await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            Accept:
              "application/json",
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify(
              body
            ),
        },
        6000
      );

    return {
      ok:
        response?.ok ===
        true,
      status:
        response?.status ||
        0,
    };
  }

  return null;
}

/* =========================================================
   CORE ACTION
========================================================= */

async function executeLogout(
  options = {}
) {
  const {
    redirectTo = "",
    navigate = true,
    remote = true,
    silent = false,
  } = options;

  const before =
    buildSessionSnapshot();

  safeEmit(
    "auth:logout:start",
    {
      authenticated:
        before.authenticated,
      user:
        before.user ||
        null,
    }
  );

  let remoteError = null;

  if (safeBool(remote)) {
    try {
      await requestRemoteLogout();

      safeEmit(
        "auth:logout:remote-success",
        {}
      );
    } catch (error) {
      remoteError = error;

      safeWarn(
        "Logout remoto falló:",
        error
      );

      safeEmit(
        "auth:logout:remote-error",
        {
          error,
          message:
            extractMessage(
              error
            ),
        }
      );
    }
  }

  clearSessionLocal({
    silent,
  });

  try {
    AppCore?.setError?.(
      null
    );
  } catch {}

  const finalRedirect =
    safeBool(navigate)
      ? resolveRedirect(
          redirectTo
        )
      : null;

  safeEmit(
    "auth:logout:success",
    {
      hadSession:
        before.authenticated,
      remoteOk:
        !remoteError,
      redirectTo:
        finalRedirect,
    }
  );

  if (
    safeBool(navigate) &&
    finalRedirect
  ) {
    navigateTo(
      finalRedirect
    );
  }

  return {
    ok: true,
    remoteOk:
      !remoteError,
    error:
      remoteError ||
      null,
    redirectTo:
      finalRedirect,
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function logout(
  options = {}
) {
  if (logoutPromise) {
    return logoutPromise;
  }

  logoutPromise =
    (async () => {
      try {
        return await executeLogout(
          options
        );
      } finally {
        logoutPromise =
          null;
      }
    })();

  return logoutPromise;
}

export default logout;

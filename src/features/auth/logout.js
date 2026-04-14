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
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, payload);
  } catch {}
}

function resolveLogoutEndpoint() {
  return safeText(
    AUTH_ENDPOINTS?.logout,
    "/api/auth/logout"
  );
}

function resolveRedirect(target = "") {
  const candidate =
    normalizePath(
      safeText(
        target ||
        AppCore?.config?.routes?.login ||
        "/login",
        "/login"
      )
    );

  if (
    isSafeRelativePath(candidate)
  ) {
    return candidate;
  }

  return "/login";
}

function navigateTo(path = "/login") {
  const finalPath =
    resolveRedirect(path);

  try {
    if (
      typeof AppCore?.navigate ===
      "function"
    ) {
      AppCore.navigate(finalPath);
      return true;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.router?.navigate ===
      "function"
    ) {
      AppCore.router.navigate(
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

function buildLogoutBody() {
  return {
    refreshToken:
      safeText(
        getStoredRefreshToken(),
        ""
      ),
    sessionId:
      safeText(
        getStoredSessionId(),
        ""
      ),
    userId:
      safeText(
        getStoredSessionUserId(),
        ""
      ),
  };
}

async function requestRemoteLogout() {
  const endpoint =
    resolveLogoutEndpoint();

  const body =
    buildLogoutBody();

  const requestFn =
    AppCore?.utils?.request ||
    AppCore?.request ||
    null;

  if (
    typeof requestFn ===
    "function"
  ) {
    return requestFn(
      endpoint,
      {
        method: "POST",
        auth: false,
        body,
      }
    );
  }

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
      }
    );
  }

  if (
    typeof fetch ===
    "function"
  ) {
    const res =
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "Accept":
            "application/json",
        },
        body: JSON.stringify(
          body
        ),
      });

    return {
      ok: res.ok,
      status: res.status,
    };
  }

  return null;
}

/* =========================================================
   ACTION
========================================================= */

export async function logout(
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

  if (remote) {
    try {
      await requestRemoteLogout();
    } catch (error) {
      remoteError = error;

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

  safeEmit(
    "auth:logout:success",
    {
      hadSession:
        before.authenticated,
      remoteOk:
        !remoteError,
    }
  );

  if (navigate) {
    navigateTo(
      redirectTo
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
      navigate
        ? resolveRedirect(
            redirectTo
          )
        : null,
  };
}

export default logout;

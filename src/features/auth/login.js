/* =========================================================
   Onion SPA - Auth Login
   Archivo: src/features/auth/login.js

   Responsabilidades:
   - preparar credenciales de login
   - construir payload robusto para backend heterogéneo
   - resolver redirects post-login seguros
   - ejecutar login
   - soportar 2FA opcional con tempToken
   - soportar submit directo desde formularios HTML
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
   IDENTIFIER / PAYLOAD
========================================================= */
export function resolveLoginIdentifier(credentials = {}) {
  return String(
    credentials.identifier ??
      credentials.username ??
      credentials.user ??
      credentials.email ??
      ""
  ).trim();
}

export function normalizeLoginPayload(credentials = {}) {
  const rawIdentifier = resolveLoginIdentifier(credentials);
  const cleanIdentifier = String(rawIdentifier || "")
    .trim()
    .replace(/\s+/g, " ");

  const identifier = cleanIdentifier.slice(
    0,
    AUTH_CONSTANTS.identifierMaxLength
  );

  const rawPassword = String(credentials.password ?? credentials.pass ?? "");
  const password = rawPassword.slice(0, AUTH_CONSTANTS.passwordMaxLength);

  const remember = Boolean(credentials.remember);

  return {
    identifier,
    password,
    remember,
  };
}

export function buildLoginRequestBody(credentials = {}) {
  const { identifier, password, remember } =
    normalizeLoginPayload(credentials);

  const cleanIdentifier = String(identifier || "").trim();
  const looksLikeEmail = cleanIdentifier.includes("@");

  return {
    identifier,
    email: looksLikeEmail ? cleanIdentifier.toLowerCase() : undefined,
    username: looksLikeEmail
      ? undefined
      : sanitizeUsername(cleanIdentifier),
    password,
    remember,
  };
}

/* =========================================================
   REDIRECTS
========================================================= */
export function buildLoginRedirectPath(targetPath = null) {
  const loginPath = configLikeRoute(
    AppCore.config?.routes?.login || "/login"
  );

  const canonicalTarget = configLikeRoute(
    targetPath || getCurrentCanonicalPath() || "/"
  );

  if (!canonicalTarget || canonicalTarget === "/login") {
    return loginPath;
  }

  if (!isBrowser()) {
    return `${loginPath}?redirect=${encodeURIComponent(canonicalTarget)}`;
  }

  const url = new URL(window.location.origin + loginPath);
  url.searchParams.set("redirect", canonicalTarget);

  return `${url.pathname}${url.search}`;
}

export function getPostLoginTarget(user = AppCore.state.user) {
  if (isBrowser()) {
    const redirectParam = new URLSearchParams(window.location.search).get(
      "redirect"
    );

    if (redirectParam) {
      const candidate = normalizePath(redirectParam);

      if (isSafeRelativePath(candidate) && !isAuthRoute(candidate)) {
        return candidate;
      }
    }
  }

  const slug =
    user?.slug ||
    AppCore.utils?.slugify?.(user?.username || user?.name || "") ||
    "";

  if (slug) {
    return `/@${slug}`;
  }

  return AppCore.config?.routes?.home || "/";
}

/* =========================================================
   LOGIN
========================================================= */
export async function login(credentials = {}) {
  const payload = normalizeLoginPayload(credentials);

  if (!payload.identifier || !payload.password) {
    const error = new Error(
      "Usuario/email y contraseña son obligatorios."
    );

    AppCore.setError(error);
    throw error;
  }

  AppCore.events.emit("auth:login:start", {
    identifier: payload.identifier,
    apiBase: AppCore.config.apiBase,
    endpoint: AUTH_ENDPOINTS.login,
  });

  try {
    const response = await AppCore.apiClient.post(
      AUTH_ENDPOINTS.login,
      buildLoginRequestBody(credentials),
      {
        auth: false,
      }
    );

    const authData = validateAuthResponse(response);

    if (authData.status === "2fa_required" && authData.tempToken) {
      persistTempToken(authData.tempToken);

      AppCore.events.emit("auth:login:2fa-required", {
        identifier: payload.identifier,
        tempToken: authData.tempToken,
        response,
      });

      return {
        ok: true,
        status: "2fa_required",
        requires2FA: true,
        tempToken: authData.tempToken,
        redirectTo: "/2fa",
        response,
      };
    }

    persistTempToken(null);

    const snapshot = applySession({
      token: authData.token ?? null,
      user: authData.user ?? null,
      refreshToken: authData.refreshToken ?? null,
      sessionData: authData.sessionData ?? null,
    });

    if (!snapshot.token) {
      throw new Error(
        "El login devolvió usuario pero no devolvió token."
      );
    }

    const redirectTo = getPostLoginTarget(snapshot.user);

    AppCore.events.emit("auth:login:success", {
      ...snapshot,
      redirectTo,
      response,
    });

    return {
      ok: true,
      status: "authenticated",
      requires2FA: false,
      ...snapshot,
      redirectTo,
      response,
    };
  } catch (error) {
    clearSessionLocal();

    AppCore.events.emit("auth:login:error", {
      error,
      message: extractMessage(error),
    });

    throw error;
  }
}

/* =========================================================
   FORM HELPER
========================================================= */
export async function handleLoginFormSubmit(formElement, options = {}) {
  if (!(formElement instanceof HTMLFormElement)) {
    throw new Error("Se esperaba un formulario HTML válido.");
  }

  const formData = new FormData(formElement);

  const credentials = {
    identifier:
      formData.get("identifier") ||
      formData.get("username") ||
      formData.get("email") ||
      formData.get("user") ||
      "",
    password: formData.get("password") || "",
    remember:
      formData.get("remember") === "on" ||
      formData.get("remember") === "true",
  };

  const result = await login(credentials);

  if (options.resetOnSuccess && result?.status === "authenticated") {
    formElement.reset();
  }

  return result;
}

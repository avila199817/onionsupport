/* =========================================================
   Onion SPA - Password Reset
   Archivo: src/features/auth/password-reset.js

   Responsabilidades:
   - resolver identificador de recuperación
   - normalizar payload de reset-password
   - construir body de request compatible con backend heterogéneo
   - ejecutar petición de recuperación de acceso
   - normalizar la respuesta del backend
   - tolerar múltiples formas de transporte HTTP
========================================================= */

import { AppCore } from "../../core/index.js";
import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
} from "./constants.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isValidEmail(value = "") {
  const email = safeText(value, "").toLowerCase();

  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

/* =========================================================
   ENDPOINT RESOLUTION
========================================================= */

function getConfiguredEndpoint() {
  const candidates = [
    AUTH_ENDPOINTS?.requestPasswordReset,
    AUTH_ENDPOINTS?.resetPasswordRequest,
    AUTH_ENDPOINTS?.forgotPassword,
    AUTH_ENDPOINTS?.passwordReset,
    AUTH_ENDPOINTS?.passwordResetRequest,
    AUTH_ENDPOINTS?.recoverPassword,
    AUTH_ENDPOINTS?.recover,
    AUTH_ENDPOINTS?.forgot,
    "/auth/forgot-password",
    "/auth/reset-password",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
  ];

  for (const candidate of candidates) {
    const value = safeText(candidate, "");
    if (value) {
      return value;
    }
  }

  return "/api/auth/forgot-password";
}

export function getRequestPasswordResetEndpoint() {
  return getConfiguredEndpoint();
}

/* =========================================================
   IDENTIFIER
========================================================= */

export function resolveResetPasswordIdentifier(payload = {}) {
  return safeText(
    payload?.identifier ||
      payload?.email ||
      payload?.username ||
      payload?.user ||
      "",
    ""
  );
}

export function normalizeResetPasswordPayload(payload = {}) {
  const identifier = resolveResetPasswordIdentifier(payload);

  return {
    identifier,
    email: looksLikeEmail(identifier)
      ? identifier.toLowerCase()
      : "",
    username: looksLikeEmail(identifier)
      ? ""
      : identifier,
    remember: Boolean(payload?.remember),
    redirect: safeText(payload?.redirect, ""),
  };
}

/* =========================================================
   REQUEST BODY
========================================================= */

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized = normalizeResetPasswordPayload(payload);

  const body = {
    identifier: normalized.identifier,
  };

  /*
    Compat con backends heterogéneos:
    enviamos siempre identifier y además email/username
    cuando podemos inferirlos.
  */
  if (normalized.email) {
    body.email = normalized.email;
  }

  if (normalized.username) {
    body.username = normalized.username;
    body.user = normalized.username;
  }

  if (normalized.redirect) {
    body.redirect = normalized.redirect;
  }

  return body;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeResetPasswordResponse(response = {}) {
  const ok =
    typeof response?.ok === "boolean"
      ? response.ok
      : typeof response?.success === "boolean"
        ? response.success
        : typeof response?.data?.ok === "boolean"
          ? response.data.ok
          : typeof response?.data?.success === "boolean"
            ? response.data.success
            : true;

  const message =
    response?.message ||
    response?.mensaje ||
    response?.detail ||
    response?.data?.message ||
    response?.data?.mensaje ||
    response?.data?.detail ||
    "";

  const redirectTo =
    response?.redirectTo ||
    response?.redirect ||
    response?.data?.redirectTo ||
    response?.data?.redirect ||
    "";

  const retryAfter =
    Number(
      response?.retryAfter ??
      response?.cooldownSeconds ??
      response?.data?.retryAfter ??
      response?.data?.cooldownSeconds ??
      0
    ) || 0;

  const emailMasked =
    response?.emailMasked ||
    response?.maskedEmail ||
    response?.data?.emailMasked ||
    response?.data?.maskedEmail ||
    "";

  return {
    raw: response,
    ok: Boolean(ok),
    success: Boolean(ok),
    message: safeText(
      message,
      "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña."
    ),
    redirectTo: safeText(redirectTo, ""),
    retryAfter: Math.max(0, retryAfter),
    cooldownSeconds: Math.max(0, retryAfter),
    emailMasked: safeText(emailMasked, ""),
  };
}

/* =========================================================
   TRANSPORT
========================================================= */

async function requestWithAppCore(endpoint, body) {
  const requestFn =
    AppCore?.utils?.request ||
    AppCore?.request ||
    AppCore?.services?.http?.request ||
    null;

  if (typeof requestFn !== "function") {
    return null;
  }

  return requestFn(endpoint, {
    method: "POST",
    body,
    auth: false,
    timeout:
      Number(AUTH_CONSTANTS?.requestTimeout) ||
      Number(AppCore?.config?.requestTimeout) ||
      15000,
  });
}

async function requestWithFetch(endpoint, body) {
  const apiBase = safeText(AppCore?.config?.apiBase, "");
  const isAbsolute = /^https?:\/\//i.test(endpoint);
  const finalUrl = isAbsolute
    ? endpoint
    : `${apiBase}${endpoint}`;

  const response = await fetch(finalUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      safeText(
        data?.message ||
          data?.mensaje ||
          response.statusText,
        "No se pudo iniciar la recuperación de acceso."
      )
    );

    error.status = response.status;
    error.statusText = response.statusText;
    error.data = data;
    throw error;
  }

  return isObject(data)
    ? { ...data, ok: true }
    : { ok: true, data };
}

/* =========================================================
   ACTION
========================================================= */

export async function requestPasswordReset(payload = {}) {
  const normalizedPayload =
    normalizeResetPasswordPayload(payload);

  if (!normalizedPayload.identifier) {
    throw new Error(
      "No se recibió identificador para recuperación de acceso."
    );
  }

  const endpoint = getRequestPasswordResetEndpoint();
  const body = buildResetPasswordRequestBody(normalizedPayload);

  try {
    AppCore?.utils?.log?.(
      "[Auth] requestPasswordReset",
      {
        endpoint,
        identifier: normalizedPayload.identifier,
        mode: normalizedPayload.email ? "email" : "username",
      }
    );
  } catch {}

  let rawResponse = null;

  try {
    rawResponse = await requestWithAppCore(endpoint, body);

    if (rawResponse === null || rawResponse === undefined) {
      rawResponse = await requestWithFetch(endpoint, body);
    }
  } catch (error) {
    /*
      Propagamos el error intacto para que reset-password.helpers.js
      pueda resolver el mensaje correctamente.
    */
    throw error;
  }

  return normalizeResetPasswordResponse(rawResponse);
}

/* =========================================================
   ALIASES
========================================================= */

export async function resetPasswordRequest(payload = {}) {
  return requestPasswordReset(payload);
}

export async function forgotPassword(payload = {}) {
  return requestPasswordReset(payload);
}

export default requestPasswordReset;

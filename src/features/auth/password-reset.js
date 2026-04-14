/* =========================================================
   Onion SPA - Password Reset
   Archivo: src/features/auth/password-reset.js

   Responsabilidades:
   - resolver identificador de recuperación
   - normalizar payload de reset-password-request
   - construir body de request alineado con backend real
   - ejecutar petición de recuperación de acceso
   - normalizar la respuesta del backend
   - tolerar AppCore.request o fetch nativo
   - endurecer validaciones y resolución de endpoint
   - soportar cooldown / rate limit correctamente
   - no asumir success por defecto
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
  getRequestPasswordResetEndpoint as getRequestPasswordResetEndpointFromConstants,
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

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

function getResetIdentifierMaxLength() {
  return Number(
    AUTH_CONSTANTS?.resetIdentifierMaxLength ??
    AUTH_CONSTANTS?.identifierMaxLength ??
    160
  ) || 160;
}

function getRequestTimeout() {
  return Number(
    AUTH_CONSTANTS?.requestTimeout ??
    AppCore?.config?.requestTimeout ??
    15000
  ) || 15000;
}

function getDefaultSuccessMessage() {
  return "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña.";
}

function getDefaultErrorMessage() {
  return "No se pudo iniciar la recuperación de acceso.";
}

/* =========================================================
   ENDPOINT RESOLUTION
========================================================= */

function getConfiguredEndpoint() {
  const candidates = [
    typeof getRequestPasswordResetEndpointFromConstants === "function"
      ? getRequestPasswordResetEndpointFromConstants()
      : "",
    AUTH_ENDPOINTS?.resetPasswordRequest,
    AUTH_ENDPOINTS?.requestPasswordReset,
    "/api/auth/reset-password-request",
  ];

  for (const candidate of candidates) {
    const value = safeText(candidate, "");
    if (value) {
      return value;
    }
  }

  return "/api/auth/reset-password-request";
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

  const email = looksLikeEmail(identifier)
    ? identifier.toLowerCase()
    : "";

  const username = email
    ? ""
    : identifier;

  return {
    identifier,
    email,
    username,
    redirect: safeText(payload?.redirect, ""),
  };
}

/* =========================================================
   REQUEST BODY
========================================================= */

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized =
    normalizeResetPasswordPayload(payload);

  const body = {
    identifier: normalized.identifier,
  };

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
  const explicitOk =
    typeof response?.ok === "boolean"
      ? response.ok
      : typeof response?.success === "boolean"
        ? response.success
        : typeof response?.data?.ok === "boolean"
          ? response.data.ok
          : typeof response?.data?.success === "boolean"
            ? response.data.success
            : null;

  const retryAfter =
    Number(
      response?.retryAfter ??
      response?.cooldownSeconds ??
      response?.data?.retryAfter ??
      response?.data?.cooldownSeconds ??
      0
    ) || 0;

  const status =
    Number(
      response?.status ??
      response?.statusCode ??
      response?.data?.status ??
      0
    ) || 0;

  const isCooldown =
    status === 429 ||
    retryAfter > 0;

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    safeText(
      response?.message ||
      response?.mensaje ||
      response?.detail ||
      response?.error ||
      response?.data?.message ||
      response?.data?.mensaje ||
      response?.data?.detail ||
      response?.data?.error ||
      "",
      ok
        ? getDefaultSuccessMessage()
        : isCooldown
          ? "Espera 1 minuto antes de volver a intentarlo."
          : getDefaultErrorMessage()
    );

  const redirectTo =
    response?.redirectTo ||
    response?.redirect ||
    response?.data?.redirectTo ||
    response?.data?.redirect ||
    "";

  const emailMasked =
    response?.emailMasked ||
    response?.maskedEmail ||
    response?.data?.emailMasked ||
    response?.data?.maskedEmail ||
    "";

  return {
    raw: response,
    ok,
    success: ok,
    error: !ok,
    cooldown: isCooldown,
    retryAfter: Math.max(0, retryAfter),
    cooldownSeconds: Math.max(0, retryAfter),
    status,
    message,
    redirectTo: safeText(redirectTo, ""),
    emailMasked: safeText(emailMasked, ""),
  };
}

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const cleanEndpoint = safeText(endpoint, "");

  if (!cleanEndpoint) {
    return "/api/auth/reset-password-request";
  }

  if (isAbsoluteUrl(cleanEndpoint)) {
    return cleanEndpoint;
  }

  const apiBase = safeText(
    AppCore?.config?.apiBase,
    ""
  );

  if (!apiBase) {
    return cleanEndpoint;
  }

  const left = apiBase.replace(/\/+$/, "");
  const right = cleanEndpoint.startsWith("/")
    ? cleanEndpoint
    : `/${cleanEndpoint}`;

  return `${left}${right}`;
}

/* =========================================================
   TRANSPORT APPCORE
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
    timeout: getRequestTimeout(),
  });
}

/* =========================================================
   TRANSPORT FETCH
========================================================= */

async function requestWithFetch(endpoint, body) {
  const finalUrl =
    buildFinalUrl(endpoint);

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
        data?.error ||
        response.statusText,
        getDefaultErrorMessage()
      )
    );

    error.status = response.status;
    error.statusText = response.statusText;
    error.data = data;

    error.retryAfter = Number(
      data?.retryAfter ??
      data?.cooldownSeconds ??
      0
    ) || 0;

    error.cooldown =
      response.status === 429 ||
      error.retryAfter > 0;

    throw error;
  }

  return isObject(data)
    ? {
        ...data,
        ok:
          typeof data?.ok === "boolean"
            ? data.ok
            : true,
        status: response.status,
      }
    : {
        ok: true,
        status: response.status,
        data,
      };
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

  if (
    normalizedPayload.identifier.length >
    getResetIdentifierMaxLength()
  ) {
    throw new Error(
      "El identificador de recuperación es demasiado largo."
    );
  }

  const endpoint =
    getRequestPasswordResetEndpoint();

  const body =
    buildResetPasswordRequestBody(
      normalizedPayload
    );

  try {
    AppCore?.utils?.log?.(
      "[Auth] requestPasswordReset",
      {
        endpoint,
        finalUrl: buildFinalUrl(endpoint),
        identifier:
          normalizedPayload.identifier,
        mode:
          normalizedPayload.email
            ? "email"
            : "username",
      }
    );
  } catch {}

  let rawResponse = null;

  try {
    rawResponse =
      await requestWithAppCore(
        endpoint,
        body
      );

    if (
      rawResponse === null ||
      rawResponse === undefined
    ) {
      rawResponse =
        await requestWithFetch(
          endpoint,
          body
        );
    }

    return normalizeResetPasswordResponse(
      rawResponse
    );
  } catch (error) {
    return normalizeResetPasswordResponse({
      ok: false,
      status: error?.status || 0,
      retryAfter:
        error?.retryAfter || 0,
      cooldown:
        error?.cooldown || false,
      message:
        error?.message ||
        getDefaultErrorMessage(),
      data: error?.data || null,
    });
  }
}

/* =========================================================
   ALIASES
========================================================= */

export async function resetPasswordRequest(
  payload = {}
) {
  return requestPasswordReset(payload);
}

export async function forgotPassword(
  payload = {}
) {
  return requestPasswordReset(payload);
}

export default requestPasswordReset;

/* =========================================================
   Onion SPA - Password Reset
   Archivo: src/features/auth/password-reset.js

   Responsabilidades:
   - resolver identificador de recuperación
   - normalizar payload de reset-password-request
   - construir body robusto compatible con backends legacy
   - ejecutar petición recovery vía AppCore o fetch
   - normalizar respuestas y errores
   - soportar cooldown / rate-limit sin romper UX
   - nunca asumir success por defecto
   - endurecer urls / timeout / payload
   - api pública estable para Auth module
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

function isFunction(value) {
  return typeof value === "function";
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function looksLikeEmail(value = "") {
  return safeText(value, "").includes("@");
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getResetIdentifierMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetIdentifierMaxLength ??
    AUTH_CONSTANTS?.identifierMaxLength ??
    160,
    160
  );
}

function getRequestTimeout() {
  return safeNumber(
    AUTH_CONSTANTS?.requestTimeout ??
    AppCore?.config?.requestTimeout ??
    15000,
    15000
  );
}

function getDefaultSuccessMessage() {
  return "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña.";
}

function getDefaultErrorMessage() {
  return "No se pudo iniciar la recuperación de acceso.";
}

/* =========================================================
   ENDPOINT
========================================================= */

function getConfiguredEndpoint() {
  const candidates = [
    isFunction(getRequestPasswordResetEndpointFromConstants)
      ? getRequestPasswordResetEndpointFromConstants()
      : "",

    AUTH_ENDPOINTS?.resetPasswordRequest,
    AUTH_ENDPOINTS?.requestPasswordReset,
    AUTH_ENDPOINTS?.forgotPassword,

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
    payload?.identifier ??
    payload?.email ??
    payload?.username ??
    payload?.user ??
    "",
    ""
  );
}

export function normalizeResetPasswordPayload(payload = {}) {
  const identifier =
    resolveResetPasswordIdentifier(payload)
      .slice(0, getResetIdentifierMaxLength());

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

function resolveExplicitOk(response = {}) {
  const values = [
    response?.ok,
    response?.success,
    response?.data?.ok,
    response?.data?.success,
  ];

  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function resolveRetryAfter(response = {}) {
  return Math.max(
    0,
    safeNumber(
      response?.retryAfter ??
      response?.cooldownSeconds ??
      response?.data?.retryAfter ??
      response?.data?.cooldownSeconds ??
      0,
      0
    )
  );
}

function resolveStatus(response = {}) {
  return safeNumber(
    response?.status ??
    response?.statusCode ??
    response?.data?.status ??
    0,
    0
  );
}

function resolveMessage(response = {}, ok = false, cooldown = false) {
  const raw =
    response?.message ??
    response?.mensaje ??
    response?.detail ??
    response?.error ??
    response?.data?.message ??
    response?.data?.mensaje ??
    response?.data?.detail ??
    response?.data?.error ??
    "";

  const message = safeText(raw, "");

  if (message) {
    return message;
  }

  if (ok) {
    return getDefaultSuccessMessage();
  }

  if (cooldown) {
    return "Espera un momento antes de volver a intentarlo.";
  }

  return getDefaultErrorMessage();
}

export function normalizeResetPasswordResponse(response = {}) {
  const explicitOk =
    resolveExplicitOk(response);

  const status =
    resolveStatus(response);

  const retryAfter =
    resolveRetryAfter(response);

  const cooldown =
    status === 429 ||
    retryAfter > 0 ||
    response?.cooldown === true;

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const redirectTo = safeText(
    response?.redirectTo ??
    response?.redirect ??
    response?.data?.redirectTo ??
    response?.data?.redirect ??
    "",
    ""
  );

  const emailMasked = safeText(
    response?.emailMasked ??
    response?.maskedEmail ??
    response?.data?.emailMasked ??
    response?.data?.maskedEmail ??
    "",
    ""
  );

  const message =
    resolveMessage(
      response,
      ok,
      cooldown
    );

  return {
    raw: response,

    ok,
    success: ok,
    error: !ok,

    status,

    cooldown,
    retryAfter,
    cooldownSeconds: retryAfter,

    message,
    redirectTo,
    emailMasked,
  };
}

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const clean =
    safeText(endpoint, "");

  if (!clean) {
    return "/api/auth/reset-password-request";
  }

  if (isAbsoluteUrl(clean)) {
    return clean;
  }

  const apiBase =
    safeText(
      AppCore?.config?.apiBase,
      ""
    );

  if (!apiBase) {
    return clean;
  }

  const left =
    apiBase.replace(/\/+$/, "");

  const right =
    clean.startsWith("/")
      ? clean
      : `/${clean}`;

  return `${left}${right}`;
}

/* =========================================================
   TRANSPORT APPCORE
========================================================= */

async function requestWithAppCore(endpoint, body) {
  const requestFn =
    AppCore?.utils?.request ??
    AppCore?.request ??
    AppCore?.services?.http?.request ??
    null;

  if (!isFunction(requestFn)) {
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
  const url =
    buildFinalUrl(endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  const payload =
    isObject(data)
      ? data
      : {};

  if (!response.ok) {
    const error = new Error(
      safeText(
        payload?.message ??
        payload?.mensaje ??
        payload?.error ??
        response.statusText,
        getDefaultErrorMessage()
      )
    );

    error.status = response.status;
    error.statusText = response.statusText;
    error.retryAfter = resolveRetryAfter(payload);
    error.cooldown =
      response.status === 429 ||
      error.retryAfter > 0;
    error.data = payload;

    throw error;
  }

  return {
    ...payload,
    ok:
      typeof payload?.ok === "boolean"
        ? payload.ok
        : true,
    status: response.status,
  };
}

/* =========================================================
   ACTION
========================================================= */

export async function requestPasswordReset(payload = {}) {
  const normalized =
    normalizeResetPasswordPayload(payload);

  if (!normalized.identifier) {
    return normalizeResetPasswordResponse({
      ok: false,
      message:
        "No se recibió identificador para recuperación de acceso.",
    });
  }

  if (
    normalized.identifier.length >
    getResetIdentifierMaxLength()
  ) {
    return normalizeResetPasswordResponse({
      ok: false,
      message:
        "El identificador de recuperación es demasiado largo.",
    });
  }

  const endpoint =
    getRequestPasswordResetEndpoint();

  const body =
    buildResetPasswordRequestBody(
      normalized
    );

  try {
    AppCore?.utils?.log?.(
      "[Auth] requestPasswordReset",
      {
        endpoint,
        finalUrl:
          buildFinalUrl(endpoint),
        identifier:
          normalized.identifier,
        mode:
          normalized.email
            ? "email"
            : "username",
      }
    );
  } catch {}

  try {
    let raw =
      await requestWithAppCore(
        endpoint,
        body
      );

    if (
      raw === null ||
      raw === undefined
    ) {
      raw =
        await requestWithFetch(
          endpoint,
          body
        );
    }

    return normalizeResetPasswordResponse(raw);
  } catch (error) {
    return normalizeResetPasswordResponse({
      ok: false,
      status:
        error?.status || 0,
      retryAfter:
        error?.retryAfter || 0,
      cooldown:
        error?.cooldown || false,
      message:
        error?.message ||
        getDefaultErrorMessage(),
      data:
        error?.data || null,
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

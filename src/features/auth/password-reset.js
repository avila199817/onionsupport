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
   - soportar confirmación de nueva contraseña
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
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function looksLikeEmail(value = "") {
  return safeText(value).includes("@");
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

function getResetTokenMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetTokenMaxLength ??
      AUTH_CONSTANTS?.tokenMaxLength ??
      2048,
    2048
  );
}

function getResetPasswordMinLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetPasswordMinLength ??
      AUTH_CONSTANTS?.passwordMinLength ??
      6,
    6
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

function getDefaultConfirmSuccessMessage() {
  return "La contraseña se ha actualizado correctamente.";
}

function getDefaultConfirmErrorMessage() {
  return "No se pudo restablecer la contraseña.";
}

/* =========================================================
   ENDPOINTS
========================================================= */

function getConfiguredRequestEndpoint() {
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
    const value = safeText(candidate);
    if (value) return value;
  }

  return "/api/auth/reset-password-request";
}

function getConfiguredConfirmEndpoint() {
  const candidates = [
    AUTH_ENDPOINTS?.confirmResetPassword,
    AUTH_ENDPOINTS?.resetPasswordConfirm,
    AUTH_ENDPOINTS?.resetPasswordUpdate,
    AUTH_ENDPOINTS?.resetPasswordFinalize,
    "/api/auth/reset-password-confirm",
  ];

  for (const candidate of candidates) {
    const value = safeText(candidate);
    if (value) return value;
  }

  return "/api/auth/reset-password-confirm";
}

export function getRequestPasswordResetEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getConfirmResetPasswordEndpoint() {
  return getConfiguredConfirmEndpoint();
}

/* =========================================================
   IDENTIFIER / TOKEN
========================================================= */

export function resolveResetPasswordIdentifier(payload = {}) {
  return safeText(
    payload?.identifier ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      ""
  );
}

export function resolveResetPasswordToken(payload = {}) {
  return safeText(
    payload?.token ??
      payload?.code ??
      payload?.resetToken ??
      payload?.reset_code ??
      ""
  ).slice(0, getResetTokenMaxLength());
}

export function normalizeResetPasswordPayload(payload = {}) {
  const identifier =
    resolveResetPasswordIdentifier(payload).slice(
      0,
      getResetIdentifierMaxLength()
    );

  const email = looksLikeEmail(identifier)
    ? identifier.toLowerCase()
    : "";

  const username = email ? "" : identifier;

  return {
    identifier,
    email,
    username,
    redirect: safeText(payload?.redirect),
  };
}

export function normalizeConfirmResetPasswordPayload(payload = {}) {
  const token = resolveResetPasswordToken(payload);

  const password = String(
    payload?.password ??
      payload?.newPassword ??
      ""
  );

  const confirmPassword = String(
    payload?.confirmPassword ??
      payload?.passwordConfirmation ??
      payload?.repeatPassword ??
      ""
  );

  return {
    token,
    password,
    confirmPassword,
    redirect: safeText(payload?.redirect),
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

export function buildConfirmResetPasswordBody(payload = {}) {
  const normalized =
    normalizeConfirmResetPasswordPayload(payload);

  return {
    token: normalized.token,
    code: normalized.token,
    resetToken: normalized.token,

    password: normalized.password,
    newPassword: normalized.password,

    confirmPassword:
      normalized.confirmPassword,

    passwordConfirmation:
      normalized.confirmPassword,

    redirect: normalized.redirect,
  };
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
        0
    )
  );
}

function resolveStatus(response = {}) {
  return safeNumber(
    response?.status ??
      response?.statusCode ??
      response?.data?.status ??
      0
  );
}

export function normalizeResetPasswordResponse(
  response = {}
) {
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

  const message =
    safeText(
      response?.message ??
        response?.mensaje ??
        response?.detail ??
        response?.error,
      ok
        ? getDefaultSuccessMessage()
        : cooldown
          ? "Espera un momento antes de volver a intentarlo."
          : getDefaultErrorMessage()
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
    redirectTo: safeText(
      response?.redirectTo ??
        response?.redirect
    ),
    emailMasked: safeText(
      response?.emailMasked ??
        response?.maskedEmail
    ),
  };
}

export function normalizeConfirmResetPasswordResponse(
  response = {}
) {
  const explicitOk =
    resolveExplicitOk(response);

  const status =
    resolveStatus(response);

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    safeText(
      response?.message ??
        response?.mensaje ??
        response?.detail ??
        response?.error,
      ok
        ? getDefaultConfirmSuccessMessage()
        : getDefaultConfirmErrorMessage()
    );

  return {
    raw: response,
    ok,
    success: ok,
    error: !ok,
    status,
    message,
    redirectTo: safeText(
      response?.redirectTo ??
        response?.redirect,
      "/login"
    ),
  };
}

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const clean = safeText(endpoint);

  if (!clean) {
    return "/api/auth/reset-password-request";
  }

  if (isAbsoluteUrl(clean)) {
    return clean;
  }

  const apiBase = safeText(
    AppCore?.config?.apiBase
  );

  if (!apiBase) {
    return clean;
  }

  return (
    apiBase.replace(/\/+$/, "") +
    (clean.startsWith("/")
      ? clean
      : `/${clean}`)
  );
}

/* =========================================================
   TRANSPORTS
========================================================= */

async function requestWithAppCore(
  endpoint,
  body
) {
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

async function requestWithFetch(
  endpoint,
  body
) {
  const url = buildFinalUrl(endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/json",
      Accept:
        "application/json",
    },
    body: JSON.stringify(body),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {}

  const payload =
    isObject(data) ? data : {};

  if (!response.ok) {
    const error = new Error(
      safeText(
        payload?.message ??
          payload?.error ??
          response.statusText,
        getDefaultErrorMessage()
      )
    );

    error.status = response.status;
    error.data = payload;
    error.retryAfter =
      resolveRetryAfter(payload);

    throw error;
  }

  return {
    ...payload,
    ok:
      typeof payload?.ok ===
      "boolean"
        ? payload.ok
        : true,
    status: response.status,
  };
}

/* =========================================================
   ACTIONS
========================================================= */

export async function requestPasswordReset(
  payload = {}
) {
  const normalized =
    normalizeResetPasswordPayload(
      payload
    );

  if (!normalized.identifier) {
    return normalizeResetPasswordResponse({
      ok: false,
      message:
        "No se recibió identificador para recuperación de acceso.",
    });
  }

  const endpoint =
    getRequestPasswordResetEndpoint();

  const body =
    buildResetPasswordRequestBody(
      normalized
    );

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

    return normalizeResetPasswordResponse(
      raw
    );
  } catch (error) {
    return normalizeResetPasswordResponse({
      ok: false,
      status:
        error?.status || 0,
      retryAfter:
        error?.retryAfter || 0,
      message:
        error?.message ||
        getDefaultErrorMessage(),
      data:
        error?.data || null,
    });
  }
}

export async function confirmResetPassword(
  payload = {}
) {
  const normalized =
    normalizeConfirmResetPasswordPayload(
      payload
    );

  if (!normalized.token) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        "No se recibió token de recuperación.",
    });
  }

  if (
    normalized.password !==
    normalized.confirmPassword
  ) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        "Las contraseñas no coinciden.",
    });
  }

  const endpoint =
    getConfirmResetPasswordEndpoint();

  const body =
    buildConfirmResetPasswordBody(
      normalized
    );

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

    return normalizeConfirmResetPasswordResponse(
      raw
    );
  } catch (error) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      status:
        error?.status || 0,
      message:
        error?.message ||
        getDefaultConfirmErrorMessage(),
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

export async function resetPasswordConfirm(
  payload = {}
) {
  return confirmResetPassword(payload);
}

export async function confirmPasswordReset(
  payload = {}
) {
  return confirmResetPassword(payload);
}

export default requestPasswordReset;

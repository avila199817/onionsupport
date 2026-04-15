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
    const value = safeText(candidate, "");

    if (value) {
      return value;
    }
  }

  return "/api/auth/reset-password-request";
}

function getConfiguredConfirmEndpoint() {
  const candidates = [
    AUTH_ENDPOINTS?.confirmResetPassword,
    AUTH_ENDPOINTS?.resetPasswordConfirm,
    AUTH_ENDPOINTS?.resetPasswordUpdate,
    AUTH_ENDPOINTS?.resetPasswordFinalize,
    "/api/auth/reset-password/confirm",
  ];

  for (const candidate of candidates) {
    const value = safeText(candidate, "");

    if (value) {
      return value;
    }
  }

  return "/api/auth/reset-password/confirm";
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
      "",
    ""
  );
}

export function resolveResetPasswordToken(payload = {}) {
  return safeText(
    payload?.token ??
      payload?.code ??
      payload?.resetToken ??
      payload?.reset_code ??
      "",
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
    redirect: safeText(payload?.redirect, ""),
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

  const redirect = safeText(payload?.redirect, "");

  return {
    token,
    password,
    confirmPassword,
    redirect,
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

  const body = {
    token: normalized.token,
    password: normalized.password,
    confirmPassword: normalized.confirmPassword,
  };

  if (normalized.redirect) {
    body.redirect = normalized.redirect;
  }

  body.code = normalized.token;
  body.resetToken = normalized.token;
  body.newPassword = normalized.password;
  body.passwordConfirmation = normalized.confirmPassword;

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

function resolveConfirmMessage(response = {}, ok = false) {
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
    return getDefaultConfirmSuccessMessage();
  }

  return getDefaultConfirmErrorMessage();
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

export function normalizeConfirmResetPasswordResponse(response = {}) {
  const explicitOk =
    resolveExplicitOk(response);

  const status =
    resolveStatus(response);

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const redirectTo = safeText(
    response?.redirectTo ??
      response?.redirect ??
      response?.data?.redirectTo ??
      response?.data?.redirect ??
      "/login",
    "/login"
  );

  const message =
    resolveConfirmMessage(
      response,
      ok
    );

  return {
    raw: response,

    ok,
    success: ok,
    error: !ok,

    status,
    message,
    redirectTo,
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
    isObject(data) ? data : {};

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
   ACTION: REQUEST
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
   ACTION: CONFIRM
========================================================= */

export async function confirmResetPassword(payload = {}) {
  const normalized =
    normalizeConfirmResetPasswordPayload(payload);

  if (!normalized.token) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        "No se recibió token de recuperación.",
    });
  }

  if (
    normalized.token.length >
    getResetTokenMaxLength()
  ) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        "El token de recuperación es demasiado largo.",
    });
  }

  if (!String(normalized.password || "").trim()) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        "Introduce una nueva contraseña.",
    });
  }

  if (
    String(normalized.password || "").length <
    getResetPasswordMinLength()
  ) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        `La contraseña debe tener al menos ${getResetPasswordMinLength()} caracteres.`,
    });
  }

  if (!String(normalized.confirmPassword || "").trim()) {
    return normalizeConfirmResetPasswordResponse({
      ok: false,
      message:
        "Repite la contraseña.",
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
    AppCore?.utils?.log?.(
      "[Auth] confirmResetPassword",
      {
        endpoint,
        finalUrl:
          buildFinalUrl(endpoint),
        hasToken: Boolean(
          normalized.token
        ),
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

    return normalizeConfirmResetPasswordResponse(raw);
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
      redirectTo:
        error?.data?.redirectTo ||
        error?.data?.redirect ||
        "/login",
    });
  }
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

export async function resetPasswordConfirm(payload = {}) {
  return confirmResetPassword(payload);
}

export async function confirmPasswordReset(payload = {}) {
  return confirmResetPassword(payload);
}

export default requestPasswordReset;

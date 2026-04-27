/* =========================================================
   Onion SPA - Password Reset
   Archivo: src/features/auth/password-reset.js

   RESPONSABILIDADES:
   - resolver identificador de recuperación
   - normalizar payload de reset-password-request
   - construir body robusto compatible con backends legacy
   - ejecutar petición recovery vía AppCore / Http / apiClient / fetch
   - normalizar respuestas y errores
   - soportar cooldown / rate-limit sin romper UX
   - nunca asumir success por defecto si backend no lo declara
   - endurecer urls / timeout / payload / redirects
   - soportar confirmación de nueva contraseña
   - api pública estable para Auth module

   HARDENING EXTREMO:
   - transporte compatible con AppCore.apiClient, AppCore.http, Http service y fetch
   - timeout real en fetch
   - redirects anti open-redirect
   - token/password/identifier con límites
   - respuestas nested: data / payload / result / body / response.data
   - rate-limit: 429 / retryAfter / cooldownSeconds
   - errores normalizados sin throws hacia la UI pública
   - confirm password estricto
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_CONSTANTS,
  getRequestPasswordResetEndpoint as getRequestPasswordResetEndpointFromConstants,
  getConfirmPasswordResetEndpoint as getConfirmPasswordResetEndpointFromConstants,
} from "./constants.js";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

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

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(
    String(value || "")
  );
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    safeText(value)
  );
}

function normalizeEmail(value = "") {
  return safeText(value).toLowerCase();
}

function normalizeUsername(value = "") {
  return safeText(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function pickFirst(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  return safeText(
    pickFirst(...values),
    ""
  );
}

function getNode(response = {}) {
  const root =
    safeObject(response);

  const data =
    safeObject(root.data);

  const payload =
    safeObject(root.payload);

  const result =
    safeObject(root.result);

  const body =
    safeObject(root.body);

  const responseNode =
    safeObject(root.response);

  const responseData =
    safeObject(responseNode.data);

  return {
    root,
    data,
    payload,
    result,
    body,
    response:
      responseNode,
    responseData,
  };
}

function safeEmit(eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

/* =========================================================
   LIMITS
========================================================= */

function getResetIdentifierMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetIdentifierMaxLength ??
      AUTH_CONSTANTS?.identifierMaxLength ??
      160,
    160
  );
}

function getResetTokenMinLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetTokenMinLength ??
      AUTH_CONSTANTS?.tokenMinLength ??
      8,
    8
  );
}

function getResetTokenMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetTokenMaxLength ??
      AUTH_CONSTANTS?.tokenMaxLength ??
      4096,
    4096
  );
}

function getResetPasswordMinLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetPasswordMinLength ??
      AUTH_CONSTANTS?.passwordMinLength ??
      8,
    8
  );
}

function getResetPasswordMaxLength() {
  return safeNumber(
    AUTH_CONSTANTS?.resetPasswordMaxLength ??
      AUTH_CONSTANTS?.passwordMaxLength ??
      1024,
    1024
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

/* =========================================================
   DEFAULT MESSAGES
========================================================= */

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

function getRateLimitMessage() {
  return "Espera un momento antes de volver a intentarlo.";
}

/* =========================================================
   ENDPOINTS
========================================================= */

function getConfiguredRequestEndpoint() {
  const candidates = [
    isFunction(getRequestPasswordResetEndpointFromConstants)
      ? getRequestPasswordResetEndpointFromConstants()
      : "",
    AUTH_ENDPOINTS?.requestPasswordReset,
    AUTH_ENDPOINTS?.resetPasswordRequest,
    AUTH_ENDPOINTS?.forgotPassword,
    AUTH_ENDPOINTS?.recoverPassword,
    "/api/auth/reset-password-request",
  ];

  for (const candidate of candidates) {
    const value =
      safeText(candidate);

    if (value) {
      return value;
    }
  }

  return "/api/auth/reset-password-request";
}

function getConfiguredConfirmEndpoint() {
  const candidates = [
    isFunction(getConfirmPasswordResetEndpointFromConstants)
      ? getConfirmPasswordResetEndpointFromConstants()
      : "",
    AUTH_ENDPOINTS?.confirmResetPassword,
    AUTH_ENDPOINTS?.confirmPasswordReset,
    AUTH_ENDPOINTS?.resetPasswordConfirm,
    AUTH_ENDPOINTS?.passwordResetConfirm,
    AUTH_ENDPOINTS?.resetPasswordUpdate,
    AUTH_ENDPOINTS?.resetPasswordFinalize,
    "/api/auth/reset-password-confirm",
  ];

  for (const candidate of candidates) {
    const value =
      safeText(candidate);

    if (value) {
      return value;
    }
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
   REDIRECT SAFETY
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizeRelativePath(path = "") {
  let value =
    safeText(path, "");

  if (!value) {
    return "";
  }

  if (value.startsWith("//")) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "";
  }

  if (/[\r\n\t]/.test(value)) {
    return "";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  return value || "";
}

function sanitizeRedirect(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isAbsoluteUrl(raw)) {
    try {
      const parsed =
        new URL(raw);

      if (
        isBrowser() &&
        parsed.origin === window.location.origin
      ) {
        return normalizeRelativePath(
          `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
        );
      }

      return "";
    } catch {
      return "";
    }
  }

  return normalizeRelativePath(raw);
}

/* =========================================================
   IDENTIFIER / TOKEN / PASSWORD
========================================================= */

export function resolveResetPasswordIdentifier(payload = {}) {
  return safeText(
    payload?.identifier ??
      payload?.login ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      payload?.phone ??
      payload?.telefono ??
      ""
  );
}

export function resolveResetPasswordToken(payload = {}) {
  return safeText(
    payload?.token ??
      payload?.code ??
      payload?.resetToken ??
      payload?.reset_token ??
      payload?.reset_code ??
      payload?.passwordResetToken ??
      payload?.password_reset_token ??
      payload?.t ??
      ""
  ).slice(0, getResetTokenMaxLength());
}

export function normalizeResetPasswordPayload(payload = {}) {
  const identifier =
    resolveResetPasswordIdentifier(payload)
      .replace(/\s+/g, " ")
      .slice(0, getResetIdentifierMaxLength());

  const email =
    looksLikeEmail(identifier)
      ? normalizeEmail(identifier)
      : "";

  const username =
    email
      ? ""
      : normalizeUsername(identifier);

  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        ""
    );

  return {
    identifier,
    email,
    username,
    redirect,
  };
}

export function normalizeConfirmResetPasswordPayload(payload = {}) {
  const token =
    resolveResetPasswordToken(payload);

  const maxPassword =
    getResetPasswordMaxLength();

  const password =
    String(
      payload?.password ??
        payload?.newPassword ??
        payload?.new_password ??
        ""
    ).slice(0, maxPassword);

  const confirmPassword =
    String(
      payload?.confirmPassword ??
        payload?.passwordConfirmation ??
        payload?.password_confirmation ??
        payload?.repeatPassword ??
        payload?.repeat_password ??
        ""
    ).slice(0, maxPassword);

  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        ""
    );

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

function stripEmptyValues(obj = {}) {
  const output = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized =
    normalizeResetPasswordPayload(payload);

  return stripEmptyValues({
    identifier:
      normalized.identifier,

    email:
      normalized.email,

    username:
      normalized.username,

    user:
      normalized.username,

    login:
      normalized.identifier,

    redirect:
      normalized.redirect,

    redirectTo:
      normalized.redirect,
  });
}

export function buildConfirmResetPasswordBody(payload = {}) {
  const normalized =
    normalizeConfirmResetPasswordPayload(payload);

  return stripEmptyValues({
    token:
      normalized.token,

    code:
      normalized.token,

    resetToken:
      normalized.token,

    reset_token:
      normalized.token,

    passwordResetToken:
      normalized.token,

    password_reset_token:
      normalized.token,

    password:
      normalized.password,

    newPassword:
      normalized.password,

    new_password:
      normalized.password,

    confirmPassword:
      normalized.confirmPassword,

    passwordConfirmation:
      normalized.confirmPassword,

    password_confirmation:
      normalized.confirmPassword,

    redirect:
      normalized.redirect,

    redirectTo:
      normalized.redirect,
  });
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function resolveExplicitOk(response = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
  } = getNode(response);

  const values = [
    root.ok,
    root.success,
    root.valid,
    root.accepted,

    data.ok,
    data.success,
    data.valid,
    data.accepted,

    payload.ok,
    payload.success,
    payload.valid,
    payload.accepted,

    result.ok,
    result.success,
    result.valid,
    result.accepted,

    body.ok,
    body.success,
    body.valid,
    body.accepted,

    responseData.ok,
    responseData.success,
    responseData.valid,
    responseData.accepted,
  ];

  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function resolveStatus(response = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    response: responseNode,
    responseData,
  } = getNode(response);

  return safeNumber(
    pickFirst(
      root.status,
      root.statusCode,
      root.status_code,

      data.status,
      data.statusCode,
      data.status_code,

      payload.status,
      payload.statusCode,
      payload.status_code,

      result.status,
      result.statusCode,
      result.status_code,

      body.status,
      body.statusCode,
      body.status_code,

      responseNode.status,
      responseNode.statusCode,
      responseNode.status_code,

      responseData.status,
      responseData.statusCode,
      responseData.status_code
    ),
    0
  );
}

function resolveRetryAfter(response = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
  } = getNode(response);

  return Math.max(
    0,
    safeNumber(
      pickFirst(
        root.retryAfter,
        root.retry_after,
        root.cooldownSeconds,
        root.cooldown_seconds,

        data.retryAfter,
        data.retry_after,
        data.cooldownSeconds,
        data.cooldown_seconds,

        payload.retryAfter,
        payload.retry_after,
        payload.cooldownSeconds,
        payload.cooldown_seconds,

        result.retryAfter,
        result.retry_after,
        result.cooldownSeconds,
        result.cooldown_seconds,

        body.retryAfter,
        body.retry_after,
        body.cooldownSeconds,
        body.cooldown_seconds,

        responseData.retryAfter,
        responseData.retry_after,
        responseData.cooldownSeconds,
        responseData.cooldown_seconds
      ),
      0
    )
  );
}

function resolveMessage(response = {}, fallback = "") {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
  } = getNode(response);

  return pickFirstText(
    root.message,
    root.mensaje,
    root.detail,
    root.error,

    data.message,
    data.mensaje,
    data.detail,
    data.error,

    payload.message,
    payload.mensaje,
    payload.detail,
    payload.error,

    result.message,
    result.mensaje,
    result.detail,
    result.error,

    body.message,
    body.mensaje,
    body.detail,
    body.error,

    responseData.message,
    responseData.mensaje,
    responseData.detail,
    responseData.error,

    fallback
  );
}

function resolveRedirectTo(response = {}, fallback = "") {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
  } = getNode(response);

  return sanitizeRedirect(
    pickFirstText(
      root.redirectTo,
      root.redirect_to,
      root.redirect,

      data.redirectTo,
      data.redirect_to,
      data.redirect,

      payload.redirectTo,
      payload.redirect_to,
      payload.redirect,

      result.redirectTo,
      result.redirect_to,
      result.redirect,

      body.redirectTo,
      body.redirect_to,
      body.redirect,

      responseData.redirectTo,
      responseData.redirect_to,
      responseData.redirect,

      fallback
    )
  );
}

function resolveEmailMasked(response = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
  } = getNode(response);

  return pickFirstText(
    root.emailMasked,
    root.maskedEmail,
    root.masked_email,

    data.emailMasked,
    data.maskedEmail,
    data.masked_email,

    payload.emailMasked,
    payload.maskedEmail,
    payload.masked_email,

    result.emailMasked,
    result.maskedEmail,
    result.masked_email,

    body.emailMasked,
    body.maskedEmail,
    body.masked_email,

    responseData.emailMasked,
    responseData.maskedEmail,
    responseData.masked_email
  );
}

function isCooldownResponse(response = {}) {
  const status =
    resolveStatus(response);

  const retryAfter =
    resolveRetryAfter(response);

  const {
    root,
    data,
    payload,
    result,
    body,
    responseData,
  } = getNode(response);

  return Boolean(
    status === 429 ||
      retryAfter > 0 ||
      root.cooldown === true ||
      data.cooldown === true ||
      payload.cooldown === true ||
      result.cooldown === true ||
      body.cooldown === true ||
      responseData.cooldown === true
  );
}

export function normalizeResetPasswordResponse(response = {}) {
  const explicitOk =
    resolveExplicitOk(response);

  const status =
    resolveStatus(response);

  const retryAfter =
    resolveRetryAfter(response);

  const cooldown =
    isCooldownResponse(response);

  /*
    Regla estricta:
    No asumimos éxito por status 200 si el backend no declara ok/success true.
  */
  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    resolveMessage(
      response,
      ok
        ? getDefaultSuccessMessage()
        : cooldown
          ? getRateLimitMessage()
          : getDefaultErrorMessage()
    );

  return {
    raw:
      response,

    ok,
    success:
      ok,
    error:
      !ok,

    status,
    cooldown,
    rateLimited:
      cooldown,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    message,

    redirectTo:
      resolveRedirectTo(response, ""),

    emailMasked:
      resolveEmailMasked(response),
  };
}

export function normalizeConfirmResetPasswordResponse(response = {}) {
  const explicitOk =
    resolveExplicitOk(response);

  const status =
    resolveStatus(response);

  const retryAfter =
    resolveRetryAfter(response);

  const cooldown =
    isCooldownResponse(response);

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    resolveMessage(
      response,
      ok
        ? getDefaultConfirmSuccessMessage()
        : cooldown
          ? getRateLimitMessage()
          : getDefaultConfirmErrorMessage()
    );

  return {
    raw:
      response,

    ok,
    success:
      ok,
    error:
      !ok,

    status,
    cooldown,
    rateLimited:
      cooldown,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    message,

    redirectTo:
      resolveRedirectTo(response, "/login") || "/login",
  };
}

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const clean =
    safeText(endpoint);

  if (!clean) {
    return "/api/auth/reset-password-request";
  }

  if (isAbsoluteUrl(clean)) {
    return clean;
  }

  const apiBase =
    safeText(AppCore?.config?.apiBase);

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
   ERROR NORMALIZATION
========================================================= */

function normalizeTransportError(error = null, fallbackMessage = getDefaultErrorMessage()) {
  const status =
    safeNumber(
      error?.status ??
        error?.response?.status ??
        error?.data?.status ??
        0,
      0
    );

  const retryAfter =
    Math.max(
      0,
      safeNumber(
        error?.retryAfter ??
          error?.retry_after ??
          error?.data?.retryAfter ??
          error?.data?.retry_after ??
          error?.data?.cooldownSeconds ??
          0,
        0
      )
    );

  return {
    ok:
      false,
    success:
      false,
    error:
      true,

    status,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    cooldown:
      status === 429 || retryAfter > 0,

    message:
      safeText(
        error?.data?.message ??
          error?.data?.mensaje ??
          error?.data?.error ??
          error?.message,
        status === 429 || retryAfter > 0
          ? getRateLimitMessage()
          : fallbackMessage
      ),

    data:
      error?.data || null,

    raw:
      error || null,
  };
}

/* =========================================================
   FETCH WITH TIMEOUT
========================================================= */

async function fetchJsonWithTimeout(url, body, timeoutMs = getRequestTimeout()) {
  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  const timer =
    controller
      ? setTimeout(() => {
          try {
            controller.abort("password-reset-timeout");
          } catch {
            controller.abort();
          }
        }, timeoutMs)
      : null;

  try {
    const response =
      await fetch(url, {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
        },
        credentials:
          "omit",
        body:
          JSON.stringify(body),
        signal:
          controller?.signal,
      });

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      data = null;
    }

    const payload =
      isObject(data)
        ? data
        : {};

    if (!response.ok) {
      const error =
        new Error(
          resolveMessage(
            payload,
            response.statusText || getDefaultErrorMessage()
          )
        );

      error.status =
        response.status;
      error.statusText =
        response.statusText;
      error.data =
        payload;
      error.retryAfter =
        resolveRetryAfter(payload);

      throw error;
    }

    return {
      ...payload,
      status:
        payload.status ??
        response.status,
      statusCode:
        payload.statusCode ??
        response.status,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/* =========================================================
   TRANSPORTS
========================================================= */

async function requestWithApiClient(endpoint, body, options = {}) {
  const apiClient =
    AppCore?.apiClient;

  if (!apiClient) {
    return null;
  }

  if (isFunction(apiClient.post)) {
    return apiClient.post(
      endpoint,
      body,
      {
        auth:
          false,
        public:
          true,
        timeout:
          getRequestTimeout(),
        silent:
          true,
        storeError:
          false,
        ...options,
      }
    );
  }

  if (isFunction(apiClient.request)) {
    return apiClient.request(
      endpoint,
      {
        method:
          "POST",
        body,
        auth:
          false,
        public:
          true,
        timeout:
          getRequestTimeout(),
        silent:
          true,
        storeError:
          false,
        ...options,
      }
    );
  }

  return null;
}

async function requestWithHttpService(endpoint, body, options = {}) {
  const http =
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    null;

  if (!http) {
    return null;
  }

  if (isFunction(http.post)) {
    return http.post(
      endpoint,
      body,
      {
        auth:
          false,
        public:
          true,
        useLoader:
          options.useLoader !== false,
        timeout:
          getRequestTimeout(),
        _skipAuthRefresh:
          true,
        ...options,
      }
    );
  }

  /*
    Http.request del servicio Onion suele ser:
      request(method, path, options)
  */
  if (isFunction(http.request)) {
    return http.request(
      "POST",
      endpoint,
      {
        body,
        auth:
          false,
        public:
          true,
        useLoader:
          options.useLoader !== false,
        timeout:
          getRequestTimeout(),
        _skipAuthRefresh:
          true,
        ...options,
      }
    );
  }

  return null;
}

async function requestWithAppCoreRequest(endpoint, body, options = {}) {
  if (!isFunction(AppCore?.request)) {
    return null;
  }

  /*
    AppCore.request/core request suele ser:
      request(path, options)
  */
  return AppCore.request(
    endpoint,
    {
      method:
        "POST",
      body,
      auth:
        false,
      public:
        true,
      timeout:
        getRequestTimeout(),
      silent:
        true,
      storeError:
        false,
      ...options,
    }
  );
}

async function requestWithFetch(endpoint, body) {
  const url =
    buildFinalUrl(endpoint);

  return fetchJsonWithTimeout(
    url,
    body,
    getRequestTimeout()
  );
}

async function executePasswordResetRequest(endpoint, body, options = {}) {
  const transports = [
    requestWithHttpService,
    requestWithApiClient,
    requestWithAppCoreRequest,
  ];

  for (const transport of transports) {
    try {
      const result =
        await transport(
          endpoint,
          body,
          options
        );

      if (
        result !== null &&
        result !== undefined
      ) {
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  return requestWithFetch(
    endpoint,
    body
  );
}

/* =========================================================
   VALIDATION
========================================================= */

function validateRequestPayload(normalized = {}) {
  if (!normalized.identifier) {
    return "No se recibió identificador para recuperación de acceso.";
  }

  if (
    normalized.identifier.length >
    getResetIdentifierMaxLength()
  ) {
    return "El identificador es demasiado largo.";
  }

  return "";
}

function validateConfirmPayload(normalized = {}) {
  if (!normalized.token) {
    return "No se recibió token de recuperación.";
  }

  if (
    normalized.token.length <
    getResetTokenMinLength()
  ) {
    return "El token de recuperación no es válido.";
  }

  if (!normalized.password) {
    return "La nueva contraseña es obligatoria.";
  }

  if (
    normalized.password.length <
    getResetPasswordMinLength()
  ) {
    return `La contraseña debe tener al menos ${getResetPasswordMinLength()} caracteres.`;
  }

  if (
    normalized.password.length >
    getResetPasswordMaxLength()
  ) {
    return "La contraseña es demasiado larga.";
  }

  if (
    normalized.password !==
    normalized.confirmPassword
  ) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

/* =========================================================
   ACTIONS
========================================================= */

export async function requestPasswordReset(payload = {}, options = {}) {
  const normalized =
    normalizeResetPasswordPayload(payload);

  const validationError =
    validateRequestPayload(normalized);

  if (validationError) {
    return normalizeResetPasswordResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoint =
    getRequestPasswordResetEndpoint();

  const body =
    buildResetPasswordRequestBody(normalized);

  safeEmit(
    "auth:password-reset:request:start",
    {
      endpoint,
      identifierType:
        normalized.email
          ? "email"
          : normalized.username
            ? "username"
            : "identifier",
    }
  );

  try {
    const raw =
      await executePasswordResetRequest(
        endpoint,
        body,
        {
          ...safeObject(options),
          _skipAuthRefresh:
            true,
          auth:
            false,
          public:
            true,
        }
      );

    const normalizedResponse =
      normalizeResetPasswordResponse(raw);

    safeEmit(
      "auth:password-reset:request:complete",
      {
        ok:
          normalizedResponse.ok,
        status:
          normalizedResponse.status,
        cooldown:
          normalizedResponse.cooldown,
        retryAfter:
          normalizedResponse.retryAfter,
      }
    );

    return normalizedResponse;
  } catch (error) {
    const normalizedError =
      normalizeTransportError(
        error,
        getDefaultErrorMessage()
      );

    safeEmit(
      "auth:password-reset:request:error",
      {
        status:
          normalizedError.status,
        cooldown:
          normalizedError.cooldown,
        retryAfter:
          normalizedError.retryAfter,
        message:
          normalizedError.message,
      }
    );

    return normalizeResetPasswordResponse(normalizedError);
  }
}

export async function confirmResetPassword(payload = {}, options = {}) {
  const normalized =
    normalizeConfirmResetPasswordPayload(payload);

  const validationError =
    validateConfirmPayload(normalized);

  if (validationError) {
    return normalizeConfirmResetPasswordResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoint =
    getConfirmResetPasswordEndpoint();

  const body =
    buildConfirmResetPasswordBody(normalized);

  safeEmit(
    "auth:password-reset:confirm:start",
    {
      endpoint,
    }
  );

  try {
    const raw =
      await executePasswordResetRequest(
        endpoint,
        body,
        {
          ...safeObject(options),
          _skipAuthRefresh:
            true,
          auth:
            false,
          public:
            true,
        }
      );

    const normalizedResponse =
      normalizeConfirmResetPasswordResponse(raw);

    safeEmit(
      "auth:password-reset:confirm:complete",
      {
        ok:
          normalizedResponse.ok,
        status:
          normalizedResponse.status,
        cooldown:
          normalizedResponse.cooldown,
        retryAfter:
          normalizedResponse.retryAfter,
        redirectTo:
          normalizedResponse.redirectTo,
      }
    );

    return normalizedResponse;
  } catch (error) {
    const normalizedError =
      normalizeTransportError(
        error,
        getDefaultConfirmErrorMessage()
      );

    safeEmit(
      "auth:password-reset:confirm:error",
      {
        status:
          normalizedError.status,
        cooldown:
          normalizedError.cooldown,
        retryAfter:
          normalizedError.retryAfter,
        message:
          normalizedError.message,
      }
    );

    return normalizeConfirmResetPasswordResponse(normalizedError);
  }
}

/* =========================================================
   ALIASES
========================================================= */

export async function resetPasswordRequest(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function forgotPassword(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function recoverPassword(payload = {}, options = {}) {
  return requestPasswordReset(
    payload,
    options
  );
}

export async function resetPasswordConfirm(payload = {}, options = {}) {
  return confirmResetPassword(
    payload,
    options
  );
}

export async function confirmPasswordReset(payload = {}, options = {}) {
  return confirmResetPassword(
    payload,
    options
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getPasswordResetSnapshot() {
  return {
    requestEndpoint:
      getRequestPasswordResetEndpoint(),

    confirmEndpoint:
      getConfirmResetPasswordEndpoint(),

    limits: {
      identifierMaxLength:
        getResetIdentifierMaxLength(),

      tokenMinLength:
        getResetTokenMinLength(),

      tokenMaxLength:
        getResetTokenMaxLength(),

      passwordMinLength:
        getResetPasswordMinLength(),

      passwordMaxLength:
        getResetPasswordMaxLength(),

      timeout:
        getRequestTimeout(),
    },

    transports: {
      hasHttpService:
        Boolean(
          AppCore?.http ||
          AppCore?.Http ||
          AppCore?.services?.http ||
          AppCore?.services?.Http
        ),

      hasApiClient:
        Boolean(AppCore?.apiClient),

      hasAppCoreRequest:
        isFunction(AppCore?.request),

      hasFetch:
        typeof fetch === "function",
    },
  };
}

export default requestPasswordReset;

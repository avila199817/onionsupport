/* =========================================================
   Onion SPA - HTTP Service
   Archivo: src/services/index.js

   ONION SUPPORT · HTTP SERVICE
   CORE API CLIENT BRIDGE · AUTH SAFE · RETRY SAFE · LOADER SAFE · 14/10

   Responsabilidades:
   - Servicio HTTP público de la SPA.
   - Ejecutar requests sobre AppCore.apiClient/request helpers.
   - Centralizar interceptores request/response/error.
   - Normalizar errores.
   - Aplicar retry policy desde helpers.
   - Refrescar token automáticamente ante 401 privado.
   - Reintentar una sola vez tras refresh correcto.
   - Hacer logout automático solo ante 401 persistente privado.
   - Evitar refresh/logout en endpoints públicos de auth.
   - Evitar refresh/logout en activation/reset-password.
   - Balancear loader global sin dobles incrementos.
   - Soportar AbortController/signal.
   - Adjuntar bridge estable a AppCore.Http/AppCore.http y módulos.
   - Exponer snapshot de diagnóstico sin tokens reales.
   - Soportar firmas:
       Http.request(path, options)
       Http.request(method, path, options)
       Http.get(path, options)
       Http.post(path, body, options)
       Http.delete(path, options)
       Http.delete(path, body, options)

   HARDENING EXTREMO:
   - init idempotente real
   - interceptores base registrados una sola vez
   - refresh lock para evitar refresh paralelo
   - loader con pendingRequests balanceado por request real
   - eventos consistentes y redactados
   - cero tokens crudos en logs/eventos/snapshots
   - compatible con AppCore congelado mediante accessors/modules
   - sin doble refresh
   - sin doble logout
   - sin lógicas duplicadas
   - no refresca en login/refresh/logout/activation/reset/2FA público
   - /api/auth/me sigue siendo endpoint privado y puede usar Authorization
   - evita auto-logout si el error no pertenece a request privado autenticado
   - evita leak de respuesta completa en eventos
========================================================= */

import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";

import {
  HTTP_CONFIG,
  shouldToggleGlobalLoader,
  shouldLogRequests,
  shouldLogResponses,
  shouldLogErrors,
  normalizeError,
  buildRequestSummary,
  buildDefaultRequestConfig,
  withSignal,
  sanitizeData,
} from "./http.helpers.js";

import {
  createInterceptorsState,
  useRequest as registerRequestInterceptor,
  useResponse as registerResponseInterceptor,
  useError as registerErrorInterceptor,
  runRequestInterceptors,
  runResponseInterceptors,
  runErrorInterceptors,
  getInterceptorsSnapshot,
  clearInterceptors,
  resetInterceptorsRuntime,
} from "./http.interceptors.js";

import {
  incrementPendingRequests,
  decrementPendingRequests,
  createAbortController,
  abortController as abortRuntimeController,
  getHttpRuntimeSnapshot,
  resetHttpRuntime,
} from "./http.runtime.js";

import {
  runAutoRefreshIfNeeded,
  getHttpAuthSnapshot,
  resetHttpAuthRuntime,
} from "./http.auth.js";

import {
  executeBaseRequest,
  executeWithRetry,
  getHttpRequestEngineSnapshot,
} from "./http.request.js";

/* =========================================================
   SERVICE
========================================================= */

export const Http = (() => {
  "use strict";

  /* =======================================================
     CONSTANTS
  ======================================================= */

  const SERVICE_VERSION =
    "14.1.0";

  const SERVICE_NAME =
    "http";

  const LOG_PREFIX =
    "[Http]";

  const DEFAULT_METHOD =
    "GET";

  const DEFAULT_REQUEST_TIMEOUT_MS =
    0;

  const KNOWN_METHODS =
    Object.freeze([
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]);

  const BODYLESS_METHODS =
    Object.freeze([
      "GET",
      "HEAD",
      "OPTIONS",
    ]);

  const EVENTS =
    Object.freeze({
      ready:
        "http:ready",

      initSkipped:
        "http:init:skipped",

      bridgeAttached:
        "http:bridge:attached",

      interceptorRegistered:
        "http:interceptor:registered",

      interceptorsCleared:
        "http:interceptors:cleared",

      requestStart:
        "http:request:start",

      requestSuccess:
        "http:request:success",

      requestError:
        "http:request:error",

      requestFinalize:
        "http:request:finalize",

      refreshStart:
        "http:auth-refresh:start",

      refreshSuccess:
        "http:auth-refresh:success",

      refreshError:
        "http:auth-refresh:error",

      refreshSkipped:
        "http:auth-refresh:skipped",

      replayStart:
        "http:request:replay:start",

      replaySuccess:
        "http:request:replay:success",

      replayError:
        "http:request:replay:error",

      autoLogoutStart:
        "http:auto-logout:start",

      autoLogoutSuccess:
        "http:auto-logout:success",

      autoLogoutSkipped:
        "http:auto-logout:skipped",

      autoLogoutError:
        "http:auto-logout:error",

      runtimeReset:
        "http:runtime:reset",

      configUpdated:
        "http:config:updated",
    });

  const SENSITIVE_QUERY_NAMES =
    Object.freeze([
      "token",
      "activationToken",
      "activateToken",
      "resetToken",
      "passwordResetToken",
      "confirmToken",
      "code",
      "t",
      "access_token",
      "refresh_token",
      "id_token",
      "tempToken",
      "temp_token",
      "temporaryToken",
      "temporary_token",
      "twoFactorToken",
      "two_factor_token",
      "mfaToken",
      "mfa_token",
      "jwt",
      "bearer",
      "auth",
      "authorization",
    ]);

  /*
    Endpoints auth públicos o técnicos donde NO debe entrar
    refresh automático ni auto-logout.
  */
  const PUBLIC_AUTH_ENDPOINT_MARKERS =
    Object.freeze([
      "/auth/login",
      "/auth/refresh",

      "/auth/2fa/login",
      "/auth/mfa/login",
      "/auth/otp/login",

      "/auth/activate",
      "/auth/activate-account",
      "/auth/account/activate",
      "/auth/activation",
      "/auth/activate/first-user",

      "/auth/reset-password",
      "/auth/reset-password-request",
      "/auth/reset-password-confirm",
      "/auth/password-reset",
      "/auth/forgot-password",
      "/auth/recover-password",

      "/auth/_health",
    ]);

  /*
    Endpoints auth privados o de control donde refrescar puede producir bucles.
    /auth/me NO está aquí: sigue siendo privado y debe recibir Authorization.
  */
  const AUTH_CONTROL_SKIP_REFRESH_MARKERS =
    Object.freeze([
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/logout-all",

      "/auth/2fa/login",
      "/auth/mfa/login",
      "/auth/otp/login",

      "/auth/activate",
      "/auth/activate-account",
      "/auth/account/activate",
      "/auth/activation",
      "/auth/activate/first-user",

      "/auth/reset-password",
      "/auth/reset-password-request",
      "/auth/reset-password-confirm",
      "/auth/password-reset",
      "/auth/forgot-password",
      "/auth/recover-password",

      "/auth/_health",
    ]);

  const TECHNICAL_PUBLIC_SPA_PATHS =
    Object.freeze([
      "/activate-account",
      "/reset-password",
      "/forgot-password",
      "/recover-password",
      "/password-reset",
      "/reset-password/confirm",
    ]);

  const RESPONSE_PREVIEW_KEYS =
    Object.freeze([
      "ok",
      "success",
      "authenticated",
      "requires2FA",
      "require2FA",
      "twoFactorRequired",
      "status",
      "code",
      "message",
      "error",
      "count",
      "total",
      "page",
      "limit",
      "hasMore",
    ]);

  /* =======================================================
     RUNTIME
  ======================================================= */

  let requestSeq =
    0;

  let refreshPromise =
    null;

  let logoutPromise =
    null;

  /* =======================================================
     CONFIG
  ======================================================= */

  const config = {
    ...HTTP_CONFIG,
  };

  /* =======================================================
     STATE
  ======================================================= */

  const state = {
    version:
      SERVICE_VERSION,

    initialized:
      false,

    initializing:
      false,

    bridgeAttached:
      false,

    baseInterceptorsRegistered:
      false,

    pendingRequests:
      0,

    requestCount:
      0,

    successCount:
      0,

    errorCount:
      0,

    abortCount:
      0,

    refreshAttemptCount:
      0,

    refreshSuccessCount:
      0,

    refreshFailureCount:
      0,

    refreshSkippedCount:
      0,

    refreshInFlight:
      false,

    replayCount:
      0,

    replaySuccessCount:
      0,

    replayFailureCount:
      0,

    autoLogoutCount:
      0,

    autoLogoutSkippedCount:
      0,

    autoLogoutInFlight:
      false,

    lastRequestId:
      "",

    lastRequestAt:
      "",

    lastSuccessAt:
      "",

    lastErrorAt:
      "",

    lastError:
      null,

    lastRefreshAt:
      "",

    lastRefreshErrorAt:
      "",

    lastReplayAt:
      "",

    lastReplayErrorAt:
      "",

    lastAutoLogoutAt:
      "",

    lastRuntimeResetAt:
      "",
  };

  /* =======================================================
     INTERCEPTORS
  ======================================================= */

  const interceptors =
    createInterceptorsState();

  /* =======================================================
     BASIC HELPERS
  ======================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function isObject(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function isAnyObject(value) {
    return (
      value !== null &&
      typeof value === "object"
    );
  }

  function safeObject(value, fallback = {}) {
    return isObject(value)
      ? value
      : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
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

  function safeLower(value = "", fallback = "") {
    return safeText(value, fallback)
      .toLowerCase();
  }

  function safeNumber(value, fallback = 0) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function safeBool(value, fallback = false) {
    if (value === true) return true;
    if (value === false) return false;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const clean =
        value.trim().toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
          "ok",
          "on",
          "enabled",
        ].includes(clean)
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "off",
          "disabled",
        ].includes(clean)
      ) {
        return false;
      }
    }

    return Boolean(fallback);
  }

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function isoNow(ms = nowMs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function normalizeMethod(method = DEFAULT_METHOD) {
    const clean =
      safeText(method, DEFAULT_METHOD)
        .toUpperCase();

    return KNOWN_METHODS.includes(clean)
      ? clean
      : DEFAULT_METHOD;
  }

  function isKnownMethod(value = "") {
    return KNOWN_METHODS.includes(
      safeText(value, "").toUpperCase()
    );
  }

  function isBodylessMethod(method = DEFAULT_METHOD) {
    return BODYLESS_METHODS.includes(
      normalizeMethod(method)
    );
  }

  function nextRequestId() {
    requestSeq += 1;

    return `http_${requestSeq}_${nowMs()}`;
  }

  function getBaseOrigin() {
    if (
      isBrowser() &&
      window.location?.origin
    ) {
      return window.location.origin;
    }

    return "http://localhost";
  }

  function getCoreApiBase() {
    return (
      safeText(AppCore?.config?.apiBase, "") ||
      safeText(AppCore?.config?.api?.baseUrl, "") ||
      safeText(AppCore?.config?.api?.base, "") ||
      safeText(config.apiBase, "") ||
      safeText(config.baseUrl, "") ||
      ""
    );
  }

  function safeEmit(eventName = "", payload = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    try {
      AppCore?.events?.emit?.(
        name,
        sanitizePayload(payload)
      );

      return true;
    } catch {}

    return false;
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        LOG_PREFIX,
        ...args.map((item) => sanitizePayload(item))
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        LOG_PREFIX,
        ...args.map((item) => sanitizePayload(item))
      );

      return;
    } catch {}

    try {
      console.warn(
        LOG_PREFIX,
        ...args.map((item) => sanitizePayload(item))
      );
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        LOG_PREFIX,
        ...args.map((item) => sanitizePayload(item))
      );

      return;
    } catch {}

    try {
      console.error(
        LOG_PREFIX,
        ...args.map((item) => sanitizePayload(item))
      );
    } catch {}
  }

  /* =======================================================
     REDACTION / SANITIZE
  ======================================================= */

  function escapeRegExp(value = "") {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }

  function redactTokenInText(value = "") {
    let output =
      safeText(value, "");

    if (!output) {
      return "";
    }

    for (const name of SENSITIVE_QUERY_NAMES) {
      try {
        output =
          output.replace(
            new RegExp(
              `([?&#]${escapeRegExp(name)}=)([^&#\\s]+)`,
              "gi"
            ),
            "$1***"
          );
      } catch {}
    }

    try {
      output =
        output.replace(
          /(\/activate-account\/)([^/?#\s]+)/gi,
          "$1***"
        );
    } catch {}

    try {
      output =
        output.replace(
          /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
          "$1***"
        );
    } catch {}

    try {
      output =
        output.replace(
          /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
          "$1***"
        );
    } catch {}

    try {
      output =
        output.replace(
          /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
          "$1$2***"
        );
    } catch {}

    try {
      output =
        output.replace(
          /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
          "***"
        );
    } catch {}

    return output;
  }

  function isSensitiveObjectKey(key = "") {
    const value =
      safeLower(key, "");

    if (!value) {
      return false;
    }

    if (
      /password|secret|authorization|credential|cookie|bearer|jwt|otp|mfa|2fa/i.test(value)
    ) {
      return true;
    }

    if (
      /(^|[_:. -])(token|access_token|refresh_token|id_token|temp_token|temporary_token)($|[_:. -])/i.test(value)
    ) {
      return true;
    }

    if (
      [
        "token",
        "accesstoken",
        "access_token",
        "refreshtoken",
        "refresh_token",
        "idtoken",
        "id_token",
        "temptoken",
        "temp_token",
        "temporarytoken",
        "temporary_token",
        "sessionid",
        "session_id",
        "sessionuserid",
        "session_user_id",
      ].includes(value.replace(/[-:.]/g, "_"))
    ) {
      return true;
    }

    return false;
  }

  function isDomNodeLike(value) {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return false;
    }

    try {
      return Boolean(
        typeof Node !== "undefined" &&
          value instanceof Node
      );
    } catch {}

    try {
      return Boolean(
        value.nodeType &&
          value.nodeName
      );
    } catch {}

    return false;
  }

  function sanitizePayload(value, depth = 0, keyHint = "") {
    if (isSensitiveObjectKey(keyHint)) {
      return value
        ? "***"
        : null;
    }

    if (depth > 6) {
      return "[MaxDepth]";
    }

    if (typeof value === "string") {
      return redactTokenInText(value);
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "bigint") {
      return String(value);
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    if (isDomNodeLike(value)) {
      return {
        node:
          safeText(value.nodeName, "Node"),

        id:
          safeText(value.id, ""),

        className:
          safeText(
            value.className?.baseVal ||
              value.className,
            ""
          ),
      };
    }

    if (value instanceof Error) {
      return {
        name:
          safeText(value.name, "Error"),

        message:
          redactTokenInText(value.message || ""),

        code:
          value.code || null,

        status:
          value.status || value.statusCode || null,

        stack:
          value.stack ? "[stack]" : null,
      };
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 80)
        .map((item) =>
          sanitizePayload(
            item,
            depth + 1,
            keyHint
          )
        );
    }

    if (isAnyObject(value)) {
      const output = {};

      for (const [key, item] of Object.entries(value).slice(0, 100)) {
        output[key] =
          isSensitiveObjectKey(key)
            ? item
              ? "***"
              : item
            : sanitizePayload(
                item,
                depth + 1,
                key
              );
      }

      return output;
    }

    return redactTokenInText(String(value));
  }

  function sanitizeErrorForEvent(error = null) {
    if (!error) {
      return null;
    }

    const source =
      safeObject(error, {});

    return {
      name:
        safeText(source.name, "Error"),

      message:
        redactTokenInText(
          safeText(
            source.message ||
              source.error ||
              source.reason ||
              "Error",
            "Error"
          )
        ),

      status:
        safeNumber(
          source.status ||
            source.statusCode,
          0
        ),

      code:
        safeText(source.code, ""),

      method:
        safeText(source.method, ""),

      url:
        redactTokenInText(
          safeText(source.url, "")
        ),

      path:
        redactTokenInText(
          safeText(source.path, "")
        ),

      redactedUrl:
        redactTokenInText(
          safeText(
            source.redactedUrl ||
              source.url ||
              source.path,
            ""
          )
        ),

      timeout:
        Boolean(source.timeout),

      aborted:
        Boolean(source.aborted),

      public:
        Boolean(source.public),

      auth:
        source.auth !== false,

      requestId:
        safeText(source.requestId, ""),

      retryable:
        source.retryable === true,

      at:
        isoNow(),
    };
  }

  function sanitizeRequestConfigForEvent(requestConfig = {}) {
    const cfg =
      safeObject(requestConfig);

    return {
      requestId:
        safeText(cfg.requestId, ""),

      method:
        safeText(cfg.method, ""),

      path:
        redactTokenInText(
          safeText(cfg.path, "")
        ),

      url:
        redactTokenInText(
          safeText(cfg.url, "")
        ),

      auth:
        cfg.auth !== false,

      public:
        cfg.public === true,

      useLoader:
        cfg.useLoader !== false,

      retry:
        cfg.retry !== false,

      retries:
        cfg.retries ?? null,

      timeout:
        cfg.timeout ?? null,

      upload:
        cfg.upload === true,

      raw:
        cfg.raw === true,

      responseType:
        safeText(cfg.responseType, ""),

      skipAuthRefresh:
        cfg._skipAuthRefresh === true,

      authRefreshAttempted:
        cfg._authRefreshAttempted === true,

      authRefreshSucceeded:
        cfg._authRefreshSucceeded === true,

      authRefreshFailed:
        cfg._authRefreshFailed === true,
    };
  }

  function summarizeResponseForEvent(response = null) {
    if (
      response === null ||
      response === undefined
    ) {
      return null;
    }

    if (
      typeof Response !== "undefined" &&
      response instanceof Response
    ) {
      return {
        type:
          "Response",

        ok:
          response.ok,

        status:
          response.status,

        statusText:
          response.statusText || "",

        url:
          redactTokenInText(response.url || ""),
      };
    }

    if (Array.isArray(response)) {
      return {
        type:
          "array",

        length:
          response.length,
      };
    }

    if (typeof response === "string") {
      return {
        type:
          "string",

        length:
          response.length,

        preview:
          redactTokenInText(
            response.slice(0, 160)
          ),
      };
    }

    if (
      typeof Blob !== "undefined" &&
      response instanceof Blob
    ) {
      return {
        type:
          "Blob",

        size:
          response.size,

        mime:
          response.type || "",
      };
    }

    if (
      typeof ArrayBuffer !== "undefined" &&
      response instanceof ArrayBuffer
    ) {
      return {
        type:
          "ArrayBuffer",

        byteLength:
          response.byteLength,
      };
    }

    if (isObject(response)) {
      const preview = {};

      for (const key of RESPONSE_PREVIEW_KEYS) {
        if (Object.prototype.hasOwnProperty.call(response, key)) {
          preview[key] =
            sanitizePayload(response[key], 0, key);
        }
      }

      if (Array.isArray(response.items)) {
        preview.itemsCount =
          response.items.length;
      }

      if (Array.isArray(response.data)) {
        preview.dataCount =
          response.data.length;
      }

      if (Array.isArray(response.results)) {
        preview.resultsCount =
          response.results.length;
      }

      return {
        type:
          "object",

        keys:
          Object.keys(response).slice(0, 30),

        ...preview,
      };
    }

    return {
      type:
        typeof response,
    };
  }

  /* =======================================================
     PATH / ENDPOINT HELPERS
  ======================================================= */

  function normalizeEndpointPath(path = "") {
    const raw =
      safeText(path, "");

    if (!raw) {
      return "";
    }

    try {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      return safeLower(
        parsed.pathname || raw
      ).replace(/\/{2,}/g, "/");
    } catch {}

    return safeLower(
      raw
        .split("?")[0]
        .split("#")[0] ||
        raw
    ).replace(/\/{2,}/g, "/");
  }

  function getComparableEndpointPaths(path = "") {
    const normalized =
      normalizeEndpointPath(path);

    const withoutApi =
      normalized.startsWith("/api/")
        ? normalized.slice(4) || "/"
        : normalized === "/api"
          ? "/"
          : normalized;

    return Array.from(
      new Set([
        normalized,
        withoutApi,
      ].filter(Boolean))
    );
  }

  function endpointIncludes(path = "", markers = []) {
    const candidates =
      getComparableEndpointPaths(path);

    if (!candidates.length) {
      return false;
    }

    return safeArray(markers).some((marker) => {
      const cleanMarker =
        normalizeEndpointPath(marker);

      if (!cleanMarker) {
        return false;
      }

      return candidates.some((candidate) => (
        candidate === cleanMarker ||
        candidate.endsWith(cleanMarker) ||
        candidate.includes(cleanMarker)
      ));
    });
  }

  function isPublicAuthEndpoint(path = "") {
    return endpointIncludes(
      path,
      PUBLIC_AUTH_ENDPOINT_MARKERS
    );
  }

  function isAuthRefreshControlEndpoint(path = "") {
    return endpointIncludes(
      path,
      AUTH_CONTROL_SKIP_REFRESH_MARKERS
    );
  }

  function isTechnicalPublicSpaEndpoint(path = "") {
    const candidates =
      getComparableEndpointPaths(path);

    if (!candidates.length) {
      return false;
    }

    return TECHNICAL_PUBLIC_SPA_PATHS.some((publicPath) => {
      const clean =
        normalizeEndpointPath(publicPath);

      return candidates.some((candidate) => (
        candidate === clean ||
        candidate.startsWith(`${clean}/`)
      ));
    });
  }

  function isPublicEndpoint(path = "") {
    if (
      isPublicAuthEndpoint(path) ||
      isTechnicalPublicSpaEndpoint(path)
    ) {
      return true;
    }

    try {
      if (isFunction(AppCore?.utils?.isPublicApiPath)) {
        return Boolean(
          AppCore.utils.isPublicApiPath(path)
        );
      }
    } catch {}

    try {
      if (isFunction(AppCore?.isPublicApiPath)) {
        return Boolean(
          AppCore.isPublicApiPath(path)
        );
      }
    } catch {}

    return false;
  }

  function isAuthMeEndpoint(path = "") {
    const candidates =
      getComparableEndpointPaths(path);

    return candidates.some((candidate) => (
      candidate === "/me" ||
      candidate === "/auth/me" ||
      candidate === "/api/auth/me" ||
      candidate.endsWith("/auth/me")
    ));
  }

  function isAuthEndpoint(path = "") {
    const normalized =
      normalizeEndpointPath(path);

    return (
      normalized.includes("/auth/") ||
      normalized.endsWith("/auth") ||
      isAuthMeEndpoint(path)
    );
  }

  function normalizePublicRequestConfig(requestConfig = {}) {
    const cfg =
      safeObject(requestConfig);

    const path =
      cfg.path ||
      cfg.url ||
      "";

    const publicByFlag =
      cfg.public === true ||
      cfg.auth === false ||
      cfg.skipAuth === true;

    const publicByPath =
      isPublicEndpoint(path);

    if (
      !publicByFlag &&
      !publicByPath
    ) {
      return cfg;
    }

    return {
      ...cfg,

      auth:
        false,

      public:
        true,

      skipAuth:
        true,

      _skipAuthRefresh:
        true,
    };
  }

  function isPrivateAuthenticatedRequest(requestConfig = {}) {
    const cfg =
      safeObject(requestConfig);

    const path =
      cfg.path ||
      cfg.url ||
      "";

    if (cfg.auth === false) {
      return false;
    }

    if (cfg.public === true || cfg.skipAuth === true) {
      return false;
    }

    if (isPublicEndpoint(path)) {
      return false;
    }

    if (isAuthRefreshControlEndpoint(path)) {
      return false;
    }

    /*
      /api/auth/me sí es privado.
      Nota: para refrescar también debe permitirlo http.auth.js.
    */
    if (isAuthMeEndpoint(path)) {
      return true;
    }

    return true;
  }

  function shouldAttemptAuthRefresh(error = null, requestConfig = {}) {
    if (config.autoRefreshOn401 === false) {
      return false;
    }

    if (safeNumber(error?.status, 0) !== 401) {
      return false;
    }

    if (!isPrivateAuthenticatedRequest(requestConfig)) {
      return false;
    }

    if (requestConfig?._skipAuthRefresh === true) {
      return false;
    }

    if (requestConfig?._authRefreshAttempted === true) {
      return false;
    }

    return true;
  }

  function shouldAutoLogout(error = null, requestConfig = {}) {
    if (config.autoLogoutOn401 === false) {
      return false;
    }

    if (safeNumber(error?.status, 0) !== 401) {
      return false;
    }

    if (!isPrivateAuthenticatedRequest(requestConfig)) {
      return false;
    }

    const refreshFailed =
      requestConfig?._authRefreshFailed === true;

    const persistentAfterRefresh =
      requestConfig?._authRefreshAttempted === true &&
      requestConfig?._authRefreshSucceeded === true &&
      requestConfig?._skipAuthRefresh === true;

    if (
      !refreshFailed &&
      !persistentAfterRefresh
    ) {
      return false;
    }

    try {
      return Boolean(
        Auth?.isAuthenticated?.() ||
          AppCore?.state?.authenticated
      );
    } catch {
      return Boolean(AppCore?.state?.authenticated);
    }
  }

  /* =======================================================
     APPCORE BRIDGE
  ======================================================= */

  function registerModule(name = "", value = null, aliases = []) {
    const cleanName =
      safeText(name, "");

    if (
      !cleanName ||
      !value
    ) {
      return false;
    }

    const names =
      Array.from(
        new Set([
          cleanName,
          ...safeArray(aliases)
            .map((item) => safeText(item, ""))
            .filter(Boolean),
        ])
      );

    let ok =
      false;

    for (const moduleName of names) {
      try {
        const result =
          AppCore?.modules?.register?.(
            moduleName,
            value,
            {
              replace:
                true,

              overwrite:
                true,

              source:
                "http.service",
            }
          );

        if (result !== false) {
          ok = true;
        }
      } catch {}

      try {
        AppCore?.registry?.modules?.set?.(
          moduleName,
          value
        );

        ok = true;
      } catch {}
    }

    return ok;
  }

  function bridgeLooksAttached() {
    return Boolean(
      AppCore?.Http === api ||
        AppCore?.http === api ||
        AppCore?.modules?.get?.("Http") === api ||
        AppCore?.modules?.get?.("http") === api
    );
  }

  function attachToAppCore() {
    if (
      state.bridgeAttached &&
      bridgeLooksAttached()
    ) {
      return true;
    }

    let attached =
      false;

    try {
      AppCore.Http =
        api;

      attached = true;
    } catch {}

    try {
      AppCore.http =
        api;

      attached = true;
    } catch {}

    try {
      if (
        AppCore &&
        typeof AppCore === "object" &&
        Object.isExtensible(AppCore)
      ) {
        if (
          !AppCore.services ||
          typeof AppCore.services !== "object"
        ) {
          AppCore.services = {};
        }

        AppCore.services.Http =
          api;

        AppCore.services.http =
          api;

        attached = true;
      }
    } catch {}

    if (
      registerModule(
        "Http",
        api,
        [
          "http",
          "HTTP",
          "httpService",
          "HttpService",
          SERVICE_NAME,
        ]
      )
    ) {
      attached = true;
    }

    state.bridgeAttached =
      true;

    safeEmit(
      EVENTS.bridgeAttached,
      {
        attached,
        hasAppCoreHttp:
          Boolean(AppCore?.http || AppCore?.Http),
        hasAppCoreModules:
          Boolean(AppCore?.modules),
      }
    );

    return true;
  }

  /* =======================================================
     INTERCEPTOR API
  ======================================================= */

  function useRequest(fn, options = {}) {
    const off =
      registerRequestInterceptor(
        interceptors,
        fn,
        options
      );

    safeEmit(
      EVENTS.interceptorRegistered,
      {
        type:
          "request",
      }
    );

    return off;
  }

  function useResponse(fn, options = {}) {
    const off =
      registerResponseInterceptor(
        interceptors,
        fn,
        options
      );

    safeEmit(
      EVENTS.interceptorRegistered,
      {
        type:
          "response",
      }
    );

    return off;
  }

  function useError(fn, options = {}) {
    const off =
      registerErrorInterceptor(
        interceptors,
        fn,
        options
      );

    safeEmit(
      EVENTS.interceptorRegistered,
      {
        type:
          "error",
      }
    );

    return off;
  }

  function clearRegisteredInterceptors(type = "") {
    const removed =
      clearInterceptors(
        interceptors,
        type
      );

    safeEmit(
      EVENTS.interceptorsCleared,
      {
        type:
          safeText(type, "all"),

        removed,
      }
    );

    return removed;
  }

  /* =======================================================
     LOADER
  ======================================================= */

  function startLoaderIfNeeded(loaderEnabled = false, requestId = "") {
    if (!loaderEnabled) {
      return false;
    }

    let pending =
      0;

    try {
      pending =
        incrementPendingRequests(
          AppCore,
          state,
          {
            source:
              "http.service:start",

            requestId,
          }
        );
    } catch {
      state.pendingRequests =
        Math.max(
          0,
          safeNumber(state.pendingRequests, 0) + 1
        );

      pending =
        state.pendingRequests;
    }

    state.pendingRequests =
      Math.max(
        0,
        safeNumber(
          pending,
          state.pendingRequests
        )
      );

    if (state.pendingRequests <= 1) {
      try {
        AppCore?.setLoading?.(true);
      } catch {}
    }

    return true;
  }

  function stopLoaderIfNeeded(loaderStarted = false, requestId = "") {
    if (!loaderStarted) {
      return state.pendingRequests;
    }

    let pending =
      0;

    try {
      pending =
        decrementPendingRequests(
          AppCore,
          state,
          {
            source:
              "http.service:finalize",

            requestId,
          }
        );
    } catch {
      state.pendingRequests =
        Math.max(
          0,
          safeNumber(state.pendingRequests, 0) - 1
        );

      pending =
        state.pendingRequests;
    }

    state.pendingRequests =
      Math.max(
        0,
        safeNumber(
          pending,
          state.pendingRequests
        )
      );

    if (state.pendingRequests <= 0) {
      state.pendingRequests =
        0;

      try {
        AppCore?.setLoading?.(false);
      } catch {}
    }

    return state.pendingRequests;
  }

  /* =======================================================
     REQUEST ARGUMENTS
  ======================================================= */

  function normalizeRequestArgs(arg1 = DEFAULT_METHOD, arg2 = "", arg3 = {}) {
    /*
      Http.request("GET", "/api/x", options)
    */
    if (
      typeof arg1 === "string" &&
      isKnownMethod(arg1) &&
      typeof arg2 === "string"
    ) {
      return {
        method:
          normalizeMethod(arg1),

        path:
          arg2,

        options:
          safeObject(arg3),
      };
    }

    /*
      Http.request("/api/x", options)
    */
    return {
      method:
        normalizeMethod(
          safeObject(arg2).method ||
            DEFAULT_METHOD
        ),

      path:
        arg1,

      options:
        safeObject(arg2),
    };
  }

  function normalizeDeleteArgs(path = "", bodyOrOptions = {}, maybeOptions = undefined) {
    if (maybeOptions !== undefined) {
      return {
        path,
        options: {
          ...safeObject(maybeOptions),
          body:
            bodyOrOptions,
        },
      };
    }

    return {
      path,
      options:
        safeObject(bodyOrOptions),
    };
  }

  /* =======================================================
     REQUEST CONFIG
  ======================================================= */

  function normalizeTimeout(value) {
    const timeout =
      safeNumber(value, DEFAULT_REQUEST_TIMEOUT_MS);

    return timeout > 0
      ? timeout
      : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  function buildServiceRequestConfig(method = "GET", path = "", options = {}) {
    const opts =
      safeObject(options);

    const requestId =
      safeText(
        opts.requestId,
        ""
      ) || nextRequestId();

    const timeout =
      normalizeTimeout(
        opts.timeout ??
          config.timeout ??
          DEFAULT_REQUEST_TIMEOUT_MS
      );

    const base =
      buildDefaultRequestConfig(
        config,
        AppCore,
        method,
        path,
        {
          ...opts,

          requestId,

          timeout,

          signal:
            withSignal(
              opts.signal
            ),
        }
      );

    const finalConfig =
      normalizePublicRequestConfig({
        ...safeObject(base),

        ...opts,

        requestId,

        method:
          normalizeMethod(
            base?.method ||
              opts.method ||
              method
          ),

        path:
          base?.path ||
          opts.path ||
          path,

        timeout,

        apiBase:
          base?.apiBase ||
          opts.apiBase ||
          getCoreApiBase(),

        _preparedBy:
          "http.service",
      });

    return finalConfig;
  }

  async function prepareRequestConfig(method = "GET", path = "", options = {}) {
    let requestConfig =
      buildServiceRequestConfig(
        method,
        path,
        options
      );

    requestConfig =
      await runRequestInterceptors(
        interceptors,
        requestConfig
      );

    requestConfig =
      normalizePublicRequestConfig(
        requestConfig
      );

    requestConfig.requestId =
      safeText(
        requestConfig.requestId,
        ""
      ) ||
      safeText(
        options?.requestId,
        ""
      ) ||
      nextRequestId();

    requestConfig.method =
      normalizeMethod(
        requestConfig.method ||
          method
      );

    requestConfig.path =
      requestConfig.path ||
      path;

    requestConfig.apiBase =
      requestConfig.apiBase ||
      getCoreApiBase();

    if (isBodylessMethod(requestConfig.method)) {
      delete requestConfig.body;
    }

    return requestConfig;
  }

  /* =======================================================
     AUTH REFRESH LOCK
  ======================================================= */

  async function runRefreshLocked(payload = {}) {
    if (refreshPromise) {
      return refreshPromise;
    }

    state.refreshInFlight =
      true;

    refreshPromise =
      Promise.resolve()
        .then(() =>
          runAutoRefreshIfNeeded(payload)
        )
        .finally(() => {
          state.refreshInFlight =
            false;

          refreshPromise =
            null;
        });

    return refreshPromise;
  }

  async function tryRefreshAndReplay({
    normalizedInitialError,
    requestConfig,
  }) {
    const requestId =
      requestConfig.requestId;

    const refreshConfig = {
      ...requestConfig,

      _authRefreshAttempted:
        true,
    };

    state.refreshAttemptCount += 1;
    state.lastRefreshAt =
      isoNow();

    safeEmit(
      EVENTS.refreshStart,
      {
        requestId,

        method:
          refreshConfig.method,

        path:
          redactTokenInText(refreshConfig.path),

        status:
          normalizedInitialError.status,
      }
    );

    let refreshed =
      false;

    try {
      refreshed =
        await runRefreshLocked({
          AppCore,
          Auth,
          config,
          state,
          error:
            normalizedInitialError,
          requestConfig:
            refreshConfig,
        });
    } catch (refreshError) {
      refreshed =
        false;

      state.lastRefreshErrorAt =
        isoNow();

      safeWarn(
        "Refresh automático falló.",
        refreshError
      );
    }

    if (!refreshed) {
      state.refreshFailureCount += 1;

      const failedConfig = {
        ...refreshConfig,

        _skipAuthRefresh:
          true,

        _authRefreshFailed:
          true,

        _authRefreshSucceeded:
          false,
      };

      safeEmit(
        EVENTS.refreshError,
        {
          requestId,

          path:
            redactTokenInText(failedConfig.path),

          error:
            sanitizeErrorForEvent(normalizedInitialError),
        }
      );

      return {
        ok:
          false,

        requestConfig:
          failedConfig,

        error:
          normalizedInitialError,
      };
    }

    state.refreshSuccessCount += 1;

    safeEmit(
      EVENTS.refreshSuccess,
      {
        requestId,

        path:
          redactTokenInText(refreshConfig.path),
      }
    );

    const replayConfig =
      normalizePublicRequestConfig({
        ...refreshConfig,

        requestId,

        _skipRetry:
          true,

        _skipAuthRefresh:
          true,

        _authRefreshSucceeded:
          true,

        _authRefreshFailed:
          false,
      });

    state.replayCount += 1;
    state.lastReplayAt =
      isoNow();

    safeEmit(
      EVENTS.replayStart,
      {
        requestId,

        method:
          replayConfig.method,

        path:
          redactTokenInText(replayConfig.path),
      }
    );

    try {
      const response =
        await executeBaseRequest(
          AppCore,
          replayConfig
        );

      state.replaySuccessCount += 1;

      safeEmit(
        EVENTS.replaySuccess,
        {
          requestId,

          method:
            replayConfig.method,

          path:
            redactTokenInText(replayConfig.path),

          response:
            summarizeResponseForEvent(response),
        }
      );

      return {
        ok:
          true,

        requestConfig:
          replayConfig,

        response,
      };
    } catch (replayError) {
      const normalizedReplayError =
        normalizeError(
          replayError,
          replayConfig
        );

      state.replayFailureCount += 1;
      state.lastReplayErrorAt =
        isoNow();

      safeEmit(
        EVENTS.replayError,
        {
          requestId,

          method:
            replayConfig.method,

          path:
            redactTokenInText(replayConfig.path),

          error:
            sanitizeErrorForEvent(normalizedReplayError),
        }
      );

      return {
        ok:
          false,

        requestConfig:
          replayConfig,

        error:
          normalizedReplayError,
      };
    }
  }

  /* =======================================================
     AUTO LOGOUT
  ======================================================= */

  async function runAutoLogoutOnce(error = null, requestConfig = {}) {
    if (logoutPromise) {
      return logoutPromise;
    }

    if (!shouldAutoLogout(error, requestConfig)) {
      state.autoLogoutSkippedCount += 1;

      safeEmit(
        EVENTS.autoLogoutSkipped,
        {
          requestId:
            requestConfig?.requestId || "",

          path:
            redactTokenInText(
              requestConfig?.path || ""
            ),

          error:
            sanitizeErrorForEvent(error),
        }
      );

      return false;
    }

    state.autoLogoutInFlight =
      true;

    state.autoLogoutCount += 1;
    state.lastAutoLogoutAt =
      isoNow();

    safeEmit(
      EVENTS.autoLogoutStart,
      {
        requestId:
          requestConfig?.requestId || "",

        path:
          redactTokenInText(
            requestConfig?.path || ""
          ),

        error:
          sanitizeErrorForEvent(error),
      }
    );

    logoutPromise =
      Promise.resolve()
        .then(async () => {
          try {
            await Auth?.logout?.({
              silent:
                false,

              notifyServer:
                false,

              reason:
                "http-401-after-refresh",
            });

            safeEmit(
              EVENTS.autoLogoutSuccess,
              {
                requestId:
                  requestConfig?.requestId || "",

                path:
                  redactTokenInText(
                    requestConfig?.path || ""
                  ),
              }
            );

            return true;
          } catch (logoutError) {
            safeWarn(
              "Logout automático falló.",
              logoutError
            );

            safeEmit(
              EVENTS.autoLogoutError,
              {
                requestId:
                  requestConfig?.requestId || "",

                error:
                  sanitizeErrorForEvent(logoutError),
              }
            );

            return false;
          }
        })
        .finally(() => {
          state.autoLogoutInFlight =
            false;

          logoutPromise =
            null;
        });

    return logoutPromise;
  }

  /* =======================================================
     CORE REQUEST
  ======================================================= */

  async function request(...args) {
    init();

    const normalizedArgs =
      normalizeRequestArgs(...args);

    const method =
      normalizedArgs.method;

    const path =
      normalizedArgs.path;

    const options =
      normalizedArgs.options;

    const startedAt =
      nowMs();

    state.requestCount += 1;
    state.lastRequestAt =
      isoNow(startedAt);

    let requestConfig =
      null;

    let loaderEnabled =
      false;

    let loaderStarted =
      false;

    try {
      requestConfig =
        await prepareRequestConfig(
          method,
          path,
          options
        );

      state.lastRequestId =
        requestConfig.requestId;

      loaderEnabled =
        shouldToggleGlobalLoader(
          requestConfig
        );

      if (
        shouldLogRequests(
          config,
          AppCore
        )
      ) {
        safeLog(
          "HTTP →",
          {
            ...buildRequestSummary(requestConfig),

            path:
              redactTokenInText(requestConfig.path),
          }
        );
      }

      loaderStarted =
        startLoaderIfNeeded(
          loaderEnabled,
          requestConfig.requestId
        );

      safeEmit(
        EVENTS.requestStart,
        sanitizeRequestConfigForEvent({
          ...requestConfig,

          useLoader:
            loaderEnabled,
        })
      );

      let response =
        null;

      try {
        response =
          await executeWithRetry({
            AppCore,
            config,
            requestConfig,
          });
      } catch (initialError) {
        const normalizedInitialError =
          normalizeError(
            initialError,
            requestConfig
          );

        if (
          !shouldAttemptAuthRefresh(
            normalizedInitialError,
            requestConfig
          )
        ) {
          if (
            safeNumber(normalizedInitialError?.status, 0) === 401
          ) {
            state.refreshSkippedCount += 1;

            safeEmit(
              EVENTS.refreshSkipped,
              {
                requestId:
                  requestConfig.requestId,

                path:
                  redactTokenInText(requestConfig.path),

                reason:
                  "not-eligible",

                error:
                  sanitizeErrorForEvent(normalizedInitialError),
              }
            );
          }

          throw normalizedInitialError;
        }

        const refreshResult =
          await tryRefreshAndReplay({
            normalizedInitialError,
            requestConfig,
          });

        requestConfig =
          refreshResult.requestConfig ||
          requestConfig;

        if (refreshResult.ok) {
          response =
            refreshResult.response;
        } else {
          throw refreshResult.error ||
            normalizedInitialError;
        }
      }

      const interceptedResponse =
        await runResponseInterceptors(
          interceptors,
          response,
          requestConfig
        );

      state.successCount += 1;
      state.lastSuccessAt =
        isoNow();

      safeEmit(
        EVENTS.requestSuccess,
        {
          requestId:
            requestConfig.requestId,

          method:
            requestConfig.method,

          path:
            redactTokenInText(requestConfig.path),

          durationMs:
            nowMs() - startedAt,

          response:
            summarizeResponseForEvent(interceptedResponse),
        }
      );

      if (
        shouldLogResponses(
          config,
          AppCore
        )
      ) {
        safeLog(
          "HTTP ✓",
          {
            requestId:
              requestConfig.requestId,

            method:
              requestConfig.method,

            path:
              redactTokenInText(requestConfig.path),

            durationMs:
              nowMs() - startedAt,

            response:
              summarizeResponseForEvent(interceptedResponse),
          }
        );
      }

      return interceptedResponse;
    } catch (error) {
      let normalized =
        normalizeError(
          error,
          requestConfig || {
            method,
            path,
          }
        );

      let finalError =
        normalized;

      try {
        const intercepted =
          await runErrorInterceptors(
            interceptors,
            normalized,
            requestConfig || {
              method,
              path,
            }
          );

        if (intercepted !== undefined) {
          finalError =
            intercepted;
        }
      } catch (interceptorError) {
        finalError =
          normalizeError(
            interceptorError,
            requestConfig || {
              method,
              path,
            }
          );
      }

      state.errorCount += 1;
      state.lastErrorAt =
        isoNow();

      if (finalError?.aborted) {
        state.abortCount += 1;
      }

      state.lastError =
        sanitizeErrorForEvent(
          finalError
        );

      safeEmit(
        EVENTS.requestError,
        {
          requestId:
            requestConfig?.requestId || "",

          method:
            requestConfig?.method || method,

          path:
            redactTokenInText(
              requestConfig?.path || path
            ),

          durationMs:
            nowMs() - startedAt,

          error:
            sanitizeErrorForEvent(finalError),
        }
      );

      if (
        shouldLogErrors(
          config
        )
      ) {
        safeError(
          "HTTP ✗",
          sanitizeErrorForEvent(finalError)
        );
      }

      if (
        shouldAutoLogout(
          finalError,
          requestConfig || {}
        )
      ) {
        await runAutoLogoutOnce(
          finalError,
          requestConfig
        );
      }

      throw finalError;
    } finally {
      stopLoaderIfNeeded(
        loaderStarted,
        requestConfig?.requestId || ""
      );

      safeEmit(
        EVENTS.requestFinalize,
        {
          requestId:
            requestConfig?.requestId || "",

          method:
            requestConfig?.method || method,

          path:
            redactTokenInText(
              requestConfig?.path || path
            ),

          pendingRequests:
            state.pendingRequests,

          durationMs:
            nowMs() - startedAt,
        }
      );
    }
  }

  /* =======================================================
     REST METHODS
  ======================================================= */

  function get(path, options = {}) {
    return request(
      "GET",
      path,
      options
    );
  }

  function head(path, options = {}) {
    return request(
      "HEAD",
      path,
      options
    );
  }

  function optionsMethod(path, options = {}) {
    return request(
      "OPTIONS",
      path,
      options
    );
  }

  function post(path, body = null, options = {}) {
    return request(
      "POST",
      path,
      {
        ...safeObject(options),
        body,
      }
    );
  }

  function put(path, body = null, options = {}) {
    return request(
      "PUT",
      path,
      {
        ...safeObject(options),
        body,
      }
    );
  }

  function patch(path, body = null, options = {}) {
    return request(
      "PATCH",
      path,
      {
        ...safeObject(options),
        body,
      }
    );
  }

  function del(path, bodyOrOptions = {}, maybeOptions = undefined) {
    const normalized =
      normalizeDeleteArgs(
        path,
        bodyOrOptions,
        maybeOptions
      );

    return request(
      "DELETE",
      normalized.path,
      normalized.options
    );
  }

  function upload(path, formData, options = {}) {
    return request(
      options?.method || "POST",
      path,
      {
        ...safeObject(options),

        body:
          formData,

        upload:
          true,

        rawBody:
          true,
      }
    );
  }

  function download(path, options = {}) {
    return request(
      options?.method || "GET",
      path,
      {
        ...safeObject(options),

        responseType:
          options.responseType ||
          "blob",

        download:
          true,
      }
    );
  }

  function raw(method = "GET", path = "", options = {}) {
    if (
      typeof method === "string" &&
      !isKnownMethod(method)
    ) {
      return request(
        "GET",
        method,
        {
          ...safeObject(path),
          raw:
            true,
        }
      );
    }

    return request(
      method,
      path,
      {
        ...safeObject(options),

        raw:
          true,
      }
    );
  }

  /* =======================================================
     BASE INTERCEPTORS
  ======================================================= */

  function registerBaseInterceptors() {
    if (state.baseInterceptorsRegistered) {
      return true;
    }

    state.baseInterceptorsRegistered =
      true;

    useRequest((requestConfig) => {
      const cfg =
        normalizePublicRequestConfig(
          requestConfig
        );

      const headers = {
        ...(cfg.headers || {}),
      };

      if (!headers["X-Requested-With"]) {
        headers["X-Requested-With"] =
          "XMLHttpRequest";
      }

      if (!headers["X-Request-Id"]) {
        headers["X-Request-Id"] =
          cfg.requestId || nextRequestId();
      }

      if (!headers["X-Onion-Client"]) {
        headers["X-Onion-Client"] =
          "onion-spa";
      }

      if (!headers["X-Client-Version"]) {
        headers["X-Client-Version"] =
          SERVICE_VERSION;
      }

      if (
        cfg.acceptJson !== false &&
        !headers.Accept
      ) {
        headers.Accept =
          "application/json";
      }

      /*
        No se fuerza Content-Type aquí:
        - FormData debe dejar que el browser ponga boundary.
        - Core/request engine decidirán si es JSON.
      */

      return {
        ...cfg,
        headers,
      };
    });

    useResponse((response) => {
      return response;
    });

    useError((error) => {
      return error;
    });

    return true;
  }

  /* =======================================================
     INIT / CONFIG
  ======================================================= */

  function init() {
    if (state.initialized) {
      attachToAppCore();

      safeEmit(
        EVENTS.initSkipped,
        {
          reason:
            "already-initialized",

          version:
            SERVICE_VERSION,
        }
      );

      return api;
    }

    if (state.initializing) {
      attachToAppCore();

      safeEmit(
        EVENTS.initSkipped,
        {
          reason:
            "initializing",

          version:
            SERVICE_VERSION,
        }
      );

      return api;
    }

    state.initializing =
      true;

    try {
      attachToAppCore();
      registerBaseInterceptors();

      state.initialized =
        true;

      safeEmit(
        EVENTS.ready,
        {
          version:
            SERVICE_VERSION,

          bridgeAttached:
            state.bridgeAttached,

          snapshot:
            getHttpSnapshot(),
        }
      );

      return api;
    } finally {
      state.initializing =
        false;
    }
  }

  function configure(patchConfig = {}) {
    const patch =
      safeObject(patchConfig);

    Object.assign(
      config,
      patch
    );

    safeEmit(
      EVENTS.configUpdated,
      {
        config:
          sanitizePayload({
            autoRefreshOn401:
              config.autoRefreshOn401 !== false,

            autoLogoutOn401:
              config.autoLogoutOn401 !== false,

            timeout:
              config.timeout ?? null,

            retries:
              config.retries ?? null,

            retry:
              config.retry ?? null,

            useLoader:
              config.useLoader ?? null,

            apiBase:
              getCoreApiBase(),
          }),
      }
    );

    return getConfig();
  }

  function getConfig() {
    return sanitizePayload({
      ...config,
    });
  }

  /* =======================================================
     SNAPSHOT / DEBUG
  ======================================================= */

  function getHttpSnapshot() {
    return sanitizePayload({
      service:
        SERVICE_NAME,

      version:
        SERVICE_VERSION,

      initialized:
        state.initialized,

      initializing:
        state.initializing,

      bridgeAttached:
        state.bridgeAttached,

      baseInterceptorsRegistered:
        state.baseInterceptorsRegistered,

      pendingRequests:
        state.pendingRequests,

      requestSeq,

      requestCount:
        state.requestCount,

      successCount:
        state.successCount,

      errorCount:
        state.errorCount,

      abortCount:
        state.abortCount,

      refreshAttemptCount:
        state.refreshAttemptCount,

      refreshSuccessCount:
        state.refreshSuccessCount,

      refreshFailureCount:
        state.refreshFailureCount,

      refreshSkippedCount:
        state.refreshSkippedCount,

      refreshInFlight:
        state.refreshInFlight,

      replayCount:
        state.replayCount,

      replaySuccessCount:
        state.replaySuccessCount,

      replayFailureCount:
        state.replayFailureCount,

      autoLogoutCount:
        state.autoLogoutCount,

      autoLogoutSkippedCount:
        state.autoLogoutSkippedCount,

      autoLogoutInFlight:
        state.autoLogoutInFlight,

      lastRequestId:
        state.lastRequestId,

      lastRequestAt:
        state.lastRequestAt,

      lastSuccessAt:
        state.lastSuccessAt,

      lastErrorAt:
        state.lastErrorAt,

      lastRefreshAt:
        state.lastRefreshAt,

      lastRefreshErrorAt:
        state.lastRefreshErrorAt,

      lastReplayAt:
        state.lastReplayAt,

      lastReplayErrorAt:
        state.lastReplayErrorAt,

      lastAutoLogoutAt:
        state.lastAutoLogoutAt,

      lastRuntimeResetAt:
        state.lastRuntimeResetAt,

      lastError:
        state.lastError,

      config: {
        autoRefreshOn401:
          config.autoRefreshOn401 !== false,

        autoLogoutOn401:
          config.autoLogoutOn401 !== false,

        timeout:
          config.timeout ?? null,

        retries:
          config.retries ?? null,

        retry:
          config.retry ?? null,

        useLoader:
          config.useLoader ?? null,

        apiBase:
          getCoreApiBase(),
      },

      bridges: {
        hasAppCoreHttp:
          Boolean(AppCore?.http || AppCore?.Http),

        hasAppCoreApiClient:
          Boolean(AppCore?.apiClient),

        hasAppCoreRequest:
          Boolean(AppCore?.request),

        hasAppCoreModules:
          Boolean(AppCore?.modules),

        hasAuth:
          Boolean(Auth),
      },

      auth: {
        authenticated:
          Boolean(AppCore?.state?.authenticated),

        hasToken:
          Boolean(AppCore?.state?.hasToken),
      },

      endpointPolicy: {
        authMePrivate:
          true,

        publicAuthMarkers:
          PUBLIC_AUTH_ENDPOINT_MARKERS.length,

        skipRefreshMarkers:
          AUTH_CONTROL_SKIP_REFRESH_MARKERS.length,

        technicalPublicSpaPaths:
          TECHNICAL_PUBLIC_SPA_PATHS,
      },

      internals: {
        interceptors:
          getInterceptorsSnapshot?.(interceptors) || null,

        runtime:
          getHttpRuntimeSnapshot?.(state) || null,

        authRuntime:
          getHttpAuthSnapshot?.(state) || null,

        requestEngine:
          getHttpRequestEngineSnapshot?.() || null,
      },

      at:
        isoNow(),
    });
  }

  function resetRuntimeState(options = {}) {
    const opts =
      safeObject(options);

    state.pendingRequests =
      0;

    state.lastError =
      null;

    state.refreshInFlight =
      false;

    state.autoLogoutInFlight =
      false;

    refreshPromise =
      null;

    logoutPromise =
      null;

    state.lastRuntimeResetAt =
      isoNow();

    try {
      resetHttpRuntime?.(
        AppCore,
        state,
        {
          source:
            "http.service:resetRuntimeState",
        }
      );
    } catch {}

    try {
      resetHttpAuthRuntime?.(state);
    } catch {}

    if (opts.resetInterceptors === true) {
      try {
        resetInterceptorsRuntime?.(interceptors);
      } catch {}
    }

    try {
      AppCore?.setLoading?.(false);
    } catch {}

    safeEmit(
      EVENTS.runtimeReset,
      getHttpSnapshot()
    );

    return true;
  }

  function abortController() {
    return createAbortController();
  }

  function abort(controller, reason = "http-abort") {
    return abortRuntimeController(
      controller,
      reason
    );
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    SERVICE_VERSION,
    version:
      SERVICE_VERSION,

    SERVICE_NAME,

    init,

    configure,
    getConfig,

    request,

    get,
    head,

    options:
      optionsMethod,

    post,
    put,
    patch,

    delete:
      del,

    del,

    upload,
    download,
    raw,

    useRequest,
    useResponse,
    useError,

    clearInterceptors:
      clearRegisteredInterceptors,

    resetInterceptorsRuntime() {
      return resetInterceptorsRuntime(
        interceptors
      );
    },

    createAbortController:
      abortController,

    abortController,

    abort,

    withSignal,

    attachToAppCore,

    getHttpSnapshot,

    getSnapshot:
      getHttpSnapshot,

    getDebugSnapshot:
      getHttpSnapshot,

    resetRuntimeState,

    isAuthEndpoint,
    isAuthMeEndpoint,
    isPublicAuthEndpoint,
    isAuthRefreshControlEndpoint,
    isTechnicalPublicSpaEndpoint,
    isPublicEndpoint,
    isPrivateAuthenticatedRequest,

    normalizeEndpointPath,
    normalizePublicRequestConfig,

    redactTokenInText,
    sanitizePayload,
    sanitizeErrorForEvent,
    summarizeResponseForEvent,

    config,
    state,
    events:
      EVENTS,
  };

  return api;
})();

export default Http;

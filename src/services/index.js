/* =========================================================
   Onion SPA - HTTP Service
   Archivo: src/services/index.js

   ONION SUPPORT · HTTP SERVICE
   CORE API CLIENT BRIDGE · AUTH SAFE · RETRY SAFE · LOADER SAFE

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

   HARDENING EXTREMO:
   - init idempotente real
   - interceptores base registrados una sola vez
   - refresh lock para evitar refresh paralelo
   - loader con pendingRequests balanceado
   - eventos consistentes y redactados
   - cero tokens crudos en logs/eventos/snapshots
   - compatible con AppCore congelado mediante accessors/modules
   - sin doble refresh
   - sin doble logout
   - sin lógicas duplicadas
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
} from "./http.helpers.js";

import {
  createInterceptorsState,
  useRequest as registerRequestInterceptor,
  useResponse as registerResponseInterceptor,
  useError as registerErrorInterceptor,
  runRequestInterceptors,
  runResponseInterceptors,
  runErrorInterceptors,
} from "./http.interceptors.js";

import {
  incrementPendingRequests,
  decrementPendingRequests,
  createAbortController,
} from "./http.runtime.js";

import {
  runAutoRefreshIfNeeded,
} from "./http.auth.js";

import {
  executeBaseRequest,
  executeWithRetry,
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
    "12.0.0";

  const SERVICE_NAME =
    "http";

  const LOG_PREFIX =
    "[Http]";

  const EVENTS =
    Object.freeze({
      ready:
        "http:ready",

      bridgeAttached:
        "http:bridge:attached",

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

      autoLogoutStart:
        "http:auto-logout:start",

      autoLogoutSuccess:
        "http:auto-logout:success",

      autoLogoutError:
        "http:auto-logout:error",

      runtimeReset:
        "http:runtime:reset",
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
    ]);

  const AUTH_ENDPOINT_MARKERS =
    Object.freeze([
      "/auth/login",
      "/auth/logout",
      "/auth/refresh",
      "/auth/me",
      "/auth/session",

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

      "/auth/2fa/login",
      "/auth/_health",
    ]);

  const PUBLIC_AUTH_ENDPOINT_MARKERS =
    Object.freeze([
      "/auth/login",
      "/auth/refresh",

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

      "/auth/2fa/login",
      "/auth/_health",
    ]);

  const TECHNICAL_PUBLIC_SPA_PATHS =
    Object.freeze([
      "/activate-account",
      "/reset-password",
      "/forgot-password",
      "/reset-password/confirm",
    ]);

  const DEFAULT_REQUEST_TIMEOUT_MS =
    0;

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

    refreshAttemptCount:
      0,

    refreshSuccessCount:
      0,

    refreshFailureCount:
      0,

    refreshInFlight:
      false,

    autoLogoutCount:
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

    lastAutoLogoutAt:
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

  function sanitizePayload(value, depth = 0) {
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
          safeText(value.className, ""),
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
      };
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 80)
        .map((item) =>
          sanitizePayload(item, depth + 1)
        );
    }

    if (isObject(value)) {
      const output = {};

      for (const [key, item] of Object.entries(value)) {
        if (
          /token|secret|password|authorization|credential/i.test(key)
        ) {
          output[key] =
            item ? "***" : item;

          continue;
        }

        output[key] =
          sanitizePayload(item, depth + 1);
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
      );
    } catch {}

    return safeLower(
      raw
        .split("?")[0]
        .split("#")[0] ||
        raw
    );
  }

  function endpointIncludes(path = "", markers = []) {
    const normalized =
      normalizeEndpointPath(path);

    if (!normalized) {
      return false;
    }

    return safeArray(markers).some((marker) => {
      const cleanMarker =
        safeLower(marker, "");

      return (
        cleanMarker &&
        normalized.includes(cleanMarker)
      );
    });
  }

  function isAuthEndpoint(path = "") {
    return endpointIncludes(
      path,
      AUTH_ENDPOINT_MARKERS
    );
  }

  function isPublicAuthEndpoint(path = "") {
    return endpointIncludes(
      path,
      PUBLIC_AUTH_ENDPOINT_MARKERS
    );
  }

  function isTechnicalPublicSpaEndpoint(path = "") {
    const normalized =
      normalizeEndpointPath(path);

    if (!normalized) {
      return false;
    }

    return TECHNICAL_PUBLIC_SPA_PATHS.some((publicPath) => {
      const clean =
        safeLower(publicPath, "");

      return (
        normalized === clean ||
        normalized.startsWith(`${clean}/`)
      );
    });
  }

  function isPublicEndpoint(path = "") {
    return (
      isPublicAuthEndpoint(path) ||
      isTechnicalPublicSpaEndpoint(path)
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
      cfg.auth === false;

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

      _skipAuthRefresh:
        true,
    };
  }

  function isPrivateAuthenticatedRequest(requestConfig = {}) {
    const cfg =
      safeObject(requestConfig);

    if (cfg.auth === false) {
      return false;
    }

    if (cfg.public === true) {
      return false;
    }

    if (isAuthEndpoint(cfg.path || cfg.url || "")) {
      return false;
    }

    if (isTechnicalPublicSpaEndpoint(cfg.path || cfg.url || "")) {
      return false;
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

  function attachToAppCore() {
    if (state.bridgeAttached) {
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

  function useRequest(fn) {
    return registerRequestInterceptor(
      interceptors,
      fn
    );
  }

  function useResponse(fn) {
    return registerResponseInterceptor(
      interceptors,
      fn
    );
  }

  function useError(fn) {
    return registerErrorInterceptor(
      interceptors,
      fn
    );
  }

  /* =======================================================
     LOADER
  ======================================================= */

  function startLoaderIfNeeded(loaderEnabled = false, requestId = "") {
    if (!loaderEnabled) {
      return false;
    }

    try {
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
      state.pendingRequests += 1;
    }

    if (state.pendingRequests <= 1) {
      try {
        AppCore?.setLoading?.(true);
      } catch {}
    }

    return true;
  }

  function stopLoaderIfNeeded(loaderEnabled = false, requestId = "") {
    if (!loaderEnabled) {
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

    if (pending <= 0) {
      state.pendingRequests =
        0;

      try {
        AppCore?.setLoading?.(false);
      } catch {}
    }

    return state.pendingRequests;
  }

  /* =======================================================
     REQUEST CONFIG
  ======================================================= */

  function buildServiceRequestConfig(method = "GET", path = "", options = {}) {
    const opts =
      safeObject(options);

    const requestId =
      opts.requestId ||
      nextRequestId();

    const timeout =
      opts.timeout ??
      config.timeout ??
      DEFAULT_REQUEST_TIMEOUT_MS;

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

    return normalizePublicRequestConfig({
      ...base,

      requestId,

      method:
        safeText(base?.method || method, "GET")
          .toUpperCase(),

      path:
        base?.path || path,

      timeout,
    });
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
      requestConfig.requestId ||
      options?.requestId ||
      nextRequestId();

    requestConfig.method =
      safeText(
        requestConfig.method || method,
        "GET"
      ).toUpperCase();

    requestConfig.path =
      requestConfig.path || path;

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

    try {
      const response =
        await executeBaseRequest(
          AppCore,
          replayConfig
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

  async function request(method = "GET", path = "", options = {}) {
    init();

    const startedAt =
      nowMs();

    state.requestCount += 1;
    state.lastRequestAt =
      isoNow(startedAt);

    let requestConfig =
      null;

    let loaderEnabled =
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
            interceptedResponse,
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
              interceptedResponse,
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
        loaderEnabled,
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

  function del(path, options = {}) {
    return request(
      "DELETE",
      path,
      options
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

  function raw(method = "GET", path = "", options = {}) {
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

      if (
        cfg.acceptJson !== false &&
        !headers.Accept
      ) {
        headers.Accept =
          "application/json";
      }

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
     INIT
  ======================================================= */

  function init() {
    if (state.initialized) {
      attachToAppCore();
      return api;
    }

    if (state.initializing) {
      attachToAppCore();
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

      requestCount:
        state.requestCount,

      successCount:
        state.successCount,

      errorCount:
        state.errorCount,

      refreshAttemptCount:
        state.refreshAttemptCount,

      refreshSuccessCount:
        state.refreshSuccessCount,

      refreshFailureCount:
        state.refreshFailureCount,

      refreshInFlight:
        state.refreshInFlight,

      autoLogoutCount:
        state.autoLogoutCount,

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

      lastAutoLogoutAt:
        state.lastAutoLogoutAt,

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

      at:
        isoNow(),
    });
  }

  function resetRuntimeState() {
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

    try {
      AppCore?.setLoading?.(false);
    } catch {}

    safeEmit(
      EVENTS.runtimeReset,
      getHttpSnapshot()
    );

    return true;
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
    SERVICE_VERSION,
    version:
      SERVICE_VERSION,

    init,

    request,

    get,
    head,
    post,
    put,
    patch,

    delete:
      del,

    del,

    upload,
    raw,

    useRequest,
    useResponse,
    useError,

    createAbortController,
    withSignal,

    attachToAppCore,

    getHttpSnapshot,

    getSnapshot:
      getHttpSnapshot,

    getDebugSnapshot:
      getHttpSnapshot,

    resetRuntimeState,

    isAuthEndpoint,
    isPublicAuthEndpoint,
    isTechnicalPublicSpaEndpoint,
    isPublicEndpoint,

    normalizeEndpointPath,
    normalizePublicRequestConfig,

    config,
    state,
  };

  return api;
})();

export default Http;

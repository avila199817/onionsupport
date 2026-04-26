/* =========================================================
   Onion SPA - HTTP Service (FULL PRO SAAS PANEL)
   Archivo: src/services/index.js

   Encima de AppCore.apiClient:
   - interceptores request / response / error
   - retry policy robusta
   - refresh automático en 401
   - logout automático si refresh falla
   - control de loader global
   - errores normalizados
   - soporte signal / abort
   - helpers REST
   - bridge público estable vía AppCore.http / AppCore.Http

   HARDENING EXTREMO:
   - init idempotente real
   - no doble refresh paralelo
   - no doble loader
   - no auto logout en endpoints auth
   - no refresh automático en endpoints públicos auth
   - activation-account tratado como endpoint público
   - reset-password confirm tratado como endpoint público
   - eventos consistentes
   - rutas/logs sin tokens reales
   - bridge tolerante si AppCore está congelado
   - interceptores base registrados una sola vez
   - snapshot enterprise
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

  let requestSeq =
    0;

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
    pendingRequests:
      0,

    initialized:
      false,

    initializing:
      false,

    bridgeAttached:
      false,

    baseInterceptorsRegistered:
      false,

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

    autoLogoutCount:
      0,

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
  };

  /* =======================================================
     INTERCEPTORS
  ======================================================= */

  const interceptors =
    createInterceptorsState();

  /* =======================================================
     SAFE HELPERS
  ======================================================= */

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

  function safeLower(value = "") {
    return safeText(value, "")
      .toLowerCase();
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

  function nowMs() {
    return Date.now();
  }

  function isoNow() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function nextRequestId() {
    requestSeq += 1;
    return `http_service_${requestSeq}`;
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        eventName,
        payload
      );

      return true;
    } catch {}

    return false;
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        "[Http]",
        ...args
      );
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(
        "[Http]",
        ...args
      );
    } catch {
      try {
        console.warn(
          "[Http]",
          ...args
        );
      } catch {}
    }
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(
        "[Http]",
        ...args
      );
    } catch {
      try {
        console.error(
          "[Http]",
          ...args
        );
      } catch {}
    }
  }

  function safeRedact(value = "") {
    const raw =
      safeText(value, "");

    if (!raw) {
      return "";
    }

    let output =
      raw;

    try {
      output = output.replace(
        /([?&](?:token|activationToken|activateToken|resetToken|passwordResetToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

      output = output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
    } catch {}

    return output;
  }

  function sanitizeErrorForEvent(error = null) {
    if (!error) {
      return null;
    }

    return {
      ...error,

      url:
        safeRedact(error.url || ""),

      redactedUrl:
        safeRedact(error.redactedUrl || error.url || ""),

      token:
        null,

      raw:
        error.raw instanceof Error
          ? {
              name:
                error.raw.name,
              message:
                error.raw.message,
            }
          : error.raw,
    };
  }

  function sanitizeRequestConfigForEvent(requestConfig = {}) {
    const cfg =
      safeObject(requestConfig);

    return {
      requestId:
        cfg.requestId || "",

      method:
        cfg.method || "",

      path:
        safeRedact(cfg.path || ""),

      query:
        cfg.query || null,

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

      authRefreshFailed:
        cfg._authRefreshFailed === true,
    };
  }

  /* =======================================================
     ENDPOINT HELPERS
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
          typeof window !== "undefined" &&
            window.location?.origin
            ? window.location.origin
            : "http://localhost"
        );

      return safeLower(
        parsed.pathname || raw
      );
    } catch {
      return safeLower(
        raw.split("?")[0].split("#")[0] || raw
      );
    }
  }

  function isAuthEndpoint(path = "") {
    const normalized =
      normalizeEndpointPath(path);

    return (
      normalized.includes("/auth/login") ||
      normalized.includes("/auth/logout") ||
      normalized.includes("/auth/refresh") ||
      normalized.includes("/auth/me") ||
      normalized.includes("/auth/session") ||

      normalized.includes("/auth/activate") ||
      normalized.includes("/auth/activate-account") ||
      normalized.includes("/auth/account/activate") ||
      normalized.includes("/auth/activation") ||
      normalized.includes("/auth/activate/first-user") ||

      normalized.includes("/auth/reset-password") ||
      normalized.includes("/auth/reset-password-request") ||
      normalized.includes("/auth/reset-password-confirm") ||
      normalized.includes("/auth/password-reset") ||
      normalized.includes("/auth/forgot-password") ||
      normalized.includes("/auth/recover-password") ||

      normalized.includes("/auth/2fa/login")
    );
  }

  function isPublicAuthEndpoint(path = "") {
    const normalized =
      normalizeEndpointPath(path);

    return (
      normalized.includes("/auth/login") ||
      normalized.includes("/auth/refresh") ||

      normalized.includes("/auth/activate") ||
      normalized.includes("/auth/activate-account") ||
      normalized.includes("/auth/account/activate") ||
      normalized.includes("/auth/activation") ||
      normalized.includes("/auth/activate/first-user") ||

      normalized.includes("/auth/reset-password") ||
      normalized.includes("/auth/reset-password-request") ||
      normalized.includes("/auth/reset-password-confirm") ||
      normalized.includes("/auth/password-reset") ||
      normalized.includes("/auth/forgot-password") ||
      normalized.includes("/auth/recover-password") ||

      normalized.includes("/auth/2fa/login") ||
      normalized.includes("/auth/_health")
    );
  }

  function isTechnicalPublicSpaEndpoint(path = "") {
    const normalized =
      normalizeEndpointPath(path);

    return (
      normalized === "/activate-account" ||
      normalized.startsWith("/activate-account/") ||
      normalized === "/reset-password" ||
      normalized === "/forgot-password" ||
      normalized === "/reset-password/confirm" ||
      normalized.startsWith("/reset-password/confirm/")
    );
  }

  function shouldAttemptAuthRefresh(error, requestConfig = {}) {
    if (!config.autoRefreshOn401) {
      return false;
    }

    if (error?.status !== 401) {
      return false;
    }

    if (requestConfig?._skipAuthRefresh === true) {
      return false;
    }

    if (requestConfig?._authRefreshAttempted === true) {
      return false;
    }

    if (requestConfig?.auth === false) {
      return false;
    }

    if (requestConfig?.public === true) {
      return false;
    }

    if (isAuthEndpoint(requestConfig?.path)) {
      return false;
    }

    if (isTechnicalPublicSpaEndpoint(requestConfig?.path)) {
      return false;
    }

    return true;
  }

  function shouldAutoLogout(error, requestConfig = {}) {
    if (!config.autoLogoutOn401) {
      return false;
    }

    if (error?.status !== 401) {
      return false;
    }

    if (requestConfig?.auth === false) {
      return false;
    }

    if (requestConfig?.public === true) {
      return false;
    }

    if (isAuthEndpoint(requestConfig?.path)) {
      return false;
    }

    if (isTechnicalPublicSpaEndpoint(requestConfig?.path)) {
      return false;
    }

    /*
      Logout automático solo si:
      - ya se intentó refresh y falló, o
      - el caller marcó skipAuthRefresh explícito después de refresh.
    */
    if (
      requestConfig?._authRefreshFailed === true ||
      requestConfig?._skipAuthRefresh === true
    ) {
      try {
        return Boolean(
          Auth?.isAuthenticated?.() ||
          AppCore?.state?.authenticated
        );
      } catch {
        return Boolean(AppCore?.state?.authenticated);
      }
    }

    return false;
  }

  function normalizePublicRequestConfig(requestConfig = {}) {
    const cfg =
      safeObject(requestConfig);

    const publicByFlag =
      cfg.public === true ||
      cfg.auth === false;

    const publicByAuthEndpoint =
      isPublicAuthEndpoint(cfg.path);

    const publicByTechnicalSpaEndpoint =
      isTechnicalPublicSpaEndpoint(cfg.path);

    if (
      !publicByFlag &&
      !publicByAuthEndpoint &&
      !publicByTechnicalSpaEndpoint
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

  /* =======================================================
     BRIDGE APPCORE
  ======================================================= */

  function attachToAppCore() {
    if (state.bridgeAttached) {
      return true;
    }

    try {
      AppCore.http =
        api;
    } catch {}

    try {
      AppCore.Http =
        api;
    } catch {}

    try {
      if (
        !AppCore.services ||
        typeof AppCore.services !== "object"
      ) {
        AppCore.services = {};
      }

      AppCore.services.http =
        api;

      AppCore.services.Http =
        api;
    } catch {}

    try {
      if (
        AppCore.modules &&
        isFunction(AppCore.modules.register)
      ) {
        AppCore.modules.register(
          "http",
          api,
          {
            aliases:
              [
                "Http",
                "HTTP",
                "httpService",
              ],
            overwrite:
              true,
          }
        );
      }
    } catch {
      try {
        AppCore.modules?.register?.(
          "Http",
          api
        );
      } catch {}

      try {
        AppCore.modules?.register?.(
          "http",
          api
        );
      } catch {}
    }

    state.bridgeAttached =
      true;

    safeEmit(
      "http:bridge:attached",
      {
        hasAppCoreHttp:
          Boolean(AppCore?.http),

        hasAppCoreServicesHttp:
          Boolean(AppCore?.services?.http),

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
     LOADER HELPERS
  ======================================================= */

  function startLoaderIfNeeded(loaderEnabled, requestId) {
    if (!loaderEnabled) {
      return false;
    }

    incrementPendingRequests(
      AppCore,
      state,
      {
        source:
          "http.service:request:start",

        requestId,
      }
    );

    if (state.pendingRequests === 1) {
      try {
        AppCore.setLoading(true);
      } catch {}
    }

    return true;
  }

  function stopLoaderIfNeeded(loaderEnabled, requestId) {
    if (!loaderEnabled) {
      return 0;
    }

    const pending =
      decrementPendingRequests(
        AppCore,
        state,
        {
          source:
            "http.service:request:finalize",

          requestId,
        }
      );

    if (pending <= 0) {
      try {
        AppCore.setLoading(false);
      } catch {}
    }

    return pending;
  }

  /* =======================================================
     CORE REQUEST
  ======================================================= */

  async function request(method, path, options = {}) {
    attachToAppCore();

    const requestId =
      options?.requestId ||
      nextRequestId();

    const startedAt =
      nowMs();

    state.requestCount += 1;
    state.lastRequestId =
      requestId;
    state.lastRequestAt =
      isoNow();

    let requestConfig =
      buildDefaultRequestConfig(
        config,
        AppCore,
        method,
        path,
        {
          ...safeObject(options),
          requestId,

          signal:
            withSignal(
              options?.signal
            ),
        }
      );

    requestConfig =
      normalizePublicRequestConfig(
        requestConfig
      );

    let loaderEnabled =
      false;

    try {
      /* =====================
         REQUEST INTERCEPTORS
      ===================== */

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
        requestId;

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
              safeRedact(requestConfig.path),
          }
        );
      }

      startLoaderIfNeeded(
        loaderEnabled,
        requestId
      );

      safeEmit(
        "http:request:start",
        sanitizeRequestConfigForEvent({
          ...requestConfig,
          useLoader:
            loaderEnabled,
        })
      );

      /* =====================
         EXECUTE + AUTH REFRESH
      ===================== */

      let result =
        null;

      try {
        result =
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

        const canRefresh =
          shouldAttemptAuthRefresh(
            normalizedInitialError,
            requestConfig
          );

        let refreshed =
          false;

        if (canRefresh) {
          state.refreshAttemptCount += 1;

          safeEmit(
            "http:auth-refresh:start",
            {
              requestId,
              method:
                requestConfig.method,
              path:
                safeRedact(requestConfig.path),
              status:
                normalizedInitialError.status,
            }
          );

          try {
            refreshed =
              await runAutoRefreshIfNeeded({
                AppCore,
                Auth,
                config,
                state,
                error:
                  normalizedInitialError,
                requestConfig,
              });
          } catch (refreshError) {
            refreshed =
              false;

            safeWarn(
              "Refresh automático lanzó error.",
              refreshError
            );
          }

          if (refreshed) {
            state.refreshSuccessCount += 1;

            safeEmit(
              "http:auth-refresh:success",
              {
                requestId,
                path:
                  safeRedact(requestConfig.path),
              }
            );
          } else {
            state.refreshFailureCount += 1;

            requestConfig = {
              ...requestConfig,
              _authRefreshAttempted:
                true,
              _authRefreshFailed:
                true,
              _skipAuthRefresh:
                true,
            };

            safeEmit(
              "http:auth-refresh:error",
              {
                requestId,
                path:
                  safeRedact(requestConfig.path),
                error:
                  sanitizeErrorForEvent(
                    normalizedInitialError
                  ),
              }
            );
          }
        }

        if (refreshed) {
          const retryConfig =
            normalizePublicRequestConfig({
              ...requestConfig,

              _skipRetry:
                true,

              _skipAuthRefresh:
                true,

              _authRefreshAttempted:
                true,

              requestId,
            });

          result =
            await executeBaseRequest(
              AppCore,
              retryConfig
            );
        } else {
          throw normalizedInitialError;
        }
      }

      /* =====================
         RESPONSE INTERCEPTORS
      ===================== */

      const response =
        await runResponseInterceptors(
          interceptors,
          result,
          requestConfig
        );

      state.successCount += 1;
      state.lastSuccessAt =
        isoNow();

      safeEmit(
        "http:request:success",
        {
          requestId,

          method:
            requestConfig.method,

          path:
            safeRedact(requestConfig.path),

          response,

          durationMs:
            nowMs() - startedAt,
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
            requestId,

            method:
              requestConfig.method,

            path:
              safeRedact(requestConfig.path),

            durationMs:
              nowMs() - startedAt,

            response,
          }
        );
      }

      return response;
    } catch (error) {
      const normalized =
        normalizeError(
          error,
          requestConfig
        );

      const interceptedError =
        await runErrorInterceptors(
          interceptors,
          normalized,
          requestConfig
        );

      const finalError =
        interceptedError !== undefined
          ? interceptedError
          : normalized;

      state.errorCount += 1;
      state.lastErrorAt =
        isoNow();
      state.lastError =
        sanitizeErrorForEvent(
          finalError
        );

      safeEmit(
        "http:request:error",
        {
          requestId,

          method:
            requestConfig?.method || method,

          path:
            safeRedact(
              requestConfig?.path || path
            ),

          error:
            sanitizeErrorForEvent(
              finalError
            ),

          durationMs:
            nowMs() - startedAt,
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

      /* =====================
         AUTO LOGOUT
      ===================== */

      if (
        shouldAutoLogout(
          finalError,
          requestConfig
        )
      ) {
        state.autoLogoutCount += 1;

        safeWarn(
          "401 persistente tras refresh → logout automático."
        );

        safeEmit(
          "http:auto-logout:start",
          {
            requestId,
            path:
              safeRedact(requestConfig?.path || path),
          }
        );

        try {
          await Auth.logout({
            silent:
              false,

            notifyServer:
              false,

            reason:
              "http-401-refresh-failed",
          });
        } catch (logoutError) {
          safeWarn(
            "Logout automático falló.",
            logoutError
          );

          safeEmit(
            "http:auto-logout:error",
            {
              requestId,
              error:
                sanitizeErrorForEvent(logoutError),
            }
          );
        }
      }

      throw finalError;
    } finally {
      stopLoaderIfNeeded(
        loaderEnabled,
        requestId
      );

      safeEmit(
        "http:request:finalize",
        {
          requestId,

          method:
            requestConfig?.method || method,

          path:
            safeRedact(
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
      }
    );
  }

  function raw(method, path, options = {}) {
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
     DEFAULT INTERCEPTORS
  ======================================================= */

  function registerBaseInterceptors() {
    if (state.baseInterceptorsRegistered) {
      return true;
    }

    state.baseInterceptorsRegistered =
      true;

    /* =====================
       REQUEST INTERCEPTOR
    ===================== */

    useRequest((requestConfig) => {
      const normalizedConfig =
        normalizePublicRequestConfig(
          requestConfig
        );

      const next = {
        ...normalizedConfig,

        headers: {
          ...(normalizedConfig.headers || {}),
          "X-Requested-With":
            "XMLHttpRequest",
        },
      };

      if (AppCore?.config?.debug) {
        safeLog(
          "HTTP request config",
          {
            ...buildRequestSummary(next),
            path:
              safeRedact(next.path),
          }
        );
      }

      return next;
    });

    /* =====================
       RESPONSE INTERCEPTOR
    ===================== */

    useResponse((response, requestConfig) => {
      if (AppCore?.config?.debug) {
        safeLog(
          "HTTP response interceptada",
          {
            method:
              requestConfig?.method || null,

            path:
              safeRedact(requestConfig?.path || ""),

            response,
          }
        );
      }

      return response;
    });

    /* =====================
       ERROR INTERCEPTOR
    ===================== */

    useError((error, requestConfig) => {
      safeError(
        "HTTP error interceptado",
        {
          method:
            requestConfig?.method || null,

          path:
            safeRedact(requestConfig?.path || ""),

          public:
            requestConfig?.public === true,

          auth:
            requestConfig?.auth !== false,

          error:
            sanitizeErrorForEvent(error),
        }
      );

      return error;
    });

    return true;
  }

  /* =======================================================
     INIT
  ======================================================= */

  function init() {
    attachToAppCore();

    if (state.initialized) {
      return api;
    }

    if (state.initializing) {
      return api;
    }

    state.initializing =
      true;

    try {
      registerBaseInterceptors();

      state.initialized =
        true;

      safeEmit(
        "http:ready",
        {
          config: {
            ...config,
          },

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
     DEBUG
  ======================================================= */

  function getHttpSnapshot() {
    return {
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

      autoLogoutCount:
        state.autoLogoutCount,

      lastRequestId:
        state.lastRequestId,

      lastRequestAt:
        state.lastRequestAt,

      lastSuccessAt:
        state.lastSuccessAt,

      lastErrorAt:
        state.lastErrorAt,

      lastError:
        state.lastError,

      config: {
        ...config,
      },

      hasAppCoreHttp:
        Boolean(AppCore?.http),

      hasAppCoreServicesHttp:
        Boolean(AppCore?.services?.http),

      hasAppCoreApiClient:
        Boolean(AppCore?.apiClient),

      hasAuth:
        Boolean(Auth),

      authenticated:
        Boolean(AppCore?.state?.authenticated),
    };
  }

  function resetRuntimeState() {
    state.pendingRequests =
      0;

    state.lastError =
      null;

    try {
      AppCore?.setLoading?.(false);
    } catch {}

    safeEmit(
      "http:runtime:reset",
      getHttpSnapshot()
    );

    return true;
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api = {
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

    resetRuntimeState,

    config,
    state,
  };

  return api;
})();

export default Http;

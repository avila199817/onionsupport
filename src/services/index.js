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

   HARDENING:
   - init idempotente
   - no doble refresh paralelo
   - no doble loader
   - no auto logout en endpoints auth
   - no refresh automático en endpoints públicos auth
   - activation-account tratado como endpoint público
   - eventos consistentes
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

export const Http = (() => {
  "use strict";

  let requestSeq = 0;

  /* =========================================================
     CONFIG
  ========================================================= */

  const config = {
    ...HTTP_CONFIG,
  };

  /* =========================================================
     STATE
  ========================================================= */

  const state = {
    pendingRequests: 0,
    initialized: false,
    bridgeAttached: false,
  };

  /* =========================================================
     INTERCEPTORS
  ========================================================= */

  const interceptors = createInterceptorsState();

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function safeLower(value = "") {
    return safeText(value, "").toLowerCase();
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function nowMs() {
    return Date.now();
  }

  function nextRequestId() {
    requestSeq += 1;
    return `http_service_${requestSeq}`;
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(eventName, payload);
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.(...args);
    } catch {
      try {
        console.warn(...args);
      } catch {}
    }
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.(...args);
    } catch {
      try {
        console.error(...args);
      } catch {}
    }
  }

  /* =========================================================
     ENDPOINT HELPERS
  ========================================================= */

  function normalizeEndpointPath(path = "") {
    const raw = safeText(path, "");

    if (!raw) {
      return "";
    }

    try {
      const parsed = new URL(
        raw,
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "http://localhost"
      );

      return safeLower(parsed.pathname || raw);
    } catch {
      return safeLower(raw.split("?")[0] || raw);
    }
  }

  function isAuthEndpoint(path = "") {
    const normalized = normalizeEndpointPath(path);

    return (
      normalized.includes("/auth/login") ||
      normalized.includes("/auth/logout") ||
      normalized.includes("/auth/refresh") ||
      normalized.includes("/auth/me") ||

      normalized.includes("/auth/activate-account") ||
      normalized.includes("/auth/account/activate") ||
      normalized.includes("/auth/activation") ||

      normalized.includes("/auth/reset-password") ||
      normalized.includes("/auth/reset-password-request") ||
      normalized.includes("/auth/reset-password-confirm") ||
      normalized.includes("/auth/password-reset") ||
      normalized.includes("/auth/forgot-password") ||
      normalized.includes("/auth/recover-password")
    );
  }

  function isPublicAuthEndpoint(path = "") {
    const normalized = normalizeEndpointPath(path);

    return (
      normalized.includes("/auth/login") ||
      normalized.includes("/auth/refresh") ||

      normalized.includes("/auth/activate-account") ||
      normalized.includes("/auth/account/activate") ||
      normalized.includes("/auth/activation") ||

      normalized.includes("/auth/reset-password") ||
      normalized.includes("/auth/reset-password-request") ||
      normalized.includes("/auth/reset-password-confirm") ||
      normalized.includes("/auth/password-reset") ||
      normalized.includes("/auth/forgot-password") ||
      normalized.includes("/auth/recover-password")
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

    if (requestConfig?.auth === false) {
      return false;
    }

    if (requestConfig?.public === true) {
      return false;
    }

    if (isAuthEndpoint(requestConfig?.path)) {
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

    if (!Auth?.isAuthenticated?.()) {
      return false;
    }

    if (requestConfig?._skipAuthRefresh !== true) {
      return false;
    }

    if (isAuthEndpoint(requestConfig?.path)) {
      return false;
    }

    return true;
  }

  function normalizePublicRequestConfig(requestConfig = {}) {
    const publicByFlag =
      requestConfig?.public === true ||
      requestConfig?.auth === false;

    const publicByEndpoint =
      isPublicAuthEndpoint(requestConfig?.path);

    if (!publicByFlag && !publicByEndpoint) {
      return requestConfig;
    }

    return {
      ...requestConfig,
      auth: false,
      public: true,
      _skipAuthRefresh: true,
    };
  }

  /* =========================================================
     BRIDGE APPCORE
  ========================================================= */

  function attachToAppCore() {
    if (state.bridgeAttached) {
      return true;
    }

    try {
      AppCore.http = api;
    } catch {}

    try {
      AppCore.Http = api;
    } catch {}

    try {
      if (!AppCore.services || typeof AppCore.services !== "object") {
        AppCore.services = {};
      }

      AppCore.services.http = api;
      AppCore.services.Http = api;
    } catch {}

    try {
      if (
        AppCore.modules &&
        typeof AppCore.modules.register === "function"
      ) {
        AppCore.modules.register("Http", api);
        AppCore.modules.register("http", api);
      } else if (
        AppCore.modules &&
        typeof AppCore.modules === "object"
      ) {
        AppCore.modules.Http = api;
        AppCore.modules.http = api;
      }
    } catch {}

    state.bridgeAttached = true;

    safeEmit("http:bridge:attached", {
      hasAppCoreHttp: Boolean(AppCore?.http),
      hasAppCoreServicesHttp: Boolean(AppCore?.services?.http),
      hasAppCoreModules: Boolean(AppCore?.modules),
    });

    return true;
  }

  /* =========================================================
     INTERCEPTOR API
  ========================================================= */

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

  /* =========================================================
     CORE REQUEST
  ========================================================= */

  async function request(
    method,
    path,
    options = {}
  ) {
    attachToAppCore();

    const requestId =
      options?.requestId ||
      nextRequestId();

    const startedAt = nowMs();

    let requestConfig = buildDefaultRequestConfig(
      config,
      AppCore,
      method,
      path,
      {
        ...options,
        requestId,
        signal: withSignal(
          options?.signal
        ),
      }
    );

    requestConfig = normalizePublicRequestConfig(requestConfig);

    let loaderEnabled = false;

    try {
      /* =====================
         REQUEST INTERCEPTORS
      ===================== */

      requestConfig = await runRequestInterceptors(
        interceptors,
        requestConfig
      );

      requestConfig = normalizePublicRequestConfig(requestConfig);

      loaderEnabled = shouldToggleGlobalLoader(
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
          buildRequestSummary(
            requestConfig
          )
        );
      }

      if (loaderEnabled) {
        incrementPendingRequests(
          AppCore,
          state,
          {
            source: "http.service:request:start",
            requestId,
          }
        );

        if (state.pendingRequests === 1) {
          try {
            AppCore.setLoading(true);
          } catch {}
        }
      }

      safeEmit(
        "http:request:start",
        {
          requestId,
          method: requestConfig.method,
          path: requestConfig.path,
          query: requestConfig.query || null,
          auth: requestConfig.auth !== false,
          public: requestConfig.public === true,
          useLoader: loaderEnabled,
        }
      );

      /* =====================
         EXECUTE
      ===================== */

      let result = null;

      try {
        result = await executeWithRetry({
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

        const refreshed =
          shouldAttemptAuthRefresh(
            normalizedInitialError,
            requestConfig
          )
            ? await runAutoRefreshIfNeeded({
                AppCore,
                Auth,
                config,
                state,
                error: normalizedInitialError,
                requestConfig,
              })
            : false;

        if (refreshed) {
          const retryConfig = normalizePublicRequestConfig({
            ...requestConfig,
            _skipRetry: true,
            _skipAuthRefresh: true,
            _authRefreshAttempted: true,
            requestId,
          });

          result = await executeBaseRequest(
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

      safeEmit(
        "http:request:success",
        {
          requestId,
          method: requestConfig.method,
          path: requestConfig.path,
          response,
          durationMs: nowMs() - startedAt,
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
            method: requestConfig.method,
            path: requestConfig.path,
            durationMs: nowMs() - startedAt,
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

      safeEmit(
        "http:request:error",
        {
          requestId,
          method: requestConfig?.method || method,
          path: requestConfig?.path || path,
          error: finalError,
          durationMs: nowMs() - startedAt,
        }
      );

      if (
        shouldLogErrors(
          config
        )
      ) {
        safeError(
          "HTTP ✗",
          finalError
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
        safeWarn(
          "401 persistente → logout automático"
        );

        try {
          await Auth.logout({
            silent: false,
            notifyServer: false,
          });
        } catch (logoutError) {
          safeWarn(
            "Logout automático falló.",
            logoutError
          );
        }
      }

      throw finalError;
    } finally {
      if (loaderEnabled) {
        const pending =
          decrementPendingRequests(
            AppCore,
            state,
            {
              source: "http.service:request:finalize",
              requestId,
            }
          );

        if (pending <= 0) {
          try {
            AppCore.setLoading(false);
          } catch {}
        }
      }
    }
  }

  /* =========================================================
     REST METHODS
  ========================================================= */

  function get(
    path,
    options = {}
  ) {
    return request(
      "GET",
      path,
      options
    );
  }

  function post(
    path,
    body = null,
    options = {}
  ) {
    return request(
      "POST",
      path,
      {
        ...options,
        body,
      }
    );
  }

  function put(
    path,
    body = null,
    options = {}
  ) {
    return request(
      "PUT",
      path,
      {
        ...options,
        body,
      }
    );
  }

  function patch(
    path,
    body = null,
    options = {}
  ) {
    return request(
      "PATCH",
      path,
      {
        ...options,
        body,
      }
    );
  }

  function del(
    path,
    options = {}
  ) {
    return request(
      "DELETE",
      path,
      options
    );
  }

  /* =========================================================
     INIT
  ========================================================= */

  function init() {
    attachToAppCore();

    if (state.initialized) {
      return api;
    }

    state.initialized = true;

    /* =====================
       REQUEST INTERCEPTOR
    ===================== */

    useRequest((requestConfig) => {
      const normalizedConfig =
        normalizePublicRequestConfig(requestConfig);

      const next = {
        ...normalizedConfig,
        headers: {
          ...(normalizedConfig.headers || {}),
          "X-Requested-With": "XMLHttpRequest",
        },
      };

      if (AppCore?.config?.debug) {
        safeLog(
          "HTTP request config",
          buildRequestSummary(next)
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
            method: requestConfig?.method || null,
            path: requestConfig?.path || null,
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
          method: requestConfig?.method || null,
          path: requestConfig?.path || null,
          public: requestConfig?.public === true,
          auth: requestConfig?.auth !== false,
          error,
        }
      );

      return error;
    });

    safeEmit(
      "http:ready",
      {
        config: {
          ...config,
        },
        bridgeAttached: state.bridgeAttached,
      }
    );

    return api;
  }

  /* =========================================================
     DEBUG
  ========================================================= */

  function getHttpSnapshot() {
    return {
      initialized: state.initialized,
      bridgeAttached: state.bridgeAttached,
      pendingRequests: state.pendingRequests,
      config: {
        ...config,
      },
      hasAppCoreHttp: Boolean(AppCore?.http),
      hasAppCoreServicesHttp: Boolean(AppCore?.services?.http),
      hasAppCoreApiClient: Boolean(AppCore?.apiClient),
    };
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api = {
    init,

    request,
    get,
    post,
    put,
    patch,
    delete: del,

    useRequest,
    useResponse,
    useError,

    createAbortController,
    withSignal,

    attachToAppCore,
    getHttpSnapshot,

    config,
    state,
  };

  return api;
})();

export default Http;

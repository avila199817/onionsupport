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
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";

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

import { runAutoRefreshIfNeeded } from "./http.auth.js";

import {
  executeBaseRequest,
  executeWithRetry,
} from "./http.request.js";

export const Http = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const config = {
    ...HTTP_CONFIG,
  };

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const state = {
    pendingRequests: 0,
    refreshPromise: null,
    initialized: false,
  };

  /* =========================================================
     INTERCEPTORES
  ========================================================= */
  const interceptors = createInterceptorsState();

  /* =========================================================
     API DE INTERCEPTORES
  ========================================================= */
  function useRequest(fn) {
    return registerRequestInterceptor(interceptors, fn);
  }

  function useResponse(fn) {
    return registerResponseInterceptor(interceptors, fn);
  }

  function useError(fn) {
    return registerErrorInterceptor(interceptors, fn);
  }

  /* =========================================================
     REQUEST LIFECYCLE
  ========================================================= */
  async function request(method, path, options = {}) {
    let requestConfig = buildDefaultRequestConfig(
      config,
      AppCore,
      method,
      path,
      {
        ...options,
        signal: withSignal(options?.signal),
      }
    );

    let loaderWasEnabled = false;

    try {
      requestConfig = await runRequestInterceptors(interceptors, requestConfig);

      const useLoader = shouldToggleGlobalLoader(requestConfig);
      loaderWasEnabled = useLoader;

      if (shouldLogRequests(config, AppCore)) {
        AppCore.utils.log("HTTP →", buildRequestSummary(requestConfig));
      }

      if (useLoader) {
        incrementPendingRequests(AppCore, state);
        AppCore.setLoading(true);
      }

      AppCore.events.emit("http:request:start", {
        method: requestConfig.method,
        path: requestConfig.path,
        query: requestConfig.query || null,
        auth: requestConfig.auth !== false,
        useLoader,
      });

      let result;

      try {
        result = await executeWithRetry({
          AppCore,
          config,
          requestConfig,
        });
      } catch (error) {
        const normalizedInitialError = normalizeError(error, requestConfig);

        const refreshed = await runAutoRefreshIfNeeded({
          AppCore,
          Auth,
          config,
          state,
          error: normalizedInitialError,
          requestConfig,
        });

        if (refreshed) {
          const retryAfterRefreshConfig = {
            ...requestConfig,
            _skipAuthRefresh: true,
            _skipRetry: true,
            _authRefreshAttempted: true,
          };

          result = await executeBaseRequest(AppCore, retryAfterRefreshConfig);
        } else {
          throw normalizedInitialError;
        }
      }

      const response = await runResponseInterceptors(
        interceptors,
        result,
        requestConfig
      );

      AppCore.events.emit("http:request:success", {
        method: requestConfig.method,
        path: requestConfig.path,
        response,
      });

      if (shouldLogResponses(config, AppCore)) {
        AppCore.utils.log("HTTP ✓", {
          method: requestConfig.method,
          path: requestConfig.path,
          response,
        });
      }

      return response;
    } catch (error) {
      const normalized = normalizeError(error, requestConfig);

      await runErrorInterceptors(interceptors, normalized, requestConfig);

      AppCore.events.emit("http:request:error", {
        method: requestConfig?.method || method,
        path: requestConfig?.path || path,
        error: normalized,
      });

      if (shouldLogErrors(config)) {
        AppCore.utils.error("HTTP ✗", normalized);
      }

      if (
        config.autoLogoutOn401 &&
        normalized.status === 401 &&
        Auth?.isAuthenticated?.() &&
        requestConfig?._skipAuthRefresh === true
      ) {
        AppCore.utils.warn("HTTP 401 persistente → logout automático");

        try {
          await Auth.logout({
            silent: false,
            notifyServer: false,
          });
        } catch (logoutError) {
          AppCore.utils.warn(
            "No se pudo completar logout automático.",
            logoutError
          );
        }
      }

      throw normalized;
    } finally {
      if (loaderWasEnabled) {
        const pending = decrementPendingRequests(AppCore, state);

        if (pending === 0) {
          AppCore.setLoading(false);
        }
      }
    }
  }

  /* =========================================================
     MÉTODOS REST
  ========================================================= */
  function get(path, options = {}) {
    return request("GET", path, options);
  }

  function post(path, body = null, options = {}) {
    return request("POST", path, {
      ...options,
      body,
    });
  }

  function put(path, body = null, options = {}) {
    return request("PUT", path, {
      ...options,
      body,
    });
  }

  function patch(path, body = null, options = {}) {
    return request("PATCH", path, {
      ...options,
      body,
    });
  }

  function del(path, options = {}) {
    return request("DELETE", path, options);
  }

  /* =========================================================
     INIT DEFAULT INTERCEPTORS
  ========================================================= */
  function init() {
    if (state.initialized) {
      return api;
    }

    state.initialized = true;

    useRequest((requestConfig) => {
      const nextConfig = {
        ...requestConfig,
        headers: {
          ...(requestConfig.headers || {}),
          "X-Requested-With": "XMLHttpRequest",
        },
      };

      if (AppCore.config.debug) {
        AppCore.utils.log(
          "HTTP request config",
          buildRequestSummary(nextConfig)
        );
      }

      return nextConfig;
    });

    useResponse((response, requestConfig) => {
      if (AppCore.config.debug) {
        AppCore.utils.log("HTTP response interceptada", {
          method: requestConfig?.method || null,
          path: requestConfig?.path || null,
          response,
        });
      }

      return response;
    });

    useError((error, requestConfig) => {
      AppCore.utils.error("HTTP error interceptado", {
        method: requestConfig?.method || null,
        path: requestConfig?.path || null,
        error,
      });
    });

    AppCore.events.emit("http:ready", {
      config: { ...config },
    });

    return api;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  const api = {
    init,

    get,
    post,
    put,
    patch,
    delete: del,
    request,

    useRequest,
    useResponse,
    useError,

    createAbortController,
    withSignal,

    config,
    state,
  };

  return api;
})();

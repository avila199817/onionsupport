/* =========================================================
   Onion SPA - HTTP Service (PRO)
   Archivo: src/services/http.js

   Encima de AppCore.apiClient:
   - interceptores
   - retries
   - errores normalizados
   - hooks globales
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";

export const Http = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const config = {
    retries: 1,
    retryDelay: 400,
    autoRefreshOn401: true,
    autoLogoutOn401: true,
    logRequests: true,
  };

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const state = {
    pendingRequests: 0,
    refreshPromise: null,
  };

  /* =========================================================
     INTERCEPTORES
  ========================================================= */
  const interceptors = {
    request: [],
    response: [],
    error: [],
  };

  function useRequest(fn) {
    if (typeof fn !== "function") {
      throw new Error("useRequest(fn) requiere una función");
    }

    interceptors.request.push(fn);

    return () => {
      const index = interceptors.request.indexOf(fn);
      if (index >= 0) {
        interceptors.request.splice(index, 1);
      }
    };
  }

  function useResponse(fn) {
    if (typeof fn !== "function") {
      throw new Error("useResponse(fn) requiere una función");
    }

    interceptors.response.push(fn);

    return () => {
      const index = interceptors.response.indexOf(fn);
      if (index >= 0) {
        interceptors.response.splice(index, 1);
      }
    };
  }

  function useError(fn) {
    if (typeof fn !== "function") {
      throw new Error("useError(fn) requiere una función");
    }

    interceptors.error.push(fn);

    return () => {
      const index = interceptors.error.indexOf(fn);
      if (index >= 0) {
        interceptors.error.splice(index, 1);
      }
    };
  }

  /* =========================================================
     HELPERS
  ========================================================= */
  function delay(ms = config.retryDelay) {
    return AppCore.utils.sleep(ms);
  }

  function incrementPendingRequests() {
    state.pendingRequests += 1;
    return state.pendingRequests;
  }

  function decrementPendingRequests() {
    state.pendingRequests = Math.max(0, state.pendingRequests - 1);
    return state.pendingRequests;
  }

  function shouldToggleGlobalLoader(requestConfig = {}) {
    return requestConfig.useLoader !== false;
  }

  function isAuthEndpoint(path = "") {
    const value = String(path || "").toLowerCase();

    return (
      value.includes("/api/auth/login") ||
      value.includes("/api/auth/logout") ||
      value.includes("/api/auth/me") ||
      value.includes("/api/auth/refresh")
    );
  }

  function isRetryableError(error) {
    const status = Number(error?.status || 0);

    if (!status) return true;
    if (status === 408) return true;
    if (status === 429) return true;
    if (status >= 500) return true;

    return false;
  }

  function isIdempotentMethod(method = "GET") {
    return ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
  }

  function shouldRetry(error, requestConfig = {}, attempt = 0) {
    const maxRetries =
      typeof requestConfig.retries === "number"
        ? requestConfig.retries
        : config.retries;

    if (attempt >= maxRetries) return false;
    if (requestConfig.retry === false) return false;
    if (requestConfig._skipRetry === true) return false;

    const method = String(requestConfig.method || "GET").toUpperCase();
    const allowNonIdempotentRetry = requestConfig.retryUnsafe === true;

    if (!isIdempotentMethod(method) && !allowNonIdempotentRetry) {
      return false;
    }

    return isRetryableError(error);
  }

  function buildRetryDelay(requestConfig = {}, attempt = 0) {
    const baseDelay =
      typeof requestConfig.retryDelay === "number"
        ? requestConfig.retryDelay
        : config.retryDelay;

    return baseDelay * (attempt + 1);
  }

  function normalizeError(error, requestConfig = null) {
    if (!error) {
      return {
        message: "Error desconocido",
        status: 0,
        statusText: "",
        data: null,
        url: requestConfig?.path || null,
        method: requestConfig?.method || null,
        requestConfig,
        raw: error,
      };
    }

    return {
      message:
        error?.data?.message ||
        error?.data?.error ||
        error?.message ||
        error?.statusText ||
        "Error en la petición",

      status: Number(error?.status || 0),
      statusText: error?.statusText || "",
      data: error?.data || null,
      url: error?.url || requestConfig?.path || null,
      method: error?.method || requestConfig?.method || null,
      code: error?.code || null,
      requestConfig,
      raw: error,
    };
  }

  async function runRequestInterceptors(requestConfig) {
    let nextConfig = requestConfig;

    for (const interceptor of interceptors.request) {
      const result = await interceptor(nextConfig);
      nextConfig = result || nextConfig;
    }

    return nextConfig;
  }

  async function runResponseInterceptors(response, requestConfig) {
    let nextResponse = response;

    for (const interceptor of interceptors.response) {
      const result = await interceptor(nextResponse, requestConfig);
      nextResponse = result || nextResponse;
    }

    return nextResponse;
  }

  async function runErrorInterceptors(error, requestConfig) {
    for (const interceptor of interceptors.error) {
      await interceptor(error, requestConfig);
    }
  }

  async function runAutoRefreshIfNeeded(error, requestConfig) {
    if (!config.autoRefreshOn401) return false;
    if (!Auth.isAuthenticated()) return false;
    if (Number(error?.status || 0) !== 401) return false;
    if (requestConfig?._skipAuthRefresh === true) return false;
    if (isAuthEndpoint(requestConfig?.path)) return false;
    if (typeof Auth.refreshSession !== "function") return false;

    try {
      if (!state.refreshPromise) {
        state.refreshPromise = Auth.refreshSession().finally(() => {
          state.refreshPromise = null;
        });
      }

      await state.refreshPromise;
      return true;
    } catch (refreshError) {
      AppCore.utils.warn("Auto refresh falló.", refreshError);
      return false;
    }
  }

  async function executeBaseRequest(requestConfig = {}) {
    return AppCore.apiClient.request(requestConfig.path, {
      method: requestConfig.method,
      body: requestConfig.body ?? null,
      headers: requestConfig.headers ?? {},
      auth: requestConfig.auth !== false,
      timeout: requestConfig.timeout,
      raw: requestConfig.raw,
      responseType: requestConfig.responseType,
      query: requestConfig.query ?? null,
      credentials: requestConfig.credentials,
    });
  }

  async function executeWithRetry(requestConfig = {}) {
    let attempt = 0;
    let lastError = null;

    while (attempt === 0 || shouldRetry(lastError, requestConfig, attempt - 1)) {
      try {
        return await executeBaseRequest(requestConfig);
      } catch (error) {
        lastError = normalizeError(error, requestConfig);

        if (!shouldRetry(lastError, requestConfig, attempt)) {
          break;
        }

        const waitMs = buildRetryDelay(requestConfig, attempt);
        await delay(waitMs);
        attempt += 1;
      }
    }

    throw lastError;
  }

  /* =========================================================
     CORE REQUEST
  ========================================================= */
  async function request(method, path, options = {}) {
    let requestConfig = {
      method: String(method || "GET").toUpperCase(),
      path,
      body: null,
      headers: {},
      auth: true,
      timeout: AppCore.config.requestTimeout,
      raw: false,
      responseType: "auto",
      query: null,
      credentials: "same-origin",
      useLoader: true,
      retries: config.retries,
      retryDelay: config.retryDelay,
      retry: true,
      retryUnsafe: false,
      _skipRetry: false,
      _skipAuthRefresh: false,
      ...options,
    };

    const useLoader = shouldToggleGlobalLoader(requestConfig);

    try {
      requestConfig = await runRequestInterceptors(requestConfig);

      if (config.logRequests) {
        AppCore.utils.log("HTTP →", requestConfig.method, requestConfig.path, {
          query: requestConfig.query || null,
          auth: requestConfig.auth !== false,
        });
      }

      if (useLoader) {
        incrementPendingRequests();
        AppCore.setLoading(true);
      }

      let result;

      try {
        result = await executeWithRetry(requestConfig);
      } catch (error) {
        const normalizedInitialError = normalizeError(error, requestConfig);

        const refreshed = await runAutoRefreshIfNeeded(
          normalizedInitialError,
          requestConfig
        );

        if (refreshed) {
          const retryAfterRefreshConfig = {
            ...requestConfig,
            _skipAuthRefresh: true,
            _skipRetry: true,
          };

          result = await executeBaseRequest(retryAfterRefreshConfig);
        } else {
          throw normalizedInitialError;
        }
      }

      const response = await runResponseInterceptors(result, requestConfig);

      return response;
    } catch (error) {
      const normalized = normalizeError(error, requestConfig);

      await runErrorInterceptors(normalized, requestConfig);

      if (
        config.autoLogoutOn401 &&
        normalized.status === 401 &&
        Auth.isAuthenticated() &&
        requestConfig?._skipAuthRefresh === true
      ) {
        AppCore.utils.warn("Token inválido → logout automático");
        await Auth.logout({ silent: false });
      }

      throw normalized;
    } finally {
      if (useLoader) {
        const pending = decrementPendingRequests();

        if (pending === 0) {
          AppCore.setLoading(false);
        }
      }
    }
  }

  /* =========================================================
     MÉTODOS
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
     INTERCEPTORES DEFAULT
  ========================================================= */

  // Debug request
  useRequest((requestConfig) => {
    if (AppCore.config.debug) {
      AppCore.utils.log("HTTP request config", {
        method: requestConfig.method,
        path: requestConfig.path,
        query: requestConfig.query || null,
        auth: requestConfig.auth !== false,
        retries: requestConfig.retries,
      });
    }

    return requestConfig;
  });

  // Debug response
  useResponse((response) => {
    if (AppCore.config.debug) {
      AppCore.utils.log("HTTP ✓ response", response);
    }

    return response;
  });

  // Debug error
  useError((error) => {
    AppCore.utils.error("HTTP ✗ error", error);
  });

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    get,
    post,
    put,
    patch,
    delete: del,

    request,

    useRequest,
    useResponse,
    useError,

    config,
    state,
  };
})();

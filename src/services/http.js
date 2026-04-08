/* =========================================================
   Onion SPA - HTTP Service (FULL PRO SAAS PANEL)
   Archivo: src/services/http.js

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

export const Http = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const config = {
    retries: 1,
    retryDelay: 400,
    retryJitter: 120,

    autoRefreshOn401: true,
    autoLogoutOn401: true,

    logRequests: true,
    logResponses: true,
    logErrors: true,

    defaultUseLoader: true,
    defaultAuth: true,
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
  const interceptors = {
    request: [],
    response: [],
    error: [],
  };

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function isFn(value) {
    return typeof value === "function";
  }

  function isAbortError(error) {
    return (
      error?.name === "AbortError" ||
      error?.code === "ABORT_ERR" ||
      String(error?.message || "").toLowerCase().includes("aborted")
    );
  }

  function delay(ms = config.retryDelay) {
    return AppCore.utils.sleep(ms);
  }

  function incrementPendingRequests() {
    state.pendingRequests += 1;
    AppCore.events.emit("http:pending:change", {
      pending: state.pendingRequests,
    });
    return state.pendingRequests;
  }

  function decrementPendingRequests() {
    state.pendingRequests = Math.max(0, state.pendingRequests - 1);
    AppCore.events.emit("http:pending:change", {
      pending: state.pendingRequests,
    });
    return state.pendingRequests;
  }

  function shouldToggleGlobalLoader(requestConfig = {}) {
    return requestConfig.useLoader !== false;
  }

  function shouldLogRequests() {
    return Boolean(config.logRequests && AppCore.config?.debug);
  }

  function shouldLogResponses() {
    return Boolean(config.logResponses && AppCore.config?.debug);
  }

  function shouldLogErrors() {
    return Boolean(config.logErrors);
  }

  function isAuthEndpoint(path = "") {
    const value = String(path || "").toLowerCase();

    return (
      value.includes("/api/auth/login") ||
      value.includes("/api/auth/logout") ||
      value.includes("/api/auth/me") ||
      value.includes("/api/auth/refresh") ||
      value.includes("/api/auth/2fa")
    );
  }

  function isRetryableError(error) {
    if (!error) return false;
    if (isAbortError(error)) return false;

    const status = Number(error?.status || 0);

    if (!status) return true;
    if (status === 408) return true;
    if (status === 425) return true;
    if (status === 429) return true;
    if (status >= 500) return true;

    return false;
  }

  function isIdempotentMethod(method = "GET") {
    return ["GET", "HEAD", "OPTIONS"].includes(
      String(method || "GET").toUpperCase()
    );
  }

  function buildRetryDelay(requestConfig = {}, attempt = 0) {
    const baseDelay =
      typeof requestConfig.retryDelay === "number"
        ? requestConfig.retryDelay
        : config.retryDelay;

    const jitter =
      typeof requestConfig.retryJitter === "number"
        ? requestConfig.retryJitter
        : config.retryJitter;

    const randomJitter = Math.floor(Math.random() * jitter);
    return baseDelay * (attempt + 1) + randomJitter;
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
    const allowUnsafeRetry = requestConfig.retryUnsafe === true;

    if (!isIdempotentMethod(method) && !allowUnsafeRetry) {
      return false;
    }

    return isRetryableError(error);
  }

  function normalizeError(error, requestConfig = null) {
    if (!error) {
      return {
        name: "HttpError",
        message: "Error desconocido",
        status: 0,
        statusText: "",
        data: null,
        code: null,
        url: requestConfig?.path || null,
        method: requestConfig?.method || null,
        requestConfig,
        raw: error,
      };
    }

    if (error?.name === "HttpErrorNormalized") {
      return error;
    }

    const normalized = {
      name: "HttpErrorNormalized",
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
      aborted: isAbortError(error),
    };

    return normalized;
  }

  function buildRequestSummary(requestConfig = {}) {
    return {
      method: requestConfig.method,
      path: requestConfig.path,
      query: requestConfig.query || null,
      auth: requestConfig.auth !== false,
      retries: requestConfig.retries,
      useLoader: requestConfig.useLoader !== false,
      responseType: requestConfig.responseType || "auto",
    };
  }

  /* =========================================================
     INTERCEPTOR API
  ========================================================= */
  function useRequest(fn) {
    if (!isFn(fn)) {
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
    if (!isFn(fn)) {
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
    if (!isFn(fn)) {
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

  async function runRequestInterceptors(requestConfig) {
    let nextConfig = requestConfig;

    for (const interceptor of interceptors.request) {
      const result = await interceptor(nextConfig);
      if (result && typeof result === "object") {
        nextConfig = result;
      }
    }

    return nextConfig;
  }

  async function runResponseInterceptors(response, requestConfig) {
    let nextResponse = response;

    for (const interceptor of interceptors.response) {
      const result = await interceptor(nextResponse, requestConfig);
      if (result !== undefined) {
        nextResponse = result;
      }
    }

    return nextResponse;
  }

  async function runErrorInterceptors(error, requestConfig) {
    for (const interceptor of interceptors.error) {
      await interceptor(error, requestConfig);
    }
  }

  /* =========================================================
     AUTO REFRESH 401
  ========================================================= */
  async function runAutoRefreshIfNeeded(error, requestConfig) {
    if (!config.autoRefreshOn401) return false;
    if (!Auth?.isAuthenticated?.()) return false;
    if (Number(error?.status || 0) !== 401) return false;
    if (requestConfig?._skipAuthRefresh === true) return false;
    if (requestConfig?._authRefreshAttempted === true) return false;
    if (isAuthEndpoint(requestConfig?.path)) return false;
    if (!isFn(Auth?.refreshSession)) return false;

    try {
      if (!state.refreshPromise) {
        state.refreshPromise = Promise.resolve(Auth.refreshSession()).finally(
          () => {
            state.refreshPromise = null;
          }
        );
      }

      await state.refreshPromise;
      return true;
    } catch (refreshError) {
      AppCore.utils.warn("HTTP auto-refresh falló.", refreshError);
      return false;
    }
  }

  /* =========================================================
     REQUEST CORE
  ========================================================= */
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
      signal: requestConfig.signal,
    });
  }

  async function executeWithRetry(requestConfig = {}) {
    let attempt = 0;
    let lastError = null;

    while (
      attempt === 0 ||
      shouldRetry(lastError, requestConfig, attempt - 1)
    ) {
      try {
        return await executeBaseRequest(requestConfig);
      } catch (error) {
        lastError = normalizeError(error, requestConfig);

        if (!shouldRetry(lastError, requestConfig, attempt)) {
          break;
        }

        const waitMs = buildRetryDelay(requestConfig, attempt);

        AppCore.events.emit("http:retry", {
          path: requestConfig.path,
          method: requestConfig.method,
          attempt: attempt + 1,
          waitMs,
          error: lastError,
        });

        await delay(waitMs);
        attempt += 1;
      }
    }

    throw lastError;
  }

  async function request(method, path, options = {}) {
    let requestConfig = {
      method: String(method || "GET").toUpperCase(),
      path,
      body: null,
      headers: {},
      auth: config.defaultAuth,
      timeout: AppCore.config.requestTimeout,
      raw: false,
      responseType: "auto",
      query: null,
      credentials: "same-origin",
      useLoader: config.defaultUseLoader,
      retries: config.retries,
      retryDelay: config.retryDelay,
      retryJitter: config.retryJitter,
      retry: true,
      retryUnsafe: false,
      signal: null,
      meta: null,

      _skipRetry: false,
      _skipAuthRefresh: false,
      _authRefreshAttempted: false,

      ...options,
    };

    let loaderWasEnabled = false;

    try {
      requestConfig = await runRequestInterceptors(requestConfig);

      const useLoader = shouldToggleGlobalLoader(requestConfig);
      loaderWasEnabled = useLoader;

      if (shouldLogRequests()) {
        AppCore.utils.log("HTTP →", buildRequestSummary(requestConfig));
      }

      if (useLoader) {
        incrementPendingRequests();
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
            _authRefreshAttempted: true,
          };

          result = await executeBaseRequest(retryAfterRefreshConfig);
        } else {
          throw normalizedInitialError;
        }
      }

      const response = await runResponseInterceptors(result, requestConfig);

      AppCore.events.emit("http:request:success", {
        method: requestConfig.method,
        path: requestConfig.path,
        response,
      });

      if (shouldLogResponses()) {
        AppCore.utils.log("HTTP ✓", {
          method: requestConfig.method,
          path: requestConfig.path,
          response,
        });
      }

      return response;
    } catch (error) {
      const normalized = normalizeError(error, requestConfig);

      await runErrorInterceptors(normalized, requestConfig);

      AppCore.events.emit("http:request:error", {
        method: requestConfig?.method || method,
        path: requestConfig?.path || path,
        error: normalized,
      });

      if (shouldLogErrors()) {
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
          AppCore.utils.warn("No se pudo completar logout automático.", logoutError);
        }
      }

      throw normalized;
    } finally {
      if (loaderWasEnabled) {
        const pending = decrementPendingRequests();

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
     HELPERS EXTRA
  ========================================================= */
  function createAbortController() {
    return new AbortController();
  }

  function withSignal(controllerOrSignal) {
    if (!controllerOrSignal) return null;

    if (controllerOrSignal instanceof AbortController) {
      return controllerOrSignal.signal;
    }

    return controllerOrSignal;
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
        AppCore.utils.log("HTTP request config", buildRequestSummary(nextConfig));
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

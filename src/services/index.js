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

   HARDENING:
   - init idempotente
   - no doble refresh paralelo
   - no doble loader
   - no auto logout en endpoints auth
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
  };

  /* =========================================================
     INTERCEPTORS
  ========================================================= */
  const interceptors =
    createInterceptorsState();

  /* =========================================================
     HELPERS
  ========================================================= */
  function isAuthEndpoint(
    path = ""
  ) {
    const normalized = String(
      path || ""
    ).toLowerCase();

    return (
      normalized.includes("/auth/login") ||
      normalized.includes("/auth/logout") ||
      normalized.includes("/auth/refresh") ||
      normalized.includes("/auth/me")
    );
  }

  function shouldAutoLogout(
    error,
    requestConfig
  ) {
    if (
      !config.autoLogoutOn401
    ) {
      return false;
    }

    if (
      error?.status !== 401
    ) {
      return false;
    }

    if (
      !Auth?.isAuthenticated?.()
    ) {
      return false;
    }

    if (
      requestConfig?._skipAuthRefresh !==
      true
    ) {
      return false;
    }

    if (
      isAuthEndpoint(
        requestConfig?.path
      )
    ) {
      return false;
    }

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
    let requestConfig =
      buildDefaultRequestConfig(
        config,
        AppCore,
        method,
        path,
        {
          ...options,
          signal: withSignal(
            options?.signal
          ),
        }
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
        AppCore.utils.log(
          "HTTP →",
          buildRequestSummary(
            requestConfig
          )
        );
      }

      if (
        loaderEnabled
      ) {
        incrementPendingRequests(
          AppCore,
          state
        );

        if (
          state.pendingRequests ===
          1
        ) {
          AppCore.setLoading(
            true
          );
        }
      }

      AppCore.events.emit(
        "http:request:start",
        {
          method:
            requestConfig.method,
          path:
            requestConfig.path,
          query:
            requestConfig.query ||
            null,
          auth:
            requestConfig.auth !==
            false,
          useLoader:
            loaderEnabled,
        }
      );

      /* =====================
         EXECUTE
      ===================== */
      let result = null;

      try {
        result =
          await executeWithRetry({
            AppCore,
            config,
            requestConfig,
          });
      } catch (
        initialError
      ) {
        const normalizedInitialError =
          normalizeError(
            initialError,
            requestConfig
          );

        const refreshed =
          await runAutoRefreshIfNeeded(
            {
              AppCore,
              Auth,
              config,
              state,
              error:
                normalizedInitialError,
              requestConfig,
            }
          );

        if (
          refreshed
        ) {
          const retryConfig =
            {
              ...requestConfig,
              _skipRetry:
                true,
              _skipAuthRefresh:
                true,
              _authRefreshAttempted:
                true,
            };

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

      AppCore.events.emit(
        "http:request:success",
        {
          method:
            requestConfig.method,
          path:
            requestConfig.path,
          response,
        }
      );

      if (
        shouldLogResponses(
          config,
          AppCore
        )
      ) {
        AppCore.utils.log(
          "HTTP ✓",
          {
            method:
              requestConfig.method,
            path:
              requestConfig.path,
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

      await runErrorInterceptors(
        interceptors,
        normalized,
        requestConfig
      );

      AppCore.events.emit(
        "http:request:error",
        {
          method:
            requestConfig?.method ||
            method,
          path:
            requestConfig?.path ||
            path,
          error:
            normalized,
        }
      );

      if (
        shouldLogErrors(
          config
        )
      ) {
        AppCore.utils.error(
          "HTTP ✗",
          normalized
        );
      }

      /* =====================
         AUTO LOGOUT
      ===================== */
      if (
        shouldAutoLogout(
          normalized,
          requestConfig
        )
      ) {
        AppCore.utils.warn(
          "401 persistente → logout automático"
        );

        try {
          await Auth.logout({
            silent: false,
            notifyServer: false,
          });
        } catch (
          logoutError
        ) {
          AppCore.utils.warn(
            "Logout automático falló.",
            logoutError
          );
        }
      }

      throw normalized;
    } finally {
      if (
        loaderEnabled
      ) {
        const pending =
          decrementPendingRequests(
            AppCore,
            state
          );

        if (
          pending <= 0
        ) {
          AppCore.setLoading(
            false
          );
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
    if (
      state.initialized
    ) {
      return api;
    }

    state.initialized =
      true;

    /* request */
    useRequest(
      (
        requestConfig
      ) => {
        const next =
          {
            ...requestConfig,
            headers: {
              ...(requestConfig.headers ||
                {}),
              "X-Requested-With":
                "XMLHttpRequest",
            },
          };

        if (
          AppCore.config
            .debug
        ) {
          AppCore.utils.log(
            "HTTP request config",
            buildRequestSummary(
              next
            )
          );
        }

        return next;
      }
    );

    /* response */
    useResponse(
      (
        response,
        requestConfig
      ) => {
        if (
          AppCore.config
            .debug
        ) {
          AppCore.utils.log(
            "HTTP response interceptada",
            {
              method:
                requestConfig?.method ||
                null,
              path:
                requestConfig?.path ||
                null,
              response,
            }
          );
        }

        return response;
      }
    );

    /* error */
    useError(
      (
        error,
        requestConfig
      ) => {
        AppCore.utils.error(
          "HTTP error interceptado",
          {
            method:
              requestConfig?.method ||
              null,
            path:
              requestConfig?.path ||
              null,
            error,
          }
        );
      }
    );

    AppCore.events.emit(
      "http:ready",
      {
        config: {
          ...config,
        },
      }
    );

    return api;
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

    config,
    state,
  };

  return api;
})();

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
    autoLogoutOn401: true,
    logRequests: true,
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
    interceptors.request.push(fn);
  }

  function useResponse(fn) {
    interceptors.response.push(fn);
  }

  function useError(fn) {
    interceptors.error.push(fn);
  }

  /* =========================================================
     ERROR NORMALIZATION
  ========================================================= */
  function normalizeError(error) {
    if (!error) {
      return {
        message: "Error desconocido",
        status: 0,
      };
    }

    return {
      message:
        error?.data?.message ||
        error?.message ||
        error?.statusText ||
        "Error en la petición",

      status: error?.status || 0,
      data: error?.data || null,
      url: error?.url || null,
      method: error?.method || null,
      raw: error,
    };
  }

  /* =========================================================
     RETRY
  ========================================================= */
  async function retryRequest(fn, retries = config.retries) {
    let lastError;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (i === retries) break;

        await AppCore.utils.sleep(config.retryDelay);
      }
    }

    throw lastError;
  }

  /* =========================================================
     CORE REQUEST
  ========================================================= */
  async function request(method, path, options = {}) {
    let requestConfig = {
      method,
      path,
      ...options,
    };

    try {
      /* ===== REQUEST INTERCEPTORS ===== */
      for (const interceptor of interceptors.request) {
        requestConfig = (await interceptor(requestConfig)) || requestConfig;
      }

      if (config.logRequests) {
        AppCore.utils.log("HTTP →", method, requestConfig.path);
      }

      /* ===== EJECUCIÓN ===== */
      const result = await retryRequest(() =>
        AppCore.apiClient.request(requestConfig.path, {
          method: requestConfig.method,
          body: requestConfig.body,
          headers: requestConfig.headers,
          auth: requestConfig.auth !== false,
        })
      );

      /* ===== RESPONSE INTERCEPTORS ===== */
      let response = result;

      for (const interceptor of interceptors.response) {
        response = (await interceptor(response)) || response;
      }

      return response;
    } catch (error) {
      const normalized = normalizeError(error);

      /* ===== ERROR INTERCEPTORS ===== */
      for (const interceptor of interceptors.error) {
        await interceptor(normalized);
      }

      /* ===== AUTO LOGOUT ===== */
      if (
        config.autoLogoutOn401 &&
        normalized.status === 401 &&
        Auth.isAuthenticated()
      ) {
        AppCore.utils.warn("Token inválido → logout automático");
        await Auth.logout({ silent: false });
      }

      throw normalized;
    }
  }

  /* =========================================================
     MÉTODOS
  ========================================================= */
  function get(path, options = {}) {
    return request("GET", path, options);
  }

  function post(path, body = null, options = {}) {
    return request("POST", path, { ...options, body });
  }

  function put(path, body = null, options = {}) {
    return request("PUT", path, { ...options, body });
  }

  function patch(path, body = null, options = {}) {
    return request("PATCH", path, { ...options, body });
  }

  function del(path, options = {}) {
    return request("DELETE", path, options);
  }

  /* =========================================================
     INTERCEPTORES DEFAULT
  ========================================================= */

  // Loader global automático
  useRequest((config) => {
    AppCore.setLoading(true);
    return config;
  });

  useResponse((response) => {
    AppCore.setLoading(false);
    return response;
  });

  useError(() => {
    AppCore.setLoading(false);
  });

  // Debug
  useResponse((response) => {
    if (AppCore.config.debug) {
      AppCore.utils.log("HTTP ✓ response", response);
    }
    return response;
  });

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
  };
})();
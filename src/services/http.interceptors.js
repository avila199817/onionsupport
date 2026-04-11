/* =========================================================
   Onion SPA - HTTP Interceptors
   Archivo: src/services/http.interceptors.js

   Responsabilidades:
   - registrar interceptores request / response / error
   - ejecutar interceptores de request en cadena
   - ejecutar interceptores de response en cadena
   - ejecutar interceptores de error en cadena
========================================================= */

import { isFn } from "./http.helpers.js";

export function createInterceptorsState() {
  return {
    request: [],
    response: [],
    error: [],
  };
}

export function useRequest(interceptors, fn) {
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

export function useResponse(interceptors, fn) {
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

export function useError(interceptors, fn) {
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

export async function runRequestInterceptors(interceptors, requestConfig) {
  let nextConfig = requestConfig;

  for (const interceptor of interceptors.request) {
    const result = await interceptor(nextConfig);

    if (result && typeof result === "object") {
      nextConfig = result;
    }
  }

  return nextConfig;
}

export async function runResponseInterceptors(
  interceptors,
  response,
  requestConfig
) {
  let nextResponse = response;

  for (const interceptor of interceptors.response) {
    const result = await interceptor(nextResponse, requestConfig);

    if (result !== undefined) {
      nextResponse = result;
    }
  }

  return nextResponse;
}

export async function runErrorInterceptors(
  interceptors,
  error,
  requestConfig
) {
  for (const interceptor of interceptors.error) {
    await interceptor(error, requestConfig);
  }
}

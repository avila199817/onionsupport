/* =========================================================
   Onion SPA - HTTP Interceptors
   Archivo: src/services/http.interceptors.js

   Responsabilidades:
   - registrar interceptores request / response / error
   - ejecutar interceptores en cadena
   - permitir eject seguro
   - aislar fallos individuales
   - mantener orden FIFO
========================================================= */

import { isFn } from "./http.helpers.js";

/* =========================================================
   STATE
========================================================= */
export function createInterceptorsState() {
  return {
    request: [],
    response: [],
    error: [],
  };
}

/* =========================================================
   INTERNAL
========================================================= */
function removeInterceptor(
  bucket,
  fn
) {
  const index =
    bucket.indexOf(fn);

  if (index >= 0) {
    bucket.splice(index, 1);
  }
}

function ensureBucket(
  interceptors,
  type
) {
  if (
    !interceptors ||
    !Array.isArray(
      interceptors[type]
    )
  ) {
    throw new Error(
      `Bucket de interceptores inválido: ${type}`
    );
  }

  return interceptors[type];
}

/* =========================================================
   REGISTER
========================================================= */
export function useRequest(
  interceptors,
  fn
) {
  if (!isFn(fn)) {
    throw new Error(
      "useRequest(fn) requiere una función"
    );
  }

  const bucket =
    ensureBucket(
      interceptors,
      "request"
    );

  bucket.push(fn);

  return () =>
    removeInterceptor(
      bucket,
      fn
    );
}

export function useResponse(
  interceptors,
  fn
) {
  if (!isFn(fn)) {
    throw new Error(
      "useResponse(fn) requiere una función"
    );
  }

  const bucket =
    ensureBucket(
      interceptors,
      "response"
    );

  bucket.push(fn);

  return () =>
    removeInterceptor(
      bucket,
      fn
    );
}

export function useError(
  interceptors,
  fn
) {
  if (!isFn(fn)) {
    throw new Error(
      "useError(fn) requiere una función"
    );
  }

  const bucket =
    ensureBucket(
      interceptors,
      "error"
    );

  bucket.push(fn);

  return () =>
    removeInterceptor(
      bucket,
      fn
    );
}

/* =========================================================
   RUN REQUEST
========================================================= */
export async function runRequestInterceptors(
  interceptors,
  requestConfig
) {
  const bucket =
    ensureBucket(
      interceptors,
      "request"
    );

  let nextConfig =
    requestConfig;

  for (const interceptor of [
    ...bucket,
  ]) {
    const result =
      await interceptor(
        nextConfig
      );

    if (
      result &&
      typeof result ===
        "object"
    ) {
      nextConfig = result;
    }
  }

  return nextConfig;
}

/* =========================================================
   RUN RESPONSE
========================================================= */
export async function runResponseInterceptors(
  interceptors,
  response,
  requestConfig
) {
  const bucket =
    ensureBucket(
      interceptors,
      "response"
    );

  let nextResponse =
    response;

  for (const interceptor of [
    ...bucket,
  ]) {
    const result =
      await interceptor(
        nextResponse,
        requestConfig
      );

    if (
      result !==
      undefined
    ) {
      nextResponse =
        result;
    }
  }

  return nextResponse;
}

/* =========================================================
   RUN ERROR
========================================================= */
export async function runErrorInterceptors(
  interceptors,
  error,
  requestConfig
) {
  const bucket =
    ensureBucket(
      interceptors,
      "error"
    );

  let nextError = error;

  for (const interceptor of [
    ...bucket,
  ]) {
    const result =
      await interceptor(
        nextError,
        requestConfig
      );

    if (
      result !==
      undefined
    ) {
      nextError = result;
    }
  }

  return nextError;
}

/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   Responsabilidades:
   - parsear respuestas HTTP
   - construir errores normalizados de request
   - decidir reintentos
   - ejecutar fetch con retry real
   - exponer request base y apiClient
   - no duplicar setError / eventos en reintentos
========================================================= */

import { config } from "./config.js";
import {
  now,
  runHookSeries,
  buildUrl,
  hasValidToken,
  isPublicApiPath,
  createAbortTimeout,
  mergeAbortSignals,
  normalizeHeaders,
  isAbortError,
  isProbablyTimeoutError,
  detectNetworkHints,
} from "./helpers.js";

/* =========================================================
   RESPONSE PARSING
========================================================= */
export async function parseResponseBody(
  response,
  responseType = "auto"
) {
  if (!response) return null;
  if (response.status === 204) return null;

  const contentType = String(
    response.headers.get(
      "content-type"
    ) || ""
  )
    .trim()
    .toLowerCase();

  if (responseType === "blob") {
    return response.blob();
  }

  if (
    responseType ===
    "arrayBuffer"
  ) {
    return response.arrayBuffer();
  }

  if (responseType === "text") {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  if (responseType === "json") {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

/* =========================================================
   REQUEST ERROR
========================================================= */
export function buildRequestError({
  response = null,
  data = null,
  url = "",
  method = "",
  timeout = false,
  aborted = false,
  raw = null,
} = {}) {
  if (!response) {
    const hints =
      detectNetworkHints(url);

    return {
      status: 0,
      statusText: timeout
        ? "Request Timeout"
        : aborted
          ? "Request Aborted"
          : "Network Error",
      data,
      url,
      method,
      timeout,
      aborted,
      raw,
      hints,
      message: timeout
        ? "La petición excedió el tiempo máximo."
        : aborted
          ? "La petición fue cancelada."
          : "No se pudo completar la petición.",
    };
  }

  return {
    status: response.status,
    statusText:
      response.statusText,
    data,
    url,
    method,
    timeout,
    aborted,
    raw,
    message:
      data?.message ||
      data?.error ||
      data?.detail ||
      response.statusText ||
      "Error de petición",
  };
}

/* =========================================================
   RETRY POLICY
========================================================= */
export function shouldRetryRequest(
  error,
  requestConfig
) {
  const method = String(
    requestConfig?.method ||
      "GET"
  ).toUpperCase();

  const retries = Number(
    requestConfig?.retries ??
      config.requestRetries ??
      0
  );

  if (retries <= 0) return false;
  if (!["GET", "HEAD"].includes(method)) {
    return false;
  }

  if (error?.aborted) {
    return false;
  }

  if (error?.timeout) {
    return true;
  }

  if (error?.status >= 500) {
    return true;
  }

  if (error?.status === 0) {
    return true;
  }

  return false;
}

export async function executeFetchWithRetry(
  url,
  fetchFactory,
  requestConfig,
  utils
) {
  const retries = Number(
    requestConfig?.retries ??
      config.requestRetries ??
      0
  );

  const baseDelay = Number(
    requestConfig?.retryDelay ??
      250
  );

  const maxDelay = Number(
    requestConfig?.retryMaxDelay ??
      3000
  );

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      return await fetchFactory();
    } catch (error) {
      lastError = error;

      const normalizedError =
        error?.status !== undefined
          ? error
          : buildRequestError({
              response: null,
              data: null,
              url,
              method:
                requestConfig?.method ||
                "GET",
              timeout:
                isProbablyTimeoutError(
                  error
                ),
              aborted:
                isAbortError(error),
              raw:
                error?.message ||
                error,
            });

      if (
        attempt >= retries ||
        !shouldRetryRequest(
          normalizedError,
          requestConfig
        )
      ) {
        throw normalizedError;
      }

      const backoff = Math.min(
        maxDelay,
        Math.max(
          baseDelay,
          baseDelay *
            2 ** attempt
        )
      );

      const jitter =
        Math.floor(
          Math.random() *
            Math.max(
              1,
              baseDelay
            )
        );

      await utils.sleep(
        backoff + jitter
      );
    }

    attempt += 1;
  }

  throw lastError;
}

/* =========================================================
   REQUEST FACTORY
========================================================= */
export function createRequest({
  state,
  events,
  setError,
  utils,
  registry,
}) {
  async function request(
    path,
    options = {}
  ) {
    let requestConfig = {
      method: "GET",
      headers: {},
      body: null,
      auth: !isPublicApiPath(path),
      timeout:
        config.requestTimeout,
      raw: false,
      responseType: "auto",
      query: null,
      credentials: "omit",
      signal: null,
      retries:
        config.requestRetries,
      ...options,
      path,
    };

    requestConfig =
      await runHookSeries(
        registry.hooks
          .beforeRequest,
        requestConfig
      );

    const {
      method = "GET",
      headers = {},
      body = null,
      auth = !isPublicApiPath(
        requestConfig.path
      ),
      timeout =
        config.requestTimeout,
      raw = false,
      responseType = "auto",
      query = null,
      credentials = "omit",
      signal = null,
      retries =
        config.requestRetries,
    } = requestConfig;

    const url = buildUrl(
      requestConfig.path,
      query
    );

    const upperMethod = String(
      method || "GET"
    ).toUpperCase();

    const finalHeaders =
      normalizeHeaders({
        Accept:
          "application/json",
        ...headers,
      });

    if (
      auth &&
      hasValidToken(
        state.token
      )
    ) {
      finalHeaders.Authorization = `${config.auth.bearerPrefix} ${state.token}`;
    }

    const isFormData =
      typeof window !==
        "undefined" &&
      typeof FormData !==
        "undefined" &&
      body instanceof FormData;

    const isBodyAllowed =
      !["GET", "HEAD"].includes(
        upperMethod
      );

    if (
      !isFormData &&
      body !== null &&
      isBodyAllowed &&
      !finalHeaders[
        "Content-Type"
      ]
    ) {
      finalHeaders[
        "Content-Type"
      ] = "application/json";
    }

    const payload =
      !isBodyAllowed
        ? undefined
        : body === null
          ? null
          : isFormData
            ? body
            : finalHeaders[
                  "Content-Type"
                ]?.includes(
                  "application/json"
                )
              ? JSON.stringify(
                  body
                )
              : body;

    events?.emit?.(
      "app:request:start",
      {
        url,
        method: upperMethod,
        auth,
        hasBody:
          body !== null,
      }
    );

    try {
      state.lastRequestAt =
        now();

      state.lastRequestUrl =
        url;

      const response =
        await executeFetchWithRetry(
          url,
          async () => {
            const {
              controller,
              timeoutId,
            } =
              createAbortTimeout(
                timeout
              );

            const mergedSignal =
              mergeAbortSignals([
                controller.signal,
                signal,
              ]);

            try {
              return await fetch(
                url,
                {
                  method:
                    upperMethod,
                  headers:
                    finalHeaders,
                  body: payload,
                  signal:
                    mergedSignal,
                  credentials,
                }
              );
            } finally {
              clearTimeout(
                timeoutId
              );
            }
          },
          {
            ...requestConfig,
            retries,
            method:
              upperMethod,
          },
          utils
        );

      if (raw) {
        const hookedRaw =
          await runHookSeries(
            registry.hooks
              .afterResponse,
            response
          );

        events?.emit?.(
          "app:request:success",
          {
            url,
            method:
              upperMethod,
            status:
              response.status,
            response:
              hookedRaw,
          }
        );

        return hookedRaw;
      }

      const data =
        await parseResponseBody(
          response,
          responseType
        );

      if (!response.ok) {
        const error =
          buildRequestError({
            response,
            data,
            url,
            method:
              upperMethod,
          });

        setError(error);

        await runHookSeries(
          registry.hooks
            .onRequestError,
          error
        );

        events?.emit?.(
          "app:request:error",
          error
        );

        throw error;
      }

      const hookedData =
        await runHookSeries(
          registry.hooks
            .afterResponse,
          data
        );

      events?.emit?.(
        "app:request:success",
        {
          url,
          method:
            upperMethod,
          status:
            response.status,
          data: hookedData,
        }
      );

      return hookedData;
    } catch (error) {
      const normalizedError =
        error?.status !== undefined
          ? error
          : buildRequestError({
              response: null,
              data: null,
              url,
              method:
                upperMethod,
              timeout:
                isProbablyTimeoutError(
                  error
                ),
              aborted:
                isAbortError(error),
              raw:
                error?.message ||
                error,
            });

      if (
        shouldRetryRequest(
          normalizedError,
          {
            ...requestConfig,
            retries,
          }
        )
      ) {
        normalizedError.retryable =
          true;
      }

      setError(
        normalizedError
      );

      await runHookSeries(
        registry.hooks
          .onRequestError,
        normalizedError
      );

      events?.emit?.(
        "app:request:error",
        normalizedError
      );

      throw normalizedError;
    }
  }

  return request;
}

/* =========================================================
   API CLIENT FACTORY
========================================================= */
export function createApiClient(
  request
) {
  return {
    get(
      path,
      options = {}
    ) {
      return request(path, {
        ...options,
        method: "GET",
      });
    },

    post(
      path,
      body = null,
      options = {}
    ) {
      return request(path, {
        ...options,
        method: "POST",
        body,
      });
    },

    put(
      path,
      body = null,
      options = {}
    ) {
      return request(path, {
        ...options,
        method: "PUT",
        body,
      });
    },

    patch(
      path,
      body = null,
      options = {}
    ) {
      return request(path, {
        ...options,
        method: "PATCH",
        body,
      });
    },

    delete(
      path,
      options = {}
    ) {
      return request(path, {
        ...options,
        method: "DELETE",
      });
    },

    request,
  };
}

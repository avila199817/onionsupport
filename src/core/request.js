/* =========================================================
   Onion SPA - Core Request
   Archivo: src/core/request.js

   RESPONSABILIDADES:
   - parsear respuestas HTTP
   - construir errores normalizados
   - decidir reintentos
   - ejecutar fetch con retry real
   - exponer request base y apiClient
   - no duplicar setError / eventos en retries

   HARDENING EXTREMO:
   - single emit final
   - timeout real con AbortController
   - merge signals robusto
   - json/text/blob/arrayBuffer auto
   - dedupe GET/HEAD
   - retry enterprise con backoff+jitter
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
   RESPONSE PARSER
========================================================= */

export async function parseResponseBody(
  response,
  responseType = "auto"
) {
  if (!response) return null;
  if (
    response.status === 204 ||
    response.status === 205
  ) {
    return null;
  }

  const contentType = String(
    response.headers?.get?.(
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
    ) ||
    contentType.includes(
      "+json"
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
   ERROR FACTORY
========================================================= */

export function buildRequestError({
  response = null,
  data = null,
  url = "",
  method = "GET",
  timeout = false,
  aborted = false,
  raw = null,
} = {}) {
  if (!response) {
    const hints =
      detectNetworkHints(url);

    return {
      ok: false,
      status: 0,
      statusText: timeout
        ? "Request Timeout"
        : aborted
          ? "Request Aborted"
          : "Network Error",
      url,
      method,
      timeout,
      aborted,
      raw,
      data,
      hints,
      message: timeout
        ? "La petición excedió el tiempo máximo."
        : aborted
          ? "La petición fue cancelada."
          : "No se pudo completar la petición.",
    };
  }

  return {
    ok: false,
    status:
      response.status,
    statusText:
      response.statusText ||
      "Request Error",
    url,
    method,
    timeout,
    aborted,
    raw,
    data,
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
  requestConfig = {}
) {
  const retries = Number(
    requestConfig?.retries ??
      config.requestRetries ??
      0
  );

  if (retries <= 0) {
    return false;
  }

  const method = String(
    requestConfig?.method ||
      "GET"
  ).toUpperCase();

  if (
    !["GET", "HEAD"].includes(
      method
    )
  ) {
    return false;
  }

  if (error?.aborted) {
    return false;
  }

  if (error?.timeout) {
    return true;
  }

  if (error?.status === 0) {
    return true;
  }

  if (error?.status === 429) {
    return true;
  }

  if (
    error?.status >= 500
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   FETCH WITH RETRY
========================================================= */

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
      300
  );

  const maxDelay = Number(
    requestConfig?.retryMaxDelay ??
      4000
  );

  let attempt = 0;
  let lastError = null;

  while (
    attempt <= retries
  ) {
    try {
      return await fetchFactory(
        attempt
      );
    } catch (error) {
      lastError = error;

      const normalized =
        error?.status !==
        undefined
          ? error
          : buildRequestError({
              url,
              method:
                requestConfig?.method ||
                "GET",
              timeout:
                isProbablyTimeoutError(
                  error
                ),
              aborted:
                isAbortError(
                  error
                ),
              raw:
                error?.message ||
                error,
            });

      const canRetry =
        shouldRetryRequest(
          normalized,
          requestConfig
        );

      if (
        attempt >= retries ||
        !canRetry
      ) {
        throw normalized;
      }

      const exponential =
        baseDelay *
        2 ** attempt;

      const backoff =
        Math.min(
          maxDelay,
          exponential
        );

      const jitter =
        Math.floor(
          Math.random() *
            baseDelay
        );

      const delayMs =
        backoff + jitter;

      try {
        requestConfig?.onRetry?.({
          url,
          error:
            normalized,
          attempt,
          nextAttempt:
            attempt + 1,
          retries,
          delayMs,
        });
      } catch {}

      await utils.sleep(
        delayMs
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
  let requestSequence = 0;

  const inFlightRequests =
    new Map();

  function stableStringify(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (
      typeof value !==
      "object"
    ) {
      return String(value);
    }

    if (
      Array.isArray(value)
    ) {
      return `[${value
        .map((item) =>
          stableStringify(
            item
          )
        )
        .join(",")}]`;
    }

    const keys =
      Object.keys(value).sort();

    return `{${keys
      .map(
        (key) =>
          `${key}:${stableStringify(
            value[key]
          )}`
      )
      .join("|")}}`;
  }

  function buildFingerprint({
    method,
    url,
    payload,
    headers,
    auth,
  }) {
    return [
      method,
      url,
      auth
        ? "auth"
        : "public",
      stableStringify(
        headers || {}
      ),
      typeof payload ===
      "string"
        ? payload
        : stableStringify(
            payload
          ),
    ].join("::");
  }

  async function request(
    path,
    options = {}
  ) {
    const startedAt =
      Date.now();

    const requestId =
      `req_${++requestSequence}`;

    let requestConfig = {
      method: "GET",
      headers: {},
      body: null,
      auth: !isPublicApiPath(
        path
      ),
      timeout:
        config.requestTimeout,
      raw: false,
      responseType: "auto",
      query: null,
      credentials:
        "omit",
      signal: null,
      retries:
        config.requestRetries,
      retryDelay: 300,
      retryMaxDelay: 4000,
      dedupe: true,
      ...options,
      path,
    };

    requestConfig =
      await runHookSeries(
        registry.hooks
          .beforeRequest,
        requestConfig
      );

    const method = String(
      requestConfig.method ||
        "GET"
    ).toUpperCase();

    const url = buildUrl(
      requestConfig.path,
      requestConfig.query
    );

    const finalHeaders =
      normalizeHeaders({
        Accept:
          "application/json",
        ...requestConfig.headers,
      });

    if (
      requestConfig.auth &&
      hasValidToken(
        state?.token
      )
    ) {
      finalHeaders.Authorization =
        `${config.auth.bearerPrefix} ${state.token}`;
    }

    const isFormData =
      typeof FormData !==
        "undefined" &&
      requestConfig.body instanceof
        FormData;

    const bodyAllowed =
      !["GET", "HEAD"].includes(
        method
      );

    if (
      bodyAllowed &&
      requestConfig.body !==
        null &&
      !isFormData &&
      !finalHeaders[
        "Content-Type"
      ]
    ) {
      finalHeaders[
        "Content-Type"
      ] =
        "application/json";
    }

    const payload =
      !bodyAllowed
        ? undefined
        : requestConfig.body ===
          null
          ? null
          : isFormData
            ? requestConfig.body
            : String(
                finalHeaders[
                  "Content-Type"
                ] || ""
              ).includes(
                  "application/json"
                )
              ? JSON.stringify(
                  requestConfig.body
                )
              : requestConfig.body;

    const canDedupe =
      requestConfig.dedupe !==
        false &&
      ["GET", "HEAD"].includes(
        method
      );

    const requestFingerprint =
      canDedupe
        ? buildFingerprint({
            method,
            url,
            payload,
            headers:
              finalHeaders,
            auth:
              requestConfig.auth,
          })
        : null;

    if (
      requestFingerprint &&
      inFlightRequests.has(
        requestFingerprint
      )
    ) {
      events?.emit?.(
        "app:request:deduped",
        {
          requestId,
          url,
          method,
          dedupeKey:
            requestFingerprint,
        }
      );

      return inFlightRequests.get(
        requestFingerprint
      );
    }

    events?.emit?.(
      "app:request:start",
      {
        requestId,
        url,
        method,
        auth:
          requestConfig.auth,
        hasBody:
          requestConfig.body !==
          null,
      }
    );

    const requestPromise =
      (async () => {
        let retryCount = 0;

        try {
          state.lastRequestAt =
            now();

          state.lastRequestUrl =
            url;

          const response =
            await executeFetchWithRetry(
              url,
              async (
                attempt = 0
              ) => {
                retryCount =
                  Math.max(
                    retryCount,
                    attempt
                  );

                const {
                  controller,
                  timeoutId,
                } =
                  createAbortTimeout(
                    requestConfig.timeout
                  );

                const mergedSignal =
                  mergeAbortSignals(
                    [
                      controller.signal,
                      requestConfig.signal,
                    ]
                  );

                try {
                  return await fetch(
                    url,
                    {
                      method,
                      headers:
                        finalHeaders,
                      body:
                        payload,
                      credentials:
                        requestConfig.credentials,
                      signal:
                        mergedSignal,
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
                onRetry:
                  (
                    retryMeta
                  ) => {
                    events?.emit?.(
                      "app:request:retry",
                      {
                        requestId,
                        url,
                        method,
                        ...retryMeta,
                      }
                    );
                  },
              },
              utils
            );

          if (
            requestConfig.raw ===
            true
          ) {
            const hookedRaw =
              await runHookSeries(
                registry.hooks
                  .afterResponse,
                response
              );

            events?.emit?.(
              "app:request:success",
              {
                requestId,
                url,
                method,
                status:
                  response.status,
                attempts:
                  retryCount + 1,
                durationMs:
                  Date.now() -
                  startedAt,
              }
            );

            return hookedRaw;
          }

          const data =
            await parseResponseBody(
              response,
              requestConfig.responseType
            );

          if (
            !response.ok
          ) {
            throw buildRequestError({
              response,
              data,
              url,
              method,
            });
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
              requestId,
              url,
              method,
              status:
                response.status,
              data:
                hookedData,
              attempts:
                retryCount + 1,
              durationMs:
                Date.now() -
                startedAt,
            }
          );

          return hookedData;
        } catch (error) {
          const normalized =
            error?.status !==
            undefined
              ? error
              : buildRequestError({
                  url,
                  method,
                  timeout:
                    isProbablyTimeoutError(
                      error
                    ),
                  aborted:
                    isAbortError(
                      error
                    ),
                  raw:
                    error?.message ||
                    error,
                });

          normalized.retryable =
            shouldRetryRequest(
              normalized,
              requestConfig
            );

          normalized.requestId =
            requestId;

          normalized.durationMs =
            Date.now() -
            startedAt;

          setError?.(
            normalized
          );

          await runHookSeries(
            registry.hooks
              .onRequestError,
            normalized
          );

          events?.emit?.(
            "app:request:error",
            normalized
          );

          throw normalized;
        }
      })();

    if (
      requestFingerprint
    ) {
      inFlightRequests.set(
        requestFingerprint,
        requestPromise
      );
    }

    try {
      return await requestPromise;
    } finally {
      if (
        requestFingerprint
      ) {
        inFlightRequests.delete(
          requestFingerprint
        );
      }
    }
  }

  return request;
}

/* =========================================================
   API CLIENT
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

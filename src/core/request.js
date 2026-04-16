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
   - protección hooks
   - cleanup total de inflight map
   - errores consistentes
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
   BASICS
========================================================= */

function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeEmit(
  events,
  eventName,
  payload = {}
) {
  try {
    events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

async function safeRunHooks(
  hooks,
  payload
) {
  try {
    return await runHookSeries(
      hooks,
      payload
    );
  } catch {
    return payload;
  }
}

function sleep(ms = 0) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        Math.max(
          0,
          safeNumber(ms, 0)
        )
      )
  );
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

export async function parseResponseBody(
  response,
  responseType = "auto"
) {
  if (!response) {
    return null;
  }

  if (
    response.status === 204 ||
    response.status === 205
  ) {
    return null;
  }

  const contentType = safeText(
    response.headers?.get?.(
      "content-type"
    ),
    ""
  ).toLowerCase();

  try {
    if (
      responseType ===
      "blob"
    ) {
      return await response.blob();
    }

    if (
      responseType ===
      "arrayBuffer"
    ) {
      return await response.arrayBuffer();
    }

    if (
      responseType ===
      "text"
    ) {
      return await response.text();
    }

    if (
      responseType ===
      "json"
    ) {
      return await response.json();
    }

    if (
      contentType.includes(
        "application/json"
      ) ||
      contentType.includes(
        "+json"
      )
    ) {
      return await response.json();
    }

    if (
      contentType.includes(
        "application/octet-stream"
      )
    ) {
      return await response.arrayBuffer();
    }

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
  const status =
    response?.status || 0;

  const statusText =
    safeText(
      response?.statusText,
      timeout
        ? "Request Timeout"
        : aborted
          ? "Request Aborted"
          : "Network Error"
    );

  const message =
    safeText(
      data?.message ||
        data?.error ||
        data?.detail ||
        raw,
      statusText
    );

  return {
    ok: false,
    status,
    statusText,
    url,
    method:
      safeText(
        method,
        "GET"
      ).toUpperCase(),
    timeout:
      timeout === true,
    aborted:
      aborted === true,
    raw,
    data,
    hints:
      status === 0
        ? detectNetworkHints(
            url
          )
        : null,
    message,
  };
}

/* =========================================================
   RETRY POLICY
========================================================= */

export function shouldRetryRequest(
  error,
  requestConfig = {}
) {
  const retries =
    safeNumber(
      requestConfig?.retries ??
        config.requestRetries,
      0
    );

  if (retries <= 0) {
    return false;
  }

  const method =
    safeText(
      requestConfig?.method,
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

  if (
    error?.status === 0
  ) {
    return true;
  }

  if (
    error?.status === 408 ||
    error?.status === 429
  ) {
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
  requestConfig = {},
  utils = {}
) {
  const retries =
    safeNumber(
      requestConfig?.retries ??
        config.requestRetries,
      0
    );

  const baseDelay =
    safeNumber(
      requestConfig?.retryDelay,
      300
    );

  const maxDelay =
    safeNumber(
      requestConfig?.retryMaxDelay,
      4000
    );

  const sleeper =
    utils?.sleep ||
    sleep;

  let attempt = 0;

  while (
    attempt <= retries
  ) {
    try {
      return await fetchFactory(
        attempt
      );
    } catch (error) {
      const normalized =
        error?.status !==
        undefined
          ? error
          : buildRequestError({
              url,
              method:
                requestConfig.method,
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

      const retry =
        shouldRetryRequest(
          normalized,
          requestConfig
        );

      if (
        attempt >= retries ||
        !retry
      ) {
        throw normalized;
      }

      const backoff =
        Math.min(
          maxDelay,
          baseDelay *
            2 ** attempt
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

      await sleeper(
        delayMs
      );

      attempt += 1;
    }
  }

  throw buildRequestError({
    url,
    method:
      requestConfig.method,
  });
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
        .map(
          stableStringify
        )
        .join(",")}]`;
    }

    return `{${Object.keys(
      value
    )
      .sort()
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
    headers,
    payload,
    auth,
  }) {
    return [
      method,
      url,
      auth
        ? "auth"
        : "public",
      stableStringify(
        headers
      ),
      stableStringify(
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
      responseType:
        "auto",
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
      await safeRunHooks(
        registry?.hooks
          ?.beforeRequest,
        requestConfig
      );

    const method =
      safeText(
        requestConfig.method,
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
                ]
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

    const dedupeKey =
      canDedupe
        ? buildFingerprint({
            method,
            url,
            headers:
              finalHeaders,
            payload,
            auth:
              requestConfig.auth,
          })
        : null;

    if (
      dedupeKey &&
      inFlightRequests.has(
        dedupeKey
      )
    ) {
      safeEmit(
        events,
        "app:request:deduped",
        {
          requestId,
          url,
          method,
          dedupeKey,
        }
      );

      return inFlightRequests.get(
        dedupeKey
      );
    }

    safeEmit(
      events,
      "app:request:start",
      {
        requestId,
        url,
        method,
      }
    );

    const promise =
      (async () => {
        let attempts = 1;

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
                attempts =
                  attempt + 1;

                const {
                  controller,
                  timeoutId,
                } =
                  createAbortTimeout(
                    requestConfig.timeout
                  );

                const signal =
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
                      signal,
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
                method,
                onRetry:
                  (
                    retryMeta
                  ) =>
                    safeEmit(
                      events,
                      "app:request:retry",
                      {
                        requestId,
                        url,
                        method,
                        ...retryMeta,
                      }
                    ),
              },
              utils
            );

          if (
            requestConfig.raw ===
            true
          ) {
            safeEmit(
              events,
              "app:request:success",
              {
                requestId,
                url,
                method,
                status:
                  response.status,
                attempts,
                durationMs:
                  Date.now() -
                  startedAt,
              }
            );

            return response;
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

          const finalData =
            await safeRunHooks(
              registry?.hooks
                ?.afterResponse,
              data
            );

          safeEmit(
            events,
            "app:request:success",
            {
              requestId,
              url,
              method,
              status:
                response.status,
              attempts,
              durationMs:
                Date.now() -
                startedAt,
            }
          );

          return finalData;
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

          normalized.requestId =
            requestId;

          normalized.durationMs =
            Date.now() -
            startedAt;

          normalized.retryable =
            shouldRetryRequest(
              normalized,
              requestConfig
            );

          try {
            setError?.(
              normalized
            );
          } catch {}

          await safeRunHooks(
            registry?.hooks
              ?.onRequestError,
            normalized
          );

          safeEmit(
            events,
            "app:request:error",
            normalized
          );

          throw normalized;
        }
      })();

    if (dedupeKey) {
      inFlightRequests.set(
        dedupeKey,
        promise
      );
    }

    try {
      return await promise;
    } finally {
      if (dedupeKey) {
        inFlightRequests.delete(
          dedupeKey
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

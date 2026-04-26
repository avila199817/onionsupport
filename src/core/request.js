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
   - json/text/blob/arrayBuffer/formData auto
   - dedupe GET/HEAD
   - retry enterprise con backoff+jitter
   - retry HTTP real para 408/425/429/5xx
   - soporte Retry-After
   - protección hooks
   - cleanup total de inflight map
   - errores consistentes
   - eventos sin tokens reales
   - compat con registry.hooks como funciones o entradas { handler }

   NOTA IMPORTANTE:
   - este módulo NO decide qué endpoints existen.
   - si aparecen 404 en /facturas, /users, /clients, etc.,
     el origen está en el caller/vista/servicio que invoca esos paths.
========================================================= */

import { config } from "./config.js";

import {
  now,
  buildUrl,
  hasValidToken,
  isPublicApiPath,
  createAbortTimeout,
  mergeAbortSignals,
  normalizeHeaders,
  isAbortError,
  isProbablyTimeoutError,
  detectNetworkHints,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_METHOD =
  "GET";

const DEFAULT_RESPONSE_TYPE =
  "auto";

const DEFAULT_RETRY_DELAY_MS =
  300;

const DEFAULT_RETRY_MAX_DELAY_MS =
  4000;

const RETRYABLE_HTTP_STATUSES =
  Object.freeze([
    408,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

const BODYLESS_METHODS =
  Object.freeze([
    "GET",
    "HEAD",
  ]);

const JSON_CONTENT_TYPES =
  Object.freeze([
    "application/json",
    "+json",
  ]);

const TEXT_CONTENT_TYPES =
  Object.freeze([
    "text/",
    "application/xml",
    "application/xhtml+xml",
    "application/csv",
    "application/javascript",
    "application/x-javascript",
  ]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeText(value, fallback = "") {
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

function safeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  return Boolean(fallback);
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "");
  }
}

function safeEmit(events, eventName, payload = {}) {
  try {
    events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(utils, ...args) {
  try {
    utils?.warn?.(
      "[Request]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[Request]",
      ...args
    );
  } catch {}
}

function sleep(ms = 0) {
  return new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(
        0,
        safeNumber(ms, 0)
      )
    )
  );
}

function normalizeMethod(method = DEFAULT_METHOD) {
  return safeText(
    method,
    DEFAULT_METHOD
  ).toUpperCase();
}

function isBodyAllowed(method = DEFAULT_METHOD) {
  return !BODYLESS_METHODS.includes(
    normalizeMethod(method)
  );
}

/* =========================================================
   HEADERS
========================================================= */

function getHeader(headers, name) {
  const target =
    safeText(name).toLowerCase();

  if (!target) {
    return undefined;
  }

  const source =
    safeObject(headers);

  const key =
    Object.keys(source).find((item) =>
      safeText(item).toLowerCase() === target
    );

  return key
    ? source[key]
    : undefined;
}

function hasHeader(headers, name) {
  return getHeader(
    headers,
    name
  ) !== undefined;
}

function setHeader(headers, name, value) {
  if (
    !headers ||
    !name
  ) {
    return headers;
  }

  const target =
    safeText(name).toLowerCase();

  const existingKey =
    Object.keys(headers).find((item) =>
      safeText(item).toLowerCase() === target
    );

  headers[existingKey || name] =
    value;

  return headers;
}

function deleteHeader(headers, name) {
  if (
    !headers ||
    !name
  ) {
    return headers;
  }

  const target =
    safeText(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (
      safeText(key).toLowerCase() === target
    ) {
      delete headers[key];
    }
  }

  return headers;
}

function sanitizeHeadersForLog(headers = {}) {
  const output =
    {};

  for (const [key, value] of Object.entries(headers || {})) {
    const lower =
      safeText(key).toLowerCase();

    if (
      lower === "authorization" ||
      lower === "cookie" ||
      lower === "set-cookie" ||
      lower.includes("token")
    ) {
      output[key] =
        "***";
    } else {
      output[key] =
        value;
    }
  }

  return output;
}

/* =========================================================
   STATUS / CONTENT
========================================================= */

function isExpectedStatus(status, expectedStatuses) {
  const list =
    safeArray(expectedStatuses)
      .map((item) =>
        safeNumber(item, -1)
      )
      .filter((item) =>
        item >= 100 &&
        item <= 599
      );

  return list.includes(
    safeNumber(status, 0)
  );
}

function contentTypeIncludes(contentType = "", fragments = []) {
  const value =
    safeText(contentType, "").toLowerCase();

  return safeArray(fragments).some((fragment) =>
    value.includes(fragment)
  );
}

function responseHasBody(response) {
  if (!response) {
    return false;
  }

  if (
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   RESPONSE PARSER
========================================================= */

export async function parseResponseBody(response, responseType = DEFAULT_RESPONSE_TYPE) {
  if (
    !response ||
    !responseHasBody(response)
  ) {
    return null;
  }

  const finalType =
    safeText(
      responseType,
      DEFAULT_RESPONSE_TYPE
    );

  const contentType =
    safeText(
      response.headers?.get?.("content-type"),
      ""
    ).toLowerCase();

  try {
    if (finalType === "blob") {
      return await response.blob();
    }

    if (
      finalType === "arrayBuffer" ||
      finalType === "arraybuffer"
    ) {
      return await response.arrayBuffer();
    }

    if (finalType === "formData") {
      return await response.formData();
    }

    if (finalType === "text") {
      return await response.text();
    }

    if (finalType === "json") {
      const text =
        await response.text();

      if (!safeText(text, "")) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (
      contentTypeIncludes(
        contentType,
        JSON_CONTENT_TYPES
      )
    ) {
      const text =
        await response.text();

      if (!safeText(text, "")) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    if (
      contentType.includes("multipart/form-data")
    ) {
      return await response.formData();
    }

    if (
      contentType.includes("application/octet-stream")
    ) {
      return await response.arrayBuffer();
    }

    if (
      contentTypeIncludes(
        contentType,
        TEXT_CONTENT_TYPES
      )
    ) {
      return await response.text();
    }

    return await response.text();
  } catch {
    return null;
  }
}

/* =========================================================
   ERROR FACTORY
========================================================= */

function extractDataMessage(data = null) {
  if (!data) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  if (!isObject(data)) {
    return safeText(data, "");
  }

  return (
    safeText(data.message, "") ||
    safeText(data.error, "") ||
    safeText(data.detail, "") ||
    safeText(data.title, "") ||
    safeText(data.reason, "") ||
    safeText(data.description, "") ||
    safeText(data.errors?.[0]?.message, "") ||
    safeText(data.errors?.[0], "")
  );
}

function readResponseHeaders(response = null) {
  const output =
    {};

  try {
    response?.headers?.forEach?.((value, key) => {
      output[key] =
        value;
    });
  } catch {}

  return output;
}

export function buildRequestError({
  response = null,
  data = null,
  url = "",
  method = DEFAULT_METHOD,
  timeout = false,
  aborted = false,
  raw = null,
  requestId = "",
  attempt = 0,
  attempts = 0,
} = {}) {
  const status =
    safeNumber(
      response?.status,
      0
    );

  const statusText =
    safeText(
      response?.statusText,
      timeout
        ? "Request Timeout"
        : aborted
          ? "Request Aborted"
          : status === 0
            ? "Network Error"
            : "HTTP Error"
    );

  const dataMessage =
    extractDataMessage(data);

  const rawMessage =
    typeof raw === "string"
      ? raw
      : raw?.message ||
        raw?.reason ||
        "";

  const message =
    safeText(
      dataMessage ||
        rawMessage,
      statusText
    );

  const finalMethod =
    normalizeMethod(method);

  return {
    name:
      "RequestError",

    ok:
      false,

    status,

    statusText,

    url,

    redactedUrl:
      safeRedact(url),

    method:
      finalMethod,

    timeout:
      timeout === true,

    aborted:
      aborted === true,

    raw,

    data,

    headers:
      readResponseHeaders(response),

    hints:
      status === 0
        ? detectNetworkHints(url)
        : null,

    message,

    requestId:
      safeText(requestId, ""),

    attempt:
      safeNumber(attempt, 0),

    attempts:
      safeNumber(attempts, 0),

    at:
      new Date().toISOString(),
  };
}

/* =========================================================
   RETRY POLICY
========================================================= */

function parseRetryAfterMs(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return 0;
  }

  const seconds =
    Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(
      0,
      seconds * 1000
    );
  }

  const dateMs =
    Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(
      0,
      dateMs - Date.now()
    );
  }

  return 0;
}

export function shouldRetryRequest(error, requestConfig = {}) {
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
    normalizeMethod(
      requestConfig?.method
    );

  if (
    !BODYLESS_METHODS.includes(method)
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

  return RETRYABLE_HTTP_STATUSES.some((status) => {
    if (status === 500) {
      return error?.status >= 500;
    }

    return error?.status === status;
  });
}

function computeRetryDelayMs(error, attempt, requestConfig = {}) {
  const baseDelay =
    safeNumber(
      requestConfig?.retryDelay ??
        requestConfig?.retryDelayMs ??
        config.requestRetryDelayMs ??
        DEFAULT_RETRY_DELAY_MS,
      DEFAULT_RETRY_DELAY_MS
    );

  const maxDelay =
    safeNumber(
      requestConfig?.retryMaxDelay ??
        requestConfig?.retryMaxDelayMs ??
        DEFAULT_RETRY_MAX_DELAY_MS,
      DEFAULT_RETRY_MAX_DELAY_MS
    );

  const retryAfterMs =
    parseRetryAfterMs(
      error?.headers?.["retry-after"] ||
      error?.headers?.["Retry-After"] ||
      ""
    );

  if (retryAfterMs > 0) {
    return Math.min(
      maxDelay,
      retryAfterMs
    );
  }

  const backoff =
    Math.min(
      maxDelay,
      baseDelay * 2 ** attempt
    );

  const jitter =
    Math.floor(
      Math.random() * baseDelay
    );

  return Math.min(
    maxDelay,
    backoff + jitter
  );
}

/* =========================================================
   FETCH WITH RETRY
========================================================= */

export async function executeFetchWithRetry(url, fetchFactory, requestConfig = {}, utils = {}) {
  const retries =
    safeNumber(
      requestConfig?.retries ??
        config.requestRetries,
      0
    );

  const sleeper =
    utils?.sleep ||
    sleep;

  let attempt =
    0;

  let lastError =
    null;

  while (attempt <= retries) {
    try {
      return await fetchFactory(attempt);
    } catch (error) {
      const normalized =
        error?.status !== undefined
          ? error
          : buildRequestError({
              url,
              method:
                requestConfig.method,
              timeout:
                isProbablyTimeoutError(error),
              aborted:
                isAbortError(error),
              raw:
                error?.message ||
                error,
              attempt,
              attempts:
                attempt + 1,
            });

      normalized.attempt =
        attempt;

      normalized.attempts =
        attempt + 1;

      lastError =
        normalized;

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

      const delayMs =
        computeRetryDelayMs(
          normalized,
          attempt,
          requestConfig
        );

      try {
        requestConfig?.onRetry?.({
          url,
          redactedUrl:
            safeRedact(url),
          error:
            normalized,
          attempt,
          nextAttempt:
            attempt + 1,
          retries,
          delayMs,
        });
      } catch {}

      await sleeper(delayMs);

      attempt += 1;
    }
  }

  throw (
    lastError ||
    buildRequestError({
      url,
      method:
        requestConfig.method,
    })
  );
}

/* =========================================================
   HOOKS
========================================================= */

async function safeRunHooks(hooks, payload, context = {}) {
  const list =
    safeArray(hooks);

  if (!list.length) {
    return payload;
  }

  let current =
    payload;

  for (const item of list) {
    const handler =
      isFunction(item)
        ? item
        : isFunction(item?.handler)
          ? item.handler
          : null;

    if (!handler) {
      continue;
    }

    if (item?.enabled === false) {
      continue;
    }

    try {
      const result =
        await handler(
          current,
          {
            ...context,
            hook:
              item,
          }
        );

      if (result !== undefined) {
        current =
          result;
      }

      if (item?.once === true) {
        item.enabled =
          false;
      }
    } catch (error) {
      safeWarn(
        context?.utils,
        "Hook request falló.",
        error
      );

      if (context?.stopOnHookError === true) {
        throw error;
      }
    }
  }

  return current;
}

/* =========================================================
   BODY SERIALIZATION
========================================================= */

function isFormDataBody(value) {
  return (
    typeof FormData !== "undefined" &&
    value instanceof FormData
  );
}

function isUrlSearchParamsBody(value) {
  return (
    typeof URLSearchParams !== "undefined" &&
    value instanceof URLSearchParams
  );
}

function isBlobBody(value) {
  return (
    typeof Blob !== "undefined" &&
    value instanceof Blob
  );
}

function isArrayBufferBody(value) {
  return (
    typeof ArrayBuffer !== "undefined" &&
    value instanceof ArrayBuffer
  );
}

function isPlainObject(value) {
  return isObject(value);
}

function serializeBody({
  method,
  body,
  headers,
} = {}) {
  if (!isBodyAllowed(method)) {
    return undefined;
  }

  if (
    body === null ||
    body === undefined
  ) {
    return undefined;
  }

  if (isFormDataBody(body)) {
    deleteHeader(
      headers,
      "Content-Type"
    );

    return body;
  }

  if (isUrlSearchParamsBody(body)) {
    if (
      !hasHeader(
        headers,
        "Content-Type"
      )
    ) {
      setHeader(
        headers,
        "Content-Type",
        "application/x-www-form-urlencoded;charset=UTF-8"
      );
    }

    return body;
  }

  if (
    isBlobBody(body) ||
    isArrayBufferBody(body)
  ) {
    return body;
  }

  if (typeof body === "string") {
    return body;
  }

  const contentType =
    safeText(
      getHeader(
        headers,
        "Content-Type"
      ),
      ""
    ).toLowerCase();

  if (
    isPlainObject(body) ||
    Array.isArray(body)
  ) {
    if (
      !hasHeader(
        headers,
        "Content-Type"
      )
    ) {
      setHeader(
        headers,
        "Content-Type",
        "application/json"
      );
    }

    if (
      contentType.includes("application/json") ||
      !contentType
    ) {
      return JSON.stringify(body);
    }
  }

  return body;
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
} = {}) {
  let requestSequence =
    0;

  const inFlightRequests =
    new Map();

  const stats = {
    total:
      0,

    success:
      0,

    error:
      0,

    deduped:
      0,

    retry:
      0,

    lastRequestAt:
      0,

    lastUrl:
      "",

    lastError:
      null,
  };

  function stableStringify(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (typeof value !== "object") {
      return String(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(",")}]`;
    }

    return `{${Object.keys(value)
      .sort()
      .map((key) =>
        `${key}:${stableStringify(value[key])}`
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
      auth ? "auth" : "public",
      stableStringify(
        sanitizeHeadersForLog(headers)
      ),
      stableStringify(payload),
    ].join("::");
  }

  function buildBaseConfig(path, options = {}) {
    const opts =
      safeObject(options);

    return {
      method:
        DEFAULT_METHOD,

      headers:
        {},

      body:
        null,

      auth:
        !isPublicApiPath(path),

      timeout:
        config.requestTimeout,

      raw:
        false,

      responseType:
        DEFAULT_RESPONSE_TYPE,

      query:
        opts.query ?? opts.params ?? null,

      credentials:
        config?.api?.withCredentials
          ? "include"
          : "omit",

      signal:
        null,

      retries:
        config.requestRetries,

      retryDelay:
        config.requestRetryDelayMs ??
        DEFAULT_RETRY_DELAY_MS,

      retryMaxDelay:
        DEFAULT_RETRY_MAX_DELAY_MS,

      dedupe:
        true,

      silent:
        false,

      emitEvents:
        true,

      storeError:
        true,

      expectedStatuses:
        [],

      cache:
        undefined,

      mode:
        undefined,

      redirect:
        undefined,

      referrerPolicy:
        undefined,

      keepalive:
        undefined,

      ...opts,

      path,
    };
  }

  async function request(path, options = {}) {
    const startedAt =
      Date.now();

    const requestId =
      `req_${++requestSequence}`;

    const baseConfig =
      buildBaseConfig(
        path,
        options
      );

    let requestConfig =
      await safeRunHooks(
        registry?.hooks?.beforeRequest,
        baseConfig,
        {
          phase:
            "beforeRequest",
          requestId,
          utils,
        }
      );

    requestConfig = {
      ...baseConfig,
      ...safeObject(
        requestConfig,
        baseConfig
      ),
    };

    const method =
      normalizeMethod(
        requestConfig.method
      );

    const url =
      buildUrl(
        requestConfig.path,
        requestConfig.query
      );

    const redactedUrl =
      safeRedact(url);

    const finalHeaders =
      normalizeHeaders({
        Accept:
          "application/json",
        ...safeObject(
          requestConfig.headers
        ),
      });

    if (
      requestConfig.auth &&
      hasValidToken(state?.token)
    ) {
      setHeader(
        finalHeaders,
        "Authorization",
        `${config.auth.bearerPrefix} ${state.token}`
      );
    }

    const payload =
      serializeBody({
        method,
        body:
          requestConfig.body,
        headers:
          finalHeaders,
      });

    const canDedupe =
      requestConfig.dedupe !== false &&
      BODYLESS_METHODS.includes(method);

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
      inFlightRequests.has(dedupeKey)
    ) {
      stats.deduped += 1;

      if (requestConfig.emitEvents !== false) {
        safeEmit(
          events,
          "app:request:deduped",
          {
            requestId,
            url:
              redactedUrl,
            method,
            dedupeKey,
          }
        );
      }

      return inFlightRequests.get(dedupeKey);
    }

    stats.total += 1;
    stats.lastRequestAt =
      startedAt;
    stats.lastUrl =
      redactedUrl;

    if (requestConfig.emitEvents !== false) {
      safeEmit(
        events,
        "app:request:start",
        {
          requestId,
          url:
            redactedUrl,
          method,
          auth:
            Boolean(requestConfig.auth),
          headers:
            sanitizeHeadersForLog(finalHeaders),
        }
      );
    }

    const promise =
      (async () => {
        let attempts =
          1;

        try {
          if (
            state &&
            typeof state === "object"
          ) {
            state.lastRequestAt =
              now();

            state.lastRequestUrl =
              redactedUrl;

            state.lastRequestMethod =
              method;
          }

          const response =
            await executeFetchWithRetry(
              url,
              async (attempt = 0) => {
                attempts =
                  attempt + 1;

                const timeout =
                  createAbortTimeout(
                    requestConfig.timeout
                  );

                const signal =
                  mergeAbortSignals([
                    timeout.signal ||
                      timeout.controller?.signal,
                    requestConfig.signal,
                  ]);

                try {
                  if (!isFunction(fetch)) {
                    throw new Error(
                      "Fetch API no disponible."
                    );
                  }

                  const currentResponse =
                    await fetch(
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
                        cache:
                          requestConfig.cache,
                        mode:
                          requestConfig.mode,
                        redirect:
                          requestConfig.redirect,
                        referrerPolicy:
                          requestConfig.referrerPolicy,
                        keepalive:
                          requestConfig.keepalive,
                      }
                    );

                  const allowedStatus =
                    isExpectedStatus(
                      currentResponse.status,
                      requestConfig.expectedStatuses
                    );

                  if (
                    requestConfig.raw !== true &&
                    !currentResponse.ok &&
                    !allowedStatus
                  ) {
                    const errorData =
                      await parseResponseBody(
                        currentResponse,
                        requestConfig.responseType
                      );

                    throw buildRequestError({
                      response:
                        currentResponse,
                      data:
                        errorData,
                      url,
                      method,
                      requestId,
                      attempt,
                      attempts,
                    });
                  }

                  return currentResponse;
                } catch (error) {
                  if (error?.status !== undefined) {
                    throw error;
                  }

                  throw buildRequestError({
                    url,
                    method,
                    timeout:
                      isProbablyTimeoutError(error) ||
                      timeout.controller?.signal?.aborted === true &&
                        String(timeout.controller?.signal?.reason || "").includes("timeout"),
                    aborted:
                      isAbortError(error),
                    raw:
                      error?.message ||
                      error,
                    requestId,
                    attempt,
                    attempts,
                  });
                } finally {
                  try {
                    timeout.clear?.();
                  } catch {}

                  try {
                    if (timeout.timeoutId) {
                      clearTimeout(timeout.timeoutId);
                    }
                  } catch {}
                }
              },
              {
                ...requestConfig,
                method,
                onRetry:
                  (retryMeta) => {
                    stats.retry += 1;

                    if (requestConfig.emitEvents === false) {
                      return;
                    }

                    safeEmit(
                      events,
                      "app:request:retry",
                      {
                        requestId,
                        url:
                          redactedUrl,
                        method,
                        attempt:
                          retryMeta.attempt,
                        nextAttempt:
                          retryMeta.nextAttempt,
                        retries:
                          retryMeta.retries,
                        delayMs:
                          retryMeta.delayMs,
                        status:
                          retryMeta.error?.status || 0,
                        message:
                          retryMeta.error?.message || "",
                      }
                    );
                  },
              },
              utils
            );

          if (requestConfig.raw === true) {
            stats.success += 1;

            if (requestConfig.emitEvents !== false) {
              safeEmit(
                events,
                "app:request:success",
                {
                  requestId,
                  url:
                    redactedUrl,
                  method,
                  status:
                    response.status,
                  attempts,
                  durationMs:
                    Date.now() - startedAt,
                  raw:
                    true,
                }
              );
            }

            return response;
          }

          const data =
            await parseResponseBody(
              response,
              requestConfig.responseType
            );

          const allowedStatus =
            isExpectedStatus(
              response.status,
              requestConfig.expectedStatuses
            );

          if (
            !response.ok &&
            !allowedStatus
          ) {
            throw buildRequestError({
              response,
              data,
              url,
              method,
              requestId,
              attempts,
            });
          }

          const finalData =
            await safeRunHooks(
              registry?.hooks?.afterResponse,
              data,
              {
                phase:
                  "afterResponse",
                requestId,
                utils,
                response,
                requestConfig:
                  {
                    ...requestConfig,
                    url:
                      redactedUrl,
                    headers:
                      sanitizeHeadersForLog(finalHeaders),
                  },
              }
            );

          stats.success += 1;

          if (requestConfig.emitEvents !== false) {
            safeEmit(
              events,
              "app:request:success",
              {
                requestId,
                url:
                  redactedUrl,
                method,
                status:
                  response.status,
                attempts,
                durationMs:
                  Date.now() - startedAt,
              }
            );
          }

          return finalData;
        } catch (error) {
          const normalized =
            error?.status !== undefined
              ? error
              : buildRequestError({
                  url,
                  method,
                  timeout:
                    isProbablyTimeoutError(error),
                  aborted:
                    isAbortError(error),
                  raw:
                    error?.message ||
                    error,
                  requestId,
                  attempts,
                });

          normalized.requestId =
            requestId;

          normalized.url =
            normalized.url || url;

          normalized.redactedUrl =
            redactedUrl;

          normalized.durationMs =
            Date.now() - startedAt;

          normalized.attempts =
            normalized.attempts || attempts;

          normalized.retryable =
            shouldRetryRequest(
              normalized,
              requestConfig
            );

          stats.error += 1;

          stats.lastError =
            {
              ...normalized,
              url:
                redactedUrl,
              raw:
                undefined,
            };

          const silent =
            safeBoolean(
              requestConfig.silent,
              false
            );

          if (
            !silent &&
            requestConfig.storeError !== false
          ) {
            try {
              setError?.(normalized);
            } catch {}
          }

          if (!silent) {
            await safeRunHooks(
              registry?.hooks?.onRequestError,
              normalized,
              {
                phase:
                  "onRequestError",
                requestId,
                utils,
                requestConfig:
                  {
                    ...requestConfig,
                    url:
                      redactedUrl,
                    headers:
                      sanitizeHeadersForLog(finalHeaders),
                  },
              }
            );
          }

          if (
            !silent &&
            requestConfig.emitEvents !== false
          ) {
            safeEmit(
              events,
              "app:request:error",
              {
                ...normalized,
                url:
                  redactedUrl,
                redactedUrl,
              }
            );
          }

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
        inFlightRequests.delete(dedupeKey);
      }
    }
  }

  request.getSnapshot =
    function getRequestSnapshot() {
      return {
        sequence:
          requestSequence,

        inFlight:
          inFlightRequests.size,

        stats:
          safeClone(
            stats,
            {}
          ),

        at:
          new Date().toISOString(),
      };
    };

  request.clearInFlight =
    function clearInFlight() {
      const count =
        inFlightRequests.size;

      inFlightRequests.clear();

      return count;
    };

  return request;
}

/* =========================================================
   API CLIENT
========================================================= */

export function createApiClient(request) {
  function withMethod(method, path, bodyOrOptions = null, maybeOptions = {}) {
    const finalMethod =
      normalizeMethod(method);

    if (BODYLESS_METHODS.includes(finalMethod)) {
      return request(path, {
        ...safeObject(bodyOrOptions),
        method:
          finalMethod,
      });
    }

    return request(path, {
      ...safeObject(maybeOptions),
      method:
        finalMethod,
      body:
        bodyOrOptions,
    });
  }

  return {
    get(path, options = {}) {
      return withMethod(
        "GET",
        path,
        options
      );
    },

    head(path, options = {}) {
      return withMethod(
        "HEAD",
        path,
        options
      );
    },

    post(path, body = null, options = {}) {
      return withMethod(
        "POST",
        path,
        body,
        options
      );
    },

    put(path, body = null, options = {}) {
      return withMethod(
        "PUT",
        path,
        body,
        options
      );
    },

    patch(path, body = null, options = {}) {
      return withMethod(
        "PATCH",
        path,
        body,
        options
      );
    },

    delete(path, options = {}) {
      return withMethod(
        "DELETE",
        path,
        options
      );
    },

    del(path, options = {}) {
      return withMethod(
        "DELETE",
        path,
        options
      );
    },

    upload(path, formData, options = {}) {
      return request(path, {
        ...options,
        method:
          options.method || "POST",
        body:
          formData,
      });
    },

    raw(path, options = {}) {
      return request(path, {
        ...options,
        raw:
          true,
      });
    },

    request,

    getSnapshot() {
      return request.getSnapshot?.() || null;
    },

    clearInFlight() {
      return request.clearInFlight?.() || 0;
    },
  };
}

export default {
  createRequest,
  createApiClient,
  parseResponseBody,
  buildRequestError,
  shouldRetryRequest,
  executeFetchWithRetry,
};

/* =========================================================
   Onion Support - Services HTTP Request
   Archivo: /src/services/http.request.js

   Responsabilidad:
   - Bridge mínimo de compat para Services.
   - Delegar siempre en src/core/http.js.
   - Sin fetch propio.
   - Sin parser propio.
   - Sin retry propio.
   - Sin URL builder propio.
   - Sin refresh.
   - Sin logout.
   - Sin loader.
   - Sin Router.
   - Sin Toast.
   - Sin storage.
   - Sin interceptors.
   - Sin magia negra.
========================================================= */

import CoreHttp from "../core/http.js";

export const HTTP_REQUEST_ENGINE_VERSION = "simple";

const DEFAULT_METHOD = "GET";

let sequence = 0;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function method(value = DEFAULT_METHOD) {
  const clean = text(value, DEFAULT_METHOD).toUpperCase();

  return ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(clean)
    ? clean
    : DEFAULT_METHOD;
}

function nextRequestId() {
  sequence += 1;
  return `svc_req_${sequence}_${Date.now()}`;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   NORMALIZE
========================================================= */

function requestPath(config = {}) {
  if (!isObject(config)) return "";

  return text(
    config.path ||
      config.url ||
      config.endpoint ||
      config.href ||
      config.input ||
      config.resource ||
      "",
    ""
  );
}

function requestBody(config = {}) {
  if (!isObject(config)) return undefined;

  if (config.body !== undefined) return config.body;
  if (config.data !== undefined) return config.data;
  if (config.payload !== undefined) return config.payload;

  return undefined;
}

function normalizeConfig(config = {}) {
  const source = isObject(config) ? config : {};
  const finalMethod = method(source.method);
  const body = requestBody(source);

  return {
    ...source,
    method: finalMethod,
    ...(body !== undefined ? { body } : {}),
    requestId: source.requestId || nextRequestId(),
  };
}

function normalizeDirectArgs(firstArg = "/", secondArg = {}, thirdArg = {}) {
  if (isObject(firstArg)) {
    return {
      path: requestPath(firstArg),
      options: normalizeConfig({
        ...firstArg,
        ...(isObject(secondArg) ? secondArg : {}),
      }),
    };
  }

  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof secondArg === "string"
  ) {
    return {
      path: secondArg,
      options: normalizeConfig({
        ...(isObject(thirdArg) ? thirdArg : {}),
        method: firstArg,
      }),
    };
  }

  return {
    path: text(firstArg, ""),
    options: normalizeConfig(secondArg),
  };
}

function normalizeMethodArgs(finalMethod = "GET", endpoint = "/", bodyOrOptions = undefined, maybeOptions = undefined) {
  const cleanMethod = method(finalMethod);

  if (["GET", "HEAD", "OPTIONS"].includes(cleanMethod)) {
    return {
      path: endpoint,
      options: normalizeConfig({
        ...(isObject(bodyOrOptions) ? bodyOrOptions : {}),
        method: cleanMethod,
      }),
    };
  }

  if (cleanMethod === "DELETE" && maybeOptions === undefined && isObject(bodyOrOptions)) {
    return {
      path: endpoint,
      options: normalizeConfig({
        ...bodyOrOptions,
        method: cleanMethod,
      }),
    };
  }

  return {
    path: endpoint,
    options: normalizeConfig({
      ...(isObject(maybeOptions) ? maybeOptions : {}),
      method: cleanMethod,
      body: bodyOrOptions,
    }),
  };
}

/* =========================================================
   ERROR
========================================================= */

function createEngineError(code = "HTTP_REQUEST_ERROR", message = "HTTP request error.", patch = {}) {
  const error = new Error(message);

  error.name = "HttpRequestEngineError";
  error.code = code;
  error.status = patch.status || 0;
  error.statusCode = error.status;
  error.method = patch.method || "";
  error.path = redact(patch.path || "");
  error.requestId = patch.requestId || "";

  return error;
}

function normalizeError(error, options = {}, path = "") {
  if (error instanceof Error) {
    try {
      if (!error.requestId && options.requestId) {
        error.requestId = options.requestId;
      }
    } catch {
      // noop
    }

    return error;
  }

  return createEngineError(
    "HTTP_REQUEST_ERROR",
    text(error?.message || error, "HTTP request error."),
    {
      status: error?.status || error?.statusCode || 0,
      method: options.method,
      path,
      requestId: options.requestId,
    }
  );
}

/* =========================================================
   CORE DELEGATION
========================================================= */

async function callCore(path = "/", options = {}) {
  const cleanPath = text(path, "");
  const cleanOptions = normalizeConfig(options);

  if (!cleanPath) {
    throw createEngineError("HTTP_INVALID_PATH", "HTTP request sin path válido.", {
      method: cleanOptions.method,
      requestId: cleanOptions.requestId,
    });
  }

  if (isFunction(CoreHttp?.request)) {
    return CoreHttp.request(cleanPath, cleanOptions);
  }

  throw createEngineError("HTTP_ENGINE_UNAVAILABLE", "CoreHttp.request no disponible.", {
    path: cleanPath,
    method: cleanOptions.method,
    requestId: cleanOptions.requestId,
  });
}

/* =========================================================
   PUBLIC ENGINE
========================================================= */

export async function executeBaseRequest(_AppCore = null, requestConfig = {}) {
  const config = normalizeConfig(requestConfig);
  const path = requestPath(config);

  try {
    return await callCore(path, config);
  } catch (error) {
    throw normalizeError(error, config, path);
  }
}

export function executeWithRetry({
  AppCore = null,
  requestConfig = {},
} = {}) {
  return executeBaseRequest(AppCore, requestConfig);
}

/* =========================================================
   DIRECT HELPERS
========================================================= */

export function request(AppCore = null, firstArg = "/", secondArg = {}, thirdArg = {}) {
  const parsed = normalizeDirectArgs(firstArg, secondArg, thirdArg);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function get(AppCore = null, endpoint = "/", options = {}) {
  const parsed = normalizeMethodArgs("GET", endpoint, options);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function head(AppCore = null, endpoint = "/", options = {}) {
  const parsed = normalizeMethodArgs("HEAD", endpoint, options);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function options(AppCore = null, endpoint = "/", requestOptions = {}) {
  const parsed = normalizeMethodArgs("OPTIONS", endpoint, requestOptions);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function post(AppCore = null, endpoint = "/", body = undefined, requestOptions = {}) {
  const parsed = normalizeMethodArgs("POST", endpoint, body, requestOptions);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function put(AppCore = null, endpoint = "/", body = undefined, requestOptions = {}) {
  const parsed = normalizeMethodArgs("PUT", endpoint, body, requestOptions);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function patch(AppCore = null, endpoint = "/", body = undefined, requestOptions = {}) {
  const parsed = normalizeMethodArgs("PATCH", endpoint, body, requestOptions);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

export function del(AppCore = null, endpoint = "/", bodyOrOptions = {}, maybeOptions = undefined) {
  const parsed = normalizeMethodArgs("DELETE", endpoint, bodyOrOptions, maybeOptions);

  return executeBaseRequest(AppCore, {
    ...parsed.options,
    path: parsed.path,
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpRequestEngineSnapshot() {
  return {
    version: HTTP_REQUEST_ENGINE_VERSION,

    sequence,

    delegatesToCoreHttp: true,

    transport: {
      hasCoreHttp: Boolean(CoreHttp),
      hasRequest: isFunction(CoreHttp?.request),
    },

    policy: {
      bridgeOnly: true,
      ownFetch: false,
      ownUrlBuilder: false,
      ownRetry: false,
      ownParser: false,
      ownRefresh: false,
      ownLogout: false,
      ownLoader: false,
      ownInterceptors: false,
      ownStorage: false,
      ownRouter: false,
      ownToast: false,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  HTTP_REQUEST_ENGINE_VERSION,

  executeBaseRequest,
  executeWithRetry,

  request,
  get,
  head,
  options,
  post,
  put,
  patch,
  delete: del,
  del,

  getHttpRequestEngineSnapshot,
};
